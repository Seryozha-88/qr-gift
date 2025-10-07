const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const QRCode = require('qrcode');
const { v4: uuidv4 } = require('uuid');

const app = express();
const PORT = 3000;

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static('public'));
app.use('/uploads', express.static('uploads'));

// Create necessary directories
['uploads/images', 'uploads/audio', 'data'].forEach(dir => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
});

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    if (file.mimetype.startsWith('image/')) {
      cb(null, 'uploads/images/');
    } else if (file.mimetype.startsWith('audio/')) {
      cb(null, 'uploads/audio/');
    }
  },
  filename: function (req, file, cb) {
    const uniqueName = uuidv4() + path.extname(file.originalname);
    cb(null, uniqueName);
  }
});

const upload = multer({
  storage: storage,
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/') || file.mimetype.startsWith('audio/')) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type'));
    }
  }
});

// Load or initialize pages data
const dataFile = 'data/pages.json';
let pages = {};
if (fs.existsSync(dataFile)) {
  pages = JSON.parse(fs.readFileSync(dataFile, 'utf8'));
}

function savePages() {
  fs.writeFileSync(dataFile, JSON.stringify(pages, null, 2));
}

// Routes
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

// Create new gift page
app.post('/api/create', upload.fields([
  { name: 'image', maxCount: 1 },
  { name: 'audio', maxCount: 1 }
]), async (req, res) => {
  try {
    const pageId = uuidv4();
    const { text } = req.body;
    
    const pageData = {
      id: pageId,
      text: text || '',
      image: req.files['image'] ? req.files['image'][0].filename : null,
      audio: req.files['audio'] ? req.files['audio'][0].filename : null,
      createdAt: new Date().toISOString()
    };

    pages[pageId] = pageData;
    savePages();

    // Generate QR code
    const pageUrl = `${req.protocol}://${req.get('host')}/gift/${pageId}`;
    const qrCode = await QRCode.toDataURL(pageUrl);

    res.json({
      success: true,
      pageId,
      url: pageUrl,
      qrCode
    });
  } catch (error) {
    console.error('Error creating page:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get gift page data
app.get('/api/gift/:id', (req, res) => {
  const pageData = pages[req.params.id];
  if (pageData) {
    res.json({
      success: true,
      data: {
        text: pageData.text,
        image: pageData.image ? `/uploads/images/${pageData.image}` : null,
        audio: pageData.audio ? `/uploads/audio/${pageData.audio}` : null
      }
    });
  } else {
    res.status(404).json({ success: false, error: 'Page not found' });
  }
});

// Serve gift page
app.get('/gift/:id', (req, res) => {
  if (pages[req.params.id]) {
    res.sendFile(path.join(__dirname, 'public', 'gift.html'));
  } else {
    res.status(404).send('Gift page not found');
  }
});

// Get all pages (for admin)
app.get('/api/pages', (req, res) => {
  const pageList = Object.values(pages).map(page => ({
    id: page.id,
    text: page.text.substring(0, 50) + (page.text.length > 50 ? '...' : ''),
    hasImage: !!page.image,
    hasAudio: !!page.audio,
    createdAt: page.createdAt
  }));
  res.json({ success: true, pages: pageList });
});

app.listen(PORT, () => {
  console.log(`QR Gift server running on http://localhost:${PORT}`);
  console.log(`Admin panel: http://localhost:${PORT}/admin`);
});
