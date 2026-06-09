const { app, BrowserWindow, ipcMain, dialog, shell, session, nativeImage, screen } = require('electron');
const path = require('path');
const os = require('os');
const fs = require('fs');
const { spawn } = require('child_process');
const { autoUpdater } = require('electron-updater');
const isDev = !app.isPackaged;

try {
  require('dotenv').config();
} catch (dotenvErr) {
  console.warn('[Dotenv] Falha ao carregar dotenv no Electron main process:', dotenvErr);
}

const DB_FILENAME = 'nexa-local.db';

// Request single instance lock
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  console.log('[SINGLE-INSTANCE] Outra instancia ja esta rodando. Encerrando esta...');
  app.exit(0);
} else {
  app.on('second-instance', (event, commandLine, workingDirectory) => {
    console.log('[SINGLE-INSTANCE] Tentativa de abrir outra instancia detectada. Focando janela principal...');
    if (mainWindow) {
      if (mainWindow.isMinimized()) {
        mainWindow.restore();
      }
      mainWindow.focus();
    }
  });
}

// Force the app name and userData directories to be absolutely stable across all updates, environments and shortcuts
const isTestEnv = app.name === 'Nexa ERP Teste' || process.env.VITE_APP_ENV === 'teste';

if (app.isPackaged && process.env.VITE_APP_ENV === 'teste') {
  console.error('[CRITICAL-GUARD] ERRO: VITE_APP_ENV está definido como "teste" em um build de produção empacotado!');
  try {
    dialog.showErrorBox(
      'Erro Fatal de Inicialização',
      'Detectado VITE_APP_ENV=teste em build de produção empacotado.\nA inicialização foi abortada para garantir a segurança dos dados e evitar o uso de diretórios de teste na produção.'
    );
  } catch (dialogErr) {
    console.error('[CRITICAL-GUARD] Não foi possível exibir o diálogo de erro:', dialogErr);
  }
  app.exit(1);
}

if (isTestEnv) {
  app.name = 'Nexa ERP Teste';
  const customUserDataPath = path.join(app.getPath('appData'), 'NexaERP-Teste');
  app.setPath('userData', customUserDataPath);
  console.log('[ENV] TEST/HOMOLOGATION detected. Operating isolated userData:', customUserDataPath);
} else {
  app.name = 'Nexa ERP Industrial';
  const customUserDataPath = path.join(app.getPath('appData'), 'Nexa ERP Industrial');
  app.setPath('userData', customUserDataPath);
  console.log('[ENV] PRODUCTION detected. Operating official locked userData:', customUserDataPath);
}

const dbService = require('./database.cjs');
try {
  dbService.initDatabase(app.getPath('userData'));
} catch (dbErr) {
  console.error('[SQLite] Initialization failed in app start:', dbErr);
}

process.on('uncaughtException', (err) => {
  console.error('[FATAL][UNCAUGHT_EXCEPTION]', err);
});

process.on('unhandledRejection', (reason) => {
  console.error('[FATAL][UNHANDLED_REJECTION]', reason);
});

function getDebugDumpDir() {
  const dir = path.join(app.getPath('userData'), 'debug_dumps');
  try {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  } catch (err) {
    console.error('[DEBUG-DUMP] Failed to create DEBUG_DUMP_DIR:', err);
  }
  return dir;
}

/**
 * Resolve as dimensões físicas reais de um papel a partir de qualquer
 * combinação de driverPaperName, paperWidthMm e paperHeightMm.
 * Resiliente a nomes proprietários, dimensões numéricas, nomes ISO e ausência de dados.
 * Retorna sempre { widthMicrons, heightMicrons, isRoll }
 */
function resolvePhysicalPaperDimensions({ driverPaperName, paperWidthMm, paperHeightMm }) {
  // 1. Se já temos dimensões numéricas válidas vindas do renderer, usar diretamente
  const hasValidWidth = typeof paperWidthMm === 'number' && paperWidthMm > 0;
  const hasValidHeight = typeof paperHeightMm === 'number' && paperHeightMm > 0;
  const isRollFromRenderer = paperHeightMm === 'auto' || paperHeightMm === null || paperHeightMm === undefined;

  if (hasValidWidth && hasValidHeight) {
    return {
      widthMicrons: Math.round(paperWidthMm * 1000),
      heightMicrons: Math.round(paperHeightMm * 1000),
      isRoll: false
    };
  }

  if (hasValidWidth && isRollFromRenderer) {
    return {
      widthMicrons: Math.round(paperWidthMm * 1000),
      heightMicrons: Math.round(500 * 1000), // 500mm — altura generosa, driver corta
      isRoll: true
    };
  }

  // 2. Tentar resolver pelo driverPaperName quando dimensões não vieram do renderer
  if (typeof driverPaperName === 'string' && driverPaperName.trim().length > 0) {
    const name = driverPaperName.toLowerCase().replace(/\s+/g, '');

    // 2a. Nomes ISO padrão
    if (name === 'a4' || name.includes('210x297') || name.includes('210mm')) return { widthMicrons: 210000, heightMicrons: 297000, isRoll: false };
    if (name === 'a5' || name.includes('148x210')) return { widthMicrons: 148000, heightMicrons: 210000, isRoll: false };
    if (name === 'a6' || name.includes('105x148')) return { widthMicrons: 105000, heightMicrons: 148000, isRoll: false };
    if (name === 'a3' || name.includes('297x420')) return { widthMicrons: 297000, heightMicrons: 420000, isRoll: false };
    if (name === 'letter') return { widthMicrons: 215900, heightMicrons: 279400, isRoll: false };
    if (name === 'legal') return { widthMicrons: 215900, heightMicrons: 355600, isRoll: false };

    // 2b. Formatos térmicos / bobinas (várias nomenclaturas de fabricantes)
    if (name.includes('80mm') || name.includes('bobina80') || name.includes('roll80') || name.includes('rolo80') || name === 't20' || name.includes('80x')) {
      return { widthMicrons: 80000, heightMicrons: 500000, isRoll: true };
    }
    if (name.includes('58mm') || name.includes('bobina58') || name.includes('roll58') || name.includes('rolo58') || name.includes('58x')) {
      return { widthMicrons: 58000, heightMicrons: 500000, isRoll: true };
    }
    if (name.includes('76mm') || name.includes('roll76')) {
      return { widthMicrons: 76000, heightMicrons: 500000, isRoll: true };
    }

    // 2c. Formatos de etiqueta conhecidos
    if (name.includes('10x15') || name.includes('4x6') || name.includes('100x150')) {
      return { widthMicrons: 101600, heightMicrons: 152400, isRoll: false };
    }
    if (name.includes('40x30') || name.includes('30x40')) {
      return { widthMicrons: 40000, heightMicrons: 30000, isRoll: false };
    }
    if (name.includes('50x80') || name.includes('80x50')) {
      return { widthMicrons: 50000, heightMicrons: 80000, isRoll: false };
    }
    if (name.includes('58x80') || name.includes('80x58')) {
      return { widthMicrons: 58000, heightMicrons: 80000, isRoll: false };
    }

    // 2d. Parsing genérico de dimensões numéricas: "105 x 148", "105x148mm", "10,5x14,8cm"
    const cleanStr = name.replace(/,/g, '.');
    const dimRegex = /(\d+(?:\.\d+)?)\s*(?:mm|cm)?\s*(?:[x*_×]|by)\s*(\d+(?:\.\d+)?)\s*(?:mm|cm)?/i;
    const match = dimRegex.exec(cleanStr);
    if (match) {
      let w = parseFloat(match[1]);
      let h = parseFloat(match[2]);
      // Detectar se é cm: unidade explicita OU ambos os valores < 30 sem "mm" na string
      const hasCm = cleanStr.includes('cm');
      const hasMm = cleanStr.includes('mm');
      const likelyCm = hasCm || (!hasMm && w < 30 && h < 30);
      if (likelyCm) { w *= 10; h *= 10; }
      // Detectar bobina: altura muito maior que largura e largura <= 120mm
      const isLikelyRoll = w <= 120 && h >= w * 2.5;
      return {
        widthMicrons: Math.round(w * 1000),
        heightMicrons: isLikelyRoll ? Math.round(500 * 1000) : Math.round(h * 1000),
        isRoll: isLikelyRoll
      };
    }
  }

  // 3. Fallback absoluto — A4 para não travar a impressão
  console.warn('[PRINT] Não foi possível resolver dimensões de papel. Usando A4 como fallback.', { driverPaperName, paperWidthMm, paperHeightMm });
  return { widthMicrons: 210000, heightMicrons: 297000, isRoll: false };
}

function rotateFileIfNeeded(filePath, maxSizeBytes = 1000 * 1024, maxBackups = 5) {
  try {
    if (!fs.existsSync(filePath)) return;
    const stats = fs.statSync(filePath);
    if (stats.size < maxSizeBytes) return;

    // Rotate backups! Slide i to i+1
    for (let i = maxBackups - 1; i >= 1; i--) {
      const source = filePath + '.' + i;
      const target = filePath + '.' + (i + 1);
      if (fs.existsSync(source)) {
        try {
          fs.renameSync(source, target);
        } catch (e) {
          // ignore rename collisions
        }
      }
    }
    
    // Rename current active file to file.1
    const backup1 = filePath + '.1';
    fs.renameSync(filePath, backup1);
    console.log(`[LOG-ROTATOR] Rotated ${filePath} to ${backup1} because it exceeded ${maxSizeBytes} bytes.`);
  } catch (err) {
    console.error('[LOG-ROTATOR] Error rotating file:', err);
  }
}

let mainWindow = null;
let forceQuit = false;
let kioskWindow = null;
let customerDisplayWindow = null;
let totemControlWindow = null;
let isTotemSecondScreenLocked = false;
let lockedDisplayId = null;
let lockedBounds = null;
let localHttpServer = null;
let localWss = null;
const activeWsClients = new Set();

// Configure auto updater
function setupAutoUpdater(win) {
  if (isDev) return;

  autoUpdater.on('checking-for-update', () => {
    win.webContents.send('update-status', { status: 'checking', message: 'Verificando atualizações...' });
  });
  
  autoUpdater.on('update-available', (info) => {
    win.webContents.send('update-status', { 
      status: 'available', 
      message: 'Nova atualização disponível!', 
      version: info.version 
    });
  });
  
  autoUpdater.on('update-not-available', (info) => {
    win.webContents.send('update-status', { 
      status: 'uptodate', 
      message: 'Sistema já está na versão mais recente.',
      version: info.version 
    });
  });
  
  autoUpdater.on('error', (err) => {
    win.webContents.send('update-status', { 
      status: 'error', 
      message: 'Erro ao verificar atualizações.', 
      error: err.message 
    });
  });
  
  autoUpdater.on('download-progress', (progressObj) => {
    win.webContents.send('update-progress', {
      percent: progressObj.percent,
      bytesPerSecond: progressObj.bytesPerSecond,
      total: progressObj.total,
      transferred: progressObj.transferred
    });
  });
  
  autoUpdater.on('update-downloaded', (info) => {
    win.webContents.send('update-status', { 
      status: 'downloaded', 
      message: 'Atualização baixada e pronta para instalar!',
      version: info.version 
    });
  });

  autoUpdater.checkForUpdatesAndNotify().catch(err => {
    console.error('Error starting updater:', err);
  });
}

let isRelaunchingObj = false;

function saveEmergencyAndRelaunch() {
  if (isRelaunchingObj) return;
  isRelaunchingObj = true;
  console.log('[WATCHDOG] CRITICAL: Executing emergency DB capture and reloading renderer...');

  try {
    const userDataPath = app.getPath('userData');
    const backupsPath = path.join(userDataPath, 'backups');
    if (!fs.existsSync(backupsPath)) {
      fs.mkdirSync(backupsPath, { recursive: true });
    }
    const dbPath = path.join(userDataPath, DB_FILENAME);
    const emergencyDbPath = path.join(backupsPath, `snap_emergency_${Date.now()}.db`);
    
    if (fs.existsSync(dbPath)) {
      fs.copyFileSync(dbPath, emergencyDbPath);
      console.info('[WATCHDOG] Emergency DB clone successfully saved at:', emergencyDbPath);
    }
  } catch (err) {
    console.error('[WATCHDOG] Emergency snapshot creation failed:', err);
  }

  // Reload or recreate window safely
  try {
    if (mainWindow && !mainWindow.isDestroyed()) {
      console.log('[WATCHDOG] Re-booting renderer window via reload...');
      mainWindow.reload();
    } else {
      console.log('[WATCHDOG] Window destroyed. Relaunching main application...');
      app.relaunch();
      app.exit(0);
    }
  } catch (err) {
    console.error('[WATCHDOG] Re-load trigger failed:', err);
  } finally {
    setTimeout(() => {
      isRelaunchingObj = false;
    }, 15000);
  }
}

