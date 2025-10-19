require('dotenv').config();
const express = require('express');
const { twiml: TwilioTwiML } = require('twilio');

const app = express();

// --- ✅ CORS: allow landing site to call backend
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*'); // or 'https://sophia-landing.onrender.com'
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.sendStatus(200);
  next();
});

app.use(express.json());
app.use(express.urlencoded({ extended: false }));

// ---------- Start server ----------
const PORT = Number(process.env.PORT) || 3000;
app.listen(PORT, () => console.log('Sophia Voice listening on', PORT));

