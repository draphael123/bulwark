// BULWARK audio — all sound is synthesized in WebAudio: no assets, no licenses.
// SFX are one-shot synth patches; ambience is birds/crickets/wind crossfaded by
// night; music is a generative modal pad with Karplus-Strong plucked strings.

let ctx = null;
let master, sfxBus, musBus, ambBus;
let vols = { sfx: 0.8, music: 0.7, amb: 0.6 };
let started = false;

// ambience state
let windSrc = null, cricketGain = null, birdTimer = 3, cricketLFO = null, rainGain = null;
// music: real published tracks — Kevin MacLeod (incompetech.com), CC BY 3.0
const TRACKS = [
  'music/thatched-villagers.mp3',
  'music/moorland.mp3',
  'music/teller-of-the-tales.mp3',
  'music/midsummer-sky.mp3',
  'music/skye-cuillin.mp3',
  'music/achaidh-cheide.mp3',
  'music/suonatore-di-liuto.mp3',
  'music/celtic-impulse.mp3',
  'music/lord-of-the-land.mp3',
  'music/angevin-b.mp3',
  'music/virtutes-instrumenti.mp3',
  'music/minstrel-guild.mp3',
  'music/pippin-the-hunchback.mp3',
  'music/folk-round.mp3',
  'music/fiddles-mcginty.mp3',
  'music/master-of-the-feast.mp3',
];
let musicEl = null, trackIdx = Math.floor(Math.random() * TRACKS.length);

function ensure() {
  if (ctx) return true;
  try {
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    master = ctx.createGain(); master.gain.value = 1; master.connect(ctx.destination);
    sfxBus = ctx.createGain(); sfxBus.gain.value = vols.sfx; sfxBus.connect(master);
    musBus = ctx.createGain(); musBus.gain.value = vols.music * 0.5; musBus.connect(master);
    ambBus = ctx.createGain(); ambBus.gain.value = vols.amb; ambBus.connect(master);
    startAmbience();
    return true;
  } catch (e) { return false; }
}

function noiseBuffer(seconds) {
  const b = ctx.createBuffer(1, ctx.sampleRate * seconds, ctx.sampleRate);
  const d = b.getChannelData(0);
  for (let i=0;i<d.length;i++) d[i] = Math.random()*2 - 1;
  return b;
}

function env(node, t0, a, peak, d) {
  node.gain.setValueAtTime(0.0001, t0);
  node.gain.linearRampToValueAtTime(peak, t0 + a);
  node.gain.exponentialRampToValueAtTime(0.0001, t0 + a + d);
}

