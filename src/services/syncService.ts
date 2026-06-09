import { useStore } from '../store';
import { getOrCreateDeviceId, getSavedToken } from './networkService';
import { isDesktop, getElectronBridge } from '../lib/environment';

class SyncService {
  private static instance: SyncService;
  private scanInterval: any = null;
  private pushInterval: any = null;
  private isScanning = false;
  private isPushing = false;
  private lastKnownTimestamps: Map<string, number> = new Map();
  private lastScannedRefs: Map<string, any[]> = new Map();
  private isInitialized = false;
  private lastLoggedErrors: Map<string, number> = new Map();
  private electronSyncIncomingUnsub: (() => void) | null = null;

  private logThrottled(key: string, description: string, actionType: string, riskLevel: 'baixo' | 'médio' | 'alto' = 'baixo', status: 'sucesso' | 'bloqueado' | 'erro' = 'sucesso', throttleMs: number = 60000) {
    const now = Date.now();
    const lastLogged = this.lastLoggedErrors.get(key) || 0;
    if (now - lastLogged > throttleMs) {
      this.lastLoggedErrors.set(key, now);
      useStore.getState().logAction({
        module: 'Sincronização',
        actionType: actionType as any,
        description,
        status,
        riskLevel
      });
    }
  }

  // Observable sync stats
  public stats = {
    pendingCount: 0,
    lastSyncTime: '',
    statusText: 'Offline',
    serverIp: '',
    connectedDeviceName: ''
  };

  private constructor() {}

  private startIntervals() {
    if (this.scanInterval) clearInterval(this.scanInterval);
    this.scanInterval = setInterval(() => this.scanAndBuildMutations(), 15000);

    if (this.pushInterval) clearInterval(this.pushInterval);
    this.pushInterval = setInterval(() => this.triggerBidirectionalSync(), 30000);
  }

  private stopIntervals() {
    if (this.scanInterval) {
      clearInterval(this.scanInterval);
      this.scanInterval = null;
    }
    if (this.pushInterval) {
      clearInterval(this.pushInterval);
      this.pushInterval = null;
    }
  }

  static getInstance(): SyncService {
    if (!SyncService.instance) {
      SyncService.instance = new SyncService();
    }
    return SyncService.instance;
  }

  /**
   * Safely stops and destroys background intervals
   */
  public destroy() {
    this.stopIntervals();
    if (this.electronSyncIncomingUnsub) {
      try {
        this.electronSyncIncomingUnsub();
      } catch (err) {
        console.warn('[SyncService] Failed to clean up electron sync listener:', err);
      }
      this.electronSyncIncomingUnsub = null;
    }
    this.isInitialized = false;
    console.log('[SyncService] Destroyed sync background services.');
  }

