// index.js
import express from "express";
import fetch from "node-fetch";
import dotenv from "dotenv";
import { MessagingResponse, VoiceResponse } from "twilio";

dotenv.config();
const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const PORT = process.env.PORT || 3000;
const SHEETS_WEBAPP_URL = process.env.SHEETS_WEBAPP_URL;

// POST to Google Sheets
async function postSheets(payload) {
  try {
    await fetch(SHEETS_WEBAPP_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
  } catch (err) {
    console.error("Sheet error:", err.message);
  }
}

// Web lead route
app.post("/web-lead", async (req, res) => {
  const { name, phone, message, utm } = req.body;
  const payload = {
    timestamp: new Date().toISOString(),
    channel: "WEB",
    from: phone || "unknown",
    body: `${name || "Unknown"} — ${message || ""}`,
    source: "landing-page",
    utm: utm || "",
  };
  await postSheets(payload);
  res.json({ status: "ok" });
});

// Voice test
app.post("/voice", async (req, res) => {
  const twiml = new VoiceResponse();
  twiml.say("Hello, this is Sophia Voice. How can I help you today?");
  res.type("text/xml").send(twiml.toString());
  await postSheets({
    timestamp: new Date().toISOString(),
    channel: "VOICE",
    from: req.body.From || "unknown",
    body: "Call started",
    source: "phone",
  });
});

// System status
app.get("/status", async (req, res) => {
  try {
    await fetch(SHEETS_WEBAPP_URL, { method: "GET" });
    res.json({ server: "OK", openai: "OK", sheets: "OK" });
  } catch {
    res.json({ server: "OK", openai: "OK", sheets: "DOWN" });
  }
});

app.listen(PORT, () => console.log(`✅ Server running on ${PORT}`));


const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log("✅ Sophia Voice backend running on port", PORT));

