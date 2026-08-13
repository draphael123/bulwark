// BULWARK — medieval town builder where THE WALL IS THE TOWN.
// Closed wall rings define wards; nesting depth raises taxes; everything
// outside the rings is raidable by bandits.
import * as THREE from 'three';
import { AudioSys } from './audio.js';

// ---------------------------------------------------------------- constants
const MAP = 120;              // half-extent of buildable land
const DAY = 60;               // seconds per day
const WALL_COST_PER_UNIT = 1.2;   // stone
const WALL_H = 5, WALL_T = 1.4;
const GATE_W = 6;

const BUILD_DEFS = {
  house:      { nm:'House',      ico:'🏠', w:3,  d:3,  hp:60,  cost:{wood:20},            popCap:4, needsWard:true },
  farm:       { nm:'Farm',       ico:'🌾', w:6,  d:6,  hp:50,  cost:{wood:30},            foodPerDay:12 },
  woodcutter: { nm:'Woodcutter', ico:'🪵', w:3,  d:3,  hp:50,  cost:{wood:10, gold:10},   woodPerDay:8, needsTrees:2 },
  quarry:     { nm:'Quarry',     ico:'⛏️', w:4,  d:4,  hp:80,  cost:{wood:25, gold:15},   stonePerDay:8, needsRocks:2 },
  market:     { nm:'Market',     ico:'🏪', w:4,  d:4,  hp:80,  cost:{wood:40, stone:20},  boostR:18, needsWard:true },
  tower:      { nm:'Watchtower', ico:'🗼', w:2,  d:2,  hp:120, cost:{wood:20, stone:30},  range:24, dps:11 },
  barracks:   { nm:'Barracks',   ico:'⚔️', w:4,  d:4,  hp:120, cost:{wood:40, stone:30, gold:50}, guards:3 },
  keep:       { nm:'Keep',       ico:'🏰', w:6,  d:6,  hp:400, cost:{},                   popCap:8 },
};
// walls first, then the town: the toolbar teaches the build order
const TOOL_ORDER = ['wall','gate','house','farm','woodcutter','quarry','market','tower','barracks','demolish'];
const GATE_COST = 10; // stone, for the Gate tool

// ---------------------------------------------------------------- state
const state = {
  gold:100, wood:120, stone:140, food:60,
  pop:6, time:0, day:1,
  buildings:[],       // {type,x,z,hp,maxHp,depth,ruined,group,hitFlash}
  walls:[],           // {verts:[{x,z}], group, gateSeg}
  bandits:[], guards:[], arrows:[], villagers:[],
  raidTimer:150, raidEdge:null, raidNum:0,
  over:false, started:false,
};

// ---------------------------------------------------------------- scene
const app = document.getElementById('app');
const renderer = new THREE.WebGLRenderer({ antialias:true });
renderer.setSize(innerWidth, innerHeight);
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.15;
app.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x86a3c3);
scene.fog = new THREE.Fog(0x86a3c3, 200, 560);

const camera = new THREE.PerspectiveCamera(55, innerWidth/innerHeight, 1, 800);
const camTarget = new THREE.Vector3(0, 0, 0);
let camYaw = Math.PI * 0.25, camPitch = 0.9, camDist = 90;
function updateCamera() {
  camPitch = Math.max(0.35, Math.min(1.35, camPitch));
  camDist  = Math.max(25, Math.min(220, camDist));
  camera.position.set(
    camTarget.x + Math.sin(camYaw) * Math.cos(camPitch) * camDist,
    camTarget.y + Math.sin(camPitch) * camDist,
    camTarget.z + Math.cos(camYaw) * Math.cos(camPitch) * camDist
  );
  camera.lookAt(camTarget);
}
updateCamera();

const sun = new THREE.DirectionalLight(0xfff2d8, 2.6);
sun.position.set(80, 120, 40);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.left = -140; sun.shadow.camera.right = 140;
sun.shadow.camera.top = 140;   sun.shadow.camera.bottom = -140;
sun.shadow.camera.far = 400;
sun.shadow.bias = -0.0004;
scene.add(sun);
const hemi = new THREE.HemisphereLight(0xbdd3e8, 0x5a6b3a, 0.9);
scene.add(hemi);

// ------------------------------------------------- day/night atmosphere
// keyframes over one day; f is the fraction of the current day (offset so a
// new game opens mid-morning, and night stays short + readable)
const ATMO = [
  { t:0.00, sky:0x1d2842, sunI:0.30, sunC:0x8fa5d8, hemiI:0.35 },   // deep night
  { t:0.06, sky:0xe8956a, sunI:1.30, sunC:0xffc07a, hemiI:0.60 },   // dawn
  { t:0.18, sky:0x86a3c3, sunI:2.60, sunC:0xfff2d8, hemiI:0.90 },   // morning
  { t:0.66, sky:0x86a3c3, sunI:2.60, sunC:0xfff2d8, hemiI:0.90 },   // afternoon
  { t:0.78, sky:0xd9855a, sunI:1.35, sunC:0xffab66, hemiI:0.62 },   // dusk
  { t:0.88, sky:0x1d2842, sunI:0.30, sunC:0x8fa5d8, hemiI:0.35 },   // nightfall
  { t:1.00, sky:0x1d2842, sunI:0.30, sunC:0x8fa5d8, hemiI:0.35 },
];
const _atA = new THREE.Color(), _atB = new THREE.Color();
let nightFactor = 0;
function updateAtmosphere() {
  // light sweeps once per THREE game days — day counter stays 60s, but the
  // sky changes at a readable pace instead of strobing
  const f = ((state.time / (DAY*3)) + 0.30) % 1;
  let i = 0;
  while (i < ATMO.length-2 && ATMO[i+1].t <= f) i++;
  const a = ATMO[i], b = ATMO[i+1];
  const u = Math.max(0, Math.min(1, (f - a.t) / Math.max(1e-6, b.t - a.t)));
  const lerp = (p,q) => p + (q-p)*u;
  _atA.setHex(a.sky).lerp(_atB.setHex(b.sky), u);
  scene.background.copy(_atA);
  scene.fog.color.copy(_atA);
  sun.intensity = lerp(a.sunI, b.sunI);
  sun.color.setHex(a.sunC).lerp(_atB.setHex(b.sunC), u);
  hemi.intensity = lerp(a.hemiI, b.hemiI);
  const ang = f * Math.PI * 2 - Math.PI/2;
  sun.position.set(Math.cos(ang)*100, Math.max(35, Math.sin(ang)*130), 40);
  nightFactor = Math.max(0, Math.min(1, 1 - (sun.intensity - 0.3) / 1.0));
  MAT.window.opacity = nightFactor * 0.95;
  if (starPts) starPts.material.opacity = nightFactor * 0.9;
  sunSpr.position.set(sun.position.x*3.6, Math.max(50, sun.position.y*3.2), sun.position.z*3.6);
  sunSpr.material.opacity = (1 - nightFactor) * 0.8;
  moonSpr.position.set(-sun.position.x*3.6, Math.max(90, sun.position.y*2.4), -sun.position.z*3.6);
  moonSpr.material.opacity = nightFactor * 0.9;
}

