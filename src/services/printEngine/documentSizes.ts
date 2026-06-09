/**
 * Lukasfe ERP - Print Engine Document Sizes
 * Standard sizes, conversions, and layout configs.
 */

import { useStore } from '../../store';
import { getThemeColors } from './templates/shared';

export interface DocumentSize {
  id: string;
  name: string;
  widthMm: number;
  heightMm: number | 'auto';
  marginMm: number;
  type: 'thermal' | 'sheet' | 'label';
}

export const DOCUMENT_SIZES: Record<string, DocumentSize> = {
  A4: {
    id: 'A4',
    name: 'A4 (210mm × 297mm)',
    widthMm: 210,
    heightMm: 297,
    marginMm: 0,
    type: 'sheet'
  },
  A5: {
    id: 'A5',
    name: 'A5 (148mm × 210mm)',
    widthMm: 148,
    heightMm: 210,
    marginMm: 0,
    type: 'sheet'
  },
  A6: {
    id: 'A6',
    name: 'A6 (105mm × 148mm)',
    widthMm: 105,
    heightMm: 148,
    marginMm: 0,
    type: 'sheet'
  },
  '40x30': {
    id: '40x30',
    name: 'Etiqueta 40mm × 30mm',
    widthMm: 40,
    heightMm: 30,
    marginMm: 0,
    type: 'label'
  },
  '80mm': {
    id: '80mm',
    name: 'Bobina 80mm',
    widthMm: 80,
    heightMm: 'auto',
    marginMm: 0,
    type: 'thermal'
  },
  '58mm': {
    id: '58mm',
    name: 'Bobina 58mm',
    widthMm: 58,
    heightMm: 'auto',
    marginMm: 0,
    type: 'thermal'
  }
};

/**
 * Parses any custom physical driver media option name (e.g., 'Roll 80mm', '10x15', '100x150')
 * into exact physical width, height, and content layout constraints.
 */
export function parseMediaNameToDimensions(mediaName: string): DocumentSize {
  if (!mediaName) {
    return {
      id: '80mm',
      name: 'Bobina 80mm',
      widthMm: 80,
      heightMm: 'auto',
      marginMm: 0,
      type: 'thermal'
    };
  }

  const normalized = mediaName.toLowerCase().replace(/\s+/g, '');
  const marginMm = 0; // Forced to 0 in ERP context to prevent cutoffs

  // 1. Checks for thermal roll formats
  if (normalized.includes('80mm') || normalized.includes('bobina80') || normalized.includes('roll80') || normalized.includes('t20')) {
    return {
      id: mediaName,
      name: mediaName,
      widthMm: 80,
      heightMm: 'auto',
      marginMm,
      type: 'thermal'
    };
  }
  if (normalized.includes('58mm') || normalized.includes('bobina58') || normalized.includes('roll58') || normalized.includes('58x') || normalized.includes('58')) {
    return {
      id: mediaName,
      name: mediaName,
      widthMm: 58,
      heightMm: 'auto',
      marginMm,
      type: 'thermal'
    };
  }

  // 2. Standard ISO sheet sizes
  if (normalized.includes('a4')) {
    return {
      id: mediaName,
      name: mediaName,
      widthMm: 210,
      heightMm: 297,
      marginMm,
      type: 'sheet'
    };
  }
  if (normalized.includes('a5')) {
    return {
      id: mediaName,
      name: mediaName,
      widthMm: 148,
      heightMm: 210,
      marginMm,
      type: 'sheet'
    };
  }
  if (normalized.includes('a6')) {
    return {
      id: mediaName,
      name: mediaName,
      widthMm: 105,
      heightMm: 148,
      marginMm,
      type: 'sheet'
    };
  }

  // 3. Label photo dimensions "10x15", "4x6" (typical courier shipping/coupons/badges)
  if (normalized.includes('10x15') || normalized.includes('4x6') || normalized.includes('100x150')) {
    return {
      id: mediaName,
      name: mediaName,
      widthMm: 101.6, // 4 inches
      heightMm: 152.4, // 6 inches
      marginMm,
      type: 'label'
    };
  }

  // 4. Custom dimension regex parse (width x height in mm or cm or generic numbers)
  // Supports decimals, comma decimal points (e.g. 10,16x15,24), and various separators (*, x, _, by)
  const cleanStr = normalized.replace(/,/g, '.');
  const decimalRegex = /(\d+(?:\.\d+)?)\s*(?:mm|cm)?\s*(?:[x*_]|by)\s*(\d+(?:\.\d+)?)\s*(?:mm|cm)?/i;
  const match = decimalRegex.exec(cleanStr);
  
  if (match) {
    let w = parseFloat(match[1]);
    let h = parseFloat(match[2]);
    const isCm = cleanStr.includes('cm') || (!cleanStr.includes('mm') && w < 30 && h < 30);
    
    if (isCm) {
      w = w * 10;
      h = h * 10;
    }
    
    return {
      id: mediaName,
      name: mediaName,
      widthMm: w,
      heightMm: h,
      marginMm,
      type: 'label'
    };
  }

  // Default Fallback
  return {
    id: mediaName,
    name: mediaName,
    widthMm: 80,
    heightMm: 'auto',
    marginMm,
    type: 'thermal'
  };
}