function initWatchdog(windowRef) {
  if (!windowRef) return;
  console.log('[WATCHDOG-INIT] Custom watchdog loaded.');

  windowRef.webContents.on('unresponsive', () => {
    console.error('[WATCHDOG] Event fired: WebContents is UNRESPONSIVE!');
    saveEmergencyAndRelaunch();
  });

  windowRef.webContents.on('render-process-gone', (event, details) => {
    console.error('[WATCHDOG] Event fired: Render process GONE!', details);
    saveEmergencyAndRelaunch();
  });

  const timer = setInterval(() => {
    if (!windowRef || windowRef.isDestroyed()) return;

    // RAM check
    try {
      const metrics = app.getAppMetrics();
      const rendererPid = windowRef.webContents.getOSProcessId();
      for (const m of metrics) {
        if (m.pid === rendererPid || m.type === 'Renderer') {
          const sizeMB = Math.round(m.memory.workingSetSize / 1024);
          if (sizeMB > 1200) { // Limit 1.2 GB
            console.warn(`[WATCHDOG-RAM] Renderer RAM usage at ${sizeMB} MB which exceeds 1.2 GB threshold. Restarting...`);
            saveEmergencyAndRelaunch();
            break;
          }
        }
      }
    } catch (err) {
      console.error('[WATCHDOG-RAM] Quick metrics check failed:', err);
    }

    // Ping check
    let responded = false;
    try {
      windowRef.webContents.send('watchdog-ping');
      const pingTimeout = setTimeout(() => {
        if (!responded && windowRef && !windowRef.isDestroyed()) {
          console.error('[WATCHDOG-PING] Ping timeout! Renderer did not acknowledge ping within 10s. Forcing reboot.');
          saveEmergencyAndRelaunch();
        }
      }, 10000);

      ipcMain.once('watchdog-pong', () => {
        responded = true;
        clearTimeout(pingTimeout);
      });
    } catch (_) {}

  }, 40000); // Checked every 40s

  if (timer.unref) timer.unref();
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.cjs')
    },
    title: "Nexa ERP Industrial",
    backgroundColor: '#000000',
    show: false
  });

  mainWindow.webContents.on('did-fail-load', (event, errorCode, errorDescription, validatedURL) => {
    console.error('[FATAL][DID_FAIL_LOAD]', { errorCode, errorDescription, validatedURL });
  });

  initWatchdog(mainWindow);

  mainWindow.webContents.on('did-create-window', (childWindow) => {
    childWindow.setMenu(null);
    childWindow.setAutoHideMenuBar(true);

    childWindow.on('close', (event) => {
      if (isTotemSecondScreenLocked) {
        event.preventDefault();
      }
    });

    childWindow.on('minimize', (event) => {
      if (isTotemSecondScreenLocked) {
        event.preventDefault();
        childWindow.restore();
      }
    });

    childWindow.on('maximize', (event) => {
      if (isTotemSecondScreenLocked) {
        event.preventDefault();
        childWindow.unmaximize();
      }
    });

    childWindow.on('will-move', (event, newBounds) => {
      if (isTotemSecondScreenLocked && lockedDisplayId) {
        const display = screen.getDisplayMatching(newBounds);
        if (display.id !== lockedDisplayId) {
          event.preventDefault();
        }
      }
    });

    childWindow.on('move', () => {
      if (isTotemSecondScreenLocked && lockedDisplayId && lockedBounds) {
        const display = screen.getDisplayMatching(childWindow.getBounds());
        if (display.id !== lockedDisplayId) {
          childWindow.setBounds(lockedBounds);
        }
      }
    });
  });

  mainWindow.webContents.on('dom-ready', () => {
    console.log('[DEBUG][DOM_READY] Main window DOM is fully loaded.');
  });

  if (isDev) {
    mainWindow.webContents.openDevTools();
  }

  if (isDev) {
    mainWindow.loadURL('http://localhost:3000');
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
  }

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
    setupAutoUpdater(mainWindow);
  });

  mainWindow.on('close', (e) => {
    if (forceQuit) {
      return;
    }
    e.preventDefault();
    console.log('[Electron-Close] Prevenindo fechamento para execução de snapshot final...');
    mainWindow.webContents.send('app-close-triggered');
    // Forçar fechamento por timeout caso a página trave (10s limite prático)
    setTimeout(() => {
      forceQuit = true;
      app.quit();
    }, 10000);
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  return mainWindow;
}

// IPC Handlers
ipcMain.handle('app:force-quit', () => {
  console.log('[Electron-Close] Renderer autorizou o quit forçado após rotinas de segurança.');
  forceQuit = true;
  app.quit();
});

ipcMain.on('get-env-mode', (event) => {
  event.returnValue = isTestEnv ? 'teste' : 'producao';
});

ipcMain.handle('get-app-version', () => {
  return app.getVersion();
});

ipcMain.handle('restart-app', () => {
  autoUpdater.quitAndInstall();
});

ipcMain.handle('check-for-updates', async () => {
  if (isDev) return { success: true, status: 'dev', message: 'Em modo de desenvolvimento' };
  
  return new Promise((resolve) => {
    let completed = false;
    
    const timeout = setTimeout(() => {
      if (!completed) {
        completed = true;
        cleanup();
        resolve({ success: false, error: 'Tempo limite esgotado ao verificar atualizações (15s).' });
      }
    }, 15000);

    const onUpdateAvailable = (info) => {
      if (!completed) {
        completed = true;
        cleanup();
        resolve({ success: true, updateAvailable: true, version: info.version });
      }
    };

    const onUpdateNotAvailable = (info) => {
      if (!completed) {
        completed = true;
        cleanup();
        resolve({ success: true, updateAvailable: false, version: info.version });
      }
    };

    const onError = (err) => {
      if (!completed) {
        completed = true;
        cleanup();
        resolve({ success: false, error: err.message || 'Erro desconhecido ao verificar atualizações.' });
      }
    };

    const cleanup = () => {
      clearTimeout(timeout);
      autoUpdater.removeListener('update-available', onUpdateAvailable);
      autoUpdater.removeListener('update-not-available', onUpdateNotAvailable);
      autoUpdater.removeListener('error', onError);
    };

    autoUpdater.once('update-available', onUpdateAvailable);
    autoUpdater.once('update-not-available', onUpdateNotAvailable);
    autoUpdater.once('error', onError);

    autoUpdater.checkForUpdates().catch(err => {
      if (!completed) {
        completed = true;
        cleanup();
        resolve({ success: false, error: err.message });
      }
    });
  });
});

ipcMain.handle('get-local-ip', async () => {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        return iface.address;
      }
    }
  }
  return '127.0.0.1';
});

ipcMain.handle('check-file-exists', async (event, filePath) => {
  try {
    const exists = fs.existsSync(filePath);
    return { success: exists };
  } catch (e) {
    return { success: false };
  }
});

ipcMain.handle('clear-debug-dumps', async () => {
  const dumpsDir = getDebugDumpDir();
  try {
    if (fs.existsSync(dumpsDir)) {
      const files = fs.readdirSync(dumpsDir);
      for (const file of files) {
        const filePath = path.join(dumpsDir, file);
        fs.unlinkSync(filePath);
      }
      console.log('[DEBUG-DUMP] All files inside debug_dumps cleared successfully.');
    }
    return { success: true };
  } catch (err) {
    console.error('[DEBUG-DUMP] Failed to clear debug dumps folder:', err);
    return { success: false, error: err.message };
  }
});

// Device pairing persistent variables
let currentPairingPin = null;
let currentPairingPinExpiresAt = 0;
let trustedDevices = null;
let pairingAuditLogs = null;
const pairingBruteForceTracker = {};

function loadTrustedDevices() {
  if (trustedDevices !== null) return;
  const trustedDevicesFilePath = path.join(app.getPath('userData'), 'trusted_devices.json');
  try {
    if (fs.existsSync(trustedDevicesFilePath)) {
      const data = fs.readFileSync(trustedDevicesFilePath, 'utf8');
      trustedDevices = JSON.parse(data);
    } else {
      trustedDevices = [];
    }
  } catch (err) {
    trustedDevices = [];
  }
}

function saveTrustedDevices() {
  if (trustedDevices === null) return;
  const trustedDevicesFilePath = path.join(app.getPath('userData'), 'trusted_devices.json');
  try {
    fs.writeFileSync(trustedDevicesFilePath, JSON.stringify(trustedDevices), 'utf8');
  } catch (err) {}
}

function loadPairingAudit() {
  if (pairingAuditLogs !== null) return;
  const auditFilePath = path.join(app.getPath('userData'), 'pairing_audit.json');
  try {
    if (fs.existsSync(auditFilePath)) {
      pairingAuditLogs = JSON.parse(fs.readFileSync(auditFilePath, 'utf8'));
    } else {
      pairingAuditLogs = [];
    }
  } catch (err) {
    pairingAuditLogs = [];
  }
}

function savePairingAudit() {
  if (pairingAuditLogs === null) return;
  const auditFilePath = path.join(app.getPath('userData'), 'pairing_audit.json');
  try {
    fs.writeFileSync(auditFilePath, JSON.stringify(pairingAuditLogs), 'utf8');
  } catch (err) {}
}

function addPairingAudit(action, description, details) {
  loadPairingAudit();
  const entry = {
    id: 'pa_' + Math.random().toString(36).substring(2, 9),
    timestamp: Date.now(),
    action,
    description,
    details
  };
  pairingAuditLogs.unshift(entry);
  if (pairingAuditLogs.length > 200) {
    pairingAuditLogs = pairingAuditLogs.slice(0, 200);
  }
  savePairingAudit();
  
  if (mainWindow) {
    mainWindow.webContents.send('new-pairing-audit', entry);
  }
}

let physicalPrintErrors = null;

function loadPhysicalPrintErrors() {
  if (physicalPrintErrors !== null) return;
  const filePath = path.join(app.getPath('userData'), 'physical_print_errors.json');
  try {
    if (fs.existsSync(filePath)) {
      physicalPrintErrors = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    } else {
      physicalPrintErrors = [];
    }
  } catch (err) {
    physicalPrintErrors = [];
  }
}

function savePhysicalPrintErrors() {
  if (physicalPrintErrors === null) return;
  const filePath = path.join(app.getPath('userData'), 'physical_print_errors.json');
  try {
    fs.writeFileSync(filePath, JSON.stringify(physicalPrintErrors), 'utf8');
  } catch (err) {}
}

function addPhysicalPrintError(printerName, documentName, paperSize, jobId, errorCode, errorMessage, raw) {
  loadPhysicalPrintErrors();
  const entry = {
    id: 'pe_' + Math.random().toString(36).substring(2, 9),
    timestamp: Date.now(),
    printerName: printerName || 'Impressora Desconhecida',
    documentName: documentName || 'Documento',
    paperSize: paperSize || 'Desconhecido',
    jobId: jobId || 'SISTEMA',
    errorCode: errorCode || 'PRINT_FAILED',
    errorMessage: errorMessage || 'Falha de comunicação/driver com a impressora.',
    raw: typeof raw === 'string' ? raw : (raw ? JSON.stringify(raw, null, 2) : '')
  };
  physicalPrintErrors.unshift(entry);
  if (physicalPrintErrors.length > 200) {
    physicalPrintErrors = physicalPrintErrors.slice(0, 200);
  }
  savePhysicalPrintErrors();
}

let syncedERPCollections = null;

function loadSyncedERPCollections() {
  if (syncedERPCollections !== null) return;
  const filePath = path.join(app.getPath('userData'), 'synced_erp_collections.json');
  try {
    if (fs.existsSync(filePath)) {
      syncedERPCollections = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    } else {
      syncedERPCollections = {};
    }
  } catch (err) {
    syncedERPCollections = {};
  }
}

function saveSyncedERPCollections() {
  if (syncedERPCollections === null) return;
  const filePath = path.join(app.getPath('userData'), 'synced_erp_collections.json');
  try {
    fs.writeFileSync(filePath, JSON.stringify(syncedERPCollections), 'utf8');
  } catch (err) {}
}

