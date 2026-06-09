import React, { useState, useEffect, useRef } from 'react';
import { 
  ZoomIn, 
  ZoomOut, 
  Grid3X3, 
  FileText, 
  Eye, 
  RefreshCw,
  Info
} from 'lucide-react';
import { resolveDocumentGeometry, resolveCanonicalDocumentConfig } from '../../services/printEngine/documentSizes';
import { buildCanonicalHtml } from '../../services/pdfEngine/canonicalHtmlBuilder';
import { useStore } from '../../store';

/**
 * MM to Pixel conversion factor (at 96 DPI: 1 inch = 25.4mm = 96px => 1mm ≈ 3.7795px)
 */
const MM_TO_PX = 3.7795275591;

export interface CanonicalDocumentPreviewProps {
  documentType: 'reciboTermico' | 'cupomPedido' | 'etiqueta' | 'etiquetaLote' | 'mensagemCliente';
  payload: any;
  paperSize: string;
  theme?: string;
  themeId?: string;
  customFields?: any;
  initialZoom?: number | 'fit';
  initialShowGuides?: boolean;
}

export const CanonicalDocumentPreview: React.FC<CanonicalDocumentPreviewProps> = ({
  documentType,
  payload,
  paperSize,
  theme = 'classic',
  themeId,
  customFields = {} as any,
  initialZoom = 'fit',
  initialShowGuides = true
}) => {
  const [zoom, setZoom] = useState<number>(1);
  const [zoomMode, setZoomMode] = useState<'fixed' | 'fit'>(initialZoom === 'fit' ? 'fit' : 'fixed');
  const [showGuides, setShowGuides] = useState<boolean>(initialShowGuides);
  const [html, setHtml] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(true);
  const [dynamicHeightMm, setDynamicHeightMm] = useState<number>(297);

  const containerRef = useRef<HTMLDivElement>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  const company = useStore((state) => state.company);
  const imageThemes = useStore((state) => (state as any).imageThemes) || [];

  // Resolve config papel canônico inicial using our unified configuration resolver
  const canonicalConfig = resolveCanonicalDocumentConfig(documentType);
  const geometry = canonicalConfig.geometry;

  // Utilize canonical values while allowing unsaved properties overrides in active settings sliders
  const finalTheme = theme || canonicalConfig.theme;
  const finalThemeId = themeId || canonicalConfig.themeId;
  const finalCustomFields = { ...canonicalConfig.customFields, ...customFields };

  // Forced A6 page envelope dimensions for on-screen preview container (removes scrolling/flickering)
  const previewWidthMm = 105;
  const previewHeightMm = 148;

  const widthMm = 105;
  const isDynamicHeight = false; // Always force sheet/fixed height mode for on-screen A6 visual container

  // Compile the visual template into canonical HTML when dependencies change
  useEffect(() => {
    let active = true;
    async function renderTemplate() {
      setLoading(true);
      try {
        const watermarkThemeObj = imageThemes.find((t: any) => t.id === finalThemeId);
        
        const renderedHtml = await buildCanonicalHtml({
          documentId: documentType,
          payload,
          paperSize: 'A6', // FORCED to A6 for visual preview (instead of the physical paperSize prop!)
          theme: finalTheme,
          themeId: finalThemeId,
          customFields: finalCustomFields,
          company,
          watermarkTheme: watermarkThemeObj,
          imageThemes
        });

        if (active) {
          setHtml(renderedHtml);
        }
      } catch (err) {
        console.error('[CanonicalDocumentPreview] Erro na compilação do HTML canônico:', err);
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    }
    renderTemplate();
    return () => {
      active = false;
    };
  }, [documentType, payload, paperSize, finalTheme, finalThemeId, finalCustomFields, company, imageThemes]);

  // Handle auto-fit zoom calculation
  useEffect(() => {
    if (zoomMode === 'fit' && containerRef.current) {
      const parentWidth = containerRef.current.clientWidth || 400;
      const paperWidthPx = previewWidthMm * MM_TO_PX;
      // Subtract margins/paddings from the parent boundaries
      const paddingPixels = window.innerWidth < 768 ? 20 : 48;
      const autoZoom = Math.min(1.5, Math.max(0.3, (parentWidth - paddingPixels) / paperWidthPx));
      setZoom(Number(autoZoom.toFixed(2)));
    }
  }, [previewWidthMm, zoomMode, loading, html]);

  // Adjust zoom manually
  const handleZoomIn = () => {
    setZoomMode('fixed');
    setZoom(prev => Math.min(2.5, +(prev + 0.1).toFixed(2)));
  };

  const handleZoomOut = () => {
    setZoomMode('fixed');
    setZoom(prev => Math.max(0.3, +(prev - 0.1).toFixed(2)));
  };

  const handleZoomSet = (value: number | 'fit') => {
    if (value === 'fit') {
      setZoomMode('fit');
    } else {
      setZoomMode('fixed');
      setZoom(value);
    }
  };

  // Adjust container size on load of the iframe content to reflect thermal roll dynamic height and enforce adaptive nesting scale
  const handleIframeLoad = () => {
    if (!iframeRef.current) return;
    try {
      const doc = iframeRef.current.contentDocument || iframeRef.current.contentWindow?.document;
      if (doc) {
        // Enforce solid white BG, clear margin, and hide scrollbars to avoid nested clips
        doc.body.style.backgroundColor = '#ffffff';
        doc.body.style.margin = '0';
        doc.body.style.padding = '0';
        doc.body.style.overflow = 'hidden';
        doc.documentElement.style.overflow = 'hidden';

        // Targets for A6 Dimensions
        const targetW = 105 * MM_TO_PX; // ~396.8px
        const targetH = 148 * MM_TO_PX; // ~559.3px

        // Determine current native body/scroll sizes
        // Reset scale briefly to get accurate content dimensions
        doc.body.style.transform = 'none';
        doc.body.style.width = 'auto';
        doc.body.style.height = 'auto';

        const contentW = doc.body.scrollWidth || doc.documentElement.scrollWidth || targetW;
        const contentH = doc.body.scrollHeight || doc.documentElement.scrollHeight || targetH;

        // Visual fit-to-page scale scaling if content exceeds boundaries
        const scaleW = contentW > targetW ? (targetW / contentW) : 1;
        const scaleH = contentH > targetH ? (targetH / contentH) : 1;
        const scaleRatio = Math.min(scaleW, scaleH);

        if (scaleRatio < 1) {
          doc.body.style.transform = `scale(${scaleRatio.toFixed(4)})`;
          doc.body.style.transformOrigin = 'top left';
          doc.body.style.width = `${(100 / scaleRatio).toFixed(2)}%`;
          doc.body.style.height = `${(100 / scaleRatio).toFixed(2)}%`;
        }

        setDynamicHeightMm(148);
      }
    } catch (err) {
      console.warn('[CanonicalDocumentPreview] Não foi possível ler as dimensões internas do iframe (CORS ou isolamento):', err);
      setDynamicHeightMm(148);
    }
  };

  // Safe variables for UI - Always locked visually to A6!
  const displayHeight = 148;
  const areaWidthPx = widthMm * MM_TO_PX;
  const areaHeightPx = displayHeight * MM_TO_PX;

  return (
    <div className="flex flex-col bg-[#0b0b0b] border border-white/5 rounded-2xl overflow-hidden shadow-2xl relative w-full font-sans">
      
      {/* 1. BARRA DE FERRAMENTAS DO PREVIEW */}
      <div className="bg-zinc-900/85 border-b border-white/5 px-4 py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shrink-0 z-10 backdrop-blur-md">
        
        {/* Identificação de Status */}
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
          <span className="text-[10px] font-black text-white uppercase tracking-[0.15em] flex items-center gap-1">
            <Eye className="w-3.5 h-3.5 text-emerald-400" /> Preview Canônico
          </span>
          <span className="text-[8px] bg-white/5 border border-white/10 text-zinc-400 px-1.5 py-0.5 rounded font-black tracking-wider uppercase">
            Escala Real 1:1
          </span>
        </div>

        {/* Controles de Zoom, Guias e Exportação */}
        <div className="flex flex-wrap items-center gap-2 sm:gap-3">
          
          {/* Zoom Controls */}
          <div className="flex items-center bg-black/40 border border-white/5 p-0.5 rounded-lg">
            <button
              type="button"
              onClick={handleZoomOut}
              className="p-1 px-2 text-zinc-400 hover:text-white rounded transition-colors"
              title="Diminuir Zoom"
            >
              <ZoomOut className="w-3.5 h-3.5" />
            </button>
            <span className="text-[9.5px] font-mono font-black text-zinc-300 w-12 text-center select-none">
              {Math.round(zoom * 100)}%
            </span>
            <button
              type="button"
              onClick={handleZoomIn}
              className="p-1 px-2 text-zinc-400 hover:text-white rounded transition-colors"
              title="Aumentar Zoom"
            >
              <ZoomIn className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Quick Zooom Presets */}
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => handleZoomSet(0.5)}
              className={`h-7 px-2 text-[8.5px] font-bold uppercase rounded-lg border transition-all ${
                zoom === 0.5 && zoomMode === 'fixed'
                  ? 'bg-emerald-500 text-black border-emerald-400'
                  : 'bg-zinc-800 hover:bg-zinc-700 text-zinc-300 border-white/5'
              }`}
            >
              50%
            </button>
            <button
              type="button"
              onClick={() => handleZoomSet(1)}
              className={`h-7 px-2 text-[8.5px] font-bold uppercase rounded-lg border transition-all ${
                zoom === 1 && zoomMode === 'fixed'
                  ? 'bg-emerald-500 text-black border-emerald-400'
                  : 'bg-zinc-800 hover:bg-zinc-700 text-zinc-300 border-white/5'
              }`}
            >
              100%
            </button>
            <button
              type="button"
              onClick={() => handleZoomSet('fit')}
              className={`h-7 px-2 text-[8.5px] font-bold uppercase rounded-lg border transition-all ${
                zoomMode === 'fit'
                  ? 'bg-emerald-400 text-black border-emerald-400/20'
                  : 'bg-zinc-800 hover:bg-zinc-700 text-zinc-300 border-white/5'
              }`}
            >
              Ajustar
            </button>
          </div>

          <div className="h-4 w-px bg-white/5 hidden sm:block" />

          {/* Guides Toggle */}
          <button
            type="button"
            onClick={() => setShowGuides(prev => !prev)}
            className={`h-7 px-2.5 text-[8.5px] font-bold uppercase rounded-lg border flex items-center gap-1 transition-all ${
              showGuides 
                ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' 
                : 'bg-zinc-800 text-zinc-400 border-white/5 hover:bg-zinc-700'
            }`}
            title="Toggle Guias do Papel, Margens e Área Útil"
          >
            <Grid3X3 className="w-3.5 h-3.5" />
            <span className="hidden xs:inline">Guias</span>
          </button>

        </div>
      </div>

      {/* 2. ÁREA DE TEXTURA DO WORKSPACE */}
      <div 
        ref={containerRef}
        className="flex-1 flex justify-center bg-zinc-950 p-4 md:p-8 overflow-auto min-h-[380px] max-h-[640px] relative scrollbar-thin scrollbar-thumb-white/5"
      >
        <div 
          className="relative shrink-0 select-none"
          style={{
            width: `${areaWidthPx * zoom}px`,
            height: `${areaHeightPx * zoom}px`,
            transition: 'width 0.15s ease, height 0.15s ease'
          }}
        >
          {/* O Papel que flutua proporcionalmente ao Zoom */}
          <div 
            className="bg-white text-black shadow-[0_15px_45px_rgba(0,0,0,0.65)] absolute"
            style={{
              width: `${widthMm}mm`,
              height: `${displayHeight}mm`,
              transform: `scale(${zoom})`,
              transformOrigin: 'top left',
              boxSizing: 'border-box'
            }}
          >
            <div className="w-full h-full relative overflow-hidden" id="print-canvas-area">
              {loading ? (
                <div className="absolute inset-0 bg-white flex flex-col items-center justify-center gap-2">
                  <RefreshCw className="w-5 h-5 text-zinc-400 animate-spin" />
                  <span className="text-[9px] font-black col text-zinc-500 uppercase tracking-widest font-sans">Compilando Layout...</span>
                </div>
              ) : (
                <iframe
                  ref={iframeRef}
                  title="Preview Canônico Interno"
                  srcDoc={html}
                  onLoad={handleIframeLoad}
                  scrolling="no"
                  className="w-full h-full border-none m-0 p-0 block bg-white overflow-hidden pointer-events-none"
                  style={{ overflow: 'hidden' }}
                />
              )}
            </div>

            {/* Simulação de Dentes Serrilhados para Térmicos (80mm/58mm) */}
            {isDynamicHeight && (
              <div 
                className="absolute bottom-0 left-0 right-0 h-1.5 bg-contain pointer-events-none border-t border-dashed border-zinc-300"
                style={{
                  backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='8' viewBox='0 0 16 8'%3E%3Cpath d='M0,8 L8,0 L16,8 Z' fill='%230b0b0b'/%3E%3C/svg%3E")`,
                  backgroundRepeat: 'repeat-x'
                }}
              />
            )}

            {/* GUIAS VISUAIS DE PREVIEW (SÓ PROJETADAS SE ATIVAS) */}
            {showGuides && (
              <div className="absolute inset-0 pointer-events-none z-40">
                
                {/* 1. Moldura Pontilhada com dimensões físicas */}
                <div className="absolute top-1 left-1.5 text-[6.5px] font-mono font-bold uppercase text-rose-500/80 tracking-tight bg-white px-1 py-0.5 rounded shadow-sm">
                  L: {widthMm}mm
                </div>
                <div className="absolute bottom-1 right-1.5 text-[6.5px] font-mono font-bold uppercase text-rose-500/80 tracking-tight bg-white px-1 py-0.5 rounded shadow-sm">
                  A: {displayHeight.toFixed(0)}mm
                </div>

                {/* 2. Grid Milimétrico de Alta Fidelidade (Grade sutil oposta para testes 10mm x 10mm) */}
                <div 
                  className="absolute inset-0 opacity-[0.06]"
                  style={{
                    backgroundImage: `
                      linear-gradient(to right, #f43f5e 1px, transparent 1px),
                      linear-gradient(to bottom, #f43f5e 1px, transparent 1px)
                    `,
                    backgroundSize: '10mm 10mm'
                  }}
                />

                {/* 3. Indicador de área útil de corte para bobinas e etiquetas */}
                {geometry.paperId.includes('mm') === false && (
                  <div className="absolute inset-1.5 border border-dashed border-emerald-500/35 flex items-center justify-center">
                    <span className="text-[6px] font-bold font-mono text-emerald-500/40 uppercase tracking-widest">ÁREA ÚTIL SEGURA</span>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* 3. METADADOS E ESPECIFICAÇÕES DO FORMATO */}
      <div className="bg-zinc-950 border-t border-white/5 px-4 py-2.5 flex flex-wrap items-center justify-between gap-3 text-[9px] text-[#71717a] font-bold uppercase tracking-tight font-sans">
        
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
          <div className="flex items-center gap-1 text-zinc-400">
            <Info className="w-3.5 h-3.5 text-zinc-500" />
            <span className="text-zinc-600 font-extrabold">Formato:</span> 
            <span className="text-white bg-white/5 px-1 py-0.2 rounded">{geometry.paperId}</span>
          </div>

          <div>
            <span className="text-zinc-600 font-extrabold">Medidas de Emissão:</span> 
            <span className="text-zinc-300"> {widthMm}mm x {isDynamicHeight ? `${displayHeight.toFixed(1)}mm (Dinâmico)` : `${displayHeight}mm`}</span>
          </div>

          <div>
            <span className="text-zinc-600 font-extrabold">Resolução Render:</span> 
            <span className="text-zinc-300"> {Math.round(areaWidthPx)}px x {Math.round(areaHeightPx)}px</span>
          </div>
        </div>

        <div className="text-emerald-400 font-black tracking-widest text-[8.5px] shrink-0 select-none flex items-center gap-1.5">
          <FileText className="w-3 h-3 text-emerald-400" /> PREVIEW CANÔNICO UNIFICADO
        </div>
      </div>

    </div>
  );
};
