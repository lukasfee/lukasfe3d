import React, { useMemo, useCallback } from 'react';
import { motion } from 'motion/react';
import { 
  TrendingUp, 
  ClipboardList, 
  Box, 
  AlertTriangle, 
  Package, 
  CircleDollarSign, 
  ShieldAlert, 
  Printer, 
  Clock, 
  ArrowRight, 
  ShoppingCart,
  Users,
  CheckCircle2,
  FileText,
  Activity,
  Plus,
  ShieldCheck,
  PackageX,
  RefreshCw,
  Eye,
  Calendar
} from 'lucide-react';
import { cn } from '../lib/utils';
import { Link, useNavigate } from 'react-router-dom';
import { useStore } from '../store';
import { shallow } from 'zustand/shallow';
import {
  selectTodaySalesSummary,
  selectOpenOrdersCount,
  selectAwaitingPickingCount,
  selectInPickingSummary,
  selectMissingProductsCount,
  selectCriticalStockProducts,
  selectTodayRevenueSummary,
  selectHighRiskEventsCount,
  selectRecentAuditLogs,
  selectFocusOrders,
  selectClientsListCompact,
  selectAlertSales,
  selectAlertAuditLogs
} from '../store/selectors';

export default function Dashboard() {
  const navigate = useNavigate();
  
  // Stable raw state from the store
  const sales = useStore(state => state.sales);
  const products = useStore(state => state.products);
  const auditLogs = useStore(state => state.auditLogs);
  const clients = useStore(state => state.clients);
  const financialTransactions = useStore(state => state.financialTransactions);
  const currentUser = useStore(state => state.currentUser);

  // Premium granular calculations memoized to optimize render performance and prevent state churn
  const { salesCountToday, salesValueToday } = React.useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    const startOfToday = d.getTime();
    
    const todaySales = (sales || []).filter(
      (s: any) => s.timestamp >= startOfToday && s.status !== 'cancelado'
    );
    
    const count = todaySales.length;
    const totalValue = todaySales.reduce((acc: number, s: any) => acc + (s.total || 0), 0);
    
    return { count, totalValue };
  }, [sales]);

  const openOrdersCount = React.useMemo(() => {
    return (sales || []).filter((s: any) => !['finalizado', 'cancelado', 'entregue', 'retirado'].includes(s.status)).length;
  }, [sales]);

  const awaitingPickingCount = React.useMemo(() => {
    return (sales || []).filter(
      (s: any) => s.status === 'aguardando_separacao' || s.status === 'enviado_separacao'
    ).length;
  }, [sales]);

  const { inPickingCount, pickingResponsibles } = React.useMemo(() => {
    const inPickingOrders = (sales || []).filter((s: any) => s.status === 'em_separacao');
    const count = inPickingOrders.length;
    const list = inPickingOrders.map((s: any) => s.pickerName).filter(Boolean);
    const responsibles = Array.from(new Set(list)) as string[];
    return { count, pickingResponsibles: responsibles };
  }, [sales]);

  const missingProductsCount = React.useMemo(() => {
    return (sales || []).filter((s: any) => s.status === 'separado_com_faltantes').length;
  }, [sales]);

  const criticalStockProducts = React.useMemo(() => {
    return (products || [])
      .filter((p: any) => p.active !== false && !p.deleted && p.stock < p.minStock)
      .map((p: any) => ({
        id: p.id,
        name: p.name,
        code: p.code,
        stock: p.stock,
        minStock: p.minStock
      }));
  }, [products]);

  const { todayRevenueReceived, todayRevenuePending } = React.useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    const startOfToday = d.getTime();
    const todayTrans = (financialTransactions || []).filter(
      (t: any) => t.date >= startOfToday && t.type === 'entrada' && t.origin !== 'pre_encomenda'
    );
    const received = todayTrans.filter((t: any) => t.status === 'pago').reduce((acc: number, t: any) => acc + (t.value || 0), 0);
    const pending = todayTrans.filter((t: any) => t.status === 'pendente').reduce((acc: number, t: any) => acc + (t.value || 0), 0);
    return { todayRevenueReceived: received, todayRevenuePending: pending };
  }, [financialTransactions]);

  const highRiskEventsCount = React.useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    const startOfToday = d.getTime();
    return (auditLogs || []).filter(
      (log: any) => log.riskLevel === 'alto' && log.timestamp >= startOfToday
    ).length;
  }, [auditLogs]);

  const alertSales = React.useMemo(() => {
    return (sales || [])
      .filter((s: any) => s.status === 'separado_com_faltantes' || ['aguardando_separacao', 'enviado_separacao'].includes(s.status))
      .map((s: any) => ({
        id: s.id,
        status: s.status,
        orderNumber: s.orderNumber,
        pickerName: s.pickerName,
        missingItemsAuthorizedBy: s.missingItemsAuthorizedBy,
        timestamp: s.timestamp
      }));
  }, [sales]);

  const alertAuditLogs = React.useMemo(() => {
    const limitTimestamp = Date.now() - 24 * 60 * 60 * 1000;
    return (auditLogs || [])
      .filter((log: any) => log.timestamp >= limitTimestamp && (
        (log.action?.includes('Autorização') || log.description?.includes('Autorização')) ||
        (log.module === 'Impressão' && log.status === 'erro')
      ))
      .map((log: any) => ({
        id: log.id,
        action: log.action,
        description: log.description,
        userLogin: log.userLogin,
        module: log.module,
        status: log.status,
        timestamp: log.timestamp
      }));
  }, [auditLogs]);

  const recentActivitiesList = React.useMemo(() => {
    return (auditLogs || []).slice(0, 10).map((log: any) => ({
      id: log.id,
      description: log.description,
      userLogin: log.userLogin,
      timestamp: log.timestamp,
      action: log.action,
      module: log.module,
      riskLevel: log.riskLevel,
      status: log.status
    }));
  }, [auditLogs]);

  const focusOrders = React.useMemo(() => {
    const filtered = (sales || []).filter((s: any) => 
      ['aguardando_separacao', 'em_separacao', 'separado_com_faltantes', 'atrasado'].includes(s.status)
    );
    return filtered.slice(0, 10).map((s: any) => ({
      id: s.id,
      orderNumber: s.orderNumber,
      clientId: s.clientId,
      status: s.status,
      timestamp: s.timestamp,
      pickerName: s.pickerName
    }));
  }, [sales]);

  const clientsList = React.useMemo(() => {
    return (clients || []).map((c: any) => ({ 
      id: c.id, 
      name: c.name 
    }));
  }, [clients]);

  const todayRevenue = useMemo(() => ({
    received: todayRevenueReceived,
    pending: todayRevenuePending
  }), [todayRevenueReceived, todayRevenuePending]);

  // O(1) Quick Map for Client name lookup within loops
  const clientsMap = useMemo(() => {
    const map = new Map<string, string>();
    clientsList.forEach(c => map.set(c.id, c.name));
    return map;
  }, [clientsList]);

  // Time boundary of today (midnight)
  const startOfToday = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d.getTime();
  }, []);

  // Time elapsed calculator string
  const getElapsedTimeString = useCallback((timestamp: number) => {
    const elapsedMs = Date.now() - timestamp;
    const minutes = Math.floor(elapsedMs / (1000 * 60));
    if (minutes < 1) return 'Agora';
    if (minutes < 60) return `${minutes}m`;
    const hours = Math.floor(minutes / 60);
    const remainingMinutes = minutes % 60;
    if (hours < 24) {
      return `${hours}h ${remainingMinutes}m`;
    }
    const days = Math.floor(hours / 24);
    return `${days}d ${hours % 24}h`;
  }, []);

  // 2. Active actionable alerts
  const activeAlerts = useMemo(() => {
    const list: Array<{
      id: string;
      type: 'missing' | 'stock' | 'stuck' | 'auth' | 'print' | 'general';
      title: string;
      message: string;
      severity: 'high' | 'medium' | 'info';
      timestamp: number;
    }> = [];

    // Alert for sales with missing items
    alertSales.forEach(s => {
      if (s.status === 'separado_com_faltantes') {
        list.push({
          id: `missing-${s.id}`,
          type: 'missing',
          title: `Itens Faltantes - Pedido #${s.orderNumber}`,
          message: `Separado com cortes por ${s.pickerName || 'Separador'}. Autorizado por ${s.missingItemsAuthorizedBy || 'ADM'}.`,
          severity: 'high',
          timestamp: s.timestamp
        });
      }
    });

    // Stock alert general statement
    if (criticalStockProducts.length > 0) {
      list.push({
        id: 'critical-stock-summary',
        type: 'stock',
        title: 'Estoque Crítico Requer Atenção',
        message: `Existem ${criticalStockProducts.length} produtos operando abaixo do mínimo recomendador.`,
        severity: 'high',
        timestamp: Date.now()
      });
    }

    // Stuck Orders (> 4 hours waiting separation)
    alertSales.forEach(s => {
      if (['aguardando_separacao', 'enviado_separacao'].includes(s.status) && (Date.now() - s.timestamp > 4 * 60 * 60 * 1000)) {
        list.push({
          id: `stuck-${s.id}`,
          type: 'stuck',
          title: `Pedido Retido #${s.orderNumber}`,
          message: `O pedido está aguardando separação há ${getElapsedTimeString(s.timestamp)}.`,
          severity: 'medium',
          timestamp: s.timestamp
        });
      }
    });

    // Recent Admin Authorizations & Printing errors in past 24 hours
    alertAuditLogs.forEach(log => {
      if (log.action?.includes('Autorização') || log.description?.includes('Autorização')) {
        list.push({
          id: `auth-${log.id}`,
          type: 'auth',
          title: 'Acesso Concedido via Master',
          message: `${log.description} por ${log.userLogin || 'Administrador'}.`,
          severity: 'medium',
          timestamp: log.timestamp
        });
      }
      if (log.module === 'Impressão' && log.status === 'erro') {
        list.push({
          id: `print-${log.id}`,
          type: 'print',
          title: 'Erro de Impressão Detectado',
          message: `Falha ao imprimir cupom/etiqueta: ${log.description}.`,
          severity: 'high',
          timestamp: log.timestamp
        });
      }
    });

    return list.sort((a, b) => b.timestamp - a.timestamp);
  }, [alertSales, criticalStockProducts, alertAuditLogs, getElapsedTimeString]);


  // Timeline UI icon mapper
  const getLogIcon = (log: any) => {
    const textDesc = (log.description || '').toLowerCase();
    const actionText = (log.action || '').toLowerCase();
    
    if (actionText.includes('criado') || textDesc.includes('criado') || textDesc.includes('nova venda')) return Plus;
    if (actionText.includes('iniciada') || textDesc.includes('iniciou') || actionText.includes('separação iniciada')) return Clock;
    if (actionText.includes('concluída') || textDesc.includes('concluiu')) return CheckCircle2;
    if (log.module === 'Estoque' || actionText.includes('ajuste') || textDesc.includes('estoque')) return Package;
    if (log.module === 'Impressão' || textDesc.includes('imprimiu') || textDesc.includes('impressão')) return Printer;
    if (log.riskLevel === 'alto' || actionText.includes('autorização') || textDesc.includes('master')) return ShieldAlert;
    return Activity;
  };

  const getLogColorStyles = (log: any) => {
    if (log.riskLevel === 'alto') return 'text-red-400 bg-red-500/10 border-red-500/20';
    if (log.status === 'erro') return 'text-amber-500 bg-amber-500/10 border-amber-500/20';
    
    const textDesc = (log.description || '').toLowerCase();
    const actionText = (log.action || '').toLowerCase();

    if (actionText.includes('concluída') || textDesc.includes('concluiu')) {
      return 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20';
    }
    if (actionText.includes('iniciada')) {
      return 'text-blue-400 bg-blue-500/10 border-blue-500/20';
    }
    if (log.module === 'Estoque') {
      return 'text-purple-400 bg-purple-500/10 border-purple-500/20';
    }
    return 'text-white/40 bg-white/5 border-white/5';
  };

  const viewOrderDetails = (orderId: string) => {
    navigate('/gestao-pedidos', { state: { orderId } });
  };

  const getStatusLabelAndColor = (status: string) => {
    switch (status) {
      case 'aguardando_separacao':
        return { label: 'Aguardando', class: 'bg-slate-500/10 text-slate-400 border border-slate-500/20' };
      case 'em_separacao':
        return { label: 'Em Separação', class: 'bg-blue-500/10 text-blue-400 border border-blue-500/20' };
      case 'separado_com_faltantes':
        return { label: 'Itens Faltantes', class: 'bg-rose-500/10 text-rose-400 border border-rose-500/20 animate-pulse' };
      case 'atrasado':
        return { label: 'Atrasado', class: 'bg-amber-500/10 text-amber-500 border border-amber-500/20' };
      default:
        return { label: 'Em Processo', class: 'bg-white/10 text-white/50 border border-white/5' };
    }
  };

  return (
    <div className="min-h-full bg-black text-zinc-300 py-3.5 px-3 md:px-5 select-none overflow-y-auto custom-scrollbar">
      
      {/* Header Info Panel */}
      <div className="max-w-7xl mx-auto flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4 pb-2.5 border-b border-zinc-900">
        <div>
          <p className="text-[8.5px] text-emerald-400 tracking-[0.2em] font-black uppercase mb-0.5">WMS / VISÃO OPERACIONAL PREMIUM</p>
          <div className="flex items-center gap-2">
            <h1 className="text-lg font-black text-white uppercase tracking-tight">Painel de Controle</h1>
            <span className="text-[9px] font-mono font-bold bg-[#10b981]/10 border border-[#10b981]/20 text-emerald-400 px-1.5 py-0.5 rounded uppercase">
              {currentUser?.fullName || currentUser?.login}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2 self-start sm:self-auto">
          <div className="flex items-center gap-1.5 bg-zinc-900/50 border border-zinc-800 rounded-lg px-2.5 py-1 font-mono text-[9px] font-bold text-zinc-400">
            <Calendar className="w-3 h-3 text-emerald-400" />
            <span>{new Date().toLocaleDateString('pt-BR', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
          </div>
          
          <button 
            onClick={() => window.location.reload()} 
            className="p-1 px-2 bg-zinc-900/50 border border-zinc-800 rounded-lg hover:bg-zinc-800 text-zinc-400 hover:text-white transition-all active:scale-95 flex items-center gap-1 text-[9px] uppercase font-black"
            title="Atualizar Dados"
          >
            <RefreshCw className="w-3 h-3" />
            <span className="hidden xs:inline">Sync</span>
          </button>
        </div>
      </div>

      <div className="max-w-7xl mx-auto space-y-4">

        {/* 1. Main KPI Cards Grid */}
        <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-7 gap-2">
          
          {/* Card 1: Today Sales */}
          <div className="bg-zinc-950/40 border border-zinc-800 p-2.5 flex flex-col justify-between rounded-xl relative overflow-hidden group">
            <div className="flex items-center justify-between mb-1">
              <div className="p-1 bg-emerald-500/10 rounded text-emerald-400 border border-emerald-500/15">
                <TrendingUp className="w-3.5 h-3.5" />
              </div>
              <span className="text-[8px] font-black text-emerald-400 tracking-wider">HOJE</span>
            </div>
            <div>
              <p className="text-[7.5px] uppercase font-black text-zinc-500 tracking-wider leading-none mb-0.5">Vendas</p>
              <h2 className="text-sm font-black text-white leading-none">{salesCountToday} Vendas</h2>
              <p className="text-[9px] font-mono text-emerald-400 font-semibold mt-0.5">R$ {(salesValueToday ?? 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
            </div>
          </div>

          {/* Card 2: Open/Waiting Orders */}
          <div className="bg-zinc-950/40 border border-zinc-800 p-2.5 flex flex-col justify-between rounded-xl relative overflow-hidden group">
            <div className="flex items-center justify-between mb-1">
              <div className="p-1 bg-sky-500/10 rounded text-sky-400 border border-sky-500/15">
                <ClipboardList className="w-3.5 h-3.5" />
              </div>
              <div className="w-1.5 h-1.5 bg-sky-400 rounded-full animate-pulse" />
            </div>
            <div>
              <p className="text-[7.5px] uppercase font-black text-zinc-500 tracking-wider leading-none mb-0.5">Fila Separação</p>
              <h2 className="text-sm font-black text-white leading-none">{awaitingPickingCount} Pendentes</h2>
              <p className="text-[9px] text-zinc-400 mt-0.5 font-medium">{openOrdersCount} abertos</p>
            </div>
          </div>

          {/* Card 3: In Picking Status */}
          <div className="bg-zinc-950/40 border border-zinc-800 p-2.5 flex flex-col justify-between rounded-xl relative overflow-hidden group">
            <div className="flex items-center justify-between mb-1">
              <div className="p-1 bg-cyan-500/10 rounded text-cyan-400 border border-cyan-500/15">
                <Box className="w-3.5 h-3.5" />
              </div>
              <span className="text-[7px] font-mono uppercase bg-cyan-500/10 text-cyan-400 px-1 py-0.5 rounded font-black">EM CURSO</span>
            </div>
            <div>
              <p className="text-[7.5px] uppercase font-black text-zinc-500 tracking-wider leading-none mb-0.5">Separando</p>
              <h2 className="text-sm font-black text-white leading-none">{inPickingCount} Ativos</h2>
              <p className="text-[8.5px] text-zinc-400 mt-0.5 truncate" title={pickingResponsibles.join(', ')}>
                {pickingResponsibles.length > 0 ? pickingResponsibles[0].split(' ')[0] : "Sem operadores"}
              </p>
            </div>
          </div>

          {/* Card 4: Picking cuts (Separado com faltas) */}
          <div className={cn(
            "p-2.5 flex flex-col justify-between rounded-xl relative overflow-hidden border transition-all",
            missingProductsCount > 0 
              ? "bg-red-950/15 border-red-800/40 text-red-300"
              : "bg-zinc-950/40 border-zinc-800"
          )}>
            <div className="flex items-center justify-between mb-1">
              <div className={cn(
                "p-1 rounded border",
                missingProductsCount > 0 
                  ? "bg-red-500/10 border-red-500/20 text-red-400" 
                  : "bg-zinc-900 border-zinc-800 text-zinc-500"
              )}>
                <PackageX className="w-3.5 h-3.5" />
              </div>
              {missingProductsCount > 0 && (
                <span className="flex h-1.5 w-1.5 relative">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-red-500"></span>
                </span>
              )}
            </div>
            <div>
              <p className="text-[7.5px] uppercase font-black text-zinc-500 tracking-wider leading-none mb-0.5">Cortes/Faltantes</p>
              <h2 className="text-sm font-black text-white leading-none">{missingProductsCount} Pedidos</h2>
              <p className={cn(
                "text-[9px] font-semibold mt-0.5",
                missingProductsCount > 0 ? "text-red-400" : "text-zinc-500"
              )}>
                {missingProductsCount > 0 ? "Requer atenção" : "Sem divergências"}
              </p>
            </div>
          </div>

          {/* Card 5: Critical Inventory below minimum limits */}
          <div className={cn(
            "p-2.5 flex flex-col justify-between rounded-xl relative overflow-hidden border transition-all",
            criticalStockProducts.length > 0 
              ? "bg-amber-950/10 border-amber-800/40"
              : "bg-zinc-950/40 border-zinc-800"
          )}>
            <div className="flex items-center justify-between mb-1">
              <div className={cn(
                "p-1 rounded border",
                criticalStockProducts.length > 0 
                  ? "bg-amber-500/10 border-amber-500/20 text-amber-500" 
                  : "bg-zinc-900 border-zinc-800 text-zinc-500"
              )}>
                <Package className="w-3.5 h-3.5" />
              </div>
            </div>
            <div>
              <p className="text-[7.5px] uppercase font-black text-zinc-500 tracking-wider leading-none mb-0.5">Estoque Crítico</p>
              <h2 className="text-sm font-black text-white leading-none">{criticalStockProducts.length} Itens</h2>
              <p className={cn(
                "text-[9px] font-semibold mt-0.5",
                criticalStockProducts.length > 0 ? "text-amber-500" : "text-emerald-400"
              )}>
                {criticalStockProducts.length > 0 ? "Reposição imediata" : "Nível ideal"}
              </p>
            </div>
          </div>

          {/* Card 6: Daily Financial Revenue */}
          <div className="bg-zinc-950/40 border border-zinc-800 p-2.5 flex flex-col justify-between rounded-xl relative overflow-hidden group">
            <div className="flex items-center justify-between mb-1">
              <div className="p-1 bg-emerald-500/15 rounded text-emerald-400 border border-emerald-500/10">
                <CircleDollarSign className="w-3.5 h-3.5" />
              </div>
              <span className="text-[7px] font-mono bg-emerald-950/40 text-emerald-400 px-1 py-0.5 rounded font-black">CAIXA</span>
            </div>
            <div>
              <p className="text-[7.5px] uppercase font-black text-zinc-500 tracking-wider leading-none mb-0.5">Receita Hoje</p>
              <h2 className="text-sm font-black text-emerald-400 leading-none">R$ {(todayRevenue?.received ?? 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</h2>
              <p className="text-[9px] text-zinc-500 mt-0.5">Pendente: R$ {(todayRevenue?.pending ?? 0).toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}</p>
            </div>
          </div>

          {/* Card 7: Audit system threats count */}
          <div className={cn(
            "p-2.5 flex flex-col justify-between rounded-xl relative overflow-hidden border transition-all",
            highRiskEventsCount > 0 
              ? "bg-red-950/20 border-red-800"
              : "bg-zinc-950/40 border-zinc-800 hover:border-zinc-700"
          )}>
            <div className="flex items-center justify-between mb-1">
              <div className={cn(
                "p-1 rounded border",
                highRiskEventsCount > 0 
                  ? "bg-red-500/20 border-red-500/30 text-red-500" 
                  : "bg-zinc-900 border-zinc-800 text-zinc-500"
              )}>
                <ShieldAlert className="w-3.5 h-3.5" />
              </div>
              {highRiskEventsCount > 0 && <span className="bg-red-500 text-white text-[7px] font-black font-sans px-1 rounded animate-pulse">RISCO</span>}
            </div>
            <div>
              <p className="text-[7.5px] uppercase font-black text-zinc-500 tracking-wider leading-none mb-0.5">Segurança</p>
              <h2 className="text-sm font-black text-white leading-none">{highRiskEventsCount} Bloqueios</h2>
              <p className={cn(
                "text-[9px] font-bold mt-0.5",
                highRiskEventsCount > 0 ? "text-red-400" : "text-zinc-600"
              )}>
                {highRiskEventsCount > 0 ? "Auditar" : "Logs limpos"}
              </p>
            </div>
          </div>

        </div>

        {/* 2. Quick Shortcuts Grid Navigation */}
        <div className="bg-zinc-950/20 border border-zinc-900 rounded-2xl p-2.5 shadow-sm">
          <p className="text-[7.5px] font-black uppercase text-zinc-500 tracking-[0.25em] mb-1.5 px-1">Atalhos Operacionais</p>
          
          <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
            
            {/* Short 1 */}
            <motion.div whileHover={{ y: -1 }} whileTap={{ scale: 0.98 }} className="flex">
              <Link to="/pdv" className="hover:no-underline w-full p-2 bg-zinc-900/40 border border-zinc-800 rounded-xl flex items-center justify-center gap-1.5 hover:border-emerald-500/30 hover:text-emerald-400 group duration-150 cursor-pointer text-zinc-400">
                <ShoppingCart className="w-3.5 h-3.5 text-emerald-400" />
                <span className="text-[9px] font-bold uppercase tracking-wider group-hover:text-white">PDV</span>
              </Link>
            </motion.div>

            {/* Short 2 */}
            <motion.div whileHover={{ y: -1 }} whileTap={{ scale: 0.98 }} className="flex">
              <Link to="/gestao-pedidos" className="hover:no-underline w-full p-2 bg-zinc-900/40 border border-zinc-800 rounded-xl flex items-center justify-center gap-1.5 hover:border-blue-500/30 hover:text-blue-400 group duration-150 cursor-pointer text-zinc-400">
                <ClipboardList className="w-3.5 h-3.5 text-blue-400" />
                <span className="text-[9px] font-bold uppercase tracking-wider group-hover:text-white">Pedidos</span>
              </Link>
            </motion.div>

            {/* Short 3 */}
            <motion.div whileHover={{ y: -1 }} whileTap={{ scale: 0.98 }} className="flex">
              <Link to="/separacao" className="hover:no-underline w-full p-2 bg-zinc-900/40 border border-zinc-800 rounded-xl flex items-center justify-center gap-1.5 hover:border-amber-500/30 hover:text-amber-400 group duration-150 cursor-pointer text-zinc-400">
                <Box className="w-3.5 h-3.5 text-amber-500" />
                <span className="text-[9px] font-bold uppercase tracking-wider group-hover:text-white">Picking</span>
              </Link>
            </motion.div>

            {/* Short 4 */}
            <motion.div whileHover={{ y: -1 }} whileTap={{ scale: 0.98 }} className="flex">
              <Link to="/estoque" className="hover:no-underline w-full p-2 bg-zinc-900/40 border border-zinc-800 rounded-xl flex items-center justify-center gap-1.5 hover:border-purple-500/30 hover:text-purple-400 group duration-150 cursor-pointer text-zinc-400">
                <Package className="w-3.5 h-3.5 text-purple-400" />
                <span className="text-[9px] font-bold uppercase tracking-wider group-hover:text-white">Estoque</span>
              </Link>
            </motion.div>

            {/* Short 5 */}
            <motion.div whileHover={{ y: -1 }} whileTap={{ scale: 0.98 }} className="flex">
              <Link to="/financeiro" className="hover:no-underline w-full p-2 bg-zinc-900/40 border border-zinc-800 rounded-xl flex items-center justify-center gap-1.5 hover:border-pink-500/30 hover:text-pink-400 group duration-150 cursor-pointer text-zinc-400">
                <CircleDollarSign className="w-3.5 h-3.5 text-pink-400" />
                <span className="text-[9px] font-bold uppercase tracking-wider group-hover:text-white">Faturamento</span>
              </Link>
            </motion.div>

            {/* Short 6 */}
            <motion.div whileHover={{ y: -1 }} whileTap={{ scale: 0.98 }} className="flex">
              <Link to="/auditoria" className="hover:no-underline w-full p-2 bg-zinc-900/40 border border-zinc-800 rounded-xl flex items-center justify-center gap-1.5 hover:border-red-500/30 hover:text-red-400 group duration-150 cursor-pointer text-zinc-400">
                <ShieldCheck className="w-3.5 h-3.5 text-red-400" />
                <span className="text-[9px] font-bold uppercase tracking-wider group-hover:text-white">Auditoria</span>
              </Link>
            </motion.div>

          </div>
        </div>

        {/* 3. Operational Grid layout dividing left-heavy focal alerts & focals, right timelines & critical stock items */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 overflow-hidden">
          
          {/* LEFT SIDE: Active actionable Alerts center + Orders in Focus */}
          <div className="lg:col-span-8 space-y-6">
            
            {/* ALERTA AREA */}
            <div className="bg-[#121212] border border-white/5 rounded-3xl p-6 shadow-inner">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-amber-500" />
                  <h3 className="text-xs uppercase font-black tracking-widest text-white">Alertas Importantes</h3>
                </div>
                <span className="text-[9px] font-bold font-mono px-2 py-0.5 bg-white/5 rounded text-white/50">
                  {activeAlerts.length} ALERTA{activeAlerts.length !== 1 && 'S'} ATIVO{activeAlerts.length !== 1 && 'S'}
                </span>
              </div>

              {activeAlerts.length === 0 ? (
                <div className="border border-emerald-500/15 bg-emerald-500/[0.02] rounded-2xl p-5 flex items-center gap-4">
                  <div className="p-2.5 bg-emerald-500/10 rounded-xl text-emerald-400 border border-emerald-500/20 shrink-0">
                    <CheckCircle2 className="w-5 h-5" />
                  </div>
                  <div>
                    <h4 className="text-xs font-black uppercase text-emerald-400 tracking-wide">Estoque & Armazém Saudável</h4>
                    <p className="text-[10px] text-white/40 uppercase font-medium mt-1 leading-relaxed">Nenhum alerta crítico gerado. Todas as ordens operacionais estão fluindo conforme cronograma padrão.</p>
                  </div>
                </div>
              ) : (
                <div className="space-y-2 max-h-[190px] overflow-y-auto custom-scrollbar pr-1">
                  {activeAlerts.map(alert => (
                    <div 
                      key={alert.id} 
                      className={cn(
                        "p-3 rounded-xl border flex items-start gap-3 justify-between transition-colors",
                        alert.severity === 'high' 
                          ? "bg-red-500/[0.03] border-red-500/15 text-red-100" 
                          : alert.severity === 'medium'
                            ? "bg-amber-500/[0.03] border-amber-500/15 text-amber-100"
                            : "bg-blue-500/[0.03] border-blue-500/15 text-blue-100"
                      )}
                    >
                      <div className="flex gap-2.5 items-start">
                        <div className={cn(
                          "p-1.5 rounded border mt-0.5 shrink-0",
                          alert.severity === 'high' 
                            ? "bg-red-500/10 border-red-500/20 text-red-400" 
                            : alert.severity === 'medium'
                              ? "bg-amber-500/10 border-amber-500/20 text-amber-500"
                              : "bg-blue-500/10 border-blue-500/20 text-blue-400"
                        )}>
                          <AlertTriangle className="w-3.5 h-3.5" />
                        </div>
                        <div>
                          <p className="text-[10px] font-black uppercase tracking-wide">{alert.title}</p>
                          <p className="text-[10px] text-white/50 mt-1 leading-relaxed">{alert.message}</p>
                        </div>
                      </div>
                      <span className="text-[8px] font-mono whitespace-nowrap text-white/20 mt-1">{getElapsedTimeString(alert.timestamp)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* PEDIDOS EM FOCO */}
            <div className="bg-zinc-950/40 border border-zinc-900 rounded-2xl p-4 shadow-sm">
              <div className="flex items-center justify-between mb-3 border-b border-zinc-900 pb-2">
                <div className="flex items-center gap-1.5">
                  <Activity className="w-3.5 h-3.5 text-emerald-400" />
                  <h3 className="text-xs uppercase font-black tracking-wider text-white">Pedidos em Foco</h3>
                </div>
                <Link to="/gestao-pedidos" className="text-[8px] font-black uppercase text-zinc-500 tracking-wider hover:text-[#10b981] transition-colors">
                  VER GESTÃO COMPLETA →
                </Link>
              </div>

              {focusOrders.length === 0 ? (
                <div className="py-8 text-center text-[9px] text-zinc-600 uppercase font-bold tracking-wider">
                  Nenhum pedido pendente de intervenção operacional
                </div>
              ) : (
                <div className="space-y-1.5">
                  <div className="hidden sm:grid grid-cols-12 gap-2 text-[7.5px] uppercase font-black text-zinc-500 tracking-wider px-2 mb-0.5">
                    <div className="col-span-2">Pedido</div>
                    <div className="col-span-4">Cliente</div>
                    <div className="col-span-3">Status</div>
                    <div className="col-span-2">Tempo Parado</div>
                    <div className="col-span-1 text-right">Ação</div>
                  </div>

                  <div className="space-y-1 max-h-[250px] overflow-y-auto custom-scrollbar pr-1">
                    {focusOrders.map(order => {
                      const clientName = order.clientId ? (clientsMap.get(order.clientId) || 'Cliente') : 'Consumidor Final';
                      const badge = getStatusLabelAndColor(order.status);
                      
                      return (
                        <div 
                          key={order.id} 
                          className="p-2 bg-zinc-900/30 rounded-lg border border-zinc-900/50 hover:border-emerald-500/20 transition-all flex flex-col sm:grid sm:grid-cols-12 sm:items-center gap-2"
                        >
                          <div className="col-span-2 font-mono text-[9px] font-black text-zinc-400">
                            #{order.orderNumber}
                          </div>
                          <div className="col-span-4 text-[10.5px] font-bold text-white truncate text-left uppercase">
                            {clientName}
                          </div>
                          <div className="col-span-3">
                            <span className={cn("text-[7.5px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded leading-none border", badge.class)}>
                              {badge.label}
                            </span>
                          </div>
                          <div className="col-span-2 text-[9px] font-mono text-zinc-500">
                            espera {getElapsedTimeString(order.timestamp)}
                          </div>
                          <div className="col-span-1 text-right flex justify-start sm:justify-end">
                            <button
                              onClick={() => viewOrderDetails(order.id)}
                              className="p-1 px-1.5 bg-zinc-900 hover:bg-emerald-500 hover:text-black border border-zinc-800 hover:border-emerald-500 text-[8px] font-black uppercase rounded-md transition-all flex items-center gap-0.5 cursor-pointer"
                              title="Direcionar e Detalhar"
                            >
                              <Eye className="w-2.5 h-2.5" />
                              <span className="sm:hidden">Ver</span>
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>

          </div>

          {/* RIGHT SIDE: Chronological Audit Activities list + Critical Stock inventory elements */}
          <div className="lg:col-span-4 space-y-4">
            
            {/* CRITICAL STOCK LIST */}
            <div className="bg-zinc-950/40 border border-zinc-900 rounded-2xl p-4 shadow-sm">
              <div className="flex items-center gap-1.5 mb-3 border-b border-zinc-900 pb-2">
                <Package className="w-3.5 h-3.5 text-amber-500" />
                <h3 className="text-xs uppercase font-black tracking-wider text-white">Estoque Crítico Alertas</h3>
              </div>

              {criticalStockProducts.length === 0 ? (
                <div className="py-4 flex flex-col items-center justify-center p-3 bg-emerald-500/[0.01] border border-emerald-500/10 rounded-xl text-center space-y-1">
                  <ShieldCheck className="w-6 h-6 text-emerald-500 opacity-80" />
                  <h4 className="text-[9px] font-black text-white uppercase tracking-wider">Estoque saudável</h4>
                  <p className="text-[8px] text-zinc-500 uppercase leading-tight">Nenhum item abaixo da margem mínima.</p>
                </div>
              ) : (
                <div className="space-y-1.5 max-h-[180px] overflow-y-auto custom-scrollbar pr-1">
                  {criticalStockProducts.map(p => (
                    <div key={p.id} className="p-2 bg-zinc-900/25 rounded-lg border border-zinc-900 flex items-center justify-between gap-1.5 text-left">
                      <div className="overflow-hidden">
                        <p className="text-[10px] font-bold text-white truncate leading-tight uppercase">{p.name}</p>
                        <p className="text-[8px] font-mono text-zinc-500 tracking-wide uppercase">CÓD: {p.code}</p>
                      </div>
                      <div className="text-right shrink-0">
                        <span className="text-[9.5px] font-black text-red-400 font-mono block leading-none">{p.stock} UN</span>
                        <span className="text-[7.5px] font-bold text-zinc-500 uppercase tracking-wider block mt-0.5">Mín: {p.minStock}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* RECENT ACTIVITIES */}
            <div className="bg-zinc-950/40 border border-zinc-900 rounded-2xl p-4 shadow-sm">
              <div className="flex items-center gap-1.5 mb-3 border-b border-zinc-900 pb-2">
                <Clock className="w-3.5 h-3.5 text-cyan-400" />
                <h3 className="text-xs uppercase font-black tracking-wider text-white">Logs de Auditoria</h3>
              </div>

              {recentActivitiesList.length === 0 ? (
                <div className="py-6 text-center text-[9px] text-zinc-600 uppercase font-black tracking-widest">
                  Sem registros de auditoria hoje
                </div>
              ) : (
                <div className="space-y-3 max-h-[250px] overflow-y-auto custom-scrollbar pr-1">
                  {recentActivitiesList.map(log => {
                    const LocIcon = getLogIcon(log);
                    const colStyle = getLogColorStyles(log);
                    
                    return (
                      <div key={log.id} className="flex gap-2 relative group">
                        
                        <div className="shrink-0 mt-0.5">
                          <div className={cn("p-1 w-5.5 h-5.5 rounded-md flex items-center justify-center border text-[9px]", colStyle)}>
                            <LocIcon className="w-3 h-3" />
                          </div>
                        </div>

                        <div className="overflow-hidden flex-1 text-left">
                          <p className="text-[10px] text-zinc-300 font-semibold group-hover:text-white leading-tight">
                            {log.description}
                          </p>
                          <div className="flex items-center gap-1.5 mt-0.5">
                            <span className="text-[8px] font-mono font-black text-emerald-400 uppercase leading-none">
                              {log.userLogin}
                            </span>
                            <span className="text-zinc-800 text-[8px] leading-none">•</span>
                            <span className="text-[8px] text-zinc-500 font-black uppercase tracking-wider leading-none">
                              {getElapsedTimeString(log.timestamp)}
                            </span>
                          </div>
                        </div>

                      </div>
                    );
                  })}
                </div>
              )}
            </div>

          </div>

        </div>

      </div>
    </div>
  );
}
