import { HashRouter as Router, Routes, Route, Navigate, Link, useLocation, useNavigate } from 'react-router-dom';
import { DataProtectionService } from './services/dataProtectionService';
import { MODULES } from './modules';
import ModulePlaceholder from './components/ModulePlaceholder';
import Home from './pages/Home';
import Login from './pages/Login';
import PublicCatalogPage from './pages/PublicCatalogPage';
import { Settings, ArrowLeft, Home as HomeIcon, ClipboardList, Search, Shield, CheckCircle2, ShieldAlert, AlertTriangle, UserCheck, RefreshCw, Lock } from 'lucide-react';
import React, { useState, useEffect, Suspense, lazy } from 'react';

// Eagerly Loaded Modules to prevent dynamic chunk fetching delays and "Loading" flashes
import Dashboard from './pages/Dashboard';
import NetworkSettings from './components/NetworkSettings';

// Dynamically / Lazy Loaded Modules to minimize initial bundle size and reduce startup RAM/CPU footprint
const PDVModule = lazy(() => import('./pages/PDVModule'));
const CashierModule = lazy(() => import('./pages/CashierModule'));
const IAModule = lazy(() => import('./pages/IAModule'));
const AutomationModule = lazy(() => import('./pages/AutomationModule'));
const OrderManagementModule = lazy(() => import('./pages/OrderManagementModule'));
const PickingModule = lazy(() => import('./pages/PickingModule'));
const DeliveryModule = lazy(() => import('./pages/DeliveryModule'));
const ClientsModule = lazy(() => import('./pages/ClientsModule'));
const InventoryModule = lazy(() => import('./pages/InventoryModule'));
const PaymentsModule = lazy(() => import('./pages/PaymentsModule'));
const PreOrdersModule = lazy(() => import('./pages/PreOrdersModule'));
const FinancialModule = lazy(() => import('./pages/FinancialModule'));
const CashierHistoryModule = lazy(() => import('./pages/CashierHistoryModule'));
const HistoryModule = lazy(() => import('./pages/HistoryModule'));
const RetailersModule = lazy(() => import('./pages/RetailersModule'));
const ReturnsModule = lazy(() => import('./pages/ReturnsModule'));
const CentralOperacional = lazy(() => import('./pages/CentralOperacional'));
const ProductionCostModule = lazy(() => import('./pages/ProductionCostModule'));
const OperationalPerformance = lazy(() => import('./pages/OperationalPerformance'));
const AuditModule = lazy(() => import('./pages/AuditModule'));
const CustomerExperienceModule = lazy(() => import('./pages/CustomerExperienceModule'));
const NotificationsModule = lazy(() => import('./pages/NotificationsModule'));
const CatalogModule = lazy(() => import('./pages/CatalogModule'));
const PdvTotemModule = lazy(() => import('./pages/PdvTotemModule'));
const PdvCustomerDisplay = lazy(() => import('./pages/PdvCustomerDisplay'));
const EmProducaoModule = lazy(() => import('./pages/EmProducaoModule'));
const EmProducaoTv = lazy(() => import('./pages/EmProducaoTv'));
const OperatorsModule = lazy(() => import('./pages/OperatorsModule'));
import { cn } from './lib/utils';
import { shallow } from 'zustand/shallow';
import SettingsDrawer from './components/SettingsDrawer';
import { motion, AnimatePresence } from 'motion/react';
import { useStore } from './store';
import { bootTracker } from './utils/bootTracker';
import ForcedPasswordResetScreen from './components/ForcedPasswordResetScreen';
import { credentialValidationService } from './services/credentialValidationService';
import { nfcServiceFactory } from './services/NFCServiceFactory';
import SettingsContent from './components/SettingsContent';
import { networkService } from './services/networkService';
import { syncService } from './services/syncService';
import { environmentService } from './services/environmentService';
import { perfLogger } from './utils/perfLogger';
import { initializePrintSpooler } from './services/printEngine/printSpooler';

function LoadingModule() {
  return (
    <div className="flex-1 bg-[#090909] flex flex-col items-center justify-center min-h-[300px]">
      <div className="w-8 h-8 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
      <span className="text-[10px] text-white/30 font-black tracking-[0.3em] uppercase mt-4">Carregando Módulo...</span>
    </div>
  );
}

const ModuleComponentMap: Record<string, React.ComponentType<any>> = {
  dashboard: React.memo(Dashboard),
  pdv: React.memo(PDVModule),
  clientes: React.memo(ClientsModule),
  estoque: React.memo(InventoryModule),
  pagamentos: React.memo(PaymentsModule),
  "abrir-caixa": React.memo(CashierModule),
  ia: React.memo(IAModule),
  automacao: React.memo(AutomationModule),
  "gestao-pedidos": React.memo(OrderManagementModule),
  separacao: React.memo(PickingModule),
  entrega: React.memo(DeliveryModule),
  "pre-encomenda": React.memo(PreOrdersModule),
  financeiro: React.memo(FinancialModule),
  "historico-caixa": React.memo(CashierHistoryModule),
  historico: React.memo(HistoryModule),
  devolucao: React.memo(ReturnsModule),
  lojistas: React.memo(RetailersModule),
  "central-operacional": React.memo(CentralOperacional),
  custos: React.memo(ProductionCostModule),
  "performance-operacional": React.memo(OperationalPerformance),
  auditoria: React.memo(AuditModule),
  "experiencia-cliente": React.memo(CustomerExperienceModule),
  "pdv-totem": React.memo(PdvTotemModule),
  catalogo: React.memo(PdvTotemModule),
  rede: React.memo(NetworkSettings),
  notificacoes: React.memo(NotificationsModule),
  "em-producao": React.memo(EmProducaoModule),
  operadores: React.memo(OperatorsModule),
};

const HOT_SCREENS_METADATA = [
  { path: '/pdv', id: 'pdv', name: 'PDV', Component: ModuleComponentMap.pdv },
  { path: '/gestao-pedidos', id: 'gestao-pedidos', name: 'Gestão de Pedidos', Component: ModuleComponentMap['gestao-pedidos'] },
  { path: '/separacao', id: 'separacao', name: 'Separação', Component: ModuleComponentMap.separacao },
  { path: '/estoque', id: 'estoque', name: 'Estoque', Component: ModuleComponentMap.estoque },
  { path: '/abrir-caixa', id: 'abrir-caixa', name: 'Caixa', Component: ModuleComponentMap['abrir-caixa'] },
  { path: '/central-operacional', id: 'central-operacional', name: 'Central Operacional', Component: ModuleComponentMap['central-operacional'] },
  { path: '/experiencia-cliente', id: 'experiencia-cliente', name: 'Experiência do Cliente', Component: ModuleComponentMap['experiencia-cliente'] }
];

interface ModuleRouteWrapperProps {
  id: string;
  name: string;
  Component: React.ComponentType<any>;
}

const ModuleRouteWrapper = React.memo(({ id, name, Component }: ModuleRouteWrapperProps) => {
  React.useEffect(() => {
    const label = `Navegação para o menu ${name}`;
    if (perfLogger.hasStarted(label)) {
      perfLogger.end(label);
    }
  }, [id, name]);

  perfLogger.logRender(`Módulo ${name}`);

  return <Component name={name} />;
});

ModuleRouteWrapper.displayName = 'ModuleRouteWrapper';

const SyncFooterIndicator = React.memo(() => {
  const syncStatus = useStore((state) => state.syncStatus);
  const pendingCount = useStore((state) => state.pendingSyncQueue?.length || 0);
  const syncIndicator = React.useMemo(() => syncService.getIndicatorStats(), [syncStatus, pendingCount]);
  
  return (
    <>
      <div className="flex items-center gap-3 border-l border-white/5 pl-8">
        <span className={cn("px-2 py-0.5 rounded border text-[7px] tracking-widest font-black uppercase transition-colors duration-300", syncIndicator.style)}>
          SINC: {syncIndicator.statusText} {syncIndicator.pendingCount > 0 ? `(${syncIndicator.pendingCount} pendente(s))` : ''}
        </span>
        <span className="text-white/40 font-bold capitalize normal-case tracking-normal">Última Sincronia: {syncIndicator.lastSyncTime}</span>
      </div>
      <div className="hidden lg:block border-l border-white/5 pl-8 text-white/40 font-bold capitalize normal-case tracking-normal">IP Servidor: {syncIndicator.serverIp}</div>
    </>
  );
});

SyncFooterIndicator.displayName = 'SyncFooterIndicator';

