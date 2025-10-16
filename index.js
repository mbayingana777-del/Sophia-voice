require("dotenv").config();
const express = require("express");
const fs = require("fs");
const path = require("path");
const twilio = require("twilio");
const OpenAI = require("openai");

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

app.get("/", (req, res) => res.status(200).send("Sophia Voice is live"));

const LEADS_CSV = path.join(__dirname, "leads.csv");
if (!fs.existsSync(LEADS_CSV)) fs.writeFileSync(LEADS_CSV, "timestamp,channel,from,body\n");

const client = twilio(process.env.TWILIO_SID, process.env.TWILIO_AUTH);
const { MessagingResponse, VoiceResponse } = twilio.twiml;
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const postSheets = async (payload) => {
  const url = process.env.SHEETS_WEBAPP_URL;
  if (!url) return false;
  try {
    const r = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    await r.text();
    return r.ok;
  } catch {
    return false;
  }
};

const logError = (body) =>
  postSheets({ timestamp: new Date().toISOString(), channel: "ERROR", from: "system", body });

app.get("/status", async (req, res) => {
  const status = { server: "OK", openai: "DOWN", sheets: "DOWN" };
  try { await openai.models.list(); status.openai = "OK"; } catch {}
  try { const r = await fetch(process.env.SHEETS_WEBAPP_URL, { method: "GET" }); if (r.ok) status.sheets = "OK"; } catch {}
  res.json(status);
});

app.get("/test-owner-alert", async (req, res) => {
  try {
    if (!process.env.OWNER_PHONE || !process.env.TWILIO_NUMBER) return res.status(400).send("missing env");
    const msg = await client.messages.create({
      from: process.env.TWILIO_NUMBER,
      to: process.env.OWNER_PHONE,
      body: "Test alert from Sophia Voice",
    });
    res.send(`ok ${msg.sid}`);
  } catch (e) {
    await logError(`Owner alert test failed: ${e.message || e}`);
    res.status(500).send(String(e.message || e));
  }
});

app.post("/sms", async (req, res) => {
  const from = req.body.From || "Unknown";
  const body = req.body.Body || "";
  fs.appendFileSync(LEADS_CSV, `${new Date().toISOString()},SMS,${from},"${body.replace(/"/g,"'")}"\n`);
  postSheets({ timestamp: new Date().toISOString(), channel: "SMS", from, body });

  if (process.env.OWNER_PHONE && process.env.TWILIO_NUMBER) {
    try {
      await client.messages.create({
        from: process.env.TWILIO_NUMBER,
        to: process.env.OWNER_PHONE,
        body: `New SMS from ${from}: ${body}`,
      });
    } catch (e) {
      logError(`Owner alert SMS failed: ${e.message || e}`);
    }
  }

  let reply = "Thanks for your message.";
  try {
    const completion = await openai.responses.create({
      model: "gpt-4o-mini",
      input: `You are Sophia, a friendly, professional AI receptionist. Reply briefly and naturally to: "${body}"`,
    });
    reply = completion.output?.[0]?.content?.[0]?.text?.trim() || reply;
  } catch (e) {
    logError(`OpenAI error: ${e.message || e}`);
  }

  const twiml = new MessagingResponse();
  twiml.message(reply);
  res.type("text/xml").send(twiml.toString());
});

app.post("/voice", async (req, res) => {
  const from = req.body.From || "Unknown";
  postSheets({ timestamp: new Date().toISOString(), channel: "VOICE", from, body: "Call started" });

  if (process.env.OWNER_PHONE && process.env.TWILIO_NUMBER) {
    try {
      await client.messages.create({
        from: process.env.TWILIO_NUMBER,
        to: process.env.OWNER_PHONE,
        body: `Incoming call from ${from}`,
      });
    } catch (e) {
      logError(`Owner alert for call failed: ${e.message || e}`);
    }
  }

  const twiml = new VoiceResponse();
  twiml.say("Hello, this is Sophia Voice AI. How can I help you today?");
  res.type("text/xml").send(twiml.toString());
});

if (process.env.PUBLIC_URL) {
  setInterval(() => {
    fetch(process.env.PUBLIC_URL).catch(() => {});
  }, 5 * 60 * 1000);
}

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log("Server running on port", PORT));
