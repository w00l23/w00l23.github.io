/**
 * AudioVisualizerAnalyzer
 * ------------------------------------------------------------------------
 * Vanilla JS wrapper around the native Web Audio API to detect bass "hits"
 * (kick drums, beats) and voice "hits" (sung notes, vocal onsets) in real
 * time, for driving a visualizer (fireworks, blooming shapes, etc).
 *
 * Plain global script — safe to load with a normal
 * <script src="audio-visualizer-analyzer.js"></script>, including when the
 * page is opened directly as a file:// URL (ES module imports get blocked
 * by CORS in that case, so this deliberately avoids import/export).
 *
 * Usage:
 *   const viz = new AudioVisualizerAnalyzer({
 *     onBassHit:  (hit) => launchFirework(hit.ratio),
 *     onVoiceHit: (hit) => bloomHeart(hit.ratio),
 *   });
 *   viz.connectAudioElement(document.querySelector('audio'));
 *   viz.setSensitivity(0.6);   // 0.0 (strict) .. 1.0 (twitchy)
 *   viz.start();
 *
 * (Add "export" back in front of the class below if you'd rather consume
 * this as an ES module from a build pipeline instead.)
 * ------------------------------------------------------------------------
 */

/**
 * Tracks one frequency band's "energy" over time and decides when it spikes.
 *
 * The detection is the classic sound-energy algorithm:
 *
 *   1. Instant Energy  = sum of (amplitude_i)^2 for every FFT bin in range.
 *      Squaring each amplitude (rather than just summing or averaging the
 *      raw values) mirrors how acoustic energy actually scales with
 *      amplitude^2 — it makes sharp transients (a kick, a sung syllable's
 *      onset) stand out disproportionately against steady background hum,
 *      which is exactly the contrast a beat detector needs.
 *
 *   2. Local Average Energy = mean of the last N instant-energy samples
 *      (N = historyLength, ~45 frames ≈ 0.75-1s depending on frame rate).
 *      This is the band's own recent "baseline loudness" — self-calibrating
 *      to whatever track is playing, quiet or loud, instead of needing a
 *      fixed volume assumption.
 *
 *   3. Hit condition:
 *          instantEnergy > localAverageEnergy * thresholdMultiplier
 *
 *      i.e. "is this instant significantly louder, in this band, than the
 *      last second typically has been?" thresholdMultiplier is what the
 *      sensitivity slider controls (see sensitivityToThreshold below).
 *
 *   For the bass band the baseline is the mean of the quieter half of that
 *   history, and a hit must also rise sharply over the last few frames:
 *   kicks are onsets, and a plain average that includes them (and a busy
 *   bass line) sets the bar too high for most of them to clear.
 *   Silent frames are left out of the history, and a hit needs an absolute
 *   minimum of energy, so the first sound after a pause isn't a burst.
 */
class BandEnergyDetector {
  constructor({ loHz, hiHz, binHz, totalBins, historyLength = 45, cooldownMs = 150, onsetBaseline = false }) {
    this.lo = Math.max(0, Math.round(loHz / binHz));
    this.hi = Math.min(totalBins, Math.round(hiHz / binHz));
    this.historyLength = historyLength;
    this.cooldownMs = cooldownMs;
    // Kicks: compare against the band's quieter half and require a sharp
    // rise. A plain average includes the kicks themselves (and a busy bass
    // line), which lifts the bar until most kicks no longer clear it.
    this.onsetBaseline = onsetBaseline;
    this.history = [];
    this.lastHitTime = 0;
  }

  instantEnergy(freqData) {
    let sum = 0;
    for (let i = this.lo; i < this.hi; i++) {
      const amplitude = freqData[i] / 255; // byte (0-255) -> normalized 0-1
      sum += amplitude * amplitude;        // energy ~ amplitude^2
    }
    return sum;
  }

  localAverageEnergy() {
    if (this.history.length === 0) return 0;
    let sum = 0;
    for (let i = 0; i < this.history.length; i++) sum += this.history[i];
    const mean = sum / this.history.length;
    if (!this.onsetBaseline) return mean;
    // The mean of the frames at or below the mean: the band's floor between hits.
    let low = 0, n = 0;
    for (let i = 0; i < this.history.length; i++) if (this.history[i] <= mean) { low += this.history[i]; n++; }
    return n ? low / n : mean;
  }

