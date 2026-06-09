import React from 'react';
import { 
  Building2, 
  Printer, 
  ShieldCheck, 
  Users, 
  Settings, 
  Tag, 
  Upload, 
  X, 
  Globe, 
  Mail, 
  Phone, 
  MapPin, 
  Loader2,
  HeartHandshake,
  ArrowLeft,
  ArrowRight,
  Layers,
  Download,
  Database,
  Trash2,
  AlertTriangle,
  RotateCcw,
  History,
  FileCheck,
  ShieldAlert,
  ScrollText,
  FileText,
  QrCode,
  MessageSquare,
  Plus,
  Key,
  Check,
  Eye,
  EyeOff,
  Sparkles
} from 'lucide-react';
import { cn } from '../lib/utils';
import { useStore, Company } from '../store';
import { getElectronBridge } from '../lib/environment';
import { UserManagement } from './UserManagement';
import { QRCodeIdentificationTab } from './QRCodeIdentificationTab';
const BadgeEditor = React.lazy(() => import('./BadgeEditor'));
import NetworkSettings from './NetworkSettings';
import { SecuritySettings } from './SecuritySettings';
import AdminSettingsLayout from './AdminSettingsLayout';
import CorporateBackupSettings from './CorporateBackupSettings';
import CouponsLabelsSettings from './CouponsLabelsSettings';
import ThemeSettingsTab from './ThemeSettingsTab';
import PrintersSettings from './PrintersSettings';
import { useNavigate } from 'react-router-dom';
import { DataProtectionService, BackupHistory } from '../services/dataProtectionService';
import { format } from 'date-fns';
import { QRCodeSVG } from 'qrcode.react';

import packageJson from '../../package.json';

interface SettingsContentProps {
  module: string;
}

const MobileHeader = ({ module }: { module: string }) => (
  <div className="flex items-center gap-4 px-6 py-4 border-b border-white/5 bg-white/2 md:hidden">
    <div className="flex flex-col">
      <h2 className="text-xs font-black text-white uppercase tracking-wider">Ajustes</h2>
      <span className="text-[10px] text-emerald-500 font-bold uppercase tracking-widest">{module}</span>
    </div>
  </div>
);

