// Turns a video from an iPhone (HEVC .mov), Android (.mp4, .3gp, .webm) or a computer into an MP4 with H.264 video
// and AAC audio, which plays in every browser, plus a JPEG poster frame. Conversion runs in the browser with the
// device's own video hardware (WebCodecs, through Mediabunny); the libraries are loaded on first use.
const VIDEO_MAX_SECONDS = 180;
const VIDEO_MAX_BYTES = 25 * 1024 * 1024; // same upload limit as images and audio
const VIDEO_TARGET_BYTES = 22 * 1024 * 1024; // headroom for encoder overshoot
const VIDEO_MAX_SIDE = 1280; // 720p
const VIDEO_COPY_MAX_SIDE = 1920; // H.264 up to 1080p is kept as it is
const VIDEO_MAX_BITRATE = 2500000;
const VIDEO_MIN_BITRATE = 500000;
const AUDIO_BITRATE = 128000;
const COPIED_AUDIO_BITRATE = 256000; // budget for AAC audio copied from the original
const POSTER_WIDTH = 720;

const VIDEO_UNREADABLE = 'This video format cannot be read. Use a video from the phone camera, or an MP4, MOV or WebM file.';
const VIDEO_NOT_CONVERTIBLE = 'This device or browser cannot convert this video. Try again in an up-to-date Chrome or Safari, ' +
  'for example on the phone the video was recorded with.';

let mediabunny = null;
let aacEncoder = null;

function loadScript(src) {
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = src;
    script.onload = resolve;
    script.onerror = () => reject(new Error(`Could not load ${src}. Check the internet connection and try again.`));
    document.head.append(script);
  });
}

function loadMediabunny() {
  if (!mediabunny) {
    mediabunny = loadScript('mediabunny.min.js').then(() => window.Mediabunny);
    mediabunny.catch(() => { mediabunny = null; });
  }
  return mediabunny;
}

// Browsers without a built-in AAC encoder (e.g. Chrome on Linux) get a WASM one, only when audio must be re-encoded
async function ensureAacEncoder(MB) {
  if (await MB.canEncodeAudio('aac')) {
    return;
  }
  if (!aacEncoder) {
    aacEncoder = loadScript('mediabunny-aac-encoder.min.js').then(() => window.MediabunnyAacEncoder.registerAacEncoder());
    aacEncoder.catch(() => { aacEncoder = null; });
  }
  await aacEncoder;
}

function even(value) {
  return Math.max(2, 2 * Math.round(value / 2));
}

async function convert(MB, file, settings, onProgress) {
  const input = new MB.Input({ source: new MB.BlobSource(file), formats: MB.ALL_FORMATS });
  const output = new MB.Output({ format: new MB.Mp4OutputFormat({ fastStart: 'in-memory' }), target: new MB.BufferTarget() });
  const conversion = await MB.Conversion.init({
    input,
    output,
    tracks: 'primary',
    video: settings.video,
    audio: settings.audio,
    showWarnings: false
  });
  if (!conversion.isValid || conversion.discardedTracks.some(entry => entry.track.type === 'video')) {
    throw new Error(VIDEO_NOT_CONVERTIBLE);
  }
  conversion.onProgress = onProgress;
  await conversion.execute();
  return output.target.buffer;
}

async function posterFrame(MB, buffer, duration) {
  try {
    const input = new MB.Input({ source: new MB.BufferSource(buffer), formats: MB.ALL_FORMATS });
    const track = await input.getPrimaryVideoTrack();
    const sink = new MB.CanvasSink(track, { width: POSTER_WIDTH });
    const frame = await sink.getCanvas(Math.min(1, duration / 2));
    if (!frame) {
      return null;
    }
    const { canvas } = frame;
    return canvas.convertToBlob
      ? await canvas.convertToBlob({ type: 'image/jpeg', quality: 0.8 })
      : await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.8));
  } catch (error) {
    console.warn('No poster frame:', error);
    return null; // the gift page then shows the video's first frame
  }
}

