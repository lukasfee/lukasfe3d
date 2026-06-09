import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import { perfLogger } from './utils/perfLogger';
import { bootTracker } from './utils/bootTracker';

// Quietly suppress benign Vite HMR, WebSocket/network-related disconnect errors, and TensorFlow/MediaPipe WebAssembly outputs in sandboxed dev environment
if (typeof window !== 'undefined') {
  const ignoreError = (msg: any) => {
    if (!msg) return false;
    try {
      const str = (typeof msg === 'string' ? msg : (msg.message || msg.reason || String(msg))).toLowerCase();
      return (
        str.includes('websocket') ||
        str.includes('socket') ||
        str.includes('vite') ||
        str.includes('hmr') ||
        str.includes('fechado sem') ||
        str.includes('fechado sem ter sido') ||
        str.includes('closed before') ||
        str.includes('connection established') ||
        str.includes('networkerror') ||
        str.includes('failed to fetch') ||
        str.includes('xnnpack') ||
        str.includes('tensorflow') ||
        str.includes('mediapipe')
      );
    } catch (e) {
      return false;
    }
  };

  // Prevent TensorFlow Lite or MediaPipe fallback warnings/infos from polluting stdout/stderr as false positives
  const originalLog = console.log;
  const originalWarn = console.warn;
  const originalError = console.error;

  const shouldFilterLog = (args: any[]) => {
    if (!args || args.length === 0) return false;
    for (const arg of args) {
      if (typeof arg === 'string') {
        const lower = arg.toLowerCase();
        if (
          lower.includes('xnnpack') ||
          lower.includes('tensorflow') ||
          lower.includes('mediapipe') && lower.includes('delegate')
        ) {
          return true;
        }
      }
    }
    return false;
  };

  console.log = (...args: any[]) => {
    if (shouldFilterLog(args)) return;
    originalLog.apply(console, args);
  };

  console.warn = (...args: any[]) => {
    if (shouldFilterLog(args)) return;
    originalWarn.apply(console, args);
  };

  console.error = (...args: any[]) => {
    if (args.some(arg => ignoreError(arg))) return;
    if (shouldFilterLog(args)) return;
    originalError.apply(console, args);
  };

  window.addEventListener('unhandledrejection', (event) => {
    const reason = event.reason;
    if (ignoreError(reason)) {
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
    }
  }, true);

  window.addEventListener('error', (event) => {
    const message = event.message || event.error;
    if (ignoreError(message)) {
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
    }
  }, true);
}

// Initialize and trace APP_START immediately
bootTracker.trackStep('APP_START');

const isElectron = typeof window !== 'undefined' && ('electron' in window || navigator.userAgent.includes('Electron'));

if (isElectron) {
  bootTracker.trackStep('ELECTRON_READY');
}

// Start measuring total boot time immediately at entrypoint
perfLogger.start('Tempo Total de Boot');
perfLogger.start('Tempo de Carregamento dos Dados Locais');

// Central security guard: Disable window.print() in Desktop/Electron to prevent it from capturing the main dashboard/window interface.
if (isElectron) {
  window.print = () => {
    console.error('[PRINT_SECURITY] window.print() execution is strictly prohibited in Electron/Desktop to prevent capturing the main window interface.');
  };
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
