import { initializeApp, getApps, getApp } from 'firebase/app';
import { 
  getAuth, 
  signInWithPopup, 
  GoogleAuthProvider, 
  onAuthStateChanged, 
  signOut, 
  User,
  browserLocalPersistence,
  setPersistence
} from 'firebase/auth';
import firebaseConfig from '../../firebase-applet-config.json';
import { useStore } from '../store';
import { DataProtectionService } from './dataProtectionService';

// Initialize Firebase App
const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();
const auth = getAuth(app);

// Configure persistent local session for firebase auth so user doesn't have to reconnect on reload
setPersistence(auth, browserLocalPersistence).catch(err => {
  console.warn('[GoogleDriveService] Persistência falhou:', err);
});

export interface GoogleDriveUser {
  displayName: string | null;
  email: string | null;
  photoURL: string | null;
}

export type SyncStatusType = 'idle' | 'connecting' | 'connected' | 'disconnected' | 'syncing' | 'synced' | 'error';

let cachedToken: string | null = null;
let cachedUser: GoogleDriveUser | null = null;
let currentStatus: SyncStatusType = 'disconnected';
let lastError: string | null = null;

const listeners: Set<() => void> = new Set();

const notifyListeners = () => {
  listeners.forEach(cb => cb());
};

// Queue of unsynced backups when offline
const OFFLINE_QUEUE_KEY = 'erp_gdrive_offline_queue';
const DESKTOP_TOKENS_KEY = 'nexa_gdrive_desktop_tokens';

// Global execution locks and backoff safety helpers for blindagem
let isSyncingActive = false;
let isProcessingOfflineQueue = false;
let consecutiveFailures = 0;
let nextAllowedRetryTime = 0;

/**
 * Service to handle Google Drive OAuth authentication and backup/restore integration
 */