// ground with baked high-frequency grass speckle
function grassTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = '#78975200'; g.fillStyle = '#789752'; g.fillRect(0,0,256,256);
  for (let i=0;i<9000;i++){
    const v = Math.random();
    g.fillStyle = v<.5 ? '#6f8d4b' : (v<.85 ? '#82a25b' : '#8fae66');
    g.fillRect(Math.random()*256|0, Math.random()*256|0, 2, 2);
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(24,24);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
// terrain: flat where you build, rolling hills toward the horizon
function valueNoise2(x, z) {
  const xi = Math.floor(x), zi = Math.floor(z);
  const h = (a,b) => { const n = Math.sin(a*127.1 + b*311.7 + 74.7) * 43758.5453; return n - Math.floor(n); };
  const u = x-xi, v = z-zi, s = t => t*t*(3-2*t);
  const a = h(xi,zi), b = h(xi+1,zi), c = h(xi,zi+1), d = h(xi+1,zi+1);
  return a + (b-a)*s(u) + (c-a)*s(v) + (a-b-c+d)*s(u)*s(v);
}
const LAKE = { x: 170, z: -150, r: 30 };
const groundGeo = new THREE.PlaneGeometry(640, 640, 96, 96);
{
  const pos = groundGeo.attributes.position;
  for (let i=0;i<pos.count;i++){
    const wx = pos.getX(i), wz = -pos.getY(i);          // plane local -> world (pre-rotation)
    const dist = Math.max(Math.abs(wx), Math.abs(wz));
    const m = THREE.MathUtils.smoothstep(dist, MAP+8, MAP+90);
    const lake = 1 - THREE.MathUtils.smoothstep(Math.hypot(wx-LAKE.x, wz-LAKE.z), LAKE.r*0.6, LAKE.r*1.7);
    pos.setZ(i, m * (valueNoise2(wx*0.02, wz*0.02) * 10 + valueNoise2(wx*0.06, wz*0.06) * 2.5) * (1-lake) - lake*2.4);
  }
  groundGeo.computeVertexNormals();
}
const ground = new THREE.Mesh(groundGeo, new THREE.MeshLambertMaterial({ map: grassTexture() }));
ground.rotation.x = -Math.PI/2;
ground.receiveShadow = true;
scene.add(ground);

// lake water
{
  const water = new THREE.Mesh(new THREE.CircleGeometry(LAKE.r, 28),
    new THREE.MeshLambertMaterial({ color:0x3d6f8e, transparent:true, opacity:0.92 }));
  water.rotation.x = -Math.PI/2;
  water.position.set(LAKE.x, -0.5, LAKE.z);
  scene.add(water);
}

// distant mountains with snow caps
{
  const mtnM = new THREE.MeshLambertMaterial({ color:0x66718a });
  const snowM = new THREE.MeshLambertMaterial({ color:0xe8edf4 });
  let ms = 4177;
  const mr = () => { ms = (ms*1664525+1013904223)>>>0; return ms/4294967296; };
  for (let i=0;i<16;i++){
    const a = i/16*Math.PI*2 + mr()*0.35;
    const r = 300 + mr()*80;
    const h = 50 + mr()*60;
    const x = Math.sin(a)*r, z = Math.cos(a)*r;
    const cy = h*0.5 - 8;
    const base = new THREE.Mesh(new THREE.ConeGeometry(h*0.62, h, 5), mtnM);
    base.position.set(x, cy, z);
    base.rotation.y = mr()*Math.PI;
    const cap = new THREE.Mesh(new THREE.ConeGeometry(h*0.62*0.34, h*0.32, 5), snowM);
    cap.position.set(x, cy + h/2 - h*0.16 + 0.05, z);
    cap.rotation.y = base.rotation.y;
    scene.add(base, cap);
  }
}

// drifting clouds
const clouds = [];
{
  const cm = new THREE.MeshLambertMaterial({ color:0xffffff, transparent:true, opacity:0.8 });
  let cs = 9231;
  const cr = () => { cs = (cs*1664525+1013904223)>>>0; return cs/4294967296; };
  for (let i=0;i<12;i++){
    const g = new THREE.Group();
    const nB = 3 + (cr()*3|0);
    for (let j=0;j<nB;j++){
      const s = 6 + cr()*9;
      const m = new THREE.Mesh(new THREE.SphereGeometry(s, 7, 5), cm);
      m.position.set((cr()-0.5)*s*2.4, (cr()-0.5)*2.5, (cr()-0.5)*s*1.4);
      m.scale.y = 0.42;
      g.add(m);
    }
    g.position.set((cr()-0.5)*760, 62 + cr()*32, (cr()-0.5)*760);
    g.userData.speed = 0.9 + cr()*1.4;
    scene.add(g);
    clouds.push(g);
  }
}

// stars (fade in at night)
let starPts;
{
  const v = [];
  let ss = 5501;
  const sr = () => { ss = (ss*1664525+1013904223)>>>0; return ss/4294967296; };
  for (let i=0;i<450;i++){
    const t = sr()*Math.PI*2, ph = 0.12 + sr()*1.3, R = 540;
    v.push(R*Math.sin(ph)*Math.cos(t), R*Math.cos(ph), R*Math.sin(ph)*Math.sin(t));
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(v, 3));
  starPts = new THREE.Points(g, new THREE.PointsMaterial({
    color:0xcfe0ff, size:1.8, sizeAttenuation:false, transparent:true, opacity:0, fog:false }));
  scene.add(starPts);
}

// circling birds (daytime only)
const flocks = [];
{
  const bg = new THREE.ConeGeometry(0.5, 1.6, 3);
  bg.rotateX(Math.PI/2);
  const bm = new THREE.MeshBasicMaterial({ color:0x2a2620, transparent:true, opacity:1 });
  let bs = 7717;
  const br = () => { bs = (bs*1664525+1013904223)>>>0; return bs/4294967296; };
  for (let f=0; f<3; f++){
    const g = new THREE.Group();
    for (let i=0;i<5;i++) g.add(new THREE.Mesh(bg, bm));
    scene.add(g);
    flocks.push({ g, mat:bm, cx:(br()-0.5)*260, cz:(br()-0.5)*260, R:30+br()*45, y:26+br()*14, sp:0.12+br()*0.14, ph:br()*6 });
  }
}

// ---------------------------------------------------------------- scatter: trees & rocks
// seeded PRNG so the land is identical every session (saves reference it)
let _seed = 11813;
function srand() { _seed = (_seed * 1664525 + 1013904223) >>> 0; return _seed / 4294967296; }
const trees = [], rocks = [];
{
  // tree clusters in a rough ring; rocks in a few clumps
  const trunkG = new THREE.CylinderGeometry(0.35, 0.5, 2.4, 6);
  const pineG  = new THREE.ConeGeometry(2.0, 4.4, 7);
  const blobG  = new THREE.IcosahedronGeometry(2.1, 0);
  const trunkM = new THREE.MeshLambertMaterial({ color:0x6e4a2a });
  const N = 190;
  const trunkI = new THREE.InstancedMesh(trunkG, trunkM, N);
  const pineI  = new THREE.InstancedMesh(pineG, new THREE.MeshLambertMaterial({ color:0xffffff }), N);
  const blobI  = new THREE.InstancedMesh(blobG, new THREE.MeshLambertMaterial({ color:0xffffff }), N);
  trunkI.castShadow = pineI.castShadow = blobI.castShadow = true;
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3();
  const tCol = new THREE.Color();
  let placed = 0, nPine = 0, nBlob = 0, guard = 0;
  const clusters = [];
  for (let i=0;i<10;i++){
    const a = i/10 * Math.PI*2 + srand()*0.5;
    const r = 62 + srand()*46;
    clusters.push({ x:Math.sin(a)*r, z:Math.cos(a)*r });
  }
  while (placed < N && guard++ < 4000) {
    const c = clusters[srand()*clusters.length|0];
    const x = c.x + (srand()-0.5)*26, z = c.z + (srand()-0.5)*26;
    if (Math.abs(x) > MAP-3 || Math.abs(z) > MAP-3) continue;
    if (Math.hypot(x,z) < 30) continue;
    const sc = 0.8 + srand()*0.6;
    const broadleaf = srand() < 0.38;
    q.setFromEuler(new THREE.Euler(0, srand()*Math.PI*2, 0));
    s.set(sc, sc, sc);
    m4.compose(new THREE.Vector3(x, 1.2*sc, z), q, s);
    trunkI.setMatrixAt(placed, m4);
    if (broadleaf) {
      m4.compose(new THREE.Vector3(x, (2.4+1.6)*sc, z), q, new THREE.Vector3(sc, sc*0.85, sc));
      blobI.setMatrixAt(nBlob, m4);
      // greens with the odd autumn tree
      blobI.setColorAt(nBlob, srand() < 0.1 ? tCol.setHex(0xb0772f) : tCol.setHSL(0.26+srand()*0.06, 0.42, 0.28+srand()*0.10, THREE.SRGBColorSpace));
      nBlob++;
    } else {
      m4.compose(new THREE.Vector3(x, (2.4+2.2)*sc, z), q, s);
      pineI.setMatrixAt(nPine, m4);
      pineI.setColorAt(nPine, tCol.setHSL(0.34+srand()*0.05, 0.34, 0.20+srand()*0.10, THREE.SRGBColorSpace));
      nPine++;
    }
    trees.push({ x, z });
    placed++;
  }
  trunkI.count = placed; pineI.count = nPine; blobI.count = nBlob;
  scene.add(trunkI, pineI, blobI);

  const rockG = new THREE.DodecahedronGeometry(1.4, 0);
  const rockM = new THREE.MeshLambertMaterial({ color:0x8b8b86 });
  const RN = 42;
  const rockI = new THREE.InstancedMesh(rockG, rockM, RN);
  rockI.castShadow = true;
  const rclusters = [];
  for (let i=0;i<5;i++){
    const a = srand()*Math.PI*2, r = 55 + srand()*50;
    rclusters.push({ x:Math.sin(a)*r, z:Math.cos(a)*r });
  }
  for (let i=0;i<RN;i++){
    const c = rclusters[i % rclusters.length];
    const x = c.x + (srand()-0.5)*14, z = c.z + (srand()-0.5)*14;
    const sc = 0.6 + srand()*0.9;
    q.setFromEuler(new THREE.Euler(srand(), srand()*Math.PI*2, srand()*0.4));
    m4.compose(new THREE.Vector3(x, 0.5*sc, z), q, new THREE.Vector3(sc, sc*0.7, sc));
    rockI.setMatrixAt(i, m4);
    rocks.push({ x, z });
  }
  scene.add(rockI);

  // grass tufts + wildflowers so the meadow reads as ground, not a green void
  const col = new THREE.Color();
  const tuftG = new THREE.ConeGeometry(0.24, 0.55, 4);
  tuftG.translate(0, 0.27, 0);
  const TN = 700;
  const tuftI = new THREE.InstancedMesh(tuftG, new THREE.MeshLambertMaterial({ color:0xffffff }), TN);
  for (let i=0;i<TN;i++){
    const x = (srand()-0.5)*2*(MAP+25), z = (srand()-0.5)*2*(MAP+25);
    const sc = 0.6 + srand()*0.9;
    q.setFromEuler(new THREE.Euler((srand()-0.5)*0.3, srand()*Math.PI, (srand()-0.5)*0.3));
    m4.compose(new THREE.Vector3(x, 0, z), q, new THREE.Vector3(sc, sc, sc));
    tuftI.setMatrixAt(i, m4);
    tuftI.setColorAt(i, col.setHSL(0.24 + srand()*0.05, 0.42, 0.30 + srand()*0.10, THREE.SRGBColorSpace));
  }
  scene.add(tuftI);

  const flwG = new THREE.SphereGeometry(0.10, 5, 4);
  const FN = 150;
  const flwI = new THREE.InstancedMesh(flwG, new THREE.MeshLambertMaterial({ color:0xffffff }), FN);
  const flwCols = [0xfff1c9, 0xf2d24b, 0xd96a6a, 0xc9a3e8];
  for (let i=0;i<FN;i++){
    const x = (srand()-0.5)*2*(MAP+20), z = (srand()-0.5)*2*(MAP+20);
    m4.compose(new THREE.Vector3(x, 0.18, z), q.identity(), new THREE.Vector3(1,1,1));
    flwI.setMatrixAt(i, m4);
    flwI.setColorAt(i, col.setHex(flwCols[(srand()*flwCols.length)|0]));
  }
  scene.add(flwI);
}

// ---------------------------------------------------------------- mesh builders
const MAT = {
  plaster: new THREE.MeshLambertMaterial({ color:0xd9c9a8 }),
  timber:  new THREE.MeshLambertMaterial({ color:0x6e4a2a }),
  roof:    new THREE.MeshLambertMaterial({ color:0xa2522f }),
  roofB:   new THREE.MeshLambertMaterial({ color:0x5f6f86 }),
  stone:   new THREE.MeshLambertMaterial({ color:0x9b978c }),
  stoneD:  new THREE.MeshLambertMaterial({ color:0x7c786e }),
  soil:    new THREE.MeshLambertMaterial({ color:0x6b4f30 }),
  crop:    new THREE.MeshLambertMaterial({ color:0xb5a33c }),
  canopy:  new THREE.MeshLambertMaterial({ color:0xa23a3a }),
  banner:  new THREE.MeshLambertMaterial({ color:0xd9a44a }),
  ruin:    new THREE.MeshLambertMaterial({ color:0x3a352e }),
  // shared window material — opacity driven by nightFactor so every window in
  // town lights up together at dusk
  window:  new THREE.MeshBasicMaterial({ color:0xffc966, transparent:true, opacity:0, depthWrite:false }),
};

// gabled roof prism: width x, height y, depth z (ridge along z).
// Extrude a triangle so winding/normals come out right on every face.
function prismGeo(w, h, d) {
  const shape = new THREE.Shape();
  shape.moveTo(-w/2, 0); shape.lineTo(w/2, 0); shape.lineTo(0, h); shape.closePath();
  const g = new THREE.ExtrudeGeometry(shape, { depth: d, bevelEnabled: false });
  g.translate(0, 0, -d/2);
  return g;
}
function box(w,h,d,mat,x=0,y=0,z=0){
  const m = new THREE.Mesh(new THREE.BoxGeometry(w,h,d), mat);
  m.position.set(x,y,z); m.castShadow = true; m.receiveShadow = true;
  return m;
}
function cyl(r1,r2,h,mat,x=0,y=0,z=0,seg=8){
  const m = new THREE.Mesh(new THREE.CylinderGeometry(r1,r2,h,seg), mat);
  m.position.set(x,y,z); m.castShadow = true;
  return m;
}
function cone(r,h,mat,x=0,y=0,z=0,seg=8){
  const m = new THREE.Mesh(new THREE.ConeGeometry(r,h,seg), mat);
  m.position.set(x,y,z); m.castShadow = true;
  return m;
}

function buildMesh(type) {
  const g = new THREE.Group();
  if (type === 'house') {
    g.add(box(2.7, 2.0, 2.7, MAT.plaster, 0, 1.0, 0));
    const roof = new THREE.Mesh(prismGeo(3.1, 1.5, 3.1), MAT.roof);
    roof.position.y = 2.0; roof.castShadow = true; g.add(roof);
    g.add(box(0.5, 1.0, 0.5, MAT.stoneD, 0.9, 3.0, 0.6)); // chimney
    for (const [wx, wz, ry] of [[-0.7, 1.36, 0], [0.7, 1.36, 0], [1.36, 0.4, Math.PI/2]]) {
      const win = new THREE.Mesh(new THREE.PlaneGeometry(0.45, 0.55), MAT.window);
      win.position.set(ry ? wz : wx, 1.15, ry ? wx : wz);
      win.rotation.y = ry; g.add(win);
    }
  } else if (type === 'farm') {
    g.add(box(5.6, 0.25, 5.6, MAT.soil, 0, 0.12, 0));
    for (let i=0;i<4;i++) g.add(box(5.0, 0.35, 0.7, MAT.crop, 0, 0.4, -2.1+i*1.4));
    g.add(box(1.6, 1.4, 1.6, MAT.timber, 2.4, 0.7, 2.4));
    const r = new THREE.Mesh(prismGeo(1.9, 0.9, 1.9), MAT.roof); r.position.set(2.4, 1.4, 2.4); r.castShadow=true; g.add(r);
  } else if (type === 'woodcutter') {
    g.add(box(2.4, 1.7, 2.4, MAT.timber, -0.3, 0.85, 0));
    const r = new THREE.Mesh(prismGeo(2.8, 1.1, 2.8), MAT.roofB); r.position.set(-0.3, 1.7, 0); r.castShadow=true; g.add(r);
    const log = cyl(0.3, 0.3, 1.8, MAT.timber, 1.3, 0.3, 0.5); log.rotation.z = Math.PI/2; g.add(log);
    const log2 = cyl(0.3, 0.3, 1.6, MAT.timber, 1.3, 0.85, 0.5); log2.rotation.z = Math.PI/2; g.add(log2);
  } else if (type === 'quarry') {
    g.add(box(3.6, 0.5, 3.6, MAT.stoneD, 0, 0.25, 0));
    g.add(box(1.4, 1.0, 1.4, MAT.stone, -0.9, 1.0, -0.9));
    g.add(box(1.0, 0.7, 1.0, MAT.stone, 0.9, 0.85, 0.6));
    const pole = cyl(0.12, 0.12, 3.4, MAT.timber, 1.2, 1.7, -1.2, 6); g.add(pole);
    const arm = box(2.2, 0.14, 0.14, MAT.timber, 0.4, 3.2, -1.2); g.add(arm);
  } else if (type === 'market') {
    g.add(box(3.8, 0.4, 3.8, MAT.timber, 0, 0.2, 0));
    for (const [px,pz] of [[-1.6,-1.6],[1.6,-1.6],[-1.6,1.6],[1.6,1.6]])
      g.add(cyl(0.12, 0.12, 2.0, MAT.timber, px, 1.3, pz, 6));
    const r = new THREE.Mesh(prismGeo(4.4, 1.1, 4.4), MAT.canopy); r.position.y = 2.3; r.castShadow=true; g.add(r);
    g.add(box(1.0, 0.7, 0.6, MAT.plaster, -0.7, 0.75, 0.4));
    g.add(box(0.8, 0.5, 0.8, MAT.crop, 0.8, 0.65, -0.5));
  } else if (type === 'tower') {
    g.add(cyl(1.1, 1.35, 7.0, MAT.stone, 0, 3.5, 0, 8));
    g.add(cyl(1.5, 1.5, 0.7, MAT.stoneD, 0, 7.3, 0, 8));
    g.add(cone(1.5, 1.9, MAT.roofB, 0, 8.6, 0, 8));
    const b = box(0.06, 1.0, 0.7, MAT.banner, 1.45, 6.4, 0); g.add(b);
  } else if (type === 'barracks') {
    g.add(box(3.8, 2.2, 2.6, MAT.stoneD, 0, 1.1, 0));
    const r = new THREE.Mesh(prismGeo(4.2, 1.3, 3.0), MAT.roofB); r.position.y = 2.2; r.castShadow=true; g.add(r);
    g.add(cyl(0.09, 0.09, 3.6, MAT.timber, 1.6, 1.8, 1.2, 6));
    g.add(box(0.06, 0.9, 0.65, MAT.banner, 1.6, 3.1, 1.55));
  } else if (type === 'keep') {
    g.add(box(4.6, 4.4, 4.6, MAT.stone, 0, 2.2, 0));
    for (const [px,pz] of [[-2.3,-2.3],[2.3,-2.3],[-2.3,2.3],[2.3,2.3]]) {
      g.add(cyl(0.9, 1.0, 5.6, MAT.stoneD, px, 2.8, pz, 8));
      g.add(cone(1.1, 1.6, MAT.roofB, px, 6.4, pz, 8));
    }
    g.add(cyl(0.08, 0.08, 3.0, MAT.timber, 0, 6.0, 0, 6));
    g.add(box(0.06, 1.0, 1.4, MAT.banner, 0, 7.0, 0.7));
    for (const ry of [0, Math.PI/2, Math.PI, -Math.PI/2]) {
      const win = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.8), MAT.window);
      win.position.set(Math.sin(ry)*2.32, 3.1, Math.cos(ry)*2.32);
      win.rotation.y = ry; g.add(win);
    }
  }
  return g;
}

