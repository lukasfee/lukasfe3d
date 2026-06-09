import { EtiquetaPayload, PrintEngineConfig } from '../documentTypes';
import { getThemeColors, buildWatermarkHtml, generateQrCodeSvg } from './shared';
import { resolveTemplateDimensions } from '../documentSizes';

// Helper to safely parse numbers
const getNum = (fallback: number, ...vals: any[]): number => {
  for (const val of vals) {
    if (val !== undefined && val !== null && val !== '') {
      const parsed = parseFloat(val);
      if (!isNaN(parsed)) return parsed;
    }
  }
  return fallback;
};

const getInt = (fallback: number, ...vals: any[]): number => {
  for (const val of vals) {
    if (val !== undefined && val !== null && val !== '') {
      const parsed = parseInt(val, 10);
      if (!isNaN(parsed)) return parsed;
    }
  }
  return fallback;
};

// Spacing helper for background guides matching selected theme
const getGuideColor = (themeName: string, opacity: number = 0.3) => {
  const rgbColors: Record<string, string> = {
    classic: '113, 113, 122',
    emerald: '16, 185, 129',
    indigo: '79, 70, 229',
    crimson: '225, 29, 72',
    slate: '100, 116, 139',
    amber: '245, 158, 11',
    violet: '124, 58, 237',
    orange: '249, 115, 22',
    teal: '20, 184, 166',
    fuchsia: '217, 70, 239',
  };
  const rgb = rgbColors[themeName] || rgbColors.classic;
  return `rgba(${rgb}, ${opacity})`;
};

