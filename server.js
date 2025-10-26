import express from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import QRCode from 'qrcode';
import { v4 as uuidv4 } from 'uuid';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static('public'));
app.use('/uploads', express.static('uploads'));

// Health check endpoint for Cloud Run
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'healthy' });
});

// Create necessary directories
['uploads/images', 'uploads/audio', 'data', 'backups'].forEach(dir => {
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
  // Create backup with timestamp
  createBackup();
}

// Backup function
function createBackup() {
  try {
    const timestamp = new Date().toISOString().replace(/:/g, '-');
    const backupDir = `backups/backup_${timestamp}`;
    
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
        const src = path.join('uploads/images', page.image);
        const dest = path.join(imagesBackup, page.image);
        if (fs.existsSync(src)) {
          fs.copyFileSync(src, dest);
        }
      }
      if (page.audio) {
        const src = path.join('uploads/audio', page.audio);
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
    const backups = fs.readdirSync('backups')
      .filter(file => file.startsWith('backup_'))
      .map(file => ({
        name: file,
        path: path.join('backups', file),
        time: fs.statSync(path.join('backups', file)).mtime.getTime()
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

// Secure admin panel with hash
const ADMIN_HASH = 'a7f9c2e8d1b4f6a3e9c7d2b8f5a1e6c9'; // Change this to your own secure hash

app.get(`/admin/${ADMIN_HASH}`, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

// Redirect old admin route for security
app.get('/admin', (req, res) => {
  res.status(404).send('Not Found');
});

// Create new gift page
app.post('/api/create', upload.fields([
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
        title: pageData.title || '',
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
    title: page.title || 'Untitled',
    text: page.text.substring(0, 50) + (page.text.length > 50 ? '...' : ''),
    hasImage: !!page.image,
    hasAudio: !!page.audio,
    createdAt: page.createdAt
  }));
  res.json({ success: true, pages: pageList });
});

// Delete page endpoint
app.delete('/api/pages/:id', (req, res) => {
  try {
    const pageId = req.params.id;
    const page = pages[pageId];
    
    if (!page) {
      return res.status(404).json({ success: false, error: 'Page not found' });
    }
    
    // Delete associated files
    if (page.image) {
      const imagePath = path.join('uploads/images', page.image);
      if (fs.existsSync(imagePath)) {
        fs.unlinkSync(imagePath);
      }
    }
    
    if (page.audio) {
      const audioPath = path.join('uploads/audio', page.audio);
      if (fs.existsSync(audioPath)) {
        fs.unlinkSync(audioPath);
      }
    }
    
    // Delete page data
    delete pages[pageId];
    savePages();
    
    res.json({ success: true, message: 'Page deleted successfully' });
  } catch (error) {
    console.error('Error deleting page:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get backup list
app.get('/api/backups', (req, res) => {
  try {
    const backups = fs.readdirSync('backups')
      .filter(file => file.startsWith('backup_'))
      .map(file => ({
        name: file,
        date: fs.statSync(path.join('backups', file)).mtime,
        size: getDirectorySize(path.join('backups', file))
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

app.listen(PORT, '0.0.0.0', () => {
  console.log(`QR Gift server running on port ${PORT}`);
  console.log(`Admin panel: /admin/${ADMIN_HASH}`);
  console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`Pages will persist until manually deleted`);
  console.log(`Backups stored in: backups/`);
});