// ---------------------------------------------------------------- particles
// visual-only pool: sim code spawns, frame() advances — headless sim stays pure
function softDiscTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d');
  const gr = g.createRadialGradient(32,32,2, 32,32,30);
  gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0,0,64,64);
  return new THREE.CanvasTexture(c);
}
const P_TEX = softDiscTexture();
const particles = [], P_CAP = 160;
function spawnP(x, y, z, opt) {
  let p = particles.find(q => !q.alive);
  if (!p) {
    if (particles.length >= P_CAP) return;
    p = { spr: new THREE.Sprite(new THREE.SpriteMaterial({ map:P_TEX, transparent:true, depthWrite:false })), alive:false };
    scene.add(p.spr);
    particles.push(p);
  }
  p.alive = true;
  p.life = p.maxLife = opt.life || 1;
  p.vx = opt.vx || 0; p.vy = opt.vy ?? 1.5; p.vz = opt.vz || 0;
  p.grow = opt.grow ?? 0.8;
  p._o = opt.opacity ?? 0.7;
  p.spr.material.color.setHex(opt.color);
  p.spr.material.opacity = p._o;
  p.spr.position.set(x, y, z);
  p.spr.scale.setScalar(opt.scale || 1);
  p.spr.visible = true;
}
function updateParticles(dt) {
  for (const p of particles) {
    if (!p.alive) continue;
    p.life -= dt;
    if (p.life <= 0) { p.alive = false; p.spr.visible = false; continue; }
    p.spr.position.x += p.vx*dt; p.spr.position.y += p.vy*dt; p.spr.position.z += p.vz*dt;
    p.spr.scale.setScalar(p.spr.scale.x + p.grow*dt);
    p.spr.material.opacity = p._o * (p.life / p.maxLife);
  }
}
function dustBurst(x, z, r=2, n=9) {
  for (let i=0;i<n;i++){
    const a = Math.random()*Math.PI*2;
    spawnP(x+Math.cos(a)*r*0.5, 0.3, z+Math.sin(a)*r*0.5,
      { color:0xcbb794, life:0.6+Math.random()*0.4, vx:Math.cos(a)*2.4, vz:Math.sin(a)*2.4, vy:1.1+Math.random(), grow:1.8, scale:0.8, opacity:0.55 });
  }
}
function smokePuff(x, y, z, big=false) {
  spawnP(x+(Math.random()-0.5)*1.4, y, z+(Math.random()-0.5)*1.4,
    { color:0x2e2a24, life:1.6+Math.random(), vy:1.5+Math.random(), grow: big?2.6:1.3, scale: big?1.6:0.9, opacity:0.5 });
}
function flamePuff(x, y, z) {
  spawnP(x+(Math.random()-0.5)*1.1, y, z+(Math.random()-0.5)*1.1,
    { color:0xff8a2a, life:0.45+Math.random()*0.3, vy:2.4, grow:0.3, scale:0.9, opacity:0.85 });
}

// sun disc + moon (soft sprites, driven by the atmosphere)
const sunSpr = new THREE.Sprite(new THREE.SpriteMaterial({ map:P_TEX, color:0xffe9b0, transparent:true, opacity:0.85, fog:false, depthWrite:false }));
sunSpr.scale.setScalar(46);
scene.add(sunSpr);
const moonSpr = new THREE.Sprite(new THREE.SpriteMaterial({ map:P_TEX, color:0xdfe8ff, transparent:true, opacity:0, fog:false, depthWrite:false }));
moonSpr.scale.setScalar(26);
scene.add(moonSpr);

function makeRuin(b) {
  const g = new THREE.Group();
  const def = BUILD_DEFS[b.type];
  g.add(box(def.w*0.8, 0.7, def.d*0.8, MAT.ruin, 0, 0.35, 0));
  g.add(box(def.w*0.4, 1.1, def.d*0.3, MAT.ruin, def.w*0.15, 0.55, -def.d*0.1));
  g.position.set(b.x, 0, b.z);
  return g;
}

// agents — little articulated folk: legs/arms pivot at hip/shoulder for a walk cycle
const SKIN_TONES = [0xdbb894, 0xc99b72, 0xa9764f, 0x8a5a3a];
function makeFigure(bodyColor, role='villager') {
  const g = new THREE.Group();
  const mat = c => new THREE.MeshLambertMaterial({ color:c });
  const skin = SKIN_TONES[Math.random()*SKIN_TONES.length|0];
  const bodyM = mat(bodyColor), skinM = mat(skin), darkM = mat(0x3a2d20);

  const legGeo = new THREE.BoxGeometry(0.16, 0.5, 0.2); legGeo.translate(0, -0.25, 0);
  const legL = new THREE.Mesh(legGeo, darkM); legL.position.set(-0.11, 0.5, 0);
  const legR = new THREE.Mesh(legGeo, darkM.clone()); legR.position.set(0.11, 0.5, 0);

  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.55, 0.3), bodyM); torso.position.y = 0.78;
  const belt = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.09, 0.32), darkM); belt.position.y = 0.53;

  const armGeo = new THREE.BoxGeometry(0.13, 0.46, 0.16); armGeo.translate(0, -0.18, 0);
  const armL = new THREE.Mesh(armGeo, bodyM.clone()); armL.position.set(-0.30, 1.0, 0);
  const armR = new THREE.Mesh(armGeo, bodyM.clone()); armR.position.set(0.30, 1.0, 0);
  const handGeo = new THREE.BoxGeometry(0.12, 0.1, 0.14); handGeo.translate(0, -0.42, 0);
  armL.add(new THREE.Mesh(handGeo, skinM));
  armR.add(new THREE.Mesh(handGeo, skinM.clone()));

  const head = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.28, 0.26), skinM); head.position.y = 1.22;

  g.add(legL, legR, torso, belt, armL, armR, head);

  if (role === 'villager') {
    const v = Math.random();
    if (v < 0.35) {                                              // straw hat
      const hat = cone(0.30, 0.16, mat(0xc9a86a), 0, 1.42, 0, 8);
      hat.scale.y = 0.7; g.add(hat);
    } else if (v < 0.6) {                                        // hood
      g.add(cone(0.22, 0.3, mat(new THREE.Color(bodyColor).multiplyScalar(0.7).getHex()), 0, 1.4, 0, 7));
    } else if (v < 0.8) {                                        // linen coif
      g.add(cyl(0.16, 0.17, 0.14, mat(0xe8dcc2), 0, 1.4, 0, 8));
    }                                                            // else bareheaded
    if (Math.random() < 0.3) {                                   // apron
      const ap = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.4, 0.05), mat(0xd9cfb8));
      ap.position.set(0, 0.7, 0.17); g.add(ap);
    }
  } else if (role === 'guard') {
    g.add(cyl(0.17, 0.19, 0.16, mat(0x8d949c), 0, 1.40, 0, 8));   // helmet
    g.add(cone(0.19, 0.14, mat(0x8d949c), 0, 1.52, 0, 8));
    const spear = cyl(0.03, 0.03, 1.7, mat(0x6e4a2a), 0, -0.25, 0, 5);
    spear.add(cone(0.06, 0.18, mat(0xb9bec4), 0, 0.94, 0, 6));
    armR.add(spear);                                              // carried in the right hand
    const shield = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.42, 0.34), mat(0x7a3020));
    shield.position.set(-0.09, -0.3, 0); armL.add(shield);
  } else if (role === 'bandit') {
    const hood = cone(0.24, 0.34, darkM.clone(), 0, 1.38, 0, 7);  // dark hood
    g.add(hood);
    const mask = new THREE.Mesh(new THREE.BoxGeometry(0.30, 0.10, 0.05), darkM.clone());
    mask.position.set(0, 1.20, 0.14); g.add(mask);
    const blade = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.5, 0.12), mat(0xb9bec4));
    blade.position.set(0, -0.6, 0.1); armR.add(blade);
  }
  g.traverse(o => { if (o.isMesh) o.castShadow = true; });
  g.userData.limbs = { legL, legR, armL, armR };
  return g;
}

// walk-cycle animation: swing limbs while moving, settle when still
function animateFigure(a, dt) {
  const L = a.grp.userData.limbs;
  if (!L) return;
  const target = a._moved ? 0.55 : 0;
  a._swing = (a._swing || 0) + (target - (a._swing || 0)) * Math.min(1, dt*10);
  const s = Math.sin(a.bob) * a._swing;
  L.legL.rotation.x = s;
  L.legR.rotation.x = -s;
  L.armL.rotation.x = -s * 0.7;
  L.armR.rotation.x = s * 0.7;
  a.grp.position.y = (a.baseY || 0) + Math.abs(Math.sin(a.bob)) * 0.06 * a._swing;
}

// wall sentries — ceremonial watchmen pacing the wall tops (visual only)
function sentryTick(dt) {
  for (const w of state.walls) {
    if (!w.sentries) {
      w.per = wallPerimeter(w);
      const count = Math.max(1, Math.min(3, Math.floor(w.per / 60)));
      w.sentries = [];
      for (let i=0;i<count;i++){
        const grp = makeFigure(0x54607a, 'guard');
        grp.scale.setScalar(0.85);
        scene.add(grp);
        w.sentries.push({ s:(i+0.5)*w.per/count, dir:1, grp, bob:Math.random()*6, x:0, z:0, baseY:WALL_H, _moved:false });
      }
    }
    for (const st of w.sentries) {
      st.bob += dt*7;
      let watch = null, best = 45;
      for (const bd of state.bandits) {
        const d = Math.hypot(bd.x-st.x, bd.z-st.z);
        if (d < best) { best = d; watch = bd; }
      }
      if (!watch) {
        st.s += st.dir * 1.3 * dt;
        st._moved = true;
        if (w.closed) st.s = (st.s + w.per) % w.per;
        else if (st.s >= w.per) { st.s = w.per; st.dir = -1; }
        else if (st.s <= 0) { st.s = 0; st.dir = 1; }
      }
      const p = wallPointAt(w, st.s);
      st.x = p.x; st.z = p.z;
      st.grp.position.x = p.x; st.grp.position.z = p.z;
      st.grp.rotation.y = watch ? Math.atan2(watch.x-p.x, watch.z-p.z) : p.ang + (st.dir < 0 ? Math.PI : 0);
    }
  }
}

// ---------------------------------------------------------------- walls
function pointInPoly(x, z, verts) {
  let inside = false;
  for (let i=0, j=verts.length-1; i<verts.length; j=i++) {
    const xi = verts[i].x, zi = verts[i].z, xj = verts[j].x, zj = verts[j].z;
    if (((zi > z) !== (zj > z)) && (x < (xj-xi)*(z-zi)/(zj-zi)+xi)) inside = !inside;
  }
  return inside;
}
function wardDepth(x, z) {
  let d = 0;
  for (const w of state.walls) if (pointInPoly(x, z, w.poly)) d++;
  return d;
}
function distToSeg(px, pz, ax, az, bx, bz) {
  const dx = bx-ax, dz = bz-az;
  const t = Math.max(0, Math.min(1, ((px-ax)*dx + (pz-az)*dz) / (dx*dx+dz*dz || 1)));
  return Math.hypot(px-(ax+dx*t), pz-(az+dz*t));
}
function shoelace(poly) {
  let s = 0;
  for (let i=0, j=poly.length-1; i<poly.length; j=i++)
    s += (poly[j].x + poly[i].x) * (poly[j].z - poly[i].z);
  return s / 2;
}

// snap a point onto the nearest BUILT wall segment (for joining walls)
const SNAP_R = 3.2;
function wallSnap(x, z) {
  let best = null, bestD = SNAP_R;
  for (const w of state.walls) {
    const n = w.path.length, segs = w.closed ? n : n-1;
    for (let i=0;i<segs;i++){
      const a = w.path[i], b = w.path[(i+1)%n];
      const dx = b.x-a.x, dz = b.z-a.z;
      let t = ((x-a.x)*dx + (z-a.z)*dz) / (dx*dx+dz*dz || 1);
      t = Math.max(0, Math.min(1, t));
      const px = a.x+dx*t, pz = a.z+dz*t;
      const d = Math.hypot(x-px, z-pz);
      if (d < bestD) { bestD = d; best = { wall:w, seg:i, t, x:px, z:pz }; }
    }
  }
  return best;
}

// draft path D attached at both ends to the same wall: the new ward polygon is
// D plus one of the two arcs of the host polygon between the attachment points.
// The smaller-area candidate is correct for both an outward annex (the bulge)
// and an inward partition (the carved-out inner ward).
function composeWard(sa, ea, D) {
  const ring = sa.wall.poly, n = ring.length;
  const arc = (aSeg, aT, aPt, bSeg, bT, bPt) => {
    const pts = [{ x:aPt.x, z:aPt.z }];
    if (aSeg === bSeg && aT <= bT) { pts.push({ x:bPt.x, z:bPt.z }); return pts; }
    let k = aSeg;
    do { k = (k+1)%n; pts.push({ x:ring[k].x, z:ring[k].z }); } while (k !== bSeg);
    pts.push({ x:bPt.x, z:bPt.z });
    return pts;
  };
  const pS = { x:sa.x, z:sa.z }, pE = { x:ea.x, z:ea.z };
  const polyA = D.concat(arc(ea.seg, ea.t, pE, sa.seg, sa.t, pS).slice(1, -1));
  const polyB = D.concat(arc(sa.seg, sa.t, pS, ea.seg, ea.t, pE).slice(1, -1).reverse());
  const area = p => Math.abs(shoelace(p));
  const cand = [polyA, polyB].filter(p => p.length >= 3).sort((p,q) => area(p) - area(q));
  return (cand[0] && area(cand[0]) > 16) ? cand[0] : null;
}

