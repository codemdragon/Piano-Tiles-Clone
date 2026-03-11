/**
 * Admin — song management, upload, app settings
 */
const Admin = (() => {
  let authenticated = false;
  let editingSongId = null;

  // ── Auth ──────────────────────────────────────────
  function reset() {
    if (!authenticated) {
      document.getElementById('admin-auth').classList.remove('hidden');
      document.getElementById('admin-panel').classList.add('hidden');
    } else {
      document.getElementById('admin-auth').classList.add('hidden');
      document.getElementById('admin-panel').classList.remove('hidden');
      refreshSongList();
    }
    document.getElementById('auth-error').classList.add('hidden');
    document.getElementById('admin-key-input').value = '';
  }

  function authenticate() {
    const key = document.getElementById('admin-key-input').value;
    if (DB.checkAdminKey(key)) {
      authenticated = true;
      document.getElementById('admin-auth').classList.add('hidden');
      document.getElementById('admin-panel').classList.remove('hidden');
      refreshSongList();
      App.toast('🔓 Admin unlocked');
    } else {
      document.getElementById('auth-error').classList.remove('hidden');
    }
  }

  // ── Tabs ──────────────────────────────────────────
  function switchTab(tab) {
    document.querySelectorAll('.admin-tab').forEach(t => t.classList.remove('active'));
    document.querySelector(`.admin-tab[data-tab="${tab}"]`).classList.add('active');
    document.querySelectorAll('.admin-tab-content').forEach(c => c.classList.add('hidden'));
    document.getElementById('admin-tab-' + tab).classList.remove('hidden');

    if (tab === 'songs') refreshSongList();
    if (tab === 'settings') loadAppSettings();
  }

  // ── Song List ─────────────────────────────────────
  function refreshSongList() {
    const songs = DB.getSongs();
    const list = document.getElementById('admin-song-list');

    if (songs.length === 0) {
      list.innerHTML = `
        <div class="no-songs">
          <div class="ns-icon">📂</div>
          <h3>No songs yet</h3>
          <p>Go to the Upload tab to add your first song!</p>
        </div>`;
      return;
    }

    list.innerHTML = songs.map(s => `
      <div class="admin-song-item">
        <div class="asi-cover">
          ${s.coverDataUrl ? `<img src="${s.coverDataUrl}" alt="">` : (s.coverEmoji || '🎵')}
        </div>
        <div class="asi-info">
          <div class="asi-title">${esc(s.title)}</div>
          <div class="asi-sub">${esc(s.artist || 'Unknown')} · ${esc(s.category || 'General')} · ${s.tiles ? s.tiles.length : 0} tiles</div>
        </div>
        <button class="asi-edit" onclick="Admin.editSong('${s.id}')">Edit</button>
      </div>
    `).join('');
  }

  // ── Edit Song ─────────────────────────────────────
  function editSong(id) {
    const song = DB.getSong(id);
    if (!song) return;
    editingSongId = id;
    document.getElementById('edit-title').value = song.title || '';
    document.getElementById('edit-artist').value = song.artist || '';
    document.getElementById('edit-category').value = song.category || '';
    document.getElementById('edit-difficulty').value = song.difficulty || 3;
    document.getElementById('edit-diff-val').textContent = song.difficulty || 3;
    document.getElementById('edit-song-id').value = id;
    document.getElementById('overlay-edit').classList.remove('hidden');
  }

  function saveEdit() {
    if (!editingSongId) return;
    const updates = {
      title: document.getElementById('edit-title').value.trim() || 'Untitled',
      artist: document.getElementById('edit-artist').value.trim(),
      category: document.getElementById('edit-category').value.trim(),
      difficulty: parseInt(document.getElementById('edit-difficulty').value) || 3
    };
    DB.updateSong(editingSongId, updates);
    App.closeOverlay('overlay-edit');
    refreshSongList();
    App.toast('✅ Song updated');
    editingSongId = null;
  }

  function deleteSong() {
    if (!editingSongId) return;
    if (!confirm('Delete this song permanently?')) return;
    DB.deleteSong(editingSongId);
    App.closeOverlay('overlay-edit');
    refreshSongList();
    App.toast('🗑 Song deleted');
    editingSongId = null;
  }

  // ── Upload / Analyze ──────────────────────────────
  function previewImage(input) {
    const file = input.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = document.getElementById('img-preview');
      img.src = e.target.result;
      img.classList.remove('hidden');
    };
    reader.readAsDataURL(file);
  }

  function previewAudio(input) {
    const file = input.files[0];
    if (!file) return;
    document.getElementById('mp3-name').textContent = file.name;
  }

  async function analyzAndUpload() {
    const title = document.getElementById('up-title').value.trim();
    const audioFile = document.getElementById('up-audio').files[0];

    if (!title) { App.toast('⚠ Enter a song title'); return; }
    if (!audioFile) { App.toast('⚠ Select an MP3 file'); return; }

    const artist = document.getElementById('up-artist').value.trim();
    const category = document.getElementById('up-category').value.trim();
    const difficulty = parseInt(document.getElementById('up-difficulty').value) || 3;
    const sensitivity = parseInt(document.getElementById('up-sensitivity').value) || 120;

    // Show progress
    const prog = document.getElementById('upload-progress');
    const progFill = document.getElementById('upload-progress-fill');
    const progText = document.getElementById('upload-progress-text');
    const btn = document.getElementById('upload-btn-text');
    prog.classList.remove('hidden');
    btn.textContent = '⏳ Analyzing...';

    try {
      // Read audio as data URL
      const audioDataUrl = await fileToDataUrl(audioFile);
      progFill.style.width = '10%';
      progText.textContent = 'Reading audio...';

      // Read cover image if provided
      let coverDataUrl = null;
      const imgFile = document.getElementById('up-image').files[0];
      if (imgFile) {
        coverDataUrl = await fileToDataUrl(imgFile);
      }
      progFill.style.width = '15%';

      // Beat detection
      const result = await BeatDetect.analyze(audioDataUrl, sensitivity, (pct, msg) => {
        progFill.style.width = pct + '%';
        progText.textContent = msg;
      });

      progFill.style.width = '98%';
      progText.textContent = `Found ${result.tiles.length} tiles! Saving...`;

      // Save to DB
      const song = {
        title,
        artist,
        category,
        difficulty,
        coverEmoji: '🎵',
        coverDataUrl,
        audioDataUrl,
        tiles: result.tiles,
        bpm: null,
        duration: result.duration
      };

      DB.addSong(song);

      progFill.style.width = '100%';
      progText.textContent = '✅ Song added!';
      App.toast(`🎵 "${title}" added with ${result.tiles.length} tiles`);

      // Reset form
      setTimeout(() => {
        resetUploadForm();
        switchTab('songs');
      }, 1200);

    } catch (err) {
      console.error('Upload error:', err);
      progText.textContent = '❌ Error: ' + err.message;
      App.toast('⚠ Upload failed — ' + err.message);
    } finally {
      btn.textContent = '🎹 Analyze & Add Song';
    }
  }

  function resetUploadForm() {
    document.getElementById('up-title').value = '';
    document.getElementById('up-artist').value = '';
    document.getElementById('up-category').value = '';
    document.getElementById('up-difficulty').value = 3;
    document.getElementById('up-diff-val').textContent = '3';
    document.getElementById('up-sensitivity').value = 120;
    document.getElementById('up-sens-val').textContent = '120';
    document.getElementById('up-image').value = '';
    document.getElementById('up-audio').value = '';
    document.getElementById('img-preview').classList.add('hidden');
    document.getElementById('mp3-name').textContent = 'Tap to select MP3';
    document.getElementById('upload-progress').classList.add('hidden');
    document.getElementById('upload-progress-fill').style.width = '0%';
  }

  function fileToDataUrl(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(new Error('Failed to read file'));
      reader.readAsDataURL(file);
    });
  }

  // ── App Settings ──────────────────────────────────
  function loadAppSettings() {
    const cfg = DB.getAppConfig();
    document.getElementById('as-title').value = cfg.title || 'TileBeats';
    document.getElementById('as-tagline').value = cfg.tagline || 'Tap. Hold. Vibe.';
    document.getElementById('as-categories').value = (cfg.categories || []).join(', ');

    document.querySelectorAll('#admin-tab-settings .theme-opt').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.bg === (cfg.background || 'dark'));
    });
  }

  function setBg(bg, btn) {
    document.querySelectorAll('#admin-tab-settings .theme-opt').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
  }

  function saveSettings() {
    const cfg = {
      title: document.getElementById('as-title').value.trim() || 'TileBeats',
      tagline: document.getElementById('as-tagline').value.trim() || 'Tap. Hold. Vibe.',
      categories: document.getElementById('as-categories').value.split(',').map(c => c.trim()).filter(Boolean),
      background: document.querySelector('#admin-tab-settings .theme-opt.active')?.dataset.bg || 'dark'
    };
    DB.saveAppConfig(cfg);
    App.toast('💾 Settings saved');
  }

  // ── Helpers ───────────────────────────────────────
  function esc(str) {
    return str ? str.replace(/</g, '&lt;').replace(/>/g, '&gt;') : '';
  }

  return {
    reset, authenticate, switchTab,
    refreshSongList, editSong, saveEdit, deleteSong,
    previewImage, previewAudio, analyzAndUpload,
    setBg, saveSettings
  };
})();
