import React, { useState, useMemo } from 'react';
import { useStore, FinancialTransaction, PaymentMethod } from '../store';
import { safeAdd, safeSubtract, roundMoney } from '../utils/money';
import { 
  CircleDollarSign, 
  TrendingUp, 
  TrendingDown, 
  Search, 
  Filter, 
  ArrowUpRight, 
  ArrowDownLeft, 
  Calendar,
  Wallet,
  MoreVertical,
  Plus,
  CheckCircle2,
  Clock,
  XCircle,
  Download,
  AlertCircle,
  FileText,
  Activity
} from 'lucide-react';
import { cn } from '../lib/utils';
import { motion, AnimatePresence } from 'framer-motion';
import FinancialReports from '../components/FinancialReports';

export default function FinancialModule() {
  const financialTransactions = useStore((state) => state.financialTransactions);
  const paymentMethods = useStore((state) => state.paymentMethods);
  const addTransaction = useStore((state) => state.addTransaction);
  const updateTransaction = useStore((state) => state.updateTransaction);
  const [searchTerm, setSearchTerm] = useState('');
  const [typeFilter, setTypeFilter] = useState<'all' | 'entrada' | 'saida'>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [showAddModal, setShowAddModal] = useState(false);
  const [activeTab, setActiveTab] = useState<'movements' | 'reports'>('movements');

  // Form State
  const [formData, setFormData] = useState({
    type: 'entrada',
    category: 'Venda Manual',
    description: '',
    value: '',
    paymentMethodId: paymentMethods[0]?.id || '',
    status: 'pago',
    notes: ''
  });

  const filteredTransactions = useMemo(() => {
    return financialTransactions.filter(t => {
      const matchesSearch = 
        t.code.toLowerCase().includes(searchTerm.toLowerCase()) ||
        t.description.toLowerCase().includes(searchTerm.toLowerCase()) ||
        t.category.toLowerCase().includes(searchTerm.toLowerCase());
      
      const matchesType = typeFilter === 'all' || t.type === typeFilter;
      const matchesStatus = statusFilter === 'all' || t.status === statusFilter;
      
      return matchesSearch && matchesType && matchesStatus;
    });
  }, [financialTransactions, searchTerm, typeFilter, statusFilter]);

  const summary = useMemo(() => {
    const today = new Date().setHours(0, 0, 0, 0);
    const firstDayOfMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1).getTime();

    const transactions = financialTransactions.filter(t => t.status !== 'cancelado');

    const totalIn = transactions.filter(t => t.type === 'entrada').reduce((acc, t) => safeAdd(acc, t.value), 0);
    const totalOut = transactions.filter(t => t.type === 'saida').reduce((acc, t) => safeAdd(acc, t.value), 0);

    const todayIn = transactions.filter(t => t.type === 'entrada' && t.date >= today).reduce((acc, t) => safeAdd(acc, t.value), 0);
    const todayOut = transactions.filter(t => t.type === 'saida' && t.date >= today).reduce((acc, t) => safeAdd(acc, t.value), 0);

    const monthIn = transactions.filter(t => t.type === 'entrada' && t.date >= firstDayOfMonth).reduce((acc, t) => safeAdd(acc, t.value), 0);
    const monthOut = transactions.filter(t => t.type === 'saida' && t.date >= firstDayOfMonth).reduce((acc, t) => safeAdd(acc, t.value), 0);

    return {
      todayIn, todayOut, todayBalance: safeSubtract(todayIn, todayOut),
      monthIn, monthOut, monthBalance: safeSubtract(monthIn, monthOut),
      totalIn, totalOut, totalBalance: safeSubtract(totalIn, totalOut)
    };
  }, [financialTransactions]);

  const handleAddTransaction = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.description || !formData.value) return;

    const method = paymentMethods.find(m => m.id === formData.paymentMethodId);

    addTransaction({
      type: formData.type as 'entrada' | 'saida',
      category: formData.category,
      description: formData.description,
      value: parseFloat(formData.value),
      paymentMethodId: formData.paymentMethodId,
      paymentMethodName: method?.name || 'Não especificado',
      status: formData.status as 'pago' | 'pendente' | 'cancelado',
      notes: formData.notes,
      origin: 'manual'
    });

    setShowAddModal(false);
    setFormData({
      type: 'entrada',
      category: 'Venda Manual',
      description: '',
      value: '',
      paymentMethodId: paymentMethods[0]?.id || '',
      status: 'pago',
      notes: ''
    });
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'pago': return <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />;
      case 'pendente': return <Clock className="w-3.5 h-3.5 text-amber-500" />;
      case 'cancelado': return <XCircle className="w-3.5 h-3.5 text-red-500" />;
      default: return null;
    }
  };

  return (
    <div className="p-4 md:p-6 space-y-4 md:space-y-6 max-w-[1600px] mx-auto">
      {/* Header Tabs and Actions combined */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        {/* Tabs */}
        <div className="flex items-center gap-2 bg-black/20 p-1.5 rounded-2xl w-full sm:w-fit border border-white/5">
          <button
            onClick={() => setActiveTab('movements')}
            className={cn(
              "flex-1 sm:flex-initial flex items-center justify-center gap-2 px-4 md:px-6 py-2.5 rounded-xl text-[9px] md:text-[10px] font-black uppercase tracking-widest transition-all",
              activeTab === 'movements' ? "bg-emerald-600 text-white" : "text-white/40 hover:text-white"
            )}
          >
            <Activity className="w-3.5 h-3.5" /> Movimentações
          </button>
          <button
            onClick={() => setActiveTab('reports')}
            className={cn(
              "flex-1 sm:flex-initial flex items-center justify-center gap-2 px-4 md:px-6 py-2.5 rounded-xl text-[9px] md:text-[10px] font-black uppercase tracking-widest transition-all",
              activeTab === 'reports' ? "bg-emerald-600 text-white" : "text-white/40 hover:text-white"
            )}
          >
            <FileText className="w-3.5 h-3.5" /> Relatórios
          </button>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2 w-full sm:w-auto self-end sm:self-auto justify-end">
           <button className="p-3 bg-white/5 hover:bg-white/10 text-white rounded-2xl transition-all h-12 w-12 flex items-center justify-center shrink-0">
             <Download className="w-5 h-5" />
           </button>
           <button 
            onClick={() => setShowAddModal(true)}
            className="flex-1 sm:flex-initial flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-500 text-white px-5 py-3 rounded-2xl font-black uppercase text-[10px] md:text-xs tracking-widest transition-all shadow-lg shadow-emerald-900/20 active:scale-95 h-12"
           >
             <Plus className="w-4 h-4 shrink-0" /> Nova Movimentação
           </button>
        </div>
      </div>

      {activeTab === 'movements' ? (
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 items-start">
          {/* Summary Cards */}
          <div className="lg:col-span-1 flex flex-col gap-4">
            <div className="bg-[#121212] border border-white/5 rounded-2xl p-4 relative overflow-hidden group">
               <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-500/5 blur-3xl -translate-y-1/2 translate-x-1/2" />
               <div className="flex items-center justify-between mb-3.5">
                 <span className="text-[10px] font-black uppercase tracking-[0.2em] text-white/20">Hoje</span>
                 <div className="p-1.5 bg-emerald-500/10 rounded-lg">
                    <TrendingUp className="w-3.5 h-3.5 text-emerald-500" />
                 </div>
               </div>
               <div className="space-y-3.5">
                  <div className="flex justify-between items-end">
                     <div>
                        <span className="block text-[8px] font-black uppercase text-white/20 tracking-widest mb-0.5">Entradas</span>
                        <span className="text-lg font-mono font-black text-emerald-400">R$ {summary.todayIn.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                     </div>
                     <div className="text-right">
                        <span className="block text-[8px] font-black uppercase text-white/20 tracking-widest mb-0.5">Saídas</span>
                        <span className="text-lg font-mono font-black text-red-400">R$ {summary.todayOut.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                     </div>
                  </div>
                  <div className="pt-2.5 border-t border-white/5 flex items-center justify-between">
                     <span className="text-[8px] font-black uppercase text-white/20 tracking-widest">Saldo Diário</span>
                     <p className={cn("text-xl font-mono font-black", summary.todayBalance >= 0 ? "text-white" : "text-red-500")}>
                        R$ {summary.todayBalance.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                     </p>
                  </div>
               </div>
            </div>

            <div className="bg-[#121212] border border-white/5 rounded-2xl p-4 relative overflow-hidden">
               <div className="absolute top-0 right-0 w-32 h-32 bg-blue-500/5 blur-3xl -translate-y-1/2 translate-x-1/2" />
               <div className="flex items-center justify-between mb-3.5">
                 <span className="text-[10px] font-black uppercase tracking-[0.2em] text-white/20">Este Mês</span>
                 <div className="p-1.5 bg-blue-500/10 rounded-lg">
                    <Calendar className="w-3.5 h-3.5 text-blue-500" />
                 </div>
               </div>
               <div className="space-y-3.5">
                  <div className="flex justify-between items-end">
                     <div>
                        <span className="block text-[8px] font-black uppercase text-white/20 tracking-widest mb-0.5">Entradas</span>
                        <span className="text-lg font-mono font-black text-emerald-400">R$ {summary.monthIn.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                     </div>
                     <div className="text-right">
                        <span className="block text-[8px] font-black uppercase text-white/20 tracking-widest mb-0.5">Saídas</span>
                        <span className="text-lg font-mono font-black text-red-450 text-red-400">R$ {summary.monthOut.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                     </div>
                  </div>
                  <div className="pt-2.5 border-t border-white/5 flex items-center justify-between">
                     <span className="text-[8px] font-black uppercase text-white/20 tracking-widest">Saldo Mensal</span>
                     <p className={cn("text-xl font-mono font-black", summary.monthBalance >= 0 ? "text-white" : "text-red-500")}>
                        R$ {summary.monthBalance.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                     </p>
                  </div>
               </div>
            </div>

            <div className="bg-[#121212] border border-white/5 rounded-2xl p-4 relative overflow-hidden">
               <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-500/5 blur-3xl -translate-y-1/2 translate-x-1/2" />
               <div className="flex items-center justify-between mb-3.5">
                 <span className="text-[10px] font-black uppercase tracking-[0.2em] text-white/20">Saldo Geral</span>
                 <div className="p-1.5 bg-emerald-500/10 rounded-lg">
                    <Wallet className="w-3.5 h-3.5 text-emerald-500" />
                 </div>
               </div>
               <div className="space-y-3.5">
                  <div className="flex justify-between items-end">
                     <div>
                        <span className="block text-[8px] font-black uppercase text-white/20 tracking-widest mb-0.5">Entradas Totais</span>
                        <span className="text-lg font-mono font-black text-emerald-400">R$ {summary.totalIn.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                     </div>
                     <div className="text-right">
                        <span className="block text-[8px] font-black uppercase text-white/20 tracking-widest mb-0.5">Saídas Totais</span>
                        <span className="text-lg font-mono font-black text-red-405 text-red-400">R$ {summary.totalOut.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                     </div>
                  </div>
                  <div className="pt-2.5 border-t border-white/5 flex items-center justify-between">
                     <span className="text-[8px] font-black uppercase text-white/20 tracking-widest">Total Geral</span>
                     <p className={cn("text-xl font-mono font-black", summary.totalBalance >= 0 ? "text-emerald-400" : "text-red-500")}>
                        R$ {summary.totalBalance.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                     </p>
                  </div>
               </div>
            </div>
          </div>

          {/* Filters & Table */}
          <div className="lg:col-span-3 bg-[#121212] border border-white/5 rounded-2xl overflow-hidden flex flex-col min-h-0">
         <div className="p-4 md:p-6 border-b border-white/5 flex flex-col lg:flex-row gap-4 justify-between bg-black/20">
            <div className="flex-1 relative">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-white/20" />
              <input 
                type="text"
                placeholder="Buscar por descrição, código ou categoria..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full bg-black/40 border border-white/10 rounded-2xl py-3 pl-12 pr-4 text-xs md:text-sm text-white focus:border-emerald-500/50 outline-none transition-all placeholder:text-white/10"
              />
            </div>
            <div className="flex items-center gap-3 overflow-x-auto pb-2 lg:pb-0 no-scrollbar uppercase w-full lg:w-auto">
               <div className="flex items-center gap-1.5 bg-black/40 border border-white/5 rounded-xl px-2 py-1 shrink-0">
                  {['all', 'entrada', 'saida'].map((type) => (
                    <button
                      key={type}
                      onClick={() => setTypeFilter(type as any)}
                      className={cn(
                        "px-3 py-1.5 rounded-lg text-[9px] font-black tracking-widest transition-all whitespace-nowrap",
                        typeFilter === type ? "bg-white/10 text-white shadow-lg" : "text-white/20 hover:text-white/40"
                      )}
                    >
                      {type === 'all' ? 'TODOS' : type.toUpperCase()}
                    </button>
                  ))}
               </div>
               <div className="flex items-center gap-1.5 bg-black/40 border border-white/5 rounded-xl px-2 py-1 shrink-0">
                  {['all', 'pago', 'pendente', 'cancelado'].map((status) => (
                    <button
                      key={status}
                      onClick={() => setStatusFilter(status)}
                      className={cn(
                        "px-3 py-1.5 rounded-lg text-[9px] font-black tracking-widest transition-all whitespace-nowrap",
                        statusFilter === status ? "bg-white/10 text-white shadow-lg" : "text-white/20 hover:text-white/40"
                      )}
                    >
                      {status === 'all' ? 'STATUS' : status.toUpperCase()}
                    </button>
                  ))}
               </div>
            </div>
         </div>

         <div className="hidden md:block flex-1 overflow-y-auto max-h-[340px] custom-scrollbar">
            <table className="w-full border-collapse text-left">
               <thead>
                  <tr className="border-b border-white/5 text-[9px] font-black uppercase tracking-[0.2em] text-white/20">
                     <th className="px-6 py-5">Código</th>
                     <th className="px-6 py-5">Movimentação</th>
                     <th className="px-6 py-5">Data / Hora</th>
                     <th className="px-6 py-5">Pagamento</th>
                     <th className="px-6 py-5">Valor</th>
                     <th className="px-6 py-5">Status</th>
                     <th className="px-6 py-5 text-right">Ação</th>
                  </tr>
               </thead>
               <tbody className="divide-y divide-white/5">
                  <AnimatePresence>
                     {filteredTransactions.map((t) => (
                        <motion.tr 
                          key={t.id}
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          exit={{ opacity: 0 }}
                          className="hover:bg-white/[0.02] transition-colors group"
                        >
                           <td className="px-6 py-5">
                              <span className="text-[10px] font-mono text-white/30">{t.code}</span>
                           </td>
                           <td className="px-6 py-5">
                              <div className="flex items-center gap-3">
                                 <div className={cn(
                                   "w-9 h-9 rounded-xl flex items-center justify-center shrink-0",
                                   t.type === 'entrada' ? "bg-emerald-500/10 text-emerald-500" : "bg-red-500/10 text-red-500"
                                 )}>
                                   {t.type === 'entrada' ? <ArrowUpRight className="w-5 h-5" /> : <ArrowDownLeft className="w-5 h-5" />}
                                 </div>
                                 <div>
                                    <h4 className="text-sm font-bold text-white group-hover:text-emerald-400 transition-colors">{t.description}</h4>
                                    <span className="text-[10px] uppercase font-black text-white/20 tracking-widest">{t.category}</span>
                                 </div>
                              </div>
                           </td>
                           <td className="px-6 py-5">
                              <div className="text-[11px] text-white/50">
                                 <div className="font-bold">{new Date(t.date).toLocaleDateString()}</div>
                                 <div className="text-[9px] opacity-40">{new Date(t.date).toLocaleTimeString()}</div>
                              </div>
                           </td>
                           <td className="px-6 py-5">
                              <div className="flex items-center gap-2">
                                 <div className="w-2 h-2 rounded-full bg-white/10" />
                                 <span className="text-[10px] font-bold text-white/60">{t.paymentMethodName || 'Não informado'}</span>
                              </div>
                           </td>
                           <td className="px-6 py-5">
                              <span className={cn(
                                "text-sm font-mono font-black",
                                t.type === 'entrada' ? "text-emerald-400" : "text-red-400"
                              )}>
                                {t.type === 'entrada' ? '+' : '-'} R$ {t.value.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                              </span>
                           </td>
                           <td className="px-6 py-5">
                              <div className="flex items-center gap-2">
                                 {getStatusIcon(t.status)}
                                 <span className={cn(
                                   "text-[10px] font-black uppercase tracking-widest",
                                   t.status === 'pago' ? "text-emerald-500" : t.status === 'pendente' ? "text-amber-500" : "text-red-500"
                                 )}>
                                   {t.status}
                                 </span>
                              </div>
                           </td>
                                                        <td className="px-6 py-5 text-right w-[180px]">
                               <div className="flex items-center justify-end gap-1.5">
                                  {t.status === 'pendente' ? (
                                     <>
                                        <button 
                                          onClick={() => updateTransaction(t.id, { status: 'pago' })}
                                          className="flex items-center gap-1 bg-emerald-500/10 hover:bg-emerald-500 text-emerald-400 hover:text-black border border-emerald-500/20 px-2.5 py-1 rounded-lg text-[9px] font-black uppercase tracking-wider transition-all cursor-pointer"
                                          title="Aprovar e Liquidar"
                                        >
                                          <CheckCircle2 className="w-3 h-3" /> Liquidar
                                        </button>
                                        <button 
                                          onClick={() => updateTransaction(t.id, { status: 'cancelado' })}
                                          className="flex items-center gap-1 bg-red-500/10 hover:bg-red-500 text-red-500 hover:text-white border border-red-500/20 px-2.5 py-1 rounded-lg text-[9px] font-black uppercase tracking-wider transition-all cursor-pointer"
                                          title="Recusar"
                                        >
                                          <XCircle className="w-3 h-3" /> Recusar
                                        </button>
                                     </>
                                  ) : (
                                     <button className="p-2 hover:bg-white/5 rounded-full transition-all text-white/10 hover:text-white">
                                        <MoreVertical className="w-4 h-4" />
                                     </button>
                                  )}
                               </div>
                            </td>
                        </motion.tr>
                     ))}
                  </AnimatePresence>
               </tbody>
            </table>

            {filteredTransactions.length === 0 && (
               <div className="py-20 flex flex-col items-center justify-center text-center opacity-20">
                  <AlertCircle className="w-16 h-16 mb-4" />
                  <h3 className="text-xl font-bold uppercase tracking-widest">Nenhuma movimentação</h3>
                  <p className="text-sm font-medium">Não encontramos registros para o filtro aplicado.</p>
               </div>
            )}
         </div>

         {/* Mobile Layout and Cards View */}
         <div className="block md:hidden border-t border-white/5 divide-y divide-white/5 max-h-[340px] overflow-y-auto custom-scrollbar">
            <AnimatePresence>
               {filteredTransactions.map((t) => (
                  <motion.div 
                     key={t.id}
                     initial={{ opacity: 0, y: 5 }}
                     animate={{ opacity: 1, y: 0 }}
                     exit={{ opacity: 0 }}
                     className="p-4 space-y-3 hover:bg-white/[0.01] transition-all"
                  >
                     <div className="flex items-start justify-between gap-3">
                        <div className="flex items-center gap-3 min-w-0">
                           <div className={cn(
                             "w-9 h-9 rounded-xl flex items-center justify-center shrink-0",
                             t.type === 'entrada' ? "bg-emerald-500/10 text-emerald-500" : "bg-red-500/10 text-red-500"
                           )}>
                             {t.type === 'entrada' ? <ArrowUpRight className="w-4 h-4" /> : <ArrowDownLeft className="w-4 h-4" />}
                           </div>
                           <div className="min-w-0">
                              <h4 className="text-xs font-bold text-white truncate">{t.description}</h4>
                              <div className="flex flex-wrap items-center gap-2">
                                 <span className="text-[9px] font-mono text-white/30">{t.code}</span>
                                 <span className="text-white/10 text-[8px]">•</span>
                                 <span className="text-[8px] uppercase font-black text-white/20 tracking-widest truncate max-w-[100px]">{t.category}</span>
                              </div>
                           </div>
                        </div>
                                                 {t.status === 'pendente' ? (
                            <div className="flex items-center gap-1.5 shrink-0">
                               <button 
                                 onClick={() => updateTransaction(t.id, { status: 'pago' })}
                                 className="p-1.5 bg-emerald-500/10 text-emerald-400 rounded-lg hover:bg-emerald-500 hover:text-black transition-all cursor-pointer"
                                 title="Aprovar"
                               >
                                 <CheckCircle2 className="w-4 h-4" />
                               </button>
                               <button 
                                 onClick={() => updateTransaction(t.id, { status: 'cancelado' })}
                                 className="p-1.5 bg-red-500/10 text-red-400 rounded-lg hover:bg-red-500 hover:text-white transition-all cursor-pointer"
                                 title="Recusar"
                               >
                                 <XCircle className="w-4 h-4" />
                               </button>
                            </div>
                         ) : (
                            <button className="p-1.5 hover:bg-white/5 rounded-full transition-all text-white/10 hover:text-white shrink-0">
                               <MoreVertical className="w-4 h-4" />
                            </button>
                         )}
                     </div>

                     <div className="grid grid-cols-2 gap-2 text-[10px] pt-2 border-t border-white/[0.03]">
                        <div className="space-y-0.5">
                           <span className="block text-[8px] font-black uppercase text-white/20 tracking-widest">Data / Meio</span>
                           <span className="font-bold text-white/60 block">{new Date(t.date).toLocaleDateString()} {new Date(t.date).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</span>
                           <span className="text-white/40 block font-semibold">{t.paymentMethodName || 'Não informado'}</span>
                        </div>
                        <div className="space-y-1 text-right">
                           <span className="block text-[8px] font-black uppercase text-white/20 tracking-widest">Valor / Status</span>
                           <div className="flex items-center justify-end gap-1">
                              <span className={cn(
                                "text-xs font-mono font-black",
                                t.type === 'entrada' ? "text-emerald-400" : "text-red-400"
                              )}>
                                {t.type === 'entrada' ? '+' : '-'} R$ {t.value.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                              </span>
                           </div>
                           <div className="flex items-center justify-end gap-1">
                              {getStatusIcon(t.status)}
                              <span className={cn(
                                "text-[8px] font-black uppercase tracking-widest",
                                t.status === 'pago' ? "text-emerald-500" : t.status === 'pendente' ? "text-amber-500" : "text-red-500"
                              )}>
                                {t.status}
                              </span>
                           </div>
                        </div>
                     </div>
                  </motion.div>
               ))}
            </AnimatePresence>

            {filteredTransactions.length === 0 && (
               <div className="py-20 flex flex-col items-center justify-center text-center opacity-20">
                  <AlertCircle className="w-16 h-16 mb-4" />
                  <h3 className="text-xl font-bold uppercase tracking-widest">Nenhuma movimentação</h3>
                  <p className="text-sm font-medium">Não encontramos registros para o filtro aplicado.</p>
               </div>
            )}
         </div>
        </div>
      </div>
      ) : (
        <FinancialReports />
      )}

      {/* Add Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/80 backdrop-blur-sm z-0" onClick={() => setShowAddModal(false)} />
          <motion.div 
            initial={{ opacity: 0, scale: 0.9, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            className="relative z-10 w-full max-w-xl bg-[#121212] border border-white/10 rounded-[40px] overflow-hidden shadow-2xl"
          >
            <div className="p-8 border-b border-white/5">
              <h3 className="text-2xl font-black text-white uppercase tracking-tighter">Nova Movimentação</h3>
              <p className="text-white/40 text-sm font-medium">Lançamento financeiro manual</p>
            </div>

            <form onSubmit={handleAddTransaction} className="p-8 space-y-6">
              <div className="grid grid-cols-2 gap-4 bg-black/40 p-2 rounded-2xl border border-white/5">
                <button 
                  type="button"
                  onClick={() => setFormData({...formData, type: 'entrada'})}
                  className={cn(
                    "flex items-center justify-center gap-2 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all",
                    formData.type === 'entrada' ? "bg-emerald-500 text-black" : "text-white/30 hover:text-white"
                  )}
                >
                  <ArrowUpRight className="w-4 h-4" /> Entrada
                </button>
                <button 
                  type="button"
                  onClick={() => setFormData({...formData, type: 'saida'})}
                  className={cn(
                    "flex items-center justify-center gap-2 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all",
                    formData.type === 'saida' ? "bg-red-500 text-black" : "text-white/30 hover:text-white"
                  )}
                >
                  <ArrowDownLeft className="w-4 h-4" /> Saída
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase text-white/30 tracking-widest ml-1">Categoria</label>
                  <input 
                    required
                    type="text"
                    value={formData.category}
                    onChange={(e) => setFormData({...formData, category: e.target.value})}
                    placeholder="Ex: Aluguel, Prolabore..."
                    className="w-full bg-black/40 border border-white/10 rounded-2xl p-4 text-sm text-white focus:border-emerald-500/50 outline-none"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase text-white/30 tracking-widest ml-1">Valor (R$)</label>
                  <input 
                    required
                    type="number"
                    step="0.01"
                    value={formData.value}
                    onChange={(e) => setFormData({...formData, value: e.target.value})}
                    className="w-full bg-black/40 border border-white/10 rounded-2xl p-4 text-sm text-white focus:border-emerald-500/50 outline-none"
                  />
                </div>
                <div className="md:col-span-2 space-y-2">
                  <label className="text-[10px] font-black uppercase text-white/30 tracking-widest ml-1">Descrição</label>
                  <input 
                    required
                    type="text"
                    value={formData.description}
                    onChange={(e) => setFormData({...formData, description: e.target.value})}
                    className="w-full bg-black/40 border border-white/10 rounded-2xl p-4 text-sm text-white focus:border-emerald-500/50 outline-none"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase text-white/30 tracking-widest ml-1">Meio de Pagamento</label>
                  <select 
                    value={formData.paymentMethodId}
                    onChange={(e) => setFormData({...formData, paymentMethodId: e.target.value})}
                    className="w-full bg-black/40 border border-white/10 rounded-2xl p-4 text-sm text-white focus:border-emerald-500/50 outline-none"
                  >
                    {paymentMethods.map(m => (
                      <option key={m.id} value={m.id}>{m.name}</option>
                    ))}
                  </select>
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase text-white/30 tracking-widest ml-1">Status</label>
                  <select 
                    value={formData.status}
                    onChange={(e) => setFormData({...formData, status: e.target.value})}
                    className="w-full bg-black/40 border border-white/10 rounded-2xl p-4 text-sm text-white focus:border-emerald-500/50 outline-none"
                  >
                    <option value="pago">Pago / Recebido</option>
                    <option value="pendente">Pendente</option>
                  </select>
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
                  Registrar Lançamento
                </button>
              </div>
            </form>
          </motion.div>
        </div>
      )}
    </div>
  );
}
