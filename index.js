// ===============================
// Sophia Voice + SMS Receptionist
// ===============================

// --- Import dependencies ---
import express from "express";
import dotenv from "dotenv";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import twilio from "twilio";
import OpenAI from "openai";

// --- Setup ---
dotenv.config();
const app = express();
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// --- Middleware ---
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

// --- Health check route (prevents “Cannot GET /”) ---
app.get("/", (req, res) => {
  res.send("Sophia Voice is live ✅");
});

// --- CSV Logging Setup ---
const LEADS_CSV = path.join(__dirname, "leads.csv");
if (!fs.existsSync(LEADS_CSV)) {
  fs.writeFileSync(LEADS_CSV, "timestamp,channel,from,body\n");
}

// --- Twilio Setup ---
const { TWILIO_SID, TWILIO_AUTH } = process.env;
const client = twilio(TWILIO_SID, TWILIO_AUTH);
const { VoiceResponse } = twilio.twiml;

// --- OpenAI Setup ---
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// --- SMS Route ---
app.post("/sms", async (req, res) => {
  const from = req.body.From || "Unknown";
  const body = req.body.Body || "";

  // Log to CSV
  fs.appendFileSync(
    LEADS_CSV,
    `${new Date().toISOString()},SMS,${from},"