// --------------------------------------------- walking: walls block, gates pass
function segsCross(ax,az,bx,bz,cx,cz,dx,dz) {
  const d1 = (bx-ax)*(cz-az)-(bz-az)*(cx-ax);
  const d2 = (bx-ax)*(dz-az)-(bz-az)*(dx-ax);
  const d3 = (dx-cx)*(az-cz)-(dz-cz)*(ax-cx);
  const d4 = (dx-cx)*(bz-cz)-(dz-cz)*(bx-cx);
  return ((d1>0) !== (d2>0)) && ((d3>0) !== (d4>0));
}
function canWalk(ax, az, bx, bz) {
  for (const w of state.walls)
    for (const s of (w.blockers || []))
      if (segsCross(ax,az,bx,bz, s.ax,s.az,s.bx,s.bz)) return false;
  return true;
}
function gateWorld(w, g) {
  const n = w.path.length;
  const a = w.path[g.seg], b = w.path[(g.seg+1)%n];
  const len = Math.hypot(b.x-a.x, b.z-a.z);
  if (len < 0.001) return null;
  const gc = Math.min(len - GATE_W/2 - 1, Math.max(GATE_W/2 + 1, g.t*len));
  const ux = (b.x-a.x)/len, uz = (b.z-a.z)/len;
  return { x: a.x+ux*gc, z: a.z+uz*gc, ux, uz };
}
// a raised (closed) portcullis blocks the gap it guards
function crossesClosedGate(ax, az, bx, bz) {
  for (const w of state.walls) {
    for (const g of (w.gates || [])) {
      if ((g.openT || 0) > 0.6) continue;
      const p = gateWorld(w, g);
      if (!p) continue;
      const hx = p.ux*GATE_W/2, hz = p.uz*GATE_W/2;
      if (segsCross(ax,az,bx,bz, p.x-hx,p.z-hz, p.x+hx,p.z+hz)) return true;
    }
  }
  return false;
}
function passable(ax, az, bx, bz) {
  return canWalk(ax, az, bx, bz) && !crossesClosedGate(ax, az, bx, bz);
}
// townsfolk pull the lever as they approach; the portcullis sinks to let them
// through and rises behind them. Raiders never learned to work a lever.
function gateTick(dt) {
  for (const w of state.walls) {
    for (const g of (w.gates || [])) {
      const p = gateWorld(w, g);
      if (!p) continue;
      let want = false;
      for (const v of state.villagers) if (Math.hypot(v.x-p.x, v.z-p.z) < 5) { want = true; break; }
      if (!want) for (const gd of state.guards) if (Math.hypot(gd.x-p.x, gd.z-p.z) < 5) { want = true; break; }
      const prev = g.openT || 0;
      const target = want ? 1 : 0;
      g.openT = Math.max(0, Math.min(1, prev + Math.sign(target - prev) * dt * 1.7));
      if (prev <= 0.02 && g.openT > 0.02) AudioSys.play('creak');
      if (g._door) g._door.position.y = -g.openT * (WALL_H - 0.9);
      if (g._lever) g._lever.rotation.x = (g.openT - 0.5) * 1.1;
    }
  }
}
// waypoint path through gate centers (small Dijkstra — node counts stay tiny)
function findPath(ax, az, bx, bz) {
  if (canWalk(ax, az, bx, bz)) return [{x:bx, z:bz}];
  const nodes = [{x:ax, z:az}];
  for (const w of state.walls) for (const g of (w.gatePts || [])) nodes.push(g);
  nodes.push({x:bx, z:bz});
  const N = nodes.length;
  const dist = Array(N).fill(Infinity), prev = Array(N).fill(-1), used = Array(N).fill(false);
  dist[0] = 0;
  for (;;) {
    let u = -1, bd = Infinity;
    for (let i=0;i<N;i++) if (!used[i] && dist[i] < bd) { bd = dist[i]; u = i; }
    if (u < 0 || u === N-1) break;
    used[u] = true;
    for (let v=1;v<N;v++) {
      if (used[v] || !canWalk(nodes[u].x, nodes[u].z, nodes[v].x, nodes[v].z)) continue;
      const nd = dist[u] + Math.hypot(nodes[v].x-nodes[u].x, nodes[v].z-nodes[u].z);
      if (nd < dist[v]) { dist[v] = nd; prev[v] = u; }
    }
  }
  if (dist[N-1] === Infinity) return null;
  const path = [];
  for (let c = N-1; c > 0; c = prev[c]) path.unshift({ x:nodes[c].x, z:nodes[c].z });
  return path;
}
function wallPerimeter(w) {
  const n = w.path.length, segs = w.closed ? n : n-1;
  let L = 0;
  for (let i=0;i<segs;i++) L += Math.hypot(w.path[(i+1)%n].x-w.path[i].x, w.path[(i+1)%n].z-w.path[i].z);
  return L;
}
function wallPointAt(w, s) {
  const n = w.path.length, segs = w.closed ? n : n-1;
  let rem = s;
  for (let i=0;i<segs;i++){
    const a = w.path[i], b = w.path[(i+1)%n];
    const L = Math.hypot(b.x-a.x, b.z-a.z);
    if (rem <= L) {
      const t = L ? rem/L : 0;
      return { x:a.x+(b.x-a.x)*t, z:a.z+(b.z-a.z)*t, ang:Math.atan2(b.x-a.x, b.z-a.z) };
    }
    rem -= L;
  }
  const e = w.path[w.closed ? 0 : n-1];
  return { x:e.x, z:e.z, ang:0 };
}

// gates: [{seg, t}] — gate carved into segment `seg` at param t along it.
// Walls are built solid; gates exist only where the player cuts them (Gate tool).
function buildWallMeshes(verts, closed=true, gates=null) {
  const group = new THREE.Group();
  const n = verts.length;
  const segCount = closed ? n : n-1;
  const segLen = i => Math.hypot(verts[(i+1)%n].x-verts[i].x, verts[(i+1)%n].z-verts[i].z);
  if (!gates) gates = [];
  const blockers = [], gatePts = [];   // solid spans + gate centers, for pathing
  const merlonMats = [];
  for (let i=0;i<segCount;i++){
    const a = verts[i], b = verts[(i+1)%n];
    const len = segLen(i);
    const ang = Math.atan2(b.x-a.x, b.z-a.z);
    const mx = (a.x+b.x)/2, mz = (a.z+b.z)/2;
    const along = (off) => ({ x: mx + Math.sin(ang)*off, z: mz + Math.cos(ang)*off });
    // gate centers on this segment as along-axis offsets from the midpoint,
    // paired with their gate objects so doors/levers stay bound to state
    const segGates = (len > GATE_W + 2)
      ? gates.filter(g => g.seg === i)
          .map(g => ({ g, off: Math.min(len - GATE_W/2 - 1, Math.max(GATE_W/2 + 1, g.t*len)) - len/2 }))
          .sort((p,q) => p.off - q.off)
      : [];
    // wall spans between gates
    let cursor = -len/2;
    const spans = [];
    for (const sg of segGates) { spans.push([cursor, sg.off - GATE_W/2]); cursor = sg.off + GATE_W/2; }
    spans.push([cursor, len/2]);
    for (const [s0, s1] of spans) {
      const w2 = s1 - s0;
      if (w2 < 0.4) continue;
      const b0 = along(s0), b1 = along(s1);
      blockers.push({ ax:b0.x, az:b0.z, bx:b1.x, bz:b1.z });
      const p = along((s0+s1)/2);
      const w = box(WALL_T, WALL_H, w2, MAT.stone, p.x, WALL_H/2, p.z);
      w.rotation.y = ang; group.add(w);
      const cnt = Math.floor(w2/2.2);
      for (let k=0;k<cnt;k++){
        const q = along(s0 + (k+0.5)*w2/cnt);
        merlonMats.push({ x:q.x, z:q.z, ang });
      }
    }
    // gatehouses + portcullis doors + levers
    for (const sg of segGates) {
      const gc = sg.off;
      gatePts.push({ x: along(gc).x, z: along(gc).z });
      for (const s of [-1, 1]) {
        const p = along(gc + s * (GATE_W/2 + 0.6));
        group.add(cyl(1.2, 1.4, WALL_H+2.4, MAT.stoneD, p.x, (WALL_H+2.4)/2, p.z, 8));
        group.add(cone(1.5, 1.7, MAT.roofB, p.x, WALL_H+3.3, p.z, 8));
      }
      const p = along(gc);
      const lintel = box(WALL_T+0.4, 1.6, GATE_W, MAT.stoneD, p.x, WALL_H-0.2, p.z);
      lintel.rotation.y = ang; group.add(lintel);
      // portcullis: raised (blocking) by default, sinks into the ground to open
      const door = new THREE.Group();
      const gh = WALL_H - 1.2, gw = GATE_W - 1.2;
      for (let k=0;k<5;k++)
        door.add(box(0.16, gh, 0.16, MAT.ruin, 0, gh/2, -gw/2 + k*gw/4));
      door.add(box(0.14, 0.16, gw, MAT.ruin, 0, gh*0.35, 0));
      door.add(box(0.14, 0.16, gw, MAT.ruin, 0, gh*0.75, 0));
      door.position.set(p.x, 0, p.z);
      door.rotation.y = ang;
      group.add(door);
      sg.g._door = door;
      sg.g.openT = sg.g.openT || 0;
      // lever beside the gatehouse
      const perpX = Math.cos(ang), perpZ = -Math.sin(ang);
      const lx = p.x + perpX*2.0 + Math.sin(ang)*(GATE_W/2 + 1.4);
      const lz = p.z + perpZ*2.0 + Math.cos(ang)*(GATE_W/2 + 1.4);
      group.add(box(0.5, 0.35, 0.5, MAT.stoneD, lx, 0.18, lz));
      const handle = box(0.09, 0.9, 0.09, MAT.timber, 0, 0.45, 0);
      const hGrp = new THREE.Group();
      hGrp.add(handle);
      hGrp.add(box(0.16, 0.16, 0.16, MAT.banner, 0, 0.9, 0));
      hGrp.position.set(lx, 0.3, lz);
      hGrp.rotation.y = ang;
      group.add(hGrp);
      sg.g._lever = hGrp;
    }
    // vertex turret
    group.add(cyl(1.1, 1.3, WALL_H+1.6, MAT.stoneD, a.x, (WALL_H+1.6)/2, a.z, 8));
    group.add(cone(1.4, 1.5, MAT.roofB, a.x, WALL_H+2.3, a.z, 8));
  }
  if (!closed) {
    // turret on the far attachment point too
    const e = verts[n-1];
    group.add(cyl(1.1, 1.3, WALL_H+1.6, MAT.stoneD, e.x, (WALL_H+1.6)/2, e.z, 8));
    group.add(cone(1.4, 1.5, MAT.roofB, e.x, WALL_H+2.3, e.z, 8));
  }
  // instanced merlons
  if (merlonMats.length) {
    const im = new THREE.InstancedMesh(new THREE.BoxGeometry(WALL_T+0.2, 0.9, 0.9), MAT.stoneD, merlonMats.length);
    im.castShadow = true;
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), one = new THREE.Vector3(1,1,1);
    merlonMats.forEach((m, idx) => {
      q.setFromEuler(new THREE.Euler(0, m.ang, 0));
      m4.compose(new THREE.Vector3(m.x, WALL_H+0.45, m.z), q, one);
      im.setMatrixAt(idx, m4);
    });
    group.add(im);
  }
  return { group, gates, blockers, gatePts };
}

// rebuild one wall's meshes in place (after adding a gate)
function rebuildWall(w) {
  scene.remove(w.group);
  const r = buildWallMeshes(w.path, w.closed, w.gates);
  w.group = r.group;
  w.blockers = r.blockers;
  w.gatePts = r.gatePts;
  scene.add(w.group);
  state.villagers.forEach(v => { v.path = null; });
}

function refreshDepths() {
  for (const b of state.buildings) b.depth = wardDepth(b.x, b.z);
}

// ---------------------------------------------------------------- placement + tools
let tool = null;                 // current tool key or null
let ghost = null;                // ghost mesh group
let wallDraft = [];              // verts while drawing a wall
let startAttach = null;          // wallSnap result where the draft began on a wall
let wallPreview = new THREE.Group();
scene.add(wallPreview);

const ray = new THREE.Raycaster();
const _v3 = new THREE.Vector3();
const groundPlane = new THREE.Plane(new THREE.Vector3(0,1,0), 0);
const mouse = new THREE.Vector2();
let mouseGround = new THREE.Vector3();
let mousePx = { x:0, y:0 };

function canAfford(cost) {
  for (const k in cost) if (state[k] < cost[k]) return false;
  return true;
}
function pay(cost, sign=1) { for (const k in cost) state[k] -= cost[k]*sign; }

function overlapsBuilding(x, z, w, d, ignore=null) {
  for (const b of state.buildings) {
    if (b === ignore) continue;
    const def = BUILD_DEFS[b.type];
    if (Math.abs(b.x-x) < (def.w+w)/2 + 0.4 && Math.abs(b.z-z) < (def.d+d)/2 + 0.4) return true;
  }
  return false;
}
function nearWall(x, z, r) {
  for (const wl of state.walls) {
    const n = wl.path.length, segs = wl.closed ? n : n-1;
    for (let i=0;i<segs;i++){
      const a = wl.path[i], b2 = wl.path[(i+1)%n];
      if (distToSeg(x, z, a.x, a.z, b2.x, b2.z) < r) return true;
    }
  }
  return false;
}
function countNear(list, x, z, r) {
  let c = 0;
  for (const t of list) if (Math.hypot(t.x-x, t.z-z) <= r) c++;
  return c;
}

function placementCheck(type, x, z) {
  const def = BUILD_DEFS[type];
  if (Math.abs(x) > MAP || Math.abs(z) > MAP) return { ok:false, why:'Beyond the town lands' };
  if (def.needsWard && wardDepth(x, z) === 0) return { ok:false, why:`A ${def.nm.toLowerCase()} must stand inside walls — raise the ward first` };
  if (overlapsBuilding(x, z, def.w, def.d)) return { ok:false, why:'Blocked by a building' };
  if (nearWall(x, z, Math.max(def.w, def.d)/2 + 1.2)) return { ok:false, why:'Too close to a wall' };
  if (def.needsTrees && countNear(trees, x, z, 15) < def.needsTrees) return { ok:false, why:`Needs ${def.needsTrees}+ trees within reach` };
  if (def.needsRocks && countNear(rocks, x, z, 15) < def.needsRocks) return { ok:false, why:`Needs ${def.needsRocks}+ rocks within reach` };
  if (!canAfford(def.cost)) return { ok:false, why:'Cannot afford' };
  return { ok:true };
}

