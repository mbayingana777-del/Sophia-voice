require("dotenv").config();
const express = require("express");
const fs = require("fs");
const path = require("path");
const twilio = require("twilio");
const OpenAI = require("openai");

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

app.get("/", (req, res) => res.status(200).send("Sophia Voice is live ✅"));

const LEADS_CSV = path.join(__dirname, "leads.csv");
if (!fs.existsSync(LEADS_CSV)) fs.writeFileSync(LEADS_CSV, "timestamp,channel,from,body\n");

const { TWILIO_SID, TWILIO_AUTH } = process.env;
const client = twilio(TWILIO_SID, TWILIO_AUTH);
const { MessagingResponse, VoiceResponse } = twilio.twiml;
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const logToSheets = async (payload) => {
  const url = process.env.SHEETS_WEBAPP_URL;
  if (!url) return;
  try {
    const r = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    await r.text();
  } catch {}
};

app.get("/test-sheets", async (req, res) => {
  await logToSheets({ timestamp: new Date().toISOString(), channel: "TEST", from: "manual", body: "hello from /test-sheets" });
  res.send("O
