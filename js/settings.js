/**
 * Settings — manages player preferences
 */
const Settings = (() => {
  function load() {
    const s = DB.getSettings();
    document.getElementById('vol-music').value = s.musicVol;
    document.getElementById('vol-music-val').textContent = s.musicVol + '%';
    document.getElementById('vol-sfx').value = s.sfxVol;
    document.getElementById('vol-sfx-val').textContent = s.sfxVol + '%';
    document.getElementById('note-speed').value = s.noteSpeed;
    document.getElementById('note-speed-val').textContent = s.noteSpeed + 'x';
    const vibeBtn = document.getElementById('toggle-vibe');
    vibeBtn.textContent = s.vibration ? 'ON' : 'OFF';
    vibeBtn.classList.toggle('off', !s.vibration);
    // Apply theme
    document.body.setAttribute('data-theme', s.theme || 'dark');
    document.querySelectorAll('.theme-opt').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.theme === s.theme);
    });
  }

  function setSpeed(val) {
    document.getElementById('note-speed-val').textContent = parseFloat(val).toFixed(1) + 'x';
    DB.saveSettings({ noteSpeed: parseFloat(val) });
  }

  function toggleVibe() {
    const s = DB.getSettings();
    const newVal = !s.vibration;
    DB.saveSettings({ vibration: newVal });
    const btn = document.getElementById('toggle-vibe');
    btn.textContent = newVal ? 'ON' : 'OFF';
    btn.classList.toggle('off', !newVal);
  }

  function setTheme(theme) {
    DB.saveSettings({ theme });
    document.body.setAttribute('data-theme', theme);
    document.querySelectorAll('.theme-opt').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.theme === theme);
    });
  }

  function getSpeed() {
    return DB.getSettings().noteSpeed || 2.5;
  }

  function vibrate(ms = 20) {
    if (DB.getSettings().vibration && navigator.vibrate) {
      navigator.vibrate(ms);
    }
  }

  return { load, setSpeed, toggleVibe, setTheme, getSpeed, vibrate };
})();