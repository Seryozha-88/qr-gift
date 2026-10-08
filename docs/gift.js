// Load gift data; gift.json sits next to this page on both the server and the static site
async function loadGift() {
  try {
    const response = await fetch('gift.json');

    if (response.ok) {
      const { text, image, audio } = await response.json();
      
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
