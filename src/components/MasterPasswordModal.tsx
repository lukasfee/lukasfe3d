import React from 'react';
import { ShieldCheck, XCircle, ChevronRight, Lock, Camera } from 'lucide-react';
import { credentialValidationService } from '../services/credentialValidationService';
import { nfcServiceFactory } from '../services/NFCServiceFactory';
import { useStore } from '../store';
import { cn } from '../lib/utils';
import QRScanner from './QRScanner';
import { AnimatePresence, motion } from 'motion/react';

interface MasterPasswordModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title?: string;
  description?: string;
  autoStartScanner?: boolean;
}

export default function MasterPasswordModal({ 
  isOpen, 
  onClose, 
  onConfirm, 
  title = 'Chave Master de Supervisão', 
  description = 'Esta é uma operação crítica e requer a Chave Master de Supervisão para prosseguir.',
  autoStartScanner = false
}: MasterPasswordModalProps) {
  const [password, setPassword] = React.useState('');
  const [errorMsg, setErrorMsg] = React.useState<string | null>(null);
  const [showScanner, setShowScanner] = React.useState(autoStartScanner);

  const verifyMasterCredential = useStore((state) => state.verifyMasterCredential);
  const currentUser = useStore((state) => state.currentUser);
  const nfcTags = useStore((state) => state.nfcTags);

  const lastNfcUid = React.useRef<string>('');
  const lastNfcTime = React.useRef<number>(0);
  const keyBuffer = React.useRef<string>('');
  const lastKeyPress = React.useRef<number>(0);

  const handleNFCAuth = (uid: string) => {
    const cleanUid = (uid || '').trim().toUpperCase();
    if (!cleanUid) return;

    const now = Date.now();
    if (cleanUid === lastNfcUid.current && (now - lastNfcTime.current < 2000)) {
      console.log(`[MasterModal/NFC] Anti-loop frontal ativado para UID: ${cleanUid}`);
      return;
    }
    
    lastNfcUid.current = cleanUid;
    lastNfcTime.current = now;

    const validationCheck = credentialValidationService.validateCredential(cleanUid, 'NFC', 'MASTER_AUTH');
    if (!validationCheck.success) {
      setErrorMsg(validationCheck.error || 'NFC inválido ou bloqueado.');
      return;
    }
    console.log(`[MasterModal/NFC] Analisando UID aproximado: ${cleanUid}`);
    const verifyFn = useStore.getState().verifyMasterNFC;
    const res = verifyFn(cleanUid, title);

    if (res.success) {
      setErrorMsg(null);
      setPassword('');
      onConfirm();
    } else {
      setErrorMsg(res.error || 'Esta tag NFC não possui autorização Master.');
    }
  };

  React.useEffect(() => {
    if (!isOpen) return;

    const service = nfcServiceFactory.getService();
    console.log(`[MasterModal/NFC] Setting up scanning subscription via: ${service.getPlatformName()}`);

    service.startScanning(
      (uid: string) => {
        handleNFCAuth(uid);
      },
      (errMessage: string) => {
        console.warn(`[MasterModal/NFC Hardware Failure]: ${errMessage}`);
      }
    );

    return () => {
      service.stopScanning();
    };
  }, [isOpen]);

  React.useEffect(() => {
    if (isOpen && currentUser) {
      const isAdm = currentUser.isAdmin || currentUser.isOwner || currentUser.isMasterAdmin || currentUser.login === 'admin';
      if (isAdm) {
        onConfirm();
      }
    }
  }, [isOpen, currentUser, onConfirm]);

  const handleConfirm = (manualPassword?: string) => {
    const passToVerify = manualPassword || password;
    const res = verifyMasterCredential(passToVerify);
    if (res.success) {
      setErrorMsg(null);
      setPassword('');
      onConfirm();
    } else {
      setErrorMsg(res.error || 'Chave Master Incorreta!');
      setPassword('');
    }
  };

  const handleKeyPress = (num: string) => {
    setErrorMsg(null);
    if (password.length < 8) {
      setPassword(prev => prev + num);
    }
  };

  const handleBackspace = () => {
    setPassword(prev => prev.slice(0, -1));
  };

  React.useEffect(() => {
    if (isOpen) {
      setPassword('');
      setErrorMsg(null);
      setShowScanner(autoStartScanner);

      const handleKeyDown = (e: KeyboardEvent) => {
        if (showScanner) return;

        const now = Date.now();
        if (now - lastKeyPress.current > 100) {
          keyBuffer.current = '';
        }
        lastKeyPress.current = now;

        if (e.key >= '0' && e.key <= '9') {
          handleKeyPress(e.key);
          keyBuffer.current += e.key;
        } else if (e.key === 'Backspace') {
          handleBackspace();
          keyBuffer.current = '';
        } else if (e.key === 'Enter') {
          const bufferVal = keyBuffer.current.trim().toUpperCase();
          if (bufferVal && bufferVal.length >= 8 && /^[0-9A-F:]+$/.test(bufferVal)) {
            e.preventDefault();
            keyBuffer.current = '';
            handleNFCAuth(bufferVal);
            return;
          }

          if (password.length > 0) {
            handleConfirm();
          }
        } else if (e.key === 'Escape') {
          onClose();
        } else if (e.key.length === 1) {
          keyBuffer.current += e.key;
        }
      };

      window.addEventListener('keydown', handleKeyDown);
      return () => window.removeEventListener('keydown', handleKeyDown);
    }
  }, [isOpen, autoStartScanner, password, showScanner]);

  if (!isOpen) return null;

  if (showScanner) {
    return (
      <AnimatePresence>
        <QRScanner 
          mode="qr"
          onScan={async (val) => {
            const res = verifyMasterCredential(val);
            if (res.success) {
              handleConfirm(val);
              setShowScanner(false);
            } else {
              setErrorMsg(res.error || 'Chave Master Incorreta!');
            }
          }}
          onClose={() => {
            if (autoStartScanner) onClose();
            else setShowScanner(false);
          }}
          title="Validar Chave Master"
          description="Escanear QR Code para autorização master"
        />
      </AnimatePresence>
    );
  }

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/80 backdrop-blur-md" onClick={onClose} />
      
      <div className="relative w-full max-w-sm bg-[#121212] border border-white/10 rounded-[2.5rem] shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
        <div className="p-8 text-center space-y-6">
          <div className="flex flex-col items-center gap-3">
            <div className={cn(
              "w-16 h-16 rounded-2xl flex items-center justify-center transition-all duration-300",
              errorMsg ? "bg-red-500/20 text-red-500" : "bg-emerald-500/10 text-emerald-500"
            )}>
              <ShieldCheck className={cn("w-8 h-8", errorMsg && "animate-bounce")} />
            </div>
            <div>
              <h3 className="text-xl font-black text-white uppercase tracking-tight">{title}</h3>
              <p className="text-[10px] text-white/30 font-black uppercase tracking-[0.2em] mt-1 italic">{description}</p>
            </div>
          </div>

          <div className="space-y-4">
            <div className="flex justify-center gap-3">
              {[...Array(6)].map((_, i) => (
                <div 
                  key={i}
                  className={cn(
                    "w-3 h-3 rounded-full border transition-all duration-300",
                    password.length > i 
                      ? "bg-emerald-500 border-emerald-500 scale-110 shadow-[0_0_8px_rgba(16,185,129,0.5)]" 
                      : "bg-transparent border-white/10",
                    errorMsg && "border-red-500"
                  )}
                />
              ))}
            </div>

            {errorMsg && (
              <p className="text-[9px] font-bold text-red-500 uppercase tracking-wider bg-red-500/15 p-3 rounded-2xl border border-red-500/20 leading-relaxed max-w-sm mx-auto animate-pulse">
                {errorMsg}
              </p>
            )}

            {!autoStartScanner && (
              <div className="flex gap-2 w-full justify-center">
                <button 
                  onClick={() => {
                    setShowScanner(true);
                  }}
                  className="w-full py-3.5 bg-zinc-900 hover:bg-zinc-800 text-white/80 hover:text-white rounded-xl text-[10px] font-black uppercase tracking-wider transition-all border border-white/5 flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <Camera className="w-3.5 h-3.5 text-emerald-400" /> Abrir Leitor QR Master
                </button>
              </div>
            )}
          </div>

          <div className="grid grid-cols-3 gap-3 p-2">
            {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((num) => (
              <button
                key={num}
                onClick={() => handleKeyPress(num.toString())}
                className="h-14 bg-white/5 hover:bg-white/10 text-white text-lg font-black rounded-2xl transition-all active:scale-90 flex items-center justify-center"
              >
                {num}
              </button>
            ))}
            <button
              onClick={() => setPassword('')}
              className="h-14 text-[9px] font-black text-white/20 uppercase hover:text-white transition-colors"
            >
              Limpar
            </button>
            <button
              onClick={() => handleKeyPress('0')}
              className="h-14 bg-white/5 hover:bg-white/10 text-white text-lg font-black rounded-2xl transition-all active:scale-90 flex items-center justify-center"
            >
              0
            </button>
            <button
              onClick={handleBackspace}
              className="h-14 text-[9px] font-black text-white/20 uppercase hover:text-white transition-colors"
            >
              Corrigir
            </button>
          </div>

          <div className="flex gap-3 pt-2">
            <button
              onClick={onClose}
              className="flex-1 py-4 bg-white/5 hover:bg-white/10 text-white/40 font-black text-[10px] uppercase tracking-widest rounded-2xl transition-all border border-white/5"
            >
              Cancelar
            </button>
            <button
              onClick={handleConfirm}
              disabled={password.length === 0}
              className="flex-1 py-4 bg-emerald-500 hover:bg-emerald-600 disabled:opacity-50 disabled:grayscale text-black font-black text-[10px] uppercase tracking-widest rounded-2xl transition-all shadow-lg shadow-emerald-500/20 flex items-center justify-center gap-2 group"
            >
              Autorizar
              <ChevronRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
            </button>
          </div>

          {/* Painel Adaptativo de Teste / Simulação NFC Master (Essencial para Web Sandbox) */}
          {nfcTags.filter((t: any) => t.tipoCredencial === 'MASTER' && t.status !== 'Excluido').length > 0 && (
            <div className="mx-8 mb-6 p-3.5 bg-black/40 border border-white/5 rounded-3xl space-y-2 text-left">
              <div className="flex items-center justify-between">
                <span className="text-[8px] font-black uppercase text-emerald-400 tracking-wider">Aproximar Tag NFC Master</span>
                <span className="text-[7px] px-1.5 py-0.5 bg-emerald-500/10 text-emerald-400 rounded-full font-bold uppercase tracking-widest font-mono">Sandbox</span>
              </div>
              <p className="text-[7.5px] text-white/30 uppercase font-bold leading-normal">
                Clique para simular a aproximação de uma tag física Master de supervisão configurada:
              </p>
              <div className="flex flex-col gap-1 max-h-32 overflow-y-auto pr-1">
                {nfcTags.filter((t: any) => t.tipoCredencial === 'MASTER' && t.status !== 'Excluido').map((tag: any) => {
                  const linkedSupervisor = useStore.getState().users.find((u: any) => u.id === tag.usuarioVinculado);
                  return (
                    <button
                      key={tag.id}
                      onClick={() => handleNFCAuth(tag.uid)}
                      className="px-2.5 py-1.5 bg-white/5 hover:bg-emerald-500 hover:text-black rounded-xl text-[8.5px] font-black uppercase text-white/80 tracking-wide transition-all truncate text-left flex justify-between items-center"
                    >
                      <span className="truncate">{tag.tagLabel || linkedSupervisor?.fullName || tag.uid}</span>
                      <span className="text-[7px] font-mono text-white/40">UID: {tag.uid}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>
        
        <div className="h-1 bg-gradient-to-r from-transparent via-emerald-500/20 to-transparent" />
      </div>
    </div>
  );
}
