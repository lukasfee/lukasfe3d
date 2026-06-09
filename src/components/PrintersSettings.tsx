import React, { useState, useEffect } from 'react';
import { 
  Printer as PrinterIcon, 
  Trash2, 
  Cpu, 
  X,
  AlertTriangle,
  Check,
  RefreshCw,
  FileCheck,
  Shield,
  HelpCircle,
  FileText,
  Info,
  Server,
  Workflow,
  Plus,
  Play,
  Ban,
  Settings,
  Sliders,
  ArrowRight
} from 'lucide-react';
import { useStore, Printer, DocumentPrintConfig, PrintJob } from '../store';
import { isDesktop, getElectronBridge } from '../lib/environment';
import { feedback } from '../lib/feedback';
import { cn } from '../lib/utils';
import { resolveDocumentGeometry } from '../services/printEngine/documentSizes';

interface PipelineConnectorProps {
  active: boolean;
}

function PipelineConnector({ active }: PipelineConnectorProps) {
  return (
    <div className="flex flex-col items-center justify-center shrink-0 w-16 relative pointer-events-none select-none">
      {/* Ambient background active glow conduit strip */}
      {active && (
        <div className="absolute inset-y-0 w-[4px] bg-emerald-500/5 blur-sm transition-all duration-300 pointer-events-none" />
      )}
      
      <svg className="w-16 h-8 overflow-visible" viewBox="0 0 64 32" fill="none" xmlns="http://www.w3.org/2000/svg">
        {/* Glow pipeline channel */}
        {active && (
          <path
            d="M0 16H64"
            stroke="url(#glowGradient)"
            strokeWidth="5"
            strokeLinecap="round"
            className="opacity-40 blur-[2px]"
          />
        )}
        
        {/* Main hardware conduit tray */}
        <path
          d="M0 16H64"
          stroke="#111113"
          strokeWidth="3"
          strokeLinecap="round"
        />

        {/* Real flowing digital pulse lane */}
        <path
          d="M0 16H64"
          stroke={active ? "url(#activeGradient)" : "#222224"}
          strokeWidth="1.25"
          strokeLinecap="round"
          strokeDasharray={active ? "5, 4" : undefined}
          className={cn("transition-all duration-500", active && "animate-flow-line")}
        />
      </svg>
      {/* Physical routing central node toggle */}
      <div className={cn(
        "absolute p-1 rounded-full border transition-all duration-300 shadow-xl",
        active 
          ? "bg-[#09090b] border-emerald-500/30 text-emerald-400 scale-110 shadow-[0_0_12px_rgba(16,185,129,0.30)]" 
          : "bg-zinc-950 border-zinc-900 text-zinc-650"
      )}>
        <ArrowRight className="w-2.5 h-2.5" />
      </div>
    </div>
  );
}

