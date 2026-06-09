import React, { useState, useEffect, useRef } from 'react';
import { QrCode, XCircle, ShieldCheck, AlertCircle } from 'lucide-react';
import { Html5Qrcode, Html5QrcodeSupportedFormats, Html5QrcodeScannerState } from 'html5-qrcode';
import { useStore, User } from '../store';
import { cn } from '../lib/utils';
import { feedback } from '../lib/feedback';
import { startScannerWithFallback } from '../utils/qrHelper';

interface OperationalConfirmationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (user: User) => void;
  title?: string;
  description?: string;
  requiredPermission?: string;
}

export default function OperationalConfirmationModal({
  isOpen,
  onClose,
  onConfirm,
  title = 'Confirmação Operacional',
  description = 'Aproxime seu QR Code para autorizar esta ação.',
  requiredPermission
}: OperationalConfirmationModalProps) {
  const [useScanner, setUseScanner] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const users = useStore((state) => state.users);
  const badges = useStore((state) => state.badges) || [];
  const scannerInstanceRef = useRef<Html5Qrcode | null>(null);
  const transitionRef = useRef<boolean>(false);
  const lastScanRef = useRef<{ text: string, time: number } | null>(null);

  useEffect(() => {
    let mounted = true;

    if (isOpen && useScanner) {
      setError(null);
      
      const startScanner = async () => {
        // Delay for DOM
        await new Promise(resolve => setTimeout(resolve, 400));
        if (!mounted) return;
        if (transitionRef.current) return;

        try {
          const scanner = new Html5Qrcode('qr-reader-modal', { 
            verbose: false, 
            formatsToSupport: [Html5QrcodeSupportedFormats.QR_CODE] 
          });
          scannerInstanceRef.current = scanner;
          transitionRef.current = true;

          await startScannerWithFallback(
            scanner,
            (decodedText) => {
              if (!mounted) return;
              
              const now = Date.now();
              if (lastScanRef.current && lastScanRef.current.text === decodedText && now - lastScanRef.current.time < 1500) {
                return; // Prevent duplicate reads
              }
              lastScanRef.current = { text: decodedText, time: now };

              let user = null;
              try {
                if (decodedText && decodedText.trim().startsWith('{')) {
                  const parsed = JSON.parse(decodedText);
                  if (parsed && parsed.type === 'admin-badge' && parsed.userId) {
                    user = users.find(u => u.id === parsed.userId && u.qrCodeToken === parsed.tokenId);
                  }
                }
              } catch (_) {}

              if (!user) {
                // Procura primeiro por crachá vinculado ativo
                const badge = badges.find(b => b.codigoCracha === decodedText);
                if (badge) {
                  if (badge.status === 'Vinculado' && badge.usuarioVinculado) {
                    user = users.find(u => u.id === badge.usuarioVinculado);
                  } else {
                    feedback.error();
                    setError('Crachá inativo ou bloqueado.');
                    return;
                  }
                } else {
                  // Fallback para token anterior
                  user = users.find(u => u.qrCodeToken === decodedText);
                }
              }

              if (user) {
                if (user.status !== 'ativo') {
                  feedback.error();
                  setError('Usuário inativo');
                  return;
                }
                feedback.success();
                onConfirm(user);
              } else {
                feedback.error();
                setError('QR Code inválido ou não reconhecido.');
              }
            },
            () => {},
            { fps: 30 }
          );

          // Continuous focus
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
            console.warn("Continuous focus not explicitly configured on this device:", e);
          }

          transitionRef.current = false;
        } catch (err) {
          console.error(err);
          transitionRef.current = false;
          setError('Erro ao acessar a câmera. Verifique as permissões.');
          setUseScanner(false);
        }
      };

      startScanner();
    }

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
  }, [isOpen, useScanner, users, onConfirm]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[10000] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/90 backdrop-blur-md" onClick={onClose} />
      
      <div className="relative w-full max-w-sm bg-[#121212] border border-white/10 rounded-[2.5rem] shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
        <div className="p-8 text-center space-y-6">
          <div className="flex flex-col items-center gap-3">
            <div className="w-16 h-16 bg-amber-500/10 rounded-2xl flex items-center justify-center text-amber-500">
              <QrCode className="w-8 h-8" />
            </div>
            <div>
              <h3 className="text-xl font-black text-white uppercase tracking-tight">{title}</h3>
              <p className="text-[10px] text-white/30 font-black uppercase tracking-[0.2em] mt-1 italic">{description}</p>
            </div>
          </div>

          <div className="space-y-4">
            {useScanner ? (
              <div className="relative aspect-square w-64 mx-auto bg-black/40 rounded-3xl overflow-hidden border border-white/5 shadow-inner">
                <div id="qr-reader-modal" className="w-full h-full" />
                <div className="absolute inset-0 pointer-events-none">
                  <div className="absolute inset-0 border-[40px] border-black/40" />
                  <div className="absolute top-[40px] left-[40px] right-[40px] bottom-[40px] border border-amber-500/50 rounded-xl" />
                  <div className="absolute top-[45px] left-1/2 -translate-x-1/2 w-1/2 h-0.5 bg-amber-500/50 animate-scan shadow-[0_0_15px_rgba(245,158,11,0.5)]" />
                </div>
              </div>
            ) : (
              <div className="p-8 bg-red-500/10 rounded-2xl border border-red-500/20 text-center">
                <AlertCircle className="w-8 h-8 text-red-500 mx-auto mb-3" />
                <p className="text-[10px] font-black text-red-500 uppercase tracking-widest leading-relaxed">
                  Câmera indisponível.<br />Autorize via Senha Master no PDV.
                </p>
              </div>
            )}

            {error && (
              <p className="text-[10px] font-black text-red-500 uppercase tracking-widest animate-pulse">
                {error}
              </p>
            )}
          </div>

          <button
            onClick={onClose}
            className="w-full py-4 bg-white/5 hover:bg-white/10 text-white/40 font-black text-[10px] uppercase tracking-widest rounded-2xl transition-all border border-white/5"
          >
            Cancelar
          </button>
        </div>
        
        <div className="h-1 bg-gradient-to-r from-transparent via-amber-500/20 to-transparent" />
      </div>
    </div>
  );
}