/**
 * MM to Pixel conversion factor (at 96 DPI, 1 inch = 25.4mm = 96px => 1mm = 3.7795px)
 */
export function mmToPx(mm: number): number {
  return mm * 3.7795275591;
}

/**
 * Returns exact stylesheet injection block based on size config, avoiding layout breaking.
 */
export function getPageCssRule(size: DocumentSize, landscape: boolean = false): string {
  const isAutoHeight = size.heightMm === 'auto';
  const widthStr = `${size.widthMm}mm`;
  const heightStr = isAutoHeight ? 'auto' : `${size.heightMm}mm`;
  const sizeRule = landscape ? `${heightStr} ${widthStr}` : `${widthStr} ${heightStr}`;

  return `
    @page {
      size: ${sizeRule};
      margin: 0 !important;
    }
    @media print {
      body {
        margin: 0 !important;
        padding: ${size.marginMm}mm !important;
        width: ${landscape ? heightStr : widthStr} !important;
        height: ${landscape ? widthStr : heightStr} !important;
        box-sizing: border-box !important;
      }
      .print-area {
        width: 100% !important;
        max-width: 100% !important;
        margin: 0 !important;
        box-sizing: border-box !important;
      }
    }
  `;
}

export interface DocumentGeometry {
  paperId: string;
  paperWidthMm: number;
  paperHeightMm: number | 'auto';
  isRoll: boolean;
  orientation: 'portrait' | 'landscape';
  marginMm: number;
  scale: number;
  driverMediaName: string;
  cssPageRule: string;
  pdfFormat: string | [number, number];
}

/**
 * Single source of truth for resolving document bounds, margins, orientation, and scaling
 * across the Preview, PDF Generator, and background sequential Spooler.
 */
