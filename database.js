const { DatabaseSync } = require('node:sqlite');
const path = require('node:path');
const crypto = require('node:crypto');

const DB_PATH = path.join(__dirname, 'loyalty.db');

function initDatabase() {
  const db = new DatabaseSync(DB_PATH);

  db.exec(`PRAGMA journal_mode = WAL;`);
  db.exec(`PRAGMA foreign_keys = ON;`);

  db.exec(`
    CREATE TABLE IF NOT EXISTS manicurists (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      phone TEXT UNIQUE NOT NULL,
      password_salt TEXT NOT NULL,
      password_hash TEXT NOT NULL,
      business_name TEXT DEFAULT 'Mi Salón',
      unique_code TEXT UNIQUE NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS clients (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      phone TEXT NOT NULL,
      manicurist_id INTEGER NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (manicurist_id) REFERENCES manicurists(id),
      UNIQUE(phone, manicurist_id)
    );

    CREATE TABLE IF NOT EXISTS visits (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      client_id INTEGER NOT NULL,
      manicurist_id INTEGER NOT NULL,
      service_type TEXT DEFAULT 'Manicure',
      is_free INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (client_id) REFERENCES clients(id),
      FOREIGN KEY (manicurist_id) REFERENCES manicurists(id)
    );
  `);

  return db;
}

const db = initDatabase();

// ==================== AUTH HELPERS ====================

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return { salt, hash };
}

function verifyPassword(password, salt, storedHash) {
  const derivedKey = crypto.scryptSync(password, salt, 64);
  const keyBuffer = Buffer.from(storedHash, 'hex');
  return crypto.timingSafeEqual(keyBuffer, derivedKey);
}

// ==================== MANICURIST OPERATIONS ====================

function createManicurist(name, phone, password, businessName) {
  const { salt, hash } = hashPassword(password);
  const uniqueCode = crypto.randomUUID().slice(0, 6).toUpperCase();
  const stmt = db.prepare(
    'INSERT INTO manicurists (name, phone, password_salt, password_hash, business_name, unique_code) VALUES (?, ?, ?, ?, ?, ?)'
  );
  const result = stmt.run(name.trim(), phone.trim(), salt, hash, (businessName || 'Mi Salón').trim(), uniqueCode);
  return { id: result.lastInsertRowid, uniqueCode };
}

function loginManicurist(phone, password) {
  const stmt = db.prepare('SELECT * FROM manicurists WHERE phone = ?');
  const manicurist = stmt.get(phone.trim());
  if (!manicurist) return null;
  if (!verifyPassword(password, manicurist.password_salt, manicurist.password_hash)) return null;
  
  const { password_salt: _s, password_hash: _h, ...safe } = manicurist;
  return safe;
}

function getManicuristByCode(code) {
  const stmt = db.prepare('SELECT id, name, business_name, unique_code, phone FROM manicurists WHERE unique_code = ?');
  return stmt.get(code.trim().toUpperCase());
}

function getManicuristById(id) {
  const stmt = db.prepare('SELECT id, name, phone, business_name, unique_code, created_at FROM manicurists WHERE id = ?');
  return stmt.get(Number(id));
}

// ==================== CLIENT OPERATIONS ====================

function findOrCreateClient(name, phone, manicuristId) {
  const cleanPhone = phone.trim();
  const cleanName = name.trim();

  let stmt = db.prepare('SELECT * FROM clients WHERE phone = ? AND manicurist_id = ?');
  let client = stmt.get(cleanPhone, Number(manicuristId));

  if (!client) {
    const insert = db.prepare('INSERT INTO clients (name, phone, manicurist_id) VALUES (?, ?, ?)');
    const result = insert.run(cleanName, cleanPhone, Number(manicuristId));
    client = { id: result.lastInsertRowid, name: cleanName, phone: cleanPhone, manicurist_id: Number(manicuristId) };
  } else if (cleanName && client.name !== cleanName) {
    // Update name if changed
    db.prepare('UPDATE clients SET name = ? WHERE id = ?').run(cleanName, client.id);
    client.name = cleanName;
  }

  return client;
}

function getClientsByManicurist(manicuristId) {
  const stmt = db.prepare(`
    SELECT c.id, c.name, c.phone, c.created_at,
           COUNT(v.id) as total_visits,
           SUM(CASE WHEN v.is_free = 0 THEN 1 ELSE 0 END) as paid_visits,
           SUM(CASE WHEN v.is_free = 1 THEN 1 ELSE 0 END) as free_visits
    FROM clients c
    LEFT JOIN visits v ON c.id = v.client_id
    WHERE c.manicurist_id = ?
    GROUP BY c.id
    ORDER BY c.name COLLATE NOCASE ASC
  `);
  return stmt.all(Number(manicuristId));
}

