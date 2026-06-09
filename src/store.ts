import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { safeIdbGet as idbGet, safeIdbSet as idbSet, safeIdbDel as idbDel } from './lib/idbFallback';
import { DataProtectionService } from './services/dataProtectionService';
import { roundMoney, safeAdd, safeSubtract, safeMultiply, safeDivide, safePercent } from './utils/money';
import { getOrCreateDeviceId } from './services/networkService';
import { environmentService } from './services/environmentService';
import { perfLogger } from './utils/perfLogger';
import { bootTracker } from './utils/bootTracker';
import { operationalValidationService } from './services/operationalValidationService';
import { generateUUID } from './utils/uuid';

export function calculateExpectedCashDrawerBalance(
  cashierSession: CashierSession | null,
  financialTransactions: FinancialTransaction[],
  paymentMethods: PaymentMethod[]
): number {
  if (!cashierSession) return 0;

  const cashPm = paymentMethods.find(pm => pm.type === 'money');
  const cashPmId = cashPm?.id || 'money';

  const openingBalance = cashierSession.openingBalance;
  
  // netCashSales from paymentMethodTotals already has sales, subtracting change, subtract returns, subtract cancellations in cash.
  const netCashSales = cashierSession.paymentMethodTotals[cashPmId] || 0;

  // Now we filter other cashier manual entries (suprimentos/sangrias/etc.)
  // and we do precise filtering by deviceId and terminalId if they exist on the session.
  const otherMovements = financialTransactions.filter(t => {
    // 1. Check if the transaction belongs to the session
    const isSessionLinked = (t.originId === cashierSession.id || (t as any).caixaId === cashierSession.id);
    if (!isSessionLinked) return false;

    // 2. Check if the payment method matches (cash/dinheiro)
    const isCash = t.paymentMethodId === cashPmId || t.paymentMethodName === 'Dinheiro' || t.paymentMethodName === cashPm?.name;
    if (!isCash) return false;

    // 3. For new transactions that have deviceId, they must match the session's deviceId
    if (t.deviceId && cashierSession.deviceId && t.deviceId !== cashierSession.deviceId) {
      return false;
    }

    // 4. For new transactions that have terminalId, they must match the session's terminalId
    if (t.terminalId && cashierSession.terminalId && t.terminalId !== cashierSession.terminalId) {
      return false;
    }

    return true;
  });

  const netSuprimentos = otherMovements
    .filter(t => t.type === 'entrada' && (t.category === 'Suprimento' || t.cashMovementType === 'suprimento'))
    .reduce((sum, t) => safeAdd(sum, t.value || 0), 0);

  const netSangrias = otherMovements
    .filter(t => t.type === 'saida' && (t.category === 'Sangria' || t.cashMovementType === 'sangria'))
    .reduce((sum, t) => safeAdd(sum, t.value || 0), 0);

  return safeSubtract(safeAdd(openingBalance, netCashSales, netSuprimentos), netSangrias);
}

export interface ImageTheme {
  id: string;
  name: string;
  [key: string]: any;
}

// DJB2 Polynomial Hashing Algorithm for custom sub-millisecond string checksum calculations
const computeChecksum = (str: string): string => {
  let hash = 5381;
  const len = str.length;
  for (let i = 0; i < len; i++) {
    hash = (hash * 33) ^ str.charCodeAt(i);
  }
  return (hash >>> 0).toString(36);
};

// Structural state schema validation to prevent corrupt data rehydration
const validateStructure = (data: any): boolean => {
  if (!data || typeof data !== 'object') return false;
  if (!('state' in data)) return false;
  const state = data.state;
  if (!state || typeof state !== 'object') return false;
  
  // High-priority collections MUST be valid arrays if present in JSON state
  const arrayCollections = [
    'sales', 'products', 'clients', 'suppliers', 'users', 
    'auditLogs', 'activities', 'alerts', 'pendingSyncQueue', 
    'cashierHistory', 'financialTransactions'
  ];
  
  for (const collection of arrayCollections) {
    if (collection in state) {
      if (!Array.isArray(state[collection])) {
        return false;
      }
    }
  }
  return true;
};

// Storage Health and Diagnostics Monitor accessible globally via window.__storageHealth
const storageHealth = {
  lastWriteTime: 0,
  lastWriteDurationMs: 0,
  averageWriteDurationMs: 0,
  totalWrites: 0,
  totalReads: 0,
  lastReadDurationMs: 0,
  averageReadDurationMs: 0,
  sizeBytes: 0,
  emergencyBackupRestores: 0,
  checksumFailures: 0,
  corruptionsDetected: 0,
  safeModeActive: false,
  recoveryLogs: [] as string[],
  logEvent: (event: string) => {
    const formatted = `[${new Date().toISOString()}] ${event}`;
    storageHealth.recoveryLogs.push(formatted);
    console.log(`[STORAGE-HEALTH] ${event}`);
    if (storageHealth.recoveryLogs.length > 250) {
      storageHealth.recoveryLogs.shift();
    }
  }
};

if (typeof window !== 'undefined') {
  (window as any).__storageHealth = storageHealth;
}

// Custom storage engine for Zustand using IndexedDB (via idb-keyval)
// This ensures larger data sets (like historical logs, dozens of products/orders)
// are stored reliably and exceed the ~5MB limit of localStorage.
const createDebouncedIdbStorage = () => {
  let pendingValue: string | null = null;
  let pendingKey: string | null = null;
  let timer: any = null;
  let activeResolvers: (() => void)[] = [];
  let lastWritePromise: Promise<any> = Promise.resolve();

  const flush = () => {
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
    if (pendingValue !== null && pendingKey !== null) {
      const valToSave = pendingValue;
      const keyName = pendingKey;
      pendingValue = null;
      pendingKey = null;
      
      const resolvers = [...activeResolvers];
      activeResolvers = [];

      try {
        const now = Date.now();
        const checksum = computeChecksum(valToSave);
        
        // Serialized queue write to guarantee order
        const writeTask = async () => {
          try {
            await idbSet(keyName, valToSave);
            await idbSet(`storage_meta_${keyName}`, { lastWriteTime: now, checksum });
            if (typeof window !== 'undefined') {
              localStorage.removeItem(`emergency_backup_${keyName}`);
              localStorage.removeItem(`emergency_backup_meta_${keyName}`);
            }
          } catch (idbErr) {
            console.error('[DebouncedStorage] Async IndexedDB write in emergency flush failed:', idbErr);
          }
        };
        lastWritePromise = lastWritePromise.then(writeTask).catch(() => {});

        // Instant synchronous backup as a crash safety shield
        if (typeof window !== 'undefined') {
          try {
            const isDesktop = typeof window !== 'undefined' && !!(window as any).electron;
            const finalValToSave = isDesktop ? JSON.stringify({
              lightweightBackup: true,
              timestamp: now,
              version: '1.0.0',
              status: 'safe_mode_desktop',
              description: 'Desktop mode avoids huge JSON in localStorage to prevent QuotaExceededError'
            }) : valToSave;
            localStorage.setItem(`emergency_backup_${keyName}`, finalValToSave);
            localStorage.setItem(`emergency_backup_meta_${keyName}`, JSON.stringify({ lastWriteTime: now, checksum: isDesktop ? '' : checksum }));
          } catch (storageErr) {
            console.warn('[DebouncedStorage] Emergency localStorage backup failed (likely quota exceeded):', storageErr);
          }
        }
      } catch (err) {
        console.error('[DebouncedStorage] Emergency page-unload flush error:', err);
      } finally {
        resolvers.forEach(r => r());
      }
    }
  };

  // Attach flush listeners at the window level to guarantee data serialization on navigation/refresh/close/tab state hide
  if (typeof window !== 'undefined') {
    window.addEventListener('beforeunload', flush);
    window.addEventListener('unload', flush);
    window.addEventListener('pagehide', flush);
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') {
        flush();
      }
    });
  }

  return {
    getItem: async (name: string): Promise<string | null> => {
      const readStartTime = Date.now();
      if (pendingValue !== null && name === pendingKey) {
        return pendingValue;
      }
      try {
        // Enforce a strict 12s timeout on the IndexedDB read to identify and break hangs
        let val = (await bootTracker.trackPromise(
          `getItem_idbStorage_${name}`,
          async () => {
            return (await idbGet<string>(name)) || null;
          },
          12000
        )) as string | null;

        // Fetch corresponding metadata from IndexedDB
        let dbMeta: { lastWriteTime: number; checksum?: string } | null = null;
        try {
          dbMeta = await idbGet<{ lastWriteTime: number; checksum?: string }>(`storage_meta_${name}`);
        } catch (metaErr) {
          storageHealth.logEvent(`Could not load write metadata for ${name}: ${metaErr}`);
        }

        let isDbValid = true;
        let parsedDbValue: any = null;

        if (val) {
          try {
            parsedDbValue = JSON.parse(val);
            if (!validateStructure(parsedDbValue)) {
              isDbValid = false;
              storageHealth.corruptionsDetected++;
              storageHealth.logEvent(`[INTEGRITY FAILURE] Structured validation failed for database key: ${name}`);
            } else if (dbMeta?.checksum) {
              const dbChecksum = computeChecksum(val);
              if (dbMeta.checksum !== dbChecksum) {
                isDbValid = false;
                storageHealth.checksumFailures++;
                storageHealth.logEvent(`[CHECKSUM MISMATCH] Calculated checksum '${dbChecksum}' does not match saved '${dbMeta.checksum}' for: ${name}`);
              }
            }
          } catch (jsonErr) {
            isDbValid = false;
            storageHealth.corruptionsDetected++;
            storageHealth.logEvent(`[JSON CORRUPTION] JSON syntax error in database: ${jsonErr}`);
          }
        }

        // Check if there is a pending fallback or emergency backup to restore instantly
        if (typeof window !== 'undefined') {
          const emergencyBackup = localStorage.getItem(`emergency_backup_${name}`);
          const emergencyBackupMetaRaw = localStorage.getItem(`emergency_backup_meta_${name}`);
          
          if (emergencyBackup && emergencyBackupMetaRaw) {
            try {
              const bMeta = JSON.parse(emergencyBackupMetaRaw);
              const bTime = Number(bMeta?.lastWriteTime || 0);
              const dbTime = Number(dbMeta?.lastWriteTime || 0);
              
              // Validate emergency backup before using it to prevent restoring corrupt state
              let isBackupValid = true;
              let parsedBackup: any = null;
              try {
                parsedBackup = JSON.parse(emergencyBackup);
                if (!validateStructure(parsedBackup)) {
                  isBackupValid = false;
                  storageHealth.logEvent(`[INTEGRITY FAILURE] Structured verification failed for backup: ${name}`);
                } else if (bMeta?.checksum) {
                  const bChecksum = computeChecksum(emergencyBackup);
                  if (bMeta.checksum !== bChecksum) {
                    isBackupValid = false;
                    storageHealth.logEvent(`[CHECKSUM MISMATCH] Backup checksum fail: expected ${bMeta.checksum}, got ${bChecksum}`);
                  }
                }
              } catch (bJsonErr) {
                isBackupValid = false;
                storageHealth.logEvent(`[JSON CORRUPTION] JSON parse error in backup: ${bJsonErr}`);
              }

              if (isBackupValid && (bTime > dbTime || !isDbValid)) {
                storageHealth.emergencyBackupRestores++;
                storageHealth.logEvent(`Recovering state from newer emergency backup for: ${name} (Backup time: ${bTime}, DB time: ${dbTime}, DB was valid: ${isDbValid})`);
                val = emergencyBackup;
                isDbValid = true; // Recovered cleanly!
                
                // Align IndexedDB storage asynchronously 
                const recoveryTask = async () => {
                  try {
                    await idbSet(name, emergencyBackup);
                    await idbSet(`storage_meta_${name}`, { lastWriteTime: bTime, checksum: bMeta?.checksum || computeChecksum(emergencyBackup) });
                  } catch (idbErr) {
                    console.error(`[STORAGE] Could not align recovered data back to IndexedDB:`, idbErr);
                  }
                };
                lastWritePromise = lastWritePromise.then(recoveryTask).catch(() => {});
              } else {
                if (!isBackupValid) {
                  storageHealth.logEvent(`Corrupted emergency backup ignored for: ${name}`);
                } else {
                  storageHealth.logEvent(`Stale emergency backup ignored for: ${name} (Backup time: ${bTime}, DB time: ${dbTime})`);
                }
              }
              
              // Clean up emergency backup because it has been analyzed and resolved
              localStorage.removeItem(`emergency_backup_${name}`);
              localStorage.removeItem(`emergency_backup_meta_${name}`);
            } catch (err) {
              storageHealth.logEvent(`Failed parsing or restoring emergency backup: ${err}`);
            }
          }
        }

         // If DB is still invalid and we weren't able to recover, trigger Safe Mode lock to block overwrites!
        if (val && !isDbValid) {
          storageHealth.safeModeActive = true;
          storageHealth.logEvent(`[FATAL STORAGE CORRUPTION] Unable to recover state safely for '${name}'. Enabling Safe Mode to protect existing database files.`);
          if (typeof window !== 'undefined') {
            (window as any).__idbLoadFailed = true;
            window.dispatchEvent(new CustomEvent('idb-load-failed'));
          }
          return null;
        }

        // Expose health metrics
        const readDuration = Date.now() - readStartTime;
        storageHealth.totalReads++;
        storageHealth.lastReadDurationMs = readDuration;
        storageHealth.averageReadDurationMs = storageHealth.averageReadDurationMs === 0
          ? readDuration
          : (storageHealth.averageReadDurationMs * 0.9) + (readDuration * 0.1);
        storageHealth.sizeBytes = val ? val.length : 0;
        storageHealth.lastWriteTime = Date.now();

        return val;
      } catch (err: any) {
        storageHealth.logEvent(`Failed or timed out loading storage for ${name}: ${err}`);
        if (typeof window !== 'undefined') {
          (window as any).__idbLoadFailed = true;
          window.dispatchEvent(new CustomEvent('idb-load-failed'));
        }
        return null; // Return null so the app falls back to initialization rather than hanging forever
      }
    },
    setItem: async (name: string, value: string): Promise<void> => {
      if (typeof window !== 'undefined' && (window as any).__idbLoadFailed) {
        console.warn(`[DebouncedStorage] SetItem blocked for '${name}' to prevent overwriting real database due to previous IndexedDB failure.`);
        return;
      }
      pendingValue = value;
      pendingKey = name;
      
      const writePromise = new Promise<void>((resolve) => {
        activeResolvers.push(resolve);
      });

      if (timer) {
        clearTimeout(timer);
      }

      timer = setTimeout(async () => {
        const valToSave = pendingValue;
        pendingValue = null;
        pendingKey = null;
        const resolvers = [...activeResolvers];
        activeResolvers = [];
        timer = null;

        if (valToSave !== null) {
          const now = Date.now();
          const checksum = computeChecksum(valToSave);
          const writeStartTime = Date.now();
          
          // Fast-track synchronous localStorage backup as a crash-shield before entering background write-queue
          if (typeof window !== 'undefined') {
            try {
              const isDesktop = typeof window !== 'undefined' && !!(window as any).electron;
              const finalValToSave = isDesktop ? JSON.stringify({
                lightweightBackup: true,
                timestamp: now,
                version: '1.0.0',
                status: 'safe_mode_desktop',
                description: 'Desktop mode avoids huge JSON in localStorage to prevent QuotaExceededError'
              }) : valToSave;
              localStorage.setItem(`emergency_backup_${name}`, finalValToSave);
              localStorage.setItem(`emergency_backup_meta_${name}`, JSON.stringify({ lastWriteTime: now, checksum: isDesktop ? '' : checksum }));
            } catch (storageErr) {
              console.warn('[DebouncedStorage] Quick localStorage backup failed (likely quota exceeded):', storageErr);
            }
          }

          // Chain actual database write to the sequential promise queue
          const writeTask = async () => {
            try {
              await idbSet(name, valToSave);
              await idbSet(`storage_meta_${name}`, { lastWriteTime: now, checksum });
              
              // Clean emergency backup from localStorage on successful IndexedDB save
              if (typeof window !== 'undefined') {
                localStorage.removeItem(`emergency_backup_${name}`);
                localStorage.removeItem(`emergency_backup_meta_${name}`);
              }

              // Update write metrics
              const duration = Date.now() - writeStartTime;
              storageHealth.totalWrites++;
              storageHealth.lastWriteDurationMs = duration;
              storageHealth.averageWriteDurationMs = storageHealth.averageWriteDurationMs === 0
                ? duration
                : (storageHealth.averageWriteDurationMs * 0.9) + (duration * 0.1);
              storageHealth.sizeBytes = valToSave.length;
              storageHealth.lastWriteTime = Date.now();
            } catch (err) {
              console.error(`[DebouncedStorage] Failed to set item '${name}' inside write queue:`, err);
              storageHealth.logEvent(`[WRITE ERROR] Failed to save database key '${name}': ${err}`);
            }
          };
          
          lastWritePromise = lastWritePromise.then(writeTask).catch(() => {});
          await lastWritePromise;
        }
        
        resolvers.forEach(r => r());
      }, 1000);

      return writePromise;
    },
    removeItem: async (name: string): Promise<void> => {
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
      pendingValue = null;
      pendingKey = null;
      activeResolvers.forEach(r => r());
      activeResolvers = [];
      
      if (typeof window !== 'undefined') {
        localStorage.removeItem(`emergency_backup_${name}`);
        localStorage.removeItem(`emergency_backup_meta_${name}`);
      }
      
      const removeTask = async () => {
        try {
          await idbDel(name);
          await idbDel(`storage_meta_${name}`);
        } catch (err) {
          console.error(`[DebouncedStorage] Failed to remove item '${name}' inside write queue:`, err);
        }
      };
      
      lastWritePromise = lastWritePromise.then(removeTask).catch(() => {});
      await lastWritePromise;
    }
  };
};

const createMemoryStorage = () => {
  const store = new Map<string, string>();
  return {
    getItem: (name: string): string | null => {
      return store.get(name) || null;
    },
    setItem: (name: string, value: string): void => {
      store.set(name, value);
    },
    removeItem: (name: string): void => {
      store.delete(name);
    }
  };
};

const memoryStorage = createMemoryStorage();
const idbStorage = createDebouncedIdbStorage();

export type CashierStatus = 'open' | 'closed';

export interface Tombstone {
  id: string;
  entityType: string;
  entityId: string;
  deletedAt: string;
  deletedBy: string;
  deviceId: string;
  syncVersion?: number;
  lastUpdated?: number;
}

export interface Category {
  id: string;
  name: string;
  color?: string;
  icon?: string;
  active: boolean;
}

export interface Subcategory {
  id: string;
  categoryId: string;
  name: string;
  color?: string;
  active: boolean;
}

export interface Material {
  id: string;
  name: string;
  category: string;
  unit: string;
  totalPurchaseQuantity: number;
  currentQuantity: number;
  totalCost: number;
  unitCost: number;
  minStock: number;
  notes?: string;
  artsPerSheet?: number;
}

export interface ProductionItem {
  materialId: string;
  quantity: number;
  cost: number;
}

export interface ProductionRecipe {
  id: string;
  name: string;
  items: ProductionItem[];
  totalCost: number;
  suggestedPrice?: number;
  quantity?: number;
  wastePercent?: number;
  laborHours?: number;
  laborCostPerHour?: number;
  laborTotalCost?: number;
  createdAt: number;
}

export interface ProductionRun {
  id: string;
  productionId: string;
  productId: string;
  quantityProduced: number;
  materialConsumptions: {
    materialId: string;
    materialName: string;
    quantityUsed: number;
    unitCost: number;
    totalCost: number;
  }[];
  totalCost: number;
  unitCost: number;
  wastePercent?: number;
  laborHours?: number;
  laborCostPerHour?: number;
  laborTotalCost?: number;
  createdAt: number;
  createdBy?: string;
  createdByName?: string;
  deviceId?: string;
  terminalId?: string;
  notes?: string;
  syncVersion?: number;
  lastUpdated?: number;
  updatedBy?: string;
}

export interface ProductVariation {
  id: string;
  sku: string;
  name: string;
  stock: number;
  price?: number;
  wholesalePrice?: number;
  costPrice?: number;
  image?: string;
}

export interface Product {
  id: string;
  name: string;
  price: number;
  wholesalePrice: number;
  costPrice: number;
  code: string;
  stock: number;
  minStock: number;
  unit: string;
  location?: {
    aisle?: string;
    shelf?: string;
    drawer?: string;
  };
  barcode?: string;
  category: string;
  categoryId?: string;
  subcategoryId?: string;
  notes?: string;
  active: boolean;
  image?: string;
  extraImages?: string[];
  productionId?: string;
  productionMode?: 'stock' | 'on_demand';
  deleted?: boolean;
  archivedAt?: number;
  archivedBy?: string;
  syncVersion?: number;
  lastUpdated?: number;
  updatedBy?: string;

  // Catalog properties
  catalogPublished?: boolean;
  catalogHidden?: boolean;
  catalogDescription?: string;
  catalogPriceOverride?: number;
  catalogPriceShow?: boolean;
  totemHabilitado?: boolean;
  variations?: ProductVariation[];
  file3d?: {
    name: string;
    type: string;
    data: string;
  };
}

export interface ConsignmentItem {
  productId: string;
  name: string;
  quantity: number;
  unitPrice: number;
  soldQuantity: number;
  returnedQuantity: number;
}

export type ConsignmentStatus = 'em_consignacao' | 'parcialmente_vendido' | 'finalizado' | 'devolvido' | 'pendente';

export interface ConsignmentRemittance {
  id: string;
  retailerId: string;
  retailerName: string;
  items: ConsignmentItem[];
  totalValue: number;
  status: ConsignmentStatus;
  timestamp: number;
  notes?: string;
  createdBy: string;
}

export interface Client {
  id: string;
  name: string;
  phone?: string;
  whatsapp?: string;
  document?: string;
  email: string;
  address?: string;
  neighborhood?: string;
  city?: string;
  state?: string;
  zip?: string;
  notes?: string;
  active: boolean;
  createdAt: number;
  image?: string;
}

export type PaymentMethodType = 'money' | 'pix' | 'card_debit' | 'card_credit' | 'other';

export interface PaymentMethod {
  id: string;
  name: string;
  type: PaymentMethodType;
  active: boolean;
  showInPDV: boolean;
  allowsChange: boolean;
  fee: number;
  receivedDays: number;
  notes?: string;
  pixKey?: string;
}

export interface CartItem extends Product {
  quantity: number;
  pickedQuantity?: number;
  unitCostAtSale?: number;
  totalCostAtSale?: number;
  unitPriceAtSale?: number;
  totalPriceAtSale?: number;
  selectedVariationId?: string;
  selectedVariationName?: string;
  selectedVariationSku?: string;
}

export interface SalePayment {
  methodId: string;
  methodName: string;
  amount: number;
}

export interface Sale {
  id: string;
  items: CartItem[];
  subtotal: number;
  discount: number;
  total: number;
  paymentMethodId: string;
  paymentMethodName: string;
  receivedAmount?: number;
  change?: number;
  additionalCharge?: number;
  payments?: SalePayment[];
  timestamp: number;
  clientId?: string;
  orderNumber: string;
  sellerName?: string;
  sellerLogin?: string;
  pickerName?: string;
  pickerId?: string;
  pickTimestamp?: number;
  pickStartTime?: number;
  pickDuration?: number; // in seconds
  status: 'em_producao' | 'aguardando_separacao' | 'enviado_separacao' | 'em_separacao' | 'separado' | 'separado_com_faltantes' | 'aguardando_embalagem' | 'embalando' | 'em_rota' | 'entregue' | 'problema' | 'atrasado' | 'retirado' | 'cancelado' | 'finalizado';
  productionStatus?: 'em_fila' | 'produzindo' | 'pausado' | 'finalizado';
  productionNotes?: string;
  productionPriority?: 'baixa' | 'media' | 'alta';
  origin?: 'PDV' | 'Totem';
  totalRequestedQuantity?: number;
  totalPickedQuantity?: number;
  totalMissingQuantity?: number;
  missingProductsList?: Array<{
    id: string;
    name: string;
    code: string;
    quantityRequested: number;
    quantityPicked: number;
    quantityMissing: number;
  }>;
  missingItemsAuthorizedBy?: string;
  missingItemsAuthMethod?: 'senha_master' | 'qrcode_adm';
  
  // Delivery details
  deliveryMethodId?: string;
  deliveryMethodName?: string;
  trackingCode?: string;
  deliveryAddedBy?: string;
  deliveryAddedAt?: number;
  
  deliveryType?: 'retirada' | 'entrega_local' | 'transportadora' | 'correios';
  deliveryDriver?: string;
  departureTime?: number;
  deliveryTime?: number;
  deliveryNotes?: string;
  rescheduledDate?: number;
  retailerId?: string;
  packageType?: string;
  weight?: number;
  volume?: string;
  experienceContentUrl?: string;
  experiencePaperSize?: '58mm' | '80mm' | 'A4' | 'A5' | 'A6';
  experienceThemeId?: string;
  experienceCompanyName?: string;
  experienceMainMessage?: string;
  experienceSecondaryMessage?: string;
  experiencePhone?: string;
  experienceInstagram?: string;
  experienceFacebook?: string;
  experienceFooterObs?: string;
  experienceTemplate?: 'simple' | 'elegant' | 'commercial';
  clientName?: string;
  clientPhone?: string;
  timelineEvents?: TimelineEvent[];
  originalItems?: CartItem[];
  originalSubtotal?: number;
  originalTotal?: number;
  thermalReceipt?: any;
  cupomPedidoPayload?: any;
  queueJobId?: string;
}

export interface TimelineEvent {
  id: string;
  type: 'order' | 'payment' | 'separation' | 'authorization' | 'stock' | 'print' | 'dispatch' | 'packaging' | 'user' | string;
  timestamp: number;
  user: string;
  description: string;
  observation?: string;
  status?: string;
  icon?: string;
  color?: string;
  metadata?: Record<string, any>;
}

export interface Retailer {
  id: string;
  name: string;
  responsible: string;
  phone?: string;
  whatsapp?: string;
  document: string;
  email: string;
  address: string;
  city: string;
  state: string;
  notes?: string;
  active: boolean;
  createdAt: number;
}

export interface ReturnRecord {
  id: string;
  saleId: string;
  orderNumber: string;
  productId: string;
  productName: string;
  quantity: number;
  reason: 'defeito' | 'desistencia' | 'errado' | 'troca' | 'outro';
  notes?: string;
  returnToStock: boolean;
  timestamp: number;
  
  // Cashier refund fields
  refundViaCashierMoney?: boolean;
  cashierId?: string;
  operator?: string;
}

export interface Machine {
  id: string;
  name: string;
  price: number;
  wearRate: number; // Percentual por produção
  fixedCost: number; // Custo fixo por produção
  active: boolean;
}

export interface ProductionSimulation {
  id: string;
  name: string;
  quantity: number;
  notes?: string;
  
  // 3D Material
  material3D?: {
    type: 'filament' | 'resin';
    purchasePrice: number;
    purchaseQuantity: number; // em g ou ml
    usedQuantity: number;
    cost: number;
  };

  // Paper
  paper?: {
    packagePrice: number;
    sheetsPerPackage: number;
    artsPerSheet: number;
    artsUsed: number;
    cost: number;
  };

  inkCost: number;
  
  // Energy
  energy?: {
    kwhPrice: number;
    machineWatts: number;
    hoursUsed: number;
    cost: number;
  };

  // Machine
  machineId?: string;
  machineCost: number;

  // Others
  others: { name: string; value: number }[];
  
  // Totals
  totalCost: number;
  unitCost: number;
  suggestedPrice: number;
  timestamp: number;
}

export interface CashierSession {
  id: string;
  status: CashierStatus;
  openingBalance: number;
  openingTime: number;
  closingTime?: number;
  expectedClosingBalance?: number;
  actualClosingBalance?: number;
  totalSales: number;
  paymentMethodTotals: {
    [methodId: string]: number;
  };
  notes?: string;
  openedBy?: string;
  closedBy?: string;
  deviceId?: string;
  terminalId?: string | null;
}

export interface PreOrder {
  id: string;
  orderCode: string;
  clientId: string;
  productDescription: string;
  image?: string;
  origin: string;
  estimatedValue: number;
  finalValue?: number;
  dueDate: number;
  notes?: string;
  status: 'nova' | 'em_analise' | 'aguardando_aprovacao' | 'aprovada' | 'convertida' | 'cancelada';
  createdAt: number;
}

export interface FinancialTransaction {
  id: string;
  code: string;
  type: 'entrada' | 'saida';
  category: string;
  description: string;
  value: number;
  date: number;
  paymentMethodId?: string;
  paymentMethodName?: string;
  status: 'pago' | 'pendente' | 'cancelado';
  notes?: string;
  origin: 'venda' | 'caixa' | 'manual' | 'pre_encomenda';
  originId?: string;

  // Return reconciliation fields
  tipo?: 'devolucao';
  returnType?: 'devolucao';
  origemVendaId?: string;
  caixaId?: string;
  operador?: string;
  timestamp?: number;
  deviceId?: string;
  terminalId?: string | null;
  cashMovementType?: 'sangria' | 'suprimento' | 'sale_cash' | 'refund_cash' | 'opening';
  syncVersion?: number;
  lastUpdated?: number;
  updatedBy?: string;
}

export interface Activity {
  id: string;
  message: string;
  timestamp: number;
  type: 'sale' | 'cashier' | 'inventory' | 'auth' | 'automation' | 'financial' | 'pre_order' | 'client' | 'alert' | 'lojista';
  userName?: string;
  module?: string;
  entityId?: string;
}

export interface AIAlert {
  id: string;
  title: string;
  description: string;
  priority: 'low' | 'medium' | 'high';
  status: 'new' | 'seen' | 'resolved';
  timestamp: number;
  type: 'inventory' | 'sales' | 'cashier' | 'customers' | 'financial' | 'print' | 'labels' | 'system' | 'logistics' | 'info';
}

export interface Automation {
  id: string;
  name: string;
  description: string;
  trigger: 'pedido_pago' | 'estoque_baixo' | 'caixa_aberto_muito_tempo' | 'pedido_atrasado' | 'cliente_inativo';
  action: 'enviar_para_separacao' | 'criar_alerta' | 'mudar_status_pedido' | 'notificar_responsavel' | 'marcar_como_prioridade';
  status: 'active' | 'paused';
  createdAt: number;
  lastExecution?: number;
  executionsCount: number;
}

export interface RolePermission {
  module: string;
  actions: {
    acessar: boolean;
    visualizar: boolean;
    cadastrar: boolean;
    editar: boolean;
    excluir: boolean;
    cancelar: boolean;
    imprimir: boolean;
    gerarPDF: boolean;
    verValores: boolean;
    alterarStatus: boolean;
    configurar: boolean;
  };
}

export interface UserRole {
  id: string;
  name: string;
  description: string;
  status: 'ativo' | 'inativo';
  permissions: RolePermission[];
}

export interface UserFaceBiometricData {
  templateEncrypted: string;
  templateVersion: string;
  algorithm: 'mediapipe-landmarks-v1';
  consentTextVersion: string;
  consentAcceptedAt: string;
  enrolledAt: string;
  enrolledByUserId: string;
  biometricOwnerType?: 'employee' | 'admin' | 'master';
}

export interface User {
  id: string;
  fullName: string;
  login: string;
  matricula?: string;
  password?: string;
  roleId: string;
  status: 'ativo' | 'inativo';
  isAdmin: boolean;
  image?: string;
  qrCodeToken?: string;
  badgeId?: string;
  nfcTagId?: string;
  initialModule?: string;
  allowedModules?: string[];
  primaryFunction?: string;
  extraPermissions?: string[];
  isOwner?: boolean;
  isMasterAdmin?: boolean;
  loja?: string;
  setor?: string;
  faceBiometric?: UserFaceBiometricData;
  qrCodeBlocked?: boolean;
  accessKey?: string;
  externalQrId?: string;
}

export interface Badge {
  id: string;
  codigoCracha: string;
  status: 'Livre' | 'Vinculado' | 'Bloqueado' | 'Perdido';
  usuarioVinculado: string | null;
  dataCriacao: number;
  ultimoUso: number | null;
  blocked?: boolean;
  isBlocked?: boolean;
  active?: boolean;
  isActive?: boolean;
}

export function isBadgeBlocked(badge: any): boolean {
  if (!badge) return false;
  return badge.blocked === true
    || badge.isBlocked === true
    || badge.status === 'blocked'
    || badge.status === 'Bloqueado'
    || badge.status === 'Perdido'
    || badge.badgeStatus === 'blocked';
}

export function getBadgeStatusLabel(badge: any): string {
  if (!badge) return 'Crachá inativo';
  if (isBadgeBlocked(badge)) return 'Crachá bloqueado';
  if (badge.active === false || badge.isActive === false || badge.status === 'Livre') return 'Crachá inativo';
  return 'Crachá ativo';
}

export interface NFCTag {
  id: string;
  uid: string;
  status: 'Livre' | 'Vinculado' | 'Bloqueado' | 'Perdido' | 'Quarentena' | 'Excluido';
  usuarioVinculado: string | null;
  tagLabel?: string;
  dataCriacao: number;
  ultimoUso: number | null;
  quarantineAt?: number | null;
  quarantineReason?: string;
  dataExpiracao?: number | null;
  tipoCredencial?: 'OPERADOR' | 'MASTER' | 'ADM';
}

export interface NFCPresenceRecord {
  id: string;
  userId: string;
  userLogin: string;
  userFullName: string;
  nfcUid: string;
  timestamp: number;
  tipoEvento: 'ENTRADA' | 'SAIDA' | 'PAUSA' | 'RETORNO' | 'PRESENCA_OPERACIONAL';
  device?: string;
}

export interface TerminalOperacional {
  idTerminal: string;
  nomeTerminal: string;
  tipoTerminal: 'PDV' | 'SEPARACAO' | 'ESTOQUE' | 'EXPEDICAO' | 'ADMINISTRATIVO' | 'FINANCEIRO';
  setor: string;
  permissoesAceitas: string[]; // compatible role IDs (e.g. ['admin', 'supervisor', 'operador'])
  operadorAtualId: string | null;
  operadorAtualName: string | null;
  ultimoOperadorId: string | null;
  ultimoOperadorName: string | null;
  status: 'Online' | 'Offline' | 'Bloqueado';
  dispositivo: string;
  modoBloqueado: boolean;
}

export interface MasterAuthorization {
  id: string;
  userId: string;
  passwordMaster: string;
  status: 'ativo' | 'inativo';
  createdAt: number;
  lastUsedAt: number | null;
  observation?: string;
}

export interface MasterBadge {
  id: string;
  authorizationId: string;
  userId: string;
  codigoMaster: string;
  status: 'ativo' | 'bloqueado';
  createdAt: number;
  lastUsedAt: number | null;
}

export interface AuditLog {
  id: string;
  userId: string;
  userLogin: string;
  userRole: string;
  userMatricula?: string;
  timestamp: number;
  module: string;
  actionType: 'create' | 'update' | 'delete' | 'cancel' | 'print' | 'pdf' | 'login' | 'config' | 'status_change' | 'other' | string;
  description: string;
  status: 'sucesso' | 'bloqueado' | 'erro';
  referenceId?: string;
  // New Audit fields
  action?: string;
  affectedEntity?: string;
  entityId?: string;
  previousValue?: string;
  newValue?: string;
  method?: string;
  device?: string;
  riskLevel?: 'baixo' | 'médio' | 'alto';
  eventType?: 'operational_history' | 'audit_log';
}

export interface ReceiptConfig {
  paperSize: '58mm' | '80mm' | 'A4' | 'A5' | 'A6';
  customWidth?: number;
  customHeight?: number;
  visibleFields: {
    logo: boolean;
    companyName: boolean;
    address: boolean;
    client: boolean;
    document: boolean;
    phone: boolean;
    products: boolean;
    quantities: boolean;
    price: boolean;
    discount: boolean;
    change: boolean;
    qrCode: boolean;
    user: boolean;
    timestamp: boolean;
    separationStatus: boolean;
    payment?: boolean;
    observations?: boolean;
  };
  fontSize: number;
  alignment: 'left' | 'center' | 'right';
  spacing: number;
  showDividers: boolean;
  centerLogo: boolean;
  boldTitles: boolean;
  orientation: 'portrait' | 'landscape';
  template?: 'simple' | 'commercial' | 'premium';
  themeId?: string;
  qrCodeSize: number;
  footerMessage?: string;
  printRotation?: 0 | 90 | 180 | 270;
  showSafeArea?: boolean;
  copies?: number;
}

export interface SocialNetworkItem {
  id: string;
  type: 'instagram' | 'facebook' | 'tiktok' | 'whatsapp' | 'youtube' | 'website' | 'telegram';
  handle: string;
}

export interface CustomerExperienceConfig {
  paperSize: '58mm' | '80mm' | 'A4' | 'A5' | 'A6';
  customWidth?: number;
  customHeight?: number;
  header: {
    message: string;
    title: string;
    subtitle: string;
  };
  footer: {
    message: string;
  };
  qrCode: {
    visible: boolean;
    size: number;
    alignment: 'left' | 'center' | 'right';
  };
  contentQrCode: {
    visible: boolean;
    size: number;
    alignment: 'left' | 'center' | 'right';
    textAbove: string;
    textBelow: string;
    defaultUrl: string;
  };
  orientation: 'portrait' | 'landscape';
  template: 'simple' | 'elegant' | 'commercial';
  printRotation?: 0 | 90 | 180 | 270;
  themeId?: string;
  customerMessageSocialTitle?: string;
  customerInstagram?: string;
  customerFacebook?: string;
  socials?: SocialNetworkItem[];

  // MessageCard compatibility fields
  companyName?: string;
  mainMessage?: string;
  secondaryMessage?: string;
  qrUrl?: string;
  phone?: string;
  instagram?: string;
  facebook?: string;
  footerObs?: string;
  visibleFields?: {
    logo?: boolean;
    companyName?: boolean;
    qrCode?: boolean;
    socials?: boolean;
    mainMessage?: boolean;
    secondaryMessage?: boolean;
    phone?: boolean;
    instagram?: boolean;
    facebook?: boolean;
    footerObs?: boolean;
  };
}

export interface CatalogConfig {
  storeName: string;
  storeDescription: string;
  logoUrl?: string;
  bannerUrl?: string;
  whatsappNumber: string;
  whatsappMessageTemplate: string;
  themeColor: 'emerald' | 'indigo' | 'crimson' | 'slate' | 'amber';
  themeMode: 'dark' | 'light';
  showPrices: boolean;
  hideOutOfStock: boolean;
  autoUnpublishOnZeroStock: boolean;
}

export interface OrderTicketConfig {
  paperSize: '58mm' | '80mm' | 'A4' | 'A5' | 'A6';
  customWidth?: number;
  customHeight?: number;
  visibleFields: {
    logo?: boolean;
    companyName?: boolean;
    orderNumber?: boolean;
    qrCode?: boolean;
    clientName?: boolean;
    phone?: boolean;
    timestamp?: boolean;
    seller?: boolean;
    status?: boolean;
    products?: boolean;
    quantities?: boolean;
    observations?: boolean;
    
    // Optional compatibility fields
    slogan?: boolean;
    document?: boolean;
    address?: boolean;
    title?: boolean;
    subtitle?: boolean;
    message?: boolean;
    qrText?: boolean;
    socialsSection?: boolean;
    instagram?: boolean;
    facebook?: boolean;
    dateTime?: boolean;
    attendant?: boolean;
    footer?: boolean;
  };
  fontSize: number;
  alignment: 'left' | 'center' | 'right';
  spacing: number;
  showDividers: boolean;
  orientation: 'portrait' | 'landscape';
  template?: 'operational' | 'wms' | 'compact';
  themeId?: string;
  tagline?: string;
  qrCodeSize: number;
  printRotation?: 0 | 90 | 180 | 270;
}

export interface LabelConfig {
  paperSize: '58mm' | '80mm' | 'A4' | 'A5' | 'A6' | '40x30';
  customWidth?: number;
  customHeight?: number;
  visibleFields: {
    name?: boolean;
    sku?: boolean;
    price?: boolean;
    qrCode?: boolean;
    category?: boolean;
    cuttingGuide?: boolean;
    
    // Optional compatibility fields
    productName?: boolean;
    brand?: boolean;
    variation?: boolean;
    stock?: boolean;
  };
  fontSize: number;
  orientation: 'horizontal' | 'vertical' | 'portrait' | 'landscape';
  
  // Advanced Layout
  labelWidth: number;
  labelHeight: number;
  horizontalSpacing: number;
  verticalSpacing: number;
  marginTop: number;
  marginBottom: number;
  marginLeft: number;
  marginRight: number;
  showCutLines: boolean;
  guideOpacity: number;
  previewQuantity: number;
  columns?: number;
  rows?: number;
  cols?: number;
  colGap?: number;
  rowGap?: number;
  template: 'compact' | 'standard' | 'industrial' | 'minimalist';
  qrCodeSize: number;
  internalPadding: number;
  elementSpacing: number;
  printRotation?: 0 | 90 | 180 | 270;
  themeId: string;
  batchThemeId?: string;
  copies: number;
  customFields: Record<string, any>;
}

export interface BadgeConfig {
  paperSize: '58mm' | '80mm' | 'A4' | 'A5' | 'A6';
  customWidth?: number;
  customHeight?: number;
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
  // Custom Colors
  primaryColor?: string;
  secondaryColor?: string;
  accentColor?: string;
  textColor?: string;
  backColor?: string;
  borderColor?: string;
  qrContainerColor?: string;
  gradient?: boolean;
  printRotation?: 0 | 90 | 180 | 270;
  // Dynamic displayed fields
  showName?: boolean;
  showRole?: boolean;
  showFunction?: boolean;
  showStore?: boolean;
  showSector?: boolean;
  showMatricula?: boolean;
  showPhoto?: boolean;
  cornerStyle?: 'v1' | 'v2';

  // Advanced customization configs
  headerColor?: string;         // cor do header
  footerColor?: string;         // cor do footer
  qrColor?: string;             // cor do QR
  roleColor?: string;           // cor do cargo
  sectorColor?: string;         // cor do setor
  backOpacity?: number;         // opacidade do fundo (0-100)
  gradientIntensity?: number;   // intensidade do gradiente (0-100)
  glowIntensity?: number;       // brilho visual leve (0-100)
  cardShadow?: 'none' | 'sm' | 'md' | 'lg' | 'neon' | 'glow'; // sombra do cartão

  // Border styles
  borderStyleType?: 'solid' | 'glow' | 'double' | 'neon' | 'minimalist' | 'metallic' | 'dashed';
  borderWidthPx?: number;       // intensidade da borda

  // Photo layout settings
  photoShape?: 'round' | 'square' | 'squircle'; // foto arredondada/quadrada
  photoSizeMultiplier?: number; // tamanho da foto
  photoShadow?: 'none' | 'sm' | 'md' | 'glow'; // sombra da foto
  photoBorderColor?: string;    // borda da foto
  photoPosition?: 'top' | 'center' | 'bottom' | 'left' | 'right'; // posição da foto
  photoBorderWidthPx?: number;  // intensidade da borda da foto

  // Typography options
  nameFontSize?: number;        // tamanho do nome
  nameFontWeight?: 'normal' | 'semibold' | 'bold' | 'black'; // peso da fonte do nome
  nameLetterSpacing?: 'normal' | 'wide' | 'wider' | 'widest'; // espaçamento
  nameUppercase?: boolean;      // caixa alta
  nameAlignment?: 'left' | 'center' | 'right'; // alinhamento
  roleFontSize?: number;        // tamanho do cargo
  matriculaFontSize?: number;   // tamanho da matrícula

  // Auto role color status
  autoRoleStyleEnabled?: boolean; // status visual automático opcional/desativável

  bgPatternType?: 'none' | 'gradient' | 'carbon' | 'hexagons' | 'industrial' | 'circuits' | 'glass'; // fundo avançado

  // Advanced QR Code options
  qrRounded?: boolean;          // QR arredondado
  qrMinimalist?: boolean;       // QR minimalista
  qrBorder?: boolean;           // QR com borda
  qrInverted?: boolean;         // QR invertido
  qrTransparent?: boolean;      // QR com fundo transparente

  // Professional Preview options
  showZoom?: boolean;
  zoomLevel?: number;           // 50 to 150
  showRuler?: boolean;          // régua em mm
  showSafeMargin?: boolean;     // área segura / margem de corte
  showCutGuide?: boolean;       // guia visual de impressão
}

export interface Company {
  name: string;
  document: string;
  email: string;
  website?: string;
  phone: string;
  logo?: string;
  slogan?: string;
  instagram?: string;
  facebook?: string;
  address: {
    zip: string;
    street: string;
    number: string;
    complement?: string;
    neighborhood: string;
    city: string;
    state: string;
  };
  pixKey?: string;
  pixKeyType?: string;
  pixReceiverName?: string;
}

export interface LocalNetworkStatus {
  isActive: boolean;
  ip: string;
  port: number;
  lastStart: number | null;
  mode: 'server' | 'client';
  connectionStatus: 'connected' | 'disconnected' | 'connecting' | 'error';
  remoteServer: {
    ip: string;
    port: number;
    deviceName: string;
  } | null;
}

export interface DeliveryMethod {
  id: string;
  name: string;
  description?: string;
  requiresTracking: boolean;
  active: boolean;
  isDefault?: boolean;
}

export interface Printer {
  id: string;
  name: string;
  type: 'comum' | 'termica' | 'etiqueta' | 'pdf_manual' | 'bluetooth';
  origin: 'detectada' | 'manual' | 'os';
  status: 'ativa' | 'inativa' | 'sem_teste';
  compatibilities: string[];
  manufacturer?: string;
  config?: {
    driverPaperWidth?: number;
    driverPaperHeight?: number;
    safeMode?: boolean;
    isDefault?: boolean;
    mediaOptions?: string[];
    mediaTypes?: string[];
    qualities?: string[];
  };
  createdAt: number;
  updatedAt: number;
}

export interface PaperSizeERP {
  id: string;
  name: string;
  widthMm: number;
  heightMm: number;
  defaultOrientation: 'portrait' | 'landscape';
  defaultMarginMm: number;
  defaultScale: number;
  type: 'folha' | 'etiqueta' | 'bobina';
}

export interface PaperDriverMapping {
  id: string;
  printerId: string;
  paperErpId: string;
  driverPaperName: string;
  widthMm?: number;
  heightMm?: number;
  orientation: 'portrait' | 'landscape';
  marginMm: number;
  scale: number;
  safeMode: boolean;
  mediaOrigin?: 'driver' | 'manual';
  createdAt?: number;
  updatedAt?: number;
}

export interface DocumentPrintConfig {
  documentId: 'thermal_receipt' | 'order_ticket' | 'customer_experience' | 'labels' | 'bulk_labels' | 'cracha';
  documentName: string;
  printerId: string;
  paperErpId: string;
  driverPaperName?: string;
  scale?: number;
  marginMm?: number;
  orientation?: 'portrait' | 'landscape';
  safeModeActive?: boolean;
  pdfManualActive?: boolean;
  updatedAt?: number;
  // Refactoring fields
  documentType?: string;
  printerMode?: 'pdf_manual' | 'physical_printer';
  printerName?: string;
  selectedDriverMediaName?: string;
  margin?: number;
  themeId?: string;
  backgroundTheme?: string;
  watermark?: string;
  mediaType?: string;
  printQuality?: string;
  
  // Advanced Windows/Driver Integration Fields
  printPipeline?: 'electron' | 'windows_advanced';
  copies?: number;
  dpi?: string;
  paperSource?: string;
  colorMode?: 'color' | 'mono' | 'grayscale';
  duplexMode?: 'simplex' | 'duplex' | 'duplex_short' | 'duplex_long';
  advancedModeEnabled?: boolean;
  paperSize?: string;
}

export interface PrintJob {
  id: string;
  documentId: 'thermal_receipt' | 'order_ticket' | 'customer_experience' | 'labels' | 'bulk_labels' | 'cracha';
  documentName: string;
  printerId: string;
  printerName: string;
  paperErpId: string;
  driverPaperName: string;
  createdAt: number;
  status: 'aguardando' | 'gerando_pdf' | 'pronto_para_imprimir' | 'imprimindo' | 'impresso' | 'erro' | 'cancelado';
  errorMessage?: string;
  orientation: 'portrait' | 'landscape';
  marginMm: number;
  scale: number;
  safeMode: boolean;
  pdfUrl?: string;
  payload?: any;
  mediaType?: string;
  printQuality?: string;
  // Advanced Driver Configuration Parameters
  printPipeline?: 'electron' | 'windows_advanced';
  copies?: number;
  dpi?: string;
  paperSource?: string;
  colorMode?: 'color' | 'mono' | 'grayscale';
  duplexMode?: 'simplex' | 'duplex' | 'duplex_short' | 'duplex_long';
  advancedModeEnabled?: boolean;
}

interface AppState {
  // Data
  company: Company;
  printers: Printer[];
  paperSizesERP: PaperSizeERP[];
  paperDriverMappings: PaperDriverMapping[];
  documentPrintConfigs: DocumentPrintConfig[];
  printQueue: PrintJob[];
  receiptConfig: ReceiptConfig;
  orderTicketConfig: OrderTicketConfig;
  labelConfig: LabelConfig;
  labelBatchConfig: LabelConfig;
  badgeConfig: BadgeConfig;
  customerExperienceConfig: CustomerExperienceConfig;
  catalogConfig: CatalogConfig;
  labelBatchItems: { productId: string; quantity: number }[];
  localNetwork: LocalNetworkStatus;
  pendingSyncQueue: { entity: string; recordId: string; operation: 'u' | 'd'; data: any; timestamp: number }[];
  lastSyncAt: number;
  syncStatus: 'idle' | 'syncing' | 'synced' | 'error' | 'conflict';
  setSyncStatus: (status: 'idle' | 'syncing' | 'synced' | 'error' | 'conflict') => void;
  updateLastSyncAt: (timestamp: number) => void;
  clearPendingSyncQueue: (upToTimestamp?: number) => void;
  pushSyncMutation: (entity: string, recordId: string, operation: 'u' | 'd', data?: any) => void;
  applyIncomingSyncChanges: (changes: { [entity: string]: any[] }) => void;
  currentUser: User | null;
  isAuthenticated: boolean;
  pendingWelcome: boolean;
  setPendingWelcome: (pending: boolean) => void;
  firstAccessSetupComplete: boolean;
  setFirstAccessSetupComplete: (complete: boolean) => void;
  hasHydrated: boolean;
  setHasHydrated: (hydrated: boolean) => void;
  isDirty: boolean;
  setIsDirty: (dirty: boolean) => void;
  isDriveDirty: boolean;
  setIsDriveDirty: (dirty: boolean) => void;
  databaseStatus: 'initializing' | 'ready' | 'degraded' | 'error';
  setDatabaseStatus: (status: 'initializing' | 'ready' | 'degraded' | 'error') => void;
  sqliteStatus: 'checking' | 'ready' | 'error' | 'web';
  setSqliteStatus: (status: 'checking' | 'ready' | 'error' | 'web') => void;
  sqliteMigrationPhase2Done?: boolean;
  sqliteMigrationPhase3Done?: boolean;
  sqliteMigrationPhase4Done?: boolean;
  sqliteMigrationPhase5ADone?: boolean;
  sqliteMigrationPhase5BDone?: boolean;
  sqliteMigrationPhase6Done?: boolean;
  sqliteMigrationSafe?: boolean;
  setSQLiteData: (data: Partial<AppState>) => void;
  deleteUser: (id: string) => Promise<{ success: boolean; error?: string }>;
  deleteUserRole: (id: string) => Promise<{ success: boolean; error?: string }>;
  saveSystemListsToSQLite: () => Promise<void>;
  saveMasterCredentialsToSQLite: () => Promise<void>;
  savePrintSettingsToSQLite: () => Promise<void>;
  users: User[];
  userRoles: UserRole[];
  auditLogs: AuditLog[];
  badges: Badge[];
  addBadge: () => Promise<void>;
  addBadgeWithCode: (code: string) => Promise<{ success: boolean; error?: string }>;
  updateBadge: (id: string, badge: Partial<Badge>) => Promise<void>;
  deleteBadge: (id: string) => Promise<void>;
  regenerateBadgeCode: (id: string) => Promise<void>;
  vincularBadge: (badgeId: string, userId: string) => Promise<void>;
  desvincularBadge: (badgeId: string) => Promise<void>;
  authenticateWithBadge: (codigoCracha: string) => Promise<User | null>;
  nfcTags: NFCTag[];
  nfcPresenceRecords: NFCPresenceRecord[];
  terminals: TerminalOperacional[];
  activeTerminalId: string | null;
  addTerminal: (terminal: Omit<TerminalOperacional, 'idTerminal' | 'status' | 'operadorAtualId' | 'operadorAtualName' | 'ultimoOperadorId' | 'ultimoOperadorName'>) => Promise<{ success: boolean; error?: string }>;
  updateTerminal: (idTerminal: string, terminal: Partial<TerminalOperacional>) => Promise<{ success: boolean; error?: string }>;
  deleteTerminal: (idTerminal: string) => Promise<{ success: boolean; error?: string }>;
  setActiveTerminalId: (idTerminal: string | null) => Promise<void>;
  validateTerminalAccess: (idTerminal: string, userId: string) => { success: boolean; error?: string };
  handleTerminalNfcLogin: (idTerminal: string, nfcUid: string) => { success: boolean; error?: string; user?: User };
  addNFCPresenceRecord: (uid: string, tipoEvento: 'ENTRADA' | 'SAIDA' | 'PAUSA' | 'RETORNO' | 'PRESENCA_OPERACIONAL', device?: string) => { success: boolean; error?: string; record?: NFCPresenceRecord };
  handleNFCOperationalAction: (uid: string, context: string, payload?: any) => { success: boolean; error?: string; executorName?: string; executorId?: string };
  addNFCTag: (uid: string, tagLabel?: string, dataExpiracao?: number | null) => Promise<{ success: boolean; error?: string }>;
  updateNFCTag: (id: string, tag: Partial<NFCTag>) => Promise<{ success: boolean; error?: string }>;
  linkNFCTagToUser: (tagId: string, userId: string) => Promise<{ success: boolean; error?: string }>;
  unlinkNFCTagFromUser: (tagId: string) => Promise<{ success: boolean; error?: string }>;
  quarantineNFCTag: (tagId: string, reason?: string) => Promise<{ success: boolean; error?: string }>;
  restoreNFCTag: (tagId: string) => Promise<{ success: boolean; error?: string }>;
  permanentlyDeleteExpiredNFCTags: () => Promise<{ success: boolean; count: number }>;
  masterPassword?: string;
  recoveryMasterPassword?: string;
  setRecoveryMasterPassword: (password: string) => Promise<void>;
  masterAuthorizations: MasterAuthorization[];
  masterBadges: MasterBadge[];
  addMasterAuthorization: (auth: { userId: string; passwordMaster: string; status: 'ativo' | 'inativo'; observation?: string }) => Promise<{ success: boolean; error?: string }>;
  updateMasterAuthorization: (id: string, auth: Partial<MasterAuthorization>) => Promise<void>;
  deleteMasterAuthorization: (id: string) => Promise<void>;
  generateMasterBadge: (authId: string) => Promise<{ success: boolean; error?: string; badge?: MasterBadge }>;
  updateMasterBadgeStatus: (badgeId: string, status: 'ativo' | 'bloqueado') => void;
  deleteMasterBadge: (badgeId: string) => void;
  verifyMasterCredential: (passwordOrToken: string, actionName?: string) => { success: boolean; authorizedUser?: User; method?: 'senha' | 'qrcode'; error?: string };
  verifyMasterNFC: (uid: string, actionName?: string) => { success: boolean; authorizedUser?: User; error?: string };
  addUser: (user: Omit<User, 'id'> & { id?: string }) => Promise<void>;
  updateUser: (id: string, user: Partial<User>) => Promise<void>;
  registerExistingQRCode: (qrCodeId: string, targetUserId: string, forceTransfer?: boolean) => { success: boolean; alreadyExists?: boolean; message: string; userName?: string; userLogin?: string; boundUserId?: string };
  enrollFaceBiometric: (userId: string, data: UserFaceBiometricData) => void;
  removeFaceBiometric: (userId: string) => void;
  addUserRole: (role: Omit<UserRole, 'id'>) => Promise<void>;
  updateUserRole: (id: string, role: Partial<UserRole>) => Promise<void>;
  logAction: (action: Omit<AuditLog, 'id' | 'timestamp' | 'userId' | 'userLogin' | 'userRole'>) => void;
  trackEvent: (params: {
    message: string;
    description?: string;
    module: string;
    actionType: string;
    status?: 'sucesso' | 'bloqueado' | 'erro';
    entityId?: string;
    referenceId?: string;
    previousValue?: string;
    newValue?: string;
    riskLevel?: 'baixo' | 'médio' | 'alto';
    eventType?: 'operational_history' | 'audit_log' | 'both';
  }) => void;
  checkPermission: (module: string, action: keyof RolePermission['actions']) => boolean;
  setMasterPassword: (password: string) => Promise<void>;
  verifyMasterPassword: (password: string) => boolean;
  resetMasterAdminPasswordWithKey: (recoveryKey: string, newPassword: string) => Promise<{ success: boolean; error?: string }>;
  products: Product[];
  clients: Client[];
  paymentMethods: PaymentMethod[];
  sales: Sale[];
  currentCashier: CashierSession | null;
  cashierHistory: CashierSession[];
  activities: Activity[];
  alerts: AIAlert[];
  automations: Automation[];
  nextOrderNumber: number;
  nextPreOrderNumber: number;
  preOrders: PreOrder[];
  financialTransactions: FinancialTransaction[];
  retailers: Retailer[];
  consignmentRemittances: ConsignmentRemittance[];
  returns: ReturnRecord[];
  categories: Category[];
  subcategories: Subcategory[];
  machines: Machine[];
  productionSimulations: ProductionSimulation[];
  materials: Material[];
  productions: ProductionRecipe[];
  productionRuns: ProductionRun[];
  deliveryMethods: DeliveryMethod[];
  tombstones: Tombstone[];
  addTombstone: (entityType: string, entityId: string, deletedBy?: string) => void;

  // Actions
  // Cashier
  openCashier: (amount: number, userName?: string) => void;
  closeCashier: (actualAmount: number, userName?: string, notes?: string) => void;
  autoCloseActiveCashier: (reason: string, nextUser?: any) => void;
  getAvailableCash: () => number;
  isOperationCriticalActive: () => boolean;
  handleUserSwapCheck: (newUser: any) => boolean;
  
  // Sales
  addSale: (sale: Omit<Sale, 'id' | 'timestamp' | 'status' | 'orderNumber'>) => Sale | void;
  updateSaleStatus: (saleId: string, status: Sale['status'], userName?: string, customDescription?: string, bypassValidationConfirm?: boolean) => void;
  updateSale: (saleId: string, data: Partial<Sale>) => void;
  addSaleTimelineEvent: (saleId: string, event: Omit<TimelineEvent, 'id' | 'timestamp'>) => void;
  updatePickedQuantity: (saleId: string, productId: string, quantity: number, userName?: string) => void;
  startSeparation: (saleId: string, pickerId: string, pickerName: string) => void;
  finalizeSeparation: (saleId: string, pickerId: string, pickerName: string, authorizedBy?: string, authMethod?: 'senha_master' | 'qrcode_adm') => void;
  
  // Products
  addProduct: (product: Omit<Product, 'id'>, userName?: string) => void;
  updateProduct: (id: string, product: Partial<Product>, userName?: string) => void;
  deleteProduct: (id: string, userName?: string) => void; 
  
  // Clients
  addClient: (client: Omit<Client, 'id' | 'createdAt' | 'active'>, userName?: string) => void;
  updateClient: (id: string, client: Partial<Client>, userName?: string) => void;

  // Payment Methods
  addPaymentMethod: (method: Omit<PaymentMethod, 'id'>, userName?: string) => Promise<void>;
  updatePaymentMethod: (id: string, method: Partial<PaymentMethod>, userName?: string) => Promise<void>;

  // Activities
  addActivity: (message: string, type: Activity['type'], module: string, userName?: string, entityId?: string) => void;
  
  // AI Alerts
  updateAlertStatus: (id: string, status: AIAlert['status']) => void;
  generateAlerts: () => void;
  addAlert: (alert: Omit<AIAlert, 'id' | 'timestamp'>) => void;
  deleteAlert: (id: string) => void;

  // Automations
  addAutomation: (automation: Omit<Automation, 'id' | 'createdAt' | 'executionsCount'>) => void;
  toggleAutomation: (id: string) => void;
  deleteAutomation: (id: string) => void;
  runAutomations: (trigger: Automation['trigger'], context?: any) => void;

  // Inventory
  updateStock: (productId: string, quantity: number, variationId?: string) => void;

  // Pre-Orders
  addPreOrder: (preOrder: Omit<PreOrder, 'id' | 'orderCode' | 'createdAt' | 'status'>) => void;
  updatePreOrder: (id: string, data: Partial<PreOrder>) => void;
  convertPreOrderToSale: (id: string) => void;

  // Financial
  addTransaction: (transaction: Omit<FinancialTransaction, 'id' | 'code' | 'date'>) => void;
  updateTransaction: (id: string, data: Partial<FinancialTransaction>) => void;

  // Retailers
  addRetailer: (retailer: Omit<Retailer, 'id' | 'createdAt' | 'active'>, userName?: string) => void;
  updateRetailer: (id: string, retailer: Partial<Retailer>, userName?: string) => void;

  // Consignments
  addConsignmentRemittance: (remittance: Omit<ConsignmentRemittance, 'id' | 'timestamp' | 'status'>, userName?: string) => void;
  settleConsignment: (remittanceId: string, settlement: { productId: string; sold: number; returned: number }[], paymentMethodId: string, userName?: string) => void;
  updateConsignmentStatus: (id: string, status: ConsignmentStatus, userName?: string) => void;

  // Categories & Subcategories
  addCategory: (category: Omit<Category, 'id'>) => void;
  updateCategory: (id: string, category: Partial<Category>) => void;
  deleteCategory: (id: string) => void;
  addSubcategory: (subcategory: Omit<Subcategory, 'id'>) => void;
  updateSubcategory: (id: string, subcategory: Partial<Subcategory>) => void;
  deleteSubcategory: (id: string) => void;

  // Production Costs
  addMachine: (machine: Omit<Machine, 'id' | 'active'>) => void;
  updateMachine: (id: string, machine: Partial<Machine>) => void;
  deleteMachine: (id: string) => void;
  saveSimulation: (simulation: Omit<ProductionSimulation, 'id' | 'timestamp'>) => void;
  deleteSimulation: (id: string) => void;

  // Materials & Productions
  addMaterial: (material: Omit<Material, 'id' | 'unitCost' | 'currentQuantity'>, userName?: string) => void;
  updateMaterial: (id: string, material: Partial<Material>, userName?: string) => void;
  deleteMaterial: (id: string, userName?: string) => void;
  addProduction: (production: Omit<ProductionRecipe, 'id' | 'createdAt'>, userName?: string) => void;
  updateProduction: (id: string, production: Partial<ProductionRecipe>, userName?: string) => void;
  deleteProduction: (id: string, userName?: string) => void;
  addProductionRun: (run: Omit<ProductionRun, 'id' | 'createdAt'>, userName?: string) => void;
  deleteProductionRun: (id: string, userName?: string) => void;
  consumeMaterials: (productId: string, quantity: number) => void;

  // Delivery Methods
  addDeliveryMethod: (method: Omit<DeliveryMethod, 'id'>) => Promise<void>;
  updateDeliveryMethod: (id: string, data: Partial<DeliveryMethod>) => Promise<void>;
  deleteDeliveryMethod: (id: string) => Promise<void>;

  // Returns
  addReturn: (returnRecord: Omit<ReturnRecord, 'id' | 'timestamp'>, userName?: string) => void;

  // Company
  updateCompany: (data: Partial<Company>) => Promise<void>;
  updateReceiptConfig: (config: Partial<ReceiptConfig>) => Promise<void>;
  updateOrderTicketConfig: (config: Partial<OrderTicketConfig>) => Promise<void>;
  updateLabelConfig: (config: Partial<LabelConfig>) => Promise<void>;
  updateLabelBatchConfig: (config: Partial<LabelConfig>) => Promise<void>;
  updateBadgeConfig: (config: Partial<BadgeConfig>) => Promise<void>;
  badgeSavedTemplates?: { id: string; name: string; config: BadgeConfig }[];
  addBadgeTemplate?: (name: string, config: BadgeConfig) => Promise<void>;
  deleteBadgeTemplate?: (id: string) => Promise<void>;
  updateCustomerExperienceConfig: (config: Partial<CustomerExperienceConfig>) => Promise<void>;
  updateCatalogConfig: (config: Partial<CatalogConfig>) => Promise<void>;
  updateUserImage: (userId: string, image: string) => void;
  addToLabelBatch: (productId: string) => void;
  updateLabelBatchQuantity: (productId: string, quantity: number) => void;
  removeFromLabelBatch: (productId: string) => void;
  clearLabelBatch: () => void;
  isSettingsOpen: boolean;
  setIsSettingsOpen: (open: boolean) => void;

  // Printer Configuration Actions
  addPrinter: (printer: Omit<Printer, 'id' | 'createdAt' | 'updatedAt'> & { id?: string }) => Promise<void>;
  updatePrinter: (id: string, updates: Partial<Omit<Printer, 'id' | 'createdAt' | 'updatedAt'>>) => Promise<void>;
  deletePrinter: (id: string) => Promise<void>;

  addPaperSizeERP: (paper: Omit<PaperSizeERP, 'id'> & { id?: string }) => Promise<void>;
  updatePaperSizeERP: (id: string, updates: Partial<PaperSizeERP>) => Promise<void>;
  deletePaperSizeERP: (id: string) => Promise<void>;

  savePaperDriverMapping: (mapping: Omit<PaperDriverMapping, 'id'> & { id?: string }) => Promise<void>;
  deletePaperDriverMapping: (id: string) => Promise<void>;

  saveDocumentPrintConfig: (config: DocumentPrintConfig) => Promise<void>;
  addPrintJob: (job: Omit<PrintJob, 'id' | 'createdAt' | 'status'> & { id?: string }) => string;
  updatePrintJobStatus: (id: string, status: PrintJob['status'], errorMessage?: string) => void;
  updatePrintJobPdfUrl: (id: string, pdfUrl: string) => void;
  removePrintJob: (id: string) => void;
  clearPrintQueue: () => void;
  systemVersion: number;
  lastBackupAt: number | null;
  googleDriveBackupEnabled: boolean;
  googleDriveLastSyncAt: number | null;
  setGoogleDriveBackupEnabled: (enabled: boolean) => void;
  setGoogleDriveLastSyncAt: (timestamp: number | null) => void;
  // Navigation
  navigationHistory: string[];
  addToHistory: (path: string) => void;
  clearHistory: () => void;
  // Backup & System
  exportData: () => Promise<string>;
  importData: (data: any) => Promise<{ success: boolean; error?: string }>;
  resetData: (keepSettings?: boolean) => void;
  // Local Auth
  loginLocal: (login: string, password?: string) => boolean;
  loginWithQRCode: (token: string) => boolean;
  loginWithNFC: (uid: string) => { success: boolean; error?: string };
  loginWithFaceBiometric: (userId: string) => boolean;
  logoutLocal: () => void;
  updateUserQRCode: (userId: string) => void;
  logActivity: (message: string) => void;
  activeSettingModule: string | null;
  setActiveSettingModule: (module: string | null) => void;
  badgeSelectedUserId: string | null;
  setBadgeSelectedUserId: (id: string | null) => void;
  activeSubSetting: string | null;
  setActiveSubSetting: (subSetting: string | null) => void;
  updateLocalNetworkStatus: (status: Partial<LocalNetworkStatus>) => void;
  imageThemes: ImageTheme[];
  addImageTheme: (theme: ImageTheme) => void;
  updateImageTheme: (id: string, updates: Partial<ImageTheme>) => void;
  deleteImageTheme: (id: string) => void;
}

const getSessionCurrentUser = (): any => {
  if (typeof window === 'undefined') return null;
  try {
    const saved = localStorage.getItem('currentUser') || sessionStorage.getItem('currentUser');
    return saved ? JSON.parse(saved) : null;
  } catch (e) {
    return null;
  }
};

const getSessionIsAuthenticated = (): boolean => {
  if (typeof window === 'undefined') return false;
  return localStorage.getItem('isAuthenticated') === 'true' || sessionStorage.getItem('isAuthenticated') === 'true';
};

const DEFAULT_BG_STATIONS = [
  {
    id: 'demo-papai',
    name: 'Dia dos Pais',
    backgroundImage: 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="60" height="60" viewBox="0 0 60 60"><path d="M10 20 L30 40 L50 20 L40 10 L30 20 L20 10 Z" fill="none" stroke="%233b82f6" stroke-width="2" stroke-opacity="0.15"/><path d="M30 40 L30 60" fill="none" stroke="%233b82f6" stroke-width="2" stroke-opacity="0.15"/></svg>',
    opacity: 15,
    position: 'center',
    fitMode: 'repeat' as const,
    active: true,
    category: 'standard' as const,
    documents: ['thermal_receipt', 'order_ticket', 'customer_experience'],
    papers: ['a5', 'a6', 'bobina80', 'bobina58'],
  },
  {
    id: 'demo-natal',
    name: 'Natal Mágico',
    backgroundImage: 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 40 40"><polygon points="20,10 25,22 15,22" fill="none" stroke="%2310b981" stroke-width="1.5" stroke-opacity="0.2"/><polygon points="20,16 24,26 16,26" fill="none" stroke="%2310b981" stroke-width="1.5" stroke-opacity="0.2"/><line x1="20" y1="26" x2="20" y2="30" stroke="%23b45309" stroke-width="2" stroke-opacity="0.3"/></svg>',
    opacity: 20,
    position: 'center',
    fitMode: 'repeat' as const,
    active: true,
    category: 'standard' as const,
    documents: ['thermal_receipt', 'order_ticket', 'customer_experience'],
    papers: ['a4', 'a5', 'a6', 'bobina80'],
  },
  {
    id: 'demo-promo',
    name: 'Promoção Especial (Estrela)',
    backgroundImage: 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100" viewBox="0 0 100 100"><polygon points="50,15 61,38 86,38 66,54 73,79 50,64 27,79 34,54 14,38 39,38" fill="none" stroke="%23ef4444" stroke-width="2" stroke-opacity="0.15" /></svg>',
    opacity: 10,
    position: 'center',
    fitMode: 'center' as const,
    active: true,
    category: 'label' as const,
    documents: ['labels', 'bulk_labels'],
    papers: [],
    labelWidth: 50,
    labelHeight: 30
  }
];

const INITIAL_APP_DATA = {
  imageThemes: DEFAULT_BG_STATIONS,
  products: [],
  clients: [],
  paymentMethods: [
    { id: '1', name: 'Dinheiro', type: 'money' as PaymentMethodType, active: true, showInPDV: true, allowsChange: true, fee: 0, receivedDays: 0 },
    { id: '2', name: 'PIX', type: 'pix' as PaymentMethodType, active: true, showInPDV: true, allowsChange: false, fee: 0, receivedDays: 0 },
    { id: '3', name: 'Cartão de Débito', type: 'card_debit' as PaymentMethodType, active: true, showInPDV: true, allowsChange: false, fee: 1.5, receivedDays: 1 },
    { id: '4', name: 'Cartão de Crédito', type: 'card_credit' as PaymentMethodType, active: true, showInPDV: true, allowsChange: false, fee: 2.9, receivedDays: 30 },
  ],
  sales: [],
  currentCashier: null,
  cashierHistory: [],
  activities: [],
  alerts: [],
  automations: [],
  nextOrderNumber: 1,
  nextPreOrderNumber: 1,
  preOrders: [],
  financialTransactions: [],
  retailers: [],
  consignmentRemittances: [],
  returns: [],
  categories: [],
  subcategories: [],
  machines: [],
  productionSimulations: [],
  materials: [],
  productions: [],
  productionRuns: [],
  tombstones: [] as Tombstone[],
  auditLogs: [] as AuditLog[],
  sqliteMigrationPhase2Done: false,
  sqliteMigrationPhase3Done: false,
  sqliteMigrationPhase4Done: false,
  sqliteMigrationPhase5ADone: false,
  sqliteMigrationPhase5BDone: false,
  sqliteMigrationPhase6Done: false,
  sqliteMigrationSafe: false,
  pendingSyncQueue: [] as { entity: string; recordId: string; operation: 'u' | 'd'; data: any; timestamp: number }[],
  lastSyncAt: 0,
  syncStatus: 'idle' as 'idle' | 'syncing' | 'synced' | 'error' | 'conflict',
  lastBackupAt: null as number | null,
  googleDriveBackupEnabled: false,
  googleDriveLastSyncAt: null as number | null,
  isDirty: false as boolean,
  isDriveDirty: false as boolean,
  masterPassword: '',
  recoveryMasterPassword: '',
  masterAuthorizations: [] as MasterAuthorization[],
  masterBadges: [] as MasterBadge[],
  firstAccessSetupComplete: false,
  hasHydrated: false,
  databaseStatus: 'initializing' as const,
  sqliteStatus: 'checking' as const,
  deliveryMethods: [
    { id: 'em-maos', name: 'Em mãos', requiresTracking: false, active: true, isDefault: true }
  ],
  printers: [
    {
      id: 'pdf-manual',
      name: 'Salvar como PDF / Envio Manual',
      type: 'pdf_manual' as const,
      origin: 'manual' as const,
      status: 'ativa' as const,
      compatibilities: ['thermal_receipt', 'order_ticket', 'customer_experience', 'labels', 'bulk_labels', 'cracha'],
      createdAt: 1774320000000,
      updatedAt: 1774320000000
    }
  ] as Printer[],
  paperSizesERP: [
    { id: 'A4', name: 'A4 (210x297mm)', widthMm: 210, heightMm: 297, defaultOrientation: 'portrait' as const, defaultMarginMm: 3, defaultScale: 1.0, type: 'folha' as const },
    { id: 'A5', name: 'A5 (148x210mm)', widthMm: 148, heightMm: 210, defaultOrientation: 'portrait' as const, defaultMarginMm: 3, defaultScale: 1.0, type: 'folha' as const },
    { id: 'A6', name: 'A6 (105x148mm)', widthMm: 105, heightMm: 148, defaultOrientation: 'portrait' as const, defaultMarginMm: 3, defaultScale: 1.0, type: 'folha' as const },
    { id: '40x30', name: 'Etiqueta 40x30mm', widthMm: 40, heightMm: 30, defaultOrientation: 'landscape' as const, defaultMarginMm: 0, defaultScale: 1.0, type: 'etiqueta' as const },
    { id: '80mm', name: 'Bobina Térmica 80mm', widthMm: 80, heightMm: 0, defaultOrientation: 'portrait' as const, defaultMarginMm: 2, defaultScale: 1.0, type: 'bobina' as const },
    { id: '58mm', name: 'Bobina Térmica 58mm', widthMm: 58, heightMm: 0, defaultOrientation: 'portrait' as const, defaultMarginMm: 1, defaultScale: 1.0, type: 'bobina' as const }
  ] as PaperSizeERP[],
  paperDriverMappings: [] as PaperDriverMapping[],
  printQueue: [] as PrintJob[],
  documentPrintConfigs: [
    { documentId: 'thermal_receipt' as const, documentName: 'Recibo Térmico', printerId: 'pdf-manual', paperErpId: '80mm', updatedAt: 1774320000000 },
    { documentId: 'order_ticket' as const, documentName: 'Cupom Pedido', printerId: 'pdf-manual', paperErpId: '80mm', updatedAt: 1774320000000 },
    { documentId: 'customer_experience' as const, documentName: 'Mensagem Cliente', printerId: 'pdf-manual', paperErpId: '80mm', updatedAt: 1774320000000 },
    { documentId: 'labels' as const, documentName: 'Etiqueta de Envio', printerId: 'pdf-manual', paperErpId: 'A6', updatedAt: 1774320000000 },
    { documentId: 'bulk_labels' as const, documentName: 'Etiqueta em Lote', printerId: 'pdf-manual', paperErpId: 'A6', updatedAt: 1774320000000 },
    { documentId: 'cracha' as const, documentName: 'Crachá', printerId: 'pdf-manual', paperErpId: 'A6', updatedAt: 1774320000000 }
  ] as DocumentPrintConfig[],
  badges: [] as Badge[],
  nfcTags: [] as NFCTag[],
  nfcPresenceRecords: [] as NFCPresenceRecord[],
  labelBatchItems: [] as any[],
  activeTerminalId: 'term-pdv-1',
  localNetwork: {
    isActive: false,
    ip: '',
    port: 3100,
    lastStart: null,
    mode: 'server' as const,
    connectionStatus: 'disconnected' as const,
    remoteServer: null
  },
  terminals: [
    {
      idTerminal: 'term-pdv-1',
      nomeTerminal: 'Terminal Frente de Caixa 01',
      tipoTerminal: 'PDV',
      setor: 'Frente de Caixa',
      permissoesAceitas: ['admin', 'supervisor', 'operador', 'Caixa', 'GERENTE', 'CAIXA'],
      operadorAtualId: null,
      operadorAtualName: null,
      ultimoOperadorId: null,
      ultimoOperadorName: null,
      status: 'Online',
      dispositivo: 'PDV Desktop #1',
      modoBloqueado: false
    },
    {
      idTerminal: 'term-sep-1',
      nomeTerminal: 'Terminal Expedição & Separação',
      tipoTerminal: 'SEPARACAO',
      setor: 'Expedição',
      permissoesAceitas: ['admin', 'supervisor', 'Separador', 'operador', 'SEPARADOR'],
      operadorAtualId: null,
      operadorAtualName: null,
      ultimoOperadorId: null,
      ultimoOperadorName: null,
      status: 'Online',
      dispositivo: 'Tablet Samsung Active #3',
      modoBloqueado: false
    },
    {
      idTerminal: 'term-adm-1',
      nomeTerminal: 'Terminal Backoffice Gerencial',
      tipoTerminal: 'ADMINISTRATIVO',
      setor: 'Administração',
      permissoesAceitas: ['admin', 'supervisor', 'GERENTE', 'ADMINISTRADOR'],
      operadorAtualId: null,
      operadorAtualName: null,
      ultimoOperadorId: null,
      ultimoOperadorName: null,
      status: 'Online',
      dispositivo: 'Dell Optiplex ADM',
      modoBloqueado: false
    }
  ] as TerminalOperacional[],
};

export const useStore = create<AppState>()(
  persist(
    (rawSet, get) => {
      const set: typeof rawSet = (partial, replace) => {
        const nextState = typeof partial === 'function' ? (partial as any)(get()) : partial;
        
        const isDesktop = typeof window !== 'undefined' && (!!(window as any).electron || navigator.userAgent.toLowerCase().includes('electron'));
        const currentSqliteStatus = get().sqliteStatus;
        const targetSqliteStatus = nextState && nextState.sqliteStatus;

        if (isDesktop && currentSqliteStatus !== 'ready' && targetSqliteStatus !== 'ready' && targetSqliteStatus !== 'error' && currentSqliteStatus !== 'web') {
          // Check if any critical commercial state is being altered
          const criticalKeys = [
            'products', 'clients', 'sales', 'preOrders', 'categories', 'subcategories',
            'materials', 'productions', 'productionRuns', 'returns', 'consignmentRemittances',
            'cashierHistory', 'currentCashier', 'financialTransactions', 'auditLogs', 'activities',
            'nfcPresenceRecords'
          ];
          const isAlteringCritical = criticalKeys.some(key => nextState && nextState[key] !== undefined);
          if (isAlteringCritical) {
            console.error('[SQLite-PROTECTION] Tentativa de alteração de dados comerciais bloqueada! O banco de dados local não está carregado ou pronto (sqliteStatus atual:', currentSqliteStatus, ')');
            // Do not apply state changes for these keys by deleting them
            criticalKeys.forEach(key => {
              if (nextState && nextState[key] !== undefined) {
                delete nextState[key];
              }
            });
          }
        }

        if (nextState && typeof nextState === 'object') {
          if (nextState._skipSyncEnrichment) {
            delete nextState._skipSyncEnrichment;
            rawSet(nextState as any, replace);
            return;
          }

          const syncableKeys = [
            'products', 'clients', 'sales', 'preOrders', 'automations',
            'activities', 'alerts', 'cashierHistory', 'financialTransactions',
            'consignmentRemittances', 'returns', 'userRoles', 'users',
            'badges', 'masterAuthorizations', 'auditLogs', 'tombstones',
            'categories', 'subcategories', 'machines', 'productionSimulations',
            'materials', 'productions', 'productionRuns', 'deliveryMethods', 'retailers'
          ];
          const prevState = get() as any;
          const currentDeviceId = getOrCreateDeviceId();
          const currentUserName = prevState?.currentUser?.fullName || prevState?.currentUser?.login || 'Operador Local';

          for (const key of syncableKeys) {
            if (nextState[key] && Array.isArray(nextState[key])) {
              const prevArr = prevState[key] || [];
              const nextArr = nextState[key];
              const prevMap = new Map(prevArr.map((item: any) => [item?.id, item]));

              let changed = false;
              const enrichedArr = nextArr.map((item: any) => {
                if (!item || !item.id) return item;
                const prevItem = prevMap.get(item.id) as any;

                if (!prevItem) {
                  changed = true;
                  return {
                    ...item,
                    lastUpdated: Date.now(),
                    deviceId: item.deviceId || currentDeviceId,
                    updatedBy: item.updatedBy || currentUserName,
                    syncVersion: item.syncVersion || 1
                  };
                } else {
                  const prevKeys = Object.keys(prevItem).filter(k => !['lastUpdated', 'deviceId', 'updatedBy', 'syncVersion'].includes(k));
                  const itemKeys = Object.keys(item).filter(k => !['lastUpdated', 'deviceId', 'updatedBy', 'syncVersion'].includes(k));
                  
                  let isDifferent = prevKeys.length !== itemKeys.length || !item.lastUpdated;
                  if (!isDifferent) {
                    for (const k of prevKeys) {
                      if (prevItem[k] !== item[k]) {
                        isDifferent = true;
                        break;
                      }
                    }
                  }

                  if (isDifferent) {
                    changed = true;
                    return {
                      ...item,
                      lastUpdated: Date.now(),
                      deviceId: item.deviceId || currentDeviceId,
                      updatedBy: item.updatedBy || currentUserName,
                      syncVersion: (prevItem.syncVersion || 1) + 1
                    };
                  }
                }
                return item;
              });

              if (changed) {
                nextState[key] = enrichedArr;
              }
            }
          }

          // Operational dirty state detection for automated backups
          const dirtyTriggerKeys = [
            'products', 'clients', 'sales', 'preOrders', 'categories', 'subcategories',
            'materials', 'productions', 'productionRuns', 'returns', 'consignmentRemittances',
            'financialTransactions', 'users', 'userRoles', 'badges', 'masterAuthorizations',
            'masterBadges', 'masterPassword', 'deliveryMethods', 'company', 'receiptConfig',
            'orderTicketConfig', 'labelConfig', 'labelBatchConfig', 'badgeConfig',
            'customerExperienceConfig', 'catalogConfig', 'terminals', 'printers', 'nfcTags',
            'machines', 'productionSimulations', 'automations', 'retailers'
          ];
          
          const hasOperationalChanges = dirtyTriggerKeys.some(key => {
            if (nextState && nextState[key] !== undefined) {
              return JSON.stringify(nextState[key]) !== JSON.stringify((get() as any)[key]);
            }
            return false;
          });

          if (hasOperationalChanges) {
            nextState.isDirty = true;
            nextState.isDriveDirty = true;
          }
        }
        rawSet(nextState as any, replace);
      };

      return {
        ...INITIAL_APP_DATA,
      company: {
        name: 'Lukasfe Industrial Ltda',
        document: '00.000.000/0001-00',
        email: 'contato@lukasfe.com.br',
        website: 'www.lukasfe.com.br',
        phone: '(11) 4002-8922',
        slogan: 'Tecnologia Avançada e Soluções Industriais',
        pixKey: '00000000000100',
        pixKeyType: 'cnpj',
        pixReceiverName: 'Lukasfe Industrial Ltda',
        address: {
          zip: '01001-000',
          street: 'Praça da Sé',
          number: '100',
          complement: '',
          neighborhood: 'Sé',
          city: 'São Paulo',
          state: 'SP'
        }
      },
      receiptConfig: {
        paperSize: 'A6',
        visibleFields: {
          logo: true,
          companyName: true,
          address: true,
          client: true,
          document: true,
          phone: true,
          products: true,
          quantities: true,
          price: true,
          discount: true,
          change: true,
          qrCode: true,
          user: true,
          timestamp: true,
          separationStatus: true
        },
        fontSize: 12,
        alignment: 'center' as 'left' | 'center' | 'right',
        spacing: 4,
        showDividers: true,
        centerLogo: true,
        boldTitles: true,
        orientation: 'portrait',
        template: 'commercial',
        themeId: '',
        qrCodeSize: 100,
        printRotation: 0,
        showSafeArea: false,
        copies: 1
      },
      orderTicketConfig: {
        paperSize: '80mm',
        visibleFields: {
          logo: true,
          companyName: true,
          orderNumber: true,
          qrCode: true,
          clientName: false,
          phone: false,
          timestamp: true,
          seller: true, // Will be renamed to "Usuário responsável" in UI
          status: false,
          products: false,
          quantities: false,
          observations: true
        },
        fontSize: 14,
        alignment: 'center',
        spacing: 4,
        showDividers: true,
        orientation: 'portrait',
        template: 'operational',
        themeId: '',
        qrCodeSize: 120,
        printRotation: 0
      },
      labelConfig: {
        paperSize: '40x30',
        visibleFields: {
          name: true,
          sku: true,
          price: true,
          qrCode: true,
          category: false,
          cuttingGuide: false
        },
        fontSize: 10,
        orientation: 'horizontal',
        labelWidth: 40,
        labelHeight: 30,
        horizontalSpacing: 2,
        verticalSpacing: 2,
        marginTop: 2,
        marginBottom: 2,
        marginLeft: 2,
        marginRight: 2,
        showCutLines: true,
        guideOpacity: 0.2,
        previewQuantity: 10,
        columns: 0,
        rows: 0,
        template: 'standard',
        qrCodeSize: 64,
        internalPadding: 4,
        elementSpacing: 3,
        printRotation: 0,
        themeId: '',
        copies: 1,
        customFields: {}
      },
      labelBatchConfig: {
        paperSize: '40x30',
        visibleFields: {
          name: true,
          sku: true,
          price: true,
          qrCode: true,
          category: false,
          cuttingGuide: false
        },
        fontSize: 10,
        orientation: 'horizontal',
        labelWidth: 40,
        labelHeight: 30,
        horizontalSpacing: 2,
        verticalSpacing: 2,
        marginTop: 2,
        marginBottom: 2,
        marginLeft: 2,
        marginRight: 2,
        showCutLines: true,
        guideOpacity: 0.2,
        previewQuantity: 10,
        columns: 0,
        rows: 0,
        template: 'standard',
        qrCodeSize: 64,
        internalPadding: 4,
        elementSpacing: 3,
        printRotation: 0,
        themeId: '',
        copies: 1,
        customFields: {}
      },
      badgeConfig: {
        paperSize: 'A4',
        badgeWidth: 85.6,
        badgeHeight: 54,
        marginTop: 10,
        spacing: 5,
        showCutLines: true,
        showQRCode: true,
        showLogo: true,
        logoSize: 60,
        orientation: 'portrait',
        template: 'corporate',
        qrCodeSize: 60,
        qrCodeSizeBack: 60,
        primaryColor: '#059669', // Emerald 600
        secondaryColor: '#064e3b', // Emerald 950
        accentColor: '#10b981', // Emerald 500
        textColor: '#ffffff',
        backColor: '#064e3b',
        borderColor: 'rgba(0,0,0,0.1)',
        qrContainerColor: '#ffffff',
        gradient: true,
        printRotation: 0,
        showName: true,
        showRole: true,
        showFunction: true,
        showStore: true,
        showSector: true,
        showMatricula: true,
        showPhoto: true,
        cornerStyle: 'v1'
      },
      badgeSavedTemplates: [],
      customerExperienceConfig: {
        paperSize: '80mm',
        header: {
          message: 'Volte sempre!',
          title: 'Obrigado pela sua compra!',
          subtitle: 'Sua escolha faz toda a diferença para nós.'
        },
        footer: {
          message: 'Volte sempre! Acompanhe nossas redes sociais.'
        },
        qrCode: {
          visible: true,
          size: 90,
          alignment: 'center'
        },
        contentQrCode: {
          visible: false,
          size: 90,
          alignment: 'center',
          textAbove: '',
          textBelow: '',
          defaultUrl: ''
        },
        orientation: 'portrait',
        template: 'elegant',
        printRotation: 0,
        customerMessageSocialTitle: 'Siga nossas redes sociais',
        customerInstagram: '',
        customerFacebook: '',
        socials: []
      },
      catalogConfig: {
        storeName: 'Nossa Vitrine',
        storeDescription: 'Confira os nossos produtos disponíveis no catálogo online e faça seu pedido direto pelo WhatsApp!',
        logoUrl: '',
        bannerUrl: '',
        whatsappNumber: '5511999999999',
        whatsappMessageTemplate: 'Olá! Tenho interesse no produto:\n[PRODUTO] - SKU [SKU]\nPreço: [PRECO]',
        themeColor: 'emerald',
        themeMode: 'light',
        showPrices: true,
        hideOutOfStock: false,
        autoUnpublishOnZeroStock: false
      },
      labelBatchItems: [],
      localNetwork: {
        isActive: false,
        ip: '',
        port: 3100,
        lastStart: null,
        mode: 'server',
        connectionStatus: 'disconnected',
        remoteServer: null
      },
      badges: [],
      nfcTags: [],
      nfcPresenceRecords: [],
      terminals: [
        {
          idTerminal: 'term-pdv-1',
          nomeTerminal: 'Terminal Frente de Caixa 01',
          tipoTerminal: 'PDV',
          setor: 'Frente de Caixa',
          permissoesAceitas: ['admin', 'supervisor', 'operador', 'Caixa', 'GERENTE', 'CAIXA'],
          operadorAtualId: null,
          operadorAtualName: null,
          ultimoOperadorId: null,
          ultimoOperadorName: null,
          status: 'Online',
          dispositivo: 'PDV Desktop #1',
          modoBloqueado: false
        },
        {
          idTerminal: 'term-sep-1',
          nomeTerminal: 'Terminal Expedição & Separação',
          tipoTerminal: 'SEPARACAO',
          setor: 'Expedição',
          permissoesAceitas: ['admin', 'supervisor', 'Separador', 'operador', 'SEPARADOR'],
          operadorAtualId: null,
          operadorAtualName: null,
          ultimoOperadorId: null,
          ultimoOperadorName: null,
          status: 'Online',
          dispositivo: 'Tablet Samsung Active #3',
          modoBloqueado: false
        },
        {
          idTerminal: 'term-adm-1',
          nomeTerminal: 'Terminal Backoffice Gerencial',
          tipoTerminal: 'ADMINISTRATIVO',
          setor: 'Administração',
          permissoesAceitas: ['admin', 'supervisor', 'GERENTE', 'ADMINISTRADOR'],
          operadorAtualId: null,
          operadorAtualName: null,
          ultimoOperadorId: null,
          ultimoOperadorName: null,
          status: 'Online',
          dispositivo: 'Dell Optiplex ADM',
          modoBloqueado: false
        }
      ],
      activeTerminalId: 'term-pdv-1',
      users: [
        {
          id: 'admin',
          fullName: 'Administrador Nexa',
          login: 'admin',
          matricula: 'admin',
          password: '1234',
          roleId: 'administrador',
          status: 'ativo',
          isAdmin: true,
          isOwner: true,
          isMasterAdmin: true,
          qrCodeToken: 'admin-initial-token'
        }
      ],
      currentUser: getSessionCurrentUser(),
      isAuthenticated: getSessionIsAuthenticated(),
      pendingWelcome: false,
      userRoles: [
        {
          id: 'administrador',
          name: 'Administrador',
          description: 'Gestor máximo com acesso integral e controle operacional completo',
          status: 'ativo',
          permissions: [
            { module: 'Abrir/Fechar Caixa', actions: { acessar: true, visualizar: true, cadastrar: true, editar: true, excluir: true, cancelar: true, imprimir: true, gerarPDF: true, verValores: true, alterarStatus: true, configurar: true } },
            { module: 'Vender', actions: { acessar: true, visualizar: true, cadastrar: true, editar: true, excluir: true, cancelar: true, imprimir: true, gerarPDF: true, verValores: true, alterarStatus: true, configurar: true } },
            { module: 'Gestão de Pedidos', actions: { acessar: true, visualizar: true, cadastrar: true, editar: true, excluir: true, cancelar: true, imprimir: true, gerarPDF: true, verValores: true, alterarStatus: true, configurar: true } },
            { module: 'Separação', actions: { acessar: true, visualizar: true, cadastrar: true, editar: true, excluir: true, cancelar: true, imprimir: true, gerarPDF: true, verValores: true, alterarStatus: true, configurar: true } },
            { module: 'Entrega', actions: { acessar: true, visualizar: true, cadastrar: true, editar: true, excluir: true, cancelar: true, imprimir: true, gerarPDF: true, verValores: true, alterarStatus: true, configurar: true } },
            { module: 'Estoque', actions: { acessar: true, visualizar: true, cadastrar: true, editar: true, excluir: true, cancelar: true, imprimir: true, gerarPDF: true, verValores: true, alterarStatus: true, configurar: true } },
            { module: 'Clientes', actions: { acessar: true, visualizar: true, cadastrar: true, editar: true, excluir: true, cancelar: true, imprimir: true, gerarPDF: true, verValores: true, alterarStatus: true, configurar: true } },
            { module: 'Experiência do Cliente', actions: { acessar: true, visualizar: true, cadastrar: true, editar: true, excluir: true, cancelar: true, imprimir: true, gerarPDF: true, verValores: true, alterarStatus: true, configurar: true } },
            { module: 'Dashboard', actions: { acessar: true, visualizar: true, cadastrar: true, editar: true, excluir: true, cancelar: true, imprimir: true, gerarPDF: true, verValores: true, alterarStatus: true, configurar: true } },
            { module: 'Financeiro', actions: { acessar: true, visualizar: true, cadastrar: true, editar: true, excluir: true, cancelar: true, imprimir: true, gerarPDF: true, verValores: true, alterarStatus: true, configurar: true } },
            { module: 'Custos de Produção', actions: { acessar: true, visualizar: true, cadastrar: true, editar: true, excluir: true, cancelar: true, imprimir: true, gerarPDF: true, verValores: true, alterarStatus: true, configurar: true } },
            { module: 'Pré-Encomenda', actions: { acessar: true, visualizar: true, cadastrar: true, editar: true, excluir: true, cancelar: true, imprimir: true, gerarPDF: true, verValores: true, alterarStatus: true, configurar: true } },
            { module: 'Devolução', actions: { acessar: true, visualizar: true, cadastrar: true, editar: true, excluir: true, cancelar: true, imprimir: true, gerarPDF: true, verValores: true, alterarStatus: true, configurar: true } },
            { module: 'Central Operacional', actions: { acessar: true, visualizar: true, cadastrar: true, editar: true, excluir: true, cancelar: true, imprimir: true, gerarPDF: true, verValores: true, alterarStatus: true, configurar: true } },
            { module: 'Histórico', actions: { acessar: true, visualizar: true, cadastrar: true, editar: true, excluir: true, cancelar: true, imprimir: true, gerarPDF: true, verValores: true, alterarStatus: true, configurar: true } },
            { module: 'Histórico de Caixa', actions: { acessar: true, visualizar: true, cadastrar: true, editar: true, excluir: true, cancelar: true, imprimir: true, gerarPDF: true, verValores: true, alterarStatus: true, configurar: true } },
            { module: 'Pagamentos', actions: { acessar: true, visualizar: true, cadastrar: true, editar: true, excluir: true, cancelar: true, imprimir: true, gerarPDF: true, verValores: true, alterarStatus: true, configurar: true } },
            { module: 'Auditoria', actions: { acessar: true, visualizar: true, cadastrar: true, editar: true, excluir: true, cancelar: true, imprimir: true, gerarPDF: true, verValores: true, alterarStatus: true, configurar: true } },
            { module: 'Lojistas', actions: { acessar: true, visualizar: true, cadastrar: true, editar: true, excluir: true, cancelar: true, imprimir: true, gerarPDF: true, verValores: true, alterarStatus: true, configurar: true } },
            { module: 'IA Operacional', actions: { acessar: true, visualizar: true, cadastrar: true, editar: true, excluir: true, cancelar: true, imprimir: true, gerarPDF: true, verValores: true, alterarStatus: true, configurar: true } },
            { module: 'Catálogo', actions: { acessar: true, visualizar: true, cadastrar: true, editar: true, excluir: true, cancelar: true, imprimir: true, gerarPDF: true, verValores: true, alterarStatus: true, configurar: true } },
            { module: 'Notificações', actions: { acessar: true, visualizar: true, cadastrar: true, editar: true, excluir: true, cancelar: true, imprimir: true, gerarPDF: true, verValores: true, alterarStatus: true, configurar: true } },
            { module: 'Automação', actions: { acessar: true, visualizar: true, cadastrar: true, editar: true, excluir: true, cancelar: true, imprimir: true, gerarPDF: true, verValores: true, alterarStatus: true, configurar: true } },
            { module: 'Relatório Operacional', actions: { acessar: true, visualizar: true, cadastrar: true, editar: true, excluir: true, cancelar: true, imprimir: true, gerarPDF: true, verValores: true, alterarStatus: true, configurar: true } },
            { module: 'Sincronização Local', actions: { acessar: true, visualizar: true, cadastrar: true, editar: true, excluir: true, cancelar: true, imprimir: true, gerarPDF: true, verValores: true, alterarStatus: true, configurar: true } },
            { module: 'Ajustes', actions: { acessar: true, visualizar: true, cadastrar: true, editar: true, excluir: true, cancelar: true, imprimir: true, gerarPDF: true, verValores: true, alterarStatus: true, configurar: true } },
            { module: 'Usuários e Funções', actions: { acessar: true, visualizar: true, cadastrar: true, editar: true, excluir: true, cancelar: true, imprimir: true, gerarPDF: true, verValores: true, alterarStatus: true, configurar: true } },
            { module: 'Em Produção', actions: { acessar: true, visualizar: true, cadastrar: true, editar: true, excluir: true, cancelar: true, imprimir: true, gerarPDF: true, verValores: true, alterarStatus: true, configurar: true } },
            { module: 'Crachá', actions: { acessar: true, visualizar: true, cadastrar: true, editar: true, excluir: true, cancelar: true, imprimir: true, gerarPDF: true, verValores: true, alterarStatus: true, configurar: true } }
          ]
        },
        {
          id: 'gerente',
          name: 'Gerente',
          description: 'Gestão completa operacional e financeira',
          status: 'ativo',
          permissions: [
            { module: 'Abrir/Fechar Caixa', actions: { acessar: true, visualizar: true, cadastrar: true, editar: true, excluir: false, cancelar: true, imprimir: true, gerarPDF: true, verValores: true, alterarStatus: true, configurar: true } },
            { module: 'Vender', actions: { acessar: true, visualizar: true, cadastrar: true, editar: true, excluir: false, cancelar: true, imprimir: true, gerarPDF: true, verValores: true, alterarStatus: true, configurar: false } },
            { module: 'Gestão de Pedidos', actions: { acessar: true, visualizar: true, cadastrar: true, editar: true, excluir: false, cancelar: true, imprimir: true, gerarPDF: true, verValores: true, alterarStatus: true, configurar: true } },
            { module: 'Separação', actions: { acessar: true, visualizar: true, cadastrar: true, editar: true, excluir: false, cancelar: true, imprimir: true, gerarPDF: true, verValores: true, alterarStatus: true, configurar: false } },
            { module: 'Entrega', actions: { acessar: true, visualizar: true, cadastrar: true, editar: true, excluir: false, cancelar: true, imprimir: true, gerarPDF: true, verValores: true, alterarStatus: true, configurar: false } },
            { module: 'Estoque', actions: { acessar: true, visualizar: true, cadastrar: true, editar: true, excluir: false, cancelar: true, imprimir: true, gerarPDF: true, verValores: true, alterarStatus: true, configurar: true } },
            { module: 'Clientes', actions: { acessar: true, visualizar: true, cadastrar: true, editar: true, excluir: false, cancelar: true, imprimir: true, gerarPDF: true, verValores: true, alterarStatus: true, configurar: false } },
            { module: 'Experiência do Cliente', actions: { acessar: true, visualizar: true, cadastrar: true, editar: true, excluir: false, cancelar: true, imprimir: true, gerarPDF: true, verValores: true, alterarStatus: true, configurar: false } },
            { module: 'Dashboard', actions: { acessar: true, visualizar: true, cadastrar: false, editar: false, excluir: false, cancelar: false, imprimir: true, gerarPDF: true, verValores: true, alterarStatus: false, configurar: false } },
            { module: 'Financeiro', actions: { acessar: true, visualizar: true, cadastrar: true, editar: true, excluir: false, cancelar: true, imprimir: true, gerarPDF: true, verValores: true, alterarStatus: true, configurar: false } },
            { module: 'Custos de Produção', actions: { acessar: true, visualizar: true, cadastrar: true, editar: true, excluir: false, cancelar: true, imprimir: true, gerarPDF: true, verValores: true, alterarStatus: true, configurar: false } },
            { module: 'Pré-Encomenda', actions: { acessar: true, visualizar: true, cadastrar: true, editar: true, excluir: false, cancelar: true, imprimir: true, gerarPDF: true, verValores: true, alterarStatus: true, configurar: false } },
            { module: 'Devolução', actions: { acessar: true, visualizar: true, cadastrar: true, editar: true, excluir: false, cancelar: true, imprimir: true, gerarPDF: true, verValores: true, alterarStatus: true, configurar: false } },
            { module: 'Central Operacional', actions: { acessar: true, visualizar: true, cadastrar: true, editar: true, excluir: false, cancelar: true, imprimir: true, gerarPDF: true, verValores: true, alterarStatus: true, configurar: false } },
            { module: 'Histórico', actions: { acessar: true, visualizar: true, cadastrar: false, editar: false, excluir: false, cancelar: false, imprimir: true, gerarPDF: true, verValores: true, alterarStatus: false, configurar: false } },
            { module: 'Histórico de Caixa', actions: { acessar: true, visualizar: true, cadastrar: false, editar: false, excluir: false, cancelar: false, imprimir: true, gerarPDF: true, verValores: true, alterarStatus: false, configurar: false } },
            { module: 'Pagamentos', actions: { acessar: true, visualizar: true, cadastrar: true, editar: true, excluir: false, cancelar: true, imprimir: true, gerarPDF: true, verValores: true, alterarStatus: true, configurar: false } },
            { module: 'Auditoria', actions: { acessar: true, visualizar: true, cadastrar: false, editar: false, excluir: false, cancelar: false, imprimir: true, gerarPDF: true, verValores: true, alterarStatus: false, configurar: false } },
            { module: 'Lojistas', actions: { acessar: true, visualizar: true, cadastrar: true, editar: true, excluir: false, cancelar: true, imprimir: true, gerarPDF: true, verValores: true, alterarStatus: true, configurar: false } },
            { module: 'IA Operacional', actions: { acessar: true, visualizar: true, cadastrar: true, editar: true, excluir: false, cancelar: true, imprimir: true, gerarPDF: true, verValores: true, alterarStatus: true, configurar: true } },
            { module: 'Catálogo', actions: { acessar: true, visualizar: true, cadastrar: true, editar: true, excluir: false, cancelar: true, imprimir: true, gerarPDF: true, verValores: true, alterarStatus: true, configurar: false } },
            { module: 'Notificações', actions: { acessar: true, visualizar: true, cadastrar: true, editar: true, excluir: false, cancelar: true, imprimir: true, gerarPDF: true, verValores: true, alterarStatus: true, configurar: false } },
            { module: 'Automação', actions: { acessar: true, visualizar: true, cadastrar: true, editar: true, excluir: false, cancelar: true, imprimir: true, gerarPDF: true, verValores: true, alterarStatus: true, configurar: true } },
            { module: 'Relatório Operacional', actions: { acessar: true, visualizar: true, cadastrar: false, editar: false, excluir: false, cancelar: false, imprimir: true, gerarPDF: true, verValores: true, alterarStatus: false, configurar: false } },
            { module: 'Sincronização Local', actions: { acessar: true, visualizar: true, cadastrar: true, editar: true, excluir: false, cancelar: true, imprimir: true, gerarPDF: true, verValores: true, alterarStatus: true, configurar: false } }
          ]
        },
        {
          id: 'caixa',
          name: 'Caixa',
          description: 'Operação de PDV e recebimentos',
          status: 'ativo',
          permissions: [
            { module: 'Abrir/Fechar Caixa', actions: { acessar: true, visualizar: true, cadastrar: true, editar: false, excluir: false, cancelar: false, imprimir: true, gerarPDF: false, verValores: true, alterarStatus: true, configurar: false } },
            { module: 'Vender', actions: { acessar: true, visualizar: true, cadastrar: true, editar: true, excluir: false, cancelar: true, imprimir: true, gerarPDF: true, verValores: true, alterarStatus: true, configurar: false } },
            { module: 'Clientes', actions: { acessar: true, visualizar: true, cadastrar: true, editar: true, excluir: false, cancelar: false, imprimir: false, gerarPDF: false, verValores: false, alterarStatus: false, configurar: false } },
            { module: 'Devolução', actions: { acessar: true, visualizar: true, cadastrar: true, editar: false, excluir: false, cancelar: false, imprimir: true, gerarPDF: false, verValores: false, alterarStatus: true, configurar: false } }
          ]
        },
        {
          id: 'separador',
          name: 'Separador',
          description: 'Responsável pela separação e conferência de pedidos',
          status: 'ativo',
          permissions: [
            { module: 'Separação', actions: { acessar: true, visualizar: true, cadastrar: true, editar: true, excluir: false, cancelar: false, imprimir: true, gerarPDF: true, verValores: false, alterarStatus: true, configurar: false } }
          ]
        },
        {
          id: 'estoquista',
          name: 'Estoquista',
          description: 'Gestão de inventário e movimentações de estoque',
          status: 'ativo',
          permissions: [
            { module: 'Estoque', actions: { acessar: true, visualizar: true, cadastrar: true, editar: true, excluir: true, cancelar: false, imprimir: true, gerarPDF: true, verValores: true, alterarStatus: true, configurar: false } }
          ]
        },
        {
          id: 'entregador',
          name: 'Entregador',
          description: 'Expedição, rotas e logística física de entregas',
          status: 'ativo',
          permissions: [
            { module: 'Entrega', actions: { acessar: true, visualizar: true, cadastrar: false, editar: true, excluir: false, cancelar: false, imprimir: true, gerarPDF: true, verValores: false, alterarStatus: true, configurar: false } },
            { module: 'Histórico', actions: { acessar: true, visualizar: true, cadastrar: false, editar: false, excluir: false, cancelar: false, imprimir: false, gerarPDF: false, verValores: false, alterarStatus: false, configurar: false } }
          ]
        },
        {
          id: 'lojista',
          name: 'Lojista',
          description: 'Acesso para lojistas parceiros consultarem estoque e catálogo',
          status: 'ativo',
          permissions: [
            { module: 'Lojistas', actions: { acessar: true, visualizar: true, cadastrar: false, editar: false, excluir: false, cancelar: false, imprimir: false, gerarPDF: false, verValores: false, alterarStatus: false, configurar: false } },
            { module: 'Catálogo', actions: { acessar: true, visualizar: true, cadastrar: false, editar: false, excluir: false, cancelar: false, imprimir: true, gerarPDF: true, verValores: false, alterarStatus: false, configurar: false } }
          ]
        },
        {
          id: 'atendimento',
          name: 'Atendimento',
          description: 'Cadastro de clientes e suporte operacional de vendas',
          status: 'ativo',
          permissions: [
            { module: 'Clientes', actions: { acessar: true, visualizar: true, cadastrar: true, editar: true, excluir: false, cancelar: false, imprimir: false, gerarPDF: false, verValores: false, alterarStatus: false, configurar: false } },
            { module: 'Catálogo', actions: { acessar: true, visualizar: true, cadastrar: false, editar: false, excluir: false, cancelar: false, imprimir: true, gerarPDF: true, verValores: false, alterarStatus: false, configurar: false } }
          ]
        },
        {
          id: 'admin_totem',
          name: 'Administrador Totem',
          description: 'Gestor do Totem - controle total de catálogo, pagamentos e abertura/fechamento do kiosk',
          status: 'ativo',
          permissions: [
            { module: 'PDV Totem', actions: { acessar: true, visualizar: true, cadastrar: true, editar: true, excluir: true, cancelar: true, imprimir: true, gerarPDF: true, verValores: true, alterarStatus: true, configurar: true } },
            { module: 'Vender', actions: { acessar: true, visualizar: true, cadastrar: true, editar: true, excluir: true, cancelar: true, imprimir: true, gerarPDF: true, verValores: true, alterarStatus: true, configurar: true } },
            { module: 'Clientes', actions: { acessar: true, visualizar: true, cadastrar: true, editar: true, excluir: true, cancelar: true, imprimir: true, gerarPDF: true, verValores: true, alterarStatus: true, configurar: true } },
            { module: 'Catálogo', actions: { acessar: true, visualizar: true, cadastrar: true, editar: true, excluir: true, cancelar: true, imprimir: true, gerarPDF: true, verValores: true, alterarStatus: true, configurar: true } }
          ]
        },
        {
          id: 'operador_totem',
          name: 'Operador Totem',
          description: 'Operador do Totem - visualização de painel, monitoramento e aprovação de pagamentos',
          status: 'ativo',
          permissions: [
            { module: 'PDV Totem', actions: { acessar: true, visualizar: true, cadastrar: false, editar: false, excluir: false, cancelar: false, imprimir: true, gerarPDF: false, verValores: true, alterarStatus: true, configurar: false } },
            { module: 'Vender', actions: { acessar: true, visualizar: true, cadastrar: true, editar: true, excluir: false, cancelar: true, imprimir: true, gerarPDF: true, verValores: true, alterarStatus: true, configurar: false } },
            { module: 'Clientes', actions: { acessar: true, visualizar: true, cadastrar: true, editar: true, excluir: false, cancelar: false, imprimir: false, gerarPDF: false, verValores: false, alterarStatus: false, configurar: false } },
            { module: 'Catálogo', actions: { acessar: true, visualizar: true, cadastrar: false, editar: false, excluir: false, cancelar: false, imprimir: true, gerarPDF: true, verValores: false, alterarStatus: false, configurar: false } }
          ]
        }
      ],
      auditLogs: [],
      masterPassword: '',
      masterAuthorizations: [],
      masterBadges: [],
      products: [],
      clients: [],
      paymentMethods: [
        { id: '1', name: 'Dinheiro', type: 'money', active: true, showInPDV: true, allowsChange: true, fee: 0, receivedDays: 0 },
        { id: '2', name: 'PIX', type: 'pix', active: true, showInPDV: true, allowsChange: false, fee: 0, receivedDays: 0 },
        { id: '3', name: 'Cartão de Débito', type: 'card_debit', active: true, showInPDV: true, allowsChange: false, fee: 1.5, receivedDays: 1 },
        { id: '4', name: 'Cartão de Crédito', type: 'card_credit', active: true, showInPDV: true, allowsChange: false, fee: 2.9, receivedDays: 30 },
      ],
      sales: [],
      currentCashier: null,
      cashierHistory: [],
      activities: [
        { id: '1', message: 'Sistema iniciado', timestamp: Date.now(), type: 'auth' }
      ],
      alerts: [],
  automations: [
    { 
      id: '1', 
      name: 'Auto-Separação', 
      description: 'Move para logística quando pago', 
      trigger: 'pedido_pago', 
      action: 'enviar_para_separacao', 
      status: 'active', 
      createdAt: Date.now(), 
      executionsCount: 0 
    }
  ],
  nextOrderNumber: 1,
  nextPreOrderNumber: 1,
  preOrders: [],
  financialTransactions: [],
  retailers: [],
  consignmentRemittances: [],
  returns: [],
  categories: [
    { id: '1', name: 'Vestuário', active: true, color: '#f59e0b' },
    { id: '2', name: 'Acessórios', active: true, color: '#10b981' },
    { id: '3', name: 'Calçados', active: true, color: '#3b82f6' }
  ],
  subcategories: [
    { id: '1', categoryId: '1', name: 'Camisetas', active: true },
    { id: '2', categoryId: '1', name: 'Calças', active: true },
    { id: '3', categoryId: '2', name: 'Relógios', active: true },
    { id: '4', categoryId: '3', name: 'Tênis', active: true }
  ],
  systemVersion: 2,
  navigationHistory: [],
  machines: [
    { id: '1', name: 'Impressora 3D - M5S Pro', price: 3500, wearRate: 0.05, fixedCost: 2.00, active: true },
    { id: '2', name: 'Impressora de Papel - HP Smart', price: 1200, wearRate: 0.01, fixedCost: 0.50, active: true }
  ],
  productionSimulations: [],
  materials: [],
  productions: [],
  productionRuns: [],
  activeSettingModule: null,
  badgeSelectedUserId: null,
  activeSubSetting: null,
  isSettingsOpen: false,
  setActiveSettingModule: (module) => set({ activeSettingModule: module, activeSubSetting: null }),
  setBadgeSelectedUserId: (id) => set({ badgeSelectedUserId: id }),
  setActiveSubSetting: (subSetting) => set({ activeSubSetting: subSetting }),
  setIsSettingsOpen: (open) => set({ isSettingsOpen: open }),
  setPendingWelcome: (pending) => set({ pendingWelcome: pending }),
  setFirstAccessSetupComplete: (complete) => set({ firstAccessSetupComplete: complete }),
  setHasHydrated: (hydrated) => set({ hasHydrated: hydrated }),
  setIsDirty: (dirty) => set({ isDirty: dirty }),
  setIsDriveDirty: (dirty) => set({ isDriveDirty: dirty }),
  setDatabaseStatus: (status) => {
    console.log(`[STORAGE] Database status modified to: ${status}`);
    set({ databaseStatus: status });
  },
  setSqliteStatus: (status) => {
    console.log(`[STORAGE] SQLite status modified to: ${status}`);
    set({ sqliteStatus: status });
  },
  setSQLiteData: (data) => {
    console.info('[SQLite-AUDIT] Executando setSQLiteData para carregar dados do banco no Zustand...');
    console.info('[SQLite-AUDIT] Propriedades sendo atualizadas:', Object.keys(data));
    
    // Protection: Let's not let SQLite empty lists overwrite what we had if status is error
    const isDesktop = typeof window !== 'undefined' && (!!(window as any).electron || navigator.userAgent.toLowerCase().includes('electron'));
    const isError = data.sqliteStatus === 'error' || get().sqliteStatus === 'error';
    
    let sanitizedData = { ...data };
    if (isDesktop && isError) {
      const criticalKeys = [
        'products', 'clients', 'sales', 'preOrders', 'categories', 'subcategories',
        'materials', 'productions', 'productionRuns', 'returns', 'consignmentRemittances',
        'cashierHistory', 'currentCashier', 'financialTransactions', 'auditLogs', 'activities',
        'nfcPresenceRecords'
      ];
      criticalKeys.forEach(key => {
        if (sanitizedData[key] && Array.isArray(sanitizedData[key]) && sanitizedData[key].length === 0) {
          console.warn(`[SQLite-PROTECTION] Impedindo setSQLiteData de sobrescrever '${key}' com array vazio devido ao status de ERRO.`);
          delete sanitizedData[key];
        } else if (sanitizedData[key] === null || sanitizedData[key] === undefined) {
          delete sanitizedData[key];
        }
      });
    }

    Object.entries(sanitizedData).forEach(([key, value]) => {
      if (Array.isArray(value)) {
        console.info(`[SQLite-AUDIT] Carregados para o Zustand: ${value.length} registros da coleção '${key}'.`);
      } else {
        console.info(`[SQLite-AUDIT] Carregado no Zustand: propriedade '${key}' definida como:`, typeof value);
      }
    });

    set(sanitizedData);
    console.info('[SQLite-AUDIT] Hidratação Concluída no Estado do Zustand.');
  },

  deleteUser: async (id) => {
    const isDesktop = typeof window !== 'undefined' && !!(window as any).electron;
    const electronAPI = isDesktop ? (window as any).electron : null;
    if (isDesktop && electronAPI && electronAPI.db) {
      try {
        const success = await electronAPI.db.deleteUser(id);
        if (!success) {
          throw new Error('Falha no SQLite ao excluir usuário.');
        }
      } catch (err: any) {
        console.error('[SQLite] deleteUser error:', err);
        throw new Error(`[SQLite] Falha ao deletar usuário: ${err.message || err}`);
      }
    }
    set((state) => ({
      users: state.users.filter(u => u.id !== id)
    }));
    get().logAction({
      module: 'Usuários e Funções',
      actionType: 'delete',
      action: 'Deletar Usuário',
      description: `Usuário ID: ${id} deletado.`,
      status: 'sucesso',
      riskLevel: 'médio',
      affectedEntity: 'Usuário',
      entityId: id
    });
    return { success: true };
  },

  deleteUserRole: async (id) => {
    const isDesktop = typeof window !== 'undefined' && !!(window as any).electron;
    const electronAPI = isDesktop ? (window as any).electron : null;
    if (isDesktop && electronAPI && electronAPI.db) {
      try {
        const success = await electronAPI.db.deletePermission(id);
        if (!success) {
          throw new Error('Falha no SQLite ao excluir grupo de permissões.');
        }
      } catch (err: any) {
        console.error('[SQLite] deleteUserRole error:', err);
        throw new Error(`[SQLite] Falha ao deletar grupo de permissões: ${err.message || err}`);
      }
    }
    set((state) => ({
      userRoles: state.userRoles.filter(r => r.id !== id)
    }));
    get().logAction({
      module: 'Usuários e Funções',
      actionType: 'delete',
      action: 'Deletar Função/Grupo Permissões',
      description: `Grupo de permissões ID: ${id} excluído.`,
      status: 'sucesso',
      riskLevel: 'médio',
      affectedEntity: 'Grupo de Permissões',
      entityId: id
    });
    return { success: true };
  },

  saveSystemListsToSQLite: async () => {
    const isDesktop = typeof window !== 'undefined' && !!(window as any).electron;
    const electronAPI = isDesktop ? (window as any).electron : null;
    if (isDesktop && electronAPI && electronAPI.db) {
      const state = get();
      try {
        const success = await electronAPI.db.insertSystemSetting({
          id: 'system_lists',
          badges: state.badges || [],
          nfcTags: state.nfcTags || [],
          paymentMethods: state.paymentMethods || [],
          deliveryMethods: state.deliveryMethods || []
        });
        if (!success) {
          throw new Error('Falha no SQLite ao persistir listas do sistema.');
        }
      } catch (err: any) {
        console.error('[SQLite] saveSystemListsToSQLite error:', err);
        throw new Error(`[SQLite] Falha ao persistir listas do sistema: ${err.message || err}`);
      }
    }
  },

  saveMasterCredentialsToSQLite: async () => {
    const isDesktop = typeof window !== 'undefined' && !!(window as any).electron;
    const electronAPI = isDesktop ? (window as any).electron : null;
    if (isDesktop && electronAPI && electronAPI.db) {
      const state = get();
      try {
        const success = await electronAPI.db.insertSystemSetting({
          id: 'master_credentials',
          masterPassword: state.masterPassword || '',
          recoveryMasterPassword: state.recoveryMasterPassword || '',
          masterAuthorizations: state.masterAuthorizations || [],
          masterBadges: state.masterBadges || []
        });
        if (!success) {
          throw new Error('Falha no SQLite ao persistir credenciais master.');
        }
      } catch (err: any) {
        console.error('[SQLite] saveMasterCredentialsToSQLite error:', err);
        throw new Error(`[SQLite] Falha ao persistir credenciais master: ${err.message || err}`);
      }
    }
  },

  savePrintSettingsToSQLite: async () => {
    const isDesktop = typeof window !== 'undefined' && !!(window as any).electron;
    const electronAPI = isDesktop ? (window as any).electron : null;
    if (isDesktop && electronAPI && electronAPI.db) {
      const state = get();
      try {
        const success = await electronAPI.db.insertPrintSetting({
          id: 'print_configs_bundle',
          printers: state.printers || [],
          paperSizesERP: state.paperSizesERP || [],
          paperDriverMappings: state.paperDriverMappings || [],
          documentPrintConfigs: state.documentPrintConfigs || [],
          receiptConfig: state.receiptConfig || {},
          orderTicketConfig: state.orderTicketConfig || {},
          labelConfig: state.labelConfig || {},
          labelBatchConfig: state.labelBatchConfig || {},
          badgeConfig: state.badgeConfig || {},
          customerExperienceConfig: state.customerExperienceConfig || {},
          catalogConfig: state.catalogConfig || {}
        });
        if (!success) {
          throw new Error('Falha no SQLite ao persistir configurações de impressão.');
        }
        if (electronAPI.db.insertPdvTotemSetting) {
          await electronAPI.db.insertPdvTotemSetting({
            id: 'pdv_totem_settings',
            totemCatalog: state.catalogConfig || {}
          });
        }
      } catch (err: any) {
        console.error('[SQLite] savePrintSettingsToSQLite error:', err);
        throw new Error(`[SQLite] Falha ao persistir configurações de impressão: ${err.message || err}`);
      }
    }
  },

  updateLocalNetworkStatus: (status) => set((state) => ({ 
    localNetwork: { ...state.localNetwork, ...status } 
  })),
  addImageTheme: (theme) => set((state) => ({
    imageThemes: [...(state.imageThemes || []), theme]
  })),
  updateImageTheme: (id, updates) => set((state) => ({
    imageThemes: (state.imageThemes || []).map(t => t.id === id ? { ...t, ...updates } : t)
  })),
  deleteImageTheme: (id) => set((state) => {
    const nextState: any = {
      imageThemes: (state.imageThemes || []).filter(t => t.id !== id)
    };
    if (state.receiptConfig && state.receiptConfig.themeId === id) {
      nextState.receiptConfig = { ...state.receiptConfig, themeId: undefined };
    }
    if (state.customerExperienceConfig && state.customerExperienceConfig.themeId === id) {
      nextState.customerExperienceConfig = { ...state.customerExperienceConfig, themeId: undefined };
    }
    if (state.orderTicketConfig && state.orderTicketConfig.themeId === id) {
      nextState.orderTicketConfig = { ...state.orderTicketConfig, themeId: undefined };
    }
    if (state.labelConfig) {
      const updatedLabelConfig = { ...state.labelConfig };
      let changed = false;
      if (updatedLabelConfig.themeId === id) {
        updatedLabelConfig.themeId = undefined;
        changed = true;
      }
      if (updatedLabelConfig.batchThemeId === id) {
        updatedLabelConfig.batchThemeId = undefined;
        changed = true;
      }
      if (changed) {
        nextState.labelConfig = updatedLabelConfig;
      }
    }
    return nextState;
  }),

  // Navigation
  addToHistory: (path) => set((state) => {
    const len = state.navigationHistory.length;
    if (len === 0) {
      return { navigationHistory: [path] };
    }
    const lastPath = state.navigationHistory[len - 1];
    if (lastPath === path) return state;
    
    // If it's the home page, reset history to root.
    if (path === '/') {
      return { navigationHistory: ['/'] };
    }

    // Check if we are moving backward in history to pop the last page
    if (len >= 2 && state.navigationHistory[len - 2] === path) {
      return { navigationHistory: state.navigationHistory.slice(0, len - 1) };
    }

    return { 
      navigationHistory: [...state.navigationHistory, path] 
    };
  }),
  clearHistory: () => set({ navigationHistory: ['/'] }),

  addTombstone: (entityType, entityId, deletedBy) => {
    const deviceId = getOrCreateDeviceId();
    const currentUserName = deletedBy || get().currentUser?.fullName || get().currentUser?.login || 'Operador Local';
    const tombstone: Tombstone = {
      id: generateUUID(),
      entityType,
      entityId,
      deletedAt: new Date().toISOString(),
      deletedBy: currentUserName,
      deviceId,
      syncVersion: 1,
      lastUpdated: Date.now()
    };

    const isDesktop = typeof window !== 'undefined' && !!(window as any).electron;
    const electronAPI = isDesktop ? (window as any).electron : null;
    if (isDesktop && electronAPI && electronAPI.db) {
      electronAPI.db.insertTombstone(tombstone).catch((err: any) => {
        console.error('[SQLite] insertTombstone error in addTombstone:', err);
      });
    }

    set((state) => ({
      tombstones: [...(state.tombstones || []), tombstone]
    }));
    get().pushSyncMutation('tombstones', tombstone.id, 'u', tombstone);
  },

  // Cashier Actions
  openCashier: (amount, userName = 'Administrator') => {
    const deviceId = getOrCreateDeviceId();
    const terminalId = get().activeTerminalId || null;
    const newSession: CashierSession = {
      id: generateUUID(),
      status: 'open',
      openingBalance: amount,
      openingTime: Date.now(),
      totalSales: 0,
      paymentMethodTotals: {},
      openedBy: userName,
      deviceId,
      terminalId
    };
    const isDesktop = typeof window !== 'undefined' && !!(window as any).electron;
    const electronAPI = isDesktop ? (window as any).electron : null;
    if (isDesktop && electronAPI && electronAPI.db) {
      electronAPI.db.insertCashierSession(newSession).catch((err: any) => console.error('[SQLite] openCashier error:', err));
    }

    set({ currentCashier: newSession });
    get().addActivity(`Caixa aberto com R$ ${amount.toFixed(2)}`, 'cashier', 'Financeiro', userName, newSession.id);
    get().logAction({ module: 'Financeiro', actionType: 'other', description: `Abertura de Caixa - Valor: R$ ${amount.toFixed(2)}`, status: 'sucesso', referenceId: newSession.id });
    
    // Financial Transaction for Opening
    get().addTransaction({
      type: 'entrada',
      category: 'Abertura de Caixa',
      description: `Abertura de Caixa - Sessão #${newSession.id.substring(0, 4)}`,
      value: amount,
      status: 'pago',
      origin: 'caixa',
      originId: newSession.id
    });
  },

  closeCashier: (actualAmount, userName = 'Administrator', notes) => {
    const { currentCashier, financialTransactions, paymentMethods } = get();
    if (!currentCashier) return;

    const expectedClosingBalance = calculateExpectedCashDrawerBalance(currentCashier, financialTransactions, paymentMethods);

    const closedSession: CashierSession = {
      ...currentCashier,
      status: 'closed',
      closingTime: Date.now(),
      expectedClosingBalance,
      actualClosingBalance: actualAmount,
      notes,
      closedBy: userName
    };

    const isDesktop = typeof window !== 'undefined' && !!(window as any).electron;
    const electronAPI = isDesktop ? (window as any).electron : null;
    if (isDesktop && electronAPI && electronAPI.db) {
      electronAPI.db.insertCashierSession(closedSession).catch((err: any) => console.error('[SQLite] closeCashier error:', err));
    }

    set((state) => ({
      currentCashier: null,
      cashierHistory: [closedSession, ...state.cashierHistory]
    }));
    
    const diff = safeSubtract(actualAmount, expectedClosingBalance);

    get().addActivity(`Caixa fechado. Total esperado (dinheiro): R$ ${expectedClosingBalance.toFixed(2)} (Contado: R$ ${actualAmount.toFixed(2)})`, 'cashier', 'Financeiro', userName, currentCashier.id);
    get().logAction({ 
      module: 'Financeiro', 
      actionType: 'other', 
      action: 'Fechamento de Caixa',
      description: `Fechamento de Caixa por ${userName}. Diferença de saldo: R$ ${diff.toFixed(2)}`, 
      status: 'sucesso', 
      referenceId: currentCashier.id,
      affectedEntity: 'Caixa',
      entityId: currentCashier.id,
      previousValue: `Esperado: R$ ${expectedClosingBalance.toFixed(2)}`,
      newValue: `Fechamento: R$ ${actualAmount.toFixed(2)}`
    });

    // Financial Transaction for Closure (record if there was a difference)
    if (diff !== 0) {
      get().addTransaction({
        type: diff > 0 ? 'entrada' : 'saida',
        category: 'Ajuste de Caixa',
        description: `Diferença no Fechamento - Sessão #${currentCashier.id.substring(0, 4)}`,
        value: Math.abs(diff),
        status: 'pago',
        origin: 'caixa',
        originId: currentCashier.id,
        notes: notes
      });
    }
  },

  autoCloseActiveCashier: (reason, nextUser) => {
    const { currentCashier, financialTransactions, paymentMethods, currentUser } = get();
    if (!currentCashier) return;

    const expectedClosingBalance = calculateExpectedCashDrawerBalance(currentCashier, financialTransactions, paymentMethods);
    const userName = currentUser?.fullName || currentUser?.login || 'Operador';
    const nextUserName = nextUser ? (nextUser.fullName || nextUser.login) : '';

    const observationNote = `Fechamento automático por ${reason}${nextUserName ? ` (Troca para ${nextUserName})` : ''}. Saldo contado assumido como saldo esperado por ausência de conferência manual.`;

    const closedSession: CashierSession = {
      ...currentCashier,
      status: 'closed',
      closingTime: Date.now(),
      expectedClosingBalance,
      actualClosingBalance: expectedClosingBalance,
      notes: observationNote,
      closedBy: userName
    };

    set((state) => ({
      currentCashier: null,
      cashierHistory: [closedSession, ...state.cashierHistory]
    }));

    get().addActivity(
      `Caixa fechado automaticamente (${reason}). Esperado: R$ ${expectedClosingBalance.toFixed(2)}.`,
      'cashier',
      'Financeiro',
      userName,
      currentCashier.id
    );

    get().logAction({
      module: 'Financeiro',
      actionType: 'other',
      action: 'Fechamento Automático de Caixa',
      description: `Caixa aberto por ${currentCashier.openedBy || 'anterior'} foi fechado automaticamente devido a: ${reason}.` +
        (nextUserName ? ` Operador de saída: ${userName} foi substituído por ${nextUserName}.` : ` Operador de saída: ${userName}.`),
      status: 'sucesso',
      referenceId: currentCashier.id,
      affectedEntity: 'Caixa',
      entityId: currentCashier.id,
      previousValue: `Esperado: R$ ${expectedClosingBalance.toFixed(2)}`,
      newValue: `Fechamento Automático: R$ ${expectedClosingBalance.toFixed(2)}`
    });
  },

  getAvailableCash: () => {
    const { currentCashier, financialTransactions, paymentMethods } = get();
    return calculateExpectedCashDrawerBalance(currentCashier, financialTransactions, paymentMethods);
  },

  isOperationCriticalActive: () => {
    const state = get();
    const hasActivePicking = state.currentUser
      ? state.sales.some(s => s.status === 'em_separacao' && (s as any).pickerId === state.currentUser?.id)
      : false;

    return (
      (window as any).pdvCartLength > 0 ||
      (window as any).isPaymentOpen === true ||
      hasActivePicking ||
      (window as any).hasUnsavedChanges === true ||
      (window as any).isBackupRestoreInProgress === true ||
      (window as any).isPrintingCritical === true ||
      (window as any).isCashierOpCritical === true
    );
  },

  handleUserSwapCheck: (newUser) => {
    const previousUser = get().currentUser;
    // Check if we are swapping with a different user
    if (get().isAuthenticated && previousUser && previousUser.id !== newUser.id) {
      if (get().isOperationCriticalActive()) {
        get().logAction({
          module: 'Acesso',
          actionType: 'other',
          action: 'Troca de Operador Bloqueada',
          description: `Tentativa de troca rápida de operador de ${previousUser.fullName} para ${newUser.fullName} foi bloqueada por operação crítica ativa.`,
          status: 'erro'
        });
        return false;
      }
      
      const currentCashier = get().currentCashier;
      if (currentCashier && (currentCashier.openedBy === previousUser.fullName || currentCashier.openedBy === previousUser.login)) {
        get().autoCloseActiveCashier('troca_fast', newUser);
      }
    }
    return true;
  },

  // Sales Actions
  addSale: (saleData) => {
    let currentCashier = get().currentCashier;
    if (!currentCashier) {
      const deviceId = getOrCreateDeviceId();
      const terminalId = get().activeTerminalId || null;
      currentCashier = {
        id: generateUUID(),
        status: 'open',
        openingBalance: 100,
        openingTime: Date.now(),
        totalSales: 0,
        paymentMethodTotals: {},
        openedBy: 'Auto-Totem',
        deviceId,
        terminalId
      };
      set({ currentCashier });
    }

    const { nextOrderNumber } = get();
    const orderNumStr = nextOrderNumber.toString().padStart(4, '0');

    const initialStatus = (saleData as any).status || 'aguardando_separacao';
    const initialEvents: TimelineEvent[] = [
      {
        id: generateUUID(),
        type: 'order',
        timestamp: Date.now(),
        user: saleData.sellerName || 'Sistema',
        description: initialStatus === 'em_producao'
          ? `Pedido encaminhado diretamente para produção`
          : `Pedido criado pelo vendedor ${saleData.sellerName || 'Sistema'}`,
        status: initialStatus,
        icon: 'Archive',
        color: initialStatus === 'em_producao' ? 'text-amber-500 font-bold' : 'text-amber-500'
      },
      {
        id: generateUUID(),
        type: 'payment',
        timestamp: Date.now() + 50,
        user: saleData.sellerName || 'Sistema',
        description: `Pagamento aprovado de R$ ${saleData.total.toFixed(2)} via ${saleData.paymentMethodName}`,
        status: 'aprovado',
        icon: 'CheckCircle2',
        color: 'text-emerald-500'
      }
    ];

    const client = saleData.clientId && saleData.clientId !== 'none'
      ? get().clients.find(c => c.id === saleData.clientId)
      : undefined;

    const frozenItems = (saleData.items || []).map(item => {
      const product = get().products.find(p => p.id === item.id);
      const unitCostAtSale = product ? (product.costPrice ?? 0) : (item.costPrice ?? 0);
      const unitPriceAtSale = item.price ?? 0;
      const quantity = item.quantity ?? 1;

      return {
        ...item,
        pickedQuantity: 0,
        unitCostAtSale,
        totalCostAtSale: safeMultiply(unitCostAtSale, quantity),
        unitPriceAtSale,
        totalPriceAtSale: safeMultiply(unitPriceAtSale, quantity)
      };
    });

    const clientInfo = {
      name: client ? client.name : 'Cliente Consumidor',
      phone: client ? (client.phone || client.whatsapp || '') : '',
      document: client ? (client.document || '123.456.789-00') : '123.456.789-00',
      address: {
        street: client?.address || 'Retirada / Sem Endereço',
        number: '',
        neighborhood: client?.neighborhood || 'Centro',
        city: client?.city || 'Cidade',
        state: client?.state || 'UF',
        zipCode: client?.zip || '00000-000'
      }
    };

    const cupomItems = (frozenItems || []).map(item => ({
      code: item.code || '',
      description: item.name || '',
      qty: item.quantity || 1,
      location: item.location ? `${item.location.aisle || ''}-${item.location.shelf || ''}` : undefined,
      unit: item.unit || 'un'
    }));

    const cupomPedido = {
      orderId: '',
      orderNumber: orderNumStr,
      date: new Date().toLocaleString('pt-BR'),
      sellerName: saleData.sellerName || 'Sistema / PDV',
      deliveryMethod: saleData.deliveryMethodName || 'Retirada em Mãos',
      client: clientInfo,
      items: cupomItems,
      observations: (saleData as any).notes || '',
    };

    const newSale: Sale = {
      ...saleData,
      id: generateUUID(),
      clientName: client ? client.name : 'Cliente Consumidor',
      clientPhone: client ? (client.phone || client.whatsapp || '') : '',
      orderNumber: orderNumStr,
      timestamp: Date.now(),
      status: (saleData as any).status || 'aguardando_separacao',
      items: frozenItems,
      originalItems: JSON.parse(JSON.stringify(frozenItems)),
      originalSubtotal: saleData.subtotal,
      originalTotal: saleData.total,
      timelineEvents: initialEvents,
      cupomPedidoPayload: null as any // Will be set next
    };

    newSale.cupomPedidoPayload = {
      ...cupomPedido,
      orderId: newSale.id
    };

    // Update Cashier
    const updatedCashier = { ...currentCashier };
    updatedCashier.totalSales = safeAdd(updatedCashier.totalSales, newSale.total);
    
    // Distribute payment totals correctly across multiple payment methods if available
    if (newSale.payments && newSale.payments.length > 0) {
      newSale.payments.forEach(p => {
        updatedCashier.paymentMethodTotals[p.methodId] = safeAdd(updatedCashier.paymentMethodTotals[p.methodId] || 0, p.amount);
      });
    } else {
      const methodId = newSale.paymentMethodId;
      if (methodId) {
        updatedCashier.paymentMethodTotals[methodId] = safeAdd(updatedCashier.paymentMethodTotals[methodId] || 0, newSale.total);
      }
    }

    // Deduct cash change (troco em dinheiro) from the cashier total if change exists
    if (newSale.change && newSale.change > 0) {
      const pmList = get().paymentMethods;
      const cashPm = pmList.find(m => m.type === 'money');
      if (cashPm) {
        updatedCashier.paymentMethodTotals[cashPm.id] = safeSubtract(updatedCashier.paymentMethodTotals[cashPm.id] || 0, newSale.change);
      }
    }

    // Financial Transaction
    const pmList = get().paymentMethods;
    const cashPm = pmList.find(m => m.type === 'money');
    const cashPmId = cashPm?.id || 'money';

    const involvesCash = (newSale.payments && newSale.payments.length > 0)
      ? newSale.payments.some(p => p.methodId === cashPmId)
      : (newSale.paymentMethodId === cashPmId);

    const currentDeviceId = getOrCreateDeviceId();
    const currentTerminalId = get().activeTerminalId || null;

    const financialTransaction: FinancialTransaction = {
      id: generateUUID(),
      code: `FIN-V${orderNumStr}`,
      type: 'entrada',
      category: 'Venda PDV',
      description: `Venda #${orderNumStr} - ${newSale.sellerName || 'Sistema'}`,
      value: newSale.total,
      date: Date.now(),
      paymentMethodId: newSale.paymentMethodId,
      paymentMethodName: newSale.paymentMethodName,
      status: 'pago',
      origin: 'venda',
      originId: newSale.id,
      
      // Enriched metadata for multi-terminal audit and sync
      deviceId: currentDeviceId,
      terminalId: currentTerminalId,
      caixaId: currentCashier.id,
      cashMovementType: involvesCash ? 'sale_cash' : undefined,
      syncVersion: 1,
      lastUpdated: Date.now(),
      updatedBy: newSale.sellerName || 'Sistema'
    };

     // Update Stock - Stock is now ONLY updated upon finalization of separation (WMS workflow)
    /* 
    newSale.items.forEach(item => {
      get().updateStock(item.id, -item.quantity);
    });
    */

    const isDesktop = typeof window !== 'undefined' && !!(window as any).electron;
    const electronAPI = isDesktop ? (window as any).electron : null;
    const useSQLite = isDesktop && electronAPI && electronAPI.db;

    if (useSQLite) {
      electronAPI.db.insertSale(newSale).catch((err: any) => {
        console.error('[SQLite] Falha ao registrar venda:', err);
      });
      if (updatedCashier) {
        electronAPI.db.insertCashierSession(updatedCashier).catch((err: any) => {
          console.error('[SQLite] Falha ao registrar sessao de caixa da venda:', err);
        });
      }
      electronAPI.db.insertFinancialTransaction(financialTransaction).catch((err: any) => {
        console.error('[SQLite] Falha ao registrar transação financeira da venda:', err);
      });
    }

    set((state) => ({
      sales: [newSale, ...state.sales],
      currentCashier: updatedCashier,
      nextOrderNumber: state.nextOrderNumber + 1,
      financialTransactions: [financialTransaction, ...state.financialTransactions]
    }));

    get().addActivity(`Pedido ${orderNumStr} criado por ${newSale.sellerName || 'Sistema'}`, 'sale', 'PDV', newSale.sellerName || 'Sistema', newSale.id);
    get().logAction({ 
      module: 'PDV', 
      actionType: 'create', 
      action: 'Pedido Criado',
      description: `Pedido #${orderNumStr} criado por ${newSale.sellerName || 'Sistema'} - Total: R$ ${newSale.total.toFixed(2)}`, 
      status: 'sucesso', 
      referenceId: newSale.id,
      affectedEntity: 'Pedido',
      entityId: newSale.id,
      newValue: `Total: R$ ${newSale.total.toFixed(2)}, Canal: ${newSale.paymentMethodName || 'PDV'}`
    });
    
    if (newSale.discount > 0) {
      get().logAction({
        module: 'Financeiro',
        actionType: 'create',
        action: 'Desconto Aplicado',
        description: `Desconto de R$ ${newSale.discount.toFixed(2)} aplicado no Pedido #${orderNumStr} (original: R$ ${(newSale.total + newSale.discount).toFixed(2)} -> R$ ${newSale.total.toFixed(2)})`,
        status: 'sucesso',
        referenceId: newSale.id,
        affectedEntity: 'Pedido',
        entityId: newSale.id,
        previousValue: `R$ ${(newSale.total + newSale.discount).toFixed(2)}`,
        newValue: `R$ ${newSale.total.toFixed(2)}`
      });
    }
    get().runAutomations('pedido_pago', newSale);
    get().generateAlerts();

    return newSale;
  },

  updateSaleStatus: (saleId, status, userName = 'Administrator', customDescription, bypassValidationConfirm = false) => {
    const isDesktop = typeof window !== 'undefined' && !!(window as any).electron;
    const electronAPI = isDesktop ? (window as any).electron : null;

    const { sales, financialTransactions, updateStock } = get();
    const sale = sales.find(s => s.id === saleId);
    if (!sale) return;

    // Operational Anti-Human Error Validation Layer
    const valResult = operationalValidationService.validateStatusTransition(sale, status);
    if (!valResult.valid) {
      alert(`Bloqueio de Erro Humano:\n${valResult.reason}`);
      return;
    }
    if (valResult.requiresConfirmation && !bypassValidationConfirm) {
      if (!confirm(valResult.warning || 'Tem certeza que deseja mudar o status?')) {
        return;
      }
    }

    const previousStatus = sale.status;

    // Statuses that represent a finalized (or post-finalized) separation
    const finalizedStatuses = ['separado', 'embalando', 'em_rota', 'entregue', 'finalizado'];
    // Statuses that represent states before or during separation
    const earlierStatuses = ['aguardando_separacao', 'enviado_separacao', 'em_separacao'];
    
    const wasFinalized = finalizedStatuses.includes(previousStatus);
    const isNowEarlier = earlierStatuses.includes(status);

    // Handle cancellation in financial
    const updatedTransactions = financialTransactions.map(t => {
      if (t.origin === 'venda' && t.originId === saleId && status === 'cancelado') {
        return { ...t, status: 'cancelado' as const };
      }
      return t;
    });

    let saleToUpdate = { ...sale, status };

    // Reset picking data and return stock if reverting from a finalized state to an earlier one or if order is cancelled
    if (wasFinalized && (isNowEarlier || status === 'cancelado')) {
      // Revert stock!
      sale.items.forEach(item => {
        const pickedQty = item.pickedQuantity || 0;
        if (pickedQty > 0) {
          updateStock(item.id, pickedQty, item.selectedVariationId); // Add back the stock that was subtracted
        }
      });
      
      // Clear picking related fields as requested for a fresh start
      saleToUpdate = {
        ...saleToUpdate,
        pickerId: undefined,
        pickerName: undefined,
        pickTimestamp: undefined,
        pickStartTime: undefined,
        pickDuration: undefined,
        items: sale.items.map(item => ({ ...item, pickedQuantity: 0 }))
      };
    } else if (status === 'aguardando_separacao' || status === 'enviado_separacao' || (previousStatus === 'em_separacao' && isNowEarlier)) {
      // If moving back to prepared states, ensure picking info is cleared
      saleToUpdate = {
        ...saleToUpdate,
        pickerId: undefined,
        pickerName: undefined,
        pickStartTime: undefined,
        items: sale.items.map(item => ({ ...item, pickedQuantity: 0 }))
      };
    }

    const currentEvents = saleToUpdate.timelineEvents || [];
    const statusLabels: Record<string, string> = {
      'aguardando_separacao': 'Aguardando Separação',
      'enviado_separacao': 'Enviado para Separação',
      'em_separacao': 'Em Separação',
      'separado': 'Separado',
      'separado_com_faltantes': 'Separado com Faltantes',
      'aguardando_embalagem': 'Aguardando Embalagem',
      'embalando': 'Embalado/Concluído',
      'em_rota': 'Em Rota',
      'entregue': 'Entregue',
      'problema': 'Problema',
      'atrasado': 'Atrasado',
      'retirado': 'Retirado',
      'cancelado': 'Cancelado',
      'finalizado': 'Finalizado'
    };

    let eventType = 'order';
    let eventIcon = 'Clock';
    let eventColor = 'text-white/40';
    let eventDesc = customDescription || `Pedido #${sale.orderNumber} status alterado para ${statusLabels[status] || status}`;

    if (wasFinalized && isNowEarlier) {
      eventType = 'user';
      eventIcon = 'RotateCcw';
      eventColor = 'text-amber-500';
      eventDesc = customDescription || `Pedido voltou de ${statusLabels[previousStatus] || previousStatus} para ${statusLabels[status] || status} por ${userName}`;
    } else {
      switch (status) {
        case 'cancelado':
          eventType = 'order';
          eventIcon = 'XCircle';
          eventColor = 'text-red-500';
          eventDesc = customDescription || `Pedido cancelado por ${userName}`;
          break;
        case 'enviado_separacao':
          eventType = 'separation';
          eventIcon = 'Inbox';
          eventColor = 'text-blue-400';
          eventDesc = customDescription || `Pedido enviado para a fila de separação por ${userName}`;
          break;
        case 'em_separacao':
          eventType = 'separation';
          eventIcon = 'Package';
          eventColor = 'text-purple-400';
          eventDesc = customDescription || `Separação iniciada pelo separador ${saleToUpdate.pickerName || userName}`;
          break;
        case 'separado':
          eventType = 'separation';
          eventIcon = 'CheckCircle2';
          eventColor = 'text-emerald-500';
          eventDesc = customDescription || `Separação concluída por ${saleToUpdate.pickerName || userName}`;
          break;
        case 'separado_com_faltantes':
          eventType = 'separation';
          eventIcon = 'AlertCircle';
          eventColor = 'text-amber-500';
          eventDesc = customDescription || `Separação concluída com itens faltantes por ${saleToUpdate.pickerName || userName}`;
          break;
        case 'aguardando_embalagem':
          eventType = 'packaging';
          eventIcon = 'Archive';
          eventColor = 'text-orange-400';
          eventDesc = customDescription || `Pedido enviado para conferência e embalagem por ${userName}`;
          break;
        case 'embalando':
          eventType = 'packaging';
          eventIcon = 'PackageCheck';
          eventColor = 'text-pink-400';
          eventDesc = customDescription || `Pedido embalado e concluído por ${userName}`;
          break;
        case 'em_rota':
          eventType = 'dispatch';
          eventIcon = 'Truck';
          eventColor = 'text-blue-400';
          eventDesc = customDescription || `Pedido despachado / saiu para entrega por ${userName}`;
          break;
        case 'entregue':
          eventType = 'dispatch';
          eventIcon = 'CheckCircle';
          eventColor = 'text-emerald-500';
          eventDesc = customDescription || `Pedido entregue por ${userName}`;
          break;
        default:
          eventType = 'order';
          eventIcon = 'Clock';
          eventColor = 'text-white/40';
          eventDesc = customDescription || `Status alterado para ${statusLabels[status] || status} por ${userName}`;
      }
    }

    const tEvent: TimelineEvent = {
      id: generateUUID(),
      type: eventType,
      timestamp: Date.now(),
      user: userName,
      description: eventDesc,
      status: status,
      icon: eventIcon,
      color: eventColor
    };

    saleToUpdate.timelineEvents = [...currentEvents, tEvent];

    // Adjust corresponding current cashier totals if open upon cancellation
    let cashierToUpdate = get().currentCashier ? { ...get().currentCashier } : null;
    if (status === 'cancelado' && previousStatus !== 'cancelado' && cashierToUpdate) {
      cashierToUpdate.totalSales = safeSubtract(cashierToUpdate.totalSales, sale.total);
      
      if (sale.payments && sale.payments.length > 0) {
        sale.payments.forEach(p => {
          cashierToUpdate!.paymentMethodTotals[p.methodId] = Math.max(0, safeSubtract(cashierToUpdate!.paymentMethodTotals[p.methodId] || 0, p.amount));
        });
      } else {
        const methodId = sale.paymentMethodId;
        if (methodId) {
          cashierToUpdate.paymentMethodTotals[methodId] = Math.max(0, safeSubtract(cashierToUpdate.paymentMethodTotals[methodId] || 0, sale.total));
        }
      }

      if (sale.change > 0) {
        const cashPm = get().paymentMethods.find(m => m.type === 'money');
        if (cashPm) {
          cashierToUpdate.paymentMethodTotals[cashPm.id] = safeAdd(cashierToUpdate.paymentMethodTotals[cashPm.id] || 0, sale.change);
        }
      }
    }

    set((state) => ({
      sales: state.sales.map(s => s.id === saleId ? saleToUpdate : s),
      financialTransactions: updatedTransactions,
      currentCashier: (status === 'cancelado' && previousStatus !== 'cancelado') ? (cashierToUpdate as any) : state.currentCashier
    }));

    const description = customDescription || `Pedido #${sale.orderNumber} status alterado para ${status}`;

    get().addActivity(description, 'sale', 'Gestão de Pedidos', userName, saleId);
    
    get().logAction({ 
      module: 'Gestão de Pedidos', 
      actionType: status === 'cancelado' ? 'cancel' : 'status_change', 
      action: status === 'cancelado' ? 'Venda Cancelada' : 'Status Alterado',
      description,
      status: 'sucesso',
      referenceId: saleId,
      affectedEntity: 'Pedido',
      entityId: saleId,
      previousValue: previousStatus,
      newValue: status
    });

    if (status === 'cancelado') {
      get().logAction({
        module: 'Financeiro',
        actionType: 'cancel',
        action: 'Venda Cancelada',
        description: `Venda/Pedido #${sale.orderNumber} cancelado por ${userName}. Valor estornado: R$ ${sale.total.toFixed(2)}`,
        status: 'sucesso',
        referenceId: saleId,
        affectedEntity: 'Pedido',
        entityId: saleId,
        previousValue: `R$ ${sale.total.toFixed(2)}`,
        newValue: `0.00`
      });

      if (previousStatus !== 'cancelado') {
        get().addTransaction({
          type: 'saida',
          category: 'Estorno de Venda',
          description: `Cancelamento de Pedido #${sale.orderNumber} por ${userName}`,
          value: sale.total,
          status: 'pago',
          origin: 'caixa',
          originId: cashierToUpdate?.id || 'offline'
        });
      }
    }

    if (isDesktop && electronAPI && electronAPI.db) {
      electronAPI.db.insertSale(saleToUpdate).catch((err: any) => {
        console.error('[SQLite] Falha ao persistir venda:', err);
      });
      if (status === 'cancelado' && previousStatus !== 'cancelado' && cashierToUpdate) {
        electronAPI.db.insertCashierSession(cashierToUpdate).catch((err: any) => {
          console.error('[SQLite] Falha ao persistir sessao de caixa:', err);
        });
      }
    }
  },
  
  updateSale: (saleId, data) => {
    const isDesktop = typeof window !== 'undefined' && !!(window as any).electron;
    const electronAPI = isDesktop ? (window as any).electron : null;

    set((state) => ({
      sales: state.sales.map(s => {
        if (s.id === saleId) {
          const currentEvents = s.timelineEvents || [];
          const additionalEvents: TimelineEvent[] = [];
          
          if (data.deliveryMethodName && data.deliveryMethodName !== s.deliveryMethodName) {
            additionalEvents.push({
              id: generateUUID(),
              type: 'dispatch',
              timestamp: Date.now(),
              user: data.deliveryAddedBy || 'Administrador',
              description: `Entrega configurada: ${data.deliveryMethodName}${data.trackingCode ? ` (Código: ${data.trackingCode})` : ''}`,
              status: s.status,
              icon: 'Truck',
              color: 'text-blue-400'
            });
          } else if (data.trackingCode && data.trackingCode !== s.trackingCode) {
            additionalEvents.push({
              id: generateUUID(),
              type: 'dispatch',
              timestamp: Date.now(),
              user: data.deliveryAddedBy || 'Administrador',
              description: `Código de rastreio informado: ${data.trackingCode}`,
              status: s.status,
              icon: 'Truck',
              color: 'text-blue-400'
            });
          }

          if (data.experienceContentUrl && data.experienceContentUrl !== s.experienceContentUrl) {
            additionalEvents.push({
              id: generateUUID(),
              type: 'packaging',
              timestamp: Date.now() + 10,
              user: 'Administrador',
              description: `Mídia de experiência do cliente gerada com sucesso`,
              status: s.status,
              icon: 'Tv',
              color: 'text-pink-400'
            });
          }

          if ((data.weight && data.weight !== s.weight) || (data.packageType && data.packageType !== s.packageType)) {
            additionalEvents.push({
              id: generateUUID(),
              type: 'packaging',
              timestamp: Date.now() + 20,
              user: 'Administrador',
              description: `Dados de embalagem registrados: ${data.packageType || s.packageType || 'CX Padrao'}${data.weight ? ` - Peso: ${data.weight}kg` : ''}`,
              status: s.status,
              icon: 'PackageSearch',
              color: 'text-pink-400'
            });
          }

          return {
            ...s,
            ...data,
            timelineEvents: [...currentEvents, ...additionalEvents]
          };
        }
        return s;
      })
    }));

    const updatedSale = get().sales.find(s => s.id === saleId);
    if (updatedSale && isDesktop && electronAPI && electronAPI.db) {
      electronAPI.db.insertSale(updatedSale).catch((err: any) => {
        console.error('[SQLite] Falha ao persistir venda:', err);
      });
    }
  },

  addSaleTimelineEvent: (saleId, event) => {
    const newEvent: TimelineEvent = {
      ...event,
      id: generateUUID(),
      timestamp: Date.now()
    };
    set((state) => ({
      sales: state.sales.map(s => {
        if (s.id === saleId) {
          const currentEvents = s.timelineEvents || [];
          return {
            ...s,
            timelineEvents: [...currentEvents, newEvent]
          };
        }
        return s;
      })
    }));
  },

  updatePickedQuantity: (saleId, productId, quantity, userName = 'Administrator') => {
    const { sales, addActivity } = get();
    const sale = sales.find(s => s.id === saleId);
    if (!sale) return;

    const productItem = sale.items.find(i => i.id === productId);
    if (productItem) {
      const currentPicked = productItem.pickedQuantity || 0;
      const newPicked = Math.max(0, Math.min(productItem.quantity, currentPicked + quantity));
      if (newPicked !== currentPicked) {
        get().logAction({
          module: 'Separação',
          actionType: 'other',
          action: 'Produto Bipado',
          description: `Produto bipado por ${userName}: ${productItem.name} (+${quantity} un). Total: ${newPicked}/${productItem.quantity} no pedido #${sale.orderNumber}`,
          status: 'sucesso',
          referenceId: saleId,
          affectedEntity: 'Produto',
          entityId: productId,
          previousValue: `${currentPicked}`,
          newValue: `${newPicked}`
        });
      }
    }

    set((state) => ({
      sales: state.sales.map(s => {
        if (s.id === saleId) {
          let bipedEvent: TimelineEvent | null = null;
          const updatedItems = s.items.map(item => {
            if (item.id === productId) {
              const currentPicked = item.pickedQuantity || 0;
              const newPicked = Math.max(0, Math.min(item.quantity, currentPicked + quantity));
              
              if (newPicked !== currentPicked) {
                bipedEvent = {
                  id: generateUUID(),
                  type: 'separation',
                  timestamp: Date.now(),
                  user: userName,
                  description: `Produto bipado: ${item.name} (+${quantity} un) - Total: ${newPicked}/${item.quantity}`,
                  status: 'em_separacao',
                  icon: 'Package',
                  color: 'text-purple-400'
                };
              }
              return { ...item, pickedQuantity: newPicked };
            }
            return item;
          });

          const currentEvents = s.timelineEvents || [];
          return { 
            ...s, 
            items: updatedItems,
            timelineEvents: bipedEvent ? [...currentEvents, bipedEvent] : currentEvents
          };
        }
        return s;
      })
    }));
  },

  startSeparation: (saleId, pickerId, pickerName) => {
    const isDesktop = typeof window !== 'undefined' && !!(window as any).electron;
    const electronAPI = isDesktop ? (window as any).electron : null;

    set((state) => ({
      sales: state.sales.map(s => {
        if (s.id === saleId) {
          const currentEvents = s.timelineEvents || [];
          const tEvent: TimelineEvent = {
            id: generateUUID(),
            type: 'separation',
            timestamp: Date.now(),
            user: pickerName,
            description: `Separação iniciada pelo separador ${pickerName}`,
            status: 'em_separacao',
            icon: 'Package',
            color: 'text-purple-400'
          };
          return {
            ...s,
            status: 'em_separacao',
            pickerId, 
            pickerName, 
            pickStartTime: Date.now(),
            timelineEvents: [...currentEvents, tEvent]
          };
        }
        return s;
      })
    }));
    const sale = get().sales.find(s => s.id === saleId);
    get().addActivity(`Iniciada separação do pedido #${sale?.orderNumber}`, 'inventory', 'Separação', pickerName, saleId);
    
    if (sale) {
      get().logAction({
        module: 'Separação',
        actionType: 'status_change',
        action: 'Separação Iniciada',
        description: `Separação iniciada para o pedido #${sale.orderNumber} por ${pickerName}`,
        status: 'sucesso',
        referenceId: saleId,
        affectedEntity: 'Pedido',
        entityId: saleId,
        newValue: 'Status de separação iniciado'
      });

      if (isDesktop && electronAPI && electronAPI.db) {
        electronAPI.db.insertSale(sale).catch((err: any) => {
          console.error('[SQLite] Falha ao persistir venda:', err);
        });
      }
    }
  },

  finalizeSeparation: (saleId, pickerId, pickerName, authorizedBy, authMethod) => {
    const { sales, products, consumeMaterials, updateStock, addActivity, logAction } = get();
    const sale = sales.find(s => s.id === saleId);
    if (!sale) return;

    const finalizeTime = Date.now();
    const duration = sale.pickStartTime ? Math.floor((finalizeTime - sale.pickStartTime) / 1000) : 0;

    // 1. Adjust Stock and Consume Materials based on ACTUALLY PICKED quantities
    sale.items.forEach(item => {
      const pickedQty = item.pickedQuantity || 0;
      if (pickedQty > 0) {
        const product = products.find(p => p.id === item.id);
        const prevStock = product ? product.stock : 0;

        updateStock(item.id, -pickedQty, item.selectedVariationId);
        
        get().logAction({
          module: 'Estoque',
          actionType: 'update',
          action: 'Baixa por Separação',
          description: `Baixa de estoque por separação do pedido #${sale.orderNumber}: ${item.name} (-${pickedQty} un)`,
          status: 'sucesso',
          referenceId: saleId,
          affectedEntity: 'Produto',
          entityId: item.id,
          previousValue: `${prevStock}`,
          newValue: `${prevStock - pickedQty}`
        });

        if (product && product.productionId && product.productionMode === 'on_demand') {
          consumeMaterials(product.id, pickedQty);
        }
      }
    });

    // 2. Compute missing items and requested/picked/missing quantities
    let totalRequestedQuantity = 0;
    let totalPickedQuantity = 0;
    let totalMissingQuantity = 0;
    const missingProductsList: Array<{
      id: string;
      name: string;
      code: string;
      quantityRequested: number;
      quantityPicked: number;
      quantityMissing: number;
    }> = [];

    sale.items.forEach(item => {
      const pQty = item.pickedQuantity || 0;
      const mQty = Math.max(0, item.quantity - pQty);
      totalRequestedQuantity += item.quantity;
      totalPickedQuantity += pQty;
      totalMissingQuantity += mQty;

      if (mQty > 0) {
        missingProductsList.push({
          id: item.id,
          name: item.name,
          code: item.code,
          quantityRequested: item.quantity,
          quantityPicked: pQty,
          quantityMissing: mQty,
        });
      }
    });

    const isFaltante = totalMissingQuantity > 0;
    const finalStatus = (isFaltante ? 'separado_com_faltantes' : 'separado') as any;

    set((state) => {
      const saleToFaturar = state.sales.find(s => s.id === saleId);
      if (!saleToFaturar) return state;

      const finalSubtotal = saleToFaturar.items.reduce((acc, item) => safeAdd(acc, safeMultiply(item.pickedQuantity !== undefined ? item.pickedQuantity : item.quantity, item.price)), 0);
      const finalTotal = Math.max(0, safeSubtract(finalSubtotal, saleToFaturar.discount));
      const totalDiff = safeSubtract(saleToFaturar.total, finalTotal);

      const updatedSales = state.sales.map(s => {
        if (s.id === saleId) {
          const currentEvents = s.timelineEvents || [];
          
          let tEvent: TimelineEvent;
          if (isFaltante) {
            const methodStr = authMethod === 'senha_master' ? 'Senha Master' : 'QR Code ADM';
            tEvent = {
              id: generateUUID(),
              type: 'separation',
              timestamp: finalizeTime,
              user: pickerName,
              description: `Separação concluída com itens faltantes por ${pickerName}`,
              observation: `Autorizado por ${authorizedBy} via ${methodStr}. Faltou: ${totalMissingQuantity} un.`,
              status: 'separado_com_faltantes',
              icon: 'AlertCircle',
              color: 'text-amber-500'
            };
          } else {
            tEvent = {
              id: generateUUID(),
              type: 'separation',
              timestamp: finalizeTime,
              user: pickerName,
              description: `Separação finalizada por ${pickerName}`,
              observation: `Duração: ${duration}s`,
              status: 'separado',
              icon: 'CheckCircle2',
              color: 'text-emerald-500'
            };
          }

          const stockEvent: TimelineEvent = {
            id: generateUUID(),
            type: 'stock',
            timestamp: finalizeTime + 50,
            user: pickerName,
            description: `Baixa de estoque realizada para os itens separados`,
            status: 'separado',
            icon: 'Activity',
            color: 'text-blue-400'
          };

          let finalPaymentsList = s.payments ? [...s.payments] : [];
          if (finalPaymentsList.length > 0) {
            let remaining = finalTotal;
            finalPaymentsList = finalPaymentsList.map(p => {
              const allocated = Math.min(p.amount, remaining);
              remaining = safeSubtract(remaining, allocated);
              return { ...p, amount: allocated };
            }).filter(p => p.amount > 0);
            if (finalPaymentsList.length === 0 && finalTotal > 0 && s.payments && s.payments.length > 0) {
              finalPaymentsList = [{
                ...s.payments[0],
                amount: finalTotal
              }];
            }
          }
          const receivedAmt = s.receivedAmount !== undefined ? s.receivedAmount : finalTotal;
          const changeAmt = Math.max(0, safeSubtract(receivedAmt, finalTotal));

          const clientName = s.clientName || 'Cliente Consumidor';
          const faturadoItemsShort = s.items.map(item => ({
            id: item.id,
            name: item.name,
            code: item.code || '',
            quantityRequested: item.quantity,
            quantityPicked: item.pickedQuantity !== undefined ? item.pickedQuantity : item.quantity,
            price: item.price,
            total: safeMultiply(item.pickedQuantity !== undefined ? item.pickedQuantity : item.quantity, item.price)
          }));

          const receiptQrPayload = JSON.stringify({
            type: 'receipt',
            orderNumber: s.orderNumber || '000000',
            id: s.id || 'none',
            client: clientName,
            items: faturadoItemsShort.map(item => ({
              id: item.id,
              name: item.name,
              code: item.code,
              quantity: item.quantityPicked,
              price: item.price,
              total: item.total
            })),
            total: finalTotal,
            timestamp: finalizeTime,
            responsible: pickerName,
            status: finalStatus
          });

          const thermalReceipt = {
            id: `receipt_${s.orderNumber}_${finalizeTime}`,
            timestamp: finalizeTime,
            pickerId,
            pickerName,
            items: faturadoItemsShort,
            subtotal: finalSubtotal,
            discount: s.discount,
            total: finalTotal,
            qrPayload: receiptQrPayload,
            observations: s.deliveryNotes || '',
            clientName: clientName,
            clientPhone: s.clientPhone || ''
          };

          const updatedItemsWithCosts = s.items.map(item => {
            const picked = item.pickedQuantity !== undefined ? item.pickedQuantity : item.quantity;
            const unitCost = item.unitCostAtSale !== undefined ? item.unitCostAtSale : (get().products.find(p => p.id === item.id)?.costPrice ?? item.costPrice ?? 0);
            const unitPrice = item.unitPriceAtSale !== undefined ? item.unitPriceAtSale : (item.price ?? 0);
            
            return {
              ...item,
              unitCostAtSale: unitCost,
              unitPriceAtSale: unitPrice,
              totalCostAtSale: safeMultiply(unitCost, picked),
              totalPriceAtSale: safeMultiply(unitPrice, picked)
            };
          });

          return { 
            ...s, 
            status: finalStatus, 
            pickerId,
            pickerName, 
            pickTimestamp: finalizeTime,
            pickDuration: duration,
            totalRequestedQuantity,
            totalPickedQuantity,
            totalMissingQuantity,
            missingProductsList,
            missingItemsAuthorizedBy: authorizedBy,
            missingItemsAuthMethod: authMethod,
            items: updatedItemsWithCosts,
            originalItems: s.originalItems || JSON.parse(JSON.stringify(s.items)),
            originalSubtotal: s.originalSubtotal !== undefined ? s.originalSubtotal : s.subtotal,
            originalTotal: s.originalTotal !== undefined ? s.originalTotal : s.total,
            subtotal: finalSubtotal,
            total: finalTotal,
            payments: finalPaymentsList,
            receivedAmount: receivedAmt,
            change: changeAmt,
            thermalReceipt,
            timelineEvents: [...currentEvents, tEvent, stockEvent]
          };
        }
        return s;
      });

      // Update corresponding financial transaction value
      const updatedTransactions = state.financialTransactions.map(t => {
        if (t.origin === 'venda' && t.originId === saleId) {
          return { ...t, value: finalTotal };
        }
        return t;
      });

      // Adjust active cashier expected totals if there is a discrepancy
      let updatedCashier = state.currentCashier ? { ...state.currentCashier } : null;
      if (updatedCashier && totalDiff !== 0) {
        updatedCashier.totalSales = safeSubtract(updatedCashier.totalSales, totalDiff);
        const methodId = saleToFaturar.paymentMethodId;
        if (methodId && updatedCashier.paymentMethodTotals[methodId] !== undefined) {
          updatedCashier.paymentMethodTotals[methodId] = Math.max(0, safeSubtract(updatedCashier.paymentMethodTotals[methodId], totalDiff));
        }
      }

      const isDesktop = typeof window !== 'undefined' && !!(window as any).electron;
      const electronAPI = isDesktop ? (window as any).electron : null;
      if (isDesktop && electronAPI && electronAPI.db) {
        const finalUpdatedSale = updatedSales.find(s => s.id === saleId);
        if (finalUpdatedSale) {
          electronAPI.db.insertSale(finalUpdatedSale).catch((err: any) => console.error('[SQLite] finalizeSeparation sale error:', err));
        }
        if (updatedCashier) {
          electronAPI.db.insertCashierSession(updatedCashier).catch((err: any) => console.error('[SQLite] finalizeSeparation cashier error:', err));
        }
        updatedTransactions.forEach(t => {
          if (t.origin === 'venda' && t.originId === saleId) {
            electronAPI.db.insertFinancialTransaction(t).catch((err: any) => console.error('[SQLite] finalizeSeparation transaction error:', err));
          }
        });
      }

      return {
        sales: updatedSales,
        financialTransactions: updatedTransactions,
        currentCashier: updatedCashier
      };
    });

    if (isFaltante) {
      const missingDetailsStr = missingProductsList.map(p => `${p.name} (EAN/SKU: ${p.code} - Pedido: ${p.quantityRequested} / Separado: ${p.quantityPicked} / Faltante/Cancelado: ${p.quantityMissing})`).join(', ');
      const methodStr = authMethod === 'senha_master' ? 'Senha Master' : 'QR Code ADM';
      
      const activityMessage = `Separação concluída com faltantes do pedido #${sale.orderNumber}. Separador: ${pickerName}. Autorizado por: ${authorizedBy} via ${methodStr}. Faltas: [${missingDetailsStr}]`;
      addActivity(activityMessage, 'inventory', 'Separação', pickerName, saleId);
      
      logAction({ 
        module: 'Separação', 
        actionType: 'status_change', 
        action: 'Separação com Faltas',
        description: `Separação Concluída com Faltas - Pedido #${sale.orderNumber} por ${pickerName}. Autorizador: ${authorizedBy} (via ${methodStr}). Faltou: ${totalMissingQuantity} un. Detalhes: ${missingDetailsStr}`, 
        status: 'sucesso', 
        referenceId: saleId,
        affectedEntity: 'Pedido',
        entityId: saleId,
        newValue: 'Status de separação finalizado com faltas',
        method: methodStr
      });

      // Individual item faltante logging
      missingProductsList.forEach(p => {
        get().logAction({
          module: 'Estoque',
          actionType: 'cancel',
          action: 'Item Faltante',
          description: `Item faltante na separação do pedido #${sale.orderNumber}: ${p.name} (${p.quantityMissing} un faltantes)`,
          status: 'sucesso',
          referenceId: saleId,
          affectedEntity: 'Produto',
          entityId: p.id,
          previousValue: `${p.quantityRequested}`,
          newValue: `${p.quantityPicked}`
        });
      });
    } else {
      addActivity(`Separação finalizada do pedido #${sale.orderNumber}`, 'inventory', 'Separação', pickerName, saleId);
      logAction({ 
        module: 'Separação', 
        actionType: 'status_change', 
        action: 'Separação Concluída',
        description: `Separação Concluída - Pedido #${sale.orderNumber} por ${pickerName} em ${duration}s`, 
        status: 'sucesso', 
        referenceId: saleId,
        affectedEntity: 'Pedido',
        entityId: saleId,
        newValue: 'Status de separação finalizado'
      });
    }

    // Impressão automática desativada temporariamente para manutenção do motor de impressão
  },

  // Products
  addProduct: (product, userName = 'Administrator') => {
    const newProduct: Product = {
      ...product,
      id: generateUUID(),
    };

    const isDesktop = typeof window !== 'undefined' && !!(window as any).electron;
    const electronAPI = isDesktop ? (window as any).electron : null;
    const useSQLite = isDesktop && electronAPI && electronAPI.db;

    if (useSQLite) {
      electronAPI.db.insertProduct(newProduct).catch((err: any) => {
        console.error('[SQLite] Falha ao inserir produto:', err);
      });
    }

    set((state) => ({ products: [...state.products, newProduct] }));
    get().addActivity(`Produto cadastrado: ${product.name}`, 'inventory', 'Estoque', userName, newProduct.id);
    get().logAction({ module: 'Estoque', actionType: 'create', description: `Produto cadastrado: ${product.name} (SKU: ${product.code})`, status: 'sucesso', referenceId: newProduct.id });
  },

  updateProduct: (id, data, userName = 'Administrator') => {
    const prevProduct = get().products.find(p => p.id === id);
    const prevStock = prevProduct ? prevProduct.stock : 0;
    
    let updatedProduct: { [key: string]: any } | undefined;

    set((state) => {
      const updatedProducts = state.products.map(p => {
        if (p.id === id) {
          const updated = { ...p, ...data };
          if (state.catalogConfig?.autoUnpublishOnZeroStock && typeof updated.stock === 'number' && updated.stock <= 0) {
            updated.catalogPublished = false;
          }
          updatedProduct = updated;
          return updated;
        }
        return p;
      });
      return { products: updatedProducts };
    });

    const isDesktop = typeof window !== 'undefined' && !!(window as any).electron;
    const electronAPI = isDesktop ? (window as any).electron : null;
    const useSQLite = isDesktop && electronAPI && electronAPI.db;

    if (useSQLite && updatedProduct) {
      electronAPI.db.insertProduct(updatedProduct).catch((err: any) => {
        console.error('[SQLite] Falha ao atualizar produto:', err);
      });
    }

    get().addActivity(`Produto atualizado: ${id}`, 'inventory', 'Estoque', userName, id);
    
    if (typeof data.stock === 'number' && prevProduct && prevProduct.stock !== data.stock) {
      const stockDiff = data.stock - prevProduct.stock;
      const isIncrease = stockDiff > 0;
      const actionLabel = isIncrease ? 'Entrada manual' : 'Saída manual';
      
      get().logAction({
        module: 'Estoque',
        actionType: 'update',
        action: actionLabel,
        description: `Movimentação de estoque de ${prevProduct.name}: ${isIncrease ? '+' : ''}${stockDiff} un (Ajuste Manual)`,
        status: 'sucesso',
        referenceId: id,
        affectedEntity: 'Produto',
        entityId: id,
        previousValue: `${prevProduct.stock}`,
        newValue: `${data.stock}`,
        method: 'Ajuste manual'
      });
    } else {
      get().logAction({ 
        module: 'Estoque', 
        actionType: 'update', 
        action: 'Ajuste de Estoque',
        description: `Produto atualizado: ${prevProduct?.name || id} (${Object.keys(data).join(', ')})`, 
        status: 'sucesso', 
        referenceId: id,
        affectedEntity: 'Produto',
        entityId: id,
        previousValue: prevProduct ? `${prevProduct.stock} un` : undefined,
        newValue: data.stock !== undefined ? `${data.stock} un` : undefined
      });
    }
    
    get().generateAlerts();
  },

  deleteProduct: (id, userName = 'Administrator') => {
    const state = get();
    const product = state.products.find(p => p.id === id);
    if (!product) return;

    const hasSalesHistory = state.sales?.some(sale => sale.items?.some(item => item.id === id)) || false;
    const hasConsignmentHistory = state.consignmentRemittances?.some(rem => rem.items?.some(item => item.productId === id)) || false;
    const hasProductionHistory = !!product.productionId;
    const hasReturnsHistory = state.returns?.some(r => r.productId === id) || false;
    const hasLabelsHistory = state.labelBatchItems?.some(item => item.productId === id) || false;

    const hasAnyHistory = hasSalesHistory || hasConsignmentHistory || hasProductionHistory || hasReturnsHistory || hasLabelsHistory;

    const isDesktop = typeof window !== 'undefined' && !!(window as any).electron;
    const electronAPI = isDesktop ? (window as any).electron : null;
    const useSQLite = isDesktop && electronAPI && electronAPI.db;

    if (hasAnyHistory) {
      const updatedProduct = {
        ...product,
        active: false,
        archivedAt: Date.now(),
        archivedBy: state.currentUser?.fullName || state.currentUser?.login || userName,
        lastUpdated: Date.now(),
        syncVersion: (product.syncVersion || 1) + 1
      };

      if (useSQLite) {
        electronAPI.db.insertProduct(updatedProduct).catch((err: any) => {
          console.error('[SQLite] Falha ao inativar produto:', err);
        });
      }

      set((state) => ({
        products: state.products.map(p => p.id === id ? updatedProduct : p)
      }));
      get().addActivity(`Produto inativado (com histórico): ${product.name}`, 'inventory', 'Estoque', userName, id);
    } else {
      if (useSQLite) {
        electronAPI.db.deleteProduct(id).catch((err: any) => {
          console.error('[SQLite] Falha ao deletar produto:', err);
        });
      }

      set((state) => ({
        products: state.products.filter(p => p.id !== id)
      }));
      get().addActivity(`Produto excluído fisicamente: ${product.name}`, 'inventory', 'Estoque', userName, id);
      get().addTombstone('products', id, userName);
    }
  },

  // Clients
  addClient: (client, userName = 'Administrator') => {
    const newClient: Client = {
      ...client,
      id: generateUUID(),
      active: true,
      createdAt: Date.now()
    };

    const isDesktop = typeof window !== 'undefined' && !!(window as any).electron;
    const electronAPI = isDesktop ? (window as any).electron : null;
    const useSQLite = isDesktop && electronAPI && electronAPI.db;

    if (useSQLite) {
      electronAPI.db.insertClient(newClient).catch((err: any) => {
        console.error('[SQLite] Falha ao inserir cliente:', err);
      });
    }

    set((state) => ({ clients: [...state.clients, newClient] }));
    get().addActivity(`Cliente cadastrado: ${client.name}`, 'client', 'Clientes', userName, newClient.id);
  },

  updateClient: (id, data, userName = 'Administrator') => {
    let updatedClient: Client | undefined;

    set((state) => {
      const updatedClients = state.clients.map(c => {
        if (c.id === id) {
          const updated = { ...c, ...data };
          updatedClient = updated;
          return updated;
        }
        return c;
      });
      return { clients: updatedClients };
    });

    const isDesktop = typeof window !== 'undefined' && !!(window as any).electron;
    const electronAPI = isDesktop ? (window as any).electron : null;
    const useSQLite = isDesktop && electronAPI && electronAPI.db;

    if (useSQLite && updatedClient) {
      electronAPI.db.insertClient(updatedClient).catch((err: any) => {
        console.error('[SQLite] Falha ao atualizar cliente:', err);
      });
    }

    get().addActivity(`Cliente atualizado: ${id}`, 'client', 'Clientes', userName, id);
  },

  // Payment Methods
  addPaymentMethod: async (method, userName = 'Administrator') => {
    const newMethod: PaymentMethod = {
      ...method,
      id: generateUUID(),
    };
    const backup = get().paymentMethods;
    set((state) => ({ paymentMethods: [...state.paymentMethods, newMethod] }));
    try {
      await get().saveSystemListsToSQLite();
    } catch (err: any) {
      set({ paymentMethods: backup });
      throw err;
    }
    get().addActivity(`Meio de pagamento cadastrado: ${method.name}`, 'cashier', 'Pagamentos', userName, newMethod.id);
  },

  updatePaymentMethod: async (id, data, userName = 'Administrator') => {
    const backup = get().paymentMethods;
    set((state) => ({
      paymentMethods: state.paymentMethods.map(m => m.id === id ? { ...m, ...data } : m)
    }));
    try {
      await get().saveSystemListsToSQLite();
    } catch (err: any) {
      set({ paymentMethods: backup });
      throw err;
    }
    get().addActivity(`Meio de pagamento atualizado: ${id}`, 'cashier', 'Pagamentos', userName, id);
  },

  updateStock: (productId, quantity, variationId) => {
    set((state) => {
      const newProducts = state.products.map(p => {
        if (p.id === productId) {
          // Centralized Stock Validation to Prevent Human Errors using trusted currentUser session
          const user = state.currentUser;
          const isAdminUser = !!(user && (
            user.isAdmin || 
            user.isOwner ||
            user.isMasterAdmin ||
            user.roleId === 'admin' || 
            user.roleId === 'administrador' || 
            user.roleId?.includes('admin') ||
            user.roleId?.includes('gerente') ||
            user.roleId?.includes('supervisor')
          ));

          let activeStock = p.stock;
          let activeName = p.name;
          let activeMinStock = p.minStock;

          let updatedVariations = p.variations;
          if (variationId && p.variations && p.variations.length > 0) {
            const variation = p.variations.find(v => v.id === variationId);
            if (variation) {
              activeStock = variation.stock;
              activeName = `${p.name} (${variation.name})`;
              activeMinStock = 0; // variation-level validation fallback
            }
          }

          const validationObj = { ...p, stock: activeStock, name: activeName, minStock: activeMinStock };
          const validation = operationalValidationService.validateStockChange(validationObj, quantity, isAdminUser);
          
          if (!validation.valid) {
            alert(`Bloqueio de Erro Humano:\n${validation.reason}`);
            return p; // Prevent negative stock modification
          } else if (validation.requiresConfirmation) {
            if (!confirm(validation.warning)) {
              return p; // Rollback modification if supervisor does not confirm
            }
          } else if (validation.warning) {
            alert(validation.warning);
          }

          let newStock = p.stock;
          if (variationId && p.variations && p.variations.length > 0) {
            updatedVariations = p.variations.map(v => {
              if (v.id === variationId) {
                return { ...v, stock: v.stock + quantity };
              }
              return v;
            });
            newStock = updatedVariations.reduce((sum, v2) => sum + v2.stock, 0);
          } else {
            newStock = p.stock + quantity;
          }

          if (newStock < p.minStock) {
            get().runAutomations('estoque_baixo', p);
          }
          const updatedProduct = { ...p, stock: newStock, variations: updatedVariations };

          const isDesktop = typeof window !== 'undefined' && !!(window as any).electron;
          const electronAPI = isDesktop ? (window as any).electron : null;
          if (isDesktop && electronAPI && electronAPI.db) {
            electronAPI.db.insertProduct(updatedProduct).catch((err: any) => {
              console.error('[SQLite] Falha ao atualizar estoque de produto em lote:', err);
            });
          }

          return updatedProduct;
        }
        return p;
      });
      return { products: newProducts };
    });
  },

  // Activity Actions
  addActivity: (message, type, module, userName = 'Administrator', entityId) => {
    get().trackEvent({
      message,
      module: module || 'Geral',
      actionType: type || 'other',
      entityId,
      eventType: 'operational_history'
    });
  },

  // AI Alerts Actions
  updateAlertStatus: (id, status) => {
    set((state) => ({
      alerts: state.alerts.map(a => a.id === id ? { ...a, status } : a)
    }));
  },

  addAlert: (alert) => {
    const newAlert: AIAlert = {
      ...alert,
      id: `alert-${generateUUID()}`,
      timestamp: Date.now()
    };
    set((state) => ({ alerts: [newAlert, ...state.alerts] }));
  },

  deleteAlert: (id) => {
    set((state) => ({ alerts: state.alerts.filter(a => a.id !== id) }));
    get().addTombstone('alerts', id);
  },

  generateAlerts: () => {
    const { products, sales, currentCashier, alerts } = get();
    // Keep alerts of type 'print', 'labels', 'system', 'customers' or any custom manual alerts
    const savedAlerts = (alerts || []).filter(a => ['print', 'labels', 'system', 'customers'].includes(a.type) || a.status === 'resolved');
    
    const newAlerts: AIAlert[] = [...savedAlerts];

    // Check Inventory
    products.forEach(p => {
      if (p.active === false || p.deleted) return;
      const exists = savedAlerts.some(a => a.id === `inv-${p.id}`);
      if (exists) return;

      if (p.stock <= 3) {
        newAlerts.push({
          id: `inv-${p.id}`,
          title: 'Estoque Crítico',
          description: `O produto ${p.name} tem apenas ${p.stock} unidades.`,
          priority: 'high',
          status: 'new',
          timestamp: Date.now(),
          type: 'inventory'
        });
      } else if (p.stock < 10) {
        newAlerts.push({
          id: `inv-${p.id}`,
          title: 'Estoque Baixo',
          description: `O produto ${p.name} está com ${p.stock} unidades.`,
          priority: 'medium',
          status: 'new',
          timestamp: Date.now(),
          type: 'inventory'
        });
      }
    });

    // Check Cashier
    if (currentCashier && (Date.now() - currentCashier.openingTime > 12 * 60 * 60 * 1000)) {
      const exists = savedAlerts.some(a => a.id === 'cashier-long');
      if (!exists) {
        newAlerts.push({
          id: 'cashier-long',
          title: 'Caixa Aberto Longo Período',
          description: 'O caixa está aberto há mais de 12 horas.',
          priority: 'medium',
          status: 'new',
          timestamp: Date.now(),
          type: 'cashier'
        });
      }
    }

    set({ alerts: newAlerts });
  },

  // Automations Actions
  addAutomation: (auto) => {
    const newAuto: Automation = {
      ...auto,
      id: generateUUID(),
      createdAt: Date.now(),
      executionsCount: 0
    };
    set((state) => ({ automations: [newAuto, ...state.automations] }));
  },

  toggleAutomation: (id) => {
    set((state) => ({
      automations: state.automations.map(a => a.id === id ? { ...a, status: a.status === 'active' ? 'paused' : 'active' } : a)
    }));
  },

  deleteAutomation: (id) => {
    set((state) => ({
      automations: state.automations.filter(a => a.id !== id)
    }));
    get().addTombstone('automations', id);
  },

  runAutomations: (trigger, context) => {
    const { automations } = get();
    const activeAutos = automations.filter(a => a.status === 'active' && a.trigger === trigger);

    activeAutos.forEach(auto => {
      // Logic for each action
      switch (auto.action) {
        case 'criar_alerta':
          // Alerta já é gerado pelo motor de alertas mas aqui poderia ser um específico
          break;
        case 'notificar_responsavel':
          get().addActivity(`[Automação] ${auto.name} executada para: ${context?.name || context?.id}`, 'automation', 'Automação');
          break;
        default:
          get().addActivity(`[Automação] ${auto.name} executada`, 'automation', 'Automação');
      }

      set((state) => ({
        automations: state.automations.map(a => a.id === auto.id ? { ...a, executionsCount: a.executionsCount + 1, lastExecution: Date.now() } : a)
      }));
    });
  },

  // Pre-Orders
  addPreOrder: (preOrder) => {
    const { nextPreOrderNumber } = get();
    const code = `PRE-${nextPreOrderNumber.toString().padStart(4, '0')}`;
    const newPreOrder: PreOrder = {
      ...preOrder,
      id: generateUUID(),
      orderCode: code,
      createdAt: Date.now(),
      status: 'nova'
    };

    const isDesktop = typeof window !== 'undefined' && !!(window as any).electron;
    const electronAPI = isDesktop ? (window as any).electron : null;
    if (isDesktop && electronAPI && electronAPI.db) {
      electronAPI.db.insertPreOrder(newPreOrder).catch((err: any) => console.error('[SQLite] addPreOrder error:', err));
    }

    set((state) => ({ 
      preOrders: [newPreOrder, ...state.preOrders],
      nextPreOrderNumber: state.nextPreOrderNumber + 1
    }));
    get().addActivity(`Pré-encomenda cadastrada: ${code}`, 'pre_order', 'Pré-Encomenda', 'Administrator', newPreOrder.id);
  },

  updatePreOrder: (id, data) => {
    let updatedPreOrder: PreOrder | null = null;
    set((state) => {
      const updatedPreOrders = state.preOrders.map(p => {
        if (p.id === id) {
          updatedPreOrder = { ...p, ...data };
          return updatedPreOrder;
        }
        return p;
      });
      
      const isDesktop = typeof window !== 'undefined' && !!(window as any).electron;
      const electronAPI = isDesktop ? (window as any).electron : null;
      if (isDesktop && electronAPI && electronAPI.db && updatedPreOrder) {
        electronAPI.db.updatePreOrder(id, updatedPreOrder).catch((err: any) => console.error('[SQLite] updatePreOrder error:', err));
      }
      
      return { preOrders: updatedPreOrders };
    });
    get().addActivity(`Pré-encomenda atualizada: ${id}`, 'pre_order', 'Pré-Encomenda', 'Administrator', id);
  },

  convertPreOrderToSale: (id) => {
    const { preOrders } = get();
    const preOrder = preOrders.find(p => p.id === id);
    if (!preOrder || preOrder.status === 'convertida') return;

    // Create sale data (simplified as it's from a pre-order)
    // Note: Pre-orders might not have full product data, so we might need a generic item or find products
    const saleData: Omit<Sale, 'id' | 'timestamp' | 'status'> = {
      items: [{
        id: 'generic-pre-order',
        name: `Item Pré-Encomenda: ${preOrder.productDescription}`,
        price: preOrder.finalValue || preOrder.estimatedValue,
        costPrice: 0,
        code: preOrder.orderCode,
        stock: 0,
        minStock: 0,
        unit: 'UN',
        category: 'Pré-Encomenda',
        active: true,
        quantity: 1,
        pickedQuantity: 0,
        wholesalePrice: 0
      }],
      subtotal: preOrder.finalValue || preOrder.estimatedValue,
      discount: 0,
      total: preOrder.finalValue || preOrder.estimatedValue,
      paymentMethodId: '1', // Default to cash
      paymentMethodName: 'Dinheiro',
      clientId: preOrder.clientId,
      orderNumber: '', // Will be set by addSale
      sellerName: 'Sistema',
      sellerLogin: 'sistema'
    };

    get().addSale(saleData);
    get().updatePreOrder(id, { status: 'convertida' });
    get().addActivity(`Pré-encomenda ${preOrder.orderCode} convertida em pedido`, 'pre_order', 'Pré-Encomenda', 'Administrator', id);
  },

  // Financial
  addTransaction: (transaction) => {
    const currentDeviceId = getOrCreateDeviceId();
    const currentTerminalId = get().activeTerminalId || null;
    
    // Determine cashMovementType based on category if not explicitly provided
    let cashMovementType = transaction.cashMovementType;
    if (!cashMovementType) {
      if (transaction.category === 'Suprimento' || transaction.category === 'Abertura de Caixa') {
        cashMovementType = 'suprimento';
      } else if (transaction.category === 'Sangria') {
        cashMovementType = 'sangria';
      } else if (transaction.category === 'Devolução de Venda') {
        cashMovementType = 'refund_cash';
      }
    }

    const newTransaction: FinancialTransaction = {
      deviceId: currentDeviceId,
      terminalId: currentTerminalId,
      caixaId: transaction.origin === 'caixa' ? transaction.originId : undefined,
      cashMovementType,
      ...transaction,
      id: generateUUID(),
      code: `FIN-${generateUUID().substring(0, 4).toUpperCase()}`,
      date: Date.now()
    };

    const isDesktop = typeof window !== 'undefined' && !!(window as any).electron;
    const electronAPI = isDesktop ? (window as any).electron : null;
    if (isDesktop && electronAPI && electronAPI.db) {
      electronAPI.db.insertFinancialTransaction(newTransaction).catch((err: any) => console.error('[SQLite] addTransaction error:', err));
    }

    set((state) => ({ 
      financialTransactions: [newTransaction, ...state.financialTransactions] 
    }));
    get().addActivity(`${transaction.type === 'entrada' ? 'Entrada' : 'Saída'} financeira registrada: ${transaction.description}`, 'financial', 'Financeiro', 'Administrator', newTransaction.id);
    get().logAction({ module: 'Financeiro', actionType: 'create', description: `Transação financeira: ${transaction.description} (Valor: R$ ${transaction.value.toFixed(2)})`, status: 'sucesso', referenceId: newTransaction.id });
  },

  updateTransaction: (id, data) => {
    const prevTransaction = get().financialTransactions.find(t => t.id === id);
    let updatedTransaction: FinancialTransaction | null = null;
    set((state) => {
      const updatedTransactions = state.financialTransactions.map(t => {
        if (t.id === id) {
          updatedTransaction = { ...t, ...data };
          return updatedTransaction;
        }
        return t;
      });
      
      const isDesktop = typeof window !== 'undefined' && !!(window as any).electron;
      const electronAPI = isDesktop ? (window as any).electron : null;
      if (isDesktop && electronAPI && electronAPI.db && updatedTransaction) {
        electronAPI.db.updateFinancialTransaction(id, updatedTransaction).catch((err: any) => console.error('[SQLite] updateFinancialTransaction error:', err));
      }
      
      return { financialTransactions: updatedTransactions };
    });
    get().addActivity(`Movimentação financeira atualizada: ${id}`, 'financial', 'Financeiro', 'Administrator', id);
    
    if (prevTransaction) {
      const isPaymentChanged = data.paymentMethodId && data.paymentMethodId !== prevTransaction.paymentMethodId;
      const isValueChanged = data.value !== undefined && data.value !== prevTransaction.value;
      
      let actionLabel = 'Movimentação financeira atualizada';
      if (isPaymentChanged && isValueChanged) {
        actionLabel = 'Pagamento e Valor alterados';
      } else if (isPaymentChanged) {
        actionLabel = 'Pagamento alterado';
      } else if (isValueChanged) {
        actionLabel = 'Valor alterado';
      }
      
      get().logAction({
        module: 'Financeiro',
        actionType: 'update',
        action: actionLabel,
        description: `Movimentação financeira #${prevTransaction.code} atualizada. ${isPaymentChanged ? `Pagamento alterado de ${prevTransaction.paymentMethodName} para ${data.paymentMethodName || data.paymentMethodId}` : ''} ${isValueChanged ? `Valor alterado de R$ ${prevTransaction.value.toFixed(2)} para R$ ${data.value?.toFixed(2)}` : ''}`,
        status: 'sucesso',
        referenceId: id,
        affectedEntity: 'Transação Financeira',
        entityId: id,
        previousValue: `Valor: R$ ${prevTransaction.value.toFixed(2)}, Pagamento: ${prevTransaction.paymentMethodName}`,
        newValue: `Valor: R$ ${(data.value ?? prevTransaction.value).toFixed(2)}, Pagamento: ${data.paymentMethodName ?? prevTransaction.paymentMethodName}`
      });
    }
  },

  // Retailers Actions
  addRetailer: (retailer, userName = 'Administrator') => {
    const newRetailer: Retailer = {
      ...retailer,
      id: generateUUID(),
      active: true,
      createdAt: Date.now()
    };
    set((state) => ({ retailers: [...state.retailers, newRetailer] }));
    get().addActivity(`Lojista cadastrado: ${retailer.name}`, 'client', 'Lojistas', userName, newRetailer.id);
  },

  updateRetailer: (id, data, userName = 'Administrator') => {
    set((state) => ({
      retailers: state.retailers.map(r => r.id === id ? { ...r, ...data } : r)
    }));
    get().addActivity(`Lojista atualizado: ${id}`, 'client', 'Lojistas', userName, id);
  },

  // Consignments Actions
  addConsignmentRemittance: (remittanceData, userName = 'Administrator') => {
    const newRemittance: ConsignmentRemittance = {
      ...remittanceData,
      id: generateUUID(),
      timestamp: Date.now(),
      status: 'em_consignacao' as const,
    };
    
    // Update stock immediately on remittance
    newRemittance.items.forEach(item => {
      get().updateStock(item.productId, -item.quantity);
    });

    const isDesktop = typeof window !== 'undefined' && !!(window as any).electron;
    const electronAPI = isDesktop ? (window as any).electron : null;
    const useSQLite = isDesktop && electronAPI && electronAPI.db;

    if (useSQLite) {
      electronAPI.db.insertConsignment(newRemittance).catch((err: any) => {
        console.error('[SQLite] Falha ao inserir remessa:', err);
      });
    }

    set((state) => ({
      consignmentRemittances: [newRemittance, ...state.consignmentRemittances]
    }));

    get().addActivity(`Remessa (${newRemittance.id}) enviada para lojista: ${newRemittance.retailerName}`, 'inventory', 'Lojistas', userName, newRemittance.id);
    get().logAction({ module: 'Lojistas', actionType: 'create', description: `Remessa para lojista: ${newRemittance.retailerName} (Valor total: R$ ${newRemittance.totalValue.toFixed(2)})`, status: 'sucesso', referenceId: newRemittance.id });
  },

  settleConsignment: (remittanceId, settlement, paymentMethodId, userName = 'Administrator') => {
    const { consignmentRemittances, paymentMethods } = get();
    const remittance = consignmentRemittances.find(r => r.id === remittanceId);
    if (!remittance) return;

    const pm = paymentMethods.find(p => p.id === paymentMethodId);
    let totalSettledValue = 0;

    const updatedRemittance = { ...remittance };
    updatedRemittance.items = updatedRemittance.items.map(item => {
      const settleInfo = settlement.find(s => s.productId === item.productId);
      if (settleInfo) {
        const newlySold = settleInfo.sold;
        const newlyReturned = settleInfo.returned;

        // Validation: cannot sell/return more than pending
        const pendingValue = item.quantity - item.soldQuantity - item.returnedQuantity;
        const actualSold = Math.min(newlySold, pendingValue);
        const actualReturned = Math.min(newlyReturned, pendingValue - actualSold);

        totalSettledValue += actualSold * item.unitPrice;

        // Return to stock
        if (actualReturned > 0) {
          get().updateStock(item.productId, actualReturned);
        }

        return {
          ...item,
          soldQuantity: item.soldQuantity + actualSold,
          returnedQuantity: item.returnedQuantity + actualReturned
        };
      }
      return item;
    });

    // Determine status
    const allProcessed = updatedRemittance.items.every(item => item.soldQuantity + item.returnedQuantity >= item.quantity);
    updatedRemittance.status = allProcessed ? 'finalizado' : 'parcialmente_vendido';

    // Financial Transaction only for SOLD items
    if (totalSettledValue > 0) {
      get().addTransaction({
        type: 'entrada',
        category: 'Acerto de Lojista',
        description: `Acerto Remessa #${remittance.id.substring(0, 4)} - ${remittance.retailerName}`,
        value: totalSettledValue,
        status: 'pago',
        origin: 'venda',
        originId: remittance.id,
        paymentMethodId: pm?.id,
        paymentMethodName: pm?.name
      });
    }

    const isDesktop = typeof window !== 'undefined' && !!(window as any).electron;
    const electronAPI = isDesktop ? (window as any).electron : null;
    const useSQLite = isDesktop && electronAPI && electronAPI.db;

    if (useSQLite) {
      electronAPI.db.updateConsignment(remittanceId, updatedRemittance).catch((err: any) => {
        console.error('[SQLite] Falha ao atualizar remessa durante acerto:', err);
      });
    }

    set((state) => ({
      consignmentRemittances: state.consignmentRemittances.map(r => r.id === remittanceId ? updatedRemittance : r)
    }));

    get().addActivity(`Acerto realizado para lojista: ${remittance.retailerName} - Valor: R$ ${totalSettledValue.toFixed(2)}`, 'financial', 'Lojistas', userName, remittanceId);
    get().logAction({ module: 'Lojistas', actionType: 'update', description: `Acerto de remessa #${remittance.id} - Lojista: ${remittance.retailerName}`, status: 'sucesso', referenceId: remittanceId });
  },

  updateConsignmentStatus: (id, status, userName = 'Administrator') => {
    set((state) => {
      const updatedList = state.consignmentRemittances.map(r => r.id === id ? { ...r, status } : r);
      const updated = updatedList.find(r => r.id === id);

      const isDesktop = typeof window !== 'undefined' && !!(window as any).electron;
      const electronAPI = isDesktop ? (window as any).electron : null;
      const useSQLite = isDesktop && electronAPI && electronAPI.db;

      if (useSQLite && updated) {
        electronAPI.db.updateConsignment(id, updated).catch((err: any) => {
          console.error('[SQLite] Falha ao atualizar status de remessa:', err);
        });
      }

      return { consignmentRemittances: updatedList };
    });
  },

  // Categories & Subcategories Actions
  addCategory: (category) => {
    const newCategory: Category = {
      ...category,
      id: generateUUID(),
    };

    const isDesktop = typeof window !== 'undefined' && !!(window as any).electron;
    const electronAPI = isDesktop ? (window as any).electron : null;
    const useSQLite = isDesktop && electronAPI && electronAPI.db;

    if (useSQLite) {
      electronAPI.db.insertCategory(newCategory).catch((err: any) => {
        console.error('[SQLite] Falha ao inserir categoria:', err);
      });
    }

    set((state) => ({ categories: [...state.categories, newCategory] }));
    get().addActivity(`Categoria cadastrada: ${category.name}`, 'inventory', 'Estoque');
  },

  updateCategory: (id, data) => {
    let updatedCategory: Category | undefined;

    set((state) => {
      const updatedCategories = state.categories.map(c => {
        if (c.id === id) {
          const updated = { ...c, ...data };
          updatedCategory = updated;
          return updated;
        }
        return c;
      });
      return { categories: updatedCategories };
    });

    const isDesktop = typeof window !== 'undefined' && !!(window as any).electron;
    const electronAPI = isDesktop ? (window as any).electron : null;
    const useSQLite = isDesktop && electronAPI && electronAPI.db;

    if (useSQLite && updatedCategory) {
      electronAPI.db.insertCategory(updatedCategory).catch((err: any) => {
        console.error('[SQLite] Falha ao atualizar categoria:', err);
      });
    }
  },

  deleteCategory: (id) => {
    // Also delete or inactivate subcategories
    const subcatsToDelete = (get().subcategories || []).filter(s => s.categoryId === id);
    subcatsToDelete.forEach(s => {
      get().addTombstone('subcategories', s.id);
    });
    get().addTombstone('categories', id);

    const isDesktop = typeof window !== 'undefined' && !!(window as any).electron;
    const electronAPI = isDesktop ? (window as any).electron : null;
    const useSQLite = isDesktop && electronAPI && electronAPI.db;

    if (useSQLite) {
      electronAPI.db.deleteCategory(id).catch((err: any) => {
        console.error('[SQLite] Falha ao deletar categoria no SQLite:', err);
      });
      electronAPI.db.deleteSubcategoriesByCategoryId(id).catch((err: any) => {
        console.error('[SQLite] Falha ao deletar subcategorias da categoria deletada:', err);
      });
    }

    set((state) => ({
      categories: state.categories.filter(c => c.id !== id),
      subcategories: state.subcategories.filter(s => s.categoryId !== id)
    }));
  },

  addSubcategory: (subcategory) => {
    const newSubcategory: Subcategory = {
      ...subcategory,
      id: generateUUID(),
    };

    const isDesktop = typeof window !== 'undefined' && !!(window as any).electron;
    const electronAPI = isDesktop ? (window as any).electron : null;
    const useSQLite = isDesktop && electronAPI && electronAPI.db;

    if (useSQLite) {
      electronAPI.db.insertSubcategory(newSubcategory).catch((err: any) => {
        console.error('[SQLite] Falha ao inserir subcategoria:', err);
      });
    }

    set((state) => ({ subcategories: [...state.subcategories, newSubcategory] }));
    get().addActivity(`Subcategoria cadastrada: ${subcategory.name}`, 'inventory', 'Estoque');
  },

  updateSubcategory: (id, data) => {
    let updatedSub: Subcategory | undefined;

    set((state) => {
      const updatedSubcategories = state.subcategories.map(s => {
        if (s.id === id) {
          const updated = { ...s, ...data };
          updatedSub = updated;
          return updated;
        }
        return s;
      });
      return { subcategories: updatedSubcategories };
    });

    const isDesktop = typeof window !== 'undefined' && !!(window as any).electron;
    const electronAPI = isDesktop ? (window as any).electron : null;
    const useSQLite = isDesktop && electronAPI && electronAPI.db;

    if (useSQLite && updatedSub) {
      electronAPI.db.insertSubcategory(updatedSub).catch((err: any) => {
        console.error('[SQLite] Falha ao atualizar subcategoria', err);
      });
    }
  },

  deleteSubcategory: (id) => {
    get().addTombstone('subcategories', id);

    const isDesktop = typeof window !== 'undefined' && !!(window as any).electron;
    const electronAPI = isDesktop ? (window as any).electron : null;
    const useSQLite = isDesktop && electronAPI && electronAPI.db;

    if (useSQLite) {
      electronAPI.db.deleteSubcategory(id).catch((err: any) => {
        console.error('[SQLite] Falha ao deletar subcategoria no SQLite:', err);
      });
    }

    set((state) => ({
      subcategories: state.subcategories.filter(s => s.id !== id)
    }));
  },

  // Production Cost Actions
  addMachine: (machine) => {
    const newMachine: Machine = {
      ...machine,
      id: generateUUID(),
      active: true
    };

    const isDesktop = typeof window !== 'undefined' && !!(window as any).electron;
    const electronAPI = isDesktop ? (window as any).electron : null;
    const useSQLite = isDesktop && electronAPI && electronAPI.db;

    if (useSQLite) {
      electronAPI.db.insertMachine(newMachine).catch((err: any) => {
        console.error('[SQLite] Falha ao inserir máquina:', err);
      });
    }

    set((state) => ({ machines: [...state.machines, newMachine] }));
    get().addActivity(`Máquina cadastrada: ${machine.name}`, 'inventory', 'Custos');
  },

  updateMachine: (id, data) => {
    set((state) => {
      const updatedMachines = state.machines.map(m => m.id === id ? { ...m, ...data } : m);
      const updated = updatedMachines.find(m => m.id === id);

      const isDesktop = typeof window !== 'undefined' && !!(window as any).electron;
      const electronAPI = isDesktop ? (window as any).electron : null;
      const useSQLite = isDesktop && electronAPI && electronAPI.db;

      if (useSQLite && updated) {
        electronAPI.db.updateMachine(id, updated).catch((err: any) => {
          console.error('[SQLite] Falha ao atualizar máquina:', err);
        });
      }

      return { machines: updatedMachines };
    });
  },

  deleteMachine: (id) => {
    get().addTombstone('machines', id);
    
    set((state) => {
      const targetMachine = state.machines.find(m => m.id === id);

      const isDesktop = typeof window !== 'undefined' && !!(window as any).electron;
      const electronAPI = isDesktop ? (window as any).electron : null;
      const useSQLite = isDesktop && electronAPI && electronAPI.db;

      if (useSQLite && targetMachine) {
        // Soft delete inside SQLite data_json to filter out the record
        electronAPI.db.updateMachine(id, { ...targetMachine, deletedAt: Date.now() }).catch((err: any) => {
          console.error('[SQLite] Falha ao excluir máquina:', err);
        });
      }

      return {
        machines: state.machines.filter(m => m.id !== id)
      };
    });
  },

  saveSimulation: (simulation) => {
    const newSimulation: ProductionSimulation = {
      ...simulation,
      id: generateUUID(),
      timestamp: Date.now()
    };
    set((state) => ({ productionSimulations: [newSimulation, ...state.productionSimulations] }));
    get().addActivity(`Simulação de produção salva: ${simulation.name}`, 'inventory', 'Custos');
  },

  deleteSimulation: (id) => {
    get().addTombstone('productionSimulations', id);
    set((state) => ({
      productionSimulations: state.productionSimulations.filter(s => s.id !== id)
    }));
  },

  // Materials & Productions Actions
  addMaterial: (material, userName = 'Administrator') => {
    const unitCost = material.totalCost / (material.totalPurchaseQuantity || 1);
    const newMaterial: Material = {
      ...material,
      id: generateUUID(),
      unitCost,
      currentQuantity: material.totalPurchaseQuantity
    };

    const isDesktop = typeof window !== 'undefined' && !!(window as any).electron;
    const electronAPI = isDesktop ? (window as any).electron : null;
    const useSQLite = isDesktop && electronAPI && electronAPI.db;

    if (useSQLite) {
      electronAPI.db.insertMaterial(newMaterial).catch((err: any) => {
        console.error('[SQLite] Falha ao inserir matéria-prima:', err);
      });
    }

    set((state) => ({
      materials: [...state.materials, newMaterial]
    }));
    get().addActivity(`Material cadastrado: ${newMaterial.name}`, 'inventory', 'Custo de Produção', userName);
    get().logAction({ module: 'Custo de Produção', actionType: 'create', description: `Cadastro de material: ${newMaterial.name}`, status: 'sucesso', referenceId: newMaterial.id });
  },

  updateMaterial: (id, data, userName = 'Administrator') => {
    set((state) => {
      const updatedMaterials = state.materials.map(m => {
        if (m.id === id) {
          const updated = { ...m, ...data };
          if (data.totalCost !== undefined || data.totalPurchaseQuantity !== undefined) {
            updated.unitCost = updated.totalCost / (updated.totalPurchaseQuantity || 1);
          }
          return updated;
        }
        return m;
      });

      const updated = updatedMaterials.find(m => m.id === id);

      const isDesktop = typeof window !== 'undefined' && !!(window as any).electron;
      const electronAPI = isDesktop ? (window as any).electron : null;
      const useSQLite = isDesktop && electronAPI && electronAPI.db;

      if (useSQLite && updated) {
        electronAPI.db.updateMaterial(id, updated).catch((err: any) => {
          console.error('[SQLite] Falha ao atualizar matéria-prima:', err);
        });
      }

      return { materials: updatedMaterials };
    });
    get().addActivity(`Material atualizado: ${id}`, 'inventory', 'Custo de Produção', userName);
    get().logAction({ module: 'Custo de Produção', actionType: 'update', description: `Atualização de material ID: ${id}`, status: 'sucesso', referenceId: id });
  },

  deleteMaterial: (id, userName = 'Administrator') => {
    get().addTombstone('materials', id, userName);
    
    set((state) => {
      const targetMaterial = state.materials.find(m => m.id === id);

      const isDesktop = typeof window !== 'undefined' && !!(window as any).electron;
      const electronAPI = isDesktop ? (window as any).electron : null;
      const useSQLite = isDesktop && electronAPI && electronAPI.db;

      if (useSQLite && targetMaterial) {
        electronAPI.db.updateMaterial(id, { ...targetMaterial, deletedAt: Date.now() }).catch((err: any) => {
          console.error('[SQLite] Falha ao excluir matéria-prima:', err);
        });
      }

      return {
        materials: state.materials.filter(m => m.id !== id)
      };
    });
    get().addActivity(`Material removido: ${id}`, 'inventory', 'Custo de Produção', userName);
    get().logAction({ module: 'Custo de Produção', actionType: 'delete', description: `Exclusão de material ID: ${id}`, status: 'sucesso', referenceId: id });
  },

  addProduction: (production, userName = 'Administrator') => {
    const newProduction: ProductionRecipe = {
      ...production,
      id: generateUUID(),
      createdAt: Date.now()
    };

    const isDesktop = typeof window !== 'undefined' && !!(window as any).electron;
    const electronAPI = isDesktop ? (window as any).electron : null;
    const useSQLite = isDesktop && electronAPI && electronAPI.db;

    if (useSQLite) {
      electronAPI.db.insertProduction(newProduction).catch((err: any) => {
        console.error('[SQLite] Falha ao inserir ficha técnica:', err);
      });
    }

    set((state) => ({
      productions: [...state.productions, newProduction]
    }));
    get().addActivity(`Ficha técnica criada: ${newProduction.name}`, 'inventory', 'Custo de Produção', userName);
    get().logAction({ module: 'Custo de Produção', actionType: 'create', description: `Criação de ficha técnica: ${newProduction.name}`, status: 'sucesso', referenceId: newProduction.id });
  },

  updateProduction: (id, data, userName = 'Administrator') => {
    set((state) => {
      const updatedProductions = state.productions.map(p => p.id === id ? { ...p, ...data } : p);
      const updatedProd = updatedProductions.find(p => p.id === id);
      
      const updatedProducts = state.products.map(product => {
        if (product.productionId === id && updatedProd) {
          const qty = updatedProd.quantity;
          if (qty !== undefined && qty !== null && qty > 0 && !isNaN(qty)) {
            return {
              ...product,
              costPrice: updatedProd.totalCost / qty
            };
          }
        }
        return product;
      });

      const isDesktop = typeof window !== 'undefined' && !!(window as any).electron;
      const electronAPI = isDesktop ? (window as any).electron : null;
      const useSQLite = isDesktop && electronAPI && electronAPI.db;

      if (useSQLite && updatedProd) {
        electronAPI.db.updateProduction(id, updatedProd).catch((err: any) => {
          console.error('[SQLite] Falha ao atualizar ficha técnica:', err);
        });

        // Atualizar produtos afetados no SQLite
        updatedProducts.forEach(product => {
          if (product.productionId === id) {
            electronAPI.db.insertProduct(product).catch((err: any) => {
              console.error('[SQLite] Falha ao atualizar custo de produto afetado:', err);
            });
          }
        });
      }

      return {
        productions: updatedProductions,
        products: updatedProducts
      };
    });
    get().addActivity(`Ficha técnica atualizada: ${id}`, 'inventory', 'Custo de Produção', userName);
    get().logAction({ module: 'Custo de Produção', actionType: 'update', description: `Atualização de ficha técnica ID: ${id}`, status: 'sucesso', referenceId: id });
  },

  deleteProduction: (id, userName = 'Administrator') => {
    get().addTombstone('productions', id, userName);
    
    set((state) => {
      const targetProd = state.productions.find(p => p.id === id);

      const isDesktop = typeof window !== 'undefined' && !!(window as any).electron;
      const electronAPI = isDesktop ? (window as any).electron : null;
      const useSQLite = isDesktop && electronAPI && electronAPI.db;

      if (useSQLite && targetProd) {
        electronAPI.db.updateProduction(id, { ...targetProd, deletedAt: Date.now() }).catch((err: any) => {
          console.error('[SQLite] Falha ao excluir ficha técnica:', err);
        });
      }

      return {
        productions: state.productions.filter(p => p.id !== id)
      };
    });
    get().addActivity(`Ficha técnica removida: ${id}`, 'inventory', 'Custo de Produção', userName);
    get().logAction({ module: 'Custo de Produção', actionType: 'delete', description: `Exclusão de ficha técnica ID: ${id}`, status: 'sucesso', referenceId: id });
  },

  addProductionRun: (run, userName = 'Administrator') => {
    const newRun: ProductionRun = {
      ...run,
      id: generateUUID(),
      createdAt: Date.now()
    };

    set((state) => {
      const updatedMaterials = state.materials.map(m => {
        const consumption = run.materialConsumptions.find(item => item.materialId === m.id);
        if (consumption) {
          return {
            ...m,
            currentQuantity: Math.max(0, m.currentQuantity - consumption.quantityUsed)
          };
        }
        return m;
      });

      const updatedProducts = state.products.map(p => {
        if (p.id === run.productId) {
          return {
            ...p,
            stock: (p.stock || 0) + run.quantityProduced,
            costPrice: run.unitCost
          };
        }
        return p;
      });

      const isDesktop = typeof window !== 'undefined' && !!(window as any).electron;
      const electronAPI = isDesktop ? (window as any).electron : null;
      const useSQLite = isDesktop && electronAPI && electronAPI.db;

      if (useSQLite) {
        // 1. Persist the run
        electronAPI.db.insertProductionRun(newRun).catch((err: any) => {
          console.error('[SQLite] Falha ao inserir lote de produção:', err);
        });

        // 2. Persist updated materials that changed
        updatedMaterials.forEach(m => {
          const consumption = run.materialConsumptions.find(item => item.materialId === m.id);
          if (consumption) {
            electronAPI.db.insertMaterial(m).catch((err: any) => {
              console.error('[SQLite] Falha ao atualizar matéria-prima consumida no lote:', err);
            });
          }
        });

        // 3. Persist the updated product
        const changedProduct = updatedProducts.find(p => p.id === run.productId);
        if (changedProduct) {
          electronAPI.db.insertProduct(changedProduct).catch((err: any) => {
            console.error('[SQLite] Falha ao atualizar estoque de produto produzido no lote:', err);
          });
        }
      }

      return {
        productionRuns: [newRun, ...(state.productionRuns || [])],
        materials: updatedMaterials,
        products: updatedProducts
      };
    });

    get().addActivity(`Produção registrada: Ficha #${run.productionId} (${run.quantityProduced} un)`, 'inventory', 'Custo de Produção', userName);
    get().logAction({
      module: 'Custo de Produção',
      actionType: 'create',
      description: `Registro de produção real para o produto final ID: ${run.productId} (${run.quantityProduced} un)`,
      status: 'sucesso',
      referenceId: newRun.id
    });
  },

  deleteProductionRun: (id, userName = 'Administrator') => {
    get().addTombstone('productionRuns', id, userName);
    
    set((state) => {
      const targetRun = (state.productionRuns || []).find(r => r.id === id);

      const isDesktop = typeof window !== 'undefined' && !!(window as any).electron;
      const electronAPI = isDesktop ? (window as any).electron : null;
      const useSQLite = isDesktop && electronAPI && electronAPI.db;

      if (useSQLite && targetRun) {
        // Soft delete inside SQLite data_json to filter out the record
        electronAPI.db.updateProductionRun(id, { ...targetRun, deletedAt: Date.now() }).catch((err: any) => {
          console.error('[SQLite] Falha ao excluir lote de produção:', err);
        });
      }

      return {
        productionRuns: (state.productionRuns || []).filter(r => r.id !== id)
      };
    });

    get().addActivity(`Registro de produção removido: ${id}`, 'inventory', 'Custo de Produção', userName);
    get().logAction({
      module: 'Custo de Produção',
      actionType: 'delete',
      description: `Exclusão de registro de produção ID: ${id}`,
      status: 'sucesso',
      referenceId: id
    });
  },

  consumeMaterials: (productId, quantity) => {
    const { products, productions, materials } = get();
    const product = products.find(p => p.id === productId);
    if (!product || !product.productionId) return;

    const recipe = productions.find(r => r.id === product.productionId);
    if (!recipe) return;

    recipe.items.forEach(item => {
      const consumption = item.quantity * quantity;
      const material = materials.find(m => m.id === item.materialId);
      if (material) {
        get().updateMaterial(item.materialId, {
          currentQuantity: Math.max(0, material.currentQuantity - consumption)
        });
      }
    });
  },

  // Delivery Methods
  addDeliveryMethod: async (method) => {
    const newMethod: DeliveryMethod = {
      ...method,
      id: generateUUID(),
    };
    const backup = get().deliveryMethods;
    set((state) => ({ deliveryMethods: [...state.deliveryMethods, newMethod] }));
    try {
      await get().saveSystemListsToSQLite();
    } catch (err: any) {
      set({ deliveryMethods: backup });
      throw err;
    }
  },

  updateDeliveryMethod: async (id, data) => {
    const backup = get().deliveryMethods;
    set((state) => ({
      deliveryMethods: state.deliveryMethods.map(m => m.id === id ? { ...m, ...data } : m)
    }));
    try {
      await get().saveSystemListsToSQLite();
    } catch (err: any) {
      set({ deliveryMethods: backup });
      throw err;
    }
  },

  deleteDeliveryMethod: async (id) => {
    const method = get().deliveryMethods.find(m => m.id === id);
    if (method?.isDefault) return;
    const backup = get().deliveryMethods;
    get().addTombstone('deliveryMethods', id);
    set((state) => ({
      deliveryMethods: state.deliveryMethods.filter(m => m.id !== id)
    }));
    try {
      await get().saveSystemListsToSQLite();
    } catch (err: any) {
      set({ deliveryMethods: backup });
      throw err;
    }
  },

  // Returns Actions
  addReturn: (returnRecord, userName = 'Administrator') => {
    const currentState = get();
    const sale = currentState.sales.find(s => s.id === returnRecord.saleId);
    if (!sale) {
      throw new Error("Venda original não encontrada.");
    }
    const saleItem = sale.items?.find(item => item.id === returnRecord.productId);
    if (!saleItem) {
      throw new Error("Item não encontrado na venda original.");
    }

    const previousReturnsTotal = (currentState.returns || [])
      .filter(r => r.saleId === returnRecord.saleId && r.productId === returnRecord.productId)
      .reduce((sum, r) => sum + r.quantity, 0);

    const availableToReturn = saleItem.quantity - previousReturnsTotal;

    if (returnRecord.quantity <= 0) {
      throw new Error("Quantidade de devolução inválida.");
    }

    if (returnRecord.quantity > availableToReturn) {
      throw new Error("Quantidade inválida: este item já teve devoluções anteriores e não possui saldo suficiente para nova devolução.");
    }

    const newReturn: ReturnRecord = {
      ...returnRecord,
      id: generateUUID(),
      timestamp: Date.now()
    };

    const isDesktop = typeof window !== 'undefined' && !!(window as any).electron;
    const electronAPI = isDesktop ? (window as any).electron : null;
    const useSQLite = isDesktop && electronAPI && electronAPI.db;

    if (useSQLite) {
      electronAPI.db.insertReturn(newReturn).catch((err: any) => {
        console.error('[SQLite] Falha ao inserir registro de devolução:', err);
      });
    }

    set((state) => ({ returns: [...state.returns, newReturn] }));

    // Update Product Stock if needed
    if (newReturn.returnToStock) {
      get().updateStock(newReturn.productId, newReturn.quantity);
    }

    // Add activity
    get().addActivity(
      `Devolução registrada: ${newReturn.quantity}x ${newReturn.productName} (Pedido #${newReturn.orderNumber})`,
      'inventory',
      'Devolução',
      userName,
      newReturn.id
    );

    get().logAction({ module: 'Devolução', actionType: 'cancel', description: `Devolução registrada: Pedido #${newReturn.orderNumber} - Produto: ${newReturn.productName}`, status: 'sucesso', referenceId: newReturn.id });

    // Register financial adjustment
    const product = get().products.find(p => p.id === newReturn.productId);
    const historicalPrice = saleItem?.price !== undefined ? saleItem.price : (product?.price || 0);
    const refundValue = safeMultiply(historicalPrice, newReturn.quantity);

    const currentCashier = get().currentCashier;
    const isMoneyRefund = newReturn.refundViaCashierMoney && !!currentCashier;

    let transactionStatus: 'pago' | 'pendente' = 'pendente';
    let transactionOrigin: 'caixa' | 'manual' = 'manual';
    let transactionOriginId: string | undefined = newReturn.id;
    let paymentMethodId: string | undefined = undefined;
    let paymentMethodName: string | undefined = undefined;

    if (isMoneyRefund && currentCashier) {
      transactionStatus = 'pago';
      transactionOrigin = 'caixa';
      transactionOriginId = currentCashier.id;

      const pms = get().paymentMethods;
      const cashPm = pms.find(pm => pm.type === 'money');
      if (cashPm) {
        paymentMethodId = cashPm.id;
        paymentMethodName = cashPm.name;
      } else {
        paymentMethodId = 'money';
        paymentMethodName = 'Dinheiro';
      }

      // Impact expected cashier totals
      // DOCUMENTATION:
      // Since CashierSession does not have dedicated fields for refunds/outflows,
      // and expected closing balance depends exclusively on openingBalance + totalSales,
      // a cash refund MUST directly reduce totalSales and paymentMethodTotals to ensure
      // the expected closing balance matches the physical cash remaining in the drawer.
      // A corresponding 'saida' financial transaction is created below for full auditability
      // and reports compliance.
      const updatedCashier = { ...currentCashier };
      updatedCashier.totalSales = safeSubtract(updatedCashier.totalSales, refundValue);
      if (paymentMethodId) {
        updatedCashier.paymentMethodTotals[paymentMethodId] = safeSubtract(updatedCashier.paymentMethodTotals[paymentMethodId] || 0, refundValue);
      }

      const isDesktop = typeof window !== 'undefined' && !!(window as any).electron;
      const electronAPI = isDesktop ? (window as any).electron : null;
      if (isDesktop && electronAPI && electronAPI.db) {
        electronAPI.db.insertCashierSession(updatedCashier).catch((err: any) => console.error('[SQLite] refund cashier error:', err));
      }

      set({ currentCashier: updatedCashier });
    }

    get().addTransaction({
      type: 'saida',
      category: 'Devolução de Venda',
      description: `Estorno/Devolução Pedido #${newReturn.orderNumber} - ${newReturn.productName}`,
      value: refundValue,
      status: transactionStatus,
      origin: transactionOrigin,
      originId: transactionOriginId,
      paymentMethodId,
      paymentMethodName,
      notes: `Motivo: ${newReturn.reason}. Obs: ${newReturn.notes || 'N/A'}`,
      
      // Traceability fields required for returns reconciliation
      tipo: 'devolucao',
      returnType: 'devolucao',
      origemVendaId: newReturn.saleId,
      caixaId: currentCashier?.id,
      operador: userName,
      timestamp: Date.now()
    } as any);
  },

  // User Management
  addUser: async (userData: Omit<User, 'id'> & { id?: string }) => {
    const newUser: User = { ...userData, id: userData.id || generateUUID() };
    const isDesktop = typeof window !== 'undefined' && !!(window as any).electron;
    const electronAPI = isDesktop ? (window as any).electron : null;
    if (isDesktop && electronAPI && electronAPI.db) {
      try {
        const success = await electronAPI.db.insertUser(newUser);
        if (!success) {
          throw new Error('Falha no SQLite ao adicionar usuário.');
        }
      } catch (err: any) {
        console.error('[SQLite] addUser error:', err);
        throw new Error(`[SQLite] Falha ao adicionar usuário: ${err.message || err}`);
      }
    }
    set((state) => ({ 
      users: [...state.users, newUser],
      badges: newUser.badgeId 
        ? (state.badges || []).map(b => b.id === newUser.badgeId ? { ...b, status: 'Vinculado', usuarioVinculado: newUser.id } : b)
        : state.badges
    }));
    get().logAction({ 
      module: 'Usuários e Funções', 
      actionType: 'create', 
      action: 'Criar Usuário',
      description: `Novo usuário criado: ${userData.login} (${userData.fullName})`, 
      status: 'sucesso', 
      referenceId: newUser.id,
      affectedEntity: 'Usuário',
      entityId: newUser.id,
      newValue: `Login: ${userData.login}, RolId: ${userData.roleId || 'Padrão'}`
    });
  },
  updateUser: async (id, data) => {
    const user = get().users.find(u => u.id === id);
    if (!user) return;

    // Protection for Master Admin / ADM user (principal admin admin)
    const isAdmLogin = user.id === 'admin' || user.isMasterAdmin || user.isOwner || user.login === 'admin';
    const updatedData = { ...data };

    // Prevent privilege escalation: if data edits admin flags, the current session operator has to be authorized (isAdmin || isMasterAdmin || isOwner)
    const isEditingAdminFlags = data.isAdmin !== undefined || data.isOwner !== undefined || data.isMasterAdmin !== undefined;
    if (isEditingAdminFlags && !isAdmLogin) {
      const activeOperator = get().currentUser;
      const isOperatorMaster = activeOperator && (activeOperator.isMasterAdmin || activeOperator.isOwner || activeOperator.isAdmin);
      if (!isOperatorMaster) {
        get().logAction({
          module: 'Usuários e Funções',
          actionType: 'update',
          action: 'Escalada de Privilégio Bloqueada',
          description: `Tentativa barrada de alteração de flags administrativas por operador não-mestre (${activeOperator ? activeOperator.login : 'N/A'}) no usuário ${user.login}`,
          status: 'bloqueado',
          riskLevel: 'alto'
        });
        // Block modification of admin flags for non-authorized operators
        delete updatedData.isAdmin;
        delete updatedData.isOwner;
        delete updatedData.isMasterAdmin;
      }
    }
    
    if (isAdmLogin) {
      // ADM cannot be inactivated or lose admin status
      updatedData.isAdmin = true;
      updatedData.status = 'ativo';
      updatedData.isOwner = true;
      updatedData.isMasterAdmin = true;
      if (!updatedData.login) updatedData.login = user.login || 'admin';
    }

    // Protection against orphaned badges: if user status is set to 'inativo', force release of their badge
    if (updatedData.status === 'inativo') {
      const activeBadge = (get().badges || []).find(b => b.usuarioVinculado === id);
      if (activeBadge || user.badgeId) {
        const badgeIdToRelease = activeBadge ? activeBadge.id : user.badgeId;
        updatedData.badgeId = undefined; // clear reference
        
        get().logAction({
          module: 'Usuários e Funções',
          actionType: 'update',
          description: `Crachá desvinculado por inativação do usuário: ${user.fullName || user.login} (Crachá: ${activeBadge ? activeBadge.codigoCracha : 'N/A'})`,
          status: 'sucesso',
          referenceId: badgeIdToRelease
        });
        get().addActivity(`Crachá desvinculado por inativação de ${user.fullName || user.login}`, 'auth', 'Usuários e Funções');
      }
    }

    const updatedUser = { ...user, ...updatedData };

    const isDesktop = typeof window !== 'undefined' && !!(window as any).electron;
    const electronAPI = isDesktop ? (window as any).electron : null;
    if (isDesktop && electronAPI && electronAPI.db) {
      try {
        const success = await electronAPI.db.updateUser(id, updatedUser);
        if (!success) {
          throw new Error('Falha no SQLite ao atualizar usuário.');
        }
      } catch (err: any) {
        console.error('[SQLite] updateUser error:', err);
        throw new Error(`[SQLite] Falha ao atualizar usuário: ${err.message || err}`);
      }
    }

    // Badge synchronization
    const oldBadgeId = user.badgeId;
    const newBadgeId = updatedData.badgeId;

    set((state) => {
      let updatedBadges = [...(state.badges || [])];
      
      if (oldBadgeId !== newBadgeId) {
        if (oldBadgeId) {
          updatedBadges = updatedBadges.map(b => b.id === oldBadgeId ? { ...b, status: 'Livre', usuarioVinculado: null } : b);
        }
        if (newBadgeId) {
          updatedBadges = updatedBadges.map(b => b.id === newBadgeId ? { ...b, status: 'Vinculado', usuarioVinculado: id } : b);
        }
      }

      return {
        users: state.users.map(u => u.id === id ? updatedUser : u),
        currentUser: state.currentUser?.id === id ? { ...state.currentUser, ...updatedData } : state.currentUser,
        badges: updatedBadges
      };
    });

    const isPasswordChanged = data.password && data.password !== user.password;
    const isRoleChanged = (data.roleId && data.roleId !== user.roleId) || (data.isAdmin !== undefined && data.isAdmin !== user.isAdmin);
    
    let actionLabel = 'Usuário editado';
    if (isPasswordChanged) {
      actionLabel = 'Senha alterada';
    } else if (isRoleChanged) {
      actionLabel = 'Permissão alterada';
    }

    get().logAction({ 
      module: 'Usuários e Funções', 
      actionType: 'update', 
      action: actionLabel,
      description: `${actionLabel}: Usuário ${user.login} atualizado${isPasswordChanged ? ' (Senha modificada)' : ''}${isRoleChanged ? ' (Permissões de acesso alteradas)' : ''}`, 
      status: 'sucesso', 
      referenceId: id,
      affectedEntity: 'Usuário',
      entityId: id,
      previousValue: `Admin: ${user.isAdmin}, Ativo: ${user.status}, RoleId: ${user.roleId}`,
      newValue: `Admin: ${updatedData.isAdmin ?? user.isAdmin}, Ativo: ${updatedData.status ?? user.status}, RoleId: ${updatedData.roleId ?? user.roleId}`
    });
  },
  registerExistingQRCode: (qrCodeId, targetUserId, forceTransfer = false) => {
    const cleanQrId = qrCodeId.trim();
    if (!cleanQrId) {
      return { success: false, message: 'QR Code lido é vazio!' };
    }

    const state = get();
    const responsibleAdmin = state.currentUser?.fullName || 'ADMINISTRADOR';

    // 1. Verificar se esse qrCodeId já existe na base (vinculado a outro usuário ou crachá)
    const existingUser = state.users.find(u => u.id !== targetUserId && (u.qrCodeToken === cleanQrId || u.externalQrId === cleanQrId));
    const existingBadge = (state.badges || []).find(b => b.usuarioVinculado !== targetUserId && b.codigoCracha === cleanQrId);

    if (existingUser || existingBadge) {
      const boundUserId = existingUser ? existingUser.id : (existingBadge ? existingBadge.usuarioVinculado : null);
      const boundUser = boundUserId ? state.users.find(u => u.id === boundUserId) : null;
      const userName = boundUser ? boundUser.fullName : 'Outro Usuário';
      const userLogin = boundUser ? boundUser.login : 'Desconhecido';

      if (!forceTransfer) {
        return {
          success: false,
          alreadyExists: true,
          message: `Este QR Code "${cleanQrId}" já está vinculado ao usuário: ${userName} (Login: ${userLogin}). Deseja transferir e atualizar o vínculo para este usuário?`,
          userName,
          userLogin,
          boundUserId
        };
      } else {
        // Transfer relationship from previous user
        if (boundUserId) {
          set(state => ({
            users: state.users.map(u => u.id === boundUserId ? { ...u, qrCodeToken: '', externalQrId: '', badgeId: u.badgeId === existingBadge?.id ? undefined : u.badgeId } : u)
          }));
        }
        if (existingBadge) {
          set(state => ({
            badges: (state.badges || []).map(b => b.id === existingBadge.id ? { ...b, status: 'Livre', usuarioVinculado: null } : b)
          }));
        }
      }
    }

    const targetUser = state.users.find(u => u.id === targetUserId);
    if (!targetUser) {
      return { success: false, message: 'Usuário alvo não encontrado.' };
    }

    // 3. Gerar um novo ACCESS_KEY/PIN interno seguro usando a mesma lógica do crachá de acesso
    const generateCode = (): string => {
      const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
      let code = 'LF_';
      for (let i = 0; i < 7; i++) {
        code += chars.charAt(Math.floor(Math.random() * chars.length));
      }
      return code;
    };
    let accessKey = generateCode();
    // guarantee uniqueness
    while (state.users.some(u => u.accessKey === accessKey)) {
      accessKey = generateCode();
    }

    // 4. Vincular: QR_CODE_ID escaneado → ACCESS_KEY interna → usuário/matrícula ADM atual ou usuário selecionado.
    let badgeId = targetUser.badgeId;
    if (badgeId) {
      set(state => ({
        badges: (state.badges || []).map(b => b.id === badgeId ? { ...b, codigoCracha: cleanQrId, status: 'Vinculado', usuarioVinculado: targetUserId } : b)
      }));
    } else {
      // Create a physical badge representation with the exact QR_CODE_ID
      const newBadgeId = generateUUID();
      const newBadge: Badge = {
        id: newBadgeId,
        codigoCracha: cleanQrId,
        status: 'Vinculado',
        usuarioVinculado: targetUserId,
        dataCriacao: Date.now(),
        ultimoUso: null
      };
      set(state => ({
        badges: [...(state.badges || []), newBadge]
      }));
      badgeId = newBadgeId;
    }

    // Update target user fields
    set(state => ({
      users: state.users.map(u => u.id === targetUserId ? {
        ...u,
        qrCodeToken: cleanQrId,
        externalQrId: cleanQrId,
        accessKey: accessKey,
        badgeId: badgeId
      } : u),
      currentUser: state.currentUser?.id === targetUserId ? {
        ...state.currentUser,
        qrCodeToken: cleanQrId,
        externalQrId: cleanQrId,
        accessKey: accessKey,
        badgeId: badgeId
      } : state.currentUser
    }));

    // 5. Registrar auditoria da ação: QR_CODE_ID lido, usuário vinculado, ADM responsável, data/hora e resultado.
    get().logAction({
      module: 'Segurança',
      actionType: 'security',
      action: 'Vínculo QR Existente',
      description: `QR Code Existente vinculado com sucesso. QR_CODE_ID bruto lido: ${cleanQrId}, ACCESS_KEY interna gerada: ${accessKey}, Usuário Vinculado: ${targetUser.fullName} (Login: ${targetUser.login}, Matrícula: ${targetUser.matricula || 'Sem matrícula'}). ADM Responsável: ${responsibleAdmin}`,
      status: 'sucesso',
      newValue: `QR_CODE_ID: ${cleanQrId} | ACCESS_KEY: ${accessKey}`,
      referenceId: targetUserId
    });

    return {
      success: true,
      message: `QR Code existente vinculado com sucesso! Uma chave interna segura (ACCESS_KEY) foi gerada e associada: ${accessKey}`
    };
  },
  enrollFaceBiometric: (userId, data) => {
    const user = get().users.find(u => u.id === userId);
    const isAdm = user ? (user.id === 'admin' || user.isMasterAdmin || user.isOwner || user.login === 'admin') : false;
    
    // Explicitly set biometricOwnerType
    const ownerType: 'admin' | 'master' | 'employee' = isAdm ? (user?.isMasterAdmin ? ('master' as const) : ('admin' as const)) : ('employee' as const);
    const enrichedData = {
      ...data,
      biometricOwnerType: ownerType
    };

    get().updateUser(userId, { faceBiometric: enrichedData });

    const isRecadastro = !!user?.faceBiometric;
    const actionName = isAdm 
      ? (isRecadastro ? 'Recadastro Facial ADM' : 'Cadastro Facial ADM') 
      : (isRecadastro ? 'Recadastro Facial de Colaborador' : 'Cadastro Facial de Colaborador');

    get().logAction({
      module: 'Segurança',
      actionType: 'update',
      action: actionName,
      description: `${actionName} efetuado para o usuário ${user?.fullName || userId} (${user?.login || 'N/A'})`,
      status: 'sucesso',
      referenceId: userId,
      affectedEntity: 'Usuário',
      entityId: userId,
      newValue: 'Biometria Cadastrada'
    });
  },
  removeFaceBiometric: (userId) => {
    const user = get().users.find(u => u.id === userId);
    const isAdm = user ? (user.id === 'admin' || user.isMasterAdmin || user.isOwner || user.login === 'admin') : false;

    get().updateUser(userId, { faceBiometric: undefined });

    const actionName = isAdm ? 'Remoção Facial ADM' : 'Remoção Facial de Colaborador';

    get().logAction({
      module: 'Segurança',
      actionType: 'update',
      action: actionName,
      description: `Remoção de biometria facial para o usuário ${user?.fullName || userId} (${user?.login || 'N/A'})`,
      status: 'sucesso',
      referenceId: userId,
      affectedEntity: 'Usuário',
      entityId: userId,
      newValue: 'Biometria Removida'
    });
  },
  addUserRole: async (roleData) => {
    const newRole: UserRole = { ...roleData, id: generateUUID() };
    const isDesktop = typeof window !== 'undefined' && !!(window as any).electron;
    const electronAPI = isDesktop ? (window as any).electron : null;
    if (isDesktop && electronAPI && electronAPI.db) {
      try {
        const success = await electronAPI.db.insertPermission(newRole);
        if (!success) {
          throw new Error('Falha no SQLite ao adicionar permissão.');
        }
      } catch (err: any) {
        console.error('[SQLite] addUserRole error:', err);
        throw new Error(`[SQLite] Falha ao adicionar função: ${err.message || err}`);
      }
    }
    set((state) => ({ userRoles: [...state.userRoles, newRole] }));
    get().logAction({ module: 'Usuários e Funções', actionType: 'create', description: `Função criada: ${roleData.name}`, status: 'sucesso', referenceId: newRole.id });
  },
  updateUserRole: async (id, data) => {
    const prevRole = get().userRoles.find(r => r.id === id);
    if (!prevRole) return;
    const updatedRole = { ...prevRole, ...data };
    const isDesktop = typeof window !== 'undefined' && !!(window as any).electron;
    const electronAPI = isDesktop ? (window as any).electron : null;
    if (isDesktop && electronAPI && electronAPI.db) {
      try {
        const success = await electronAPI.db.updatePermission(id, updatedRole);
        if (!success) {
          throw new Error('Falha no SQLite ao atualizar permissão.');
        }
      } catch (err: any) {
        console.error('[SQLite] updateUserRole error:', err);
        throw new Error(`[SQLite] Falha ao atualizar função: ${err.message || err}`);
      }
    }
    set((state) => ({
      userRoles: state.userRoles.map(r => r.id === id ? updatedRole : r)
    }));
    get().logAction({ 
      module: 'Usuários e Funções', 
      actionType: 'update', 
      action: 'Permissão alterada',
      description: `Função/Grupo de permissões "${prevRole.name || id}" atualizada por Administrador`, 
      status: 'sucesso', 
      referenceId: id,
      affectedEntity: 'Grupo de Permissões',
      entityId: id,
      previousValue: JSON.stringify(prevRole.permissions),
      newValue: JSON.stringify(updatedRole.permissions)
    });
  },

  // Badge Management
  addBadge: async () => {
    const list = get().badges || [];
    const generateCode = (): string => {
      const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
      let code = 'LF_';
      for (let i = 0; i < 7; i++) {
        code += chars.charAt(Math.floor(Math.random() * chars.length));
      }
      return code;
    };
    let codigoCracha = generateCode();
    while (list.some(b => b.codigoCracha === codigoCracha)) {
      codigoCracha = generateCode();
    }
    const newBadge: Badge = {
      id: generateUUID(),
      codigoCracha,
      status: 'Livre',
      usuarioVinculado: null,
      dataCriacao: Date.now(),
      ultimoUso: null
    };
    set((state) => ({ badges: [...(state.badges || []), newBadge] }));
    await get().saveSystemListsToSQLite();
    get().logAction({ 
      module: 'Usuários e Funções', 
      actionType: 'create', 
      action: 'Crachá/QR ADM Gerado',
      description: `Crachá administrativo criado com código: ${codigoCracha}`, 
      status: 'sucesso', 
      referenceId: newBadge.id,
      affectedEntity: 'Crachá',
      entityId: newBadge.id,
      newValue: codigoCracha
    });
  },
  addBadgeWithCode: async (code: string) => {
    const trimmed = code.trim();
    if (!trimmed) {
      return { success: false, error: 'Código do crachá inválido ou vazio!' };
    }
    const list = get().badges || [];
    const alreadyExists = list.some(b => b.codigoCracha.toUpperCase() === trimmed.toUpperCase());
    if (alreadyExists) {
      return { success: false, error: 'Este QR Code já está cadastrado em outro crachá!' };
    }
    const newBadge: Badge = {
      id: generateUUID(),
      codigoCracha: trimmed,
      status: 'Livre',
      usuarioVinculado: null,
      dataCriacao: Date.now(),
      ultimoUso: null
    };
    set((state) => ({ badges: [...(state.badges || []), newBadge] }));
    try {
      await get().saveSystemListsToSQLite();
    } catch (err: any) {
      set((state) => ({ badges: (state.badges || []).filter(b => b.id !== newBadge.id) }));
      return { success: false, error: err.message };
    }
    get().logAction({ 
      module: 'Usuários e Funções', 
      actionType: 'create', 
      action: 'Crachá/QR ADM Gerado',
      description: `Crachá administrativo criado via QR Code scan: ${trimmed}`, 
      status: 'sucesso', 
      referenceId: newBadge.id,
      affectedEntity: 'Crachá',
      entityId: newBadge.id,
      newValue: trimmed
    });
    return { success: true };
  },
  updateBadge: async (id, data) => {
    const backupBadges = get().badges;
    const backupUsers = get().users;
    set((state) => {
      let targetUserId = data.usuarioVinculado;
      
      const currentBadge = (state.badges || []).find(b => b.id === id);
      const prevUserId = currentBadge?.usuarioVinculado;
      
      if (data.status === 'Vinculado' && !targetUserId) {
        targetUserId = prevUserId || state.users.find(u => u.badgeId === id)?.id || null;
      }

      if (data.status === 'Livre') {
        targetUserId = null;
      }

      const updatedBadges = (state.badges || []).map(b => {
        if (b.id === id) {
          const updated = { ...b, ...data };
          if (targetUserId !== undefined) {
            updated.usuarioVinculado = targetUserId;
          }
          const isBlockedStatus = updated.status === 'Bloqueado' || updated.status === 'Perdido';
          const isAtivoStatus = updated.status === 'Vinculado';
          
          updated.blocked = isBlockedStatus;
          updated.isBlocked = isBlockedStatus;
          updated.active = isAtivoStatus;
          updated.isActive = isAtivoStatus;

          return updated;
        }
        return b;
      });

      const updatedUsers = state.users.map(u => {
        if (u.badgeId === id && targetUserId !== u.id) {
          return { ...u, badgeId: undefined };
        }
        if (targetUserId && u.id === targetUserId) {
          return { ...u, badgeId: id };
        }
        return u;
      });

      return {
        badges: updatedBadges,
        users: updatedUsers,
        currentUser: state.currentUser?.id === targetUserId 
          ? { ...state.currentUser, badgeId: id } 
          : (state.currentUser?.badgeId === id && targetUserId !== state.currentUser.id 
             ? { ...state.currentUser, badgeId: undefined } 
             : state.currentUser)
      };
    });

    try {
      await get().saveSystemListsToSQLite();
    } catch (err: any) {
      set({ badges: backupBadges, users: backupUsers });
      throw err;
    }

    get().logAction({ module: 'Usuários e Funções', actionType: 'update', description: `Crachá atualizado: ${id}`, status: 'sucesso', referenceId: id });
  },
  deleteBadge: async (id) => {
    const badge = (get().badges || []).find(b => b.id === id);
    if (!badge) return;
    if (badge.usuarioVinculado) {
      await get().desvincularBadge(id);
    }
    const backupBadges = get().badges;
    set((state) => ({
      badges: (state.badges || []).filter(b => b.id !== id)
    }));

    try {
      await get().saveSystemListsToSQLite();
    } catch (err: any) {
      set({ badges: backupBadges });
      throw err;
    }

    get().logAction({ module: 'Usuários e Funções', actionType: 'delete', description: `Crachá excluído: ${badge.codigoCracha}`, status: 'sucesso', referenceId: id });
    get().addTombstone('badges', id);
  },
  regenerateBadgeCode: async (id) => {
    const list = get().badges || [];
    const generateCode = (): string => {
      const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
      let code = 'LF_';
      for (let i = 0; i < 7; i++) {
        code += chars.charAt(Math.floor(Math.random() * chars.length));
      }
      return code;
    };
    let newCode = generateCode();
    while (list.some(b => b.codigoCracha === newCode)) {
      newCode = generateCode();
    }
    const backup = get().badges;
    set((state) => ({
      badges: (state.badges || []).map(b => b.id === id ? { ...b, codigoCracha: newCode } : b)
    }));

    try {
      await get().saveSystemListsToSQLite();
    } catch (err: any) {
      set({ badges: backup });
      throw err;
    }

    get().logAction({ 
      module: 'Usuários e Funções', 
      actionType: 'update', 
      action: 'Crachá/QR ADM Gerado',
      description: `QR Code do crachá administrativo regenerado de forma segura para: ${newCode}`, 
      status: 'sucesso', 
      referenceId: id,
      affectedEntity: 'Crachá',
      entityId: id,
      newValue: newCode
    });
  },
  vincularBadge: async (badgeId, userId) => {
    const user = get().users.find(u => u.id === userId);
    if (!user) return;
    
    const currentBoundBadge = (get().badges || []).find(b => b.usuarioVinculado === userId);
    if (currentBoundBadge) {
      await get().desvincularBadge(currentBoundBadge.id);
    }

    const backupBadges = get().badges;
    const backupUsers = get().users;

    set((state) => ({
      badges: (state.badges || []).map(b => b.id === badgeId ? { 
        ...b, 
        status: 'Vinculado', 
        usuarioVinculado: userId,
        active: true,
        isActive: true,
        blocked: false,
        isBlocked: false
      } : b),
      users: state.users.map(u => u.id === userId ? { ...u, badgeId: badgeId } : u)
    }));

    try {
      await get().saveSystemListsToSQLite();
    } catch (err: any) {
      set({ badges: backupBadges, users: backupUsers });
      throw err;
    }

    get().logAction({ module: 'Usuários e Funções', actionType: 'update', description: `Crachá vinculado ao usuário: ${user.login}`, status: 'sucesso', referenceId: badgeId });
  },
  desvincularBadge: async (badgeId) => {
    const badge = (get().badges || []).find(b => b.id === badgeId);
    if (!badge) return;
    const userId = badge.usuarioVinculado;

    const backupBadges = get().badges;
    const backupUsers = get().users;

    set((state) => ({
      badges: (state.badges || []).map(b => b.id === badgeId ? { 
        ...b, 
        status: 'Livre', 
        usuarioVinculado: null,
        active: false,
        isActive: false,
        blocked: false,
        isBlocked: false 
      } : b),
      users: userId ? state.users.map(u => u.id === userId ? { ...u, badgeId: undefined } : u) : state.users
    }));

    try {
      await get().saveSystemListsToSQLite();
    } catch (err: any) {
      set({ badges: backupBadges, users: backupUsers });
      throw err;
    }

    if (userId) {
      const user = get().users.find(u => u.id === userId);
      get().logAction({ module: 'Usuários e Funções', actionType: 'update', description: `Crachá desvinculado do usuário: ${user ? user.login : userId}`, status: 'sucesso', referenceId: badgeId });
    }
  },
  authenticateWithBadge: async (codigoCracha) => {
    const badge = (get().badges || []).find(b => b.codigoCracha === codigoCracha && b.status === 'Vinculado');
    if (!badge || !badge.usuarioVinculado) return null;
    const user = get().users.find(u => u.id === badge.usuarioVinculado && u.status === 'ativo');
    if (!user) return null;
    
    set((state) => ({
      badges: (state.badges || []).map(b => b.id === badge.id ? { ...b, ultimoUso: Date.now() } : b)
    }));
    return user;
  },
  addNFCTag: async (uid, tagLabel, dataExpiracao) => {
    const trimmedUid = (uid || '').trim();
    if (!trimmedUid) {
      return { success: false, error: 'O UID da Tag NFC não pode ser vazio!' };
    }
    const tags = get().nfcTags || [];
    const duplicate = tags.some(t => t.uid.toLowerCase() === trimmedUid.toLowerCase());
    if (duplicate) {
      return { success: false, error: 'Uma Tag NFC com este UID já está cadastrada!' };
    }

    const newTag: NFCTag = {
      id: generateUUID(),
      uid: trimmedUid,
      status: 'Livre',
      usuarioVinculado: null,
      tagLabel: tagLabel || undefined,
      dataCriacao: Date.now(),
      ultimoUso: null,
      dataExpiracao: dataExpiracao || null
    };

    set((state) => ({
      nfcTags: [...(state.nfcTags || []), newTag]
    }));

    try {
      await get().saveSystemListsToSQLite();
    } catch (err: any) {
      set((state) => ({
        nfcTags: (state.nfcTags || []).filter(t => t.id !== newTag.id)
      }));
      return { success: false, error: err.message };
    }

    get().logAction({
      module: 'Arquitetura NFC',
      actionType: 'create',
      action: 'Cadastro de Tag NFC',
      description: `Tag NFC cadastrada com sucesso. UID: ${trimmedUid}${tagLabel ? ` (${tagLabel})` : ''}`,
      status: 'sucesso',
      referenceId: newTag.id,
      affectedEntity: 'NFCTag',
      entityId: newTag.id,
      newValue: trimmedUid
    });

    return { success: true };
  },

  updateNFCTag: async (id, tagData) => {
    const tags = get().nfcTags || [];
    const existing = tags.find(t => t.id === id);
    if (!existing) {
      return { success: false, error: 'Tag NFC não encontrada!' };
    }

    if (tagData.uid && tagData.uid.trim() !== existing.uid) {
      const trimmedUid = tagData.uid.trim();
      if (tags.some(t => t.id !== id && t.uid.toLowerCase() === trimmedUid.toLowerCase())) {
        return { success: false, error: 'O novo UID já está cadastrado em outra Tag NFC!' };
      }
    }

    const statusChanged = tagData.status && tagData.status !== existing.status;
    const oldStatus = existing.status;
    const newStatus = tagData.status;

    const backupTags = get().nfcTags;

    set((state) => ({
      nfcTags: (state.nfcTags || []).map(t => {
        if (t.id === id) {
          const updated = { ...t, ...tagData };
          if (tagData.uid) updated.uid = tagData.uid.trim();
          return updated;
        }
        return t;
      })
    }));

    try {
      await get().saveSystemListsToSQLite();
    } catch (err: any) {
      set({ nfcTags: backupTags });
      return { success: false, error: err.message };
    }

    if (statusChanged) {
      if (newStatus === 'Bloqueado') {
        get().logAction({
          module: 'Arquitetura NFC',
          actionType: 'status_change',
          action: 'Bloqueio de Tag NFC',
          description: `Tag NFC (UID: ${existing.uid}) foi bloqueada manualmente.`,
          status: 'sucesso',
          referenceId: id,
          affectedEntity: 'NFCTag',
          entityId: id,
          previousValue: oldStatus,
          newValue: 'Bloqueado'
        });
      } else if (newStatus === 'Perdido') {
        get().logAction({
          module: 'Arquitetura NFC',
          actionType: 'status_change',
          action: 'Perda de Tag NFC',
          description: `Tag NFC (UID: ${existing.uid}) foi marcada como perdida no sistema.`,
          status: 'sucesso',
          referenceId: id,
          affectedEntity: 'NFCTag',
          entityId: id,
          previousValue: oldStatus,
          newValue: 'Perdido'
        });
      } else {
        get().logAction({
          module: 'Arquitetura NFC',
          actionType: 'status_change',
          action: 'Alteração de Status Tag NFC',
          description: `Tag NFC (UID: ${existing.uid}) teve seu status alterado de ${oldStatus} para ${newStatus}.`,
          status: 'sucesso',
          referenceId: id,
          affectedEntity: 'NFCTag',
          entityId: id,
          previousValue: oldStatus,
          newValue: newStatus
        });
      }
    } else {
      get().logAction({
        module: 'Arquitetura NFC',
        actionType: 'update',
        action: 'Atualização de Tag NFC',
        description: `Dados da Tag NFC (UID: ${existing.uid}) foram atualizados.`,
        status: 'sucesso',
        referenceId: id,
        affectedEntity: 'NFCTag',
        entityId: id
      });
    }

    return { success: true };
  },

  linkNFCTagToUser: async (tagId, userId) => {
    const tags = get().nfcTags || [];
    const tag = tags.find(t => t.id === tagId);
    if (!tag) {
      return { success: false, error: 'Tag NFC não encontrada!' };
    }

    const user = get().users.find(u => u.id === userId);
    if (!user) {
      return { success: false, error: 'Usuário não encontrado!' };
    }

    if (['Bloqueado', 'Perdido', 'Quarentena', 'Excluido'].includes(tag.status)) {
      return { success: false, error: `Não é possível vincular uma Tag no status '${tag.status}'!` };
    }

    const currentBoundTag = (get().nfcTags || []).find(t => t.usuarioVinculado === userId);
    if (currentBoundTag && currentBoundTag.id !== tagId) {
      await get().unlinkNFCTagFromUser(currentBoundTag.id);
    }

    if (tag.usuarioVinculado && tag.usuarioVinculado !== userId) {
      await get().unlinkNFCTagFromUser(tagId);
    }

    const backupTags = get().nfcTags;
    const backupUsers = get().users;

    set((state) => ({
      nfcTags: (state.nfcTags || []).map(t => 
        t.id === tagId ? { ...t, status: 'Vinculado', usuarioVinculado: userId } : t
      ),
      users: state.users.map(u => 
        u.id === userId ? { ...u, nfcTagId: tagId } : u
      )
    }));

    try {
      await get().saveSystemListsToSQLite();
    } catch (err: any) {
      set({ nfcTags: backupTags, users: backupUsers });
      return { success: false, error: err.message };
    }

    get().logAction({
      module: 'Arquitetura NFC',
      actionType: 'status_change',
      action: 'Vínculo de Tag NFC',
      description: `Tag NFC (UID: ${tag.uid}) vinculada com sucesso ao usuário ${user.fullName} (${user.login}).`,
      status: 'sucesso',
      referenceId: tagId,
      affectedEntity: 'NFCTag',
      entityId: tagId,
      newValue: `Vinculado ao usuário ${userId}`
    });

    return { success: true };
  },

  unlinkNFCTagFromUser: async (tagId) => {
    const tags = get().nfcTags || [];
    const tag = tags.find(t => t.id === tagId);
    if (!tag) {
      return { success: false, error: 'Tag NFC não encontrada!' };
    }

    const userId = tag.usuarioVinculado;
    const backupTags = get().nfcTags;
    const backupUsers = get().users;

    if (!userId) {
      if (tag.status === 'Vinculado') {
        set((state) => ({
          nfcTags: (state.nfcTags || []).map(t => 
            t.id === tagId ? { ...t, status: 'Livre' } : t
          )
        }));
        try {
          await get().saveSystemListsToSQLite();
        } catch (err: any) {
          set({ nfcTags: backupTags });
          return { success: false, error: err.message };
        }
      }
      return { success: true };
    }

    const user = get().users.find(u => u.id === userId);

    set((state) => ({
      nfcTags: (state.nfcTags || []).map(t => 
        t.id === tagId ? { ...t, status: 'Livre', usuarioVinculado: null } : t
      ),
      users: state.users.map(u => 
        u.id === userId ? { ...u, nfcTagId: undefined } : u
      )
    }));

    try {
      await get().saveSystemListsToSQLite();
    } catch (err: any) {
      set({ nfcTags: backupTags, users: backupUsers });
      return { success: false, error: err.message };
    }

    if (userId) {
      get().logAction({
        module: 'Arquitetura NFC',
        actionType: 'status_change',
        action: 'Desvínculo de Tag NFC',
        description: `Tag NFC (UID: ${tag.uid}) desvinculada do usuário ${user ? `${user.fullName} (${user.login})` : userId}.`,
        status: 'sucesso',
        referenceId: tagId,
        affectedEntity: 'NFCTag',
        entityId: tagId,
        previousValue: `Vinculado ao usuário ${userId}`,
        newValue: 'Livre'
      });
    }

    return { success: true };
  },

  quarantineNFCTag: async (tagId, reason) => {
    const tags = get().nfcTags || [];
    const tag = tags.find(t => t.id === tagId);
    if (!tag) {
      return { success: false, error: 'Tag NFC não encontrada!' };
    }

    const previousStatus = tag.status;
    const userId = tag.usuarioVinculado;
    const resolvedReason = reason || 'Quarentena preventiva';

    const backupTags = get().nfcTags;
    const backupUsers = get().users;

    if (userId) {
      set((state) => ({
        users: state.users.map(u => u.id === userId ? { ...u, nfcTagId: undefined } : u)
      }));
    }

    set((state) => ({
      nfcTags: (state.nfcTags || []).map(t => 
        t.id === tagId ? { 
          ...t, 
          status: 'Quarentena', 
          usuarioVinculado: null, 
          quarantineAt: Date.now(), 
          quarantineReason: resolvedReason 
        } : t
      )
    }));

    try {
      await get().saveSystemListsToSQLite();
    } catch (err: any) {
      set({ nfcTags: backupTags, users: backupUsers });
      return { success: false, error: err.message };
    }

    get().logAction({
      module: 'Arquitetura NFC',
      actionType: 'status_change',
      action: 'Quarentena de Tag NFC',
      description: `Tag NFC (UID: ${tag.uid}) colocada em quarentena pelo sistema. Motivo: ${resolvedReason}.`,
      status: 'sucesso',
      referenceId: tagId,
      affectedEntity: 'NFCTag',
      entityId: tagId,
      previousValue: previousStatus,
      newValue: 'Quarentena'
    });

    return { success: true };
  },

  restoreNFCTag: async (tagId) => {
    const tags = get().nfcTags || [];
    const tag = tags.find(t => t.id === tagId);
    if (!tag) {
      return { success: false, error: 'Tag NFC não encontrada!' };
    }

    const previousStatus = tag.status;
    const backupTags = get().nfcTags;

    set((state) => ({
      nfcTags: (state.nfcTags || []).map(t => 
        t.id === tagId ? { 
          ...t, 
          status: 'Livre', 
          usuarioVinculado: null, 
          quarantineAt: null, 
          quarantineReason: undefined 
        } : t
      )
    }));

    try {
      await get().saveSystemListsToSQLite();
    } catch (err: any) {
      set({ nfcTags: backupTags });
      return { success: false, error: err.message };
    }

    get().logAction({
      module: 'Arquitetura NFC',
      actionType: 'status_change',
      action: 'Restauração de Tag NFC',
      description: `Tag NFC (UID: ${tag.uid}) reativada para status Livre (pronta para novo uso).`,
      status: 'sucesso',
      referenceId: tagId,
      affectedEntity: 'NFCTag',
      entityId: tagId,
      previousValue: previousStatus,
      newValue: 'Livre'
    });

    return { success: true };
  },

  permanentlyDeleteExpiredNFCTags: async () => {
    const tags = get().nfcTags || [];
    const now = Date.now();
    const expiredTags = tags.filter(t => t.dataExpiracao !== null && t.dataExpiracao !== undefined && t.dataExpiracao < now);

    if (expiredTags.length === 0) {
      return { success: true, count: 0 };
    }

    const expiredTagIdsList = expiredTags.map(t => t.id);
    const backupTags = get().nfcTags;
    const backupUsers = get().users;
    
    set((state) => ({
      nfcTags: (state.nfcTags || []).filter(t => !expiredTagIdsList.includes(t.id)),
      users: state.users.map(u => 
        u.nfcTagId && expiredTagIdsList.includes(u.nfcTagId) ? { ...u, nfcTagId: undefined } : u
      )
    }));

    try {
      await get().saveSystemListsToSQLite();
    } catch (err: any) {
      set({ nfcTags: backupTags, users: backupUsers });
      throw err;
    }

    get().logAction({
      module: 'Arquitetura NFC',
      actionType: 'delete',
      action: 'Remoção de Tags NFC Expiradas',
      description: `${expiredTags.length} tag(s) NFC com data de validade expirada(s) foram deletada(s) permanentemente do sistema de forma segura.`,
      status: 'sucesso',
      newValue: `Deletadas: ${expiredTags.map(t => t.uid).join(', ')}`
    });

    return { success: true, count: expiredTags.length };
  },

  addNFCPresenceRecord: (uid: string, tipoEvento: 'ENTRADA' | 'SAIDA' | 'PAUSA' | 'RETORNO' | 'PRESENCA_OPERACIONAL', device?: string) => {
    const cleanUid = (uid || '').trim().toUpperCase();
    if (!cleanUid) {
      return { success: false, error: 'UID inválido ou não fornecido.' };
    }

    const tags = get().nfcTags || [];
    const matchedTag = tags.find(t => t.uid.trim().toUpperCase() === cleanUid && t.status !== 'Excluido');

    if (!matchedTag) {
      return { success: false, error: 'Código de Tag NFC não cadastrado.' };
    }

    if (matchedTag.status === 'Bloqueado') {
      return { success: false, error: 'Esta tag NFC de registro de ponto está bloqueada.' };
    }
    if (matchedTag.status === 'Perdido') {
      return { success: false, error: 'Esta tag NFC foi marcada como perdida no sistema.' };
    }
    if (matchedTag.status === 'Quarentena') {
      return { success: false, error: 'Esta tag NFC está em período de quarentena de segurança.' };
    }

    if (!matchedTag.usuarioVinculado) {
      return { success: false, error: 'Esta tag NFC não possui um usuário vinculado.' };
    }

    const matchedUser = get().users.find(u => u.id === matchedTag.usuarioVinculado);
    if (!matchedUser) {
      return { success: false, error: 'Usuário da tag não encontrado.' };
    }

    if (matchedUser.status !== 'ativo') {
      return { success: false, error: 'Este colaborador está inativo no sistema.' };
    }

    const now = Date.now();
    const isDuplicate = (get().nfcPresenceRecords || []).some(
      r => r.userId === matchedUser.id &&
           r.tipoEvento === tipoEvento &&
           (now - r.timestamp) < 10000
    );

    if (isDuplicate) {
      return { success: false, error: 'Registro duplicado. Por favor, aguarde alguns segundos antes de aproximar novamente.' };
    }

    const newRecord: NFCPresenceRecord = {
      id: generateUUID(),
      userId: matchedUser.id,
      userLogin: matchedUser.login || 'N/A',
      userFullName: matchedUser.fullName || 'Operador',
      nfcUid: cleanUid,
      timestamp: now,
      tipoEvento,
      device: device || 'Terminal Local'
    };

    const isDesktop = typeof window !== 'undefined' && !!(window as any).electron;
    const electronAPI = isDesktop ? (window as any).electron : null;
    const useSQLite = isDesktop && electronAPI && electronAPI.db;

    if (useSQLite) {
      electronAPI.db.insertNfcPresenceRecord(newRecord).catch((err: any) => {
        console.error('[SQLite] Falha ao inserir registro de presença NFC:', err);
      });
    }

    set((state) => ({
      nfcPresenceRecords: [newRecord, ...(state.nfcPresenceRecords || [])]
    }));

    get().updateNFCTag(matchedTag.id, { ultimoUso: now });

    get().logAction({
      module: 'Presença / Ponto',
      actionType: 'create',
      action: `Ponto NFC - ${tipoEvento}`,
      description: `Registro de ponto (${tipoEvento}) pelo colaborador ${matchedUser.fullName} (UID NFC: ${cleanUid}) via terminal ${device || 'Terminal Local'}.`,
      status: 'sucesso',
      referenceId: newRecord.id,
      affectedEntity: 'NFCPresenceRecord',
      entityId: newRecord.id
    });

    return { success: true, record: newRecord };
  },

  addTerminal: async (term) => {
    const freshId = generateUUID('term');
    const newTerm: TerminalOperacional = {
      ...term,
      idTerminal: freshId,
      status: 'Online',
      operadorAtualId: null,
      operadorAtualName: null,
      ultimoOperadorId: null,
      ultimoOperadorName: null
    };

    const isDesktop = typeof window !== 'undefined' && !!(window as any).electron;
    const electronAPI = isDesktop ? (window as any).electron : null;
    if (isDesktop && electronAPI && electronAPI.db) {
      try {
        const success = await electronAPI.db.insertKioskTerminal(newTerm);
        if (!success) {
          throw new Error('Falha no SQLite ao salvar terminal.');
        }
      } catch (err: any) {
        console.error('[SQLite] addTerminal error:', err);
        return { success: false, error: `Falha ao salvar terminal: ${err.message || err}` };
      }
    }

    set((state) => ({
      terminals: [...(state.terminals || []), newTerm]
    }));

    get().logAction({
      module: 'Gestão de Terminais',
      actionType: 'create',
      action: 'Criação de Terminal',
      description: `Terminal ${newTerm.nomeTerminal} (${newTerm.tipoTerminal}) foi criado no setor ${newTerm.setor}.`,
      status: 'sucesso',
      referenceId: freshId,
      affectedEntity: 'TerminalOperacional',
      entityId: freshId
    });
    return { success: true };
  },

  updateTerminal: async (idTerminal, terminalPartial) => {
    const terms = get().terminals || [];
    const existing = terms.find(t => t.idTerminal === idTerminal);
    if (!existing) {
      return { success: false, error: 'Terminal não encontrado!' };
    }
    const updatedTerm = { ...existing, ...terminalPartial };

    const isDesktop = typeof window !== 'undefined' && !!(window as any).electron;
    const electronAPI = isDesktop ? (window as any).electron : null;
    if (isDesktop && electronAPI && electronAPI.db) {
      try {
        const success = await electronAPI.db.updateKioskTerminal(idTerminal, updatedTerm);
        if (!success) {
          throw new Error('Falha no SQLite ao atualizar terminal.');
        }
      } catch (err: any) {
        console.error('[SQLite] updateTerminal error:', err);
        return { success: false, error: `Falha ao atualizar terminal: ${err.message || err}` };
      }
    }

    set((state) => ({
      terminals: (state.terminals || []).map(t => t.idTerminal === idTerminal ? updatedTerm : t)
    }));

    get().logAction({
      module: 'Gestão de Terminais',
      actionType: 'update',
      action: 'Atualização de Terminal',
      description: `Terminal ID ${idTerminal} foi atualizado com novos parâmetros.`,
      status: 'sucesso',
      referenceId: idTerminal,
      affectedEntity: 'TerminalOperacional',
      entityId: idTerminal
    });
    return { success: true };
  },

  deleteTerminal: async (idTerminal) => {
    const isDesktop = typeof window !== 'undefined' && !!(window as any).electron;
    const electronAPI = isDesktop ? (window as any).electron : null;
    if (isDesktop && electronAPI && electronAPI.db) {
      try {
        const success = await electronAPI.db.deleteKioskTerminal(idTerminal);
        if (!success) {
          throw new Error('Falha no SQLite ao deletar terminal.');
        }
      } catch (err: any) {
        console.error('[SQLite] deleteTerminal error:', err);
        return { success: false, error: `Falha ao deletar terminal: ${err.message || err}` };
      }
    }

    set((state) => ({
      terminals: (state.terminals || []).filter(t => t.idTerminal !== idTerminal)
    }));

    get().logAction({
      module: 'Gestão de Terminais',
      actionType: 'delete',
      action: 'Remoção de Terminal',
      description: `Terminal ID ${idTerminal} foi deletado permanentemente.`,
      status: 'sucesso',
      referenceId: idTerminal,
      affectedEntity: 'TerminalOperacional',
      entityId: idTerminal
    });
    get().addTombstone('terminals', idTerminal);
    return { success: true };
  },

  setActiveTerminalId: async (idTerminal) => {
    const isDesktop = typeof window !== 'undefined' && !!(window as any).electron;
    const electronAPI = isDesktop ? (window as any).electron : null;
    if (isDesktop && electronAPI && electronAPI.db) {
      try {
        const success = await electronAPI.db.insertPdvSetting({
          id: 'pdv_main_settings',
          activeTerminalId: idTerminal
        });
        if (!success) {
          throw new Error('Falha no SQLite ao atualizar terminal ativo do PDV.');
        }
      } catch (err: any) {
        console.error('[SQLite] setActiveTerminalId error:', err);
      }
    }
    set({ activeTerminalId: idTerminal });
  },

  validateTerminalAccess: (idTerminal, userId) => {
    const terminals = get().terminals || [];
    const matchedTerminal = terminals.find(t => t.idTerminal === idTerminal);
    if (!matchedTerminal) {
      return { success: true }; // Fallback
    }

    if (matchedTerminal.modoBloqueado) {
      return { success: false, error: 'O terminal operacional encontra-se bloqueado para manutenção ou segurança.' };
    }

    const matchedUser = get().users.find(u => u.id === userId);
    if (!matchedUser) {
      return { success: false, error: 'Colaborador não identificado no sistema.' };
    }

    if (matchedUser.status !== 'ativo') {
      return { success: false, error: 'O cadastro deste colaborador encontra-se inativo.' };
    }

    // Admins and owners can access any terminal
    if (matchedUser.isAdmin || matchedUser.isOwner || matchedUser.isMasterAdmin) {
      return { success: true };
    }

    // Role check
    const permissions = matchedTerminal.permissoesAceitas.map(p => p.toUpperCase());
    const userRole = (matchedUser.roleId || '').toUpperCase();
    
    // Check if roles are compatible (like CAIXA / SEPARADOR / ESTOQUE)
    const hasAllowedRole = permissions.includes(userRole) || 
      (matchedUser.setor && permissions.includes(matchedUser.setor.toUpperCase())) ||
      (matchedUser.primaryFunction && permissions.includes(matchedUser.primaryFunction.toUpperCase()));

    if (!hasAllowedRole) {
      return { 
        success: false, 
        error: `Seu perfil (${matchedUser.roleId || 'Operador'}) não possui permissão para acessar o terminal ${matchedTerminal.nomeTerminal} (${matchedTerminal.tipoTerminal}).` 
      };
    }

    return { success: true };
  },

  handleTerminalNfcLogin: (idTerminal, nfcUid) => {
    const cleanUid = (nfcUid || '').trim().toUpperCase();
    const tags = get().nfcTags || [];
    const matchedTag = tags.find(t => t.uid.trim().toUpperCase() === cleanUid && t.status !== 'Excluido');

    if (!matchedTag) {
      return { success: false, error: 'Código de Tag NFC não cadastrado.' };
    }

    if (matchedTag.status !== 'Vinculado' || !matchedTag.usuarioVinculado) {
      return { success: false, error: 'Esta tag NFC não está vinculada a nenhum colaborador registrado.' };
    }

    const user = get().users.find(u => u.id === matchedTag.usuarioVinculado);
    if (!user) {
      return { success: false, error: 'Colaborador correspondente à tag não encontrado.' };
    }

    // Validate if the user can log in at this terminal
    const accessRes = get().validateTerminalAccess(idTerminal, user.id);
    if (!accessRes.success) {
      get().logAction({
        module: 'Controle de Terminais',
        actionType: 'login',
        action: 'Tentativa de Acesso Negada',
        description: `Colaborador ${user.fullName} tentou acessar terminal ${idTerminal}, mas foi negado: ${accessRes.error}`,
        status: 'bloqueado',
        newValue: `Terminal: ${idTerminal}, User: ${user.fullName} (${user.roleId})`
      });
      return { success: false, error: accessRes.error };
    }

    // Successful access! Update terminal operator stats.
    set((state) => ({
      terminals: (state.terminals || []).map(t => {
        if (t.idTerminal === idTerminal) {
          return {
            ...t,
            ultimoOperadorId: t.operadorAtualId || t.ultimoOperadorId,
            ultimoOperadorName: t.operadorAtualName || t.ultimoOperadorName,
            operadorAtualId: user.id,
            operadorAtualName: user.fullName
          };
        }
        return t;
      })
    }));

    get().logAction({
      module: 'Controle de Terminais',
      actionType: 'login',
      action: 'Acesso Liberado por NFC',
      description: `Acesso liberado no terminal ${idTerminal} para o colaborador ${user.fullName} (${user.roleId}) via aproximação de tag NFC.`,
      status: 'sucesso',
      affectedEntity: 'TerminalOperacional',
      entityId: idTerminal
    });

    return { success: true, user };
  },

  handleNFCOperationalAction: (uid: string, context: string, payload?: any) => {
    const cleanUid = (uid || '').trim().toUpperCase();
    if (!cleanUid) {
      return { success: false, error: 'UID inválido ou não fornecido.' };
    }

    const tags = get().nfcTags || [];
    const matchedTag = tags.find(t => t.uid.trim().toUpperCase() === cleanUid && t.status !== 'Excluido');

    if (!matchedTag) {
      return { success: false, error: 'Código de Tag NFC não cadastrado.' };
    }

    if (matchedTag.status === 'Bloqueado') {
      return { success: false, error: 'Esta tag NFC está bloqueada.' };
    }
    if (matchedTag.status === 'Perdido') {
      return { success: false, error: 'Esta tag NFC foi marcada como perdida no sistema.' };
    }
    if (matchedTag.status === 'Quarentena') {
      return { success: false, error: 'Esta tag NFC está em período de quarentena.' };
    }

    if (!matchedTag.usuarioVinculado) {
      return { success: false, error: 'Esta tag NFC não possui um usuário vinculado.' };
    }

    const matchedUser = get().users.find(u => u.id === matchedTag.usuarioVinculado);
    if (!matchedUser) {
      return { success: false, error: 'Usuário da tag não encontrado.' };
    }

    if (matchedUser.status !== 'ativo') {
      return { success: false, error: 'O usuário desta tag está inativo.' };
    }

    if (context === 'SEPARACAO_INICIAR') {
      const saleId = payload?.saleId;
      if (!saleId) {
        return { success: false, error: 'Venda/Pedido não especificado para a separação.' };
      }
      
      const sale = get().sales.find(s => s.id === saleId);
      if (!sale) {
        return { success: false, error: 'Venda/Pedido não localizado.' };
      }

      get().startSeparation(saleId, matchedUser.id, matchedUser.fullName);

      get().logAction({
        module: 'Separação',
        actionType: 'status_change',
        action: 'Início NFC',
        description: `Separação do pedido #${sale.orderNumber} iniciada com confirmação NFC por ${matchedUser.fullName}`,
        status: 'sucesso',
        referenceId: saleId
      });

      return { success: true, executorName: matchedUser.fullName, executorId: matchedUser.id };
    }

    if (context === 'SEPARACAO_FINALIZAR') {
      const saleId = payload?.saleId;
      if (!saleId) {
        return { success: false, error: 'Venda/Pedido não especificado para a finalização.' };
      }

      const sale = get().sales.find(s => s.id === saleId);
      if (!sale) {
        return { success: false, error: 'Venda/Pedido não localizado.' };
      }

      get().finalizeSeparation(saleId, matchedUser.id, matchedUser.fullName);

      get().logAction({
        module: 'Separação',
        actionType: 'status_change',
        action: 'Finalização NFC',
        description: `Separação do pedido #${sale.orderNumber} finalizada com confirmação NFC por ${matchedUser.fullName}`,
        status: 'sucesso',
        referenceId: saleId
      });

      return { success: true, executorName: matchedUser.fullName, executorId: matchedUser.id };
    }

    if (context === 'PEDIDO_CONFERIR') {
      const saleId = payload?.saleId;
      if (!saleId) return { success: false, error: 'Pedido não especificado.' };

      const sale = get().sales.find(s => s.id === saleId);
      if (!sale) return { success: false, error: 'Pedido não localizado.' };

      set((state) => ({
        sales: state.sales.map(s => {
          if (s.id === saleId) {
            const currentEvents = s.timelineEvents || [];
            const tEvent: TimelineEvent = {
              id: generateUUID(),
              type: 'other',
              timestamp: Date.now(),
              user: matchedUser.fullName,
              description: `Conferência presencial do pedido realizada com sucesso e confirmada via tag NFC por ${matchedUser.fullName}`,
              status: s.status,
              icon: 'CheckCircle2',
              color: 'text-emerald-500'
            };
            return {
              ...s,
              timelineEvents: [...currentEvents, tEvent]
            };
          }
          return s;
        })
      }));

      get().logAction({
        module: 'Logística',
        actionType: 'status_change',
        action: 'Conferência NFC',
        description: `Pedido #${sale.orderNumber} verificado e conferido por ${matchedUser.fullName} via tag NFC (UID: ${cleanUid}).`,
        status: 'sucesso',
        referenceId: saleId
      });

      return { success: true, executorName: matchedUser.fullName, executorId: matchedUser.id };
    }

    if (context === 'PEDIDO_RETIRAR') {
      const saleId = payload?.saleId;
      if (!saleId) return { success: false, error: 'Pedido não especificado.' };

      const sale = get().sales.find(s => s.id === saleId);
      if (!sale) return { success: false, error: 'Pedido não localizado.' };

      set((state) => ({
        sales: state.sales.map(s => {
          if (s.id === saleId) {
            const currentEvents = s.timelineEvents || [];
            const tEvent: TimelineEvent = {
              id: generateUUID(),
              type: 'delivery',
              timestamp: Date.now(),
              user: matchedUser.fullName,
              description: `Pedido retirado pelo cliente sob a supervisão do operador ${matchedUser.fullName}, confirmado por NFC.`,
              status: 'retirado',
              icon: 'Box',
              color: 'text-blue-500'
            };
            return {
              ...s,
              status: 'retirado' as any,
              timelineEvents: [...currentEvents, tEvent]
            };
          }
          return s;
        })
      }));

      get().addActivity(`Pedido #${sale.orderNumber} retirado. Entregador: ${matchedUser.fullName}`, 'sale', 'Vendas', matchedUser.fullName, saleId);

      get().logAction({
        module: 'Entregas',
        actionType: 'status_change',
        action: 'Retirada NFC',
        description: `Retirada realizada do pedido #${sale.orderNumber} sob aprovação de ${matchedUser.fullName} via tag NFC.`,
        status: 'sucesso',
        referenceId: saleId
      });

      return { success: true, executorName: matchedUser.fullName, executorId: matchedUser.id };
    }

    if (context === 'CAIXA_CONFIRMAR' || context === 'ESTOQUE_CONFERIR') {
      get().logAction({
        module: context === 'CAIXA_CONFIRMAR' ? 'PDV' : 'Estoque',
        actionType: 'other',
        action: `Confirmação de Ação NFC (${context})`,
        description: `Ação operacional de contexto "${context}" confirmada fisicamente por aproximar a tag NFC de ${matchedUser.fullName} (UID: ${cleanUid}).`,
        status: 'sucesso'
      });

      return { success: true, executorName: matchedUser.fullName, executorId: matchedUser.id };
    }

    return { success: false, error: 'Contexto operacional não especificado.' };
  },

  checkPermission: (module, action) => {
    const { currentUser, userRoles } = get();
    if (!currentUser) return false;
    
    // ADM/Dono bypass
    if (currentUser.isAdmin || currentUser.isOwner || currentUser.isMasterAdmin || currentUser.login === 'admin') return true;

    // Direct check: if currentUser has allowedModules set, use it to restrict/allow modules
    if (currentUser.allowedModules) {
      // We must match 'module' which can be either name (e.g. 'Separação') or id/path.
      // Let's map standard module names to their ids for accurate lookup.
      const nameToIdMap: Record<string, string> = {
        'Abrir/Fechar Caixa': 'abrir-caixa',
        'Vender': 'pdv',
        'PDV': 'pdv',
        'Vendas': 'pdv',
        'Gestão de Pedidos': 'gestao-pedidos',
        'Em Produção': 'em-producao',
        'Separação': 'separacao',
        'Entrega': 'entrega',
        'Estoque': 'estoque',
        'Clientes': 'clientes',
        'Experiência do Cliente': 'experiencia-cliente',
        'Dashboard': 'dashboard',
        'Financeiro': 'financeiro',
        'Custos de Produção': 'custos',
        'Pré-Encomenda': 'pre-encomenda',
        'Devolução': 'devolucao',
        'Central Operacional': 'central-operacional',
        'Histórico': 'historico',
        'Histórico de Caixa': 'historico-caixa',
        'Pagamentos': 'pagamentos',
        'Auditoria': 'auditoria',
        'Lojistas': 'lojistas',
        'IA Operacional': 'ia',
        'Catálogo': 'catalogo',
        'Notificações': 'notificacoes',
        'Automação': 'automacao',
        'Relatório Operacional': 'performance-operacional',
        'Sincronização Local': 'rede',
        'Ajustes': 'empresa', // company settings tab
        'Cupons e Etiquetas': 'cupons',
        'Segurança': 'seguranca',
        'Impressão': 'impressora',
        'Usuários e Funções': 'usuarios',
        'Crachá': 'cracha',
        'PDV Totem': 'pdv-totem',
      };

      const normalizedModule = module.trim();
      const targetId = nameToIdMap[normalizedModule] || normalizedModule.toLowerCase();

      // If the module ID is not in their allowedModules array, deny permission
      if (!currentUser.allowedModules.includes(targetId)) {
        // Check extraPermissions too
        const extraMatched = currentUser.extraPermissions?.includes(targetId);
        if (!extraMatched) {
          return false;
        }
      }
    }

    const role = userRoles.find(r => r.id === currentUser.roleId);
    if (!role) {
      // Fallback if they have allowedModules override but no role defined
      if (currentUser.allowedModules) {
        return action === 'acessar' || action === 'visualizar';
      }
      return false;
    }

    // If role status is inactive, deny all
    if (role.status === 'inativo') return false;

    const permission = role.permissions.find(p => p.module === module);
    if (!permission) {
      if (currentUser.allowedModules) {
        // If module is allowed and they have override, allow standard reading actions
        return action === 'acessar' || action === 'visualizar';
      }
      return false;
    }

    if (action === 'acessar') {
      const hasAnyAction = Object.values(permission.actions).some(val => val === true);
      if (hasAnyAction) return true;
    }

    return permission.actions[action] || false;
  },
  logAction: (action) => {
    get().trackEvent({
      message: action.description || '',
      description: action.description,
      module: action.module,
      actionType: action.actionType || 'other',
      status: action.status || 'sucesso',
      entityId: action.entityId || action.referenceId,
      referenceId: action.referenceId || action.entityId,
      previousValue: action.previousValue,
      newValue: action.newValue,
      riskLevel: action.riskLevel,
      eventType: 'audit_log'
    });
  },
  trackEvent: (params) => {
    const { currentUser, userRoles } = get();
    const userRole = userRoles.find(r => r.id === currentUser?.roleId)?.name || 'N/A';
    const userLogin = currentUser?.login || 'sistema';
    const userMatricula = currentUser?.matricula || userLogin || '---';

    const device = typeof window !== 'undefined'
      ? (window.navigator.userAgent.includes('Mobi') ? 'Celular' : 'Computador')
      : 'Servidor';

    const now = Date.now();
    
    // Deduplication check
    if (!(globalThis as any)._lastEvents) {
      (globalThis as any)._lastEvents = [];
    }
    const recentEvents = (globalThis as any)._lastEvents;
    const isDuplicate = recentEvents.some((e: any) => 
      now - e.time < 1200 && 
      e.message === params.message && 
      e.module === params.module && 
      e.actionType === params.actionType
    );
    if (isDuplicate) {
      return;
    }
    recentEvents.push({ time: now, message: params.message, module: params.module, actionType: params.actionType });
    if (recentEvents.length > 10) {
      recentEvents.shift();
    }

    // Classify risk level based on fields
    let riskLevel: 'baixo' | 'médio' | 'alto' = params.riskLevel || 'baixo';
    const descriptionLower = (params.description || params.message || '').toLowerCase();
    const actionTypeLower = (params.actionType || '').toLowerCase();
    const moduleLower = (params.module || '').toLowerCase();

    if (
      actionTypeLower === 'cancel' ||
      actionTypeLower === 'delete' ||
      descriptionLower.includes('cancelado') ||
      descriptionLower.includes('excluid') ||
      descriptionLower.includes('exclusão') ||
      descriptionLower.includes('remover') ||
      descriptionLower.includes('removido') ||
      descriptionLower.includes('ajuste') ||
      descriptionLower.includes('ajuste manual') ||
      descriptionLower.includes('desconto') ||
      descriptionLower.includes('senha') ||
      descriptionLower.includes('qr code') || 
      descriptionLower.includes('faltante') ||
      descriptionLower.includes('permissão') ||
      moduleLower.includes('segurança') ||
      descriptionLower.includes('estoque atualizado') ||
      params.status === 'bloqueado' ||
      params.status === 'erro'
    ) {
      riskLevel = 'alto';
    } else if (
      actionTypeLower === 'update' ||
      actionTypeLower === 'status_change' ||
      descriptionLower.includes('atualizado') ||
      descriptionLower.includes('edição') ||
      descriptionLower.includes('payment') ||
      descriptionLower.includes('pagamento') ||
      descriptionLower.includes('reaberto')
    ) {
      riskLevel = 'médio';
    } else if (
      actionTypeLower === 'print' ||
      actionTypeLower === 'pdf' ||
      descriptionLower.includes('print') ||
      descriptionLower.includes('imprimir') ||
      descriptionLower.includes('gerado') ||
      descriptionLower.includes('exportado')
    ) {
      riskLevel = 'baixo';
    }

    // Split based on functional rules
    let isOperational = false;
    let isAudit = false;

    if (params.eventType === 'operational_history') {
      isOperational = true;
    } else if (params.eventType === 'audit_log') {
      isAudit = true;
    } else if (params.eventType === 'both') {
      isOperational = true;
      isAudit = true;
    } else {
      // Auto router based on type
      // Operational: Pedido criado, separado, entregue, venda realizada, pagamento registrado, produto movimentado, cliente cadastrado, status alterado, impressao gerada, etiqueta emitida
      if (
        actionTypeLower === 'create' ||
        actionTypeLower === 'update' ||
        actionTypeLower === 'status_change' ||
        actionTypeLower === 'print' ||
        actionTypeLower === 'pdf' ||
        moduleLower.includes('pdv') ||
        moduleLower.includes('gestão de pedidos') ||
        moduleLower.includes('separação') ||
        moduleLower.includes('delivery') ||
        moduleLower.includes('clientes') ||
        moduleLower.includes('estoque') ||
        moduleLower.includes('caixa') ||
        descriptionLower.includes('pedido') ||
        descriptionLower.includes('venda') ||
        descriptionLower.includes('pagamento') ||
        descriptionLower.includes('produto') ||
        descriptionLower.includes('cliente') ||
        descriptionLower.includes('impressão') ||
        descriptionLower.includes('etiqueta')
      ) {
        isOperational = true;
      }

      // Audit: Login, logout, tentativa acesso negada, alteracao permissão, alteracao senha, exclusao de dados, cancelamento de venda, devolução, estorno, alteração financeira, caixa, sangria/suprimento, alteração manual estoque, erro crítico, acao administrativa
      if (
        actionTypeLower === 'delete' ||
        actionTypeLower === 'cancel' ||
        actionTypeLower === 'login' ||
        actionTypeLower === 'logout' ||
        actionTypeLower === 'config' ||
        params.status === 'bloqueado' ||
        params.status === 'erro' ||
        moduleLower.includes('segurança') ||
        moduleLower.includes('usuários e funções') ||
        moduleLower.includes('ajustes') ||
        descriptionLower.includes('senha') ||
        descriptionLower.includes('exclusão') ||
        descriptionLower.includes('excluído') ||
        descriptionLower.includes('cancelado') ||
        descriptionLower.includes('devolução') ||
        descriptionLower.includes('estorno') ||
        descriptionLower.includes('sangria') ||
        descriptionLower.includes('suprimento') ||
        descriptionLower.includes('ajuste de estoque') ||
        descriptionLower.includes('permissão') ||
        descriptionLower.includes('autorização') ||
        descriptionLower.includes('caixa')
      ) {
        isAudit = true;
      }

      if (!isOperational && !isAudit) {
        isOperational = true;
      }
    }

    const uniqueId = generateUUID();

    const isDesktop = typeof window !== 'undefined' && !!(window as any).electron;
    const electronAPI = isDesktop ? (window as any).electron : null;
    const useSQLite = isDesktop && electronAPI && electronAPI.db;

    if (isOperational) {
      let cleanMessage = params.message;
      if (cleanMessage.includes('Usuário matrícula') || cleanMessage.includes('DB_USER_ID')) {
        cleanMessage = params.message.split('Detalhes:')[1] || params.message;
      }

      const newActivity: Activity = {
        id: uniqueId,
        message: cleanMessage,
        timestamp: now,
        type: (params.actionType === 'create' ? 'inventory' : 
               params.actionType === 'cancel' ? 'alert' : 
               params.actionType === 'delete' ? 'alert' : 
               params.actionType as any) || 'inventory',
        module: params.module,
        userName: currentUser?.fullName || 'Sistema',
        entityId: params.entityId || params.referenceId
      };
      
      if (useSQLite) {
        electronAPI.db.insertActivity(newActivity).catch((err: any) => {
          console.error('[SQLite] Falha ao inserir atividade:', err);
        });
      }

      set((state) => ({ activities: [newActivity, ...state.activities].slice(0, 1000) }));
    }

    if (isAudit) {
      const timeStr = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
      let auditDesc = params.description || params.message;

      if (!auditDesc.includes('matrícula') && !auditDesc.includes('Matrícula')) {
        auditDesc = `Usuário matrícula ${userMatricula} (${currentUser?.fullName || 'Sistema'}, cargo: ${currentUser?.isAdmin ? 'Administrador' : userRole}) executou "${params.actionType}" às ${timeStr} no computador/aparelho "${device}". Detalhes: ${params.description || params.message || 'Sem descrição adicional'}.`;
      }

      const newLog: AuditLog = {
        id: uniqueId,
        userId: currentUser?.id || 'sistema',
        userLogin,
        userRole: currentUser?.isAdmin ? 'Administrador' : userRole,
        userMatricula,
        timestamp: now,
        module: params.module,
        actionType: params.actionType,
        description: auditDesc,
        status: params.status || 'sucesso',
        device,
        riskLevel,
        entityId: params.entityId || params.referenceId,
        referenceId: params.referenceId || params.entityId,
        previousValue: params.previousValue,
        newValue: params.newValue,
        eventType: 'audit_log'
      };

      if (useSQLite) {
        electronAPI.db.insertAuditLog(newLog).catch((err: any) => {
          console.error('[SQLite] Falha ao inserir log de auditoria:', err);
        });
      }

      set((state) => ({ auditLogs: [newLog, ...state.auditLogs].slice(0, 5000) }));
    }
  },
  
  setMasterPassword: async (password) => {
    set({ masterPassword: password });
    await get().saveMasterCredentialsToSQLite();
    get().logAction({ module: 'Ajustes', actionType: 'config', description: 'Senha Master alterada', status: 'sucesso' });
  },

  setRecoveryMasterPassword: async (password) => {
    set({ recoveryMasterPassword: password });
    await get().saveMasterCredentialsToSQLite();
    get().logAction({ module: 'Segurança', actionType: 'config', description: 'Senha Mestre de Recuperação configurada', status: 'sucesso' });
  },

  resetMasterAdminPasswordWithKey: async (recoveryKey, newPassword) => {
    const { recoveryMasterPassword, users } = get();
    
    if (!recoveryMasterPassword || recoveryKey !== recoveryMasterPassword) {
      get().logAction({
        module: 'Segurança',
        actionType: 'other',
        description: 'Tentativa de recuperar senha com Senha Mestre incorreta.',
        status: 'bloqueado'
      });
      return { success: false, error: 'Senha Mestre de Recuperação incorreta.' };
    }

    const masterAdmin = users.find(u => u.id === 'admin' || u.isOwner || u.isMasterAdmin);
    if (!masterAdmin) {
      return { success: false, error: 'Usuário administrador mestre não encontrado.' };
    }

    const updatedAdminUser = { 
      ...masterAdmin, 
      password: newPassword, 
      status: 'ativo' as const, 
      isAdmin: true, 
      isOwner: true, 
      isMasterAdmin: true, 
      roleId: 'gerente',
      qrCodeToken: generateUUID()
    };

    const isDesktop = typeof window !== 'undefined' && !!(window as any).electron;
    const electronAPI = isDesktop ? (window as any).electron : null;
    if (isDesktop && electronAPI && electronAPI.db) {
      try {
        const success = await electronAPI.db.updateUser(masterAdmin.id, updatedAdminUser);
        if (!success) {
          throw new Error('Falha no SQLite ao atualizar senha do administrador.');
        }
      } catch (err: any) {
        console.error('[SQLite] resetMasterAdminPasswordWithKey error:', err);
        return { success: false, error: `Falha no banco local: ${err.message || err}` };
      }
    }

    const updatedUsers = users.map(u => u.id === masterAdmin.id ? updatedAdminUser : u);
    set({ users: updatedUsers });
    
    get().logAction({
      module: 'Segurança',
      actionType: 'config',
      description: `Senha do administrador principal (${masterAdmin.login}) alterada por Senha Mestre`,
      status: 'sucesso',
      referenceId: masterAdmin.id
    });
    
    get().addActivity(`Senha do administrador (${masterAdmin.login}) recuperada via Senha Mestre`, 'auth', 'Segurança');

    return { success: true };
  },

  addMasterAuthorization: async (auth) => {
    const { masterAuthorizations, users } = get();
    if (!auth.passwordMaster) {
      return { success: false, error: 'A senha master não pode ser vazia.' };
    }
    const duplicate = masterAuthorizations.find(a => a.userId === auth.userId);
    if (duplicate) {
      return { success: false, error: 'Este usuário já possui uma autorização master.' };
    }
    const userToAuth = users.find(u => u.id === auth.userId);
    if (!userToAuth) {
      return { success: false, error: 'Usuário selecionado inválido.' };
    }

    const newAuth: MasterAuthorization = {
      id: generateUUID(),
      userId: auth.userId,
      passwordMaster: auth.passwordMaster,
      status: auth.status,
      createdAt: Date.now(),
      lastUsedAt: null,
      observation: auth.observation
    };

    set((state) => ({ 
      masterAuthorizations: [...(state.masterAuthorizations || []), newAuth] 
    }));

    try {
      await get().saveMasterCredentialsToSQLite();
    } catch (err: any) {
      set((state) => ({ 
        masterAuthorizations: (state.masterAuthorizations || []).filter(a => a.id !== newAuth.id) 
      }));
      return { success: false, error: err.message };
    }

    get().logAction({ 
      module: 'Ajustes', 
      actionType: 'create', 
      description: `Cadastrada autorização master para ${userToAuth.fullName}`, 
      status: 'sucesso', 
      referenceId: newAuth.id 
    });

    return { success: true };
  },

  updateMasterAuthorization: async (id, updatedFields) => {
    const backup = get().masterAuthorizations;
    set((state) => ({
      masterAuthorizations: (state.masterAuthorizations || []).map((auth) =>
        auth.id === id ? { ...auth, ...updatedFields } : auth
      )
    }));

    try {
      await get().saveMasterCredentialsToSQLite();
    } catch (err: any) {
      set({ masterAuthorizations: backup });
      throw err;
    }

    const auth = get().masterAuthorizations.find(a => a.id === id);
    if (auth) {
      const user = get().users.find(u => u.id === auth.userId);
      const userName = user ? user.fullName : 'N/A';
      get().logAction({
        module: 'Ajustes',
        actionType: 'update',
        description: `Atualizada autorização master do usuário ${userName}`,
        status: 'sucesso',
        referenceId: id
      });
    }
  },

  deleteMasterAuthorization: async (id) => {
    const backupAuths = get().masterAuthorizations;
    const backupBadges = get().masterBadges;
    const auth = get().masterAuthorizations.find(a => a.id === id);
    const user = auth ? get().users.find(u => u.id === auth.userId) : null;
    const userName = user ? user.fullName : 'N/A';

    set((state) => ({
      masterAuthorizations: (state.masterAuthorizations || []).filter((a) => a.id !== id),
      masterBadges: (state.masterBadges || []).filter((b) => b.authorizationId !== id)
    }));

    try {
      await get().saveMasterCredentialsToSQLite();
    } catch (err: any) {
      set({ masterAuthorizations: backupAuths, masterBadges: backupBadges });
      throw err;
    }

    get().logAction({
      module: 'Ajustes',
      actionType: 'delete',
      description: `Excluída autorização master do usuário ${userName}`,
      status: 'sucesso',
      referenceId: id
    });
    get().addTombstone('masterAuthorizations', id);
  },

  generateMasterBadge: async (authId) => {
    const { masterAuthorizations, masterBadges, users } = get();
    const auth = masterAuthorizations.find(a => a.id === authId);
    if (!auth) {
      return { success: false, error: 'Autorização master correspondente não encontrada.' };
    }

    const currentBadgesCount = (masterBadges || []).filter(b => b.authorizationId === authId).length;
    if (currentBadgesCount >= 3) {
      return { success: false, error: 'Limite máximo de 3 crachás master por usuário atingido.' };
    }

    const user = users.find(u => u.id === auth.userId);
    const userName = user ? user.fullName : 'N/A';

    const cleanId = generateUUID();
    const code = `MST-${Math.floor(100000 + Math.random() * 900000)}`;

    const newBadge: MasterBadge = {
      id: cleanId,
      authorizationId: authId,
      userId: auth.userId,
      codigoMaster: code,
      status: 'ativo',
      createdAt: Date.now(),
      lastUsedAt: null
    };

    set((state) => ({
      masterBadges: [...(state.masterBadges || []), newBadge]
    }));

    try {
      await get().saveMasterCredentialsToSQLite();
    } catch (err: any) {
      set((state) => ({
        masterBadges: (state.masterBadges || []).filter(b => b.id !== cleanId)
      }));
      return { success: false, error: err.message };
    }

    get().logAction({
      module: 'Ajustes',
      actionType: 'create',
      description: `Gerado Crachá Master (${code}) para ${userName}`,
      status: 'sucesso',
      referenceId: newBadge.id
    });

    return { success: true, badge: newBadge };
  },

  updateMasterBadgeStatus: async (badgeId, status) => {
    const backup = get().masterBadges;
    set((state) => ({
      masterBadges: (state.masterBadges || []).map((b) =>
        b.id === badgeId ? { ...b, status } : b
      )
    }));

    try {
      await get().saveMasterCredentialsToSQLite();
    } catch (err: any) {
      set({ masterBadges: backup });
      throw err;
    }

    const badge = get().masterBadges.find(b => b.id === badgeId);
    if (badge) {
      const user = get().users.find(u => u.id === badge.userId);
      const userName = user ? user.fullName : 'N/A';
      get().logAction({
        module: 'Ajustes',
        actionType: 'status_change',
        description: `Crachá Master (${badge.codigoMaster}) de ${userName} foi alterado para ${status}`,
        status: 'sucesso',
        referenceId: badgeId
      });
    }
  },

  deleteMasterBadge: async (badgeId) => {
    const badge = get().masterBadges.find(b => b.id === badgeId);
    if (badge) {
      const user = get().users.find(u => u.id === badge.userId);
      const userName = user ? user.fullName : 'N/A';
      const backup = get().masterBadges;

      set((state) => ({
        masterBadges: (state.masterBadges || []).filter(b => b.id !== badgeId)
      }));

      try {
        await get().saveMasterCredentialsToSQLite();
      } catch (err: any) {
        set({ masterBadges: backup });
        throw err;
      }

      get().logAction({
        module: 'Ajustes',
        actionType: 'delete',
        description: `Removido Crachá Master (${badge.codigoMaster}) de ${userName}`,
        status: 'sucesso',
        referenceId: badgeId
      });
      get().addTombstone('masterBadges', badgeId);
    }
  },

  verifyMasterCredential: (passwordOrToken, actionName) => {
    const { masterAuthorizations, masterBadges, users, currentUser } = get();
    const actionDesc = actionName ? `Ação: ${actionName}` : 'Operação Crítica';
    const requester = currentUser ? `${currentUser.fullName} (${currentUser.login})` : 'Usuário';

    // 1. Password validation
    const auth = (masterAuthorizations || []).find(
      (a) => a.status === 'ativo' && a.passwordMaster === passwordOrToken
    );
    if (auth) {
      const user = users.find((usr) => usr.id === auth.userId && usr.status === 'ativo');
      if (user) {
        get().logAction({
          module: 'Acesso',
          actionType: 'other',
          action: 'Autorização ADM/master usada',
          description: `Autorização Master outorgada por ${user.fullName} via Senha. Relação: ${actionDesc}. Solicitante: ${requester}`,
          status: 'sucesso',
          referenceId: user.id,
          affectedEntity: 'Acesso Crítico',
          entityId: user.id,
          newValue: actionDesc,
          method: 'Senha'
        });
        get().addActivity(`Ação autorizada por master ${user.fullName} via Senha`, 'auth', 'Acesso');
        get().updateMasterAuthorization(auth.id, { lastUsedAt: Date.now() });
        return { success: true, authorizedUser: user, method: 'senha' };
      }
    }

    // 2. Token / QR Code validation
    const badge = (masterBadges || []).find(
      (b) => b.status === 'ativo' && b.codigoMaster === passwordOrToken
    );
    if (badge) {
      const authRel = (masterAuthorizations || []).find(a => a.id === badge.authorizationId);
      if (authRel && authRel.status === 'ativo') {
        const user = users.find((usr) => usr.id === badge.userId && usr.status === 'ativo');
        if (user) {
          get().logAction({
            module: 'Acesso',
            actionType: 'other',
            action: 'Autorização ADM/master usada',
            description: `Autorização Master outorgada por ${user.fullName} via Crachá. Relação: ${actionDesc}. Solicitante: ${requester}`,
            status: 'sucesso',
            referenceId: user.id,
            affectedEntity: 'Acesso Crítico',
            entityId: user.id,
            newValue: actionDesc,
            method: 'Crachá Master'
          });
          get().addActivity(`Ação autorizada por master ${user.fullName} via Crachá`, 'auth', 'Acesso');
          get().updateMasterAuthorization(badge.authorizationId, { lastUsedAt: Date.now() });
          
          // Also track on the badge itself by updating its lastUsedAt property if defined
          set((state) => ({
            masterBadges: (state.masterBadges || []).map(mb => 
              mb.id === badge.id ? { ...mb, lastUsedAt: Date.now() } : mb
            )
          }));

          return { success: true, authorizedUser: user, method: 'qrcode' };
        }
      }
    }

    // Checking if the scanned credential is a regular Access Badge (Operator) or standard User Token
    const bFound = (get().badges || []).find(b => b.codigoCracha === passwordOrToken && b.status === 'Vinculado' && b.usuarioVinculado);
    const resolvedUserId = bFound ? bFound.usuarioVinculado : null;
    const usrByToken = users.find(u => u.qrCodeToken === passwordOrToken && u.status === 'ativo');
    const uIdToCheck = resolvedUserId || (usrByToken ? usrByToken.id : null);

    if (uIdToCheck) {
      const activeMasterAuth = (masterAuthorizations || []).find(
        (a) => a.userId === uIdToCheck && a.status === 'ativo'
      );
      if (activeMasterAuth) {
        const authorizedUserObj = users.find((usr) => usr.id === uIdToCheck && usr.status === 'ativo');
        if (authorizedUserObj) {
          get().logAction({
            module: 'Acesso',
            actionType: 'other',
            action: 'Autorização ADM/master usada',
            description: `Autorização Master outorgada por ${authorizedUserObj.fullName} via Crachá de Acesso Autorizado. Relação: ${actionDesc}. Solicitante: ${requester}`,
            status: 'sucesso',
            referenceId: authorizedUserObj.id,
            affectedEntity: 'Acesso Crítico',
            entityId: authorizedUserObj.id,
            newValue: actionDesc,
            method: 'Crachá de Acesso Autorizado'
          });
          get().addActivity(`Ação autorizada por master ${authorizedUserObj.fullName} via Crachá de Acesso`, 'auth', 'Acesso');
          get().updateMasterAuthorization(activeMasterAuth.id, { lastUsedAt: Date.now() });
          return { success: true, authorizedUser: authorizedUserObj, method: 'qrcode' };
        }
      } else {
        return { success: false, error: 'Este é um Crachá de Acesso de operador. Para liberar esta ação crítica, use uma Chave Master de Supervisão autorizada.' };
      }
    }

    const isOperatorBadge = (get().badges || []).some(b => b.codigoCracha === passwordOrToken) || users.some(u => u.qrCodeToken === passwordOrToken);
    if (isOperatorBadge) {
      return { success: false, error: 'Este é um Crachá de Acesso de operador. Para liberar esta ação crítica, use uma Chave Master de Supervisão autorizada.' };
    }

    // 3. Fallback to legacy global password if enabled and matches
    const oldPassword = get().masterPassword;
    if (oldPassword && oldPassword === passwordOrToken) {
      get().logAction({
        module: 'Acesso',
        actionType: 'other',
        action: 'Autorização ADM/master usada',
        description: `Autorização Master outorgada via Chave Global. Relação: ${actionDesc}. Solicitante: ${requester}`,
        status: 'sucesso',
        affectedEntity: 'Acesso Crítico',
        newValue: actionDesc,
        method: 'Chave Global'
      });
      return { success: true, method: 'senha' };
    }

    get().logAction({
      module: 'Acesso',
      actionType: 'other',
      description: `Negado: Falha ao autorizar operação com a credencial inserida. Relação: ${actionDesc}. Solicitante: ${requester}`,
      status: 'bloqueado'
    });

    return { success: false, error: 'Credencial master inválida, inativa ou usuário inexistente.' };
  },

  verifyMasterNFC: (uid, actionName) => {
    const normalizeUID = (val: string) => (val || '').trim().replace(/[:\s-]/g, '').toUpperCase();
    const cleanInputUid = normalizeUID(uid);
    const actionDesc = actionName ? `Ação: ${actionName}` : 'Operação Crítica';
    const requester = get().currentUser ? `${get().currentUser.fullName} (${get().currentUser.login})` : 'Operador';

    if (!cleanInputUid) {
      return { success: false, error: 'UID inválido ou vazio.' };
    }

    const tags = get().nfcTags || [];
    const tag = tags.find(t => normalizeUID(t.uid) === cleanInputUid && t.status !== 'Excluido');

    if (!tag) {
      get().logAction({
        module: 'Acesso',
        actionType: 'other',
        action: 'Autorização Negada NFC Master',
        description: `Negado: Tentativa de autorização com Tag NFC Master desconhecida ou não cadastrada (UID: ${cleanInputUid}). Solicitante: ${requester}`,
        status: 'erro'
      });
      return { success: false, error: 'Esta tag NFC não possui autorização Master.' };
    }

    if (tag.tipoCredencial !== 'MASTER') {
      get().logAction({
        module: 'Acesso',
        actionType: 'other',
        action: 'Autorização Negada NFC Master',
        description: `Negado: Tentativa de autorização de ação crítica usando tag sem permissão master (UID: ${tag.uid}). Solicitante: ${requester}`,
        status: 'erro',
        referenceId: tag.id
      });
      return { success: false, error: 'Esta tag NFC não possui autorização Master.' };
    }

    // Validações de Status da Tag NFC Master
    if (tag.status === 'Bloqueado') {
      get().logAction({
        module: 'Acesso',
        actionType: 'other',
        action: 'Autorização Negada NFC Master',
        description: `Negado: Tentativa de autorização com Tag NFC Master bloqueada (UID: ${tag.uid}). Solicitante: ${requester}`,
        status: 'erro',
        referenceId: tag.id
      });
      return { success: false, error: 'Esta credencial Master está bloqueada.' };
    }

    if (tag.status === 'Perdido') {
      get().logAction({
        module: 'Acesso',
        actionType: 'other',
        action: 'Autorização Negada NFC Master',
        description: `Negado: Tentativa de autorização com Tag NFC Master perdida (UID: ${tag.uid}). Solicitante: ${requester}`,
        status: 'erro',
        referenceId: tag.id
      });
      return { success: false, error: 'Esta tag NFC foi marcada como perdida.' };
    }

    if (tag.status === 'Quarentena') {
      get().logAction({
        module: 'Acesso',
        actionType: 'other',
        action: 'Autorização Negada NFC Master',
        description: `Negado: Tentativa de autorização com Tag NFC Master em quarentena (UID: ${tag.uid}). Solicitante: ${requester}`,
        status: 'erro',
        referenceId: tag.id
      });
      return { success: false, error: 'Esta tag NFC está em quarentena e não pode ser usada.' };
    }

    // Validação do Vínculo
    if (!tag.usuarioVinculado) {
      get().logAction({
        module: 'Acesso',
        actionType: 'other',
        action: 'Autorização Negada NFC Master',
        description: `Negado: Tentativa de autorização com Tag NFC Master sem usuário vinculado (UID: ${tag.uid}). Solicitante: ${requester}`,
        status: 'erro',
        referenceId: tag.id
      });
      return { success: false, error: 'Esta tag NFC não possui autorização Master.' };
    }

    const matchedSupervisor = get().users.find(u => u.id === tag.usuarioVinculado);

    if (!matchedSupervisor) {
      get().logAction({
        module: 'Acesso',
        actionType: 'other',
        action: 'Autorização Negada NFC Master',
        description: `Negado: Tentativa de autorização com Tag NFC Master vinculada a usuário inexistente (UID: ${tag.uid}). Solicitante: ${requester}`,
        status: 'erro',
        referenceId: tag.id
      });
      return { success: false, error: 'Supervisor Master inválido.' };
    }

    // Validação se supervisor está ativo
    if (matchedSupervisor.status !== 'ativo') {
      get().logAction({
        module: 'Acesso',
        actionType: 'other',
        action: 'Autorização Negada NFC Master',
        description: `Negado: Supervisor inativo tentou autorizar: ${matchedSupervisor.fullName} (${matchedSupervisor.login}) usando Tag (UID: ${tag.uid}). Solicitante: ${requester}`,
        status: 'erro',
        referenceId: matchedSupervisor.id
      });
      return { success: false, error: 'Supervisor Master inválido.' };
    }

    // Validação da Permissão Master do Usuário Supervisor correspondente (deve possuir autorização master ou ser admin)
    const isSuperMaster = matchedSupervisor.id === 'admin' || matchedSupervisor.isMasterAdmin || matchedSupervisor.isOwner;
    const hasMasterAuthObj = get().masterAuthorizations?.some(a => a.userId === matchedSupervisor.id && a.status === 'ativo');

    if (!isSuperMaster && !hasMasterAuthObj) {
      get().logAction({
        module: 'Acesso',
        actionType: 'other',
        action: 'Autorização Negada NFC Master',
        description: `Negado: Usuário vinculado não possui permissão master ativa: ${matchedSupervisor.fullName} (UID: ${tag.uid}). Solicitante: ${requester}`,
        status: 'erro',
        referenceId: tag.id
      });
      return { success: false, error: 'Esta tag NFC não possui autorização Master.' };
    }

    // SUCESSO: Ação autorizada por NFC Master
    // Atualiza o último uso da tag
    set((state) => ({
      nfcTags: (state.nfcTags || []).map(t => t.id === tag.id ? { ...t, ultimoUso: Date.now() } : t)
    }));

    // Se houver uma autorização master cadastrada para o supervisor, atualiza Date.now()
    if (hasMasterAuthObj) {
      const authObj = get().masterAuthorizations.find(a => a.userId === matchedSupervisor.id);
      if (authObj) get().updateMasterAuthorization(authObj.id, { lastUsedAt: Date.now() });
    }

    get().addActivity(`Ação autorizada por master ${matchedSupervisor.fullName} via NFC`, 'auth', 'Acesso');

    // Registrar auditoria completa solicitada:
    // "Registrar: supervisor, UID, terminal, ação, data/hora, operador solicitante."
    get().logAction({
      module: 'Acesso',
      actionType: 'other',
      action: 'Autorização ADM/master usada',
      description: `Autorização Master outorgada por ${matchedSupervisor.fullName} via NFC Master (UID: ${tag.uid}). Relação: ${actionDesc}. Solicitante: ${requester}`,
      status: 'sucesso',
      referenceId: matchedSupervisor.id,
      affectedEntity: 'Acesso Crítico',
      entityId: matchedSupervisor.id,
      newValue: actionDesc,
      method: 'NFC Master'
    });

    return { success: true, authorizedUser: matchedSupervisor };
  },

  verifyMasterPassword: (password) => {
    // Wrap around verifyMasterCredential for perfect backward compatibility with existing modals!
    const res = get().verifyMasterCredential(password);
    return res.success;
  },

  loginLocal: (login, password) => {
    const masterAdmin = get().users.find(u => u.id === 'admin' || u.isOwner || u.isMasterAdmin);
    const firstAccessSetupComplete = get().firstAccessSetupComplete;
    const isDefaultState = !firstAccessSetupComplete && (masterAdmin ? (masterAdmin.login === 'admin' && masterAdmin.password === '1234') : true);

    const normInputLogin = (login || '').trim().toLowerCase();
    const normInputPassword = (password || '').trim();

    // 1. Logs de Diagnóstico Seguros
    console.group('🔒 [Diagnóstico de Autenticação]');
    console.log(`- Login digitado: "${login}" -> Normalizado: "${normInputLogin}"`);
    console.log(`- Senha digitada: [comprimento: ${normInputPassword.length}]`);
    console.log(`- FirstAccessSetupComplete: ${firstAccessSetupComplete}`);
    console.log(`- IsDefaultState: ${isDefaultState}`);
    console.log(`- Usuários atualmente carregados no banco local (${get().users.length}):`);
    get().users.forEach(u => {
      console.log(`  • Usuário [id=${u.id}]: login="${u.login}" (normalizado: "${(u.login || '').trim().toLowerCase()}"), status="${u.status}", isAdmin=${u.isAdmin || false}, isOwner=${u.isOwner || false}, isMasterAdmin=${u.isMasterAdmin || false}, senhaSalvaLength=${u.password ? u.password.trim().length : 0}`);
    });

    // 2. Fluxo de primeiro acesso (login ADM inicial unconfigurado)
    if ((normInputLogin === 'admin' || normInputLogin === 'adm') && normInputPassword === '1234' && isDefaultState) {
      console.log('- ✅ Autenticando com credenciais ADM padrão de primeiro acesso.');
      let admin = masterAdmin;
      if (!admin) {
        admin = {
          id: 'admin',
          fullName: 'Administrador Nexa',
          login: 'admin',
          matricula: 'admin',
          password: '1234',
          roleId: 'administrador',
          status: 'ativo',
          isAdmin: true,
          isOwner: true,
          isMasterAdmin: true,
          qrCodeToken: 'admin-initial-token'
        };
        set(state => ({ users: [...state.users, admin!] }));
      } else if (admin.password !== '1234' || admin.status !== 'ativo' || !admin.isOwner || !admin.isMasterAdmin || admin.login !== 'admin') {
        set(state => ({
          users: state.users.map(u => u.id === 'admin' ? { ...u, login: 'admin', matricula: 'admin', password: '1234', status: 'ativo' as const, isAdmin: true, isOwner: true, isMasterAdmin: true, roleId: 'administrador' } : u)
        }));
        admin = { ...admin, login: 'admin', matricula: 'admin', password: '1234', status: 'ativo', isAdmin: true, isOwner: true, isMasterAdmin: true, roleId: 'administrador' };
      }
      
      const previousUser = get().currentUser;
      if (get().isAuthenticated && previousUser && previousUser.id !== admin.id) {
        if (get().isOperationCriticalActive()) {
          console.warn("Login of different user blocked: critical operation active.");
          console.groupEnd();
          return false;
        }
        const currentCashier = get().currentCashier;
        if (currentCashier && (currentCashier.openedBy === previousUser.fullName || currentCashier.openedBy === previousUser.login)) {
          get().autoCloseActiveCashier('troca_senha', admin);
        }
      }

      set({ currentUser: admin, isAuthenticated: true, pendingWelcome: true });
      get().addActivity(`Login administrativo inicial realizado`, 'auth', 'Acesso');
      console.groupEnd();
      return true;
    }

    // 3. Autenticação padronizada para novo login (idêntica comparação com lowercase e trim)
    const matchedUser = get().users.find(u => {
      const normSavedLogin = (u.login || '').trim().toLowerCase();
      const normSavedMatricula = (u.matricula || '').trim().toLowerCase();
      return (normSavedLogin === normInputLogin || normSavedMatricula === normInputLogin) && u.status === 'ativo';
    });

    if (matchedUser) {
      console.log(`- Usuário ativo com login correspondente encontrado: "${matchedUser.fullName}" (ID: ${matchedUser.id})`);
      const storedPassword = (matchedUser.password || '').trim();

      if (storedPassword !== normInputPassword) {
        console.warn(`- ❌ Motivo da rejeição: Senhas são diferentes.`);
        console.log(`  • Comprimento da senha armazenada: ${storedPassword.length}`);
        console.log(`  • Comprimento da senha digitada: ${normInputPassword.length}`);
        console.groupEnd();
        return false;
      }

      console.log(`- ✅ Autenticação bem-sucedida para o usuário: "${matchedUser.fullName}"`);
      
      const previousUser = get().currentUser;
      if (get().isAuthenticated && previousUser && previousUser.id !== matchedUser.id) {
        if (get().isOperationCriticalActive()) {
          console.warn("Login of different user blocked: critical operation active.");
          console.groupEnd();
          return false;
        }
        const currentCashier = get().currentCashier;
        if (currentCashier && (currentCashier.openedBy === previousUser.fullName || currentCashier.openedBy === previousUser.login)) {
          get().autoCloseActiveCashier('troca_senha', matchedUser);
        }
      }

      set({ currentUser: matchedUser, isAuthenticated: true, pendingWelcome: true });
      get().addActivity(`Login local realizado: ${matchedUser.fullName}`, 'auth', 'Acesso');
      get().logAction({ 
         module: 'Acesso', 
         actionType: 'login', 
         description: `Login realizado: ${matchedUser.login}`, 
         status: 'sucesso', 
         referenceId: matchedUser.id 
      });
      console.groupEnd();
      return true;
    }

    console.warn(`- ❌ Motivo da rejeição: Nenhum usuário ativo encontrado com o login "${normInputLogin}".`);
    console.groupEnd();
    return false;
  },

  loginWithQRCode: (token: string) => {
    // 0. Se for um JSON de criancao de crachá admin:
    try {
      if (token && token.trim().startsWith('{')) {
        const parsed = JSON.parse(token);
        if (parsed && parsed.type === 'admin-badge' && parsed.userId) {
          const user = get().users.find(u => u.id === parsed.userId && u.qrCodeToken === parsed.tokenId && u.status === 'ativo');
          if (user) {
            if (user.qrCodeBlocked) {
              get().logAction({
                module: 'Acesso',
                actionType: 'login',
                action: 'Tentativa Negada QR Code',
                description: `Bloqueado: Tentativa de login via QR Code do Administrador mas o seu QR Code está BLOQUEADO temporariamente.`,
                status: 'erro',
                referenceId: user.id
              });
              return false;
            }
            if (!get().handleUserSwapCheck(user)) return false;
            set({ currentUser: user, isAuthenticated: true, pendingWelcome: true });
            get().addActivity(`Login via Crachá Admin realizado: ${user.fullName}`, 'auth', 'Acesso');
            get().logAction({ module: 'Acesso', actionType: 'login', description: `Login via Crachá Administrativo realizado: ${user.login}`, status: 'sucesso', referenceId: user.id });
            return true;
          }
        }
      }
    } catch (_) {}

    // 1. Procurar se o token escaneado é o código de algum crachá
    const badge = (get().badges || []).find(b => b.codigoCracha === token);
    
    if (badge) {
      // Se encontrar o crachá:
      // se estiver desvinculado (Livre), bloqueado ou perdido, bloqueia o acesso
      if (isBadgeBlocked(badge)) {
        get().logAction({
          module: 'Acesso',
          actionType: 'login',
          action: 'Tentativa Negada Crachá',
          description: `Bloqueado: Tentativa de login com Crachá de Acesso BLOQUEADO (Código: ${badge.codigoCracha})`,
          status: 'erro',
          referenceId: badge.usuarioVinculado || undefined
        });
        return false;
      }
      if (badge.status !== 'Vinculado' || !badge.usuarioVinculado) {
        get().logAction({
          module: 'Acesso',
          actionType: 'login',
          action: 'Tentativa Negada Crachá',
          description: `Bloqueado: Tentativa de login com Crachá de Acesso DESVINCULADO ou LIVRE (Código: ${badge.codigoCracha})`,
          status: 'erro'
        });
        return false;
      }
      
      // Procura o usuário correspondente
      const user = get().users.find(u => u.id === badge.usuarioVinculado && u.status === 'ativo');
      if (user) {
        if (user.qrCodeBlocked) {
          get().logAction({
            module: 'Acesso',
            actionType: 'login',
            action: 'Tentativa Negada QR Code',
            description: `Bloqueado: Tentativa de login via Crachá de ${user.fullName} (${user.login}) porém o seu QR Code está BLOQUEADO.`,
            status: 'erro',
            referenceId: user.id
          });
          return false;
        }
        if (!get().handleUserSwapCheck(user)) return false;
        set({ currentUser: user, isAuthenticated: true, pendingWelcome: true });
        get().addActivity(`Login via Crachá realizado: ${user.fullName}`, 'auth', 'Acesso');
        get().logAction({ module: 'Acesso', actionType: 'login', description: `Login via Crachá realizado: ${user.login} (Crachá: ${badge.codigoCracha})`, status: 'sucesso', referenceId: user.id });
        
        // Atualiza a data do último uso
        set((state) => ({
          badges: (state.badges || []).map(b => b.id === badge.id ? { ...b, ultimoUso: Date.now() } : b)
        }));
        
        return true;
      }
      return false;
    }
    
    // 2. Se não for um crachá, tenta fazer login pelo qrCodeToken antigo como fallback
    const user = get().users.find(u => u.qrCodeToken === token && u.status === 'ativo');
    if (user) {
      if (user.qrCodeBlocked) {
        get().logAction({
          module: 'Acesso',
          actionType: 'login',
          action: 'Tentativa Negada QR Code',
          description: `Bloqueado: Tentativa de login com QR Code de ${user.fullName} (${user.login}) porém o seu QR Code está BLOQUEADO.`,
          status: 'erro',
          referenceId: user.id
        });
        return false;
      }
      if (!get().handleUserSwapCheck(user)) return false;
      set({ currentUser: user, isAuthenticated: true, pendingWelcome: true });
      get().addActivity(`Login via QR Code realizado: ${user.fullName}`, 'auth', 'Acesso');
      get().logAction({ module: 'Acesso', actionType: 'login', description: `Login via QR Code realizado: ${user.login}`, status: 'sucesso', referenceId: user.id });
      return true;
    }
    return false;
  },

  loginWithNFC: (uid: string) => {
    const normalizeUID = (val: string) => (val || '').trim().replace(/[:\s-]/g, '').toUpperCase();
    const cleanInputUid = normalizeUID(uid);

    if (!cleanInputUid) {
      return { success: false, error: 'UID inválido ou vazio.' };
    }

    const tags = get().nfcTags || [];
    // Buscar a tag NFC correspondente comparando os UIDs normalizados
    const tag = tags.find(t => normalizeUID(t.uid) === cleanInputUid && t.status !== 'Excluido');

    if (!tag) {
      // Registrar tentativa negada na auditoria
      get().logAction({
        module: 'Acesso',
        actionType: 'login',
        action: 'Tentativa Negada NFC',
        description: `Tentativa de login via NFC com Tag desconhecida ou não cadastrada (UID: ${uid})`,
        status: 'erro'
      });
      return { success: false, error: 'Tag NFC não cadastrada no sistema.' };
    }

    // Validações para Credenciais do tipo ADM
    if (tag.tipoCredencial === 'ADM') {
      if (tag.status === 'Bloqueado') {
        get().logAction({
          module: 'Acesso',
          actionType: 'login',
          action: 'Tentativa Negada NFC ADM',
          description: `Bloqueado: Tentativa de login via NFC ADM com Tag bloqueada (UID: ${tag.uid})`,
          status: 'erro',
          referenceId: tag.id
        });
        return { success: false, error: 'Esta credencial ADM está bloqueada.' };
      }

      if (tag.status === 'Perdido') {
        get().logAction({
          module: 'Acesso',
          actionType: 'login',
          action: 'Tentativa Negada NFC ADM',
          description: `Perdido: Tentativa de login via NFC ADM com Tag marcada como perdida (UID: ${tag.uid})`,
          status: 'erro',
          referenceId: tag.id
        });
        return { success: false, error: 'Esta tag NFC foi marcada como perdida.' };
      }

      if (tag.status === 'Quarentena') {
        get().logAction({
          module: 'Acesso',
          actionType: 'login',
          action: 'Tentativa Negada NFC ADM',
          description: `Bloqueado: Tentativa de login via NFC ADM com Tag em quarentena (UID: ${tag.uid})`,
          status: 'erro',
          referenceId: tag.id
        });
        return { success: false, error: 'Esta tag NFC está em quarentena e não pode ser usada.' };
      }

      if (!tag.usuarioVinculado) {
        get().logAction({
          module: 'Acesso',
          actionType: 'login',
          action: 'Tentativa Negada NFC ADM',
          description: `Negado: Tentativa de login NFC ADM sem usuário vinculado (UID: ${tag.uid})`,
          status: 'erro',
          referenceId: tag.id
        });
        return { success: false, error: 'Esta tag não pertence ao Administrador Principal.' };
      }

      const matchedAdmin = get().users.find(u => u.id === tag.usuarioVinculado);
      if (!matchedAdmin || !(matchedAdmin.id === 'admin' || matchedAdmin.isMasterAdmin || matchedAdmin.isOwner)) {
        get().logAction({
          module: 'Acesso',
          actionType: 'login',
          action: 'Tentativa Negada NFC ADM',
          description: `Negado: Tentativa de login NFC ADM vinculada a usuário não-administrador (UID: ${tag.uid})`,
          status: 'erro',
          referenceId: tag.id
        });
        return { success: false, error: 'Esta tag não pertence ao Administrador Principal.' };
      }

      if (matchedAdmin.status !== 'ativo') {
        get().logAction({
          module: 'Acesso',
          actionType: 'login',
          action: 'Tentativa Negada NFC ADM',
          description: `Negado: Tentativa de login NFC ADM com administrador inativo: ${matchedAdmin.fullName} (UID: ${tag.uid})`,
          status: 'erro',
          referenceId: matchedAdmin.id
        });
        return { success: false, error: 'Usuário administrador vinculado está inativo.' };
      }

      if (!get().handleUserSwapCheck(matchedAdmin)) {
        return { success: false, error: 'Existe uma operação crítica em andamento. Finalize ou cancele antes de trocar operador.' };
      }

      // LOGIN ADMINISTRATIVO AUTOMÁTICO
      set({ currentUser: matchedAdmin, isAuthenticated: true, pendingWelcome: true });

      set((state) => ({
        nfcTags: (state.nfcTags || []).map(t => t.id === tag.id ? { ...t, ultimoUso: Date.now() } : t)
      }));

      get().addActivity(`Acesso administrativo autorizado via NFC para: ${matchedAdmin.fullName}`, 'auth', 'Acesso');
      get().logAction({
        module: 'Acesso',
        actionType: 'login',
        description: `Acesso administrativo autorizado. Login: ${matchedAdmin.login} (Tag ADM: ${tag.uid})`,
        status: 'sucesso',
        referenceId: matchedAdmin.id
      });

      return { success: true };
    }

    // Impedir login de supervisor / master na tela de login de operador com tag MASTER
    if (tag.tipoCredencial === 'MASTER') {
      get().logAction({
        module: 'Acesso',
        actionType: 'login',
        action: 'Tentativa Negada NFC',
        description: `Negado: Tentativa de login operacional usando tag NFC do tipo MASTER (UID: ${tag.uid})`,
        status: 'erro',
        referenceId: tag.id
      });
      return { success: false, error: 'Esta tag NFC não possui autorização de acesso de login operacional (Nível Master).' };
    }

    // Validações de Status da Tag NFC comum / operador
    if (tag.status === 'Bloqueado') {
      get().logAction({
        module: 'Acesso',
        actionType: 'login',
        action: 'Tentativa Negada NFC',
        description: `Bloqueado: Tentativa de login via NFC com Tag bloqueada (UID: ${tag.uid})`,
        status: 'erro',
        referenceId: tag.id
      });
      return { success: false, error: 'Esta tag NFC está bloqueada.' };
    }

    if (tag.status === 'Perdido') {
      get().logAction({
        module: 'Acesso',
        actionType: 'login',
        action: 'Tentativa Negada NFC',
        description: `Bloqueado: Tentativa de login via NFC com Tag perdida (UID: ${tag.uid})`,
        status: 'erro',
        referenceId: tag.id
      });
      return { success: false, error: 'Esta tag NFC foi marcada como perdida.' };
    }

    if (tag.status === 'Quarentena') {
      get().logAction({
        module: 'Acesso',
        actionType: 'login',
        action: 'Tentativa Negada NFC',
        description: `Bloqueado: Tentativa de login via NFC com Tag em quarentena (UID: ${tag.uid})`,
        status: 'erro',
        referenceId: tag.id
      });
      return { success: false, error: 'Esta tag NFC está em quarentena e não pode ser usada.' };
    }

    // Se o vínculo não estiver preenchido ou for inválido
    if (!tag.usuarioVinculado) {
      get().logAction({
        module: 'Acesso',
        actionType: 'login',
        action: 'Tentativa Negada NFC',
        description: `Bloqueado: Tentativa de login via NFC com Tag sem usuário vinculado (UID: ${tag.uid})`,
        status: 'erro',
        referenceId: tag.id
      });
      return { success: false, error: 'Esta tag NFC ainda não está vinculada a nenhum usuário.' };
    }

    const matchedUser = get().users.find(u => u.id === tag.usuarioVinculado);

    if (!matchedUser) {
      get().logAction({
        module: 'Acesso',
        actionType: 'login',
        action: 'Tentativa Negada NFC',
        description: `Bloqueado: Tentativa de login via NFC com Tag vinculada a usuário inexistente (UID: ${tag.uid})`,
        status: 'erro',
        referenceId: tag.id
      });
      return { success: false, error: 'Esta tag NFC ainda não está vinculada a nenhum usuário.' };
    }

    // Validação de Usuário Inativo
    if (matchedUser.status !== 'ativo') {
      get().logAction({
        module: 'Acesso',
        actionType: 'login',
        action: 'Tentativa Negada NFC',
        description: `Bloqueado: Tentativa de login via NFC com usuário inativo: ${matchedUser.fullName} (${matchedUser.login}) usando Tag (UID: ${tag.uid})`,
        status: 'erro',
        referenceId: matchedUser.id
      });
      return { success: false, error: 'Usuário vinculado a esta tag está inativo.' };
    }

    if (!get().handleUserSwapCheck(matchedUser)) {
      return { success: false, error: 'Existe uma operação crítica em andamento. Finalize ou cancele antes de trocar operador.' };
    }

    // LOGIN DO USUÁRIO VINCULADO (OPERADOR)
    set({ currentUser: matchedUser, isAuthenticated: true, pendingWelcome: true });
    
    // Atualiza a data do último uso da tag nfc
    set((state) => ({
      nfcTags: (state.nfcTags || []).map(t => t.id === tag.id ? { ...t, ultimoUso: Date.now() } : t)
    }));

    get().addActivity(`Login via NFC realizado: ${matchedUser.fullName}`, 'auth', 'Acesso');
    get().logAction({
      module: 'Acesso',
      actionType: 'login',
      description: `Login via NFC realizado com sucesso: ${matchedUser.login} (Tag: ${tag.uid})`,
      status: 'sucesso',
      referenceId: matchedUser.id
    });

    return { success: true };
  },

  loginWithFaceBiometric: (userId: string) => {
    const matchedUser = get().users.find(u => u.id === userId && u.status === 'ativo');
    if (!matchedUser) {
      get().logAction({
        module: 'Acesso',
        actionType: 'login',
        action: 'Tentativa Negada Biometria',
        description: `Negado: Usuário inativo ou inexistente tentou login facial (ID: ${userId})`,
        status: 'erro'
      });
      return false;
    }

    const isAdm = matchedUser.id === 'admin' || matchedUser.isMasterAdmin || matchedUser.isOwner || matchedUser.login === 'admin';

    set({ currentUser: matchedUser, isAuthenticated: true, pendingWelcome: true });
    get().addActivity(`Login via Biometria Facial realizado: ${matchedUser.fullName}`, 'auth', 'Acesso');
    get().logAction({
      module: 'Acesso',
      actionType: 'login',
      action: isAdm ? 'Autorização Facial ADM' : 'Login Facial de Colaborador',
      description: `Login via Biometria Facial realizado com sucesso offline: ${matchedUser.fullName} (Login: ${matchedUser.login})`,
      status: 'sucesso',
      referenceId: matchedUser.id
    });
    return true;
  },

  updateUserQRCode: (userId: string) => {
    const newToken = generateUUID();
    set((state) => ({
      users: state.users.map(u => u.id === userId ? { ...u, qrCodeToken: newToken } : u),
      currentUser: state.currentUser?.id === userId ? { ...state.currentUser, qrCodeToken: newToken } : state.currentUser
    }));
    get().addActivity(`QR Code do usuário atualizado`, 'auth', 'Ajustes');
  },

  logoutLocal: () => {
    try {
      console.log("Definitive Logout initiated...");
      
      // Check for any active critical operations in the system
      if (get().isOperationCriticalActive()) {
        alert("Existe uma operação crítica em andamento. Finalize ou cancele antes de encerrar a sessão.");
        get().logAction({
          module: 'Acesso',
          actionType: 'other',
          action: 'Sair da Conta Bloqueado',
          description: `Tentativa de encerramento de sessão bloqueada devido a operação crítica em andamento.`,
          status: 'erro'
        });
        return;
      }

      // Safe Auto Cashier close on logout
      const currentCashier = get().currentCashier;
      const currentUser = get().currentUser;
      if (currentCashier && currentUser) {
        if (currentCashier.openedBy === currentUser.fullName || currentCashier.openedBy === currentUser.login) {
          get().autoCloseActiveCashier('logout');
        }
      }
      
      // 1. Clear state in store
      set({ 
        currentUser: null, 
        isAuthenticated: false,
        pendingWelcome: false,
        isSettingsOpen: false, 
        activeSettingModule: null 
      });

      // 2. Clear all possible localStorage keys associated with sessions
      const sessionKeys = [
        "currentUser", "loggedUser", "authUser", "userSession", 
        "session", "isAuthenticated", "authToken", "user", 
        "activeUser", "user_session", "auth_token", 
        "firebase:auth", "sb-token" // common ones just in case
      ];
      
      sessionKeys.forEach(key => {
        try {
          localStorage.removeItem(key);
          sessionStorage.removeItem(key);
        } catch(e) {}
      });

      // 4. Clear all sessionStorage
      try {
        sessionStorage.clear();
      } catch(e) {}

      // 4. Log the activity (if possible before complete clear)
      get().logActivity(`Sessão finalizada com sucesso.`);

      console.log("Definitive Logout completed. Forcing UI refresh via state.");
      
      // 5. As a ultimate fail-safe for the "exposed menu" issue, 
      // we can force a location change which will definitely trigger a clean render
      // window.location.href = '/';
    } catch (error) {
      console.error("Critical error during logout:", error);
      // Fallback: reach for the sledgehammer if the store update failed
      window.location.href = '/';
    }
  },

  logActivity: (message: string) => {
    const user = get().currentUser;
    const userName = user ? user.fullName : 'Sistema';
    get().addActivity(message, 'auth', 'Acesso', userName);
  },

  updateCompany: async (data) => {
    const backup = get().company;
    set((state) => ({
      company: { ...state.company, ...data }
    }));
    
    const isDesktop = typeof window !== 'undefined' && !!(window as any).electron;
    const electronAPI = isDesktop ? (window as any).electron : null;
    if (isDesktop && electronAPI && electronAPI.db) {
      try {
        const success = await electronAPI.db.insertCompanySetting({
          id: 'company_info',
          ...get().company
        });
        if (!success) {
          throw new Error('Falha no SQLite ao salvar configurações da empresa.');
        }
      } catch (err: any) {
        set({ company: backup });
        console.error('[SQLite] updateCompany error:', err);
        throw err;
      }
    }
    get().addActivity('Dados da empresa atualizados', 'auth', 'Ajustes');
  },

  updateReceiptConfig: async (config) => {
    const backup = get().receiptConfig;
    set((state) => ({
      receiptConfig: { ...state.receiptConfig, ...config }
    }));
    try {
      await get().savePrintSettingsToSQLite();
    } catch (err: any) {
      set({ receiptConfig: backup });
      throw err;
    }
    get().addActivity('Layout do recibo térmico atualizado', 'auth', 'Ajustes');
  },

  updateOrderTicketConfig: async (config) => {
    const backup = get().orderTicketConfig;
    set((state) => ({
      orderTicketConfig: { ...state.orderTicketConfig, ...config }
    }));
    try {
      await get().savePrintSettingsToSQLite();
    } catch (err: any) {
      set({ orderTicketConfig: backup });
      throw err;
    }
    get().addActivity('Layout do cupom de pedido atualizado', 'auth', 'Ajustes');
  },
  
  updateLabelConfig: async (config) => {
    const backup = get().labelConfig;
    set((state) => ({
      labelConfig: { ...state.labelConfig, ...config }
    }));
    try {
      await get().savePrintSettingsToSQLite();
    } catch (err: any) {
      set({ labelConfig: backup });
      throw err;
    }
    get().addActivity('Layout de etiquetas atualizado', 'auth', 'Ajustes');
  },
  
  updateLabelBatchConfig: async (config) => {
    const backup = get().labelBatchConfig;
    set((state) => ({
      labelBatchConfig: { ...state.labelBatchConfig, ...config }
    }));
    try {
      await get().savePrintSettingsToSQLite();
    } catch (err: any) {
      set({ labelBatchConfig: backup });
      throw err;
    }
    get().addActivity('Layout de lote de etiquetas atualizado', 'auth', 'Ajustes');
  },
  
  updateBadgeConfig: async (config) => {
    const backup = get().badgeConfig;
    set((state) => ({
      badgeConfig: { ...state.badgeConfig, ...config }
    }));
    try {
      await get().savePrintSettingsToSQLite();
    } catch (err: any) {
      set({ badgeConfig: backup });
      throw err;
    }
    get().addActivity('Layout de crachás atualizado', 'auth', 'Ajustes');
  },
  addBadgeTemplate: async (name, config) => {
    const backup = get().badgeSavedTemplates;
    set((state) => {
      const currentTemplates = state.badgeSavedTemplates || [];
      const id = Date.now().toString();
      return {
        badgeSavedTemplates: [...currentTemplates, { id, name, config }]
      };
    });
    try {
      await get().savePrintSettingsToSQLite();
    } catch (err: any) {
      set({ badgeSavedTemplates: backup });
      throw err;
    }
    get().addActivity(`Template de crachá "${name}" salvo`, 'auth', 'Ajustes');
  },
  deleteBadgeTemplate: async (id) => {
    const backup = get().badgeSavedTemplates;
    set((state) => {
      const currentTemplates = state.badgeSavedTemplates || [];
      const updated = currentTemplates.filter(t => t.id !== id);
      return {
        badgeSavedTemplates: updated
      };
    });
    try {
      await get().savePrintSettingsToSQLite();
    } catch (err: any) {
      set({ badgeSavedTemplates: backup });
      throw err;
    }
    get().addActivity('Template de crachá excluído', 'auth', 'Ajustes');
  },
  
  updateCustomerExperienceConfig: async (config) => {
    const backup = get().customerExperienceConfig;
    set((state) => ({
      customerExperienceConfig: { ...state.customerExperienceConfig, ...config }
    }));
    try {
      await get().savePrintSettingsToSQLite();
    } catch (err: any) {
      set({ customerExperienceConfig: backup });
      throw err;
    }
    get().addActivity('Configuração de experiência do cliente atualizada', 'auth', 'Ajustes');
  },
  updateCatalogConfig: async (config) => {
    const backup = get().catalogConfig;
    set((state) => ({
      catalogConfig: { ...state.catalogConfig, ...config }
    }));
    try {
      await get().savePrintSettingsToSQLite();
    } catch (err: any) {
      set({ catalogConfig: backup });
      throw err;
    }
    get().addActivity('Configuração do catálogo de produtos atualizada', 'auth', 'Ajustes');
  },

  addToLabelBatch: (productId) => {
    set((state) => {
      const existing = state.labelBatchItems.find(item => item.productId === productId);
      if (existing) {
        return {
          labelBatchItems: state.labelBatchItems.map(item => 
            item.productId === productId 
              ? { ...item, quantity: item.quantity + 1 } 
              : item
          )
        };
      }
      return {
        labelBatchItems: [...state.labelBatchItems, { productId, quantity: 1 }]
      };
    });
  },

  updateLabelBatchQuantity: (productId, quantity) => {
    set((state) => ({
      labelBatchItems: state.labelBatchItems.map(item => 
        item.productId === productId ? { ...item, quantity: Math.max(1, quantity) } : item
      )
    }));
  },

  removeFromLabelBatch: (productId) => {
    set((state) => ({
      labelBatchItems: state.labelBatchItems.filter(item => item.productId !== productId)
    }));
  },

  clearLabelBatch: () => {
    set({ labelBatchItems: [] });
  },

  addPrinter: async (printer) => {
    const id = printer.id || `printer-${Date.now()}`;
    const newPrinter: Printer = {
      ...printer,
      id,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    const backup = get().printers;
    set((state) => ({
      printers: [...(state.printers || []), newPrinter]
    }));
    try {
      await get().savePrintSettingsToSQLite();
    } catch (err: any) {
      set({ printers: backup });
      throw err;
    }
    get().addActivity(`Impressora "${printer.name}" cadastrada`, 'auth', 'Ajustes');
  },

  updatePrinter: async (id, updates) => {
    const backup = get().printers;
    set((state) => ({
      printers: (state.printers || []).map((p) =>
        p.id === id ? { ...p, ...updates, updatedAt: Date.now() } : p
      ),
    }));
    try {
      await get().savePrintSettingsToSQLite();
    } catch (err: any) {
      set({ printers: backup });
      throw err;
    }
    get().addActivity('Impressora atualizada', 'auth', 'Ajustes');
  },

  deletePrinter: async (id) => {
    const backupPrinters = get().printers;
    const backupMappings = get().paperDriverMappings;
    const backupConfigs = get().documentPrintConfigs;
    set((state) => ({
      printers: (state.printers || []).filter((p) => p.id !== id),
      paperDriverMappings: (state.paperDriverMappings || []).filter((m) => m.printerId !== id),
      documentPrintConfigs: (state.documentPrintConfigs || []).map((c) =>
        c.printerId === id ? { ...c, printerId: 'pdf-manual' } : c
      ),
    }));
    try {
      await get().savePrintSettingsToSQLite();
    } catch (err: any) {
      set({
        printers: backupPrinters,
        paperDriverMappings: backupMappings,
        documentPrintConfigs: backupConfigs
      });
      throw err;
    }
    get().addActivity('Impressora removida', 'auth', 'Ajustes');
  },

  addPaperSizeERP: async (paper) => {
    const id = paper.id || `paper-${Date.now()}`;
    const newPaper: PaperSizeERP = {
      ...paper,
      id,
    };
    const backup = get().paperSizesERP;
    set((state) => ({
      paperSizesERP: [...(state.paperSizesERP || []), newPaper]
    }));
    try {
      await get().savePrintSettingsToSQLite();
    } catch (err: any) {
      set({ paperSizesERP: backup });
      throw err;
    }
    get().addActivity(`Papel ERP "${paper.name}" criado`, 'auth', 'Ajustes');
  },

  updatePaperSizeERP: async (id, updates) => {
    const backup = get().paperSizesERP;
    set((state) => ({
      paperSizesERP: (state.paperSizesERP || []).map((p) =>
        p.id === id ? { ...p, ...updates } : p
      ),
    }));
    try {
      await get().savePrintSettingsToSQLite();
    } catch (err: any) {
      set({ paperSizesERP: backup });
      throw err;
    }
  },

  deletePaperSizeERP: async (id) => {
    const backupSizes = get().paperSizesERP;
    const backupMappings = get().paperDriverMappings;
    set((state) => ({
      paperSizesERP: (state.paperSizesERP || []).filter((p) => p.id !== id),
      paperDriverMappings: (state.paperDriverMappings || []).filter((m) => m.paperErpId !== id),
    }));
    try {
      await get().savePrintSettingsToSQLite();
    } catch (err: any) {
      set({
        paperSizesERP: backupSizes,
        paperDriverMappings: backupMappings
      });
      throw err;
    }
    get().addActivity('Papel ERP removido', 'auth', 'Ajustes');
  },

  savePaperDriverMapping: async (mapping) => {
    const id = mapping.id || `${mapping.printerId}_${mapping.paperErpId}`;
    const backup = get().paperDriverMappings;
    set((state) => {
      const existing = (state.paperDriverMappings || []).find((m) => m.id === id);
      const now = Date.now();
      const newMapping: PaperDriverMapping = {
        ...mapping,
        id,
        mediaOrigin: mapping.mediaOrigin || 'manual',
        createdAt: existing ? existing.createdAt : now,
        updatedAt: now,
      };
      const filtered = (state.paperDriverMappings || []).filter((m) => m.id !== id);
      return {
        paperDriverMappings: [...filtered, newMapping]
      };
    });
    try {
      await get().savePrintSettingsToSQLite();
    } catch (err: any) {
      set({ paperDriverMappings: backup });
      throw err;
    }
  },

  deletePaperDriverMapping: async (id) => {
    const backup = get().paperDriverMappings;
    set((state) => ({
      paperDriverMappings: (state.paperDriverMappings || []).filter((m) => m.id !== id),
    }));
    try {
      await get().savePrintSettingsToSQLite();
    } catch (err: any) {
      set({ paperDriverMappings: backup });
      throw err;
    }
    get().addActivity('Mapeamento de papel removido', 'auth', 'Ajustes');
  },

  saveDocumentPrintConfig: async (config) => {
    const backup = get().documentPrintConfigs;
    set((state) => {
      const filtered = (state.documentPrintConfigs || []).filter(
        (c) => c.documentId !== config.documentId
      );
      return {
        documentPrintConfigs: [...filtered, { ...config, updatedAt: Date.now() }],
      };
    });
    try {
      await get().savePrintSettingsToSQLite();
    } catch (err: any) {
      set({ documentPrintConfigs: backup });
      throw err;
    }
    get().addActivity(`Vínculo de "${config.documentName}" atualizado`, 'auth', 'Ajustes');
  },

  addPrintJob: (job) => {
    const state = get();
    const config = (state.documentPrintConfigs || []).find((c) => c.documentId === job.documentId);
    
    let resolvedPrinterId = config?.printerId || job.printerId || 'pdf-manual';
    let resolvedPrinter = resolvedPrinterId === 'pdf-manual' 
      ? undefined 
      : (state.printers || []).find(p => p.id === resolvedPrinterId);

    const isDesktopApp = typeof window !== 'undefined' && !!(
      (window as any).electron ||
      (window as any).electronBridge ||
      (window as any).process?.versions?.electron ||
      navigator.userAgent.toLowerCase().includes('electron')
    );

    // If running in Desktop App and no physical printer is linked to document, auto-route to fallback or system default
    if (isDesktopApp && (!config || !config.printerId || config.printerId === 'pdf-manual' || !resolvedPrinter || !resolvedPrinter.name)) {
      const fallbackPrinter = (state.printers || []).find(p => p.id !== 'pdf-manual');
      if (fallbackPrinter && fallbackPrinter.name) {
        console.warn(`[addPrintJob] No printer configured. Auto-routing to fallback printer "${fallbackPrinter.name}" on Desktop.`);
        resolvedPrinterId = fallbackPrinter.id;
        resolvedPrinter = fallbackPrinter;
      } else {
        const defaultId = 'printer-default';
        const defaultName = 'Impressora Padrão do SO';
        const newPrinter = {
          id: defaultId,
          name: defaultName,
          type: job.documentId.includes('etiqueta') || job.documentId.includes('label') ? 'etiqueta' as const : 'termica' as const,
          origin: 'os' as const,
          status: 'ativa' as const,
          compatibilities: ['thermal_receipt', 'order_ticket', 'customer_experience', 'labels', 'bulk_labels', 'cracha'],
          createdAt: Date.now(),
          updatedAt: Date.now()
        };
        
        set((state) => ({
          printers: [...(state.printers || []), newPrinter]
        }));
        
        resolvedPrinterId = defaultId;
        resolvedPrinter = newPrinter;
        console.warn(`[addPrintJob] No printers in system. Created and auto-routed to "${defaultName}" on Desktop.`);
      }
    }

    // Explicit validation boundary to reject physical jobs without mapped/available printers (Web only now)
    if (!config || !config.printerId || config.printerId === 'pdf-manual' || !resolvedPrinter || !resolvedPrinter.name) {
      console.warn(`[addPrintJob] Validation blocked physical queue insertion. DocumentId: "${job.documentId}", DocName: "${job.documentName}". No active physical printer configuration found. Redirecting to PDF fallback.`);
      
      const errorMsg = "Nenhuma impressora configurada para este documento. PDF gerado automaticamente.";
      alert(errorMsg);

      // Graceful and asynchronous background PDF generation and download flow
      import('./services/pdfEngine/pdfGenerator')
        .then(async ({ generateCanonicalPdfBlob, downloadOrSharePdf }) => {
          try {
            const subTabMap: Record<string, string> = {
              thermal_receipt: 'reciboTermico',
              order_ticket: 'cupomPedido',
              labels: 'etiqueta',
              bulk_labels: 'etiquetaLote',
              customer_experience: 'mensagemCliente',
              cracha: 'cracha'
            };
            const canonicalDocType = subTabMap[job.documentId] || 'reciboTermico';
            const blob = await generateCanonicalPdfBlob(
              canonicalDocType,
              job.payload || {},
              config?.paperErpId || job.paperErpId || '80mm',
              {
                orientation: config?.orientation || job.orientation || 'portrait',
                marginMm: config?.marginMm ?? job.marginMm ?? 0,
                scale: config?.scale || job.scale || 1.0,
                safeMode: config?.safeModeActive || job.safeMode || false,
                isExportPdf: true
              }
            );
            await downloadOrSharePdf(blob, (job.documentName || 'documento').toLowerCase().replace(/\s+/g, '_'));
          } catch (e) {
            console.error('[addPrintJob Fallback PDF] Error generating or downloading fallback PDF:', e);
          }
        })
        .catch((err) => {
          console.error('[addPrintJob Fallback PDF] Failed to lazily import pdfGenerator:', err);
        });

      throw new Error(errorMsg);
    }

    const resolvedPrinterName = resolvedPrinter.name;
    const resolvedPaperErpId = config?.paperErpId || job.paperErpId || 'A6';
    const resolvedDriverPaperName = config?.driverPaperName || job.driverPaperName || resolvedPaperErpId;
    const resolvedOrientation = config?.orientation || job.orientation || 'portrait';
    const resolvedScale = config?.scale || job.scale || 1.0;
    const resolvedMarginMm = config?.marginMm ?? config?.margin ?? job.marginMm ?? 0;
    const resolvedSafeMode = config?.safeModeActive || job.safeMode || false;

    const mediaType = config?.mediaType || config?.selectedDriverMediaName || '';
    const printQuality = config?.printQuality || '';
    
    // Copy Advanced Windows Driver Integration Parameters
    const printPipeline = config?.printPipeline || 'electron';
    const copies = config?.copies || 1;
    const dpi = config?.dpi || '';
    const paperSource = config?.paperSource || '';
    const colorMode = config?.colorMode || 'color';
    const duplexMode = config?.duplexMode || 'simplex';
    const advancedModeEnabled = config?.advancedModeEnabled || false;

    const id = job.id || `print-job-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
    const newJob: PrintJob = {
      ...job,
      id,
      printerId: resolvedPrinterId,
      printerName: resolvedPrinterName,
      paperErpId: resolvedPaperErpId,
      driverPaperName: resolvedDriverPaperName,
      orientation: resolvedOrientation,
      marginMm: resolvedMarginMm,
      scale: resolvedScale,
      safeMode: resolvedSafeMode,
      mediaType,
      printQuality,
      printPipeline,
      copies,
      dpi,
      paperSource,
      colorMode,
      duplexMode,
      advancedModeEnabled,
      createdAt: Date.now(),
      status: 'aguardando',
    } as any;

    set((state) => ({
      printQueue: [...(state.printQueue || []), newJob]
    }));
    return id;
  },

  updatePrintJobStatus: (id, status, errorMessage) => {
    set((state) => ({
      printQueue: (state.printQueue || []).map((j) =>
        j.id === id ? { ...j, status, errorMessage } : j
      ),
    }));
  },

  updatePrintJobPdfUrl: (id, pdfUrl) => {
    set((state) => ({
      printQueue: (state.printQueue || []).map((j) =>
        j.id === id ? { ...j, pdfUrl } : j
      ),
    }));
  },

  removePrintJob: (id) => {
    set((state) => ({
      printQueue: (state.printQueue || []).filter((j) => j.id !== id),
    }));
  },

  clearPrintQueue: () => {
     set({ printQueue: [] });
  },

  updateUserImage: (userId: string, image: string) => {
    set((state) => ({
      users: state.users.map(u => u.id === userId ? { ...u, image } : u)
    }));
    const user = get().currentUser;
    const userName = user ? user.fullName : 'Sistema';
    get().addActivity(`Foto do usuário atualizada`, 'auth', 'Ajustes', userName, userId);
  },

  exportData: async () => {
    const state = get();
    const backup: any = {};
    
    // Filter out functions and sensitive/session fields
    const sessionFields = ['currentUser', 'isAuthenticated', 'isSettingsOpen', 'activeSettingModule'];
    
    Object.keys(state).forEach(key => {
      if (typeof (state as any)[key] !== 'function' && !sessionFields.includes(key)) {
        backup[key] = (state as any)[key];
      }
    });

    set({ lastBackupAt: Date.now() });

    return JSON.stringify({
      version: '1.2.0',
      timestamp: Date.now(),
      data: backup
    }, null, 2);
  },

  importData: async (importObj: any) => {
    try {
      if (!importObj || !importObj.data) {
        return { success: false, error: 'Arquivo de backup inválido ou corrompido.' };
      }

      let backupData = importObj.data;
      if (importObj.isEncrypted && typeof backupData === 'string') {
        try {
          backupData = await DataProtectionService.decryptIfNeeded(importObj);
        } catch (decErr: any) {
          return { success: false, error: decErr.message || 'Falha ao descriptografar dados do backup.' };
        }
      } else if (!importObj.isEncrypted) {
        console.warn('Backup antigo sem criptografia detectado. Restaurando no modo compatibilidade.');
      }
      
      // Basic validation of required fields to ensure it's a valid backup
      const requiredFields = ['products', 'clients', 'users', 'company'];
      const missingFields = requiredFields.filter(field => !backupData[field]);
      
      if (missingFields.length > 0) {
        return { success: false, error: `Backup incompatível. Campos ausentes: ${missingFields.join(', ')}` };
      }

      // Merge backup data with default state to ensure property existence
      set((state) => ({
        ...state,
        ...INITIAL_APP_DATA,
        ...backupData,
        _skipSyncEnrichment: true,
        // Ensure some UI state doesn't get messed up
        isSettingsOpen: false,
        activeSettingModule: null,
        isAuthenticated: false, // Force re-login for security after restoration
        currentUser: null
      }));

      get().addActivity('Backup restaurado com sucesso', 'auth', 'Sistema');
      get().logAction({ 
        module: 'Sistema', 
        actionType: 'other', 
        description: 'Restauração de sistema realizada via backup', 
        status: 'sucesso' 
      });

      return { success: true };
    } catch (error) {
      console.error('Error importing backup:', error);
      return { success: false, error: 'Erro ao processar o arquivo de backup.' };
    }
  },

  setGoogleDriveBackupEnabled: (enabled: boolean) => {
    set({ googleDriveBackupEnabled: enabled });
  },

  setGoogleDriveLastSyncAt: (timestamp: number | null) => {
    set({ googleDriveLastSyncAt: timestamp });
  },

  setSyncStatus: (status: 'idle' | 'syncing' | 'synced' | 'error' | 'conflict') => {
    set({ syncStatus: status });
  },

  updateLastSyncAt: (timestamp: number) => {
    set({ lastSyncAt: timestamp });
  },

  clearPendingSyncQueue: (upToTimestamp?: number) => {
    const isDesktop = typeof window !== 'undefined' && !!(window as any).electron;
    const electronAPI = isDesktop ? (window as any).electron : null;

    set((state) => {
      const filtered = upToTimestamp
        ? state.pendingSyncQueue.filter((q) => q.timestamp > upToTimestamp)
        : [];
      
      if (isDesktop && electronAPI && electronAPI.db) {
        if (!upToTimestamp) {
          state.pendingSyncQueue.forEach(item => {
            const id = (item as any).id || `${item.entity}_${item.recordId}`;
            electronAPI.db.deleteSyncQueueItem(id).catch((err: any) => console.error('[SQLite] deleteSyncQueueItem error:', err));
          });
        } else {
          const toDelete = state.pendingSyncQueue.filter(q => q.timestamp <= upToTimestamp);
          toDelete.forEach(item => {
            const id = (item as any).id || `${item.entity}_${item.recordId}`;
            electronAPI.db.deleteSyncQueueItem(id).catch((err: any) => console.error('[SQLite] deleteSyncQueueItem error:', err));
          });
        }
      }
      return { pendingSyncQueue: filtered };
    });
  },

  pushSyncMutation: (entity: string, recordId: string, operation: 'u' | 'd', data?: any) => {
    set((state) => {
      let enrichedData = data;
      if (operation === 'u' && data && typeof data === 'object') {
        const deviceId = localStorage.getItem('local_sync_device_id') || 'PC_PRINCIPAL';
        const updatedBy = state.currentUser?.fullName || state.currentUser?.login || 'Operador Central';
        const currentVersion = data.syncVersion || 0;
        
        enrichedData = {
          ...data,
          lastUpdated: data.lastUpdated || Date.now(),
          deviceId: data.deviceId || deviceId,
          updatedBy: data.updatedBy || updatedBy,
          syncVersion: currentVersion + 1
        };
      }
      
      const filteredQueue = state.pendingSyncQueue.filter(
        (q) => !(q.entity === entity && q.recordId === recordId)
      );
      
      const newMutation = {
        entity,
        recordId,
        operation,
        data: enrichedData,
        timestamp: Date.now()
      };
      
      const nextQueue = [...filteredQueue, newMutation];

      const isDesktop = typeof window !== 'undefined' && !!(window as any).electron;
      const electronAPI = isDesktop ? (window as any).electron : null;
      if (isDesktop && electronAPI && electronAPI.db) {
        electronAPI.db.insertSyncQueueItem(newMutation).catch((err: any) => {
          console.error('[SQLite] insertSyncQueueItem error in pushSyncMutation:', err);
        });
      }

      const sliceUpdates: any = {};
      const currentList = (state as any)[entity];
      
      if (Array.isArray(currentList)) {
        if (operation === 'u') {
          const index = currentList.findIndex((item) => item.id === recordId);
          if (index !== -1) {
            const updatedList = [...currentList];
            updatedList[index] = { ...updatedList[index], ...enrichedData };
            sliceUpdates[entity] = updatedList;
          } else {
            sliceUpdates[entity] = [...currentList, enrichedData];
          }
        } else if (operation === 'd') {
          sliceUpdates[entity] = currentList.filter((item) => item.id !== recordId);
        }
      }
      
      setTimeout(() => {
        window.dispatchEvent(new CustomEvent('sync_immediate_trigger'));
      }, 100);

      return {
        ...sliceUpdates,
        pendingSyncQueue: nextQueue
      };
    });
  },

  applyIncomingSyncChanges: (changes: { [entity: string]: any[] }) => {
    set((state) => {
      const sliceUpdates: any = { _skipSyncEnrichment: true };
      let conflictDetected = false;
      
      const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;
      
      // 1. Gather and merge local tombstones
      const localTombstones = state.tombstones || [];
      const updatedTombstonesMap = new Map<string, Tombstone>();
      
      // Load current local tombstones into map, filtering out expired ones (> 30 days)
      localTombstones.forEach(t => {
        const time = t.lastUpdated || (t.deletedAt ? new Date(t.deletedAt).getTime() : 0);
        if (time > thirtyDaysAgo) {
          updatedTombstonesMap.set(`${t.entityType}_${t.entityId}`, t);
        }
      });
      
      // Process incoming tombstones first if present to sync them
      if (Array.isArray(changes.tombstones)) {
        for (const remoteT of changes.tombstones) {
          if (!remoteT || !remoteT.entityId) continue;
          const key = `${remoteT.entityType}_${remoteT.entityId}`;
          const localT = updatedTombstonesMap.get(key);
          
          if (!localT) {
            updatedTombstonesMap.set(key, remoteT);
          } else {
            const localVersion = localT.syncVersion || 1;
            const remoteVersion = remoteT.syncVersion || 1;
            
            if (remoteVersion > localVersion) {
              updatedTombstonesMap.set(key, remoteT);
            } else if (remoteVersion < localVersion) {
              // Local has higher version, keep local
            } else {
              const localTime = localT.lastUpdated || (localT.deletedAt ? new Date(localT.deletedAt).getTime() : 0);
              const remoteTime = remoteT.lastUpdated || (remoteT.deletedAt ? new Date(remoteT.deletedAt).getTime() : 0);
              if (remoteTime > localTime) {
                updatedTombstonesMap.set(key, remoteT);
              }
            }
          }
        }
      }
      
      // Save merged tombstones
      const finalTombstonesList = Array.from(updatedTombstonesMap.values());
      sliceUpdates.tombstones = finalTombstonesList;
      
      // 2. Map of active tombstones for quick check during merging
      const tombstoneMap = updatedTombstonesMap;
      
      // 3. Process each entity
      for (const [entity, incomingRecords] of Object.entries(changes)) {
        if (!Array.isArray(incomingRecords)) continue;
        if (entity === 'tombstones') continue; // Handled separately above
        
        const currentList = (state as any)[entity];
        if (!Array.isArray(currentList)) continue;
        
        const updatedList = [...currentList];
        
        for (const incoming of incomingRecords) {
          if (!incoming || !incoming.id) continue;
          
          // Check for active tombstones
          const tombstone = tombstoneMap.get(`${entity}_${incoming.id}`);
          if (tombstone) {
            const incomingVersion = incoming.syncVersion || 1;
            const tombstoneVersion = tombstone.syncVersion || 1;
            
            let tombstoneWins = false;
            if (tombstoneVersion > incomingVersion) {
              tombstoneWins = true;
            } else if (tombstoneVersion < incomingVersion) {
              tombstoneWins = false;
            } else {
              const incomingTime = incoming.lastUpdated || 0;
              const tombstoneTime = tombstone.lastUpdated || (tombstone.deletedAt ? new Date(tombstone.deletedAt).getTime() : 0);
              tombstoneWins = tombstoneTime >= incomingTime;
            }
            
            if (tombstoneWins) {
              // Remote record is older/smaller version than tombstone, skip resurrecting
              continue;
            } else {
              // Remote record is newer than the tombstone - resurrection/recreation occurred
              tombstoneMap.delete(`${entity}_${incoming.id}`);
            }
          }
          
          const index = updatedList.findIndex((itemObj) => itemObj.id === incoming.id);
          
          // Handle remote deletion markers
          if (incoming._isDeleted) {
            if (index !== -1) {
              updatedList.splice(index, 1);
            }
            
            // Add remote deletion as tombstone
            const incomingTime = incoming.lastUpdated || Date.now();
            tombstoneMap.set(`${entity}_${incoming.id}`, {
              id: generateUUID(),
              entityType: entity,
              entityId: incoming.id,
              deletedAt: new Date(incomingTime).toISOString(),
              deletedBy: incoming.updatedBy || 'Sincronização Remota',
              deviceId: incoming.deviceId || 'REMOTO',
              syncVersion: incoming.syncVersion || 1,
              lastUpdated: incomingTime
            });
            continue;
          }
          
          if (index !== -1) {
            const existing = updatedList[index];
            const incomingTime = incoming.lastUpdated || 0;
            const existingTime = existing.lastUpdated || 0;
            
            const incomingVersion = incoming.syncVersion || 1;
            const existingVersion = existing.syncVersion || 1;
            
            const incomingDevice = incoming.deviceId || '';
            const existingDevice = existing.deviceId || '';
            
            let applyRemote = false;
            
            if (incomingVersion > existingVersion) {
              applyRemote = true;
            } else if (incomingVersion < existingVersion) {
              applyRemote = false;
            } else {
              // Same version - fall back to timestamp / LWW
              const timeDiff = Math.abs(incomingTime - existingTime);
              const IS_SUSPICIOUS = timeDiff < 2000;
              const FUTURE_DRIFT = incomingTime - Date.now() > 5 * 60 * 1000;
              
              if (IS_SUSPICIOUS) {
                console.warn(`[SyncService] Suspicious collision detected for ${entity}:${incoming.id}! Device: ${existingDevice} vs ${incomingDevice}`);
                conflictDetected = true;
                applyRemote = incomingTime > existingTime;
              } else if (FUTURE_DRIFT) {
                console.warn(`[SyncService] Clock drift! Future timestamp for ${entity}:${incoming.id}`);
                conflictDetected = true;
                applyRemote = false;
              } else {
                if (incomingTime > existingTime) {
                  applyRemote = true;
                } else if (incomingTime < existingTime) {
                  conflictDetected = true;
                  applyRemote = false;
                } else {
                  applyRemote = true;
                }
              }
            }
            
            if (applyRemote) {
              if (incomingVersion === existingVersion) {
                updatedList[index] = { ...existing, ...incoming };
              } else {
                updatedList[index] = incoming;
              }
            }
          } else {
            updatedList.push(incoming);
          }
        }
        
        // Filter out any tombstoned items
        sliceUpdates[entity] = updatedList.filter(item => {
          if (!item || !item.id) return false;
          
          const hasT = tombstoneMap.get(`${entity}_${item.id}`);
          if (hasT) {
            if (entity === 'products') {
              item.deleted = true;
              item.active = false;
              return true;
            }
            return false;
          }
          return true;
        });
      }
      
      // Update tombstones list again in case new ones were added via remote deletes
      sliceUpdates.tombstones = Array.from(tombstoneMap.values());
      
      const isDesktop = typeof window !== 'undefined' && !!(window as any).electron;
      const electronAPI = isDesktop ? (window as any).electron : null;
      if (isDesktop && electronAPI && electronAPI.db && Array.isArray(sliceUpdates.tombstones)) {
        sliceUpdates.tombstones.forEach(t => {
          electronAPI.db.insertTombstone(t).catch((err: any) => {
            console.error('[SQLite] insertTombstone error in applyIncomingSyncChanges:', err);
          });
        });
      }

      if (conflictDetected) {
        setTimeout(() => {
          set({ syncStatus: 'conflict' });
        }, 10);
      }
      
      return sliceUpdates;
    });
  },

  resetData: async (keepSettings = true) => {
    const currentState = get();
    try {
      console.log('[Store] Executando snapshot preventivo de segurança pré-reset...');
      const rawString = await currentState.exportData();
      const parsed = JSON.parse(rawString);
      await DataProtectionService.createSnapshot(
        parsed.data,
        parsed.version || '1.2.1',
        'auto',
        `Snapshot Preventivo Pré-Reset (${keepSettings ? 'Preservar Cores/Empresa/Setups' : 'Reset Completo/Geral'})`
      );
    } catch (err) {
      console.warn('[Store] Falha ao gerar snapshot pré-reset de segurança:', err);
    }
    
    if (keepSettings) {
      set({
        ...INITIAL_APP_DATA,
        company: currentState.company,
        receiptConfig: currentState.receiptConfig,
        orderTicketConfig: currentState.orderTicketConfig,
        labelConfig: currentState.labelConfig,
        labelBatchConfig: currentState.labelBatchConfig,
        badgeConfig: currentState.badgeConfig,
        customerExperienceConfig: currentState.customerExperienceConfig,
        users: currentState.users,
        userRoles: currentState.userRoles,
        masterPassword: currentState.masterPassword,
        masterAuthorizations: currentState.masterAuthorizations || [],
        masterBadges: currentState.masterBadges || [],
        badges: currentState.badges || [],
        nfcTags: currentState.nfcTags || [],
        terminals: (currentState.terminals || INITIAL_APP_DATA.terminals).map(t => ({
          ...t,
          operadorAtualId: null,
          operadorAtualName: null,
          ultimoOperadorId: null,
          ultimoOperadorName: null,
          modoBloqueado: false
        }))
      });
    } else {
      // Complete reset - including settings
      set({
        ...INITIAL_APP_DATA,
        company: {
          name: 'Lukasfe Industrial Ltda',
          document: '00.000.000/0001-00',
          email: 'contato@lukasfe.com.br',
          website: 'www.lukasfe.com.br',
          phone: '(11) 4002-8922',
          slogan: 'Tecnologia Avançada e Soluções Industriais',
          pixKey: '00000000000100',
          pixKeyType: 'cnpj',
          pixReceiverName: 'Lukasfe Industrial Ltda',
          address: {
            zip: '01001-000',
            street: 'Praça da Sé',
            number: '100',
            complement: '',
            neighborhood: 'Sé',
            city: 'São Paulo',
            state: 'SP'
          }
        },
        users: [
          {
            id: 'admin',
            fullName: 'Administrador Nexa',
            login: 'admin',
            matricula: 'admin',
            password: '1234',
            roleId: 'administrador',
            status: 'ativo',
            isAdmin: true,
            isOwner: true,
            isMasterAdmin: true,
            qrCodeToken: 'admin-initial-token'
          }
        ],
        userRoles: currentState.userRoles || [],
        currentUser: null,
        masterPassword: '',
        masterAuthorizations: [],
        masterBadges: []
      });
    }

    get().addActivity('Sistema zerado/limpo', 'auth', 'Sistema');
    get().logAction({ 
      module: 'Sistema', 
      actionType: 'other', 
      description: 'Sistema limpo (Zerar Sistema)', 
      status: 'sucesso' 
    });
  }
      };
    },
    {
      name: environmentService.isTestEnvironment() ? 'erp-industrial-storage-teste' : 'erp-industrial-storage',
      version: 4, // Bumped version for Custom Paper Migration
      storage: createJSONStorage(() => {
        const isDesktop = typeof window !== 'undefined' && (!!(window as any).electron || navigator.userAgent.toLowerCase().includes('electron'));
        return isDesktop ? memoryStorage : idbStorage;
      }),
      migrate: (persistedState: any, version: number) => {
        if (persistedState) {
          if (persistedState.receiptConfig && (persistedState.receiptConfig.paperSize === 'custom' || persistedState.receiptConfig.paperSize === '50x80' || persistedState.receiptConfig.paperSize === '58x80')) {
            persistedState.receiptConfig.paperSize = '80mm';
          }
          if (persistedState.customerExperienceConfig && (persistedState.customerExperienceConfig.paperSize === 'custom' || persistedState.customerExperienceConfig.paperSize === '50x80' || persistedState.customerExperienceConfig.paperSize === '58x80')) {
            persistedState.customerExperienceConfig.paperSize = '80mm';
          }
          if (persistedState.orderTicketConfig && (persistedState.orderTicketConfig.paperSize === 'custom' || persistedState.orderTicketConfig.paperSize === '50x80' || persistedState.orderTicketConfig.paperSize === '58x80')) {
            persistedState.orderTicketConfig.paperSize = '80mm';
          }
          if (persistedState.labelConfig && (persistedState.labelConfig.paperSize === 'custom' || persistedState.labelConfig.paperSize === '50x80' || persistedState.labelConfig.paperSize === '58x80')) {
            persistedState.labelConfig.paperSize = 'A4';
          }
          if (persistedState.badgeConfig && (persistedState.badgeConfig.paperSize === 'custom' || persistedState.badgeConfig.paperSize === '50x80' || persistedState.badgeConfig.paperSize === '58x80')) {
            persistedState.badgeConfig.paperSize = 'A4';
          }
          if (!persistedState.catalogConfig) {
            persistedState.catalogConfig = {
              storeName: 'Nossa Vitrine',
              storeDescription: 'Confira os nossos produtos disponíveis no catálogo online e faça seu pedido direto pelo WhatsApp!',
              logoUrl: '',
              bannerUrl: '',
              whatsappNumber: '5511999999999',
              whatsappMessageTemplate: 'Olá! Tenho interesse no produto:\n[PRODUTO] - SKU [SKU]\nPreço: [PRECO]',
              themeColor: 'emerald',
              themeMode: 'light',
              showPrices: true,
              hideOutOfStock: false,
              autoUnpublishOnZeroStock: false
            };
          }
          if (!persistedState.nfcTags) {
            persistedState.nfcTags = [];
          }
          if (!persistedState.nfcPresenceRecords) {
            persistedState.nfcPresenceRecords = [];
          }
          if (!persistedState.navigationHistory) {
            persistedState.navigationHistory = [];
          }
        }
        return persistedState;
      },
      onRehydrateStorage: () => {
        bootTracker.trackStep('STORAGE_INIT_START');
        return (state, error) => {
          bootTracker.trackStep('STORAGE_INIT_DONE');
          bootTracker.trackStep('DATABASE_LOAD_START');
          if (error) {
            console.error('[STORAGE] Error on rehydrate:', error);
            if (state) {
              state.setDatabaseStatus('error');
            }
          }
          if (state) {
            state.setDatabaseStatus('initializing');
            if (!state.imageThemes || state.imageThemes.length === 0) {
              state.imageThemes = DEFAULT_BG_STATIONS;
            }
            const users = state.users || [];
          let changed = false;

          // Find all administrators
          const adminUsers = users.filter(u => 
            u.id === 'admin' || 
            u.isMasterAdmin === true || 
            u.isOwner === true || 
            (u.login && (u.login.toUpperCase() === 'ADM' || u.login === 'admin'))
          );

          let finalUsersList = [...users];

          if (adminUsers.length > 0) {
            let primaryAdmin = adminUsers.find(u => u.id === 'admin') || adminUsers[0];
            if (primaryAdmin.id !== 'admin') {
              primaryAdmin = { ...primaryAdmin, id: 'admin' };
              changed = true;
            }

            // Merge properties from other duplicate admins
            const duplicateAdminIds: string[] = [];
            adminUsers.forEach(u => {
              if (u.id === primaryAdmin.id) return;
              duplicateAdminIds.push(u.id);
              changed = true;

              if (u.fullName && u.fullName !== 'Administrador Nexa' && primaryAdmin.fullName === 'Administrador Nexa') {
                primaryAdmin.fullName = u.fullName;
              }
              if (u.password && u.password !== '1234' && primaryAdmin.password === '1234') {
                primaryAdmin.password = u.password;
              }
              if (u.image && !primaryAdmin.image) {
                primaryAdmin.image = u.image;
              }
              if (u.primaryFunction && !primaryAdmin.primaryFunction) {
                primaryAdmin.primaryFunction = u.primaryFunction;
              }
              if (u.loja && !primaryAdmin.loja) {
                primaryAdmin.loja = u.loja;
              }
              if (u.setor && !primaryAdmin.setor) {
                primaryAdmin.setor = u.setor;
              }
              if (u.qrCodeToken && u.qrCodeToken !== 'admin-initial-token' && primaryAdmin.qrCodeToken === 'admin-initial-token') {
                primaryAdmin.qrCodeToken = u.qrCodeToken;
              }
              if (u.badgeId && !primaryAdmin.badgeId) {
                primaryAdmin.badgeId = u.badgeId;
              }
            });

            // Ensure master admin properties are secure and strictly formatted
            if (primaryAdmin.login === 'ADM' || !primaryAdmin.login) {
              primaryAdmin.login = 'admin';
              changed = true;
            }
            if (primaryAdmin.matricula === 'ADM' || !primaryAdmin.matricula) {
              primaryAdmin.matricula = 'admin';
              changed = true;
            }

            primaryAdmin.isAdmin = true;
            primaryAdmin.isOwner = true;
            primaryAdmin.isMasterAdmin = true;
            primaryAdmin.status = 'ativo' as const;

            // Filter out all duplicate admin users from the other users list
            let otherUsers = users.filter(u => !adminUsers.some(au => au.id === u.id));

            // Generate unique matriculas for other users
            const existingMatriculas = new Set<string>();
            existingMatriculas.add(primaryAdmin.matricula || 'admin');
            otherUsers.forEach(u => {
              if (u.matricula) {
                existingMatriculas.add(u.matricula);
              } else if (/^\d{8}$/.test(u.login)) {
                existingMatriculas.add(u.login);
              }
            });

            const generateUniqueMatricula = () => {
              while (true) {
                const generated = Math.floor(10000000 + Math.random() * 90000000).toString();
                if (!existingMatriculas.has(generated)) {
                  existingMatriculas.add(generated);
                  return generated;
                }
              }
            };

            const sanitizedOtherUsers = otherUsers.map(u => {
              if (!u.matricula) {
                const newMatricula = /^\d{8}$/.test(u.login) ? u.login : generateUniqueMatricula();
                changed = true;
                return {
                  ...u,
                  matricula: newMatricula,
                  login: newMatricula
                };
              }
              if (u.login !== u.matricula) {
                changed = true;
                return {
                  ...u,
                  login: u.matricula
                };
              }
              return u;
            });

            finalUsersList = [primaryAdmin, ...sanitizedOtherUsers];

            // Resolve references in other collections for the merged duplicates
            if (duplicateAdminIds.length > 0) {
              // Merge referencing badges
              if (state.badges) {
                state.badges = state.badges.map(b => {
                  if (b.usuarioVinculado && duplicateAdminIds.includes(b.usuarioVinculado)) {
                    return { ...b, usuarioVinculado: 'admin' };
                  }
                  return b;
                });
              }

              // Merge referencing sales
              if (state.sales) {
                state.sales = state.sales.map(s => {
                  let updated = false;
                  const newSale = { ...s };
                  if (s.pickerId && duplicateAdminIds.includes(s.pickerId)) {
                    newSale.pickerId = 'admin';
                    updated = true;
                  }
                  if (s.missingItemsAuthorizedBy && duplicateAdminIds.includes(s.missingItemsAuthorizedBy)) {
                    newSale.missingItemsAuthorizedBy = 'admin';
                    updated = true;
                  }
                  if (s.deliveryAddedBy && duplicateAdminIds.includes(s.deliveryAddedBy)) {
                    newSale.deliveryAddedBy = 'admin';
                    updated = true;
                  }
                  return updated ? newSale : s;
                });
              }

              // Merge referencing auditLogs
              if (state.auditLogs) {
                state.auditLogs = state.auditLogs.map(log => {
                  if (log.userId && duplicateAdminIds.includes(log.userId)) {
                    return { ...log, userId: 'admin', userLogin: primaryAdmin.login || 'admin' };
                  }
                  return log;
                });
              }
            }
          }

          if (changed) {
            state.users = finalUsersList;
          }

          // Bypass-safe automatic detection for firstAccessSetupComplete
          if (state) {
            const users = state.users || [];
            const adminUsers = users.filter(u => 
              u.id === 'admin' || 
              u.isMasterAdmin === true || 
              u.isOwner === true || 
              (u.login && (u.login.toUpperCase() === 'ADM' || u.login === 'admin'))
            );
            const hasCustomAdminPassword = adminUsers.some(u => u.password && u.password !== '1234');
            const hasOtherUsers = users.some(u => u.id !== 'admin');
            const hasSalesOrProducts = (state.sales && state.sales.length > 0) || (state.products && state.products.length > 0);
            
            if ((hasCustomAdminPassword || hasOtherUsers || hasSalesOrProducts) && !state.firstAccessSetupComplete) {
              console.log('[AUTO-RESOLVER] State persistence verified - previous setup data detected. Enforcing firstAccessSetupComplete = true.');
              state.firstAccessSetupComplete = true;
            }
          }

          const isDesktop = typeof window !== 'undefined' && (!!(window as any).electron || navigator.userAgent.toLowerCase().includes('electron'));

          const getElectronAPIWithRetry = async (maxRetries = 100, delayMs = 100): Promise<any> => {
            console.log(`[SQLite/Boot] Iniciando getElectronAPIWithRetry com maxRetries=${maxRetries}, delayMs=${delayMs}...`);
            const isSecondaryWindow = typeof window !== 'undefined' && (
              window.location.hash.includes('kiosk') || 
              window.location.hash.includes('customer-display') || 
              window.location.pathname.includes('kiosk') || 
              window.location.pathname.includes('customer-display')
            );
            
            for (let i = 0; i < maxRetries; i++) {
              if (typeof window !== 'undefined') {
                const win = window as any;
                const hasElectron = !!win.electron;
                const hasDb = !!(win.electron && win.electron.db);
                if (hasDb) {
                  console.info(`[SQLite/Boot] API de banco do Electron detectada com sucesso na tentativa ${i + 1}.`);
                  return win.electron;
                }
                if (i % 10 === 0 || i === maxRetries - 1) {
                  console.warn(`[SQLite/Boot] Tentativa ${i + 1}/${maxRetries} de carregar Electron API. Estado atual - window.electron: ${hasElectron}, window.electron.db: ${hasDb} (Janela Secundária: ${isSecondaryWindow})`);
                }
              }
              await new Promise(resolve => setTimeout(resolve, delayMs));
            }
            if (typeof window !== 'undefined') {
              const win = window as any;
              const hasElectron = !!win.electron;
              const hasDb = !!(win.electron && win.electron.db);
              console.error(`[SQLite/Boot] Falha final ao carregar a API do banco do Electron após ${maxRetries} tentativas. Contexto final - window.electron: ${hasElectron}, window.electron.db: ${hasDb} (Janela Secundária: ${isSecondaryWindow})`);
              return win.electron || null;
            }
            return null;
          };

          const finishInitialization = (currentState: any) => {
            currentState.setDatabaseStatus('ready');
            currentState.setHasHydrated(true);
            bootTracker.trackStep('DATABASE_LOAD_DONE');

            // Performance Diagnostics Logging
            perfLogger.end('Tempo de Carregamento dos Dados Locais');
            perfLogger.end('Tempo Total de Boot');
            
            perfLogger.logDataLoaded('products', currentState.products?.length || 0);
            perfLogger.logDataLoaded('clients', currentState.clients?.length || 0);
            perfLogger.logDataLoaded('sales', currentState.sales?.length || 0);
            perfLogger.logDataLoaded('users', currentState.users?.length || 0);
            perfLogger.logDataLoaded('auditLogs', currentState.auditLogs?.length || 0);
            perfLogger.logDataLoaded('cashierHistory', currentState.cashierHistory?.length || 0);
            perfLogger.logDataLoaded('financialTransactions', currentState.financialTransactions?.length || 0);
            perfLogger.logDataLoaded('pendingSyncQueue', currentState.pendingSyncQueue?.length || 0);
            perfLogger.logDataLoaded('tombstones', currentState.tombstones?.length || 0);
            perfLogger.logDataLoaded('productions', currentState.productions?.length || 0);
            perfLogger.logDataLoaded('productionRuns', currentState.productionRuns?.length || 0);
            perfLogger.logDataLoaded('materials', currentState.materials?.length || 0);
            perfLogger.logDataLoaded('machines', currentState.machines?.length || 0);
            perfLogger.logDataLoaded('returns', currentState.returns?.length || 0);
            perfLogger.logDataLoaded('consignments', currentState.consignmentRemittances?.length || 0);
          };

          const initializePersistence = async () => {
            let electronAPI = null;
            if (isDesktop) {
              console.info('[SQLite/Boot] Ambiente Desktop detectado. Aguardando preload/electronAPI...');
              electronAPI = await getElectronAPIWithRetry();
            }
            const useSQLite = isDesktop && electronAPI && electronAPI.db;

            const isSecondaryWindow = typeof window !== 'undefined' && (
              window.location.hash.includes('kiosk') || 
              window.location.hash.includes('customer-display') || 
              window.location.pathname.includes('kiosk') || 
              window.location.pathname.includes('customer-display')
            );

            if (useSQLite) {
              try {
                let hasLoadError = false;
                const safeList = async (listPromise: Promise<any>, fieldName: string) => {
                  try {
                    const res = await listPromise;
                    if (res === null || res === undefined || !Array.isArray(res)) {
                      throw new Error(`Retorno inválido para lista ${fieldName}`);
                    }
                    return res;
                  } catch (err: any) {
                    console.error(`[SQLite-AUDIT] Erro crítico lendo tabela '${fieldName}' do SQLite:`, err.message || err);
                    hasLoadError = true;
                    return null;
                  }
                };

                if (isSecondaryWindow) {
                  console.info('[SQLite/Boot] Carregando persistência LEVE para janela secundária (Totem/Kiosk/Display)...');
                  const [
                    prods, clis, cats, subs, salesList,
                    usersList, permissionsList, companySettingsList, systemSettingsList, pdvSettingsList, pdvTotemSettingsList, kioskTerminalsList
                  ] = await Promise.all([
                    safeList(electronAPI.db.listProducts(), 'products'),
                    safeList(electronAPI.db.listClients(), 'clients'),
                    safeList(electronAPI.db.listCategories(), 'categories'),
                    safeList(electronAPI.db.listSubcategories(), 'subcategories'),
                    safeList(electronAPI.db.listSales(), 'sales'),
                    safeList(electronAPI.db.listUsers(), 'users'),
                    safeList(electronAPI.db.listPermissions(), 'permissions'),
                    safeList(electronAPI.db.listCompanySettings(), 'companySettings'),
                    safeList(electronAPI.db.listSystemSettings(), 'systemSettings'),
                    safeList(electronAPI.db.listPdvSettings(), 'pdvSettings'),
                    safeList(electronAPI.db.listPdvTotemSettings(), 'pdvTotemSettings'),
                    safeList(electronAPI.db.listKioskTerminals(), 'kioskTerminals')
                  ]);

                  const updates: any = {
                    products: prods || [],
                    clients: clis || [],
                    categories: cats || [],
                    subcategories: subs || [],
                    sales: salesList || [],
                    users: usersList || [],
                    userRoles: permissionsList || [],
                    terminals: kioskTerminalsList || [],
                    activities: [],
                    auditLogs: [],
                    nfcPresenceRecords: [],
                    preOrders: [],
                    cashierHistory: [],
                    financialTransactions: [],
                    pendingSyncQueue: [],
                    tombstones: [],
                    productions: [],
                    productionRuns: [],
                    materials: [],
                    machines: [],
                    returns: [],
                    consignmentRemittances: [],
                    sqliteMigrationSafe: true,
                    sqliteStatus: 'ready'
                  };

                  if (Array.isArray(companySettingsList) && companySettingsList.length > 0) {
                    const companyDoc = companySettingsList.find((c: any) => c.id === 'company_info');
                    if (companyDoc) {
                      updates.company = companyDoc;
                    }
                  } else if (state.company) {
                    updates.company = state.company;
                  }

                  if (Array.isArray(systemSettingsList) && systemSettingsList.length > 0) {
                    const activePdvTotemConfig = systemSettingsList.find((s: any) => s.id === 'pdv_totem_settings_active');
                    if (activePdvTotemConfig) {
                      updates.activeTerminalId = activePdvTotemConfig.activeTerminalId || null;
                    }
                  }

                  if (Array.isArray(pdvSettingsList) && pdvSettingsList.length > 0) {
                    const pdvConfig = pdvSettingsList.find((p: any) => p.id === 'pdv_main_settings');
                    if (pdvConfig && pdvConfig.activeTerminalId !== undefined) {
                      updates.activeTerminalId = pdvConfig.activeTerminalId;
                    }
                  }

                  state.setSQLiteData(updates);
                  console.info('[SQLite/Boot] Hidratação LEVE concluída para janela secundária (Totem/Kiosk/Display) com sucesso.');
                  finishInitialization(useStore.getState());
                  return;
                }

                // 1. Query current SQLite tables first as a safety reference
                let [
                  acts, logs, nfcs, prods, clis, cats, subs, salesList, preOrdersList, cashierList, financialList, syncQueueList, tombstonesList,
                  productionsList, productionRunsList, materialsList, machinesList, returnsList, consignmentsList,
                  usersList, permissionsList, companySettingsList, systemSettingsList, terminalSettingsList, pdvSettingsList, pdvTotemSettingsList, kioskTerminalsList, printSettingsList
                ] = await Promise.all([
                  safeList(electronAPI.db.listActivities(1000), 'activities'),
                  safeList(electronAPI.db.listAuditLogs(5000), 'auditLogs'),
                  safeList(electronAPI.db.listNfcPresenceRecords(1000), 'nfcPresenceRecords'),
                  safeList(electronAPI.db.listProducts(), 'products'),
                  safeList(electronAPI.db.listClients(), 'clients'),
                  safeList(electronAPI.db.listCategories(), 'categories'),
                  safeList(electronAPI.db.listSubcategories(), 'subcategories'),
                  safeList(electronAPI.db.listSales(), 'sales'),
                  safeList(electronAPI.db.listPreOrders(), 'preOrders'),
                  safeList(electronAPI.db.listCashierSessions(), 'cashierSessions'),
                  safeList(electronAPI.db.listFinancialTransactions(), 'financialTransactions'),
                  safeList(electronAPI.db.listSyncQueue(), 'syncQueue'),
                  safeList(electronAPI.db.listTombstones(), 'tombstones'),
                  safeList(electronAPI.db.listProductions(), 'productions'),
                  safeList(electronAPI.db.listProductionRuns(), 'productionRuns'),
                  safeList(electronAPI.db.listMaterials(), 'materials'),
                  safeList(electronAPI.db.listMachines(), 'machines'),
                  safeList(electronAPI.db.listReturns(), 'returns'),
                  safeList(electronAPI.db.listConsignments(), 'consignments'),

                  safeList(electronAPI.db.listUsers(), 'users'),
                  safeList(electronAPI.db.listPermissions(), 'permissions'),
                  safeList(electronAPI.db.listCompanySettings(), 'companySettings'),
                  safeList(electronAPI.db.listSystemSettings(), 'systemSettings'),
                  safeList(electronAPI.db.listTerminalSettings(), 'terminalSettings'),
                  safeList(electronAPI.db.listPdvSettings(), 'pdvSettings'),
                  safeList(electronAPI.db.listPdvTotemSettings(), 'pdvTotemSettings'),
                  safeList(electronAPI.db.listKioskTerminals(), 'kioskTerminals'),
                  safeList(electronAPI.db.listPrintSettings(), 'printSettings')
                ]);

                // 2. Load the migration/watchdog flags from SQLite settings first
                let migrationStatusFromSQLite: Record<string, boolean> = {};
                if (Array.isArray(systemSettingsList)) {
                  const migrationConfig = systemSettingsList.find((s: any) => s.id === 'migration_status');
                  if (migrationConfig) {
                    migrationStatusFromSQLite = {
                      sqliteMigrationPhase2Done: !!migrationConfig.sqliteMigrationPhase2Done,
                      sqliteMigrationPhase3Done: !!migrationConfig.sqliteMigrationPhase3Done,
                      sqliteMigrationPhase4Done: !!migrationConfig.sqliteMigrationPhase4Done,
                      sqliteMigrationPhase5ADone: !!migrationConfig.sqliteMigrationPhase5ADone,
                      sqliteMigrationPhase5BDone: !!migrationConfig.sqliteMigrationPhase5BDone,
                      sqliteMigrationPhase6Done: !!migrationConfig.sqliteMigrationPhase6Done,
                      sqliteMigrationSafe: !!migrationConfig.sqliteMigrationSafe,
                    };
                    console.info('[SQLite/Boot] Loaded migration status from SQLite:', migrationStatusFromSQLite);
                  }
                }

                const getMigrationFlag = (flagName: string): boolean => {
                  if (migrationStatusFromSQLite[flagName] !== undefined) {
                    return migrationStatusFromSQLite[flagName];
                  }
                  return !!state[flagName as keyof AppState];
                };

                // 3. Load legacy state directly from IndexedDB on Desktop purely for migration
                let legacyZustandState: any = null;
                try {
                  const storeKey = environmentService.isTestEnvironment() ? 'erp-industrial-storage-teste' : 'erp-industrial-storage';
                  const rawLegacy = await idbStorage.getItem(storeKey);
                  if (rawLegacy) {
                    const parsed = JSON.parse(rawLegacy);
                    if (parsed && parsed.state) {
                      legacyZustandState = parsed.state;
                      console.info('[SQLite/Migration] Legacy Zustand state fetched from IDB for Desktop migration validation.');
                    }
                  }
                } catch (err) {
                  console.warn('[SQLite/Migration] Fails to fetch legacy state from IDB (expected for clean install):', err);
                }

                // 4. Discover datasets from emergency local backups as physical fallbacks
                let emergencyBackupData: any = null;
                try {
                  const rawEmergency = localStorage.getItem('emergency_backup_erp-industrial-storage') || 
                                       localStorage.getItem('emergency_backup_erp-industrial-storage-teste');
                  if (rawEmergency) {
                    const parsed = JSON.parse(rawEmergency);
                    if (parsed && parsed.state) {
                      emergencyBackupData = parsed.state;
                      console.info('[SQLite/Recovery] Backup de emergência localizado no localStorage!');
                    }
                  }
                } catch (e) {
                  console.warn('[SQLite/Recovery] Erro ao carregar backup de emergência:', e);
                }

                // Hydrate fallback variables using either state, legacy Zustand IDB cache or emergency backup
                const getLegacyList = (stateField: any[] | undefined, bKey: string): any[] => {
                  if (stateField && stateField.length > 0) return stateField;
                  if (legacyZustandState && Array.isArray(legacyZustandState[bKey]) && legacyZustandState[bKey].length > 0) {
                    console.info(`[SQLite/Migration] Usando dados da coleção ${bKey} carregados do IndexedDB legado.`);
                    return legacyZustandState[bKey];
                  }
                  if (emergencyBackupData && Array.isArray(emergencyBackupData[bKey]) && emergencyBackupData[bKey].length > 0) {
                    console.info(`[SQLite/Recovery] Usando dados da coleção ${bKey} recuperados do backup de emergência.`);
                    return emergencyBackupData[bKey];
                  }
                  return [];
                };

                const legacyProducts = getLegacyList(state.products, 'products');
                const legacyClients = getLegacyList(state.clients, 'clients');
                const legacyCategories = getLegacyList(state.categories, 'categories');
                const legacySubcategories = getLegacyList(state.subcategories, 'subcategories');
                const legacyActivities = getLegacyList(state.activities, 'activities');
                const legacyLogs = getLegacyList(state.auditLogs, 'auditLogs');
                const legacyNfcs = getLegacyList(state.nfcPresenceRecords, 'nfcPresenceRecords');
                const legacySales = getLegacyList(state.sales, 'sales');
                const legacyPreOrders = getLegacyList(state.preOrders, 'preOrders');
                const legacyCashierHistory = getLegacyList(state.cashierHistory, 'cashierHistory');
                const legacyCurrentCashier = state.currentCashier || 
                                              (legacyZustandState ? legacyZustandState.currentCashier : null) || 
                                              (emergencyBackupData ? emergencyBackupData.currentCashier : null);
                const legacyFinancial = getLegacyList(state.financialTransactions, 'financialTransactions');
                const legacySyncQueue = getLegacyList(state.pendingSyncQueue, 'pendingSyncQueue');
                const legacyTombstones = getLegacyList(state.tombstones, 'tombstones');
                const legacyProductions = getLegacyList(state.productions, 'productions');
                const legacyProductionRuns = getLegacyList(state.productionRuns, 'productionRuns');
                const legacyMaterials = getLegacyList(state.materials, 'materials');
                const legacyMachines = getLegacyList(state.machines, 'machines');
                const legacyReturns = getLegacyList(state.returns, 'returns');
                const legacyConsignments = getLegacyList(state.consignmentRemittances, 'consignmentRemittances');

                const legacyUsers = getLegacyList(state.users, 'users');
                const legacyUserRoles = getLegacyList(state.userRoles, 'userRoles');
                const legacyTerminals = getLegacyList(state.terminals, 'terminals');

                // 5. SECURE RE-MIGRATION WATCHDOG (repairSQLiteMigrationIfNeeded)
                let forcedRepairExecuted = false;
                let phase2RepairRequired = false;
                let phase3RepairRequired = false;
                let phase4RepairRequired = false;
                let phase5ARepairRequired = false;
                let phase5BRepairRequired = false;
                let phase6RepairRequired = false;

                if (getMigrationFlag('sqliteMigrationPhase2Done') && Array.isArray(acts) && acts.length === 0 && (legacyActivities.length > 0 || legacyLogs.length > 0)) {
                  phase2RepairRequired = true;
                  forcedRepairExecuted = true;
                  console.warn('[SQLite/Watchdog] Reparando Fase 2: Flag true, mas SQLite auditLogs/activities vazio!');
                }
                if (getMigrationFlag('sqliteMigrationPhase3Done') && Array.isArray(prods) && prods.length === 0 && legacyProducts.length > 0) {
                  phase3RepairRequired = true;
                  forcedRepairExecuted = true;
                  console.warn('[SQLite/Watchdog] Reparando Fase 3: Flag true, mas SQLite produtos vazio!');
                }
                if (getMigrationFlag('sqliteMigrationPhase4Done') && Array.isArray(salesList) && salesList.length === 0 && legacySales.length > 0) {
                  phase4RepairRequired = true;
                  forcedRepairExecuted = true;
                  console.warn('[SQLite/Watchdog] Reparando Fase 4: Flag true, mas SQLite vendas vazio!');
                }
                if (getMigrationFlag('sqliteMigrationPhase5ADone') && Array.isArray(syncQueueList) && syncQueueList.length === 0 && legacySyncQueue.length > 0) {
                  phase5ARepairRequired = true;
                  forcedRepairExecuted = true;
                  console.warn('[SQLite/Watchdog] Reparando Fase 5A: Flag true, mas SQLite syncQueue vazio!');
                }
                if (getMigrationFlag('sqliteMigrationPhase5BDone') && Array.isArray(productionsList) && productionsList.length === 0 && legacyProductions.length > 0) {
                  phase5BRepairRequired = true;
                  forcedRepairExecuted = true;
                  console.warn('[SQLite/Watchdog] Reparando Fase 5B: Flag true, mas SQLite produções vazio!');
                }
                if (getMigrationFlag('sqliteMigrationPhase6Done') && Array.isArray(usersList) && usersList.length === 0 && legacyUsers.length > 0) {
                  phase6RepairRequired = true;
                  forcedRepairExecuted = true;
                  console.warn('[SQLite/Watchdog] Reparando Fase 6: Flag true, mas SQLite users vazio!');
                }

                // 6. PERFORM PHASE MIGRATIONS WITH STAGE ERROR CATCHERS

                // Phase 2
                let phase2MigrationError = false;
                if (!getMigrationFlag('sqliteMigrationPhase2Done') || phase2RepairRequired) {
                  try {
                    console.info('[SQLite] Executando migração de Fase 2...');
                    if (legacyActivities.length > 0) {
                      for (const act of legacyActivities) {
                        if (act && act.id) await electronAPI.db.insertActivity(act);
                      }
                    }
                    if (legacyLogs.length > 0) {
                      for (const log of legacyLogs) {
                        if (log && log.id) await electronAPI.db.insertAuditLog(log);
                      }
                    }
                    if (legacyNfcs.length > 0) {
                      for (const rec of legacyNfcs) {
                        if (rec && rec.id) await electronAPI.db.insertNfcPresenceRecord(rec);
                      }
                    }
                  } catch (e) {
                    console.error('[SQLite] Erro na migração de Fase 2:', e);
                    phase2MigrationError = true;
                  }
                }

                // Phase 3
                let phase3MigrationError = false;
                if (!getMigrationFlag('sqliteMigrationPhase3Done') || phase3RepairRequired) {
                  try {
                    console.info('[SQLite] Executando migração de Fase 3...');
                    if (legacyProducts.length > 0) {
                      for (const prod of legacyProducts) {
                        if (prod && prod.id) await electronAPI.db.insertProduct(prod);
                      }
                    }
                    if (legacyClients.length > 0) {
                      for (const cli of legacyClients) {
                        if (cli && cli.id) await electronAPI.db.insertClient(cli);
                      }
                    }
                    if (legacyCategories.length > 0) {
                      for (const cat of legacyCategories) {
                        if (cat && cat.id) await electronAPI.db.insertCategory(cat);
                      }
                    }
                    if (legacySubcategories.length > 0) {
                      for (const sub of legacySubcategories) {
                        if (sub && sub.id) await electronAPI.db.insertSubcategory(sub);
                      }
                    }
                  } catch (e) {
                    console.error('[SQLite] Erro na migração de Fase 3:', e);
                    phase3MigrationError = true;
                  }
                }

                // Phase 4
                let phase4MigrationError = false;
                if (!getMigrationFlag('sqliteMigrationPhase4Done') || phase4RepairRequired) {
                  try {
                    console.info('[SQLite] Executando migração de Fase 4...');
                    if (legacySales.length > 0) {
                      for (const sale of legacySales) {
                        if (sale && sale.id) await electronAPI.db.insertSale(sale);
                      }
                    }
                    if (legacyPreOrders.length > 0) {
                      for (const order of legacyPreOrders) {
                        if (order && order.id) await electronAPI.db.insertPreOrder(order);
                      }
                    }
                    if (legacyCashierHistory.length > 0) {
                      for (const session of legacyCashierHistory) {
                        if (session && session.id) await electronAPI.db.insertCashierSession(session);
                      }
                    }
                    if (legacyCurrentCashier && legacyCurrentCashier.id) {
                      await electronAPI.db.insertCashierSession(legacyCurrentCashier);
                    }
                    if (legacyFinancial.length > 0) {
                      for (const trans of legacyFinancial) {
                        if (trans && trans.id) await electronAPI.db.insertFinancialTransaction(trans);
                      }
                    }
                  } catch (e) {
                    console.error('[SQLite] Erro na migração de Fase 4:', e);
                    phase4MigrationError = true;
                  }
                }

                // Phase 5A
                let phase5AMigrationError = false;
                if (!getMigrationFlag('sqliteMigrationPhase5ADone') || phase5ARepairRequired) {
                  try {
                    console.info('[SQLite] Executando migração de Fase 5A...');
                    if (legacySyncQueue.length > 0) {
                      for (const mut of legacySyncQueue) {
                        if (mut) await electronAPI.db.insertSyncQueueItem(mut);
                      }
                    }
                    if (legacyTombstones.length > 0) {
                      for (const tomb of legacyTombstones) {
                        if (tomb && tomb.id) await electronAPI.db.insertTombstone(tomb);
                      }
                    }
                  } catch (e) {
                    console.error('[SQLite] Erro na migração de Fase 5A:', e);
                    phase5AMigrationError = true;
                  }
                }

                // Phase 5B
                let phase5BMigrationError = false;
                if (!getMigrationFlag('sqliteMigrationPhase5BDone') || phase5BRepairRequired) {
                  try {
                    console.info('[SQLite] Executando migração de Fase 5B...');
                    if (legacyProductions.length > 0) {
                      for (const item of legacyProductions) {
                        if (item && item.id) await electronAPI.db.insertProduction(item);
                      }
                    }
                    if (legacyProductionRuns.length > 0) {
                      for (const item of legacyProductionRuns) {
                        if (item && item.id) await electronAPI.db.insertProductionRun(item);
                      }
                    }
                    if (legacyMaterials.length > 0) {
                      for (const item of legacyMaterials) {
                        if (item && item.id) await electronAPI.db.insertMaterial(item);
                      }
                    }
                    if (legacyMachines.length > 0) {
                      for (const item of legacyMachines) {
                        if (item && item.id) await electronAPI.db.insertMachine(item);
                      }
                    }
                    if (legacyReturns.length > 0) {
                      for (const item of legacyReturns) {
                        if (item && item.id) await electronAPI.db.insertReturn(item);
                      }
                    }
                    if (legacyConsignments.length > 0) {
                      for (const item of legacyConsignments) {
                        if (item && item.id) await electronAPI.db.insertConsignment(item);
                      }
                    }
                  } catch (e) {
                    console.error('[SQLite] Erro na migração de Fase 5B:', e);
                    phase5BMigrationError = true;
                  }
                }

                // Phase 6 - Configurations, Users, Roles, Print and Totem Kiosk
                let phase6MigrationError = false;
                if (!getMigrationFlag('sqliteMigrationPhase6Done') || phase6RepairRequired) {
                  try {
                    console.info('[SQLite] Executando migração de Fase 6 (Configurações e Usuários)...');
                    // 1. Users
                    if (legacyUsers.length > 0) {
                      for (const u of legacyUsers) {
                        if (u && u.id) await electronAPI.db.insertUser(u);
                      }
                    }
                    // 2. Roles (Permissions table)
                    if (legacyUserRoles.length > 0) {
                      for (const r of legacyUserRoles) {
                        if (r && r.id) await electronAPI.db.insertPermission(r);
                      }
                    }
                    // 3. Terminals (KioskTerminals table)
                    if (legacyTerminals.length > 0) {
                      for (const t of legacyTerminals) {
                        const tId = t.id || t.idTerminal;
                        if (t && tId) await electronAPI.db.insertKioskTerminal({ ...t, id: tId });
                      }
                    }
                    // 4. Company settings (CompanySettings table)
                    if (state.company) {
                      await electronAPI.db.insertCompanySetting({ id: 'company_info', ...state.company });
                    }
                    // 5. Print settings (PrintSettings table)
                    await electronAPI.db.insertPrintSetting({
                      id: 'print_configs_bundle',
                      printers: state.printers || [],
                      paperSizesERP: state.paperSizesERP || [],
                      paperDriverMappings: state.paperDriverMappings || [],
                      documentPrintConfigs: state.documentPrintConfigs || [],
                      receiptConfig: state.receiptConfig || {},
                      orderTicketConfig: state.orderTicketConfig || {},
                      labelConfig: state.labelConfig || {},
                      labelBatchConfig: state.labelBatchConfig || {},
                      badgeConfig: state.badgeConfig || {},
                      customerExperienceConfig: state.customerExperienceConfig || {},
                      catalogConfig: state.catalogConfig || {}
                    });
                    // 6. System settings (SystemSettings table)
                    await electronAPI.db.insertSystemSetting({
                      id: 'master_credentials',
                      masterPassword: state.masterPassword || '',
                      recoveryMasterPassword: state.recoveryMasterPassword || '',
                      masterAuthorizations: state.masterAuthorizations || [],
                      masterBadges: state.masterBadges || []
                    });
                    await electronAPI.db.insertSystemSetting({
                      id: 'system_lists',
                      badges: state.badges || [],
                      nfcTags: state.nfcTags || [],
                      paymentMethods: state.paymentMethods || [],
                      deliveryMethods: state.deliveryMethods || []
                    });
                    // 7. PDV Totem and PDV Settings
                    await electronAPI.db.insertPdvTotemSetting({
                      id: 'pdv_totem_settings',
                      totemCatalog: state.catalogConfig || {}
                    });
                    await electronAPI.db.insertPdvSetting({
                      id: 'pdv_main_settings',
                      activeTerminalId: state.activeTerminalId || null
                    });
                  } catch (e) {
                    console.error('[SQLite] Erro na migração de Fase 6:', e);
                    phase6MigrationError = true;
                  }
                }

                // 5. IF REPAIR WAS PERFORMED, RE-QUERY FROM SQLITE
                if (forcedRepairExecuted) {
                  console.info('[SQLite/Recovery] Recuperação realizada, recarregando coleções do SQLite...');
                  const [
                    rActs, rLogs, rNfcs, rProds, rClis, rCats, rSubs, rSalesList, rPreOrdersList, rCashierList, rFinancialList, rSyncQueueList, rTombstonesList,
                    rProductionsList, rProductionRunsList, rMaterialsList, rMachinesList, rReturnsList, rConsignmentsList,
                    rUsersList, rPermissionsList, rCompanySettingsList, rSystemSettingsList, rTerminalSettingsList, rPdvSettingsList, rPdvTotemSettingsList, rKioskTerminalsList, rPrintSettingsList
                  ] = await Promise.all([
                    safeList(electronAPI.db.listActivities(1000), 'activities'),
                    safeList(electronAPI.db.listAuditLogs(5000), 'auditLogs'),
                    safeList(electronAPI.db.listNfcPresenceRecords(1000), 'nfcPresenceRecords'),
                    safeList(electronAPI.db.listProducts(), 'products'),
                    safeList(electronAPI.db.listClients(), 'clients'),
                    safeList(electronAPI.db.listCategories(), 'categories'),
                    safeList(electronAPI.db.listSubcategories(), 'subcategories'),
                    safeList(electronAPI.db.listSales(), 'sales'),
                    safeList(electronAPI.db.listPreOrders(), 'preOrders'),
                    safeList(electronAPI.db.listCashierSessions(), 'cashierSessions'),
                    safeList(electronAPI.db.listFinancialTransactions(), 'financialTransactions'),
                    safeList(electronAPI.db.listSyncQueue(), 'syncQueue'),
                    safeList(electronAPI.db.listTombstones(), 'tombstones'),
                    safeList(electronAPI.db.listProductions(), 'productions'),
                    safeList(electronAPI.db.listProductionRuns(), 'productionRuns'),
                    safeList(electronAPI.db.listMaterials(), 'materials'),
                    safeList(electronAPI.db.listMachines(), 'machines'),
                    safeList(electronAPI.db.listReturns(), 'returns'),
                    safeList(electronAPI.db.listConsignments(), 'consignments'),

                    safeList(electronAPI.db.listUsers(), 'users'),
                    safeList(electronAPI.db.listPermissions(), 'permissions'),
                    safeList(electronAPI.db.listCompanySettings(), 'companySettings'),
                    safeList(electronAPI.db.listSystemSettings(), 'systemSettings'),
                    safeList(electronAPI.db.listTerminalSettings(), 'terminalSettings'),
                    safeList(electronAPI.db.listPdvSettings(), 'pdvSettings'),
                    safeList(electronAPI.db.listPdvTotemSettings(), 'pdvTotemSettings'),
                    safeList(electronAPI.db.listKioskTerminals(), 'kioskTerminals'),
                    safeList(electronAPI.db.listPrintSettings(), 'printSettings')
                  ]);

                  if (Array.isArray(rActs)) acts = rActs;
                  if (Array.isArray(rLogs)) logs = rLogs;
                  if (Array.isArray(rNfcs)) nfcs = rNfcs;
                  if (Array.isArray(rProds)) prods = rProds;
                  if (Array.isArray(rClis)) clis = rClis;
                  if (Array.isArray(rCats)) cats = rCats;
                  if (Array.isArray(rSubs)) subs = rSubs;
                  if (Array.isArray(rSalesList)) salesList = rSalesList;
                  if (Array.isArray(rPreOrdersList)) preOrdersList = rPreOrdersList;
                  if (Array.isArray(rCashierList)) cashierList = rCashierList;
                  if (Array.isArray(rFinancialList)) financialList = rFinancialList;
                  if (Array.isArray(rSyncQueueList)) syncQueueList = rSyncQueueList;
                  if (Array.isArray(rTombstonesList)) tombstonesList = rTombstonesList;
                  if (Array.isArray(rProductionsList)) productionsList = rProductionsList;
                  if (Array.isArray(rProductionRunsList)) productionRunsList = rProductionRunsList;
                  if (Array.isArray(rMaterialsList)) materialsList = rMaterialsList;
                  if (Array.isArray(rMachinesList)) machinesList = rMachinesList;
                  if (Array.isArray(rReturnsList)) returnsList = rReturnsList;
                  if (Array.isArray(rConsignmentsList)) consignmentsList = rConsignmentsList;

                  if (Array.isArray(rUsersList)) usersList = rUsersList;
                  if (Array.isArray(rPermissionsList)) permissionsList = rPermissionsList;
                  if (Array.isArray(rCompanySettingsList)) companySettingsList = rCompanySettingsList;
                  if (Array.isArray(rSystemSettingsList)) systemSettingsList = rSystemSettingsList;
                  if (Array.isArray(rTerminalSettingsList)) terminalSettingsList = rTerminalSettingsList;
                  if (Array.isArray(rPdvSettingsList)) pdvSettingsList = rPdvSettingsList;
                  if (Array.isArray(rPdvTotemSettingsList)) pdvTotemSettingsList = rPdvTotemSettingsList;
                  if (Array.isArray(rKioskTerminalsList)) kioskTerminalsList = rKioskTerminalsList;
                  if (Array.isArray(rPrintSettingsList)) printSettingsList = rPrintSettingsList;
                }

                // 6. BUILD INTUITIVE AND SHIELDED STATE UPDATES
                const updates: any = {};

                // Map listings cleanly. Empty arrays loaded from SQLite are only accepted as truth
                // if there's no legacy data or if migrations are declared completed!
                const applyFieldUpdate = (fieldKey: string, loadedArr: any[] | null, legacyArr: any[]) => {
                  if (Array.isArray(loadedArr)) {
                    if (loadedArr.length > 0) {
                      updates[fieldKey] = loadedArr;
                    } else {
                      const flagMap: Record<string, string> = {
                        products: 'sqliteMigrationPhase3Done',
                        clients: 'sqliteMigrationPhase3Done',
                        categories: 'sqliteMigrationPhase3Done',
                        subcategories: 'sqliteMigrationPhase3Done',
                        sales: 'sqliteMigrationPhase4Done',
                        preOrders: 'sqliteMigrationPhase4Done',
                        cashierHistory: 'sqliteMigrationPhase4Done',
                        financialTransactions: 'sqliteMigrationPhase4Done',
                        pendingSyncQueue: 'sqliteMigrationPhase5ADone',
                        tombstones: 'sqliteMigrationPhase5ADone',
                        productions: 'sqliteMigrationPhase5BDone',
                        productionRuns: 'sqliteMigrationPhase5BDone',
                        materials: 'sqliteMigrationPhase5BDone',
                        machines: 'sqliteMigrationPhase5BDone',
                        returns: 'sqliteMigrationPhase5BDone',
                        consignmentRemittances: 'sqliteMigrationPhase5BDone',
                        activities: 'sqliteMigrationPhase2Done',
                        auditLogs: 'sqliteMigrationPhase2Done',
                        nfcPresenceRecords: 'sqliteMigrationPhase2Done',
                        users: 'sqliteMigrationPhase6Done',
                        userRoles: 'sqliteMigrationPhase6Done',
                        terminals: 'sqliteMigrationPhase6Done'
                      };
                      const migrationFlag = flagMap[fieldKey];
                      const isMigrationDone = migrationFlag ? state[migrationFlag as keyof AppState] : true;

                      if (legacyArr.length > 0 && !isMigrationDone) {
                        console.info(`[SQLite] Integridade: ${fieldKey} vazio no SQLite e migração pendente, carregando fallback legado.`);
                        updates[fieldKey] = legacyArr;
                      } else {
                        updates[fieldKey] = [];
                      }
                    }
                  } else {
                    console.error(`[SQLite-AUDIT] FALHA CRÍTICA na leitura da tabela '${fieldKey}'! Mantendo os dados anteriores.`);
                    updates[fieldKey] = legacyArr;
                  }
                };

                applyFieldUpdate('activities', acts, legacyActivities);
                applyFieldUpdate('auditLogs', logs, legacyLogs);
                applyFieldUpdate('nfcPresenceRecords', nfcs, legacyNfcs);
                applyFieldUpdate('products', prods, legacyProducts);
                applyFieldUpdate('clients', clis, legacyClients);
                applyFieldUpdate('categories', cats, legacyCategories);
                applyFieldUpdate('subcategories', subs, legacySubcategories);
                applyFieldUpdate('sales', salesList, legacySales);
                applyFieldUpdate('preOrders', preOrdersList, legacyPreOrders);
                applyFieldUpdate('financialTransactions', financialList, legacyFinancial);
                applyFieldUpdate('pendingSyncQueue', syncQueueList, legacySyncQueue);
                applyFieldUpdate('tombstones', tombstonesList, legacyTombstones);
                applyFieldUpdate('productions', productionsList, legacyProductions);
                applyFieldUpdate('productionRuns', productionRunsList, legacyProductionRuns);
                applyFieldUpdate('materials', materialsList, legacyMaterials);
                applyFieldUpdate('machines', machinesList, legacyMachines);
                applyFieldUpdate('returns', returnsList, legacyReturns);
                applyFieldUpdate('consignmentRemittances', consignmentsList, legacyConsignments);

                // Apply loaded config parameters/nested structures
                applyFieldUpdate('users', usersList, legacyUsers);
                applyFieldUpdate('userRoles', permissionsList, legacyUserRoles);
                applyFieldUpdate('terminals', kioskTerminalsList, legacyTerminals);

                // Import single objects configs
                if (Array.isArray(companySettingsList) && companySettingsList.length > 0) {
                  const companyDoc = companySettingsList.find((c: any) => c.id === 'company_info');
                  if (companyDoc) {
                    updates.company = companyDoc;
                  }
                } else if (state.company) {
                  updates.company = state.company;
                }

                if (Array.isArray(printSettingsList) && printSettingsList.length > 0) {
                  const printConfig = printSettingsList.find((p: any) => p.id === 'print_configs_bundle');
                  if (printConfig) {
                    if (printConfig.printers) updates.printers = printConfig.printers;
                    if (printConfig.paperSizesERP) updates.paperSizesERP = printConfig.paperSizesERP;
                    if (printConfig.paperDriverMappings) updates.paperDriverMappings = printConfig.paperDriverMappings;
                    if (printConfig.documentPrintConfigs) updates.documentPrintConfigs = printConfig.documentPrintConfigs;
                    if (printConfig.receiptConfig) updates.receiptConfig = printConfig.receiptConfig;
                    if (printConfig.orderTicketConfig) updates.orderTicketConfig = printConfig.orderTicketConfig;
                    if (printConfig.labelConfig) updates.labelConfig = printConfig.labelConfig;
                    if (printConfig.labelBatchConfig) updates.labelBatchConfig = printConfig.labelBatchConfig;
                    if (printConfig.badgeConfig) updates.badgeConfig = printConfig.badgeConfig;
                    if (printConfig.customerExperienceConfig) updates.customerExperienceConfig = printConfig.customerExperienceConfig;
                    if (printConfig.catalogConfig) updates.catalogConfig = printConfig.catalogConfig;
                  }
                }

                if (Array.isArray(systemSettingsList) && systemSettingsList.length > 0) {
                  const masterConfig = systemSettingsList.find((s: any) => s.id === 'master_credentials');
                  if (masterConfig) {
                    if (masterConfig.masterPassword) updates.masterPassword = masterConfig.masterPassword;
                    if (masterConfig.recoveryMasterPassword) updates.recoveryMasterPassword = masterConfig.recoveryMasterPassword;
                    if (masterConfig.masterAuthorizations) updates.masterAuthorizations = masterConfig.masterAuthorizations;
                    if (masterConfig.masterBadges) updates.masterBadges = masterConfig.masterBadges;
                  }
                  const listsConfig = systemSettingsList.find((s: any) => s.id === 'system_lists');
                  if (listsConfig) {
                    if (listsConfig.badges) updates.badges = listsConfig.badges;
                    if (listsConfig.nfcTags) updates.nfcTags = listsConfig.nfcTags;
                    if (listsConfig.paymentMethods) updates.paymentMethods = listsConfig.paymentMethods;
                    if (listsConfig.deliveryMethods) updates.deliveryMethods = listsConfig.deliveryMethods;
                  }
                }

                if (Array.isArray(pdvSettingsList) && pdvSettingsList.length > 0) {
                  const pdvConfig = pdvSettingsList.find((p: any) => p.id === 'pdv_main_settings');
                  if (pdvConfig) {
                    if (pdvConfig.activeTerminalId !== undefined) updates.activeTerminalId = pdvConfig.activeTerminalId;
                  }
                }

                // Cashier history & Session mapping
                if (Array.isArray(cashierList)) {
                  if (cashierList.length > 0) {
                    const opened = cashierList.find(c => c.status === 'open' || c.status === 'aberto' || !c.closingTime);
                    const closedList = cashierList.filter(c => c.id !== (opened ? opened.id : null));
                    updates.currentCashier = opened || null;
                    updates.cashierHistory = closedList;
                  } else {
                    const isCashierMigrationDone = state.sqliteMigrationPhase4Done;
                    if ((legacyCurrentCashier || legacyCashierHistory.length > 0) && !isCashierMigrationDone) {
                      updates.currentCashier = legacyCurrentCashier;
                      updates.cashierHistory = legacyCashierHistory;
                    } else {
                      updates.currentCashier = null;
                      updates.cashierHistory = [];
                    }
                  }
                } else {
                  console.warn(`[SQLite] Falha ao carregar cashierSessions. Preservando backup legado.`);
                  updates.currentCashier = legacyCurrentCashier;
                  updates.cashierHistory = legacyCashierHistory;
                }

                // 7. HIGH-FIDELITY PHASE VALIDATION
                const markPhaseDone = (flagKey: string, isErr: boolean, hasSQLite: boolean, hasLegacy: boolean) => {
                  if (!isErr && (hasSQLite || !hasLegacy)) {
                    updates[flagKey] = true;
                  } else {
                    console.warn(`[SQLite] ${flagKey} não foi concluída com total certeza de integridade.`);
                  }
                };

                const hasP2SQLite = Array.isArray(acts) && acts.length > 0;
                const hasP2Legacy = legacyActivities.length > 0 || legacyLogs.length > 0;
                markPhaseDone('sqliteMigrationPhase2Done', phase2MigrationError, hasP2SQLite, hasP2Legacy);

                const hasP3SQLite = Array.isArray(prods) && prods.length > 0;
                const hasP3Legacy = legacyProducts.length > 0 || legacyClients.length > 0;
                markPhaseDone('sqliteMigrationPhase3Done', phase3MigrationError, hasP3SQLite, hasP3Legacy);

                const hasP4SQLite = Array.isArray(salesList) && salesList.length > 0;
                const hasP4Legacy = legacySales.length > 0 || legacyPreOrders.length > 0;
                markPhaseDone('sqliteMigrationPhase4Done', phase4MigrationError, hasP4SQLite, hasP4Legacy);

                const hasP5ASQLite = Array.isArray(syncQueueList) && syncQueueList.length > 0;
                const hasP5ALegacy = legacySyncQueue.length > 0 || legacyTombstones.length > 0;
                markPhaseDone('sqliteMigrationPhase5ADone', phase5AMigrationError, hasP5ASQLite, hasP5ALegacy);

                const hasP5BSQLite = Array.isArray(productionsList) && productionsList.length > 0;
                const hasP5BLegacy = legacyProductions.length > 0;
                markPhaseDone('sqliteMigrationPhase5BDone', phase5BMigrationError, hasP5BSQLite, hasP5BLegacy);

                const hasP6SQLite = Array.isArray(usersList) && usersList.length > 0;
                const hasP6Legacy = legacyUsers.length > 0;
                markPhaseDone('sqliteMigrationPhase6Done', phase6MigrationError, hasP6SQLite, hasP6Legacy);

                // 8. MARK PERSISTENCE AS SAFE ONLY IF LOAD WAS 100% HEALTHY WITH NO LOAD ERRORS
                if (!hasLoadError && Array.isArray(prods) && Array.isArray(clis) && Array.isArray(salesList)) {
                  updates.sqliteMigrationSafe = true;
                  updates.sqliteStatus = 'ready';
                  console.info('[SQLite-AUDIT] sqliteMigrationSafe alterado para TRUE e status de SQLite para READY.');

                  // Persist the newly marked flags into SQLite system settings so we don't need IndexedDB.
                  try {
                    await electronAPI.db.insertSystemSetting({
                      id: 'migration_status',
                      sqliteMigrationPhase2Done: !!updates.sqliteMigrationPhase2Done,
                      sqliteMigrationPhase3Done: !!updates.sqliteMigrationPhase3Done,
                      sqliteMigrationPhase4Done: !!updates.sqliteMigrationPhase4Done,
                      sqliteMigrationPhase5ADone: !!updates.sqliteMigrationPhase5ADone,
                      sqliteMigrationPhase5BDone: !!updates.sqliteMigrationPhase5BDone,
                      sqliteMigrationPhase6Done: !!updates.sqliteMigrationPhase6Done,
                      sqliteMigrationSafe: true
                    });
                    console.info('[SQLite-AUDIT] Migration status successfully saved to SQLite systemSettings.');
                  } catch (err) {
                    console.error('[SQLite-AUDIT] Failed to save migration status to SQLite:', err);
                  }
                } else {
                  updates.sqliteMigrationSafe = false;
                  updates.sqliteStatus = 'error';
                  console.error('[SQLite-AUDIT] Erro de boot crítico do SQLite detectado. Mantendo dados idb/memória intactos e marcando status ERROR.');
                }

                state.setSQLiteData(updates);
                console.info('[SQLite-AUDIT] [SQLite/Boot] Hidratação de dados do SQLite concluída.');
              } catch (err) {
                console.error('[SQLite] Erro crítico no boot do SQLite:', err);
                state.setSQLiteData({ sqliteMigrationSafe: false, sqliteStatus: 'error' });
              } finally {
                finishInitialization(useStore.getState());
              }
            } else {
              // A API do SQLite falhou após retries no Desktop OU estamos no Web!
              if (isDesktop) {
                console.error('[SQLite/Boot] FALHA: SQLite indisponível ou com erro no Desktop!');
                state.setSQLiteData({ sqliteMigrationSafe: false, sqliteStatus: 'error' });
              } else {
                console.info('[SQLite/Boot] Modo Web detectado. Usando IndexedDB persistente.');
                state.setSQLiteData({ sqliteMigrationSafe: false, sqliteStatus: 'web' });
              }
              finishInitialization(useStore.getState());
            }
          };

          initializePersistence();
        }
      };
    },
    partialize: (state) => {
        const { 
          currentUser, isAuthenticated, isSettingsOpen, activeSettingModule, hasHydrated, setHasHydrated,
          ...rest 
        } = state;
        // currentUser and isAuthenticated are serialized directly to localStorage and sessionStorage
        // below to support persistent session until explicit logout, separated from business IndexedDB.
        const isDesktop = typeof window !== 'undefined' && !!(window as any).electron;
        if (isDesktop && state.sqliteMigrationSafe === true) {
          const { 
            auditLogs, activities, nfcPresenceRecords, 
            sales, preOrders, cashierHistory, currentCashier, financialTransactions,
            pendingSyncQueue, tombstones,
            productions, productionRuns, materials, machines, returns, consignmentRemittances,
            products, clients, categories, subcategories,
            users, userRoles, terminals, printers, badges, nfcTags, paymentMethods, deliveryMethods,
            company, activeTerminalId, masterPassword, recoveryMasterPassword, masterAuthorizations, masterBadges,
            ...restDesktop 
          } = rest;
          return restDesktop;
        }
        return rest;
      },
    }
  )
);

// Auto-synchronize currentUser and isAuthenticated to localStorage and sessionStorage to maintain persistent session until explicit logout
if (typeof window !== 'undefined') {
  useStore.subscribe((state) => {
    try {
      if (state.currentUser) {
        localStorage.setItem('currentUser', JSON.stringify(state.currentUser));
        sessionStorage.setItem('currentUser', JSON.stringify(state.currentUser));
      } else {
        localStorage.removeItem('currentUser');
        sessionStorage.removeItem('currentUser');
      }
      localStorage.setItem('isAuthenticated', state.isAuthenticated ? 'true' : 'false');
      sessionStorage.setItem('isAuthenticated', state.isAuthenticated ? 'true' : 'false');
    } catch (e) {
      console.warn('Failed to sync auth state to storage:', e);
    }
  });

  // Cross-tab real-time sync via BroadcastChannel for Products, Clients, Cashier, Categories, and Company
  const windowId = Math.random().toString(36).substring(2, 9);
  const syncChannel = new BroadcastChannel('app-state-sync-channel');
  let isUpdatingFromSync = false;
  let lastState = useStore.getState();

  useStore.subscribe((state) => {
    if (isUpdatingFromSync) {
      lastState = state;
      return;
    }

    const syncKeys = [
      'products',
      'clients',
      'currentCashier',
      'categories',
      'subcategories',
      'company',
      'paymentMethods',
      'deliveryMethods'
    ] as const;

    const changedKeys: any = {};
    let hasChanges = false;

    for (const key of syncKeys) {
      if (state[key] !== lastState[key]) {
        changedKeys[key] = state[key];
        hasChanges = true;
      }
    }

    lastState = state;

    if (hasChanges) {
      try {
        syncChannel.postMessage({
          senderId: windowId,
          type: 'store-sync',
          payload: changedKeys
        });
      } catch (err) {
        console.warn('[Sync] BroadcastChannel failed to send:', err);
      }
    }
  });

  syncChannel.onmessage = (event) => {
    const { senderId, type, payload } = event.data || {};
    if (type === 'store-sync' && senderId !== windowId && payload) {
      isUpdatingFromSync = true;
      try {
        useStore.setState(payload);
      } catch (err) {
        console.error('[Sync] Failed to apply state sync:', err);
      } finally {
        setTimeout(() => {
          isUpdatingFromSync = false;
        }, 10);
      }
    }
  };
}

