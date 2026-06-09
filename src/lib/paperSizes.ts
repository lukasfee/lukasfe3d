import React from 'react';
import { DOCUMENT_SIZES } from '../services/printEngine/documentSizes';

export type PaperSize = '58mm' | '80mm' | 'A4' | 'A5' | 'A6' | '50x80' | '58x80' | 'custom' | '40x30';
export type Orientation = 'portrait' | 'landscape';
export type PaperType = 'thermal' | 'sheet' | 'label' | 'custom';

export interface PaperConfig {
  id: PaperSize;
  name: string;
  widthMm: number;
  heightMm: number | 'auto';
  orientation: Orientation;
  type: PaperType;
  marginMm: number;
}

// Derive from single canonical source: DOCUMENT_SIZES
const getDocSize = (id: string, defaultId: string = 'A6') => {
  return DOCUMENT_SIZES[id] || DOCUMENT_SIZES[defaultId];
};

export const PAPER_SIZES = {
  "58mm": { widthMm: getDocSize('58mm').widthMm, heightMm: getDocSize('58mm').heightMm as 'auto', type: getDocSize('58mm').type as 'thermal' },
  "80mm": { widthMm: getDocSize('80mm').widthMm, heightMm: getDocSize('80mm').heightMm as 'auto', type: getDocSize('80mm').type as 'thermal' },
  "A6": { widthMm: getDocSize('A6').widthMm, heightMm: getDocSize('A6').heightMm as number, type: getDocSize('A6').type as 'sheet' },
  "A5": { widthMm: getDocSize('A5').widthMm, heightMm: getDocSize('A5').heightMm as number, type: getDocSize('A5').type as 'sheet' },
  "A4": { widthMm: getDocSize('A4').widthMm, heightMm: getDocSize('A4').heightMm as number, type: getDocSize('A4').type as 'sheet' }
};

export const PAPER_SPECS: Record<Exclude<PaperSize, 'custom'>, Omit<PaperConfig, 'id' | 'orientation'>> = {
  '58mm': { 
    name: getDocSize('58mm').name, 
    widthMm: getDocSize('58mm').widthMm, 
    heightMm: getDocSize('58mm').heightMm, 
    type: getDocSize('58mm').type, 
    marginMm: getDocSize('58mm').marginMm 
  },
  '80mm': { 
    name: getDocSize('80mm').name, 
    widthMm: getDocSize('80mm').widthMm, 
    heightMm: getDocSize('80mm').heightMm, 
    type: getDocSize('80mm').type, 
    marginMm: getDocSize('80mm').marginMm 
  },
  'A4': { 
    name: getDocSize('A4').name, 
    widthMm: getDocSize('A4').widthMm, 
    heightMm: getDocSize('A4').heightMm as number, 
    type: getDocSize('A4').type, 
    marginMm: getDocSize('A4').marginMm 
  },
  'A5': { 
    name: getDocSize('A5').name, 
    widthMm: getDocSize('A5').widthMm, 
    heightMm: getDocSize('A5').heightMm as number, 
    type: getDocSize('A5').type, 
    marginMm: getDocSize('A5').marginMm 
  },
  'A6': { 
    name: getDocSize('A6').name, 
    widthMm: getDocSize('A6').widthMm, 
    heightMm: getDocSize('A6').heightMm as number, 
    type: getDocSize('A6').type, 
    marginMm: getDocSize('A6').marginMm 
  },
  '50x80': {
    name: 'Etiqueta 50x80',
    widthMm: 50,
    heightMm: 80,
    type: 'label',
    marginMm: 0
  },
  '58x80': {
    name: 'Etiqueta 58x80',
    widthMm: 58,
    heightMm: 80,
    type: 'label',
    marginMm: 0
  },
  '40x30': {
    name: 'Etiqueta 40x30mm',
    widthMm: 40,
    heightMm: 30,
    type: 'label',
    marginMm: 0
  }
};

/**
 * PaperEngine: The single source of truth for paper dimensions and behavior.
 */
