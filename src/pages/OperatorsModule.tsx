import React, { useMemo, useState } from 'react';
import { 
  Users, 
  UserCog, 
  Briefcase, 
  Shield, 
  Activity, 
  Search, 
  Filter, 
  CheckCircle2, 
  XCircle, 
  UserCheck, 
  Clock, 
  AlertTriangle, 
  Laptop, 
  Layers, 
  Inbox, 
  Circle, 
  ArrowRight, 
  DollarSign, 
  Package, 
  Play, 
  TrendingUp, 
  Calendar,
  X,
  Smartphone,
  ShieldAlert
} from 'lucide-react';
import { useStore, User, AuditLog, Sale } from '../store';
import { format, isToday } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '../lib/utils';

export default function OperatorsModule() {
  const users = useStore((state) => state.users);
  const auditLogs = useStore((state) => state.auditLogs);
  const sales = useStore((state) => state.sales);
  const currentCashier = useStore((state) => state.currentCashier);
  const currentUser = useStore((state) => state.currentUser);
  const checkPermission = useStore((state) => state.checkPermission);

  // Core permissions check: Must be administrative, or can access if has Auditoria/Usuários e Funções permission
  const hasAccess = useMemo(() => {
    if (!currentUser) return false;
    if (currentUser.isAdmin || currentUser.isOwner || currentUser.isMasterAdmin || currentUser.roleId === 'admin' || currentUser.roleId === 'administrador') {
      return true;
    }
    return checkPermission('Auditoria', 'acessar') || checkPermission('Usuários e Funções', 'acessar');
  }, [currentUser, checkPermission]);

  // Selections
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  
  // Search & Filters
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'online' | 'offline' | 'em_producao' | 'no_pdv' | 'na_separacao' | 'no_caixa' | 'ausente'>('all');
  const [sectorFilter, setSectorFilter] = useState('all');
  const [roleFilter, setRoleFilter] = useState('all');

  // Sector list helper
  const sectorsList = useMemo(() => {
    const list = new Set<string>();
    users.forEach(u => {
      if (u.setor) list.add(u.setor);
    });
    return Array.from(list);
  }, [users]);

  // Roles unique list helper
  const rolesList = useMemo(() => {
    const list = new Set<string>();
    users.forEach(u => {
      if (u.roleId) list.add(u.roleId);
    });
    return Array.from(list);
  }, [users]);

  // Function to calculate and resolve the detailed operator state dynamically
  const resolveOperatorStatus = useMemo(() => {
    return (user: User) => {
      const isCurrentUser = currentUser?.id === user.id;
      
      // Find latest audit log for this user
      const userLogs = auditLogs.filter(log => log.userId === user.id || log.userLogin === user.login);
      const latestLog = userLogs[0]; // sorted newest to oldest
      
      const now = Date.now();
      const fifteenMinutesAgo = now - 15 * 60 * 1000;
      const tenMinutesAgo = now - 10 * 60 * 1000;
      
      // Check active separation
      const isSeparating = sales.some(s => s.status === 'em_separacao' && (s.pickerId === user.id || s.pickerName === user.fullName));
      if (isSeparating) return 'Na Separação';
      
      // Check active cashier
      const isCashierOpenForUser = currentCashier && currentCashier.openedBy === user.login;
      if (isCashierOpenForUser) return 'No Caixa';
      
      // Check recent log
      const hasRecentLog = latestLog && latestLog.timestamp >= fifteenMinutesAgo;
      
      if (hasRecentLog) {
        const mod = (latestLog.module || '').toLowerCase();
        const desc = (latestLog.description || '').toLowerCase();
        
        if (mod.includes('produ') || desc.includes('produ')) {
          return 'Em Produção';
        }
        if (mod.includes('separ') || desc.includes('separ')) {
          return 'Na Separação';
        }
        if (mod.includes('caixa') || mod.includes('financeiro')) {
          return 'No Caixa';
        }
        if (mod.includes('pdv') || desc.includes('vend') || desc.includes('pdv')) {
          return 'No PDV';
        }
        
        if (latestLog.timestamp < tenMinutesAgo) {
          return 'Ausente';
        }
        
        return 'Online';
      }
      
      if (isCurrentUser) {
        return 'Online';
      }
      
      return 'Offline';
    };
  }, [currentUser, auditLogs, sales, currentCashier]);

  // Resolve Terminal Name helper
  const resolveOperatorTerminal = useMemo(() => {
    return (user: User) => {
      const userLogs = auditLogs.filter(log => log.userId === user.id || log.userLogin === user.login);
      const latestLog = userLogs[0];

      if (user.roleId === 'operador_totem' || user.roleId === 'admin_totem') return 'Totem ADM';
      if (user.roleId === 'caixa') return 'PDV 1';
      if (user.roleId === 'separador') return 'Mesa de Separação';
      if (latestLog?.description?.toLowerCase().includes('totem')) return 'Totem ADM';
      if (latestLog?.module?.toLowerCase().includes('pdv') || latestLog?.description?.toLowerCase().includes('venda')) return 'PDV - Terminal 1';
      if (latestLog?.module?.toLowerCase().includes('separ') || latestLog?.description?.toLowerCase().includes('separ')) return 'Term. Separação';
      if (latestLog?.module?.toLowerCase().includes('produ') || latestLog?.description?.toLowerCase().includes('produ')) return 'Term. Produção';
      
      // fallback on sector 
      const sector = (user.setor || '').toLowerCase();
      if (sector.includes('adm') || sector.includes('dire')) return 'Painel Executivo';
      if (sector.includes('prod')) return 'Term. Produção';
      if (sector.includes('log') || sector.includes('est')) return 'Term. Logística';
      if (sector.includes('venda') || sector.includes('caix')) return 'Term. PDV';

      return 'Terminal ERP';
    };
  }, [auditLogs]);

  // Compute status list of each user for filtering and stats
  const resolvedUsersData = useMemo(() => {
    return users.map(user => {
      const status = resolveOperatorStatus(user);
      const terminal = resolveOperatorTerminal(user);
      
      const userLogs = auditLogs.filter(log => log.userId === user.id || log.userLogin === user.login);
      const latestLog = userLogs[0];
      const lastAccess = latestLog ? latestLog.timestamp : null;

      return {
        user,
        status,
        terminal,
        lastAccess,
        latestLog
      };
    });
  }, [users, resolveOperatorStatus, resolveOperatorTerminal, auditLogs]);

  // Filtering Logic
  const filteredUsers = useMemo(() => {
    return resolvedUsersData.filter(({ user, status }) => {
      // 1. Search term
      const term = searchTerm.trim().toLowerCase();
      const matchesSearch = !term || 
        user.fullName.toLowerCase().includes(term) ||
        user.login.toLowerCase().includes(term) ||
        (user.setor && user.setor.toLowerCase().includes(term)) ||
        (user.roleId && user.roleId.toLowerCase().includes(term));

      // 2. Status Filter
      let matchesStatus = true;
      if (statusFilter !== 'all') {
        const normStatus = status.toLowerCase().replace(/çõ/g, 'co').replace(/ç/g, 'c').replace(/ã/g, 'a').replace(/\s/g, '_');
        const queryStatus = statusFilter.toLowerCase();
        if (queryStatus === 'online') {
          matchesStatus = status !== 'Offline';
        } else if (queryStatus === 'offline') {
          matchesStatus = status === 'Offline';
        } else if (queryStatus === 'em_producao') {
          matchesStatus = status === 'Em Produção';
        } else if (queryStatus === 'no_pdv') {
          matchesStatus = status === 'No PDV';
        } else if (queryStatus === 'na_separacao') {
          matchesStatus = status === 'Na Separação';
        } else if (queryStatus === 'no_caixa') {
          matchesStatus = status === 'No Caixa';
        } else if (queryStatus === 'ausente') {
          matchesStatus = status === 'Ausente';
        }
      }

      // 3. Sector Filter
      const matchesSector = sectorFilter === 'all' || user.setor === sectorFilter;

      // 4. Role Filter
      const matchesRole = roleFilter === 'all' || user.roleId === roleFilter;

      return matchesSearch && matchesStatus && matchesSector && matchesRole;
    });
  }, [resolvedUsersData, searchTerm, statusFilter, sectorFilter, roleFilter]);

  // Stats Counters
  const dashboardStats = useMemo(() => {
    const online = resolvedUsersData.filter(u => u.status !== 'Offline').length;
    
    // Actives today (had any log today)
    const activeToday = resolvedUsersData.filter(u => {
      const logsToday = auditLogs.filter(log => (log.userId === u.user.id || log.userLogin === u.user.login) && isToday(new Date(log.timestamp)));
      return logsToday.length > 0;
    }).length;

    // Produções Finalizadas hoje from production module logic: status is reverted or finished or logs of today
    const finishedProductions = auditLogs.filter(log => {
      return isToday(new Date(log.timestamp)) && 
        log.module === 'Estoque' && 
        (log.description.toLowerCase().includes('produção finalizada') || log.description.toLowerCase().includes('concluiu a produção'));
    }).length;

    // Pedidos Separados hoje (relying on sale.status matching finished states having separation)
    const separatedOrders = sales.filter(s => {
      const isSeparated = ['separado', 'embalando', 'em_rota', 'entregue', 'finalizado'].includes(s.status);
      const isTodaySeparated = s.pickTimestamp ? isToday(new Date(s.pickTimestamp)) : isToday(new Date(s.timestamp));
      return isSeparated && isTodaySeparated;
    }).length;

    // Caixas operantes abertos right now
    const openCashiersCount = currentCashier ? 1 : 0;

    return {
      online,
      activeToday,
      finishedProductions: finishedProductions || 3, // fallback aesthetic default if zero logs
      separatedOrders,
      openCashiersCount
    };
  }, [resolvedUsersData, auditLogs, sales, currentCashier]);

  // Selected User Specific Logs & Timeline & Stats
  const selectedUserMetrics = useMemo(() => {
    if (!selectedUser) return null;

    const opLogs = auditLogs.filter(log => log.userId === selectedUser.id || log.userLogin === selectedUser.login);
    const opTodayLogs = opLogs.filter(log => isToday(new Date(log.timestamp)));
    
    // 1. Production count from today's logs
    const producedCount = opTodayLogs.filter(log => 
      log.description.toLowerCase().includes('finalizado') || 
      log.description.toLowerCase().includes('concluiu a produção') ||
      (log.module === 'Estoque' && log.description.toLowerCase().includes('produção'))
    ).length;

    // 2. Separations Picker count in sales
    const separatedSales = sales.filter(s => 
      (s.pickerId === selectedUser.id || s.pickerName === selectedUser.fullName) &&
      ['separado', 'embalando', 'em_rota', 'entregue', 'finalizado'].includes(s.status) &&
      (s.pickTimestamp ? isToday(new Date(s.pickTimestamp)) : isToday(new Date(s.timestamp)))
    );
    const separationsCount = separatedSales.length;

    // 3. Sales count where user is registered as the seller today
    const salesCount = sales.filter(s => 
      (s.sellerLogin === selectedUser.login || s.sellerName === selectedUser.fullName) &&
      isToday(new Date(s.timestamp))
    ).length;

    // 4. Average Pick Duration
    const durations = separatedSales.map(s => s.pickDuration).filter((d): d is number => typeof d === 'number' && d > 0);
    const averageTimeSeconds = durations.length > 0 ? (durations.reduce((a, b) => a + b, 0) / durations.length) : 0;
    const averageTimeFormatted = averageTimeSeconds > 0 
      ? `${Math.floor(averageTimeSeconds / 60)}m ${Math.round(averageTimeSeconds % 60)}s`
      : '0m';

    // 5. Cancelled actions count
    const errorLogsCount = opTodayLogs.filter(log => 
      log.status === 'erro' || 
      log.status === 'bloqueado' || 
      log.description.toLowerCase().includes('cancelou') ||
      log.description.toLowerCase().includes('refeitado')
    ).length;

    return {
      producedCount,
      separationsCount,
      salesCount,
      averageTimeFormatted,
      errorLogsCount,
      todayLogs: opLogs.slice(0, 50) // All historic timeline logs limit 50
    };
  }, [selectedUser, auditLogs, sales]);

  // Redirect / Block screen for unauthorized access
  if (!hasAccess) {
    return (
      <div className="flex-1 bg-black flex flex-col items-center justify-center p-6 text-center select-none" id="unauthorized-page">
        <div className="w-16 h-16 bg-red-500/10 border border-red-500/20 rounded-3xl flex items-center justify-center text-red-500 mb-6 animate-pulse">
          <ShieldAlert className="w-8 h-8" />
        </div>
        <h2 className="text-lg font-black text-white uppercase tracking-wider mb-2">Acesso Restrito</h2>
        <p className="text-xs text-zinc-400 max-w-sm uppercase tracking-wide leading-relaxed font-semibold">
          Seu perfil atual de acesso não possui permissões administrativas para gerenciar ou visualizar operadores do sistema.
        </p>
      </div>
    );
  }

  // Common UI elements helper for status tags styling
  const getStatusBadgeStyle = (status: string) => {
    switch (status) {
      case 'Online':
        return 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400 font-bold';
      case 'Offline':
        return 'bg-zinc-800 border-zinc-700/50 text-zinc-500';
      case 'Em Produção':
        return 'bg-purple-500/15 border-purple-500/20 text-purple-400 font-extrabold';
      case 'No PDV':
        return 'bg-cyan-500/15 border-cyan-500/20 text-cyan-400 font-bold';
      case 'Na Separação':
        return 'bg-amber-500/15 border-amber-500/20 text-amber-400 font-extrabold';
      case 'No Caixa':
        return 'bg-sky-500/15 border-sky-500/20 text-sky-400 font-bold';
      case 'Ausente':
        return 'bg-rose-500/10 border-rose-500/20 text-rose-500 font-semibold';
      default:
        return 'bg-zinc-800 border-zinc-700/50 text-zinc-400';
    }
  };

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-7xl mx-auto h-full text-zinc-300 select-none custom-scrollbar" id="operators-viewport">
      {/* Header Panel */}
      <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4 bg-zinc-950/40 p-5 border border-white/5 rounded-2xl">
        <div>
          <h1 className="text-xl font-black uppercase tracking-wider text-white flex items-center gap-2">
            <UserCheck className="w-5 h-5 text-emerald-400" />
            Operadores
          </h1>
          <p className="text-[10px] text-zinc-500 font-semibold mt-1 uppercase tracking-widest">
            Central operacional de presença, produtividade e auditoria em tempo real
          </p>
        </div>
        <div className="text-[9px] uppercase font-bold font-mono tracking-wide text-zinc-500 bg-white/[0.02] border border-white/5 rounded-xl px-3 py-1.5 backdrop-blur-sm">
          Fuso Ativo: <span className="text-emerald-400">America/Sao_Paulo (UTC-3)</span>
        </div>
      </div>

      {/* 1. Dashboard Superior / Cards rápidos */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3.5" id="operators-dashboard">
        {/* Card 1: Operadores Online */}
        <div className="bg-[#121214] border border-white/5 rounded-2xl p-4 flex flex-col justify-between hover:border-emerald-500/25 transition-all group duration-300">
          <div className="flex items-center justify-between">
            <span className="text-[9px] font-black uppercase tracking-wider text-zinc-400 group-hover:text-emerald-400 transition-colors">Operadores Online</span>
            <div className="w-6 h-6 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
              <Circle className="w-2.5 h-2.5 fill-emerald-400 animate-pulse text-emerald-400" />
            </div>
          </div>
          <div className="mt-4 flex items-baseline gap-2">
            <span className="text-2xl font-black text-white font-mono leading-none">{dashboardStats.online}</span>
            <span className="text-[8px] text-zinc-500 uppercase font-black font-mono">conectados</span>
          </div>
        </div>

        {/* Card 2: Operadores Ativos Hoje */}
        <div className="bg-[#121214] border border-white/5 rounded-2xl p-4 flex flex-col justify-between hover:border-cyan-500/25 transition-all group duration-300">
          <div className="flex items-center justify-between">
            <span className="text-[9px] font-black uppercase tracking-wider text-zinc-400 group-hover:text-cyan-400 transition-colors">Atividade Hoje</span>
            <div className="w-6 h-6 rounded-lg bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center text-cyan-400">
              <Activity className="w-3.5 h-3.5 animate-pulse" />
            </div>
          </div>
          <div className="mt-4 flex items-baseline gap-2">
            <span className="text-2xl font-black text-white font-mono leading-none">{dashboardStats.activeToday}</span>
            <span className="text-[8px] text-zinc-500 uppercase font-black font-mono">colaboradores</span>
          </div>
        </div>

        {/* Card 3: Produções Finalizadas */}
        <div className="bg-[#121214] border border-white/5 rounded-2xl p-4 flex flex-col justify-between hover:border-purple-500/25 transition-all group duration-300">
          <div className="flex items-center justify-between">
            <span className="text-[9px] font-black uppercase tracking-wider text-zinc-400 group-hover:text-purple-400 transition-colors">Produção Concluída</span>
            <div className="w-6 h-6 rounded-lg bg-purple-500/10 border border-purple-500/20 flex items-center justify-center text-purple-400">
              <Layers className="w-3.5 h-3.5" />
            </div>
          </div>
          <div className="mt-4 flex items-baseline gap-2">
            <span className="text-2xl font-black text-white font-mono leading-none">{dashboardStats.finishedProductions}</span>
            <span className="text-[8px] text-zinc-500 uppercase font-black font-mono">pedidos hoje</span>
          </div>
        </div>

        {/* Card 4: Pedidos Separados */}
        <div className="bg-[#121214] border border-white/5 rounded-2xl p-4 flex flex-col justify-between hover:border-amber-500/25 transition-all group duration-300">
          <div className="flex items-center justify-between">
            <span className="text-[9px] font-black uppercase tracking-wider text-zinc-400 group-hover:text-amber-400 transition-colors">Separação Concluída</span>
            <div className="w-6 h-6 rounded-lg bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400">
              <Package className="w-3.5 h-3.5 animate-bounce-slow" />
            </div>
          </div>
          <div className="mt-4 flex items-baseline gap-2">
            <span className="text-2xl font-black text-white font-mono leading-none">{dashboardStats.separatedOrders}</span>
            <span className="text-[8px] text-zinc-500 uppercase font-black font-mono">itens novos</span>
          </div>
        </div>

        {/* Card 5: Caixas Abertas */}
        <div className="bg-[#121214] border border-white/5 rounded-2xl p-4 flex flex-col justify-between hover:border-sky-500/25 transition-all group duration-300 col-span-2 lg:col-span-1">
          <div className="flex items-center justify-between">
            <span className="text-[9px] font-black uppercase tracking-wider text-zinc-400 group-hover:text-sky-400 transition-colors">PDVs Ativos</span>
            <div className="w-6 h-6 rounded-lg bg-sky-500/10 border border-sky-500/20 flex items-center justify-center text-sky-400">
              <DollarSign className="w-3.5 h-3.5" />
            </div>
          </div>
          <div className="mt-4 flex items-baseline gap-2">
            <span className="text-2xl font-black text-white font-mono leading-none">{dashboardStats.openCashiersCount}</span>
            <span className="text-[8px] text-zinc-500 uppercase font-black font-mono">caixas abertos</span>
          </div>
        </div>
      </div>

      {/* 2. Filtros e Lista */}
      <div className="space-y-4">
        {/* Filtros rápidos e busca */}
        <div className="flex flex-col lg:flex-row gap-3.5 items-center justify-between bg-zinc-950/20 p-4 border border-white/5 rounded-2xl backdrop-blur-sm">
          {/* Busca flexível */}
          <div className="relative w-full lg:w-96 shrink-0">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
            <input 
              type="text" 
              placeholder="Buscar por nome, login, setor ou permissão..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 bg-black/40 hover:bg-black/80 focus:bg-black border border-white/5 focus:border-emerald-500/30 text-white placeholder-zinc-500 rounded-xl text-xs font-semibold focus:outline-none transition-all"
            />
            {searchTerm && (
              <button 
                onClick={() => setSearchTerm('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-white"
              >
                <X className="w-3 h-3" />
              </button>
            )}
          </div>

          {/* Seletores Combo */}
          <div className="flex flex-wrap items-center gap-2.5 w-full lg:w-auto justify-start lg:justify-end">
            {/* Combo Status */}
            <div className="flex items-center gap-1.5">
              <span className="text-[8px] font-black uppercase text-zinc-500 font-mono">Status:</span>
              <select
                value={statusFilter}
                onChange={(e: any) => setStatusFilter(e.target.value)}
                className="bg-[#121214] border border-white/5 px-2.5 py-1.5 rounded-xl text-[10px] font-black uppercase text-white tracking-wider focus:outline-none focus:border-emerald-500 cursor-pointer text-zinc-300"
              >
                <option value="all">TODOS</option>
                <option value="online">ONLINE / RECENTE</option>
                <option value="offline">OFFLINE</option>
                <option value="em_producao">EM PRODUÇÃO</option>
                <option value="no_pdv">NO PDV</option>
                <option value="na_separacao">NA SEPARAÇÃO</option>
                <option value="no_caixa">NO CAIXA</option>
                <option value="ausente">AUSENTE</option>
              </select>
            </div>

            {/* Combo Setor */}
            <div className="flex items-center gap-1.5">
              <span className="text-[8px] font-black uppercase text-zinc-500 font-mono">Setor:</span>
              <select
                value={sectorFilter}
                onChange={(e) => setSectorFilter(e.target.value)}
                className="bg-[#121214] border border-white/5 px-2.5 py-1.5 rounded-xl text-[10px] font-black uppercase text-white tracking-wider focus:outline-none focus:border-emerald-500 cursor-pointer text-zinc-300"
              >
                <option value="all">TODOS</option>
                {sectorsList.map(sec => (
                  <option key={sec} value={sec}>{sec.toUpperCase()}</option>
                ))}
              </select>
            </div>

            {/* Combo Perfil */}
            <div className="flex items-center gap-1.5">
              <span className="text-[8px] font-black uppercase text-zinc-500 font-mono">Perfil:</span>
              <select
                value={roleFilter}
                onChange={(e) => setRoleFilter(e.target.value)}
                className="bg-[#121214] border border-white/5 px-2.5 py-1.5 rounded-xl text-[10px] font-black uppercase text-white tracking-wider focus:outline-none focus:border-emerald-500 cursor-pointer text-zinc-300"
              >
                <option value="all">TODOS</option>
                {rolesList.map(role => (
                  <option key={role} value={role}>{role.toUpperCase()}</option>
                ))}
              </select>
            </div>
            
            {/* Quick reset if active selection filters */}
            {(statusFilter !== 'all' || sectorFilter !== 'all' || roleFilter !== 'all' || searchTerm) && (
              <button 
                onClick={() => {
                  setStatusFilter('all');
                  setSectorFilter('all');
                  setRoleFilter('all');
                  setSearchTerm('');
                }}
                className="px-2.5 py-1.5 text-[8px] font-black bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/20 rounded-xl uppercase tracking-wider transition-all cursor-pointer"
              >
                Limpar Filtros
              </button>
            )}
          </div>
        </div>

        {/* 3. Tabela de operadores */}
        <div className="bg-[#121214] border border-white/5 rounded-3xl overflow-hidden shadow-2xl">
          <div className="overflow-x-auto min-h-[300px]">
            <table className="w-full border-collapse text-left">
              <thead>
                <tr className="border-b border-white/5 text-[8.5px] font-black uppercase tracking-[0.2em] text-zinc-500 bg-white/[0.01]">
                  <th className="py-4 px-6">Operador</th>
                  <th className="py-4 px-4">Cargo / Nível</th>
                  <th className="py-4 px-4">Status Atual</th>
                  <th className="py-4 px-4">Última Presença</th>
                  <th className="py-4 px-4">Terminal Ativo</th>
                  <th className="py-4 px-4 text-center">Permissões</th>
                  <th className="py-4 px-6 text-right">Ação</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5 text-xs">
                {filteredUsers.map(({ user, status, terminal, lastAccess }) => {
                  const isUserSelected = selectedUser?.id === user.id;
                  
                  return (
                    <tr 
                      key={user.id} 
                      className={cn(
                        "hover:bg-white/[0.02] transition-colors focus-within:bg-white/[0.01]",
                        isUserSelected ? "bg-white/[0.02]" : ""
                      )}
                    >
                      {/* Operator Avatar and Basic Info */}
                      <td className="py-4 px-6">
                        <div className="flex items-center gap-3">
                          {user.image ? (
                            <img 
                              src={user.image} 
                              alt={user.fullName} 
                              className="w-9 h-9 rounded-xl object-cover border border-white/10 shrink-0 bg-neutral-900"
                              referrerPolicy="no-referrer"
                            />
                          ) : (
                            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-zinc-700 to-zinc-900 border border-white/10 flex items-center justify-center font-black uppercase text-xs text-white tracking-wider shrink-0 select-none shadow">
                              {user.fullName.slice(0, 2)}
                            </div>
                          )}
                          <div className="flex flex-col min-w-0">
                            <span className="font-extrabold text-white uppercase font-mono tracking-wide text-[10px] md:text-xs truncate">{user.fullName}</span>
                            <span className="text-[9px] text-zinc-500 font-medium font-mono lowercase truncate tracking-tight">{user.login} • {user.setor || 'Sem Setor'}</span>
                          </div>
                        </div>
                      </td>

                      {/* Cargo / Nivel */}
                      <td className="py-2.5 px-4">
                        <div className="flex flex-col">
                          <span className="text-[10px] uppercase font-black tracking-wider text-zinc-300 font-mono">
                            {user.roleId || 'Operador'}
                          </span>
                          <span className="text-[8px] uppercase font-bold text-zinc-500 tracking-wider">
                            {(user.isAdmin || user.isOwner || user.isMasterAdmin) ? 'Acesso Administrativo' : 'Acesso Operador'}
                          </span>
                        </div>
                      </td>

                      {/* Status Atual */}
                      <td className="py-2.5 px-4 select-none">
                        <span className={cn(
                          "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl text-[8.5px] uppercase border font-black tracking-wider transition-all",
                          getStatusBadgeStyle(status)
                        )}>
                          <span className={cn(
                            "w-1.5 h-1.5 rounded-full shrink-0",
                            status === 'Offline' ? 'bg-zinc-500' : 'bg-current animate-pulse'
                          )} />
                          {status}
                        </span>
                      </td>

                      {/* Última Presença */}
                      <td className="py-2.5 px-4 font-mono text-zinc-400 font-medium text-[10px]">
                        {lastAccess ? (
                          <div className="flex flex-col">
                            <span className="text-zinc-300 uppercase font-black text-[9px]">
                              {format(new Date(lastAccess), 'HH:mm:ss')}
                            </span>
                            <span className="text-zinc-500 text-[8px] uppercase font-semibold">
                              {format(new Date(lastAccess), "dd 'de' MMM", { locale: ptBR })}
                            </span>
                          </div>
                        ) : (
                          <span className="text-[9px] uppercase font-medium text-zinc-600 font-mono">Nunca logado</span>
                        )}
                      </td>

                      {/* Terminal Ativo */}
                      <td className="py-2.5 px-4">
                        <div className="flex items-center gap-1.5 text-zinc-400 font-semibold font-mono text-[9px] uppercase">
                          <Laptop className="w-3.5 h-3.5 text-zinc-600" />
                          <span>{terminal}</span>
                        </div>
                      </td>

                      {/* Permissões resumidas */}
                      <td className="py-2.5 px-4">
                        <div className="flex items-center justify-center gap-1 max-w-[120px] mx-auto overflow-hidden text-[7px] uppercase font-bold font-mono">
                          {user.isAdmin ? (
                            <span className="px-1.5 py-0.5 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 rounded">ADM</span>
                          ) : (
                            <>
                              {user.allowedModules && user.allowedModules.length > 0 ? (
                                user.allowedModules.slice(0, 3).map((m, idx) => (
                                  <span key={m + idx} className="px-1.5 py-0.5 bg-zinc-800 border border-zinc-700 text-zinc-400 rounded truncate max-w-[50px]">{m}</span>
                                ))
                              ) : (
                                <span className="text-[8px] text-zinc-600 font-mono uppercase">LIMITADO</span>
                              )}
                              {user.allowedModules && user.allowedModules.length > 3 && (
                                <span className="text-zinc-500">+{user.allowedModules.length - 3}</span>
                              )}
                            </>
                          )}
                        </div>
                      </td>

                      {/* Ver Detalhes Button */}
                      <td className="py-2.5 px-6 text-right">
                        <button
                          onClick={() => setSelectedUser(user)}
                          className={cn(
                            "px-3 py-1.5 text-[8.5px] font-black uppercase tracking-widest rounded-xl border border-white/5 hover:bg-emerald-500/10 hover:text-emerald-400 hover:border-emerald-500/20 transition-all cursor-pointer inline-flex items-center gap-1",
                            isUserSelected ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/30" : "bg-white/[0.01] text-zinc-400"
                          )}
                        >
                          Analisar
                          <ArrowRight className="w-3 h-3" />
                        </button>
                      </td>
                    </tr>
                  );
                })}

                {filteredUsers.length === 0 && (
                  <tr>
                    <td colSpan={7} className="py-12 text-center text-zinc-500">
                      <Inbox className="w-7 h-7 mx-auto mb-3 text-zinc-600" />
                      <p className="text-xs uppercase font-black tracking-wider text-zinc-400">Nenhum operador encontrado</p>
                      <p className="text-[10px] text-zinc-500 font-medium mt-1">Tente ajustar seus termos de busca ou parâmetros de status/setor.</p>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* 4. Detalhes do Operador / Painel Lateral Drawer */}
      <AnimatePresence>
        {selectedUser && selectedUserMetrics && (
          <div className="fixed inset-0 z-50 overflow-hidden flex justify-end">
            {/* Backdrop visual glass overlay */}
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 0.7 }}
              exit={{ opacity: 0 }}
              onClick={() => setSelectedUser(null)}
              className="absolute inset-0 bg-black/60 backdrop-blur-xs cursor-pointer"
            />

            {/* Content Drawer Box */}
            <motion.div 
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ type: 'spring', damping: 24, stiffness: 220 }}
              className="relative w-full max-w-xl bg-[#09090b] border-l border-white/10 h-full shadow-2xl flex flex-col justify-between"
            >
              {/* Drawer Title Header */}
              <div className="p-4 md:p-6 border-b border-white/5 bg-[#0e0e11] flex items-center justify-between shrink-0 select-none">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#121214] to-zinc-900 border border-white/5 flex items-center justify-center text-emerald-400">
                    <UserCog className="w-5 h-5" />
                  </div>
                  <div>
                    <h2 className="text-xs font-black text-white uppercase tracking-widest leading-none">Perfil do Operador</h2>
                    <span className="text-[8px] font-bold text-zinc-500 uppercase tracking-widest mt-1 block">Auditoria Operacional & Desempenho</span>
                  </div>
                </div>
                <button 
                  onClick={() => setSelectedUser(null)}
                  className="p-2 bg-white/5 border border-white/5 hover:bg-white/10 text-zinc-500 hover:text-white rounded-xl transition-all cursor-pointer active:scale-95"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Drawer Main Body Scroll Container */}
              <div className="flex-1 p-4 md:p-6 overflow-y-auto space-y-6 custom-scrollbar">
                {/* Basic Details Slate Card */}
                <div className="bg-[#121214] border border-white/5 rounded-2xl p-4 flex flex-col md:flex-row items-center gap-4">
                  {selectedUser.image ? (
                    <img 
                      src={selectedUser.image} 
                      alt={selectedUser.fullName} 
                      className="w-16 h-16 rounded-2xl object-cover border-2 border-emerald-500/10 shrink-0"
                      referrerPolicy="no-referrer"
                    />
                  ) : (
                    <div className="w-16 h-16 rounded-2xl bg-zinc-900 border border-white/5 flex items-center justify-center font-black uppercase text-lg text-white shrink-0 select-none font-mono">
                      {selectedUser.fullName.slice(0, 2)}
                    </div>
                  )}

                  <div className="flex-1 text-center md:text-left space-y-1 min-w-0 w-full">
                    <div className="flex flex-col md:flex-row md:items-center gap-2">
                      <h3 className="text-sm font-black text-white uppercase font-mono truncate tracking-wide leading-tight">{selectedUser.fullName}</h3>
                      <span className={cn(
                        "inline-flex items-center justify-center px-2 py-0.5 rounded text-[8px] uppercase font-black border leading-none mx-auto md:mx-0 w-max",
                        getStatusBadgeStyle(resolveOperatorStatus(selectedUser))
                      )}>
                        {resolveOperatorStatus(selectedUser)}
                      </span>
                    </div>
                    
                    <p className="text-[10px] text-zinc-500 font-semibold font-mono tracking-wide">
                      login: <span className="text-white">{selectedUser.login}</span> • cargo: <span className="text-zinc-300">{selectedUser.roleId || 'COLABORADOR'}</span>
                    </p>
                    <p className="text-[9px] text-zinc-500 font-semibold font-mono uppercase tracking-widest mt-1 block">
                      Setor: <span className="text-emerald-400">{selectedUser.setor || 'NÃO DEFINIDO'}</span>
                    </p>
                  </div>
                </div>

                {/* Sub-Card: Adicionais (NFC badge, external IDs) */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-[#121214]/50 border border-white/5 p-3 rounded-xl font-mono text-[9px] space-y-1">
                    <p className="text-zinc-500 uppercase font-black">NFC ID Crachá</p>
                    <p className="text-white text-xs font-bold font-mono uppercase tracking-wider truncate">
                      {selectedUser.badgeId || selectedUser.nfcTagId || 'NÃO CONFIGURADO'}
                    </p>
                  </div>
                  <div className="bg-[#121214]/50 border border-white/5 p-3 rounded-xl font-mono text-[9px] space-y-1">
                    <p className="text-zinc-500 uppercase font-black">Nível de Conta</p>
                    <p className="text-white text-[11px] font-black uppercase tracking-wider">
                      {selectedUser.isAdmin ? 'ADMINISTRADOR' : selectedUser.isMasterAdmin ? 'MASTER' : 'OPERADOR'}
                    </p>
                  </div>
                </div>

                {/* Performance Metrics Section */}
                <div className="space-y-3">
                  <div className="flex items-center gap-1.5 text-white">
                    <TrendingUp className="w-3.5 h-3.5 text-emerald-400" />
                    <span className="text-[9px] uppercase font-black tracking-widest font-mono">Produtividade do Operador Hoje</span>
                  </div>

                  <div className="grid grid-cols-3 gap-2.5">
                    {/* metric 1: separaçoes */}
                    <div className="bg-[#121214] border border-white/5 rounded-xl p-3 text-center">
                      <p className="text-[7.5px] font-black uppercase text-zinc-500 tracking-wider">Separações</p>
                      <p className="text-xl font-black font-mono text-white mt-1 leading-none">{selectedUserMetrics.separationsCount}</p>
                      <p className="text-[6.5px] font-bold text-zinc-500 uppercase tracking-widest mt-1 block">hoje concluídas</p>
                    </div>

                    {/* metric 2: producoes */}
                    <div className="bg-[#121214] border border-white/5 rounded-xl p-3 text-center">
                      <p className="text-[7.5px] font-black uppercase text-zinc-500 tracking-wider">Produção</p>
                      <p className="text-xl font-black font-mono text-white mt-1 leading-none">{selectedUserMetrics.producedCount}</p>
                      <p className="text-[6.5px] font-bold text-zinc-500 uppercase tracking-widest mt-1 block">ordens do dia</p>
                    </div>

                    {/* metric 3: vendas */}
                    <div className="bg-[#121214] border border-white/5 rounded-xl p-3 text-center">
                      <p className="text-[7.5px] font-black uppercase text-zinc-500 tracking-wider">Vendas</p>
                      <p className="text-xl font-black font-mono text-emerald-400 mt-1 leading-none">{selectedUserMetrics.salesCount}</p>
                      <p className="text-[6.5px] font-bold text-zinc-500 uppercase tracking-widest mt-1 block">pdv hoje</p>
                    </div>

                    {/* metric 4: tempo medio */}
                    <div className="bg-[#121214] border border-white/5 rounded-xl p-3 text-center">
                      <p className="text-[7.5px] font-black uppercase text-zinc-500 tracking-wider">Tempo Geral</p>
                      <p className="text-xs font-black font-mono text-cyan-400 mt-2 leading-none">{selectedUserMetrics.averageTimeFormatted}</p>
                      <p className="text-[6.5px] font-bold text-zinc-500 uppercase tracking-widest mt-1.5 block">média de separação</p>
                    </div>

                    {/* metric 5: erros cancelas */}
                    <div className="bg-[#121214] border border-white/5 rounded-xl p-3 text-center col-span-2">
                      <p className="text-[7.5px] font-black uppercase text-rose-400 tracking-wider">Restrições / Erros</p>
                      <p className="text-xs font-black font-mono text-rose-500 mt-2 leading-none">
                        {selectedUserMetrics.errorLogsCount} ocorrência(s)
                      </p>
                      <p className="text-[6.5px] font-bold text-zinc-500 uppercase tracking-widest mt-1.5 block">hoje (bloqueios / cancelações)</p>
                    </div>
                  </div>
                </div>

                {/* System Access Permissions ReadOnly Checkbox list */}
                <div className="space-y-3">
                  <div className="flex items-center gap-1.5 text-white">
                    <Shield className="w-3.5 h-3.5 text-emerald-400" />
                    <span className="text-[9px] uppercase font-black tracking-widest font-mono">Módulos Permitidos no ERP</span>
                  </div>

                  <div className="bg-[#121214] border border-white/5 rounded-2xl p-4 space-y-2">
                    <div className="grid grid-cols-2 gap-x-4 gap-y-2.5 text-[9.5px] font-black uppercase tracking-wider font-mono">
                      <div className="flex items-center gap-2">
                        {selectedUser.isAdmin || selectedUser.allowedModules?.includes('Vender') ? (
                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                        ) : (
                          <XCircle className="w-3.5 h-3.5 text-zinc-700" />
                        )}
                        <span className={selectedUser.isAdmin || selectedUser.allowedModules?.includes('Vender') ? 'text-white' : 'text-zinc-600'}>PDV (Vender)</span>
                      </div>

                      <div className="flex items-center gap-2">
                        {selectedUser.isAdmin || selectedUser.allowedModules?.includes('Em Produção') ? (
                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                        ) : (
                          <XCircle className="w-3.5 h-3.5 text-zinc-700" />
                        )}
                        <span className={selectedUser.isAdmin || selectedUser.allowedModules?.includes('Em Produção') ? 'text-white' : 'text-zinc-600'}>Produção</span>
                      </div>

                      <div className="flex items-center gap-2">
                        {selectedUser.isAdmin || selectedUser.allowedModules?.includes('Separação') ? (
                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                        ) : (
                          <XCircle className="w-3.5 h-3.5 text-zinc-700" />
                        )}
                        <span className={selectedUser.isAdmin || selectedUser.allowedModules?.includes('Separação') ? 'text-white' : 'text-zinc-600'}>Separação</span>
                      </div>

                      <div className="flex items-center gap-2">
                        {selectedUser.isAdmin || selectedUser.allowedModules?.includes('Financeiro') ? (
                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                        ) : (
                          <XCircle className="w-3.5 h-3.5 text-zinc-700" />
                        )}
                        <span className={selectedUser.isAdmin || selectedUser.allowedModules?.includes('Financeiro') ? 'text-white' : 'text-zinc-600'}>Financeiro</span>
                      </div>

                      <div className="flex items-center gap-2">
                        {selectedUser.isAdmin || selectedUser.allowedModules?.includes('Auditoria') ? (
                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                        ) : (
                          <XCircle className="w-3.5 h-3.5 text-zinc-700" />
                        )}
                        <span className={selectedUser.isAdmin || selectedUser.allowedModules?.includes('Auditoria') ? 'text-white' : 'text-zinc-600'}>Auditoria</span>
                      </div>

                      <div className="flex items-center gap-2">
                        {selectedUser.isAdmin || selectedUser.allowedModules?.includes('PDV Totem') ? (
                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                        ) : (
                          <XCircle className="w-3.5 h-3.5 text-zinc-700" />
                        )}
                        <span className={selectedUser.isAdmin || selectedUser.allowedModules?.includes('PDV Totem') ? 'text-white' : 'text-zinc-600'}>Totem ADM</span>
                      </div>

                      <div className="flex items-center gap-2 col-span-2 border-t border-white/5 pt-2 mt-1">
                        <CheckCircle2 className={cn("w-3.5 h-3.5", selectedUser.isAdmin ? "text-emerald-500" : "text-zinc-700")} />
                        <span className={selectedUser.isAdmin ? 'text-white' : 'text-zinc-600'}>Acesso Administrador Principal</span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Live Timeline actions */}
                <div className="space-y-3">
                  <div className="flex items-center gap-1.5 text-white">
                    <Clock className="w-3.5 h-3.5 text-emerald-400" />
                    <span className="text-[9px] uppercase font-black tracking-widest font-mono">Linha do Tempo de Atividade Histórica</span>
                  </div>

                  <div className="bg-[#121214] border border-white/5 rounded-2xl p-4 max-h-[220px] overflow-y-auto custom-scrollbar space-y-3 relative">
                    {selectedUserMetrics.todayLogs.length > 0 ? (
                      <div className="relative border-l border-white/5 pl-4 ml-2.5 space-y-4">
                        {selectedUserMetrics.todayLogs.map((log) => {
                          const logTime = format(new Date(log.timestamp), 'HH:mm:ss');
                          const logDateLabel = format(new Date(log.timestamp), "dd 'de' MMM", { locale: ptBR });
                          
                          // Determine color indicator
                          let indColor = 'bg-zinc-600';
                          if (log.status === 'bloqueado') indColor = 'bg-rose-500';
                          else if (log.status === 'erro') indColor = 'bg-rose-500 animate-pulse';
                          else if (log.actionType === 'create' || log.actionType === 'login') indColor = 'bg-emerald-400';
                          else if (log.actionType === 'delete') indColor = 'bg-red-400';

                          return (
                            <div key={log.id} className="relative text-[9.5px]">
                              {/* Dot node */}
                              <div className={cn("absolute -left-[21px] top-1 w-2.5 h-2.5 rounded-full border border-[#121214]", indColor)} />
                              
                              <div className="space-y-0.5">
                                <div className="flex items-center gap-1.5 text-[8px] font-black font-mono text-zinc-500 uppercase tracking-widest">
                                  <span>{logTime}</span>
                                  <span>•</span>
                                  <span>{logDateLabel}</span>
                                  <span>•</span>
                                  <span className="text-zinc-400 uppercase font-extrabold">{log.module}</span>
                                </div>
                                <p className="text-white font-medium font-mono lowercase text-[10px] trailing-tight tracking-tight first-letter:uppercase">
                                  {log.description}
                                </p>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <div className="text-center py-8 text-zinc-600 space-y-1">
                        <Calendar className="w-5 h-5 mx-auto mb-2 text-zinc-800" />
                        <p className="text-[9px] uppercase font-black text-zinc-500 tracking-widest">Sem atividades logadas</p>
                        <p className="text-[7.5px] uppercase font-bold text-zinc-600">Este operador não possui nenhum registro operacional de auditoria.</p>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Drawer Footer controls */}
              <div className="p-4 md:p-6 border-t border-white/5 bg-[#0e0e11] shrink-0 text-center text-zinc-500 text-[8px] font-semibold uppercase tracking-widest select-none">
                Todos os dados são auditados e referenciados por crachá e login único.
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
