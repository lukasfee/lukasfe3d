const path = require('path');
const fs = require('fs');
const zlib = require('zlib');

const DB_FILENAME = 'nexa-local.db';

let db = null;
let Database = null;
let isInitialized = false;

let bootTimeMs = 0;
let lastQueryTime = Date.now();
let isSaleOpen = false;
let isCriticalOperationActive = false;
let activePrintJobsCount = 0;
let writeCounter = 0;

const queryMetrics = {
  counts: {},
  totals: {},
  averageMs: {}
};

function logQueryMetric(queryType, durationMs) {
  lastQueryTime = Date.now();
  if (!queryMetrics.counts[queryType]) {
    queryMetrics.counts[queryType] = 0;
    queryMetrics.totals[queryType] = 0;
  }
  queryMetrics.counts[queryType]++;
  queryMetrics.totals[queryType] += durationMs;
  queryMetrics.averageMs[queryType] = Math.round((queryMetrics.totals[queryType] / queryMetrics.counts[queryType]) * 10) / 10;
}

function incrementWriteOperation() {
  writeCounter++;
  if (writeCounter >= 100) {
    writeCounter = 0;
    triggerPassiveCheckpoint();
  }
}

function triggerPassiveCheckpoint() {
  if (!db || !isInitialized) return;
  const start = Date.now();
  try {
    db.pragma('wal_checkpoint(PASSIVE)');
    const duration = Date.now() - start;
    logQueryMetric('WAL_CHECKPOINT', duration);
    console.info(`[SQLite-HARDENING] Passive WAL checkpoint automatically executed in ${duration}ms!`);
  } catch (err) {
    console.error('[SQLite-HARDENING] Passive WAL checkpoint failed:', err);
  }
}

function canRunVacuum() {
  const idleTimeMs = Date.now() - lastQueryTime;
  const isIdle = idleTimeMs > 30000; // 30 seconds of absolute idle
  return isIdle && !isSaleOpen && !isCriticalOperationActive && activePrintJobsCount === 0;
}

function runIntelligentVacuum() {
  if (!db || !isInitialized) return;
  if (!canRunVacuum()) {
    console.info('[SQLite-HARDENING] Intelligent VACUUM deferred: database is active, in-use or printing.');
    return;
  }
  const start = Date.now();
  try {
    console.info('[SQLite-HARDENING] Idle conditions met. Running intelligent VACUUM...');
    db.exec('VACUUM;');
    const duration = Date.now() - start;
    logQueryMetric('VACUUM', duration);
    console.info(`[SQLite-HARDENING] Intelligent VACUUM completed successfully in ${duration}ms.`);
  } catch (err) {
    console.error('[SQLite-HARDENING] Intelligent VACUUM execution failed:', err);
  }
}

function createBackupSnapshot(userDataPath) {
  if (!db || !isInitialized) return Promise.resolve(false);
  const backupsPath = path.join(userDataPath, 'backups');
  if (!fs.existsSync(backupsPath)) {
    fs.mkdirSync(backupsPath, { recursive: true });
  }

  const timestamp = Date.now();
  const dbSnapFilename = `snap_erp_local_${timestamp}.db`;
  const dbSnapPath = path.join(backupsPath, dbSnapFilename);

  console.info(`[SQLite-SNAPSHOT] Initiating non-blocking database snapshot: ${dbSnapFilename}...`);
  return db.backup(dbSnapPath)
    .then(() => {
      console.info(`[SQLite-SNAPSHOT] Binary snapshot created successfully: ${dbSnapFilename}`);
      
      // Rotate `.db` backup snaps (keep max 5)
      try {
        const files = fs.readdirSync(backupsPath);
        const dbSnaps = files
          .filter(f => f.startsWith('snap_erp_local_') && f.endsWith('.db'))
          .map(f => ({ name: f, path: path.join(backupsPath, f), time: fs.statSync(path.join(backupsPath, f)).mtimeMs }))
          .sort((a, b) => b.time - a.time);

        if (dbSnaps.length > 5) {
          const toDelete = dbSnaps.slice(5);
          for (const f of toDelete) {
            fs.unlinkSync(f.path);
            console.info(`[SQLite-SNAPSHOT] Rotated out old database snapshot: ${f.name}`);
          }
        }
      } catch (rotErr) {
        console.error('[SQLite-SNAPSHOT] Rotation error:', rotErr);
      }
      return true;
    })
    .catch((err) => {
      console.error('[SQLite-SNAPSHOT] Database snapshot failed:', err);
      return false;
    });
}

function createJsonGzipSnapshot(userDataPath) {
  if (!db || !isInitialized) return;
  try {
    const backupData = {
      timestamp: Date.now(),
      tables: {}
    };

    const targetTables = ['sync_queue', 'tombstones', 'products', 'clients', 'sales'];
    for (const table of targetTables) {
      try {
        const countCheck = db.prepare(`SELECT count(*) as count FROM sqlite_master WHERE type='table' AND name='${table}'`).get();
        if (countCheck && countCheck.count > 0) {
          backupData.tables[table] = db.prepare(`SELECT * FROM ${table} LIMIT 1000`).all();
        }
      } catch (_) {}
    }

    const compressed = zlib.gzipSync(Buffer.from(JSON.stringify(backupData), 'utf-8'));
    const backupsPath = path.join(userDataPath, 'backups');
    const filename = `snap_incremental_${Date.now()}.json.gz`;
    fs.writeFileSync(path.join(backupsPath, filename), compressed);
    console.info(`[SQLite-SNAPSHOT] Compressed JSON snapshot written: ${filename}`);

    const files = fs.readdirSync(backupsPath);
    const jsonSnaps = files
      .filter(f => f.startsWith('snap_incremental_') && f.endsWith('.json.gz'))
      .map(f => ({ name: f, path: path.join(backupsPath, f), time: fs.statSync(path.join(backupsPath, f)).mtimeMs }))
      .sort((a, b) => b.time - a.time);

    if (jsonSnaps.length > 5) {
      const toDelete = jsonSnaps.slice(5);
      for (const f of toDelete) {
        fs.unlinkSync(f.path);
        console.info(`[SQLite-SNAPSHOT] Rotated out old compressed JSON snapshot: ${f.name}`);
      }
    }
  } catch (err) {
    console.error('[SQLite-SNAPSHOT] Compressed JSON snapshot creation failed:', err);
  }
}

function getDbMetricsNow(userDataPath) {
  const metrics = {
    avgTimes: queryMetrics.averageMs,
    bootTimeMs: bootTimeMs,
    dbSize: 0,
    walSize: 0,
    ramRss: process.memoryUsage().rss
  };
  try {
    const dbPath = path.join(userDataPath, DB_FILENAME);
    if (fs.existsSync(dbPath)) {
      metrics.dbSize = fs.statSync(dbPath).size;
    }
    const walPath = dbPath + '-wal';
    if (fs.existsSync(walPath)) {
      metrics.walSize = fs.statSync(walPath).size;
    }
  } catch (_) {}
  return metrics;
}

function setSaleOpen(isOpen) {
  isSaleOpen = !!isOpen;
  console.info(`[SQLite-HARDENING] Operational state updated: isSaleOpen = ${isSaleOpen}`);
}

function setCriticalOperationActive(isActive) {
  isCriticalOperationActive = !!isActive;
  console.info(`[SQLite-HARDENING] Operational state updated: isCriticalOperationActive = ${isCriticalOperationActive}`);
}

function setActivePrintJobsCount(count) {
  activePrintJobsCount = count;
  console.info(`[SQLite-HARDENING] Operational state updated: activePrintJobsCount = ${activePrintJobsCount}`);
}

try {
  Database = require('better-sqlite3');
} catch (err) {
  console.error('[SQLite] better-sqlite3 is not available. Running in mock/fallback mode.', err);
}

let appInstance = null;
try {
  appInstance = require('electron').app;
} catch (_) {}