export function getPaperConfig(
  size: PaperSize,
  orientation: Orientation = 'portrait',
  customWidth?: number,
  customHeight?: number
): PaperConfig {
  let config: PaperConfig;

  if (size === 'custom') {
    config = {
      id: 'custom',
      name: 'Customizado',
      widthMm: customWidth || 80,
      heightMm: customHeight || 0,
      orientation,
      type: 'custom',
      marginMm: 0
    };
  } else {
    // Fallback safely if size is not in specs
    const spec = PAPER_SPECS[size as keyof typeof PAPER_SPECS] || PAPER_SPECS['80mm'];
    config = {
      ...spec,
      id: size as PaperSize,
      orientation
    };
  }

  // Handle Orientation swap for sheets
  if (orientation === 'landscape' && typeof config.heightMm === 'number' && config.heightMm > 0) {
    const oldWidth = config.widthMm;
    config.widthMm = config.heightMm;
    config.heightMm = oldWidth;
  }

  return config;
}

/**
 * Converts mm to pixels (assuming 96 DPI)
 */
export function mmToPx(mm: number): number {
  return mm * 3.7795275591;
}

/**
 * Returns CSS variables and styles for a paper container based on PaperEngine.
 */
export function getPaperStyles(config: PaperConfig): React.CSSProperties {
  const isThermal = config.type === 'thermal';
  const hasFixedHeight = typeof config.heightMm === 'number' && config.heightMm > 0;
  
  return {
    width: `${config.widthMm}mm`,
    height: hasFixedHeight ? `${config.heightMm}mm` : 'auto',
    padding: `${config.marginMm}mm`,
    backgroundColor: 'white',
    color: 'black',
    margin: '0 auto',
    boxSizing: 'border-box',
    position: 'relative',
    overflow: hasFixedHeight ? 'hidden' : 'visible',
    display: 'flex',
    flexDirection: 'column'
  };
}

/**
 * Returns exact display specs for the UI
 */
export function getPaperSpecsDisplay(config: PaperConfig) {
  const isThermal = config.type === 'thermal' || (config.type === 'custom' && !config.heightMm);
  const hDesc = isThermal ? 'Contínuo' : `${config.heightMm}mm`;
  
  // Real margins and dimensions
  const w = config.widthMm;
  const h = typeof config.heightMm === 'number' ? config.heightMm : 0;
  const m = config.marginMm;
  
  const areaUtil = `${w - (m * 2)}mm x ${h ? (h - (m * 2)) + 'mm' : '---'}`;
  
  return {
    formato: config.name,
    dimensoes: `${w}mm x ${hDesc}`,
    direcao: config.orientation === 'portrait' ? 'Vertical' : 'Horizontal',
    margem: `${m}mm (Fixo)`,
    areaUtil,
    escala: config.id === 'A4' ? '240% (Ajustado)' : '100%'
  };
}

/**
 * Calculates a font scale factor based on paper width
 * taking 80mm as the base (1.0)
 * This is crucial for A4 content to look proportional.
 */
export function getFontScaleFactor(config: PaperConfig): number {
  if (config.id === 'A4') return 2.35; // Precision fit for 210mm
  if (config.id === 'A5') return 1.65; // Precision fit for 148mm
  if (config.id === 'A6') return 1.15; // Precision fit for 105mm

  if (config.id === '58mm') return 0.72;
  return 1.0;
}

/**
 * Generates the definitive @page CSS rule for printing.
 */
export function getPageStyle(config: PaperConfig): string {
  const isThermal = config.type === 'thermal' || (config.type === 'custom' && !config.heightMm);
  const h = isThermal ? 'auto' : `${config.heightMm}mm`;
  const isLandscape = config.orientation === 'landscape';
  
  return `
    @page { margin: 0 !important; }
    @page {
      size: ${config.widthMm}mm ${h} ${isLandscape ? 'landscape' : 'portrait'};
      margin: 0 !important;
    }
    @media print {
      html, body, .container, .print-template-renderer, .universal-paper-container, .print-template-content, .recibo-a6, .order-ticket, .product-label-sheet, .badge-content { 
        width: 100% !important; 
        max-width: 100% !important; 
        margin: 0 !important; 
        box-sizing: border-box !important;
      }
      body { 
        padding: 0 !important; 
        margin: 0 !important;
        background: white !important;
        -webkit-print-color-adjust: exact !important;
        print-color-adjust: exact !important;
        overflow: visible !important;
        height: auto !important;
      }
      .no-print { display: none !important; }
      
      /* Reset common layout containers that might interfere */
      #root, .app-container { 
        width: 100% !important; 
        margin: 0 !important; 
        padding: 0 !important; 
        display: block !important;
        box-sizing: border-box !important;
      }

      /* TABLES, DASHED LINES AND INTERNAL ELEMENTS */
      table, .divider, .linha, .cy-divider, .bd-divider, .hr {
        width: 100% !important;
        box-sizing: border-box !important;
      }
      tr, td, th {
        box-sizing: border-box !important;
      }
      img, svg {
        max-width: 100% !important;
        height: auto !important;
      }
    }
  `;
}

