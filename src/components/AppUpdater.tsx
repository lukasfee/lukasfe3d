import React from 'react';
import { 
  RotateCcw, 
  Loader2, 
  AlertCircle, 
  CheckCircle2, 
  Download, 
  Smartphone, 
  Laptop, 
  ChevronRight, 
  PackageCheck 
} from 'lucide-react';
import { cn } from '../lib/utils';
import { getElectronBridge } from '../lib/environment';
import { 
  isAndroidNative, 
  checkAndroidUpdate, 
  downloadAndInstallApk, 
  UpdateInfo 
} from '../services/updateService';
import packageJson from '../../package.json';

export function AppUpdater() {
  const [appVersion, setAppVersion] = React.useState(packageJson.version);
  const [isChecking, setIsChecking] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [apkUpdateInfo, setApkUpdateInfo] = React.useState<UpdateInfo | null>(null);
  const [showManualInput, setShowManualInput] = React.useState(false);
  const [manualApkUrl, setManualApkUrl] = React.useState('');
  
  // UI update states (unifies display between Electron/Android checks)
  const [updateState, setUpdateState] = React.useState<{
    status: 'idle' | 'checking' | 'available' | 'uptodate' | 'downloading' | 'downloaded' | 'error';
    message: string;
    percent: number;
    targetVersion?: string;
  }>({
    status: 'idle',
    message: 'Sistema pronto para verificação.',
    percent: 0
  });

  const isAndroid = isAndroidNative();
  const bridge = getElectronBridge();

  // Set up electron bridge listeners on mount
  React.useEffect(() => {
    let unsubStatus: (() => void) | null = null;
    let unsubProgress: (() => void) | null = null;

    if (bridge) {
      if (bridge.getAppVersion) {
        bridge.getAppVersion().then(v => {
          if (v) setAppVersion(v);
        });
      }

      if (bridge.onUpdateStatus) {
        unsubStatus = bridge.onUpdateStatus((data) => {
          setUpdateState(prev => ({
            ...prev,
            status: data.status as any,
            message: data.message,
            targetVersion: data.version || prev.targetVersion
          }));
          if (data.status === 'checking') setIsChecking(true);
          else if (data.status !== 'downloading') setIsChecking(false);
          if (data.status === 'error' && data.error) {
            setError(data.error);
          }
        });
      }

      if (bridge.onUpdateProgress) {
        unsubProgress = bridge.onUpdateProgress((data) => {
          setUpdateState(prev => ({
            ...prev,
            status: 'downloading',
            percent: Math.round(data.percent)
          }));
        });
      }
    } else if (isAndroid) {
      // Just check current version from package.json
      setAppVersion(packageJson.version);
    }

    return () => {
      if (unsubStatus) unsubStatus();
      if (unsubProgress) unsubProgress();
    };
  }, [bridge, isAndroid]);

  // Handle checking for updates manually
  const handleCheckUpdate = async () => {
    if (isChecking || updateState.status === 'downloading') return;
    
    setIsChecking(true);
    setError(null);
    setUpdateState({
      status: 'checking',
      message: 'Consultando servidores por atualizações...',
      percent: 0
    });

    if (bridge) {
      // Windows/Desktop standard routine
      try {
        const result = await bridge.checkForUpdates();
        if (result?.status === 'dev') {
          setUpdateState({
            status: 'idle',
            message: 'O aplicativo está rodando em modo de desenvolvimento.',
            percent: 0
          });
          setIsChecking(false);
        } else if (result && !result.success) {
          setUpdateState({
            status: 'error',
            message: result.error || 'Erro de rede ao verificar atualização.',
            percent: 0
          });
          setError(result.error || 'Erro desconhecido');
          setIsChecking(false);
        }
      } catch (err: any) {
        console.error('Desktop update check error:', err);
        setUpdateState({
          status: 'error',
          message: 'Falha de comunicação com o atualizador.',
          percent: 0
        });
        setError(err?.message || 'Erro de canais IPC');
        setIsChecking(false);
      }
    } else if (isAndroid) {
      // Prepared Android/Capacitor lookup flow
      try {
        const info = await checkAndroidUpdate();
        setApkUpdateInfo(info);

        if (info.available) {
          setUpdateState({
            status: 'available',
            message: `Nova versão ${info.latestVersion} disponível para instalação manual.`,
            percent: 0,
            targetVersion: info.latestVersion
          });
        } else {
          setUpdateState({
            status: 'uptodate',
            message: 'Você já está utilizando a última versão estável disponível.',
            percent: 0,
            targetVersion: info.latestVersion
          });
        }
      } catch (err: any) {
        console.error('Android update check error:', err);
        setUpdateState({
          status: 'error',
          message: 'Erro ao consultar repositório de lançamentos.',
          percent: 0
        });
        setError(err?.message || 'Erro HTTP');
      } finally {
        setIsChecking(false);
      }
    } else {
      // Web browser preview indicator
      setTimeout(() => {
        setUpdateState({
          status: 'idle',
          message: 'Canal de atualizações automáticas desativado em ambiente Web Browser.',
          percent: 0
        });
        setIsChecking(false);
      }, 800);
    }
  };

  // Handle starting Android installer or restarting Desktop
  const handleApplyUpdate = async () => {
    if (bridge) {
      if (bridge.restartApp) {
        bridge.restartApp();
      }
    } else if (isAndroid && apkUpdateInfo?.apkUrl) {
      setError(null);
      setUpdateState(prev => ({
        ...prev,
        status: 'downloading',
        message: 'Iniciando transferência direta do pacote APK...',
        percent: 0
      }));

      try {
        const res = await downloadAndInstallApk(apkUpdateInfo.apkUrl, (val) => {
          setUpdateState(prev => ({
            ...prev,
            percent: val,
            message: val < 90 ? `Baixando pacote APK (${val}%)...` : 'Gravando arquivo e inicializando instalador nativo...'
          }));
        });

        if (res.success) {
          setUpdateState(prev => ({
            ...prev,
            status: 'downloaded',
            message: 'APK enviado para o sistema Android. Finalize a instalação na tela aberta.',
            percent: 100
          }));
        } else {
          setUpdateState(prev => ({
            ...prev,
            status: 'error',
            message: res.error || 'Falha ao processar download do APK.',
            percent: 0
          }));
          setError(res.error || 'Erro na persistência de arquivos APK.');
        }
      } catch (err: any) {
        setUpdateState(prev => ({
          ...prev,
          status: 'error',
          message: 'Falha ao baixar o arquivo da atualização.',
          percent: 0
        }));
        setError(err?.message || 'Falha de conexão.');
      }
    }
  };

  const handleApplyManualApk = async () => {
    if (!manualApkUrl.trim()) {
      setError("Por favor, digite uma URL válida para o arquivo APK.");
      return;
    }
    setError(null);
    setUpdateState({
      status: 'downloading',
      message: 'Iniciando transferência direta do pacote APK manual...',
      percent: 0
    });

    try {
      const res = await downloadAndInstallApk(manualApkUrl.trim(), (val) => {
        setUpdateState(prev => ({
          ...prev,
          percent: val,
          message: val < 90 ? `Baixando pacote APK manual (${val}%)...` : 'Gravando arquivo e inicializando instalador nativo...'
        }));
      });

      if (res.success) {
        setUpdateState(prev => ({
          ...prev,
          status: 'downloaded',
          message: 'APK manual transferido com sucesso. Finalize o processo na tela aberta.',
          percent: 100
        }));
      } else {
        setUpdateState(prev => ({
          ...prev,
          status: 'error',
          message: res.error || 'Falha ao processar download do APK customizado.',
          percent: 0
        }));
        setError(res.error || 'Erro na persistência do arquivo.');
      }
    } catch (err: any) {
      setUpdateState(prev => ({
        ...prev,
        status: 'error',
        message: 'Falha durante o download do APK manual.',
        percent: 0
      }));
      setError(err?.message || 'Erro de conexão HTTP.');
    }
  };

  return (
    <div className="p-4 bg-white/5 border border-blue-500/20 rounded-2xl space-y-4">
      
      {/* Target status header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-blue-500/10 rounded-xl leading-none flex items-center justify-center">
            {isAndroid ? (
              <Smartphone className="w-4 h-4 text-blue-400" />
            ) : (
              <Laptop className="w-4 h-4 text-blue-400" />
            )}
          </div>
          <div className="flex flex-col">
            <span className="text-xs font-black text-white uppercase tracking-tight">
              Software v{appVersion}
            </span>
            <span className="text-[7.5px] text-white/35 uppercase font-black tracking-widest mt-0.5">
              {isAndroid ? 'Dispositivo Android (APK)' : bridge ? 'Versão Desktop (Electron)' : 'Ambiente Server/Web'}
            </span>
          </div>
        </div>
        <div className="px-2 py-0.5 rounded-full text-[7px] font-black uppercase tracking-widest bg-blue-500/10 text-blue-400 border border-blue-500/20 select-none">
          {isAndroid ? 'Capacitor APK' : bridge ? 'Desktop APP' : 'Web SDK'}
        </div>
      </div>

      {/* Main operational state display */}
      {updateState.status !== 'idle' && (
        <div className="bg-black/35 rounded-xl p-3 border border-white/5 space-y-3.5 animate-in fade-in zoom-in-95 duration-200">
          <div className="flex items-center justify-between">
            <div className="flex flex-col gap-0.5 min-w-0">
              <span className={cn(
                "text-[8.5px] font-black uppercase tracking-wider flex items-center gap-1.5",
                updateState.status === 'error' ? "text-red-500" : 
                updateState.status === 'downloaded' ? "text-emerald-500" :
                updateState.status === 'uptodate' ? "text-emerald-400" :
                "text-blue-400"
              )}>
                {updateState.status === 'checking' && (
                  <>
                    <Loader2 className="w-3 h-3 animate-spin shrink-0" />
                    Verificando...
                  </>
                )}
                {updateState.status === 'available' && (
                  <>
                    <Download className="w-3 h-3 text-[#10d394] shrink-0" />
                    Atualização Disponível
                  </>
                )}
                {updateState.status === 'downloading' && (
                  <>
                    <Loader2 className="w-3 h-3 animate-spin shrink-0" />
                    Baixando Pacote...
                  </>
                )}
                {updateState.status === 'downloaded' && (
                  <>
                    <CheckCircle2 className="w-3 h-3 text-emerald-400 shrink-0" />
                    Pronto para Instalar
                  </>
                )}
                {updateState.status === 'uptodate' && (
                  <>
                    <PackageCheck className="w-3 h-3 text-emerald-400 shrink-0" />
                    Sistema Atualizado
                  </>
                )}
                {updateState.status === 'error' && (
                  <>
                    <AlertCircle className="w-3 h-3 text-red-500 shrink-0" />
                    Erro no Processo
                  </>
                )}
              </span>
              <p className="text-[9.5px] text-white/60 font-medium leading-normal mt-1 pr-2 break-words">
                {updateState.message}
              </p>
            </div>

            {updateState.status === 'downloading' && (
              <span className="text-[13px] font-black text-white shrink-0 font-mono tracking-tight bg-white/5 px-2 py-0.5 rounded">
                {updateState.percent}%
              </span>
            )}
          </div>

          {/* Progress Slider */}
          {updateState.status === 'downloading' && (
            <div className="h-1.5 w-full bg-white/5 rounded-full overflow-hidden">
              <div 
                className="h-full bg-blue-500 transition-all duration-200 ease-out shadow-[0_0_8px_rgba(59,130,246,0.6)]" 
                style={{ width: `${updateState.percent}%` }}
              />
            </div>
          )}

          {/* Interactive Trigger for Android & Desktop to deploy / execute updater */}
          {((updateState.status === 'available' && isAndroid) || updateState.status === 'downloaded') && (
            <button
              type="button"
              onClick={handleApplyUpdate}
              className="w-full h-8 bg-emerald-500 hover:bg-emerald-400 text-black font-black text-[9px] uppercase tracking-widest rounded-lg transition-all shadow-md active:scale-[0.97] flex items-center justify-center gap-1.5"
            >
              <RotateCcw className="w-3.5 h-3.5 stroke-[2.5]" />
              {isAndroid ? 'Iniciar Atualização do APK' : 'Reiniciar e Instalar Agora'}
            </button>
          )}

          {/* Release Notes for Android APK downloads */}
          {isAndroid && apkUpdateInfo?.releaseNotes && updateState.status === 'available' && (
            <div className="bg-black/40 border border-white/5 rounded-lg p-2.5 space-y-1.5">
              <span className="text-[7.5px] uppercase font-black text-white/45 tracking-widest block border-b border-white/5 pb-1">
                Notas desta Versão:
              </span>
              <p className="text-[9px] text-[#bdc5c1] leading-relaxed break-words font-medium whitespace-pre-line max-h-24 overflow-y-auto pr-1">
                {apkUpdateInfo.releaseNotes}
              </p>
            </div>
          )}
        </div>
      )}

      {/* Main Trigger & Fallbacks */}
      {updateState.status === 'idle' && (
        <div className="space-y-2">
          <p className="text-[8.5px] text-white/35 leading-relaxed font-semibold uppercase italic select-none">
            {isAndroid 
              ? 'O instalador nativo irá carregar o binário em cache e solicitar a abertura externa automática.' 
              : bridge 
                ? 'O atualizador de Windows baixa silenciosamente no segundo plano e solicita instalação.' 
                : 'Verifique se existem novos pacotes no repositório de lançamentos.'}
          </p>
          {isAndroid && (
            <p className="text-[10px] text-emerald-400/80 leading-normal font-medium bg-emerald-500/5 p-2 rounded-xl border border-emerald-500/10">
              💡 <strong>Dica Android:</strong> Se o sistema Android solicitar, conceda autorização para <strong>"Instalar apps desconhecidos"</strong>. Seus dados e configurações locais serão preservados intactos após a conclusão.
            </p>
          )}
        </div>
      )}

      {error && (
        <div className="p-2.5 border border-red-500/15 bg-red-500/5 rounded-xl space-y-1.5 text-red-400 animate-in fade-in duration-200">
          <div className="flex items-start gap-2">
            <AlertCircle className="w-3.5 h-3.5 text-red-500 shrink-0 mt-0.5" />
            <div className="leading-normal">
              <span className="text-[7.5px] uppercase font-black text-red-500 tracking-wider block">Detalhes do Erro:</span>
              <span className="text-[9.5px] text-red-400 font-semibold break-words">{error}</span>
            </div>
          </div>
          {isAndroid && (
            <div className="text-[9px] text-[#bdc5c1] border-t border-white/5 pt-1.5 leading-relaxed font-medium">
              Nota: Caso esteja offline ou use um repositório privado, você pode abrir manualmente os Lançamentos no seu navegador ou usar um APK alternativo abaixo.
            </div>
          )}
        </div>
      )}

      {(updateState.status === 'idle' || updateState.status === 'uptodate' || updateState.status === 'error') && (
        <div className="space-y-2">
          <button
            type="button"
            onClick={handleCheckUpdate}
            disabled={isChecking}
            className="w-full h-8.5 px-3 bg-blue-600 hover:bg-blue-500 disabled:bg-white/5 disabled:text-white/30 text-white transition-all rounded-lg font-black text-[9px] uppercase tracking-widest shadow-md active:scale-[0.97] flex items-center justify-center gap-1.5 disabled:cursor-wait"
          >
            {isChecking ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin text-white/50" />
                Verificando...
              </>
            ) : (
              <>
                Buscar Atualização
                <ChevronRight className="w-3 h-3 text-white/40" />
              </>
            )}
          </button>

          {/* GitHub Manual Link fallback */}
          {isAndroid && (
            <a
              href={apkUpdateInfo?.releaseUrl || "https://github.com/Meusistema/LukasfeERP/releases"}
              target="_blank"
              rel="noopener noreferrer"
              className="w-full h-8 px-3 border border-white/10 hover:border-white/20 text-[#bfbfbf] hover:text-white transition-all rounded-lg font-black text-[8.5px] uppercase tracking-widest flex items-center justify-center gap-1.5 bg-white/5"
            >
              Navegar para Lançamentos (Download Manual)
            </a>
          )}
        </div>
      )}

      {/* Advanced collapsible debugging & direct file sideloading option */}
      {isAndroid && (
        <div className="border-t border-white/5 pt-2.5">
          <button
            type="button"
            onClick={() => setShowManualInput(prev => !prev)}
            className="text-[8px] text-white/40 hover:text-white transition-colors uppercase font-black tracking-widest flex items-center gap-1"
          >
            {showManualInput ? '[-] Ocultar Painel Avançado' : '[+] Instalação Manual Alternativa'}
          </button>

          {showManualInput && (
            <div className="mt-2 p-3 bg-black/45 rounded-xl border border-white/5 space-y-2 animate-in slide-in-from-top-1 duration-200">
              <label className="text-[7.5px] text-white/45 font-black uppercase tracking-wider block">
                URL direta do arquivo APK alternativo:
              </label>
              <input
                type="text"
                placeholder="https://exemplo.com/app-release.apk"
                value={manualApkUrl}
                onChange={(e) => setManualApkUrl(e.target.value)}
                className="w-full h-8 px-2.5 bg-black/60 border border-white/10 rounded-lg text-[9.5px] font-medium text-white placeholder-white/20 focus:outline-none focus:border-blue-500/50"
              />
              <button
                type="button"
                onClick={handleApplyManualApk}
                className="w-full h-7 bg-blue-500 hover:bg-blue-400 text-black font-black text-[8.5px] uppercase tracking-widest rounded-md transition-colors"
              >
                Baixar e Instalar APK Manual
              </button>
            </div>
          )}
        </div>
      )}

      <div className="flex items-center gap-2 justify-center opacity-45 select-none pt-1">
        <div className={cn(
          "w-1.5 h-1.5 rounded-full animate-pulse",
          isAndroid ? "bg-[#10d394]" : "bg-blue-500"
        )} />
        <span className="text-[7px] font-black text-white uppercase tracking-widest font-mono">
          {isAndroid ? 'Android OS Pipeline' : 'Windows Stable Channel'}
        </span>
      </div>
    </div>
  );
}