ipcMain.handle('generate-pairing-pin', async () => {
  const pin = Math.floor(100000 + Math.random() * 900000).toString();
  currentPairingPin = pin;
  currentPairingPinExpiresAt = Date.now() + 5 * 60 * 1000;
  return { pin, expiresAt: currentPairingPinExpiresAt };
});

ipcMain.handle('get-pairing-pin', async () => {
  return { pin: currentPairingPin, expiresAt: currentPairingPinExpiresAt };
});

ipcMain.handle('get-local-devices', async () => {
  loadTrustedDevices();
  return trustedDevices;
});

ipcMain.handle('get-pairing-audit-logs', async () => {
  loadPairingAudit();
  return pairingAuditLogs;
});

ipcMain.handle('clear-pairing-audit-logs', async () => {
  pairingAuditLogs = [];
  savePairingAudit();
  return { success: true };
});

ipcMain.handle('get-physical-print-errors', async () => {
  loadPhysicalPrintErrors();
  return physicalPrintErrors;
});

ipcMain.handle('clear-physical-print-errors', async () => {
  physicalPrintErrors = [];
  savePhysicalPrintErrors();
  return { success: true };
});

ipcMain.handle('set-device-status', async (event, { deviceId, action, token, name }) => {
  loadTrustedDevices();
  const device = trustedDevices.find(d => d.deviceId === deviceId);
  if (device) {
    if (action === 'approve') {
      device.status = 'trusted';
      const crypto = require('crypto');
      device.token = crypto.randomBytes(32).toString('hex');
      addPairingAudit(
        'device_approved',
        `Dispositivo aprovado por Administrador: ${device.name}`,
        { deviceId, type: device.type, name: device.name }
      );
    } else if (action === 'decline') {
      device.status = 'blocked';
      addPairingAudit(
        'device_declined',
        `Solicitação de pareamento recusada para: ${device.name}`,
        { deviceId, type: device.type, name: device.name }
      );
    } else if (action === 'block') {
      device.status = 'blocked';
      addPairingAudit(
        'device_declined',
        `Dispositivo bloqueado na rede: ${device.name}`,
        { deviceId, type: device.type, name: device.name }
      );
    } else if (action === 'unblock') {
      device.status = 'trusted';
      addPairingAudit(
        'device_approved',
        `Dispositivo reativado/desbloqueado: ${device.name}`,
        { deviceId, type: device.type, name: device.name }
      );
    } else if (action === 'rename') {
      const oldName = device.name;
      device.name = name || device.name;
      addPairingAudit(
        'device_renamed',
        `Dispositivo renomeado de ${oldName} para ${device.name}`,
        { deviceId, oldName, newName: device.name }
      );
    } else if (action === 'delete') {
      trustedDevices = trustedDevices.filter(d => d.deviceId !== deviceId);
      addPairingAudit(
        'token_revoked',
        `Acesso revogado/excluído para: ${device.name}`,
        { deviceId, name: device.name }
      );
    }
    saveTrustedDevices();

    const statusEvent = JSON.stringify({
      event: 'device_status_change',
      data: { deviceId, status: device.status, token: device.token }
    });
    for (const client of activeWsClients) {
      if (client.readyState === 1) {
        client.send(statusEvent);
      }
    }

    return { success: true, devices: trustedDevices };
  } else if (action === 'approve') {
    return { success: false, error: 'Dispositivo pendente não encontrado.' };
  }
  return { success: true, devices: trustedDevices };
});

ipcMain.handle('start-local-server', async (event, port) => {
  loadTrustedDevices();
  loadPairingAudit();

  for (const client of activeWsClients) {
    try {
      client.terminate();
    } catch (e) {}
  }
  activeWsClients.clear();

  if (localHttpServer) {
    try {
      localHttpServer.close();
    } catch (e) {}
    localHttpServer = null;
  }
  if (localWss) {
    try {
      localWss.close();
    } catch (e) {}
    localWss = null;
  }

  try {
    const express = require('express');
    const http = require('http');
    const { WebSocketServer } = require('ws');

    const app = express();
    app.use(express.json());

    app.use((req, res, next) => {
      const origin = req.headers.origin;
      if (origin && origin !== 'null') {
        try {
          const url = new URL(origin);
          const hostname = url.hostname;
          const isLocalhost = hostname === 'localhost' || hostname === '127.0.0.1';
          const isPrivateIP = /^192\.168\.\d{1,3}\.\d{1,3}$/.test(hostname) ||
                              /^10\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(hostname) ||
                              /^172\.(1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3}$/.test(hostname);
          const isCapacitor = url.protocol === 'capacitor:' || url.protocol === 'file:';

          if (isLocalhost || isPrivateIP || isCapacitor) {
            res.setHeader('Access-Control-Allow-Origin', origin);
          } else {
            res.setHeader('Access-Control-Allow-Origin', 'http://localhost');
          }
        } catch (err) {
          res.setHeader('Access-Control-Allow-Origin', 'http://localhost');
        }
      } else {
        // If empty, null origin, or direct local system request from desktop/mobile non-origin sources
        res.setHeader('Access-Control-Allow-Origin', '*');
      }
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
      if (req.method === 'OPTIONS') {
        return res.sendStatus(200);
      }
      next();
    });

    const requireToken = (req, res, next) => {
      const ipAddr = req.ip || '';
      const isLocal = ipAddr === '127.0.0.1' || ipAddr === '::1' || ipAddr === '::ffff:127.0.0.1' || ipAddr.includes('127.0.0.1') || ipAddr.includes('localhost');
      if (isLocal) {
        req.device = { deviceId: 'PC_PRINCIPAL', name: 'PC Central (Principal)', operator: 'Operador Principal', status: 'trusted' };
        next();
        return;
      }

      const authHeader = req.headers.authorization;
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        addPairingAudit(
          'unauthorized_attempt',
          `Bloqueada requisição sem token Bearer de: ${req.ip || 'IP Desconhecido'}`,
          { ip: req.ip, path: req.path }
        );
        return res.status(401).json({ success: false, error: 'Acesso não autorizado: Token de pareamento ausente.' });
      }
      const token = authHeader.split(' ')[1];
      const device = trustedDevices.find(d => d.token === token && d.status === 'trusted');
      if (!device) {
        addPairingAudit(
          'unauthorized_attempt',
          `Bloqueada requisição com token inválido de: ${req.ip || 'IP Desconhecido'}`,
          { ip: req.ip, path: req.path, attemptedToken: token.substring(0, 8) + '...' }
        );
        return res.status(403).json({ success: false, error: 'Acesso Proibido: Token de pareamento inválido ou revogado.' });
      }
      
      device.lastAccessed = Date.now();
      saveTrustedDevices();
      req.device = device;
      next();
    };

    app.get('/api/health', (req, res) => {
      res.json({ status: 'ok', message: 'Servidor Local Real Ativo - Lucasfe ERP Core' });
    });

    app.get('/api/status', requireToken, (req, res) => {
      res.json({
        success: true,
        status: 'online',
        uptime: process.uptime(),
        connections: activeWsClients.size,
        port: port || 3100,
        env: 'electron-hybrid'
      });
    });

    app.post('/api/pairing/request', async (req, res) => {
      const { deviceId, name, type, operator, pin } = req.body;
      if (!deviceId || !name || !type) {
        return res.status(400).json({ success: false, error: 'Parâmetros deviceId, name e type são obrigatórios.' });
      }

      const clientKey = deviceId || req.ip || 'unknown';
      const now = Date.now();

      if (pairingBruteForceTracker[clientKey]) {
        const lock = pairingBruteForceTracker[clientKey];
        if (lock.attempts >= 5 && now < lock.lockUntil) {
          const timeLeftSec = Math.ceil((lock.lockUntil - now) / 1000);
          addPairingAudit(
            'unauthorized_attempt',
            `Bloqueada tentativa de pareamento por excesso de erros para: ${name || 'Dispositivo'}`,
            { deviceId, ip: req.ip, timeLeftSec }
          );
          return res.status(429).json({ 
            success: false, 
            error: `Muitas tentativas de PIN incorretas. Dispositivo bloqueado temporariamente por mais ${timeLeftSec} segundos.` 
          });
        }
      }

      if (!currentPairingPin || Date.now() > currentPairingPinExpiresAt) {
        if (!pairingBruteForceTracker[clientKey]) {
          pairingBruteForceTracker[clientKey] = { attempts: 0, lockUntil: 0 };
        }
        pairingBruteForceTracker[clientKey].attempts += 1;
        if (pairingBruteForceTracker[clientKey].attempts >= 5) {
          pairingBruteForceTracker[clientKey].lockUntil = Date.now() + 5 * 1000 * 60; // 5 mins
        }

        addPairingAudit(
          'unauthorized_attempt',
          `Falha de pareamento: PIN expirado ou inativo tentado por ${name}`,
          { deviceId, name, type, attemptedPin: pin }
        );
        await new Promise(resolve => setTimeout(resolve, 1500));
        return res.json({ success: false, error: 'PIN de pareamento expirou ou não está ativo no PC Principal.' });
      }

      if (pin !== currentPairingPin) {
        if (!pairingBruteForceTracker[clientKey]) {
          pairingBruteForceTracker[clientKey] = { attempts: 0, lockUntil: 0 };
        }
        pairingBruteForceTracker[clientKey].attempts += 1;
        if (pairingBruteForceTracker[clientKey].attempts >= 5) {
          pairingBruteForceTracker[clientKey].lockUntil = Date.now() + 5 * 1000 * 60; // 5 mins
        }

        addPairingAudit(
          'unauthorized_attempt',
          `Falha de pareamento: PIN incorreto digitado por ${name}`,
          { deviceId, name, type, attemptedPin: pin }
        );
        await new Promise(resolve => setTimeout(resolve, 1500));
        return res.json({ success: false, error: 'PIN de pareamento não confere.' });
      }

      if (pairingBruteForceTracker[clientKey]) {
        delete pairingBruteForceTracker[clientKey];
      }

      let device = trustedDevices.find(d => d.deviceId === deviceId);
      if (device) {
        if (device.status === 'blocked') {
          return res.json({ success: false, status: 'blocked', error: 'Dispositivo bloqueado pelo administrador.' });
        }
        if (device.status === 'trusted') {
          device.lastAccessed = Date.now();
          saveTrustedDevices();
          return res.json({ success: true, status: 'trusted', token: device.token });
        }
        
        device.name = name;
        device.type = type;
        device.operator = operator || device.operator;
        device.status = 'pending';
      } else {
        device = {
          deviceId,
          name,
          type,
          token: '',
          createdAt: Date.now(),
          lastAccessed: Date.now(),
          status: 'pending',
          operator
        };
        trustedDevices.push(device);
      }

      saveTrustedDevices();
      addPairingAudit(
        'pairing_request',
        `Nova solicitação recebida de ${name} (${type})`,
        { deviceId, name, type, operator }
      );

      if (mainWindow) {
        mainWindow.webContents.send('new-pairing-request', device);
      }

      const alertMsg = JSON.stringify({
        event: 'pairing_pending_alert',
        data: device
      });
      for (const client of activeWsClients) {
        if (client.readyState === 1) {
          client.send(alertMsg);
        }
      }

      return res.json({ success: true, status: 'pending', message: 'Pareamento registrado. Aguardando aprovação administrativa no PC.' });
    });

    app.get('/api/pairing/check-status', (req, res) => {
      const { deviceId } = req.query;
      if (!deviceId) {
        return res.status(400).json({ success: false, error: 'deviceId é obrigatório.' });
      }

      const device = trustedDevices.find(d => d.deviceId === deviceId);
      if (!device) {
        return res.json({ success: false, status: 'not_found', error: 'Dispositivo não encontrado.' });
      }

      if (device.status === 'trusted') {
        device.lastAccessed = Date.now();
        saveTrustedDevices();
        return res.json({ 
          success: true, 
          status: 'trusted', 
          token: device.token 
        });
      } else if (device.status === 'blocked') {
        return res.json({ success: true, status: 'blocked', error: 'Acesso recusado ou bloqueado no PC Principal.' });
      }

      return res.json({ success: true, status: 'pending' });
    });

    app.post('/api/broadcast', requireToken, (req, res) => {
      const payload = req.body;
      const messagePacket = JSON.stringify({
        event: payload.event || 'broadcast_event',
        data: payload.data || payload,
        sender: req.device ? req.device.name : 'PC Principal',
        timestamp: new Date().toISOString()
      });
      let notified = 0;
      for (const client of activeWsClients) {
        if (client.readyState === 1 && client.isAuthorized) {
          client.send(messagePacket);
          notified++;
        }
      }
      res.json({ success: true, clientsNotified: notified });
    });

    app.get('/api/sync/pull', requireToken, (req, res) => {
      loadSyncedERPCollections();
      const lastSyncAt = parseInt(req.query.lastSyncAt || '0', 10);
      const changes = {};
      
      for (const [entity, records] of Object.entries(syncedERPCollections)) {
        if (Array.isArray(records)) {
          const filtered = records.filter(r => r && typeof r === 'object' && r.lastUpdated > lastSyncAt);
          if (filtered.length > 0) {
            changes[entity] = filtered;
          }
        }
      }
      
      res.json({
        success: true,
        changes,
        serverTime: Date.now()
      });
    });

    app.post('/api/sync/push', requireToken, (req, res) => {
      loadSyncedERPCollections();
      const { mutations } = req.body;
      if (!Array.isArray(mutations)) {
        return res.status(400).json({ success: false, error: 'Parâmetro mutations deve ser uma lista.' });
      }
      
      const appliedMutations = [];
      const conflictLogs = [];
      
      for (const mutation of mutations) {
        const { entity, recordId, operation, data } = mutation;
        if (!entity || !recordId || !operation) continue;
        
        if (!syncedERPCollections[entity]) {
          syncedERPCollections[entity] = [];
        }
        
        const records = syncedERPCollections[entity];
        const existingIndex = records.findIndex(r => r && r.id === recordId);
        
        if (operation === 'u') {
          if (!data || typeof data !== 'object') continue;
          
          data.lastUpdated = data.lastUpdated || Date.now();
          data.deviceId = data.deviceId || (req.device ? req.device.deviceId : 'PC_PRINCIPAL');
          data.updatedBy = data.updatedBy || (req.device ? req.device.operator : 'Operador');
          data.syncVersion = (data.syncVersion || 0) + 1;
          
          if (existingIndex !== -1) {
            const existingItem = records[existingIndex];
            if (data.lastUpdated > (existingItem.lastUpdated || 0)) {
              records[existingIndex] = data;
              appliedMutations.push(mutation);
            } else if (data.lastUpdated < (existingItem.lastUpdated || 0)) {
              conflictLogs.push({
                entity,
                id: recordId,
                incomingDevice: data.deviceId,
                incomingUpdated: data.lastUpdated,
                existingDevice: existingItem.deviceId || 'PC_PRINCIPAL',
                existingUpdated: existingItem.lastUpdated || 0,
                operator: data.updatedBy
              });
            } else {
              records[existingIndex] = { ...existingItem, ...data };
              appliedMutations.push(mutation);
            }
          } else {
            records.push(data);
            appliedMutations.push(mutation);
          }
        } else if (operation === 'd') {
          if (existingIndex !== -1) {
            records.splice(existingIndex, 1);
            appliedMutations.push(mutation);
          }
        }
      }
      
      if (appliedMutations.length > 0) {
        saveSyncedERPCollections();
        
        if (mainWindow) {
          mainWindow.webContents.send('sync-incoming-mutations', appliedMutations);
        }
        
        const broadcastMsg = JSON.stringify({
          event: 'sync_mutations_received',
          data: { mutations: appliedMutations },
          sender: req.device ? req.device.name : 'Servidor',
          timestamp: Date.now()
        });
        
        for (const tClient of activeWsClients) {
          if (tClient.readyState === 1 && tClient.isAuthorized) {
            tClient.send(broadcastMsg);
          }
        }
      }
      
      for (const conf of conflictLogs) {
        addPairingAudit(
          'unauthorized_attempt',
          `Conflito LWW em ${conf.entity}: ID ${conf.id} (Mantido ${conf.existingDevice}, recusado ${conf.incomingDevice})`,
          conf
        );
      }
      
      res.json({
        success: true,
        appliedCount: appliedMutations.length,
        conflictsResolved: conflictLogs.length,
        serverTime: Date.now()
      });
    });

    localHttpServer = http.createServer(app);

    localWss = new WebSocketServer({ server: localHttpServer });
    localWss.on('connection', (ws, req) => {
      console.log('[Main/WS] Real network device connected:', req.socket.remoteAddress);
      
      const isLoopback = req.socket.remoteAddress === '127.0.0.1' || req.socket.remoteAddress === '::1' || req.socket.remoteAddress === '::ffff:127.0.0.1';
      ws.isAuthorized = isLoopback;
      ws.deviceName = isLoopback ? 'PC Matriz (Local)' : 'Nova Conexão';
      
      activeWsClients.add(ws);

      ws.send(JSON.stringify({
        event: 'system_welcome',
        message: 'Conectado. Autenticação pendente pelo handshake.',
        timestamp: new Date().toISOString()
      }));

      ws.on('message', (message) => {
        const rawContent = message.toString();
        try {
          const parsed = JSON.parse(rawContent);

          if (parsed.event === 'client_handshake') {
            const { deviceId, token } = parsed.data || {};
            const device = trustedDevices.find(d => d.deviceId === deviceId && d.token === token && d.status === 'trusted');
            if (device) {
              ws.isAuthorized = true;
              ws.deviceId = deviceId;
              ws.deviceName = device.name;
              device.lastAccessed = Date.now();
              saveTrustedDevices();
              ws.send(JSON.stringify({
                event: 'handshake_response',
                data: { success: true, message: 'Autenticado com sucesso!' }
              }));
              return;
            } else {
              addPairingAudit(
                'unauthorized_attempt',
                `Acesso WebSocket rejeitado para deviceId: ${deviceId}`,
                { deviceId, ip: req.socket.remoteAddress }
              );
              ws.send(JSON.stringify({
                event: 'handshake_response',
                data: { success: false, error: 'Acesso Proibido: Token inválido.' }
              }));
              ws.close();
              return;
            }
          }

          if (!ws.isAuthorized) {
            ws.send(JSON.stringify({
              event: 'unauthorized',
              error: 'Conexão não autorizada. Handshake requerido.'
            }));
            ws.close();
            return;
          }

          const outbound = JSON.stringify({
            event: parsed.event || 'broadcast_event',
            data: parsed.data || parsed,
            sender: ws.deviceName,
            timestamp: new Date().toISOString()
          });

          for (const client of activeWsClients) {
            if (client.readyState === 1 && client.isAuthorized) {
              client.send(outbound);
            }
          }
        } catch (e) {
          if (!ws.isAuthorized) {
            ws.close();
            return;
          }
          const outboundRaw = JSON.stringify({
            event: 'raw_broadcast',
            data: rawContent,
            sender: ws.deviceName,
            timestamp: new Date().toISOString()
          });
          for (const client of activeWsClients) {
            if (client.readyState === 1 && client.isAuthorized) {
              client.send(outboundRaw);
            }
          }
        }
      });

      ws.on('close', () => {
        activeWsClients.delete(ws);
      });

      ws.on('error', (err) => {
        activeWsClients.delete(ws);
      });
    });

    const getIP = () => {
      const os = require('os');
      const interfaces = os.networkInterfaces();
      for (const name of Object.keys(interfaces)) {
        for (const iface of interfaces[name]) {
          if (iface.family === 'IPv4' && !iface.internal) {
            return iface.address;
          }
        }
      }
      return '127.0.0.1';
    };

    const resolvedIP = getIP();

    return new Promise((resolve) => {
      localHttpServer.listen(port || 3100, '0.0.0.0', () => {
        console.log(`[Main/Server] Electron Express Server listening on http://0.0.0.0:${port || 3100}`);
        resolve({
          success: true,
          port: port || 3100,
          ip: resolvedIP
        });
      });

      localHttpServer.on('error', (err) => {
        resolve({
          success: false,
          error: `Erro ao iniciar servidor na porta ${port || 3100}: ${err.message}`
        });
      });
    });

  } catch (error) {
    return { success: false, error: error.message };
  }
});

