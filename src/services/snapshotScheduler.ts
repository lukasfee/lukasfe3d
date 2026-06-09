import { useStore } from '../store';
import { DataProtectionService } from './dataProtectionService';
import { GoogleDriveService } from './googleDriveService';

let localIntervalId: any = null;
let googleDriveIntervalId: any = null;

export const SnapshotScheduler = {
  start() {
    this.stop(); // Clean any previous intervals to avoid duplicate timers

    console.info('[SnapshotScheduler] Centralizing snapshot scheduling: Local (5 min), Google Drive (30 min).');

    // 1. Local snapshots: runs every 5 minutes (5 * 60 * 1000)
    localIntervalId = setInterval(async () => {
      try {
        const state = useStore.getState();
        if (state.isDirty) {
          console.info('[SnapshotScheduler] Local dirty state detected. Creating 5-minute periodic snapshot...');
          const rawString = await state.exportData();
          const parsed = JSON.parse(rawString);

          await DataProtectionService.createSnapshot(
            parsed.data,
            parsed.version || '1.2.1',
            'auto',
            'Backup automático periódico (Local - 5 min)'
          );

          // Mark clean locally
          state.setIsDirty?.(false);
          state.addActivity('Backup automático local de rotina (5min) concluído', 'alert', 'Sistema');
        } else {
          console.log('[SnapshotScheduler] Local snapshot loop: state not dirty. Skipping.');
        }
      } catch (err: any) {
        console.error('[SnapshotScheduler] Local 5-minute backup error:', err);
      }
    }, 5 * 60 * 1000);

    // 2. Google Drive snapshots: runs every 30 minutes (30 * 60 * 1000)
    googleDriveIntervalId = setInterval(async () => {
      try {
        const state = useStore.getState();
        if (state.googleDriveBackupEnabled) {
          if (state.isDriveDirty) {
            console.info('[SnapshotScheduler] Google Drive dirty state detected. Creating 30-minute cloud backup...');
            const rawString = await state.exportData();
            const parsed = JSON.parse(rawString);

            const encrypted = await DataProtectionService.exportEncryptedFile(parsed.data, parsed.version || '1.2.1');
            const nowStr = new Date().toISOString().slice(0, 19).replace(/T/g, '-').replace(/:/g, '-');
            const filename = `backup-auto-erp-industrial-${nowStr}.json`;

            const success = await GoogleDriveService.uploadBackupToCloud(encrypted, filename, 'auto');
            if (success) {
              state.setIsDriveDirty?.(false);
              state.setGoogleDriveLastSyncAt(Date.now());
              state.addActivity('Backup automático de rotina no Google Drive (30min) concluído', 'alert', 'Sistema');
            }
          } else {
            console.log('[SnapshotScheduler] Google Drive snapshot loop: state not dirty. Skipping.');
          }
        }
      } catch (err: any) {
        console.error('[SnapshotScheduler] Google Drive 30-minute backup error:', err);
      }
    }, 30 * 60 * 1000);
  },

  stop() {
    if (localIntervalId) {
      clearInterval(localIntervalId);
      localIntervalId = null;
    }
    if (googleDriveIntervalId) {
      clearInterval(googleDriveIntervalId);
      googleDriveIntervalId = null;
    }
    console.info('[SnapshotScheduler] Timers stopped and cleaned.');
  },

  async triggerManualBackup(description: string, skipGoogleDrive: boolean = false): Promise<string> {
    const state = useStore.getState();
    const operatorName = state.currentUser?.fullName || 'Operador ADM';
    const desc = description.trim() || 'Snapshot manual de rotina';

    console.info(`[SnapshotScheduler] Starting manual snapshot: "${desc}"`);

    const rawString = await state.exportData();
    const parsed = JSON.parse(rawString);

    // Bypasses any dirty flag and creates a local snapshot immediately
    const snapshotId = await DataProtectionService.createSnapshot(
      parsed.data,
      parsed.version || '1.2.1',
      'manual',
      `${desc} (Criado por: ${operatorName})`
    );

    // If Google Drive is enabled, upload immediately to ManualBackups folder
    let driveUploaded = false;
    if (state.googleDriveBackupEnabled && !skipGoogleDrive) {
      try {
        const encrypted = await DataProtectionService.exportEncryptedFile(parsed.data, parsed.version || '1.2.1');
        const nowStr = new Date().toISOString().slice(0, 19).replace(/T/g, '-').replace(/:/g, '-');
        const filename = `backup-manual-erp-industrial-${nowStr}.json`;

        driveUploaded = await GoogleDriveService.uploadBackupToCloud(encrypted, filename, 'manual');
      } catch (err) {
        console.error('[SnapshotScheduler] Drive manual upload failed:', err);
      }
    }

    // Reset local dirty flag since local snapshot is definitely created successfully
    state.setIsDirty?.(false);
    
    // Only reset drive dirty flag if we didn't attempt drive upload OR if it succeeded
    if (!state.googleDriveBackupEnabled || skipGoogleDrive || driveUploaded) {
      state.setIsDriveDirty?.(false);
    }

    state.addActivity(`Backup manual gerado: ${desc}`, 'alert', 'Sistema', operatorName);
    state.logAction({
      module: 'Sistema',
      actionType: 'other',
      description: `Snapshot de backup manual criado: ${desc}`,
      status: 'sucesso',
      riskLevel: 'baixo'
    });

    return snapshotId;
  }
};
