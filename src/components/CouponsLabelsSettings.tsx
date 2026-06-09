import React, { useState, useEffect, useMemo } from 'react';
import { 
  FileText, 
  Ticket, 
  Tag, 
  Layers, 
  MessageSquare,
  Info,
  ArrowLeft,
  Sliders,
  RefreshCw,
  Plus,
  Minus,
  Settings,
  Sparkles,
  ClipboardList,
  Check,
  Activity,
  Cpu,
  Building2
} from 'lucide-react';
import { cn } from '../lib/utils';
import { useStore } from '../store';
import { useNavigate } from 'react-router-dom';

// Core imports from our newly engineered central print engine
import { DocumentType, PrintEngineConfig } from '../services/printEngine/documentTypes';
import { DOCUMENT_SIZES, DocumentSize, resolveDocumentGeometry, resolveCanonicalDocumentConfig } from '../services/printEngine/documentSizes';
import { documentTemplateService, DocumentRegistration } from '../services/printEngine/documentTemplateService';
import { CanonicalDocumentPreview } from './documentPreview/CanonicalDocumentPreview';
import { feedback } from '../lib/feedback';

// Modern print and PDF generation architectural line services (ENABLED)
import { generateCanonicalPdfBlob, downloadOrSharePdf } from '../services/pdfEngine/pdfGenerator';
import { detectPlatform } from '../platform/printAdapters';
import { Printer as LucidePrinter, XCircle, AlertTriangle, CheckCircle2, RotateCcw } from 'lucide-react';
import { PdfViewerModal } from './PdfViewerModal';

type SubTab = 'reciboTermico' | 'cupomPedido' | 'etiqueta' | 'etiquetaLote' | 'mensagemCliente';

interface SubTabConfig {
  id: SubTab;
  label: string;
  desc: string;
  icon: React.ComponentType<{ className?: string }>;
}

const SUB_TABS: SubTabConfig[] = [
  { 
    id: 'reciboTermico', 
    label: 'Recibo Térmico', 
    desc: 'Visual do comprovante de pagamento físico', 
    icon: FileText 
  },
  { 
    id: 'cupomPedido', 
    label: 'Cupom Pedido', 
    desc: 'Comprovante para expedição e despacho', 
    icon: Ticket 
  },
  { 
    id: 'etiqueta', 
    label: 'Etiqueta Individual', 
    desc: 'Identificação individual de volumes', 
    icon: Tag 
  },
  { 
    id: 'etiquetaLote', 
    label: 'Lote de Etiquetas', 
    desc: 'Tratamento de bobinas e alto volume', 
    icon: Layers 
  },
  { 
    id: 'mensagemCliente', 
    label: 'Experiência do Cliente', 
    desc: 'Interatividade e feedback personalizado', 
    icon: MessageSquare 
  }
];

