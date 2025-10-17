// ===============================
// Sophia Voice server (CommonJS)
// ===============================
require('dotenv').config();
const express = require('express');
const { twiml: TwilioTwiML } = require('twilio');
const twilio = require('twilio');

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

// ---------- Twilio REST client (for owner alerts) ----------
let client = null;
if (process.env.TWILIO_SID && process.env.TWILIO_AUTH) {
  client = twilio(process.env.TWILIO_SID, process.env.TWILIO_AUTH);
}

// ---------- Helpers ----------
async function postToSheets(payload) {
  const url = process.env.SHEETS_WEBAPP_URL; // your Apps Script /exec URL
  if (!url) return;

  try {
    // Try JSON first
    await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
  } catch {
    // Fallback: form-encoded (Apps Script can read this too)
    const form = new URLSearchParams();
    for (const [k, v] of Object.entries(payload)) form.append(k, v ?? '');
    try {
      await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: form.toString(),
      });
    } catch {
      // swallow — we never block Twilio because Sheets is down
    }
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

// ---------- Root & health ----------
app.get('/', (_req, res) => res.status(200).send('Sophia Voice is live ✅'));
app.get('/status', (_req, res) => {
  res.json({
    server: 'OK',
    openai: process.env.OPENAI_API_KEY ? 'OK' : 'MISSING',
    sheets: process.env.SHEETS_WEBAPP_URL ? 'OK' : 'MISSING',
  });
});

// ---------- SMS webhook (POST from Twilio) ----------
app.post('/sms', async (req, res) => {
  const from = req.body.From || 'Unknown';
  const body = (req.body.Body || '').trim();
  const msg = new TwilioTwiML.MessagingResponse();

  const upper = body.toUpperCase();
  if (['STOP', 'UNSUBSCRIBE', 'CANCEL', 'END', 'QUIT'].includes(upper)) {
    msg.message('You have opted out of Sophia Voice messages. Reply START to resubscribe.');
    await logLead({ channel: 'SMS', from, body: 'STOP', source: 'sms' });
    return res.type('text/xml').send(msg.toString());
  }
  if (upper === 'HELP') {
    msg.message('Sophia Voice AI Receptionist. For help: hello@sophiavoice.ai. Msg&Data rates may apply. Reply STOP to opt out.');
    await logLead({ channel: 'SMS', from, body: 'HELP', source: 'sms' });
    return res.type('text/xml').send(msg.toString());
  }

  await logLead({ channel: 'SMS', from, body, source: 'sms' });
  msg.message("Thanks! I'm Sophia. I’ve noted your message and will follow up.");
  res.type('text/xml').send(msg.toString());
});

// ---------- Voice webhook (POST from Twilio) ----------
app.post('/voice', async (req, res) => {
  const from = req.body.From || 'Unknown';
  await logLead({ channel: 'VOICE', from, body: 'Call started', source: 'voice' });

  const vr = new TwilioTwiML.VoiceResponse();
  vr.say({ voice: 'alice' }, 'Hello! This is Sophia, your A I receptionist. How can I help you today?');
  res.type('text/xml').send(vr.toString());
});

// GET /voice for your browser sanity check (Twilio uses POST)
app.get('/voice', (_req, res) => {
  res.status(200).send('Voice endpoint is up. Twilio will POST here.');
});

// ---------- Landing page lead intake ----------
app.post('/web-lead', async (req, res) => {
  const name = (req.body.name || '').toString().trim();
  const phone = (req.body.phone || '').toString().trim();
  const message = (req.body.message || '').toString().trim();

  await logLead({
    channel: 'WEB',
    from: phone || 'unknown',
    body: `${name} — ${message}`,
    source: 'landing',
    utm: (req.body.utm || '').toString(),
  });

  res.json({ ok: true });
});

// ---------- Owner alert test ----------
app.get('/test-owner-alert', async (_req, res) => {
  try {
    if (!client) return res.status(400).send('Twilio client not configured');
    if (!process.env.OWNER_PHONE || !process.env.TWILIO_FROM) {
      return res.status(400).send('Set OWNER_PHONE and TWILIO_FROM first');
    }
    await client.messages.create({
      to: process.env.OWNER_PHONE,
      from: process.env.TWILIO_FROM,
      body: 'Test alert from Sophia Voice ✅',
    });
    res.send('Alert sent ✅');
  } catch (e) {
    res.status(500).send('Failed to send alert: ' + e.message);
  }
});

// ---------- Browser test pages (no terminal needed) ----------
app.get('/sms-test', (_req, res) => {
  res.type('html').send(`
    <h2>SMS POST test (simulates Twilio)</h2>
    <form method="post" action="/sms" style="display:grid;gap:8px;max-width:360px;">
      <label>From (E.164, e.g. +17244195881)
        <input name="From" value="+17244195881" />
      </label>
      <label>Body
        <input name="Body" value="Hello from browser test" />
      </label>
      <button type="submit">Send POST to /sms</button>
    </form>
    <p>This submits a <strong>form-encoded POST</strong>, same as Twilio.</p>
  `);
});

app.get('/voice-test', (_req, res) => {
  res.type('html').send(`
    <h2>Voice POST test (simulates Twilio)</h2>
    <form method="post" action="/voice" style="display:grid;gap:8px;max-width:360px;">
      <label>From (E.164)
        <input name="From" value="+17244195881" />
      </label>
      <button type="submit">Send POST to /voice</button>
    </form>
  `);
});

// ---------- Start server ----------
const PORT = Number(process.env.PORT) || 3000;
app.listen(PORT, () => console.log('Sophia Voice listening on', PORT));