export default function PrintersSettings() {
  const printers = useStore((state) => state.printers);
  const documentPrintConfigs = useStore((state) => state.documentPrintConfigs);
  const printQueue = useStore((state) => state.printQueue);
  const currentUser = useStore((state) => state.currentUser);

  const addPrinter = useStore((state) => state.addPrinter);
  const updatePrinter = useStore((state) => state.updatePrinter);
  const deletePrinter = useStore((state) => state.deletePrinter);
  const saveDocumentPrintConfig = useStore((state) => state.saveDocumentPrintConfig);
  const addActivity = useStore((state) => state.addActivity);
  
  const removePrintJob = useStore((state) => state.removePrintJob);
  const clearPrintQueue = useStore((state) => state.clearPrintQueue);
  const updatePrintJobStatus = useStore((state) => state.updatePrintJobStatus);

  // Active Main tab: 'control' or 'spooler'
  const [activeTab, setActiveTab] = useState<'control' | 'spooler'>('control');
  
  // OS printers state
  const [detectedPrinters, setDetectedPrinters] = useState<any[]>([]);
  const [isDetecting, setIsDetecting] = useState(false);
  const [detectionError, setDetectionError] = useState<string | null>(null);

  // Printer specific driver errors state
  const [driverDetectionErrors, setDriverDetectionErrors] = useState<Record<string, string>>({});

  // Loading indicator for fetching driver options
  const [updatingMediaForPrinterId, setUpdatingMediaForPrinterId] = useState<string | null>(null);

  // Input states for adding manual physical/virtual printers
  const [manualPrinterName, setManualPrinterName] = useState('');
  const [manualPrinterType, setManualPrinterType] = useState<'termica' | 'etiqueta' | 'comum'>('termica');

  // Selected nodes in our HORIZONTAL MENTAL MAP
  const [selectedErpPrinterId, setSelectedErpPrinterId] = useState<string | null>(null);
  const [selectedDocumentId, setSelectedDocumentId] = useState<string | null>(null);

  // Helper to resolve operational platform (Ponto 1)
  const getActivePlatform = (): 'web' | 'desktop' => {
    if (typeof window === 'undefined') return 'web';
    if (isDesktop()) {
      return 'desktop';
    }
    return 'web';
  };

  const activePlatform = getActivePlatform();

  // Authorization Security guard
  const isAuthorized = !currentUser || 
                       currentUser.isAdmin || 
                       currentUser.isOwner || 
                       currentUser.isMasterAdmin || 
                       currentUser.allowedModules?.includes('impressora') || 
                       currentUser.allowedModules?.includes('cupons');

  const checkPermissionAndRun = (actionLabel: string, callback: () => void) => {
    if (!isAuthorized) {
      alert(`Acesso Negado: Seu perfil atual não possui autorização para ${actionLabel}.`);
      feedback.error && feedback.error();
      return;
    }
    callback();
  };

  // Auto detect printers on Desktop app mount
  useEffect(() => {
    if (isDesktop()) {
      handleDetectPrinters();
    }
  }, []);

  const handleDetectPrinters = async () => {
    setIsDetecting(true);
    setDetectionError(null);
    try {
      const bridge = getElectronBridge();
      if (bridge && typeof bridge.getSystemPrinters === 'function') {
        const response = await bridge.getSystemPrinters();
        if (response.success && response.printers) {
          setDetectedPrinters(response.printers);
        } else {
          setDetectionError(response.error || 'Não foi possível listar as impressoras nativas.');
        }
      } else {
        setDetectionError('Ponte de conexão nativa do Electron não disponível.');
      }
    } catch (err: any) {
      setDetectionError(err.message || 'Erro durante a detecção física.');
    } finally {
      setIsDetecting(false);
    }
  };

  const handleRegisterPrinter = async (printerName: string, initialOptions: string[] = []) => {
    checkPermissionAndRun('cadastrar impressora', async () => {
      const alreadyRegistered = printers.some(p => p.name.toLowerCase() === printerName.toLowerCase());
      if (alreadyRegistered) {
        feedback.error && feedback.error();
        alert('Esta impressora já está registrada no ERP.');
        return;
      }

      const guessedType = printerName.toLowerCase().includes('thermal') || 
                          printerName.toLowerCase().includes('pos') || 
                          printerName.toLowerCase().includes('receipt') ||
                          printerName.toLowerCase().includes('t20') ? 'termica' :
                          printerName.toLowerCase().includes('label') || 
                          printerName.toLowerCase().includes('zebra') ? 'etiqueta' : 'comum';

      const printerId = `printer-${Date.now()}`;
      const defaultOptions = initialOptions.length > 0 ? initialOptions : ['A4', 'Roll 80mm'];

      addPrinter({
        id: printerId,
        name: printerName,
        type: guessedType,
        origin: 'detectada',
        status: 'ativa',
        compatibilities: ['thermal_receipt', 'order_ticket', 'customer_experience', 'labels', 'bulk_labels', 'cracha'],
        config: {
          safeMode: false,
          isDefault: printers.length === 0,
          mediaOptions: defaultOptions,
          ambiente: isDesktop() ? 'Desktop/Electron' : 'Navegador Web'
        }
      } as any);

      // Audit Log for Registering Printer
      addActivity(`Impressora "${printerName}" cadastrada no ERP`, 'auth', 'Ajustes');
      feedback.success && feedback.success();

      if (isDesktop()) {
        await triggerUpdatePrinterMedia(printerId, printerName);
      }
    });
  };

  const triggerUpdatePrinterMedia = async (printerId: string, printerName: string) => {
    setUpdatingMediaForPrinterId(printerId);
    
    setDriverDetectionErrors(prev => {
      const copy = { ...prev };
      delete copy[printerName];
      return copy;
    });

    try {
      if (isDesktop()) {
        const bridge = getElectronBridge();
        if (bridge && typeof bridge.getPrinterMediaOptions === 'function') {
          const res = await bridge.getPrinterMediaOptions(printerName);
          if (res && res.success && Array.isArray(res.mediaOptions) && res.mediaOptions.length > 0) {
            updatePrinter(printerId, {
              config: {
                ...printers.find(p => p.id === printerId)?.config,
                mediaOptions: res.mediaOptions
              }
            });
            feedback.success && feedback.success();
            return;
          }
        }
      } else {
        const currentPrinter = printers.find(p => p.id === printerId);
        const currentType = currentPrinter?.type || 'comum';
        let options = ['A4'];
        if (currentType === 'termica') options = ['Roll 80mm', 'Roll 58mm'];
        else if (currentType === 'etiqueta') options = ['10x15', '4x6', 'User Defined'];
        
        updatePrinter(printerId, {
          config: {
            ...currentPrinter?.config,
            mediaOptions: options
          }
        });
        feedback.success && feedback.success();
        return;
      }
      
      throw new Error('Este driver não retornou papéis/mídias. Verifique as preferências da impressora no Windows.');
    } catch (err: any) {
      console.warn('[DRIVER_QUERY_FAIL]', err);
      setDriverDetectionErrors(prev => ({
        ...prev,
        [printerName]: err.message || 'Falha ao buscar mídias do driver.'
      }));
      updatePrinter(printerId, {
        config: {
          ...printers.find(p => p.id === printerId)?.config,
          mediaOptions: []
        }
      });
      feedback.error && feedback.error();
    } finally {
      setUpdatingMediaForPrinterId(null);
    }
  };

  const handleUpdatePrinterType = (id: string, type: Printer['type']) => {
    checkPermissionAndRun('alterar categoria', () => {
      updatePrinter(id, { type });
      feedback.success && feedback.success();
    });
  };

  const handleReprintJob = async (job: PrintJob) => {
    try {
      updatePrintJobStatus(job.id, 'aguardando');
      feedback.success && feedback.success();
    } catch (err: any) {
      updatePrintJobStatus(job.id, 'erro', err.message || 'Falha ao enfileirar novamente.');
    }
  };

  const handleDownloadJobPdf = async (job: PrintJob) => {
    try {
      if (job.pdfUrl) {
        const tempLink = document.createElement('a');
        tempLink.href = job.pdfUrl;
        tempLink.download = `${job.documentName.toLowerCase().replace(/\s+/g, '_')}_reprint.pdf`;
        document.body.appendChild(tempLink);
        tempLink.click();
        document.body.removeChild(tempLink);
        feedback.success && feedback.success();
      } else {
        feedback.error && feedback.error();
      }
    } catch {
      feedback.error && feedback.error();
    }
  };

  const handleDeletePrinterWithAudit = (id: string, name: string) => {
    checkPermissionAndRun('remover impressora', () => {
      deletePrinter(id);
      addActivity(`Impressora "${name}" removida do ERP`, 'auth', 'Ajustes');
      if (selectedErpPrinterId === id) {
        setSelectedErpPrinterId(null);
      }
      feedback.success && feedback.success();
    });
  };

  const currentActiveQueue = printQueue.filter(j => j.status !== 'erro' && j.status !== 'cancelado');
  const failuresQueue = printQueue.filter(j => j.status === 'erro' || j.status === 'cancelado');

  const DOCUMENT_LABELS: Record<string, string> = {
    thermal_receipt: 'Recibo Térmico ERP',
    order_ticket: 'Cupom de Venda / Pedido',
    customer_experience: 'Mensagem Experiência Cliente',
    labels: 'Etiqueta Individual Envio',
    bulk_labels: 'Lote de Etiquetas SKU',
    cracha: 'Crachá de Acesso'
  };

  const DOCUMENT_IDS = ['thermal_receipt', 'order_ticket', 'customer_experience', 'labels', 'bulk_labels', 'cracha'];

  // Compile active OS list (excluding already registered ERP printers)
  const systemOsPrintersList = React.useMemo(() => {
    const rawList = activePlatform === 'desktop'
      ? (detectedPrinters || [])
      : [
          { name: 'EPSON TM-T20X', status: 'ativa' },
          { name: 'BEMATECH MP-4200 TH', status: 'ativa' },
          { name: 'ELGIN I9 USB', status: 'ativa' },
          { name: 'ZEBRA ZD220', status: 'ativa' },
          { name: 'HP LASERJET PROFESSIONAL', status: 'ativa' }
        ];
    return rawList.filter(sysP => !printers.some(p => p.name.toLowerCase() === sysP.name.toLowerCase()));
  }, [activePlatform, detectedPrinters, printers]);

  // Load configuration for active document selection
  const activeDocConfig = selectedDocumentId ? (documentPrintConfigs.find(c => c.documentId === selectedDocumentId) || {
    documentId: selectedDocumentId as any,
    documentName: DOCUMENT_LABELS[selectedDocumentId] || selectedDocumentId,
    printerId: 'pdf-manual',
    paperErpId: selectedDocumentId.includes('label') ? 'A6' : '80mm',
    updatedAt: Date.now()
  }) as DocumentPrintConfig : null;

  const activeErpPrinter = selectedErpPrinterId ? printers.find(p => p.id === selectedErpPrinterId) : null;
  const activeMediaOptions = activeErpPrinter?.config?.mediaOptions || [];

  return (
    <div className="max-w-7xl mx-auto py-8 px-4 md:px-8 text-zinc-100 min-h-screen bg-[#030303] font-sans selection:bg-emerald-500/30 selection:text-emerald-300" id="printer-central-root">
      
      {/* Universal Gradients Definition for SVG Pipeline Elements */}
      <svg className="absolute w-0 h-0 hidden" aria-hidden="true">
        <defs>
          <linearGradient id="activeGradient" x1="0" y1="0" x2="64" y2="0" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#10b981" />
            <stop offset="50%" stopColor="#34d399" />
            <stop offset="100%" stopColor="#059669" />
          </linearGradient>
          <linearGradient id="glowGradient" x1="0" y1="0" x2="64" y2="0" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="rgba(16, 185, 129, 0.4)" />
            <stop offset="100%" stopColor="rgba(5, 150, 105, 0.4)" />
          </linearGradient>
        </defs>
      </svg>
      
      {/* Page Title & Status Header - Industrial High-End Layout */}
      <div className="flex flex-col md:flex-row md:items-center justify-between border-b border-zinc-900/80 pb-6 gap-6 mb-8" id="printer-central-header">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <div className="flex h-2 w-2 relative">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
            </div>
            <div className="flex items-center gap-2">
              <Cpu className="w-3.5 h-3.5 text-emerald-400 animate-pulse" />
              <span className="text-[9px] font-mono tracking-[0.25em] font-black uppercase bg-emerald-500/10 text-emerald-400 px-2.5 py-1 rounded border border-emerald-500/20 shadow-[0_0_15px_rgba(16,185,129,0.05)]">
                HARDWARE DISPATCHER
              </span>
            </div>
          </div>
          <h1 className="text-2xl md:text-3xl font-black uppercase tracking-wider text-white bg-gradient-to-r from-white via-zinc-100 to-zinc-400 bg-clip-text text-transparent">
            Central de Impressoras e Roteamento
          </h1>
          <p className="text-xs text-zinc-500 tracking-wide mt-1.5 leading-relaxed max-w-2xl">
            Mapeamento em tempo real de drivers físicos do sistema operacional para o barramento de documentos do ERP. Atuação direta no nível de infraestrutura, eliminando cadastros fictícios e permitindo controle total das saídas físicas.
          </p>
        </div>
      </div>

      {/* Security Warning Mode Banner */}
      {!isAuthorized && (
        <div className="mb-8 bg-rose-500/5 border border-rose-500/10 p-4 rounded-2xl flex items-start gap-4 text-rose-400 text-xs backdrop-blur-md shadow-[0_0_30px_rgba(239,68,68,0.02)]" id="printer-central-security-warning">
          <Shield className="w-4 h-4 shrink-0 text-rose-400 mt-0.5" />
          <div className="space-y-1">
            <span className="font-bold uppercase tracking-wider font-mono text-[10px] block">Modo de Leitura Restrito</span>
            <p className="text-zinc-500 leading-relaxed text-[11px]">
              Seu usuário não possui privilégios de nível de engenharia (Administrador). O mapa de roteamentos físicos está sob modo de auditoria de leitura. A edição de drivers, qualidades, mídias ou tamanhos de páginas está temporariamente travada.
            </p>
          </div>
        </div>
      )}

      {/* Main Tabs Segment - Premium Switch */}
      <div className="flex gap-2 bg-[#09090b]/80 backdrop-blur-md p-1.5 border border-zinc-900/90 rounded-2xl mb-8 shadow-2xl relative overflow-hidden" id="printer-tab-nav">
        <div className="absolute inset-x-0 bottom-0 h-[1px] bg-gradient-to-r from-transparent via-emerald-500/10 to-transparent"></div>
        <button
          onClick={() => setActiveTab('control')}
          className={cn(
            "flex-1 py-3.5 px-6 rounded-xl text-[10px] font-mono tracking-widest transition-all duration-300 flex items-center justify-center gap-3 cursor-pointer border font-black uppercase",
            activeTab === 'control' 
              ? 'bg-gradient-to-tr from-emerald-500 to-emerald-400 text-black border-emerald-400/20 font-bold shadow-[0_0_25px_rgba(16,185,129,0.15)] transform translate-y-[-1px]' 
              : 'text-zinc-500 border-transparent hover:text-zinc-300 hover:bg-zinc-900/40'
          )}
        >
          <Workflow className={cn("w-4 h-4", activeTab === 'control' ? "text-black" : "text-zinc-500")} />
          MAPA MENTAL DE ROTEAMENTO
        </button>
        <button
          onClick={() => setActiveTab('spooler')}
          className={cn(
            "flex-1 py-3.5 px-6 rounded-xl text-[10px] font-mono tracking-widest transition-all duration-300 flex items-center justify-center gap-3 cursor-pointer border font-black uppercase relative",
            activeTab === 'spooler' 
              ? 'bg-gradient-to-tr from-emerald-500 to-emerald-400 text-black border-emerald-400/20 font-bold shadow-[0_0_25px_rgba(16,185,129,0.15)] transform translate-y-[-1px]' 
              : 'text-zinc-500 border-transparent hover:text-zinc-300 hover:bg-zinc-900/40'
          )}
        >
          <Server className={cn("w-4 h-4", activeTab === 'spooler' ? "text-black" : "text-zinc-500")} />
          SPOOLER MONITOR (FILAS)
          {(currentActiveQueue.length > 0 || failuresQueue.length > 0) && (
            <span className="bg-red-500 text-white font-mono text-[8px] font-bold px-2 py-0.5 rounded-full ml-1 animate-pulse shadow-[0_0_10px_rgba(239,68,68,0.4)]">
              {currentActiveQueue.length + failuresQueue.length}
            </span>
          )}
        </button>
      </div>

      {activeTab === 'control' ? (
        <div className="space-y-8 animate-fade-in" id="active-tab-control">
          
          {/* HORIZONTAL FLOW MAP (MAPA MENTAL DE ROTEAMENTO FÍSICO) */}
          <div className="space-y-2">
            <div className="flex items-center justify-between mb-4 border-b border-zinc-900/40 pb-3" id="printer-map-header-zone">
              <div className="flex items-center gap-2">
                <Workflow className="w-4 h-4 text-emerald-400" />
                <h3 className="text-xs font-mono font-bold uppercase tracking-[0.15em] text-zinc-400">
                  Pipeline Físico de Composição e Roteamento
                </h3>
              </div>
              <span className="text-[9px] font-mono text-zinc-500 tracking-wider">
                FLUXO OPERACIONAL EM TEMPO REAL (ESQUERDA ➔ DIREITA)
              </span>
            </div>

            {/* Main horizontal scrolling roadway - Designed like a grid rail */}
            <div 
              className="flex select-none gap-6 overflow-x-auto pb-6 pt-2 px-1 min-h-[640px] rounded-[32px] bg-gradient-to-b from-[#050505] to-[#010101] border border-zinc-900/60 shadow-[inset_0_0_80px_rgba(0,0,0,0.9)] scrollbar-thin scrollbar-track-zinc-950/50 scrollbar-thumb-zinc-900/80" 
              id="mental-map-scrollway"
            >
              
              {/* NODE 1: Impressoras do Windows (Drivers Físicos) */}
              <div className="w-80 shrink-0 bg-[#070709]/85 backdrop-blur-xl border border-zinc-900 rounded-[28px] p-6 flex flex-col justify-between shadow-2xl relative transition-all duration-300 hover:border-zinc-800 hover:shadow-[0_0_40px_rgba(16,185,129,0.02)]" id="node-system-printers">
                <div className="absolute top-0 inset-x-0 h-[1.5px] bg-gradient-to-r from-transparent via-emerald-500/35 to-transparent"></div>
                
                <div className="space-y-4">
                  <div className="pb-3.5 border-b border-zinc-900 flex justify-between items-center" id="nh-node1">
                    <div>
                      <span className="text-[7px] font-mono tracking-[0.2em] bg-emerald-500/10 text-emerald-400 font-extrabold px-2 py-0.5 rounded border border-emerald-500/20 uppercase">
                        STAGE 01
                      </span>
                      <h4 className="text-[11px] font-black uppercase text-white font-mono tracking-wider mt-2.5">
                        Drivers do Windows
                      </h4>
                    </div>
                    {isDesktop() && (
                      <button 
                        onClick={handleDetectPrinters}
                        disabled={isDetecting}
                        className="p-2 bg-zinc-900/50 hover:bg-zinc-800 border border-zinc-800 hover:text-white text-zinc-400 rounded-xl transition-all duration-300 disabled:opacity-40 cursor-pointer shadow-md"
                        title="Buscar Spooler Local"
                      >
                        <RefreshCw className={cn("w-3.5 h-3.5", isDetecting && "animate-spin text-emerald-400")} />
                      </button>
                    )}
                  </div>

                  {activePlatform === 'web' && (
                    <div className="p-3 border border-amber-500/15 bg-amber-500/5 rounded-2xl space-y-1">
                      <div className="flex items-center gap-1.5">
                        <AlertTriangle className="w-3 h-3 text-amber-500" />
                        <span className="text-[8px] font-mono font-bold text-amber-500 uppercase tracking-widest block">MODO WEB (SIMULADORES)</span>
                      </div>
                      <p className="text-[9.5px] text-zinc-400 leading-normal font-sans">
                        Ambiente web sandbox ativo. Exibindo drivers industriais comuns para você configurar e testar todo o pipeline de impressão física.
                      </p>
                    </div>
                  )}

                  {isDetecting ? (
                    <div className="py-12 flex flex-col items-center space-y-3">
                      <RefreshCw className="w-6 h-6 text-emerald-400 animate-spin" />
                      <span className="text-[9px] font-mono tracking-wider text-zinc-500 uppercase">Varrendo Spooler Local...</span>
                    </div>
                  ) : activePlatform === 'desktop' && systemOsPrintersList.length === 0 ? (
                    <div className="p-4 bg-zinc-950/50 rounded-2xl border border-zinc-900 text-center space-y-3">
                      <span className="text-[8.5px] text-amber-500 block uppercase font-mono font-black tracking-widest">
                        ⚠️ NENHUMA IMPRESSORA NOVA DETECTADA
                      </span>
                      {detectionError && (
                        <div className="text-[8.5px] text-red-400 bg-red-950/30 border border-red-550/15 rounded-lg p-2 font-mono text-left break-all select-all leading-normal">
                          Detecção: {detectionError}
                        </div>
                      )}
                      <p className="text-[10px] text-zinc-400 leading-normal font-sans">
                        O spooler do Windows não retornou novos drivers não cadastrados.
                      </p>
                      <div className="text-left text-[9px] text-zinc-500 bg-zinc-950 p-2.5 rounded-xl border border-white/[0.01] space-y-1">
                        <span className="font-extrabold text-zinc-400 block uppercase tracking-wider text-[7.5px] mb-1">Passos Recomendados:</span>
                        <p>1. Verifique se a impressora física está instalada no "Painel de Controle ➔ Dispositivos e Impressoras".</p>
                        <p>2. Certifique-se de que a impressora está ligada, conectada ao PC e configurada corretamente no Windows.</p>
                        <p>3. Se ela já está listada sob o painel de **Registradas** ao lado, configure o mapeamento de documentos.</p>
                        <p>4. **Vincular Manualmente**: Você pode também digitar o nome exato do driver no formulário abaixo "Registro Manual de Driver" para cadastrar sem detecção automática.</p>
                      </div>
                    </div>
                  ) : activePlatform === 'web' && systemOsPrintersList.length === 0 ? (
                    <div className="py-8 bg-zinc-900/10 rounded-2xl p-4 border border-dashed border-zinc-900 text-center">
                      <span className="text-[9px] text-zinc-500 block uppercase font-mono font-bold tracking-widest">Aguardando Driver Físico</span>
                      <p className="text-[10px] text-zinc-500 mt-2 leading-normal">Todas as impressoras instaladas já estão cadastradas.</p>
                    </div>
                  ) : (
                    <div className="space-y-2.5 max-h-[190px] overflow-y-auto pr-1" id="system-os-printers-scroll">
                      {systemOsPrintersList.map((sysP) => (
                        <div 
                           key={sysP.name}
                          className="bg-[#0b0b0d] border border-zinc-900 hover:border-zinc-800 rounded-xl p-3 flex flex-col space-y-2.5 transition-all duration-200"
                        >
                          <div className="truncate">
                            <span className="text-[9px] font-bold text-zinc-300 font-mono block truncate uppercase tracking-wide">{sysP.name}</span>
                            <span className="text-[7.5px] text-emerald-500 font-mono font-extrabold tracking-widest block mt-0.5 uppercase">● {sysP.status || 'OK / ATIVA'}</span>
                          </div>
                          <button
                            onClick={() => handleRegisterPrinter(sysP.name)}
                            disabled={!isAuthorized}
                            className={cn(
                              "w-full py-1.5 bg-zinc-850 hover:bg-emerald-500 hover:text-black border border-zinc-800 hover:border-emerald-400 text-[8.5px] text-zinc-300 font-bold font-mono uppercase tracking-wider rounded-lg flex items-center justify-center gap-1 cursor-pointer transition-all duration-300 hover:shadow-[0_0_15px_rgba(16,185,129,0.15)]",
                              !isAuthorized && "opacity-40 cursor-not-allowed"
                            )}
                          >
                            <Plus className="w-3 h-3" /> CADASTRAR DISPOSITIVO
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Form de Cadastro Manual */}
                <div className="pt-4 border-t border-zinc-900 mt-4 space-y-3">
                  <div className="flex items-center gap-1.5">
                    <span className="text-[8.5px] font-mono tracking-widest text-zinc-500 uppercase block font-bold">
                      📥 Registro Manual de Driver
                    </span>
                  </div>
                  <div className="space-y-2">
                    <input 
                      type="text" 
                      placeholder="DIRETO DO PROTOCOLO DOS PORT"
                      value={manualPrinterName}
                      onChange={(e) => setManualPrinterName(e.target.value)}
                      disabled={!isAuthorized}
                      className="w-full bg-[#050507] border border-zinc-850 rounded-lg px-2.5 py-1.5 text-zinc-300 placeholder-zinc-700 font-mono text-[9px] uppercase focus:outline-none focus:border-zinc-700 transition-all focus:ring-1 focus:ring-zinc-800"
                    />
                    <div className="grid grid-cols-2 gap-2">
                      <select
                        value={manualPrinterType}
                        onChange={(e) => setManualPrinterType(e.target.value as any)}
                        disabled={!isAuthorized}
                        className="bg-[#050507] border border-zinc-850 text-zinc-400 rounded-lg py-1.5 px-2 text-[8.5px] font-bold font-mono uppercase cursor-pointer focus:outline-none focus:border-zinc-700"
                      >
                        <option value="termica">🌡️ BOBINA</option>
                        <option value="etiqueta">🏷️ ETIQUETA</option>
                        <option value="comum">📄 LASER</option>
                      </select>
                      <button
                        onClick={async () => {
                          if (!manualPrinterName.trim()) return;
                          let opts = ['A4'];
                          if (manualPrinterType === 'termica') opts = ['Roll 80mm', 'Roll 58mm'];
                          else if (manualPrinterType === 'etiqueta') opts = ['10x15', '4x6'];
                          await handleRegisterPrinter(manualPrinterName.trim(), opts);
                          setManualPrinterName('');
                        }}
                        disabled={!isAuthorized}
                        className="bg-zinc-900 hover:bg-zinc-850 border border-zinc-850 text-emerald-400 hover:text-emerald-300 font-extrabold uppercase text-[8px] tracking-wider rounded-lg cursor-pointer flex items-center justify-center transition-all"
                      >
                        <Plus className="w-3.5 h-3.5 mr-0.5" /> REGISTRAR
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              {/* Connector Stage 1 -> 2 */}
              <PipelineConnector active={!!isDesktop()} />

              {/* NODE 2: Impressoras cadastradas no ERP */}
              <div className="w-80 shrink-0 bg-[#070709]/85 backdrop-blur-xl border border-zinc-900 rounded-[28px] p-6 flex flex-col justify-between shadow-2xl relative transition-all duration-300 hover:border-zinc-800 hover:shadow-[0_0_40px_rgba(52,211,153,0.02)]" id="node-registered-printers">
                <div className="absolute top-0 inset-x-0 h-[1.5px] bg-gradient-to-r from-transparent via-emerald-450/35 to-transparent"></div>
                <div className="space-y-4">
                  <div className="pb-3.5 border-b border-zinc-900 flex justify-between items-center" id="nh-node2">
                    <div>
                      <span className="text-[7px] font-mono tracking-[0.2em] bg-emerald-500/10 text-emerald-400 font-extrabold px-2 py-0.5 rounded border border-emerald-500/20 uppercase">
                        STAGE 02
                      </span>
                      <h4 className="text-[11px] font-black uppercase text-white font-mono tracking-wider mt-2.5">
                        Registro de Dispositivo
                      </h4>
                    </div>
                  </div>

                  <div className="space-y-3 max-h-[365px] overflow-y-auto pr-1 scrollbar-thin scrollbar-thumb-zinc-900" id="node2-scrollable">
                    {/* Standard PDF Manual Destination option */}
                    <div 
                      onClick={() => {
                        setSelectedErpPrinterId('pdf-manual');
                        setSelectedDocumentId(null);
                      }}
                      className={cn(
                        "p-3.5 rounded-xl border transition-all duration-300 cursor-pointer text-left flex flex-col justify-between relative overflow-hidden group",
                        selectedErpPrinterId === 'pdf-manual' 
                          ? "bg-amber-500/10 border-amber-500/40 shadow-[0_0_20px_rgba(245,158,11,0.08)] text-white" 
                          : "bg-[#0b0b0d] border-zinc-900/80 text-zinc-400 hover:border-zinc-850 hover:bg-zinc-900/30"
                      )}
                    >
                      <div className="flex justify-between items-start">
                        <span className="text-[6.5px] font-mono font-bold tracking-widest bg-amber-500/10 text-amber-500 px-1.5 py-0.5 rounded leading-none border border-amber-500/20">
                          VIRTUAL DEV
                        </span>
                      </div>
                      <h5 className="text-[10px] font-mono uppercase font-black tracking-wide text-amber-400 mt-2.5">
                        💾 SALVAR EM PDF (MANUAL)
                      </h5>
                      <span className="text-[9px] text-zinc-500 mt-1 block leading-relaxed font-sans">
                        Roteia as vias para arquivo local digital sem emitir filas físicas de impressão.
                      </span>
                    </div>

                    {/* Physical Printers */}
                    {printers.map((p) => {
                      const isSelected = selectedErpPrinterId === p.id;
                      return (
                        <div 
                          key={p.id}
                          onClick={() => {
                            setSelectedErpPrinterId(p.id);
                            setSelectedDocumentId(null); // Clear selected doc to force flowing
                          }}
                          className={cn(
                            "p-3.5 rounded-xl border transition-all duration-300 cursor-pointer text-left flex flex-col justify-between space-y-2.5 relative group",
                            isSelected 
                              ? "bg-emerald-500/5 border-emerald-500/45 shadow-[0_0_20px_rgba(16,185,129,0.06)] text-white" 
                              : "bg-[#0b0b0d] border-zinc-900/80 text-zinc-400 hover:border-zinc-800 hover:bg-zinc-950/20"
                          )}
                        >
                          <div className="flex justify-between items-start">
                            <span className={cn(
                              "text-[6.5px] font-mono font-bold tracking-widest px-1.5 py-0.5 rounded leading-none border",
                              p.status === 'ativa' 
                                ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' 
                                : 'bg-rose-500/5 text-rose-500 border-rose-500/15'
                            )}>
                              {p.type === 'termica' ? '🌡️ BOBINA' : p.type === 'etiqueta' ? '🏷️ ETIQUETA' : '📄 LASER'} • {p.status.toUpperCase()}
                            </span>
                            
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleDeletePrinterWithAudit(p.id, p.name);
                              }}
                              disabled={!isAuthorized}
                              className={cn(
                                "p-1.5 hover:bg-rose-500/20 hover:text-rose-400 rounded-lg text-zinc-650 transition-colors cursor-pointer",
                                !isAuthorized && "opacity-30 cursor-not-allowed"
                              )}
                              title="Remover impressora"
                            >
                              <Trash2 className="w-3 h-3" />
                            </button>
                          </div>
                          
                          <div>
                            <h5 className="text-[10px] uppercase font-mono font-black text-zinc-100 tracking-tight leading-snug block truncate">
                              {p.name}
                            </h5>
                            <span className="text-[7.5px] font-mono text-zinc-500 tracking-wide mt-1 block uppercase">
                              🎚️ {p.config?.mediaOptions?.length || 0} mídias indexadas
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
                <div className="pt-4 border-t border-zinc-900 mt-4 text-[9px] font-sans text-zinc-500 leading-normal">
                  💡 Selecione o driver acima para habilitar o vínculo do respectivo documento de saída no estágio seguinte.
                </div>
              </div>

              {/* Connector Stage 2 -> 3 */}
              <PipelineConnector active={!!selectedErpPrinterId} />

              {/* NODE 3: Documento ERP */}
              <div className={cn(
                "w-72 shrink-0 bg-[#070709]/85 backdrop-blur-xl border rounded-[28px] p-6 flex flex-col justify-between transition-all duration-300 relative shadow-2xl",
                !selectedErpPrinterId 
                  ? "opacity-25 border-zinc-950 pointer-events-none scale-[0.98] blur-[0.3px]" 
                  : "border-zinc-905 hover:border-zinc-800 shadow-[0_0_40px_rgba(6,182,212,0.02)]"
              )} id="node-document-erpid">
                {selectedErpPrinterId && (
                  <div className="absolute top-0 inset-x-0 h-[1.5px] bg-gradient-to-r from-transparent via-cyan-500/35 to-transparent animate-pulse" />
                )}
                <div className="space-y-4">
                  <div className="pb-3 border-b border-zinc-900">
                    <span className="text-[7.5px] font-mono tracking-widest bg-zinc-900 text-zinc-500 font-extrabold px-1.5 py-0.5 rounded uppercase border border-zinc-800">
                      PASSO 03
                    </span>
                    <h4 className="text-[10px] font-black uppercase text-white font-mono tracking-wider mt-1">
                      Documento ERP
                    </h4>
                  </div>

                  {!selectedErpPrinterId ? (
                    <div className="py-24 text-center text-zinc-600 font-sans text-[8.5px] leading-relaxed">
                      ❌ Selecione uma impressora cadastrada do ERP na coluna à esquerda para liberar os documentos.
                    </div>
                  ) : (
                    <div className="space-y-2 max-h-[380px] overflow-y-auto pr-1">
                      {DOCUMENT_IDS.map((docId) => {
                        const isSelectedDoc = selectedDocumentId === docId;
                        const boundConfig = documentPrintConfigs.find(c => c.documentId === docId);
                        const mappedDeviceName = boundConfig?.printerId === 'pdf-manual' 
                          ? '📄 PDF DIGITAL' 
                          : (printers.find(p => p.id === boundConfig?.printerId)?.name || 'NÃO CONFIGURADO');

                        return (
                          <div
                            key={docId}
                            onClick={() => {
                              setSelectedDocumentId(docId);
                              
                              // Physically bind document in ERP immediately when selected
                              const docLabel = DOCUMENT_LABELS[docId] || docId;
                              const prevConfig = (documentPrintConfigs.find(c => c.documentId === docId) || {
                                documentId: docId as any,
                                documentName: docLabel,
                                printerId: 'pdf-manual',
                                paperErpId: docId.includes('label') ? 'A6' : '80mm',
                                updatedAt: Date.now()
                              }) as DocumentPrintConfig;

                              const targetPrinterName = selectedErpPrinterId === 'pdf-manual' ? 'PDF Manual' : (activeErpPrinter?.name || 'Físico');

                              checkPermissionAndRun('alterar perfil de documento', () => {
                                saveDocumentPrintConfig({
                                  ...prevConfig,
                                  printerId: selectedErpPrinterId,
                                  printerName: targetPrinterName,
                                  pdfManualActive: selectedErpPrinterId === 'pdf-manual',
                                  printerMode: selectedErpPrinterId === 'pdf-manual' ? 'pdf_manual' : 'physical_printer',
                                  driverPaperName: prevConfig.driverPaperName || (selectedErpPrinterId === 'pdf-manual' ? (docId.includes('label') ? 'A6' : '80mm') : activeMediaOptions[0] || 'A4')
                                });
                                // Audit
                                addActivity(`Perfil de "${docLabel}" alterado para impressora "${targetPrinterName}"`, 'auth', 'Ajustes');
                                feedback.success && feedback.success();
                              });
                            }}
                            className={cn(
                              "p-3 rounded-2xl border transition-all cursor-pointer text-left flex flex-col justify-between font-sans relative",
                              isSelectedDoc 
                                ? "bg-emerald-500/10 border-emerald-500/40 shadow-xs" 
                                : "bg-zinc-950 border-zinc-900 text-zinc-400 hover:border-zinc-800"
                            )}
                          >
                            <h5 className="text-[9px] uppercase font-black text-white leading-none tracking-tight">{DOCUMENT_LABELS[docId]}</h5>
                            <div className="flex justify-between items-center mt-2.5">
                              <span className="text-[7.5px] text-zinc-500 font-mono">VÍNCULO ATUAL:</span>
                              <span className="text-[7.5px] font-mono font-bold text-emerald-400 uppercase truncate max-w-[130px]" title={mappedDeviceName}>
                                {mappedDeviceName.toUpperCase()}
                              </span>
                            </div>
                            {/* Paper summary snippet in document profile */}
                            {boundConfig && boundConfig.printerId !== 'pdf-manual' && (
                              <div className="text-[6.5px] font-mono text-zinc-650 tracking-tight leading-none mt-1 border-t border-zinc-900 pt-1 flex justify-between">
                                <span>PAPEL: {boundConfig.driverPaperName || 'NÃO CONFIGURADO'}</span>
                                {boundConfig.printQuality && <span>Q: {boundConfig.printQuality}</span>}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
                <div className="pt-4 border-t border-zinc-900 mt-4 text-[7.5px] font-mono text-zinc-500 leading-normal">
                  💡 Selecionando qualquer documento, ele é automaticamente roteado para a impressora destacada no Passo 2.
                </div>
              </div>

              {/* Connector Stage 3 -> 4 */}
              <PipelineConnector active={!!selectedDocumentId && selectedErpPrinterId !== 'pdf-manual'} />

              {/* NODE 4: Papel Real do Driver */}
              <div className={cn(
                "w-72 shrink-0 bg-[#070709]/85 backdrop-blur-xl border rounded-[28px] p-6 flex flex-col justify-between transition-all duration-300 relative shadow-2xl",
                (!selectedDocumentId || selectedErpPrinterId === 'pdf-manual')
                  ? "opacity-25 border-zinc-950 pointer-events-none scale-[0.98] blur-[0.3px]"
                  : "border-zinc-905 hover:border-zinc-800 shadow-[0_0_40px_rgba(99,102,241,0.02)]"
              )} id="node-driver-paper">
                {selectedDocumentId && selectedErpPrinterId !== 'pdf-manual' && (
                  <div className="absolute top-0 inset-x-0 h-[1.5px] bg-gradient-to-r from-transparent via-indigo-500/35 to-transparent" />
                )}
                <div className="space-y-4">
                  <div className="pb-3 border-b border-zinc-900">
                    <span className="text-[7.5px] font-mono tracking-widest bg-zinc-900 text-zinc-500 font-extrabold px-1.5 py-0.5 rounded uppercase border border-zinc-800">
                      PASSO 04
                    </span>
                    <h4 className="text-[10px] font-black uppercase text-white font-mono tracking-wider mt-1">
                      Papel Real do Driver
                    </h4>
                  </div>

                  {!selectedDocumentId ? (
                    <div className="py-24 text-center text-zinc-600 font-sans text-[8.5px] leading-relaxed">
                      ❌ Selecione um documento na coluna à esquerda para configurar as propriedades do driver.
                    </div>
                  ) : selectedErpPrinterId === 'pdf-manual' ? (
                    <div className="py-24 text-center text-zinc-500 font-mono text-[8px] leading-normal bg-zinc-950/20 border border-dashed border-zinc-900 p-4 rounded-2xl">
                      ℹ️ O faturamento em PDF digital gera arquivos universais fáceis de compartilhar. As propriedades físicas do driver local do Windows estão trancadas para o modo digital.
                    </div>
                  ) : (
                    <div className="space-y-3">
                      <span className="text-[8px] font-black text-zinc-500 uppercase font-sans tracking-wide block">
                        Selecione o tamanho físico retornado:
                      </span>

                      {activeMediaOptions.length === 0 ? (
                        <div className="p-3 bg-rose-500/5 border border-rose-500/10 rounded-2xl">
                          <p className="text-[7.5px] font-mono text-rose-400 font-bold leading-normal">
                            ⚠️ Este driver não expôs papéis para o ERP localmente. Tentando requisições genéricas ou use o faturamento manual.
                          </p>
                        </div>
                      ) : (
                        <div className="space-y-1.5 max-h-[350px] overflow-y-auto pr-1">
                          {activeMediaOptions.map((opt) => {
                            const isSelectedPaper = activeDocConfig?.driverPaperName === opt;
                            return (
                              <button
                                key={opt}
                                onClick={() => {
                                  checkPermissionAndRun('alterar papel', () => {
                                    if (activeDocConfig) {
                                      saveDocumentPrintConfig({
                                        ...activeDocConfig,
                                        driverPaperName: opt,
                                        selectedDriverMediaName: opt,
                                        paperErpId: (() => {
                                          const n = opt.toLowerCase().replace(/\s+/g, '');
                                          if (n.includes('58mm') || n.includes('58x') || n.includes('bobina58') || n.includes('roll58') || n.includes('rolo58')) return '58mm';
                                          if (n.includes('80mm') || n.includes('80x') || n.includes('bobina80') || n.includes('roll80') || n.includes('rolo80') || n === 't20') return '80mm';
                                          if (n.includes('76mm') || n.includes('roll76')) return '80mm'; // aproximar para 80mm
                                          if (n === 'a6' || n.includes('105x148') || n.includes('105mm')) return 'A6';
                                          if (n === 'a5' || n.includes('148x210')) return 'A5';
                                          if (n === 'a4' || n.includes('210x297') || n.includes('210mm')) return 'A4';
                                          if (n === 'a3' || n.includes('297x420')) return 'A4'; // maior que A4, aproximar
                                          if (n.includes('10x15') || n.includes('4x6') || n.includes('100x150')) return 'A6'; // etiqueta courier
                                          if (n.includes('40x30') || n.includes('30x40') || n.includes('50x80') || n.includes('58x80')) return '40x30';
                                          // Parsing numérico genérico para nomes como "105 x 148 mm" ou "210x297"
                                          const dimMatch = n.replace(/,/g, '.').match(/(\d+(?:\.\d+)?)[x×*](\d+(?:\.\d+)?)/);
                                          if (dimMatch) {
                                            const w = parseFloat(dimMatch[1]);
                                            const h = parseFloat(dimMatch[2]);
                                            const wMm = (w < 30 && h < 30) ? w * 10 : w; // converter cm se necessário
                                            if (wMm <= 60) return '58mm';
                                            if (wMm <= 85) return '80mm';
                                            if (wMm <= 110) return 'A6';
                                            if (wMm <= 155) return 'A5';
                                            return 'A4';
                                          }
                                          return 'A4'; // fallback
                                        })()
                                      });
                                      // Audit
                                      addActivity(`Papel de "${DOCUMENT_LABELS[selectedDocumentId] || selectedDocumentId}" alterado para "${opt}"`, 'auth', 'Ajustes');
                                      feedback.success && feedback.success();
                                    }
                                  });
                                }}
                                className={cn(
                                  "w-full text-left py-2 px-3 rounded-xl border text-[9px] font-mono transition-all font-bold uppercase",
                                  isSelectedPaper 
                                    ? "bg-cyan-500/10 border-cyan-500/40 text-cyan-400" 
                                    : "bg-zinc-950 border-zinc-900 text-zinc-400 hover:border-zinc-800"
                                )}
                              >
                                🖨️ DRIVER: {opt.toUpperCase()}
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  )}
                </div>
                <div className="pt-4 border-t border-zinc-900 mt-4 text-[7.5px] font-mono text-zinc-500 leading-normal">
                  ⚠️ Papéis puxados do driver garantem compatibilidade no spooler do Windows, prevenindo cortes nas margens.
                </div>
              </div>

              {/* Connector Stage 4 -> 5 */}
              <PipelineConnector active={!!selectedDocumentId && selectedErpPrinterId !== 'pdf-manual'} />

              {/* NODE 5: Tipo de Mídia/Papel */}
              <div className={cn(
                "w-72 shrink-0 bg-[#070709]/85 backdrop-blur-xl border rounded-[28px] p-6 flex flex-col justify-between transition-all duration-300 relative shadow-2xl",
                (!selectedDocumentId || selectedErpPrinterId === 'pdf-manual')
                  ? "opacity-25 border-zinc-950 pointer-events-none scale-[0.98] blur-[0.3px]"
                  : "border-zinc-905 hover:border-zinc-800 shadow-[0_0_40px_rgba(59,130,246,0.02)]"
              )} id="node-media-style">
                {selectedDocumentId && selectedErpPrinterId !== 'pdf-manual' && (
                  <div className="absolute top-0 inset-x-0 h-[1.5px] bg-gradient-to-r from-transparent via-blue-500/35 to-transparent" />
                )}
                <div className="space-y-4">
                  <div className="pb-3 border-b border-zinc-900">
                    <span className="text-[7.5px] font-mono tracking-widest bg-zinc-900 text-zinc-500 font-extrabold px-1.5 py-0.5 rounded uppercase border border-zinc-800">
                      PASSO 05
                    </span>
                    <h4 className="text-[10px] font-black uppercase text-white font-mono tracking-wider mt-1">
                      Tipo de Mídia
                    </h4>
                  </div>

                  {!selectedDocumentId ? (
                    <div className="py-24 text-center text-zinc-600 font-sans text-[8.5px]">
                      ❌ Selecione um documento para configurar as preferências físicas de mídia.
                    </div>
                  ) : selectedErpPrinterId === 'pdf-manual' ? (
                    <div className="py-24 text-center text-zinc-500 font-mono text-[8px] leading-normal bg-zinc-950/20 border border-dashed border-zinc-900 p-4 rounded-2xl">
                      ℹ️ Tipos de mídias físicas não são expostas para o faturamento em PDF digital.
                    </div>
                  ) : (
                    <div className="space-y-4 font-sans">
                      {activeErpPrinter?.config?.mediaTypes && activeErpPrinter.config.mediaTypes.length > 0 ? (
                        <div className="space-y-2">
                          <span className="text-[8px] font-mono text-zinc-500 uppercase tracking-widest block font-bold">Mídias Reais do Driver:</span>
                          {activeErpPrinter.config.mediaTypes.map((mt) => {
                            const isSelectedMediaType = activeDocConfig?.mediaType === mt;
                            return (
                              <button
                                key={mt}
                                onClick={() => {
                                  checkPermissionAndRun('alterar tipo de mídia', () => {
                                    if (activeDocConfig) {
                                      saveDocumentPrintConfig({
                                        ...activeDocConfig,
                                        mediaType: mt
                                      });
                                      addActivity(`Tipo de mídia de "${DOCUMENT_LABELS[selectedDocumentId] || selectedDocumentId}" alterado para "${mt}"`, 'auth', 'Ajustes');
                                      feedback.success && feedback.success();
                                    }
                                  });
                                }}
                                className={cn(
                                  "w-full text-left py-1.5 px-2.5 rounded-xl border text-[8.5px] font-mono transition-all font-bold uppercase",
                                  isSelectedMediaType
                                    ? "bg-cyan-500/10 border-cyan-500/40 text-cyan-400"
                                    : "bg-zinc-950 border-zinc-900 text-zinc-400 hover:border-zinc-800"
                                )}
                              >
                                ⚙️ {mt.toUpperCase()}
                              </button>
                            );
                          })}
                        </div>
                      ) : (
                        <div className="p-3 bg-zinc-900/40 border border-zinc-900 rounded-2xl flex flex-col space-y-2">
                          <span className="text-[8.5px] font-mono text-zinc-400 font-bold leading-normal block uppercase">
                            Capacidades do Driver
                          </span>
                          <p className="text-[7.5px] text-zinc-500 leading-normal">
                            Este driver não expôs tipos de mídia para o ERP.
                            Será utilizado o padrão configurado no driver físico.
                          </p>
                        </div>
                      )}
                    </div>
                  )}
                </div>
                <div className="pt-4 border-t border-zinc-900 mt-4 text-[7.5px] font-mono text-zinc-500 leading-normal">
                  ⚠️ O ERP respeita fidedignamente os limites físicos do driver, deixando que as propriedades internas não expostas fiquem a cargo do Windows.
                </div>
              </div>

              {/* Connector Stage 5 -> 6 */}
              <PipelineConnector active={!!selectedDocumentId && selectedErpPrinterId !== 'pdf-manual' && (activeErpPrinter?.config?.mediaTypes?.length || 0) > 0} />

              {/* NODE 6: Qualidade de Impressão */}
              <div className={cn(
                "w-72 shrink-0 bg-[#070709]/85 backdrop-blur-xl border rounded-[28px] p-6 flex flex-col justify-between transition-all duration-300 relative shadow-2xl",
                (!selectedDocumentId || selectedErpPrinterId === 'pdf-manual')
                  ? "opacity-25 border-zinc-950 pointer-events-none scale-[0.98] blur-[0.3px]"
                  : "border-zinc-905 hover:border-zinc-800 shadow-[0_0_40px_rgba(139,92,246,0.02)]"
              )} id="node-quality-tuning">
                {selectedDocumentId && selectedErpPrinterId !== 'pdf-manual' && (
                  <div className="absolute top-0 inset-x-0 h-[1.5px] bg-gradient-to-r from-transparent via-violet-500/35 to-transparent" />
                )}
                <div className="space-y-4">
                  <div className="pb-3 border-b border-zinc-900">
                    <span className="text-[7.5px] font-mono tracking-widest bg-zinc-900 text-zinc-500 font-extrabold px-1.5 py-0.5 rounded uppercase border border-zinc-800">
                      PASSO 06
                    </span>
                    <h4 className="text-[10px] font-black uppercase text-white font-mono tracking-wider mt-1">
                      Qualidade de Impressão
                    </h4>
                  </div>

                  {!selectedDocumentId ? (
                    <div className="py-24 text-center text-zinc-600 font-sans text-[8.5px]">
                      ❌ Selecione um documento para configurar as preferências físicas de DPI.
                    </div>
                  ) : selectedErpPrinterId === 'pdf-manual' ? (
                    <div className="py-24 text-center text-zinc-500 font-mono text-[8px] leading-normal bg-zinc-950/20 border border-dashed border-zinc-900 p-4 rounded-2xl">
                      ℹ️ Níveis de qualidade de impressão fotográfica estão trancadas para o modo digital folem.
                    </div>
                  ) : (
                    <div className="space-y-4 font-sans">
                      {activeErpPrinter?.config?.qualities && activeErpPrinter.config.qualities.length > 0 ? (
                        <div className="space-y-2">
                          <span className="text-[8px] font-mono text-zinc-500 uppercase tracking-widest block font-bold">Resoluções Reais do Driver:</span>
                          {activeErpPrinter.config.qualities.map((q) => {
                            const isSelectedQuality = activeDocConfig?.printQuality === q;
                            return (
                              <button
                                key={q}
                                onClick={() => {
                                  checkPermissionAndRun('alterar qualidade', () => {
                                    if (activeDocConfig) {
                                      saveDocumentPrintConfig({
                                        ...activeDocConfig,
                                        printQuality: q
                                      });
                                      addActivity(`Qualidade do perfil "${DOCUMENT_LABELS[selectedDocumentId] || selectedDocumentId}" alterada para "${q}"`, 'auth', 'Ajustes');
                                      feedback.success && feedback.success();
                                    }
                                  });
                                }}
                                className={cn(
                                  "w-full text-left py-1.5 px-2.5 rounded-xl border text-[8.5px] font-mono transition-all font-bold uppercase",
                                  isSelectedQuality
                                    ? "bg-cyan-500/10 border-cyan-500/40 text-cyan-400"
                                    : "bg-zinc-950 border-zinc-900 text-zinc-400 hover:border-zinc-800"
                                )}
                              >
                                ⚡ {q.toUpperCase()}
                              </button>
                            );
                          })}
                        </div>
                      ) : (
                        <div className="p-3 bg-zinc-900/40 border border-zinc-900 rounded-2xl flex flex-col space-y-2">
                          <span className="text-[8.5px] font-mono text-zinc-400 font-bold leading-normal block uppercase">
                            DPI do Driver
                          </span>
                          <p className="text-[7.5px] text-zinc-500 leading-normal">
                            Este driver não expôs níveis de qualidade para o ERP.
                            Será utilizada a configuração padrão do driver físico.
                          </p>
                        </div>
                      )}
                    </div>
                  )}
                </div>
                <div className="pt-4 border-t border-zinc-900 mt-4 text-[7.5px] font-mono text-zinc-500 leading-normal">
                  ⚠️ Níveis específicos de DPI dependem da listagem real do driver de impressão do fabricante.
                </div>
              </div>

              {/* Connector Stage 6 -> 7 */}
              <PipelineConnector active={!!selectedDocumentId} />

              {/* NODE 7: Preferências Finais / Extras */}
              <div className={cn(
                "w-80 shrink-0 bg-[#070709]/85 backdrop-blur-xl border rounded-[28px] p-6 flex flex-col justify-between transition-all duration-300 relative shadow-2xl",
                !selectedDocumentId
                  ? "opacity-25 border-zinc-950 pointer-events-none scale-[0.98] blur-[0.3px]"
                  : "border-zinc-905 hover:border-zinc-800 shadow-[0_0_40px_rgba(16,185,129,0.02)]"
              )} id="node-extras-configs">
                {selectedDocumentId && (
                  <div className="absolute top-0 inset-x-0 h-[1.5px] bg-gradient-to-r from-transparent via-emerald-500/35 to-transparent" />
                )}
                <div className="space-y-4 font-mono text-xs">
                  <div className="pb-3 border-b border-zinc-900">
                    <span className="text-[7.5px] font-mono tracking-widest bg-zinc-900 text-zinc-500 font-extrabold px-1.5 py-0.5 rounded uppercase border border-zinc-800">
                      PASSO 07
                    </span>
                    <h4 className="text-[10px] font-black uppercase text-white font-mono tracking-wider mt-1">
                      Preferências Extras
                    </h4>
                  </div>

                  {!selectedDocumentId || !activeDocConfig ? (
                    <div className="py-24 text-center text-zinc-600 font-sans text-[8.5px]">
                      ❌ Selecione um documento na árvore para habilitar o ajuste fino de escala e mídias.
                    </div>
                  ) : (
                    <div className="space-y-4">
                      
                      {/* Scale adjust */}
                      <div className="space-y-1.5">
                        <label className="text-[8px] tracking-widest text-zinc-500 block uppercase font-bold">Escala de Página (%):</label>
                        <div className="flex items-center gap-2">
                          <input 
                            type="range" 
                            min="50" 
                            max="150" 
                            value={activeDocConfig.scale ?? 100}
                            disabled={!isAuthorized}
                            onChange={(e) => {
                              saveDocumentPrintConfig({
                                ...activeDocConfig,
                                scale: Number(e.target.value)
                              });
                            }}
                            className="flex-1 accent-emerald-500 cursor-pointer h-1 bg-zinc-900 rounded-lg"
                          />
                          <span className="text-[9.5px] text-zinc-300 font-bold">{activeDocConfig.scale ?? 100}%</span>
                        </div>
                      </div>

                      {/* Orientation */}
                      <div className="space-y-1.5">
                        <label className="text-[8px] tracking-widest text-zinc-500 block uppercase font-bold">Margem Técnica:</label>
                        <div className="w-full bg-zinc-950 border border-zinc-900/60 p-2 text-zinc-500 rounded-xl text-[8px] leading-none uppercase font-bold">
                          0 mm (Forçada)
                        </div>
                      </div>

                      <div className="space-y-1.5">
                        <label className="text-[8px] tracking-widest text-zinc-500 block uppercase font-bold">Orientação de Saída:</label>
                        <div className="grid grid-cols-2 gap-1.5">
                          <button
                            onClick={() => {
                              checkPermissionAndRun('alterar orientação', () => {
                                saveDocumentPrintConfig({
                                  ...activeDocConfig,
                                  orientation: 'portrait'
                                });
                                feedback.success && feedback.success();
                              });
                            }}
                            disabled={!isAuthorized}
                            className={cn(
                              "py-1.5 text-[8px] font-bold uppercase rounded-lg border",
                              (activeDocConfig.orientation || 'portrait') === 'portrait'
                                ? "bg-emerald-500/15 border-emerald-500/35 text-emerald-400"
                                : "bg-zinc-950 border-zinc-900 text-zinc-650"
                            )}
                          >
                            RETRATO
                          </button>
                          <button
                            onClick={() => {
                              checkPermissionAndRun('alterar orientação', () => {
                                saveDocumentPrintConfig({
                                  ...activeDocConfig,
                                  orientation: 'landscape'
                                });
                                feedback.success && feedback.success();
                              });
                            }}
                            disabled={!isAuthorized}
                            className={cn(
                              "py-1.5 text-[8px] font-bold uppercase rounded-lg border",
                              activeDocConfig.orientation === 'landscape'
                                ? "bg-emerald-500/15 border-emerald-500/35 text-emerald-400"
                                : "bg-zinc-950 border-zinc-900 text-zinc-650"
                            )}
                          >
                            PAISAGEM
                          </button>
                        </div>
                      </div>

                      {/* Thermal density and speed (For thermal documents) */}
                      {selectedDocumentId.includes('thermal') || selectedDocumentId.includes('ticket') ? (
                        <div className="pt-2 border-t border-zinc-900 space-y-2.5">
                          <span className="text-[7.5px] font-mono tracking-widest text-zinc-500 uppercase block font-bold">Ajustes da Bobina Térmica:</span>
                          <div className="grid grid-cols-2 gap-2 text-[8px] text-zinc-500">
                            <div>
                              <span>PROS-DENSITY:</span>
                              <select 
                                value={(activeDocConfig as any).density || 10}
                                disabled={!isAuthorized}
                                onChange={(e) => saveDocumentPrintConfig({ ...activeDocConfig, density: Number(e.target.value) } as any)}
                                className="w-full bg-zinc-950 border border-zinc-900 rounded font-bold px-1 py-0.5 mt-0.5 text-[8.5px]"
                              >
                                {[4,6,8,10,12,14].map(d => <option key={d} value={d}>{d} (LUX)</option>)}
                              </select>
                            </div>
                            <div>
                              <span>VELOCIDADE (IPS):</span>
                              <select 
                                value={(activeDocConfig as any).speed || 2}
                                disabled={!isAuthorized}
                                onChange={(e) => saveDocumentPrintConfig({ ...activeDocConfig, speed: Number(e.target.value) } as any)}
                                className="w-full bg-zinc-950 border border-zinc-900 rounded font-bold px-1 py-0.5 mt-0.5 text-[8.5px]"
                              >
                                {[1,2,3,4,5].map(s => <option key={s} value={s}>{s} IPS</option>)}
                              </select>
                            </div>
                          </div>
                        </div>
                      ) : (
                        <div className="pt-2 border-t border-zinc-900 space-y-2.5">
                          <span className="text-[7.5px] font-mono tracking-widest text-zinc-500 uppercase block font-bold">Ajustes Avancados do Driver:</span>
                          <div className="grid grid-cols-2 gap-2 text-[8px]">
                            <div>
                              <span className="text-[6.5px] text-zinc-500 block uppercase font-bold">Color Mode:</span>
                              <select
                                value={(activeDocConfig as any).colorMode || 'mono'}
                                disabled={!isAuthorized}
                                onChange={(e) => saveDocumentPrintConfig({ ...activeDocConfig, colorMode: e.target.value } as any)}
                                className="w-full bg-zinc-950 border border-zinc-900 text-zinc-400 font-bold rounded py-0.5 px-1 mt-0.5 text-[8px]"
                              >
                                <option value="mono">MONOCUT (PB)</option>
                                <option value="color">COLOR PRINT</option>
                              </select>
                            </div>
                            <div>
                              <span className="text-[6.5px] text-zinc-500 block uppercase font-bold">Duplex:</span>
                              <select
                                value={(activeDocConfig as any).duplex || 'none'}
                                disabled={!isAuthorized}
                                onChange={(e) => saveDocumentPrintConfig({ ...activeDocConfig, duplex: e.target.value } as any)}
                                className="w-full bg-zinc-950 border border-zinc-900 text-zinc-400 font-bold rounded py-0.5 px-1 mt-0.5 text-[8px]"
                              >
                                <option value="none">S/ DUPLEX</option>
                                <option value="long">LONG EDGE</option>
                                <option value="short">SHORT EDGE</option>
                              </select>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
                <div className="pt-4 border-t border-zinc-900 mt-4 text-[7.5px] font-mono text-zinc-500 leading-normal">
                  🚀 Configuração concluída! Todas as alterações feitas em cada passo salvam e aplicam-se em tempo real.
                </div>
              </div>

            </div>
          </div>

        </div>
      ) : (
        /* TAB SPOOLER: CENTRAL DE FILAS (SPOOLER QUEUES) */
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 animate-fade-in" id="active-tab-spooler">
          
          {/* Fila 1: Fila Operacional Ativa (Spooler Ativo) */}
          <div className="bg-zinc-950/60 border border-zinc-900 rounded-3xl p-6" id="queue-active-container">
            <div className="flex justify-between items-center pb-4 border-b border-zinc-900 mb-5">
              <div>
                <h2 className="text-xs font-black uppercase tracking-widest text-zinc-400 flex items-center gap-2">
                  <RefreshCw className="w-3.5 h-3.5 text-emerald-400" />
                  Fila Operacional Ativa ({currentActiveQueue.length})
                </h2>
                <p className="text-[8.5px] text-zinc-500 mt-0.5 font-mono">Processamentos ativos, gerando PDF ou imprimindo</p>
              </div>
              <button
                onClick={clearPrintQueue}
                className="p-1.5 px-3 border border-zinc-900 bg-zinc-950 hover:bg-zinc-900 text-zinc-500 hover:text-rose-400 text-[8.5px] font-black uppercase rounded-lg transition-all cursor-pointer"
              >
                Limpar Log
              </button>
            </div>

            {currentActiveQueue.length === 0 ? (
              <div className="bg-zinc-950/35 border border-zinc-900 border-dashed rounded-2xl p-12 flex flex-col items-center justify-center text-center text-zinc-500 space-y-2">
                <Check className="w-7 h-7 text-zinc-400/20" />
                <h4 className="text-[10px] uppercase font-black tracking-widest text-zinc-400 pt-1">Spooler Ocioso</h4>
                <p className="text-[8.5px] text-zinc-600 max-w-sm leading-relaxed">
                  Não há transmissões ativas no spooler. Emita cupons ou ordens para enfileirar em tempo real.
                </p>
              </div>
            ) : (
              <div className="space-y-4 max-h-[600px] overflow-y-auto pr-1">
                {currentActiveQueue.map((job) => {
                  return (
                    <div key={job.id} className="bg-zinc-950/80 border border-zinc-900 rounded-2xl p-4 flex flex-col justify-between space-y-3">
                      <div className="flex justify-between items-start">
                        <div>
                          <div className="flex items-center gap-1.5 pb-1">
                            <span className="text-[7.5px] font-mono tracking-widest text-zinc-500 bg-zinc-900 border border-zinc-800 px-2 py-0.5 rounded leading-none">
                              ID: {job.id.substring(job.id.length - 8).toUpperCase()}
                            </span>
                            <span className={cn(
                              "px-2 py-0.5 rounded text-[7.5px] font-black uppercase tracking-widest border leading-none",
                              job.status === 'impresso' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/15' : 'bg-cyan-500/10 text-cyan-400 border-cyan-500/15 animate-pulse'
                            )}>
                              {job.status.replace('_', ' ')}
                            </span>
                          </div>
                          
                          <h4 className="text-xs font-black uppercase text-white pt-1">{job.documentName}</h4>
                          <p className="text-[8.5px] text-zinc-500 font-mono mt-1 leading-normal">
                            Destino: <strong className="text-zinc-300 font-black">{job.printerName}</strong> ({job.driverPaperName || 'Padrão Driver'})
                          </p>
                        </div>
                        
                        <div className="text-[8px] text-zinc-500 font-mono text-right">
                          {new Date(job.createdAt).toLocaleTimeString()}
                        </div>
                      </div>

                      <div className="flex gap-2 justify-end pt-2 border-t border-zinc-900/60 text-[10px]">
                        <button 
                          onClick={() => handleReprintJob(job)}
                          className="px-2.5 py-1 bg-zinc-900 border border-zinc-850 hover:bg-zinc-800 text-zinc-400 rounded-lg text-[9px] font-black uppercase flex items-center gap-1 cursor-pointer"
                        >
                          <RefreshCw className="w-2.5 h-2.5 text-zinc-400" /> Reenviar
                        </button>
                        {job.pdfUrl && (
                          <button 
                            onClick={() => handleDownloadJobPdf(job)}
                            className="px-2.5 py-1 bg-zinc-900 border border-zinc-850 hover:bg-zinc-800 text-zinc-400 rounded-lg text-[9px] font-black uppercase flex items-center gap-1 cursor-pointer"
                          >
                            <FileText className="w-2.5 h-2.5" /> PDF
                          </button>
                        )}
                        <button 
                          onClick={() => removePrintJob(job.id)}
                          className="p-1 px-2 border border-zinc-900 bg-zinc-950 text-zinc-500 hover:text-rose-400 rounded-lg hover:border-rose-500/10 transition-all ml-auto cursor-pointer"
                          title="Remover Tarefa"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Fila 2: Fila de Exceções e Falhas do Driver (Exceptions Queue) */}
          <div className="bg-zinc-950/60 border border-zinc-900 rounded-3xl p-6" id="queue-errors-container">
            <h2 className="text-xs font-black uppercase tracking-widest text-rose-400 pb-4 border-b border-zinc-900 mb-5 flex items-center gap-2">
              <Ban className="w-3.5 h-3.5 text-rose-400" />
              Fila de Exceções e Falhas do Driver ({failuresQueue.length})
            </h2>

            {failuresQueue.length === 0 ? (
              <div className="bg-zinc-950/35 border border-zinc-900 border-dashed rounded-2xl p-12 flex flex-col items-center justify-center text-center text-zinc-500 space-y-2">
                <Check className="w-7 h-7 text-emerald-500/20" />
                <h4 className="text-[10px] uppercase font-black tracking-widest text-emerald-400/60 pt-1 font-mono">Fila Limpa</h4>
                <p className="text-[8.5px] text-zinc-600 max-w-sm leading-relaxed">
                  Nenhum erro de transmissão física, mídia incorreta ou driver offline registrado recentemente.
                </p>
              </div>
            ) : (
              <div className="space-y-4 max-h-[600px] overflow-y-auto pr-1">
                {failuresQueue.map((job) => {
                  return (
                    <div key={job.id} className="bg-zinc-950/85 border border-rose-950/30 rounded-2xl p-4 flex flex-col justify-between space-y-3">
                      <div className="flex justify-between items-start">
                        <div>
                          <div className="flex items-center gap-1.5 pb-1">
                            <span className="text-[7.5px] font-mono tracking-widest text-rose-400 bg-rose-500/5 border border-rose-500/10 px-2 py-0.5 rounded leading-none">
                              JOB ID: {job.id.substring(job.id.length - 8).toUpperCase()}
                            </span>
                            <span className="px-2 py-0.5 rounded text-[7.5px] font-black uppercase tracking-widest bg-rose-500/10 text-rose-400 border border-rose-500/15 leading-none">
                              {job.status}
                            </span>
                          </div>
                          
                          <h4 className="text-xs font-black uppercase text-white pt-1">{job.documentName}</h4>
                          <p className="text-[8.5px] text-zinc-500 font-mono mt-1 leading-normal">
                            Destino: <strong className="text-rose-400">{job.printerName}</strong> ({job.driverPaperName || 'Sem mídia'})
                          </p>
                        </div>
                        
                        <div className="text-[8px] text-zinc-500 font-mono text-right">
                          {new Date(job.createdAt).toLocaleTimeString()}
                        </div>
                      </div>

                      {job.errorMessage && (
                        <div className="p-3 bg-rose-500/5 border border-rose-500/10 rounded-xl text-[8.5px] font-mono text-rose-400 leading-normal font-bold">
                          ⚠️ Falha: {job.errorMessage}
                        </div>
                      )}

                      <div className="flex gap-2 justify-end pt-2 border-t border-zinc-900/60 text-[10px]">
                        <button 
                          onClick={() => handleReprintJob(job)}
                          className="px-2.5 py-1 bg-emerald-500 hover:bg-emerald-400 text-black rounded-lg text-[9px] font-black uppercase flex items-center gap-1 cursor-pointer"
                        >
                          <RefreshCw className="w-2.5 h-2.5 text-black" /> Retentar
                        </button>
                        {job.pdfUrl && (
                          <button 
                            onClick={() => handleDownloadJobPdf(job)}
                            className="px-2.5 py-1 bg-zinc-900 border border-zinc-850 hover:bg-zinc-800 text-zinc-400 rounded-lg text-[9px] font-black uppercase flex items-center gap-1 cursor-pointer"
                          >
                            <FileText className="w-2.5 h-2.5" /> PDF
                          </button>
                        )}
                        <button 
                          onClick={() => removePrintJob(job.id)}
                          className="p-1 px-2 border border-zinc-900 bg-zinc-950 text-zinc-500 hover:text-rose-400 rounded-lg hover:border-rose-500/10 transition-all ml-auto cursor-pointer"
                          title="Remover"
                        >
                          <Trash2 className="w-3" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

        </div>
      )}

    </div>
  );
}
