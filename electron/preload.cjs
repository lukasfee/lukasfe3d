const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electron', {
  isTestEnvironment: ipcRenderer.sendSync('get-env-mode') === 'teste',
  checkFileExists: (filePath) => {
    if (typeof filePath !== 'string') return Promise.resolve({ success: false });
    return ipcRenderer.invoke('check-file-exists', filePath);
  },
  clearDebugDumps: () => ipcRenderer.invoke('clear-debug-dumps'),
  googleDriveConnect: (args) => ipcRenderer.invoke('google-drive:connect', args),
  googleDriveRefresh: (args) => ipcRenderer.invoke('google-drive:refresh', args),
  getLocalIP: () => ipcRenderer.invoke('get-local-ip'),
  startLocalServer: (port) => {
    const parsed = parseInt(port, 10);
    return ipcRenderer.invoke('start-local-server', isNaN(parsed) ? 3100 : parsed);
  },
  getAppVersion: () => ipcRenderer.invoke('get-app-version'),
  getSystemPrinters: () => ipcRenderer.invoke('get-system-printers'),
  listPrinters: () => ipcRenderer.invoke('list-printers'),
  getPrinterMediaOptions: (printerName) => ipcRenderer.invoke('get-printer-media-options', printerName),
  printDocument: (html, widthMm, heightMm) => ipcRenderer.invoke('print-html-job', { html, widthMm, heightMm }),
  printPdf: (options) => ipcRenderer.invoke('print-pdf', options),
  generatePdfFromHtml: (options) => ipcRenderer.invoke('generate-pdf-from-html', options),
  savePdfDialog: (options) => ipcRenderer.invoke('save-pdf-dialog', options),
  checkForUpdates: () => ipcRenderer.invoke('check-for-updates'),
  restartApp: () => ipcRenderer.invoke('restart-app'),
  onAppCloseTriggered: (callback) => {
    const listener = (_, data) => callback(data);
    ipcRenderer.on('app-close-triggered', listener);
    return () => ipcRenderer.removeListener('app-close-triggered', listener);
  },
  forceQuit: () => ipcRenderer.invoke('app:force-quit'),
  generatePairingPin: () => ipcRenderer.invoke('generate-pairing-pin'),
  getPairingPin: () => ipcRenderer.invoke('get-pairing-pin'),
  getLocalDevices: () => ipcRenderer.invoke('get-local-devices'),
  setDeviceStatus: (deviceId, action, token, name) => {
    if (typeof deviceId !== 'string' || typeof action !== 'string') {
      return Promise.resolve({ success: false, error: 'Parâmetros inválidos.' });
    }
    return ipcRenderer.invoke('set-device-status', { deviceId, action, token, name });
  },
  getPairingAuditLogs: () => ipcRenderer.invoke('get-pairing-audit-logs'),
  clearPairingAuditLogs: () => ipcRenderer.invoke('clear-pairing-audit-logs'),
  onNewPairingRequest: (callback) => {
    const listener = (_, data) => callback(data);
    ipcRenderer.on('new-pairing-request', listener);
    return () => ipcRenderer.removeListener('new-pairing-request', listener);
  },
  onNewPairingAudit: (callback) => {
    const listener = (_, data) => callback(data);
    ipcRenderer.on('new-pairing-audit', listener);
    return () => ipcRenderer.removeListener('new-pairing-audit', listener);
  },
  onSyncIncomingMutations: (callback) => {
    const listener = (_, data) => callback(data);
    ipcRenderer.on('sync-incoming-mutations', listener);
    return () => ipcRenderer.removeListener('sync-incoming-mutations', listener);
  },
  onUpdateStatus: (callback) => {
    const listener = (_, data) => callback(data);
    ipcRenderer.on('update-status', listener);
    return () => ipcRenderer.removeListener('update-status', listener);
  },
  onUpdateProgress: (callback) => {
    const listener = (_, data) => callback(data);
    ipcRenderer.on('update-progress', listener);
    return () => ipcRenderer.removeListener('update-progress', listener);
  },
  onNfcTagRead: (callback) => {
    const listener = (_, uid) => callback(uid);
    ipcRenderer.on('nfc-tag-read', listener);
    return () => ipcRenderer.removeListener('nfc-tag-read', listener);
  },
  simulateNFCScan: (uid) => ipcRenderer.invoke('simulate-nfc-scan', uid),
  openKioskWindow: () => ipcRenderer.invoke('open-kiosk-window'),
  closeKioskWindow: () => ipcRenderer.invoke('close-kiosk-window'),
  reloadKioskWindow: () => ipcRenderer.invoke('reload-kiosk-window'),
  toggleKioskFullscreen: () => ipcRenderer.invoke('toggle-kiosk-fullscreen'),
  getKioskStatus: () => ipcRenderer.invoke('get-kiosk-status'),
  openTotemControlWindow: () => ipcRenderer.invoke('open-totem-control-window'),
  openCustomerDisplayWindow: () => ipcRenderer.invoke('open-customer-display-window'),
  getPhysicalPrintErrors: () => ipcRenderer.invoke('get-physical-print-errors'),
  clearPhysicalPrintErrors: () => ipcRenderer.invoke('clear-physical-print-errors'),
  getConnectedScreens: () => ipcRenderer.invoke('get-connected-screens'),
  totem: {
    lockSecondScreen: () => ipcRenderer.invoke('totem:lock-second-screen'),
    unlockSecondScreen: () => ipcRenderer.invoke('totem:unlock-second-screen'),
    getSecondScreenLockState: () => ipcRenderer.invoke('totem:get-second-screen-lock-state')
  },
  db: {
    insertAuditLog: (log) => ipcRenderer.invoke('db:insertAuditLog', log),
    listAuditLogs: (limit) => ipcRenderer.invoke('db:listAuditLogs', limit),
    insertActivity: (act) => ipcRenderer.invoke('db:insertActivity', act),
    listActivities: (limit) => ipcRenderer.invoke('db:listActivities', limit),
    insertNfcPresenceRecord: (rec) => ipcRenderer.invoke('db:insertNfcPresenceRecord', rec),
    listNfcPresenceRecords: (limit) => ipcRenderer.invoke('db:listNfcPresenceRecords', limit),
    saveBackupFile: (backupId, backupDataObj) => ipcRenderer.invoke('db:saveBackupFile', backupId, backupDataObj),
    listBackupFiles: () => ipcRenderer.invoke('db:listBackupFiles'),
    loadBackupFileContent: (filename) => ipcRenderer.invoke('db:loadBackupFileContent', filename),
    
    // Products (Fase 3)
    insertProduct: (product) => ipcRenderer.invoke('db:insertProduct', product),
    updateProduct: (id, product) => ipcRenderer.invoke('db:updateProduct', id, product),
    deleteProduct: (id) => ipcRenderer.invoke('db:deleteProduct', id),
    listProducts: () => ipcRenderer.invoke('db:listProducts'),

    // Clients (Fase 3)
    insertClient: (client) => ipcRenderer.invoke('db:insertClient', client),
    updateClient: (id, client) => ipcRenderer.invoke('db:updateClient', id, client),
    deleteClient: (id) => ipcRenderer.invoke('db:deleteClient', id),
    listClients: () => ipcRenderer.invoke('db:listClients'),

    // Categories (Fase 3)
    insertCategory: (category) => ipcRenderer.invoke('db:insertCategory', category),
    updateCategory: (id, category) => ipcRenderer.invoke('db:updateCategory', id, category),
    deleteCategory: (id) => ipcRenderer.invoke('db:deleteCategory', id),
    listCategories: () => ipcRenderer.invoke('db:listCategories'),

    // Subcategories (Fase 3)
    insertSubcategory: (sub) => ipcRenderer.invoke('db:insertSubcategory', sub),
    updateSubcategory: (id, sub) => ipcRenderer.invoke('db:updateSubcategory', id, sub),
    deleteSubcategory: (id) => ipcRenderer.invoke('db:deleteSubcategory', id),
    deleteSubcategoriesByCategoryId: (categoryId) => ipcRenderer.invoke('db:deleteSubcategoriesByCategoryId', categoryId),
    listSubcategories: () => ipcRenderer.invoke('db:listSubcategories'),

    // Sales (Fase 4)
    insertSale: (sale) => ipcRenderer.invoke('db:insertSale', sale),
    updateSale: (id, sale) => ipcRenderer.invoke('db:updateSale', id, sale),
    deleteSale: (id) => ipcRenderer.invoke('db:deleteSale', id),
    listSales: () => ipcRenderer.invoke('db:listSales'),

    // Pre Orders (Fase 4)
    insertPreOrder: (order) => ipcRenderer.invoke('db:insertPreOrder', order),
    updatePreOrder: (id, order) => ipcRenderer.invoke('db:updatePreOrder', id, order),
    deletePreOrder: (id) => ipcRenderer.invoke('db:deletePreOrder', id),
    listPreOrders: () => ipcRenderer.invoke('db:listPreOrders'),

    // Cashier Sessions (Fase 4)
    insertCashierSession: (session) => ipcRenderer.invoke('db:insertCashierSession', session),
    updateCashierSession: (id, session) => ipcRenderer.invoke('db:updateCashierSession', id, session),
    listCashierSessions: () => ipcRenderer.invoke('db:listCashierSessions'),

    // Financial Transactions (Fase 4)
    insertFinancialTransaction: (transaction) => ipcRenderer.invoke('db:insertFinancialTransaction', transaction),
    updateFinancialTransaction: (id, transaction) => ipcRenderer.invoke('db:updateFinancialTransaction', id, transaction),
    listFinancialTransactions: () => ipcRenderer.invoke('db:listFinancialTransactions'),

    // Sync Queue (Fase 5A)
    insertSyncQueueItem: (item) => ipcRenderer.invoke('db:insertSyncQueueItem', item),
    updateSyncQueueItem: (id, item) => ipcRenderer.invoke('db:updateSyncQueueItem', id, item),
    deleteSyncQueueItem: (id) => ipcRenderer.invoke('db:deleteSyncQueueItem', id),
    listSyncQueue: () => ipcRenderer.invoke('db:listSyncQueue'),

    // Tombstones (Fase 5A)
    insertTombstone: (tombstone) => ipcRenderer.invoke('db:insertTombstone', tombstone),
    listTombstones: () => ipcRenderer.invoke('db:listTombstones'),
    deleteTombstone: (id) => ipcRenderer.invoke('db:deleteTombstone', id),

    // Productions, Production Runs, Materials, Machines, Returns & Consignments (Fase 5B)
    insertProduction: (production) => ipcRenderer.invoke('db:insertProduction', production),
    updateProduction: (id, production) => ipcRenderer.invoke('db:updateProduction', id, production),
    listProductions: () => ipcRenderer.invoke('db:listProductions'),

    insertProductionRun: (run) => ipcRenderer.invoke('db:insertProductionRun', run),
    updateProductionRun: (id, run) => ipcRenderer.invoke('db:updateProductionRun', id, run),
    listProductionRuns: () => ipcRenderer.invoke('db:listProductionRuns'),

    insertMaterial: (material) => ipcRenderer.invoke('db:insertMaterial', material),
    updateMaterial: (id, material) => ipcRenderer.invoke('db:updateMaterial', id, material),
    listMaterials: () => ipcRenderer.invoke('db:listMaterials'),

    insertMachine: (machine) => ipcRenderer.invoke('db:insertMachine', machine),
    updateMachine: (id, machine) => ipcRenderer.invoke('db:updateMachine', id, machine),
    listMachines: () => ipcRenderer.invoke('db:listMachines'),

    insertReturn: (ret) => ipcRenderer.invoke('db:insertReturn', ret),
    updateReturn: (id, ret) => ipcRenderer.invoke('db:updateReturn', id, ret),
    listReturns: () => ipcRenderer.invoke('db:listReturns'),

    insertConsignment: (consignment) => ipcRenderer.invoke('db:insertConsignment', consignment),
    updateConsignment: (id, consignment) => ipcRenderer.invoke('db:updateConsignment', id, consignment),
    listConsignments: () => ipcRenderer.invoke('db:listConsignments'),
    setSaleOpen: (isOpen) => ipcRenderer.invoke('db:setSaleOpen', isOpen),
    setCriticalOperationActive: (isActive) => ipcRenderer.invoke('db:setCriticalOperationActive', isActive),
    getMetrics: () => ipcRenderer.invoke('db:getMetrics'),
    createSnapshotManual: () => ipcRenderer.invoke('db:createSnapshotManual'),

    // New global settings and user fields
    insertUser: (user) => ipcRenderer.invoke('db:insertUser', user),
    updateUser: (id, user) => ipcRenderer.invoke('db:updateUser', id, user),
    deleteUser: (id) => ipcRenderer.invoke('db:deleteUser', id),
    listUsers: () => ipcRenderer.invoke('db:listUsers'),

    insertPermission: (perm) => ipcRenderer.invoke('db:insertPermission', perm),
    updatePermission: (id, perm) => ipcRenderer.invoke('db:updatePermission', id, perm),
    deletePermission: (id) => ipcRenderer.invoke('db:deletePermission', id),
    listPermissions: () => ipcRenderer.invoke('db:listPermissions'),

    insertCompanySetting: (setting) => ipcRenderer.invoke('db:insertCompanySetting', setting),
    updateCompanySetting: (id, setting) => ipcRenderer.invoke('db:updateCompanySetting', id, setting),
    listCompanySettings: () => ipcRenderer.invoke('db:listCompanySettings'),

    insertSystemSetting: (setting) => ipcRenderer.invoke('db:insertSystemSetting', setting),
    updateSystemSetting: (id, setting) => ipcRenderer.invoke('db:updateSystemSetting', id, setting),
    listSystemSettings: () => ipcRenderer.invoke('db:listSystemSettings'),

    insertTerminalSetting: (setting) => ipcRenderer.invoke('db:insertTerminalSetting', setting),
    updateTerminalSetting: (id, setting) => ipcRenderer.invoke('db:updateTerminalSetting', id, setting),
    listTerminalSettings: () => ipcRenderer.invoke('db:listTerminalSettings'),

    insertPdvSetting: (setting) => ipcRenderer.invoke('db:insertPdvSetting', setting),
    updatePdvSetting: (id, setting) => ipcRenderer.invoke('db:updatePdvSetting', id, setting),
    listPdvSettings: () => ipcRenderer.invoke('db:listPdvSettings'),

    insertPdvTotemSetting: (setting) => ipcRenderer.invoke('db:insertPdvTotemSetting', setting),
    updatePdvTotemSetting: (id, setting) => ipcRenderer.invoke('db:updatePdvTotemSetting', id, setting),
    listPdvTotemSettings: () => ipcRenderer.invoke('db:listPdvTotemSettings'),

    insertKioskTerminal: (terminal) => ipcRenderer.invoke('db:insertKioskTerminal', terminal),
    updateKioskTerminal: (id, terminal) => ipcRenderer.invoke('db:updateKioskTerminal', id, terminal),
    deleteKioskTerminal: (id) => ipcRenderer.invoke('db:deleteKioskTerminal', id),
    listKioskTerminals: () => ipcRenderer.invoke('db:listKioskTerminals'),

    insertPrintSetting: (setting) => ipcRenderer.invoke('db:insertPrintSetting', setting),
    updatePrintSetting: (id, setting) => ipcRenderer.invoke('db:updatePrintSetting', id, setting),
    listPrintSettings: () => ipcRenderer.invoke('db:listPrintSettings')
  }
});

contextBridge.exposeInMainWorld('electronAPI', {
  totem: {
    lockSecondScreen: () => ipcRenderer.invoke('totem:lock-second-screen'),
    unlockSecondScreen: () => ipcRenderer.invoke('totem:unlock-second-screen'),
    getSecondScreenLockState: () => ipcRenderer.invoke('totem:get-second-screen-lock-state')
  }
});

window.addEventListener('DOMContentLoaded', () => {
  const replaceText = (selector, text) => {
    const element = document.getElementById(selector)
    if (element) element.innerText = text
  }

  for (const type of ['chrome', 'node', 'electron']) {
    replaceText(`${type}-version`, process.versions[type])
  }
});

// Watchdog heartbeat responder
ipcRenderer.on('watchdog-ping', () => {
  ipcRenderer.send('watchdog-pong');
});
