// Preview uploads
document.getElementById('image').addEventListener('change', function(e) {
  const preview = document.getElementById('imagePreview');
  const file = e.target.files[0];
  
  if (file) {
    const reader = new FileReader();
    reader.onload = function(e) {
      preview.innerHTML = `<img src="${e.target.result}" alt="Preview">`;
    };
    reader.readAsDataURL(file);
  } else {
    preview.innerHTML = '';
  }
});

document.getElementById('audio').addEventListener('change', function(e) {
  const preview = document.getElementById('audioPreview');
  const file = e.target.files[0];
  
  if (file) {
    const url = URL.createObjectURL(file);
    preview.innerHTML = `<audio controls><source src="${url}" type="audio/mpeg"></audio>`;
  } else {
    preview.innerHTML = '';
  }
});

// Submit form
document.getElementById('giftForm').addEventListener('submit', async function(e) {
  e.preventDefault();
  
  const formData = new FormData(this);
  
  try {
    const response = await fetch('/api/create', {
      method: 'POST',
      body: formData
    });
    
    const result = await response.json();
    
    if (result.success) {
      document.getElementById('qrCode').src = result.qrCode;
      document.getElementById('pageUrl').value = result.url;
      document.getElementById('visitLink').href = result.url;
      
      document.querySelector('.form-container').style.display = 'none';
      document.getElementById('result').style.display = 'block';
      
      loadPages();
    } else {
      alert('Error creating page: ' + result.error);
    }
  } catch (error) {
    alert('Error: ' + error.message);
  }
});

function copyUrl() {
  const urlInput = document.getElementById('pageUrl');
  urlInput.select();
  document.execCommand('copy');
  alert('URL copied to clipboard!');
}

function downloadQR() {
  const qrImage = document.getElementById('qrCode');
  const link = document.createElement('a');
  link.download = 'qr-code.png';
  link.href = qrImage.src;
  link.click();
}

function createAnother() {
  document.querySelector('.form-container').style.display = 'block';
  document.getElementById('result').style.display = 'none';
  document.getElementById('giftForm').reset();
  document.getElementById('imagePreview').innerHTML = '';
  document.getElementById('audioPreview').innerHTML = '';
}

// Load recent pages
async function loadPages() {
  try {
    const response = await fetch('/api/pages');
    const result = await response.json();
    
    if (result.success) {
      const pagesList = document.getElementById('pagesList');
      
      if (result.pages.length === 0) {
        pagesList.innerHTML = '<p style="color: #999;">No pages created yet.</p>';
        return;
      }
      
      pagesList.innerHTML = result.pages.map(page => `
        <div class="page-item">
          <div class="page-info">
            <p><strong>Text:</strong> ${page.text || 'No text'}</p>
            <p>
              ${page.hasImage ? '🖼️ Image' : ''} 
              ${page.hasAudio ? '🎵 Audio' : ''}
            </p>
            <p style="font-size: 0.9em; color: #999;">
              Created: ${new Date(page.createdAt).toLocaleString()}
            </p>
          </div>
          <a href="/gift/${page.id}" target="_blank" class="btn btn-secondary">View Page</a>
        </div>
      `).join('');
    }
  } catch (error) {
    console.error('Error loading pages:', error);
  }
}

// Load pages on page load
loadPages();