  /**
   * Runs one analysis frame for this band. Returns a hit descriptor object
   * when a spike clears the threshold and the cooldown, otherwise null.
   */
  update(freqData, thresholdMultiplier, now) {
    const instant = this.instantEnergy(freqData);
    const level = instant / Math.max(1, this.hi - this.lo); // mean energy per bin, 0..1

    // Silence (a paused song, a quiet intro) isn't history: kept, it would
    // drag the average to zero and the first sound after it would fire a
    // burst of hits at the cooldown rate while the average caught up.
    if (level < BandEnergyDetector.SILENCE_LEVEL) return null;

    const average = this.localAverageEnergy();
    const h = this.history, n = h.length;
    const recentPeak = Math.max(h[n - 1] || 0, h[n - 2] || 0, h[n - 3] || 0);

    h.push(instant);
    if (h.length > this.historyLength) h.shift();

    // Need a third of a full history window before trusting the average —
    // otherwise the very first loud frame looks infinitely "above average".
    const warmedUp = h.length >= Math.ceil(this.historyLength / 3);

    // An absolute floor: a faint band never counts as a hit, however far
    // above its own (faint) average it is.
    const audible = level > BandEnergyDetector.HIT_FLOOR_LEVEL;
    const rising = !this.onsetBaseline || instant > recentPeak * BandEnergyDetector.ONSET_RISE;

    const isSpike = warmedUp && audible && rising && instant > average * thresholdMultiplier;
    const cooledDown = now - this.lastHitTime > this.cooldownMs;

    if (isSpike && cooledDown) {
      this.lastHitTime = now;
      return {
        instant,
        average,
        ratio: average > 0 ? instant / average : 1, // how many x the baseline this spike was
        timestamp: now,
      };
    }
    return null;
  }
}

BandEnergyDetector.SILENCE_LEVEL = 0.002;    // below this a frame is silence: skipped, not averaged in
BandEnergyDetector.HIT_FLOOR_LEVEL = 0.01;   // a hit needs at least this much energy per bin
BandEnergyDetector.ONSET_RISE = 1.25;        // onset mode: a hit must rise this far over the last 3 frames

class AudioVisualizerAnalyzer {
  /**
   * @param {Object}   [options]
   * @param {AudioContext} [options.audioContext]      Reuse an existing context instead of creating one.
   * @param {number}   [options.sensitivity=0.5]       0.0 (strict) .. 1.0 (twitchy).
   * @param {number}   [options.historyLength=45]      Rolling-average window, in frames (~1s at 45-60fps).
   * @param {number}   [options.bassCooldownMs=140]    Minimum gap between two bass hits.
   * @param {number}   [options.voiceCooldownMs=240]   Minimum gap between two voice hits.
   * @param {boolean}  [options.kickOnsets=true]       Bass hits measured as onsets against the band's quiet floor (false: against its plain average).
   * @param {function} [options.onBassHit]             (hit) => void — fire a firework launch.
   * @param {function} [options.onVoiceHit]             (hit) => void — bloom a heart shape.
   */
  constructor(options = {}) {
    this.audioContext = options.audioContext || new (window.AudioContext || window.webkitAudioContext)();

    this.analyser = this.audioContext.createAnalyser();
    this.analyser.fftSize = 2048;
    this.analyser.smoothingTimeConstant = options.smoothingTimeConstant ?? 0.25;

    this.freqData = new Uint8Array(this.analyser.frequencyBinCount); // 1024 bins
    this.timeData = new Uint8Array(this.analyser.fftSize);           // raw waveform samples
    this.binHz = this.audioContext.sampleRate / this.analyser.fftSize;

    const historyLength = options.historyLength ?? 45;

    // Sub-band separation, translated from Hz into FFT bin indices.
    this.bass = new BandEnergyDetector({
      loHz: 20, hiHz: 150,
      binHz: this.binHz, totalBins: this.analyser.frequencyBinCount,
      historyLength, cooldownMs: options.bassCooldownMs ?? 140,
      onsetBaseline: options.kickOnsets ?? true,
    });
    this.voice = new BandEnergyDetector({
      loHz: 250, hiHz: 2000,
      binHz: this.binHz, totalBins: this.analyser.frequencyBinCount,
      historyLength, cooldownMs: options.voiceCooldownMs ?? 240,
    });

    this.setSensitivity(options.sensitivity ?? 0.5);

    // Public callback hooks (DOM-handler style — just assign a function).
    this.onBassHit = options.onBassHit || (() => {});
    this.onVoiceHit = options.onVoiceHit || (() => {});

    this._running = false;
    this._rafId = null;
    this._boundFrame = this._analyzeFrame.bind(this);
  }