/**
 * Returns debug info for the current paper configuration.
 */
export function getPaperDebugInfo(config: PaperConfig): string {
  const hDesc = config.heightMm === 'auto' || !config.heightMm ? 'Auto' : `${config.heightMm}mm`;
  return `Papel: ${config.name} | ${config.widthMm}mm x ${hDesc} | ${config.orientation.toUpperCase()}`;
}

/**
 * Returns preset dimensions and margins for labels based on the selected paper size.
 */
export function getLabelPresetForPaperSize(size: PaperSize, orientation: Orientation = 'portrait') {
  switch (size) {
    case 'A4':
      return {
        labelWidth: 90,
        labelHeight: 35,
        horizontalSpacing: 2,
        verticalSpacing: 2,
        marginTop: 0,
        marginBottom: 0,
        marginLeft: 0,
        marginRight: 0,
        fontSize: 10,
        qrCodeSize: 32,
        orientation: 'landscape' as Orientation,
        previewQuantity: 24,
      };
    case 'A5':
      return {
        labelWidth: 60,
        labelHeight: 30,
        horizontalSpacing: 4,
        verticalSpacing: 4,
        marginTop: 0,
        marginBottom: 0,
        marginLeft: 0,
        marginRight: 0,
        fontSize: 9,
        qrCodeSize: 28,
        orientation: 'landscape' as Orientation,
        previewQuantity: 12,
      };
    case 'A6':
      return {
        labelWidth: 44, // reduced so it fits nicely inside A6 (105mm width) with 2 columns
        labelHeight: 36,
        horizontalSpacing: 3,
        verticalSpacing: 3,
        marginTop: 0,
        marginBottom: 0,
        marginLeft: 0,
        marginRight: 0,
        fontSize: 8,
        qrCodeSize: 20,
        orientation: 'portrait' as Orientation,
        previewQuantity: 4,
      };
    case '40x30': {
      const isVert = orientation === 'portrait';
      return {
        labelWidth: isVert ? 30 : 40,
        labelHeight: isVert ? 40 : 30,
        horizontalSpacing: 0,
        verticalSpacing: 0,
        marginTop: 0,
        marginBottom: 0,
        marginLeft: 0,
        marginRight: 0,
        fontSize: 7.5,
        qrCodeSize: 18,
        orientation: isVert ? ('portrait' as Orientation) : ('landscape' as Orientation),
        previewQuantity: 1,
      };
    }
    case '58mm':
      return {
        labelWidth: 54,
        labelHeight: 40,
        horizontalSpacing: 0,
        verticalSpacing: 2,
        marginTop: 0,
        marginBottom: 0,
        marginLeft: 0,
        marginRight: 0,
        fontSize: 8,
        qrCodeSize: 18,
        orientation: 'portrait' as Orientation,
        previewQuantity: 2,
      };
    case '80mm':
      return {
        labelWidth: 74,
        labelHeight: 50,
        horizontalSpacing: 0,
        verticalSpacing: 2,
        marginTop: 0,
        marginBottom: 0,
        marginLeft: 0,
        marginRight: 0,
        fontSize: 9,
        qrCodeSize: 24,
        orientation: 'portrait' as Orientation,
        previewQuantity: 2,
      };
    default:
      return {
        labelWidth: 90,
        labelHeight: 35,
        horizontalSpacing: 2,
        verticalSpacing: 2,
        marginTop: 0,
        marginBottom: 0,
        marginLeft: 0,
        marginRight: 0,
        fontSize: 10,
        qrCodeSize: 32,
        orientation: orientation,
        previewQuantity: 24,
      };
  }
}

