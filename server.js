const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const url = require('node:url');
const db = require('./database');
const qrGen = require('./lib/qrcode');

const PORT = process.env.PORT || 3000;
const PUBLIC_DIR = path.join(__dirname, 'public');

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon'
};

function sendJson(res, statusCode, data) {
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type'
  });
  res.end(JSON.stringify(data));
}

function parseBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => {
      body += chunk;
      if (body.length > 1e6) { // 1MB limit
        req.destroy();
        reject(new Error('Payload too large'));
      }
    });
    req.on('end', () => {
      if (!body) return resolve({});
      try {
        resolve(JSON.parse(body));
      } catch (err) {
        // Try urlencoded
        try {
          const params = new URLSearchParams(body);
          const obj = {};
          for (const [k, v] of params) obj[k] = v;
          resolve(obj);
        } catch (e2) {
          resolve({});
        }
      }
    });
    req.on('error', reject);
  });
}

function serveStatic(res, filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const contentType = MIME_TYPES[ext] || 'application/octet-stream';

  fs.readFile(filePath, (err, content) => {
    if (err) {
      if (err.code === 'ENOENT') {
        res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('404 Not Found');
      } else {
        res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('500 Server Error');
      }
      return;
    }

    res.writeHead(200, { 'Content-Type': contentType });
    res.end(content);
  });
}

