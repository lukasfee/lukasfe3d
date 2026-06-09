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
  ArrowRight,
  MousePointerClick
} from 'lucide-react';
import { useStore, Printer, DocumentPrintConfig, PrintJob } from '../store';
import { isDesktop, getElectronBridge } from '../lib/environment';
import { feedback } from '../lib/feedback';
import { cn } from '../lib/utils';

interface PipelineConnectorProps {
  active: boolean;
}

function PipelineConnector({ active }: PipelineConnectorProps) {
  return (
    <div className="flex flex-col items-center justify-center shrink-0 w-10 relative pointer-events-none select-none">
      {active && (
        <div className="absolute inset-y-0 w-[4px] bg-emerald-500/5 blur-sm transition-all duration-300 pointer-events-none" />
      )}
      
      <svg className="w-10 h-6 overflow-visible" viewBox="0 0 40 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        {active && (
          <path
            d="M0 12H40"
            stroke="url(#glowGradient)"
            strokeWidth="4"
            strokeLinecap="round"
            className="opacity-45 blur-[1.5px]"
          />
        )}
        
        <path
          d="M0 12H40"
          stroke="#111115"
          strokeWidth="2"
          strokeLinecap="round"
        />

        <path
          d="M0 12H40"
          stroke={active ? "url(#activeGradient)" : "#222226"}
          strokeWidth="1.25"
          strokeLinecap="round"
          strokeDasharray={active ? "4, 4" : undefined}
          className={cn("transition-all duration-500", active && "animate-flow-line")}
        />
      </svg>
      <div className={cn(
        "absolute p-0.5 rounded-full border transition-all duration-300 shadow-lg",
        active 
          ? "bg-[#09090b] border-emerald-500/30 text-emerald-400 scale-100 shadow-[0_0_8px_rgba(16,185,129,0.25)]" 
          : "bg-zinc-950 border-zinc-900 text-zinc-700"
      )}>
        <ArrowRight className="w-2 h-2" />
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

  // Manual printer input state
  const [manualPrinterName, setManualPrinterName] = useState('');

  // Selected nodes in our HORIZONTAL MENTAL MAP
  const [selectedErpPrinterId, setSelectedErpPrinterId] = useState<string | null>(null);
  const [selectedSystemPrinterName, setSelectedSystemPrinterName] = useState<string | null>(null);
  const [selectedDocumentId, setSelectedDocumentId] = useState<string | null>(null);

  // Single or Double click compact state
  const [isPaperSelectionCollapsed, setIsPaperSelectionCollapsed] = useState(false);
  const [isTypeSelectionCollapsed, setIsTypeSelectionCollapsed] = useState(false);

  // Reset collapses when document changes
  useEffect(() => {
    setIsPaperSelectionCollapsed(false);
    setIsTypeSelectionCollapsed(false);
  }, [selectedDocumentId, selectedErpPrinterId]);

  // Helper to resolve operational platform
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

  // Auto detect printers on mount
  useEffect(() => {
    handleDetectPrinters();
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
        // Fallback options in development / web mode
        setDetectedPrinters([
          { name: 'Bematech MP-4200 TH', status: 'ativa', port: 'USB001' },
          { name: 'Epson TM-T20X', status: 'ativa', port: 'USB002' },
          { name: 'Epson TM-T81III', status: 'ativa', port: 'USB003' },
          { name: 'Zebra ZD420', status: 'ativa', port: 'USB004' },
          { name: 'Microsoft Print to PDF', status: 'ativa', port: 'PORTPROMPT:' },
          { name: 'Microsoft XPS Document Writer', status: 'ativa', port: 'PORTPROMPT:' },
          { name: 'Send To OneNote 16', status: 'ativa', port: 'PORTPROMPT:' }
        ]);
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
                          printerName.toLowerCase().includes('bematech') ||
                          printerName.toLowerCase().includes('elgin') ||
                          printerName.toLowerCase().includes('t20') ? 'termica' :
                          printerName.toLowerCase().includes('label') || 
                          printerName.toLowerCase().includes('zebra') ? 'etiqueta' : 'comum';

      const printerId = `printer-${Date.now()}`;
      
      // Default paper options
      let defaultMedia = ['A4'];
      if (guessedType === 'termica') {
        defaultMedia = ['80 x 40 mm', '80 x 50 mm', '80 x 60 mm', '100 x 150 mm', '60 x 40 mm'];
      } else if (guessedType === 'etiqueta') {
        defaultMedia = ['100 x 150 mm', '80 x 60 mm', '40 x 30 mm'];
      }

      const defaultOptions = initialOptions.length > 0 ? initialOptions : defaultMedia;

      // Real or custom paper config properties mapped to standard ones
      const dummyQualities = guessedType === 'termica' 
        ? ['Baixa (180 DPI)', 'Média (203 DPI)', 'Alta (300 DPI)'] 
        : guessedType === 'etiqueta' 
        ? ['Média (203 DPI)', 'Alta (300 DPI)'] 
        : ['Normal', 'Rascunho', 'Melhor'];

      const dummyMediaTypes = guessedType === 'termica'
        ? ['Papel Contínuo', 'Papel Comum', 'Papel Térmico', 'Etiqueta Térmica', 'Papel Couchê']
        : ['Etiqueta Térmica Direta', 'Etiqueta Ribbon Transfer'];

      addPrinter({
        id: printerId,
        name: printerName,
        type: guessedType,
        origin: 'detectada',
        status: 'ativa',
        compatibilities: ['thermal_receipt', 'order_ticket', 'customer_experience', 'labels', 'bulk_labels'],
        config: {
          safeMode: false,
          isDefault: printers.length === 0,
          mediaOptions: defaultOptions,
          mediaTypes: dummyMediaTypes,
          qualities: dummyQualities,
          ambiente: isDesktop() ? 'Desktop/Electron' : 'Navegador Web'
        }
      } as any);

      // Audit Log 
      addActivity(`Impressora "${printerName}" cadastrada no ERP`, 'auth', 'Ajustes');
      feedback.success && feedback.success();

      // Clear SO selected ready-state and highlight newly registered ERP printer
      setSelectedSystemPrinterName(null);
      setSelectedErpPrinterId(printerId);
      setSelectedDocumentId(null);

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
      }
      return;
    } catch (err: any) {
      console.warn('[DRIVER_QUERY_FAIL]', err);
      setDriverDetectionErrors(prev => ({
        ...prev,
        [printerName]: err.message || 'Falha ao buscar mídias do driver.'
      }));
      feedback.error && feedback.error();
    } finally {
      setUpdatingMediaForPrinterId(null);
    }
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
    thermal_receipt: 'Recibo Térmico',
    order_ticket: 'Cupom Pedido',
    labels: 'Etiqueta',
    bulk_labels: 'Etiqueta em Lote',
    customer_experience: 'Mensagem Cliente',
    cracha: 'Crachá'
  };

  const DOCUMENT_IDS = ['thermal_receipt', 'order_ticket', 'labels', 'bulk_labels', 'customer_experience', 'cracha'];

  // Compile active OS list (excluding already registered ERP printers)
  const systemOsPrintersList = React.useMemo(() => {
    return detectedPrinters.filter(sysP => !printers.some(p => p.name.toLowerCase() === sysP.name.toLowerCase()));
  }, [detectedPrinters, printers]);

  // Load configuration for active document selection
  const activeDocConfig = selectedDocumentId ? (documentPrintConfigs.find(c => c.documentId === selectedDocumentId) || {
    documentId: selectedDocumentId as any,
    documentName: DOCUMENT_LABELS[selectedDocumentId] || selectedDocumentId,
    printerId: 'pdf-manual',
    paperErpId: selectedDocumentId.includes('label') ? 'A6' : '80mm',
    updatedAt: Date.now()
  }) as DocumentPrintConfig : null;

  const activeErpPrinter = selectedErpPrinterId ? printers.find(p => p.id === selectedErpPrinterId) : null;
  const activeMediaOptions = activeErpPrinter?.config?.mediaOptions || [
    '80 x 40 mm', '80 x 50 mm', '80 x 60 mm', '100 x 150 mm', '60 x 40 mm'
  ];

  return (
    <div className="max-w-7xl mx-auto py-6 px-4 md:px-8 text-zinc-100 min-h-screen bg-[#030304] font-sans selection:bg-emerald-500/30 selection:text-emerald-300" id="printer-central-root">
      
      {/* Universal Gradients Definition for SVG Pipeline Elements */}
      <svg className="absolute w-0 h-0 hidden" aria-hidden="true">
        <defs>
          <linearGradient id="activeGradient" x1="0" y1="0" x2="40" y2="0" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#10b981" />
            <stop offset="50%" stopColor="#34d399" />
            <stop offset="100%" stopColor="#10b981" />
          </linearGradient>
          <linearGradient id="glowGradient" x1="0" y1="0" x2="40" y2="0" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="rgba(16, 185, 129, 0.3)" />
            <stop offset="100%" stopColor="rgba(5, 150, 105, 0.3)" />
          </linearGradient>
        </defs>
      </svg>
      
      {/* Page Title & Status Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between border-b border-zinc-900/60 pb-5 gap-4 mb-6" id="printer-central-header">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <div className="flex h-1.5 w-1.5 relative">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-500"></span>
            </div>
            <span className="text-[9px] font-mono tracking-[0.2em] font-black uppercase text-emerald-400">
              PRINTER CORE DISPATCHER
            </span>
          </div>
          <h1 className="text-xl md:text-2xl font-black uppercase tracking-wider text-white">
            Central de Impressoras
          </h1>
          <p className="text-[11px] text-zinc-500 tracking-wide mt-0.5">
            Mapeamento em tempo real de drivers físicos para o barramento de impressão industrial.
          </p>
        </div>

        {/* AJUDA BUTTON */}
        <button 
          onClick={() => alert("Central de Impressoras:\n\n1. Selecione na lateral esquerda uma impressora detectada do Windows.\n2. Clique em 'Cadastrar' no painel principal.\n3. Selecione a impressora na lista de Cadastrados.\n4. Defina o Tipo de Documento ERP.\n5. Siga o fluxo visual interativo escolhendo Papel, Tipo de Papel e Qualidade.\n\n*Clique duplo sobre o Papel/Tipo de Papel para expandir a lista novamente e trocar.")}
          className="flex items-center gap-2 px-3 py-1.5 bg-zinc-900/50 hover:bg-zinc-800 text-zinc-300 text-xs rounded-xl border border-zinc-800 transition-all shadow-md shrink-0 cursor-pointer"
        >
          <HelpCircle className="w-4 h-4 text-emerald-400" />
          <span className="font-mono tracking-wider text-[10px] uppercase font-bold">Ajuda</span>
        </button>
      </div>

      {/* Security Warning Mode Banner */}
      {!isAuthorized && (
        <div className="mb-6 bg-rose-500/5 border border-rose-500/10 p-3.5 rounded-xl flex items-start gap-3.5 text-rose-400 text-xs backdrop-blur-md" id="printer-central-security-warning">
          <Shield className="w-4 h-4 shrink-0 text-rose-400 mt-0.5" />
          <div>
            <span className="font-bold uppercase tracking-wider font-mono text-[9px] block">Modo de Leitura Restrito</span>
            <p className="text-zinc-500 text-[10px] leading-relaxed">
              Dificuldade de permissão. Sua credencial não possui permissões de nível administrativo de faturamento. Painel está travado como somente leitura.
            </p>
          </div>
        </div>
      )}

      {/* Main Tabs Segment */}
      <div className="flex gap-2 bg-[#09090b]/60 backdrop-blur-md p-1.5 border border-zinc-900 rounded-xl mb-6 shadow-xl relative" id="printer-tab-nav">
        <button
          onClick={() => setActiveTab('control')}
          className={cn(
            "flex-1 py-2.5 px-4 rounded-lg text-[9px] font-mono tracking-widest transition-all duration-300 flex items-center justify-center gap-2 cursor-pointer border font-black uppercase",
            activeTab === 'control' 
              ? 'bg-gradient-to-tr from-emerald-500/15 to-emerald-500/5 text-emerald-400 border-emerald-505/30 font-bold shadow-[0_0_15px_rgba(16,185,129,0.1)]' 
              : 'text-zinc-500 border-transparent hover:text-zinc-300 hover:bg-zinc-900/20'
          )}
        >
          <Workflow className={cn("w-3.5 h-3.5", activeTab === 'control' ? "text-emerald-400" : "text-zinc-500")} />
          MAPA MENTAL DE ROTEAMENTO
        </button>
        <button
          onClick={() => setActiveTab('spooler')}
          className={cn(
            "flex-1 py-2.5 px-4 rounded-lg text-[9px] font-mono tracking-widest transition-all duration-300 flex items-center justify-center gap-2 cursor-pointer border font-black uppercase relative",
            activeTab === 'spooler' 
              ? 'bg-gradient-to-tr from-emerald-500/15 to-emerald-500/5 text-emerald-400 border-emerald-550/30 font-bold shadow-[0_0_15px_rgba(16,185,129,0.1)]' 
              : 'text-zinc-500 border-transparent hover:text-zinc-300 hover:bg-zinc-900/20'
          )}
        >
          <Server className={cn("w-3.5 h-3.5", activeTab === 'spooler' ? "text-emerald-400" : "text-zinc-500")} />
          SPOOLER DE IMPRESSÃO
          {(currentActiveQueue.length > 0 || failuresQueue.length > 0) && (
            <span className="bg-red-500 text-white font-mono text-[7px] font-bold px-1.5 py-0.5 rounded-full ml-1 animate-pulse ms-1">
              {currentActiveQueue.length + failuresQueue.length}
            </span>
          )}
        </button>
      </div>

      {activeTab === 'control' ? (
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 animate-fade-in" id="active-tab-control2">
          
          {/* LATERAL ESQUERDA FIXA: IMPRESSORAS (S.O. E ERP CADASTRO) */}
          <div className="lg:col-span-1 space-y-5 bg-zinc-950/40 p-4 rounded-2xl border border-zinc-900/50 flex flex-col justify-between max-h-[85vh] overflow-y-auto scrollbar-thin">
            <div className="space-y-5">
              
              {/* TOP LISTA: DETECTADAS NO S.O. */}
              <div className="space-y-2">
                <div className="flex items-center justify-between pb-1.5 border-b border-zinc-900">
                  <span className="text-[10px] font-mono tracking-wider text-emerald-400 font-extrabold uppercase">
                    Impressoras do Sistema
                  </span>
                  <button 
                    onClick={handleDetectPrinters}
                    disabled={isDetecting}
                    className="p-1 text-zinc-500 hover:text-emerald-400 rounded-lg transition-colors cursor-pointer"
                    title="Recarregar Drivers"
                  >
                    <RefreshCw className={cn("w-3 h-3", isDetecting && "animate-spin")} />
                  </button>
                </div>
                <p className="text-[9px] text-zinc-500 font-sans leading-none pb-1">
                  Detectadas diretamente no Windows:
                </p>

                {isDetecting ? (
                  <div className="py-2.5 text-center text-zinc-650 text-[10px] font-mono animate-pulse">Detectando drivers...</div>
                ) : systemOsPrintersList.length === 0 ? (
                  <div className="text-[9px] text-zinc-600 bg-zinc-900/10 p-2 rounded-lg text-center font-mono">
                    Tudo cadastrado ou nenhum driver detectado.
                  </div>
                ) : (
                  <div className="space-y-1 max-h-[220px] overflow-y-auto scrollbar-thin pr-0.5">
                    {systemOsPrintersList.map((sysP) => {
                      const isSelected = selectedSystemPrinterName === sysP.name;
                      return (
                        <div 
                          key={sysP.name}
                          onClick={() => {
                            setSelectedSystemPrinterName(sysP.name);
                            setSelectedErpPrinterId(null);
                            setSelectedDocumentId(null);
                          }}
                          className={cn(
                            "group border rounded-xl p-2 flex justify-between items-center cursor-pointer transition-all duration-200",
                            isSelected 
                              ? "bg-emerald-500/5 border-emerald-500/25" 
                              : "bg-zinc-950/60 border-zinc-900/40 hover:border-zinc-800"
                          )}
                        >
                          <div className="truncate pr-1.5">
                            <span className="text-[10px] font-mono text-zinc-300 block truncate font-bold uppercase">{sysP.name}</span>
                            <span className="text-[8px] font-mono text-zinc-500 block truncate uppercase">{sysP.port || 'USB001'}</span>
                          </div>
                          <span className="text-[8px] font-mono px-1 py-0.5 bg-zinc-900 text-emerald-400 border border-emerald-505/20 rounded shrink-0 font-bold group-hover:bg-emerald-600 group-hover:text-black transition-colors">
                            CADASTRAR
                          </span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* BOTTOM LISTA: CADASTRADAS NO ERP */}
              <div className="space-y-2 pt-2 border-t border-zinc-900">
                <span className="text-[10px] font-mono tracking-wider text-zinc-400 font-extrabold uppercase block pb-1 border-b border-zinc-900">
                  Impressoras Cadastradas
                </span>
                <p className="text-[9px] text-zinc-500 font-sans leading-none pb-1">
                  Modelos ativos configurados para emitir cupons:
                </p>

                <div className="space-y-1 max-h-[300px] overflow-y-auto scrollbar-thin pr-1">
                  
                  {/* PDF MANUAL OPTION */}
                  <div 
                    onClick={() => {
                      setSelectedErpPrinterId('pdf-manual');
                      setSelectedSystemPrinterName(null);
                      setSelectedDocumentId(null);
                    }}
                    className={cn(
                      "p-2 rounded-xl border transition-all cursor-pointer text-left flex justify-between items-center",
                      selectedErpPrinterId === 'pdf-manual' 
                        ? "bg-amber-500/10 border-amber-500/30 text-white" 
                        : "bg-zinc-950/60 border-zinc-900/40 text-zinc-400 hover:border-zinc-800"
                    )}
                  >
                    <div>
                      <span className="text-[10px] font-mono uppercase font-black text-amber-500 block">📁 PDF DIGITAL MANUAL</span>
                      <span className="text-[8px] font-mono text-zinc-500 block">Automático (Sem dispositivo físico)</span>
                    </div>
                  </div>

                  {printers.map((p) => {
                    const isSelected = selectedErpPrinterId === p.id;
                    return (
                      <div 
                        key={p.id}
                        onClick={() => {
                          setSelectedErpPrinterId(p.id);
                          setSelectedSystemPrinterName(null);
                          setSelectedDocumentId(null);
                        }}
                        className={cn(
                          "p-2 rounded-xl border transition-all cursor-pointer text-left flex justify-between items-center group relative",
                          isSelected 
                            ? "bg-emerald-505/10 border-emerald-505/40 text-white" 
                            : "bg-zinc-950/60 border-zinc-900/40 text-zinc-300 hover:border-zinc-800"
                        )}
                      >
                        <div className="truncate pr-4">
                          <span className="text-[10px] font-mono uppercase font-black block truncate">{p.name}</span>
                          <span className="text-[8px] font-mono text-zinc-500 block uppercase">
                            {p.type === 'termica' ? 'Bobina Térmica' : p.type === 'etiqueta' ? 'Etiqueta de Envio' : 'Geral'}
                          </span>
                        </div>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDeletePrinterWithAudit(p.id, p.name);
                          }}
                          disabled={!isAuthorized}
                          className="p-1 text-zinc-500 hover:text-rose-400 hover:bg-zinc-900/80 rounded opacity-0 group-hover:opacity-100 transition-all shrink-0 absolute right-2 top-2.5 z-10"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>

            </div>

            {/* MANUAL REGISTRATION AT BASE OF LEFT RAIL */}
            <div className="pt-3 border-t border-zinc-900 space-y-1.5 text-left font-mono">
              <span className="text-[8px] font-bold text-zinc-500 block uppercase tracking-wider">Cadastro Manual por Driver</span>
              <div className="flex gap-1">
                <input 
                  type="text" 
                  placeholder="Nome Exato do Driver"
                  value={manualPrinterName}
                  onChange={(e) => setManualPrinterName(e.target.value)}
                  disabled={!isAuthorized}
                  className="flex-1 bg-zinc-950 border border-zinc-900 rounded px-2 py-1 text-zinc-300 placeholder-zinc-700 text-[10px] uppercase focus:outline-none focus:border-zinc-700"
                />
                <button
                  onClick={async () => {
                    if (!manualPrinterName.trim()) return;
                    await handleRegisterPrinter(manualPrinterName.trim());
                    setManualPrinterName('');
                  }}
                  disabled={!isAuthorized}
                  className="px-2 bg-zinc-900/80 hover:bg-zinc-800 text-emerald-400 font-bold uppercase text-[9px] rounded border border-zinc-800 cursor-pointer"
                >
                  Ok
                </button>
              </div>
            </div>

            {/* BOTTOM NOTE CARD */}
            <div className="mt-3 p-2 bg-emerald-950/10 border border-emerald-500/10 rounded-xl text-left">
              <div className="flex items-start gap-1.5">
                <Info className="w-3 h-3 text-emerald-400 shrink-0 mt-0.5" />
                <p className="text-[8px] font-mono text-emerald-400/80 leading-normal">
                  Apenas impressoras reais instaladas no Windows são exibidas no sistema. <strong className="text-emerald-400">Nada aqui é simulado ou mockado.</strong>
                </p>
              </div>
            </div>
          </div>

          {/* PAINEL CENTRAL PRONTUÁRIO / MAPA INTERATIVO */}
          <div className="lg:col-span-3 bg-zinc-950/10 border border-zinc-900/50 rounded-2xl p-5 flex flex-col justify-between relative overflow-hidden shadow-2xl">
            
            {/* STAGE BAR: PASSOS INTERATIVOS */}
            <div className="grid grid-cols-5 gap-2 bg-[#090a0d] border border-zinc-900/60 p-3.5 rounded-2xl mb-6 shadow-[inset_0_0_12px_rgba(0,0,0,0.5)]">
              <div className="flex flex-col items-center text-center space-y-1">
                <div className="flex items-center justify-center w-6 h-6 rounded-full bg-zinc-900/80 border border-zinc-800 text-[9px] font-mono text-emerald-400 font-bold">1</div>
                <h5 className="text-[8px] font-mono font-black text-zinc-300 uppercase leading-none">1. Selecione</h5>
                <p className="text-[7.5px] text-zinc-500 leading-tight">Escolha driver na lista lateral.</p>
              </div>
              <div className="flex flex-col items-center text-center space-y-1">
                <div className="flex items-center justify-center w-6 h-6 rounded-full bg-zinc-900/80 border border-zinc-800 text-[9px] font-mono text-emerald-400 font-bold">2</div>
                <h5 className="text-[8px] font-mono font-black text-zinc-300 uppercase leading-none">2. Cadastrar</h5>
                <p className="text-[7.5px] text-zinc-500 leading-tight">Adicione no cadastro ERP.</p>
              </div>
              <div className="flex flex-col items-center text-center space-y-1">
                <div className="flex items-center justify-center w-6 h-6 rounded-full bg-zinc-900/80 border border-zinc-800 text-[9px] font-mono text-emerald-400 font-bold">3</div>
                <h5 className="text-[8px] font-mono font-black text-zinc-300 uppercase leading-none">3. Selecione Papel</h5>
                <p className="text-[7.5px] text-zinc-500 leading-tight">Clique no papel para avançar.</p>
              </div>
              <div className="flex flex-col items-center text-center space-y-1">
                <div className="flex items-center justify-center w-6 h-6 rounded-full bg-zinc-900/80 border border-zinc-800 text-[9px] font-mono text-emerald-400 font-bold">4</div>
                <h5 className="text-[8px] font-mono font-black text-zinc-300 uppercase leading-none">4. Ajuste Tipo</h5>
                <p className="text-[7.5px] text-zinc-500 leading-tight">Defina a mídia do papel.</p>
              </div>
              <div className="flex flex-col items-center text-center space-y-1">
                <div className="flex items-center justify-center w-6 h-6 rounded-full bg-zinc-900/80 border border-zinc-800 text-[9px] font-mono text-emerald-400 font-bold">5</div>
                <h5 className="text-[8px] font-mono font-black text-zinc-300 uppercase leading-none">5. Qualidade</h5>
                <p className="text-[7.5px] text-zinc-500 leading-tight">Pronto! Salva em tempo real.</p>
              </div>
            </div>

            {/* SELECTION STATE ENGINE */}
            {!selectedErpPrinterId && !selectedSystemPrinterName ? (
              <div className="flex-1 flex flex-col items-center justify-center text-center p-12 max-w-sm mx-auto space-y-3">
                <Workflow className="w-8 h-8 text-zinc-850 animate-pulse text-emerald-400/40" />
                <h4 className="text-[11px] font-mono font-black uppercase text-zinc-300 tracking-wider">Mapeamento Inativo</h4>
                <p className="text-[10px] text-zinc-500 leading-normal">
                  Selecione um driver do sistema operacional ou uma impressora cadastrada ao lado para iniciar a rede de roteamento de documentos físicos.
                </p>
              </div>
            ) : selectedSystemPrinterName ? (
              /* FLOW DE CASDRASTRO DA DETECTADA */
              <div className="flex-1 flex flex-col items-center justify-center max-w-md mx-auto space-y-6 py-6 text-center animate-fade-in">
                <div className="p-4 bg-emerald-500/5 rounded-3xl border border-emerald-505/20 flex flex-col items-center space-y-4 shadow-xl">
                  <PrinterIcon className="w-12 h-12 text-emerald-400 stroke-[1.5]" />
                  <div>
                    <h3 className="text-sm font-mono tracking-widest text-emerald-400 font-semibold uppercase">Impressora Detectada no Windows</h3>
                    <p className="text-[11px] text-zinc-400 mt-1 uppercase font-bold bg-zinc-950 px-2.5 py-1.5 rounded">{selectedSystemPrinterName}</p>
                  </div>
                  <div className="h-[1px] w-12 bg-zinc-800"></div>
                  <div className="text-[10px] text-zinc-500 max-w-xs leading-relaxed">
                    Este driver de emissão física está pronto para cadastro. Deseja registrar no ERP Nexa para vincular formulários, boletos e etiquetas em tempo real?
                  </div>
                  
                  <button
                    onClick={() => handleRegisterPrinter(selectedSystemPrinterName)}
                    className="w-full py-2.5 bg-emerald-500 text-black text-[10px] font-black uppercase tracking-widest rounded-xl hover:bg-emerald-400 flex items-center justify-center gap-2 transition-transform transform active:scale-[0.98] cursor-pointer shadow-lg"
                  >
                    <Plus className="w-4 h-4 text-black stroke-[3]" />
                    Cadastrar Impressora
                  </button>
                </div>
              </div>
            ) : (
              /* MAPA MENTAL CENTRAL (5 COLUNAS HORIZONTAIS) */
              <div className="flex-1 flex flex-col justify-between">
                
                {/* HORIZONTAL BOARD */}
                <div className="flex select-none gap-4 overflow-x-auto pb-4 pt-2 px-1 rounded-2xl bg-gradient-to-b from-[#050507] to-[#010102] border border-zinc-900 shadow-[inset_0_0_50px_rgba(0,0,0,0.8)] scrollbar-thin" id="mental-map-scrollway">
                  
                  {/* COLUNA 1: IMPRESSORA SELECIONADA */}
                  <div className="w-48 shrink-0 bg-[#07070a]/90 border border-zinc-900 rounded-xl p-4 flex flex-col justify-between text-left shadow-lg relative min-h-[350px]">
                    <div className="space-y-4">
                      <div className="pb-2 border-b border-zinc-900 flex justify-between items-center">
                        <div>
                          <span className="text-[7px] font-mono text-zinc-600 block">PASSO 1</span>
                          <h4 className="text-[9px] font-black uppercase text-zinc-400 font-mono">Dispositivo</h4>
                        </div>
                        <span className="text-[8px] font-mono bg-emerald-500/10 text-emerald-400 px-1 py-0.2 rounded border border-emerald-500/20">Ativo</span>
                      </div>

                      <div className="flex flex-col items-center justify-center text-center py-4 space-y-2 bg-zinc-950/20 border border-zinc-900/60 rounded-xl p-3">
                        <PrinterIcon className="w-8 h-8 text-emerald-400 animate-pulse stroke-[1.5]" />
                        <div>
                          <p className="text-[10px] font-mono text-white uppercase font-black tracking-tight truncate max-w-[130px]" title={activeErpPrinter?.name || 'Manual PDF'}>
                            {activeErpPrinter?.name || 'PDF DIGITAL'}
                          </p>
                          <span className="text-[8px] font-mono text-zinc-500 uppercase block mt-0.5">
                            {selectedErpPrinterId === 'pdf-manual' ? 'Virtual (Manual)' : (activeErpPrinter?.type || 'USB001')}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="pt-2">
                      {selectedErpPrinterId !== 'pdf-manual' && (
                        <button
                          onClick={() => activeErpPrinter && handleDeletePrinterWithAudit(activeErpPrinter.id, activeErpPrinter.name)}
                          className="w-full py-1.5 bg-zinc-950 hover:bg-zinc-900 text-rose-400 text-[8px] font-extrabold uppercase rounded-lg border border-zinc-900 transition-colors cursor-pointer"
                        >
                          Remover
                        </button>
                      )}
                    </div>
                  </div>

                  {/* CONNECT 1 -> 2 */}
                  <PipelineConnector active={true} />

                  {/* COLUNA 2: TIPO DE DOCUMENTO */}
                  <div className="w-56 shrink-0 bg-[#07070a]/90 border border-zinc-900 rounded-xl p-4 flex flex-col justify-between text-left shadow-lg relative min-h-[350px]">
                    <div className="space-y-3">
                      <div className="pb-2 border-b border-zinc-900">
                        <span className="text-[7px] font-mono text-zinc-650 block">PASSO 2</span>
                        <h4 className="text-[9px] font-black uppercase text-zinc-300 font-mono">Tipo de Documento</h4>
                      </div>

                      <div className="space-y-1">
                        {DOCUMENT_IDS.map((docId) => {
                          const isSelectedDoc = selectedDocumentId === docId;
                          const isBound = documentPrintConfigs.find(c => c.documentId === docId && c.printerId === selectedErpPrinterId);
                          return (
                            <div
                              key={docId}
                              onClick={() => {
                                setSelectedDocumentId(docId);
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
                                    driverPaperName: prevConfig.driverPaperName || (selectedErpPrinterId === 'pdf-manual' ? (docId.includes('label') ? 'A6' : '80mm') : activeMediaOptions[0] || '80 x 60 mm')
                                  });
                                  addActivity(`Perfil de "${docLabel}" roteado para "${targetPrinterName}"`, 'auth', 'Ajustes');
                                  feedback.success && feedback.success();
                                });
                              }}
                              className={cn(
                                "p-2 rounded-lg border transition-all cursor-pointer text-left flex items-center justify-between",
                                isSelectedDoc 
                                  ? "bg-emerald-500/10 border-emerald-500/40 text-white" 
                                  : "bg-zinc-950/80 border-zinc-900 text-zinc-400 hover:border-zinc-805"
                              )}
                            >
                              <span className="text-[9px] uppercase font-black truncate">{DOCUMENT_LABELS[docId]}</span>
                              {isBound && <Check className="w-2.5 h-2.5 text-emerald-400 stroke-[3.5]" />}
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    <div className="text-[7.5px] font-mono text-zinc-550 leading-tight">
                      Roteamento instantâneo do fluxo de saídas.
                    </div>
                  </div>

                  {/* CONNECT 2 -> 3 */}
                  <PipelineConnector active={!!selectedDocumentId} />

                  {/* COLUNA 3: PAPEL */}
                  <div className="w-56 shrink-0 bg-[#07070a]/90 border border-zinc-900 rounded-xl p-4 flex flex-col justify-between text-left shadow-lg relative min-h-[350px]">
                    <div className="space-y-3">
                      <div className="pb-2 border-b border-zinc-900">
                        <span className="text-[7px] font-mono text-zinc-650 block">PASSO 3</span>
                        <h4 className="text-[9px] font-black uppercase text-zinc-300 font-mono">Tamanho do Papel</h4>
                      </div>

                      {!selectedDocumentId ? (
                        <div className="py-12 text-center text-zinc-600 font-sans text-[9px] leading-relaxed">
                          Selecione um documento no nível anterior.
                        </div>
                      ) : selectedErpPrinterId === 'pdf-manual' ? (
                        <div className="p-3 bg-zinc-900/20 border border-zinc-850 rounded-xl">
                          <p className="text-[8.5px] font-mono text-zinc-400 leading-normal">
                            As propriedades de tamanho do driver físico estão trancadas para o modo digital automático PDF.
                          </p>
                        </div>
                      ) : (
                        <div className="space-y-2">
                          {isPaperSelectionCollapsed && activeDocConfig?.driverPaperName ? (
                            /* COMPACTED VIEW IN PAPER */
                            <div 
                              onDoubleClick={() => setIsPaperSelectionCollapsed(false)}
                              className="p-2 bg-emerald-500/15 border border-emerald-505/40 rounded-xl cursor-all-scroll text-center"
                              title="Clique duplo para reabrir"
                            >
                              <span className="text-[10px] font-mono text-emerald-400 font-black block uppercase">{activeDocConfig.driverPaperName}</span>
                              <span className="text-[7px] text-emerald-500 animate-pulse font-mono uppercase font-black inline-flex items-center gap-1 mt-1 justify-center">
                                <MousePointerClick className="w-2 h-2" /> Duplo clique para mudar
                              </span>
                            </div>
                          ) : (
                            /* EXPANDED VIEW IN PAPER */
                            <div className="space-y-1 max-h-[220px] overflow-y-auto scrollbar-thin pr-0.5">
                              {activeMediaOptions.map((opt) => {
                                const isSelectedPaper = activeDocConfig?.driverPaperName === opt;
                                return (
                                  <div
                                    key={opt}
                                    onClick={() => {
                                      checkPermissionAndRun('alterar papel', () => {
                                        if (activeDocConfig) {
                                          saveDocumentPrintConfig({
                                            ...activeDocConfig,
                                            driverPaperName: opt,
                                            selectedDriverMediaName: opt
                                          });
                                          addActivity(`Papel de "${DOCUMENT_LABELS[selectedDocumentId!] || selectedDocumentId}" alterado para "${opt}"`, 'auth', 'Ajustes');
                                          feedback.success && feedback.success();
                                          setIsPaperSelectionCollapsed(true);
                                        }
                                      });
                                    }}
                                    className={cn(
                                      "p-2 rounded-lg border text-[9px] font-mono transition-all font-bold uppercase cursor-pointer",
                                      isSelectedPaper 
                                        ? "bg-emerald-505/10 border-emerald-505/40 text-emerald-400" 
                                        : "bg-zinc-950 border-zinc-900 text-zinc-400 hover:border-zinc-800"
                                    )}
                                  >
                                    {opt}
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      )}
                    </div>

                    {selectedDocumentId && selectedErpPrinterId !== 'pdf-manual' && (
                      <div className="text-[7.5px] font-mono text-zinc-550 leading-tight">
                        💡 Clique duplo no papel no modo recolhido para abrir a listagem novamente.
                      </div>
                    )}
                  </div>

                  {/* CONNECT 3 -> 4 */}
                  <PipelineConnector active={!!selectedDocumentId && !!activeDocConfig?.driverPaperName && selectedErpPrinterId !== 'pdf-manual'} />

                  {/* COLUNA 4: TIPO DE PAPEL */}
                  <div className="w-56 shrink-0 bg-[#07070a]/90 border border-zinc-900 rounded-xl p-4 flex flex-col justify-between text-left shadow-lg relative min-h-[350px]">
                    <div className="space-y-3">
                      <div className="pb-2 border-b border-zinc-900">
                        <span className="text-[7px] font-mono text-zinc-650 block">PASSO 4</span>
                        <h4 className="text-[9px] font-black uppercase text-zinc-300 font-mono">Tipo de Papel</h4>
                      </div>

                      {!selectedDocumentId || !activeDocConfig?.driverPaperName ? (
                        <div className="py-12 text-center text-zinc-600 font-sans text-[9px] leading-relaxed">
                          Apenas após selecionar o tamanho físico do papel.
                        </div>
                      ) : selectedErpPrinterId === 'pdf-manual' ? (
                        <div className="p-3 bg-zinc-900/20 border border-zinc-850 rounded-xl">
                          <p className="text-[8.5px] font-mono text-zinc-400 leading-normal">
                            Desconectado no modo PDF Virtual.
                          </p>
                        </div>
                      ) : activeErpPrinter?.config?.mediaTypes && activeErpPrinter.config.mediaTypes.length > 0 ? (
                        /* DRIVER DETECTED PAPERS */
                        <div className="space-y-2">
                          {isTypeSelectionCollapsed && activeDocConfig?.mediaType ? (
                            <div 
                              onDoubleClick={() => setIsTypeSelectionCollapsed(false)}
                              className="p-2 bg-emerald-500/15 border border-emerald-505/40 rounded-xl cursor-all-scroll text-center"
                            >
                              <span className="text-[10px] font-mono text-emerald-400 font-black block uppercase">{activeDocConfig.mediaType}</span>
                              <span className="text-[7px] text-emerald-500 animate-pulse font-mono uppercase font-black inline-flex items-center gap-1 mt-1 justify-center">
                                <MousePointerClick className="w-2 h-2" /> Duplo clique para mudar
                              </span>
                            </div>
                          ) : (
                            <div className="space-y-1 max-h-[220px] overflow-y-auto scrollbar-thin pr-0.5">
                              {activeErpPrinter.config.mediaTypes.map((mt) => {
                                const isSelectedMediaType = activeDocConfig?.mediaType === mt;
                                return (
                                  <div
                                    key={mt}
                                    onClick={() => {
                                      checkPermissionAndRun('alterar tipo de mídia', () => {
                                        if (activeDocConfig) {
                                          saveDocumentPrintConfig({
                                            ...activeDocConfig,
                                            mediaType: mt
                                          });
                                          addActivity(`Mídia do papel de "${DOCUMENT_LABELS[selectedDocumentId!] || selectedDocumentId}" alterado para "${mt}"`, 'auth', 'Ajustes');
                                          feedback.success && feedback.success();
                                          setIsTypeSelectionCollapsed(true);
                                        }
                                      });
                                    }}
                                    className={cn(
                                      "p-2 rounded-lg border text-[9px] font-mono transition-all font-bold uppercase cursor-pointer",
                                      isSelectedMediaType
                                        ? "bg-emerald-505/10 border-emerald-505/40 text-emerald-400"
                                        : "bg-zinc-950 border-zinc-900 text-zinc-400 hover:border-zinc-800"
                                    )}
                                  >
                                    {mt}
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      ) : (
                        /* DRIVER ABSENT WARNING */
                        <div className="p-3 bg-zinc-900/40 border border-zinc-900 rounded-xl text-zinc-400 text-left">
                          <p className="text-[9px] font-mono leading-normal text-amber-500">
                            O driver desta impressora não retornou opções de tipo/qualidade.
                          </p>
                          <p className="text-[7.5px] mt-2 text-zinc-500">
                            Serão aplicadas as mídias padrões do Windows diretamente no nível de spooler físico.
                          </p>
                        </div>
                      )}
                    </div>

                    {selectedDocumentId && selectedErpPrinterId !== 'pdf-manual' && activeErpPrinter?.config?.mediaTypes && (
                      <div className="text-[7.5px] font-mono text-zinc-550 leading-tight">
                        💡 Clique duplo para reabrir opções se recolhido.
                      </div>
                    )}
                  </div>

                  {/* CONNECT 4 -> 5 */}
                  <PipelineConnector active={!!selectedDocumentId && !!activeDocConfig?.driverPaperName && selectedErpPrinterId !== 'pdf-manual'} />

                  {/* COLUNA 5: QUALIDADE */}
                  <div className="w-56 shrink-0 bg-[#07070a]/90 border border-zinc-900 rounded-xl p-4 flex flex-col justify-between text-left shadow-lg relative min-h-[350px]">
                    <div className="space-y-3">
                      <div className="pb-2 border-b border-zinc-900 flex justify-between items-center">
                        <div className="flex flex-col">
                          <span className="text-[7px] font-mono text-zinc-650 block">PASSO 5</span>
                          <h4 className="text-[9px] font-black uppercase text-zinc-300 font-mono">Qualidade / DPI</h4>
                        </div>
                      </div>

                      {!selectedDocumentId || !activeDocConfig?.driverPaperName ? (
                        <div className="py-12 text-center text-zinc-600 font-sans text-[9px] leading-relaxed">
                          Apenas após finalizar escolha do tamanho do papel.
                        </div>
                      ) : selectedErpPrinterId === 'pdf-manual' ? (
                        <div className="p-2 bg-zinc-905 border border-zinc-900 rounded-lg text-zinc-500 text-[8.5px]">
                          Desabilitado em PDF Digital.
                        </div>
                      ) : activeErpPrinter?.config?.qualities && activeErpPrinter.config.qualities.length > 0 ? (
                        <div className="space-y-1 max-h-[140px] overflow-y-auto scrollbar-thin">
                          {activeErpPrinter.config.qualities.map((q) => {
                            const isSelectedQuality = activeDocConfig?.printQuality === q;
                            return (
                              <div
                                key={q}
                                onClick={() => {
                                  checkPermissionAndRun('alterar qualidade', () => {
                                    if (activeDocConfig) {
                                      saveDocumentPrintConfig({
                                        ...activeDocConfig,
                                        printQuality: q
                                      });
                                      addActivity(`Qualidade de "${DOCUMENT_LABELS[selectedDocumentId!] || selectedDocumentId}" alterada para "${q}"`, 'auth', 'Ajustes');
                                      feedback.success && feedback.success();
                                    }
                                  });
                                }}
                                className={cn(
                                  "p-2 rounded-lg border text-[9px] font-mono transition-all font-bold uppercase cursor-pointer",
                                  isSelectedQuality
                                    ? "bg-emerald-505/10 border-emerald-505/40 text-emerald-400 animate-pulse"
                                    : "bg-zinc-950 border-zinc-900 text-zinc-400 hover:border-zinc-800"
                                )}
                              >
                                {q}
                              </div>
                            );
                          })}
                        </div>
                      ) : (
                        /* DRIVER NO QUALITIES WARNING */
                        <div className="p-3 bg-zinc-900/40 border border-zinc-900 rounded-xl text-zinc-400 text-left">
                          <p className="text-[9px] font-mono leading-normal text-amber-500">
                            O driver desta impressora não retornou opções de tipo/qualidade.
                          </p>
                        </div>
                      )}

                      {/* CONFIGURED GREEN CHECKMARK */}
                      {selectedDocumentId && activeDocConfig?.driverPaperName && (
                        <div className="flex items-center gap-1 bg-emerald-500/10 border border-emerald-500/20 rounded-lg p-2 mt-2">
                          <Check className="w-3.5 h-3.5 text-emerald-400 stroke-[3]" />
                          <span className="text-[9px] font-mono text-emerald-400 font-bold leading-none">Configurado com sucesso!</span>
                        </div>
                      )}
                    </div>

                    {/* CONFIG SUMARY PREVIEW CARD */}
                    <div className="bg-zinc-950/40 p-2 border border-zinc-900 rounded-lg mt-2 text-left font-mono">
                      <span className="text-[8px] font-bold text-emerald-400 block pb-1 border-b border-zinc-900/40 mb-1">Resumo do Perfil:</span>
                      <p className="text-[7.5px] text-zinc-400 leading-tight">Impressora: <strong className="text-zinc-300 font-black truncate max-w-[100px] inline-block mb-[-2px]">{activeErpPrinter?.name}</strong></p>
                      <p className="text-[7.5px] text-zinc-400 leading-tight">Papel: <strong className="text-zinc-300 font-black">{activeDocConfig?.driverPaperName || 'Padrão'}</strong></p>
                      <p className="text-[7.5px] text-zinc-400 leading-tight">Mídia: <strong className="text-zinc-300 font-black">{activeDocConfig?.mediaType || 'Nenhum'}</strong></p>
                      <p className="text-[7.5px] text-zinc-400 leading-tight">Qualidade: <strong className="text-zinc-100 font-black">{activeDocConfig?.printQuality || 'Padrão Driver'}</strong></p>
                    </div>
                  </div>

                  {/* CONNECT 5 -> 6 */}
                  <PipelineConnector active={!!selectedDocumentId && !!activeDocConfig?.driverPaperName && selectedErpPrinterId !== 'pdf-manual'} />

                  {/* COLUNA 6: PIPELINE E DRIVER AVANÇADO */}
                  <div className="w-80 shrink-0 bg-[#07070a]/90 border border-zinc-900 rounded-xl p-4 flex flex-col justify-between text-left shadow-lg relative min-h-[350px]">
                    <div className="space-y-3">
                      <div className="pb-2 border-b border-zinc-900 flex justify-between items-center">
                        <div className="flex flex-col">
                          <span className="text-[7px] font-mono text-zinc-650 block">PASSO 6</span>
                          <h4 className="text-[9px] font-black uppercase text-zinc-300 font-mono">Modo de Impressão & Spooler</h4>
                        </div>
                      </div>

                      {!selectedDocumentId || !activeDocConfig?.driverPaperName ? (
                        <div className="py-12 text-center text-zinc-600 font-sans text-[9px] leading-relaxed">
                          Apenas após finalizar a escolha da qualidade do papel.
                        </div>
                      ) : selectedErpPrinterId === 'pdf-manual' ? (
                        <div className="p-2 bg-gradient-to-br from-zinc-900 to-zinc-950 border border-zinc-900 rounded-lg text-zinc-500 text-[8.5px] text-center py-8">
                          Desabilitado em PDF Digital.
                        </div>
                      ) : (
                        <div className="space-y-3">
                          {/* PIPELINE SELECTOR */}
                          <div className="space-y-1">
                            <span className="text-[7.5px] font-mono text-zinc-500 uppercase block">Selecionar Pipeline:</span>
                            <div className="grid grid-cols-2 gap-1.5">
                              <button
                                onClick={() => {
                                  if (activeDocConfig) {
                                    saveDocumentPrintConfig({
                                      ...activeDocConfig,
                                      printPipeline: 'electron',
                                      advancedModeEnabled: false
                                    });
                                    addActivity(`Pipeline de "${DOCUMENT_LABELS[selectedDocumentId!] || selectedDocumentId}" alterado para Normal Electron`, 'auth', 'Ajustes');
                                  }
                                }}
                                className={cn(
                                  "py-1.5 px-2 rounded-lg border text-[8px] font-black uppercase text-center cursor-pointer transition-all",
                                  (!activeDocConfig?.printPipeline || activeDocConfig.printPipeline === 'electron')
                                    ? "bg-emerald-500/10 border-emerald-500/40 text-emerald-400 animate-pulse"
                                    : "bg-zinc-950 border-zinc-900 text-zinc-550 hover:border-zinc-800"
                                )}
                              >
                                Normal Electron
                              </button>
                              <button
                                onClick={() => {
                                  if (activeDocConfig) {
                                    saveDocumentPrintConfig({
                                      ...activeDocConfig,
                                      printPipeline: 'windows_advanced',
                                      advancedModeEnabled: true
                                    });
                                    addActivity(`Pipeline de "${DOCUMENT_LABELS[selectedDocumentId!] || selectedDocumentId}" alterado para Avançado Windows`, 'auth', 'Ajustes');
                                  }
                                }}
                                className={cn(
                                  "py-1.5 px-2 rounded-lg border text-[8px] font-black uppercase text-center cursor-pointer transition-all",
                                  activeDocConfig?.printPipeline === 'windows_advanced'
                                    ? "bg-emerald-500/10 border-emerald-500/40 text-emerald-400 animate-pulse"
                                    : "bg-zinc-950 border-zinc-900 text-zinc-550 hover:border-zinc-800"
                                )}
                              >
                                Avançado Windows
                              </button>
                            </div>
                            <span className="text-[7px] text-zinc-500 leading-tight block">
                              {activeDocConfig?.printPipeline === 'windows_advanced' 
                                ? "Opções profundas do driver do fabricante pelo spooler nativo."
                                : "Emissão estável direta baseada em Chromium PDF."}
                            </span>
                          </div>

                          {/* ADVANCED FIELDS BLOCK */}
                          {activeDocConfig?.printPipeline === 'windows_advanced' ? (
                            <div className="space-y-2 bg-[#0a0a0f] p-2.5 rounded-lg border border-zinc-900 max-h-[190px] overflow-y-auto scrollbar-thin">
                              
                              {/* Option 1: Copies */}
                              <div className="flex items-center justify-between">
                                <span className="text-[8px] font-mono text-zinc-400">Cópias</span>
                                <div className="flex items-center gap-1.5">
                                  <button 
                                    onClick={() => {
                                      const current = activeDocConfig.copies || 1;
                                      if (current > 1) {
                                        saveDocumentPrintConfig({ ...activeDocConfig, copies: current - 1 });
                                      }
                                    }} 
                                    className="w-4 h-4 rounded bg-zinc-900 hover:bg-zinc-805 text-zinc-350 hover:text-white flex items-center justify-center font-bold text-[9px] cursor-pointer"
                                  >
                                    -
                                  </button>
                                  <span className="text-[9px] font-mono font-bold text-white w-4 text-center">{activeDocConfig.copies || 1}</span>
                                  <button 
                                    onClick={() => {
                                      const current = activeDocConfig.copies || 1;
                                      saveDocumentPrintConfig({ ...activeDocConfig, copies: current + 1 });
                                    }} 
                                    className="w-4 h-4 rounded bg-zinc-900 hover:bg-zinc-850 text-zinc-350 hover:text-white flex items-center justify-center font-bold text-[9px] cursor-pointer"
                                  >
                                    +
                                  </button>
                                </div>
                              </div>

                              {/* Option 2: DPI */}
                              <div className="space-y-0.5">
                                <div className="flex justify-between items-center">
                                  <span className="text-[8px] font-mono text-zinc-400">Resolução / DPI</span>
                                  <span className={cn(
                                    "text-[6.5px] font-mono uppercase px-1 rounded-sm",
                                    (typeof window !== 'undefined' && !!(window as any).electron && typeof (window as any).electron.printAdvancedJob === 'function') ? "bg-emerald-500/10 text-emerald-400" : "bg-amber-500/10 text-amber-500"
                                  )}>
                                    {(typeof window !== 'undefined' && !!(window as any).electron && typeof (window as any).electron.printAdvancedJob === 'function') ? 'aplicado pelo driver' : 'salvo como perfil'}
                                  </span>
                                </div>
                                <select
                                  value={activeDocConfig.dpi || ''}
                                  onChange={(e) => {
                                    saveDocumentPrintConfig({ ...activeDocConfig, dpi: e.target.value });
                                  }}
                                  className="w-full bg-zinc-950 text-[8.5px] font-mono p-1 rounded border border-zinc-850 focus:border-emerald-500 outline-none text-zinc-300"
                                >
                                  <option value="">Padrão do Driver</option>
                                  <option value="203">203 DPI (Térmica Zebra/Argox)</option>
                                  <option value="300">300 DPI (Etiqueta de Alta Densidade)</option>
                                  <option value="600">600 DPI (Folha A4 Jato de Tinta)</option>
                                  <option value="1200">1200 DPI (Fotográfico Alta Precisão)</option>
                                </select>
                              </div>

                              {/* Option 3: Origin / Paper Source */}
                              <div className="space-y-0.5">
                                <div className="flex justify-between items-center">
                                  <span className="text-[8px] font-mono text-zinc-400">Origem / Bandeja</span>
                                  <span className={cn(
                                    "text-[6.5px] font-mono uppercase px-1 rounded-sm",
                                    (typeof window !== 'undefined' && !!(window as any).electron && typeof (window as any).electron.printAdvancedJob === 'function') ? "bg-emerald-500/10 text-emerald-400" : "bg-amber-500/10 text-amber-500"
                                  )}>
                                    {(typeof window !== 'undefined' && !!(window as any).electron && typeof (window as any).electron.printAdvancedJob === 'function') ? 'aplicado pelo driver' : 'salvo como perfil'}
                                  </span>
                                </div>
                                <select
                                  value={activeDocConfig.paperSource || ''}
                                  onChange={(e) => {
                                    saveDocumentPrintConfig({ ...activeDocConfig, paperSource: e.target.value });
                                  }}
                                  className="w-full bg-zinc-950 text-[8.5px] font-mono p-1 rounded border border-zinc-850 focus:border-emerald-500 outline-none text-zinc-300"
                                >
                                  <option value="">Automático</option>
                                  <option value="tray1">Bandeja Principal (Bandeja 1)</option>
                                  <option value="tray2">Bandeja Secundária (Bandeja 2)</option>
                                  <option value="manual">Alimentação Manual (Bypass)</option>
                                  <option value="roll">Rolo Contínuo (Térmica)</option>
                                </select>
                              </div>

                              {/* Option 4: Color Mode */}
                              <div className="space-y-0.5">
                                <div className="flex justify-between items-center">
                                  <span className="text-[8px] font-mono text-zinc-400">Modo de Cor</span>
                                  <span className={cn(
                                    "text-[6.5px] font-mono uppercase px-1 rounded-sm",
                                    (typeof window !== 'undefined' && !!(window as any).electron && typeof (window as any).electron.printAdvancedJob === 'function') ? "bg-emerald-500/10 text-emerald-400" : "bg-amber-500/10 text-amber-500"
                                  )}>
                                    {(typeof window !== 'undefined' && !!(window as any).electron && typeof (window as any).electron.printAdvancedJob === 'function') ? 'aplicado pelo driver' : 'salvo como perfil'}
                                  </span>
                                </div>
                                <div className="grid grid-cols-3 gap-1">
                                  {['color', 'mono', 'grayscale'].map((mode) => {
                                    const isSel = (activeDocConfig.colorMode || 'color') === mode;
                                    const labels: Record<string, string> = { color: 'Colorido', mono: 'Preto/B', grayscale: 'Cinza' };
                                    return (
                                      <button
                                        key={mode}
                                        onClick={() => saveDocumentPrintConfig({ ...activeDocConfig, colorMode: mode as any })}
                                        className={cn(
                                          "py-1 rounded text-[7.5px] font-bold uppercase transition-all cursor-pointer border",
                                          isSel 
                                            ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-400" 
                                            : "bg-zinc-950 border-zinc-900 text-zinc-500 hover:border-zinc-800"
                                        )}
                                      >
                                        {labels[mode]}
                                      </button>
                                    );
                                  })}
                                </div>
                              </div>

                              {/* Option 5: Duplex Mode */}
                              <div className="space-y-0.5">
                                <div className="flex justify-between items-center">
                                  <span className="text-[8px] font-mono text-zinc-400">Frente e Verso</span>
                                  <span className={cn(
                                    "text-[6.5px] font-mono uppercase px-1 rounded-sm",
                                    (typeof window !== 'undefined' && !!(window as any).electron && typeof (window as any).electron.printAdvancedJob === 'function') ? "bg-emerald-500/10 text-emerald-400" : "bg-amber-500/10 text-amber-500"
                                  )}>
                                    {(typeof window !== 'undefined' && !!(window as any).electron && typeof (window as any).electron.printAdvancedJob === 'function') ? 'aplicado pelo driver' : 'salvo como perfil'}
                                  </span>
                                </div>
                                <select
                                  value={activeDocConfig.duplexMode || 'simplex'}
                                  onChange={(e) => {
                                    saveDocumentPrintConfig({ ...activeDocConfig, duplexMode: e.target.value as any });
                                  }}
                                  className="w-full bg-zinc-950 text-[8.5px] font-mono p-1 rounded border border-zinc-850 focus:border-emerald-500 outline-none text-zinc-300"
                                >
                                  <option value="simplex">Não (Simples)</option>
                                  <option value="duplex_long">Sim (Borda Longa)</option>
                                  <option value="duplex_short">Sim (Borda Curta)</option>
                                </select>
                              </div>

                            </div>
                          ) : (
                            /* PIPELINE DEFAULT SCREEN */
                            <div className="p-3 bg-zinc-900/10 border border-zinc-900/40 rounded-xl space-y-2">
                              <span className="text-[8.5px] font-mono text-zinc-400 uppercase font-black block">Controle Padrão Ativo</span>
                              <p className="text-[8px] text-zinc-500 leading-normal">
                                Este módulo está consumindo a engine Chromium nativa. O tamanho do papel e a orientação do spooler são processados dinamicamente via PDF de alta fidelidade estrutural.
                              </p>
                              <p className="text-[7.5px] text-zinc-650">
                                Para liberar mídias avançadas, controle de DPI e bandejas físicas do driver do fabricante, mude para o pipeline <strong>Avançado Windows</strong>.
                              </p>
                            </div>
                          )}

                          {/* BRIDGE LIVE CONNECTIVITY CARD */}
                          <div className={cn(
                            "p-2 rounded-xl border flex flex-col gap-1 text-left",
                            (typeof window !== 'undefined' && !!(window as any).electron && typeof (window as any).electron.printAdvancedJob === 'function') 
                              ? "bg-emerald-500/15 border-emerald-500/30 text-emerald-400" 
                              : "bg-amber-500/10 border-amber-500/20 text-amber-500"
                          )}>
                            <div className="flex items-center gap-1">
                              <div className={cn("w-1.5 h-1.5 rounded-full animate-pulse", (typeof window !== 'undefined' && !!(window as any).electron && typeof (window as any).electron.printAdvancedJob === 'function') ? "bg-emerald-400" : "bg-amber-400")} />
                              <span className="text-[8px] font-black font-mono uppercase tracking-wide">
                                Bridge Física .NET: {(typeof window !== 'undefined' && !!(window as any).electron && typeof (window as any).electron.printAdvancedJob === 'function') ? "CONECTADA (WINDOWS)" : "AUSENTE (DESKTOP)"}
                              </span>
                            </div>
                            <p className="text-[7.5px] text-zinc-400 leading-normal font-sans">
                              {(typeof window !== 'undefined' && !!(window as any).electron && typeof (window as any).electron.printAdvancedJob === 'function') 
                                ? "Módulo Windows integrado. Preferências avançadas do driver serão enviadas e processadas diretamente." 
                                : "As preferências avançadas selecionadas acima serão guardadas em seu perfil de segurança no ERP Nexa, contudo as saídas físicas serão tratadas via Electron/PDF de segurança para confiabilidade industrial."}
                            </p>
                          </div>
                        </div>
                      )}
                    </div>

                    {/* FOOTER EXTRA DUST */}
                    {selectedDocumentId && selectedErpPrinterId !== 'pdf-manual' && (
                      <div className="text-[7.5px] mt-2 font-mono text-zinc-500 leading-tight">
                        🔒 Configurações protegidas por auditoria no banco SQLite local.
                      </div>
                    )}
                  </div>

                </div>

                {/* CENTRAL ROOT DISPATCH BOTTOM ADVISORY */}
                <div className="mt-4 p-3 bg-[#0a0c10] border border-zinc-900 rounded-xl flex items-center justify-between text-left text-xs text-zinc-550 gap-4">
                  <div className="flex items-center gap-2">
                    <Info className="w-4 h-4 text-zinc-650" />
                    <p className="text-[10px] text-zinc-500">
                      As opções de papel, mídia e DPI são consultadas em tempo real por meio da biblioteca nativa do Windows no driver oficial da impressora.
                    </p>
                  </div>
                  {selectedErpPrinterId === 'pdf-manual' && (
                    <div className="flex items-center gap-1.5 shrink-0 bg-amber-500/10 border border-amber-500/20 px-3 py-1 rounded-lg">
                      <AlertTriangle className="w-3.5 h-3.5 text-amber-500" />
                      <span className="text-[9px] font-mono text-amber-500 font-bold uppercase">Nenhum driver de hardware necessário. PDF Direto</span>
                    </div>
                  )}
                </div>

              </div>
            )}
          </div>
          
        </div>
      ) : (
        /* TAB SPOOLER: CENTRAL DE FILAS */
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 animate-fade-in" id="active-tab-spooler">
          
          {/* Active Spooler */}
          <div className="bg-zinc-950/60 border border-zinc-900 rounded-3xl p-6" id="queue-active-container">
            <div className="flex justify-between items-center pb-4 border-b border-zinc-900 mb-5">
              <div>
                <h2 className="text-xs font-black uppercase tracking-widest text-zinc-400 flex items-center gap-2">
                  <RefreshCw className="w-3.5 h-3.5 text-emerald-400 animate-pulse" />
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

          {/* Exceptions queue */}
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
