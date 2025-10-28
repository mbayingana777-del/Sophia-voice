const fs = require('fs');
const path = require('path');
const express = require('express');
const cors = require('cors');

const app = express();
function readJSON(relPath) {
  return JSON.parse(fs.readFileSync(path.join(__dirname, relPath), 'utf8'));
}
function readText(relPath) {
  return fs.readFileSync(path.join(__dirname, relPath), 'utf8');
}

app.use(cors());
app.use(express.json());

app.get('/status', (req, res) => {
  res.status(200).json({ ok: true, status: 'running', service: 'sophia-voice' });
});

app.get('/', (req, res) => {
  res.status(200).send('Sophia backend live');
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log('Server up on ' + PORT));
// GET /persona?niche=real_estate&pack=hipaa_compliance
app.get('/persona', (req, res) => {
  try {
    const niche = (req.query.niche || '').toLowerCase();
    const packParam = (req.query.pack || '').toLowerCase();
    const packs = packParam ? packParam.split(',').map(s => s.trim()).filter(Boolean) : [];

    // Always include the base + prompts
    const base = readJSON('persona/base.json');
    const prompts = readText('persona/prompts.md');

    const payload = { base, prompts };

    // Try niche override if present (optional; ignore if file not there yet)
    if (niche) {
      try {
        const nicheOverride = readJSON(`persona/niches/${niche}.json`);
        payload.niche = niche;
        payload.override = nicheOverride;
      } catch (_) { /* ignore missing niche */ }
    }

    // Try packs (optional; ignore if missing)
    if (packs.length) {
      payload.packs = {};
      for (const p of packs) {
        try {
          payload.packs[p] = readJSON(`persona/packs/${p}.json`);
        } catch (_) { /* ignore missing pack */ }
      }
    }

    res.json(payload);
  } catch (err) {
    console.error('Persona route error:', err);
    res.status(500).json({ error: 'Failed to load persona' });
  }
});
