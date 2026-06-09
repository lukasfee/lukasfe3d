import React, { useState, useEffect, useMemo, useRef } from 'react';
import { 
  Tablet, 
  Monitor, 
  RotateCw, 
  Power, 
  AlertTriangle, 
  CheckCircle2, 
  DollarSign, 
  Clock, 
  ArrowUpRight, 
  Play, 
  Trash2, 
  RefreshCw,
  Search,
  Image,
  Eye,
  EyeOff,
  Check,
  Smartphone,
  Lock,
  ShieldAlert,
  Ban
} from 'lucide-react';
import { useStore, Sale } from '../store';
import { isDesktop } from '../lib/environment';

export default function PdvTotemAdmin() {
  const currentUser = useStore((state) => state.currentUser);
  const checkPermission = useStore((state) => state.checkPermission);

  const sales = useStore((state) => state.sales);
  const currentCashier = useStore((state) => state.currentCashier);
  const products = useStore((state) => state.products);
  const updateSaleStatus = useStore((state) => state.updateSaleStatus);
  const updateProduct = useStore((state) => state.updateProduct);
  const addSale = useStore((state) => state.addSale);
  const company = useStore((state) => state.company);
  const paymentMethods = useStore((state) => state.paymentMethods);

  const canConfigure = checkPermission('PDV Totem', 'configurar');
  const canAcessar = checkPermission('PDV Totem', 'acessar');

  const hasPixKey = useMemo(() => {
    const pixMethod = paymentMethods.find(m => m.type === 'pix');
    const methodPixKey = pixMethod?.pixKey;
    const companyPixKey = company?.pixKey;
    return !!(methodPixKey || companyPixKey);
  }, [paymentMethods, company]);

  const [terminalsState, setTerminalsState] = useState<Record<number, {
    isOnline: boolean;
    currentStep: string;
    cartCount: number;
    paymentStatus: string;
    isLocked: boolean;
    isFullscreen: boolean;
  }>>({
    1: { isOnline: false, currentStep: 'start', cartCount: 0, paymentStatus: 'idle', isLocked: false, isFullscreen: false },
    2: { isOnline: false, currentStep: 'start', cartCount: 0, paymentStatus: 'idle', isLocked: false, isFullscreen: false },
    3: { isOnline: false, currentStep: 'start', cartCount: 0, paymentStatus: 'idle', isLocked: false, isFullscreen: false },
  });
  const [lastActionStatus, setLastActionStatus] = useState<string | null>(null);

  // Independent Multi-Terminal State Engine
  const [waitingRequests, setWaitingRequests] = useState<Record<number, any>>({});
  const [openWindows, setOpenWindows] = useState<Record<number, boolean>>({});
  const [cashReceivedMap, setCashReceivedMap] = useState<Record<number, string>>({});
  const [processedIds, setProcessedIds] = useState<string[]>([]);
  const [totemDestinations, setTotemDestinations] = useState<Record<number, 'gestao-pedidos' | 'em-producao'>>({});

  // Screen / Monitor positioning manager
  const [monitorSelectTerminalId, setMonitorSelectTerminalId] = useState<number | null>(null);
  const [availableScreens, setAvailableScreens] = useState<any[]>([]);
  const [showScreenFallbackPrompt, setShowScreenFallbackPrompt] = useState(false);
  const [electronKioskOpen, setElectronKioskOpen] = useState(false);
  const [electronIsFullscreen, setElectronIsFullscreen] = useState(false);
  const [kioskWindow, setKioskWindow] = useState<Window | null>(null);
  const [isTotemSecondScreenLocked, setIsTotemSecondScreenLocked] = useState(false);

  const handleToggleSecondScreenLock = () => {
    setIsTotemSecondScreenLocked(prev => !prev);
  };

  const lastHeartbeatsRef = useRef<Record<number, number>>({ 1: 0, 2: 0, 3: 0 });
  const kioskWindowsRef = useRef<Record<number, Window | null>>({});
  const lastScreenCountRef = useRef<number | null>(null);

  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      const isAnyPopUpActive = Object.values(kioskWindowsRef.current).some(win => win && !(win as Window).closed);
      if (isAnyPopUpActive) {
        const warningText = 'Existem terminais do Totem ativos. Por favor, feche as telas secundárias primeiro.';
        e.preventDefault();
        e.returnValue = warningText;
        return warningText;
      }
    };

    const handleUnload = () => {
      Object.keys(kioskWindowsRef.current).forEach(id => {
        const win = kioskWindowsRef.current[Number(id)];
        if (win && !win.closed) {
          win.close();
        }
      });
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    window.addEventListener('unload', handleUnload);

    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
      window.removeEventListener('unload', handleUnload);
    };
  }, []);

  // Sync open windows state periodically (every 500ms) to ensure exact local and external state tracking
  useEffect(() => {
    const timer = setInterval(() => {
      setOpenWindows(prev => {
        let changed = false;
        const next = { ...prev };
        [1, 2, 3].forEach(id => {
          const win = kioskWindowsRef.current[id];
          const isOpen = !!(win && !win.closed);
          if (next[id] !== isOpen) {
            next[id] = isOpen;
            changed = true;
          }
        });
        return changed ? next : prev;
      });
    }, 500);
    return () => clearInterval(timer);
  }, []);

  const [searchTerm, setSearchTerm] = useState('');

  const toggleTotemProduct = (productId: string, nextValue: boolean) => {
    if (!canConfigure) {
      alert("Permissão Insuficiente: Apenas administradores do Totem podem configurar os produtos do catálogo.");
      return;
    }
    updateProduct(productId, { totemHabilitado: nextValue }, 'Totem Operator');
    // Fast broadcast sync-state to keep Kiosk instantaneously up-to-date
    safePostMessage({
      type: 'sync-state',
      payload: {
        currentCashier: useStore.getState().currentCashier,
        products: useStore.getState().products.map(p => p.id === productId ? { ...p, totemHabilitado: nextValue } : p)
      }
    });
  };

  const filteredProducts = useMemo(() => {
    return products.filter(p => 
      !p.deleted && 
      p.active !== false &&
      (p.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
       p.category.toLowerCase().includes(searchTerm.toLowerCase()) ||
       (p.code && p.code.toLowerCase().includes(searchTerm.toLowerCase())))
    );
  }, [products, searchTerm]);

  // Poll kiosk status in Electron
  useEffect(() => {
    if (isDesktop()) {
      const checkStatus = () => {
        const bridge = (window as any).electron;
        if (bridge?.getKioskStatus) {
          bridge.getKioskStatus().then((status: any) => {
            setElectronKioskOpen(status.isOpen);
            setElectronIsFullscreen(status.isKiosk || status.isFullscreen);
          }).catch((e: any) => console.error('Error getting kiosk status:', e));
        }

        const totemBridge = (window as any).electronAPI?.totem || (window as any).electron?.totem;
        if (totemBridge?.getSecondScreenLockState) {
          totemBridge.getSecondScreenLockState().then((locked: boolean) => {
            setIsTotemSecondScreenLocked(locked);
          }).catch((e: any) => console.error('Error getting lock state:', e));
        }

        // Rule 7: Monitor screen connections / disconnections
        if (bridge?.getConnectedScreens) {
          bridge.getConnectedScreens().then((screens: any[] | null) => {
            const detectedScreens = screens || [];
            const currentCount = detectedScreens.length;

            if (lastScreenCountRef.current !== null && currentCount < lastScreenCountRef.current) {
              const secondaryScreens = detectedScreens.filter((s: any) => !s.isPrimary);
              const allowedSecondaryCount = secondaryScreens.length;

              alert(`ATENÇÃO OPERADOR:\n\nUm monitor secundário foi desconectado (Telas: ${lastScreenCountRef.current} -> ${currentCount}).\n\nFechando terminais excedentes por segurança para evitar telas fantasmas.`);

              // Close exceeding active terminals directly to ensure safety
              [1, 2, 3].forEach(id => {
                if (id > allowedSecondaryCount && kioskWindowsRef.current[id] && !kioskWindowsRef.current[id]?.closed) {
                  try {
                    kioskWindowsRef.current[id]?.close();
                    kioskWindowsRef.current[id] = null;
                  } catch (err) {
                    console.error(`Error closing terminal ${id} on disconnection:`, err);
                  }
                  setOpenWindows(prev => ({ ...prev, [id]: false }));
                }
              });
            }
            lastScreenCountRef.current = currentCount;
          }).catch((e: any) => console.error('Error retrieving connected screens in loop:', e));
        }
      };
      
      checkStatus();
      const interval = setInterval(checkStatus, 2000);
      return () => clearInterval(interval);
    }
  }, []);

  // BroadcastChannel for cross-window operator control & telemetry pings
  const channelRef = useRef<BroadcastChannel | null>(null);

  const safePostMessage = (msg: any) => {
    try {
      if (channelRef.current) {
        channelRef.current.postMessage(msg);
      }
    } catch (e) {
      console.warn('BroadcastChannel error or channel closed:', e);
    }
  };

  const handleOpenTerminalDirect = (id: number, leftOffset?: number, targetWidth: number = 1024, targetHeight: number = 768) => {
    const currentLoc = window.location.href.split('#')[0];
    const url = currentLoc + `#/pdv-totem/kiosk?terminal=${id}`;
    let features = `width=${targetWidth},height=${targetHeight},menubar=no,status=no,toolbar=no,resizable=yes`;
    if (leftOffset !== undefined) {
      features += `,left=${leftOffset},top=0`;
    }
    const win = window.open(url, `pdv-totem-kiosk-token-${id}`, features);
    if (win) {
      win.focus();
      kioskWindowsRef.current[id] = win;
      setOpenWindows(prev => ({ ...prev, [id]: true }));
      setLastActionStatus(`Terminal ${id} aberto em nova janela.`);
      setTimeout(() => setLastActionStatus(null), 3000);
    } else {
      alert(`O bloqueador de pop-ups bloqueou o Terminal ${id}. Por favor, autorize pop-ups nesta página.`);
    }
  };

  const handleOpenTerminal = async (id: number) => {
    // Rule 5: If the terminal is already open, do not open a duplicate
    if (kioskWindowsRef.current[id] && !kioskWindowsRef.current[id]?.closed) {
      alert(`O Terminal 0${id} já está aberto.`);
      return;
    }

    let screens: any[] = [];

    // Rule 9: In standard Web environment without Electron, do not attempt to detect multiple real monitors
    if (!isDesktop()) {
      alert(`AMBIENTE WEB (MODO LIMITADO):\n\nDetecção de múltiplos monitores físicos está disponível apenas no aplicativo Desktop/Electron.\n\nO Terminal 0${id} será aberto na tela principal como uma janela secundária.`);
      handleOpenTerminalDirect(id);
      return;
    }

    // 10. Native desktop display retrieval
    const bridge = (window as any).electron;
    if (bridge?.getConnectedScreens) {
      try {
        screens = await bridge.getConnectedScreens() || [];
      } catch (err) {
        console.warn('Failed to retrieve native connected screens:', err);
      }
    }

    // Fallback if no screens returned, treat current window screen as primary
    if (screens.length === 0) {
      screens = [{ isPrimary: true, left: 0, top: 0, width: window.screen?.width || 1920, height: window.screen?.height || 1080 }];
    }

    const totalScreens = screens.length;
    const secondaryScreens = screens.filter(s => !s.isPrimary);
    const availableTerminalsCount = secondaryScreens.length; // S = screens.length - 1

    // Rule 2 / Rule 1: No secondary screen available or only 1 screen total connected. Show required alert and block.
    if (totalScreens <= 1 || availableTerminalsCount === 0) {
      alert("Nenhuma tela secundária detectada para abrir o terminal Totem.");
      return;
    }

    // Rule 6: Block if terminal index exceeds available secondary displays count
    if (id > availableTerminalsCount) {
      alert(`Apenas ${availableTerminalsCount} tela(s) secundária(s) detectada(s).\n\nNão é possível abrir o Terminal 0${id} porque não há telas secundárias suficientes conectadas.`);
      return;
    }

    // Rule 4: Map terminal 1-to-1 to its corresponding unique physical secondary screen index
    const targetScreen = secondaryScreens[id - 1];
    if (targetScreen) {
      handleOpenTerminalDirect(id, targetScreen.left || 0, targetScreen.width || 1024, targetScreen.height || 768);
    } else {
      alert("Erro ao mapear tela secundária correspondente para este terminal.");
    }
  };

  const handleCloseTerminal = (id: number) => {
    const win = kioskWindowsRef.current[id];
    if (win && !win.closed) {
      win.close();
      kioskWindowsRef.current[id] = null;
    }
    setOpenWindows(prev => ({ ...prev, [id]: false }));
    safePostMessage({
      type: 'close-kiosk',
      payload: { terminalId: id }
    });
    setLastActionStatus(`Terminal ${id}: Fechar enviado.`);
    setTimeout(() => setLastActionStatus(null), 3000);
  };

  const handleReloadTerminal = (id: number) => {
    safePostMessage({
      type: 'reload-kiosk',
      payload: { terminalId: id }
    });
    setLastActionStatus(`Terminal ${id}: Reiniciar enviado.`);
    setTimeout(() => setLastActionStatus(null), 3000);
  };

  const handleResetTerminal = (id: number) => {
    safePostMessage({
      type: 'reset-kiosk',
      payload: { terminalId: id }
    });
    setLastActionStatus(`Terminal ${id}: Limpar sessão enviado.`);
    setTimeout(() => setLastActionStatus(null), 3000);
  };

  const handleOpenControlTerminal = (id: number) => {
    const currentLoc = window.location.href.split('#')[0];
    const url = currentLoc + `#/pdv-totem/kiosk?terminal=${id}&control=true`;
    const win = window.open(url, `pdv-totem-control-${id}`, 'width=1024,height=768,menubar=yes,status=no,toolbar=no,resizable=yes');
    if (win) {
      win.focus();
      setLastActionStatus(`Controle Assistido do Terminal ${id} aberto.`);
      setTimeout(() => setLastActionStatus(null), 3000);
    } else {
      alert(`O bloqueador de pop-ups bloqueou o controle do Terminal ${id}.`);
    }
  };

  const handleToggleFullscreenTerminal = (id: number) => {
    if (!openWindows[id] && !terminalsState[id].isOnline) {
      alert("Abra a tela do terminal antes de ativar o modo quiosque.");
      return;
    }

    if (!isDesktop()) {
      alert("Modo Quiosque real está disponível apenas no Desktop/Electron. No navegador, o modo tela cheia pode depender de interação local.");
    }

    setTerminalsState(prev => {
      const nextFullscreen = !prev[id].isFullscreen;
      safePostMessage({
        type: 'totem-fullscreen-changed',
        payload: { terminalId: id, isFullscreen: nextFullscreen }
      });
      return {
        ...prev,
        [id]: { ...prev[id], isFullscreen: nextFullscreen }
      };
    });
    setLastActionStatus(`Terminal ${id}: Modo tela cheia alterado.`);
    setTimeout(() => setLastActionStatus(null), 3000);
  };

  useEffect(() => {
    let active = true;
    const channel = new BroadcastChannel('pdv-totem-channel');
    channelRef.current = channel;

    const heartbeatCheck = setInterval(() => {
      if (!active) return;
      setTerminalsState(prev => {
        const next = { ...prev };
        let changed = false;
        [1, 2, 3].forEach(id => {
          const lastTime = lastHeartbeatsRef.current[id as 1 | 2 | 3] || 0;
          const isOnline = Date.now() - lastTime <= 4000;
          if (next[id as 1 | 2 | 3].isOnline !== isOnline) {
            next[id as 1 | 2 | 3] = {
              ...next[id as 1 | 2 | 3],
              isOnline: isOnline
            };
            changed = true;
          }
        });
        return changed ? next : prev;
      });
    }, 1000);

    // Regularly broadcast current cashier and product changes to keep Kiosk in perfect sync
    const syncStateInterval = setInterval(() => {
      if (!active) return;
      safePostMessage({
        type: 'sync-state',
        payload: {
          currentCashier: useStore.getState().currentCashier,
          products: useStore.getState().products
        }
      });
    }, 1500);

    channel.onmessage = (event) => {
      if (!active) return;
      const { type, payload } = event.data;
      if (type === 'kiosk-heartbeat') {
        const tId = payload?.terminalId;
        if (tId && (tId === 1 || tId === 2 || tId === 3)) {
          lastHeartbeatsRef.current[tId] = Date.now();
          setTerminalsState(prev => {
            const current = prev[tId];
            if (
              !current.isOnline ||
              current.currentStep !== payload.currentStep ||
              current.cartCount !== payload.cartCount ||
              current.paymentStatus !== payload.paymentStatus
            ) {
              return {
                ...prev,
                [tId]: {
                  ...current,
                  isOnline: true,
                  currentStep: payload.currentStep,
                  cartCount: payload.cartCount,
                  paymentStatus: payload.paymentStatus || 'idle'
                }
              };
            }
            return prev;
          });
        }
      } else if (type === 'totem-pix-waiting') {
        const enriched = { ...payload, paymentType: 'pix' };
        const tId = payload?.terminalId || 1;
        setWaitingRequests(prev => ({ ...prev, [tId]: enriched }));
      } else if (type === 'totem-cash-waiting') {
        const enriched = { ...payload, paymentType: 'money' };
        const tId = payload?.terminalId || 1;
        setWaitingRequests(prev => ({ ...prev, [tId]: enriched }));
        setCashReceivedMap(prev => ({ ...prev, [tId]: '' }));
      } else if (type === 'totem-card-waiting') {
        const enriched = { ...payload, paymentType: 'card' };
        const tId = payload?.terminalId || 1;
        setWaitingRequests(prev => ({ ...prev, [tId]: enriched }));
      } else if (type === 'totem-pix-cancelled' || type === 'totem-payment-cancelled' || type === 'totem-payment-refused' || type === 'totem-pix-refused') {
        const tId = payload?.terminalId;
        if (tId) {
          setWaitingRequests(prev => {
            const next = { ...prev };
            delete next[tId];
            return next;
          });
        }
      } else if (type === 'totem-payment-approved' || type === 'totem-pix-approved') {
        const tId = payload?.terminalId;
        if (tId) {
          setWaitingRequests(prev => {
            const next = { ...prev };
            delete next[tId];
            return next;
          });
        }
      } else if (type === 'request-sync') {
        safePostMessage({
          type: 'sync-state',
          payload: {
            currentCashier: useStore.getState().currentCashier,
            products: useStore.getState().products
          }
        });
      }
    };

    return () => {
      active = false;
      clearInterval(heartbeatCheck);
      clearInterval(syncStateInterval);
      channelRef.current = null;
      try {
        channel.close();
      } catch (err) {
        console.error('Error closing channel:', err);
      }
    };
  }, []);

  // Totem Sales Calculation
  const totemSalesToday = useMemo(() => {
    const todayStr = new Date().toDateString();
    return sales.filter(s => {
      const isTotem = s.sellerLogin === 'totem-terminal' || s.sellerName === 'Terminal Autoatendimento';
      const isToday = new Date(s.timestamp).toDateString() === todayStr;
      return isTotem && isToday;
    });
  }, [sales]);

  const totalTotemSalesValue = useMemo(() => {
    return totemSalesToday
      .filter(s => s.status !== 'cancelado')
      .reduce((acc, s) => acc + s.total, 0);
  }, [totemSalesToday]);

  const pendingTotemSales = useMemo(() => {
    return totemSalesToday.filter(s => s.status === 'aguardando_separacao');
  }, [totemSalesToday]);

  const finishedTotemSales = useMemo(() => {
    return totemSalesToday.filter(s => s.status !== 'aguardando_separacao');
  }, [totemSalesToday]);

  // Action helpers and triggers
  const triggerAction = (terminalId: number, type: string, description: string) => {
    safePostMessage({
      type,
      payload: { terminalId }
    });
    setLastActionStatus(description);
    setTimeout(() => setLastActionStatus(null), 3000);
  };

  const handleApprovePayment = (idNum: number, amountReceived?: number, change?: number) => {
    const req = waitingRequests[idNum];
    if (!req) return;
    if (processedIds.includes(req.id)) return;
    setProcessedIds(prev => [...prev, req.id]);

    try {
      const salePayloadCopy = { ...req.salePayload };
      if (req.paymentType === 'money' && amountReceived !== undefined) {
        salePayloadCopy.receivedAmount = amountReceived;
        salePayloadCopy.change = change || 0;
      }

      // Link the logged-in administrator/operator to the sale
      if (currentUser) {
        salePayloadCopy.sellerId = currentUser.id;
        salePayloadCopy.sellerName = currentUser.fullName;
        salePayloadCopy.sellerLogin = currentUser.login;
      }

      // Link production order destination set by operator
      const orderDest = totemDestinations[idNum] || 'gestao-pedidos';
      salePayloadCopy.status = orderDest === 'em-producao' ? 'em_producao' : 'aguardando_separacao';
      if (orderDest === 'em-producao') {
        salePayloadCopy.productionStatus = 'em_fila';
        salePayloadCopy.productionPriority = 'media';
      }
      salePayloadCopy.origin = 'Totem';

      const createdOrder = addSale(salePayloadCopy);
      if (createdOrder) {
        // Post both generic and specific success signals WITH terminalId
        safePostMessage({
          type: 'totem-payment-approved',
          payload: { terminalId: idNum, id: req.id, sale: createdOrder }
        });
        safePostMessage({
          type: 'totem-pix-approved',
          payload: { terminalId: idNum, id: req.id, sale: createdOrder }
        });

        // Clean up independent states to prevent stuck screens
        setWaitingRequests(prev => {
          const next = { ...prev };
          delete next[idNum];
          return next;
        });
        setCashReceivedMap(prev => {
          const next = { ...prev };
          delete next[idNum];
          return next;
        });
        setLastActionStatus(`Terminal 0${idNum}: Pagamento aprovado e registrado! Pedido #${createdOrder.orderNumber}`);
        setTimeout(() => setLastActionStatus(null), 4000);
      } else {
        alert('Erro ao registrar a venda no ERP. Tente novamente.');
        setProcessedIds(prev => prev.filter(id => id !== req.id));
      }
    } catch (err: any) {
      alert('Erro ao registrar a venda: ' + (err?.message || err));
      setProcessedIds(prev => prev.filter(id => id !== req.id));
    }
  };

  const handleRefusePayment = (idNum: number) => {
    const req = waitingRequests[idNum];
    if (!req) return;
    if (processedIds.includes(req.id)) return;
    setProcessedIds(prev => [...prev, req.id]);

    safePostMessage({
      type: 'totem-payment-refused',
      payload: { terminalId: idNum, id: req.id }
    });
    safePostMessage({
      type: 'totem-pix-refused',
      payload: { terminalId: idNum, id: req.id }
    });

    setWaitingRequests(prev => {
      const next = { ...prev };
      delete next[idNum];
      return next;
    });
    setCashReceivedMap(prev => {
      const next = { ...prev };
      delete next[idNum];
      return next;
    });
    setLastActionStatus(`Terminal 0${idNum}: Pagamento cancelado ou recusado.`);
    setTimeout(() => setLastActionStatus(null), 4000);
  };

  const handleOpenKiosk = async () => {
    if (isDesktop() && (window as any).electron?.openKioskWindow) {
      try {
        const res = await (window as any).electron.openKioskWindow();
        if (res.success) {
          setElectronKioskOpen(true);
          if (res.secondScreen) {
            setLastActionStatus('Totem aberto no monitor secundário.');
          } else {
            setLastActionStatus('Nenhuma segunda tela detectada. O Totem foi aberto na tela principal.');
          }
          setTimeout(() => setLastActionStatus(null), 5000);
        }
      } catch (err) {
        console.error('Error opening Electron kiosk window:', err);
      }
    } else {
      // Safe fallback on Web - avoids double slashes or protocol-relative URI issues
      const currentLoc = window.location.href.split('#')[0];
      const url = currentLoc + '#/pdv-totem/kiosk';
      const win = window.open(url, 'pdv-totem-kiosk-window', 'width=1024,height=768,menubar=no,status=no,toolbar=no,resizable=yes');
      if (win) {
        win.focus();
        setKioskWindow(win);
        setLastActionStatus('Kiosk aberto em nova janela. (Aviso: Abertura automática em segunda tela só funciona na versão Desktop)');
        setTimeout(() => setLastActionStatus(null), 6000);
      } else {
        alert('O bloqueador de pop-ups bloqueou o Kiosk. Por favor, autorize pop-ups nesta página.');
      }
    }
  };

  const handleOpenTotemControl = async () => {
    if (isDesktop() && (window as any).electron?.openTotemControlWindow) {
      try {
        const res = await (window as any).electron.openTotemControlWindow();
        if (res.success) {
          setLastActionStatus('Painel de Controle Assistido iniciado.');
          setTimeout(() => setLastActionStatus(null), 3000);
        }
      } catch (err) {
        console.error('Error opening Electron totem control window:', err);
      }
    } else {
      // Safe fallback on Web
      const currentLoc = window.location.href.split('#')[0];
      const url = currentLoc + '#/pdv-totem/kiosk?control=true';
      const win = window.open(url, 'pdv-totem-control-window', 'width=1024,height=768,menubar=yes,status=no,toolbar=no,resizable=yes');
      if (win) {
        win.focus();
        setLastActionStatus('Controle Assistido aberto em nova janela.');
        setTimeout(() => setLastActionStatus(null), 3000);
      } else {
        alert('O bloqueador de pop-ups bloqueou o controle. Por favor, autorize pop-ups nesta página.');
      }
    }
  };

  const handleCloseElectronKiosk = async () => {
    if (isDesktop() && (window as any).electron?.closeKioskWindow) {
      try {
        await (window as any).electron.closeKioskWindow();
        setElectronKioskOpen(false);
        setElectronIsFullscreen(false);
        setLastActionStatus('Totem fechado com sucesso.');
        setTimeout(() => setLastActionStatus(null), 3000);
      } catch (err) {
        console.error('Error closing Electron kiosk window:', err);
      }
    } else {
      // In web, close local child popup
      if (kioskWindow && !kioskWindow.closed) {
        kioskWindow.close();
        setKioskWindow(null);
      }
      triggerAction(1, 'close-kiosk', 'Remoto: Fechar Kiosk enviado.');
    }
  };

  const handleReloadElectronKiosk = async () => {
    if (isDesktop() && (window as any).electron?.reloadKioskWindow) {
      try {
        await (window as any).electron.reloadKioskWindow();
        setLastActionStatus('Totem recarregado.');
        setTimeout(() => setLastActionStatus(null), 3000);
      } catch (err) {
        console.error('Error reloading Electron kiosk window:', err);
      }
    } else {
      triggerAction(1, 'reload-kiosk', 'Remoto: Recarregar Kiosk enviado.');
    }
  };

  const handleToggleElectronFullscreen = async () => {
    if (isDesktop() && (window as any).electron?.toggleKioskFullscreen) {
      try {
        const res = await (window as any).electron.toggleKioskFullscreen();
        if (res.success) {
          setElectronIsFullscreen(res.isKiosk);
          setLastActionStatus(res.isKiosk ? 'Fullscreen ativado (Kiosk travado).' : 'Fullscreen desativado (Modo janela).');
          setTimeout(() => setLastActionStatus(null), 3000);
        }
      } catch (err) {
        console.error('Error toggling Electron fullscreen:', err);
      }
    }
  };

  const stepLabels: Record<string, string> = {
    start: 'Boas-vindas',
    customer: 'Identificação do Cliente',
    products: 'Catálogo de Produtos',
    cart: 'Carrinho de Compras',
    payment: 'Aguardando Pagamento',
    success: 'Sucesso (Pedido Gerado)'
  };



  if (!canAcessar) {
    return (
      <div className="flex-1 bg-[#090909] p-6 text-zinc-300 font-sans min-h-[calc(100vh-3.5rem)] flex flex-col justify-center items-center text-center">
        <div className="max-w-md bg-[#121212] border border-white/5 rounded-3xl p-8 space-y-4 shadow-2xl">
          <Ban className="w-12 h-12 text-red-500 mx-auto animate-pulse" />
          <h1 className="text-sm font-black text-white uppercase tracking-wider font-mono">Acesso Negado</h1>
          <p className="text-[11px] text-zinc-400 uppercase leading-relaxed">
            Seu perfil operacional ({currentUser ? (useStore.getState().userRoles.find(r => r.id === currentUser.roleId)?.name || 'Colaborador') : 'Colaborador'}) não possui permissão para acessar o Painel de Controle do Totem.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 bg-[#090909] p-6 text-zinc-300 font-sans min-h-[calc(100vh-3.5rem)] overflow-y-auto w-full max-w-7xl mx-auto space-y-6">
      
      {/* Title Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-white/5 pb-6">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <Tablet className="w-5 h-5 text-emerald-500 animate-pulse" />
            <h1 className="text-xl font-black text-white uppercase tracking-wider font-mono">Painel Multi-Terminais Totem</h1>
          </div>
          <p className="text-[10px] text-zinc-500 uppercase tracking-widest leading-none">Monitoramento e Controle Remoto de Autoatendimento Independente</p>
        </div>
        
        <div className="flex flex-wrap items-center gap-2">
          {isDesktop() ? (
            <span className="px-3 py-1 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 rounded-full text-[9px] font-mono font-bold tracking-wide uppercase">
              Desktop Native (Sincronizado)
            </span>
          ) : (
            <span className="px-3 py-1 bg-amber-500/10 border border-amber-500/20 text-amber-500 rounded-full text-[9px] font-mono font-bold tracking-wide uppercase">
              Ambiente Web (Modo Limitado)
            </span>
          )}
          <span className="px-3 py-1 bg-emerald-500/10 border border-white/5 text-emerald-400 rounded-full text-[9px] font-mono font-bold tracking-wide">
            3 TERMINAIS SUPORTADOS
          </span>
        </div>
      </div>

      {/* Critical Warning: PIX Key Config Alert */}
      {!hasPixKey && (
        <div className="bg-red-500/10 border border-red-500/20 text-red-400 p-5 rounded-3xl flex items-start gap-4 shadow-xl select-none">
          <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5 text-red-500 animate-pulse" />
          <div className="space-y-1">
            <span className="text-[10px] font-mono font-black uppercase tracking-widest block text-red-500">Aviso Crítico de Configuração</span>
            <p className="text-[11px] uppercase font-black tracking-wide text-white">Chave PIX não cadastrada para o Totem</p>
            <p className="text-[10px] text-zinc-400 leading-normal uppercase">
              Cadastre uma chave PIX em Formas de Pagamento para possibilitar pagamentos por PIX no autoatendimento.
            </p>
          </div>
        </div>
      )}

      {/* Cashier and Stats Header Row */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-[#121212] border border-white/5 rounded-3xl p-5 flex flex-col justify-between">
          <span className="text-[10px] text-zinc-500 uppercase font-black tracking-widest block border-b border-white/5 pb-2">Status do Caixa Geral</span>
          <div className="pt-4 flex items-center justify-between">
            <span className="text-xs text-zinc-400">Caixa Operacional:</span>
            {currentCashier ? (
              <span className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-[10px] font-bold uppercase font-mono">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-ping" />
                Aberto (#{currentCashier.id.substring(0, 5).toUpperCase()})
              </span>
            ) : (
              <span className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-red-500/10 border border-red-500/20 text-red-500 text-[10px] font-bold uppercase font-mono">
                Fechado
              </span>
            )}
          </div>
        </div>

        <div className="bg-[#121212] border border-white/5 rounded-3xl p-5 flex flex-col justify-between">
          <span className="text-[10px] text-zinc-500 uppercase font-black tracking-widest block border-b border-white/5 pb-2">Vendas Totem Hoje</span>
          <div className="pt-4 flex items-center justify-between">
            <span className="text-xs text-zinc-400">Faturamento ({totemSalesToday.length} Pedidos):</span>
            <strong className="text-sm font-mono text-white font-black">
              R$ {totalTotemSalesValue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
            </strong>
          </div>
        </div>

        <div className="bg-[#121212] border border-white/5 rounded-3xl p-5 flex flex-col justify-between">
          <span className="text-[10px] text-zinc-500 uppercase font-black tracking-widest block border-b border-white/5 pb-2">Painel de Alertas</span>
          <div className="pt-4 flex items-center justify-between">
            <span className="text-xs text-zinc-400">Ações Pendentes:</span>
            {lastActionStatus ? (
              <span className="text-[9px] text-emerald-400 uppercase font-mono font-bold animate-pulse">{lastActionStatus}</span>
            ) : (
              <span className="text-[9px] text-zinc-500 uppercase font-mono">Nenhum evento recente</span>
            )}
          </div>
        </div>
      </div>

      {/* Active waiting payment Confirmation panels (PIX, Cash, Cards) */}
      {Object.keys(waitingRequests).map((key) => {
        const terminalIdNum = Number(key);
        const req = waitingRequests[terminalIdNum];
        if (!req) return null;
        const cashReceivedVal = cashReceivedMap[terminalIdNum] || '';
        return (
          <div key={terminalIdNum} className="bg-[#121212] border-2 border-amber-500/30 rounded-3xl p-6 shadow-2xl flex flex-col gap-6 relative overflow-hidden">
            <div className="absolute top-0 left-0 w-2 h-full bg-amber-500" />
            
            <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 border-b border-white/5 pb-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-amber-500/10 text-amber-500 flex items-center justify-center shrink-0">
                  <Smartphone className="w-5 h-5 animate-bounce" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="px-2 py-0.5 rounded-full bg-amber-500/10 border border-amber-500/20 text-amber-400 text-[8px] font-black uppercase font-mono tracking-widest">
                      {req.paymentType === 'pix' ? 'CONFIRMAÇÃO DE PIX REQUERIDA' : 
                       req.paymentType === 'money' ? 'RECEBIMENTO EM DINHEIRO REQUERIDO' : 
                       'CONFIRMAÇÃO DE CARTÃO REQUERIDA'}
                    </span>
                    <span className="text-[9px] text-zinc-500 font-mono font-bold">Terminal: #0{terminalIdNum}</span>
                </div>
                <h2 className="text-sm font-black text-white uppercase tracking-tight mt-1">
                  Terminal 0{terminalIdNum} aguardando aprovação de R$ {req.total.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                </h2>
              </div>
            </div>

            <div className="text-right text-[10px] font-mono text-zinc-550">
              <span className="text-zinc-500 font-bold uppercase">Status:</span>{' '}
              <span className="text-amber-400 font-black uppercase animate-pulse">
                {req.paymentType === 'pix' ? 'Aguardando PIX' :
                 req.paymentType === 'money' ? 'Aguardando Recebimento' :
                 'Aguardando Maquininha/NFC'}
              </span>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pb-2">
            {/* Left side: Client & Items List */}
            <div className="space-y-3">
              <div className="text-[10px] uppercase font-bold text-zinc-400">Dados do Pedido (Terminal 0{terminalIdNum})</div>
              <div className="bg-black/30 p-4 border border-white/5 rounded-2xl space-y-2">
                <div className="text-[10px] font-mono">
                  <span className="text-zinc-500">Cliente:</span>{' '}
                  <strong className="text-white uppercase font-black">{req.clientName || 'Consumidor Final'}</strong>
                </div>
                <div className="text-[10px] font-mono">
                  <span className="text-zinc-500">Forma escolhida:</span>{' '}
                  <strong className="text-amber-400 uppercase font-black">{req.chosenMethod?.name || 'Totem'}</strong>
                  {req.paymentType === 'pix' && (
                    <span className="block text-[8px] text-zinc-500 mt-0.5">
                      Chave PIX: {req.chosenMethod?.pixKey || 'Padrão da Empresa'}
                    </span>
                  )}
                </div>

                {/* Operator Destination Control */}
                <div className="pt-2 border-t border-white/5 space-y-1.5 align-middle">
                  <span className="text-[9px] text-zinc-500 uppercase font-bold block">Encaminhar Pedido Criado Para:</span>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setTotemDestinations(prev => ({ ...prev, [terminalIdNum]: 'gestao-pedidos' }))}
                      className={`flex-1 py-1 px-2 rounded-lg text-[8px] font-black uppercase font-sans tracking-wider border cursor-pointer transition-all ${
                        (totemDestinations[terminalIdNum] || 'gestao-pedidos') === 'gestao-pedidos'
                          ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400 font-extrabold'
                          : 'bg-transparent border-white/5 text-zinc-400 hover:text-white'
                      }`}
                    >
                      Gestão Comum
                    </button>
                    <button
                      type="button"
                      onClick={() => setTotemDestinations(prev => ({ ...prev, [terminalIdNum]: 'em-producao' }))}
                      className={`flex-1 py-1 px-2 rounded-lg text-[8px] font-black uppercase font-sans tracking-wider border cursor-pointer transition-all ${
                        totemDestinations[terminalIdNum] === 'em-producao'
                          ? 'bg-amber-500/10 border-amber-500/30 text-amber-400 font-extrabold shadow-[0_0_10px_rgba(245,158,11,0.12)]'
                          : 'bg-transparent border-white/5 text-zinc-400 hover:text-white'
                      }`}
                    >
                      Em Produção
                    </button>
                  </div>
                </div>
                
                <div className="space-y-1.5 pt-1 border-t border-white/5">
                  <span className="text-[9px] text-zinc-500 uppercase tracking-wider block font-bold font-mono">Itens no Carrinho:</span>
                  <div className="max-h-24 overflow-y-auto space-y-1 pr-1">
                    {req.salePayload?.items?.map((item: any, idx: number) => (
                      <div key={idx} className="flex justify-between items-center text-[10px] font-mono text-zinc-400">
                        <span className="truncate max-w-[200px]">{item.name}</span>
                        <span>{item.quantity}x R$ {item.price.toFixed(2)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/* Right side: Payment Method specific action field & Totals */}
            <div className="space-y-3">
              {req.paymentType === 'money' ? (
                <>
                  <div className="text-[10px] uppercase font-bold text-zinc-400">Controle de Troco (Operador)</div>
                  <div className="bg-black/30 p-4 border border-white/5 rounded-2xl space-y-3">
                    <div className="space-y-1">
                      <label className="text-[8px] font-mono text-zinc-500 uppercase block font-bold">Valor Entregue pelo Cliente (R$)</label>
                      <div className="flex gap-2">
                        <input
                          type="number"
                          step="0.01"
                          placeholder="Ex: 50.00"
                          value={cashReceivedVal}
                          onChange={(e) => setCashReceivedMap(prev => ({ ...prev, [terminalIdNum]: e.target.value }))}
                          className="flex-1 bg-black/60 border border-white/10 rounded-xl px-3 py-2 text-white font-mono text-xs focus:ring-1 focus:ring-amber-500 focus:outline-none"
                        />
                        <button
                          onClick={() => {
                            // Suggest bill payment options
                            const totalVal = req.total;
                            const rounded = Math.ceil(totalVal / 10) * 10;
                            setCashReceivedMap(prev => ({ ...prev, [terminalIdNum]: rounded.toFixed(2) }));
                          }}
                          className="px-3 py-2 bg-white/5 hover:bg-white/10 rounded-xl text-[9px] uppercase font-black font-sans"
                          title="Sugerir nota comum"
                        >
                          Sugerir Valor
                        </button>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-2 pt-1 border-t border-white/5 text-[10px] font-mono">
                      <div>
                        <span className="text-zinc-500 block">Total Compra:</span>
                        <strong className="text-white">R$ {req.total.toFixed(2)}</strong>
                      </div>
                      <div>
                        {parseFloat(cashReceivedVal) >= req.total ? (
                          <>
                            <span className="text-zinc-500 block">Troco do Cliente:</span>
                            <strong className="text-emerald-400 text-xs">R$ {(parseFloat(cashReceivedVal) - req.total).toFixed(2)}</strong>
                          </>
                        ) : (
                          <>
                            <span className="text-zinc-500 block">Faltando:</span>
                            <strong className="text-red-400 text-xs font-mono">R$ {(req.total - (parseFloat(cashReceivedVal) || 0)).toFixed(2)}</strong>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                </>
              ) : (
                <>
                  <div className="text-[10px] uppercase font-bold text-zinc-400 font-sans">Status do Recebimento</div>
                  <div className="bg-black/30 p-4 border border-white/5 rounded-2xl h-[126px] flex flex-col justify-center items-center text-center space-y-2">
                    {req.paymentType === 'pix' ? (
                      <>
                        <div className="text-amber-400 text-xs font-bold uppercase animate-pulse">Aguardando Recebimento do PIX</div>
                        <p className="text-[8.5px] text-zinc-500 max-w-[280px] leading-relaxed uppercase">
                          Valide se o PIX de <strong>R$ {req.total.toFixed(2)}</strong> constou no extrato ou gerência financeira e clique em confirmar.
                        </p>
                      </>
                    ) : (
                      <>
                        <div className="text-amber-400 text-xs font-bold uppercase animate-pulse">Aprove transação na Maquininha</div>
                        <p className="text-[8.5px] text-zinc-500 max-w-[280px] leading-relaxed uppercase">
                          Finalize o valor de <strong>R$ {req.total.toFixed(2)}</strong> no cartão de {req.chosenMethod?.name || 'Débito/Crédito'} e confirme aqui após concluir.
                        </p>
                      </>
                    )}
                  </div>
                </>
              )}
            </div>
          </div>

          {/* Action buttons */}
          <div className="flex flex-col sm:flex-row items-center justify-end gap-3 pt-2 border-t border-white/5">
            <button
              onClick={() => handleRefusePayment(terminalIdNum)}
              className="w-full sm:w-auto px-6 py-3 bg-red-500/10 hover:bg-red-500/20 text-red-400 hover:text-red-300 rounded-xl text-[10px] uppercase font-black tracking-widest transition-all cursor-pointer font-sans"
            >
              Cancelar Pagamento
            </button>

            <button
              onClick={() => {
                if (req.paymentType === 'money') {
                  const val = parseFloat(cashReceivedVal) || req.total;
                  handleApprovePayment(terminalIdNum, val, val - req.total);
                } else {
                  handleApprovePayment(terminalIdNum);
                }
              }}
              className="w-full sm:w-auto px-6 py-3 bg-blue-500/10 hover:bg-blue-500/20 border border-blue-500/20 text-blue-400 hover:text-blue-300 rounded-xl text-[10px] uppercase font-black tracking-widest transition-all cursor-pointer flex items-center justify-center gap-2 font-sans"
              id={`simular-aprovacao-integrada-btn-${terminalIdNum}`}
            >
              Simular Aprovação Integrada
            </button>
            
            <button
              onClick={() => {
                if (req.paymentType === 'money') {
                  const val = parseFloat(cashReceivedVal) || 0;
                  handleApprovePayment(terminalIdNum, val, val - req.total);
                } else {
                  handleApprovePayment(terminalIdNum);
                }
              }}
              disabled={req.paymentType === 'money' && !(parseFloat(cashReceivedVal) >= req.total)}
              className={`w-full sm:w-auto px-8 py-3 rounded-xl text-[10px] uppercase font-black tracking-widest transition-all shadow-lg flex items-center justify-center gap-2 font-sans ${
                req.paymentType === 'money' && !(parseFloat(cashReceivedVal) >= req.total)
                  ? 'bg-zinc-800 text-zinc-650 border border-zinc-700 cursor-not-allowed'
                  : 'bg-emerald-500 hover:bg-emerald-400 text-black shadow-emerald-500/20 active:scale-95 cursor-pointer font-sans'
              }`}
            >
              <Check className="w-4 h-4 stroke-[3.5]" />
              {req.paymentType === 'money' ? 'Confirmar Recebimento em Dinheiro' : 
               req.paymentType === 'pix' ? 'Confirmar Recebimento de PIX' :
               'Confirmar Pagamento em Cartão'}
            </button>
          </div>
        </div>
        );
      })}

      {/* Grid: Overview Cards & Controls */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        
        {/* Card 1: System and Cashier Status */}
        <div className="bg-[#121212] border border-white/5 rounded-3xl p-5 space-y-4">
          <h2 className="text-xs font-black text-white/50 uppercase tracking-widest border-b border-white/5 pb-2">Status do Caixa Geral</h2>
          
          <div className="flex items-center justify-between pb-2">
            <span className="text-[10px] text-zinc-500 uppercase">Caixa Atual:</span>
            {currentCashier ? (
              <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-[9px] font-bold uppercase font-mono">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-ping" />
                Aberto (#{currentCashier.id.substring(0, 5).toUpperCase()})
              </span>
            ) : (
              <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-red-500/10 border border-red-500/20 text-red-500 text-[9px] font-bold uppercase font-mono">
                Fechado
              </span>
            )}
          </div>

          <div className="bg-black/30 rounded-2xl p-4 border border-white/5 space-y-2">
            <div className="flex justify-between items-center text-[9px]">
              <span className="text-zinc-500 uppercase">Faturamento do Totem (Hoje):</span>
              <span className="text-white font-bold font-mono">R$ {totalTotemSalesValue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
            </div>
            <div className="flex justify-between items-center text-[9px]">
              <span className="text-zinc-500 uppercase">Total de Pedidos Gerados:</span>
              <span className="text-zinc-400 font-bold font-mono">{totemSalesToday.length}</span>
            </div>
          </div>

          {!currentCashier && (
            <div className="flex items-start gap-2.5 p-3 rounded-2xl bg-amber-500/5 border border-amber-500/15 text-amber-500">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
              <p className="text-[9px] uppercase leading-relaxed font-semibold">
                O caixa geral está fechado. O terminal kiosk apresentará "Terminal Fora de Serviço" e bloqueará novas compras de clientes de forma automática.
              </p>
            </div>
          )}
        </div>

        {[1, 2, 3].map(id => {
          const term = terminalsState[id] || {
            isOnline: false,
            currentStep: 'start',
            cartCount: 0,
            paymentStatus: 'idle',
            isLocked: false,
            isFullscreen: false
          };
          const isOnline = term.isOnline;
          
          return (
            <div key={id} className="bg-[#121212] border border-white/5 rounded-3xl p-5 space-y-4 flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between border-b border-white/5 pb-2">
                  <div className="flex items-center gap-1.5">
                    <Monitor className="w-4 h-4 text-emerald-500" />
                    <h3 className="text-xs font-black text-white uppercase tracking-widest">Terminal 0{id}</h3>
                  </div>
                  {isOnline ? (
                    <span className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-[8px] font-bold uppercase font-mono">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-ping" />
                      Online
                    </span>
                  ) : (
                    <span className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-[#1c1c1c] border border-white/5 text-zinc-500 text-[8px] font-bold uppercase font-mono">
                      Offline
                    </span>
                  )}
                </div>

                <div className="mt-3 space-y-2.5">
                  <div className="flex justify-between items-center text-[9px]">
                    <span className="text-zinc-500 uppercase font-mono">Fluxo do Cliente:</span>
                    <span className={`font-bold uppercase ${isOnline ? 'text-zinc-300' : 'text-zinc-600'}`}>
                      {isOnline ? (stepLabels[term.currentStep] || term.currentStep) : 'Indeterminado'}
                    </span>
                  </div>
                  
                  <div className="flex justify-between items-center text-[9px]">
                    <span className="text-zinc-500 uppercase font-mono">Itens no Carrinho:</span>
                    <span className={`font-bold font-mono ${isOnline && term.cartCount > 0 ? 'text-emerald-400' : 'text-zinc-500'}`}>
                      {isOnline ? `${term.cartCount} item(s)` : '0 itens'}
                    </span>
                  </div>

                  <div className="flex justify-between items-center text-[9px]">
                    <span className="text-zinc-500 uppercase font-mono">Pagamento:</span>
                    <span className={`font-bold uppercase ${
                      !isOnline ? 'text-zinc-600' :
                      term.paymentStatus.startsWith('waiting') ? 'text-amber-400 animate-pulse' :
                      term.paymentStatus === 'done' ? 'text-emerald-400' : 'text-zinc-500'
                    }`}>
                      {!isOnline ? 'Inativo' :
                       term.paymentStatus === 'waiting_pix' ? 'Aguardando PIX' :
                       term.paymentStatus === 'waiting_cash' ? 'Aperte p/ Dinheiro' :
                       term.paymentStatus === 'waiting_card' ? 'Aguardando Cartão' :
                       term.paymentStatus === 'done' ? 'Faturado' : 'Sem transação'}
                    </span>
                  </div>
                </div>
              </div>

              <div className="space-y-2 pt-2 border-t border-white/5">
                <button
                  onClick={() => openWindows[id] ? handleCloseTerminal(id) : handleOpenTerminal(id)}
                  className={`w-full py-2 rounded-xl text-[9px] font-black uppercase tracking-wider transition-all active:scale-95 text-center cursor-pointer ${
                    openWindows[id]
                      ? 'bg-red-500/10 border border-red-500/20 text-red-400 hover:bg-red-500/20'
                      : 'bg-emerald-500 hover:bg-emerald-400 text-black hover:shadow-lg hover:shadow-emerald-500/10'
                  }`}
                >
                  {openWindows[id] ? 'Fechar Tela' : 'Abrir Tela'}
                </button>

                <button
                  onClick={() => handleOpenControlTerminal(id)}
                  disabled={!openWindows[id] && !isOnline}
                  className="w-full py-2 disabled:opacity-40 bg-zinc-800 hover:bg-indigo-600 disabled:hover:bg-zinc-800 text-zinc-350 hover:text-white disabled:text-zinc-600 text-[8px] font-black uppercase tracking-wider rounded-xl transition-all active:scale-95 text-center cursor-pointer flex items-center justify-center gap-1.5"
                >
                  <Eye className="w-3.5 h-3.5" /> Controlar Totem
                </button>

                <div className="grid grid-cols-2 gap-1.5 pt-1">
                  <button
                     onClick={() => handleReloadTerminal(id)}
                     disabled={!openWindows[id] && !isOnline}
                     className="py-1.5 disabled:opacity-40 bg-zinc-900 border border-white/5 hover:bg-zinc-850 text-zinc-400 text-[8px] font-bold uppercase rounded-lg transition-all text-center cursor-pointer"
                     title="Reiniciar aplicativo"
                  >
                    Recarregar
                  </button>
                  <button
                    onClick={() => handleResetTerminal(id)}
                    disabled={!openWindows[id] && !isOnline}
                    className="py-1.5 disabled:opacity-40 bg-zinc-900 border border-white/5 hover:bg-zinc-850 text-zinc-400 text-[8px] font-bold uppercase rounded-lg transition-all text-center cursor-pointer"
                    title="Limpar sessão atual e voltar para boas-vindas"
                  >
                    Resetar
                  </button>
                </div>

                <button
                  onClick={() => handleToggleFullscreenTerminal(id)}
                  disabled={!openWindows[id] && !isOnline}
                  className={`w-full py-2 disabled:opacity-40 border text-[8px] font-black uppercase rounded-xl tracking-wider transition-all active:scale-95 text-center cursor-pointer ${
                    term.isFullscreen
                      ? 'bg-blue-500/10 border-blue-500/20 text-blue-400 hover:bg-blue-500/20'
                      : 'bg-zinc-900 border-white/5 hover:bg-zinc-850 text-zinc-350'
                  }`}
                >
                  {term.isFullscreen ? 'Desativar Quiosque' : 'Alternar Quiosque'}
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Secondary Monitor Instructions */}
      <div className="bg-[#121212]/30 border border-white/5 rounded-3xl p-5 space-y-3">
        <div className="flex items-center gap-2.5 text-zinc-400">
          <Monitor className="w-4 h-4 text-emerald-500" />
          <h3 className="text-xs font-black uppercase tracking-wider text-white">Instruções para Monitor Touch Secundário</h3>
        </div>
        
        {isDesktop() ? (
          /* Native Electron process guidelines */
          <div className="text-[9px] leading-relaxed uppercase text-zinc-500 space-y-1.5 font-medium pl-6">
            <p>1. Ligue o monitor secundário (geralmente posicionado de frente para o cliente e com tecnologia touchscreen).</p>
            <p>2. Clique em <strong className="text-emerald-400">"Abrir Totem"</strong> acima na barra de controle. O sistema criará a janela nativa.</p>
            <p>3. Como a janela nativa é criada inicialmente em modo janela, você pode livremente <strong className="text-white">arrastá-la para o monitor secundário</strong>.</p>
            <p>4. Uma vez posicionada no monitor touch, clique no botão <strong className="text-amber-500">"Alternar Kiosk"</strong> no ERP Principal.</p>
            <p>5. Pronto! A janela nativa entrará em <strong className="text-emerald-400 font-bold">modo Kiosk real (fullscreen bloqueado e sem bordas)</strong> naquela tela. O cliente não consegue fechar e a operação fica 100% segura!</p>
          </div>
        ) : (
          /* Web fallback guidelines */
          <div className="text-[9px] leading-relaxed uppercase text-zinc-500 space-y-1.5 font-medium pl-6">
            <p>1. Ligue o monitor secundário (geralmente posicionado virado para o cliente e com tecnologia Touchscreen).</p>
            <p>2. Clique no botão de <strong className="text-emerald-400">"Abrir Tela"</strong> acima para criar a janela reservada ao cliente.</p>
            <p>3. Arraste a nova janela de autoatendimento gerada para a tela do monitor touch secundário.</p>
            <p>4. No teclado do monitor secundário, pressione <strong className="text-zinc-300 font-mono">F11</strong> para colocá-la em Tela Cheia (Fullscreen/Kiosk mode).</p>
            <p>5. Pronto! O cliente operará o fluxo limpo, enquanto você monitora transações e controla a tela aqui pelo ERP.</p>
          </div>
        )}
      </div>

      {/* Catálogo Totem */}
      <div className="bg-[#121212] border border-white/5 rounded-3xl p-5 space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-white/5 pb-4">
          <div className="space-y-0.5">
            <div className="flex items-center gap-2">
              <Tablet className="w-4 h-4 text-emerald-500" />
              <h2 className="text-xs font-black text-white uppercase tracking-widest">Catálogo Totem</h2>
            </div>
            <p className="text-[8px] text-zinc-550 uppercase font-mono tracking-wider leading-none">Gerencie quais produtos do estoque aparecem no terminal de autoatendimento</p>
          </div>
          
          <div className="relative w-full md:w-64">
            <Search className="w-3 h-3 text-zinc-550 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Buscar por nome, código ou categoria..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full bg-black/30 border border-white/5 rounded-xl py-1.5 pl-8 pr-4 text-[9px] uppercase tracking-wider text-white placeholder-zinc-550 focus:outline-none focus:border-emerald-500/30 transition-all font-mono"
            />
          </div>
        </div>

        <div className="overflow-x-auto max-h-[300px]">
          {filteredProducts.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-zinc-650 text-center uppercase tracking-wider text-[9px] space-y-1.5">
              <span>Nenhum produto cadastrado no estoque ou filtro sem resultados</span>
            </div>
          ) : (
            <table className="w-full text-left border-collapse font-mono text-[9px]">
              <thead>
                <tr className="border-b border-white/5 text-zinc-500 text-[8px] uppercase">
                  <th className="pb-2.5 pl-2 font-black">IMAGEM</th>
                  <th className="pb-2.5 font-black">PRODUTO</th>
                  <th className="pb-2.5 font-black">CATEGORIA</th>
                  <th className="pb-2.5 text-right font-black">VALOR</th>
                  <th className="pb-2.5 text-center font-black">ESTOQUE</th>
                  <th className="pb-2.5 pr-2 text-right font-black">STATUS NO TOTEM</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5 text-zinc-300">
                {filteredProducts.map(p => {
                  const isEnabled = p.totemHabilitado !== false;
                  return (
                    <tr key={p.id} className="hover:bg-white/[0.01]">
                      <td className="py-2">
                        {p.image ? (
                          <img
                            src={p.image}
                            alt={p.name}
                            referrerPolicy="no-referrer"
                            className="w-7 h-7 rounded-lg object-cover bg-zinc-900 border border-white/5"
                          />
                        ) : (
                          <div className="w-7 h-7 rounded-lg bg-zinc-900 border border-white/5 flex items-center justify-center text-zinc-600">
                            <Image className="w-3.5 h-3.5" />
                          </div>
                        )}
                      </td>
                      <td className="py-2">
                        <div className="font-bold text-white uppercase font-sans text-[10px]">{p.name}</div>
                        <div className="text-[8px] text-zinc-500 font-mono mt-0.5">CÓD: {p.code || 'S/C'}</div>
                      </td>
                      <td className="py-2 uppercase text-zinc-400 font-sans">{p.category || 'Outros'}</td>
                      <td className="py-2 text-right font-bold text-emerald-400">
                        R$ {p.price.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                      </td>
                      <td className="py-2 text-center">
                        <span className={`font-mono font-bold ${p.stock <= p.minStock ? 'text-amber-500' : 'text-zinc-400'}`}>
                          {p.stock} {p.unit || 'un'}
                        </span>
                      </td>
                      <td className="py-2 pr-2 text-right">
                        <button
                          onClick={() => toggleTotemProduct(p.id, !isEnabled)}
                          disabled={!canConfigure}
                          className={`px-3 py-1.5 rounded-xl text-[8px] font-black uppercase tracking-wider transition-all inline-flex items-center gap-1.5 cursor-pointer active:scale-95 ${
                            !canConfigure
                              ? 'bg-zinc-900 border border-zinc-800 text-zinc-650 cursor-not-allowed'
                              : isEnabled
                              ? 'bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 hover:bg-emerald-500/20'
                              : 'bg-red-500/5 border border-red-500/10 text-red-400 hover:bg-red-500/15'
                          }`}
                          title={!canConfigure ? "Apenas Administradores do Totem podem configurar produtos" : ""}
                        >
                          {!canConfigure ? (
                            <Lock className="w-3 h-3 text-amber-500 shrink-0" />
                          ) : isEnabled ? (
                            <Eye className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                          ) : (
                            <EyeOff className="w-3.5 h-3.5 text-red-400 shrink-0" />
                          )}
                          {isEnabled ? 'Habilitado (Visível)' : 'Oculto no Totem'}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Daily Sales and Pending Orders List */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 pt-2">
        
        {/* Left Table: Outstanding Pending Orders */}
        <div className="bg-[#121212] border border-white/5 rounded-3xl p-5 space-y-4">
          <div className="flex items-center justify-between border-b border-white/5 pb-2">
            <div className="flex items-center gap-1.5">
              <Clock className="w-4 h-4 text-amber-500 animate-pulse" />
              <h3 className="text-xs font-black text-white uppercase tracking-widest">Pedidos Pendentes ({pendingTotemSales.length})</h3>
            </div>
            <span className="text-[8px] px-2 py-0.5 bg-amber-500/10 border border-amber-500/20 text-amber-400 rounded-full font-bold uppercase">Aguardando Atendimento</span>
          </div>

          <div className="overflow-x-auto min-h-[220px]">
            {pendingTotemSales.length === 0 ? (
              <div className="flex flex-col items-center justify-center min-h-[180px] text-zinc-650 text-center uppercase tracking-wider text-[9px] space-y-1.5">
                <CheckCircle2 className="w-8 h-8 text-zinc-800" />
                <span>Nenhum pedido do kiosk pendente de triagem</span>
              </div>
            ) : (
              <table className="w-full text-left border-collapse font-mono text-[9px]">
                <thead>
                  <tr className="border-b border-white/5 text-zinc-500 text-[8px] uppercase">
                    <th className="pb-2 font-black">PEDIDO</th>
                    <th className="pb-2 font-black">CLIENTE</th>
                    <th className="pb-2 font-black">PRODUTOS</th>
                    <th className="pb-2 font-black text-right">VALOR</th>
                    <th className="pb-2 font-black text-center">AÇÃO</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5 text-zinc-300">
                  {pendingTotemSales.map(order => (
                    <tr key={order.id} className="hover:bg-white/[0.02]">
                      <td className="py-2.5 font-bold text-white text-[10px]">#{order.orderNumber}</td>
                      <td className="py-2.5 pr-2 truncate max-w-[100px] uppercase font-sans">
                        {order.clientId ? `Cliente ID` : 'Consumidor Final'}
                      </td>
                      <td className="py-2.5 pr-2 max-w-[150px] truncate uppercase" title={order.items.map(i => `${i.name} (${i.quantity}x)`).join(', ')}>
                        {order.items.map(i => `${i.name} (x${i.quantity})`).join(', ')}
                      </td>
                      <td className="py-2.5 text-right font-bold text-white">R$ {order.total.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
                      <td className="py-2.5 text-center">
                        <button
                          onClick={() => {
                            if (confirm(`Deseja aprovar e faturar o pedido #${order.orderNumber}?`)) {
                              updateSaleStatus(order.id, 'finalizado');
                            }
                          }}
                          className="px-2.5 py-1 bg-emerald-500 text-black hover:bg-emerald-400 rounded-lg text-[8px] uppercase font-bold tracking-wider transition-all scale-95"
                        >
                          Faturar
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>

        {/* Right Table: Historic Completed/Failed Sales */}
        <div className="bg-[#121212] border border-white/5 rounded-3xl p-5 space-y-4">
          <div className="flex items-center justify-between border-b border-white/5 pb-2">
            <div className="flex items-center gap-1.5">
              <CheckCircle2 className="w-4 h-4 text-emerald-500" />
              <h3 className="text-xs font-black text-white uppercase tracking-widest">Vendas Concluídas ({finishedTotemSales.length})</h3>
            </div>
            <span className="text-[8px] px-2 py-0.5 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 rounded-full font-bold uppercase">Hoje</span>
          </div>

          <div className="overflow-x-auto min-h-[220px]">
            {finishedTotemSales.length === 0 ? (
              <div className="flex flex-col items-center justify-center min-h-[180px] text-zinc-650 text-center uppercase tracking-wider text-[9px] space-y-1.5">
                <DollarSign className="w-8 h-8 text-zinc-800" />
                <span>Nenhuma venda concluída hoje neste totem</span>
              </div>
            ) : (
              <table className="w-full text-left border-collapse font-mono text-[9px]">
                <thead>
                  <tr className="border-b border-white/5 text-zinc-500 text-[8px] uppercase">
                    <th className="pb-2 font-black">PEDIDO</th>
                    <th className="pb-2 font-black">PRODUTOS</th>
                    <th className="pb-2 font-black">STATUS</th>
                    <th className="pb-2 font-black text-right">VALOR</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5 text-zinc-300">
                  {finishedTotemSales.map(order => (
                    <tr key={order.id} className="hover:bg-white/[0.02]">
                      <td className="py-2.5 font-bold text-white text-[10px]">#{order.orderNumber}</td>
                      <td className="py-2.5 pr-2 max-w-[180px] truncate uppercase">
                        {order.items.map(i => `${i.name} (x${i.quantity})`).join(', ')}
                      </td>
                      <td className="py-2.5 pr-2">
                        {order.status === 'cancelado' ? (
                          <span className="px-1.5 py-0.5 bg-red-500/10 border border-red-500/20 text-red-500 text-[8px] font-bold uppercase rounded-md font-sans">Cancelado</span>
                        ) : (
                          <span className="px-1.5 py-0.5 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-[8px] font-bold uppercase rounded-md font-sans">{order.status}</span>
                        )}
                      </td>
                      <td className="py-2.5 text-right font-bold text-white">R$ {order.total.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>

      </div>

      {/* Monitor Selection Modal */}
      {monitorSelectTerminalId !== null && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4 font-sans animate-fade-in animate-duration-200">
          <div className="bg-[#121212] border-2 border-amber-500/30 rounded-3xl w-full max-w-lg p-6 space-y-5 shadow-2xl relative overflow-hidden">
            <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-amber-500 to-amber-600" />
            
            <div className="flex items-center justify-between border-b border-white/5 pb-3">
              <div className="flex items-center gap-2">
                <Monitor className="w-5 h-5 text-amber-500" />
                <h3 className="text-xs font-black text-white uppercase tracking-widest font-mono">Selecionar Monitor de Destino</h3>
              </div>
              <button 
                onClick={() => setMonitorSelectTerminalId(null)}
                className="text-zinc-500 hover:text-white uppercase font-black text-[10px] tracking-wider transition-colors cursor-pointer"
              >
                Fechar [x]
              </button>
            </div>

            <div className="space-y-4">
              <p className="text-[11px] text-zinc-400 uppercase leading-relaxed font-mono">
                Selecione o monitor para o <strong className="text-amber-400">Terminal {monitorSelectTerminalId}</strong>.
              </p>

              {showScreenFallbackPrompt && (
                <div className="bg-amber-500/5 border border-amber-500/20 rounded-2xl p-4 text-[9.5px] text-amber-400 uppercase leading-relaxed font-mono space-y-1">
                  <span className="font-black flex items-center gap-1"><AlertTriangle className="w-3.5 h-3.5" /> Atenção Operador:</span>
                  <span>A API de detecção múltipla de hardware nativo requer permissão no navegador. Fornecemos atalhos de posicionamento virtual abaixo para arranjo de tela secundária.</span>
                </div>
              )}

              <div className="grid grid-cols-1 gap-2.5">
                {availableScreens.map((screen, idx) => (
                  <button
                    key={idx}
                    onClick={() => {
                      handleOpenTerminalDirect(monitorSelectTerminalId, screen.left || 0, screen.width || 1024, screen.height || 768);
                      setMonitorSelectTerminalId(null);
                    }}
                    className="w-full text-left p-4 bg-black/40 hover:bg-amber-500/10 border border-white/5 hover:border-amber-500/30 rounded-2xl transition-all flex items-center justify-between group cursor-pointer"
                  >
                    <div className="space-y-1">
                      <div className="text-[11px] font-black text-white uppercase group-hover:text-amber-400 transition-colors">
                        {screen.label || `Tela ${idx + 1}`} {screen.isPrimary ? ' (Principal)' : ' (Secundária)'}
                      </div>
                      <div className="text-[9px] font-mono text-zinc-500 uppercase">
                        Posição Left: {screen.left || 0}px - Resolução: {screen.width || 1024}x{screen.height || 768}
                      </div>
                    </div>
                    <ArrowUpRight className="w-4 h-4 text-zinc-500 group-hover:text-amber-500 transition-colors" />
                  </button>
                ))}
              </div>
              
              <p className="text-[8.5px] text-zinc-500 uppercase leading-relaxed text-center block pt-2 font-mono">
                Dica: Escolha "Monitor Secundário à Direita" se sua TV ou monitor secundário estiver configurado como extensão da área de trabalho do Windows.
              </p>
            </div>
            
            <div className="flex justify-end pt-3 border-t border-white/5">
              <button
                onClick={() => setMonitorSelectTerminalId(null)}
                className="px-5 py-2.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-xl text-[9px] uppercase font-black tracking-widest cursor-pointer font-sans"
              >
                Voltar ao Painel
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
