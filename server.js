const express = require("express");
const multer = require("multer");
const app = express();
const upload = multer({ dest: "uploads/" });

app.use(express.static("public"));

// Selfie upload handler
app.post("/submit", upload.single("selfie"), (req, res) => {
  console.log("Selfie uploaded:", req.file);
  res.redirect("https://your-official-website.com"); // <- replace with your site
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));