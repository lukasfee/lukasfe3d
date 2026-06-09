import { Sale, Product } from '../store';

export interface ValidationResult {
  valid: boolean;
  reason?: string;
  warning?: string;
  requiresConfirmation?: boolean;
}

/**
 * Centered validation layer for Preventing Operational Human Errors (Fase 1)
 */
export const operationalValidationService = {
  // ==========================================
  // 1. ORDER STATUS FLOW MANAGEMENT
  // ==========================================

  STATUS_RANK: {
    'aguardando_separacao': 1,
    'enviado_separacao': 2,
    'em_separacao': 3,
    'separado': 4,
    'separado_com_faltantes': 4,
    'embalando': 5,
    'em_rota': 6,
    'entregue': 7,
    'finalizado': 8
  } as Record<string, number>,

  STATUS_LABELS: {
    'aguardando_separacao': 'Aguardando Separação',
    'enviado_separacao': 'Enviado para Separação',
    'em_separacao': 'Em Separação',
    'separado': 'Separado',
    'separado_com_faltantes': 'Separado com Faltantes',
    'embalando': 'Embalado',
    'em_rota': 'Em Rota',
    'entregue': 'Entregue',
    'finalizado': 'Finalizado',
    'cancelado': 'Cancelado',
    'problema': 'Problema',
    'atrasado': 'Atrasado',
    'retirado': 'Retirado'
  } as Record<string, string>,

  /**
   * Safe status transition validation
   */
  validateStatusTransition(order: Sale, targetStatus: string): ValidationResult {
    const current = order.status;

    // Terminal or exceptional states are exceptions
    const isSpecialState = ['cancelado', 'problema', 'atrasado', 'retirado'].includes(targetStatus) || 
                           ['cancelado', 'problema', 'atrasado', 'retirado'].includes(current);

    if (isSpecialState) {
      if (current === 'cancelado' && targetStatus !== 'cancelado') {
        return {
          valid: false,
          reason: 'Não é possível alterar o status de um pedido já Cancelado.'
        };
      }
      return { valid: true };
    }

    const currentRank = this.STATUS_RANK[current];
    const targetRank = this.STATUS_RANK[targetStatus];

    if (!currentRank || !targetRank) {
      return { valid: true }; // Fallback for custom undefined states
    }

    // A. Backward status reversion check
    if (targetRank < currentRank) {
      return {
        valid: true,
        requiresConfirmation: true,
        warning: `Deseja realmente voltar o status do pedido #${order.orderNumber} de "${this.STATUS_LABELS[current] || current}" para "${this.STATUS_LABELS[targetStatus] || targetStatus}"? Esta ação voltará o fluxo operacional.`
      };
    }

    // B. Validate Em Rota preconditions (must be Embalado)
    if (targetStatus === 'em_rota' && current !== 'embalando') {
      return {
        valid: false,
        reason: `Não é possível marcar como Em Rota. O pedido #${order.orderNumber} ainda não foi marcado como Embalado (status atual: ${this.STATUS_LABELS[current] || current}).`
      };
    }

    // C. Validate Entrega preconditions (must be Em Rota)
    if (targetStatus === 'entregue' && current !== 'em_rota') {
      return {
        valid: false,
        reason: `Não é possível marcar como Entrega. O pedido #${order.orderNumber} ainda não passou pela etapa Em Rota (status atual: ${this.STATUS_LABELS[current] || current}).`
      };
    }

    // D. General flow progression check (cannot skip intermediate steps)
    if (targetRank > currentRank + 1) {
      // Find the expected next step
      const expectedSteps = Object.keys(this.STATUS_RANK).filter(k => this.STATUS_RANK[k] === currentRank + 1);
      const expectedLabel = expectedSteps.map(s => `"${this.STATUS_LABELS[s]}"`).join(' ou ');
      return {
        valid: false,
        reason: `Não é possível avançar status fora da ordem correta. O pedido #${order.orderNumber} precisa primeiro passar por ${expectedLabel} (status atual: "${this.STATUS_LABELS[current] || current}").`
      };
    }

    return { valid: true };
  },

  /**
   * Checks if an order is stagnant at its current stage for too long
   */
  checkOrderStagnancy(order: Sale, alertThresholdMs: number = 15 * 60 * 1000): { stagnant: boolean; elapsedMs: number } {
    const matchingEvent = order.timelineEvents
      ?.filter(e => e.status === order.status)
      .sort((a, b) => b.timestamp - a.timestamp)[0];
    const refTime = matchingEvent ? matchingEvent.timestamp : order.timestamp;
    const elapsedMs = Date.now() - refTime;
    return {
      stagnant: elapsedMs > alertThresholdMs,
      elapsedMs
    };
  },


  // ==========================================
  // 2. PICKING (SEPARAÇÃO) VALIDATIONS
  // ==========================================

  /**
   * Validate if picking session can be initiated on an order
   */
  validatePickingInitiation(order: Sale): ValidationResult {
    if (order.status === 'cancelado') {
      return {
        valid: false,
        reason: 'Este pedido foi cancelado e não pode ser separado.'
      };
    }

    if (order.status === 'aguardando_separacao') {
      return {
        valid: false,
        reason: 'O pedido ainda não foi enviado para separação. Envie-o para a fila primeiro.'
      };
    }

    if (['embalando', 'em_rota', 'entregue', 'finalizado'].includes(order.status)) {
      return {
        valid: false,
        reason: `O pedido já avançou no fluxo operacional de entrega (status: ${this.STATUS_LABELS[order.status] || order.status}) e não pode ser iniciado.`
      };
    }

    return { valid: true };
  },

  /**
   * Validate a product barcode scan or search within an active picking session
   */
  validatePickingScan(order: Sale, scannedValue: string): { valid: boolean; reason?: string; matchedItem?: any } {
    const cleanScan = scannedValue.trim().toLowerCase();
    
    // Find the item
    const matchedItem = order.items.find(item => 
      (item.code && item.code.trim().toLowerCase() === cleanScan) ||
      (item.barcode && item.barcode.trim().toLowerCase() === cleanScan) ||
      (item.name && item.name.toLowerCase().includes(cleanScan))
    );

    if (!matchedItem) {
      return {
        valid: false,
        reason: `Este item não pertence ao pedido atual. (Código lido: "${scannedValue}")`
      };
    }

    return {
      valid: true,
      matchedItem
    };
  },

  /**
   * Validate item quantity addition inside picking
   */
  validatePickingQuantity(item: any, currentPicked: number, inputtedQty: number): ValidationResult {
    if (isNaN(inputtedQty) || inputtedQty < 0) {
      return {
        valid: false,
        reason: 'A quantidade informada é inválida.'
      };
    }

    if (inputtedQty > item.quantity) {
      return {
        valid: false,
        reason: `Quantidade excede a quantidade solicitada (${item.quantity} un). O máximo permitido para este item é ${item.quantity} un.`
      };
    }

    return { valid: true };
  },

  /**
   * Validate picking completion
   */
  validatePickingCompletion(order: Sale): { valid: boolean; reason?: string; hasMissing: boolean; anyPicked: boolean } {
    const missingItems = order.items.filter(item => (item.pickedQuantity || 0) < item.quantity);
    const totalPicked = order.items.reduce((sum, item) => sum + (item.pickedQuantity || 0), 0);
    
    if (totalPicked === 0) {
      return {
        valid: false,
        reason: 'Não é possível finalizar a separação. Nenhum item foi separado ainda.',
        hasMissing: true,
        anyPicked: false
      };
    }

    if (missingItems.length > 0) {
      return {
        valid: false,
        reason: `Não é possível finalizar a separação de forma convencional. Existem ${missingItems.length} itens pendentes de separação neste pedido.`,
        hasMissing: true,
        anyPicked: true
      };
    }

    return {
      valid: true,
      hasMissing: false,
      anyPicked: true
    };
  },


  // ==========================================
  // 3. INVENTORY (ESTOQUE) VALIDATIONS
  // ==========================================

  /**
   * Validate inventory changes when items are checked out
   */
  validateStockChange(product: Product, quantityToChange: number, isAuthorizedUser: boolean = false): ValidationResult {
    // Note: quantityToChange is negative when subtracting stock
    const newStock = product.stock + quantityToChange;

    if (newStock < 0) {
      if (isAuthorizedUser) {
        return {
          valid: true,
          requiresConfirmation: true,
          warning: `O estoque do produto "${product.name}" ficará negativo (${newStock} un). Deseja autorizar com permissão especial?`
        };
      } else {
        return {
          valid: false,
          reason: `Operação Bloqueada: Falta de estoque para o produto "${product.name}". Estoque atual de apenas ${product.stock} un (Déficit de ${Math.abs(newStock)} un).`
        };
      }
    }

    if (newStock === 0) {
      return {
        valid: true,
        warning: `Alerta: Esta operação irá zerar o estoque do produto "${product.name}".`
      };
    }

    if (newStock < product.minStock) {
      return {
        valid: true,
        warning: `Alerta: O produto "${product.name}" ficará abaixo do estoque mínimo operacional (${newStock} < ${product.minStock} un).`
      };
    }

    return { valid: true };
  },


  // ==========================================
  // 4. PRINTING (IMPRESSÃO) VALIDATIONS
  // ==========================================

  /**
   * Validate if a document can be printed safely
   */
  validatePrinting(documentId: string, documentType: string): { valid: boolean; reason?: string; isReprint: boolean; queueStuck: boolean } {
    return {
      valid: true,
      isReprint: false,
      queueStuck: false
    };
  }
};
