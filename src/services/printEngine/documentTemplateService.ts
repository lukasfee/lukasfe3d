import { 
  DocumentType,
  PrintEngineConfig,
  MOCK_PAYLOADS,
  DocumentPayloadMap 
} from './documentTypes';
import { DOCUMENT_SIZES, DocumentSize } from './documentSizes';

export interface DocumentRegistration {
  id: DocumentType;
  title: string;
  description: string;
  defaultPaperSize: string;
  defaultRotation: 0 | 90 | 180 | 270;
  category: 'logistics' | 'sales' | 'wms' | 'customer';
}

const REGISTERED_DOCUMENTS: Record<DocumentType, DocumentRegistration> = {
  reciboTermico: {
    id: 'reciboTermico',
    title: 'Recibo Térmico',
    description: 'Comprovante fiscal/técnico ou via de venda para caixa físico',
    defaultPaperSize: 'A6',
    defaultRotation: 0,
    category: 'sales'
  },
  cupomPedido: {
    id: 'cupomPedido',
    title: 'Cupom de Pedido',
    description: 'Ticket de separação interna, expedição física ou triagem rápida',
    defaultPaperSize: '80mm',
    defaultRotation: 0,
    category: 'logistics'
  },
  etiqueta: {
    id: 'etiqueta',
    title: 'Etiqueta Individual',
    description: 'Identificação individual autocolante de volumes ou paletes',
    defaultPaperSize: '40x30',
    defaultRotation: 0,
    category: 'wms'
  },
  etiquetaLote: {
    id: 'etiquetaLote',
    title: 'Etiqueta em Lote',
    description: 'Emissão agregada sequencial de etiquetas em volumes de alto fluxo',
    defaultPaperSize: '40x30',
    defaultRotation: 0,
    category: 'wms'
  },
  mensagemCliente: {
    id: 'mensagemCliente',
    title: 'Mensagem do Cliente',
    description: 'Encartes personalizados, bilhetes de aniversário, encartes de NPS',
    defaultPaperSize: 'A5',
    defaultRotation: 0,
    category: 'customer'
  }
};

class DocumentTemplateService {
  /**
   * Return list of all registered documents
   */
  public listRegisteredDocuments(): DocumentRegistration[] {
    return Object.values(REGISTERED_DOCUMENTS);
  }

  /**
   * Fetch registration details of a single document
   */
  public getDocumentDetails(id: DocumentType): DocumentRegistration | null {
    return REGISTERED_DOCUMENTS[id] || null;
  }

  /**
   * Generates a perfect default configurations map for any print operation.
   */
  public getDefinitiveDefaultConfig(id: DocumentType): PrintEngineConfig {
    const doc = this.getDocumentDetails(id);
    const defaultPaper = doc ? doc.defaultPaperSize : '80mm';

    return {
      paperSize: defaultPaper,
      rotation: doc ? doc.defaultRotation : 0,
      copies: 1,
      margins: { top: 0, bottom: 0, left: 0, right: 0 }
    };
  }

  /**
   * Provides standardized data payload mock schemas.
   */
  public getStandardPayload<K extends DocumentType>(id: K): DocumentPayloadMap[K] {
    return MOCK_PAYLOADS[id];
  }

  /**
   * Validates if a custom payload meets simple semantic fields safely.
   */
  public validatePayload<K extends DocumentType>(id: K, payload: any): { valid: boolean; errors: string[] } {
    const errors: string[] = [];
    if (!payload || typeof payload !== 'object') {
      return { valid: false, errors: ['O payload do documento precisa ser um objeto válido.'] };
    }

    // Basic required field validations
    if (id === 'reciboTermico' || id === 'cupomPedido') {
      if (!payload.orderNumber) errors.push('Atributo "orderNumber" do pedido é obrigatório.');
      if (!payload.items || !Array.isArray(payload.items) || payload.items.length === 0) {
        errors.push('A lista de "items" precisa ser informada com pelo menos um item.');
      }
    } else if (id === 'etiqueta') {
      if (!payload.name) errors.push('O nome do produto "name" da etiqueta é obrigatório.');
      if (!payload.code) errors.push('O código de produto "code" (SKU) é obrigatório.');
    } else if (id === 'etiquetaLote') {
      if (!payload.batchId) errors.push('O identificador de lote "batchId" é obrigatório.');
      if (!payload.products || !Array.isArray(payload.products) || payload.products.length === 0) {
        errors.push('O lote de etiquetas precisa conter a lista "products" preenchida.');
      }
    } else if (id === 'mensagemCliente') {
      if (!payload.clientName) errors.push('O nome do cliente "clientName" é obrigatório.');
      if (!payload.messageText) errors.push('O conteúdo textual "messageText" está em branco.');
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }
}

export const documentTemplateService = new DocumentTemplateService();