const nfcService = {
  lastReadUid: '',
  lastReadTime: 0,
  isListening: false,

  initialize() {
    this.isListening = true;
    console.log('[Main/NFC] nfcService inicializado.');

    try {
      const NFC_PKG_NAME = 'nfc-pcsc';
      if (require.resolve && require.resolve(NFC_PKG_NAME)) {
        const { NFC } = require(NFC_PKG_NAME);
        const nfc = new NFC();
        nfc.on('reader', reader => {
          reader.on('card', card => {
            const rawUid = card.uid || '';
            const normalized = rawUid.toUpperCase();
            nfcService.sendNFCEvent(normalized);
          });
        });
      }
    } catch (_) {}
  },

  sendNFCEvent(uid) {
    if (!uid) return;
    const now = Date.now();
    const cleanUid = uid.trim().replace(/[:\s-]/g, '').toUpperCase();

    if (cleanUid === this.lastReadUid && (now - this.lastReadTime < 2000)) {
      return;
    }

    this.lastReadUid = cleanUid;
    this.lastReadTime = now;

    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('nfc-tag-read', cleanUid);
    }
  }
};

ipcMain.handle('simulate-nfc-scan', (event, uid) => {
  nfcService.sendNFCEvent(uid);
  return { success: true, uid: uid };
});

// SQLite Database IPC handlers
ipcMain.handle('db:setSaleOpen', (event, isOpen) => {
  dbService.setSaleOpen(isOpen);
  return { success: true };
});

ipcMain.handle('db:setCriticalOperationActive', (event, isActive) => {
  dbService.setCriticalOperationActive(isActive);
  return { success: true };
});

ipcMain.handle('db:getMetrics', (event) => {
  return dbService.getDbMetricsNow(app.getPath('userData'));
});

ipcMain.handle('db:createSnapshotManual', async (event) => {
  const s1 = await dbService.createBackupSnapshot(app.getPath('userData'));
  dbService.createJsonGzipSnapshot(app.getPath('userData'));
  return { success: s1 };
});

ipcMain.handle('db:insertAuditLog', async (event, log) => {
  return dbService.insertAuditLog(log);
});

ipcMain.handle('db:listAuditLogs', async (event, limit) => {
  return dbService.listAuditLogs(limit);
});

ipcMain.handle('db:insertActivity', async (event, act) => {
  return dbService.insertActivity(act);
});

ipcMain.handle('db:listActivities', async (event, limit) => {
  return dbService.listActivities(limit);
});

ipcMain.handle('db:insertNfcPresenceRecord', async (event, rec) => {
  return dbService.insertNfcPresenceRecord(rec);
});

ipcMain.handle('db:listNfcPresenceRecords', async (event, limit) => {
  return dbService.listNfcPresenceRecords(limit);
});

ipcMain.handle('db:saveBackupFile', async (event, backupId, backupDataObj) => {
  return dbService.saveBackupFile(app.getPath('userData'), backupId, backupDataObj);
});

ipcMain.handle('db:listBackupFiles', async (event) => {
  return dbService.listBackupFiles();
});

ipcMain.handle('db:loadBackupFileContent', async (event, filename) => {
  return dbService.loadBackupFileContent(app.getPath('userData'), filename);
});

// Products IPC handlers (Fase 3)
ipcMain.handle('db:insertProduct', async (event, product) => {
  return dbService.insertProduct(product);
});

ipcMain.handle('db:updateProduct', async (event, id, product) => {
  return dbService.updateProduct(id, product);
});

ipcMain.handle('db:deleteProduct', async (event, id) => {
  return dbService.deleteProduct(id);
});

ipcMain.handle('db:listProducts', async (event) => {
  return dbService.listProducts();
});

// Clients IPC handlers (Fase 3)
ipcMain.handle('db:insertClient', async (event, client) => {
  return dbService.insertClient(client);
});

ipcMain.handle('db:updateClient', async (event, id, client) => {
  return dbService.updateClient(id, client);
});

ipcMain.handle('db:deleteClient', async (event, id) => {
  return dbService.deleteClient(id);
});

ipcMain.handle('db:listClients', async (event) => {
  return dbService.listClients();
});

// Categories IPC handlers (Fase 3)
ipcMain.handle('db:insertCategory', async (event, category) => {
  return dbService.insertCategory(category);
});

ipcMain.handle('db:updateCategory', async (event, id, category) => {
  return dbService.updateCategory(id, category);
});

ipcMain.handle('db:deleteCategory', async (event, id) => {
  return dbService.deleteCategory(id);
});

ipcMain.handle('db:listCategories', async (event) => {
  return dbService.listCategories();
});

// Subcategories IPC handlers (Fase 3)
ipcMain.handle('db:insertSubcategory', async (event, sub) => {
  return dbService.insertSubcategory(sub);
});

ipcMain.handle('db:updateSubcategory', async (event, id, sub) => {
  return dbService.updateSubcategory(id, sub);
});

