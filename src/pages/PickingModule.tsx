import React, { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Box, 
  Search, 
  CheckCircle2, 
  Package, 
  ArrowLeft,
  ScanLine,
  User,
  Clock,
  MapPin,
  AlertTriangle,
  ChevronRight,
  TrendingUp,
  Image as ImageIcon,
  RefreshCw,
  Timer,
  CheckCircle,
  XCircle,
  QrCode,
  Truck,
  Camera,
  Upload,
  PackageCheck,
  PackageX,
  History,
  ShieldCheck,
  Check,
  Home,
  Settings
} from 'lucide-react';
import { cn, extractOrderNumberFromScan } from '../lib/utils';
import { useStore, Sale, User as AppUser, CartItem } from '../store';
import { operationalValidationService } from '../services/operationalValidationService';
import { credentialValidationService } from '../services/credentialValidationService';
import { nfcServiceFactory } from '../services/NFCServiceFactory';
import { feedback } from '../lib/feedback';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Html5Qrcode, Html5QrcodeSupportedFormats, Html5QrcodeScannerState } from 'html5-qrcode';
import QRScanner from '../components/QRScanner';
import { startScannerWithFallback } from '../utils/qrHelper';
import { BrowserMultiFormatReader } from '@zxing/library';
import { generateCanonicalPdfBlob, downloadOrSharePdf } from '../services/pdfEngine/pdfGenerator';

