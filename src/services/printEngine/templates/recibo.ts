import { ReciboTermicoPayload, PrintEngineConfig } from '../documentTypes';
import { getThemeColors, buildWatermarkHtml, generateQrCodeSvg } from './shared';
import { resolveTemplateDimensions } from '../documentSizes';

export async function buildReciboHtml(
  payload: ReciboTermicoPayload,
  config: PrintEngineConfig,
  company: any,
  watermarkTheme?: any
): Promise<string> {
  const paperSize = config.paperSize || 'A6';
  const sizeConfig = resolveTemplateDimensions(paperSize);
  const themeName = config.theme || 'classic';
  const colors = getThemeColors(themeName, config?.customFields?.customColor || (config as any)?.customColor);

  // Extract company and layout visibility properties
  const companyName = payload.companyName || company?.name || "LUKASFE INDUSTRIAL LTDA";
  const companyCnpj = payload.companyCnpj || company?.document || "00.000.000/0001-00";
  const companyAddress = payload.companyAddress || (company?.address 
    ? `${company.address.street}, ${company.address.number} - ${company.address.neighborhood}, ${company.address.city} - ${company.address.state}`
    : "Praça da Sé, 100 - Sé, São Paulo - SP");
  const companyPhone = payload.companyPhone || company?.phone || "(11) 4002-8922";
  const headerLogoUrl = payload.headerLogoUrl || company?.logo;

  const showHeader = config.customFields?.showHeader !== false;
  const showSaleOperation = config.customFields?.showSaleOperation !== false;

  // Render sizing specifications
  const isSheet = sizeConfig.type === 'sheet';
  const widthMm = sizeConfig.widthMm;
  const heightMm = sizeConfig.heightMm;

  // Pre-calculate display metrics
  const surcharge = payload.financial?.surcharge || 0;
  const displayTotal = (payload.financial?.subtotal || 0) - (payload.financial?.discount || 0) + (payload.financial?.deliveryFee || 0) + surcharge;

  // Layout Metric adaptations per paper size
  const metricConfigs: Record<string, {
    padding: string;
    baseSize: string;
    badgeSize: string;
    headerTitleSize: string;
    headerDetailsSize: string;
    paymentTitleSize: string;
    paymentSubSize: string;
    clientHeaderSize: string;
    clientNameSize: string;
    tableHeaderSize: string;
    tableRowSize: string;
    financialSize: string;
    totalSize: string;
    paymentInfoSize: string;
    notesSize: string;
    maxWidth: string;
    mb: string;
    space: string;
  }> = {
    A4: {
      padding: '30px',
      baseSize: '13px',
      badgeSize: '11px',
      headerTitleSize: '18px',
      headerDetailsSize: '10.5px',
      paymentTitleSize: '14px',
      paymentSubSize: '12.5px',
      clientHeaderSize: '9.5px',
      clientNameSize: '13.5px',
      tableHeaderSize: '11px',
      tableRowSize: '12px',
      financialSize: '12px',
      totalSize: '15px',
      paymentInfoSize: '12px',
      notesSize: '10.5px',
      maxWidth: '100%',
      mb: '16px',
      space: '4px'
    },
    A5: {
      padding: '24px',
      baseSize: '12px',
      badgeSize: '10.5px',
      headerTitleSize: '16px',
      headerDetailsSize: '10px',
      paymentTitleSize: '13px',
      paymentSubSize: '11.5px',
      clientHeaderSize: '9px',
      clientNameSize: '12.5px',
      tableHeaderSize: '10px',
      tableRowSize: '11px',
      financialSize: '11px',
      totalSize: '14px',
      paymentInfoSize: '11px',
      notesSize: '10px',
      maxWidth: '115mm',
      mb: '12px',
      space: '4px'
    },
    A6: {
      padding: '10px',
      baseSize: '9.5px',
      badgeSize: '8px',
      headerTitleSize: '12px',
      headerDetailsSize: '7.5px',
      paymentTitleSize: '10px',
      paymentSubSize: '9px',
      clientHeaderSize: '7px',
      clientNameSize: '9.5px',
      tableHeaderSize: '8px',
      tableRowSize: '8.5px',
      financialSize: '8.5px',
      totalSize: '11px',
      paymentInfoSize: '8.5px',
      notesSize: '7.5px',
      maxWidth: '100%',
      mb: '7px',
      space: '2px'
    },
    '80mm': {
      padding: '12px',
      baseSize: '11px',
      badgeSize: '9.5px',
      headerTitleSize: '14px',
      headerDetailsSize: '10px',
      paymentTitleSize: '12px',
      paymentSubSize: '11px',
      clientHeaderSize: '9px',
      clientNameSize: '12px',
      tableHeaderSize: '10px',
      tableRowSize: '10px',
      financialSize: '10px',
      totalSize: '13px',
      paymentInfoSize: '10px',
      notesSize: '9px',
      maxWidth: '100%',
      mb: '12px',
      space: '3px'
    },
    '58mm': {
      padding: '6px',
      baseSize: '8.5px',
      badgeSize: '7.5px',
      headerTitleSize: '11px',
      headerDetailsSize: '8.5px',
      paymentTitleSize: '9.5px',
      paymentSubSize: '8.5px',
      clientHeaderSize: '7.5px',
      clientNameSize: '9.5px',
      tableHeaderSize: '8px',
      tableRowSize: '8px',
      financialSize: '8px',
      totalSize: '11px',
      paymentInfoSize: '8px',
      notesSize: '7.5px',
      maxWidth: '100%',
      mb: '8px',
      space: '2px'
    }
  };

  const m = metricConfigs[paperSize] || metricConfigs['A6'];

  // Map watermark HTML
  const watermarkHtml = buildWatermarkHtml(config, watermarkTheme, false);

  // Client Details Block (Properly fixed Bug #8)
  let clientHtml = '';
  if (showSaleOperation && payload.client && (payload.client.name || payload.client.document)) {
    clientHtml = `
      <div class="client-block" style="margin-bottom: ${m.mb}; padding-bottom: 6px; border-bottom: 1px dashed #d4d4d8; font-size: calc(${m.baseSize} - 1px);">
        <p class="client-header" style="margin: 0; font-weight: 800; font-size: ${m.clientHeaderSize}; text-transform: uppercase;">Destinatário / Cliente</p>
        ${payload.client.name ? `<p class="client-name" style="margin: 2px 0 0 0; font-weight: 900; font-size: ${m.clientNameSize};">${payload.client.name}</p>` : ''}
        ${payload.client.document ? `<p class="client-detail" style="margin: 2px 0 0 0; font-weight: normal;">CPF/CNPJ: ${payload.client.document}</p>` : ''}
        ${payload.client.phone ? `<p class="client-detail" style="margin: 2px 0 0 0; font-weight: normal;">Fone: ${payload.client.phone}</p>` : ''}
        ${payload.client.email ? `<p class="client-detail" style="margin: 2px 0 0 0; font-weight: normal; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">E-mail: ${payload.client.email}</p>` : ''}
      </div>
    `;
  }

  // Items table rows
  const itemsRows = payload.items.map(item => `
    <tr style="border-bottom: 1px solid #f4f4f5;">
      <td style="padding: ${m.space} 0; font-family: monospace;">${item.code}</td>
      <td style="padding: ${m.space} 0; font-weight: 600; text-transform: uppercase;">${item.description}</td>
      <td style="padding: ${m.space} 0; text-align: center; font-family: monospace;">${item.qty}</td>
      <td style="padding: ${m.space} 0; text-align: right; font-family: monospace;">R$ ${item.price.toFixed(2)}</td>
      <td style="padding: ${m.space} 0; text-align: right; font-family: monospace; font-weight: 900; border-left: 1px solid #f4f4f5; padding-left: 4px;">R$ ${item.total.toFixed(2)}</td>
    </tr>
  `).join('');

  // Discount Block
  const discountHtml = (payload.financial?.discount || 0) > 0
    ? `<div class="financial-row" style="color: #c2410c; font-weight: bold;">
         <span>Desconto concedido:</span>
         <span style="font-family: monospace;">- R$ ${(payload.financial?.discount || 0).toFixed(2)}</span>
       </div>`
    : '';

  // Surcharge Block
  const surchargeHtml = surcharge > 0
    ? `<div class="financial-row" style="font-weight: bold;">
         <span>Acréscimos / Juros:</span>
         <span style="font-family: monospace;">R$ ${surcharge.toFixed(2)}</span>
       </div>`
    : '';

  // Delivery Fee Block
  const deliveryHtml = (payload.financial?.deliveryFee || 0) > 0
    ? `<div class="financial-row">
         <span>Frete / Taxa de Entrega:</span>
         <span style="font-family: monospace;">R$ ${(payload.financial?.deliveryFee || 0).toFixed(2)}</span>
       </div>`
    : '';

  // Payment details box
  let paymentInfoHtml = '';
  if (showSaleOperation) {
    paymentInfoHtml = `
      <div class="payment-box" style="margin-bottom: ${m.mb}; padding: 6px; border: 1px solid #e4e4e7; border-radius: 6px; background-color: ${colors.bgAccent}; font-family: monospace; font-size: ${m.paymentInfoSize};">
        <div style="display: flex; justify-content: space-between; font-weight: bold; border-bottom: 1px solid #e4e4e7; padding-bottom: 4px; margin-bottom: 4px;">
          <span>PAGO VIA:</span>
          <span>${payload.financial?.paymentMethod || "Não informado"}</span>
        </div>
        <div style="display: flex; justify-content: space-between; margin-bottom: 2px;">
          <span>Valor Recebido:</span>
          <span>R$ ${(payload.financial?.receivedAmount || 0).toFixed(2)}</span>
        </div>
        <div style="display: flex; justify-content: space-between;">
          <span>Troco Devolvido:</span>
          <span style="font-weight: 900; color: ${colors.textAccent};">R$ ${(payload.financial?.changeAmount || 0).toFixed(2)}</span>
        </div>
      </div>
    `;
  }

  // Header Logo Box HTML
  let logoHtml = '';
  if (headerLogoUrl) {
    const logoHeightWidth = '40px';
    logoHtml = `
      <div style="flex-shrink: 0; align-self: flex-start;">
        <img 
          src="${headerLogoUrl}" 
          alt="Logo" 
          style="width: ${logoHeightWidth}; height: ${logoHeightWidth}; object-fit: contain; background: transparent; border: none;"
          referrerpolicy="no-referrer"
        />
      </div>
    `;
  }

  // Header Content HTML
  let headerHtml = '';
  if (showHeader) {
    headerHtml = `
      <div class="header-section" style="margin-bottom: ${m.mb}; padding-bottom: 6px; border-bottom: 1px dashed #d4d4d8;">
        <div style="display: flex; align-items: flex-start; justify-content: space-between; gap: 12px;">
          <div style="flex-1: 1 0px; min-width: 0;">
            <h2 style="margin: 0; font-weight: 900; text-transform: uppercase; letter-spacing: 0.5px; line-height: 1.2; color: ${colors.textAccent}; font-size: ${m.headerTitleSize};">${companyName}</h2>
            ${company?.slogan ? `<p style="margin: 2px 0; font-style: italic; text-transform: uppercase; font-weight: 900; font-size: calc(${m.headerTitleSize} * 0.55);">${company.slogan}</p>` : ''}
            <div style="font-size: ${m.headerDetailsSize}; font-weight: normal; margin-top: 4px;">
              <p style="margin: 0 0 2px 0; font-weight: bold;">CNPJ: ${companyCnpj}</p>
              <p style="margin: 0 0 2px 0; line-height: 1.2;">${companyAddress}</p>
              ${companyPhone ? `<p style="margin: 0;">Fone: ${companyPhone}</p>` : ''}
            </div>
          </div>
          ${logoHtml}
        </div>
        ${showSaleOperation ? `
          <div style="display: flex; justify-content: space-between; margin-top: 6px; padding-top: 4px; border-top: 1px solid #e4e4e7; font-size: calc(${m.baseSize} - 1.5px); font-weight: bold;">
            <span>OP: ${payload.operator}</span>
            <span style="font-family: monospace;">${payload.date}</span>
          </div>
        ` : ''}
      </div>
    `;
  }

  // Dynamic CSS variables and specific page rule from size config
  const isAutoHeight = heightMm === 'auto';
  const heightCss = isAutoHeight ? '297mm' : `${heightMm}mm`;

  return `<!DOCTYPE html>
<html lang="pt-BR" style="background-color: white !important;">
<head>
  <meta charset="UTF-8">
  <title>Recibo de Pagamento - Lukasfe ERP</title>
  <style>
    @page {
      size: ${widthMm}mm ${heightCss};
      margin: 0 !important;
    }
    * {
      -webkit-print-color-adjust: exact !important;
      print-color-adjust: exact !important;
      color-adjust: exact !important;
      box-sizing: border-box !important;
    }
    html, body {
      background-color: white !important;
      color: black !important;
      margin: 0 !important;
      padding: 0 !important;
      font-family: ui-sans-serif, system-ui, sans-serif !important;
      -webkit-font-smoothing: antialiased;
    }
    body {
      width: ${widthMm}mm;
      height: auto;
      ${isSheet && !isAutoHeight ? `min-height: ${heightMm}mm; max-height: ${heightMm}mm;` : ''}
      padding: ${sizeConfig.marginMm}mm;
      font-size: ${m.baseSize};
      line-height: 1.4;
      margin: 0 !important;
      overflow: hidden;
      page-break-after: avoid;
      break-after: avoid;
    }
    .container {
      width: 100%;
      height: auto;
      ${isSheet && !isAutoHeight ? `min-height: calc(${heightMm}mm - ${sizeConfig.marginMm * 2}mm);` : ''}
      max-width: ${m.maxWidth};
      margin: 0 auto;
      padding: ${m.padding};
      position: relative;
      overflow: hidden;
      page-break-inside: avoid;
      break-inside: avoid;
    }
    @media print {
      html {
        ${isSheet && !isAutoHeight ? `height: ${heightMm}mm; overflow: hidden;` : 'height: auto;'}
      }
      body {
        height: auto !important;
        ${isSheet && !isAutoHeight ? `max-height: ${heightMm}mm !important;` : ''}
        overflow: hidden !important;
        page-break-after: avoid !important;
        break-after: avoid !important;
      }
    }
    .title-banner {
      text-align: center;
      margin-bottom: ${m.mb};
    }
    .title-text {
      display: block;
      font-weight: 900;
      text-transform: uppercase;
      letter-spacing: 1px;
      padding: 4px;
      border: 1px solid ${colors.borderAccent};
      color: ${colors.textAccent};
      font-size: ${m.paymentTitleSize};
    }
    .title-sub {
      margin: 4px 0 0 0;
      font-weight: 900;
      font-size: ${m.paymentSubSize};
    }
    .financial-row {
      display: flex;
      justify-content: space-between;
      margin-bottom: 2px;
    }
    .total-banner {
      display: flex;
      justify-content: space-between;
      padding-top: 4px;
      margin-top: 4px;
      font-weight: 900;
      font-size: ${m.totalSize};
      ${colors.totalContainer}
    }
    .total-value {
      font-family: monospace;
      color: ${colors.totalText};
    }
    .items-table {
      width: 100%;
      border-collapse: collapse;
      margin-bottom: ${m.mb};
    }
    .items-table th {
      border-bottom: 1px solid ${colors.borderAccent};
      font-size: ${m.tableHeaderSize};
      font-weight: 900;
      text-transform: uppercase;
      padding-bottom: 4px;
      text-align: left;
    }
    .items-table td {
      font-size: ${m.tableRowSize};
    }
  </style>
</head>
<body>
  <div class="container">
    ${watermarkHtml}
    <div style="position: relative; z-index: 10; width: 100%;">
      ${headerHtml}
      
      <div class="title-banner">
        <span class="title-text">COMPROVANTE DE PAGAMENTO</span>
        ${showSaleOperation 
          ? `<p class="title-sub">CUPOM NÚMERO: #${payload.orderNumber}</p>` 
          : `<p class="title-sub">CUPOM DE PAGAMENTO ATIVO</p>`
        }
      </div>

      ${clientHtml}

      <table class="items-table">
        <thead>
          <tr>
            <th style="width: 15%;">Cód</th>
            <th style="width: 45%;">Descrição</th>
            <th style="width: 12%; text-align: center;">Qtd</th>
            <th style="width: 13%; text-align: right;">V.Un</th>
            <th style="width: 15%; text-align: right;">Total</th>
          </tr>
        </thead>
        <tbody>
          ${itemsRows}
        </tbody>
      </table>

      <div style="margin-bottom: ${m.mb}; padding-top: 4px; border-top: 1px dashed #d4d4d8; font-size: ${m.financialSize};">
        <div class="financial-row">
          <span style="font-weight: bold;">Subtotal:</span>
          <span style="font-family: monospace;">R$ ${(payload.financial?.subtotal || 0).toFixed(2)}</span>
        </div>
        ${discountHtml}
        ${surchargeHtml}
        ${deliveryHtml}
        <div class="total-banner">
          <span>TOTAL REAL PAGO:</span>
          <span class="total-value">R$ ${displayTotal.toFixed(2)}</span>
        </div>
      </div>

      ${paymentInfoHtml}

      ${payload.notes ? `
        <div class="notes-section" style="text-align: center; padding-top: 6px; margin-top: 6px; border-top: 1px dashed #d4d4d8; font-weight: 900; text-transform: uppercase; font-size: ${m.notesSize};">
          ${payload.notes}
        </div>
      ` : ''}

      <div class="footer-attribution" style="text-align: center; margin-top: 12px; font-weight: 900; text-transform: uppercase; letter-spacing: 0.5px; font-size: calc(${m.notesSize} - 1.5px); color: #71717a;">
        Lukasfe ERP - Impressão Térmica Direta
      </div>
    </div>
  </div>
</body>
</html>`;
}
