import { buildReciboHtml } from '../printEngine/templates/recibo';
import { buildCupomPedidoHtml } from '../printEngine/templates/cupomPedido';
import { buildEtiquetaHtml } from '../printEngine/templates/etiqueta';
import { buildEtiquetaLoteHtml } from '../printEngine/templates/etiquetaLote';
import { buildMensagemClienteHtml } from '../printEngine/templates/mensagemCliente';
import { buildCrachaHtml } from '../printEngine/templates/cracha';

export interface HTMLBuilderRequest {
  documentId: string;
  payload: any;
  paperSize: string;
  theme?: string;
  themeId?: string;
  customFields?: any;
  company?: any;
  watermarkTheme?: any;
  imageThemes?: any[];
  isExportPdf?: boolean;
  orientation?: 'portrait' | 'landscape';
}

export async function buildCanonicalHtml(req: HTMLBuilderRequest): Promise<string> {
  const config: any = {
    paperSize: req.paperSize,
    isExportPdf: req.isExportPdf,
    orientation: req.orientation,
    rotation: 0 as 0 | 90 | 180 | 270,
    copies: 1,
    margins: { top: 0, bottom: 0, left: 0, right: 0 },
    theme: req.theme || 'classic',
    themeId: req.themeId || req.customFields?.themeId,
    customFields: req.customFields || {}
  };

  const company = req.company || {};
  const watermarkTheme = req.watermarkTheme || null;

  switch (req.documentId) {
    case 'reciboTermico':
      return await buildReciboHtml(req.payload, config, company, watermarkTheme);
    case 'cupomPedido':
      return await buildCupomPedidoHtml(req.payload, config, company, watermarkTheme);
    case 'etiqueta':
      return await buildEtiquetaHtml(req.payload, config, req.imageThemes || []);
    case 'etiquetaLote':
      return await buildEtiquetaLoteHtml(req.payload, config, req.imageThemes || []);
    case 'mensagemCliente':
      return await buildMensagemClienteHtml(req.payload, config, req.imageThemes || []);
    case 'cracha':
      return await buildCrachaHtml(req.payload, config, company);
    default:
      return `<html><body><h1>Template não encontrado: ${req.documentId}</h1></body></html>`;
  }
}
