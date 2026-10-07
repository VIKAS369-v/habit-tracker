const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const url = require('node:url');
const { HabitDatabase } = require('./db.js');

const PORT = process.env.PORT || 3000;
const PUBLIC_DIR = __dirname;

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf'
};

function parseJsonBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => {
      body += chunk;
      if (body.length > 1e6) { // 1MB limit
        req.destroy();
        reject(new Error('Request entity too large'));
      }
    });
    req.on('end', () => {
      if (!body.trim()) {
        return resolve({});
      }
      try {
        resolve(JSON.parse(body));
      } catch (err) {
        reject(new Error('Invalid JSON format'));
      }
    });
    req.on('error', reject);
  });
}

function sendJson(res, statusCode, data) {
  const payload = JSON.stringify(data);
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(payload),
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type'
  });
  res.end(payload);
}

function createServer(dbInstance) {
  const db = dbInstance || new HabitDatabase();

  const server = http.createServer(async (req, res) => {
    // Handle CORS preflight
    if (req.method === 'OPTIONS') {
      res.writeHead(204, {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type'
      });
      return res.end();
    }

    const reqUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    const pathname = reqUrl.pathname;
    const query = Object.fromEntries(reqUrl.searchParams.entries());

    try {
      // ---------------- API ROUTES ----------------

      // GET /api/data?month=YYYY-MM&today=YYYY-MM-DD
      if (req.method === 'GET' && pathname === '/api/data') {
        const now = new Date();
        const defaultMonth = now.toISOString().slice(0, 7); // 'YYYY-MM'
        const defaultToday = now.toISOString().slice(0, 10);
        const month = query.month || defaultMonth;
        const today = query.today || defaultToday;

        const data = db.getMonthData(month, today);
        return sendJson(res, 200, data);
      }

      // POST /api/habits
      if (req.method === 'POST' && pathname === '/api/habits') {
        const body = await parseJsonBody(req);
        if (!body.name || !body.name.trim()) {
          return sendJson(res, 400, { error: 'Habit name is required' });
        }
        const habit = db.addHabit(body.name, body.color, body.category);
        return sendJson(res, 201, habit);
      }

      // DELETE /api/habits/:id
      const habitDeleteMatch = pathname.match(/^\/api\/habits\/(\d+)$/);
      if (req.method === 'DELETE' && habitDeleteMatch) {
        const id = habitDeleteMatch[1];
        const success = db.deleteHabit(id);
        if (success) {
          return sendJson(res, 200, { success: true, id: Number(id) });
        } else {
          return sendJson(res, 404, { error: 'Habit not found' });
        }
      }

      // PUT /api/habits/:id (rename)
      const habitPutMatch = pathname.match(/^\/api\/habits\/(\d+)$/);
      if (req.method === 'PUT' && habitPutMatch) {
        const id = habitPutMatch[1];
        const body = await parseJsonBody(req);
        if (!body.name || !body.name.trim()) {
          return sendJson(res, 400, { error: 'Habit name is required' });
        }
        const updated = db.renameHabit(id, body.name);
        return sendJson(res, 200, updated);
      }

      // POST /api/checkins/toggle
      if (req.method === 'POST' && pathname === '/api/checkins/toggle') {
        const body = await parseJsonBody(req);
        if (!body.habitId || !body.date) {
          return sendJson(res, 400, { error: 'habitId and date are required' });
        }
        const result = db.toggleCheckin(body.habitId, body.date);
        return sendJson(res, 200, result);
      }

      // POST /api/sleep
      if (req.method === 'POST' && pathname === '/api/sleep') {
        const body = await parseJsonBody(req);
        if (!body.date || body.hours === undefined) {
          return sendJson(res, 400, { error: 'date and hours are required' });
        }
        const record = db.setSleep(body.date, body.hours, body.quality);
        return sendJson(res, 200, record);
      }

      // POST /api/mood
      if (req.method === 'POST' && pathname === '/api/mood') {
        const body = await parseJsonBody(req);
        if (!body.date || body.score === undefined) {
          return sendJson(res, 400, { error: 'date and score are required' });
        }
        const record = db.setMood(body.date, body.score, body.tag);
        return sendJson(res, 200, record);
      }

      // GET /api/health
      if (req.method === 'GET' && pathname === '/api/health') {
        return sendJson(res, 200, { status: 'healthy', timestamp: new Date().toISOString() });
      }

      // ---------------- STATIC FILE SERVING ----------------
      if (req.method === 'GET') {
        let safePath = path.normalize(pathname).replace(/^(\.\.[\/\\])+/, '');
        if (safePath === '/' || safePath === '') {
          safePath = '/index.html';
        }

        const filePath = path.join(PUBLIC_DIR, safePath);

        // Security check: ensure filePath is inside PUBLIC_DIR
        if (!filePath.startsWith(PUBLIC_DIR)) {
          res.writeHead(403);
          return res.end('Access Denied');
        }

        fs.stat(filePath, (err, stats) => {
          if (err || !stats.isFile()) {
            // If requesting non-existent static asset, fall back to index.html for SPA if html requested
            const indexPath = path.join(PUBLIC_DIR, 'index.html');
            fs.readFile(indexPath, (indexErr, indexData) => {
              if (indexErr) {
                res.writeHead(404, { 'Content-Type': 'text/plain' });
                return res.end('Not Found');
              }
              res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
              return res.end(indexData);
            });
            return;
          }

          const ext = path.extname(filePath).toLowerCase();
          const contentType = MIME_TYPES[ext] || 'application/octet-stream';

          res.writeHead(200, {
            'Content-Type': contentType,
            'Content-Length': stats.size,
            'Cache-Control': 'no-cache'
          });

          const readStream = fs.createReadStream(filePath);
          readStream.pipe(res);
        });
        return;
      }

      // Method not allowed
      sendJson(res, 405, { error: 'Method not allowed' });
    } catch (err) {
      console.error('Server error:', err);
      sendJson(res, 500, { error: err.message || 'Internal Server Error' });
    }
  });

  return { server, db };
}

if (require.main === module) {
  const { server } = createServer();
  server.listen(PORT, () => {
    console.log(`\n======================================================`);
    console.log(`📓 Bullet Journal Habit Tracker running at:`);
    console.log(`   http://localhost:${PORT}`);
    console.log(`======================================================\n`);
  });
}

module.exports = { createServer };
