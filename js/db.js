/**
 * DB — localStorage-based persistence (simulates db.json)
 * Stores songs, scores, settings, coins, wins
 */
const DB = (() => {
  const KEY = 'tilebeats_db';

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
    adminKey: 'ADMIN-2024-TILEBEATS'   // default key — change in admin
  };

  let data = null;

  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      data = raw ? { ...defaults, ...JSON.parse(raw) } : { ...defaults };
      // Merge nested objects
      data.settings = { ...defaults.settings, ...data.settings };
      data.appConfig = { ...defaults.appConfig, ...data.appConfig };
    } catch (e) {
      data = { ...defaults };
    }
  }

  function save() {
    localStorage.setItem(KEY, JSON.stringify(data));
  }

  function get() {
    if (!data) load();
    return data;
  }

  function getSongs() {
    return get().songs;
  }

  function getSong(id) {
    return getSongs().find(s => s.id === id);
  }

  function addSong(song) {
    const db = get();
    song.id = 'song_' + Date.now() + '_' + Math.random().toString(36).slice(2,6);
    song.addedAt = Date.now();
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

  function deleteSong(id) {
    const db = get();
    db.songs = db.songs.filter(s => s.id !== id);
    delete db.scores[id];
    save();
  }

  function getBestScore(songId) {
    return get().scores[songId] || null;
  }

  function saveScore(songId, result) {
    const db = get();
    const current = db.scores[songId];
    if (!current || result.score > current.score) {
      db.scores[songId] = result;
    }
    // Add coins
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

  // Seed sample songs (demo tiles without real audio)
  function seedIfEmpty() {
    const db = get();
    if (db.songs.length === 0) {
      // We'll add demo songs that use beat detection
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

  // Generate demo tile pattern (for testing without real audio)
  function generateDemoTiles(bpm, difficulty) {
    const tiles = [];
    const beatInterval = 60 / bpm;
    const totalDuration = 30; // 30 seconds
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

  load();
  seedIfEmpty();

  return { get, getSongs, getSong, addSong, updateSong, deleteSong, getBestScore, saveScore, getStats, getSettings, saveSettings, getAppConfig, saveAppConfig, checkAdminKey, generateDemoTiles };
})();