import { useStore, isBadgeBlocked } from '../store';

export type CredentialContext = 
  | 'LOGIN' 
  | 'MASTER_AUTH' 
  | 'OPERACAO' 
  | 'PONTO' 
  | 'TERMINAL' 
  | 'TROCA_OPERADOR' 
  | 'ADM_ACCESS';

export interface ValidationResult {
  success: boolean;
  error?: string;
  user?: any;
  tag?: any;
}

class CredentialValidationService {
  // Anti-loop and Cooldown memory
  private lastValue: string = '';
  private lastTime: number = 0;
  private lastType: 'NFC' | 'QR' | null = null;
  
  // Rate-limiting and flood protection
  private recentAttempts: { timestamp: number; value: string }[] = [];
  private invalidAttemptsCount = 0;
  private lockoutUntil = 0;
  private isProcessing = false;

  private normalizeUID(val: string): string {
    return (val || '').trim().replace(/[:\s-]/g, '').toUpperCase();
  }

  /**
   * Resets the flood/rate limits and error tracking counters.
   */
  public resetSecurityCounters() {
    this.invalidAttemptsCount = 0;
    this.lockoutUntil = 0;
    this.recentAttempts = [];
    this.isProcessing = false;
    console.log('[Security Hardening] Security counters reset.');
  }