function initDatabase(userDataPath) {
  if (isInitialized) return true;
  if (!Database) {
    console.warn('[SQLite] Database class not loaded, skipping real database initialization.');
    return false;
  }

  const initStart = Date.now();
  const dbPath = path.join(userDataPath, DB_FILENAME);
  const backupsPath = path.join(userDataPath, 'backups');

  // No legacy migrations or discovery hooks are allowed in the new clean ecosystem
  if (!fs.existsSync(backupsPath)) {
    fs.mkdirSync(backupsPath, { recursive: true });
  }

  let dbCorrupted = false;

  // 1. Recovery automático - Detecção de corrupção ou lock permanente
  if (fs.existsSync(dbPath)) {
    let testDb = null;
    try {
      testDb = new Database(dbPath, { timeout: 2000 });
      const testPragma = testDb.pragma('quick_check');
      const isOk = Array.isArray(testPragma) && testPragma.length > 0 && testPragma[0].quick_check === 'ok';
      if (!isOk) {
        dbCorrupted = true;
        console.error('[SQLite-RECOVERY] Pre-flight quick integrity check failed:', testPragma);
      } else {
        // Probe check for table products and JSON integrity
        const tableProbe = testDb.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='products'").get();
        if (!tableProbe) {
          const tablesResult = testDb.prepare("SELECT count(*) as count FROM sqlite_master WHERE type='table'").get();
          if (tablesResult && tablesResult.count > 0 && tablesResult.count < 3) {
            dbCorrupted = true;
            console.error('[SQLite-RECOVERY] Table count check failed. Count:', tablesResult.count);
          }
        } else {
          try {
            const rowsProd = testDb.prepare("SELECT data_json FROM products LIMIT 5").all();
            for (const r of rowsProd) {
              JSON.parse(r.data_json);
            }
          } catch (jsonErr) {
            dbCorrupted = true;
            console.error('[SQLite-RECOVERY] Pre-flight JSON data probe failed:', jsonErr);
          }
        }
      }
    } catch (testErr) {
      const errMsg = (testErr && testErr.message) ? testErr.message.toLowerCase() : '';
      const errCode = (testErr && testErr.code) ? testErr.code : '';
      if (errMsg.includes('corrupt') || errMsg.includes('malformed') || errCode.includes('CORRUPT')) {
        dbCorrupted = true;
        console.error('[SQLite-RECOVERY] Pre-flight quick integrity check detected active disk corruption:', testErr);
      } else {
        console.warn('[SQLite-RECOVERY] Pre-flight experienced an open issue (e.g. database busy, locked, or permissions), but not corruption. Skipping recovery wipe to protect user data:', testErr);
      }
    } finally {
      if (testDb) {
        try { testDb.close(); } catch (_) {}
      }
    }
  }

  // 2. Recovery automático - Ação corretiva
  if (dbCorrupted) {
    console.warn('[SQLite-RECOVERY] CORRUPTED/LOCKED SQLITE STATE DETECTED! Initiating emergency snapshot & restore...');

    // Save snapshot of corrupted DB
    const corruptBackupPath = path.join(backupsPath, `corrupted_erp_local_${Date.now()}.db`);
    try {
      if (fs.existsSync(dbPath)) {
        fs.copyFileSync(dbPath, corruptBackupPath);
        console.info('[SQLite-RECOVERY] Snapshot of corrupt database preserved at:', corruptBackupPath);
      }
    } catch (copyErr) {
      console.error('[SQLite-RECOVERY] Failed to write corrupted DB snapshot:', copyErr);
    }

    // Restore from last healthy snapshot
    let restoredSuccessfully = false;
    try {
      const files = fs.readdirSync(backupsPath);
      const snapshotFiles = files
        .filter(f => f.startsWith('snap_erp_local_') && f.endsWith('.db'))
        .sort((a, b) => b.localeCompare(a)); // sorted descending (newest first)

      for (const file of snapshotFiles) {
        const fullSnapPath = path.join(backupsPath, file);
        console.info(`[SQLite-RECOVERY] Validating snapshot candidate: ${file}`);
        
        let checkSnapDb = null;
        let snapValid = false;
        try {
          checkSnapDb = new Database(fullSnapPath);
          const snapTablesResult = checkSnapDb.prepare("SELECT count(*) as count FROM sqlite_master WHERE type='table'").get();
          
          // Verify snapshot criteria (count of tables >= 10 and has products)
          if (snapTablesResult && snapTablesResult.count >= 10) {
            const hasProducts = checkSnapDb.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='products'").get();
            if (hasProducts) {
              snapValid = true;
            }
          }
        } catch (_) {
          // invalid candidates ignored
        } finally {
          if (checkSnapDb) {
            try { checkSnapDb.close(); } catch (_) {}
          }
        }

        if (snapValid) {
          console.info(`[SQLite-RECOVERY] Valid snapshot found: ${file}. Restoring now...`);
          try {
            if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath);
            try { if (fs.existsSync(dbPath + '-wal')) fs.unlinkSync(dbPath + '-wal'); } catch (_) {}
            try { if (fs.existsSync(dbPath + '-shm')) fs.unlinkSync(dbPath + '-shm'); } catch (_) {}

            fs.copyFileSync(fullSnapPath, dbPath);
            restoredSuccessfully = true;
            console.info('[SQLite-RECOVERY] Database successfully restored from backup snapshot:', file);
            break;
          } catch (restoreErr) {
            console.error('[SQLite-RECOVERY] File copy to erp-local.db failed:', restoreErr);
          }
        }
      }
    } catch (readdirErr) {
      console.error('[SQLite-RECOVERY] Failed to access backups folder for recovery:', readdirErr);
    }

    if (!restoredSuccessfully) {
      console.warn('[SQLite-RECOVERY] No valid snapshot available. Recreating clean database to guarantee boot!');
      try {
        if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath);
        try { if (fs.existsSync(dbPath + '-wal')) fs.unlinkSync(dbPath + '-wal'); } catch (_) {}
        try { if (fs.existsSync(dbPath + '-shm')) fs.unlinkSync(dbPath + '-shm'); } catch (_) {}
      } catch (_) {}
    }
  }

  try {
    db = new Database(dbPath);
    console.info(`[SQLite-AUDIT] BANCO ABERTO COM SUCESSO!`);
    console.info(`[SQLite-AUDIT] Caminho absoluto do banco SQLite usado: ${path.resolve(dbPath)}`);
    
    // Performance and optimization settings in WAL Mode
    db.pragma('journal_mode = WAL');
    db.pragma('synchronous = NORMAL');
    db.pragma('temp_store = MEMORY');
    db.pragma('foreign_keys = ON');
    db.pragma('cache_size = -32000');
    db.pragma('busy_timeout = 5000');

    // 3. Prepare-binding profiling wrapper
    const originalPrepare = db.prepare.bind(db);
    db.prepare = function(sql) {
      const stmt = originalPrepare(sql);
      const originalRun = stmt.run.bind(stmt);
      const originalAll = stmt.all.bind(stmt);
      const originalGet = stmt.get.bind(stmt);

      stmt.run = function(...args) {
        const start = Date.now();
        try {
          const res = originalRun(...args);
          const duration = Date.now() - start;
          const queryPhrase = sql.trim().substring(0, 30).toUpperCase();
          logQueryMetric(queryPhrase, duration);
          if (queryPhrase.startsWith('INSERT') || queryPhrase.startsWith('UPDATE') || queryPhrase.startsWith('DELETE')) {
            incrementWriteOperation();
            // Audit Log: Count updated row count of updated table
            try {
              const tablesToAudit = [
                'audit_logs', 'activities', 'nfc_presence_records', 'system_backups_metadata',
                'products', 'clients', 'categories', 'subcategories', 'sales', 'sale_items',
                'pre_orders', 'cashier_sessions', 'cashier_movements', 'financial_transactions',
                'sync_queue', 'tombstones', 'productions', 'production_runs', 'materials',
                'machines', 'returns', 'consignments'
              ];
              const lowerSql = sql.toLowerCase();
              const tbl = tablesToAudit.find(t => lowerSql.includes(t));
              if (tbl) {
                const countRow = db.prepare(`SELECT count(*) as count FROM ${tbl}`).get();
                console.info(`[SQLite-AUDIT] Alteração detectada em '${tbl}'. Total de registros pós-operação: ${countRow.count}`);
              }
            } catch (auditErr) {
              console.warn(`[SQLite-AUDIT] Falha ao capturar contagem pós-operação: ${auditErr.message}`);
            }
          }
          return res;
        } catch (err) {
          const duration = Date.now() - start;
          const queryPhrase = sql.trim().substring(0, 30).toUpperCase();
          logQueryMetric(queryPhrase + '_ERR', duration);
          throw err;
        }
      };

      stmt.all = function(...args) {
        const start = Date.now();
        try {
          const res = originalAll(...args);
          const duration = Date.now() - start;
          const queryPhrase = sql.trim().substring(0, 30).toUpperCase();
          logQueryMetric(queryPhrase, duration);
          return res;
        } catch (err) {
          const duration = Date.now() - start;
          const queryPhrase = sql.trim().substring(0, 30).toUpperCase();
          logQueryMetric(queryPhrase + '_ERR', duration);
          throw err;
        }
      };

      stmt.get = function(...args) {
        const start = Date.now();
        try {
          const res = originalGet(...args);
          const duration = Date.now() - start;
          const queryPhrase = sql.trim().substring(0, 30).toUpperCase();
          logQueryMetric(queryPhrase, duration);
          return res;
        } catch (err) {
          const duration = Date.now() - start;
          const queryPhrase = sql.trim().substring(0, 30).toUpperCase();
          logQueryMetric(queryPhrase + '_ERR', duration);
          throw err;
        }
      };

      return stmt;
    };

    // Create tables
    db.exec(`
      CREATE TABLE IF NOT EXISTS audit_logs (
        id TEXT PRIMARY KEY,
        userId TEXT,
        userLogin TEXT,
        userRole TEXT,
        userMatricula TEXT,
        timestamp INTEGER,
        module TEXT,
        actionType TEXT,
        description TEXT,
        status TEXT,
        referenceId TEXT,
        action TEXT,
        affectedEntity TEXT,
        entityId TEXT,
        previousValue TEXT,
        newValue TEXT,
        method TEXT,
        device TEXT,
        riskLevel TEXT,
        eventType TEXT
      );
    `);

    db.exec(`
      CREATE TABLE IF NOT EXISTS activities (
        id TEXT PRIMARY KEY,
        message TEXT,
        timestamp INTEGER,
        type TEXT,
        userName TEXT,
        module TEXT,
        entityId TEXT
      );
    `);

    db.exec(`
      CREATE TABLE IF NOT EXISTS nfc_presence_records (
        id TEXT PRIMARY KEY,
        userId TEXT,
        userLogin TEXT,
        userFullName TEXT,
        nfcUid TEXT,
        timestamp INTEGER,
        tipoEvento TEXT,
        device TEXT
      );
    `);

    db.exec(`
      CREATE TABLE IF NOT EXISTS system_backups_metadata (
        id TEXT PRIMARY KEY,
        filename TEXT,
        createdAt INTEGER,
        size INTEGER,
        type TEXT,
        checksum TEXT,
        version TEXT,
        description TEXT
      );
    `);

    // Create tables for master data / Fase 3
    db.exec(`
      CREATE TABLE IF NOT EXISTS products (
        id TEXT PRIMARY KEY,
        code TEXT,
        name TEXT,
        data_json TEXT NOT NULL,
        createdAt INTEGER,
        updatedAt INTEGER,
        deletedAt INTEGER NULL
      );
    `);

    db.exec(`
      CREATE TABLE IF NOT EXISTS clients (
        id TEXT PRIMARY KEY,
        name TEXT,
        data_json TEXT NOT NULL,
        createdAt INTEGER,
        updatedAt INTEGER,
        deletedAt INTEGER NULL
      );
    `);

    db.exec(`
      CREATE TABLE IF NOT EXISTS categories (
        id TEXT PRIMARY KEY,
        name TEXT,
        data_json TEXT NOT NULL,
        createdAt INTEGER,
        updatedAt INTEGER,
        deletedAt INTEGER NULL
      );
    `);

    db.exec(`
      CREATE TABLE IF NOT EXISTS subcategories (
        id TEXT PRIMARY KEY,
        name TEXT,
        data_json TEXT NOT NULL,
        createdAt INTEGER,
        updatedAt INTEGER,
        deletedAt INTEGER NULL
      );
    `);

    // Create tables for FASE 4
    db.exec(`
      CREATE TABLE IF NOT EXISTS sales (
        id TEXT PRIMARY KEY,
        createdAt INTEGER,
        status TEXT,
        orderNumber TEXT,
        data_json TEXT NOT NULL,
        updatedAt INTEGER,
        deletedAt INTEGER NULL
      );
    `);

    db.exec(`
      CREATE TABLE IF NOT EXISTS sale_items (
        id TEXT PRIMARY KEY,
        saleId TEXT,
        productId TEXT,
        quantity REAL,
        unitPrice REAL,
        total REAL,
        data_json TEXT NOT NULL
      );
    `);

    db.exec(`
      CREATE TABLE IF NOT EXISTS pre_orders (
        id TEXT PRIMARY KEY,
        status TEXT,
        createdAt INTEGER,
        data_json TEXT NOT NULL,
        updatedAt INTEGER,
        deletedAt INTEGER NULL
      );
    `);

    db.exec(`
      CREATE TABLE IF NOT EXISTS cashier_sessions (
        id TEXT PRIMARY KEY,
        openedAt INTEGER,
        data_json TEXT NOT NULL,
        createdAt INTEGER,
        updatedAt INTEGER,
        deletedAt INTEGER NULL
      );
    `);

    db.exec(`
      CREATE TABLE IF NOT EXISTS cashier_movements (
        id TEXT PRIMARY KEY,
        caixaId TEXT,
        type TEXT,
        value REAL,
        data_json TEXT NOT NULL,
        createdAt INTEGER,
        updatedAt INTEGER,
        deletedAt INTEGER NULL
      );
    `);

    db.exec(`
      CREATE TABLE IF NOT EXISTS financial_transactions (
        id TEXT PRIMARY KEY,
        createdAt INTEGER,
        data_json TEXT NOT NULL,
        updatedAt INTEGER,
        deletedAt INTEGER NULL
      );
    `);

    // Create tables for FASE 5A
    db.exec(`
      CREATE TABLE IF NOT EXISTS sync_queue (
        id TEXT PRIMARY KEY,
        entityType TEXT,
        entityId TEXT,
        operation TEXT,
        payload_json TEXT NOT NULL,
        status TEXT,
        retryCount INTEGER DEFAULT 0,
        createdAt INTEGER,
        updatedAt INTEGER,
        lastError TEXT NULL
      );
    `);

    db.exec(`
      CREATE TABLE IF NOT EXISTS tombstones (
        id TEXT PRIMARY KEY,
        entityType TEXT,
        entityId TEXT,
        deletedAt INTEGER,
        payload_json TEXT
      );
    `);

    // Create tables for FASE 5B
    db.exec(`
      CREATE TABLE IF NOT EXISTS productions (
        id TEXT PRIMARY KEY,
        status TEXT,
        createdAt INTEGER,
        updatedAt INTEGER,
        data_json TEXT
      );
    `);

    db.exec(`
      CREATE TABLE IF NOT EXISTS production_runs (
        id TEXT PRIMARY KEY,
        productionId TEXT,
        createdAt INTEGER,
        updatedAt INTEGER,
        data_json TEXT
      );
    `);

    db.exec(`
      CREATE TABLE IF NOT EXISTS materials (
        id TEXT PRIMARY KEY,
        createdAt INTEGER,
        updatedAt INTEGER,
        data_json TEXT
      );
    `);

    db.exec(`
      CREATE TABLE IF NOT EXISTS machines (
        id TEXT PRIMARY KEY,
        createdAt INTEGER,
        updatedAt INTEGER,
        data_json TEXT
      );
    `);

    db.exec(`
      CREATE TABLE IF NOT EXISTS returns (
        id TEXT PRIMARY KEY,
        status TEXT,
        createdAt INTEGER,
        updatedAt INTEGER,
        data_json TEXT
      );
    `);

    db.exec(`
      CREATE TABLE IF NOT EXISTS consignments (
        id TEXT PRIMARY KEY,
        status TEXT,
        createdAt INTEGER,
        updatedAt INTEGER,
        data_json TEXT
      );
    `);

    // --- ERP-GLOBAL PERSISTENT CONFIGS AND USER TABLES ---
    db.exec(`
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        name TEXT,
        data_json TEXT NOT NULL,
        createdAt INTEGER,
        updatedAt INTEGER,
        deletedAt INTEGER NULL
      );
    `);

    db.exec(`
      CREATE TABLE IF NOT EXISTS permissions (
        id TEXT PRIMARY KEY,
        data_json TEXT NOT NULL,
        createdAt INTEGER,
        updatedAt INTEGER
      );
    `);

    db.exec(`
      CREATE TABLE IF NOT EXISTS company_settings (
        id TEXT PRIMARY KEY,
        data_json TEXT NOT NULL,
        createdAt INTEGER,
        updatedAt INTEGER
      );
    `);

    db.exec(`
      CREATE TABLE IF NOT EXISTS system_settings (
        id TEXT PRIMARY KEY,
        data_json TEXT NOT NULL,
        createdAt INTEGER,
        updatedAt INTEGER
      );
    `);

    db.exec(`
      CREATE TABLE IF NOT EXISTS terminal_settings (
        id TEXT PRIMARY KEY,
        data_json TEXT NOT NULL,
        createdAt INTEGER,
        updatedAt INTEGER
      );
    `);

    db.exec(`
      CREATE TABLE IF NOT EXISTS pdv_settings (
        id TEXT PRIMARY KEY,
        data_json TEXT NOT NULL,
        createdAt INTEGER,
        updatedAt INTEGER
      );
    `);

    db.exec(`
      CREATE TABLE IF NOT EXISTS pdv_totem_settings (
        id TEXT PRIMARY KEY,
        data_json TEXT NOT NULL,
        createdAt INTEGER,
        updatedAt INTEGER
      );
    `);

    db.exec(`
      CREATE TABLE IF NOT EXISTS kiosk_terminals (
        id TEXT PRIMARY KEY,
        data_json TEXT NOT NULL,
        createdAt INTEGER,
        updatedAt INTEGER
      );
    `);

    db.exec(`
      CREATE TABLE IF NOT EXISTS print_settings (
        id TEXT PRIMARY KEY,
        data_json TEXT NOT NULL,
        createdAt INTEGER,
        updatedAt INTEGER
      );
    `);

    // Create indices for better query performance
    db.exec(`CREATE INDEX IF NOT EXISTS idx_audit_logs_timestamp ON audit_logs(timestamp);`);
    db.exec(`CREATE INDEX IF NOT EXISTS idx_audit_logs_userId ON audit_logs(userId);`);
    db.exec(`CREATE INDEX IF NOT EXISTS idx_audit_logs_module ON audit_logs(module);`);
    db.exec(`CREATE INDEX IF NOT EXISTS idx_activities_timestamp ON activities(timestamp);`);
    db.exec(`CREATE INDEX IF NOT EXISTS idx_nfc_presence_records_timestamp ON nfc_presence_records(timestamp);`);
    db.exec(`CREATE INDEX IF NOT EXISTS idx_nfc_presence_records_userId ON nfc_presence_records(userId);`);
    
    // Indices for products, clients, categories, subcategories (Fase 3)
    db.exec(`CREATE INDEX IF NOT EXISTS idx_products_id ON products(id);`);
    db.exec(`CREATE INDEX IF NOT EXISTS idx_products_updatedAt ON products(updatedAt);`);
    db.exec(`CREATE INDEX IF NOT EXISTS idx_products_code ON products(code);`);
    db.exec(`CREATE INDEX IF NOT EXISTS idx_clients_id ON clients(id);`);
    db.exec(`CREATE INDEX IF NOT EXISTS idx_clients_updatedAt ON clients(updatedAt);`);
    db.exec(`CREATE INDEX IF NOT EXISTS idx_clients_name ON clients(name);`);

    // Indices for sales, sale_items, pre_orders, cashier_sessions, corporate, financial_transactions (Fase 4)
    db.exec(`CREATE INDEX IF NOT EXISTS idx_sales_createdAt ON sales(createdAt);`);
    db.exec(`CREATE INDEX IF NOT EXISTS idx_sales_status ON sales(status);`);
    db.exec(`CREATE INDEX IF NOT EXISTS idx_sales_orderNumber ON sales(orderNumber);`);
    db.exec(`CREATE INDEX IF NOT EXISTS idx_sale_items_saleId ON sale_items(saleId);`);
    db.exec(`CREATE INDEX IF NOT EXISTS idx_pre_orders_createdAt ON pre_orders(createdAt);`);
    db.exec(`CREATE INDEX IF NOT EXISTS idx_pre_orders_status ON pre_orders(status);`);
    db.exec(`CREATE INDEX IF NOT EXISTS idx_cashier_sessions_openedAt ON cashier_sessions(openedAt);`);
    db.exec(`CREATE INDEX IF NOT EXISTS idx_financial_transactions_createdAt ON financial_transactions(createdAt);`);

    // Indices for FASE 5A
    db.exec(`CREATE INDEX IF NOT EXISTS idx_sync_queue_status ON sync_queue(status);`);
    db.exec(`CREATE INDEX IF NOT EXISTS idx_sync_queue_entityType ON sync_queue(entityType);`);
    db.exec(`CREATE INDEX IF NOT EXISTS idx_sync_queue_createdAt ON sync_queue(createdAt);`);
    db.exec(`CREATE INDEX IF NOT EXISTS idx_tombstones_entityType ON tombstones(entityType);`);
    db.exec(`CREATE INDEX IF NOT EXISTS idx_tombstones_entityId ON tombstones(entityId);`);
    db.exec(`CREATE INDEX IF NOT EXISTS idx_tombstones_deletedAt ON tombstones(deletedAt);`);

    // Indices for FASE 5B
    db.exec(`CREATE INDEX IF NOT EXISTS idx_productions_status ON productions(status);`);
    db.exec(`CREATE INDEX IF NOT EXISTS idx_productions_createdAt ON productions(createdAt);`);
    db.exec(`CREATE INDEX IF NOT EXISTS idx_production_runs_productionId ON production_runs(productionId);`);
    db.exec(`CREATE INDEX IF NOT EXISTS idx_returns_status ON returns(status);`);
    db.exec(`CREATE INDEX IF NOT EXISTS idx_consignments_status ON consignments(status);`);

    // Audit Log: Count and list all records per table after boot
    console.info(`[SQLite-AUDIT] --- DIAGNÓSTICO DE REGISTROS PÓS-BOOT ---`);
    console.info(`[SQLite-AUDIT] Verificando existência e integridade de estruturas...`);
    const tablesToAudit = [
      'audit_logs', 'activities', 'nfc_presence_records', 'system_backups_metadata',
      'products', 'clients', 'categories', 'subcategories', 'sales', 'sale_items',
      'pre_orders', 'cashier_sessions', 'cashier_movements', 'financial_transactions',
      'sync_queue', 'tombstones', 'productions', 'production_runs', 'materials',
      'machines', 'returns', 'consignments'
    ];
    tablesToAudit.forEach(t => {
      try {
        const countRow = db.prepare(`SELECT count(*) as count FROM ${t}`).get();
        console.info(`[SQLite-AUDIT] Tabela '${t}' pronta e validada. Total de registros: ${countRow.count}`);
      } catch (e) {
        console.error(`[SQLite-AUDIT] FALHA/ERRO na tabela '${t}':`, e.message);
      }
    });
    console.info(`[SQLite-AUDIT] ---------------------------------------`);

    // Criar usuário administrador inicial se a tabela estiver vazia ou o ID admin não existir
    try {
      const existingAdmin = db.prepare("SELECT count(*) as count FROM users WHERE id = 'admin'").get();
      if (!existingAdmin || existingAdmin.count === 0) {
        console.info('[SQLite-BOOT] Criando usuário administrador inicial padrao (admin / 1234)...');
        const adminUserObject = {
          id: 'admin',
          fullName: 'Administrador Nexa',
          login: 'admin',
          matricula: 'admin',
          password: '1234',
          roleId: 'admin',
          status: 'ativo',
          isAdmin: true,
          isOwner: true,
          isMasterAdmin: true,
          qrCodeToken: 'admin-token-nexa',
          allowedModules: ['dashboard', 'vendas', 'produtos', 'financeiro', 'usuarios', 'producao', 'suporte']
        };
        const insertStmt = db.prepare(`
          INSERT INTO users (id, name, data_json, createdAt, updatedAt, deletedAt)
          VALUES (?, ?, ?, ?, ?, ?)
        `);
        insertStmt.run(
          'admin',
          'Administrador Nexa',
          JSON.stringify(adminUserObject),
          Date.now(),
          Date.now(),
          null
        );
        console.info('[SQLite-BOOT] Usuário administrador inicial criado com sucesso.');
      } else {
        console.info('[SQLite-BOOT] Usuário admin já existe. Nenhuma ação de criação de usuário padrão necessária.');
      }
    } catch (usersErr) {
      console.error('[SQLite-BOOT] Erro ao criar usuário administrador inicial:', usersErr);
    }

    isInitialized = true;
    bootTimeMs = Date.now() - initStart;

    // Start background schedulers
    const checkpointTimer = setInterval(() => {
      triggerPassiveCheckpoint();
    }, 3 * 60 * 1000); // Checkpoint WAL passive every 3 minutes
    if (checkpointTimer.unref) checkpointTimer.unref();

    const vacuumTimer = setInterval(() => {
      runIntelligentVacuum();
    }, 15 * 60 * 1000); // Intelligent VACUUM checked every 15 minutes
    if (vacuumTimer.unref) vacuumTimer.unref();

    const snapshotTimer = setInterval(() => {
      createBackupSnapshot(userDataPath);
      createJsonGzipSnapshot(userDataPath);
    }, 30 * 60 * 1000); // Incremental backup snapshots taken every 30 minutes
    if (snapshotTimer.unref) snapshotTimer.unref();

    // Trigger an initial snapshot right after boot so we always have a recent backup
    setTimeout(() => {
      createBackupSnapshot(userDataPath);
      createJsonGzipSnapshot(userDataPath);
    }, 5000);

    console.info(`[SQLite] Database successfully initialized in ${bootTimeMs}ms (WAL Mode) at: ${dbPath}`);
    return true;
  } catch (err) {
    console.error('[SQLite] Failed to initialize SQLite database:', err);
    return false;
  }
}

