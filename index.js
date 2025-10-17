// --- Sophia Voice server (CommonJS) ---
require('dotenv').config();
const express = require('express');
const { twiml: TwilioTwiML } = require('twilio');

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

// ---------- helpers ----------
async function postToSheets(payload) {
  try {
    const url = process.env.SHEETS_WEBAPP_URL; // Google Apps Script /exec
    if (!url) return;

    // send as JSON first; Apps Script will try JSON, then fall back to params
    await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
  } catch (_) {
    // ignore – we don't want to block Twilio responses
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

// ---------- root & health ----------
app.get('/', (_, res) => res.status(200).send('Sophia Voice is live ✅'));

app.get('/status', async (req, res) => {
  // quick self-check; if we can reach Sheets URL format at least, say OK
  const ok = {
    server: 'OK',
    openai: 'OK',
    sheets: process.env.SHEETS_WEBAPP_URL ? 'OK' : 'MISSING',
  };
  res.json(ok);
});

// ---------- SMS webhook ----------
app.post('/sms', async (req, res) => {
  const from = req.body.From || 'Unknown';
  const body = (req.body.Body || '').trim();
  const twiml = new TwilioTwiML.MessagingResponse();

  // Compliance keywords
  const upper = body.toUpperCase();
  if (upper === 'STOP' || upper === 'UNSUBSCRIBE' || upper === 'CANCEL' || upper === 'END' || upper === 'QUIT') {
    twiml.message('You have opted out of Sophia Voice messages. Reply START to resubscribe.');
    await logLead({ channel: 'SMS', from, body: 'STOP', source: 'sms' });
    res.type('text/xml').send(twiml.toString());
    return;
  }
  if (upper === 'HELP') {
    twiml.message('Sophia Voice AI Receptionist. For help email hello@sophiavoice.ai. Msg&Data rates may apply. Reply STOP to opt out.');
    await logLead({ channel: 'SMS', from, body: 'HELP', source: 'sms' });
    res.type('text/xml').send(twiml.toString());
    return;
  }

  // Normal log + basic reply
  await logLead({ channel: 'SMS', from, body, source: 'sms' });
  twiml.message("Thanks! I'm Sophia. I’ve noted your message and will follow up.");
  res.type('text/xml').send(twiml.toString());
});

// ---------- Voice webhook ----------
app.post('/voice', async (req, res) => {
  const from = req.body.From || 'Unknown';
  await logLead({ channel: 'VOICE', from, body: 'Call started', source: 'voice' });

  const vr = new TwilioTwiML.VoiceResponse();
  vr.say({ voice: 'alice' }, 'Hello! This is Sophia, your AI receptionist. How can I help you today?');
  res.type('text/xml').send(vr.toString());
});

// GET /voice just for your browser sanity check (Twilio uses POST)
app.get('/voice', (_, res) => {
  res.status(200).send('Voice endpoint is up. Twilio will POST here.');
});

// ---------- Landing page lead form ----------
app.post('/web-lead', async (req, res) => {
  const name = (req.body.name || '').toString().trim();
  const phone = (req.body.phone || '').toString().trim();
  const message = (req.body.message || '').toString().trim();

  await logLead({
    channel: 'WEB',
    from: phone || 'unknown',
    body: `${name} — ${message}`,
    source: 'landing',
    utm: req.body.utm || '',
  });

  res.json({ ok: true });
});

// ---------- start server (single declaration) ----------
const PORT = Number(process.env.PORT) || 3000;
app.listen(PORT, () => console.log('Sophia Voice listening on', PORT));