const server = http.createServer(async (req, res) => {
  // CORS Preflight
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type'
    });
    return res.end();
  }

  const parsedUrl = url.parse(req.url, true);
  const pathname = parsedUrl.pathname;
  const method = req.method;

  try {
    // ==================== API: MANICURIST AUTH ====================
    if (pathname === '/api/register' && method === 'POST') {
      const body = await parseBody(req);
      const { name, phone, password, businessName } = body;
      if (!name || !phone || !password) {
        return sendJson(res, 400, { error: 'Nombre, teléfono y contraseña son requeridos' });
      }
      try {
        const result = db.createManicurist(name, phone, password, businessName);
        const manicurist = db.getManicuristById(result.id);
        return sendJson(res, 200, { success: true, manicurist });
      } catch (err) {
        if (err.message && err.message.includes('UNIQUE')) {
          return sendJson(res, 400, { error: 'Este número de teléfono ya está registrado' });
        }
        return sendJson(res, 500, { error: 'Error al registrar: ' + err.message });
      }
    }

    if (pathname === '/api/login' && method === 'POST') {
      const body = await parseBody(req);
      const { phone, password } = body;
      if (!phone || !password) {
        return sendJson(res, 400, { error: 'Teléfono y contraseña son requeridos' });
      }
      const manicurist = db.loginManicurist(phone, password);
      if (!manicurist) {
        return sendJson(res, 401, { error: 'Teléfono o contraseña incorrectos' });
      }
      return sendJson(res, 200, { success: true, manicurist });
    }

    // ==================== API: QR CODE ====================
    if (pathname.startsWith('/api/qr/') && method === 'GET') {
      const code = pathname.replace('/api/qr/', '').trim().toUpperCase();
      const host = req.headers.host || `localhost:${PORT}`;
      const protocol = req.headers['x-forwarded-proto'] || 'http';
      const visitUrl = `${protocol}://${host}/visit.html?code=${code}`;

      const qrDataUrl = qrGen.generateDataURL(visitUrl, {
        size: 320,
        margin: 4,
        darkColor: '#E91E63',
        lightColor: '#FFFFFF'
      });

      return sendJson(res, 200, { qr: qrDataUrl, url: visitUrl, code });
    }

    // ==================== API: MANICURIST INFO ====================
    if (pathname.startsWith('/api/manicurist/') && method === 'GET') {
      const code = pathname.replace('/api/manicurist/', '').trim().toUpperCase();
      const manicurist = db.getManicuristByCode(code);
      if (!manicurist) {
        return sendJson(res, 404, { error: 'Manicurista no encontrada para este código QR' });
      }
      return sendJson(res, 200, manicurist);
    }

    // ==================== API: CLIENT VISIT ====================
    if (pathname === '/api/visit' && method === 'POST') {
      const body = await parseBody(req);
      const { clientName, clientPhone, manicuristCode, serviceType } = body;

      if (!clientName || !clientPhone || !manicuristCode) {
        return sendJson(res, 400, { error: 'Por favor completa todos los campos' });
      }

      const manicurist = db.getManicuristByCode(manicuristCode);
      if (!manicurist) {
        return sendJson(res, 404, { error: 'Manicurista no encontrada' });
      }

      const client = db.findOrCreateClient(clientName, clientPhone, manicurist.id);
      const currentProgress = db.getClientProgress(client.id, manicurist.id);

      // If client already has earned a free service waiting to be redeemed
      if (currentProgress && currentProgress.hasFreeService) {
        return sendJson(res, 200, {
          success: true,
          message: '🎉 ¡Ya tienes acumulados 10 sellos! Tu próximo servicio es GRATIS.',
          hasFreeService: true,
          progress: currentProgress
        });
      }

      // Register the service visit
      db.registerVisit(client.id, manicurist.id, serviceType || 'Manicure');
      const updatedProgress = db.getClientProgress(client.id, manicurist.id);

      const msg = updatedProgress.hasFreeService
        ? '🎉 ¡FELICIDADES! ¡Has completado 10 servicios! Tu próximo servicio es GRATIS.'
        : `✅ ¡Visita registrada con éxito! Te faltan ${updatedProgress.stampsNeeded} visita(s) para tu servicio gratis.`;

      return sendJson(res, 200, {
        success: true,
        message: msg,
        hasFreeService: updatedProgress.hasFreeService,
        progress: updatedProgress
      });
    }

    if (pathname === '/api/visit/redeem' && method === 'POST') {
      const body = await parseBody(req);
      const { clientPhone, manicuristCode } = body;

      const manicurist = db.getManicuristByCode(manicuristCode);
      if (!manicurist) return sendJson(res, 404, { error: 'Manicurista no encontrada' });

      const progress = db.getClientProgressByPhone(clientPhone, manicurist.id);
      if (!progress) return sendJson(res, 404, { error: 'Clienta no encontrada' });

      if (!progress.hasFreeService) {
        return sendJson(res, 400, { error: 'Aún no tiene 10 servicios acumulados para canjear' });
      }

      db.redeemFreeService(progress.client.id, manicurist.id);
      const updated = db.getClientProgress(progress.client.id, manicurist.id);

      return sendJson(res, 200, {
        success: true,
        message: '🎁 ¡Servicio gratis canjeado exitosamente! Tu tarjeta se ha reiniciado para el siguiente ciclo.',
        progress: updated
      });
    }

    // ==================== API: CLIENT LOOKUP ====================
    if (pathname === '/api/client/progress' && method === 'GET') {
      const { phone, code } = parsedUrl.query;
      if (!phone || !code) {
        return sendJson(res, 400, { error: 'Teléfono y código del salón requeridos' });
      }

      const manicurist = db.getManicuristByCode(code);
      if (!manicurist) return sendJson(res, 404, { error: 'Código de salón no encontrado' });

      const progress = db.getClientProgressByPhone(phone, manicurist.id);
      if (!progress) {
        return sendJson(res, 404, { error: 'No se encontraron visitas registradas con este número en este salón' });
      }

      return sendJson(res, 200, progress);
    }

    // ==================== API: ADMIN DASHBOARD ====================
    if (pathname.startsWith('/api/admin/stats/') && method === 'GET') {
      const manicuristId = pathname.replace('/api/admin/stats/', '');
      const stats = db.getManicuristStats(manicuristId);
      return sendJson(res, 200, stats);
    }

    if (pathname.startsWith('/api/admin/clients/') && method === 'GET') {
      const manicuristId = pathname.replace('/api/admin/clients/', '');
      const clients = db.getClientsByManicurist(manicuristId);
      return sendJson(res, 200, clients);
    }

    // Pattern: /api/admin/client/:clientId/progress/:manicuristId
    if (pathname.startsWith('/api/admin/client/') && pathname.includes('/progress/') && method === 'GET') {
      const parts = pathname.split('/');
      // ['', 'api', 'admin', 'client', clientId, 'progress', manicuristId]
      const clientId = parts[4];
      const manicuristId = parts[6];
      const progress = db.getClientProgress(clientId, manicuristId);
      if (!progress) return sendJson(res, 404, { error: 'Clienta no encontrada' });
      return sendJson(res, 200, progress);
    }

    if (pathname === '/api/admin/visit' && method === 'POST') {
      const body = await parseBody(req);
      const { clientId, manicuristId, serviceType, isFree } = body;
      db.registerVisit(clientId, manicuristId, serviceType || 'Manicure', !!isFree);
      const progress = db.getClientProgress(clientId, manicuristId);
      return sendJson(res, 200, { success: true, progress });
    }

    if (pathname === '/api/admin/redeem' && method === 'POST') {
      const body = await parseBody(req);
      const { clientId, manicuristId } = body;
      const success = db.redeemFreeService(clientId, manicuristId);
      if (!success) {
        return sendJson(res, 400, { error: 'Esta clienta aún no tiene los 10 servicios requeridos' });
      }
      const progress = db.getClientProgress(clientId, manicuristId);
      return sendJson(res, 200, { success: true, progress });
    }

    if (pathname === '/api/admin/client' && method === 'POST') {
      const body = await parseBody(req);
      const { name, phone, manicuristId } = body;
      if (!name || !phone || !manicuristId) {
        return sendJson(res, 400, { error: 'Nombre y teléfono son requeridos' });
      }
      const client = db.findOrCreateClient(name, phone, manicuristId);
      return sendJson(res, 200, { success: true, client });
    }

    // ==================== STATIC FILES ====================
    let relativePath = pathname === '/' ? 'index.html' : pathname;
    if (relativePath === '/admin') relativePath = 'admin.html';
    if (relativePath === '/visit') relativePath = 'visit.html';
    if (relativePath.startsWith('/')) relativePath = relativePath.slice(1);

    const safePath = path.normalize(path.join(PUBLIC_DIR, relativePath));
    if (!safePath.startsWith(PUBLIC_DIR)) {
      res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
      return res.end('403 Forbidden');
    }

    return serveStatic(res, safePath);

  } catch (err) {
    console.error('Unhandled server error:', err);
    sendJson(res, 500, { error: 'Error interno del servidor: ' + err.message });
  }
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`\n==================================================`);
  console.log(`💅 APP DE FIDELIDAD PARA MANICURISTAS INICIADA`);
  console.log(`==================================================`);
  console.log(`🌐 Acceso local:       http://localhost:${PORT}`);
  console.log(`👩‍💼 Panel Manicurista:  http://localhost:${PORT}/admin.html`);
  console.log(`📱 Vista QR Clientas:  http://localhost:${PORT}/visit.html?code=XXXXXX`);
  console.log(`==================================================\n`);
});
