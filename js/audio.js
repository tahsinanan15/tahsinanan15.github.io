// Media player and sound effects. She wants sound on when the site opens. Browsers block audio until
// the first click or key press, so the music starts on that gesture, and mute is always one click away.
import { track } from './analytics.js';
import { SONGS, THEMES } from './themes.js';

const TRACKS = SONGS;

const $ = (id) => document.getElementById(id);
const still = matchMedia('(prefers-reduced-motion: reduce)');
const read = (k, d) => { try { const v = localStorage.getItem(k); return v === null ? d : v; } catch { return d; } };
const write = (k, v) => { try { localStorage.setItem(k, v); } catch { /* fine */ } };

const audio = new Audio();
audio.preload = 'none';
let ctx = null, master = null, analyser = null, sfxBus = null, musicGain = null, musicTone = null, wired = false;
let index = 0;
let muted = read('tahsin.muted', '0') === '1';
let volume = +read('tahsin.volume', '55') / 100;
let userPaused = false;
let startedByGesture = false;
// What a game needs from the deck: the song, a clock that matches what's heard, and a turn at the visualizer's canvas.
export const deck = { audio, game: null, heard: () => audio.currentTime - (ctx ? (ctx.baseLatency || 0) + (ctx.outputLatency || 0) : 0) };

function ensureContext() {
  if (ctx) return ctx;
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return null;
  ctx = new AC();
  master = ctx.createGain();
  master.connect(ctx.destination);
  sfxBus = ctx.createGain();
  sfxBus.gain.value = .5;
  sfxBus.connect(master);
  applyVolume();
  return ctx;
}

function wireMusic() {
  if (wired || !ensureContext()) return;
  wired = true;
  analyser = ctx.createAnalyser();
  analyser.fftSize = 1024;
  analyser.smoothingTimeConstant = .72;
  const source = ctx.createMediaElementSource(audio);
  audio.volume = 1;
  musicGain = ctx.createGain();
  musicGain.gain.value = .8;
  musicTone = ctx.createBiquadFilter();
  musicTone.type = 'lowpass';
  musicTone.frequency.value = 20000;
  source.connect(musicGain).connect(musicTone).connect(analyser).connect(master);
}

function applyVolume() {
  if (master) master.gain.setTargetAtTime(muted ? 0 : volume, ctx.currentTime, .03);
  audio.muted = !master && muted;
  for (const [id, ico] of [['mp-mute', 'mp-mute-ico'], ['tray-mute', 'tray-mute-ico']]) {
    $(ico).setAttribute('href', muted ? '#u-mute' : '#u-vol');
    $(id).setAttribute('aria-label', muted ? 'Unmute' : 'Mute');
  }
  $('skip-mute').textContent = muted ? 'Unmute the music' : 'Mute the music';
}

function fmt(s) { if (!isFinite(s)) return '0:00'; return `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`; }

function load(i) {
  index = (i + TRACKS.length) % TRACKS.length;
  const t = TRACKS[index];
  audio.src = `assets/audio/${t.src}.mp3`;
  const label = (t.artist ? `${t.title} / ${t.artist}` : t.title).toUpperCase();
  const title = $('mp-title');
  title.textContent = label;
  title.parentElement.classList.toggle('is-long', label.length > 24);
  document.querySelectorAll('[data-track]').forEach((b) => b.setAttribute('aria-current', String(+b.dataset.track === index)));
  if ('mediaSession' in navigator) navigator.mediaSession.metadata = new MediaMetadata({ title: t.title, artist: t.artist || 'Tahsin OS' });
  vizColors = THEMES[t.theme].viz;
  dispatchEvent(new CustomEvent('tahsin:song', { detail: t }));
}
export const currentSong = () => TRACKS[index];
export function play() {
  wireMusic();
  ctx?.resume();
  userPaused = false;
  return audio.play();
}
function pause() { userPaused = true; audio.pause(); }
function toggle() { if (audio.paused) play().catch(() => {}); else pause(); }
export const playSong = (i) => go(i);
function go(i, auto) { load(i); play().catch(() => {}); track('track_play', auto ? { track: TRACKS[index].title, auto: true } : { track: TRACKS[index].title }); }