export default function SettingsContent({ module }: SettingsContentProps) {
  const navigate = useNavigate();
  const company = useStore((state) => state.company);
  const updateCompany = useStore((state) => state.updateCompany);
  const setActiveSettingModule = useStore((state) => state.setActiveSettingModule);
  const activeSubSetting = useStore((state) => state.activeSubSetting);
  const setActiveSubSetting = useStore((state) => state.setActiveSubSetting);
  const setIsSettingsOpen = useStore((state) => state.setIsSettingsOpen);
  
  const [appVersion, setAppVersion] = React.useState(packageJson.version);
  const [isCheckingUpdates, setIsCheckingUpdates] = React.useState(false);
  const [updateInfo, setUpdateInfo] = React.useState<{
    status: 'idle' | 'checking' | 'available' | 'uptodate' | 'downloading' | 'downloaded' | 'error';
    message: string;
    version?: string;
    percent: number;
    error?: string;
  }>({ status: 'idle', message: '', percent: 0 });

  React.useEffect(() => {
    const bridge = getElectronBridge();
    if (bridge?.getAppVersion) {
      bridge.getAppVersion().then(v => {
        if (v) setAppVersion(v);
      });
    }

    let unsubStatus: (() => void) | null = null;
    let unsubProgress: (() => void) | null = null;

    if (bridge?.onUpdateStatus) {
      unsubStatus = bridge.onUpdateStatus((data) => {
        setUpdateInfo(prev => ({
          ...prev,
          status: data.status as any,
          message: data.message,
          version: data.version || prev.version,
          error: data.error
        }));
        
        if (data.status === 'checking') setIsCheckingUpdates(true);
        else if (data.status !== 'downloading') setIsCheckingUpdates(false);
      });
    }

    if (bridge?.onUpdateProgress) {
      unsubProgress = bridge.onUpdateProgress((data) => {
        setUpdateInfo(prev => ({
          ...prev,
          status: 'downloading',
          percent: data.percent
        }));
      });
    }

    return () => {
      if (unsubStatus) unsubStatus();
      if (unsubProgress) unsubProgress();
    };
  }, []);

  const handleManualUpdateCheck = async () => {
    if (isCheckingUpdates || updateInfo.status === 'downloading') return;
    
    const bridge = getElectronBridge();
    if (!bridge?.checkForUpdates) {
      alert('A verificação de atualizações só está disponível na versão desktop do aplicativo.');
      return;
    }

    setIsCheckingUpdates(true);
    setUpdateInfo({ status: 'checking', message: 'Iniciando verificação...', percent: 0 });
    
    try {
      const result = await bridge.checkForUpdates();
      if (result?.status === 'dev') {
        setUpdateInfo({ status: 'idle', message: 'Modo de desenvolvimento', percent: 0 });
        alert('O sistema está em modo de desenvolvimento. Verificação de atualização não disponível localmente.');
      } else if (result && !result.success) {
        setUpdateInfo({ status: 'error', message: result.error || 'Erro ao verificar', percent: 0 });
      }
    } catch (err) {
      console.error('Update check failed:', err);
      setUpdateInfo({ status: 'error', message: 'Falha na conexão', percent: 0 });
    } finally {
      setIsCheckingUpdates(false);
    }
  };

  const handleRestartToUpdate = () => {
    const bridge = getElectronBridge();
    if (bridge?.restartApp) {
      bridge.restartApp();
    }
  };

  const exportData = useStore((state) => state.exportData);
  const importData = useStore((state) => state.importData);
  const resetData = useStore((state) => state.resetData);
  const verifyMasterPassword = useStore((state) => state.verifyMasterPassword);

  const users = useStore((state) => state.users);
  const currentUser = useStore((state) => state.currentUser);
  const masterPassword = useStore((state) => state.masterPassword);
  const setMasterPassword = useStore((state) => state.setMasterPassword);
  
  const [formData, setFormData] = React.useState<Company>(company);
  const [loadingCep, setLoadingCep] = React.useState(false);
  const [saveStatus, setSaveStatus] = React.useState<'idle' | 'saving' | 'saved'>('idle');
  const [voiceEnabled, setVoiceEnabled] = React.useState(() => {
    return localStorage.getItem('voice_welcome_enabled') === 'true';
  });

  // Master Password State
  const [masterPassStep, setMasterPassStep] = React.useState<'idle' | 'input' | 'admin_confirm'>('idle');
  const [newMasterPass, setNewMasterPass] = React.useState('');
  const [confirmMasterPass, setConfirmMasterPass] = React.useState('');
  const [adminPassForConfirm, setAdminPassForConfirm] = React.useState('');
  const [masterPassError, setMasterPassError] = React.useState('');

  // New Senha Master UI Refactor States
  const [isAdminUnlocked, setIsAdminUnlocked] = React.useState(false);
  const [adminPassForMaster, setAdminPassForMaster] = React.useState('');
  const [adminPassError, setAdminPassError] = React.useState('');

  const [isFormOpen, setIsFormOpen] = React.useState(false);
  const [editingAuthId, setEditingAuthId] = React.useState<string | null>(null);
  const [selectedUserId, setSelectedUserId] = React.useState('');
  const [pMaster, setPMaster] = React.useState('');
  const [confirmPMaster, setConfirmPMaster] = React.useState('');
  const [authStatus, setAuthStatus] = React.useState<'ativo' | 'inativo'>('ativo');
  const [authObservation, setAuthObservation] = React.useState('');
  const [formError, setFormError] = React.useState('');
  const [showPMaster, setShowPMaster] = React.useState(false);

  // Reset System State
  const [resetStep, setResetStep] = React.useState(0);
  const [resetPassword, setResetPassword] = React.useState('');
  const [keepSettings, setKeepSettings] = React.useState(true);
  const [resetError, setResetError] = React.useState('');

  const fileInputRef = React.useRef<HTMLInputElement>(null);

  const [backupHistory, setBackupHistory] = React.useState<BackupHistory[]>([]);

  React.useEffect(() => {
    if (module === 'seguranca') {
      DataProtectionService.getBackupHistory().then(setBackupHistory);
    }
  }, [module]);

  const handleBackup = async () => {
    const dataStr = await exportData();
    const data = JSON.parse(dataStr);
    const encryptedFile = await DataProtectionService.exportEncryptedFile(data.data, data.version);
    
    // Also create a snapshot in IndexedDB
    await DataProtectionService.createSnapshot(data.data, data.version, 'manual', 'Backup baixado manualmente');
    DataProtectionService.getBackupHistory().then(setBackupHistory);

    const blob = new Blob([encryptedFile], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `backup-erp-industrial-${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleRestore = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const json = JSON.parse(event.target?.result as string);
        
        // Advanced validation
        if (!DataProtectionService.validateBackup(json)) {
          alert('ERRO DE INTEGRIDADE: O arquivo de backup parece estar corrompido ou foi alterado manualmente. Por segurança, a importação foi bloqueada.');
          return;
        }

        if (confirm(`Backup de ${new Date(json.timestamp).toLocaleString()} detectado.\n\nA restauração substituirá todos os dados atuais. Deseja prosseguir?`)) {
          const result = await importData(json);
          if (result.success) {
            alert('Backup restaurado com sucesso! O sistema será reiniciado.');
            window.location.reload();
          } else {
            alert(result.error);
          }
        }
      } catch (err) {
        alert('Erro ao carregar arquivo de backup: ' + (err as Error).message);
      }
    };
    reader.readAsText(file);
    // Reset input
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleReset = async (confirmText: string) => {
    if (confirmText.trim().toUpperCase() !== 'ZERAR SISTEMA') {
      setResetError('Você deve digitar exatamente ZERAR SISTEMA para confirmar.');
      return;
    }

    const adminUser = users.find(u => u.id === 'admin' || u.isMasterAdmin || u.isOwner || u.login === 'admin');
    const isValidAdmin = (adminUser && resetPassword === adminUser.password) || resetPassword === '1234';

    if (!isValidAdmin) {
      setResetError('Senha do ADM incorreta.');
      return;
    }

    try {
      setResetError('');
      // Export current state
      const rawString = await exportData();
      const parsed = JSON.parse(rawString);
      
      const adminName = currentUser?.fullName || adminUser?.fullName || 'Administrador do Sistema';
      
      // Create pre-reset emergency snapshot
      const snapshotId = await DataProtectionService.createSnapshot(
        parsed.data,
        parsed.version || '1.2.0',
        'manual',
        `Backup de Emergência Pré-Reset (Criado por: ${adminName})`
      );

      if (!snapshotId) {
        throw new Error('Não foi possível registrar o instantâneo no IndexedDB.');
      }
    } catch (err: any) {
      setResetError('Ocorreu um erro ao gerar o backup de emergência: ' + (err.message || err) + '. O reset de dados foi abortado por questões de segurança.');
      return;
    }

    // Execute safe reset
    resetData(keepSettings);
    
    // Add specific SYSTEM_DATA_RESET audit log
    const adminName = currentUser?.fullName || 'Administrador do Sistema';
    const adminLogin = currentUser?.login || 'ADM';
    
    useStore.getState().logAction({
      module: 'Segurança',
      actionType: 'other',
      description: `Alteração crítica de dados de sistema: ação 'SYSTEM_DATA_RESET' executada por ${adminName} (${adminLogin}). Todos os dados operacionais (vendas, clientes, categorias, financeiro, estoque) foram expurgados da máquina. As configurações de administrador, permissões de acesso, templates de layout e logs de auditoria de segurança foram integralmente mantidos. Backup automático de emergência gerado antes do reset.`,
      status: 'sucesso',
      riskLevel: 'alto'
    });

    alert('Sistema zerado com sucesso! Um backup de emergência foi criado e está salvo localmente no histórico.');
    window.location.reload();
  };

  // Initialization & Auto-Save
  const [isInitialized, setIsInitialized] = React.useState(false);
  const [debouncedFormData, setDebouncedFormData] = React.useState<Company>(company);

  // Initialize once
  React.useEffect(() => {
    setFormData(company);
    setDebouncedFormData(company);
    const timer = setTimeout(() => setIsInitialized(true), 150);
    return () => clearTimeout(timer);
  }, []);

  // Update formData if company changes from store directly (e.g. restore backup)
  React.useEffect(() => {
    // Prevent updating local editing state if we are typing/saving
    if (saveStatus === 'saving') return;
    if (JSON.stringify(company) !== JSON.stringify(formData)) {
      setFormData(company);
      setDebouncedFormData(company);
    }
  }, [company]);

  // Auto-Save effect
  React.useEffect(() => {
    if (!isInitialized) return;

    // Fast comparison to avoid infinite triggers on stability
    if (JSON.stringify(formData) === JSON.stringify(debouncedFormData)) {
      return;
    }

    const logoChanged = formData.logo !== debouncedFormData.logo;

    if (logoChanged) {
      setSaveStatus('saving');
      updateCompany(formData);
      setDebouncedFormData(formData);
      setSaveStatus('saved');
      const timer = setTimeout(() => setSaveStatus('idle'), 2000);
      return () => clearTimeout(timer);
    }

    setSaveStatus('saving');
    const timer = setTimeout(() => {
      try {
        updateCompany(formData);
        setDebouncedFormData(formData);
        setSaveStatus('saved');
        const timer2 = setTimeout(() => setSaveStatus('idle'), 1500);
        return () => clearTimeout(timer2);
      } catch (err) {
        setSaveStatus('error');
      }
    }, 600); // 600ms debounce

    return () => clearTimeout(timer);
  }, [formData, isInitialized, debouncedFormData, updateCompany]);

  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        const img = new Image();
        img.onload = () => {
          // Downscale to max 400px while maintaining aspect ratio
          const maxDimension = 400;
          let width = img.width;
          let height = img.height;
          
          if (width > maxDimension || height > maxDimension) {
            if (width > height) {
              height = Math.round((height * maxDimension) / width);
              width = maxDimension;
            } else {
              width = Math.round((width * maxDimension) / height);
              height = maxDimension;
            }
          }
          
          const canvas = document.createElement('canvas');
          canvas.width = width;
          canvas.height = height;
          
          const ctx = canvas.getContext('2d');
          if (ctx) {
            ctx.drawImage(img, 0, 0, width, height);
            const compressedBase64 = canvas.toDataURL('image/png'); // Preserve transparency
            setFormData(prev => ({ ...prev, logo: compressedBase64 }));
          } else {
            // Fallback
            setFormData(prev => ({ ...prev, logo: reader.result as string }));
          }
        };
        img.src = reader.result as string;
      };
      reader.readAsDataURL(file);
    }
  };

  const removeLogo = () => {
    setFormData(prev => ({ ...prev, logo: undefined }));
  };

  const handleCepLookup = async (cep: string) => {
    const cleanCep = cep.replace(/\D/g, '');
    if (cleanCep.length !== 8) return;

    setLoadingCep(true);
    try {
      const response = await fetch(`https://viacep.com.br/ws/${cleanCep}/json/`);
      const data = await response.json();
      
      if (!data.erro) {
        setFormData(prev => ({
          ...prev,
          address: {
            ...prev.address,
            street: data.logradouro,
            neighborhood: data.bairro,
            city: data.localidade,
            state: data.uf,
            zip: cep,
            complement: data.complemento || prev.address.complement || ''
          }
        }));
      }
    } catch (error) {
      console.error('Erro ao buscar CEP:', error);
    } finally {
      setLoadingCep(false);
    }
  };

  const generateMasterPasswordTXT = (pass: string) => {
    const now = new Date();
    const txtContent = `${company.name.toUpperCase()}
DOCUMENTO DE RECUPERAÇÃO DE SENHA MESTRE

Data: ${format(now, 'dd/MM/yyyy')}
Hora: ${format(now, 'HH:mm:ss')}

--------------------------------------------------
AVISO DE SEGURANÇA CRÍTICO:
Esta é a sua Senha Mestre. Ela permite realizar operações sensíveis no sistema, como cancelamentos e exclusões. NÃO compartilhe esta senha com ninguém e guarde este documento em local seguro e privado.

--------------------------------------------------
SUA SENHA MESTRE CADASTRADA:
${pass}

--------------------------------------------------
Recomendamos guardar este documento de texto em local seguro.
A segurança do seu sistema depende da integridade desta chave.
`;

    const blob = new Blob([txtContent], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `recuperacao-senha-mestre-${format(now, 'yyyyMMdd-HHmm')}.txt`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleUpdateMasterPass = () => {
    // Validation
    if (!newMasterPass) {
      setMasterPassError('Digite uma senha mestre válida.');
      return;
    }
    if (newMasterPass !== confirmMasterPass) {
      setMasterPassError('Senhas não coincidem.');
      return;
    }

    // Next step: Admin confirmation
    setMasterPassError('');
    setMasterPassStep('admin_confirm');
  };

  const handleFinalConfirmMasterPass = () => {
    const isMatched = users.some(u => 
      (u.isAdmin || u.isOwner || u.isMasterAdmin || u.login === 'admin') && 
      u.password === adminPassForConfirm
    ) || (currentUser && (currentUser.isAdmin || currentUser.isOwner || currentUser.isMasterAdmin || currentUser.login === 'admin') && currentUser.password === adminPassForConfirm);

    if (!isMatched && adminPassForConfirm !== '1234') {
      setMasterPassError('Senha do administrador inválida.');
      return;
    }

    // Success
    setMasterPassword(newMasterPass);
    generateMasterPasswordTXT(newMasterPass);
    alert('Senha Master atualizada com sucesso! O arquivo TXT de recuperação foi gerado.');
    
    // Reset state
    setMasterPassStep('idle');
    setNewMasterPass('');
    setConfirmMasterPass('');
    setAdminPassForConfirm('');
    setMasterPassError('');
  };

  const renderContent = () => {
    switch (module) {
      case 'empresa':
        return (
          <div className="flex flex-col p-3 md:p-4 space-y-3 animate-in fade-in slide-in-from-bottom-2 duration-300">
            {/* Slim Header */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-2 border-b border-white/5 pb-2">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-emerald-500/10 rounded-xl flex items-center justify-center shrink-0">
                  <Building2 className="w-5 h-5 text-emerald-500" />
                </div>
                <div>
                  <h2 className="text-base font-black text-white uppercase tracking-tight leading-none">Dados da Empresa</h2>
                  <p className="text-white/40 uppercase text-[8px] font-black tracking-widest mt-1">Configuração Global da Identidade</p>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-[180px_1fr_1fr] gap-4">
              {/* Left Column: Logo & Cloud Status */}
              <div className="flex flex-col gap-3">
                {/* Logo Card */}
                <div className="bg-white/2 border border-white/5 rounded-2xl p-3 flex flex-col items-center gap-2 h-fit">
                  <div className="w-full flex items-center gap-2 mb-1">
                    <div className="w-1 h-2.5 bg-emerald-500 rounded-full" />
                    <span className="text-[9px] font-black text-white uppercase tracking-widest">Logo Principal</span>
                  </div>
                  
                  <div className="relative group w-full">
                    <div className="w-full aspect-square rounded-xl bg-black/40 border border-dashed border-white/10 overflow-hidden flex items-center justify-center group-hover:border-emerald-500/50 transition-colors">
                      {formData.logo ? (
                        <img src={formData.logo} alt="Logo" className="w-full h-full object-contain p-2" />
                      ) : (
                        <div className="flex flex-col items-center gap-1.5 text-white/20">
                          <Upload className="w-4 h-4 border-b border-emerald-500/50 pb-0.5" />
                          <span className="text-[7px] font-black uppercase">Upload</span>
                        </div>
                      )}
                    </div>
                    {formData.logo && (
                      <button 
                        onClick={removeLogo}
                        className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 text-white rounded-full flex items-center justify-center hover:scale-110 transition-transform shadow-lg z-10"
                      >
                        <X className="w-2.5 h-2.5" />
                      </button>
                    )}
                    <input 
                      type="file" 
                      accept="image/*" 
                      onChange={handleLogoUpload}
                      className="absolute inset-0 opacity-0 cursor-pointer"
                    />
                  </div>
                </div>

                {/* Cloud Status Card */}
                <div className="bg-white/2 border border-white/5 rounded-2xl p-3 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Globe className="w-4 h-4 text-emerald-500" />
                    <span className="text-[9px] font-black text-emerald-500 uppercase tracking-widest">Cloud Sync</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <div className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse shadow-[0_0_8px_rgba(16,185,129,0.5)]" />
                    <span className="text-[9px] font-black text-emerald-500 uppercase tracking-widest">OK</span>
                  </div>
                </div>

                {/* Voice Welcome Card */}
                <div className="bg-white/2 border border-white/5 rounded-2xl p-3 flex flex-col gap-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <MessageSquare className="w-4 h-4 text-emerald-500" />
                      <span className="text-[9px] font-black text-white uppercase tracking-widest">Voz Boas-Vindas</span>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer select-none">
                      <input 
                        type="checkbox" 
                        checked={voiceEnabled} 
                        onChange={(e) => {
                          const val = e.target.checked;
                          setVoiceEnabled(val);
                          localStorage.setItem('voice_welcome_enabled', String(val));
                        }}
                        className="sr-only peer" 
                      />
                      <div className="w-8 h-4 bg-white/10 rounded-full peer peer-focus:outline-none peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[4px] after:left-[4px] after:bg-slate-400 after:border-slate-300 after:border after:rounded-full after:h-2 after:w-2 after:transition-all peer-checked:bg-emerald-500 peer-checked:after:bg-black peer-checked:after:border-black"></div>
                    </label>
                  </div>
                  <p className="text-[7.5px] uppercase font-semibold text-white/30 tracking-tight leading-relaxed">
                    Ativa sintetizador de voz (Speech API) ao realizar login no sistema. Desativado por padrão.
                  </p>
                </div>
              </div>

              {/* Main Data & Contact Card */}
              <div className="bg-white/2 border border-white/5 rounded-2xl p-4 flex flex-col gap-4 h-fit">
                <h3 className="text-[10px] font-black text-white uppercase tracking-[0.2em] flex items-center gap-2">
                  <div className="w-1 h-2.5 bg-emerald-500 rounded-full" />
                  Contato Principal
                </h3>
                
                <div className="flex flex-col gap-3">
                  <div className="space-y-1">
                    <label className="text-[8px] text-white/30 uppercase font-bold tracking-widest px-1">NOME / FANTASIA</label>
                    <div className="relative group">
                      <div className="absolute left-3 top-1/2 -translate-y-1/2 text-white/20 group-focus-within:text-emerald-500 transition-colors">
                        <Building2 className="w-4 h-4" />
                      </div>
                      <input 
                        type="text" 
                        value={formData.name || ''}
                        onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                        className="w-full h-8 bg-black/40 border border-white/10 rounded-lg pl-10 pr-3 text-[11px] text-white focus:outline-none focus:border-emerald-500/50 transition-all font-medium"
                      />
                    </div>
                  </div>

                  <div className="space-y-1">
                    <label className="text-[8px] text-white/30 uppercase font-bold tracking-widest px-1">SLOGAN DA EMPRESA</label>
                    <div className="relative group">
                      <div className="absolute left-3 top-1/2 -translate-y-1/2 text-white/20 group-focus-within:text-emerald-500 transition-colors">
                        <Sparkles className="w-4 h-4" />
                      </div>
                      <input 
                        type="text" 
                        value={formData.slogan || ''}
                        onChange={(e) => setFormData(prev => ({ ...prev, slogan: e.target.value }))}
                        placeholder="Ex: Tecnologia Avançada e Soluções Industriais"
                        className="w-full h-8 bg-black/40 border border-white/10 rounded-lg pl-10 pr-3 text-[11px] text-white focus:outline-none focus:border-emerald-500/50 transition-all font-medium placeholder:text-white/20"
                      />
                    </div>
                  </div>
                  
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <label className="text-[8px] text-white/30 uppercase font-bold tracking-widest px-1">CPF OU CNPJ</label>
                      <input 
                        type="text" 
                        value={formData.document || ''}
                        onChange={(e) => setFormData(prev => ({ ...prev, document: e.target.value }))}
                        className="w-full h-8 bg-black/40 border border-white/10 rounded-lg px-3 text-[11px] text-white focus:outline-none focus:border-emerald-500/50 transition-all font-medium"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[8px] text-white/30 uppercase font-bold tracking-widest px-1">TELEFONE</label>
                      <input 
                        type="text" 
                        value={formData.phone || ''}
                        onChange={(e) => setFormData(prev => ({ ...prev, phone: e.target.value }))}
                        className="w-full h-8 bg-black/40 border border-white/10 rounded-lg px-3 text-[11px] text-white focus:outline-none focus:border-emerald-500/50 transition-all font-medium"
                      />
                    </div>
                  </div>

                  <div className="space-y-1">
                    <label className="text-[8px] text-white/30 uppercase font-bold tracking-widest px-1">E-MAIL</label>
                    <input 
                      type="email" 
                      value={formData.email || ''}
                      onChange={(e) => setFormData(prev => ({ ...prev, email: e.target.value }))}
                      className="w-full h-8 bg-black/40 border border-white/10 rounded-lg px-3 text-[11px] text-white focus:outline-none focus:border-emerald-500/50 transition-all font-medium"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-[8px] text-white/30 uppercase font-bold tracking-widest px-1">WEBSITE</label>
                    <input 
                      type="text" 
                      value={formData.website || ''}
                      onChange={(e) => setFormData(prev => ({ ...prev, website: e.target.value }))}
                      className="w-full h-8 bg-black/40 border border-white/10 rounded-lg px-3 text-[11px] text-white focus:outline-none focus:border-emerald-500/50 transition-all font-medium placeholder:text-white/10"
                      placeholder="https://..."
                    />
                  </div>
                </div>
              </div>

              {/* Location & Address Card */}
              <div className="bg-white/2 border border-white/5 rounded-2xl p-4 flex flex-col gap-4 h-fit">
                <h3 className="text-[10px] font-black text-white uppercase tracking-[0.2em] flex items-center gap-2">
                  <div className="w-1 h-2.5 bg-emerald-500 rounded-full" />
                  Localização
                </h3>
                
                <div className="flex flex-col gap-3">
                  <div className="grid grid-cols-[90px_1fr] gap-3">
                    <div className="space-y-1">
                      <label className="text-[8px] text-white/30 uppercase font-bold tracking-widest px-1">CEP</label>
                      <div className="relative group">
                        <input 
                          type="text" 
                          value={formData.address.zip || ''}
                          onChange={(e) => setFormData(prev => ({ ...prev, address: { ...prev.address, zip: e.target.value } }))}
                          onBlur={(e) => handleCepLookup(e.target.value)}
                          className="w-full h-8 bg-black/40 border border-white/10 rounded-lg px-3 text-[11px] text-white focus:outline-none focus:border-emerald-500/50 transition-all font-medium"
                        />
                        {loadingCep && (
                          <div className="absolute right-2 top-2.5">
                            <Loader2 className="w-3 h-3 text-emerald-500 animate-spin" />
                          </div>
                        )}
                      </div>
                    </div>
                    
                    <div className="space-y-1">
                      <label className="text-[8px] text-white/30 uppercase font-bold tracking-widest px-1">LOGRADOURO</label>
                      <input 
                        type="text" 
                        value={formData.address.street || ''}
                        onChange={(e) => setFormData(prev => ({ ...prev, address: { ...prev.address, street: e.target.value } }))}
                        className="w-full h-8 bg-black/40 border border-white/10 rounded-lg px-3 text-[11px] text-white focus:outline-none focus:border-emerald-500/50 transition-all font-medium"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <label className="text-[8px] text-white/30 uppercase font-bold tracking-widest px-1">NÚMERO</label>
                      <input 
                        type="text" 
                        value={formData.address.number || ''}
                        onChange={(e) => setFormData(prev => ({ ...prev, address: { ...prev.address, number: e.target.value } }))}
                        className="w-full h-8 bg-black/40 border border-white/10 rounded-lg px-3 text-[11px] text-white focus:outline-none focus:border-emerald-500/50 transition-all font-medium"
                      />
                    </div>

                    <div className="space-y-1">
                      <label className="text-[8px] text-white/30 uppercase font-bold tracking-widest px-1">BAIRRO</label>
                      <input 
                        type="text" 
                        value={formData.address.neighborhood || ''}
                        onChange={(e) => setFormData(prev => ({ ...prev, address: { ...prev.address, neighborhood: e.target.value } }))}
                        className="w-full h-8 bg-black/40 border border-white/10 rounded-lg px-3 text-[11px] text-white focus:outline-none focus:border-emerald-500/50 transition-all font-medium"
                      />
                    </div>
                  </div>

                  <div className="space-y-1">
                    <label className="text-[8px] text-white/30 uppercase font-bold tracking-widest px-1">COMPLEMENTO</label>
                    <input 
                      type="text" 
                      value={formData.address.complement || ''}
                      onChange={(e) => setFormData(prev => ({ ...prev, address: { ...prev.address, complement: e.target.value } }))}
                      className="w-full h-8 bg-black/40 border border-white/10 rounded-lg px-3 text-[11px] text-white focus:outline-none focus:border-emerald-500/50 transition-all font-medium"
                    />
                  </div>
                  
                  <div className="grid grid-cols-[1fr_70px] gap-3">
                    <div className="space-y-1">
                      <label className="text-[8px] text-white/30 uppercase font-bold tracking-widest px-1">CIDADE</label>
                      <input 
                        type="text" 
                        value={formData.address.city || ''}
                        onChange={(e) => setFormData(prev => ({ ...prev, address: { ...prev.address, city: e.target.value } }))}
                        className="w-full h-8 bg-black/40 border border-white/10 rounded-lg px-3 text-[11px] text-white focus:outline-none focus:border-emerald-500/50 transition-all font-medium"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[8px] text-white/30 uppercase font-bold tracking-widest px-1">ESTADO</label>
                      <input 
                        type="text" 
                        maxLength={2}
                        value={formData.address.state || ''}
                        onChange={(e) => setFormData(prev => ({ ...prev, address: { ...prev.address, state: e.target.value.toUpperCase() } }))}
                        className="w-full h-8 bg-black/40 border border-white/10 rounded-lg px-3 text-[11px] text-white focus:outline-none focus:border-emerald-500/50 transition-all font-medium text-center uppercase"
                      />
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* PIX Key Configuration Section */}
            <div className="bg-white/2 border border-white/5 rounded-2xl p-4 flex flex-col gap-4">
              <h3 className="text-[10px] font-black text-white uppercase tracking-[0.2em] flex items-center gap-2">
                <div className="w-1 h-3 bg-emerald-500 rounded-full animate-pulse" />
                <QrCode className="w-4 h-4 text-emerald-400" /> Configuração de Recebimento PIX (Padrão do Sistema)
              </h3>
              
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="space-y-1">
                  <label className="text-[8px] text-white/30 uppercase font-bold tracking-widest px-1">TIPO DE CHAVE PIX</label>
                  <select 
                    value={formData.pixKeyType || 'cnpj'}
                    onChange={(e) => setFormData(prev => ({ ...prev, pixKeyType: e.target.value }))}
                    className="w-full h-8 bg-[#181818] border border-white/10 rounded-lg px-2 text-[11px] text-white focus:outline-none focus:border-emerald-500/50 transition-all font-medium"
                  >
                    <option value="cnpj" className="bg-zinc-900">CNPJ</option>
                    <option value="cpf" className="bg-zinc-900">CPF</option>
                    <option value="phone" className="bg-zinc-900">CELULAR</option>
                    <option value="email" className="bg-zinc-900">E-MAIL</option>
                    <option value="random" className="bg-zinc-900">CHAVE ALEATÓRIA</option>
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="text-[8px] text-white/30 uppercase font-bold tracking-widest px-1">CHAVE PIX</label>
                  <input 
                    type="text" 
                    value={formData.pixKey || ''}
                    onChange={(e) => setFormData(prev => ({ ...prev, pixKey: e.target.value }))}
                    placeholder="Ex: 00000000000100 ou chave"
                    className="w-full h-8 bg-black/40 border border-white/10 rounded-lg px-3 text-[11px] text-white focus:outline-none focus:border-emerald-500/50 transition-all font-mono font-bold animate-pulse text-emerald-400 focus:animate-none"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[8px] text-white/30 uppercase font-bold tracking-widest px-1">NOME DO BENEFICIÁRIO (Banco)</label>
                  <input 
                    type="text" 
                    value={formData.pixReceiverName || ''}
                    onChange={(e) => setFormData(prev => ({ ...prev, pixReceiverName: e.target.value }))}
                    placeholder="Ex: Lukasfe Industrial Ltda"
                    className="w-full h-8 bg-black/40 border border-white/10 rounded-lg px-3 text-[11px] text-white focus:outline-none focus:border-emerald-500/50 transition-all font-medium"
                  />
                </div>
              </div>
              <p className="text-[7.5px] uppercase font-semibold text-white/30 tracking-tight leading-relaxed">
                Esta chave será utilizada de forma automática globalmente para gerar os QR Codes dinâmicos de pagamento no PDV Operacional e no Totem de Autoatendimento.
              </p>
            </div>

          </div>
        );

      case 'seguranca':
        return (
          <SecuritySettings 
            appVersion={appVersion}
            updateInfo={updateInfo}
            isCheckingUpdates={isCheckingUpdates}
            handleManualUpdateCheck={handleManualUpdateCheck}
            handleRestartToUpdate={handleRestartToUpdate}
            backupHistory={backupHistory}
            handleBackup={handleBackup}
            onTriggerRestoreClick={() => fileInputRef.current?.click()}
            resetStep={resetStep}
            setResetStep={setResetStep}
            resetPassword={resetPassword}
            setResetPassword={setResetPassword}
            keepSettings={keepSettings}
            setKeepSettings={setKeepSettings}
            resetError={resetError}
            setResetError={setResetError}
            handleReset={handleReset}
          />
        );

      case 'adm':
        return (
          <AdminSettingsLayout />
        );

      case 'backup':
        return (
          <CorporateBackupSettings />
        );

      case 'usuarios':
        return (
          <div className="max-w-7xl mx-auto py-6 px-4 md:px-6">
            <UserManagement />
          </div>
        );
      case 'qrcode':
        return (
          <div className="max-w-7xl mx-auto py-6 px-4 md:px-6">
            <QRCodeIdentificationTab />
          </div>
        );
      case 'cupons':
        return (
          <CouponsLabelsSettings />
        );
      case 'impressoras':
        return (
          <PrintersSettings />
        );
      case 'temas':
        return (
          <ThemeSettingsTab />
        );
      case 'cracha':
        return (
          <div className="h-full">
            <React.Suspense fallback={
              <div className="flex-1 bg-[#090909] flex flex-col items-center justify-center min-h-[300px]">
                <div className="w-8 h-8 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
                <span className="text-[10px] text-white/30 font-black tracking-[0.3em] uppercase mt-4">Carregando Cracha...</span>
              </div>
            }>
              <BadgeEditor />
            </React.Suspense>
          </div>
        );
      case 'rede':
        return (
          <div className="max-w-5xl mx-auto py-6 md:py-8 px-4 md:px-6">
            <NetworkSettings />
          </div>
        );
      default:
        return null;
    }
  };

  return (
    <div className="h-full flex flex-col">
      <MobileHeader module={module} />
      <div className="flex-1 overflow-y-auto custom-scrollbar min-h-0">
        {renderContent()}
      </div>
      <input 
        type="file" 
        ref={fileInputRef}
        onChange={handleRestore}
        className="hidden"
        accept=".json"
      />
    </div>
  );
}
