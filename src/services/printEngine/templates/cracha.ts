import { generateQrCodeSvg } from './shared';

export interface CrachaPayload {
  user: {
    id?: string;
    fullName: string;
    login: string;
    matricula?: string;
    image?: string;
    isAdmin: boolean;
    primaryFunction?: string;
    loja?: string;
    setor?: string;
    qrCodeToken?: string;
    badgeId?: string;
  };
  role: string;
  config: {
    paperSize: string;
    badgeWidth: number;
    badgeHeight: number;
    marginTop: number;
    spacing: number;
    showCutLines: boolean;
    showQRCode: boolean;
    showLogo?: boolean;
    logoSize?: number;
    orientation: 'portrait' | 'landscape';
    template: 'simple' | 'corporate' | 'modern';
    qrCodeSize: number;
    qrCodeSizeBack: number;
    primaryColor?: string;
    secondaryColor?: string;
    accentColor?: string;
    textColor?: string;
    backColor?: string;
    borderColor?: string;
    qrContainerColor?: string;
    gradient?: boolean;
    showName?: boolean;
    showRole?: boolean;
    showFunction?: boolean;
    showStore?: boolean;
    showSector?: boolean;
    showMatricula?: boolean;
    showPhoto?: boolean;
    cornerStyle?: 'v1' | 'v2';
  };
  viewType: 'frente' | 'verso' | 'ambos';
}

