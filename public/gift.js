// Get page ID from URL
const pathParts = window.location.pathname.split('/');
const pageId = pathParts[pathParts.length - 1];

// Load gift data
async function loadGift() {
  try {
    const response = await fetch(`/api/gift/${pageId}`);
    const result = await response.json();
    
    if (result.success) {
      const { text, image, audio } = result.data;
      
      // Show content
      document.getElementById('loading').style.display = 'none';
      document.getElementById('giftData').style.display = 'block';
      
      // Display text
      if (text) {
        document.getElementById('textContent').textContent = text;
      }
      
      // Display image
      if (image) {
        document.getElementById('imageContainer').style.display = 'block';
        document.getElementById('giftImage').src = image;
      }
      
      // Display audio
      if (audio) {
        document.getElementById('audioContainer').style.display = 'block';
        document.getElementById('audioSource').src = audio;
        document.getElementById('giftAudio').load();
      }
    } else {
      document.getElementById('loading').style.display = 'none';
      document.getElementById('error').style.display = 'block';
    }
  } catch (error) {
    console.error('Error loading gift:', error);
    document.getElementById('loading').style.display = 'none';
    document.getElementById('error').style.display = 'block';
  }
}

loadGift();
