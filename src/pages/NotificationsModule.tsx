import { useState, useMemo, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Bell, 
  Search, 
  Trash2, 
  Check, 
  AlertTriangle, 
  Info, 
  CheckCircle, 
  ArrowRight, 
  Settings, 
  Printer, 
  ShoppingCart, 
  ShieldAlert, 
  CheckCircle2, 
  SlidersHorizontal, 
  User, 
  Clock, 
  Activity, 
  Database, 
  Wifi, 
  FileText, 
  Layers, 
  Box, 
  Home, 
  ArrowLeft,
  RefreshCw,
  PlusCircle,
  FileBadge2
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useStore, AIAlert } from '../store';
import { cn } from '../lib/utils';
import { environmentService } from '../services/environmentService';

export default function NotificationsModule() {
  const navigate = useNavigate();
  const alerts = useStore((state) => state.alerts);
  const updateAlertStatus = useStore((state) => state.updateAlertStatus);
  const deleteAlert = useStore((state) => state.deleteAlert);
  const addAlert = useStore((state) => state.addAlert);
  const setIsSettingsOpen = useStore((state) => state.setIsSettingsOpen);
  const setActiveSettingModule = useStore((state) => state.setActiveSettingModule);
  const addActivity = useStore((state) => state.addActivity);
  const currentUser = useStore((state) => state.currentUser);

  const [searchTerm, setSearchTerm] = useState('');
  const [selectedFilter, setSelectedFilter] = useState<'all' | 'critical' | 'operational' | 'logistics' | 'inventory' | 'print' | 'cashier' | 'system'>('all');
  const [showResolved, setShowResolved] = useState(false);

  // Active user name for logs
  const operatorName = currentUser?.fullName || 'Operador Central';

  // 1. Simulation triggers for manual validation of case studies
  const handleSimulateAlert = (
    title: string, 
    description: string, 
    priority: 'low' | 'medium' | 'high', 
    type: AIAlert['type']
  ) => {
    addAlert({
      title,
      description,
      priority,
      status: 'new',
      type
    });

    addActivity(
      `Evento operacional criado manualmente: ${title}`, 
      'alert', 
      'Notificações', 
      operatorName
    );
  };

  // 2. Mark matches for category filters
  const processedAlerts = useMemo(() => {
    return (alerts || []).filter(alert => {
      // 1. Search filter
      const matchesSearch = 
        alert.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
        alert.description.toLowerCase().includes(searchTerm.toLowerCase());

      // 2. Status filter (show resolved vs unresolved)
      const matchesStatus = showResolved ? true : alert.status !== 'resolved';

      // 3. Tab mapping
      let matchesFilter = true;
      if (selectedFilter === 'critical') {
        matchesFilter = alert.priority === 'high';
      } else if (selectedFilter !== 'all') {
        if (selectedFilter === 'operational') {
          matchesFilter = alert.type === 'sales';
        } else if (selectedFilter === 'logistics') {
          matchesFilter = alert.type === 'logistics';
        } else if (selectedFilter === 'inventory') {
          matchesFilter = alert.type === 'inventory';
        } else if (selectedFilter === 'print') {
          matchesFilter = alert.type === 'print' || alert.type === 'labels';
        } else if (selectedFilter === 'cashier') {
          matchesFilter = alert.type === 'cashier' || alert.type === 'financial';
        } else if (selectedFilter === 'system') {
          matchesFilter = alert.type === 'system';
        }
      }

      return matchesSearch && matchesStatus && matchesFilter;
    });
  }, [alerts, searchTerm, selectedFilter, showResolved]);

  // Direct statistics computed dynamically
  const stats = useMemo(() => {
    const list = alerts || [];
    return {
      total: list.filter(a => a.status !== 'resolved').length,
      high: list.filter(a => a.priority === 'high' && a.status !== 'resolved').length,
      medium: list.filter(a => a.priority === 'medium' && a.status !== 'resolved').length,
      low: list.filter(a => a.priority === 'low' && a.status !== 'resolved').length,
      resolved: list.filter(a => a.status === 'resolved').length,
    };
  }, [alerts]);

  // Bulk mutations
  const handleMarkAllAsSeen = () => {
    alerts.forEach(a => {
      if (a.status === 'new') {
        updateAlertStatus(a.id, 'seen');
      }
    });
    addActivity("Todas as notificações foram lidas", "alert", "Notificações", operatorName);
  };

  const handleResolveAll = () => {
    alerts.forEach(a => {
      if (a.status !== 'resolved') {
        updateAlertStatus(a.id, 'resolved');
      }
    });
    addActivity("Todas as notificações pendentes foram resolvidas", "alert", "Notificações", operatorName);
  };

  const handleClearHistory = () => {
    // Delete all resolved alerts
    alerts.forEach(a => {
      if (a.status === 'resolved') {
        deleteAlert(a.id);
      }
    });
    addActivity("Histórico de notificações limpo", "alert", "Notificações", operatorName);
  };

  // Navigational map when click callback triggers
  const handleAlertAction = (alert: AIAlert) => {
    if (alert.status === 'new') {
      updateAlertStatus(alert.id, 'seen');
    }

    if (alert.type === 'print') {
      setActiveSettingModule('cupons');
      setIsSettingsOpen(true);
    } else if (alert.type === 'labels') {
      navigate('/etiqueta-editor');
    } else if (alert.type === 'inventory') {
      navigate('/estoque');
    } else if (alert.type === 'sales' || alert.type === 'logistics') {
      navigate('/gestao-pedidos');
    } else if (alert.type === 'system') {
      setIsSettingsOpen(true);
      setActiveSettingModule('rede');
    } else if (alert.type === 'customers') {
      navigate('/clientes');
    } else if (alert.type === 'cashier' || alert.type === 'financial') {
      navigate('/abrir-caixa');
    } else {
      navigate('/');
    }
  };

  const getAlertStyle = (alert: AIAlert) => {
    const isResolved = alert.status === 'resolved';
    
    if (isResolved) {
      return {
        bg: 'bg-emerald-500/5 hover:bg-emerald-500/10 border-emerald-500/10',
        bar: 'bg-emerald-500',
        text: 'text-emerald-400',
        icon: <CheckCircle className="w-4 h-4 text-emerald-400 shrink-0" />,
        label: 'Resolvido'
      };
    }

    switch (alert.priority) {
      case 'high':
        return {
          bg: 'bg-red-500/5 hover:bg-red-500/10 border-red-500/20',
          bar: 'bg-red-500',
          text: 'text-red-400',
          icon: <ShieldAlert className="w-4 h-4 text-red-500 shrink-0" />,
          label: 'Crítico'
        };
      case 'medium':
        return {
          bg: 'bg-amber-500/5 hover:bg-amber-500/10 border-amber-500/20',
          bar: 'bg-amber-500',
          text: 'text-amber-400',
          icon: <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0" />,
          label: 'Atenção'
        };
      case 'low':
      default:
        return {
          bg: 'bg-blue-500/5 hover:bg-blue-500/10 border-blue-500/20',
          bar: 'bg-blue-500',
          text: 'text-blue-400',
          icon: <Info className="w-4 h-4 text-blue-500 shrink-0" />,
          label: 'Informativo'
        };
    }
  };

  const getCategoryBadge = (type: AIAlert['type']) => {
    switch (type) {
      case 'sales':
        return { text: 'Operacional', style: 'bg-rose-500/10 text-rose-400 border-rose-500/20' };
      case 'logistics':
        return { text: 'Logística', style: 'bg-purple-500/10 text-purple-400 border-purple-500/20' };
      case 'inventory':
        return { text: 'Estoque', style: 'bg-blue-500/10 text-blue-400 border-blue-500/20' };
      case 'print':
      case 'labels':
        return { text: 'Impressão/PDF', style: 'bg-amber-500/10 text-amber-400 border-amber-500/20' };
      case 'cashier':
      case 'financial':
        return { text: 'Financeiro/Caixa', style: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' };
      case 'system':
        return { text: 'Sistema', style: 'bg-zinc-700/35 text-zinc-300 border-zinc-700/50' };
      case 'customers':
        return { text: 'Clientes', style: 'bg-teal-500/10 text-teal-400 border-teal-500/20' };
      case 'info':
      default:
        return { text: 'Informativo', style: 'bg-sky-500/10 text-sky-400 border-sky-500/20' };
    }
  };

  return (
    <div className="min-h-full flex flex-col gap-4 bg-[#070707] text-zinc-100 p-3 md:p-6 overflow-y-auto custom-scrollbar select-text">
      
      {/* 1. CABEÇALHO MOBILE / DESKTOP */}
      <div className="flex flex-col xl:flex-row items-stretch xl:items-center justify-end gap-4 border-b border-zinc-800/60 pb-4">
        {/* Connection status operational lights */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-2 bg-[#111] border border-zinc-900 px-3 py-1.5 rounded-xl text-[9px] font-mono">
            <Database className="w-3.5 h-3.5 text-zinc-500" />
            <span className="text-zinc-500 uppercase font-black tracking-wider">IndexedDB:</span>
            <span className="text-emerald-400 font-bold">Online</span>
          </div>

          <div className="flex items-center gap-2 bg-[#111] border border-zinc-900 px-3 py-1.5 rounded-xl text-[9px] font-mono">
            <Wifi className="w-3.5 h-3.5 text-emerald-400 animate-pulse" />
            <span className="text-zinc-500 uppercase font-black tracking-wider">Sync:</span>
            <span className="text-emerald-400 font-bold">Ativa</span>
          </div>

          <div className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-500/10 border border-emerald-500/20 rounded-xl">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
            <span className="text-[9px] font-black text-emerald-400 tracking-wider uppercase">Operador: {operatorName}</span>
          </div>
        </div>
      </div>

      {/* KPI METRICS DECK */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 shrink-0">
        <div className="bg-[#111] border border-zinc-800/80 p-3.5 rounded-2xl relative overflow-hidden flex flex-col justify-between group">
          <div className="absolute right-3 top-3 w-1.5 h-1.5 rounded-full bg-zinc-500" />
          <span className="text-[8px] uppercase font-black text-zinc-400 tracking-wider block">Fila Pendente</span>
          <div className="flex items-baseline gap-2 mt-1">
            <h2 className="text-3xl font-black text-white font-mono leading-none">{stats.total}</h2>
            <span className="text-[9px] font-medium text-zinc-500">Alertas</span>
          </div>
        </div>

        <div className="bg-[#111] border border-zinc-800/80 p-3.5 rounded-2xl relative overflow-hidden flex flex-col justify-between group">
          <div className="absolute right-3 top-3 w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
          <span className="text-[8px] uppercase font-black text-red-400 tracking-wider block">Prioridade Crítica</span>
          <div className="flex items-baseline gap-2 mt-1">
            <h2 className="text-3xl font-black text-red-500 font-mono leading-none">{stats.high}</h2>
            <span className="text-[9px] font-bold text-red-500/70 uppercase">Tratar</span>
          </div>
        </div>

        <div className="bg-[#111] border border-zinc-800/80 p-3.5 rounded-2xl relative overflow-hidden flex flex-col justify-between group">
          <div className="absolute right-3 top-3 w-1.5 h-1.5 rounded-full bg-amber-500" />
          <span className="text-[8px] uppercase font-black text-amber-400 tracking-wider block">Atenção/Médias</span>
          <div className="flex items-baseline gap-2 mt-1">
            <h2 className="text-3xl font-black text-amber-500 font-mono leading-none">{stats.medium}</h2>
            <span className="text-[9px] font-bold text-amber-500/70 uppercase">Nível II</span>
          </div>
        </div>

        <div className="bg-[#111] border border-zinc-800/80 p-3.5 rounded-2xl relative overflow-hidden flex flex-col justify-between group">
          <div className="absolute right-3 top-3 w-1.5 h-1.5 rounded-full bg-emerald-500" />
          <span className="text-[8px] uppercase font-black text-emerald-400 tracking-wider block">Eventos Saneados</span>
          <div className="flex items-baseline gap-2 mt-1">
            <h2 className="text-3xl font-black text-emerald-400 font-mono leading-none">{stats.resolved}</h2>
            <span className="text-[9px] font-bold text-emerald-400/70 uppercase">Histórico</span>
          </div>
        </div>
      </div>

      {/* 2. DYNAMIC LIVE SIMULATION DECK (FOR TESTING EXPLICIT VALIDATION CASES) */}
      {(environmentService.isDevMode() || environmentService.isTestEnvironment()) && (
        <div className="bg-[#111] border border-zinc-800/80 rounded-2xl p-4 space-y-3 shrink-0">
          <div className="flex items-center justify-between border-b border-zinc-800/40 pb-2">
            <div className="flex items-center gap-1.5">
              <Activity className="w-4 h-4 text-emerald-400" />
              <h3 className="text-xs font-black uppercase text-white tracking-wider">Painel Integrador de Simulação</h3>
            </div>
            <span className="text-[8px] font-black uppercase text-zinc-500 tracking-widest font-mono">Disparadores para homologação</span>
          </div>
          
          <p className="text-[10px] text-zinc-400">
            Utilize o painel abaixo para simular instantaneamente as ocorrências técnicas e logísticas reais descritas para homologação. Os alertas fluem em toda a arquitetura de sincronização do ERP:
          </p>

          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
            <button
              onClick={() => handleSimulateAlert(
                "Pedido #108 Atrasado na Expedição",
                "SLA de despacho estourado há mais de 45 minutes. Risco iminente de atraso na rota de coleta da van logísitica.",
                "high",
                "sales"
              )}
              className="px-3 py-2 bg-red-950/20 hover:bg-red-950/40 border border-red-500/25 hover:border-red-500/50 rounded-xl text-left transition-all group scale-95 hover:scale-[0.98] duration-150 cursor-pointer"
            >
              <span className="block text-[11px] font-black text-red-400 truncate">🛑 SLA Atrasado</span>
              <span className="text-[8px] text-zinc-500 group-hover:text-zinc-300 leading-none">Simular Pedido</span>
            </button>

            <button
              onClick={() => handleSimulateAlert(
                "Falha Crítica de Spooler Térmico",
                "O driver de impressão local acusou erro de barramento lógico na impressora Zebra GC420d. Fila retida.",
                "high",
                "print"
              )}
              className="px-3 py-2 bg-[#111] hover:bg-zinc-900 border border-zinc-800 hover:border-amber-500/50 rounded-xl text-left transition-all group scale-95 hover:scale-[0.98] duration-150 cursor-pointer"
            >
              <span className="block text-[11px] font-black text-amber-400 truncate">🖨 Impressão Falhando</span>
              <span className="text-[8px] text-zinc-500 group-hover:text-zinc-300 leading-none">Simular Impressora</span>
            </button>

            <button
              onClick={() => handleSimulateAlert(
                "Reabastecimento de Estoque Requerido",
                "Item Camiseta Regata Vermelha atingiu estoque crítico mínimo (2 unidades no escaninho W-04).",
                "medium",
                "inventory"
              )}
              className="px-3 py-2 bg-[#111] hover:bg-zinc-900 border border-zinc-800 hover:border-blue-500/50 rounded-xl text-left transition-all group scale-95 hover:scale-[0.98] duration-150 cursor-pointer"
            >
              <span className="block text-[11px] font-black text-blue-400 truncate">⚡ Estoque Crítico</span>
              <span className="text-[8px] text-zinc-500 group-hover:text-zinc-300 leading-none">Simula Estoque</span>
            </button>

            <button
              onClick={() => handleSimulateAlert(
                "Sessão de Caixa Aberta com Sucesso",
                "Operador Matheus realizou a validação física e abriu o PDV com troco inicial registrado de R$ 150,00.",
                "low",
                "cashier"
              )}
              className="px-3 py-2 bg-[#111] hover:bg-zinc-900 border border-zinc-800 hover:border-emerald-500/50 rounded-xl text-left transition-all group scale-95 hover:scale-[0.98] duration-150 cursor-pointer"
            >
              <span className="block text-[11px] font-black text-emerald-400 truncate">💰 Caixa Iniciado</span>
              <span className="text-[8px] text-zinc-500 group-hover:text-zinc-300 leading-none">Simular Financeiro</span>
            </button>

            <button
              onClick={() => handleSimulateAlert(
                "Documento de Remessa PDF Emitido",
                "O manifesto multimodal de despacho para transporte expresso foi compilado no sistema com sucesso.",
                "low",
                "info"
              )}
              className="px-3 py-2 bg-[#111] hover:bg-zinc-900 border border-zinc-800 hover:border-emerald-500/50 rounded-xl text-left transition-all group scale-95 hover:scale-[0.98] duration-150 cursor-pointer"
            >
              <span className="block text-[11px] font-black text-emerald-400 truncate">📄 PDF Compilado</span>
              <span className="text-[8px] text-zinc-500 group-hover:text-zinc-300 leading-none">Simular Documento</span>
            </button>

            <button
              onClick={() => handleSimulateAlert(
                "Triagem do Pedido #102 Finalizada",
                "Separação do Pedido #102 finalizada por Matheus às 14:22 no PDV principal. Sincronizando etiquetas.",
                "low",
                "logistics"
              )}
              className="px-3 py-2 bg-[#111] hover:bg-zinc-900 border border-zinc-800 hover:border-purple-500/50 rounded-xl text-left transition-all group scale-95 hover:scale-[0.98] duration-150 cursor-pointer"
            >
              <span className="block text-[11px] font-black text-purple-400 truncate">📦 Triagem de Pedido</span>
              <span className="text-[8px] text-zinc-500 group-hover:text-zinc-300 leading-none">Simular Separação</span>
            </button>
          </div>
        </div>
      )}

      {/* CORE WORKSPACE CONTENT PANEL */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start">
        
        {/* LEFT COLUMN: FILTERS & ACTIONS BAR */}
        <div className="lg:col-span-3 space-y-3">
          
          <div className="bg-[#111] border border-zinc-800/80 rounded-2xl p-4 flex flex-col gap-3">
            <h3 className="text-xs font-black uppercase text-zinc-400 tracking-wider flex items-center gap-1.5">
              <SlidersHorizontal className="w-4 h-4 text-emerald-400" />
              Filtragem e Controle
            </h3>

            {/* Quick search inside alerts */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-600 w-3.5 h-3.5" />
              <input 
                type="text" 
                placeholder="Pesquisar por termo..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full bg-black/60 border border-zinc-800/80 rounded-xl py-2 pl-9 pr-3 text-xs text-white focus:border-emerald-500/50 outline-none transition-all placeholder:text-zinc-650"
              />
            </div>

            {/* Structured Category List */}
            <div className="flex flex-col gap-1">
              {[
                { id: 'all', label: 'Todas as Notificações', count: stats.total + stats.resolved },
                { id: 'critical', label: '🛑 Críticas e Urgências', count: stats.high },
                { id: 'operational', label: '📦 Operacional/Vendas', count: (alerts || []).filter(a => a.type === 'sales').length },
                { id: 'logistics', label: '🧺 Logística/Separação', count: (alerts || []).filter(a => a.type === 'logistics').length },
                { id: 'inventory', label: '⚡ Estoque e Endereços', count: (alerts || []).filter(a => a.type === 'inventory').length },
                { id: 'print', label: '🖨 Impressão e PDF', count: (alerts || []).filter(a => a.type === 'print' || a.type === 'labels').length },
                { id: 'cashier', label: '💰 Financeiro e Caixas', count: (alerts || []).filter(a => a.type === 'cashier' || a.type === 'financial').length },
                { id: 'system', label: '⚙ Servidores e Sistema', count: (alerts || []).filter(a => a.type === 'system').length },
              ].map(tab => (
                <button
                  key={tab.id}
                  onClick={() => setSelectedFilter(tab.id as any)}
                  className={cn(
                    "w-full text-left px-3 py-2 rounded-xl text-xs font-bold transition-all flex items-center justify-between border cursor-pointer",
                    selectedFilter === tab.id 
                      ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20 shadow-sm" 
                      : "bg-transparent text-zinc-400 border-transparent hover:bg-white/[0.02] hover:text-white"
                  )}
                >
                  <span>{tab.label}</span>
                  <span className={cn(
                    "text-[10px] font-mono px-1.5 py-0.5 rounded-md", 
                    selectedFilter === tab.id ? "bg-emerald-500/25 text-emerald-400" : "bg-zinc-800 text-zinc-500"
                  )}>
                    {tab.count}
                  </span>
                </button>
              ))}
            </div>

            {/* Read / Unread Status check */}
            <div className="border-t border-zinc-800/60 pt-3 flex items-center justify-between">
              <span className="text-[10px] font-black uppercase text-zinc-500 tracking-wider">Histórico Finalizado</span>
              <label className="relative inline-flex items-center cursor-pointer">
                <input 
                  type="checkbox" 
                  checked={showResolved}
                  onChange={(e) => setShowResolved(e.target.checked)}
                  className="sr-only peer"
                />
                <div className="w-9 h-5 bg-zinc-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-zinc-400 after:border-zinc-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-emerald-500 peer-checked:after:bg-black peer-checked:after:border-emerald-400"></div>
                <span className="ml-2 text-[10px] font-bold text-zinc-400 select-none">Exibir Resolvidos</span>
              </label>
            </div>
          </div>

          <div className="bg-[#111] border border-zinc-800/80 rounded-2xl p-4 flex flex-col gap-2">
            <h3 className="text-xs font-black uppercase text-zinc-400 tracking-wider">Ações em Lote</h3>
            <button
              onClick={handleMarkAllAsSeen}
              className="w-full py-2.5 bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 hover:border-zinc-700 rounded-xl text-center text-xs font-black uppercase tracking-wider text-zinc-300 hover:text-white transition-all cursor-pointer flex items-center justify-center gap-2"
            >
              <Check className="w-4 h-4 text-emerald-400" />
              Marcar lidas
            </button>

            <button
              onClick={handleResolveAll}
              className="w-full py-2.5 bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 hover:border-zinc-700 rounded-xl text-center text-xs font-black uppercase tracking-wider text-emerald-400/80 hover:text-emerald-400 transition-all cursor-pointer flex items-center justify-center gap-2"
            >
              <CheckCircle2 className="w-4 h-4 text-emerald-400" />
              Sanear todas
            </button>

            {showResolved && (
              <button
                onClick={handleClearHistory}
                className="w-full py-2.5 bg-red-950/20 hover:bg-red-950/40 border border-red-500/20 hover:border-red-500/40 rounded-xl text-center text-xs font-black uppercase tracking-wider text-red-400 hover:text-red-300 transition-all cursor-pointer flex items-center justify-center gap-2"
              >
                <Trash2 className="w-4 h-4" />
                Limpar Histórico
              </button>
            )}
          </div>

        </div>

        {/* RIGHT COLUMN: EVENT DISPATCH TERMINAL LIST */}
        <div className="lg:col-span-9 space-y-3">
          
          <div className="bg-[#111] border border-zinc-800/80 rounded-2xl p-4 flex flex-col gap-3 min-h-[450px]">
            <div className="flex items-center justify-between border-b border-zinc-800/60 pb-3">
              <div className="flex items-center gap-2">
                <Activity className="w-4.5 h-4.5 text-emerald-400" />
                <div>
                  <h3 className="text-xs font-black uppercase text-white tracking-wider">Console Geral de Despacho e Integridade</h3>
                  <p className="text-[8px] uppercase font-bold text-zinc-500">Listagem sincronizada localmente com o banco de telemetrias operacionais</p>
                </div>
              </div>

              <span className="text-[9px] font-mono text-zinc-400 bg-zinc-900 border border-zinc-800 px-2 py-0.5 rounded uppercase">
                {processedAlerts.length} Registros Encontrados
              </span>
            </div>

            {/* List */}
            {processedAlerts.length === 0 ? (
              <div className="flex-1 flex flex-col items-center justify-center py-16 text-center">
                <CheckCircle className="w-12 h-12 text-zinc-800 mb-2" />
                <span className="text-xs font-black uppercase text-zinc-400 tracking-wider">Tudo operando em conformidade</span>
                <p className="text-[10px] text-zinc-650 max-w-xs mt-1">A fila de despachos e auditoria não possui alertas ativos pendentes de saneamento tecnológico no momento.</p>
              </div>
            ) : (
              <div className="space-y-2 pr-1 max-h-[600px] overflow-y-auto custom-scrollbar">
                <AnimatePresence initial={false}>
                  {processedAlerts.map((alert) => {
                    const design = getAlertStyle(alert);
                    const category = getCategoryBadge(alert.type);
                    const isNew = alert.status === 'new';
                    const isResolved = alert.status === 'resolved';

                    return (
                      <motion.div
                        key={alert.id}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.95 }}
                        transition={{ duration: 0.15 }}
                        className={cn(
                          "p-3 rounded-xl border relative flex flex-col md:flex-row md:items-center justify-between gap-3 transition-colors group",
                          design.bg
                        )}
                      >
                        {/* Dynamic Priority physical indicator bar */}
                        <div className={cn("absolute left-0 top-0 bottom-0 w-[3px] rounded-l-xl", design.bar)} />

                        {/* Event Content */}
                        <div className="pl-3 flex items-start gap-3 min-w-0 flex-1">
                          
                          <div className={cn("w-8 h-8 rounded-lg flex items-center justify-center border shrink-0 bg-zinc-900 text-zinc-500", isNew ? "border-emerald-500/20 text-emerald-400" : "border-zinc-850")}>
                            {design.icon}
                          </div>

                          <div className="space-y-1 min-w-0 flex-1">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-xs font-black text-white tracking-tight leading-none">
                                {alert.title}
                              </span>
                              
                              {/* Read dot Indicator */}
                              {isNew && (
                                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse shrink-0" title="Alerta Não Lido" />
                              )}

                              {/* Target module identifier */}
                              <span className={cn("text-[8px] uppercase font-black px-1.5 py-0.5 rounded border leading-none tracking-wider shrink-0", category.style)}>
                                {category.text}
                              </span>
                              
                              {/* Priority badge */}
                              {!isResolved && (
                                <span className={cn(
                                  "text-[8px] uppercase font-bold px-1 rounded leading-none shrink-0", 
                                  alert.priority === 'high' ? 'bg-red-500/10 text-red-400' : alert.priority === 'medium' ? 'bg-amber-500/10 text-amber-400' : 'bg-blue-500/10 text-blue-400'
                                )}>
                                  {design.label}
                                </span>
                              )}
                            </div>

                            <p className="text-[11px] font-medium text-zinc-400 max-w-2xl text-left leading-relaxed">
                              {alert.description}
                            </p>

                            {/* Clock timer */}
                            <div className="flex items-center gap-2 text-[9px] font-mono text-zinc-500 pt-0.5">
                              <Clock className="w-3 h-3 text-zinc-600 shrink-0" />
                              <span>{new Date(alert.timestamp).toLocaleDateString('pt-BR')} às {new Date(alert.timestamp).toLocaleTimeString('pt-BR')}</span>
                              <span>•</span>
                              <span className="capitalize">Status: <strong className={cn(isNew ? "text-emerald-400" : isResolved ? "text-emerald-400" : "text-zinc-400")}>{isNew ? "Não lido" : isResolved ? "Saneado" : "Lido"}</strong></span>
                            </div>
                          </div>

                        </div>

                        {/* Operations Control triggers */}
                        <div className="flex items-center justify-end gap-2 shrink-0 border-t border-zinc-900 md:border-t-0 pt-2.5 md:pt-0 mt-1.5 md:mt-0 pl-11 md:pl-0">
                          
                          {/* Visual directional navigation shortcut */}
                          <button
                            onClick={() => handleAlertAction(alert)}
                            className="px-2.5 py-1.5 bg-zinc-900 hover:bg-[#10b981] hover:text-black border border-zinc-800 hover:border-emerald-500/40 rounded-lg text-[9px] font-black uppercase tracking-wider text-zinc-300 transition-colors flex items-center gap-1 cursor-pointer"
                            title="Ir para o módulo operacional"
                          >
                            Ir para Módulo
                            <ArrowRight className="w-3 h-3 stroke-[2.5]" />
                          </button>

                          {/* Saneamento triggers */}
                          {isNew && (
                            <button
                              onClick={() => updateAlertStatus(alert.id, 'seen')}
                              className="p-1.5 bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 rounded-lg text-zinc-400 hover:text-white transition-all cursor-pointer"
                              title="Marcar como lida"
                            >
                              <Check className="w-3.5 h-3.5" />
                            </button>
                          )}

                          {!isResolved && (
                            <button
                              onClick={() => updateAlertStatus(alert.id, 'resolved')}
                              className="p-1.5 bg-zinc-900 hover:bg-emerald-500/15 border border-zinc-800 rounded-lg text-zinc-400 hover:text-emerald-400 transition-all cursor-pointer"
                              title="Marcar como saneada"
                            >
                              <CheckCircle className="w-3.5 h-3.5" />
                            </button>
                          )}

                          {/* Delete */}
                          <button
                            onClick={() => deleteAlert(alert.id)}
                            className="p-1.5 bg-zinc-900 hover:bg-red-950/35 border border-zinc-800 hover:border-red-500/30 rounded-lg text-zinc-500 hover:text-red-400 transition-all cursor-pointer"
                            title="Descartar telemetria"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>

                        </div>

                      </motion.div>
                    );
                  })}
                </AnimatePresence>
              </div>
            )}
          </div>

        </div>

      </div>

    </div>
  );
}