function placeBuilding(type, x, z, free=false) {
  const def = BUILD_DEFS[type];
  if (!free) {
    const chk = placementCheck(type, x, z);
    if (!chk.ok) return null;
    pay(def.cost);
  }
  const group = buildMesh(type);
  group.position.set(x, 0, z);
  scene.add(group);
  const b = { type, x, z, hp:def.hp, maxHp:def.hp, depth:wardDepth(x,z), ruined:false, group, hitFlash:0,
    buildT: free ? 1 : 0, burnT: 0, smolderT: 0 };
  if (!free) { dustBurst(x, z, Math.max(def.w, def.d)/2 + 0.5, 10); group.scale.setScalar(0.25); AudioSys.play('thunk'); }
  group.traverse(o => { o.userData.b = b; });
  state.buildings.push(b);
  return b;
}

function demolish(b) {
  if (b.type === 'keep') { msg('The Keep cannot be demolished.', 'warn'); return; }
  scene.remove(b.group);
  state.buildings.splice(state.buildings.indexOf(b), 1);
  if (!b.ruined) {
    const def = BUILD_DEFS[b.type];
    for (const k in def.cost) state[k] += Math.floor(def.cost[k]*0.5);
    msg(`${def.nm} demolished (half cost refunded).`, 'dim');
  } else msg('Rubble cleared.', 'dim');
}

function wallDraftCost() {
  let len = 0;
  for (let i=1;i<wallDraft.length;i++)
    len += Math.hypot(wallDraft[i].x-wallDraft[i-1].x, wallDraft[i].z-wallDraft[i-1].z);
  // a free-standing draft will close back to its first corner; a joined draft won't
  if (!startAttach && wallDraft.length >= 3) {
    const a = wallDraft[wallDraft.length-1], b = wallDraft[0];
    len += Math.hypot(b.x-a.x, b.z-a.z);
  }
  return Math.ceil(len * WALL_COST_PER_UNIT);
}

function wallSegsCrossBuilding(pts, closed) {
  const n = pts.length, segs = closed ? n : n-1;
  for (const b of state.buildings) {
    const def = BUILD_DEFS[b.type];
    for (let i=0;i<segs;i++){
      const a = pts[i], c = pts[(i+1)%n];
      if (distToSeg(b.x, b.z, a.x, a.z, c.x, c.z) < Math.max(def.w, def.d)/2 + 1.0) return def;
    }
  }
  return null;
}

function completeConnector(endAttach) {
  const D = wallDraft.map(v => ({ x:v.x, z:v.z }));
  const cost = wallDraftCost();
  if (state.stone < cost) { msg(`Not enough stone — this wall costs 🪨${cost}.`, 'warn'); wallDraft.pop(); return; }
  const hit = wallSegsCrossBuilding(D, false);
  if (hit) { msg(`The wall would cut through a ${hit.nm.toLowerCase()}. Route it around.`, 'warn'); wallDraft.pop(); return; }
  const poly = composeWard(startAttach, endAttach, D);
  if (!poly) { msg('That ward would be too small — give it more room.', 'warn'); wallDraft.pop(); return; }
  state.stone -= cost;
  const { group, gates, blockers, gatePts } = buildWallMeshes(D, false);
  scene.add(group);
  state.walls.push({ poly, path:D, closed:false, group, gates, blockers, gatePts });
  state.villagers.forEach(v => { v.path = null; });
  refreshDepths();
  const inside = state.buildings.filter(b => b.depth > 0 && !b.ruined).length;
  msg(`Walls joined — 🪨${cost}. A new ward is enclosed (${inside} building${inside===1?'':'s'} behind walls).`, 'good');
  const maxDepth = Math.max(...state.buildings.map(b => b.depth), 0);
  if (maxDepth >= 2) msg('An inner ward! Deep wards pay richer taxes.', 'good');
  wallDraft = []; startAttach = null;
  redrawWallPreview();
  saveGame();
}

// one gate-tool click at world coords (shared by mouse input and test hooks)
function gateClickAt(wx, wz) {
  const sp = wallSnap(wx, wz);
  if (!sp) { msg('Click on a wall to cut a gate into it.', 'warn'); return false; }
  const w = sp.wall, n = w.path.length;
  const a = w.path[sp.seg], b = w.path[(sp.seg+1)%n];
  const len = Math.hypot(b.x-a.x, b.z-a.z);
  if (len <= GATE_W + 2) { msg('That stretch of wall is too short for a gate.', 'warn'); return false; }
  if (w.gates.some(g => g.seg === sp.seg && Math.abs(g.t - sp.t) * len < GATE_W + 2)) { msg('There is already a gate there.', 'warn'); return false; }
  if (state.stone < GATE_COST) { msg(`A gate costs 🪨${GATE_COST}.`, 'warn'); return false; }
  state.stone -= GATE_COST;
  w.gates.push({ seg: sp.seg, t: sp.t });
  rebuildWall(w);
  msg('Gate cut through the wall.', 'good');
  AudioSys.play('creak');
  saveGame();
  return true;
}

// one wall-tool click at world coords (shared by mouse input and test hooks)
function wallClickAt(wx, wz) {
  const sp = wallSnap(wx, wz);
  if (sp) {
    if (!wallDraft.length) {
      // begin a joined wall on an existing one
      startAttach = sp;
      wallDraft.push({ x:sp.x, z:sp.z });
      redrawWallPreview();
      return;
    }
    if (startAttach) {
      if (sp.wall !== startAttach.wall) { msg('Both ends must join the same wall.', 'warn'); return; }
      wallDraft.push({ x:sp.x, z:sp.z });
      completeConnector(sp);
      return;
    }
    // free-standing draft ending on a wall isn't a ring — ignore the snap, treat as a corner
  }
  const x = snap(wx), z = snap(wz);
  if (Math.abs(x) > MAP || Math.abs(z) > MAP) return;
  if (!startAttach && wallDraft.length >= 3 && Math.hypot(x-wallDraft[0].x, z-wallDraft[0].z) < 3.5) { tryCloseWall(); return; }
  if (wallDraft.length && Math.hypot(x-wallDraft[wallDraft.length-1].x, z-wallDraft[wallDraft.length-1].z) < 2) return;
  wallDraft.push({ x, z });
  redrawWallPreview();
}

function redrawWallPreview() {
  wallPreview.clear();
  const pts = [...wallDraft];
  let cursorSnapped = false;
  if (tool === 'wall') {
    const sp = wallSnap(mouseGround.x, mouseGround.z);
    cursorSnapped = !!sp;
    if (pts.length || sp) pts.push(sp ? { x:sp.x, z:sp.z } : { x:mouseGround.x, z:mouseGround.z });
  }
  for (let i=0;i<pts.length;i++){
    const isCursor = (i === pts.length-1);
    const joined = (i === 0 && startAttach) || (isCursor && cursorSnapped);
    const post = cyl(0.5, 0.6, 3.4, new THREE.MeshLambertMaterial({ color: joined ? 0x7ac36a : 0xd9a44a, transparent:true, opacity:0.85 }), pts[i].x, 1.7, pts[i].z, 6);
    wallPreview.add(post);
    if (i>0) {
      const a = pts[i-1], b = pts[i];
      const len = Math.hypot(b.x-a.x, b.z-a.z);
      const seg = box(0.5, 2.2, len, new THREE.MeshLambertMaterial({ color:0xd9a44a, transparent:true, opacity:0.45 }),
        (a.x+b.x)/2, 1.1, (a.z+b.z)/2);
      seg.rotation.y = Math.atan2(b.x-a.x, b.z-a.z);
      seg.castShadow = false;
      wallPreview.add(seg);
    }
  }
}

function tryCloseWall() {
  if (startAttach) { msg('This wall is joined — end it on the same wall to enclose a ward.', 'warn'); return; }
  if (wallDraft.length < 3) { msg('A ring needs at least 3 corners.', 'warn'); return; }
  const cost = wallDraftCost();
  if (state.stone < cost) { msg(`Not enough stone — the ring costs 🪨${cost}.`, 'warn'); return; }
  const hit = wallSegsCrossBuilding(wallDraft, true);
  if (hit) { msg(`The wall would cut through a ${hit.nm.toLowerCase()}. Route it around.`, 'warn'); return; }
  state.stone -= cost;
  const verts = wallDraft.map(v => ({x:v.x, z:v.z}));
  const { group, gates, blockers, gatePts } = buildWallMeshes(verts, true);
  scene.add(group);
  state.walls.push({ poly: verts, path: verts, closed: true, group, gates, blockers, gatePts });
  state.villagers.forEach(v => { v.path = null; });
  AudioSys.play('stone');
  if (state.walls.length === 1 && state.raidNum === 0) {
    state.raidTimer = 90;
    msg('Word of a walled town spreads. Raiders will come for its wealth.', 'warn');
  }
  refreshDepths();
  const inside = state.buildings.filter(b => b.depth > 0 && !b.ruined).length;
  msg(`Ring closed — 🪨${cost}. ${inside} building${inside===1?'':'s'} now behind walls.`, 'good');
  if (state.walls.length === 1) msg('The ring is solid stone — cut a gate with the Gate tool (0) where you want one.', 'dim');
  const maxDepth = Math.max(...state.buildings.map(b => b.depth), 0);
  if (maxDepth >= 2) msg('An inner ward! Deep wards pay richer taxes.', 'good');
  wallDraft = [];
  redrawWallPreview();
  saveGame();
}

function setTool(t) {
  if (tool === 'wall' && t !== 'wall') { wallDraft = []; startAttach = null; redrawWallPreview(); }
  tool = (tool === t) ? null : t;
  if (ghost) { scene.remove(ghost); ghost = null; }
  if (tool && BUILD_DEFS[tool]) {
    ghost = buildMesh(tool);
    ghost.traverse(o => { if (o.material) { o.material = o.material.clone(); o.material.transparent = true; o.material.opacity = 0.55; } });
    scene.add(ghost);
  }
  document.querySelectorAll('.tool').forEach(el => el.classList.toggle('active', el.dataset.t === tool));
  hintEl.style.display = 'none';
  if (tool) AudioSys.play('click');
  if (tool && TOOL_HINTS[tool] && !seenHints[tool]) { seenHints[tool] = true; msg(TOOL_HINTS[tool], 'dim'); }
}

// ---------------------------------------------------------------- UI
const $ = id => document.getElementById(id);
const hintEl = $('hint');
const logEl = $('log');
function msg(text, cls='') {
  const d = document.createElement('div');
  d.className = 'msg ' + cls;
  d.textContent = text;
  logEl.appendChild(d);
  while (logEl.children.length > 7) logEl.removeChild(logEl.firstChild);
  setTimeout(() => { d.style.transition = 'opacity 1.5s'; d.style.opacity = '0'; }, 9000);
  setTimeout(() => d.remove(), 10600);
}

// ---------------------------------------------------------------- founding charter
const OBJECTIVES = [
  { id:'wall',   label:'Ring the Keep in stone (Wall — 1)',  test:() => state.buildings.some(b => b.type==='keep' && b.depth > 0) },
  { id:'gate',   label:'Cut a gate through it (Gate — 2)',   test:() => state.walls.some(w => w.gates.length > 0) },
  { id:'houses', label:'Raise two houses in the ward',       test:() => state.buildings.filter(b => !b.ruined && b.type==='house' && b.depth>0).length >= 2 },
  { id:'farm',   label:'Plant a farm outside the walls',     test:() => state.buildings.some(b => !b.ruined && b.type==='farm') },
  { id:'raid',   label:'Survive the first raid',             test:() => state.raidNum >= 1 && state.bandits.length === 0 },
];
const objDone = {};
let objAllDoneAt = 0, objT = 0;
function updateObjectives(silent=false) {
  if (!state.started || state.over) return;
  let all = true;
  for (const o of OBJECTIVES) {
    if (!objDone[o.id]) {
      if (o.test()) { objDone[o.id] = true; if (!silent) { msg(`✔ ${o.label}`, 'good'); AudioSys.play('chime'); } }
      else all = false;
    }
  }
  if (all && !objAllDoneAt) {
    objAllDoneAt = state.time || 0.001;
    if (!silent) msg('The charter is fulfilled. Grow rich behind your walls.', 'good');
  }
  const el = $('objectives');
  if (objAllDoneAt && state.time - objAllDoneAt > 12) { el.style.display = 'none'; return; }
  el.style.display = 'block';
  el.innerHTML = '<h4>FOUNDING CHARTER</h4>' + OBJECTIVES.map(o =>
    `<div class="obj ${objDone[o.id]?'done':''}"><span class="tick">${objDone[o.id]?'✔':'▢'}</span><span class="lbl">${o.label}</span></div>`).join('');
}

const TOOL_HINTS = {
  wall: 'Click corners on the ground; click your first post (or press Enter) to close the ring. Start on an existing wall to join it.',
  gate: 'Click anywhere on a wall to cut a gate through it.',
};
const seenHints = {};