export default function PickingModule({ active = true }: { active?: boolean }) {
  const sales = useStore(state => state.sales);
  const updatePickedQuantity = useStore(state => state.updatePickedQuantity);
  const startSeparation = useStore(state => state.startSeparation);
  const finalizeSeparation = useStore(state => state.finalizeSeparation);
  const addActivity = useStore(state => state.addActivity);
  const logAction = useStore(state => state.logAction);
  const clients = useStore(state => state.clients);
  const currentUser = useStore(state => state.currentUser);
  const users = useStore(state => state.users);
  const badges = useStore(state => state.badges) || [];
  const verifyMasterCredential = useStore(state => state.verifyMasterCredential);
  const masterBadges = useStore(state => state.masterBadges) || [];
  const masterAuthorizations = useStore(state => state.masterAuthorizations) || [];
  const receiptConfig = useStore(state => state.receiptConfig);

  const navigate = useNavigate();
  const isSettingsOpen = useStore(state => state.isSettingsOpen);
  const setIsSettingsOpen = useStore(state => state.setIsSettingsOpen);

  const [orderSearch, setOrderSearch] = useState('');
  const [pickingOrder, setPickingOrder] = useState<Sale | null>(null);

  const enqueueReceiptForSale = async (orderId: string, operatorName: string) => {
    try {
      const lastState = useStore.getState();
      const order = lastState.sales.find(s => s.id === orderId);
      if (!order) return;
      
      const companyState = lastState.company;
      const clientsState = lastState.clients;
      const clientObj = order.clientId ? clientsState.find(c => c.id === order.clientId) : null;
      
      const items = order.items.map(item => ({
        code: item.code || item.id,
        description: item.name,
        qty: item.pickedQuantity !== undefined ? item.pickedQuantity : item.quantity,
        price: item.price,
        total: item.price * (item.pickedQuantity !== undefined ? item.pickedQuantity : item.quantity)
      }));

      // Calculate final total based on picked items
      const subtotal = items.reduce((sum, i) => sum + i.total, 0);
      const total = Math.max(0, subtotal - (order.discount || 0) + (order.additionalCharge || 0));

      const getClientNameLocal = (clientId?: string) => {
        if (!clientId) return 'Consumidor Final';
        const client = clientsState.find(c => c.id === clientId);
        return client ? client.name : 'Consumidor Final';
      };

      const payload = {
        orderId: order.id,
        orderNumber: order.orderNumber,
        date: new Date(order.pickTimestamp || Date.now()).toLocaleString(),
        operator: operatorName || order.pickerName || 'Separador',
        client: {
          name: getClientNameLocal(order.clientId),
          phone: clientObj ? (clientObj.phone || '') : '',
          document: clientObj ? (clientObj.document || '') : ''
        },
        items,
        financial: {
          subtotal,
          discount: order.discount || 0,
          deliveryFee: order.additionalCharge || 0,
          surcharge: 0,
          total,
          paymentMethod: order.paymentMethodName || 'Outro',
          receivedAmount: order.receivedAmount || total,
          changeAmount: order.change || 0
        },
        companyName: companyState?.name || "Lukasfe Industrial Ltda",
        companyCnpj: companyState?.document || "00.000.000/0001-00",
        companyAddress: companyState?.address ? `${companyState.address.street || ''}, ${companyState.address.number || ''} ${companyState.address.neighborhood || ''} ${companyState.address.city || ''} - ${companyState.address.state || ''}` : "Praça da Sé, 100",
        companyPhone: companyState?.phone || "(11) 4002-8922",
        notes: order.deliveryNotes || ""
      };

      const activePaperSize = receiptConfig?.paperSize || '80mm';
      const bindings = lastState.documentPrintConfigs || [];
      const activePrintConfig = bindings.find(c => c.documentId === 'thermal_receipt');

      // Check if a physical printer is configured and mapped, otherwise generate PDF automatically.
      if (!activePrintConfig || activePrintConfig.printerId === 'pdf-manual') {
        const blob = await generateCanonicalPdfBlob(
          'reciboTermico',
          payload,
          activePaperSize,
          {
            orientation: 'portrait',
            marginMm: 2,
            scale: 1,
            safeMode: false,
            isExportPdf: true
          }
        );
        await downloadOrSharePdf(blob, `recibo_${order.orderNumber}`);
      } else {
        const printersList = lastState.printers || [];
        const targetPrinter = printersList.find(p => p.id === activePrintConfig.printerId);
        if (!targetPrinter) {
          // Fallback to PDF if printer configured but not online/present
          const blob = await generateCanonicalPdfBlob(
            'reciboTermico',
            payload,
            activePaperSize,
            {
              orientation: 'portrait',
              marginMm: 2,
              scale: 1,
              safeMode: false,
              isExportPdf: true
            }
          );
          await downloadOrSharePdf(blob, `recibo_${order.orderNumber}`);
        } else {
          // Resolve driver paper configuration mapping
          const allMappings = lastState.paperDriverMappings || [];
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

          const { addPrintJob } = lastState;
          if (addPrintJob) {
            addPrintJob({
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
              payload: payload
            });
          }
        }
      }

      console.log(`[PRINT_DIAG][SUCCESS] Emissão de Recibo Térmico bem-sucedida para o pedido #${order.orderNumber}`);
    } catch (err) {
      console.error('[PRINT_QUEUE_DIAGNOSTIC] Falha em PickingModule:', err);
    }
  };
  const [showEmployeeAuth, setShowEmployeeAuth] = useState(false);
  const [showMissingAuthModal, setShowMissingAuthModal] = useState(false);
  const [missingAuthPassword, setMissingAuthPassword] = useState('');
  const [missingAuthScannerActive, setMissingAuthScannerActive] = useState(false);
  const [missingAuthError, setMissingAuthError] = useState<string | null>(null);
  const [confirmMissing, setConfirmMissing] = useState<string | null>(null);
  const [showLookupCamera, setShowLookupCamera] = useState(false);
  const [lookupCameraTab, setLookupCameraTab] = useState<'camera' | 'upload'>('camera');
  const [showCancelAuth, setShowCancelAuth] = useState(false);
  const [cancelStatus, setCancelStatus] = useState<'idle' | 'authorizing'>('idle');
  const [adminPassword, setAdminPassword] = useState('');
  
  const [nfcFeedbackMessage, setNfcFeedbackMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 1024);
    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);
  
  const lookupInputRef = useRef<HTMLInputElement>(null);
  const lookupScannerRef = useRef<Html5Qrcode | null>(null);
  const cancelScannerInstanceRef = useRef<Html5Qrcode | null>(null);
  const cancelTransitionRef = useRef<boolean>(false);
  const lastEmployeeScanRef = useRef<{ text: string, time: number } | null>(null);
  const lastCancelScanRef = useRef<{ text: string, time: number } | null>(null);

  // Prevention of accidental exit
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (pickingOrder && pickingOrder.status === 'em_separacao') {
        const msg = "Existe uma separação em andamento. Finalize ou solicite autorização para cancelar.";
        e.preventDefault();
        e.returnValue = msg;
        return msg;
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [pickingOrder]);

  // Listener for menu clicks or header actions (e.g. clicking Inicio, Voltar, Ajustes)
  useEffect(() => {
    const handleTriggerCancelCheck = () => {
      if (pickingOrder && pickingOrder.status === 'em_separacao') {
        handleCancelSeparationRequest();
      }
    };
    window.addEventListener('trigger-cancel-picking-check', handleTriggerCancelCheck);
    return () => window.removeEventListener('trigger-cancel-picking-check', handleTriggerCancelCheck);
  }, [pickingOrder]);

  // Trap popstate (browser back button) to require admin auth before leaving
  useEffect(() => {
    if (pickingOrder && pickingOrder.status === 'em_separacao') {
      const handlePopstate = (e: PopStateEvent) => {
        // Enforce staying on this page by pushing the current history state again
        window.history.pushState(null, '', window.location.href);
        // Trigger cancel authorization modal
        handleCancelSeparationRequest();
      };
      
      // Push state to enable intercepting the very next click on browser back
      window.history.pushState(null, '', window.location.href);
      window.addEventListener('popstate', handlePopstate);
      return () => window.removeEventListener('popstate', handlePopstate);
    }
  }, [pickingOrder]);

  const handleReportMissing = (item: any) => {
    if (!pickingOrder) return;
    
    addActivity(`Divergência: Item "${item.name}" reportado como FALTA no pedido #${pickingOrder.orderNumber}`, 'inventory', 'Separação', pickingOrder.pickerName || currentUser?.fullName);
    logAction({
      module: 'Separação',
      actionType: 'other',
      description: `FALTA DE ESTOQUE: ${item.name} (REQ #${pickingOrder.orderNumber})`,
      status: 'erro',
      referenceId: pickingOrder.id
    });
    
    setConfirmMissing(null);
    feedback.success();
  };

  // Focus lookup input
  useEffect(() => {
    if (!active || isMobile) return;
    if (!pickingOrder && !showEmployeeAuth && !showLookupCamera && lookupInputRef.current) {
      lookupInputRef.current.focus();
      const interval = setInterval(() => {
        if (document.activeElement !== lookupInputRef.current && document.activeElement?.tagName !== 'INPUT') {
          lookupInputRef.current.focus();
        }
      }, 2000);
      return () => clearInterval(interval);
    }
  }, [pickingOrder, showEmployeeAuth, showLookupCamera, isMobile, active]);

  // Lookup Camera Logic - MOVED TO QRScanner

  const activities = useStore(state => state.activities);

  const getStatusLabel = (status: string) => {
    const labels: Record<string, string> = {
      'aguardando_separacao': 'Aguardando Separação',
      'enviado_separacao': 'Enviado para Separação',
      'em_separacao': 'Em Separação',
      'separado': 'Separado',
      'embalando': 'Embalando',
      'em_rota': 'Em Rota',
      'entregue': 'Entregue',
      'cancelado': 'Cancelado',
      'finalizado': 'Finalizado',
      'problema': 'Com Problema',
      'atrasado': 'Atrasado',
      'retirado': 'Retirado'
    };
    return labels[status] || status;
  };

  const handleOrderSubmit = (value: string) => {
    const searchVal = extractOrderNumberFromScan(value);

    if (!searchVal) {
      setErrorMsg("QR Code ou número inválido.");
      feedback.error();
      return;
    }

    const existingSale = sales.find(s => 
      (String(s.orderNumber) === String(searchVal) || String(s.id) === String(searchVal))
    );

    if (existingSale) {
      // 1. CANCELED CHECK
      if (existingSale.status === 'cancelado') {
        const cancelActivity = [...activities]
          .reverse()
          .find(a => a.entityId === existingSale.id && a.message.toLowerCase().includes('cancelado'));
        
        let msg = `Pedido cancelado. Este pedido não pode ser separado.`;
        if (cancelActivity) {
          const date = format(cancelActivity.timestamp, "dd/MM 'às' HH:mm");
          msg += `\nCancelamento: ${date} por ${cancelActivity.userName || 'Sistema'}.`;
        }
        
        setErrorMsg(msg);
        feedback.error();
        setOrderSearch('');
        return;
      }

      // 2. STATUS ALLOWED FOR PICKING
      const allowedStatuses = ['enviado_separacao', 'em_separacao'];
      
      if (allowedStatuses.includes(existingSale.status)) {
        if (existingSale.status === 'em_separacao' && existingSale.pickerId && existingSale.pickerId !== currentUser?.id) {
           setErrorMsg(`Pedido #${existingSale.orderNumber} já está em separação por ${existingSale.pickerName || 'outro operador'}.`);
           feedback.error();
           setOrderSearch('');
           return;
        }

        handleStartPicking(existingSale);
        setOrderSearch('');
        setErrorMsg(null);
        feedback.success();
        return;
      }

      // 3. BLOCKED STATUSES SPECIFIC FEEDBACK
      if (existingSale.status === 'aguardando_separacao') {
        setErrorMsg("Pedido encontrado, mas ainda não foi enviado para separação.");
      } else if (existingSale.status === 'separado') {
        setErrorMsg("Pedido já separado. Não é possível separar novamente sem voltar o estado.");
      } else if (['embalando', 'em_rota', 'entregue', 'finalizado', 'retirado'].includes(existingSale.status)) {
        setErrorMsg("Pedido já avançou no fluxo e não pode ser separado novamente.");
      } else {
        const statusLabel = getStatusLabel(existingSale.status);
        setErrorMsg(`Pedido encontrado, mas ainda não está disponível para separação.\nStatus atual: ${statusLabel}`);
      }

      feedback.error();
      setOrderSearch('');
    } else {
      setErrorMsg("Pedido não encontrado.");
      feedback.error();
      setOrderSearch('');
    }
  };
  const [isFinalizing, setIsFinalizing] = useState(false);
  const [missingAuthStep, setMissingAuthStep] = useState<'confirm' | 'authorize' | null>(null);
  const [showSuccessModel, setShowSuccessModel] = useState<{ open: boolean; message: string } | null>(null);
  const [scanValue, setScanValue] = useState('');
  const [scanQty, setScanQty] = useState('1');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [authScanValue, setAuthScanValue] = useState('');
  const [elapsedTime, setElapsedTime] = useState(0);
  const [cameraActive, setCameraActive] = useState(false);

  // Compact quantity selection popup states
  const [activePopupItem, setActivePopupItem] = useState<{
    item: any;
    currentPicked: number;
    expected: number;
  } | null>(null);
  const [popupQtyStr, setPopupQtyStr] = useState('');
  
  // Product QR scanner inputs and states
  const [isPickingCameraActive, setIsPickingCameraActive] = useState(false);
  const [scannedProductFeedback, setScannedProductFeedback] = useState<any | null>(null);
  const [lastAddedQty, setLastAddedQty] = useState<number | null>(null);
  const processScanRef = useRef<((txt: string, qty: number) => void) | null>(null);
  const productScannerInstanceRef = useRef<Html5Qrcode | null>(null);
  const productTransitionRef = useRef<boolean>(false);
  const lastProductScanRef = useRef<{ text: string, time: number } | null>(null);
  
  const pickingOrderRef = useRef<Sale | null>(null);
  const scanQtyRef = useRef<string>('1');
  
  useEffect(() => {
    pickingOrderRef.current = pickingOrder;
  }, [pickingOrder]);
  
  useEffect(() => {
    scanQtyRef.current = scanQty;
  }, [scanQty]);

  useEffect(() => {
    processScanRef.current = processScanAutomatically;
  });

  useEffect(() => {
    if (showSuccessModel?.open) {
      const timer = setTimeout(() => {
        setShowSuccessModel(null);
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, [showSuccessModel]);
  
  const scanInputRef = useRef<HTMLInputElement>(null);
  const authInputRef = useRef<HTMLInputElement>(null);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const scannerInstanceRef = useRef<Html5Qrcode | null>(null);
  const missingAuthVideoRef = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    let activeReader: BrowserMultiFormatReader | null = null;
    let cameraMounted = true;

    const initLockingCamera = async () => {
      if (showMissingAuthModal && missingAuthStep === 'authorize') {
        console.log("[FINALIZAR SEPARAÇÃO] - Câmera abrindo automaticamente... (inicializando BrowserMultiFormatReader)");
        // Short delay to ensure video element is fully rendered in the DOM
        await new Promise(resolve => setTimeout(resolve, 300));
        if (!cameraMounted || !missingAuthVideoRef.current) {
          console.log("[FINALIZAR SEPARAÇÃO] - Câmera não iniciada: elemento de vídeo indisponível.");
          return;
        }

        try {
          const reader = new BrowserMultiFormatReader();
          activeReader = reader;
          
          await reader.decodeFromVideoDevice(undefined, missingAuthVideoRef.current, (result, error) => {
            if (result) {
              const text = result.getText();
              console.log("[FINALIZAR SEPARAÇÃO] - QR Lido pela Câmera Automática:", text);
              handleMissingQrScan(text);
            }
          });
          console.log("[FINALIZAR SEPARAÇÃO] - Câmera iniciada com sucesso no modal.");
        } catch (err) {
          console.warn("Erro ao iniciar câmera automática no modal:", err);
        }
      }
    };

    initLockingCamera();

    return () => {
      cameraMounted = false;
      if (activeReader) {
        console.log("[FINALIZAR SEPARAÇÃO] - Resetando e desligando câmera automática...");
        activeReader.reset();
      }
    };
  }, [showMissingAuthModal, missingAuthStep]);

  // Camera logic
  const pickingTransitionRef = useRef<boolean>(false);
  useEffect(() => {
    let mounted = true;

    const startScanner = async () => {
      if (showEmployeeAuth && cameraActive) {
        // Short delay to ensure container is in DOM
        await new Promise(resolve => setTimeout(resolve, 400));
        if (!mounted) return;
        if (pickingTransitionRef.current) return;

        let element = document.getElementById("employee-qr-reader");
        if (!element) {
          for (let i = 0; i < 12; i++) {
            await new Promise(resolve => setTimeout(resolve, 100));
            if (!mounted) return;
            element = document.getElementById("employee-qr-reader");
            if (element) break;
          }
        }
        if (!element) {
          console.warn("Element employee-qr-reader not found in DOM.");
          return;
        }

        try {
          const html5QrCode = new Html5Qrcode("employee-qr-reader", { 
            verbose: false, 
            formatsToSupport: [
              Html5QrcodeSupportedFormats.QR_CODE,
              Html5QrcodeSupportedFormats.CODE_128,
              Html5QrcodeSupportedFormats.DATA_MATRIX
            ] 
          });
          scannerInstanceRef.current = html5QrCode;
          pickingTransitionRef.current = true;

          await startScannerWithFallback(
            html5QrCode,
            (decodedText) => {
              if (mounted) {
                const now = Date.now();
                if (lastEmployeeScanRef.current && lastEmployeeScanRef.current.text === decodedText && now - lastEmployeeScanRef.current.time < 1500) {
                  return; // Prevent duplicate scan processing
                }
                lastEmployeeScanRef.current = { text: decodedText, time: now };
                
                setAuthScanValue(decodedText);
                feedback.success();
                handleEmployeeAuthDirect(decodedText);
              }
            },
            () => {
              // Silence scanner errors (usually frame-by-frame non-detections)
            },
            { fps: 30 }
          );

          // Continuous focus setup
          try {
            const track = (html5QrCode as any).getActiveCameraTrack();
            if (track) {
              const capabilities = track.getCapabilities() as any;
              if (capabilities.focusMode && capabilities.focusMode.includes('continuous')) {
                await track.applyConstraints({
                  advanced: [{ focusMode: 'continuous' }]
                } as any);
              }
            }
          } catch (e) {
            console.warn("Attempt to configure continuous focus failed on this device:", e);
          }

          pickingTransitionRef.current = false;
        } catch (err) {
          console.error("Erro ao iniciar scanner:", err);
          pickingTransitionRef.current = false;
          setCameraActive(false);
          setErrorMsg("Não foi possível acessar a câmera. Verifique as permissões.");
        }
      }
    };

    startScanner();

    return () => {
      mounted = false;
      const scanner = scannerInstanceRef.current;
      if (scanner) {
        const state = scanner.getState();
        if (state === Html5QrcodeScannerState.SCANNING || state === Html5QrcodeScannerState.PAUSED) {
          scanner.stop()
            .then(() => scanner.clear())
            .catch(e => console.warn("Error stopping scanner", e));
        }
      }
    };
  }, [showEmployeeAuth, cameraActive]);

  // Product continuous scanner hook
  useEffect(() => {
    let mounted = true;

    const startProductScanner = async () => {
      if (isPickingCameraActive) {
        // Short delay to ensure container is in DOM
        await new Promise(resolve => setTimeout(resolve, 400));
        if (!mounted) return;
        if (productTransitionRef.current) return;

        let element = document.getElementById("product-qr-reader");
        if (!element) {
          for (let i = 0; i < 12; i++) {
            await new Promise(resolve => setTimeout(resolve, 100));
            if (!mounted) return;
            element = document.getElementById("product-qr-reader");
            if (element) break;
          }
        }
        if (!element) {
          console.warn("Element product-qr-reader not found in DOM.");
          return;
        }

        try {
          const html5QrCode = new Html5Qrcode("product-qr-reader", { 
            verbose: false, 
            formatsToSupport: [
              Html5QrcodeSupportedFormats.QR_CODE,
              Html5QrcodeSupportedFormats.CODE_128,
              Html5QrcodeSupportedFormats.EAN_13,
              Html5QrcodeSupportedFormats.EAN_8,
              Html5QrcodeSupportedFormats.DATA_MATRIX
            ] 
          });
          productScannerInstanceRef.current = html5QrCode;
          productTransitionRef.current = true;

          await startScannerWithFallback(
            html5QrCode,
            (decodedText) => {
              if (mounted) {
                const now = Date.now();
                if (lastProductScanRef.current && lastProductScanRef.current.text === decodedText && now - lastProductScanRef.current.time < 1500) {
                  return; // Prevent duplicate scan processing
                }
                lastProductScanRef.current = { text: decodedText, time: now };
                
                if (processScanRef.current) {
                  processScanRef.current(decodedText, parseInt(scanQtyRef.current) || 1);
                }
              }
            },
            () => {
              // Silence scanner noise errors
            },
            { fps: 30 }
          );

          // Configure continuous autofocus if supported
          try {
            const track = (html5QrCode as any).getActiveCameraTrack();
            if (track) {
              const capabilities = track.getCapabilities() as any;
              if (capabilities.focusMode && capabilities.focusMode.includes('continuous')) {
                await track.applyConstraints({
                  advanced: [{ focusMode: 'continuous' }]
                } as any);
              }
            }
          } catch (e) {
            console.warn("Attempt to configure continuous focus failed on product camera:", e);
          }

          productTransitionRef.current = false;
        } catch (err) {
          console.error("Erro ao iniciar scanner de produtos:", err);
          productTransitionRef.current = false;
          setIsPickingCameraActive(false);
          setErrorMsg("Não foi possível acessar a câmera de produtos. Verifique as permissões.");
        }
      }
    };

    startProductScanner();

    return () => {
      mounted = false;
      const scanner = productScannerInstanceRef.current;
      if (scanner) {
        const state = scanner.getState();
        if (state === Html5QrcodeScannerState.SCANNING || state === Html5QrcodeScannerState.PAUSED) {
          scanner.stop()
            .then(() => scanner.clear())
            .catch(e => console.warn("Error stopping scanner", e));
        }
      }
    };
  }, [isPickingCameraActive]);

  const handleEmployeeAuthDirect = (value: string) => {
    let employee = null;
    try {
      if (value && value.trim().startsWith('{')) {
        const parsed = JSON.parse(value);
        if (parsed && parsed.type === 'admin-badge' && parsed.userId) {
          employee = users.find(u => u.id === parsed.userId && u.qrCodeToken === parsed.tokenId && u.status === 'ativo');
        }
      }
    } catch (_) {}

    if (!employee) {
      const badge = badges.find(b => b.codigoCracha === value);
      if (badge) {
        if (badge.status === 'Vinculado' && badge.usuarioVinculado) {
          employee = users.find(u => u.id === badge.usuarioVinculado && u.status === 'ativo');
        }
      } else {
        employee = users.find(u => u.qrCodeToken === value && u.status === 'ativo');
      }
    }
    
    if (employee) {
      feedback.success();
      setIsFinalizing(true);
      setCameraActive(false);
      
      setTimeout(() => {
        const orderId = pickingOrder!.id;
        const employeeName = employee.fullName;
        finalizeSeparation(orderId, employee.id, employee.fullName);
        enqueueReceiptForSale(orderId, employeeName);
        setIsFinalizing(false);
        setShowEmployeeAuth(false);
        setPickingOrder(null);
      }, 1000);
    } else {
      feedback.error();
      setErrorMsg('QR Code de funcionário inválido ou inativo.');
      setAuthScanValue('');
    }
  };

  // Timer logic
  useEffect(() => {
    if (pickingOrder && pickingOrder.status === 'em_separacao') {
      const start = pickingOrder.pickStartTime || Date.now();
      timerRef.current = setInterval(() => {
        setElapsedTime(Math.floor((Date.now() - start) / 1000));
      }, 1000);
    } else {
      if (timerRef.current) clearInterval(timerRef.current);
      setElapsedTime(0);
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [pickingOrder]);

  // Auto-focus scan input when in picking mode
  useEffect(() => {
    if (!active || isMobile) return;
    const focusInterval = setInterval(() => {
      const isAnyModalOpen = showEmployeeAuth || showMissingAuthModal || showCancelAuth || showLookupCamera || !!showSuccessModel || isPickingCameraActive;
      if (pickingOrder && pickingOrder.status !== 'separado' && !isAnyModalOpen && scanInputRef.current) {
        if (document.activeElement !== scanInputRef.current && document.activeElement?.tagName !== 'INPUT') {
          console.log("[FINALIZAR DEBUG] - Auto-focando o input de código. Motivo do foco automático: Bipagem contínua ativa sem modals.");
          scanInputRef.current.focus();
        }
      }
    }, 1000);
    return () => clearInterval(focusInterval);
  }, [pickingOrder, showEmployeeAuth, showMissingAuthModal, showCancelAuth, showLookupCamera, showSuccessModel, isPickingCameraActive, isMobile, active]);

  // Handle manual refocus on click
  const handleContainerClick = (e?: React.MouseEvent) => {
    if (isMobile) return;
    if (e) {
      const target = e.target as HTMLElement;
      if (
        target.closest('button') || 
        target.closest('input') || 
        target.closest('select') || 
        target.closest('form') ||
        showEmployeeAuth || 
        showMissingAuthModal || 
        showCancelAuth || 
        showLookupCamera || 
        showSuccessModel
      ) {
        return;
      }
    }
    if (pickingOrder && !showEmployeeAuth && !showMissingAuthModal && !showCancelAuth && !showLookupCamera && !showSuccessModel && scanInputRef.current) {
      console.log("[FINALIZAR DEBUG] - Clique no container detectado. Focando input de escanear produto.");
      scanInputRef.current.focus();
    }
  };

  // Auto-focus employee auth input
  useEffect(() => {
    if (showEmployeeAuth && authInputRef.current) {
      authInputRef.current.focus();
    }
  }, [showEmployeeAuth]);

  const handleStartPicking = (sale: Sale) => {
    // Call centralized Operational Validation
    const initValidation = operationalValidationService.validatePickingInitiation(sale);
    if (!initValidation.valid) {
      alert(`Bloqueio de Erro Humano:\n${initValidation.reason}`);
      return;
    }

    if (sale.status === 'separado' || sale.status === 'finalizado') {
      setPickingOrder(sale);
      return;
    }
    
    // Check if user is already a picker or can pick
    if (!currentUser) {
      setErrorMsg("Operador não identificado. Faça login ou valide seu crachá antes de iniciar a separação.");
      feedback.error();
      return;
    }
    
    const picker = currentUser;
    startSeparation(sale.id, picker.id, picker.fullName);
    setPickingOrder({ ...sale, status: 'em_separacao', pickerId: picker.id, pickerName: picker.fullName, pickStartTime: Date.now() });
    setErrorMsg(null);
  };

  const processScanAutomatically = (decodedText: string, quantityToUse: number) => {
    const currentOrder = pickingOrderRef.current;
    if (!currentOrder) return;

    if (currentOrder.status === 'separado') {
      setErrorMsg('Este pedido já foi finalizado.');
      feedback.error();
      return;
    }

    // Identify product in current picking order using centralized Operational Validation
    const scanValidation = operationalValidationService.validatePickingScan(currentOrder, decodedText);
    if (!scanValidation.valid) {
      setErrorMsg(scanValidation.reason || `Produto não encontrado neste pedido. (Lido: "${decodedText}")`);
      setScannedProductFeedback(null);
      setLastAddedQty(null);
      feedback.error();
      return;
    }

    const item = scanValidation.matchedItem;

    const currentPicked = item.pickedQuantity || 0;
    const remaining = Math.max(0, item.quantity - currentPicked);

    if (isMobile) {
      // Open Quantity Popup for this item
      const defaultQty = remaining > 0 ? remaining : item.quantity;
      setActivePopupItem({
        item,
        currentPicked,
        expected: item.quantity
      });
      setPopupQtyStr(String(defaultQty));

      // Reset scan input
      setScanValue('');
      setErrorMsg(null);
      feedback.success();
    } else {
      // Desktop: direct quantity increment bypass
      const newQty = currentPicked + quantityToUse;
      const qtyValidation = operationalValidationService.validatePickingQuantity(item, currentPicked, newQty);
      if (!qtyValidation.valid) {
        feedback.error();
        setErrorMsg(qtyValidation.reason || "A quantidade informada excede o solicitado.");
        setScanValue('');
        return;
      }

      updatePickedQuantity(currentOrder.id, item.id, quantityToUse, currentOrder.pickerName || currentUser?.fullName);
      feedback.success();

      // Reset scan input
      setScanValue('');
      setErrorMsg(null);

      // Set nice feedback for last scan
      setScannedProductFeedback({
        ...item,
        pickedQuantity: newQty
      });
      setLastAddedQty(quantityToUse);
    }
  };

  const handleItemCardClick = (item: any) => {
    const currentPicked = item.pickedQuantity || 0;
    const remaining = Math.max(0, item.quantity - currentPicked);
    const defaultQty = remaining > 0 ? remaining : item.quantity;
    setActivePopupItem({
      item,
      currentPicked,
      expected: item.quantity
    });
    setPopupQtyStr(String(defaultQty));
  };

  const handleConfirmPopupQuantity = () => {
    if (!pickingOrder || !activePopupItem) return;
    const { item, currentPicked } = activePopupItem;
    const newQty = parseInt(popupQtyStr);
    
    // Validate quantity via Centralized Operational Validation Service
    const qtyValidation = operationalValidationService.validatePickingQuantity(item, currentPicked, newQty);
    if (!qtyValidation.valid) {
      feedback.error();
      setErrorMsg(qtyValidation.reason || "A quantidade digitada é inválida.");
      return;
    }

    // Call updatePickedQuantity with delta (since store adds currentPicked + quantity)
    const delta = newQty - currentPicked;
    updatePickedQuantity(pickingOrder.id, item.id, delta, pickingOrder.pickerName || currentUser?.fullName);
    feedback.success();

    // Close quantity select popup
    setActivePopupItem(null);
    setPopupQtyStr('');
    setErrorMsg(null);

    // Set updated feedback for last scanned item
    setScannedProductFeedback({
      ...item,
      pickedQuantity: newQty
    });
    setLastAddedQty(delta);
  };

  const handleScan = (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!pickingOrder) return;

    const searchVal = scanValue.trim();
    if (!searchVal) return;

    processScanAutomatically(searchVal, parseInt(scanQty) || 1);
  };

  const validateAdminOrMasterQR = (qrValue: string): { success: boolean; authorizedByName?: string; error?: string } => {
    // 1. Try JSON parsing
    let parsedToken = qrValue;
    let fallbackUser: any = null;
    try {
      if (qrValue && qrValue.trim().startsWith('{')) {
        const parsed = JSON.parse(qrValue);
        if (parsed) {
          if (parsed.codigoMaster) {
            parsedToken = parsed.codigoMaster;
          } else if (parsed.tokenId) {
            parsedToken = parsed.tokenId;
          } else if (parsed.qrCodeToken) {
            parsedToken = parsed.qrCodeToken;
          }
          if (parsed.userId) {
            const u = users.find(x => x.id === parsed.userId && x.status === 'ativo');
            if (u && (u.isAdmin || u.isOwner || u.isMasterAdmin || u.roleId?.includes('gerente') || u.roleId?.includes('admin') || u.roleId?.includes('supervisor'))) {
              fallbackUser = u;
            }
          }
        }
      }
    } catch (_) {}

    // 2. Try as Master credential/badge
    const res = verifyMasterCredential(parsedToken, "Conclusão com faltantes");
    if (res.success) {
      return { 
        success: true, 
        authorizedByName: res.authorizedUser?.fullName || 'Senha/Badge Master ADM' 
      };
    }

    if (fallbackUser) {
      return {
        success: true,
        authorizedByName: fallbackUser.fullName
      };
    }

    // 3. Try to match any User's qrCodeToken where user is Admin, Manager etc.
    const user = users.find(u => 
      u.status === 'ativo' && 
      (u.qrCodeToken === parsedToken || u.qrCodeToken === qrValue) &&
      (u.isAdmin || u.isOwner || u.isMasterAdmin || u.roleId?.includes('gerente') || u.roleId?.includes('admin') || u.roleId?.includes('supervisor'))
    );
    if (user) {
      return {
        success: true,
        authorizedByName: user.fullName
      };
    }

    // 4. Try matching masterBadges directly
    const badge = (masterBadges || []).find(b => b.status === 'ativo' && b.codigoMaster === parsedToken);
    if (badge) {
      const u = users.find(usr => usr.id === badge.userId && usr.status === 'ativo');
      return {
        success: true,
        authorizedByName: u?.fullName || 'Crachá Master'
      };
    }

    return {
      success: false,
      error: 'QR Code não autorizado para concluir com faltantes.'
    };
  };

  const handleStepFinalize = (e?: React.MouseEvent) => {
    console.log("[FINALIZAR DEBUG] - clique no botão Finalizar detectado");
    console.log("[FINALIZAR DEBUG] - event target para clique:", e?.target ? `${(e.target as HTMLElement).tagName} (id: ${(e.target as HTMLElement).id}, class: ${(e.target as HTMLElement).className})` : 'none');
    console.log("[FINALIZAR DEBUG] - element ativo atual antes do clique:", document.activeElement ? `${document.activeElement.tagName} (id: ${document.activeElement.id}, class: ${document.activeElement.className})` : 'none');
    if (e) {
      e.stopPropagation();
      e.preventDefault();
    }
    console.log("[FINALIZAR SEPARAÇÃO] - botão clicado");
    if (!pickingOrder) {
      console.log("[FINALIZAR SEPARAÇÃO] - Erro: Nenhuma separação ativa.");
      return;
    }

    // Centered Anti-Human Error Validation for Picking Completion
    const completionVal = operationalValidationService.validatePickingCompletion(pickingOrder);
    if (!completionVal.anyPicked) {
      alert(`Bloqueio de Erro Humano:\n${completionVal.reason}`);
      return;
    }
    
    const missing = pickingOrder.items.filter(
      item => (item.pickedQuantity || 0) < item.quantity
    );

    const hasMissing = missing.length > 0;
    console.log("[FINALIZAR DEBUG] - tem faltantes?", hasMissing ? "Sim" : "Não");
    console.log("[FINALIZAR SEPARAÇÃO] - tem faltantes?", hasMissing ? "Sim" : "Não");
    if (hasMissing) {
      console.log("[FINALIZAR SEPARAÇÃO] - itens faltantes:", missing.map(i => `${i.name} (pedido: ${i.quantity}, separado: ${i.pickedQuantity || 0})`));
      console.log("[FINALIZAR DEBUG] - modal de autorização de faltantes deveria abrir? Sim");
    }

    if (hasMissing) {
      setShowMissingAuthModal(true);
      setMissingAuthStep('confirm'); // Step 1: Confirmation Question (Não / Sim)
      setMissingAuthPassword('');
      setMissingAuthScannerActive(false);
      setMissingAuthError(null);
      console.log("[FINALIZAR SEPARAÇÃO] - modal abriu? Sim (passo confirmacao)");
    } else {
      console.log("[FINALIZAR SEPARAÇÃO] - tem faltantes? Não. Concluindo diretamente.");
      setIsFinalizing(true);
      
      const pickerNameDef = pickingOrder.pickerName || currentUser?.fullName || 'Sistema';
      const pickerIdDef = pickingOrder.pickerId || currentUser?.id || 'sys';
      const orderId = pickingOrder.id;
      
      setTimeout(() => {
        finalizeSeparation(
          orderId, 
          pickerIdDef, 
          pickerNameDef
        );
        enqueueReceiptForSale(orderId, pickerNameDef);
        setIsFinalizing(false);
        setPickingOrder(null);
        feedback.success();
        
        // Show success animation
        setShowSuccessModel({
          open: true,
          message: "Separação finalizada com sucesso"
        });

        console.log("[FINALIZAR SEPARAÇÃO] - função finalizar chamada? Sim (concluído completo)");
        console.log("[FINALIZAR SEPARAÇÃO] - estoque baixado? Sim");
        console.log("[FINALIZAR SEPARAÇÃO] - sessão limpa? Sim");
        console.log("[FINALIZAR SEPARAÇÃO] - navegação liberada? Sim");
      }, 500);
    }
  };

  const isCurrentUserAdmin = !!(currentUser && (
    currentUser.isAdmin || 
    currentUser.isOwner ||
    currentUser.isMasterAdmin ||
    currentUser.roleId?.toLowerCase().includes('gerente') || 
    currentUser.roleId?.toLowerCase().includes('admin') ||
    currentUser.roleId?.toLowerCase().includes('supervisor')
  ));

  const handleAdminSelfFinalizeMissing = () => {
    if (!pickingOrder) return;
    
    console.log("[FINALIZAR SEPARAÇÃO] - Autoliberação de ADM iniciada.");
    feedback.success();
    setIsFinalizing(true);
    setMissingAuthError(null);
    
    const pickerNameDef = pickingOrder.pickerName || currentUser?.fullName || 'Sistema';
    const pickerIdDef = pickingOrder.pickerId || currentUser?.id || 'sys';
    const authorizedByName = currentUser?.fullName || 'Administrador Autoliberado';
    const orderId = pickingOrder.id;
    
    setTimeout(() => {
      finalizeSeparation(
        orderId, 
        pickerIdDef, 
        pickerNameDef, 
        authorizedByName, 
        'senha_master'
      );
      enqueueReceiptForSale(orderId, pickerNameDef);
      setIsFinalizing(false);
      setShowMissingAuthModal(false);
      setMissingAuthStep(null);
      setPickingOrder(null);
      
      // Show success animation
      setShowSuccessModel({
        open: true,
        message: "Separação finalizada"
      });
      console.log("[FINALIZAR SEPARAÇÃO] - Administrador finalizou sem precisar de senha/QR.");
    }, 500);
  };

  const handleMissingPasswordAuth = (e: React.FormEvent) => {
    e.preventDefault();
    if (!pickingOrder || !missingAuthPassword) return;

    console.log("[FINALIZAR SEPARAÇÃO] - clicou sim? Sim (pelo input de senha)");
    console.log("[FINALIZAR SEPARAÇÃO] - validando senha master...");
    const validation = validateAdminOrMasterQR(missingAuthPassword);
    
    if (validation.success) {
      console.log("[FINALIZAR SEPARAÇÃO] - QR/senha validou? Sim (Senha Master Autorizada)");
      feedback.success();
      setIsFinalizing(true);
      setMissingAuthError(null);
      
      const pickerNameDef = pickingOrder.pickerName || currentUser?.fullName || 'Sistema';
      const pickerIdDef = pickingOrder.pickerId || currentUser?.id || 'sys';
      const authorizedByName = validation.authorizedByName || 'Senha Master Global';
      const orderId = pickingOrder.id;
      
      setTimeout(() => {
        finalizeSeparation(
          orderId, 
          pickerIdDef, 
          pickerNameDef, 
          authorizedByName, 
          'senha_master'
        );
        enqueueReceiptForSale(orderId, pickerNameDef);
        setIsFinalizing(false);
        setShowMissingAuthModal(false);
        setMissingAuthStep(null);
        setPickingOrder(null);
        
        // Show success animation
        setShowSuccessModel({
          open: true,
          message: "Separação finalizada com itens faltantes"
        });

        console.log("[FINALIZAR SEPARAÇÃO] - função finalizar chamada? Sim (concluído com faltantes)");
        console.log("[FINALIZAR SEPARAÇÃO] - estoque baixado? Sim (apenas da quantidade separada)");
        console.log("[FINALIZAR SEPARAÇÃO] - sessão limpa? Sim");
        console.log("[FINALIZAR SEPARAÇÃO] - navegação liberada? Sim");
      }, 500);
    } else {
      console.log("[FINALIZAR SEPARAÇÃO] - QR/senha validou? Não (Senha inválida)");
      feedback.error();
      setMissingAuthError('Autorização inválida.');
    }
  };

  const handleMissingQrScan = (textValue: string) => {
    console.log("[FINALIZAR SEPARAÇÃO] - clicou sim? Sim (pelo scanner de QR)");
    if (!pickingOrder || !textValue) return;

    console.log("[FINALIZAR SEPARAÇÃO] - validando QR Code ADM...");
    const validation = validateAdminOrMasterQR(textValue);

    if (validation.success) {
      console.log("[FINALIZAR SEPARAÇÃO] - QR/senha validou? Sim (QR Code Autorizado)");
      feedback.success();
      setIsFinalizing(true);
      setMissingAuthScannerActive(false);
      setShowMissingAuthModal(false);
      setMissingAuthStep(null);
      setMissingAuthError(null);
      
      const pickerNameDef = pickingOrder.pickerName || currentUser?.fullName || 'Sistema';
      const pickerIdDef = pickingOrder.pickerId || currentUser?.id || 'sys';
      const authorizedByName = validation.authorizedByName || 'QR Code ADM/Master';
      const orderId = pickingOrder.id;
      
      setTimeout(() => {
        finalizeSeparation(
          orderId, 
          pickerIdDef, 
          pickerNameDef, 
          authorizedByName, 
          'qrcode_adm'
        );
        enqueueReceiptForSale(orderId, pickerNameDef);
        setIsFinalizing(false);
        setPickingOrder(null);
        
        // Show success animation
        setShowSuccessModel({
          open: true,
          message: "Separação finalizada com itens faltantes"
        });

        console.log("[FINALIZAR SEPARAÇÃO] - função finalizar chamada? Sim (concluído com faltantes)");
        console.log("[FINALIZAR SEPARAÇÃO] - estoque baixado? Sim (apenas da quantidade separada)");
        console.log("[FINALIZAR SEPARAÇÃO] - sessão limpa? Sim");
        console.log("[FINALIZAR SEPARAÇÃO] - navegação liberada? Sim");
      }, 500);
    } else {
      console.log("[FINALIZAR SEPARAÇÃO] - QR/senha validou? Não (QR inválido)");
      feedback.error();
      setMissingAuthError('Autorização inválida.');
    }
  };

  const handleEmployeeAuth = (e: React.FormEvent) => {
    e.preventDefault();
    if (!authScanValue) return;

    let employee = null;
    try {
      if (authScanValue && authScanValue.trim().startsWith('{')) {
        const parsed = JSON.parse(authScanValue);
        if (parsed && parsed.type === 'admin-badge' && parsed.userId) {
          employee = users.find(u => u.id === parsed.userId && u.qrCodeToken === parsed.tokenId && u.status === 'ativo');
        }
      }
    } catch (_) {}

    if (!employee) {
      const badge = badges.find(b => b.codigoCracha === authScanValue);
      if (badge) {
        if (badge.status === 'Vinculado' && badge.usuarioVinculado) {
          employee = users.find(u => u.id === badge.usuarioVinculado && u.status === 'ativo');
        }
      } else {
        employee = users.find(u => u.qrCodeToken === authScanValue && u.status === 'ativo');
      }
    }
    
    if (employee) {
      feedback.success();
      setIsFinalizing(true);
      
      setTimeout(() => {
        const orderId = pickingOrder!.id;
        const employeeName = employee.fullName;
        finalizeSeparation(orderId, employee.id, employee.fullName);
        enqueueReceiptForSale(orderId, employeeName);
        setIsFinalizing(false);
        setShowEmployeeAuth(false);
        setPickingOrder(null);
      }, 1000);
    } else {
      feedback.error();
      setErrorMsg('QR Code de funcionário inválido ou inativo.');
      setAuthScanValue('');
    }
  };

  // Sync state with store
  const handlePickerNfcRead = useCallback((uid: string) => {
    const cleanUid = (uid || '').trim().toUpperCase();
    if (!cleanUid) return;

    // Hardened credential validation layer check
    const validationCheck = credentialValidationService.validateCredential(cleanUid, 'NFC', 'OPERACAO');
    if (!validationCheck.success) {
      setNfcFeedbackMessage({
        type: 'error',
        text: validationCheck.error || 'Credencial NFC inválida ou bloqueada.'
      });
      setTimeout(() => setNfcFeedbackMessage(null), 5000);
      return;
    }

    if (!pickingOrder) {
      return;
    }

    const store = useStore.getState();

    if (pickingOrder.status === 'enviado_separacao' || pickingOrder.status === 'aguardando_separacao') {
      const res = store.handleNFCOperationalAction(cleanUid, 'SEPARACAO_INICIAR', { saleId: pickingOrder.id });
      if (res.success && res.executorName && res.executorId) {
        setPickingOrder({ 
          ...pickingOrder, 
          status: 'em_separacao', 
          pickerId: res.executorId, 
          pickerName: res.executorName, 
          pickStartTime: Date.now() 
        });
        setNfcFeedbackMessage({
          type: 'success',
          text: `Iniciada separação com sucesso por ${res.executorName} via NFC!`
        });
        setTimeout(() => setNfcFeedbackMessage(null), 5000);
      } else {
        setNfcFeedbackMessage({
          type: 'error',
          text: res.error || 'Código NFC inválido para iniciar separação.'
        });
        setTimeout(() => setNfcFeedbackMessage(null), 5000);
      }
    } else if (pickingOrder.status === 'em_separacao') {
      const allPicked = pickingOrder.items.every(item => (item.pickedQuantity || 0) === item.quantity);
      if (!allPicked) {
        setNfcFeedbackMessage({
          type: 'error',
          text: 'Falta conferir/separar itens no pedido antes de finalizar via NFC!'
        });
        setTimeout(() => setNfcFeedbackMessage(null), 5000);
        return;
      }

      const res = store.handleNFCOperationalAction(cleanUid, 'SEPARACAO_FINALIZAR', { saleId: pickingOrder.id });
      if (res.success && res.executorName) {
        setPickingOrder({ ...pickingOrder, status: 'separado' });
        setNfcFeedbackMessage({
          type: 'success',
          text: `Finalizado com sucesso por ${res.executorName} via NFC!`
        });
        setTimeout(() => setNfcFeedbackMessage(null), 5000);
      } else {
        setNfcFeedbackMessage({
          type: 'error',
          text: res.error || 'NFC inválido para finalizar.'
        });
        setTimeout(() => setNfcFeedbackMessage(null), 5000);
      }
    }
  }, [pickingOrder]);



  // Integrated hardware NFC scanning via factory
  useEffect(() => {
    const service = nfcServiceFactory.getService();
    console.log(`[Picking/NFC] Setting up scanning subscription via: ${service.getPlatformName()}`);

    service.startScanning(
      (uid: string) => {
        handlePickerNfcRead(uid);
      },
      (errMessage: string) => {
        console.warn(`[Picking/NFC Hardware Failure]: ${errMessage}`);
      }
    );

    return () => {
      service.stopScanning();
    };
  }, [handlePickerNfcRead]);



  useEffect(() => {
    if (pickingOrder) {
      const s = sales.find(x => x.id === pickingOrder.id);
      if (s) {
        setPickingOrder(s);
        if (scannedProductFeedback) {
          const updatedItem = s.items.find(item => item.id === scannedProductFeedback.id);
          if (updatedItem) {
            setScannedProductFeedback(updatedItem);
          }
        }

        // Automatic finalization when all items are fully picked
        if (s.status === 'em_separacao') {
          const isAllPicked = s.items.every(item => (item.pickedQuantity || 0) === item.quantity);
          const anyPicked = s.items.some(item => (item.pickedQuantity || 0) > 0);
          
          if (isAllPicked && anyPicked) {
            console.log("[AUTO-FINALIZAR] Todos os produtos foram separados! Finalizando automaticamente...");
            
            const pickerNameDef = s.pickerName || currentUser?.fullName || 'Sistema';
            const pickerIdDef = s.pickerId || currentUser?.id || 'sys';
            const orderId = s.id;
            
            // Set local pickingOrder state to null immediately to prevent double-execution
            setPickingOrder(null);
            
            setTimeout(async () => {
              finalizeSeparation(
                orderId, 
                pickerIdDef, 
                pickerNameDef
              );
              await enqueueReceiptForSale(orderId, pickerNameDef);
              
              setShowSuccessModel({
                open: true,
                message: "Separação concluída e finalizada automaticamente!"
              });
              feedback.success();
            }, 50);
          }
        }
      }
    }
  }, [sales]);

  const handleCancelSeparationRequest = () => {
    setShowCancelAuth(true);
    setAdminPassword('');
    setErrorMsg(null);
    setCameraActive(true);
  };

  const handleAdminAuthAction = (user: AppUser) => {
    if (!pickingOrder) return;
    if (!user.isAdmin && !user.roleId.includes('gerente')) {
      setErrorMsg("Apenas administradores podem autorizar cancelamentos.");
      feedback.error();
      return;
    }

    const userName = currentUser?.fullName || 'Operador';
    const adminName = user.fullName;
    const msg = `Separação cancelada por ${userName} com autorização de ${adminName} em ${format(new Date(), "dd/MM HH:mm")}`;
    
    useStore.getState().updateSaleStatus(pickingOrder.id, 'enviado_separacao', userName, msg);
    
    setShowCancelAuth(false);
    setPickingOrder(null);
    setCameraActive(false);
    feedback.success();
  };

  const handleAdminPasswordAuth = (e: React.FormEvent) => {
    e.preventDefault();
    if (!adminPassword) return;

    const admin = users.find(u => (u.isAdmin || u.roleId.includes('gerente')) && u.password === adminPassword && u.status === 'ativo');
    if (admin) {
      handleAdminAuthAction(admin);
    } else {
      setErrorMsg("Senha administrativa inválida.");
      feedback.error();
    }
  };

  const cancelScannerRef = useRef<Html5Qrcode | null>(null);

  useEffect(() => {
    let mounted = true;

    const startCancelScanner = async () => {
      if (showCancelAuth && cameraActive) {
        await new Promise(resolve => setTimeout(resolve, 400));
        if (!mounted) return;
        if (cancelTransitionRef.current) return;

        let element = document.getElementById("cancel-qr-reader");
        if (!element) {
          for (let i = 0; i < 12; i++) {
            await new Promise(resolve => setTimeout(resolve, 100));
            if (!mounted) return;
            element = document.getElementById("cancel-qr-reader");
            if (element) break;
          }
        }
        if (!element) {
          console.warn("Element cancel-qr-reader not found in DOM.");
          return;
        }

        try {
          const scanner = new Html5Qrcode("cancel-qr-reader", { 
            verbose: false, 
            formatsToSupport: [Html5QrcodeSupportedFormats.QR_CODE] 
          });
          cancelScannerInstanceRef.current = scanner;
          cancelTransitionRef.current = true;

          await startScannerWithFallback(
            scanner,
            (decodedText) => {
              if (mounted) {
                const now = Date.now();
                if (lastCancelScanRef.current && lastCancelScanRef.current.text === decodedText && now - lastCancelScanRef.current.time < 1500) {
                  return; // Prevent duplicate scans
                }
                lastCancelScanRef.current = { text: decodedText, time: now };

                let admin = null;
                try {
                  if (decodedText && decodedText.trim().startsWith('{')) {
                    const parsed = JSON.parse(decodedText);
                    if (parsed && parsed.type === 'admin-badge' && parsed.userId) {
                      admin = users.find(u => (u.isAdmin || u.isOwner || u.isMasterAdmin || u.roleId.includes('gerente') || u.roleId.includes('admin') || u.roleId.includes('supervisor')) && u.id === parsed.userId && u.qrCodeToken === parsed.tokenId && u.status === 'ativo');
                    }
                  }
                } catch (_) {}

                if (!admin) {
                  const badge = badges.find(b => b.codigoCracha === decodedText);
                  if (badge) {
                    if (badge.status === 'Vinculado' && badge.usuarioVinculado) {
                      admin = users.find(u => (u.isAdmin || u.roleId.includes('gerente')) && u.id === badge.usuarioVinculado && u.status === 'ativo');
                    }
                  } else {
                    admin = users.find(u => (u.isAdmin || u.roleId.includes('gerente')) && u.qrCodeToken === decodedText && u.status === 'ativo');
                  }
                }

                if (admin) {
                  feedback.success();
                  handleAdminAuthAction(admin);
                } else {
                  setErrorMsg("Autorização administrativa inválida.");
                  feedback.error();
                }
              }
            },
            () => {},
            { fps: 30 }
          );

          // Continuous focus setup
          try {
            const track = (scanner as any).getActiveCameraTrack();
            if (track) {
              const capabilities = track.getCapabilities() as any;
              if (capabilities.focusMode && capabilities.focusMode.includes('continuous')) {
                await track.applyConstraints({
                  advanced: [{ focusMode: 'continuous' }]
                } as any);
              }
            }
          } catch (e) {
            console.warn("Attempt to configure continuous focus failed on this device:", e);
          }

          cancelTransitionRef.current = false;
        } catch (err) {
          console.error("Erro cancel scanner:", err);
          cancelTransitionRef.current = false;
          setCameraActive(false);
        }
      }
    };

    startCancelScanner();

    return () => {
      mounted = false;
      const scanner = cancelScannerInstanceRef.current;
      if (scanner) {
        const state = scanner.getState();
        if (state === Html5QrcodeScannerState.SCANNING || state === Html5QrcodeScannerState.PAUSED) {
          scanner.stop()
            .then(() => scanner.clear())
            .catch(e => console.warn("Error stopping cancel scanner", e));
        }
      }
    };
  }, [showCancelAuth, cameraActive]);

  const getClientName = (clientId?: string) => {
    if (!clientId) return 'Consumidor Final';
    return clients.find(c => c.id === clientId)?.name || 'Cliente Desconhecido';
  };

  const totalItemsOrdered = pickingOrder?.items.reduce((acc, i) => acc + i.quantity, 0) || 0;
  const totalItemsPicked = pickingOrder?.items.reduce((acc, i) => acc + (i.pickedQuantity || 0), 0) || 0;
  const progressPercent = totalItemsOrdered > 0 ? (totalItemsPicked / totalItemsOrdered) * 100 : 0;

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const renderMobileOrderSelection = () => {
    return (
      <div className="w-full h-full min-h-[100dvh] bg-[#09090B] text-white flex flex-col p-4 justify-between select-text overflow-y-auto relative font-sans">
        {/* 1. Cabeçalho Mobile */}
        <div className="flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2">
            <button
              onClick={() => navigate(-1)}
              className="w-10 h-10 bg-zinc-900 border border-zinc-800 rounded-xl flex items-center justify-center text-white transition-all shrink-0 cursor-pointer"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <button
              onClick={() => navigate('/')}
              className="w-10 h-10 bg-zinc-900 border border-zinc-800 rounded-xl flex items-center justify-center text-white transition-all shrink-0 cursor-pointer"
            >
              <Home className="w-5 h-5" />
            </button>
          </div>
          
          <div className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-500/10 border border-emerald-500/20 rounded-full">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            <span className="text-[9px] font-black text-emerald-400 tracking-wider uppercase">WMS Terminal Ativo</span>
          </div>

          <button
            onClick={() => setIsSettingsOpen(!isSettingsOpen)}
            className="w-10 h-10 bg-zinc-900 border border-zinc-800 rounded-xl flex items-center justify-center text-white transition-all shrink-0 cursor-pointer"
          >
            <Settings className="w-5 h-5" />
          </button>
        </div>

        {/* 2. Bloco Centralizado de Operação */}
        <div className="my-auto py-3 flex flex-col justify-center items-center space-y-4 select-none">
          <div className="text-center space-y-2">
            <div className="w-14 h-14 bg-emerald-500/10 border border-emerald-500/20 rounded-2xl flex items-center justify-center text-emerald-400 shadow-lg shadow-emerald-500/5 relative animate-pulse mx-auto">
              <ScanLine className="w-6 h-6" />
              <div className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 bg-emerald-500 border-2 border-zinc-950 rounded-full" />
            </div>
            <div className="space-y-1">
              <h2 className="text-lg font-black text-white uppercase tracking-tight leading-none">Expedição & Separação</h2>
              <p className="text-[10px] text-zinc-400 max-w-xs mx-auto leading-normal">Bipe o QR Code do pedido ou digite o número abaixo.</p>
            </div>
          </div>

          {/* 3. Ações Operacionais */}
          <div className="w-full max-w-sm space-y-2.5">
            <button
              type="button"
              onClick={() => {
                setLookupCameraTab('camera');
                setShowLookupCamera(true);
              }}
              className="w-full flex items-center justify-center gap-2 py-3 bg-emerald-600 hover:bg-emerald-555 text-black rounded-xl font-sans font-black uppercase text-[10px] tracking-widest transition-all shadow-md active:scale-[0.99] cursor-pointer"
            >
              <Camera className="w-4 h-4 stroke-[2.5px]" />
              Escanear QR Code do Pedido
            </button>

            <button
              type="button"
              onClick={() => {
                setLookupCameraTab('upload');
                setShowLookupCamera(true);
              }}
              className="w-full py-2.5 bg-zinc-900 hover:bg-zinc-855 text-zinc-300 border border-zinc-800 rounded-xl font-black uppercase text-[9px] tracking-widest transition-all active:scale-[0.99] cursor-pointer flex items-center justify-center gap-2"
            >
              <Upload className="w-3.5 h-3.5 text-emerald-400" />
              Importar arquivo de Pedido
            </button>

            {/* Divider */}
            <div className="relative flex py-1 items-center">
              <div className="flex-grow border-t border-zinc-900"></div>
              <span className="flex-shrink mx-3 text-[8px] font-black uppercase tracking-widest text-zinc-600 font-mono font-bold">OU MANUAL</span>
              <div className="flex-grow border-t border-zinc-900"></div>
            </div>

            {/* Manual Entry */}
            <form onSubmit={(e) => { e.preventDefault(); handleOrderSubmit(orderSearch); }} className="relative flex gap-1.5 font-sans">
              <div className="relative flex-1">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-zinc-650">
                  <Search className="w-3.5 h-3.5" />
                </div>
                <input 
                  ref={lookupInputRef}
                  type="text" 
                  placeholder="ID ou Nº do Pedido..."
                  value={orderSearch}
                  onChange={(e) => setOrderSearch(e.target.value)}
                  className="w-full bg-zinc-900 border border-zinc-850 focus:border-zinc-700 rounded-xl py-2 pl-9 pr-3 text-xs font-bold text-white placeholder:text-zinc-650 outline-none transition-all h-[38px]"
                />
              </div>
              <button 
                type="submit"
                className="px-4 bg-zinc-900 border border-zinc-850 text-emerald-400 rounded-xl font-black uppercase tracking-widest text-[9px] transition-all cursor-pointer hover:bg-zinc-800 hover:text-white flex items-center justify-center h-[38px]"
              >
                Confirmar
              </button>
            </form>
          </div>
        </div>

        {errorMsg && (
          <motion.div 
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="flex items-center justify-center gap-2 text-rose-500 font-sans font-black uppercase text-[9px] tracking-widest bg-rose-500/5 py-4 px-4 rounded-2xl border border-rose-500/10 whitespace-pre-line text-center shrink-0"
          >
            <XCircle className="w-4 h-4 shrink-0" />
            {errorMsg}
          </motion.div>
        )}

        {/* 4. Resumo Operacional Horizontal */}
        <div className="grid grid-cols-5 bg-zinc-900/40 p-4 rounded-3xl border border-zinc-800/20 shrink-0 items-center justify-center">
          <div className="text-center">
            <span className="block text-[8px] font-black text-zinc-500 uppercase tracking-widest">Pendentes</span>
            <span className="text-lg font-black text-white font-mono mt-0.5 block">
              {sales.filter(s => s.status === 'enviado_separacao').length}
            </span>
          </div>
          <div className="flex justify-center text-zinc-800 font-thin text-xs">|</div>
          <div className="text-center">
            <span className="block text-[8px] font-black text-indigo-400 uppercase tracking-widest">Em Processo</span>
            <span className="text-lg font-black text-indigo-400 font-mono mt-0.5 block">
              {sales.filter(s => s.status === 'em_separacao').length}
            </span>
          </div>
          <div className="flex justify-center text-zinc-800 font-thin text-xs">|</div>
          <div className="text-center">
            <span className="block text-[8px] font-black text-emerald-400 uppercase tracking-widest">Separados</span>
            <span className="text-lg font-black text-emerald-400 font-mono mt-0.5 block">
              {sales.filter(s => s.status === 'separado').length}
            </span>
          </div>
        </div>

        {/* Lookup Camera Modal Container inside mobile view */}
        <AnimatePresence>
          {showLookupCamera && (
            <QRScanner 
              title={lookupCameraTab === 'camera' ? "Escanear Pedido" : "Enviar Arquivo"}
              description={lookupCameraTab === 'camera' ? "Aponte para o QR Code do pedido" : "Selecione o arquivo do pedido (imagem ou PDF)"}
              forcedTab={lookupCameraTab}
              onScan={(text) => {
                handleOrderSubmit(text);
                setShowLookupCamera(false);
              }}
              onClose={() => setShowLookupCamera(false)}
            />
          )}
        </AnimatePresence>
      </div>
    );
  };

  if (!pickingOrder) {
    if (isMobile) {
      return renderMobileOrderSelection();
    }
    return (
      <div className="h-screen w-full bg-[#09090B] flex flex-col items-center justify-center p-4 select-text overflow-hidden selection:bg-[#bfefdf]/20 selection:text-[#bfefdf] font-sans">
        <motion.div 
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          className="w-full max-w-2xl flex flex-col gap-5"
        >
          {/* Header Navigation & Terminal Branding */}
          <div className="flex items-center justify-between border-b border-white/5 pb-5 shrink-0 select-none">
            <div className="flex items-center gap-3">
              <button
                onClick={() => navigate('/')}
                className="w-10 h-10 bg-zinc-900 border border-zinc-850 hover:bg-zinc-800 rounded-xl flex items-center justify-center text-zinc-400 hover:text-white transition-all shrink-0 cursor-pointer"
                title="Voltar ao início"
              >
                <Home className="w-5 h-5" />
              </button>
              <div className="flex flex-col">
                <span className="text-[9px] font-black uppercase text-emerald-400 tracking-widest flex items-center gap-1.5 font-mono">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                  Terminal de Separação
                </span>
                <h1 className="text-xl font-bold tracking-tight text-white uppercase mt-0.5">WMS Portal</h1>
              </div>
            </div>
            
            <div className="flex items-center gap-3">
              <div className="hidden sm:flex flex-col text-right">
                <span className="text-[8px] font-black uppercase text-[#8b9290] tracking-widest font-mono">Status do Sistema</span>
                <span className="text-[10px] font-black uppercase text-emerald-400 mt-0.5 font-mono">Conectado</span>
              </div>
              <div className="w-2.5 h-2.5 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]" />
            </div>
          </div>

          {/* Centralized Search and Operational Panel */}
          <div className="bg-[#101311]/60 border border-white/10 rounded-[32px] p-6 sm:p-8 shadow-[0_20px_50px_rgba(0,0,0,0.5)] backdrop-blur-xl relative overflow-hidden flex flex-col gap-6">
            
            {/* Background design accents */}
            <div className="absolute top-0 right-0 w-24 h-24 bg-emerald-500/5 rounded-full blur-2xl pointer-events-none" />
            
            <div className="text-center space-y-2 select-none">
              <div className="w-16 h-16 bg-emerald-500/10 border border-emerald-500/20 rounded-2xl flex items-center justify-center text-emerald-400 mx-auto shadow-xl shadow-emerald-500/5">
                <QrCode className="w-8 h-8" />
              </div>
              <h2 className="text-lg font-black text-white uppercase tracking-wider">Identificar Pedido</h2>
              <p className="text-xs text-zinc-400 max-w-md mx-auto leading-relaxed">
                Escaneie o QR Code na etiqueta ou digite o identificador para prosseguir com a expedição.
              </p>
            </div>

            {/* Scanning Quick Actions */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 mt-2 select-none">
              <button
                type="button"
                onClick={() => {
                  setLookupCameraTab('camera');
                  setShowLookupCamera(true);
                }}
                className="flex items-center justify-center gap-2.5 py-4 px-5 bg-emerald-500 hover:bg-emerald-600 font-extrabold text-black rounded-xl text-xs uppercase tracking-wider transition-all active:scale-[0.98] cursor-pointer shadow-lg shadow-emerald-500/10"
              >
                <Camera className="w-4.5 h-4.5" />
                Escanear com Câmera
              </button>
              
              <button
                type="button"
                onClick={() => {
                  setLookupCameraTab('upload');
                  setShowLookupCamera(true);
                }}
                className="flex items-center justify-center gap-2.5 py-4 px-5 bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-zinc-300 rounded-xl font-extrabold text-xs uppercase tracking-wider transition-all active:scale-[0.98] cursor-pointer"
              >
                <Upload className="w-4.5 h-4.5 text-emerald-400" />
                Carregar Imagem / PDF
              </button>
            </div>

            {/* Divider */}
            <div className="relative flex py-1 items-center justify-center select-none text-[8.5px] font-black uppercase tracking-widest text-[#8b9290]">
              <div className="flex-grow border-t border-white/5"></div>
              <span className="mx-4 text-[9px] text-[#8b9290]/55 font-mono">Digitar Manualmente</span>
              <div className="flex-grow border-t border-white/5"></div>
            </div>

            {/* Input Form Area */}
            <div className="flex flex-col gap-4">
              <form 
                onSubmit={(e) => { 
                  e.preventDefault(); 
                  handleOrderSubmit(orderSearch); 
                }} 
                className="relative"
              >
                <div className="absolute inset-y-0 left-0 pl-4.5 flex items-center pointer-events-none text-zinc-500">
                  <Search className="w-4.5 h-4.5" />
                </div>
                <input 
                  ref={lookupInputRef}
                  type="text" 
                  placeholder="ID ou Número do Pedido..."
                  value={orderSearch}
                  onChange={(e) => {
                    setOrderSearch(e.target.value);
                    if (errorMsg) setErrorMsg(null);
                  }}
                  className="w-full bg-[#070908]/90 border border-white/10 rounded-xl py-4 pl-12 pr-12 text-sm font-bold text-white placeholder:text-zinc-650 focus:border-emerald-500/50 outline-none transition-all focus:bg-black font-sans leading-none"
                />
                {orderSearch && (
                  <button
                    type="button"
                    onClick={() => {
                      setOrderSearch('');
                      setErrorMsg(null);
                    }}
                    className="absolute inset-y-0 right-0 pr-4 flex items-center text-zinc-500 hover:text-rose-400 transition-all cursor-pointer"
                  >
                    <XCircle className="w-4.5 h-4.5" />
                  </button>
                )}
              </form>

              {/* State Panel Feedbacks */}
              <AnimatePresence mode="wait">
                {/* STATE 1: WAITING FOR USER INPUT OR QUICK COMMENCING */}
                {!orderSearch.trim() && !errorMsg && (
                  <motion.div
                    key="state-waiting"
                    initial={{ opacity: 0, y: 5 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -5 }}
                    className="border border-white/5 p-4 rounded-2xl bg-zinc-950/40 flex items-center gap-3.5 shrink-0"
                  >
                    <span className="flex h-2 w-2 relative">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#a3f7bf]/20 opacity-75"></span>
                      <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500/70"></span>
                    </span>
                    <span className="text-[9.5px] font-black uppercase text-zinc-400 tracking-wider font-mono">
                      Aguardando leitura do QR Code do pedido ou digitação acima
                    </span>
                  </motion.div>
                )}

                {/* STATE 2: SCANNING / TYPING MATCH-MAKING STATE */}
                {orderSearch.trim() && !sales.find(s => String(s.orderNumber) === String(extractOrderNumberFromScan(orderSearch.trim())) || String(s.id) === String(extractOrderNumberFromScan(orderSearch.trim()))) && !errorMsg && (
                  <motion.div
                    key="state-searching"
                    initial={{ opacity: 0, y: 5 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="border border-white/5 p-4 rounded-2xl bg-zinc-950/40 flex items-center justify-center gap-3 select-none"
                  >
                    <RefreshCw className="w-3.5 h-3.5 text-emerald-400 animate-spin" />
                    <span className="text-[9px] font-black uppercase text-emerald-400 tracking-widest font-mono">
                      Buscando documento <span className="text-white font-bold font-sans">"{orderSearch}"</span> no WMS...
                    </span>
                  </motion.div>
                )}

                {/* STATE 3: ORDER LOCATED STATE - READY TO CONFIRM */}
                {(() => {
                  const cleaned = extractOrderNumberFromScan(orderSearch.trim());
                  const found = sales.find(s => String(s.orderNumber) === String(cleaned) || String(s.id) === String(cleaned));
                  if (!found || errorMsg) return null;
                  return (
                    <motion.div
                      key="state-located"
                      initial={{ opacity: 0, scale: 0.98 }}
                      animate={{ opacity: 1, scale: 1 }}
                      className="border-2 border-emerald-500/30 p-4.5 rounded-2xl bg-zinc-950/90 flex flex-col gap-3.5"
                    >
                      {/* Status badge and metadata */}
                      <div className="flex items-center justify-between select-none">
                        <div className="flex items-center gap-2">
                          <Package className="w-4.5 h-4.5 text-emerald-400 animate-pulse" />
                          <span className="text-[10px] font-black text-emerald-400 tracking-widest uppercase">
                            Pedido Identificado
                          </span>
                        </div>
                        <span className="text-[9px] font-black px-2.5 py-1 bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 rounded-full font-mono uppercase">
                          {found.status === 'em_separacao' ? 'Em Separação' : 'Aguardando'}
                        </span>
                      </div>

                      {/* Quick holographic metrics grid */}
                      <div className="grid grid-cols-2 gap-3 border-t border-b border-white/5 py-3.5 font-mono text-[10px]">
                        <div className="flex flex-col gap-0.5">
                          <span className="text-[8px] uppercase tracking-widest text-zinc-500 font-bold select-none">Identificação</span>
                          <span className="text-white font-extrabold text-[12px]">#{found.orderNumber}</span>
                        </div>
                        <div className="flex flex-col gap-0.5">
                          <span className="text-[8px] uppercase tracking-widest text-zinc-500 font-bold select-none">Quantidade de Itens</span>
                          <span className="text-emerald-400 font-extrabold text-[12px]">
                            {found.items.reduce((sum, item) => sum + item.quantity, 0)} itens
                          </span>
                        </div>
                        <div className="col-span-2 flex flex-col gap-0.5 border-t border-white/5 pt-2.5">
                          <span className="text-[8px] uppercase tracking-widest text-zinc-500 font-bold select-none">Destinatário</span>
                          <span className="text-zinc-300 font-sans font-bold uppercase truncate">
                            {getClientName(found.clientId)}
                          </span>
                        </div>
                      </div>

                      {/* Confirm actionable trigger */}
                      <button
                        type="button"
                        onClick={() => handleOrderSubmit(orderSearch)}
                        className="w-full py-4 bg-emerald-500 hover:bg-[#a3f7bf] text-[#070908] font-black uppercase tracking-widest text-xs rounded-xl shadow-lg shadow-emerald-500/10 transition-all transform active:scale-[0.99] cursor-pointer flex items-center justify-center gap-2 leading-none"
                      >
                        <PackageCheck className="w-4.5 h-4.5 shrink-0 stroke-[2.5px]" />
                        Iniciar Separação do Pedido #{found.orderNumber}
                      </button>
                    </motion.div>
                  );
                })()}

                {/* STATE 4: ERROR MSG STATUS PRESENT */}
                {errorMsg && (
                  <motion.div 
                    key="state-error"
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className="flex flex-col gap-3 p-4 bg-rose-500/5 border-2 border-rose-500/20 rounded-2xl text-center select-text shrink-0"
                  >
                    <div className="flex items-center justify-center gap-2 text-rose-400 font-black uppercase text-[10px] tracking-widest select-none">
                      <XCircle className="w-4.5 h-4.5 text-rose-500 shrink-0" />
                      Localização Rejeitada
                    </div>
                    <p className="text-[9.5px] text-zinc-300 font-medium whitespace-pre-line leading-relaxed pb-1 uppercase tracking-tight">
                      {errorMsg}
                    </p>
                    <button
                      type="button"
                      onClick={() => {
                        setOrderSearch('');
                        setErrorMsg(null);
                      }}
                      className="px-4 py-1.5 self-center bg-zinc-900 border border-zinc-800 text-zinc-400 hover:text-white rounded-lg font-black uppercase text-[8px] tracking-widest transition-all active:scale-[0.98] cursor-pointer"
                    >
                      Limpar Filtros e Bipar Novamente
                    </button>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>

          {/* Quick System Statistics footer blocks */}
          <div className="grid grid-cols-5 bg-zinc-900/40 p-4.5 rounded-[24px] border border-white/5 select-none text-center shrink-0 items-center justify-center">
            <div className="text-center">
              <span className="block text-[8px] font-black text-zinc-500 uppercase tracking-widest font-mono">Pendentes</span>
              <span className="text-lg font-black text-white font-mono mt-0.5 block leading-none">
                {sales.filter(s => s.status === 'enviado_separacao').length}
              </span>
            </div>
            <div className="flex justify-center text-zinc-850 font-thin text-[10px]">|</div>
            <div className="text-center">
              <span className="block text-[8px] font-black text-amber-500 uppercase tracking-widest font-mono">Em Processo</span>
              <span className="text-lg font-black text-amber-500 font-mono mt-0.5 block leading-none">
                {sales.filter(s => s.status === 'em_separacao').length}
              </span>
            </div>
            <div className="flex justify-center text-zinc-850 font-thin text-[10px]">|</div>
            <div className="text-center">
              <span className="block text-[8px] font-black text-emerald-400 uppercase tracking-widest font-mono">Separados</span>
              <span className="text-lg font-black text-emerald-400 font-mono mt-[#0.5px] block leading-none">
                {sales.filter(s => s.status === 'separado').length}
              </span>
            </div>
          </div>
        </motion.div>

        {/* Lookup Camera Modal */}
        <AnimatePresence>
          {showLookupCamera && (
            <QRScanner 
              title={lookupCameraTab === 'camera' ? "Escanear Pedido" : "Enviar Arquivo"}
              description={lookupCameraTab === 'camera' ? "Aponte para o QR Code do pedido" : "Selecione o arquivo do pedido (imagem ou PDF)"}
              forcedTab={lookupCameraTab}
              onScan={(text) => {
                handleOrderSubmit(text);
                setShowLookupCamera(false);
              }}
              onClose={() => setShowLookupCamera(false)}
            />
          )}
        </AnimatePresence>
      </div>
    );
  }

  // Mobile Layout for Active Picking
  const renderMobileActivePicking = () => {
    return (
      <div className="flex-1 bg-[#09090B] text-white flex flex-col min-h-0 select-text font-sans flex-1">
        {/* 1. CABEÇALHO DO PEDIDO - COMPACTO & PROGRESSIVO (Fixo) */}
        <div className="shrink-0 px-4 py-3 bg-[#111113] border-b border-zinc-805/85 space-y-2.5 shadow-md">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5 shrink-0">
              <button
                onClick={() => {
                  if (pickingOrder.status !== 'em_separacao') {
                    setPickingOrder(null);
                  } else {
                    handleCancelSeparationRequest();
                  }
                }}
                className="w-9 h-9 bg-zinc-900 border border-zinc-800 rounded-xl flex items-center justify-center text-zinc-300 hover:text-white transition-all shrink-0 cursor-pointer active:scale-95"
                title="Voltar"
              >
                <ArrowLeft className="w-4.5 h-4.5" />
              </button>

              <button
                onClick={() => {
                  if (pickingOrder.status === 'em_separacao') {
                    const confirmDiscard = window.confirm("Deseja mesmo cancelar a separação e voltar para o menu principal?");
                    if (!confirmDiscard) return;
                    handleCancelSeparationRequest();
                  }
                  navigate('/');
                }}
                className="w-9 h-9 bg-zinc-900 border border-zinc-800 rounded-xl flex items-center justify-center text-zinc-300 hover:text-white transition-all shrink-0 cursor-pointer active:scale-95"
                title="Menu Principal"
              >
                <Home className="w-4.5 h-4.5" />
              </button>
            </div>

            <div className="flex-1 min-w-0 px-1">
              <span className="text-[8.5px] font-mono text-zinc-500 uppercase tracking-widest block truncate">Separador: {pickingOrder.pickerName || currentUser?.fullName || 'Operador'}</span>
              <h2 className="text-base font-black text-white uppercase tracking-tight truncate mt-0.5 leading-none">
                Pedido <span className="text-emerald-400 font-mono">#{pickingOrder.orderNumber}</span>
              </h2>
            </div>
            
            <div className="shrink-0 flex items-center gap-1.5 px-2.5 py-1.5 bg-zinc-950 border border-zinc-800 rounded-xl">
              <Timer className="w-3.5 h-3.5 text-indigo-400 animate-pulse" />
              <span className="text-xs font-black font-mono text-white leading-none">{formatTime(elapsedTime)}</span>
            </div>
          </div>

          <div className="pt-2 border-t border-zinc-850 flex justify-between items-center text-[11px]">
            <span className="font-bold text-zinc-400 truncate uppercase tracking-widest max-w-[65%]">
              Cliente: <span className="text-white font-extrabold">{getClientName(pickingOrder.clientId)}</span>
            </span>
            <span className="font-mono text-[10.5px] text-zinc-400 font-bold shrink-0 flex items-center gap-1.5">
              <span className="text-emerald-400 font-black">{Math.round(progressPercent)}%</span>
              <span className="text-zinc-700">|</span>
              <span>{totalItemsPicked}/{totalItemsOrdered} un</span>
            </span>
          </div>

          {/* Progress Indicator with neon green highlight */}
          <div className="pt-0.5">
            <div className="h-1.5 w-full bg-zinc-950 rounded-full overflow-hidden border border-zinc-900/60 p-[1px]">
              <motion.div 
                initial={{ width: 0 }}
                animate={{ width: `${progressPercent}%` }}
                className="h-full bg-emerald-500 rounded-full shadow-[0_0_8px_#10B981]" 
              />
            </div>
          </div>
        </div>

        {/* 1.5 INPUT MANUAL DE BIPAGEM / CÓDIGO */}
        <form 
          onSubmit={(e) => {
            e.preventDefault();
            handleScan(e);
          }} 
          className="shrink-0 px-4 py-2.5 bg-zinc-950/20 border-b border-zinc-850/60 flex items-center gap-2"
        >
          <div className="w-[60px] shrink-0">
            <input 
              type="number"
              value={scanQty}
              onChange={(e) => setScanQty(e.target.value)}
              placeholder="Qtd"
              className="w-full h-10 bg-zinc-900 border border-zinc-800 rounded-xl text-center text-xs font-mono font-black text-white focus:border-zinc-700 outline-none placeholder:text-zinc-500 transition-all focus:bg-zinc-950"
            />
          </div>
          <div className="flex-1 min-w-0">
            <input 
              type="text"
              value={scanValue}
              onChange={(e) => setScanValue(e.target.value)}
              placeholder="Digite o código ou bipe produto..."
              className="w-full h-10 bg-zinc-900 border border-zinc-800 rounded-xl px-3 text-xs font-medium text-white focus:border-zinc-700 outline-none placeholder:text-zinc-500 transition-all focus:bg-zinc-950"
            />
          </div>
          <button 
            type="submit"
            className="w-10 h-10 bg-zinc-900 border border-zinc-800 text-emerald-400 hover:text-emerald-300 rounded-xl flex items-center justify-center shrink-0 hover:border-zinc-700 active:scale-95 transition-all cursor-pointer"
          >
            <Check className="w-4.5 h-4.5" />
          </button>
        </form>

        {/* 2. LISTA DE ITENS - MAIORIA DA TELA (Scrollable) */}
        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2.5 custom-scrollbar">
          {pickingOrder.items.map((item) => {
            const picked = item.pickedQuantity || 0;
            const expected = item.quantity;
            const remains = expected - picked;
            const isComplete = remains === 0;
            const isPartial = picked > 0 && picked < expected;

            // Accurate visual status per item
            let statusText = "Pendente";
            let statusColorClass = "bg-zinc-900 text-zinc-400 border border-zinc-800";
            if (isComplete) {
              statusText = "Separado";
              statusColorClass = "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20";
            } else if (isPartial) {
              statusText = "Parcial";
              statusColorClass = "bg-indigo-500/10 text-indigo-400 border border-indigo-500/20";
            } else if (item.isMissing) {
              statusText = "Cortado";
              statusColorClass = "bg-rose-500/10 text-rose-400 border border-rose-500/20";
            }

            return (
              <div 
                key={item.id}
                className={cn(
                  "p-3 rounded-2xl border transition-all flex items-center justify-between gap-3 relative overflow-hidden cursor-pointer",
                  isComplete 
                    ? "bg-emerald-500/[0.02] border-emerald-500/15" 
                    : isPartial 
                    ? "bg-indigo-500/[0.02] border-indigo-500/15"
                    : "bg-zinc-900/40 border-zinc-800/60 hover:border-zinc-800"
                )}
                onClick={() => handleItemCardClick(item)}
              >
                {/* Product image or icon */}
                <div className="w-11 h-11 bg-zinc-950 rounded-xl border border-zinc-800 relative overflow-hidden shrink-0 flex items-center justify-center font-black select-none">
                  {item.image ? (
                    <img src={item.image} referrerPolicy="no-referrer" alt={item.name} className="w-full h-full object-cover" />
                  ) : (
                    <div className="text-zinc-500 text-[10px] uppercase font-bold">{item.name.substring(0, 2)}</div>
                  )}
                  {isComplete && (
                    <div className="absolute inset-0 bg-emerald-500/10 flex items-center justify-center backdrop-blur-[1px]">
                      <CheckCircle className="w-5.5 h-5.5 text-emerald-400" />
                    </div>
                  )}
                </div>

                {/* Details layout */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 mb-1 flex-wrap">
                    <span className="text-[9px] font-mono font-bold text-zinc-500 tracking-tight">{item.code}</span>
                    {item.location && (
                      <div className="flex items-center gap-0.5 px-1.5 py-0.5 bg-zinc-900 border border-zinc-800 rounded-md">
                        <MapPin className="w-2.5 h-2.5 text-zinc-400" />
                        <span className="text-[7.5px] font-mono font-bold text-zinc-400 tracking-tight">
                          {item.location.aisle || '-'}/{item.location.shelf || '-'}/{item.location.drawer || '-'}
                        </span>
                      </div>
                    )}
                  </div>
                  <h4 className="text-[12px] font-bold text-white truncate uppercase leading-tight">{item.name}</h4>
                  
                  {/* Status row */}
                  <div className="flex items-center gap-1.5 mt-1.5">
                    <span className={cn("text-[7.5px] font-extrabold uppercase px-1.5 py-0.5 rounded border", statusColorClass)}>
                      {statusText}
                    </span>
                    {remains > 0 ? (
                      <span className="text-[8px] text-amber-500 font-mono font-bold bg-amber-500/5 border border-amber-500/10 px-1.5 py-0.5 rounded">
                        Faltam: {remains}
                      </span>
                    ) : (
                      <span className="text-[8px] text-emerald-400 font-mono font-bold bg-emerald-500/5 border border-emerald-500/10 px-1.5 py-0.5 rounded">
                        Concluído
                      </span>
                    )}
                  </div>
                </div>

                {/* Quantitative fraction & action */}
                <div className="flex items-center gap-3 shrink-0 select-none">
                  <div className="flex flex-col items-end">
                    <span className="text-[7px] font-extrabold text-zinc-500 uppercase tracking-wider leading-none mb-1">Contagem</span>
                    <div className="flex items-baseline font-mono font-bold">
                      <span className={cn("text-base font-black leading-none", remains === 0 ? "text-emerald-400" : "text-white")}>
                        {picked}
                      </span>
                      <span className="text-zinc-500 text-[10px]">/{expected}</span>
                    </div>
                  </div>

                  {!isComplete && (
                    <button 
                      onClick={(e) => {
                        e.stopPropagation();
                        setConfirmMissing(item.id);
                      }}
                      className="p-1.5 bg-zinc-900 hover:bg-rose-500/10 rounded-lg text-zinc-400 hover:text-rose-400 transition-all border border-zinc-800 active:scale-95 cursor-pointer shrink-0"
                      title="Reportar Falta"
                    >
                      <AlertTriangle className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>

                {confirmMissing === item.id && (
                  <motion.div 
                    initial={{ opacity: 0, scale: 0.98 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className="absolute inset-0 bg-rose-950/95 z-20 flex items-center justify-between px-4"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <div className="text-left">
                      <span className="text-[9px] font-black text-rose-300 uppercase tracking-wide block leading-none">Atenção</span>
                      <span className="text-[10px] font-black text-white uppercase tracking-tight mt-1 block">Confirmar falta de estoque?</span>
                    </div>
                    <div className="flex items-center gap-2 font-black">
                      <button 
                        onClick={(e) => { e.stopPropagation(); setConfirmMissing(null); }}
                        className="px-3 py-2 bg-zinc-900 border border-zinc-800 text-white rounded-lg text-[8px] uppercase tracking-widest cursor-pointer"
                      >
                        Não
                      </button>
                      <button 
                        onClick={(e) => { e.stopPropagation(); handleReportMissing(item); }}
                        className="px-3 py-2 bg-rose-600 text-white rounded-lg text-[8px] uppercase tracking-widest cursor-pointer"
                      >
                        Sim
                      </button>
                    </div>
                  </motion.div>
                )}
              </div>
            );
          })}
        </div>

        {/* 3. BIPAGEM CÂMERA OVERLAY (Se ativo) */}
        {isPickingCameraActive && (
          <div className="shrink-0 px-4 pb-2 bg-zinc-900 border-t border-zinc-800/80 pt-3 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-[9px] font-black text-zinc-500 uppercase tracking-widest">Leitor de Câmera Integrado</span>
              <span className="text-[8px] font-mono text-emerald-400 bg-emerald-500/5 border border-emerald-500/10 px-2 py-0.5 rounded animate-pulse">● LENTE DE ALTA PRECISÃO</span>
            </div>
            <div 
              id="product-qr-reader" 
              className="w-full aspect-[16/9] rounded-2xl overflow-hidden bg-black border border-indigo-500/30 relative shadow-inner"
            />
            <button 
              type="button"
              onClick={() => {
                setIsPickingCameraActive(false);
                setScannedProductFeedback(null);
              }}
              className="w-full py-3 bg-zinc-805 hover:bg-zinc-700 text-zinc-300 rounded-xl text-[9px] uppercase font-black tracking-widest transition-all cursor-pointer flex items-center justify-center gap-1.5 border border-zinc-800"
            >
              <XCircle className="w-4 h-4 text-rose-500" />
              Desativar Leitor da Câmera
            </button>
          </div>
        )}

        {/* FEEDBACK DO ÚLTIMO PRODUTO SEPARADO */}
        {scannedProductFeedback && !isPickingCameraActive && (
          <motion.div 
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="mx-4 mb-2 shrink-0 p-3 bg-zinc-900 border border-zinc-800 rounded-2xl flex items-center justify-between gap-3"
          >
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-8 h-8 rounded-lg bg-emerald-500/10 border border-emerald-500/25 flex items-center justify-center text-emerald-400 shrink-0">
                <Check className="w-4 h-4 stroke-[2.5px]" />
              </div>
              <div className="min-w-0">
                <h4 className="text-[11px] font-black text-white uppercase truncate">{scannedProductFeedback.name}</h4>
                <span className="text-[8px] font-mono text-zinc-400 block mt-0.5">Lançado: {scannedProductFeedback.pickedQuantity || 0} de {scannedProductFeedback.quantity} un.</span>
              </div>
            </div>
            <button 
              onClick={() => setScannedProductFeedback(null)} 
              className="text-zinc-400 hover:text-white text-xs font-bold font-mono px-2 py-0.5 select-none"
            >
              OK
            </button>
          </motion.div>
        )}

        {/* FEEDBACK DE ERRO SE EXISTENTE */}
        {errorMsg && (
          <motion.div 
            initial={{ opacity: 0, y: 5 }}
            animate={{ opacity: 1, y: 0 }}
            className="mx-4 mb-2 shrink-0 p-3 bg-rose-500/5 border border-rose-500/10 rounded-2xl flex items-start gap-2.5 text-rose-500"
          >
            <XCircle className="w-4.5 h-4.5 shrink-0 mt-0.5" />
            <div className="min-w-0">
              <span className="text-[7.5px] font-black uppercase tracking-wider text-rose-400 block leading-none">ALERTA OPERACIONAL</span>
              <p className="text-[10px] font-bold mt-1 leading-tight">{errorMsg}</p>
            </div>
          </motion.div>
        )}

        {/* 4. OPERATIONAL FOOTER COMPACTO & PERSISTENTE (Fixo) */}
        <div className="shrink-0 p-4 bg-[#111113] border-t border-zinc-805/85 grid grid-cols-12 gap-3 shadow-2xl items-center z-10">
          <button 
            type="button"
            onClick={() => {
              setIsPickingCameraActive(prev => !prev);
              setScannedProductFeedback(null);
              setErrorMsg(null);
            }}
            className={cn(
              "col-span-4 h-11 rounded-xl flex items-center justify-center gap-1.5 text-[10px] font-black uppercase tracking-widest transition-all cursor-pointer border",
              isPickingCameraActive 
                ? "bg-rose-500/15 text-rose-400 border-rose-500/30 shadow-[0_0_12px_rgba(239,68,68,0.1)]" 
                : "bg-zinc-900 hover:bg-zinc-850 text-zinc-300 border-zinc-800/80 active:scale-95"
            )}
            title="Escanear produto via câmera"
          >
            <Camera className="w-4 h-4 shrink-0" />
            <span>Escaneia</span>
          </button>

          <button 
            type="button"
            onClick={(e) => handleStepFinalize(e)}
            disabled={isFinalizing || pickingOrder.status === 'separado'}
            className={cn(
              "col-span-8 h-11 rounded-xl flex items-center justify-center gap-1.5 text-[10.5px] font-black uppercase tracking-widest transition-all relative overflow-hidden active:scale-[0.98] cursor-pointer",
              pickingOrder.status === 'separado' 
                ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 animate-pulse" 
                : "bg-emerald-600 hover:bg-emerald-500 text-white shadow-lg active:scale-95"
            )}
          >
            {isFinalizing ? (
              <RefreshCw className="w-4 h-4 animate-spin shrink-0" />
            ) : pickingOrder.status === 'separado' ? (
              <CheckCircle2 className="w-4.5 h-4.5 shrink-0" />
            ) : (
              <Box className="w-4.5 h-4.5 shrink-0" />
            )}
            <span>{pickingOrder.status === 'separado' ? "Finalizado" : "Finalizar"}</span>
          </button>
        </div>
      </div>
    );
  };

  return (
    <div className="h-screen bg-[#0A0A0A] flex flex-col overflow-hidden relative">
      {isMobile ? (
        renderMobileActivePicking()
      ) : (
        <div className="flex-1 flex flex-col lg:flex-row min-h-0 bg-[#0A0A0A]">
          {/* Left: Product List */}
          <div className="flex-1 lg:flex-[1.8] flex flex-col min-h-0">
            <div className="p-3 border-b border-zinc-900 bg-zinc-950/50 flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
               {pickingOrder.status !== 'em_separacao' && (
                 <button 
                  onClick={() => setPickingOrder(null)}
                  className="w-8 h-8 bg-zinc-90 w hover:bg-zinc-800 rounded-lg flex items-center justify-center text-zinc-300 transition-all border border-zinc-850 cursor-pointer"
                 >
                   <ArrowLeft className="w-4 h-4" />
                 </button>
               )}
               <div>
                  <h3 className="text-sm font-black text-white uppercase tracking-wider flex items-center gap-1.5">
                    Pedido <span className="text-emerald-400 font-mono">#{pickingOrder.orderNumber}</span>
                  </h3>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-[8px] font-black text-zinc-500 uppercase tracking-wider">{getClientName(pickingOrder.clientId)}</span>
                    <div className="w-1 h-1 bg-zinc-800 rounded-full" />
                    <span className="text-[8px] font-black text-zinc-500 uppercase tracking-wider flex items-center gap-1">
                      <Clock className="w-2.5 h-2.5 text-zinc-600" /> {format(pickingOrder.timestamp, "HH:mm")}
                    </span>
                  </div>
               </div>
            </div>

            <div className="flex items-center gap-4">
               <div className="text-right">
                  <span className="block text-[7px] font-black text-zinc-500 uppercase tracking-wider mb-0.5">Cronômetro</span>
                  <div className="flex items-center gap-1 text-emerald-400">
                    <Timer className="w-3.5 h-3.5" />
                    <span className="text-xs font-black font-mono leading-none">{formatTime(elapsedTime)}</span>
                  </div>
               </div>
               <div className="h-8 w-px bg-zinc-900" />
               <div className="text-right">
                  <span className="block text-[7px] font-black text-zinc-500 uppercase tracking-wider mb-0.5">Progresso</span>
                  <div className="flex items-center gap-1.5">
                    <div className="h-1.5 w-20 bg-zinc-900 rounded-full overflow-hidden border border-zinc-850">
                       <motion.div 
                        initial={{ width: 0 }}
                        animate={{ width: `${progressPercent}%` }}
                        className="h-full bg-emerald-500" 
                       />
                    </div>
                    <span className="text-[10px] font-black font-mono text-white leading-none">{Math.round(progressPercent)}%</span>
                  </div>
               </div>
            </div>
          </div>

          {/* NFC Operation Feedback Banners */}
          {nfcFeedbackMessage && (
            <div className={cn(
              "px-4 py-2 border-b flex items-center justify-between text-[11px] font-sans transition-all",
              nfcFeedbackMessage.type === 'success' 
                ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-400" 
                : "bg-rose-500/10 border-rose-500/20 text-rose-400"
            )}>
              <div className="flex items-center gap-2 font-bold uppercase tracking-wide">
                <RefreshCw className={cn("w-3.5 h-3.5", nfcFeedbackMessage.type === 'success' ? "animate-spin" : "")} />
                <span>{nfcFeedbackMessage.text}</span>
              </div>
              <button 
                onClick={() => setNfcFeedbackMessage(null)}
                className="text-[9px] uppercase font-black tracking-widest opacity-60 hover:opacity-100 cursor-pointer"
              >
                Fechar
              </button>
            </div>
          )}

          {!nfcFeedbackMessage && (pickingOrder.status === 'enviado_separacao' || pickingOrder.status === 'aguardando_separacao' || pickingOrder.status === 'em_separacao') && (
            <div className="px-4 py-2 bg-indigo-500/5 border-b border-indigo-500/10 flex items-center justify-between text-[10px] font-sans text-indigo-400">
              <div className="flex items-center gap-1.5 uppercase font-semibold tracking-wider">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-indigo-450 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-indigo-500"></span>
                </span>
                <span>NFC Ativo: aproxime a tag para {pickingOrder.status === 'em_separacao' ? 'concluir' : 'iniciar'}</span>
              </div>
            </div>
          )}

          <div className="flex-1 overflow-y-auto p-2.5 space-y-1.5 custom-scrollbar" onClick={handleContainerClick}>
            {pickingOrder.items.map((item) => {
              const remains = item.quantity - (item.pickedQuantity || 0);
              const isComplete = remains === 0;

              return (
                <motion.div 
                  key={item.id}
                  layout
                  className={cn(
                    "p-2 rounded-xl border transition-all flex items-center gap-3 group relative overflow-hidden",
                    isComplete 
                      ? "bg-emerald-950/10 border-emerald-500/20" 
                      : "bg-zinc-950/20 border-zinc-900/60"
                  )}
                >
                  <div className="w-9 h-9 bg-zinc-900 rounded-md border border-zinc-800 shrink-0 flex items-center justify-center font-black relative overflow-hidden">
                    {item.image ? (
                      <img src={item.image} alt={item.name} className="w-full h-full object-cover" />
                    ) : (
                      <div className="text-zinc-600 text-[9px] select-none uppercase">{item.name.substring(0, 2)}</div>
                    )}
                    {isComplete && (
                      <div className="absolute inset-0 bg-emerald-500/30 flex items-center justify-center backdrop-blur-xs">
                        <CheckCircle className="w-4.5 h-4.5 text-white" />
                      </div>
                    )}
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 mb-0.5">
                      <span className="text-[8px] font-black font-mono text-emerald-400 tracking-wider uppercase">{item.code}</span>
                      <div className="flex items-center gap-0.5 px-1 py-0.5 bg-emerald-500/[0.04] border border-emerald-500/10 rounded">
                        <MapPin className="w-2 h-2 text-emerald-500" />
                        <span className="text-[7.5px] font-bold text-emerald-500 uppercase leading-none">
                          {item.location?.aisle || '-'}/{item.location?.shelf || '-'}/{item.location?.drawer || '-'}
                        </span>
                      </div>
                    </div>
                    <h4 className="text-[10.5px] font-bold text-white truncate uppercase">{item.name}</h4>
                  </div>

                  <div className="flex items-center gap-3 text-right shrink-0">
                    <div className="flex flex-col min-w-[50px]">
                       <span className="text-[5.5px] font-black text-zinc-500 uppercase tracking-widest leading-none mb-0.5">Status</span>
                       <span className={cn(
                         "text-[7px] font-black uppercase px-1.5 py-0.5 rounded-md inline-block w-fit ml-auto border",
                         isComplete ? "bg-emerald-950/40 text-emerald-400 border-emerald-900" : "bg-amber-950/30 text-amber-500 border-amber-900/40"
                       )}>
                         {isComplete ? 'OK' : 'PEND'}
                       </span>
                    </div>

                    <div className="flex flex-col min-w-[45px]">
                       <span className="text-[5.5px] font-black text-zinc-500 uppercase tracking-widest leading-none mb-0.5">Qtd</span>
                       <div className="flex items-end justify-end gap-0.5 leading-none">
                          <span className={cn("text-sm font-black font-mono", isComplete ? "text-emerald-400" : "text-white")}>
                            {item.pickedQuantity || 0}
                          </span>
                          <span className="text-zinc-600 text-[8.5px] font-bold">/{item.quantity}</span>
                       </div>
                    </div>

                    {!isComplete && (
                      <button 
                        onClick={(e) => {
                          e.stopPropagation();
                          setConfirmMissing(item.id);
                        }}
                        className="p-1.5 hover:bg-red-500/10 rounded-md text-zinc-600 hover:text-red-400 transition-all border border-transparent hover:border-red-500/20 cursor-pointer"
                        title="Reportar Falta"
                      >
                        <AlertTriangle className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>

                  {confirmMissing === item.id && (
                    <motion.div 
                      initial={{ opacity: 0, x: 20 }}
                      animate={{ opacity: 1, x: 0 }}
                      className="absolute inset-0 bg-red-600 z-10 flex items-center justify-between px-4"
                    >
                      <span className="text-[9px] font-black text-white uppercase tracking-wider">Confirmar falta de estoque para este item?</span>
                      <div className="flex items-center gap-3">
                        <button 
                          onClick={(e) => { e.stopPropagation(); setConfirmMissing(null); }}
                          className="px-3 py-1.5 bg-black/20 hover:bg-black/40 text-white rounded-lg text-[9px] font-black uppercase tracking-widest transition-all"
                        >
                          Cancelar
                        </button>
                        <button 
                          onClick={(e) => { e.stopPropagation(); handleReportMissing(item); }}
                          className="px-3 py-1.5 bg-white text-red-600 hover:bg-white/90 text-white rounded-lg text-[9px] font-black uppercase tracking-widest transition-all"
                        >
                          Confirmar Falta
                        </button>
                      </div>
                    </motion.div>
                  )}
                </motion.div>
              );
            })}
          </div>
        </div>

        {/* Right: Operational Panel */}
        <div className="w-full lg:w-[320px] border-l border-zinc-900 bg-zinc-950/40 p-4 flex flex-col gap-4">
           <div className="space-y-4">
              <div className="bg-gradient-to-br from-zinc-900 to-zinc-950 border border-zinc-805 rounded-xl p-4 shadow-md relative overflow-hidden group">
                 <div className="absolute top-0 right-0 p-3">
                    <ScanLine className="w-10 h-10 text-white/5 group-hover:rotate-12 transition-all" />
                 </div>
                 
                 <h3 className="text-white font-black text-sm uppercase tracking-wider leading-tight relative">Bipagem Ativa</h3>
                 <div className="flex items-center justify-between mt-2 relative z-10">
                   <p className="text-white/40 text-[10px] font-bold uppercase tracking-widest">
                     {isPickingCameraActive ? "● Câmera Ativa" : "● Pronto para leitura"}
                   </p>
                   <button 
                     type="button"
                     onClick={() => {
                       setIsPickingCameraActive(prev => !prev);
                       setScannedProductFeedback(null);
                       setErrorMsg(null);
                     }}
                     className={cn(
                       "px-3 py-1.5 rounded-xl transition-all text-[9.5px] font-black uppercase tracking-wider flex items-center gap-1.5 cursor-pointer border",
                       isPickingCameraActive 
                         ? "bg-red-500/20 text-red-200 border-red-500/30 hover:bg-red-500/35" 
                         : "bg-white/10 text-white hover:bg-white/15 border-white/10"
                     )}
                   >
                     <Camera className="w-3.5 h-3.5" />
                     {isPickingCameraActive ? "Desativar" : "Escanear QR"}
                   </button>
                 </div>

                 {isPickingCameraActive && (
                   <div className="mt-4 space-y-2 relative z-10">
                     <div 
                       id="product-qr-reader" 
                       className="w-full aspect-[4/3] rounded-2xl overflow-hidden bg-black/95 border border-white/15 relative shadow-inner flex items-center justify-center [&_video]:object-contain"
                     />
                     <button 
                       type="button"
                       onClick={() => {
                         setIsPickingCameraActive(false);
                         setScannedProductFeedback(null);
                       }}
                       className="w-full py-2 bg-white/5 hover:bg-white/10 border border-white/5 text-white/60 hover:text-white rounded-xl text-[9px] uppercase font-black tracking-widest transition-all cursor-pointer flex items-center justify-center gap-1.5"
                     >
                       <XCircle className="w-3.5 h-3.5" />
                       Fechar Câmera
                     </button>
                   </div>
                 )}

                 <form onSubmit={handleScan} className="mt-8 space-y-4">
                    <div className="grid grid-cols-3 gap-3">
                       <div className="space-y-1">
                          <label className="text-[8px] font-black text-white/50 uppercase tracking-widest ml-1">Qtd</label>
                          <input 
                            type="number"
                            value={scanQty}
                            onChange={(e) => setScanQty(e.target.value)}
                            className="w-full bg-zinc-950 border border-zinc-850 rounded-lg py-1.5 px-3 text-white font-mono text-center focus:border-emerald-500/40 outline-none text-xs"
                          />
                       </div>
                       <div className="col-span-2 space-y-1">
                          <label className="text-[8px] font-black text-white/50 uppercase tracking-widest ml-1">Escanear Produto</label>
                          <input 
                            ref={scanInputRef}
                            type="text"
                            value={scanValue}
                            onChange={(e) => setScanValue(e.target.value)}
                            placeholder="Aponte o leitor"
                            className="w-full bg-zinc-950 border border-zinc-850 rounded-lg py-1.5 px-3 text-xs font-bold text-white placeholder:text-zinc-700 focus:border-emerald-500/40 outline-none"
                          />
                       </div>
                    </div>
                    <button type="submit" className="hidden" />
                 </form>
              </div>

              {errorMsg && (
                <motion.div 
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="p-5 bg-red-500/10 border border-red-500/20 rounded-[32px] flex items-center gap-4 text-red-500"
                >
                   <XCircle className="w-5 h-5 shrink-0" />
                   <div className="min-w-0 text-left">
                      <p className="text-[10px] font-black uppercase tracking-widest border-b border-red-500/20 pb-0.5 mb-1">Erro de Leitura</p>
                      <p className="text-[11px] font-bold leading-tight whitespace-pre-line">{errorMsg}</p>
                   </div>
                </motion.div>
              )}

              <div className="grid grid-cols-2 gap-3">
                 <div className="bg-zinc-900/40 border border-zinc-900/60 p-3 rounded-lg space-y-0.5">
                    <span className="block text-[7.5px] font-black text-zinc-500 uppercase tracking-wider">Total Itens</span>
                    <span className="text-sm font-black text-white font-mono">{totalItemsPicked} <span className="text-zinc-650 text-[10px] font-bold">/ {totalItemsOrdered}</span></span>
                 </div>
                 <div className="bg-zinc-900/40 border border-zinc-900/60 p-3 rounded-lg space-y-0.5">
                    <span className="block text-[7.5px] font-black text-zinc-500 uppercase tracking-wider">Tempo</span>
                    <span className="text-sm font-black text-emerald-400 font-mono">{formatTime(elapsedTime)}</span>
                 </div>
              </div>
           </div>

           <div className="mt-auto pt-4 flex flex-col gap-3">
            <div className="flex items-center gap-2.5 w-full">
              {pickingOrder.status === 'em_separacao' ? (
                <>
                  <button 
                   type="button"
                   onClick={(e) => { e.stopPropagation(); handleCancelSeparationRequest(); }}
                   className="flex-1 py-4 bg-red-500/10 hover:bg-red-500/20 text-red-500 rounded-[20px] text-[10px] font-black uppercase tracking-normal border border-red-500/10 flex items-center justify-center gap-1.5 active:scale-95 transition-all h-[52px] min-w-0 cursor-pointer"
                  >
                   <XCircle className="w-4 h-4 shrink-0" /> <span className="truncate">Cancelar</span>
                  </button>

                  <button 
                    type="button"
                    onClick={(e) => handleStepFinalize(e)}
                    disabled={isFinalizing || pickingOrder.status === 'separado'}
                    className={cn(
                      "flex-[1.4] py-4 rounded-[20px] flex items-center justify-center gap-2 text-[10px] text-center font-black uppercase tracking-normal transition-all relative overflow-hidden active:scale-95 h-[52px] min-w-0 cursor-pointer",
                      pickingOrder.status === 'separado' 
                        ? "bg-emerald-500/10 text-emerald-500 border border-emerald-500/20" 
                        : "bg-emerald-600 hover:bg-emerald-500 text-white shadow-lg shadow-emerald-950/10"
                    )}
                  >
                    {pickingOrder.status === 'separado' ? (
                      <>
                        <CheckCircle2 className="w-4 h-4 shrink-0" />
                        <span className="truncate">Concluído</span>
                      </>
                    ) : (
                      <>
                        {isFinalizing ? <RefreshCw className="w-4 h-4 animate-spin shrink-0" /> : <Box className="w-4 h-4 shrink-0" />}
                        <span className="truncate">Concluir</span>
                      </>
                    )}
                  </button>
                </>
              ) : (
                <button 
                  type="button"
                  onClick={(e) => handleStepFinalize(e)}
                  disabled={isFinalizing || pickingOrder.status === 'separado'}
                  className={cn(
                    "w-full py-4 rounded-[20px] flex items-center justify-center gap-2 text-[10px] font-black uppercase tracking-normal transition-all relative overflow-hidden active:scale-[0.98] h-[52px] cursor-pointer",
                    pickingOrder.status === 'separado' 
                      ? "bg-emerald-500/10 text-emerald-500 border border-emerald-500/20" 
                      : "bg-emerald-600 hover:bg-emerald-500 text-white shadow-lg shadow-emerald-950/10"
                  )}
                >
                  {pickingOrder.status === 'separado' ? (
                    <>
                      <CheckCircle2 className="w-4 h-4 shrink-0" />
                      <span>Concluído</span>
                    </>
                  ) : (
                    <>
                      {isFinalizing ? <RefreshCw className="w-4 h-4 animate-spin shrink-0" /> : <Box className="w-4 h-4 shrink-0" />}
                      <span>Concluir</span>
                    </>
                  )}
                </button>
              )}
            </div>

             <div className="text-center pt-1">
                <p className="text-[8px] font-black text-white/10 uppercase tracking-widest">Fluxo Operacional Lukasfe</p>
             </div>
          </div>
        </div>
      </div>
      )}

      {/* Employee Auth Modal overlay */}
      <AnimatePresence>
        {showEmployeeAuth && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] flex items-center justify-center p-6 bg-black/80 backdrop-blur-md"
          >
            <motion.div 
              initial={{ scale: 0.9, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.9, y: 20 }}
              className="w-full max-w-lg bg-[#121212] border border-white/10 rounded-[48px] p-10 flex flex-col items-center text-center space-y-8 shadow-3xl"
            >
              <div className="w-24 h-24 bg-indigo-500/10 rounded-[32px] flex items-center justify-center text-indigo-500">
                 <QrCode className="w-12 h-12" />
              </div>
              
              <div className="space-y-2">
                <h2 className="text-3xl font-black text-white uppercase tracking-tighter">Identificar Funcionário</h2>
                <p className="text-white/40 text-[10px] font-black uppercase tracking-widest">Aponte o QR Code do seu crachá para a câmera para validar</p>
              </div>

              <div className="space-y-4 w-full">
                <div className="flex flex-col items-center gap-4">
                  {!cameraActive ? (
                    <button 
                      onClick={() => setCameraActive(true)}
                      className="w-full py-6 bg-indigo-500 text-white rounded-3xl font-black uppercase tracking-widest flex items-center justify-center gap-3 shadow-xl hover:bg-indigo-400 transition-all"
                    >
                      <Camera className="w-6 h-6" />
                      Abrir Câmera para Escanear
                    </button>
                  ) : (
                      <div className="w-full space-y-4 flex flex-col items-center">
                        <div className="relative rounded-3xl overflow-hidden border border-white/10 bg-black aspect-square w-full max-w-[320px]">
                          <div id="employee-qr-reader" className="w-full h-full [&_video]:object-contain [&_video]:w-full [&_video]:h-full"></div>
                          <div className="absolute inset-0 border-2 border-indigo-500/50 rounded-3xl pointer-events-none flex items-center justify-center">
                            <div className="w-64 h-64 border-2 border-dashed border-white/30 rounded-2xl flex items-center justify-center">
                               <div className="w-full h-[1px] bg-indigo-500/50 animate-scanner-scan"></div>
                            </div>
                          </div>
                        </div>
                      <button 
                        onClick={() => setCameraActive(false)}
                        className="w-full py-3 bg-white/5 hover:bg-white/10 rounded-2xl text-[10px] font-black uppercase tracking-widest text-white/40 transition-all"
                      >
                        Digitação Manual / Cancelar Câmera
                      </button>
                    </div>
                  )}
                </div>

                {!cameraActive && (
                  <form onSubmit={handleEmployeeAuth} className="w-full">
                    <input 
                      ref={authInputRef}
                      type="password"
                      value={authScanValue}
                      onChange={(e) => setAuthScanValue(e.target.value)}
                      placeholder="Escaneie seu crachá ou digite..."
                      className="w-full bg-white/5 border border-white/10 rounded-2xl py-6 px-4 text-center text-xl font-bold text-white focus:border-indigo-500 outline-none"
                    />
                  </form>
                )}
              </div>

              <div className="flex items-center gap-4 w-full">
                 <button 
                  onClick={() => {
                    setShowEmployeeAuth(false);
                    setCameraActive(false);
                  }}
                  className="flex-1 py-4 bg-white/5 hover:bg-white/10 rounded-2xl text-[10px] font-black uppercase tracking-widest text-white/40 transition-all"
                 >
                   Cancelar
                 </button>
              </div>

              {errorMsg && (
                <p className="text-[10px] font-black uppercase text-red-500 tracking-widest animate-bounce">{errorMsg}</p>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Concluir com Itens Faltantes Modal Overlay */}
      <AnimatePresence>
        {showMissingAuthModal && pickingOrder && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[110] flex items-center justify-center p-4 md:p-6 bg-black/90 backdrop-blur-md"
          >
            <motion.div 
              initial={{ scale: 0.95, y: 15 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.95, y: 15 }}
              className="w-full max-w-md md:max-w-xl bg-[#111111]/95 border border-white/10 rounded-2xl md:rounded-[36px] p-5 md:p-8 flex flex-col space-y-5 md:space-y-6 shadow-2xl text-left max-h-[92vh] md:max-h-[90vh] overflow-y-auto mx-4 backdrop-blur-xl relative"
            >
              {missingAuthStep === 'confirm' ? (
                <>
                  <div className="flex items-start md:items-center gap-4">
                    <div className="w-12 h-12 md:w-14 md:h-14 bg-rose-500/10 rounded-xl md:rounded-2xl flex items-center justify-center text-rose-500 shrink-0">
                      <AlertTriangle className="w-6 h-6 md:w-7 md:h-7" />
                    </div>
                    <div>
                      <h2 className="text-lg md:text-xl font-black text-rose-500 uppercase tracking-tight">Separação incompleta</h2>
                      <p className="text-white/80 font-bold text-xs md:text-sm mt-1 leading-snug">Alguns produtos pedidos estão em falta. Confirmar a finalização?</p>
                    </div>
                  </div>

                  {/* List of missing items */}
                  <div className="space-y-2">
                    <p className="text-[9px] font-black uppercase tracking-wider text-white/30">Resumo de Produtos Cortados:</p>
                    <div className="bg-[#161616] rounded-2xl border border-white/5 divide-y divide-white/5 max-h-[190px] md:max-h-[250px] overflow-y-auto">
                      {pickingOrder.items
                        .filter(item => (item.pickedQuantity || 0) < item.quantity)
                        .map((item, idx) => {
                          const picked = item.pickedQuantity || 0;
                          const missingQty = item.quantity - picked;
                          return (
                            <div key={idx} className="p-3.5 flex items-center justify-between gap-3 font-sans">
                              <div className="flex-1 min-w-0">
                                <p className="text-xs font-bold text-white leading-normal break-words">{item.name}</p>
                                <p className="text-[9px] font-mono font-medium text-white/40 mt-0.5 tracking-wider uppercase">{item.code}</p>
                              </div>
                              <div className="flex items-center gap-2.5 text-right shrink-0">
                                <div className="px-2 py-1 bg-white/5 rounded-lg text-center min-w-[34px]">
                                  <p className="text-[7px] font-black text-white/45 uppercase tracking-wider">Ped.</p>
                                  <p className="text-xs font-extrabold text-white font-mono">{item.quantity}</p>
                                </div>
                                <div className="px-2 py-1 bg-emerald-500/10 rounded-lg text-center min-w-[34px]">
                                  <p className="text-[7px] font-black text-emerald-500/70 uppercase tracking-wider font-extrabold">Sep.</p>
                                  <p className="text-xs font-extrabold text-emerald-400 font-mono">{picked}</p>
                                </div>
                                <div className="px-2 py-1 bg-rose-500/15 rounded-lg text-center min-w-[34px]">
                                  <p className="text-[7px] font-black text-rose-500 uppercase tracking-wider font-extrabold">Falta</p>
                                  <p className="text-xs font-extrabold text-rose-500 font-mono">-{missingQty}</p>
                                </div>
                              </div>
                            </div>
                          );
                        })}
                    </div>
                  </div>

                  <div className="flex flex-col sm:flex-row items-center gap-3 pt-4 border-t border-white/5 font-sans">
                    <button 
                      onClick={() => {
                        setShowMissingAuthModal(false);
                        setMissingAuthStep(null);
                        console.log("[FINALIZAR SEPARAÇÃO] - Clicou Não: abortando.");
                      }}
                      className="w-full sm:flex-1 py-3.5 bg-white/5 hover:bg-white/10 active:bg-white/20 rounded-xl text-xs font-black uppercase tracking-wider text-rose-400 transition-all text-center cursor-pointer min-h-[48px]"
                    >
                      Não, Cancelar
                    </button>
                    <button 
                      onClick={() => {
                        if (isCurrentUserAdmin) {
                          handleAdminSelfFinalizeMissing();
                        } else {
                          setMissingAuthStep('authorize');
                          setMissingAuthPassword('');
                          setMissingAuthError(null);
                          console.log("[FINALIZAR SEPARAÇÃO] - Clicou Sim: Abrindo câmera e solicitando autorização.");
                        }
                      }}
                      className="w-full sm:flex-1 py-3.5 bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 rounded-xl text-xs font-black uppercase tracking-wider text-white transition-all text-center cursor-pointer min-h-[48px] shadow-lg shadow-emerald-500/10"
                    >
                      {isCurrentUserAdmin ? 'Sim, Finalizar (ADM)' : 'Sim, Continuar'}
                    </button>
                  </div>
                </>
              ) : (
                <div className="flex flex-col space-y-4 md:space-y-5">
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 bg-indigo-500/10 rounded-2xl flex items-center justify-center text-indigo-400 shrink-0">
                      <ShieldCheck className="w-6 h-6 animate-pulse" />
                    </div>
                    <div>
                      <h2 className="text-base font-black text-white uppercase tracking-tight leading-none">Autorização requerida</h2>
                      <p className="text-white/50 text-[10px] font-bold mt-1.5 leading-snug">Escaneia o QR Code ADM/Master ou insira a senha para confirmar a baixa.</p>
                    </div>
                  </div>

                  {/* Improved QR Scanner Camera Frame */}
                  <div className="relative w-full aspect-[4/3] bg-black rounded-2xl border border-indigo-500/30 overflow-hidden flex flex-col items-center justify-center shadow-inner">
                    <video 
                      ref={missingAuthVideoRef}
                      className="w-full h-full object-cover scale-x-[-1]"
                      playsInline
                      muted
                      id="missing-auth-video-tag"
                    />
                    
                    {/* Targeting scanning reticle frame overlay */}
                    <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                      <div className="w-40 h-40 md:w-48 md:h-48 border-2 border-dashed border-white/10 rounded-2xl relative flex items-center justify-center">
                        {/* Brackets in the corners */}
                        <div className="absolute top-0 left-0 w-6 h-6 border-t-4 border-l-4 border-indigo-500 rounded-tl-lg"></div>
                        <div className="absolute top-0 right-0 w-6 h-6 border-t-4 border-r-4 border-indigo-500 rounded-tr-lg"></div>
                        <div className="absolute bottom-0 left-0 w-6 h-6 border-b-4 border-l-4 border-indigo-500 rounded-bl-lg"></div>
                        <div className="absolute bottom-0 right-0 w-6 h-6 border-b-4 border-r-4 border-indigo-500 rounded-br-lg"></div>
                        
                        {/* Moving Laser Line with framer-motion */}
                        <motion.div 
                          animate={{ y: [-70, 70] }}
                          transition={{ 
                            repeat: Infinity, 
                            repeatType: "reverse", 
                            duration: 2.2, 
                            ease: "easeInOut" 
                          }}
                          className="absolute left-1 right-1 h-0.5 bg-gradient-to-r from-transparent via-indigo-400 to-transparent shadow-[0_0_8px_rgba(99,102,241,0.8)]"
                        />
                      </div>
                    </div>

                    <div className="absolute top-3 left-3 flex items-center gap-1.5 px-2.5 py-1 bg-indigo-600 border border-indigo-400/30 text-white text-[8px] font-black uppercase rounded-full tracking-widest shadow-lg animate-pulse">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
                      Scanner Ativo
                    </div>
                  </div>

                  {/* Manual Type / Password Fields */}
                  <form onSubmit={handleMissingPasswordAuth} className="space-y-3 pt-1">
                    <div className="space-y-1.5">
                      <label className="text-[9px] font-black text-white/40 uppercase tracking-widest block font-sans">Ou insira a Senha Administrativa</label>
                      <div className="flex flex-col sm:flex-row gap-2">
                        <div className="relative flex-1">
                          <input 
                            type="password"
                            value={missingAuthPassword}
                            onChange={(e) => setMissingAuthPassword(e.target.value)}
                            placeholder="Digite a senha ADM..."
                            className="w-full bg-white/5 border border-white/10 rounded-xl py-3 px-4 text-center sm:text-left text-xs font-bold text-white focus:border-indigo-500 focus:bg-white/10 outline-none transition-all placeholder:text-white/20 h-[44px]"
                          />
                        </div>
                        <button 
                          type="submit"
                          disabled={isFinalizing || !missingAuthPassword}
                          className="w-full sm:w-auto px-6 py-3 bg-indigo-600 hover:bg-indigo-500 disabled:bg-white/5 disabled:text-white/20 active:bg-indigo-700 text-white text-[10px] font-black uppercase tracking-widest rounded-xl transition-all cursor-pointer flex items-center justify-center gap-1.5 h-[44px]"
                        >
                          <ShieldCheck className="w-4 h-4" />
                          Autorizar
                        </button>
                      </div>
                    </div>
                  </form>

                  {missingAuthError && (
                    <div className="p-3 bg-rose-500/10 border border-rose-500/20 rounded-xl animate-shake">
                      <p className="text-[9px] font-bold text-rose-500 uppercase tracking-wider text-center">{missingAuthError}</p>
                    </div>
                  )}

                  <div className="flex items-center gap-4 pt-3 border-t border-white/5 font-sans">
                    <button 
                      onClick={() => {
                        setMissingAuthStep('confirm');
                        setMissingAuthPassword('');
                        setMissingAuthError(null);
                      }}
                      className="w-full py-3.5 bg-white/5 hover:bg-white/10 active:bg-white/20 rounded-xl text-[10px] font-black uppercase tracking-widest text-[#f08080] transition-all text-center cursor-pointer min-h-[44px]"
                    >
                      ← Voltar para Confirmação
                    </button>
                  </div>
                </div>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Success Animation Modal Overlay */}
      <AnimatePresence>
        {showSuccessModel && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[160] flex items-center justify-center p-6 bg-[#030303]/90 backdrop-blur-lg"
          >
            <motion.div 
              initial={{ scale: 0.9, rotate: -2 }}
              animate={{ scale: 1, rotate: 0 }}
              exit={{ scale: 0.9, rotate: 2 }}
              className="w-full max-w-sm bg-[#121212] border-2 border-emerald-500/20 rounded-[32px] p-8 flex flex-col items-center text-center space-y-6 shadow-2xl shadow-emerald-950/20"
            >
              <div className="w-20 h-20 bg-emerald-500/10 border-4 border-emerald-500/20 rounded-full flex items-center justify-center text-emerald-400 relative">
                <motion.div 
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ type: "spring", stiffness: 150, damping: 10, delay: 0.1 }}
                >
                  <CheckCircle2 className="w-10 h-10" />
                </motion.div>
                <div className="absolute inset-x-0 -bottom-1 flex justify-center">
                  <span className="bg-emerald-500 text-black text-[7px] font-black uppercase px-2.5 py-0.5 rounded-full tracking-widest shadow">
                    Sucesso
                  </span>
                </div>
              </div>

              <div className="space-y-2">
                <h2 className="text-lg font-black text-white uppercase tracking-tight">
                  {showSuccessModel.message}
                </h2>
                <p className="text-white/40 text-[9px] font-bold uppercase tracking-widest">
                  Estoque atualizado · Sessão finalizada
                </p>
              </div>

              <div className="w-full bg-white/5 h-1.5 rounded-full overflow-hidden">
                <motion.div 
                  initial={{ width: "0%" }}
                  animate={{ width: "100%" }}
                  transition={{ duration: 2.8, ease: "linear" }}
                  className="h-full bg-emerald-500"
                />
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Admin Auth Modal for Cancellation */}
      <AnimatePresence>
        {showCancelAuth && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[110] flex items-center justify-center p-6 bg-black/90 backdrop-blur-xl"
          >
            <motion.div 
              initial={{ scale: 0.9, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.9, y: 20 }}
              className="w-full max-w-lg bg-[#121212] border border-white/10 rounded-[48px] p-10 flex flex-col items-center text-center space-y-8 shadow-3xl"
            >
              <div className="w-24 h-24 bg-amber-500/10 rounded-[32px] flex items-center justify-center text-amber-500">
                 <ShieldCheck className="w-12 h-12" />
              </div>
              
              <div className="space-y-2">
                <h2 className="text-3xl font-black text-white uppercase tracking-tighter">Autorização ADM</h2>
                <p className="text-white/40 text-[10px] font-black uppercase tracking-widest">Para cancelar esta separação é necessária autorização do administrador.</p>
              </div>

              <div className="space-y-4 w-full">
                <div className="flex flex-col items-center gap-4">
                  {cameraActive ? (
                    <div className="w-full space-y-4 flex flex-col items-center">
                      <div className="relative rounded-3xl overflow-hidden border border-white/10 bg-black aspect-square w-full max-w-[280px]">
                        <div id="cancel-qr-reader" className="w-full h-full [&_video]:object-contain [&_video]:w-full [&_video]:h-full"></div>
                        <div className="absolute inset-0 border-2 border-amber-500/50 rounded-3xl pointer-events-none flex items-center justify-center">
                          <div className="w-56 h-56 border-2 border-dashed border-white/30 rounded-2xl flex items-center justify-center">
                             <div className="w-full h-[1px] bg-amber-500/50 animate-scanner-scan"></div>
                          </div>
                        </div>
                      </div>
                      <button 
                        onClick={() => setCameraActive(false)}
                        className="w-full py-3 bg-white/5 hover:bg-white/10 rounded-2xl text-[10px] font-black uppercase tracking-widest text-white/40 transition-all"
                      >
                        Autorizar via Senha
                      </button>
                    </div>
                  ) : (
                    <form onSubmit={handleAdminPasswordAuth} className="w-full space-y-4">
                      <input 
                        type="password"
                        autoFocus
                        value={adminPassword}
                        onChange={(e) => setAdminPassword(e.target.value)}
                        placeholder="Digite a Senha Adm"
                        className="w-full bg-white/5 border border-white/10 rounded-2xl py-6 px-4 text-center text-xl font-bold text-white focus:border-amber-500 outline-none"
                      />
                      <button 
                        type="button"
                        onClick={() => setCameraActive(true)}
                        className="w-full py-4 bg-amber-500/5 hover:bg-amber-500/10 text-amber-500 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all border border-amber-500/10 flex items-center justify-center gap-2"
                      >
                        <Camera className="w-4 h-4" /> Escanear QR Code ADM
                      </button>
                    </form>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-4 w-full">
                 <button 
                  onClick={() => {
                    setShowCancelAuth(false);
                    setCameraActive(false);
                    setErrorMsg(null);
                  }}
                  className="flex-1 py-4 bg-white/5 hover:bg-white/10 rounded-2xl text-[10px] font-black uppercase tracking-widest text-white/40 transition-all border border-white/5"
                 >
                   Voltar para Separação
                 </button>
              </div>

              {errorMsg && (
                <p className="text-[10px] font-black uppercase text-red-500 tracking-widest animate-bounce">{errorMsg}</p>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Quantity Selection Overlay Modal */}
      <AnimatePresence>
        {activePopupItem && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-black/85 backdrop-blur-md"
            onClick={() => {
              setActivePopupItem(null);
              setErrorMsg(null);
            }}
          >
            <motion.div 
              initial={{ scale: 0.95, y: 15 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.95, y: 15 }}
              className="w-full max-w-sm bg-[#121212] border border-zinc-800 rounded-3xl p-6 flex flex-col space-y-5 shadow-2xl relative"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex justify-between items-start gap-3">
                <div className="min-w-0">
                  <span className="text-[8.5px] font-mono font-bold text-zinc-500 block uppercase tracking-wider">{activePopupItem.item.code}</span>
                  <h3 className="text-sm font-black text-white uppercase truncate mt-0.5">{activePopupItem.item.name}</h3>
                </div>
                {activePopupItem.item.location && (
                  <div className="flex items-center gap-1 px-2.5 py-1.5 bg-zinc-900 border border-zinc-800 rounded-xl shrink-0">
                    <MapPin className="w-3.5 h-3.5 text-indigo-400" />
                    <span className="text-[8.5px] font-mono font-black text-zinc-400">
                      {activePopupItem.item.location?.aisle || '-'}/{activePopupItem.item.location?.shelf || '-'}/{activePopupItem.item.location?.drawer || '-'}
                    </span>
                  </div>
                )}
              </div>

              <div className="bg-zinc-950 p-4 rounded-2xl border border-zinc-900 flex flex-col items-center">
                <span className="text-[8.5px] font-bold uppercase text-zinc-500 tracking-widest mb-3">Quantidade Separada</span>
                
                <div className="flex items-center gap-4">
                  {/* Minus button */}
                  <button
                    type="button"
                    onClick={() => {
                      const val = parseInt(popupQtyStr) || 0;
                      if (val > 0) setPopupQtyStr(String(val - 1));
                    }}
                    className="w-12 h-12 bg-zinc-900 hover:bg-zinc-850 border border-zinc-800 rounded-xl flex items-center justify-center text-white text-xl font-black transition-all cursor-pointer select-none"
                  >
                    -
                  </button>

                  <input
                    type="number"
                    value={popupQtyStr}
                    onChange={(e) => setPopupQtyStr(e.target.value)}
                    className="w-20 h-12 bg-zinc-900 border border-zinc-800 rounded-xl text-center text-xl font-mono font-black text-white focus:border-zinc-700 outline-none"
                    autoFocus
                  />

                  {/* Plus button */}
                  <button
                    type="button"
                    onClick={() => {
                      const val = parseInt(popupQtyStr) || 0;
                      if (val < activePopupItem.expected) {
                        setPopupQtyStr(String(val + 1));
                      }
                    }}
                    className="w-12 h-12 bg-zinc-900 hover:bg-zinc-850 border border-zinc-800 rounded-xl flex items-center justify-center text-white text-xl font-black transition-all cursor-pointer select-none"
                  >
                    +
                  </button>
                </div>

                <div className="flex justify-between w-full mt-4 text-[10px] text-zinc-500 font-bold border-t border-zinc-900/40 pt-3 px-1">
                  <span>Pedida: <span className="text-white font-mono">{activePopupItem.expected} un</span></span>
                  <span>Antes: <span className="text-white font-mono">{activePopupItem.currentPicked} un</span></span>
                </div>
              </div>

              {errorMsg && (
                <div className="text-[9.5px] text-rose-500 text-center font-black uppercase tracking-wider">{errorMsg}</div>
              )}

              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => {
                    setActivePopupItem(null);
                    setErrorMsg(null);
                  }}
                  className="flex-1 py-3.5 bg-zinc-900 border border-zinc-800 text-zinc-400 hover:text-white rounded-xl text-[9px] font-black uppercase tracking-widest cursor-pointer text-center"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={handleConfirmPopupQuantity}
                  className="flex-1 py-3.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-[9px] font-black uppercase tracking-widest cursor-pointer text-center shadow-lg"
                >
                  Confirmar
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
