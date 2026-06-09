import { useStore } from '../store';
import { isDesktop, getElectronBridge } from '../lib/environment';
import { generateUUID } from '../utils/uuid';

export function getOrCreateDeviceId(): string {
  let id = localStorage.getItem('local_sync_device_id');
  if (!id) {
    id = generateUUID('dev');
    localStorage.setItem('local_sync_device_id', id);
  }
  return id;
}

export function getSavedToken(ip: string, port: number): string {
  return localStorage.getItem(`local_sync_token_${ip}_${port}`) || '';
}

class NetworkService {
  private static instance: NetworkService;
  private autoStartInterval: any = null;
  private activeWs: WebSocket | null = null;
  private reconnectTimeout: any = null;
  private isInitialized = false;
  private lastLoggedErrors: Record<string, number> = {};

  private logThrottled(key: string, description: string, actionType: string, riskLevel: 'baixo' | 'médio' | 'alto' = 'baixo', status: 'sucesso' | 'bloqueado' | 'erro' = 'sucesso', throttleMs: number = 60000) {
    const now = Date.now();
    const lastLogged = this.lastLoggedErrors[key] || 0;
    if (now - lastLogged > throttleMs) {
      this.lastLoggedErrors[key] = now;
      useStore.getState().logAction({
        module: 'Sincronização',
        actionType: actionType as any,
        description,
        status,
        riskLevel
      });
    }
  }

  private constructor() {}

  static getInstance(): NetworkService {
    if (!NetworkService.instance) {
      NetworkService.instance = new NetworkService();
    }
    return NetworkService.instance;
  }

  /**
   * Initializes the network service and attempts to start the local server if in desktop mode
   */
  async initialize() {
    if (this.isInitialized) {
      console.log('[NetworkService] Already initialized. Skipping initialization.');
      return;
    }
    this.isInitialized = true;
    if (isDesktop()) {
      await this.startLocalServer();
      
      // Keep checking status every 30 seconds
      if (this.autoStartInterval) clearInterval(this.autoStartInterval);
      this.autoStartInterval = setInterval(() => {
        if (typeof document !== 'undefined' && document.hidden) return;
        const store = useStore.getState();
        if (!store.currentUser) {
          this.destroy();
          return;
        }
        this.checkStatus();
      }, 30000);
    } else {
      // For mobile/browser clients, check if we have a saved server
      const store = useStore.getState();
      if (store.localNetwork.remoteServer) {
        this.verifyRemoteConnection();
      }
    }
  }