function costStr(cost) {
  const ic = { gold:'🪙', wood:'🪵', stone:'🪨' };
  return Object.entries(cost).map(([k,v]) => `${ic[k]}${v}`).join(' ') || '—';
}
{
  const TOOL_GROUPS = [
    { nm:'WALLS',    tools:['wall','gate'] },
    { nm:'TOWN',     tools:['house','market'] },
    { nm:'INDUSTRY', tools:['farm','woodcutter','quarry'] },
    { nm:'DEFENSE',  tools:['tower','barracks'] },
    { nm:'',         tools:['demolish'] },
  ];
  const pal = $('palette');
  for (const grp of TOOL_GROUPS) {
    const gEl = document.createElement('div');
    gEl.className = 'toolgroup';
    gEl.innerHTML = `<div class="gname">${grp.nm}&nbsp;</div>`;
    const row = document.createElement('div');
    row.className = 'grow';
    for (const t of grp.tools) {
      const el = document.createElement('div');
      el.className = 'tool'; el.dataset.t = t;
      const key = TOOL_ORDER.indexOf(t) === 9 ? 0 : TOOL_ORDER.indexOf(t)+1;
      if (t === 'wall') el.innerHTML = `<div class="ico">🧱</div><div class="nm">Wall</div><div class="cost">🪨${WALL_COST_PER_UNIT}/step</div>`;
      else if (t === 'gate') el.innerHTML = `<div class="ico">🚪</div><div class="nm">Gate</div><div class="cost">🪨${GATE_COST}</div>`;
      else if (t === 'demolish') el.innerHTML = `<div class="ico">🔨</div><div class="nm">Demolish</div><div class="cost">refund ½</div>`;
      else {
        const d = BUILD_DEFS[t];
        el.innerHTML = `<div class="ico">${d.ico}</div><div class="nm">${d.nm}</div><div class="cost">${costStr(d.cost)}</div>`;
      }
      el.title = `Hotkey ${key}`;
      el.onclick = () => setTool(t);
      row.appendChild(el);
    }
    gEl.appendChild(row);
    pal.appendChild(gEl);
  }
}

function fmt(n) { return Math.floor(n); }
function updateHUD() {
  $('r-gold').textContent = fmt(state.gold);
  $('r-wood').textContent = fmt(state.wood);
  $('r-stone').textContent = fmt(state.stone);
  $('r-food').textContent = fmt(state.food);
  $('r-pop').textContent = `${fmt(state.pop)}/${popCap()}`;
  $('daycount').textContent = `Day ${state.day}`;
  const warn = $('raidwarn');
  if (!state.over && state.raidTimer < 15) {
    warn.style.display = 'inline';
    warn.textContent = `⚠ RAIDERS FROM THE ${state.raidEdge.name} — ${Math.ceil(state.raidTimer)}s`;
  } else warn.style.display = state.bandits.length ? 'inline' : 'none';
  if (state.bandits.length) warn.textContent = '⚠ RAID IN PROGRESS';
  $('vignette').style.opacity = state.bandits.length ? 1 : 0;
  // food delta
  const dfood = foodRate();
  const df = $('d-food');
  df.textContent = dfood >= 0 ? ` +${dfood.toFixed(1)}/d` : ` ${dfood.toFixed(1)}/d`;
  df.style.color = dfood >= 0 ? '#8faf68' : '#ff9b6a';
  // affordability shading
  document.querySelectorAll('.tool').forEach(el => {
    const t = el.dataset.t;
    if (BUILD_DEFS[t]) el.classList.toggle('disabled', !canAfford(BUILD_DEFS[t].cost));
  });
}

// ---------------------------------------------------------------- economy
function popCap() {
  let c = 0;
  for (const b of state.buildings) if (!b.ruined && BUILD_DEFS[b.type].popCap) c += BUILD_DEFS[b.type].popCap;
  return c;
}
function foodRate() { // per day
  let r = 0;
  for (const b of state.buildings) if (!b.ruined && b.type === 'farm') r += BUILD_DEFS.farm.foodPerDay;
  return r - state.pop * 0.5;
}
let growthT = 0;
function economyTick(dt) {
  const perDay = dt / DAY;
  let tax = 0;
  const markets = state.buildings.filter(b => !b.ruined && b.type === 'market');
  const housesInside = [];
  for (const b of state.buildings) {
    if (b.ruined) continue;
    if (b.type === 'farm') state.food += BUILD_DEFS.farm.foodPerDay * perDay;
    else if (b.type === 'woodcutter') state.wood += BUILD_DEFS.woodcutter.woodPerDay * perDay;
    else if (b.type === 'quarry') state.stone += BUILD_DEFS.quarry.stonePerDay * perDay;
    else if (b.type === 'house' || b.type === 'keep') {
      const occupants = BUILD_DEFS[b.type].popCap * Math.min(1, state.pop / Math.max(1, popCap()));
      let rate = b.depth >= 1 ? 2 * (1 + 0.25 * (b.depth - 1)) : 0.8;   // deep wards pay more; outside pays little
      if (markets.some(m => Math.hypot(m.x-b.x, m.z-b.z) <= BUILD_DEFS.market.boostR)) rate *= 1.3;
      tax += occupants * rate;
      if (b.depth >= 1) housesInside.push(b);
    }
  }
  state.gold += tax * perDay;
  state.food = Math.max(0, state.food - state.pop * 0.5 * perDay);
  // growth / starvation
  growthT += dt;
  if (growthT >= 6) {
    growthT = 0;
    if (state.food <= 0 && state.pop > 2) { state.pop--; msg('The granary is empty — a family leaves.', 'warn'); }
    else if (state.food > state.pop * 1.5 && state.pop < popCap()) { state.pop++; }
  }
}

// ---------------------------------------------------------------- raids & combat
const EDGES = [
  { name:'NORTH', x:0, z:-1 }, { name:'SOUTH', x:0, z:1 },
  { name:'EAST', x:1, z:0 },  { name:'WEST', x:-1, z:0 },
];
function scheduleRaid(first=false) {
  state.raidTimer = first ? 150 : 60 + Math.random()*30;
  state.raidEdge = EDGES[Math.random()*4|0];
}
scheduleRaid(true);

function raidableTargets() {
  return state.buildings.filter(b => !b.ruined && b.depth === 0);
}

function spawnRaid() {
  state.raidNum++;
  const size = Math.min(2 + Math.floor(state.day/3) + Math.floor(state.raidNum/4), 10);
  const e = state.raidEdge;
  for (let i=0;i<size;i++){
    const ox = e.x !== 0 ? e.x * (MAP+18) : (Math.random()-0.5)*140;
    const oz = e.z !== 0 ? e.z * (MAP+18) : (Math.random()-0.5)*140;
    const grp = makeFigure(0x5c2a20, 'bandit');
    grp.position.set(ox + (Math.random()-0.5)*6, 0, oz + (Math.random()-0.5)*6);
    scene.add(grp);
    state.bandits.push({
      x:grp.position.x, z:grp.position.z, hp:35, dps:7, speed:5.5 + Math.random(),
      target:null, state:'seek', loiter:0, grp, bob:Math.random()*6,
    });
  }
  msg(`${size} raiders ride in from the ${e.name.toLowerCase()}!`, 'warn');
  AudioSys.play('horn');
  scheduleRaid();
}

function nearestEdgeExit(x, z) {
  const cand = [ {x:MAP+25, z}, {x:-MAP-25, z}, {x, z:MAP+25}, {x, z:-MAP-25} ];
  cand.sort((a,b) => Math.hypot(a.x-x,a.z-z) - Math.hypot(b.x-x,b.z-z));
  return cand[0];
}

function banditTick(bd, dt) {
  bd.bob += dt*10;
  if (bd.state === 'flee') {
    if (!bd.exit) bd.exit = nearestEdgeExit(bd.x, bd.z);
    moveToward(bd, bd.exit.x, bd.exit.z, dt);
    bd.fleeT = (bd.fleeT || 0) + dt;
    if (Math.abs(bd.x) > MAP+16 || Math.abs(bd.z) > MAP+16 || bd.fleeT > 30) removeBandit(bd);
    return;
  }
  // engaged by a guard?
  if (bd.engaged && bd.engaged.hp > 0) {
    const g = bd.engaged;
    if (Math.hypot(g.x-bd.x, g.z-bd.z) > 2.2) moveToward(bd, g.x, g.z, dt);
    else { g.hp -= bd.dps * dt; }
    return;
  }
  bd.engaged = null;
  // pick / validate target
  if (!bd.target || bd.target.ruined || bd.target.depth > 0) {
    const t = raidableTargets();
    if (!t.length) {
      // nothing to raid — jeer at the walls, then leave
      if (bd.state !== 'loiterAtWall') {
        bd.state = 'loiterAtWall'; bd.loiter = 5 + Math.random()*3;
        let vx = 0, vz = 0, best = 1e9;
        for (const w of state.walls) for (const v of w.path) {
          const d = Math.hypot(v.x-bd.x, v.z-bd.z);
          if (d < best) { best = d; vx = v.x; vz = v.z; }
        }
        bd.wallPt = state.walls.length ? { x:vx, z:vz } : { x:0, z:0 };
      }
    } else {
      t.sort((a,b) => Math.hypot(a.x-bd.x,a.z-bd.z) - Math.hypot(b.x-bd.x,b.z-bd.z));
      bd.target = t[0]; bd.state = 'seek';
    }
  }
  if (bd.state === 'loiterAtWall') {
    const d = Math.hypot(bd.wallPt.x-bd.x, bd.wallPt.z-bd.z);
    if (d > 10) moveToward(bd, bd.wallPt.x, bd.wallPt.z, dt);
    else {
      bd.loiter -= dt;
      if (bd.loiter <= 0) { bd.state = 'flee'; if (!bd.jeered) { bd.jeered = true; } }
    }
    return;
  }
  if (bd.target) {
    const t = bd.target, def = BUILD_DEFS[t.type];
    const d = Math.hypot(t.x-bd.x, t.z-bd.z);
    const reach = Math.max(def.w, def.d)/2 + 1.4;
    if (d > reach) moveToward(bd, t.x, t.z, dt);
    else {
      t.hp -= bd.dps * dt;
      t.hitFlash = 0.4;
      t.burnT = 0.5;
      if (t.hp <= 0) destroyBuilding(t, bd);
    }
  }
}
function moveToward(a, tx, tz, dt) {
  const d = Math.hypot(tx-a.x, tz-a.z);
  if (d < 0.01) return;
  a._moved = true;
  let nx = a.x + (tx-a.x)/d * a.speed * dt;
  let nz = a.z + (tz-a.z)/d * a.speed * dt;
  // walls and raised gates are solid: slide along them instead of ghosting through
  if (!passable(a.x, a.z, nx, nz)) {
    if (passable(a.x, a.z, nx, a.z)) nz = a.z;
    else if (passable(a.x, a.z, a.x, nz)) nx = a.x;
    else { nx = a.x; nz = a.z; }
  }
  a.x = nx; a.z = nz;
  // buildings are solid: push out of their footprints
  for (const b of state.buildings) {
    if (b.ruined) continue;
    const def = BUILD_DEFS[b.type];
    const hw = def.w/2 + 0.35, hd = def.d/2 + 0.35;
    const dx = a.x - b.x, dz = a.z - b.z;
    if (Math.abs(dx) < hw && Math.abs(dz) < hd) {
      if (hw - Math.abs(dx) < hd - Math.abs(dz)) a.x = b.x + Math.sign(dx || 1) * hw;
      else a.z = b.z + Math.sign(dz || 1) * hd;
    }
  }
  a.grp.position.x = a.x; a.grp.position.z = a.z;
  a.grp.rotation.y = Math.atan2(tx-a.x, tz-a.z);
}
function removeBandit(bd) {
  smokePuff(bd.x, 0.8, bd.z);
  AudioSys.play('fall');
  scene.remove(bd.grp);
  const i = state.bandits.indexOf(bd);
  if (i >= 0) state.bandits.splice(i, 1);
  if (!state.bandits.length && !state.over) msg('The raid is over.', 'good');
}

function destroyBuilding(b, byBandit=null) {
  b.ruined = true; b.hp = 0;
  b.burnT = 0; b.smolderT = 25;
  AudioSys.play('crash');
  for (let i=0;i<6;i++) { flamePuff(b.x, 1.5, b.z); smokePuff(b.x, 2.0, b.z, true); }
  scene.remove(b.group);
  b.group = makeRuin(b);
  b.group.traverse(o => { o.userData.b = b; });
  scene.add(b.group);
  if (byBandit) {
    const loot = Math.min(25, Math.floor(state.gold));
    state.gold -= loot;
    byBandit.state = 'flee'; byBandit.target = null;
    msg(`${BUILD_DEFS[b.type].nm} burned! Raiders make off with 🪙${loot}.`, 'warn');
  }
  if (b.type === 'keep') gameOver();
}

function spawnGuard(bk) {
  const grp = makeFigure(0x3a5a8c, 'guard');
  grp.position.set(bk.x + 2, 0, bk.z + 2);
  scene.add(grp);
  const g = { x:bk.x+2, z:bk.z+2, hp:60, dps:12, speed:7, home:bk, patrol:null, grp, bob:Math.random()*6 };
  state.guards.push(g);
  return g;
}
function guardTick(g, dt) {
  if (g.home.ruined) { scene.remove(g.grp); state.guards.splice(state.guards.indexOf(g),1); return; }
  if (g.hp <= 0) {
    smokePuff(g.x, 0.8, g.z);
    scene.remove(g.grp);
    state.guards.splice(state.guards.indexOf(g), 1);
    g.home.respawnQ = (g.home.respawnQ || 0) + 1;
    msg('A guard has fallen.', 'warn');
    return;
  }
  g.bob += dt*10;
  // find bandit near home
  let foe = null, best = 32;
  for (const bd of state.bandits) {
    const d = Math.hypot(bd.x-g.home.x, bd.z-g.home.z);
    if (d < best) { best = d; foe = bd; }
  }
  if (foe) {
    const d = Math.hypot(foe.x-g.x, foe.z-g.z);
    if (d > 2.0) moveToward(g, foe.x, foe.z, dt);
    else {
      foe.engaged = g;
      foe.hp -= g.dps * dt;
      if (foe.hp <= 0) { removeBandit(foe); msg('A raider is cut down.', 'good'); }
    }
    return;
  }
  // patrol
  g.patrolAge = (g.patrolAge || 0) + dt;
  if (!g.patrol || g.patrolAge > 7 || Math.hypot(g.patrol.x-g.x, g.patrol.z-g.z) < 1) {
    g.patrol = { x:g.home.x + (Math.random()-0.5)*20, z:g.home.z + (Math.random()-0.5)*20 };
    g.patrolAge = 0;
  }
  moveToward(g, g.patrol.x, g.patrol.z, dt * 0.45);
}

