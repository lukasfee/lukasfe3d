import React from 'react';
import { useStore, type User as StoreUser } from '../store';
import { motion, AnimatePresence } from 'motion/react';
import { QrCode, KeyRound, User, Lock, ArrowRight, Camera, Eye, EyeOff, Wifi, CheckCircle2, Rss } from 'lucide-react';
import LocalServerConnection from '../components/LocalServerConnection';
import { cn } from '../lib/utils';
import { feedback } from '../lib/feedback';
import QRScanner from '../components/QRScanner';
import { format } from 'date-fns';
import { environmentService } from '../services/environmentService';
import { credentialValidationService } from '../services/credentialValidationService';
import { nfcServiceFactory } from '../services/NFCServiceFactory';
import { generateUUID } from '../utils/uuid';

export default function Login() {
  const lastScanProcessedTimeRef = React.useRef<number>(0);
  const loginLocal = useStore((state) => state.loginLocal);
  const loginWithQRCode = useStore((state) => state.loginWithQRCode);
  const users = useStore((state) => state.users);
  const badges = useStore((state) => state.badges) || [];
  const localNetwork = useStore((state) => state.localNetwork);
  const updateUser = useStore((state) => state.updateUser);
  const setRecoveryMasterPassword = useStore((state) => state.setRecoveryMasterPassword);
  const resetMasterAdminPasswordWithKey = useStore((state) => state.resetMasterAdminPasswordWithKey);
  const company = useStore((state) => state.company);

  const nfcTags = useStore((state) => state.nfcTags) || [];

  const handleNfcAuthenticate = (uid: string) => {
    setError('');
    setSuccessMessage('');

    const cleanUid = (uid || '').trim().toUpperCase();
    if (!cleanUid) return;

    // Hardened credential validation layer (debounce, anti-flood, lockouts, context-aware rule checks)
    const validationCheck = credentialValidationService.validateCredential(cleanUid, 'NFC', 'LOGIN');
    if (!validationCheck.success) {
      feedback.error();
      setError(validationCheck.error || 'Erro ao processar login NFC.');
      return;
    }

    console.log(`[React/NFC] Credential valid. Invoking active store login for UID: ${cleanUid}`);
    const loginFn = useStore.getState().loginWithNFC;
    const res = loginFn(cleanUid);

    if (res.success) {
      feedback.success();
      setError('');
    } else {
      feedback.error();
      setError(res.error || 'Erro ao processar login NFC.');
    }
  };

  // Centralized hardware scan listeners for physical hardware via NFCServiceFactory
  React.useEffect(() => {
    const service = nfcServiceFactory.getService();
    console.log(`[React/NFC] Directing scanning service layer through: ${service.getPlatformName()}`);

    service.startScanning(
      (uid: string) => {
        handleNfcAuthenticate(uid);
      },
      (errMessage: string) => {
        console.warn(`[React/NFC Hardware Scanner Exception]: ${errMessage}`);
      }
    );

    return () => {
      service.stopScanning();
    };
  }, []);

  const [method, setMethod] = React.useState<'password' | 'qrcode' | 'recovery'>('password');
  const [showNetworkConnection, setShowNetworkConnection] = React.useState(false);
  const [login, setLogin] = React.useState('');
  const [password, setPassword] = React.useState('');
  const [showPassword, setShowPassword] = React.useState(false);
  const [error, setError] = React.useState('');
  const [scanning, setScanning] = React.useState(false);
  const [scannerMode] = React.useState<'qr'>('qr');

  // Estados para seleção de câmera e tratamento de erro de hardware de vídeo para o Login / QR Code
  const [loginCameras, setLoginCameras] = React.useState<MediaDeviceInfo[]>([]);
  const [cameraPreferredId, setCameraPreferredId] = React.useState<string>('');
  const [cameraError, setCameraError] = React.useState<string | null>(null);

  // Focus and input interaction refs to avoid locked and unresponsive fields
  const matriculaInputRef = React.useRef<HTMLInputElement>(null);
  const senhaInputRef = React.useRef<HTMLInputElement>(null);

  // Force-stop all active media streams to avoid CPU usage loops and freeze the UI threads
  const forceStopAllMediaStreams = React.useCallback(() => {
    try {
      const videoElements = document.querySelectorAll('video');
      videoElements.forEach(video => {
        if (video.srcObject instanceof MediaStream) {
          video.srcObject.getTracks().forEach(track => {
            try {
              track.stop();
            } catch (_) {}
          });
          video.srcObject = null;
        }
      });
    } catch (e) {
      console.warn('[Login/Diagnostics] Error force stopping media streams:', e);
    }
  }, []);

  // Centralized interaction reset and DOM cleanup subroutine
  const resetLoginInteractionState = React.useCallback(() => {
    if (process.env.NODE_ENV !== 'production') {
      console.log('[Login/Diagnostics] Executing resetLoginInteractionState()...');
    }

    // Clear loading, scanning and error states
    setScanning(false);
    setError('');
    forceStopAllMediaStreams();

    // Clear dynamic session locks
    (window as any).__nexusQrScannerAtivo = false;

    // Direct brute-force deletion of legacy dynamic scanner elements/helpers
    const idsToRemove = [
      'html5-qrcode-bubble', 
      'html5qr-code-full-region', 
      'qr-shaded-region', 
      'common-qr-reader-hidden-helper'
    ];
    idsToRemove.forEach(id => {
      const el = document.getElementById(id);
      if (el) {
        try {
          el.remove();
          if (process.env.NODE_ENV !== 'production') {
            console.log(`[Login/Diagnostics] Found and eradicated stray scanner DOM element: #${id}`);
          }
        } catch (err) {
          console.warn(`[Login/Diagnostics] Failed to eject element #${id}:`, err);
        }
      }
    });

    // Varnish all dynamic wildcard helper classes injected into body or layout
    document.querySelectorAll('[id^="html5-qrcode"]').forEach(el => {
      try {
        el.remove();
        if (process.env.NODE_ENV !== 'production') {
          console.log('[Login/Diagnostics] Swept and ejected wild html5-qrcode tag.');
        }
      } catch (err) {
        console.warn('[Login/Diagnostics] Wild elements sweep error:', err);
      }
    });

    // Enforce instant focal redirection with staggered intervals
    const focusTarget = () => {
      if (matriculaInputRef.current) {
        matriculaInputRef.current.focus();
        return true;
      }
      return false;
    };
    
    focusTarget();
    [20, 50, 100, 200, 350, 500, 750].forEach(delay => {
      setTimeout(focusTarget, delay);
    });
  }, [forceStopAllMediaStreams]);

  // Handle focus when method changes to password
  React.useEffect(() => {
    if (method === 'password') {
      const focusTarget = () => {
        if (matriculaInputRef.current) {
          matriculaInputRef.current.focus();
          return true;
        }
        return false;
      };
      
      focusTarget();
      [20, 50, 100, 200, 300, 450, 600, 800].forEach(delay => {
        setTimeout(focusTarget, delay);
      });
    }
  }, [method]);

  // Guarantee instant focus on initial mount
  React.useEffect(() => {
    resetLoginInteractionState();
  }, [resetLoginInteractionState]);

  // Efeito para carregar as câmeras do dispositivo no login para o uso com QR Code
  React.useEffect(() => {
    if (method !== 'qrcode') return;

    let isMounted = true;
    let fallbackActiveStream: MediaStream | null = null;

    const detectCameras = async () => {
      let stream: MediaStream | null = null;
      try {
        if (isMounted) {
          setCameraError(null);
        }
        if (!navigator.mediaDevices || !navigator.mediaDevices.enumerateDevices) {
          if (isMounted) {
            setCameraError('Este dispositivo ou navegador não suporta detecção de câmeras.');
          }
          return;
        }

        // Tenta pedir permissão curta para garantir que enumerateDevices traga as labels reais das câmeras (Webcam USB, frontal, traseira)
        try {
          stream = await navigator.mediaDevices.getUserMedia({ video: true });
          fallbackActiveStream = stream;
        } catch (e: any) {
          console.warn('[Login Camera Permission]', e);
          if (isMounted) {
            if (e.name === 'NotAllowedError' || e.name === 'PermissionDeniedError') {
              setCameraError('Permissão para câmera negada. Por favor, libere o acesso para poder ler QR Codes.');
            } else {
              setCameraError('Nenhuma câmera funcional foi encontrada ou o dispositivo está ocupado.');
            }
          }
          return;
        }

        if (!isMounted) {
          if (stream) {
            stream.getTracks().forEach(t => t.stop());
          }
          return;
        }

        const devices = await navigator.mediaDevices.enumerateDevices();
        const videoDevices = devices.filter(d => d.kind === 'videoinput');
        
        if (!isMounted) {
          if (stream) {
            stream.getTracks().forEach(t => t.stop());
          }
          return;
        }

        if (videoDevices.length === 0) {
          if (isMounted) {
            setCameraError('Nenhuma câmera de vídeo foi detectada neste computador ou celular.');
          }
        } else {
          if (isMounted) {
            setLoginCameras(videoDevices);
            
            // Reutilizar a última câmera escolhida do localStorage
            const savedId = localStorage.getItem('nexus.qrscanner.preferredCameraId');
            const exists = videoDevices.some(d => d.deviceId === savedId);
            if (savedId && exists) {
              setCameraPreferredId(savedId);
            } else {
              // Escolhe de forma inteligente baseada em mobile/desktop
              const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) || window.innerWidth < 768;
              
              // Heurística traseira para mobile
              const rearDevice = videoDevices.find(d => {
                const label = (d.label || '').toLowerCase();
                return label.includes('back') || label.includes('traseira') || label.includes('rear') || label.includes('environment');
              });
              const defaultId = rearDevice ? rearDevice.deviceId : videoDevices[0].deviceId;
              setCameraPreferredId(defaultId);
              localStorage.setItem('nexus.qrscanner.preferredCameraId', defaultId);
            }
          }
        }

      } catch (err: any) {
        console.error('Erro ao enumerar dispositivos de captura:', err);
        if (isMounted) {
          setCameraError('Ocorreu um erro ao inicializar os sensores de vídeo.');
        }
      } finally {
        // Liberar o stream de permissão imediatamente em qualquer situação de sucesso ou erro!
        if (stream) {
          try {
            stream.getTracks().forEach(t => t.stop());
          } catch (_) {}
          fallbackActiveStream = null;
        }
      }
    };

    detectCameras();

    return () => {
      isMounted = false;
      if (fallbackActiveStream) {
        try {
          fallbackActiveStream.getTracks().forEach(t => t.stop());
        } catch (_) {}
      }
    };
  }, [method]);

  // Security Onboarding
  const [showOnboarding, setShowOnboarding] = React.useState(false);
  const [newLogin, setNewLogin] = React.useState('admin');
  const [newFullName, setNewFullName] = React.useState('');
  const [newPasswordOnboard, setNewPasswordOnboard] = React.useState('');
  const [confirmPasswordOnboard, setConfirmPasswordOnboard] = React.useState('');
  const [showOnboardPass, setShowOnboardPass] = React.useState(false);
  const [errorOnboard, setErrorOnboard] = React.useState('');
  const [successMessage, setSuccessMessage] = React.useState('');
  const [loadingOnboard, setLoadingOnboard] = React.useState(false);

  const firstAccessSetupComplete = useStore((state) => state.firstAccessSetupComplete);
  const hasHydrated = useStore((state) => state.hasHydrated);
  const sales = useStore((state) => (state as any).sales) || [];
  const products = useStore((state) => (state as any).products) || [];

  const masterAdmin = users.find(u => u.id === 'admin' || u.isOwner || u.isMasterAdmin);
  
  const hasCustomAdminPassword = users.some(u => 
    (u.id === 'admin' || u.isMasterAdmin || u.isOwner) && 
    u.password && u.password !== '1234'
  );
  const hasOtherUsers = users.some(u => u.id !== 'admin');
  const hasSalesOrProducts = sales.length > 0 || products.length > 0;
  const previousSetupDetected = hasCustomAdminPassword || hasOtherUsers || hasSalesOrProducts;

  const isDefaultState = !firstAccessSetupComplete && !previousSetupDetected && (masterAdmin ? ((masterAdmin.login === 'admin' || masterAdmin.login === 'ADM') && masterAdmin.password === '1234') : true);

  React.useEffect(() => {
    if (!hasHydrated) return;
    if (isDefaultState) {
      setLogin('admin');
      setPassword('1234');
    } else {
      setLogin('');
      setPassword('');
      setShowOnboarding(false);
    }

    const blockedMsg = sessionStorage.getItem('nfc_blocked_session_message');
    if (blockedMsg) {
      setSuccessMessage(blockedMsg);
      sessionStorage.removeItem('nfc_blocked_session_message');
    }
  }, [isDefaultState, hasHydrated]);

  // Recovery States
  const [recoveryKeyInput, setRecoveryKeyInput] = React.useState('');

  const onScanSuccess = async (decodedText: string) => {
    // Evitar processamento redundante em rajada que causa atrasos na renderização e loop de áudio (Estabilidade)
    const nowTime = Date.now();
    if (nowTime - lastScanProcessedTimeRef.current < 2000) {
      return;
    }
    lastScanProcessedTimeRef.current = nowTime;

    const qrValidation = credentialValidationService.validateCredential(decodedText, 'QR', 'LOGIN');
    if (!qrValidation.success) {
      feedback.error();
      setError(qrValidation.error || 'Credencial inválida ou bloqueada.');
      return;
    }
    setError('');

    const cleanText = (decodedText || '').trim().toUpperCase();
    if (cleanText.startsWith('MST-') || useStore.getState().masterBadges?.some(b => b.codigoMaster === decodedText)) {
      feedback.error();
      setError('Chave Master de Supervisão detectada. Essa chave é usada apenas para liberar ações críticas. Para entrar no sistema, use um Crachá de Acesso ou matrícula.');
      return;
    }

    // Try to find structural info for more precise feedback:
    let userFound = null;
    try {
      if (decodedText && decodedText.trim().startsWith('{')) {
        const parsed = JSON.parse(decodedText);
        if (parsed && parsed.type === 'admin-badge' && parsed.userId) {
          userFound = users.find(u => (u.id === parsed.userId || u.login === 'admin' || u.login === 'ADM') && u.qrCodeToken === parsed.tokenId && u.status === 'ativo');
        }
      }
    } catch (_) {}

    if (!userFound) {
      const badge = badges.find(b => b.codigoCracha === decodedText);
      if (badge) {
        if (badge.status === 'Vinculado' && badge.usuarioVinculado) {
          userFound = users.find(u => u.id === badge.usuarioVinculado && u.status === 'ativo');
        }
      } else {
        userFound = users.find(u => u.qrCodeToken === decodedText && u.status === 'ativo');
      }
    }

    if (userFound) {
      feedback.success();
      const success = loginWithQRCode(decodedText);
      if (success) {
        setScanning(false);
        setError('');
      } else {
        setError('Erro ao realizar o login.');
      }
    } else {
      feedback.error();
      setError('Crachá de Acesso não encontrado ou sem permissão');
      // Keep scanning alive so QRScanner displays the validation error internally
    }
  };

  const handlePasswordLogin = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    // Pre-check if default ADM user is being used during default/unconfigured state
    const masterAdmin = users.find(u => u.id === 'admin' || u.isOwner || u.isMasterAdmin);
    
    const hasCustomAdminPassword = users.some(u => 
      (u.id === 'admin' || u.isMasterAdmin || u.isOwner) && 
      u.password && u.password !== '1234'
    );
    const hasOtherUsers = users.some(u => u.id !== 'admin');
    const hasSalesOrProducts = (useStore.getState() as any).sales?.length > 0 || (useStore.getState() as any).products?.length > 0;
    const previousSetupDetected = hasCustomAdminPassword || hasOtherUsers || hasSalesOrProducts;

    const isDefaultState = !firstAccessSetupComplete && !previousSetupDetected && (masterAdmin ? ((masterAdmin.login === 'admin' || masterAdmin.login === 'ADM') && masterAdmin.password === '1234') : true);

    if ((login === 'admin' || login === 'ADM') && password === '1234' && isDefaultState) {
      setShowOnboarding(true);
      return;
    }

    if (loginLocal(login, password)) {
      // Success is handled by store update
    } else {
      setError('Matrícula ou senha incorretas.');
    }
  };

  const handleOnboardingSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorOnboard('');

    if (!newLogin.trim()) {
      setErrorOnboard('O nome de login não pode ser vazio.');
      return;
    }
    if (!newFullName.trim()) {
      setErrorOnboard('O nome completo de exibição não pode ser vazio.');
      return;
    }
    if (!newPasswordOnboard || !confirmPasswordOnboard) {
      setErrorOnboard('Insira todos os campos de senha.');
      return;
    }
    if (newPasswordOnboard.trim() !== confirmPasswordOnboard.trim()) {
      setErrorOnboard('As senhas não coincidem.');
      return;
    }

    setLoadingOnboard(true);

    try {
      const generateRecoveryKey = () => {
        const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
        const segment = (len: number) => Array.from({ length: len }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
        return `MST-${segment(4)}-${segment(4)}-${segment(4)}`;
      };
      
      const recoveryKey = generateRecoveryKey();

      const masterAdmin = users.find(u => u.id === 'admin' || u.isOwner || u.isMasterAdmin);
      if (!masterAdmin) {
        setErrorOnboard('Conta de administrador principal não encontrada.');
        setLoadingOnboard(false);
        return;
      }

      // Update user details & status (force trim for absolute consistency)
      updateUser(masterAdmin.id, {
        login: newLogin.trim().toLowerCase() || 'admin',
        matricula: newLogin.trim().toLowerCase() || 'admin',
        fullName: newFullName.trim(),
        password: newPasswordOnboard.trim(),
        isAdmin: true,
        isOwner: true,
        isMasterAdmin: true,
        status: 'ativo',
        qrCodeToken: generateUUID()
      });

      // Save recovery master password/key
      setRecoveryMasterPassword(recoveryKey);

      // Create TXT file for recovery
      const now = new Date();
      const txtContent = `${company.name.toUpperCase()}
DOCUMENTO DE SEGURANÇA E RECUPERAÇÃO DE ACESSO CRÍTICO

Data de Emissão: ${format(now, 'dd/MM/yyyy')}
Hora de Emissão: ${format(now, 'HH:mm:ss')}
Usuário Vinculado: ${newFullName.trim()} (Matrícula: ${newLogin.trim().toLowerCase() || 'admin'}, Dono/Administrador Principal)

--------------------------------------------------
AVISO DE SEGURANÇA CRÍTICO E PRIVADO:
Guarde esta chave em local seguro. Esta chave será necessária para recuperar o acesso caso você esqueça sua senha de login. Não publique, envie por e-mail ou compartilhe este código com terceiros sob qualquer hipótese.

--------------------------------------------------
SUA CHAVE MESTRE DE RECUPERAÇÃO EXCLUSIVA:
${recoveryKey}

--------------------------------------------------
Este documento serve como seu backup oficial de segurança e conformidade.
Copyright (C) Nexa ERP - Todos os direitos reservados.
`;

      const blob = new Blob([txtContent], { type: 'text/plain;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.setAttribute("href", url);
      link.setAttribute("download", `recuperacao-senha-mestre-${format(now, 'yyyyMMdd')}.txt`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      feedback.success();
      
      // 1. Mark first access as completed in store
      useStore.getState().setFirstAccessSetupComplete(true);

      // 2. Perform a clean logout to clear the default ADM session fully
      useStore.getState().logoutLocal();

      // 3. Reset form fields to prepare the login form
      setLogin('');
      setPassword('');
      setNewLogin('');
      setNewFullName('');
      setNewPasswordOnboard('');
      setConfirmPasswordOnboard('');
      setError('');
      
      // 4. Close the onboarding screen and set a persistent success message
      setShowOnboarding(false);
      setSuccessMessage('Primeiro acesso concluído com sucesso! Faça login abaixo com suas novas credenciais.');
    } catch (err: any) {
      console.error(err);
      setErrorOnboard('Erro ao configurar primeiro acesso.');
    } finally {
      setLoadingOnboard(false);
    }
  };

  const handleRecoverySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!recoveryKeyInput.trim() || !newPasswordOnboard || !confirmPasswordOnboard) {
      setError('Insira todos os campos para continuar.');
      return;
    }

    if (newPasswordOnboard.trim() !== confirmPasswordOnboard.trim()) {
      setError('As senhas novas não coincidem.');
      return;
    }

    const res = await resetMasterAdminPasswordWithKey(recoveryKeyInput.trim().toUpperCase(), newPasswordOnboard.trim());

    if (res.success) {
      const masterAdmin = users.find(u => u.id === 'admin' || u.isOwner || u.isMasterAdmin);
      if (masterAdmin) {
        const loggedIn = loginLocal(masterAdmin.login, newPasswordOnboard.trim());
        if (loggedIn) {
          feedback.success();
          setRecoveryKeyInput('');
          setNewPasswordOnboard('');
          setConfirmPasswordOnboard('');
          setMethod('password');
        } else {
          setError('Senha redefinida com sucesso, mas falha ao autenticar.');
        }
      }
    } else {
      feedback.error();
      setError(res.error || 'Erro ao realizar a recuperação.');
    }
  };

  if (!hasHydrated) {
    return (
      <div className="min-h-[100dvh] md:min-h-screen bg-[#0A0A0A] flex items-center justify-center p-4 md:p-6 overflow-y-auto md:overflow-hidden relative scroll-smooth pt-8 pb-16 md:py-4">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_50%,_rgba(16,185,129,0.05),_transparent_50%)] pointer-events-none" />
        <div className="w-full max-w-md relative z-10 my-auto">
          <div className="bg-[#121212]/80 backdrop-blur-2xl border border-white/10 rounded-[2.5rem] p-10 shadow-2xl space-y-8">
            <div className="flex flex-col items-center text-center space-y-4">
              <div className="w-16 h-16 bg-emerald-500 rounded-[1.5rem] flex items-center justify-center text-black font-black text-3xl shadow-[0_0_30px_rgba(16,185,129,0.3)] truncate select-none">
                Σ
              </div>
              <div>
                <h1 className="text-2xl font-black text-white uppercase tracking-tighter">Nexa ERP</h1>
                <p className="text-[10px] text-white/30 font-black tracking-[0.3em] uppercase">Autenticação Requerida</p>
              </div>
            </div>
            <div className="flex flex-col items-center justify-center py-12 space-y-4">
              <div className="w-8 h-8 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
              <p className="text-[9px] text-white/30 uppercase font-semibold tracking-[0.15em] animate-pulse">Inicializando Banco Local...</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-[100dvh] md:min-h-screen bg-[#0A0A0A] flex items-center justify-center p-4 md:p-6 overflow-y-auto md:overflow-hidden relative scroll-smooth pt-8 pb-16 md:py-4">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_50%,_rgba(16,185,129,0.05),_transparent_50%)] pointer-events-none" />
      
      {showNetworkConnection && (
        <LocalServerConnection 
          onBack={() => setShowNetworkConnection(false)} 
          onConnected={() => setShowNetworkConnection(false)}
        />
      )}

      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-md relative z-10 my-auto"
      >
        <div className="bg-[#121212]/80 backdrop-blur-2xl border border-white/10 rounded-[2.5rem] p-10 shadow-2xl space-y-8">
          <div className="flex flex-col items-center text-center space-y-4">
            <div className="flex items-center gap-4">
              <div className="w-16 h-16 bg-emerald-500 rounded-[1.5rem] flex items-center justify-center text-black font-black text-3xl shadow-[0_0_30px_rgba(16,185,129,0.3)]">
                Σ
              </div>
              {localNetwork.connectionStatus === 'connected' && (
                <div className="flex flex-col items-start px-4 py-2 bg-emerald-500/10 border border-emerald-500/20 rounded-xl">
                   <div className="flex items-center gap-1.5">
                      <div className="w-1 h-1 bg-emerald-500 rounded-full animate-pulse" />
                      <span className="text-[8px] font-black text-emerald-500 uppercase tracking-widest">Connectado</span>
                   </div>
                   <span className="text-[10px] font-black text-white/40 uppercase">PC: {localNetwork.remoteServer?.ip}</span>
                </div>
              )}
            </div>
            <div>
              <h1 className="text-2xl font-black text-white uppercase tracking-tighter">Nexa ERP</h1>
              <p className="text-[10px] text-white/30 font-black tracking-[0.3em] uppercase">Autenticação Requerida</p>
            </div>
          </div>

           {(!showOnboarding && method !== 'recovery') && (
            <div className="flex p-1 bg-white/5 rounded-2xl gap-1">
              <button 
                onClick={() => { 
                  setMethod('password'); 
                  resetLoginInteractionState(); 
                }}
                className={`flex-1 flex items-center justify-center gap-1.5 py-3 rounded-xl text-[9px] font-black uppercase transition-all ${method === 'password' ? 'bg-white/10 text-white shadow-xl' : 'text-white/20 hover:text-white/40'}`}
              >
                <KeyRound className="w-3 h-3 shrink-0" />
                Senha
              </button>
              <button 
                onClick={() => { 
                  setMethod('qrcode'); 
                  setError(''); 
                  setSuccessMessage(''); 
                  if (process.env.NODE_ENV !== 'production') {
                    console.log('[Login/Diagnostics] Switched to QR Code / NFC Tab.');
                  }
                }}
                className={`flex-1 flex items-center justify-center gap-1.5 py-3 rounded-xl text-[9px] font-black uppercase transition-all ${method === 'qrcode' ? 'bg-white/10 text-white shadow-xl' : 'text-white/20 hover:text-white/40'}`}
              >
                <QrCode className="w-3 h-3 shrink-0" />
                QR Code / NFC
              </button>
            </div>
          )}

          <AnimatePresence mode="wait">
            {showOnboarding ? (
              <motion.form
                key="onboarding-form"
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                onSubmit={handleOnboardingSubmit}
                className="space-y-4 text-left"
              >
                <div className="text-center pb-2 bg-amber-500/5 p-4 rounded-3xl border border-amber-500/15">
                  <div className="w-10 h-10 bg-amber-500/10 border border-amber-500/20 rounded-xl flex items-center justify-center mx-auto mb-2">
                    <KeyRound className="w-5 h-5 text-amber-500" />
                  </div>
                  <h2 className="text-xs font-black text-white uppercase tracking-tight">Primeiro Acesso Seguro</h2>
                  <p className="text-[8px] text-white/50 uppercase font-black tracking-wider leading-relaxed mt-1">
                    Altere as credenciais padrão do administrador para resguardar a integridade corporativa.
                  </p>
                </div>

                <div className="space-y-1.5 align-left">
                  <label className="text-[8px] font-black text-white/30 uppercase tracking-widest px-1">Matrícula do Administrador (Fixa)</label>
                  <div className="relative group">
                    <div className="absolute inset-y-0 left-4 flex items-center pointer-events-none text-emerald-500">
                      <User className="w-4 h-4" />
                    </div>
                    <input 
                      type="text" 
                      value="admin"
                      disabled
                      readOnly
                      className="w-full bg-black/60 border border-emerald-500/20 rounded-2xl pl-12 pr-4 py-3.5 text-emerald-400 focus:outline-none transition-all font-mono font-bold text-xs cursor-not-allowed"
                    />
                  </div>
                </div>

                <div className="space-y-1.5 align-left">
                  <label className="text-[8px] font-black text-white/30 uppercase tracking-widest px-1">Nome Completo do Administrador</label>
                  <div className="relative group">
                    <div className="absolute inset-y-0 left-4 flex items-center pointer-events-none text-white/20 transition-colors group-focus-within:text-emerald-500">
                      <User className="w-4 h-4" />
                    </div>
                    <input 
                      type="text" 
                      value={newFullName}
                      onChange={(e) => setNewFullName(e.target.value)}
                      className="w-full bg-black/40 border border-white/10 rounded-2xl pl-12 pr-4 py-3.5 text-white focus:outline-none focus:border-emerald-500/50 transition-all font-bold placeholder:text-white/10 text-xs"
                      placeholder="Ex: Lucas Ferreira"
                      required
                    />
                  </div>
                </div>

                <div className="space-y-1.5 align-left">
                  <label className="text-[8px] font-black text-white/30 uppercase tracking-widest px-1">Nova Senha</label>
                  <div className="relative group">
                    <div className="absolute inset-y-0 left-4 flex items-center pointer-events-none text-white/20 transition-colors group-focus-within:text-emerald-500">
                      <Lock className="w-4 h-4" />
                    </div>
                    <input 
                      type={showOnboardPass ? "text" : "password"} 
                      value={newPasswordOnboard}
                      onChange={(e) => setNewPasswordOnboard(e.target.value)}
                      className="w-full bg-black/40 border border-white/10 rounded-2xl pl-12 pr-12 py-3.5 text-white focus:outline-none focus:border-emerald-500/50 transition-all font-bold placeholder:text-white/10 text-xs"
                      placeholder="Nova senha administrativa"
                      required
                    />
                    <button
                      type="button"
                      onClick={() => setShowOnboardPass(!showOnboardPass)}
                      className="absolute inset-y-0 right-4 flex items-center text-white/20 hover:text-white/60 transition-colors focus:outline-none"
                    >
                      {showOnboardPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                <div className="space-y-1.5 align-left">
                  <label className="text-[8px] font-black text-white/30 uppercase tracking-widest px-1">Confirmar Nova Senha</label>
                  <div className="relative group">
                    <div className="absolute inset-y-0 left-4 flex items-center pointer-events-none text-white/20 transition-colors group-focus-within:text-emerald-500">
                      <Lock className="w-4 h-4" />
                    </div>
                    <input 
                      type={showOnboardPass ? "text" : "password"} 
                      value={confirmPasswordOnboard}
                      onChange={(e) => setConfirmPasswordOnboard(e.target.value)}
                      className="w-full bg-black/40 border border-white/10 rounded-2xl pl-12 pr-4 py-3.5 text-white focus:outline-none focus:border-emerald-500/50 transition-all font-bold placeholder:text-white/10 text-xs"
                      placeholder="Confirme a nova senha"
                      required
                    />
                  </div>
                </div>

                {errorOnboard && (
                  <p className="text-[9px] text-red-500 font-black uppercase text-center bg-red-500/10 py-2 rounded-lg">{errorOnboard}</p>
                )}

                <button 
                  type="submit"
                  disabled={loadingOnboard}
                  className="w-full py-4 bg-emerald-500 text-black font-black text-[10px] uppercase rounded-2xl hover:bg-emerald-400 disabled:opacity-50 transition-all shadow-lg shadow-emerald-500/10 active:scale-[0.98] flex items-center justify-center gap-2 mt-4"
                >
                  {loadingOnboard ? 'Configurando credenciais...' : 'Confirmar & Baixar PDF Senha Mestre'}
                  <ArrowRight className="w-4 h-4" />
                </button>
              </motion.form>
            ) : method === 'recovery' ? (
              <motion.form 
                key="recovery-form"
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                onSubmit={handleRecoverySubmit}
                className="space-y-4 text-left"
              >
                <div className="text-center pb-2 bg-emerald-500/5 p-4 rounded-3xl border border-emerald-500/15">
                  <div className="w-10 h-10 bg-emerald-500/10 border border-emerald-500/20 rounded-xl flex items-center justify-center mx-auto mb-2">
                    <CheckCircle2 className="w-5 h-5 text-emerald-500" />
                  </div>
                  <h2 className="text-xs font-black text-white uppercase tracking-tight">Recuperar Conta Mestre</h2>
                  <p className="text-[8px] text-white/50 uppercase font-black tracking-wider leading-relaxed mt-1">
                    Insira a Senha Mestre do seu PDF de segurança para redefinir a autenticação do seu Administrador.
                  </p>
                </div>

                <div className="space-y-1.5 align-left">
                  <label className="text-[8px] font-black text-white/30 uppercase tracking-widest px-1">Senha Mestre de Recuperação</label>
                  <div className="relative group">
                    <div className="absolute inset-y-0 left-4 flex items-center pointer-events-none text-white/20 transition-colors group-focus-within:text-emerald-500">
                      <KeyRound className="w-4 h-4" />
                    </div>
                    <input 
                      type="text" 
                      value={recoveryKeyInput}
                      onChange={(e) => setRecoveryKeyInput(e.target.value)}
                      className="w-full bg-black/40 border border-white/10 rounded-2xl pl-12 pr-4 py-3.5 text-white focus:outline-none focus:border-emerald-500/50 transition-all font-mono font-bold placeholder:text-white/15 text-xs text-center uppercase tracking-widest"
                      placeholder="MST-XXXX-XXXX-XXXX"
                      required
                    />
                  </div>
                </div>

                <div className="space-y-1.5 align-left">
                  <label className="text-[8px] font-black text-white/30 uppercase tracking-widest px-1">Nova Senha do Administrador</label>
                  <div className="relative group">
                    <div className="absolute inset-y-0 left-4 flex items-center pointer-events-none text-white/20 transition-colors group-focus-within:text-emerald-500">
                      <Lock className="w-4 h-4" />
                    </div>
                    <input 
                      type={showOnboardPass ? "text" : "password"} 
                      value={newPasswordOnboard}
                      onChange={(e) => setNewPasswordOnboard(e.target.value)}
                      className="w-full bg-black/40 border border-white/10 rounded-2xl pl-12 pr-12 py-3.5 text-white focus:outline-none focus:border-emerald-500/50 transition-all font-bold placeholder:text-white/10 text-xs"
                      placeholder="Nova senha corporativa"
                      required
                    />
                    <button
                      type="button"
                      onClick={() => setShowOnboardPass(!showOnboardPass)}
                      className="absolute inset-y-0 right-4 flex items-center text-white/20 hover:text-white/60 transition-colors focus:outline-none"
                    >
                      {showOnboardPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                <div className="space-y-1.5 align-left">
                  <label className="text-[8px] font-black text-white/30 uppercase tracking-widest px-1">Confirmar Nova Senha</label>
                  <div className="relative group">
                    <div className="absolute inset-y-0 left-4 flex items-center pointer-events-none text-white/20 transition-colors group-focus-within:text-emerald-500">
                      <Lock className="w-4 h-4" />
                    </div>
                    <input 
                      type={showOnboardPass ? "text" : "password"} 
                      value={confirmPasswordOnboard}
                      onChange={(e) => setConfirmPasswordOnboard(e.target.value)}
                      className="w-full bg-black/40 border border-white/10 rounded-2xl pl-12 pr-4 py-3.5 text-white focus:outline-none focus:border-emerald-500/50 transition-all font-bold placeholder:text-white/10 text-xs"
                      placeholder="Confirme a nova senha"
                      required
                    />
                  </div>
                </div>

                {error && (
                  <p className="text-[9px] text-red-500 font-black uppercase text-center bg-red-500/10 py-2 rounded-lg">{error}</p>
                )}

                <button 
                  type="submit"
                  className="w-full py-4 bg-emerald-500 text-black font-black text-[10px] uppercase rounded-2xl hover:bg-emerald-400 transition-all shadow-lg shadow-emerald-500/10 active:scale-[0.98] flex items-center justify-center gap-2 mt-4"
                >
                  Recuperar Acesso & Entrar
                  <ArrowRight className="w-4 h-4" />
                </button>

                <div className="flex justify-center pt-2">
                  <button
                    type="button"
                    onClick={() => { setMethod('password'); setError(''); }}
                    className="text-[9px] text-white/40 hover:text-white/60 font-black uppercase tracking-wider transition-colors"
                  >
                    Voltar para Login normal
                  </button>
                </div>
              </motion.form>
             ) : method === 'password' ? (
              <motion.form 
                key="password-form"
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 10 }}
                onSubmit={handlePasswordLogin}
                className="space-y-4 text-left"
              >
                <div className="space-y-2 align-left">
                  <label className="text-[9px] font-black text-white/20 uppercase tracking-widest px-1">Matrícula de Acesso</label>
                  <div 
                    className="relative group cursor-text"
                    onClick={() => {
                      if (process.env.NODE_ENV !== 'production') {
                        console.log('[Login/Diagnostics] Matrícula container clicked.');
                      }
                      matriculaInputRef.current?.focus();
                    }}
                  >
                    <div className="absolute inset-y-0 left-4 flex items-center pointer-events-none group-focus-within:text-emerald-500 text-white/20 transition-colors">
                      <User className="w-4 h-4" />
                    </div>
                    <input 
                      type="text" 
                      ref={matriculaInputRef}
                      value={login}
                      onChange={(e) => setLogin(e.target.value)}
                      className="w-full bg-black/40 border border-white/10 rounded-2xl pl-12 pr-4 py-4 text-white focus:outline-none focus:border-emerald-500/50 transition-all font-bold placeholder:text-white/5 text-sm"
                      placeholder="Digite sua Matrícula"
                      required
                    />
                  </div>
                </div>

                <div className="space-y-2 align-left">
                  <label className="text-[9px] font-black text-white/20 uppercase tracking-widest px-1">Senha</label>
                  <div 
                    className="relative group cursor-text"
                    onClick={() => {
                      if (process.env.NODE_ENV !== 'production') {
                        console.log('[Login/Diagnostics] Senha container clicked.');
                      }
                      senhaInputRef.current?.focus();
                    }}
                  >
                    <div className="absolute inset-y-0 left-4 flex items-center pointer-events-none group-focus-within:text-emerald-500 text-white/20 transition-colors">
                      <Lock className="w-4 h-4" />
                    </div>
                    <input 
                      type={showPassword ? "text" : "password"} 
                      ref={senhaInputRef}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && handlePasswordLogin(e as any)}
                      className="w-full bg-black/40 border border-white/10 rounded-2xl pl-12 pr-12 py-4 text-white focus:outline-none focus:border-emerald-500/50 transition-all font-bold placeholder:text-white/5 text-sm"
                      placeholder="••••••••"
                      required
                    />
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation(); // Stop from raising parent container focus action
                        setShowPassword(!showPassword);
                      }}
                      className="absolute inset-y-0 right-4 flex items-center text-white/20 hover:text-white/60 transition-colors focus:outline-none"
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                <div className="flex justify-end pt-1">
                  <button
                    type="button"
                    onClick={() => { setMethod('recovery'); setError(''); setErrorOnboard(''); }}
                    className="text-[9px] text-emerald-500 hover:text-emerald-400 font-black uppercase tracking-wider transition-colors"
                  >
                    Esqueci minha senha
                  </button>
                </div>

                {successMessage && (
                  <p className="text-[10px] text-emerald-500 font-black uppercase text-center bg-emerald-500/10 py-3 px-4 rounded-xl my-2 leading-relaxed font-bold">
                    {successMessage}
                  </p>
                )}

                {error && (
                  <p className="text-[10px] text-red-500 font-black uppercase text-center bg-red-500/10 py-2 rounded-lg">{error}</p>
                )}

                <button 
                  type="submit"
                  className="w-full py-4 bg-emerald-500 text-black font-black text-[11px] uppercase rounded-2xl hover:bg-emerald-400 transition-all shadow-lg shadow-emerald-500/10 active:scale-[0.98] flex items-center justify-center gap-2 mt-4"
                >
                  Entrar no Sistema
                  <ArrowRight className="w-4 h-4" />
                </button>
              </motion.form>
            ) : (
              <motion.div 
                key="qrcode-scanner"
                initial={{ opacity: 0, x: 10 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -10 }}
                className="space-y-6"
              >
                <div className="flex flex-col items-center justify-center py-6 space-y-5">
                  <div className="w-20 h-20 bg-white/5 border border-white/10 rounded-3xl flex items-center justify-center shadow-inner relative overflow-hidden group">
                    <QrCode className="w-8 h-8 text-white/20 group-hover:scale-110 transition-transform" />
                  </div>
                  <div className="text-center space-y-2">
                    <h3 className="text-white font-black text-xs uppercase tracking-tight">Crachá ou Tag NFC</h3>
                    <p className="text-[10px] text-emerald-400 font-bold uppercase leading-relaxed max-w-[280px]">
                      Escaneie o QR Code ou aproxime uma tag NFC
                    </p>
                    <p className="text-[8px] text-white/25 uppercase font-medium leading-relaxed max-w-[240px] mx-auto">
                      {(window as any).electron 
                        ? "• Leitor NFC físico monitorando em segundo plano neste computador." 
                        : "• Leitor NFC aguardando aproximação ou entrada via modo teclado."}
                    </p>
                  </div>

                  {/* Configuração/Seleção de câmera adicionado no login para uso com QR Code */}
                  <div className="w-full bg-[#161616]/40 border border-white/5 rounded-2xl p-4 space-y-2.5 text-left">
                    <div className="flex items-center gap-1.5 text-white/85">
                      <Camera className="w-3.5 h-3.5 text-emerald-500" />
                      <span className="text-[9px] font-black uppercase tracking-wider">Câmera de Leitura QR</span>
                    </div>

                    {cameraError ? (
                      <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-xl text-[9px] text-red-400 font-semibold uppercase leading-relaxed text-center">
                        {cameraError}
                      </div>
                    ) : loginCameras.length > 0 ? (
                      <div className="space-y-1">
                        <label className="text-[8px] font-black text-white/30 uppercase tracking-widest pl-0.5">Selecione o Dispositivo</label>
                        <select
                          value={cameraPreferredId}
                          onChange={(e) => {
                            const newId = e.target.value;
                            setCameraPreferredId(newId);
                            localStorage.setItem('nexus.qrscanner.preferredCameraId', newId);
                          }}
                          className="w-full h-[36px] px-3 py-1 bg-black/50 hover:bg-white/[0.04] border border-white/10 rounded-xl text-[10px] font-bold text-white/80 focus:outline-none focus:border-emerald-500 transition-all uppercase tracking-wider text-center cursor-pointer font-sans"
                        >
                          {loginCameras.map((cam, idx) => (
                            <option key={cam.deviceId || idx} value={cam.deviceId} className="bg-[#0c0f0d] text-white text-xs">
                              {cam.label || `Câmera Integrada ${idx + 1}`}
                            </option>
                          ))}
                        </select>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2 text-[9px] text-white/30 uppercase font-black tracking-wider py-1.5 justify-center">
                        <div className="w-3 h-3 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
                        Acessando hardware de vídeo...
                      </div>
                    )}
                  </div>

                  {error && (
                    <p className="text-[10px] text-red-500 font-black uppercase text-center bg-red-500/10 py-2.5 px-4 rounded-xl max-w-sm mt-1 leading-snug w-full">
                      {error}
                    </p>
                  )}

                  <div className="flex flex-col sm:flex-row items-center justify-center gap-3 w-full max-w-sm">
                    <button 
                      onClick={() => { setError(''); setScanning(true); }}
                      disabled={!!cameraError && loginCameras.length === 0}
                      className="w-full px-6 py-4 bg-emerald-500 disabled:bg-white/5 text-black disabled:text-white/20 font-black text-[10px] uppercase rounded-full hover:bg-emerald-400 transition-all shadow-lg active:scale-95 flex items-center justify-center gap-2 cursor-pointer"
                    >
                      <Camera className="w-3.5 h-3.5" />
                      Leitor QR Code
                    </button>
                  </div>

                  {/* Painel Adaptativo de Teste / Simulação NFC física (Essencial para Web Sandbox & Demonstração) */}
                  <div className={cn("w-full bg-[#161616] border border-white/5 rounded-2xl p-4 space-y-3 mt-4 text-left", !environmentService.shouldShowSimulators() && "hidden")}>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Rss className="w-4 h-4 text-emerald-500 animate-pulse" />
                        <span className="text-[9px] font-black uppercase text-white/80 tracking-wider">Simulador NFC do Sistema</span>
                      </div>
                      <span className="text-[8px] px-2 py-0.5 bg-emerald-500/10 text-emerald-400 rounded-full font-bold uppercase tracking-widest">
                        Web Sandbox
                      </span>
                    </div>

                    <p className="text-[8px] text-white/40 uppercase font-black tracking-wider leading-relaxed">
                      Clique em "Aproximar" para simular o toque da tag NFC física associada ao seu leitor.
                    </p>

                    {nfcTags.filter((t: any) => t.status !== 'Excluido').length === 0 ? (
                      <div className="text-center py-2 border border-dashed border-white/5 rounded-xl bg-black/25">
                        <span className="text-[8px] text-white/30 uppercase font-bold">
                          Nenhuma Tag NFC cadastrada no sistema.
                        </span>
                      </div>
                    ) : (
                      <div className="space-y-1.5 max-h-40 overflow-y-auto pr-1 w-full">
                        {nfcTags.filter((t: any) => t.status !== 'Excluido').map((tag: any) => {
                          const linkedUser = users.find((u: any) => u.id === tag.usuarioVinculado);
                          return (
                            <div 
                              key={tag.id}
                              className="flex items-center justify-between p-2 rounded-xl bg-black/40 border border-white/5 hover:border-emerald-500/20 transition-all text-[9.5px]"
                            >
                              <div className="flex flex-col">
                                <span className="font-bold text-white text-[9px] truncate max-w-[140px] uppercase">
                                  {tag.apelido || 'Tag Sem Nome'}
                                </span>
                                <span className="text-[8px] text-white/30 font-mono tracking-wider">
                                  UID: {tag.uid} | {linkedUser ? `User: ${linkedUser.fullName}` : 'Livre'}
                                </span>
                              </div>
                              <button
                                onClick={() => handleNfcAuthenticate(tag.uid)}
                                className="px-2.5 py-1 bg-emerald-500/10 hover:bg-emerald-500 text-emerald-400 hover:text-black rounded-lg text-[8px] font-black uppercase tracking-wider transition-all"
                              >
                                Aproximar
                              </button>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          <div className="pt-6 border-t border-white/5 space-y-4">
            <button 
              onClick={() => setShowNetworkConnection(true)}
              className={cn(
                "w-full py-3 rounded-2xl flex items-center justify-center gap-3 transition-all group",
                localNetwork.connectionStatus === 'connected' ? "bg-emerald-500/5 hover:bg-emerald-500/10 text-emerald-500 border border-emerald-500/10" : "bg-white/5 hover:bg-white/10 text-white/40 border border-white/5"
              )}
            >
              {localNetwork.connectionStatus === 'connected' ? <CheckCircle2 className="w-3.5 h-3.5" /> : <Wifi className="w-3.5 h-3.5" />}
              <span className="text-[9px] font-black uppercase tracking-widest">
                {localNetwork.connectionStatus === 'connected' ? 'Servidor Local Conectado' : 'Conectar Servidor PC'}
              </span>
            </button>
            <div className="flex justify-center">
              <p className="text-[8px] text-white/10 font-bold tracking-[0.4em] uppercase">Security Level 4 :: Local Auth</p>
            </div>
          </div>
        </div>

        {users.length === 0 && (
          <div className="mt-8 p-4 bg-amber-500/10 border border-amber-500/20 rounded-2xl text-center">
            <p className="text-[10px] text-amber-500 font-black uppercase">Nenhum administrador encontrado. Use admin/1234 para o primeiro acesso.</p>
          </div>
        )}
      </motion.div>

      {/* Global Unified QR Code Scanner Integration */}
      <AnimatePresence>
        {scanning && (
          <QRScanner 
            title="Autenticar Crachá de Acesso"
            description="Aponte o QR Code do seu crachá de acesso"
            onScan={onScanSuccess}
            onClose={resetLoginInteractionState}
            isLogin={true}
            validationError={error}
            onClearValidationError={() => setError('')}
            mode="qr"
          />
        )}
      </AnimatePresence>
    </div>
  );
}
