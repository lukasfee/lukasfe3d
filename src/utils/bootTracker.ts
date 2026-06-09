// Centralized Bootstrap Tracker for Lukasfe ERP
// Manages boot tracing, Promise tracking, defensive timeouts, and failure reporting

export type BootStep =
  | 'APP_START'
  | 'ELECTRON_READY'
  | 'STORAGE_INIT_START'
  | 'STORAGE_INIT_DONE'
  | 'DATABASE_LOAD_START'
  | 'DATABASE_LOAD_DONE'
  | 'AUTH_RESTORE_START'
  | 'AUTH_RESTORE_DONE'
  | 'SYNC_ENGINE_START'
  | 'SYNC_ENGINE_DONE'
  | 'NETWORK_SERVICE_START'
  | 'NETWORK_SERVICE_DONE'
  | 'HOME_RENDER_START'
  | 'HOME_RENDER_DONE'
  | 'APP_READY';

interface PromiseRecord {
  label: string;
  startedAt: number;
  endedAt: number | null;
  status: 'pending' | 'resolved' | 'rejected' | 'timeout';
}

class BootTracker {
  private static instance: BootTracker;
  private currentStep: BootStep | null = null;
  private completedSteps: Set<BootStep> = new Set();
  private stepTimestamps: Map<BootStep, number> = new Map();
  private promises: Map<string, PromiseRecord> = new Map();
  private bootStartTime: number = Date.now();
  private timeoutTimer: any = null;
  private errorListeners: Set<(errorMsg: string, summary: string) => void> = new Set();
  private lastStepChangeTime: number = Date.now();

  private constructor() {
    this.bootStartTime = Date.now();
    this.lastStepChangeTime = Date.now();
    this.resetTimeout();
  }

  public static getInstance(): BootTracker {
    if (!BootTracker.instance) {
      BootTracker.instance = new BootTracker();
    }
    return BootTracker.instance;
  }

  /**
   * Traces a specific boot step and logs it matching exact specs.
   */
  public trackStep(step: BootStep): void {
    const now = Date.now();
    this.currentStep = step;
    this.completedSteps.add(step);
    this.stepTimestamps.set(step, now);
    this.lastStepChangeTime = now;

    console.log(`[TRACE][BOOT] ${step}`);

    // If APP_READY is reached, clear any active boot timeouts and print summary
    if (step === 'APP_READY') {
      this.clearTimeoutTimer();
      console.log(this.getSummary());
    } else if (this.completedSteps.has('APP_READY')) {
      // If the app is already ready, do not reset/start the boot timeout timer.
      this.clearTimeoutTimer();
    } else {
      this.resetTimeout();
    }
  }

  public getCurrentStep(): BootStep | null {
    return this.currentStep;
  }

  public getElapsedTime(): number {
    return Date.now() - this.bootStartTime;
  }