ipcMain.handle('db:deleteSubcategory', async (event, id) => {
  return dbService.deleteSubcategory(id);
});

ipcMain.handle('db:deleteSubcategoriesByCategoryId', async (event, categoryId) => {
  return dbService.deleteSubcategoriesByCategoryId(categoryId);
});

ipcMain.handle('db:listSubcategories', async (event) => {
  return dbService.listSubcategories();
});

// Sales IPC handlers (Fase 4)
ipcMain.handle('db:insertSale', async (event, sale) => {
  return dbService.insertSale(sale);
});

ipcMain.handle('db:updateSale', async (event, id, sale) => {
  return dbService.updateSale(id, sale);
});

ipcMain.handle('db:deleteSale', async (event, id) => {
  return dbService.deleteSale(id);
});

ipcMain.handle('db:listSales', async (event) => {
  return dbService.listSales();
});

// Pre Orders IPC handlers (Fase 4)
ipcMain.handle('db:insertPreOrder', async (event, order) => {
  return dbService.insertPreOrder(order);
});

ipcMain.handle('db:updatePreOrder', async (event, id, order) => {
  return dbService.updatePreOrder(id, order);
});

ipcMain.handle('db:deletePreOrder', async (event, id) => {
  return dbService.deletePreOrder(id);
});

ipcMain.handle('db:listPreOrders', async (event) => {
  return dbService.listPreOrders();
});

// Cashier Sessions IPC handlers (Fase 4)
ipcMain.handle('db:insertCashierSession', async (event, session) => {
  return dbService.insertCashierSession(session);
});

ipcMain.handle('db:updateCashierSession', async (event, id, session) => {
  return dbService.updateCashierSession(id, session);
});

ipcMain.handle('db:listCashierSessions', async (event) => {
  return dbService.listCashierSessions();
});

// Financial Transactions IPC handlers (Fase 4)
ipcMain.handle('db:insertFinancialTransaction', async (event, transaction) => {
  return dbService.insertFinancialTransaction(transaction);
});

ipcMain.handle('db:updateFinancialTransaction', async (event, id, transaction) => {
  return dbService.updateFinancialTransaction(id, transaction);
});

ipcMain.handle('db:listFinancialTransactions', async (event) => {
  return dbService.listFinancialTransactions();
});

// Sync Queue IPC handlers (Fase 5A)
ipcMain.handle('db:insertSyncQueueItem', async (event, item) => {
  return dbService.insertSyncQueueItem(item);
});

ipcMain.handle('db:updateSyncQueueItem', async (event, id, item) => {
  return dbService.updateSyncQueueItem(id, item);
});

ipcMain.handle('db:deleteSyncQueueItem', async (event, id) => {
  return dbService.deleteSyncQueueItem(id);
});

ipcMain.handle('db:listSyncQueue', async (event) => {
  return dbService.listSyncQueue();
});

// Tombstones IPC handlers (Fase 5A)
ipcMain.handle('db:insertTombstone', async (event, tombstone) => {
  return dbService.insertTombstone(tombstone);
});

ipcMain.handle('db:listTombstones', async (event) => {
  return dbService.listTombstones();
});

ipcMain.handle('db:deleteTombstone', async (event, id) => {
  return dbService.deleteTombstone(id);
});

// Productions, Production Runs, Materials, Machines, Returns & Consignments IPC handlers (Fase 5B)
ipcMain.handle('db:insertProduction', async (event, production) => {
  return dbService.insertProduction(production);
});
ipcMain.handle('db:updateProduction', async (event, id, production) => {
  return dbService.updateProduction(id, production);
});
ipcMain.handle('db:listProductions', async (event) => {
  return dbService.listProductions();
});

ipcMain.handle('db:insertProductionRun', async (event, run) => {
  return dbService.insertProductionRun(run);
});
ipcMain.handle('db:updateProductionRun', async (event, id, run) => {
  return dbService.updateProductionRun(id, run);
});
ipcMain.handle('db:listProductionRuns', async (event) => {
  return dbService.listProductionRuns();
});

ipcMain.handle('db:insertMaterial', async (event, material) => {
  return dbService.insertMaterial(material);
});
ipcMain.handle('db:updateMaterial', async (event, id, material) => {
  return dbService.updateMaterial(id, material);
});
ipcMain.handle('db:listMaterials', async (event) => {
  return dbService.listMaterials();
});

ipcMain.handle('db:insertMachine', async (event, machine) => {
  return dbService.insertMachine(machine);
});
ipcMain.handle('db:updateMachine', async (event, id, machine) => {
  return dbService.updateMachine(id, machine);
});
ipcMain.handle('db:listMachines', async (event) => {
  return dbService.listMachines();
});

ipcMain.handle('db:insertReturn', async (event, ret) => {
  return dbService.insertReturn(ret);
});
ipcMain.handle('db:updateReturn', async (event, id, ret) => {
  return dbService.updateReturn(id, ret);
});
ipcMain.handle('db:listReturns', async (event) => {
  return dbService.listReturns();
});

ipcMain.handle('db:insertConsignment', async (event, consignment) => {
  return dbService.insertConsignment(consignment);
});
ipcMain.handle('db:updateConsignment', async (event, id, consignment) => {
  return dbService.updateConsignment(id, consignment);
});
ipcMain.handle('db:listConsignments', async (event) => {
  return dbService.listConsignments();
});

// Global settings / Users and roles handlers
ipcMain.handle('db:insertUser', async (event, user) => dbService.insertUser(user));
ipcMain.handle('db:updateUser', async (event, id, user) => dbService.updateUser(id, user));
ipcMain.handle('db:deleteUser', async (event, id) => dbService.deleteUser(id));
ipcMain.handle('db:listUsers', async () => dbService.listUsers());

ipcMain.handle('db:insertPermission', async (event, perm) => dbService.insertPermission(perm));
ipcMain.handle('db:updatePermission', async (event, id, perm) => dbService.updatePermission(id, perm));
ipcMain.handle('db:deletePermission', async (event, id) => dbService.deletePermission(id));
ipcMain.handle('db:listPermissions', async () => dbService.listPermissions());

ipcMain.handle('db:insertCompanySetting', async (event, setting) => dbService.insertCompanySetting(setting));
ipcMain.handle('db:updateCompanySetting', async (event, id, setting) => dbService.updateCompanySetting(id, setting));
ipcMain.handle('db:listCompanySettings', async () => dbService.listCompanySettings());

ipcMain.handle('db:insertSystemSetting', async (event, setting) => dbService.insertSystemSetting(setting));
ipcMain.handle('db:updateSystemSetting', async (event, id, setting) => dbService.updateSystemSetting(id, setting));
ipcMain.handle('db:listSystemSettings', async () => dbService.listSystemSettings());

ipcMain.handle('db:insertTerminalSetting', async (event, setting) => dbService.insertTerminalSetting(setting));
ipcMain.handle('db:updateTerminalSetting', async (event, id, setting) => dbService.updateTerminalSetting(id, setting));
ipcMain.handle('db:listTerminalSettings', async () => dbService.listTerminalSettings());

ipcMain.handle('db:insertPdvSetting', async (event, setting) => dbService.insertPdvSetting(setting));
ipcMain.handle('db:updatePdvSetting', async (event, id, setting) => dbService.updatePdvSetting(id, setting));
ipcMain.handle('db:listPdvSettings', async () => dbService.listPdvSettings());

ipcMain.handle('db:insertPdvTotemSetting', async (event, setting) => dbService.insertPdvTotemSetting(setting));
ipcMain.handle('db:updatePdvTotemSetting', async (event, id, setting) => dbService.updatePdvTotemSetting(id, setting));
ipcMain.handle('db:listPdvTotemSettings', async () => dbService.listPdvTotemSettings());

ipcMain.handle('db:insertKioskTerminal', async (event, terminal) => dbService.insertKioskTerminal(terminal));
ipcMain.handle('db:updateKioskTerminal', async (event, id, terminal) => dbService.updateKioskTerminal(id, terminal));
ipcMain.handle('db:deleteKioskTerminal', async (event, id) => dbService.deleteKioskTerminal(id));
ipcMain.handle('db:listKioskTerminals', async () => dbService.listKioskTerminals());

ipcMain.handle('db:insertPrintSetting', async (event, setting) => dbService.insertPrintSetting(setting));
ipcMain.handle('db:updatePrintSetting', async (event, id, setting) => dbService.updatePrintSetting(id, setting));
ipcMain.handle('db:listPrintSettings', async () => dbService.listPrintSettings());

ipcMain.handle('get-system-printers', async (event) => {
  try {
    const wc = event?.sender || (mainWindow && !mainWindow.isDestroyed() ? mainWindow.webContents : null) || (BrowserWindow.getAllWindows()[0] && !BrowserWindow.getAllWindows()[0].isDestroyed() ? BrowserWindow.getAllWindows()[0].webContents : null);
    if (wc) {
      // Safely try asynchronous method first
      if (typeof wc.getPrintersAsync === 'function') {
        try {
          const printers = await wc.getPrintersAsync();
          if (printers) {
            return { success: true, printers };
          }
        } catch (asyncErr) {
          console.error('[ELECTRON-PRINTERS] Error in getPrintersAsync, falling back to sync:', asyncErr);
        }
      }
      // If async fails/is missing, fallback to synchronous method
      if (typeof wc.getPrinters === 'function') {
        try {
          const printers = wc.getPrinters();
          if (printers) {
            return { success: true, printers };
          }
        } catch (syncErr) {
          console.error('[ELECTRON-PRINTERS] Error in getPrinters (sync):', syncErr);
        }
      }
    }
    // Return empty list if no printers are installed or accessible, but DO NOT inject simulated mock printers for real Desktop queries
    return { success: true, printers: [] };
  } catch (err) {
    console.error('[ELECTRON-PRINTERS] Failed to fetch system printers:', err);
    return { success: false, error: err.message };
  }
});

ipcMain.handle('list-printers', async (event) => {
  try {
    const wc = event?.sender || (mainWindow && !mainWindow.isDestroyed() ? mainWindow.webContents : null) || (BrowserWindow.getAllWindows()[0] && !BrowserWindow.getAllWindows()[0].isDestroyed() ? BrowserWindow.getAllWindows()[0].webContents : null);
    if (wc) {
      if (typeof wc.getPrintersAsync === 'function') {
        try {
          const printers = await wc.getPrintersAsync();
          if (printers) return { success: true, printers };
        } catch (e) {
          console.error('[ELECTRON-PRINTERS] Error in list-printers async:', e);
        }
      }
      if (typeof wc.getPrinters === 'function') {
        try {
          const printers = wc.getPrinters();
          if (printers) return { success: true, printers };
        } catch (e) {
          console.error('[ELECTRON-PRINTERS] Error in list-printers sync:', e);
        }
      }
    }
    return { success: true, printers: [] };
  } catch (err) {
    console.error('[ELECTRON-PRINTERS] Failed to list printers:', err);
    return { success: false, error: err.message };
  }
});

