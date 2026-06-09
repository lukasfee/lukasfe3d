import { MensagemClientePayload, PrintEngineConfig } from '../documentTypes';
import { getThemeColors, buildWatermarkHtml, generateQrCodeSvg } from './shared';
import { resolveTemplateDimensions } from '../documentSizes';

export async function buildMensagemClienteHtml(
  payload: MensagemClientePayload,
  config: PrintEngineConfig,
  imageThemes: any[] = []
): Promise<string> {
  const paperSize = config.paperSize || 'A6';
  const sizeConfig = resolveTemplateDimensions(paperSize);
  const themeName = config.theme || 'classic';
  const colors = getThemeColors(themeName, config?.customFields?.customColor || (config as any)?.customColor);

  const isSheet = sizeConfig.type === 'sheet';
  const widthMm = sizeConfig.widthMm;
  const heightMm = sizeConfig.heightMm;

  const sizeConfigs: Record<string, {
    containerPadding: string;
    logoWidthHeight: string;
    logoTextSize: string;
    subTextSize: string;
    headerTextSize: string;
    messageBg: string;
    messageTextSize: string;
    couponBadgePadding: string;
    couponTitleSize: string;
    couponCodeTextSize: string;
    couponSubSize: string;
    qrSize: string;
    qrLabelSize: string;
    footerTextSize: string;
    maxWidth: string;
    mb: string;
  }> = {
    A4: {
      containerPadding: '30px',
      logoWidthHeight: '64px',
      logoTextSize: '10px',
      subTextSize: '13px',
      headerTextSize: '22px',
      messageBg: 'padding: 24px; margin-bottom: 20px;',
      messageTextSize: '14px',
      couponBadgePadding: '20px 32px; margin-bottom: 20px;',
      couponTitleSize: '10px',
      couponCodeTextSize: '18px',
      couponSubSize: '9px',
      qrSize: '96px',
      qrLabelSize: '11px',
      footerTextSize: '10px',
      maxWidth: '100%',
      mb: '20px'
    },
    A5: {
      containerPadding: '24px',
      logoWidthHeight: '56px',
      logoTextSize: '9px',
      subTextSize: '12px',
      headerTextSize: '18px',
      messageBg: 'padding: 20px; margin-bottom: 16px;',
      messageTextSize: '12.5px',
      couponBadgePadding: '16px 28px; margin-bottom: 16px;',
      couponTitleSize: '9px',
      couponCodeTextSize: '16px',
      couponSubSize: '8.5px',
      qrSize: '88px',
      qrLabelSize: '10px',
      footerTextSize: '9px',
      maxWidth: '115mm',
      mb: '16px'
    },
    A6: {
      containerPadding: '24px',
      logoWidthHeight: '40px',
      logoTextSize: '7.5px',
      subTextSize: '9.5px',
      headerTextSize: '14px',
      messageBg: 'padding: 12px; margin-bottom: 12px;',
      messageTextSize: '10px',
      couponBadgePadding: '10px 20px; margin-bottom: 12px;',
      couponTitleSize: '7.5px',
      couponCodeTextSize: '12px',
      couponSubSize: '7px',
      qrSize: '72px',
      qrLabelSize: '8px',
      footerTextSize: '7px',
      maxWidth: '100%',
      mb: '12px'
    },
    '80mm': {
      containerPadding: '8px',
      logoWidthHeight: '36px',
      logoTextSize: '6.5px',
      subTextSize: '7.5px',
      headerTextSize: '10px',
      messageBg: 'padding: 10px; margin-bottom: 10px;',
      messageTextSize: '8.5px',
      couponBadgePadding: '8px 16px; margin-bottom: 10px;',
      couponTitleSize: '7.5px',
      couponCodeTextSize: '12px',
      couponSubSize: '7px',
      qrSize: '64px',
      qrLabelSize: '7.2px',
      footerTextSize: '7px',
      maxWidth: '100%',
      mb: '10px'
    },
    '58mm': {
      containerPadding: '4px',
      logoWidthHeight: '28px',
      logoTextSize: '5px',
      subTextSize: '6.8px',
      headerTextSize: '8.5px',
      messageBg: 'padding: 6px; margin-bottom: 6px;',
      messageTextSize: '6.8px',
      couponBadgePadding: '4px 12px; margin-bottom: 6px;',
      couponTitleSize: '6px',
      couponCodeTextSize: '8px',
      couponSubSize: '5.5px',
      qrSize: '48px',
      qrLabelSize: '5.5px',
      footerTextSize: '5px',
      maxWidth: '100%',
      mb: '6px'
    }
  };

  const s = sizeConfigs[paperSize] || sizeConfigs['A6'];

  const qrCodeValue = payload.qrCodeUrl || payload.orderNumber || '';
  let qrCodeSvg = '';
  if (payload.qrCodeLabel) {
    qrCodeSvg = await generateQrCodeSvg(qrCodeValue);
  }

  let watermarkTheme: any = null;
  if (config.themeId) {
    watermarkTheme = imageThemes?.find((t: any) => t.id === config.themeId);
  }
  const watermarkHtml = buildWatermarkHtml(config, watermarkTheme, false);

  const isAutoHeight = heightMm === 'auto';
  const heightCss = isAutoHeight ? '297mm' : `${heightMm}mm`;

  return `<!DOCTYPE html>
<html lang="pt-BR" style="background-color: white !important;">
<head>
  <meta charset="UTF-8">
  <title>Mensagem do Cliente - Lukasfe ERP</title>
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
    @media print {
      html, body {
        margin: 0 !important;
        padding: 0 !important;
        background-color: white !important;
        border: none !important;
        outline: none !important;
        box-shadow: none !important;
      }
      .container {
        border: none !important;
        border-radius: 0 !important;
        box-shadow: none !important;
        margin: 0 !important;
      }
    }
    body {
      width: ${widthMm}mm;
      height: ${isSheet && !isAutoHeight ? `${heightMm}mm` : 'auto'};
      padding: ${sizeConfig.marginMm}mm;
      line-height: 1.4;
      margin: 0 !important;
    }
    .container {
      border: 1px solid #cbd5e1;
      border-radius: 12px;
      padding: ${s.containerPadding};
      background-color: white;
      text-align: center;
      width: 100%;
      height: 100%;
      max-width: ${s.maxWidth};
      margin: 0 auto;
      display: flex;
      flex-direction: column;
      justify-content: space-between;
      position: relative;
    }
    .logo-badge {
      width: ${s.logoWidthHeight};
      height: ${s.logoWidthHeight};
      border-radius: 12px;
      background-color: #18181b;
      color: white;
      display: flex;
      align-items: center;
      justify-content: center;
      font-weight: 900;
      font-size: calc(${s.logoWidthHeight} * 0.35);
      margin: 0 auto;
      box-shadow: 0 1px 3px rgba(0,0,0,0.1);
    }
  </style>
</head>
<body>
  <div class="container">
    ${watermarkHtml}
    <div style="position: relative; z-index: 10; display: flex; flex-direction: column; justify-content: space-between; height: 100%;">
      
      <!-- Logo and greeting info -->
      <div style="display: flex; flex-direction: column; align-items: center; margin-bottom: ${s.mb};">
        <div class="logo-badge">LF</div>
        <span style="font-weight: bold; font-size: ${s.logoTextSize}; text-transform: uppercase; letter-spacing: 0.27em; color: #71717a; margin-top: 8px; display: block;">PROJETO DE CARINHO</span>
        <h2 style="font-weight: 900; text-transform: uppercase; margin: 4px 0 0 0; font-size: ${s.headerTextSize}; color: #000000; line-height: 1.2;">Olá ${payload.clientName}!</h2>
      </div>

      <!-- Main body message -->
      <div style="background-color: #f4f4f5; border: 1px solid #f4f4f5; border-radius: 8px; ${s.messageBg}">
        <p style="margin: 0; line-height: 1.5; font-weight: normal; color: #18181b; font-size: ${s.messageTextSize};">
          "${payload.messageText}"
        </p>
      </div>

      <!-- Exclusive promo code -->
      ${payload.couponCode ? `
        <div style="background-color: #ecfdf5; border: 1px solid #a7f3d0; border-radius: 12px; text-align: center; ${s.couponBadgePadding}">
          <span style="font-weight: 900; text-transform: uppercase; font-size: ${s.couponTitleSize}; display: block; color: #065f46; letter-spacing: 0.5px; margin-bottom: 4px;">SEU CUPOM DE DESCONTO EXCLUSIVO</span>
          <p style="margin: 0; font-family: monospace; font-weight: 900; letter-spacing: 1.5px; font-size: ${s.couponCodeTextSize}; color: #10b981;">${payload.couponCode}</p>
          <p style="margin: 4px 0 0 0; font-weight: bold; font-size: ${s.couponSubSize}; color: #065f46;">10% OFF VÁLIDO PELOS PRÓXIMOS 30 DIAS</p>
        </div>
      ` : ''}

      <!-- Dynamic barcode/qrcode scanner scanner -->
      ${payload.qrCodeLabel ? `
        <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; padding-top: 10px; border-top: 1px solid #e4e4e7;">
          <div style="background-color: white; padding: 4px; border: 1px solid #e4e4e7; border-radius: 8px; width: ${s.qrSize}; height: ${s.qrSize}; display: flex; align-items: center; justify-content: center; margin-bottom: 4px;">
            ${qrCodeSvg}
          </div>
          <span style="font-weight: bold; line-height: 1.2; font-size: ${s.qrLabelSize}; color: #71717a;">
            ${payload.qrCodeLabel}
          </span>
        </div>
      ` : ''}

      <!-- Experience Footer branding -->
      <div style="font-weight: 900; text-transform: uppercase; font-size: ${s.footerTextSize}; letter-spacing: 1px; color: #71717a; padding-top: 10px; border-top: 1px dashed #e4e4e7;">
        #PEDIDO ${payload.orderNumber} | Lukasfe ERP Experience
      </div>

    </div>
  </div>
</body>
</html>`;
}
