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
   * Initializes auth state check on app start
   */
  initialize(): Promise<boolean> {
    return new Promise((resolve) => {
      onAuthStateChanged(auth, async (firebaseUser: User | null) => {
        if (firebaseUser) {
          try {
            // Firebase returns ID Token, we can get Google Provider Access Token via fresh login or cached credentials.
            // If the user refreshed the window, we might need them to click "Login" again to refresh the access token 
            // since Firebase itself doesn't persist the Google Auth access token in default session profile.
            // However, we cache the access token in memory as instructed.
            cachedUser = {
              displayName: firebaseUser.displayName,
              email: firebaseUser.email,
              photoURL: firebaseUser.photoURL,
            };
            
            // To be transparent, if cachedToken is null, we set status to connected if we can obtain a token
            // silently or wait for user to click connecting.
            if (cachedToken) {
              currentStatus = 'connected';
            } else {
              // We are connected in Firebase, but we need the actual access_token for Google Drive calls.
              // We'll mark as disconnected so user can click to restore token safely.
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
   * Triggers the Google Drive Login and authentication popup
   */
  async connect(forceSelectAccount: boolean = false): Promise<boolean> {
    currentStatus = 'connecting';
    lastError = null;
    notifyListeners();

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
   * Core helper to find or create the 'ERP-Industrial-Backups' directory
   */
  async getOrCreateBackupFolder(token: string): Promise<string> {
    const query = encodeURIComponent("name = 'ERP-Industrial-Backups' and mimeType = 'application/vnd.google-apps.folder' and trashed = false");
    const response = await fetch(`https://www.googleapis.com/drive/v3/files?q=${query}&fields=files(id,name)`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    
    if (!response.ok) {
      throw new Error('Falha ao consultar diretórios no Google Drive.');
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
   * Syncs custom State data silently to the cloud
   */
  async uploadBackupToCloud(backupDataString: string, originalFileName?: string): Promise<boolean> {
    const token = cachedToken;
    if (!token) {
      console.warn('[GoogleDriveService] Tentativa de backup sem login ativo no Google Drive.');
      this.queueOfflineBackup(backupDataString, originalFileName);
      return false;
    }

    if (!navigator.onLine) {
      console.log('[GoogleDriveService] Dispositivo offline, enfileirando backup.');
      this.queueOfflineBackup(backupDataString, originalFileName);
      return false;
    }

    currentStatus = 'syncing';
    notifyListeners();

    try {
      const folderId = await this.getOrCreateBackupFolder(token);
      const name = originalFileName || `backup-erp-industrial-${new Date().toISOString().slice(0, 19).replace(/T/g, '-').replace(/:/g, '-')}.json`;

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
      useStore.getState().setGoogleDriveLastSyncAt(Date.now());
      notifyListeners();

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
      
      // Keep it in offline queue as defensive sync structure
      this.queueOfflineBackup(backupDataString, originalFileName);
      return false;
    }
  },

  /**
   * List all backups in the Google Drive folder
   */
  async listCloudBackups(): Promise<Array<{ id: string; name: string; createdTime: string; size: string }>> {
    const token = cachedToken;
    if (!token) {
      throw new Error('Por favor, conecte sua conta Google Drive primeiro.');
    }

    try {
      const folderId = await this.getOrCreateBackupFolder(token);
      const query = encodeURIComponent(`'${folderId}' in parents and trashed = false`);
      const response = await fetch(
        `https://www.googleapis.com/drive/v3/files?q=${query}&orderBy=createdTime+desc&fields=files(id,name,createdTime,size)&pageSize=30`,
        {
          headers: { 'Authorization': `Bearer ${token}` }
        }
      );

      if (!response.ok) {
        throw new Error('Não foi possível obter a lista de backups do Google Drive.');
      }

      const data = await response.json();
      return data.files || [];
    } catch (err) {
      console.error('[GoogleDriveService] Erro ao listar arquivos:', err);
      throw err;
    }
  },

  /**
   * Restores a backup file from Google Drive and returns the parsed JSON
   */
  async downloadAndValidateCloudBackup(fileId: string): Promise<any> {
    const token = cachedToken;
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
      
      // De-duplicate backups based on content hash or keep last one to avoid bloating localStorage
      // To satisfy user intent: we can just save the most recent backup structure
      const item = { name, dataString, timestamp: Date.now() };
      
      // Kept narrow: keep last 3 unsynced backups to avoid localStorage crash
      const updatedQueue = [...queue.slice(-2), item];
      localStorage.setItem(OFFLINE_QUEUE_KEY, JSON.stringify(updatedQueue));
      console.log('[GoogleDriveService] Backup enfileirado offline com sucesso.');
    } catch (e) {
      console.warn('[GoogleDriveService] Falha ao enfileirar offline:', e);
    }
  },

  /**
   * Process all pending offline backups once online
   */
  async processOfflineQueue() {
    if (!navigator.onLine || !cachedToken) return;

    try {
      const queueRaw = localStorage.getItem(OFFLINE_QUEUE_KEY);
      if (!queueRaw) return;

      const queue = JSON.parse(queueRaw);
      if (queue.length === 0) return;

      console.log(`[GoogleDriveService] Processando fila de sincronização (${queue.length} backups)...`);
      
      // Sync in sequential order
      for (const item of queue) {
        await this.uploadBackupToCloud(item.dataString, item.name);
      }

      // Empty queue on completion
      localStorage.removeItem(OFFLINE_QUEUE_KEY);
      console.log('[GoogleDriveService] Fila de sincronização concluída com sucesso.');
    } catch (err) {
      console.error('[GoogleDriveService] Erro ao esvaziar fila:', err);
    }
  }
};
