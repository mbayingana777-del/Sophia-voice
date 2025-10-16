// Minimal Express app for Render (CommonJS version)
const express = require("express");
const app = express();

app.use(express.json());
app.use(express.urlencoded({ extended: false }));

// Health/homepage route (fixes "Cannot GET /")
app.get("/", (req, res) => {
  res.status(200).send("Sophia Voice is live ✅");
});

// Twilio webhooks (optional stubs; safe to keep)
app.post("/sms", (req, res) => {
  return res.type("text/xml").send(`<Response><Message>Hi, this is Sophia AI. Thanks for messaging!</Message></Response>`);
});
app.post("/voice", (req, res) => {
  return res.type("text/xml").send(`<Response><Say>Hello! This is Sophia Voice AI. How can I help you?</Say></Response>`);
});

// Listen on Render's port
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log("Server running on port", PORT));
