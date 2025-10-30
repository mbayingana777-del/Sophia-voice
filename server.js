// Sophia Voice Backend — CommonJS, safe & complete

const fs = require("fs");
const path = require("path");
const express = require("express");
const cors = require("cors");

const app = express();

// --- CORS: allow your landing page origin ---
app.use(cors({ origin: ["https://mbayingana777-del.github.io"] }));
app.use(express.json());

// --- Helpers with safe fallbacks ---
function safeReadText(relPath, fallback = "") {
  try {
    return fs.readFileSync(path.join(__dirname, relPath), "utf8");
  } catch {
    return fallback;
  }
}
function safeReadJSON(relPath, fallback = {}) {
  try {
    return JSON.parse(safeReadText(relPath, JSON.stringify(fallback)));
  } catch {
    return fallback;
  }
}

// ---------------------------------------------------------
// Health
// ---------------------------------------------------------
app.get("/status", (_req, res) => {
  res.json({ ok: true, status: "running", service: "sophia-voice" });
});
app.get("/", (_req, res) => res.send("Sophia backend live"));

// ---------------------------------------------------------
// Persona (works on /persona and /api/persona)
// ---------------------------------------------------------
function personaHandler(req, res) {
  try {
    const niche = (req.query.niche || "").toLowerCase();
    const packParam = (req.query.pack || "").toLowerCase();
    const packs = packParam
      ? packParam.split(",").map((s) => s.trim()).filter(Boolean)
      : [];

    // Base + prompts (fallbacks ensure no crash if files missing)
    const base = safeReadJSON("persona/base.json", {
      business_name: "Sophia Voice",
      brand: { tagline: "Your 24/7 AI receptionist that books, texts, and calls back instantly." },
      booking_link: "https://calendly.com/mbayingana777/call-with-sophia",
      consent: "By submitting you consent to SMS/voice from Sophia. Reply STOP to opt out."
    });
    const prompts = safeReadText("persona/prompts.md", "You are Sophia, a helpful AI receptionist.");

    const payload = { base, prompts };

    // Optional niche override
    if (niche) {
      const nicheOverride = safeReadJSON(`persona/niches/${niche}.json`, null);
      if (nicheOverride) {
        payload.niche = niche;
        payload.override = nicheOverride;
      }
    }

    // Optional packs
    if (packs.length) {
      payload.packs = {};
      for (const p of packs) {
        const packCfg = safeReadJSON(`persona/packs/${p}.json`, null);
        if (packCfg) payload.packs[p] = packCfg;
      }
    }

    res.json(payload);
  } catch (err) {
    console.error("Persona route error:", err);
    res.status(500).json({ error: "Failed to load persona" });
  }
}
app.get("/persona", personaHandler);
app.get("/api/persona", personaHandler);

// ---------------------------------------------------------
// Chat (temporary echo for Phase 2.2)
// ---------------------------------------------------------
app.post("/api/chat", (req, res) => {
  const { message, session_id } = req.body || {};
  if (!message) return res.status(400).json({ error: "message required" });
  const reply = `You said: ${message}`;
  res.json({ reply, session_id: session_id || "sess-" + Date.now() });
});

// ---------------------------------------------------------
// Start server
// ---------------------------------------------------------
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log("Sophia backend running on port " + PORT);
});