// towers
const arrowGeo = new THREE.BoxGeometry(0.09, 0.09, 1.4);
const arrowMat = new THREE.MeshBasicMaterial({ color:0xffe6a0 });
function towerTick(tw, dt) {
  tw.cool = (tw.cool || 0) - dt;
  if (tw.cool > 0 || !state.bandits.length) return;
  const def = BUILD_DEFS.tower;
  let foe = null, best = def.range;
  for (const bd of state.bandits) {
    const d = Math.hypot(bd.x-tw.x, bd.z-tw.z);
    if (d < best) { best = d; foe = bd; }
  }
  if (!foe) return;
  tw.cool = 0.7;
  foe.hp -= def.dps * 0.7;
  const m = new THREE.Mesh(arrowGeo, arrowMat);
  const from = new THREE.Vector3(tw.x, 7.2, tw.z);
  const to = new THREE.Vector3(foe.x, 1.0, foe.z);
  m.position.copy(from);
  m.lookAt(to);
  scene.add(m);
  state.arrows.push({ m, from, to, t:0 });
  if (foe.hp <= 0) removeBandit(foe);
}
function arrowTick(a, dt) {
  a.t += dt * 5;
  if (a.t >= 1) { scene.remove(a.m); state.arrows.splice(state.arrows.indexOf(a),1); return; }
  a.m.position.lerpVectors(a.from, a.to, a.t);
  a.m.position.y += Math.sin(a.t * Math.PI) * 2.2;
}

// ---------------------------------------------------------------- villagers (ambience)
function villagerTick(dt) {
  const want = Math.min(Math.floor(state.pop), 18);
  const homes = state.buildings.filter(b => !b.ruined && (b.type==='house' || b.type==='keep'));
  while (state.villagers.length < want && homes.length) {
    const h = homes[Math.random()*homes.length|0];
    const grp = makeFigure([0x8c6a3a, 0x5a7a4a, 0x7a5a7a, 0x9c8248, 0x6a4a6a, 0x4a6a7a, 0xa87848, 0x836b52][Math.random()*8|0], 'villager');
    grp.scale.setScalar(0.7 + Math.random()*0.22);
    grp.position.set(h.x+1.5, 0, h.z+1.5);
    scene.add(grp);
    state.villagers.push({ x:h.x+1.5, z:h.z+1.5, home:h, tgt:null, speed:1.6, grp, bob:Math.random()*6, wait:Math.random()*3 });
  }
  while (state.villagers.length > want) {
    const v = state.villagers.pop();
    scene.remove(v.grp);
  }
  for (const v of state.villagers) {
    if (v.home.ruined) { v.home = homes.length ? homes[0] : v.home; }
    v.bob += dt*8;
    if (v.wait > 0) { v.wait -= dt; continue; }
    if (!v.path) {
      // pick an errand: fields, market, the keep — routed through gates
      let dest = null;
      if (v.phase === 'out') dest = v.home;
      else {
        const r = Math.random();
        const farms = state.buildings.filter(b => !b.ruined && b.type === 'farm');
        const markets = state.buildings.filter(b => !b.ruined && b.type === 'market');
        if (r < 0.35 && farms.length) dest = farms[Math.random()*farms.length|0];
        else if (r < 0.55 && markets.length) dest = markets[Math.random()*markets.length|0];
        else if (r < 0.65) dest = state.buildings.find(b => b.type === 'keep');
      }
      if (dest) {
        const dd = BUILD_DEFS[dest.type];
        const oa = Math.random()*Math.PI*2;
        const off = Math.max(dd.w, dd.d)/2 + 1.0 + Math.random()*1.5;   // just outside the footprint
        v.path = findPath(v.x, v.z, dest.x + Math.cos(oa)*off, dest.z + Math.sin(oa)*off);
        if (v.path) { v.pathi = 0; v.wpT = 0; v.phase = (dest === v.home) ? 'homeward' : 'out'; }
      }
      if (!v.path) {
        // no errand (or sealed ward): wander near home without ghosting through walls
        const tx = v.home.x + (Math.random()-0.5)*12, tz = v.home.z + (Math.random()-0.5)*12;
        if (canWalk(v.x, v.z, tx, tz)) { v.path = [{x:tx, z:tz}]; v.pathi = 0; }
        else v.wait = 1.5;
        if (v.phase === 'homeward') v.phase = 'idle';
      }
      continue;
    }
    const wp = v.path[v.pathi];
    v.wpT = (v.wpT || 0) + dt;
    if (v.wpT > 8) {   // blocked (collision, crowd) — give up on this errand
      v.path = null; v.wait = 1.5;
      if (v.phase === 'homeward') v.phase = 'idle';
      continue;
    }
    if (Math.hypot(wp.x-v.x, wp.z-v.z) < 0.8) {
      v.pathi++; v.wpT = 0;
      if (v.pathi >= v.path.length) {
        v.path = null;
        v.wait = 2 + Math.random()*4;
        if (v.phase === 'homeward') v.phase = 'idle';
      }
      continue;
    }
    moveToward(v, wp.x, wp.z, dt);
  }
}

// ---------------------------------------------------------------- input
const keys = {};
addEventListener('keydown', e => {
  keys[e.code] = true;
  if (e.code === 'Escape') {
    if ($('settings').style.display !== 'none') { $('settings').style.display = 'none'; return; }
    if (tool === 'wall' && wallDraft.length) { wallDraft = []; startAttach = null; redrawWallPreview(); }
    else setTool(null);
  }
  if (e.code === 'Enter' && tool === 'wall') tryCloseWall();
  const idx = ['Digit1','Digit2','Digit3','Digit4','Digit5','Digit6','Digit7','Digit8','Digit9','Digit0'].indexOf(e.code);
  if (idx >= 0 && idx < TOOL_ORDER.length) setTool(TOOL_ORDER[idx]);
});
addEventListener('keyup', e => { keys[e.code] = false; });

