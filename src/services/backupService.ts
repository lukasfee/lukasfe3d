import { useStore } from '../store';
import { DataProtectionService, DataBackup, BackupHistory } from './dataProtectionService';
import { safeIdbGet as idbGet, safeIdbSet as idbSet, safeIdbDel as idbDel, safeIdbKeys as idbKeys } from '../lib/idbFallback';

export interface CorporateBackupSettings {
  autoBackupEnabled: boolean;
  frequencyHours: number; // 2, 4, 8, 12, 24, 48, 168 (weekly)
  maxAutoSnapshots: number; // 5, 10, 20
  lastExecutionTimestamp: number | null;
  storageWarningThresholdMb: number; // e.g. 50MB
}

export interface StorageHealthReport {
  usedBytes: number;
  usedFormatted: string;
  snapshotsCount: number;
  healthStatus: 'excelente' | 'moderado' | 'crítico';
  estimatedMaxBytes: number;
  autoBackupsCount: number;
  manualBackupsCount: number;
}

const SETTINGS_KEY = 'erp_corporate_backup_settings';
const DEFAULT_SETTINGS: CorporateBackupSettings = {
  autoBackupEnabled: true,
  frequencyHours: 24,
  maxAutoSnapshots: 50,
  lastExecutionTimestamp: null,
  storageWarningThresholdMb: 50
};

let isRestoringActive = false;

