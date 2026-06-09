import React, { useState } from 'react';
import { X, Download, ExternalLink, FileText, Check, Copy } from 'lucide-react';
import { feedback } from '../lib/feedback';

interface PdfViewerModalProps {
  isOpen: boolean;
  onClose: () => void;
  pdfUrl: string | null;
  documentName: string;
  pdfBlob?: Blob | null;
}

export function PdfViewerModal({ isOpen, onClose, pdfUrl, documentName, pdfBlob }: PdfViewerModalProps) {
  const [copied, setCopied] = useState(false);

  if (!isOpen) return null;

  const handleCopyLink = () => {
    if (!pdfUrl) return;
    navigator.clipboard.writeText(pdfUrl);
    setCopied(true);
    feedback.success();
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownload = () => {
    if (!pdfUrl) return;
    const link = document.createElement('a');
    link.href = pdfUrl;
    link.download = `${documentName.toLowerCase().replace(/\s+/g, '_')}_gerado.pdf`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    feedback.success();
  };

  const handleOpenNewTab = () => {
    if (!pdfUrl) return;
    window.open(pdfUrl, '_blank');
  };

  const insideIframe = typeof window !== 'undefined' && window.self !== window.top;

  return (
    <div 
      id="pdf-viewer-modal-backdrop"
      className="fixed inset-0 z-50 bg-black/90 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in duration-250"
    >
      <div 
        id="pdf-viewer-modal-container"
        className="bg-[#0a0a0a] border border-white/10 rounded-[2rem] w-full max-w-4xl h-[85vh] flex flex-col overflow-hidden shadow-2xl relative animate-in zoom-in-95 duration-200"
      >
        {/* Header */}
        <div className="bg-[#121212] border-b border-white/5 px-6 py-4 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
              <FileText className="w-5 h-5" />
            </div>
            <div>
              <span className="text-[8px] font-black text-emerald-400 uppercase tracking-widest block">PDF Canônico Gerado</span>
              <h3 className="text-sm font-black text-white uppercase tracking-tight">{documentName}</h3>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleCopyLink}
              title="Copiar Link Temporário do PDF"
              className="p-2 bg-zinc-900 border border-white/5 hover:bg-zinc-800 text-zinc-400 hover:text-white rounded-xl transition-all cursor-pointer"
            >
              {copied ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
            </button>
            <button
              onClick={handleOpenNewTab}
              title="Abrir em Nova Aba"
              className="p-2 bg-zinc-900 border border-white/5 hover:bg-zinc-800 text-zinc-400 hover:text-white rounded-xl transition-all cursor-pointer"
            >
              <ExternalLink className="w-4 h-4" />
            </button>
            <button
              onClick={handleDownload}
              title="Baixar PDF do Documento"
              className="px-4 py-2 bg-emerald-500 hover:bg-emerald-400 text-black text-[10px] font-black uppercase tracking-wider rounded-xl transition-all flex items-center gap-1.5 cursor-pointer"
            >
              <Download className="w-4 h-4" />
              Baixar PDF
            </button>
            <div className="w-px h-5 bg-white/5 mx-1" />
            <button
              onClick={onClose}
              className="p-2 bg-zinc-900 border border-white/5 hover:bg-zinc-800 text-zinc-400 hover:text-white rounded-xl transition-all cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Content View Area */}
        <div className="flex-1 bg-zinc-950 p-6 flex flex-col items-center justify-center relative overflow-hidden">
          {insideIframe ? (
            <div className="max-w-md text-center p-8 bg-zinc-900/40 border border-white/5 rounded-3xl space-y-4 animate-in fade-in duration-300">
              <div className="w-12 h-12 rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-500 mx-auto">
                <FileText className="w-6 h-6 animate-pulse" />
              </div>
              <div className="space-y-1">
                <h4 className="text-[12px] font-black text-white uppercase tracking-wider">Modo de Visualização Direta</h4>
                <p className="text-[11px] text-zinc-400 leading-relaxed font-sans">
                  Como a aplicação está carregada dentro de um Iframe do AI Studio, o leitor de PDF embutido do navegador pode ser restrito ou apresentar tela branca por motivos de segurança.
                </p>
              </div>
              <div className="flex flex-col sm:flex-row justify-center gap-2 pt-2">
                <button
                  type="button"
                  onClick={handleDownload}
                  className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 hover:text-white text-zinc-300 text-[9.5px] font-black uppercase tracking-wider rounded-xl transition-all cursor-pointer flex items-center justify-center gap-1.5"
                >
                  <Download className="w-3.5 h-3.5 text-emerald-400" />
                  Salvar no Computador
                </button>
                <button
                  type="button"
                  onClick={handleOpenNewTab}
                  className="px-4 py-2 bg-emerald-500 hover:bg-emerald-400 text-black text-[9.5px] font-black uppercase tracking-wider rounded-xl transition-all cursor-pointer flex items-center justify-center gap-1.5"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  Visualizar em Nova Aba
                </button>
              </div>
            </div>
          ) : (
            pdfUrl ? (
              <div className="w-full h-full rounded-2xl border border-white/5 overflow-hidden bg-white relative">
                <object
                  data={pdfUrl}
                  type="application/pdf"
                  className="w-full h-full"
                >
                  <iframe
                    src={pdfUrl}
                    title="Visualização do PDF"
                    className="w-full h-full border-none"
                  />
                </object>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-2">
                <div className="w-8 h-8 border-2 border-emerald-400 border-t-transparent rounded-full animate-spin" />
                <span className="text-[10px] font-black text-zinc-500 uppercase tracking-widest font-sans">Carregando visualizador...</span>
              </div>
            )
          )}
        </div>

        {/* Footer */}
        <div className="bg-[#121212] border-t border-white/5 px-6 py-3.5 flex items-center justify-between shrink-0 text-[10px] text-zinc-500 font-sans">
          <span>Este PDF é gerado a partir de HTML Canônico e cumpre as normas de conformidade física.</span>
          <span className="font-mono text-[9px] text-emerald-400 font-black">CANONICAL PDF ENGINE v1.2</span>
        </div>
      </div>
    </div>
  );
}