ipcMain.handle('get-printer-media-options', async (event, printerName) => {
  console.log(`[PRINTER-MEDIA] Querying media sizes for printer "${printerName}"`);
  if (!printerName) {
    return { success: false, error: 'Name of the printer is required.' };
  }

  try {
    const { exec } = require('child_process');
    const { promisify } = require('util');
    const execAsync = promisify(exec);

    if (process.platform === 'win32') {
      const command = `powershell -NoProfile -Command "Add-Type -AssemblyName System.Drawing; $ps = New-Object System.Drawing.Printing.PrinterSettings; $ps.PrinterName = '${printerName.replace(/'/g, "''")}'; $ps.PaperSizes | Select-Object -ExpandProperty PaperName"`;
      try {
        const { stdout } = await execAsync(command, { timeout: 3000 });
        if (stdout && stdout.trim()) {
          const sizes = stdout
            .split(/[\r\n]+/)
            .map(line => line.trim())
            .filter(line => line.length > 0);
          console.log(`[PRINTER-MEDIA] Windows PowerShell returned sizes:`, sizes);
          return { success: true, mediaOptions: sizes };
        }
      } catch (cmdErr) {
        console.warn(`[PRINTER-MEDIA] Windows PowerShell command failed:`, cmdErr.message);
        // Fallback to Get-PrintConfiguration if PrinterSettings failed
        const fallbackCommand = `powershell -NoProfile -Command "(Get-PrintConfiguration -PrinterName '${printerName.replace(/'/g, "''")}').PaperSize"`;
        try {
          const { stdout } = await execAsync(fallbackCommand, { timeout: 2000 });
          if (stdout && stdout.trim()) {
            const sizes = stdout
              .split(/[\r\n]+/)
              .map(line => line.trim())
              .filter(line => line.length > 0);
            return { success: true, mediaOptions: sizes };
          }
        } catch (fallErr) {
          console.warn(`[PRINTER-MEDIA] Fallback powershell failed:`, fallErr.message);
        }
      }
    } else if (process.platform === 'darwin' || process.platform === 'linux') {
      const command = `lpoptions -p "${printerName.replace(/"/g, '\\"')}" -l`;
      try {
        const { stdout } = await execAsync(command, { timeout: 3000 });
        if (stdout) {
          const lines = stdout.split(/[\r\n]+/);
          const pageSizeLine = lines.find(line => line.toLowerCase().includes('pagesize') || line.toLowerCase().includes('media size'));
          if (pageSizeLine) {
            const parts = pageSizeLine.split(':');
            if (parts.length > 1) {
              const sizes = parts[1]
                .trim()
                .split(/\s+/)
                .map(s => s.replace(/^\*/, ''))
                .filter(s => s.length > 0);
              console.log(`[PRINTER-MEDIA] Unix lpoptions returned sizes:`, sizes);
              return { success: true, mediaOptions: sizes };
            }
          }
        }
      } catch (cmdErr) {
        console.warn(`[PRINTER-MEDIA] CUPS lpoptions command failed:`, cmdErr.message);
      }
    }

    return { success: true, mediaOptions: [] };
  } catch (err) {
    console.error(`[PRINTER-MEDIA] Exception in get-printer-media-options handler:`, err);
    return { success: false, error: err.message, mediaOptions: [] };
  }
});

let activePrintsCounter = 0;
function incrementPrintsCounter() {
  activePrintsCounter++;
  dbService.setActivePrintJobsCount(activePrintsCounter);
}
function decrementPrintsCounter() {
  activePrintsCounter = Math.max(0, activePrintsCounter - 1);
  dbService.setActivePrintJobsCount(activePrintsCounter);
}

ipcMain.handle('print-pdf', async (event, options) => {
  incrementPrintsCounter();
  try {
    const { printerName, driverPaperName, orientation, marginMm, scale, pdfBase64, html, paperWidthMm, paperHeightMm } = options;
  
  // 1, 2, 3. Validate printerName exists, is a non-empty string, and is not a PDF manual indicator
  const cleanPrinterName = typeof printerName === 'string' ? printerName.trim() : '';
  const isInvalidPrinter = !cleanPrinterName || cleanPrinterName === 'PDF Manual' || cleanPrinterName === 'Manual PDF Backup';

  if (isInvalidPrinter) {
    console.warn(`[PRINT-PDF] [SECURITY BLOCK] Physical print blocked: Printer name "${printerName}" is invalid or a manual PDF setting. Aborting print, requesting PDF fallback.`);
    return { 
      success: false, 
      fallbackPdf: true,
      error: `Impressora "${printerName || 'não especificada'}" não configurada ou definida como PDF manual.`
    };
  }

  // 4. Query physical OS printers to prove the requested printer exists
  let systemPrinters = [];
  try {
    if (event.sender) {
      if (typeof event.sender.getPrintersAsync === 'function') {
        systemPrinters = await event.sender.getPrintersAsync();
      } else if (typeof event.sender.getPrinters === 'function') {
        systemPrinters = event.sender.getPrinters();
      }
    }
  } catch (printerErr) {
    console.error('[PRINT-PDF] Failed to query system printers list for physical verification:', printerErr);
  }

  const printerExists = systemPrinters.some(p => p.name === cleanPrinterName);
  console.log(`[PRINT-PDF] OS Printers check. Searching for printer: "${cleanPrinterName}". Matches found: ${printerExists}. Total system printers: ${systemPrinters.length}`);

  if (!printerExists) {
    const errorMsg = `A impressora "${cleanPrinterName}" foi configurada, mas não está cadastrada ou disponível no Windows/sistema operacional atual.`;
    console.warn(`[PRINT-PDF] [SECURITY BLOCK] Physical print blocked: ${errorMsg}`);
    return {
      success: false,
      fallbackPdf: true,
      error: errorMsg
    };
  }

  const hasPdf = typeof pdfBase64 === 'string' && pdfBase64.replace(/^data:application\/pdf;base64,/, '').length > 100;
  const isHtml = !hasPdf && typeof html === 'string' && html.trim().length > 0;
  
  console.log(`[PRINT-PDF] Silent print request to printer "${printerName}". Mode: ${hasPdf ? 'Canonical PDF' : (isHtml ? 'HTML Fallback' : 'UNKNOWN')}. Paper Name: "${driverPaperName}". Width: ${paperWidthMm}mm, Height: ${paperHeightMm}mm`);
  
  let tempFilePath = '';
  let pdfDimensions = null;
  let pdfBuffer = null;

  if (hasPdf) {
    pdfBuffer = Buffer.from(pdfBase64.replace(/^data:application\/pdf;base64,/, ''), 'base64');
      // Dynamic extraction of exact PDF MediaBox dimension bounds
      try {
        const pdfStr = pdfBuffer.toString('binary');
        const mediaBoxRegex = /\/MediaBox\s*\[\s*0\s+0\s+([0-9.]+)\s+([0-9.]+)\s*\]/gi;
        let match;
        let maxWidthPt = 0;
        let maxHeightPt = 0;
        while ((match = mediaBoxRegex.exec(pdfStr)) !== null) {
          const w = parseFloat(match[1]);
          const h = parseFloat(match[2]);
          if (w > maxWidthPt) maxWidthPt = w;
          if (h > maxHeightPt) maxHeightPt = h;
        }
        if (maxWidthPt > 0 && maxHeightPt > 0) {
          pdfDimensions = {
            widthMm: maxWidthPt * 25.4 / 72,
            heightMm: maxHeightPt * 25.4 / 72
          };
          console.log(`[PRINT-PDF] Successfully parsed PDF MediaBox dimensions: ${pdfDimensions.widthMm.toFixed(2)}mm x ${pdfDimensions.heightMm.toFixed(2)}mm`);
        }
      } catch (err) {
        console.error('[PRINT-PDF] Error parsing PDF binary MediaBox:', err);
      }
    }

    if (isHtml) {
      tempFilePath = path.join(app.getPath('temp'), `print_temp_${Date.now()}_${Math.floor(Math.random() * 1000)}.html`);
      fs.writeFileSync(tempFilePath, html, 'utf8');
    } else {
      tempFilePath = path.join(app.getPath('temp'), `print_temp_${Date.now()}_${Math.floor(Math.random() * 1000)}.pdf`);
      fs.writeFileSync(tempFilePath, pdfBuffer || Buffer.from(pdfBase64.replace(/^data:application\/pdf;base64,/, ''), 'base64'));
    }
    
    return new Promise((resolve) => {
      const printWin = new BrowserWindow({
        show: false,
        webPreferences: {
          nodeIntegration: false,
          contextIsolation: true,
          plugins: !isHtml // Only enable plugins if loading a PDF
        }
      });
      
      if (isHtml) {
        printWin.loadFile(tempFilePath);
      } else {
        printWin.loadURL(`file://${tempFilePath}`);
      }
      
      printWin.webContents.once('did-finish-load', async () => {
        // Wait briefly for rendering to complete (shorter for HTML, longer for PDF)
        await new Promise(r => setTimeout(r, isHtml ? 300 : 800));
        
        try {
          const paperDims = resolvePhysicalPaperDimensions({
            driverPaperName,
            paperWidthMm: typeof paperWidthMm === 'number' ? paperWidthMm : parseFloat(paperWidthMm),
            paperHeightMm: (paperHeightMm === 'auto' || paperHeightMm === null || paperHeightMm === undefined)
              ? null
              : (typeof paperHeightMm === 'number' ? paperHeightMm : parseFloat(paperHeightMm))
          });

          const safePageSize = {
            width: paperDims.widthMicrons,
            height: paperDims.heightMicrons
          };

          const effectiveWidthMm = paperDims.widthMicrons / 1000;
          console.log(`[PRINT-PDF] Resolved safePageSize width: ${safePageSize.width}, height: ${safePageSize.height} microns (${effectiveWidthMm}mm)`);
 
          console.log('[PRINT DRIVER TEST]', {
            printerName,
            driverPaperName,
            orientation,
            usingManualPageSize: false,
            safePageSize
          });

          printWin.webContents.print({
            silent: true,
            deviceName: printerName,
            printBackground: true,
            margins: { marginType: 'none' }, // modern API: explicit 0 margins
            landscape: orientation === 'landscape',
            pageSize: safePageSize,
            scaleFactor: typeof scale === 'number' && scale > 0 ? (scale > 10 ? scale / 100 : scale) : 1.0
          }, (success, failureReason) => {
            printWin.destroy();
            try { if (fs.existsSync(tempFilePath)) fs.unlinkSync(tempFilePath); } catch (_) {}
            
            if (success) {
              console.log(`[PRINT-PDF] Document successfully spooled on hardware driver.`);
              resolve({ success: true });
            } else {
              const errMsg = `Falha na impressora física: ${failureReason || 'Cancelado ou indisponível.'}`;
              console.error(`[PRINT-PDF] ${errMsg}`);
              addPhysicalPrintError(
                printerName,
                options.documentName,
                typeof safePageSize === 'string' ? safePageSize : (effectiveWidthMm ? `${effectiveWidthMm}mm` : 'A4'),
                options.jobId,
                failureReason || 'PRINT_FAILED',
                errMsg,
                JSON.stringify({ options, failureReason })
              );
              resolve({ success: false, error: errMsg });
            }
          });
        } catch (err) {
          printWin.destroy();
          try { if (fs.existsSync(tempFilePath)) fs.unlinkSync(tempFilePath); } catch (_) {}
          console.error('[PRINT-PDF] Internal Exception in printer dispatch:', err);
          addPhysicalPrintError(
            printerName,
            options.documentName,
            options.paperWidthMm ? `${options.paperWidthMm}mm` : 'A4',
            options.jobId,
            'PRINT_EXCEPTION',
            err.message,
            err.stack || String(err)
          );
          resolve({ success: false, error: err.message });
        }
      });
      
      printWin.webContents.once('did-fail-load', (errCode, errDesc) => {
        printWin.destroy();
        try { if (fs.existsSync(tempFilePath)) fs.unlinkSync(tempFilePath); } catch (_) {}
        const errorText = `Erro ao renderizar arquivo de impressão: ${errDesc}`;
        console.error(`[PRINT-PDF] ${errorText}`);
        addPhysicalPrintError(
          printerName,
          options.documentName,
          options.paperWidthMm ? `${options.paperWidthMm}mm` : 'A4',
          options.jobId,
          String(errCode) || 'LOAD_FAILED',
          errorText,
          errDesc
        );
        resolve({ success: false, error: errorText });
      });
    });
  } catch (err) {
    console.error('[PRINT-PDF] Exception in print-pdf handler:', err);
    try { if (tempFilePath && fs.existsSync(tempFilePath)) fs.unlinkSync(tempFilePath); } catch (_) {}
    addPhysicalPrintError(
      printerName,
      options.documentName,
      options.paperWidthMm ? `${options.paperWidthMm}mm` : 'A4',
      options.jobId,
      'RUNTIME_EXCEPTION',
      err.message,
      err.stack || String(err)
    );
    return { success: false, error: err.message };
  } finally {
    decrementPrintsCounter();
  }
});

