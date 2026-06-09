import { useState, useMemo, FormEvent } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  CreditCard, 
  Plus, 
  Edit2, 
  Trash2, 
  X,
  Save,
  Search,
  CheckCircle2,
  DollarSign,
  Smartphone,
  Landmark,
  Briefcase,
  ToggleLeft,
  ToggleRight,
  Info
} from 'lucide-react';
import { cn } from '../lib/utils';
import { useStore, PaymentMethod, PaymentMethodType } from '../store';

export default function PaymentsModule() {
  const paymentMethods = useStore((state) => state.paymentMethods);
  const addPaymentMethod = useStore((state) => state.addPaymentMethod);
  const updatePaymentMethod = useStore((state) => state.updatePaymentMethod);
  const [searchTerm, setSearchTerm] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingMethod, setEditingMethod] = useState<PaymentMethod | null>(null);

  // Form State
  const [formData, setFormData] = useState({
    name: '',
    type: 'money' as PaymentMethodType,
    active: true,
    showInPDV: true,
    allowsChange: false,
    fee: 0,
    receivedDays: 0,
    notes: '',
    pixKey: ''
  });

  const filteredMethods = useMemo(() => {
    return paymentMethods.filter(m => 
      m.name.toLowerCase().includes(searchTerm.toLowerCase())
    );
  }, [paymentMethods, searchTerm]);

  const handleOpenModal = (method?: PaymentMethod) => {
    if (method) {
      setEditingMethod(method);
      setFormData({
        name: method.name,
        type: method.type,
        active: method.active,
        showInPDV: method.showInPDV,
        allowsChange: method.allowsChange,
        fee: method.fee,
        receivedDays: method.receivedDays,
        notes: method.notes || '',
        pixKey: method.pixKey || ''
      });
    } else {
      setEditingMethod(null);
      setFormData({
        name: '',
        type: 'pix',
        active: true,
        showInPDV: true,
        allowsChange: false,
        fee: 0,
        receivedDays: 0,
        notes: '',
        pixKey: ''
      });
    }
    setIsModalOpen(true);
  };

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (editingMethod) {
      updatePaymentMethod(editingMethod.id, formData);
    } else {
      addPaymentMethod(formData);
    }
    setIsModalOpen(false);
  };

  const getIcon = (type: PaymentMethodType) => {
    switch (type) {
      case 'money': return <DollarSign className="w-4 h-4 text-emerald-500" />;
      case 'pix': return <Smartphone className="w-4 h-4 text-emerald-400" />;
      case 'card_debit':
      case 'card_credit': return <CreditCard className="w-4 h-4 text-blue-400" />;
      case 'other': return <Landmark className="w-4 h-4 text-purple-400" />;
    }
  };

  return (
    <div className="h-full flex flex-col gap-3 overflow-hidden max-h-[calc(100vh-100px)]">
      <div className="flex flex-col md:flex-row items-center justify-between gap-3 px-1">
        <div>
          <h1 className="text-xl font-black text-white uppercase tracking-tighter flex items-center gap-2">
            <CreditCard className="w-6 h-6 text-blue-500" />
            Pagamentos
          </h1>
          <p className="text-[8px] uppercase font-black tracking-[0.3em] text-white/30 leading-none mt-1">Meios de Recebimento</p>
        </div>
        <button 
          onClick={() => handleOpenModal()}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-[10px] uppercase font-black tracking-widest transition-all shadow-lg shadow-blue-500/10 group"
        >
          <Plus className="w-3.5 h-3.5 group-hover:scale-125 transition-transform" /> Novo Meio
        </button>
      </div>

      <div className="bg-[#121212] border border-white/5 rounded-xl p-2 flex flex-col md:flex-row items-center gap-2 shrink-0">
        <div className="relative flex-1 w-full">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-white/20 w-3.5 h-3.5" />
          <input 
            type="text" 
            placeholder="Buscar meio..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full bg-black/40 border border-white/5 rounded-lg py-2 pl-9 pr-4 text-xs text-white focus:border-blue-500/50 outline-none transition-all placeholder:text-white/10"
          />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto custom-scrollbar pr-1">
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
          {filteredMethods.map(method => (
            <motion.div
              layout
              key={method.id}
              onClick={() => handleOpenModal(method)}
              className={cn(
                "bg-[#121212] border border-white/5 rounded-xl p-3 flex flex-col gap-2 group hover:border-blue-500/30 transition-all relative overflow-hidden cursor-pointer",
                !method.active && "opacity-50 grayscale"
              )}
            >
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-lg bg-white/5 flex items-center justify-center shrink-0">
                    {getIcon(method.type)}
                  </div>
                  <div className="min-w-0">
                    <h3 className="text-[11px] font-bold text-white uppercase tracking-tight truncate">{method.name}</h3>
                    <span className="text-[7px] font-black uppercase text-white/20 tracking-widest block leading-none">{method.type.replace('_', ' ')}</span>
                  </div>
                </div>
                <button 
                  onClick={(e) => { e.stopPropagation(); handleOpenModal(method); }}
                  className="p-1.5 hover:bg-white/5 rounded-md text-white/20 hover:text-white transition-colors"
                >
                  <Edit2 className="w-3 h-3" />
                </button>
              </div>

              <div className="grid grid-cols-2 gap-2 py-2 border-y border-white/5 my-1">
                <div>
                   <span className="block text-[7px] uppercase font-black text-white/20 tracking-widest mb-0.5">Taxa</span>
                   <span className="text-[10px] font-bold text-red-400">{method.fee}%</span>
                </div>
                <div>
                   <span className="block text-[7px] uppercase font-black text-white/20 tracking-widest mb-0.5">Prazo</span>
                   <span className="text-[10px] font-bold text-white">{method.receivedDays}D</span>
                </div>
              </div>

              {method.type === 'pix' && method.pixKey && (
                <div className="px-2 py-1.5 bg-emerald-500/10 border border-emerald-500/10 rounded-lg text-center my-1">
                  <span className="block text-[6px] uppercase font-black text-emerald-400 tracking-widest leading-none mb-0.5">CHAVE PIX</span>
                  <span className="text-[9px] font-mono text-emerald-300 font-bold break-all select-all">{method.pixKey}</span>
                </div>
              )}

              <div className="flex items-center justify-between mt-auto">
                 <div className="flex items-center gap-2">
                    <div className="flex items-center gap-1" title="Disponível no PDV">
                       <CheckCircle2 className={cn("w-2.5 h-2.5", method.showInPDV ? "text-emerald-500" : "text-white/10")} />
                       <span className="text-[7px] font-black uppercase text-white/30 tracking-tighter">PDV</span>
                    </div>
                    {method.allowsChange && (
                      <div className="flex items-center gap-1" title="Permite Troco">
                         <DollarSign className="w-2.5 h-2.5 text-amber-500" />
                         <span className="text-[7px] font-black uppercase text-white/30 tracking-tighter">Troco</span>
                      </div>
                    )}
                 </div>
                 <div className="flex items-center gap-1">
                    <div className={cn("w-1 h-1 rounded-full", method.active ? "bg-emerald-500" : "bg-red-500")} />
                    <span className="text-[7px] font-black uppercase text-white/10 tracking-widest">{method.active ? 'Ativo' : 'Off'}</span>
                 </div>
              </div>
            </motion.div>
          ))}
        </div>
      </div>

      {/* Info Panel */}
      <div className="p-2 bg-blue-500/5 border border-blue-500/10 rounded-xl flex items-center gap-3 shrink-0">
         <div className="w-8 h-8 rounded-lg bg-blue-500/20 flex items-center justify-center text-blue-400 shrink-0">
            <Info className="w-4 h-4" />
         </div>
         <p className="text-[9px] text-white/50 font-medium leading-tight">
            Configure as regras de recebimento para calcular taxas e prazos corretamente no módulo financeiro.
         </p>
      </div>

      {/* Modal */}
      <AnimatePresence>
        {isModalOpen && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }} 
              animate={{ opacity: 1 }} 
              exit={{ opacity: 0 }} 
              onClick={() => setIsModalOpen(false)} 
              className="absolute inset-0 bg-black/80 backdrop-blur-sm z-0" 
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }} 
              animate={{ opacity: 1, scale: 1, y: 0 }} 
              exit={{ opacity: 0, scale: 0.95, y: 20 }} 
              className="relative z-10 w-full max-w-lg bg-[#121212] border border-white/10 rounded-2xl p-8 shadow-2xl"
            >
              <div className="flex items-center justify-between mb-8">
                <div>
                  <h2 className="text-xl font-bold text-white">{editingMethod ? 'Configurar Meio' : 'Novo Meio Pagto'}</h2>
                  <p className="text-xs text-white/30 uppercase font-black tracking-widest">Financeiro e Regras</p>
                </div>
                <button onClick={() => setIsModalOpen(false)} className="p-2 hover:bg-white/5 rounded-full text-white/20 hover:text-white">
                  <X className="w-6 h-6" />
                </button>
              </div>

              <form onSubmit={handleSubmit} className="space-y-6">
                <div className="space-y-6">
                  <div className="space-y-2">
                    <label className="text-[10px] uppercase font-black text-white/30 tracking-widest ml-1">Nome Exibição PDV</label>
                    <input 
                      required
                      value={formData.name}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                      className="w-full bg-black/40 border border-white/5 rounded-xl py-3 px-4 text-sm text-white focus:border-blue-500/50 outline-none"
                      placeholder="Ex: Cartão de Crédito 1x"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <label className="text-[10px] uppercase font-black text-white/30 tracking-widest ml-1">Tipo de Pagamento</label>
                      <select 
                        value={formData.type}
                        onChange={(e) => setFormData({ ...formData, type: e.target.value as PaymentMethodType })}
                        className="w-full bg-black/40 border border-white/5 rounded-xl py-3 px-4 text-sm text-white focus:border-blue-500/50 outline-none"
                      >
                         <option value="money">Dinheiro</option>
                         <option value="pix">PIX</option>
                         <option value="card_debit">Cartão Débito</option>
                         <option value="card_credit">Cartão Crédito</option>
                         <option value="other">Outros</option>
                      </select>
                    </div>
                    <div className="space-y-2">
                      <label className="text-[10px] uppercase font-black text-white/30 tracking-widest ml-1">Taxa (%)</label>
                      <input 
                        type="number"
                        step="0.01"
                        value={formData.fee}
                        onChange={(e) => setFormData({ ...formData, fee: parseFloat(e.target.value) })}
                        className="w-full bg-black/40 border border-white/5 rounded-xl py-3 px-4 text-sm text-white focus:border-blue-500/50 outline-none"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <label className="text-[10px] uppercase font-black text-white/30 tracking-widest ml-1">Prazo Recebimento (Dias)</label>
                      <input 
                        type="number"
                        value={formData.receivedDays}
                        onChange={(e) => setFormData({ ...formData, receivedDays: parseInt(e.target.value) })}
                        className="w-full bg-black/40 border border-white/5 rounded-xl py-3 px-4 text-sm text-white focus:border-blue-500/50 outline-none"
                      />
                    </div>
                    <div className="flex flex-col justify-end gap-3 pb-2">
                       <label className="flex items-center gap-3 cursor-pointer group">
                          <button 
                            type="button"
                            onClick={() => setFormData({ ...formData, showInPDV: !formData.showInPDV })}
                            className={cn("transition-colors", formData.showInPDV ? "text-emerald-500" : "text-white/10")}
                          >
                             {formData.showInPDV ? <ToggleRight className="w-8 h-8" /> : <ToggleLeft className="w-8 h-8" />}
                          </button>
                          <span className="text-[10px] uppercase font-black text-white/40 tracking-widest group-hover:text-white transition-colors">Aparece no PDV</span>
                       </label>
                    </div>
                  </div>

                  {formData.type === 'pix' && (
                    <div className="space-y-2">
                      <label className="text-[10px] uppercase font-black text-white/30 tracking-widest ml-1">Chave PIX (Para Recebimento auto-gerado no Totem)</label>
                      <input 
                        required
                        value={formData.pixKey}
                        onChange={(e) => setFormData({ ...formData, pixKey: e.target.value })}
                        className="w-full bg-black/40 border border-white/5 rounded-xl py-3 px-4 text-sm text-white focus:border-blue-500/50 outline-none"
                        placeholder="CPF, CNPJ, Celular, E-mail ou Chave Aleatória"
                      />
                    </div>
                  )}

                  {formData.type === 'money' && (
                    <label className="flex items-center gap-3 cursor-pointer group">
                       <button 
                         type="button"
                         onClick={() => setFormData({ ...formData, allowsChange: !formData.allowsChange })}
                         className={cn("transition-colors", formData.allowsChange ? "text-emerald-500" : "text-white/10")}
                       >
                          {formData.allowsChange ? <ToggleRight className="w-8 h-8" /> : <ToggleLeft className="w-8 h-8" />}
                       </button>
                       <span className="text-[10px] uppercase font-black text-white/40 tracking-widest group-hover:text-white transition-colors">Permite Troco</span>
                    </label>
                  )}
                </div>

                <div className="flex gap-4 pt-4">
                  <button 
                    type="button"
                    onClick={() => setIsModalOpen(false)}
                    className="flex-1 py-4 bg-white/5 hover:bg-white/10 text-white/40 hover:text-white rounded-xl text-xs uppercase font-black tracking-widest transition-all"
                  >
                    Cancelar
                  </button>
                  <button 
                    type="submit"
                    className="flex-1 py-4 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs uppercase font-black tracking-widest transition-all shadow-lg shadow-blue-500/20 flex items-center justify-center gap-2"
                  >
                    <Save className="w-4 h-4" /> {editingMethod ? 'Atualizar Regras' : 'Criar Meio Pagto'}
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
