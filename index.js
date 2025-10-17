// index.js — Sophia Voice backend
require("dotenv").config();
const express = require("express");
const twilio = require("twilio");

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

// CORS — allows your landing page to talk to this backend
app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.sendStatus(200);
  next();
});

// ---- Helper: send data to Google Sheets
async function postSheets(payload) {
  if (!process.env.SHEETS_WEBAPP_URL) return;
  try {
    await fetch(process.env.SHEETS_WEBAPP_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
  } catch (e) {
    console.error("Sheets post error:", e.message);
  }
}

// ---- Health route
app.get("/", (req, res) => res.status(200).send("Sophia Voice is live ✅"));

// ---- Status route
app.get("/status", async (req, res) => {
  let server = "OK";
  let openai = process.env.OPENAI_API_KEY ? "OK" : "DOWN";
  let sheets = "DOWN";

  try {
    if (process.env.SHEETS_WEBAPP_URL) {
      await postSheets({
        timestamp: new Date().toISOString(),
        channel: "STATUS",
        from: "server",
        body: "ping",
      });
      sheets = "OK";
    }
  } catch {
    sheets = "DOWN";
  }

  res.json({ server, openai, sheets });
});

// ---- Web Lead route (used by your landing form)
app.post("/web-lead", async (req, res) => {
  try {
    const { name = "", phone = "", note = "" } = req.body || {};
    if (!name && !note) return res.json({ ok: false, error: "Missing fields" });

    const payload = {
      timestamp: new Date().toISOString(),
      channel: "WEB",
      from: phone || "web",
      body: `${name || "Unknown"} — ${note || ""}`,
    };

    await postSheets(payload);

    // Optional: notify owner via SMS (works after Twilio unlock)
    try {
      const { TWILIO_SID, TWILIO_AUTH, TWILIO_NUMBER, OWNER_PHONE } = process.env;
      if (TWILIO_SID && TWILIO_AUTH && TWILIO_NUMBER && OWNER_PHONE) {
        const client = twilio(TWILIO_SID, TWILIO_AUTH);
        await client.messages.create({
          to: OWNER_PHONE,
          from: TWILIO_NUMBER,
          body: `NEW WEB LEAD → ${name} ${phone ? "(" + phone + ")" : ""} — ${note}`,
        });
      }
    } catch (e) {
      console.error("Owner SMS alert failed:", e.message);
    }

    res.json({ ok: true });
  } catch (e) {
    console.error("WEB-LEAD ERROR:", e);
    res.json({ ok: false, error: "Server error" });
  }
});

// ---- SMS route (for Twilio incoming)
app.post("/sms", async (req, res) => {
  const { MessagingResponse } = twilio.twiml;
  const twiml = new MessagingResponse();
  const from = req.body.From || "Unknown";
  const body = req.body.Body || "";

  await postSheets({
    timestamp: new Date().toISOString(),
    channel: "SMS",
    from,
    body,
  });

  twiml.message("Thanks for reaching Sophia! We’ll follow up shortly.");
  res.type("text/xml").send(twiml.toString());
});

// ---- Voice route (for Twilio incoming calls)
app.post("/voice", async (req, res) => {
  const { VoiceResponse } = twilio.twiml;
  const twiml = new VoiceResponse();

  await postSheets({
    timestamp: new Date().toISOString(),
    channel: "VOICE",
    from: req.body.From || "Unknown",
    body: "Call started",
  });

  twiml.say("Hello! This is Sophia Voice AI. How can I help you today?");
  res.type("text/xml").send(twiml.toString());
});

// ---- Keep-alive ping to prevent sleep
if (process.env.PUBLIC_URL) {
  setInterval(() => {
    fetch(process.env.PUBLIC_URL).catch(() => {});
  }, 5 * 60 * 1000); // every 5 min
}

// ---- Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log("✅ Sophia Voice backend running on port", PORT));

