import { safeIdbGet as idbGet, safeIdbSet as idbSet, safeIdbDel as idbDel, safeIdbKeys as idbKeys } from '../lib/idbFallback';

export interface DataBackup {
  id: string;
  timestamp: number;
  data: any; // encrypted base64 string or legacy plain object
  isEncrypted?: boolean;
  version: string;
  checksum: string;
  type: 'auto' | 'manual';
  description?: string;
}

export interface BackupHistory {
  id: string;
  timestamp: number;
  type: 'auto' | 'manual';
  version: string;
  size: number;
}

const BACKUP_PREFIX = 'erp_backup_';
const MAX_AUTO_BACKUPS = 50;

const ENCRYPTION_PASSPHRASE = 'NexaERPIndustrialSecureBackupKey-2026';
const SALT_BYTES = new Uint8Array([0x4e, 0x65, 0x78, 0x61, 0x5f, 0x45, 0x52, 0x50, 0x5f, 0x53, 0x61, 0x6c, 0x74]);

/**
 * Derives an AES-GCM 256-bit key from the custom passphrase and salt using PBKDF2
 */
async function getEncryptionKey(): Promise<CryptoKey | null> {
  if (typeof window === 'undefined' || !window.crypto || !window.crypto.subtle) {
    return null;
  }
  try {
    const enc = new TextEncoder();
    const baseKey = await window.crypto.subtle.importKey(
      'raw',
      enc.encode(ENCRYPTION_PASSPHRASE),
      'PBKDF2',
      false,
      ['deriveKey']
    );
    return await window.crypto.subtle.deriveKey(
      {
        name: 'PBKDF2',
        salt: SALT_BYTES,
        iterations: 100000,
        hash: 'SHA-256'
      },
      baseKey,
      { name: 'AES-GCM', length: 256 },
      false,
      ['encrypt', 'decrypt']
    );
  } catch (err) {
    console.error('[Crypto] Key derivation error:', err);
    return null;
  }
}

/**
 * Encrypts a string using AES-GCM 256-bit
 */
