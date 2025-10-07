const pageId = window.location.pathname.split('/').pop();

async function loadGift() {
  try {
    const res = await fetch(`/api/gift/${pageId}`);
    const result = await res.json();

    if (!result.success) throw new Error("Gift not found");

    const { title, text, image, audio } = result.data;
    document.getElementById('loading').style.display = 'none';
    document.getElementById('giftData').style.display = 'block';

    if (title) document.getElementById('giftTitle').textContent = title;
    if (image) {
      document.getElementById('imageContainer').style.display = 'block';
      document.getElementById('giftImage').src = image;
    }
    if (text) document.getElementById('textContent').textContent = text;
    if (audio) {
      document.getElementById('audioContainer').style.display = 'block';
      document.getElementById('audioSource').src = audio;
      document.getElementById('giftAudio').load();
    }
  } catch (err) {
    console.error(err);
    document.getElementById('loading').style.display = 'none';
    document.getElementById('error').style.display = 'block';
  }
}

loadGift();
