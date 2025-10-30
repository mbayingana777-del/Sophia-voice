// Sophia Voice Backend — full version (CommonJS)

const fs = require("fs");
const path = require("path");
const express = require("express");
const cors = require("cors");

const app = express();

// Allow requests from your landing page
app.use(cors({ origin: ["https://mbayingana777-del.github.io"] }));
app.use(express.json());

// Utility functions
function readJSON(relPath) {
  return JSON.parse(fs.readFileSync(path.join(__dirname, relPath), "utf8"));
}
function readText(relPath) {
  return fs.readFileSync(path.join(__dirname, relPath), "utf8");
}

// ---------------------------------------------------------
// ✅ HEALTH ROUTES
// ---------------------------------------------------------
app.get("/status", (req, res) => {
  res
    .status(200)
    .json({ ok: true, status: "running", service: "sophia-voice" });
});

app.get("/", (req, res) => {
  res.status(200).send("Sophia backend live");
});

// ---------------------------------------------------------
// ✅ PERSONA ROUTES (supports /persona and /api/persona)
// ---------------------------------------------------------
function personaHandler(req, res) {
  try {
    const n

