import React, { useState, useMemo } from 'react';
import { useStore, CashierSession } from '../store';
import { 
  History, 
  Search, 
  Filter, 
  Calendar, 
  User, 
  ChevronRight, 
  Clock, 
  CheckCircle2, 
  AlertTriangle,
  ArrowUpRight,
  ArrowDownLeft,
  FileText,
  DollarSign
} from 'lucide-react';
import { cn } from '../lib/utils';
import { motion, AnimatePresence } from 'motion/react';

export default function CashierHistoryModule() {
  const cashierHistory = useStore((state) => state.cashierHistory);
  const paymentMethods = useStore((state) => state.paymentMethods);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [selectedSession, setSelectedSession] = useState<CashierSession | null>(null);

  const filteredHistory = useMemo(() => {
    return cashierHistory.filter(session => {
      const matchesSearch = 
        (session.id || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
        (session.openedBy || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
        (session.closedBy || '').toLowerCase().includes(searchTerm.toLowerCase());
      
      const matchesStatus = statusFilter === 'all' || session.status === statusFilter;
      
      return matchesSearch && matchesStatus;
    });
  }, [cashierHistory, searchTerm, statusFilter]);

  const getMethodName = (id: string) => {
    return paymentMethods.find(m => m.id === id)?.name || 'Outro';
  };

  return (
    <div className="p-6 space-y-6 max-w-[1600px] mx-auto">
      {/* Filters */}
      <div className="bg-[#121212] border border-white/5 rounded-3xl p-4 flex flex-col md:flex-row gap-4">
        <div className="flex-1 relative">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-white/20" />
          <input 
            type="text"
            placeholder="Buscar por ID ou usuário..."
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
            <option value="open">Abertos</option>
            <option value="closed">Fechados</option>
          </select>
        </div>
      </div>

      {/* History List */}
      <div className="grid grid-cols-1 gap-4">
        {filteredHistory.map((session) => {
          const diff = session.closingTime ? (session.actualClosingBalance || 0) - (session.expectedClosingBalance || 0) : 0;
          
          return (
            <div 
              key={session.id}
              onClick={() => setSelectedSession(session)}
              className="bg-[#121212] border border-white/5 rounded-3xl p-5 hover:border-emerald-500/30 transition-all cursor-pointer group"
            >
              <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
                <div className="flex items-center gap-4">
                  <div className={cn(
                    "w-12 h-12 rounded-2xl flex items-center justify-center font-black",
                    session.status === 'open' ? "bg-emerald-500/10 text-emerald-500" : "bg-white/5 text-white/40"
                  )}>
                    {session.status === 'open' ? 'OP' : 'CL'}
                  </div>
                  <div>
                    <h4 className="text-sm font-bold text-white uppercase tracking-tight flex items-center gap-2">
                      Sessão #{session.id.substring(0, 8)}
                      {session.status === 'open' && (
                        <span className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse" />
                      )}
                    </h4>
                    <div className="flex items-center gap-4 mt-1">
                      <span className="text-[10px] text-white/20 font-black uppercase flex items-center gap-1.5">
                        <Calendar className="w-3 h-3" /> {new Date(session.openingTime).toLocaleDateString()}
                      </span>
                      <span className="text-[10px] text-white/20 font-black uppercase flex items-center gap-1.5">
                        <User className="w-3 h-3" /> {session.openedBy || 'Administrator'}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
                  <div>
                    <span className="block text-[8px] font-black uppercase text-white/20 tracking-widest mb-1">Início</span>
                    <span className="text-sm font-mono font-bold text-white">R$ {(session.openingBalance ?? 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                  </div>
                  <div>
                    <span className="block text-[8px] font-black uppercase text-white/20 tracking-widest mb-1">Vendas</span>
                    <span className="text-sm font-mono font-bold text-emerald-400">R$ {(session.totalSales ?? 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                  </div>
                  {session.closingTime && (
                    <>
                      <div>
                        <span className="block text-[8px] font-black uppercase text-white/20 tracking-widest mb-1">Diferença</span>
                        <span className={cn(
                          "text-sm font-mono font-bold",
                          diff === 0 ? "text-white/40" : diff > 0 ? "text-emerald-400" : "text-red-400"
                        )}>
                          {diff > 0 ? '+' : ''}{(diff ?? 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                        </span>
                      </div>
                      <div>
                        <span className="block text-[8px] font-black uppercase text-white/20 tracking-widest mb-1">Status</span>
                        <span className="text-[10px] font-black uppercase tracking-widest text-white/60">Fechado</span>
                      </div>
                    </>
                  )}
                </div>

                <div className="flex items-center justify-end">
                   <ChevronRight className="w-5 h-5 text-white/10 group-hover:text-emerald-500 group-hover:translate-x-1 transition-all" />
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Empty State */}
      {filteredHistory.length === 0 && (
        <div className="py-20 flex flex-col items-center justify-center text-center opacity-20">
          <History className="w-16 h-16 mb-4" />
          <h3 className="text-xl font-bold uppercase tracking-widest">Sem histórico de caixa</h3>
          <p className="text-sm font-medium">As sessões aparecerão aqui conforme forem fechadas.</p>
        </div>
      )}

      {/* Detail Modal */}
      {selectedSession && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={() => setSelectedSession(null)} />
          <motion.div 
            initial={{ opacity: 0, scale: 0.9, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            className="w-full max-w-2xl bg-[#121212] border border-white/10 rounded-[40px] overflow-hidden relative shadow-2xl"
          >
            <div className="p-8 border-b border-white/5 flex items-start justify-between">
              <div>
                <h3 className="text-2xl font-black text-white uppercase tracking-tighter">Detalhes da Sessão</h3>
                <p className="text-white/40 text-[10px] font-black uppercase tracking-widest mt-1">ID: {selectedSession.id}</p>
              </div>
              <div className="flex items-center gap-2">
                <button 
                  onClick={() => setSelectedSession(null)}
                  className="w-10 h-10 rounded-full bg-white/5 flex items-center justify-center text-white/20 hover:bg-white/10 transition-all shadow-sm"
                >
                  &times;
                </button>
              </div>
            </div>

            <div id="cashier-session-detail" className="p-8 space-y-8 bg-[#121212]">
              {/* Timing & Users */}
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-black/20 p-4 rounded-2xl border border-white/5 space-y-4">
                  <div className="flex items-start gap-3">
                    <div className="w-8 h-8 rounded-lg bg-emerald-500/10 flex items-center justify-center text-emerald-500">
                      <Clock className="w-4 h-4" />
                    </div>
                    <div>
                      <span className="block text-[8px] font-black uppercase text-white/20 tracking-widest mb-0.5">Abertura</span>
                      <p className="text-xs font-bold text-white">{new Date(selectedSession.openingTime).toLocaleString()}</p>
                      <p className="text-[9px] text-white/40 font-medium uppercase mt-1">Por: {selectedSession.openedBy || 'Admin'}</p>
                    </div>
                  </div>
                </div>
                <div className="bg-black/20 p-4 rounded-2xl border border-white/5 space-y-4">
                  <div className="flex items-start gap-3">
                    <div className="w-8 h-8 rounded-lg bg-blue-500/10 flex items-center justify-center text-blue-500">
                      <Clock className="w-4 h-4" />
                    </div>
                    <div>
                      <span className="block text-[8px] font-black uppercase text-white/20 tracking-widest mb-0.5">Fechamento</span>
                      <p className="text-xs font-bold text-white">
                        {selectedSession.closingTime ? new Date(selectedSession.closingTime).toLocaleString() : '--:--:--'}
                      </p>
                      <p className="text-[9px] text-white/40 font-medium uppercase mt-1">Por: {selectedSession.closedBy || 'Admin'}</p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Financial Totals */}
              <div className="grid grid-cols-3 gap-4">
                <div className="bg-white/5 p-4 rounded-2xl border border-white/5">
                  <span className="block text-[8px] font-black uppercase text-white/20 tracking-widest mb-1">Saldo Inicial</span>
                  <p className="text-xl font-mono font-black text-white">R$ {(selectedSession.openingBalance ?? 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
                </div>
                <div className="bg-emerald-500/5 p-4 rounded-2xl border border-emerald-500/10">
                  <span className="block text-[8px] font-black uppercase text-emerald-500/40 tracking-widest mb-1">Vendas Totais</span>
                  <p className="text-xl font-mono font-black text-emerald-500">R$ {(selectedSession.totalSales ?? 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
                </div>
                <div className="bg-blue-500/5 p-4 rounded-2xl border border-blue-500/10">
                  <span className="block text-[8px] font-black uppercase text-blue-500/40 tracking-widest mb-1">Esperado</span>
                  <p className="text-xl font-mono font-black text-blue-400">R$ {(selectedSession.expectedClosingBalance || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
                </div>
              </div>

              {/* Payment Method Breakdown */}
              <div className="space-y-4">
                <h4 className="text-[10px] font-black uppercase text-white/30 tracking-[0.2em] flex items-center gap-2">
                  <DollarSign className="w-3 h-3 text-emerald-500" /> Totais por Meio de Pagamento
                </h4>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  {Object.entries(selectedSession.paymentMethodTotals).map(([methodId, total]) => (
                    <div key={methodId} className="bg-black/40 border border-white/5 p-3 rounded-xl">
                      <span className="block text-[8px] font-black uppercase text-white/20 truncate mb-1">{getMethodName(methodId)}</span>
                      <span className="text-xs font-mono font-bold text-white">R$ {(total as number).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                    </div>
                  ))}
                  {Object.keys(selectedSession.paymentMethodTotals).length === 0 && (
                    <div className="col-span-full py-2 text-center text-[10px] text-white/20 font-bold uppercase tracking-widest">Nenhuma venda realizada</div>
                  )}
                </div>
              </div>

              {/* Closure Result */}
              {selectedSession.closingTime && (
                <div className="pt-6 border-t border-white/5">
                  <div className="flex flex-col md:flex-row items-center justify-between gap-6 p-6 bg-black/40 rounded-3xl border border-white/5 relative overflow-hidden">
                    <div className="absolute top-0 right-0 w-32 h-32 bg-white/5 blur-3xl -translate-y-1/2 translate-x-1/2" />
                    <div>
                      <span className="block text-[10px] font-black uppercase text-white/20 tracking-widest mb-2 uppercase text-center md:text-left">Valor Contado</span>
                      <h3 className="text-4xl font-mono font-black tracking-tighter text-white text-center md:text-left">
                        R$ {(selectedSession.actualClosingBalance || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                      </h3>
                    </div>
                    
                    <div className="flex flex-col items-center md:items-end">
                      <span className="block text-[8px] font-black uppercase text-white/20 tracking-widest mb-1">Diferença</span>
                      <p className={cn(
                        "text-xl font-mono font-black",
                        (selectedSession.actualClosingBalance || 0) === (selectedSession.expectedClosingBalance || 0) 
                          ? "text-emerald-500" 
                          : (selectedSession.actualClosingBalance || 0) > (selectedSession.expectedClosingBalance || 0)
                            ? "text-blue-400"
                            : "text-red-500"
                      )}>
                        {((selectedSession.actualClosingBalance || 0) - (selectedSession.expectedClosingBalance || 0)).toLocaleString('pt-BR', { minimumFractionDigits: 2, signDisplay: 'always' })}
                      </p>
                    </div>
                  </div>

                  {selectedSession.notes && (
                    <div className="mt-6 flex items-start gap-4 p-4 bg-white/[0.02] rounded-2xl border border-white/5">
                       <FileText className="w-5 h-5 text-white/20 shrink-0" />
                       <div className="space-y-1">
                          <span className="block text-[8px] font-black uppercase text-white/20 tracking-widest">Observações</span>
                          <p className="text-xs text-white/60 italic leading-relaxed">"{selectedSession.notes}"</p>
                       </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </motion.div>
        </div>
      )}
    </div>
  );
}
