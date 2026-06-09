import React, { useState, useMemo } from 'react';
import { useStore, Activity } from '../store';
import { 
  Clock, 
  Search, 
  Filter, 
  Calendar, 
  User, 
  Tag,
  ShoppingCart,
  History as CashierIcon,
  Package,
  Key,
  Zap,
  DollarSign,
  ClipboardList,
  AlertCircle,
  LayoutGrid,
  Store,
  ChevronLeft,
  ChevronRight
} from 'lucide-react';
import { cn } from '../lib/utils';
import { motion, AnimatePresence } from 'framer-motion';

export default function HistoryModule() {
  const activities = useStore((state) => state.activities);
  const [searchTerm, setSearchTerm] = useState('');
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [moduleFilter, setModuleFilter] = useState<string>('all');
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 15;

  // Reset page when filters change
  React.useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, typeFilter, moduleFilter]);

  const filteredActivities = useMemo(() => {
    return activities.filter(activity => {
      const matchesSearch = 
        (activity.message || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
        (activity.userName || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
        (activity.entityId || '').toLowerCase().includes(searchTerm.toLowerCase());
      
      const matchesType = typeFilter === 'all' || activity.type === typeFilter;
      const matchesModule = moduleFilter === 'all' || activity.module === moduleFilter;
      
      return matchesSearch && matchesType && matchesModule;
    });
  }, [activities, searchTerm, typeFilter, moduleFilter]);

  const pagedActivities = useMemo(() => {
    return filteredActivities.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);
  }, [filteredActivities, currentPage]);

  const totalPages = Math.ceil(filteredActivities.length / itemsPerPage) || 1;

  const uniqueModules = useMemo(() => {
    const modules = new Set(activities.map(a => a.module).filter(Boolean));
    return Array.from(modules) as string[];
  }, [activities]);

  const getActivityIcon = (type: Activity['type']) => {
    switch (type) {
      case 'sale': return <ShoppingCart className="w-4 h-4" />;
      case 'cashier': return <CashierIcon className="w-4 h-4" />;
      case 'inventory': return <Package className="w-4 h-4" />;
      case 'auth': return <Key className="w-4 h-4" />;
      case 'automation': return <Zap className="w-4 h-4" />;
      case 'financial': return <DollarSign className="w-4 h-4" />;
      case 'pre_order': return <ClipboardList className="w-4 h-4" />;
      case 'alert': return <AlertCircle className="w-4 h-4" />;
      case 'lojista': return <Store className="w-4 h-4" />;
      default: return <Tag className="w-4 h-4" />;
    }
  };

  const getActivityColor = (type: Activity['type']) => {
    switch (type) {
      case 'sale': return 'text-emerald-500 bg-emerald-500/10';
      case 'cashier': return 'text-purple-500 bg-purple-500/10';
      case 'inventory': return 'text-blue-500 bg-blue-500/10';
      case 'auth': return 'text-amber-500 bg-amber-500/10';
      case 'automation': return 'text-indigo-500 bg-indigo-500/10';
      case 'financial': return 'text-emerald-400 bg-emerald-400/10';
      case 'lojista': return 'text-amber-400 bg-amber-400/10';
      case 'pre_order': return 'text-pink-500 bg-pink-500/10';
      case 'alert': return 'text-red-500 bg-red-500/10';
      default: return 'text-white/40 bg-white/10';
    }
  };

  return (
    <div className="p-6 space-y-6 max-w-[1280px] mx-auto">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-black text-white uppercase tracking-tighter flex items-center gap-3">
            <Clock className="w-8 h-8 text-emerald-500" /> Linha do Tempo
          </h2>
          <p className="text-sm text-white/40 font-medium">Histórico geral de atividades do sistema</p>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-[#121212] border border-white/5 rounded-3xl p-4 space-y-4">
        <div className="relative">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-white/20" />
          <input 
            type="text"
            placeholder="Buscar por descrição, usuário ou ID..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full bg-black/40 border border-white/10 rounded-2xl py-3 pl-12 pr-4 text-sm text-white focus:border-emerald-500/50 outline-none transition-all placeholder:text-white/10"
          />
        </div>
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-2">
            <LayoutGrid className="w-4 h-4 text-white/40" />
            <select 
              value={moduleFilter}
              onChange={(e) => setModuleFilter(e.target.value)}
              className="bg-black/40 border border-white/10 rounded-xl py-2 px-4 text-[10px] font-black uppercase tracking-widest text-white outline-none"
            >
              <option value="all">Todos os Módulos</option>
              {uniqueModules.map(m => (
                <option key={m} value={m}>{m.toUpperCase()}</option>
              ))}
            </select>
          </div>
          <div className="flex items-center gap-2">
            <Filter className="w-4 h-4 text-white/40" />
            <select 
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
              className="bg-black/40 border border-white/10 rounded-xl py-2 px-4 text-[10px] font-black uppercase tracking-widest text-white outline-none"
            >
              <option value="all">Todos os Tipos</option>
              <option value="sale">Vendas</option>
              <option value="cashier">Caixa</option>
              <option value="inventory">Estoque</option>
              <option value="auth">Autenticação</option>
              <option value="automation">Automação</option>
              <option value="financial">Financeiro</option>
              <option value="lojista">Consignação</option>
              <option value="pre_order">Pré-Encomenda</option>
              <option value="alert">Alertas</option>
            </select>
          </div>
        </div>
      </div>

      {/* Timeline List */}
      <div className="relative space-y-4">
        <div className="absolute left-10 top-0 bottom-0 w-px bg-white/5" />
        
        <AnimatePresence>
          {pagedActivities.map((activity, i) => (
            <motion.div 
              key={activity.id}
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.02 }}
              className="relative flex items-start gap-8 group"
            >
              {/* Timeline Marker */}
              <div className={cn(
                "w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 z-10 transition-all shadow-lg",
                getActivityColor(activity.type),
                "group-hover:scale-110"
              )}>
                {getActivityIcon(activity.type)}
              </div>

              {/* Activity Card */}
              <div className="flex-1 bg-[#121212] border border-white/5 rounded-[24px] p-5 group-hover:bg-[#181818] transition-colors shadow-sm">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                  <div className="space-y-1">
                    <div className="flex items-center gap-3">
                      <span className="text-sm font-bold text-white leading-tight">{activity.message}</span>
                      {activity.entityId && (
                        <span className="px-2 py-0.5 bg-white/5 border border-white/10 rounded text-[8px] font-mono text-white/30 truncate max-w-[100px]">
                          #{activity.entityId.substring(0, 8)}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-3 text-[9px] font-black uppercase tracking-widest text-white/20">
                      <span className="flex items-center gap-1.5"><User className="w-3 h-3" /> {activity.userName || 'Sistema'}</span>
                      <span className="text-white/5">•</span>
                      <span className="flex items-center gap-1.5 text-emerald-500/50">{activity.module || 'Geral'}</span>
                    </div>
                  </div>

                  <div className="flex flex-col items-end shrink-0">
                    <div className="flex items-center gap-1.5 text-[10px] font-bold text-white/40">
                      <Calendar className="w-3.5 h-3.5" />
                      {new Date(activity.timestamp).toLocaleDateString()}
                    </div>
                    <div className="flex items-center gap-1.5 text-[9px] font-medium text-white/20 mt-0.5">
                      <Clock className="w-3 h-3" />
                      {new Date(activity.timestamp).toLocaleTimeString()}
                    </div>
                  </div>
                </div>
              </div>
            </motion.div>
          ))}
        </AnimatePresence>

        {filteredActivities.length === 0 && (
          <div className="py-20 flex flex-col items-center justify-center text-center opacity-20">
            <Clock className="w-16 h-16 mb-4" />
            <h3 className="text-xl font-bold uppercase tracking-widest">Nenhuma atividade registrada</h3>
            <p className="text-sm font-medium">As ações do sistema aparecerão aqui em tempo real.</p>
          </div>
        )}

        {/* Pagination Footer */}
        {totalPages > 1 && (
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-6 mt-4 border-t border-white/5 select-none font-mono text-[10px] font-black uppercase text-white/40">
            <div>
              Exibindo {currentPage} de {totalPages} Páginas ({filteredActivities.length} registros)
            </div>
            <div className="flex items-center gap-2">
              <button
                disabled={currentPage === 1}
                onClick={() => setCurrentPage(1)}
                className="p-2 border border-white/5 rounded-xl hover:bg-white/5 disabled:opacity-20 disabled:pointer-events-none transition-colors"
                title="Primeira Página"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button
                disabled={currentPage === 1}
                onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                className="px-3 py-2 border border-white/5 rounded-xl hover:bg-white/5 disabled:opacity-20 disabled:pointer-events-none tracking-widest transition-colors flex items-center gap-1"
              >
                Anterior
              </button>

              <div className="flex items-center gap-1">
                {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                  let pageNum = i + 1;
                  if (totalPages > 5 && currentPage > 3) {
                    pageNum = currentPage - 2 + i;
                    if (pageNum + (4 - i) > totalPages) {
                      pageNum = totalPages - 4 + i;
                    }
                  }
                  return (
                    <button
                      key={pageNum}
                      onClick={() => setCurrentPage(pageNum)}
                      className={cn(
                        "w-8 h-8 rounded-xl font-bold flex items-center justify-center transition-all",
                        currentPage === pageNum 
                          ? "bg-emerald-500 text-white shadow-lg shadow-emerald-500/20" 
                          : "bg-white/5 text-white/40 hover:bg-white/10"
                      )}
                    >
                      {pageNum}
                    </button>
                  );
                })}
              </div>

              <button
                disabled={currentPage === totalPages}
                onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                className="px-3 py-2 border border-white/5 rounded-xl hover:bg-white/5 disabled:opacity-20 disabled:pointer-events-none tracking-widest transition-colors flex items-center gap-1"
              >
                Próximo
              </button>
              <button
                disabled={currentPage === totalPages}
                onClick={() => setCurrentPage(totalPages)}
                className="p-2 border border-white/5 rounded-xl hover:bg-white/5 disabled:opacity-20 disabled:pointer-events-none transition-colors"
                title="Última Página"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
