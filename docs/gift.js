// Renders a gift page from gift.json, which sits next to the page on both the server and the static site.
// Also shared with the admin page, which uses GiftPage.TEXT_FONTS / applyTextStyle for its live preview.
const SHOP_NAME = 'Space for you Gift shop';

// Message styles a gift can choose; gift.json only ever names one of these keys
const TEXT_FONTS = {
  standard: { label: 'Standard', family: '' },
  modern: { label: 'Modern', family: "'Noto Sans', 'Noto Sans Armenian', sans-serif" },
  classic: { label: 'Classic', family: "'Noto Serif', 'Noto Serif Armenian', serif" },
  // Caveat has no Armenian letters, so Armenian text falls back to the Modern font
  handwritten: { label: 'Handwritten', family: "'Caveat', 'Noto Sans Armenian', cursive" }
};
const TEXT_SIZES = {
  small: { label: 'Small', size: '1.05em' },
  medium: { label: 'Medium', size: '1.3em' },
  large: { label: 'Large', size: '1.7em' },
  xlarge: { label: 'Extra large', size: '2.2em' }
};
const TEXT_ALIGNS = ['left', 'center', 'right'];
const HEX_COLOR = /^#[0-9a-f]{6}$/i;

function applyTextStyle(element, style) {
  const { font, size, color, bold, italic, align } = style || {};
  element.style.fontFamily = TEXT_FONTS[font] ? TEXT_FONTS[font].family : '';
  element.style.fontSize = TEXT_SIZES[size] ? TEXT_SIZES[size].size : '';
  element.style.color = HEX_COLOR.test(color || '') ? color : '';
  element.style.fontWeight = bold === true ? '700' : '';
  element.style.fontStyle = italic === true ? 'italic' : '';
  element.style.textAlign = TEXT_ALIGNS.includes(align) ? align : '';
}

window.GiftPage = { TEXT_FONTS, TEXT_SIZES, TEXT_ALIGNS, applyTextStyle };

function create(tag, className, props) {
  const element = Object.assign(document.createElement(tag), props);
  if (className) {
    element.className = className;
  }
  return element;
}

function mediaBlock(className, element) {
  const block = create('div', className);
  block.append(element);
  return block;
}

async function loadGift(root) {
  const content = create('div', 'gift-content');
  const status = create('div', 'loading', { textContent: 'Loading your gift...' });
  content.append(create('h1', 'gift-title', { textContent: SHOP_NAME }), status);
  root.replaceChildren(content);

  try {
    const response = await fetch('gift.json');
    if (!response.ok) {
      throw new Error(`gift.json returned ${response.status}`);
    }
    const { text, image, video, poster, audio, style } = await response.json();
    const parts = [];

    if (text) {
      const textBlock = create('div', 'text-content', { textContent: text });
      applyTextStyle(textBlock, style);
      parts.push(textBlock);
    }
    if (image) {
      parts.push(mediaBlock('image-container', create('img', '', { src: image, alt: 'Gift image' })));
    }
    if (video) {
      // playsInline keeps iPhones from forcing full screen; the poster shows before playback starts
      const player = create('video', '', { src: video, controls: true, playsInline: true, preload: 'metadata' });
      if (poster) {
        player.poster = poster;
      }
      parts.push(mediaBlock('video-container', player));
    }
    if (audio) {
      parts.push(mediaBlock('audio-container', create('audio', '', { src: audio, controls: true, preload: 'metadata' })));
    }
    status.replaceWith(...parts);
  } catch (error) {
    console.error('Error loading gift:', error);
    status.className = 'error';
    status.textContent = 'Gift page not found 😢';
  }
}

// Gift pages have <main id="gift">; pages created with the older template are rebuilt in the same layout
const giftRoot = document.getElementById('gift') || (document.getElementById('giftData') && document.body);
if (giftRoot) {
  document.title = 'Your Gift';
  if (giftRoot === document.body) {
    const main = create('main', 'gift-container', { id: 'gift' });
    document.body.replaceChildren(main);
    loadGift(main);
  } else {
    loadGift(giftRoot);
  }
}
