/**
 * App — main controller, screen routing, UI orchestration
 */
const App = (() => {
  let currentScreen = null;
  let toastTimer = null;

  function init() {
    Game.init();
    Settings.load();
    applyAppConfig();

    // Simulate preloader
    const fill = document.querySelector('.preloader-fill');
    const text = document.querySelector('.preloader-text');
    const steps = ['Loading assets...', 'Preparing engine...', 'Ready!'];
    let step = 0;
    const interval = setInterval(() => {
      step++;
      if (step < steps.length) text.textContent = steps[step];
    }, 600);

    setTimeout(() => {
      clearInterval(interval);
      document.getElementById('preloader').style.opacity = '0';
      document.getElementById('preloader').style.transition = 'opacity 0.4s';
      setTimeout(() => {
        document.getElementById('preloader').style.display = 'none';
        showMenu();
      }, 400);
    }, 1800);
  }

  function applyAppConfig() {
    const cfg = DB.getAppConfig();
    document.querySelectorAll('.preloader-title').forEach(el => el.textContent = cfg.title);
    const h1 = document.querySelector('.menu-logo h1');
    if (h1) h1.textContent = cfg.title;
    const tagEl = document.querySelector('.tagline');
    if (tagEl) tagEl.textContent = cfg.tagline;
    document.title = cfg.title;
  }

  function showScreen(id) {
    document.querySelectorAll('.screen').forEach(s => s.classList.add('hidden'));
    const el = document.getElementById(id);
    el.classList.remove('hidden');
    el.classList.remove('screen-enter');
    void el.offsetWidth;
    el.classList.add('screen-enter');
    currentScreen = id;
  }

  function showMenu() {
    updateMenuStats();
    showScreen('screen-menu');
  }

  function updateMenuStats() {
    const stats = DB.getStats();
    document.getElementById('menu-coins').textContent = stats.coins.toLocaleString();
    document.getElementById('menu-wins').textContent = stats.wins.toLocaleString();
    document.getElementById('menu-stars').textContent = stats.totalStars.toLocaleString();
    document.getElementById('select-coins').textContent = stats.coins.toLocaleString();
  }

  function showSongSelect() {
    buildCategoryTabs();
    renderSongGrid('all');
    updateMenuStats();
    showScreen('screen-select');
  }

  function buildCategoryTabs() {
    const cfg = DB.getAppConfig();
    const songs = DB.getSongs();
    const cats = new Set(['all']);
    songs.forEach(s => { if (s.category) cats.add(s.category); });
    cfg.categories.forEach(c => cats.add(c));

    const tabsEl = document.getElementById('category-tabs');
    tabsEl.innerHTML = [...cats].map(cat => `
      <button class="cat-tab ${cat === 'all' ? 'active' : ''}" data-cat="${cat}" onclick="App.filterSongs('${cat}', this)">
        ${cat === 'all' ? 'All' : cat}
      </button>
    `).join('');
  }

  function filterSongs(cat, btn) {
    document.querySelectorAll('.cat-tab').forEach(t => t.classList.remove('active'));
    if (btn) btn.classList.add('active');
    renderSongGrid(cat);
  }

  function renderSongGrid(cat) {
    const songs = DB.getSongs();
    const filtered = cat === 'all' ? songs : songs.filter(s => s.category === cat);
    const grid = document.getElementById('song-grid');

    if (filtered.length === 0) {
      grid.innerHTML = `
        <div class="no-songs">
          <div class="ns-icon">🎵</div>
          <h3>No songs here yet</h3>
          <p>Add songs from the Admin panel to start playing!</p>
          <br>
          <button class="btn-secondary" onclick="App.showAdmin()" style="width:auto;padding:12px 24px">Open Admin Panel</button>
        </div>`;
      return;
    }

    grid.innerHTML = filtered.map(song => {
      const best = DB.getBestScore(song.id);
      const stars = best ? '★'.repeat(best.stars) + '☆'.repeat(3 - best.stars) : '';
      const bestScore = best ? best.score.toLocaleString() : null;
      const diffDots = Array.from({length: 5}, (_, i) =>
        `<span class="diff-dot ${i < (song.difficulty || 1) ? 'active' : 'inactive'}"></span>`
      ).join('');

      return `
        <div class="song-card" onclick="App.startSong('${song.id}')">
          <div class="song-cover">
            ${song.coverDataUrl ? `<img src="${song.coverDataUrl}" alt="">` : (song.coverEmoji || '🎵')}
          </div>
          <div class="song-info">
            <div class="song-title">${esc(song.title)}</div>
            <div class="song-artist">${esc(song.artist || 'Unknown Artist')}</div>
            <div class="song-meta">
              <span class="song-cat">${esc(song.category || 'General')}</span>
              <span class="song-diff">${diffDots}</span>
            </div>
          </div>
          <div class="song-arrow">›</div>
          ${bestScore ? `<div class="song-best">${stars}<br>${bestScore}</div>` : ''}
        </div>
      `;
    }).join('');
  }

  async function startSong(id) {
    const song = DB.getSong(id);
    if (!song) { toast('Song not found'); return; }
    if (!song.audioDataUrl) { toast('⚠ Demo song — add real audio in Admin'); return; }

    Audio.ensureCtx();
    showScreen('screen-game');
    await Game.load(song);
    Game.start();
  }

  function showAdmin() {
    Admin.reset();
    showScreen('screen-admin');
  }

  function showSettings() {
    Settings.load();
    document.getElementById('overlay-settings').classList.remove('hidden');
  }

  function showLeaderboard() {
    const songs = DB.getSongs();
    if (songs.length === 0) { toast('No songs played yet!'); return; }
    const lines = songs
      .map(s => {
        const b = DB.getBestScore(s.id);
        return b ? `${s.title}: ${b.score.toLocaleString()} (${b.accuracy}%)` : null;
      })
      .filter(Boolean)
      .join('\n');
    alert('🏆 Your Best Scores\n\n' + (lines || 'No scores yet!'));
  }

  function closeOverlay(id) {
    document.getElementById(id).classList.add('hidden');
  }

  function toast(msg, duration = 2500) {
    if (toastTimer) clearTimeout(toastTimer);
    const el = document.getElementById('toast');
    el.textContent = msg;
    el.classList.remove('hidden');
    toastTimer = setTimeout(() => el.classList.add('hidden'), duration);
  }

  function esc(str) {
    return str ? str.replace(/</g, '&lt;').replace(/>/g, '&gt;') : '';
  }

  // Expose filter for tabs
  window.App = { showMenu, showSongSelect, showAdmin, showSettings, showLeaderboard, startSong, filterSongs, buildCategoryTabs, closeOverlay, toast, init };

  return window.App;
})();

// Boot
window.addEventListener('DOMContentLoaded', () => App.init());