  /**
   * Connects an <audio>/<video> element as the analysis + playback source.
   * Routes it through the analyser and on to the speakers, so playback is
   * unaffected — the analyser is a transparent pass-through node.
   * Returns the created MediaElementAudioSourceNode.
   */
  connectAudioElement(mediaElement) {
    const source = this.audioContext.createMediaElementSource(mediaElement);
    return this.connectSource(source);
  }

  /** Connects any existing Web Audio source node through the analyser. */
  connectSource(sourceNode) {
    sourceNode.connect(this.analyser);
    this.analyser.connect(this.audioContext.destination);
    return this.analyser;
  }

  /**
   * Fills and returns the raw time-domain waveform (0-255, 128 = silence
   * centerline) for the current audio frame — for drawing oscilloscope-style
   * visuals. Cheap to call once per animation frame.
   */
  getWaveform() {
    this.analyser.getByteTimeDomainData(this.timeData);
    return this.timeData;
  }

  /** Resume the AudioContext — browsers start it suspended until a user gesture. */
  resume() {
    if (this.audioContext.state === 'suspended') return this.audioContext.resume();
    return Promise.resolve();
  }

  /**
   * Maps a sensitivity slider value (0.0 - 1.0) to the energy-ratio
   * threshold a band must clear to register as a hit:
   *
   *     instantEnergy > localAverageEnergy * threshold
   *
   * sensitivity = 1.0 (max)  -> threshold ≈ 1.15  (barely above average triggers easily)
   * sensitivity = 0.0 (min)  -> threshold ≈ 4.0   (needs a massive spike over average)
   *
   * The curve is eased (squared) rather than linear so the slider's middle
   * range still feels meaningfully different, instead of most of the effect
   * being crammed into the extreme ends.
   */
  static sensitivityToThreshold(sensitivity, minThreshold = 1.15, maxThreshold = 4.0) {
    const s = Math.max(0, Math.min(1, sensitivity));
    const inverted = Math.pow(1 - s, 1.6); // 0 at max sensitivity, 1 at min sensitivity
    return minThreshold + inverted * (maxThreshold - minThreshold);
  }

  setSensitivity(value) {
    this.sensitivity = Math.max(0, Math.min(1, value));
    this._threshold = AudioVisualizerAnalyzer.sensitivityToThreshold(this.sensitivity);
  }

  /**
   * Clears both bands' rolling history and cooldown clocks. Call this when
   * a new track loads — a quiet ballad shouldn't be judged against the
   * previous (possibly much louder) track's energy average.
   */
  reset() {
    this.bass.history = [];
    this.bass.lastHitTime = 0;
    this.voice.history = [];
    this.voice.lastHitTime = 0;
  }

  /** One analysis step: pull fresh frequency data and test both bands. */
  _analyzeFrame() {
    if (!this._running) return;

    this.analyser.getByteFrequencyData(this.freqData);
    const now = performance.now();

    const bassHit = this.bass.update(this.freqData, this._threshold, now);
    if (bassHit) this.onBassHit(bassHit);

    const voiceHit = this.voice.update(this.freqData, this._threshold, now);
    if (voiceHit) this.onVoiceHit(voiceHit);

    this._rafId = requestAnimationFrame(this._boundFrame);
  }

  /** Starts the requestAnimationFrame analysis loop. */
  start() {
    if (this._running) return;
    this._running = true;
    this._rafId = requestAnimationFrame(this._boundFrame);
  }

  /** Stops the analysis loop (audio playback is untouched). */
  stop() {
    this._running = false;
    if (this._rafId !== null) cancelAnimationFrame(this._rafId);
    this._rafId = null;
  }
}

if (typeof window !== 'undefined') window.AudioVisualizerAnalyzer = AudioVisualizerAnalyzer;
if (typeof module !== 'undefined' && module.exports) module.exports = { AudioVisualizerAnalyzer };
