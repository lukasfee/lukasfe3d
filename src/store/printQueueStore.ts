import { create } from 'zustand';

// Declare standard type interfaces to ensure strict type safety
declare global {
  interface Window {
    electron?: {
      printDocument?: (html: string, widthMm: number, heightMm: number) => Promise<{ success: boolean; error?: string }>;
      [key: string]: any;
    };
  }
}

export interface PrintJob {
  id: string;
  documentType: 'recibo' | 'etiqueta' | string;
  payload: any;
  paperWidthMm: number;
  paperHeightMm: number;
  status: 'pendente' | 'processando' | 'concluído' | 'erro';
  error?: string;
  createdAt: string;
}

interface PrintQueueState {
  jobs: PrintJob[];
  addPrintJob: (job: Omit<PrintJob, 'id' | 'status' | 'createdAt'>) => void;
  updateJobStatus: (id: string, status: PrintJob['status'], error?: string) => void;
  getPendingJob: () => PrintJob | undefined;
  processPendingJob: () => Promise<void>;
  clearJobs: () => void;
}

/**
 * HTML Builder function optimized to compile modern layouts into standard,
 * clean formats suited for standard micro-thermal printers or label sheets.
 */
export function generateCleanHtml(documentType: string, payload: any): string {
  if (documentType === 'recibo') {
    const itemsHtml = (payload.items || [])
      .map(
        (item: any) => `
        <tr style="border-bottom: 1px dashed #eee;">
          <td style="padding: 6px 0; font-size: 11px;">${item.description || item.name || 'Item'}</td>
          <td style="padding: 6px 0; font-size: 11px; text-align: center;">${item.qty || 1}</td>
          <td style="padding: 6px 0; font-size: 11px; text-align: right;">R$ ${(item.price || 0).toFixed(2)}</td>
          <td style="padding: 6px 0; font-size: 11px; text-align: right;">R$ ${(item.total || (item.qty * item.price) || 0).toFixed(2)}</td>
        </tr>
      `
      )
      .join('');

    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <style>
          body {
            font-family: 'Courier New', Courier, monospace;
            color: #000;
            background-color: #fff;
            margin: 0;
            padding: 10px;
            font-size: 12px;
            line-height: 1.3;
          }
          .header {
            text-align: center;
            margin-bottom: 15px;
            border-bottom: 2px dashed #000;
            padding-bottom: 10px;
          }
          .title {
            font-size: 16px;
            font-weight: bold;
            text-transform: uppercase;
            margin: 0 0 5px 0;
          }
          .subtitle {
            font-size: 11px;
            margin: 0;
          }
          .details {
            margin-bottom: 10px;
            font-size: 11px;
          }
          .details table {
            width: 100%;
          }
          .items-table {
            width: 100%;
            border-collapse: collapse;
            margin-bottom: 15px;
          }
          .totals {
            border-top: 2px dashed #000;
            padding-top: 10px;
            font-size: 12px;
          }
          .totals table {
            width: 100%;
          }
          .footer {
            text-align: center;
            margin-top: 20px;
            font-size: 10px;
            border-top: 1px dashed #000;
            padding-top: 10px;
          }
        </style>
      </head>
      <body>
        <div class="header">
          <h1 class="title">${payload.companyName || 'COMPROVANTE DE VENDA'}</h1>
          <p class="subtitle">${payload.companyCnpj ? 'CNPJ: ' + payload.companyCnpj : ''}</p>
          <p class="subtitle">${payload.companyAddress || ''}</p>
        </div>
        
        <div class="details">
          <table>
            <tr><td><b>Pedido:</b> ${payload.orderNumber || payload.orderId || '-'}</td></tr>
            <tr><td><b>Data:</b> ${payload.date || new Date().toLocaleString()}</td></tr>
            <tr><td><b>Cliente:</b> ${payload.client?.name || payload.clientName || 'Consumidor Final'}</td></tr>
            ${payload.operator ? `<tr><td><b>Operador:</b> ${payload.operator}</td></tr>` : ''}
          </table>
        </div>

        <table class="items-table">
          <thead>
            <tr style="border-bottom: 1px solid #000;">
              <th style="text-align: left; font-size: 11px; padding-bottom: 5px;">Item</th>
              <th style="text-align: center; font-size: 11px; padding-bottom: 5px;">Qtd</th>
              <th style="text-align: right; font-size: 11px; padding-bottom: 5px;">V.Unit</th>
              <th style="text-align: right; font-size: 11px; padding-bottom: 5px;">Total</th>
            </tr>
          </thead>
          <tbody>
            ${itemsHtml}
          </tbody>
        </table>

        <div class="totals">
          <table>
            <tr>
              <td style="font-size: 11px;">Subtotal:</td>
              <td style="text-align: right; font-size: 11px;">R$ ${(payload.financial?.subtotal || payload.subtotal || 0).toFixed(2)}</td>
            </tr>
            ${payload.financial?.discount || payload.discount ? `
            <tr>
              <td style="font-size: 11px;">Desconto:</td>
              <td style="text-align: right; font-size: 11px; color: red;">- R$ ${(payload.financial?.discount || payload.discount || 0).toFixed(2)}</td>
            </tr>
            ` : ''}
            ${payload.financial?.deliveryFee || payload.deliveryFee ? `
            <tr>
              <td style="font-size: 11px;">Taxa de Entrega:</td>
              <td style="text-align: right; font-size: 11px;">R$ ${(payload.financial?.deliveryFee || payload.deliveryFee || 0).toFixed(2)}</td>
            </tr>
            ` : ''}
            <tr style="font-weight: bold; font-size: 13px;">
              <td>TOTAL:</td>
              <td style="text-align: right;">R$ ${(payload.financial?.total || payload.total || 0).toFixed(2)}</td>
            </tr>
            ${payload.financial?.paymentMethod ? `
            <tr style="font-size: 11px;">
              <td>Forma de Pagto:</td>
              <td style="text-align: right;">${payload.financial.paymentMethod}</td>
            </tr>
            ` : ''}
          </table>
        </div>

        ${payload.notes ? `
        <div style="margin-top: 15px; border: 1px solid #eee; padding: 6px; font-size: 10px;">
          <b>Obs:</b> ${payload.notes}
        </div>
        ` : ''}

        <div class="footer">
          <p>Obrigado pela preferência!</p>
          <p>Volte sempre</p>
        </div>
      </body>
      </html>
    `;
  } else if (documentType === 'etiqueta') {
    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <style>
          body {
            font-family: Arial, sans-serif;
            color: #000;
            background-color: #fff;
            margin: 0;
            padding: 8px;
            font-size: 11px;
            line-height: 1.2;
            text-align: center;
          }
          .product-name {
            font-size: 12px;
            font-weight: bold;
            margin-bottom: 4px;
            text-transform: uppercase;
            word-wrap: break-word;
          }
          .brand {
            font-size: 9px;
            color: #666;
            margin-bottom: 4px;
          }
          .price-box {
            border: 2px solid #000;
            padding: 4px;
            display: inline-block;
            margin: 6px 0;
          }
          .price-val {
            font-size: 16px;
            font-weight: bold;
          }
          .barcode-box {
            margin-top: 6px;
            font-family: 'Courier New', Courier, monospace;
            font-size: 10px;
            letter-spacing: 2px;
          }
          .barcode-line {
            height: 24px;
            background: linear-gradient(90deg, #000 2px, transparent 2px, #000 4px, transparent 6px, #000 8px, transparent 9px, #000 12px, transparent 13px);
            margin: 0 auto 3px auto;
            width: 80%;
          }
        </style>
      </head>
      <body>
        <div class="product-name">${payload.name || payload.title || 'PRODUTO IMPRESSO'}</div>
        <div class="brand">${payload.brand || payload.category || ''}</div>
        
        <div class="price-box">
          <span style="font-size: 10px;">R$</span>
          <span class="price-val">${(payload.price || 0).toFixed(2)}</span>
        </div>

        <div class="barcode-box">
          <div class="barcode-line"></div>
          <div>${payload.code || payload.sku || 'EAN-123456'}</div>
        </div>
      </body>
      </html>
    `;
  } else {
    // Elegant fallback layout standard
    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <style>
          body {
            font-family: Arial, sans-serif;
            padding: 15px;
            font-size: 12px;
          }
          h1 {
            font-size: 16px;
            border-bottom: 1px solid #ccc;
            padding-bottom: 5px;
          }
          pre {
            background-color: #f7f7f7;
            padding: 10px;
            border-radius: 4px;
            font-size: 11px;
            white-space: pre-wrap;
          }
        </style>
      </head>
      <body>
        <h1>Documento de ${documentType.toUpperCase()}</h1>
        <pre>${JSON.stringify(payload, null, 2)}</pre>
      </body>
      </html>
    `;
  }
}

export const usePrintQueueStore = create<PrintQueueState>((set, get) => ({
  jobs: [],

  addPrintJob: (job) => {
    const newJob: PrintJob = {
      ...job,
      id: `job_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
      status: 'pendente',
      createdAt: new Date().toISOString()
    };
    set((state) => ({ jobs: [...state.jobs, newJob] }));
  },

  updateJobStatus: (id, status, error) => {
    set((state) => ({
      jobs: state.jobs.map((job) =>
        job.id === id ? { ...job, status, error } : job
      )
    }));
  },

  getPendingJob: () => {
    return get().jobs.find((job) => job.status === 'pendente');
  },

  processPendingJob: async () => {
    const pendingJob = get().getPendingJob();
    if (!pendingJob) return;

    const { id, documentType, payload, paperWidthMm, paperHeightMm } = pendingJob;
    get().updateJobStatus(id, 'processando');

    try {
      // 1. Compile clean document CSS/body HTML
      const html = generateCleanHtml(documentType, payload);

      // 2. Locate generic window.electron target API correctly
      if (
        window.electron &&
        typeof window.electron.printDocument === 'function'
      ) {
        console.log(`[PRINT-QUEUE-STORE] Initiating physical print document job ${id}`);
        const result = await window.electron.printDocument(html, paperWidthMm, paperHeightMm);
        
        if (result && result.success) {
          get().updateJobStatus(id, 'concluído');
        } else {
          throw new Error(result?.error || 'Erro reportado pelo driver nativo de impressão.');
        }
      } else {
        throw new Error('Canal de comunicação nativo window.electron.printDocument não encontrado no ambiente.');
      }
    } catch (err: any) {
      console.error(`[PRINT-QUEUE-STORE] Error processing job ${id}:`, err);
      get().updateJobStatus(id, 'erro', err instanceof Error ? err.message : String(err));
    }
  },

  clearJobs: () => {
    set({ jobs: [] });
  }
}));