// ---------------------- AUDIT LOGS ----------------------

function insertAuditLog(log) {
  if (!db) return false;
  try {
    const stmt = db.prepare(`
      INSERT OR REPLACE INTO audit_logs (
        id, userId, userLogin, userRole, userMatricula, timestamp, module, actionType, description, status,
        referenceId, action, affectedEntity, entityId, previousValue, newValue, method, device, riskLevel, eventType
      ) VALUES (
        @id, @userId, @userLogin, @userRole, @userMatricula, @timestamp, @module, @actionType, @description, @status,
        @referenceId, @action, @affectedEntity, @entityId, @previousValue, @newValue, @method, @device, @riskLevel, @eventType
      )
    `);
    
    stmt.run({
      id: log.id,
      userId: log.userId || '',
      userLogin: log.userLogin || '',
      userRole: log.userRole || '',
      userMatricula: log.userMatricula || '',
      timestamp: log.timestamp,
      module: log.module || '',
      actionType: log.actionType || '',
      description: log.description || '',
      status: log.status || '',
      referenceId: log.referenceId || '',
      action: log.action || '',
      affectedEntity: log.affectedEntity || '',
      entityId: log.entityId || '',
      previousValue: log.previousValue || '',
      newValue: log.newValue || '',
      method: log.method || '',
      device: log.device || '',
      riskLevel: log.riskLevel || 'baixo',
      eventType: log.eventType || 'audit_log'
    });
    return true;
  } catch (err) {
    console.error('[SQLite] insertAuditLog error:', err);
    return false;
  }
}

