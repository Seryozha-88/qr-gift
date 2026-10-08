// Builds the static GitHub Pages site in docs/ from the gifts created in the admin panel.
// Each gift becomes docs/gift/<id>/ holding index.html, gift.json and its image and audio.
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

// Rebuild the gift folders from scratch so deleted gifts disappear; other files in docs/ (e.g. CNAME) are kept
fs.rmSync(GIFTS_DIR, { recursive: true, force: true });
fs.mkdirSync(GIFTS_DIR, { recursive: true });
for (const file of ['index.html', 'styles.css', 'gift.js']) {
  fs.copyFileSync(path.join(PUBLIC_DIR, file), path.join(SITE_DIR, file));
}
fs.writeFileSync(path.join(SITE_DIR, '.nojekyll'), '');
const giftHtml = fs.readFileSync(path.join(PUBLIC_DIR, 'gift.html'));

let totalBytes = 0;

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
  totalBytes += fs.statSync(src).size;
  return file;
}

const giftList = Object.values(pages);
for (const page of giftList) {
  const giftDir = path.join(GIFTS_DIR, page.id);
  fs.mkdirSync(giftDir);
  fs.writeFileSync(path.join(giftDir, 'index.html'), giftHtml);
  const giftData = {
    title: page.title || '',
    text: page.text || '',
    image: copyMedia(page.image, 'images', IMAGE_EXTS, giftDir, page.id),
    audio: copyMedia(page.audio, 'audio', AUDIO_EXTS, giftDir, page.id)
  };
  fs.writeFileSync(path.join(giftDir, 'gift.json'), JSON.stringify(giftData));
}

const sizeMb = (totalBytes / 1024 ** 2).toFixed(1);
console.log(`Exported ${giftList.length} gift page(s) to docs/ (${sizeMb} MB of images and audio)`);
if (totalBytes > SITE_LIMIT_BYTES * 0.8) {
  console.warn('Warning: the site is close to the 1 GB GitHub Pages limit; delete old gifts or move to another host.');
}