ipcMain.handle('print-html-job', async (event, { html, widthMm, heightMm }) => {
  incrementPrintsCounter();
  try {
    console.log(`[PRINT-HTML-JOB] Received print job. Dimensions: ${widthMm}x${heightMm}mm`);
    let tempFilePath = '';
    tempFilePath = path.join(app.getPath('temp'), `print_html_job_temp_${Date.now()}_${Math.floor(Math.random() * 1000)}.html`);
    fs.writeFileSync(tempFilePath, html || '', 'utf8');

    return new Promise((resolve) => {
      const printWin = new BrowserWindow({
        show: false,
        webPreferences: {
          nodeIntegration: false,
          contextIsolation: true
        }
      });

      printWin.loadFile(tempFilePath);

      printWin.webContents.once('did-finish-load', async () => {
        // Wait briefly for rendering to complete
        await new Promise(r => setTimeout(r, 300));

        try {
          const widthMicrons = Math.round((typeof widthMm === 'number' ? widthMm : parseFloat(widthMm)) * 1000);
          const heightMicrons = Math.round((typeof heightMm === 'number' ? heightMm : parseFloat(heightMm)) * 1000);

          console.log(`[PRINT-HTML-JOB] Resolved physical canvas dimensions: ${widthMicrons}x${heightMicrons} microns`);

          printWin.webContents.print({
            silent: true,
            printBackground: true,
            margins: { marginType: 'none' },
            pageSize: {
              width: widthMicrons,
              height: heightMicrons
            }
          }, (success, failureReason) => {
            printWin.destroy();
            try { if (fs.existsSync(tempFilePath)) fs.unlinkSync(tempFilePath); } catch (_) {}

            if (success) {
              console.log('[PRINT-HTML-JOB] Document successfully spooled on hardware driver.');
              resolve({ success: true });
            } else {
              const errMsg = `Falha na impressora física: ${failureReason || 'Cancelado ou indisponível.'}`;
              console.error(`[PRINT-HTML-JOB] ${errMsg}`);
              resolve({ success: false, error: errMsg });
            }
          });
        } catch (err) {
          printWin.destroy();
          try { if (fs.existsSync(tempFilePath)) fs.unlinkSync(tempFilePath); } catch (_) {}
          console.error('[PRINT-HTML-JOB] Internal exception in printer dispatch:', err);
          resolve({ success: false, error: err.message });
        }
      });

      printWin.webContents.once('did-fail-load', (errCode, errDesc) => {
        printWin.destroy();
        try { if (fs.existsSync(tempFilePath)) fs.unlinkSync(tempFilePath); } catch (_) {}
        const errorText = `Erro ao carregar HTML temporário: ${errDesc}`;
        console.error(`[PRINT-HTML-JOB] ${errorText}`);
        resolve({ success: false, error: errorText });
      });
    });
  } catch (err) {
    console.error('[PRINT-HTML-JOB] Handler exception:', err);
    try { if (tempFilePath && fs.existsSync(tempFilePath)) fs.unlinkSync(tempFilePath); } catch (_) {}
    return { success: false, error: err.message };
  } finally {
    decrementPrintsCounter();
  }
});

ipcMain.handle('generate-pdf-from-html', async (event, { html, paperSize, orientation, paperWidthMm, paperHeightMm, scale }) => {
  console.log(`[GEN-PDF] Generating PDF from html with webContents.printToPDF. Size: "${paperSize}", Orientation: "${orientation}", Width: ${paperWidthMm}, Height: ${paperHeightMm}, Scale: ${scale}`);
  let tempHtmlPath = '';
  try {
    tempHtmlPath = path.join(app.getPath('temp'), `pdf_gen_temp_${Date.now()}_${Math.floor(Math.random() * 1000)}.html`);
    fs.writeFileSync(tempHtmlPath, html, 'utf8');
    
    return new Promise((resolve) => {
      const pdfWin = new BrowserWindow({
        show: false,
        webPreferences: {
          nodeIntegration: false,
          contextIsolation: true
        }
      });
      
      pdfWin.loadFile(tempHtmlPath);
      
      pdfWin.webContents.once('did-finish-load', async () => {
        await new Promise(r => setTimeout(r, 400));
        
        try {
          const paperDims = resolvePhysicalPaperDimensions({
            driverPaperName: paperSize, // paperSize aqui é o erp id ('A6', '80mm', etc)
            paperWidthMm: typeof paperWidthMm === 'number' ? paperWidthMm : parseFloat(paperWidthMm),
            paperHeightMm: (paperHeightMm === 'auto' || !paperHeightMm) ? null : Number(paperHeightMm)
          });

          const options = {
            printBackground: true,
            marginsType: 1, // none (uses @page in HTML)
            landscape: orientation === 'landscape',
            preferCSSPageSize: true,
            scaleFactor: typeof scale === 'number' && scale > 0 ? (scale > 10 ? scale / 100 : scale) : 1.0
          };
          
          if (!paperDims.isRoll) {
            options.pageSize = { width: paperDims.widthMicrons, height: paperDims.heightMicrons };
          }
          
          const pdfBuffer = await pdfWin.webContents.printToPDF(options);
          pdfWin.destroy();
          try { if (fs.existsSync(tempHtmlPath)) fs.unlinkSync(tempHtmlPath); } catch (_) {}
          
          resolve({ success: true, pdfBase64: pdfBuffer.toString('base64') });
        } catch (err) {
          pdfWin.destroy();
          try { if (fs.existsSync(tempHtmlPath)) fs.unlinkSync(tempHtmlPath); } catch (_) {}
          resolve({ success: false, error: err.message });
        }
      });
      
      pdfWin.webContents.once('did-fail-load', (errCode, errDesc) => {
        pdfWin.destroy();
        try { if (fs.existsSync(tempHtmlPath)) fs.unlinkSync(tempHtmlPath); } catch (_) {}
        resolve({ success: false, error: `Erro ao carregar HTML: ${errDesc}` });
      });
    });
  } catch (err) {
    console.error('[GEN-PDF] Exception in generate-pdf-from-html handler:', err);
    try { if (tempHtmlPath && fs.existsSync(tempHtmlPath)) fs.unlinkSync(tempHtmlPath); } catch (_) {}
    return { success: false, error: err.message };
  }
});

ipcMain.handle('save-pdf-dialog', async (event, { pdfBase64, defaultFilename }) => {
  try {
    const { filePath } = await dialog.showSaveDialog({
      title: 'Salvar Documento PDF',
      defaultPath: defaultFilename || 'documento.pdf',
      filters: [
        { name: 'Documentos PDF (*.pdf)', extensions: ['pdf'] }
      ]
    });
    
    if (filePath) {
      const buffer = Buffer.from(pdfBase64.replace(/^data:application\/pdf;base64,/, ''), 'base64');
      fs.writeFileSync(filePath, buffer);
      return { success: true, filePath };
    }
    return { success: false, error: 'Usuário cancelou o salvamento.' };
  } catch (err) {
    console.error('[SAVE-PDF-DIALOG] Exception in save-pdf-dialog:', err);
    return { success: false, error: err.message };
  }
});

ipcMain.handle('get-desktop-environment', () => {
  return {
    isElectron: true,
    platform: process.platform,
    arch: process.arch,
    nodeVersion: process.versions.node,
    chromeVersion: process.versions.chrome,
    electronVersion: process.versions.electron,
    osRelease: os.release(),
    osType: os.type()
  };
});

ipcMain.handle('get-connected-screens', () => {
  const { screen } = require('electron');
  try {
    const displays = screen.getAllDisplays();
    const primary = screen.getPrimaryDisplay();
    return displays.map((d, index) => ({
      id: d.id,
      label: d.id === primary.id ? 'Tela Principal (Notebook / Local)' : `Monitor Secundário ${index}`,
      isPrimary: d.id === primary.id,
      left: d.bounds.x,
      top: d.bounds.y,
      width: d.bounds.width,
      height: d.bounds.height
    }));
  } catch (err) {
    console.error('Error getting electron displays:', err);
    return [];
  }
});

// Monitor screen changes to auto-adjust Kiosk window positioning if displays are disconnected or modified
function setupScreenListeners() {
  screen.on('display-removed', (event, oldDisplay) => {
    if (kioskWindow && !kioskWindow.isDestroyed()) {
      const displays = screen.getAllDisplays();
      const primaryDisplay = screen.getPrimaryDisplay();
      const kioskBounds = kioskWindow.getBounds();
      
      // Check if the current kiosk window center/position is located on an active display
      const isStillOnAnActiveDisplay = displays.some(d => {
        const wa = d.workArea;
        return (
          kioskBounds.x >= wa.x &&
          kioskBounds.x < wa.x + wa.width &&
          kioskBounds.y >= wa.y &&
          kioskBounds.y < wa.y + wa.height
        );
      });

      if (!isStillOnAnActiveDisplay) {
        kioskWindow.setBounds(primaryDisplay.workArea);
        kioskWindow.unmaximize();
        if (isTotemSecondScreenLocked) {
          isTotemSecondScreenLocked = false;
          lockedDisplayId = null;
          lockedBounds = null;
          kioskWindow.setClosable(true);
          kioskWindow.setMinimizable(true);
          kioskWindow.setMaximizable(true);
        }
      }
    }
  });

  screen.on('display-added', () => {
    // Safe listener for display additions
  });

  screen.on('display-metrics-changed', () => {
    if (kioskWindow && !kioskWindow.isDestroyed() && isTotemSecondScreenLocked && lockedDisplayId) {
      const displays = screen.getAllDisplays();
      const hasLockedDisplay = displays.some(d => d.id === lockedDisplayId);
      if (!hasLockedDisplay) {
        isTotemSecondScreenLocked = false;
        lockedDisplayId = null;
        lockedBounds = null;
        kioskWindow.setClosable(true);
        kioskWindow.setMinimizable(true);
        kioskWindow.setMaximizable(true);
        kioskWindow.setBounds(screen.getPrimaryDisplay().workArea);
      }
    }
  });
}

ipcMain.handle('open-kiosk-window', async () => {
  const displays = screen.getAllDisplays();
  const primaryDisplay = screen.getPrimaryDisplay();
  const secondaryDisplay = displays.find(d => d.id !== primaryDisplay.id);

  if (kioskWindow && !kioskWindow.isDestroyed()) {
    if (secondaryDisplay) {
      kioskWindow.setBounds(secondaryDisplay.workArea);
      kioskWindow.maximize();
    } else {
      kioskWindow.setBounds(primaryDisplay.workArea);
    }
    kioskWindow.focus();
    return { success: true, alreadyOpen: true, secondScreen: !!secondaryDisplay };
  }

  const targetDisplay = secondaryDisplay || primaryDisplay;
  const { x, y, width, height } = targetDisplay.workArea;

  kioskWindow = new BrowserWindow({
    x: x,
    y: y,
    width: width || 1024,
    height: height || 768,
    frame: true,
    autoHideMenuBar: true,
    resizable: true,
    minimizable: true,
    maximizable: true,
    closable: true,
    movable: true,
    backgroundColor: '#070707',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.cjs')
    },
    title: "Terminal Autoatendimento",
    show: false
  });

  kioskWindow.setMenu(null);

  kioskWindow.on('close', (event) => {
    if (isTotemSecondScreenLocked) {
      event.preventDefault();
    }
  });

  kioskWindow.on('minimize', (event) => {
    if (isTotemSecondScreenLocked) {
      event.preventDefault();
      kioskWindow.restore();
    }
  });

  kioskWindow.on('maximize', (event) => {
    if (isTotemSecondScreenLocked) {
      event.preventDefault();
      kioskWindow.unmaximize();
    }
  });

  kioskWindow.on('will-move', (event, newBounds) => {
    if (isTotemSecondScreenLocked && lockedDisplayId) {
      const display = screen.getDisplayMatching(newBounds);
      if (display.id !== lockedDisplayId) {
        event.preventDefault();
      }
    }
  });

  kioskWindow.on('move', () => {
    if (isTotemSecondScreenLocked && lockedDisplayId && lockedBounds) {
      const display = screen.getDisplayMatching(kioskWindow.getBounds());
      if (display.id !== lockedDisplayId) {
        kioskWindow.setBounds(lockedBounds);
      }
    }
  });

  kioskWindow.webContents.on('devtools-opened', () => {
    if (!isDev) {
      kioskWindow.webContents.closeDevTools();
    }
  });

  kioskWindow.webContents.on('will-navigate', (e, url) => {
    if (!url.startsWith('http://localhost') && !url.startsWith('file://')) {
      e.preventDefault();
    }
  });

  if (isDev) {
    kioskWindow.loadURL('http://localhost:3000/#/pdv-totem/kiosk');
  } else {
    kioskWindow.loadFile(path.join(__dirname, '../dist/index.html'), { hash: '/pdv-totem/kiosk' });
  }

  kioskWindow.once('ready-to-show', () => {
    kioskWindow.show();
    if (secondaryDisplay) {
      kioskWindow.maximize();
    }
  });

  kioskWindow.on('closed', () => {
    kioskWindow = null;
    isTotemSecondScreenLocked = false;
    lockedDisplayId = null;
    lockedBounds = null;
  });

  return { success: true, secondScreen: !!secondaryDisplay };
});

ipcMain.handle('close-kiosk-window', async (event) => {
  const win = BrowserWindow.fromWebContents(event.sender) || kioskWindow;
  if (win && !win.isDestroyed()) {
    win.destroy();
    if (win === kioskWindow) {
      kioskWindow = null;
    }
    return { success: true };
  }
  return { success: false, error: 'Kiosk window is not open.' };
});