function listAuditLogs(limit = 1000) {
  if (!db) return [];
  try {
    const stmt = db.prepare('SELECT * FROM audit_logs ORDER BY timestamp DESC LIMIT ?');
    return stmt.all(limit);
  } catch (err) {
    console.error('[SQLite] listAuditLogs error:', err);
    return [];
  }
}

// ---------------------- ACTIVITIES ----------------------

function insertActivity(act) {
  if (!db) return false;
  try {
    const stmt = db.prepare(`
      INSERT OR REPLACE INTO activities (
        id, message, timestamp, type, userName, module, entityId
      ) VALUES (
        @id, @message, @timestamp, @type, @userName, @module, @entityId
      )
    `);
    
    stmt.run({
      id: act.id,
      message: act.message || '',
      timestamp: act.timestamp,
      type: act.type || 'lojista',
      userName: act.userName || '',
      module: act.module || '',
      entityId: act.entityId || ''
    });
    return true;
  } catch (err) {
    console.error('[SQLite] insertActivity error:', err);
    return false;
  }
}

function listActivities(limit = 500) {
  if (!db) return [];
  try {
    const stmt = db.prepare('SELECT * FROM activities ORDER BY timestamp DESC LIMIT ?');
    return stmt.all(limit);
  } catch (err) {
    console.error('[SQLite] listActivities error:', err);
    return [];
  }
}

// ---------------------- NFC PRESENCE ----------------------

