import { useStore } from '../../store';
import { generateCanonicalPdfBlob, downloadOrSharePdf } from '../pdfEngine/pdfGenerator';
import { resolveDocumentGeometry, resolveCanonicalDocumentConfig } from './documentSizes';
import { buildCanonicalHtml } from '../pdfEngine/canonicalHtmlBuilder';

let isProcessing = false;

/**
 * Initializes the background queue observer.
 * Listens to print jobs submitted to the Zustand store and processes them sequentially.
 */
export function initializePrintSpooler() {
  console.log('[PRINT-SPOOLER] Centered Background Print Spooler initialized.');

  // Subscribe to state change in store to catch added print jobs
  useStore.subscribe((state) => {
    const queue = state.printQueue || [];
    const hasAwaiting = queue.some((j) => j.status === 'aguardando');
    if (hasAwaiting && !isProcessing) {
      processNextJob();
    }
  });

  // Run immediate sweep in case some persist on boot
  processNextJob();
}

/**
 * Sequential consumer function. Guarantees a single print job is processed at any time.
 */
async function processNextJob() {
  if (isProcessing) return;

  const state = useStore.getState();
  const queue = state.printQueue || [];
  const nextJob = queue.find((j) => j.status === 'aguardando');

  if (!nextJob) return;

  isProcessing = true;
  console.log(`[PRINT-SPOOLER] Consuming job "${nextJob.id}" ("${nextJob.documentName}")...`);

  let blob: Blob | null = null;
  try {
    const { updatePrintJobStatus, updatePrintJobPdfUrl } = useStore.getState();

    // 1. Generate PDF Phase
    updatePrintJobStatus(nextJob.id, 'gerando_pdf');

    const subTabMap: Record<string, string> = {
      thermal_receipt: 'reciboTermico',
      order_ticket: 'cupomPedido',
      labels: 'etiqueta',
      bulk_labels: 'etiquetaLote',
      customer_experience: 'mensagemCliente',
      cracha: 'cracha'
    };
    const canonicalDocType = subTabMap[nextJob.documentId] || 'reciboTermico';

    // Resolve configured theme and watermark for this document
    const configMap: Record<string, any> = {
      thermal_receipt: state.receiptConfig,
      order_ticket: state.orderTicketConfig,
      labels: state.labelConfig,
      bulk_labels: state.labelBatchConfig,
      customer_experience: state.customerExperienceConfig,
      cracha: state.badgeConfig
    };
    const docConfig = configMap[nextJob.documentId];
    const theme = docConfig?.theme || 'classic';
    const themeId = docConfig?.themeId;

    const resolved = resolveCanonicalDocumentConfig(nextJob.documentId);
    const customFields = docConfig?.customFields || resolved.customFields;
    const watermarkTheme = resolved.watermarkTheme;

    // Generate HTML ONCE and reuse it
    const html = await buildCanonicalHtml({
      documentId: canonicalDocType,
      payload: nextJob.payload || {},
      paperSize: nextJob.paperErpId || 'A6',
      company: state.company,
      imageThemes: state.imageThemes || [],
      theme,
      themeId,
      customFields,
      watermarkTheme,
      isExportPdf: true,
      orientation: nextJob.orientation || 'portrait'
    } as any);

    let pdfGenerationError: Error | null = null;

    try {
      blob = await generateCanonicalPdfBlob(
        canonicalDocType,
        nextJob.payload || {},
        nextJob.paperErpId,
        {
          orientation: nextJob.orientation || 'portrait',
          marginMm: nextJob.marginMm ?? 0,
          scale: nextJob.scale ?? 1.0,
          safeMode: nextJob.safeMode || false,
          company: state.company,
          imageThemes: state.imageThemes || [],
          theme,
          themeId,
          driverPaperName: nextJob.driverPaperName,
          preBuiltHtml: html
        }
      );
    } catch (err: any) {
      console.warn('[PRINT-SPOOLER] Canonical PDF generation failed. Falling back to HTML transmission.', err);
      pdfGenerationError = err instanceof Error ? err : new Error(String(err));
    }

    if (blob) {
      const localPdfUrl = URL.createObjectURL(blob);
      updatePrintJobPdfUrl(nextJob.id, localPdfUrl);
    }

    updatePrintJobStatus(nextJob.id, 'pronto_para_imprimir');
    updatePrintJobStatus(nextJob.id, 'imprimindo');

    // 2. Hardware Transmission Phase
    const isDesktopEnv = typeof window !== 'undefined' && ('electron' in window || !!(window as any).electron);

    if (isDesktopEnv) {
      if (blob) {
        const reader = new FileReader();
        reader.readAsDataURL(blob);

        await new Promise<void>((resolve, reject) => {
          reader.onloadend = async () => {
            try {
              const base64Data = reader.result as string;
              
              const geom = resolveDocumentGeometry(nextJob.documentId, null, {
                paperErpId: nextJob.paperErpId,
                orientation: nextJob.orientation,
                marginMm: nextJob.marginMm,
                scale: nextJob.scale,
                driverPaperName: nextJob.driverPaperName
              });

              console.log(`[PRINT-SPOOLER] Dispatching standalone canonical PDF via base64. Document: ${nextJob.documentName}, Job: ${nextJob.id}, Width: ${geom.paperWidthMm}mm, Height: ${geom.paperHeightMm}mm`);

              const isUsingAdvancedMode = nextJob.printPipeline === 'windows_advanced' || nextJob.advancedModeEnabled;
              let useAdvancedBridge = false;

              if (isUsingAdvancedMode) {
                const isAdvancedBridgeAvailable = (window as any).electron && 
                  typeof (window as any).electron.printAdvancedJob === 'function';
                
                if (isAdvancedBridgeAvailable) {
                  useAdvancedBridge = true;
                } else {
                  console.warn(`[PRINT-SPOOLER] Advanced Windows Pipeline is configured for ${nextJob.documentName}, but native advanced bridge is not installed. Falling back to safe Electron/PDF mode.`);
                  alert(`[ERP Nexa - Alerta de Pipeline]\n\nModo Avançado Windows configurado para "${nextJob.documentName}", mas a bridge nativa ainda não está instalada.\n\nUsando modo Electron/PDF de segurança.`);
                }
              }

              if (useAdvancedBridge) {
                const res = await (window as any).electron.printAdvancedJob({
                  printerId: nextJob.printerId,
                  printerName: nextJob.printerName,
                  driverPaperName: nextJob.driverPaperName,
                  orientation: nextJob.orientation,
                  marginMm: nextJob.marginMm,
                  scale: nextJob.scale,
                  safeMode: nextJob.safeMode,
                  pdfBase64: base64Data,
                  paperWidthMm: geom.paperWidthMm,
                  paperHeightMm: geom.paperHeightMm,
                  jobId: nextJob.id,
                  documentName: nextJob.documentName,
                  // Advanced Settings
                  copies: nextJob.copies,
                  dpi: nextJob.dpi,
                  paperSource: nextJob.paperSource,
                  colorMode: nextJob.colorMode,
                  duplexMode: nextJob.duplexMode,
                  mediaType: nextJob.mediaType,
                  printQuality: nextJob.printQuality
                });

                if (res && res.success) {
                  updatePrintJobStatus(nextJob.id, 'impresso');
                  resolve();
                } else {
                  const errorMsg = res?.error || 'Erro desconhecido na bridge avançada .NET/Windows.';
                  console.error('[PRINT-SPOOLER] Advanced print error, falling back:', errorMsg);
                  // Let it trigger secure PDF download fallback
                  if (blob) {
                    await downloadOrSharePdf(blob, nextJob.documentName);
                    updatePrintJobStatus(nextJob.id, 'impresso', errorMsg);
                    alert(`Erro na Bridge Avançada:\n${errorMsg}\n\nO PDF foi gerado e baixado automaticamente.`);
                  }
                  resolve();
                }
              } else if (
                (window as any).electron &&
                typeof (window as any).electron.printPdf === 'function'
              ) {
                const res = await (window as any).electron.printPdf({
                  printerId: nextJob.printerId,
                  printerName: nextJob.printerName,
                  driverPaperName: nextJob.driverPaperName,
                  orientation: nextJob.orientation,
                  marginMm: nextJob.marginMm,
                  scale: nextJob.scale,
                  safeMode: nextJob.safeMode,
                  pdfBase64: base64Data,
                  paperWidthMm: geom.paperWidthMm,
                  paperHeightMm: geom.paperHeightMm,
                  jobId: nextJob.id,
                  documentName: nextJob.documentName
                });

                if (res && res.success) {
                  updatePrintJobStatus(nextJob.id, 'impresso');
                  resolve();
                } else if (res && res.fallbackPdf) {
                  console.warn(`[PRINT-SPOOLER] Sandbox/Electron safety block matched. Fallback PDF triggered: "${res.error}"`);
                  if (blob) {
                    await downloadOrSharePdf(blob, nextJob.documentName);
                    updatePrintJobStatus(nextJob.id, 'impresso', res.error);
                    alert(`Impressora Indisponível:\n${res.error}\n\nO PDF do documento foi gerado e baixado automaticamente.`);
                  }
                  resolve();
                } else {
                  // General hardware failure fallback
                  console.warn(`[PRINT-SPOOLER] Physical print failed or rejected. Triggering secure PDF fallback for: ${res?.error}`);
                  if (blob) {
                    await downloadOrSharePdf(blob, nextJob.documentName);
                    updatePrintJobStatus(nextJob.id, 'impresso', res?.error || 'Falha na impressora física.');
                    alert(`Erro na Impressora:\n${res?.error || 'A impressora física reportou um problema ou está indisponível.'}\n\nO documento PDF foi salvo automaticamente.`);
                  }
                  resolve();
                }
              } else {
                reject(new Error('Hardware bridge de impressão nativa ausente ou corrompido no Desktop app.'));
              }
            } catch (e) {
              reject(e);
            }
          };
          reader.onerror = () => reject(new Error('Falha crítica ao ler estrutura binária de PDF.'));
        });
      } else {
        // Fallback HTML flow when PDF generation fails completely
        console.warn(`[PRINT-SPOOLER] Running fallback HTML physical print for job ${nextJob.id}`);
        const geom = resolveDocumentGeometry(nextJob.documentId, null, {
          paperErpId: nextJob.paperErpId,
          orientation: nextJob.orientation,
          marginMm: nextJob.marginMm,
          scale: nextJob.scale,
          driverPaperName: nextJob.driverPaperName
        });

        if (
          (window as any).electron &&
          typeof (window as any).electron.printPdf === 'function'
        ) {
          const res = await (window as any).electron.printPdf({
            printerId: nextJob.printerId,
            printerName: nextJob.printerName,
            driverPaperName: nextJob.driverPaperName,
            orientation: nextJob.orientation,
            marginMm: nextJob.marginMm,
            scale: nextJob.scale,
            safeMode: nextJob.safeMode,
            html: html,
            paperWidthMm: geom.paperWidthMm,
            paperHeightMm: geom.paperHeightMm,
            jobId: nextJob.id,
            documentName: nextJob.documentName
          });

          if (res && res.success) {
            updatePrintJobStatus(nextJob.id, 'impresso');
          } else {
            throw new Error(res?.error || 'Erro desconhecido na impressora física via fallback de HTML.');
          }
        } else {
          throw new Error('Hardware bridge de impressão nativa ausente ou corrompido no Desktop app.');
        }
      }
    } else {
      // WEB BROWSER FLOW: Gracefully fallback to PDF download to avoid blocking the user in Web Sandboxes
      if (blob) {
        const url = URL.createObjectURL(blob);
        const tempLink = document.createElement('a');
        tempLink.href = url;
        tempLink.download = `${nextJob.documentName.toLowerCase().replace(/\s+/g, '_')}.pdf`;
        document.body.appendChild(tempLink);
        tempLink.click();
        document.body.removeChild(tempLink);
        setTimeout(() => URL.revokeObjectURL(url), 1000);
        
        updatePrintJobStatus(nextJob.id, 'impresso');

        if (nextJob.printerId !== 'pdf-manual') {
          console.warn(
            `[PRINT-SPOOLER] Impressão direcionada para "${nextJob.printerName}" (${nextJob.paperErpId}) foi convertida em download PDF por limitações do ambiente Web Sandbox.`
          );
        }
      } else {
        throw pdfGenerationError || new Error('Falha ao gerar o arquivo PDF para download.');
      }
    }

    console.log(`[PRINT-SPOOLER] Job "${nextJob.id}" spooled successfully.`);
  } catch (err: any) {
    console.error(`[PRINT-SPOOLER] Error processing queue job "${nextJob.id}":`, err);
    if (blob) {
      try {
        console.log(`[PRINT-SPOOLER] General queue exception. Rescuing document state via emergency PDF download.`);
        await downloadOrSharePdf(blob, nextJob.documentName);
        useStore.getState().updatePrintJobStatus(
          nextJob.id,
          'impresso',
          `Erro na mídia física resgatado por PDF: ${err.message || 'Falha desconhecida.'}`
        );
        alert(`Ocorreu um erro ao enviar para a impressora física:\n${err.message || 'Impressora ocupada ou inacessível.'}\n\nResgatamos seu documento e salvamos o PDF dele.`);
      } catch (backupErr) {
        console.error('[PRINT-SPOOLER] Failed to execute emergency PDF salvage:', backupErr);
        useStore.getState().updatePrintJobStatus(
          nextJob.id,
          'erro',
          err.message || 'Falha geral ao despachar impressão física.'
        );
      }
    } else {
      useStore.getState().updatePrintJobStatus(
        nextJob.id,
        'erro',
        err.message || 'Falha geral ao despachar impressão física.'
      );
    }
  } finally {
    isProcessing = false;
    // Brief spacing gap to prevent high-priority CPU lock, then call recursively
    setTimeout(() => processNextJob(), 300);
  }
}
