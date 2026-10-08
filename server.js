import express from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import QRCode from 'qrcode';
import { v4 as uuidv4 } from 'uuid';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

// Where pages, uploads and backups are stored (mount persistent storage here in production)
const STORAGE_DIR = process.env.STORAGE_DIR || '.';
const UPLOADS_DIR = path.join(STORAGE_DIR, 'uploads');
const DATA_DIR = path.join(STORAGE_DIR, 'data');
const BACKUPS_DIR = path.join(STORAGE_DIR, 'backups');

// Secret for the admin panel and admin APIs; must not live in the repository.
// Without ADMIN_KEY a random one is generated and the admin URL is printed at startup.
const ADMIN_KEY = process.env.ADMIN_KEY || crypto.randomBytes(16).toString('hex');

// Public address of the published site (e.g. https://seryozha-88.github.io/qr-gift).
// When set, QR codes point there instead of at this server.
const PUBLIC_URL = (process.env.PUBLIC_URL || '').replace(/\/+$/, '');

// Behind Cloud Run's proxy, so req.protocol reports https and QR codes use https URLs
app.set('trust proxy', true);

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static('public'));
app.use('/uploads', express.static(UPLOADS_DIR));

// Health check endpoint for Cloud Run
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'healthy' });
});

// Create necessary directories
[path.join(UPLOADS_DIR, 'images'), path.join(UPLOADS_DIR, 'audio'), DATA_DIR, BACKUPS_DIR].forEach(dir => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
});

// Configure multer for file uploads
const storage = multer.diskStorage({
  // Stored by form field, so the saved path always matches the URL built from the field name
  destination: function (req, file, cb) {
    cb(null, path.join(UPLOADS_DIR, file.fieldname === 'image' ? 'images' : 'audio'));
  },
  filename: function (req, file, cb) {
    const uniqueName = uuidv4() + path.extname(file.originalname);
    cb(null, uniqueName);
  }
});

const upload = multer({
  storage: storage,
  fileFilter: (req, file, cb) => {
    const expected = file.fieldname === 'image' ? 'image/' : 'audio/';
    if (file.mimetype.startsWith(expected)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type'));
    }
  }
});

// Load or initialize pages data
const dataFile = path.join(DATA_DIR, 'pages.json');
let pages = {};
if (fs.existsSync(dataFile)) {
  pages = JSON.parse(fs.readFileSync(dataFile, 'utf8'));
}

function savePages() {
  fs.writeFileSync(dataFile, JSON.stringify(pages, null, 2));
  // Create backup with timestamp
  createBackup();
}

// Deleted gift ids, so export.js also takes them off the published site
const removedFile = path.join(DATA_DIR, 'removed.json');

function recordRemoval(pageId) {
  const removed = fs.existsSync(removedFile) ? JSON.parse(fs.readFileSync(removedFile, 'utf8')) : [];
  if (!removed.includes(pageId)) {
    removed.push(pageId);
    fs.writeFileSync(removedFile, JSON.stringify(removed, null, 2));
  }
}

// Backup function
function createBackup() {
  try {
    const timestamp = new Date().toISOString().replace(/:/g, '-');
    const backupDir = path.join(BACKUPS_DIR, `backup_${timestamp}`);
    
    // Create backup directory
    if (!fs.existsSync(backupDir)) {
      fs.mkdirSync(backupDir, { recursive: true });
    }
    
    // Backup pages.json
    fs.writeFileSync(
      path.join(backupDir, 'pages.json'),
      JSON.stringify(pages, null, 2)
    );
    
    // Backup uploaded files
    const imagesBackup = path.join(backupDir, 'images');
    const audioBackup = path.join(backupDir, 'audio');
    
    if (!fs.existsSync(imagesBackup)) fs.mkdirSync(imagesBackup, { recursive: true });
    if (!fs.existsSync(audioBackup)) fs.mkdirSync(audioBackup, { recursive: true });
    
    // Copy all uploaded files
    Object.values(pages).forEach(page => {
      if (page.image) {
        const src = path.join(UPLOADS_DIR, 'images', page.image);
        const dest = path.join(imagesBackup, page.image);
        if (fs.existsSync(src)) {
          fs.copyFileSync(src, dest);
        }
      }
      if (page.audio) {
        const src = path.join(UPLOADS_DIR, 'audio', page.audio);
        const dest = path.join(audioBackup, page.audio);
        if (fs.existsSync(src)) {
          fs.copyFileSync(src, dest);
        }
      }
    });
    
    console.log(`Backup created: ${backupDir}`);
    
    // Keep only last 10 backups
    cleanOldBackups();
  } catch (error) {
    console.error('Backup error:', error);
  }
}

// Clean old backups
function cleanOldBackups() {
  try {
    const backups = fs.readdirSync(BACKUPS_DIR)
      .filter(file => file.startsWith('backup_'))
      .map(file => ({
        name: file,
        path: path.join(BACKUPS_DIR, file),
        time: fs.statSync(path.join(BACKUPS_DIR, file)).mtime.getTime()
      }))
      .sort((a, b) => b.time - a.time);
    
    // Keep only last 10 backups
    if (backups.length > 10) {
      backups.slice(10).forEach(backup => {
        fs.rmSync(backup.path, { recursive: true, force: true });
        console.log(`Deleted old backup: ${backup.name}`);
      });
    }
  } catch (error) {
    console.error('Error cleaning backups:', error);
  }
}