function insertNfcPresenceRecord(rec) {
  if (!db) return false;
  try {
    const stmt = db.prepare(`
      INSERT OR REPLACE INTO nfc_presence_records (
        id, userId, userLogin, userFullName, nfcUid, timestamp, tipoEvento, device
      ) VALUES (
        @id, @userId, @userLogin, @userFullName, @nfcUid, @timestamp, @tipoEvento, @device
      )
    `);
    
    stmt.run({
      id: rec.id,
      userId: rec.userId || '',
      userLogin: rec.userLogin || '',
      userFullName: rec.userFullName || '',
      nfcUid: rec.nfcUid || '',
      timestamp: rec.timestamp,
      tipoEvento: rec.tipoEvento || 'PRESENCA_OPERACIONAL',
      device: rec.device || ''
    });
    return true;
  } catch (err) {
    console.error('[SQLite] insertNfcPresenceRecord error:', err);
    return false;
  }
}

function listNfcPresenceRecords(limit = 1000) {
  if (!db) return [];
  try {
    const stmt = db.prepare('SELECT * FROM nfc_presence_records ORDER BY timestamp DESC LIMIT ?');
    return stmt.all(limit);
  } catch (err) {
    console.error('[SQLite] listNfcPresenceRecords error:', err);
    return [];
  }
}

// ---------------------- BACKUPS & SNAPSHOTS ----------------------

function saveBackupFile(userDataPath, backupId, backupDataObj) {
  try {
    const backupsPath = path.join(userDataPath, 'backups');
    if (!fs.existsSync(backupsPath)) {
      fs.mkdirSync(backupsPath, { recursive: true });
    }

    const filename = `erp_backup_${backupId}.json`;
    const fullPath = path.join(backupsPath, filename);

    // Minimize memory footprint / write direct to disk
    const content = JSON.stringify(backupDataObj);
    fs.writeFileSync(fullPath, content, 'utf8');

    const size = Buffer.byteLength(content, 'utf8');

    if (db) {
      const stmt = db.prepare(`
        INSERT OR REPLACE INTO system_backups_metadata (
          id, filename, createdAt, size, type, checksum, version, description
        ) VALUES (
          @id, @filename, @createdAt, @size, @type, @checksum, @version, @description
        )
      `);
      stmt.run({
        id: backupId,
        filename: filename,
        createdAt: backupDataObj.timestamp || Date.now(),
        size: size,
        type: backupDataObj.type || 'auto',
        checksum: backupDataObj.checksum || '',
        version: backupDataObj.version || '1.0.0',
        description: backupDataObj.description || ''
      });

      // Prune old automatic backups (keep last 50)
      if ((backupDataObj.type || 'auto') === 'auto') {
        try {
          const selectStmt = db.prepare("SELECT * FROM system_backups_metadata WHERE type = 'auto' ORDER BY createdAt DESC");
          const autoBackups = selectStmt.all();
          if (autoBackups.length > 50) {
            const toDelete = autoBackups.slice(50);
            const deleteStmt = db.prepare("DELETE FROM system_backups_metadata WHERE id = ?");
            for (const b of toDelete) {
              const p = path.join(backupsPath, b.filename);
              if (fs.existsSync(p)) {
                fs.unlinkSync(p);
              }
              deleteStmt.run(b.id);
            }
            console.log(`[SQLite-RETENTION] Prunados ${toDelete.length} backups automáticos antigos no Desktop.`);
          }
        } catch (rotErr) {
          console.error('[SQLite-RETENTION] Erro ao aplicar retenção:', rotErr);
        }
      }
    }

    return { success: true, filename, size };
  } catch (err) {
    console.error('[SQLite] saveBackupFile error:', err);
    return { success: false, error: err.message };
  }
}

function listBackupFiles() {
  if (!db) return [];
  try {
    const stmt = db.prepare('SELECT * FROM system_backups_metadata ORDER BY createdAt DESC');
    return stmt.all();
  } catch (err) {
    console.error('[SQLite] listBackupFiles error:', err);
    return [];
  }
}

function loadBackupFileContent(userDataPath, filename) {
  try {
    const filePath = path.join(userDataPath, 'backups', filename);
    if (!fs.existsSync(filePath)) {
      return null;
    }
    const content = fs.readFileSync(filePath, 'utf8');
    return JSON.parse(content);
  } catch (err) {
    console.error('[SQLite] loadBackupFileContent error:', err);
    return null;
  }
}

// ---------------------- PRODUCTS (Fase 3) ----------------------

