import React from 'react';
import { X, ExternalLink, ShieldAlert, Laptop } from 'lucide-react';

interface IframeDownloadWarningModalProps {
  isOpen: boolean;
  onClose: () => void;
  fileName?: string;
}

export function IframeDownloadWarningModal({ isOpen, onClose, fileName }: IframeDownloadWarningModalProps) {
  if (!isOpen) return null;

  return (
    <div id="iframe-download-warning-modal animate-in fade-in duration-200" className="fixed inset-0 z-50 bg-black/85 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-[#0c0c0c] border border-white/10 rounded-2xl w-full max-w-md p-6 relative shadow-2xl flex flex-col gap-4 animate-in zoom-in-95 duration-200">
        
        {/* Close Button */}
        <button
          onClick={onClose}
          type="button"
          className="absolute top-4 right-4 p-1 rounded-xl text-zinc-500 hover:text-white hover:bg-white/5 transition-all cursor-pointer"
        >
          <X className="w-4 h-4" />
        </button>

        {/* Dynamic Graphic Header */}
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-500 shrink-0">
            <ShieldAlert className="w-5 h-5 animate-pulse" />
          </div>
          <div className="flex flex-col gap-0.5">
            <h4 className="text-[10px] font-black text-amber-400 uppercase tracking-[0.2em]">Aviso Sandbox de Segurança</h4>
            <span className="text-[12px] font-black text-white uppercase tracking-tight">Bloqueio de Download Detectado</span>
          </div>
        </div>

        {/* Split separator and details */}
        <div className="border-t border-b border-white/5 py-4 my-1 space-y-3 font-sans normal-case text-zinc-350">
          <p className="text-[11.5px] leading-relaxed font-sans text-justify">
            Você solicitou a geração de um PDF do documento {fileName ? <span className="font-mono text-white bg-white/5 px-1.5 py-0.5 rounded border border-white/5 select-all">{fileName}</span> : 'canônico'}. 
          </p>
          <p className="text-[11.5px] leading-relaxed font-sans text-justify">
            Como esta aplicação está rodando em modo sandbox de simulação (dentro de um <strong className="text-zinc-200">IFrame incorporado</strong> no painel de edição do AI Studio), os navegadores de internet modernos bloqueiam por padrão o download direto de arquivos <code className="text-zinc-300 font-mono">blob:</code> locais por privacidade. O bloqueio resulta na abertura de uma <strong className="text-amber-400">tela (aba) branca no navegador</strong>.
          </p>
          <div className="bg-zinc-950 p-3.5 border border-white/5 rounded-xl space-y-1.5">
            <span className="text-[8px] font-black text-emerald-400 uppercase tracking-widest block flex items-center gap-1.5">
              <Laptop className="w-3.5 h-3.5" /> Como prosseguir com sucesso:
            </span>
            <p className="text-[11px] text-zinc-400 leading-normal leading-relaxed text-justify">
              Abra a aplicação em uma <strong className="text-white">nova aba inteira</strong> do seu navegador usando o botão de redirecionamento ou acessando a URL de Desenvolvimento visível. Lá, seu navegador permitirá o download de qualquer PDF instantaneamente de forma segura!
            </p>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="flex items-center justify-end gap-2.5">
          <button
            type="button"
            onClick={onClose}
            className="h-8 px-4 bg-zinc-900 border border-white/5 hover:bg-zinc-805 text-zinc-400 hover:text-white text-[9px] font-black uppercase tracking-wider rounded-xl transition-all cursor-pointer"
          >
            Fechar
          </button>
          
          <button
            type="button"
            onClick={() => {
              onClose();
              // Try to offer a window open guidance or just open in parent tab if allowed
              window.open(window.location.href, '_blank');
            }}
            className="h-8 px-4 bg-emerald-500 hover:bg-emerald-400 text-black text-[9px] font-black uppercase tracking-wider rounded-xl transition-all cursor-pointer flex items-center gap-1.5"
          >
            <ExternalLink className="w-3.5 h-3.5" />
            Abrir em Nova Aba
          </button>
        </div>

      </div>
    </div>
  );
}