  /**
   * Hardened validation interface for all entry mechanisms, 
   * enforcing anti-flood, de-conflict, and contextual rule enforcement.
   */
  public validateCredential(
    rawCredentialValue: string,
    type: 'NFC' | 'QR',
    context: CredentialContext,
    options?: {
      targetTerminalId?: string;
      requiredRole?: string;
    }
  ): ValidationResult {
    const now = Date.now();
    const cleanVal = this.normalizeUID(rawCredentialValue);

    // 1. Lockout Validation (Anti-Brute-Force & Cooldown penalty)
    if (now < this.lockoutUntil) {
      const remainingSecs = Math.ceil((this.lockoutUntil - now) / 1000);
      return {
        success: false,
        error: `Múltiplas tentativas incorretas. Sistema bloqueado temporariamente por ${remainingSecs}s.`
      };
    }

    // 2. Concurrency Lockout (Prevent race-conditions or QR + NFC overlapping reads)
    if (this.isProcessing) {
      return {
        success: false,
        error: 'Outra operação de validação de credencial está em andamento.'
      };
    }

    this.isProcessing = true;

    try {
      // 3. Simultaneous Input Conflict Check (QR & NFC overlapping in < 1 second)
      if (this.lastTime > 0 && Math.abs(now - this.lastTime) < 1000) {
        if (this.lastType !== type) {
          this.logSecurityAudit(
            'Conflito de Leitura',
            `Leitura simultânea detectada (NFC + QR). Negado para evitar sobreposição estrutural de login.`,
            'alerta'
          );
          return {
            success: false,
            error: 'Erro de conflito: QR Code e NFC detectados simultaneamente. Aproxime apenas um por vez.'
          };
        }
      }

      // 4. Anti-loop & Debouncer Global (Cooldon temporal de leitura individual por tag/token)
      if (cleanVal === this.lastValue && (now - this.lastTime < 2000)) {
        console.warn(`[Security Hardening] Anti-loop ativado para UID/Token: ${cleanVal}`);
        return {
          success: false,
          error: 'Operação redundante recente. Por favor, aguarde 2 segundos para ler novamente.'
        };
      }

      // 5. Flood Protection / Volumetric rate limiting
      this.recentAttempts = this.recentAttempts.filter(att => now - att.timestamp < 10000); // look at past 10s
      this.recentAttempts.push({ timestamp: now, value: cleanVal });

      if (this.recentAttempts.length > 5) {
        this.lockoutUntil = now + 15000; // 15 second lockout penalty
        this.logSecurityAudit(
          'Flood Múltiplo',
          `Rate limit excedido: 5 tentativas em menos de 10 segundos. Lockout ativado por 15 segundos.`,
          'bloqueado'
        );
        return {
          success: false,
          error: 'Excessivas tentativas de leitura rápidas. Sistema travado por 15 segundos por segurança.'
        };
      }

      // Store state for tracking
      this.lastValue = cleanVal;
      this.lastTime = now;
      this.lastType = type;

      // Access Zustand store dynamically
      const storeState = useStore.getState();
      const users = storeState.users || [];
      const tags = storeState.nfcTags || [];

      // ------------------------------------
      // CASE A: NFC Credential Flow
      // ------------------------------------
      if (type === 'NFC') {
        const tag = tags.find(t => this.normalizeUID(t.uid) === cleanVal && t.status !== 'Excluido');

        // 1. Encontrar credencial pelo ID real -> Se não encontrar: 'Crachá não cadastrado'
        if (!tag) {
          this.registerInvalidAttempt(`Tentativa NFC inválida com tag inexplicada (UID: ${rawCredentialValue})`);
          return { success: false, error: 'Crachá não cadastrado' };
        }

        // Determina se a tag está destinada a um administrador
        const isAdmTag = tag.tipoCredencial === 'ADM';

        // 2. Verificar vínculo: se não tiver usuário vinculado
        if (!tag.usuarioVinculado) {
          this.registerInvalidAttempt(`Tentativa NFC com tag livre sem operador (UID: ${tag.uid})`);
          return { success: false, error: isAdmTag ? 'QR Code sem vínculo com ADM' : 'Crachá sem usuário vinculado' };
        }

        const user = users.find(u => u.id === tag.usuarioVinculado);
        if (!user) {
          this.registerInvalidAttempt(`Tentativa NFC com tag vinculada a usuário inexistente (UID: ${tag.uid})`);
          return { success: false, error: isAdmTag ? 'QR Code sem vínculo com ADM' : 'Crachá sem usuário vinculado' };
        }

        const isAdmUser = user.roleId === 'admin' || user.isMasterAdmin || user.isOwner || user.login === 'admin';

        // 3. Se estiver bloqueado: 'Crachá bloqueado' ou 'QR Code bloqueado'
        const isBlocked = tag.status === 'Bloqueado' || tag.status === 'Perdido' || (tag as any).blocked || (tag as any).isBlocked || user.qrCodeBlocked;
        if (isBlocked) {
          this.registerInvalidAttempt(`Tentativa NFC de acesso com tag/user bloqueada (UID: ${tag.uid})`);
          return { success: false, error: isAdmUser ? 'QR Code bloqueado' : 'Crachá bloqueado' };
        }

        // 4. Se estiver inativo: 'Crachá inativo' ou 'QR Code inativo'
        const isInactive = (tag.status as string) === 'Inativo' || tag.status === 'Livre';
        if (isInactive) {
          this.registerInvalidAttempt(`Tentativa NFC de acesso com tag inativa (UID: ${tag.uid})`);
          return { success: false, error: isAdmUser ? 'QR Code inativo' : 'Crachá inativo' };
        }

        if (tag.status === 'Quarentena') {
          this.registerInvalidAttempt(`Tentativa NFC em quarentena detectada (UID: ${tag.uid})`);
          return { success: false, error: 'Esta credencial está retida em período de quarentena de segurança.' };
        }

        if (tag.dataExpiracao && now > tag.dataExpiracao) {
          this.registerInvalidAttempt(`Tentativa NFC com tag expirada (UID: ${tag.uid})`);
          return { success: false, error: 'Esta credencial NFC expirou e precisa ser revalidada.' };
        }

        // 5. Se o usuário estiver inativo: 'Usuário ADM inativo' ou 'Usuário inativo'
        if (user.status !== 'ativo') {
          this.registerInvalidAttempt(`Tentativa NFC com colaborador inativo: ${user.fullName} (${user.login})`);
          return { success: false, error: isAdmUser ? 'Usuário ADM inativo' : 'Usuário inativo' };
        }

        // Context checks
        const contextError = this.validateContextRules(user, tag, context, options);
        if (contextError) {
          this.registerInvalidAttempt(`Incompatibilidade de contexto NFC [${context}]: ${contextError}`);
          return { success: false, error: contextError };
        }

        // Reset invalid counts on successful validation
        this.invalidAttemptsCount = 0;
        return { success: true, user, tag };
      }

      // ------------------------------------
      // CASE B: QR Code Credential Flow (Badge QR or standard string)
      // ------------------------------------
      else {
        let targetBadge = (storeState.badges || []).find(b => b.codigoCracha === rawCredentialValue);
        let targetUser = null;

        if (targetBadge) {
          if (targetBadge.usuarioVinculado) {
            targetUser = users.find(u => u.id === targetBadge.usuarioVinculado);
          }
        } else {
          targetUser = users.find(u => u.qrCodeToken === rawCredentialValue || u.externalQrId === rawCredentialValue);
          if (targetUser) {
            targetBadge = (storeState.badges || []).find(b => b.usuarioVinculado === targetUser.id || b.id === targetUser.badgeId);
          } else {
            // Fallback parse complex json payload
            try {
              if (rawCredentialValue && rawCredentialValue.trim().startsWith('{')) {
                const parsed = JSON.parse(rawCredentialValue);
                if (parsed && typeof parsed === 'object') {
                  const uId = parsed.userId || parsed.id;
                  const tokId = parsed.tokenId || parsed.token;
                  targetUser = users.find(u => u.id === uId && u.qrCodeToken === tokId);
                  if (targetUser) {
                    targetBadge = (storeState.badges || []).find(b => b.id === targetUser.badgeId || b.usuarioVinculado === targetUser.id);
                  }
                }
              }
            } catch (_) {}
          }
        }

        // 1. Se não encontrar nenhuma credencial na base: 'QR Code não cadastrado'
        if (!targetBadge && !targetUser) {
          this.registerInvalidAttempt(`Tentativa QR Code inválida. Token ou payload desconhecido.`);
          return { success: false, error: 'QR Code não cadastrado' };
        }

        const isAdm = (targetUser && (targetUser.roleId === 'admin' || targetUser.isMasterAdmin || targetUser.isOwner || targetUser.login === 'admin')) || (targetBadge && (targetBadge as any).tipoCredencial === 'ADM');

        // 2. Verificar vínculo: se não tiver usuário válido
        const linkedUserId = targetBadge ? targetBadge.usuarioVinculado : (targetUser ? targetUser.id : null);
        const matchedUser = targetUser || (linkedUserId ? users.find(u => u.id === linkedUserId) : null);

        if (!linkedUserId || !matchedUser || (targetBadge && targetBadge.status === 'Livre')) {
          this.registerInvalidAttempt(`Tentativa QR Code com crachá sem usuário válido: ${rawCredentialValue}`);
          return { success: false, error: isAdm ? 'QR Code sem vínculo com ADM' : 'Crachá sem usuário vinculado' };
        }

        // 3. Se o QR estiver bloqueado: 'Crachá bloqueado' ou 'QR Code bloqueado'
        const isQRBlocked = (targetBadge && (isBadgeBlocked(targetBadge) || targetBadge.status === 'Bloqueado' || targetBadge.status === 'Perdido')) || matchedUser.qrCodeBlocked;
        if (isQRBlocked) {
          this.registerInvalidAttempt(`Tentativa QR Code bloqueada por bloqueio: ${rawCredentialValue}`);
          return { success: false, error: isAdm ? 'QR Code bloqueado' : 'Crachá bloqueado' };
        }

        // 4. Se o QR estiver inativo: 'Crachá inativo' ou 'QR Code inativo'
        const isQRInactive = targetBadge && ((targetBadge.status as string) === 'Inativo' || targetBadge.status === 'Livre');
        if (isQRInactive) {
          this.registerInvalidAttempt(`Tentativa QR Code bloqueada por inatividade: ${rawCredentialValue}`);
          return { success: false, error: isAdm ? 'QR Code inativo' : 'Crachá inativo' };
        }

        // 5. Se o usuário estiver inativo: 'Usuário ADM inativo' ou 'Usuário inativo'
        if (matchedUser.status !== 'ativo') {
          this.registerInvalidAttempt(`Tentativa QR Code com supervisor/colaborador inativo: ${matchedUser.fullName}`);
          return { success: false, error: isAdm ? 'Usuário ADM inativo' : 'Usuário inativo' };
        }

        // Context checks
        const contextError = this.validateContextRules(matchedUser, null, context, options);
        if (contextError) {
          this.registerInvalidAttempt(`Incompatibilidade de contexto QR [${context}]: ${contextError}`);
          return { success: false, error: contextError };
        }

        this.invalidAttemptsCount = 0;
        return { success: true, user: matchedUser };
      }
    } finally {
      this.isProcessing = false;
    }
  }

