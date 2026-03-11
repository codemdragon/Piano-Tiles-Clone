/**
 * BeatDetect — analyzes MP3 audio buffer and extracts tile timings
 * Uses offline audio context + FFT for beat/onset detection
 */
const BeatDetect = (() => {

  async function analyze(audioDataUrl, sensitivity = 120, onProgress) {
    const response = await fetch(audioDataUrl);
    const arrayBuffer = await response.arrayBuffer();

    // Decode with offline context at lower sample rate for speed
    const tmpCtx = new (window.AudioContext || window.webkitAudioContext)();
    const audioBuffer = await tmpCtx.decodeAudioData(arrayBuffer.slice(0));
    tmpCtx.close();

    const duration = audioBuffer.duration;
    if (onProgress) onProgress(20, 'Decoded audio...');

    const tiles = await extractBeats(audioBuffer, sensitivity, onProgress);
    if (onProgress) onProgress(95, 'Building tile map...');

    return { tiles, duration };
  }

  async function extractBeats(audioBuffer, sensitivity, onProgress) {
    const sampleRate = audioBuffer.sampleRate;
    const data = audioBuffer.getChannelData(0);
    const duration = audioBuffer.duration;

    // Window size for energy analysis (~23ms at 44100)
    const windowSize = 1024;
    const hopSize = 512;
    const numWindows = Math.floor((data.length - windowSize) / hopSize);

    const energies = [];
    for (let i = 0; i < numWindows; i++) {
      let energy = 0;
      const offset = i * hopSize;
      for (let j = 0; j < windowSize; j++) {
        energy += data[offset + j] ** 2;
      }
      energies.push(energy / windowSize);
    }

    if (onProgress) onProgress(50, 'Analyzing energy...');

    // Compute local average energy for beat detection
    const avgWindow = 43; // ~0.5 second context
    const tiles = [];
    const lanes = [0, 1, 2, 3];
    let lastBeatTime = -0.3;
    let prevLane = -1;
    const minInterval = 0.15; // min 150ms between tiles

    const thresh = sensitivity / 100; // normalize
    const C = thresh * 1.3; // multiplier vs local average

    for (let i = avgWindow; i < energies.length - avgWindow; i++) {
      let localAvg = 0;
      for (let k = i - avgWindow; k < i + avgWindow; k++) {
        localAvg += energies[k];
      }
      localAvg /= (avgWindow * 2);

      const time = (i * hopSize) / sampleRate;
      if (time - lastBeatTime < minInterval) continue;

      if (energies[i] > C * localAvg && energies[i] > energies[i - 1] && energies[i] > energies[i + 1]) {
        // Beat detected — pick lane
        let lane;
        do { lane = lanes[Math.floor(Math.random() * 4)]; } while (lane === prevLane);
        prevLane = lane;
        lastBeatTime = time;

        // Decide hold vs tap
        const isHold = Math.random() < 0.12; // ~12% holds
        const holdDur = isHold ? (0.15 + Math.random() * 0.3) : 0;

        tiles.push({
          time: parseFloat(time.toFixed(3)),
          lane,
          type: isHold ? 'hold' : 'tap',
          duration: parseFloat(holdDur.toFixed(3))
        });
      }
    }

    if (onProgress) onProgress(80, `Found ${tiles.length} beats...`);

    // Ensure minimum tile count
    if (tiles.length < 10) {
      return generateFallbackTiles(duration);
    }

    return tiles;
  }

  // Fallback: generate metronome-style tiles if beat detection fails
  function generateFallbackTiles(duration) {
    const tiles = [];
    const interval = 0.5;
    let t = 0.8;
    let prevLane = -1;
    while (t < duration - 1) {
      let lane;
      do { lane = Math.floor(Math.random() * 4); } while (lane === prevLane);
      prevLane = lane;
      tiles.push({ time: parseFloat(t.toFixed(3)), lane, type: 'tap', duration: 0 });
      t += interval + (Math.random() * 0.2 - 0.1);
    }
    return tiles;
  }

  return { analyze };
})();