// --- Sophia Voice server (CommonJS) ---
require('dotenv').config();
const express = require('express');
const twilioLib = require('twilio');

// Node 18+ has global fetch; if not, uncomment next line:
// const fetch = (...args) => import('node-fetch').then(({default: f}) => f(...args));

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

// Allow your landing page to POST /web-lead
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.sendStatus(200);
  next();
});

// ---------- helpers ----------
async function postToSheets(payload) {
  try {
    const url = process.env.SHEETS_WEBAPP_URL; // Google Apps Script /exec
    if (!url) return;
    await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
  } catch (e) {
    console.error('postToSheets failed:', e.message);
  }
}

function logLead({ channel, from, body, source, utm }) {
  return postToSheets({
    timestamp: new Date().toISOString(),
    channel,
    from,
    body,
    source,
    utm,
  });
}

async function notifyOwner(text) {
  try {
    const { TWILIO_SID, TWILIO_AUTH, TWILIO_NUMBER, OWNER_PHONE } = process.env;
    if (!TWILIO_SID || !TWILIO_AUTH || !TWILIO_NUMBER || !OWNER_PHONE) return;
    const client = twilioLib(TWILIO_SID, TWILIO_AUTH);
    await client.messages.create({
      to: OWNER_PHONE,
      from: TWILIO_NUMBER,
      body: text.slice(0, 1400),
    });
  } catch (e) {
    console.error('notifyOwner failed:', e.message);
  }
}

// ---------- root & health ----------
app.get('/', (_, res) => res.status(200).send('Sophia Voice is live ✅'));

app.get('/status', async (_, res) => {
  const ok = {
    server: 'OK',
    openai: process.env.OPENAI_API_KEY ? 'OK' : 'MISSING',
    sheets: process.env.SHEETS_WEBAPP_URL ? 'OK' : 'MISSING',
  };
  res.json(ok);
});

// ---------- SMS webhook ----------
app.post('/sms', async (req, res) => {
  const { twiml } = twilioLib;
  const from = req.body.From || 'Unknown';
  const body = (req.body.Body || '').trim();
  const msg = new twiml.MessagingResponse();

  // Compliance keywords
  const upper = body.toUpperCase();
  if (['STOP', 'UNSUBSCRIBE', 'CANCEL', 'END', 'QUIT'].includes(upper)) {
    msg.message('You have opted out of Sophia Voice messages. Reply START to resubscribe.');
    await logLead({ channel: 'SMS', from, body: 'STOP', source: 'sms' });
    return res.type('text/xml').send(msg.toString());
  }
  if (upper === 'HELP') {
    msg.message('Sophia Voice AI Receptionist. For help email hello@sophiavoice.ai. Msg&Data rates may apply. Reply STOP to opt out.');
    await logLead({ channel: 'SMS', from, body: 'HELP', source: 'sms' });
    return res.type('text/xml').send(msg.toString());
  }
  if (upper === 'START') {
    msg.message('Welcome back to Sophia Voice updates. Reply STOP to opt out anytime.');
    await logLead({ channel: 'SMS', from, body: 'START', source: 'sms' });
    return res.type('text/xml').send(msg.toString());
  }

  // Normal flow
  await logLead({ channel: 'SMS', from, body, source: 'sms' });
  msg.message("Thanks! I'm Sophia. I’ve noted your message and will follow up.");
  res.type('text/xml').send(msg.toString());
});

// ---------- Voice webhook ----------
app.post('/voice', async (req, res) => {
  const { twiml } = twilioLib;
  const from = req.body.From || 'Unknown';
  await logLead({ channel: 'VOICE', from, body: 'Call started', source: 'voice' });

  const vr = new twiml.VoiceResponse();
  // Simple greeting then voicemail
  vr.say({ voice: 'alice' }, 'Hello! This is Sophia, your AI receptionist. Please leave a message after the tone. Press any key to finish.');
  vr.record({
    maxLength: 120,
    finishOnKey: 'any',
    playBeep: true,
    recordingStatusCallback: '/voicemail',
    recordingStatusCallbackMethod: 'POST',
  });
  vr.hangup();

  res.type('text/xml').send(vr.toString());
});

// GET /voice just for browser sanity check (Twilio uses POST)
app.get('/voice', (_, res) => {
  res.status(200).send('Voice endpoint is up. Twilio will POST here.');
});

// Voicemail recording callback from Twilio
app.post('/voicemail', async (req, res) => {
  const from = req.body.From || 'Unknown';
  const url = req.body.RecordingUrl || '';
  await logLead({ channel: 'VOICE', from, body: `Voicemail: ${url}`, source: 'voice' });
  await notifyOwner(`New voicemail from ${from}: ${url}`);
  res.type('text/xml').send('<Response/>');
});

// ---------- Landing page web-lead ----------
app.post('/web-lead', async (req, res) => {
  const name = (req.body.name || '').toString().trim();
  const phone = (req.body.phone || '').toString().trim();
  const message = (req.body.message || '').toString().trim();
  const utm = (req.body.utm || '').toString();

  await logLead({
    channel: 'WEB',
    from: phone || 'unknown',
    body: `${name || 'Unknown'} — ${message || ''}`,
    source: 'landing',
    utm,
  });

  // Owner alert (optional; requires env vars)
  await notifyOwner(`NEW WEB LEAD → ${name || 'Unknown'} ${phone ? '(' + phone + ')' : ''} — ${message || ''}`);

  res.json({ ok: true });
});

// Quick test to ping owner alert
app.get('/test-owner-alert', async (_, res) => {
  await notifyOwner('Test alert from Sophia Voice ✅');
  res.json({ ok: true });
});

// ---------- start server (single declaration) ----------
const PORT = Number(process.env.PORT) || 3000;
app.listen(PORT, () => console.log('Sophia Voice listening on', PORT));