function AppLayout() {
  const navigate = useNavigate();
  const location = useLocation();
  const [loading, setLoading] = React.useState(false);
  const [labelSaveStatus, setLabelSaveStatus] = React.useState<'idle' | 'saving' | 'saved' | 'error'>('idle');

  const [pendingPayments, setPendingPayments] = React.useState<any[]>([]);
  const [globalCashReceived, setGlobalCashReceived] = React.useState('');
  const [selectedPaymentForModal, setSelectedPaymentForModal] = React.useState<any | null>(null);
  const [processedPaymentIds, setProcessedPaymentIds] = React.useState<string[]>([]);

  React.useEffect(() => {
    const handleStatus = (e: Event) => {
      setLabelSaveStatus((e as CustomEvent).detail);
    };
    window.addEventListener('label-save-status', handleStatus);
    return () => window.removeEventListener('label-save-status', handleStatus);
  }, []);

  React.useEffect(() => {
    const channel = new BroadcastChannel('pdv-totem-channel');
    channel.onmessage = (event) => {
      const { type, payload } = event.data;
      if (type === 'totem-pix-waiting') {
        const enriched = { ...payload, paymentType: 'pix', type };
        setPendingPayments(prev => {
          if (prev.some(p => p.id === payload.id)) return prev;
          return [...prev, enriched];
        });
      } else if (type === 'totem-cash-waiting') {
        const enriched = { ...payload, paymentType: 'money', type };
        setPendingPayments(prev => {
          if (prev.some(p => p.id === payload.id)) return prev;
          return [...prev, enriched];
        });
      } else if (type === 'totem-card-waiting') {
        const enriched = { ...payload, paymentType: 'card', type };
        setPendingPayments(prev => {
          if (prev.some(p => p.id === payload.id)) return prev;
          return [...prev, enriched];
        });
      } else if (type === 'totem-pix-cancelled' || type === 'totem-payment-cancelled' || type === 'totem-payment-refused' || type === 'totem-pix-refused') {
        setPendingPayments(prev => {
          const next = prev.filter(p => p.id !== payload?.id && p.terminalId !== payload?.terminalId);
          return next;
        });
        setSelectedPaymentForModal(prev => {
          if (prev && (prev.id === payload?.id || prev.terminalId === payload?.terminalId)) {
            return null;
          }
          return prev;
        });
      } else if (type === 'totem-payment-approved' || type === 'totem-pix-approved') {
        setPendingPayments(prev => {
          const next = prev.filter(p => p.id !== payload?.id && p.terminalId !== payload?.terminalId);
          return next;
        });
        setSelectedPaymentForModal(prev => {
          if (prev && (prev.id === payload?.id || prev.terminalId === payload?.terminalId)) {
            return null;
          }
          return prev;
        });
      }
    };
    return () => {
      try { channel.close(); } catch (err) {}
    };
  }, []);

  const handleApproveGlobalPayment = (req: any, amountReceived?: number, change?: number) => {
    if (!req) return;
    if (processedPaymentIds.includes(req.id)) return;
    setProcessedPaymentIds(prev => [...prev, req.id]);

    try {
      const salePayloadCopy = { ...req.salePayload };
      if (req.paymentType === 'money' && amountReceived !== undefined) {
        salePayloadCopy.receivedAmount = amountReceived;
        salePayloadCopy.change = change || 0;
      }

      if (currentUser) {
        salePayloadCopy.sellerId = currentUser.id;
        salePayloadCopy.sellerName = currentUser.fullName;
        salePayloadCopy.sellerLogin = currentUser.login;
      }

      const createdOrder = useStore.getState().addSale(salePayloadCopy);
      if (createdOrder) {
        const ch = new BroadcastChannel('pdv-totem-channel');
        ch.postMessage({
          type: 'totem-payment-approved',
          payload: { terminalId: req.terminalId, id: req.id, sale: createdOrder }
        });
        ch.postMessage({
          type: 'totem-pix-approved',
          payload: { terminalId: req.terminalId, id: req.id, sale: createdOrder }
        });
        try { ch.close(); } catch (e) {}
        setPendingPayments(prev => prev.filter(p => p.id !== req.id));
        setSelectedPaymentForModal(null);
        setGlobalCashReceived('');
      } else {
        alert('Erro ao registrar a venda no ERP.');
        setProcessedPaymentIds(prev => prev.filter(id => id !== req.id));
      }
    } catch (err: any) {
      alert('Erro ao aprovar: ' + (err?.message || err));
      setProcessedPaymentIds(prev => prev.filter(id => id !== req.id));
    }
  };

  const handleRefuseGlobalPayment = (req: any) => {
    if (!req) return;
    if (processedPaymentIds.includes(req.id)) return;
    setProcessedPaymentIds(prev => [...prev, req.id]);

    const ch = new BroadcastChannel('pdv-totem-channel');
    ch.postMessage({
      type: 'totem-payment-refused',
      payload: { terminalId: req.terminalId, id: req.id }
    });
    ch.postMessage({
      type: 'totem-pix-refused',
      payload: { terminalId: req.terminalId, id: req.id }
    });
    try { ch.close(); } catch (e) {}
    setPendingPayments(prev => prev.filter(p => p.id !== req.id));
    setSelectedPaymentForModal(null);
    setGlobalCashReceived('');
  };
  const isSettingsOpen = useStore((state) => state.isSettingsOpen);
  const setIsSettingsOpen = useStore((state) => state.setIsSettingsOpen);
  const activeSettingModule = useStore((state) => state.activeSettingModule);
  const setActiveSettingModule = useStore((state) => state.setActiveSettingModule);
  const activeSubSetting = useStore((state) => state.activeSubSetting);
  const setActiveSubSetting = useStore((state) => state.setActiveSubSetting);
  const isCashierOpen = useStore((state) => !!state.currentCashier);
  const currentUser = useStore((state) => state.currentUser);
  const isAuthenticated = useStore((state) => state.isAuthenticated);
  const logoutLocal = useStore((state) => state.logoutLocal);
  const localNetwork = useStore((state) => state.localNetwork);
  const updateLocalNetworkStatus = useStore((state) => state.updateLocalNetworkStatus);
  const hasActivePicking = useStore((state) => {
    if (!state.currentUser) return false;
    return state.sales.some(s => s.status === 'em_separacao' && s.pickerId === state.currentUser?.id);
  });

  // ==========================================
  // EVOLUÇÃO NFC - PAR 2 (LOGOUT E TROCA RÁPIDA)
  // ==========================================
  const nfcTags = useStore((state) => state.nfcTags);
  const users = useStore((state) => state.users);

  const [nfcModal, setNfcModal] = React.useState<{
    isOpen: boolean;
    type: 'confirm_switch' | 'error_alert';
    newUser?: any;
    tagUid?: string;
    tagObject?: any;
    message?: string;
  }>({
    isOpen: false,
    type: 'error_alert'
  });



  const lastSwitchNfcUid = React.useRef<string>('');
  const lastSwitchNfcTime = React.useRef<number>(0);
  const switchKeyBuffer = React.useRef<string>('');
  const lastSwitchKeyPress = React.useRef<number>(0);
  const loginTimeRef = React.useRef<number>(Date.now());

  React.useEffect(() => {
    loginTimeRef.current = Date.now();
  }, [currentUser?.id]);

  const handleGlobalNfcRead = React.useCallback((uid: string) => {
    const cleanUid = (uid || '').trim().toUpperCase();
    if (!cleanUid) return;

    // Filter anti-loop
    const now = Date.now();
    if (cleanUid === lastSwitchNfcUid.current && (now - lastSwitchNfcTime.current < 2000)) {
      console.log(`[React/NFC Switch] Active anti-loop for UID: ${cleanUid}`);
      return;
    }

    lastSwitchNfcUid.current = cleanUid;
    lastSwitchNfcTime.current = now;

    const validationCheck = credentialValidationService.validateCredential(cleanUid, 'NFC', 'TROCA_OPERADOR');
    if (!validationCheck.success) {
      setNfcModal({
        isOpen: true,
        type: 'error_alert',
        message: validationCheck.error || 'Credencial NFC inválida ou bloqueada.'
      });
      return;
    }
    console.log(`[React/NFC Switch] Intercepted raw tag read: ${cleanUid}`);

    const normalizeUID = (val: string) => (val || '').trim().replace(/[:\s-]/g, '').toUpperCase();
    const cleanInputUid = normalizeUID(cleanUid);

    const tag = nfcTags.find(t => normalizeUID(t.uid) === cleanInputUid && t.status !== 'Excluido');

    if (!tag) {
      console.warn(`[React/NFC Switch] Unregistered Tag read in logged session: ${cleanUid}`);
      return;
    }

    // Check if tag belongs to the active logged-in user (Same User Rule)
    if (tag.usuarioVinculado === currentUser?.id) {
      console.log(`[React/NFC Switch] Active operator scanned their own tag. Keeping session active.`);
      
      // Update the tag's lastUsed time in the state
      useStore.setState((state) => ({
        nfcTags: (state.nfcTags || []).map(t => t.id === tag.id ? { ...t, ultimoUso: Date.now() } : t)
      }));

      // Audit log keeping session active / renewing time of activity
      useStore.getState().logAction({
        module: 'Acesso',
        actionType: 'login' as any,
        action: 'Sessão NFC Mantida Ativa',
        description: `O próprio operador ${currentUser.fullName} aproximou seu crachá NFC (UID: ${tag.uid}). Sessão mantida ativa e tempo de atividade renovado.`,
        status: 'sucesso' as any,
        referenceId: tag.id
      });
      useStore.getState().addActivity(`Sessão mantida ativa para: ${currentUser.fullName} via aproximação de crachá`, 'auth', 'Acesso');
      
      setNfcModal({
        isOpen: true,
        type: 'error_alert',
        message: `Sessão ativa de ${currentUser.fullName} confirmada! Tempo de atividade renovado.`
      });
      
      // Programmatically close the feedback popup after 2.5s
      setTimeout(() => {
        setNfcModal(prev => {
          if (prev.isOpen && prev.message?.includes('Sessão ativa')) {
            return { ...prev, isOpen: false };
          }
          return prev;
        });
      }, 2500);

      return;
    }

    // Tag Status Validations
    if (tag.status === 'Bloqueado') {
      setNfcModal({
        isOpen: true,
        type: 'error_alert',
        message: 'Esta tag NFC está bloqueada e não pode ser usada para trocar de operador.'
      });
      return;
    }

    if (tag.status === 'Perdido') {
      setNfcModal({
        isOpen: true,
        type: 'error_alert',
        message: 'Esta tag NFC foi marcada como perdida no sistema.'
      });
      return;
    }

    if (tag.status === 'Quarentena') {
      setNfcModal({
        isOpen: true,
        type: 'error_alert',
        message: 'Esta tag NFC está em período de quarentena de segurança.'
      });
      return;
    }

    if (!tag.usuarioVinculado) {
      setNfcModal({
        isOpen: true,
        type: 'error_alert',
        message: 'Esta tag NFC de troca de operador não possui vínculo registrado.'
      });
      return;
    }

    // Check Master level restrictions ("Não permitir troca com NFC Master, pois Master é autorização, não login comum.")
    if (tag.tipoCredencial === 'MASTER') {
      setNfcModal({
        isOpen: true,
        type: 'error_alert',
        message: 'Não é permitida a troca rápida de operador com NFC Master. Utilize para autorizações.'
      });
      return;
    }

    const matchedUser = users.find(u => u.id === tag.usuarioVinculado);
    if (!matchedUser) {
      setNfcModal({
        isOpen: true,
        type: 'error_alert',
        message: 'O usuário vinculado a esta tag não foi localizado.'
      });
      return;
    }

    if (matchedUser.status !== 'ativo') {
      setNfcModal({
        isOpen: true,
        type: 'error_alert',
        message: `O operador ${matchedUser.fullName || matchedUser.login} está marcado como inativo.`
      });
      return;
    }

    // Operation check: "Se houver venda em andamento, separação em andamento, edição de pedido ou formulário não salvo, alertar: 'Existe uma operação em andamento. Finalize ou cancele antes de trocar operador.'"
    const isCriticalIncomplete = 
      (window as any).pdvCartLength > 0 ||
      (window as any).isPaymentOpen === true ||
      hasActivePicking ||
      (window as any).hasUnsavedChanges === true ||
      (window as any).isBackupRestoreInProgress === true ||
      (window as any).isPrintingCritical === true ||
      (window as any).isCashierOpCritical === true;

    if (isCriticalIncomplete) {
      setNfcModal({
        isOpen: true,
        type: 'error_alert',
        message: 'Existe uma operação em andamento. Finalize ou cancele antes de trocar operador.'
      });
      return;
    }

    // Execute safety swap check & auto closing of previous operator cashier session
    if (!useStore.getState().handleUserSwapCheck(matchedUser)) {
      setNfcModal({
        isOpen: true,
        type: 'error_alert',
        message: 'Existe uma operação crítica em andamento. Finalize ou cancele antes de trocar operador.'
      });
      return;
    }

    // DIFFERENT USER - QUICK AUTOMATIC SWAP (NO CONFIRMATION DIALOG FOR MAX INSTANT EFFICIENCY)
    const previousUser = currentUser;
    const previousUserFullName = previousUser?.fullName || 'Desconhecido';
    const previousUserLogin = previousUser?.login || 'N/A';
    const previousUserId = previousUser?.id || '';

    // Switch state AUTOMATICALLY
    // Audit logs of the swap:
    
    // Log previous operator exit
    useStore.getState().logAction({
      module: 'Acesso',
      actionType: 'login' as any,
      action: 'Troca Rápida de Operador - Saída por Crachá',
      description: `Sessão anterior do operador ${previousUserFullName} (Login: ${previousUserLogin}) encerrada automaticamente por aproximação do crachá NFC de ${matchedUser.fullName}.`,
      status: 'sucesso' as any,
      referenceId: previousUserId
    });

    // Log new operator entrance
    useStore.getState().logAction({
      module: 'Acesso',
      actionType: 'login' as any,
      action: 'Troca Rápida de Operador - Entrada por Crachá',
      description: `Operador ${previousUserFullName} foi substituído por ${matchedUser.fullName} via crachá NFC (UID: ${tag.uid}, Cargo: ${matchedUser.roleId || 'N/A'}).`,
      status: 'sucesso' as any,
      referenceId: matchedUser.id
    });

    useStore.getState().addActivity(`Operador ${previousUserFullName} substituído por ${matchedUser.fullName} via crachá NFC`, 'auth', 'Acesso');

    // Close any previous general setup modals
    setNfcModal({ isOpen: false, type: 'error_alert' });

    // Switch Zustand credentials
    useStore.setState((state) => ({
      currentUser: matchedUser,
      isAuthenticated: true,
      pendingWelcome: true, // Triggers standard welcome animation screen and voice intro!
      nfcTags: (state.nfcTags || []).map(t => t.id === tag.id ? { ...t, ultimoUso: Date.now() } : t)
    }));

    // Find and execute redirection to their permitted home view
    const getLandingPathForRole = (roleId: string, userObj?: any) => {
      const normalized = (roleId || '').toLowerCase();
      
      // Custom bypass for specific administrative privileges
      if (userObj?.isAdmin || userObj?.isOwner || userObj?.isMasterAdmin || normalized === 'administrador' || normalized === 'gerente') {
        return '/';
      }
      
      if (normalized === 'caixa') return '/pdv';
      if (normalized === 'separador') return '/separacao';
      if (normalized === 'operador_totem' || normalized === 'admin_totem') return '/pdv-totem';
      if (normalized === 'estoquista') return '/estoque';
      if (normalized === 'entregador') return '/entrega';
      return '/';
    };

    const landingPath = getLandingPathForRole(matchedUser.roleId, matchedUser);
    console.log(`[React/NFC Switch] Swapping successfully to: ${matchedUser.fullName}. Redirecting to landing path: ${landingPath}`);
    
    // Smooth programmatic redirection
    navigate(landingPath, { replace: true });

  }, [nfcTags, users, currentUser, hasActivePicking, logoutLocal, navigate]);

  // Native platform-neutral background NFC hook via factory
  React.useEffect(() => {
    const service = nfcServiceFactory.getService();
    console.log(`[App/NFC] Initializing background swapping capabilities via: ${service.getPlatformName()}`);

    service.startScanning(
      (uid: string) => {
        handleGlobalNfcRead(uid);
      },
      (errMessage: string) => {
        console.warn(`[App/NFC Hardware Failure]: ${errMessage}`);
      }
    );

    return () => {
      service.stopScanning();
    };
  }, [handleGlobalNfcRead]);

  // ==========================================

  // Global Connection Monitor for Clients
  React.useEffect(() => {
    if (localNetwork.mode === 'client' && localNetwork.connectionStatus === 'error') {
      // Small delay to prevent flickering on quick drops
      const timer = setTimeout(() => {
        // We could use a toast or a modal here.
        // For now, let's just show a banner in the footer or a floating alert.
      }, 2000);
      return () => clearTimeout(timer);
    }
  }, [localNetwork.connectionStatus, localNetwork.mode]);

  // Select state slices to trigger re-renders on change (Moved to SyncFooterIndicator)
  
  if (!currentUser || !isAuthenticated) {
    return null;
  }

  const addToHistory = useStore(state => state.addToHistory);
  const checkPermission = useStore((state) => state.checkPermission);
  const lastLoggedBlockedPathRef = React.useRef<string | null>(null);

  const [isInventoryModalOpen, setIsInventoryModalOpen] = React.useState(false);

  React.useEffect(() => {
    const handleModalState = (e: Event) => {
      const customEvent = e as CustomEvent;
      if (customEvent.detail && typeof customEvent.detail.isOpen === 'boolean') {
        setIsInventoryModalOpen(customEvent.detail.isOpen);
      }
    };
    window.addEventListener('inventory-modal-state', handleModalState);
    return () => {
      window.removeEventListener('inventory-modal-state', handleModalState);
    };
  }, []);

  // Dynamic state for keep-alive Hot Screen LRU Cache
  const [cachedPaths, setCachedPaths] = React.useState<string[]>([]);
  const isHotPathActive = HOT_SCREENS_METADATA.some(hs => hs.path === location.pathname);

  // Preloading timers reference for background pre-loading of most used menus
  const preloadTimers = React.useRef<any[]>([]);

  // Cleanup of preload timers on logout or unauthenticate
  React.useEffect(() => {
    if (!currentUser?.id || !isAuthenticated) {
      preloadTimers.current.forEach(t => clearTimeout(t));
      preloadTimers.current = [];
    }
  }, [currentUser?.id, isAuthenticated]);

  // Background Preloading of primary routes after login when idle
  React.useEffect(() => {
    if (!currentUser?.id || !isAuthenticated) return;

    let preloadingTriggerTimer: any = null;

    const performBackgroundPreloading = () => {
      console.log("[Navigation] System is idle. Executing background preloading of main screens...");

      const targets = [
        () => import('./pages/PDVModule'),
        () => import('./pages/OrderManagementModule'),
        () => import('./pages/PickingModule'),
        () => import('./pages/InventoryModule'),
        () => import('./pages/CentralOperacional')
      ];

      targets.forEach((loadFn, idx) => {
        const timeout = setTimeout(() => {
          loadFn().catch(err => {
            console.warn(`[Navigation] Background preloading failed for index ${idx}:`, err);
          });
        }, idx * 1000); // 1s staggered delay to avoid processor/network load spikes
        preloadTimers.current.push(timeout);
      });
    };

    // Stagger initialization by 3s to let the main application page completely render and settle
    preloadingTriggerTimer = setTimeout(() => {
      if ('requestIdleCallback' in window) {
        (window as any).requestIdleCallback(() => performBackgroundPreloading(), { timeout: 10000 });
      } else {
        performBackgroundPreloading();
      }
    }, 3000);

    return () => {
      if (preloadingTriggerTimer) clearTimeout(preloadingTriggerTimer);
    };
  }, [currentUser?.id, isAuthenticated]);

  React.useEffect(() => {
    if (!currentUser?.id) {
      setCachedPaths([]);
      return;
    }

    const currentPath = location.pathname;
    const isHot = HOT_SCREENS_METADATA.some(hs => hs.path === currentPath);
    
    setCachedPaths((prev) => {
      // Clean up /central-operacional from background memory immediately when navigated away
      let next = prev.filter(p => p === currentPath || p !== '/central-operacional');

      if (isHot) {
        // Enforce privilege security check before staging view in background memory
        const correspondingModule = MODULES.find(m => m.path === currentPath || (currentPath === '/experiencia-cliente' && m.id === 'experiencia-cliente'));
        if (correspondingModule) {
          const hasPerm = checkPermission(correspondingModule.name, 'acessar');
          if (!hasPerm) return next;
        }

        if (!next.includes(currentPath)) {
          next = [...next, currentPath];
        }
        
        // Pinned paths that have high cache priority (must be kept active if in cache)
        const ESSENTIAL_PATHS = ['/pdv', '/gestao-pedidos', '/separacao', '/estoque'];
        
        // LRU Cache Size constraint: Max 3 hot screens live in-memory at a time
        const MAX_HOT_SCREENS = 3;
        if (next.length > MAX_HOT_SCREENS) {
          // Find first path in 'next' that is NOT essential and not current, and evict it first
          const nonEssentialIdx = next.findIndex(p => p !== currentPath && !ESSENTIAL_PATHS.includes(p));
          if (nonEssentialIdx > -1) {
            const removed = next.splice(nonEssentialIdx, 1)[0];
            console.log(`[HotScreenCache] LRU capacity limit reached. Evicted non-essential screen: ${removed}`);
          } else {
            // Evict the oldest essential path that is NOT the currently active path
            const oldestEssentialIdx = next.findIndex(p => p !== currentPath && ESSENTIAL_PATHS.includes(p));
            if (oldestEssentialIdx > -1) {
              const removed = next.splice(oldestEssentialIdx, 1)[0];
              console.log(`[HotScreenCache] LRU capacity limit reached. Evicted oldest essential screen: ${removed}`);
            } else {
              // Fallback unmount oldest screen
              const removed = next.shift();
              console.log(`[HotScreenCache] LRU capacity limit reached. Safely unmounted oldest screen: ${removed}`);
            }
          }
        }
      }
      return next;
    });
  }, [location.pathname, currentUser?.id, checkPermission]);

  const [redirectCountdown, setRedirectCountdown] = React.useState(4);
  const [shouldRedirectNow, setShouldRedirectNow] = React.useState(false);

  const isPathAllowed = (path: string, activeSetting: string | null) => {
    if (path === '/pdv-totem/kiosk') return true;
    if (!currentUser) return false;
    // ADM has absolute bypass
    if (currentUser.isAdmin || currentUser.isOwner || currentUser.isMasterAdmin || currentUser.roleId === 'admin' || currentUser.roleId === 'administrador') return true;

    // 1. Settings tab active check
    if (activeSetting) {
      const settingsMap: Record<string, string> = {
        empresa: 'Ajustes',
        seguranca: 'Ajustes',
        usuarios: 'Usuários e Funções',
        cracha: 'Crachá',
        rede: 'Ajustes',
      };
      const requiredModule = settingsMap[activeSetting];
      if (requiredModule) {
        return checkPermission(requiredModule, 'acessar');
      }
      return false;
    }

    // 3. Regular modules check
    const matchedModule = MODULES.find(m => m.path === path);
    if (matchedModule) {
      return checkPermission(matchedModule.name, 'acessar');
    }

    // 4. Root index is always allowed (has Meus Acessos for limited users)
    if (path === '/') return true;

    return false;
  };

  const allowed = isPathAllowed(location.pathname, activeSettingModule);

  // Manage countdown timer for unauthorized access
  React.useEffect(() => {
    if (!allowed) {
      setRedirectCountdown(4);
      setShouldRedirectNow(false);
      
      if (currentUser) {
        const currentBlockedPath = location.pathname + (activeSettingModule ? `/settings/${activeSettingModule}` : '');
        if (lastLoggedBlockedPathRef.current !== currentBlockedPath) {
          lastLoggedBlockedPathRef.current = currentBlockedPath;
          useStore.getState().logAction({
            module: 'Segurança',
            actionType: 'security' as any,
            action: 'Acesso Negado',
            description: `Tentativa negada de acesso ao módulo: ${activeSettingModule ? `Ajustes > ${activeSettingModule}` : (MODULES.find(m => m.path === location.pathname)?.name || location.pathname)}`,
            status: 'bloqueado' as any,
            riskLevel: 'alto' as any
          });
        }
      }
      
      const interval = setInterval(() => {
        setRedirectCountdown(prev => {
          if (prev <= 1) {
            clearInterval(interval);
            setShouldRedirectNow(true);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
      return () => clearInterval(interval);
    } else {
      // Clear ref and reset if navigating back to an allowed page
      lastLoggedBlockedPathRef.current = null;
    }
  }, [allowed, location.pathname, activeSettingModule, currentUser]);

  // Execute redirection to Home Page
  React.useEffect(() => {
    if (shouldRedirectNow) {
      setActiveSettingModule(null);
      setShouldRedirectNow(false);
      navigate('/', { replace: true });
    }
  }, [shouldRedirectNow, navigate, setActiveSettingModule]);

  // Track history
  React.useEffect(() => {
    addToHistory(location.pathname);
  }, [location.pathname, addToHistory]);

  // Measure menu transition times
  React.useEffect(() => {
    const activeModule = MODULES.find(m => m.path === location.pathname);
    if (activeModule) {
      perfLogger.start(`Navegação para o menu ${getModuleDisplayName(activeModule)}`);
    } else if (location.pathname === '/') {
      perfLogger.start('Navegação para o menu Início');
    }
  }, [location.pathname]);

  // Handle settings state preservation on navigation
  React.useEffect(() => {
    const state = location.state as { keepSettings?: boolean; activeModule?: string } | null;
    
    if (state?.keepSettings) {
      // Re-establish settings if navigation state requests it
      setIsSettingsOpen(true);
      if (state.activeModule) {
        setActiveSettingModule(state.activeModule as any);
      }
    } else if (!state || !state.keepSettings) {
      // Default behavior: close settings on route change
      setActiveSettingModule(null);
      setIsSettingsOpen(false);
    }
  }, [location.pathname, location.state, setActiveSettingModule, setIsSettingsOpen]);

  // Handle ESC key to close settings
  React.useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setIsSettingsOpen(false);
        setActiveSettingModule(null);
      }
    };
    window.addEventListener("keydown", handleEsc);
    return () => window.removeEventListener("keydown", handleEsc);
  }, [setIsSettingsOpen, setActiveSettingModule]);

  // Advanced Data Protection & Persistence
  React.useEffect(() => {
    let isApplied = true;

    if (isAuthenticated) {
      // 1. Reinforce persistence and initialize services
      import("./services/dataProtectionService").then(({ DataProtectionService }) => {
        if (!isApplied) return;
        DataProtectionService.reinforcePersistence();

        // Initialize Google Drive Service
        import("./services/googleDriveService").then(({ GoogleDriveService }) => {
          if (!isApplied) return;
          GoogleDriveService.initialize();
        });

        // Start Central Snapshot/Backup Scheduler
        import("./services/snapshotScheduler").then(({ SnapshotScheduler }) => {
          if (!isApplied) return;
          SnapshotScheduler.start();
        });
      });

      // 2. Electron-specific app close / quit snapshot interceptor
      const hasElectron = typeof window !== 'undefined' && (window as any).electron;
      if (hasElectron) {
        console.log('[App] Registrando interceptador nativo de encerramento do Electron...');
        const removeCloseListener = (window as any).electron.onAppCloseTriggered(async () => {
          console.info('[App] Mensagem de encerramento recebida do Electron! Executando snapshot de fechamento...');
          try {
            const state = useStore.getState();
            // Snapshot ao fechar o ERP se estiver dirty
            if (state.isDirty || state.isDriveDirty) {
              console.log('[App] Sistema detectou alterações não salvas no encerramento. Gravando backup rápido...');
              const rawString = await state.exportData();
              const parsed = JSON.parse(rawString);

              // 2.1 Backup Local
              await DataProtectionService.createSnapshot(
                parsed.data,
                parsed.version || '1.2.1',
                'auto',
                'Backup automático de rotina (Fechamento/Encerramento do ERP)'
              );

              // 2.2 Upload para Google Drive se ativo
              if (state.googleDriveBackupEnabled) {
                const encrypted = await DataProtectionService.exportEncryptedFile(parsed.data, parsed.version || '1.2.1');
                const nowStr = new Date().toISOString().slice(0, 19).replace(/T/g, '-').replace(/:/g, '-');
                const filename = `backup-exit-erp-${nowStr}.json`;

                const cloudPromise = import("./services/googleDriveService").then(({ GoogleDriveService }) => {
                  return GoogleDriveService.uploadBackupToCloud(encrypted, filename, 'auto');
                });

                // Limite de 5 segundos para o upload do backup ao fechar no Cloud Drive
                await Promise.race([
                  cloudPromise,
                  new Promise(res => setTimeout(res, 5000))
                ]);
              }
            } else {
              console.log('[App] Nada dirty no encerramento. Saindo sem backup adicional.');
            }
          } catch (exitErr) {
            console.error('[App] Erro crítico ao criar snapshot de encerramento:', exitErr);
          } finally {
            console.log('[App] Sinalizando para o processo principal que o fechamento forçado está autorizado.');
            (window as any).electron.forceQuit();
          }
        });

        return () => {
          isApplied = false;
          removeCloseListener();
          import("./services/snapshotScheduler").then(({ SnapshotScheduler }) => {
            SnapshotScheduler.stop();
          });
        };
      }
    }

    return () => {
      isApplied = false;
      import("./services/snapshotScheduler").then(({ SnapshotScheduler }) => {
        SnapshotScheduler.stop();
      });
    };
  }, [isAuthenticated]);

  const getModuleDisplayName = (module: (typeof MODULES)[0] | undefined) => {
    if (!module) return "Módulo";
    if (module.id === "abrir-caixa") {
      return isCashierOpen ? "Fechar Caixa" : "Abrir Caixa";
    }
    if (module.id === "pdv") {
      return "Vender";
    }
    return module.name;
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0A0A0A] flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const navigationHistory = useStore(state => state.navigationHistory) || [];
  const len = navigationHistory.length;
  
  // We have a valid previous path if there is an path anterior in the stack, and it is not the home page '/'
  const hasValidPreviousPath = len >= 2 && navigationHistory[len - 2] !== '/' && navigationHistory[len - 2] !== location.pathname;
  
  const showBackButton = hasValidPreviousPath || activeSettingModule !== null || activeSubSetting !== null || (location.pathname === '/estoque' && isInventoryModalOpen);

  const isKiosk = location.pathname === '/pdv-totem/kiosk' || window.location.hash.includes('/kiosk') || window.location.pathname.includes('/kiosk');

  if (isKiosk) {
    return (
      <div className="flex flex-col h-screen bg-[#070707] text-slate-300 overflow-hidden font-sans relative w-full">
        <Suspense fallback={<LoadingModule />}>
          <Routes>
            <Route path="/pdv-totem/kiosk" element={<PdvTotemModule />} />
            <Route path="*" element={<Navigate to="/pdv-totem/kiosk" replace />} />
          </Routes>
        </Suspense>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen bg-[#0A0A0A] text-slate-300 overflow-hidden font-sans relative">
      <AnimatePresence>
        {localNetwork.mode === "client" &&
          localNetwork.connectionStatus === "error" && (
            <motion.div
              initial={{ y: -100 }}
              animate={{ y: 0 }}
              exit={{ y: -100 }}
              className="fixed top-0 left-0 right-0 z-[1000] bg-red-600 p-3 flex items-center justify-between shadow-2xl"
            >
              <div className="flex items-center gap-3 ml-4">
                <div className="w-2 h-2 bg-white rounded-full animate-ping" />
                <span className="text-[10px] font-black text-white uppercase tracking-[0.2em]">
                  Conexão com servidor local perdida
                </span>
              </div>
              <div className="flex gap-2 mr-4">
                <button
                  onClick={() => {
                    updateLocalNetworkStatus({ connectionStatus: "connecting" });
                  }}
                  className="px-4 py-1.5 bg-white/20 hover:bg-white/30 text-white text-[9px] font-black uppercase rounded-lg transition-all"
                >
                  Tentar Reconectar
                </button>
                <button
                  onClick={() => {
                    // Allow working offline if possible
                    updateLocalNetworkStatus({
                      connectionStatus: "disconnected",
                    });
                  }}
                  className="px-4 py-1.5 bg-black/20 text-white/60 text-[9px] font-black uppercase rounded-lg"
                >
                  Ignorar
                </button>
              </div>
            </motion.div>
          )}

        {nfcModal.isOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[9999] bg-black/80 backdrop-blur-md flex items-center justify-center p-4"
          >
            <motion.div
              initial={{ scale: 0.95, y: 10 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.95, y: 10 }}
              className="w-full max-w-sm bg-[#121212]/95 border border-white/10 rounded-[2rem] p-6 shadow-2xl relative space-y-6"
            >
              {nfcModal.type === 'confirm_switch' ? (
                <>
                  <div className="w-12 h-12 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-500 mx-auto">
                    <RefreshCw className="w-6 h-6 animate-spin" />
                  </div>
                  <div className="space-y-2 text-center font-sans">
                    <h3 className="text-xs font-black text-white uppercase tracking-widest">Confirmar Operador</h3>
                    <p className="text-[11px] text-slate-300 leading-relaxed">
                      {nfcModal.message}
                    </p>
                    <div className="pt-2">
                      <span className="text-[9px] px-2.5 py-1 bg-white/5 rounded-full text-amber-500/90 font-mono font-bold tracking-wide">
                        TAG UID: {nfcModal.tagUid}
                      </span>
                    </div>
                  </div>
                  <div className="flex gap-2.5 font-sans">
                    <button
                      onClick={() => setNfcModal(prev => ({ ...prev, isOpen: false }))}
                      className="flex-1 py-3 px-4 bg-white/5 hover:bg-white/10 text-white rounded-xl text-[9px] font-black uppercase tracking-wider transition-all cursor-pointer"
                    >
                      Cancelar
                    </button>
                    <button
                      onClick={() => {
                        const newUser = nfcModal.newUser;
                        const tagObj = nfcModal.tagObject;
                        if (newUser && tagObj) {
                          // Audit: logout current user
                          useStore.getState().logAction({
                            module: 'Acesso',
                            actionType: 'login' as any,
                            action: 'Troca Rápida de Operador - Saída',
                            description: `Sessão anterior encerrada por troca rápida NFC (Usuário saindo: ${currentUser.fullName}, Login: ${currentUser.login})`,
                            status: 'sucesso' as any,
                            referenceId: currentUser.id
                          });

                          // Audit: login new user
                          useStore.getState().logAction({
                            module: 'Acesso',
                            actionType: 'login' as any,
                            action: 'Troca Rápida de Operador - Entrada',
                            description: `Sessão iniciada via troca rápida NFC (Novo usuário: ${newUser.fullName}, Login: ${newUser.login}, Tag: ${tagObj.uid})`,
                            status: 'sucesso' as any,
                            referenceId: newUser.id
                          });

                          useStore.getState().addActivity(`Troca rápida de operador feito para: ${newUser.fullName}`, 'auth', 'Acesso');

                          // Switch state
                          useStore.setState((state) => ({
                            currentUser: newUser,
                            isAuthenticated: true,
                            pendingWelcome: true,
                            nfcTags: (state.nfcTags || []).map(t => t.id === tagObj.id ? { ...t, ultimoUso: Date.now() } : t)
                          }));
                        }
                        setNfcModal(prev => ({ ...prev, isOpen: false }));
                      }}
                      className="flex-1 py-3 px-4 bg-amber-500 text-black hover:bg-amber-400 active:scale-95 transition-all font-black text-[9px] uppercase rounded-xl tracking-wider cursor-pointer"
                    >
                      Confirmar
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <div className="w-12 h-12 rounded-xl bg-red-500/10 border border-red-500/20 flex items-center justify-center text-red-500 mx-auto">
                    <AlertTriangle className="w-6 h-6 animate-pulse" />
                  </div>
                  <div className="space-y-2 text-center font-sans">
                    <h3 className="text-xs font-black text-white uppercase tracking-widest">Aviso Operacional</h3>
                    <p className="text-[11px] text-red-400 font-bold leading-normal uppercase tracking-wide">
                      {nfcModal.message}
                    </p>
                  </div>
                  <div className="pt-2 flex justify-center">
                    <button
                      onClick={() => setNfcModal(prev => ({ ...prev, isOpen: false }))}
                      className="w-full py-3 bg-white/5 hover:bg-white/10 text-white rounded-xl text-[9px] font-black uppercase tracking-wider transition-all cursor-pointer font-sans"
                    >
                      Certo, entendi
                    </button>
                  </div>
                </>
              )}
            </motion.div>
          </motion.div>
        )}

        {/* Floating Discrete Totem Notifications */}
        {pendingPayments.length > 0 && (
          <div id="totem-global-notifications" className="fixed bottom-6 right-6 z-[9999] flex flex-col gap-3 max-w-sm w-full pointer-events-none">
            <AnimatePresence>
              {pendingPayments.map((p) => (
                <motion.div
                  key={p.id}
                  initial={{ opacity: 0, y: 50, scale: 0.9 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, x: 100, scale: 0.9 }}
                  className="pointer-events-auto bg-[#121212]/95 border border-amber-500/30 rounded-2xl p-4 shadow-2xl flex flex-col gap-2 backdrop-blur-md relative overflow-hidden"
                >
                  <div className="absolute top-0 left-0 w-1.5 h-full bg-amber-550" />
                  <div className="flex justify-between items-center pl-2">
                    <span className="text-[9px] font-black uppercase text-amber-500 tracking-wider">
                      Terminal #{p.terminalId || 1}
                    </span>
                    <span className="text-[10px] font-mono font-extrabold text-white">
                      R$ {p.total.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                    </span>
                  </div>
                  <div className="pl-2 space-y-0.5">
                    <div className="text-[10px] text-zinc-450 uppercase truncate">
                      Cliente: <strong className="text-zinc-200 font-bold">{p.clientName || 'Consumidor Final'}</strong>
                    </div>
                    <div className="text-[10px] text-zinc-450 uppercase">
                      Forma: <strong className="text-amber-400 font-extrabold">{p.chosenMethod?.name || p.paymentType?.toUpperCase()}</strong>
                    </div>
                  </div>
                  <div className="pl-2 pt-1 flex gap-2">
                    <button
                      onClick={() => setSelectedPaymentForModal(p)}
                      className="px-3 py-1.5 bg-amber-500 hover:bg-amber-400 text-black text-[9px] font-black uppercase rounded-lg transition-all tracking-wider font-sans cursor-pointer flex-1 text-center font-bold"
                    >
                      Ver pagamento
                    </button>
                    <button
                      onClick={() => handleRefuseGlobalPayment(p)}
                      className="px-3 py-1.5 bg-red-550/10 hover:bg-red-550/20 text-red-400 text-[9px] font-black uppercase rounded-lg transition-all tracking-wider font-sans cursor-pointer text-center font-bold"
                    >
                      Recusar
                    </button>
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        )}

        {/* Detailed confirmation modal shown on click */}
        {selectedPaymentForModal && (() => {
          const activeReq = selectedPaymentForModal;
          const totalVal = activeReq.total || 0;
          const isMoney = activeReq.paymentType === 'money';
          const receivedVal = parseFloat(globalCashReceived) || 0;
          const changeVal = receivedVal >= totalVal ? receivedVal - totalVal : 0;
          const isProcessing = processedPaymentIds.includes(activeReq.id);

          return (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-[10000] bg-black/85 backdrop-blur-md flex items-center justify-center p-4 font-sans select-none"
            >
              <motion.div
                initial={{ scale: 0.95, y: 15 }}
                animate={{ scale: 1, y: 0 }}
                exit={{ scale: 0.95, y: 15 }}
                className="w-full max-w-lg bg-[#0e0e0e] border border-amber-500/20 rounded-[2.5rem] p-8 shadow-2xl relative space-y-6"
              >
                {/* Close Button */}
                <button
                  onClick={() => {
                    setSelectedPaymentForModal(null);
                    setGlobalCashReceived('');
                  }}
                  className="absolute top-6 right-6 text-zinc-400 hover:text-white text-xs border border-white/5 bg-white/5 hover:bg-white/10 rounded-full w-8 h-8 flex items-center justify-center cursor-pointer"
                >
                  ✕
                </button>

                <div className="flex items-center justify-between border-b border-white/5 pb-4">
                  <div className="flex items-center gap-2.5">
                    <div className="w-2 h-2 rounded-full bg-amber-500 animate-ping" />
                    <span className="text-[10px] uppercase font-black text-amber-500 tracking-widest leading-none">Confirmar Pagamento Totem</span>
                  </div>
                  <span className="text-[9px] font-mono px-3 py-1 bg-amber-500/10 border border-amber-550/25 text-amber-400 rounded-full font-bold uppercase tracking-wider">
                    Terminal #{activeReq.terminalId || 1}
                  </span>
                </div>

                <div className="space-y-4">
                  <div className="flex justify-between items-center text-xs">
                    <span className="text-zinc-500 uppercase">Cliente:</span>
                    <span className="text-white font-bold">{activeReq.clientName || 'Consumidor Final'}</span>
                  </div>

                  <div className="bg-black/45 hover:bg-black/60 rounded-2xl p-4 border border-white/5 space-y-3 transition-all">
                    <span className="text-[8.5px] uppercase font-bold text-zinc-500 tracking-widest block border-b border-white/5 pb-1.5">Resumo dos Itens ({activeReq.salePayload?.items?.length || 0})</span>
                    <div className="max-h-32 overflow-y-auto custom-scrollbar space-y-2 pr-1 text-[10px] font-mono">
                      {activeReq.salePayload?.items?.map((item: any, idx: number) => (
                        <div key={idx} className="flex justify-between items-center">
                          <span className="text-zinc-350 uppercase truncate max-w-[280px]">{item.name} (x{item.quantity})</span>
                          <span className="text-white">R$ {(item.price * item.quantity).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {isMoney ? (
                    <div className="bg-amber-500/5 border border-amber-500/15 rounded-2xl p-4 space-y-3 font-sans">
                      <div className="flex justify-between items-center text-xs text-amber-500 font-bold uppercase">
                        <span>Valor do Pedido:</span>
                        <strong className="text-sm font-mono font-black text-amber-400">R$ {totalVal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</strong>
                      </div>
                      
                      <div className="space-y-1">
                        <label className="text-[8.5px] uppercase font-black tracking-widest text-zinc-400 block">Valor Recebido do Cliente (Em Dinheiro)</label>
                        <div className="relative">
                          <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-xs font-bold text-zinc-400 font-mono">R$</span>
                          <input
                            type="text"
                            value={globalCashReceived}
                            onChange={(e) => setGlobalCashReceived(e.target.value)}
                            placeholder={totalVal.toFixed(2)}
                            className="w-full bg-zinc-950/80 hover:bg-zinc-950 border border-white/10 rounded-xl py-2 px-10 text-xs text-white font-mono placeholder-zinc-700 outline-none focus:border-amber-500/50 transition-all font-bold"
                          />
                        </div>
                      </div>

                      <div className="flex justify-between items-center text-xs border-t border-white/5 pt-2">
                        <span className="text-zinc-500 uppercase">Troco a Devolver:</span>
                        {receivedVal >= totalVal ? (
                          <strong className="text-emerald-400 font-mono font-black text-sm">R$ {changeVal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</strong>
                        ) : (
                          <strong className="text-red-400 text-[10px] uppercase font-bold">Aguardando Dinheiro suficiente...</strong>
                        )}
                      </div>
                    </div>
                  ) : (
                    <div className="bg-emerald-500/5 border border-emerald-500/15 rounded-2xl p-4 space-y-3 text-center">
                      <span className="text-xs font-bold text-emerald-400 uppercase tracking-wider block">Forma: {activeReq.chosenMethod?.name || 'Pix'}</span>
                      <p className="text-[10px] text-zinc-400 uppercase max-w-sm mx-auto leading-relaxed">
                        Por favor, confirme se o valor de <strong className="text-white font-mono">R$ {totalVal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</strong> entrou em sua conta/maquininha antes de liberar o autoatendimento.
                      </p>
                    </div>
                  )}
                </div>

                <div className="flex flex-col sm:flex-row gap-3 pt-2 border-t border-white/5">
                  <button
                    onClick={() => handleRefuseGlobalPayment(activeReq)}
                    disabled={isProcessing}
                    className="flex-1 py-3.5 bg-red-550/10 hover:bg-red-550/18 border border-red-500/10 hover:border-red-550/20 text-red-400 hover:text-red-300 rounded-2xl text-[9px] uppercase font-black tracking-widest transition-all cursor-pointer disabled:opacity-50 font-bold"
                  >
                    Cancelar pagamento
                  </button>

                  <button
                    onClick={() => {
                      if (isMoney) {
                        const val = parseFloat(globalCashReceived) || 0;
                        handleApproveGlobalPayment(activeReq, val, val - totalVal);
                      } else {
                        handleApproveGlobalPayment(activeReq);
                      }
                    }}
                    disabled={isProcessing || (isMoney && receivedVal < totalVal)}
                    className={`flex-1 py-3.5 rounded-2xl text-[9px] uppercase font-black tracking-widest transition-all shadow-lg flex items-center justify-center gap-2 ${
                      (isMoney && receivedVal < totalVal) || isProcessing
                        ? 'bg-zinc-800 text-zinc-600 border border-zinc-700/55 cursor-not-allowed opacity-60'
                        : 'bg-emerald-500 hover:bg-emerald-400 text-black shadow-emerald-500/15 cursor-pointer active:scale-95 font-bold'
                    }`}
                  >
                    {isProcessing ? 'Processando...' : 'Confirmar pagamento'}
                  </button>
                </div>
              </motion.div>
            </motion.div>
          );
        })()}


      </AnimatePresence>

      {/* Test Environment Banner */}
      {environmentService.isTestEnvironment() && (
        <div id="test-env-banner" className="bg-amber-500 text-black text-[10px] font-black uppercase text-center py-1.5 tracking-widest select-none z-[100] shrink-0 flex items-center justify-center gap-1.5 border-b border-amber-600/20 shadow-md">
          <AlertTriangle className="w-3.5 h-3.5 animate-pulse text-black" />
          AMBIENTE DE TESTE — dados separados da produção
        </div>
      )}

      {/* Header */}
      <header className={cn(
        "h-14 border-b border-white/5 bg-[#121212]/50 backdrop-blur-xl flex items-center justify-between px-6 shrink-0 z-50",
        location.pathname === '/separacao' && "hidden"
      )}>
        <div className="flex items-center gap-2">
          {(location.pathname !== "/" || activeSettingModule) && (
            <div className="flex items-center gap-2">
              {showBackButton && (
                <button
                  onClick={() => {
                    if (hasActivePicking && location.pathname === '/separacao') {
                       window.dispatchEvent(new CustomEvent('trigger-cancel-picking-check'));
                       return;
                    }
                    if (location.pathname === '/estoque' && isInventoryModalOpen) {
                       window.dispatchEvent(new CustomEvent('trigger-close-product-modal'));
                       return;
                    }
                    if (activeSubSetting) {
                      setActiveSubSetting(null);
                    } else if (activeSettingModule) {
                      setActiveSettingModule(null);
                    } else if (hasValidPreviousPath) {
                      const previousPath = navigationHistory[navigationHistory.length - 2];
                      if (previousPath === '/pdv' && !isCashierOpen) {
                        navigate('/');
                      } else {
                        navigate(previousPath);
                      }
                    } else {
                      navigate('/');
                    }
                  }}
                  className="p-2 rounded-lg hover:bg-white/5 text-slate-400 hover:text-white transition-all active:scale-95"
                  title="Voltar"
                >
                  <ArrowLeft className="w-5 h-5" />
                </button>
              )}
              <Link
                to={hasActivePicking && location.pathname === '/separacao' ? '#' : '/'}
                onClick={(e) => {
                  if (hasActivePicking && location.pathname === '/separacao') {
                    e.preventDefault();
                    window.dispatchEvent(new CustomEvent('trigger-cancel-picking-check'));
                    return;
                  }
                  setActiveSettingModule(null);
                  setActiveSubSetting(null);
                }}
                className="p-2 rounded-lg hover:bg-white/5 text-slate-400 hover:text-white transition-all active:scale-95"
                title="Início"
              >
                <HomeIcon className="w-5 h-5" />
              </Link>
              
              <div className="w-px h-6 bg-white/10 mx-2" />
              
              <div className="flex flex-col">
                <h1 className="text-xs font-black text-white uppercase tracking-tight leading-none flex items-center gap-2">
                  {location.pathname === '/gestao-pedidos' && <ClipboardList className="w-3.5 h-3.5 text-emerald-500" />}
                  {activeSettingModule === 'temas' ? "Temas Globais" :
                   activeSettingModule === 'network' ? "Rede" :
                   activeSettingModule === 'qrcode' ? "Identificar QR Code" :
                   activeSettingModule === 'seguranca' ? "Segurança do Sistema" :
                   activeSettingModule === 'cracha' ? (
                     <div className="flex items-center gap-2">
                       <Shield className="w-4 h-4 text-emerald-500" />
                       <span>Crachá</span>
                     </div>
                   ) :
                   activeSettingModule === 'cupons' ? (
                     activeSubSetting === 'recibo' ? "Recibo Térmico" :
                     activeSubSetting === 'pedido' ? "Cupom Pedido" :
                     activeSubSetting === 'etiqueta' ? "Etiqueta" :
                     activeSubSetting === 'lote' ? "Lote de Etiqueta" :
                     "Cupons e Etiquetas"
                   ) :
                   activeSettingModule || 
                   MODULES.find(m => m.path === location.pathname)?.name || "Sistema"}
                </h1>
              </div>
            </div>
          )}
        </div>

        <div className="flex items-center gap-4">
          {location.pathname === '/gestao-pedidos' && (
            <button
              onClick={() => {
                // Dispatch a custom event to open the search modal in OrderManagementModule
                window.dispatchEvent(new CustomEvent('open-order-search'));
              }}
              className="flex items-center gap-2 px-4 py-1.5 bg-emerald-500 hover:bg-emerald-400 text-black rounded-full text-[10px] font-black uppercase transition-all shadow-lg"
            >
              <Search className="w-3.5 h-3.5" />
              Consultar Pedido
            </button>
          )}



          <button
            onClick={() => {
              if (hasActivePicking && location.pathname === '/separacao') {
                window.dispatchEvent(new CustomEvent('trigger-cancel-picking-check'));
                return;
              }
              setIsSettingsOpen(!isSettingsOpen);
            }}
            className={cn(
              "flex items-center gap-2 px-4 py-1.5 border rounded-full text-[10px] font-black text-white uppercase transition-all",
              isSettingsOpen 
                ? "bg-emerald-500/20 border-emerald-500/50 text-emerald-400" 
                : "bg-white/5 hover:bg-white/10 border-white/5"
            )}
          >
            <Settings className={cn("w-3.5 h-3.5", isSettingsOpen && "animate-spin-slow")} />
            <span>Ajustes</span>
          </button>
        </div>
      </header>

      {/* Main Viewport */}
      <main className="flex-1 relative transition-all duration-300 ease-in-out overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,_rgba(16,185,129,0.03),_transparent_40%)] pointer-events-none" />
        
        <div className={cn(
          "h-full w-full custom-scrollbar flex flex-col",
          (activeSettingModule || location.pathname === '/separacao' || location.pathname === '/gestao-pedidos' || isHotPathActive) ? "overflow-hidden" : "overflow-y-auto"
        )}>
          {!allowed ? (
            <div className="h-full flex flex-col items-center justify-center py-12 px-6 text-center select-none bg-[#090909]">
              <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_50%,_rgba(239,68,68,0.03),_transparent_50%)] pointer-events-none animate-pulse" />
              
              <motion.div
                initial={{ opacity: 0, scale: 0.95, y: 15 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                className="w-full max-w-md bg-[#121212]/90 border border-red-500/15 rounded-[2.5rem] p-10 shadow-2xl relative z-10 space-y-6"
              >
                <div className="relative mx-auto w-16 h-16 bg-red-500/10 border border-red-500/20 rounded-[1.25rem] flex items-center justify-center text-red-500 shadow-lg">
                  <ShieldAlert className="w-8 h-8" />
                </div>

                <div className="space-y-2">
                  <h2 className="text-sm font-black text-white uppercase tracking-widest">Acesso Restrito</h2>
                  <p className="text-[11px] font-bold text-red-400 uppercase tracking-wide leading-relaxed">
                    Você não possui permissão para acessar este módulo.
                  </p>
                  <p className="text-[9px] text-white/30 uppercase font-medium leading-relaxed max-w-xs mx-auto pt-2">
                    Esta área é restrita para o seu perfil operacional. Consulte o seu administrador para obter as permissões necessárias.
                  </p>
                </div>

                <div className="bg-black/35 rounded-2xl p-4 border border-white/5 space-y-1">
                  <p className="text-[8px] font-mono uppercase text-white/40 tracking-wider">Redirecionando Automaticamente</p>
                  <div className="flex items-center justify-center gap-2">
                    <span className="text-[10px] font-black text-amber-500 tracking-widest">{redirectCountdown}s</span>
                    <div className="w-24 bg-white/5 h-1 rounded-full overflow-hidden">
                      <motion.div 
                        key={location.pathname + activeSettingModule}
                        initial={{ width: "100%" }}
                        animate={{ width: "0%" }}
                        transition={{ duration: 4, ease: "linear" }}
                        className="h-full bg-amber-500"
                      />
                    </div>
                  </div>
                </div>

                <div className="flex gap-3">
                  <button
                    onClick={() => {
                      setActiveSettingModule(null);
                      navigate('/');
                    }}
                    className="flex-1 py-4 bg-white/5 text-white border border-white/5 rounded-2xl text-[9px] font-black uppercase tracking-widest hover:bg-white/10 hover:text-white transition-all active:scale-95 cursor-pointer"
                  >
                    Voltar ao Início
                  </button>
                </div>
              </motion.div>
            </div>
          ) : activeSettingModule ? (
            <Suspense fallback={<LoadingModule />}>
              <SettingsContent module={activeSettingModule} />
            </Suspense>
          ) : (
            <div className="w-full h-full relative flex flex-col overflow-hidden">
              {/* Parallel Keep-Alive Hot Screens Layer */}
              {HOT_SCREENS_METADATA.map((screen) => {
                const isCurrentlyCached = cachedPaths.includes(screen.path);
                if (!isCurrentlyCached) return null;

                const isActive = location.pathname === screen.path;

                return (
                  <div
                    key={screen.path}
                    className={cn(
                      "w-full h-full flex flex-col",
                      (screen.id === 'separacao' || screen.id === 'gestao-pedidos' || screen.id === 'central-operacional') ? "overflow-hidden" : "overflow-y-auto custom-scrollbar",
                      isActive ? "visible flex animate-fadeIn" : "hidden"
                    )}
                    style={{ display: isActive ? undefined : 'none' }}
                  >
                    <Suspense fallback={<LoadingModule />}>
                      <screen.Component name={screen.name} active={isActive} />
                    </Suspense>
                  </div>
                );
              })}

              {/* Standard Routes (fallback viewport for non-cached views) */}
              <div 
                className={cn("w-full h-full flex flex-col", isHotPathActive ? "hidden" : "overflow-y-auto custom-scrollbar")}
                style={{ display: isHotPathActive ? 'none' : undefined }}
              >
                <Suspense fallback={<LoadingModule />}>
                  <Routes>
                    <Route path="/" element={<Home />} />
                    <Route path="/experiencia-cliente" element={<div className="hidden" id="placeholder-experiencia-cliente" />} />
                    {MODULES.map((m) => {
                      const Component = ModuleComponentMap[m.id] || ModulePlaceholder;
                      const isHot = HOT_SCREENS_METADATA.some(hs => hs.path === m.path);
                      return (
                        <Route 
                          key={m.id}
                          {...({
                            path: m.path,
                            element: isHot ? (
                              <div className="hidden" id={`placeholder-${m.id}`} />
                            ) : (
                              <ModuleRouteWrapper 
                                id={m.id} 
                                name={getModuleDisplayName(m)} 
                                Component={Component} 
                              />
                            )
                          } as any)}
                        />
                      );
                    })}
                    <Route path="/dashboard" element={<Navigate to="/central-operacional?aba=visao-geral" replace />} />
                    <Route path="/historico" element={<Navigate to="/central-operacional?aba=auditoria" replace />} />
                    <Route path="/historico-caixa" element={<Navigate to="/central-operacional?aba=caixa" replace />} />
                    <Route path="/notificacoes" element={<Navigate to="/central-operacional?aba=alertas" replace />} />
                    <Route path="/automacao" element={<Navigate to="/central-operacional?aba=automacoes" replace />} />
                    <Route path="/performance-operacional" element={<Navigate to="/central-operacional?aba=relatorios" replace />} />
                    <Route path="/relatorios" element={<Navigate to="/central-operacional?aba=relatorios" replace />} />
                    <Route path="*" element={<Navigate to="/" replace />} />
                  </Routes>
                </Suspense>
              </div>
            </div>
          )}
        </div>
      </main>

      {/* Status Bar */}
      <footer className={cn(
        "h-8 border-t border-white/5 flex justify-between items-center px-1 md:px-6 bg-[#0e0e0e] text-[8px] uppercase font-black tracking-[0.2em] text-white/20 select-none shrink-0",
        (location.pathname === '/separacao' || location.pathname === '/gestao-pedidos') && "hidden lg:flex"
      )}>
        <div className="flex gap-8 items-center">
          <div className="flex items-center gap-2">
            <div className={cn("w-1.5 h-1.5 rounded-full", localNetwork.isActive || (localNetwork.mode === 'client' && localNetwork.connectionStatus === 'connected') ? "bg-emerald-500 animate-pulse" : "bg-red-500")} />
            {localNetwork.mode === 'client' 
              ? `Celular Cliente :: ${localNetwork.connectionStatus === 'connected' ? 'PAREADO' : 'DESCONECTADO'}`
              : `Servidor Central :: ${localNetwork.isActive ? `${localNetwork.ip}:${localNetwork.port}` : "Inativo"}`
            }
          </div>
          
          {/* Sync Engine Indicator */}
          <SyncFooterIndicator />
        </div>
        <div className="flex gap-4">
          <span className="hidden sm:inline">Banco Local :: IDB Persistido</span>
          <span className="text-emerald-500/30">{new Date().toLocaleTimeString('pt-BR')}</span>
        </div>
      </footer>

      <Suspense fallback={null}>
        <SettingsDrawer 
          isOpen={isSettingsOpen} 
          onClose={() => setIsSettingsOpen(false)} 
        />
      </Suspense>
    </div>
  );
}

const speakWelcome = (fullNameOrLogin: string) => {
  if (typeof window === 'undefined' || !window.speechSynthesis) return;
  try {
    const isVoiceEnabled = localStorage.getItem('voice_welcome_enabled') === 'true';
    if (!isVoiceEnabled) return;

    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(`Bem-vindo, ${fullNameOrLogin}`);
    utterance.lang = 'pt-BR';
    utterance.volume = 0.6; // Moderate volume
    
    // Attempt to locate pt-BR voice
    const voices = window.speechSynthesis.getVoices();
    const ptVoice = voices.find(v => v.lang.includes('pt-BR') || v.lang.includes('pt'));
    if (ptVoice) {
      utterance.voice = ptVoice;
    }
    window.speechSynthesis.speak(utterance);
  } catch (err) {
    console.error('Speech synthesis failed', err);
  }
};

function Main() {
  const currentUser = useStore((state) => state.currentUser);
  const isAuthenticated = useStore((state) => state.isAuthenticated);
  const pendingWelcome = useStore((state) => state.pendingWelcome);
  const setPendingWelcome = useStore((state) => state.setPendingWelcome);
  const logoutLocal = useStore((state) => state.logoutLocal);
  const hasHydrated = useStore((state) => state.hasHydrated);
  const sqliteStatus = useStore((state) => state.sqliteStatus);
  const navigate = useNavigate();
  const location = useLocation();
  
  const isAuth = isAuthenticated && !!currentUser;

  const [bootError, setBootError] = React.useState<string | null>(null);
  const [bootSummary, setBootSummary] = React.useState<string | null>(null);
  const [showResilienceNotice, setShowResilienceNotice] = React.useState(false);
  const [idbLoadError, setIdbLoadError] = React.useState(false);

  React.useEffect(() => {
    const checkIdb = () => {
      if (typeof window !== 'undefined' && (window as any).__idbLoadFailed) {
        setIdbLoadError(true);
      }
    };
    checkIdb();

    // Event listener for immediate notification without periodic polling overhead
    const handleIdbFailure = () => {
      setIdbLoadError(true);
    };

    if (typeof window !== 'undefined') {
      window.addEventListener('idb-load-failed', handleIdbFailure);
    }

    // High interval check (10 seconds) as a backup defense of last resort with negligible CPU impact
    const idbTimer = setInterval(checkIdb, 10000);

    return () => {
      if (typeof window !== 'undefined') {
        window.removeEventListener('idb-load-failed', handleIdbFailure);
      }
      clearInterval(idbTimer);
    };
  }, []);

  // Subscribe to defensive boot tracker errors
  React.useEffect(() => {
    return bootTracker.subscribeError((errorMsg, summary) => {
      console.warn(`[DEFENSIVE_BOOT] Suppressed visual blocking: ${errorMsg}`);
    });
  }, []);

  React.useEffect(() => {
    if (hasHydrated) {
      setShowResilienceNotice(false);
      return;
    }
    const timer = setTimeout(() => {
      if (!hasHydrated) {
        setShowResilienceNotice(true);
      }
    }, 6000);
    return () => clearTimeout(timer);
  }, [hasHydrated]);

  // Track auth restoration, networking & sync engine steps
  React.useEffect(() => {
    if (!hasHydrated) return;

    // Initialize centralized background print queue spooler
    try {
      initializePrintSpooler();
    } catch (e) {
      console.error('[App] Failed to start background print spooler:', e);
    }

    bootTracker.trackStep('AUTH_RESTORE_START');
    const isAuthAct = isAuthenticated && !!currentUser;
    bootTracker.trackStep('AUTH_RESTORE_DONE');

    if (isAuthAct) {
      bootTracker.trackStep('NETWORK_SERVICE_START');
      bootTracker.trackPromise('networkService_initialize', async () => {
        await networkService.initialize();
      }, 5000)
        .then(() => bootTracker.trackStep('NETWORK_SERVICE_DONE'))
        .catch(() => bootTracker.trackStep('NETWORK_SERVICE_DONE'));

      bootTracker.trackStep('SYNC_ENGINE_START');
      bootTracker.trackPromise('syncService_initialize', async () => {
        await syncService.initialize();
      }, 5000)
        .then(() => bootTracker.trackStep('SYNC_ENGINE_DONE'))
        .catch(() => bootTracker.trackStep('SYNC_ENGINE_DONE'));
    } else {
      try {
        networkService.destroy();
      } catch (e) {}
      try {
        syncService.destroy();
      } catch (e) {}

      bootTracker.trackStep('NETWORK_SERVICE_START');
      bootTracker.trackStep('NETWORK_SERVICE_DONE');
      bootTracker.trackStep('SYNC_ENGINE_START');
      bootTracker.trackStep('SYNC_ENGINE_DONE');
    }

    bootTracker.trackStep('HOME_RENDER_START');

    return () => {
      try {
        networkService.destroy();
      } catch (e) {}
      try {
        syncService.destroy();
      } catch (e) {}
    };
  }, [hasHydrated, isAuthenticated, currentUser]);

  // Track final rendering stages to achieve APP_READY
  React.useEffect(() => {
    if (!hasHydrated) return;

    const finishTimer = setTimeout(() => {
      const current = bootTracker.getCurrentStep();
      if (
        current === 'HOME_RENDER_START' || 
        current === 'SYNC_ENGINE_DONE'
      ) {
        bootTracker.trackStep('HOME_RENDER_DONE');
        bootTracker.trackStep('APP_READY');
      }
    }, 50);

    return () => clearTimeout(finishTimer);
  }, [hasHydrated, location.pathname]);

  // Welcome state
  const [showWelcome, setShowWelcome] = React.useState(false);
  const [welcomeUser, setWelcomeUser] = React.useState<any>(null);

  // Support hot reload or focus reload by not redirecting already-authenticated users to root
  const [isCheckingInitialRoute, setIsCheckingInitialRoute] = React.useState(true);

  // Trigger welcome screen once when pendingWelcome is true
  React.useEffect(() => {
    if (!hasHydrated) return;
    if (isAuth && currentUser && pendingWelcome) {
      setWelcomeUser(currentUser);
      setShowWelcome(true);
      setPendingWelcome(false);
      speakWelcome(currentUser.fullName || currentUser.login);
    } else if (!isAuth) {
      setWelcomeUser(null);
      setShowWelcome(false);
    }
  }, [isAuth, currentUser, pendingWelcome, setPendingWelcome, hasHydrated]);

  // Handle welcome timer independently so its timeout is never cleared by pendingWelcome re-runs
  React.useEffect(() => {
    if (showWelcome) {
      const timer = setTimeout(() => {
        setShowWelcome(false);
      }, 1800);
      return () => clearTimeout(timer);
    }
  }, [showWelcome]);

  // Force redirection to root/login when not authenticated
  React.useEffect(() => {
    if (!hasHydrated) return;
    const isPublicCatalog = location.pathname.startsWith('/vitrine') || location.pathname.startsWith('/catalogo-publico');
    const isKioskPath = location.pathname === '/pdv-totem/kiosk' || window.location.hash.includes('/kiosk') || window.location.pathname.includes('/kiosk');
    if (!isAuth && !isPublicCatalog && !isKioskPath) {
      navigate('/', { replace: true });
    }
  }, [isAuth, navigate, location.pathname, hasHydrated]);

  // Track if this is the very first mount of the React execution session.
  // This guarantees that whenever the system code is altered (causing a hot reload / app refresh)
  // or whenever a fresh session/reload is performed, we cleanly return to the main menu '/'
  // instead of getting stuck on stale sub-routes like '/central-operacional'.
  const isInitialRouteCheckedRef = React.useRef(false);

  React.useEffect(() => {
    if (!hasHydrated) return;

    const isKioskPath = location.pathname === '/pdv-totem/kiosk' || window.location.hash.includes('/kiosk') || window.location.pathname.includes('/kiosk');
    if (isKioskPath) {
      setIsCheckingInitialRoute(false);
      return;
    }

    const isCustomerDisplayPath = location.pathname === '/pdv/customer-display' || window.location.hash.includes('/pdv/customer-display') || window.location.pathname.includes('/pdv/customer-display');
    if (isCustomerDisplayPath) {
      setIsCheckingInitialRoute(false);
      return;
    }

    if (!isAuth) {
      setIsCheckingInitialRoute(false);
      return;
    }

    // If we already finished the check, do not run again
    if (isInitialRouteCheckedRef.current) {
      return;
    }

    const isPublicCatalog = location.pathname.startsWith('/vitrine') || location.pathname.startsWith('/catalogo-publico');
    if (!isPublicCatalog && location.pathname !== '/') {
      console.log(`[InitialRoute] Returning to main menu. Previous leftover path was: ${location.pathname}`);
      navigate('/', { replace: true });
      // Keep isCheckingInitialRoute as true, do not set isInitialRouteCheckedRef to true yet.
      // This hook will re-run when location changes to '/'
    } else {
      isInitialRouteCheckedRef.current = true;
      setIsCheckingInitialRoute(false);
    }
  }, [hasHydrated, isAuth, navigate, location.pathname]);
  
  // Force logout and state fix logic
  React.useEffect(() => {
    if (!hasHydrated) return;
    const { users, updateUser, addUser } = useStore.getState();
    const adminUser = users.find(u => u.id === 'admin');
    
    if (adminUser) {
      if (!adminUser.qrCodeToken) {
        updateUser('admin', { qrCodeToken: 'admin-initial-token' });
      }
    } else {
      addUser({
        id: 'admin',
        fullName: 'Administrador Nexa',
        login: 'admin',
        matricula: 'admin',
        password: '1234',
        roleId: 'administrador',
        status: 'ativo',
        isAdmin: true,
        isOwner: true,
        isMasterAdmin: true,
        qrCodeToken: 'admin-initial-token'
      });
    }

    if (currentUser && !currentUser.qrCodeToken) {
      updateUser(currentUser.id, { qrCodeToken: 'user-token-' + currentUser.id });
    }
  }, [currentUser, logoutLocal, hasHydrated]);

  if (idbLoadError) {
    return (
      <div className="min-h-[100dvh] md:min-h-screen bg-[#0A0A0A] flex flex-col items-center justify-center p-4 relative select-none">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_50%,_rgba(239,68,68,0.04),_transparent_45%)] pointer-events-none" />
        <div className="w-full max-w-lg bg-[#121212]/90 backdrop-blur-3xl border border-red-500/20 rounded-[2.5rem] p-10 shadow-2xl flex flex-col items-center space-y-6 text-center text-white relative z-10 animate-fade-in">
          <div className="w-20 h-20 bg-red-500/10 border border-red-500/20 text-red-500 rounded-[2rem] flex items-center justify-center">
            <ShieldAlert className="w-10 h-10" />
          </div>
          
          <div className="space-y-2">
            <span className="text-[10px] text-red-400 font-black tracking-[0.3em] uppercase">Falha de Armazenamento Local</span>
            <h1 className="text-xl md:text-2xl font-black uppercase tracking-tight">Banco de Dados Offline / Travado</h1>
            <p className="text-xs text-white/50 leading-relaxed font-sans max-w-md">
              O sistema detectou um erro ou tempo limite ao carregar os dados locais (IndexedDB). Para proteger contra perda ou sobrescrita do banco real, as gravações automáticas foram bloqueadas.
            </p>
          </div>

          <div className="bg-[#181818]/60 rounded-2xl border border-white/5 p-4 w-full font-mono text-[9px] text-zinc-400 leading-normal select-text text-left">
            <span>Motivo: Timeout ou Erro ao acessar o storage do navegador (IndexedDB) no dispositivo local. Gravações bloqueadas preventivamente.</span>
          </div>

          <div className="flex gap-3 w-full font-mono text-[10px]">
            <button
              onClick={() => window.location.reload()}
              className="flex-1 py-3 bg-red-500 hover:bg-red-400 text-black font-black uppercase rounded-xl transition-all cursor-pointer font-sans"
            >
              Reiniciar App
            </button>
            <button
              onClick={() => {
                if (typeof window !== 'undefined') {
                  (window as any).__idbLoadFailed = false;
                }
                setIdbLoadError(false);
                useStore.getState().setHasHydrated(true);
              }}
              className="px-4 py-3 bg-white/5 hover:bg-white/10 text-white font-bold uppercase rounded-xl border border-white/5 transition-all cursor-pointer font-sans"
            >
              Forçar Ignorar
            </button>
          </div>
        </div>
      </div>
    );
  }

  const isSecondaryPath = location.pathname.includes('kiosk') || 
                          window.location.hash.includes('kiosk') || 
                          location.pathname.includes('customer-display') || 
                          window.location.hash.includes('customer-display');

  if (hasHydrated && sqliteStatus === 'error' && !isSecondaryPath) {
    return (
      <div className="min-h-[100dvh] md:min-h-screen bg-[#0A0A0A] flex items-center justify-center p-4 relative select-none">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_50%,_rgba(239,68,68,0.06),_transparent_45%)] pointer-events-none" />
        <div className="w-full max-w-lg bg-[#121212]/90 backdrop-blur-3xl border border-red-500/20 rounded-[2.5rem] p-10 shadow-2xl flex flex-col items-center space-y-6 text-center text-white relative z-10 animate-fade-in animate-duration-300">
          <div className="w-20 h-20 bg-red-500/10 border border-red-500/20 text-red-500 rounded-[2rem] flex items-center justify-center font-bold">
            <ShieldAlert className="w-10 h-10 animate-pulse" />
          </div>
          
          <div className="space-y-2">
            <span className="text-[10px] text-red-400 font-bold tracking-[0.3em] uppercase">Falha de Banco de Dados Local</span>
            <h1 className="text-xl md:text-2xl font-black uppercase tracking-tight">O banco de dados local não carregou</h1>
            <p className="text-xs text-white/60 leading-relaxed font-sans max-w-md">
              O sistema Electron/Desktop não conseguiu estabelecer uma conexão segura ou ler as tabelas persistentes do SQLite. Por questões de segurança de integridade fiscal e comercial, o acesso a cadastros e vendas foi bloqueado preventivamente.
            </p>
          </div>

          <div className="bg-[#181818]/60 rounded-2xl border border-white/5 p-4 w-full font-sans text-xs text-zinc-400 leading-relaxed select-text text-left space-y-1">
            <p className="font-semibold text-white">Instruções para Resolução:</p>
            <p>1. Reinicie o sistema ou verifique a instalação.</p>
            <p>2. Certifique-se de que não há outra instância do ERP aberta em segundo plano utilizando o arquivo de banco local.</p>
            <p>3. Se o erro persistir, entre em contato com o suporte de T.I. para inspeção do arquivo <code className="text-red-400 font-mono text-[10px]">erp-local.db</code>.</p>
          </div>

          <div className="flex gap-3 w-full font-mono text-[10px] font-bold">
            <button
              onClick={() => window.location.reload()}
              className="flex-1 py-3.5 bg-red-500 hover:bg-red-400 active:scale-[0.98] text-black font-black uppercase rounded-xl transition-all cursor-pointer text-center font-sans"
            >
              Reiniciar Sistema
            </button>
            {!(typeof window !== 'undefined' && (!!(window as any).electron || navigator.userAgent.toLowerCase().includes('electron'))) && (
              <button
                onClick={() => {
                  // Allows forced fallback to web/IDB only for browsing legacy backups or emergency web scenarios
                  useStore.getState().setSQLiteData({ sqliteStatus: 'web' });
                }}
                className="py-3.5 px-4 bg-white/5 hover:bg-white/10 active:scale-[0.98] text-white uppercase rounded-xl border border-white/5 transition-all cursor-pointer font-sans"
                title="Apenas leitura de dados de backup se existirem"
              >
                Usar Contingência Web
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  // 0. Ensure no layouts or routing views are loaded before storage hydration is completed
  // This completely stops state collision where un-hydrated states overwrite clean database data!
  if (bootError) {
    return (
      <div className="min-h-[100dvh] md:min-h-screen bg-[#0A0A0A] flex items-center justify-center p-4">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_50%,_rgba(239,68,68,0.03),_transparent_50%)] pointer-events-none" />
        <div className="w-full max-w-xl bg-[#121212]/90 backdrop-blur-2xl border border-red-500/20 rounded-[2rem] p-8 shadow-2xl space-y-6 text-white">
          <div className="flex items-center gap-4 border-b border-white/5 pb-4">
            <div className="w-12 h-12 rounded-xl bg-red-500/10 border border-red-500/20 flex items-center justify-center text-red-500">
              <ShieldAlert className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-lg font-black tracking-tighter uppercase text-white">Falha Diagnóstica de Inicialização</h1>
              <p className="text-[9px] text-white/40 font-mono uppercase tracking-widest">Proteção Ativa contra Travamento de Tela</p>
            </div>
          </div>

          <div className="space-y-4">
            <p className="text-xs text-white/70 leading-relaxed">
              O sistema detectou um travamento ou lentidão excessiva ao tentar carregar o banco de dados local ou serviços essenciais. Para evitar uma tela infinita silenciosa, a inicialização foi interrompida defensivamente.
            </p>

            <div className="bg-[#181818] rounded-xl border border-white/5 p-4 font-mono text-[10px] text-white/80 space-y-2 overflow-x-auto max-h-[300px] whitespace-pre-wrap select-text">
              {bootSummary || bootError}
            </div>
          </div>

          <div className="flex flex-col sm:flex-row gap-3 pt-4 border-t border-white/5 font-mono text-[10px] font-bold">
            <button
              id="btn-retry-boot"
              onClick={() => {
                setBootError(null);
                setBootSummary(null);
                localStorage.removeItem('print_queue_execution_lock_time');
                sessionStorage.removeItem('print_queue_execution_lock_active');
                window.location.reload();
              }}
              className="flex-1 py-3 px-4 bg-emerald-500 text-black hover:bg-emerald-400 active:scale-[0.98] transition-transform rounded-xl text-center uppercase cursor-pointer"
            >
              Tentar Novamente (Normal)
            </button>
            <button
              id="btn-force-queue-reset"
              onClick={async () => {
                setBootError(null);
                setBootSummary(null);
                try {
                  localStorage.removeItem('print_queue_execution_lock_time');
                  sessionStorage.removeItem('print_queue_execution_lock_active');
                } catch (e) {}
                window.location.reload();
              }}
              className="flex-1 py-3 px-4 bg-amber-500/10 border border-amber-500/20 text-amber-400 hover:bg-amber-500/20 active:scale-[0.98] transition-transform rounded-xl text-center uppercase cursor-pointer"
            >
              Destravar Fila Impressora
            </button>
            <button
              id="btn-bypass-boot"
              onClick={() => {
                setBootError(null);
                setBootSummary(null);
                useStore.getState().setHasHydrated(true);
              }}
              className="flex-1 py-3 px-4 bg-white/5 hover:bg-white/10 active:scale-[0.98] transition-transform rounded-xl text-center uppercase text-white/80 cursor-pointer"
            >
              Ignorar e Forçar Entrada
            </button>
          </div>
        </div>
      </div>
    );
  }

  const isPublicCatalog = location.pathname.startsWith('/vitrine') || location.pathname.startsWith('/catalogo-publico');
  if (isPublicCatalog) {
    return <PublicCatalogPage />;
  }

  const isKiosk = location.pathname === '/pdv-totem/kiosk' || window.location.hash.includes('/kiosk') || window.location.pathname.includes('/kiosk');
  if (isKiosk) {
    return (
      <div className="flex flex-col h-screen bg-[#070707] text-slate-300 overflow-hidden font-sans relative w-full">
        <Suspense fallback={<LoadingModule />}>
          <Routes>
            <Route path="/pdv-totem/kiosk" element={<PdvTotemModule />} />
            <Route path="*" element={<Navigate to="/pdv-totem/kiosk" replace />} />
          </Routes>
        </Suspense>
      </div>
    );
  }

  const isCustomerDisplay = location.pathname === '/pdv/customer-display' || window.location.hash.includes('/pdv/customer-display') || window.location.pathname.includes('/pdv/customer-display');
  if (isCustomerDisplay) {
    return (
      <div className="flex flex-col h-screen bg-[#070707] text-slate-300 overflow-hidden font-sans relative w-full">
        <Suspense fallback={<LoadingModule />}>
          <Routes>
            <Route path="/pdv/customer-display" element={<PdvCustomerDisplay />} />
            <Route path="*" element={<Navigate to="/pdv/customer-display" replace />} />
          </Routes>
        </Suspense>
      </div>
    );
  }

  const isEmProducaoTv = location.pathname === '/em-producao-tv' || window.location.hash.includes('/em-producao-tv') || window.location.pathname.includes('/em-producao-tv');
  if (isEmProducaoTv) {
    return (
      <div className="flex flex-col h-screen bg-[#070707] text-slate-300 overflow-hidden font-sans relative w-full border-none">
        <Suspense fallback={<LoadingModule />}>
          <Routes>
            <Route path="/em-producao-tv" element={<EmProducaoTv />} />
            <Route path="*" element={<Navigate to="/em-producao-tv" replace />} />
          </Routes>
        </Suspense>
      </div>
    );
  }

  if (!hasHydrated) {
    return (
      <div className="min-h-screen bg-[#0A0A0A] flex flex-col items-center justify-center space-y-6 select-none relative px-4">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_50%,_rgba(16,185,129,0.02),_transparent_50%)] pointer-events-none" />
        <div className="w-8 h-8 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
        <p className="text-[10px] text-white/30 font-black tracking-[0.3em] uppercase">Sincronizando Banco Local...</p>
        
        {showResilienceNotice && (
          <motion.div 
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="w-full max-w-sm bg-[#121212]/90 border border-amber-500/10 p-5 rounded-2xl flex flex-col items-center text-center space-y-4 shadow-xl z-20"
          >
            <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider leading-relaxed">
              O banco local está demorando para responder.
            </p>
            <div className="flex gap-2 w-full">
              <button
                onClick={() => window.location.reload()}
                className="flex-1 py-2.5 bg-emerald-500 hover:bg-emerald-400 text-black text-[9px] font-black uppercase rounded-lg transition-all cursor-pointer font-sans"
              >
                Recarregar
              </button>
              <button
                onClick={() => useStore.getState().setHasHydrated(true)}
                className="flex-1 py-2.5 bg-white/5 hover:bg-white/10 text-white text-[9px] font-black uppercase rounded-lg border border-white/5 transition-all cursor-pointer font-sans"
              >
                Ignorar e Entrar
              </button>
            </div>
          </motion.div>
        )}
      </div>
    );
  }

  const isWelcomeActive = showWelcome || (isAuth && pendingWelcome);
  const currentWelcomeUser = currentUser || welcomeUser;

  if (!isAuth) {
    return (
      <AnimatePresence mode="wait">
        <motion.div
          key="login"
          initial={{ opacity: 1 }}
          exit={{ opacity: 0, scale: 0.95, filter: "blur(10px)" }}
          transition={{ duration: 0.35, ease: "easeOut" }}
          className="w-full"
        >
          <Login />
        </motion.div>
      </AnimatePresence>
    );
  }

  const isDefaultAdminWithDefaultPassword = isAuth && 
    (currentUser?.id === 'admin' || currentUser?.login === 'admin') && 
    currentUser?.password === '1234';

  if (isDefaultAdminWithDefaultPassword) {
    return <ForcedPasswordResetScreen />;
  }

  if (isWelcomeActive && currentWelcomeUser) {
    return (
      <AnimatePresence mode="wait">
        <motion.div 
          key="welcome"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.3 }}
          className="fixed inset-0 z-[99999] bg-[#0A0A0A] flex items-center justify-center p-4 overflow-hidden select-none"
        >
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_50%,_rgba(16,185,129,0.06),_transparent_45%)] pointer-events-none" />
          
          <motion.div 
            initial={{ opacity: 0, scale: 0.85 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.85 }}
            transition={{ type: "spring", damping: 20, stiffness: 100 }}
            className="w-full max-w-md relative z-10"
          >
            <div className="bg-[#121212]/85 backdrop-blur-3xl border border-white/10 rounded-[2.5rem] p-10 shadow-[0_0_50px_rgba(0,0,0,0.8)] text-center flex flex-col items-center justify-center space-y-6">
              <motion.div 
                initial={{ scale: 0, rotate: -180 }}
                animate={{ scale: 1, rotate: 0 }}
                transition={{ type: "spring", damping: 15, stiffness: 150, delay: 0.15 }}
                className="w-20 h-20 bg-emerald-500 rounded-[2rem] flex items-center justify-center text-black shadow-[0_0_50px_rgba(16,185,129,0.4)]"
              >
                <CheckCircle2 className="w-10 h-10 stroke-[2.5]" />
              </motion.div>
              
              <div className="space-y-2">
                <motion.p 
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.25 }}
                  className="text-[10px] text-emerald-500 font-black tracking-[0.3em] uppercase"
                >
                  Acesso autorizado com sucesso
                </motion.p>
                
                <motion.h2 
                  initial={{ opacity: 0, y: 15 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.35 }}
                  className="text-2xl md:text-3xl font-black text-white uppercase tracking-tight"
                >
                  Bem-vindo, <br />
                  <span className="text-emerald-400 font-sans tracking-wide">
                    {currentWelcomeUser.fullName || currentWelcomeUser.login}
                  </span>
                </motion.h2>
              </div>
              
              <motion.div 
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.55 }}
                className="w-full h-1 bg-white/5 rounded-full overflow-hidden"
              >
                <motion.div 
                  initial={{ x: "-100%" }}
                  animate={{ x: "0%" }}
                  transition={{ duration: 1.5, ease: "easeInOut" }}
                  className="h-full bg-emerald-500 rounded-full"
                />
              </motion.div>

              {/* Accessible skip option to avoid any possible blockages */}
              <motion.button 
                initial={{ opacity: 0 }}
                animate={{ opacity: 0.4 }}
                whileHover={{ opacity: 0.9, scale: 1.05 }}
                onClick={() => {
                  setShowWelcome(false);
                  useStore.getState().setPendingWelcome(false);
                }}
                className="text-[9px] font-black text-white/50 bg-white/5 hover:bg-white/10 hover:text-white px-4 py-2 rounded-xl transition-all uppercase tracking-widest font-mono cursor-pointer"
              >
                Pular Introdução
              </motion.button>
            </div>
          </motion.div>
        </motion.div>
      </AnimatePresence>
    );
  }

  if (isCheckingInitialRoute) {
    return (
      <div className="min-h-screen bg-[#0A0A0A] flex flex-col items-center justify-center space-y-4 select-none">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_50%,_rgba(16,185,129,0.02),_transparent_50%)] pointer-events-none" />
        <div className="w-8 h-8 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
        <p className="text-[10px] text-white/30 font-black tracking-[0.3em] uppercase">Carregando...</p>
      </div>
    );
  }

  return (
    <>
      <AppLayout />
    </>
  );
}

export default function App() {
  return (
    <Router>
      <Main />
    </Router>
  );
}
