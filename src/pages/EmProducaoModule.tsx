import React, { useState, useEffect } from 'react';
import { useStore } from '../store';
import { 
  Play, 
  Pause, 
  CheckCircle2, 
  Clock, 
  User, 
  Hash, 
  Search, 
  AlertTriangle, 
  ExternalLink,
  Tv, 
  Filter, 
  Calendar,
  ChevronRight,
  TrendingUp,
  SlidersHorizontal,
  ChevronDown,
  Info
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

export default function EmProducaoModule() {
  const sales = useStore((state) => state.sales);
  const updateSale = useStore((state) => state.updateSale);
  const updateSaleStatus = useStore((state) => state.updateSaleStatus);
  const currentUser = useStore((state) => state.currentUser);

  // States
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedPriority, setSelectedPriority] = useState<string>('all');
  const [selectedOrigin, setSelectedOrigin] = useState<string>('all');
  const [notesInput, setNotesInput] = useState<Record<string, string>>({});
  const [activeTab, setActiveTab] = useState<'board' | 'list'>('board');
  const [focusedOrder, setFocusedOrder] = useState<string | null>(null);

  // Broadcast Channel for real-time TV panel sync
  const [bc, setBc] = useState<BroadcastChannel | null>(null);

  useEffect(() => {
    const channel = new BroadcastChannel('production-tv-channel');
    setBc(channel);
    
    // Listen for updates from other tabs
    channel.onmessage = (e) => {
      if (e.data && e.data.type === 'PRODUCTION_STATE_UPDATED') {
        // Zustand automatically updates, but we force re-render if necessary
      }
    };

    return () => {
      channel.close();
    };
  }, []);

  const notifyChange = () => {
    if (bc) {
      bc.postMessage({ type: 'PRODUCTION_STATE_UPDATED', timestamp: Date.now() });
    }
  };

  // Filter Sales in Production (primary status === 'em_producao')
  const productionOrders = sales.filter(sale => {
    if (sale.status !== 'em_producao') return false;

    // Search term match (client name, order number)
    const matchesSearch = 
      sale.clientName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      sale.orderNumber.includes(searchTerm);

    // Priority match
    const matchesPriority = 
      selectedPriority === 'all' || 
      sale.productionPriority === selectedPriority;

    // Origin match
    const matchesOrigin = 
      selectedOrigin === 'all' || 
      (sale.origin || 'PDV').toUpperCase() === selectedOrigin.toUpperCase();

    return matchesSearch && matchesPriority && matchesOrigin;
  });

  // Organize by Production Status
  const getOrdersBySubstatus = (substatus: 'em_fila' | 'produzindo' | 'pausado') => {
    return productionOrders.filter(o => (o.productionStatus || 'em_fila') === substatus);
  };

  // Status transitions
  const handleMoveToProduzindo = (saleId: string) => {
    updateSale(saleId, { productionStatus: 'produzindo' });
    notifyChange();
  };

  const handleMoveToPausado = (saleId: string) => {
    updateSale(saleId, { productionStatus: 'pausado' });
    notifyChange();
  };

  const handleFinalizeProduction = (saleId: string) => {
    const userDisplay = currentUser ? currentUser.fullName : 'Operador de Produção';
    // 1. First set secondary production status to finalizado
    updateSale(saleId, { productionStatus: 'finalizado' });
    // 2. Move primary status to aguardando_separacao so it enters default Gestao de Pedidos flow
    updateSaleStatus(
      saleId, 
      'aguardando_separacao', 
      userDisplay, 
      'Produção finalizada com sucesso. Pedido enviado para Separação.'
    );
    notifyChange();
  };

  const handleUpdatePriority = (saleId: string, priority: 'baixa' | 'media' | 'alta') => {
    updateSale(saleId, { productionPriority: priority });
    notifyChange();
  };

  const handleSaveNotes = (saleId: string) => {
    const text = notesInput[saleId] || '';
    updateSale(saleId, { productionNotes: text });
    notifyChange();
  };

  const openTVPanel = () => {
    // Open in a new tab
    window.open('/em-producao-tv', '_blank');
  };

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto text-zinc-100" id="em-producao-viewport">
      {/* Header Panel */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-zinc-950/40 p-6 border border-white/5 rounded-2xl">
        <div>
          <h1 className="text-xl font-black uppercase tracking-wider text-white" id="module-title">
            Módulo Em Produção
          </h1>
          <p className="text-[11px] text-zinc-400 font-medium mt-1 uppercase tracking-wider">
            Painel operacional intermediário para produtos sob produção
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            onClick={openTVPanel}
            className="flex items-center gap-2 bg-amber-600/15 border border-amber-500/30 font-medium text-[10px] text-amber-400 py-2.5 px-4 rounded-xl cursor-pointer hover:bg-amber-600/25 transition-all uppercase tracking-widest shadow-[0_0_15px_rgba(245,158,11,0.1)]"
            id="btn-open-tv-panel"
          >
            <Tv className="w-3.5 h-3.5 animate-pulse" />
            Painel de Transmissão TV
          </button>
        </div>
      </div>

      {/* Control & Search Bar */}
      <div className="bg-zinc-900/60 p-4 border border-white/5 rounded-2xl grid grid-cols-1 lg:grid-cols-4 gap-4 items-center">
        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
          <input
            type="text"
            placeholder="Buscar por cliente ou nº pedido..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full bg-zinc-950/50 border border-white/5 pl-10 pr-4 py-2.5 rounded-xl text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-amber-500/30 transition-all font-mono"
            id="producao-search-input"
          />
        </div>

        {/* Priority Filter */}
        <div className="flex items-center gap-2">
          <span className="text-[9px] uppercase font-bold text-zinc-500">Prioridade:</span>
          <select
            value={selectedPriority}
            onChange={(e) => setSelectedPriority(e.target.value)}
            className="flex-1 bg-zinc-950/50 border border-white/5 py-2 px-3 rounded-xl text-xs text-zinc-300 focus:outline-none focus:border-amber-500/30 transition-all uppercase font-bold"
            id="producao-priority-filter"
          >
            <option value="all">TODAS</option>
            <option value="alta">ALTA</option>
            <option value="media">MÁDIA</option>
            <option value="baixa">BAIXA</option>
          </select>
        </div>

        {/* Origin Filter */}
        <div className="flex items-center gap-2">
          <span className="text-[9px] uppercase font-bold text-zinc-500">Origem:</span>
          <select
            value={selectedOrigin}
            onChange={(e) => setSelectedOrigin(e.target.value)}
            className="flex-1 bg-zinc-950/50 border border-white/5 py-2 px-3 rounded-xl text-xs text-zinc-300 focus:outline-none focus:border-amber-500/30 transition-all uppercase font-bold"
            id="producao-origin-filter"
          >
            <option value="all">TODAS AS ORIGENS</option>
            <option value="PDV">PDV</option>
            <option value="TOTEM">TOTEM</option>
          </select>
        </div>

        {/* Tab Selector */}
        <div className="flex p-0.5 bg-zinc-950/60 rounded-xl border border-white/5">
          <button
            onClick={() => setActiveTab('board')}
            className={`flex-1 py-1.5 text-[9px] font-black uppercase tracking-wider rounded-lg cursor-pointer transition-all ${
              activeTab === 'board' 
                ? 'bg-zinc-800 text-white' 
                : 'text-zinc-400 hover:text-white'
            }`}
          >
            Visual Kanban
          </button>
          <button
            onClick={() => setActiveTab('list')}
            className={`flex-1 py-1.5 text-[9px] font-black uppercase tracking-wider rounded-lg cursor-pointer transition-all ${
              activeTab === 'list' 
                ? 'bg-zinc-800 text-white' 
                : 'text-zinc-400 hover:text-white'
            }`}
          >
            Lista Completa ({productionOrders.length})
          </button>
        </div>
      </div>

      {productionOrders.length === 0 ? (
        <div className="bg-zinc-950/40 border border-white/5 rounded-3xl p-16 text-center space-y-3">
          <Clock className="w-8 h-8 text-zinc-600 mx-auto animate-pulse" />
          <p className="text-[10px] font-black uppercase tracking-widest text-zinc-400">Nenhum pedido em produção</p>
          <p className="text-[9px] uppercase text-zinc-600">Aguardando novos pedidos gerados via PDV ou Totem</p>
        </div>
      ) : activeTab === 'board' ? (
        /* Visual Kanban Board View */
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6" id="kanban-production-board">
          {/* COLUMN: EM FILA */}
          <div className="bg-zinc-950/40 border border-white/5 rounded-2xl p-4 flex flex-col space-y-3">
            <div className="flex justify-between items-center pb-2 border-b border-white/5">
              <span className="text-[10px] uppercase font-black text-amber-500 tracking-wider">
                Em Fila ({getOrdersBySubstatus('em_fila').length})
              </span>
              <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
            </div>

            <div className="space-y-3 overflow-y-auto max-h-[600px] pr-1">
              {getOrdersBySubstatus('em_fila').map(order => (
                <ProductionCard 
                  key={order.id} 
                  order={order}
                  onMoveToActive={() => handleMoveToProduzindo(order.id)}
                  onMoveToPause={() => handleMoveToPausado(order.id)}
                  onFinalize={() => handleFinalizeProduction(order.id)}
                  onUpdatePriority={(p) => handleUpdatePriority(order.id, p)}
                  notesVal={notesInput[order.id] || order.productionNotes || ''}
                  onNotesChange={(v) => setNotesInput(prev => ({ ...prev, [order.id]: v }))}
                  onSaveNotes={() => handleSaveNotes(order.id)}
                  onFocus={() => setFocusedOrder(focusedOrder === order.id ? null : order.id)}
                  isFocused={focusedOrder === order.id}
                />
              ))}
              {getOrdersBySubstatus('em_fila').length === 0 && (
                <p className="text-[9px] text-zinc-600 text-center uppercase py-8">Fila vazia</p>
              )}
            </div>
          </div>

          {/* COLUMN: PRODUZINDO */}
          <div className="bg-zinc-950/40 border border-white/5 rounded-2xl p-4 flex flex-col space-y-3">
            <div className="flex justify-between items-center pb-2 border-b border-white/5">
              <span className="text-[10px] uppercase font-black text-emerald-400 tracking-wider">
                Produzindo ({getOrdersBySubstatus('produzindo').length})
              </span>
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping" />
            </div>

            <div className="space-y-3 overflow-y-auto max-h-[600px] pr-1">
              {getOrdersBySubstatus('produzindo').map(order => (
                <ProductionCard 
                  key={order.id} 
                  order={order}
                  onMoveToActive={() => handleMoveToProduzindo(order.id)}
                  onMoveToPause={() => handleMoveToPausado(order.id)}
                  onFinalize={() => handleFinalizeProduction(order.id)}
                  onUpdatePriority={(p) => handleUpdatePriority(order.id, p)}
                  notesVal={notesInput[order.id] || order.productionNotes || ''}
                  onNotesChange={(v) => setNotesInput(prev => ({ ...prev, [order.id]: v }))}
                  onSaveNotes={() => handleSaveNotes(order.id)}
                  onFocus={() => setFocusedOrder(focusedOrder === order.id ? null : order.id)}
                  isFocused={focusedOrder === order.id}
                />
              ))}
              {getOrdersBySubstatus('produzindo').length === 0 && (
                <p className="text-[9px] text-zinc-600 text-center uppercase py-8">Nenhum pedido em produção ativa</p>
              )}
            </div>
          </div>

          {/* COLUMN: PAUSADO */}
          <div className="bg-zinc-950/40 border border-white/5 rounded-2xl p-4 flex flex-col space-y-3">
            <div className="flex justify-between items-center pb-2 border-b border-white/5">
              <span className="text-[10px] uppercase font-black text-zinc-400 tracking-wider">
                Pausado ({getOrdersBySubstatus('pausado').length})
              </span>
              <span className="w-1.5 h-1.5 rounded-full bg-red-500" />
            </div>

            <div className="space-y-3 overflow-y-auto max-h-[600px] pr-1">
              {getOrdersBySubstatus('pausado').map(order => (
                <ProductionCard 
                  key={order.id} 
                  order={order}
                  onMoveToActive={() => handleMoveToProduzindo(order.id)}
                  onMoveToPause={() => handleMoveToPausado(order.id)}
                  onFinalize={() => handleFinalizeProduction(order.id)}
                  onUpdatePriority={(p) => handleUpdatePriority(order.id, p)}
                  notesVal={notesInput[order.id] || order.productionNotes || ''}
                  onNotesChange={(v) => setNotesInput(prev => ({ ...prev, [order.id]: v }))}
                  onSaveNotes={() => handleSaveNotes(order.id)}
                  onFocus={() => setFocusedOrder(focusedOrder === order.id ? null : order.id)}
                  isFocused={focusedOrder === order.id}
                />
              ))}
              {getOrdersBySubstatus('pausado').length === 0 && (
                <p className="text-[9px] text-zinc-600 text-center uppercase py-8">Sem pedidos pausados</p>
              )}
            </div>
          </div>
        </div>
      ) : (
        /* Full Layout List View */
        <div className="bg-zinc-950/40 border border-white/5 rounded-2xl overflow-hidden">
          <table className="w-full text-left text-xs text-zinc-300">
            <thead className="bg-zinc-950 text-zinc-400 text-[9px] uppercase tracking-wider border-b border-white/5">
              <tr>
                <th className="py-4 px-6">Pedido</th>
                <th className="py-4 px-6">Cliente</th>
                <th className="py-4 px-6">Itens</th>
                <th className="py-4 px-6">Prioridade</th>
                <th className="py-4 px-6">Status Interno</th>
                <th className="py-4 px-6 text-right">Ação</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {productionOrders.map(sale => {
                const sub = sale.productionStatus || 'em_fila';
                return (
                  <tr key={sale.id} className="hover:bg-white/[0.01]">
                    <td className="py-4 px-6 font-mono text-white font-bold">
                      #{sale.orderNumber}
                      <span className="block text-[8px] text-zinc-500 font-sans mt-0.5">{sale.origin || 'PDV'}</span>
                    </td>
                    <td className="py-4 px-6 font-black uppercase text-white/90">
                      {sale.clientName}
                    </td>
                    <td className="py-4 px-6">
                      <span className="bg-zinc-800/60 text-[9px] font-bold px-2 py-1 rounded">
                        {sale.items.length} ITENS
                      </span>
                    </td>
                    <td className="py-4 px-6">
                      <span className={`inline-block py-0.5 px-2 rounded-full text-[8px] font-black uppercase ${
                        sale.productionPriority === 'alta' ? 'bg-red-950 text-red-400 border border-red-500/20' :
                        sale.productionPriority === 'media' ? 'bg-amber-950 text-amber-500 border border-amber-500/20' :
                        'bg-zinc-900 text-zinc-400'
                      }`}>
                        {sale.productionPriority || 'média'}
                      </span>
                    </td>
                    <td className="py-4 px-6">
                      <span className={`inline-block py-0.5 px-2 rounded text-[8px] font-black uppercase ${
                        sub === 'produzindo' ? 'bg-emerald-950 text-emerald-400 border border-emerald-500/20' :
                        sub === 'pausado' ? 'bg-red-950 text-red-500 border border-red-500/20' :
                        'bg-amber-950 text-amber-500'
                      }`}>
                        {sub === 'em_fila' ? 'EM FILA' : sub === 'pausado' ? 'PAUSADO' : 'PRODUZINDO'}
                      </span>
                    </td>
                    <td className="py-4 px-6 text-right space-x-1.5">
                      {sub === 'em_fila' && (
                        <button
                          onClick={() => handleMoveToProduzindo(sale.id)}
                          className="bg-emerald-600 hover:bg-emerald-500 text-white text-[8px] font-black uppercase py-1 px-2.5 rounded-lg cursor-pointer inline-flex items-center gap-1"
                        >
                          <Play className="w-2.5 h-2.5 fill-white" /> Iniciar
                        </button>
                      )}
                      {sub === 'produzindo' && (
                        <button
                          onClick={() => handleMoveToPausado(sale.id)}
                          className="bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-[8px] font-black uppercase py-1 px-2.5 rounded-lg cursor-pointer inline-flex items-center gap-1"
                        >
                          <Pause className="w-2.5 h-2.5" /> Pausar
                        </button>
                      )}
                      {sub === 'pausado' && (
                        <button
                          onClick={() => handleMoveToProduzindo(sale.id)}
                          className="bg-emerald-600 hover:bg-emerald-500 text-white text-[8px] font-black uppercase py-1 px-2.5 rounded-lg cursor-pointer inline-flex items-center gap-1"
                        >
                          <Play className="w-2.5 h-2.5 fill-white" /> Retomar
                        </button>
                      )}
                      <button
                        onClick={() => handleFinalizeProduction(sale.id)}
                        className="bg-zinc-150 hover:bg-white text-zinc-950 text-[8px] font-black uppercase py-1 px-2.5 rounded-lg cursor-pointer inline-flex items-center gap-1"
                      >
                        <CheckCircle2 className="w-2.5 h-2.5 text-zinc-900" /> Finalizar
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/* Internal Card Component for Board list */
interface ProductionCardProps {
  key?: string;
  order: any;
  onMoveToActive: () => void;
  onMoveToPause: () => void;
  onFinalize: () => void;
  onUpdatePriority: (p: 'baixa' | 'media' | 'alta') => void;
  notesVal: string;
  onNotesChange: (val: string) => void;
  onSaveNotes: () => void;
  onFocus: () => void;
  isFocused: boolean;
}

function ProductionCard({
  order,
  onMoveToActive,
  onMoveToPause,
  onFinalize,
  onUpdatePriority,
  notesVal,
  onNotesChange,
  onSaveNotes,
  onFocus,
  isFocused
}: ProductionCardProps) {
  const [showNotesForm, setShowNotesForm] = useState(false);
  const status = order.productionStatus || 'em_fila';
  const priority = order.productionPriority || 'media';

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      className={`bg-zinc-900/90 border rounded-2xl p-4.5 space-y-3 transition-shadow hover:shadow-[0_4px_20px_rgba(0,0,0,0.5)] ${
        isFocused ? 'ring-1 ring-amber-500/50' : ''
      } ${
        priority === 'alta'
          ? 'border-red-500/20 shadow-[inset_0_1px_3px_rgba(239,68,68,0.05)]'
          : priority === 'media'
          ? 'border-amber-500/20'
          : 'border-white/5'
      }`}
    >
      {/* Top section: ID, Origin, DateTime */}
      <div className="flex justify-between items-start">
        <div className="flex items-center gap-1.5">
          <span className="text-[12px] font-bold font-mono text-zinc-400">#{order.orderNumber}</span>
          <span className={`text-[8px] font-black uppercase py-0.5 px-1.5 rounded-md ${
            order.origin === 'Totem' ? 'bg-amber-600/10 text-amber-400' : 'bg-emerald-600/10 text-emerald-400'
          }`}>
            {order.origin || 'PDV'}
          </span>
        </div>

        <span className="text-[8px] text-zinc-500 font-mono flex items-center gap-1">
          <Clock className="w-2.5 h-2.5 text-zinc-600" />
          {order.date ? order.date.split(' ')[1] || order.date : 'Agora'}
        </span>
      </div>

      {/* Client Name */}
      <div>
        <span className="text-[8px] text-zinc-500 uppercase font-black block">Cliente</span>
        <span className="text-[11px] font-black uppercase text-white tracking-wide block truncate">
          {order.clientName || 'Consumidor Final'}
        </span>
      </div>

      {/* Items Count and Total Value */}
      <div className="grid grid-cols-2 gap-2 bg-zinc-950/40 p-2.5 rounded-xl border border-white/5 font-mono">
        <div>
          <span className="text-[7px] text-zinc-500 uppercase font-black block">Produtos</span>
          <span className="text-[10px] font-bold text-zinc-300">{order.items.length} Itens</span>
        </div>
        <div>
          <span className="text-[7px] text-zinc-500 uppercase font-black block">Total</span>
          <span className="text-[10px] font-bold text-zinc-300">R$ {order.total.toFixed(2)}</span>
        </div>
      </div>

      {/* Render Items if Focused */}
      <div className="cursor-pointer" onClick={onFocus}>
        <div className="flex justify-between items-center text-[7.5px] text-zinc-500 uppercase font-black tracking-wider pb-1 hover:text-zinc-300">
          <span>{isFocused ? 'Ocultar Detalhes' : 'Ver Detalhes'}</span>
          {isFocused ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
        </div>

        <AnimatePresence>
          {isFocused && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="overflow-hidden space-y-2 pt-2 border-t border-white/5"
            >
              <div className="space-y-1.5 max-h-[140px] overflow-y-auto pr-1">
                {order.items.map((item: any, idx: number) => (
                  <div key={idx} className="flex justify-between items-center text-[9px] text-zinc-400 bg-zinc-950/20 p-1.5 rounded-lg border border-white/[0.02]">
                    <div className="truncate pr-2 font-mono flex items-center gap-1.5">
                      <span className="text-zinc-650 font-black">x{item.quantity}</span>
                      <span className="font-sans font-bold text-zinc-300 uppercase">{item.name}</span>
                    </div>
                  </div>
                ))}
              </div>
              
              {/* Priority Toggle Buttons */}
              <div className="space-y-1 pt-1">
                <span className="text-[7.5px] uppercase font-black text-zinc-550 block">Sinalizar Prioridade:</span>
                <div className="flex gap-1">
                  {['baixa', 'media', 'alta'].map((p) => (
                    <button
                      key={p}
                      onClick={(e) => {
                        e.stopPropagation();
                        onUpdatePriority(p as any);
                      }}
                      className={`flex-1 py-1 px-1 rounded-md text-[7px] font-black uppercase border cursor-pointer ${
                        priority === p
                          ? p === 'alta'
                            ? 'bg-red-600/10 border-red-500/30 text-red-400 font-extrabold'
                            : p === 'media'
                            ? 'bg-amber-600/10 border-amber-500/30 text-amber-500 font-extrabold'
                            : 'bg-zinc-800 border-zinc-700 text-zinc-200'
                          : 'bg-zinc-950/30 border-transparent text-zinc-550 hover:text-white'
                      }`}
                    >
                      {p === 'media' ? 'média' : p}
                    </button>
                  ))}
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {order.productionNotes && (
        <div className="bg-amber-500/5 p-2 rounded-xl border border-amber-500/10 text-[8.5px] text-zinc-400 mb-1 flex gap-1.5">
          <Info className="w-3.5 h-3.5 text-amber-500 shrink-0" />
          <p className="leading-relaxed">
            <strong className="text-amber-500 uppercase mr-1">Observação:</strong> {order.productionNotes}
          </p>
        </div>
      )}

      {/* Action panel */}
      <div className="pt-2 border-t border-white/5 space-y-2">
        <div className="flex gap-1.5">
          {status === 'em_fila' && (
            <button
              onClick={onMoveToActive}
              className="flex-1 bg-emerald-600 hover:bg-emerald-500 text-white text-[8px] font-black uppercase py-2 rounded-xl cursor-pointer flex justify-center items-center gap-1.5 active:scale-95 transition-all shadow-[0_2px_10px_rgba(16,185,129,0.1)]"
            >
              <Play className="w-3 h-3 fill-white" />
              PRODUZIR
            </button>
          )}

          {status === 'produzindo' && (
            <button
              onClick={onMoveToPause}
              className="flex-1 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-[8px] font-black uppercase py-2 rounded-xl cursor-pointer flex justify-center items-center gap-1.5 active:scale-95 transition-all"
            >
              <Pause className="w-3 h-3" />
              PAUSAR
            </button>
          )}

          {status === 'pausado' && (
            <button
              onClick={onMoveToActive}
              className="flex-1 bg-emerald-600 hover:bg-emerald-500 text-white text-[8px] font-black uppercase py-2 rounded-xl cursor-pointer flex justify-center items-center gap-1.5 active:scale-95 transition-all shadow-[0_2px_10px_rgba(16,185,129,0.1)]"
            >
              <Play className="w-3 h-3 fill-white" />
              RETOMAR
            </button>
          )}

          <button
            onClick={onFinalize}
            className="flex-1 bg-zinc-150 hover:bg-white text-zinc-950 text-[8px] font-black uppercase py-2 rounded-xl cursor-pointer flex justify-center items-center gap-1.5 active:scale-95 transition-all"
          >
            <CheckCircle2 className="w-3 h-3 text-zinc-950" />
            FINALIZAR
          </button>
        </div>

        {/* Notes editor */}
        <div>
          {showNotesForm ? (
            <div className="space-y-1.5 mt-2 transition-all">
              <textarea
                placeholder="Adicionar observação interna de fabricação..."
                value={notesVal}
                onChange={(e) => onNotesChange(e.target.value)}
                className="w-full bg-zinc-950/60 border border-white/5 p-2 rounded-xl text-[9px] text-white focus:outline-none focus:border-amber-500/35 leading-relaxed"
                rows={2}
              />
              <div className="flex gap-1.5">
                <button
                  type="button"
                  onClick={onSaveNotes}
                  className="flex-1 bg-amber-600 hover:bg-amber-500 text-white text-[7.5px] font-black uppercase py-1 px-2 rounded-lg cursor-pointer"
                >
                  Salvar Observação
                </button>
                <button
                  type="button"
                  onClick={() => setShowNotesForm(false)}
                  className="bg-zinc-800 hover:bg-zinc-700 text-zinc-400 text-[7.5px] font-black uppercase py-1 px-2 rounded-lg cursor-pointer"
                >
                  Cancelar
                </button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => setShowNotesForm(true)}
              className="text-[7px] text-zinc-550 uppercase font-black hover:text-zinc-300 transition-colors w-full text-center block pt-1 cursor-pointer"
            >
              [ + Adicionar Notas de Observação ]
            </button>
          )}
        </div>
      </div>
    </motion.div>
  );
}