function setPlayIcons() {
  const on = !audio.paused;
  $('mp-play-ico').setAttribute('href', on ? '#u-pause' : '#u-play');
  $('tray-play-ico').setAttribute('href', on ? '#u-pause' : '#u-play');
  $('mp-play').setAttribute('aria-label', on ? 'Pause' : 'Play');
  $('tray-play').setAttribute('aria-label', on ? 'Pause music' : 'Play music');
  $('mp').classList.toggle('playing', on);
}

// Live levels for everything that dances: the visualizer, the wallpaper, the theme.
export const beat = { bass: 0, kick: 0, kickAt: 0, pulse: 0, playing: false };
const spectrum = new Uint8Array(512);
let bassAvg = 0;
function listen(now) {
  beat.playing = !audio.paused;
  if (!analyser || audio.paused) {
    spectrum.fill(0);
    beat.bass *= .9; beat.kick *= .86; beat.pulse *= .9;
    return;
  }
  analyser.getByteFrequencyData(spectrum);
  const band = (a, b) => { let s = 0; for (let i = a; i < b; i++) s += spectrum[i]; return s / ((b - a) * 255); };
  const b = band(1, 7);
  beat.bass += (b - beat.bass) * (b > beat.bass ? .6 : .12);
  bassAvg += (b - bassAvg) * .04;
  beat.pulse += (Math.min(1, Math.max(0, (beat.bass - bassAvg) / .08)) - beat.pulse) * .08;   // loud bass sits near its ceiling, so what moves with the music is its rise above the running average
  beat.kick *= .86;
  if (b > bassAvg + .04 && b > .3 && now - beat.kickAt > 340) { beat.kick = 1; beat.kickAt = now; }
}

// Bars built from chunky pixels, with falling peak caps, in the current theme's colors. Each bar is drawn in a space 120
// tall and stood wherever `place` says: [x, floor, width, height, alpha]. The player stands them in a row across its own
// 600 by 120 canvas. A game can stand them anywhere, far end first if `back` is set.
let vizColors = THEMES.aero.viz;
const BARS = 30, CHUNK = 6, GAP = 2, peaks = new Float32Array(BARS);
let grad = null, gradFor = null;
const strip = (W, floor, zone) => (i) => [i * W / BARS + W / 600, floor, W / BARS - W / 200, zone];
function bars(g, place, alpha = 1, back = false) {
  if (gradFor !== vizColors) {
    gradFor = vizColors;
    grad = g.createLinearGradient(0, 0, 0, -120);
    vizColors.forEach((c, i) => grad.addColorStop(i / (vizColors.length - 1), c));
  }
  for (let b = 0; b < BARS; b++) {
    const i = back ? BARS - 1 - b : b, v = spectrum[Math.floor(Math.pow(i / BARS, 1.7) * 280) + 1] / 255, n = Math.max(1, Math.round(v * 15));
    const [x, floor, w, zone, a = 1] = place(i);
    peaks[i] = Math.max(n * (CHUNK + GAP), peaks[i] - 1.1);
    if (!a) continue;
    g.setTransform(1, 0, 0, zone / 120, x, floor);
    g.globalAlpha = alpha * a;
    g.fillStyle = v ? grad : 'rgba(127,180,220,.22)';
    for (let j = 0; j < n; j++) g.fillRect(0, -(j + 1) * (CHUNK + GAP), w, CHUNK);
    if (v) { g.fillStyle = vizColors[vizColors.length - 1]; g.fillRect(0, -peaks[i] - CHUNK, w, 3); }
  }
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.globalAlpha = 1;
}
function visualizer() {
  const canvas = $('mp-viz'), g = canvas.getContext('2d');
  let rested = -1e9;
  const draw = (now = 0) => {
    requestAnimationFrame(draw);
    listen(now);
    if (canvas.offsetParent === null || document.hidden) return;
    if (deck.game) return deck.game(g, now, bars, strip);   // a game sizes the canvas, paints its board, and stands the bars where it wants them
    if (audio.paused) {   // nothing playing, which is how every visit starts: a slow swell so the screen isn't dead, about 16 times a second
      if (now - rested < (still.matches ? Infinity : 60)) return;
      rested = now;
      const t = still.matches ? 0 : now / 1000;
      for (let i = 0; i < BARS; i++) spectrum[Math.floor(Math.pow(i / BARS, 1.7) * 280) + 1] = 255 * (.2 + .13 * Math.sin(t * 1.3 + i * .45) + .07 * Math.sin(t * .8 - i * .9));
    } else {
      rested = -1e9;
      if (still.matches) spectrum.fill(40);
    }
    g.clearRect(0, 0, canvas.width, canvas.height);
    bars(g, strip(canvas.width, canvas.height, canvas.height));
  };
  draw();
}

