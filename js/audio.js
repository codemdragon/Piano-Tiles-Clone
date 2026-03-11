/**
 * Audio — manages music playback and SFX
 */
const Audio = (() => {
  let ctx = null;
  let musicSource = null;
  let musicBuffer = null;
  let musicGain = null;
  let sfxGain = null;
  let startTime = 0;
  let pauseOffset = 0;
  let isPlaying = false;
  let onEndCallback = null;

  function ensureCtx() {
    if (!ctx) {
      ctx = new (window.AudioContext || window.webkitAudioContext)();
      musicGain = ctx.createGain();
      sfxGain = ctx.createGain();
      musicGain.connect(ctx.destination);
      sfxGain.connect(ctx.destination);
      const s = DB.getSettings();
      musicGain.gain.value = s.musicVol / 100;
      sfxGain.gain.value = s.sfxVol / 100;
    }
    if (ctx.state === 'suspended') ctx.resume();
  }

  async function loadBuffer(dataUrl) {
    ensureCtx();
    const response = await fetch(dataUrl);
    const arrayBuffer = await response.arrayBuffer();
    return ctx.decodeAudioData(arrayBuffer);
  }

  async function playMusic(dataUrl, offset = 0) {
    ensureCtx();
    stop();
    if (!dataUrl) return;
    try {
      musicBuffer = await loadBuffer(dataUrl);
      musicSource = ctx.createBufferSource();
      musicSource.buffer = musicBuffer;
      musicSource.connect(musicGain);
      musicSource.onended = () => { if (onEndCallback) onEndCallback(); };
      pauseOffset = offset;
      startTime = ctx.currentTime - offset;
      musicSource.start(0, offset);
      isPlaying = true;
    } catch (e) {
      console.warn('Audio playback error:', e);
    }
  }

  function pause() {
    if (!isPlaying || !musicSource) return;
    pauseOffset = currentTime();
    try { musicSource.stop(); } catch(e) {}
    musicSource = null;
    isPlaying = false;
  }

  function resume() {
    if (isPlaying || !musicBuffer) return;
    ensureCtx();
    musicSource = ctx.createBufferSource();
    musicSource.buffer = musicBuffer;
    musicSource.connect(musicGain);
    musicSource.onended = () => { if (onEndCallback) onEndCallback(); };
    startTime = ctx.currentTime - pauseOffset;
    musicSource.start(0, pauseOffset);
    isPlaying = true;
  }

  function stop() {
    if (musicSource) {
      try { musicSource.stop(); } catch(e) {}
      musicSource = null;
    }
    isPlaying = false;
    pauseOffset = 0;
    musicBuffer = null;
  }

  function currentTime() {
    if (!ctx) return 0;
    if (!isPlaying) return pauseOffset;
    return ctx.currentTime - startTime;
  }

  function setMusicVol(val) {
    const v = parseInt(val) / 100;
    if (musicGain) musicGain.gain.value = v;
    document.getElementById('vol-music-val').textContent = val + '%';
    DB.saveSettings({ musicVol: parseInt(val) });
  }

  function setSfxVol(val) {
    const v = parseInt(val) / 100;
    if (sfxGain) sfxGain.gain.value = v;
    document.getElementById('vol-sfx-val').textContent = val + '%';
    DB.saveSettings({ sfxVol: parseInt(val) });
  }

  function onEnd(cb) { onEndCallback = cb; }

  // Synthesized hit sound
  function playHit(type = 'perfect') {
    ensureCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(sfxGain);

    const freqs = { perfect: 1200, good: 900, miss: 200 };
    osc.frequency.value = freqs[type] || 900;
    osc.type = 'sine';
    gain.gain.setValueAtTime(0.3, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.12);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.12);
  }

  function playHold() {
    ensureCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(sfxGain);
    osc.type = 'triangle';
    osc.frequency.value = 800;
    gain.gain.setValueAtTime(0.15, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.08);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.08);
  }

  function playMiss() { playHit('miss'); }

  function getContext() { return ctx; }
  function getIsPlaying() { return isPlaying; }

  return { playMusic, pause, resume, stop, currentTime, setMusicVol, setSfxVol, onEnd, playHit, playHold, playMiss, ensureCtx, getContext, loadBuffer, getIsPlaying };
})();