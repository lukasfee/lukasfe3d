import React, { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Eye, 
  Truck, 
  XCircle, 
  CheckCircle2, 
  Package, 
  ClipboardList, 
  AlertCircle, 
  FileDown, 
  User, 
  History as HistoryIcon, 
  RotateCcw, 
  ExternalLink, 
  Sparkles, 
  Printer, 
  Activity, 
  HeartHandshake, 
  Copy, 
  Edit2, 
  Check,
  PackageCheck
} from 'lucide-react';
import { cn } from '../lib/utils';
import { useStore, Sale } from '../store';
import { format } from 'date-fns';
import { useNavigate } from 'react-router-dom';

interface OrderPanelProps {
  orderId: string;
  onClose: () => void;
  // State from parent
  isGeneratingPdf: boolean;
  setIsGeneratingPdf: (v: boolean) => void;
  isPrinting: boolean;
  setIsPrinting: (v: boolean) => void;
  // Parent utility methods and dictionaries
  getCombinedTimeline: (sale: any) => any[];
  getStatusLabel: (status: string) => string;
  getStatusInfo: (status: string) => any;
  getClientName: (clientId?: string) => string;
  canShowReceipt: (status: string) => boolean;
  REVERT_STATUS_MAP: Record<string, string>;
  // Parent triggers
  handleCancelOrder: (id: string) => void;
  handleRevertStatus: (order: any) => void;
  handleInitiateDispatch: (id: string) => void;
  setPackagingOrder: (order: any) => void;
  setIsPackagingConferenceModalOpen: (v: boolean) => void;
  setDeliveryOrder: (order: any) => void;
  setIsDeliveryModalOpen: (v: boolean) => void;
  // Document generation wrappers
  handleDownloadCupomPdf: (order: any) => void;
  handlePrintCupom: (order: any) => void;
  handleDownloadOrderLabelsPdfInternal: (order: any) => void;
  handlePrintOrderLabelsInternal: (order: any) => void;
  handleDownloadExperiencePdfInternal: (order: any) => void;
  handleGeneratePdfReceipt: (order: any) => void;
  handlePrintReceipt: (order: any) => void;
  isDispatching?: boolean;
}

