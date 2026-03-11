/**
 * DB — Hybrid storage: localStorage for metadata, IndexedDB for large blobs
 * Stores songs, scores, settings, coins, wins
 */
const DB = (() => {
  const KEY = 'tilebeats_db';
  const IDB_NAME = 'tilebeats_blobs';
  const IDB_VERSION = 1;
  const STORE_NAME = 'blobs';

  let idb = null; // IndexedDB reference

  const defaults = {
    songs: [],
    scores: {},       // { songId: { score, combo, accuracy, stars } }
    coins: 0,
    wins: 0,
    totalStars: 0,
    settings: {
      musicVol: 80,
      sfxVol: 80,
      noteSpeed: 2.5,
      vibration: true,
      theme: 'dark'
    },
    appConfig: {
      title: 'TileBeats',
      tagline: 'Tap. Hold. Vibe.',
      background: 'dark',
      categories: ['Pop', 'Classical', 'EDM', 'Jazz', 'Rock']
    },
    adminKey: 'ADMIN-2024-TILEBEATS'
  };

  let data = null;

  // ── IndexedDB Setup ───────────────────────────────
  function openIDB() {
    return new Promise((resolve, reject) => {
      if (idb) { resolve(idb); return; }
      const req = indexedDB.open(IDB_NAME, IDB_VERSION);
      req.onupgradeneeded = (e) => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME);
        }
      };
      req.onsuccess = (e) => { idb = e.target.result; resolve(idb); };
      req.onerror = (e) => { console.warn('IndexedDB error:', e); reject(e); };
    });
  }

  async function blobPut(key, value) {
    const db = await openIDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).put(value, key);
      tx.oncomplete = () => resolve();
      tx.onerror = (e) => reject(e);
    });
  }

  async function blobGet(key) {
    const db = await openIDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const req = tx.objectStore(STORE_NAME).get(key);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = (e) => reject(e);
    });
  }

  async function blobDelete(key) {
    const db = await openIDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).delete(key);
      tx.oncomplete = () => resolve();
      tx.onerror = (e) => reject(e);
    });
  }

  // ── localStorage (metadata only) ──────────────────
  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      data = raw ? { ...defaults, ...JSON.parse(raw) } : { ...defaults };
      data.settings = { ...defaults.settings, ...data.settings };
      data.appConfig = { ...defaults.appConfig, ...data.appConfig };
    } catch (e) {
      data = { ...defaults };
    }
  }

  function save() {
    try {
      localStorage.setItem(KEY, JSON.stringify(data));
    } catch (e) {
      console.warn('localStorage save error:', e);
    }
  }

  function get() {
    if (!data) load();
    return data;
  }

  // ── Song CRUD ─────────────────────────────────────
  function getSongs() {
    return get().songs;
  }

  function getSong(id) {
    return getSongs().find(s => s.id === id);
  }

  /**
   * Add a song. Audio & cover blobs go to IndexedDB, metadata to localStorage.
   */
  async function addSong(song) {
    const db = get();
    song.id = 'song_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6);
    song.addedAt = Date.now();

    // Store large blobs in IndexedDB
    if (song.audioDataUrl) {
      await blobPut('audio_' + song.id, song.audioDataUrl);
      song.audioDataUrl = '__IDB__'; // placeholder
    }
    if (song.coverDataUrl) {
      await blobPut('cover_' + song.id, song.coverDataUrl);
      song.coverDataUrl = '__IDB__'; // placeholder
    }

    db.songs.push(song);
    save();
    return song;
  }

  function updateSong(id, updates) {
    const db = get();
    const idx = db.songs.findIndex(s => s.id === id);
    if (idx !== -1) {
      db.songs[idx] = { ...db.songs[idx], ...updates };
      save();
      return db.songs[idx];
    }
    return null;
  }

  async function deleteSong(id) {
    const db = get();
    db.songs = db.songs.filter(s => s.id !== id);
    delete db.scores[id];
    save();
    // Clean up blobs
    try {
      await blobDelete('audio_' + id);
      await blobDelete('cover_' + id);
    } catch (e) { /* ok */ }
  }

  /**
   * Get the audio data URL for a song. Resolves from IndexedDB if needed.
   */
  async function getSongAudio(songId) {
    const song = getSong(songId);
    if (!song) return null;
    if (song.audioDataUrl === '__IDB__') {
      return await blobGet('audio_' + songId);
    }
    return song.audioDataUrl || null;
  }

  /**
   * Get the cover image data URL for a song. Resolves from IndexedDB if needed.
   */
  async function getSongCover(songId) {
    const song = getSong(songId);
    if (!song) return null;
    if (song.coverDataUrl === '__IDB__') {
      return await blobGet('cover_' + songId);
    }
    return song.coverDataUrl || null;
  }

  // ── Scores ────────────────────────────────────────
  function getBestScore(songId) {
    return get().scores[songId] || null;
  }

  function saveScore(songId, result) {
    const db = get();
    const current = db.scores[songId];
    if (!current || result.score > current.score) {
      db.scores[songId] = result;
    }
    db.coins += result.coinsEarned || 0;
    if (result.stars === 3) db.totalStars++;
    if (result.passed) db.wins++;
    save();
    return db.scores[songId];
  }

  function getStats() {
    const db = get();
    return { coins: db.coins, wins: db.wins, stars: db.totalStars };
  }

  // ── Settings ──────────────────────────────────────
  function getSettings() {
    return get().settings;
  }

  function saveSettings(s) {
    const db = get();
    db.settings = { ...db.settings, ...s };
    save();
  }

  function getAppConfig() {
    return get().appConfig;
  }

  function saveAppConfig(cfg) {
    const db = get();
    db.appConfig = { ...db.appConfig, ...cfg };
    save();
  }

  function checkAdminKey(key) {
    return key.trim() === get().adminKey;
  }

  // ── Seed ──────────────────────────────────────────
  function seedIfEmpty() {
    const db = get();
    if (db.songs.length === 0) {
      db.songs = [
        {
          id: 'demo_1',
          title: 'Demo Beat',
          artist: 'TileBeats',
          category: 'Pop',
          difficulty: 2,
          coverEmoji: '🎹',
          coverDataUrl: null,
          audioDataUrl: null,
          tiles: generateDemoTiles(60, 2),
          bpm: 120,
          duration: 30,
          addedAt: Date.now()
        }
      ];
      save();
    }
  }

  function generateDemoTiles(bpm, difficulty) {
    const tiles = [];
    const beatInterval = 60 / bpm;
    const totalDuration = 30;
    const lanes = [0, 1, 2, 3];
    let t = 1.0;
    let prevLane = -1;

    while (t < totalDuration) {
      let lane;
      do { lane = lanes[Math.floor(Math.random() * 4)]; } while (lane === prevLane);
      prevLane = lane;

      const isHold = difficulty >= 3 && Math.random() < 0.2;
      tiles.push({
        time: parseFloat(t.toFixed(3)),
        lane,
        type: isHold ? 'hold' : 'tap',
        duration: isHold ? beatInterval * 1.5 : 0
      });

      const step = beatInterval * (Math.random() < 0.3 ? 0.5 : 1);
      t += step;
    }
    return tiles;
  }

  // ── Init ──────────────────────────────────────────
  load();
  seedIfEmpty();
  openIDB().catch(e => console.warn('IDB init:', e));

  return {
    get, getSongs, getSong, addSong, updateSong, deleteSong,
    getBestScore, saveScore, getStats,
    getSettings, saveSettings, getAppConfig, saveAppConfig,
    checkAdminKey, generateDemoTiles,
    getSongAudio, getSongCover
  };
})();