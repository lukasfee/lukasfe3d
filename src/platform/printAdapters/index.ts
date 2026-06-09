export type PlatformType = 'desktop-electron' | 'web-browser';

/**
 * Detects the runtime environment seamlessly.
 */
export function detectPlatform(): PlatformType {
  if (typeof window !== 'undefined' && 'electron' in window) {
    return 'desktop-electron';
  }
  
  return 'web-browser';
}