export async function buildEtiquetaHtml(
  payload: EtiquetaPayload,
  config: PrintEngineConfig,
  imageThemes: any[] = []
): Promise<string> {
  const paperSize = config.paperSize || 'A6';
  const sizeConfig = resolveTemplateDimensions(paperSize);
  // Extract custom grid configuration from fields
  const cols = getInt(2, config?.customFields?.cols, (config as any)?.columns, (config as any)?.cols);
  const rows = getInt(4, config?.customFields?.rows, (config as any)?.rows);
  const gapX = getNum(2, config?.customFields?.gapX, (config as any)?.horizontalSpacing, (config as any)?.colGap);
  const gapY = getNum(2, config?.customFields?.gapY, (config as any)?.verticalSpacing, (config as any)?.rowGap);
  const quantity = getInt(1, config?.customFields?.quantity, (config as any)?.previewQuantity);
  const labelWidth = getNum(40, config?.customFields?.labelWidth, (config as any)?.labelWidth);
  const labelHeight = getNum(30, config?.customFields?.labelHeight, (config as any)?.labelHeight);

  const marginTop = getNum(0, config?.customFields?.marginTop, (config as any)?.marginTop);
  const marginBottom = getNum(0, config?.customFields?.marginBottom, (config as any)?.marginBottom);
  const marginLeft = getNum(0, config?.customFields?.marginLeft, (config as any)?.marginLeft);
  const marginRight = getNum(0, config?.customFields?.marginRight, (config as any)?.marginRight);

  // Map product details with fallback
  const activeProduct = {
    name: payload.name || config?.customFields?.selectedProduct?.name || 'Produto sem Nome',
    code: payload.code || config?.customFields?.selectedProduct?.code || 'SKU-000',
    barcode: (payload as any).barcode || config?.customFields?.selectedProduct?.barcode || payload.code || 'SKU-000',
    brand: payload.brand || config?.customFields?.selectedProduct?.brand || 'Geral',
    stock: payload.stock ?? config?.customFields?.selectedProduct?.stock ?? 0,
    price: payload.price ?? config?.customFields?.selectedProduct?.price ?? 0,
    category: payload.category || config?.customFields?.selectedProduct?.category || 'Geral',
    variation: payload.variation || 'Único',
  };

  const totalCellsPerPage = cols * rows;
  const totalPagesNeeded = Math.max(1, Math.ceil(quantity / totalCellsPerPage));

  const themeConfigName = config?.theme || 'classic';
  const guideOpacity = config?.customFields?.guideOpacity ?? 0.2;
  const guideBorderColor = getGuideColor(themeConfigName, guideOpacity + 0.1);
  const guideBgColor = getGuideColor(themeConfigName, 0.015);

  const isVertical = config?.customFields?.orientation === 'vertical';
  const qrCodeDim = isVertical
    ? Math.min(labelHeight * 0.38, labelWidth * 0.65)
    : Math.min(labelHeight * 0.58, labelWidth * 0.38);

  // Generate the single product QR Code SVG asynchronously once
  const qrCodeSvg = await generateQrCodeSvg(activeProduct.barcode);

  // Map watermark configuration
  let watermarkTheme: any = null;
  if (config?.themeId) {
    watermarkTheme = imageThemes?.find((t: any) => t.id === config.themeId);
  }

  const pagesHtml: string[] = [];

  for (let pageIdx = 0; pageIdx < totalPagesNeeded; pageIdx++) {
    const pageCellsHtml: string[] = [];

    for (let i = 0; i < totalCellsPerPage; i++) {
      const g = pageIdx * totalCellsPerPage + i;
      const isDummy = g >= quantity;

      if (isDummy) {
        if (config?.customFields?.guideEnabled !== false) {
          pageCellsHtml.push(`
            <div 
              class="print-hide-guide"
              style="
                display: flex;
                align-items: center;
                justify-content: center;
                font-size: 8px;
                color: #a1a1aa;
                font-family: monospace;
                text-transform: uppercase;
                border: 1px dashed ${guideBorderColor};
                background-color: ${guideBgColor};
                box-sizing: border-box;
                width: ${labelWidth}mm;
                height: ${labelHeight}mm;
              "
            >
              Espaço ${g + 1}
            </div>
          `);
        } else {
          pageCellsHtml.push(`
            <div style="box-sizing: border-box; width: ${labelWidth}mm; height: ${labelHeight}mm; border: 1px solid transparent;"></div>
          `);
        }
      } else {
        const theme = config?.theme || 'classic';
        const colors = getThemeColors(theme, config?.customFields?.customColor);

        const themeStyle = {
          classic: `border: 1px solid #d4d4d8; background-color: #ffffff; color: #18181b;`,
          emerald: `border: 1px solid #a7f3d0; background-color: rgba(236, 253, 245, 0.2); color: #064e3b;`,
          indigo: `border: 1px solid #c7d2fe; background-color: rgba(224, 231, 255, 0.2); color: #1e1b4b;`,
          crimson: `border: 1px solid #fecdd3; background-color: rgba(255, 241, 242, 0.2); color: #4c0519;`,
          slate: `border: 1px solid #cbd5e1; background-color: #f8fafc; color: #0f172a;`,
          amber: `border: 1px solid #fde68a; background-color: rgba(255, 251, 235, 0.2); color: #451a03;`,
          violet: `border: 1px solid #ddd6fe; background-color: rgba(245, 243, 255, 0.2); color: #2e1065;`,
          orange: `border: 1px solid #fed7aa; background-color: rgba(255, 247, 237, 0.2); color: #431407;`,
          teal: `border: 1px solid #99f6e4; background-color: rgba(240, 253, 250, 0.2); color: #042f2e;`,
          fuchsia: `border: 1px solid #f5d0fe; background-color: rgba(253, 244, 255, 0.2); color: #4a044e;`,
          custom: `border: 1px solid ${colors.borderAccent}; background-color: ${colors.bgAccent}; color: #18181b;`,
        }[theme] || `border: 1px solid #d4d4d8; background-color: #ffffff; color: #18181b;`;

        const borderStyleToUse = (config?.customFields?.guideEnabled !== false)
          ? `border: 1px dashed ${guideBorderColor};`
          : `border: 1px solid ${colors.borderAccent || '#e4e4e7'};`;

        const cellWatermarkHtml = buildWatermarkHtml(config, watermarkTheme, true);

        const formattedPrice = Number(activeProduct.price || 0).toLocaleString('pt-BR', {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2
        });

        let stickerInnerHtml = '';
        if (isVertical) {
          stickerInnerHtml = `
            <div style="position: relative; z-index: 10; display: flex; flex-direction: column; align-items: center; justify-content: space-between; text-align: center; width: 100%; height: 100%;">
              <div style="width: 100%; border-bottom: 1px solid #e4e4e7; padding-bottom: 2px;">
                ${config?.customFields?.showName !== false ? `<span style="font-weight: 900; font-size: 7.5px; text-transform: uppercase; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; display: block; max-width: 100%;">${activeProduct.name}</span>` : ''}
                ${config?.customFields?.showCategory !== false ? `<span style="font-weight: bold; font-size: 6px; text-transform: uppercase; color: #71717a; display: block; margin-top: 1px;">${activeProduct.category}</span>` : ''}
              </div>

              ${config?.customFields?.showQrCode !== false ? `
                <div style="width: ${qrCodeDim}mm; height: ${qrCodeDim}mm; background: white; border: 1px solid #d4d4d8; padding: 2px; border-radius: 4px; display: flex; align-items: center; justify-content: center; box-sizing: border-box; overflow: hidden; margin: 4px 0;">
                  ${qrCodeSvg}
                </div>
              ` : ''}

              <div style="width: 100%; line-height: 1.1;">
                ${config?.customFields?.showSku !== false ? `<p style="margin: 0; font-size: 6.5px; font-weight: bold; font-family: monospace;"><span style="font-size: 5.5px; font-family: sans-serif; text-transform: uppercase; color: #71717a; margin-right: 4px;">SKU:</span>${activeProduct.code}</p>` : ''}
                ${config?.customFields?.showVariation !== false ? `<p style="margin: 0; font-size: 6.5px; font-weight: bold; font-family: monospace;"><span style="font-size: 5.5px; font-family: sans-serif; text-transform: uppercase; color: #71717a; margin-right: 4px;">VAR:</span>${activeProduct.variation}</p>` : ''}
                ${config?.customFields?.showStock !== false ? `<p style="margin: 0; font-size: 6.5px; font-weight: bold; font-family: monospace;"><span style="font-size: 5.5px; font-family: sans-serif; text-transform: uppercase; color: #71717a; margin-right: 4px;">ESTOQUE:</span>${activeProduct.stock} UN</p>` : ''}
              </div>

              <div style="width: 100%; border-top: 1px solid #e4e4e7; padding-top: 2px; margin-top: 2px;">
                ${config?.customFields?.showPrice !== false ? `
                  <div style="line-height: 1.1;">
                    <span style="font-size: 5px; font-weight: bold; text-transform: uppercase; color: #71717a; display: block;">Preço</span>
                    <span style="font-weight: 900; font-size: 9.5px; color: ${colors.textAccent};">R$ ${formattedPrice}</span>
                  </div>
                ` : ''}
              </div>
            </div>
          `;
        } else {
          stickerInnerHtml = `
            <div style="position: relative; z-index: 10; display: flex; flex-direction: column; justify-content: space-between; text-align: left; width: 100%; height: 100%;">
              <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid #e4e4e7; padding-bottom: 2px; font-size: 7.5px;">
                ${config?.customFields?.showName !== false ? `<span style="font-weight: 900; text-transform: uppercase; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 65%;">${activeProduct.name}</span>` : ''}
                ${config?.customFields?.showCategory !== false ? `<span style="font-weight: bold; text-transform: uppercase; color: #71717a; text-align: right; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 30%;">${activeProduct.category}</span>` : ''}
              </div>

              <div style="display: flex; align-items: center; justify-content: space-between; gap: 4px; flex: 1; margin: 4px 0;">
                <div style="display: flex; flex-direction: column; justify-content: center; gap: 2px; line-height: 1.1;">
                  ${config?.customFields?.showSku !== false ? `<p style="margin: 0; font-size: 6px; font-weight: bold; font-family: monospace;"><span style="font-size: 5.5px; font-family: sans-serif; text-transform: uppercase; color: #71717a; margin-right: 4px;">SKU:</span>${activeProduct.code}</p>` : ''}
                  ${config?.customFields?.showVariation !== false ? `<p style="margin: 0; font-size: 6px; font-weight: bold; font-family: monospace;"><span style="font-size: 5.5px; font-family: sans-serif; text-transform: uppercase; color: #71717a; margin-right: 4px;">VAR:</span>${activeProduct.variation}</p>` : ''}
                  ${config?.customFields?.showStock !== false ? `<p style="margin: 0; font-size: 6px; font-weight: bold; font-family: monospace;"><span style="font-size: 5.5px; font-family: sans-serif; text-transform: uppercase; color: #71717a; margin-right: 4px;">QTD:</span>${activeProduct.stock} UN</p>` : ''}
                </div>

                ${config?.customFields?.showQrCode !== false ? `
                  <div style="width: ${qrCodeDim}mm; height: ${qrCodeDim}mm; background: white; border: 1px solid #d4d4d8; padding: 2px; border-radius: 4px; display: flex; align-items: center; justify-content: center; box-sizing: border-box; overflow: hidden; flex-shrink: 0;">
                    ${qrCodeSvg}
                  </div>
                ` : ''}
              </div>

              <div style="border-top: 1px solid #e4e4e7; padding-top: 2px; display: flex; justify-content: space-between; align-items: flex-end;">
                ${config?.customFields?.showPrice !== false ? `
                  <div style="line-height: 1.1;">
                    <span style="font-size: 5px; font-weight: bold; text-transform: uppercase; color: #71717a; display: block;">Preço</span>
                    <span style="font-weight: 950; font-size: 8px; color: ${colors.textAccent};">R$ ${formattedPrice}</span>
                  </div>
                ` : '<div></div>'}
              </div>
            </div>
          `;
        }

        pageCellsHtml.push(`
          <div 
            class="print-hide-guide"
            style="
              ${themeStyle}
              ${borderStyleToUse}
              position: relative;
              box-sizing: border-box;
              width: ${labelWidth}mm;
              height: ${labelHeight}mm;
              padding: 4px;
              border-radius: 4px;
              overflow: hidden;
              box-shadow: 0 1px 3px rgba(0,0,0,0.02);
            "
          >
            ${cellWatermarkHtml}
            ${stickerInnerHtml}
          </div>
        `);
      }
    }

    pagesHtml.push(`
      <div 
        class="print-page"
        style="
          display: grid;
          position: relative;
          background-color: white;
          grid-template-columns: repeat(${cols}, ${labelWidth}mm);
          grid-template-rows: repeat(${rows}, ${labelHeight}mm);
          column-gap: ${gapX}mm;
          row-gap: ${gapY}mm;
          padding-top: ${marginTop}mm;
          padding-bottom: ${marginBottom}mm;
          padding-left: ${marginLeft}mm;
          padding-right: ${marginRight}mm;
          box-sizing: border-box;
          width: ${sizeConfig.widthMm}mm;
          height: ${sizeConfig.heightMm === 'auto' ? '297mm' : `${sizeConfig.heightMm}mm`};
          align-content: start;
          justify-content: start;
          page-break-after: always;
          overflow: hidden;
        "
      >
        ${pageCellsHtml.join('')}
      </div>
    `);
  }

  return `<!DOCTYPE html>
<html lang="pt-BR" style="background-color: white !important;">
<head>
  <meta charset="UTF-8">
  <title>Etiquetas de Produtos - Lukasfe ERP</title>
  <style>
    @page {
      size: ${sizeConfig.widthMm}mm ${sizeConfig.heightMm === 'auto' ? '297mm' : `${sizeConfig.heightMm}mm`};
      margin: 0 !important;
    }
    @media print {
      .print-hide-guide {
        border-color: transparent !important;
        background-color: transparent !important;
        background-image: none !important;
        box-shadow: none !important;
      }
    }
    @media screen {
      .print-page {
        margin-bottom: 12px;
        box-shadow: 0 4px 10px rgba(0,0,0,0.08);
      }
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
      width: ${sizeConfig.widthMm}mm;
      height: auto;
      margin: 0 !important;
    }
  </style>
</head>
<body style="background-color: white !important;">
  ${pagesHtml.join('')}
</body>
</html>`;
}
