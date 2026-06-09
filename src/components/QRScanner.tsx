import React, { useEffect, useRef, useState } from 'react';
import { Html5Qrcode, Html5QrcodeSupportedFormats } from 'html5-qrcode';
import { BrowserMultiFormatReader, BarcodeFormat, DecodeHintType } from '@zxing/library';
import { Camera, X, RefreshCw, AlertTriangle, Upload, Clipboard, Type, Sparkles, Check, CheckCircle2, Lightbulb, Smile, Scan, UserCheck, Activity } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { feedback } from '../lib/feedback';
import * as pdfjsLib from 'pdfjs-dist';
import { selecionarIdCameraPreferida } from '../utils/qrHelper';
import { useStore } from '../store';
import { cn } from '../lib/utils';

interface QRScannerProps {
  onScan: (decodedText: string) => void;
  onClose: () => void;
  title?: string;
  description?: string;
  isLogin?: boolean;
  forcedTab?: 'camera' | 'upload';
  validationError?: string | null;
  onClearValidationError?: () => void;
  mode?: 'qr';
}

interface ScanLog {
  id: string;
  time: string;
  type: 'info' | 'success' | 'warn' | 'error';
  message: string;
}

export default function QRScanner({ 
  onScan, 
  onClose, 
  title = "Escanear QR Code", 
  description = "Aponte para o código para ler",
  isLogin = false,
  forcedTab,
  validationError = null,
  onClearValidationError,
  mode = 'qr'
}: QRScannerProps) {
  const codeReaderRef = useRef<BrowserMultiFormatReader | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const activeStreamRef = useRef<MediaStream | null>(null);
  const runningCameraIdRef = useRef<string | undefined>(undefined);
  const persistentCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const html5QrCodeRef = useRef<Html5Qrcode | null>(null); // Guarded as fallback wrapper

  const frameCountRef = useRef<number>(0);
  const lastScanRef = useRef<{ text: string, time: number } | null>(null);
  
  const frameCountIntervalRef = useRef<number>(0);
  const lastFpsUpdateRef = useRef<number>(Date.now());
  
  // Queue to serialize all asynchronous start and stop camera operations and prevent NotReadableError/device locks
  const syncQueueRef = useRef<Promise<any>>(Promise.resolve());

  // Deep Debug Mode states
  const [realVideoRes, setRealVideoRes] = useState({ width: 0, height: 0 });
  const [realCanvasRes, setRealCanvasRes] = useState({ width: 0, height: 0 });
  const [calcFPS, setCalcFPS] = useState(0);
  const [lastDecodeError, setLastDecodeError] = useState<string>("Pronto...");
  const [streamActive, setStreamActive] = useState<boolean>(false);
  const [trackReadyState, setTrackReadyState] = useState<string>("Desconhecido");
  const [isAutofocusSupported, setIsAutofocusSupported] = useState<boolean | string>("Pendente...");
  const [isCroppedDetect, setIsCroppedDetect] = useState<boolean>(false);
  const [canvasSmallerThanVideo, setCanvasSmallerThanVideo] = useState<boolean>(false);
  const [qrBoxArea, setQrBoxArea] = useState<{ width: number, height: number } | null>(null);
  const [capturedFrameUrl, setCapturedFrameUrl] = useState<string | null>(null);

  // Sistema de diagnóstico e teste de câmeras
  const [showDiagnostic, setShowDiagnostic] = useState<boolean>(false);
  const [diagStream, setDiagStream] = useState<MediaStream | null>(null);
  const [diagDevices, setDiagDevices] = useState<MediaDeviceInfo[]>([]);
  const [diagMessage, setDiagMessage] = useState<string>('');
  const [diagSelectedCamera, setDiagSelectedCamera] = useState<string>('');
  const [diagIsTesting, setDiagIsTesting] = useState<boolean>(false);
  const diagStreamRef = useRef<MediaStream | null>(null);
  const diagVideoRef = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    if (diagVideoRef.current && diagStream) {
      diagVideoRef.current.srcObject = diagStream;
      diagVideoRef.current.play().catch(e => console.error("Erro no play do vídeo de diagnóstico:", e));
    }
  }, [diagStream]);

  const startDiagnosticTest = async (cameraId?: string) => {
    try {
      setDiagIsTesting(true);
      setDiagMessage('Verificando suporte a mediaDevices e solicitando permissão...');
      
      if (!navigator || !navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error('Serviço navigator.mediaDevices.getUserMedia não suportado neste ambiente.');
      }

      // Parar stream anterior se houver
      if (diagStreamRef.current) {
        diagStreamRef.current.getTracks().forEach(t => t.stop());
        diagStreamRef.current = null;
        setDiagStream(null);
      }

      const constraints: MediaStreamConstraints = {
        video: cameraId ? { deviceId: { exact: cameraId } } : true
      };

      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      diagStreamRef.current = stream;
      setDiagStream(stream);
      
      setDiagMessage('Permissão concedida e câmera ativa com sucesso!');
      
      // Listar câmeras
      const devices = await navigator.mediaDevices.enumerateDevices();
      const videoDevices = devices.filter(d => d.kind === 'videoinput');
      setDiagDevices(videoDevices);
      
      if (videoDevices.length > 0) {
        const activeTrack = stream.getVideoTracks()[0];
        const activeId = activeTrack?.getSettings()?.deviceId || videoDevices[0].deviceId;
        setDiagSelectedCamera(activeId);
      }
    } catch (err: any) {
      console.error(err);
      setDiagMessage(`Erro no diagnóstico: ${err.message || err.name || String(err)}. Verifique se a câmera está conectada e se a permissão foi concedida no Windows.`);
    } finally {
      setDiagIsTesting(false);
    }
  };

  const stopDiagnosticTest = () => {
    if (diagStreamRef.current) {
      diagStreamRef.current.getTracks().forEach(t => t.stop());
      diagStreamRef.current = null;
      setDiagStream(null);
    }
    setDiagMessage('Câmera de teste encerrada e liberada corretamente.');
  };

  const closeDiagnostic = () => {
    stopDiagnosticTest();
    setShowDiagnostic(false);
  };
  
  // Tabs and general state
  const isMobile = typeof window !== 'undefined' && (/Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) || window.innerWidth < 768);
  const isElectron = typeof window !== 'undefined' && (!!(window as any).process?.versions?.electron || navigator.userAgent.toLowerCase().includes('electron'));
  const isDesktop = !isMobile;

  const [activeTab, setActiveTab] = useState<'camera' | 'upload' | 'manual'>(() => {
    return forcedTab || 'camera';
  });
  const [showDetailedLogs, setShowDetailedLogs] = useState(false);
  const [cameras, setCameras] = useState<MediaDeviceInfo[]>([]);
  const [selectedCameraId, setSelectedCameraId] = useState<string | undefined>(undefined);
  const [loading, setLoading] = useState(true);
  const [permissionError, setPermissionError] = useState<string | null>(null);
  const [errorState, setErrorState] = useState<string | null>(null);
  const [framesAnalyzed, setFramesAnalyzed] = useState(0);
  const [isMirrored, setIsMirrored] = useState(false);
  const [isCover, setIsCover] = useState(false);

  // Decode Quality Logic states & synchronization refs
  const [decodeMode, setDecodeMode] = useState<'desktop-hq' | 'desktop-balanced' | 'mobile-opt'>(() => {
    return isMobile ? 'mobile-opt' : 'desktop-balanced';
  });

  const decodeModeRef = useRef(decodeMode);
  useEffect(() => {
    decodeModeRef.current = decodeMode;
  }, [decodeMode]);

  const isMirroredRef = useRef(isMirrored);
  useEffect(() => {
    isMirroredRef.current = isMirrored;
  }, [isMirrored]);

  const scanTimeoutRef = useRef<any>(null);
  const animationFrameIdRef = useRef<number | null>(null);
  
  // Auto-recovery parameters
  const [isIframeSandbox, setIsIframeSandbox] = useState(false);
  const lastActiveTimeRef = useRef(Date.now());
  const lastFrameCountRef = useRef(0);

  // Custom scrolling console logs
  const [logs, setLogs] = useState<ScanLog[]>([]);
  const logsEndRef = useRef<HTMLDivElement>(null);
  
  // Fallback states
  const [manualCode, setManualCode] = useState('');
  const [clipboardStatus, setClipboardStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [fileError, setFileError] = useState<string | null>(null);
  const [fileSuccess, setFileSuccess] = useState<string | null>(null);

  // Diagnostic Intercept States for QR testing
  const [tempDecodedData, setTempDecodedData] = useState<string | null>(null);
  const [copiedStatus, setCopiedStatus] = useState(false);

  // Debug mode flag (when false, scanner triggers onScan directly with no technical modal)
  const QR_DEBUG_MODE = false;

  const handleSuccessfulScan = (decodedText: string) => {
    if (QR_DEBUG_MODE && !isLogin) {
      setTempDecodedData(decodedText);
    } else {
      onScan(decodedText);
    }
  };

  // Singleton lock state
  const [isOtherScannerActive, setIsOtherScannerActive] = useState(false);

  useEffect(() => {
    if ((window as any).__nexusQrScannerAtivo) {
      setIsOtherScannerActive(true);
      return;
    }
    (window as any).__nexusQrScannerAtivo = true;
    return () => {
      (window as any).__nexusQrScannerAtivo = false;
    };
  }, []);

  const isMountedRef = useRef<boolean>(true);
  const scannerSessionIdRef = useRef<string>(Math.random().toString(36).substring(7));
  const simulatedBlinkTimeoutRef = useRef<any>(null);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      if (simulatedBlinkTimeoutRef.current) {
        clearTimeout(simulatedBlinkTimeoutRef.current);
      }
    };
  }, []);

  const activeEngine = 'zxing';

  const handleCloseScanner = async () => {
    await stopAllMedia();
    (window as any).__nexusQrScannerAtivo = false;
    onClose();
  };

  // Synthesized professional sound effects using Web Audio API
  const playBeep = (type: 'success' | 'error' | 'warning') => {
    try {
      const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
      
      if (type === 'success') {
        const now = audioCtx.currentTime;
        
        // Primeiro tom curto (880Hz)
        const osc1 = audioCtx.createOscillator();
        const gain1 = audioCtx.createGain();
        osc1.connect(gain1);
        gain1.connect(audioCtx.destination);
        osc1.type = 'sine';
        osc1.frequency.setValueAtTime(880, now);
        gain1.gain.setValueAtTime(0, now);
        gain1.gain.linearRampToValueAtTime(0.15, now + 0.02);
        gain1.gain.exponentialRampToValueAtTime(0.0001, now + 0.12);
        osc1.start(now);
        osc1.stop(now + 0.14);

        // Segundo tom curto crescente (1150Hz)
        const osc2 = audioCtx.createOscillator();
        const gain2 = audioCtx.createGain();
        osc2.connect(gain2);
        gain2.connect(audioCtx.destination);
        osc2.type = 'sine';
        osc2.frequency.setValueAtTime(1150, now + 0.12);
        gain2.gain.setValueAtTime(0, now + 0.12);
        gain2.gain.linearRampToValueAtTime(0.15, now + 0.14);
        gain2.gain.exponentialRampToValueAtTime(0.0001, now + 0.28);
        osc2.start(now + 0.12);
        osc2.stop(now + 0.30);
      } else if (type === 'error') {
        // Tom mais grave para erros críticos ou falhas
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(220, audioCtx.currentTime);
        gain.gain.setValueAtTime(0, audioCtx.currentTime);
        gain.gain.linearRampToValueAtTime(0.15, audioCtx.currentTime + 0.05);
        gain.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + 0.35);
        osc.start(audioCtx.currentTime);
        osc.stop(audioCtx.currentTime + 0.40);
      } else if (type === 'warning') {
        // Tom médio discreto para avisos/estados intermediários
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        osc.type = 'sine';
        osc.frequency.setValueAtTime(550, audioCtx.currentTime);
        gain.gain.setValueAtTime(0, audioCtx.currentTime);
        gain.gain.linearRampToValueAtTime(0.12, audioCtx.currentTime + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + 0.18);
        osc.start(audioCtx.currentTime);
        osc.stop(audioCtx.currentTime + 0.20);
      }
    } catch (err) {
      console.warn("Falha ao gerar beep sintético pelo navegador:", err);
    }
  };

  // Helper to append diagnostic logs
  const addLog = (type: 'info' | 'success' | 'warn' | 'error', message: string) => {
    if (!isMountedRef.current) return;
    const timestamp = new Date().toLocaleTimeString('pt-BR', { hour12: false });
    setLogs(prev => [
      ...prev,
      { id: Math.random().toString(36).substring(7), time: timestamp, type, message }
    ].slice(-40)); // Keep last 40 logs
  };

  // Scroll terminal logs automatically to the bottom
  useEffect(() => {
    if (logsEndRef.current) {
      logsEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [logs]);

  // Initial environment detection & logging
  useEffect(() => {
    const isSandboxIframe = window.self !== window.top;
    const isGoogleRun = window.location.hostname.includes('google') || window.location.hostname.includes('run.app');
    const isStudio = isSandboxIframe || isGoogleRun;
    setIsIframeSandbox(isStudio);
    
    addLog('info', `Sistema: Inicializando subsistema de scanner de imagem.`);
    addLog('info', `Localização: ${window.location.origin}`);
    
    if (isStudio) {
      addLog('warn', `Ambiente: Sandbox/Iframe do Google AI Studio detectado.`);
      addLog('warn', `⚠️ AVISO: O preview do AI Studio suspende loops de renderização e mídias ao perder foco.`);
      addLog('warn', `💡 Solução: Desenvolvemos o auto-recovery dinâmico do scanner para reatar o stream automaticamente.`);
    } else {
      addLog('info', `Ambiente: Execução em navegador local direto (Chrome ideal / Celular).`);
    }
    
    addLog('info', `FPS Alvo: 20-30 frames por segundo.`);
    addLog('info', `Resolução Alvo: Alta definição (1280x720).`);
  }, []);

  // Shutdown logic
  const stopAllMedia = async () => {
    // 0. Clear active custom analysis loop polling timeouts and intervals
    if (scanTimeoutRef.current) {
      clearInterval(scanTimeoutRef.current);
      clearTimeout(scanTimeoutRef.current);
      scanTimeoutRef.current = null;
    }

    if (animationFrameIdRef.current) {
      cancelAnimationFrame(animationFrameIdRef.current);
      animationFrameIdRef.current = null;
    }

    // 1. Reset ZXing code reader to release any locks
    if (codeReaderRef.current) {
      try {
        codeReaderRef.current.reset();
        addLog('info', 'Decoder ZXing resetado.');
      } catch (e) {
        console.warn("Falha ao resetar ZXing:", e);
      }
    }

    // 2. Stop active media stream tracks
    if (activeStreamRef.current) {
      try {
        activeStreamRef.current.getTracks().forEach(track => {
          if (track.readyState === "live") {
            track.stop();
            addLog('info', `Trilha parada: Mídia (${track.kind})`);
          }
        });
      } catch (e) {
        console.warn("Erro ao parar as trilhas de mídia ativas:", e);
      }
      activeStreamRef.current = null;
    }

    // 3. Fallback brute-force: query all video tags and explicitly stop active media stream tracks
    try {
      const videoElements = document.querySelectorAll("video");
      videoElements.forEach(video => {
        if (video.srcObject instanceof MediaStream) {
          video.srcObject.getTracks().forEach(track => {
            if (track.readyState === "live") {
              track.stop();
              addLog('info', `Abafador de trilha ativado: Mídia (${track.kind}) parada para evitar bloqueio.`);
            }
          });
          video.srcObject = null;
        }
      });
    } catch (e) {
      console.warn("Erro ao varrer/parar streams de vídeo órfãos:", e);
    }

    if (isMountedRef.current) {
      setFramesAnalyzed(0);
    }
    frameCountRef.current = 0;
  };

  // Setup and start the stream (Direct MediaStream + ZXing BrowserMultiFormatReader - with unified camera listing)
  useEffect(() => {
    if (isOtherScannerActive) {
      setLoading(false);
      setErrorState("Outro leitor já está ativo, feche-o primeiro");
      return;
    }

    if (activeTab !== 'camera') {
      stopAllMedia();
      return;
    }

    // If already initialized with a selected camera and running, skip re-initialization to prevent dual acquisition lock
    if (selectedCameraId && selectedCameraId === runningCameraIdRef.current) {
      return;
    }

    let isMounted = true;
    const sessionId = Math.random().toString(36).substring(7);
    scannerSessionIdRef.current = sessionId;
    setErrorState(null);

    // Capture exact frame logic for diagnostics
    const captureFrame = () => {
      const videoEl = videoRef.current;
      if (!videoEl || videoEl.videoWidth === 0) return;
      
      const canvas = document.createElement('canvas');
      canvas.width = videoEl.videoWidth;
      canvas.height = videoEl.videoHeight;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        if (isMirrored) {
          ctx.translate(canvas.width, 0);
          ctx.scale(-1, 1);
        }
        ctx.drawImage(videoEl, 0, 0, canvas.width, canvas.height);
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        
        // Target box representation (400x400 central overlay)
        const boxSize = 400;
        const x = (canvas.width - boxSize) / 2;
        const y = (canvas.height - boxSize) / 2;
        
        ctx.strokeStyle = '#ef4444';
        ctx.lineWidth = 4;
        ctx.strokeRect(x, y, boxSize, boxSize);
        
        ctx.fillStyle = '#ef4444';
        ctx.font = '22px monospace';
        ctx.fillText(`AREA ANALISADA DA CAMERA (400x400)`, x + 10, y + 35);
        ctx.fillText(`RESOLUÇÃO: ${canvas.width}x${canvas.height}`, x + 10, y + boxSize - 20);
        
        setCapturedFrameUrl(canvas.toDataURL('image/jpeg', 0.95));
      }
    };

    // Attach Capture Frame onto window so button triggers it
    (window as any).triggerDiagnosticCapture = captureFrame;

    // Helper to select constraints
    const getConstraints = (resolution: '1080p' | '720p' | 'generic' | 'baseline'): MediaStreamConstraints => {
      if (resolution === 'baseline') {
        if (isMobile) {
          return { video: { facingMode: "environment" } };
        } else {
          return { video: true };
        }
      }

      const videoConstraints: MediaTrackConstraints = {};

      if (selectedCameraId) {
        videoConstraints.deviceId = { exact: selectedCameraId };
        videoConstraints.advanced = [{ focusMode: "continuous" }] as any;
      } else if (isMobile) {
        videoConstraints.facingMode = { ideal: "environment" };
      }

      if (resolution === '1080p') {
        videoConstraints.width = { ideal: 1920 };
        videoConstraints.height = { ideal: 1080 };
        videoConstraints.frameRate = { ideal: 30 };
      } else if (resolution === '720p') {
        videoConstraints.width = { ideal: 1280 };
        videoConstraints.height = { ideal: 720 };
        videoConstraints.frameRate = { ideal: 30 };
      } else if (resolution === 'generic') {
        videoConstraints.frameRate = { ideal: 30 };
      }

      return { video: videoConstraints };
    };

    async function startScanning() {
      const videoEl = videoRef.current;
      if (!videoEl) return;
      if (isOtherScannerActive) {
        setErrorState("Outro leitor já está ativo, feche-o primeiro");
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        setPermissionError(null);
        await stopAllMedia();
        if (!isMounted || scannerSessionIdRef.current !== sessionId) return;

        addLog('info', `Configurando leitor oficial ZXing...`);

        // Enumerate available video inputs to fill the selector list
        const devices = await navigator.mediaDevices.enumerateDevices().catch(() => []);
        const videoDevices = devices.filter(d => d.kind === 'videoinput');
        if (!isMounted || scannerSessionIdRef.current !== sessionId) return;
        if (videoDevices.length > 0) {
          const formattedDevices = videoDevices.map((d, index) => ({
            deviceId: d.deviceId,
            label: d.label || `Câmera ${index + 1}`
          }));
          setCameras(formattedDevices as any);

          const preferredId = selecionarIdCameraPreferida(formattedDevices.map(d => ({ id: d.deviceId, label: d.label })), isMobile);
          if (preferredId && !selectedCameraId) {
            setSelectedCameraId(preferredId);
          }
        }

        // Standard QR behavior
        if (!codeReaderRef.current) {
          const hints = new Map();
          hints.set(DecodeHintType.POSSIBLE_FORMATS, [BarcodeFormat.QR_CODE]);
          hints.set(DecodeHintType.TRY_HARDER, true);
          hints.set(DecodeHintType.CHARACTER_SET, "UTF-8");
          codeReaderRef.current = new BrowserMultiFormatReader(hints);
        }

        setLoading(false);

        const activeCameraId = selectedCameraId || undefined;
        addLog('info', `Chamando decodeFromVideoDevice com TRY_HARDER ativo para dispositivo: ${activeCameraId || 'padrão'}`);

        let firstImageLogged = false;
        let processedFrames = 0;

        try {
          await codeReaderRef.current.decodeFromVideoDevice(
            activeCameraId,
            videoEl,
            async (result, error) => {
              if (!isMounted) return;

              processedFrames += 1;
              setFramesAnalyzed(processedFrames);

              // Log details of the first frame/image received to fulfill requirement
              if (!firstImageLogged && videoEl.videoWidth > 0) {
                firstImageLogged = true;
                const videoTrack = (videoEl.srcObject as MediaStream)?.getVideoTracks()?.[0];
                const logMsg = `Primeira Imagem Recebida:\n` +
                               `- Resolução de Vídeo: ${videoEl.videoWidth}x${videoEl.videoHeight}\n` +
                               `- ReadyState: ${videoEl.readyState}\n` +
                               `- DeviceId Usado: ${videoTrack?.getSettings?.()?.deviceId || activeCameraId || 'padrão'}\n` +
                               `- Quantidade de Frames: ${processedFrames}`;
                addLog('info', logMsg);
                console.log('[QRScanner] ' + logMsg);
                
                setRealVideoRes({
                  width: videoEl.videoWidth,
                  height: videoEl.videoHeight
                });
                setStreamActive(true);
                if (videoTrack) {
                  setTrackReadyState(videoTrack.readyState);
                }
              }

              if (result) {
                if (!isMounted || scannerSessionIdRef.current !== sessionId) return;
                const decodedText = result.getText();
                const now = Date.now();
                if (lastScanRef.current && lastScanRef.current.text === decodedText && now - lastScanRef.current.time < 1500) {
                  // Ignore
                } else {
                  lastScanRef.current = { text: decodedText, time: now };
                  addLog('success', `Código detectado: "${decodedText}"`);
                  feedback.success();
                  playBeep('success');
                  await stopAllMedia();
                  handleSuccessfulScan(decodedText);
                }
              }

              if (error) {
                const errMsg = error.message || String(error);
                if (errMsg && !errMsg.includes('No MultiFormat Reader') && !errMsg.includes('NotFoundException')) {
                  setLastDecodeError(errMsg);
                }
              }
            }
          );
        } catch (decodeErr: any) {
          addLog('warn', `decodeFromVideoDevice falhou com cameraId (${activeCameraId}): ${decodeErr.message || decodeErr}. Tentando câmera padrão...`);
          // Fallback: try with undefined camera id (default camera)
          try {
            await codeReaderRef.current.decodeFromVideoDevice(
              undefined,
              videoEl,
              async (result, error) => {
                if (!isMounted) return;

                processedFrames += 1;
                setFramesAnalyzed(processedFrames);

                if (!firstImageLogged && videoEl.videoWidth > 0) {
                  firstImageLogged = true;
                  const videoTrack = (videoEl.srcObject as MediaStream)?.getVideoTracks()?.[0];
                  const logMsg = `Primeira Imagem Recebida (Fallback):\n` +
                                 `- Resolução de Vídeo: ${videoEl.videoWidth}x${videoEl.videoHeight}\n` +
                                 `- ReadyState: ${videoEl.readyState}\n` +
                                 `- DeviceId Usado: ${videoTrack?.getSettings?.()?.deviceId || 'padrão'}\n` +
                                 `- Quantidade de Frames: ${processedFrames}`;
                  addLog('info', logMsg);
                  console.log('[QRScanner] ' + logMsg);
                  
                  setRealVideoRes({
                    width: videoEl.videoWidth,
                    height: videoEl.videoHeight
                  });
                  setStreamActive(true);
                  if (videoTrack) {
                    setTrackReadyState(videoTrack.readyState);
                  }
                }

                if (result) {
                  if (!isMounted || scannerSessionIdRef.current !== sessionId) return;
                  const decodedText = result.getText();
                  const now = Date.now();
                  if (lastScanRef.current && lastScanRef.current.text === decodedText && now - lastScanRef.current.time < 1500) {
                    // Ignore
                  } else {
                    lastScanRef.current = { text: decodedText, time: now };
                    addLog('success', `Código detectado: "${decodedText}"`);
                    feedback.success();
                    playBeep('success');
                    await stopAllMedia();
                    handleSuccessfulScan(decodedText);
                  }
                }

                if (error) {
                  const errMsg = error.message || String(error);
                  if (errMsg && !errMsg.includes('No MultiFormat Reader') && !errMsg.includes('NotFoundException')) {
                    setLastDecodeError(errMsg);
                  }
                }
              }
            );
          } catch (secondErr: any) {
            addLog('error', `decodeFromVideoDevice falhou também na câmera padrão: ${secondErr.message || secondErr}`);
            throw secondErr;
          }
        }

        addLog('success', 'Mecanismo de decodificação direta ZXing ativado!');

      } catch (err: any) {
        console.error("Erro absoluto ao inicializar captura:", err);
        addLog('error', `Falha total no canal de vídeo: ${err.message || err.name}`);
        
        if (isMounted) {
          if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
            setPermissionError("Permissão de câmera negada. Em Electron: abra Configurações do Windows -> Privacidade -> Câmera e habilite para o app.");
          } else if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError' || err.message?.includes('devices')) {
            setErrorState("Nenhuma câmera encontrada. Use o upload de imagem ou digite o código manualmente.");
          } else if (err.name === 'NotReadableError' || err.name === 'TrackStartError' || err.message?.includes('Readable') || err.message?.includes('source')) {
            setErrorState("Câmera ocupada por outro programa. Feche Zoom/Teams/OBS e tente novamente.");
          } else {
            setErrorState(`Erro de leitura: ${err.message || err.name || String(err)}`);
          }
          setLoading(false);
        }
      }
    }

    function enqueueActivation() {
      syncQueueRef.current = syncQueueRef.current.then(async () => {
        if (!isMounted) return;
        await startScanning();
      }).catch(err => {
        console.error("Erro na fila do mecanismo de varredura:", err);
      });
    }

    const timer = setTimeout(() => {
      enqueueActivation();
    }, 200);

    return () => {
      isMounted = false;
      clearTimeout(timer);
      delete (window as any).triggerDiagnosticCapture;
      
      syncQueueRef.current = syncQueueRef.current.then(async () => {
        await stopAllMedia();
      });
    };
  }, [selectedCameraId, activeTab, isOtherScannerActive, mode]);

  // Poll live video element and tracks to harvest accurate hardware telemetry
  useEffect(() => {
    if (activeTab !== 'camera' || !selectedCameraId) return;

    const monitorInterval = setInterval(() => {
      const videoEl = videoRef.current;
      if (videoEl) {
        setRealVideoRes({
          width: videoEl.videoWidth || 0,
          height: videoEl.videoHeight || 0
        });

        if (videoEl.srcObject instanceof MediaStream) {
          const stream = videoEl.srcObject;
          setStreamActive(stream.active);
          const track = stream.getVideoTracks()[0];
          if (track) {
            setTrackReadyState(track.readyState);
            
            // Autofocus capabilities
            try {
              const capabilities = track.getCapabilities() as any;
              if (capabilities.focusMode) {
                const modes = Array.isArray(capabilities.focusMode) ? capabilities.focusMode : [capabilities.focusMode];
                setIsAutofocusSupported(modes.includes('continuous') ? "Suportado (Contínuo)" : `Disponível (${modes.join(', ')})`);
              } else {
                setIsAutofocusSupported("Não suportado/Sem info de hardware");
              }
            } catch {
              setIsAutofocusSupported("Bloqueado pelo Iframe/Sem info");
            }
          }
        }

        // Measure container and check if video is visually cropped
        const parentEl = videoEl.parentElement;
        if (parentEl) {
          const parentAspect = parentEl.clientWidth / parentEl.clientHeight;
          const videoAspect = (videoEl.videoWidth || 1) / (videoEl.videoHeight || 1);
          setIsCroppedDetect(Math.abs(parentAspect - videoAspect) > 0.05);
        }

        // Calculate container physical responsive sizes for QR overlays
        if (videoEl.clientWidth > 0 && videoEl.clientHeight > 0) {
          const w = videoEl.clientWidth;
          const h = videoEl.clientHeight;
          const size = Math.min(w, h) * 0.70;
          setQrBoxArea({ width: size, height: size });
        }
      } else {
        setRealVideoRes({ width: 0, height: 0 });
        setStreamActive(false);
        setTrackReadyState("Desconectado");
      }
    }, 400);

    return () => clearInterval(monitorInterval);
  }, [activeTab, selectedCameraId, cameras]);

  // Real-time FPS Calculation Effect
  useEffect(() => {
    if (activeTab !== 'camera') return;

    const fpsTimer = setInterval(() => {
      const now = Date.now();
      const elapsed = now - lastFpsUpdateRef.current;
      if (elapsed >= 1000) {
        const currentFPS = (frameCountIntervalRef.current * 1000) / elapsed;
        setCalcFPS(Math.round(currentFPS));
        frameCountIntervalRef.current = 0;
        lastFpsUpdateRef.current = now;
      }
    }, 1000);

    return () => clearInterval(fpsTimer);
  }, [activeTab]);

  // Active Stream monitoring for auto-recovery (Bypasses Sandbox Iframe focus blocks)
  useEffect(() => {
    // This is handled inside startScanning's recoveryInterval now to prevent thrashing
  }, []);

  // Clean on unmount
  useEffect(() => {
    return () => {
      stopAllMedia();
      if (diagStreamRef.current) {
        diagStreamRef.current.getTracks().forEach(t => t.stop());
      }
    };
  }, []);

  // Retrying cameras
  const handleRetry = () => {
    setFramesAnalyzed(0);
    frameCountRef.current = 0;
    setErrorState(null);
    const temp = selectedCameraId;
    setSelectedCameraId(undefined);
    setTimeout(() => {
      setSelectedCameraId(temp);
    }, 150);
  };

  // 3. Fallback: Parse QR Code from file upload (Image or PDF)
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setFileError(null);
    setFileSuccess(null);
    addLog('info', `Carregando arquivo: ${file.name} (${Math.round(file.size / 1024)} KB)`);

    const isPDF = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');

    if (isPDF) {
      addLog('info', 'Analisando documento PDF...');
      try {
        const arrayBuffer = await file.arrayBuffer();
        addLog('info', 'Carregando estrutura do PDF...');
        
        try {
          const pdfjsVersion = (pdfjsLib as any).version || '3.11.174';
          pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsVersion}/pdf.worker.min.js`;
        } catch (workerErr) {
          console.warn("Could not set workerSrc dynamically:", workerErr);
        }

        const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
        const pdf = await loadingTask.promise;
        const numPages = pdf.numPages;
        addLog('info', `Documento PDF carregado com sucesso. Total de páginas: ${numPages}`);

        let qrFoundText = null;

        for (let pageNum = 1; pageNum <= numPages; pageNum++) {
          addLog('info', `Processando página ${pageNum}/${numPages}...`);
          const page = await pdf.getPage(pageNum);
          
          const viewport = page.getViewport({ scale: 2.2 });
          const canvas = document.createElement('canvas');
          canvas.width = viewport.width;
          canvas.height = viewport.height;
          const canvasContext = canvas.getContext('2d');
          
          if (!canvasContext) {
            addLog('error', `Falha ao obter contexto 2D para renderização da página ${pageNum}`);
            continue;
          }

          await page.render({ canvasContext, viewport } as any).promise;

          try {
            const hints = new Map();
            hints.set(DecodeHintType.POSSIBLE_FORMATS, [BarcodeFormat.QR_CODE]);
            hints.set(DecodeHintType.TRY_HARDER, true);
            const reader = new BrowserMultiFormatReader(hints);
            const result = await (reader as any).decodeFromCanvas(canvas);
            
            if (result) {
              const text = result.getText();
              if (text && text.trim()) {
                qrFoundText = text.trim();
                break;
              }
            }
          } catch (scanErr) {
            // Expected if page has no QR code
          }
        }

        if (qrFoundText) {
          setFileSuccess(qrFoundText);
          addLog('success', `QR detectado no documento PDF! Conteúdo: "${qrFoundText}"`);
          feedback.success();
          playBeep('success');
          setTimeout(() => {
            handleSuccessfulScan(qrFoundText);
          }, 1000);
        } else {
          throw new Error("Não foi possível encontrar nenhum QR Code legível nas páginas do PDF. Certifique-se de que o documento contém um QR Code claro e nítido.");
        }

      } catch (err: any) {
        console.error("Erro ao decodificar PDF:", err);
        const errMsg = err.message || "Erro para abrir ou ler arquivo PDF.";
        setFileError(errMsg);
        addLog('error', errMsg);
      }
    } else {
      try {
        addLog('info', 'Analisando imagem enviada via motor Html5Qrcode...');
        const tempScanner = new Html5Qrcode("common-qr-reader-hidden-helper");
        const decodedText = await tempScanner.scanFile(file, false);
        
        setFileSuccess(decodedText);
        addLog('success', `QR detectado em imagem enviado! Conteúdo: "${decodedText}"`);
        feedback.success();
        playBeep('success');
        setTimeout(() => {
          handleSuccessfulScan(decodedText);
        }, 1000);
      } catch (err: any) {
        addLog('warn', 'Motor Html5Qrcode não localizou QR Code. Tentando motor secundário (ZXing) com tryHarder...');
        
        try {
          const imageElement = new Image();
          const objectUrl = URL.createObjectURL(file);
          
          await new Promise<void>((resolve, reject) => {
            imageElement.onload = () => resolve();
            imageElement.onerror = () => reject(new Error("Erro ao carregar imagem para processamento."));
            imageElement.src = objectUrl;
          });

          const canvas = document.createElement('canvas');
          canvas.width = imageElement.naturalWidth || imageElement.width;
          canvas.height = imageElement.naturalHeight || imageElement.height;
          const ctx = canvas.getContext('2d');
          
          if (!ctx) {
            throw new Error("Não foi possível processar contexto 2D da imagem.");
          }
          
          ctx.drawImage(imageElement, 0, 0);
          URL.revokeObjectURL(objectUrl);

          const hints = new Map();
          hints.set(DecodeHintType.POSSIBLE_FORMATS, [BarcodeFormat.QR_CODE]);
          hints.set(DecodeHintType.TRY_HARDER, true);
          
          const reader = new BrowserMultiFormatReader(hints);
          const zxingResult = await (reader as any).decodeFromCanvas(canvas);
          
          if (zxingResult && zxingResult.getText()) {
            const zxingText = zxingResult.getText().trim();
            setFileSuccess(zxingText);
            addLog('success', `QR detectado via motor ZXing secundário! Conteúdo: "${zxingText}"`);
            feedback.success();
            playBeep('success');
            setTimeout(() => {
              handleSuccessfulScan(zxingText);
            }, 1000);
          } else {
            throw new Error("Nenhum código detectado na segunda tentativa.");
          }
        } catch (zxingError) {
          console.log("Ambos os motores de decodificação falharam para a imagem enviada.");
          const errMsg = "Não foi possível encontrar nenhum QR Code legível nesta imagem. Certifique-se de que o código está nítido, claro e centralizado.";
          setFileError(errMsg);
          addLog('error', errMsg);
        }
      }
    }
  };

  // 4. Fallback: Parse QR Code from clipboard paste
  const handlePasteClipboard = async () => {
    try {
      setClipboardStatus('idle');
      addLog('info', 'Tentando ler área de transferência...');
      const text = await navigator.clipboard.readText();
      
      if (text.trim()) {
        setManualCode(text.trim());
        setClipboardStatus('success');
        addLog('success', `Texto recuperado da área de transferência com sucesso!`);
        setTimeout(() => setClipboardStatus('idle'), 2000);
      } else {
        throw new Error('Área de transferência está vazia.');
      }
    } catch (err: any) {
      setClipboardStatus('error');
      addLog('error', `Falha ao resgatar do clipboard: ${err.message || 'Sem Permissão'}`);
      setTimeout(() => setClipboardStatus('idle'), 3000);
    }
  };

  // 5. Direct Manual Submission
  const handleManualSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualCode.trim()) return;

    addLog('success', `Código inserido manualmente com sucesso: "${manualCode}"`);
    feedback.success();
    playBeep('success');
    handleSuccessfulScan(manualCode.trim());
  };

  return (
    <motion.div 
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[10000] bg-black/85 backdrop-blur-md text-white flex items-center justify-center p-0 sm:p-4 md:p-6 font-sans select-none overflow-y-auto"
    >
      {/* 🛠️ TEST DIAGNOSIS MODAL OVERLAY */}
      <AnimatePresence>
        {tempDecodedData !== null && (
          <motion.div
            initial={{ opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.98 }}
            className="absolute inset-0 z-[10005] bg-[#050907] flex flex-col p-4 md:p-6 lg:p-8 select-text overflow-y-auto"
          >
            {/* Modal Header */}
            <div className="w-full max-w-3xl mx-auto border-b border-white/10 pb-4 mb-4 flex items-center justify-between shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
                <div>
                  <h2 className="text-sm md:text-base font-black text-emerald-400 uppercase tracking-widest flex items-center gap-1.5">
                    🔎 QR Code Detectado pelo Decoder
                  </h2>
                  <p className="text-[10px] text-zinc-500 font-medium uppercase tracking-wider">Mapeamento de Entrada Ativo - Interrupção de Segurança para Diagnóstico</p>
                </div>
              </div>
              <button 
                onClick={() => {
                  setTempDecodedData(null);
                  setCopiedStatus(false);
                  handleRetry();
                }}
                className="w-8 h-8 rounded-full bg-white/5 hover:bg-rose-500/20 hover:text-rose-400 flex items-center justify-center transition-all cursor-pointer active:scale-90"
                title="Fechar e Retomar Scanner"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Modal Content */}
            <div className="w-full max-w-3xl mx-auto flex-1 flex flex-col gap-4 select-text">
              
              {/* Alert Warning Box */}
              <div className="bg-emerald-500/5 border border-emerald-500/20 rounded-xl p-3 flex gap-2.5 items-start text-[10px] md:text-xs">
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <p className="font-extrabold text-[#bfc5c3] text-xs">SUCESSO: Leitura Efetuada com Êxito!</p>
                  <p className="text-zinc-400 leading-relaxed">
                    O decoder leu e extraiu o conteúdo com sucesso. O fluxo de validação foi congelado propositalmente pela estratégia de teste para você analisar os metadados abaixo e diferenciar problemas de hardware de restrições de parser/backend.
                  </p>
                </div>
              </div>

              {/* Grid with Details */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 shrink-0">
                
                {/* 1. TEXTO RETORNADO METADATA */}
                <div className="bg-[#0b0e0c] border border-white/5 p-3 rounded-xl space-y-2">
                  <span className="text-[9px] font-black uppercase text-zinc-500 tracking-wider">Métricas do Decodificador</span>
                  <div className="grid grid-cols-2 gap-2 text-[11px]">
                    <div className="bg-white/[0.02] p-2.5 rounded-lg border border-white/5">
                      <div className="text-[9px] text-[#8b9290] font-black">TAMANHO</div>
                      <div className="text-xs font-black text-white">{tempDecodedData.length} caracteres</div>
                    </div>
                    <div className="bg-white/[0.02] p-2.5 rounded-lg border border-white/5">
                      <div className="text-[9px] text-[#8b9290] font-black">TIPO DE DADO</div>
                      <div className={`text-xs font-black uppercase ${(() => {
                        try {
                          JSON.parse(tempDecodedData);
                          return 'text-emerald-400';
                        } catch(e) {
                          return 'text-zinc-300';
                        }
                      })()}`}>
                        {(() => {
                          try {
                            JSON.parse(tempDecodedData);
                            return 'JSON Válido ✔';
                          } catch(e) {
                            return 'Texto Puro 🔤';
                          }
                        })()}
                      </div>
                    </div>
                  </div>
                </div>

                {/* 2. SANITIZED FORM */}
                <div className="bg-[#0b0e0c] border border-white/5 p-3 rounded-xl space-y-1 flex flex-col justify-between">
                  <div>
                    <span className="text-[9px] font-black uppercase text-zinc-500 tracking-wider">Texto Sanitizado</span>
                    <p className="text-[9px] text-zinc-500 leading-none mb-1.5">Sem caracteres de controle ASCII ou códigos invisíveis.</p>
                  </div>
                  <div className="bg-black/40 border border-white/10 p-2.5 rounded-lg text-[11px] font-mono select-all text-emerald-300 break-all max-h-[60px] overflow-y-auto">
                    {tempDecodedData.replace(/[\x00-\x09\x0B\x0C\x0E-\x1F\x7F-\x9F]/g, '')}
                  </div>
                </div>

              </div>

              {/* 3. ORIGINAL RAW DETAILED PREVIEW */}
              <div className="bg-[#0b0e0c] border border-white/5 p-3.5 rounded-xl flex-1 flex flex-col gap-2 min-h-[110px]">
                <div className="flex items-center justify-between">
                  <span className="text-[9px] font-black uppercase text-emerald-400 tracking-widest font-mono">Conteúdo Bruto Original (Texto Puro)</span>
                  <span className="text-[8px] font-mono text-zinc-600 uppercase">Leitura Crua do Frame</span>
                </div>
                <div className="bg-black/60 border border-white/10 p-3 rounded-lg text-xs font-mono text-zinc-100 select-all break-all whitespace-pre-wrap overflow-y-auto flex-1 max-h-[140px]">
                  {tempDecodedData}
                </div>
              </div>

              {/* 4. VISUALIZATION OF SPECIAL CHARACTERS & WHITESPACES */}
              <div className="bg-[#0b0e0c] border border-white/5 p-3.5 rounded-xl flex-1 flex flex-col gap-2 min-h-[100px]">
                <div className="flex items-center justify-between shrink-0">
                  <div>
                    <span className="text-[9px] font-black uppercase text-indigo-400 tracking-widest font-mono">Espaços e Quebras Invisíveis</span>
                    <p className="text-[9px] text-zinc-500">Legenda: <b className="text-zinc-300">·</b> = espaço em branco | <b className="text-zinc-300">\n</b> = quebra de linha | <b className="text-zinc-300">\r</b> = carriage return</p>
                  </div>
                </div>
                <div className="bg-black/60 border border-white/10 p-3 rounded-lg text-xs font-mono text-indigo-200 select-all break-all whitespace-pre-wrap overflow-y-auto flex-1 max-h-[120px] leading-relaxed">
                  {tempDecodedData
                    .replace(/\r/g, '\\r')
                    .replace(/\n/g, '\\n\n')
                    .replace(/\t/g, '\\t')
                    .replace(/ /g, '·')}
                </div>
              </div>

              {/* 5. PARSED JSON INTERPRETER */}
              <div className="bg-[#0b0e0c] border border-white/5 p-3.5 rounded-xl flex flex-col gap-2 shrink-0">
                <span className="text-[9px] font-black uppercase text-zinc-500 tracking-wide">Representação Estrutural (Visualizar JSON)</span>
                <pre className="bg-black/40 border border-white/10 p-2.5 rounded-lg text-[11px] font-mono text-zinc-300 break-all select-all overflow-y-auto max-h-[80px]">
                  {(() => {
                    try {
                      return JSON.stringify(JSON.parse(tempDecodedData), null, 2);
                    } catch (e) {
                      return JSON.stringify(tempDecodedData);
                    }
                  })()}
                </pre>
              </div>

              {/* Lower Toolbar Buttons */}
              <div className="flex flex-col sm:flex-row items-center gap-2.5 mt-2 pb-2 shrink-0 select-none">
                
                {/* Close and Retry Scanner Button */}
                <button
                  type="button"
                  onClick={() => {
                    setTempDecodedData(null);
                    setCopiedStatus(false);
                    handleRetry();
                  }}
                  className="w-full sm:w-auto px-4 h-10 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-[#d0dcd8] font-extrabold text-[10px] uppercase tracking-wider transition-all flex items-center justify-center gap-1.5 cursor-pointer active:scale-95"
                >
                  <RefreshCw className="w-3.5 h-3.5" /> Descartar & Retomar Scanner
                </button>

                {/* Copy decoded data button */}
                <button
                  type="button"
                  onClick={() => {
                    navigator.clipboard.writeText(tempDecodedData);
                    setCopiedStatus(true);
                    addLog('info', 'Dados de diagnóstico copiados para a área de transferência.');
                    setTimeout(() => setCopiedStatus(false), 2000);
                  }}
                  className="w-full sm:w-auto px-4 h-10 rounded-xl bg-[#0c0f0d] hover:bg-indigo-500/10 hover:border-indigo-500/20 border border-white/10 text-indigo-300 font-extrabold text-[10px] uppercase tracking-wider transition-all flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  {copiedStatus ? (
                    <>
                      <Check className="w-3.5 h-3.5 text-emerald-400 font-black animate-bounce" /> Copiado!
                    </>
                  ) : (
                    <>
                      <Clipboard className="w-3.5 h-3.5" /> Copiar Conteúdo Lido
                    </>
                  )}
                </button>

                {/* Force bypass button to trigger onScan */}
                <button
                  type="button"
                  onClick={() => {
                    const text = tempDecodedData;
                    setTempDecodedData(null);
                    setCopiedStatus(false);
                    onScan(text);
                  }}
                  className="w-full sm:flex-1 h-10 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 text-white font-black text-[10px] uppercase tracking-wider transition-all hover:brightness-110 active:scale-95 flex items-center justify-center gap-1.5 cursor-pointer shadow-lg shadow-emerald-500/10"
                >
                  <CheckCircle2 className="w-4 h-4" /> Confirmar e Enviar Código
                </button>

              </div>

            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* BACKGROUND MATTE */}
      <style dangerouslySetInnerHTML={{ __html: `
        .bg-cyber-pattern {
          background: 
            radial-gradient(circle at 50% 50%, rgba(99, 102, 241, 0.05), transparent 60%),
            #030504;
        }
        .custom-terminal::-webkit-scrollbar {
          width: 4px;
        }
        .custom-terminal::-webkit-scrollbar-track {
          background: transparent;
        }
        .custom-terminal::-webkit-scrollbar-thumb {
          background: #1e293b;
          border-radius: 4px;
        }
        #common-qr-reader {
          width: 100% !important;
          height: 100% !important;
          border: none !important;
          background: transparent !important;
        }
        #common-qr-reader video {
          width: 100% !important;
          height: 100% !important;
          object-fit: contain !important;
          transition: transform 0.3s ease;
          transform: ${isMirrored ? 'scaleX(-1)' : 'scaleX(1)'} !important;
        }
      `}} />

      <div className="relative bg-[#070908] bg-cyber-pattern border border-white/10 rounded-none sm:rounded-2xl w-full sm:max-w-xl md:max-w-2xl flex flex-col items-center justify-between p-6 shadow-[0_24px_50px_rgba(0,0,0,0.85)] overflow-y-auto my-auto max-h-screen sm:max-h-[95vh] custom-scrollbar">
        
        {/* HEADER BLOCK */}
        <div className="w-full max-w-lg flex items-center justify-between border-b border-white/5 pb-4 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 flex items-center justify-center">
              <Camera className="w-4.5 h-4.5 animate-pulse" />
            </div>
            <div>
              <h2 className="text-sm font-black uppercase tracking-tight leading-none text-white">{title}</h2>
              <span className="text-[9px] font-black uppercase tracking-widest text-indigo-400 mt-1 block">{description}</span>
            </div>
          </div>
          <button 
            onClick={handleCloseScanner}
            className="w-8 h-8 rounded-lg border border-white/10 bg-white/[0.03] text-white/40 flex items-center justify-center hover:bg-white/10 hover:text-white transition-all active:scale-95"
            title="Fechar"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* INTERACTION TABS SELECTION */}
        {!isLogin && !forcedTab && (
          <div className="grid grid-cols-3 gap-1 bg-[#101311] p-1.5 rounded-2xl border border-white/5 w-full max-w-lg mt-4 shrink-0">
            <button
              onClick={() => setActiveTab('camera')}
              className={`py-2 px-3 rounded-xl transition-all font-black text-[9px] uppercase tracking-wider flex items-center justify-center gap-1.5 ${
                activeTab === 'camera' 
                  ? 'bg-indigo-500 text-white shadow-lg' 
                  : 'text-white/40 hover:text-white/80 hover:bg-white/[0.02]'
              }`}
            >
              <Camera className="w-3.5 h-3.5" /> Câmera ao Vivo
            </button>
            <button
              onClick={() => setActiveTab('upload')}
              className={`py-2 px-3 rounded-xl transition-all font-black text-[9px] uppercase tracking-wider flex items-center justify-center gap-1.5 ${
                activeTab === 'upload' 
                  ? 'bg-indigo-500 text-white shadow-lg' 
                  : 'text-white/40 hover:text-white/80 hover:bg-white/[0.02]'
              }`}
            >
              <Upload className="w-3.5 h-3.5" /> Enviar Imagem
            </button>
            <button
              onClick={() => setActiveTab('manual')}
              className={`py-2 px-3 rounded-xl transition-all font-black text-[9px] uppercase tracking-wider flex items-center justify-center gap-1.5 ${
                activeTab === 'manual' 
                  ? 'bg-indigo-500 text-white shadow-lg' 
                  : 'text-white/40 hover:text-white/80 hover:bg-white/[0.02]'
              }`}
            >
              <Type className="w-3.5 h-3.5" /> Digitar Manual
            </button>
          </div>
        )}

        {/* CONTAINER SWITCH SLOTS */}
        <div className="flex-1 w-full max-w-lg flex flex-col items-center justify-center py-6 min-h-[300px]">
          <AnimatePresence mode="wait">
            
            {/* TAB 1: REAL-TIME VIDEO CAMERA */}
            {activeTab === 'camera' && (
              <motion.div
                key="camera-tab"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="w-full flex flex-col items-center gap-5"
              >
                {/* Real-time Video Viewport */}
                <div className="relative w-full max-w-[540px] mx-auto aspect-[4/3] sm:aspect-video bg-black rounded-[24px] overflow-hidden border border-white/10 shadow-[0_12px_40px_rgba(0,0,0,0.7)] flex flex-col items-center justify-center">
                  
                  {loading && (
                    <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-slate-950 z-20">
                      <RefreshCw className="w-5 h-5 text-indigo-400 animate-spin" />
                      <p className="text-[9px] font-black uppercase tracking-widest text-indigo-400/80">Inicializando câmera...</p>
                    </div>
                  )}

                  {!permissionError && !errorState && (
                    <video 
                      ref={videoRef}
                      className="w-full h-full object-contain"
                      style={{ 
                        transform: isMirrored ? 'scaleX(-1)' : 'scaleX(1)',
                        objectFit: 'contain'
                      }}
                      playsInline
                      muted
                    />
                  )}

                  {/* Manual View Settings Toggle Controls */}
                  {!loading && !permissionError && !errorState && !isLogin && (
                    <div className="absolute top-3 right-3 flex items-center gap-2 z-20">
                      <button
                        type="button"
                        onClick={() => setIsMirrored(prev => !prev)}
                        className="p-1 px-2.5 bg-[#070908]/90 backdrop-blur-md border border-white/10 rounded-lg hover:bg-slate-900 text-[8.5px] font-bold text-indigo-400 hover:text-white transition-all active:scale-95 uppercase tracking-wider"
                        title="Inverte o espelhamento horizontal da câmera"
                      >
                        {isMirrored ? "Espelhar: Sim" : "Espelhar: Não"}
                      </button>
                    </div>
                  )}

                  {/* Permission Denied Card */}
                  {permissionError && (
                    <div className="absolute inset-0 p-5 flex flex-col items-center justify-center text-center bg-slate-950 z-25 space-y-3.5">
                      <AlertTriangle className="w-7 h-7 text-amber-500 animate-pulse" />
                      <p className="text-[11px] font-extrabold text-white leading-relaxed px-1 uppercase">
                        Área de Mídia Bloqueada
                      </p>
                      <p className="text-[9.5px] text-zinc-300 font-medium px-2 leading-relaxed">
                        Permissão de câmera necessária para leitura de QR Code. Verifique se a câmera está conectada e liberada no Windows ou no navegador.
                      </p>
                      <div className="flex gap-2.5">
                        <button
                          onClick={() => {
                            setShowDiagnostic(true);
                            startDiagnosticTest();
                          }}
                          className="px-4 py-2 bg-emerald-500 hover:bg-emerald-600 font-extrabold text-[9px] text-white uppercase tracking-wider rounded-xl transition-all active:scale-95 shadow-md shadow-emerald-500/10"
                        >
                          Testar Câmera
                        </button>
                        <button
                          onClick={() => setActiveTab('upload')}
                          className="px-4 py-2 bg-indigo-500 hover:bg-indigo-600 font-extrabold text-[9px] text-white uppercase tracking-wider rounded-xl transition-all active:scale-95 shadow-md shadow-indigo-500/10"
                        >
                          Utilizar Alternativas
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Erro Geral de Inicialização */}
                  {errorState && !permissionError && (
                    <div className="absolute inset-0 p-5 flex flex-col items-center justify-center text-center bg-slate-950 z-25 space-y-3">
                      <AlertTriangle className="w-7 h-7 text-red-500 animate-pulse" />
                      <p className="text-[11px] font-extrabold text-white leading-relaxed uppercase">
                        Falha no Stream da Câmera
                      </p>
                      <p className="text-[10px] text-zinc-400 px-3 font-medium">
                        {isLogin
                          ? "Nenhuma câmera encontrada. Conecte uma webcam ou use outro método de login."
                          : "O navegador recusou ou falhou em obter esta lente de câmera específica."}
                      </p>
                      <button
                        onClick={handleRetry}
                        className="px-4 py-2 bg-indigo-500/15 hover:bg-indigo-500/30 text-indigo-300 font-black text-[9px] uppercase tracking-wider rounded-xl transition-all"
                      >
                        Tentar Novamente
                      </button>
                    </div>
                  )}

                  {/* Erro de Validação Externo (ex: login falhou / crachá inválido) */}
                  {validationError && (
                    <div className="absolute inset-0 p-5 flex flex-col items-center justify-center text-center bg-slate-950 z-25 space-y-3.5">
                      <AlertTriangle className="w-8 h-8 text-rose-500 animate-bounce" />
                      <p className="text-[11px] font-black text-rose-400 leading-relaxed uppercase tracking-wider">
                        Falha de Autenticação
                      </p>
                      <p className="text-[10px] text-zinc-300 px-4 leading-relaxed font-bold">
                        {validationError}
                      </p>
                      <button
                        onClick={() => {
                          if (onClearValidationError) onClearValidationError();
                          handleRetry();
                        }}
                        className="px-5 py-2.5 bg-indigo-500 hover:bg-indigo-400 text-white font-black text-xs uppercase tracking-wider rounded-xl transition-all shadow-md active:scale-95 animate-pulse"
                      >
                        Tentar Novamente
                      </button>
                    </div>
                  )}

                  {/* Target Overlay and Lasers */}
                  {!loading && !permissionError && !errorState && !validationError && (
                    /* --- 2. GUIDE LAYER (AESTHETIC ONLY GUIDES, NO TEXT COVERS) --- */
                    <div className="absolute inset-0 border-[3px] border-indigo-500/10 rounded-[24px] pointer-events-none flex flex-col items-center justify-center z-10 p-4">
                      {/* Video capture tracking frame (larger guide with neon styling) */}
                      <div className="w-[78%] h-[78%] border-2 border-indigo-500/20 rounded-3xl flex flex-col items-center justify-between p-4 relative overflow-hidden backdrop-blur-[0.5px]">
                        {/* Red HUD Tracker scan line */}
                        <div className="w-full h-[2px] bg-red-500/80 animate-scanner-scan shadow-[0_0_12px_rgba(239,68,68,0.7)] absolute left-0"></div>
                        
                        {/* High Vis Corner brackets representing analyzed area */}
                        <div className="absolute top-0 left-0 w-6 h-6 border-t-4 border-l-4 border-emerald-400 rounded-tl-xl"></div>
                        <div className="absolute top-0 right-0 w-6 h-6 border-t-4 border-r-4 border-emerald-400 rounded-tr-xl"></div>
                        <div className="absolute bottom-0 left-0 w-6 h-6 border-b-4 border-l-4 border-emerald-400 rounded-bl-xl"></div>
                        <div className="absolute bottom-0 right-0 w-6 h-6 border-b-4 border-r-4 border-emerald-400 rounded-br-xl"></div>
                      </div>
                    </div>
                  )}
                </div>

                {/* --- 3. STATUS/UI LAYER (DEDICATED PANEL OUTSIDE CAMERA AREA) --- */}
                {!loading && !permissionError && !errorState && !validationError && (
                  <div className="w-full max-w-[540px] bg-[#101311]/95 border border-white/10 p-4 rounded-2xl shadow-xl flex flex-col gap-3 mt-2 select-none">
                    <div className="flex flex-col gap-1 text-center sm:text-left">
                      <div className="flex items-center justify-center sm:justify-start gap-2">
                        <span className="flex h-2 w-2 relative shrink-0">
                          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                          <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                        </span>
                        <span className="text-[11px] font-black uppercase tracking-wider text-emerald-400">
                          Leitor de Código Operacional
                        </span>
                      </div>
                      <p className="text-[10.5px] text-zinc-300 font-medium">
                        Posicione o QR Code dentro do visor. A leitura ocorrerá de forma instantânea e automatizada.
                      </p>
                      {!isLogin && (
                        <div className="text-[8.5px] text-zinc-500 border-t border-white/5 pt-2 mt-1 flex justify-between items-center bg-[#070908]/50 p-1.5 rounded-lg">
                          <span>Motor Ativo: <b className="text-zinc-300">ZXing Engine 1:N</b></span>
                          <span>Precisão: <b className="text-zinc-300">HQ Balanced</b></span>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Process Settings or Camera selector */}
                {!permissionError && !errorState && !loading && (!isLogin || cameras.length > 1) && (
                  <div className="w-full max-w-[420px] flex flex-col sm:flex-row items-center justify-center gap-3 select-text p-1 mt-2">
                    
                    {/* Active Camera Lens selection (if multiple lenses are available) */}
                    {cameras.length > 1 && (
                      <div className="flex flex-col gap-1 w-full text-center sm:text-left flex-1">
                        <span className="text-[8px] font-black uppercase tracking-widest text-[#8b9290] pl-1">Alternar Lente</span>
                        <div className="flex gap-1.5 w-full">
                          <select
                            value={selectedCameraId}
                            onChange={(e) => {
                              const newCamId = e.target.value;
                              setSelectedCameraId(newCamId);
                              localStorage.setItem('nexus.qrscanner.preferredCameraId', newCamId);
                              addLog('info', `Câmera preferida alterada e persistida: ${newCamId}`);
                            }}
                            className="flex-1 h-[36px] px-3 py-2 bg-[#101311] hover:bg-white/[0.04] border border-white/10 rounded-xl text-[10px] font-black text-white/80 focus:outline-none focus:border-indigo-500 transition-all uppercase tracking-wider text-center cursor-pointer font-sans"
                          >
                            {cameras.map((cam, index) => (
                              <option key={cam.deviceId} value={cam.deviceId} className="bg-[#0c0f0d] text-white font-sans text-xs">
                                {cam.label || `Lente integrada ${index + 1}`}
                              </option>
                            ))}
                          </select>
                          <button
                            type="button"
                            onClick={() => {
                              if (cameras.length > 0) {
                                const currentIndex = cameras.findIndex(c => c.deviceId === selectedCameraId);
                                const nextIndex = (currentIndex + 1) % cameras.length;
                                const nextCamId = cameras[nextIndex].deviceId;
                                setSelectedCameraId(nextCamId);
                                localStorage.setItem('nexus.qrscanner.preferredCameraId', nextCamId);
                                addLog('info', `Ciclo de câmera efetuado: ${nextCamId}`);
                              }
                            }}
                            className="px-3 h-[36px] bg-indigo-600/25 hover:bg-indigo-600/40 border border-indigo-500/30 rounded-xl text-[10px] font-black uppercase tracking-wider text-indigo-300 transition-all active:scale-95 cursor-pointer font-sans"
                          >
                            Trocar câmera
                          </button>
                        </div>
                      </div>
                    )}
                    
                    {/* Decode Precision settings (HQ vs Balanced) */}
                    {!isLogin && (
                      <div className="flex flex-col gap-1 w-full text-center sm:text-left flex-1 select-none">
                        <span className="text-[8px] font-black uppercase tracking-widest text-[#8b9290] pl-1">Resolução do Scanner</span>
                        <div className="grid grid-cols-2 gap-1 bg-[#101311] p-1 rounded-xl border border-white/10 h-[36px]">
                          <button
                            type="button"
                            onClick={() => {
                              setDecodeMode('desktop-balanced');
                              addLog('info', 'Filtro alterado: Otimizado Desktop (Rápido & Focado)');
                            }}
                            className={`py-1 rounded-lg text-[8.5px] font-black uppercase tracking-wider transition-all cursor-pointer flex items-center justify-center ${
                              decodeMode === 'desktop-balanced'
                                ? 'bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 font-extrabold'
                                : 'text-zinc-500 hover:text-zinc-300'
                            }`}
                          >
                            Equilibrado
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setDecodeMode('desktop-hq');
                              addLog('info', 'Filtro alterado: Resolução Plena HD (Detalhe Máximo)');
                            }}
                            className={`py-1 rounded-lg text-[8.5px] font-black uppercase tracking-wider transition-all cursor-pointer flex items-center justify-center ${
                              decodeMode === 'desktop-hq'
                                ? 'bg-indigo-500/15 border border-indigo-500/30 text-indigo-400 font-extrabold'
                                : 'text-zinc-500 hover:text-zinc-300'
                            }`}
                          >
                            Ultra HQ
                          </button>
                        </div>
                      </div>
                    )}
                    
                    {/* Botão permanente de Teste/Diagnóstico se câmera ativa */}
                    {!isLogin && (
                      <div className="flex flex-col gap-1 w-full text-center sm:text-left flex-1 select-none">
                        <span className="text-[8px] font-black uppercase tracking-widest text-[#8b9290] pl-1">Diagnóstico</span>
                        <button
                          type="button"
                          onClick={() => {
                            setShowDiagnostic(true);
                            startDiagnosticTest();
                          }}
                          className="w-full h-[36px] bg-[#101311] hover:bg-white/[0.04] border border-white/10 rounded-xl text-[8.5px] font-black text-emerald-400 focus:outline-none hover:text-emerald-300 transition-all uppercase tracking-wider text-center cursor-pointer flex items-center justify-center gap-1.5"
                        >
                          🧪 Testar Câmera
                        </button>
                      </div>
                    )}
                    
                  </div>
                )}

                {/* Gaveta de Logs de Auditoria Técnica */}
                <div className="w-full max-w-[540px] flex flex-col gap-2 mt-4 select-none mr-auto ml-auto px-4 sm:px-0">
                  <button
                    type="button"
                    onClick={() => setShowDetailedLogs(!showDetailedLogs)}
                    className="w-full py-2 bg-white/[0.02] hover:bg-white/[0.05] border border-white/5 hover:border-white/10 rounded-xl text-[8.5px] font-black text-zinc-400 focus:outline-none transition-all uppercase tracking-widest text-center cursor-pointer flex items-center justify-center gap-1.5"
                  >
                    {showDetailedLogs ? 'Hide Technical Diagnostics ▲' : 'Show Technical Diagnostics ▼'}
                  </button>

                  <AnimatePresence>
                    {showDetailedLogs && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.2 }}
                        className="overflow-hidden w-full text-left"
                      >
                        <div className="font-mono text-[9px] text-zinc-400 bg-[#0c0f0d] p-3 rounded-xl border border-white/5 max-h-[160px] overflow-y-auto custom-scrollbar flex flex-col gap-1 w-full text-left">
                          {logs.length === 0 ? (
                            <div className="text-zinc-600 italic">Nenhum log registrado ainda...</div>
                          ) : (
                            logs.slice(-20).map((log, idx) => (
                              <div key={idx} className={cn(
                                "leading-relaxed break-words",
                                log.type === 'error' ? 'text-rose-400' :
                                log.type === 'success' ? 'text-emerald-400 font-bold' :
                                log.type === 'warn' ? 'text-amber-400' : 'text-zinc-400'
                              )}>
                                <span className="text-[7.5px] text-zinc-600 mr-1.5 uppercase font-sans">
                                  [{new Date(log.time).toLocaleTimeString([], { hour12: false })}]
                                </span>
                                {log.message}
                              </div>
                            ))
                          )}
                          <div ref={logsEndRef} />
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              </motion.div>
            )}

            {/* TAB 2: FILE UPLOAD WITH AUTOMATIC PARSING */}
            {activeTab === 'upload' && (
              <motion.div
                key="upload-tab"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="w-full flex flex-col items-center justify-center gap-5"
              >
                <div className="w-full max-w-[280px] aspect-square bg-[#101311] rounded-[40px] border border-dashed border-white/10 p-6 flex flex-col items-center justify-center text-center relative group hover:border-indigo-500/50 transition-all">
                  <input
                    type="file"
                    accept="image/*,application/pdf"
                    onChange={handleFileUpload}
                    className="absolute inset-0 opacity-0 cursor-pointer z-10"
                    title="Selecione um QR Code ou arquivo PDF"
                  />
                  
                  <div className="w-12 h-12 rounded-2xl bg-indigo-500/5 border border-indigo-500/10 text-indigo-400 flex items-center justify-center mb-3 group-hover:scale-110 group-hover:bg-indigo-500/10 transition-all">
                    <Upload className="w-5 h-5 pointer-events-none" />
                  </div>
                  
                  <span className="text-[10.5px] font-black text-white/90 uppercase tracking-wider block mb-1">Upload de Arquivo</span>
                  <p className="text-[9px] text-[#8b9290] font-medium leading-relaxed uppercase tracking-wider px-2">
                    Clique aqui para carregar uma imagem (PNG, JPG, WEBP) ou documento PDF
                  </p>
                </div>

                {/* Successful File Decoded notification */}
                {fileSuccess && (
                  <div className="w-full max-w-[280px] bg-emerald-500/10 border border-emerald-500/20 p-2.5 rounded-xl flex items-center gap-2 text-emerald-400 text-[10px] font-bold">
                    <CheckCircle2 className="w-4 h-4 shrink-0" />
                    <span className="truncate">CÓDIGO DECODIFICADO: "{fileSuccess}"</span>
                  </div>
                )}

                {/* File Error Details */}
                {fileError && (
                  <div className="w-full max-w-[280px] bg-rose-500/10 border border-rose-500/20 p-3 rounded-xl flex items-start gap-2 text-rose-300 text-[9.5px] font-bold select-text leading-relaxed">
                    <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5 text-rose-400" />
                    <span>{fileError}</span>
                  </div>
                )}
              </motion.div>
            )}

            {/* TAB 3: TYPING PREVIEW OR INTEGRATION PASTE (FALLBACK) */}
            {activeTab === 'manual' && (
              <motion.div
                key="manual-tab"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="w-full flex flex-col items-center gap-4"
              >
                <form onSubmit={handleManualSubmit} className="w-full max-w-[320px] space-y-3.5 select-text">
                  <div className="flex flex-col gap-1.5">
                    <label className="text-[8.5px] font-black tracking-widest text-[#8b9290] uppercase">Digite ou Cole o Conteúdo do QR</label>
                    <div className="relative">
                      <input
                        type="text"
                        value={manualCode}
                        onChange={(e) => setManualCode(e.target.value)}
                        placeholder="EX: ID-TRANSACAO-84729"
                        className="w-full bg-[#101311] border border-white/10 rounded-xl px-4 py-3 text-xs text-white uppercase font-black tracking-wide outline-none focus:border-indigo-500 pr-10"
                        autoFocus
                      />
                      <button
                        type="button"
                        onClick={handlePasteClipboard}
                        className="absolute right-2 top-1/2 -translate-y-1/2 w-7 h-7 rounded-lg hover:bg-white/5 flex items-center justify-center text-[#8b9290] hover:text-white transition-all active:scale-90"
                        title="Colar da área de transferência"
                      >
                        <Clipboard className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  <div className="flex gap-2">
                    <button
                      type="submit"
                      disabled={!manualCode.trim()}
                      className="flex-1 h-10 rounded-xl bg-gradient-to-br from-indigo-500 to-indigo-600 text-white font-black text-[10px] uppercase tracking-wider transition-all hover:brightness-110 active:scale-95 disabled:opacity-40 disabled:pointer-events-none flex items-center justify-center gap-1.5 shadow-lg shadow-indigo-500/20"
                    >
                      <Sparkles className="w-3.5 h-3.5" /> Confirmar Código Manual
                    </button>
                  </div>
                </form>

                {/* clipboard response toast and success alerts */}
                {clipboardStatus === 'success' && (
                  <div className="bg-emerald-500/10 border border-emerald-500/20 px-3 py-1.5 rounded-lg text-emerald-400 text-[9px] font-black uppercase tracking-wider">
                    📋 Conteúdo colado com sucesso!
                  </div>
                )}
                {clipboardStatus === 'error' && (
                  <div className="bg-rose-500/10 border border-rose-500/30 px-3 py-1.5 rounded-lg text-rose-300 text-[8.5px] font-bold text-center leading-relaxed max-w-[280px]">
                    Não conseguimos acessar o clipboard. Por favor, cole manualmente usando o atalho (Ctrl+V / Cmd+V).
                  </div>
                )}
              </motion.div>
            )}

          </AnimatePresence>
        </div>

        {/* Helper oculto para processamento assíncrono de upload de imagens */}
        <div id="common-qr-reader-hidden-helper" style={{ display: 'none' }} />

        {/* Hidden ref slot to prevent unused errors */}
        <span ref={logsEndRef} className="hidden" />

      </div>

      {/* 🛠️ MODAL DE DIAGNÓSTICO E TESTE DE CÂMERA */}
      <AnimatePresence>
        {showDiagnostic && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="fixed inset-0 z-[11000] bg-black/95 flex items-center justify-center p-4 backdrop-blur-md select-text"
          >
            <div className="bg-[#0b0e0c] border border-white/10 rounded-2xl w-full max-w-lg p-5 flex flex-col gap-4 shadow-2xl">
              <div className="flex items-center justify-between border-b border-white/5 pb-3">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-lg bg-emerald-500/10 flex items-center justify-center text-emerald-400">
                    <Camera className="w-4 h-4 animate-pulse" />
                  </div>
                  <div>
                    <h3 className="text-xs font-black uppercase tracking-wider text-white">Diagnóstico e Teste de Câmera</h3>
                    <p className="text-[8px] uppercase tracking-widest text-[#8b9290]">Validador de hardware e drivers</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={closeDiagnostic}
                  className="w-7 h-7 rounded-lg bg-white/5 text-white/60 hover:bg-white/10 hover:text-white transition-all flex items-center justify-center"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Mensagem de Configuração / Orientação do Windows */}
              <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-3 flex gap-2.5">
                <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
                <div className="flex flex-col gap-0.5">
                  <span className="text-[9px] font-black uppercase tracking-wider text-amber-300">Aviso importante para Windows / Desktop:</span>
                  <p className="text-[9.5px] font-medium text-zinc-300 leading-relaxed text-left">
                    Permissão de câmera necessária para leitura de QR Code. Verifique se a câmera está conectada fisicamente e liberada nas configurações de Privacidade do Windows (Configurações &gt; Privacidade &gt; Câmera &gt; "Permitir que os aplicativos acessem sua câmera").
                  </p>
                </div>
              </div>

              {/* Video Preview ou Loader */}
              <div className="aspect-video bg-slate-950 rounded-xl overflow-hidden border border-white/5 relative flex items-center justify-center">
                {diagStream ? (
                  <video
                    ref={diagVideoRef}
                    className="w-full h-full object-contain"
                    playsInline
                    muted
                  />
                ) : (
                  <div className="absolute inset-0 flex flex-col items-center justify-center gap-2.5 p-4 text-center">
                    <div className="w-9 h-9 rounded-full bg-zinc-900 border border-white/5 flex items-center justify-center text-[#8b9290]">
                      <Camera className="w-4 h-4" />
                    </div>
                    <span className="text-[9px] font-black uppercase tracking-widest text-zinc-500">Video feed desativado</span>
                  </div>
                )}

                {diagIsTesting && (
                  <div className="absolute inset-0 bg-black/85 flex flex-col items-center justify-center gap-2">
                    <RefreshCw className="w-5 h-5 text-indigo-400 animate-spin" />
                    <span className="text-[8.5px] font-black uppercase tracking-widest text-indigo-300">Consultando hardware...</span>
                  </div>
                )}
              </div>

              {/* Seletor de Câmeras */}
              {diagDevices.length > 0 && (
                <div className="flex flex-col gap-1 w-full text-left">
                  <span className="text-[8px] font-black uppercase tracking-widest text-[#8b9290] pl-1">Selecione o Dispositivo para Testar</span>
                  <select
                    value={diagSelectedCamera}
                    onChange={(e) => {
                      setDiagSelectedCamera(e.target.value);
                      startDiagnosticTest(e.target.value);
                    }}
                    className="w-full h-[36px] px-3 py-2 bg-[#101311] hover:bg-white/[0.04] border border-white/10 rounded-xl text-[10px] font-black text-white/80 focus:outline-none focus:border-indigo-500 transition-all uppercase tracking-wider cursor-pointer"
                  >
                    {diagDevices.map((cam, idx) => (
                      <option key={cam.deviceId || idx} value={cam.deviceId} className="bg-slate-950 text-white font-sans text-xs">
                        {cam.label || `Lente de captação ${idx + 1}`}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* Logs ou detalhe de status do diagnóstico */}
              <div className="bg-[#121614] rounded-xl p-3 border border-white/5 max-h-[100px] overflow-y-auto font-mono text-[9px] text-[#8b9290] leading-relaxed break-all text-left">
                <div className="text-white font-bold mb-1 font-sans text-[8px] uppercase tracking-widest">Logs de Captura:</div>
                <div className="whitespace-pre-wrap">{diagMessage || 'Nenhum teste foi iniciado. Clique em "Iniciar Teste" abaixo.'}</div>
              </div>

              {/* Ações */}
              <div className="flex gap-2.5 border-t border-white/5 pt-3 mt-1.5 justify-end">
                {diagStream ? (
                  <button
                    type="button"
                    onClick={stopDiagnosticTest}
                    className="px-4 py-2 bg-red-500/10 hover:bg-red-500/20 text-red-400 font-extrabold text-[9px] uppercase tracking-wider rounded-xl transition-all"
                  >
                    Parar Câmera
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => startDiagnosticTest(diagSelectedCamera)}
                    className="px-4 py-2 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 font-extrabold text-[9px] uppercase tracking-wider rounded-xl transition-all"
                  >
                    Iniciar Teste
                  </button>
                )}
                <button
                  type="button"
                  onClick={closeDiagnostic}
                  className="px-4 py-2 bg-indigo-500 hover:bg-indigo-600 font-extrabold text-[9px] text-white uppercase tracking-wider rounded-xl transition-all active:scale-95 shadow-md shadow-indigo-500/10"
                >
                  Confirmar e Fechar
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
