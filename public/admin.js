// Preview uploaded image
document.getElementById('image').addEventListener('change', e => {
  const preview = document.getElementById('imagePreview');
  const file = e.target.files[0];
  if (!file) return (preview.innerHTML = '');
  const reader = new FileReader();
  reader.onload = ev => {
    preview.innerHTML = `<img src="${ev.target.result}" alt="Preview">`;
  };
  reader.readAsDataURL(file);
});

// Preview uploaded audio
document.getElementById('audio').addEventListener('change', e => {
  const preview = document.getElementById('audioPreview');
  const file = e.target.files[0];
  if (!file) return (preview.innerHTML = '');
  const url = URL.createObjectURL(file);
  preview.innerHTML = `<audio controls><source src="${url}" type="audio/mpeg"></audio>`;
});

// Submit form
document.getElementById('giftForm').addEventListener('submit', async e => {
  e.preventDefault();
  const formData = new FormData(e.target);

  try {
    const res = await fetch('/api/create', { method: 'POST', body: formData });
    const result = await res.json();

    if (result.success) {
      document.getElementById('qrCode').src = result.qrCode;
      document.getElementById('pageUrl').value = result.url;
      document.getElementById('visitLink').href = result.url;

      document.querySelector('.form-container').style.display = 'none';
      document.getElementById('result').style.display = 'block';
      loadPages();
    } else alert('Error creating page: ' + result.error);
  } catch (err) {
    alert('Error: ' + err.message);
  }
});

function copyUrl() {
  const input = document.getElementById('pageUrl');
  input.select();
  document.execCommand('copy');
  alert('URL copied!');
}

function downloadQR() {
  const img = document.getElementById('qrCode');
  const a = document.createElement('a');
  a.download = 'qr.png';
  a.href = img.src;
  a.click();
}

function createAnother() {
  document.getElementById('giftForm').reset();
  document.querySelector('.form-container').style.display = 'block';
  document.getElementById('result').style.display = 'none';
  document.getElementById('imagePreview').innerHTML = '';
  document.getElementById('audioPreview').innerHTML = '';
}

async function loadPages() {
  const res = await fetch('/api/pages');
  const result = await res.json();
  const list = document.getElementById('pagesList');
  if (!result.pages.length) {
    list.innerHTML = '<p style="color:#999;">No pages created yet.</p>';
    return;
  }
  list.innerHTML = result.pages.map(p => `
    <div class="page-item">
      <div class="page-info">
        <p><strong>${p.title}</strong></p>
        <p>${p.text}</p>
        <p>${p.hasImage ? '🖼️ Image ' : ''}${p.hasAudio ? '🎵 Audio' : ''}</p>
        <p style="font-size:.9em;color:#777;">${new Date(p.createdAt).toLocaleString()}</p>
      </div>
      <a href="/gift/${p.id}" target="_blank" class="btn btn-secondary">View</a>
    </div>
  `).join('');
}

loadPages();
