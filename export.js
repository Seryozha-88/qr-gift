// Builds the static GitHub Pages site in docs/ from the gifts created in the admin panel.
// Each gift becomes docs/gift/<id>/ holding index.html, gift.json and its image and audio.
// Gifts published from other computers are kept; only gifts deleted in this admin panel are removed.
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const STORAGE_DIR = process.env.STORAGE_DIR || '.';
const UPLOADS_DIR = path.join(STORAGE_DIR, 'uploads');
const dataFile = path.join(STORAGE_DIR, 'data', 'pages.json');
const PUBLIC_DIR = path.join(__dirname, 'public');
const SITE_DIR = path.join(__dirname, 'docs');
const GIFTS_DIR = path.join(SITE_DIR, 'gift');

// Only these file types are published, so an upload can never become a page on the site
const IMAGE_EXTS = new Set(['.jpg', '.jpeg', '.png', '.gif', '.webp']);
const AUDIO_EXTS = new Set(['.mp3', '.m4a', '.aac', '.ogg', '.wav']);

// GitHub Pages refuses sites larger than 1 GB
const SITE_LIMIT_BYTES = 1024 ** 3;

const pages = fs.existsSync(dataFile) ? JSON.parse(fs.readFileSync(dataFile, 'utf8')) : {};
const removedFile = path.join(STORAGE_DIR, 'data', 'removed.json');
const removed = fs.existsSync(removedFile) ? JSON.parse(fs.readFileSync(removedFile, 'utf8')) : [];

fs.mkdirSync(GIFTS_DIR, { recursive: true });
for (const pageId of removed) {
  fs.rmSync(path.join(GIFTS_DIR, path.basename(pageId)), { recursive: true, force: true });
}
for (const file of ['index.html', 'styles.css', 'gift.js']) {
  fs.copyFileSync(path.join(PUBLIC_DIR, file), path.join(SITE_DIR, file));
}
fs.writeFileSync(path.join(SITE_DIR, '.nojekyll'), '');
const giftHtml = fs.readFileSync(path.join(PUBLIC_DIR, 'gift.html'));
// The browser admin (docs/admin/) copies this template into each gift it creates
fs.writeFileSync(path.join(SITE_DIR, 'gift-template.html'), giftHtml);

function copyMedia(file, subdir, allowedExts, giftDir, pageId) {
  if (!file) {
    return null;
  }
  const src = path.join(UPLOADS_DIR, subdir, file);
  if (!allowedExts.has(path.extname(file).toLowerCase()) || !fs.existsSync(src)) {
    console.warn(`Skipped ${subdir} file ${file} of gift ${pageId}: missing or not an allowed file type`);
    return null;
  }
  fs.copyFileSync(src, path.join(giftDir, file));
  return file;
}

function dirSize(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).reduce((size, entry) => {
    const entryPath = path.join(dir, entry.name);
    return size + (entry.isDirectory() ? dirSize(entryPath) : fs.statSync(entryPath).size);
  }, 0);
}

const giftList = Object.values(pages);
for (const page of giftList) {
  const giftDir = path.join(GIFTS_DIR, page.id);
  fs.rmSync(giftDir, { recursive: true, force: true });
  fs.mkdirSync(giftDir);
  fs.writeFileSync(path.join(giftDir, 'index.html'), giftHtml);
  const giftData = {
    title: page.title || '',
    text: page.text || '',
    image: copyMedia(page.image, 'images', IMAGE_EXTS, giftDir, page.id),
    audio: copyMedia(page.audio, 'audio', AUDIO_EXTS, giftDir, page.id),
    createdAt: page.createdAt
  };
  fs.writeFileSync(path.join(giftDir, 'gift.json'), JSON.stringify(giftData));
}

const publishedCount = fs.readdirSync(GIFTS_DIR).length;
const totalBytes = dirSize(GIFTS_DIR);
const sizeMb = (totalBytes / 1024 ** 2).toFixed(1);
console.log(`Exported ${giftList.length} gift page(s) from this computer; ${publishedCount} published in total (${sizeMb} MB)`);
if (totalBytes > SITE_LIMIT_BYTES * 0.8) {
  console.warn('Warning: the site is close to the 1 GB GitHub Pages limit; delete old gifts or move to another host.');
}
