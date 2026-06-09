import { useStore } from '../store';
import { useMemo } from 'react';

// Light, pure selectors to prevent unnecessary re-renders of components that only need sub-metrics or counts

/**
 * Returns the count of active, non-deleted products
 */
export const selectProductsCount = (state: any) => {
  return (state.products || []).filter((p: any) => p.active !== false && !p.deleted).length;
};

/**
 * Returns the count of products with stock below their minimum stock level
 */
export const selectLowStockCount = (state: any) => {
  return (state.products || []).filter((p: any) => p.active !== false && !p.deleted && p.stock < p.minStock).length;
};

/**
 * Returns the count of open sales/orders (not finished or cancelled)
 */
export const selectOpenOrdersCount = (state: any) => {
  return (state.sales || []).filter((s: any) => !['finalizado', 'cancelado', 'entregue', 'retirado'].includes(s.status)).length;
};

/**
 * Returns summary and statistics of today's sales
 */
export const selectTodaySalesSummary = (state: any) => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  const startOfToday = d.getTime();
  
  const todaySales = (state.sales || []).filter(
    (s: any) => s.timestamp >= startOfToday && s.status !== 'cancelado'
  );
  
  const count = todaySales.length;
  const totalValue = todaySales.reduce((acc: number, s: any) => acc + (s.total || 0), 0);
  
  return { count, totalValue };
};

/**
 * Returns count of active/unresolved alerts
 */
export const selectUnreadNotificationsCount = (state: any) => {
  return (state.alerts || []).filter((alert: any) => alert.status !== 'resolved').length;
};

/**
 * Returns active/critical counts of alerts
 */
export const selectAlertsSummary = (state: any) => {
  const alerts = state.alerts || [];
  const activeAlerts = alerts.filter((a: any) => a.status !== 'resolved');
  const criticalCount = activeAlerts.filter((a: any) => a.priority === 'high').length;
  return {
    totalActive: activeAlerts.length,
    criticalCount
  };
};

/**
 * Returns the count of sales awaiting picking
 */
export const selectAwaitingPickingCount = (state: any) => {
  return (state.sales || []).filter(
    (s: any) => s.status === 'aguardando_separacao' || s.status === 'enviado_separacao'
  ).length;
};

/**
 * Returns in picking count and distinct list of picking responsibles
 */
export const selectInPickingSummary = (state: any) => {
  const inPickingOrders = (state.sales || []).filter((s: any) => s.status === 'em_separacao');
  const count = inPickingOrders.length;
  const list = inPickingOrders.map((s: any) => s.pickerName).filter(Boolean);
  const responsibles = Array.from(new Set(list)) as string[];
  return { count, responsibles };
};

/**
 * Returns the count of sales with missing items
 */
export const selectMissingProductsCount = (state: any) => {
  return (state.sales || []).filter((s: any) => s.status === 'separado_com_faltantes').length;
};

/**
 * Returns critical stock products mapped with only visual properties needed
 */
export const selectCriticalStockProducts = (state: any) => {
  return (state.products || [])
    .filter((p: any) => p.active !== false && !p.deleted && p.stock < p.minStock)
    .map((p: any) => ({
      id: p.id,
      name: p.name,
      code: p.code,
      stock: p.stock,
      minStock: p.minStock
    }));
};

/**
 * Returns the daily income and pending receipts
 */
export const selectTodayRevenueSummary = (state: any) => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  const startOfToday = d.getTime();
  const todayTrans = (state.financialTransactions || []).filter(
    (t: any) => t.date >= startOfToday && t.type === 'entrada' && t.origin !== 'pre_encomenda'
  );
  const received = todayTrans.filter((t: any) => t.status === 'pago').reduce((acc: number, t: any) => acc + (t.value || 0), 0);
  const pending = todayTrans.filter((t: any) => t.status === 'pendente').reduce((acc: number, t: any) => acc + (t.value || 0), 0);
  return { received, pending };
};

/**
 * Returns count of high-risk audit logs from today
 */
export const selectHighRiskEventsCount = (state: any) => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  const startOfToday = d.getTime();
  return (state.auditLogs || []).filter(
    (log: any) => log.riskLevel === 'alto' && log.timestamp >= startOfToday
  ).length;
};

/**
 * Returns the last 10 audit logs with lightweight fields
 */
export const selectRecentAuditLogs = (state: any) => {
  return (state.auditLogs || []).slice(0, 10).map((log: any) => ({
    id: log.id,
    description: log.description,
    userLogin: log.userLogin,
    timestamp: log.timestamp,
    action: log.action,
    module: log.module,
    riskLevel: log.riskLevel,
    status: log.status
  }));
};

/**
 * Returns focus orders mapped with only properties needed
 */
export const selectFocusOrders = (state: any) => {
  const filtered = (state.sales || []).filter((s: any) => 
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
};

/**
 * Returns compact clients list containing id and name
 */
export const selectClientsListCompact = (state: any) => {
  return (state.clients || []).map((c: any) => ({ 
    id: c.id, 
    name: c.name 
  }));
};

/**
 * Returns filtered sales for dashboard active alerts
 */
export const selectAlertSales = (state: any) => {
  return (state.sales || [])
    .filter((s: any) => s.status === 'separado_com_faltantes' || ['aguardando_separacao', 'enviado_separacao'].includes(s.status))
    .map((s: any) => ({
      id: s.id,
      status: s.status,
      orderNumber: s.orderNumber,
      pickerName: s.pickerName,
      missingItemsAuthorizedBy: s.missingItemsAuthorizedBy,
      timestamp: s.timestamp
    }));
};

/**
 * Returns filtered audit logs for dashboard active alerts (last 24 hours)
 */
export const selectAlertAuditLogs = (state: any) => {
  const limitTimestamp = Date.now() - 24 * 60 * 60 * 1000;
  return (state.auditLogs || [])
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
};

