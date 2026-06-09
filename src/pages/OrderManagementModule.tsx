import { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { QRCodeSVG } from 'qrcode.react';
import { Html5QrcodeScanner } from 'html5-qrcode';
import { 
  Search, 
  Filter, 
  Eye, 
  Truck, 
  XCircle, 
  CheckCircle2, 
  Clock, 
  Package, 
  ChevronRight,
  ClipboardList,
  AlertCircle,
  Layout,
  FileDown,
  QrCode,
  User,
  History as HistoryIcon,
  RotateCcw,
  X,
  ExternalLink,
  Sparkles,
  ArrowLeft,
  Home,
  Inbox,
  CheckCircle,
  PackageCheck,
  Archive,
  Menu,
  Settings,
  Printer,
  Tv,
  Activity,
  PackageSearch,
  HeartHandshake,
  Copy,
  Edit2,
  Check
} from 'lucide-react';
import { cn, extractOrderNumberFromScan } from '../lib/utils';
import { useStore, Sale, CartItem, OrderTicketConfig } from '../store';
import { generateCanonicalPdfBlob, downloadOrSharePdf } from '../services/pdfEngine/pdfGenerator';
import React from 'react';
import ReactDOMServer from 'react-dom/server';
import { operationalValidationService } from '../services/operationalValidationService';
import { useNavigate, useLocation } from 'react-router-dom';
import MasterPasswordModal from '../components/MasterPasswordModal';
import { OrderPanel } from '../components/OrderPanel';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import QRScanner from '../components/QRScanner';

export default function OrderManagementModule() {
  const navigate = useNavigate();
  const sales = useStore(state => state.sales);
  const updateSaleStatus = useStore(state => state.updateSaleStatus);
  const updateSale = useStore(state => state.updateSale);
  const checkPermission = useStore(state => state.checkPermission);
  const clients = useStore(state => state.clients);
  const receiptConfig = useStore(state => state.receiptConfig);
  const orderTicketConfig = useStore(state => state.orderTicketConfig);
  const labelConfig = useStore(state => state.labelConfig);
  const customerExperienceConfig = useStore(state => state.customerExperienceConfig);
  const deliveryMethods = useStore(state => state.deliveryMethods);
  const currentUser = useStore(state => state.currentUser);
  const addActivity = useStore(state => state.addActivity);

  const [searchTerm, setSearchTerm] = useState('');
  const auditLogs = useStore(state => state.auditLogs);
  const adminFullName = useStore(state => (state.users || []).find(u => u.id === 'admin')?.fullName || 'Administrador');

  const [selectedStatus, setSelectedStatus] = useState<string>('aguardando_separacao');
  const [selectedOrder, setSelectedOrder] = useState<Sale | null>(null);
  const [activeDetailsTab, setActiveDetailsTab] = useState<'summary' | 'products' | 'timeline' | 'audit'>('summary');
  const [tempNotes, setTempNotes] = useState('');
  const [tempInternalNotes, setTempInternalNotes] = useState('');
  const [tempPickerNotes, setTempPickerNotes] = useState('');
  const [tempDeliveryNotes, setTempDeliveryNotes] = useState('');
  const [savingNotes, setSavingNotes] = useState(false);
  const [notesSavedSuccess, setNotesSavedSuccess] = useState(false);

  const location = useLocation();

  useEffect(() => {
    if (location.state?.orderId) {
      const sale = sales.find(s => s.id === location.state.orderId);
      if (sale) {
        setSelectedOrder(sale);
        setSelectedStatus(sale.status);
      }
    }
  }, [location.state?.orderId, sales]);

  useEffect(() => {
    if (selectedOrder) {
      setActiveDetailsTab('summary');
      setTempNotes(selectedOrder.notes || '');
      setTempInternalNotes((selectedOrder as any).internalNotes || '');
      setTempPickerNotes((selectedOrder as any).pickerNotes || '');
      setTempDeliveryNotes(selectedOrder.deliveryNotes || '');
    }
  }, [selectedOrder?.id]);
  const [isSearchModalOpen, setIsSearchModalOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResult, setSearchResult] = useState<Sale | null>(null);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [showQRScanner, setShowQRScanner] = useState(false);
  const [showPickingTicket, setShowPickingTicket] = useState(false);
  const scannerRef = useRef<Html5QrcodeScanner | null>(null);

  const activeOrder = useMemo(() => {
    if (!selectedOrder) return null;
    return sales.find(s => s.id === selectedOrder.id) || selectedOrder;
  }, [sales, selectedOrder]);

  const navigationHistory = useStore(state => state.navigationHistory);
  const showBackButton = navigationHistory.length > 2 || selectedOrder !== null;

  const openSearch = () => {
    setIsSearchModalOpen(true);
    setSearchQuery('');
    setSearchResult(null);
    setSearchError(null);
    setShowQRScanner(false);
  };

  // Listen for global search button event
  useEffect(() => {
    const handleOpenSearch = () => {
      openSearch();
    };

    window.addEventListener('open-order-search', handleOpenSearch);
    return () => window.removeEventListener('open-order-search', handleOpenSearch);
  }, []);

  // QR Scanner handled by component

  function onScanSuccess(decodedText: string) {
    const searchVal = extractOrderNumberFromScan(decodedText);
    
    if (searchVal) {
      setSearchQuery(searchVal);
      handleConsultOrder(searchVal);
      setShowQRScanner(false);
    } else {
      setSearchError("QR Code inválido. Não foi possível identificar o número do pedido.");
    }
  }

  function onScanFailure(error: any) {
    // silently fail
  }
  const [showReceipt, setShowReceipt] = useState(false);
  const [lastDispatchedOrder, setLastDispatchedOrder] = useState<Sale | null>(null);
  const [isMasterPasswordModalOpen, setIsMasterPasswordModalOpen] = useState(false);
  const [orderToCancel, setOrderToCancel] = useState<string | null>(null);
  const [orderToRevert, setOrderToRevert] = useState<Sale | null>(null);
  const [isDeliveryModalOpen, setIsDeliveryModalOpen] = useState(false);
  const [deliveryOrder, setDeliveryOrder] = useState<Sale | null>(null);
  const [isPackagingConferenceModalOpen, setIsPackagingConferenceModalOpen] = useState(false);
  const [packagingOrder, setPackagingOrder] = useState<Sale | null>(null);
  const [isDispatchingOrderIds, setIsDispatchingOrderIds] = useState<Set<string>>(new Set());

  const [currentTime, setCurrentTime] = useState(new Date().toLocaleTimeString('pt-BR'));
  useEffect(() => {
    const timer = setInterval(() => {
      if (typeof document !== 'undefined' && document.hidden) return;
      setCurrentTime(new Date().toLocaleTimeString('pt-BR'));
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 20;

  const statuses = [
    { id: 'aguardando_separacao', label: 'Aguardando Sep.', color: 'bg-amber-500/10 text-amber-500' },
    { id: 'enviado_separacao', label: 'Enviado p/ Sep.', color: 'bg-blue-500/10 text-blue-400' },
    { id: 'em_separacao', label: 'Em Separação', color: 'bg-purple-500/10 text-purple-400' },
    { id: 'separado', label: 'Separado', color: 'bg-emerald-500/10 text-emerald-400' },
    { id: 'embalando', label: 'Embalado', color: 'bg-pink-500/10 text-pink-400' },
    { id: 'em_rota', label: 'Em Rota', color: 'bg-blue-500/10 text-blue-400' },
    { id: 'entregue', label: 'Entregue', color: 'bg-emerald-600/20 text-emerald-500' },
  ];

  const operationalStatuses = [
    'aguardando_separacao', 
    'enviado_separacao', 
    'em_separacao', 
    'separado', 
    'embalando', 
    'em_rota', 
    'entregue'
  ];

  const [filterMode, setFilterMode] = useState<'all' | 'stagnant' | 'priority'>('all');

  const STATUS_THRESHOLDS: Record<string, number> = useMemo(() => ({
    aguardando_separacao: 15 * 60000,
    enviado_separacao: 15 * 60000,
    em_separacao: 20 * 60000,
    separado: 10 * 60000,
    embalando: 10 * 60000,
    em_rota: 60 * 60000,
  }), []);

  const getTimeStopped = useCallback((sale: Sale) => {
    const matchingEvent = sale.timelineEvents
      ?.filter(e => e.status === sale.status)
      .sort((a, b) => b.timestamp - a.timestamp)[0];
    const refTime = matchingEvent ? matchingEvent.timestamp : sale.timestamp;
    return Date.now() - refTime;
  }, []);

  const getOrderPriority = useCallback((sale: Sale, elapsed: number) => {
    const threshold = STATUS_THRESHOLDS[sale.status] || 15 * 60000;
    const isStagnant = elapsed > threshold;
    const totalItems = sale.items.reduce((acc, i) => acc + i.quantity, 0);
    
    if (isStagnant) return { label: 'CRÍTICA (Atrasado)', color: 'text-red-500 bg-red-500/10 border-red-500/20 shadow-[0_0_10px_rgba(239,68,68,0.1)]', level: 'high' };
    if (totalItems >= 15) return { label: 'ALTA (Muitos Itens)', color: 'text-amber-500 bg-amber-500/10 border-amber-500/20', level: 'medium' };
    return { label: 'NORMAL', color: 'text-zinc-500 bg-zinc-800/40 border-zinc-75/10', level: 'normal' };
  }, [STATUS_THRESHOLDS]);

  const getNextStepStatus = useCallback((order: Sale) => {
    switch (order.status) {
      case 'aguardando_separacao':
        return { msg: 'Pronto para Despachar', isReady: true, sub: 'Fila de Separação' };
      case 'enviado_separacao':
        return { msg: 'Aguardando BIP', isReady: false, sub: 'Na Fila da Separação' };
      case 'em_separacao':
        return { msg: 'Separando...', isReady: false, sub: 'Aguardando Conclusão' };
      case 'separado':
      case 'separado_com_faltantes':
        return { msg: 'Pronto para Embalar', isReady: true, sub: 'Aguardando Conferência' };
      case 'embalando':
        return { msg: 'Pronto para Entrega', isReady: true, sub: 'Aguardando Despacho' };
      case 'em_rota':
        return { msg: 'Em Rota de Entrega', isReady: true, sub: 'Pendente de Confirmação' };
      case 'entregue':
      case 'finalizado':
        return { msg: 'Entregue / Concluído', isReady: false, sub: 'Arquivado' };
      default:
        return { msg: 'Status Desconhecido', isReady: false, sub: '--' };
    }
  }, []);

  const formatElapsedTime = useCallback((ms: number) => {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (days > 0) return `${days}d ${hours % 24}h`;
    if (hours > 0) return `${hours}h ${minutes % 60}m`;
    if (minutes > 0) return `${minutes}m`;
    if (seconds > 0) return `${seconds}s`;
    return '0s';
  }, []);

  const stats = useMemo(() => {
    const active = sales.filter(s => operationalStatuses.includes(s.status));
    
    // Stagnant calc
    let stagnant = 0;
    active.forEach(sale => {
      const elapsed = getTimeStopped(sale);
      const threshold = STATUS_THRESHOLDS[sale.status] || 15 * 60000;
      if (elapsed > threshold) stagnant++;
    });
    
    const countByStatus = (statusId: string) => sales.filter(s => s.status === statusId || (statusId === 'entregue' && s.status === 'finalizado')).length;
    
    return {
      totalActive: active.length,
      stagnant,
      avgItems: active.length 
        ? (active.reduce((acc, s) => acc + s.items.reduce((sum, i) => sum + i.quantity, 0), 0) / active.length).toFixed(1)
        : '0.0',
      avgTimeInStageMinutes: '12m',
      waitingSeparation: countByStatus('aguardando_separacao'),
      sentSeparation: countByStatus('enviado_separacao'),
      inSeparation: countByStatus('em_separacao'),
      separated: countByStatus('separado'),
      packing: countByStatus('aguardando_embalagem') + countByStatus('embalando'),
      inRoute: countByStatus('em_rota'),
      delivered: countByStatus('entregue') + countByStatus('finalizado'),
    };
  }, [sales, operationalStatuses, STATUS_THRESHOLDS, getTimeStopped]);

  const [copiedOrderId, setCopiedOrderId] = useState<string | null>(null);
  const copyToClipboard = useCallback((text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedOrderId(id);
    setTimeout(() => setCopiedOrderId(null), 2000);
  }, []);

  // Search Logic
  const handleConsultOrder = (query: string = searchQuery) => {
    const searchVal = extractOrderNumberFromScan(query);

    if (!searchVal) {
      setSearchError('Digite ou escaneie o número do pedido.');
      return;
    }

    const order = sales.find(s => 
      String(s.orderNumber) === String(searchVal) || 
      String(s.id) === String(searchVal)
    );

    if (order) {
      setSearchResult(order);
      setSearchError(null);
    } else {
      setSearchResult(null);
      setSearchError('Pedido não encontrado.');
    }
  };

  const filteredOrders = useMemo(() => {
    return sales.filter(sale => {
      const isOperational = operationalStatuses.includes(sale.status);
      if (!isOperational) return false;

      // Status tab match (grouping delivered/finalized in the 'entregue' tab)
      const matchesStatus = sale.status === selectedStatus || (selectedStatus === 'entregue' && sale.status === 'finalizado');
      if (!matchesStatus) return false;

      const cName = getClientName(sale.clientId);
      const matchesSearch = !searchTerm || 
        String(sale.orderNumber).toLowerCase().includes(searchTerm.toLowerCase()) || 
        cName.toLowerCase().includes(searchTerm.toLowerCase()) ||
        String(sale.id).toLowerCase().includes(searchTerm.toLowerCase()) ||
        (sale.pickerName && sale.pickerName.toLowerCase().includes(searchTerm.toLowerCase()));

      if (!matchesSearch) return false;

      // Stats Stagnation check
      const elapsed = getTimeStopped(sale);
      const threshold = STATUS_THRESHOLDS[sale.status] || 15 * 60000;
      const isStagnant = elapsed > threshold;

      if (filterMode === 'stagnant') {
        return isStagnant;
      }
      if (filterMode === 'priority') {
        const totalItems = sale.items.reduce((acc, i) => acc + i.quantity, 0);
        return isStagnant || totalItems >= 15;
      }

      return true;
    });
  }, [sales, selectedStatus, searchTerm, filterMode, getClientName, getTimeStopped, STATUS_THRESHOLDS, operationalStatuses]);

  const pagedOrders = useMemo(() => {
    return filteredOrders.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);
  }, [filteredOrders, currentPage]);

  const totalPages = Math.ceil(filteredOrders.length / itemsPerPage);

  const renderOrderCard = useCallback((order: Sale, isMobile: boolean) => {
    const elapsed = getTimeStopped(order);
    const threshold = STATUS_THRESHOLDS[order.status] || 15 * 60000;
    const isStagnant = elapsed > threshold;
    const totalItems = order.items.reduce((acc, i) => acc + i.quantity, 0);
    const priority = getOrderPriority(order, elapsed);
    const nextStep = getNextStepStatus(order);

    const totalRequested = order.items.reduce((acc, i) => acc + i.quantity, 0);
    const totalPicked = order.items.reduce((acc, i) => acc + (i.pickedQuantity !== undefined ? i.pickedQuantity : 0), 0);
    const pickingPct = totalRequested > 0 ? Math.round((totalPicked / totalRequested) * 100) : 0;

    if (isMobile) {
      return (
        <div 
          key={order.id}
          className={cn(
            "bg-[#0a0f14] border rounded-lg p-2 flex flex-col gap-1.5 transition-all relative overflow-hidden shrink-0",
            isStagnant ? "border-red-500/35 bg-red-950/5" : "border-white/5 bg-[#0e131a]"
          )}
        >
          {/* Priority indicator bar */}
          <div className={cn(
            "absolute left-0 top-0 bottom-0 w-1",
            priority.level === 'high' ? "bg-red-500" :
            priority.level === 'medium' ? "bg-amber-500" : "bg-zinc-800"
          )} />

          {/* Top Row: #Number - Time (compact) */}
          <div className="flex items-center justify-between gap-1 pl-1.5">
            <div className="flex items-center gap-1 min-w-0">
              <span className="text-[11px] font-black font-sans text-white uppercase tracking-tight">
                #{order.orderNumber}
              </span>
              <button 
                onClick={() => copyToClipboard(order.orderNumber, order.id)}
                className="text-zinc-500 hover:text-white"
                title="Copiar Código"
              >
                {copiedOrderId === order.id ? (
                  <Check className="w-2.5 h-2.5 text-emerald-400" />
                ) : (
                  <Copy className="w-2.5 h-2.5" />
                )}
              </button>
            </div>
            
            <div className="flex items-center gap-1.5 shrink-0">
              <span className={cn("text-[7px] font-extrabold uppercase tracking-wide px-1 py-0.5 rounded leading-none border border-current", priority.color)}>
                {priority.label}
              </span>
              <div className="flex items-center gap-0.5 text-zinc-400 font-mono text-[9px] leading-none font-bold">
                <Clock className="w-2.5 h-2.5 text-zinc-500" />
                <span>{formatElapsedTime(elapsed)}</span>
              </div>
            </div>
          </div>

          {/* Middle Row: Client Name */}
          <div className="pl-1.5 flex items-baseline justify-between gap-2.5">
            <div className="min-w-0 flex-1">
              <span className="text-[11px] font-black text-white/95 truncate block uppercase">
                {getClientName(order.clientId) || order.clientName || 'Consumidor Final'}
              </span>
            </div>
            <div className="shrink-0 text-right">
              <span className="text-[9px] font-mono text-zinc-300 font-black">{totalItems} un</span>
            </div>
          </div>

          {/* Details list of Status and Operator */}
          <div className="pl-1.5 grid grid-cols-2 gap-1 py-1 border-t border-white/5">
            <div className="flex items-center gap-1">
              <span className={cn(
                "w-1.5 h-1.5 rounded-full inline-block shrink-0",
                order.status === 'aguardando_separacao' ? 'bg-amber-500 animate-pulse' :
                order.status === 'enviado_separacao' ? 'bg-blue-400' :
                order.status === 'em_separacao' ? 'bg-purple-400 animate-pulse' :
                order.status === 'separado' ? 'bg-emerald-400' : 'bg-pink-400'
              )} />
              <span className="text-[8px] font-bold text-zinc-300 uppercase tracking-wide truncate">
                {order.status.replace('_', ' ')}
              </span>
            </div>

            <div className="flex items-center gap-0.5 truncate justify-end">
              <User className="w-2.5 h-2.5 text-zinc-500 shrink-0" />
              <span className="text-[8px] font-semibold text-zinc-400 uppercase tracking-tight truncate max-w-[80px]">
                {order.pickerName ? order.pickerName.split(' ')[0] : 'Sem op.'}
              </span>
            </div>
          </div>

          {/* Progress bar for picking status */}
          {order.status === 'em_separacao' && (
            <div className="space-y-0.5 pt-0.5 pl-1.5">
              <div className="flex justify-between items-center text-[7.5px] uppercase font-bold text-zinc-500 font-mono">
                <span>Progresso picking</span>
                <span className="text-purple-400 font-black">{pickingPct}% ({totalPicked}/{totalRequested})</span>
              </div>
              <div className="w-full bg-zinc-800 h-1 rounded-full overflow-hidden">
                <div 
                  className="bg-purple-500 h-full rounded-full transition-all duration-500" 
                  style={{ width: `${pickingPct}%` }}
                />
              </div>
            </div>
          )}

          {/* Micro Progress dots */}
          <div className="pl-1.5">
            <div className="flex items-center justify-between gap-0.5">
              {statuses.map((step, sIdx) => {
                const orderIdx = statuses.findIndex(s => s.id === order.status);
                const isCompleted = sIdx < orderIdx;
                const isCurrent = sIdx === orderIdx;
                return (
                  <div key={step.id} className="flex-1 h-1 rounded-full">
                    <div className={cn(
                      "h-[2px] w-full rounded-full transition-all duration-300",
                      isCompleted ? "bg-emerald-500/80" :
                      isCurrent ? "bg-[#13c985] shadow-[0_0_4px_#13c985]" :
                      "bg-zinc-800"
                    )} />
                  </div>
                );
              })}
            </div>
          </div>

          {/* Actions & Next Step - combined dynamically on one row or compact row */}
          <div className="pl-1.5 border-t border-white/5 pt-1.5 flex flex-col gap-1">
            <div className="flex items-center justify-between text-[8px] uppercase tracking-wider text-zinc-400 leading-none">
              <span className="text-zinc-500 font-semibold truncate leading-none mr-2">Próximo Passo:</span>
              <span className={cn("font-black text-right leading-none truncate flex-1", nextStep.isReady ? "text-[#13c985]" : "text-zinc-500")}>
                {nextStep.msg}
              </span>
            </div>

            {/* Quick Actions Action bar */}
            <div className="flex gap-1 mt-1">
              <button 
                onClick={() => setSelectedOrder(order)}
                className="px-2 py-2 bg-zinc-900 border border-zinc-800 text-white rounded-md text-[9px] font-black uppercase tracking-tight flex items-center justify-center gap-1"
                title="Detalhes"
              >
                <Eye className="w-3 h-3 text-zinc-400" /> Detalhes
              </button>

              {canShowReceipt(order.status) && (
                <button 
                  onClick={() => {
                    setLastDispatchedOrder(order);
                    setShowReceipt(true);
                  }}
                  className="px-2 py-2 bg-[#13c985]/10 border border-emerald-500/10 text-[#13c985] rounded-md text-[9px] font-black uppercase tracking-tight flex items-center justify-center gap-1"
                  title="Recibo"
                >
                  <ClipboardList className="w-3 h-3" /> Recibo
                </button>
              )}

              {/* Status workflow primary action buttons dynamically compressed */}
              <div className="flex-1 flex gap-1 justify-end min-w-0">
                {order.status === 'aguardando_separacao' && (
                  <button
                    onClick={() => handleInitiateDispatch(order.id)}
                    disabled={isDispatchingOrderIds.has(order.id)}
                    className={`flex-1 py-1.5 bg-[#13c985] text-black font-black uppercase rounded-md text-[9px] tracking-tight flex items-center justify-center gap-1 transition-all ${
                      isDispatchingOrderIds.has(order.id) ? 'opacity-50 cursor-not-allowed' : 'opacity-100 hover:bg-[#13c985]/90'
                    }`}
                  >
                    <Truck className="w-3 h-3 shrink-0" /> {isDispatchingOrderIds.has(order.id) ? 'Despachando...' : 'Despachar'}
                  </button>
                )}

                {order.status === 'enviado_separacao' && (
                  <div className="flex-1 flex gap-1 items-center justify-end">
                    <button 
                      onClick={() => handleRevertStatus(order)}
                      className="p-1.5 h-7 bg-zinc-900 text-white rounded-md border border-zinc-800 shrink-0 flex items-center justify-center cursor-pointer hover:bg-zinc-800"
                      title="Voltar"
                    >
                      <RotateCcw className="w-3 h-3" />
                    </button>
                    <div className="flex-1 py-1 px-1.5 bg-zinc-950 border border-zinc-900 text-zinc-500 font-extrabold uppercase rounded-md text-[7.5px] tracking-wider text-center flex items-center justify-center gap-1.5 h-7">
                      <span className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-ping shrink-0" />
                      Aguar. Bip
                    </div>
                  </div>
                )}

                {order.status === 'em_separacao' && (
                  <div className="flex-1 flex gap-1 items-center justify-end">
                    <button 
                      onClick={() => handleRevertStatus(order)}
                      className="p-1.5 h-7 bg-zinc-900 text-white rounded-md border border-zinc-800 shrink-0 flex items-center justify-center cursor-pointer hover:bg-zinc-800"
                      title="Voltar"
                    >
                      <RotateCcw className="w-3 h-3" />
                    </button>
                    <div className="flex-1 py-1 px-1.5 bg-purple-950/30 border border-purple-900/15 text-purple-400 font-extrabold uppercase rounded-md text-[6.5px] tracking-tighter text-center flex items-center justify-center gap-0.5 truncate h-7">
                      <span className="w-0.5 h-0.5 rounded-full bg-purple-400 animate-bounce shrink-0" />
                      Separando
                    </div>
                    <button
                      onClick={() => {
                        const updatedItems = order.items.map(item => ({ ...item, pickedQuantity: item.quantity }));
                        useStore.setState(state => ({
                          sales: state.sales.map(s => s.id === order.id ? { ...s, items: updatedItems } : s)
                        }));
                        updateSaleStatus(order.id, 'separado', currentUser?.fullName || 'Administrador', `Separação concluída manualmente.`);
                        setSelectedStatus('separado');
                        setCurrentPage(1);

                        const updatedOrder = {
                          ...order,
                          items: updatedItems
                        };
                        handlePrintReceipt(updatedOrder);
                      }}
                      className="flex-1 h-7 bg-[#13c985] text-black font-black uppercase rounded-md text-[7.5px] tracking-tighter text-center flex items-center justify-center"
                    >
                      Terminar
                    </button>
                  </div>
                )}

                {order.status === 'separado' && (
                  <div className="flex-1 flex gap-1 items-center justify-end">
                    <button 
                      onClick={() => handleRevertStatus(order)}
                      className="p-1.5 h-7 bg-zinc-900 text-white rounded-md border border-zinc-800 shrink-0 flex items-center justify-center cursor-pointer hover:bg-zinc-800"
                      title="Voltar"
                    >
                      <RotateCcw className="w-3 h-3" />
                    </button>
                    <button
                      onClick={() => {
                        setPackagingOrder(order);
                        setIsPackagingConferenceModalOpen(true);
                      }}
                      className="flex-1 py-1.5 bg-amber-500 text-black font-black uppercase rounded-md text-[8.5px] tracking-tight flex items-center justify-center gap-1"
                    >
                      <Package className="w-3 h-3 shrink-0" /> Embalar
                    </button>
                  </div>
                )}

                {order.status === 'embalando' && (
                  <div className="flex gap-1 w-full justify-end">
                    <button 
                      onClick={() => handleRevertStatus(order)}
                      className="p-1 bg-zinc-900 text-white rounded-md border border-zinc-800 shrink-0"
                      title="Voltar"
                    >
                      <RotateCcw className="w-3 h-3" />
                    </button>
                    <button 
                      onClick={() => {
                        setDeliveryOrder(order);
                        setIsDeliveryModalOpen(true);
                      }}
                      className="px-1.5 py-1 bg-blue-500/10 text-blue-400 border border-blue-500/10 rounded-md text-[7.5px] font-black uppercase tracking-tighter truncate shrink-0"
                    >
                      Entrega
                    </button>
                    <button
                      onClick={() => {
                        updateSaleStatus(order.id, 'em_rota', currentUser?.fullName || 'Logística', 'Despachado em rota de entrega.');
                        setSelectedStatus('em_rota');
                        setCurrentPage(1);
                      }}
                      className="flex-1 py-1.5 bg-blue-600 text-white font-black uppercase rounded-md text-[8.5px] tracking-tight flex items-center justify-center gap-1 min-w-0"
                    >
                      <Truck className="w-3 h-3 shrink-0" /> Despachar
                    </button>
                  </div>
                )}

                {order.status === 'em_rota' && (
                  <div className="flex gap-1 w-full justify-end">
                    <button 
                      onClick={() => handleRevertStatus(order)}
                      className="p-1 bg-zinc-900 text-white rounded-md border border-zinc-800 shrink-0"
                      title="Voltar"
                    >
                      <RotateCcw className="w-3 h-3" />
                    </button>
                    <button
                      onClick={() => {
                        updateSaleStatus(order.id, 'entregue', currentUser?.fullName || 'Logística', 'Entregue por Logística.');
                        setSelectedStatus('entregue');
                        setCurrentPage(1);
                      }}
                      className="flex-1 py-1 bg-emerald-650 text-white font-black uppercase rounded-md text-[8px] tracking-tighter text-center"
                    >
                      Confirmar
                    </button>
                  </div>
                )}

                {(order.status === 'entregue' || order.status === 'finalizado') && (
                  <div className="flex-1 flex gap-1 items-center justify-end">
                    <button 
                      onClick={() => handleRevertStatus(order)}
                      className="p-1.5 h-7 bg-zinc-900 text-white rounded-md border border-zinc-800 shrink-0 flex items-center justify-center cursor-pointer hover:bg-zinc-800"
                      title="Voltar"
                    >
                      <RotateCcw className="w-3 h-3" />
                    </button>
                    <span className="flex-1 text-[7.5px] bg-[#13c985]/10 text-emerald-400 font-extrabold uppercase rounded-md py-1.5 px-2 text-center truncate">
                      ✓ Concluído
                    </span>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      );
    }

    return (
      <div 
        key={order.id}
        className={cn(
          "bg-[#121212] border rounded-2xl p-4 flex flex-col justify-between transition-all duration-300 relative group overflow-hidden shadow-md hover:shadow-xl hover:-translate-y-0.5",
          isStagnant 
            ? "border-red-500/20 shadow-[0_0_15px_rgba(239,68,68,0.02)] bg-[radial-gradient(ellipse_at_top_right,_rgba(239,68,68,0.03),_transparent_60%)]" 
            : "border-white/5 hover:border-[#13c985]/30"
        )}
      >
        <div className={cn(
          "absolute left-0 top-0 bottom-0 w-1",
          priority.level === 'high' ? "bg-red-500 shadow-[2px_0_10px_rgba(239,68,68,0.4)]" :
          priority.level === 'medium' ? "bg-amber-500" : "bg-zinc-800"
        )} />

        <div className="space-y-3">
          <div className="flex items-start justify-between gap-1 pl-1">
            <div className="flex items-center gap-1.5 min-w-0">
              <span className="text-xs font-black text-white font-mono uppercase tracking-wider truncate">
                #{order.orderNumber}
              </span>
              <button 
                onClick={() => copyToClipboard(order.orderNumber, order.id)}
                className="text-zinc-500 hover:text-white transition-colors"
                title="Copiar Número"
              >
                {copiedOrderId === order.id ? (
                  <Check className="w-3 h-3 text-emerald-400" />
                ) : (
                  <Copy className="w-3 h-3" />
                )}
              </button>
            </div>
            
            <div className="flex flex-col items-end gap-1 shrink-0">
              <span className={cn("text-[7.5px] font-black uppercase tracking-wider px-2 py-0.5 rounded border leading-none shrink-0", priority.color)}>
                {priority.label}
              </span>
              <div className="flex items-center gap-1 text-zinc-500 font-mono text-[9px] leading-none">
                <Clock className="w-3 h-3 shrink-0" />
                <span>{formatElapsedTime(elapsed)}</span>
              </div>
            </div>
          </div>

          <div className="pl-1">
            <span className="text-[7px] text-zinc-650 uppercase font-black tracking-widest block leading-none">Cliente</span>
            <span className="text-xs font-black text-white uppercase tracking-tight block mt-1 truncate">
              {getClientName(order.clientId) || order.clientName || 'Consumidor Final'}
            </span>
            {order.clientPhone && (
              <span className="text-[8.5px] font-mono text-zinc-500 block leading-normal mt-0.5 truncate">{order.clientPhone}</span>
            )}
          </div>

          {isStagnant && (
            <motion.div 
              initial={{ opacity: 0, y: 5 }}
              animate={{ opacity: 1, y: 0 }}
              className="bg-red-500/5 border border-red-500/10 rounded-xl px-3 py-2 flex items-center gap-2"
            >
              <span className="flex h-1.5 w-1.5 rounded-full bg-red-500 animate-pulse relative shrink-0" />
              <span className="text-[8.5px] font-black text-red-400 uppercase tracking-wider leading-none">
                Estagnado há {formatElapsedTime(elapsed)} s/ avanço!
              </span>
            </motion.div>
          )}

          <div className="pl-1 grid grid-cols-2 gap-2 pt-1 border-t border-white/5">
            <div>
              <span className="text-[7px] text-zinc-650 uppercase font-black tracking-widest block leading-none">Status</span>
              <div className="flex items-center gap-1.5 mt-1">
                <span className={cn(
                  "w-1.5 h-1.5 rounded-full inline-block",
                  order.status === 'aguardando_separacao' ? 'bg-amber-500 animate-pulse' :
                  order.status === 'enviado_separacao' ? 'bg-blue-400' :
                  order.status === 'em_separacao' ? 'bg-purple-400 animate-bounce' :
                  order.status === 'separado' ? 'bg-emerald-400' : 'bg-pink-400'
                )} />
                <span className="text-[9.5px] font-black text-zinc-300 uppercase tracking-wider">
                  {order.status.replace('_', ' ')}
                </span>
              </div>
            </div>

            <div>
              <span className="text-[7px] text-zinc-655 uppercase font-black tracking-widest block leading-none">Operador</span>
              <div className="flex items-center gap-1 mt-1 truncate">
                <User className="w-3 h-3 text-zinc-500 shrink-0" />
                <span className="text-[9.5px] font-semibold text-zinc-300 uppercase tracking-tight truncate">
                  {order.pickerName || 'Sem operador'}
                </span>
              </div>
            </div>
          </div>

          {order.status === 'em_separacao' && (
            <div className="space-y-1.5 pt-1.5 pl-1">
              <div className="flex justify-between items-center text-[8.5px] uppercase font-bold text-zinc-500 font-mono">
                <span>Progresso picking</span>
                <span className="text-purple-400 font-black">{pickingPct}% ({totalPicked}/{totalRequested})</span>
              </div>
              <div className="w-full bg-zinc-800 h-1.5 rounded-full overflow-hidden">
                <div 
                  className="bg-purple-500 h-full rounded-full transition-all duration-500" 
                  style={{ width: `${pickingPct}%` }}
                />
              </div>
            </div>
          )}

          <div className="pl-1 flex items-center justify-between pt-1 border-t border-white/5 text-[9px] uppercase font-bold font-mono">
            <span className="text-zinc-500 shrink-0">Item Vol: <strong className="text-zinc-300">{totalItems} un</strong></span>
            
            <div className="flex items-center gap-1.5">
              <div className="flex items-center gap-1.5">
                {nextStep.isReady && (
                  <span className="flex h-1.5 w-1.5 relative shrink-0">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-500"></span>
                  </span>
                )}
                <span className={cn("text-[8.5px] font-black uppercase tracking-wider", nextStep.isReady ? "text-emerald-400 animate-pulse" : "text-zinc-500")}>
                  {nextStep.msg}
                </span>
              </div>
            </div>
          </div>
        </div>

        <div className="my-3 pl-1 pt-2 border-t border-white/5">
          <div className="flex items-center justify-between gap-1">
            {statuses.map((step, sIdx) => {
              const orderIdx = statuses.findIndex(s => s.id === order.status);
              const isCompleted = sIdx < orderIdx;
              const isCurrent = sIdx === orderIdx;
              return (
                <div 
                  key={step.id} 
                  className="flex-1 flex flex-col items-center group/dot relative"
                >
                  <div className={cn(
                    "h-[3px] w-full rounded-full transition-all duration-300",
                    isCompleted ? "bg-emerald-500" :
                    isCurrent ? "bg-[#13c985] shadow-[0_0_8px_#13c985] animate-pulse ring-1 ring-emerald-400/20" :
                    "bg-zinc-800"
                  )} />
                  <div className="absolute bottom-4 scale-0 group-hover/dot:scale-100 bg-zinc-950 border border-zinc-800 text-[7px] text-zinc-300 px-1.5 py-0.5 rounded shadow-xl font-black uppercase tracking-widest z-50 whitespace-nowrap transition-transform pointer-events-none">
                    {step.label}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="space-y-1.5 pl-1 pt-1 border-t border-white/5">
          <div className="flex gap-1.5">
            <button 
              onClick={() => setSelectedOrder(order)}
              className="flex-1 py-1.5 bg-zinc-900 hover:bg-zinc-850 text-white font-black rounded-xl text-[9px] uppercase tracking-wider transition-all flex items-center justify-center gap-1.5 border border-zinc-800"
              title="Acessar Detalhes Integrados"
            >
              <Eye className="w-3.5 h-3.5" /> Detalhes
            </button>

            {canShowReceipt(order.status) && (
              <button 
                onClick={() => {
                  setLastDispatchedOrder(order);
                  setShowReceipt(true);
                }}
                className="flex-1 py-1.5 bg-[#13c985]/10 hover:bg-[#13c985]/20 text-emerald-405 border border-emerald-500/10 rounded-xl text-[9px] font-black uppercase tracking-wider transition-all flex items-center justify-center gap-1.5"
                title="Visualizar Recibo de venda"
              >
                <ClipboardList className="w-3.5 h-3.5 text-[#13c985]" /> Recibo
              </button>
            )}
          </div>

          <div className="w-full pt-1">
            {order.status === 'aguardando_separacao' && (
              <button
                onClick={() => handleInitiateDispatch(order.id)}
                disabled={isDispatchingOrderIds.has(order.id)}
                className={`w-full py-2 bg-[#13c985] text-black font-black uppercase rounded-xl text-[9px] tracking-widest transition-all flex items-center justify-center gap-2 shadow-lg shadow-emerald-500/20 ${
                  isDispatchingOrderIds.has(order.id) ? 'opacity-50 cursor-not-allowed' : 'opacity-100 hover:bg-[#13c985]/90'
                }`}
              >
                <Truck className="w-4 h-4" /> {isDispatchingOrderIds.has(order.id) ? 'Enviando...' : 'Enviar para Separação'}
              </button>
            )}

            {order.status === 'enviado_separacao' && (
              <div className="flex gap-1.5 w-full">
                <button 
                  onClick={() => handleRevertStatus(order)}
                  className="p-2 bg-zinc-900 hover:bg-zinc-800 text-white rounded-xl border border-zinc-800 transition-all shrink-0 cursor-pointer"
                  title="Voltar Status"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                </button>
                <div className="flex-1 py-3 bg-zinc-900 border border-zinc-800 text-zinc-500 font-extrabold uppercase rounded-xl text-[9px] tracking-wider text-center flex items-center justify-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-ping shrink-0" />
                  Aguardando BIP do Separador...
                </div>
              </div>
            )}

            {order.status === 'em_separacao' && (
              <div className="flex flex-col gap-1.5 w-full">
                <div className="flex gap-1.5 w-full">
                  <button 
                    onClick={() => handleRevertStatus(order)}
                    className="p-2 bg-zinc-900 hover:bg-zinc-800 text-white rounded-xl border border-zinc-800 transition-all shrink-0 cursor-pointer"
                    title="Voltar Status"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                  </button>
                  <div className="flex-1 py-2 bg-purple-500/10 border border-purple-500/15 text-purple-400 font-extrabold uppercase rounded-xl text-[9px] tracking-wider text-center flex items-center justify-center gap-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-purple-400 animate-bounce shrink-0" />
                    Separação em Andamento...
                  </div>
                </div>
                <button
                  onClick={() => {
                    const updatedItems = order.items.map(item => ({ ...item, pickedQuantity: item.quantity }));
                    useStore.setState(state => ({
                      sales: state.sales.map(s => s.id === order.id ? { ...s, items: updatedItems } : s)
                    }));
                    updateSaleStatus(order.id, 'separado', currentUser?.fullName || 'Administrador', `Separação concluída manualmente no painel.`);
                    setSelectedStatus('separado');
                    setCurrentPage(1);

                    const updatedOrder = {
                      ...order,
                      items: updatedItems
                    };
                    handlePrintReceipt(updatedOrder);
                  }}
                  className="w-full py-1.5 bg-[#13c985] hover:bg-[#13c985]/90 text-black font-black uppercase rounded-xl text-[9px] tracking-widest transition-all flex items-center justify-center gap-1.5 shadow-lg shadow-emerald-500/10 cursor-pointer"
                >
                  <CheckCircle2 className="w-3.5 h-3.5" /> Concluir Separação
                </button>
              </div>
            )}

            {order.status === 'separado' && (
              <div className="flex gap-1.5 w-full">
                <button 
                  onClick={() => handleRevertStatus(order)}
                  className="p-2 bg-zinc-900 hover:bg-zinc-800 text-white rounded-xl border border-zinc-800 transition-all shrink-0 cursor-pointer"
                  title="Voltar Status"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={() => {
                    setPackagingOrder(order);
                    setIsPackagingConferenceModalOpen(true);
                  }}
                  className="flex-1 py-2 bg-amber-500 hover:bg-amber-400 text-black font-black uppercase rounded-xl text-[9px] tracking-widest transition-all flex items-center justify-center gap-2 shadow-lg shadow-amber-500/10"
                >
                  <Package className="w-4 h-4" /> Enviar para Embalagem
                </button>
              </div>
            )}

            {order.status === 'embalando' && (
              <div className="flex gap-1 w-full">
                <button 
                  onClick={() => handleRevertStatus(order)}
                  className="p-2 bg-zinc-900 hover:bg-zinc-810 text-white rounded-xl border border-zinc-800 transition-all shrink-0"
                  title="Reverter Status"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                </button>
                <button 
                  onClick={() => {
                    setDeliveryOrder(order);
                    setIsDeliveryModalOpen(true);
                  }}
                  className="flex-1 py-1.5 bg-blue-500/10 hover:bg-blue-500/20 text-blue-400 border border-blue-500/10 rounded-xl text-[9px] font-black uppercase tracking-wider transition-all flex items-center tracking-tight justify-center gap-1 min-w-0"
                >
                  <Truck className="w-3.5 h-3.5" /> Vincular Entrega
                </button>
                <button
                  onClick={() => {
                    updateSaleStatus(order.id, 'em_rota', currentUser?.fullName || 'Logística', 'Despachado em rota de entrega.');
                    setSelectedStatus('em_rota');
                    setCurrentPage(1);
                  }}
                  className="flex-1 py-2 bg-blue-600 hover:bg-blue-500 text-white font-black uppercase rounded-xl text-[9px] tracking-widest transition-all flex items-center justify-center gap-1 min-w-0"
                >
                  <Truck className="w-4 h-4" /> Despachar p/ Rota
                </button>
              </div>
            )}

            {order.status === 'em_rota' && (
              <div className="flex gap-1 w-full">
                <button 
                  onClick={() => handleRevertStatus(order)}
                  className="p-2 bg-zinc-900 hover:bg-zinc-810 text-white rounded-xl border border-zinc-800 transition-all"
                  title="Reverter Status"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={() => {
                    updateSaleStatus(order.id, 'entregue', currentUser?.fullName || 'Logística', 'Entregue por Logística.');
                    setSelectedStatus('entregue');
                    setCurrentPage(1);
                  }}
                  className="flex-1 py-2 bg-emerald-650 hover:bg-emerald-500 text-white font-black uppercase rounded-xl text-[9px] tracking-widest transition-all flex items-center justify-center gap-1"
                >
                  <CheckCircle className="w-4 h-4" /> Confirmar Entrega
                </button>
              </div>
            )}

            {(order.status === 'entregue' || order.status === 'finalizado') && (
              <div className="flex gap-1.5 w-full">
                <button 
                  onClick={() => handleRevertStatus(order)}
                  className="p-2 bg-zinc-900 hover:bg-zinc-800 text-white rounded-xl border border-zinc-800 transition-all shrink-0 cursor-pointer"
                  title="Voltar Status"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                </button>
                <div className="flex-1 py-2 bg-emerald-500/5 text-emerald-400 border border-emerald-500/10 font-bold uppercase rounded-xl text-[9px] tracking-widest text-center flex items-center justify-center gap-2">
                  <CheckCircle className="w-4 h-4 text-[#13c985]" /> Pedido Concluído
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }, [copiedOrderId, copyToClipboard, getClientName, getOrderPriority, getNextStepStatus, formatElapsedTime, handleInitiateDispatch, handleRevertStatus, setPackagingOrder, setIsPackagingConferenceModalOpen, setDeliveryOrder, setIsDeliveryModalOpen, updateSaleStatus, currentUser, STATUS_THRESHOLDS, getTimeStopped]);

  const handleSaveAllNotes = async () => {
    if (!activeOrder) return;
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

  async function handleInitiateDispatch(orderId: string) {
    if (isDispatchingOrderIds.has(orderId)) return;
    
    setIsDispatchingOrderIds(prev => {
      const next = new Set(prev);
      next.add(orderId);
      return next;
    });

    try {
      console.log(`[DISPATCH_SEQUENCE] Initiating direct dispatch sequence for order: ${orderId}`);
      
      const sale = sales.find(s => s.id === orderId);
      if (sale) {
        if (sale.status === 'aguardando_separacao') {
          const description = `Pedido despachado por ${currentUser?.fullName || 'Administrador'} em ${format(new Date(), "dd/MM HH:mm")}. Status alterado para Enviado para Separação.`;
          updateSaleStatus(sale.id, 'enviado_separacao', currentUser?.fullName || 'Administrador', description);
          
          // Auto-switch tab to let the user follow the order Journey seamlessly
          setSelectedStatus('enviado_separacao');
          setCurrentPage(1);

          // SILENT REAL PRINT / PDF DOWNLOAD ON DISPATCH:
          await handlePrintCupom(sale);
        }
      }
    } catch (err: any) {
      console.error("Erro no despacho direto:", err);
    } finally {
      setIsDispatchingOrderIds(prev => {
        const next = new Set(prev);
        next.delete(orderId);
        return next;
      });
    }
  }

  const handleSendToPicking = (id: string | Sale) => {
    const saleId = typeof id === 'string' ? id : id.id;
    handleInitiateDispatch(saleId);
  };

  const handleCancelOrder = (id: string) => {
    setOrderToCancel(id);
    setIsMasterPasswordModalOpen(true);
  };

  const handleConfirmCancel = () => {
    if (orderToCancel) {
      updateSaleStatus(orderToCancel, 'cancelado');
      setOrderToCancel(null);
      setSelectedOrder(null);
    }
    setIsMasterPasswordModalOpen(false);
  };

  const REVERT_STATUS_MAP: Record<string, string> = {
    'enviado_separacao': 'aguardando_separacao',
    'em_separacao': 'enviado_separacao',
    'separado': 'em_separacao',
    'embalando': 'separado', 
    'em_rota': 'embalando',
    'entregue': 'em_rota',
    'finalizado': 'em_rota',
  };

  function handleRevertStatus(order: Sale) {
    setOrderToRevert(order);
  }

  const confirmRevertStatus = () => {
    if (!orderToRevert) return;
    
    const previousStatus = REVERT_STATUS_MAP[orderToRevert.status];
    if (previousStatus) {
      const currentLabel = getStatusLabel(orderToRevert.status);
      const previousLabel = getStatusLabel(previousStatus);
      const userName = adminFullName;
      
      let customDescription = `Pedido voltou de ${currentLabel} para ${previousLabel} por ${userName} em ${format(new Date(), "dd/MM HH:mm")}`;
      if (previousStatus === 'em_separacao') {
        customDescription += ". Separação reiniciada.";
      }
      
      updateSaleStatus(orderToRevert.id, previousStatus as any, userName, customDescription, true);
      
      // Auto-switch tab to keep track of the reverted order
      setSelectedStatus(previousStatus);
      setCurrentPage(1);
    }
    
    setOrderToRevert(null);
    setSelectedOrder(null);
  };

  const handleConfirmPackaging = () => {
    if (!packagingOrder) return;
    
    // Validation
    const currentOrder = sales.find(s => s.id === packagingOrder.id);
    if (!currentOrder || currentOrder.status !== 'separado') {
      alert("Este pedido não está mais disponível para envio à embalagem.");
      setIsPackagingConferenceModalOpen(false);
      setPackagingOrder(null);
      return;
    }

    const hasMissingItems = currentOrder.items.some(item => (item.quantity - (item.pickedQuantity || item.quantity)) > 0);
    
    let historyMsg = `Pedido embalado e conferido por ${currentUser?.fullName || 'Administrador'} em ${format(new Date(), "dd/MM HH:mm")}.`;
    if (hasMissingItems) {
      historyMsg += " Pedido possui itens faltantes na conferência de embalagem.";
    }

    updateSaleStatus(currentOrder.id, 'embalando', currentUser?.fullName || 'Administrador', historyMsg);
    
    // Auto-switch tab to keep the user focused on the order journey
    setSelectedStatus('embalando');
    setCurrentPage(1);
    
    setIsPackagingConferenceModalOpen(false);
    setPackagingOrder(null);
    setSelectedOrder(null);
  };



  const getStatusInfo = (status: string) => {
    const info = statuses.find(s => s.id === status);
    if (info) return info;
    
    // Fallback for non-operational statuses
    const fallbackMap: Record<string, { label: string; color: string }> = {
      'cancelado': { label: 'Cancelado', color: 'bg-red-500/10 text-red-500' },
      'finalizado': { label: 'Finalizado', color: 'bg-emerald-600/20 text-emerald-500' },
      'retirado': { label: 'Retirado', color: 'bg-indigo-500/10 text-indigo-400' },
      'problema': { label: 'Problema', color: 'bg-red-600/10 text-red-600' },
      'atrasado': { label: 'Atrasado', color: 'bg-orange-600/10 text-orange-600' },
    };
    
    return fallbackMap[status] || { label: status, color: 'bg-white/5 text-white/40' };
  };

  const getStatusLabel = (status: string) => {
    return getStatusInfo(status).label;
  };

  function getClientName(clientId?: string) {
    if (!clientId) return 'Consumidor Final';
    return clients.find(c => c.id === clientId)?.name || 'Cliente Desconhecido';
  }



  const getClientAddressForSale = (order: Sale) => {
    if (!order.clientId) return undefined;
    const client = clients.find(c => c.id === order.clientId);
    if (!client) return undefined;
    return {
      street: client.address || 'Rua não informada',
      number: '',
      neighborhood: client.neighborhood || 'Centro',
      city: client.city || 'São Paulo',
      state: client.state || 'SP',
      zipCode: client.zip || '01000-000',
      ref: client.notes || ''
    };
  };

  const mapToReciboPayload = (order: Sale): any => {
    const companyState = useStore.getState().company;
    const items = order.items.map(item => ({
      code: item.code || item.id,
      description: item.name,
      qty: item.quantity,
      price: item.price,
      total: item.price * item.quantity
    }));

    return {
      orderId: order.id,
      orderNumber: order.orderNumber,
      date: new Date(order.timestamp).toLocaleString(),
      operator: order.sellerName || 'Sistema / Caixa',
      client: {
        name: getClientName(order.clientId),
        phone: order.clientId ? (clients.find(c => c.id === order.clientId)?.phone || '') : '',
        document: order.clientId ? (clients.find(c => c.id === order.clientId)?.document || '') : ''
      },
      items,
      financial: {
        subtotal: order.subtotal,
        discount: order.discount,
        deliveryFee: order.additionalCharge || 0,
        surcharge: 0,
        total: order.total,
        paymentMethod: order.paymentMethodName || 'Outro',
        receivedAmount: order.receivedAmount || order.total,
        changeAmount: order.change || 0
      },
      companyName: companyState?.name || "Lukasfe Industrial Ltda",
      companyCnpj: companyState?.document || "00.000.000/0001-00",
      companyAddress: companyState?.address ? `${companyState.address.street || ''}, ${companyState.address.number || ''} ${companyState.address.neighborhood || ''} ${companyState.address.city || ''} - ${companyState.address.state || ''}` : "Praça da Sé, 100",
      companyPhone: companyState?.phone || "(11) 4002-8922",
      notes: order.deliveryNotes || ""
    };
  };

  const mapToCupomPayload = (order: Sale): any => {
    const address = getClientAddressForSale(order);
    const companyState = useStore.getState().company;
    const storeProducts = useStore.getState().products || [];

    const formatProductLocation = (pLocation?: { aisle?: string; shelf?: string; drawer?: string } | string) => {
      if (!pLocation) return 'Sem localização';
      if (typeof pLocation === 'string') return pLocation || 'Sem localização';
      
      const parts: string[] = [];
      if (pLocation.aisle) parts.push(`Corr./Rua: ${pLocation.aisle}`);
      if (pLocation.shelf) parts.push(`Prat.: ${pLocation.shelf}`);
      if (pLocation.drawer) parts.push(`Gav.: ${pLocation.drawer}`);
      
      return parts.length > 0 ? parts.join(' | ') : 'Sem localização';
    };

    return {
      orderId: order.id,
      orderNumber: order.orderNumber,
      date: new Date(order.timestamp).toLocaleString(),
      sellerName: order.sellerName || 'Operador',
      pickerName: order.pickerName || 'Pendência de Separação',
      deliveryMethod: order.deliveryMethodName || 'Não Informado',
      client: {
        name: getClientName(order.clientId) || 'Cliente não informado',
        phone: order.clientId ? (clients.find(c => c.id === order.clientId)?.phone || 'Telefone não informado') : 'Telefone não informado',
        document: order.clientId ? (clients.find(c => c.id === order.clientId)?.document || '') : '',
        address
      },
      items: order.items.map(item => {
        const realProd = storeProducts.find(p => p.id === item.id || p.code === item.code);
        const code = item.code || (realProd && realProd.code) || item.id || 'Sem código';
        const unit = item.unit || (realProd && realProd.unit) || 'UN';
        const productLocation = (realProd && realProd.location) || item.location;
        const formattedLocation = formatProductLocation(productLocation);

        return {
          code,
          description: item.name,
          qty: item.quantity,
          location: formattedLocation,
          unit: unit
        };
      }),
      observations: order.deliveryNotes || "",
      companyName: companyState?.name || "Lukasfe Industrial Ltda",
      companyCnpj: companyState?.document || "00.000.000/0001-00",
      companyAddress: companyState?.address 
        ? `${companyState.address.street || ''}${companyState.address.number ? `, ${companyState.address.number}` : ''}${companyState.address.neighborhood ? ` - ${companyState.address.neighborhood}` : ''}${companyState.address.city ? `, ${companyState.address.city}` : ''}${companyState.address.state ? `/${companyState.address.state}` : ''}`
        : "Praça da Sé, 100",
      companyPhone: companyState?.phone || "Telefone não informado",
      headerLogoUrl: companyState?.logo
    };
  };

  const mapToEtiquetaPayload = (order: Sale): any => {
    const companyState = useStore.getState().company;
    const client = order.clientId ? clients.find(c => c.id === order.clientId) : undefined;
    return {
      volumeId: `VOL-${order.orderNumber}-01`,
      volumeNumber: 1,
      totalVolumes: 1,
      orderNumber: order.orderNumber,
      carrierNameFn: order.deliveryMethodName || 'MOTOBOY / REMESSA',
      sender: {
        name: companyState?.name || "Lukasfe Industrial Ltda",
        address: companyState?.address ? `${companyState.address.street || ''}, ${companyState.address.number || ''}` : "Praça da Sé, 100",
        doc: companyState?.document || "00.000.000/0001-00"
      },
      recipient: {
        name: getClientName(order.clientId),
        address: client ? (client.address || "Balcão / Retirada") : "Balcão / Retirada",
        neighborhood: client?.neighborhood || "Centro",
        cityStateZip: client ? `${client.city || ''} - ${client.state || ''} - ${client.zip || ''}` : "-",
        doc: client?.document || "-",
        phone: client?.phone || ""
      },
      weightKg: 1.0,
      barCodeValue: order.orderNumber.replace(/[^0-9]/g, '') || "123456789012"
    };
  };

  const mapToExperiencePayload = (order: Sale): any => {
    return {
      orderNumber: order.orderNumber,
      clientName: getClientName(order.clientId),
      messageText: customerExperienceConfig?.mainMessage || `Olá, ${getClientName(order.clientId)}! Agradecemos imensamente pela sua parceria e preferência de compra. Esperamos que este pedido atenda a todos os seus quesitos de conformidade técnica e qualidade corporativa.`,
      qrCodeUrl: customerExperienceConfig?.qrUrl || '',
      qrCodeLabel: 'Agradecemos pela preferência',
      couponCode: undefined
    };
  };

  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);
  const [isPrinting, setIsPrinting] = useState(false);

  const canShowReceipt = (status: string) => {
    return ['separado', 'separado_com_faltantes', 'aguardando_embalagem', 'embalando', 'finalizado', 'em_rota', 'entregue', 'retirado'].includes(status);
  };

  const handleGeneratePdfReceipt = async (order: Sale) => {
    try {
      setIsGeneratingPdf(true);
      const compiled = mapToReciboPayload(order);
      const activePaperSize = receiptConfig.paperSize || '80mm';
      const blob = await generateCanonicalPdfBlob(
        'reciboTermico',
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
      await downloadOrSharePdf(blob, `recibo_${order.orderNumber}`);
    } catch (err: any) {
      console.error(err);
      alert(`Erro ao gerar PDF do Recibo: ${err.message}`);
    } finally {
      setIsGeneratingPdf(false);
    }
  };

  const handlePrintReceipt = async (order: Sale) => {
    try {
      setIsPrinting(true);
      const compiled = mapToReciboPayload(order);
      const activePaperSize = receiptConfig.paperSize || '80mm';

      const bindings = useStore.getState().documentPrintConfigs || [];
      const activePrintConfig = bindings.find(c => c.documentId === 'thermal_receipt');
      const printersList = useStore.getState().printers || [];
      const targetPrinter = activePrintConfig ? printersList.find(p => p.id === activePrintConfig.printerId) : undefined;

      // Fallback to manual download/print if config says so, is missing, or target printer is not found/configured
      if (!activePrintConfig || activePrintConfig.printerId === 'pdf-manual' || printersList.length === 0 || !targetPrinter) {
        const blob = await generateCanonicalPdfBlob(
          'reciboTermico',
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
        await downloadOrSharePdf(blob, `recibo_${order.orderNumber}`);
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
        documentId: 'thermal_receipt',
        documentName: `Recibo Pedido #${order.orderNumber}`,
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
      alert(`Falha ao imprimir Recibo: ${err.message}`);
    } finally {
      setIsPrinting(false);
    }
  };

  const waitAndPrintJob = async (jobId: string) => {
    console.log('[PRINT-SPOOLER] Physical printing job initiated with ID:', jobId);
  };

  async function handleDownloadCupomPdf(order: Sale) {
    try {
      setIsGeneratingPdf(true);
      const compiled = mapToCupomPayload(order);
      const activePaperSize = orderTicketConfig.paperSize || '80mm';
      const blob = await generateCanonicalPdfBlob(
        'cupomPedido',
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
      await downloadOrSharePdf(blob, `cupom_${order.orderNumber}`);
    } catch (err: any) {
      console.error(err);
      alert(`Erro ao gerar PDF do Cupom: ${err.message}`);
    } finally {
      setIsGeneratingPdf(false);
    }
  }

  async function handlePrintCupom(order: Sale) {
    try {
      setIsPrinting(true);
      const compiled = mapToCupomPayload(order);
      const activePaperSize = orderTicketConfig.paperSize || '80mm';

      const bindings = useStore.getState().documentPrintConfigs || [];
      const activePrintConfig = bindings.find(c => c.documentId === 'order_ticket');

      const printersList = useStore.getState().printers || [];
      const targetPrinter = activePrintConfig ? printersList.find(p => p.id === activePrintConfig.printerId) : undefined;

      // Fallback to PDF instead of alerting or doing nothing if no printers exist in the system, or printer profile is missing/un-matched
      if (!activePrintConfig || activePrintConfig.printerId === 'pdf-manual' || printersList.length === 0 || !targetPrinter) {
        const blob = await generateCanonicalPdfBlob(
          'cupomPedido',
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
        await downloadOrSharePdf(blob, `cupom_${order.orderNumber}`);
        return;
      }

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
        documentId: 'order_ticket',
        documentName: `Cupom Pedido #${order.orderNumber}`,
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
      alert(`Falha ao imprimir Cupom: ${err.message}`);
    } finally {
      setIsPrinting(false);
    }
  };

  const handleDownloadOrderLabelsPdfInternal = async (order: Sale) => {
    try {
      setIsGeneratingPdf(true);
      const compiled = mapToEtiquetaPayload(order);
      const activePaperSize = labelConfig.paperSize || 'A6';
      const blob = await generateCanonicalPdfBlob(
        'etiqueta',
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
      await downloadOrSharePdf(blob, `etiqueta_${order.orderNumber}`);
    } catch (err: any) {
      console.error(err);
      alert(`Erro ao gerar PDF da Etiqueta: ${err.message}`);
    } finally {
      setIsGeneratingPdf(false);
    }
  };

  const handlePrintOrderLabelsInternal = async (order: Sale) => {
    try {
      setIsPrinting(true);
      const compiled = mapToEtiquetaPayload(order);
      const activePaperSize = labelConfig.paperSize || 'A6';

      const bindings = useStore.getState().documentPrintConfigs || [];
      const binders = useStore.getState().documentPrintConfigs || [];
      const activePrintConfig = bindings.find(c => c.documentId === 'labels');
      const printersList = useStore.getState().printers || [];
      const targetPrinter = activePrintConfig ? printersList.find(p => p.id === activePrintConfig.printerId) : undefined;

      if (!activePrintConfig || activePrintConfig.printerId === 'pdf-manual' || printersList.length === 0 || !targetPrinter) {
        const blob = await generateCanonicalPdfBlob(
          'etiqueta',
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
        await downloadOrSharePdf(blob, `etiqueta_${order.orderNumber}`);
        return;
      }

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
        documentId: 'labels',
        documentName: `Etiqueta Pedido #${order.orderNumber}`,
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
      alert(`Falha ao imprimir Etiqueta: ${err.message}`);
    } finally {
      setIsPrinting(false);
    }
  };

  const handleDownloadExperiencePdfInternal = async (order: Sale) => {
    try {
      setIsGeneratingPdf(true);
      const compiled = mapToExperiencePayload(order);
      const activePaperSize = customerExperienceConfig.paperSize || 'A6';
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
      await downloadOrSharePdf(blob, `mimo_${order.orderNumber}`);
    } catch (err: any) {
      console.error(err);
      alert(`Erro ao gerar PDF de Encarte: ${err.message}`);
    } finally {
      setIsGeneratingPdf(false);
    }
  };

  const getOrderHistory = (orderId: string) => {
    return auditLogs
      .filter(log => log.referenceId === orderId)
      .sort((a, b) => b.timestamp - a.timestamp);
  };

  const getTimelineIconComponent = (iconName: string) => {
    switch (iconName) {
      case 'Archive': return <Archive className="w-3.5 h-3.5" />;
      case 'CheckCircle2': return <CheckCircle2 className="w-3.5 h-3.5" />;
      case 'XCircle': return <XCircle className="w-3.5 h-3.5" />;
      case 'Inbox': return <Inbox className="w-3.5 h-3.5" />;
      case 'Package': return <Package className="w-3.5 h-3.5" />;
      case 'AlertCircle': return <AlertCircle className="w-3.5 h-3.5" />;
      case 'Truck': return <Truck className="w-3.5 h-3.5" />;
      case 'CheckCircle': return <CheckCircle className="w-3.5 h-3.5" />;
      case 'RotateCcw': return <RotateCcw className="w-3.5 h-3.5" />;
      case 'Printer': return <Printer className="w-3.5 h-3.5" />;
      case 'Tv': return <Tv className="w-3.5 h-3.5" />;
      case 'Activity': return <Activity className="w-3.5 h-3.5" />;
      case 'PackageSearch': return <PackageSearch className="w-3.5 h-3.5" />;
      default: return <Clock className="w-3.5 h-3.5" />;
    }
  };

  const getCombinedTimeline = (order: Sale) => {
    // 1. Get the order's local timelineEvents
    const localEvents = [...(order.timelineEvents || [])];

    // 2. Map local events to unified timeline format
    const events = localEvents.map(evt => ({
      id: evt.id,
      type: evt.type || 'order',
      timestamp: evt.timestamp,
      user: evt.user || 'Sistema',
      description: evt.description,
      observation: evt.observation,
      status: evt.status || order.status,
      icon: evt.icon || 'Clock',
      color: evt.color || 'text-white/40'
    }));

    // 3. Find global audit log events related to this specific order
    // (e.g. log.referenceId matches orderId or log.description contains "#orderNumber")
    const orderRefStr = `#${order.orderNumber}`;
    const matchedAudits = auditLogs.filter(log => 
      log.referenceId === order.id || 
      log.entityId === order.id ||
      log.description.includes(orderRefStr)
    );

    // 4. Map matched audit logs into timeline events if they don't already exist
    matchedAudits.forEach(log => {
      // Find if we already have a timeline event corresponding roughly to the same timestamp or description
      const isAlreadyInTimeline = events.some(evt => 
        (evt.timestamp === log.timestamp) || 
        (evt.description === log.description)
      );

      if (!isAlreadyInTimeline) {
        let icon = 'Clock';
        let color = 'text-white/40';
        let type = 'order';

        if (log.actionType === 'create') {
          icon = 'Archive';
          color = 'text-amber-500';
          type = 'order';
        } else if (log.actionType === 'cancel') {
          icon = 'XCircle';
          color = 'text-red-500';
          type = 'order';
        } else if (log.actionType === 'status_change') {
          icon = 'CheckCircle2';
          color = 'text-emerald-500';
          type = 'order';
        } else if (log.action === 'Autorização ADM/master usada') {
          icon = 'Activity';
          color = 'text-purple-400';
          type = 'user';
        } else if (log.module === 'Estoque' && log.action === 'Baixa por Separação') {
          icon = 'Package';
          color = 'text-blue-400';
          type = 'stock';
        } else if (log.module === 'Estoque' && log.action === 'Item Faltante') {
          icon = 'AlertCircle';
          color = 'text-amber-500';
          type = 'stock';
        } else if (log.module === 'Impressão') {
          icon = 'Printer';
          color = 'text-indigo-400';
          type = 'print';
        }

        events.push({
          id: log.id,
          type,
          timestamp: log.timestamp,
          user: log.userLogin || 'Sistema',
          description: log.description + (log.method ? ` (Método: ${log.method})` : ''),
          observation: log.previousValue ? `DE: ${log.previousValue} | PARA: ${log.newValue}` : undefined,
          status: order.status,
          icon,
          color
        });
      }
    });

    // 5. Return sorted descending (newest first)
    return events.sort((a, b) => b.timestamp - a.timestamp);
  };

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: `
        @media (max-width: 768px) {
          * {
            box-sizing: border-box !important;
          }
 
          html, body {
            width: 100%;
            max-width: 100%;
            overflow-x: hidden !important;
            height: 100%;
            background: #020304;
          }
 
          .orders-mobile {
            width: 100%;
            max-width: 100vw !important;
            height: 100vh;
            height: 100svh;
            background: radial-gradient(circle at top, #111820 0%, #05070a 55%, #020304 100%);
            color: #fff;
            font-family: 'Inter', sans-serif;
            padding: 8px 8px 10px 8px !important;
            position: relative;
            z-index: 1;
            display: flex;
            flex-direction: column;
            gap: 6px;
            overflow: hidden !important;
          }
 
          .orders-top {
            display: flex;
            align-items: center;
            gap: 6px;
            width: 100%;
          }
 
          .back-btn, .home-btn {
            color: #fff;
            opacity: 0.8;
            padding: 4px;
            cursor: pointer;
            flex-shrink: 0;
          }
 
          .orders-top h1 {
            flex: 1;
            font-size: 14px !important;
            font-weight: 800;
            color: #fff;
            margin: 0;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
            min-width: 0;
          }
 
          .consult-btn {
            height: 38px !important;
            padding: 0 10px !important;
            border-radius: 20px !important;
            border: 1px solid #13c985 !important;
            background: rgba(19, 201, 133, 0.05) !important;
            color: #13c985 !important;
            font-size: 11px !important;
            font-weight: 700;
            display: flex;
            align-items: center;
            gap: 4px;
            white-space: nowrap;
            flex-shrink: 0;
          }
 
          .settings-btn {
            height: 38px !important;
            padding: 0 10px !important;
            border-radius: 20px;
            border: 1px solid rgba(255,255,255,0.1);
            background: rgba(255,255,255,0.05);
            color: #fff;
            font-size: 11px;
            font-weight: 700;
            display: flex;
            align-items: center;
            gap: 4px;
            white-space: nowrap;
            flex-shrink: 0;
          }
 
          .status-flow-card {
            background: rgba(255,255,255,0.02);
            border: 1px solid rgba(255,255,255,0.05);
            border-radius: 10px;
            padding: 4px 6px;
            width: 100%;
            overflow: hidden;
            margin: 0 !important;
          }
 
          .flow-scroll {
            display: flex;
            align-items: center;
            gap: 4px;
            overflow-x: auto;
            scrollbar-width: none;
            width: 100%;
            flex-wrap: nowrap !important;
          }
 
          .flow-scroll::-webkit-scrollbar {
            display: none;
          }
 
          .flow-step-container {
            display: flex;
            align-items: center;
            gap: 4px;
          }
 
          .flow-step {
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: space-between;
            min-width: 68px;
            max-width: 68px;
            height: 84px;
            padding: 8px 4px;
            border-radius: 8px;
            transition: all 0.2s;
            position: relative;
            cursor: pointer;
            border: none;
            background: transparent;
          }
 
          .flow-step .icon-container {
            width: 32px;
            height: 32px;
            display: flex;
            align-items: center;
            justify-content: center;
            color: #555;
          }
 
          .flow-step span {
            font-size: 8px;
            line-height: 1.2;
            text-align: center;
            font-weight: 600;
            color: #888;
            width: 100%;
            display: block;
          }
 
          .flow-step.active {
            background: rgba(19, 201, 133, 0.08);
          }
 
          .flow-step.active .icon-container {
            color: #13c985;
          }
 
          .flow-step.active span {
            color: #13c985;
          }
 
          .flow-step.active::after {
            content: '';
            position: absolute;
            bottom: 0px;
            left: 10%;
            right: 10%;
            height: 3px;
            background: #13c985;
            border-radius: 4px;
            box-shadow: 0 0 10px rgba(19, 201, 133, 0.5);
          }
 
          .connector {
            color: rgba(255,255,255,0.05);
            font-size: 10px;
            margin-top: -34px;
            font-weight: 300;
          }
 
          .orders-empty-card {
            flex: 1;
            background: rgba(255,255,255,0.02);
            border: 1px solid rgba(255,255,255,0.05);
            border-radius: 24px;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            padding: 40px 20px;
            margin-bottom: 70px;
          }
 
          .empty-icon-box {
            width: 60px;
            height: 60px;
            display: flex;
            flex-direction: column;
            gap: 4px;
            opacity: 0.3;
            margin-bottom: 24px;
          }
 
          .empty-line {
            height: 6px;
            width: 100%;
            background: #fff;
            border-radius: 2px;
          }
 
          .orders-empty-card h2 {
            font-size: 18px;
            font-weight: 800;
            color: #fff;
            margin-bottom: 8px;
          }
 
          .orders-empty-card p {
            font-size: 13px;
            color: #666;
            text-align: center;
          }
 
          .orders-footer {
            position: relative !important;
            margin-top: auto !important;
            background: rgba(0, 0, 0, 0.4);
            padding: 4px 8px !important;
            display: flex;
            align-items: center;
            justify-content: space-between;
            font-size: 8px;
            text-transform: uppercase;
            letter-spacing: 0.5px;
            border-top: 1px solid rgba(255,255,255,0.05);
            z-index: 10;
            border-radius: 6px;
            bottom: auto !important;
            left: auto !important;
            right: auto !important;
          }
 
          .footer-status {
            display: flex;
            align-items: center;
            gap: 6px;
            color: #666;
            font-weight: 800;
          }
 
          .dot {
            width: 6px;
            height: 6px;
            border-radius: 50%;
            background: #f44336;
          }
 
          .dot.active {
            background: #13c985;
          }
 
          .footer-time {
            color: #13c985;
            font-weight: 900;
            font-size: 11px;
          }
 
          div#root:nth-of-type(1) > div:nth-of-type(1) > main:nth-of-type(1) > div:nth-of-type(2) > div:nth-of-type(1) > div:nth-of-type(1) > main:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(2) > div:nth-of-type(1) {
            width: 376px !important;
            height: 550px !important;
          }
 
          div#root:nth-of-type(1) > div:nth-of-type(1) > main:nth-of-type(1) > div:nth-of-type(2) > div:nth-of-type(1) > div:nth-of-type(3) > div:nth-of-type(1) > main:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(2) > div:nth-of-type(1) {
            margin-left: 3px !important;
            margin-top: 2px !important;
            margin-bottom: -900px !important;
          }
 
          /* Compact Sticky Details Modal on Mobile */
          .details-modal {
            max-height: 92dvh !important;
            max-height: 92vh !important;
            width: 100% !important;
            margin: auto 8px !important;
            border-radius: 16px !important;
          }
 
          .details-modal-header {
            position: sticky !important;
            top: 0 !important;
            background: #121212 !important;
            z-index: 50 !important;
            padding: 12px 16px !important;
            border-bottom: 1px solid rgba(255,255,255,0.05) !important;
          }
 
          .details-modal-content {
            padding: 12px 16px !important;
            gap: 12px !important;
          }
 
          .details-modal-footer {
            position: sticky !important;
            bottom: 0 !important;
            background: #121212 !important;
            z-index: 50 !important;
            padding: 12px 16px !important;
            border-top: 1px solid rgba(255,255,255,0.05) !important;
          }
 
          /* Responsive/Compact Receipt & Ticket Modals on Mobile */
          .receipt-ticket-modal {
            max-height: 92vh !important;
            max-height: 92dvh !important;
            width: 100% !important;
            margin: auto 8px !important;
            border-radius: 16px !important;
            display: flex !important;
            flex-direction: column !important;
            box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.5) !important;
            border-color: rgba(255, 255, 255, 0.1) !important;
          }
 
          .receipt-ticket-modal-header {
            position: sticky !important;
            top: 0 !important;
            background: #121212 !important;
            z-index: 50 !important;
            padding: 12px 16px !important;
            border-bottom: 1px solid rgba(255,255,255,0.05) !important;
            margin-bottom: 0 !important;
          }
 
          .receipt-ticket-modal-content {
            padding: 12px 16px !important;
            flex: 1 !important;
            overflow-y: auto !important;
            max-height: calc(92dvh - 120px) !important;
            border-radius: 0 !important;
            background-color: transparent !important;
          }
 
          .receipt-ticket-modal-footer {
            position: sticky !important;
            bottom: 0 !important;
            background: #121212 !important;
            z-index: 50 !important;
            padding: 12px 16px !important;
            border-top: 1px solid rgba(255,255,255,0.05) !important;
            margin-top: 0 !important;
          }
        }
      ` }} />

      <div className="md:hidden orders-mobile">
        {/* Mobile Search input field in body */}
        <div className="relative group w-full my-0.5 shrink-0">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-500" />
          <input 
            type="text"
            placeholder="Buscar pedido (Nº, Cliente)..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full bg-[#121212] border border-white/5 rounded-lg py-1.5 pl-8 pr-7 text-[10px] font-semibold text-white outline-none focus:border-[#13c985]/30 leading-tight"
          />
          {searchTerm && (
            <button onClick={() => setSearchTerm('')} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-500">
              <X className="w-3 h-3" />
            </button>
          )}
        </div>
 
        {/* Mobile Mini Scrollable KPI row */}
        <div className="flex gap-1.5 overflow-x-auto pb-1 scrollbar-none shrink-0 my-0.5">
          <div className="bg-[#121212]/50 border border-white/5 rounded-lg p-1.5 px-2.5 flex flex-col justify-center min-w-[85px] shrink-0">
            <span className="text-[6.5px] text-zinc-500 uppercase font-black tracking-widest leading-none">Ativos</span>
            <span className="text-[11px] font-black text-white mt-0.5 leading-none">{stats.totalActive} peds</span>
          </div>
          <div className="bg-[#121212]/50 border border-white/5 rounded-lg p-1.5 px-2.5 flex flex-col justify-center min-w-[85px] shrink-0">
            <span className="text-[6.5px] text-zinc-500 uppercase font-black tracking-widest leading-none">Estagnados</span>
            <span className={cn("text-[11px] font-black mt-0.5 leading-none", stats.stagnant > 0 ? "text-red-500 animate-pulse" : "text-zinc-500")}>
              {stats.stagnant} peds
            </span>
          </div>
          <div className="bg-[#121212]/50 border border-white/5 rounded-lg p-1.5 px-2.5 flex flex-col justify-center min-w-[85px] shrink-0">
            <span className="text-[6.5px] text-zinc-500 uppercase font-black tracking-widest leading-none">Média Itens</span>
            <span className="text-[11px] font-black text-teal-400 mt-0.5 leading-none">{stats.avgItems} un</span>
          </div>
          <div className="bg-[#121212]/50 border border-white/5 rounded-lg p-1.5 px-2.5 flex flex-col justify-center min-w-[85px] shrink-0">
            <span className="text-[6.5px] text-zinc-500 uppercase font-black tracking-widest leading-none">Triagem PDV</span>
            <span className="text-[11px] font-black text-amber-500 mt-0.5 leading-none">{stats.waitingSeparation} peds</span>
          </div>
        </div>
 
        {/* Mobile Status scroll selector */}
        <section className="status-flow-card shrink-0">
          <div className="flow-scroll flex items-center gap-1 overflow-x-auto pb-0.5 scrollbar-none flex-nowrap">
            {statuses.map(status => {
              const count = sales.filter(s => s.status === status.id || (status.id === 'entregue' && s.status === 'finalizado')).length;
              const isSelected = selectedStatus === status.id;
              return (
                <button
                  key={status.id}
                  onClick={() => {
                    setSelectedStatus(status.id);
                    setCurrentPage(1);
                  }}
                  className={cn(
                    "px-2 py-1 rounded-lg text-[8.5px] font-black uppercase tracking-wider transition-all whitespace-nowrap border flex items-center gap-1 shrink-0",
                    isSelected 
                      ? "bg-[#13c985] border-[#13c985] text-black shadow-none" 
                      : "bg-[#121212] border-white/5 text-zinc-400 hover:text-white"
                  )}
                >
                  {status.label}
                  <span className={cn(
                    "px-1 rounded-[3px] text-[7.5px] font-mono leading-none py-0.5 shrink-0",
                    isSelected ? "bg-black/15 text-black font-black" : "bg-white/5 text-zinc-500"
                  )}>
                    {count}
                  </span>
                </button>
              );
            })}
          </div>
        </section>
 
        {/* Mobile extra stagnant filter pills */}
        <div className="flex items-center gap-1 py-0.5 overflow-x-auto scrollbar-none shrink-0">
          <span className="text-[7.5px] text-zinc-500 uppercase font-black tracking-wider mr-1 shrink-0">Alertas:</span>
          {[
            { id: 'all', label: 'Todos' },
            { id: 'stagnant', label: '⚠️ Estagnados' },
            { id: 'priority', label: '⚡ Críticos' }
          ].map(p => (
            <button
              key={p.id}
              onClick={() => setFilterMode(p.id as any)}
              className={cn(
                "px-2 py-0.5 rounded text-[8px] font-extrabold uppercase transition-all border shrink-0",
                filterMode === p.id 
                  ? "bg-zinc-800 border-zinc-750 text-white" 
                  : "bg-transparent border-transparent text-zinc-500 hover:text-zinc-450"
              )}
            >
              {p.label}
            </button>
          ))}
        </div>
 
        {/* Mobile content orders list */}
        <main className="orders-list flex-1 overflow-y-auto custom-scrollbar pb-1 text-zinc-300">
          {filteredOrders.length === 0 ? (
            <div className="py-12 flex flex-col items-center justify-center opacity-30">
              <ClipboardList className="w-10 h-10 mb-2 text-zinc-500" />
              <p className="text-[8px] uppercase font-black tracking-widest text-center">Nenhum pedido encontrado</p>
            </div>
          ) : (
            pagedOrders.map(order => renderOrderCard(order, true))
          )}
        </main>
 
        {/* Pagination on mobile */}
        {totalPages > 1 && (
          <div className="p-1.5 px-2.5 border border-white/5 bg-[#121212]/80 rounded-lg flex items-center justify-between shrink-0 shadow-md">
            <span className="text-[8px] font-black text-zinc-400 uppercase tracking-wider leading-none">
              Pág {currentPage}/{totalPages}
            </span>
            <div className="flex gap-1.5">
              <button 
                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                disabled={currentPage === 1}
                className="px-2 py-1 bg-white/5 rounded-md text-[8px] font-black uppercase text-white/50 disabled:opacity-20 transition-all border border-white/5"
              >
                Anterior
              </button>
              <button 
                onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                disabled={currentPage === totalPages}
                className="px-2 py-1 bg-white/5 rounded-md text-[8px] font-black uppercase text-white/50 disabled:opacity-20 transition-all border border-white/5"
              >
                Próximo
              </button>
            </div>
          </div>
        )}
 
        {/* Home/Local environment status bar at page footer */}
        <footer className="orders-footer">
          <div className="footer-status flex items-center gap-1.5">
            <span className={cn("dot", useStore.getState().localNetwork.isActive && "active")}></span>
            <span className="text-[7.5px] font-bold text-zinc-500 font-sans tracking-tight">
              {useStore.getState().localNetwork.isActive ? 'SVR LOCAL ATIVO' : 'SVR LOCAL INATIVO'}
            </span>
          </div>
          <div className="footer-time font-mono text-[9px] leading-none font-bold text-emerald-400">{currentTime}</div>
        </footer>
      </div>


      <div className="hidden md:flex h-full flex-col gap-4 md:overflow-hidden md:max-h-[calc(100vh-140px)]">
        {/* top KPI Indicators row */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3 shrink-0">
          <div className="bg-[#121212] border border-white/5 rounded-2xl p-4 flex items-center justify-between shadow-lg">
            <div>
              <span className="text-[8px] text-zinc-500 uppercase font-black tracking-widest block">Ativos Totais</span>
              <span className="text-xl font-black text-white leading-none mt-1 block">{stats.totalActive}</span>
            </div>
            <div className="w-10 h-10 rounded-xl bg-emerald-500/10 flex items-center justify-center text-[#13c985]">
              <Activity className="w-5 h-5" />
            </div>
          </div>

          <div className="bg-[#121212] border border-white/5 rounded-2xl p-4 flex items-center justify-between shadow-lg relative overflow-hidden group">
            {stats.stagnant > 0 && (
              <div className="absolute top-0 right-0 w-16 h-16 bg-red-650 opacity-[0.03] blur-xl group-hover:scale-150 transition-transform duration-700 rounded-full" />
            )}
            <div>
              <span className="text-[8px] text-zinc-500 uppercase font-black tracking-widest block">Pedidos Parados</span>
              <span className={`text-xl font-black leading-none mt-1 block ${stats.stagnant > 0 ? 'text-red-500 animate-pulse' : 'text-zinc-300'}`}>{stats.stagnant}</span>
            </div>
            <div className={cn(
              "w-10 h-10 rounded-xl flex items-center justify-center transition-colors",
              stats.stagnant > 0 ? "bg-red-500/10 text-red-500" : "bg-zinc-805 text-zinc-500"
            )}>
              <AlertCircle className="w-5 h-5" />
            </div>
          </div>

          <div className="bg-[#121212] border border-white/5 rounded-2xl p-4 flex items-center justify-between shadow-lg">
            <div>
              <span className="text-[8px] text-zinc-500 uppercase font-black tracking-widest block">Média de Itens/Ped</span>
              <span className="text-xl font-black text-teal-400 leading-none mt-1 block">{stats.avgItems}</span>
            </div>
            <div className="w-10 h-10 rounded-xl bg-teal-500/10 flex items-center justify-center text-teal-400">
              <ClipboardList className="w-5 h-5" />
            </div>
          </div>

          <div className="bg-[#121212] border border-white/5 rounded-2xl p-4 flex items-center justify-between shadow-lg">
            <div>
              <span className="text-[8px] text-zinc-500 uppercase font-black tracking-widest block font-sans">Triagem PDV</span>
              <span className="text-xl font-black text-amber-500 leading-none mt-1 block">{stats.waitingSeparation} peds</span>
            </div>
            <div className="w-10 h-10 rounded-xl bg-amber-500/10 flex items-center justify-center text-amber-500">
              <Package className="w-5 h-5" />
            </div>
          </div>

          <div className="bg-[#121212] border border-white/5 rounded-2xl p-4 flex items-center justify-between shadow-lg col-span-2 md:col-span-1">
            <div>
              <span className="text-[8px] text-zinc-500 uppercase font-black tracking-widest block">Fila & Separação</span>
              <span className="text-xl font-black text-purple-400 leading-none mt-1 block">{stats.sentSeparation + stats.inSeparation} peds</span>
            </div>
            <div className="w-10 h-10 rounded-xl bg-purple-500/10 flex items-center justify-center text-purple-400">
              <PackageSearch className="w-5 h-5" />
            </div>
          </div>
        </div>

        {/* View Layout Filter tabs panel */}
        <div className="bg-[#121212] border border-white/5 rounded-2xl p-3 flex flex-col xl:flex-row gap-3 items-center justify-between shrink-0 shadow-inner">
          <div className="flex items-center gap-2 overflow-x-auto w-full xl:flex-1 pb-1 xl:pb-0 scrollbar-none">
            {statuses.map(status => {
              const count = sales.filter(s => s.status === status.id || (status.id === 'entregue' && s.status === 'finalizado')).length;
              const isSelected = selectedStatus === status.id;
              return (
                <button
                  key={status.id}
                  onClick={() => {
                    setSelectedStatus(status.id);
                    setCurrentPage(1);
                  }}
                  className={cn(
                    "px-4 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all whitespace-nowrap border flex items-center gap-2",
                    isSelected 
                      ? "bg-[#13c985] border-[#13c985] text-black shadow-lg shadow-emerald-500/10" 
                      : "bg-white/5 border-white/5 text-zinc-400 hover:text-white"
                  )}
                >
                  <span>{status.label}</span>
                  <span className={cn(
                    "px-1.5 py-0.5 rounded text-[8px] font-mono font-black",
                    isSelected ? "bg-black/20 text-black" : "bg-white/10 text-zinc-305"
                  )}>
                    {count}
                  </span>
                </button>
              );
            })}
          </div>

          <div className="flex flex-wrap items-center gap-3 w-full xl:w-auto shrink-0 justify-end">
            <div className="flex items-center gap-1.5 shrink-0">
              <span className="text-[8px] text-zinc-500 uppercase font-black tracking-widest mr-1">Filtrar por:</span>
              {[
                { id: 'all', label: 'Todos', icon: ClipboardList, color: 'hover:text-white' },
                { id: 'stagnant', label: 'Estagnados', icon: AlertCircle, color: 'text-amber-500 hover:text-amber-400' },
                { id: 'priority', label: 'Alta Prioridade', icon: Sparkles, color: 'text-rose-400 hover:text-rose-300' }
              ].map(m => (
                <button
                  key={m.id}
                  onClick={() => setFilterMode(m.id as any)}
                  className={cn(
                    "px-3 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-wider flex items-center gap-1.5 transition-all border",
                    filterMode === m.id
                      ? "bg-zinc-800 border-zinc-700 text-white"
                      : "bg-transparent border-transparent text-zinc-505 " + m.color
                  )}
                >
                  <m.icon className="w-3.5 h-3.5 shrink-0" />
                  {m.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Orders Grid */}
        <div className="flex-1 overflow-y-auto custom-scrollbar pr-1">
          {filteredOrders.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center opacity-30 py-32">
              <ClipboardList className="w-16 h-16 mb-4 text-zinc-550" />
              <p className="text-[10px] uppercase font-black tracking-widest text-zinc-400">Nenhum pedido localizado nesta etapa</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-4 py-1">
              {pagedOrders.map(order => renderOrderCard(order, false))}
            </div>
          )}
        </div>

        {/* Pagination Controls */}
        {totalPages > 1 && (
          <div className="p-4 border border-white/5 bg-[#121212] rounded-2xl flex items-center justify-between shrink-0 shadow-lg">
            <span className="text-[9px] font-black text-zinc-400 uppercase tracking-widest leading-none">
              Exibindo página {currentPage} de {totalPages} ({filteredOrders.length} pedidos em fila)
            </span>
            <div className="flex gap-2">
              <button 
                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                disabled={currentPage === 1}
                className="px-4 py-2 bg-white/5 rounded-xl text-[9px] font-black uppercase text-white hover:bg-white/10 disabled:opacity-20 transition-all border border-white/5"
              >
                Anterior
              </button>
              <button 
                onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                disabled={currentPage === totalPages}
                className="px-4 py-2 bg-white/5 rounded-xl text-[9px] font-black uppercase text-white hover:bg-white/10 disabled:opacity-20 transition-all border border-white/5"
              >
                Próximo
              </button>
            </div>
          </div>
        )}
      </div>

            {/* Details Modal */}
      <AnimatePresence>
        {selectedOrder && (
          <OrderPanel
            orderId={selectedOrder.id}
            onClose={() => setSelectedOrder(null)}
            isGeneratingPdf={isGeneratingPdf}
            setIsGeneratingPdf={setIsGeneratingPdf}
            isPrinting={isPrinting}
            setIsPrinting={setIsPrinting}
            isDispatching={isDispatchingOrderIds.has(selectedOrder.id)}
            getCombinedTimeline={getCombinedTimeline}
            getStatusLabel={getStatusLabel}
            getStatusInfo={getStatusInfo}
            getClientName={getClientName}
            canShowReceipt={canShowReceipt}
            REVERT_STATUS_MAP={REVERT_STATUS_MAP}
            handleCancelOrder={handleCancelOrder}
            handleRevertStatus={handleRevertStatus}
            handleInitiateDispatch={handleInitiateDispatch}
            setPackagingOrder={setPackagingOrder}
            setIsPackagingConferenceModalOpen={setIsPackagingConferenceModalOpen}
            setDeliveryOrder={setDeliveryOrder}
            setIsDeliveryModalOpen={setIsDeliveryModalOpen}
            handleDownloadCupomPdf={handleDownloadCupomPdf}
            handlePrintCupom={handlePrintCupom}
            handleDownloadOrderLabelsPdfInternal={handleDownloadOrderLabelsPdfInternal}
            handlePrintOrderLabelsInternal={handlePrintOrderLabelsInternal}
            handleDownloadExperiencePdfInternal={handleDownloadExperiencePdfInternal}
            handleGeneratePdfReceipt={handleGeneratePdfReceipt}
            handlePrintReceipt={handlePrintReceipt}
          />
        )}
      </AnimatePresence>

      {/* Recibo Choice Modal */}
      <AnimatePresence>
        {showReceipt && lastDispatchedOrder && (
          <div className="fixed inset-0 z-[250] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }} 
              animate={{ opacity: 1 }} 
              exit={{ opacity: 0 }}
              onClick={() => {
                setShowReceipt(false);
                setLastDispatchedOrder(null);
              }}
              className="absolute inset-0 bg-black/85 backdrop-blur-md" 
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 15 }} 
              animate={{ opacity: 1, scale: 1, y: 0 }} 
              exit={{ opacity: 0, scale: 0.95, y: 15 }} 
              className="relative w-full max-w-sm bg-[#121212] border border-white/10 rounded-[2rem] p-6 shadow-2xl flex flex-col gap-5 text-white"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="w-9 h-9 rounded-xl bg-emerald-500/10 flex items-center justify-center text-emerald-400">
                    <ClipboardList className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-sm font-black uppercase tracking-wider text-white">Recibo do Pedido</h3>
                    <p className="text-[9px] font-mono uppercase tracking-widest text-zinc-500">#{lastDispatchedOrder.orderNumber}</p>
                  </div>
                </div>
                <button 
                  onClick={() => {
                    setShowReceipt(false);
                    setLastDispatchedOrder(null);
                  }}
                  className="p-1.5 hover:bg-white/5 rounded-full transition-all text-white/45 hover:text-white"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="space-y-3 pt-1">
                <p className="text-[10px] uppercase font-black tracking-wider text-zinc-400">Opções do Documento</p>
                <button 
                  onClick={async () => {
                    await handlePrintReceipt(lastDispatchedOrder);
                    setShowReceipt(false);
                    setLastDispatchedOrder(null);
                  }}
                  disabled={isPrinting || isGeneratingPdf}
                  className="w-full h-14 bg-zinc-900 border border-zinc-800 hover:border-emerald-500/40 rounded-2xl flex items-center justify-between px-5 transition-all outline-none group active:scale-95 disabled:opacity-50 disabled:pointer-events-none cursor-pointer"
                >
                  <div className="flex items-center gap-3">
                    <Printer className="w-5 h-5 text-emerald-400 group-hover:scale-110 transition-transform" />
                    <div className="text-left">
                      <span className="text-xs font-black uppercase tracking-wider block">Imprimir Recibo</span>
                      <span className="text-[8.5px] font-bold text-zinc-500 uppercase tracking-tight block">Impressão Térmica Direta</span>
                    </div>
                  </div>
                  <ChevronRight className="w-4 h-4 text-zinc-650 group-hover:text-emerald-400 transition-colors" />
                </button>

                <button 
                  onClick={async () => {
                    await handleGeneratePdfReceipt(lastDispatchedOrder);
                    setShowReceipt(false);
                    setLastDispatchedOrder(null);
                  }}
                  disabled={isPrinting || isGeneratingPdf}
                  className="w-full h-14 bg-zinc-900 border border-zinc-800 hover:border-emerald-500/40 rounded-2xl flex items-center justify-between px-5 transition-all outline-none group active:scale-95 disabled:opacity-50 disabled:pointer-events-none cursor-pointer"
                >
                  <div className="flex items-center gap-3">
                    <FileDown className="w-5 h-5 text-blue-400 group-hover:scale-110 transition-transform" />
                    <div className="text-left">
                      <span className="text-xs font-black uppercase tracking-wider block">Baixar PDF</span>
                      <span className="text-[8.5px] font-bold text-zinc-500 uppercase tracking-tight block">Salvar em PDF no Dispositivo</span>
                    </div>
                  </div>
                  <ChevronRight className="w-4 h-4 text-zinc-650 group-hover:text-amber-400 transition-colors" />
                </button>
              </div>

              <div className="pt-2">
                <button 
                  onClick={() => {
                    setShowReceipt(false);
                    setLastDispatchedOrder(null);
                  }}
                  className="w-full py-3.5 bg-white/5 hover:bg-white/10 rounded-xl text-[10px] font-black uppercase tracking-widest text-zinc-300 transition-all cursor-pointer select-none"
                >
                  Cancelar
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Add Delivery Modal */}
      <AnimatePresence>
        {isDeliveryModalOpen && deliveryOrder && (
          <div className="fixed inset-0 z-[250] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }} 
              animate={{ opacity: 1 }} 
              exit={{ opacity: 0 }}
              onClick={() => setIsDeliveryModalOpen(false)}
              className="absolute inset-0 bg-black/80 backdrop-blur-sm" 
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 10 }} 
              animate={{ opacity: 1, scale: 1, y: 0 }} 
              exit={{ opacity: 0, scale: 0.95, y: 10 }} 
              className="relative w-full max-w-md bg-[#0a0a0a] border border-white/10 rounded-2xl p-6 shadow-2xl"
            >
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-blue-500/10 flex items-center justify-center text-blue-500">
                    <Truck className="w-5 h-5" />
                  </div>
                  <div>
                    <h2 className="text-sm font-black text-white uppercase tracking-widest">
                      Adicionar Entrega
                    </h2>
                    <p className="text-[10px] text-white/30 uppercase font-bold tracking-tight">Pedido #{deliveryOrder.orderNumber}</p>
                  </div>
                </div>
                <button onClick={() => setIsDeliveryModalOpen(false)} className="p-2 hover:bg-white/5 rounded-xl text-white/20 hover:text-white transition-all">
                  <X className="w-5 h-5" />
                </button>
              </div>

              <form 
                onSubmit={(e) => {
                  e.preventDefault();
                  const formData = new FormData(e.currentTarget);
                  const methodId = formData.get('methodId') as string;
                  const trackingCode = formData.get('trackingCode') as string;
                  const notes = formData.get('notes') as string;
                  
                  const method = deliveryMethods.find(m => m.id === methodId);
                  
                  if (method?.requiresTracking && !trackingCode) {
                    alert('Código de rastreio obrigatório para este meio de entrega.');
                    return;
                  }

                  const updatedData: Partial<Sale> = {
                    deliveryMethodId: methodId,
                    deliveryMethodName: method?.name,
                    trackingCode: trackingCode || undefined,
                    deliveryNotes: notes || undefined,
                    deliveryAddedBy: currentUser?.fullName || 'Administrador',
                    deliveryAddedAt: Date.now()
                  };

                  updateSale(deliveryOrder.id, updatedData);
                  
                  const historyMsg = `Entrega adicionada: ${method?.name}${trackingCode ? ` | Rastreio: ${trackingCode}` : ''} | por ${currentUser?.fullName || 'Administrador'} em ${format(new Date(), "dd/MM HH:mm")}.`;
                  addActivity(historyMsg, 'inventory', 'Entrega', currentUser?.fullName || 'Administrador', deliveryOrder.id);
                  
                  setIsDeliveryModalOpen(false);
                  setDeliveryOrder(null);
                  setSelectedOrder(prev => prev?.id === deliveryOrder.id ? { ...prev, ...updatedData } : prev);
                }}
                className="space-y-4"
              >
                <div className="space-y-1.5">
                  <label className="text-[10px] font-black text-white/40 uppercase tracking-widest ml-1">Meio de Entrega</label>
                  <select 
                    name="methodId"
                    required
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-xs text-white focus:border-blue-500/50 outline-none appearance-none"
                    defaultValue={deliveryOrder.deliveryMethodId || 'em-maos'}
                    onChange={(e) => {
                       // Trigger re-render to show/hide tracking input if needed
                       const method = deliveryMethods.find(m => m.id === e.target.value);
                       const trackingInput = document.getElementById('tracking-input-container');
                       if (trackingInput) {
                         trackingInput.style.display = method?.requiresTracking ? 'block' : 'none';
                       }
                    }}
                  >
                    {deliveryMethods.map(m => (
                      <option key={m.id} value={m.id} className="bg-[#121212]">{m.name}</option>
                    ))}
                  </select>
                </div>

                <div 
                  id="tracking-input-container"
                  style={{ display: deliveryMethods.find(m => m.id === (deliveryOrder.deliveryMethodId || 'em-maos'))?.requiresTracking ? 'block' : 'none' }}
                  className="space-y-1.5"
                >
                  <label className="text-[10px] font-black text-white/40 uppercase tracking-widest ml-1">Código de Rastreio</label>
                  <input 
                    name="trackingCode"
                    defaultValue={deliveryOrder.trackingCode}
                    placeholder="EX: BR123456789"
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-xs text-white focus:border-blue-500/50 outline-none"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-[10px] font-black text-white/40 uppercase tracking-widest ml-1">Observação (Opcional)</label>
                  <textarea 
                    name="notes"
                    defaultValue={deliveryOrder.deliveryNotes}
                    placeholder="Informações adicionais para logística..."
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-xs text-white focus:border-blue-500/50 outline-none min-h-[80px] resize-none"
                  />
                </div>

                <div className="flex gap-3 pt-2">
                   <button 
                    type="button"
                    onClick={() => setIsDeliveryModalOpen(false)}
                    className="flex-1 py-4 bg-white/5 hover:bg-white/10 text-white/40 hover:text-white rounded-xl text-[10px] font-black uppercase tracking-[0.2em] transition-all"
                  >
                    Cancelar
                  </button>
                  <button 
                    type="submit"
                    className="flex-[2] py-4 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-[10px] font-black uppercase tracking-[0.2em] shadow-lg shadow-blue-900/20 transition-all"
                  >
                    Vincular Entrega
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <MasterPasswordModal 
        isOpen={isMasterPasswordModalOpen}
        onClose={() => setIsMasterPasswordModalOpen(false)}
        onConfirm={handleConfirmCancel}
        description="Autorização gerencial necessária para cancelar pedidos em andamento."
      />
      <AnimatePresence>
        {isPackagingConferenceModalOpen && packagingOrder && (
          <div className="fixed inset-0 z-[250] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }} 
              animate={{ opacity: 1 }} 
              exit={{ opacity: 0 }}
              onClick={() => setIsPackagingConferenceModalOpen(false)}
              className="absolute inset-0 bg-black/90 backdrop-blur-md" 
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }} 
              animate={{ opacity: 1, scale: 1, y: 0 }} 
              exit={{ opacity: 0, scale: 0.95, y: 20 }} 
              className="relative w-full max-w-2xl bg-[#0a0a0a] border border-white/10 rounded-[2.5rem] shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
            >
              <div className="p-8 border-b border-white/5 flex items-center justify-between shrink-0 bg-black/20">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 bg-orange-500/10 rounded-2xl flex items-center justify-center text-orange-500">
                    <Package className="w-6 h-6" />
                  </div>
                  <div>
                    <h2 className="text-xl font-black text-white uppercase tracking-tight text-white">Conferência para Embalar</h2>
                    <p className="text-[10px] uppercase font-black tracking-[0.3em] text-white/30">Pedido #{packagingOrder.orderNumber} • {getClientName(packagingOrder.clientId)}</p>
                  </div>
                </div>
                <button onClick={() => setIsPackagingConferenceModalOpen(false)} className="p-2 hover:bg-white/5 rounded-full text-white/20 hover:text-white transition-all">
                  <XCircle className="w-6 h-6" />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto p-8 custom-scrollbar space-y-8">
                {/* Items List */}
                <div className="space-y-4">
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="text-[10px] uppercase font-black text-white/40 tracking-[0.2em] flex items-center gap-2">
                      <ClipboardList className="w-3 h-3" /> Itens do Pedido
                    </h3>
                    <div className="flex gap-4">
                       <span className="text-[8px] uppercase font-black text-blue-400 tracking-widest">Pedido</span>
                       <span className="text-[8px] uppercase font-black text-emerald-400 tracking-widest">Separado</span>
                       <span className="text-[8px] uppercase font-black text-red-500 tracking-widest">Faltante</span>
                    </div>
                  </div>
                  <div className="space-y-2">
                    {packagingOrder.items.map((item, idx) => {
                      const total = item.quantity;
                      const separated = item.pickedQuantity !== undefined ? item.pickedQuantity : total;
                      const missing = total - separated;
                      
                      return (
                        <div key={idx} className="bg-white/5 border border-white/5 rounded-2xl p-4 flex items-center justify-between group hover:border-white/10 transition-all">
                          <div className="flex flex-col">
                            <span className="text-xs font-black text-white">{item.name}</span>
                            <span className="text-[9px] font-mono text-white/30">{item.code}</span>
                          </div>
                          <div className="flex items-center gap-8">
                            <div className="w-12 text-center">
                              <span className="text-sm font-black text-blue-400">{total}</span>
                            </div>
                            <div className="w-12 text-center">
                               <span className="text-sm font-black text-emerald-400">{separated}</span>
                            </div>
                            <div className="w-12 text-center">
                               <span className={cn(
                                 "text-sm font-black",
                                 missing > 0 ? "text-red-500" : "text-white/10"
                               )}>{missing}</span>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>



                {/* Logistic Note Warning if any missing */}
                {packagingOrder.items.some(i => (i.quantity - (i.pickedQuantity !== undefined ? i.pickedQuantity : i.quantity)) > 0) && (
                   <div className="p-4 bg-red-500/5 border border-red-500/10 rounded-2xl flex items-center gap-3">
                      <AlertCircle className="w-5 h-5 text-red-500" />
                      <p className="text-[10px] text-red-500 font-bold uppercase leading-relaxed font-black tracking-tight">
                        Este pedido possui itens faltantes. O histórico registrará esta ocorrência ao confirmar.
                      </p>
                   </div>
                )}
              </div>

              <div className="p-8 bg-black/40 border-t border-white/5 flex items-center justify-between shrink-0">
                 <button 
                  onClick={() => setIsPackagingConferenceModalOpen(false)}
                  className="px-8 py-4 bg-white/5 hover:bg-white/10 text-white/40 hover:text-white rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all"
                >
                  Cancelar
                </button>
                <button 
                  onClick={handleConfirmPackaging}
                  className="px-10 py-4 bg-orange-600 hover:bg-orange-500 text-white rounded-2xl text-[10px] font-black uppercase tracking-[0.2em] transition-all shadow-lg shadow-orange-900/20 flex items-center gap-3"
                >
                  <CheckCircle2 className="w-5 h-5" /> Confirmar Embalagem
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Confirmation Modal for Revert Status */}
      <AnimatePresence>
        {orderToRevert && (
          <div className="fixed inset-0 z-[250] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }} 
              animate={{ opacity: 1 }} 
              exit={{ opacity: 0 }}
              onClick={() => setOrderToRevert(null)}
              className="absolute inset-0 bg-black/80 backdrop-blur-sm" 
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }} 
              animate={{ opacity: 1, scale: 1 }} 
              exit={{ opacity: 0, scale: 0.95 }} 
              className="relative bg-[#1a1a1a] border border-white/10 rounded-3xl p-6 shadow-2xl max-w-sm w-full"
            >
              <div className="flex flex-col items-center text-center gap-4">
                <div className="w-16 h-16 bg-amber-500/10 rounded-full flex items-center justify-center text-amber-500">
                  <RotateCcw className="w-8 h-8" />
                </div>
                <div>
                  <h3 className="text-lg font-black text-white uppercase tracking-tight">Voltar Estado?</h3>
                  <p className="text-xs text-white/40 mt-2">
                    Tem certeza que deseja voltar o pedido <span className="text-white font-bold">#{orderToRevert.orderNumber}</span> de <span className="text-white font-bold">{getStatusLabel(orderToRevert.status)}</span> para <span className="text-amber-500 font-bold">{getStatusLabel(REVERT_STATUS_MAP[orderToRevert.status])}</span>?
                  </p>
                </div>
                <div className="grid grid-cols-2 gap-3 w-full mt-2">
                  <button 
                    onClick={() => setOrderToRevert(null)}
                    className="py-3 bg-white/5 hover:bg-white/10 text-white rounded-xl text-[10px] font-black uppercase tracking-widest transition-all"
                  >
                    Cancelar
                  </button>
                  <button 
                    onClick={confirmRevertStatus}
                    className="py-3 bg-amber-500 hover:bg-amber-400 text-black rounded-xl text-[10px] font-black uppercase tracking-widest transition-all shadow-lg shadow-amber-500/20"
                  >
                    Confirmar
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* NEW SEARCH MODAL */}
      <AnimatePresence>
        {isSearchModalOpen && (
          <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }} 
              animate={{ opacity: 1 }} 
              exit={{ opacity: 0 }}
              onClick={() => {
                setIsSearchModalOpen(false);
                setShowQRScanner(false);
              }}
              className="absolute inset-0 bg-black/80 backdrop-blur-xl" 
            />
            
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }} 
              animate={{ opacity: 1, scale: 1, y: 0 }} 
              exit={{ opacity: 0, scale: 0.95, y: 20 }} 
              className="relative w-full max-w-xl bg-[#121212] border border-white/10 rounded-[2.5rem] shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
            >
              <div className="p-8 border-b border-white/10 bg-black/40 flex items-center justify-between">
                <div>
                  <h2 className="text-2xl font-black text-white uppercase tracking-tighter">Consultar Pedido</h2>
                  <p className="text-[10px] uppercase font-black tracking-[0.3em] text-emerald-500/60 mt-1">Localizar e rastrear histórico</p>
                </div>
                <button 
                  onClick={() => {
                    setIsSearchModalOpen(false);
                    setShowQRScanner(false);
                  }}
                  className="p-2.5 hover:bg-white/5 rounded-full transition-all text-white/20 hover:text-white"
                >
                  <X className="w-6 h-6" />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto p-8 custom-scrollbar space-y-6">
                {!searchResult ? (
                  <div className="space-y-6">
                    <div className="space-y-3">
                      <label className="text-[10px] uppercase font-black text-white/30 tracking-widest ml-4">Número ou ID do Pedido</label>
                      <div className="relative group">
                        <Search className="absolute left-5 top-1/2 -translate-y-1/2 w-5 h-5 text-white/20 group-focus-within:text-emerald-500 transition-colors" />
                        <input
                          autoFocus
                          type="text"
                          placeholder="Digite ou escaneie o pedido..."
                          value={searchQuery}
                          onChange={(e) => setSearchQuery(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') handleConsultOrder();
                          }}
                          className="w-full bg-black/60 border border-white/5 group-focus-within:border-emerald-500/50 rounded-2xl py-5 pl-14 pr-6 text-xl font-bold text-white outline-none transition-all placeholder:text-white/10"
                        />
                      </div>
                    </div>

                    {searchError && (
                      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="flex items-center gap-3 p-4 bg-red-500/10 border border-red-500/20 rounded-2xl text-red-500 text-[11px] font-bold uppercase tracking-widest">
                        <AlertCircle className="w-4 h-4 shrink-0" />
                        {searchError}
                      </motion.div>
                    )}

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
                       <button
                         onClick={() => handleConsultOrder()}
                         className="flex items-center justify-center gap-2 py-4 bg-emerald-600 hover:bg-emerald-500 text-black rounded-2xl text-xs font-black uppercase tracking-[0.2em] transition-all shadow-lg active:scale-95"
                       >
                         <Search className="w-4 h-4" /> Consultar
                       </button>
                       <button
                         onClick={() => setShowQRScanner(!showQRScanner)}
                         className={cn(
                           "flex items-center justify-center gap-2 py-4 rounded-2xl text-xs font-black uppercase tracking-[0.2em] transition-all border",
                           showQRScanner ? "bg-indigo-500 border-indigo-500 text-white" : "bg-white/5 border-white/5 text-white hover:bg-white/10"
                         )}
                       >
                         <QrCode className="w-4 h-4" /> {showQRScanner ? "Fechar Câmera" : "Abrir Câmera"}
                       </button>
                    </div>

                    {showQRScanner && (
                      <QRScanner 
                        title="Escanear Pedido"
                        description="Aponte para o QR Code do pedido"
                        onScan={(text) => {
                          onScanSuccess(text);
                        }}
                        onClose={() => setShowQRScanner(false)}
                      />
                    )}
                    
                    <button
                      onClick={() => setIsSearchModalOpen(false)}
                      className="w-full py-4 text-[10px] font-black uppercase tracking-widest text-white/20 hover:text-white transition-all"
                    >
                      Cancelar
                    </button>
                  </div>
                ) : (
                  <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
                    <div className="flex items-center justify-between bg-emerald-500/10 p-4 rounded-2xl border border-emerald-500/20">
                      <div className="flex items-center gap-3">
                         <div className="w-10 h-10 bg-emerald-500 text-black rounded-xl flex items-center justify-center">
                            <Package className="w-6 h-6" />
                         </div>
                         <div>
                            <p className="text-[10px] uppercase font-black text-emerald-500/60 leading-none mb-1">Pedido Localizado</p>
                            <h4 className="text-lg font-black text-white leading-none">#{searchResult.orderNumber}</h4>
                         </div>
                      </div>
                      <button 
                        onClick={() => {
                          setSearchResult(null);
                          setSearchQuery('');
                        }}
                        className="text-[10px] font-black uppercase text-white/20 hover:text-white underline tracking-widest"
                      >
                        Nova Busca
                      </button>
                    </div>

                    {/* Order Details Preview in Modal */}
                    <div className="space-y-4">
                       <div className="grid grid-cols-2 gap-3">
                          <div className="p-3 bg-white/5 rounded-xl border border-white/5">
                             <span className="text-[8px] uppercase font-black text-white/20 block mb-1">Status</span>
                             <span className={cn("text-[10px] font-bold uppercase", getStatusInfo(searchResult.status).color.split(' ')[1])}>
                                {getStatusLabel(searchResult.status)}
                             </span>
                          </div>
                          <div className="p-3 bg-white/5 rounded-xl border border-white/5">
                             <span className="text-[8px] uppercase font-black text-white/20 block mb-1">Total</span>
                             <span className="text-[11px] font-black text-emerald-400 font-mono">
                                R$ {searchResult.total.toFixed(2)}
                             </span>
                          </div>
                       </div>

                       <div className="p-4 bg-white/2 rounded-2xl border border-white/5 italic">
                          <div className="flex items-start gap-3">
                             <AlertCircle className="w-4 h-4 text-white/20 shrink-0 mt-0.5" />
                             <div>
                                <p className="text-[11px] text-white/60 mb-2 font-bold uppercase tracking-tight">O que você deseja fazer?</p>
                                <button 
                                  onClick={() => {
                                    setIsSearchModalOpen(false);
                                    setSelectedOrder(searchResult);
                                  }}
                                  className="w-full flex items-center justify-center gap-2 py-3 bg-white hover:bg-emerald-500 text-black rounded-xl text-[10px] font-black uppercase tracking-widest transition-all"
                                >
                                  Ver Detalhes e Histórico Completo
                                </button>
                             </div>
                          </div>
                       </div>
                    </div>
                  </div>
                )}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </>
  );
}