// Returns { video: Blob (MP4), poster: Blob or null, duration, converted } or throws an Error with a staff-readable message
async function prepareVideo(file, onProgress) {
  const MB = await loadMediabunny();
  const input = new MB.Input({ source: new MB.BlobSource(file), formats: MB.ALL_FORMATS });
  let videoTrack;
  let audioTrack;
  let duration;
  try {
    videoTrack = await input.getPrimaryVideoTrack();
    audioTrack = await input.getPrimaryAudioTrack();
    duration = await input.computeDuration();
  } catch (error) {
    console.warn('Unreadable video:', error);
    throw new Error(VIDEO_UNREADABLE);
  }
  if (!videoTrack) {
    throw new Error('This file has no video in it.');
  }
  if (duration > VIDEO_MAX_SECONDS) {
    throw new Error(`This video is ${Math.round(duration)} seconds long. Use a video of up to 3 minutes, or trim it on the phone first.`);
  }

  const codec = await videoTrack.getCodec();
  const width = await videoTrack.getDisplayWidth();
  const height = await videoTrack.getDisplayHeight();
  const audioCodec = audioTrack ? await audioTrack.getCodec() : null;
  const copyAudio = audioCodec === 'aac';
  if (audioTrack && !copyAudio) {
    await ensureAacEncoder(MB);
  }
  const audio = audioTrack ? (copyAudio ? {} : { codec: 'aac', bitrate: AUDIO_BITRATE }) : { discard: true };

  // H.264 that is small enough is only repackaged as MP4: no quality loss, and fast even on old phones
  if (codec === 'avc' && file.size <= VIDEO_MAX_BYTES && Math.max(width, height) <= VIDEO_COPY_MAX_SIDE) {
    const buffer = await convert(MB, file, { video: {}, audio }, onProgress);
    if (buffer.byteLength <= VIDEO_MAX_BYTES) {
      return { video: new Blob([buffer], { type: 'video/mp4' }), poster: await posterFrame(MB, buffer, duration), duration, converted: false };
    }
  }

  if (!(await videoTrack.canDecode())) {
    throw new Error(VIDEO_NOT_CONVERTIBLE);
  }
  const scale = Math.min(1, VIDEO_MAX_SIDE / Math.max(width, height));
  const outWidth = even(width * scale);
  const outHeight = even(height * scale);
  const audioBudget = audioTrack ? (copyAudio ? COPIED_AUDIO_BITRATE : AUDIO_BITRATE) : 0;
  let bitrate = Math.min(VIDEO_MAX_BITRATE, Math.max(VIDEO_MIN_BITRATE, VIDEO_TARGET_BYTES * 8 / duration - audioBudget));
  if (!(await MB.canEncodeVideo('avc', { width: outWidth, height: outHeight, bitrate }))) {
    throw new Error(VIDEO_NOT_CONVERTIBLE);
  }

  // Encoders can overshoot the target bitrate, so retry once at a lower rate if the result is too big
  for (let attempt = 1; attempt <= 2; attempt++) {
    const video = { codec: 'avc', width: outWidth, height: outHeight, fit: 'fill', bitrate, forceTranscode: true };
    const buffer = await convert(MB, file, { video, audio }, onProgress);
    if (buffer.byteLength <= VIDEO_MAX_BYTES) {
      return { video: new Blob([buffer], { type: 'video/mp4' }), poster: await posterFrame(MB, buffer, duration), duration, converted: true };
    }
    bitrate = Math.max(VIDEO_MIN_BITRATE / 2, bitrate * VIDEO_TARGET_BYTES / buffer.byteLength * 0.85);
  }
  throw new Error('This video is still larger than 25 MB after compressing. Use a shorter video.');
}

window.GiftVideo = { prepareVideo, VIDEO_MAX_BYTES };
