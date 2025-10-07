// Preview uploads
document.getElementById('image').addEventListener('change', function(e) {
  const preview = document.getElementById('imagePreview');
  const progress = document.getElementById('imageUploadProgress');
  const file = e.target.files[0];
  
  if (!file) {
    preview.innerHTML = '';
    progress.style.display = 'none';
    return;
  }
  
  progress.style.display = 'block';
  const reader = new FileReader();
  
  reader.onload = ev => {
    preview.innerHTML = `<img src="${ev.target.result}" alt="Preview">`;
    progress.style.display = 'none';
  };
  
  reader.onerror = () => {
    progress.style.display = 'none';
    alert('Error reading image file');
  };
  
  reader.readAsDataURL(file);
});

document.getElementById('audio').addEventListener('change', function(e) {
  const preview = document.getElementById('audioPreview');
  const progress = document.getElementById('audioUploadProgress');
  const file = e.target.files[0];
  
  if (!file) {
    preview.innerHTML = '';
    progress.style.display = 'none';
    return;
  }
  
  progress.style.display = 'block';
  
  // Show progress briefly then show audio player
  setTimeout(() => {
    const url = URL.createObjectURL(file);
    preview.innerHTML = `<audio controls><source src="${url}" type="audio/mpeg"></audio>`;
    progress.style.display = 'none';
  }, 500);
});

// Submit form
document.getElementById('giftForm').addEventListener('submit', async function(e) {
  e.preventDefault();
  const formData = new FormData(e.target);

  // Show loading state
  const submitBtn = document.getElementById('submitBtn');
  const btnText = document.getElementById('btnText');
  const loadingSpinner = document.getElementById('loadingSpinner');
  
  submitBtn.disabled = true;
  btnText.style.display = 'none';
  loadingSpinner.style.display = 'flex';

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
  } catch (err) {
    alert('Error: ' + err.message);
  } finally {
    // Reset button state
    submitBtn.disabled = false;
    btnText.style.display = 'inline';
    loadingSpinner.style.display = 'none';
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
  document.getElementById('imageUploadProgress').style.display = 'none';
  document.getElementById('audioUploadProgress').style.display = 'none';
  
  // Reset button state
  const submitBtn = document.getElementById('submitBtn');
  const btnText = document.getElementById('btnText');
  const loadingSpinner = document.getElementById('loadingSpinner');
  
  submitBtn.disabled = false;
  btnText.style.display = 'inline';
  loadingSpinner.style.display = 'none';
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
