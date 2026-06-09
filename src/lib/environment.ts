
/**
 * Detects if the application is running in a Desktop (Electron) environment
 * or in a standard Web Browser.
 */
export const isDesktop = (): boolean => {
  // Check for common Electron indicators
  const isElectron = typeof window !== 'undefined' && 
    (window as any).process && 
    (window as any).process.type === 'renderer';
    
  // Check for specialized bridge (usually injected by preload script)
  const hasElectronBridge = typeof window !== 'undefined' && !!(window as any).electron;
  
  // Also check User Agent for more reliability
  const isDesktopUA = typeof navigator !== 'undefined' && 
    navigator.userAgent.toLowerCase().includes('electron');

  return !!(isElectron || hasElectronBridge || isDesktopUA);
};

/**
 * Interface for the Electron bridge if available
 */
export interface ElectronBridge {
  checkFileExists: (filePath: string) => Promise<{ success: boolean }>;
  getLocalIP: () => Promise<string>;
  startLocalServer: (port: number) => Promise<{ success: boolean; port: number; ip: string }>;
  getAppVersion: () => Promise<string>;
  getSystemPrinters: () => Promise<{ success: boolean; printers?: any[]; error?: string }>;
  listPrinters?: () => Promise<{ success: boolean; printers?: any[]; error?: string }>;
  getPrinterMediaOptions?: (printerName: string) => Promise<{ success: boolean; mediaOptions?: string[]; error?: string }>;
  checkForUpdates: () => Promise<any>;
  restartApp: () => Promise<void>;
  generatePairingPin: () => Promise<{ pin: string; expiresAt: number }>;
  getPairingPin: () => Promise<{ pin: string | null; expiresAt: number }>;
  getLocalDevices: () => Promise<any[]>;
  setDeviceStatus: (deviceId: string, action: string, token?: string, name?: string) => Promise<{ success: boolean; devices: any[] }>;
  getPairingAuditLogs: () => Promise<any[]>;
  getPhysicalPrintErrors: () => Promise<any[]>;
  clearPhysicalPrintErrors: () => Promise<{ success: boolean; error?: string }>;
  clearPairingAuditLogs: () => Promise<{ success: boolean }>;
  onNewPairingRequest: (callback: (device: any) => void) => (() => void);
  onNewPairingAudit: (callback: (audit: any) => void) => (() => void);
  onSyncIncomingMutations: (callback: (data: any[]) => void) => (() => void);
  onUpdateStatus: (callback: (data: { status: string; message: string; version?: string; error?: string }) => void) => (() => void);
  onUpdateProgress: (callback: (data: { percent: number; bytesPerSecond: number; total: number; transferred: number }) => void) => (() => void);
}

export const getElectronBridge = (): ElectronBridge | null => {
  if (isDesktop()) {
    return (window as any).electron || null;
  }
  return null;
};
