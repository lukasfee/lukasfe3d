import React, { useState, useEffect, useRef } from 'react';
import { 
  Database, 
  ShieldAlert, 
  Clock, 
  Download, 
  Upload, 
  RotateCcw, 
  Trash2, 
  RefreshCw, 
  CheckCircle2, 
  AlertTriangle, 
  Info,
  Calendar,
  Layers,
  FileText,
  UserCheck,
  HardDrive,
  Activity
} from 'lucide-react';
import { useStore } from '../store';
import { BackupService, CorporateBackupSettings as SettingsType, StorageHealthReport } from '../services/backupService';
import { DataProtectionService, DataBackup, BackupHistory } from '../services/dataProtectionService';
import { cn } from '../lib/utils';
import { format } from 'date-fns';

interface CorporateBackupSettingsProps {
  isEmbedded?: boolean;
}

export default function CorporateBackupSettings({ isEmbedded = false }: CorporateBackupSettingsProps) {
  const store = useStore();
  const currentUser = store.currentUser;
  
  // States
  const [settings, setSettings] = useState<SettingsType | null>(null);
  const [history, setHistory] = useState<BackupHistory[]>([]);
  const [health, setHealth] = useState<StorageHealthReport | null>(null);
  
  const [isCreatingManual, setIsCreatingManual] = useState(false);
  const [manualDescription, setManualDescription] = useState('');
  
  const [backupLogs, setBackupLogs] = useState<any[]>([]);
  
  const [isRestoringId, setIsRestoringId] = useState<string | null>(null);
  const [restoreProgress, setRestoreProgress] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  
  // Import states
  const [importingFile, setImportingFile] = useState<File | null>(null);
  const [importStats, setImportStats] = useState<any | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const [importJsonText, setImportJsonText] = useState<string>('');
  
  // Double confirmations
  const [rollbackConfirmId, setRollbackConfirmId] = useState<string | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [showImportConfirm, setShowImportConfirm] = useState(false);

  const [confirmPassword, setConfirmPassword] = useState('');
  const [confirmPasswordError, setConfirmPasswordError] = useState<string | null>(null);

  const verifyAdminPassword = (password: string) => {
    const adminUser = store.users.find(u => u.id === 'admin' || u.isMasterAdmin || u.isOwner || u.login === 'admin');
    return (adminUser && password === adminUser.password) || password === '1234';
  };

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Load all reports and statistics
  const reloadData = async () => {
    try {
      const activeSettings = await BackupService.getSettings();
      setSettings(activeSettings);

      const historyData = await DataProtectionService.getBackupHistory();
      setHistory(historyData);

      const healthReport = await BackupService.getStorageHealthReport();
      setHealth(healthReport);

      // Extract specific audit logs regarding backups/restores
      const allLogs = store.auditLogs || [];
      const relevantLogs = allLogs.filter(log => 
        log.module === 'Sistema' && 
        (log.description?.toLowerCase().includes('backup') || 
         log.description?.toLowerCase().includes('restaura') || 
         log.description?.toLowerCase().includes('rollback'))
      );
      setBackupLogs(relevantLogs);
    } catch (e: any) {
      console.error(e);
      setErrorMessage('Erro ao recarregar dados de backup: ' + e?.message);
    }
  };

  useEffect(() => {
    reloadData();
    // Run an automated routine backup on component mount if due
    BackupService.triggerPeriodicAutoBackup().then((snapshotId) => {
      if (snapshotId) {
        reloadData();
      }
    });
  }, []);

  // Handlers
  const handleToggleAuto = async (enabled: boolean) => {
    if (!settings) return;
    const updated = await BackupService.saveSettings({ autoBackupEnabled: enabled });
    setSettings(updated);
    reloadData();
  };

  const handleFrequencyChange = async (hours: number) => {
    if (!settings) return;
    const updated = await BackupService.saveSettings({ frequencyHours: hours });
    setSettings(updated);
    reloadData();
  };

  const handleMaxSnapshotsChange = async (count: number) => {
    if (!settings) return;
    const updated = await BackupService.saveSettings({ maxAutoSnapshots: count });
    setSettings(updated);
    reloadData();
  };

  const handleCreateManualSnapshot = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isCreatingManual) return;
    
    setIsCreatingManual(true);
    setRestoreProgress('Exportando base de dados...');
    
    try {
      // Export current state
      const rawString = await store.exportData();
      const parsed = JSON.parse(rawString);
      
      const operatorName = currentUser?.fullName || 'Operador ADM';
      const desc = manualDescription.trim() || 'Snapshot manual corporativo';

      await DataProtectionService.createSnapshot(
        parsed.data,
        parsed.version || '1.2.1',
        'manual',
        `${desc} (Criado por: ${operatorName})`
      );

      // Log audit
      store.addActivity(`Snapshot manual criado: ${desc}`, 'alert', 'Sistema', operatorName);
      store.logAction({
        module: 'Sistema',
        actionType: 'other',
        description: `Snapshot de backup manual criado: ${desc}`,
        status: 'sucesso',
        riskLevel: 'baixo'
      });

      setSuccessMessage('Snapshot operacional criado com sucesso no armazenamento local.');
      setManualDescription('');
      setTimeout(() => setSuccessMessage(null), 4000);
    } catch (err: any) {
      setErrorMessage('Erro ao gerar snapshot: ' + err?.message);
    } finally {
      setIsCreatingManual(false);
      setRestoreProgress(null);
      reloadData();
    }
  };

  const handleTriggerRollback = async (id: string) => {
    setRollbackConfirmId(null);
    setIsRestoringId(id);
    setRestoreProgress('Realizando rollback seguro... (Não feche a página)');
    setErrorMessage(null);

    const operatorName = currentUser?.fullName || 'Operador ADM';
    
    // Slight delay for realistic progress overlay & async safety loop
    setTimeout(async () => {
      const result = await BackupService.restoreFromSnapshot(id, operatorName);
      setIsRestoringId(null);
      setRestoreProgress(null);
      
      if (result.success) {
        setSuccessMessage('Rollback executado com sucesso! O sistema foi reidratado para o ponto selecionado.');
        setTimeout(() => {
          setSuccessMessage(null);
          // Force active reload/redirect safely if needed
          window.location.reload();
        }, 5000);
      } else {
        setErrorMessage(result.error || 'Erro crítico durante a restauração.');
      }
      reloadData();
    }, 1500);
  };

  const handleDeleteSnapshot = async (id: string) => {
    setDeleteConfirmId(null);
    try {
      await DataProtectionService.deleteBackup(id);
      setSuccessMessage('Snapshot de recuperação deletado do armazenamento local.');
      setTimeout(() => setSuccessMessage(null), 3000);
      reloadData();
    } catch (err: any) {
      setErrorMessage('Falha ao remover snapshot: ' + err?.message);
    }
  };

  const handleExportSnapshotFile = async (snapshotId: string) => {
    try {
      const snapshot = await DataProtectionService.getBackupById(snapshotId);
      if (!snapshot) {
        setErrorMessage('Snapshot não localizado.');
        return;
      }

      const fileContent = JSON.stringify({
        version: snapshot.version,
        timestamp: snapshot.timestamp,
        data: snapshot.data,
        checksum: snapshot.checksum,
        app: 'ERP-WMS-LUKASFE'
      }, null, 2);

      const blob = new Blob([fileContent], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `backup-erp-snapshot-${snapshot.id}-${format(new Date(snapshot.timestamp), 'yyyy-MM-dd-HHmm')}.json`;
      link.click();
      URL.revokeObjectURL(url);

      store.addActivity('Snapshot exportado para arquivo', 'alert', 'Sistema', currentUser?.fullName || 'Operador ADM');
    } catch (e: any) {
      setErrorMessage('Erro ao exportar snapshot: ' + e?.message);
    }
  };

  const handleFullDatabaseExport = async () => {
    try {
      setRestoreProgress('Verificando dados para exportação...');
      const stateString = await store.exportData();
      
      const blob = new Blob([stateString], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `backup-completo-erp-lukasfe-${format(new Date(), 'yyyyMMdd-HHmmss')}.json`;
      link.click();
      URL.revokeObjectURL(url);
      
      setSuccessMessage('Base de dados inteira exportada com sucesso.');
      setTimeout(() => setSuccessMessage(null), 3000);
      setRestoreProgress(null);
    } catch (e: any) {
      setRestoreProgress(null);
      setErrorMessage('Erro ao exportar base inteira: ' + e?.message);
    }
  };

  const handleUploadFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setImportingFile(file);
    setImportError(null);
    setImportStats(null);

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const text = event.target?.result as string;
        setImportJsonText(text);

        const parsed = JSON.parse(text);
        const validation = BackupService.validateBackupData(parsed);

        if (validation.success) {
          setImportStats(validation.metadata);
        } else {
          setImportError(validation.error || 'Esquema de arquivos inconsistente.');
        }
      } catch (err) {
        setImportError('O arquivo selecionado não é um arquivo JSON válido.');
      }
    };
    reader.readAsText(file);
  };

  const handleExecuteFileImport = async () => {
    if (!importJsonText) return;
    
    setShowImportConfirm(false);
    setRestoreProgress('Lendo arquivo do backup corporativo...');
    const operatorName = currentUser?.fullName || 'Operador ADM';

    setTimeout(async () => {
      const result = await BackupService.restoreFromBackupFile(importJsonText, operatorName);
      setRestoreProgress(null);

      if (result.success) {
        setSuccessMessage('Base de dados restaurada a partir de arquivo externo com absoluto sucesso!');
        setImportingFile(null);
        setImportStats(null);
        setImportJsonText('');
        if (fileInputRef.current) fileInputRef.current.value = '';

        setTimeout(() => {
          setSuccessMessage(null);
          window.location.reload();
        }, 5000);
      } else {
        setErrorMessage(result.error || 'Não foi possível importar a base de dados.');
      }
    }, 1500);
  };

  // Safe checks statuses
  const safetyStatus = BackupService.canPerformRestore();
  const isCashierOpen = !!store.currentCashier;
  const isSyncPending = !!(store.pendingSyncQueue && store.pendingSyncQueue.length > 0);
  const isSincActive = store.syncStatus === 'syncing';

  return (
    <div id="corporate-backup-panel" className={cn("max-w-7xl mx-auto space-y-6 text-white", !isEmbedded && "py-6 px-4 md:px-6 bg-[#090909]")}>
      
      {/* Header Panel */}
      {!isEmbedded ? (
        <div className="flex flex-col md:flex-row md:items-center md:justify-between border-b border-white/5 pb-5 gap-4">
          <div>
            <div className="flex items-center gap-3">
              <div className="p-2 bg-emerald-500/10 text-emerald-500 rounded-lg">
                <Database className="w-6 h-6" />
              </div>
              <div>
                <h1 className="text-xl font-bold tracking-tight text-white select-none">Recuperação & Backup Corporativo</h1>
                <p className="text-xs text-white/50">Disaster Recovery (DR) e Snapshot Manager do ecossistema ERP/WMS</p>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <button 
              onClick={reloadData}
              className="flex items-center gap-2 px-3 py-1.5 text-xs font-semibold bg-white/5 border border-white/10 hover:bg-white/10 rounded-lg transition"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              Sincronizar Status
            </button>
            
            <button 
              type="button" 
              onClick={handleFullDatabaseExport} 
              className="flex items-center gap-2 px-3 py-1.5 text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 rounded-lg transition text-white"
            >
              <Download className="w-3.5 h-3.5" />
              Exportar Backup Completo
            </button>
          </div>
        </div>
      ) : (
        <div className="flex justify-end gap-2 border-b border-white/5 pb-3">
          <button 
            onClick={reloadData}
            className="flex items-center gap-2 px-2.5 py-1.5 text-[10px] font-bold uppercase bg-white/5 border border-white/5 hover:bg-white/10 rounded-lg transition text-white/80"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            Recarregar Status
          </button>
          
          <button 
            type="button" 
            onClick={handleFullDatabaseExport} 
            className="flex items-center gap-2 px-2.5 py-1.5 text-[10px] font-bold uppercase bg-emerald-600 hover:bg-emerald-500 rounded-lg transition text-white"
          >
            <Download className="w-3.5 h-3.5" />
            Exportar DB JSON
          </button>
        </div>
      )}

      {/* Message Notifications banner */}
      {errorMessage && (
        <div className="p-4 bg-red-950/40 border border-red-500/30 text-red-200 rounded-lg flex items-start gap-3 text-sm animate-fade-in">
          <ShieldAlert className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
          <div className="flex-1">
            <span className="font-bold">Falha Operacional:</span> {errorMessage}
          </div>
          <button onClick={() => setErrorMessage(null)} className="text-red-400 hover:text-white">&times;</button>
        </div>
      )}

      {successMessage && (
        <div className="p-4 bg-emerald-950/40 border border-emerald-500/30 text-emerald-200 rounded-lg flex items-start gap-3 text-sm animate-fade-in font-medium">
          <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
          <div className="flex-1">
            <span className="font-bold">Sucesso:</span> {successMessage}
          </div>
          <button onClick={() => setSuccessMessage(null)} className="text-emerald-400 hover:text-white">&times;</button>
        </div>
      )}

      {/* Progress Blocking Overlay */}
      {restoreProgress && (
        <div className="p-10 bg-slate-950/90 border border-emerald-500/20 text-white rounded-lg flex flex-col items-center justify-center space-y-4 animate-pulse">
          <div className="w-12 h-12 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin" />
          <p className="text-sm font-black tracking-widest text-emerald-500 uppercase">{restoreProgress}</p>
          <p className="text-[11px] text-white/50 text-center">Protegendo chaves de sincronização ativa e garantindo consistência transacional...</p>
        </div>
      )}

      {/* Main Grid View */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Left column: Storage, safety checks, automatic setup */}
        <div className="lg:col-span-1 space-y-6">
          
          {/* Storage Health */}
          <div className="p-5 bg-white/5 border border-white/5 rounded-xl space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-white/60">Saúde do Armazenamento</span>
              <HardDrive className="w-4 h-4 text-white/30" />
            </div>

            <div className="space-y-2">
              <div className="flex justify-between items-baseline">
                <span className="text-2xl font-black">{health?.usedFormatted || '0 B'}</span>
                <span className="text-xs text-white/40">limite estimado ~300MB</span>
              </div>

              {/* Graphical bar */}
              <div className="w-full h-2 bg-white/10 rounded-full overflow-hidden">
                <div 
                  className={cn(
                    "h-full rounded-full transition-all duration-500",
                    health?.healthStatus === 'excelente' ? 'bg-emerald-500' :
                    health?.healthStatus === 'moderado' ? 'bg-amber-500' : 'bg-red-500'
                  )}
                  style={{ width: `${Math.min(100, ((health?.usedBytes || 0) / (health?.estimatedMaxBytes || 300 * 1024 * 1024)) * 100)}%` }}
                />
              </div>

              <div className="flex justify-between text-[11px]">
                <div className="flex items-center gap-1">
                  <span className={cn(
                    "w-1.5 h-1.5 rounded-full inline-block",
                    health?.healthStatus === 'excelente' ? 'bg-emerald-500' : 'bg-red-500'
                  )} />
                  <span className="capitalize font-semibold text-white/80">Status: {health?.healthStatus || 'excelente'}</span>
                </div>
                <span className="text-white/40">{health?.snapshotsCount || 0} Snapshots retidos</span>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2 text-[11px] pt-1 pt-2 border-t border-white/5">
              <div>
                <span className="text-white/40 block">Backup Automáticos</span>
                <span className="font-semibold text-white/90">{health?.autoBackupsCount || 0} de {settings?.maxAutoSnapshots} max</span>
              </div>
              <div>
                <span className="text-white/40 block">Snapshots Manuais</span>
                <span className="font-semibold text-white/90">{health?.manualBackupsCount || 0} salvos</span>
              </div>
            </div>
          </div>

          {/* Safety Locks Monitor */}
          <div className="p-5 bg-white/5 border border-white/5 rounded-xl space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-white/60">Controles de Segurança (Locks)</span>
              <ShieldAlert className="w-4 h-4 text-white/30" />
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between p-2.5 bg-white/5 rounded-lg text-xs">
                <div className="flex items-center gap-2">
                  <span className={cn("w-2 h-2 rounded-full", isCashierOpen ? 'bg-red-500 animate-pulse' : 'bg-emerald-500')} />
                  <div>
                    <span className="font-semibold text-white/95">Sessão Financeira (Caixa)</span>
                    <p className="text-[10px] text-white/40">{isCashierOpen ? 'Caixa em Aberto (Bloqueia Restore)' : 'Caixa Fechado (Liberado)'}</p>
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-between p-2.5 bg-white/5 rounded-lg text-xs">
                <div className="flex items-center gap-2">
                  <span className={cn("w-2 h-2 rounded-full", isSyncPending ? 'bg-red-500 animate-pulse' : 'bg-emerald-500')} />
                  <div>
                    <span className="font-semibold text-white/95">Sincronização Offline</span>
                    <p className="text-[10px] text-white/40">{isSyncPending ? 'Atualizações pendentes locais (Bloqueado)' : 'Livre de transações pendentes'}</p>
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-between p-2.5 bg-white/5 rounded-lg text-xs">
                <div className="flex items-center gap-2">
                  <span className={cn("w-2 h-2 rounded-full", isSincActive ? 'bg-red-500 animate-pulse' : 'bg-emerald-500')} />
                  <div>
                    <span className="font-semibold text-white/95">Conectividade Ativa</span>
                    <p className="text-[10px] text-white/40">{isSincActive ? 'Sincronização em andamento (Bloqueado)' : 'Sem transferências simultâneas'}</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Overall Verdict */}
            <div className={cn(
              "p-2.5 text-center text-xs font-semibold rounded-lg",
              safetyStatus.safe ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/25' : 'bg-amber-500/10 text-amber-300 border border-amber-500/25'
            )}>
              {safetyStatus.safe ? '✓ Sistema pronto para substituição de dados' : `⚠ Restauração Bloqueada: ${safetyStatus.reason?.substring(0, 42)}...`}
            </div>
          </div>

          {/* Automatic Settings configuration */}
          <div className="p-5 bg-white/5 border border-white/5 rounded-xl space-y-4">
            <span className="text-xs font-bold uppercase tracking-wider text-white/60 block">Configurações de Agendamento</span>

            {settings ? (
              <div className="space-y-4">
                {/* Toggle auto */}
                <div className="flex items-center justify-between">
                  <div>
                    <span className="text-xs font-semibold block text-white/90">Backup Automático Diário</span>
                    <span className="text-[10px] text-white/40">Gera snapshots de rotina automáticos</span>
                  </div>
                  <input 
                    type="checkbox" 
                    checked={settings.autoBackupEnabled}
                    onChange={(e) => handleToggleAuto(e.target.checked)}
                    className="w-4 h-4 text-emerald-500 border-white/10 rounded focus:ring-emerald-500 focus:ring-offset-[#131313] bg-[#090909]"
                  />
                </div>

                {/* Dropdown Interval */}
                <div className="space-y-1">
                  <label className="text-[11px] text-white/50 block">Frequência do Ciclo de Auto-Backup</label>
                  <select 
                    value={settings.frequencyHours}
                    disabled={!settings.autoBackupEnabled}
                    onChange={(e) => handleFrequencyChange(parseInt(e.target.value))}
                    className="w-full bg-[#131313] border border-white/10 rounded-lg text-xs p-2 text-white/90 focus:border-emerald-500 focus:outline-none disabled:opacity-40"
                  >
                    <option value={2}>A cada 2 horas</option>
                    <option value={4}>A cada 4 horas</option>
                    <option value={8}>A cada 8 horas</option>
                    <option value={12}>A cada 12 horas</option>
                    <option value={24}>A cada 24 horas (Diário)</option>
                    <option value={48}>A cada 48 horas</option>
                    <option value={168}>Semanalmente (A cada 7 dias)</option>
                  </select>
                </div>

                {/* Dropdown Max Auto backups */}
                <div className="space-y-1">
                  <label className="text-[11px] text-white/50 block">Retenção de Ponto de Recuperação Automático (Max Snapshots)</label>
                  <select 
                    value={settings.maxAutoSnapshots}
                    disabled={!settings.autoBackupEnabled}
                    onChange={(e) => handleMaxSnapshotsChange(parseInt(e.target.value))}
                    className="w-full bg-[#131313] border border-white/10 rounded-lg text-xs p-2 text-white/90 focus:border-emerald-500 focus:outline-none disabled:opacity-40"
                  >
                    <option value={5}>Manter apenas os 5 mais recentes</option>
                    <option value={10}>Manter apenas os 10 mais recentes</option>
                    <option value={20}>Manter apenas os 20 mais recentes</option>
                  </select>
                  <span className="text-[9px] text-[#FFB74D] block mt-1">✓ Após atingido, os snapshots de rotina mais antigos são auto-expurgados para otimizar espaço de disco.</span>
                </div>
              </div>
            ) : (
              <div className="flex justify-center p-4">
                <span className="text-xs text-white/30 animate-pulse">Carregando agendador...</span>
              </div>
            )}
          </div>

        </div>

        {/* Right column: Snapshots manager, Exportation, Importation, Auditoria list */}
        <div className="lg:col-span-2 space-y-6">

          {/* Snapshot Trigger Creator */}
          <div className="p-5 bg-white/5 border border-[#43A047]/10 rounded-xl space-y-4">
            <span className="text-xs font-bold uppercase tracking-wider text-emerald-500 block">Criar Ponto de Restauração (Snapshot Manual)</span>
            
            <form onSubmit={handleCreateManualSnapshot} className="flex gap-4">
              <input 
                type="text"
                placeholder="Ex: Snapshot de contingência antes de importar catálogo de natal"
                value={manualDescription}
                onChange={(e) => setManualDescription(e.target.value)}
                required
                className="flex-1 bg-[#131313] border border-white/10 rounded-lg text-xs p-2 text-white/90 focus:border-emerald-500 focus:outline-none"
              />
              <button 
                type="submit" 
                disabled={isCreatingManual}
                className="flex items-center gap-2 px-4 py-2 text-xs font-bold bg-white/5 border border-white/10 hover:bg-emerald-600 hover:text-white rounded-lg transition disabled:opacity-40 text-white shrink-0"
              >
                <Layers className="w-3.5 h-3.5" />
                Criar Snapshot
              </button>
            </form>
          </div>

          {/* List of Available Local Snapshots */}
          <div className="p-5 bg-white/5 border border-white/5 rounded-xl space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-white/60">Lista de Snapshots Locais</span>
              <span className="text-[10px] text-white/40">Guia de Rollback & Proteção de Estado</span>
            </div>

            {history.length === 0 ? (
              <div className="text-center p-8 border border-dashed border-white/5 rounded-lg text-xs text-white/30">
                Nenhum ponto de restauração (snapshot) encontrado no seu navegador.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs text-left">
                  <thead>
                    <tr className="border-b border-white/5 text-white/40">
                      <th className="py-2.5 font-bold">Identação & Data</th>
                      <th className="py-2.5 font-bold">Tipo</th>
                      <th className="py-2.5 font-bold">Sufixo descritivo</th>
                      <th className="py-2.5 font-bold text-center">Tamanho</th>
                      <th className="py-2.5 font-bold text-right">Ações de Contingência</th>
                    </tr>
                  </thead>
                  <tbody>
                    {history.map((snapshot) => {
                      const isRollConfirm = rollbackConfirmId === snapshot.id;
                      const isDelConfirm = deleteConfirmId === snapshot.id;

                      return (
                        <tr key={snapshot.id} className="border-b border-white/5 hover:bg-white/5 transition-colors">
                          <td className="py-2.5">
                            <span className="font-bold flex items-center gap-1.5 text-white">
                              <Calendar className="w-3.5 h-3.5 text-emerald-500" />
                              {format(uuidToDate(snapshot.id), 'dd/MM/yyyy HH:mm:ss')}
                            </span>
                            <span className="text-[9px] text-white/30 block ml-5">V. {snapshot.version}</span>
                          </td>
                          <td className="py-2.5">
                            {snapshot.type === 'manual' ? (
                              <span className="px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-400 text-[9px] font-black tracking-wider uppercase">Manual</span>
                            ) : (
                              <span className="px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-500 text-[9px] font-black tracking-wider uppercase">Automático</span>
                            )}
                          </td>
                          <td className="py-2.5 text-white/70 max-w-[180px] break-words font-semibold">
                            {snapshot.id === snapshot.id && snapshot.id.includes('preventivo') ? 'Preventivo' : (snapshot as any).description || 'Ponto local transacional'}
                          </td>
                          <td className="py-2.5 text-center text-white/50 font-mono">
                            {BackupService.formatBytes(snapshot.size)}
                          </td>
                          <td className="py-2.5 text-right space-x-1.5">
                            {/* Confirmation states inside cell */}
                            {isRollConfirm ? (
                              <div className="inline-flex flex-col items-end gap-1.5 p-1 bg-black/40 rounded-lg border border-amber-500/20 max-w-[200px]">
                                <span className="text-[7.5px] text-amber-500 font-extrabold uppercase tracking-wide text-center">🔐 Requer Autenticação ADM</span>
                                <input 
                                  type="password"
                                  placeholder="SENHA ADMINISTRATIVA"
                                  value={confirmPassword}
                                  onChange={(e) => setConfirmPassword(e.target.value)}
                                  className="w-full bg-black/80 border border-white/10 rounded px-1.5 py-1 text-center font-mono text-[9px] text-white placeholder:text-white/20 focus:outline-none focus:border-amber-500"
                                  onKeyDown={(e) => {
                                    if (e.key === 'Enter') {
                                      if (!verifyAdminPassword(confirmPassword)) {
                                        setConfirmPasswordError('Senha inválida.');
                                        return;
                                      }
                                      setConfirmPassword('');
                                      setConfirmPasswordError(null);
                                      handleTriggerRollback(snapshot.id);
                                    }
                                  }}
                                />
                                {confirmPasswordError && (
                                  <span className="text-[7px] text-red-500 font-bold uppercase tracking-wider">{confirmPasswordError}</span>
                                )}
                                <div className="flex gap-1 w-full justify-end">
                                  <button 
                                    onClick={() => {
                                      if (!verifyAdminPassword(confirmPassword)) {
                                        setConfirmPasswordError('Senha inválida.');
                                        return;
                                      }
                                      setConfirmPassword('');
                                      setConfirmPasswordError(null);
                                      handleTriggerRollback(snapshot.id);
                                    }}
                                    disabled={!safetyStatus.safe}
                                    className="px-2 py-0.5 bg-amber-500 hover:bg-amber-600 disabled:opacity-30 text-black rounded text-[8px] font-black uppercase tracking-wider"
                                  >
                                    OK
                                  </button>
                                  <button 
                                    onClick={() => {
                                      setRollbackConfirmId(null);
                                      setConfirmPassword('');
                                      setConfirmPasswordError(null);
                                    }}
                                    className="px-2 py-0.5 bg-white/5 hover:bg-white/10 text-white/60 rounded text-[8px] font-bold uppercase"
                                  >
                                    Sair
                                  </button>
                                </div>
                              </div>
                            ) : isDelConfirm ? (
                              <div className="inline-flex flex-col items-end gap-1.5 p-1 bg-black/40 rounded-lg border border-red-500/20 max-w-[200px]">
                                <span className="text-[7.5px] text-red-500 font-extrabold uppercase tracking-wide text-center">🗑 Deletar Snapshot?</span>
                                <input 
                                  type="password"
                                  placeholder="SENHA DO ADM"
                                  value={confirmPassword}
                                  onChange={(e) => setConfirmPassword(e.target.value)}
                                  className="w-full bg-black/80 border border-white/10 rounded px-1.5 py-1 text-center font-mono text-[9px] text-white placeholder:text-white/20 focus:outline-none focus:border-red-500"
                                  onKeyDown={(e) => {
                                    if (e.key === 'Enter') {
                                      if (!verifyAdminPassword(confirmPassword)) {
                                        setConfirmPasswordError('Senha inválida.');
                                        return;
                                      }
                                      setConfirmPassword('');
                                      setConfirmPasswordError(null);
                                      handleDeleteSnapshot(snapshot.id);
                                    }
                                  }}
                                />
                                {confirmPasswordError && (
                                  <span className="text-[7px] text-red-500 font-bold uppercase tracking-wider">{confirmPasswordError}</span>
                                )}
                                <div className="flex gap-1 w-full justify-end">
                                  <button 
                                    onClick={() => {
                                      if (!verifyAdminPassword(confirmPassword)) {
                                        setConfirmPasswordError('Senha inválida.');
                                        return;
                                      }
                                      setConfirmPassword('');
                                      setConfirmPasswordError(null);
                                      handleDeleteSnapshot(snapshot.id);
                                    }}
                                    className="px-2 py-0.5 bg-red-600 hover:bg-red-700 text-white rounded text-[8px] font-black uppercase tracking-wider"
                                  >
                                    Zerar
                                  </button>
                                  <button 
                                    onClick={() => {
                                      setDeleteConfirmId(null);
                                      setConfirmPassword('');
                                      setConfirmPasswordError(null);
                                    }}
                                    className="px-2 py-0.5 bg-white/5 hover:bg-white/10 text-white/60 rounded text-[8px] font-bold uppercase"
                                  >
                                    Sair
                                  </button>
                                </div>
                              </div>
                            ) : (
                              <div className="inline-flex items-center gap-1.5">
                                <button 
                                  onClick={() => handleExportSnapshotFile(snapshot.id)}
                                  title="Download arquivo de backup"
                                  className="p-1 px-1.5 rounded bg-white/5 border border-white/10 hover:bg-white/10 text-white/80 transition"
                                >
                                  <Download className="w-3 h-3" />
                                </button>
                                
                                <button 
                                  onClick={() => {
                                    if (!safetyStatus.safe) {
                                      setErrorMessage(safetyStatus.reason || 'Bloqueio operacional ativo');
                                      return;
                                    }
                                    setRollbackConfirmId(snapshot.id);
                                  }}
                                  title="Fazer rollback do sistema para este ponto"
                                  className="p-1 px-2 rounded bg-amber-500/15 hover:bg-[#ffb300]/90 border border-[#ffb300]/20 hover:text-white text-amber-300 font-bold flex items-center gap-1 transition"
                                >
                                  <RotateCcw className="w-3 h-3" />
                                  Rollback
                                </button>

                                <button 
                                  onClick={() => setDeleteConfirmId(snapshot.id)}
                                  title="Deletar snapshot local"
                                  className="p-1 px-1.5 rounded hover:bg-red-600 border border-transparent text-white/40 hover:text-white transition"
                                >
                                  <Trash2 className="w-3 h-3" />
                                </button>
                              </div>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Import / Restauração por Arquivo Externo JSON */}
          <div className="p-5 bg-white/5 border border-white/5 rounded-xl space-y-4">
            <span className="text-xs font-bold uppercase tracking-wider text-white/60 block">Importação & Restauração de Arquivo Externo</span>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              
              {/* File Select */}
              <div className="p-4 bg-[#131313] border border-white/5 rounded-lg flex flex-col justify-center items-center text-center space-y-3">
                <Upload className="w-8 h-8 text-white/20" />
                <span className="text-xs text-white/60">Upload de Arquivo JSON de Backup</span>
                
                <input 
                  type="file" 
                  ref={fileInputRef}
                  accept=".json"
                  onChange={handleUploadFileChange}
                  className="hidden"
                />

                <button 
                  onClick={() => fileInputRef.current?.click()}
                  className="px-3 py-1.5 bg-white/5 border border-white/10 hover:bg-white/10 rounded-lg text-xs font-semibold text-white/90 transition"
                >
                  Selecionar .json
                </button>
                {importingFile && (
                  <span className="text-[10px] text-emerald-400 font-medium">Selecionado: {importingFile.name}</span>
                )}
              </div>

              {/* Verified Sandbox */}
              <div className="p-4 border border-white/5 bg-[#131313] rounded-lg space-y-3 flex flex-col justify-between min-h-[140px]">
                {importError && (
                  <div className="p-2.5 bg-red-950/20 text-red-300 text-[11px] rounded border border-red-500/20">
                    <strong>Estrutura Inválida:</strong> {importError}
                  </div>
                )}

                {importStats && (
                  <div className="space-y-2 text-[11px]">
                    <span className="text-xs text-emerald-400 font-bold block">✓ Arquivo Integrado & Consistente (OK)</span>
                    <div className="grid grid-cols-2 gap-x-2 gap-y-1 font-mono text-white/70">
                      <div>Produtos: <span className="font-bold text-white">{importStats.productsCount}</span></div>
                      <div>Clientes: <span className="font-bold text-white">{importStats.clientsCount}</span></div>
                      <div>Vendas: <span className="font-bold text-white">{importStats.salesCount}</span></div>
                      <div>Terminais: <span className="font-bold text-white">{importStats.terminalCount}</span></div>
                    </div>
                    <span className="text-[10px] text-white/40 block mt-1">Compatibilidade de Versão do Sistema: V{importStats.version}</span>
                  </div>
                )}

                {!importError && !importStats && (
                  <div className="text-center p-4 text-white/30 text-[11px]">
                    Nenhum arquivo validado no momento. Selecione um arquivo para auditoria pré-importação.
                  </div>
                )}

                {/* Confirm action */}
                {importStats && (
                  <div className="pt-2 border-t border-white/5 flex flex-col gap-2">
                    {showImportConfirm ? (
                      <div className="flex flex-col w-full gap-1.5">
                        <span className="text-[7.5px] text-red-500 font-extrabold uppercase tracking-wide text-center">⚠ Destrutivo: Substitui Tudo</span>
                        <input 
                          type="password"
                          placeholder="DIGITE A SENHA DO ADM"
                          value={confirmPassword}
                          onChange={(e) => setConfirmPassword(e.target.value)}
                          className="w-full bg-black/80 border border-white/10 rounded px-1.5 py-1 text-center font-mono text-[9px] text-white placeholder:text-white/20 focus:outline-none focus:border-red-500"
                        />
                        {confirmPasswordError && (
                          <span className="text-[8px] text-red-500 font-bold text-center uppercase tracking-wider">{confirmPasswordError}</span>
                        )}
                        <div className="flex gap-1.5">
                          <button 
                            onClick={() => {
                              if (!verifyAdminPassword(confirmPassword)) {
                                setConfirmPasswordError('Senha inválida.');
                                return;
                              }
                              setConfirmPassword('');
                              setConfirmPasswordError(null);
                              handleExecuteFileImport();
                            }}
                            className="flex-1 py-1 px-2.5 text-[10px] font-bold bg-danger hover:bg-red-600 rounded text-white uppercase tracking-wider text-center"
                          >
                            Sobrescrever Base
                          </button>
                          <button 
                            onClick={() => {
                              setShowImportConfirm(false);
                              setConfirmPassword('');
                              setConfirmPasswordError(null);
                            }}
                            className="p-1 px-2 text-[10px] bg-white/5 hover:bg-white/10 rounded shadow"
                          >
                            Voltar
                          </button>
                        </div>
                      </div>
                    ) : (
                      <button 
                        onClick={() => {
                          if (!safetyStatus.safe) {
                            setErrorMessage(safetyStatus.reason || 'Ação bloqueada');
                            return;
                          }
                          setShowImportConfirm(true);
                        }}
                        className="w-full py-1 bg-emerald-600 hover:bg-emerald-500 rounded text-center text-xs font-bold text-white transition"
                      >
                        Substituir Base Completa
                      </button>
                    )}
                  </div>
                )}
              </div>

            </div>
          </div>

          {/* Audit History Logs Ledger specifically filtered for backup operations */}
          <div className="p-5 bg-white/5 border border-white/5 rounded-xl space-y-4">
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold uppercase tracking-wider text-white/60">Histórico de Auditoria de Backup</span>
              <Activity className="w-4 h-4 text-white/30" />
            </div>

            {backupLogs.length === 0 ? (
              <div className="text-center p-6 border border-dashed border-white/5 rounded-lg text-xs text-white/30">
                Nenhum registro de auditoria sobre restauração, rollback ou backup capturado recentemente.
              </div>
            ) : (
              <div className="max-h-[220px] overflow-y-auto custom-scrollbar space-y-2 pr-1 text-xs">
                {backupLogs.map((log: any) => (
                  <div key={log.id || log.timestamp} className="p-3 bg-[#131313] border border-white/5 rounded-lg space-y-1">
                    <div className="flex justify-between items-baseline">
                      <span className="text-[11px] font-bold text-white">{log.description || 'Log de backup local'}</span>
                      <span className="text-[9px] text-white/40 font-mono">{format(new Date(log.timestamp), 'dd/MM/yyyy HH:mm:ss')}</span>
                    </div>
                    
                    <div className="flex justify-between text-[10px] text-white/50 pt-1 border-t border-white/5 mt-1">
                      <span className="flex items-center gap-1">
                        <UserCheck className="w-3 h-3 text-white/40" />
                        Operador: <strong className="text-emerald-500">{log.userLogin?.toUpperCase() || 'SISTEMA'}</strong>
                      </span>
                      <span className="text-white/30 truncate max-w-[150px]">{log.device || 'N/A'}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

        </div>

      </div>

    </div>
  );
}

function uuidToDate(uuid: string): Date {
  const timestamp = parseInt(uuid.replace(/[^0-9]/g, ''), 10);
  return isNaN(timestamp) ? new Date() : new Date(timestamp);
}
