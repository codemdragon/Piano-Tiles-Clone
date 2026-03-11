/**
 * Game — Piano Tiles core engine
 * Canvas-based rendering with tap & hold tile support
 */
const Game = (() => {
  // ── State ──────────────────────────────────────────
  let canvas, ctx2d, wrap;
  let W = 0, H = 0;
  let song = null;
  let tiles = [];         // working copy with state
  let activeTouches = {}; // touchId → { lane, tileIdx }

  let gameState = 'idle'; // idle | playing | paused | ended
  let songStartTime = 0;  // audio time when song started
  let gameTime = 0;

  let score = 0;
  let combo = 0;
  let maxCombo = 0;
  let coinsEarned = 0;
  let perfectCount = 0;
  let goodCount = 0;
  let missCount = 0;
  let totalTiles = 0;

  let raf = null;
  let lastFrame = 0;

  // ── Constants ──────────────────────────────────────
  const LANES = 4;
  const PERFECT_WINDOW = 0.07;   // ±70ms
  const GOOD_WINDOW    = 0.14;   // ±140ms
  const MISS_WINDOW    = 0.30;   // miss after 300ms
  const TILE_COLOR_BLACK = '#1a1a2e';
  const TILE_COLOR_ACTIVE = '#7c5cfc';
  const TILE_COLOR_HOLD = '#22d3ee';
  const HIT_LINE_RATIO = 0.82;   // hit line is 82% down the canvas

  // Theme-aware colours
  const LANE_COLORS = ['#7c5cfc','#a855f7','#22d3ee','#4ade80'];

  // ── Initialization ─────────────────────────────────
  function init() {
    canvas = document.getElementById('game-canvas');
    ctx2d = canvas.getContext('2d');
    wrap = document.getElementById('game-canvas-wrap');

    // Touch / pointer events on the key indicators row
    const keyRow = document.getElementById('key-indicators');
    keyRow.addEventListener('touchstart', onTouchStart, { passive: false });
    keyRow.addEventListener('touchend', onTouchEnd, { passive: false });
    keyRow.addEventListener('touchcancel', onTouchEnd, { passive: false });
    canvas.addEventListener('touchstart', onTouchStart, { passive: false });
    canvas.addEventListener('touchend', onTouchEnd, { passive: false });
    canvas.addEventListener('touchcancel', onTouchEnd, { passive: false });

    // Mouse fallback for desktop testing
    canvas.addEventListener('mousedown', onMouseDown);
    canvas.addEventListener('mouseup', onMouseUp);
    keyRow.addEventListener('mousedown', onMouseDown);
    keyRow.addEventListener('mouseup', onMouseUp);

    // Lane dividers
    const lo = document.getElementById('lane-overlay');
    lo.innerHTML = Array.from({length: LANES}, () => '<div class="lane-divider"></div>').join('');

    resize();
    window.addEventListener('resize', resize);
    Audio.onEnd(onSongEnd);
  }

  function resize() {
    const rect = wrap.getBoundingClientRect();
    W = rect.width;
    H = rect.height;
    canvas.width = W * devicePixelRatio;
    canvas.height = H * devicePixelRatio;
    canvas.style.width = W + 'px';
    canvas.style.height = H + 'px';
    ctx2d.scale(devicePixelRatio, devicePixelRatio);

    // Update hit line CSS position
    const hitLineEl = document.querySelector('.hit-line');
    if (hitLineEl) hitLineEl.style.bottom = ((1 - HIT_LINE_RATIO) * H + 64) + 'px';
  }

  // ── Load Song ──────────────────────────────────────
  async function load(songData) {
    song = songData;
    tiles = song.tiles.map((t, i) => ({ ...t, idx: i, hit: false, missed: false, holding: false, holdProgress: 0 }));
    totalTiles = tiles.length;
    resetStats();
    document.getElementById('hud-title').textContent = song.title;
    document.getElementById('progress-bar').style.width = '0%';
    updateHUD();
  }

  // ── Start ──────────────────────────────────────────
  async function start() {
    if (!song) return;
    gameState = 'playing';
    songStartTime = 0;
    gameTime = 0;

    // Preroll: 2 seconds before music to show tiles
    const preroll = 2.0;
    setTimeout(async () => {
      if (gameState !== 'playing') return;
      if (song.audioDataUrl) {
        await Audio.playMusic(song.audioDataUrl, 0);
      }
    }, preroll * 1000);

    songStartTime = performance.now() / 1000 - (-preroll);
    lastFrame = performance.now();
    raf = requestAnimationFrame(gameLoop);
  }

  function resetStats() {
    score = 0; combo = 0; maxCombo = 0; coinsEarned = 0;
    perfectCount = 0; goodCount = 0; missCount = 0;
  }

  // ── Game Loop ──────────────────────────────────────
  function gameLoop(timestamp) {
    if (gameState !== 'playing') return;
    const dt = (timestamp - lastFrame) / 1000;
    lastFrame = timestamp;
    gameTime = timestamp / 1000 - songStartTime;

    checkMisses();
    updateProgress();
    render();

    raf = requestAnimationFrame(gameLoop);
  }

  // ── Rendering ──────────────────────────────────────
  function render() {
    ctx2d.clearRect(0, 0, W, H);

    const laneW = W / LANES;
    const hitY = H * HIT_LINE_RATIO;
    const speed = Settings.getSpeed();
    const pixelsPerSecond = H * 0.45 * speed;

    // Draw lane backgrounds alternating
    for (let i = 0; i < LANES; i++) {
      ctx2d.fillStyle = i % 2 === 0 ? 'rgba(0,0,0,0.15)' : 'rgba(0,0,0,0.05)';
      ctx2d.fillRect(i * laneW, 0, laneW, H);
    }

    // Draw tiles
    for (const tile of tiles) {
      if (tile.hit || tile.missed) continue;

      const dt = tile.time - gameTime;
      const tileY = hitY + dt * pixelsPerSecond;
      const tileH = 64;
      const tileW = laneW - 6;
      const tileX = tile.lane * laneW + 3;

      // Skip off-screen
      if (tileY > H + 100 || tileY + tileH < -200) continue;

      if (tile.type === 'hold') {
        const holdPx = tile.duration * pixelsPerSecond;
        const top = tileY - holdPx;
        const totalH = holdPx + tileH;

        // Hold body
        const grad = ctx2d.createLinearGradient(0, top, 0, top + totalH);
        grad.addColorStop(0, 'rgba(34,211,238,0.2)');
        grad.addColorStop(1, 'rgba(34,211,238,0.5)');
        ctx2d.fillStyle = grad;
        ctx2d.beginPath();
        roundRect(ctx2d, tileX + tileW * 0.2, top, tileW * 0.6, totalH, 8);
        ctx2d.fill();

        // Hold head
        ctx2d.fillStyle = tile.holding ? '#fff' : TILE_COLOR_HOLD;
        ctx2d.shadowColor = TILE_COLOR_HOLD;
        ctx2d.shadowBlur = tile.holding ? 20 : 10;
        ctx2d.beginPath();
        roundRect(ctx2d, tileX, tileY, tileW, tileH, 12);
        ctx2d.fill();
        ctx2d.shadowBlur = 0;

        // Hold progress bar if active
        if (tile.holding) {
          const prog = Math.min(tile.holdProgress, 1);
          ctx2d.fillStyle = 'rgba(255,255,255,0.8)';
          ctx2d.fillRect(tileX, tileY + tileH - 6, tileW * prog, 6);
        }

      } else {
        // Tap tile
        const approaching = Math.abs(dt) < 0.3;
        const glow = approaching ? Math.max(0, 1 - Math.abs(dt) / 0.3) : 0;

        ctx2d.fillStyle = TILE_COLOR_BLACK;
        ctx2d.shadowColor = LANE_COLORS[tile.lane];
        ctx2d.shadowBlur = 4 + glow * 20;
        ctx2d.beginPath();
        roundRect(ctx2d, tileX, tileY, tileW, tileH, 12);
        ctx2d.fill();
        ctx2d.shadowBlur = 0;

        // Accent stripe
        ctx2d.fillStyle = LANE_COLORS[tile.lane];
        ctx2d.fillRect(tileX + 3, tileY + tileH - 5, tileW - 6, 5);

        // Glow overlay when approaching
        if (glow > 0.3) {
          ctx2d.fillStyle = `rgba(124,92,252,${glow * 0.15})`;
          roundRect(ctx2d, tileX, tileY, tileW, tileH, 12);
          ctx2d.fill();
        }
      }
    }

    // Update hold tiles that are being held
    for (const tile of tiles) {
      if (tile.holding) {
        const elapsed = gameTime - tile.holdStartTime;
        tile.holdProgress = elapsed / tile.duration;
        if (tile.holdProgress >= 1) {
          finishHold(tile);
        }
      }
    }
  }

  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
  }

  // ── Input ──────────────────────────────────────────
  function getLaneFromX(x) {
    return Math.floor((x / W) * LANES);
  }

  function onTouchStart(e) {
    e.preventDefault();
    Audio.ensureCtx();
    for (const touch of e.changedTouches) {
      const rect = canvas.getBoundingClientRect();
      const x = touch.clientX - rect.left;
      const lane = Math.max(0, Math.min(3, getLaneFromX(x)));
      hitLane(lane, touch.identifier);
      flashLane(lane);
    }
  }

  function onTouchEnd(e) {
    e.preventDefault();
    for (const touch of e.changedTouches) {
      releaseLane(touch.identifier);
    }
  }

  function onMouseDown(e) {
    Audio.ensureCtx();
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const lane = Math.max(0, Math.min(3, getLaneFromX(x)));
    hitLane(lane, 'mouse');
    flashLane(lane);
  }

  function onMouseUp() { releaseLane('mouse'); }

  function flashLane(lane) {
    const ind = document.querySelector(`.key-ind[data-lane="${lane}"]`);
    if (ind) {
      ind.classList.add('active');
      setTimeout(() => ind.classList.remove('active'), 100);
    }
  }

  function hitLane(lane, touchId) {
    if (gameState !== 'playing') return;

    // Find closest tile in this lane
    const now = gameTime;
    let best = null, bestDt = Infinity;

    for (const tile of tiles) {
      if (tile.hit || tile.missed || tile.holding) continue;
      if (tile.lane !== lane) continue;
      const dt = Math.abs(tile.time - now);
      if (dt < bestDt && dt < MISS_WINDOW) {
        bestDt = dt;
        best = tile;
      }
    }

    if (!best) return;

    const dt = best.time - now; // positive = early, negative = late

    if (Math.abs(dt) <= PERFECT_WINDOW) {
      if (best.type === 'hold') {
        best.holding = true;
        best.holdStartTime = now;
        best.hit = false; // don't mark hit until hold ends
        activeTouches[touchId] = { lane, tileIdx: best.idx };
        showHitEffect(lane, 'PERFECT', '#fbbf24');
        Audio.playHold();
      } else {
        registerHit(best, 'perfect');
        activeTouches[touchId] = null;
      }
    } else if (Math.abs(dt) <= GOOD_WINDOW) {
      if (best.type === 'hold') {
        best.holding = true;
        best.holdStartTime = now;
        activeTouches[touchId] = { lane, tileIdx: best.idx };
        showHitEffect(lane, 'GOOD', '#4ade80');
        Audio.playHold();
      } else {
        registerHit(best, 'good');
        activeTouches[touchId] = null;
      }
    }
    // else: miss (handled by checkMisses)
  }

  function releaseLane(touchId) {
    const touch = activeTouches[touchId];
    if (!touch) return;
    const tile = tiles.find(t => t.idx === touch.tileIdx);
    if (tile && tile.holding) {
      const elapsed = gameTime - tile.holdStartTime;
      if (elapsed >= tile.duration * 0.7) {
        finishHold(tile);
      } else {
        // Released too early = miss
        tile.holding = false;
        tile.missed = true;
        registerMiss(tile);
      }
    }
    activeTouches[touchId] = null;
  }

  function finishHold(tile) {
    if (!tile.holding) return;
    tile.holding = false;
    tile.hit = true;
    registerHit(tile, 'perfect', true);
  }

  function registerHit(tile, quality, fromHold = false) {
    if (!fromHold) tile.hit = true;
    combo++;
    maxCombo = Math.max(maxCombo, combo);

    const pts = quality === 'perfect' ? 100 : 50;
    const comboBonus = Math.floor(combo / 10) * 10;
    score += pts + comboBonus;
    coinsEarned += quality === 'perfect' ? 2 : 1;
    if (quality === 'perfect') perfectCount++; else goodCount++;

    showHitEffect(tile.lane, quality === 'perfect' ? 'PERFECT' : 'GOOD', quality === 'perfect' ? '#fbbf24' : '#4ade80');
    Audio.playHit(quality);
    Settings.vibrate(quality === 'perfect' ? 15 : 8);
    updateHUD();
  }

  function registerMiss(tile) {
    tile.missed = true;
    combo = 0;
    missCount++;
    showHitEffect(tile.lane, 'MISS', '#f87171');
    Audio.playMiss();
    updateHUD();
  }

  function checkMisses() {
    const now = gameTime;
    for (const tile of tiles) {
      if (tile.hit || tile.missed || tile.holding) continue;
      if (now - tile.time > MISS_WINDOW) {
        registerMiss(tile);
      }
    }
  }

  // ── Hit Effects ────────────────────────────────────
  function showHitEffect(lane, text, color) {
    const container = document.getElementById('hit-effects');
    const el = document.createElement('div');
    el.className = 'hit-effect';
    el.textContent = text;
    el.style.color = color;
    el.style.left = ((lane + 0.5) / LANES * 100) + '%';
    el.style.top = (HIT_LINE_RATIO * 80) + '%';
    container.appendChild(el);

    // Ripple
    const rip = document.createElement('div');
    rip.className = 'ripple-effect';
    rip.style.left = ((lane + 0.5) / LANES * 100) + '%';
    rip.style.top = (HIT_LINE_RATIO * 80) + '%';
    rip.style.background = color;
    container.appendChild(rip);

    setTimeout(() => { el.remove(); rip.remove(); }, 700);
  }

  // ── HUD Updates ────────────────────────────────────
  function updateHUD() {
    document.getElementById('score-display').textContent = score.toLocaleString();
    document.getElementById('combo-display').textContent = combo > 3 ? combo + 'x COMBO' : '';
    document.getElementById('hud-coins').textContent = coinsEarned;

    const accuracy = totalTiles > 0 ? Math.round(((perfectCount + goodCount) / Math.max(1, perfectCount + goodCount + missCount)) * 100) : 100;
    document.getElementById('accuracy-display').textContent = accuracy + '%';
  }

  function updateProgress() {
    if (!song || !song.duration) return;
    const pct = Math.min(100, (gameTime / song.duration) * 100);
    document.getElementById('progress-bar').style.width = pct + '%';

    // Update pause overlay
    document.getElementById('pause-score').textContent = score.toLocaleString();
    document.getElementById('pause-combo').textContent = maxCombo;
  }

  // ── Controls ───────────────────────────────────────
  function pause() {
    if (gameState !== 'playing') return;
    gameState = 'paused';
    Audio.pause();
    cancelAnimationFrame(raf);
    document.getElementById('overlay-pause').classList.remove('hidden');
  }

  function resume() {
    if (gameState !== 'paused') return;
    document.getElementById('overlay-pause').classList.add('hidden');
    gameState = 'playing';
    Audio.resume();
    lastFrame = performance.now();
    raf = requestAnimationFrame(gameLoop);
  }

  function restart() {
    stop();
    document.getElementById('overlay-pause').classList.add('hidden');
    if (song) {
      load(song).then(() => start());
    }
  }

  function quit() {
    stop();
    document.getElementById('overlay-pause').classList.add('hidden');
    App.showSongSelect();
  }

  function stop() {
    gameState = 'idle';
    Audio.stop();
    cancelAnimationFrame(raf);
    raf = null;
    if (ctx2d) ctx2d.clearRect(0, 0, W, H);
    document.getElementById('hit-effects').innerHTML = '';
  }

  function onSongEnd() {
    if (gameState !== 'playing') return;
    // Let remaining tiles finish (1 second grace)
    setTimeout(() => {
      if (gameState === 'playing') endGame();
    }, 1500);
  }

  function endGame() {
    gameState = 'ended';
    cancelAnimationFrame(raf);
    Audio.stop();

    // Calculate results
    const hitTiles = perfectCount + goodCount;
    const accuracy = Math.round((hitTiles / Math.max(1, hitTiles + missCount)) * 100);
    const stars = accuracy >= 100 ? 3 : accuracy >= 90 ? 3 : accuracy >= 75 ? 2 : accuracy >= 50 ? 1 : 0;
    const rank = accuracy >= 98 ? 'S' : accuracy >= 90 ? 'A' : accuracy >= 75 ? 'B' : accuracy >= 50 ? 'C' : 'D';
    const passed = accuracy >= 50;

    const result = {
      score, maxCombo, accuracy, stars, rank,
      perfectCount, goodCount, missCount,
      coinsEarned: Math.floor(coinsEarned + (accuracy / 100) * 50),
      passed
    };

    DB.saveScore(song.id, result);
    showResultScreen(result);
  }

  function showResultScreen(result) {
    document.getElementById('screen-game').classList.add('hidden');
    const rs = document.getElementById('screen-result');
    rs.classList.remove('hidden');

    document.getElementById('result-rank').textContent = result.rank;
    document.getElementById('result-title').textContent = song.title;
    document.getElementById('rs-score').textContent = result.score.toLocaleString();
    document.getElementById('rs-combo').textContent = result.maxCombo;
    document.getElementById('rs-accuracy').textContent = result.accuracy + '%';
    document.getElementById('rs-perfect').textContent = result.perfectCount;
    document.getElementById('rs-good').textContent = result.goodCount;
    document.getElementById('rs-miss').textContent = result.missCount;
    document.getElementById('result-coins').textContent = result.coinsEarned;

    // Stars
    const starEls = document.querySelectorAll('.rstar');
    starEls.forEach((el, i) => el.classList.toggle('dim', i >= result.stars));

    // Rank color
    const rankColors = { S: '#fbbf24', A: '#4ade80', B: '#22d3ee', C: '#a855f7', D: '#f87171' };
    document.getElementById('result-rank').style.background = `linear-gradient(135deg, ${rankColors[result.rank] || '#7c5cfc'}, #7c5cfc)`;
  }

  // ── Public API ─────────────────────────────────────
  return { init, load, start, pause, resume, restart, quit, stop };
})();