export async function buildCrachaHtml(
  payload: CrachaPayload,
  printConfig: any,
  company: any
): Promise<string> {
  const { user, role, config, viewType } = payload;
  const companyName = company?.name || 'LUKASFE SYSTEMS';
  
  // Resolve colors
  const primaryColor = config.primaryColor || '#059669';
  const secondaryColor = config.secondaryColor || '#064e3b';
  const accentColor = config.accentColor || '#10b981';
  const textColor = config.textColor || '#ffffff';
  const backColor = config.backColor || '#064e3b';
  const borderColor = config.borderColor || 'rgba(0,0,0,0.1)';
  const qrContainerColor = config.qrContainerColor || '#ffffff';
  const gradient = config.gradient !== false;

  const baseW = config.badgeWidth || 85.6;
  const baseH = config.badgeHeight || 54;
  const gap = config.spacing || 5;

  // Resolve PDF export specific configurations
  const isExportPdf = true;
  const paperSize = printConfig?.paperSize || 'A6';
  
  let pageW = 105;
  let pageH = 148;

  if (paperSize === 'A4') {
    pageW = 210;
    pageH = 297;
  } else if (paperSize === 'A5') {
    pageW = 148;
    pageH = 210;
  }

  // Swap page dimensions if orientation is landscape
  if (printConfig?.orientation === 'landscape') {
    const temp = pageW;
    pageW = pageH;
    pageH = temp;
  }

  // Sizing and alignment parameters computed dynamically to guarantee exact fit
  let renderW = baseW;
  let renderH = baseH;
  let layoutDirection: 'column' | 'row' = 'column';
  let scaleRatio = 1.0;
  let isAutoScaled = false;
  let layoutReason = 'Vertical Padrão';

  if (isExportPdf) {
    const safetyX = 6; // 6mm physical printer safe margin
    const safetyY = 6;
    const limitW = pageW - safetyX;
    const limitH = pageH - safetyY;

    if (viewType === 'ambos') {
      const l1W = baseW;
      const l1H = baseH + gap + baseH;

      const l2W = baseW + gap + baseW;
      const l2H = baseH;

      const rotW = baseH;
      const rotH = baseW;
      const l3W = rotW;
      const l3H = rotH + gap + rotH;

      const l4W = rotW + gap + rotW;
      const l4H = rotH;

      if (paperSize === 'A6') {
        renderW = baseW;
        renderH = baseH;
        // Decide ideal layout direction for A6 based on badge style:
        // Horizontal badge (baseW > baseH) -> stack vertically
        // Vertical badge (baseW <= baseH) -> place side-by-side
        const isBadgeHorizontal = baseW > baseH;
        layoutDirection = isBadgeHorizontal ? 'column' : 'row';

        const neededW = layoutDirection === 'row' ? (baseW + gap + baseW) : baseW;
        const neededH = layoutDirection === 'column' ? (baseH + gap + baseH) : baseH;

        if (neededW > limitW || neededH > limitH) {
          scaleRatio = Math.min(limitW / neededW, limitH / neededH);
          isAutoScaled = true;
        } else {
          scaleRatio = 1.0;
          isAutoScaled = false;
        }
        layoutReason = isBadgeHorizontal ? 'A6 Stack Vertical Proporcional' : 'A6 Side-by-Side Horizontal Proporcional';
      } else if (l1W <= limitW && l1H <= limitH) {
        renderW = baseW;
        renderH = baseH;
        layoutDirection = 'column';
        layoutReason = 'Normal Vertical Stack';
      } else if (l2W <= limitW && l2H <= limitH) {
        renderW = baseW;
        renderH = baseH;
        layoutDirection = 'row';
        layoutReason = 'Normal Side-by-Side';
      } else if (l3W <= limitW && l3H <= limitH) {
        renderW = rotW;
        renderH = rotH;
        layoutDirection = 'column';
        layoutReason = 'Rotacionado Vertical Stack';
      } else if (l4W <= limitW && l4H <= limitH) {
        renderW = rotW;
        renderH = rotH;
        layoutDirection = 'row';
        layoutReason = 'Rotacionado Side-by-Side';
      } else {
        // Fallback: choose the option that has the absolute best scale ratio to prevent cuts
        const scaleL1 = Math.min(limitW / l1W, limitH / l1H);
        const scaleL3 = Math.min(limitW / l3W, limitH / l3H);

        if (scaleL3 > scaleL1) {
          renderW = rotW;
          renderH = rotH;
          layoutDirection = 'column';
          scaleRatio = scaleL3;
          layoutReason = 'Ajustado Proporcional (Rotacionado)';
        } else {
          renderW = baseW;
          renderH = baseH;
          layoutDirection = 'column';
          scaleRatio = scaleL1;
          layoutReason = 'Ajustado Proporcional (Normal)';
        }
        isAutoScaled = true;
      }
    } else {
      // Single view (frente or verso only)
      const l1W = baseW;
      const l1H = baseH;

      const rotW = baseH;
      const rotH = baseW;

      if (l1W <= limitW && l1H <= limitH) {
        renderW = baseW;
        renderH = baseH;
        layoutReason = 'Normal';
      } else if (rotW <= limitW && rotH <= limitH) {
        renderW = rotW;
        renderH = rotH;
        layoutReason = 'Rotacionado';
      } else {
        const scaleL1 = Math.min(limitW / l1W, limitH / l1H);
        const scaleRot = Math.min(limitW / rotW, limitH / rotH);

        if (scaleRot > scaleL1) {
          renderW = rotW;
          renderH = rotH;
          scaleRatio = scaleRot;
          layoutReason = 'Ajustado Proporcional (Rotacionado)';
        } else {
          renderW = baseW;
          renderH = baseH;
          scaleRatio = scaleL1;
          layoutReason = 'Ajustado Proporcional (Normal)';
        }
        isAutoScaled = true;
      }
    }
  } else {
    // Web Preview Mode (not PDF Export) - default 100% scale stack
    renderW = baseW;
    renderH = baseH;
    layoutDirection = 'column';
    scaleRatio = 1.0;
    layoutReason = 'Preview Geral Web';
  }

  // Normalize scale ratio to not exceed 100%
  scaleRatio = Math.min(1.0, scaleRatio);

  // Compute final sheet content container dimensions
  let contentW = renderW;
  let contentH = renderH;

  if (viewType === 'ambos') {
    if (layoutDirection === 'column') {
      contentW = renderW;
      contentH = renderH + gap + renderH;
    } else {
      contentW = renderW + gap + renderW;
      contentH = renderH;
    }
  }

  const isRenderHorizontal = renderW > renderH;

  // Resolve QR code content
  // Prioritize user.qrCodeToken (the QR_CODE_ID / externalQrId) over user.matricula or user.login to ensure perfect consistency with preview and storage
  const qrCodeValue = user.qrCodeToken || user.matricula || user.login || '000000';
  const qrCodeSvg = (config.showQRCode) ? await generateQrCodeSvg(qrCodeValue) : '';

  // Get photo HTML
  const photoHtml = config.showPhoto !== false ? (
    user.image ? `
      <div class="photo-frame" style="
        width: 22mm;
        height: 29mm;
        border-radius: 8px;
        border: 2px solid ${primaryColor}1A;
        overflow: hidden;
        box-sizing: border-box;
      ">
        <img src="${user.image}" style="width: 100%; height: 100%; object-fit: cover;" referrerPolicy="no-referrer" />
      </div>
    ` : `
      <div class="photo-frame placeholder" style="
        width: 22mm;
        height: 29mm;
        border-radius: 8px;
        border: 2px solid ${primaryColor}1A;
        background-color: #f4f4f5;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        box-sizing: border-box;
        color: #71717a;
      ">
        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-shield" style="margin-bottom: 4px; color: #a1a1aa;"><path d="M20 13c0 5-3.5 7.5-7.66 9.7a1 1 0 0 1-.68 0C7.5 20.5 4 18 4 13V6a1 1 0 0 1 .76-.97l8-2a1 1 0 0 1 .48 0l8 2A1 1 0 0 1 20 6z"/></svg>
        <span style="font-size: 8px; font-weight: 900; text-transform: uppercase; letter-spacing: 0.05em;">Sem Foto</span>
      </div>
    `
  ) : '';

  // HTML CSS template
  const cssStyles = `
    <style>
      @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&family=JetBrains+Mono:wght@500;700&display=swap');
      
      @page {
        size: ${pageW}mm ${pageH}mm;
        margin: 0 !important;
      }

      * {
        -webkit-print-color-adjust: exact !important;
        print-color-adjust: exact !important;
        color-adjust: exact !important;
        box-sizing: border-box !important;
      }
      
      html, body {
        background-color: #ffffff !important;
        color: #18181b !important;
        margin: 0 !important;
        padding: 0 !important;
        font-family: 'Inter', sans-serif;
        -webkit-font-smoothing: antialiased;
        ${isExportPdf ? `width: ${pageW}mm !important; height: ${pageH}mm !important; overflow: hidden !important;` : ''}
      }

      .badge-sheet {
        display: flex;
        box-sizing: border-box;
        ${isExportPdf ? `
        flex-direction: column;
        align-items: center;
        justify-content: center;
        width: ${pageW}mm;
        height: ${pageH}mm;
        padding: 4mm;
        background-color: #ffffff;
        overflow: hidden;
        ` : `
        flex-direction: row;
        flex-wrap: wrap;
        gap: ${config.spacing || 5}mm;
        align-items: center;
        justify-content: center;
        width: 100%;
        min-height: 100%;
        padding: ${config.marginTop || 0}mm 0mm;
        `}
      }

      .scale-wrapper {
        display: flex;
        flex-direction: ${layoutDirection};
        align-items: center;
        justify-content: center;
        gap: ${config.spacing || 5}mm;
        ${isExportPdf ? `
        ${scaleRatio < 0.99 ? `
        transform: scale(${scaleRatio.toFixed(4)});
        transform-origin: top center;
        ` : ''}
        width: ${contentW}mm;
        height: ${contentH}mm;
        ` : ''}
      }

      .badge-container {
        position: relative;
        width: ${renderW}mm;
        height: ${renderH}mm;
        border: 1px solid ${borderColor};
        border-radius: ${config.cornerStyle === 'v2' ? '0px' : '6mm'};
        overflow: hidden;
        background-color: #ffffff;
        page-break-inside: avoid;
        box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05);
      }

      .badge-container.verso {
        background-color: ${backColor};
        color: ${textColor};
      }

      .header-banner {
        width: 100%;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        padding: 2mm 3mm;
        text-align: center;
        flex-shrink: 0;
        background-color: ${primaryColor};
        background-image: ${gradient ? `linear-gradient(135deg, ${primaryColor}, ${secondaryColor})` : 'none'};
        color: ${textColor};
      }

      .header-banner h4 {
        font-size: 8pt;
        font-weight: 900;
        text-transform: uppercase;
        letter-spacing: 0.1em;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        width: 100%;
      }

      .header-banner span {
        font-size: 5pt;
        font-weight: 800;
        text-transform: uppercase;
        letter-spacing: 0.15em;
        opacity: 0.75;
        margin-bottom: 1px;
      }

      /* Front orientation specific layouts */
      .badge-body-portrait {
        height: 100%;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: space-between;
      }

      .badge-details-portrait {
        width: 100%;
        text-align: center;
        background-color: #ffffff;
        padding: 3mm;
        border-top: 1px solid rgba(0, 0, 0, 0.05);
        display: flex;
        flex-direction: column;
        align-items: center;
        flex-shrink: 0;
      }

      .badge-details-portrait h3 {
        font-size: 9pt;
        font-weight: 900;
        text-transform: uppercase;
        color: #111827;
        margin: 1mm 0 0.5mm 0;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        width: 100%;
      }

      .badge-details-portrait .function {
        font-size: 6.5pt;
        font-weight: 700;
        color: #6b7280;
        text-transform: uppercase;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        width: 100%;
      }

      .badge-details-portrait .badge-pills {
        font-size: 5.5pt;
        font-weight: 900;
        text-transform: uppercase;
        background-color: ${primaryColor}1A;
        color: ${primaryColor};
        padding: 0.5mm 2.5mm;
        border-radius: 9999px;
      }

      /* Horizontal layout adjustments */
      .badge-body-landscape {
        display: flex;
        flex-direction: row;
        width: 100%;
        height: 100%;
        align-items: stretch;
      }

      .badge-body-landscape .left-pane {
        width: 32%;
        border-right: 1px solid rgba(0, 0, 0, 0.05);
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 2mm;
        flex-shrink: 0;
      }

      .badge-body-landscape .right-pane {
        flex: 1;
        display: flex;
        flex-direction: column;
        justify-content: space-between;
        padding: 2.5mm;
        min-width: 0;
      }

      .badge-body-landscape h3 {
        font-size: 9.5pt;
        font-weight: 900;
        text-transform: uppercase;
        color: #111827;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        margin-top: 1mm;
      }

      .badge-body-landscape .function {
        font-size: 7pt;
        font-weight: 700;
        color: #6b7280;
        text-transform: uppercase;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        margin-bottom: 2mm;
      }

      .badge-body-landscape .badge-pills {
        font-size: 5.2pt;
        font-weight: 900;
        text-transform: uppercase;
        background-color: ${primaryColor}1A;
        color: ${primaryColor};
        padding: 0.4mm 2mm;
        border-radius: 9999px;
        width: fit-content;
      }

      .badge-footer-row {
        display: flex;
        align-items: center;
        justify-content: space-between;
        border-top: 1px solid rgba(0, 0, 0, 0.05);
        padding-top: 1.5mm;
        width: 100%;
        flex-shrink: 0;
      }

      .metadata-grid {
        display: flex;
        flex-direction: row;
        flex-wrap: wrap;
        gap: 3mm;
        max-width: 75%;
      }

      .meta-item {
        display: flex;
        flex-direction: column;
        align-items: flex-start;
        font-size: 5pt;
        line-height: 1.2;
      }

      .meta-item .label {
        font-weight: 900;
        color: #9ca3af;
        text-transform: uppercase;
        letter-spacing: 0.02em;
      }

      .meta-item .val {
        font-weight: 700;
        color: #374151;
        text-transform: uppercase;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        max-width: 65px;
      }

      /* QR code styling */
      .qr-holder {
        width: 10mm;
        height: 10mm;
        background-color: ${qrContainerColor};
        border-radius: 4px;
        padding: 0.8mm;
        display: flex;
        align-items: center;
        justify-content: center;
        flex-shrink: 0;
      }

      /* Verso Layout portraits & landscapes */
      .back-panel {
        width: 100%;
        height: 100%;
        display: flex;
        flex-direction: column;
        justify-content: space-between;
        align-items: center;
        text-align: center;
      }

      .back-header {
        width: 100%;
        padding: 3mm;
        border-bottom: 1px solid rgba(255, 255, 255, 0.08);
        background-image: ${gradient ? `linear-gradient(to bottom, ${secondaryColor}, rgba(0,0,0,0.2))` : 'none'};
      }

      .back-header h5 {
        font-size: 6.5pt;
        font-weight: 900;
        color: ${accentColor};
        text-transform: uppercase;
        letter-spacing: 0.15em;
        margin-bottom: 1px;
      }

      .back-header h4 {
        font-size: 8.5pt;
        font-weight: 900;
        color: ${textColor};
        text-transform: uppercase;
        letter-spacing: 0.05em;
      }

      .back-content {
        flex: 1;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        padding: 3mm;
        gap: 3mm;
        width: 100%;
      }

      .back-content p {
        font-size: 5.8pt;
        font-weight: 500;
        line-height: 1.3;
        color: #e4e4e7;
        text-transform: uppercase;
        max-width: 85%;
      }

      .back-content .restriction-tag {
        font-size: 5.5pt;
        font-weight: 900;
        text-transform: uppercase;
        color: #ffffff;
        background-color: rgba(239, 68, 68, 0.45);
        padding: 0.5mm 3.2mm;
        border-radius: 3px;
        letter-spacing: 0.08em;
      }

      .back-footer {
        width: 100%;
        padding: 2.5mm 4mm;
        border-top: 1px solid rgba(255, 255, 255, 0.08);
        background-color: rgba(0, 0, 0, 0.12);
        display: flex;
        justify-content: space-between;
        text-align: left;
      }

      .back-footer .footer-item {
        display: flex;
        flex-direction: column;
      }

      .back-footer .footer-item .lbl {
        font-size: 5pt;
        font-weight: 900;
        color: ${accentColor};
        text-transform: uppercase;
        letter-spacing: 0.02em;
      }

      .back-footer .footer-item .val {
        font-size: 6.5pt;
        font-weight: 700;
        color: #fafafa;
        text-transform: uppercase;
      }

      /* Horizontal Verso split layout */
      .back-panel-landscape {
        display: flex;
        flex-direction: row;
        width: 100%;
        height: 100%;
        align-items: stretch;
      }

      .back-panel-landscape .left-pane {
        width: 32%;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        background-color: rgba(0,0,0,0.12);
        border-right: 1px solid rgba(255,255,255,0.05);
        padding: 3mm;
        gap: 2mm;
        flex-shrink: 0;
      }

      .back-panel-landscape .right-pane {
        flex: 1;
        display: flex;
        flex-direction: column;
        justify-content: space-between;
        padding: 3mm;
        min-width: 0;
      }

      /* Cut guidelines */
      .cut-line-wrapper {
        position: relative;
      }
      
      .cut-guides {
        position: absolute;
        inset: 0;
        pointer-events: none;
        opacity: 0.25;
        color: inherit;
      }

      .cut-guide-corner {
        position: absolute;
        width: 10px;
        height: 10px;
        border: 1px solid currentColor;
      }

      .guide-tl { top: -2px; left: -2px; border-right: 0; border-bottom: 0; }
      .guide-tr { top: -2px; right: -2px; border-left: 0; border-bottom: 0; }
      .guide-bl { bottom: -2px; left: -2px; border-right: 0; border-top: 0; }
      .guide-br { bottom: -2px; right: -2px; border-left: 0; border-top: 0; }

    </style>
  `;

  // Render Front HTML
  const getFrontCardHtml = (horizontal: boolean = isRenderHorizontal) => {
    if (horizontal) {
      return `
        <div class="badge-container">
          <div class="badge-body-portrait">
            <!-- Header Banner -->
            <div class="header-banner">
              ${config.showRole !== false ? `<span>Colaborador</span><h4>${role}</h4>` : '<h4>CRACHÁ DE ACESSO</h4>'}
            </div>
            
            <!-- Landscape content split -->
            <div class="badge-body-landscape">
              <!-- Photo -->
              <div class="left-pane">
                ${photoHtml}
              </div>
              <!-- Content -->
              <div class="right-pane">
                <div>
                  <span class="badge-pills">Identificação</span>
                  ${config.showName !== false ? `<h3>${user.fullName}</h3>` : ''}
                  ${config.showFunction !== false && user.primaryFunction ? `<div class="function">${user.primaryFunction}</div>` : ''}
                </div>
                
                <div class="badge-footer-row">
                  <div class="metadata-grid">
                    ${config.showMatricula !== false ? `
                      <div class="meta-item">
                        <span class="label">Matrícula</span>
                        <span class="val">${user.matricula || user.login || '---'}</span>
                      </div>
                    ` : ''}
                    ${config.showStore !== false && user.loja ? `
                      <div class="meta-item">
                        <span class="label">Loja</span>
                        <span class="val">${user.loja}</span>
                      </div>
                    ` : ''}
                    ${config.showSector !== false && user.setor ? `
                      <div class="meta-item">
                        <span class="label">Setor</span>
                        <span class="val">${user.setor}</span>
                      </div>
                    ` : ''}
                  </div>
                  <!-- Front company logo -->
                  ${config.showLogo !== false ? (
                    company?.logo ? `
                      <div class="logo-holder" style="width: 12mm; height: 12mm; display: flex; align-items: center; justify-content: center; overflow: hidden; margin-left: 2mm;">
                        <img src="${company.logo}" style="max-width: 100%; max-height: 100%; object-fit: contain;" />
                      </div>
                    ` : `
                      <div style="border: 1px dashed ${config.template === 'simple' ? 'rgba(0,0,0,0.15)' : 'rgba(255,255,255,0.2)'}; padding: 1.5px 4px; font-size: 5.5pt; font-weight: bold; border-radius: 2px; color: ${config.template === 'simple' ? 'rgba(0,0,0,0.4)' : accentColor}; background-color: rgba(0,0,0,0.03); margin-left: 2mm; text-align: center;">LOGO</div>
                    `
                  ) : ''}
                </div>
              </div>
            </div>
          </div>
        </div>
      `;
    }

    // Portrait / Vertical
    return `
      <div class="badge-container">
        <div class="badge-body-portrait">
          <!-- Header Banner -->
          <div class="header-banner" style="height: 12mm;">
            ${config.showRole !== false ? `<span>Colaborador</span><h4>${role}</h4>` : '<span>Crachá de Acesso</span><h4>Identificação</h4>'}
          </div>
          
          <!-- Photo -->
          <div style="flex: 1; display: flex; align-items: center; justify-center; padding: 1mm 0;">
            ${photoHtml}
          </div>
          
          <!-- Metadata body -->
          <div class="badge-details-portrait">
            <span class="badge-pills" style="margin-bottom: 1.5mm;">Identificação</span>
            ${config.showName !== false ? `<h3 style="margin-bottom: 0.5mm;">${user.fullName}</h3>` : ''}
            ${config.showFunction !== false && user.primaryFunction ? `<span class="function">${user.primaryFunction}</span>` : ''}
            
            <!-- Front company logo or layout gap -->
            ${config.showLogo !== false ? `
              <div class="logo-holder" style="margin: 2mm 0 1.5mm 0; display: flex; align-items: center; justify-content: center; height: 12mm; overflow: hidden; width: 100%;">
                ${company?.logo ? `
                  <img src="${company.logo}" style="max-width: ${(config.logoSize || 60) * 0.7}px; max-height: ${(config.logoSize || 60) * 0.7}px; object-fit: contain;" />
                ` : `
                  <div style="border: 1px dashed ${config.template === 'simple' ? 'rgba(0,0,0,0.15)' : 'rgba(255,255,255,0.2)'}; padding: 2px 6px; font-size: 6.5pt; font-weight: bold; border-radius: 4px; color: ${config.template === 'simple' ? 'rgba(0,0,0,0.4)' : accentColor}; background-color: rgba(0,0,0,0.03); text-align: center;">LOGO</div>
                `}
              </div>
            ` : '<div style="height: 1.5mm;"></div>'}

            <div class="badge-footer-row" style="margin-top: 1mm;">
              <div class="metadata-grid" style="max-width: 100%; width: 100%; justify-content: space-around;">
                ${config.showMatricula !== false ? `
                  <div class="meta-item" style="align-items: center;">
                    <span class="label">Matrícula</span>
                    <span class="val">${user.matricula || user.login || '---'}</span>
                  </div>
                ` : ''}
                ${config.showStore !== false && user.loja ? `
                  <div class="meta-item" style="align-items: center;">
                    <span class="label">Loja</span>
                    <span class="val">${user.loja}</span>
                  </div>
                ` : ''}
                ${config.showSector !== false && user.setor ? `
                  <div class="meta-item" style="align-items: center;">
                    <span class="label">Setor</span>
                    <span class="val">${user.setor}</span>
                  </div>
                ` : ''}
                <div class="meta-item" style="align-items: center;">
                  <span class="label">Acesso</span>
                  <span class="val">${user.isAdmin ? 'ADMIN' : 'USER'}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    `;
  };

  // Render Back HTML
  const getBackCardHtml = (horizontal: boolean = isRenderHorizontal) => {
    if (horizontal) {
      return `
        <div class="badge-container verso">
          <div class="back-panel-landscape">
            <!-- Left QR and digital access -->
            <div class="left-pane">
              ${config.showQRCode && qrCodeSvg ? `
                <div class="qr-holder" style="width: 16mm; height: 16mm; padding: 1.2mm;">
                  ${qrCodeSvg}
                </div>
              ` : `
                <div class="qr-holder" style="width: 16mm; height: 16mm; background-color: rgba(255,255,255,0.05); display: flex; align-items:center; justify-content:center;">
                  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-qr-code" style="color: rgba(255,255,255,0.1);"><rect width="5" height="5" x="3" y="3" rx="1"/><rect width="5" height="5" x="16" y="3" rx="1"/><rect width="5" height="5" x="3" y="16" rx="1"/><path d="M21 16V21H16"/><path d="M21 9V10"/><path d="M9 21h1"/><path d="M14 14v1"/><path d="M14 18v2"/><path d="M20 18v2"/><path d="M18 14v2"/><path d="M18 18V16"/><rect width="1" height="1" x="7" y="7"/><rect width="1" height="1" x="16" y="7"/><rect width="1" height="1" x="7" y="16"/></svg>
                </div>
              `}
              <span style="font-size: 5pt; font-weight: 800; text-transform: uppercase; letter-spacing: 0.1em; color: ${accentColor}; margin-top: 1mm;">Acesso Digital</span>
            </div>
            
            <!-- Right policies/metadata -->
            <div class="right-pane">
              <div style="border-b: 1px solid rgba(255,255,255,0.08); padding-bottom: 1.5mm;">
                <h5 style="font-size: 5pt; font-weight:900; text-transform: uppercase; color: ${accentColor}; letter-spacing: 0.15em;">${companyName}</h5>
                <h4 style="font-size: 7.5pt; font-weight:900; text-transform: uppercase; color: #ffffff;">Identificação Digital</h4>
              </div>
              
              <p style="font-size: 5pt; color: #e4e4e7; line-height: 1.2;">
                O uso deste crachá é obrigatório em todas as dependências da empresa. Se encontrado, devolva ao RH da ${companyName}.
              </p>
              
              <span class="restriction-tag" style="padding: 0.2mm 2mm; font-size: 5pt; width: fit-content;">Acesso Restrito</span>
              
              <div class="badge-footer-row" style="border-top: 1px solid rgba(255,255,255,0.08); padding-top: 1.5mm; width: 100%;">
                <div class="metadata-grid" style="max-width: 100%; width: 100%; justify-content: space-between;">
                  <div class="meta-item">
                    <span class="label" style="color: ${accentColor}">Matrícula</span>
                    <span class="val" style="color: #ffffff">${user.matricula || user.login || '---'}</span>
                  </div>
                  <div class="meta-item" style="text-align: right; align-items: flex-end;">
                    <span class="label" style="color: ${accentColor}">Emissão</span>
                    <span class="val" style="color: #ffffff">${new Date().toLocaleDateString('pt-BR')}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      `;
    }

    // Portrait / Vertical Back
    return `
      <div class="badge-container verso">
        <div class="back-panel">
          <!-- Header -->
          <div class="back-header">
            <h5>${companyName}</h5>
            <h4>Identificação Digital</h4>
          </div>
          
          <!-- Content QR -->
          <div class="back-content">
            ${config.showQRCode && qrCodeSvg ? `
              <div class="qr-holder" style="width: 22mm; height: 22mm; padding: 1.5mm; border-radius: 8px;">
                ${qrCodeSvg}
              </div>
            ` : `
              <div class="qr-holder" style="width: 22mm; height: 22mm; border-radius: 8px; background-color: rgba(255,255,255,0.03); display: flex; align-items:center; justify-content:center; border: 1px dashed rgba(255,255,255,0.1);">
                <svg xmlns="http://www.w3.org/2000/svg" width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-qr-code" style="color: rgba(255,255,255,0.07);"><rect width="5" height="5" x="3" y="3" rx="1"/><rect width="5" height="5" x="16" y="3" rx="1"/><rect width="5" height="5" x="3" y="16" rx="1"/><path d="M21 16V21H16"/><path d="M21 9V10"/><path d="M9 21h1"/><path d="M14 14v1"/><path d="M14 18v2"/><path d="M20 18v2"/><path d="M18 14v2"/><path d="M18 18V16"/><rect width="1" height="1" x="7" y="7"/><rect width="1" height="1" x="16" y="7"/><rect width="1" height="1" x="7" y="16"/></svg>
              </div>
            `}
            
            <span class="restriction-tag">Acesso Restrito</span>
            
            <p style="padding: 0 2mm;">
              O uso deste crachá é obrigatório em todas as dependências da empresa. Se encontrado, favor devolver ao RH da ${companyName}.
            </p>
          </div>
          
          <!-- Footer -->
          <div class="back-footer">
            <div class="footer-item">
              <span class="lbl">Matrícula</span>
              <span class="val">${user.matricula || user.login || '---'}</span>
            </div>
            <div class="footer-item" style="text-align: right;">
              <span class="lbl">Emissão</span>
              <span class="val">${new Date().toLocaleDateString('pt-BR')}</span>
            </div>
          </div>
        </div>
      </div>
    `;
  };

  const wrapInCutLines = (cardHtml: string) => {
    if (!config.showCutLines) return cardHtml;
    return `
      <div class="cut-line-wrapper">
        <div class="cut-guides">
          <div class="cut-guide-corner guide-tl"></div>
          <div class="cut-guide-corner guide-tr"></div>
          <div class="cut-guide-corner guide-bl"></div>
          <div class="cut-guide-corner guide-br"></div>
        </div>
        ${cardHtml}
      </div>
    `;
  };

  // Compile full sheet HTML
  let cardsGroupHtml = '';
  if (viewType === 'frente') {
    cardsGroupHtml = wrapInCutLines(getFrontCardHtml(isRenderHorizontal));
  } else if (viewType === 'verso') {
    cardsGroupHtml = wrapInCutLines(getBackCardHtml(isRenderHorizontal));
  } else {
    // Both front & back stacked or side by side
    cardsGroupHtml = `
      ${wrapInCutLines(getFrontCardHtml(isRenderHorizontal))}
      ${wrapInCutLines(getBackCardHtml(isRenderHorizontal))}
    `;
  }

  let autoScaleToastHtml = '';
  if (isAutoScaled && isExportPdf) {
    autoScaleToastHtml = `
      <div style="
        position: absolute;
        bottom: 4mm;
        left: 50%;
        transform: translateX(-50%);
        background-color: rgba(30, 41, 59, 0.95);
        color: #e2e8f0;
        border: 1px solid rgba(226, 232, 240, 0.1);
        padding: 1.5mm 3.5mm;
        border-radius: 4px;
        font-family: 'Inter', sans-serif;
        font-size: 6.5pt;
        font-weight: 700;
        letter-spacing: 0.05em;
        text-transform: uppercase;
        white-space: nowrap;
        box-shadow: 0 4px 12px rgba(0,0,0,0.15);
        z-index: 99999;
        display: flex;
        align-items: center;
        gap: 1.5mm;
        box-sizing: border-box;
      ">
        <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="color: #38bdf8; shrink-0;"><circle cx="12" cy="12" r="10"/><path d="m12 16 4-4-4-4"/><path d="M8 12h8"/></svg>
        Ajuste Automático: ${Math.round(scaleRatio * 100)}% (${layoutReason})
      </div>
    `;
  }

  const finalContentHtml = isExportPdf ? `
    <div class="scale-wrapper">
      ${cardsGroupHtml}
    </div>
    ${autoScaleToastHtml}
  ` : cardsGroupHtml;

  return `
    <!DOCTYPE html>
    <html lang="pt-BR">
    <head>
      <meta charset="UTF-8">
      <title>Crachá de Acesso - Canônico</title>
      ${cssStyles}
    </head>
    <body>
      <div class="badge-sheet">
        ${finalContentHtml}
      </div>
    </body>
    </html>
  `;
}