export const GoogleDriveService = {
  subscribe(callback: () => void) {
    listeners.add(callback);
    return () => {
      listeners.delete(callback);
    };
  },

  getAccessToken(): string | null {
    return cachedToken;
  },

  getGoogleUser(): GoogleDriveUser | null {
    return cachedUser;
  },

  getSyncStatus(): SyncStatusType {
    if (!navigator.onLine && cachedToken) {
      return 'idle'; // local mode with pending sync
    }
    return currentStatus;
  },

  getLastError(): string | null {
    return lastError;
  },

  /**
   * Checks if running in an Electron environment
   */
  isElectron(): boolean {
    return typeof window !== 'undefined' && !!(window as any).electron;
  },

  /**
   * Ensures the active access token is fresh (re-auth or refresh if needed on desktop)
   */
  async ensureActiveToken(): Promise<string> {
    if (this.isElectron()) {
      try {
        const stored = localStorage.getItem(DESKTOP_TOKENS_KEY);
        if (stored) {
          const parsed = JSON.parse(stored);
          const isExpired = Date.now() > (parsed.createdAt + (parsed.expiresIn * 1000) - 60000); // 1-minute safety buffer

          if (isExpired && parsed.refreshToken) {
            console.log('[GoogleDriveService][Desktop] Access token expired, auto-refreshing...');
            const electronAPI = (window as any).electron;
            if (electronAPI && typeof electronAPI.googleDriveRefresh === 'function') {
              const res = await electronAPI.googleDriveRefresh({ refreshToken: parsed.refreshToken });
              if (res && res.success) {
                cachedToken = res.accessToken;
                
                // Update persistent storage
                localStorage.setItem(DESKTOP_TOKENS_KEY, JSON.stringify({
                  accessToken: res.accessToken,
                  refreshToken: parsed.refreshToken,
                  expiresIn: res.expiresIn,
                  createdAt: res.createdAt,
                  user: parsed.user
                }));
                notifyListeners();
                return res.accessToken;
              } else {
                console.warn('[GoogleDriveService][Desktop] Auto-refresh failed:', res?.error);
                await this.disconnect();
                throw new Error(res?.error || 'Não foi possível renovar as credenciais do Google Drive.');
              }
            }
          } else {
            cachedToken = parsed.accessToken;
            return parsed.accessToken;
          }
        }
      } catch (e: any) {
        console.error('[GoogleDriveService][Desktop] Error in ensureActiveToken:', e);
        throw e;
      }
    }

    if (!cachedToken) {
      throw new Error('Por favor, conecte sua conta Google Drive primeiro.');
    }
    return cachedToken;
  },

  /**
   * Initializes auth state check on app start
   */
  initialize(): Promise<boolean> {
    return new Promise((resolve) => {
      if (this.isElectron()) {
        try {
          const stored = localStorage.getItem(DESKTOP_TOKENS_KEY);
          if (stored) {
            const parsed = JSON.parse(stored);
            cachedUser = parsed.user;
            
            // Validate and fetch/refresh token
            this.ensureActiveToken()
              .then((token) => {
                cachedToken = token;
                currentStatus = 'connected';
                notifyListeners();
                this.processOfflineQueue();
                resolve(true);
              })
              .catch(() => {
                // If validation failed, disconnect cleanly
                this.disconnect().then(() => resolve(false));
              });
            return;
          }
        } catch (e) {
          console.error('[GoogleDriveService] Error initializing desktop:', e);
        }
        currentStatus = 'disconnected';
        notifyListeners();
        resolve(false);
        return;
      }

      // Existing Web Flow (Firebase Auth)
      onAuthStateChanged(auth, async (firebaseUser: User | null) => {
        if (firebaseUser) {
          try {
            cachedUser = {
              displayName: firebaseUser.displayName,
              email: firebaseUser.email,
              photoURL: firebaseUser.photoURL,
            };
            
            if (cachedToken) {
              currentStatus = 'connected';
            } else {
              currentStatus = 'disconnected';
            }
          } catch (err) {
            console.error('[GoogleDriveService] Initialization error:', err);
            currentStatus = 'error';
            lastError = (err as Error).message;
          }
        } else {
          cachedToken = null;
          cachedUser = null;
          currentStatus = 'disconnected';
        }
        notifyListeners();
        resolve(!!cachedToken);
      });

      // Synchronize offline queue when online status changes
      window.addEventListener('online', () => {
        console.log('[GoogleDriveService] Connected to internet. Checking sync queue...');
        this.processOfflineQueue();
      });
    });
  },

  /**
   * Triggers the Google Drive Login and authentication popup / desktop loopback OAuth
   */
  async connect(forceSelectAccount: boolean = false): Promise<boolean> {
    currentStatus = 'connecting';
    lastError = null;
    notifyListeners();

    if (this.isElectron()) {
      try {
        const electronAPI = (window as any).electron;
        if (!electronAPI || typeof electronAPI.googleDriveConnect !== 'function') {
          throw new Error('Canal de comunicação Electron para Google Drive não encontrado.');
        }

        const res = await electronAPI.googleDriveConnect();
        if (!res || !res.success) {
          throw new Error(res?.error || 'A conexão com o Google Drive foi cancelada ou falhou.');
        }

        cachedToken = res.tokens.accessToken;
        cachedUser = {
          displayName: res.user.displayName,
          email: res.user.email,
          photoURL: res.user.photoURL,
        };

        currentStatus = 'connected';

        // Persist token information
        localStorage.setItem(DESKTOP_TOKENS_KEY, JSON.stringify({
          accessToken: res.tokens.accessToken,
          refreshToken: res.tokens.refreshToken,
          expiresIn: res.tokens.expiresIn,
          createdAt: res.tokens.createdAt,
          user: cachedUser
        }));

        notifyListeners();
        await this.processOfflineQueue();
        return true;
      } catch (err: any) {
        console.error('[GoogleDriveService][Desktop] Erro ao conectar ao Google Drive:', err);
        currentStatus = 'error';
        lastError = err.message || 'Erro de autenticação no desktop.';
        notifyListeners();
        return false;
      }
    }

    try {
      const provider = new GoogleAuthProvider();
      provider.addScope('https://www.googleapis.com/auth/drive.file');

      if (forceSelectAccount) {
        provider.setCustomParameters({
          prompt: 'select_account'
        });
      }

      const result = await signInWithPopup(auth, provider);
      const credential = GoogleAuthProvider.credentialFromResult(result);
      
      if (!credential || !credential.accessToken) {
        throw new Error('Não foi possível obter o token de acesso do Google Drive.');
      }

      cachedToken = credential.accessToken;
      cachedUser = {
        displayName: result.user.displayName,
        email: result.user.email,
        photoURL: result.user.photoURL,
      };

      currentStatus = 'connected';
      notifyListeners();

      // Trigger standard sync check
      await this.processOfflineQueue();
      return true;
    } catch (err: any) {
      console.error('[GoogleDriveService] Erro ao conectar ao Google Drive:', err);
      currentStatus = 'error';
      
      if (err.code === 'auth/popup-closed-by-user') {
        lastError = 'A janela de autenticação foi fechada antes de concluir.';
      } else if (err.code === 'auth/network-request-failed') {
        lastError = 'Falha de rede ao conectar com servidores do Google.';
      } else {
        lastError = err.message || 'Erro desconhecido ao autenticar.';
      }
      
      if (!cachedToken) {
        currentStatus = 'disconnected';
      } else {
        currentStatus = 'connected';
      }
      
      notifyListeners();
      return false;
    }
  },

  /**
   * Signs out of Google integration
   */
  async disconnect(): Promise<void> {
    if (this.isElectron()) {
      localStorage.removeItem(DESKTOP_TOKENS_KEY);
      cachedToken = null;
      cachedUser = null;
      currentStatus = 'disconnected';
      lastError = null;
      notifyListeners();
      return;
    }

    const token = cachedToken;
    if (token) {
      try {
        // Revoke token on Google's authorization server to fully invalidate the access token
        await fetch(`https://oauth2.googleapis.com/revoke?token=${token}`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded'
          }
        });
        console.log('[GoogleDriveService] Token do Google Drive revogado com sucesso.');
      } catch (e) {
        console.warn('[GoogleDriveService] Erro ao revogar token OAuth (pode estar expirado ou offline):', e);
      }
    }

    try {
      await signOut(auth);
    } catch (e) {
      console.warn('[GoogleDriveService] Erro ao deslogar da conta Firebase:', e);
    }

    cachedToken = null;
    cachedUser = null;
    currentStatus = 'disconnected';
    lastError = null;
    notifyListeners();
  },

  /**
   * Switches the active Google Account by clearing local credentials and launching full reauth popup
   */
  async switchAccount(): Promise<boolean> {
    await this.disconnect();
    return this.connect(true);
  },

  /**
   * Finds or creates a subfolder inside a parent folder
   */
  async getOrCreateSubfolder(token: string, parentId: string, subfolderName: string): Promise<string> {
    const query = encodeURIComponent(`name = '${subfolderName}' and mimeType = 'application/vnd.google-apps.folder' and '${parentId}' in parents and trashed = false`);
    const response = await fetch(`https://www.googleapis.com/drive/v3/files?q=${query}&fields=files(id,name)`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    
    if (!response.ok) {
      throw new Error(`Falha ao consultar diretório ${subfolderName} no Google Drive.`);
    }
    
    const data = await response.json();
    if (data.files && data.files.length > 0) {
      return data.files[0].id;
    }

    // Creating folder
    const createResponse = await fetch('https://www.googleapis.com/drive/v3/files', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        name: subfolderName,
        mimeType: 'application/vnd.google-apps.folder',
        parents: [parentId]
      })
    });

    if (!createResponse.ok) {
      throw new Error(`Não foi possível criar a pasta ${subfolderName} no Google Drive.`);
    }

    const folder = await createResponse.json();
    return folder.id;
  },

  /**
   * Finds or creates parent folder 'ERP-Industrial-Backups'
   */
  async getOrCreateParentFolder(token: string): Promise<string> {
    const query = encodeURIComponent("name = 'ERP-Industrial-Backups' and mimeType = 'application/vnd.google-apps.folder' and trashed = false");
    const response = await fetch(`https://www.googleapis.com/drive/v3/files?q=${query}&fields=files(id,name)`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    
    if (!response.ok) {
      throw new Error('Falha ao consultar diretório pai no Google Drive.');
    }
    
    const data = await response.json();
    if (data.files && data.files.length > 0) {
      return data.files[0].id;
    }

    // Creating folder
    const createResponse = await fetch('https://www.googleapis.com/drive/v3/files', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        name: 'ERP-Industrial-Backups',
        mimeType: 'application/vnd.google-apps.folder'
      })
    });

    if (!createResponse.ok) {
      throw new Error('Não foi possível criar a pasta ERP-Industrial-Backups no Google Drive.');
    }

    const folder = await createResponse.json();
    return folder.id;
  },

  /**
   * Core helper to find or create the 'ERP-Industrial-Backups' subdirectories
   */
  async getOrCreateBackupFolder(token: string, type: 'auto' | 'manual' = 'auto'): Promise<string> {
    const parentFolderId = await this.getOrCreateParentFolder(token);
    const subfolderName = type === 'auto' ? 'AutoBackups' : 'ManualBackups';
    return this.getOrCreateSubfolder(token, parentFolderId, subfolderName);
  },

  /**
   * Enforces retention policy on Google Drive (keeps last 15 auto backups)
   */
  async enforceGoogleDriveRetention(token: string, folderId: string): Promise<number> {
    try {
      const query = encodeURIComponent(`'${folderId}' in parents and trashed = false`);
      const response = await fetch(
        `https://www.googleapis.com/drive/v3/files?q=${query}&orderBy=createdTime+desc&fields=files(id,name,createdTime)&pageSize=100`,
        {
          headers: { 'Authorization': `Bearer ${token}` }
        }
      );

      if (!response.ok) {
        console.warn('[GoogleDriveService] Falha ao listar arquivos para conferência de retenção no Drive.');
        return 0;
      }

      const data = await response.json();
      const files = data.files || [];
      
      if (files.length > 15) {
        const toDelete = files.slice(15);
        let deletedCount = 0;
        for (const f of toDelete) {
          const delRes = await fetch(`https://www.googleapis.com/drive/v3/files/${f.id}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${token}` }
          });
          if (delRes.ok) {
            deletedCount++;
          } else {
            console.warn(`[GoogleDriveService] Falha ao deletar arquivo antigo ${f.name} do Drive:`, delRes.statusText);
          }
        }
        console.log(`[GoogleDriveService-RETENTION] Prunados ${deletedCount} backups automáticos antigos no Google Drive.`);
        return deletedCount;
      }
      return 0;
    } catch (e) {
      console.error('[GoogleDriveService-RETENTION] Erro de rede ou autorização ao aplicar retenção Google Drive:', e);
      return 0;
    }
  },

  isBackoffActive(): boolean {
    if (consecutiveFailures > 0 && Date.now() < nextAllowedRetryTime) {
      return true;
    }
    return false;
  },

  getBackoffTimeRemaining(): number {
    return Math.max(0, Math.round((nextAllowedRetryTime - Date.now()) / 1000));
  },

  incrementFailure() {
    consecutiveFailures++;
    const delayMs = Math.min(30 * 1000 * Math.pow(2, consecutiveFailures - 1), 30 * 60 * 1000); // 30s, 60s, 120s... max 30 min
    nextAllowedRetryTime = Date.now() + delayMs;
    console.warn(`[GoogleDriveService] Falha de comunicação #${consecutiveFailures}. Próximo retry em ${delayMs / 1000}s.`);
  },

  resetFailure() {
    consecutiveFailures = 0;
    nextAllowedRetryTime = 0;
  },

  /**
   * Syncs custom State data silently to the cloud
   */
  async uploadBackupToCloud(backupDataString: string, originalFileName?: string, type: 'auto' | 'manual' = 'auto'): Promise<boolean> {
    if (isSyncingActive) {
      console.warn('[GoogleDriveService] Envio concorrente bloqueado por lock ativo.');
      return false;
    }

    if (this.isBackoffActive()) {
      console.warn(`[GoogleDriveService] Upload abortado devido a backoff ativo por falhas consecutivas. Tempo restante: ${this.getBackoffTimeRemaining()}s`);
      // Keep it enqueued offline defensively
      this.queueOfflineBackup(backupDataString, originalFileName);
      return false;
    }

    isSyncingActive = true;
    let token = cachedToken;
    try {
      token = await this.ensureActiveToken();
    } catch (_) {}

    if (!token) {
      console.warn('[GoogleDriveService] Tentativa de backup sem login ativo no Google Drive.');
      isSyncingActive = false;
      this.queueOfflineBackup(backupDataString, originalFileName);
      return false;
    }

    if (!navigator.onLine) {
      console.log('[GoogleDriveService] Dispositivo offline, enfileirando backup.');
      isSyncingActive = false;
      this.queueOfflineBackup(backupDataString, originalFileName);
      return false;
    }

    currentStatus = 'syncing';
    notifyListeners();

    try {
      const folderId = await this.getOrCreateBackupFolder(token, type);
      const name = originalFileName || `backup-${type === 'auto' ? 'auto' : 'manual'}-erp-industrial-${new Date().toISOString().slice(0, 19).replace(/T/g, '-').replace(/:/g, '-')}.json`;

      const metadata = {
        name,
        parents: [folderId],
        mimeType: 'application/json'
      };

      const boundary = 'erp_industrial_backup_boundary';
      const delimiter = `\r\n--${boundary}\r\n`;
      const close_delim = `\r\n--${boundary}--`;

      const body = 
        delimiter +
        'Content-Type: application/json; charset=UTF-8\r\n\r\n' +
        JSON.stringify(metadata) +
        delimiter +
        'Content-Type: application/json\r\n\r\n' +
        backupDataString +
        close_delim;

      const response = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': `multipart/related; boundary=${boundary}`
        },
        body: body
      });

      if (!response.ok) {
        const errText = await response.text();
        throw new Error(`Falha ao subir arquivo para o Google Drive: ${response.statusText} (${errText})`);
      }

      currentStatus = 'synced';
      this.resetFailure();
      
      const storeState = useStore.getState();
      storeState.setGoogleDriveLastSyncAt(Date.now());
      // ONLY clear dirty state once sync successfully completes entirely
      storeState.setIsDriveDirty?.(false);
      
      notifyListeners();

      // Prune old auto backups if uploaded as 'auto'
      if (type === 'auto') {
        try {
          await this.enforceGoogleDriveRetention(token, folderId);
        } catch (retErr) {
          console.error('[GoogleDriveService] Falha ao rotacionar backups antigos no Drive:', retErr);
        }
      }

      // Reset to connected status after some seconds
      setTimeout(() => {
        if (currentStatus === 'synced') {
          currentStatus = 'connected';
          notifyListeners();
        }
      }, 5000);

      return true;
    } catch (err: any) {
      console.error('[GoogleDriveService] Erro ao subir backup:', err);
      currentStatus = 'error';
      lastError = err.message || 'Erro de rede ao sincronizar com Google Drive.';
      notifyListeners();
      
      this.incrementFailure();
      
      // Keep it in offline queue as defensive sync structure
      this.queueOfflineBackup(backupDataString, originalFileName);
      return false;
    } finally {
      isSyncingActive = false;
    }
  },

  /**
   * List all backups across AutoBackups and ManualBackups folders in Google Drive
   */
  async listCloudBackups(): Promise<Array<{ id: string; name: string; createdTime: string; size: string; type: 'auto' | 'manual' }>> {
    const token = await this.ensureActiveToken();
    if (!token) {
      throw new Error('Por favor, conecte sua conta Google Drive primeiro.');
    }

    try {
      const autoFolderId = await this.getOrCreateBackupFolder(token, 'auto');
      const manualFolderId = await this.getOrCreateBackupFolder(token, 'manual');
      
      const query = encodeURIComponent(`('${autoFolderId}' in parents or '${manualFolderId}' in parents) and trashed = false`);
      const response = await fetch(
        `https://www.googleapis.com/drive/v3/files?q=${query}&orderBy=createdTime+desc&fields=files(id,name,createdTime,size,parents)&pageSize=100`,
        {
          headers: { 'Authorization': `Bearer ${token}` }
        }
      );

      if (!response.ok) {
        throw new Error('Não foi possível obter a lista de backups do Google Drive.');
      }

      const data = await response.json();
      const files = data.files || [];
      return files.map((file: any) => {
        const isAuto = file.parents && file.parents.includes(autoFolderId);
        return {
          id: file.id,
          name: file.name,
          createdTime: file.createdTime,
          size: file.size || '0',
          type: isAuto ? 'auto' : 'manual'
        };
      });
    } catch (err) {
      console.error('[GoogleDriveService] Erro ao listar arquivos:', err);
      throw err;
    }
  },

  /**
   * Restores a backup file from Google Drive and returns the parsed JSON
   */
  async downloadAndValidateCloudBackup(fileId: string): Promise<any> {
    const token = await this.ensureActiveToken();
    if (!token) {
      throw new Error('Por favor, conecte sua conta Google Drive para restaurar.');
    }

    try {
      const response = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (!response.ok) {
        throw new Error('Falha ao descarregar backup da nuvem.');
      }

      const backup = await response.json();
      
      // Perform strict validation using DataProtectionService
      if (!DataProtectionService.validateBackup(backup)) {
        throw new Error('ERRO DE INTEGRIDADE: O arquivo de backup selecionado está violado ou corrompido.');
      }

      return backup;
    } catch (err) {
      console.error('[GoogleDriveService] Erro ao baixar e ler backup:', err);
      throw err;
    }
  },

  /**
   * Helper to append to local offline queue
   */
  queueOfflineBackup(dataString: string, originalFileName?: string) {
    try {
      const name = originalFileName || `backup-erp-industrial-${new Date().toISOString().slice(0, 19).replace(/T/g, '-').replace(/:/g, '-')}.json`;
      const queueRaw = localStorage.getItem(OFFLINE_QUEUE_KEY);
      const queue = queueRaw ? JSON.parse(queueRaw) : [];
      
      const item = { name, dataString, timestamp: Date.now() };
      const updatedQueue = [...queue.slice(-2), item];
      localStorage.setItem(OFFLINE_QUEUE_KEY, JSON.stringify(updatedQueue));
      console.log('[GoogleDriveService] Backup enfileirado offline com sucesso.');
    } catch (e) {
      console.warn('[GoogleDriveService] Falha ao enfileirar offline:', e);
    }
  },

  /**
   * Process all pending offline backups once online with strict locks to prevent duplication
   */
  async processOfflineQueue() {
    if (!navigator.onLine || !cachedToken) return;
    if (isProcessingOfflineQueue) {
      console.log('[GoogleDriveService] Fila offline já está sendo processada por outro lock ativo.');
      return;
    }

    isProcessingOfflineQueue = true;
    console.log('[GoogleDriveService] Iniciando processamento seguro da fila offline...');

    try {
      const queueRaw = localStorage.getItem(OFFLINE_QUEUE_KEY);
      if (!queueRaw) return;

      const queue = JSON.parse(queueRaw);
      if (queue.length === 0) return;

      console.log(`[GoogleDriveService] Processando fila de sincronização (${queue.length} backups)...`);
      
      // Crucial: remove/freeze immediately before dispatching to completely prevent duplication
      localStorage.removeItem(OFFLINE_QUEUE_KEY);

      // Sync in sequential order
      for (const item of queue) {
        // We override syncingActive temporarily to permit sequential queue uploads
        isSyncingActive = false;
        const success = await this.uploadBackupToCloud(item.dataString, item.name);
        if (!success) {
          console.warn(`[GoogleDriveService] Falha ao enviar item da fila: ${item.name}. Devolvendo à fila.`);
          this.queueOfflineBackup(item.dataString, item.name);
        }
      }
      console.log('[GoogleDriveService] Fila de sincronização processada.');
    } catch (err) {
      console.error('[GoogleDriveService] Erro ao processar fila offline:', err);
    } finally {
      isProcessingOfflineQueue = false;
    }
  }
};
