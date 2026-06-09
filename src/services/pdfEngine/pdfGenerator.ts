import { buildCanonicalHtml } from './canonicalHtmlBuilder';
import { jsPDF } from 'jspdf';
import html2canvas from 'html2canvas-pro';
import { resolveDocumentGeometry, resolveCanonicalDocumentConfig } from '../printEngine/documentSizes';
import { detectPlatform } from '../../platform/printAdapters';
import { useStore } from '../../store';

/**
 * Renders a premium, dark, sleek paper size selector modal on standard web browser
 * and returns the user selection based on the document type being printed.
 */
function promptWebPaperSize(documentId: string): Promise<string> {
  return new Promise((resolve, reject) => {
    let optionsHtml = `
      <button type="button" data-size="A4" class="w-full text-left py-3.5 px-4 bg-zinc-900/60 border border-zinc-800 hover:border-cyan-500/40 hover:bg-zinc-850 rounded-xl transition-all duration-150 flex items-center justify-between cursor-pointer group active:scale-98">
        <div class="pr-2">
          <span class="text-xs font-bold font-sans text-white block">Formato A4 (Sulfite Comum)</span>
          <span class="text-[10px] font-mono text-zinc-400 block mt-0.5">Folha sulfite inteira (210mm × 297mm)</span>
        </div>
        <span class="text-[10px] font-black uppercase font-sans py-1 px-2.5 bg-cyan-500/10 border border-cyan-500/20 text-cyan-400 rounded-lg group-hover:scale-105 transition-transform duration-150 shrink-0">A4</span>
      </button>

      <button type="button" data-size="A5" class="w-full text-left py-3.5 px-4 bg-zinc-900/60 border border-zinc-800 hover:border-emerald-500/40 hover:bg-zinc-850 rounded-xl transition-all duration-150 flex items-center justify-between cursor-pointer group active:scale-98">
        <div class="pr-2">
          <span class="text-xs font-bold font-sans text-white block">Formato A5 (Meia Folha)</span>
          <span class="text-[10px] font-mono text-zinc-400 block mt-0.5">Metade do A4 (148mm × 210mm)</span>
        </div>
        <span class="text-[10px] font-black uppercase font-sans py-1 px-2.5 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 rounded-lg group-hover:scale-105 transition-transform duration-150 shrink-0">A5</span>
      </button>

      <button type="button" data-size="A6" class="w-full text-left py-3.5 px-4 bg-zinc-900/60 border border-zinc-800 hover:border-purple-500/40 hover:bg-zinc-850 rounded-xl transition-all duration-150 flex items-center justify-between cursor-pointer group active:scale-98">
        <div class="pr-2">
          <span class="text-xs font-bold font-sans text-white block">Formato A6 (Compacto)</span>
          <span class="text-[10px] font-mono text-zinc-400 block mt-0.5">Tamanho crachá/postal (105mm × 148mm)</span>
        </div>
        <span class="text-[10px] font-black uppercase font-sans py-1 px-2.5 bg-purple-500/10 border border-purple-500/20 text-purple-400 rounded-lg group-hover:scale-105 transition-transform duration-150 shrink-0">A6</span>
      </button>
    `;

    // Create the modal backdrop wrapper
    const modalDiv = document.createElement('div');
    modalDiv.className = 'fixed inset-0 bg-black/75 backdrop-blur-sm flex items-center justify-center z-[999999] transition-opacity duration-200 opacity-0';
    
    modalDiv.innerHTML = `
      <div class="bg-zinc-950 border border-zinc-800 rounded-3xl p-6 max-w-sm w-full mx-4 shadow-2xl transform scale-95 transition-transform duration-200 text-zinc-100 font-sans">
        <!-- Header -->
        <div class="flex items-center gap-3 mb-4">
          <div class="p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-400">
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-file-text"><path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/><path d="M10 9H8"/><path d="M16 13H8"/><path d="M16 17H8"/></svg>
          </div>
          <div>
            <h3 class="text-sm font-black uppercase text-white tracking-wider">Formato de Saída</h3>
            <p class="text-[10px] text-zinc-400 font-semibold font-sans mt-0.5">Selecione o tamanho exato do papel</p>
          </div>
        </div>

        <!-- Warning content description -->
        <p class="text-xs text-zinc-300 leading-relaxed mb-5 font-sans">
          Como você está no ambiente <strong class="text-white">Web</strong>, o documento será compilado e gerado exatamente no tamanho de papel selecionado:
        </p>

        <!-- Options grid -->
        <div class="space-y-2 mb-5">
          ${optionsHtml}
        </div>

        <!-- Footer actions -->
        <div class="flex items-center gap-2 border-t border-zinc-900 pt-4">
          <button type="button" id="cancel-pdf" class="w-full py-2.5 bg-zinc-900 hover:bg-zinc-850 border border-zinc-800 rounded-xl text-xs font-bold uppercase tracking-wider text-zinc-400 hover:text-white transition-colors duration-150 cursor-pointer active:scale-95">
            Cancelar extração
          </button>
        </div>
      </div>
    `;

    document.body.appendChild(modalDiv);

    // Trigger animations
    requestAnimationFrame(() => {
      modalDiv.classList.remove('opacity-0');
      const innerCard = modalDiv.querySelector('div');
      if (innerCard) {
        innerCard.classList.remove('scale-95');
      }
    });

    const cleanUp = () => {
      modalDiv.classList.add('opacity-0');
      const innerCard = modalDiv.querySelector('div');
      if (innerCard) {
        innerCard.classList.add('scale-95');
      }
      setTimeout(() => {
        if (document.body.contains(modalDiv)) {
          document.body.removeChild(modalDiv);
        }
      }, 200);
    };

    // Button event listeners
    modalDiv.querySelectorAll('button[data-size]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const size = (e.currentTarget as HTMLButtonElement).getAttribute('data-size') || 'A6';
        cleanUp();
        resolve(size);
      });
    });

    const cancelBtn = modalDiv.querySelector('#cancel-pdf');
    if (cancelBtn) {
      cancelBtn.addEventListener('click', () => {
        cleanUp();
        reject(new Error('Exportação de PDF cancelada pelo usuário.'));
      });
    }

    // Dismiss when clicking outside the card
    modalDiv.addEventListener('click', (e) => {
      if (e.target === modalDiv) {
        cleanUp();
        reject(new Error('Exportação de PDF cancelada pelo usuário.'));
      }
    });
  });
}

