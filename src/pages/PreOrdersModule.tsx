import React, { useState, useMemo } from 'react';
import { useStore, PreOrder, Client } from '../store';
import { 
  ClipboardList, 
  Search, 
  Plus, 
  Filter, 
  MoreVertical, 
  Image as ImageIcon, 
  Calendar, 
  User, 
  ArrowRightLeft, 
  CheckCircle2, 
  XCircle, 
  AlertCircle,
  TrendingUp,
  ExternalLink,
  Edit2,
  Clock
} from 'lucide-react';
import { cn } from '../lib/utils';
import { motion, AnimatePresence } from 'framer-motion';

export default function PreOrdersModule() {
  const preOrders = useStore((state) => state.preOrders);
  const clients = useStore((state) => state.clients);
  const addPreOrder = useStore((state) => state.addPreOrder);
  const updatePreOrder = useStore((state) => state.updatePreOrder);
  const convertPreOrderToSale = useStore((state) => state.convertPreOrderToSale);
  const addActivity = useStore((state) => state.addActivity);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [showAddModal, setShowAddModal] = useState(false);
  const [selectedPreOrder, setSelectedPreOrder] = useState<PreOrder | null>(null);

  // Form state
  const [formData, setFormData] = useState({
    clientId: '',
    productDescription: '',
    estimatedValue: '',
    dueDate: '',
    origin: 'WhatsApp',
    notes: '',
    image: ''
  });

  const filteredPreOrders = useMemo(() => {
    return preOrders.filter(po => {
      const client = clients.find(c => c.id === po.clientId);
      const matchesSearch = 
        po.orderCode.toLowerCase().includes(searchTerm.toLowerCase()) ||
        po.productDescription.toLowerCase().includes(searchTerm.toLowerCase()) ||
        client?.name.toLowerCase().includes(searchTerm.toLowerCase());
      
      const matchesStatus = statusFilter === 'all' || po.status === statusFilter;
      
      return matchesSearch && matchesStatus;
    });
  }, [preOrders, clients, searchTerm, statusFilter]);

  const stats = useMemo(() => {
    return {
      total: preOrders.length,
      pending: preOrders.filter(p => ['nova', 'em_analise', 'aguardando_aprovacao'].includes(p.status)).length,
      approved: preOrders.filter(p => p.status === 'aprovada').length,
      converted: preOrders.filter(p => p.status === 'convertida').length,
    };
  }, [preOrders]);

  const getStatusInfo = (status: PreOrder['status']) => {
    switch (status) {
      case 'nova': return { label: 'Nova', color: 'text-blue-400', bg: 'bg-blue-400/10', icon: AlertCircle };
      case 'em_analise': return { label: 'Em Análise', color: 'text-purple-400', bg: 'bg-purple-400/10', icon: Search };
      case 'aguardando_aprovacao': return { label: 'Aguar. Aprovação', color: 'text-amber-400', bg: 'bg-amber-400/10', icon: Clock };
      case 'aprovada': return { label: 'Aprovada', color: 'text-emerald-400', bg: 'bg-emerald-400/10', icon: CheckCircle2 };
      case 'convertida': return { label: 'Convertida', color: 'text-slate-400', bg: 'bg-slate-400/10', icon: ExternalLink };
      case 'cancelada': return { label: 'Cancelada', color: 'text-red-400', bg: 'bg-red-400/10', icon: XCircle };
      default: return { label: status, color: 'text-white', bg: 'bg-white/10', icon: AlertCircle };
    }
  };

  const handleAddPreOrder = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.clientId || !formData.productDescription || !formData.estimatedValue) return;

    addPreOrder({
      clientId: formData.clientId,
      productDescription: formData.productDescription,
      estimatedValue: parseFloat(formData.estimatedValue),
      dueDate: new Date(formData.dueDate).getTime(),
      origin: formData.origin,
      notes: formData.notes,
      image: formData.image || undefined
    });

    setShowAddModal(false);
    setFormData({
      clientId: '',
      productDescription: '',
      estimatedValue: '',
      dueDate: '',
      origin: 'WhatsApp',
      notes: '',
      image: ''
    });
  };

  const handleConvert = (id: string) => {
    if (confirm('Deseja converter esta pré-encomenda em um pedido real?')) {
      convertPreOrderToSale(id);
    }
  };

  return (
    <div className="p-6 space-y-6 max-w-[1600px] mx-auto">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-end gap-4">
        <button 
          onClick={() => setShowAddModal(true)}
          className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-500 text-white px-6 py-3 rounded-2xl font-black uppercase text-xs tracking-widest transition-all shadow-lg shadow-emerald-900/20 active:scale-95"
        >
          <Plus className="w-4 h-4" /> Nova Pré-Encomenda
        </button>
      </div>

      {/* Stats Summary */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: 'Total', value: stats.total, icon: ClipboardList, color: 'text-white' },
          { label: 'Pendentes', value: stats.pending, icon: Clock, color: 'text-amber-400' },
          { label: 'Aprovadas', value: stats.approved, icon: CheckCircle2, color: 'text-emerald-400' },
          { label: 'Convertidas', value: stats.converted, icon: ExternalLink, color: 'text-blue-400' },
        ].map((stat, i) => (
          <div key={i} className="bg-[#121212] border border-white/5 p-4 rounded-2xl flex items-center gap-4">
            <div className={cn("w-12 h-12 rounded-xl bg-white/5 flex items-center justify-center", stat.color)}>
              <stat.icon className="w-6 h-6" />
            </div>
            <div>
              <span className="block text-[10px] font-black uppercase tracking-widest text-white/20 leading-none mb-1">{stat.label}</span>
              <span className="text-2xl font-black text-white leading-none">{stat.value}</span>
            </div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="bg-[#121212] border border-white/5 rounded-3xl p-4 flex flex-col md:flex-row gap-4">
        <div className="flex-1 relative">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-white/20" />
          <input 
            type="text"
            placeholder="Buscar por código, cliente ou descrição..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full bg-black/40 border border-white/10 rounded-2xl py-3 pl-12 pr-4 text-sm text-white focus:border-emerald-500/50 outline-none transition-all placeholder:text-white/10"
          />
        </div>
        <div className="flex items-center gap-2">
          <Filter className="w-4 h-4 text-white/40" />
          <select 
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="bg-black/40 border border-white/10 rounded-2xl py-3 px-4 text-sm text-white focus:border-emerald-500/50 outline-none"
          >
            <option value="all">Todos os Status</option>
            <option value="nova">Novas</option>
            <option value="em_analise">Em Análise</option>
            <option value="aguardando_aprovacao">Aguardando Aprovação</option>
            <option value="aprovada">Aprovadas</option>
            <option value="convertida">Convertidas</option>
            <option value="cancelada">Canceladas</option>
          </select>
        </div>
      </div>

      {/* Grid List */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        <AnimatePresence>
          {filteredPreOrders.map((po) => {
            const statusInfo = getStatusInfo(po.status);
            const client = clients.find(c => c.id === po.clientId);
            
            return (
              <motion.div 
                key={po.id}
                layout
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="bg-[#121212] border border-white/5 rounded-3xl overflow-hidden group hover:border-emerald-500/30 transition-all flex flex-col"
              >
                {/* Image Placeholder or Image */}
                <div className="aspect-video bg-black/40 relative overflow-hidden flex items-center justify-center border-b border-white/5">
                  {po.image ? (
                    <img src={po.image} alt={po.productDescription} className="w-full h-full object-cover" />
                  ) : (
                    <ImageIcon className="w-12 h-12 text-white/5" />
                  )}
                  <div className={cn("absolute top-3 left-3 px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest flex items-center gap-2 backdrop-blur-md border border-white/10", statusInfo.color, statusInfo.bg)}>
                    <statusInfo.icon className="w-3 h-3" />
                    {statusInfo.label}
                  </div>
                  <div className="absolute top-3 right-3 px-2 py-1 bg-black/60 rounded-lg text-[9px] font-mono text-white/40">
                    #{po.orderCode}
                  </div>
                </div>

                <div className="p-5 space-y-4 flex-1 flex flex-col">
                  <div>
                    <h4 className="text-sm font-bold text-white mb-1 line-clamp-1">{po.productDescription}</h4>
                    <div className="flex items-center gap-2 text-white/30 text-[11px]">
                      <User className="w-3 h-3" /> {client?.name || 'Cliente não encontrado'}
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="bg-black/20 p-2 rounded-xl border border-white/5">
                      <span className="block text-[8px] font-black uppercase text-white/20 tracking-widest mb-1">Valor Estimado</span>
                      <span className="text-sm font-mono font-bold text-white">R$ {po.estimatedValue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                    </div>
                    <div className="bg-black/20 p-2 rounded-xl border border-white/5">
                      <span className="block text-[8px] font-black uppercase text-white/20 tracking-widest mb-1">Previsão</span>
                      <span className="text-sm font-mono font-bold text-white">{new Date(po.dueDate).toLocaleDateString()}</span>
                    </div>
                  </div>

                  <div className="mt-auto pt-4 flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1">
                      <TrendingUp className="w-3.5 h-3.5 text-emerald-500" />
                      <span className="text-[10px] font-bold text-emerald-500 uppercase tracking-widest">{po.origin}</span>
                    </div>
                    
                    <div className="flex items-center gap-2">
                      <button 
                        onClick={() => setSelectedPreOrder(po)}
                        className="p-2 hover:bg-white/5 rounded-xl text-white/20 hover:text-white transition-all shadow-sm"
                      >
                        <Edit2 className="w-4 h-4" />
                      </button>
                      {po.status === 'aprovada' && (
                        <button 
                          onClick={() => handleConvert(po.id)}
                          className="bg-emerald-600 hover:bg-emerald-500 text-white p-2 rounded-xl shadow-lg shadow-emerald-900/20 active:scale-95 transition-all"
                          title="Converter em Pedido"
                        >
                          <ArrowRightLeft className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>

      {/* Empty State */}
      {filteredPreOrders.length === 0 && (
        <div className="py-20 flex flex-col items-center justify-center text-center opacity-20">
          <ClipboardList className="w-16 h-16 mb-4" />
          <h3 className="text-xl font-bold uppercase tracking-widest">Nenhuma pré-encomenda</h3>
          <p className="text-sm font-medium">Use o botão superior para começar a registrar orçamentos.</p>
        </div>
      )}

      {/* Add Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/80 backdrop-blur-sm z-0" onClick={() => setShowAddModal(false)} />
          <motion.div 
            initial={{ opacity: 0, scale: 0.9, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            className="relative z-10 w-full max-w-2xl bg-[#121212] border border-white/10 rounded-[40px] overflow-hidden shadow-2xl"
          >
            <div className="p-8 border-b border-white/5">
              <h3 className="text-2xl font-black text-white uppercase tracking-tighter">Nova Pré-Encomenda</h3>
              <p className="text-white/40 text-sm font-medium">Preencha os dados do orçamento abaixo</p>
            </div>

            <form onSubmit={handleAddPreOrder} className="p-8 space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase text-white/30 tracking-widest ml-1">Cliente</label>
                  <select 
                    required
                    value={formData.clientId}
                    onChange={(e) => setFormData({...formData, clientId: e.target.value})}
                    className="w-full bg-black/40 border border-white/10 rounded-2xl p-4 text-sm text-white focus:border-emerald-500/50 outline-none"
                  >
                    <option value="">Selecionar Cliente...</option>
                    {clients.filter(c => c.active).map(c => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase text-white/30 tracking-widest ml-1">Origem</label>
                  <select 
                    value={formData.origin}
                    onChange={(e) => setFormData({...formData, origin: e.target.value})}
                    className="w-full bg-black/40 border border-white/10 rounded-2xl p-4 text-sm text-white focus:border-emerald-500/50 outline-none"
                  >
                    <option value="WhatsApp">WhatsApp</option>
                    <option value="Instagram">Instagram</option>
                    <option value="Loja Física">Loja Física</option>
                    <option value="Site">Site</option>
                    <option value="Outro">Outro</option>
                  </select>
                </div>
                <div className="md:col-span-2 space-y-2">
                  <label className="text-[10px] font-black uppercase text-white/30 tracking-widest ml-1">Produto / Descrição</label>
                  <textarea 
                    required
                    rows={2}
                    value={formData.productDescription}
                    onChange={(e) => setFormData({...formData, productDescription: e.target.value})}
                    placeholder="O que o cliente está buscando?"
                    className="w-full bg-black/40 border border-white/10 rounded-2xl p-4 text-sm text-white focus:border-emerald-500/50 outline-none resize-none"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase text-white/30 tracking-widest ml-1">Valor Estimado</label>
                  <input 
                    required
                    type="number"
                    step="0.01"
                    value={formData.estimatedValue}
                    onChange={(e) => setFormData({...formData, estimatedValue: e.target.value})}
                    className="w-full bg-black/40 border border-white/10 rounded-2xl p-4 text-sm text-white focus:border-emerald-500/50 outline-none"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase text-white/30 tracking-widest ml-1">Data Prevista</label>
                  <input 
                    required
                    type="date"
                    value={formData.dueDate}
                    onChange={(e) => setFormData({...formData, dueDate: e.target.value})}
                    className="w-full bg-black/40 border border-white/10 rounded-2xl p-4 text-sm text-white focus:border-emerald-500/50 outline-none"
                  />
                </div>
                <div className="md:col-span-2 space-y-2">
                  <label className="text-[10px] font-black uppercase text-white/30 tracking-widest ml-1">Observações</label>
                  <input 
                    type="text"
                    value={formData.notes}
                    onChange={(e) => setFormData({...formData, notes: e.target.value})}
                    className="w-full bg-black/40 border border-white/10 rounded-2xl p-4 text-sm text-white focus:border-emerald-500/50 outline-none"
                  />
                </div>
              </div>

              <div className="pt-6 flex justify-end gap-4">
                <button 
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-8 py-4 rounded-2xl text-[10px] font-black uppercase tracking-widest text-white/40 hover:text-white transition-colors"
                >
                  Cancelar
                </button>
                <button 
                  type="submit"
                  className="px-12 py-4 bg-emerald-600 hover:bg-emerald-500 text-white rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all shadow-xl shadow-emerald-900/20 active:scale-95"
                >
                  Criar Pré-Encomenda
                </button>
              </div>
            </form>
          </motion.div>
        </div>
      )}

      {/* Edit Modal / Detail */}
      {selectedPreOrder && (
         <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/80 backdrop-blur-sm z-0" onClick={() => setSelectedPreOrder(null)} />
          <motion.div 
            initial={{ opacity: 0, scale: 0.9, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            className="relative z-10 w-full max-w-xl bg-[#121212] border border-white/10 rounded-[40px] overflow-hidden shadow-2xl"
          >
            <div className="p-8 border-b border-white/5 flex justify-between items-start">
              <div>
                <h3 className="text-2xl font-black text-white uppercase tracking-tighter">Pré-Encomenda #{selectedPreOrder.orderCode}</h3>
                <p className="text-white/40 text-[10px] font-black uppercase tracking-widest mt-1">Status Atual: <span className="text-emerald-500">{getStatusInfo(selectedPreOrder.status).label}</span></p>
              </div>
              <button onClick={() => setSelectedPreOrder(null)} className="p-2 hover:bg-white/5 rounded-full text-white/20 hover:text-white transition-all">
                <XCircle className="w-6 h-6" />
              </button>
            </div>

            <div className="p-8 space-y-8">
              <div className="grid grid-cols-2 gap-4">
                 <div className="space-y-4">
                    <label className="text-[10px] font-black uppercase text-white/30 tracking-widest ml-1">Mudar Status</label>
                    <div className="grid grid-cols-1 gap-2">
                      {['nova', 'em_analise', 'aguardando_aprovacao', 'aprovada', 'cancelada'].map((status) => (
                        <button 
                          key={status}
                          onClick={() => {
                            updatePreOrder(selectedPreOrder.id, { status: status as any });
                            setSelectedPreOrder({...selectedPreOrder, status: status as any});
                          }}
                          className={cn(
                            "py-2 px-4 rounded-xl text-[10px] font-black uppercase tracking-widest border transition-all text-left",
                            selectedPreOrder.status === status 
                              ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-500" 
                              : "bg-white/5 border-transparent text-white/40 hover:bg-white/10"
                          )}
                        >
                          {getStatusInfo(status as any).label}
                        </button>
                      ))}
                    </div>
                 </div>

                 <div className="space-y-6">
                    <div>
                      <span className="block text-[10px] font-black uppercase text-white/30 tracking-widest mb-1">Cliente</span>
                      <span className="text-sm font-bold text-white">{clients.find(c => c.id === selectedPreOrder.clientId)?.name}</span>
                    </div>
                    <div>
                      <span className="block text-[10px] font-black uppercase text-white/30 tracking-widest mb-1">Valor Estimado</span>
                      <span className="text-sm font-mono font-bold text-white">R$ {selectedPreOrder.estimatedValue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                    </div>
                    <div>
                      <span className="block text-[10px] font-black uppercase text-white/30 tracking-widest mb-1">Descrição</span>
                      <p className="text-xs text-white/60 leading-relaxed italic">"{selectedPreOrder.productDescription}"</p>
                    </div>
                    {selectedPreOrder.notes && (
                      <div>
                        <span className="block text-[10px] font-black uppercase text-white/30 tracking-widest mb-1">Obs</span>
                        <p className="text-xs text-white/40">{selectedPreOrder.notes}</p>
                      </div>
                    )}
                 </div>
              </div>

              {selectedPreOrder.status === 'aprovada' && (
                <button 
                  onClick={() => {
                    handleConvert(selectedPreOrder.id);
                    setSelectedPreOrder(null);
                  }}
                  className="w-full py-4 bg-emerald-600 hover:bg-emerald-500 text-white rounded-2xl text-[10px] font-black uppercase tracking-[0.2em] transition-all shadow-xl shadow-emerald-900/40 active:scale-[0.98]"
                >
                  Converter em Pedido Real Agora
                </button>
              )}
            </div>
          </motion.div>
        </div>
      )}
    </div>
  );
}
