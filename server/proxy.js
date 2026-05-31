// planory-groq-proxy.js
// Lightweight proxy — Groq API key lives ONLY here on the server.
// The mobile app sends just the image payload; the key is never exposed to clients.

import http from 'http';
import https from 'https';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ── Load .env file manually (no external deps needed) ────────────────────────
function loadEnv() {
  const envPath = path.join(__dirname, '.env');
  if (!fs.existsSync(envPath)) return;
  const lines = fs.readFileSync(envPath, 'utf8').split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const [key, ...rest] = trimmed.split('=');
    if (key && rest.length > 0) {
      process.env[key.trim()] = rest.join('=').trim();
    }
  }
}
loadEnv();

const PORT = process.env.PORT || 3001;
const GROQ_KEY = process.env.GROQ_API_KEY || '';

if (!GROQ_KEY || GROQ_KEY === 'your_groq_api_key_here') {
  console.warn('\n⚠️  WARNING: GROQ_API_KEY is not set in server/.env');
  console.warn('   OCR scans will fail. Set your key in server/.env\n');
} else {
  console.log('✅ Groq API Key loaded (hidden from app)');
}

// ─────────────────────────────────────────────────────────────────────────────

function parseJSON(str) {
  try { return JSON.parse(str); } catch { return null; }
}

function sendJSON(res, status, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Length': Buffer.byteLength(body),
  });
  res.end(body);
}

function groqRequest(payload) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify(payload);
    const options = {
      hostname: 'api.groq.com',
      path: '/openai/v1/chat/completions',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${GROQ_KEY}`,
        'Content-Length': Buffer.byteLength(body),
      },
    };

    const req = https.request(options, (groqRes) => {
      let data = '';
      groqRes.on('data', (chunk) => { data += chunk; });
      groqRes.on('end', () => resolve({ status: groqRes.statusCode, body: data }));
    });

    req.on('error', reject);
    req.setTimeout(90000, () => { req.destroy(); reject(new Error('Request timeout after 90s')); });
    req.write(body);
    req.end();
  });
}

function groqGetModels() {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'api.groq.com',
      path: '/openai/v1/models',
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${GROQ_KEY}`,
      },
    };

    const req = https.request(options, (groqRes) => {
      let data = '';
      groqRes.on('data', (chunk) => { data += chunk; });
      groqRes.on('end', () => resolve({ status: groqRes.statusCode, body: data }));
    });

    req.on('error', reject);
    req.end();
  });
}

const server = http.createServer(async (req, res) => {
  // CORS preflight
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    });
    res.end();
    return;
  }

  // Health check
  if (req.method === 'GET' && req.url === '/api/health') {
    let models = [];
    try {
      if (GROQ_KEY && GROQ_KEY !== 'your_groq_api_key_here') {
        const resModels = await groqGetModels();
        const parsed = parseJSON(resModels.body);
        models = parsed?.data?.map(m => m.id) || [];
      }
    } catch (err) {
      console.error('[Health] Failed to load models:', err.message);
    }
    return sendJSON(res, 200, {
      status: 'ok',
      keyLoaded: !!GROQ_KEY && GROQ_KEY !== 'your_groq_api_key_here',
      models,
      timestamp: Date.now()
    });
  }

  // OCR Proxy — app sends only the payload (image + prompt), key is server-side
  if (req.method === 'POST' && req.url === '/api/ocr') {
    if (!GROQ_KEY || GROQ_KEY === 'your_groq_api_key_here') {
      return sendJSON(res, 503, { error: 'Groq API key not configured on server. Set GROQ_API_KEY in server/.env' });
    }

    let rawBody = '';
    req.on('data', (chunk) => { rawBody += chunk; });
    req.on('end', async () => {
      const parsed = parseJSON(rawBody);
      if (!parsed || !parsed.payload) {
        return sendJSON(res, 400, { error: 'Missing payload in request body' });
      }

      try {
        console.log(`[OCR] Processing ${parsed.type || 'scan'} request...`);
        const result = await groqRequest(parsed.payload);
        const parsedResult = parseJSON(result.body);
        console.log(`[OCR] Done — Groq status ${result.status}`);
        sendJSON(res, result.status, parsedResult || { error: result.body });
      } catch (err) {
        console.error('[OCR] Groq request failed:', err.message);
        sendJSON(res, 502, { error: 'Upstream Groq request failed: ' + err.message });
      }
    });
    return;
  }

  sendJSON(res, 404, { error: 'Not found' });
});

server.listen(PORT, () => {
  console.log(`\n🚀 [Planory OCR Proxy] Running on http://localhost:${PORT}`);
  console.log(`   Health: http://localhost:${PORT}/api/health`);
  console.log(`   OCR:    POST http://localhost:${PORT}/api/ocr\n`);
});

server.on('error', (err) => {
  console.error('[Proxy] Server error:', err.message);
  if (err.code === 'EADDRINUSE') {
    console.error(`[Proxy] Port ${PORT} already in use — kill the existing process first.`);
  }
  process.exit(1);
});