export function resolveDocumentGeometry(
  documentType: string,
  documentConfig: { paperSize?: string; rotation?: number; copies?: number; margins?: { top?: number } } | null,
  printerBinding?: { paperErpId?: string; driverPaperName?: string; orientation?: 'portrait' | 'landscape'; marginMm?: number; scale?: number; safeModeActive?: boolean } | null,
  mediaMapping?: { driverPaperName?: string; orientation?: 'portrait' | 'landscape'; marginMm?: number; scale?: number; safeMode?: boolean } | null
): DocumentGeometry {
  // Normalize both component tab IDs and store logical document target names
  let logicalDocId = documentType;
  if (documentType === 'reciboTermico') logicalDocId = 'thermal_receipt';
  else if (documentType === 'cupomPedido') logicalDocId = 'order_ticket';
  else if (documentType === 'etiqueta') logicalDocId = 'labels';
  else if (documentType === 'etiquetaLote') logicalDocId = 'bulk_labels';
  else if (documentType === 'mensagemCliente') logicalDocId = 'customer_experience';

  // 1. Resolve Paper Size
  let paperId = 'A6';
  if (printerBinding && printerBinding.paperErpId) {
    paperId = printerBinding.paperErpId;
  } else if (documentConfig && documentConfig.paperSize) {
    paperId = documentConfig.paperSize;
  } else {
    // Standard fallbacks based on document format
    if (['thermal_receipt', 'order_ticket', 'customer_experience'].includes(logicalDocId)) {
      paperId = '80mm';
    } else {
      paperId = 'A6';
    }
  }

  // 1. Resolve Driver physical media name mapping
  let driverMediaName = paperId;
  if (mediaMapping && mediaMapping.driverPaperName) {
    driverMediaName = mediaMapping.driverPaperName;
  } else if (printerBinding && printerBinding.driverPaperName) {
    driverMediaName = printerBinding.driverPaperName;
  }

  // Parse size definition dynamically using the driver media name if available, otherwise fallback to the erpId
  let sizeDef = DOCUMENT_SIZES[paperId] || DOCUMENT_SIZES['A6'];
  if (driverMediaName) {
    const matchedKey = Object.keys(DOCUMENT_SIZES).find(k => k.toLowerCase() === driverMediaName.toLowerCase());
    if (matchedKey) {
      sizeDef = DOCUMENT_SIZES[matchedKey];
    } else {
      sizeDef = parseMediaNameToDimensions(driverMediaName);
    }
  }

  const paperWidthMm = sizeDef.widthMm;
  const paperHeightMm = sizeDef.heightMm;
  const isRoll = sizeDef.heightMm === 'auto';

  // 2. Resolve Orientation
  let orientation: 'portrait' | 'landscape' = 'portrait';
  if (mediaMapping && mediaMapping.orientation) {
    orientation = mediaMapping.orientation;
  } else if (printerBinding && printerBinding.orientation) {
    orientation = printerBinding.orientation;
  } else if (documentConfig && (documentConfig.rotation === 90 || documentConfig.rotation === 270)) {
    orientation = 'landscape';
  }

  // 3. Resolve Margins - ALWAYS locked to 0 in ERP to prevent printhead clipping
  const marginMm = 0;

  // 4. Resolve Scale
  let scale = 1.0;
  if (mediaMapping && mediaMapping.scale !== undefined) {
    scale = mediaMapping.scale;
  } else if (printerBinding && printerBinding.scale !== undefined) {
    scale = printerBinding.scale;
  }

  // 6. Generate accurate CSS injection block
  const cssPageRule = getPageCssRule({
    id: paperId,
    name: sizeDef.name,
    widthMm: paperWidthMm,
    heightMm: paperHeightMm,
    marginMm: marginMm,
    type: sizeDef.type
  }, orientation === 'landscape');

  // 7. Format array representation for jsPDF engine
  const pdfFormat: string | [number, number] = isRoll ? [paperWidthMm, 1200] : [paperWidthMm, paperHeightMm as number];

  return {
    paperId,
    paperWidthMm,
    paperHeightMm,
    isRoll,
    orientation,
    marginMm,
    scale,
    driverMediaName,
    cssPageRule,
    pdfFormat
  };
}

export interface CanonicalDocumentConfig {
  documentType: string;
  paper: DocumentGeometry;
  geometry: DocumentGeometry;
  printerMode: 'pdf_manual' | 'physical_printer';
  printerName: string;
  selectedDriverMediaName: string;
  themeId?: string;
  theme: string;
  backgroundTheme: string;
  watermark: string;
  watermarkTheme?: any;
  colors: any;
  fonts: string;
  customFields: any;
  margin: number;
  scale: number;
  orientation: 'portrait' | 'landscape';
}

