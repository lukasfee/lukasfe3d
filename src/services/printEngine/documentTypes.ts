/**
 * Lukasfe ERP - Print Engine Document Types
 * Standard types, options, payloads, and mock data for the 5 standardized documents.
 */

export type DocumentType = 'reciboTermico' | 'cupomPedido' | 'etiqueta' | 'etiquetaLote' | 'mensagemCliente';

export interface PrintEngineConfig {
  printerName?: string;
  paperSize: string;
  rotation: 0 | 90 | 180 | 270;
  copies: number;
  margins: {
    top: number;
    bottom: number;
    left: number;
    right: number;
  };
  customFields?: Record<string, any>;
  theme?: 'classic' | 'emerald' | 'indigo' | 'crimson' | 'slate' | 'amber';
  themeId?: string;
}

// 1. Recibo Térmico Payload
export interface ReciboTermicoPayload {
  orderId: string;
  orderNumber: string;
  date: string;
  operator: string;
  client: {
    name: string;
    document?: string;
    phone?: string;
    email?: string;
  };
  items: Array<{
    code: string;
    description: string;
    qty: number;
    price: number;
    total: number;
  }>;
  financial: {
    subtotal: number;
    discount: number;
    deliveryFee: number;
    surcharge?: number;
    total: number;
    paymentMethod: string;
    receivedAmount: number;
    changeAmount: number;
  };
  notes?: string;
  headerLogoUrl?: string;
  companyName?: string;
  companyCnpj?: string;
  companyAddress?: string;
  companyPhone?: string;
}

// 2. Cupom de Pedido Payload
export interface CupomPedidoPayload {
  orderId: string;
  orderNumber: string;
  date: string;
  sellerName: string;
  pickerName?: string;
  deliveryMethod: string;
  client: {
    name: string;
    phone?: string;
    document?: string;
    address?: {
      street: string;
      number: string;
      neighborhood: string;
      city: string;
      state: string;
      zipCode: string;
      ref?: string;
    };
  };
  items: Array<{
    code: string;
    description: string;
    qty: number;
    location?: string; // Picking warehouse location
    unit: string;
  }>;
  observations?: string;
  companyName?: string;
  companyCnpj?: string;
  companyAddress?: string;
  companyPhone?: string;
  headerLogoUrl?: string;
}

// 3. Etiqueta Payload
export interface EtiquetaPayload {
  name: string;
  code: string;
  brand: string;
  category: string;
  price: number;
  stock: number;
  variation?: string;
}

// 4. Etiqueta Lote Payload
export interface EtiquetaLotePayload {
  batchId: string;
  createdAt: string;
  products: (EtiquetaPayload & { qty: number })[];
  divisorLabel?: boolean;
}

// 5. Mensagem Cliente Payload
export interface MensagemClientePayload {
  orderNumber: string;
  clientName: string;
  messageText: string;
  qrCodeUrl?: string;
  qrCodeLabel?: string;
  couponCode?: string;
}

export type DocumentPayloadMap = {
  reciboTermico: ReciboTermicoPayload;
  cupomPedido: CupomPedidoPayload;
  etiqueta: EtiquetaPayload;
  etiquetaLote: EtiquetaLotePayload;
  mensagemCliente: MensagemClientePayload;
};

/**
 * Standard templates registered with mock/preview payloads
 */
export const MOCK_PAYLOADS: { [K in DocumentType]: DocumentPayloadMap[K] } = {
  reciboTermico: {
    orderId: "ord_1001",
    orderNumber: "001001-A",
    date: "29/05/2026 17:25:00",
    operator: "Administrador ADM",
    client: {
      name: "Lucas de Souza",
      document: "123.456.789-00",
      phone: "(11) 98888-7777",
      email: "lucasdance2012@gmail.com"
    },
    items: [
      { code: "PRD-001", description: "Camiseta Classic Black M", qty: 2, price: 89.90, total: 179.80 },
      { code: "PRD-012", description: "Calça Jeans Slim Fit 42", qty: 1, price: 159.90, total: 159.90 },
      { code: "PRD-099", description: "Meia Cano Alto Esportiva", qty: 3, price: 15.00, total: 45.00 }
    ],
    financial: {
      subtotal: 384.70,
      discount: 38.47,
      deliveryFee: 15.00,
      surcharge: 0.00,
      total: 361.23,
      paymentMethod: "Cartão de Crédito - Visa",
      receivedAmount: 361.23,
      changeAmount: 0.00
    },
    notes: "Obrigado por comprar conosco! Trocas em até 30 dias mediante comprovante físico."
  },
  cupomPedido: {
    orderId: "ord_1001",
    orderNumber: "001001-B",
    date: "29/05/2026 17:25:00",
    sellerName: "Carlos Consultor",
    pickerName: "João Almoxarife",
    deliveryMethod: "Sequoia Logística (Expresso)",
    client: {
      name: "Lucas de Souza",
      phone: "(11) 98888-7777",
      address: {
        street: "Avenida Paulista",
        number: "1000",
        neighborhood: "Bela Vista",
        city: "São Paulo",
        state: "SP",
        zipCode: "01310-100",
        ref: "Próximo ao Metrô Trianon-Masp"
      }
    },
    items: [
      { code: "PRD-001", description: "Camiseta Classic Black M", qty: 2, location: "CORREDOR-A | PRATELEIRA-3", unit: "UND" },
      { code: "PRD-012", description: "Calça Jeans Slim Fit 42", qty: 1, location: "CORREDOR-D | PRATELEIRA-1", unit: "UND" },
      { code: "PRD-099", description: "Meia Cano Alto Esportiva", qty: 3, location: "CORREDOR-G | PRATELEIRA-5", unit: "PAR" }
    ],
    observations: "Embalar para presente. Verificar se a etiqueta de preço foi removida."
  },
  etiqueta: {
    name: "Camiseta Classic Black M",
    code: "SKU-001",
    brand: "Lukasfe Brand",
    category: "Camisetas",
    price: 89.90,
    stock: 45,
    variation: "M / Preta"
  },
  etiquetaLote: {
    batchId: "LOTE-20260529-A",
    createdAt: "29/05/2026 17:25:00",
    divisorLabel: true,
    products: [
      {
        name: "Camiseta Classic Black M",
        code: "SKU-001",
        brand: "Lukasfe Brand",
        category: "Camisetas",
        price: 89.90,
        stock: 45,
        variation: "M / Preta",
        qty: 2
      },
      {
        name: "Calça Jeans Premium Slim 42",
        code: "SKU-012",
        brand: "Premium Denim",
        category: "Calças",
        price: 159.90,
        stock: 12,
        variation: "Slim 42",
        qty: 1
      }
    ]
  },
  mensagemCliente: {
    orderNumber: "001001-D",
    clientName: "Lucas de Souza",
    messageText: "Olá Lucas! Preparamos o seu pedido com muito carinho e cuidado. Esperamos que ame cada detalhe da sua nova aquisição de moda. Use o cupom abaixo para garantir 10% OFF na sua próxima compra!",
    qrCodeUrl: "https://u.r/c10",
    qrCodeLabel: "Escaneie o QR Code para ver o provador virtual do seu look!",
    couponCode: "BEMVINDO10"
  }
};
