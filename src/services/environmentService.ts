/**
 * Nexa ERP - Environment Service
 * Defines and checks whether the app is running in DEV_MODE or PRODUCTION_MODE.
 * Standardizes platform detection across the web app, Electron bridge, and Capacitor Android client.
 */

export type PlatformType = 'web' | 'desktop';

class EnvironmentService {
  private devModeKey = 'LUKASFE_NFC_DEV_MODE';

  /**
   * Detects the runtime platform.
   */
  public detectPlatform(): PlatformType {
    if (typeof window === 'undefined') {
      return 'web';
    }

    // 1. Electron bridge detection
    const electronAPI = (window as any).electron;
    const hasElectronBridge = !!electronAPI && (
      'print' in electronAPI || 
      'onNfcTagRead' in electronAPI
    );
    const userAgent = navigator.userAgent.toLowerCase();
    if (hasElectronBridge || userAgent.includes('electron')) {
      return 'desktop';
    }

    return 'web';
  }

  /**
   * Returns true if the system operates under DEV_MODE.
   * Default is true in development environments, but can be manually overridden/toggled.
   */
  public isDevMode(): boolean {
    if (typeof window === 'undefined') {
      return false;
    }

    // Rule: In production builds, localStorage.getItem('LUKASFE_NFC_DEV_MODE') must be ignored.
    const isProdBuild = !!(import.meta as any).env?.PROD;
    if (isProdBuild) {
      return false;
    }

    // Outside production builds, we can allow localStorage override if it exists.
    const stored = localStorage.getItem(this.devModeKey);
    if (stored !== null) {
      return stored === 'true';
    }

    // Rule: DEV_MODE should only be true if import.meta.env.DEV === true OR the host is localhost or 127.0.0.1.
    const isLocalhost = typeof window !== 'undefined' && 
      (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1' || window.location.hostname === '[::1]');

    try {
      return !!(import.meta as any).env?.DEV || isLocalhost;
    } catch {
      return isLocalhost;
    }
  }

  /**
   * Set the dev mode toggle manually.
   */
  public setDevMode(active: boolean): void {
    if (typeof window === 'undefined') return;
    
    // Do not allow setDevMode to override in production
    const isProdBuild = !!(import.meta as any).env?.PROD;
    if (isProdBuild) {
      console.warn(`[Environment] Cannot set DEV_MODE override in production builds.`);
      return;
    }

    localStorage.setItem(this.devModeKey, active ? 'true' : 'false');
    console.log(`[Environment] DEV_MODE manual override set to: ${active}`);
  }

  /**
   * Returns true if the system operates under PRODUCTION_MODE.
   */
  public isProductionMode(): boolean {
    return !this.isDevMode();
  }

  /**
   * Returns true if the app is running in Test/Homologation mode.
   */
  public isTestEnvironment(): boolean {
    if (typeof window !== 'undefined') {
      const gEnv = (import.meta as any).env?.VITE_APP_ENV;
      if (gEnv === 'teste') return true;
      if ((window as any).electron?.isTestEnvironment === true) {
        return true;
      }
    }
    return false;
  }

  /**
   * Safe check for restricting development/simulation panels.
   * Ensures that normal employees do not see sandbox even if DEV_MODE defaults to true.
   * @param currentUserRole Role of current authenticated user if applicable
   */
  public shouldShowSimulators(currentUserRole?: string | null, currentUserLogin?: string | null): boolean {
    if (this.isProductionMode()) {
      return false;
    }

    // If we've set a constraint: only if we are in DEV_MODE, and optionally check user role
    // Possibilidade futura de ativar DEV somente para ADM
    if (currentUserRole && currentUserLogin) {
      const isPrivileged = currentUserRole === 'admin' || 
                           currentUserRole === 'master' || 
                           currentUserLogin === 'admin';
      return isPrivileged;
    }

    return true;
  }
}

export const environmentService = new EnvironmentService();