  /**
   * Initializes the synchronization engine
   */
  public initialize() {
    if (this.isInitialized) {
      console.log('[SyncService] Already initialized. Restarting intervals to confirm active status.');
      this.startIntervals();
      return;
    }
    this.isInitialized = true;
    console.log('[SyncService] Initializing Real-Time Data Sync engine.');

    // 1. Listen for immediate manual/automatic sync triggers
    window.addEventListener('sync_immediate_trigger', () => {
      this.triggerPushSync();
    });

    // 2. Start State Scanner (runs every 15 seconds to capture mutations silently)
    this.startIntervals();

    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', () => {
        if (document.hidden) {
          this.stopIntervals();
        } else {
          this.startIntervals();
          this.scanAndBuildMutations();
          this.triggerBidirectionalSync();
        }
      });
    }

    // 4. Listen for real-time WebSocket traffic updates
    window.addEventListener('sync_traffic_received', (e: any) => {
      const packet = e.detail;
      if (packet && packet.event === 'sync_mutations_received') {
        this.handleIncomingRealtimeMutations(packet.data?.mutations || []);
      }
    });

    // 5. Expose Electron real-time sync listeners for Main PC Matrix
    const bridge = getElectronBridge();
    if (bridge && bridge.onSyncIncomingMutations) {
      this.electronSyncIncomingUnsub = bridge.onSyncIncomingMutations((mutations: any[]) => {
        console.log('[SyncService/PC-Matrix] Received incoming mutations from electron IPC server:', mutations);
        this.handleIncomingRealtimeMutations(mutations);
      });
    }

    // Trigger initial sync
    setTimeout(() => {
      this.scanAndBuildMutations();
      this.triggerBidirectionalSync();
    }, 1500);
  }

  /**
   * Scan all operational collections to detect local updates/insertions/deletions
   */
  private scanAndBuildMutations() {
    if (this.isScanning) return;
    if (typeof document !== 'undefined' && document.hidden) {
      // Pause scanner when browser or app is in background to preserve mobile CPU/Battery
      return;
    }

    const store = useStore.getState();
    if (!store.currentUser) {
      // Prevent running and stop intervals if no user is authenticated
      this.stopIntervals();
      return;
    }

    this.isScanning = true;

    try {
      
      // If store hasn't loaded state from IndexedDB yet, drop scan to prevent deleting data!
      if (!store.hasHydrated) {
        this.isScanning = false;
        return;
      }

      // Do not generate client-side mutation records when we are in the middle of a remote pull
      if (store.syncStatus === 'syncing') {
        this.isScanning = false;
        return;
      }

      const syncableEntities = [
        { key: 'products', entityName: 'products' },
        { key: 'clients', entityName: 'clients' },
        { key: 'sales', entityName: 'sales' },
        { key: 'preOrders', entityName: 'preOrders' },
        { key: 'automations', entityName: 'automations' },
        { key: 'activities', entityName: 'activities' },
        { key: 'alerts', entityName: 'alerts' },
        { key: 'cashierHistory', entityName: 'cashierHistory' },
        { key: 'financialTransactions', entityName: 'financialTransactions' },
        { key: 'consignmentRemittances', entityName: 'consignmentRemittances' },
        { key: 'returns', entityName: 'returns' },
        { key: 'userRoles', entityName: 'userRoles' },
        { key: 'users', entityName: 'users' },
        { key: 'badges', entityName: 'badges' },
        { key: 'masterAuthorizations', entityName: 'masterAuthorizations' },
        { key: 'auditLogs', entityName: 'auditLogs' }
      ];

      const currentDeviceId = getOrCreateDeviceId();
      const currentUserName = store.currentUser?.fullName || store.currentUser?.login || 'Operador Local';
      let mutationsAdded = false;

      const newMutations: any[] = [];
      const updatedSlices: any = {};

      for (const entry of syncableEntities) {
        const collection = (store as any)[entry.key] as any[];
        if (!Array.isArray(collection)) continue;

        // BATCH / REFERENCE CACHE OPTIMIZATION:
        // Zustand state is updated immutably. If the array instance remains identical,
        // absolutely nothing was inserted, updated, or deleted. Skip the entire table scan!
        if (this.lastScannedRefs.get(entry.key) === collection) {
          continue;
        }

        const currentIds = new Set<string>();

        // 1. Scan for newly added or manually updated items
        for (const item of collection) {
          if (!item || !item.id) continue;
          currentIds.add(item.id);

          const cacheKey = `${entry.entityName}_${item.id}`;
          const knownTimestamp = this.lastKnownTimestamps.get(cacheKey);

          const itemTimestamp = item.lastUpdated || 0;

          if (knownTimestamp === undefined) {
            // First time seeing this item on this run, initialize cache
            this.lastKnownTimestamps.set(cacheKey, itemTimestamp);
          } else if (itemTimestamp > knownTimestamp) {
            // Item was updated locally!
            newMutations.push({
              entity: entry.entityName,
              recordId: item.id,
              operation: 'u',
              data: item,
              timestamp: Date.now()
            });
            this.lastKnownTimestamps.set(cacheKey, itemTimestamp);
            mutationsAdded = true;
          }
        }

        // 2. Scan for deleted items (only if we had previously cached values)
        for (const cacheKey of Array.from(this.lastKnownTimestamps.keys())) {
          if (cacheKey.startsWith(`${entry.entityName}_`)) {
            const id = cacheKey.substring(entry.entityName.length + 1);
            if (!currentIds.has(id)) {
              // Deleted item detected!
              newMutations.push({
                entity: entry.entityName,
                recordId: id,
                operation: 'd',
                data: null,
                timestamp: Date.now()
              });
              this.lastKnownTimestamps.delete(cacheKey);
              mutationsAdded = true;
            }
          }
        }

        // Update scanned reference registry to avoid duplicate scans
        this.lastScannedRefs.set(entry.key, collection);
      }

      // If we produced new mutations, push them directly into the pendingSyncQueue
      if (newMutations.length > 0) {
        const existingQueue = store.pendingSyncQueue || [];
        const nextQueue = [...existingQueue];

        for (const mut of newMutations) {
          // Remove older pending mutations for the same record in the queue to maintain small size
          const idx = nextQueue.findIndex(q => q.entity === mut.entity && q.recordId === mut.recordId);
          if (idx !== -1) {
            nextQueue.splice(idx, 1);
          }
          nextQueue.push(mut);
        }

        useStore.setState({ pendingSyncQueue: nextQueue });
        
        // Dispatch instant sync action
        setTimeout(() => this.triggerPushSync(), 100);
      }

    } catch (err) {
      console.error('[SyncScanner] Error scanning store:', err);
    } finally {
      this.isScanning = false;
    }
  }

  /**
   * Triggers background pull & push to synchronize operational databases
   */
  public async triggerBidirectionalSync() {
    const store = useStore.getState();
    if (!store.currentUser) {
      // Stop background activities if user is logged out
      this.stopIntervals();
      return;
    }

    // Sincronização only takes place if in client mode and connected to remote OR in server mode locally
    const isClient = store.localNetwork.mode === 'client';
    const isConnected = store.localNetwork.connectionStatus === 'connected';
    const isServerActive = store.localNetwork.isActive && isDesktop();

    if (isClient && !isConnected) {
      store.setSyncStatus('idle');
      return;
    }

    if (!isClient && !isServerActive) {
      return;
    }

    try {
      store.setSyncStatus('syncing');

      // 1. Pull missing updates from the local central server
      await this.triggerPullSync();

      // 2. Push local pending mutations to the server
      await this.triggerPushSync();

      store.setSyncStatus('synced');
      store.updateLastSyncAt(Date.now());
    } catch (err: any) {
      const errMsg = err?.message || String(err);
      if (errMsg.includes('Failed to fetch') || errMsg.includes('Load failed') || errMsg.includes('abort') || errMsg.includes('NetworkError')) {
        console.warn('[SyncService] Bidirectional sync paused: Central sync server is offline or unreachable.');
        this.logThrottled(
          'sync_offline',
          `Sincronização bidirecional em segundo plano pausada: Servidor Central de Sincronização está offline ou inacessível no momento.`,
          'erro',
          'médio',
          'erro',
          300000 // 5 minutes throttle
        );
      } else {
        console.error('[SyncService] Bidirectional sync failed:', err);
        this.logThrottled(
          'sync_fail_critical',
          `Erro crítico na sincronização bidirecional de dados: ${errMsg}`,
          'erro',
          'alto',
          'erro',
          120000 // 2 minutes throttle
        );
      }
      store.setSyncStatus('error');
    }
  }

  /**
   * Pull changes from central server
   */
  private async triggerPullSync() {
    const store = useStore.getState();
    if (store.localNetwork.mode !== 'client') return; // Matrix has its own files

    const server = store.localNetwork.remoteServer;
    if (!server) return;

    const lastSyncAt = store.lastSyncAt || 0;
    const token = getSavedToken(server.ip, server.port);

    const pullUrl = `http://${server.ip}:${server.port}/api/sync/pull?lastSyncAt=${lastSyncAt}`;
    
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 6000);

    try {
      const res = await fetch(pullUrl, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`
        },
        signal: controller.signal
      });
      clearTimeout(timer);

      if (!res.ok) {
        throw new Error(`Pull HTTP Erro ${res.status}`);
      }

      const body = await res.json();
      if (body.success && body.changes) {
        // Merge records with LWW
        store.applyIncomingSyncChanges(body.changes);
        
        // Populate scanner cache so we don't trigger circular mutation logs
        for (const [entity, records] of Object.entries(body.changes)) {
          if (Array.isArray(records)) {
            for (const r of records) {
              if (r && r.id && r.lastUpdated) {
                this.lastKnownTimestamps.set(`${entity}_${r.id}`, r.lastUpdated);
              }
            }
          }
        }
      }
    } catch (err: any) {
      clearTimeout(timer);
      console.warn('[SyncService] Failed to pull changes:', err);
      const errMsg = err?.message || String(err);
      if (!errMsg.includes('Failed to fetch') && !errMsg.includes('abort') && !errMsg.includes('NetworkError')) {
        this.logThrottled(
          'pull_failed_internal',
          `Falha ao recuperar atualizações (pull) do PC Central: ${errMsg}. Verifique as permissões de acesso do dispositivo.`,
          'erro',
          'alto',
          'erro',
          120000
        );
      }
      throw err;
    }
  }

  /**
   * Push pending local mutations to the server
   */
  private async triggerPushSync() {
    if (this.isPushing) return;
    this.isPushing = true;

    try {
      const store = useStore.getState();
      const mutations = store.pendingSyncQueue || [];
      if (mutations.length === 0) {
        this.isPushing = false;
        return;
      }

      const isClient = store.localNetwork.mode === 'client';
      const server = store.localNetwork.remoteServer;
      
      let pushUrl = '';
      let token = '';

      if (isClient) {
        if (!server || store.localNetwork.connectionStatus !== 'connected') {
          this.isPushing = false;
          return;
        }
        pushUrl = `http://${server.ip}:${server.port}/api/sync/push`;
        token = getSavedToken(server.ip, server.port);
      } else {
        // Local loopback matrix on local PC — only valid if running in Electron (desktop) with an active central server
        if (!isDesktop() || !store.localNetwork.isActive) {
          this.isPushing = false;
          return;
        }
        const port = store.localNetwork.port || 3100;
        pushUrl = `http://127.0.0.1:${port}/api/sync/push`;
      }

      console.log(`[SyncService] Pushing ${mutations.length} mutations to sync server...`);
      
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 6000);

      const res = await fetch(pushUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': token ? `Bearer ${token}` : ''
        },
        body: JSON.stringify({ mutations }),
        signal: controller.signal
      });
      clearTimeout(timer);

      if (!res.ok) {
        throw new Error(`Push HTTP Erro ${res.status}`);
      }

      const body = await res.json();
      if (body.success) {
        console.log(`[SyncService] Push successful. Applied ${body.appliedCount} mutations.`);
        
        // Remove successfully applied mutations
        store.clearPendingSyncQueue();
      }
    } catch (err: any) {
      const errMsg = err?.message || String(err);
      if (errMsg.includes('Failed to fetch') || errMsg.includes('Load failed') || errMsg.includes('abort') || errMsg.includes('NetworkError')) {
        console.warn('[SyncService] Central server offline or unreachable. Local modifications saved; will sync when connection returns.');
      } else {
        console.error('[SyncService] Failed to push local mutations:', err);
        this.logThrottled(
          'push_failed_internal',
          `Envio de modificações locais (push) rejeitado ou falhou no PC Central: ${errMsg}.`,
          'erro',
          'alto',
          'erro',
          120000
        );
      }
    } finally {
      this.isPushing = false;
    }
  }

  /**
   * Handle real-time push mutations received via WebSockets
   */
  private handleIncomingRealtimeMutations(mutations: any[]) {
    if (!Array.isArray(mutations) || mutations.length === 0) return;

    try {
      const store = useStore.getState();
      const changes: { [entity: string]: any[] } = {};

      for (const mut of mutations) {
        const { entity, operation, data, recordId } = mut;
        if (!entity || !recordId) continue;

        if (!changes[entity]) {
          changes[entity] = [];
        }

        if (operation === 'u') {
          changes[entity].push(data);
        } else if (operation === 'd') {
          // Represent deletion locally as an overlay without data or run deletion direct
          // Since our applyIncomingSyncChanges already filters deletions if needed or applies logic,
          // let's pass a deletion record marker
          changes[entity].push({ id: recordId, _isDeleted: true, lastUpdated: mut.timestamp || Date.now() });
        }
      }

      // Merge results
      store.applyIncomingSyncChanges(changes);

      // Re-populate our cache timestamps to lock them and avoid duplicate scans
      for (const [entity, records] of Object.entries(changes)) {
        for (const item of records) {
          if (item && item.id && item.lastUpdated) {
            this.lastKnownTimestamps.set(`${entity}_${item.id}`, item.lastUpdated);
          }
        }
      }
    } catch (err) {
      console.error('[SyncService] Error applying incoming WebSocket mutations:', err);
    }
  }

  /**
   * Generates dynamic stats values for user indicators
   */
  public getIndicatorStats() {
    const store = useStore.getState();
    const isClient = store.localNetwork.mode === 'client';
    const isServer = !isClient;

    let statusText = 'Offline';
    let style = 'bg-red-500/10 text-red-400 border-red-500/20';

    if (isClient) {
      const conn = store.localNetwork.connectionStatus;
      if (conn === 'connecting') {
        statusText = 'Conectando';
        style = 'bg-amber-500/10 text-amber-500/80 border-amber-500/20 animate-pulse';
      } else if (conn === 'connected') {
        if (store.syncStatus === 'syncing') {
          statusText = 'Sincronizando';
          style = 'bg-blue-500/10 text-blue-400 border-blue-500/20';
        } else if (store.syncStatus === 'conflict') {
          statusText = 'Conflito detectado';
          style = 'bg-amber-500/25 text-amber-500 border-amber-500/30 animate-pulse';
        } else {
          statusText = 'Pareado e Sincronizado';
          style = 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20';
        }
      } else if (conn === 'error') {
        statusText = 'Erro de sincronização';
        style = 'bg-red-500/20 text-red-400 border-red-500/30';
      }
    } else {
      // Server / Matrix mode
      if (store.localNetwork.isActive) {
        if (store.syncStatus === 'syncing') {
          statusText = 'Sincronizando';
          style = 'bg-blue-500/10 text-blue-400 border-blue-500/20';
        } else if (store.syncStatus === 'conflict') {
          statusText = 'Conflito detectado';
          style = 'bg-amber-500/25 text-amber-500 border-amber-500/30 animate-pulse';
        } else {
          statusText = 'Servidor Principal Ativo';
          style = 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20';
        }
      }
    }

    const pendingCount = store.pendingSyncQueue?.length || 0;
    const lastSyncTime = store.lastSyncAt 
      ? new Date(store.lastSyncAt).toLocaleTimeString('pt-BR')
      : 'Nunca';

    const serverIp = isClient 
      ? `${store.localNetwork.remoteServer?.ip || '127.0.0.1'}:${store.localNetwork.remoteServer?.port || 3100}`
      : `${store.localNetwork.ip || '0.0.0.0'}:${store.localNetwork.port || 3100}`;

    return {
      statusText,
      style,
      pendingCount,
      lastSyncTime,
      serverIp,
      deviceName: isClient ? (store.localNetwork.remoteServer?.deviceName || 'Celular Cliente') : 'PC Principal (Central)'
    };
  }
}

export const syncService = SyncService.getInstance();