ipcMain.handle('reload-kiosk-window', async (event) => {
  const win = BrowserWindow.fromWebContents(event.sender) || kioskWindow;
  if (win && !win.isDestroyed()) {
    win.webContents.reload();
    return { success: true };
  }
  return { success: false, error: 'Kiosk window is not open.' };
});

ipcMain.handle('toggle-kiosk-fullscreen', async (event) => {
  const win = BrowserWindow.fromWebContents(event.sender) || kioskWindow;
  if (win && !win.isDestroyed()) {
    const isCurrentlyKiosk = win.isKiosk();
    const nextState = !isCurrentlyKiosk;

    if (nextState) {
      // Find matching physical display where this terminal window is currently located
      const display = screen.getDisplayMatching(win.getBounds());
      
      // Force window to occupy the correct physical display workArea bounds entirely
      win.setBounds(display.workArea);

      // Disable window controls, dragging, closing, resizing, and system chrome
      win.setMovable(false);
      win.setResizable(false);
      win.setClosable(false);
      win.setMinimizable(false);
      win.setMaximizable(false);

      // Trigger native kiosk and full screen containment
      win.setKiosk(true);
      win.setFullScreen(true);
    } else {
      // Deactivate kiosk native restrictions
      win.setKiosk(false);
      win.setFullScreen(false);

      // Restore native window frame chrome, draggable capacity, resizing, and controllers
      win.setMovable(true);
      win.setResizable(true);
      win.setClosable(true);
      win.setMinimizable(true);
      win.setMaximizable(true);
    }

    return { success: true, isKiosk: nextState };
  }
  return { success: false, error: 'Kiosk window is not open.' };
});

ipcMain.handle('get-kiosk-status', async (event) => {
  const win = BrowserWindow.fromWebContents(event.sender) || kioskWindow;
  const isOpen = win !== null && !win.isDestroyed();
  return {
    isOpen,
    isKiosk: isOpen ? win.isKiosk() : false,
    isFullscreen: isOpen ? win.isFullScreen() : false
  };
});

ipcMain.handle('totem:lock-second-screen', async (event) => {
  const win = BrowserWindow.fromWebContents(event.sender) || kioskWindow;
  if (win && !win.isDestroyed()) {
    const display = screen.getDisplayMatching(win.getBounds());
    lockedDisplayId = display.id;
    lockedBounds = win.getBounds();
    isTotemSecondScreenLocked = true;

    // Apply native constraints to the window to block close/minimize/maximize buttons
    win.setClosable(false);
    win.setMinimizable(false);
    win.setMaximizable(false);

    // Enter real, native fullscreen to hide the OS taskbar and title bar (X, minimize, maximize)
    win.setFullScreen(true);

    return { success: true };
  }
  return { success: false, error: 'Kiosk window is not open.' };
});

ipcMain.handle('totem:unlock-second-screen', async (event) => {
  isTotemSecondScreenLocked = false;
  lockedDisplayId = null;

  const win = BrowserWindow.fromWebContents(event.sender) || kioskWindow;
  if (win && !win.isDestroyed()) {
    // Restore native window constraints
    win.setClosable(true);
    win.setMinimizable(true);
    win.setMaximizable(true);

    // Exit fullscreen
    win.setFullScreen(false);

    // Restore original windowed bounds
    if (lockedBounds) {
      win.setBounds(lockedBounds);
    }
  }
  
  lockedBounds = null;
  return { success: true };
});

ipcMain.handle('totem:get-second-screen-lock-state', async () => {
  return isTotemSecondScreenLocked;
});

ipcMain.handle('open-totem-control-window', async () => {
  if (totemControlWindow && !totemControlWindow.isDestroyed()) {
    totemControlWindow.focus();
    return { success: true, alreadyOpen: true };
  }

  totemControlWindow = new BrowserWindow({
    width: 1024,
    height: 768,
    frame: true,
    autoHideMenuBar: true,
    resizable: true,
    backgroundColor: '#070707',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.cjs')
    },
    title: "Painel de Controle Assistido (Operador)"
  });

  totemControlWindow.setMenu(null);

  if (isDev) {
    totemControlWindow.loadURL('http://localhost:3000/#/pdv-totem/kiosk?control=true');
  } else {
    totemControlWindow.loadFile(path.join(__dirname, '../dist/index.html'), { hash: '/pdv-totem/kiosk', query: { control: 'true' } });
  }

  totemControlWindow.on('closed', () => {
    totemControlWindow = null;
  });

  return { success: true };
});

ipcMain.handle('open-customer-display-window', async () => {
  if (customerDisplayWindow && !customerDisplayWindow.isDestroyed()) {
    customerDisplayWindow.focus();
    return { success: true, alreadyOpen: true };
  }

  customerDisplayWindow = new BrowserWindow({
    width: 1024,
    height: 768,
    frame: true,
    autoHideMenuBar: true,
    resizable: true,
    backgroundColor: '#070707',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.cjs')
    },
    title: "Exibição do Cliente - Nexa ERP"
  });

  customerDisplayWindow.setMenu(null);

  if (isDev) {
    customerDisplayWindow.loadURL('http://localhost:3000/#/pdv/customer-display');
  } else {
    customerDisplayWindow.loadFile(path.join(__dirname, '../dist/index.html'), { hash: '/pdv/customer-display' });
  }

  customerDisplayWindow.on('closed', () => {
    customerDisplayWindow = null;
  });

  return { success: true };
});

ipcMain.handle('google-drive:connect', async (event, args) => {
  const clientId = (args && args.clientId) || process.env.GOOGLE_CLIENT_ID;
  const clientSecret = (args && args.clientSecret) || process.env.GOOGLE_CLIENT_SECRET || '';

  if (!clientId) {
    return { 
      success: false, 
      error: 'ID do Cliente Google não configurado para o Desktop. Por favor, configure a chave GOOGLE_CLIENT_ID no seu painel ou no arquivo .env.' 
    };
  }

  const http = require('http');

  return new Promise((resolve) => {
    let server;
    let finished = false;

    const cleanup = () => {
      if (server) {
        try {
          server.close();
        } catch (e) {}
        server = null;
      }
    };

    // Timeout of 3 minutes (180000 ms)
    const timeoutId = setTimeout(() => {
      if (!finished) {
        finished = true;
        cleanup();
        resolve({ success: false, error: 'Tempo limite esgotado. A conexão com o Google Drive não foi autorizada a tempo.' });
      }
    }, 180000);

    server = http.createServer(async (req, res) => {
      const reqUrl = req.url || '';
      if (reqUrl.includes('/oauth-callback')) {
        const parsedUrl = new URL(reqUrl, `http://${req.headers.host || 'localhost'}`);
        const code = parsedUrl.searchParams.get('code');
        const errParam = parsedUrl.searchParams.get('error');

        if (errParam) {
          res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
          res.end('<h1>Conexão Cancelada</h1><p>Autorização negada pelo usuário ou ocorreu um erro. Você já pode fechar esta guia.</p>');
          if (!finished) {
            finished = true;
            clearTimeout(timeoutId);
            cleanup();
            resolve({ success: false, error: `Google OAuth error: ${errParam}` });
          }
          return;
        }

        if (code) {
          res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
          res.end('<h1>Conexão Concluída!</h1><p>O Nexa ERP Industrial foi autorizado com sucesso no seu Google Drive. Você já pode fechar esta guia e retornar para o aplicativo.</p>');
          
          if (!finished) {
            finished = true;
            clearTimeout(timeoutId);
            const boundPort = server.address().port;
            cleanup();

            try {
              // Exchange code for tokens
              const redirectUri = `http://localhost:${boundPort}/oauth-callback`;
              const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
                method: 'POST',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                body: new URLSearchParams({
                  code: code,
                  client_id: clientId,
                  client_secret: clientSecret,
                  redirect_uri: redirectUri,
                  grant_type: 'authorization_code'
                })
              });

              if (!tokenResponse.ok) {
                const errBody = await tokenResponse.text();
                throw new Error(`Troca de token falhou: ${tokenResponse.statusText} (${errBody})`);
              }

              const tokens = await tokenResponse.json();

              // Get User Profile
              let googleUser = { displayName: 'Usuário Nexa GDrive', email: '', photoURL: null };
              try {
                const userResponse = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
                  headers: { 'Authorization': `Bearer ${tokens.access_token}` }
                });
                if (userResponse.ok) {
                  const u = await userResponse.json();
                  googleUser = {
                    displayName: u.name || u.given_name || 'Usuário Nexa GDrive',
                    email: u.email || '',
                    photoURL: u.picture || null
                  };
                }
              } catch (uErr) {
                console.warn('[GoogleDriveService][Desktop] Falha ao obter dados do perfil:', uErr);
              }

              resolve({
                success: true,
                tokens: {
                  accessToken: tokens.access_token,
                  refreshToken: tokens.refresh_token || '',
                  expiresIn: tokens.expires_in,
                  createdAt: Date.now()
                },
                user: googleUser
              });
            } catch (exchangeErr) {
              resolve({ success: false, error: exchangeErr.message });
            }
          }
        } else {
          res.writeHead(400, { 'Content-Type': 'text/html; charset=utf-8' });
          res.end('<h1>Código Inválido</h1><p>Falta o código de autorização.</p>');
        }
      } else {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end('Not Found');
      }
    });

    server.listen(0, '127.0.0.1', () => {
      const port = server.address().port;
      const redirectUri = `http://localhost:${port}/oauth-callback`;
      
      const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?` + new URLSearchParams({
        client_id: clientId,
        redirect_uri: redirectUri,
        response_type: 'code',
        scope: 'https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/userinfo.profile https://www.googleapis.com/auth/userinfo.email',
        access_type: 'offline',
        prompt: 'consent'
      }).toString();

      shell.openExternal(authUrl).catch(e => {
        finished = true;
        clearTimeout(timeoutId);
        cleanup();
        resolve({ success: false, error: `Não foi possível abrir o navegador: ${e.message}` });
      });
    });
  });
});

ipcMain.handle('google-drive:refresh', async (event, args) => {
  const refreshToken = args && args.refreshToken;
  const clientId = (args && args.clientId) || process.env.GOOGLE_CLIENT_ID;
  const clientSecret = (args && args.clientSecret) || process.env.GOOGLE_CLIENT_SECRET || '';

  if (!refreshToken) {
    return { success: false, error: 'Token de atualização (Refresh Token) ausente.' };
  }
  if (!clientId) {
    return { success: false, error: 'Chave GOOGLE_CLIENT_ID ausente para atualização de token.' };
  }

  try {
    const response = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        refresh_token: refreshToken,
        grant_type: 'refresh_token'
      })
    });

    if (!response.ok) {
      const errBody = await response.text();
      return { success: false, error: `Falha na renovação do token do Google Drive: ${errBody}` };
    }

    const data = await response.json();
    return {
      success: true,
      accessToken: data.access_token,
      expiresIn: data.expires_in,
      createdAt: Date.now()
    };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

if (process.platform === 'linux') {
  app.commandLine.appendSwitch('enable-features', 'WebRTCPipeWireCapturer');
}

app.whenReady().then(() => {
  setupScreenListeners();
  nfcService.initialize();
  if (session && session.defaultSession) {
    session.defaultSession.setPermissionRequestHandler((webContents, permission, callback) => {
      if (['media', 'camera', 'video', 'microphone', 'audio', 'notifications'].includes(permission)) {
        callback(true);
        return;
      }
      callback(false);
    });

    session.defaultSession.setPermissionCheckHandler((webContents, permission) => {
      if (['media', 'camera', 'video', 'microphone', 'audio'].includes(permission)) {
        return true;
      }
      return false;
    });

    session.defaultSession.setDevicePermissionHandler((details) => {
      if (['camera', 'media', 'microphone', 'video', 'audio'].includes(details.deviceType)) {
        return true;
      }
      return false;
    });
  }

  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', () => {
  try {
    dbService.closeDatabase();
  } catch (err) {
    console.error('[Main/Cleanup] Error closing SQLite database on exit:', err);
  }
  if (localHttpServer) {
    try { localHttpServer.close(); } catch (_) {}
    localHttpServer = null;
  }
  if (localWss) {
    try { localWss.close(); } catch (_) {}
    localWss = null;
  }
  for (const client of activeWsClients) {
    try { client.terminate(); } catch (_) {}
  }
  activeWsClients.clear();
  console.log('[Main/Cleanup] Cleaned up HTTP and WS servers before quit.');
});