  /**
   * Specific rules relative to the current task or action context.
   */
  private validateContextRules(
    user: any,
    tag: any | null,
    context: CredentialContext,
    options?: { targetTerminalId?: string; requiredRole?: string }
  ): string | null {
    const storeState = useStore.getState();

    // Context A: LOGIN OPERACIONAL
    if (context === 'LOGIN') {
      // Prevent Master level tags from standard oper login
      if (tag && tag.tipoCredencial === 'MASTER') {
        return 'Esta credencial master requer validação de autorização dedicada, não de terminal geral.';
      }
    }

    // Context B: MASTER AUTHORIZATION (Permissions override)
    if (context === 'MASTER_AUTH') {
      const isMasterRole = user.roleId === 'master' || user.isMasterAdmin || user.roleId === 'supervisor' || (tag && tag.tipoCredencial === 'MASTER');
      const isAdmRole = user.roleId === 'admin' || user.login === 'admin' || (tag && tag.tipoCredencial === 'ADM');
      
      if (!isMasterRole && !isAdmRole) {
        return 'Chave Rejeitada: Nível de permissão insuficiente (Supervisor ou Master exigido).';
      }
    }

    // Context C: ADM ACCESS (Security & Central Panels)
    if (context === 'ADM_ACCESS') {
      const isAdm = user.roleId === 'admin' || user.isOwner || user.isMasterAdmin || user.login === 'admin' || (tag && tag.tipoCredencial === 'ADM');
      if (!isAdm) {
        return 'Acesso Administrativo Rejeitado: Esta seção é exclusiva para Administradores do Sistema.';
      }
    }

    // Context D: TERMINAL VINCULADO
    if (context === 'TERMINAL' && options?.targetTerminalId) {
      // Let store do its terminal validation checks
      const terminalCheck = storeState.validateTerminalAccess(options.targetTerminalId, user.id);
      if (!terminalCheck.success) {
        return terminalCheck.error || 'Acesso negado para este colaborador neste terminal.';
      }
    }

    // Context E: CHECK ROLE
    if (options?.requiredRole) {
      if (user.roleId !== options.requiredRole) {
        return `Acesso negado: Requer nível hierárquico correspondente a ${options.requiredRole}.`;
      }
    }

    return null;
  }