export const BackupService = {
  /**
   * Retrieves active backup and auto-recovery settings
   */
  async getSettings(): Promise<CorporateBackupSettings> {
    try {
      const data = await idbGet<CorporateBackupSettings>(SETTINGS_KEY);
      return data ? { ...DEFAULT_SETTINGS, ...data } : { ...DEFAULT_SETTINGS };
    } catch {
      return { ...DEFAULT_SETTINGS };
    }
  },

  /**
   * Saves updated backup and auto-recovery settings
   */
  async saveSettings(settings: Partial<CorporateBackupSettings>): Promise<CorporateBackupSettings> {
    const current = await this.getSettings();
    const updated = { ...current, ...settings };
    await idbSet(SETTINGS_KEY, updated);
    
    const store = useStore.getState();
    store.addActivity('Configurações de backup corporativo atualizadas', 'alert', 'Sistema');
    store.logAction({
      module: 'Sistema',
      actionType: 'other',
      description: `Configurações de backup alteradas: Frequência ${updated.frequencyHours}h, Auto-backup: ${updated.autoBackupEnabled ? 'Sim' : 'Não'}`,
      status: 'sucesso',
      riskLevel: 'baixo'
    });
    
    return updated;
  },

  /**
   * Evaluates if a restoration or rollback is safe to execute right now
   */
  canPerformRestore(): { safe: boolean; reason?: string } {
    const store = useStore.getState();
    
    // Safety block: Active cashier session
    if (store.currentCashier) {
      return { 
        safe: false, 
        reason: 'Há um Caixa em aberto. Encerre a sessão do caixa antes de realizar qualquer restauração para evitar incompatibilidade financeira.' 
      };
    }
    
    // Safety block: Synchronizations ongoing
    if (store.syncStatus === 'syncing') {
      return {
        safe: false,
        reason: 'Sincronização de dados ativa no momento. Aguarde a conclusão antes de reiniciar o estado do sistema.'
      };
    }

    // Safety block: Unsynced local operations in queue
    if (store.pendingSyncQueue && store.pendingSyncQueue.length > 0) {
      return {
        safe: false,
        reason: 'Existem atualizações pendentes na fila de sincronização offline. Sincronize com a matriz antes de restaurar.'
      };
    }

    // Lock guard: Simultaneous restorations
    if (isRestoringActive) {
      return {
        safe: false,
        reason: 'Uma operação de restauração já está sendo executada. Aguarde o término.'
      };
    }

    return { safe: true };
  },

  /**
   * Generates a structural health report of the IndexedDB backup storage allocation.
   */
  async getStorageHealthReport(): Promise<StorageHealthReport> {
    const history = await DataProtectionService.getBackupHistory();
    let totalSize = 0;
    let autoCount = 0;
    let manualCount = 0;

    for (const item of history) {
      totalSize += item.size;
      if (item.type === 'auto') {
        autoCount++;
      } else {
        manualCount++;
      }
    }

    const estimatedMaxBytes = 300 * 1024 * 1024; // 300MB safe guideline for web storage
    let status: 'excelente' | 'moderado' | 'crítico' = 'excelente';
    if (totalSize > estimatedMaxBytes * 0.7) {
      status = 'crítico';
    } else if (totalSize > estimatedMaxBytes * 0.4) {
      status = 'moderado';
    }

    return {
      usedBytes: totalSize,
      usedFormatted: this.formatBytes(totalSize),
      snapshotsCount: history.length,
      healthStatus: status,
      estimatedMaxBytes,
      autoBackupsCount: autoCount,
      manualBackupsCount: manualCount
    };
  },

  /**
   * Helper to format bytes efficiently for the enterprise panel
   */
  formatBytes(bytes: number): string {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  },

  /**
   * Triggers background checks for scheduled automatic corporate snapshots.
   */
  async triggerPeriodicAutoBackup(): Promise<string | null> {
    const settings = await this.getSettings();
    if (!settings.autoBackupEnabled) return null;

    const now = Date.now();
    const lastBackup = settings.lastExecutionTimestamp;
    const intervalMs = settings.frequencyHours * 60 * 60 * 1000;

    if (!lastBackup || now - lastBackup >= intervalMs) {
      console.log(`[BackupService] Auto backup executing. Interval exceeded.`);
      const storeState = useStore.getState();
      
      // Export current full state data
      const rawDataString = await storeState.exportData();
      const parsedData = JSON.parse(rawDataString);

      // Create snapshot
      const snapshotId = await DataProtectionService.createSnapshot(
        parsedData.data,
        parsedData.version || '1.2.1',
        'auto',
        `Backup Automático de Rotina (${settings.frequencyHours}h)`
      );

      // Apply retention policy limits
      await this.enforceBackupRetentionPolicy(settings.maxAutoSnapshots);

      // Update settings
      await this.saveSettings({ lastExecutionTimestamp: now });

      return snapshotId;
    }

    return null;
  },

  /**
   * Cleans up excess automatic backups according to the max retention policy
   */
  async enforceBackupRetentionPolicy(maxCount: number): Promise<number> {
    const allKeys = await idbKeys();
    const backupKeys = allKeys
      .filter(k => typeof k === 'string' && k.startsWith('erp_backup_'))
      .map(k => k as string);
    
    const autoSnapshots: DataBackup[] = [];
    for (const key of backupKeys) {
      const b = await idbGet<DataBackup>(key);
      if (b && b.type === 'auto') {
        autoSnapshots.push(b);
      }
    }

    // Sort newer to older
    autoSnapshots.sort((a, b) => b.timestamp - a.timestamp);

    let deletedCount = 0;
    if (autoSnapshots.length > maxCount) {
      const toDelete = autoSnapshots.slice(maxCount);
      for (const snapshot of toDelete) {
        await idbDel(`erp_backup_${snapshot.id}`);
        deletedCount++;
      }
    }
    return deletedCount;
  },

  /**
   * Pre-validation check for imported JSON backups to verify structural consistency
   */
  validateBackupData(parsed: any): { success: boolean; error?: string; metadata?: any } {
    if (!parsed || typeof parsed !== 'object') {
      return { success: false, error: 'Arquivo inválido. O conteúdo não é um JSON válido.' };
    }

    if (!parsed.data || !parsed.checksum) {
      return { success: false, error: 'O arquivo não possui o formato de backup corporativo correto.' };
    }

    // Match signature or standard attributes to ensure authenticity
    if (parsed.app && parsed.app !== 'ERP-WMS-LUKASFE') {
      console.warn('[BackupService] Non-matching app signature in backup. Proceeding with caution.');
    }

    const data = parsed.data;
    
    // Fundamental schemas
    const coreCollections = ['products', 'clients', 'users', 'company'];
    const missing = coreCollections.filter(key => !data[key] || !Array.isArray(data[key]) && typeof data[key] !== 'object');
    
    if (missing.length > 0) {
      return { 
        success: false, 
        error: `Incompatibilidade de esquema. Tabelas mandatórias ausentes: ${missing.join(', ')}` 
      };
    }

    // Validate Checksum to prevent silent payload modifications or truncated files
    const verifiedChecksum = DataProtectionService.generateChecksum(JSON.stringify(data));
    if (verifiedChecksum !== parsed.checksum) {
      return { 
        success: false, 
        error: 'Validação de integridade (Checksum SHA-like) falhou. O arquivo de backup está truncado, corrompido ou foi modificado externo.' 
      };
    }

    // Prepare statistics metadata
    const meta = {
      version: parsed.version || 'Desconhecida',
      timestamp: parsed.timestamp || Date.now(),
      productsCount: Array.isArray(data.products) ? data.products.length : 0,
      clientsCount: Array.isArray(data.clients) ? data.clients.length : 0,
      usersCount: Array.isArray(data.users) ? data.users.length : 0,
      salesCount: Array.isArray(data.sales) ? data.sales.length : 0,
      terminalCount: Array.isArray(data.terminals) ? data.terminals.length : 0
    };

    return { success: true, metadata: meta };
  },

  /**
   * Executes a safe system-wide Rollback/Restore to a previous snapshot or configuration.
   * Prompts a preventively auto snapshot beforehand.
   */
  async restoreFromSnapshot(snapshotId: string, operatorName: string): Promise<{ success: boolean; error?: string }> {
    const safety = this.canPerformRestore();
    if (!safety.safe) {
      return { success: false, error: safety.reason };
    }

    isRestoringActive = true;
    const storeState = useStore.getState();

    try {
      // 1. Load backup from IndexedDB
      const snapshot = await DataProtectionService.getBackupById(snapshotId);
      if (!snapshot) {
        isRestoringActive = false;
        return { success: false, error: 'Snapshot de recuperação corporativo não localizado.' };
      }

      // 2. Validate current snapshot format
      const validation = this.validateBackupData({
        version: snapshot.version,
        timestamp: snapshot.timestamp,
        data: snapshot.data,
        checksum: snapshot.checksum
      });

      if (!validation.success) {
        isRestoringActive = false;
        return { success: false, error: validation.error };
      }

      // 3. Trigger PREVENTIVE Snapshot of the prior state to allow immediate undo if needed
      const rawCurrent = await storeState.exportData();
      const parsedCurrent = JSON.parse(rawCurrent);
      await DataProtectionService.createSnapshot(
        parsedCurrent.data,
        parsedCurrent.version || '1.2.1',
        'auto',
        `Snapshot Preventivo Pré-Recuperação (${snapshotId})`
      );

      // 4. Perform actual store recovery
      const importResult = await storeState.importData({
        version: snapshot.version,
        timestamp: snapshot.timestamp,
        data: snapshot.data
      });

      if (!importResult.success) {
        isRestoringActive = false;
        return { success: false, error: importResult.error || 'Erro interno na reidratação do Zustand.' };
      }

      // 5. Post audit events onto new state
      const refreshedStore = useStore.getState();
      refreshedStore.addActivity(`Restauração corporativa ativa (anterior: ${snapshotId})`, 'alert', 'Sistema', operatorName);
      refreshedStore.logAction({
        module: 'Sistema',
        actionType: 'other',
        description: `Rollback de sistema operado por ${operatorName} para data: ${new Date(snapshot.timestamp).toLocaleString()}`,
        status: 'sucesso',
        riskLevel: 'alto'
      });

      isRestoringActive = false;
      return { success: true };
    } catch (e: any) {
      isRestoringActive = false;
      return { success: false, error: `Falha crítica durante recuperação: ${e?.message || e}` };
    }
  },

  /**
   * Handles importing a backup from an uploaded JSON string file
   */
  async restoreFromBackupFile(jsonString: string, operatorName: string): Promise<{ success: boolean; error?: string }> {
    const safety = this.canPerformRestore();
    if (!safety.safe) {
      return { success: false, error: safety.reason };
    }

    isRestoringActive = true;
    const storeState = useStore.getState();

    try {
      const parsed = JSON.parse(jsonString);
      const validation = this.validateBackupData(parsed);

      if (!validation.success) {
        isRestoringActive = false;
        return { success: false, error: validation.error };
      }

      // Current backup of active state before overwriting
      const rawCurrent = await storeState.exportData();
      const parsedCurrent = JSON.parse(rawCurrent);
      await DataProtectionService.createSnapshot(
        parsedCurrent.data,
        parsedCurrent.version || '1.2.1',
        'auto',
        `Snapshot Preventivo Pré-Importação Externa`
      );

      // Import state
      const importResult = await storeState.importData(parsed);
      if (!importResult.success) {
        isRestoringActive = false;
        return { success: false, error: importResult.error };
      }

      // Standard Log audit trail
      const refreshedStore = useStore.getState();
      refreshedStore.addActivity('Backup corporativo externo importado', 'alert', 'Sistema', operatorName);
      refreshedStore.logAction({
        module: 'Sistema',
        actionType: 'other',
        description: `Importação de backup manual externo operado por ${operatorName}`,
        status: 'sucesso',
        riskLevel: 'alto'
      });

      isRestoringActive = false;
      return { success: true };
    } catch (e: any) {
      isRestoringActive = false;
      return { success: false, error: 'Estrutura JSON inválida ou corrompida. Não foi possível realizar o parse.' };
    }
  }
};