// ---------------------------------------------------------------- SFX patches
function sfxThunk() {
  const t = ctx.currentTime;
  const o = ctx.createOscillator(); o.type = 'sine';
  o.frequency.setValueAtTime(160, t); o.frequency.exponentialRampToValueAtTime(55, t+0.12);
  const g = ctx.createGain(); env(g, t, 0.004, 0.7, 0.16);
  o.connect(g).connect(sfxBus); o.start(t); o.stop(t+0.2);
  const n = ctx.createBufferSource(); n.buffer = noiseBuffer(0.1);
  const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 900;
  const ng = ctx.createGain(); env(ng, t, 0.002, 0.35, 0.08);
  n.connect(f).connect(ng).connect(sfxBus); n.start(t);
}
function sfxStone() {
  const t = ctx.currentTime;
  const n = ctx.createBufferSource(); n.buffer = noiseBuffer(0.5);
  const f = ctx.createBiquadFilter(); f.type = 'lowpass';
  f.frequency.setValueAtTime(500, t); f.frequency.exponentialRampToValueAtTime(120, t+0.45);
  const g = ctx.createGain(); env(g, t, 0.01, 0.8, 0.5);
  n.connect(f).connect(g).connect(sfxBus); n.start(t);
  const o = ctx.createOscillator(); o.type = 'sine';
  o.frequency.setValueAtTime(80, t); o.frequency.exponentialRampToValueAtTime(45, t+0.4);
  const og = ctx.createGain(); env(og, t, 0.01, 0.5, 0.45);
  o.connect(og).connect(sfxBus); o.start(t); o.stop(t+0.5);
}
function sfxCreak() {
  const t = ctx.currentTime;
  const o = ctx.createOscillator(); o.type = 'sawtooth';
  o.frequency.setValueAtTime(310, t);
  o.frequency.linearRampToValueAtTime(180, t+0.5);
  const v = ctx.createOscillator(); v.frequency.value = 11;
  const vg = ctx.createGain(); vg.gain.value = 34;
  v.connect(vg).connect(o.frequency);
  const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 500; f.Q.value = 3;
  const g = ctx.createGain(); env(g, t, 0.05, 0.16, 0.55);
  o.connect(f).connect(g).connect(sfxBus);
  o.start(t); v.start(t); o.stop(t+0.65); v.stop(t+0.65);
}
function sfxHorn() {
  const t = ctx.currentTime;
  for (const [freq, del] of [[196, 0], [233.08, 0.02]]) {   // G + Bb — a warning third
    const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = freq;
    const o2 = ctx.createOscillator(); o2.type = 'sawtooth'; o2.frequency.value = freq*1.005;
    const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 1200;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t+del);
    g.gain.linearRampToValueAtTime(0.32, t+del+0.35);
    g.gain.setValueAtTime(0.32, t+del+0.9);
    g.gain.exponentialRampToValueAtTime(0.0001, t+del+1.6);
    o.connect(f); o2.connect(f); f.connect(g).connect(sfxBus);
    o.start(t+del); o2.start(t+del); o.stop(t+2); o2.stop(t+2);
  }
}
function sfxChime() {
  const t = ctx.currentTime;
  [523.25, 659.25, 783.99].forEach((fr, i) => {
    const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = fr;
    const g = ctx.createGain(); env(g, t + i*0.09, 0.005, 0.22, 0.6);
    o.connect(g).connect(sfxBus); o.start(t+i*0.09); o.stop(t+i*0.09+0.7);
  });
}
function sfxCrash() {
  const t = ctx.currentTime;
  const n = ctx.createBufferSource(); n.buffer = noiseBuffer(0.7);
  const f = ctx.createBiquadFilter(); f.type = 'lowpass';
  f.frequency.setValueAtTime(2500, t); f.frequency.exponentialRampToValueAtTime(150, t+0.6);
  const g = ctx.createGain(); env(g, t, 0.005, 0.9, 0.65);
  n.connect(f).connect(g).connect(sfxBus); n.start(t);
}
function sfxFall() {
  const t = ctx.currentTime;
  const n = ctx.createBufferSource(); n.buffer = noiseBuffer(0.2);
  const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 700; f.Q.value = 1.2;
  const g = ctx.createGain(); env(g, t, 0.004, 0.3, 0.22);
  n.connect(f).connect(g).connect(sfxBus); n.start(t);
}
function sfxClick() {
  const t = ctx.currentTime;
  const o = ctx.createOscillator(); o.type = 'triangle'; o.frequency.value = 880;
  const g = ctx.createGain(); env(g, t, 0.002, 0.12, 0.06);
  o.connect(g).connect(sfxBus); o.start(t); o.stop(t+0.09);
}
function sfxCoin() {
  const t = ctx.currentTime;
  [1318.5, 1567.98].forEach((fr, i) => {
    const o = ctx.createOscillator(); o.type = 'triangle'; o.frequency.value = fr;
    const g = ctx.createGain(); env(g, t+i*0.06, 0.002, 0.15, 0.25);
    o.connect(g).connect(sfxBus); o.start(t+i*0.06); o.stop(t+i*0.06+0.3);
  });
}

function sfxBell() {
  for (const del of [0, 0.5, 1.0]) {
    const t = ctx.currentTime + del;
    for (const [fr, amp] of [[660, 0.28], [990, 0.14], [1571, 0.06]]) {
      const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = fr * (1 + (Math.random()-0.5)*0.004);
      const g = ctx.createGain(); env(g, t, 0.003, amp, 0.9);
      o.connect(g).connect(sfxBus); o.start(t); o.stop(t+1);
    }
  }
}

function sfxFanfare() {
  const t = ctx.currentTime;
  // rising herald call, then a bright chord
  [[392, 0], [523.25, 0.18], [659.25, 0.36]].forEach(([fr, del]) => {
    const o = ctx.createOscillator(); o.type = 'square';
    const o2 = ctx.createOscillator(); o2.type = 'sawtooth'; o2.frequency.value = fr*0.5;
    o.frequency.value = fr;
    const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 2100;
    const g = ctx.createGain(); env(g, t+del, 0.02, 0.16, 0.35);
    o.connect(f); o2.connect(f); f.connect(g).connect(sfxBus);
    o.start(t+del); o2.start(t+del); o.stop(t+del+0.45); o2.stop(t+del+0.45);
  });
  [523.25, 659.25, 783.99, 1046.5].forEach(fr => {
    const o = ctx.createOscillator(); o.type = 'triangle'; o.frequency.value = fr;
    const g = ctx.createGain(); env(g, t+0.55, 0.03, 0.12, 1.3);
    o.connect(g).connect(sfxBus); o.start(t+0.55); o.stop(t+2);
  });
}

