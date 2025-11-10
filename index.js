// Sophia Backend (merged) — Persona + Chat + Twilio SMS → Google Sheets
require('dotenv').config();

const fs = require('fs');
const path = require('path');
const express = require('express');
const cors = require('cors');
const { twiml: TwilioTwiML } = require('twilio');

// If your Node < 18, uncomment next line and run `npm i node-fetch`
// const fetch = (...args) => import('node-fetch').then(({ default: f }) => f(...args));

const app = express();

/* ───────────────────────── CORS ─────────────────────────
   Allow your landing page to call this API. Twilio doesn't use CORS,
   but the browser requests from your site do. */
const LANDING_ORIGIN = 'https://mbayingana777-del.github.io';
app.use(cors({ origin: [LANDING_ORIGIN] }));
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', LANDING_ORIGIN);
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.sendStatus(200);
  next();
});

// Twilio sends x-www-form-urlencoded, browser sends JSON
app.use(express.urlencoded({ extended: false }));
app.use(express.json());

const PORT = Number(process.env.PORT) || 3000;
const SHEETS_URL = process.env.SHEETS_WEBAPP_URL;

if (!SHEETS_URL) {
  console.warn('⚠️  SHEETS_WEBAPP_URL is not set — Sheets logging will fail.');
}

/* ───────────────────── Persona helpers ───────────────────── */
function safeReadText(relPath, fallback = '') {
  try { return fs.readFileSync(path.join(__dirname, relPath), 'utf8'); }
  catch { return fallback; }
}
function safeReadJSON(relPath, fallback = {}) {
  try { return JSON.parse(safeReadText(relPath, JSON.stringify(fallback))); }
  catch { return fallback; }
}

/* ─────────────── Sheets append (POST form-encoded) ───────────────
   Your Apps Script is expecting POST (not GET). */
async function appendToSheet({ source, name, phone, message }) {
  const body = new URLSearchParams({
    action: 'append',
    source: source || 'unknown',
    name: name || '',
    phone: phone || '',
    message: message || ''
  });

  const r = await fetch(SHEETS_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body
  });

  const text = await r.text();
  console.log('Sheets status:', r.status, text.slice(0, 200));
  return { ok: r.ok, status: r.status, body: text };
}

/* ───────────────────────── Health ───────────────────────── */
app.get('/status', (_req, res) =>
  res.json({ ok: true, status: 'running', service: 'sophia-voice' })
);
app.get('/health', (_req, res) =>
  res.json({ ok: true, env: { hasSheetsUrl: !!SHEETS_URL } })
);
app.get('/', (_req, res) => res.send('Sophia backend live'));

/* ───────────────────────── Persona ─────────────────────────
   Works on /persona and /api/persona  */
function personaHandler(req, res) {
  try {
    const niche = (req.query.niche || '').toLowerCase();
    const packParam = (req.query.pack || '').toLowerCase();
    const packs = packParam ? packParam.split(',').map(s => s.trim()).filter(Boolean) : [];

    const base = safeReadJSON('persona/base.json', {
      business_name: 'Sophia Voice',
      brand: { tagline: 'Your 24/7 AI receptionist that books, texts, and calls back instantly.' },
      booking_link: 'https://calendly.com/mbayingana777/call-with-sophia',
      consent: 'By submitting you consent to SMS/voice from Sophia. Reply STOP to opt out.'
    });
    const prompts = safeReadText('persona/prompts.md', 'You are Sophia, a helpful AI receptionist.');

    const payload = { base, prompts };

    if (niche) {
      const nicheOverride = safeReadJSON(`persona/niches/${niche}.json`, null);
      if (nicheOverride) { payload.niche = niche; payload.override = nicheOverride; }
    }

    if (packs.length) {
      payload.packs = {};
      for (const p of packs) {
        const packCfg = safeReadJSON(`persona/packs/${p}.json`, null);
        if (packCfg) payload.packs[p] = packCfg;
      }
    }

    res.json(payload);
  } catch (err) {
    console.error('Persona route error:', err);
    res.status(500).json({ error: 'Failed to load persona' });
  }
}
app.get('/persona', personaHandler);
app.get('/api/persona', personaHandler);

/* ───────────────────────── Chat (temp) ───────────────────────── */
app.post('/api/chat', (req, res) => {
  const { message, session_id } = req.body || {};
  if (!message) return res.status(400).json({ error: 'message required' });
  res.json({ reply: `You said: ${message}`, session_id: session_id || 'sess-' + Date.now() });
});

/* ─────────────────── Sheets test (manual) ─────────────────── */
app.get('/test/sheets', async (_req, res) => {
  try {
    const result = await appendToSheet({
      source: 'manual',
      name: 'HealthCheck',
      phone: '+10000000000',
      message: 'hello'
    });
    res.json({ ok: result.ok, status: result.status, body: result.body.slice(0, 200) });
  } catch (e) {
    console.error('Health error:', e);
    res.status(500).json({ ok: false, error: String(e) });
  }
});

/* ─────────────────────── Twilio webhooks ─────────────────────── */
app.post('/twilio/sms', async (req, res) => {
  try {
    const from = req.body.From || '';
    const body = (req.body.Body || '').toString();

    await appendToSheet({ source: 'twilio', name: from, phone: from, message: body });

    const twiml = new TwilioTwiML.MessagingResponse();
    twiml.message("Thanks! We got your message — we’ll follow up shortly.");
    res.type('text/xml').status(200).send(twiml.toString());
  } catch (e) {
    console.error('SMS handler error:', e);
    const twiml = new TwilioTwiML.MessagingResponse();
    twiml.message("Oops — had a hiccup logging that. We’ll follow up.");
    res.type('text/xml').status(200).send(twiml.toString());
  }
});

app.post('/twilio/voice', (req, res) => {
  const twiml = new TwilioTwiML.VoiceResponse();
  twiml.say('Thanks for calling. Please text us your details and we will get back to you shortly.');
  twiml.hangup();
  res.type('text/xml').status(200).send(twiml.toString());
});

/* ─────────────────────── Start server ─────────────────────── */
app.listen(PORT, () => console.log('Sophia backend running on port ' + PORT));