  /**
   * Submits secure pairing authorization request using PIN code
   */
  async requestPairing(targetIp: string, targetPort: number, pin: string, customDeviceName?: string) {
    const store = useStore.getState();
    const deviceId = getOrCreateDeviceId();
    
    let deviceType = 'Web';
    if (isDesktop()) {
      deviceType = 'Desktop';
    } else if (typeof navigator !== 'undefined' && navigator.userAgent.toLowerCase().includes('android')) {
      deviceType = 'Android APK';
    }

    const currentUser = store.currentUser?.fullName || store.currentUser?.login || 'Operador Local';
    const name = customDeviceName || store.localNetwork.remoteServer?.deviceName || `Dispositivo ${deviceId.slice(-4).toUpperCase()}`;

    const payload = {
      deviceId,
      name,
      type: deviceType,
      operator: currentUser,
      pin
    };

    const targetUrl = `http://${targetIp}:${targetPort}`;
    console.log(`[NetworkService] Submitting pairing request to ${targetUrl}/api/pairing/request`, payload);

    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), 6000);

    try {
      const res = await fetch(`${targetUrl}/api/pairing/request`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload),
        signal: controller.signal
      });
      clearTimeout(id);

      const responseData = await res.json();
      if (!res.ok) {
        return { success: false, error: responseData.error || `Erro HTTP ${res.status}` };
      }

      if (responseData.success) {
        if (responseData.status === 'trusted') {
          if (responseData.token && typeof responseData.token === 'string' && responseData.token.trim() !== '') {
            localStorage.setItem(`local_sync_token_${targetIp}_${targetPort}`, responseData.token);
            return { success: true, status: 'trusted', token: responseData.token };
          } else {
            console.error('[NetworkService/requestPairing] Dispositivo marcado como trusted, mas nenhum token de autenticação válido foi recebido!', responseData);
          }
        } else if (responseData.status === 'pending') {
          return { success: true, status: 'pending', message: responseData.message };
        }
      }
      return { success: false, error: responseData.error || 'Erro inesperado na autenticação.' };
    } catch (e: any) {
      clearTimeout(id);
      console.error('[NetworkService] Failed pairing request:', e);
      return { success: false, error: `Não foi possível conectar ao servidor: ${e.message}` };
    }
  }

  /**
   * Polls approval status from the core PC principal
   */
  async checkPairingStatus(targetIp: string, targetPort: number) {
    const deviceId = getOrCreateDeviceId();
    const targetUrl = `http://${targetIp}:${targetPort}/api/pairing/check-status?deviceId=${deviceId}`;
    
    try {
      const res = await fetch(targetUrl);
      if (!res.ok) return { success: false, status: 'error' };
      const data = await res.json();
      if (data.success) {
        if (data.status === 'trusted') {
          if (data.token && typeof data.token === 'string' && data.token.trim() !== '') {
            localStorage.setItem(`local_sync_token_${targetIp}_${targetPort}`, data.token);
          } else {
            console.error('[NetworkService/checkPairingStatus] Dispositivo aprovado pelo servidor principal, mas nenhum token de autenticação válido foi retornado!', data);
          }
        }
        return data;
      }
      return { success: false, status: 'error', error: data.error };
    } catch (err) {
      return { success: false, status: 'error' };
    }
  }

  /**
   * Establishes real WebSocket and health connection with PC Server
   */
  async verifyRemoteConnection() {
    const store = useStore.getState();
    const server = store.localNetwork.remoteServer;
    
    if (!server || store.localNetwork.mode !== 'client') return;

    // Clear previous setups
    if (this.activeWs) {
      try {
        this.activeWs.close();
      } catch (e) {}
      this.activeWs = null;
    }
    if (this.reconnectTimeout) clearTimeout(this.reconnectTimeout);

    try {
      store.updateLocalNetworkStatus({ connectionStatus: 'connecting' });

      // 1. Perform health check fetch to the Express Server
      const controller = new AbortController();
      const id = setTimeout(() => controller.abort(), 4000); // 4s timeout

      const targetUrl = `http://${server.ip}:${server.port}`;
      console.log(`[NetworkService] Pinging status: ${targetUrl}/api/health`);

      const res = await fetch(`${targetUrl}/api/health`, {
        signal: controller.signal,
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/json'
        }
      });
      clearTimeout(id);

      if (!res.ok) {
        if (res.status === 401 || res.status === 403) {
          this.logThrottled(
            'auth_failed', 
            `Acesso rejeitado pelo PC Central (${targetUrl}): Credenciais/Token de sincronização expirados ou inválidos para este dispositivo. Re-pareamento necessário.`,
            'erro',
            'alto',
            'erro',
            60000
          );
        } else {
          this.logThrottled(
            'ping_failed_http', 
            `Resposta de erro do PC Central (${targetUrl}): Código de status HTTP ${res.status}. Tentando reconectar...`,
            'erro',
            'médio',
            'erro',
            60000
          );
        }
        throw new Error(`Servidor respondeu com código HTTP de erro: ${res.status}`);
      }

      const info = await res.json();
      console.log(`[NetworkService] Server ping response:`, info);

      // 2. Successful fetch! Establish real WebSocket connection
      // Standardize ws/wss matching location protocol
      const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const wsUrl = `${wsProtocol}//${server.ip}:${server.port}`;
      
      console.log(`[NetworkService] Connecting WebSocket to: ${wsUrl}`);
      const ws = new WebSocket(wsUrl);
      this.activeWs = ws;

      const deviceId = getOrCreateDeviceId();
      const token = getSavedToken(server.ip, server.port);

      ws.onopen = () => {
        console.log(`[NetworkService] WebSocket connection fully established. Sending client handshake credentials.`);
        store.updateLocalNetworkStatus({ connectionStatus: 'connected' });
        
        // Log WebSocket connection successfully established (not throttled, because it is state transition)
        useStore.getState().logAction({
          module: 'Sincronização',
          actionType: 'login',
          description: `Conexão em tempo real (WebSocket) estabelecida com sucesso com o PC Central no endereço: ${wsUrl}`,
          status: 'sucesso',
          riskLevel: 'baixo'
        });

        // Notify of our presence with client_handshake
        ws.send(JSON.stringify({
          event: 'client_handshake',
          data: {
            deviceId,
            token,
            deviceName: server.deviceName || 'Aparelho Cliente',
            userAgent: navigator.userAgent
          }
        }));
      };

      ws.onmessage = (event) => {
        try {
          const packet = JSON.parse(event.data);
          console.log(`[NetworkService] Event received from server:`, packet);
          // Broadcast basic events into frontend. Let's send a custom browser event
          // so other screens can notice active sync traffic!
          const browserEvent = new CustomEvent('sync_traffic_received', { detail: packet });
          window.dispatchEvent(browserEvent);
        } catch (e) {
          console.log(`[NetworkService] Raw message received:`, event.data);
        }
      };

      ws.onerror = (err) => {
        console.error('[NetworkService] Client ws errored:', err);
        store.updateLocalNetworkStatus({ connectionStatus: 'error' });
        this.logThrottled(
          'ws_error',
          `Falha de conexão / Erro de transporte no soquete (WebSocket) com o PC Central (${wsUrl}). Verifique a conectividade com o roteador local.`,
          'erro',
          'alto',
          'erro',
          60000
        );
      };

      ws.onclose = (event) => {
        console.log('[NetworkService] WebSocket closed.', event);
        const wasConnected = store.localNetwork.connectionStatus === 'connected';
        if (wasConnected) {
          store.updateLocalNetworkStatus({ connectionStatus: 'error' });
          useStore.getState().logAction({
            module: 'Sincronização',
            actionType: 'logout',
            description: `A conexão em tempo real (WebSocket) com o PC Central (${wsUrl}) foi encerrada de forma imprevista pela rede. Iniciando reconexão automática...`,
            status: 'erro',
            riskLevel: 'alto'
          });
        }
        
        // Auto-reconnect after 5 seconds if still in client mode
        if (store.localNetwork.mode === 'client') {
          this.reconnectTimeout = setTimeout(() => {
            this.verifyRemoteConnection();
          }, 5000);
        }
      };

    } catch (e: any) {
      console.error('[NetworkService] Connection setup failed:', e);
      store.updateLocalNetworkStatus({ connectionStatus: 'error' });
      
      const targetUrl = `http://${server.ip}:${server.port}`;
      this.logThrottled(
        'conn_setup_failed',
        `PC Central (${targetUrl}) desconectado ou indisponível: ${e.message || e}. Modificações locais serão armazenadas temporariamente no IndexedDB até que o link seja reativado.`,
        'erro',
        'médio',
        'erro',
        120000 // 2 minutes throttle to prevent spamming while server is off
      );

      // Attempt reconnect fallback
      if (store.localNetwork.mode === 'client') {
        this.reconnectTimeout = setTimeout(() => {
          this.verifyRemoteConnection();
        }, 5000);
      }
    }
  }

  /**
   * Programmatic method for sending messages to other connected devices
   */
  public broadcastMessage(event: string, data: any) {
    if (this.activeWs && this.activeWs.readyState === WebSocket.OPEN) {
      try {
        this.activeWs.send(JSON.stringify({ event, data }));
        return true;
      } catch (err) {
        console.error('[NetworkService] WS Send failed:', err);
      }
    }
    return false;
  }

  /**
   * Attempts to start the local server via Electron Bridge
   */
  async startLocalServer() {
    const bridge = getElectronBridge();
    const store = useStore.getState();
    const port = store.localNetwork.port || 3100;

    if (bridge) {
      try {
        const result = await bridge.startLocalServer(port);
        if (result.success) {
          store.updateLocalNetworkStatus({
            isActive: true,
            ip: result.ip,
            port: result.port,
            lastStart: Date.now()
          });
          console.log(`[NetworkService] Local server started at http://${result.ip}:${result.port}`);
          return true;
        }
      } catch (error) {
        console.error('[NetworkService] Failed to start local server:', error);
      }
    } else if ((import.meta as any).env?.DEV) {
      // Mock for development environment
      store.updateLocalNetworkStatus({
        isActive: true,
        ip: '192.168.0.15',
        port: 3100,
        lastStart: Date.now()
      });
    }
    return false;
  }

  /**
   * Checks current server status
   */
  async checkStatus() {
    const bridge = getElectronBridge();
    const store = useStore.getState();

    if (bridge && store.localNetwork.isActive) {
      try {
        const ip = await bridge.getLocalIP();
        if (ip !== store.localNetwork.ip) {
          store.updateLocalNetworkStatus({ ip });
        }
      } catch (error) {
        console.error('[NetworkService] Status check failed:', error);
      }
    }
  }

  /**
   * Stops and fully cleans up the network service
   */
  destroy() {
    if (this.autoStartInterval) {
      clearInterval(this.autoStartInterval);
      this.autoStartInterval = null;
    }
    if (this.activeWs) {
      try {
        this.activeWs.close();
      } catch (e) {}
      this.activeWs = null;
    }
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }
    this.isInitialized = false;
    console.log('[NetworkService] Destroyed network service.');
  }
}

export const networkService = NetworkService.getInstance();
