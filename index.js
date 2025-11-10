// Mid-October stable build
require('dotenv').config();
const express = require('express');
const { twiml: TwilioTwiML } = require('twilio');

// If your Node < 18, uncomment next line and: npm i node-fetch
// const fetch = (...args) => import('node-fetch').then(({default: f}) => f(...args));

const app = express();

// --- CORS (safe for your landing page / local tests)
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*'); // or your landing domain
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.sendStatus(200);
  next();
});

// Twilio sends application/x-www-form-urlencoded
app.use(express.urlencoded({ extended: false }));
app.use(express.json());

const PORT = Number(process.env.PORT) || 3000;
const SHEETS_URL = process.env.SHEETS_WEBAPP_URL;

if (!SHEETS_URL) {
  console.warn('⚠️ SHEETS_WEBAPP_URL is not set — Sheets logging will fail.');
}

// ---- helper: append a row to Apps Script Web App (GET + query params)
async function appendToSheet({ source, name, phone, message }) {
  const qs = new URLSearchParams({
    action: 'append',
    source: source || 'unknown',
    name: name || '',
    phone: phone || '',
    message: message || ''
  }).toString();

  const url = `${SHEETS_URL}?${qs}`;
  const r = await fetch(url, { method: 'GET' });
  const text = await r.text();

  console.log('Sheets status:', r.status, text.slice(0, 200));
  return { ok: r.ok, status: r.status, body: text };
}

// ---- health / ping
app.get('/health', (req, res) => res.json({ ok: true, env: { hasSheetsUrl: !!SHEETS_URL } }));

// ---- manual test that writes a row (use in browser)
app.get('/test/sheets', async (req, res) => {
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

// ---- Twilio SMS webhook (set in Twilio → Messaging → A MESSAGE COMES IN)
app.post('/twilio/sms', async (req, res) => {
  try {
    const from = req.body.From || '';
    const body = (req.body.Body || '').toString();

    await appendToSheet({
      source: 'twilio',
      name: from,
      phone: from,
      message: body
    });

    // TwiML reply to sender
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

// (optional) Twilio Voice webhook placeholder — safe no-op
app.post('/twilio/voice', (req, res) => {
  const twiml = new TwilioTwiML.VoiceResponse();
  twiml.say('Thanks for calling. Please text us your details and we will get back to you shortly.');
  twiml.hangup();
  res.type('text/xml').status(200).send(twiml.toString());
});

app.listen(PORT, () => console.log('Sophia Voice listening on', PORT));