export async function encryptData(plainText: string): Promise<string> {
  const key = await getEncryptionKey();
  if (!key) {
    return plainText;
  }
  try {
    const enc = new TextEncoder();
    const iv = window.crypto.getRandomValues(new Uint8Array(12));
    const encrypted = await window.crypto.subtle.encrypt(
      { name: 'AES-GCM', iv },
      key,
      enc.encode(plainText)
    );
    
    const combined = new Uint8Array(iv.length + encrypted.byteLength);
    combined.set(iv, 0);
    combined.set(new Uint8Array(encrypted), iv.length);
    
    let binary = '';
    const bytes = new Uint8Array(combined);
    for (let i = 0; i < bytes.byteLength; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
  } catch (err) {
    console.error('[Crypto] Encryption failed:', err);
    throw err;
  }
}

/**
 * Decrypts a base64 encoded AES-GCM ciphertext
 */
export async function decryptData(cipherTextBase64: string): Promise<string> {
  const key = await getEncryptionKey();
  if (!key) {
    return cipherTextBase64;
  }
  try {
    const binaryString = atob(cipherTextBase64);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    
    const iv = bytes.slice(0, 12);
    const encryptedData = bytes.slice(12);
    
    const decrypted = await window.crypto.subtle.decrypt(
      { name: 'AES-GCM', iv },
      key,
      encryptedData
    );
    
    const dec = new TextDecoder();
    return dec.decode(decrypted);
  } catch (err) {
    console.error('[Crypto] Decryption failed - possible corruption:', err);
    throw err;
  }
}

/**
 * Service for advanced data protection and persistence
 */
export const DataProtectionService = {
  /**
   * Request persistent storage from the browser to prevent data eviction
   */
  async reinforcePersistence(): Promise<boolean> {
    if (navigator.storage && navigator.storage.persist) {
      const isPersisted = await navigator.storage.persist();
      console.log(`[DataProtection] Storage persisted: ${isPersisted}`);
      return isPersisted;
    }
    return false;
  },

  /**
   * Simple checksum to verify data integrity
   */
  generateChecksum(data: string): string {
    let hash = 0;
    for (let i = 0; i < data.length; i++) {
      const char = data.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32bit integer
    }
    return hash.toString(16);
  },

  /**
   * Validates if the backup object is not corrupted
   */
  validateBackup(backup: any): boolean {
    if (!backup || !backup.data || !backup.checksum) return false;
    const dataToHash = typeof backup.data === 'string' ? backup.data : JSON.stringify(backup.data);
    const currentChecksum = this.generateChecksum(dataToHash);
    return currentChecksum === backup.checksum;
  },

  /**
   * Decrypts the backup data block if marked as encrypted
   */
  async decryptIfNeeded(backup: any): Promise<any> {
    if (backup && backup.isEncrypted && typeof backup.data === 'string') {
      try {
        const decryptedStr = await decryptData(backup.data);
        return JSON.parse(decryptedStr);
      } catch (err) {
        console.error('[DataProtection] Falha ao descriptografar dados do backup:', err);
        throw new Error('O arquivo de backup está criptografado, mas sua chave ou dados estão inconsistentes.');
      }
    }
    if (backup && !backup.isEncrypted) {
      console.warn('[DataProtection] Backup antigo detectado em texto puro (JSON simples). Importando em modo compatível com segurança.');
    }
    return backup.data;
  },

  /**
   * Creates a snapshot of the current state
   */
  async createSnapshot(data: any, version: string, type: 'auto' | 'manual' = 'auto', description?: string): Promise<string> {
    const timestamp = Date.now();
    const id = `${timestamp}`;
    
    // Encrypt snapshot data to protect sensitive info (passwords, finance, customer records)
    const dataString = JSON.stringify(data);
    const encryptedData = await encryptData(dataString);
    const checksum = this.generateChecksum(encryptedData);

    const backup: DataBackup = {
      id,
      timestamp,
      data: encryptedData,
      isEncrypted: true,
      version,
      checksum,
      type,
      description
    };

    const isDesktop = typeof window !== 'undefined' && !!(window as any).electron;
    const electronAPI = isDesktop ? (window as any).electron : null;
    const useSQLite = isDesktop && electronAPI && electronAPI.db;

    if (useSQLite) {
      try {
        await electronAPI.db.saveBackupFile(id, backup);
      } catch (err) {
        console.error('[SQLite] Failed to save backup physical file:', err);
      }
    } else {
      const key = `${BACKUP_PREFIX}${id}`;
      await idbSet(key, backup);

      // If auto, cleanup old ones
      if (type === 'auto') {
        await this.cleanupAutoBackups();
      }
    }

    return id;
  },

  /**
   * Removes old automatic backups keeping only the most recent ones
   */
  async cleanupAutoBackups() {
    const isDesktop = typeof window !== 'undefined' && !!(window as any).electron;
    if (isDesktop) return; // Managed physically or kept

    const allKeys = await idbKeys();
    const backupKeys = allKeys
      .filter(k => typeof k === 'string' && k.startsWith(BACKUP_PREFIX))
      .map(k => k as string);
    
    const backups: DataBackup[] = [];
    for (const key of backupKeys) {
      const b = await idbGet<DataBackup>(key);
      if (b && b.type === 'auto') {
        backups.push(b);
      }
    }

    // Sort by timestamp descending
    backups.sort((a, b) => b.timestamp - a.timestamp);

    // Delete backups beyond the limit
    if (backups.length > MAX_AUTO_BACKUPS) {
      const toDelete = backups.slice(MAX_AUTO_BACKUPS);
      for (const b of toDelete) {
        await idbDel(`${BACKUP_PREFIX}${b.id}`);
      }
    }
  },

  /**
   * Retrieves the list of available backups (without the full data)
   */
  async getBackupHistory(): Promise<BackupHistory[]> {
    const isDesktop = typeof window !== 'undefined' && !!(window as any).electron;
    const electronAPI = isDesktop ? (window as any).electron : null;
    const useSQLite = isDesktop && electronAPI && electronAPI.db;

    if (useSQLite) {
      try {
        const files = await electronAPI.db.listBackupFiles();
        return (files || []).map((f: any) => ({
          id: f.id,
          timestamp: f.createdAt,
          type: f.type || 'auto',
          version: f.version || '1.0.0',
          size: f.size || 0,
          filename: f.filename
        }));
      } catch (err) {
        console.error('[SQLite] Failed to list physical backups:', err);
        return [];
      }
    }

    const allKeys = await idbKeys();
    const backupKeys = allKeys
      .filter(k => typeof k === 'string' && k.startsWith(BACKUP_PREFIX))
      .map(k => k as string);
    
    const history: BackupHistory[] = [];
    for (const key of backupKeys) {
      const b = await idbGet<DataBackup>(key);
      if (b) {
        history.push({
          id: b.id,
          timestamp: b.timestamp,
          type: b.type,
          version: b.version,
          size: typeof b.data === 'string' ? b.data.length : JSON.stringify(b.data).length
        });
      }
    }

    return history.sort((a, b) => b.timestamp - a.timestamp);
  },

  /**
   * Loads a full backup by ID
   */
  async getBackupById(id: string): Promise<DataBackup | null> {
    const isDesktop = typeof window !== 'undefined' && !!(window as any).electron;
    const electronAPI = isDesktop ? (window as any).electron : null;
    const useSQLite = isDesktop && electronAPI && electronAPI.db;

    if (useSQLite) {
      try {
        const files = await electronAPI.db.listBackupFiles();
        const match = (files || []).find((f: any) => f.id === id);
        if (match) {
          const rawBackup = await electronAPI.db.loadBackupFileContent(match.filename);
          if (rawBackup) {
            rawBackup.data = await this.decryptIfNeeded(rawBackup);
            return rawBackup;
          }
        }
        return null;
      } catch (err) {
        console.error('[SQLite] Failed to get physical backup content:', err);
        return null;
      }
    }

    const rawBackup = await idbGet<DataBackup>(`${BACKUP_PREFIX}${id}`);
    if (rawBackup) {
      rawBackup.data = await this.decryptIfNeeded(rawBackup);
      return rawBackup;
    }
    return null;
  },

  /**
   * Delete a specific backup
   */
  async deleteBackup(id: string): Promise<void> {
    const isDesktop = typeof window !== 'undefined' && !!(window as any).electron;
    if (isDesktop) {
      return;
    }
    await idbDel(`${BACKUP_PREFIX}${id}`);
  },

  /**
   * Export all data as a secure, encrypted validated file structure
   */
  async exportEncryptedFile(data: any, version: string): Promise<string> {
    const dataString = JSON.stringify(data);
    const encryptedString = await encryptData(dataString);
    const backup = {
      version,
      timestamp: Date.now(),
      data: encryptedString,
      isEncrypted: true,
      checksum: this.generateChecksum(encryptedString),
      app: 'ERP-WMS-LUKASFE'
    };
    return JSON.stringify(backup, null, 2);
  }
};
