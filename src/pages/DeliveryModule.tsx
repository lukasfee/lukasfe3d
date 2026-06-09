import React, { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Truck, 
  Search, 
  Package, 
  User, 
  MapPin, 
  Clock, 
  CheckCircle2, 
  AlertTriangle, 
  X,
  Plus,
  Edit2,
  Trash2,
  ExternalLink,
  ShieldCheck,
  ClipboardList
} from 'lucide-react';
import { cn } from '../lib/utils';
import { useStore, Sale, DeliveryMethod } from '../store';
import { operationalValidationService } from '../services/operationalValidationService';

export default function DeliveryModule() {
  const sales = useStore((state) => state.sales);
  const clients = useStore((state) => state.clients);
  const deliveryMethods = useStore((state) => state.deliveryMethods);
  const addDeliveryMethod = useStore((state) => state.addDeliveryMethod);
  const updateDeliveryMethod = useStore((state) => state.updateDeliveryMethod);
  const deleteDeliveryMethod = useStore((state) => state.deleteDeliveryMethod);
  const updateSaleStatus = useStore((state) => state.updateSaleStatus);
  const currentUser = useStore((state) => state.currentUser);
  
  const [activeTab, setActiveTab] = useState<string>(deliveryMethods[0]?.id || 'em-maos');
  const [searchTerm, setSearchTerm] = useState('');
  const [showConfigModal, setShowConfigModal] = useState(false);
  const [editingMethod, setEditingMethod] = useState<DeliveryMethod | null>(null);

  // Stats
  const activeMethod = deliveryMethods.find(m => m.id === activeTab);

  const filteredOrders = useMemo(() => {
    return sales.filter(sale => {
      const isCorrectMethod = (sale.deliveryMethodId === activeTab) || 
                            (activeTab === 'em-maos' && !sale.deliveryMethodId);
      
      if (!isCorrectMethod) return false;

      const isCorrectStatus = !['cancelado', 'finalizado'].includes(sale.status);
      if (!isCorrectStatus) return false;

      const client = clients.find(c => c.id === sale.clientId);
      const searchMatch = 
        sale.orderNumber.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (client?.name || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
        (sale.trackingCode || '').toLowerCase().includes(searchTerm.toLowerCase());

      return searchMatch;
    });
  }, [sales, activeTab, searchTerm, clients]);

  const handleSaveMethod = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const methodData = {
      name: formData.get('name') as string,
      description: formData.get('description') as string,
      requiresTracking: formData.get('requiresTracking') === 'on',
      active: true
    };

    if (editingMethod) {
      updateDeliveryMethod(editingMethod.id, methodData);
    } else {
      addDeliveryMethod(methodData);
    }

    setShowConfigModal(false);
    setEditingMethod(null);
  };

  return (
    <div className="h-full flex flex-col gap-4">
      {/* Header */}
      <div className="flex flex-col md:flex-row items-center justify-between gap-4 px-2">
        <div>
          <h1 className="text-xl font-black uppercase tracking-tighter flex items-center gap-2 text-white">
            <Truck className="w-6 h-6 text-blue-500" /> Meios de Entrega
          </h1>
          <p className="text-[8px] uppercase font-black tracking-[0.3em] text-white/30 leading-none mt-1">Configuração e Monitoramento</p>
        </div>

        <button 
          onClick={() => {
            setEditingMethod(null);
            setShowConfigModal(true);
          }}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-[10px] font-black uppercase tracking-widest transition-all shadow-lg shadow-blue-900/20"
        >
          <Plus className="w-4 h-4" /> Cadastrar nova entrega
        </button>
      </div>

      {/* Tabs and Management */}
      <div className="flex flex-col gap-4 flex-1 min-h-0">
        <div className="bg-[#121212] border border-white/5 rounded-xl p-2 flex flex-col gap-4 shrink-0 shadow-inner mx-2">
          {/* Tabs Scrolling */}
          <div className="flex p-0.5 bg-black/40 rounded-lg border border-white/5 overflow-x-auto no-scrollbar gap-1">
            {deliveryMethods.map((method) => (
              <button
                key={method.id}
                onClick={() => setActiveTab(method.id)}
                className={cn(
                  "px-4 py-2 rounded-md text-[9px] font-black uppercase tracking-widest transition-all whitespace-nowrap flex items-center gap-2",
                  activeTab === method.id 
                    ? "bg-blue-600 text-white" 
                    : "text-white/20 hover:text-white/40 hover:bg-white/5"
                )}
              >
                {method.name}
                {!method.active && <span className="w-1.5 h-1.5 rounded-full bg-red-500" />}
              </button>
            ))}
          </div>

          <div className="flex flex-col lg:flex-row items-center gap-3">
             <div className="relative flex-1 w-full">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-white/20 w-3.5 h-3.5" />
              <input 
                type="text" 
                placeholder="Buscar por pedido, cliente ou rastreio..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full bg-black/40 border border-white/5 rounded-lg py-2 pl-9 pr-4 text-xs text-white focus:border-blue-500/50 outline-none transition-all placeholder:text-white/10"
              />
            </div>
            
            {activeMethod && !activeMethod.isDefault && (
              <div className="flex items-center gap-2">
                <button 
                  onClick={() => {
                    setEditingMethod(activeMethod);
                    setShowConfigModal(true);
                  }}
                  className="p-2 bg-white/5 hover:bg-white/10 text-white/40 hover:text-white rounded-lg transition-all"
                >
                  <Edit2 className="w-3.5 h-3.5" />
                </button>
                <button 
                  onClick={() => {
                    if (confirm('Deseja excluir este meio de entrega?')) {
                      deleteDeliveryMethod(activeMethod.id);
                      setActiveTab('em-maos');
                    }
                  }}
                  className="p-2 bg-white/5 hover:bg-red-500/20 text-white/40 hover:text-red-500 rounded-lg transition-all"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Orders Listing */}
        <div className="flex-1 overflow-y-auto no-scrollbar px-2">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
            {filteredOrders.map(order => {
              const client = clients.find(c => c.id === order.clientId);
              return (
                <motion.div
                  layout
                  key={order.id}
                  className="bg-[#121212] border border-white/5 rounded-xl p-4 space-y-4 hover:border-white/10 transition-all group"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex flex-col">
                      <span className="text-[10px] font-black text-white/20 uppercase tracking-widest">Pedido</span>
                      <span className="text-sm font-black text-white">#{order.orderNumber}</span>
                    </div>
                    <div className={cn(
                      "px-2 py-0.5 rounded text-[8px] font-black uppercase tracking-widest",
                      order.status === 'entregue' ? "bg-emerald-500/10 text-emerald-500" : "bg-blue-500/10 text-blue-500"
                    )}>
                      {order.status.replace('_', ' ')}
                    </div>
                  </div>

                  <div>
                    <span className="text-[8px] font-black text-white/10 uppercase tracking-widest block mb-1">Cliente</span>
                    <p className="text-xs font-bold text-white/70 truncate">{client?.name || 'Consumidor Final'}</p>
                    <p className="text-[9px] text-white/30 truncate">{client?.city} - {client?.state}</p>
                  </div>

                  {order.trackingCode && (
                    <div className="bg-black/40 border border-white/5 rounded-lg p-3 group/track relative">
                      <span className="text-[8px] font-black text-blue-500 uppercase tracking-widest block mb-1">Cód. Rastreio</span>
                      <p className="text-[11px] font-mono font-bold text-white select-all">{order.trackingCode}</p>
                      <button className="absolute right-2 top-1/2 -translate-y-1/2 opacity-0 group-hover/track:opacity-100 p-1.5 hover:bg-blue-600 rounded text-white transition-all">
                        <ExternalLink className="w-3 h-3" />
                      </button>
                    </div>
                  )}

                  {/* Fluxo da Entrega */}
                  <div className="bg-black/20 border border-white/5 rounded-xl p-2.5 space-y-2">
                    <span className="text-[7.5px] font-black text-white/40 uppercase tracking-widest block font-sans">Ações Logísticas</span>
                    {operationalValidationService.validateStatusTransition(order, 'em_rota').valid && (
                      <button 
                        onClick={() => updateSaleStatus(order.id, 'em_rota', currentUser?.fullName || 'Logística')}
                        className="w-full bg-blue-600/20 hover:bg-blue-600 text-blue-400 hover:text-white border border-blue-500/10 hover:border-blue-500 font-bold py-1.5 px-3 rounded-lg text-[9px] uppercase tracking-wider transition-all flex items-center justify-center gap-1 cursor-pointer"
                      >
                        <Truck className="w-3 h-3" /> Despachar (Em Rota)
                      </button>
                    )}
                    {operationalValidationService.validateStatusTransition(order, 'entregue').valid && (
                      <button 
                        onClick={() => updateSaleStatus(order.id, 'entregue', currentUser?.fullName || 'Logística')}
                        className="w-full bg-emerald-600/20 hover:bg-emerald-600 text-emerald-400 hover:text-white border border-emerald-500/10 hover:border-emerald-500 font-bold py-1.5 px-3 rounded-lg text-[9px] uppercase tracking-wider transition-all flex items-center justify-center gap-1 cursor-pointer"
                      >
                        <CheckCircle2 className="w-3 h-3" /> Entregue
                      </button>
                    )}
                    {operationalValidationService.validateStatusTransition(order, 'finalizado').valid && (
                      <button 
                        onClick={() => updateSaleStatus(order.id, 'finalizado', currentUser?.fullName || 'Logística')}
                        className="w-full bg-[#121212] hover:bg-white/5 text-white/50 hover:text-white border border-white/10 font-bold py-1.5 px-3 rounded-lg text-[9px] uppercase tracking-wider transition-all flex items-center justify-center gap-1 cursor-pointer"
                      >
                        <ShieldCheck className="w-3 h-3" /> Finalizar Pedido
                      </button>
                    )}
                  </div>

                  <div className="pt-2 border-t border-white/5 flex items-center justify-between text-[8px] font-black text-white/20 uppercase tracking-widest">
                    <div className="flex items-center gap-1.5">
                      <Clock className="w-3 h-3" /> {new Date(order.timestamp).toLocaleDateString()}
                    </div>
                    {order.deliveryAddedBy && (
                       <div className="flex items-center gap-1.5">
                         <User className="w-3 h-3" /> {order.deliveryAddedBy}
                       </div>
                    )}
                  </div>
                </motion.div>
              );
            })}
            
            {filteredOrders.length === 0 && (
              <div className="col-span-full py-20 flex flex-col items-center justify-center text-white/5 gap-4">
                <Package className="w-16 h-16" />
                <p className="text-[10px] uppercase font-black tracking-[0.3em]">Nenhum pedido nesta categoria</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Config Modal */}
      <AnimatePresence>
        {showConfigModal && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }} 
              animate={{ opacity: 1 }} 
              exit={{ opacity: 0 }}
              onClick={() => setShowConfigModal(false)}
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
                      {editingMethod ? 'Editar Entrega' : 'Cadastrar Entrega'}
                    </h2>
                    <p className="text-[10px] text-white/30 uppercase font-bold tracking-tight">Defina os parâmetros do meio de envio</p>
                  </div>
                </div>
                <button onClick={() => setShowConfigModal(false)} className="p-2 hover:bg-white/5 rounded-xl text-white/20 hover:text-white transition-all">
                  <X className="w-5 h-5" />
                </button>
              </div>

              <form onSubmit={handleSaveMethod} className="space-y-4">
                <div className="space-y-1.5">
                  <label className="text-[10px] font-black text-white/40 uppercase tracking-widest ml-1">Nome do meio de envio</label>
                  <input 
                    name="name"
                    required
                    defaultValue={editingMethod?.name}
                    placeholder="Ex: Shopee, Correios, Azul Cargo"
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-xs text-white focus:border-blue-500/50 outline-none"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-[10px] font-black text-white/40 uppercase tracking-widest ml-1">Descrição (Opcional)</label>
                  <textarea 
                    name="description"
                    defaultValue={editingMethod?.description}
                    placeholder="Controle de postagem interna..."
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-xs text-white focus:border-blue-500/50 outline-none min-h-[80px] resize-none"
                  />
                </div>

                <label className="flex items-center gap-3 bg-white/5 border border-white/10 rounded-xl p-4 cursor-pointer group hover:bg-white/10 transition-all">
                  <div className="relative flex items-center">
                    <input 
                      name="requiresTracking"
                      type="checkbox" 
                      defaultChecked={editingMethod?.requiresTracking}
                      className="peer hidden"
                    />
                    <div className="w-5 h-5 border-2 border-white/10 rounded transition-all peer-checked:bg-blue-600 peer-checked:border-blue-600 flex items-center justify-center">
                      <div className="w-2.5 h-2.5 bg-white rounded-sm scale-0 peer-checked:scale-100 transition-transform" />
                    </div>
                  </div>
                  <div>
                    <h4 className="text-[10px] font-black text-white uppercase tracking-widest leading-none mb-1">Exige código de rastreio?</h4>
                    <p className="text-[8px] text-white/30 uppercase">Se marcado, o sistema exigirá o código ao vincular pedido</p>
                  </div>
                </label>

                <div className="flex gap-3 pt-2">
                   <button 
                    type="button"
                    onClick={() => setShowConfigModal(false)}
                    className="flex-1 py-4 bg-white/5 hover:bg-white/10 text-white/40 hover:text-white rounded-xl text-[10px] font-black uppercase tracking-[0.2em] transition-all"
                  >
                    Cancelar
                  </button>
                  <button 
                    type="submit"
                    className="flex-[2] py-4 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-[10px] font-black uppercase tracking-[0.2em] shadow-lg shadow-blue-900/20 transition-all"
                  >
                    {editingMethod ? 'Salvar Alterações' : 'Confirmar Cadastro'}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
