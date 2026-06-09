import { useState, useMemo, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Search, 
  HeartHandshake, 
  Eye, 
  QrCode, 
  Sparkles, 
  X, 
  Save, 
  Printer, 
  FileText,
  AlertCircle,
  CheckCircle2,
  Package,
  Calendar,
  User,
  ExternalLink,
  ChevronDown,
  Layout,
  Palette,
  Briefcase,
  Copy,
  Check,
  Settings,
  Sliders
} from 'lucide-react';
import { cn } from '../lib/utils';
import { useStore, Sale } from '../store';
import { useLocation } from 'react-router-dom';
import { format } from 'date-fns';

import { generateCanonicalPdfBlob, downloadOrSharePdf } from '../services/pdfEngine/pdfGenerator';
import { CanonicalDocumentPreview } from '../components/documentPreview/CanonicalDocumentPreview';

const USAGE_PRESETS = [
  {
    id: 'agradecimento',
    label: 'Agradecimento',
    icon: '❤️',
    title: 'Obrigado por apoiar nosso sonho!',
    message: 'Preparamos seu pedido com muito carinho e atenção. Cada item foi selado e auditado para garantir a melhor experiência de unboxing para você!',
    footer: 'Use o cupom CLIENTESPECIAL e ganhe 10% de desconto na próxima compra.'
  },
  {
    id: 'video_produto',
    label: 'Vídeo do Produto',
    icon: '🎬',
    title: 'Veja os bastidores do seu produto!',
    message: 'Gravamos um vídeo mostrando a separação minuciosa e embalagem de segurança do seu lote de produtos em nosso galpão.',
    footer: 'Vídeo real gravado pelo nosso time operacional.'
  },
  {
    id: 'cuidados',
    label: 'Dicas de Cuidado',
    icon: '✨',
    title: 'Como cuidar do seu produto',
    message: 'Para prolongar a qualidade, conserve o produto ao abrigo do sol, evite umidade excessiva e siga as diretrizes anexas.',
    footer: 'Garanta 100% de satisfação cuidando do seu item.'
  },
  {
    id: 'pos_venda',
    label: 'Pós-Venda',
    icon: '⭐',
    title: 'Abraços do Sucesso do Cliente!',
    message: 'Esperamos que ame o seu pacote. Teve alguma dúvida ou sugestão? Aponte a câmera para o QR Code e fale com nossa Ouvidoria.',
    footer: 'Sua satisfação orienta nosso estoque diário.'
  },
  {
    id: 'garantia',
    label: 'Termos de Garantia',
    icon: '🛡️',
    title: 'Termos & Certificado de Garantia',
    message: 'Este item possui garantia estendida de 90 dias contra vícios latentes de fabricação. Guarde este encarte com cuidado.',
    footer: 'Fale conosco caso identifique alguma inconformidade.'
  },
  {
    id: 'manual',
    label: 'Manual de Uso',
    icon: '📖',
    title: 'Guia do Usuário e Operação',
    message: 'Acesse as especificações técnicas completas, vídeos demonstrativos e fita de uso do produto no portal interativo.',
    footer: 'Evite desperdícios cuidando bem do meio ambiente.'
  }
];

const PAPER_OPTIONS = [
  { id: '80mm', label: 'Bobina 80mm', badge: 'Térmico' },
  { id: '58mm', label: 'Bobina 58mm', badge: 'Térmico' },
  { id: 'A4', label: 'Folha A4', badge: 'A4' },
  { id: 'A5', label: 'Folha A5', badge: 'A5' },
  { id: 'A6', label: 'Folha A6', badge: 'A6' },
] as const;

