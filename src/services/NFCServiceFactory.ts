import { environmentService } from './environmentService';

export interface NFCService {
  isSupported(): Promise<boolean>;
  isEnabled(): Promise<boolean>;
  startScanning(onTagRead: (uid: string) => void, onError?: (err: string) => void): Promise<void>;
  stopScanning(): Promise<void>;
  getPlatformName(): string;
}

/**
 * Service for Electron background IPC NFC monitoring.
 */
class ElectronNFCService implements NFCService {
  private activeListener: ((uid: string) => void) | null = null;
  private unsubscribeFn: (() => void) | null = null;

  public getPlatformName(): string {
    return 'Electron (Desktop)';
  }

  public async isSupported(): Promise<boolean> {
    const electronAPI = (window as any).electron;
    return !!electronAPI && typeof electronAPI.onNfcTagRead === 'function';
  }

  public async isEnabled(): Promise<boolean> {
    return this.isSupported();
  }

  public async startScanning(onTagRead: (uid: string) => void, onError?: (err: string) => void): Promise<void> {
    await this.stopScanning();
    console.log('[NFC/Electron] Starting native background IPC monitor.');
    
    const electronAPI = (window as any).electron;
    if (!electronAPI || typeof electronAPI.onNfcTagRead !== 'function') {
      if (onError) onError('API Electron inacessível ou leitor físico ausente.');
      return;
    }

    this.activeListener = onTagRead;
    // Electron's onNfcTagRead typically returns a cleanup function
    const unsub = electronAPI.onNfcTagRead((uid: string) => {
      if (this.activeListener) {
        console.log(`[NFC/Electron] Tag detected via IPC: ${uid}`);
        this.activeListener(uid);
      }
    });

    if (typeof unsub === 'function') {
      this.unsubscribeFn = unsub;
    }
  }

  public async stopScanning(): Promise<void> {
    console.log('[NFC/Electron] Halting active background monitor and cleaning up listeners.');
    if (this.unsubscribeFn) {
      try {
        this.unsubscribeFn();
      } catch (err) {
        console.warn('[NFC/Electron] Error during unsubscribe cleanup:', err);
      }
      this.unsubscribeFn = null;
    }
    this.activeListener = null;
  }
}

/**
 * Service for standard Web platform (WebNFC Chrome & Keyboard Wedge keyboard listeners).
 */
class WebFallbackService implements NFCService {
  private activeCallback: ((uid: string) => void) | null = null;
  private readerInstance: any = null;
  private abortController: AbortController | null = null;
  
  // Keyboard Wedge (Simulate hardware keyboard emulator) integration
  private buffer = '';
  private lastKeyTime = 0;

  public getPlatformName(): string {
    return 'Web Platform (WebNFC / Wedge)';
  }

  public async isSupported(): Promise<boolean> {
    // Checking standard NDEFReader Chrome service
    return 'NDEFReader' in window;
  }

  public async isEnabled(): Promise<boolean> {
    return this.isSupported();
  }

  public async startScanning(onTagRead: (uid: string) => void, onError?: (err: string) => void): Promise<void> {
    await this.stopScanning();
    this.activeCallback = onTagRead;

    // 1. Hook Keyboard Wedge (Universal Reader Support)
    window.addEventListener('keydown', this.handleKeyboardWedge);

    // 2. Attempt WebNFC API if supported
    if ('NDEFReader' in window) {
      try {
        console.log('[NFC/Web] Activating Chrome WebNFC reader scan.');
        this.abortController = new AbortController();
        const reader = new (window as any).NDEFReader();
        this.readerInstance = reader;
        
        await reader.scan({ signal: this.abortController.signal });
        
        reader.addEventListener('reading', (event: any) => {
          const serial = event.serialNumber;
          console.log(`[NFC/Web] Tag scan detected via WebNFC: ${serial}`);
          if (serial && this.activeCallback) {
            this.activeCallback(serial.toUpperCase());
          }
        });

        reader.addEventListener('readingerror', () => {
          console.warn('[NFC/Web] WebNFC reading error. Try repositioning tag.');
          if (onError) onError('Falha física na leitura da tag. Re-aproxime.');
        });

      } catch (err: any) {
        // Fallback gracefully without throwing. Web sandbox may limit NFC permissions.
        console.warn('[NFC/Web] WebNFC scan error or permission denied (expected inside sandbox iframe):', err);
      }
    } else {
      console.log('[NFC/Web] Standard keyboard wedge input tracking initialized.');
    }
  }

  public async stopScanning(): Promise<void> {
    window.removeEventListener('keydown', this.handleKeyboardWedge);
    this.buffer = '';

    if (this.abortController) {
      try {
        this.abortController.abort();
      } catch (err) {
        // Safe discard
      }
      this.abortController = null;
    }
    this.readerInstance = null;
    this.activeCallback = null;
    console.log('[NFC/Web] Web-wedge scan elements stopped and released.');
  }

  /**
   * Keyboard Wedge input handler.
   * Recognizes swift strings typed by an standard physical reader.
   */
  private handleKeyboardWedge = (e: KeyboardEvent) => {
    // If targeted, ignore wedge actions from editing scopes
    const activeEl = document.activeElement;
    if (activeEl && (
      activeEl.tagName === 'INPUT' || 
      activeEl.tagName === 'TEXTAREA' || 
      activeEl.getAttribute('contenteditable') === 'true'
    )) {
      return;
    }

    const now = Date.now();
    // Hardware wedge readers type hex characters extremely fast (<50ms between strokes)
    if (now - this.lastKeyTime > 80) {
      this.buffer = '';
    }
    this.lastKeyTime = now;

    if (e.key === 'Enter') {
      const formatted = this.buffer.trim().toUpperCase();
      // Physical NFC readers type standard HEX with length of 8, 14 or 16 chars
      if (formatted && formatted.length >= 8 && /^[0-9A-F:]+$/.test(formatted)) {
        e.preventDefault();
        console.log(`[NFC/Web] Input decoded from Keyboard Wedge wedge buffer: ${formatted}`);
        if (this.activeCallback) {
          this.activeCallback(formatted);
        }
      }
      this.buffer = '';
      return;
    }

    if (e.key.length === 1) {
      this.buffer += e.key;
    }
  };
}

class NFCServiceFactory {
  private electronService = new ElectronNFCService();
  private webService = new WebFallbackService();

  /**
   * Detect layout and load correct provider.
   */
  public getService(): NFCService {
    const platform = environmentService.detectPlatform();
    
    switch (platform) {
      case 'desktop':
        return this.electronService;
      default:
        return this.webService;
    }
  }
}

export const nfcServiceFactory = new NFCServiceFactory();
