import React, { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Store, 
  Plus, 
  Search, 
  Edit2, 
  Phone, 
  Mail, 
  MapPin, 
  MoreVertical,
  X,
  Save,
  CheckCircle2,
  AlertCircle,
  Truck,
  RotateCcw,
  ClipboardList,
  ArrowRight,
  History,
  FileCheck2,
  Trash,
  Building2,
  MessageSquare,
  ExternalLink,
  Info,
  Package
} from 'lucide-react';
import { cn } from '../lib/utils';
import { useStore, Retailer, ConsignmentRemittance, Product, PaymentMethod } from '../store';

export default function RetailersModule() {
  const retailers = useStore(state => state.retailers);
  const addRetailer = useStore(state => state.addRetailer);
  const updateRetailer = useStore(state => state.updateRetailer);
  const products = useStore(state => state.products);
  const paymentMethods = useStore(state => state.paymentMethods);
  const consignmentRemittances = useStore(state => state.consignmentRemittances);
  const addConsignmentRemittance = useStore(state => state.addConsignmentRemittance);
  const settleConsignment = useStore(state => state.settleConsignment);
  const [activeTab, setActiveTab] = useState<'partners' | 'consignments'>('partners');
  const [searchTerm, setSearchTerm] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingRetailer, setEditingRetailer] = useState<Retailer | null>(null);

  // Consignment State
  const [isRemittanceModalOpen, setIsRemittanceModalOpen] = useState(false);
  const [isSettlementModalOpen, setIsSettlementModalOpen] = useState(false);
  const [selectedRemittance, setSelectedRemittance] = useState<ConsignmentRemittance | null>(null);
  const [remittanceItems, setRemittanceItems] = useState<{ productId: string, quantity: number, unitPrice: number }[]>([]);
  const [settlementData, setSettlementData] = useState<{ productId: string, sold: number, returned: number }[]>([]);

  const filteredRetailers = useMemo(() => {
    return retailers.filter(r => 
      r.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      r.responsible.toLowerCase().includes(searchTerm.toLowerCase()) ||
      r.document.includes(searchTerm)
    );
  }, [retailers, searchTerm]);

  const filteredConsignments = useMemo(() => {
    return consignmentRemittances.filter(c => 
      c.retailerName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      c.id.includes(searchTerm)
    );
  }, [consignmentRemittances, searchTerm]);

  const handleAddRemittance = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const retailerId = formData.get('retailerId') as string;
    const retailer = retailers.find(r => r.id === retailerId);
    
    if (!retailer || remittanceItems.length === 0) return;

    const items = remittanceItems.map(item => {
      const product = products.find(p => p.id === item.productId);
      return {
        productId: item.productId,
        name: product?.name || 'Produto',
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        soldQuantity: 0,
        returnedQuantity: 0
      };
    });

    const totalValue = items.reduce((acc, item) => acc + (item.quantity * item.unitPrice), 0);

    addConsignmentRemittance({
      retailerId,
      retailerName: retailer.name,
      items,
      totalValue,
      notes: formData.get('notes') as string,
      createdBy: 'Admin'
    });

    setIsRemittanceModalOpen(false);
    setRemittanceItems([]);
  };

  const handleSettle = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const paymentMethodId = formData.get('paymentMethodId') as string;

    if (!selectedRemittance || !paymentMethodId) return;

    settleConsignment(selectedRemittance.id, settlementData, paymentMethodId);
    setIsSettlementModalOpen(false);
    setSelectedRemittance(null);
    setSettlementData([]);
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'em_consignacao': return 'text-amber-400 bg-amber-400/10';
      case 'parcialmente_vendido': return 'text-blue-400 bg-blue-400/10';
      case 'finalizado': return 'text-emerald-400 bg-emerald-400/10';
      case 'devolvido': return 'text-purple-400 bg-purple-400/10';
      default: return 'text-white/40 bg-white/5';
    }
  };

  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'em_consignacao': return 'Em Consignação';
      case 'parcialmente_vendido': return 'Parcialmente Vendido';
      case 'finalizado': return 'Finalizado';
      case 'devolvido': return 'Devolvido';
      default: return status;
    }
  };

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    
    const retailerData = {
      name: formData.get('name') as string,
      responsible: formData.get('responsible') as string,
      document: formData.get('document') as string,
      email: formData.get('email') as string,
      phone: formData.get('phone') as string,
      whatsapp: formData.get('whatsapp') as string,
      address: formData.get('address') as string,
      city: formData.get('city') as string,
      state: formData.get('state') as string,
      notes: formData.get('notes') as string,
    };

    if (editingRetailer) {
      updateRetailer(editingRetailer.id, retailerData);
    } else {
      addRetailer(retailerData);
    }
    
    setIsModalOpen(false);
    setEditingRetailer(null);
  };

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-end gap-4">
        <div className="flex items-center gap-3">
          <div className="flex p-1 bg-white/5 rounded-xl border border-white/10 shrink-0">
            <button 
              onClick={() => setActiveTab('partners')}
              className={cn(
                "px-4 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all",
                activeTab === 'partners' ? "bg-emerald-500 text-black shadow-lg" : "text-white/40 hover:text-white"
              )}
            >
              Parceiros
            </button>
            <button 
              onClick={() => setActiveTab('consignments')}
              className={cn(
                "px-4 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all flex items-center gap-2",
                activeTab === 'consignments' ? "bg-emerald-500 text-black shadow-lg" : "text-white/40 hover:text-white"
              )}
            >
              Consignação
              {consignmentRemittances.length > 0 && (
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              )}
            </button>
          </div>

          <div className="relative group">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/20 group-focus-within:text-emerald-500 transition-colors" />
            <input 
              type="text"
              placeholder={activeTab === 'partners' ? "Buscar lojista..." : "Buscar remessa..."}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10 pr-4 py-2 bg-white/5 border border-white/10 rounded-xl text-sm focus:outline-none focus:border-emerald-500/50 w-64 transition-all"
            />
          </div>

          {activeTab === 'partners' ? (
            <button 
              onClick={() => {
                setEditingRetailer(null);
                setIsModalOpen(true);
              }}
              className="flex items-center gap-2 px-4 py-2 bg-emerald-500 hover:bg-emerald-600 text-black rounded-xl font-bold text-sm transition-all shadow-[0_0_20px_rgba(16,185,129,0.2)]"
            >
              <Plus className="w-4 h-4" />
              Novo Lojista
            </button>
          ) : (
            <button 
              onClick={() => {
                setIsRemittanceModalOpen(true);
              }}
              className="flex items-center gap-2 px-4 py-2 bg-emerald-500 hover:bg-emerald-600 text-black rounded-xl font-bold text-sm transition-all shadow-[0_0_20px_rgba(16,185,129,0.2)]"
            >
              <Truck className="w-4 h-4" />
              Nova Remessa
            </button>
          )}
        </div>
      </div>

      {activeTab === 'partners' ? (
        /* Partners Grid */
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          <AnimatePresence mode="popLayout">
            {filteredRetailers.map((retailer) => (
              <motion.div
                key={retailer.id}
                layout
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="group bg-[#121212] border border-white/5 rounded-2xl p-5 hover:border-emerald-500/20 transition-all relative overflow-hidden"
              >
                <div className="absolute top-0 right-0 p-4">
                  <button 
                    onClick={() => {
                      setEditingRetailer(retailer);
                      setIsModalOpen(true);
                    }}
                    className="p-2 rounded-lg bg-white/5 opacity-0 group-hover:opacity-100 transition-all hover:bg-white/10"
                  >
                    <Edit2 className="w-3.5 h-3.5 text-white/50" />
                  </button>
                </div>

                <div className="flex items-start gap-4 mb-4">
                  <div className="w-12 h-12 bg-white/5 rounded-xl flex items-center justify-center text-emerald-500 border border-white/5">
                    <Building2 className="w-6 h-6" />
                  </div>
                  <div>
                    <h3 className="font-bold text-white leading-tight">{retailer.name}</h3>
                    <div className="flex items-center gap-2 mt-1">
                      <span className="text-[10px] text-white/30 font-black uppercase tracking-tighter">{retailer.responsible}</span>
                      <span className={cn(
                        "w-1.5 h-1.5 rounded-full",
                        retailer.active ? "bg-emerald-500 animate-pulse" : "bg-red-500"
                      )} />
                    </div>
                  </div>
                </div>

                <div className="space-y-2 mb-6">
                  <div className="flex items-center gap-3 text-xs text-white/50">
                    <Phone className="w-3.5 h-3.5 text-emerald-500/50" />
                    {retailer.phone || 'N/A'}
                  </div>
                  <div className="flex items-center gap-3 text-xs text-white/50">
                    <Mail className="w-3.5 h-3.5 text-emerald-500/50" />
                    {retailer.email}
                  </div>
                  <div className="flex items-center gap-3 text-xs text-white/50">
                    <MapPin className="w-3.5 h-3.5 text-emerald-500/50" />
                    {retailer.city}, {retailer.state}
                  </div>
                </div>

                <div className="flex items-center gap-2 pt-4 border-t border-white/5">
                  <button className="flex-1 flex items-center justify-center gap-2 py-2 bg-white/5 hover:bg-emerald-500/10 hover:text-emerald-400 rounded-lg text-[10px] font-black uppercase transition-all">
                    <MessageSquare className="w-3 h-3" />
                    WhatsApp
                  </button>
                  <button 
                    onClick={() => {
                      setSearchTerm(retailer.name);
                      setActiveTab('consignments');
                    }}
                    className="flex-1 flex items-center justify-center gap-2 py-2 bg-white/5 hover:bg-blue-500/10 hover:text-blue-400 rounded-lg text-[10px] font-black uppercase transition-all"
                  >
                    <ExternalLink className="w-3 h-3" />
                    Remessas
                  </button>
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      ) : (
        /* Consignments List */
        <div className="flex-1 flex flex-col min-h-0 bg-[#0A0A0A] border border-white/5 rounded-2xl overflow-hidden shadow-2xl">
          <div className="hidden md:grid grid-cols-[1fr_2fr_1fr_1fr_120px] gap-4 px-6 py-3 bg-white/[0.03] border-b border-white/5 text-[9px] uppercase font-black text-white/30 tracking-widest items-center">
            <div>DATA / ID</div>
            <div>LOJISTA / PRODUTOS</div>
            <div className="text-center">VALOR TOTAL</div>
            <div className="text-center">STATUS</div>
            <div className="text-right">AÇÕES</div>
          </div>
          <div className="flex-1 overflow-y-auto custom-scrollbar">
            <div className="divide-y divide-white/[0.02]">
              {filteredConsignments.map((consignment) => (
                <motion.div
                  key={consignment.id}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="group hover:bg-white/[0.01] transition-colors"
                >
                  <div className="flex flex-col md:grid md:grid-cols-[1fr_2fr_1fr_1fr_120px] gap-4 px-6 py-4 items-center">
                    <div>
                      <div className="text-xs font-bold text-white mb-0.5">
                        {new Date(consignment.timestamp).toLocaleDateString()}
                      </div>
                      <div className="text-[9px] font-mono text-white/20 uppercase tracking-tighter">
                        ID: {consignment.id.substring(0, 8)}
                      </div>
                    </div>

                    <div>
                      <div className="text-xs font-black text-emerald-500 uppercase flex items-center gap-2 mb-1">
                        <Building2 className="w-3 h-3" />
                        {consignment.retailerName}
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {consignment.items.map((item, idx) => {
                          const total = item.soldQuantity + item.returnedQuantity;
                          const progress = (total / item.quantity) * 100;
                          return (
                            <div key={idx} className="group/item relative">
                              <div className="px-2 py-0.5 bg-white/5 border border-white/5 rounded text-[8px] font-bold text-white/50 flex items-center gap-2">
                                {item.name}: {item.quantity}un
                                <div className="w-12 h-1 bg-white/10 rounded-full overflow-hidden">
                                  <div 
                                    className="h-full bg-emerald-500 transition-all duration-500" 
                                    style={{ width: `${progress}%` }} 
                                  />
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    <div className="text-center">
                      <div className="text-xs font-black text-white">
                        R$ {consignment.totalValue.toFixed(2)}
                      </div>
                    </div>

                    <div className="flex justify-center">
                      <span className={cn(
                        "px-2 py-1 rounded text-[8px] font-black uppercase tracking-tighter",
                        getStatusColor(consignment.status)
                      )}>
                        {getStatusLabel(consignment.status)}
                      </span>
                    </div>

                    <div className="flex items-center justify-end gap-2">
                      <button 
                        onClick={() => {
                          setSelectedRemittance(consignment);
                          setSettlementData(consignment.items.map(i => ({ 
                            productId: i.productId, 
                            sold: 0, 
                            returned: 0 
                          })));
                          setIsSettlementModalOpen(true);
                        }}
                        disabled={consignment.status === 'finalizado'}
                        className="p-2 hover:bg-emerald-500/20 text-white/20 hover:text-emerald-500 rounded-lg transition-all disabled:opacity-20"
                        title="Fazer Acerto"
                      >
                        <FileCheck2 className="w-4 h-4" />
                      </button>
                      <button className="p-2 hover:bg-white/10 text-white/20 hover:text-white rounded-lg transition-all" title="Ver Detalhes">
                        <Info className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </motion.div>
              ))}
            </div>
            {filteredConsignments.length === 0 && (
              <div className="py-20 flex flex-col items-center justify-center opacity-20">
                <Truck className="w-12 h-12 mb-4" />
                <p className="text-[10px] font-black uppercase tracking-widest text-center">Nenhuma remessa encontrada</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Partners Modal - Keep existing or use the one below */}

      {/* Empty State */}
      {filteredRetailers.length === 0 && (
        <div className="flex flex-col items-center justify-center py-20 bg-white/[0.02] border border-dashed border-white/5 rounded-3xl">
          <div className="w-16 h-16 bg-white/5 rounded-full flex items-center justify-center mb-4">
            <Store className="w-8 h-8 text-white/10" />
          </div>
          <h3 className="text-white font-bold uppercase tracking-widest">Nenhum lojista encontrado</h3>
          <p className="text-[10px] text-white/20 font-black uppercase mt-1 tracking-tighter">Tente ajustar sua busca ou cadastre um novo parceiro</p>
        </div>
      )}

      {/* Partners Modal */}
      <AnimatePresence>
        {isModalOpen && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-6">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsModalOpen(false)}
              className="absolute inset-0 bg-black/80 backdrop-blur-sm"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="w-full max-w-2xl bg-[#121212] border border-white/10 rounded-3xl shadow-2xl relative overflow-hidden"
            >
              <div className="p-6 border-b border-white/5 flex items-center justify-between">
                <div>
                  <h3 className="text-lg font-black text-white uppercase tracking-tighter">
                    {editingRetailer ? 'Editar Lojista' : 'Novo Lojista'}
                  </h3>
                  <p className="text-[10px] text-white/30 font-bold uppercase tracking-widest">Preencha os dados do parceiro</p>
                </div>
                <button 
                  onClick={() => setIsModalOpen(false)}
                  className="p-2 hover:bg-white/5 rounded-lg transition-colors"
                >
                  <X className="w-5 h-5 text-white/50" />
                </button>
              </div>

              <form onSubmit={handleSubmit} className="p-6 space-y-6 max-h-[70vh] overflow-y-auto custom-scrollbar">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black text-white/30 uppercase tracking-widest pl-1">Nome da Loja</label>
                    <input 
                      name="name"
                      defaultValue={editingRetailer?.name}
                      required
                      className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-emerald-500/50 transition-all"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black text-white/30 uppercase tracking-widest pl-1">Responsável</label>
                    <input 
                      name="responsible"
                      defaultValue={editingRetailer?.responsible}
                      required
                      className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-emerald-500/50 transition-all"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black text-white/30 uppercase tracking-widest pl-1">CNPJ / CPF</label>
                    <input 
                      name="document"
                      defaultValue={editingRetailer?.document}
                      required
                      className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-emerald-500/50 transition-all"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black text-white/30 uppercase tracking-widest pl-1">E-mail</label>
                    <input 
                      name="email"
                      type="email"
                      defaultValue={editingRetailer?.email}
                      required
                      className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-emerald-500/50 transition-all"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black text-white/30 uppercase tracking-widest pl-1">Telefone</label>
                    <input 
                      name="phone"
                      defaultValue={editingRetailer?.phone}
                      className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-emerald-500/50 transition-all"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black text-white/30 uppercase tracking-widest pl-1">WhatsApp</label>
                    <input 
                      name="whatsapp"
                      defaultValue={editingRetailer?.whatsapp}
                      className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-emerald-500/50 transition-all"
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="text-[10px] font-black text-white/30 uppercase tracking-widest pl-1">Endereço Completo</label>
                  <input 
                    name="address"
                    defaultValue={editingRetailer?.address}
                    required
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-emerald-500/50 transition-all"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black text-white/30 uppercase tracking-widest pl-1">Cidade</label>
                    <input 
                      name="city"
                      defaultValue={editingRetailer?.city}
                      required
                      className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-emerald-500/50 transition-all"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black text-white/30 uppercase tracking-widest pl-1">Estado (UF)</label>
                    <input 
                      name="state"
                      defaultValue={editingRetailer?.state}
                      required
                      maxLength={2}
                      className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-emerald-500/50 transition-all uppercase"
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="text-[10px] font-black text-white/30 uppercase tracking-widest pl-1">Observações</label>
                  <textarea 
                    name="notes"
                    defaultValue={editingRetailer?.notes}
                    rows={3}
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-emerald-500/50 transition-all resize-none"
                  />
                </div>

                <div className="flex gap-3 pt-4">
                  <button 
                    type="button"
                    onClick={() => setIsModalOpen(false)}
                    className="flex-1 py-3 bg-white/5 hover:bg-white/10 text-white font-bold rounded-xl text-sm transition-all"
                  >
                    Cancelar
                  </button>
                  <button 
                    type="submit"
                    className="flex-1 py-3 bg-emerald-500 hover:bg-emerald-600 text-black font-extrabold rounded-xl text-sm transition-all shadow-[0_0_20px_rgba(16,185,129,0.2)]"
                  >
                    {editingRetailer ? 'Salvar Alterações' : 'Cadastrar Parceiro'}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Remittance Modal */}
      <AnimatePresence>
        {isRemittanceModalOpen && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-6">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsRemittanceModalOpen(false)}
              className="absolute inset-0 bg-black/80 backdrop-blur-sm"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="w-full max-w-4xl bg-[#121212] border border-white/10 rounded-3xl shadow-2xl relative overflow-hidden flex flex-col md:flex-row"
            >
              <div className="flex-1 p-8 border-b md:border-b-0 md:border-r border-white/5">
                <div className="mb-8">
                  <h3 className="text-lg font-black text-white uppercase tracking-tighter flex items-center gap-2">
                    <Truck className="w-5 h-5 text-emerald-500" />
                    Nova Remessa
                  </h3>
                  <p className="text-[10px] text-white/30 font-bold uppercase tracking-widest">Selecione o lojista e adicione os produtos</p>
                </div>

                <form id="remittance-form" onSubmit={handleAddRemittance} className="space-y-6">
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black text-white/30 uppercase tracking-widest pl-1">Selecionar Lojista</label>
                    <select 
                      name="retailerId"
                      required
                      className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-emerald-500/50 transition-all font-bold"
                    >
                      <option value="" className="bg-[#121212]">Selecione um parceiro...</option>
                      {retailers.filter(r => r.active).map(r => (
                        <option key={r.id} value={r.id} className="bg-[#121212]">{r.name}</option>
                      ))}
                    </select>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black text-white/30 uppercase tracking-widest pl-1">Observações da Remessa</label>
                    <textarea 
                      name="notes"
                      rows={3}
                      className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-emerald-500/50 transition-all resize-none"
                      placeholder="Ex: Entrega via transportadora, prazo de acerto de 30 dias..."
                    />
                  </div>

                  <div className="flex gap-4 pt-4">
                    <button 
                      type="button"
                      onClick={() => setIsRemittanceModalOpen(false)}
                      className="flex-1 py-3 bg-white/5 hover:bg-white/10 text-white font-bold rounded-xl text-sm transition-all"
                    >
                      Cancelar
                    </button>
                    <button 
                      type="submit"
                      disabled={remittanceItems.length === 0}
                      className="flex-1 py-3 bg-emerald-500 disabled:opacity-20 hover:bg-emerald-600 text-black font-extrabold rounded-xl text-sm transition-all shadow-[0_0_20px_rgba(16,185,129,0.2)]"
                    >
                      Confirmar Envio
                    </button>
                  </div>
                </form>
              </div>

              <div className="w-full md:w-[400px] bg-black/20 p-8 flex flex-col">
                <h4 className="text-[10px] font-black text-white/40 uppercase tracking-[0.2em] mb-6 flex items-center justify-between">
                  PRODUTOS NA REMESSA
                  <span className="text-emerald-500">{remittanceItems.length}</span>
                </h4>

                <div className="flex-1 space-y-3 overflow-y-auto transition-all pr-2 custom-scrollbar min-h-[200px]">
                  {remittanceItems.map((item, idx) => {
                    const product = products.find(p => p.id === item.productId);
                    return (
                      <div key={idx} className="flex items-center gap-3 bg-white/5 border border-white/5 p-3 rounded-xl group">
                        <div className="w-10 h-10 bg-white/5 rounded-lg flex items-center justify-center border border-white/5 text-emerald-500">
                          <Package className="w-5 h-5" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="text-xs font-bold text-white truncate">{product?.name}</div>
                          <div className="text-[10px] text-emerald-500/60 font-black tracking-tighter">
                            {item.quantity}un x R$ {item.unitPrice.toFixed(2)}
                          </div>
                        </div>
                        <button 
                          onClick={() => setRemittanceItems(prev => prev.filter((_, i) => i !== idx))}
                          className="p-1.5 hover:bg-red-500/20 text-white/10 hover:text-red-500 rounded-lg transition-all"
                        >
                          <Trash className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    );
                  })}

                  {remittanceItems.length === 0 && (
                    <div className="flex flex-col items-center justify-center py-10 opacity-20 border-2 border-dashed border-white/10 rounded-2xl">
                      <Plus className="w-8 h-8 mb-2" />
                      <p className="text-[8px] font-black uppercase tracking-widest text-center px-4">Selecione produtos abaixo para adicionar</p>
                    </div>
                  )}
                </div>

                <div className="mt-8 pt-8 border-t border-white/10 space-y-4">
                  <div className="space-y-3">
                    <label className="text-[10px] font-black text-white/30 uppercase tracking-widest">Adicionar Item</label>
                    <div className="relative">
                      <select 
                        onChange={(e) => {
                          const product = products.find(p => p.id === e.target.value);
                          if (product) {
                            const existing = remittanceItems.find(i => i.productId === product.id);
                            if (existing) {
                              setRemittanceItems(prev => prev.map(i => 
                                i.productId === product.id ? { ...i, quantity: i.quantity + 1 } : i
                              ));
                            } else {
                              setRemittanceItems(prev => [...prev, { 
                                productId: product.id, 
                                quantity: 1, 
                                unitPrice: product.wholesalePrice || product.price 
                              }]);
                            }
                          }
                          e.target.value = "";
                        }}
                        className="w-full bg-white/10 border border-white/10 rounded-xl px-4 py-2.5 text-xs text-white focus:outline-none focus:border-emerald-500/50 appearance-none font-bold"
                      >
                        <option value="" className="bg-[#121212]">Selecione um produto...</option>
                        {products.filter(p => p.active && p.stock > 0).map(p => (
                          <option key={p.id} value={p.id} className="bg-[#121212]">{p.name} (Estoque: {p.stock}un)</option>
                        ))}
                      </select>
                      <Plus className="absolute right-4 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-white/20 pointer-events-none" />
                    </div>
                  </div>

                  <div className="bg-emerald-500/5 border border-emerald-500/10 p-4 rounded-2xl flex items-center justify-between">
                    <span className="text-[10px] font-black text-emerald-500 uppercase">Total da Remessa</span>
                    <span className="text-lg font-black text-white tabular-nums">
                      R$ {remittanceItems.reduce((acc, i) => acc + (i.quantity * i.unitPrice), 0).toFixed(2)}
                    </span>
                  </div>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Settlement Modal */}
      <AnimatePresence>
        {isSettlementModalOpen && selectedRemittance && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-6">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsSettlementModalOpen(false)}
              className="absolute inset-0 bg-black/80 backdrop-blur-sm"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="w-full max-w-2xl bg-[#121212] border border-white/10 rounded-3xl shadow-2xl relative overflow-hidden"
            >
              <div className="p-8 border-b border-white/5 flex items-center justify-between bg-white/[0.02]">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <h3 className="text-lg font-black text-white uppercase tracking-tighter">
                      Acerto de Lojista
                    </h3>
                    <span className="px-2 py-0.5 bg-emerald-500/10 text-emerald-500 rounded text-[8px] font-black uppercase">
                      ID: {selectedRemittance.id}
                    </span>
                  </div>
                  <p className="text-[10px] text-white/30 font-bold uppercase tracking-widest">{selectedRemittance.retailerName}</p>
                </div>
                <button 
                  onClick={() => setIsSettlementModalOpen(false)}
                  className="p-2 hover:bg-white/5 rounded-lg transition-colors"
                >
                  <X className="w-5 h-5 text-white/50" />
                </button>
              </div>

              <form onSubmit={handleSettle} className="p-8 space-y-8">
                <div className="space-y-4 max-h-[40vh] overflow-y-auto pr-2 custom-scrollbar">
                  {selectedRemittance.items.map((item, idx) => {
                    const pending = item.quantity - item.soldQuantity - item.returnedQuantity;
                    if (pending <= 0) return null;

                    const currentSettlement = settlementData.find(s => s.productId === item.productId) || { sold: 0, returned: 0 };

                    return (
                      <div key={idx} className="bg-white/5 border border-white/5 rounded-2xl p-4 flex flex-col md:flex-row md:items-center justify-between gap-4">
                        <div className="flex-1">
                          <h5 className="text-sm font-bold text-white mb-1">{item.name}</h5>
                          <div className="text-[10px] text-white/30 font-black uppercase tracking-widest flex items-center gap-3">
                            <span>Total Entegue: {item.quantity}</span>
                            <span className="text-white/10">•</span>
                            <span>Pendente: {pending}</span>
                          </div>
                        </div>

                        <div className="flex items-center gap-4">
                          <div className="space-y-1">
                            <label className="text-[8px] font-black text-emerald-500 uppercase tracking-widest pl-1">Vendido</label>
                            <input 
                              type="number"
                              min="0"
                              max={pending - currentSettlement.returned}
                              value={currentSettlement.sold}
                              onChange={(e) => {
                                const val = Math.min(pending - currentSettlement.returned, parseInt(e.target.value) || 0);
                                setSettlementData(prev => prev.map(s => 
                                  s.productId === item.productId ? { ...s, sold: val } : s
                                ));
                              }}
                              className="w-20 bg-black/40 border border-white/5 rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none focus:border-emerald-500 text-center font-bold"
                            />
                          </div>
                          <div className="space-y-1">
                            <label className="text-[8px] font-black text-amber-500 uppercase tracking-widest pl-1">Devolvido</label>
                            <input 
                              type="number"
                              min="0"
                              max={pending - currentSettlement.sold}
                              value={currentSettlement.returned}
                              onChange={(e) => {
                                const val = Math.min(pending - currentSettlement.sold, parseInt(e.target.value) || 0);
                                setSettlementData(prev => prev.map(s => 
                                  s.productId === item.productId ? { ...s, returned: val } : s
                                ));
                              }}
                              className="w-20 bg-black/40 border border-white/5 rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none focus:border-amber-500 text-center font-bold"
                            />
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>

                <div className="grid grid-cols-2 gap-4 pt-4 border-t border-white/5">
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black text-white/30 uppercase tracking-widest pl-1">Forma de Pagamento</label>
                    <select 
                      name="paymentMethodId"
                      required
                      className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-emerald-500 transition-all font-bold"
                    >
                      {paymentMethods.filter(pm => pm.active).map(pm => (
                        <option key={pm.id} value={pm.id} className="bg-[#121212]">{pm.name}</option>
                      ))}
                    </select>
                  </div>
                  <div className="bg-emerald-500/5 border border-emerald-500/10 p-4 rounded-2xl flex flex-col justify-center">
                    <span className="text-[9px] font-black text-emerald-500 uppercase tracking-widest mb-1">Valor a Receber</span>
                    <span className="text-xl font-black text-white tabular-nums">
                      R$ {settlementData.reduce((acc, s) => {
                        const item = selectedRemittance.items.find(i => i.productId === s.productId);
                        return acc + (s.sold * (item?.unitPrice || 0));
                      }, 0).toFixed(2)}
                    </span>
                  </div>
                </div>

                <div className="flex gap-4 pt-4">
                  <button 
                    type="button"
                    onClick={() => setIsSettlementModalOpen(false)}
                    className="flex-1 py-4 bg-white/5 hover:bg-white/10 text-white font-bold rounded-2xl text-sm transition-all"
                  >
                    Fechar
                  </button>
                  <button 
                    type="submit"
                    className="flex-1 py-4 bg-emerald-500 hover:bg-emerald-600 text-black font-extrabold rounded-2xl text-sm transition-all shadow-[0_0_30px_rgba(16,185,129,0.2)]"
                  >
                    Finalizar Acerto
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