  /**
   * Registry/Accounting of successive bad reads for security throttling.
   */
  private registerInvalidAttempt(errorMessage: string) {
    this.invalidAttemptsCount++;
    console.warn(`[Security Hardening] Tentativa falha contabilizada (#${this.invalidAttemptsCount}): ${errorMessage}`);
    
    // Log in database/active store
    this.logSecurityAudit('Leitura Rejeitada', errorMessage, 'erro');

    if (this.invalidAttemptsCount >= 3) {
      const lockDuration = 1000 * (this.invalidAttemptsCount === 3 ? 10 : 30); // 10s or 30s lockout
      this.lockoutUntil = Date.now() + lockDuration;
      this.logSecurityAudit(
        'Lockout por Intrusão',
        `Acesso temporariamente bloqueado por exceder 3 tentativas seguidas sem sucesso.`,
        'bloqueado'
      );
    }
  }

  /**
   * Central Audit log bridge.
   */
  private logSecurityAudit(actionSubject: string, desc: string, stateStatus: 'sucesso' | 'erro' | 'alerta' | 'bloqueado') {
    try {
      const storeState = useStore.getState();
      storeState.logAction({
        module: 'Segurança NFC/QR',
        actionType: 'login',
        action: actionSubject,
        description: desc,
        status: stateStatus === 'bloqueado' ? 'erro' : stateStatus === 'alerta' ? 'bloqueado' : stateStatus
      });
      storeState.addActivity(`Policiamento de Credenciais: ${desc}`, 'alert', 'Crachá');
    } catch (e) {
      console.error('[Security Hardening audit failure]: ', e);
    }
  }
}

export const credentialValidationService = new CredentialValidationService();
