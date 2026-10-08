// Gift admin for the GitHub Pages site. Gifts are created and deleted by committing to the
// repository through the GitHub API with the signed-in staff member's own token.
const OWNER = 'Seryozha-88';
const REPO = 'qr-gift';
const BRANCH = 'main';
const API = `https://api.github.com/repos/${OWNER}/${REPO}`;
const GIFT_PATH = /^docs\/gift\/([0-9a-f-]{36})\/(.+)$/;

// The published site is one level up from this page, e.g. https://seryozha-88.github.io/qr-gift
const SITE_URL = new URL('../', window.location.href).href.replace(/\/$/, '');

// Same allowlist as export.js, so an upload can never become a page on the site
const IMAGE_EXTS = ['.jpg', '.jpeg', '.png', '.gif', '.webp'];
const AUDIO_EXTS = ['.mp3', '.m4a', '.aac', '.ogg', '.wav'];
const MAX_FILE_BYTES = 25 * 1024 * 1024;

// GitHub Pages refuses sites larger than 1 GB
const SITE_LIMIT_BYTES = 1024 ** 3;

const TOKEN_KEY = 'qrGiftToken';
let token = null;
let giftFiles = new Map(); // gift id -> repository paths of its files

const $ = id => document.getElementById(id);

// Storage can be unavailable (private browsing), so every access is guarded
function loadToken() {
  try {
    return localStorage.getItem(TOKEN_KEY) || sessionStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

function saveToken(value, remember) {
  try {
    (remember ? localStorage : sessionStorage).setItem(TOKEN_KEY, value);
  } catch {
    // Token stays in memory for this visit only
  }
}

function clearToken() {
  try {
    localStorage.removeItem(TOKEN_KEY);
    sessionStorage.removeItem(TOKEN_KEY);
  } catch {
    // Nothing stored
  }
}

async function apiError(response) {
  let message = '';
  try {
    message = (await response.json()).message || '';
  } catch {
    // Not JSON
  }
  const hints = {
    401: 'The token is invalid or has expired. Create a new one and sign in again.',
    403: `GitHub refused the request (${message}). If you used a fine-grained token, create a classic token with public_repo instead.`,
    404: `No access to ${OWNER}/${REPO}. Accept the invitation from the shop owner and make sure the token has public_repo ticked.`
  };
  const error = new Error(hints[response.status] || `GitHub error ${response.status}: ${message}`);
  error.status = response.status;
  return error;
}

async function request(url, options = {}) {
  const headers = { Accept: 'application/vnd.github+json', Authorization: `Bearer ${token}` };
  if (options.body) {
    headers['Content-Type'] = 'application/json';
  }
  const response = await fetch(url, { ...options, headers });
  if (!response.ok) {
    throw await apiError(response);
  }
  return response;
}

async function github(path, options) {
  const response = await request(`${API}${path}`, options);
  return response.status === 204 ? null : response.json();
}

function post(path, body, method = 'POST') {
  return github(path, { method, body: JSON.stringify(body) });
}

// Applies tree changes as one commit; retries when another admin committed in the meantime
async function commitChanges(entries, message) {
  for (let attempt = 1; ; attempt++) {
    const ref = await github(`/git/ref/heads/${BRANCH}`);
    const parent = await github(`/git/commits/${ref.object.sha}`);
    const tree = await post('/git/trees', { base_tree: parent.tree.sha, tree: entries });
    const commit = await post('/git/commits', { message, tree: tree.sha, parents: [parent.sha] });
    try {
      await post(`/git/refs/heads/${BRANCH}`, { sha: commit.sha }, 'PATCH');
      return;
    } catch (error) {
      if (error.status !== 422 || attempt === 3) {
        throw error;
      }
    }
  }
}

function extensionOf(name) {
  const dot = name.lastIndexOf('.');
  return dot === -1 ? '' : name.slice(dot).toLowerCase();
}

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result.split(',')[1]);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

function decodeBase64Utf8(base64) {
  const binary = atob(base64.replace(/\s/g, ''));
  return new TextDecoder().decode(Uint8Array.from(binary, char => char.charCodeAt(0)));
}

function giftUrl(id) {
  return `${SITE_URL}/gift/${id}/`;
}

function validateFile(file, allowedExts, label) {
  if (!file) {
    return;
  }
  if (!allowedExts.includes(extensionOf(file.name))) {
    throw new Error(`${label} must be one of: ${allowedExts.join(', ')}`);
  }
  if (file.size > MAX_FILE_BYTES) {
    throw new Error(`${label} is larger than 25 MB. Use a smaller file.`);
  }
}

async function createGift(text, image, audio) {
  const templateResponse = await fetch('../gift-template.html', { cache: 'no-store' });
  if (!templateResponse.ok) {
    throw new Error('Could not load the gift page template from the site.');
  }
  const template = await templateResponse.text();

  const id = crypto.randomUUID();
  const dir = `docs/gift/${id}`;
  const giftData = { title: '', text, image: null, audio: null, createdAt: new Date().toISOString() };
  const entries = [];

  for (const [kind, file] of [['image', image], ['audio', audio]]) {
    if (!file) {
      continue;
    }
    const name = crypto.randomUUID() + extensionOf(file.name);
    const blob = await post('/git/blobs', { content: await fileToBase64(file), encoding: 'base64' });
    entries.push({ path: `${dir}/${name}`, mode: '100644', type: 'blob', sha: blob.sha });
    giftData[kind] = name;
  }
  entries.push({ path: `${dir}/index.html`, mode: '100644', type: 'blob', content: template });
  entries.push({ path: `${dir}/gift.json`, mode: '100644', type: 'blob', content: JSON.stringify(giftData) });

  await commitChanges(entries, `Add gift ${id}`);
  return id;
}

async function deleteGift(id) {
  const paths = giftFiles.get(id) || [];
  const entries = paths.map(path => ({ path, mode: '100644', type: 'blob', sha: null }));
  await commitChanges(entries, `Delete gift ${id}`);
}

// Gift data comes from the published site; gifts that are still publishing are read through the API
async function readGift(id, sha) {
  try {
    const response = await fetch(`${SITE_URL}/gift/${id}/gift.json`);
    if (response.ok) {
      return { id, published: true, ...(await response.json()) };
    }
  } catch {
    // Fall back to the API
  }
  const blob = await github(`/git/blobs/${sha}`);
  return { id, published: false, ...JSON.parse(decodeBase64Utf8(blob.content)) };
}

async function qrDataUrl(id) {
  return window.QRCode.toDataURL(giftUrl(id), { width: 512, margin: 2 });
}

async function downloadQr(id) {
  const link = document.createElement('a');
  link.download = `gift-qr-${id.slice(0, 8)}.png`;
  link.href = await qrDataUrl(id);
  link.click();
}

function giftItem(gift) {
  const item = document.createElement('div');
  item.className = 'page-item';

  const info = document.createElement('div');
  info.className = 'page-info';
  const text = document.createElement('p');
  const preview = (gift.text || '').slice(0, 80);
  text.textContent = preview ? `${preview}${gift.text.length > 80 ? '…' : ''}` : 'No text';
  const media = document.createElement('p');
  media.textContent = [gift.image && '🖼️ Image', gift.audio && '🎵 Audio', !gift.published && '⏳ Publishing'].filter(Boolean).join('  ');
  const created = document.createElement('p');
  created.style.fontSize = '0.9em';
  created.style.color = '#999';
  created.textContent = gift.createdAt ? `Created: ${new Date(gift.createdAt).toLocaleString()}` : '';
  info.append(text, media, created);

  const actions = document.createElement('div');
  actions.className = 'page-actions';
  const open = document.createElement('a');
  open.className = 'btn btn-secondary';
  open.href = giftUrl(gift.id);
  open.target = '_blank';
  open.rel = 'noopener';
  open.textContent = 'Open';
  const qr = document.createElement('button');
  qr.type = 'button';
  qr.className = 'btn btn-secondary';
  qr.textContent = 'QR Code';
  qr.addEventListener('click', () => downloadQr(gift.id));
  const remove = document.createElement('button');
  remove.type = 'button';
  remove.className = 'btn btn-secondary';
  remove.textContent = 'Delete';
  remove.addEventListener('click', async () => {
    if (!confirm('Delete this gift? Its QR code stops working in about a minute.')) {
      return;
    }
    remove.disabled = true;
    remove.textContent = 'Deleting…';
    try {
      await deleteGift(gift.id);
      await loadGifts();
    } catch (error) {
      alert(error.message);
      remove.disabled = false;
      remove.textContent = 'Delete';
    }
  });
  actions.append(open, qr, remove);

  item.append(info, actions);
  return item;
}

async function loadGifts() {
  const list = $('giftList');
  list.textContent = 'Loading gifts…';
  const ref = await github(`/git/ref/heads/${BRANCH}`);
  const commit = await github(`/git/commits/${ref.object.sha}`);
  const tree = await github(`/git/trees/${commit.tree.sha}?recursive=1`);

  giftFiles = new Map();
  const jsonShas = new Map();
  let bytes = 0;
  for (const entry of tree.tree) {
    const match = entry.type === 'blob' && entry.path.match(GIFT_PATH);
    if (!match) {
      continue;
    }
    const [, id, file] = match;
    if (!giftFiles.has(id)) {
      giftFiles.set(id, []);
    }
    giftFiles.get(id).push(entry.path);
    bytes += entry.size || 0;
    if (file === 'gift.json') {
      jsonShas.set(id, entry.sha);
    }
  }

  const usedMb = bytes / 1024 ** 2;
  const usage = $('usage');
  usage.textContent = `${jsonShas.size} gift(s) · ${usedMb.toFixed(1)} MB of 1024 MB used`;
  usage.classList.toggle('warning', bytes > SITE_LIMIT_BYTES * 0.8);
  if (bytes > SITE_LIMIT_BYTES * 0.8) {
    usage.textContent += ' — nearly full, delete old gifts';
  }

  const gifts = await Promise.all([...jsonShas].map(([id, sha]) =>
    readGift(id, sha).catch(() => ({ id, published: false, text: '(could not load this gift)' }))));
  gifts.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
  list.replaceChildren(...gifts.map(giftItem));
  if (gifts.length === 0) {
    list.textContent = 'No gifts yet.';
  }
}

async function waitUntilLive(id) {
  const status = $('publishStatus');
  status.textContent = '⏳ Publishing… the QR code starts working in about a minute.';
  for (let check = 0; check < 36; check++) {
    await new Promise(resolve => setTimeout(resolve, 5000));
    try {
      const response = await fetch(`${SITE_URL}/gift/${id}/gift.json?check=${Date.now()}`, { cache: 'no-store' });
      if (response.ok) {
        status.textContent = '✅ Live: the QR code works now.';
        loadGifts().catch(() => {});
        return;
      }
    } catch {
      // Not published yet
    }
  }
  status.textContent = 'Still publishing. Open the gift in a few minutes to check before printing.';
}

async function showApp() {
  const user = await (await request('https://api.github.com/user')).json();
  const repo = await github('');
  if (!repo.permissions || !repo.permissions.push) {
    throw new Error(`@${user.login} cannot edit ${OWNER}/${REPO} yet. Ask the shop owner to add you, then accept the invitation.`);
  }
  $('login').textContent = `@${user.login}`;
  $('signIn').hidden = true;
  $('app').hidden = false;
  loadGifts().catch(error => {
    $('giftList').textContent = error.message;
  });
}

function showSignIn(message) {
  $('app').hidden = true;
  $('signIn').hidden = false;
  $('signInError').textContent = message || '';
  $('signInError').hidden = !message;
}

function showPreview(input, previewId, tag) {
  const preview = $(previewId);
  preview.replaceChildren();
  const file = input.files[0];
  if (file) {
    const element = document.createElement(tag);
    element.src = URL.createObjectURL(file);
    if (tag === 'audio') {
      element.controls = true;
    }
    preview.append(element);
  }
}

$('signInForm').addEventListener('submit', async event => {
  event.preventDefault();
  const button = $('signInBtn');
  button.disabled = true;
  token = $('token').value.trim();
  try {
    await showApp();
    saveToken(token, $('remember').checked);
    $('token').value = '';
  } catch (error) {
    token = null;
    showSignIn(error.message);
  } finally {
    button.disabled = false;
  }
});

$('signOut').addEventListener('click', () => {
  clearToken();
  token = null;
  showSignIn();
});

$('image').addEventListener('change', event => showPreview(event.target, 'imagePreview', 'img'));
$('audio').addEventListener('change', event => showPreview(event.target, 'audioPreview', 'audio'));

$('giftForm').addEventListener('submit', async event => {
  event.preventDefault();
  const text = $('text').value.trim();
  const image = $('image').files[0];
  const audio = $('audio').files[0];
  const formError = $('formError');
  const button = $('submitBtn');
  formError.hidden = true;
  try {
    if (!text && !image && !audio) {
      throw new Error('Add a message, an image or an audio file.');
    }
    validateFile(image, IMAGE_EXTS, 'The image');
    validateFile(audio, AUDIO_EXTS, 'The audio');
    button.disabled = true;
    button.textContent = 'Uploading…';
    const id = await createGift(text, image, audio);
    $('qrCode').src = await qrDataUrl(id);
    $('giftUrl').value = giftUrl(id);
    $('openGift').href = giftUrl(id);
    $('downloadQr').onclick = () => downloadQr(id);
    $('formContainer').hidden = true;
    $('result').hidden = false;
    loadGifts().catch(() => {});
    waitUntilLive(id);
  } catch (error) {
    formError.textContent = error.message;
    formError.hidden = false;
  } finally {
    button.disabled = false;
    button.textContent = 'Create Gift & QR Code';
  }
});

$('copyUrl').addEventListener('click', async () => {
  await navigator.clipboard.writeText($('giftUrl').value);
  $('copyUrl').textContent = 'Copied!';
  setTimeout(() => { $('copyUrl').textContent = 'Copy'; }, 1500);
});

$('createAnother').addEventListener('click', () => {
  $('giftForm').reset();
  $('imagePreview').replaceChildren();
  $('audioPreview').replaceChildren();
  $('result').hidden = true;
  $('formContainer').hidden = false;
});

token = loadToken();
if (token) {
  showApp().catch(error => {
    if (error.status === 401) {
      clearToken();
    }
    token = null;
    showSignIn(error.message);
  });
} else {
  showSignIn();
}
