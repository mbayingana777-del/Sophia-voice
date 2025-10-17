// index.js
require("dotenv").config();
const express = require("express");
const twilio = require("twilio");

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

// CORS so the static site can POST here
app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.sendStatus(200);
  next();
});

// ---- helpers
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

function okJSON(res, obj) {
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(obj));
}

// ---- routes

// health
app.get("/", (req, res) => res.status(200).send("Sophia Voice is live ✅"));

// status
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
  okJSON(res, { server, openai, sheets });
});

// web lead from landing page
app.post("/web-lead", async (req, res) => {
  try {
    const { name = "", phone = "", note = "" } = req.body || {};
    if (!name && !note) return okJSON(res, { ok: false, error: "Missing fields" });

    const payload = {
      timestamp: new Date().toISOString(),
      channel: "WEB",
      from: phone || "web",
      body: `${name || "Unknown"} — ${note || ""}`,
    };

    await postSheets(payload);

    // optional owner SMS (works fully after Twilio upgrade)
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

    okJSON(res, { ok: true });
  } catch (e) {
    console.error("WEB-LEAD ERROR:", e);
    okJSON(res, { ok: false, error: "Server error" });
  }
});

// sms webhook (basic)
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

// voice webhook (basic)
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

// keep-alive ping (optional)
if (process.env.PUBLIC_URL) {
  setInterval(() => {
    fetch(process.env.PUBLIC_URL).catch(() => {});
  }, 5 * 60 * 1000);
}

// start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log("Server running on port", PORT));