/* ---------- Sound effects, synthesized so nothing extra downloads ---------- */
const canSfx = () => ctx && ctx.state === 'running' && !muted;
function tone(freq, start, dur, { type = 'sine', gain = .2, to, pan = 0 } = {}) {
  const t = ctx.currentTime + start, o = ctx.createOscillator(), a = ctx.createGain();
  o.type = type; o.frequency.setValueAtTime(freq, t);
  if (to) o.frequency.exponentialRampToValueAtTime(to, t + dur);
  a.gain.setValueAtTime(0.0001, t); a.gain.exponentialRampToValueAtTime(gain, t + .012); a.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  let out = o.connect(a);
  if (ctx.createStereoPanner) { const p = ctx.createStereoPanner(); p.pan.value = pan; out = out.connect(p); }
  out.connect(sfxBus);
  o.start(t); o.stop(t + dur + .02);
}
export const sfx = {
  chime() {
    if (!ensureContext() || muted) return;
    ctx.resume();
    [[523.25, 0, -.5], [783.99, .13, .3], [1174.66, .26, -.2], [1318.51, .39, .5], [1975.53, .54, 0]].forEach(([f, s, pan]) => {
      tone(f, s, 1.9, { gain: .15, pan });
      tone(f * 2.001, s, .9, { gain: .05, pan });
    });
    [261.63, 392, 659.25].forEach((f) => tone(f, .4, 2.3, { type: 'triangle', gain: .05 }));
  },
  pop() { if (canSfx()) { const r = .9 + Math.random() * .35; tone(520 * r, 0, .09, { to: 1500 * r, gain: .3 }); tone(2400 * r, .015, .03, { gain: .05, type: 'triangle' }); } },
  popBig(n) { if (canSfx()) { for (let i = 0; i < Math.min(n, 6); i++) tone(480 * Math.pow(1.122, i * 2), i * .035, .1, { to: 1300 * Math.pow(1.122, i * 2), gain: .17 }); } },
  open() { if (canSfx()) { tone(440, 0, .13, { to: 990, gain: .1 }); tone(1320, .05, .12, { gain: .035 }); } },
  close() { if (canSfx()) { tone(880, 0, .12, { to: 330, gain: .09 }); } },
};

// Touch browsers only grant audio on pointerup or click, so stay armed until play actually succeeds.
let armed = true, trying = false;
const GESTURES = ['pointerdown', 'pointerup', 'click', 'keydown'];
function disarm() { armed = false; GESTURES.forEach((g) => removeEventListener(g, firstGesture, true)); }
function firstGesture(e) {
  const t = e?.target;
  if (e?.key === 'Tab') return;   // moving focus isn't asking for sound
  if (!armed || trying || t?.closest?.('#boot')) return;   // the boot screen starts sound its own way
  if (t?.closest?.('a[target="_blank"]:not([data-view]), a[href^="mailto:"], a[href^="tel:"]')) return;   // they're leaving this tab
  ensureContext();
  ctx?.resume();
  if (!audio.paused) { wireMusic(); return disarm(); }   // autoplay already won: take over its volume and stop waiting
  if (t?.closest?.('#mp-mute, #tray-mute, #skip-mute')) return disarm();   // reaching for mute first means no
  if (muted || userPaused) return disarm();
  if (t?.closest?.('#mp-play, #tray-play')) startedByGesture = true;
  trying = true;
  fadeInMusic();
  startupChime();
  play().then(() => { disarm(); track('track_play', { track: TRACKS[index].title, auto: true }); })
    .catch(() => { startedByGesture = false; })
    .finally(() => { trying = false; });
}