// Routes
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Secure admin panel with secret key
app.get(`/admin/${ADMIN_KEY}`, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

// Admin APIs require the same key, sent by admin.js in the X-Admin-Key header
function requireAdmin(req, res, next) {
  if (req.get('X-Admin-Key') === ADMIN_KEY) {
    return next();
  }
  res.status(401).json({ success: false, error: 'Unauthorized' });
}

// Redirect old admin route for security
app.get('/admin', (req, res) => {
  res.status(404).send('Not Found');
});

// Create new gift page
app.post('/api/create', requireAdmin, upload.fields([
  { name: 'image', maxCount: 1 },
  { name: 'audio', maxCount: 1 }
]), async (req, res) => {
  try {
    const pageId = uuidv4();
    const { title, text } = req.body;
    
    const pageData = {
      id: pageId,
      title: title || '',
      text: text || '',
      image: req.files['image'] ? req.files['image'][0].filename : null,
      audio: req.files['audio'] ? req.files['audio'][0].filename : null,
      createdAt: new Date().toISOString()
    };

    pages[pageId] = pageData;
    savePages();

    // Generate QR code
    const previewUrl = `/gift/${pageId}/`;
    const baseUrl = PUBLIC_URL || `${req.protocol}://${req.get('host')}`;
    const pageUrl = `${baseUrl}${previewUrl}`;
    const qrCode = await QRCode.toDataURL(pageUrl);

    res.json({
      success: true,
      pageId,
      url: pageUrl,
      previewUrl,
      needsPublish: Boolean(PUBLIC_URL),
      qrCode
    });
  } catch (error) {
    console.error('Error creating page:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get gift page data; same shape as the gift.json files written by export.js
app.get('/gift/:id/gift.json', (req, res) => {
  const pageData = pages[req.params.id];
  if (pageData) {
    res.json({
      title: pageData.title || '',
      text: pageData.text,
      image: pageData.image ? `/uploads/images/${pageData.image}` : null,
      audio: pageData.audio ? `/uploads/audio/${pageData.audio}` : null
    });
  } else {
    res.status(404).json({ error: 'Page not found' });
  }
});

// Serve gift page at /gift/<id>/ so it loads gift.json relative to itself, as on the static site
app.get('/gift/:id', (req, res) => {
  if (!pages[req.params.id]) {
    return res.status(404).send('Gift page not found');
  }
  if (!req.path.endsWith('/')) {
    return res.redirect(`/gift/${req.params.id}/`);
  }
  res.sendFile(path.join(__dirname, 'public', 'gift.html'));
});

// Get all pages (for admin)
app.get('/api/pages', requireAdmin, (req, res) => {
  const pageList = Object.values(pages).map(page => ({
    id: page.id,
    title: page.title || 'Untitled',
    text: page.text.substring(0, 50) + (page.text.length > 50 ? '...' : ''),
    hasImage: !!page.image,
    hasAudio: !!page.audio,
    createdAt: page.createdAt
  }));
  res.json({ success: true, pages: pageList });
});

// Delete page endpoint
app.delete('/api/pages/:id', requireAdmin, (req, res) => {
  try {
    const pageId = req.params.id;
    const page = pages[pageId];
    
    if (!page) {
      return res.status(404).json({ success: false, error: 'Page not found' });
    }
    
    // Delete associated files
    if (page.image) {
      const imagePath = path.join(UPLOADS_DIR, 'images', page.image);
      if (fs.existsSync(imagePath)) {
        fs.unlinkSync(imagePath);
      }
    }
    
    if (page.audio) {
      const audioPath = path.join(UPLOADS_DIR, 'audio', page.audio);
      if (fs.existsSync(audioPath)) {
        fs.unlinkSync(audioPath);
      }
    }
    
    // Delete page data
    delete pages[pageId];
    savePages();
    recordRemoval(pageId);

    res.json({ success: true, message: 'Page deleted successfully' });
  } catch (error) {
    console.error('Error deleting page:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get backup list
app.get('/api/backups', requireAdmin, (req, res) => {
  try {
    const backups = fs.readdirSync(BACKUPS_DIR)
      .filter(file => file.startsWith('backup_'))
      .map(file => ({
        name: file,
        date: fs.statSync(path.join(BACKUPS_DIR, file)).mtime,
        size: getDirectorySize(path.join(BACKUPS_DIR, file))
      }))
      .sort((a, b) => b.date - a.date);
    
    res.json({ success: true, backups });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Helper function to get directory size
function getDirectorySize(dirPath) {
  let size = 0;
  const files = fs.readdirSync(dirPath);
  
  files.forEach(file => {
    const filePath = path.join(dirPath, file);
    const stats = fs.statSync(filePath);
    if (stats.isDirectory()) {
      size += getDirectorySize(filePath);
    } else {
      size += stats.size;
    }
  });
  
  return size;
}

// Report upload errors (e.g. wrong file type) as JSON, which is what admin.js expects
app.use((err, req, res, next) => {
  res.status(400).json({ success: false, error: err.message });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`QR Gift server running on port ${PORT}`);
  if (process.env.ADMIN_KEY) {
    console.log(`Admin panel: /admin/<ADMIN_KEY>`);
  } else {
    console.log(`Admin panel: http://localhost:${PORT}/admin/${ADMIN_KEY} (set ADMIN_KEY to keep this URL fixed)`);
  }
  console.log(`QR codes point to: ${PUBLIC_URL || 'this server'}`);
  console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`Pages will persist until manually deleted`);
  console.log(`Backups stored in: ${BACKUPS_DIR}`);
});