/**
 * Generates a high-fidelity vector PDF blob for both sheet-fed and dynamic height thermal papers.
 * Directly leverages Electron's webContents.printToPDF inside the Desktop environment
 * and jsPDF's built-in vector DOM rendering in the Web environment.
 */
export async function generateCanonicalPdfBlob(
  documentId: string,
  payload: any,
  paperErpId: string,
  options: {
    orientation: 'portrait' | 'landscape';
    marginMm: number;
    scale: number;
    safeMode: boolean;
    company?: any;
    imageThemes?: any[];
    theme?: string;
    themeId?: string;
    customFields?: any;
    driverPaperName?: string;
    isExportPdf?: boolean;
    preBuiltHtml?: string;
  }
): Promise<Blob> {
  const state = useStore.getState();
  const platform = detectPlatform();

  // Strict coercion/mapping: PDF generator supports custom formats on browser
  let pdfPaperSize = 'A6';

  if (platform === 'web-browser' && (options.isExportPdf || !paperErpId)) {
    // Intercept when on Web and prompt the user to select their desired paper size
    try {
      pdfPaperSize = await promptWebPaperSize(documentId);
    } catch (e) {
      throw e; // propagation cancels download dialog
    }
  } else {
    const targetPaper = options.driverPaperName || paperErpId;
    if (targetPaper) {
      const normPaper = targetPaper.toLowerCase();
      if (normPaper.includes('a4')) {
        pdfPaperSize = 'A4';
      } else if (normPaper.includes('a5')) {
        pdfPaperSize = 'A5';
      } else if (normPaper.includes('a6')) {
        pdfPaperSize = 'A6';
      } else if (normPaper.includes('40x30')) {
        pdfPaperSize = '40x30';
      } else if (normPaper.includes('80mm')) {
        pdfPaperSize = '80mm';
      } else if (normPaper.includes('58mm')) {
        pdfPaperSize = '58mm';
      } else {
        pdfPaperSize = targetPaper;
      }
    } else {
      pdfPaperSize = 'A6';
    }
  }
  
  // Resolve user custom configs from store state for fallback theme & settings
  const configMap: Record<string, any> = {
    thermal_receipt: state.receiptConfig,
    reciboTermico: state.receiptConfig,
    order_ticket: state.orderTicketConfig,
    cupomPedido: state.orderTicketConfig,
    labels: state.labelConfig,
    etiqueta: state.labelConfig,
    bulk_labels: state.labelBatchConfig,
    etiquetaLote: state.labelBatchConfig,
    customer_experience: state.customerExperienceConfig,
    mensagemCliente: state.customerExperienceConfig
  };
  const docConfig = configMap[documentId];
  
  const resolved = resolveCanonicalDocumentConfig(documentId);
  
  const theme = options.theme || docConfig?.theme || resolved.theme || 'classic';
  const themeId = options.themeId || docConfig?.themeId || resolved.themeId;
  const customFields = options.customFields || docConfig?.customFields || resolved.customFields;
  const watermarkTheme = resolved.watermarkTheme;

  const html = options.preBuiltHtml || await buildCanonicalHtml({
    documentId,
    payload,
    paperSize: pdfPaperSize,
    company: options.company || state.company,
    imageThemes: options.imageThemes || state.imageThemes || [],
    theme,
    themeId,
    customFields,
    watermarkTheme,
    isExportPdf: options.isExportPdf,
    orientation: options.orientation
  } as any);

  const geometry = resolveDocumentGeometry(documentId, null, {
    paperErpId: pdfPaperSize,
    orientation: options.orientation,
    marginMm: options.marginMm,
    scale: options.scale,
    driverPaperName: options.driverPaperName
  });

  // 1. Desktop/Electron: Execute native webContents.printToPDF vector engine
  if (
    platform === 'desktop-electron' &&
    typeof window !== 'undefined' &&
    (window as any).electron &&
    typeof (window as any).electron.generatePdfFromHtml === 'function'
  ) {
    console.log('[PDF-GENERATOR] Utilizing desktop native vector PDF pipeline.');
    const result = await (window as any).electron.generatePdfFromHtml({
      html,
      paperSize: pdfPaperSize,
      orientation: options.orientation || 'portrait',
      paperWidthMm: geometry.paperWidthMm,
      paperHeightMm: geometry.paperHeightMm,
      scale: options.scale
    });

    if (result && result.success && result.pdfBase64) {
      const byteCharacters = atob(result.pdfBase64);
      const byteNumbers = new Array(byteCharacters.length);
      for (let i = 0; i < byteCharacters.length; i++) {
        byteNumbers[i] = byteCharacters.charCodeAt(i);
      }
      const byteArray = new Uint8Array(byteNumbers);
      return new Blob([byteArray], { type: 'application/pdf' });
    } else {
      console.error('[PDF-GENERATOR] Native vector engine failed or returned empty payload:', result?.error);
      throw new Error(`Pipeline Nativa de PDF falhou: ${result?.error || 'Retorno vazio'}`);
    }
  }

  // 2. Web browser & Android: Execute high-fidelity canvas jsPDF engine
  console.log('[PDF-GENERATOR] Utilizing unified high-fidelity canvas PDF engine.');

  const MM_TO_PX = 3.7795275591;

  return new Promise((resolve, reject) => {
    const iframe = document.createElement('iframe');
    iframe.style.position = 'fixed';
    iframe.style.top = '-9999px';
    iframe.style.left = '-9999px';
    
    const widthMm = geometry.paperWidthMm;
    const heightMm = geometry.paperHeightMm === 'auto' ? 148 : geometry.paperHeightMm;

    const targetW = widthMm * MM_TO_PX;
    const targetH = heightMm * MM_TO_PX;

    iframe.style.width = `${targetW}px`; 
    iframe.style.height = `${targetH}px`;
    iframe.style.visibility = 'hidden';
    document.body.appendChild(iframe);

    iframe.srcdoc = html;

    iframe.onload = async () => {
      try {
        const iframeDoc = iframe.contentDocument || iframe.contentWindow?.document;
        if (!iframeDoc) {
          throw new Error('Não foi possível ler o documento do frame off-screen.');
        }

        // Apply clean body sizing to avoid visual overlaps
        iframeDoc.body.style.backgroundColor = '#ffffff';
        iframeDoc.body.style.margin = '0';
        iframeDoc.body.style.padding = '0';
        iframeDoc.body.style.overflow = 'hidden';
        iframeDoc.documentElement.style.overflow = 'hidden';

        // Wait brief delay for SVGs/QR Codes and font-face configurations to fully render
        await new Promise(r => setTimeout(r, 750));

        // Let the document compute baseline auto-height
        iframeDoc.body.style.transform = 'none';
        iframeDoc.body.style.width = `${targetW}px`;
        
        const isRoll = geometry.isRoll;
        iframeDoc.body.style.height = isRoll ? 'auto' : `${targetH}px`;

        if (isRoll) {
          const contentW = iframeDoc.body.scrollWidth || iframeDoc.documentElement.scrollWidth || targetW;
          const contentH = iframeDoc.body.scrollHeight || iframeDoc.documentElement.scrollHeight || targetH;

          // Visual fit-to-page compressor to match preview and avoid blank margins or double pages
          const scaleW = contentW > targetW ? (targetW / contentW) : 1;
          const scaleH = contentH > targetH ? (targetH / contentH) : 1;
          const scaleRatio = Math.min(scaleW, scaleH);

          if (scaleRatio < 1) {
            iframeDoc.body.style.transform = `scale(${scaleRatio.toFixed(4)})`;
            iframeDoc.body.style.transformOrigin = 'top left';
            iframeDoc.body.style.width = `${(100 / scaleRatio).toFixed(2)}%`;
            iframeDoc.body.style.height = `${(100 / scaleRatio).toFixed(2)}%`;
          }
        }

        const realHeight = isRoll ? (iframeDoc.body.scrollHeight || targetH) : targetH;

        // Render the DOM to high-DPI image canvas
        const canvas = await html2canvas(iframeDoc.body, {
          scale: 3.5, // 300+ DPI equivalent crispness
          useCORS: true,
          logging: false,
          backgroundColor: '#ffffff',
          width: targetW,
          height: realHeight,
          windowWidth: targetW,
          windowHeight: realHeight,
          x: 0,
          y: 0
        });

        const imgData = canvas.toDataURL('image/jpeg', 0.98);

        const doc = new jsPDF({
          orientation: geometry.orientation,
          unit: 'mm',
          format: [widthMm, realHeight / MM_TO_PX]
        });

        doc.addImage(imgData, 'JPEG', 0, 0, widthMm, realHeight / MM_TO_PX);
        const pdfBlob = doc.output('blob');
        resolve(pdfBlob);
      } catch (err) {
        reject(err);
      } finally {
        if (document.body.contains(iframe)) {
          document.body.removeChild(iframe);
        }
      }
    };
  });
}