// Chime first, then the music fades in under it, whichever click got us here.
// The rundown plays like an old tape: a clunk going in, motor and hiss underneath, a slinky whir between steps, and the music goes warbly and muffled.
function noiseBuffer(sec) {
  const b = ctx.createBuffer(1, ctx.sampleRate * sec, ctx.sampleRate), d = b.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  return b;
}
function burst(start, dur, freq, gain, type = 'lowpass') {
  const t = ctx.currentTime + start, s = ctx.createBufferSource(), f = ctx.createBiquadFilter(), a = ctx.createGain();
  s.buffer = noiseBuffer(dur + .05); f.type = type; f.frequency.value = freq;
  a.gain.setValueAtTime(gain, t); a.gain.exponentialRampToValueAtTime(.0001, t + dur);
  s.connect(f).connect(a).connect(sfxBus); s.start(t); s.stop(t + dur + .03);
  return f;
}
let tape = null;
export const vhs = {
  start() {
    if (!ensureContext() || muted) return;
    ctx.resume();
    burst(0, .1, 1100, .7); tone(95, 0, .13, { to: 48, gain: .5 });   // the door
    burst(.34, .08, 2200, .5); tone(120, .34, .1, { to: 60, gain: .35 });   // the tape seats
    const hiss = ctx.createBufferSource(), hp = ctx.createBiquadFilter(), hg = ctx.createGain();
    hiss.buffer = noiseBuffer(2); hiss.loop = true; hp.type = 'highpass'; hp.frequency.value = 3200; hg.gain.value = .022;
    hiss.connect(hp).connect(hg).connect(sfxBus); hiss.start();
    const motor = ctx.createOscillator(), lp = ctx.createBiquadFilter(), mg = ctx.createGain();
    motor.type = 'sawtooth'; motor.frequency.value = 58; lp.type = 'lowpass'; lp.frequency.value = 340; mg.gain.value = .05;
    motor.connect(lp).connect(mg).connect(sfxBus); motor.start();
    tape = { hiss, motor, wob: null, rate: audio.playbackRate };
    if (musicTone) { musicTone.frequency.setTargetAtTime(1900, ctx.currentTime, .3); musicGain.gain.setTargetAtTime(.5, ctx.currentTime, .3); }
    audio.preservesPitch = false; audio.mozPreservesPitch = false; audio.webkitPreservesPitch = false;
    let phase = 0;
    tape.wob = setInterval(() => { phase += .9; audio.playbackRate = .982 + Math.sin(phase) * .006; }, 180);
  },
  skip() {   // a slinky pull of tape between steps
    if (!ctx || muted || ctx.state !== 'running') return;
    const f = burst(0, .46, 900, .5, 'bandpass');
    f.Q.value = 5;
    f.frequency.setValueAtTime(700, ctx.currentTime);
    f.frequency.exponentialRampToValueAtTime(3400, ctx.currentTime + .2);
    f.frequency.exponentialRampToValueAtTime(1100, ctx.currentTime + .46);
    tone(280, 0, .2, { to: 1500, gain: .04, type: 'square' });
    tone(1500, .2, .24, { to: 380, gain: .03, type: 'square' });
  },
  stop() {
    if (!tape) return;
    clearInterval(tape.wob);
    tape.hiss.stop(); tape.motor.stop();
    audio.playbackRate = tape.rate || 1;
    audio.preservesPitch = true; audio.mozPreservesPitch = true; audio.webkitPreservesPitch = true;
    tape = null;
    if (musicTone) { musicTone.frequency.setTargetAtTime(20000, ctx.currentTime, .25); musicGain.gain.setTargetAtTime(.8, ctx.currentTime, .25); }
    if (!muted && ctx?.state === 'running') { burst(0, .09, 1400, .6); tone(110, 0, .1, { to: 55, gain: .4 }); }   // eject
  },
};

