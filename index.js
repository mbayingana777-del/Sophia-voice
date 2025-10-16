require("dotenv").config();
const express = require("express");
const fs = require("fs");
const path = require("path");
const twilio = require("twilio");
const OpenAI = require("openai");

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

// Homepage
app.get("/", (req, res) => res.status(200).send("Sophia Voice is live ✅"));

// CSV logging
const LEADS_CSV = path.join(__dirname, "leads.csv");
if (!fs.existsSync(LEADS_CSV)) fs.writeFileSync(LEADS_CSV, "timestamp,channel,from,body\n");

// Twilio + OpenAI setup
const { MessagingResponse, VoiceResponse } = twilio.twiml;
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// Send data to Google Sheets
const postSheets = async (payload) => {
  const url = process.env.SHEETS_WEBAPP_URL;
  if (!url) return;
  try {
    await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
  } catch {}
};

// SMS Route
app.post("/sms", async (req, res) => {
  const from = req.body.From || "Unknown";
  const body = req.body.Body || "";

  fs.appendFileSync(LEADS_CSV, `${new Date().toISOString()},SMS,${from},"${body.replace(/"/g,"'")}"\n`);
  postSheets({ timestamp: new Date().toISOString(), channel: "SMS", from, body });

  let reply = "Thanks for your message!";
  try {
    const completion = await openai.responses.create({
      model: "gpt-4o-mini",
      input: `You are Sophia, a friendly, professional AI receptionist for a real estate business. Reply briefly and naturally to: "${body}"`,
    });
    reply = completion.output[0].content[0].text || reply;
  } catch (e) {
    console.error("OpenAI error:", e.message);
  }

  const twiml = new MessagingResponse();
  twiml.message(reply);
  res.type("text/xml").send(twiml.toString());
});

// Voice route
app.post("/voice", (req, res) => {
  const from = req.body.From || "Unknown";
  postSheets({ timestamp: new Date().toISOString(), channel: "VOICE", from, body: "Call started" });

  const twiml = new VoiceResponse();
  twiml.say("Hello, this is Sophia Voice AI. How can I help you today?");
  res.type("text/xml").send(twiml.toString());
});

// Status route
app.get("/status", async (req, res) => {
  const status = { server: "✅ Active", openai: "❌ Down", sheets: "❌ Down" };

  try