  /**
   * Tracks a critical promise, protecting agains hang loops.
   */
  public async trackPromise<T>(
    label: string,
    promise: Promise<T> | (() => Promise<T>),
    timeoutMs: number = 15000
  ): Promise<T> {
    const id = `${label}_${Math.random().toString(36).substring(2, 7)}`;
    const now = Date.now();
    
    this.promises.set(id, {
      label,
      startedAt: now,
      endedAt: null,
      status: 'pending',
    });

    console.log(`[TRACE][BOOT_PROMISE_START] ${label} started`);

    // Wrap in a technical timeout representation
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => {
        const record = this.promises.get(id);
        if (record && record.status === 'pending') {
          record.status = 'timeout';
          record.endedAt = Date.now();
          console.warn(`[TRACE][BOOT_PROMISE_TIMEOUT] ${label} exceeded ${timeoutMs}ms limit!`);
        }
        reject(new Error(`Timeout de ${timeoutMs / 1000}s excedido ao executar: ${label}`));
      }, timeoutMs);
    });

    try {
      const activePromise = typeof promise === 'function' ? promise() : promise;
      const result = await Promise.race([activePromise, timeoutPromise]);
      
      const record = this.promises.get(id);
      if (record) {
        record.status = 'resolved';
        record.endedAt = Date.now();
      }
      console.log(`[TRACE][BOOT_PROMISE_DONE] ${label} resolved after ${Date.now() - now}ms`);
      return result;
    } catch (err: any) {
      const record = this.promises.get(id);
      if (record && record.status === 'pending') {
        record.status = 'rejected';
        record.endedAt = Date.now();
      }
      console.error(`[TRACE][BOOT_PROMISE_FAILED] ${label} rejected after ${Date.now() - now}ms:`, err?.message || err);
      throw err;
    }
  }

  /**
   * Registers a listener to be notified on lock/timeout errors.
   */
  public subscribeError(listener: (errorMsg: string, summary: string) => void): () => void {
    this.errorListeners.add(listener);
    return () => {
      this.errorListeners.delete(listener);
    };
  }

  private clearTimeoutTimer() {
    if (this.timeoutTimer) {
      clearTimeout(this.timeoutTimer);
      this.timeoutTimer = null;
    }
  }

  /**
   * Sets up a defensive 15-second timeout.
   */
  private resetTimeout() {
    this.clearTimeoutTimer();
    
    this.timeoutTimer = setTimeout(() => {
      const elapsedStep = Date.now() - this.lastStepChangeTime;
      const message = `Falha defensiva: inicialização travada na etapa '${this.currentStep}' por mais de 15 segundos.`;
      console.error(`[TRACE][BOOT_TIMEOUT] ${message} (etapa_duracao=${elapsedStep}ms)`);
      
      const summary = this.getSummary();
      console.log(summary);

      this.errorListeners.forEach((listener) => {
        try {
          listener(message, summary);
        } catch (e) {
          console.error('[BootTracker] Failed notifying listener:', e);
        }
      });
    }, 15000);
  }

  /**
   * Determines the logical following transition step.
   */
  private getNextExpectedStep(): string {
    const list: BootStep[] = [
      'APP_START',
      'ELECTRON_READY',
      'STORAGE_INIT_START',
      'STORAGE_INIT_DONE',
      'DATABASE_LOAD_START',
      'DATABASE_LOAD_DONE',
      'AUTH_RESTORE_START',
      'AUTH_RESTORE_DONE',
      'SYNC_ENGINE_START',
      'SYNC_ENGINE_DONE',
      'NETWORK_SERVICE_START',
      'NETWORK_SERVICE_DONE',
      'HOME_RENDER_START',
      'HOME_RENDER_DONE',
      'APP_READY',
    ];
    if (!this.currentStep) return 'APP_START';
    const index = list.indexOf(this.currentStep);
    if (index !== -1 && index < list.length - 1) {
      return list[index + 1];
    }
    return 'COMPLETE';
  }

  /**
   * Compiles the required diagnostic text block.
   */
  public getSummary(): string {
    const totalTimeSec = ((Date.now() - this.bootStartTime) / 1000).toFixed(2);
    const lastStep = this.currentStep || 'APP_START';
    const nextStep = this.getNextExpectedStep();

    // Check for hanging / unresponsive promises
    const pendingPromises = Array.from(this.promises.values())
      .filter((p) => p.status === 'pending' || p.status === 'timeout')
      .map((p) => `${p.label} (${p.status === 'timeout' ? 'Timeout' : 'Hanging'} - ${Date.now() - p.startedAt}ms)`);

    const hangingStr = pendingPromises.length > 0 ? pendingPromises.join(', ') : 'Nenhuma detectada';

    // Guess probable cause
    let serviceStuck = 'Nenhum';
    let probableReason = 'Processamento normal ou inicialização concluída.';

    if (lastStep === 'STORAGE_INIT_START') {
      serviceStuck = 'IndexedDB / Storage Engine';
      probableReason = 'IndexedDB está bloqueado por outro processo ou travou na migração de esquema de forma silenciosa.';
    } else if (lastStep === 'DATABASE_LOAD_START') {
      serviceStuck = 'Zustand / Database Restoration';
      probableReason = 'Mapeamento/sanitização de usuários ou restauração de coleções excedeu o tempo limite.';
    } else if (lastStep === 'SYNC_ENGINE_START') {
      serviceStuck = 'Sync Engine Service';
      probableReason = 'Serviço de sincronização entrou em loop de reconexão ou travou ao verificar a rede local.';
    } else if (lastStep === 'NETWORK_SERVICE_START') {
      serviceStuck = 'Network Service';
      probableReason = 'Inicialização da interface de rede local ou descoberta de IP travou.';
    } else if (lastStep === 'AUTH_RESTORE_START') {
      serviceStuck = 'Auth Restoration';
      probableReason = 'Restauração de credenciais / verificação de perfil de usuário em localStorage travou ou entrou em conflito.';
    } else if (lastStep === 'HOME_RENDER_START') {
      serviceStuck = 'React Components / Dom Rendering';
      probableReason = 'O disparo de useEffects e renderizações do Início entrou em loop infinito ou bloqueou a thread principal.';
    } else if (pendingPromises.length > 0) {
      serviceStuck = 'Promise pendente';
      probableReason = `Sistemas travados aguardando conclusão de Promises críticas: [${hangingStr}].`;
    }

    return `[TRACE][BOOT_SUMMARY]
- última etapa concluída: ${lastStep}
- próxima etapa esperada: ${nextStep}
- Promise pendurada: ${hangingStr}
- serviço travado: ${serviceStuck}
- tempo total de boot: ${totalTimeSec}s
- motivo provável: ${probableReason}`;
  }
}

export const bootTracker = BootTracker.getInstance();