function getClientProgress(clientId, manicuristId) {
  const client = db.prepare('SELECT * FROM clients WHERE id = ? AND manicurist_id = ?').get(Number(clientId), Number(manicuristId));
  if (!client) return null;

  const visits = db.prepare(
    'SELECT * FROM visits WHERE client_id = ? AND manicurist_id = ? ORDER BY created_at ASC'
  ).all(Number(clientId), Number(manicuristId));

  // Count visits since the last free service
  let streakSinceFree = 0;
  for (const visit of visits) {
    if (visit.is_free) {
      streakSinceFree = 0;
    } else {
      streakSinceFree++;
    }
  }

  const hasFreeService = streakSinceFree >= 10;
  const stampsInCurrentCycle = Math.min(streakSinceFree, 10);
  const stampsNeeded = hasFreeService ? 0 : (10 - stampsInCurrentCycle);

  return {
    client,
    visits: visits.slice().reverse(), // newest first
    totalVisits: visits.length,
    streakSinceFree,
    stampsInCurrentCycle,
    hasFreeService,
    stampsNeeded
  };
}

function getClientProgressByPhone(phone, manicuristId) {
  const client = db.prepare('SELECT * FROM clients WHERE phone = ? AND manicurist_id = ?').get(phone.trim(), Number(manicuristId));
  if (!client) return null;
  return getClientProgress(client.id, manicuristId);
}

// ==================== VISIT OPERATIONS ====================

function registerVisit(clientId, manicuristId, serviceType = 'Manicure', isFree = false) {
  const stmt = db.prepare(
    'INSERT INTO visits (client_id, manicurist_id, service_type, is_free) VALUES (?, ?, ?, ?)'
  );
  const result = stmt.run(Number(clientId), Number(manicuristId), (serviceType || 'Manicure').trim(), isFree ? 1 : 0);
  return { id: result.lastInsertRowid };
}

function redeemFreeService(clientId, manicuristId, serviceType = 'Servicio GRATIS 🎉') {
  const progress = getClientProgress(clientId, manicuristId);
  if (!progress || !progress.hasFreeService) return false;

  registerVisit(clientId, manicuristId, serviceType, true);
  return true;
}

// ==================== STATS ====================

function getManicuristStats(manicuristId) {
  const mid = Number(manicuristId);

  const totalClients = (db.prepare('SELECT COUNT(*) as count FROM clients WHERE manicurist_id = ?').get(mid) || {}).count || 0;
  const totalVisits = (db.prepare('SELECT COUNT(*) as count FROM visits WHERE manicurist_id = ?').get(mid) || {}).count || 0;
  const freeGiven = (db.prepare('SELECT COUNT(*) as count FROM visits WHERE manicurist_id = ? AND is_free = 1').get(mid) || {}).count || 0;
  const todayVisits = (db.prepare(
    "SELECT COUNT(*) as count FROM visits WHERE manicurist_id = ? AND date(created_at) = date('now')"
  ).get(mid) || {}).count || 0;

  const recentVisits = db.prepare(`
    SELECT v.*, c.name as client_name, c.phone as client_phone
    FROM visits v
    JOIN clients c ON v.client_id = c.id
    WHERE v.manicurist_id = ?
    ORDER BY v.created_at DESC
    LIMIT 20
  `).all(mid);

  // Clients with progress
  const allClients = getClientsByManicurist(mid);
  const clientsProgressList = allClients.map(c => {
    const prog = getClientProgress(c.id, mid);
    return {
      id: c.id,
      name: c.name,
      phone: c.phone,
      total_visits: c.total_visits,
      stamps: prog ? prog.stampsInCurrentCycle : 0,
      hasFreeService: prog ? prog.hasFreeService : false
    };
  });

  const closeToFree = clientsProgressList.filter(c => c.stamps >= 7 || c.hasFreeService);

  return {
    totalClients,
    totalVisits,
    freeGiven,
    todayVisits,
    recentVisits,
    closeToFree
  };
}

module.exports = {
  db,
  createManicurist,
  loginManicurist,
  getManicuristByCode,
  getManicuristById,
  findOrCreateClient,
  getClientsByManicurist,
  getClientProgress,
  getClientProgressByPhone,
  registerVisit,
  redeemFreeService,
  getManicuristStats
};