/**
 * Downloads a PDF file on Web or initiates native Save Dialog / Sharing menu in Mobile & Electron.
 */
export async function downloadOrSharePdf(blob: Blob, fileName: string): Promise<void> {
  const fileCleanName = `${fileName.replace(/\s+/g, '_').toLowerCase()}.pdf`;
  const platform = detectPlatform();
  
  if (platform === 'desktop-electron') {
    if (typeof window !== 'undefined' && (window as any).electron && typeof (window as any).electron.savePdfDialog === 'function') {
      // Desktop native save dialog (with target directory lookup)
      const reader = new FileReader();
      reader.readAsDataURL(blob);
      reader.onloadend = async () => {
        const base64Data = reader.result as string;
        const res = await (window as any).electron.savePdfDialog({
          pdfBase64: base64Data,
          defaultFilename: fileCleanName
        });
        if (!res.success && res.error && !res.error.includes('cancelou')) {
          throw new Error(`Erro ao salvar arquivo PDF: ${res.error}`);
        }
      };
    } else {
      // Fallback download if electron save dialog is somehow missing/mock
      const url = URL.createObjectURL(blob);
      const tempLink = document.createElement('a');
      tempLink.href = url;
      tempLink.download = fileCleanName;
      document.body.appendChild(tempLink);
      tempLink.click();
      document.body.removeChild(tempLink);
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    }
  } else {
    // Standard web browser download trigger - 100% Native browser download to completely avoid web shares
    const url = URL.createObjectURL(blob);
    const tempLink = document.createElement('a');
    tempLink.href = url;
    tempLink.download = fileCleanName;
    document.body.appendChild(tempLink);
    tempLink.click();
    document.body.removeChild(tempLink);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
}