let dragBtn = -1, lastMx = 0, lastMy = 0, dragDist = 0;
renderer.domElement.addEventListener('contextmenu', e => e.preventDefault());
renderer.domElement.addEventListener('pointerdown', e => {
  dragBtn = e.button; lastMx = e.clientX; lastMy = e.clientY; dragDist = 0;
});
addEventListener('pointerup', e => {
  if (dragBtn === 0 && dragDist < 6) {
    // refresh cursor state from the event itself (synthetic clicks may skip pointermove)
    mousePx.x = e.clientX; mousePx.y = e.clientY;
    mouse.x = (e.clientX/innerWidth)*2 - 1;
    mouse.y = -(e.clientY/innerHeight)*2 + 1;
    ray.setFromCamera(mouse, camera);
    ray.ray.intersectPlane(groundPlane, mouseGround);
    handleClick();
  }
  dragBtn = -1;
});
addEventListener('pointermove', e => {
  mousePx.x = e.clientX; mousePx.y = e.clientY;
  mouse.x = (e.clientX/innerWidth)*2 - 1;
  mouse.y = -(e.clientY/innerHeight)*2 + 1;
  if (dragBtn >= 0) {
    const dx = e.clientX-lastMx, dy = e.clientY-lastMy;
    dragDist += Math.abs(dx) + Math.abs(dy);
    if (dragBtn === 2) { camYaw -= dx*0.005; camPitch += dy*0.004; }
    else if (dragBtn === 1 || (dragBtn === 0 && !tool)) {
      const panSpeed = camDist * 0.0016;
      const fx = Math.sin(camYaw), fz = Math.cos(camYaw);
      camTarget.x -= (-dx*fz*0 + dx*Math.cos(camYaw))*panSpeed + (dy*Math.sin(camYaw))*panSpeed;
      camTarget.z -= (-dx*Math.sin(camYaw))*panSpeed + (dy*Math.cos(camYaw))*panSpeed;
    }
    lastMx = e.clientX; lastMy = e.clientY;
  }
});
addEventListener('wheel', e => { camDist *= (1 + Math.sign(e.deltaY)*0.09); }, { passive:true });
addEventListener('resize', () => {
  camera.aspect = innerWidth/innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

function snap(v) { return Math.round(v); }

function handleClick() {
  if (!state.started || state.over) return;
  if (tool === 'wall') {
    wallClickAt(mouseGround.x, mouseGround.z);
    return;
  }
  if (tool === 'gate') {
    gateClickAt(mouseGround.x, mouseGround.z);
    return;
  }
  if (tool === 'demolish') {
    const b = pickBuilding();
    if (b) { demolish(b); saveGame(); }
    return;
  }
  if (tool && BUILD_DEFS[tool]) {
    const x = snap(mouseGround.x), z = snap(mouseGround.z);
    const chk = placementCheck(tool, x, z);
    if (!chk.ok) { msg(chk.why, 'warn'); return; }
    const b = placeBuilding(tool, x, z);
    if (b) {
      const inside = b.depth > 0;
      if (!inside && b.type !== 'farm' && b.type !== 'woodcutter' && b.type !== 'quarry')
        msg(`${BUILD_DEFS[b.type].nm} built OUTSIDE the walls — raiders can reach it.`, 'warn');
      saveGame();
      if (!keys.ShiftLeft && !keys.ShiftRight) setTool(null);
    }
  }
}
function pickBuilding() {
  ray.setFromCamera(mouse, camera);
  const hits = ray.intersectObjects(state.buildings.map(b => b.group), true);
  return hits.length ? hits[0].object.userData.b : null;
}

// ---------------------------------------------------------------- game over / restart
function gameOver() {
  state.over = true;
  $('go-stats').textContent = `Your town stood for ${state.day} days · population ${fmt(state.pop)} · ${state.walls.length} ring${state.walls.length===1?'':'s'} of wall.`;
  $('gameover').style.display = 'flex';
  localStorage.removeItem('bulwark-save');
}
$('restartbtn').onclick = () => location.reload();
$('newtown').onclick = () => {
  if (confirm('Erase this town and start over?')) {
    localStorage.removeItem('bulwark-save');
    location.reload();
  }
};

// ---------------------------------------------------------------- save / load
function saveGame(key = 'bulwark-save') {
  if (state.over || !state.started) return;
  try {
    localStorage.setItem(key, JSON.stringify({
      gold:state.gold, wood:state.wood, stone:state.stone, food:state.food,
      pop:state.pop, time:state.time, raidNum:state.raidNum,
      buildings: state.buildings.map(b => ({ type:b.type, x:b.x, z:b.z, hp:b.hp, ruined:b.ruined })),
      walls: state.walls.map(w => ({ poly:w.poly, path:w.path, closed:w.closed,
        gates: w.gates.map(g => ({ seg:g.seg, t:g.t })) })),   // strip runtime door refs
    }));
  } catch (e) {}
}
function loadGame() {
  let s = null;
  try { s = JSON.parse(localStorage.getItem('bulwark-save')); } catch (e) {}
  if (!s) return false;
  Object.assign(state, { gold:s.gold, wood:s.wood, stone:s.stone, food:s.food, pop:s.pop, time:s.time, raidNum:s.raidNum||0 });
  state.day = Math.floor(s.time / DAY) + 1;
  for (const w of s.walls) {
    const path = w.path || w.verts, poly = w.poly || w.verts;   // legacy saves used {verts}
    const closed = w.closed !== undefined ? w.closed : true;
    const { group, gates, blockers, gatePts } = buildWallMeshes(path, closed, w.gates || null);
    scene.add(group);
    state.walls.push({ poly, path, closed, group, gates, blockers, gatePts });
  }
  for (const b of s.buildings) {
    const nb = placeBuilding(b.type, b.x, b.z, true);
    nb.hp = b.hp;
    if (b.ruined) destroyBuilding(nb);
  }
  refreshDepths();
  return true;
}

function newTownSetup() {
  placeBuilding('keep', 0, 0, true);
  msg('Welcome to the valley. The Keep stands alone.', 'dim');
  msg('Walls first: ring the Keep in stone (Wall tool, key 1).', 'dim');
  updateObjectives(true);
}

// ---------------------------------------------------------------- main loop
function step(dt) {
  if (!state.started || state.over) return;
  state.time += dt;
  const newDay = Math.floor(state.time / DAY) + 1;
  if (newDay !== state.day) {
    state.day = newDay;
    if (state.day === 2) msg('Day 2 — the scouts report bandits mustering beyond the treeline.', 'dim');
    saveGame();
  }
  economyTick(dt);
  // raiders only muster once there are walls worth plundering
  if (state.walls.length) {
    state.raidTimer -= dt;
    if (state.raidTimer <= 0) spawnRaid();
  }
  for (const bd of [...state.bandits]) banditTick(bd, dt);
  for (const g of [...state.guards]) guardTick(g, dt);
  for (const b of state.buildings) {
    if (b.ruined) continue;
    if (b.type === 'tower' && b.depth === 0 || b.type === 'tower') towerTick(b, dt);
    if (b.type === 'barracks') {
      const mine = state.guards.filter(g => g.home === b).length;
      b.respawnT = (b.respawnT || 0) - dt;
      if (mine < BUILD_DEFS.barracks.guards && b.respawnT <= 0) {
        spawnGuard(b);
        b.respawnT = 14;
      }
    }
    if (b.hitFlash > 0) {
      b.hitFlash -= dt;
      const f = b.hitFlash > 0 ? Math.sin(state.time*30)*0.5+0.5 : 0;
      b.group.traverse(o => { if (o.material && o.material.emissive) o.material.emissive.setRGB(f*0.6, f*0.1, 0); });
      if (b.hitFlash <= 0) b.group.traverse(o => { if (o.material && o.material.emissive) o.material.emissive.setRGB(0,0,0); });
    }
  }
  for (const a of [...state.arrows]) arrowTick(a, dt);
  villagerTick(dt);
  sentryTick(dt);
  gateTick(dt);
  // walk-cycle pass: reads the _moved flags the ticks above just set
  const figures = [...state.bandits, ...state.guards, ...state.villagers];
  for (const w of state.walls) if (w.sentries) figures.push(...w.sentries);
  for (const a of figures) {
    animateFigure(a, dt);
    a._moved = false;
  }
  objT += dt;
  if (objT >= 0.5) { objT = 0; updateObjectives(); }
}

function frame(dt) {
  // WASD pan
  const pan = camDist * 0.9 * dt;
  const fx = Math.sin(camYaw), fz = Math.cos(camYaw);
  if (keys.KeyW || keys.ArrowUp)    { camTarget.x -= fx*pan; camTarget.z -= fz*pan; }
  if (keys.KeyS || keys.ArrowDown)  { camTarget.x += fx*pan; camTarget.z += fz*pan; }
  if (keys.KeyA || keys.ArrowLeft)  { camTarget.x -= fz*pan; camTarget.z += fx*pan; }
  if (keys.KeyD || keys.ArrowRight) { camTarget.x += fz*pan; camTarget.z -= fx*pan; }
  if (keys.KeyQ) camYaw += dt*1.6;
  if (keys.KeyE) camYaw -= dt*1.6;
  camTarget.x = Math.max(-MAP, Math.min(MAP, camTarget.x));
  camTarget.z = Math.max(-MAP, Math.min(MAP, camTarget.z));
  updateCamera();

  // ghost + hint
  ray.setFromCamera(mouse, camera);
  ray.ray.intersectPlane(groundPlane, mouseGround);
  if (tool === 'wall') {
    redrawWallPreview();
    if (wallDraft.length) {
      hintEl.style.display = 'block';
      hintEl.style.left = (mousePx.x + 16) + 'px';
      hintEl.style.top = (mousePx.y + 12) + 'px';
      const cost = wallDraftCost();
      const afford = state.stone >= cost;
      hintEl.innerHTML = `${startAttach ? 'Wall' : 'Ring'} cost: <span class="${afford?'safe':'unsafe'}">🪨${cost}</span>` +
        `\n${wallDraft.length} corner${wallDraft.length===1?'':'s'} — ` +
        (startAttach ? 'end on the same wall to enclose a ward'
          : (wallDraft.length >= 3 ? 'click the first post or press Enter to close' : 'click to add corners'));
    } else hintEl.style.display = 'none';
  } else if (tool === 'gate') {
    const sp = wallSnap(mouseGround.x, mouseGround.z);
    hintEl.style.display = 'block';
    hintEl.style.left = (mousePx.x + 16) + 'px';
    hintEl.style.top = (mousePx.y + 12) + 'px';
    hintEl.innerHTML = sp
      ? `<span class="safe">🚪 Cut a gate here — 🪨${GATE_COST}</span>`
      : `Click a wall to cut a gate (🪨${GATE_COST})`;
  } else if (ghost && tool) {
    const x = snap(mouseGround.x), z = snap(mouseGround.z);
    ghost.position.set(x, 0, z);
    const chk = placementCheck(tool, x, z);
    const depth = wardDepth(x, z);
    ghost.traverse(o => {
      if (o.material) {
        o.material.color.setHex(chk.ok ? (depth > 0 ? 0x7ac36a : 0xd9c46a) : 0xc34a3a);
      }
    });
    hintEl.style.display = 'block';
    hintEl.style.left = (mousePx.x + 16) + 'px';
    hintEl.style.top = (mousePx.y + 12) + 'px';
    const safety = depth > 0
      ? `<span class="safe">🛡 Ward ${['','I','II','III','IV','V'][Math.min(depth,5)]} — protected${depth>1?`, tax ×${(1+0.25*(depth-1)).toFixed(2)}`:''}</span>`
      : `<span class="unsafe">⚠ Outside the walls — raidable</span>`;
    hintEl.innerHTML = (chk.ok ? safety : `<span class="unsafe">✖ ${chk.why}</span>`);
  } else if (state.started && !state.over) {
    // no tool: hover a building for its ledger entry
    const b = pickBuilding();
    if (b) {
      const def = BUILD_DEFS[b.type];
      hintEl.style.display = 'block';
      hintEl.style.left = (mousePx.x + 16) + 'px';
      hintEl.style.top = (mousePx.y + 12) + 'px';
      let html = `${def.ico} ${def.nm}${b.ruined ? ' — ruin (Demolish to clear)' : ''}`;
      if (!b.ruined && (b.type === 'house' || b.type === 'keep')) {
        const occ = Math.round(def.popCap * Math.min(1, state.pop / Math.max(1, popCap())));
        const rate = b.depth >= 1 ? 2 * (1 + 0.25 * (b.depth - 1)) : 0.8;
        html += `\n<span class="${b.depth ? 'safe' : 'unsafe'}">${b.depth ? `🛡 Ward ${['','I','II','III','IV','V'][Math.min(b.depth,5)]}` : '⚠ Outside walls'}</span> · ${occ} folk · 🪙${(occ*rate).toFixed(1)}/day`;
      }
      if (!b.ruined && b.hp < b.maxHp - 0.5) html += `\n${Math.round(b.hp)}/${b.maxHp} hp`;
      hintEl.innerHTML = html;
    } else hintEl.style.display = 'none';
  } else hintEl.style.display = 'none';

  // visual pass: atmosphere, particles, build-in scaling, fire & smoke
  if (!state.started) camYaw += dt * 0.05;   // slow orbit behind the title screen
  updateAtmosphere();
  AudioSys.update(dt, nightFactor);
  updateParticles(dt);
  for (const c of clouds) {
    c.position.x += c.userData.speed * dt;
    if (c.position.x > 420) c.position.x = -420;
  }
  for (const fl of flocks) {
    fl.ph += dt * fl.sp;
    fl.g.visible = nightFactor < 0.75;
    fl.mat.opacity = Math.max(0, 1 - nightFactor * 1.3);
    fl.g.children.forEach((b, i) => {
      const a = fl.ph + i * 0.35;
      b.position.set(fl.cx + Math.cos(a) * fl.R, fl.y + Math.sin(a * 3 + i) * 1.5, fl.cz + Math.sin(a) * fl.R);
      b.rotation.y = -a;
    });
  }
  for (const b of state.buildings) {
    if (b.buildT < 1) {
      b.buildT = Math.min(1, b.buildT + dt);
      const e = 1 - Math.pow(1 - b.buildT, 3);
      b.group.scale.set(0.3+0.7*e, 0.15+0.85*e, 0.3+0.7*e);
    }
    if (b.burnT > 0) {
      b.burnT -= dt;
      b._fl = (b._fl || 0) - dt;
      if (b._fl <= 0) { b._fl = 0.12; flamePuff(b.x, 1.4, b.z); if (Math.random() < 0.5) smokePuff(b.x, 2.4, b.z); }
    }
    if (b.smolderT > 0) {
      b.smolderT -= dt;
      b._smk = (b._smk || 0) - dt;
      if (b._smk <= 0) { b._smk = 0.4; smokePuff(b.x, 0.8, b.z); }
    }
  }

  // raid direction marker at the screen edge
  const arrowEl = $('raidarrow');
  let rx = null, rz = null;
  if (state.started && !state.over) {
    if (state.bandits.length) {
      rx = state.bandits.reduce((s,b) => s+b.x, 0) / state.bandits.length;
      rz = state.bandits.reduce((s,b) => s+b.z, 0) / state.bandits.length;
    } else if (state.walls.length && state.raidTimer < 20 && state.raidEdge) {
      rx = state.raidEdge.x * (MAP+12); rz = state.raidEdge.z * (MAP+12);
    }
  }
  if (rx !== null) {
    _v3.set(rx, 1, rz).project(camera);
    let sx = (_v3.x*0.5+0.5)*innerWidth, sy = (-_v3.y*0.5+0.5)*innerHeight;
    sx = Math.max(50, Math.min(innerWidth-50, sx));
    sy = Math.max(60, Math.min(innerHeight-90, sy));
    arrowEl.style.display = 'block';
    arrowEl.style.left = (sx-15) + 'px';
    arrowEl.style.top = (sy-20) + 'px';
    arrowEl.style.transform = `rotate(${Math.atan2(sy - innerHeight/2, sx - innerWidth/2) * 180/Math.PI}deg)`;
  } else arrowEl.style.display = 'none';

  updateHUD();
  renderer.render(scene, camera);
}

let last = performance.now(), lastRAF = performance.now();
let autosaveT = 0;
// consume ALL elapsed real time in fixed substeps so throttled RAF (hidden or
// occluded tab) never slows the simulation — clamped to 1s to avoid spirals
function advance(now) {
  let elapsed = Math.min(1.0, (now - last) / 1000);
  last = now;
  autosaveT += elapsed;
  while (elapsed > 0) { const h = Math.min(0.05, elapsed); step(h); elapsed -= h; }
  if (autosaveT > 15) { autosaveT = 0; saveGame(); }
}
function tick(now) {
  requestAnimationFrame(tick);
  const frameDt = Math.min(0.1, (now - lastRAF) / 1000);
  lastRAF = now;
  advance(now);
  frame(frameDt);
}
requestAnimationFrame(tick);

// watchdog: hidden/unfocused panes can stall RAF — keep simulating + rendering
setInterval(() => {
  const now = performance.now();
  if (now - lastRAF > 500) { advance(now); frame(0.05); }
}, 300);

// ---------------------------------------------------------------- settings & saves
const settings = Object.assign({ music:70, sfx:80, amb:60, shadows:true },
  JSON.parse(localStorage.getItem('bulwark-settings') || '{}'));
function applySettings(persist = true) {
  AudioSys.setVolumes({ music:settings.music/100, sfx:settings.sfx/100, amb:settings.amb/100 });
  sun.castShadow = settings.shadows;
  renderer.shadowMap.needsUpdate = true;
  if (persist) localStorage.setItem('bulwark-settings', JSON.stringify(settings));
}
function slotMeta(key) {
  try {
    const s = JSON.parse(localStorage.getItem(key));
    if (!s) return null;
    return `Day ${Math.floor(s.time/DAY)+1} · ${Math.floor(s.pop)} folk · 🪙${Math.floor(s.gold)}`;
  } catch (e) { return null; }
}
function renderSlots() {
  const rows = [
    ['bulwark-save', 'Autosave', false],
    ['bulwark-slot-1', 'Slot 1', true],
    ['bulwark-slot-2', 'Slot 2', true],
    ['bulwark-slot-3', 'Slot 3', true],
  ];
  const el = $('slots');
  el.innerHTML = '';
  for (const [key, nm, canSave] of rows) {
    const meta = slotMeta(key);
    const row = document.createElement('div');
    row.className = 'slotrow';
    row.innerHTML = `<span class="snm">${nm}</span><span class="smeta">${meta || '— empty —'}</span>`;
    if (canSave && state.started && !state.over) {
      const b = document.createElement('button');
      b.textContent = 'SAVE';
      b.onclick = () => { saveGame(key); renderSlots(); AudioSys.play('coin'); };
      row.appendChild(b);
    }
    if (meta) {
      const b = document.createElement('button');
      b.textContent = 'LOAD';
      b.onclick = () => { localStorage.setItem('bulwark-boot-slot', key); location.reload(); };
      row.appendChild(b);
    }
    el.appendChild(row);
  }
}
function openSettings() {
  $('set-music').value = settings.music;
  $('set-sfx').value = settings.sfx;
  $('set-amb').value = settings.amb;
  $('set-shadows').checked = settings.shadows;
  renderSlots();
  $('settings').style.display = 'flex';
}
$('set-music').oninput = e => { settings.music = +e.target.value; applySettings(); };
$('set-sfx').oninput = e => { settings.sfx = +e.target.value; applySettings(); AudioSys.play('click'); };
$('set-amb').oninput = e => { settings.amb = +e.target.value; applySettings(); };
$('set-shadows').onchange = e => { settings.shadows = e.target.checked; applySettings(); };
$('settingsClose').onclick = () => { $('settings').style.display = 'none'; };
$('gearbtn').onclick = openSettings;
$('titleSettings').onclick = openSettings;
applySettings(false);

// ---------------------------------------------------------------- boot
function startGame(cont) {
  $('intro').style.display = 'none';
  state.started = true;
  AudioSys.init();
  applySettings(false);
  if (cont && loadGame()) {
    msg('The town wakes.', 'dim');
    updateObjectives(true);   // seed the charter from restored progress, silently
  } else newTownSetup();
}
{
  const bootSlot = localStorage.getItem('bulwark-boot-slot');
  if (bootSlot) {
    localStorage.removeItem('bulwark-boot-slot');
    const data = localStorage.getItem(bootSlot);
    if (data) localStorage.setItem('bulwark-save', data);
    startGame(true);
  } else {
    if (localStorage.getItem('bulwark-save')) $('contbtn').style.display = '';
    $('contbtn').onclick = () => startGame(true);
    $('startbtn').onclick = () => {
      if (localStorage.getItem('bulwark-save') && !confirm('Start a new town? The current autosave will be overwritten.')) return;
      localStorage.removeItem('bulwark-save');
      startGame(false);
    };
  }
}

// headless / test hooks (per project convention: expose sim + step)
window.BULWARK = {
  state, step,
  place: (t,x,z) => placeBuilding(t,x,z),
  wall: (verts) => { wallDraft = verts.map(v=>({x:v[0],z:v[1]})); startAttach = null; tryCloseWall(); },
  clickWall: (x,z) => { const prev = tool; tool = 'wall'; wallClickAt(x, z); tool = prev; },
  cutGate: (x,z) => gateClickAt(x, z),
  start: () => { $('intro').style.display='none'; state.started = true; if (!state.buildings.length) newTownSetup(); },
  sim: (seconds, dt=0.1) => { for (let t=0;t<seconds;t+=dt) step(dt); return { ...state, buildings:state.buildings.length, walls:state.walls.length, bandits:state.bandits.length }; },
};