let chimed = false;
function startupChime() { if (!chimed) { chimed = true; sfx.chime(); } }
function fadeInMusic() {
  wireMusic();
  if (!musicGain) return;
  const t = ctx.currentTime;
  musicGain.gain.setValueAtTime(0, t);
  musicGain.gain.setValueAtTime(0, t + .9);
  musicGain.gain.linearRampToValueAtTime(.8, t + 2.6);
}
export function declineSound() { disarm(); }
// Every OS has its own startup chime, made in SoundCraft.
export function osChime(id) {
  if (muted || !ctx || ctx.state !== 'running') return;
  const c = new Audio(`assets/sfx/${id}-chime.mp3`);
  c.volume = Math.min(1, volume * .85);
  c.play().catch(() => {});
}

// Pressing Start.
export function startSoundNow() {
  disarm();
  startupChime();
  if (muted) return;
  fadeInMusic();
  play().then(() => track('track_play', { track: TRACKS[index].title, auto: true })).catch(() => {});
}

// Some browsers allow sound without a click, for sites people return to. Try once, quietly.
export function tryAutoplay() {
  if (!armed || muted || userPaused) return;
  audio.volume = volume * .8;
  audio.play().then(() => track('track_play', { track: TRACKS[index].title, auto: true })).catch(() => {});
}

export function initAudio() {
  load(0);
  addEventListener('tahsin:stop-audio', pause);
  audio.addEventListener('play', setPlayIcons);
  audio.addEventListener('pause', setPlayIcons);
  audio.addEventListener('ended', () => go(index + 1, true));
  audio.addEventListener('loadedmetadata', () => { $('mp-time').textContent = fmt(0); });
  audio.addEventListener('timeupdate', () => {
    $('mp-time').textContent = fmt(audio.currentTime);
    if (audio.duration && !seeking) {
      $('mp-seek').value = (audio.currentTime / audio.duration) * 1000;
      $('mp-seek').setAttribute('aria-valuetext', `${fmt(audio.currentTime)} of ${fmt(audio.duration)}`);
    }
  });
  let seeking = false;
  const seek = $('mp-seek');
  seek.addEventListener('input', () => { seeking = true; if (audio.duration) seek.setAttribute('aria-valuetext', `${fmt(seek.value / 1000 * audio.duration)} of ${fmt(audio.duration)}`); });
  seek.addEventListener('change', () => { seeking = false; if (audio.duration) audio.currentTime = seek.value / 1000 * audio.duration; });

  const togglePlay = () => { if (startedByGesture) { startedByGesture = false; return; } toggle(); };
  $('mp-play').addEventListener('click', togglePlay);
  $('tray-play').addEventListener('click', togglePlay);
  $('mp-prev').addEventListener('click', () => go(index - 1));
  $('mp-next').addEventListener('click', () => go(index + 1));
  const toggleMute = () => { muted = !muted; write('tahsin.muted', muted ? '1' : '0'); ensureContext(); applyVolume(); track('mute', { muted }); };
  $('mp-mute').addEventListener('click', toggleMute);
  $('tray-mute').addEventListener('click', toggleMute);
  $('skip-mute').addEventListener('click', toggleMute);
  const vol = $('mp-vol');
  vol.value = volume * 100;
  vol.addEventListener('input', () => { volume = vol.value / 100; write('tahsin.volume', vol.value); if (muted && volume > 0) { muted = false; write('tahsin.muted', '0'); } ensureContext(); applyVolume(); });
  $('mp-listbtn').addEventListener('click', (e) => {
    const list = $('mp-list'), open = list.classList.toggle('is-open');
    e.currentTarget.setAttribute('aria-expanded', String(open));
    dispatchEvent(new Event('tahsin:player-resize'));
    if (open) list.querySelector('[aria-current=true]')?.scrollIntoView({ block: 'nearest' });
  });
  $('mp-list').addEventListener('click', (e) => { const b = e.target.closest('[data-track]'); if (b) go(+b.dataset.track); });
  if ('mediaSession' in navigator) {
    navigator.mediaSession.setActionHandler('play', () => play().catch(() => {}));
    navigator.mediaSession.setActionHandler('pause', pause);
    navigator.mediaSession.setActionHandler('previoustrack', () => go(index - 1));
    navigator.mediaSession.setActionHandler('nexttrack', () => go(index + 1));
  }
  applyVolume();
  visualizer();
  GESTURES.forEach((g) => addEventListener(g, firstGesture, true));
  setPlayIcons();
}
