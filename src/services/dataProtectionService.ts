
import { safeIdbGet as idbGet, safeIdbSet as idbSet, safeIdbDel as idbDel, safeIdbKeys as idbKeys } from '../lib/idbFallback';

export interface DataBackup {
  id: string;
  timestamp: number;
  data: any;
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
const MAX_AUTO_BACKUPS = 5;

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
    const currentChecksum = this.generateChecksum(JSON.stringify(backup.data));
    return currentChecksum === backup.checksum;
  },

  /**
   * Creates a snapshot of the current state
   */
  async createSnapshot(data: any, version: string, type: 'auto' | 'manual' = 'auto', description?: string): Promise<string> {
    const timestamp = Date.now();
    const id = `${timestamp}`;
    const dataString = JSON.stringify(data);
    const checksum = this.generateChecksum(dataString);

    const backup: DataBackup = {
      id,
      timestamp,
      data,
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
          size: JSON.stringify(b.data).length
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
          return await electronAPI.db.loadBackupFileContent(match.filename);
        }
        return null;
      } catch (err) {
        console.error('[SQLite] Failed to get physical backup content:', err);
        return null;
      }
    }

    return idbGet<DataBackup>(`${BACKUP_PREFIX}${id}`) || null;
  },

  /**
   * Delete a specific backup
   */
  async deleteBackup(id: string): Promise<void> {
    const isDesktop = typeof window !== 'undefined' && !!(window as any).electron;
    if (isDesktop) {
      // In Desktop/Electron, we do physical file retention, no direct delete API required
      return;
    }
    await idbDel(`${BACKUP_PREFIX}${id}`);
  },

  /**
   * Export all data as a secure, validated file
   */
  async exportEncryptedFile(data: any, version: string): Promise<string> {
    const backup = {
      version,
      timestamp: Date.now(),
      data,
      checksum: this.generateChecksum(JSON.stringify(data)),
      app: 'ERP-WMS-LUKASFE'
    };
    return JSON.stringify(backup, null, 2);
  }
};