export default function CustomerExperienceModule() {
  const sales = useStore(state => state.sales);
  const clients = useStore(state => state.clients);
  const customerExperienceConfig = useStore(state => state.customerExperienceConfig);
  const imageThemes = useStore(state => state.imageThemes);
  const updateSale = useStore(state => state.updateSale);
  const currentUser = useStore(state => state.currentUser);
  const logAction = useStore(state => state.logAction);

  const location = useLocation();
  const preSelectedOrderId = location.state?.preSelectedOrderId;

  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'todos' | string>('todos');
  const [selectedSale, setSelectedSale] = useState<Sale | null>(null);

  // Experience Fields State
  const [linkInput, setLinkInput] = useState('');
  const [paperSize, setPaperSize] = useState<'58mm' | '80mm' | 'A4' | 'A5' | 'A6'>('80mm');
  const [themeId, setThemeId] = useState<string>('');
  const [companyName, setCompanyName] = useState('');
  const [mainMessage, setMainMessage] = useState('');
  const [secondaryMessage, setSecondaryMessage] = useState('');
  const [phone, setPhone] = useState('');
  const [instagram, setInstagram] = useState('');
  const [facebook, setFacebook] = useState('');
  const [footerObs, setFooterObs] = useState('');
  const [template, setTemplate] = useState<'simple' | 'elegant' | 'commercial'>('simple');

  // Operation States
  const [isSaving, setIsSaving] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [isPrinting, setIsPrinting] = useState(false);
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Sync state if routing with an order
  useEffect(() => {
    if (preSelectedOrderId && sales.length > 0) {
      const found = sales.find(s => s.id === preSelectedOrderId);
      if (found) {
        handleOpenEditor(found);
      }
    }
  }, [preSelectedOrderId, sales]);

  // Extract unique statuses of orders in system for filtering
  const allStatuses = useMemo(() => {
    const list = new Set<string>();
    sales.forEach(s => {
      if (s.status) list.add(s.status);
    });
    return Array.from(list);
  }, [sales]);

  // Filter Sales
  const filteredSales = useMemo(() => {
    return sales.filter(sale => {
      // Text filter (number / client)
      const client = clients.find(c => c.id === sale.clientId);
      const clientName = (client?.name || sale.clientName || 'Consumidor Final').toLowerCase();
      const orderNum = sale.orderNumber.toLowerCase();
      const query = searchTerm.toLowerCase().trim();

      const matchesSearch = !query || orderNum.includes(query) || clientName.includes(query);
      const matchesStatus = statusFilter === 'todos' || sale.status === statusFilter;

      return matchesSearch && matchesStatus;
    });
  }, [sales, clients, searchTerm, statusFilter]);

  const handleOpenEditor = (sale: Sale) => {
    setSelectedSale(sale);
    setLinkInput(sale.experienceContentUrl || '');
    setPaperSize(sale.experiencePaperSize || customerExperienceConfig.paperSize || '80mm');
    setThemeId(sale.experienceThemeId || customerExperienceConfig.themeId || '');
    setCompanyName(sale.experienceCompanyName || customerExperienceConfig.companyName || 'Nossa Empresa');
    setMainMessage(sale.experienceMainMessage || customerExperienceConfig.mainMessage || 'Obrigado por apoiar nosso sonho!');
    setSecondaryMessage(sale.experienceSecondaryMessage || customerExperienceConfig.secondaryMessage || 'Preparamos sua caixinha com muito carinho e cuidado.');
    setPhone(sale.experiencePhone || customerExperienceConfig.phone || '');
    setInstagram(sale.experienceInstagram || customerExperienceConfig.instagram || '');
    setFacebook(sale.experienceFacebook || customerExperienceConfig.facebook || '');
    setFooterObs(sale.experienceFooterObs || customerExperienceConfig.footerObs || '');
    setTemplate(sale.experienceTemplate || 'simple');
    setShowSuccess(false);
  };

  const validateUrl = (url: string) => {
    if (!url.trim()) return false;
    try {
      const parsed = new URL(url);
      return parsed.protocol === 'http:' || parsed.protocol === 'https:';
    } catch {
      return false;
    }
  };

  const handleApplyPreset = (preset: typeof USAGE_PRESETS[number]) => {
    setMainMessage(preset.title);
    setSecondaryMessage(preset.message);
    setFooterObs(preset.footer);
  };

  const handleSave = () => {
    if (!selectedSale) return;

    setIsSaving(true);
    // Simulate delay
    setTimeout(() => {
      updateSale(selectedSale.id, {
        experienceContentUrl: linkInput,
        experiencePaperSize: paperSize,
        experienceThemeId: themeId || undefined,
        experienceCompanyName: companyName,
        experienceMainMessage: mainMessage,
        experienceSecondaryMessage: secondaryMessage,
        experiencePhone: phone,
        experienceInstagram: instagram,
        experienceFacebook: facebook,
        experienceFooterObs: footerObs,
        experienceTemplate: template
      });
      
      logAction({
        module: 'Experiência do Cliente',
        actionType: 'other',
        description: `Experiência do Cliente editada para pedido #${selectedSale.orderNumber}. Link: ${linkInput || 'Nenhum'}`,
        status: 'sucesso',
        referenceId: selectedSale.id
      });

      setIsSaving(false);
      setShowSuccess(true);
      setTimeout(() => setShowSuccess(false), 2000);
    }, 500);
  };

  // Compile Render Payload
  const previewPayload = useMemo(() => {
    return {
      id: `preview_experiencia_${selectedSale?.id || 'new'}`,
      documentType: 'customer_experience' as const,
      paperSize: (paperSize === '80mm' ? 'bobina80' : 
                  paperSize === '58mm' ? 'bobina58' : 
                  paperSize.toLowerCase()) as any,
      orientation: 'portrait' as const,
      data: {
        paperSize: paperSize,
        orientation: 'portrait',
        themeId: themeId || undefined,
        showLogo: true,
        showCompanyName: !!companyName,
        showQrCode: !!linkInput,
        showSocials: !!(phone || instagram || facebook),
        showMainMessage: !!mainMessage,
        showSecondaryMessage: !!secondaryMessage,
        showPhone: !!phone,
        showInstagram: !!instagram,
        showFacebook: !!facebook,
        showFooterObs: !!footerObs,
        showGuide: true,
        guideOpacity: 25,
        companyName,
        mainMessage,
        secondaryMessage,
        qrText: linkInput || 'https://wms-system.com/feedback',
        phone,
        instagram,
        facebook,
        footerObs,
      }
    };
  }, [selectedSale, paperSize, themeId, companyName, mainMessage, secondaryMessage, linkInput, phone, instagram, facebook, footerObs]);

  const livePreviewPayload = useMemo(() => {
    if (!selectedSale) return null;
    return {
      orderNumber: selectedSale.orderNumber,
      clientName: getClientName(selectedSale.clientId),
      messageText: mainMessage || 'Obrigado por apoiar nosso sonho!',
      qrCodeUrl: linkInput || '',
      qrCodeLabel: linkInput ? 'Agradecemos pela preferência' : undefined,
      couponCode: 'BEMVINDO10'
    };
  }, [selectedSale, mainMessage, linkInput, clients]);

  const compileExperiencePayload = (sale: Sale) => {
    return {
      orderNumber: sale.orderNumber,
      clientName: getClientName(sale.clientId),
      messageText: sale.experienceMainMessage || mainMessage || 'Obrigado por apoiar nosso sonho!',
      qrCodeUrl: sale.experienceContentUrl || linkInput || 'https://wms-system.com/feedback',
      qrCodeLabel: (sale.experienceContentUrl || linkInput) ? 'Agradecemos pela preferência' : undefined,
      couponCode: 'BEMVINDO10'
    };
  };

  const handleViewPdf = async () => {
    const sale = selectedSale;
    if (!sale) return;
    try {
      const activePaperSize = sale.experiencePaperSize || paperSize || 'A6';
      const compiled = compileExperiencePayload(sale);
      const blob = await generateCanonicalPdfBlob(
        'mensagemCliente',
        compiled,
        activePaperSize,
        {
          orientation: 'portrait',
          marginMm: 2,
          scale: 1,
          safeMode: false,
          isExportPdf: true
        }
      );
      const url = URL.createObjectURL(blob);
      window.open(url, '_blank');
    } catch (err: any) {
      console.error(err);
      alert(`Falha ao visualizar encarte PDF: ${err.message}`);
    }
  };

  const handleDownloadPdf = async () => {
    const sale = selectedSale;
    if (!sale) return;
    try {
      const activePaperSize = sale.experiencePaperSize || paperSize || 'A6';
      const compiled = compileExperiencePayload(sale);
      const blob = await generateCanonicalPdfBlob(
        'mensagemCliente',
        compiled,
        activePaperSize,
        {
          orientation: 'portrait',
          marginMm: 2,
          scale: 1,
          safeMode: false,
          isExportPdf: true
        }
      );
      await downloadOrSharePdf(blob, `mimo_pedido_${sale.orderNumber}`);
    } catch (err: any) {
      console.error(err);
      alert(`Falha ao baixar encarte PDF: ${err.message}`);
    }
  };

  const handlePrint = async () => {
    const sale = selectedSale;
    if (!sale) return;
    try {
      const activePaperSize = sale.experiencePaperSize || paperSize || 'A6';
      const compiled = compileExperiencePayload(sale);

      const bindings = useStore.getState().documentPrintConfigs || [];
      const activePrintConfig = bindings.find(c => c.documentId === 'customer_experience');
      const printersList = useStore.getState().printers || [];
      const targetPrinter = activePrintConfig ? printersList.find(p => p.id === activePrintConfig.printerId) : undefined;

      if (!activePrintConfig || activePrintConfig.printerId === 'pdf-manual' || printersList.length === 0 || !targetPrinter) {
        // Fallback to direct download
        const blob = await generateCanonicalPdfBlob(
          'mensagemCliente',
          compiled,
          activePaperSize,
          {
            orientation: 'portrait',
            marginMm: 2,
            scale: 1,
            safeMode: false,
            isExportPdf: true
          }
        );
        await downloadOrSharePdf(blob, `mimo_pedido_${sale.orderNumber}`);
        return;
      }

      // Resolve driver paper configuration mapping
      const allMappings = useStore.getState().paperDriverMappings || [];
      const matchedMapping = allMappings.find(
        m => m.printerId === targetPrinter.id && m.paperErpId === activePaperSize
      );

      let finalDriverPaperName = activePrintConfig.driverPaperName || 'A4';
      let finalOrientation = activePrintConfig.orientation || 'portrait';
      let finalMarginMm = activePrintConfig.marginMm || 0;
      let finalScale = activePrintConfig.scale || 1.0;
      let finalSafeMode = activePrintConfig.safeModeActive || false;

      if (matchedMapping) {
        finalDriverPaperName = matchedMapping.driverPaperName;
        finalOrientation = matchedMapping.orientation;
        finalMarginMm = matchedMapping.marginMm;
        finalScale = matchedMapping.scale;
        finalSafeMode = matchedMapping.safeMode;
      }

      const { addPrintJob } = useStore.getState();
      addPrintJob({
        documentId: 'customer_experience',
        documentName: `Mimo Pedido #${sale.orderNumber}`,
        printerId: targetPrinter.id,
        printerName: targetPrinter.name,
        paperErpId: activePaperSize,
        driverPaperName: finalDriverPaperName,
        orientation: finalOrientation,
        marginMm: finalMarginMm,
        scale: finalScale,
        safeMode: finalSafeMode,
        payload: compiled
      });

    } catch (err: any) {
      console.error(err);
      alert(`Falha ao enviar encarte do cliente para o spooler: ${err.message}`);
    }
  };

  const copyToClipboard = (text: string, id: string) => {
    if (!text) return;
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => {
      setCopiedId(null);
    }, 2000);
  };

  const getClientName = (clientId?: string) => {
    if (!clientId) return 'Consumidor Final';
    return clients.find(c => c.id === clientId)?.name || 'Consumidor Final';
  };

  const getStatusLabel = (status: string) => {
    return status.replace(/_/g, ' ').toUpperCase();
  };

  return (
    <div className="h-full flex flex-col gap-4 md:overflow-hidden md:max-h-[calc(100vh-140px)] p-1">
      {/* Upper Panel: Header & Filter Bar */}
      <div className="bg-[#121212] border border-white/5 rounded-2xl p-4 flex flex-col xl:flex-row gap-4 items-center shrink-0">
        <div className="flex items-center gap-3 flex-1 w-full">
          <div className="w-10 h-10 bg-indigo-500/10 rounded-xl flex items-center justify-center text-indigo-400">
            <HeartHandshake className="w-5 h-5 animate-pulse" />
          </div>
          <div>
            <h2 className="text-sm font-black text-white uppercase tracking-tight leading-none flex items-center gap-2">
              Experiência Operacional <span className="bg-emerald-500/10 text-emerald-400 text-[8px] font-black tracking-widest px-1.5 py-0.5 rounded uppercase">WMS PRO</span>
            </h2>
            <p className="text-[9px] uppercase font-black tracking-widest text-white/30 mt-1">Gere encartes, QR Codes e mídias individuais por pedido</p>
          </div>
        </div>

        {/* Toolbar Controls */}
        <div className="flex flex-col sm:flex-row gap-3 w-full xl:w-auto shrink-0">
          <button
            onClick={() => {
              useStore.setState({ isSettingsOpen: true, activeSettingModule: 'cupons', activeSubSetting: 'mensagemCliente' });
            }}
            className="px-4 py-2.5 bg-indigo-500/10 hover:bg-[#1f1e2e] border border-indigo-500/20 text-indigo-400 rounded-xl text-xs font-black uppercase tracking-wider transition-all flex items-center justify-center gap-2 cursor-pointer active:scale-95"
          >
            <Sliders className="w-4 h-4" />
            Configurar Impressão (Mensagem Cliente)
          </button>

          {/* Status Dropdown */}
          <div className="relative min-w-[180px]">
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="w-full bg-black/40 border border-white/5 rounded-xl py-2.5 pl-4 pr-10 text-xs text-white/70 focus:border-indigo-500 outline-none transition-all appearance-none cursor-pointer uppercase font-semibold"
            >
              <option value="todos">Todos os Status</option>
              {allStatuses.map(st => (
                <option key={st} value={st}>{getStatusLabel(st)}</option>
              ))}
            </select>
            <ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30 pointer-events-none" />
          </div>

          {/* Search Input */}
          <div className="relative min-w-[250px] flex-1">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-white/20 w-4 h-4" />
            <input 
              type="text" 
              placeholder="Buscar por pedido ou cliente..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full bg-black/40 border border-white/5 rounded-xl py-2.5 pl-12 pr-4 text-xs text-white focus:border-indigo-500/50 outline-none transition-all placeholder:text-white/15"
            />
          </div>
        </div>
      </div>

      {/* Grid of Orders */}
      <div className="flex-1 overflow-y-auto custom-scrollbar pr-1">
        {filteredSales.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center opacity-20 py-20">
            <Package className="w-16 h-16 mb-4" />
            <p className="text-[10px] uppercase font-black tracking-widest text-center">Nenhum pedido correspondente encontrado</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {filteredSales.map(sale => {
              const clientName = getClientName(sale.clientId);
              const customSet = !!sale.experienceContentUrl;

              return (
                <motion.div 
                  layout
                  key={sale.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className={cn(
                    "bg-[#121212] border border-white/5 rounded-2xl p-4 flex flex-col justify-between hover:border-indigo-500/30 transition-all shadow-lg hover:shadow-indigo-500/[0.02]",
                    customSet && "border-indigo-500/15 bg-indigo-500/[0.01]"
                  )}
                >
                  <div>
                    {/* Unique layout of card header */}
                    <div className="flex justify-between items-start gap-3 mb-2.5">
                      <div className="min-w-0">
                        <span className="text-[8px] font-black text-white/20 uppercase tracking-[0.2em] block mb-0.5">#{sale.orderNumber}</span>
                        <h3 className="text-xs font-bold text-white truncate" title={clientName}>{clientName}</h3>
                      </div>
                      <span className={cn(
                        "px-2 py-0.5 rounded-md text-[8px] font-black uppercase tracking-widest shrink-0",
                        sale.status === 'separado' ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/5" :
                        sale.status === 'embalando' ? "bg-pink-500/10 text-pink-400 border border-pink-500/5" :
                        "bg-white/5 text-white/40 border border-white/5"
                      )}>
                        {sale.status}
                      </span>
                    </div>

                    {/* Operational Details preview block */}
                    <div className="bg-black/20 rounded-xl p-3 border border-white/5 space-y-2 mb-3.5">
                      <div className="flex justify-between items-center text-[7px] uppercase font-black text-white/10 tracking-widest">
                        <span>Configuração vinculada</span>
                        {customSet ? (
                          <span className="flex items-center gap-1 text-emerald-400"><CheckCircle2 className="w-2.5 h-2.5" /> PERSONALIZADO</span>
                        ) : (
                          <span className="text-white/20">PADRÃO GLOBAL</span>
                        )}
                      </div>
                      
                      {/* Paper details indicator */}
                      <div className="flex justify-between items-center text-[9px] font-mono text-white/40">
                        <span className="uppercase">Papel:</span>
                        <span className="font-bold text-white/60">{sale.experiencePaperSize || customerExperienceConfig.paperSize}</span>
                      </div>

                      {/* Content representation */}
                      <div className="text-[9px] font-mono text-white/40 flex justify-between items-center gap-2">
                        <span className="uppercase shrink-0">QR Link:</span>
                        <span className="truncate text-indigo-400 text-right font-black max-w-[120px]" title={sale.experienceContentUrl || 'Padrão'}>
                          {sale.experienceContentUrl || 'Nenhum link'}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-2">
                    {/* If configured, allow immediate PDF trigger from grid */}
                    {customSet && (
                      <div className="grid grid-cols-2 gap-2">
                        <button
                          onClick={() => {
                            handleOpenEditor(sale);
                            // We can open then download
                            setTimeout(() => {
                              handleDownloadPdf();
                            }, 300);
                          }}
                          className="py-2.5 bg-zinc-900 hover:bg-zinc-800 text-white border border-white/5 rounded-xl text-[8px] font-black uppercase tracking-widest transition-all flex items-center justify-center gap-1.5"
                        >
                          <FileText className="w-3 h-3 text-cyan-400" /> Baixar PDF
                        </button>
                        <button
                          onClick={() => {
                            handleOpenEditor(sale);
                            // We can open then print
                            setTimeout(() => {
                              handlePrint();
                            }, 300);
                          }}
                          className="py-2.5 bg-indigo-500/10 hover:bg-indigo-500 hover:text-white border border-indigo-500/20 text-indigo-400 rounded-xl text-[8px] font-black uppercase tracking-widest transition-all flex items-center justify-center gap-1.5"
                        >
                          <Printer className="w-3 h-3 text-indigo-400" /> Imprimir
                        </button>
                      </div>
                    )}

                    <button 
                      onClick={() => handleOpenEditor(sale)}
                      className={cn(
                        "w-full py-2.5 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all flex items-center justify-center gap-1.5",
                        customSet 
                          ? "bg-indigo-600 hover:bg-indigo-500 text-white shadow-md shadow-indigo-950/50" 
                          : "bg-white/5 hover:bg-white/10 text-white/60 hover:text-white"
                      )}
                    >
                      <QrCode className="w-3.5 h-3.5" /> 
                      {customSet ? "Editar Experiência" : "Criar Experiência"}
                    </button>
                  </div>
                </motion.div>
              );
            })}
          </div>
        )}
      </div>

      {/* Operational Modal Designer */}
      <AnimatePresence>
        {selectedSale && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-2 sm:p-4">
            <motion.div 
              initial={{ opacity: 0 }} 
              animate={{ opacity: 1 }} 
              exit={{ opacity: 0 }} 
              onClick={() => setSelectedSale(null)} 
              className="absolute inset-0 bg-black/90 backdrop-blur-xl" 
            />
            {/* Split layout modular designer panel */}
            <motion.div 
              initial={{ opacity: 0, scale: 0.98, y: 15 }} 
              animate={{ opacity: 1, scale: 1, y: 0 }} 
              exit={{ opacity: 0, scale: 0.98, y: 15 }} 
              className="relative w-full max-w-6xl bg-[#0A0A0A] border border-white/10 rounded-[2rem] overflow-hidden shadow-2xl flex flex-col md:flex-row h-[94vh] md:h-[85vh] font-sans"
            >
              {/* Left Side: Fields Controls & Presets */}
              <div className="w-full md:w-[480px] border-r border-white/5 bg-[#121212]/50 flex flex-col h-1/2 md:h-full overflow-hidden">
                <div className="p-5 border-b border-white/5 shrink-0">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[8px] font-black text-indigo-400 uppercase tracking-[0.3em]">Operação Customizada</span>
                    <button onClick={() => setSelectedSale(null)} className="p-1 hover:bg-white/5 rounded-full transition-colors text-white/20">
                      <X className="w-5 h-5" />
                    </button>
                  </div>
                  <h3 className="text-base font-black text-white leading-tight uppercase tracking-wider">Pedido #{selectedSale.orderNumber}</h3>
                  <p className="text-[9px] text-white/40 mt-0.5 uppercase font-black tracking-widest">{getClientName(selectedSale.clientId)}</p>
                </div>

                <div className="flex-1 overflow-y-auto p-5 space-y-6 custom-scrollbar">
                  {/* Category Option: Presets / Tipos de Encarte */}
                  <div className="space-y-2">
                    <span className="text-[9px] uppercase font-black text-white/30 tracking-widest block mb-1">Dicas & Exemplos de Uso</span>
                    <div className="flex flex-wrap gap-2">
                      {USAGE_PRESETS.map(preset => (
                        <button
                          key={preset.id}
                          type="button"
                          onClick={() => handleApplyPreset(preset)}
                          className="px-2.5 py-1.5 bg-white/5 hover:bg-indigo-600/30 text-white rounded-lg text-[9px] font-black uppercase tracking-wider transition-all flex items-center gap-1.5 border border-white/5 cursor-pointer hover:border-indigo-500/20"
                        >
                          <span>{preset.icon}</span>
                          <span>{preset.label}</span>
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Bridging link to spooler config */}
                  <div className="bg-indigo-500/5 border border-indigo-500/10 rounded-2xl p-4 space-y-2">
                    <div className="flex items-center gap-2 text-indigo-400">
                      <Settings className="w-3.5 h-3.5 text-indigo-400" />
                      <span className="text-[10px] font-black uppercase tracking-wider">Ajustes do Layout Geral</span>
                    </div>
                    <p className="text-[9px] text-white/50 leading-relaxed uppercase font-semibold">
                      Para configurar margens, impressora física associada e opções de bobina da Mensagem do Cliente:
                    </p>
                    <button
                      type="button"
                      onClick={() => {
                        useStore.setState({ isSettingsOpen: true, activeSettingModule: 'cupons', activeSubSetting: 'mensagemCliente' });
                      }}
                      className="w-full py-2 bg-indigo-600/20 hover:bg-indigo-600 border border-indigo-500/30 text-white rounded-xl text-[9px] font-black uppercase tracking-widest transition-all cursor-pointer text-center"
                    >
                      Configurar Impressora & Spooler
                    </button>
                  </div>

                  {/* Sizing & Theme settings */}
                  <div className="grid grid-cols-2 gap-4">
                    {/* Paper Selector */}
                    <div className="space-y-2">
                      <label className="text-[9px] uppercase font-black text-white/30 tracking-widest block">Dimensão do Papel</label>
                      <div className="relative">
                        <select
                          value={paperSize}
                          onChange={(e) => setPaperSize(e.target.value as any)}
                          className="w-full bg-black/60 border border-white/10 rounded-xl py-2.5 pl-3 pr-10 text-[10px] uppercase font-black tracking-widest text-white outline-none focus:border-indigo-500/50 appearance-none cursor-pointer"
                        >
                          {PAPER_OPTIONS.map(opt => (
                            <option key={opt.id} value={opt.id}>{opt.label}</option>
                          ))}
                        </select>
                        <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30 pointer-events-none" />
                      </div>
                    </div>

                    {/* Theme selector */}
                    <div className="space-y-2">
                      <label className="text-[9px] uppercase font-black text-white/30 tracking-widest block">Tema de Design</label>
                      <div className="relative">
                        <select
                          value={themeId}
                          onChange={(e) => setThemeId(e.target.value)}
                          className="w-full bg-black/60 border border-white/10 rounded-xl py-2.5 pl-3 pr-10 text-[10px] uppercase font-black tracking-widest text-white outline-none focus:border-indigo-500/50 appearance-none cursor-pointer"
                        >
                          <option value="">Sem Tema (Preto & Branco)</option>
                          {imageThemes.map(th => (
                            <option key={th.id} value={th.id}>{th.name.toUpperCase()}</option>
                          ))}
                        </select>
                        <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30 pointer-events-none" />
                      </div>
                    </div>
                  </div>

                  {/* Main Link Input */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between px-1">
                      <label className="text-[9px] uppercase font-black text-white/30 tracking-widest">Link de Destino do QR Code</label>
                      {linkInput && validateUrl(linkInput) && (
                        <span className="text-[8px] font-black text-emerald-400 bg-emerald-500/10 px-1.5 py-0.5 rounded uppercase flex items-center gap-1">
                          <CheckCircle2 className="w-2.5 h-2.5" /> URL Válida
                        </span>
                      )}
                    </div>
                    <div className="relative group">
                      <QrCode className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/20 group-focus-within:text-indigo-500 transition-colors" />
                      <input 
                        type="text" 
                        placeholder="Ex: Link do YouTube, Google Drive, tracking..."
                        value={linkInput}
                        onChange={(e) => {
                          setLinkInput(e.target.value);
                          setShowSuccess(false);
                        }}
                        className="w-full bg-black/60 border border-white/10 rounded-xl py-3 pl-10 pr-4 text-[10px] text-white outline-none focus:border-indigo-500/50 transition-all font-mono"
                      />
                    </div>
                  </div>

                  {/* Envelope Overrides Content */}
                  <div className="space-y-4 pt-3 border-t border-white/5">
                    <span className="text-[9px] uppercase font-black text-white/35 tracking-widest block">Textos do Encarte</span>

                    <div className="space-y-3">
                      <div>
                        <label className="text-[8px] uppercase font-black tracking-wider text-white/30 block mb-1">Título do Encarte / Empresa</label>
                        <input 
                          type="text" 
                          value={companyName}
                          onChange={(e) => setCompanyName(e.target.value)}
                          className="w-full bg-black/40 border border-white/10 text-white text-[10px] px-3 py-2 rounded-xl focus:border-indigo-500 outline-none uppercase font-semibold"
                          placeholder="Ex: BELEZA INDUSTRIAL LTDA"
                        />
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div>
                          <label className="text-[8px] uppercase font-black tracking-wider text-white/30 block mb-1">Título da Mensagem</label>
                          <input 
                            type="text" 
                            value={mainMessage}
                            onChange={(e) => setMainMessage(e.target.value)}
                            className="w-full bg-black/40 border border-white/10 text-white text-[10px] px-3 py-2 rounded-xl focus:border-indigo-500 outline-none font-semibold"
                          />
                        </div>
                        <div>
                          <label className="text-[8px] uppercase font-black tracking-wider text-white/30 block mb-1">Mensagem de Rodapé</label>
                          <input 
                            type="text" 
                            value={footerObs}
                            onChange={(e) => setFooterObs(e.target.value)}
                            className="w-full bg-black/40 border border-white/10 text-white text-[10px] px-3 py-2 rounded-xl focus:border-indigo-500 outline-none font-semibold"
                          />
                        </div>
                      </div>

                      <div>
                        <label className="text-[8px] uppercase font-black tracking-wider text-white/30 block mb-1">Mensagem de Conteúdo Principal</label>
                        <textarea 
                          rows={3}
                          value={secondaryMessage}
                          onChange={(e) => setSecondaryMessage(e.target.value)}
                          className="w-full bg-black/40 border border-white/10 text-white text-[10px] px-3 py-2 rounded-xl focus:border-indigo-500 outline-none font-medium resize-none leading-relaxed"
                        />
                      </div>

                      {/* Contacts block */}
                      <div className="grid grid-cols-3 gap-2.5">
                        <div>
                          <label className="text-[7.5px] uppercase font-black tracking-wider text-white/20 block mb-0.5">Telefone</label>
                          <input 
                            type="text" 
                            value={phone}
                            placeholder="Telefone"
                            onChange={(e) => setPhone(e.target.value)}
                            className="w-full bg-black/40 border border-white/10 text-white text-[9px] font-mono px-2 py-1.5 rounded-lg focus:border-indigo-50 outline-none"
                          />
                        </div>
                        <div>
                          <label className="text-[7.5px] uppercase font-black tracking-wider text-white/20 block mb-0.5">Instagram</label>
                          <input 
                            type="text" 
                            value={instagram}
                            placeholder="@conta"
                            onChange={(e) => setInstagram(e.target.value)}
                            className="w-full bg-[#000]/40 border border-white/10 text-white text-[9px] font-mono px-2 py-1.5 rounded-lg focus:border-indigo-50 outline-none"
                          />
                        </div>
                        <div>
                          <label className="text-[7.5px] uppercase font-black tracking-wider text-white/20 block mb-0.5">Facebook</label>
                          <input 
                            type="text" 
                            value={facebook}
                            placeholder="Conta"
                            onChange={(e) => setFacebook(e.target.value)}
                            className="w-full bg-black/40 border border-white/10 text-white text-[9px] font-mono px-2 py-1.5 rounded-lg focus:border-indigo-50 outline-none"
                          />
                        </div>
                      </div>
                    </div>
                  </div>

                  {showSuccess && (
                    <motion.div 
                      initial={{ opacity: 0, scale: 0.95 }}
                      animate={{ opacity: 1, scale: 1 }}
                      className="p-4 bg-emerald-500/10 border border-emerald-500/20 rounded-2xl flex items-center gap-3"
                    >
                      <div className="w-8 h-8 rounded-full bg-emerald-500 flex items-center justify-center text-black shadow-lg shadow-emerald-500/20">
                        <CheckCircle2 className="w-5 h-5" />
                      </div>
                      <div className="flex-1">
                        <p className="text-[10px] font-black text-white uppercase tracking-tight">Experiência Salva!</p>
                        <p className="text-[9px] text-emerald-400">Layout e mídias vinculadas ao Pedido com sucesso.</p>
                      </div>
                    </motion.div>
                  )}
                </div>

                <div className="p-5 bg-black/40 border-t border-white/5 max-h-min shrink-0 flex gap-3">
                  <button 
                    onClick={() => setSelectedSale(null)}
                    type="button"
                    className="flex-1 py-3 bg-white/5 hover:bg-white/10 border border-white/5 text-white/60 hover:text-white rounded-xl text-[10px] font-black uppercase tracking-widest transition-all cursor-pointer text-center"
                  >
                    Fechar
                  </button>
                  <button 
                    onClick={handleSave}
                    disabled={isSaving || showSuccess}
                    className={cn(
                      "flex-[2] flex items-center justify-center gap-2.5 py-3 rounded-xl text-[10px] font-black uppercase tracking-[0.15em] transition-all shadow-xl active:scale-95 disabled:opacity-20 disabled:grayscale cursor-pointer outline-none",
                      showSuccess ? "bg-emerald-500 text-black border border-emerald-500" : "bg-indigo-600 hover:bg-indigo-500 text-white border border-indigo-700 shadow-indigo-950/40"
                    )}
                  >
                    {isSaving ? <Sparkles className="w-4 h-4 animate-spin" /> : showSuccess ? <CheckCircle2 className="w-4 h-4" /> : <Save className="w-4 h-4" />}
                    {showSuccess ? "Gravado" : "Salvar no Pedido"}
                  </button>
                </div>
              </div>

              {/* Right Side: Real-time Preview Rendering Box */}
              <div className="flex-1 bg-black relative flex flex-col h-1/2 md:h-full overflow-hidden">
                <div className="absolute top-5 left-5 z-10 flex items-center gap-2.5 px-3 py-1.5 bg-black/60 rounded-full border border-white/10 backdrop-blur-md">
                  <QrCode className="w-3.5 h-3.5 text-emerald-400 animate-pulse" />
                  <span className="text-[7.5px] font-black text-white/50 uppercase tracking-[0.25em]">Visualização Escalonada de Encarte</span>
                </div>

                {/* Render live layout */}
                <div className="flex-1 flex items-center justify-center p-4 overflow-y-auto bg-gradient-to-br from-indigo-950/15 via-[#000]/80 to-black select-none custom-scrollbar">
                  {livePreviewPayload && (
                    <div className="w-full max-w-sm flex items-center justify-center">
                      <CanonicalDocumentPreview
                        documentType="mensagemCliente"
                        payload={livePreviewPayload}
                        paperSize={paperSize}
                        themeId={themeId}
                        initialZoom="fit"
                        initialShowGuides={false}
                      />
                    </div>
                  )}
                </div>

                {/* Print and PDF Triggers bottom container (REMOVED) */}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