const PATCHES = { thunk:sfxThunk, stone:sfxStone, creak:sfxCreak, horn:sfxHorn,
  chime:sfxChime, crash:sfxCrash, fall:sfxFall, click:sfxClick, coin:sfxCoin, bell:sfxBell,
  fanfare:sfxFanfare };

// ---------------------------------------------------------------- ambience
function startAmbience() {
  // wind: constant filtered noise bed
  windSrc = ctx.createBufferSource(); windSrc.buffer = noiseBuffer(3); windSrc.loop = true;
  const wf = ctx.createBiquadFilter(); wf.type = 'lowpass'; wf.frequency.value = 320;
  const wg = ctx.createGain(); wg.gain.value = 0.045;
  windSrc.connect(wf).connect(wg).connect(ambBus); windSrc.start();
  // crickets: high pulsing tone, gain driven by night factor
  const co = ctx.createOscillator(); co.type = 'square'; co.frequency.value = 4300;
  cricketLFO = ctx.createOscillator(); cricketLFO.frequency.value = 17;
  const lg = ctx.createGain(); lg.gain.value = 1;
  cricketGain = ctx.createGain(); cricketGain.gain.value = 0;
  const shaper = ctx.createGain(); shaper.gain.value = 0;
  cricketLFO.connect(lg); lg.connect(shaper.gain);
  co.connect(shaper).connect(cricketGain).connect(ambBus);
  co.start(); cricketLFO.start();
  // rain: bright filtered noise, gain driven by the game's rain factor
  const rn = ctx.createBufferSource(); rn.buffer = noiseBuffer(2.7); rn.loop = true;
  const rf = ctx.createBiquadFilter(); rf.type = 'highpass'; rf.frequency.value = 1400;
  rainGain = ctx.createGain(); rainGain.gain.value = 0;
  rn.connect(rf).connect(rainGain).connect(ambBus);
  rn.start();
}
function birdChirp() {
  const t = ctx.currentTime;
  const notes = 2 + (Math.random()*3|0);
  for (let i=0;i<notes;i++){
    const o = ctx.createOscillator(); o.type = 'sine';
    const f0 = 2200 + Math.random()*1600;
    const st = t + i*(0.09 + Math.random()*0.05);
    o.frequency.setValueAtTime(f0, st);
    o.frequency.exponentialRampToValueAtTime(f0*(1.2+Math.random()*0.3), st+0.05);
    o.frequency.exponentialRampToValueAtTime(f0*0.9, st+0.09);
    const g = ctx.createGain(); env(g, st, 0.008, 0.05 + Math.random()*0.03, 0.09);
    o.connect(g).connect(ambBus); o.start(st); o.stop(st+0.15);
  }
}

// ---------------------------------------------------------------- music
function playTrack() {
  if (!musicEl) return;
  musicEl.src = TRACKS[trackIdx % TRACKS.length];
  musicEl.volume = Math.min(1, vols.music * 0.55);
  musicEl.play().catch(() => {});
}
function ensureMusic() {
  if (vols.music <= 0.01) {
    if (musicEl) musicEl.pause();
    return;
  }
  if (!musicEl) {
    musicEl = new Audio();
    musicEl.addEventListener('ended', () => {
      trackIdx++;
      setTimeout(playTrack, 5000);   // a breath between tracks
    });
    playTrack();
  } else {
    musicEl.volume = Math.min(1, vols.music * 0.55);
    if (musicEl.paused) musicEl.play().catch(() => {});
  }
}

// ---------------------------------------------------------------- public API
export const AudioSys = {
  init() {
    if (started) { if (ctx && ctx.state === 'suspended') ctx.resume(); ensureMusic(); return; }
    started = ensure();
    ensureMusic();
  },
  play(name) {
    if (!started || !ctx) return;
    if (ctx.state === 'suspended') ctx.resume();
    const p = PATCHES[name];
    if (p) try { p(); } catch (e) {}
  },
  // called every frame from the game with (dt, nightFactor 0..1, rainFactor 0..1)
  update(dt, night, rain = 0) {
    if (!started || !ctx) return;
    if (cricketGain) cricketGain.gain.value = night * 0.05 * (1 - rain);
    if (rainGain) rainGain.gain.value = rain * 0.11;
    birdTimer -= dt;
    if (birdTimer <= 0) {
      birdTimer = 2.5 + Math.random()*7;
      if (night < 0.4 && rain < 0.4) try { birdChirp(); } catch(e){}
    }
  },
  setVolumes(v) {
    vols = { sfx: v.sfx ?? vols.sfx, music: v.music ?? vols.music, amb: v.amb ?? vols.amb };
    if (started) ensureMusic();
    if (!ctx) return;
    sfxBus.gain.value = vols.sfx;
    ambBus.gain.value = vols.amb;
  },
};
