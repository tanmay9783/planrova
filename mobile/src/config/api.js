// src/config/api.js
// Central configuration for the Planory OCR proxy server.
//
// HOW TO SWITCH ENVIRONMENTS:
//   - Development (local PC):   Use PROXY_URLS_LOCAL  (default below)
//   - Production (cloud):       Replace CLOUD_PROXY_URL with your Railway/Render URL
//
// The app tries each URL in order and uses the first one that responds.

// ── Your deployed cloud proxy URL (set this after deploying to Railway/Render) ──
// Example: 'https://planory-proxy.up.railway.app'
export const CLOUD_PROXY_URL = '';   // ← Paste your Railway URL here after deploy

// ── Fallback URLs for local development (emulator + simulator) ──
const LOCAL_PROXY_URLS = [
  'http://10.0.2.2:3001',   // Android emulator → host machine
  'http://localhost:3001',   // iOS simulator / physical device
];

// ── Build the full ordered list of proxy base URLs to try ──
export function getProxyUrls() {
  const urls = [];
  if (CLOUD_PROXY_URL && CLOUD_PROXY_URL.trim()) {
    urls.push(CLOUD_PROXY_URL.trim().replace(/\/$/, ''));  // cloud first
  }
  urls.push(...LOCAL_PROXY_URLS);  // then local fallbacks
  return urls;
}

// ── Make an OCR request through any available proxy ──
// payload: the Groq chat completions payload (model + messages)
// type: 'whiteboard' | 'calendar' | 'timetable'
export async function callOcrProxy(payload, type = 'scan') {
  const proxyUrls = getProxyUrls();
  let lastError = null;

  for (const baseUrl of proxyUrls) {
    try {
      const response = await fetch(`${baseUrl}/api/ocr`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type, payload }),
      });
      if (response.ok) return response;
      // Non-ok from a reachable server (e.g. 503 key not configured)
      const errBody = await response.json().catch(() => ({}));
      throw new Error(`Server error ${response.status}: ${errBody?.error || 'Unknown'}`);
    } catch (err) {
      console.log(`[OCR] Proxy failed for ${baseUrl}: ${err.message}`);
      lastError = err;
    }
  }

  throw lastError || new Error('All proxy endpoints unreachable');
}