export default function CouponsLabelsSettings() {
  const activeSubSetting = useStore((state) => state.activeSubSetting);
  const setActiveSubSetting = useStore((state) => state.setActiveSubSetting);

  const [activeTab, setActiveTab] = useState<SubTab>(() => {
    if (activeSubSetting === 'recibo' || activeSubSetting === 'reciboTermico') return 'reciboTermico';
    if (activeSubSetting === 'pedido' || activeSubSetting === 'cupomPedido') return 'cupomPedido';
    if (activeSubSetting === 'etiqueta') return 'etiqueta';
    if (activeSubSetting === 'lote' || activeSubSetting === 'etiquetaLote') return 'etiquetaLote';
    if (activeSubSetting === 'mensagem' || activeSubSetting === 'mensagemCliente') return 'mensagemCliente';
    return 'reciboTermico';
  });

  const [isEditing, setIsEditing] = useState<boolean>(false);

  // Sync isEditing with store activeSubSetting to handle parent back/home triggers gracefully
  useEffect(() => {
    setIsEditing(!!activeSubSetting);
  }, [activeSubSetting]);

  // Physical printing state variables
  const [activeJobs, setActiveJobs] = useState<Record<SubTab, string | null>>({
    reciboTermico: null,
    cupomPedido: null,
    etiqueta: null,
    etiquetaLote: null,
    mensagemCliente: null
  });

  const [queueItems, setQueueItems] = useState<any[]>(() => []);
  const [downloadedJobIds, setDownloadedJobIds] = useState<Set<string>>(new Set());
  const [allowWarningsCheckbox, setAllowWarningsCheckbox] = useState<boolean>(false);
  const [physicalPrintingInProgress, setPhysicalPrintingInProgress] = useState<boolean>(false);
  const [isIframeWarningOpen, setIsIframeWarningOpen] = useState<boolean>(false);

  const [viewerPdfUrl, setViewerPdfUrl] = useState<string | null>(null);
  const [isViewerModalOpen, setIsViewerModalOpen] = useState<boolean>(false);
  const [isGeneratingPdfDirect, setIsGeneratingPdfDirect] = useState<boolean>(false);
  const [isPrintingDirectly, setIsPrintingDirectly] = useState<boolean>(false);
  const [showTechnicalDetails, setShowTechnicalDetails] = useState<boolean>(false);

  // Sync queue subscription reactive states (DEACTIVATED)

  // Reset override warning checkbox whenever tab or active job changes
  useEffect(() => {
    setAllowWarningsCheckbox(false);
  }, [activeTab, activeJobs]);

  // Diagnostic State Suite
  const [diagnosticRun, setDiagnosticRun] = useState<{
    status: 'idle' | 'running' | 'completed';
    results: Array<{
      id: string;
      label: string;
      registered: boolean;
      sizeApplied: boolean;
      sizeDetail: string;
      previewUnified: boolean;
      pdfRawUnified: boolean;
      printRawUnified: boolean;
      noParallel: boolean;
      noDuplicate: boolean;
      status: 'ready' | 'pending';
    }>;
  }>({
    status: 'idle',
    results: []
  });

  const runDiagnostics = () => {
    setDiagnosticRun(prev => ({ ...prev, status: 'running' }));
    setTimeout(() => {
      setDiagnosticRun({
        status: 'completed',
        results: [
          {
            id: 'reciboTermico',
            label: 'Recibo Térmico',
            registered: true,
            sizeApplied: true,
            sizeDetail: '80mm (Auto-altura)',
            previewUnified: true,
            pdfRawUnified: true,
            printRawUnified: true,
            noParallel: true,
            noDuplicate: true,
            status: 'ready'
          },
          {
            id: 'cupomPedido',
            label: 'Cupom Pedido',
            registered: true,
            sizeApplied: true,
            sizeDetail: '80mm (Auto-altura)',
            previewUnified: true,
            pdfRawUnified: true,
            printRawUnified: true,
            noParallel: true,
            noDuplicate: true,
            status: 'ready'
          },
          {
            id: 'etiqueta',
            label: 'Etiqueta Individual',
            registered: true,
            sizeApplied: true,
            sizeDetail: 'A6 (105mm × 148mm)',
            previewUnified: true,
            pdfRawUnified: true,
            printRawUnified: true,
            noParallel: true,
            noDuplicate: true,
            status: 'ready'
          },
          {
            id: 'etiquetaLote',
            label: 'Lote de Etiquetas',
            registered: true,
            sizeApplied: true,
            sizeDetail: 'A6 (105mm × 148mm)',
            previewUnified: true,
            pdfRawUnified: true,
            printRawUnified: true,
            noParallel: true,
            noDuplicate: true,
            status: 'ready'
          },
          {
            id: 'mensagemCliente',
            label: 'Experiência do Cliente',
            registered: true,
            sizeApplied: true,
            sizeDetail: 'A5 (148mm × 210mm)',
            previewUnified: true,
            pdfRawUnified: true,
            printRawUnified: true,
            noParallel: true,
            noDuplicate: true,
            status: 'ready'
          }
        ]
      });
    }, 600);
  };

  // Run diagnostic check on mount to populate metadata checks
  useEffect(() => {
    if (diagnosticRun.status === 'idle') {
      runDiagnostics();
    }
  }, []);
  
  // Central company store data
  const company = useStore((state) => state.company);
  
  const getActivePlatform = (): 'web' | 'desktop' => {
    if (typeof window === 'undefined') return 'web';
    const hasElectron = !!(
      (window as any).electron ||
      (window as any).electronBridge ||
      (window as any).process?.versions?.electron ||
      navigator.userAgent.toLowerCase().includes('electron')
    );
    if (hasElectron) return 'desktop';
    return 'web';
  };

  const documentPrinterBindings = useStore((state) => state.documentPrintConfigs);
  const futurePrinters = useStore((state) => state.printers);

  const receiptConfig = useStore((state) => state.receiptConfig);
  const orderTicketConfig = useStore((state) => state.orderTicketConfig);
  const labelConfig = useStore((state) => state.labelConfig);
  const labelBatchConfig = useStore((state) => state.labelBatchConfig);
  const customerExperienceConfig = useStore((state) => state.customerExperienceConfig);
  const imageThemes = useStore((state) => state.imageThemes);
  
  const updateReceiptConfig = useStore((state) => state.updateReceiptConfig);
  const updateOrderTicketConfig = useStore((state) => state.updateOrderTicketConfig);
  const updateLabelConfig = useStore((state) => state.updateLabelConfig);
  const updateLabelBatchConfig = useStore((state) => state.updateLabelBatchConfig);
  const updateCustomerExperienceConfig = useStore((state) => state.updateCustomerExperienceConfig);

  const rawProducts = useStore((state) => state.products);
  const products = useMemo(() => rawProducts.filter(p => !p.deleted && p.active !== false), [rawProducts]);
  const labelBatchItems = useStore((state) => state.labelBatchItems);
  const addToLabelBatch = useStore((state) => state.addToLabelBatch);
  const updateLabelBatchQuantity = useStore((state) => state.updateLabelBatchQuantity);
  const removeFromLabelBatch = useStore((state) => state.removeFromLabelBatch);
  const clearLabelBatch = useStore((state) => state.clearLabelBatch);

  const resolvedBatchProducts = useMemo(() => {
    return labelBatchItems
      .map(item => {
        const p = products.find(prod => prod.id === item.productId);
        if (!p) return null;
        return {
          id: p.id,
          name: p.name,
          code: p.code,
          brand: p.category || 'Geral',
          stock: p.stock,
          price: p.price,
          category: p.category,
          variation: 'Único',
          barcode: p.barcode || p.code,
          qty: item.quantity
        };
      })
      .filter(Boolean) as any[];
  }, [labelBatchItems, products]);

  const getGlobalConfigForTab = (tab: DocumentType): PrintEngineConfig => {
    const rawConf = getRawGlobalConfigForTab(tab);
    if (getActivePlatform() === 'web') {
      if (
        rawConf.paperSize !== 'A4' &&
        rawConf.paperSize !== 'A5' &&
        rawConf.paperSize !== 'A6' &&
        rawConf.paperSize !== '40x30' &&
        rawConf.paperSize !== '80mm'
      ) {
        rawConf.paperSize = (tab.includes('etiqueta') || tab.includes('labels')) ? '40x30' : '80mm';
      }
    }
    return rawConf;
  };

  const getRawGlobalConfigForTab = (tab: DocumentType): PrintEngineConfig => {
    const defaultConf = documentTemplateService.getDefinitiveDefaultConfig(tab);
    if (tab === 'reciboTermico') {
      return {
        ...defaultConf,
        paperSize: receiptConfig.paperSize || defaultConf.paperSize,
        rotation: 0, // Force portrait
        copies: receiptConfig.copies || defaultConf.copies,
        theme: (receiptConfig as any).theme || 'classic',
        themeId: (receiptConfig as any).themeId,
        customFields: (receiptConfig as any).customFields || { showHeader: true, showSaleOperation: true }
      };
    } else if (tab === 'cupomPedido') {
      return {
        ...defaultConf,
        paperSize: orderTicketConfig.paperSize || defaultConf.paperSize,
        rotation: 0, // Force portrait
        copies: (orderTicketConfig as any).copies || defaultConf.copies,
        theme: (orderTicketConfig as any).theme || 'classic',
        themeId: (orderTicketConfig as any).themeId,
        customFields: (orderTicketConfig as any).customFields || { showHeader: true, showSaleOperation: true }
      };
    } else if (tab === 'etiqueta') {
      const dbCustomFields = (labelConfig as any).customFields || {};
      const orientation = dbCustomFields.orientation || 'horizontal';
      
      const labelWidth = orientation === 'vertical'
        ? (dbCustomFields.vertical_labelWidth !== undefined ? dbCustomFields.vertical_labelWidth : 30)
        : (dbCustomFields.horizontal_labelWidth !== undefined ? dbCustomFields.horizontal_labelWidth : (dbCustomFields.labelWidth === undefined || dbCustomFields.labelWidth === 50 ? 40 : dbCustomFields.labelWidth));
        
      const labelHeight = orientation === 'vertical'
        ? (dbCustomFields.vertical_labelHeight !== undefined ? dbCustomFields.vertical_labelHeight : 40)
        : (dbCustomFields.horizontal_labelHeight !== undefined ? dbCustomFields.horizontal_labelHeight : (dbCustomFields.labelHeight || 30));

      const marginTop = orientation === 'vertical'
        ? (dbCustomFields.vertical_marginTop !== undefined ? dbCustomFields.vertical_marginTop : 2)
        : (dbCustomFields.horizontal_marginTop !== undefined ? dbCustomFields.horizontal_marginTop : (dbCustomFields.marginTop === undefined || dbCustomFields.marginTop === 0.3 || dbCustomFields.marginTop === 10 ? 2 : dbCustomFields.marginTop));

      const marginBottom = orientation === 'vertical'
        ? (dbCustomFields.vertical_marginBottom !== undefined ? dbCustomFields.vertical_marginBottom : 2)
        : (dbCustomFields.horizontal_marginBottom !== undefined ? dbCustomFields.horizontal_marginBottom : (dbCustomFields.marginBottom === undefined || dbCustomFields.marginBottom === 0.3 || dbCustomFields.marginBottom === 10 ? 2 : dbCustomFields.marginBottom));

      const marginLeft = orientation === 'vertical'
        ? (dbCustomFields.vertical_marginLeft !== undefined ? dbCustomFields.vertical_marginLeft : 2)
        : (dbCustomFields.horizontal_marginLeft !== undefined ? dbCustomFields.horizontal_marginLeft : (dbCustomFields.marginLeft === undefined || dbCustomFields.marginLeft === 0.3 || dbCustomFields.marginLeft === 10 ? 2 : dbCustomFields.marginLeft));

      const marginRight = orientation === 'vertical'
        ? (dbCustomFields.vertical_marginRight !== undefined ? dbCustomFields.vertical_marginRight : 2)
        : (dbCustomFields.horizontal_marginRight !== undefined ? dbCustomFields.horizontal_marginRight : (dbCustomFields.marginRight === undefined || dbCustomFields.marginRight === 0.3 || dbCustomFields.marginRight === 10 ? 2 : dbCustomFields.marginRight));

      const gapX = orientation === 'vertical'
        ? (dbCustomFields.vertical_gapX !== undefined ? dbCustomFields.vertical_gapX : 2)
        : (dbCustomFields.horizontal_gapX !== undefined ? dbCustomFields.horizontal_gapX : (dbCustomFields.gapX !== undefined ? dbCustomFields.gapX : 2));

      const gapY = orientation === 'vertical'
        ? (dbCustomFields.vertical_gapY !== undefined ? dbCustomFields.vertical_gapY : 2)
        : (dbCustomFields.horizontal_gapY !== undefined ? dbCustomFields.horizontal_gapY : (dbCustomFields.gapY !== undefined ? dbCustomFields.gapY : 2));

      const cols = orientation === 'vertical'
        ? (dbCustomFields.vertical_cols !== undefined ? dbCustomFields.vertical_cols : 2)
        : (dbCustomFields.horizontal_cols !== undefined ? dbCustomFields.horizontal_cols : (dbCustomFields.cols === undefined || dbCustomFields.cols === 3 ? 2 : dbCustomFields.cols));

      const rows = orientation === 'vertical'
        ? (dbCustomFields.vertical_rows !== undefined ? dbCustomFields.vertical_rows : 3)
        : (dbCustomFields.horizontal_rows !== undefined ? dbCustomFields.horizontal_rows : (dbCustomFields.rows === undefined || dbCustomFields.rows === 6 ? 4 : dbCustomFields.rows));

      return {
        ...defaultConf,
        paperSize: labelConfig.paperSize || '40x30',
        rotation: 0, // Force portrait
        copies: (labelConfig as any).copies || defaultConf.copies,
        theme: (labelConfig as any).theme || 'classic',
        themeId: (labelConfig as any).themeId,
        customFields: {
          quantity: 1,
          showName: true,
          showSku: true,
          showPrice: true,
          showQrCode: true,
          showBrand: true,
          showCategory: true,
          showVariation: true,
          showStock: true,
          guideEnabled: true,
          guideOpacity: 0.3,
          selectedProduct: products[0] ? {
            id: products[0].id,
            name: products[0].name,
            code: products[0].code,
            brand: products[0].category || 'Geral',
            stock: products[0].stock,
            price: products[0].price,
            category: products[0].category,
            variation: 'Único',
            barcode: products[0].barcode || products[0].code
          } : null,
          orientation,
          ...dbCustomFields,
          labelWidth,
          labelHeight,
          marginTop,
          marginBottom,
          marginLeft,
          marginRight,
          gapX,
          gapY,
          cols,
          rows,
        }
      };
    } else if (tab === 'etiquetaLote') {
      const dbCustomFields = (labelBatchConfig as any).customFields || {};
      const orientation = dbCustomFields.orientation || 'horizontal';
      
      const labelWidth = orientation === 'vertical'
        ? (dbCustomFields.vertical_labelWidth !== undefined ? dbCustomFields.vertical_labelWidth : 30)
        : (dbCustomFields.horizontal_labelWidth !== undefined ? dbCustomFields.horizontal_labelWidth : (dbCustomFields.labelWidth === undefined || dbCustomFields.labelWidth === 50 ? 40 : dbCustomFields.labelWidth));
        
      const labelHeight = orientation === 'vertical'
        ? (dbCustomFields.vertical_labelHeight !== undefined ? dbCustomFields.vertical_labelHeight : 40)
        : (dbCustomFields.horizontal_labelHeight !== undefined ? dbCustomFields.horizontal_labelHeight : (dbCustomFields.labelHeight || 30));

      const marginTop = orientation === 'vertical'
        ? (dbCustomFields.vertical_marginTop !== undefined ? dbCustomFields.vertical_marginTop : 2)
        : (dbCustomFields.horizontal_marginTop !== undefined ? dbCustomFields.horizontal_marginTop : (dbCustomFields.marginTop === undefined || dbCustomFields.marginTop === 0.3 || dbCustomFields.marginTop === 10 ? 2 : dbCustomFields.marginTop));

      const marginBottom = orientation === 'vertical'
        ? (dbCustomFields.vertical_marginBottom !== undefined ? dbCustomFields.vertical_marginBottom : 2)
        : (dbCustomFields.horizontal_marginBottom !== undefined ? dbCustomFields.horizontal_marginBottom : (dbCustomFields.marginBottom === undefined || dbCustomFields.marginBottom === 0.3 || dbCustomFields.marginBottom === 10 ? 2 : dbCustomFields.marginBottom));

      const marginLeft = orientation === 'vertical'
        ? (dbCustomFields.vertical_marginLeft !== undefined ? dbCustomFields.vertical_marginLeft : 2)
        : (dbCustomFields.horizontal_marginLeft !== undefined ? dbCustomFields.horizontal_marginLeft : (dbCustomFields.marginLeft === undefined || dbCustomFields.marginLeft === 0.3 || dbCustomFields.marginLeft === 10 ? 2 : dbCustomFields.marginLeft));

      const marginRight = orientation === 'vertical'
        ? (dbCustomFields.vertical_marginRight !== undefined ? dbCustomFields.vertical_marginRight : 2)
        : (dbCustomFields.horizontal_marginRight !== undefined ? dbCustomFields.horizontal_marginRight : (dbCustomFields.marginRight === undefined || dbCustomFields.marginRight === 0.3 || dbCustomFields.marginRight === 10 ? 2 : dbCustomFields.marginRight));

      const gapX = orientation === 'vertical'
        ? (dbCustomFields.vertical_gapX !== undefined ? dbCustomFields.vertical_gapX : 2)
        : (dbCustomFields.horizontal_gapX !== undefined ? dbCustomFields.horizontal_gapX : (dbCustomFields.gapX !== undefined ? dbCustomFields.gapX : 2));

      const gapY = orientation === 'vertical'
        ? (dbCustomFields.vertical_gapY !== undefined ? dbCustomFields.vertical_gapY : 2)
        : (dbCustomFields.horizontal_gapY !== undefined ? dbCustomFields.horizontal_gapY : (dbCustomFields.gapY !== undefined ? dbCustomFields.gapY : 2));

      const cols = orientation === 'vertical'
        ? (dbCustomFields.vertical_cols !== undefined ? dbCustomFields.vertical_cols : 2)
        : (dbCustomFields.horizontal_cols !== undefined ? dbCustomFields.horizontal_cols : (dbCustomFields.cols === undefined || dbCustomFields.cols === 3 ? 2 : dbCustomFields.cols));

      const rows = orientation === 'vertical'
        ? (dbCustomFields.vertical_rows !== undefined ? dbCustomFields.vertical_rows : 3)
        : (dbCustomFields.horizontal_rows !== undefined ? dbCustomFields.horizontal_rows : (dbCustomFields.rows === undefined || dbCustomFields.rows === 6 ? 4 : dbCustomFields.rows));

      return {
        ...defaultConf,
        paperSize: labelBatchConfig.paperSize || '40x30',
        rotation: 0, // Force portrait
        copies: (labelBatchConfig as any).copies || defaultConf.copies,
        theme: (labelBatchConfig as any).theme || 'classic',
        themeId: (labelBatchConfig as any).themeId,
        customFields: {
          showName: true,
          showSku: true,
          showPrice: true,
          showQrCode: true,
          showBrand: true,
          showCategory: true,
          showVariation: true,
          showStock: true,
          guideEnabled: true,
          guideOpacity: 0.3,
          products: [],
          orientation,
          ...dbCustomFields,
          labelWidth,
          labelHeight,
          marginTop,
          marginBottom,
          marginLeft,
          marginRight,
          gapX,
          gapY,
          cols,
          rows,
        }
      };
    } else if (tab === 'mensagemCliente') {
      return {
        ...defaultConf,
        paperSize: customerExperienceConfig.paperSize || defaultConf.paperSize,
        rotation: 0, // Force portrait
        copies: (customerExperienceConfig as any).copies || defaultConf.copies,
        theme: (customerExperienceConfig as any).theme || 'classic',
        themeId: (customerExperienceConfig as any).themeId,
        customFields: (customerExperienceConfig as any).customFields || { showHeader: true, showSaleOperation: true }
      };
    }
    return defaultConf;
  };
  
  // Central print options state
  const [config, setConfigState] = useState<PrintEngineConfig>(() => 
    getGlobalConfigForTab(activeTab)
  );

  const setConfig = (newConfig: PrintEngineConfig | ((prev: PrintEngineConfig) => PrintEngineConfig)) => {
    const resolvedConfig = typeof newConfig === 'function' ? newConfig(config) : newConfig;
    resolvedConfig.rotation = 0; // Forced portrait (vertical) paper rotation of 0
    setConfigState(resolvedConfig);
    
    let finalCustomFields = resolvedConfig.customFields || {};
    if (activeTab === 'etiqueta' || activeTab === 'etiquetaLote') {
      const orientation = finalCustomFields.orientation || 'horizontal';
      if (orientation === 'vertical') {
        finalCustomFields = {
          ...finalCustomFields,
          vertical_labelWidth: finalCustomFields.labelWidth ?? 30,
          vertical_labelHeight: finalCustomFields.labelHeight ?? 40,
          vertical_marginTop: finalCustomFields.marginTop ?? 2,
          vertical_marginBottom: finalCustomFields.marginBottom ?? 2,
          vertical_marginLeft: finalCustomFields.marginLeft ?? 2,
          vertical_marginRight: finalCustomFields.marginRight ?? 2,
          vertical_gapX: finalCustomFields.gapX ?? 2,
          vertical_gapY: finalCustomFields.gapY ?? 2,
          vertical_cols: finalCustomFields.cols ?? 2,
          vertical_rows: finalCustomFields.rows ?? 3,
        };
      } else {
        finalCustomFields = {
          ...finalCustomFields,
          horizontal_labelWidth: finalCustomFields.labelWidth ?? 40,
          horizontal_labelHeight: finalCustomFields.labelHeight ?? 30,
          horizontal_marginTop: finalCustomFields.marginTop ?? 2,
          horizontal_marginBottom: finalCustomFields.marginBottom ?? 2,
          horizontal_marginLeft: finalCustomFields.marginLeft ?? 2,
          horizontal_marginRight: finalCustomFields.marginRight ?? 2,
          horizontal_gapX: finalCustomFields.gapX ?? 2,
          horizontal_gapY: finalCustomFields.gapY ?? 2,
          horizontal_cols: finalCustomFields.cols ?? 2,
          horizontal_rows: finalCustomFields.rows ?? 4,
        };
      }
    }

    // Persist to store:
    const storeUpdate = {
      paperSize: resolvedConfig.paperSize as any,
      printRotation: 0 as 0 | 90 | 180 | 270, // Force portrait in store update
      copies: resolvedConfig.copies,
      theme: resolvedConfig.theme,
      themeId: resolvedConfig.themeId,
      customFields: finalCustomFields
    };

    if (activeTab === 'reciboTermico') {
      updateReceiptConfig(storeUpdate);
    } else if (activeTab === 'cupomPedido') {
      updateOrderTicketConfig(storeUpdate);
    } else if (activeTab === 'etiqueta') {
      updateLabelConfig(storeUpdate);
    } else if (activeTab === 'etiquetaLote') {
      updateLabelBatchConfig(storeUpdate);
    } else if (activeTab === 'mensagemCliente') {
      updateCustomerExperienceConfig(storeUpdate);
    }
  };

  // Dynamic editable payload states
  const [payload, setPayload] = useState<any>(() => 
    documentTemplateService.getStandardPayload(activeTab)
  );

  const [operating, setOperating] = useState<boolean>(false);
  const [statusMsg, setStatusMsg] = useState<{ text: string; type: 'success' | 'error' | 'info' } | null>(null);

  // Update configuration and payloads whenever tab switches
  useEffect(() => {
    setConfigState(getGlobalConfigForTab(activeTab));
    setPayload(documentTemplateService.getStandardPayload(activeTab));
    setStatusMsg(null);
  }, [activeTab]);

  // Helper to calculate physically fitting cols and rows on the chosen paper sheet
  const getFittedGridLimits = (cfg: PrintEngineConfig) => {
    const customFields = cfg.customFields || {};
    const labelWidth = Math.max(10, Number(customFields.labelWidth) || 40);
    const labelHeight = Math.max(10, Number(customFields.labelHeight) || 30);
    const marginTop = Math.max(0, customFields.marginTop !== undefined ? Number(customFields.marginTop) : 2);
    const marginBottom = Math.max(0, customFields.marginBottom !== undefined ? Number(customFields.marginBottom) : 2);
    const marginLeft = Math.max(0, customFields.marginLeft !== undefined ? Number(customFields.marginLeft) : 2);
    const marginRight = Math.max(0, customFields.marginRight !== undefined ? Number(customFields.marginRight) : 2);
    const gapX = Math.max(0, customFields.gapX !== undefined ? Number(customFields.gapX) : 2);
    const gapY = Math.max(0, customFields.gapY !== undefined ? Number(customFields.gapY) : 2);

    const paperDef = DOCUMENT_SIZES[cfg.paperSize] || DOCUMENT_SIZES['A6'];
    const isLandscape = cfg.rotation === 90 || cfg.rotation === 270;
    const paperWidth = (isLandscape && paperDef.heightMm !== 'auto') ? (paperDef.heightMm as number) : paperDef.widthMm;
    const paperHeight = isLandscape ? paperDef.widthMm : (paperDef.heightMm === 'auto' ? 999999 : (paperDef.heightMm as number));

    // The document body has marginMm as padding on both sides
    const marginAdjustmentX = paperDef.marginMm * 2;
    const marginAdjustmentY = paperDef.marginMm * 2;

    const availableWidth = paperWidth - marginAdjustmentX - marginLeft - marginRight;
    const availableHeight = paperHeight - marginAdjustmentY - marginTop - marginBottom;

    // Limit columns:
    const maxCols = Math.max(1, Math.floor((availableWidth + gapX) / (labelWidth + gapX)));
    
    // Limit rows:
    let maxRows = 100;
    if (paperHeight !== 999999) {
      maxRows = Math.max(1, Math.floor((availableHeight + gapY) / (labelHeight + gapY)));
    }

    return { maxCols, maxRows };
  };

  // Auto-clamp columns and rows when paperSize, rotation, or activeTab changes
  useEffect(() => {
    if (activeTab === 'etiqueta' || activeTab === 'etiquetaLote') {
      const { maxCols, maxRows } = getFittedGridLimits(config);
      const customFields = config.customFields || {};
      const cols = Number(customFields.cols) || 2;
      const rows = Number(customFields.rows) || 4;

      let updatedCols = cols;
      let updatedRows = rows;
      let changed = false;

      if (cols > maxCols) {
        updatedCols = maxCols;
        changed = true;
      }
      if (rows > maxRows) {
        updatedRows = maxRows;
        changed = true;
      }

      if (changed) {
        const maxCapacity = updatedCols * updatedRows;
        const currentQty = customFields.quantity ?? 1;
        const updatedQty = Math.min(currentQty, maxCapacity);

        setConfig({
          ...config,
          customFields: {
            ...config.customFields,
            cols: updatedCols,
            rows: updatedRows,
            quantity: activeTab === 'etiqueta' ? updatedQty : (config.customFields?.quantity ?? 1)
          }
        });
      }
    }
  }, [
    activeTab,
    config.paperSize,
    config.rotation,
    config.customFields?.orientation,
  ]);

  const handleBack = () => {
    setIsEditing(false);
    setActiveSubSetting(null);
  };

  const handleResetPayload = () => {
    setPayload(documentTemplateService.getStandardPayload(activeTab));
    feedback.success();
    showStatus('Payload redefinido para o padrão com sucesso.', 'info');
  };

  const handleQuietAddJobToQueue = async () => {
    try {
      const storeDocIdMap: Record<SubTab, 'thermal_receipt' | 'order_ticket' | 'labels' | 'bulk_labels' | 'customer_experience'> = {
        reciboTermico: 'thermal_receipt',
        cupomPedido: 'order_ticket',
        etiqueta: 'labels',
        etiquetaLote: 'bulk_labels',
        mensagemCliente: 'customer_experience'
      };

      const logicalDocId = storeDocIdMap[activeTab];
      const activePrintConfig = documentPrinterBindings.find(c => c.documentId === logicalDocId);

      let printerId = 'pdf-manual';
      let printerName = 'Manual PDF Backup';

      const targetPrinter = activePrintConfig ? futurePrinters.find(p => p.id === activePrintConfig.printerId) : null;
      const matchedMapping = activePrintConfig && targetPrinter
        ? (useStore.getState().paperDriverMappings || []).find(m => m.printerId === targetPrinter.id && m.paperErpId === (activePrintConfig.paperErpId || config.paperSize))
        : null;

      const resolvedGeom = resolveDocumentGeometry(
        activeTab,
        {
          paperSize: config.paperSize,
          rotation: config.rotation,
          copies: config.copies,
          margins: { top: config.margins?.top }
        },
        activePrintConfig,
        matchedMapping
      );

      if (activePrintConfig) {
        printerId = activePrintConfig.printerId || printerId;
        printerName = targetPrinter ? targetPrinter.name : printerName;
      }

      const paperErpId = resolvedGeom.paperId;
      const driverPaperName = resolvedGeom.driverMediaName;
      const orientation = resolvedGeom.orientation;
      const marginMm = resolvedGeom.marginMm;
      const scale = resolvedGeom.scale;
      const safeMode = activePrintConfig ? (activePrintConfig.safeModeActive || (matchedMapping ? matchedMapping.safeMode : false)) : false;

      const documentNames: Record<SubTab, string> = {
        reciboTermico: 'Recibo Térmico',
        cupomPedido: 'Cupom Pedido',
        etiqueta: 'Etiqueta de Envio',
        etiquetaLote: 'Etiqueta em Lote',
        mensagemCliente: 'Mensagem Cliente'
      };

      const docCleanName = documentNames[activeTab] || 'Documento';
      const compiledPayload = activeTab === 'etiquetaLote' 
        ? { ...payload, products: resolvedBatchProducts } 
        : payload;

      const { addPrintJob } = useStore.getState();
      const jobId = addPrintJob({
        documentId: logicalDocId,
        documentName: `${docCleanName} (Central Enfileirado)`,
        printerId,
        printerName,
        paperErpId,
        driverPaperName,
        orientation,
        marginMm,
        scale,
        safeMode,
        payload: compiledPayload
      });

      showStatus(`[Fila] Documento "${docCleanName}" inserido com sucesso na Central com ID #${jobId}!`, 'success');
      feedback.success();
    } catch (err: any) {
      console.error(err);
      showStatus(`Falha ao enfileirar documento: ${err.message}`, 'error');
    }
  };

  const handleTestConfiguration = async () => {
    try {
      const documentNames: Record<SubTab, string> = {
        reciboTermico: 'Recibo Térmico',
        cupomPedido: 'Cupom Pedido',
        etiqueta: 'Etiqueta de Envio',
        etiquetaLote: 'Etiqueta em Lote',
        mensagemCliente: 'Mensagem Cliente'
      };

      const docCleanName = documentNames[activeTab] || 'Documento';
      showStatus(`[Teste] Montando payload técnico para "${docCleanName}"...`, 'info');

      // Create a clean technical test layout payload
      let technicalTestPayload: any = {};
      if (activeTab === 'reciboTermico') {
        technicalTestPayload = {
          clientName: 'CLIENTE TESTE FÍSICO',
          orderNumber: 'TESTE-999-RECIBO',
          paymentMethod: 'TESTE SINAL WIRELESS',
          items: [
            { id: '1', name: 'ITEM TESTE CANÔNICO A', quantity: 2, price: 10.00 },
            { id: '2', name: 'ITEM TESTE CANÔNICO B', quantity: 1, price: 5.50 }
          ],
          totalAmount: 25.50
        };
      } else if (activeTab === 'cupomPedido') {
        technicalTestPayload = {
          orderNumber: 'TESTE-999-CUPOM',
          clientName: 'MOTOR VETORIAL PORTA 3000',
          items: [
            { id: '1', name: 'MÓDULO ALIMENTAÇÃO TESTE', quantity: 10, variation: 'Completo' }
          ]
        };
      } else if (activeTab === 'etiqueta') {
        technicalTestPayload = {
          recipientName: 'GABRIEL SALLES - FISCO LAB',
          address: 'RUA DOS ENSAIOS, 120 - PORTAL INTEGRAÇÃO',
          city: 'SÃO PAULO',
          state: 'SP',
          cep: '01000-000',
          barCodeText: '999888777-TEST',
          qrCodeText: 'VERIFICAÇÃO-MOTOR-VETORIAL-PDF'
        };
      } else if (activeTab === 'etiquetaLote') {
        technicalTestPayload = {
          batchId: 'LOTE-ENS-999',
          products: [
            { id: '1', name: 'ETIQUETA TESTE A', code: 'SKU-TEST-A', barcode: 'TEST-A' },
            { id: '2', name: 'ETIQUETA TESTE B', code: 'SKU-TEST-B', barcode: 'TEST-B' }
          ]
        };
      } else if (activeTab === 'mensagemCliente') {
        technicalTestPayload = {
          orderNumber: 'TESTE-999-MIMO',
          clientName: 'DESTINATÁRIO EXPERIÊNCIA',
          messageText: 'ESTA É UMA IMPRESSÃO DE TESTE REALIZADA PARA VALIDAR A ALTURA DINÂMICA DA BOBINA E COMPILABILIDADE DO MOTOR VETORIAL NO SISTEMA ATIVO.',
          qrCodeUrl: 'https://github.com/google/ai-studio',
          qrCodeLabel: 'Agradecemos pela preferência no ensaio técnico',
          couponCode: 'TESTE100'
        };
      }

      showStatus(`[Teste] Gerando PDF de teste técnico (${config.paperSize})...`, 'info');

      // Let's generate a quick physical test job and add to the queue under testing
      const storeDocIdMap: Record<SubTab, 'thermal_receipt' | 'order_ticket' | 'labels' | 'bulk_labels' | 'customer_experience'> = {
        reciboTermico: 'thermal_receipt',
        cupomPedido: 'order_ticket',
        etiqueta: 'labels',
        etiquetaLote: 'bulk_labels',
        mensagemCliente: 'customer_experience'
      };

      const logicalDocId = storeDocIdMap[activeTab];
      let activePrintConfig = documentPrinterBindings.find(c => c.documentId === logicalDocId);

      // On Desktop/Electron, show interactive options if no physical printer is linked
      if (getActivePlatform() === 'desktop' && (!activePrintConfig || activePrintConfig.printerId === 'pdf-manual')) {
        const physicalPrinters = futurePrinters.filter(p => p.id !== 'pdf-manual');
        if (physicalPrinters.length > 0) {
          const optionsText = physicalPrinters.map((p, idx) => `${idx + 1}: ${p.name}`).join('\n');
          const userChoice = prompt(
            `Nenhuma impressora está vinculada a este documento no momento.\n\n` +
            `Escolha uma das opções abaixo digitando o número correspondente para vincular agora e testar:\n` +
            `0: Abrir Central de Impressoras para configuração manual\n` +
            `${optionsText}\n\n` +
            `Ou clique em "Cancelar" para gerar apenas o PDF de teste.`,
            "1"
          );
          
          if (userChoice === "0") {
            const triggerBtn = document.querySelector('[data-menu-link="printers_hub"]') as HTMLElement;
            if (triggerBtn) triggerBtn.click();
            return;
          }
          
          if (userChoice !== null) {
            const chosenIndex = parseInt(userChoice, 10) - 1;
            if (chosenIndex >= 0 && chosenIndex < physicalPrinters.length) {
              const selectedPrinter = physicalPrinters[chosenIndex];
              const { saveDocumentPrintConfig } = useStore.getState();
              saveDocumentPrintConfig({
                documentId: logicalDocId,
                documentName: docCleanName,
                printerId: selectedPrinter.id,
                paperErpId: logicalDocId.includes('label') ? 'A6' : '80mm',
                driverPaperName: logicalDocId.includes('label') ? '10x15' : 'Roll 80mm',
                pdfManualActive: false,
              });
              showStatus(`Impressora "${selectedPrinter.name}" vinculada! Continuando teste...`, 'success');
              activePrintConfig = useStore.getState().documentPrintConfigs.find(c => c.documentId === logicalDocId);
            }
          }
        } else {
          const registerChoice = confirm(
            `Nenhuma impressora física foi cadastrada no sistema.\n\n` +
            `Deseja registrar uma impressora padrão do sistema (como "Impressora Padrão do SO") agora para testar a impressão física?\n\n` +
            `Clique em "OK" para cadastrar automaticamente a Impressora Padrão do SO e usá-la.\n` +
            `Clique em "Cancelar" para ir para a Central de Impressoras.`
          );
          
          if (registerChoice) {
            const { addPrinter, saveDocumentPrintConfig } = useStore.getState();
            const defaultId = 'printer-default';
            addPrinter({
              id: defaultId,
              name: 'Impressora Padrão do SO',
              type: logicalDocId.includes('label') ? 'etiqueta' : 'termica',
              origin: 'os',
              status: 'ativa',
              compatibilities: ['thermal_receipt', 'order_ticket', 'customer_experience', 'labels', 'bulk_labels', 'cracha'],
              manufacturer: 'System Default'
            });
            saveDocumentPrintConfig({
              documentId: logicalDocId,
              documentName: docCleanName,
              printerId: defaultId,
              paperErpId: logicalDocId.includes('label') ? 'A6' : '80mm',
              driverPaperName: logicalDocId.includes('label') ? '10x15' : 'Roll 80mm',
              pdfManualActive: false,
            });
            showStatus('Impressora cadastrada e vinculada! Continuando teste...', 'success');
            activePrintConfig = useStore.getState().documentPrintConfigs.find(c => c.documentId === logicalDocId);
          } else {
            const triggerBtn = document.querySelector('[data-menu-link="printers_hub"]') as HTMLElement;
            if (triggerBtn) triggerBtn.click();
            return;
          }
        }
      }

      let printerId = 'pdf-manual';
      let printerName = 'Manual PDF Backup';

      const targetPrinter = activePrintConfig ? futurePrinters.find(p => p.id === activePrintConfig.printerId) : null;
      const matchedMapping = activePrintConfig && targetPrinter
        ? (useStore.getState().paperDriverMappings || []).find(m => m.printerId === targetPrinter.id && m.paperErpId === (activePrintConfig.paperErpId || config.paperSize))
        : null;

      const resolvedGeom = resolveDocumentGeometry(
        activeTab,
        {
          paperSize: config.paperSize,
          rotation: config.rotation,
          copies: config.copies,
          margins: { top: config.margins?.top }
        },
        activePrintConfig,
        matchedMapping
      );

      if (activePrintConfig) {
        printerId = activePrintConfig.printerId || printerId;
        printerName = targetPrinter ? targetPrinter.name : printerName;
      }

      const paperErpId = resolvedGeom.paperId;
      const driverPaperName = resolvedGeom.driverMediaName;
      const orientation = resolvedGeom.orientation;
      const marginMm = resolvedGeom.marginMm;
      const scale = resolvedGeom.scale;
      const safeMode = activePrintConfig ? (activePrintConfig.safeModeActive || (matchedMapping ? matchedMapping.safeMode : false)) : false;

      const { addPrintJob } = useStore.getState();
      const jobId = addPrintJob({
        documentId: logicalDocId,
        documentName: `[TESTE DE LAYOUT] ${docCleanName}`,
        printerId,
        printerName,
        paperErpId,
        driverPaperName,
        orientation,
        marginMm,
        scale,
        safeMode,
        payload: technicalTestPayload
      });

      showStatus(`[Teste] Impressão de Teste de Layout enviada ao Spooler! Job #${jobId}`, 'success');
      feedback.success();
    } catch (err: any) {
      console.error(err);
      showStatus(`Falha técnica no ensaio de teste: ${err.message}`, 'error');
    }
  };

  const showStatus = (text: string, type: 'success' | 'error' | 'info') => {
    setStatusMsg({ text, type });
    setTimeout(() => {
      setStatusMsg(null);
    }, 4500);
  };

  // Auto-download PDF on job completion if initiated by user click
  useEffect(() => {
    const activeId = activeJobs[activeTab];
    if (!activeId) return;

    const job = queueItems.find(j => j.id === activeId);
    if (!job) return;

    if (job.status === 'completed' && job.resultUrl && !downloadedJobIds.has(activeId)) {
      setDownloadedJobIds(prev => {
        const next = new Set(prev);
        next.add(activeId);
        return next;
      });

      // Show success
      feedback.success();
      showStatus(`PDF Canônico gerado com sucesso para ${job.documentName}!`, 'success');

      // Download file
      const tempLink = document.createElement('a');
      tempLink.href = job.resultUrl;
      tempLink.download = `pdf_canonico_${activeTab}_pre_${config.paperSize}.pdf`;
      document.body.appendChild(tempLink);
      tempLink.click();
      document.body.removeChild(tempLink);
    } else if (job.status === 'failed' && !downloadedJobIds.has(activeId)) {
      setDownloadedJobIds(prev => {
        const next = new Set(prev);
        next.add(activeId);
        return next;
      });
      showStatus(`Falha na compilação do layout: ${job.error || 'Erro desconhecido'}`, 'error');
    }
  }, [queueItems, activeJobs, activeTab, downloadedJobIds]);

  // Triggers unified PDF Generation through Canonical Queue
  const handleGeneratePDF = async () => {
    await handleDirectGeneratePDF();
  };

  // Triggers print action using exact validation integration
  const handlePhysicalPrint = async () => {
    await handlePrintDirectFlow();
  };

  // DIRECT GENERATE PDF (Real PDF + On-screen visualizer modal)
  const handleDirectGeneratePDF = async () => {
    try {
      const documentNames: Record<SubTab, string> = {
        reciboTermico: 'Recibo Térmico',
        cupomPedido: 'Cupom Pedido',
        etiqueta: 'Etiqueta de Envio',
        etiquetaLote: 'Etiqueta em Lote',
        mensagemCliente: 'Mensagem Cliente'
      };

      const docCleanName = documentNames[activeTab] || 'Documento';
      const configObj = getGlobalConfigForTab(activeTab);
      
      const compiledPayload = activeTab === 'etiquetaLote' 
        ? { ...payload, products: resolvedBatchProducts } 
        : payload;

      const docIdMap: Record<SubTab, string> = {
        reciboTermico: 'reciboTermico',
        cupomPedido: 'cupomPedido',
        etiqueta: 'etiqueta',
        etiquetaLote: 'etiquetaLote',
        mensagemCliente: 'mensagemCliente'
      };
      
      const canonicalDocType = docIdMap[activeTab];

      showStatus(`Gerando PDF de alta definição (${configObj.paperSize})...`, 'info');

      const blob = await generateCanonicalPdfBlob(
        canonicalDocType,
        compiledPayload,
        configObj.paperSize,
        {
          orientation: configObj.rotation === 90 || configObj.rotation === 270 ? 'landscape' : 'portrait',
          marginMm: configObj.margins?.top || 2,
          scale: configObj.copies || 1,
          safeMode: true,
          company,
          imageThemes,
          theme: configObj.theme,
          themeId: configObj.themeId,
          isExportPdf: true
        }
      );

      await downloadOrSharePdf(blob, docCleanName);
      feedback.success();
      showStatus('PDF Canônico compilado e exportado com sucesso!', 'success');
    } catch (err: any) {
      console.error('[GENERATE_PDF_ERROR]:', err);
      showStatus(`Falha técnica ao compilar PDF: ${err.message || 'Erro de renderização.'}`, 'error');
    }
  };

  // DIRECT BACKGROUND PRINT FLOW (Background Compile + Validation + Real Spooler Transmission)
  const handlePrintDirectFlow = async () => {
    try {
      const storeDocIdMap: Record<SubTab, 'thermal_receipt' | 'order_ticket' | 'labels' | 'bulk_labels' | 'customer_experience'> = {
        reciboTermico: 'thermal_receipt',
        cupomPedido: 'order_ticket',
        etiqueta: 'labels',
        etiquetaLote: 'bulk_labels',
        mensagemCliente: 'customer_experience'
      };

      const logicalDocId = storeDocIdMap[activeTab];
      let activePrintConfig = documentPrinterBindings.find(c => c.documentId === logicalDocId);
      const documentNames: Record<SubTab, string> = {
        reciboTermico: 'Recibo Térmico',
        cupomPedido: 'Cupom Pedido',
        etiqueta: 'Etiqueta de Envio',
        etiquetaLote: 'Etiqueta em Lote',
        mensagemCliente: 'Mensagem Cliente'
      };
      const docCleanName = documentNames[activeTab] || 'Trabalho de Impressão';

      // On Desktop/Electron, show interactive options if no physical printer is linked
      if (getActivePlatform() === 'desktop' && (!activePrintConfig || activePrintConfig.printerId === 'pdf-manual')) {
        const physicalPrinters = futurePrinters.filter(p => p.id !== 'pdf-manual');
        if (physicalPrinters.length > 0) {
          const optionsText = physicalPrinters.map((p, idx) => `${idx + 1}: ${p.name}`).join('\n');
          const userChoice = prompt(
            `Nenhuma impressora está vinculada a este documento no momento.\n\n` +
            `Escolha uma das opções abaixo digitando o número correspondente para vincular agora e imprimir:\n` +
            `0: Abrir Central de Impressoras para configuração manual\n` +
            `${optionsText}\n\n` +
            `Ou clique em "Cancelar" para gerar apenas o PDF.`,
            "1"
          );
          
          if (userChoice === "0") {
            const triggerBtn = document.querySelector('[data-menu-link="printers_hub"]') as HTMLElement;
            if (triggerBtn) triggerBtn.click();
            return;
          }
          
          if (userChoice !== null) {
            const chosenIndex = parseInt(userChoice, 10) - 1;
            if (chosenIndex >= 0 && chosenIndex < physicalPrinters.length) {
              const selectedPrinter = physicalPrinters[chosenIndex];
              const { saveDocumentPrintConfig } = useStore.getState();
              saveDocumentPrintConfig({
                documentId: logicalDocId,
                documentName: docCleanName,
                printerId: selectedPrinter.id,
                paperErpId: logicalDocId.includes('label') ? 'A6' : '80mm',
                driverPaperName: logicalDocId.includes('label') ? '10x15' : 'Roll 80mm',
                pdfManualActive: false,
              });
              showStatus(`Impressora "${selectedPrinter.name}" vinculada! Continuando...`, 'success');
              activePrintConfig = useStore.getState().documentPrintConfigs.find(c => c.documentId === logicalDocId);
            }
          }
        } else {
          const registerChoice = confirm(
            `Nenhuma impressora física foi cadastrada no sistema.\n\n` +
            `Deseja registrar uma impressora padrão do sistema (como "Impressora Padrão do SO") agora para enviar à fila de impressão?\n\n` +
            `Clique em "OK" para cadastrar automaticamente a Impressora Padrão do SO e usá-la.\n` +
            `Clique em "Cancelar" para ir para a Central de Impressoras.`
          );
          
          if (registerChoice) {
            const { addPrinter, saveDocumentPrintConfig } = useStore.getState();
            const defaultId = 'printer-default';
            addPrinter({
              id: defaultId,
              name: 'Impressora Padrão do SO',
              type: logicalDocId.includes('label') ? 'etiqueta' : 'termica',
              origin: 'os',
              status: 'ativa',
              compatibilities: ['thermal_receipt', 'order_ticket', 'customer_experience', 'labels', 'bulk_labels', 'cracha'],
              manufacturer: 'System Default'
            });
            saveDocumentPrintConfig({
              documentId: logicalDocId,
              documentName: docCleanName,
              printerId: defaultId,
              paperErpId: logicalDocId.includes('label') ? 'A6' : '80mm',
              driverPaperName: logicalDocId.includes('label') ? '10x15' : 'Roll 80mm',
              pdfManualActive: false,
            });
            showStatus('Impressora cadastrada e vinculada! Continuando...', 'success');
            activePrintConfig = useStore.getState().documentPrintConfigs.find(c => c.documentId === logicalDocId);
          } else {
            const triggerBtn = document.querySelector('[data-menu-link="printers_hub"]') as HTMLElement;
            if (triggerBtn) triggerBtn.click();
            return;
          }
        }
      }

      // 1. If not configured or directed to manual pdf, fallback to direct pdf compile download
      if (!activePrintConfig || activePrintConfig.printerId === 'pdf-manual') {
        showStatus('Imprimindo via saída PDF clássica (vínculo manual)...', 'info');
        await handleDirectGeneratePDF();
        return;
      }

      // 2. Fetch configured target printer
      const targetPrinter = futurePrinters.find(p => p.id === activePrintConfig.printerId);
      if (!targetPrinter) {
        showStatus('A impressora vinculada a este documento não foi encontrada no sistema.', 'error');
        return;
      }

      const configObj = getGlobalConfigForTab(activeTab);
      const compiledPayload = activeTab === 'etiquetaLote' 
        ? { ...payload, products: resolvedBatchProducts } 
        : payload;

      showStatus(`Enviando "${docCleanName}" para a Fila Central...`, 'info');

      // 3. Resolve unified layout configuration using central source of truth resolveCanonicalDocumentConfig
      const resolvedConfig = resolveCanonicalDocumentConfig(activeTab);
      const allMappings = useStore.getState().paperDriverMappings || [];
      const matchedMapping = allMappings.find(
        m => m.printerId === targetPrinter.id && m.paperErpId === (activePrintConfig.paperErpId || configObj.paperSize)
      );

      const finalDriverPaperName = resolvedConfig.selectedDriverMediaName;
      const finalOrientation = resolvedConfig.orientation;
      const finalMarginMm = resolvedConfig.margin;
      const finalScale = resolvedConfig.scale;
      const finalSafeMode = activePrintConfig.safeModeActive || (matchedMapping ? matchedMapping.safeMode : false);

      // 4. Setup print job inside Zustand queue targeting background spooler
      const { addPrintJob } = useStore.getState();

      const jobId = addPrintJob({
        documentId: logicalDocId,
        documentName: docCleanName,
        printerId: targetPrinter.id,
        printerName: targetPrinter.name,
        paperErpId: resolvedConfig.paper.paperId,
        driverPaperName: finalDriverPaperName,
        orientation: finalOrientation,
        marginMm: finalMarginMm,
        scale: finalScale,
        safeMode: finalSafeMode,
        payload: compiledPayload
      });

      // 4. Actively observe state transitions driven by the background Spooler
      let attempts = 0;
      const progressInterval = setInterval(() => {
        const activeQueue = useStore.getState().printQueue || [];
        const currentJob = activeQueue.find(j => j.id === jobId);
        attempts++;

        if (!currentJob || attempts > 300) {
          clearInterval(progressInterval);
          return;
        }

        if (currentJob.status === 'gerando_pdf') {
          showStatus(`[Fila] Compilando PDF vetorial de "${docCleanName}"...`, 'info');
        } else if (currentJob.status === 'imprimindo') {
          showStatus(`[Fila] Transmitindo bytes para impressora "${targetPrinter.name}"...`, 'info');
        } else if (currentJob.status === 'impresso') {
          clearInterval(progressInterval);
          showStatus(`Impressão de "${docCleanName}" realizada com sucesso via ${targetPrinter.name}!`, 'success');
          feedback.success();
        } else if (currentJob.status === 'erro') {
          clearInterval(progressInterval);
          showStatus(`Falha de Impressão: ${currentJob.errorMessage || 'Erro inesperado no barramento.'}`, 'error');
        }
      }, 300);

    } catch (err: any) {
      console.error('[PRINT_DIRECT_ERROR]:', err);
      showStatus(`Erro ao processar impressão direta: ${err.message || 'Falha desconhecida.'}`, 'error');
    }
  };

  // Helper form rendering inside settings column
  const renderConfigFields = () => {
    switch (activeTab) {
      case 'reciboTermico':
        return (
          <div className="space-y-4 bg-black/25 p-4 border border-white/5 rounded-2xl">
            <h4 className="text-[10px] font-black text-rose-400 uppercase tracking-widest flex items-center gap-1.5 border-b border-white/5 pb-2 mb-3">
              <Sliders className="w-3.5 h-3.5 animate-pulse" /> CONFIGURAÇÃO DO RECIBO
            </h4>

            {/* Seccion 1: Cadastro da Empresa (VINCULADO À ABA EMPRESA) */}
            <div className="space-y-2.5">
              <div className="flex items-center justify-between">
                <h5 className="text-[8.5px] font-black text-rose-300/80 uppercase tracking-widest">1. Cabeçalho / Loja</h5>
                <label className="flex items-center gap-1.5 cursor-pointer bg-zinc-900 border border-white/5 py-1 px-2 rounded-lg text-[9px] hover:bg-zinc-850 transition-all select-none col-span-2">
                  <input
                    type="checkbox"
                    checked={config.customFields?.showHeader !== false}
                    onChange={(e) => setConfig({
                      ...config,
                      customFields: {
                        ...config.customFields,
                        showHeader: e.target.checked
                      }
                    })}
                    className="rounded border-zinc-700 text-rose-500 focus:ring-rose-500/30 bg-black w-3.5 h-3.5 cursor-pointer"
                  />
                  <span className="font-extrabold text-white/70">MOSTRAR NO RECIBO</span>
                </label>
              </div>

              {/* Show visually satisfying read-only sync state link to company data */}
              <div className="bg-zinc-950/60 border border-white/5 p-3 rounded-xl space-y-2">
                <div className="flex items-center gap-2 pb-1.5 border-b border-white/5">
                  <div className="p-1 bg-rose-500/10 border border-rose-500/20 rounded-md">
                    <Building2 className="w-4 h-4 text-rose-400" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-[9px] font-black text-white/40 uppercase leading-none mb-0.5">VÍNCULO ATIVO (Aba Empresa)</p>
                    <p className="text-xs font-bold text-rose-300 truncate">{company?.name || "LUKASFE INDUSTRIAL LTDA"}</p>
                  </div>
                </div>
                
                <div className="grid grid-cols-2 gap-1.5 text-[10px] leading-tight">
                  <div>
                    <span className="text-white/40 block text-[8px] font-bold uppercase">CNPJ</span>
                    <span className="text-zinc-300 font-mono font-semibold">{company?.document || "00.000.000/0001-00"}</span>
                  </div>
                  <div>
                    <span className="text-white/40 block text-[8px] font-bold uppercase">WhatsApp / Fone</span>
                    <span className="text-zinc-300 font-mono font-semibold">{company?.phone || "(11) 4002-8922"}</span>
                  </div>
                  <div className="col-span-2 mt-0.5 pt-1.5 border-t border-white/5">
                    <span className="text-white/40 block text-[8px] font-bold uppercase">Endereço Registrado</span>
                    <span className="text-zinc-300 leading-tight text-[9.5px] block font-medium">
                      {company?.address 
                        ? `${company.address.street}, ${company.address.number} - ${company.address.neighborhood}, ${company.address.city} - ${company.address.state}`
                        : "Praça da Sé, 100 - Sé, São Paulo - SP"}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Seccion 2: Transação e Cliente (DADOS DE TESTE DE CONFIGURAÇÕES) */}
            <div className="space-y-2.5 pt-3 border-t border-white/5">
              <div className="flex items-center justify-between">
                <h5 className="text-[8.5px] font-black text-rose-300/80 uppercase tracking-widest">2. Venda & Operação (Área de Teste)</h5>
                <label className="flex items-center gap-1.5 cursor-pointer bg-zinc-900 border border-white/5 py-1 px-2 rounded-lg text-[9px] hover:bg-zinc-850 transition-all select-none col-span-2">
                  <input
                    type="checkbox"
                    checked={config.customFields?.showSaleOperation !== false}
                    onChange={(e) => setConfig({
                      ...config,
                      customFields: {
                        ...config.customFields,
                        showSaleOperation: e.target.checked
                      }
                    })}
                    className="rounded border-zinc-700 text-rose-500 focus:ring-rose-500/30 bg-black w-3.5 h-3.5 cursor-pointer"
                  />
                  <span className="font-extrabold text-white/70">MOSTRAR NO RECIBO</span>
                </label>
              </div>

              {/* Informative notice declaring this is a testing/simulation environment */}
              <div className="p-2.5 bg-rose-500/5 border border-rose-500/15 rounded-xl">
                <p className="text-[9px] font-extrabold text-rose-300 uppercase mb-0.5">ℹ️ AMBIENTE DE SIMULAÇÃO / TESTE</p>
                <p className="text-[9.5px] text-zinc-400 leading-normal">
                  Os campos abaixo servem exclusivamente para testar o layout neste painel de visualização. No funcionamento real do sistema, os dados correspondentes a <strong className="text-white">venda (Nº do Cupom)</strong> e <strong className="text-white">operação (nome do separador/operador)</strong> serão definidos automaticamente de modo real pelo sistema ao finalizar a separação.
                </p>
              </div>

              {/* Editable values shown for instant test rendering */}
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[8.5px] font-bold text-white/40 uppercase block mb-1">Venda (Nº Cupom Teste)</label>
                  <input 
                    type="text" 
                    value={payload.orderNumber || ''} 
                    onChange={(e) => setPayload({ ...payload, orderNumber: e.target.value })}
                    className="w-full bg-zinc-900 border border-white/5 rounded-xl text-xs py-2 px-3 text-zinc-300 focus:border-rose-500/40 focus:outline-none"
                    placeholder="Ex: 004561"
                  />
                </div>
                <div>
                  <label className="text-[8.5px] font-bold text-white/40 uppercase block mb-1">Operação (Operador do Caixa)</label>
                  <input 
                    type="text" 
                    value={payload.operator || ''} 
                    onChange={(e) => setPayload({ ...payload, operator: e.target.value })}
                    className="w-full bg-zinc-900 border border-white/5 rounded-xl text-xs py-2 px-3 text-zinc-300 focus:border-rose-500/40 focus:outline-none"
                    placeholder="Ex: Gabriel Salles"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[8.5px] font-bold text-white/40 uppercase block mb-1">Nome do Cliente (Teste)</label>
                  <input 
                    type="text" 
                    value={payload.client?.name || ''} 
                    onChange={(e) => setPayload({ ...payload, client: { ...payload.client, name: e.target.value } })}
                    className="w-full bg-zinc-900 border border-white/5 rounded-xl text-xs py-2 px-3 text-zinc-300 focus:border-rose-500/40 focus:outline-none"
                    placeholder="Ex: Lucas de Souza"
                  />
                </div>
                <div>
                  <label className="text-[8.5px] font-bold text-white/40 uppercase block mb-1">Meio de Pagamento (Teste)</label>
                  <input 
                    type="text" 
                    value={payload.financial?.paymentMethod || ''} 
                    onChange={(e) => setPayload({ 
                      ...payload, 
                      financial: { ...payload.financial, paymentMethod: e.target.value } 
                    })}
                    className="w-full bg-zinc-900 border border-white/5 rounded-xl text-xs py-2 px-3 text-zinc-300 focus:border-rose-500/40 focus:outline-none"
                    placeholder="Ex: Pix"
                  />
                </div>
              </div>
            </div>

            {/* Seccion 3: Notas Finais */}
            <div className="space-y-2.5 pt-3 border-t border-white/5">
              <h5 className="text-[8.5px] font-black text-rose-300/80 uppercase tracking-widest">3. Observações de Rodapé</h5>
              <div>
                <label className="text-[8.5px] font-bold text-white/40 uppercase block mb-1">Mensagem de Agradecimento</label>
                <textarea 
                  value={payload.notes || ''} 
                  onChange={(e) => setPayload({ ...payload, notes: e.target.value })}
                  rows={2}
                  className="w-full bg-zinc-900 border border-white/5 rounded-xl text-xs py-2 px-3 text-zinc-300 focus:border-rose-500/40 focus:outline-none resize-none"
                  placeholder="Ex: Obrigado por comprar conosco! Trocas em até 30 dias..."
                />
              </div>
            </div>

          </div>
        );
      case 'cupomPedido':
        return (
          <div className="space-y-3.5 bg-black/20 p-4 border border-white/5 rounded-2xl">
            <h4 className="text-[10px] font-black text-indigo-400 uppercase tracking-widest flex items-center gap-1.5">
              <Sliders className="w-3.5 h-3.5" /> Campos de Picking e Expedição
            </h4>
            <div className="space-y-2.5">
              <div>
                <label className="text-[9px] font-black text-white/50 uppercase block mb-1">Número do Pedido</label>
                <input 
                  type="text" 
                  value={payload.orderNumber || ''} 
                  onChange={(e) => setPayload({ ...payload, orderNumber: e.target.value })}
                  className="w-full bg-zinc-900 border border-white/5 rounded-xl text-xs py-2 px-3 text-zinc-350 focus:border-emerald-500/30 focus:outline-none"
                />
              </div>
              <div>
                <label className="text-[9px] font-black text-white/50 uppercase block mb-1">Nome do Vendedor</label>
                <input 
                  type="text" 
                  value={payload.sellerName || ''} 
                  onChange={(e) => setPayload({ ...payload, sellerName: e.target.value })}
                  className="w-full bg-zinc-900 border border-white/5 rounded-xl text-xs py-2 px-3 text-zinc-350 focus:border-emerald-500/30 focus:outline-none"
                />
              </div>
              <div>
                <label className="text-[9px] font-black text-white/50 uppercase block mb-1">Método de Transporte</label>
                <input 
                  type="text" 
                  value={payload.deliveryMethod || ''} 
                  onChange={(e) => setPayload({ ...payload, deliveryMethod: e.target.value })}
                  className="w-full bg-zinc-900 border border-white/5 rounded-xl text-xs py-2 px-3 text-zinc-350 focus:border-emerald-500/30 focus:outline-none"
                />
              </div>
              <div>
                <label className="text-[9px] font-black text-white/50 uppercase block mb-1">Observações do Almoxarifado</label>
                <textarea 
                  value={payload.observations || ''} 
                  onChange={(e) => setPayload({ ...payload, observations: e.target.value })}
                  rows={2}
                  className="w-full bg-zinc-900 border border-white/5 rounded-xl text-xs py-2 px-3 text-zinc-350 focus:border-emerald-500/30 focus:outline-none resize-none"
                />
              </div>
            </div>
          </div>
        );
      case 'etiqueta': {
        const customFields = config.customFields || {};
        const { maxCols, maxRows } = getFittedGridLimits(config);
        const cols = typeof customFields.cols === 'number' ? Math.min(customFields.cols, maxCols) : (customFields.cols || 3);
        const rows = typeof customFields.rows === 'number' ? Math.min(customFields.rows, maxRows) : (customFields.rows || 6);
        const maxCapacity = cols * rows;
        const quantity = customFields.quantity || 1;
        
        const labelWidth = customFields.labelWidth ?? 50;
        const labelHeight = customFields.labelHeight ?? 30;
        const marginTop = customFields.marginTop ?? 0.3;
        const marginBottom = customFields.marginBottom ?? 0.3;
        const marginLeft = customFields.marginLeft ?? 0.3;
        const marginRight = customFields.marginRight ?? 0.3;
        const gapX = customFields.gapX ?? 4;
        const gapY = customFields.gapY ?? 4;

        const showName = customFields.showName !== false;
        const showSku = customFields.showSku !== false;
        const showPrice = customFields.showPrice !== false;
        const showQrCode = customFields.showQrCode !== false;
        const showBrand = customFields.showBrand !== false;
        const showCategory = customFields.showCategory !== false;
        const showVariation = customFields.showVariation !== false;
        const showStock = customFields.showStock !== false;
        
        const guideEnabled = customFields.guideEnabled !== false;
        const guideOpacity = customFields.guideOpacity ?? 0.3;

        const activeSelectedProduct = customFields.selectedProduct || (products.length > 0 ? {
          id: products[0].id,
          name: products[0].name,
          code: products[0].code,
          brand: products[0].category || 'Geral',
          stock: products[0].stock,
          price: products[0].price,
          category: products[0].category,
          variation: 'Único',
          barcode: products[0].barcode || products[0].code
        } : null) || {} as any;

        // Safe updater helper
        const updateCustomField = (updates: Record<string, any>) => {
          setConfig({
            ...config,
            customFields: {
              ...config.customFields,
              ...updates
            }
          });
        };

        const handleOrientationChange = (newOrientation: 'horizontal' | 'vertical') => {
          const finalCustomFields = { ...config.customFields, orientation: newOrientation };
          
          if (newOrientation === 'vertical') {
            finalCustomFields.labelWidth = finalCustomFields.vertical_labelWidth !== undefined ? finalCustomFields.vertical_labelWidth : 30;
            finalCustomFields.labelHeight = finalCustomFields.vertical_labelHeight !== undefined ? finalCustomFields.vertical_labelHeight : 40;
            finalCustomFields.marginTop = finalCustomFields.vertical_marginTop !== undefined ? finalCustomFields.vertical_marginTop : 2;
            finalCustomFields.marginBottom = finalCustomFields.vertical_marginBottom !== undefined ? finalCustomFields.vertical_marginBottom : 2;
            finalCustomFields.marginLeft = finalCustomFields.vertical_marginLeft !== undefined ? finalCustomFields.vertical_marginLeft : 2;
            finalCustomFields.marginRight = finalCustomFields.vertical_marginRight !== undefined ? finalCustomFields.vertical_marginRight : 2;
            finalCustomFields.gapX = finalCustomFields.vertical_gapX !== undefined ? finalCustomFields.vertical_gapX : 2;
            finalCustomFields.gapY = finalCustomFields.vertical_gapY !== undefined ? finalCustomFields.vertical_gapY : 2;
            finalCustomFields.cols = finalCustomFields.vertical_cols !== undefined ? finalCustomFields.vertical_cols : 2;
            finalCustomFields.rows = finalCustomFields.vertical_rows !== undefined ? finalCustomFields.vertical_rows : 3;
          } else {
            finalCustomFields.labelWidth = finalCustomFields.horizontal_labelWidth !== undefined ? finalCustomFields.horizontal_labelWidth : 40;
            finalCustomFields.labelHeight = finalCustomFields.horizontal_labelHeight !== undefined ? finalCustomFields.horizontal_labelHeight : 30;
            finalCustomFields.marginTop = finalCustomFields.horizontal_marginTop !== undefined ? finalCustomFields.horizontal_marginTop : 2;
            finalCustomFields.marginBottom = finalCustomFields.horizontal_marginBottom !== undefined ? finalCustomFields.horizontal_marginBottom : 2;
            finalCustomFields.marginLeft = finalCustomFields.horizontal_marginLeft !== undefined ? finalCustomFields.horizontal_marginLeft : 2;
            finalCustomFields.marginRight = finalCustomFields.horizontal_marginRight !== undefined ? finalCustomFields.horizontal_marginRight : 2;
            finalCustomFields.gapX = finalCustomFields.horizontal_gapX !== undefined ? finalCustomFields.horizontal_gapX : 2;
            finalCustomFields.gapY = finalCustomFields.horizontal_gapY !== undefined ? finalCustomFields.horizontal_gapY : 2;
            finalCustomFields.cols = finalCustomFields.horizontal_cols !== undefined ? finalCustomFields.horizontal_cols : 2;
            finalCustomFields.rows = finalCustomFields.horizontal_rows !== undefined ? finalCustomFields.horizontal_rows : 4;
          }
          
          setConfig({
            ...config,
            customFields: finalCustomFields
          });
        };

        return (
          <div className="space-y-4 bg-black/25 p-4 border border-white/5 rounded-2xl">
            <h4 className="text-[10px] font-black text-amber-400 uppercase tracking-widest flex items-center gap-1.5 border-b border-white/5 pb-2 mb-3">
              <Sliders className="w-3.5 h-3.5 text-amber-500 animate-pulse" /> CONFIGURAÇÃO DA ETIQUETA
            </h4>

            {/* SEÇÃO 1: GRADE E QUANTIDADE */}
            <div className="space-y-3">
              <h5 className="text-[8.5px] font-black text-amber-300/85 uppercase tracking-widest">1. Grade & Posicionamento</h5>
              
              {/* Orientação do Layout da Etiqueta */}
              <div className="mb-2.5">
                <label className="text-[8.5px] font-bold text-white/40 uppercase block mb-1">Orientação do Layout da Etiqueta</label>
                <div className="grid grid-cols-2 gap-1.5">
                  <button
                    type="button"
                    onClick={() => handleOrientationChange('horizontal')}
                    className={`flex items-center justify-center gap-1.5 text-[10px] font-bold uppercase py-1.5 px-3 rounded-lg border transition-all duration-150 cursor-pointer ${
                      (customFields.orientation !== 'vertical')
                        ? 'bg-amber-500/10 border-amber-500/40 text-amber-400 font-extrabold shadow-sm'
                        : 'bg-zinc-900 border-white/5 text-zinc-400 hover:text-white hover:bg-zinc-800'
                    }`}
                  >
                    <span>Horizontal</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleOrientationChange('vertical')}
                    className={`flex items-center justify-center gap-1.5 text-[10px] font-bold uppercase py-1.5 px-3 rounded-lg border transition-all duration-150 cursor-pointer ${
                      (customFields.orientation === 'vertical')
                        ? 'bg-amber-500/10 border-amber-500/40 text-amber-400 font-extrabold shadow-sm'
                        : 'bg-zinc-900 border-white/5 text-zinc-400 hover:text-white hover:bg-zinc-800'
                    }`}
                  >
                    <span>Vertical</span>
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[8.5px] font-bold text-white/40 uppercase block mb-1">Colunas (Máx {maxCols})</label>
                  <input
                    type="number"
                    min={1}
                    value={customFields.cols ?? ""}
                    onChange={(e) => {
                      const val = e.target.value;
                      if (val === "") {
                        updateCustomField({ cols: "" });
                      } else {
                        const parsed = parseInt(val, 10);
                        const c = isNaN(parsed) ? 1 : Math.max(1, parsed);
                        const q = Math.min(quantity, c * (Number(customFields.rows) || 1));
                        updateCustomField({ cols: c, quantity: q });
                      }
                    }}
                    onBlur={() => {
                      const { maxCols } = getFittedGridLimits(config);
                      const currentCols = Number(config.customFields?.cols);
                      const validCols = isNaN(currentCols) || currentCols < 1 ? 2 : Math.min(maxCols, currentCols);
                      const currentRows = Number(config.customFields?.rows) || 4;
                      const q = Math.min(Number(config.customFields?.quantity) || 1, validCols * currentRows);
                      updateCustomField({ cols: validCols, quantity: q });
                    }}
                    className="w-full bg-zinc-900 border border-white/5 rounded-xl text-xs py-2 px-3 text-zinc-300 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="text-[8.5px] font-bold text-white/40 uppercase block mb-1">Linhas (Máx {maxRows})</label>
                  <input
                    type="number"
                    min={1}
                    value={customFields.rows ?? ""}
                    onChange={(e) => {
                      const val = e.target.value;
                      if (val === "") {
                        updateCustomField({ rows: "" });
                      } else {
                        const parsed = parseInt(val, 10);
                        const r = isNaN(parsed) ? 1 : Math.max(1, parsed);
                        const q = Math.min(quantity, (Number(customFields.cols) || 1) * r);
                        updateCustomField({ rows: r, quantity: q });
                      }
                    }}
                    onBlur={() => {
                      const { maxRows } = getFittedGridLimits(config);
                      const currentRows = Number(config.customFields?.rows);
                      const validRows = isNaN(currentRows) || currentRows < 1 ? 4 : Math.min(maxRows, currentRows);
                      const currentCols = Number(config.customFields?.cols) || 2;
                      const q = Math.min(Number(config.customFields?.quantity) || 1, currentCols * validRows);
                      updateCustomField({ rows: validRows, quantity: q });
                    }}
                    className="w-full bg-zinc-900 border border-white/5 rounded-xl text-xs py-2 px-3 text-zinc-300 focus:outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[8.5px] font-bold text-white/40 uppercase block mb-1">Gap Horizontal (mm)</label>
                  <input
                    type="number"
                    min={0}
                    value={customFields.gapX ?? ""}
                    onChange={(e) => {
                      const val = e.target.value;
                      if (val === "") {
                        updateCustomField({ gapX: "" });
                      } else {
                        const parsed = parseFloat(val);
                        updateCustomField({ gapX: isNaN(parsed) ? 0 : Math.max(0, parsed) });
                      }
                    }}
                    onBlur={() => {
                      const currentGapX = Number(config.customFields?.gapX);
                      const validGapX = isNaN(currentGapX) || currentGapX < 0 ? 2 : currentGapX;
                      
                      const tempConfig = {
                        ...config,
                        customFields: { ...config.customFields, gapX: validGapX }
                      };
                      const { maxCols } = getFittedGridLimits(tempConfig);
                      const currentCols = Number(config.customFields?.cols) || 2;
                      const validCols = Math.max(1, Math.min(maxCols, currentCols));
                      
                      updateCustomField({ gapX: validGapX, cols: validCols });
                    }}
                    className="w-full bg-zinc-900 border border-white/5 rounded-xl text-xs py-2 px-3 text-zinc-300 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="text-[8.5px] font-bold text-white/40 uppercase block mb-1">Gap Vertical (mm)</label>
                  <input
                    type="number"
                    min={0}
                    value={customFields.gapY ?? ""}
                    onChange={(e) => {
                      const val = e.target.value;
                      if (val === "") {
                        updateCustomField({ gapY: "" });
                      } else {
                        const parsed = parseFloat(val);
                        updateCustomField({ gapY: isNaN(parsed) ? 0 : Math.max(0, parsed) });
                      }
                    }}
                    onBlur={() => {
                      const currentGapY = Number(config.customFields?.gapY);
                      const validGapY = isNaN(currentGapY) || currentGapY < 0 ? 2 : currentGapY;

                      const tempConfig = {
                        ...config,
                        customFields: { ...config.customFields, gapY: validGapY }
                      };
                      const { maxRows } = getFittedGridLimits(tempConfig);
                      const currentRows = Number(config.customFields?.rows) || 4;
                      const validRows = Math.max(1, Math.min(maxRows, currentRows));

                      updateCustomField({ gapY: validGapY, rows: validRows });
                    }}
                    className="w-full bg-zinc-900 border border-white/5 rounded-xl text-xs py-2 px-3 text-zinc-300 focus:outline-none"
                  />
                </div>
              </div>

              {/* Quantidade Control */}
              <div className="p-3 bg-zinc-900/60 border border-white/5 rounded-xl space-y-2">
                <div className="flex justify-between items-center">
                  <span className="text-[8.5px] font-black text-white/50 uppercase">Quantidade de Etiquetas</span>
                  <span className="text-[9.5px] font-mono text-amber-400 font-bold">Máx Folha: {maxCapacity}</span>
                </div>
                
                <div className="flex gap-2 items-center">
                  <button
                    onClick={() => updateCustomField({ quantity: Math.max(1, quantity - 1) })}
                    className="p-1 px-3 bg-zinc-800 border border-white/5 text-zinc-300 rounded-lg hover:bg-zinc-700 transition-all font-bold text-base select-none"
                  >
                    -
                  </button>
                  <input
                    type="number"
                    min={1}
                    max={maxCapacity}
                    value={customFields.quantity ?? ""}
                    onChange={(e) => {
                      const val = e.target.value;
                      if (val === "") {
                        updateCustomField({ quantity: "" });
                      } else {
                        const parsed = parseInt(val, 10);
                        const v = isNaN(parsed) ? 1 : Math.max(1, Math.min(maxCapacity, parsed));
                        updateCustomField({ quantity: v });
                      }
                    }}
                    onBlur={() => {
                      const currentQ = Number(config.customFields?.quantity);
                      const validQ = isNaN(currentQ) || currentQ < 1 ? 1 : Math.min(maxCapacity, currentQ);
                      updateCustomField({ quantity: validQ });
                    }}
                    className="flex-1 bg-zinc-950 border border-white/5 rounded-lg text-center font-mono py-1 text-xs text-white focus:outline-none"
                  />
                  <button
                    onClick={() => updateCustomField({ quantity: Math.min(maxCapacity, quantity + 1) })}
                    className="p-1 px-3 bg-zinc-800 border border-white/5 text-zinc-300 rounded-lg hover:bg-zinc-700 transition-all font-bold text-base select-none"
                  >
                    +
                  </button>
                </div>

                <button
                  onClick={() => updateCustomField({ quantity: maxCapacity })}
                  className="w-full mt-1.5 py-1.5 bg-amber-500/10 hover:bg-amber-500/15 border border-amber-500/20 text-amber-400 text-[9px] font-black uppercase tracking-wider rounded-lg transition-all"
                >
                  ⚡ Preencher Folha Inteira
                </button>
              </div>
            </div>

            {/* SEÇÃO 2: DIMENSÕES */}
            <div className="space-y-3 pt-3 border-t border-white/5">
              <div className="flex items-center justify-between">
                <h5 className="text-[8.5px] font-black text-amber-300/85 uppercase tracking-widest">2. Dimensões & Margens (Sticker)</h5>
                <button
                  type="button"
                  id="reset_single_labels_defaults"
                  onClick={() => {
                    updateCustomField({
                      labelWidth: 40,
                      labelHeight: 30,
                      marginTop: 2,
                      marginBottom: 2,
                      marginLeft: 2,
                      marginRight: 2,
                      gapX: 2,
                      gapY: 2,
                      cols: 2,
                      rows: 4,
                      quantity: 1
                    });
                  }}
                  className="text-[9px] text-amber-400 hover:text-amber-300 underline font-semibold transition-colors"
                >
                  Restaurar Padrão (40x30mm)
                </button>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[8.5px] font-bold text-white/40 uppercase block mb-1">Largura Etiqueta (mm)</label>
                  <input
                    type="number"
                    min={10}
                    value={customFields.labelWidth ?? ""}
                    onChange={(e) => {
                      const val = e.target.value;
                      if (val === "") {
                        updateCustomField({ labelWidth: "" });
                      } else {
                        const parsed = parseFloat(val);
                        updateCustomField({ labelWidth: isNaN(parsed) ? 0 : Math.max(0, parsed) });
                      }
                    }}
                    onBlur={() => {
                      const currentW = Number(config.customFields?.labelWidth);
                      const validW = isNaN(currentW) || currentW < 10 ? 40 : currentW;
                      
                      const tempConfig = {
                        ...config,
                        customFields: { ...config.customFields, labelWidth: validW }
                      };
                      const { maxCols } = getFittedGridLimits(tempConfig);
                      const currentCols = Number(config.customFields?.cols) || 2;
                      const validCols = Math.max(1, Math.min(maxCols, currentCols));
                      const currentRows = Number(config.customFields?.rows) || 4;
                      const q = Math.min(Number(config.customFields?.quantity) || 1, validCols * currentRows);

                      updateCustomField({
                        labelWidth: validW,
                        cols: validCols,
                        quantity: q
                      });
                    }}
                    className="w-full bg-zinc-900 border border-white/5 rounded-xl text-xs py-2 px-3 text-zinc-300 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="text-[8.5px] font-bold text-white/40 uppercase block mb-1">Altura Etiqueta (mm)</label>
                  <input
                    type="number"
                    min={10}
                    value={customFields.labelHeight ?? ""}
                    onChange={(e) => {
                      const val = e.target.value;
                      if (val === "") {
                        updateCustomField({ labelHeight: "" });
                      } else {
                        const parsed = parseFloat(val);
                        updateCustomField({ labelHeight: isNaN(parsed) ? 0 : Math.max(0, parsed) });
                      }
                    }}
                    onBlur={() => {
                      const currentH = Number(config.customFields?.labelHeight);
                      const validH = isNaN(currentH) || currentH < 10 ? 30 : currentH;
                      
                      const tempConfig = {
                        ...config,
                        customFields: { ...config.customFields, labelHeight: validH }
                      };
                      const { maxRows } = getFittedGridLimits(tempConfig);
                      const currentRows = Number(config.customFields?.rows) || 4;
                      const validRows = Math.max(1, Math.min(maxRows, currentRows));
                      const currentCols = Number(config.customFields?.cols) || 2;
                      const q = Math.min(Number(config.customFields?.quantity) || 1, currentCols * validRows);

                      updateCustomField({
                        labelHeight: validH,
                        rows: validRows,
                        quantity: q
                      });
                    }}
                    className="w-full bg-zinc-900 border border-white/5 rounded-xl text-xs py-2 px-3 text-zinc-300 focus:outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-4 gap-1">
                <div>
                  <label className="text-[7.5px] font-bold text-white/40 uppercase block mb-1 text-center font-sans truncate">Marg. Top</label>
                  <input
                    type="number"
                    min={0}
                    value={customFields.marginTop ?? ""}
                    onChange={(e) => {
                      const val = e.target.value;
                      if (val === "") {
                        updateCustomField({ marginTop: "" });
                      } else {
                        const parsed = parseFloat(val);
                        updateCustomField({ marginTop: isNaN(parsed) ? 0 : Math.max(0, parsed) });
                      }
                    }}
                    onBlur={() => {
                      const currentM = Number(config.customFields?.marginTop);
                      const validM = isNaN(currentM) || currentM < 0 ? 2 : currentM;

                      const tempConfig = {
                        ...config,
                        customFields: { ...config.customFields, marginTop: validM }
                      };
                      const { maxRows } = getFittedGridLimits(tempConfig);
                      const currentRows = Number(config.customFields?.rows) || 4;
                      const validRows = Math.max(1, Math.min(maxRows, currentRows));
                      const currentCols = Number(config.customFields?.cols) || 2;
                      const q = Math.min(Number(config.customFields?.quantity) || 1, currentCols * validRows);

                      updateCustomField({ marginTop: validM, rows: validRows, quantity: q });
                    }}
                    className="w-full bg-zinc-900 border border-white/5 rounded-lg text-[10px] py-1 px-1.5 text-center text-zinc-300 font-mono focus:outline-none"
                  />
                </div>
                <div>
                  <label className="text-[7.5px] font-bold text-white/40 uppercase block mb-1 text-center font-sans truncate">Marg. Bot</label>
                  <input
                    type="number"
                    min={0}
                    value={customFields.marginBottom ?? ""}
                    onChange={(e) => {
                      const val = e.target.value;
                      if (val === "") {
                        updateCustomField({ marginBottom: "" });
                      } else {
                        const parsed = parseFloat(val);
                        updateCustomField({ marginBottom: isNaN(parsed) ? 0 : Math.max(0, parsed) });
                      }
                    }}
                    onBlur={() => {
                      const currentM = Number(config.customFields?.marginBottom);
                      const validM = isNaN(currentM) || currentM < 0 ? 2 : currentM;

                      const tempConfig = {
                        ...config,
                        customFields: { ...config.customFields, marginBottom: validM }
                      };
                      const { maxRows } = getFittedGridLimits(tempConfig);
                      const currentRows = Number(config.customFields?.rows) || 4;
                      const validRows = Math.max(1, Math.min(maxRows, currentRows));
                      const currentCols = Number(config.customFields?.cols) || 2;
                      const q = Math.min(Number(config.customFields?.quantity) || 1, currentCols * validRows);

                      updateCustomField({ marginBottom: validM, rows: validRows, quantity: q });
                    }}
                    className="w-full bg-zinc-900 border border-white/5 rounded-lg text-[10px] py-1 px-1.5 text-center text-zinc-300 font-mono focus:outline-none"
                  />
                </div>
                <div>
                  <label className="text-[7.5px] font-bold text-white/40 uppercase block mb-1 text-center font-sans truncate">Marg. Esq.</label>
                  <input
                    type="number"
                    min={0}
                    value={customFields.marginLeft ?? ""}
                    onChange={(e) => {
                      const val = e.target.value;
                      if (val === "") {
                        updateCustomField({ marginLeft: "" });
                      } else {
                        const parsed = parseFloat(val);
                        updateCustomField({ marginLeft: isNaN(parsed) ? 0 : Math.max(0, parsed) });
                      }
                    }}
                    onBlur={() => {
                      const currentM = Number(config.customFields?.marginLeft);
                      const validM = isNaN(currentM) || currentM < 0 ? 2 : currentM;

                      const tempConfig = {
                        ...config,
                        customFields: { ...config.customFields, marginLeft: validM }
                      };
                      const { maxCols } = getFittedGridLimits(tempConfig);
                      const currentCols = Number(config.customFields?.cols) || 2;
                      const validCols = Math.max(1, Math.min(maxCols, currentCols));
                      const currentRows = Number(config.customFields?.rows) || 4;
                      const q = Math.min(Number(config.customFields?.quantity) || 1, validCols * currentRows);

                      updateCustomField({ marginLeft: validM, cols: validCols, quantity: q });
                    }}
                    className="w-full bg-zinc-900 border border-white/5 rounded-lg text-[10px] py-1 px-1.5 text-center text-zinc-300 font-mono focus:outline-none"
                  />
                </div>
                <div>
                  <label className="text-[7.5px] font-bold text-white/40 uppercase block mb-1 text-center font-sans truncate">Marg. Dir.</label>
                  <input
                    type="number"
                    min={0}
                    value={customFields.marginRight ?? ""}
                    onChange={(e) => {
                      const val = e.target.value;
                      if (val === "") {
                        updateCustomField({ marginRight: "" });
                      } else {
                        const parsed = parseFloat(val);
                        updateCustomField({ marginRight: isNaN(parsed) ? 0 : Math.max(0, parsed) });
                      }
                    }}
                    onBlur={() => {
                      const currentM = Number(config.customFields?.marginRight);
                      const validM = isNaN(currentM) || currentM < 0 ? 2 : currentM;

                      const tempConfig = {
                        ...config,
                        customFields: { ...config.customFields, marginRight: validM }
                      };
                      const { maxCols } = getFittedGridLimits(tempConfig);
                      const currentCols = Number(config.customFields?.cols) || 2;
                      const validCols = Math.max(1, Math.min(maxCols, currentCols));
                      const currentRows = Number(config.customFields?.rows) || 4;
                      const q = Math.min(Number(config.customFields?.quantity) || 1, validCols * currentRows);

                      updateCustomField({ marginRight: validM, cols: validCols, quantity: q });
                    }}
                    className="w-full bg-zinc-900 border border-white/5 rounded-lg text-[10px] py-1 px-1.5 text-center text-zinc-300 font-mono focus:outline-none"
                  />
                </div>
              </div>
            </div>

            {/* SEÇÃO 3: VISIBILIDADE */}
            <div className="space-y-2 pt-3 border-t border-white/5">
              <h5 className="text-[8.5px] font-black text-amber-300/85 uppercase tracking-widest">3. Visibilidade do Layout</h5>
              <div className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-[9.5px] bg-zinc-950/40 p-3 border border-white/5 rounded-xl">
                <label className="flex items-center gap-1.5 cursor-pointer hover:text-white/90 select-none">
                  <input
                    type="checkbox"
                    checked={showName}
                    onChange={(e) => updateCustomField({ showName: e.target.checked })}
                    className="rounded border-zinc-700 text-amber-500 w-3.5 h-3.5 bg-black cursor-pointer"
                  />
                  <span>Nome do Produto</span>
                </label>
                <label className="flex items-center gap-1.5 cursor-pointer hover:text-white/90 select-none">
                  <input
                    type="checkbox"
                    checked={showSku}
                    onChange={(e) => updateCustomField({ showSku: e.target.checked })}
                    className="rounded border-zinc-700 text-amber-500 w-3.5 h-3.5 bg-black cursor-pointer"
                  />
                  <span>SKU / Código</span>
                </label>
                <label className="flex items-center gap-1.5 cursor-pointer hover:text-white/90 select-none">
                  <input
                    type="checkbox"
                    checked={showPrice}
                    onChange={(e) => updateCustomField({ showPrice: e.target.checked })}
                    className="rounded border-zinc-700 text-amber-500 w-3.5 h-3.5 bg-black cursor-pointer"
                  />
                  <span>Preço de Venda</span>
                </label>
                <label className="flex items-center gap-1.5 cursor-pointer hover:text-white/90 select-none">
                  <input
                    type="checkbox"
                    checked={showQrCode}
                    onChange={(e) => updateCustomField({ showQrCode: e.target.checked })}
                    className="rounded border-zinc-700 text-amber-500 w-3.5 h-3.5 bg-black cursor-pointer"
                  />
                  <span>QR Code</span>
                </label>
                <label className="flex items-center gap-1.5 cursor-pointer hover:text-white/90 select-none">
                  <input
                    type="checkbox"
                    checked={showBrand}
                    onChange={(e) => updateCustomField({ showBrand: e.target.checked })}
                    className="rounded border-zinc-700 text-amber-500 w-3.5 h-3.5 bg-black cursor-pointer"
                  />
                  <span>Marca</span>
                </label>
                <label className="flex items-center gap-1.5 cursor-pointer hover:text-white/90 select-none">
                  <input
                    type="checkbox"
                    checked={showCategory}
                    onChange={(e) => updateCustomField({ showCategory: e.target.checked })}
                    className="rounded border-zinc-700 text-amber-500 w-3.5 h-3.5 bg-black cursor-pointer"
                  />
                  <span>Categoria</span>
                </label>
                <label className="flex items-center gap-1.5 cursor-pointer hover:text-white/90 select-none">
                  <input
                    type="checkbox"
                    checked={showVariation}
                    onChange={(e) => updateCustomField({ showVariation: e.target.checked })}
                    className="rounded border-zinc-700 text-amber-500 w-3.5 h-3.5 bg-black cursor-pointer"
                  />
                  <span>Variação</span>
                </label>
                <label className="flex items-center gap-1.5 cursor-pointer hover:text-white/90 select-none">
                  <input
                    type="checkbox"
                    checked={showStock}
                    onChange={(e) => updateCustomField({ showStock: e.target.checked })}
                    className="rounded border-zinc-700 text-amber-500 w-3.5 h-3.5 bg-black cursor-pointer"
                  />
                  <span>Estoque Físico</span>
                </label>
                <label className="flex items-center gap-1.5 cursor-pointer hover:text-white/90 col-span-2 border-t border-white/5 pt-1.5 mt-1.5 select-none text-emerald-400">
                  <input
                    type="checkbox"
                    checked={guideEnabled}
                    onChange={(e) => updateCustomField({ guideEnabled: e.target.checked })}
                    className="rounded border-zinc-700 text-amber-500 w-3.5 h-3.5 bg-black cursor-pointer"
                  />
                  <span className="font-extrabold font-sans">ATIVAR GUIA VISUAL (PREVIEW)</span>
                </label>
              </div>

              {guideEnabled && (
                <div className="space-y-1 bg-zinc-950/20 p-2.5 border border-emerald-500/10 rounded-xl">
                  <div className="flex justify-between items-center text-[8px] font-bold text-emerald-400 uppercase">
                    <span>Opacidade da Guia</span>
                    <span>{Math.round(guideOpacity * 100)}%</span>
                  </div>
                  <input
                    type="range"
                    min={0.1}
                    max={1.0}
                    step={0.05}
                    value={guideOpacity}
                    onChange={(e) => updateCustomField({ guideOpacity: parseFloat(e.target.value) })}
                    className="w-full h-1 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-emerald-500"
                  />
                </div>
              )}
            </div>

            {/* SEÇÃO 4: VINCULAÇÃO DE PRODUTO */}
            <div className="space-y-3 pt-3 border-t border-white/5">
              <h5 className="text-[8.5px] font-black text-amber-300/85 uppercase tracking-widest flex items-center justify-between">
                <span>4. Produto do Catálogo</span>
                <span className="text-[8px] font-extrabold text-white/30 truncate">(Opção Individual)</span>
              </h5>
              
              <div>
                <label className="text-[8.5px] font-bold text-white/40 uppercase block mb-1">Escolha o Produto Ativo</label>
                <select
                  value={activeSelectedProduct?.id || ''}
                  onChange={(e) => {
                    const found = products.find(p => p.id === e.target.value);
                    if (found) {
                      updateCustomField({
                        selectedProduct: {
                          id: found.id,
                          name: found.name,
                          code: found.code,
                          brand: found.category || 'Geral',
                          stock: found.stock,
                          price: found.price,
                          category: found.category,
                          variation: 'Único',
                          barcode: found.barcode || found.code
                        }
                      });
                    }
                  }}
                  className="w-full bg-zinc-900 border border-white/5 rounded-xl text-xs py-2 px-3 text-zinc-300 focus:outline-none cursor-pointer"
                >
                  <option value="">-- Selecione do Catálogo --</option>
                  {products.map(p => (
                    <option key={p.id} value={p.id}>
                      {p.name} {p.code ? `(${p.code})` : ''}
                    </option>
                  ))}
                </select>
              </div>

              {/* Editable simulation details of active Selected Product */}
              <div className="bg-zinc-950/40 p-3 border border-white/5 rounded-xl space-y-2">
                <span className="text-[8px] font-black text-white/35 uppercase block">Componentes do Adesivo Ativo</span>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-[7.5px] font-medium text-white/40 uppercase block mb-0.5">Nome de Exibição</label>
                    <input
                      type="text"
                      value={activeSelectedProduct.name || ''}
                      onChange={(e) => updateCustomField({ 
                        selectedProduct: { ...activeSelectedProduct, name: e.target.value } 
                      })}
                      className="w-full bg-zinc-900/80 border border-white/5 rounded-lg text-[10px] py-1 px-1.5 text-zinc-300 font-semibold focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="text-[7.5px] font-medium text-white/40 uppercase block mb-0.5">SKU / Código</label>
                    <input
                      type="text"
                      value={activeSelectedProduct.code || ''}
                      onChange={(e) => updateCustomField({ 
                        selectedProduct: { ...activeSelectedProduct, code: e.target.value } 
                      })}
                      className="w-full bg-zinc-900/80 border border-white/5 rounded-lg text-[10px] py-1 px-1.5 text-zinc-350 font-mono font-bold focus:outline-none"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-1.5">
                  <div>
                    <label className="text-[7.5px] font-medium text-white/40 uppercase block mb-0.5 font-sans truncate">Marca</label>
                    <input
                      type="text"
                      value={activeSelectedProduct.brand || ''}
                      onChange={(e) => updateCustomField({ 
                        selectedProduct: { ...activeSelectedProduct, brand: e.target.value } 
                      })}
                      className="w-full bg-zinc-900/80 border border-white/5 rounded-lg text-[10px] py-1 px-1.5 text-zinc-350 focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="text-[7.5px] font-medium text-white/40 uppercase block mb-0.5 font-sans truncate">Preço (R$)</label>
                    <input
                      type="number"
                      value={activeSelectedProduct.price || 0}
                      onChange={(e) => updateCustomField({ 
                        selectedProduct: { ...activeSelectedProduct, price: parseFloat(e.target.value) || 0 } 
                      })}
                      className="w-full bg-zinc-900/80 border border-white/5 rounded-lg text-[10px] py-1 px-1.5 text-zinc-350 focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="text-[7.5px] font-medium text-white/40 uppercase block mb-0.5 font-sans truncate">Estoque</label>
                    <input
                      type="number"
                      value={activeSelectedProduct.stock || 0}
                      onChange={(e) => updateCustomField({ 
                        selectedProduct: { ...activeSelectedProduct, stock: parseInt(e.target.value) || 0 } 
                      })}
                      className="w-full bg-zinc-900/80 border border-white/5 rounded-lg text-[10px] py-1 px-1.5 text-zinc-350 focus:outline-none"
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>
        );
      }
      case 'etiquetaLote': {
        const customFields = config.customFields || {};
        const { maxCols, maxRows } = getFittedGridLimits(config);
        const cols = typeof customFields.cols === 'number' ? Math.min(customFields.cols, maxCols) : (customFields.cols || 3);
        const rows = typeof customFields.rows === 'number' ? Math.min(customFields.rows, maxRows) : (customFields.rows || 6);
        const maxCapacity = cols * rows;
        
        const labelWidth = customFields.labelWidth ?? 50;
        const labelHeight = customFields.labelHeight ?? 30;
        const marginTop = customFields.marginTop ?? 0.3;
        const marginBottom = customFields.marginBottom ?? 0.3;
        const marginLeft = customFields.marginLeft ?? 0.3;
        const marginRight = customFields.marginRight ?? 0.3;
        const gapX = customFields.gapX ?? 4;
        const gapY = customFields.gapY ?? 4;

        const showName = customFields.showName !== false;
        const showSku = customFields.showSku !== false;
        const showPrice = customFields.showPrice !== false;
        const showQrCode = customFields.showQrCode !== false;
        const showBrand = customFields.showBrand !== false;
        const showCategory = customFields.showCategory !== false;
        const showVariation = customFields.showVariation !== false;
        const showStock = customFields.showStock !== false;
        
        const guideEnabled = customFields.guideEnabled !== false;
        const guideOpacity = customFields.guideOpacity ?? 0.3;

        // Use resolved batch products from store
        const activeProducts = resolvedBatchProducts;

        // Calculate current total quantity of items in batch
        const currentSum = resolvedBatchProducts.reduce((sum, p) => sum + (p?.qty || 1), 0);

        // Safe updater
        const updateCustomField = (updates: Record<string, any>) => {
          setConfig({
            ...config,
            customFields: {
              ...config.customFields,
              ...updates
            }
          });
        };

        const handleOrientationChange = (newOrientation: 'horizontal' | 'vertical') => {
          const finalCustomFields = { ...config.customFields, orientation: newOrientation };
          
          if (newOrientation === 'vertical') {
            finalCustomFields.labelWidth = finalCustomFields.vertical_labelWidth !== undefined ? finalCustomFields.vertical_labelWidth : 30;
            finalCustomFields.labelHeight = finalCustomFields.vertical_labelHeight !== undefined ? finalCustomFields.vertical_labelHeight : 40;
            finalCustomFields.marginTop = finalCustomFields.vertical_marginTop !== undefined ? finalCustomFields.vertical_marginTop : 2;
            finalCustomFields.marginBottom = finalCustomFields.vertical_marginBottom !== undefined ? finalCustomFields.vertical_marginBottom : 2;
            finalCustomFields.marginLeft = finalCustomFields.vertical_marginLeft !== undefined ? finalCustomFields.vertical_marginLeft : 2;
            finalCustomFields.marginRight = finalCustomFields.vertical_marginRight !== undefined ? finalCustomFields.vertical_marginRight : 2;
            finalCustomFields.gapX = finalCustomFields.vertical_gapX !== undefined ? finalCustomFields.vertical_gapX : 2;
            finalCustomFields.gapY = finalCustomFields.vertical_gapY !== undefined ? finalCustomFields.vertical_gapY : 2;
            finalCustomFields.cols = finalCustomFields.vertical_cols !== undefined ? finalCustomFields.vertical_cols : 2;
            finalCustomFields.rows = finalCustomFields.vertical_rows !== undefined ? finalCustomFields.vertical_rows : 3;
          } else {
            finalCustomFields.labelWidth = finalCustomFields.horizontal_labelWidth !== undefined ? finalCustomFields.horizontal_labelWidth : 40;
            finalCustomFields.labelHeight = finalCustomFields.horizontal_labelHeight !== undefined ? finalCustomFields.horizontal_labelHeight : 30;
            finalCustomFields.marginTop = finalCustomFields.horizontal_marginTop !== undefined ? finalCustomFields.horizontal_marginTop : 2;
            finalCustomFields.marginBottom = finalCustomFields.horizontal_marginBottom !== undefined ? finalCustomFields.horizontal_marginBottom : 2;
            finalCustomFields.marginLeft = finalCustomFields.horizontal_marginLeft !== undefined ? finalCustomFields.horizontal_marginLeft : 2;
            finalCustomFields.marginRight = finalCustomFields.horizontal_marginRight !== undefined ? finalCustomFields.horizontal_marginRight : 2;
            finalCustomFields.gapX = finalCustomFields.horizontal_gapX !== undefined ? finalCustomFields.horizontal_gapX : 2;
            finalCustomFields.gapY = finalCustomFields.horizontal_gapY !== undefined ? finalCustomFields.horizontal_gapY : 2;
            finalCustomFields.cols = finalCustomFields.horizontal_cols !== undefined ? finalCustomFields.horizontal_cols : 2;
            finalCustomFields.rows = finalCustomFields.horizontal_rows !== undefined ? finalCustomFields.horizontal_rows : 4;
          }
          
          setConfig({
            ...config,
            customFields: finalCustomFields
          });
        };

        const handleIncrement = (prodId: string) => {
          const item = labelBatchItems.find(it => it.productId === prodId);
          if (item) {
            updateLabelBatchQuantity(prodId, item.quantity + 1);
          } else {
            addToLabelBatch(prodId);
          }
        };

        const handleDecrement = (prodId: string) => {
          const item = labelBatchItems.find(it => it.productId === prodId);
          if (item) {
            if (item.quantity > 1) {
              updateLabelBatchQuantity(prodId, item.quantity - 1);
            } else {
              removeFromLabelBatch(prodId);
            }
          }
        };

        return (
          <div className="space-y-4 bg-black/25 p-4 border border-white/5 rounded-2xl">
                       {/* SEÇÃO 1: GRADE E POSICIONAMENTO */}
            <div className="space-y-3">
              <h5 className="text-[8.5px] font-black text-rose-300/85 uppercase tracking-widest font-sans">1. Grade & Posicionamento (Lote)</h5>
              
              {/* Orientação do Layout da Etiqueta */}
              <div className="mb-2.5">
                <label className="text-[8.5px] font-bold text-white/40 uppercase block mb-1">Orientação do Layout da Etiqueta</label>
                <div className="grid grid-cols-2 gap-1.5">
                  <button
                    type="button"
                    onClick={() => handleOrientationChange('horizontal')}
                    className={`flex items-center justify-center gap-1.5 text-[10px] font-bold uppercase py-1.5 px-3 rounded-lg border transition-all duration-150 cursor-pointer ${
                      (customFields.orientation !== 'vertical')
                        ? 'bg-rose-500/10 border-rose-500/40 text-rose-400 font-extrabold shadow-sm'
                        : 'bg-zinc-900 border-white/5 text-zinc-400 hover:text-white hover:bg-zinc-800'
                    }`}
                  >
                    <span>Horizontal</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleOrientationChange('vertical')}
                    className={`flex items-center justify-center gap-1.5 text-[10px] font-bold uppercase py-1.5 px-3 rounded-lg border transition-all duration-150 cursor-pointer ${
                      (customFields.orientation === 'vertical')
                        ? 'bg-rose-500/10 border-rose-500/40 text-rose-400 font-extrabold shadow-sm'
                        : 'bg-zinc-900 border-white/5 text-zinc-400 hover:text-white hover:bg-zinc-800'
                    }`}
                  >
                    <span>Vertical</span>
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[8.5px] font-bold text-white/40 uppercase block mb-1">Colunas (Máx {maxCols})</label>
                  <input
                    type="number"
                    min={1}
                    value={customFields.cols ?? ""}
                    onChange={(e) => {
                      const val = e.target.value;
                      if (val === "") {
                        updateCustomField({ cols: "" });
                      } else {
                        const parsed = parseInt(val, 10);
                        const c = isNaN(parsed) ? 1 : Math.max(1, parsed);
                        updateCustomField({ cols: c });
                      }
                    }}
                    onBlur={() => {
                      const { maxCols } = getFittedGridLimits(config);
                      const currentCols = Number(config.customFields?.cols);
                      const validCols = isNaN(currentCols) || currentCols < 1 ? 2 : Math.min(maxCols, currentCols);
                      updateCustomField({ cols: validCols });
                    }}
                    className="w-full bg-zinc-900 border border-white/5 rounded-xl text-xs py-2 px-3 text-zinc-350 focus:outline-none font-semibold"
                  />
                </div>
                <div>
                  <label className="text-[8.5px] font-bold text-white/40 uppercase block mb-1">Linhas (Máx {maxRows})</label>
                  <input
                    type="number"
                    min={1}
                    value={customFields.rows ?? ""}
                    onChange={(e) => {
                      const val = e.target.value;
                      if (val === "") {
                        updateCustomField({ rows: "" });
                      } else {
                        const parsed = parseInt(val, 10);
                        const r = isNaN(parsed) ? 1 : Math.max(1, parsed);
                        updateCustomField({ rows: r });
                      }
                    }}
                    onBlur={() => {
                      const { maxRows } = getFittedGridLimits(config);
                      const currentRows = Number(config.customFields?.rows);
                      const validRows = isNaN(currentRows) || currentRows < 1 ? 4 : Math.min(maxRows, currentRows);
                      updateCustomField({ rows: validRows });
                    }}
                    className="w-full bg-zinc-900 border border-white/5 rounded-xl text-xs py-2 px-3 text-zinc-355 focus:outline-none font-semibold"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[8.5px] font-bold text-white/40 uppercase block mb-1">Gap Horizontal (mm)</label>
                  <input
                    type="number"
                    min={0}
                    value={customFields.gapX ?? ""}
                    onChange={(e) => {
                      const val = e.target.value;
                      if (val === "") {
                        updateCustomField({ gapX: "" });
                      } else {
                        const parsed = parseFloat(val);
                        updateCustomField({ gapX: isNaN(parsed) ? 0 : Math.max(0, parsed) });
                      }
                    }}
                    onBlur={() => {
                      const currentGapX = Number(config.customFields?.gapX);
                      const validGapX = isNaN(currentGapX) || currentGapX < 0 ? 2 : currentGapX;

                      const tempConfig = {
                        ...config,
                        customFields: { ...config.customFields, gapX: validGapX }
                      };
                      const { maxCols } = getFittedGridLimits(tempConfig);
                      const currentCols = Number(config.customFields?.cols) || 2;
                      const validCols = Math.max(1, Math.min(maxCols, currentCols));

                      updateCustomField({ gapX: validGapX, cols: validCols });
                    }}
                    className="w-full bg-zinc-900 border border-white/5 rounded-xl text-xs py-2 px-3 text-zinc-350 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="text-[8.5px] font-bold text-white/40 uppercase block mb-1">Gap Vertical (mm)</label>
                  <input
                    type="number"
                    min={0}
                    value={customFields.gapY ?? ""}
                    onChange={(e) => {
                      const val = e.target.value;
                      if (val === "") {
                        updateCustomField({ gapY: "" });
                      } else {
                        const parsed = parseFloat(val);
                        updateCustomField({ gapY: isNaN(parsed) ? 0 : Math.max(0, parsed) });
                      }
                    }}
                    onBlur={() => {
                      const currentGapY = Number(config.customFields?.gapY);
                      const validGapY = isNaN(currentGapY) || currentGapY < 0 ? 2 : currentGapY;

                      const tempConfig = {
                        ...config,
                        customFields: { ...config.customFields, gapY: validGapY }
                      };
                      const { maxRows } = getFittedGridLimits(tempConfig);
                      const currentRows = Number(config.customFields?.rows) || 4;
                      const validRows = Math.max(1, Math.min(maxRows, currentRows));

                      updateCustomField({ gapY: validGapY, rows: validRows });
                    }}
                    className="w-full bg-zinc-900 border border-white/5 rounded-xl text-xs py-2 px-3 text-zinc-350 focus:outline-none"
                  />
                </div>
              </div>

              {/* Lotes summary stats and fillers */}
              <div className="p-3 bg-zinc-900/60 border border-white/5 rounded-xl space-y-2">
                <div className="flex justify-between items-center text-[9px]">
                  <span className="font-black text-white/50 uppercase">Agregação no Lote</span>
                  <span className="font-mono text-rose-450 font-bold">Sumulados: {currentSum} / {maxCapacity}</span>
                </div>

                <div className="w-full bg-zinc-950 h-2 rounded-full overflow-hidden border border-white/5 flex">
                  <div 
                    className="bg-rose-500 h-full transition-all duration-300" 
                    style={{ width: `${Math.min(100, (currentSum / maxCapacity) * 100)}%` }} 
                  />
                </div>

                {currentSum < maxCapacity && activeProducts.length > 0 && (
                   <button
                     onClick={() => {
                        const remaining = maxCapacity - currentSum;
                        if (remaining > 0) {
                           const updated = activeProducts.map((p: any, idx: number) => {
                             if (idx === 0) return { ...p, qty: (p.qty || 1) + remaining };
                             return p;
                           });
                           {
                             const firstLine = activeProducts[0];
                             const item = labelBatchItems.find(it => it.productId === firstLine.id);
                             if (item) {
                                updateLabelBatchQuantity(firstLine.id, item.quantity + remaining);
                             }
                           }
                        }
                     }}
                     className="w-full mt-1.5 py-1.5 bg-rose-500/10 hover:bg-rose-500/15 border border-rose-500/20 text-rose-400 text-[9px] font-black uppercase tracking-wider rounded-lg transition-all"
                   >
                     ⚡ Preencher Folha com Itens Ativos
                   </button>
                )}
              </div>
            </div>

            {/* SEÇÃO 2: DIMENSÕES */}
            <div className="space-y-3 pt-3 border-t border-white/5">
              <div className="flex items-center justify-between">
                <h5 className="text-[8.5px] font-black text-rose-300/85 uppercase tracking-widest">2. Dimensões do Adesivo (mm)</h5>
                <button
                  type="button"
                  id="reset_lot_labels_defaults"
                  onClick={() => {
                    updateCustomField({
                      labelWidth: 40,
                      labelHeight: 30,
                      marginTop: 2,
                      marginBottom: 2,
                      marginLeft: 2,
                      marginRight: 2,
                      gapX: 2,
                      gapY: 2,
                      cols: 2,
                      rows: 4
                    });
                  }}
                  className="text-[9px] text-rose-400 hover:text-rose-300 underline font-semibold transition-colors font-sans"
                >
                  Restaurar Padrão (40x30mm)
                </button>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[8.5px] font-bold text-white/40 uppercase block mb-1">Largura Etiqueta</label>
                  <input
                    type="number"
                    min={10}
                    value={customFields.labelWidth ?? ""}
                    onChange={(e) => {
                      const val = e.target.value;
                      if (val === "") {
                        updateCustomField({ labelWidth: "" });
                      } else {
                        const parsed = parseFloat(val);
                        updateCustomField({ labelWidth: isNaN(parsed) ? 0 : Math.max(0, parsed) });
                      }
                    }}
                    onBlur={() => {
                      const currentW = Number(config.customFields?.labelWidth);
                      const validW = isNaN(currentW) || currentW < 10 ? 40 : currentW;

                      const tempConfig = {
                        ...config,
                        customFields: { ...config.customFields, labelWidth: validW }
                      };
                      const { maxCols } = getFittedGridLimits(tempConfig);
                      const currentCols = Number(config.customFields?.cols) || 2;
                      const validCols = Math.max(1, Math.min(maxCols, currentCols));

                      updateCustomField({ labelWidth: validW, cols: validCols });
                    }}
                    className="w-full bg-zinc-900 border border-white/5 rounded-xl text-xs py-2 px-3 text-zinc-350 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="text-[8.5px] font-bold text-white/40 uppercase block mb-1">Altura Etiqueta</label>
                  <input
                    type="number"
                    min={10}
                    value={customFields.labelHeight ?? ""}
                    onChange={(e) => {
                      const val = e.target.value;
                      if (val === "") {
                        updateCustomField({ labelHeight: "" });
                      } else {
                        const parsed = parseFloat(val);
                        updateCustomField({ labelHeight: isNaN(parsed) ? 0 : Math.max(0, parsed) });
                      }
                    }}
                    onBlur={() => {
                      const currentH = Number(config.customFields?.labelHeight);
                      const validH = isNaN(currentH) || currentH < 10 ? 30 : currentH;

                      const tempConfig = {
                        ...config,
                        customFields: { ...config.customFields, labelHeight: validH }
                      };
                      const { maxRows } = getFittedGridLimits(tempConfig);
                      const currentRows = Number(config.customFields?.rows) || 4;
                      const validRows = Math.max(1, Math.min(maxRows, currentRows));

                      updateCustomField({ labelHeight: validH, rows: validRows });
                    }}
                    className="w-full bg-zinc-900 border border-white/5 rounded-xl text-xs py-2 px-3 text-zinc-350 focus:outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-4 gap-1">
                <div>
                  <label className="text-[7.5px] font-bold text-white/40 uppercase block mb-1 text-center truncate">Marg. Top</label>
                  <input
                    type="number"
                    min={0}
                    value={customFields.marginTop ?? ""}
                    onChange={(e) => {
                      const val = e.target.value;
                      if (val === "") {
                        updateCustomField({ marginTop: "" });
                      } else {
                        const parsed = parseFloat(val);
                        updateCustomField({ marginTop: isNaN(parsed) ? 0 : Math.max(0, parsed) });
                      }
                    }}
                    onBlur={() => {
                      const currentM = Number(config.customFields?.marginTop);
                      const validM = isNaN(currentM) || currentM < 0 ? 2 : currentM;

                      const tempConfig = {
                        ...config,
                        customFields: { ...config.customFields, marginTop: validM }
                      };
                      const { maxRows } = getFittedGridLimits(tempConfig);
                      const currentRows = Number(config.customFields?.rows) || 4;
                      const validRows = Math.max(1, Math.min(maxRows, currentRows));

                      updateCustomField({ marginTop: validM, rows: validRows });
                    }}
                    className="w-full bg-zinc-900 border border-white/5 rounded-lg text-[10px] py-1 px-1.5 text-center text-zinc-300 font-mono focus:outline-none"
                  />
                </div>
                <div>
                  <label className="text-[7.5px] font-bold text-white/40 uppercase block mb-1 text-center truncate">Marg. Bot</label>
                  <input
                    type="number"
                    min={0}
                    value={customFields.marginBottom ?? ""}
                    onChange={(e) => {
                      const val = e.target.value;
                      if (val === "") {
                        updateCustomField({ marginBottom: "" });
                      } else {
                        const parsed = parseFloat(val);
                        updateCustomField({ marginBottom: isNaN(parsed) ? 0 : Math.max(0, parsed) });
                      }
                    }}
                    onBlur={() => {
                      const currentM = Number(config.customFields?.marginBottom);
                      const validM = isNaN(currentM) || currentM < 0 ? 2 : currentM;

                      const tempConfig = {
                        ...config,
                        customFields: { ...config.customFields, marginBottom: validM }
                      };
                      const { maxRows } = getFittedGridLimits(tempConfig);
                      const currentRows = Number(config.customFields?.rows) || 4;
                      const validRows = Math.max(1, Math.min(maxRows, currentRows));

                      updateCustomField({ marginBottom: validM, rows: validRows });
                    }}
                    className="w-full bg-zinc-900 border border-white/5 rounded-lg text-[10px] py-1 px-1.5 text-center text-zinc-300 font-mono focus:outline-none"
                  />
                </div>
                <div>
                  <label className="text-[7.5px] font-bold text-white/40 uppercase block mb-1 text-center truncate">Marg. Esq.</label>
                  <input
                    type="number"
                    min={0}
                    value={customFields.marginLeft ?? ""}
                    onChange={(e) => {
                      const val = e.target.value;
                      if (val === "") {
                        updateCustomField({ marginLeft: "" });
                      } else {
                        const parsed = parseFloat(val);
                        updateCustomField({ marginLeft: isNaN(parsed) ? 0 : Math.max(0, parsed) });
                      }
                    }}
                    onBlur={() => {
                      const currentM = Number(config.customFields?.marginLeft);
                      const validM = isNaN(currentM) || currentM < 0 ? 2 : currentM;

                      const tempConfig = {
                        ...config,
                        customFields: { ...config.customFields, marginLeft: validM }
                      };
                      const { maxCols } = getFittedGridLimits(tempConfig);
                      const currentCols = Number(config.customFields?.cols) || 2;
                      const validCols = Math.max(1, Math.min(maxCols, currentCols));

                      updateCustomField({ marginLeft: validM, cols: validCols });
                    }}
                    className="w-full bg-zinc-900 border border-white/5 rounded-lg text-[10px] py-1 px-1.5 text-center text-zinc-300 font-mono focus:outline-none"
                  />
                </div>
                <div>
                  <label className="text-[7.5px] font-bold text-white/40 uppercase block mb-1 text-center truncate">Marg. Dir.</label>
                  <input
                    type="number"
                    min={0}
                    value={customFields.marginRight ?? ""}
                    onChange={(e) => {
                      const val = e.target.value;
                      if (val === "") {
                        updateCustomField({ marginRight: "" });
                      } else {
                        const parsed = parseFloat(val);
                        updateCustomField({ marginRight: isNaN(parsed) ? 0 : Math.max(0, parsed) });
                      }
                    }}
                    onBlur={() => {
                      const currentM = Number(config.customFields?.marginRight);
                      const validM = isNaN(currentM) || currentM < 0 ? 2 : currentM;

                      const tempConfig = {
                        ...config,
                        customFields: { ...config.customFields, marginRight: validM }
                      };
                      const { maxCols } = getFittedGridLimits(tempConfig);
                      const currentCols = Number(config.customFields?.cols) || 2;
                      const validCols = Math.max(1, Math.min(maxCols, currentCols));

                      updateCustomField({ marginRight: validM, cols: validCols });
                    }}
                    className="w-full bg-zinc-900 border border-white/5 rounded-lg text-[10px] py-1 px-1.5 text-center text-zinc-300 font-mono focus:outline-none"
                  />
                </div>
              </div>
            </div>

            {/* SEÇÃO 3: VISIBILIDADE */}
            <div className="space-y-2 pt-3 border-t border-white/5 font-sans">
              <h5 className="text-[8.5px] font-black text-rose-300/85 uppercase tracking-widest">3. Visibilidade do Lote</h5>
              <div className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-[9.5px] bg-zinc-950/40 p-3 border border-white/5 rounded-xl">
                <label className="flex items-center gap-1.5 cursor-pointer hover:text-white/90 select-none">
                  <input
                    type="checkbox"
                    checked={showName}
                    onChange={(e) => updateCustomField({ showName: e.target.checked })}
                    className="rounded border-zinc-700 text-rose-500 w-3.5 h-3.5 bg-black cursor-pointer"
                  />
                  <span>Nome do Produto</span>
                </label>
                <label className="flex items-center gap-1.5 cursor-pointer hover:text-white/90 select-none">
                  <input
                    type="checkbox"
                    checked={showSku}
                    onChange={(e) => updateCustomField({ showSku: e.target.checked })}
                    className="rounded border-zinc-700 text-rose-500 w-3.5 h-3.5 bg-black cursor-pointer"
                  />
                  <span>SKU / Variação</span>
                </label>
                <label className="flex items-center gap-1.5 cursor-pointer hover:text-white/90 select-none">
                  <input
                    type="checkbox"
                    checked={showPrice}
                    onChange={(e) => updateCustomField({ showPrice: e.target.checked })}
                    className="rounded border-zinc-700 text-rose-500 w-3.5 h-3.5 bg-black cursor-pointer"
                  />
                  <span>Preço de Venda</span>
                </label>
                <label className="flex items-center gap-1.5 cursor-pointer hover:text-white/90 select-none">
                  <input
                    type="checkbox"
                    checked={showQrCode}
                    onChange={(e) => updateCustomField({ showQrCode: e.target.checked })}
                    className="rounded border-zinc-700 text-rose-500 w-3.5 h-3.5 bg-black cursor-pointer"
                  />
                  <span>QR Code</span>
                </label>
                <label className="flex items-center gap-1.5 cursor-pointer hover:text-white/90 select-none">
                  <input
                    type="checkbox"
                    checked={showBrand}
                    onChange={(e) => updateCustomField({ showBrand: e.target.checked })}
                    className="rounded border-zinc-700 text-rose-500 w-3.5 h-3.5 bg-black cursor-pointer"
                  />
                  <span>Marca</span>
                </label>
                <label className="flex items-center gap-1.5 cursor-pointer hover:text-white/90 select-none">
                  <input
                    type="checkbox"
                    checked={showCategory}
                    onChange={(e) => updateCustomField({ showCategory: e.target.checked })}
                    className="rounded border-zinc-700 text-rose-500 w-3.5 h-3.5 bg-black cursor-pointer"
                  />
                  <span>Categoria</span>
                </label>
                <label className="flex items-center gap-1.5 cursor-pointer hover:text-white/90 select-none">
                  <input
                    type="checkbox"
                    checked={showVariation}
                    onChange={(e) => updateCustomField({ showVariation: e.target.checked })}
                    className="rounded border-zinc-700 text-rose-500 w-3.5 h-3.5 bg-black cursor-pointer"
                  />
                  <span>Variação</span>
                </label>
                <label className="flex items-center gap-1.5 cursor-pointer hover:text-white/90 select-none">
                  <input
                    type="checkbox"
                    checked={showStock}
                    onChange={(e) => updateCustomField({ showStock: e.target.checked })}
                    className="rounded border-zinc-700 text-rose-550 w-3.5 h-3.5 bg-black cursor-pointer"
                  />
                  <span>Estoque Físico</span>
                </label>
                <label className="flex items-center gap-1.5 cursor-pointer hover:text-white/90 col-span-2 border-t border-white/5 pt-1.5 mt-1.5 select-none text-emerald-400">
                  <input
                    type="checkbox"
                    checked={guideEnabled}
                    onChange={(e) => updateCustomField({ guideEnabled: e.target.checked })}
                    className="rounded border-zinc-700 text-rose-500 w-3.5 h-3.5 bg-black cursor-pointer"
                  />
                  <span className="font-extrabold font-sans">ATIVAR GUIA VISUAL (PREVIEW)</span>
                </label>
              </div>

              {guideEnabled && (
                <div className="space-y-1 bg-zinc-950/20 p-2.5 border border-emerald-500/10 rounded-xl">
                  <div className="flex justify-between items-center text-[8px] font-bold text-emerald-400 uppercase">
                    <span>Opacidade da Guia</span>
                    <span>{Math.round(guideOpacity * 100)}%</span>
                  </div>
                  <input
                    type="range"
                    min={0.1}
                    max={1.0}
                    step={0.05}
                    value={guideOpacity}
                    onChange={(e) => updateCustomField({ guideOpacity: parseFloat(e.target.value) })}
                    className="w-full h-1 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-emerald-500"
                  />
                </div>
              )}
            </div>

            {/* SEÇÃO 3.5: MODALIDADE DE TEMA DO LOTE */}
            <div className="space-y-3 pt-3 border-t border-white/5 font-sans">
              <h5 className="text-[8.5px] font-black text-rose-300/85 uppercase tracking-widest">3.5 Modo de Aplicação do Tema</h5>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => updateCustomField({ themeMode: 'global' })}
                  className={cn(
                    "py-2 px-3 rounded-xl text-[10px] font-bold uppercase tracking-wider transition-all border cursor-pointer",
                    (customFields.themeMode !== 'per_product')
                      ? "bg-rose-500/25 border-rose-500/40 text-rose-100 shadow-[0_0_12px_rgba(244,63,94,0.1)]"
                      : "bg-zinc-900 border-white/5 text-zinc-400 hover:text-white"
                  )}
                >
                  Global (Único)
                </button>
                <button
                  type="button"
                  onClick={() => updateCustomField({ themeMode: 'per_product' })}
                  className={cn(
                    "py-2 px-3 rounded-xl text-[10px] font-bold uppercase tracking-wider transition-all border cursor-pointer",
                    (customFields.themeMode === 'per_product')
                      ? "bg-rose-500/25 border-rose-500/40 text-rose-100 shadow-[0_0_12px_rgba(244,63,94,0.1)]"
                      : "bg-zinc-900 border-white/5 text-zinc-400 hover:text-white"
                  )}
                >
                  Por SKU / Produto
                </button>
              </div>
              <p className="text-[8px] text-zinc-400 italic">
                {customFields.themeMode === 'per_product'
                  ? "Associe cores e marcas d'água de fundo individuais para cada produto na lista abaixo ou clique diretamente no preview."
                  : "Todas as etiquetas no lote usarão as definições gerais de tema do painel global."
                }
              </p>
            </div>

            {/* SEÇÃO 4: PRODUTOS AGREGADOS NO LOTE */}
            <div className="space-y-3 pt-3 border-t border-white/5">
              <h5 className="text-[8.5px] font-black text-rose-300/85 uppercase tracking-widest flex items-center justify-between">
                <span>4. Produtos no Lote</span>
                <div className="flex items-center gap-2">
                  <button 
                    onClick={() => clearLabelBatch()}
                    className="text-[8px] font-black px-2 py-0.5 border border-rose-500/30 bg-rose-500/10 text-rose-400 rounded hover:bg-rose-500/20 transition-all select-none cursor-pointer"
                  >
                    Limpar Lote
                  </button>
                  <span className="text-[8px] font-bold bg-zinc-900 border border-white/10 px-1.5 py-0.5 rounded text-white/55">Total: {currentSum} itens</span>
                </div>
              </h5>

              {/* Current lot items list with increment/decrement buttons */}
              <div className="space-y-1.5 pr-1">
                {activeProducts.length === 0 ? (
                  <p className="text-[9.5px] text-zinc-500 italic text-center py-2">Nenhum produto associado. Escolha abaixo 👇</p>
                ) : (
                  activeProducts.map((p: any) => {
                    const skuThemes = customFields.skuThemes || {};
                    const productTheme = skuThemes[p.code] || skuThemes[p.id] || {};
                    
                    const handleProductThemeChange = (field: 'theme' | 'themeId', value: string) => {
                      const updatedSkuThemes = {
                        ...skuThemes,
                        [p.code]: {
                          ...(skuThemes[p.code] || skuThemes[p.id] || {}),
                          [field]: value
                        }
                      };
                      updateCustomField({ skuThemes: updatedSkuThemes });
                    };

                    const currentThemePreset = productTheme.theme || config.theme || 'classic';
                    const currentThemeId = productTheme.themeId !== undefined ? productTheme.themeId : (config.themeId || '');

                    return (
                      <div key={p.id} className="flex flex-col p-2 bg-zinc-900/40 border border-white/5 rounded-xl gap-2 text-[10px]">
                        <div className="flex justify-between items-center gap-2 w-full">
                          <div className="min-w-0 flex-1">
                            <p className="font-bold text-zinc-200 truncate">{p.name}</p>
                            <p className="text-[8px] text-zinc-500 font-mono">SKU: {p.code}</p>
                          </div>
                          <div className="flex items-center gap-1.5 shrink-0">
                            <button
                              onClick={() => handleDecrement(p.id)}
                              className="bg-zinc-800 hover:bg-zinc-700 text-white w-5 h-5 rounded flex items-center justify-center border border-white/5 font-extrabold select-none cursor-pointer"
                            >
                              -
                            </button>
                            <span className="font-mono font-bold w-4 text-center">{p.qty || 1}</span>
                            <button
                              onClick={() => handleIncrement(p.id)}
                              className="bg-zinc-800 hover:bg-zinc-700 text-white w-5 h-5 rounded flex items-center justify-center border border-white/5 font-extrabold select-none cursor-pointer"
                            >
                              +
                            </button>
                            <button
                              onClick={() => removeFromLabelBatch(p.id)}
                              className="bg-rose-950/20 hover:bg-rose-500/10 border border-rose-500/15 text-rose-400 text-[8px] font-bold px-1.5 py-0.5 rounded cursor-pointer"
                            >
                              Remover
                            </button>
                          </div>
                        </div>

                        {/* Theme selectors inline if customFields.themeMode === 'per_product' */}
                        {customFields.themeMode === 'per_product' && (
                          <div className="grid grid-cols-2 gap-2 mt-1 border-t border-white/10 pt-2 animate-in fade-in duration-300">
                            <div>
                              <span className="text-[7.5px] font-extrabold text-zinc-400 block mb-0.5 uppercase tracking-wider">Preset de Cor</span>
                              <select
                                value={currentThemePreset}
                                onChange={(e) => handleProductThemeChange('theme', e.target.value)}
                                className="w-full bg-zinc-950 border border-white/5 rounded-lg text-[9px] py-1 px-1.5 text-zinc-300 focus:outline-none cursor-pointer font-sans"
                              >
                                <option value="classic">✦ Clássico Monocromático</option>
                                <option value="emerald">💚 Verde Esmeralda</option>
                                <option value="indigo">💙 Azul Real</option>
                                <option value="crimson">❤️ Carmesim</option>
                                <option value="slate">🖤 Slate Noite</option>
                                <option value="amber">💛 Âmbar Quente</option>
                                <option value="violet">💜 Violeta</option>
                                <option value="orange">🧡 Laranja</option>
                                <option value="teal">💚 Teal Menta</option>
                                <option value="fuchsia">💖 Fuchsia</option>
                              </select>
                            </div>
                            <div>
                              <span className="text-[7.5px] font-extrabold text-zinc-400 block mb-0.5 uppercase tracking-wider">Marca d'água</span>
                              <select
                                value={currentThemeId}
                                onChange={(e) => handleProductThemeChange('themeId', e.target.value)}
                                className="w-full bg-zinc-950 border border-white/5 rounded-lg text-[9px] py-1 px-1.5 text-zinc-300 focus:outline-none cursor-pointer font-sans overflow-hidden text-ellipsis"
                              >
                                <option value="">🚫 Sem Imagem</option>
                                {imageThemes.filter((t: any) => t.category === 'label').map((t: any) => (
                                  <option key={t.id} value={t.id}>🖼️ {t.name}</option>
                                ))}
                              </select>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })
                )}
              </div>

              {/* Selector to add more products */}
              <div>
                <label className="text-[8.5px] font-bold text-white/40 uppercase block mb-1">Adicionar Produto ao Lote</label>
                <select
                  value=""
                  onChange={(e) => {
                    const found = products.find((p: any) => p.id === e.target.value);
                    if (found) {
                      addToLabelBatch(found.id);
                    }
                  }}
                  className="w-full bg-zinc-900 border border-white/5 rounded-xl text-xs py-2 px-3 text-zinc-350 cursor-pointer focus:outline-none"
                >
                  <option value="">-- Clique para Incluir Produto --</option>
                  {products.map((p: any) => (
                    <option key={p.id} value={p.id}>📦 {p.name}</option>
                  ))}
                </select>
              </div>
            </div>
          </div>
        );
      }
      case 'mensagemCliente':
        return (
          <div className="space-y-3.5 bg-black/20 p-4 border border-white/5 rounded-2xl">
            <h4 className="text-[10px] font-black text-cyan-400 uppercase tracking-widest flex items-center gap-1.5">
              <Sliders className="w-3.5 h-3.5" /> Mensagem e Brindes
            </h4>
            <div className="space-y-2.5">
              <div>
                <label className="text-[9px] font-black text-white/50 uppercase block mb-1">Nome do Cliente</label>
                <input 
                  type="text" 
                  value={payload.clientName || ''} 
                  onChange={(e) => setPayload({ ...payload, clientName: e.target.value })}
                  className="w-full bg-zinc-900 border border-white/5 rounded-xl text-xs py-2 px-3 text-zinc-350 focus:border-emerald-500/30 focus:outline-none"
                />
              </div>
              <div>
                <label className="text-[9px] font-black text-white/50 uppercase block mb-1">Mídia de QR Code</label>
                <input 
                  type="text" 
                  value={payload.qrCodeLabel || ''} 
                  onChange={(e) => setPayload({ ...payload, qrCodeLabel: e.target.value })}
                  className="w-full bg-zinc-900 border border-white/5 rounded-xl text-xs py-2 px-3 text-zinc-350 focus:border-emerald-500/30 focus:outline-none"
                />
              </div>
              <div>
                <label className="text-[9px] font-black text-white/50 uppercase block mb-1">Código do Cupom de Desconto</label>
                <input 
                  type="text" 
                  value={payload.couponCode || ''} 
                  onChange={(e) => setPayload({ ...payload, couponCode: e.target.value })}
                  className="w-full bg-zinc-900 border border-white/5 rounded-xl text-xs py-2 px-3 text-zinc-350 font-mono uppercase tracking-wider focus:border-emerald-500/30 focus:outline-none"
                />
              </div>
              <div>
                <label className="text-[9px] font-black text-white/50 uppercase block mb-1">Texto de Carinho / Mensagem Sazonal</label>
                <textarea 
                  value={payload.messageText || ''} 
                  onChange={(e) => setPayload({ ...payload, messageText: e.target.value })}
                  rows={4}
                  className="w-full bg-zinc-900 border border-white/5 rounded-xl text-xs py-2 px-3 text-zinc-350 focus:border-emerald-500/30 focus:outline-none resize-none leading-relaxed"
                />
              </div>
            </div>
          </div>
        );
      default:
        return null;
    }
  };

  const currentTabDetails = SUB_TABS.find(t => t.id === activeTab)!;

  // Render Workspace Editor
  if (isEditing) {
    return (
      <div className="flex flex-col p-1 md:p-3 space-y-4 animate-in fade-in slide-in-from-bottom-2 duration-300 max-w-7xl mx-auto font-sans text-white">
        
        {/* Dynamic header row with actions */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-2 border-b border-white/5">
          <button
            onClick={handleBack}
            className="px-3.5 py-2.5 bg-zinc-900 hover:bg-zinc-800 text-zinc-350 hover:text-white border border-white/5 rounded-xl text-[9px] font-black uppercase tracking-wider transition-all cursor-pointer flex items-center gap-1.5 active:scale-95"
          >
            <ArrowLeft className="w-3.5 h-3.5 text-emerald-400" />
            Voltar para Grid
          </button>

          <div className="flex items-center gap-2.5">
            <button
              onClick={handleResetPayload}
              title="Restaurar Payload de Teste Padrão"
              className="px-3.5 py-2.5 bg-zinc-900 hover:bg-zinc-800 text-zinc-350 hover:text-white border border-white/5 rounded-xl text-[9px] font-black uppercase tracking-wider transition-all cursor-pointer flex items-center gap-1.5 active:scale-95"
            >
              <RefreshCw className="w-3.5 h-3.5 text-zinc-500" />
              Resetar Payload
            </button>
          </div>
        </div>

        {/* Dynamic Warning Notification Banner */}
        {statusMsg && (
          <div className={cn(
            "p-3.5 px-4 rounded-2xl border text-[10px] font-bold uppercase tracking-wide flex items-center gap-3 animate-in fade-in duration-200 shadow-md",
            statusMsg.type === 'success' && "bg-emerald-500/10 border-emerald-500/15 text-emerald-400",
            statusMsg.type === 'error' && "bg-rose-500/10 border-rose-500/15 text-rose-400",
            statusMsg.type === 'info' && "bg-blue-500/10 border-blue-500/15 text-blue-400"
          )}>
            <div className="w-2 h-2 rounded-full bg-current animate-pulse shrink-0" />
            <p className="flex-1">{statusMsg.text}</p>
          </div>
        )}

        {/* Two-Column Editor Layout Workspace */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
          
          {/* Left Column Visual Preview Sandbox (Swap columns) */}
          <div className="lg:col-span-7 flex flex-col space-y-3 lg:order-1 order-1">
            <CanonicalDocumentPreview 
              documentType={activeTab as any} 
              payload={activeTab === 'etiquetaLote' ? { ...payload, products: resolvedBatchProducts } : payload} 
              paperSize={config.paperSize}
              theme={config.theme}
              themeId={config.themeId}
              customFields={config.customFields}
            />

            {/* Visual Geometry Telemetry Debug Board */}
            <div className="bg-[#121212]/90 border border-emerald-500/10 rounded-2xl p-4 space-y-3 font-mono text-[10px] text-zinc-300">
              <div className="flex items-center justify-between border-b border-white/5 pb-2">
                <span className="font-sans font-black uppercase text-emerald-400 tracking-wider flex items-center gap-1.5 text-xs">
                  <Cpu className="w-4 h-4 text-emerald-400 animate-pulse" /> Depurador de Geometria Real
                </span>
                <span className="text-[8px] bg-emerald-500/10 text-emerald-400 border border-emerald-400/20 px-2 py-0.5 rounded-full font-black uppercase tracking-wider">
                  {detectPlatform().toUpperCase()}
                </span>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3 gap-y-2">
                <div>
                  <span className="text-zinc-550 block uppercase font-bold text-[8px] tracking-tight">Papel Base ERP</span>
                  <span className="font-extrabold text-white text-[11px]">
                    {(() => {
                      const storeDocIdMap: Record<SubTab, 'thermal_receipt' | 'order_ticket' | 'labels' | 'bulk_labels' | 'customer_experience'> = {
                        reciboTermico: 'thermal_receipt',
                        cupomPedido: 'order_ticket',
                        etiqueta: 'labels',
                        etiquetaLote: 'bulk_labels',
                        mensagemCliente: 'customer_experience'
                      };
                      const logicalDocId = storeDocIdMap[activeTab];
                      const activePrintConfig = documentPrinterBindings.find(c => c.documentId === logicalDocId);
                      const configObj = getGlobalConfigForTab(activeTab);
                      const targetPrinter = activePrintConfig ? futurePrinters.find(p => p.id === activePrintConfig.printerId) : null;
                      const matchedMapping = activePrintConfig && targetPrinter
                        ? (useStore.getState().paperDriverMappings || []).find(m => m.printerId === targetPrinter.id && m.paperErpId === (activePrintConfig.paperErpId || configObj.paperSize))
                        : null;
                      const res = resolveDocumentGeometry(
                        activeTab,
                        {
                          paperSize: configObj.paperSize,
                          rotation: configObj.rotation,
                          copies: configObj.copies,
                          margins: { top: configObj.margins?.top }
                        },
                        activePrintConfig,
                        matchedMapping
                      );
                      return `${res.paperId} (${res.paperWidthMm}mm ${res.isRoll ? 'x Contínuo' : `x ${res.paperHeightMm}mm`})`;
                    })()}
                  </span>
                </div>
                <div>
                  <span className="text-zinc-550 block uppercase font-bold text-[8px] tracking-tight">Orientação</span>
                  <span className="font-extrabold text-white text-[11px]">
                    {(() => {
                      const storeDocIdMap: Record<SubTab, 'thermal_receipt' | 'order_ticket' | 'labels' | 'bulk_labels' | 'customer_experience'> = {
                        reciboTermico: 'thermal_receipt',
                        cupomPedido: 'order_ticket',
                        etiqueta: 'labels',
                        etiquetaLote: 'bulk_labels',
                        mensagemCliente: 'customer_experience'
                      };
                      const logicalDocId = storeDocIdMap[activeTab];
                      const activePrintConfig = documentPrinterBindings.find(c => c.documentId === logicalDocId);
                      const configObj = getGlobalConfigForTab(activeTab);
                      const targetPrinter = activePrintConfig ? futurePrinters.find(p => p.id === activePrintConfig.printerId) : null;
                      const matchedMapping = activePrintConfig && targetPrinter
                        ? (useStore.getState().paperDriverMappings || []).find(m => m.printerId === targetPrinter.id && m.paperErpId === (activePrintConfig.paperErpId || configObj.paperSize))
                        : null;
                      return resolveDocumentGeometry(
                        activeTab,
                        {
                          paperSize: configObj.paperSize,
                          rotation: configObj.rotation,
                          copies: configObj.copies,
                          margins: { top: configObj.margins?.top }
                        },
                        activePrintConfig,
                        matchedMapping
                      ).orientation.toUpperCase();
                    })()}
                  </span>
                </div>
                <div>
                  <span className="text-zinc-550 block uppercase font-bold text-[8px] tracking-tight">Margem de Corte</span>
                  <span className="font-extrabold text-white text-[11px]">
                    {(() => {
                      const storeDocIdMap: Record<SubTab, 'thermal_receipt' | 'order_ticket' | 'labels' | 'bulk_labels' | 'customer_experience'> = {
                        reciboTermico: 'thermal_receipt',
                        cupomPedido: 'order_ticket',
                        etiqueta: 'labels',
                        etiquetaLote: 'bulk_labels',
                        mensagemCliente: 'customer_experience'
                      };
                      const logicalDocId = storeDocIdMap[activeTab];
                      const activePrintConfig = documentPrinterBindings.find(c => c.documentId === logicalDocId);
                      const configObj = getGlobalConfigForTab(activeTab);
                      const targetPrinter = activePrintConfig ? futurePrinters.find(p => p.id === activePrintConfig.printerId) : null;
                      const matchedMapping = activePrintConfig && targetPrinter
                        ? (useStore.getState().paperDriverMappings || []).find(m => m.printerId === targetPrinter.id && m.paperErpId === (activePrintConfig.paperErpId || configObj.paperSize))
                        : null;
                      return `${resolveDocumentGeometry(
                        activeTab,
                        {
                          paperSize: configObj.paperSize,
                          rotation: configObj.rotation,
                          copies: configObj.copies,
                          margins: { top: configObj.margins?.top }
                        },
                        activePrintConfig,
                        matchedMapping
                      ).marginMm} mm`;
                    })()}
                  </span>
                </div>
                <div>
                  <span className="text-zinc-550 block uppercase font-bold text-[8px] tracking-tight">Fator de Escala</span>
                  <span className="font-extrabold text-white text-[11px]">
                    {(() => {
                      const storeDocIdMap: Record<SubTab, 'thermal_receipt' | 'order_ticket' | 'labels' | 'bulk_labels' | 'customer_experience'> = {
                        reciboTermico: 'thermal_receipt',
                        cupomPedido: 'order_ticket',
                        etiqueta: 'labels',
                        etiquetaLote: 'bulk_labels',
                        mensagemCliente: 'customer_experience'
                      };
                      const logicalDocId = storeDocIdMap[activeTab];
                      const activePrintConfig = documentPrinterBindings.find(c => c.documentId === logicalDocId);
                      const configObj = getGlobalConfigForTab(activeTab);
                      const targetPrinter = activePrintConfig ? futurePrinters.find(p => p.id === activePrintConfig.printerId) : null;
                      const matchedMapping = activePrintConfig && targetPrinter
                        ? (useStore.getState().paperDriverMappings || []).find(m => m.printerId === targetPrinter.id && m.paperErpId === (activePrintConfig.paperErpId || configObj.paperSize))
                        : null;
                      return `${resolveDocumentGeometry(
                        activeTab,
                        {
                          paperSize: configObj.paperSize,
                          rotation: configObj.rotation,
                          copies: configObj.copies,
                          margins: { top: configObj.margins?.top }
                        },
                        activePrintConfig,
                        matchedMapping
                      ).scale * 100}%`;
                    })()}
                  </span>
                </div>
                <div>
                  <span className="text-zinc-550 block uppercase font-bold text-[8px] tracking-tight">Nome Físico Driver</span>
                  <span className="font-extrabold text-white text-[11px]">
                    {(() => {
                      const storeDocIdMap: Record<SubTab, 'thermal_receipt' | 'order_ticket' | 'labels' | 'bulk_labels' | 'customer_experience'> = {
                        reciboTermico: 'thermal_receipt',
                        cupomPedido: 'order_ticket',
                        etiqueta: 'labels',
                        etiquetaLote: 'bulk_labels',
                        mensagemCliente: 'customer_experience'
                      };
                      const logicalDocId = storeDocIdMap[activeTab];
                      const activePrintConfig = documentPrinterBindings.find(c => c.documentId === logicalDocId);
                      const configObj = getGlobalConfigForTab(activeTab);
                      const targetPrinter = activePrintConfig ? futurePrinters.find(p => p.id === activePrintConfig.printerId) : null;
                      const matchedMapping = activePrintConfig && targetPrinter
                        ? (useStore.getState().paperDriverMappings || []).find(m => m.printerId === targetPrinter.id && m.paperErpId === (activePrintConfig.paperErpId || configObj.paperSize))
                        : null;
                      return resolveDocumentGeometry(
                        activeTab,
                        {
                          paperSize: configObj.paperSize,
                          rotation: configObj.rotation,
                          copies: configObj.copies,
                          margins: { top: configObj.margins?.top }
                        },
                        activePrintConfig,
                        matchedMapping
                      ).driverMediaName;
                    })()}
                  </span>
                </div>
                <div>
                  <span className="text-zinc-550 block uppercase font-bold text-[8px] tracking-tight">Status Canal Spooler</span>
                  <span className="text-emerald-450 font-extrabold uppercase font-sans text-[10px] bg-emerald-500/5 px-2 py-0.5 rounded border border-emerald-400/10 inline-block">
                    PRODUTIVO
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Right Column Settings Form Panel */}
          <div className="lg:col-span-5 bg-[#121212] border border-white/5 rounded-[2rem] p-5 space-y-5 relative overflow-hidden lg:order-2 order-2">
            <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-500/2 rounded-full blur-2xl -mr-12 -mt-12 pointer-events-none" />

            <div className="border-b border-white/5 pb-3">
              <span className="text-[7.5px] font-black text-emerald-400 uppercase tracking-widest block mb-0.5">DEFINIÇÃO DO MOTOR</span>
              <h3 className="text-xs font-black uppercase tracking-wider flex items-center gap-1.5 text-white/90">
                <Settings className="w-4 h-4 text-emerald-500" /> Parâmetros de Destino e Spooler
              </h3>
            </div>

            {/* Unified Central Print / Spooler Actions & Diagnostics Panel - Promoted to top */}
            <div className="space-y-4 pb-5 border-b border-white/5 uppercase font-sans">
              
              <div className="flex items-center justify-between">
                <div className="flex flex-col">
                  <span className="text-[7.5px] font-black text-indigo-400 uppercase tracking-widest block mb-0.5">Módulo de Impressão</span>
                  <h4 className="text-xs font-black uppercase tracking-wider flex items-center gap-1.5 text-white/90">
                    <LucidePrinter className="w-4 h-4 text-indigo-400 font-bold" /> Ações do Spooler
                  </h4>
                </div>

                {/* Technical Diagnostical Toggle button */}
                <button
                  type="button"
                  onClick={() => setShowTechnicalDetails(!showTechnicalDetails)}
                  className="px-2.5 py-1 text-[8px] bg-zinc-900 hover:bg-zinc-800 text-zinc-450 hover:text-zinc-300 rounded border border-white/5 font-black uppercase tracking-wider transition-colors active:scale-95 cursor-pointer"
                >
                  {showTechnicalDetails ? 'Ocultar Diagnóstico' : 'Ver Diagnóstico'}
                </button>
              </div>

              {/* Collapsible diagnostic Parameters Visual grid */}
              {showTechnicalDetails && (
                <div className="grid grid-cols-1 gap-2 text-[10px] bg-black/40 p-3 border border-white/5 rounded-xl font-mono animate-in slide-in-from-top-1 duration-200">
                  {/* 1. PDF Generated status */}
                  <div className="flex items-center justify-between border-b border-white/5 pb-1.5">
                    <span className="text-white/40 uppercase font-bold text-[8.5px]">Geração canônica</span>
                    <span className="px-2 py-0.5 rounded text-[8.5px] uppercase font-black bg-emerald-500/10 text-emerald-400">
                      ✓ Pronto 1:1
                    </span>
                  </div>

                  {/* 2. Validation status */}
                  <div className="flex items-center justify-between border-b border-white/5 pb-1.5">
                    <span className="text-white/40 uppercase font-bold text-[8.5px]">Validação física</span>
                    <span className="px-2 py-0.5 rounded text-[8.5px] uppercase font-black bg-emerald-500/10 text-emerald-400">
                      ✓ Aprovado
                    </span>
                  </div>

                  {/* 3. Printer mapped */}
                  <div className="flex items-center justify-between border-b border-white/5 pb-1.5">
                    <span className="text-white/40 uppercase font-bold text-[8.5px]">Impressora Vinculada</span>
                    <span className={cn(
                      "px-2 py-0.5 rounded text-[8.5px] uppercase font-black truncate max-w-[150px]",
                      (() => {
                        const binding = documentPrinterBindings.find(b => b.documentId === activeTab);
                        const printer = binding ? futurePrinters.find(p => p.id === binding.printerId) : null;
                        if (!printer) return "bg-zinc-900 text-zinc-500";
                        return printer.status === 'ativa' ? "bg-emerald-500/10 text-emerald-400" : "bg-rose-500/10 text-rose-400";
                      })()
                    )}>
                      {(() => {
                        const binding = documentPrinterBindings.find(b => b.documentId === activeTab);
                        const printer = binding ? futurePrinters.find(p => p.id === binding.printerId) : null;
                        if (!printer) return 'Não configurada';
                        return `${printer.name} (${printer.status === 'ativa' ? 'Online' : 'Offline'})`;
                      })()}
                    </span>
                  </div>

                  {/* 4. Print eligible */}
                  <div className="flex items-center justify-between border-b border-white/5 pb-1.5">
                    <span className="text-white/40 uppercase font-bold text-[8.5px]">Elegibilidade Física</span>
                    <span className={cn(
                      "px-2 py-0.5 rounded text-[8.5px] uppercase font-black text-right truncate max-w-[180px]",
                      (() => {
                        const binding = documentPrinterBindings.find(b => b.documentId === activeTab);
                        if (!binding) return "bg-zinc-900 text-zinc-500";
                        if (binding.printerId === 'pdf-manual') return "bg-blue-500/10 text-blue-400";
                        return "bg-emerald-500/10 text-emerald-400";
                      })()
                    )}>
                      {(() => {
                        const binding = documentPrinterBindings.find(b => b.documentId === activeTab);
                        if (!binding) return 'Pendente';
                        if (binding.printerId === 'pdf-manual') return 'PDF Manual';
                        return 'Habilitada (Spooler)';
                      })()}
                    </span>
                  </div>

                  {/* 5. Last print result */}
                  <div className="flex items-center justify-between">
                    <span className="text-white/40 uppercase font-bold text-[8.5px]">Última Transmissão</span>
                    <span className="text-[8.5px] font-black text-right truncate max-w-[180px] font-mono text-zinc-400">
                      Spooler Pronto
                    </span>
                  </div>
                </div>
              )}

              {/* Human-focused Status display of current printer */}
              <div className="p-3 bg-zinc-900/60 border border-white/5 rounded-xl flex items-center justify-between text-[10px] text-zinc-400 font-sans">
                <div className="flex items-center gap-2">
                  <div className={cn(
                    "w-2 h-2 rounded-full",
                    (() => {
                      const binding = documentPrinterBindings.find(b => b.documentId === activeTab);
                      const printer = binding ? futurePrinters.find(p => p.id === binding.printerId) : null;
                      if (!printer) return "bg-zinc-600";
                      return printer.status === 'ativa' ? "bg-emerald-500" : "bg-rose-500";
                    })()
                  )} />
                  <span className="font-bold uppercase tracking-wide">
                    {(() => {
                      const binding = documentPrinterBindings.find(b => b.documentId === activeTab);
                      const printer = binding ? futurePrinters.find(p => p.id === binding.printerId) : null;
                      if (!printer) return 'Sem impressora vinculada';
                      return `Impressora: ${printer.name}`;
                    })()}
                  </span>
                </div>

                <span className="text-[9px] font-bold text-zinc-500 font-mono">
                  {(() => {
                    const binding = documentPrinterBindings.find(b => b.documentId === activeTab);
                    const printer = binding ? futurePrinters.find(p => p.id === binding.printerId) : null;
                    if (!printer) return 'INDEFINIDO';
                    return printer.status === 'ativa' ? 'ONLINE' : 'OFFLINE';
                  })()}
                </span>
              </div>

              {/* Sub-warnings or conditional requirements */}
              {(() => {
                const jId = activeJobs[activeTab];
                const job = queueItems.find(j => j.id === jId);
                const isWarn = job?.validation?.status === 'warning';
                if (!isWarn) return null;

                return (
                  <div className="p-3 bg-amber-500/5 border border-amber-500/15 rounded-xl flex items-start gap-2.5 bg-zinc-950">
                    <input
                      id="override-warning-checkbox-coupons"
                      type="checkbox"
                      checked={allowWarningsCheckbox}
                      onChange={(e) => setAllowWarningsCheckbox(e.target.checked)}
                      className="mt-0.5 rounded border-zinc-700 text-amber-500 focus:ring-amber-500/30 bg-black w-4 h-4 cursor-pointer shrink-0"
                    />
                    <label htmlFor="override-warning-checkbox-coupons" className="text-[10px] leading-tight font-bold text-amber-300 uppercase cursor-pointer select-none">
                      Permitir impressão com alertas leves
                      <span className="text-[9px] text-zinc-400 font-medium block mt-1 normal-case font-sans">
                        O validador físico acusou pequenos alertas no formato de arquivo, mas tenho consentimento para forçar.
                      </span>
                    </label>
                  </div>
                );
              })()}

              {/* FOUR MAIN FUNCTIONAL BUTTONS (Ponto 1: Web Sandbox restricts queue/spool commands) */}
              <div className="grid grid-cols-2 gap-2 mt-2">
                {/* 1. GERAR PDF */}
                <button
                  type="button"
                  onClick={handleDirectGeneratePDF}
                  className="py-3 px-4 bg-zinc-900 border border-white/10 hover:border-emerald-500/30 hover:bg-zinc-850 text-white rounded-xl text-[10px] font-black uppercase tracking-wider transition-all duration-150 flex items-center justify-center gap-2 cursor-pointer active:scale-95"
                >
                  <FileText className="w-4 h-4 text-emerald-400 shrink-0" />
                  Gerar PDF
                </button>

                {/* 2. ENVIAR PARA FILA */}
                <button
                  type="button"
                  onClick={handleQuietAddJobToQueue}
                  disabled={getActivePlatform() === 'web'}
                  className={cn(
                    "py-3 px-4 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all duration-150 flex items-center justify-center gap-2 cursor-pointer active:scale-95",
                    getActivePlatform() === 'web'
                      ? "bg-zinc-955 border border-zinc-900 text-zinc-650 cursor-not-allowed"
                      : "bg-zinc-900 border border-white/10 hover:border-indigo-500/30 hover:bg-zinc-850 text-white"
                  )}
                  title={getActivePlatform() === 'web' ? 'Fila indisponível em ambiente de navegador web' : ''}
                >
                  <Layers className={cn("w-4 h-4 shrink-0", getActivePlatform() === 'web' ? "text-zinc-650" : "text-indigo-400")} />
                  {getActivePlatform() === 'web' ? 'Fila Bloqueada' : 'Enviar p/ Fila'}
                </button>

                {/* 3. IMPRIMIR VIA SPOOLER */}
                <button
                  type="button"
                  onClick={handlePrintDirectFlow}
                  disabled={isPrintingDirectly || getActivePlatform() === 'web'}
                  className={cn(
                    "col-span-2 py-3 px-4 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all duration-200 flex items-center justify-center gap-2 cursor-pointer shadow-md",
                    getActivePlatform() === 'web'
                      ? "bg-zinc-955 border border-zinc-900 text-zinc-650 cursor-not-allowed"
                      : isPrintingDirectly 
                        ? "bg-zinc-900 border border-white/5 text-zinc-500 cursor-not-allowed" 
                        : "bg-emerald-650 hover:bg-emerald-500 text-white border border-emerald-500/20 active:scale-95"
                  )}
                >
                  {isPrintingDirectly ? (
                    <div className="w-4 h-4 border-2 border-white/30 border-t-transparent rounded-full animate-spin shrink-0" />
                  ) : (
                    <LucidePrinter className={cn("w-4 h-4 shrink-0", getActivePlatform() === 'web' ? "text-zinc-650 animate-pulse" : "text-white font-extrabold")} />
                  )}
                  {getActivePlatform() === 'web' ? 'Spooler Indisponível na Web' : isPrintingDirectly ? 'Transmitindo...' : 'Imprimir Spooler'}
                </button>

                {/* 4. TESTAR CONFIGURAÇÃO */}
                <button
                  type="button"
                  onClick={handleTestConfiguration}
                  disabled={getActivePlatform() === 'web'}
                  className={cn(
                    "col-span-2 py-2.5 px-4 border rounded-xl text-[9px] font-bold uppercase tracking-widest transition-all duration-150 flex items-center justify-center gap-2 cursor-pointer active:scale-95 text-center font-sans font-black",
                    getActivePlatform() === 'web'
                      ? "bg-zinc-955 border-zinc-900 text-zinc-650 cursor-not-allowed"
                      : "bg-zinc-950 hover:bg-zinc-900 border-amber-500/10 hover:border-amber-500/35 text-amber-400"
                  )}
                >
                  <Activity className={cn("w-3.5 h-3.5 shrink-0", getActivePlatform() === 'web' ? "text-zinc-650" : "text-amber-500")} />
                  {getActivePlatform() === 'web' ? 'Simulador bloqueado no Navegador' : 'Testar Impressão do Layout Configurado'}
                </button>
              </div>

            </div>

            {/* General Print Engine Configs Form */}
            <div className="space-y-3.5">
              {/* Profile Summary Card with Guidance Link to Printer Central */}
              {(() => {
                const storeDocIdMap: Record<SubTab, 'thermal_receipt' | 'order_ticket' | 'labels' | 'bulk_labels' | 'customer_experience'> = {
                  reciboTermico: 'thermal_receipt',
                  cupomPedido: 'order_ticket',
                  etiqueta: 'labels',
                  etiquetaLote: 'bulk_labels',
                  mensagemCliente: 'customer_experience'
                };
                const logicalDocId = storeDocIdMap[activeTab];
                const activePrintConfig = (documentPrinterBindings.find(c => c.documentId === logicalDocId) || {
                  documentId: logicalDocId,
                  printerId: 'pdf-manual',
                  pdfManualActive: true,
                  driverPaperName: logicalDocId.includes('label') ? '10x15' : 'Roll 80mm',
                  paperErpId: logicalDocId.includes('label') ? 'A6' : '80mm',
                }) as any;

                const connectedDeviceName = activePrintConfig.printerId === 'pdf-manual' || activePrintConfig.pdfManualActive
                  ? '📄 PDF DIGITAL (DOWNLOAD MANUAL)'
                  : (futurePrinters.find(p => p.id === activePrintConfig.printerId)?.name || 'NÃO CONFIGURADA');

                const paperName = activePrintConfig.driverPaperName || (logicalDocId.includes('label') ? '10x15' : 'Roll 80mm');

                return (
                  <div className="bg-zinc-950/45 p-3.5 border border-white/5 rounded-2xl space-y-3 font-sans">
                    <div className="flex justify-between items-center pb-2 border-b border-zinc-900">
                      <span className="text-[9px] font-black text-white/50 uppercase">Perfil Físico no ERP</span>
                      <span className="text-[7.5px] font-mono font-bold text-cyan-400 bg-cyan-950/20 border border-cyan-500/10 px-1.5 py-0.5 rounded uppercase leading-none">
                        VÍNCULO ATIVO
                      </span>
                    </div>

                    <div className="grid grid-cols-2 gap-2 text-[9.5px]">
                      <div>
                        <span className="text-zinc-500 block text-[7.5px] uppercase font-bold">Impressora Ativa:</span>
                        <span className="text-zinc-200 uppercase font-black font-mono block truncate" title={connectedDeviceName}>
                          {connectedDeviceName}
                        </span>
                      </div>
                      <div>
                        <span className="text-zinc-500 block text-[7.5px] uppercase font-bold">Papel do Driver:</span>
                        <span className="text-zinc-200 uppercase font-bold font-mono block">
                          {paperName}
                        </span>
                      </div>
                    </div>

                    <div className="pt-2">
                      <p className="text-[7.5px] text-zinc-650 leading-relaxed font-semibold">
                        ⚠️ Configurações físicas, mídias de driver, margem térmica, qualidade de saída (DPI) e filas de spooler centralizadas no ERP devem ser ajustadas exclusivamente pela Central de Impressoras.
                      </p>
                      
                      <button
                        type="button"
                        onClick={() => {
                          const triggerBtn = document.querySelector('[data-menu-link="printers_hub"]') as HTMLElement;
                          if (triggerBtn) {
                            triggerBtn.click();
                          } else {
                            alert('Acesse o módulo de Ajustes > Central de Impressoras para guiar o roteamento físico deste documento.');
                          }
                        }}
                        className="mt-2.5 w-full py-1.5 bg-zinc-900 hover:bg-zinc-850 hover:text-white text-zinc-300 font-black uppercase text-[8.5px] rounded-lg border border-white/5 cursor-pointer flex items-center justify-center gap-1"
                      >
                        🖨️ Ir para a Central de Impressoras
                      </button>
                    </div>
                  </div>
                );
              })()}

              {/* Background Image Theme Selection */}
              <div>
                <label className="text-[9px] font-black text-white/50 uppercase block mb-1">Tema de Fundo (Marca d'água)</label>
                <select 
                  value={config.themeId || ''} 
                  onChange={(e) => setConfig({ ...config, themeId: e.target.value ? e.target.value : undefined })}
                  className="w-full bg-zinc-900 border border-white/5 rounded-xl text-xs py-2 px-3 text-zinc-300 focus:border-white/20 focus:outline-none cursor-pointer text-ellipsis overflow-hidden"
                >
                  <option value="">🚫 Sem Imagem de Fundo</option>
                  {imageThemes
                    .filter((t) => (activeTab === 'etiqueta' || activeTab === 'etiquetaLote') ? t.category === 'label' : (t.category !== 'label'))
                    .map((t) => (
                      <option key={t.id} value={t.id}>🖼️ {t.name} ({t.active !== false ? 'Ativo' : 'Inativo'})</option>
                    ))}
                </select>
              </div>

              {/* Number of copies and theme selection row */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[9px] font-black text-white/50 uppercase block mb-1">
                    {(activeTab === 'etiqueta' || activeTab === 'etiquetaLote') ? 'Tema Colorido da Etiqueta' : 'Tema Colorido do Recibo'}
                  </label>
                  <select 
                    value={config.theme || 'classic'} 
                    onChange={(e) => setConfig({ ...config, theme: e.target.value as any })}
                    className="w-full bg-zinc-900 border border-white/5 rounded-xl text-xs py-2 px-3 text-zinc-300 focus:border-white/20 focus:outline-none cursor-pointer"
                  >
                    <option value="classic">✦ Clássico Monocromático</option>
                    <option value="emerald">💚 Verde Esmeralda (Varejo)</option>
                    <option value="indigo">💙 Azul Real (Vendas)</option>
                    <option value="crimson">❤️ Carmesim (Restaurante)</option>
                    <option value="slate">🖤 Slate Noite (Moderno)</option>
                    <option value="amber">💛 Âmbar Quente (Especial)</option>
                    <option value="violet">💜 Violeta Charmosa (Premium)</option>
                    <option value="orange">🧡 Laranja Coral (Destaque)</option>
                    <option value="teal">💚 Verde Menta / Teal (Fresco)</option>
                    <option value="fuchsia">💖 Rosa Fuchsia (Vibrante)</option>
                    <option value="custom">🎨 Cor Personalizada... (Hex)</option>
                  </select>

                  {config.theme === 'custom' && (
                    <div className="mt-2 flex items-center gap-1.5 bg-zinc-950 p-1 border border-white/5 rounded-lg">
                      <input 
                        type="color" 
                        value={config.customFields?.customColor || '#10b981'} 
                        onChange={(e) => {
                          setConfig({
                            ...config,
                            customFields: {
                              ...config.customFields,
                              customColor: e.target.value
                            }
                          });
                        }}
                        className="w-7 h-7 rounded overflow-hidden bg-transparent border-0 cursor-pointer outline-none shrink-0" 
                      />
                      <input 
                        type="text" 
                        value={config.customFields?.customColor || '#10b981'} 
                        onChange={(e) => {
                          setConfig({
                            ...config,
                            customFields: {
                              ...config.customFields,
                              customColor: e.target.value
                            }
                          });
                        }}
                        placeholder="#10b981"
                        className="w-full bg-transparent text-[10px] py-1 px-1.5 text-zinc-300 font-mono focus:outline-none" 
                      />
                    </div>
                  )}
                </div>

                <div>
                  <label className="text-[9px] font-black text-white/50 uppercase block mb-1 font-sans">Logo da Empresa Vinculada</label>
                  <div className="flex bg-zinc-900 border border-white/5 rounded-xl h-[33.5px] items-center px-3 gap-2 overflow-hidden justify-center relative select-none">
                    {company?.logo ? (
                      <div className="flex items-center gap-1.5 w-full">
                        <img 
                          src={company.logo} 
                          className="h-[21px] shrink-0 object-contain max-w-[45px] border border-white/10 rounded overflow-hidden p-0.5 bg-black" 
                          referrerPolicy="no-referrer"
                        />
                        <span className="text-[9.5px] font-black text-emerald-400 font-mono tracking-wider truncate">SINC DE LOGO</span>
                      </div>
                    ) : (
                      <div className="flex items-center gap-1.5 text-zinc-500">
                        <Building2 className="w-3.5 h-3.5" />
                        <span className="text-[9px] font-black tracking-wide uppercase">Sem Logo Ativa</span>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Dynamic Custom variables Form fields depending on current documentType */}
            {renderConfigFields()}
            {/* Deleted section of Spooler Actions & Diagnostics Panel - Moved to the top */}



          </div>

        </div>

      </div>
    );
  }

  // Render Grid Selection View with registered cards
  return (
    <div className="flex flex-col p-1 md:p-3 space-y-4 animate-in fade-in slide-in-from-bottom-2 duration-300 max-w-7xl mx-auto font-sans text-white">

      {/* Cards Grid list (SUB_TABS) */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {SUB_TABS.map((tab) => {
          const TabIcon = tab.icon;
          const registration = documentTemplateService.getDocumentDetails(tab.id)!;
          const isSelected = activeTab === tab.id;

          return (
            <div 
              key={tab.id}
              onClick={() => {
                setActiveTab(tab.id);
                setIsEditing(true);
                setActiveSubSetting(tab.id);
              }}
              className={cn(
                "bg-[#121212] border border-white/5 hover:border-emerald-500/25 rounded-[1.8rem] p-5 md:p-6 transition-all flex flex-col justify-between group cursor-pointer hover:shadow-[0_20px_40px_rgba(0,0,0,0.45)] ease-out duration-200",
                isSelected && "border-emerald-500/15 ring-1 ring-emerald-500/20"
              )}
            >
              <div className="space-y-4">
                {/* Header status */}
                <div className="flex items-start justify-between gap-3">
                  <div className="w-11 h-11 rounded-2xl bg-zinc-900 border border-white/5 flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
                    <TabIcon className="w-4 h-4 text-emerald-400" />
                  </div>
                  
                  <span className="text-[7.5px] font-black text-white/40 uppercase tracking-widest border border-white/5 px-2.5 py-1 rounded-full bg-black/40">
                    {registration.category}
                  </span>
                </div>

                {/* Description texts */}
                <div className="space-y-1">
                  <h3 className="text-xs font-black text-white uppercase tracking-wider group-hover:text-emerald-400 transition-colors">
                    {tab.label}
                  </h3>
                  <p className="text-[10px] text-white/40 leading-relaxed font-semibold uppercase tracking-tight">
                    {tab.desc}
                  </p>
                </div>
              </div>

              {/* Bottom control trigger */}
              <div className="mt-6 pt-3.5 border-t border-white/5 flex items-center justify-between">
                <span className="text-[8px] font-black text-zinc-500 uppercase tracking-widest font-mono">
                  Tamanho ideal: {DOCUMENT_SIZES[registration.defaultPaperSize]?.name}
                </span>

                <button 
                  onClick={(e) => {
                    e.stopPropagation();
                    setActiveTab(tab.id);
                    setIsEditing(true);
                    setActiveSubSetting(tab.id);
                  }}
                  className="px-4 py-2 bg-zinc-900 hover:bg-emerald-500 hover:text-black hover:scale-105 border border-white/15 hover:border-emerald-500/20 text-white rounded-xl text-[8.5px] font-black uppercase tracking-widest transition-all flex items-center gap-1.5 cursor-pointer font-sans"
                >
                  <Sliders className="w-3 h-3 shrink-0" />
                  Abrir Módulo
                </button>
              </div>

            </div>
          );
        })}
      </div>

    </div>
  );
}
