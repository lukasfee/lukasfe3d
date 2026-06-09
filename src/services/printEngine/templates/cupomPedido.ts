import { CupomPedidoPayload, PrintEngineConfig } from '../documentTypes';
import { getThemeColors, buildWatermarkHtml, generateQrCodeSvg } from './shared';
import { resolveTemplateDimensions } from '../documentSizes';

export async function buildCupomPedidoHtml(
  payload: CupomPedidoPayload,
  config: PrintEngineConfig,
  company: any,
  watermarkTheme?: any
): Promise<string> {
  const paperSize = config.paperSize || '80mm';
  const sizeConfig = resolveTemplateDimensions(paperSize);
  const themeName = config.theme || 'classic';
  const colors = getThemeColors(themeName, config?.customFields?.customColor || (config as any)?.customColor);

  // Extract company context
  const companyName = payload.companyName || company?.name || "LUKASFE INDUSTRIAL LTDA";
  const companyCnpj = payload.companyCnpj || company?.document || "00.000.000/0001-00";
  const companyAddress = payload.companyAddress || (company?.address 
    ? `${company.address.street}, ${company.address.number} - ${company.address.neighborhood}, ${company.address.city} - ${company.address.state}`
    : "Praça da Sé, 100 - Sé, São Paulo - SP");
  const companyPhone = payload.companyPhone || company?.phone || "(11) 4002-8922";
  const headerLogoUrl = payload.headerLogoUrl || company?.logo;

  // Render sizing specifications
  const isSheet = sizeConfig.type === 'sheet';
  const widthMm = sizeConfig.widthMm;
  const heightMm = sizeConfig.heightMm;

  // Metric adaptations per paper size
  const metricConfigs: Record<string, {
    containerPadding: string;
    baseSize: string;
    badgeSize: string;
    titleSize: string;
    subSize: string;
    deliveryTitleSize: string;
    deliveryTextSize: string;
    metaBg: string;
    metaTextSize: string;
    clientHeaderSize: string;
    clientNameSize: string;
    itemsHeaderSize: string;
    tableTextSize: string;
    obsTextSize: string;
    maxWidth: string;
    mb: string;
    space: string;
    tablePadding: string;
    qrSize: string;
  }> = {
    A4: {
      containerPadding: '30px',
      baseSize: '13px',
      badgeSize: '11px',
      titleSize: '18px',
      subSize: '11px',
      deliveryTitleSize: '11px',
      deliveryTextSize: '13px',
      metaBg: 'padding: 16px; gap: 16px; border-radius: 12px;',
      metaTextSize: '11px',
      clientHeaderSize: '10px',
      clientNameSize: '14px',
      itemsHeaderSize: '12px',
      tableTextSize: '12px',
      obsTextSize: '12px',
      maxWidth: '100%',
      mb: '16px',
      space: '4px',
      tablePadding: '8px',
      qrSize: '120px'
    },
    A5: {
      containerPadding: '24px',
      baseSize: '12px',
      badgeSize: '10px',
      titleSize: '16px',
      subSize: '10px',
      deliveryTitleSize: '10px',
      deliveryTextSize: '12px',
      metaBg: 'padding: 12px; gap: 12px; border-radius: 12px;',
      metaTextSize: '10px',
      clientHeaderSize: '9px',
      clientNameSize: '13px',
      itemsHeaderSize: '11px',
      tableTextSize: '11px',
      obsTextSize: '11px',
      maxWidth: '115mm',
      mb: '12px',
      space: '4px',
      tablePadding: '6px',
      qrSize: '100px'
    },
    A6: {
      containerPadding: '10px',
      baseSize: '9.5px',
      badgeSize: '8px',
      titleSize: '12px',
      subSize: '9px',
      deliveryTitleSize: '7.5px',
      deliveryTextSize: '9.5px',
      metaBg: 'padding: 4px; gap: 4px; border-radius: 6px;',
      metaTextSize: '8px',
      clientHeaderSize: '7px',
      clientNameSize: '9.5px',
      itemsHeaderSize: '8px',
      tableTextSize: '8.5px',
      obsTextSize: '7.5px',
      maxWidth: '100%',
      mb: '7px',
      space: '2px',
      tablePadding: '2px',
      qrSize: '80px'
    },
    '80mm': {
      containerPadding: '12px',
      baseSize: '11px',
      badgeSize: '9.5px',
      titleSize: '13px',
      subSize: '9.5px',
      deliveryTitleSize: '9.5px',
      deliveryTextSize: '11px',
      metaBg: 'padding: 8px; gap: 8px; border-radius: 8px;',
      metaTextSize: '9.5px',
      clientHeaderSize: '8px',
      clientNameSize: '12px',
      itemsHeaderSize: '11px',
      tableTextSize: '10px',
      obsTextSize: '10px',
      maxWidth: '100%',
      mb: '12px',
      space: '3px',
      tablePadding: '6px',
      qrSize: '90px'
    },
    '58mm': {
      containerPadding: '6px',
      baseSize: '8.5px',
      badgeSize: '7.5px',
      titleSize: '11px',
      subSize: '7.5px',
      deliveryTitleSize: '7.5px',
      deliveryTextSize: '9px',
      metaBg: 'padding: 4px; gap: 4px; border-radius: 6px;',
      metaTextSize: '7.5px',
      clientHeaderSize: '7px',
      clientNameSize: '9.5px',
      itemsHeaderSize: '8px',
      tableTextSize: '8px',
      obsTextSize: '8px',
      maxWidth: '100%',
      mb: '8px',
      space: '2px',
      tablePadding: '4px',
      qrSize: '70px'
    }
  };

  const m = metricConfigs[paperSize] || metricConfigs['80mm'];

  const qrCodeValue = payload.orderId || payload.orderNumber || '00000';
  const qrCodeSvg = await generateQrCodeSvg(qrCodeValue);
  const watermarkHtml = buildWatermarkHtml(config, watermarkTheme, false);

  // Logo Box helper
  let logoHtml = '';
  if (headerLogoUrl) {
    logoHtml = `
      <div style="flex-shrink: 0; align-self: flex-start;">
        <img 
          src="${headerLogoUrl}" 
          alt="Logo" 
          style="width: 44px; height: 44px; object-fit: contain; pointer-events: none; background: transparent; border: none;"
          referrerpolicy="no-referrer"
        />
      </div>
    `;
  }

  // Items table check rows
  const itemsCheckRows = payload.items.map((item, idx) => `
    <tr style="border-bottom: ${idx < payload.items.length - 1 ? '1px solid #e4e4e7' : 'none'};">
      <td style="padding: ${m.tablePadding} 0; font-family: monospace; font-weight: bold;">${item.code}</td>
      <td style="padding: ${m.tablePadding} 4px; font-weight: 750; text-transform: uppercase;">${item.description}</td>
      <td style="padding: ${m.tablePadding} 0; text-align: right; font-family: monospace; font-weight: 900; font-size: calc(${m.tableTextSize} + 1px);">${item.unit || 'UN'}/${item.qty}</td>
      <td style="padding: ${m.tablePadding} 0; text-align: right; font-family: monospace; font-weight: 900; color: ${colors.textAccent}; text-transform: uppercase;">${item.location || "Sem localização"}</td>
    </tr>
  `).join('');

  // Sizing criteria for narrow bobines
  const isBobine = paperSize === '58mm' || paperSize === '80mm';
  const clientsGridHtml = isBobine
    ? `
      <!-- Single Column Flex Layout for Bobines to prevent horizontal cutoffs -->
      <div style="display: flex; flex-direction: column; gap: 8px; text-align: left; margin-bottom: ${m.mb};">
        <!-- Client details -->
        <div style="border: 1px solid #e4e4e7; border-radius: 6px; padding: 10px; width: 100%; font-size: ${m.tableTextSize};">
          <div style="border-bottom: 1px solid #f4f4f5; padding-bottom: 4px; margin-bottom: 4px;">
            <p style="margin: 0; font-weight: 850; font-size: ${m.clientHeaderSize}; text-transform: uppercase; color: #71717a;">Cliente e Contato</p>
            <p style="margin: 2px 0 0 0; font-weight: 900; font-size: ${m.clientNameSize}; color: #000000;">${payload.client.name || 'Cliente não informado'}</p>
            <p style="margin: 2px 0 0 0; font-family: monospace; font-weight: bold;">Fone: ${payload.client.phone || 'Telefone não informado'}</p>
            ${payload.client.document ? `<p style="margin: 2px 0 0 0; font-family: monospace; font-size: calc(${m.tableTextSize} - 1px);">Doc: ${payload.client.document}</p>` : ''}
          </div>

          <div style="margin-top: 6px;">
            <p style="margin: 0; font-weight: 850; font-size: ${m.clientHeaderSize}; text-transform: uppercase; color: #71717a;">Endereço de Entrega</p>
            ${payload.client.address ? `
              <p style="margin: 2px 0 0 0; font-weight: bold; color: #000000;">
                ${payload.client.address.street || 'Rua não informada'}${payload.client.address.number ? `, ${payload.client.address.number}` : ''}
              </p>
              <p style="margin: 1px 0 0 0; font-weight: normal;">
                ${payload.client.address.neighborhood || 'Bairro ñ inf.'} - ${payload.client.address.city || 'Cidade ñ inf.'}/${payload.client.address.state || 'UF'}
              </p>
              <p style="margin: 1px 0 0 0; font-family: monospace; font-size: calc(${m.tableTextSize} - 1px);">CEP: ${payload.client.address.zipCode || '00000-000'}</p>
              ${payload.client.address.ref ? `<p style="margin: 4px 0 0 0; font-style: italic; font-weight: bold; color: #451a03;">Ref: ${payload.client.address.ref}</p>` : ''}
            ` : `
              <p style="margin: 2px 0 0 0; font-style: italic; font-weight: bold;">Endereço não informado</p>
            `}
          </div>

          <div style="margin-top: 6px; padding-top: 6px; border-top: 1px dashed #e4e4e7; font-size: ${m.metaTextSize}; text-transform: uppercase;">
            <p style="margin: 0 0 2px 0;"><span style="font-weight: bold;">Vendedor Emissor:</span> <span style="font-weight: 900;">${payload.sellerName}</span></p>
            ${payload.pickerName ? `<p style="margin: 0;"><span style="font-weight: bold;">Separador Técnico:</span> <span style="font-weight: 900;">${payload.pickerName}</span></p>` : ''}
          </div>
        </div>

        <!-- Order card + QR Code inside colors box -->
        <div style="border: 1px solid #e4e4e7; border-radius: 6px; padding: 12px; display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center; background-color: ${colors.bgAccent};">
          <div style="background-color: white; padding: 4px; border: 1px solid #d4d4d8; border-radius: 8px; width: ${m.qrSize}; height: ${m.qrSize}; display: flex; align-items: center; justify-content: center; margin-bottom: 8px;">
            ${qrCodeSvg}
          </div>
          <div style="line-height: 1.2;">
            <span style="font-size: 7px; font-weight: 950; text-transform: uppercase;">Spooler ID</span>
            <h3 style="margin: 2px 0 0 0; font-weight: 900; font-size: calc(${m.titleSize} + 2px); color: #000000;">#${payload.orderNumber}</h3>
          </div>
        </div>
      </div>
    `
    : `
      <!-- Table Grid (columns) Layout for wider sheets A4/A5 -->
      <div style="display: grid; grid-template-columns: repeat(12, 1fr); gap: 12px; text-align: left; margin-bottom: ${m.mb};">
        <div style="grid-column: span 8; border: 1px solid #e4e4e7; border-radius: 6px; padding: 12px; font-size: ${m.tableTextSize}; display: flex; flex-direction: column; justify-content: space-between;">
          <div>
            <div style="border-bottom: 1px solid #f4f4f5; padding-bottom: 6px; margin-bottom: 6px;">
              <p style="margin: 0; font-weight: 850; font-size: ${m.clientHeaderSize}; text-transform: uppercase; color: #71717a;">Cliente e Contato</p>
              <p style="margin: 2px 0 0 0; font-weight: 900; font-size: ${m.clientNameSize}; color: #000000;">${payload.client.name || 'Cliente não informado'}</p>
              <p style="margin: 2px 0 0 0; font-family: monospace; font-weight: bold;">Fone: ${payload.client.phone || 'Telefone não informado'}</p>
              ${payload.client.document ? `<p style="margin: 2px 0 0 0; font-family: monospace; font-size: calc(${m.tableTextSize} - 1px);">Doc: ${payload.client.document}</p>` : ''}
            </div>

            <div>
              <p style="margin: 0; font-weight: 850; font-size: ${m.clientHeaderSize}; text-transform: uppercase; color: #71717a;">Endereço de Entrega</p>
              ${payload.client.address ? `
                <p style="margin: 2px 0 0 0; font-weight: bold; color: #000000;">
                  ${payload.client.address.street || 'Rua não informada'}${payload.client.address.number ? `, ${payload.client.address.number}` : ''}
                </p>
                <p style="margin: 1px 0 0 0; font-weight: normal;">
                  ${payload.client.address.neighborhood || 'Bairro ñ inf.'} - ${payload.client.address.city || 'Cidade ñ inf.'}/${payload.client.address.state || 'UF'}
                </p>
                <p style="margin: 1px 0 0 0; font-family: monospace; font-size: calc(${m.tableTextSize} - 1px);">CEP: ${payload.client.address.zipCode || '00000-000'}</p>
                ${payload.client.address.ref ? `<p style="margin: 4px 0 0 0; font-style: italic; font-weight: bold; color: #451a03;">Ref: ${payload.client.address.ref}</p>` : ''}
              ` : `
                <p style="margin: 2px 0 0 0; font-style: italic; font-weight: bold;">Endereço não informado</p>
              `}
            </div>
          </div>

          <div style="margin-top: 8px; padding-top: 8px; border-top: 1px dashed #e4e4e7; display: grid; grid-template-columns: 1fr 1fr; gap: 8px; font-size: ${m.metaTextSize}; text-transform: uppercase;">
            <div>
              <p style="margin: 0; color: #71717a; font-weight: bold;">Vendedor Emissor:</p>
              <p style="margin: 2px 0 0 0; font-weight: 900; color: #000000;">${payload.sellerName}</p>
            </div>
            ${payload.pickerName ? `
              <div>
                <p style="margin: 0; color: #71717a; font-weight: bold;">Separador Técnico:</p>
                <p style="margin: 2px 0 0 0; font-weight: 900; color: #000000;">${payload.pickerName}</p>
              </div>
            ` : ''}
          </div>
        </div>

        <div style="grid-column: span 4; border: 1px solid #e4e4e7; border-radius: 6px; padding: 12px; display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center; background-color: ${colors.bgAccent};">
          <div style="background-color: white; padding: 6px; border: 1px solid #d4d4d8; border-radius: 8px; width: ${m.qrSize}; height: ${m.qrSize}; display: flex; align-items: center; justify-content: center; margin-bottom: 8px;">
            ${qrCodeSvg}
          </div>
          <div style="line-height: 1.2;">
            <span style="font-size: 7.5px; font-weight: 950; text-transform: uppercase;">Spooler ID</span>
            <h3 style="margin: 2px 0 0 0; font-weight: 900; font-size: calc(${m.titleSize} + 3px); color: #000000;">#${payload.orderNumber}</h3>
          </div>
        </div>
      </div>
    `;

  const isAutoHeight = heightMm === 'auto';
  const heightCss = isAutoHeight ? '297mm' : `${heightMm}mm`;

  return `<!DOCTYPE html>
<html lang="pt-BR" style="background-color: white !important;">
<head>
  <meta charset="UTF-8">
  <title>Via de Separação - Lukasfe ERP</title>
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
      padding: ${m.containerPadding};
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
    .separation-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      border-bottom: 2px solid #000000;
      padding-bottom: 8px;
      margin-bottom: ${m.mb};
    }
    .separation-badge {
      font-size: ${m.subSize};
      font-weight: 900;
      background-color: ${colors.badgeBg};
      color: ${colors.badgeText};
      border-radius: 4px;
      padding: 2px 6px;
      text-transform: uppercase;
      display: inline-block;
      margin-bottom: 4px;
    }
    .delivery-method {
      text-align: right;
    }
    .delivery-title {
      font-size: ${m.deliveryTitleSize};
      font-weight: 900;
      text-transform: uppercase;
      color: #71717a;
    }
    .delivery-text {
      font-size: ${m.deliveryTextSize};
      font-weight: 900;
      text-transform: uppercase;
    }
    .items-title {
      font-weight: 900;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      background-color: ${colors.bgAccent};
      border-bottom: 1px solid #18181b;
      padding: 4px 8px;
      margin-bottom: 8px;
      font-size: ${m.itemsHeaderSize};
      text-align: left;
    }
    .items-table {
      width: 100%;
      border-collapse: collapse;
      margin-bottom: ${m.mb};
    }
    .items-table th {
      border-bottom: 1px solid #71717a;
      font-size: calc(${m.tableTextSize} - 1px);
      font-weight: bold;
      text-transform: uppercase;
      padding-bottom: 4px;
      text-align: left;
    }
    .items-table td {
      font-size: ${m.tableTextSize};
    }
  </style>
</head>
<body>
  <div class="container">
    ${watermarkHtml}
    <div style="position: relative; z-index: 10; width: 100%;">
      
      <!-- Sep Header Info Block -->
      <div class="separation-header">
        <div>
          <span class="separation-badge">VIA DE SEPARAÇÃO</span>
          <p style="margin: 0; font-size: ${m.subSize}; font-weight: normal;">
            <span style="font-weight: bold;">Impresso em:</span> ${payload.date}
          </p>
        </div>
        <div class="delivery-method">
          <span class="delivery-title">Entrega</span>
          <p class="delivery-text" style="color: ${colors.textAccent};">${payload.deliveryMethod || "Retirada"}</p>
        </div>
      </div>

      <!-- Company Identity details -->
      <div style="margin-bottom: ${m.mb}; padding-bottom: 10px; border-bottom: 1px solid #18181b; display: flex; align-items: center; gap: 12px; text-align: left;">
        ${logoHtml}
        <div style="flex: 1; min-width: 0;">
          <h4 style="margin: 0; font-weight: 900; text-transform: uppercase; color: ${colors.textAccent}; font-size: ${m.clientNameSize};">${companyName}</h4>
          ${company?.slogan ? `<p style="margin: 2px 0; font-style: italic; text-transform: uppercase; font-weight: 900; font-size: calc(${m.clientNameSize} * 0.55);">${company.slogan}</p>` : ''}
          <p style="margin: 4px 0 0 0; font-size: ${m.subSize}; font-weight: normal;"><span style="font-weight: bold;">CNPJ:</span> ${companyCnpj}</p>
          <p style="margin: 2px 0 0 0; font-size: ${m.subSize}; font-weight: normal; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${companyAddress}</p>
          ${companyPhone ? `<p style="margin: 2px 0 0 0; font-size: ${m.subSize}; font-weight: normal;"><span style="font-weight: bold;">Fone:</span> ${companyPhone}</p>` : ''}
        </div>
      </div>

      <!-- Responsive Grid for Client and QR Code -->
      ${clientsGridHtml}

      <!-- Items Checklist Section -->
      <div style="display: block; margin-bottom: ${m.mb};">
        <h4 class="items-title">Lista de Itens para Separação</h4>
        <table class="items-table">
          <thead>
            <tr>
              <th style="width: 12%;">Cód</th>
              <th style="width: 38%;">Descrição</th>
              <th style="width: 12%; text-align: right;">UND/QTD</th>
              <th style="width: 38%; text-align: right;">WMS Local</th>
            </tr>
          </thead>
          <tbody>
            ${itemsCheckRows}
          </tbody>
        </table>
      </div>

      <!-- Remarks / Observations block -->
      ${payload.observations ? `
        <div style="padding: 8px; background-color: #fffbeb; border: 1px solid #fef3c7; border-radius: 4px; font-style: italic; text-align: left; margin-bottom: ${m.mb}; font-size: ${m.tableTextSize};">
          <span style="font-weight: 900; font-style: normal; text-transform: uppercase; font-size: ${m.clientHeaderSize}; display: block; color: #78350f;">
            Observações Críticas do Pedido
          </span>
          "${payload.observations}"
        </div>
      ` : ''}

      <!-- Manual confirmation fields -->
      <div style="padding: 10px 0; border-top: 1px dashed #71717a; display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; text-transform: uppercase; font-weight: 900; font-size: calc(${m.tableTextSize} - 2.2px); text-align: center;">
        <div style="display: flex; align-items: center; justify-content: center; gap: 6px;">
          <div style="width: 14px; height: 14px; border: 2px solid #000000; border-radius: 2px; background-color: white;"></div>
          <span>Triado</span>
        </div>
        <div style="display: flex; align-items: center; justify-content: center; gap: 6px;">
          <div style="width: 14px; height: 14px; border: 2px solid #000000; border-radius: 2px; background-color: white;"></div>
          <span>Contado</span>
        </div>
        <div style="display: flex; align-items: center; justify-content: center; gap: 6px;">
          <div style="width: 14px; height: 14px; border: 2px solid #000000; border-radius: 2px; background-color: white;"></div>
          <span>Embalado</span>
        </div>
      </div>

      <!-- Direct Auditory Footer -->
      <div style="padding-top: 8px; margin-top: 8px; border-top: 1px dashed #000000; text-align: center;">
        <span style="font-weight: 900; font-size: 7.5px; text-transform: uppercase; letter-spacing: 0.5px; color: #71717a;">
          Auditoria de Separação WMS Integrada
        </span>
      </div>

    </div>
  </div>
</body>
</html>`;
}
