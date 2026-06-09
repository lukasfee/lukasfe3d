import React, { useState, useMemo, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { QRCodeSVG } from 'qrcode.react';
import { 
  Users, 
  ShoppingCart, 
  CreditCard, 
  CheckCircle, 
  Search, 
  Plus, 
  Minus, 
  Trash2, 
  ArrowLeft, 
  ArrowRight, 
  RefreshCw,
  Sparkles,
  QrCode,
  Smartphone,
  Phone,
  UserCheck,
  UserPlus,
  AlertTriangle,
  Ban,
  Wallet,
  ShoppingBag,
  Grid,
  ChevronRight,
  ChevronLeft,
  Tablet,
  Printer,
  Eye,
  AlertCircle,
  Layers
} from 'lucide-react';
import { useStore, CartItem, Sale, User, Client } from '../store';
import { roundMoney, safeAdd, safeSubtract, safeMultiply } from '../utils/money';
import PdvTotemAdmin from '../components/PdvTotemAdmin';
import { generateCanonicalPdfBlob, downloadOrSharePdf } from '../services/pdfEngine/pdfGenerator';
import { ThreeDViewer } from '../components/ThreeDViewer';

export function generatePixPayload(key: string, amount: number, receiver: string, city: string = 'SAO PAULO') {
  const cleanKey = key.replace(/[^\w@.-]/g, '');
  const cleanReceiver = receiver.trim().substring(0, 25).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase();
  const cleanCity = city.trim().substring(0, 15).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase();
  const formattedAmount = amount.toFixed(2);

  const payloadKey = `00020126580014br.gov.bcb.pix01${cleanKey.length.toString().padStart(2, '0')}${cleanKey}520400005303986540${formattedAmount.length.toString().padStart(2, '0')}${formattedAmount}5802BR59${cleanReceiver.length.toString().padStart(2, '0')}${cleanReceiver}60${cleanCity.length.toString().padStart(2, '0')}${cleanCity}62070503***6304`;
  
  let crc = 0xFFFF;
  for (let i = 0; i < payloadKey.length; i++) {
    crc ^= (payloadKey.charCodeAt(i) << 8);
    for (let j = 0; j < 8; j++) {
      if (crc & 0x8000) {
        crc = (crc << 1) ^ 0x1021;
      } else {
        crc <<= 1;
      }
    }
  }
  const crcHex = (crc & 0xFFFF).toString(16).toUpperCase().padStart(4, '0');
  return payloadKey + crcHex;
}

export default function PdvTotemModule() {
  const isKioskMode = window.location.hash.includes('/kiosk') || window.location.pathname.includes('/kiosk');

  if (!isKioskMode) {
    return <PdvTotemAdmin />;
  }

  const products = useStore((state) => state.products);
  const currentCashier = useStore((state) => state.currentCashier);
  const addSale = useStore((state) => state.addSale);
  const clients = useStore((state) => state.clients);
  const paymentMethods = useStore((state) => state.paymentMethods);
  const deliveryMethods = useStore((state) => state.deliveryMethods);
  const currentUser = useStore((state) => state.currentUser);
  const company = useStore((state) => state.company);
  const receiptConfig = useStore((state) => state.receiptConfig);

  const isControlMode = typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('control') === 'true';
  const terminalParam = typeof window !== 'undefined' ? (new URLSearchParams(window.location.search || window.location.hash.split('?')[1] || '').get('terminal') || '1') : '1';
  const terminalId = Number(terminalParam) || 1;
  const isRemoteUpdatingRef = useRef(false);

  // Core navigation step
  // 'start' | 'customer' | 'products' | 'cart' | 'payment' | 'success'
  const [step, setStep] = useState<'start' | 'customer' | 'products' | 'cart' | 'payment' | 'success'>('start');
  const [showStartOptions, setShowStartOptions] = useState(false);

  // Client Selection State
  const [isAnonymous, setIsAnonymous] = useState(false);
  const [clientSearchQuery, setClientSearchQuery] = useState('');
  const [selectedClient, setSelectedClient] = useState<Client | null>(null);
  const [tempSelectedClient, setTempSelectedClient] = useState<Client | null>(null);
  const [isRegisteringClient, setIsRegisteringClient] = useState(false);
  const [newClientName, setNewClientName] = useState('');
  const [newClientPhone, setNewClientPhone] = useState('');
  const [newClientDocument, setNewClientDocument] = useState('');

  // Built-in Digital Keypad State for CPF / Phone / Name inputs in kiosk mode
  const [focusedField, setFocusedField] = useState<'phone' | 'document' | 'search' | 'name' | null>(null);
  const [keyboardMode, setKeyboardMode] = useState<'numeric' | 'alpha' | 'symbols'>('numeric');

  useEffect(() => {
    if (focusedField === 'phone' || focusedField === 'document') {
      setKeyboardMode('numeric');
    } else if (focusedField === 'name' || focusedField === 'search') {
      setKeyboardMode('alpha');
    }
  }, [focusedField]);

  // Product Selection & Cart State
  const [productSearch, setProductSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [cart, setCart] = useState<CartItem[]>([]);
  const [selectedProductDetails, setSelectedProductDetails] = useState<typeof products[0] | null>(null);
  const [viewing3D, setViewing3D] = useState<boolean>(false);
  const [modalQuantity, setModalQuantity] = useState<number>(1);
  const [selectedSabor, setSelectedSabor] = useState<string>('Padrão');
  const [selectedVariationId, setSelectedVariationId] = useState<string>('');
  const [activeImageIndex, setActiveImageIndex] = useState<number>(0);
  const touchStartXRef = useRef(0);

  const handleTouchStart = (e: React.TouchEvent) => {
    if (viewing3D) return; // Ignore swipe in 3D viewer
    touchStartXRef.current = e.touches[0].clientX;
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (viewing3D) return; // Ignore swipe in 3D viewer
    const touchEndX = e.changedTouches[0].clientX;
    const diff = touchStartXRef.current - touchEndX;
    if (Math.abs(diff) > 40 && modalImagesList.length > 0) {
      if (diff > 0) {
        setActiveImageIndex(prev => (prev + 1) % modalImagesList.length);
      } else {
        setActiveImageIndex(prev => (prev - 1 + modalImagesList.length) % modalImagesList.length);
      }
    }
  };

  useEffect(() => {
    if (selectedProductDetails) {
      setActiveImageIndex(0);
      setViewing3D(false);
      if (selectedProductDetails.variations && selectedProductDetails.variations.length > 0) {
        setSelectedVariationId(selectedProductDetails.variations[0].id);
        setSelectedSabor(selectedProductDetails.variations[0].name);
      } else {
        setSelectedVariationId('');
        setSelectedSabor('Padrão');
      }
    }
  }, [selectedProductDetails]);

  // Keep cart and active product modal in perfect sync with live products changes
  useEffect(() => {
    if (selectedProductDetails) {
      const liveProduct = products.find(p => p.id === selectedProductDetails.id);
      if (!liveProduct || liveProduct.deleted || liveProduct.active === false || liveProduct.totemHabilitado === false) {
        setSelectedProductDetails(null);
      } else {
        if (
          liveProduct.price !== selectedProductDetails.price ||
          liveProduct.stock !== selectedProductDetails.stock ||
          liveProduct.name !== selectedProductDetails.name ||
          liveProduct.image !== selectedProductDetails.image ||
          JSON.stringify(liveProduct.extraImages || []) !== JSON.stringify(selectedProductDetails.extraImages || [])
        ) {
          setSelectedProductDetails(liveProduct);
        }
      }
    }

    setCart((prevCart) => {
      let changed = false;
      const updated = prevCart.map((item) => {
        const live = products.find(p => p.id === item.id);
        if (!live || live.deleted || live.active === false || live.totemHabilitado === false) {
          changed = true;
          return null;
        }
        if (
          item.price !== live.price ||
          item.name !== live.name ||
          item.image !== live.image ||
          item.stock !== live.stock ||
          JSON.stringify(item.extraImages || []) !== JSON.stringify(live.extraImages || [])
        ) {
          changed = true;
          const newQty = Math.max(1, Math.min(item.quantity, live.stock));
          return {
            ...live,
            quantity: newQty
          } as CartItem;
        }
        return item;
      }).filter(Boolean) as CartItem[];

      return changed ? updated : prevCart;
    });
  }, [products, selectedProductDetails]);

  const modalImagesList = useMemo(() => {
    if (!selectedProductDetails) return [];
    const imgs: string[] = [];
    if (selectedProductDetails.image) {
      imgs.push(selectedProductDetails.image);
    }
    if (selectedProductDetails.extraImages && Array.isArray(selectedProductDetails.extraImages)) {
      selectedProductDetails.extraImages.forEach(img => {
        if (img && img.trim() !== '') {
          imgs.push(img);
        }
      });
    }
    return imgs;
  }, [selectedProductDetails]);

  // Payment State
  const [chosenMethod, setChosenMethod] = useState<typeof paymentMethods[0] | null>(null);
  const [paymentStatus, setPaymentStatus] = useState<'idle' | 'processing' | 'waiting_pix' | 'waiting_cash' | 'waiting_card' | 'cancelled' | 'done'>('idle');
  const [cashDeposited, setCashDeposited] = useState<number>(0);
  const [errorMessage, setErrorMessage] = useState('');
  const [pendingPixSessionId, setPendingPixSessionId] = useState<string | null>(null);
  const [pendingSessionId, setPendingSessionId] = useState<string | null>(null);
  const channelRef = useRef<BroadcastChannel | null>(null);

  // Finished order references
  const [lastSale, setLastSale] = useState<Sale | null>(null);
  const [successCountdown, setSuccessCountdown] = useState(10);

  // Cancel confirmation and checkout inactivity states
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [showTimeoutModal, setShowTimeoutModal] = useState(false);
  const [timeoutCountdown, setTimeoutCountdown] = useState(15);
  const timeoutTimerRef = useRef<NodeJS.Timeout | null>(null);
  const countdownTimerRef = useRef<NodeJS.Timeout | null>(null);

  const showTimeoutModalRef = useRef(showTimeoutModal);
  showTimeoutModalRef.current = showTimeoutModal;

  const stepRefForTimeout = useRef(step);
  stepRefForTimeout.current = step;

  const paymentStatusRefForTimeout = useRef(paymentStatus);
  paymentStatusRefForTimeout.current = paymentStatus;

  // Function to reset the 90 seconds inactive timer
  const resetInactivityTimer = () => {
    if (timeoutTimerRef.current) {
      clearTimeout(timeoutTimerRef.current);
    }
    if (showTimeoutModalRef.current) {
      return;
    }

    const isStepActive = stepRefForTimeout.current !== 'start' && stepRefForTimeout.current !== 'success';
    const isPaymentNotDone = paymentStatusRefForTimeout.current !== 'done';

    if (isStepActive && isPaymentNotDone) {
      timeoutTimerRef.current = setTimeout(() => {
        setShowTimeoutModal(true);
        setTimeoutCountdown(15);
      }, 90000); // 90 seconds
    }
  };

  const handleContinueSession = () => {
    setShowTimeoutModal(false);
  };

  const handleEndSession = () => {
    setShowTimeoutModal(false);
    startNewSession();
  };

  // Inactivity countdown handler
  useEffect(() => {
    if (showTimeoutModal) {
      if (timeoutTimerRef.current) {
        clearTimeout(timeoutTimerRef.current);
      }
      countdownTimerRef.current = setInterval(() => {
        setTimeoutCountdown(prev => {
          if (prev <= 1) {
            clearInterval(countdownTimerRef.current!);
            setShowTimeoutModal(false);
            startNewSession();
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    } else {
      if (countdownTimerRef.current) {
        clearInterval(countdownTimerRef.current);
      }
    }

    return () => {
      if (countdownTimerRef.current) {
        clearInterval(countdownTimerRef.current);
      }
    };
  }, [showTimeoutModal]);

  // Main interaction tracking effect
  useEffect(() => {
    const isStepActive = step !== 'start' && step !== 'success';
    const isPaymentNotDone = paymentStatus !== 'done';

    if (!isStepActive || !isPaymentNotDone) {
      if (timeoutTimerRef.current) {
        clearTimeout(timeoutTimerRef.current);
      }
      setShowTimeoutModal(false);
      return;
    }

    resetInactivityTimer();

    const handleInteraction = () => {
      resetInactivityTimer();
    };

    const events = ['click', 'touchstart', 'keydown', 'mousemove', 'input', 'scroll'];
    events.forEach(event => {
      window.addEventListener(event, handleInteraction, { passive: true });
    });

    return () => {
      if (timeoutTimerRef.current) {
        clearTimeout(timeoutTimerRef.current);
      }
      events.forEach(event => {
        window.removeEventListener(event, handleInteraction);
      });
    };
  }, [step, paymentStatus, showTimeoutModal]);

  // Default Seller is defined for totem operations audit trail
  const systemSeller: User = currentUser || {
    id: 'totem-terminal',
    fullName: 'Terminal Autoatendimento',
    login: 'totem.auto',
    roleId: 'vendedor',
    isAdmin: false,
    status: 'ativo'
  } as User;

  const hasPixKey = useMemo(() => {
    const pixMethod = paymentMethods.find(m => m.type === 'pix');
    const methodPixKey = pixMethod?.pixKey;
    const companyPixKey = company?.pixKey;
    return !!(methodPixKey || companyPixKey);
  }, [paymentMethods, company]);

  const hasPrintedRef = useRef<string | null>(null);

  const mapToReciboPayload = (order: Sale): any => {
    const items = order.items.map(item => ({
      code: item.code || item.id,
      description: item.name,
      qty: item.quantity,
      price: item.price,
      total: item.price * item.quantity
    }));

    return {
      orderId: order.id,
      orderNumber: order.orderNumber,
      date: new Date(order.timestamp).toLocaleString(),
      operator: order.sellerName || 'Sistema / Caixa',
      client: {
        name: order.clientId ? (clients.find(c => c.id === order.clientId)?.name || 'CONSUMIDOR FINAL') : 'CONSUMIDOR FINAL',
        phone: order.clientId ? (clients.find(c => c.id === order.clientId)?.phone || '') : '',
        document: order.clientId ? (clients.find(c => c.id === order.clientId)?.document || '') : ''
      },
      items,
      financial: {
        subtotal: order.subtotal,
        discount: order.discount,
        deliveryFee: order.additionalCharge || 0,
        surcharge: 0,
        total: order.total,
        paymentMethod: order.paymentMethodName || 'Outro',
        receivedAmount: order.receivedAmount || order.total,
        changeAmount: order.change || 0
      },
      companyName: company?.name || "Lukasfe Industrial Ltda",
      companyCnpj: company?.document || "00.000.000/0001-00",
      companyAddress: company?.address ? `${company.address.street || ''}, ${company.address.number || ''} ${company.address.neighborhood || ''} ${company.address.city || ''} - ${company.address.state || ''}` : "Praça da Sé, 100",
      companyPhone: company?.phone || "(11) 4002-8922",
      notes: order.deliveryNotes || ""
    };
  };

  const handleAutoPrint = async (order: Sale) => {
    try {
      const compiled = mapToReciboPayload(order);
      const activePaperSize = receiptConfig?.paperSize || '80mm';

      const bindings = useStore.getState().documentPrintConfigs || [];
      const activePrintConfig = bindings.find(c => c.documentId === 'thermal_receipt');

      // Fallback to manual download if config says so or is missing
      if (!activePrintConfig || activePrintConfig.printerId === 'pdf-manual') {
        const blob = await generateCanonicalPdfBlob(
          'reciboTermico',
          compiled,
          activePaperSize,
          {
            orientation: 'portrait',
            marginMm: 2,
            scale: 1,
            safeMode: false,
            isExportPdf: true
          }
        );
        await downloadOrSharePdf(blob, `recibo_totem_${order.orderNumber}`);
        return;
      }

      const printersList = useStore.getState().printers || [];
      const targetPrinter = printersList.find(p => p.id === activePrintConfig.printerId);
      if (!targetPrinter) {
        // Fallback to PDF if printer not found!
        const blob = await generateCanonicalPdfBlob(
          'reciboTermico',
          compiled,
          activePaperSize,
          {
            orientation: 'portrait',
            marginMm: 2,
            scale: 1,
            safeMode: false,
            isExportPdf: true
          }
        );
        await downloadOrSharePdf(blob, `recibo_totem_${order.orderNumber}`);
        return;
      }

      // Resolve driver paper configuration mapping
      const allMappings = useStore.getState().paperDriverMappings || [];
      const matchedMapping = allMappings.find(
        m => m.printerId === targetPrinter.id && m.paperErpId === activePaperSize
      );

      let finalDriverPaperName = activePrintConfig.driverPaperName || 'A4';
      let finalOrientation = activePrintConfig.orientation || 'portrait';
      let finalMarginMm = activePrintConfig.marginMm || 0;
      let finalScale = activePrintConfig.scale || 1.0;
      let finalSafeMode = activePrintConfig.safeModeActive || false;

      if (matchedMapping) {
        finalDriverPaperName = matchedMapping.driverPaperName;
        finalOrientation = matchedMapping.orientation;
        finalMarginMm = matchedMapping.marginMm;
        finalScale = matchedMapping.scale;
        finalSafeMode = matchedMapping.safeMode;
      }

      const { addPrintJob: addPrintJobAction } = useStore.getState();
      addPrintJobAction({
        documentId: 'thermal_receipt',
        documentName: `Recibo Pedido #${order.orderNumber}`,
        printerId: targetPrinter.id,
        printerName: targetPrinter.name,
        paperErpId: activePaperSize,
        driverPaperName: finalDriverPaperName,
        orientation: finalOrientation,
        marginMm: finalMarginMm,
        scale: finalScale,
        safeMode: finalSafeMode,
        payload: compiled
      });

    } catch (err: any) {
      console.error('[TOTEM-AUTO-PRINT] Erro ao imprimir ou exportar PDF do recibo:', err);
      // Failover PDF download
      try {
        const compiled = mapToReciboPayload(order);
        const activePaperSize = receiptConfig?.paperSize || '80mm';
        const blob = await generateCanonicalPdfBlob(
          'reciboTermico',
          compiled,
          activePaperSize,
          {
            orientation: 'portrait',
            marginMm: 2,
            scale: 1,
            safeMode: false,
            isExportPdf: true
          }
        );
        await downloadOrSharePdf(blob, `recibo_totem_${order.orderNumber}_erro`);
      } catch (nestedErr) {
        console.error('Nested error generating backup PDF:', nestedErr);
      }
    }
  };

  useEffect(() => {
    if (step === 'success' && lastSale) {
      if (hasPrintedRef.current !== lastSale.id) {
        hasPrintedRef.current = lastSale.id;
        handleAutoPrint(lastSale);
      }
    }
  }, [step, lastSale]);

  // Active items for the kiosk grid (excluding deleted or inactive)
  const activeProducts = useMemo(() => {
    return products.filter(p => p.active !== false && p.totemHabilitado !== false);
  }, [products]);

  // Vitrine products: active, stock > 0, totem enabled, not deleted
  const vitrineProductsToShow = useMemo(() => {
    return products
      .filter(p => p.active !== false && p.totemHabilitado !== false && !p.deleted && (p.stock !== undefined ? p.stock > 0 : true))
      .slice(0, 10); // Between 6 and 12
  }, [products]);

  const activePaymentMethods = useMemo(() => {
    return paymentMethods.filter(m => m.active && m.showInPDV);
  }, [paymentMethods]);

  const hasPixConfig = useMemo(() => {
    return activePaymentMethods.some(m => m.type === 'pix' || m.name?.toLowerCase().includes('pix'));
  }, [activePaymentMethods]);

  const hasCardConfig = useMemo(() => {
    return activePaymentMethods.some(m => m.type === 'card' || m.name?.toLowerCase().includes('cart') || m.name?.toLowerCase().includes('credit') || m.name?.toLowerCase().includes('debit'));
  }, [activePaymentMethods]);

  const hasMoneyConfig = useMemo(() => {
    return activePaymentMethods.some(m => m.type === 'money' || m.name?.toLowerCase().includes('dinheiro') || m.name?.toLowerCase().includes('money'));
  }, [activePaymentMethods]);

  // Categories extracted automatically from products list
  const productCategories = useMemo(() => {
    const list = new Set<string>();
    activeProducts.forEach(p => {
      if (p.category) list.add(p.category);
    });
    return Array.from(list);
  }, [activeProducts]);

  // Filtered Products for customer viewing
  const filteredProducts = useMemo(() => {
    return activeProducts.filter(p => {
      const matchCategory = selectedCategory === 'all' || p.category === selectedCategory;
      const matchSearch = !productSearch.trim() || 
        p.name.toLowerCase().includes(productSearch.toLowerCase()) ||
        p.code.toLowerCase().includes(productSearch.toLowerCase()) ||
        p.category.toLowerCase().includes(productSearch.toLowerCase());
      return matchCategory && matchSearch;
    });
  }, [activeProducts, selectedCategory, productSearch]);

  // Filtered/searched customers in the database
  const filteredClients = useMemo(() => {
    if (!clientSearchQuery.trim()) return [];
    const query = clientSearchQuery.toLowerCase();
    return clients.filter(c => 
      c.active && (
        c.name.toLowerCase().includes(query) ||
        (c.document || '').includes(query) ||
        (c.phone || '').includes(query) ||
        (c.whatsapp || '').includes(query)
      )
    );
  }, [clients, clientSearchQuery]);

  // Calculated totals of current kiosk cart
  const subtotal = useMemo(() => {
    return cart.reduce((acc, item) => safeAdd(acc, safeMultiply(item.price, item.quantity)), 0);
  }, [cart]);

  const total = subtotal; // Totem does not authorize high-level admin discount by default

  const changeAmount = useMemo(() => {
    if (chosenMethod?.type === 'money' && cashDeposited > total) {
      return safeSubtract(cashDeposited, total);
    }
    return 0;
  }, [chosenMethod, cashDeposited, total]);

  // Reset module states to trigger brand new session
  const startNewSession = () => {
    setCart([]);
    setSelectedClient(null);
    setTempSelectedClient(null);
    setIsAnonymous(false);
    setClientSearchQuery('');
    setProductSearch('');
    setSelectedCategory('all');
    setChosenMethod(null);
    setPaymentStatus('idle');
    setCashDeposited(0);
    setErrorMessage('');
    setLastSale(null);
    hasPrintedRef.current = null;
    setNewClientName('');
    setNewClientPhone('');
    setNewClientDocument('');
    setIsRegisteringClient(false);
    setFocusedField(null);
    setSelectedProductDetails(null);
    setModalQuantity(1);
    setStep('start');
    setShowStartOptions(false);
  };

  // Inactivity Auto-Return Timer (60 seconds)
  useEffect(() => {
    // If we are already on the vitrine home, no need for inactivity monitoring
    if (step === 'start' && !showStartOptions) {
      return;
    }

    const isPaymentPending = paymentStatus !== 'idle' && paymentStatus !== 'cancelled' && paymentStatus !== 'done';
    const skipTimeout = step === 'success' || isPaymentPending;

    if (skipTimeout) {
      return;
    }

    let timeoutId: NodeJS.Timeout;

    const resetTimer = () => {
      if (timeoutId) clearTimeout(timeoutId);
      timeoutId = setTimeout(() => {
        console.log(`[PdvTotemModule-T${terminalId}] Kiosk automatically returned to Vitrine mode because of 60s inactivity.`);
        startNewSession();
      }, 60000); // 60 seconds
    };

    // Initialize timer on load or when state shifts
    resetTimer();

    // User interactions to reset inactivity countdown
    const activityEvents = ['click', 'touchstart', 'keydown', 'mousemove', 'scroll', 'input'];
    
    const handleActivity = () => {
      resetTimer();
    };

    activityEvents.forEach(event => {
      window.addEventListener(event, handleActivity, { passive: true });
    });

    return () => {
      if (timeoutId) clearTimeout(timeoutId);
      activityEvents.forEach(event => {
        window.removeEventListener(event, handleActivity);
      });
    };
  }, [step, showStartOptions, paymentStatus, terminalId]);

  // Automated session recovery/return after timeout in success state
  useEffect(() => {
    let timer: NodeJS.Timeout;
    if (step === 'success' && successCountdown > 0) {
      timer = setTimeout(() => {
        setSuccessCountdown(prev => prev - 1);
      }, 1000);
    } else if (step === 'success' && successCountdown === 0) {
      startNewSession();
    }
    return () => clearTimeout(timer);
  }, [step, successCountdown]);

  const stepRef = useRef(step);
  stepRef.current = step;

  const cartLengthRef = useRef(cart.length);
  cartLengthRef.current = cart.length;

  // Sync Kiosk events and state remotely with Operator tab via BroadcastChannel
  useEffect(() => {
    let active = true;
    const channel = new BroadcastChannel('pdv-totem-channel');
    channelRef.current = channel;

    const safePost = (msg: any) => {
      if (!active) return;
      try {
        // Automatically inject terminalId into outgoing messages if a payload is present
        const enrichedMsg = { ...msg };
        if (enrichedMsg.payload) {
          enrichedMsg.payload = {
            terminalId,
            ...enrichedMsg.payload
          };
        } else {
          enrichedMsg.payload = { terminalId };
        }
        channel.postMessage(enrichedMsg);
      } catch (err) {
        console.warn('Kiosk BroadcastChannel failed to send (channel may be closed):', err);
      }
    };

    // Broadcast heartbeat every second so the Operator Panel has real-time telemetry
    const heartbeatTimer = setInterval(() => {
      safePost({
        type: 'kiosk-heartbeat',
        payload: {
          terminalId,
          currentStep: stepRef.current,
          cartCount: cartLengthRef.current,
          paymentStatus: paymentStatus
        }
      });
    }, 1000);

    // Prompt operator channel for an initial state sync so products and cashier match perfectly in-place
    safePost({ type: 'request-sync' });

    if (isControlMode) {
      safePost({ type: 'request-totem-state' });
    }

    channel.onmessage = (event) => {
      if (!active) return;
      const { type, payload } = event.data;

      // 1. "sync-state" is global for product/cashier database updates - no terminalId required.
      if (type === 'sync-state') {
        if (payload) {
          useStore.setState({
            currentCashier: payload.currentCashier,
            products: payload.products
          });
        }
        return;
      }

      // 2. These are sensitive/administrative/control commands. They require an explicit, matching terminalId.
      const sensitiveCommands = [
        'close-kiosk', 'close_customer_display', 'close_totem_control',
        'reload-kiosk',
        'reset-kiosk', 'totem_reset',
        'totem-fullscreen-changed',
        'totem-pix-approved', 'totem-payment-approved', 'payment_confirmed',
        'totem-pix-refused', 'totem-payment-refused', 'payment_cancelled',
        'request-totem-state',
        'totem-state-sync', 'totem_state_sync'
      ];

      if (sensitiveCommands.includes(type)) {
        if (!payload || payload.terminalId === undefined) {
          console.warn(`[PdvTotemModule-T${terminalId}] Sensitive command '${type}' ignored: terminalId missing in payload.`);
          return;
        }
        if (Number(payload.terminalId) !== Number(terminalId)) {
          // Quietly ignore command intended for another terminal
          return;
        }
      } else {
        // Any other command: ignore if targeted to another terminal
        if (payload?.terminalId && Number(payload.terminalId) !== Number(terminalId)) {
          return;
        }
      }

      // Executing commands, only for the validated matching terminal target
      if (type === 'close-kiosk' || type === 'close_customer_display' || type === 'close_totem_control') {
        window.close();
      } else if (type === 'reload-kiosk') {
        window.location.reload();
      } else if (type === 'reset-kiosk' || type === 'totem_reset') {
        startNewSession();
      } else if (type === 'totem-fullscreen-changed') {
        const isFS = payload?.isFullscreen;
        const isDesktopVal = typeof window !== 'undefined' && !!(window as any).electron;
        if (isDesktopVal) {
          const bridge = (window as any).electron;
          if (bridge?.toggleKioskFullscreen) {
            bridge.toggleKioskFullscreen().catch((err: any) => {
              console.error('Erro ao alternar kiosk nativo:', err);
            });
          }
        } else {
          try {
            if (isFS) {
              document.documentElement.requestFullscreen().catch((err) => {
                console.warn('Fullscreen request blocked or failed:', err);
              });
            } else {
              if (document.fullscreenElement) {
                document.exitFullscreen().catch((err) => {
                  console.warn('Fullscreen exit failed:', err);
                });
              }
            }
          } catch (e) {
            console.warn('Browser fullscreen not supported or failed:', e);
          }
        }
      } else if (type === 'totem-pix-approved' || type === 'totem-payment-approved' || type === 'payment_confirmed') {
        // Operator approved the payment!
        const finalSale = payload?.sale || lastSale;
        if (finalSale) {
          setLastSale(finalSale);
        }
        setPaymentStatus('done');
        setSuccessCountdown(10);
        setStep('success');
        setCart([]);
        setChosenMethod(null);
      } else if (type === 'totem-pix-refused' || type === 'totem-payment-refused' || type === 'payment_cancelled') {
        // Operator refused/cancelled the payment!
        setPaymentStatus('cancelled');
        setErrorMessage('Pagamento não confirmado. Chame um atendente.');
        setPendingPixSessionId(null);
        setPendingSessionId(null);
        // Clean up and return to idle selection after 6 seconds
        setTimeout(() => {
          setPaymentStatus('idle');
          setErrorMessage('');
        }, 6000);
      } else if (type === 'request-totem-state') {
        safePost({
          type: 'totem-state-sync',
          payload: {
            cart,
            selectedClient,
            tempSelectedClient,
            isAnonymous,
            clientSearchQuery,
            productSearch,
            selectedCategory,
            chosenMethod,
            paymentStatus,
            cashDeposited,
            errorMessage,
            lastSale,
            isRegisteringClient,
            newClientName,
            newClientPhone,
            newClientDocument,
            focusedField,
            selectedProductDetails,
            modalQuantity,
            step
          }
        });
      } else if (type === 'totem-state-sync' || type === 'totem_state_sync') {
        isRemoteUpdatingRef.current = true;
        if (payload.cart !== undefined) setCart(payload.cart);
        if (payload.selectedClient !== undefined) setSelectedClient(payload.selectedClient);
        if (payload.tempSelectedClient !== undefined) setTempSelectedClient(payload.tempSelectedClient);
        if (payload.isAnonymous !== undefined) setIsAnonymous(payload.isAnonymous);
        if (payload.clientSearchQuery !== undefined) setClientSearchQuery(payload.clientSearchQuery);
        if (payload.productSearch !== undefined) setProductSearch(payload.productSearch);
        if (payload.selectedCategory !== undefined) setSelectedCategory(payload.selectedCategory);
        if (payload.chosenMethod !== undefined) setChosenMethod(payload.chosenMethod);
        if (payload.paymentStatus !== undefined) setPaymentStatus(payload.paymentStatus);
        if (payload.cashDeposited !== undefined) setCashDeposited(payload.cashDeposited);
        if (payload.errorMessage !== undefined) setErrorMessage(payload.errorMessage);
        if (payload.lastSale !== undefined) setLastSale(payload.lastSale);
        if (payload.isRegisteringClient !== undefined) setIsRegisteringClient(payload.isRegisteringClient);
        if (payload.newClientName !== undefined) setNewClientName(payload.newClientName);
        if (payload.newClientPhone !== undefined) setNewClientPhone(payload.newClientPhone);
        if (payload.newClientDocument !== undefined) setNewClientDocument(payload.newClientDocument);
        if (payload.focusedField !== undefined) setFocusedField(payload.focusedField);
        if (payload.selectedProductDetails !== undefined) setSelectedProductDetails(payload.selectedProductDetails);
        if (payload.modalQuantity !== undefined) setModalQuantity(payload.modalQuantity);
        if (payload.step !== undefined) setStep(payload.step);
        
        setTimeout(() => {
          isRemoteUpdatingRef.current = false;
        }, 500);
      }
    };

    return () => {
      active = false;
      channelRef.current = null;
      clearInterval(heartbeatTimer);
      try {
        channel.close();
      } catch (err) {
        console.error('Error closing kiosk channel:', err);
      }
    };
  }, [paymentStatus, lastSale, cart, selectedClient, tempSelectedClient, isAnonymous, clientSearchQuery, productSearch, selectedCategory, chosenMethod, cashDeposited, errorMessage, isRegisteringClient, newClientName, newClientPhone, newClientDocument, focusedField, selectedProductDetails, modalQuantity, step, terminalId, isControlMode]);

  const cartString = JSON.stringify(cart);
  const selectedClientString = JSON.stringify(selectedClient);
  const tempSelectedClientString = JSON.stringify(tempSelectedClient);

  useEffect(() => {
    if (isRemoteUpdatingRef.current) return;

    if (channelRef.current) {
      channelRef.current.postMessage({
        type: 'totem-state-sync',
        payload: {
          terminalId,
          cart,
          selectedClient,
          tempSelectedClient,
          isAnonymous,
          clientSearchQuery,
          productSearch,
          selectedCategory,
          chosenMethod,
          paymentStatus,
          cashDeposited,
          errorMessage,
          lastSale,
          isRegisteringClient,
          newClientName,
          newClientPhone,
          newClientDocument,
          focusedField,
          selectedProductDetails,
          modalQuantity,
          step
        }
      });
    }
  }, [
    cartString,
    selectedClientString,
    tempSelectedClientString,
    isAnonymous,
    clientSearchQuery,
    productSearch,
    selectedCategory,
    chosenMethod,
    paymentStatus,
    cashDeposited,
    errorMessage,
    lastSale,
    isRegisteringClient,
    newClientName,
    newClientPhone,
    newClientDocument,
    focusedField,
    selectedProductDetails,
    modalQuantity,
    step
  ]);

  // Mask formatting helpers for numeric inputs
  const formatCPF = (val: string) => {
    const clean = val.replace(/\D/g, '').slice(0, 11);
    let out = clean;
    if (clean.length > 3) out = clean.slice(0, 3) + '.' + clean.slice(3);
    if (clean.length > 6) out = out.slice(0, 7) + '.' + out.slice(7);
    if (clean.length > 9) out = out.slice(0, 11) + '-' + out.slice(11);
    return out;
  };

  const formatPhone = (val: string) => {
    const clean = val.replace(/\D/g, '').slice(0, 11);
    let out = clean;
    if (clean.length > 0) out = '(' + clean;
    if (clean.length > 2) out = out.slice(0, 3) + ') ' + out.slice(3);
    if (clean.length > 7) out = out.slice(0, 10) + '-' + out.slice(10);
    return out;
  };

  // Handlers for digital on-screen keypad clicks
  const handleKeypadPress = (digit: string) => {
    if (!focusedField) return;

    if (focusedField === 'search') {
      setClientSearchQuery(prev => prev + digit);
    } else if (focusedField === 'name') {
      setNewClientName(prev => {
        // Prevent typing numbers if in alpha mode unless desired, but name usually allows any character.
        return prev + digit;
      });
    } else if (focusedField === 'phone') {
      setNewClientPhone(prev => {
        const clean = (prev + digit).replace(/\D/g, '');
        return formatPhone(clean);
      });
    } else if (focusedField === 'document') {
      setNewClientDocument(prev => {
        const clean = (prev + digit).replace(/\D/g, '');
        return formatCPF(clean);
      });
    }
  };

  const handleKeypadBackspace = () => {
    if (!focusedField) return;

    if (focusedField === 'search') {
      setClientSearchQuery(prev => prev.slice(0, -1));
    } else if (focusedField === 'name') {
      setNewClientName(prev => prev.slice(0, -1));
    } else if (focusedField === 'phone') {
      setNewClientPhone(prev => {
        const clean = prev.slice(0, -1).replace(/\D/g, '');
        return formatPhone(clean);
      });
    } else if (focusedField === 'document') {
      setNewClientDocument(prev => {
        const clean = prev.slice(0, -1).replace(/\D/g, '');
        return formatCPF(clean);
      });
    }
  };

  const handleKeypadClear = () => {
    if (!focusedField) return;

    if (focusedField === 'search') {
      setClientSearchQuery('');
    } else if (focusedField === 'name') {
      setNewClientName('');
    } else if (focusedField === 'phone') {
      setNewClientPhone('');
    } else if (focusedField === 'document') {
      setNewClientDocument('');
    }
  };

  const handleKeypadConfirm = () => {
    if (focusedField === 'search') {
      setFocusedField(null);
    } else if (focusedField === 'name') {
      setFocusedField('phone');
    } else if (focusedField === 'phone') {
      setFocusedField('document');
    } else if (focusedField === 'document') {
      setFocusedField(null);
    }
  };

  // Add Item to cart with stock validation constraints and custom variations
  const addToCart = (product: typeof products[0], quantityToAdd: number = 1, variationName: string = '', customPrice?: number, variationId?: string) => {
    const activeVar = variationId && product.variations 
      ? product.variations.find(v => v.id === variationId)
      : null;

    const availableStock = activeVar ? activeVar.stock : product.stock;

    if (availableStock <= 0) {
      alert('Infelizmente este produto está sem estoque no momento.');
      return;
    }

    const nameWithVariation = variationName && variationName !== 'Tradicional' && variationName !== 'Padrão' && variationName !== 'Normal'
      ? `${product.name} (${variationName})`
      : product.name;

    const finalPrice = customPrice !== undefined ? customPrice : (activeVar?.price !== undefined ? activeVar.price : product.price);

    const finalProduct = {
      ...product,
      name: nameWithVariation,
      price: finalPrice,
      selectedVariationId: activeVar?.id || undefined,
      selectedVariationName: activeVar?.name || undefined,
      selectedVariationSku: activeVar?.sku || undefined
    };

    setCart(prev => {
      const existing = prev.find(item => 
        item.id === product.id && 
        item.selectedVariationId === (activeVar?.id || undefined)
      );
      if (existing) {
        const targetQty = existing.quantity + quantityToAdd;
        if (targetQty > availableStock) {
          alert(`Estoque máximo disponível (${availableStock}) atingido para este item.`);
          return prev.map(item => 
            (item.id === product.id && item.selectedVariationId === (activeVar?.id || undefined)) 
              ? { ...item, quantity: availableStock } 
              : item
          );
        }
        return prev.map(item => 
          (item.id === product.id && item.selectedVariationId === (activeVar?.id || undefined)) 
            ? { ...item, quantity: targetQty } 
            : item
        );
      }
      return [...prev, { ...finalProduct, quantity: Math.min(quantityToAdd, availableStock) } as CartItem];
    });
  };

  const updateQuantity = (id: string, delta: number, variationId?: string) => {
    const origProduct = products.find(p => p.id === id);
    if (!origProduct) return;

    setCart(prev => prev.map(item => {
      if (item.id === id && item.selectedVariationId === variationId) {
        const targetQty = item.quantity + delta;
        if (targetQty <= 0) return item; // Handled by delete click
        
        const availableStock = variationId && origProduct.variations
          ? (origProduct.variations.find(v => v.id === variationId)?.stock ?? origProduct.stock)
          : origProduct.stock;

        if (targetQty > availableStock) {
          alert('Quantidade máxima em estoque atingida.');
          return item;
        }
        return { ...item, quantity: targetQty };
      }
      return item;
    }));
  };

  const removeFromCart = (id: string, variationId?: string) => {
    setCart(prev => prev.filter(item => !(item.id === id && item.selectedVariationId === variationId)));
  };

  // Customer quick registration logic
  const handleQuickClientRegister = () => {
    if (!newClientName.trim()) {
      alert('Por favor, informe seu Nome Completo.');
      return;
    }

    // Checking if CPF/document matches any existing client to avoid duplicates
    const cleanDoc = newClientDocument.replace(/\D/g, '');
    const cleanPhone = newClientPhone.replace(/\D/g, '');

    const existingClient = clients.find(c => {
      if (cleanDoc && c.document?.replace(/\D/g, '') === cleanDoc) return true;
      if (cleanPhone && c.phone?.replace(/\D/g, '') === cleanPhone) return true;
      return false;
    });

    if (existingClient) {
      setSelectedClient(existingClient);
      setIsRegisteringClient(false);
      setIsAnonymous(false);
      setStep('products');
      return;
    }

    const storeAddClient = useStore.getState().addClient;
    const clientUuid = 'cli-' + Date.now().toString(36);
    
    // Dispatch client creation using standard store rules
    storeAddClient({
      name: newClientName,
      phone: newPhoneClean(),
      whatsapp: newPhoneClean(),
      document: newClientDocument || '000.000.000-00',
      email: `${newClientName.toLowerCase().replace(/\s+/g, '.')}@totem.com`,
    }, systemSeller.fullName);

    // Give store a moment to update and select client
    setTimeout(() => {
      const registered = useStore.getState().clients.find(c => c.name === newClientName);
      if (registered) {
        setSelectedClient(registered);
      } else {
        setSelectedClient({
          id: clientUuid,
          name: newClientName,
          phone: newClientPhone,
          document: newClientDocument,
          email: `${newClientName.toLowerCase().replace(/\s+/g, '.')}@totem.com`,
          active: true,
          createdAt: Date.now()
        });
      }
      setIsRegisteringClient(false);
      setIsAnonymous(false);
      setStep('products');
    }, 150);
  };

  const newPhoneClean = () => {
    return newClientPhone.replace(/\D/g, '');
  };

  // Proceeding to payment and setting standard system active payment methods
  const handleProceedToPayment = () => {
    if (cart.length === 0) {
      alert('Seu carrinho está vazio.');
      return;
    }
    setChosenMethod(null);
    setPaymentStatus('idle');
    setCashDeposited(0);
    setStep('payment');
  };

  // Execute actual checkout logic registering sale in the ERP core system
  const handleFinalizeSale = () => {
    if (!currentCashier) {
      setErrorMessage('Operação bloqueada: Caixa fechado neste terminal.');
      return;
    }
    if (!chosenMethod) {
      setErrorMessage('Selecione uma forma de pagamento.');
      return;
    }

    if (chosenMethod.type === 'pix' && !hasPixKey) {
      setErrorMessage('Chave PIX não cadastrada. Chame um atendente.');
      return;
    }

    // Select suitable delivery method (usually pick up in-store / Retirada)
    const emMaosMethod = deliveryMethods.find(m => m.name.toLowerCase().includes('mãos') || m.name.toLowerCase().includes('retirada'))
      || deliveryMethods[0]
      || { id: 'retirada', name: 'Retirada em Mãos' };

    // Set checkout details adhering strictly to ERP requirements
    const salePayload = {
      items: cart.map(item => ({ ...item, pickedQuantity: 0 })),
      subtotal,
      discount: 0,
      total,
      paymentMethodId: chosenMethod.id,
      paymentMethodName: chosenMethod.name,
      receivedAmount: chosenMethod.type === 'money' ? cashDeposited : total,
      change: chosenMethod.type === 'money' ? changeAmount : 0,
      payments: [{
        methodId: chosenMethod.id,
        methodName: chosenMethod.name,
        amount: total,
      }],
      clientId: selectedClient ? selectedClient.id : undefined,
      sellerName: systemSeller.fullName,
      sellerLogin: systemSeller.login,
      deliveryMethodId: emMaosMethod.id,
      deliveryMethodName: emMaosMethod.name,
      notes: 'Realizado através do Totem Autoatendimento'
    };

    const pendingId = chosenMethod.type + '-' + Date.now() + '-' + Math.floor(Math.random() * 1000);
    setPendingSessionId(pendingId);
    setPendingPixSessionId(pendingId);

    if (chosenMethod.type === 'pix') {
      setPaymentStatus('waiting_pix');
      if (channelRef.current) {
        channelRef.current.postMessage({
          type: 'totem-pix-waiting',
          payload: {
            id: pendingId,
            terminalId,
            total,
            subtotal,
            itemsCount: cart.length,
            clientName: selectedClient ? selectedClient.name : 'Consumidor Final',
            salePayload,
            chosenMethod
          }
        });
      }
      return;
    }

    if (chosenMethod.type === 'money') {
      setPaymentStatus('waiting_cash');
      if (channelRef.current) {
        channelRef.current.postMessage({
          type: 'totem-cash-waiting',
          payload: {
            id: pendingId,
            terminalId,
            total,
            subtotal,
            itemsCount: cart.length,
            clientName: selectedClient ? selectedClient.name : 'Consumidor Final',
            salePayload,
            chosenMethod
          }
        });
      }
      return;
    }

    // Default to card/other checkouts. Requires operator confirmation.
    setPaymentStatus('waiting_card');
    if (channelRef.current) {
      channelRef.current.postMessage({
        type: 'totem-card-waiting',
        payload: {
          id: pendingId,
          terminalId,
          total,
          subtotal,
          itemsCount: cart.length,
          clientName: selectedClient ? selectedClient.name : 'Consumidor Final',
          salePayload,
          chosenMethod
        }
      });
    }
  };

  // If Cashier is closed, block Totem with elegant full page prompt advising administration
  if (!currentCashier && isKioskMode) {
    return (
      <div className="min-h-screen bg-[#070707] flex items-center justify-center p-6 text-white select-none">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,_rgba(16,185,129,0.02),_transparent_60%)] pointer-events-none" />
        <motion.div 
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="w-full max-w-lg bg-[#0e0e0e] border border-white/5 rounded-[2.5rem] p-10 text-center space-y-6 shadow-2xl relative"
        >
          <div className="absolute -top-10 left-1/2 -translate-x-1/2 w-20 h-20 bg-red-500/10 border border-red-500/20 rounded-3xl flex items-center justify-center text-red-500 shadow-2xl">
            <Ban className="w-10 h-10 animate-pulse" />
          </div>
          
          <div className="pt-6 space-y-2">
            <h1 className="text-sm font-black uppercase tracking-[0.2em] text-red-400">Terminal Fora de Serviço</h1>
            <p className="text-[11px] font-bold text-zinc-400 uppercase tracking-wide leading-relaxed">
              O caixa geral do sistema encontra-se fechado.
            </p>
            <p className="text-[9px] text-zinc-500 uppercase leading-relaxed max-w-sm mx-auto">
              Para reativar este Totem de autoatendimento, um administrador ou operador autorizado deve realizar a abertura do caixa com o saldo de abertura padrão.
            </p>
          </div>

          <div className="border border-white/5 bg-black/40 rounded-2xl p-4">
            <span className="text-[8px] font-mono uppercase text-zinc-500 tracking-widest block mb-1">Identificação do Terminal</span>
            <span className="text-[10px] font-black uppercase text-emerald-400 font-mono">TOTEM-CLIENTE-01</span>
          </div>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#070707] text-white flex flex-col relative select-none">
      <style dangerouslySetInnerHTML={{ __html: `
        body, html, #root, .min-h-screen {
          -webkit-app-region: no-drag !important;
          user-select: none !important;
        }
        button, input, select, a, [role="button"], textarea {
          -webkit-app-region: no-drag !important;
        }
      `}} />
      
      {isControlMode && (
        <div className="bg-indigo-650 border-b border-indigo-500 py-2.5 px-4 text-center text-[10px] font-black uppercase tracking-wider flex items-center justify-center gap-2 select-none z-50 text-white animate-pulse shrink-0">
          <Eye className="w-4 h-4 animate-bounce shrink-0" />
          Modo Controle Assistido (Operador Ativo) — Visualizando e Controlando a Sessão do Totem
        </div>
      )}
      
      {/* Upper Progress Bar (Hidden on Start View) */}
      {step !== 'start' && step !== 'success' && (
        <header className="bg-[#0c0c0c] border-b border-white/5 px-6 py-4 shrink-0 flex items-center justify-between shadow-lg relative z-20">
          <div className="flex items-center gap-3">
            <button 
              onClick={() => {
                if (step === 'customer') {
                  setStep('start');
                } else if (step === 'products') {
                  if (isAnonymous) {
                    setSelectedClient(null);
                    setIsAnonymous(false);
                    setStep('start');
                  } else {
                    setSelectedClient(null);
                    setIsAnonymous(false);
                    setStep('customer');
                  }
                } else if (step === 'cart') {
                  setStep('products');
                } else if (step === 'payment') {
                  setStep('cart');
                }
              }}
              className="w-10 h-10 border border-white/5 bg-white/5 hover:bg-white/10 rounded-xl flex items-center justify-center text-white/70 active:scale-95 transition-all"
            >
              <ArrowLeft className="w-4 h-4" />
            </button>
            <div>
              <span className="text-[8px] font-mono text-emerald-400 tracking-widest uppercase block">Autoatendimento</span>
              <span className="text-[10px] font-black uppercase tracking-wider">
                {step === 'customer' && 'Identifique-se'}
                {step === 'products' && 'Escolha seus Produtos'}
                {step === 'cart' && 'Meu Carrinho'}
                {step === 'payment' && 'Finalizar Pagamento'}
              </span>
            </div>
          </div>

          {/* Elegant Horizontal Progress Path */}
          <div className="hidden md:flex items-center gap-2">
            {[
              { id: 'customer', label: 'Cliente' },
              { id: 'products', label: 'Produtos' },
              { id: 'cart', label: 'Revisão' },
              { id: 'payment', label: 'Pagamento' }
            ].map((st, idx) => {
              const active = step === st.id;
              const completed = ['customer', 'products', 'cart', 'payment'].indexOf(step) > idx;
              return (
                <React.Fragment key={st.id}>
                  <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-white/5 relative bg-[#101010]">
                    <div className={`w-1.5 h-1.5 rounded-full ${active ? 'bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.5)]' : completed ? 'bg-zinc-500' : 'bg-white/10'}`} />
                    <span className={`text-[8px] font-black uppercase tracking-wider ${active ? 'text-white' : 'text-white/30'}`}>{st.label}</span>
                  </div>
                  {idx < 3 && <ChevronRight className="w-3 h-3 text-white/5" />}
                </React.Fragment>
              );
            })}
          </div>

          {/* Shopping Cart Header Trigger and Exit */}
          <div className="flex items-center gap-3">
            {step === 'products' && (
              <button
                onClick={() => setStep('cart')}
                className="relative bg-emerald-500 hover:bg-emerald-400 text-black px-4 py-2.5 rounded-xl uppercase font-black text-[9px] tracking-widest active:scale-95 transition-all flex items-center gap-2 cursor-pointer shadow-lg shadow-emerald-500/15"
              >
                <ShoppingCart className="w-3.5 h-3.5" />
                <span>Carrinho</span>
                {cart.length > 0 && (
                  <span className="bg-black text-emerald-400 text-[8px] font-black h-5 px-1.5 rounded-full flex items-center justify-center min-w-[20px]">
                    {cart.reduce((acc, i) => acc + i.quantity, 0)}
                  </span>
                )}
              </button>
            )}

            <button 
              onClick={() => setShowCancelModal(true)}
              className="text-[8px] font-mono bg-red-500/10 border border-red-500/20 px-3 py-1.5 rounded-lg uppercase font-black text-red-500 hover:bg-red-500/20 active:scale-95 transition-all cursor-pointer"
            >
              Cancelar Atendimento
            </button>
          </div>
        </header>
      )}

      {/* Main Content Area */}
      <main className="flex-1 md:overflow-hidden overflow-y-auto relative flex flex-col">
        <AnimatePresence mode="wait">

          {/* STEP 1: START SCREEN - VITRINE MODE */}
          {step === 'start' && !showStartOptions && (
            <motion.div 
              key="vitrine"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex-1 flex flex-col justify-between py-8 px-6 max-w-6xl mx-auto w-full relative select-none cursor-pointer"
              onClick={() => setShowStartOptions(true)}
            >
              {/* Decorative radial neon glow background */}
              <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,_rgba(16,185,129,0.03),_transparent_60%)] pointer-events-none" />

              {/* Dynamic Header: Brand identity */}
              <div className="flex flex-col items-center text-center mt-6 z-10 space-y-4">
                {company?.logo ? (
                  <img 
                    src={company.logo} 
                    alt={company.name || 'Store'} 
                    className="h-20 max-w-[280px] object-contain drop-shadow-[0_0_15px_rgba(255,255,255,0.05)]"
                    referrerPolicy="no-referrer"
                  />
                ) : (
                  <h1 className="text-4xl font-extrabold text-[#ffffff] tracking-wider uppercase font-mono drop-shadow-[0_0_20px_rgba(16,185,129,0.15)]">
                    {company?.name || 'NEXA STORE'}
                  </h1>
                )}
                {company?.slogan && (
                  <p className="text-[10px] font-mono uppercase tracking-[0.25em] text-zinc-500 font-bold max-w-md">
                    {company.slogan}
                  </p>
                )}
              </div>

              {/* Interactive Call to Action Block */}
              <div className="my-8 text-center z-10 space-y-3">
                <div className="inline-flex items-center gap-2.5 px-6 py-3 bg-emerald-500/10 border border-emerald-500/20 rounded-full animate-pulse shadow-[0_0_20px_rgba(16,185,129,0.05)]">
                  <div className="w-2.5 h-2.5 rounded-full bg-emerald-400 shadow-[0_0_8px_rgb(52,211,153)]" />
                  <span className="text-lg font-black text-white uppercase tracking-[0.15em] font-mono">
                    Toque para começar
                  </span>
                </div>
                <p className="text-xs text-zinc-400 font-medium uppercase tracking-wider max-w-lg mx-auto leading-relaxed">
                  Escolha seus produtos e finalize seu pedido no autoatendimento.
                </p>
              </div>

              {/* Products Showcase Vitrine */}
              <div className="flex-1 flex flex-col justify-center min-h-[320px] max-w-5xl mx-auto w-full z-10 my-4">
                {vitrineProductsToShow.length > 0 ? (
                  <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
                    {vitrineProductsToShow.map((p) => (
                      <div 
                        key={p.id}
                        className="bg-[#0c0c0c] border border-white/5 rounded-2xl p-3 flex flex-col justify-between h-[16rem] transition-all hover:border-emerald-500/30 shadow-[0_4px_12px_rgba(0,0,0,0.5)] group relative overflow-hidden"
                      >
                        {/* Background light gradient on hover */}
                        <div className="absolute inset-0 bg-gradient-to-t from-emerald-500/[0.01] to-transparent opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none" />

                        {/* Product Image or Custom Elegante Placeholder */}
                        <div className="h-28 bg-gradient-to-b from-[#121212] to-[#040404] rounded-xl border border-white/5 overflow-hidden flex items-center justify-center relative">
                          {p.image ? (
                            <img 
                              src={p.image} 
                              alt={p.name}
                              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                              referrerPolicy="no-referrer"
                            />
                          ) : (
                            <div className="w-10 h-10 rounded-full bg-emerald-500/5 border border-emerald-500/10 flex items-center justify-center text-emerald-400">
                              <span className="text-xs uppercase font-extrabold">{p.name.slice(0, 2)}</span>
                            </div>
                          )}

                          {/* Glowing Neon "Disponível" badge on Card */}
                          <div className="absolute bottom-2 right-2 px-1.5 py-0.5 rounded-full bg-emerald-950/60 border border-emerald-500/20 text-[6.5px] font-black uppercase tracking-wider text-emerald-400 flex items-center gap-1 shadow-md">
                            <span className="w-1 h-1 rounded-full bg-emerald-400 animate-ping" />
                            Disponível
                          </div>
                        </div>

                        {/* Text and Pricing metadata */}
                        <div className="space-y-1 my-2">
                          <span className="text-[11px] font-extrabold text-white line-clamp-1 uppercase leading-tight group-hover:text-emerald-400 transition-colors">
                            {p.name}
                          </span>
                          <span className="text-[7.5px] font-mono text-zinc-500 uppercase tracking-wider block">
                            {p.category || 'Geral'}
                          </span>
                        </div>

                        <div className="border-t border-white/5 pt-2 mt-auto flex items-center justify-between">
                          <span className="text-xs font-black text-emerald-400 font-mono tracking-wide">
                            R$ {p.price.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                          </span>
                          <span className="text-[7px] font-bold text-zinc-500 uppercase tracking-widest bg-white/5 px-1.5 py-0.5 rounded border border-white/5">
                            QTD: {p.stock}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  // Fallback sem produtos: Maintain center alignment and corporate logo style gracefully
                  <div className="text-center py-10 space-y-3">
                    <div className="mx-auto w-16 h-16 rounded-2xl bg-zinc-900 border border-white/5 flex items-center justify-center text-zinc-500">
                      <ShoppingBag className="w-6 h-6" />
                    </div>
                    <p className="text-xs text-zinc-500 uppercase tracking-widest font-mono">Nenhum produto cadastrado com estoque disponível no momento</p>
                  </div>
                )}
              </div>

              {/* Acceptable Payment Methods bottom visualizer */}
              <div className="mt-8 flex flex-col sm:flex-row items-center justify-between border-t border-white/5 pt-6 z-10 max-w-5xl mx-auto w-full">
                <div className="flex items-center gap-1.5 text-zinc-500 font-mono text-[8px] uppercase tracking-[0.2em] mb-4 sm:mb-0">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                  Terminal: {terminalId} • Lukasfe Systems Industrial Ltda
                </div>

                <div className="flex items-center gap-2 bg-[#080808] border border-white/5 px-4 py-2.5 rounded-2xl shadow-lg">
                  <span className="text-[8px] font-mono text-zinc-500 uppercase tracking-wider mr-2">Formas de Pagamento:</span>
                  {(hasPixConfig || hasCardConfig || hasMoneyConfig) ? (
                    <div className="flex items-center gap-2">
                      {hasPixConfig && (
                        <div className="flex items-center gap-1 bg-emerald-500/5 border border-emerald-500/15 px-2.5 py-1 rounded-lg text-[8px] font-black uppercase text-emerald-400 tracking-wider">
                          <QrCode className="w-3 h-3" /> Pix
                        </div>
                      )}
                      {hasCardConfig && (
                        <div className="flex items-center gap-1 bg-blue-500/5 border border-blue-500/15 px-2.5 py-1 rounded-lg text-[8px] font-black uppercase text-blue-400 tracking-wider">
                          <CreditCard className="w-3 h-3" /> Cartão
                        </div>
                      )}
                      {hasMoneyConfig && (
                        <div className="flex items-center gap-1 bg-amber-500/5 border border-amber-500/15 px-2.5 py-1 rounded-lg text-[8px] font-black uppercase text-amber-400 tracking-wider">
                          <Wallet className="w-3 h-3" /> Dinheiro
                        </div>
                      )}
                    </div>
                  ) : (
                    <span className="text-[8px] font-black uppercase tracking-wider text-zinc-400">
                      Pagamento Assistido pelo Operador
                    </span>
                  )}
                </div>
              </div>
            </motion.div>
          )}

          {/* STEP 1 (SELECTION STATE): CHOICE FOR CLIENT IDENTIFICATION / WALK-IN */}
          {step === 'start' && showStartOptions && (
            <motion.div 
              key="start"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex-1 flex flex-col justify-center items-center py-10 px-6 max-w-4xl mx-auto w-full relative"
            >
              <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,_rgba(16,185,129,0.03),_transparent_55%)] pointer-events-none" />
              
              <div className="text-center space-y-4 mb-12">
                <div className="mx-auto w-24 h-24 bg-emerald-500/10 border border-emerald-500/25 rounded-[2rem] flex items-center justify-center text-emerald-400 shadow-2xl">
                  {company?.logo ? (
                    <img 
                      src={company.logo} 
                      alt="Logo" 
                      className="w-14 h-14 object-contain"
                      referrerPolicy="no-referrer"
                    />
                  ) : (
                    <Tablet className="w-10 h-10 animate-bounce" />
                  )}
                </div>
                <div className="space-y-1">
                  <h1 className="text-2xl font-black text-white tracking-widest uppercase font-mono">{company?.name || 'Totem Autoatendimento'}</h1>
                  <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-[0.2em]">Encontre seus produtos, pague e retire na hora</p>
                </div>
              </div>

              {/* Mega Touch Buttons */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6 w-full max-w-4xl">
                
                {/* REGISTERED CLIENT BUTTON */}
                <button
                  onClick={() => {
                    setIsAnonymous(false);
                    setIsRegisteringClient(false);
                    setFocusedField('search');
                    setStep('customer');
                  }}
                  className="bg-[#0e0e0e] border border-white/5 hover:border-emerald-500/30 rounded-[2.5rem] p-6 text-left transition-all active:scale-98 cursor-pointer relative group flex flex-col justify-between h-72 overflow-hidden"
                >
                  <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,_rgba(52,211,153,0.02),_transparent_40%)] pointer-events-none" />
                  <div className="w-12 h-12 bg-emerald-500/10 border border-emerald-500/15 rounded-2xl flex items-center justify-center text-emerald-400 group-hover:scale-105 transition-transform">
                    <UserCheck className="w-5 h-5" />
                  </div>
                  <div className="space-y-1.5 mt-8 z-10">
                    <span className="text-[10px] font-mono font-black text-emerald-400 uppercase tracking-widest">Opção Identificada</span>
                    <h3 className="text-sm font-black text-white uppercase tracking-wider">Cliente Já Cadastrado</h3>
                    <p className="text-[9px] text-zinc-500 leading-normal uppercase">Insira seu CPF ou celular cadastrado para acumular pontos de fidelidade e acelerar sua compra.</p>
                  </div>
                </button>

                {/* NEW CLIENT BUTTON */}
                <button
                  onClick={() => {
                    setIsAnonymous(false);
                    setFocusedField('name');
                    setIsRegisteringClient(true);
                    setStep('customer');
                  }}
                  className="bg-[#0e0e0e] border border-white/5 hover:border-blue-500/30 rounded-[2.5rem] p-6 text-left transition-all active:scale-98 cursor-pointer relative group flex flex-col justify-between h-72 overflow-hidden"
                >
                  <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,_rgba(59,130,246,0.02),_transparent_40%)] pointer-events-none" />
                  <div className="w-12 h-12 bg-blue-500/10 border border-blue-500/15 rounded-2xl flex items-center justify-center text-blue-400 group-hover:scale-105 transition-transform">
                    <UserPlus className="w-5 h-5" />
                  </div>
                  <div className="space-y-1.5 mt-8 z-10">
                    <span className="text-[10px] font-mono font-black text-blue-400 uppercase tracking-widest">Nova Conta</span>
                    <h3 className="text-sm font-black text-white uppercase tracking-wider">Cliente Novo</h3>
                    <p className="text-[9px] text-zinc-500 leading-normal uppercase">Crie a sua ficha cadastral no totem em segundos apenas com nome completo, telefone e CPF opcional.</p>
                  </div>
                </button>

                {/* ANONYMOUS BUTTON */}
                <button
                  onClick={() => {
                    setIsAnonymous(true);
                    setSelectedClient(null);
                    setStep('products');
                  }}
                  className="bg-[#0e0e0e] border border-white/5 hover:border-white/15 rounded-[2.5rem] p-6 text-left transition-all active:scale-98 cursor-pointer relative group flex flex-col justify-between h-72 overflow-hidden"
                >
                  <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,_rgba(255,255,255,0.01),_transparent_40%)] pointer-events-none" />
                  <div className="w-12 h-12 bg-white/5 border border-white/5 rounded-2xl flex items-center justify-center text-white/50 group-hover:scale-105 transition-transform">
                    <ShoppingBag className="w-5 h-5" />
                  </div>
                  <div className="space-y-1.5 mt-8 z-10">
                    <span className="text-[10px] font-mono font-black text-zinc-500 uppercase tracking-widest">Compra sem Registro</span>
                    <h3 className="text-sm font-black text-white uppercase tracking-wider">Comprar Sem Cadastro</h3>
                    <p className="text-[9px] text-zinc-500 leading-normal uppercase">Prossiga diretamente para o catálogo de produtos e finalize sua compra com agilidade, sem preencher formulários.</p>
                  </div>
                </button>

              </div>

              {/* Floating Return Button to go back to beautiful Vitrine mode */}
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setShowStartOptions(false);
                }}
                className="mt-12 flex items-center gap-2 px-6 py-3 border border-white/5 bg-white/5 hover:bg-white/10 rounded-2xl text-[9px] font-black uppercase text-zinc-400 tracking-widest transition-all hover:text-white hover:border-white/15 active:scale-95 cursor-pointer shadow-lg"
              >
                <ArrowLeft className="w-4 h-4 text-emerald-400" />
                Voltar para a vitrine
              </button>

              <div className="mt-8 text-center">
                <span className="text-[8px] font-mono text-zinc-600 uppercase tracking-[0.3em]">Hardware Integrado • Lukasfe Systems Industrial Ltda</span>
              </div>
            </motion.div>
          )}

          {/* STEP 2: CUSTOMER IDENTIFICATION / REGISTER */}
          {step === 'customer' && (
            <motion.div 
              key="customer"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="flex-1 flex flex-col md:flex-row md:h-full md:overflow-hidden"
            >
              
              {/* Left Side: Forms Input */}
              <div className="flex-1 p-6 flex flex-col justify-center max-w-xl mx-auto w-full overflow-y-auto">
                <AnimatePresence mode="wait">
                  {!isRegisteringClient ? (
                    tempSelectedClient ? (
                      /* LOOKUP CONFIRMATION SCREEN */
                      <motion.div 
                        key="confirm-client"
                        initial={{ opacity: 0, scale: 0.95 }}
                        animate={{ opacity: 1, scale: 1 }}
                        className="space-y-6 text-center border border-white/5 bg-[#0e0e0e] rounded-[2.5rem] p-8"
                      >
                        <div className="w-16 h-16 bg-emerald-500/10 border border-emerald-500/25 rounded-3xl flex items-center justify-center text-emerald-400 mx-auto">
                          <UserCheck className="w-8 h-8" />
                        </div>
                        <div className="space-y-2">
                          <span className="text-[8px] font-mono text-emerald-400 tracking-widest uppercase block animate-pulse">Cadastro Localizado</span>
                          <h2 className="text-xl font-black text-white uppercase tracking-tight">Confirmar Identificação</h2>
                          <p className="text-base font-bold text-white uppercase tracking-wide bg-white/5 py-4 px-3 rounded-2xl border border-white/5">
                            {tempSelectedClient.name}
                          </p>
                          <div className="flex justify-center gap-4 text-[9px] text-zinc-500 font-mono uppercase">
                            {tempSelectedClient.document && <span>CPF: {tempSelectedClient.document}</span>}
                            {tempSelectedClient.phone && <span>Tel: {tempSelectedClient.phone}</span>}
                          </div>
                        </div>

                        <div className="flex gap-4 pt-4 shrink-0">
                          <button
                            onClick={() => {
                              setTempSelectedClient(null);
                            }}
                            className="flex-1 py-4 bg-zinc-900 border border-zinc-800 text-zinc-400 hover:text-white rounded-2xl text-[9px] font-black uppercase tracking-widest transition-all active:scale-95 cursor-pointer text-center"
                          >
                            Não Sou Eu
                          </button>
                          <button
                            onClick={() => {
                              setSelectedClient(tempSelectedClient);
                              setIsAnonymous(false);
                              setTempSelectedClient(null);
                              setStep('products');
                            }}
                            className="flex-1 py-4 bg-emerald-500 hover:bg-emerald-400 text-black rounded-2xl text-[9px] font-black uppercase tracking-widest transition-all hover:shadow-[0_0_15px_rgba(16,185,129,0.3)] active:scale-95 cursor-pointer text-center"
                          >
                            Sim, Sou Eu!
                          </button>
                        </div>
                      </motion.div>
                    ) : (
                      
                      /* LOOKUP FORM */
                      <motion.div 
                        key="lookup"
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -10 }}
                        className="space-y-6"
                      >
                      <div className="space-y-1">
                        <span className="text-[8px] font-mono text-emerald-400 tracking-widest uppercase">Pesquisa de Cadastro</span>
                        <h2 className="text-lg font-black text-white uppercase tracking-wider">Como deseja se identificar?</h2>
                        <p className="text-[9px] text-zinc-500 uppercase">Insira CPF, telefone ou o seu nome completo para buscar seu registro.</p>
                      </div>

                      {/* Search box trigger */}
                      <div className="relative">
                        <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-white/30 w-4 h-4" />
                        <input 
                          type="text"
                          placeholder="Digite CPF, Telefone ou seu Nome..."
                          value={clientSearchQuery}
                          onChange={(e) => setClientSearchQuery(e.target.value)}
                          onFocus={() => setFocusedField('search')}
                          onClick={() => setFocusedField('search')}
                          className={`w-full bg-[#101010]/90 border rounded-2xl py-4 pl-12 pr-4 text-xs text-white placeholder:text-white/25 outline-none transition-all shadow-inner ${
                            focusedField === 'search'
                              ? 'border-emerald-500 shadow-[0_0_12px_rgba(16,185,129,0.2)] ring-1 ring-emerald-500/25 bg-[#121212]'
                              : 'border-white/5 opacity-90'
                          }`}
                        />
                      </div>

                      {/* Display Results list */}
                      <div className="space-y-2 h-44 overflow-y-auto custom-scrollbar pr-1">
                        {clientSearchQuery.trim() === '' ? (
                          <div className="h-full border border-dashed border-white/5 rounded-2xl flex flex-col items-center justify-center p-4">
                            <Users className="w-8 h-8 text-white/10 mb-1.5" />
                            <span className="text-[8px] text-zinc-600 uppercase font-mono tracking-widest">Aguardando digitação...</span>
                          </div>
                        ) : filteredClients.length === 0 ? (
                          <div className="h-full border border-dashed border-[#ff4444]/10 bg-[#ff4444]/2 rounded-2xl flex flex-col items-center justify-center p-4 text-center space-y-2">
                            <AlertTriangle className="w-6 h-6 text-[#ff4444]/50" />
                            <div>
                              <p className="text-[9px] text-zinc-400 uppercase font-bold">Nenhum cadastro localizado</p>
                              <p className="text-[8px] text-zinc-600 uppercase">Tente digitar novamente ou faça um cadastro rápido abaixo.</p>
                            </div>
                          </div>
                        ) : (
                          filteredClients.map(c => (
                            <button
                              key={c.id}
                              onClick={() => {
                                setSelectedClient(c);
                                setIsAnonymous(false);
                                setStep('products');
                              }}
                              className="w-full bg-[#121212] border border-white/5 rounded-xl p-3 flex items-center justify-between text-left hover:border-emerald-500/30 active:scale-99 transition-all cursor-pointer"
                            >
                              <div className="space-y-0.5">
                                <span className="text-[10px] uppercase font-black text-white block">{c.name}</span>
                                <div className="flex gap-3 text-[8px] text-zinc-500 font-mono">
                                  {c.document && <span>CPF: {c.document}</span>}
                                  {c.phone && <span>TEL: {c.phone}</span>}
                                </div>
                              </div>
                              <div className="w-6 h-6 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 rounded-lg flex items-center justify-center text-[10px]">
                                <UserCheck className="w-3.5 h-3.5" />
                              </div>
                            </button>
                          ))
                        )}
                      </div>

                      {/* Quick Options Bottom */}
                      <div className="flex gap-4 pt-2">
                        <button
                          onClick={() => {
                            setFocusedField('name');
                            setIsRegisteringClient(true);
                          }}
                          className="flex-1 bg-white/5 hover:bg-white/10 border border-white/5 py-3.5 rounded-xl text-[9px] font-black uppercase tracking-widest text-[#eeeeee] transition-all flex items-center justify-center gap-2 active:scale-95 cursor-pointer"
                        >
                          <UserPlus className="w-3.5 h-3.5" />
                          Quero Me Cadastrar
                        </button>
                        <button
                          onClick={() => {
                            setIsAnonymous(true);
                            setSelectedClient(null);
                            setStep('products');
                          }}
                          className="flex-1 bg-zinc-900 border border-zinc-800 hover:border-zinc-700 py-3.5 rounded-xl text-[9px] font-black uppercase tracking-widest text-zinc-400 transition-all active:scale-95 cursor-pointer"
                        >
                          Pular Cadastro
                        </button>
                      </div>

                    </motion.div>
                    )
                  ) : (
                    
                    /* REGISTRATION FORM */
                    <motion.div 
                      key="register"
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -10 }}
                      className="space-y-5"
                    >
                      <div className="space-y-1">
                        <span className="text-[8px] font-mono text-emerald-400 tracking-widest uppercase">Nova Ficha Cadastral</span>
                        <h2 className="text-lg font-black text-white uppercase tracking-wider">Cadastro Super Rápido</h2>
                        <p className="text-[9px] text-zinc-500 uppercase">Preencha apenas o básico para criar sua conta no totem e prosseguir.</p>
                      </div>

                      <div className="space-y-3.5">
                        <div className="space-y-1 block" id="reg-name-container">
                          <label className="text-[8px] font-mono uppercase text-zinc-500 tracking-wider block">Nome Completo</label>
                          <input 
                            type="text"
                            placeholder="Seu nome aqui..."
                            value={newClientName}
                            onChange={(e) => setNewClientName(e.target.value)}
                            onFocus={() => setFocusedField('name')}
                            onClick={() => setFocusedField('name')}
                            className={`w-full bg-[#101010]/95 border rounded-xl py-3 px-4 text-xs text-white placeholder:text-white/15 outline-none transition-all ${
                              focusedField === 'name' 
                                ? 'border-emerald-500 shadow-[0_0_12px_rgba(16,185,129,0.2)] ring-1 ring-emerald-500/25 bg-[#121212]'
                                : 'border-white/5 opacity-80'
                            }`}
                            readOnly
                          />
                        </div>

                        <div className="space-y-1">
                          <label className="text-[8px] font-mono uppercase text-zinc-500 tracking-wider block">Celular / WhatsApp</label>
                          <input 
                            type="text"
                            placeholder="(00) 00000-0000"
                            value={newClientPhone}
                            onChange={(e) => setNewClientPhone(e.target.value)}
                            onFocus={() => setFocusedField('phone')}
                            onClick={() => setFocusedField('phone')}
                            className={`w-full bg-[#101010]/95 border rounded-xl py-3 px-4 text-xs text-white placeholder:text-white/15 outline-none transition-all ${
                              focusedField === 'phone'
                                ? 'border-emerald-500 shadow-[0_0_12px_rgba(16,185,129,0.2)] ring-1 ring-emerald-500/25 bg-[#121212]'
                                : 'border-white/5 opacity-80'
                            }`}
                            readOnly
                          />
                        </div>

                        <div className="space-y-1">
                          <label className="text-[8px] font-mono uppercase text-zinc-500 tracking-wider block">CPF (Fidelidade / Nota)</label>
                          <input 
                            type="text"
                            placeholder="000.000.000-00"
                            value={newClientDocument}
                            onChange={(e) => setNewClientDocument(e.target.value)}
                            onFocus={() => setFocusedField('document')}
                            onClick={() => setFocusedField('document')}
                            className={`w-full bg-[#101010]/95 border rounded-xl py-3 px-4 text-xs text-white placeholder:text-white/15 outline-none transition-all ${
                              focusedField === 'document'
                                ? 'border-emerald-500 shadow-[0_0_12px_rgba(16,185,129,0.2)] ring-1 ring-emerald-500/25 bg-[#121212]'
                                : 'border-white/5 opacity-80'
                            }`}
                            readOnly
                          />
                        </div>
                      </div>

                      <div className="flex gap-4 pt-3">
                        <button
                          onClick={() => {
                            setIsRegisteringClient(false);
                            setFocusedField('search');
                          }}
                          className="flex-1 py-3.5 bg-zinc-900 border border-zinc-800 text-zinc-500 hover:text-white rounded-xl text-[9px] font-black uppercase tracking-widest transition-all active:scale-95 cursor-pointer text-center"
                        >
                          Voltar para Pesquisa
                        </button>
                        <button
                          onClick={handleQuickClientRegister}
                          className="flex-1 py-3.5 bg-emerald-500 hover:bg-emerald-400 text-black rounded-xl text-[9px] font-black uppercase tracking-widest transition-all hover:shadow-[0_0_15px_rgba(16,185,129,0.3)] active:scale-95 cursor-pointer text-center"
                        >
                          Salvar e Iniciar
                        </button>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              {/* Right Side: Virtual Digital Tactile Keypad */}
              <div 
                onMouseDown={(e) => e.preventDefault()}
                className="flex-1 bg-[#0c0c0c] border-l md:border-t-0 border-t border-white/5 p-6 flex flex-col justify-center items-center"
              >
                <span className="text-[8px] font-mono text-zinc-500 tracking-widest uppercase mb-4">
                  Teclado Digital {keyboardMode === 'numeric' ? '(Numérico)' : keyboardMode === 'alpha' ? '(Letras)' : '(Símbolos)'}
                </span>

                {/* Smartphone Keyboard Mode Switcher Bar */}
                <div className="flex w-full gap-2 mb-4 max-w-[280px]" id="keyboard-mode-tabs-container">
                  <button
                    onClick={() => setKeyboardMode('numeric')}
                    className={`flex-1 py-3 text-[10px] font-black rounded-xl tracking-wider transition-all cursor-pointer border ${
                      keyboardMode === 'numeric'
                        ? 'bg-emerald-500 border-emerald-500 text-black shadow-lg shadow-emerald-500/10'
                        : 'bg-zinc-900/50 border-white/5 text-zinc-400 hover:text-white'
                    }`}
                  >
                    123
                  </button>
                  <button
                    onClick={() => setKeyboardMode('alpha')}
                    className={`flex-1 py-3 text-[10px] font-black rounded-xl tracking-wider transition-all cursor-pointer border ${
                      keyboardMode === 'alpha'
                        ? 'bg-emerald-500 border-emerald-500 text-black shadow-lg shadow-emerald-500/10'
                        : 'bg-zinc-900/50 border-white/5 text-zinc-400 hover:text-white'
                    }`}
                  >
                    ABC
                  </button>
                  <button
                    onClick={() => setKeyboardMode('symbols')}
                    className={`flex-1 py-3 text-[10px] font-black rounded-xl tracking-wider transition-all cursor-pointer border ${
                      keyboardMode === 'symbols'
                        ? 'bg-emerald-500 border-emerald-500 text-black shadow-lg shadow-emerald-500/10'
                        : 'bg-zinc-900/50 border-white/5 text-zinc-400 hover:text-white'
                    }`}
                  >
                    #+=
                  </button>
                </div>

                {/* Keyboard Grid Renderers */}
                {keyboardMode === 'numeric' && (
                  <div className="w-full max-w-[280px] grid grid-cols-3 gap-3" id="kiosk-numeric-grid">
                    {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map(val => (
                      <button
                        key={val}
                        onClick={() => handleKeypadPress(val)}
                        disabled={!focusedField}
                        className="h-14 bg-[#121212] active:bg-[#181818] border border-white/5 text-sm font-black rounded-2xl flex items-center justify-center text-white active:scale-95 disabled:opacity-30 disabled:pointer-events-none transition-all cursor-pointer shadow-md"
                      >
                        {val}
                      </button>
                    ))}
                    
                    {/* Control row */}
                    <button
                      onClick={handleKeypadClear}
                      disabled={!focusedField}
                      className="h-14 bg-red-500/10 active:bg-red-500/20 border border-red-500/20 text-[9px] font-black rounded-2xl flex items-center justify-center text-red-500 active:scale-95 disabled:opacity-30 disabled:pointer-events-none transition-all cursor-pointer font-mono"
                    >
                      LIMPAR
                    </button>

                    <button
                      onClick={() => handleKeypadPress('0')}
                      disabled={!focusedField}
                      className="h-14 bg-[#121212] active:bg-[#181818] border border-white/5 text-sm font-black rounded-2xl flex items-center justify-center text-white active:scale-95 disabled:opacity-30 disabled:pointer-events-none transition-all cursor-pointer shadow-md"
                    >
                      0
                    </button>

                    <button
                      onClick={handleKeypadBackspace}
                      disabled={!focusedField}
                      className="h-14 bg-amber-500/10 active:bg-amber-500/20 border border-amber-500/20 text-[9px] font-black rounded-2xl flex items-center justify-center text-amber-500 active:scale-95 disabled:opacity-30 disabled:pointer-events-none transition-all cursor-pointer font-mono"
                    >
                      VOLTAR
                    </button>

                    {/* Compact Confirm button inside numeric panel */}
                    <button
                      onClick={handleKeypadConfirm}
                      disabled={!focusedField}
                      className="col-span-3 h-12 bg-emerald-500 hover:bg-emerald-400 active:bg-emerald-600 text-black text-[10px] font-black rounded-xl flex items-center justify-center tracking-widest uppercase transition-all duration-205 active:scale-95 disabled:opacity-30 disabled:pointer-events-none cursor-pointer mt-1"
                    >
                      CONFIRMAR
                    </button>
                  </div>
                )}

                {keyboardMode === 'alpha' && (
                  <div className="w-full max-w-[420px] flex flex-col gap-2" id="kiosk-alpha-grid">
                    <div className="flex justify-center gap-1.5">
                      {['Q', 'W', 'E', 'R', 'T', 'Y', 'U', 'I', 'O', 'P'].map(key => (
                        <button
                          key={key}
                          onClick={() => handleKeypadPress(key)}
                          disabled={!focusedField}
                          className="flex-1 min-w-[28px] h-12 md:h-14 bg-[#121212] active:bg-[#181818] border border-white/5 text-xs font-bold rounded-xl flex items-center justify-center text-white active:scale-95 disabled:opacity-30 disabled:pointer-events-none transition-all cursor-pointer shadow-md"
                        >
                          {key}
                        </button>
                      ))}
                    </div>

                    <div className="flex justify-center gap-1.5">
                      {['A', 'S', 'D', 'F', 'G', 'H', 'J', 'K', 'L', 'Ç'].map(key => (
                        <button
                          key={key}
                          onClick={() => handleKeypadPress(key)}
                          disabled={!focusedField}
                          className="flex-1 min-w-[28px] h-12 md:h-14 bg-[#121212] active:bg-[#181818] border border-white/5 text-xs font-bold rounded-xl flex items-center justify-center text-white active:scale-95 disabled:opacity-30 disabled:pointer-events-none transition-all cursor-pointer shadow-md"
                        >
                          {key}
                        </button>
                      ))}
                    </div>

                    <div className="flex justify-center gap-1.5">
                      {['Z', 'X', 'C', 'V', 'B', 'N', 'M', ',', '.', '_'].map(key => (
                        <button
                          key={key}
                          onClick={() => handleKeypadPress(key)}
                          disabled={!focusedField}
                          className="flex-1 min-w-[28px] h-12 md:h-14 bg-[#121212] active:bg-[#181818] border border-white/5 text-xs font-bold rounded-xl flex items-center justify-center text-white active:scale-95 disabled:opacity-30 disabled:pointer-events-none transition-all cursor-pointer shadow-md"
                        >
                          {key}
                        </button>
                      ))}
                    </div>

                    <div className="flex justify-center gap-1.5 mt-1">
                      <button
                        onClick={() => handleKeypadPress(' ')}
                        disabled={!focusedField}
                        className="flex-[3.5] h-12 md:h-14 bg-[#161616] active:bg-[#202020] border border-white/5 text-[9px] font-black uppercase rounded-xl flex items-center justify-center text-zinc-400 active:scale-95 disabled:opacity-30 disabled:pointer-events-none transition-all cursor-pointer shadow-sm"
                      >
                        ESPAÇO
                      </button>
                      <button
                        onClick={handleKeypadBackspace}
                        disabled={!focusedField}
                        className="flex-[1.5] h-12 md:h-14 bg-amber-500/10 active:bg-amber-500/20 border border-amber-500/20 text-[9px] font-black uppercase rounded-xl flex items-center justify-center text-amber-500 active:scale-95 disabled:opacity-30 disabled:pointer-events-none transition-all cursor-pointer shadow-sm"
                      >
                        APAGAR
                      </button>
                      <button
                        onClick={handleKeypadClear}
                        disabled={!focusedField}
                        className="flex-[1.5] h-12 md:h-14 bg-red-500/10 active:bg-red-500/20 border border-red-500/20 text-[9px] font-black uppercase rounded-xl flex items-center justify-center text-red-500 active:scale-95 disabled:opacity-30 disabled:pointer-events-none transition-all cursor-pointer shadow-sm"
                      >
                        LIMPAR
                      </button>
                    </div>

                    <button
                      onClick={handleKeypadConfirm}
                      disabled={!focusedField}
                      className="w-full h-12 bg-emerald-500 hover:bg-emerald-400 active:bg-emerald-600 text-black text-[10px] font-black rounded-xl flex items-center justify-center tracking-widest uppercase transition-all duration-205 active:scale-95 disabled:opacity-30 disabled:pointer-events-none cursor-pointer mt-1"
                    >
                      CONFIRMAR
                    </button>
                  </div>
                )}

                {keyboardMode === 'symbols' && (
                  <div className="w-full max-w-[420px] flex flex-col gap-2" id="kiosk-symbols-grid">
                    <div className="flex justify-center gap-1.5">
                      {['@', '.', '-', '_', '/', '+', '&', '*', '(', ')'].map(key => (
                        <button
                          key={key}
                          onClick={() => handleKeypadPress(key)}
                          disabled={!focusedField}
                          className="flex-1 min-w-[28px] h-12 md:h-14 bg-[#121212] active:bg-[#181818] border border-white/5 text-xs font-bold rounded-xl flex items-center justify-center text-white active:scale-95 disabled:opacity-30 disabled:pointer-events-none transition-all cursor-pointer shadow-md"
                        >
                          {key}
                        </button>
                      ))}
                    </div>

                    <div className="flex justify-center gap-1.5">
                      {['!', '?', '[', ']', '{', '}', '=', '<', '>', '%'].map(key => (
                        <button
                          key={key}
                          onClick={() => handleKeypadPress(key)}
                          disabled={!focusedField}
                          className="flex-1 min-w-[28px] h-12 md:h-14 bg-[#121212] active:bg-[#181818] border border-white/5 text-xs font-bold rounded-xl flex items-center justify-center text-white active:scale-95 disabled:opacity-30 disabled:pointer-events-none transition-all cursor-pointer shadow-md"
                        >
                          {key}
                        </button>
                      ))}
                    </div>

                    <div className="flex justify-center gap-1.5">
                      {['#', '$', '"', '\'', ':', ';', '\\', '|', '~', '^'].map(key => (
                        <button
                          key={key}
                          onClick={() => handleKeypadPress(key)}
                          disabled={!focusedField}
                          className="flex-1 min-w-[28px] h-12 md:h-14 bg-[#121212] active:bg-[#181818] border border-white/5 text-xs font-bold rounded-xl flex items-center justify-center text-white active:scale-95 disabled:opacity-30 disabled:pointer-events-none transition-all cursor-pointer shadow-md"
                        >
                          {key}
                        </button>
                      ))}
                    </div>

                    <div className="flex justify-center gap-1.5 mt-1">
                      <button
                        onClick={() => handleKeypadPress(' ')}
                        disabled={!focusedField}
                        className="flex-[3.5] h-12 md:h-14 bg-[#161616] active:bg-[#202020] border border-white/5 text-[9px] font-black uppercase rounded-xl flex items-center justify-center text-zinc-400 active:scale-95 disabled:opacity-30 disabled:pointer-events-none transition-all cursor-pointer shadow-sm"
                      >
                        ESPAÇO
                      </button>
                      <button
                        onClick={handleKeypadBackspace}
                        disabled={!focusedField}
                        className="flex-[1.5] h-12 md:h-14 bg-amber-500/10 active:bg-amber-500/20 border border-amber-500/20 text-[9px] font-black uppercase rounded-xl flex items-center justify-center text-amber-500 active:scale-95 disabled:opacity-30 disabled:pointer-events-none transition-all cursor-pointer shadow-sm"
                      >
                        APAGAR
                      </button>
                      <button
                        onClick={handleKeypadClear}
                        disabled={!focusedField}
                        className="flex-[1.5] h-12 md:h-14 bg-red-500/10 active:bg-red-500/20 border border-red-500/20 text-[9px] font-black uppercase rounded-xl flex items-center justify-center text-red-500 active:scale-95 disabled:opacity-30 disabled:pointer-events-none transition-all cursor-pointer shadow-sm"
                      >
                        LIMPAR
                      </button>
                    </div>

                    <button
                      onClick={handleKeypadConfirm}
                      disabled={!focusedField}
                      className="w-full h-12 bg-emerald-500 hover:bg-emerald-400 active:bg-emerald-600 text-black text-[10px] font-black rounded-xl flex items-center justify-center tracking-widest uppercase transition-all duration-205 active:scale-95 disabled:opacity-30 disabled:pointer-events-none cursor-pointer mt-1"
                    >
                      CONFIRMAR
                    </button>
                  </div>
                )}

                {!focusedField && (
                  <p className="text-[8px] text-zinc-500 uppercase mt-4 text-center font-bold tracking-wide">
                    Clique em um campo acima para ativar o teclado.
                  </p>
                )}
              </div>

            </motion.div>
          )}

          {/* STEP 3: PRODUCT SELECTION GRID */}
          {step === 'products' && (
            <motion.div 
              key="products"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex-1 flex flex-col md:flex-row md:h-full md:overflow-hidden"
            >
              
              {/* Left Column: Category Filters & Product Grid */}
              <div className="flex-1 flex flex-col md:overflow-hidden p-6 gap-4">
                
                {/* Search Box */}
                <div className="relative shrink-0 w-full max-w-xl">
                  <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-white/30 w-3.5 h-3.5" />
                  <input 
                    type="text" 
                    placeholder="Pesquisar por nome, SKU, categoria..."
                    value={productSearch}
                    onChange={(e) => setProductSearch(e.target.value)}
                    className="w-full bg-[#101010] border border-white/5 focus:border-emerald-500/40 rounded-xl py-3 pl-11 pr-4 text-[10px] text-white outline-none transition-all shadow-inner"
                  />
                  {productSearch && (
                    <button 
                      onClick={() => setProductSearch('')}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-white/30 hover:text-white"
                    >
                      <XIcon className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>

                {/* Categories Tab Row */}
                <div className="flex items-center gap-2 overflow-x-auto custom-scrollbar shrink-0 pb-1">
                  <button
                    onClick={() => setSelectedCategory('all')}
                    className={`px-4 py-2.5 rounded-full text-[8px] font-black uppercase tracking-wider shrink-0 border transition-all active:scale-95 cursor-pointer ${selectedCategory === 'all' ? 'bg-emerald-500 border-emerald-500 text-black shadow-lg shadow-emerald-500/10' : 'bg-[#101010] border-white/5 text-white/50 hover:text-white'}`}
                  >
                    Todos
                  </button>
                  {productCategories.map(cat => (
                    <button
                      key={cat}
                      onClick={() => setSelectedCategory(cat)}
                      className={`px-4 py-2.5 rounded-full text-[8px] font-black uppercase tracking-wider shrink-0 border transition-all active:scale-95 cursor-pointer ${selectedCategory === cat ? 'bg-emerald-500 border-emerald-500 text-black shadow-lg shadow-emerald-500/10' : 'bg-[#101010] border-white/5 text-white/50 hover:text-white'}`}
                    >
                      {cat}
                    </button>
                  ))}
                </div>

                {/* Visual Grid */}
                <div className="flex-1 overflow-y-auto custom-scrollbar pr-1">
                  {filteredProducts.length === 0 ? (
                    <div className="h-full flex flex-col items-center justify-center p-10 border border-dashed border-white/5 rounded-[2rem]">
                      <ShoppingBag className="w-12 h-12 text-white/10 mb-2" />
                      <span className="text-[10px] font-black uppercase text-zinc-500 tracking-widest">Nenhum produto localizado...</span>
                    </div>
                  ) : (
                    <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 pb-6">
                      {filteredProducts.map(p => {
                        const inCartCount = cart.find(i => i.id === p.id)?.quantity || 0;
                        const hasStock = p.stock > 0;
                        
                        return (
                          <div 
                            key={p.id}
                            onClick={() => {
                              if (hasStock) {
                                setSelectedProductDetails(p);
                                setModalQuantity(1);
                                const cat = p.category?.toLowerCase() || '';
                                if (cat.includes('cerveja') || cat.includes('chope') || cat.includes('refrigerante') || cat.includes('suco') || cat.includes('refri') || cat.includes('bebida')) {
                                  setSelectedSabor('Normal');
                                } else if (cat.includes('pizza') || cat.includes('pastel') || cat.includes('doce') || cat.includes('café') || cat.includes('hambú')) {
                                  setSelectedSabor('Tradicional');
                                } else {
                                  setSelectedSabor('Padrão');
                                }
                              }
                            }}
                            className={`bg-[#0e0e0e] border rounded-2xl p-3 relative flex flex-col justify-between h-[20rem] transition-all shadow-lg ${hasStock ? 'border-white/5 hover:border-white/15 active:scale-98 cursor-pointer' : 'border-red-500/10 opacity-50'}`}
                          >
                            
                            {/* Product Visual Container */}
                            <div className="space-y-3">
                              {/* Glowing product representation */}
                              <div className="h-44 bg-gradient-to-br from-zinc-900 to-black rounded-xl border border-white/5 overflow-hidden flex items-center justify-center relative">
                                {p.image ? (
                                  <img 
                                    src={p.image} 
                                    alt={p.name}
                                    className="w-full h-full object-cover"
                                    referrerPolicy="no-referrer"
                                  />
                                ) : (
                                  <div className="w-14 h-14 rounded-full bg-emerald-500/5 border border-emerald-500/10 flex items-center justify-center text-emerald-400">
                                    <span className="text-sm uppercase font-extrabold">{p.name.slice(0,2)}</span>
                                  </div>
                                )}

                                {/* Stock Tracker Badge */}
                                <div className="absolute top-2 right-2 px-1.5 py-0.5 rounded bg-black/60 border border-white/5 text-[6.5px] font-mono tracking-wider font-extrabold text-white/60">
                                  QTD: {p.stock}
                                </div>

                                {/* Active Cart Indicator */}
                                {inCartCount > 0 && (
                                  <div className="absolute top-2 left-2 w-5 h-5 rounded-full bg-emerald-500 text-black text-[9px] font-black flex items-center justify-center animate-pulse">
                                    {inCartCount}
                                  </div>
                                )}
                              </div>

                              {/* Title / Name details */}
                              <div className="space-y-1">
                                <span className="text-[7.5px] font-mono text-zinc-500 uppercase tracking-widest block">{p.code}</span>
                                <span className="text-[11px] font-extrabold text-white line-clamp-2 uppercase leading-tight">{p.name}</span>
                              </div>
                            </div>

                            {/* Price Bottom Row */}
                            <div className="flex items-center justify-between border-t border-white/5 pt-2 mt-2">
                              <span className="text-[12px] font-black text-emerald-400 font-mono">
                                R$ {p.price.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                              </span>
                              
                              {hasStock ? (
                                <div className="w-6 h-6 border border-white/5 bg-white/5 rounded-lg flex items-center justify-center text-white/55 hover:bg-white/10">
                                  <Plus className="w-3.5 h-3.5" />
                                </div>
                              ) : (
                                <span className="text-[6.5px] font-extrabold uppercase text-red-500 bg-red-500/10 border border-red-500/20 px-1 py-0.5 rounded">
                                  FORA
                                </span>
                              )}
                            </div>

                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

              </div>

              {/* Right Side: Instant floating bar cart summary */}
              <div className="w-full md:w-80 bg-[#0c0c0c] border-t md:border-t-0 md:border-l border-white/5 p-6 flex flex-col justify-between shrink-0">
                <div className="space-y-4 flex-1 flex flex-col md:overflow-hidden">
                  
                  <div className="flex items-center justify-between border-b border-white/5 pb-3">
                    <div className="flex items-center gap-2">
                      <ShoppingCart className="w-4 h-4 text-emerald-400" />
                      <span className="text-[11px] font-black uppercase tracking-wider">Cesta de Compras</span>
                    </div>
                    <span className="text-[8px] font-mono bg-white/5 border border-white/5 px-2 py-0.5 rounded text-white/50">
                      {cart.length} itens
                    </span>
                  </div>

                  {/* Cart small scroller */}
                  <div className="flex-1 overflow-y-auto max-h-60 md:max-h-none custom-scrollbar pr-1 space-y-2.5">
                    {cart.length === 0 ? (
                      <div className="h-full flex flex-col items-center justify-center py-10 text-center opacity-60">
                        <ShoppingBag className="w-10 h-10 text-white/10 mb-1" />
                        <span className="text-[8px] font-mono text-zinc-650 uppercase tracking-widest block">Seu carrinho está limpo</span>
                        <span className="text-[7.5px] text-zinc-600 uppercase">Toque em algum item ao lado</span>
                      </div>
                    ) : (
                      cart.map(item => (
                        <div 
                          key={item.id + (item.selectedVariationId ? '-' + item.selectedVariationId : '')}
                          className="bg-[#121212] border border-white/5 rounded-xl p-2.5 flex items-center justify-between gap-2"
                        >
                          <div className="flex-1 min-w-0">
                            <span className="text-[9px] font-black text-white uppercase block truncate">{item.name}</span>
                            <span className="text-[8px] font-mono text-emerald-400 block mt-0.5">
                              R$ {item.price.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                            </span>
                          </div>

                          {/* Minimized Touch Controls */}
                          <div className="flex items-center gap-1 shrink-0 scale-90">
                            <button 
                              onClick={() => {
                                if (item.quantity === 1) removeFromCart(item.id, item.selectedVariationId);
                                else updateQuantity(item.id, -1, item.selectedVariationId);
                              }}
                              className="w-6 h-6 border border-white/5 bg-white/5 hover:bg-white/10 rounded-md flex items-center justify-center text-white/80 active:scale-95"
                            >
                              <Minus className="w-3 h-3" />
                            </button>
                            <span className="text-[10px] font-mono font-black text-white px-1.5 min-w-5 text-center">
                              {item.quantity}
                            </span>
                            <button 
                              onClick={() => updateQuantity(item.id, 1, item.selectedVariationId)}
                              className="w-6 h-6 border border-white/5 bg-white/5 hover:bg-white/10 rounded-md flex items-center justify-center text-white/80 active:scale-95"
                            >
                              <Plus className="w-3 h-3" />
                            </button>
                          </div>
                        </div>
                      ))
                    )}
                  </div>

                </div>

                {/* Subtotal review & action block at page footer */}
                <div className="border-t border-white/5 pt-4 space-y-3 shrink-0">
                  <div className="flex items-center justify-between text-[11px] uppercase font-bold text-zinc-400">
                    <span>Subtotal</span>
                    <span className="text-white font-mono font-black">
                      R$ {subtotal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                    </span>
                  </div>

                  <button
                    onClick={handleProceedToPayment}
                    disabled={cart.length === 0}
                    className="w-full py-4 bg-emerald-500 hover:bg-emerald-400 disabled:bg-zinc-800 disabled:text-zinc-650 disabled:border-transparent text-black text-[10px] font-black uppercase tracking-widest rounded-xl transition-all disabled:opacity-40 hover:shadow-[0_0_15px_rgba(16,185,129,0.3)] active:scale-97 flex items-center justify-center gap-2 cursor-pointer shadow-lg"
                  >
                    Prosseguir
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                </div>

              </div>

            </motion.div>
          )}

          {/* STEP 4: PAYMENT SCREEN */}
          {step === 'payment' && (
            <motion.div 
              key="payment"
              initial={{ opacity: 0, scale: 0.98 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.98 }}
              className="flex-1 flex flex-col md:flex-row max-w-4xl mx-auto w-full p-6 gap-6 justify-center items-center md:h-full md:overflow-hidden"
            >
              
              {/* Left Column: Choose Pay Method */}
              <div className="flex-1 space-y-5 w-full">
                <div className="space-y-1">
                  <span className="text-[8px] font-mono text-emerald-400 tracking-widest uppercase">Pagamento Registrado</span>
                  <h2 className="text-lg font-black text-white uppercase tracking-wider">Como deseja pagar?</h2>
                  <p className="text-[9px] text-zinc-500 uppercase">Selecione uma das opções homologadas no caixa deste terminal.</p>
                </div>

                {/* Pay Options Grid */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 max-h-[300px] overflow-y-auto custom-scrollbar pr-1">
                  {paymentMethods.filter(m => m.active && m.showInPDV).map(method => {
                    const selected = chosenMethod?.id === method.id;
                    
                    return (
                      <button
                        key={method.id}
                        onClick={() => {
                          setChosenMethod(method);
                          setCashDeposited(0);
                          setErrorMessage('');
                        }}
                        className={`p-5 rounded-2xl border text-left flex items-start gap-4 transition-all active:scale-98 cursor-pointer relative overflow-hidden ${selected ? 'bg-emerald-500/5 border-emerald-500 text-white' : 'bg-[#0e0e0e] border-white/5 hover:border-white/10 text-white/50 hover:text-white'}`}
                      >
                        <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${selected ? 'bg-emerald-500/10 text-emerald-400 animate-pulse' : 'bg-white/5 text-white/40'}`}>
                          {method.type === 'pix' && <QrCode className="w-5 h-5" />}
                          {method.type === 'money' && <Wallet className="w-5 h-5" />}
                          {method.type === 'card_debit' && <CreditCard className="w-5 h-5" />}
                          {method.type === 'card_credit' && <CreditCard className="w-5 h-5" />}
                          {method.type === 'other' && <Sparkles className="w-5 h-5" />}
                        </div>
                        <div className="space-y-1">
                          <span className="text-[10px] font-black uppercase tracking-wider block text-white">{method.name}</span>
                          <span className="text-[7.5px] font-mono uppercase text-zinc-500 block leading-none">Homologado via ERP</span>
                        </div>
                      </button>
                    );
                  })}
                </div>

                {errorMessage && (
                  <div className="p-3.5 bg-red-500/10 border border-red-500/20 text-red-500 rounded-xl text-[9.5px] font-extrabold uppercase flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 shrink-0" />
                    <span>{errorMessage}</span>
                  </div>
                )}
              </div>

              {/* Right Column: Interaction Terminal Overlay / Sum */}
              <div className="w-full md:w-96 bg-[#0c0c0c] border border-white/5 rounded-3xl p-6 flex flex-col justify-between shrink-0 h-[440px]">
                
                {/* Total Recap Header */}
                <div className="border-b border-white/5 pb-4 space-y-1">
                  <span className="text-[7.5px] font-mono text-zinc-500 tracking-widest uppercase">Valor da Compra</span>
                  <div className="text-2xl font-black text-emerald-400 font-mono tracking-tighter leading-none">
                    R$ {total.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                  </div>
                  {selectedClient && (
                    <div className="text-[8px] text-zinc-400 font-mono flex items-center gap-1 pt-1.5">
                      <UserCheck className="w-3 h-3 text-emerald-400" />
                      <span>{selectedClient.name.toUpperCase()}</span>
                    </div>
                  )}
                </div>

                {/* Simulated Payment Area */}
                <div className="flex-1 flex flex-col justify-center items-center py-4 text-center">
                  <AnimatePresence mode="wait">
                    {paymentStatus === 'cancelled' ? (
                      
                      /* CANCELLED STATE */
                      <motion.div 
                        key="cancelled"
                        initial={{ opacity: 0, scale: 0.95 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0 }}
                        className="space-y-4"
                      >
                        <div className="mx-auto w-14 h-14 bg-red-500/10 border border-red-500/20 text-red-400 rounded-3xl flex items-center justify-center animate-pulse shadow-2xl">
                          <AlertTriangle className="w-6 h-6 animate-pulse" />
                        </div>
                        <div className="space-y-2">
                          <h3 className="text-sm font-black text-white uppercase tracking-wider font-mono">Pagamento Não Confirmado</h3>
                          <p className="text-[10px] text-red-500 uppercase tracking-widest font-extrabold leading-none block">Chame um Atendente</p>
                          <p className="text-[8px] text-zinc-500 uppercase leading-normal">Seu pedido não foi gerado. Por favor, solicite auxílio no caixa principal.</p>
                        </div>
                      </motion.div>
                    ) : paymentStatus === 'waiting_cash' ? (
                      
                      /* WAITING CASH OPERATOR EXPLICIT CHECK */
                      <motion.div 
                        key="waiting_cash"
                        initial={{ opacity: 0, scale: 0.95 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0 }}
                        className="space-y-4"
                      >
                        <div className="mx-auto w-14 h-14 bg-amber-500/10 border border-amber-500/20 text-amber-500 rounded-3xl flex items-center justify-center animate-pulse">
                          <Wallet className="w-6 h-6 animate-bounce" />
                        </div>
                        <div className="space-y-1.5 max-w-[240px]">
                          <span className="text-[10px] font-black text-amber-400 uppercase tracking-widest block font-mono">Aguardando Operador</span>
                          <p className="text-[8.5px] text-zinc-400 uppercase leading-relaxed font-semibold">
                            Dirija-se ao operador do caixa para entregar o dinheiro e efetuar o pagamento.
                          </p>
                        </div>
                      </motion.div>
                    ) : paymentStatus === 'waiting_card' ? (
                      
                      /* WAITING CARD OPERATOR EXPLICIT CHECK */
                      <motion.div 
                        key="waiting_card"
                        initial={{ opacity: 0, scale: 0.95 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0 }}
                        className="space-y-4"
                      >
                        <div className="mx-auto w-14 h-14 bg-amber-500/10 border border-amber-500/20 text-amber-500 rounded-3xl flex items-center justify-center animate-pulse">
                          <Smartphone className="w-6 h-6 animate-bounce" />
                        </div>
                        <div className="space-y-1.5 max-w-[240px]">
                          <span className="text-[10px] font-black text-amber-400 uppercase tracking-widest block font-mono">Aproxime ou Insira o Cartão</span>
                          <p className="text-[8.5px] text-zinc-400 uppercase leading-relaxed font-semibold">
                            Efetue a transação na maquininha do terminal e aguarde o operador autorizar.
                          </p>
                        </div>
                      </motion.div>
                    ) : !chosenMethod ? (
                      
                      /* CHOOSE PROMPT */
                      <motion.div 
                        key="choose"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="space-y-2.5 opacity-60 flex flex-col items-center"
                      >
                        <CreditCard className="w-12 h-12 text-white/5" />
                        <p className="text-[9px] text-zinc-500 font-bold uppercase tracking-wide">Aguardando forma de pagamento</p>
                      </motion.div>
                    ) : paymentStatus === 'processing' ? (
                      
                      /* PROCESSING LOADER */
                      <motion.div 
                        key="processing"
                        initial={{ opacity: 0, scale: 0.95 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0 }}
                        className="space-y-4"
                      >
                        <div className="relative mx-auto w-14 h-14 bg-emerald-500/5 border border-emerald-500/20 rounded-2xl flex items-center justify-center text-emerald-400">
                          <RefreshCw className="w-6 h-6 animate-spin" />
                        </div>
                        <div className="space-y-1">
                          <span className="text-[9px] font-black text-emerald-400 uppercase tracking-widest block">Aguardando Aprovação</span>
                          <p className="text-[8px] text-zinc-500 uppercase leading-normal">Processando transação e registrando dados de venda...</p>
                        </div>
                      </motion.div>
                    ) : chosenMethod.type === 'money' ? (
                      
                      /* CASH BILLS SELECTOR PRIOR TO INITIATING CHECKOUT */
                      <motion.div 
                        key="cash"
                        className="space-y-4 w-full"
                      >
                        <span className="text-[8px] font-mono text-zinc-550 uppercase tracking-widest block">Insira o Dinheiro Recebido</span>
                        
                        <div className="grid grid-cols-2 gap-2">
                          {[total, Math.ceil(total / 10) * 10, Math.ceil(total / 20) * 20, Math.ceil(total / 50) * 50, Math.ceil(total / 100) * 100].map(v => {
                            if (v < total) return null;
                            return (
                              <button
                                key={v}
                                onClick={() => setCashDeposited(v)}
                                className={`py-2 px-3 border rounded-xl text-[10px] font-mono font-extrabold transition-all active:scale-95 cursor-pointer ${cashDeposited === v ? 'bg-emerald-500 text-black border-emerald-500' : 'bg-black/40 border-white/5 text-white'}`}
                              >
                                R$ {v.toFixed(2)}
                              </button>
                            );
                          })}
                        </div>
 
                        {cashDeposited >= total && (
                          <div className="bg-emerald-500/5 border border-emerald-500/10 rounded-2xl p-3 text-center space-y-0.5">
                            <span className="text-[8px] font-mono uppercase text-zinc-400 tracking-wider block">Troco Estimado</span>
                            <span className="text-base font-black text-emerald-400 font-mono block">R$ {changeAmount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                          </div>
                        )}
                      </motion.div>
                    ) : chosenMethod.type === 'pix' ? (
                      !hasPixKey ? (
                        <motion.div key="pix-error" className="space-y-4 flex flex-col items-center text-center p-6 bg-red-950/20 border border-red-500/20 rounded-2xl max-w-[280px] mx-auto animate-pulse">
                          <div className="w-12 h-12 rounded-full bg-red-500/10 flex items-center justify-center text-red-500">
                            <AlertCircle className="w-6 h-6 animate-pulse" />
                          </div>
                          <div className="space-y-1">
                            <span className="text-[10px] font-mono text-red-500 font-extrabold uppercase tracking-widest block">PIX Indisponível</span>
                            <span className="text-xs font-black text-white uppercase block tracking-wider leading-relaxed">Chave PIX não cadastrada.</span>
                            <span className="text-[9px] text-zinc-400 uppercase block font-bold leading-normal">Chame um atendente.</span>
                          </div>
                        </motion.div>
                      ) : (
                        /* QR CODE PIX SIMULATION */
                        <motion.div key="pix" className="space-y-4 flex flex-col items-center">
                          <div className={`p-3 bg-white rounded-2xl shadow-xl transition-all duration-500 ${paymentStatus === 'waiting_pix' ? "ring-4 ring-amber-500/50 animate-pulse" : "ring-1 ring-white/10"}`}>
                            <QRCodeSVG 
                              value={generatePixPayload(
                                chosenMethod.pixKey || company.pixKey || '00000000000100', 
                                total, 
                                company.pixReceiverName || company.name || 'Estabelecimento'
                              )} 
                              size={140} 
                            />
                          </div>
                          <div className="space-y-1 text-center max-w-[240px]">
                            <span className="text-[10px] font-black text-emerald-400 uppercase tracking-widest block truncate" title={chosenMethod.pixKey || company.pixKey}>Chave: {chosenMethod.pixKey || company.pixKey || 'Chave Não Configurada'}</span>
                            <span className="text-[8px] text-zinc-400 uppercase block">Beneficiário: {company.pixReceiverName || company.name}</span>
                            
                            {paymentStatus === 'waiting_pix' ? (
                              <div className="mt-2 bg-amber-500/10 border border-amber-500/20 rounded-xl p-2 animate-pulse">
                                <span className="text-[8px] font-bold text-amber-400 uppercase block animate-pulse">Aguardando Confirmação no Caixa...</span>
                                <span className="text-[7.5px] text-zinc-450 uppercase block leading-normal mt-0.5">Realize o PIX e aguarde o operador validar de forma manual no painel.</span>
                              </div>
                            ) : (
                              <span className="text-[8px] text-zinc-500 uppercase block leading-normal pt-1">O QR Code acima carrega o valor exato da compra de R$ {total.toFixed(2)}.</span>
                            )}
                          </div>
                        </motion.div>
                      )
                    ) : (
                      
                      /* CARD TERMINAL SIMULATION PRIOR TO CHECKOUT */
                      <motion.div key="card" className="space-y-4 flex flex-col items-center">
                        <div className="w-14 h-14 bg-emerald-500/5 border border-emerald-500/10 text-emerald-400 rounded-full flex items-center justify-center animate-pulse shadow-inner">
                          <Smartphone className="w-6 h-6 animate-bounce" />
                        </div>
                        <div className="space-y-1">
                          <span className="text-[9.5px] font-black text-white uppercase block">Aproxime Cartão ou Celular</span>
                          <span className="text-[8px] text-zinc-500 uppercase block">Clique no botão abaixo para iniciar o processo</span>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
 
                {/* Final action trigger */}
                <div className="pt-4 border-t border-white/5 space-y-2">
                  {paymentStatus !== 'idle' ? (
                    <div className="w-full py-4 bg-amber-500/10 border border-amber-500/20 text-amber-400 text-[10px] font-black uppercase tracking-widest rounded-2xl animate-pulse text-center flex items-center justify-center gap-2 font-mono">
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      Aguardando Operador
                    </div>
                  ) : (
                    <button
                      onClick={handleFinalizeSale}
                      disabled={!chosenMethod || (chosenMethod.type === 'money' && cashDeposited < total) || (chosenMethod.type === 'pix' && !hasPixKey) || paymentStatus === 'processing'}
                      className="w-full py-4 bg-emerald-500 hover:bg-emerald-400 disabled:bg-zinc-800 disabled:text-zinc-650 disabled:border-transparent text-black text-[10px] font-black uppercase tracking-widest rounded-2xl transition-all disabled:opacity-40 hover:shadow-[0_0_15px_rgba(16,185,129,0.3)] active:scale-97 cursor-pointer text-center font-bold"
                    >
                      {chosenMethod?.type === 'pix' && !hasPixKey ? 'Chave PIX Não Cadastrada' : chosenMethod?.type === 'pix' ? 'Iniciar Pagamento via PIX' : 'Confirmar Pagamento'}
                    </button>
                  )}
                </div>

              </div>

            </motion.div>
          )}

          {/* STEP 5: SUCCESS & ORDER CONFIRMATION SCREEN */}
          {step === 'success' && lastSale && (
            <motion.div 
              key="success"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="flex-1 max-w-2xl mx-auto w-full p-8 flex flex-col justify-center items-center gap-8 text-center"
            >
              
              {/* Centered Success Visual Elements */}
              <div className="space-y-4 max-w-lg w-full flex flex-col items-center">
                <div className="inline-flex w-20 h-20 bg-emerald-500/10 border border-emerald-500/25 rounded-[2rem] items-center justify-center text-emerald-400 shadow-xl shadow-emerald-500/5">
                  <CheckCircle className="w-10 h-10 animate-pulse text-emerald-450" />
                </div>

                <div className="space-y-2 text-center">
                  <span className="text-[10px] font-mono text-emerald-400 font-extrabold uppercase tracking-[0.3em] block">Autoatendimento Finalizado</span>
                  <h1 className="text-3xl font-black text-white uppercase tracking-wider font-mono">Pedido Enviado Para Separação!</h1>
                </div>
              </div>

              {/* Order Number Big Display */}
              <div className="bg-zinc-950/65 border border-white/5 rounded-[2.5rem] p-8 w-full max-w-lg shadow-2xl relative space-y-6">
                <div className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-emerald-500 text-black font-mono font-black text-[10px] px-4 py-1.5 rounded-full uppercase tracking-widest shadow-lg shadow-emerald-500/10">
                  Senha do Painel
                </div>
                
                <div className="text-5xl font-black text-emerald-400 tracking-wider font-mono py-2">
                  #{lastSale.orderNumber}
                </div>

                {/* Micro Native Receipt Details */}
                <div className="border-t border-b border-white/5 py-4 space-y-3 text-left">
                  <div className="flex justify-between text-[10px] uppercase font-bold text-zinc-550">
                    <span>Itens Comprados</span>
                    <span>Subtotal</span>
                  </div>
                  <div className="max-h-32 overflow-y-auto custom-scrollbar space-y-1.5 pr-1 font-mono text-[10.5px]">
                    {lastSale.items && lastSale.items.map((item: any, idx: number) => (
                      <div key={idx} className="flex justify-between items-center text-zinc-300">
                        <span className="truncate max-w-[280px] uppercase font-medium">{item.name} <strong className="text-emerald-400 font-bold ml-1">x{item.quantity}</strong></span>
                        <span className="text-white font-bold">R$ {(item.price * item.quantity).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                      </div>
                    ))}
                  </div>
                  <div className="flex justify-between items-center pt-2 border-t border-white/5 text-xs">
                    <span className="text-zinc-400 font-bold uppercase text-[10px]">Valor Total:</span>
                    <strong className="text-emerald-400 font-mono font-black text-sm">
                      R$ {lastSale.total.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                    </strong>
                  </div>
                </div>

                <div className="flex flex-col sm:flex-row justify-between text-[11px] gap-2 pt-1 uppercase text-zinc-400 font-bold tracking-wide">
                  <div className="flex items-center gap-1.5 justify-center sm:justify-start">
                    <span>Forma:</span>
                    <strong className="text-white font-black">{lastSale.paymentMethodName || 'Outro'}</strong>
                  </div>
                  <div className="flex items-center gap-1.5 justify-center sm:justify-end">
                    <span>Cliente:</span>
                    <strong className="text-white font-black">
                      {lastSale.clientId ? (clients.find(c => c.id === lastSale.clientId)?.name || 'Consumidor Final') : 'Consumidor Final'}
                    </strong>
                  </div>
                </div>
              </div>

              {/* Change/Troco segment */}
              {lastSale.change !== undefined && lastSale.change > 0 && (
                <div className="border border-emerald-500/20 bg-emerald-500/5 rounded-[2rem] p-6 text-center max-w-lg w-full animate-pulse space-y-1">
                  <span className="text-[9px] font-mono uppercase text-emerald-400 tracking-wider block font-bold">Seu Troco a Receber</span>
                  <span className="text-3xl font-black text-white font-mono font-bold">
                    R$ {lastSale.change.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                  </span>
                  <p className="text-[8px] text-zinc-400 uppercase leading-normal font-bold">
                    Retire suas cédulas e moedas diretamente com o operador do terminal!
                  </p>
                </div>
              )}

              {/* Auto return progress countdown bar */}
              <div className="bg-zinc-950/40 rounded-3xl p-5 border border-white/5 space-y-2.5 w-full max-w-lg">
                <span className="text-[9px] font-mono uppercase text-zinc-400 tracking-widest block font-bold">Retornando ao Menu Principal</span>
                <div className="flex items-center gap-4">
                  <span className="text-xs font-black text-emerald-400 font-mono">{successCountdown}s</span>
                  <div className="flex-1 bg-white/5 h-2 rounded-full overflow-hidden">
                    <motion.div 
                      initial={{ width: "100%" }}
                      animate={{ width: "0%" }}
                      transition={{ duration: 10, ease: "linear" }}
                      className="h-full bg-emerald-500 shadow-[0_0_8px_rgba(52,211,153,0.5)]"
                    />
                  </div>
                </div>
              </div>

              {/* Instant confirm & exit trigger button */}
              <button
                onClick={startNewSession}
                className="w-full max-w-lg py-5 bg-emerald-500 hover:bg-emerald-400 text-black rounded-2xl text-[10px] font-black uppercase tracking-widest hover:shadow-[0_0_20px_rgba(16,185,129,0.25)] transition-all active:scale-97 cursor-pointer text-center font-bold"
              >
                Concluir e Voltar ao Início
              </button>

            </motion.div>
          )}

        </AnimatePresence>

        {/* DETAILS CONFIRMATION MODAL */}
        {selectedProductDetails && (
          <div className="fixed inset-0 bg-black/85 backdrop-blur-md z-50 flex items-center justify-center p-4 overflow-y-auto">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,_rgba(16,185,129,0.06),_transparent_60%)] pointer-events-none" />
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="w-full max-w-4xl bg-[#0b0b0b] border border-white/10 rounded-[2.5rem] p-6 md:p-8 space-y-6 shadow-2xl relative text-left my-auto"
            >
              {/* Close Button top right */}
              <button
                onClick={() => setSelectedProductDetails(null)}
                className="absolute top-6 right-6 w-12 h-12 border border-white/5 bg-white/5 hover:bg-white/10 active:scale-90 rounded-full flex items-center justify-center text-white/70 hover:text-white transition-all cursor-pointer z-10 shadow-lg"
              >
                <XIcon className="w-5 h-5" />
              </button>

              {/* Grid Layout: Left Column (Image & Gallery), Right Column (Specs & Action) */}
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start pt-2">
                
                {/* Left Column: Grande Imagem e Galeria */}
                <div className="lg:col-span-6 flex flex-col space-y-4">
                  {/* Big Preview Area with Swipe Support and Touch Arrows */}
                  <div 
                    className="relative w-full aspect-square sm:aspect-[4/3] md:aspect-[4/3] lg:aspect-square bg-gradient-to-b from-[#0c0c0c] to-[#040404] rounded-3xl border border-white/5 overflow-hidden flex items-center justify-center select-none"
                    onTouchStart={handleTouchStart}
                    onTouchEnd={handleTouchEnd}
                  >
                    {viewing3D && selectedProductDetails.file3d ? (
                      <ThreeDViewer 
                        file={selectedProductDetails.file3d} 
                        onClose={() => setViewing3D(false)}
                      />
                    ) : modalImagesList.length > 0 ? (
                      <img
                        src={modalImagesList[activeImageIndex] || modalImagesList[0]}
                        alt={selectedProductDetails.name}
                        className="w-full h-full object-contain p-4 transition-all duration-300 pointer-events-none"
                        referrerPolicy="no-referrer"
                      />
                    ) : (
                      <div className="w-20 h-20 rounded-full bg-emerald-500/5 border border-emerald-500/10 flex items-center justify-center text-emerald-400">
                        <ShoppingBag className="w-10 h-10" />
                      </div>
                    )}

                    {/* Touch Area Overlay controls if there are multiple images */}
                    {!viewing3D && modalImagesList.length > 1 && (
                      <>
                        {/* Left Chevron arrow */}
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setActiveImageIndex(prev => (prev - 1 + modalImagesList.length) % modalImagesList.length);
                          }}
                          className="absolute left-3 w-11 h-11 bg-black/60 border border-white/10 hover:bg-black/90 active:scale-90 text-white rounded-full flex items-center justify-center transition-all cursor-pointer shadow-lg"
                        >
                          <ChevronLeft className="w-6 h-6 text-emerald-400" />
                        </button>

                        {/* Right Chevron arrow */}
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setActiveImageIndex(prev => (prev + 1) % modalImagesList.length);
                          }}
                          className="absolute right-3 w-11 h-11 bg-black/60 border border-white/10 hover:bg-black/90 active:scale-90 text-white rounded-full flex items-center justify-center transition-all cursor-pointer shadow-lg"
                        >
                          <ChevronRight className="w-6 h-6 text-emerald-400" />
                        </button>

                        {/* Bullet Dot indicators */}
                        <div className="absolute bottom-4 inset-x-0 flex items-center justify-center gap-1.5 z-10 pointer-events-none">
                          {modalImagesList.map((_, idx) => (
                            <div 
                              key={idx}
                              className={`h-2 rounded-full transition-all duration-300 ${
                                activeImageIndex === idx 
                                  ? "w-6 bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.5)]" 
                                  : "w-2 bg-white/20"
                              }`}
                            />
                          ))}
                        </div>
                      </>
                    )}

                    {/* Badge showing available stock */}
                    <span className="absolute top-4 left-4 px-3 py-1 bg-emerald-500/10 border border-emerald-500/20 text-[8px] text-emerald-400 font-mono tracking-widest uppercase rounded-full font-bold shadow-md">
                      Estoque: {selectedProductDetails.stock} DISPONÍVEL
                    </span>
                  </div>

                  {/* Miniature Thumbnails Gallery (Shopee Style) */}
                  {(modalImagesList.length > 1 || selectedProductDetails.file3d) && (
                    <div className="flex items-center gap-2.5 overflow-x-auto py-1.5 px-0.5 custom-scrollbar shrink-0 justify-center">
                      {modalImagesList.map((imgUrl, index) => (
                        <button
                          key={index}
                          type="button"
                          onClick={() => {
                            setActiveImageIndex(index);
                            setViewing3D(false);
                          }}
                          className={`w-14 h-14 rounded-xl border-2 overflow-hidden transition-all bg-[#0a0a0a] relative shrink-0 active:scale-95 ${
                            !viewing3D && activeImageIndex === index 
                              ? "border-emerald-500 ring-2 ring-emerald-500/20 scale-105 shadow-[0_0_12px_rgba(16,185,129,0.1)]" 
                              : "border-white/5 hover:border-white/20"
                          }`}
                        >
                          <img 
                            src={imgUrl} 
                            alt={`Miniatura ${index + 1}`} 
                            className="w-full h-full object-cover" 
                            referrerPolicy="no-referrer"
                          />
                          {index === 0 && (
                            <span className="absolute bottom-0 inset-x-0 bg-emerald-500/90 text-[5.5px] font-black uppercase text-black text-center py-0.5 leading-none font-bold">
                              Principal
                            </span>
                          )}
                        </button>
                      ))}

                      {/* Optional [Ver em 3D] button at the very end of images list */}
                      {selectedProductDetails.file3d && (
                        <button
                          type="button"
                          onClick={() => setViewing3D(true)}
                          className={`w-14 h-14 rounded-xl border-2 transition-all shrink-0 active:scale-95 flex flex-col items-center justify-center gap-1 cursor-pointer ${
                            viewing3D 
                              ? "bg-cyan-500/15 border-cyan-500 text-cyan-400 font-black shadow-[0_0_12px_rgba(6,182,212,0.25)] ring-2 ring-cyan-500/20 scale-105" 
                              : "bg-black/40 border-white/5 text-zinc-400 hover:text-white hover:border-white/12"
                          }`}
                          title="Ver visualização 3D do produto"
                        >
                          <Layers className="w-5 h-5 text-cyan-400" />
                          <span className="text-[6.5px] font-black uppercase tracking-wider">Ver em 3D</span>
                        </button>
                      )}
                    </div>
                  )}
                </div>

                {/* Right Column: Descrição, Variações, Preço e Controles de Qtd */}
                <div className="lg:col-span-6 flex flex-col justify-between space-y-6 self-stretch">
                  
                  {/* Title & Metadata */}
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-[9px] font-black text-emerald-400 uppercase tracking-[0.2em] bg-emerald-500/5 px-2.5 py-1 rounded-md border border-emerald-500/15">
                        {selectedProductDetails.category || 'Geral'}
                      </span>
                      <span className="text-[8px] font-mono text-zinc-500 uppercase tracking-widest bg-white/5 border border-white/5 px-2.5 py-1 rounded-md">
                        CÓDIGO: {selectedProductDetails.code}
                      </span>
                    </div>

                    <h3 className="text-2xl font-black text-white uppercase tracking-tight leading-tight pt-1">
                      {selectedProductDetails.name}
                    </h3>
                  </div>

                  {/* Elegant Fallback Description Section */}
                  <div className="space-y-1.5 border-t border-white/5 pt-4">
                    <span className="text-[8.5px] font-black text-zinc-500 uppercase tracking-[0.15em] block">Descrição do Produto</span>
                    <p className="text-xs text-zinc-400 font-medium leading-relaxed uppercase tracking-wider max-h-24 overflow-y-auto custom-scrollbar pr-1">
                      {selectedProductDetails.catalogDescription || selectedProductDetails.notes || "Sem descrição cadastrada"}
                    </p>
                  </div>

                   {/* Sabores & Variações Section */}
                    {selectedProductDetails.variations && selectedProductDetails.variations.length === 1 ? (
                      <div className="space-y-1.5 border-t border-white/5 pt-4">
                        <span className="text-[8.5px] font-mono text-zinc-500 uppercase tracking-widest block">Variação</span>
                        <div className="px-3.5 py-3 rounded-xl border border-emerald-500/30 bg-emerald-500/5 text-white flex items-center justify-between">
                          <span className="text-xs font-bold uppercase text-emerald-400">
                            {selectedProductDetails.variations[0].name}
                          </span>
                          <span className="text-[9px] font-mono font-medium text-zinc-500 bg-black/40 px-2 py-1 rounded">
                            {selectedProductDetails.variations[0].stock} un
                          </span>
                        </div>
                      </div>
                    ) : (
                      <div className="space-y-2.5 border-t border-white/5 pt-4">
                        <span className="text-[8.5px] font-mono text-zinc-500 uppercase tracking-widest block">Seleção de Sabor / Variação</span>
                        <div className="flex flex-wrap gap-2">
                          {selectedProductDetails.variations && selectedProductDetails.variations.length > 0 ? (
                            selectedProductDetails.variations.map((v: any) => {
                              const isSelected = selectedVariationId === v.id;
                              const hasStock = v.stock > 0;
                              return (
                                <button
                                  key={v.id}
                                  type="button"
                                  disabled={!hasStock}
                                  onClick={() => {
                                    setSelectedVariationId(v.id);
                                    setSelectedSabor(v.name);
                                  }}
                                  className={`px-3.5 py-2.5 rounded-xl border text-[9px] uppercase tracking-wider font-extrabold transition-all cursor-pointer active:scale-95 flex flex-col items-start gap-1 ${
                                    isSelected
                                      ? "bg-emerald-500/10 border-emerald-500 text-emerald-400 font-black shadow-[0_0_12px_rgba(16,185,129,0.15)]"
                                      : hasStock 
                                        ? "bg-black/40 border-white/5 text-zinc-400 hover:text-white hover:border-white/12"
                                        : "bg-[#141416]/20 border-white/2 text-zinc-600 cursor-not-allowed opacity-30"
                                  }`}
                                >
                                  <span>{v.name}</span>
                                  <span className="text-[7.5px] opacity-60 font-mono font-medium lowercase">({v.stock} un)</span>
                                </button>
                              );
                            })
                          ) : (
                            (
                              selectedProductDetails.category?.toLowerCase().includes('cerveja') || 
                              selectedProductDetails.category?.toLowerCase().includes('chope') || 
                              selectedProductDetails.category?.toLowerCase().includes('refrigerante') ||
                              selectedProductDetails.category?.toLowerCase().includes('suco') ||
                              selectedProductDetails.category?.toLowerCase().includes('refri') ||
                              selectedProductDetails.category?.toLowerCase().includes('bebida')
                                ? ['Normal', 'Gelado (Trincando)', 'Sem Gelo', 'Com Gelo e Limão']
                                : selectedProductDetails.category?.toLowerCase().includes('pizza') || 
                                  selectedProductDetails.category?.toLowerCase().includes('pastel') || 
                                  selectedProductDetails.category?.toLowerCase().includes('doce') || 
                                  selectedProductDetails.category?.toLowerCase().includes('café') ||
                                  selectedProductDetails.category?.toLowerCase().includes('hambú')
                                  ? ['Tradicional', 'Gourmet (+ R$ 4,00)', 'Sabor Chocolate', 'Sabor Morango', 'Zero Açúcar']
                                  : ['Padrão', 'Premium (+ R$ 5,00)', 'Edição Especial', 'Embalagem Presente']
                            ).map((sabor) => {
                              const isSelected = selectedSabor === sabor;
                              return (
                                <button
                                  key={sabor}
                                  type="button"
                                  onClick={() => setSelectedSabor(sabor)}
                                  className={`px-3.5 py-2.5 rounded-xl border text-[9px] uppercase tracking-wider font-extrabold transition-all cursor-pointer active:scale-95 ${
                                    isSelected
                                      ? "bg-emerald-500/10 border-emerald-500 text-emerald-400 font-black shadow-[0_0_12px_rgba(16,185,129,0.15)]"
                                      : "bg-black/40 border-white/5 text-zinc-400 hover:text-white hover:border-white/12"
                                  }`}
                                >
                                  {sabor}
                                </button>
                              );
                            })
                          )}
                        </div>
                      </div>
                    )}

                    {(() => {
                      const hasVariations = selectedProductDetails.variations && selectedProductDetails.variations.length > 0;
                      const activeVar = hasVariations && selectedVariationId
                        ? selectedProductDetails.variations.find((v: any) => v.id === selectedVariationId)
                        : null;

                      const getVariationExtraPrice = (variation: string) => {
                        if (variation.includes('+ R$ 4,00')) return 4;
                        if (variation.includes('+ R$ 5,00')) return 5;
                        return 0;
                      };

                      const extraPrice = getVariationExtraPrice(selectedSabor);
                      const effectivePrice = activeVar
                        ? (activeVar.price !== undefined ? activeVar.price : selectedProductDetails.price)
                        : (selectedProductDetails.price + extraPrice);

                      const targetStockLimit = activeVar ? activeVar.stock : selectedProductDetails.stock;

                      return (
                        <div className="space-y-4 border-t border-white/5 pt-4 mt-auto">
                          <div className="grid grid-cols-2 gap-4 items-center">
                            {/* Unit price with nice labels */}
                            <div>
                              <span className="text-[7.5px] font-mono text-zinc-500 uppercase block leading-none">Preço Unitário</span>
                              <span className="text-2xl font-black text-emerald-400 font-mono tracking-tight block mt-1">
                                R$ {effectivePrice.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                              </span>
                            </div>

                            {/* Large Tactile Counter (Big Touch Targets) */}
                            <div className="space-y-1.5 flex flex-col items-end">
                              <span className="text-[7.5px] font-mono text-zinc-500 uppercase tracking-widest block">Quantidade</span>
                              <div className="flex items-center gap-3.5">
                                <button
                                  type="button"
                                  onClick={() => setModalQuantity(prev => Math.max(1, prev - 1))}
                                  disabled={modalQuantity <= 1}
                                  className="w-12 h-12 bg-white/5 border border-white/5 hover:bg-white/10 text-white rounded-xl flex items-center justify-center list-none disabled:opacity-20 disabled:pointer-events-none active:scale-90 transition-all cursor-pointer"
                                >
                                  <Minus className="w-5 h-5 text-emerald-400" />
                                </button>
                                <span className="text-lg font-mono font-black text-white w-8 text-center select-none">
                                  {modalQuantity}
                                </span>
                                <button
                                  type="button"
                                  onClick={() => setModalQuantity(prev => Math.min(targetStockLimit, prev + 1))}
                                  disabled={modalQuantity >= targetStockLimit}
                                  className="w-12 h-12 bg-white/5 border border-white/5 hover:bg-white/10 text-white rounded-xl flex items-center justify-center list-none disabled:opacity-20 disabled:pointer-events-none active:scale-90 transition-all cursor-pointer"
                                >
                                  <Plus className="w-5 h-5 text-emerald-400" />
                                </button>
                              </div>
                            </div>
                          </div>

                          {/* Total of item and Confirmation Action (Big buttons, no double clicking) */}
                          <div className="pt-4 border-t border-white/5 flex flex-col sm:flex-row gap-4 items-center justify-between">
                            <div className="text-left w-full sm:w-auto">
                              <span className="text-[8px] font-mono text-zinc-500 uppercase tracking-wider block">Subtotal Calculado</span>
                              <span className="text-3xl font-black text-white font-mono tracking-tighter">
                                R$ {(effectivePrice * modalQuantity).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                              </span>
                            </div>

                            <button
                              type="button"
                              onClick={() => {
                                addToCart(selectedProductDetails, modalQuantity, selectedSabor, effectivePrice, activeVar?.id);
                                setSelectedProductDetails(null);
                              }}
                              className="w-full sm:w-auto px-8 py-4.5 bg-emerald-500 hover:bg-emerald-400 text-black text-[11px] font-black uppercase tracking-widest rounded-2xl transition-all shadow-lg hover:shadow-[0_0_20px_rgba(16,185,129,0.35)] active:scale-95 cursor-pointer text-center flex items-center justify-center gap-2"
                            >
                              <ShoppingCart className="w-4 h-4 text-black font-black" />
                              Adicionar ao carrinho
                            </button>
                          </div>
                        </div>
                      );
                    })()}

                </div>
              </div>

            </motion.div>
          </div>
        )}

        {/* CANCEL CONFIRMATION MODAL */}
        {showCancelModal && (
          <div className="fixed inset-0 bg-black/80 backdrop-blur-md z-50 flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,_rgba(239,68,68,0.05),_transparent_60%)] pointer-events-none" />
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="w-full max-w-md bg-[#0e0e0e] border border-white/5 rounded-[2.5rem] p-8 space-y-6 shadow-2xl relative text-center"
            >
              <div className="w-16 h-16 bg-red-500/10 border border-red-500/25 rounded-3xl flex items-center justify-center text-red-500 mx-auto">
                <AlertTriangle className="w-8 h-8 animate-pulse" />
              </div>

              <div className="space-y-2">
                <h3 className="text-lg font-black text-white uppercase tracking-wider">Deseja realmente cancelar este atendimento?</h3>
                <p className="text-[10px] text-zinc-400 uppercase leading-relaxed font-semibold">
                  O carrinho e os dados desta sessão serão apagados.
                </p>
                {(paymentStatus === 'processing' || paymentStatus === 'waiting_pix' || paymentStatus === 'waiting_cash' || paymentStatus === 'waiting_card') && (
                  <div className="mt-4 p-3 bg-red-500/10 border border-red-500/20 text-red-500 rounded-xl text-[9px] font-extrabold uppercase leading-normal">
                    Fase de Pagamento Ativa! Existe uma transação em andamento ou aguardando operador. Se você cancelar, essa transação será descartada.
                  </div>
                )}
              </div>

              <div className="flex gap-4 pt-4">
                <button
                  type="button"
                  onClick={() => setShowCancelModal(false)}
                  className="flex-1 py-4 bg-zinc-900 border border-zinc-800 text-zinc-400 hover:text-white rounded-2xl text-[9px] font-black uppercase tracking-widest transition-all active:scale-95 cursor-pointer text-center"
                >
                  Continuar comprando
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowCancelModal(false);
                    startNewSession();
                  }}
                  className="flex-1 py-4 bg-red-500 hover:bg-red-400 text-black rounded-2xl text-[9px] font-black uppercase tracking-widest transition-all hover:shadow-[0_0_15px_rgba(239,68,68,0.3)] active:scale-95 cursor-pointer text-center"
                >
                  Cancelar atendimento
                </button>
              </div>
            </motion.div>
          </div>
        )}

        {/* INACTIVITY TIMEOUT MODAL */}
        {showTimeoutModal && (
          <div className="fixed inset-0 bg-black/85 backdrop-blur-md z-50 flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,_rgba(245,158,11,0.05),_transparent_60%)] pointer-events-none" />
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="w-full max-w-md bg-[#0e0e0e] border border-white/5 rounded-[2.5rem] p-8 space-y-6 shadow-2xl relative text-center"
            >
              <div className="w-16 h-16 bg-amber-500/10 border border-amber-500/25 rounded-3xl flex items-center justify-center text-amber-500 mx-auto">
                <AlertCircle className="w-8 h-8 animate-bounce" />
              </div>

              <div className="space-y-2">
                <h3 className="text-xl font-black text-white uppercase tracking-wider">Você ainda está aí?</h3>
                <p className="text-[10px] text-zinc-400 uppercase leading-relaxed font-semibold">
                  Identificamos inatividade neste terminal. Esta sessão será encerrada automaticamente em:
                </p>
                <div className="text-4xl font-black text-amber-500 font-mono tracking-tight animate-pulse py-2">
                  {timeoutCountdown}s
                </div>
              </div>

              <div className="flex gap-4 pt-2">
                <button
                  type="button"
                  onClick={handleEndSession}
                  className="flex-1 py-4 bg-zinc-900 border border-zinc-800 text-zinc-400 hover:text-white rounded-2xl text-[9px] font-black uppercase tracking-widest transition-all active:scale-95 cursor-pointer text-center"
                >
                  Encerrar atendimento
                </button>
                <button
                  type="button"
                  onClick={handleContinueSession}
                  className="flex-1 py-4 bg-emerald-500 hover:bg-emerald-400 text-black rounded-2xl text-[9px] font-black uppercase tracking-widest transition-all hover:shadow-[0_0_15px_rgba(16,185,129,0.3)] active:scale-95 cursor-pointer text-center"
                >
                  Continuar atendimento
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </main>
    </div>
  );
}

// Simple fallback XIcon component
function XIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    >
      <path d="M18 6 6 18" />
      <path d="m6 6 12 12" />
    </svg>
  );
}