export const OrderPanel: React.FC<OrderPanelProps> = ({
  orderId,
  onClose,
  isGeneratingPdf,
  setIsGeneratingPdf,
  isPrinting,
  setIsPrinting,
  isDispatching = false,
  getCombinedTimeline,
  getStatusLabel,
  getStatusInfo,
  getClientName,
  canShowReceipt,
  REVERT_STATUS_MAP,
  handleCancelOrder,
  handleRevertStatus,
  handleInitiateDispatch,
  setPackagingOrder,
  setIsPackagingConferenceModalOpen,
  setDeliveryOrder,
  setIsDeliveryModalOpen,
  handleDownloadCupomPdf,
  handlePrintCupom,
  handleDownloadOrderLabelsPdfInternal,
  handlePrintOrderLabelsInternal,
  handleDownloadExperiencePdfInternal,
  handleGeneratePdfReceipt,
  handlePrintReceipt
}) => {
  const navigate = useNavigate();
  const sales = useStore(state => state.sales);
  const auditLogs = useStore(state => state.auditLogs);
  const currentUser = useStore(state => state.currentUser);
  const updateSale = useStore(state => state.updateSale);
  const updateSaleStatus = useStore(state => state.updateSaleStatus);
  const customerExperienceConfig = useStore(state => state.customerExperienceConfig);

  // Synchronized active order reference from the global store
  const activeOrder = useMemo(() => {
    return sales.find(s => s.id === orderId) || null;
  }, [sales, orderId]);

  const [activeDetailsTab, setActiveDetailsTab] = useState<'summary' | 'products' | 'timeline' | 'audit'>('summary');
  const [tempNotes, setTempNotes] = useState('');
  const [tempInternalNotes, setTempInternalNotes] = useState('');
  const [tempPickerNotes, setTempPickerNotes] = useState('');
  const [tempDeliveryNotes, setTempDeliveryNotes] = useState('');
  const [savingNotes, setSavingNotes] = useState(false);
  const [notesSavedSuccess, setNotesSavedSuccess] = useState(false);

  // Populate note fields when order metadata updates
  useEffect(() => {
    if (activeOrder) {
      setTempNotes(activeOrder.notes || '');
      setTempInternalNotes((activeOrder as any).internalNotes || '');
      setTempPickerNotes((activeOrder as any).pickerNotes || '');
      setTempDeliveryNotes(activeOrder.deliveryNotes || '');
    }
  }, [orderId, activeOrder]);

  if (!activeOrder) return null;

  // Save notes handler
  const handleSaveAllNotes = async () => {
    setSavingNotes(true);
    try {
      updateSale(activeOrder.id, {
        notes: tempNotes,
        internalNotes: tempInternalNotes,
        pickerNotes: tempPickerNotes,
        deliveryNotes: tempDeliveryNotes
      } as any);
      setNotesSavedSuccess(true);
      setTimeout(() => setNotesSavedSuccess(false), 3000);
    } catch (err) {
      console.error("Erro ao salvar observações:", err);
    } finally {
      setSavingNotes(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-2 sm:p-4 select-text">
      {/* Background Overlay */}
      <motion.div 
        initial={{ opacity: 0 }} 
        animate={{ opacity: 1 }} 
        exit={{ opacity: 0 }} 
        onClick={onClose} 
        className="absolute inset-0 bg-black/85 backdrop-blur-md cursor-pointer" 
      />

      {/* Main Operational Container */}
      <motion.div 
        initial={{ opacity: 0, scale: 0.95 }} 
        animate={{ opacity: 1, scale: 1 }} 
        exit={{ opacity: 0, scale: 0.95 }} 
        className="relative w-full max-w-6xl bg-[#090d10] border border-white/10 rounded-2xl md:rounded-3xl overflow-hidden shadow-2xl flex flex-col h-[95vh] md:h-[90vh] details-modal"
      >
        {/* Modal Header */}
        <div className="p-4 md:p-6 border-b border-white/5 bg-[#0a0f12]/90 flex items-center justify-between details-modal-header shrink-0">
          <div className="flex items-center gap-3">
            <div className={cn(
              "w-3 h-3 rounded-full animate-pulse shrink-0",
              getStatusInfo(activeOrder.status).color.split(' ')[1]
            )} />
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-lg md:text-xl font-black text-white leading-none">
                  Pedido #{activeOrder.orderNumber}
                </h3>
                <span className="text-[9px] font-mono text-white/30 border border-white/10 px-1.5 py-0.5 rounded uppercase font-black bg-white/[0.02]">
                  PDV / LOCAL
                </span>
              </div>
              <p className="text-[10px] text-white/40 uppercase font-black tracking-widest mt-2 flex items-center gap-1.5 leading-none">
                {getStatusLabel(activeOrder.status)}
                <span className="text-[14px] text-white/10 select-none">•</span>
                Registrado em: {format(activeOrder.timestamp, "dd/MM/yyyy 'às' HH:mm")}
              </p>
            </div>
          </div>
          <button 
            onClick={onClose} 
            className="p-2 hover:bg-white/5 rounded-full transition-all text-white/45 hover:text-white min-w-[44px] min-h-[44px] flex items-center justify-center cursor-pointer"
            aria-label="Fechar"
            type="button"
          >
            <XCircle className="w-6 h-6 shrink-0" />
          </button>
        </div>

        {/* Mobile / Tablet Tab Bar Controls */}
        <div className="lg:hidden flex border-b border-white/5 bg-[#0a0d0f] p-1.5 gap-1 shrink-0 details-modal-tabs">
          <button
            type="button"
            onClick={() => setActiveDetailsTab('summary')}
            className={cn(
              "flex-1 py-2 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all text-center",
              activeDetailsTab === 'summary' 
                ? "bg-white/15 text-white border border-white/5 font-black shadow-inner" 
                : "text-white/40 hover:text-white/70"
            )}
          >
            Geral
          </button>
          <button
            type="button"
            onClick={() => setActiveDetailsTab('products')}
            className={cn(
              "flex-1 py-2 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all text-center flex items-center justify-center gap-1",
              activeDetailsTab === 'products' 
                ? "bg-white/15 text-white border border-white/5 font-black shadow-inner" 
                : "text-white/40 hover:text-white/70"
            )}
          >
            Produtos ({activeOrder.items.length})
          </button>
          <button
            type="button"
            onClick={() => setActiveDetailsTab('timeline')}
            className={cn(
              "flex-1 py-2 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all text-center flex items-center justify-center gap-1",
              activeDetailsTab === 'timeline' 
                ? "bg-white/15 text-white border border-white/5 font-black shadow-inner" 
                : "text-white/40 hover:text-white/70"
            )}
          >
            Rastreio
            {activeOrder.timelineEvents && activeOrder.timelineEvents.length > 0 && (
              <span className="px-1 text-[8px] rounded-full bg-emerald-500/20 text-emerald-400 font-mono">
                {activeOrder.timelineEvents.length}
              </span>
            )}
          </button>
          <button
            type="button"
            onClick={() => setActiveDetailsTab('audit')}
            className={cn(
              "flex-1 py-2 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all text-center",
              activeDetailsTab === 'audit' 
                ? "bg-white/15 text-white border border-white/5 font-black shadow-inner" 
                : "text-white/40 hover:text-white/70"
            )}
          >
            Auditoria
          </button>
        </div>

        {/* Dynamic Inner Panel Workspace */}
        <div className="flex-1 overflow-hidden p-4 md:p-6 bg-[#07090b] details-modal-content">
          
          {/* DESKTOP SPLIT PANEL - VIEWPORT AT POINT LARGE */}
          <div className="hidden lg:grid lg:grid-cols-12 gap-6 h-full overflow-hidden">
            
            {/* LEFT COMPARTMENT - OPERATIONAL METADATA */}
            <div className="lg:col-span-8 h-full flex flex-col overflow-y-auto pr-2 space-y-6 scroll-smooth custom-scrollbar">
              
              {/* Header Pulse status badge */}
              <div className="flex items-center justify-between p-4 bg-[#0d1216] border border-white/5 rounded-2xl select-none">
                <div className="flex items-center gap-6">
                  <div>
                    <span className="text-[7px] uppercase font-black text-white/30 tracking-widest block mb-1 font-sans">Status Operacional</span>
                    <span className={cn(
                      "px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-widest border",
                      getStatusInfo(activeOrder.status).color
                    )}>
                      {getStatusLabel(activeOrder.status)}
                    </span>
                  </div>
                  <div>
                    <span className="text-[7px] uppercase font-black text-white/30 tracking-widest block mb-1 font-sans">Triagem Logística</span>
                    <span className="text-xs font-bold text-white/70">WMS integrado / Loja Local</span>
                  </div>
                  <div>
                    <span className="text-[7px] uppercase font-black text-white/30 tracking-widest block mb-1 font-sans">Registro de Venda</span>
                    <span className="text-xs font-mono font-bold text-emerald-400">R$ {activeOrder.total.toFixed(2)}</span>
                  </div>
                </div>

                <div className="text-right">
                  <span className="text-[7.5px] uppercase font-black text-indigo-400 font-sans tracking-[0.2em] block mb-0.5 animate-pulse">Fluxo de Paridade</span>
                  <p className="text-[9px] font-mono text-white/20">WMS Core verificado</p>
                </div>
              </div>

              {/* DIVERGENCES WARNER BLOCK */}
              {(activeOrder.status === 'separado_com_faltantes' || (activeOrder.missingProductsList && activeOrder.missingProductsList.length > 0)) && (
                <div className="p-4 bg-amber-500/10 border border-amber-500/20 rounded-2xl flex items-start gap-3.5 shadow-md">
                  <AlertCircle className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
                  <div className="space-y-1.5 flex-1 select-text">
                    <h4 className="text-[11px] font-black text-amber-400 uppercase leading-none tracking-wide">Divergência na Separação - Faltantes Detectados</h4>
                    <p className="text-[10px] text-amber-200/60 leading-snug">
                      Esse pedido foi faturado e salvo com divergência física no estoque. Os seguintes SKUs não foram encontrados no picking:
                    </p>
                    <div className="mt-2.5 space-y-1 bg-black/45 p-2.5 rounded-xl border border-amber-500/15">
                      {(activeOrder.missingProductsList || []).map((missingItem: any, miIdx: number) => (
                        <div key={miIdx} className="flex justify-between items-center text-[10px] font-mono text-amber-300">
                          <span className="truncate max-w-[320px] font-bold">{missingItem.name || 'Produto'}</span>
                          <span className="shrink-0 font-black">Falta: {missingItem.quantityMissing !== undefined ? missingItem.quantityMissing : (missingItem.missingQuantity || 1)}x</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* SECTION: CLIENT DETAILS AND SHIPPING LOGISTICS INFO */}
              <div className="grid grid-cols-2 gap-4">
                {/* Client contacts info card */}
                <div className="bg-[#0b0e11] border border-white/5 rounded-2xl p-4 space-y-3 shadow-md select-text">
                  <h4 className="text-[10px] font-black uppercase text-white/30 tracking-wider flex items-center gap-1.5 border-b border-white/5 pb-1.5">
                    <User className="w-3.5 h-3.5 text-indigo-400" /> Informações do Cliente
                  </h4>
                  <div className="space-y-1">
                    <p className="text-xs font-black text-white">{getClientName(activeOrder.clientId)}</p>
                    <p className="text-[10px] font-mono text-white/50">{activeOrder.clientPhone || 'Nenhum telefone registrado'}</p>
                    <p className="text-[9px] text-white/35 font-mono">Ref Cadastro: {activeOrder.clientId || 'Consumidor Final (Sem Cadastro)'}</p>
                  </div>
                </div>

                {/* Shipping logistics courier details */}
                <div className="bg-[#0b0e11] border border-white/5 rounded-2xl p-4 space-y-3 shadow-md select-text">
                  <h4 className="text-[10px] font-black uppercase text-white/30 tracking-wider flex items-center gap-1.5 border-b border-white/5 pb-1.5">
                    <Truck className="w-3.5 h-3.5 text-blue-400" /> Logística de Envio
                  </h4>
                  <div className="space-y-1">
                    <p className="text-xs font-black text-white flex items-center gap-1.5">
                      Meio: <span className="text-blue-400 uppercase font-black">{activeOrder.deliveryMethodName || 'Entrega Local / Retirada'}</span>
                    </p>
                    {activeOrder.trackingCode && (
                      <p className="text-[10px] font-mono text-white/50 flex items-center gap-1.5">
                        Rastreio: <span className="text-cyan-400 select-all font-bold font-mono">{activeOrder.trackingCode}</span>
                      </p>
                    )}
                    {activeOrder.deliveryDriver && (
                      <p className="text-[9px] font-mono text-white/35">
                        Entregador: <span className="text-white/60 font-bold">{activeOrder.deliveryDriver}</span>
                      </p>
                    )}
                    {activeOrder.deliveryAddedBy && (
                      <p className="text-[8.5px] font-mono text-white/30">
                        Despachado por: {activeOrder.deliveryAddedBy} às {activeOrder.deliveryAddedAt ? format(activeOrder.deliveryAddedAt, "dd/MM HH:mm") : ''}
                      </p>
                    )}
                  </div>
                </div>
              </div>

              {/* PRODUCTS LIST TABLE */}
              <div className="bg-[#0b0e11] border border-white/5 rounded-2xl p-4 space-y-3.5 shadow-md">
                <div className="flex items-center justify-between border-b border-white/5 pb-2.5 select-none">
                  <h4 className="text-[10px] font-black uppercase text-white/30 tracking-wider flex items-center gap-2">
                    <ClipboardList className="w-4 h-4 text-emerald-400" />
                    Itens Faturados e Fracionamentos
                  </h4>
                  <span className="text-[9px] font-mono text-white/40 font-bold">
                    Total QTD Pedida: {activeOrder.items.reduce((acc, i) => acc + i.quantity, 0)}x
                  </span>
                </div>

                <div className="space-y-2 max-h-[300px] overflow-y-auto pr-1 custom-scrollbar">
                  {activeOrder.items.map((item, idx) => {
                    const isSeparated = canShowReceipt(activeOrder.status);
                    const pickedQty = item.pickedQuantity !== undefined ? item.pickedQuantity : item.quantity;
                    const missingQty = Math.max(0, item.quantity - pickedQty);

                    return (
                      <div 
                        key={idx} 
                        className="flex items-center justify-between p-3 bg-black/35 hover:bg-black/55 border border-white/5 hover:border-white/10 rounded-xl transition-all"
                      >
                        <div className="min-w-0 flex-1 pr-4 select-text">
                          <p className="text-xs font-bold text-white truncate">{item.name}</p>
                          <span className="text-[9px] text-white/40 font-mono tracking-widest">{item.code || `SKU_CODE_${idx}`}</span>
                        </div>

                        <div className="flex items-center gap-6 text-right font-sans shrink-0 select-none">
                          {isSeparated ? (
                            <>
                              <div className="min-w-[40px]">
                                <span className="block text-[7px] text-white/30 uppercase font-black leading-none mb-1">Pedida</span>
                                <span className="text-xs font-bold text-white/50">{item.quantity}x</span>
                              </div>
                              <div className="min-w-[40px]">
                                <span className="block text-[7px] text-emerald-400 uppercase font-black leading-none mb-1 font-bold">Separada</span>
                                <span className="text-xs font-black text-emerald-400">{pickedQty}x</span>
                              </div>
                              {missingQty > 0 && (
                                <div className="min-w-[40px]">
                                  <span className="block text-[7px] text-red-500 uppercase font-black leading-none mb-1 font-bold">Diverge</span>
                                  <span className="text-xs font-black text-red-500">{missingQty}x</span>
                                </div>
                              )}
                              <div className="min-w-[70px]">
                                <span className="block text-[7px] text-white/30 uppercase font-black leading-none mb-1">Subtotal</span>
                                <span className="text-xs font-mono font-black text-emerald-400">R$ {(item.price * pickedQty).toFixed(2)}</span>
                              </div>
                            </>
                          ) : (
                            <>
                              <div className="min-w-[45px]">
                                <span className="block text-[7px] text-white/35 uppercase font-black leading-none mb-1">Quantidade</span>
                                <span className="text-xs font-bold text-white">{item.quantity}x</span>
                              </div>
                              <div className="min-w-[70px]">
                                <span className="block text-[7px] text-white/35 uppercase font-black leading-none mb-1">Subtotal</span>
                                <span className="text-xs font-mono font-black text-emerald-400">R$ {(item.price * item.quantity).toFixed(2)}</span>
                              </div>
                            </>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* OBSERVATIONS AND MULTIDEPARTMENT ANNOTATIONS TEXTAREAS */}
              <div className="bg-[#0b0e11] border border-white/5 rounded-2xl p-4 space-y-4 shadow-md">
                <div className="flex items-center justify-between border-b border-white/5 pb-2.5 select-none">
                  <div className="flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-indigo-400 animate-pulse" />
                    <h4 className="text-[10px] font-black uppercase text-white/30 tracking-wider">Anotações e Prontuários (Observations)</h4>
                  </div>
                  <button
                    onClick={handleSaveAllNotes}
                    disabled={savingNotes}
                    className={cn(
                      "py-1.5 px-3.5 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all flex items-center justify-center gap-1.5 border cursor-pointer",
                      notesSavedSuccess
                        ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-400 shadow-[0_0_15px_rgba(16,185,129,0.15)]"
                        : "bg-indigo-600 hover:bg-indigo-500 border-indigo-500/30 text-white shadow-lg shadow-indigo-600/10"
                    )}
                    type="button"
                  >
                    {savingNotes ? (
                      <svg className="animate-spin h-3 w-3 text-current" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                      </svg>
                    ) : notesSavedSuccess ? (
                      <Check className="w-3 h-3 text-emerald-400" />
                    ) : (
                      <PackageCheck className="w-3.5 h-3.5" />
                    )}
                    {savingNotes ? 'Gravando...' : notesSavedSuccess ? 'Notas Salvas!' : 'Salvar Notas'}
                  </button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="text-[8px] font-black uppercase text-white/40 tracking-wider flex items-center gap-1.5 select-none">
                      <HeartHandshake className="w-3 h-3 text-[#fb7185]" /> Observações do PDV (Cliente)
                    </label>
                    <textarea
                      value={tempNotes}
                      onChange={(e) => setTempNotes(e.target.value)}
                      rows={2}
                      placeholder="Nenhuma informação enviada pelo cliente..."
                      className="w-full text-[11px] text-white placeholder-white/10 bg-black/40 hover:bg-black/55 focus:bg-black/75 border border-white/5 rounded-xl p-2.5 focus:outline-none focus:border-[#fb7185]/55 resize-none transition-all"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-[8px] font-black uppercase text-white/40 tracking-wider flex items-center gap-1.5 select-none">
                      <User className="w-3 h-3 text-blue-400" /> Notas Internas do Admin
                    </label>
                    <textarea
                      value={tempInternalNotes}
                      onChange={(e) => setTempInternalNotes(e.target.value)}
                      rows={2}
                      placeholder="Adicione considerações gerenciais internas..."
                      className="w-full text-[11px] text-white placeholder-white/10 bg-black/40 hover:bg-black/55 focus:bg-black/75 border border-white/5 rounded-xl p-2.5 focus:outline-none focus:border-blue-500/50 resize-none transition-all"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-[8px] font-black uppercase text-white/40 tracking-wider flex items-center gap-1.5 select-none">
                      <Package className="w-3 h-3 text-amber-500" /> Notas de Separação / Picker
                    </label>
                    <textarea
                      value={tempPickerNotes}
                      onChange={(e) => setTempPickerNotes(e.target.value)}
                      rows={2}
                      placeholder="Relatórios ou anotações físicas do separador..."
                      className="w-full text-[11px] text-white placeholder-white/10 bg-black/40 hover:bg-black/55 focus:bg-black/75 border border-white/5 rounded-xl p-2.5 focus:outline-none focus:border-amber-500/55 resize-none transition-all"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-[8px] font-black uppercase text-white/40 tracking-wider flex items-center gap-1.5 select-none">
                      <Truck className="w-3 h-3 text-cyan-400" /> Notas de Despacho & Logística
                    </label>
                    <textarea
                      value={tempDeliveryNotes}
                      onChange={(e) => setTempDeliveryNotes(e.target.value)}
                      rows={2}
                      placeholder="Diretrizes e detalhes de encaminhamento de rota..."
                      className="w-full text-[11px] text-white placeholder-white/10 bg-black/40 hover:bg-black/55 focus:bg-black/75 border border-white/5 rounded-xl p-2.5 focus:outline-none focus:border-cyan-500/50 resize-none transition-all"
                    />
                  </div>
                </div>
              </div>

              {/* AUDIT LOGS TRAIL TABLE */}
              <div className="bg-[#0b0e11] border border-white/5 rounded-2xl p-4 space-y-3 shadow-md">
                <h4 className="text-[10px] font-black uppercase text-white/30 tracking-wider flex items-center gap-2 border-b border-white/5 pb-2.5 select-none">
                  <HistoryIcon className="w-4 h-4 text-purple-400 animate-pulse" />
                  Histórico de Auditoria do Pedido (Audit Trails)
                </h4>

                <div className="max-h-[220px] overflow-y-auto pr-1 space-y-1.5 custom-scrollbar select-text">
                  {(() => {
                    const orderRefStr = `#${activeOrder.orderNumber}`;
                    const matchedAudits = auditLogs.filter(log => 
                      log.referenceId === activeOrder.id || 
                      log.entityId === activeOrder.id ||
                      log.description.includes(orderRefStr)
                    ).sort((a, b) => b.timestamp - a.timestamp);

                    if (matchedAudits.length === 0) {
                      return (
                        <p className="text-[10px] text-white/20 italic p-4 text-center">
                          Nenhum log de auditoria específico registrado para este pedido.
                        </p>
                      );
                    }

                    return matchedAudits.map((log) => (
                      <div 
                        key={log.id} 
                        className="p-2.5 bg-black/40 border border-white/[0.02] rounded-xl flex items-start justify-between gap-3 text-[10px] hover:border-white/5 transition-all"
                      >
                        <div className="space-y-1">
                          <div className="flex items-center gap-2 select-none">
                            <span className="font-mono text-white/50 tracking-wider uppercase font-black text-[8px] px-1 bg-white/5 border border-white/10 rounded">
                              {log.module || 'ADMIN'}
                            </span>
                            <span className="font-bold text-white/95">{log.action || 'Alteração'}</span>
                          </div>
                          <p className="text-white/60 leading-normal text-[9.5px]">
                            {log.description}
                          </p>
                          {log.previousValue && (
                            <p className="text-[8.5px] font-mono text-amber-500/70 leading-none select-none">
                              De: {log.previousValue} | Para: {log.newValue}
                            </p>
                          )}
                        </div>
                        <div className="text-right shrink-0">
                          <p className="font-bold text-white/40">{log.userLogin || 'Sistema'}</p>
                          <p className="text-[8px] text-white/20 font-mono mt-0.5">{format(log.timestamp, "dd/MM/yyyy HH:mm:ss")}</p>
                        </div>
                      </div>
                    ));
                  })()}
                </div>
              </div>

            </div>

            {/* RIGHT COMPARTMENT - FINANCIALS, ACTIONS AND TIMELINE */}
            <div className="lg:col-span-4 h-full flex flex-col bg-black/20 lg:border-l lg:border-white/5 pl-2 overflow-y-auto pr-1 custom-scrollbar gap-6 pb-20 lg:pb-0 select-none">
              
              {/* BILLING DEMONSTRATIVE LEDGER */}
              <div className="bg-[#0b0e11] border border-white/5 rounded-2xl p-4 space-y-4 shadow-md">
                <h4 className="text-[10px] font-black uppercase text-white/30 tracking-wider flex items-center gap-1.5 border-b border-white/5 pb-2">
                  <Activity className="w-3.5 h-3.5 text-emerald-400" /> Demonstrativo de Faturamento
                </h4>

                {activeOrder.originalTotal !== undefined && activeOrder.originalTotal !== activeOrder.total && (
                  <div className="p-3 bg-amber-500/[0.02] border border-dashed border-amber-500/20 rounded-xl space-y-1.5 text-[10px] select-text">
                    <div className="flex justify-between items-center text-white/40 font-mono uppercase tracking-wider">
                      <span>Subtotal Original (PDV):</span>
                      <span className="font-black text-white/60">R$ {(activeOrder.originalSubtotal || activeOrder.originalTotal).toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between items-center text-white/40 font-mono uppercase tracking-wider">
                      <span>Valor Original (PDV):</span>
                      <span className="font-black text-white/60">R$ {activeOrder.originalTotal.toFixed(2)}</span>
                    </div>
                    <p className="text-[8.5px] text-[#ffbf50] leading-none mt-1 animate-pulse">
                      * Ajustado devido a divergências de cortes no picking
                    </p>
                  </div>
                )}

                <div className="space-y-1 bg-black/40 p-3 rounded-xl border border-white/5 select-text">
                  <div className="flex justify-between items-center text-[10.5px]">
                    <span className="text-white/30 uppercase font-black">Subtotal Faturado</span>
                    <span className="text-white font-mono">R$ {activeOrder.subtotal.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between items-center text-[10.5px]">
                    <span className="text-white/30 uppercase font-black">Desconto Inicial</span>
                    <span className="text-amber-500 font-mono">- R$ {activeOrder.discount.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between items-center pt-2.5 mt-2.5 border-t border-white/5">
                    <span className="text-[11px] uppercase font-black text-white tracking-[0.2em] font-sans">Total Final</span>
                    <span className="text-xl font-bold font-mono text-[#10b981] leading-none">R$ {activeOrder.total.toFixed(2)}</span>
                  </div>
                  {activeOrder.change > 0 && (
                    <div className="flex justify-between items-center pt-2 mt-1.5 text-[11px] text-amber-500 font-black border-t border-dashed border-white/5">
                      <span>TROCO DO CLIENTE</span>
                      <span className="font-mono bg-amber-500/10 px-1 rounded animate-pulse">R$ {activeOrder.change.toFixed(2)}</span>
                    </div>
                  )}
                </div>

                {activeOrder.payments && activeOrder.payments.length > 0 && (
                  <div className="space-y-1.5 text-[10px] select-text">
                    <span className="text-[8px] uppercase font-black text-white/20 tracking-wider">Canais de Desconto / Pagamento</span>
                    <div className="space-y-1">
                      {activeOrder.payments.map((p, pIdx) => (
                        <div key={pIdx} className="flex justify-between items-center bg-white/[0.01] border border-white/5 p-2 rounded-lg">
                          <span className="font-bold text-white/60 uppercase">{p.methodName}</span>
                          <span className="font-mono font-black text-[#10b981]">R$ {p.amount.toFixed(2)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* STEPPING CONTROL LOGISTICS MILESTONES */}
              <div className="bg-[#0b0e11] border border-white/5 rounded-2xl p-4 flex-1 flex flex-col space-y-4 shadow-md">
                <span className="text-[10px] uppercase font-black text-[#10b981] tracking-[0.2em] flex items-center gap-2">
                  <HistoryIcon className="w-3.5 h-3.5 animate-pulse text-emerald-400" />
                  Milestones & Paridades
                </span>

                {/* Vertical graphical stepper */}
                <div className="space-y-4 overflow-y-auto max-h-[350px] pr-1 custom-scrollbar select-text">
                  {(() => {
                    const combinedEvents = getCombinedTimeline(activeOrder).slice().reverse();
                    
                    const createdTimestamp = activeOrder.timestamp;
                    const createdUser = activeOrder.sellerName || 'Sistema';
                    const createdObs = `Pedido registrado sob o número #${activeOrder.orderNumber}.`;

                    const waitingTimestamp = activeOrder.timestamp;
                    const waitingUser = activeOrder.sellerName || 'Sistema';
                    const waitingObs = `Aguardando triagem de picking e separação.`;

                    const dispatchEvent = combinedEvents.find(e => e.type === 'dispatch' || e.status === 'enviado_separacao' || e.description.toLowerCase().includes('despacho') || e.description.toLowerCase().includes('despachado'));
                    const isDispatched = activeOrder.status !== 'aguardando_separacao' || !!dispatchEvent;
                    const dispatchTimestamp = dispatchEvent?.timestamp || (isDispatched ? activeOrder.deliveryAddedAt || activeOrder.timestamp + 30000 : undefined);
                    const dispatchUser = dispatchEvent?.user || activeOrder.deliveryAddedBy || 'Sistema';
                    const dispatchObs = dispatchEvent?.observation || (isDispatched ? `Pedido despachado para a fila de separação física.` : undefined);

                    const separationStartEvent = combinedEvents.find(e => e.type === 'separation' && (e.description.toLowerCase().includes('iniciou') || e.description.toLowerCase().includes('triagem') || e.description.toLowerCase().includes('iniciada')));
                    const isSeparating = ['em_separacao', 'separado', 'separado_com_faltantes', 'aguardando_embalagem', 'embalando', 'em_rota', 'entregue', 'finalizado'].includes(activeOrder.status) || !!separationStartEvent;
                    const separationStartTimestamp = separationStartEvent?.timestamp || activeOrder.pickStartTime || (isSeparating ? activeOrder.timestamp + 60000 : undefined);
                    const separationStartUser = separationStartEvent?.user || activeOrder.pickerName || 'Sistema';
                    const separationStartObs = separationStartEvent?.observation || (isSeparating ? `Separação iniciada pelo separador.` : undefined);

                    const separationEndEvent = combinedEvents.find(e => e.type === 'separation' && (e.description.toLowerCase().includes('concluída') || e.description.toLowerCase().includes('separado') || e.status === 'separado' || e.status === 'separado_com_faltantes'));
                    const isSeparated = ['separado', 'separado_com_faltantes', 'aguardando_embalagem', 'embalando', 'em_rota', 'entregue', 'finalizado'].includes(activeOrder.status) || !!separationEndEvent;
                    const separationEndTimestamp = separationEndEvent?.timestamp || activeOrder.pickTimestamp || (isSeparated ? activeOrder.timestamp + 120000 : undefined);
                    const separationEndUser = separationEndEvent?.user || activeOrder.pickerName || 'Sistema';
                    let separationEndObs = separationEndEvent?.observation || undefined;
                    if (isSeparated && !separationEndObs) {
                      if (activeOrder.status === 'separado_com_faltantes') {
                        separationEndObs = `Separado com divergência${activeOrder.missingProductsList?.length ? `: ${activeOrder.missingProductsList.length} itens faltantes` : ''}.`;
                      } else {
                        separationEndObs = `Todos os itens conferidos e separados com 100% de precisão.`;
                      }
                    }

                    const packagingEvent = combinedEvents.find(e => e.type === 'packaging' || e.description.toLowerCase().includes('embalar') || e.description.toLowerCase().includes('embalado') || e.description.toLowerCase().includes('embalagem'));
                    const isPacked = ['em_rota', 'entregue', 'finalizado'].includes(activeOrder.status) || !!packagingEvent;
                    const packagingTimestamp = packagingEvent?.timestamp || (isPacked ? activeOrder.pickTimestamp ? activeOrder.pickTimestamp + 60000 : activeOrder.timestamp + 180000 : undefined);
                    const packagingUser = packagingEvent?.user || activeOrder.pickerName || 'Sistema';
                    const packagingObs = packagingEvent?.observation || (isPacked ? `Pedido acondicionado em embalagem: ${activeOrder.packageType || 'Padrão'}.` : undefined);

                    const routeEvent = combinedEvents.find(e => e.status === 'em_rota' || e.description.toLowerCase().includes('rota') || e.description.toLowerCase().includes('trânsito') || e.description.toLowerCase().includes('enviado'));
                    const isInRoute = ['em_rota', 'entregue', 'finalizado'].includes(activeOrder.status) || !!routeEvent;
                    const routeTimestamp = routeEvent?.timestamp || activeOrder.departureTime || (isInRoute ? activeOrder.timestamp + 240000 : undefined);
                    const routeUser = routeEvent?.user || activeOrder.deliveryDriver || 'Sistema';
                    const routeObs = routeEvent?.observation || (isInRoute ? `Saiu para entrega. Entregador: ${activeOrder.deliveryDriver || 'Logística'}.` : undefined);

                    const deliveryEvent = combinedEvents.find(e => e.status === 'entregue' || e.status === 'retirado' || e.description.toLowerCase().includes('entregue') || e.description.toLowerCase().includes('retirado') || e.description.toLowerCase().includes('recebido'));
                    const isDelivered = ['entregue', 'finalizado'].includes(activeOrder.status) || !!deliveryEvent;
                    const deliveryTimestamp = deliveryEvent?.timestamp || activeOrder.deliveryTime || (isDelivered ? activeOrder.timestamp + 300000 : undefined);
                    const deliveryUser = deliveryEvent?.user || 'Logística';
                    const deliveryObs = deliveryEvent?.observation || (isDelivered ? `Entregue com sucesso.` : undefined);

                    const finalizationEvent = combinedEvents.find(e => e.status === 'finalizado' || e.description.toLowerCase().includes('finalizado') || e.description.toLowerCase().includes('concluído'));
                    const isFinished = activeOrder.status === 'finalizado' || !!finalizationEvent;
                    const finalizationTimestamp = finalizationEvent?.timestamp || (isFinished ? activeOrder.timestamp + 360000 : undefined);
                    const finalizationUser = finalizationEvent?.user || 'Sistema';
                    const finalizationObs = finalizationEvent?.observation || (isFinished ? `Pedido finalizado e faturamento arquivado consubstanciado.` : undefined);

                    let currentKey = 1;
                    if (activeOrder.status === 'aguardando_separacao') currentKey = 2;
                    else if (activeOrder.status === 'enviado_separacao') currentKey = 3;
                    else if (activeOrder.status === 'em_separacao') currentKey = 4;
                    else if (['separado', 'separado_com_faltantes'].includes(activeOrder.status)) currentKey = 5;
                    else if (['aguardando_embalagem', 'embalando'].includes(activeOrder.status)) currentKey = 6;
                    else if (activeOrder.status === 'em_rota') currentKey = 7;
                    else if (['entregue', 'retirado'].includes(activeOrder.status)) currentKey = 8;
                    else if (activeOrder.status === 'finalizado') currentKey = 9;

                    const isCupomAvailable = activeOrder.status !== 'aguardando_separacao';

                    const milestonesList = [
                      { key: 1, label: 'Pedido Criado', description: createdObs, user: createdUser, timestamp: createdTimestamp, completed: true, docs: isCupomAvailable ? ['order_ticket'] : [] },
                      { key: 2, label: 'Aguardando Separação', description: waitingObs, user: waitingUser, timestamp: waitingTimestamp, completed: currentKey >= 2, docs: [] },
                      { key: 3, label: 'Despachado', description: dispatchObs, user: dispatchUser, timestamp: dispatchTimestamp, completed: currentKey >= 3 && isDispatched, docs: isCupomAvailable ? ['order_ticket'] : [] },
                      { key: 4, label: 'Em Separação', description: separationStartObs, user: separationStartUser, timestamp: separationStartTimestamp, completed: currentKey >= 4 && isSeparating, docs: [] },
                      { key: 5, label: 'Separado', description: separationEndObs, user: separationEndUser, timestamp: separationEndTimestamp, completed: currentKey >= 5 && isSeparated, docs: ['labels', 'thermal_receipt'] },
                      { key: 6, label: 'Embalado', description: packagingObs, user: packagingUser, timestamp: packagingTimestamp, completed: currentKey >= 6 && isPacked, docs: ['labels'] },
                      { key: 7, label: 'Em Rota', description: routeObs, user: routeUser, timestamp: routeTimestamp, completed: currentKey >= 7 && isInRoute, docs: ['customer_experience'] },
                      { key: 8, label: 'Entregue', description: deliveryObs, user: deliveryUser, timestamp: deliveryTimestamp, completed: currentKey >= 8 && isDelivered, docs: ['customer_experience'] },
                      { key: 9, label: 'Finalizado', description: finalizationObs, user: finalizationUser, timestamp: finalizationTimestamp, completed: currentKey >= 9 && isFinished, docs: ['thermal_receipt'] }
                    ];

                    return (
                      <div className="relative pl-5 ml-1 space-y-4 text-xs font-sans">
                        <div className="absolute left-[5.5px] top-1 bottom-1 w-[1.5px] bg-zinc-800" />
                        <div 
                          className="absolute left-[5.5px] top-1 w-[1.5px] bg-emerald-500 shadow-[0_0_8px_#10b981] transition-all duration-300 pointer-events-none"
                          style={{ 
                            height: `${Math.min(100, Math.max(0, ((currentKey - 1) / 8) * 100))}%`
                          }} 
                        />

                        {milestonesList.map((m) => {
                          const isCurrent = m.key === currentKey && activeOrder.status !== 'cancelado';
                          const isCompleted = m.completed || (m.key < currentKey);
                          const hasTimestamp = isCompleted && m.timestamp;

                          return (
                            <div key={m.key} className="relative transition-all pr-1">
                              <div className={cn(
                                "absolute -left-[22.5px] top-1.5 w-[13px] h-[13px] rounded-full border transition-all flex items-center justify-center z-10",
                                isCurrent 
                                  ? "bg-black border-[#10b981] ring-2 ring-[#10b981]/20 text-[#10b981] scale-110 shadow-[0_0_6px_#10b981]" 
                                  : isCompleted 
                                    ? "bg-[#10b981] border-[#10b981] text-black" 
                                    : "bg-[#07090b] border-zinc-800 text-zinc-650"
                              )}>
                                {isCompleted ? (
                                  <Check className="w-2.5 h-2.5 stroke-[3px]" />
                                ) : (
                                  <div className="w-1.5 h-1.5 rounded-full bg-current" />
                                )}
                              </div>

                              <div className={cn(
                                "p-2.5 rounded-xl border transition-all",
                                isCurrent 
                                  ? "bg-black/40 border-[#10b981]/30 shadow-sm" 
                                  : isCompleted 
                                    ? "bg-white/[0.01] border-white/[0.03] hover:bg-white/[0.02]" 
                                    : "bg-transparent border-transparent opacity-35"
                              )}>
                                <div className="flex items-center justify-between gap-1">
                                  <span className={cn(
                                    "font-bold uppercase text-[9.5px]",
                                    isCurrent ? "text-emerald-400 font-black" : "text-white/80"
                                  )}>
                                    {m.label}
                                  </span>
                                  {hasTimestamp ? (
                                    <span className="text-[8.5px] font-mono text-white/30 font-bold">
                                      {format(m.timestamp!, "dd/MM HH:mm")}
                                    </span>
                                  ) : (
                                    <span className="text-[8.5px] font-mono text-white/10 italic">Aguardando</span>
                                  )}
                                </div>
                                
                                {isCompleted && (
                                  <div className="mt-1 text-[9.5px] text-white/50 leading-relaxed font-sans">
                                    <p>{m.description}</p>
                                    <p className="text-[7.5px] text-white/35 font-mono uppercase mt-0.5">Operador: {m.user || 'Sistema'}</p>
                                  </div>
                                )}

                                {/* Inline printed documents triggers - ENABLED */}
                                {m.docs && m.docs.length > 0 && isCompleted && (
                                  <div className="mt-2 pt-1.5 border-t border-white/[0.03] flex items-center justify-between gap-1">
                                    <span className="text-[7.5px] text-white/30 uppercase font-bold tracking-wider">Documento:</span>
                                    <div className="flex gap-1.5">
                                      {m.docs.map(docId => {
                                        const printTrigger = () => {
                                          if (docId === 'order_ticket') handlePrintCupom(activeOrder);
                                          if (docId === 'labels') handlePrintOrderLabelsInternal(activeOrder);
                                          if (docId === 'thermal_receipt') handlePrintReceipt(activeOrder);
                                        };
                                        const pdfTrigger = () => {
                                          if (docId === 'order_ticket') handleDownloadCupomPdf(activeOrder);
                                          if (docId === 'labels') handleDownloadOrderLabelsPdfInternal(activeOrder);
                                          if (docId === 'customer_experience') handleDownloadExperiencePdfInternal(activeOrder);
                                          if (docId === 'thermal_receipt') handleGeneratePdfReceipt(activeOrder);
                                        };

                                        return (
                                          <div key={docId} className="flex items-center gap-1 bg-white/5 border border-white/10 rounded px-1.5 py-0.5 font-sans">
                                            <span className="text-[7.5px] text-white/50 font-black uppercase tracking-wide">
                                              {docId === 'order_ticket' ? 'Cupom' : docId === 'labels' ? 'Etiquetas' : docId === 'customer_experience' ? 'Mimo' : 'Recibo'}
                                            </span>
                                            <button
                                              onClick={pdfTrigger}
                                              disabled={isGeneratingPdf || isPrinting}
                                              className="p-0.5 hover:bg-white/10 text-white/45 hover:text-cyan-400 rounded transition-all cursor-pointer"
                                              title="Download PDF"
                                              type="button"
                                            >
                                              <FileDown className="w-2.5 h-2.5" />
                                            </button>
                                            {docId !== 'customer_experience' && (
                                              <button
                                                onClick={printTrigger}
                                                disabled={isGeneratingPdf || isPrinting}
                                                className="p-0.5 hover:bg-white/10 text-white/45 hover:text-emerald-400 rounded transition-all cursor-pointer"
                                                title="Imprimir"
                                                type="button"
                                              >
                                                <Printer className="w-2.5 h-2.5" />
                                              </button>
                                            )}
                                          </div>
                                        );
                                      })}
                                    </div>
                                  </div>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    );
                  })()}
                </div>
              </div>

              {/* ACTION EXECUTION HUB CONTROL BAR */}
              <div className="p-4 bg-[#0a0f12] border border-white/5 rounded-2xl space-y-2 mt-auto shadow-inner">
                <div className="flex gap-2">
                  <button 
                    onClick={() => {
                      handleCancelOrder(activeOrder.id);
                      onClose();
                    }}
                    disabled={activeOrder.status === 'cancelado' || activeOrder.status === 'finalizado' || activeOrder.status === 'entregue'}
                    className="flex-1 py-2.5 px-3 border border-red-500/20 hover:border-red-500 text-red-500 hover:text-white rounded-xl text-[9px] uppercase font-black tracking-widest transition-all disabled:opacity-20 text-center cursor-pointer font-sans"
                    type="button"
                  >
                    Cancelar Pedido
                  </button>

                  {REVERT_STATUS_MAP[activeOrder.status] && (
                    <button 
                      onClick={() => handleRevertStatus(activeOrder)}
                      className="flex-1 py-1.5 px-3 border border-amber-500/20 text-amber-500 hover:bg-amber-500 hover:text-black rounded-xl text-[9px] uppercase font-black tracking-widest transition-all flex items-center justify-center gap-1 text-center cursor-pointer font-sans"
                      type="button"
                    >
                      <RotateCcw className="w-3 h-3" /> Voltar Status
                    </button>
                  )}
                </div>

                {/* Primary contextual trigger button */}
                <div className="pt-2 border-t border-white/5 text-center">
                  {activeOrder.status === 'aguardando_separacao' ? (
                    <button 
                      onClick={() => {
                        handleInitiateDispatch(activeOrder.id);
                        onClose();
                      }}
                      disabled={isDispatching}
                      className={`w-full py-3 text-white rounded-xl text-[10px] font-black uppercase tracking-widest transition-all shadow-lg text-center font-sans ${
                        isDispatching ? 'bg-emerald-800 opacity-50 cursor-not-allowed' : 'bg-emerald-600 hover:bg-emerald-500 cursor-pointer'
                      }`}
                      type="button"
                    >
                      {isDispatching ? 'Despachando...' : 'Despachar Pedido WMS'}
                    </button>
                  ) : activeOrder.status === 'enviado_separacao' ? (
                    <button 
                      onClick={() => {
                        updateSaleStatus(activeOrder.id, 'em_separacao', currentUser?.fullName || 'Administrador', `Separação iniciada manualmente.`);
                        onClose();
                      }}
                      className="w-full py-3 bg-purple-600 hover:bg-purple-505 text-white rounded-xl text-[10px] font-black uppercase tracking-widest transition-all shadow-lg flex items-center justify-center gap-2 cursor-pointer font-sans"
                      type="button"
                    >
                      <Package className="w-4 h-4 text-white" /> Iniciar Separação
                    </button>
                  ) : activeOrder.status === 'em_separacao' ? (
                    <button 
                      onClick={() => {
                        const updatedItems = activeOrder.items.map(item => ({ ...item, pickedQuantity: item.quantity }));
                        useStore.setState(state => ({
                          sales: state.sales.map(s => s.id === activeOrder.id ? { ...s, items: updatedItems } : s)
                        }));
                        updateSaleStatus(activeOrder.id, 'separado', currentUser?.fullName || 'Administrador', `Separação concluída manualmente.`);
                        onClose();
                      }}
                      className="w-full py-3 bg-[#13c985] hover:bg-[#13c985]/90 text-black rounded-xl text-[10px] font-black uppercase tracking-widest transition-all shadow-lg flex items-center justify-center gap-2 cursor-pointer font-sans"
                      type="button"
                    >
                      <CheckCircle2 className="w-4 h-4" /> Concluir Separação
                    </button>
                  ) : activeOrder.status === 'separado' ? (
                    <button 
                      onClick={() => {
                        setPackagingOrder(activeOrder);
                        setIsPackagingConferenceModalOpen(true);
                      }}
                      className="w-full py-3 bg-orange-600 hover:bg-orange-500 text-white rounded-xl text-[10px] font-black uppercase tracking-widest transition-all shadow-lg flex items-center justify-center gap-2 cursor-pointer font-sans"
                      type="button"
                    >
                      <Package className="w-4 h-4 text-white" /> Enviar para Embalar WMS
                    </button>
                  ) : (
                    <button 
                      onClick={() => {
                        setDeliveryOrder(activeOrder);
                        setIsDeliveryModalOpen(true);
                      }}
                      className="w-full py-3 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-[10px] font-black uppercase tracking-widest transition-all shadow-lg flex items-center justify-center gap-2 cursor-pointer font-sans"
                      type="button"
                    >
                      <Truck className="w-4 h-4 text-white" /> Registrar Rota / Entrega
                    </button>
                  )}
                </div>
              </div>

            </div>

          </div>

          {/* MOBILE CONTENT - ACCORDIONS AND TAB MODULES */}
          <div className="lg:hidden h-full flex flex-col overflow-y-auto pb-16 custom-scrollbar space-y-4 pr-1">
            
            {activeDetailsTab === 'summary' && (
              <div className="space-y-4">
                {/* Status pulse label selector */}
                <div className="flex items-center justify-between p-3.5 bg-[#0d1216] border border-white/5 rounded-2xl select-none">
                  <div>
                    <span className="text-[7px] uppercase font-black text-white/35 block mb-1">Status</span>
                    <span className={cn(
                      "px-2 py-0.5 rounded text-[9px] font-black uppercase tracking-wider",
                      getStatusInfo(activeOrder.status).color
                    )}>
                      {getStatusLabel(activeOrder.status)}
                    </span>
                  </div>
                  <div className="text-right">
                    <span className="text-[7px] text-white/35 block mb-1 uppercase font-black font-mono">Faturamento</span>
                    <p className="text-xs font-bold text-emerald-400 font-mono">R$ {activeOrder.total.toFixed(2)}</p>
                  </div>
                </div>

                {/* Consumer and dispatcher records card */}
                <div className="bg-[#0b0e11] border border-white/5 rounded-2xl p-3.5 space-y-2.5">
                  <span className="text-[8px] uppercase font-black text-white/20 tracking-wider block font-sans select-none">Contato do Cliente</span>
                  <div className="select-text">
                    <p className="text-[11px] font-bold text-white">{getClientName(activeOrder.clientId)}</p>
                    <p className="text-[10px] font-mono text-white/45 mt-0.5">{activeOrder.clientPhone || 'Sem telefone registrado'}</p>
                  </div>
                  {activeOrder.deliveryMethodName && (
                    <div className="pt-2 border-t border-white/5 select-text">
                      <span className="text-[7px] uppercase font-black text-white/20 tracking-wider block mb-1 font-sans">Despacho</span>
                      <p className="text-[10px] text-blue-400 uppercase font-black leading-none">{activeOrder.deliveryMethodName}</p>
                      {activeOrder.trackingCode && <p className="text-[9px] text-white/40 font-mono mt-1 select-all">Rastreio: {activeOrder.trackingCode}</p>}
                    </div>
                  )}
                </div>

                {/* Mobile editable notes fields and saves */}
                <div className="bg-[#0b0e11] border border-white/5 rounded-2xl p-3.5 space-y-3 shadow-md">
                  <div className="flex items-center justify-between border-b border-white/5 pb-1.5 select-none">
                    <span className="text-[8px] font-black uppercase text-white/25">Anotações</span>
                    <button
                      onClick={handleSaveAllNotes}
                      disabled={savingNotes}
                      className="px-2.5 py-1 bg-indigo-600 text-[8px] text-white rounded font-bold uppercase tracking-wider cursor-pointer font-sans"
                      type="button"
                    >
                      {savingNotes ? 'Salvando...' : notesSavedSuccess ? 'Salvo' : 'Salvar'}
                    </button>
                  </div>
                  <div className="space-y-2">
                    <div className="space-y-0.5">
                      <span className="text-[7px] text-white/35 uppercase font-black block select-none">Observações PDV</span>
                      <textarea
                        value={tempNotes || ''}
                        onChange={(e) => setTempNotes(e.target.value)}
                        rows={1}
                        placeholder="Observações do cliente..."
                        className="w-full text-[10px] bg-black/45 border border-white/5 rounded p-1.5 text-white"
                      />
                    </div>
                    <div className="space-y-0.5">
                      <span className="text-[7px] text-white/35 uppercase font-black block select-none">Separação WMS</span>
                      <textarea
                        value={tempPickerNotes || ''}
                        onChange={(e) => setTempPickerNotes(e.target.value)}
                        rows={1}
                        placeholder="Feedbacks do físico..."
                        className="w-full text-[10px] bg-black/45 border border-white/5 rounded p-1.5 text-white"
                      />
                    </div>
                  </div>
                </div>

                {/* Ledger summary */}
                <div className="bg-[#0b0e11] border border-white/5 rounded-2xl p-3.5 space-y-2 select-text">
                  <span className="text-[8px] font-black uppercase text-white/25 tracking-widest block border-b border-white/5 pb-1 select-none">Ledger Financeiro</span>
                  <div className="text-[10px] space-y-1">
                    <div className="flex justify-between items-center text-white/50">
                      <span>Subtotal</span>
                      <span>R$ {activeOrder.subtotal.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between items-center text-amber-500">
                      <span>Descontos</span>
                      <span>- R$ {activeOrder.discount.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between items-center text-emerald-400 font-bold border-t border-white/5 pt-1 mt-1 text-[11px]">
                      <span>Final faturado</span>
                      <span>R$ {activeOrder.total.toFixed(2)}</span>
                    </div>
                  </div>
                </div>

                {/* Contextual control triggers */}
                <div className="p-3 bg-[#0a0f12] border border-white/10 rounded-xl space-y-2 select-none">
                  {activeOrder.status === 'aguardando_separacao' ? (
                    <button 
                      onClick={() => {
                        handleInitiateDispatch(activeOrder.id);
                        onClose();
                      }}
                      disabled={isDispatching}
                      className={`w-full py-3 text-white rounded-lg text-[10px] font-black uppercase tracking-widest text-center font-sans ${
                        isDispatching ? 'bg-emerald-800 opacity-50 cursor-not-allowed' : 'bg-emerald-600 cursor-pointer'
                      }`}
                      type="button"
                    >
                      {isDispatching ? 'Despachando...' : 'Despachar Pedido'}
                    </button>
                  ) : activeOrder.status === 'enviado_separacao' ? (
                    <button 
                      onClick={() => {
                        updateSaleStatus(activeOrder.id, 'em_separacao', currentUser?.fullName || 'Administrador', `Separação iniciada manualmente.`);
                        onClose();
                      }}
                      className="w-full py-3 bg-purple-600 text-white rounded-lg text-[10px] font-black uppercase tracking-widest text-center cursor-pointer font-sans"
                      type="button"
                    >
                      Iniciar Separação
                    </button>
                  ) : activeOrder.status === 'em_separacao' ? (
                    <button 
                      onClick={() => {
                        const updatedItems = activeOrder.items.map(item => ({ ...item, pickedQuantity: item.quantity }));
                        useStore.setState(state => ({
                          sales: state.sales.map(s => s.id === activeOrder.id ? { ...s, items: updatedItems } : s)
                        }));
                        updateSaleStatus(activeOrder.id, 'separado', currentUser?.fullName || 'Administrador', `Separação concluída manualmente.`);
                        onClose();
                      }}
                      className="w-full py-3 bg-[#13c985] text-black rounded-lg text-[10px] font-black uppercase tracking-widest text-center cursor-pointer font-sans"
                      type="button"
                    >
                      Concluir Separação
                    </button>
                  ) : activeOrder.status === 'separado' ? (
                    <button 
                      onClick={() => {
                        setPackagingOrder(activeOrder);
                        setIsPackagingConferenceModalOpen(true);
                      }}
                      className="w-full py-3 bg-orange-600 text-white rounded-lg text-[10px] font-black uppercase tracking-widest flex items-center justify-center gap-2 cursor-pointer font-sans"
                      type="button"
                    >
                      <Package className="w-3.5 h-3.5" /> Enviar para Embalar
                    </button>
                  ) : (
                    <button 
                      onClick={() => {
                        setDeliveryOrder(activeOrder);
                        setIsDeliveryModalOpen(true);
                      }}
                      className="w-full py-3 bg-blue-600 text-white rounded-lg text-[10px] font-black uppercase tracking-widest flex items-center justify-center gap-2 cursor-pointer font-sans"
                      type="button"
                    >
                      <Truck className="w-3.5 h-3.5" /> Entrega
                    </button>
                  )}

                  <div className="grid grid-cols-2 gap-1.5 pt-1.5 border-t border-white/5">
                    <button
                      onClick={() => {
                        handleCancelOrder(activeOrder.id);
                        onClose();
                      }}
                      disabled={activeOrder.status === 'cancelado' || activeOrder.status === 'finalizado' || activeOrder.status === 'entregue'}
                      className="py-2 px-1 text-center font-bold text-red-500 border border-red-500/15 rounded text-[8.5px] uppercase cursor-pointer"
                      type="button"
                    >
                      Cancelar
                    </button>
                    {REVERT_STATUS_MAP[activeOrder.status] && (
                      <button
                        onClick={() => handleRevertStatus(activeOrder)}
                        className="py-2 px-1 text-center font-bold text-amber-500 border border-amber-500/15 rounded text-[8.5px] uppercase cursor-pointer"
                        type="button"
                      >
                        Voltar
                      </button>
                    )}
                  </div>
                </div>

              </div>
            )}

            {activeDetailsTab === 'products' && (
              <div className="space-y-4 select-text">
                {/* Lack warnings block if applicable */}
                {(activeOrder.status === 'separado_com_faltantes' || (activeOrder.missingProductsList && activeOrder.missingProductsList.length > 0)) && (
                  <div className="p-3 bg-amber-500/5 border border-amber-500/15 rounded-xl text-[10px] text-amber-300 leading-normal flex gap-2">
                    <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-amber-400" />
                    <div>
                      <span className="font-bold block uppercase text-[10px] leading-none mb-1">Divergências de Separação em Estoque</span>
                      Há itens faltantes detectados durante a triagem inicial do picking físico.
                    </div>
                  </div>
                )}

                <div className="space-y-2">
                  {activeOrder.items.map((item, idx) => {
                    const isSeparated = canShowReceipt(activeOrder.status);
                    const pickedQty = item.pickedQuantity !== undefined ? item.pickedQuantity : item.quantity;
                    const missingQty = Math.max(0, item.quantity - pickedQty);

                    return (
                      <div key={idx} className="p-3 bg-black/40 border border-white/5 rounded-xl text-[11px] leading-relaxed space-y-1">
                        <div className="flex justify-between items-start gap-2">
                          <span className="font-bold text-white truncate max-w-[200px]">{item.name}</span>
                          <span className="font-mono text-white/30 text-[9px]">{item.code}</span>
                        </div>
                        <div className="flex justify-between items-center text-white/60">
                          <span>Quantidades faturadas:</span>
                          <span className="font-bold text-white">
                            {isSeparated ? `${pickedQty} de {item.quantity}x` : `${item.quantity}x`}
                          </span>
                        </div>
                        {isSeparated && missingQty > 0 && (
                          <div className="flex justify-between items-center text-red-500 select-none">
                            <span>Itens em Falta:</span>
                            <span className="font-extrabold">{missingQty}x</span>
                          </div>
                        )}
                        <div className="flex justify-between items-center text-emerald-400 font-bold font-mono">
                          <span>Subtotal:</span>
                          <span>R$ {(item.price * (isSeparated ? pickedQty : item.quantity)).toFixed(2)}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {activeDetailsTab === 'timeline' && (
              <div className="space-y-4 select-text">
                {(() => {
                  const combinedEvents = getCombinedTimeline(activeOrder).slice().reverse();
                  return (
                    <div className="space-y-3">
                      <span className="text-[8px] uppercase tracking-widest text-[#10b981] font-black block mb-2 select-none">Histórico de Eventos Milestones</span>
                      
                      <div className="space-y-2 text-[10px]">
                        {combinedEvents.map((evt, evtIdx) => (
                          <div key={evtIdx} className="p-2.5 bg-black/45 border border-white/5 rounded-xl space-y-1 hover:border-white/10 transition-all">
                            <div className="flex justify-between items-center gap-1.5 text-white/50">
                              <span className="font-black uppercase tracking-wider text-[8px] text-[#10b981]">{evt.type}</span>
                              <span className="font-mono text-white/30">{format(evt.timestamp, "dd/MM HH:mm")}</span>
                            </div>
                            <p className="text-white/85 leading-snug">{evt.description}</p>
                            {evt.observation && <p className="text-[8.5px] italic text-[#f8fafc]/40">{evt.observation}</p>}
                            <p className="text-[8px] font-mono text-white/20 uppercase">Por: {evt.user || 'Sistema'}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })()}
              </div>
            )}

            {activeDetailsTab === 'audit' && (
              <div className="space-y-2 select-text">
                <span className="text-[8px] font-black uppercase text-white/35 block mb-2 tracking-widest select-none">Logs de Auditoria Security</span>
                {(() => {
                  const orderRefStr = `#${activeOrder.orderNumber}`;
                  const matchedAudits = auditLogs.filter(log => 
                    log.referenceId === activeOrder.id || 
                    log.entityId === activeOrder.id ||
                    log.description.includes(orderRefStr)
                  ).sort((a, b) => b.timestamp - a.timestamp);

                  if (matchedAudits.length === 0) {
                    return <p className="text-[10px] text-white/30 italic text-center p-6">Sem logs para este pedido.</p>;
                  }

                  return matchedAudits.map((log) => (
                    <div key={log.id} className="p-2.5 bg-black/45 rounded-lg text-[9px] border border-white/[0.01]">
                      <div className="flex justify-between items-center font-mono text-white/40 mb-1 select-none">
                        <span className="font-black text-[7px] text-purple-400 bg-purple-400/10 px-1 rounded">{log.module}</span>
                        <span>{format(log.timestamp, "dd/MM HH:mm")}</span>
                      </div>
                      <p className="text-white/70 leading-snug">{log.description}</p>
                      <p className="text-[7.5px] text-white/25 uppercase tracking-widest mt-0.5">Autor: {log.userLogin || 'Sistema'}</p>
                    </div>
                  ));
                })()}
              </div>
            )}

          </div>

        </div>

      </motion.div>
    </div>
  );
};