function insertProduct(product) {
  if (!db) return false;
  try {
    const stmt = db.prepare(`
      INSERT OR REPLACE INTO products (id, code, name, data_json, createdAt, updatedAt, deletedAt)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    stmt.run(
      product.id,
      product.code || '',
      product.name || '',
      JSON.stringify(product),
      product.createdAt || Date.now(),
      product.updatedAt || Date.now(),
      product.deletedAt || null
    );
    return true;
  } catch (err) {
    console.error('[SQLite] insertProduct error:', err);
    return false;
  }
}

function updateProduct(id, product) {
  return insertProduct(product);
}

function deleteProduct(id) {
  if (!db) return false;
  try {
    const stmt = db.prepare('DELETE FROM products WHERE id = ?');
    stmt.run(id);
    return true;
  } catch (err) {
    console.error('[SQLite] deleteProduct error:', err);
    return false;
  }
}

function listProducts() {
  if (!db) return [];
  try {
    const stmt = db.prepare('SELECT data_json FROM products WHERE deletedAt IS NULL');
    const rows = stmt.all();
    return rows.map(r => JSON.parse(r.data_json));
  } catch (err) {
    console.error('[SQLite] listProducts error:', err);
    return [];
  }
}

// ---------------------- CLIENTS (Fase 3) ----------------------

function insertClient(client) {
  if (!db) return false;
  try {
    const stmt = db.prepare(`
      INSERT OR REPLACE INTO clients (id, name, data_json, createdAt, updatedAt, deletedAt)
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    stmt.run(
      client.id,
      client.name || '',
      JSON.stringify(client),
      client.createdAt || Date.now(),
      client.updatedAt || Date.now(),
      client.deletedAt || null
    );
    return true;
  } catch (err) {
    console.error('[SQLite] insertClient error:', err);
    return false;
  }
}

function updateClient(id, client) {
  return insertClient(client);
}

function deleteClient(id) {
  if (!db) return false;
  try {
    const stmt = db.prepare('DELETE FROM clients WHERE id = ?');
    stmt.run(id);
    return true;
  } catch (err) {
    console.error('[SQLite] deleteClient error:', err);
    return false;
  }
}

function listClients() {
  if (!db) return [];
  try {
    const stmt = db.prepare('SELECT data_json FROM clients WHERE deletedAt IS NULL');
    const rows = stmt.all();
    return rows.map(r => JSON.parse(r.data_json));
  } catch (err) {
    console.error('[SQLite] listClients error:', err);
    return [];
  }
}

// ---------------------- CATEGORIES (Fase 3) ----------------------

function insertCategory(category) {
  if (!db) return false;
  try {
    const stmt = db.prepare(`
      INSERT OR REPLACE INTO categories (id, name, data_json, createdAt, updatedAt, deletedAt)
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    stmt.run(
      category.id,
      category.name || '',
      JSON.stringify(category),
      category.createdAt || Date.now(),
      category.updatedAt || Date.now(),
      category.deletedAt || null
    );
    return true;
  } catch (err) {
    console.error('[SQLite] insertCategory error:', err);
    return false;
  }
}

function updateCategory(id, category) {
  return insertCategory(category);
}

function deleteCategory(id) {
  if (!db) return false;
  try {
    const stmt = db.prepare('DELETE FROM categories WHERE id = ?');
    stmt.run(id);
    return true;
  } catch (err) {
    console.error('[SQLite] deleteCategory error:', err);
    return false;
  }
}

function listCategories() {
  if (!db) return [];
  try {
    const stmt = db.prepare('SELECT data_json FROM categories WHERE deletedAt IS NULL');
    const rows = stmt.all();
    return rows.map(r => JSON.parse(r.data_json));
  } catch (err) {
    console.error('[SQLite] listCategories error:', err);
    return [];
  }
}

// ---------------------- SUBCATEGORIES (Fase 3) ----------------------

function insertSubcategory(sub) {
  if (!db) return false;
  try {
    const stmt = db.prepare(`
      INSERT OR REPLACE INTO subcategories (id, name, data_json, createdAt, updatedAt, deletedAt)
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    stmt.run(
      sub.id,
      sub.name || '',
      JSON.stringify(sub),
      sub.createdAt || Date.now(),
      sub.updatedAt || Date.now(),
      sub.deletedAt || null
    );
    return true;
  } catch (err) {
    console.error('[SQLite] insertSubcategory error:', err);
    return false;
  }
}

function updateSubcategory(id, sub) {
  return insertSubcategory(sub);
}

function deleteSubcategory(id) {
  if (!db) return false;
  try {
    const stmt = db.prepare('DELETE FROM subcategories WHERE id = ?');
    stmt.run(id);
    return true;
  } catch (err) {
    console.error('[SQLite] deleteSubcategory error:', err);
    return false;
  }
}

function deleteSubcategoriesByCategoryId(categoryId) {
  if (!db) return false;
  try {
    const stmt = db.prepare('DELETE FROM subcategories WHERE id IN (SELECT id FROM subcategories WHERE json_extract(data_json, "$.categoryId") = ?)');
    stmt.run(categoryId);
    return true;
  } catch (err) {
    console.error('[SQLite] deleteSubcategoriesByCategoryId error:', err);
    return false;
  }
}

function listSubcategories() {
  if (!db) return [];
  try {
    const stmt = db.prepare('SELECT data_json FROM subcategories WHERE deletedAt IS NULL');
    const rows = stmt.all();
    return rows.map(r => JSON.parse(r.data_json));
  } catch (err) {
    console.error('[SQLite] listSubcategories error:', err);
    return [];
  }
}

// ---------------------- SALES (Fase 4) ----------------------

function insertSale(sale) {
  if (!db) return false;
  try {
    const insertSaleStmt = db.prepare(`
      INSERT OR REPLACE INTO sales (id, createdAt, status, orderNumber, data_json, updatedAt, deletedAt)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    const deleteSaleItemsStmt = db.prepare(`
      DELETE FROM sale_items WHERE saleId = ?
    `);

    const insertSaleItemStmt = db.prepare(`
      INSERT INTO sale_items (id, saleId, productId, quantity, unitPrice, total, data_json)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    const txn = db.transaction(() => {
      insertSaleStmt.run(
        sale.id,
        sale.timestamp || Date.now(),
        sale.status || 'finalizado',
        sale.orderNumber || '',
        JSON.stringify(sale),
        sale.timestamp || Date.now(),
        null
      );

      deleteSaleItemsStmt.run(sale.id);

      if (Array.isArray(sale.items)) {
        sale.items.forEach((item, index) => {
          const itemId = `${sale.id}_item_${index}`;
          const productId = item.id;
          const quantity = item.quantity || 1;
          const unitPrice = item.price || 0;
          const total = quantity * unitPrice;
          
          insertSaleItemStmt.run(
            itemId,
            sale.id,
            productId || '',
            quantity,
            unitPrice,
            total,
            JSON.stringify(item)
          );
        });
      }
    });

    txn();
    return true;
  } catch (err) {
    console.error('[SQLite] insertSale error:', err);
    return false;
  }
}

function updateSale(id, sale) {
  return insertSale(sale);
}

function deleteSale(id) {
  if (!db) return false;
  try {
    const deleteSaleStmt = db.prepare('DELETE FROM sales WHERE id = ?');
    const deleteSaleItemsStmt = db.prepare('DELETE FROM sale_items WHERE saleId = ?');
    
    const txn = db.transaction(() => {
      deleteSaleStmt.run(id);
      deleteSaleItemsStmt.run(id);
    });
    txn();
    return true;
  } catch (err) {
    console.error('[SQLite] deleteSale error:', err);
    return false;
  }
}

function listSales() {
  if (!db) return [];
  try {
    const stmt = db.prepare('SELECT data_json FROM sales WHERE deletedAt IS NULL ORDER BY createdAt DESC');
    const rows = stmt.all();
    return rows.map(r => JSON.parse(r.data_json));
  } catch (err) {
    console.error('[SQLite] listSales error:', err);
    return [];
  }
}

// ---------------------- PRE ORDERS (Fase 4) ----------------------

function insertPreOrder(order) {
  if (!db) return false;
  try {
    const stmt = db.prepare(`
      INSERT OR REPLACE INTO pre_orders (id, status, createdAt, data_json, updatedAt, deletedAt)
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    stmt.run(
      order.id,
      order.status || 'nova',
      order.createdAt || Date.now(),
      JSON.stringify(order),
      Date.now(),
      null
    );
    return true;
  } catch (err) {
    console.error('[SQLite] insertPreOrder error:', err);
    return false;
  }
}

function updatePreOrder(id, order) {
  return insertPreOrder(order);
}

function deletePreOrder(id) {
  if (!db) return false;
  try {
    const stmt = db.prepare('DELETE FROM pre_orders WHERE id = ?');
    stmt.run(id);
    return true;
  } catch (err) {
    console.error('[SQLite] deletePreOrder error:', err);
    return false;
  }
}

function listPreOrders() {
  if (!db) return [];
  try {
    const stmt = db.prepare('SELECT data_json FROM pre_orders WHERE deletedAt IS NULL ORDER BY createdAt DESC');
    const rows = stmt.all();
    return rows.map(r => JSON.parse(r.data_json));
  } catch (err) {
    console.error('[SQLite] listPreOrders error:', err);
    return [];
  }
}

// ---------------------- CASHIER SESSIONS (Fase 4) ----------------------

function insertCashierSession(session) {
  if (!db) return false;
  try {
    const stmt = db.prepare(`
      INSERT OR REPLACE INTO cashier_sessions (id, openedAt, data_json, createdAt, updatedAt, deletedAt)
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    stmt.run(
      session.id,
      session.openingTime || Date.now(),
      JSON.stringify(session),
      session.openingTime || Date.now(),
      Date.now(),
      null
    );
    return true;
  } catch (err) {
    console.error('[SQLite] insertCashierSession error:', err);
    return false;
  }
}

function updateCashierSession(id, session) {
  return insertCashierSession(session);
}

function listCashierSessions() {
  if (!db) return [];
  try {
    const stmt = db.prepare('SELECT data_json FROM cashier_sessions WHERE deletedAt IS NULL ORDER BY openedAt DESC');
    const rows = stmt.all();
    return rows.map(r => JSON.parse(r.data_json));
  } catch (err) {
    console.error('[SQLite] listCashierSessions error:', err);
    return [];
  }
}

// ---------------------- FINANCIAL TRANSACTIONS (Fase 4) ----------------------

function insertFinancialTransaction(transaction) {
  if (!db) return false;
  try {
    const stmt = db.prepare(`
      INSERT OR REPLACE INTO financial_transactions (id, createdAt, data_json, updatedAt, deletedAt)
      VALUES (?, ?, ?, ?, ?)
    `);
    stmt.run(
      transaction.id,
      transaction.createdAt || transaction.date || Date.now(),
      JSON.stringify(transaction),
      Date.now(),
      null
    );
    return true;
  } catch (err) {
    console.error('[SQLite] insertFinancialTransaction error:', err);
    return false;
  }
}

function updateFinancialTransaction(id, transaction) {
  return insertFinancialTransaction(transaction);
}

function listFinancialTransactions() {
  if (!db) return [];
  try {
    const stmt = db.prepare('SELECT data_json FROM financial_transactions WHERE deletedAt IS NULL ORDER BY createdAt DESC');
    const rows = stmt.all();
    return rows.map(r => JSON.parse(r.data_json));
  } catch (err) {
    console.error('[SQLite] listFinancialTransactions error:', err);
    return [];
  }
}

// ---------------------- SYNC QUEUE & TOMBSTONES (Fase 5A) ----------------------

function insertSyncQueueItem(item) {
  if (!db) return false;
  try {
    const stmt = db.prepare(`
      INSERT OR REPLACE INTO sync_queue (id, entityType, entityId, operation, payload_json, status, retryCount, createdAt, updatedAt, lastError)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    
    const id = item.id || `${item.entity || item.entityType}_${item.recordId || item.entityId}`;
    const entityType = item.entity || item.entityType || '';
    const entityId = item.recordId || item.entityId || '';
    const operation = item.operation || 'u';
    const payload_json = JSON.stringify(item.data || item);
    const status = item.status || 'pending';
    const retryCount = typeof item.retryCount === 'number' ? item.retryCount : 0;
    const createdAt = item.timestamp || item.createdAt || Date.now();
    const updatedAt = item.updatedAt || Date.now();
    const lastError = item.lastError || null;

    stmt.run(id, entityType, entityId, operation, payload_json, status, retryCount, createdAt, updatedAt, lastError);
    return true;
  } catch (err) {
    console.error('[SQLite] insertSyncQueueItem error:', err);
    return false;
  }
}

function updateSyncQueueItem(id, item) {
  return insertSyncQueueItem({ ...item, id });
}

function deleteSyncQueueItem(id) {
  if (!db) return false;
  try {
    const stmt = db.prepare('DELETE FROM sync_queue WHERE id = ?');
    stmt.run(id);
    return true;
  } catch (err) {
    console.error('[SQLite] deleteSyncQueueItem error:', err);
    return false;
  }
}

function listSyncQueue() {
  if (!db) return [];
  try {
    const stmt = db.prepare('SELECT * FROM sync_queue ORDER BY createdAt ASC');
    const rows = stmt.all();
    return rows.map(r => {
      let data = {};
      try {
        data = JSON.parse(r.payload_json);
      } catch (e) {
        console.error('[SQLite] Error parsing payload_json:', e);
      }
      return {
        id: r.id,
        entity: r.entityType,
        recordId: r.entityId,
        operation: r.operation,
        data: data,
        timestamp: r.createdAt,
        status: r.status,
        retryCount: r.retryCount,
        createdAt: r.createdAt,
        updatedAt: r.updatedAt,
        lastError: r.lastError
      };
    });
  } catch (err) {
    console.error('[SQLite] listSyncQueue error:', err);
    return [];
  }
}

function insertTombstone(tombstone) {
  if (!db) return false;
  try {
    const stmt = db.prepare(`
      INSERT OR REPLACE INTO tombstones (id, entityType, entityId, deletedAt, payload_json)
      VALUES (?, ?, ?, ?, ?)
    `);
    const deletedTime = typeof tombstone.deletedAt === 'number' 
      ? tombstone.deletedAt 
      : (tombstone.deletedAt ? Date.parse(tombstone.deletedAt) : Date.now());
    stmt.run(
      tombstone.id,
      tombstone.entityType || tombstone.entity || '',
      tombstone.entityId || tombstone.recordId || '',
      deletedTime || Date.now(),
      JSON.stringify(tombstone)
    );
    return true;
  } catch (err) {
    console.error('[SQLite] insertTombstone error:', err);
    return false;
  }
}

function listTombstones() {
  if (!db) return [];
  try {
    const stmt = db.prepare('SELECT payload_json FROM tombstones ORDER BY deletedAt DESC');
    const rows = stmt.all();
    return rows.map(r => JSON.parse(r.payload_json));
  } catch (err) {
    console.error('[SQLite] listTombstones error:', err);
    return [];
  }
}

function deleteTombstone(id) {
  if (!db) return false;
  try {
    const stmt = db.prepare('DELETE FROM tombstones WHERE id = ?');
    stmt.run(id);
    return true;
  } catch (err) {
    console.error('[SQLite] deleteTombstone error:', err);
    return false;
  }
}

// ---------------------- PRODUCTION, DEVOLUÇÕES E CONSIGNAÇÃO (Fase 5B) ----------------------

function insertProduction(production) {
  if (!db) return false;
  try {
    const stmt = db.prepare(`
      INSERT OR REPLACE INTO productions (id, status, createdAt, updatedAt, data_json)
      VALUES (?, ?, ?, ?, ?)
    `);
    stmt.run(
      production.id,
      production.status || '',
      production.createdAt || Date.now(),
      production.updatedAt || Date.now(),
      JSON.stringify(production)
    );
    return true;
  } catch (err) {
    console.error('[SQLite] insertProduction error:', err);
    return false;
  }
}

function updateProduction(id, production) {
  return insertProduction(production);
}

function listProductions() {
  if (!db) return [];
  try {
    const stmt = db.prepare('SELECT data_json FROM productions');
    const rows = stmt.all();
    return rows.map(r => JSON.parse(r.data_json)).filter(item => !item.deletedAt);
  } catch (err) {
    console.error('[SQLite] listProductions error:', err);
    return [];
  }
}

function insertProductionRun(run) {
  if (!db) return false;
  try {
    const stmt = db.prepare(`
      INSERT OR REPLACE INTO production_runs (id, productionId, createdAt, updatedAt, data_json)
      VALUES (?, ?, ?, ?, ?)
    `);
    stmt.run(
      run.id,
      run.productionId || '',
      run.createdAt || Date.now(),
      run.updatedAt || Date.now(),
      JSON.stringify(run)
    );
    return true;
  } catch (err) {
    console.error('[SQLite] insertProductionRun error:', err);
    return false;
  }
}

function updateProductionRun(id, run) {
  return insertProductionRun(run);
}

function listProductionRuns() {
  if (!db) return [];
  try {
    const stmt = db.prepare('SELECT data_json FROM production_runs');
    const rows = stmt.all();
    return rows.map(r => JSON.parse(r.data_json)).filter(item => !item.deletedAt);
  } catch (err) {
    console.error('[SQLite] listProductionRuns error:', err);
    return [];
  }
}

function insertMaterial(material) {
  if (!db) return false;
  try {
    const stmt = db.prepare(`
      INSERT OR REPLACE INTO materials (id, createdAt, updatedAt, data_json)
      VALUES (?, ?, ?, ?)
    `);
    stmt.run(
      material.id,
      material.createdAt || Date.now(),
      material.updatedAt || Date.now(),
      JSON.stringify(material)
    );
    return true;
  } catch (err) {
    console.error('[SQLite] insertMaterial error:', err);
    return false;
  }
}

function updateMaterial(id, material) {
  return insertMaterial(material);
}

function listMaterials() {
  if (!db) return [];
  try {
    const stmt = db.prepare('SELECT data_json FROM materials');
    const rows = stmt.all();
    return rows.map(r => JSON.parse(r.data_json)).filter(item => !item.deletedAt);
  } catch (err) {
    console.error('[SQLite] listMaterials error:', err);
    return [];
  }
}

function insertMachine(machine) {
  if (!db) return false;
  try {
    const stmt = db.prepare(`
      INSERT OR REPLACE INTO machines (id, createdAt, updatedAt, data_json)
      VALUES (?, ?, ?, ?)
    `);
    stmt.run(
      machine.id,
      machine.createdAt || Date.now(),
      machine.updatedAt || Date.now(),
      JSON.stringify(machine)
    );
    return true;
  } catch (err) {
    console.error('[SQLite] insertMachine error:', err);
    return false;
  }
}

function updateMachine(id, machine) {
  return insertMachine(machine);
}

function listMachines() {
  if (!db) return [];
  try {
    const stmt = db.prepare('SELECT data_json FROM machines');
    const rows = stmt.all();
    return rows.map(r => JSON.parse(r.data_json)).filter(item => !item.deletedAt);
  } catch (err) {
    console.error('[SQLite] listMachines error:', err);
    return [];
  }
}

function insertReturn(ret) {
  if (!db) return false;
  try {
    const stmt = db.prepare(`
      INSERT OR REPLACE INTO returns (id, status, createdAt, updatedAt, data_json)
      VALUES (?, ?, ?, ?, ?)
    `);
    stmt.run(
      ret.id,
      ret.status || '',
      ret.createdAt || Date.now(),
      ret.updatedAt || Date.now(),
      JSON.stringify(ret)
    );
    return true;
  } catch (err) {
    console.error('[SQLite] insertReturn error:', err);
    return false;
  }
}

function updateReturn(id, ret) {
  return insertReturn(ret);
}

function listReturns() {
  if (!db) return [];
  try {
    const stmt = db.prepare('SELECT data_json FROM returns');
    const rows = stmt.all();
    return rows.map(r => JSON.parse(r.data_json));
  } catch (err) {
    console.error('[SQLite] listReturns error:', err);
    return [];
  }
}

function insertConsignment(consignment) {
  if (!db) return false;
  try {
    const stmt = db.prepare(`
      INSERT OR REPLACE INTO consignments (id, status, createdAt, updatedAt, data_json)
      VALUES (?, ?, ?, ?, ?)
    `);
    stmt.run(
      consignment.id,
      consignment.status || '',
      consignment.createdAt || Date.now(),
      consignment.updatedAt || Date.now(),
      JSON.stringify(consignment)
    );
    return true;
  } catch (err) {
    console.error('[SQLite] insertConsignment error:', err);
    return false;
  }
}

function updateConsignment(id, consignment) {
  return insertConsignment(consignment);
}

function listConsignments() {
  if (!db) return [];
  try {
    const stmt = db.prepare('SELECT data_json FROM consignments');
    const rows = stmt.all();
    return rows.map(r => JSON.parse(r.data_json));
  } catch (err) {
    console.error('[SQLite] listConsignments error:', err);
    return [];
  }
}

// ---------------------- ERP-GLOBAL TABLES CRUD ----------------------

function insertUser(user) {
  if (!db) return false;
  try {
    const stmt = db.prepare(`
      INSERT OR REPLACE INTO users (id, name, data_json, createdAt, updatedAt, deletedAt)
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    stmt.run(
      user.id,
      user.name || '',
      JSON.stringify(user),
      user.createdAt || Date.now(),
      user.updatedAt || Date.now(),
      user.deletedAt || null
    );
    return true;
  } catch (err) {
    console.error('[SQLite] insertUser error:', err);
    return false;
  }
}

function updateUser(id, user) {
  return insertUser(user);
}

function deleteUser(id) {
  if (!db) return false;
  try {
    const stmt = db.prepare('DELETE FROM users WHERE id = ?');
    stmt.run(id);
    return true;
  } catch (err) {
    console.error('[SQLite] deleteUser error:', err);
    return false;
  }
}

function listUsers() {
  if (!db) return [];
  try {
    const stmt = db.prepare('SELECT data_json FROM users WHERE deletedAt IS NULL');
    const rows = stmt.all();
    return rows.map(r => JSON.parse(r.data_json));
  } catch (err) {
    console.error('[SQLite] listUsers error:', err);
    return [];
  }
}

function insertPermission(perm) {
  if (!db) return false;
  try {
    const stmt = db.prepare(`
      INSERT OR REPLACE INTO permissions (id, data_json, createdAt, updatedAt)
      VALUES (?, ?, ?, ?)
    `);
    stmt.run(
      perm.id,
      JSON.stringify(perm),
      perm.createdAt || Date.now(),
      perm.updatedAt || Date.now()
    );
    return true;
  } catch (err) {
    console.error('[SQLite] insertPermission error:', err);
    return false;
  }
}

function updatePermission(id, perm) {
  return insertPermission(perm);
}

function deletePermission(id) {
  if (!db) return false;
  try {
    const stmt = db.prepare('DELETE FROM permissions WHERE id = ?');
    stmt.run(id);
    return true;
  } catch (err) {
    console.error('[SQLite] deletePermission error:', err);
    return false;
  }
}

function listPermissions() {
  if (!db) return [];
  try {
    const stmt = db.prepare('SELECT data_json FROM permissions');
    const rows = stmt.all();
    return rows.map(r => JSON.parse(r.data_json));
  } catch (err) {
    console.error('[SQLite] listPermissions error:', err);
    return [];
  }
}

function insertCompanySetting(setting) {
  if (!db) return false;
  try {
    const stmt = db.prepare(`
      INSERT OR REPLACE INTO company_settings (id, data_json, createdAt, updatedAt)
      VALUES (?, ?, ?, ?)
    `);
    stmt.run(
      setting.id,
      JSON.stringify(setting),
      setting.createdAt || Date.now(),
      setting.updatedAt || Date.now()
    );
    return true;
  } catch (err) {
    console.error('[SQLite] insertCompanySetting error:', err);
    return false;
  }
}

function updateCompanySetting(id, setting) {
  return insertCompanySetting(setting);
}

function listCompanySettings() {
  if (!db) return [];
  try {
    const stmt = db.prepare('SELECT data_json FROM company_settings');
    const rows = stmt.all();
    return rows.map(r => JSON.parse(r.data_json));
  } catch (err) {
    console.error('[SQLite] listCompanySettings error:', err);
    return [];
  }
}

function insertSystemSetting(setting) {
  if (!db) return false;
  try {
    const stmt = db.prepare(`
      INSERT OR REPLACE INTO system_settings (id, data_json, createdAt, updatedAt)
      VALUES (?, ?, ?, ?)
    `);
    stmt.run(
      setting.id,
      JSON.stringify(setting),
      setting.createdAt || Date.now(),
      setting.updatedAt || Date.now()
    );
    return true;
  } catch (err) {
    console.error('[SQLite] insertSystemSetting error:', err);
    return false;
  }
}

function updateSystemSetting(id, setting) {
  return insertSystemSetting(setting);
}

function listSystemSettings() {
  if (!db) return [];
  try {
    const stmt = db.prepare('SELECT data_json FROM system_settings');
    const rows = stmt.all();
    return rows.map(r => JSON.parse(r.data_json));
  } catch (err) {
    console.error('[SQLite] listSystemSettings error:', err);
    return [];
  }
}

function insertTerminalSetting(setting) {
  if (!db) return false;
  try {
    const stmt = db.prepare(`
      INSERT OR REPLACE INTO terminal_settings (id, data_json, createdAt, updatedAt)
      VALUES (?, ?, ?, ?)
    `);
    stmt.run(
      setting.id,
      JSON.stringify(setting),
      setting.createdAt || Date.now(),
      setting.updatedAt || Date.now()
    );
    return true;
  } catch (err) {
    console.error('[SQLite] insertTerminalSetting error:', err);
    return false;
  }
}

function updateTerminalSetting(id, setting) {
  return insertTerminalSetting(setting);
}

function listTerminalSettings() {
  if (!db) return [];
  try {
    const stmt = db.prepare('SELECT data_json FROM terminal_settings');
    const rows = stmt.all();
    return rows.map(r => JSON.parse(r.data_json));
  } catch (err) {
    console.error('[SQLite] listTerminalSettings error:', err);
    return [];
  }
}

function insertPdvSetting(setting) {
  if (!db) return false;
  try {
    const stmt = db.prepare(`
      INSERT OR REPLACE INTO pdv_settings (id, data_json, createdAt, updatedAt)
      VALUES (?, ?, ?, ?)
    `);
    stmt.run(
      setting.id,
      JSON.stringify(setting),
      setting.createdAt || Date.now(),
      setting.updatedAt || Date.now()
    );
    return true;
  } catch (err) {
    console.error('[SQLite] insertPdvSetting error:', err);
    return false;
  }
}

function updatePdvSetting(id, setting) {
  return insertPdvSetting(setting);
}

function listPdvSettings() {
  if (!db) return [];
  try {
    const stmt = db.prepare('SELECT data_json FROM pdv_settings');
    const rows = stmt.all();
    return rows.map(r => JSON.parse(r.data_json));
  } catch (err) {
    console.error('[SQLite] listPdvSettings error:', err);
    return [];
  }
}

function insertPdvTotemSetting(setting) {
  if (!db) return false;
  try {
    const stmt = db.prepare(`
      INSERT OR REPLACE INTO pdv_totem_settings (id, data_json, createdAt, updatedAt)
      VALUES (?, ?, ?, ?)
    `);
    stmt.run(
      setting.id,
      JSON.stringify(setting),
      setting.createdAt || Date.now(),
      setting.updatedAt || Date.now()
    );
    return true;
  } catch (err) {
    console.error('[SQLite] insertPdvTotemSetting error:', err);
    return false;
  }
}

function updatePdvTotemSetting(id, setting) {
  return insertPdvTotemSetting(setting);
}

function listPdvTotemSettings() {
  if (!db) return [];
  try {
    const stmt = db.prepare('SELECT data_json FROM pdv_totem_settings');
    const rows = stmt.all();
    return rows.map(r => JSON.parse(r.data_json));
  } catch (err) {
    console.error('[SQLite] listPdvTotemSettings error:', err);
    return [];
  }
}

function insertKioskTerminal(terminal) {
  if (!db) return false;
  try {
    const stmt = db.prepare(`
      INSERT OR REPLACE INTO kiosk_terminals (id, data_json, createdAt, updatedAt)
      VALUES (?, ?, ?, ?)
    `);
    stmt.run(
      terminal.id || terminal.idTerminal,
      JSON.stringify(terminal),
      terminal.createdAt || Date.now(),
      terminal.updatedAt || Date.now()
    );
    return true;
  } catch (err) {
    console.error('[SQLite] insertKioskTerminal error:', err);
    return false;
  }
}

function updateKioskTerminal(id, terminal) {
  return insertKioskTerminal(terminal);
}

function deleteKioskTerminal(id) {
  if (!db) return false;
  try {
    const stmt = db.prepare('DELETE FROM kiosk_terminals WHERE id = ?');
    stmt.run(id);
    return true;
  } catch (err) {
    console.error('[SQLite] deleteKioskTerminal error:', err);
    return false;
  }
}

function listKioskTerminals() {
  if (!db) return [];
  try {
    const stmt = db.prepare('SELECT data_json FROM kiosk_terminals');
    const rows = stmt.all();
    return rows.map(r => JSON.parse(r.data_json));
  } catch (err) {
    console.error('[SQLite] listKioskTerminals error:', err);
    return [];
  }
}

function insertPrintSetting(setting) {
  if (!db) return false;
  try {
    const stmt = db.prepare(`
      INSERT OR REPLACE INTO print_settings (id, data_json, createdAt, updatedAt)
      VALUES (?, ?, ?, ?)
    `);
    stmt.run(
      setting.id,
      JSON.stringify(setting),
      setting.createdAt || Date.now(),
      setting.updatedAt || Date.now()
    );
    return true;
  } catch (err) {
    console.error('[SQLite] insertPrintSetting error:', err);
    return false;
  }
}

// Global updatePrintSetting alias to support direct configuration updates
function updatePrintSetting(id, setting) {
  return insertPrintSetting(setting);
}

function listPrintSettings() {
  if (!db) return [];
  try {
    const stmt = db.prepare('SELECT data_json FROM print_settings');
    const rows = stmt.all();
    return rows.map(r => JSON.parse(r.data_json));
  } catch (err) {
    console.error('[SQLite] listPrintSettings error:', err);
    return [];
  }
}

function closeDatabase() {
  if (db && isInitialized) {
    try {
      console.log('[SQLite-CLEAN-CLOSE] Shutting down database cleanly and performing WAL checkpoint.');
      db.pragma('wal_checkpoint(TRUNCATE)');
      db.close();
      isInitialized = false;
      db = null;
      console.log('[SQLite-CLEAN-CLOSE] Database successfully closed.');
    } catch (err) {
      console.error('[SQLite-CLEAN-CLOSE] Error during database shutdown:', err);
    }
  }
}

module.exports = {
  closeDatabase,
  initDatabase,
  insertAuditLog,
  listAuditLogs,
  insertActivity,
  listActivities,
  insertNfcPresenceRecord,
  listNfcPresenceRecords,
  saveBackupFile,
  listBackupFiles,
  loadBackupFileContent,
  insertProduct,
  updateProduct,
  deleteProduct,
  listProducts,
  insertClient,
  updateClient,
  deleteClient,
  listClients,
  insertCategory,
  updateCategory,
  deleteCategory,
  listCategories,
  insertSubcategory,
  updateSubcategory,
  deleteSubcategory,
  deleteSubcategoriesByCategoryId,
  listSubcategories,
  insertSale,
  updateSale,
  deleteSale,
  listSales,
  insertPreOrder,
  updatePreOrder,
  deletePreOrder,
  listPreOrders,
  insertCashierSession,
  updateCashierSession,
  listCashierSessions,
  insertFinancialTransaction,
  updateFinancialTransaction,
  listFinancialTransactions,
  insertSyncQueueItem,
  updateSyncQueueItem,
  deleteSyncQueueItem,
  listSyncQueue,
  insertTombstone,
  listTombstones,
  deleteTombstone,
  insertProduction,
  updateProduction,
  listProductions,
  insertProductionRun,
  updateProductionRun,
  listProductionRuns,
  insertMaterial,
  updateMaterial,
  listMaterials,
  insertMachine,
  updateMachine,
  listMachines,
  insertReturn,
  updateReturn,
  listReturns,
  insertConsignment,
  updateConsignment,
  listConsignments,
  createBackupSnapshot,
  createJsonGzipSnapshot,
  getDbMetricsNow,
  setSaleOpen,
  setCriticalOperationActive,
  setActivePrintJobsCount,

  // Exposed new global settings databases
  insertUser,
  updateUser,
  deleteUser,
  listUsers,
  insertPermission,
  updatePermission,
  deletePermission,
  listPermissions,
  insertCompanySetting,
  updateCompanySetting,
  listCompanySettings,
  insertSystemSetting,
  updateSystemSetting,
  listSystemSettings,
  insertTerminalSetting,
  updateTerminalSetting,
  listTerminalSettings,
  insertPdvSetting,
  updatePdvSetting,
  listPdvSettings,
  insertPdvTotemSetting,
  updatePdvTotemSetting,
  listPdvTotemSettings,
  insertKioskTerminal,
  updateKioskTerminal,
  deleteKioskTerminal,
  listKioskTerminals,
  insertPrintSetting,
  updatePrintSetting,
  listPrintSettings
};
