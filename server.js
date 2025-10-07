import express from "express";
import multer from "multer";
import fs from "fs";
import QRCode from "qrcode";

const app = express();
const PORT = process.env.PORT || 3000;

// Serve static files
app.use(express.static("public"));
app.use("/uploads", express.static("uploads"));

// Set up file upload storage
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const folder = file.fieldname === "image" ? "uploads/images" : "uploads/audio";
    fs.mkdirSync(folder, { recursive: true });
    cb(null, folder);
  },
  filename: (req, file, cb) => {
    cb(null, Date.now() + "-" + file.originalname);
  }
});
const upload = multer({ storage });

// JSON database path
const dbPath = "data/pages.json";
fs.mkdirSync("data", { recursive: true });
if (!fs.existsSync(dbPath)) fs.writeFileSync(dbPath, "[]", "utf8");

// ---------- CREATE GIFT PAGE ----------
app.post("/api/create", upload.fields([{ name: "image" }, { name: "audio" }]), async (req, res) => {
  try {
    const pages = JSON.parse(fs.readFileSync(dbPath, "utf8"));
    const id = Date.now().toString();

    const title = req.body.title || "";
    const text = req.body.text || "";
    const image = req.files.image ? `/uploads/images/${req.files.image[0].filename}` : null;
    const audio = req.files.audio ? `/uploads/audio/${req.files.audio[0].filename}` : null;

    const pageData = { id, title, text, image, audio, createdAt: new Date() };
    pages.push(pageData);
    fs.writeFileSync(dbPath, JSON.stringify(pages, null, 2));

    const url = `${req.protocol}://${req.get("host")}/gift/${id}`;
    const qrCode = await QRCode.toDataURL(url);

    res.json({ success: true, url, qrCode });
  } catch (err) {
    res.json({ success: false, error: err.message });
  }
});

// ---------- LIST ALL PAGES ----------
app.get("/api/pages", (req, res) => {
  const pages = JSON.parse(fs.readFileSync(dbPath, "utf8"));
  res.json({
    success: true,
    pages: pages.map(p => ({
      id: p.id,
      title: p.title,
      text: p.text,
      hasImage: !!p.image,
      hasAudio: !!p.audio,
      createdAt: p.createdAt
    }))
  });
});

// ---------- GET SINGLE PAGE ----------
app.get("/api/gift/:id", (req, res) => {
  const pages = JSON.parse(fs.readFileSync(dbPath, "utf8"));
  const page = pages.find(p => p.id === req.params.id);
  if (!page) return res.json({ success: false });
  res.json({ success: true, data: page });
});

// Start server
app.listen(PORT, () => console.log(`✅ Server running → http://localhost:${PORT}`));
