// Minimal Sophia backend (CommonJS)

const express = require("express");
const cors = require("cors");

const app = express();
app.use(cors({ origin: ["https://mbayingana777-del.github.io"] }));
app.use(express.json());

app.get("/status", (_req, res) => {
  res.json({ ok: true, status: "running", service: "sophia-voice" });
});

app.get("/", (_req, res) => {
  res.send("Sophia backend live");
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log("Sophia backend running on port " + PORT);
});

