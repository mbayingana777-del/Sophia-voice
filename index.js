import express from "express";
const app = express();

app.use(express.json());

app.get("/", (req, res) => {
  res.send("Sophia Voice is live ✅");
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log("Server on", PORT));
// ===============================
// Sophia - Voice + SMS receptionist
// ===============================

require('dotenv').config();
const express = require('express');
const { twiml: { VoiceResponse } } = require('twilio');
const OpenAI = require('openai');
const fs = require('fs');
const path = require('path');

const app = express();

// Twilio sends x-www-form-urlencoded
app.use(express.urlencoded({ extended: false }));

// ---------- Lead logging (CSV) ----------
const LEADS_CSV = path.join(__dirname, 'leads.csv');
if (!fs.existsSync(LEADS_CSV)) {
  fs.writeFileSync(LEADS_CSV, 'timestamp,channel,from,body\n');
}
function logCsv(channel, from, body) {
  const row = `"${new Date().toISOString()}","${channel}","${from || ''}","${(body || '').replace(/"/g, '""')}"\n`;
  fs.appendFile(LEADS_CSV, row, () => {});
}

// ---------- Simple booking state ----------
const convo = new Map(); // key = phone, value = { step, data }

// ---------- VOICE ----------
app.post('/voice', (req, res) => {
  const vr = new VoiceResponse();

  // Greeting (you can switch to Polly voices if you want)
  vr.say({ voice: 'alice', language: 'en-US' },
    "Hi, this is Sophia, your AI receptionist. Thanks for calling. " +
    "We'll text you right after this call to help you book a time."
  );

  // Log the call
  const callFrom = (req.body && req.body.From) || 'unknown';
  logCsv('voice', callFrom, 'called');

  vr.pause({ length: 1 });
  vr.say({ voice: 'alice', language: 'en-US' }, "Have a great day. Goodbye.");
  vr.hangup();

  res.type('text/xml').send(vr.toString());
});

// ---------- SMS (AI + booking flow) ----------
app.post('/sms', async (req, res) => {
  try {
    const from = req.body.From;
    const text = (req.body.Body || '').trim();
    console.log('📨 Incoming SMS:', { from, text });

    // Log to CSV
    logCsv('sms', from, text);

    // --- Booking flow (very simple state machine) ---
    const state = convo.get(from) || { step: null, data: {} };
    const lower = text.toLowerCase();

    // Start booking if user asks
    if (!state.step && (lower.includes('book') || lower.includes('appointment'))) {
      state.step = 'ask-time';
      convo.set(from, state);
      return res.type('text/xml').send(
        `<Response><Message>Great! What day/time works for you this week?</Message></Response>`
      );
    }

    if (state.step === 'ask-time') {
      state.data.time = text;
      state.step = 'ask-name';
      convo.set(from, state);
      return res.type('text/xml').send(
        `<Response><Message>Got it. What name should I put on the booking?</Message></Response>`
      );
    }

    if (state.step === 'ask-name') {
      state.data.name = text;
      state.step = 'done';
      convo.set(from, state);

      // Save a booking line
      logCsv('booking', from, `${state.data.name}, ${state.data.time}`);

      return res.type('text/xml').send(
        `<Response><Message>Thanks ${state.data.name}! I penciled in ${state.data.time}. We'll confirm shortly.</Message></Response>`
      );
    }

    // --- AI fallback reply (OpenAI) ---
    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

    const sys = `You are Sophia, a warm, concise AI receptionist.
- Reply in 1–2 sentences.
- If relevant, offer to book an appointment.
- If asked for pricing, say we’ll share on the confirmation call.
- No links for now.`;

    const completion = await client.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: sys },
        { role: "user", content: text }
      ],
      temperature: 0.6,
      max_tokens: 120
    });

    const reply = completion.choices?.[0]?.message?.content
      || "Thanks for reaching out! How can I help today?";

    res.type('text/xml').send(`<Response><Message>${reply}</Message></Response>`);
  } catch (e) {
    console.error('SMS handler error:', e);
    res.type('text/xml').send(
      `<Response><Message>Thanks for texting! I’ll get back to you shortly.</Message></Response>`
    );
  }
});

// ---------- MISSED CALL -> AUTO TEXT ----------
app.post('/missed', async (req, res) => {
  // Twilio posts CallStatus, From, To to this webhook
  const { CallStatus, From, To } = req.body || {};
  console.log('☎️ Call Status:', CallStatus, 'From:', From, 'To:', To);

  // Log call status
  logCsv('voice', From, `status:${CallStatus || 'unknown'}`);

  const missed = ['no-answer', 'busy', 'failed', 'canceled']
    .includes((CallStatus || '').toLowerCase());

  if (missed) {
    try {
      // Only attempt SMS if creds exist
      if (process.env.TWILIO_SID && process.env.TWILIO_AUTH) {
        const twilio = require('twilio')(process.env.TWILIO_SID, process.env.TWILIO_AUTH);
        await twilio.messages.create({
          to: From,
          from: To,
          body: "Hi, this is Sophia. Sorry we missed you — can I book a time for you this week?"
        });
        console.log('📤 Missed-call SMS queued');
      } else {
        console.log('ℹ️ TWILIO_SID/AUTH not set; skipping auto-SMS.');
      }
    } catch (e) {
      console.error('Missed-call SMS error:', e.message);
    }
  }

  res.type('text/xml').send('<Response/>');
});

// ---------- SERVER START ----------
const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`Sophia voice server on :${port}`));