export function resolveCanonicalDocumentConfig(documentType: string): CanonicalDocumentConfig {
  const state = useStore.getState();
  
  // 1. Normalize documentType
  let docId = documentType;
  if (docId === 'reciboTermico') docId = 'thermal_receipt';
  else if (docId === 'cupomPedido') docId = 'order_ticket';
  else if (docId === 'etiqueta') docId = 'labels';
  else if (docId === 'etiquetaLote') docId = 'bulk_labels';
  else if (docId === 'mensagemCliente') docId = 'customer_experience';
  else if (docId === 'cracha') docId = 'badge';

  // 2. Fetch logical client config based on Normalized document id
  let logicalConfig: any = {};
  if (docId === 'thermal_receipt') {
    logicalConfig = state.receiptConfig || {};
  } else if (docId === 'order_ticket') {
    logicalConfig = state.orderTicketConfig || {};
  } else if (docId === 'labels') {
    logicalConfig = state.labelConfig || {};
  } else if (docId === 'bulk_labels') {
    logicalConfig = state.labelBatchConfig || state.labelConfig || {};
  } else if (docId === 'customer_experience') {
    logicalConfig = state.customerExperienceConfig || {};
  } else if (docId === 'badge') {
    logicalConfig = state.badgeConfig || {};
  }

  // 3. Find printer binding/mapping inside documentPrintConfigs
  const binding = (state.documentPrintConfigs || []).find((c: any) => c.documentId === docId || (docId === 'badge' && c.documentId === 'cracha'));

  // 4. Resolve exact geometry/paper parameters using existing resolveDocumentGeometry
  const geometry = resolveDocumentGeometry(
    docId,
    {
      paperSize: logicalConfig.paperSize,
      rotation: logicalConfig.printRotation || logicalConfig.rotation,
      copies: logicalConfig.copies
    },
    binding,
    null
  );

  // 5. Gather visual config attributes, making sure imageThemes lists are mapped
  const themeId = logicalConfig.themeId;
  const theme = logicalConfig.theme || 'classic';
  const customFields = logicalConfig.customFields || logicalConfig || {};
  
  const imageThemes = (state as any).imageThemes || [];
  const watermarkThemeObj = imageThemes.find((t: any) => t.id === themeId) || null;
  
  const colors = getThemeColors(theme, customFields?.customColor);
  const watermark = watermarkThemeObj?.backgroundImage || '';
  const backgroundTheme = watermarkThemeObj?.backgroundColor || '';
  const fonts = watermarkThemeObj?.fontName || '';

  // Determine printer properties
  const printerMode: 'pdf_manual' | 'physical_printer' = 
    (!binding || binding.printerId === 'pdf-manual' || binding.pdfManualActive) ? 'pdf_manual' : 'physical_printer';
  
  // Find real printer name in printers list if physical
  const boundPrinter = (state.printers || []).find((p: any) => p.id === binding?.printerId);
  const printerName = boundPrinter?.name || binding?.printerId || 'PDF Manual/E-mail';

  const selectedDriverMediaName = geometry.driverMediaName || '';
  const margin = geometry.marginMm;
  const scale = geometry.scale;
  const orientation = geometry.orientation;

  return {
    documentType: docId,
    paper: geometry,
    geometry,
    printerMode,
    printerName,
    selectedDriverMediaName,
    themeId,
    theme,
    backgroundTheme,
    watermark,
    watermarkTheme: watermarkThemeObj,
    colors,
    fonts,
    customFields,
    margin,
    scale,
    orientation
  };
}

export function resolveTemplateDimensions(paperSize: string): DocumentSize {
  const matchedKey = Object.keys(DOCUMENT_SIZES).find(k => k.toLowerCase() === (paperSize || '').toLowerCase());
  if (matchedKey) {
    return DOCUMENT_SIZES[matchedKey];
  }
  return parseMediaNameToDimensions(paperSize);
}
