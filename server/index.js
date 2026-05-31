import express from 'express';
import cors from 'cors';
import db from './db.js';

const app = express();
const PORT = 3001;

app.use(cors()); // Allow all origins for local development
app.use(express.json({ limit: '10mb' }));

// ── GET all data (startup sync) ──────────────────────────────────
app.get('/api/data', (req, res) => {
  try {
    const rows = db.prepare('SELECT key, value FROM kv_store').all();
    const result = {};
    rows.forEach(row => {
      try { result[row.key] = JSON.parse(row.value); }
      catch { result[row.key] = row.value; }
    });
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET single key ────────────────────────────────────────────────
app.get('/api/data/:key', (req, res) => {
  try {
    const row = db.prepare('SELECT value FROM kv_store WHERE key = ?').get(req.params.key);
    if (!row) return res.json({ exists: false, value: null });
    try {
      res.json({ exists: true, value: JSON.parse(row.value) });
    } catch {
      res.json({ exists: true, value: row.value });
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── SET / UPSERT a key ────────────────────────────────────────────
app.post('/api/data/:key', (req, res) => {
  try {
    const { value } = req.body;
    const serialized = typeof value === 'string' ? value : JSON.stringify(value);
    db.prepare(`
      INSERT INTO kv_store (key, value, updated_at)
      VALUES (?, ?, strftime('%s', 'now'))
      ON CONFLICT(key) DO UPDATE SET
        value = excluded.value,
        updated_at = excluded.updated_at
    `).run(req.params.key, serialized);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── DELETE a key ──────────────────────────────────────────────────
app.delete('/api/data/:key', (req, res) => {
  try {
    db.prepare('DELETE FROM kv_store WHERE key = ?').run(req.params.key);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── BULK IMPORT (migrate localStorage → DB on first run) ──────────
app.post('/api/import', (req, res) => {
  try {
    const data = req.body; // { key: value, ... }
    const upsert = db.prepare(`
      INSERT INTO kv_store (key, value, updated_at)
      VALUES (?, ?, strftime('%s', 'now'))
      ON CONFLICT(key) DO UPDATE SET
        value = excluded.value,
        updated_at = excluded.updated_at
    `);
    const importAll = db.transaction((entries) => {
      for (const [key, value] of entries) {
        upsert.run(key, typeof value === 'string' ? value : JSON.stringify(value));
      }
    });
    importAll(Object.entries(data));
    res.json({ ok: true, imported: Object.keys(data).length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Proxy Groq OCR request to bypass SSL/Network restrictions on emulator ──
app.post('/api/ocr', async (req, res) => {
  try {
    const { apiKey, payload } = req.body;
    if (!apiKey) {
      return res.status(400).json({ error: "Missing API Key" });
    }
    const response = await fetch(
      'https://api.groq.com/openai/v1/chat/completions',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify(payload)
      }
    );
    const data = await response.json();
    if (!response.ok) {
      return res.status(response.status).json(data);
    }
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Health check ──────────────────────────────────────────────────
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: Date.now() });
});

app.listen(PORT, () => {
  console.log(`[Planory API] Running at http://localhost:${PORT}`);
});
