// BULWARK — medieval town builder where THE WALL IS THE TOWN.
// Closed wall rings define wards; nesting depth raises taxes; everything
// outside the rings is raidable by bandits.
import * as THREE from 'three';
import { installTests } from './tests.js';
import { iconSVG, resSVG } from './icons.js';
import { AudioSys } from './audio.js';

// ---------------------------------------------------------------- constants
const MAP = 120;              // half-extent of buildable land
const DAY = 60;               // seconds per day
const WALL_COST_PER_UNIT = 1.2;   // stone
const WALL_H = 5, WALL_T = 1.4;
const GATE_W = 6;

const BUILD_DEFS = {
  hovel:      { nm:'Hovel',      w:2,  d:2,  hp:40,  cost:{wood:10},            popCap:2, needsWard:true },
  house:      { nm:'House',      w:3,  d:3,  hp:60,  cost:{wood:20},            popCap:4, needsWard:true },
  townhouse:  { nm:'Townhouse',  w:3,  d:3,  hp:90,  cost:{},                   popCap:8, needsWard:true },  // upgrade only
  manor:      { nm:'Manor',      w:3,  d:3,  hp:120, cost:{},                   popCap:12, needsWard:true }, // upgrade only
  well:       { nm:'Well',       w:2,  d:2,  hp:60,  cost:{wood:10, stone:15},  coverR:14, needsWard:true },
  granary:    { nm:'Granary',    w:4,  d:4,  hp:80,  cost:{wood:35, stone:15},  storage:180, needsWard:true },
  greatstore: { nm:'Great Store',w:4,  d:4,  hp:100, cost:{wood:50, stone:40, gold:30}, storage:400, needsWard:true },
  market:     { nm:'Market',     w:4,  d:4,  hp:80,  cost:{wood:40, stone:20},  boostR:18, needsWard:true },
  tavern:     { nm:'Tavern',     w:3,  d:3,  hp:80,  cost:{wood:30, gold:20},   boostR:14, needsWard:true },
  chapel:     { nm:'Chapel',     w:4,  d:4,  hp:120, cost:{wood:30, stone:50, gold:40}, boostR:22, needsWard:true },
  farm:       { nm:'Farm',       w:6,  d:6,  hp:50,  cost:{wood:30},            foodPerDay:12 },
  mill:       { nm:'Mill',       w:3,  d:3,  hp:70,  cost:{wood:35, gold:10},   auraR:16 },
  woodcutter: { nm:'Woodcutter', w:3,  d:3,  hp:50,  cost:{wood:10, gold:10},   woodPerDay:8, needsTrees:2 },
  sawmill:    { nm:'Sawmill',    w:3,  d:3,  hp:70,  cost:{wood:30, gold:10},   auraR:16 },
  quarry:     { nm:'Quarry',     w:4,  d:4,  hp:80,  cost:{wood:25, gold:15},   stonePerDay:8, needsRocks:2 },
  tradepost:  { nm:'Trade Post', w:3,  d:3,  hp:60,  cost:{wood:25, gold:20} },
  stakes:     { nm:'Stakes',     w:2,  d:2,  hp:30,  cost:{wood:8},             stakeDps:6 },
  watchpost:  { nm:'Watch Post', w:2,  d:2,  hp:70,  cost:{wood:15, stone:10},  range:14, dps:6 },
  tower:      { nm:'Arrow Tower',w:2,  d:2,  hp:120, cost:{wood:20, stone:30},  range:24, dps:11 },
  ballista:   { nm:'Ballista',   w:3,  d:3,  hp:100, cost:{wood:50, gold:40},   range:34, boltDmg:60, boltCd:4.5 },
  barracks:   { nm:'Barracks',   w:4,  d:4,  hp:120, cost:{wood:40, stone:30, gold:50}, guards:3 },
  infirmary:  { nm:'Infirmary',  w:3,  d:3,  hp:90,  cost:{wood:30, stone:20, gold:25}, boostR:20, needsWard:true },
  bathhouse:  { nm:'Bathhouse',  w:3,  d:3,  hp:80,  cost:{stone:35, gold:20},  boostR:14, needsWard:true },
  school:     { nm:'School',     w:3,  d:3,  hp:80,  cost:{wood:35, gold:30},   boostR:18, needsWard:true },
  orchard:    { nm:'Orchard',    w:4,  d:4,  hp:40,  cost:{wood:20, gold:10},   foodPerDay:6 },
  beacon:     { nm:'Beacon',     w:2,  d:2,  hp:60,  cost:{wood:20, stone:10} },
  townhall:   { nm:'Town Hall',  w:4,  d:4,  hp:150, cost:{wood:60, stone:60, gold:80}, needsWard:true },
  garden:     { nm:'Garden',     w:2,  d:2,  hp:30,  cost:{wood:10, gold:5},    needsWard:true },
  fountain:   { nm:'Fountain',   w:2,  d:2,  hp:60,  cost:{stone:20, gold:15},  boostR:10, needsWard:true },
  bannerpole: { nm:'Banner',     w:2,  d:2,  hp:40,  cost:{wood:8, gold:5},     needsWard:true },
  statue:     { nm:'Statue',     w:2,  d:2,  hp:80,  cost:{stone:30, gold:30},  needsWard:true },
  keep:       { nm:'Keep',       w:6,  d:6,  hp:400, cost:{},                   popCap:8 },
};
// the palette is tabbed by trade; digits pick within the open tab
const TABS = [
  { id:'wallTab',  nm:'WALLS',  tools:['palisade','wall','highwall','woodgate','gate','greatgate'] },
  { id:'roadTab',  nm:'ROADS',  tools:['dirtroad','road','flagroad'] },
  { id:'townTab',  nm:'TOWN',   tools:['hovel','house','well','granary','greatstore','market'] },
  { id:'civicTab', nm:'CIVIC',  tools:['tavern','chapel','infirmary','bathhouse','school','townhall'] },
  { id:'workTab',  nm:'WORKS',  tools:['farm','orchard','mill','woodcutter','sawmill','quarry','tradepost'] },
  { id:'guardTab', nm:'GUARD',  tools:['stakes','watchpost','beacon','hoardings','moat','tower','ballista','barracks'] },
  { id:'decorTab', nm:'DECOR',  tools:['garden','fountain','bannerpole','statue'] },
];
const WALL_TIERS = {
  palisade: { nm:'Palisade',  res:'wood',  cost:0.8, h:3.8, flammable:true },
  wall:     { nm:'Stone Wall',res:'stone', cost:1.2, h:5.0 },
  highwall: { nm:'High Wall', res:'stone', cost:2.0, h:6.5, taxBonus:1.15 },
};
const GATE_TIERS = {
  woodgate:  { nm:'Wooden Gate', res:'stone', cost:5,  openSpd:0.9 },
  gate:      { nm:'Portcullis',  res:'stone', cost:10, openSpd:1.7 },
  greatgate: { nm:'Great Gate',  res:'stone', cost:30, openSpd:1.7, tradeBonus:1.25 },
};
const ROAD_TIERS = {
  dirtroad: { nm:'Dirt Path',  res:'wood',  cost:0.2, speed:1.2,  color:'#7a5c38' },
  road:     { nm:'Cobbles',    res:'stone', cost:0.5, speed:1.35, color:'#8f897b' },
  flagroad: { nm:'Flagstones', res:'stone', cost:1.0, speed:1.5,  color:'#a8a294', frontage:true },
  moat:     { nm:'Moat',       res:'gold',  cost:1.0, speed:0.45, color:'#3d5a6e', moat:true },
};
const HOARDING_COST = 20;   // wood, per wall — its sentries take up bows
// raider archetypes — defense finally has something to choose against
const RAIDER_KINDS = {
  raider: { hp:35,  dps:7,  spMin:5.5, spMax:6.5, color:0x5c2a20, scale:1.0 },
  runner: { hp:20,  dps:5,  spMin:8.5, spMax:9.5, color:0x7a4a20, scale:0.9 },
  brute:  { hp:120, dps:18, spMin:3.2, spMax:3.8, color:0x3a1f18, scale:1.3 },
  torch:  { hp:25,  dps:4,  spMin:6.0, spMax:7.0, color:0x6a3a4a, scale:1.0 },
};
const isWallTool = t => !!WALL_TIERS[t];
const isGateTool = t => !!GATE_TIERS[t];
const isRoadTool = t => !!ROAD_TIERS[t];
const TOOL_NAME = t => (BUILD_DEFS[t] && BUILD_DEFS[t].nm) || (WALL_TIERS[t] && WALL_TIERS[t].nm)
  || (GATE_TIERS[t] && GATE_TIERS[t].nm) || (ROAD_TIERS[t] && ROAD_TIERS[t].nm)
  || (t === 'hoardings' ? 'Hoardings' : t);
const GATE_COST = 10; // stone, for the Gate tool

// ---------------------------------------------------------------- state
const RANKS = [
  { pop: 0,  nm: 'Hamlet',  unlocks: ['palisade','wall','woodgate','dirtroad','road','hovel','house','farm','woodcutter','demolish'] },
  { pop: 12, nm: 'Village', unlocks: ['gate','well','granary','quarry','mill','sawmill','tavern','watchpost','stakes','orchard','beacon'] },
  { pop: 20, nm: 'Town',    unlocks: ['highwall','flagroad','market','chapel','tower','tradepost','fountain','garden','hoardings','moat','infirmary','bathhouse','school'] },
  { pop: 32, nm: 'City',    unlocks: ['greatgate','greatstore','barracks','statue','bannerpole','ballista','townhall'] },
];

// the year turns: 3 days a season, 12-day years. Farms follow the sun.
const SEASONS = [
  { nm:'Spring', farm:1.0,  ground:0xffffff, leaf:0xffffff },
  { nm:'Summer', farm:1.2,  ground:0xf8f2da, leaf:0xf0ecd0 },
  { nm:'Autumn', farm:1.6,  ground:0xd9c090, leaf:0xd9a860 },
  { nm:'Winter', farm:0.1,  ground:0xbfc8cc, leaf:0xb0bec6 },
];
function seasonOf(day) { return SEASONS[Math.floor((day-1)/3) % 4]; }
const SEASON_MSGS = {
  Spring: 'Spring — the fields wake.',
  Summer: 'Summer — long days, good yields.',
  Autumn: 'Autumn — the harvest swells. Winter is three days away: fill the stores.',
  Winter: 'Winter — the fields sleep. The town lives on what it has stored.',
};

const TOWN_PRE = ['Ald','Bre','Cal','Dun','El','Fen','Gild','Hart','Iron','Kes','Lang','Mor','Nor','Oak','Pen','Ravens','Stone','Thorn','Wex','Wyn'];
const TOWN_SUF = ['mere','ford','holt','wick','stead','bury','dale','march','haven','cross','field','brook','hollow'];
const FOLK_NAMES = ['Aldith','Bertram','Cedd','Duna','Edric','Frida','Godwin','Hilda','Isolde','Jorund','Kenna','Leofric','Maud','Nesta','Osric','Petra','Quill','Rowena','Sæwine','Tilla','Ulf','Verity','Wystan','Ysolt'];
const FOLK_TRADES = ['weaver','cooper','baker','mason','smith','tanner','carter','brewer','shepherd','fletcher','chandler','miller'];
const RANK_BANNER_COLORS = [0xd9a44a, 0x7aa348, 0x4a7ac3, 0xa34ac3];
const DIFF = {
  peaceful: { nm:'Peaceful', raid:0,   fire:0,   res:1.3  },
  standard: { nm:'Standard', raid:1,   fire:1,   res:1    },
  harsh:    { nm:'Harsh',    raid:1.6, fire:1.5, res:0.85 },
};

const state = {
  gold:100, wood:120, stone:155, food:60,
  townName:'', pop:6, maxPop:6, rankIdx:0, time:0, day:1,
  buildings:[],       // {type,x,z,hp,maxHp,depth,ruined,group,hitFlash}
  walls:[],           // {poly, path, closed, gates, group}
  bandits:[], guards:[], arrows:[], villagers:[], caravans:[], critters:[], wild:[], roads:[],
  difficulty:'standard',
  fireCool:150, caravanT:45, upgCool:0,
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
let camYaw = Math.PI * 0.25, camPitch = 0.9, camDist = 62;
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
let nightFactor = 0, rainFactor = 0;
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
  // rain greys the light
  if (rainFactor > 0.01) {
    scene.background.lerp(_atB.setHex(0x6a7687), rainFactor * 0.5);
    scene.fog.color.copy(scene.background);
    sun.intensity *= 1 - 0.5 * rainFactor;
    hemi.intensity *= 1 - 0.3 * rainFactor;
  }
  // low mist hangs over the meadows around dawn
  const mist = Math.max(0, 1 - Math.abs(f - 0.10) / 0.06) * (1 - rainFactor);
  scene.fog.near = 200 - mist * 145;
  scene.fog.far = 560 - mist * 250;
  nightFactor = Math.max(0, Math.min(1, 1 - (sun.intensity - 0.3) / 1.0));
  MAT.window.opacity = nightFactor * 0.95;
  // hearth-light: warmer and a touch stronger at night, with a candle flicker
  MAT.windowGlow.opacity = nightFactor * (0.4 + Math.sin(state.time*7.3)*0.03 + Math.sin(state.time*13.1)*0.02);
  MAT.windowGlow.color.setHex(nightFactor > 0.7 ? 0xffa63a : 0xffb84a);
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
// the same displacement the ground mesh uses — for planting things on the slopes
function groundY(wx, wz) {
  const dist = Math.max(Math.abs(wx), Math.abs(wz));
  const m = THREE.MathUtils.smoothstep(dist, MAP+8, MAP+90);
  const lake = 1 - THREE.MathUtils.smoothstep(Math.hypot(wx-LAKE.x, wz-LAKE.z), LAKE.r*0.6, LAKE.r*1.7);
  return m * (valueNoise2(wx*0.02, wz*0.02) * 10 + valueNoise2(wx*0.06, wz*0.06) * 2.5) * (1-lake) - lake*2.4;
}
// region meadow patches: soft tone blotches painted under the wear layer,
// so the ground reads as pasture and clay rather than one flat green
const patchCanvas = document.createElement('canvas');
patchCanvas.width = patchCanvas.height = 512;
const patchCtx = patchCanvas.getContext('2d');
const patchTex = new THREE.CanvasTexture(patchCanvas);
patchTex.colorSpace = THREE.SRGBColorSpace;
const patchMesh = new THREE.Mesh(
  new THREE.PlaneGeometry(640, 640),
  new THREE.MeshLambertMaterial({ map: patchTex, transparent: true, depthWrite: false })
);
patchMesh.rotation.x = -Math.PI/2;
patchMesh.position.y = 0.02;
scene.add(patchMesh);
const _regionTint = new THREE.Color(0xffffff);
const MOSS_M = new THREE.MeshLambertMaterial({ color:0x55643a });
const TURF_M = new THREE.MeshLambertMaterial({ color:0x687c3e });

// worn paths: agents stamp wear into an overlay canvas as they walk, so the
// town grows visible dirt roads from its gates
const WEAR_SIZE = 512, WEAR_EXTENT = MAP + 6;
const wearCanvas = document.createElement('canvas');
wearCanvas.width = wearCanvas.height = WEAR_SIZE;
const wearCtx = wearCanvas.getContext('2d');
const wearTex = new THREE.CanvasTexture(wearCanvas);
wearTex.colorSpace = THREE.SRGBColorSpace;
const wearMesh = new THREE.Mesh(
  new THREE.PlaneGeometry(WEAR_EXTENT*2, WEAR_EXTENT*2),
  new THREE.MeshLambertMaterial({ map: wearTex, transparent: true, depthWrite: false })
);
wearMesh.rotation.x = -Math.PI/2;
wearMesh.position.y = 0.03;
wearMesh.renderOrder = 1;
scene.add(wearMesh);
let wearDirty = false, wearUp = 0;
// roads: player-laid paths on a 2u grid, in three grades — folk walk faster
const roadSet = new Map();   // "gx,gz" -> tierKey
const roadKey = (x, z) => `${Math.round(x/2)*2},${Math.round(z/2)*2}`;
function stampRoadCell(gx, gz, tierKey = 'road') {
  const rt = ROAD_TIERS[tierKey] || ROAD_TIERS.road;
  const u = (gx + WEAR_EXTENT) / (WEAR_EXTENT*2) * WEAR_SIZE;
  const v = (gz + WEAR_EXTENT) / (WEAR_EXTENT*2) * WEAR_SIZE;
  const r = 2.5 / (WEAR_EXTENT*2) * WEAR_SIZE;
  wearCtx.globalAlpha = 0.95;
  wearCtx.fillStyle = rt.color;
  wearCtx.beginPath();
  wearCtx.arc(u, v, r, 0, Math.PI*2);
  wearCtx.fill();
  wearCtx.globalAlpha = 0.6;
  wearCtx.fillStyle = '#6e6a60';
  const h = Math.abs(Math.sin(gx*12.9 + gz*78.2) * 43758) % 1;
  const dots = tierKey === 'dirtroad' ? 1 : tierKey === 'flagroad' ? 4 : 3;
  for (let i = 0; i < dots; i++) {
    const a = h*6.28 + i*2.1;
    wearCtx.beginPath();
    wearCtx.arc(u + Math.cos(a)*r*0.45, v + Math.sin(a)*r*0.45, r*(tierKey==='flagroad'?0.22:0.18), 0, Math.PI*2);
    wearCtx.fill();
  }
  wearCtx.globalAlpha = 1;
  wearDirty = true;
}
function paintRoadAt(wx, wz, tierKey) {
  tierKey = ROAD_TIERS[tierKey] ? tierKey : (ROAD_TIERS[tool] ? tool : 'road');
  const rt = ROAD_TIERS[tierKey];
  if (Math.abs(wx) > MAP || Math.abs(wz) > MAP) return;
  const gx = Math.round(wx/2)*2, gz = Math.round(wz/2)*2;
  const key = `${gx},${gz}`;
  if (roadSet.get(key) === tierKey) return;   // upgrading a cell to a new grade is allowed
  if (state[rt.res] < rt.cost) {
    state._roadMsgT = (state._roadMsgT || 0) - 1;
    if (state._roadMsgT <= 0) { state._roadMsgT = 40; msg(`Not enough ${rt.res} for more road.`, 'warn'); }
    return;
  }
  state[rt.res] -= rt.cost;
  if (roadSet.has(key)) state.roads = state.roads.filter(r2 => !(r2[0] === gx && r2[1] === gz));
  roadSet.set(key, tierKey);
  state.roads.push([gx, gz, tierKey]);
  stampRoadCell(gx, gz, tierKey);
  if (rt.frontage) refreshCoverage();   // flagstone frontage boosts nearby homes
}
function roadSpeedAt(x, z) {
  const t = roadSet.get(roadKey(x, z));
  return t ? ROAD_TIERS[t].speed : 1;
}
function nearFlagRoad(x, z) {
  for (let dx = -2; dx <= 2; dx += 2)
    for (let dz = -2; dz <= 2; dz += 2)
      if (roadSet.get(`${Math.round((x+dx)/2)*2},${Math.round((z+dz)/2)*2}`) === 'flagroad') return true;
  return false;
}

// soft dark blob that seats a building into the land
function stampFoundation(x, z, w, d) {
  if (Math.abs(x) > WEAR_EXTENT || Math.abs(z) > WEAR_EXTENT) return;
  const u = (x + WEAR_EXTENT) / (WEAR_EXTENT*2) * WEAR_SIZE;
  const v = (z + WEAR_EXTENT) / (WEAR_EXTENT*2) * WEAR_SIZE;
  const rw = (w/2 + 1.0) / (WEAR_EXTENT*2) * WEAR_SIZE;
  const rh = (d/2 + 1.0) / (WEAR_EXTENT*2) * WEAR_SIZE;
  wearCtx.globalAlpha = 0.15;
  wearCtx.fillStyle = '#3a3226';
  wearCtx.beginPath();
  wearCtx.ellipse(u, v, rw, rh, 0, 0, Math.PI*2);
  wearCtx.fill();
  wearCtx.globalAlpha = 1;
  wearDirty = true;
}
function stampWear(x, z, r = 0.8, alpha = 0.05) {
  if (Math.abs(x) > WEAR_EXTENT || Math.abs(z) > WEAR_EXTENT) return;
  const u = (x + WEAR_EXTENT) / (WEAR_EXTENT*2) * WEAR_SIZE;
  const v = (z + WEAR_EXTENT) / (WEAR_EXTENT*2) * WEAR_SIZE;
  wearCtx.globalAlpha = alpha;
  wearCtx.fillStyle = '#6b5230';
  wearCtx.beginPath();
  wearCtx.arc(u, v, r / (WEAR_EXTENT*2) * WEAR_SIZE, 0, Math.PI*2);
  wearCtx.fill();
  wearDirty = true;
}

// lake water (gently rippling)
const lakeWater = new THREE.Mesh(new THREE.CircleGeometry(LAKE.r, 28),
  new THREE.MeshLambertMaterial({ color:0x3d6f8e, transparent:true, opacity:0.92 }));
lakeWater.rotation.x = -Math.PI/2;
lakeWater.position.set(LAKE.x, -0.5, LAKE.z);
scene.add(lakeWater);

// one pooled flickering light serves whichever building burns
const fireLight = new THREE.PointLight(0xff7a30, 0, 26, 1.8);
scene.add(fireLight);

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
// regions: each seed lays the land differently — saved with the town so
// woodcutter/quarry adjacency survives reloads
// each region has its own palette, tree mix and landmark — two maps should
// never read as the same place
const REGIONS = [
  { seed: 11813, nm: 'the Greenmere Vale', trees: 190, rocks: 42,
    broadleaf: 0.60, leafH: 0.27, tint: 0xffffff, flowers: 240,
    patches: ['#87a94e', '#6c8f3d'], landmark: 'stones',
    skin: { plaster: 0xffffff, roofs: 0xffffff, timber: 0x6e4a2a } },
  { seed: 40427, nm: 'the Eastmarch Downs', trees: 130, rocks: 58,
    broadleaf: 0.22, leafH: 0.22, tint: 0xf5eecf, flowers: 90,
    patches: ['#a39b55', '#8a8a4a'], landmark: 'arch',
    skin: { plaster: 0xf5edd8, roofs: 0xe9ddb8, timber: 0x82684a } },
  { seed: 90210, nm: 'the Thornwood Edge',  trees: 250, rocks: 34,
    broadleaf: 0.42, leafH: 0.31, tint: 0xdbe8cd, flowers: 60,
    patches: ['#4f7038', '#68854a'], landmark: 'waystone',
    skin: { plaster: 0xcfc2a8, roofs: 0xc4cdb8, timber: 0x503b28 } },
];
const trees = [], rocks = [];
let worldMeshes = [];
const seasonMats = { leaves: [] };   // tinted by the turning year
function scatterWorld(seed, cfg) {
  cfg = cfg || REGIONS.find(r => r.seed === seed) || REGIONS[0];
  for (const m of worldMeshes) { scene.remove(m); disposeGroup(m); }
  worldMeshes = [];
  trees.length = 0;
  rocks.length = 0;
  _seed = seed;
  const addWorld = (...ms) => { for (const m of ms) { scene.add(m); worldMeshes.push(m); } };
  // tree clusters in a rough ring; rocks in a few clumps
  const trunkG = new THREE.CylinderGeometry(0.35, 0.5, 2.4, 6);
  const pineG  = new THREE.ConeGeometry(2.0, 4.4, 7);
  const blobG  = new THREE.IcosahedronGeometry(2.1, 0);
  const trunkM = new THREE.MeshLambertMaterial({ color:0x6e4a2a });
  const N = cfg.trees;
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
    const broadleaf = srand() < (cfg.broadleaf || 0.38);
    q.setFromEuler(new THREE.Euler(0, srand()*Math.PI*2, 0));
    s.set(sc, sc, sc);
    m4.compose(new THREE.Vector3(x, 1.2*sc, z), q, s);
    trunkI.setMatrixAt(placed, m4);
    if (broadleaf) {
      m4.compose(new THREE.Vector3(x, (2.4+1.6)*sc, z), q, new THREE.Vector3(sc, sc*0.85, sc));
      blobI.setMatrixAt(nBlob, m4);
      // greens with the odd autumn tree
      blobI.setColorAt(nBlob, srand() < 0.1 ? tCol.setHex(0xb0772f) : tCol.setHSL((cfg.leafH || 0.26)+srand()*0.06, 0.42, 0.28+srand()*0.10, THREE.SRGBColorSpace));
      nBlob++;
    } else {
      m4.compose(new THREE.Vector3(x, (2.4+2.2)*sc, z), q, s);
      pineI.setMatrixAt(nPine, m4);
      pineI.setColorAt(nPine, tCol.setHSL((cfg.leafH || 0.26)+0.07+srand()*0.05, 0.34, 0.20+srand()*0.10, THREE.SRGBColorSpace));
      nPine++;
    }
    trees.push({ x, z });
    placed++;
  }
  trunkI.count = placed; pineI.count = nPine; blobI.count = nBlob;
  addWorld(trunkI, pineI, blobI);

  const rockG = new THREE.DodecahedronGeometry(1.4, 0);
  const rockM = new THREE.MeshLambertMaterial({ color:0x8b8b86 });
  const RN = cfg.rocks;
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
  addWorld(rockI);

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
  addWorld(tuftI);

  const flwG = new THREE.SphereGeometry(0.10, 5, 4);
  const FN = cfg.flowers || 150;
  const flwI = new THREE.InstancedMesh(flwG, new THREE.MeshLambertMaterial({ color:0xffffff }), FN);
  const flwCols = [0xfff1c9, 0xf2d24b, 0xd96a6a, 0xc9a3e8];
  for (let i=0;i<FN;i++){
    const x = (srand()-0.5)*2*(MAP+20), z = (srand()-0.5)*2*(MAP+20);
    m4.compose(new THREE.Vector3(x, 0.18, z), q.identity(), new THREE.Vector3(1,1,1));
    flwI.setMatrixAt(i, m4);
    flwI.setColorAt(i, col.setHex(flwCols[(srand()*flwCols.length)|0]));
  }
  addWorld(flwI);
  seasonMats.leaves = [pineI.material, blobI.material, tuftI.material];

  // leaf litter under the trees — autumn's carpet, faded elsewhere
  if (trees.length) {
    const litG = new THREE.CircleGeometry(0.22, 5);
    litG.rotateX(-Math.PI/2);
    const LN = Math.min(300, trees.length * 2);
    const litM = new THREE.MeshLambertMaterial({ color:0xffffff, transparent:true, opacity:0, depthWrite:false });
    const litI = new THREE.InstancedMesh(litG, litM, LN);
    for (let i = 0; i < LN; i++) {
      const t = trees[i % trees.length];
      const x = t.x + (srand()-0.5)*5.5, z = t.z + (srand()-0.5)*5.5;
      q.setFromEuler(new THREE.Euler(0, srand()*Math.PI*2, 0));
      m4.compose(new THREE.Vector3(x, groundY(x, z) + 0.045, z), q, s.set(0.7+srand()*0.9, 1, 0.7+srand()*0.9));
      litI.setMatrixAt(i, m4);
      litI.setColorAt(i, tCol.setHSL(0.07 + srand()*0.05, 0.55, 0.34 + srand()*0.1, THREE.SRGBColorSpace));
    }
    addWorld(litI);
    seasonMats.litterMat = litM;
  }

  // region ground character: tint + painted meadow/clay blotches
  _regionTint.setHex(cfg.tint || 0xffffff);
  // and its building culture: plaster, roof wash, timber stain
  const sk = cfg.skin || REGIONS[0].skin;
  if (sk) {
    MAT.plaster.color.setHex(sk.plaster);
    MAT.roof.color.setHex(sk.roofs);
    MAT.roofD.color.setHex(sk.roofs);
    MAT.roofB.color.setHex(sk.roofs);
    MAT.timber.color.setHex(sk.timber);
  }
  patchCtx.clearRect(0, 0, 512, 512);
  const P_EXT = 320;   // patch plane is 640 across
  for (let i = 0; i < 30; i++) {
    const px = (srand()-0.5)*2*(MAP+60), pz = (srand()-0.5)*2*(MAP+60);
    const pr = (8 + srand()*20) / (P_EXT*2) * 512;
    const u = (px + P_EXT) / (P_EXT*2) * 512, v = (pz + P_EXT) / (P_EXT*2) * 512;
    const grad = patchCtx.createRadialGradient(u, v, pr*0.15, u, v, pr);
    const col = cfg.patches ? cfg.patches[(srand()*cfg.patches.length)|0] : '#7f9c4a';
    grad.addColorStop(0, col + '55');
    grad.addColorStop(1, col + '00');
    patchCtx.fillStyle = grad;
    patchCtx.fillRect(u-pr, v-pr, pr*2, pr*2);
  }
  patchTex.needsUpdate = true;

  // reeds crowd the lake shallows
  const reedG = new THREE.ConeGeometry(0.09, 1.5, 4);
  reedG.translate(0, 0.75, 0);
  const RD = 70;
  const reedI = new THREE.InstancedMesh(reedG, new THREE.MeshLambertMaterial({ color:0xffffff }), RD);
  for (let i = 0; i < RD; i++) {
    const a = srand()*Math.PI*2, rr = LAKE.r * (1.0 + srand()*0.28);
    const x = LAKE.x + Math.sin(a)*rr, z = LAKE.z + Math.cos(a)*rr;
    const sc2 = 0.7 + srand()*0.7;
    q.setFromEuler(new THREE.Euler((srand()-0.5)*0.25, srand()*Math.PI, (srand()-0.5)*0.25));
    m4.compose(new THREE.Vector3(x, groundY(x, z), z), q, new THREE.Vector3(sc2, sc2, sc2));
    reedI.setMatrixAt(i, m4);
    reedI.setColorAt(i, tCol.setHSL(0.23 + srand()*0.05, 0.35, 0.24 + srand()*0.08, THREE.SRGBColorSpace));
  }
  addWorld(reedI);

  // low outcrop slabs anchor the rock clumps
  for (const c of rclusters) {
    const slab = box(4.5 + srand()*3, 0.7, 3.5 + srand()*2, rockM, c.x, groundY(c.x, c.z) + 0.1, c.z);
    slab.rotation.y = srand()*Math.PI;
    slab.rotation.z = (srand()-0.5)*0.08;
    slab.receiveShadow = true;
    addWorld(slab);
  }

  // the region's landmark — somewhere out past the meadows, worth walking to
  const lmGrp = new THREE.Group();
  let lx = 0, lz = 0, tries = 0;
  do {
    const a = srand()*Math.PI*2, r = 58 + srand()*30;
    lx = Math.sin(a)*r; lz = Math.cos(a)*r;
  } while (Math.hypot(lx-LAKE.x, lz-LAKE.z) < LAKE.r + 24 && tries++ < 20);
  if (cfg.landmark === 'stones') {
    // a ring of standing stones, one long since fallen
    for (let i = 0; i < 7; i++) {
      const a = i/7 * Math.PI*2, sr = 5.2;
      const h = 2.2 + srand()*1.3;
      const st = box(0.85, h, 0.55, MAT.stoneD, Math.sin(a)*sr, h/2, Math.cos(a)*sr);
      st.rotation.y = a + (srand()-0.5)*0.4;
      st.rotation.z = (srand()-0.5)*0.14;
      if (i === 4) { st.rotation.z = 1.45; st.position.y = 0.45; }   // the fallen one
      lmGrp.add(st);
    }
    lmGrp.add(box(1.4, 0.5, 1.0, MAT.stoneD, 0, 0.25, 0));   // the altar slab
  } else if (cfg.landmark === 'arch') {
    // a ruined arch — all that stands of some older hall
    for (const s of [-1, 1]) lmGrp.add(box(1.0, 3.4, 1.0, MAT.stone, s*1.9, 1.7, 0));
    const lintel = box(2.4, 0.7, 1.0, MAT.stone, -0.85, 3.6, 0);
    lintel.rotation.z = 0.18; lmGrp.add(lintel);
    lmGrp.add(box(3.0, 1.1, 0.9, MAT.ruin, 3.4, 0.55, 2.6));
    lmGrp.add(box(2.2, 0.7, 0.9, MAT.ruin, -3.2, 0.35, -2.2));
    for (let i = 0; i < 5; i++)
      lmGrp.add(box(0.5 + srand()*0.5, 0.4, 0.5 + srand()*0.4, MAT.ruin, (srand()-0.5)*6, 0.2, (srand()-0.5)*5));
  } else if (cfg.landmark === 'waystone') {
    // a mossy waystone amid the thorn brakes
    const ob = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.6, 4.6, 4), MAT.stoneD);
    ob.position.y = 2.3; ob.rotation.y = Math.PI/4; ob.castShadow = true; lmGrp.add(ob);
    lmGrp.add(cone(0.3, 0.5, MAT.stoneD, 0, 4.75, 0, 4));
    for (let i = 0; i < 4; i++) {
      const m = new THREE.Mesh(new THREE.IcosahedronGeometry(0.22 + srand()*0.15, 0), MOSS_M);
      m.scale.y = 0.5;
      m.position.set((srand()-0.5)*1.2, 0.15, (srand()-0.5)*1.2);
      lmGrp.add(m);
    }
    const thornM = new THREE.MeshLambertMaterial({ color:0x33402a });
    for (let i = 0; i < 3; i++) {
      const t = new THREE.Mesh(new THREE.IcosahedronGeometry(1.1 + srand()*0.7, 0), thornM);
      t.scale.y = 0.55;
      t.position.set((srand()-0.5)*11, 0.5, (srand()-0.5)*11);
      t.castShadow = true;
      lmGrp.add(t);
    }
  }
  lmGrp.traverse(o => { if (o.isMesh) o.castShadow = true; });
  lmGrp.position.set(lx, groundY(lx, lz), lz);
  addWorld(lmGrp);
}
// (the title-screen backdrop scatter happens after MAT exists, below)

// ---------------------------------------------------------------- baked surface textures
// deterministic canvas bakes (no RNG) — stone coursing, stucco, shingles
function bakeTexture(w, h, draw) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
function shadeHex(hex, d) {
  const r = Math.max(0, Math.min(255, ((hex>>16)&255) + d));
  const g = Math.max(0, Math.min(255, ((hex>>8)&255) + d));
  const b = Math.max(0, Math.min(255, (hex&255) + d));
  return `rgb(${r},${g},${b})`;
}
function stoneTexture(base, mortar) {
  return bakeTexture(128, 128, (g) => {
    g.fillStyle = shadeHex(mortar, 0); g.fillRect(0, 0, 128, 128);
    let y = 0, row = 0;
    while (y < 128) {
      const hh = 16 + (row % 3) * 4;
      let x = -((row * 17) % 24);
      while (x < 128) {
        const ww = 24 + ((x * 7 + row * 13) & 15);
        g.fillStyle = shadeHex(base, ((x * 31 + y * 17) % 25) - 12);
        g.fillRect(x + 1.5, y + 1.5, ww - 3, hh - 3);
        x += ww;
      }
      y += hh; row++;
    }
    // weathering speckle
    for (let i = 0; i < 500; i++) {
      const sx = (i * 61) % 128, sy = (i * 97) % 128;
      g.fillStyle = shadeHex(base, ((i * 41) % 2) ? -18 : 14);
      g.globalAlpha = 0.25;
      g.fillRect(sx, sy, 2, 2);
      g.globalAlpha = 1;
    }
  });
}
function stuccoTexture(base) {
  return bakeTexture(64, 64, (g) => {
    g.fillStyle = shadeHex(base, 0); g.fillRect(0, 0, 64, 64);
    for (let i = 0; i < 900; i++) {
      const sx = (i * 37) % 64, sy = (i * 53) % 64;
      g.fillStyle = shadeHex(base, ((i * 29) % 17) - 8);
      g.fillRect(sx, sy, 1.6, 1.6);
    }
  });
}
function shingleTexture(base) {
  return bakeTexture(64, 64, (g) => {
    g.fillStyle = shadeHex(base, -22); g.fillRect(0, 0, 64, 64);
    for (let y = 0; y < 64; y += 8) {
      const off = ((y / 8) % 2) * 8;
      for (let x = -8; x < 64; x += 16) {
        g.fillStyle = shadeHex(base, (((x + y) * 13) % 19) - 9);
        g.fillRect(x + off + 0.8, y + 0.8, 14.4, 6.6);
      }
    }
  });
}
const TEX = {
  stone: stoneTexture(0x9b978c, 0x726e64),
  stoneD: stoneTexture(0x7c786e, 0x5a564e),
  plaster: stuccoTexture(0xd9c9a8),
  roof: shingleTexture(0xa2522f),
  roofD: shingleTexture(0x7a3b26),
  roofB: shingleTexture(0x5f6f86),
};

// ---------------------------------------------------------------- mesh builders
const MAT = {
  plaster: new THREE.MeshLambertMaterial({ color:0xffffff, map:TEX.plaster }),
  timber:  new THREE.MeshLambertMaterial({ color:0x6e4a2a }),
  roof:    new THREE.MeshLambertMaterial({ color:0xffffff, map:TEX.roof }),
  roofB:   new THREE.MeshLambertMaterial({ color:0xffffff, map:TEX.roofB }),
  stone:   new THREE.MeshLambertMaterial({ color:0xffffff, map:TEX.stone }),
  stoneD:  new THREE.MeshLambertMaterial({ color:0xffffff, map:TEX.stoneD }),
  soil:    new THREE.MeshLambertMaterial({ color:0x6b4f30 }),
  crop:    new THREE.MeshLambertMaterial({ color:0xb5a33c }),
  canopy:  new THREE.MeshLambertMaterial({ color:0xa23a3a }),
  banner:  new THREE.MeshLambertMaterial({ color:0xd9a44a }),
  ruin:    new THREE.MeshLambertMaterial({ color:0x3a352e }),
  // shared window material — opacity driven by nightFactor so every window in
  // town lights up together at dusk
  window:  new THREE.MeshBasicMaterial({ color:0xffc966, transparent:true, opacity:0, depthWrite:false }),
  roofD:   new THREE.MeshLambertMaterial({ color:0xffffff, map:TEX.roofD }),
  // rank banner: recolored as the settlement grows
  rankBanner: new THREE.MeshLambertMaterial({ color:0xd9a44a }),
  // shared night-glow sprite material — one opacity knob lights every window
  windowGlow: new THREE.SpriteMaterial({ color:0xffb84a, transparent:true, opacity:0, depthWrite:false, blending:THREE.AdditiveBlending }),
};
const SHARED_MATS = new Set(Object.values(MAT));

// dispose GPU resources for a removed object tree (shared materials stay)
function disposeGroup(g) {
  g.traverse(o => {
    if (o.geometry) o.geometry.dispose();
    const mats = Array.isArray(o.material) ? o.material : (o.material ? [o.material] : []);
    for (const m of mats) if (!SHARED_MATS.has(m)) m.dispose();
  });
}

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

// ---- yard dressing: deterministic per-plot clutter, tagged for the sway pass
const CLOTH_COLS = [0xe8dcc2, 0xa9bdd4, 0xd4a9a9, 0xc9d4a9];
function laundryLine(g, vh, x, z, ry) {
  const line = new THREE.Group();
  for (const s of [-1, 1]) line.add(cyl(0.05, 0.06, 1.5, MAT.timber, s*1.05, 0.75, 0, 5));
  line.add(box(2.1, 0.03, 0.03, MAT.timber, 0, 1.42, 0));
  for (let i = 0; i < 3; i++) {
    const cl = box(0.4, 0.48, 0.03, new THREE.MeshLambertMaterial({ color: CLOTH_COLS[(((vh*29)|0) + i) % 4] }), -0.58 + i*0.58, 1.16, 0);
    cl.geometry.translate(0, -0.24, 0);   // hang from the line, swing from the top
    cl.position.y = 1.42;
    cl.userData.isCloth = true;
    cl.userData.sway = vh*7 + i*1.7;
    line.add(cl);
  }
  line.position.set(x, 0, z); line.rotation.y = ry;
  g.add(line);
}
function firewoodStack(g, x, z) {
  for (let r = 0; r < 2; r++) for (let i = 0; i < 3 - r; i++) {
    const lg = cyl(0.11, 0.11, 0.85, MAT.timber, x, 0.12 + r*0.21, z - 0.24 + i*0.24 + r*0.12, 5);
    lg.rotation.z = Math.PI/2;
    g.add(lg);
  }
}
function handCart(g, vh, x, z) {
  const cart = new THREE.Group();
  cart.add(box(1.05, 0.1, 0.66, MAT.timber, 0, 0.42, 0));
  for (const s of [-1, 1]) {
    const wh = cyl(0.25, 0.25, 0.07, MAT.timber, 0.12, 0.25, s*0.38, 8);
    wh.rotation.x = Math.PI/2; cart.add(wh);
    const handle = cyl(0.035, 0.035, 0.9, MAT.timber, -0.75, 0.28, s*0.2, 4);
    handle.rotation.z = 0.5; cart.add(handle);
  }
  cart.position.set(x, 0, z);
  cart.rotation.y = vh * Math.PI * 2;
  g.add(cart);
}
function scarecrow(g, vh, x, z) {
  g.add(cyl(0.05, 0.06, 1.5, MAT.timber, x, 0.75, z, 5));
  g.add(box(1.0, 0.07, 0.07, MAT.timber, x, 1.2, z));
  g.add(box(0.32, 0.5, 0.2, new THREE.MeshLambertMaterial({ color: CLOTH_COLS[((vh*31)|0) % 4] }), x, 1.05, z));
  g.add(new THREE.Mesh(new THREE.SphereGeometry(0.16, 6, 5), new THREE.MeshLambertMaterial({ color:0xd9c05a })).translateX(x).translateY(1.55).translateZ(z));
  g.add(cone(0.22, 0.22, MAT.roofD, x, 1.75, z, 6));
}
// wire a fresh building group: collect animated bits and blanket roofs for winter
const SNOW_M = new THREE.MeshLambertMaterial({ color:0xe9eef3 });
let winterVisible = false;
function wireGroup(b, group) {
  b._flags = []; b._chims = []; b._sway = []; b._snow = []; b._vanes = [];
  const roofs = [];
  group.traverse(o => {
    o.userData.b = b;
    if (o.userData.isFlag) b._flags.push(o);
    if (o.userData.isBlades) b._blades = o;
    if (o.userData.isChimney) b._chims.push(o);
    if (o.userData.isCloth) b._sway.push(o);
    if (o.userData.isVane) b._vanes.push(o);
    if (o.isMesh && !o.userData.isSnow &&
        (o.material === MAT.roof || o.material === MAT.roofD || o.material === MAT.roofB)) roofs.push(o);
  });
  for (const o of roofs) {
    const cap = new THREE.Mesh(o.geometry, SNOW_M);
    cap.position.copy(o.position);
    cap.rotation.copy(o.rotation);
    cap.scale.copy(o.scale).multiplyScalar(1.045);
    cap.userData.isSnow = true;
    cap.userData.b = b;
    cap.visible = winterVisible;
    (o.parent || group).add(cap);
    b._snow.push(cap);
  }
}

// old roofs gather moss — added once when a building has stood six days
function mossify(b) {
  b._mossed = true;
  const def = BUILD_DEFS[b.type];
  if (b.ruined || !def || def.w < 2 || b.type === 'farm' || b.type === 'orchard' || b.type === 'stakes') return;
  const vh = Math.abs(Math.sin(b.x*3.7 + b.z*9.1) * 921.7) % 1;
  const n = 2 + ((vh*7)|0) % 3;
  for (let i = 0; i < n; i++) {
    const m = new THREE.Mesh(new THREE.IcosahedronGeometry(0.15 + ((vh*(i+3)*13) % 1)*0.12, 0), MOSS_M);
    m.scale.y = 0.4;
    const a = (vh*31 + i*2.4) % (Math.PI*2);
    m.position.set(Math.sin(a)*def.w*0.40, 0.4 + ((vh*(i+7)*17) % 1) * 1.5, Math.cos(a)*def.d*0.40);
    b.group.add(m);
  }
}

function buildMesh(type, bx = 0, bz = 0) {
  const g = new THREE.Group();
  // deterministic per-plot variety: same spot always builds the same house
  const vh = Math.abs(Math.sin(bx*12.9898 + bz*78.233) * 43758.5453) % 1;
  // chimneys are tagged: occupied homes send up hearth smoke
  const chim = (w, h, d, x, y, z) => {
    const c = box(w, h, d, MAT.stoneD, x, y, z);
    c.userData.isChimney = true;
    return c;
  };
  // weather vanes swing to the wind in the frame pass
  const mkVane = (x, y, z) => {
    const v = new THREE.Group();
    v.add(cyl(0.025, 0.025, 0.45, MAT.ruin, 0, 0.22, 0, 4));
    v.add(box(0.55, 0.04, 0.04, MAT.ruin, 0, 0.44, 0));
    v.add(box(0.1, 0.13, 0.03, MAT.ruin, -0.27, 0.44, 0));
    const head = cone(0.05, 0.16, MAT.ruin, 0.3, 0.44, 0, 4);
    head.rotation.z = -Math.PI/2;
    v.add(head);
    v.position.set(x, y, z);
    v.userData.isVane = true;
    return v;
  };
  const mkCat = (x, y, z) => {
    const catM = new THREE.MeshLambertMaterial({ color:0x24211d });
    const cat = new THREE.Group();
    cat.add(box(0.17, 0.13, 0.32, catM, 0, 0.07, 0));
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.085, 5, 4), catM);
    head.position.set(0, 0.15, 0.17); cat.add(head);
    for (const sc of [-1, 1]) cat.add(cone(0.03, 0.07, catM, sc*0.05, 0.23, 0.17, 4));
    cat.add(box(0.04, 0.04, 0.2, catM, 0.08, 0.05, -0.24));
    cat.position.set(x, y, z);
    cat.rotation.y = vh * Math.PI * 2;
    return cat;
  };
  if (type === 'house') {
    const roofM = [MAT.roof, MAT.roofD, MAT.roofB][(vh*3)|0];
    const variant = ((vh*7)|0) % 3;
    if (variant === 1) {
      // tall narrow burgher house
      g.add(box(2.2, 2.6, 2.4, MAT.plaster, 0, 1.3, 0));
      const roof = new THREE.Mesh(prismGeo(2.6, 1.7, 2.8), roofM);
      roof.position.y = 2.6; roof.castShadow = true; g.add(roof);
      g.add(chim(0.45, 0.9, 0.45, vh > 0.5 ? 0.7 : -0.7, 3.6, 0.5));
      for (const [px, pz] of [[-1.05,-1.15],[1.05,-1.15],[-1.05,1.15],[1.05,1.15]])
        g.add(box(0.14, 2.6, 0.14, MAT.timber, px, 1.3, pz));
      g.add(box(2.3, 0.12, 0.14, MAT.timber, 0, 1.3, 1.18));
    } else if (variant === 2) {
      // L-shaped cottage with a low wing
      g.add(box(2.6, 1.9, 1.7, MAT.plaster, -0.1, 0.95, -0.55));
      const roofA = new THREE.Mesh(prismGeo(3.0, 1.3, 2.1), roofM);
      roofA.position.set(-0.1, 1.9, -0.55); roofA.castShadow = true; g.add(roofA);
      g.add(box(1.4, 1.5, 1.5, MAT.timber, 0.6, 0.75, 0.7));
      const roofB2 = new THREE.Mesh(prismGeo(1.8, 0.9, 1.9), roofM);
      roofB2.position.set(0.6, 1.5, 0.7); roofB2.castShadow = true; g.add(roofB2);
      g.add(chim(0.45, 0.9, 0.45, -1.0, 2.7, -0.5));
    } else {
      g.add(box(2.7, 2.0, 2.7, MAT.plaster, 0, 1.0, 0));
      const roof = new THREE.Mesh(prismGeo(3.1, 1.5, 3.1), roofM);
      roof.position.y = 2.0; roof.castShadow = true; g.add(roof);
      g.add(chim(0.5, 1.0, 0.5, vh > 0.5 ? 0.9 : -0.9, 3.0, 0.6));
      for (const [px, pz] of [[-1.3,-1.3],[1.3,-1.3],[-1.3,1.3],[1.3,1.3]])
        g.add(box(0.15, 2.0, 0.15, MAT.timber, px, 1.0, pz));
      for (const s of [-1, 1]) {
        g.add(box(2.85, 0.13, 0.15, MAT.timber, 0, 1.95, s*1.3));
        g.add(box(0.15, 0.13, 2.85, MAT.timber, s*1.3, 1.95, 0));
      }
    }
    // yard clutter: a barrel, crate or bench by the door
    const propR = (vh*13) % 1;
    if (propR < 0.33) g.add(cyl(0.26, 0.3, 0.5, MAT.timber, 1.15, 0.25, 1.15, 7));
    else if (propR < 0.66) g.add(box(0.5, 0.45, 0.5, MAT.timber, -1.15, 0.22, 1.15));
    else { g.add(box(0.8, 0.1, 0.3, MAT.timber, 1.05, 0.35, 1.2)); g.add(box(0.08, 0.3, 0.25, MAT.timber, 0.75, 0.15, 1.2)); g.add(box(0.08, 0.3, 0.25, MAT.timber, 1.35, 0.15, 1.2)); }
    // and the signs of a household at work
    const propR2 = (vh*31) % 1;
    if (propR2 < 0.30) laundryLine(g, vh, -1.35, 0.1, Math.PI/2);
    else if (propR2 < 0.55) firewoodStack(g, -1.3, -1.05);
    else if (propR2 < 0.75) handCart(g, vh, 1.35, -1.05);
    // window boxes on the smarter fronts
    if ((vh*43) % 1 < 0.4) for (const wx of [-0.7, 0.7]) {
      g.add(box(0.5, 0.12, 0.14, MAT.timber, wx, 0.85, 1.38));
      g.add(new THREE.Mesh(new THREE.SphereGeometry(0.07, 5, 4),
        new THREE.MeshLambertMaterial({ color: [0xd96a6a, 0xf2d24b, 0xc9a3e8][((vh*19)|0) % 3] })).translateX(wx).translateY(0.95).translateZ(1.38));
    }
    // roof jewelry: a vane on some ridges, a cat asleep on others
    if (variant === 0 && (vh*47) % 1 < 0.25) g.add(mkVane(0, 3.5, -0.9));
    else if (variant === 0 && (vh*53) % 1 < 0.16) g.add(mkCat(0, 3.45, 0.55));
    g.rotation.y = ((vh*16)|0) % 4 * Math.PI/2;
    g.rotation.z = (vh - 0.5) * 0.02;   // a little honest lean
    for (const [wx, wz, ry] of [[-0.7, 1.3, 0], [0.7, 1.3, 0]]) {
      const win = new THREE.Mesh(new THREE.PlaneGeometry(0.45, 0.55), MAT.window);
      win.position.set(wx, 1.15, wz);
      win.rotation.y = ry; g.add(win);
      const glow = new THREE.Sprite(MAT.windowGlow);
      glow.scale.setScalar(1.4);
      glow.position.copy(win.position);
      g.add(glow);
    }
  } else if (type === 'townhouse') {
    // jettied two-story townhouse — the dense-ward upgrade
    g.add(box(2.6, 2.0, 2.6, MAT.plaster, 0, 1.0, 0));
    g.add(box(2.9, 1.7, 2.9, MAT.timber, 0, 2.85, 0));
    g.add(box(2.7, 1.5, 2.7, MAT.plaster, 0, 2.85, 0));
    g.rotation.y = ((vh*16)|0) % 4 * Math.PI/2;
    const roof = new THREE.Mesh(prismGeo(3.3, 1.6, 3.3), [MAT.roof, MAT.roofD, MAT.roofB][(vh*3)|0]);
    roof.position.y = 3.7; roof.castShadow = true; g.add(roof);
    g.add(chim(0.5, 1.2, 0.5, 0.9, 4.6, 0.6));
    for (const yy of [1.15, 3.0]) {
      for (const wx of [-0.7, 0.7]) {
        const win = new THREE.Mesh(new THREE.PlaneGeometry(0.42, 0.52), MAT.window);
        win.position.set(wx, yy, yy > 2 ? 1.47 : 1.32);
        g.add(win);
        const glow = new THREE.Sprite(MAT.windowGlow);
        glow.scale.setScalar(1.3);
        glow.position.copy(win.position);
        g.add(glow);
      }
    }
  } else if (type === 'hovel') {
    const hvar = ((vh*11)|0) % 3;
    if (hvar === 1) {
      // turf-roofed stone hut
      g.add(box(1.8, 1.1, 1.8, MAT.stoneD, 0, 0.55, 0));
      const r = new THREE.Mesh(prismGeo(2.2, 0.9, 2.2), TURF_M);
      r.position.y = 1.1; r.castShadow = true; g.add(r);
      g.add(box(0.6, 0.8, 0.08, MAT.ruin, 0.1, 0.4, 0.92));
    } else if (hvar === 2) {
      // steep A-frame lean-to, thatch to the ground
      const r = new THREE.Mesh(prismGeo(2.2, 1.7, 2.0), MAT.roofD);
      r.position.y = 0; r.castShadow = true; g.add(r);
      g.add(box(0.55, 0.75, 0.08, MAT.ruin, 0.3, 0.38, 0.95));
      g.add(cyl(0.09, 0.11, 1.9, MAT.timber, -0.95, 0.9, 0, 5));
    } else {
      g.add(box(1.8, 1.4, 1.8, MAT.timber, 0, 0.7, 0));
      const r = new THREE.Mesh(prismGeo(2.2, 0.8, 2.2), MAT.roofD);
      r.position.y = 1.4; r.rotation.y = 0.06; r.castShadow = true; g.add(r);
      g.add(box(0.6, 0.9, 0.08, MAT.ruin, 0.2, 0.45, 0.92));
    }
    if ((vh*23) % 1 < 0.5) firewoodStack(g, 0.95, -0.75);
    g.rotation.y = ((vh*16)|0) % 4 * Math.PI/2;
  } else if (type === 'manor') {
    g.add(box(2.9, 1.6, 2.9, MAT.stone, 0, 0.8, 0));
    g.add(box(3.1, 1.5, 3.1, MAT.timber, 0, 2.35, 0));
    g.add(box(2.9, 1.35, 2.9, MAT.plaster, 0, 2.35, 0));
    g.add(box(3.3, 1.4, 3.3, MAT.timber, 0, 3.75, 0));
    g.add(box(3.1, 1.25, 3.1, MAT.plaster, 0, 3.75, 0));
    const roof = new THREE.Mesh(prismGeo(3.7, 1.7, 3.7), [MAT.roof, MAT.roofD][(vh*2)|0]);
    roof.position.y = 4.5; roof.castShadow = true; g.add(roof);
    g.add(chim(0.5, 1.4, 0.5, 1.0, 5.6, 0.7));
    g.add(chim(0.5, 1.2, 0.5, -1.0, 5.5, -0.7));
    const fl = box(0.05, 0.8, 1.0, MAT.rankBanner, 0, 6.6, 0.5);
    fl.userData.isFlag = true; g.add(fl);
    g.add(cyl(0.05, 0.05, 2.2, MAT.timber, 0, 5.7, 0, 5));
    for (const yy of [1.0, 2.35, 3.75]) for (const wx of [-0.8, 0.8]) {
      const win = new THREE.Mesh(new THREE.PlaneGeometry(0.4, 0.55), MAT.window);
      win.position.set(wx, yy, 1.47 + (yy>1.2 ? 0.1 : 0));
      g.add(win);
      const glow = new THREE.Sprite(MAT.windowGlow);
      glow.scale.setScalar(1.25); glow.position.copy(win.position); g.add(glow);
    }
  } else if (type === 'greatstore') {
    for (const [sx, sz] of [[-1.5,-1.1],[1.5,-1.1],[-1.5,1.1],[1.5,1.1],[0,-1.1],[0,1.1]])
      g.add(cyl(0.26, 0.36, 1.0, MAT.stoneD, sx, 0.5, sz, 6));
    g.add(box(3.7, 2.2, 2.8, MAT.timber, 0, 2.1, 0));
    const r = new THREE.Mesh(prismGeo(4.1, 1.7, 3.2), MAT.roofD);
    r.position.y = 3.2; r.castShadow = true; g.add(r);
    g.add(box(1.0, 1.3, 0.08, MAT.plaster, -1.0, 2.0, 1.44));
    g.add(box(1.0, 1.3, 0.08, MAT.plaster, 1.0, 2.0, 1.44));
  } else if (type === 'tavern') {
    g.add(box(2.7, 2.0, 2.7, MAT.plaster, 0, 1.0, 0));
    for (const [px, pz] of [[-1.3,-1.3],[1.3,-1.3],[-1.3,1.3],[1.3,1.3]])
      g.add(box(0.15, 2.0, 0.15, MAT.timber, px, 1.0, pz));
    const roof = new THREE.Mesh(prismGeo(3.1, 1.5, 3.1), [MAT.roofD, MAT.roof][(vh*2)|0]);
    roof.position.y = 2.0; roof.castShadow = true; g.add(roof);
    // the hanging sign — tagged so it swings in the wind
    g.add(cyl(0.06, 0.06, 1.6, MAT.timber, 1.6, 2.4, 0.6, 5));
    const sign = box(0.7, 0.5, 0.06, MAT.banner, 1.6, 1.9, 0.9);
    sign.geometry.translate(0, -0.25, 0);
    sign.position.y = 2.15;
    sign.userData.isCloth = true; sign.userData.sway = vh*11;
    g.add(sign);
    g.add(cyl(0.3, 0.35, 0.5, MAT.timber, -1.6, 0.25, 1.0, 7));
    g.add(cyl(0.3, 0.35, 0.5, MAT.timber, -1.0, 0.25, 1.4, 7));
    if (vh < 0.55) {   // trestle table and benches by the door
      g.add(box(0.95, 0.08, 0.5, MAT.timber, -0.3, 0.5, 1.15));
      g.add(box(0.1, 0.5, 0.4, MAT.timber, -0.65, 0.25, 1.15));
      g.add(box(0.1, 0.5, 0.4, MAT.timber, 0.05, 0.25, 1.15));
      for (const s of [-1, 1]) g.add(box(0.9, 0.06, 0.18, MAT.timber, -0.3, 0.3, 1.15 + s*0.42));
    }
    const win = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.55), MAT.window);
    win.position.set(0, 1.1, 1.36); g.add(win);
    const glow = new THREE.Sprite(MAT.windowGlow);
    glow.scale.setScalar(1.7); glow.position.copy(win.position); g.add(glow);
  } else if (type === 'chapel') {
    g.add(box(2.6, 2.4, 3.6, MAT.plaster, 0, 1.2, 0.2));
    const nave = new THREE.Mesh(prismGeo(3.0, 1.9, 4.0), MAT.roofB);
    nave.position.set(0, 2.4, 0.2); nave.castShadow = true; g.add(nave);
    g.add(box(1.3, 4.2, 1.3, MAT.stone, 0, 2.1, -1.9));
    g.add(cone(1.05, 1.9, MAT.roofB, 0, 5.1, -1.9, 4));
    g.add(cyl(0.05, 0.05, 0.9, MAT.rankBanner, 0, 6.3, -1.9, 4));
    g.add(mkVane(0, 4.3, 1.5));
    const win = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 1.0), MAT.window);
    win.position.set(0, 1.4, 2.22); g.add(win);
    const glow = new THREE.Sprite(MAT.windowGlow);
    glow.scale.setScalar(1.5); glow.position.copy(win.position); g.add(glow);
  } else if (type === 'mill') {
    g.add(cyl(1.0, 1.4, 3.6, MAT.plaster, 0, 1.8, 0, 8));
    g.add(cone(1.3, 1.2, MAT.roofD, 0, 4.2, 0, 8));
    const blades = new THREE.Group();
    for (let k=0;k<4;k++){
      const bl = box(0.3, 2.6, 0.06, MAT.timber, 0, 1.5, 0);
      const arm = new THREE.Group();
      arm.add(bl);
      arm.rotation.z = k * Math.PI/2;
      blades.add(arm);
    }
    blades.position.set(0, 3.4, 1.5);
    blades.userData.isBlades = true;
    g.add(blades);
    g.add(box(0.7, 1.1, 0.1, MAT.timber, 0, 0.55, 1.36));
  } else if (type === 'sawmill') {
    g.add(box(2.4, 1.6, 2.2, MAT.timber, -0.2, 0.8, 0));
    const r = new THREE.Mesh(prismGeo(2.8, 1.0, 2.6), MAT.roofB);
    r.position.set(-0.2, 1.6, 0); r.castShadow = true; g.add(r);
    const blade = cyl(0.7, 0.7, 0.08, new THREE.MeshLambertMaterial({ color:0xb9bec4 }), 1.3, 0.9, 0, 12);
    blade.rotation.x = Math.PI/2;
    g.add(blade);
    const log1 = cyl(0.25, 0.25, 1.9, MAT.timber, 1.1, 0.26, 0.8, 6); log1.rotation.z = Math.PI/2; g.add(log1);
    const log2 = cyl(0.22, 0.22, 1.7, MAT.timber, 1.1, 0.7, 0.8, 6); log2.rotation.z = Math.PI/2; g.add(log2);
  } else if (type === 'tradepost') {
    g.add(box(2.6, 0.3, 2.4, MAT.timber, 0, 0.15, 0));
    for (const [px, pz] of [[-1.1,-1.0],[1.1,-1.0],[-1.1,1.0],[1.1,1.0]])
      g.add(cyl(0.1, 0.1, 1.9, MAT.timber, px, 1.1, pz, 5));
    const r = new THREE.Mesh(prismGeo(3.0, 0.9, 2.8), MAT.canopy);
    r.position.y = 2.1; r.castShadow = true; g.add(r);
    g.add(box(0.7, 0.6, 0.7, MAT.plaster, -0.5, 0.6, 0.3));
    g.add(box(0.5, 0.45, 0.5, MAT.crop, 0.5, 0.55, -0.3));
    g.add(cyl(0.07, 0.07, 2.6, MAT.timber, 1.5, 1.3, -1.0, 5));
    const fl = box(0.05, 0.5, 0.8, MAT.banner, 1.5, 2.4, -0.6);
    fl.userData.isFlag = true; g.add(fl);
  } else if (type === 'infirmary') {
    g.add(box(2.7, 2.1, 2.7, MAT.plaster, 0, 1.05, 0));
    const r = new THREE.Mesh(prismGeo(3.1, 1.4, 3.1), MAT.roofB);
    r.position.y = 2.1; r.castShadow = true; g.add(r);
    // the healer's cross over the door
    g.add(box(0.5, 0.14, 0.1, new THREE.MeshLambertMaterial({ color:0xc23b2a }), 0, 2.55, 1.42));
    g.add(box(0.14, 0.5, 0.1, new THREE.MeshLambertMaterial({ color:0xc23b2a }), 0, 2.55, 1.42));
    g.add(box(0.9, 1.2, 0.08, MAT.timber, 0, 0.6, 1.36));
    const win = new THREE.Mesh(new THREE.PlaneGeometry(0.8, 0.5), MAT.window);
    win.position.set(0, 1.5, 1.37); g.add(win);
    const glow = new THREE.Sprite(MAT.windowGlow);
    glow.scale.setScalar(1.5); glow.position.copy(win.position); g.add(glow);
  } else if (type === 'bathhouse') {
    g.add(box(2.8, 1.6, 2.6, MAT.stone, 0, 0.8, 0));
    const dome = new THREE.Mesh(new THREE.SphereGeometry(1.25, 10, 8, 0, Math.PI*2, 0, Math.PI/2), MAT.roofB);
    dome.position.y = 1.6; dome.castShadow = true; g.add(dome);
    g.add(cyl(0.14, 0.14, 1.2, MAT.stoneD, 0.9, 2.6, 0.7, 6));
    // steam wisps
    for (const [sx, sy] of [[0.9, 3.4], [0.6, 3.8]]) {
      const st = new THREE.Sprite(new THREE.SpriteMaterial({ map:P_TEX, color:0xd8dde2, transparent:true, opacity:0.35, depthWrite:false }));
      st.scale.setScalar(0.9); st.position.set(sx, sy, 0.7); g.add(st);
    }
    g.add(box(0.9, 1.1, 0.08, MAT.timber, 0, 0.55, 1.34));
  } else if (type === 'school') {
    g.add(box(2.7, 2.0, 2.4, MAT.plaster, 0, 1.0, 0));
    for (const [px, pz] of [[-1.3,-1.15],[1.3,-1.15],[-1.3,1.15],[1.3,1.15]])
      g.add(box(0.14, 2.0, 0.14, MAT.timber, px, 1.0, pz));
    const r = new THREE.Mesh(prismGeo(3.1, 1.4, 2.8), MAT.roofD);
    r.position.y = 2.0; r.castShadow = true; g.add(r);
    // the school bell
    g.add(box(0.7, 0.5, 0.5, MAT.timber, 0, 3.55, 0));
    g.add(cone(0.16, 0.3, MAT.rankBanner, 0, 3.5, 0, 6));
    g.add(box(0.9, 1.2, 0.08, MAT.timber, 0.6, 0.6, 1.24));
  } else if (type === 'orchard') {
    g.add(box(3.6, 0.15, 3.6, new THREE.MeshLambertMaterial({ color:0x5f7a44 }), 0, 0.08, 0));
    const apple = new THREE.MeshLambertMaterial({ color:0x4f7a38 });
    for (const [px, pz] of [[-1.1,-1.1],[1.1,-1.1],[-1.1,1.1],[1.1,1.1]]) {
      g.add(cyl(0.1, 0.14, 1.0, MAT.timber, px, 0.5, pz, 5));
      const crown = new THREE.Mesh(new THREE.SphereGeometry(0.65, 7, 6), apple);
      crown.position.set(px, 1.35, pz); crown.castShadow = true; g.add(crown);
      g.add(new THREE.Mesh(new THREE.SphereGeometry(0.07, 5, 4),
        new THREE.MeshLambertMaterial({ color:0xc23b2a })).translateX(px+0.3).translateY(1.3).translateZ(pz+0.3));
    }
    for (const s of [-1,1]) {
      g.add(box(3.8, 0.25, 0.1, MAT.timber, 0, 0.3, s*1.85));
      g.add(box(0.1, 0.25, 3.8, MAT.timber, s*1.85, 0.3, 0));
    }
  } else if (type === 'beacon') {
    g.add(cyl(0.55, 0.75, 3.8, MAT.stoneD, 0, 1.9, 0, 7));
    g.add(cyl(0.75, 0.65, 0.5, MAT.stone, 0, 4.0, 0, 7));
    const bowl = cyl(0.5, 0.35, 0.4, MAT.ruin, 0, 4.4, 0, 7);
    g.add(bowl);
    const fl = new THREE.Sprite(new THREE.SpriteMaterial({ map:P_TEX, color:0xff8a2a, transparent:true, opacity:0.9, blending:THREE.AdditiveBlending, depthWrite:false }));
    fl.scale.setScalar(1.6); fl.position.y = 4.9; g.add(fl);
  } else if (type === 'townhall') {
    g.add(box(3.6, 2.6, 2.8, MAT.stone, 0, 1.3, 0));
    const r = new THREE.Mesh(prismGeo(4.0, 1.8, 3.2), MAT.roofB);
    r.position.y = 2.6; r.castShadow = true; g.add(r);
    // belfry with the town's colours
    g.add(box(1.0, 1.4, 1.0, MAT.plaster, 0, 4.1, 0));
    g.add(cone(0.85, 1.0, MAT.roofB, 0, 5.3, 0, 4));
    const fl = box(0.05, 0.9, 1.1, MAT.rankBanner, 0, 6.2, 0.55);
    fl.userData.isFlag = true; g.add(fl);
    g.add(cyl(0.05, 0.05, 1.6, MAT.timber, 0, 6.0, 0, 5));
    for (const wx of [-1.2, 0, 1.2]) {
      const win = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.8), MAT.window);
      win.position.set(wx, 1.5, 1.42); g.add(win);
      const glow = new THREE.Sprite(MAT.windowGlow);
      glow.scale.setScalar(1.4); glow.position.copy(win.position); g.add(glow);
    }
    g.add(box(1.1, 1.6, 0.1, MAT.timber, 0, 0.8, 1.42));
    g.add(mkVane(0, 4.4, -1.2));
  } else if (type === 'stakes') {
    for (const [px, pz, tilt] of [[-0.6,-0.5,0.5],[0.3,-0.6,-0.4],[0.7,0.3,0.5],[-0.3,0.6,-0.5],[0,0,0.2]]) {
      const st = cyl(0.02, 0.12, 1.5, MAT.timber, px, 0.6, pz, 5);
      st.rotation.z = tilt; st.rotation.x = tilt * 0.6;
      g.add(st);
    }
    g.add(box(1.9, 0.14, 1.9, MAT.soil, 0, 0.07, 0));
  } else if (type === 'ballista') {
    g.add(box(2.6, 0.5, 2.6, MAT.timber, 0, 0.25, 0));
    g.add(cyl(0.5, 0.65, 1.0, MAT.stoneD, 0, 1.0, 0, 8));
    const arm = box(0.25, 0.25, 2.6, MAT.timber, 0, 1.7, 0);
    arm.rotation.x = -0.35; g.add(arm);
    const bow = box(2.4, 0.18, 0.18, MAT.timber, 0, 1.35, 1.0);
    g.add(bow);
    g.add(box(0.08, 0.08, 1.6, MAT.ruin, 0, 1.75, 0.2));
  } else if (type === 'watchpost') {
    for (const [px, pz] of [[-0.7,-0.7],[0.7,-0.7],[-0.7,0.7],[0.7,0.7]])
      g.add(cyl(0.11, 0.13, 3.2, MAT.timber, px, 1.6, pz, 5));
    g.add(box(2.0, 0.16, 2.0, MAT.timber, 0, 3.2, 0));
    g.add(box(2.0, 0.5, 0.1, MAT.timber, 0, 3.55, 0.95));
    g.add(box(2.0, 0.5, 0.1, MAT.timber, 0, 3.55, -0.95));
    g.add(box(0.1, 0.5, 2.0, MAT.timber, 0.95, 3.55, 0));
    g.add(box(0.1, 0.5, 2.0, MAT.timber, -0.95, 3.55, 0));
    const r = new THREE.Mesh(prismGeo(2.4, 0.8, 2.4), MAT.roofD);
    r.position.y = 4.3; r.castShadow = true; g.add(r);
  } else if (type === 'garden') {
    g.add(box(2.0, 0.2, 2.0, MAT.soil, 0, 0.1, 0));
    for (const [px, pz, c] of [[-0.5,-0.5,0xd96a6a],[0.5,-0.5,0xf2d24b],[-0.5,0.5,0xc9a3e8],[0.5,0.5,0xfff1c9],[0,0,0x7aa348]]) {
      g.add(new THREE.Mesh(new THREE.SphereGeometry(0.22, 6, 5),
        new THREE.MeshLambertMaterial({ color:c })).translateX(px).translateY(0.35).translateZ(pz));
    }
    for (const s of [-1,1]) {
      g.add(box(2.2, 0.3, 0.12, MAT.timber, 0, 0.25, s*1.05));
      g.add(box(0.12, 0.3, 2.2, MAT.timber, s*1.05, 0.25, 0));
    }
  } else if (type === 'fountain') {
    g.add(cyl(1.05, 1.15, 0.5, MAT.stone, 0, 0.25, 0, 10));
    g.add(cyl(0.85, 0.85, 0.5, new THREE.MeshLambertMaterial({ color:0x3d6f8e, transparent:true, opacity:0.9 }), 0, 0.3, 0, 10));
    g.add(cyl(0.16, 0.2, 1.3, MAT.stoneD, 0, 0.9, 0, 8));
    g.add(cyl(0.5, 0.55, 0.16, MAT.stone, 0, 1.5, 0, 10));
    g.add(cone(0.14, 0.5, MAT.stoneD, 0, 1.85, 0, 6));
  } else if (type === 'bannerpole') {
    g.add(cyl(0.28, 0.38, 0.5, MAT.stoneD, 0, 0.25, 0, 6));
    g.add(cyl(0.07, 0.09, 5.4, MAT.timber, 0, 3.0, 0, 6));
    const fl = box(0.05, 1.5, 1.1, MAT.rankBanner, 0, 5.0, 0.55);
    fl.userData.isFlag = true;
    g.add(fl);
    g.add(cone(0.12, 0.3, MAT.banner, 0, 5.9, 0, 5));
  } else if (type === 'statue') {
    g.add(box(1.6, 0.5, 1.6, MAT.stone, 0, 0.25, 0));
    g.add(box(1.1, 0.8, 1.1, MAT.stoneD, 0, 0.9, 0));
    const fig = makeFigure(0x8a8a84, 'guard');
    fig.scale.setScalar(1.15);
    fig.position.y = 1.3;
    fig.traverse(o => { if (o.isMesh) o.material = MAT.stoneD; });
    g.add(fig);
  } else if (type === 'well') {
    g.add(cyl(0.95, 1.05, 0.8, MAT.stoneD, 0, 0.4, 0, 8));
    g.add(cyl(0.75, 0.75, 0.85, new THREE.MeshLambertMaterial({ color:0x2d4a5e }), 0, 0.42, 0, 8));
    for (const s of [-1, 1]) g.add(box(0.14, 1.5, 0.14, MAT.timber, s*0.8, 0.75, 0));
    const r = new THREE.Mesh(prismGeo(2.0, 0.7, 1.2), MAT.roofB); r.position.y = 1.5; r.castShadow = true; g.add(r);
    g.add(box(0.3, 0.3, 0.3, MAT.timber, 0, 1.0, 0));
  } else if (type === 'granary') {
    // raised storehouse on staddle stones — keeps the winter stores dry
    for (const [sx, sz] of [[-1.2,-0.9],[1.2,-0.9],[-1.2,0.9],[1.2,0.9]])
      g.add(cyl(0.28, 0.38, 1.0, MAT.stoneD, sx, 0.5, sz, 6));
    g.add(box(3.2, 1.9, 2.6, MAT.timber, 0, 1.95, 0));
    const r = new THREE.Mesh(prismGeo(3.6, 1.4, 3.0), [MAT.roof, MAT.roofD, MAT.roofB][(vh*3)|0]);
    r.position.y = 2.9; r.castShadow = true; g.add(r);
    g.add(box(0.9, 1.1, 0.08, MAT.plaster, 0, 1.85, 1.34));   // loading door
    const ladder = box(0.5, 1.3, 0.08, MAT.timber, 0, 0.6, 1.5);
    ladder.rotation.x = 0.35; g.add(ladder);
    if (vh > 0.45) {   // grain sacks waiting on the ground
      const sackM = new THREE.MeshLambertMaterial({ color:0xc4a86a });
      for (const [sx, sy, sz2] of [[-1.5,0.26,1.3],[-1.1,0.26,1.45],[-1.3,0.72,1.35]]) {
        const sk = new THREE.Mesh(new THREE.SphereGeometry(0.28, 6, 5), sackM);
        sk.position.set(sx, sy, sz2); sk.scale.y = 0.85; sk.castShadow = true; g.add(sk);
      }
    }
  } else if (type === 'farm') {
    g.add(box(5.6, 0.25, 5.6, MAT.soil, 0, 0.12, 0));
    const rows = new THREE.Group();
    for (let i=0;i<4;i++) rows.add(box(5.0, 0.35, 0.7, MAT.crop, 0, 0.4, -2.1+i*1.4));
    if (vh > 0.5) rows.rotation.y = Math.PI/2;   // some farms plough the other way
    g.add(rows);
    const bs = (vh*9) % 1 > 0.5 ? -1 : 1;   // barn corner varies
    g.add(box(1.6, 1.4, 1.6, MAT.timber, 2.4*bs, 0.7, 2.4));
    const r = new THREE.Mesh(prismGeo(1.9, 0.9, 1.9), MAT.roof); r.position.set(2.4*bs, 1.4, 2.4); r.castShadow=true; g.add(r);
    // hay bales by the barn
    const hay = new THREE.MeshLambertMaterial({ color:0xd9c05a });
    const h1 = cyl(0.45, 0.45, 0.9, hay, -2.3*bs, 0.45, 2.3, 8); h1.rotation.z = Math.PI/2; g.add(h1);
    const h2 = cyl(0.4, 0.4, 0.8, hay, -2.3*bs, 1.1, 2.3, 8); h2.rotation.z = Math.PI/2; g.add(h2);
    if ((vh*17) % 1 < 0.45) scarecrow(g, vh, -0.6*bs, -0.8);
    if ((vh*29) % 1 < 0.35) {   // a dovecote, doves and all
      const px = 2.3*bs, pz = -2.3;
      g.add(cyl(0.06, 0.08, 2.0, MAT.timber, px, 1.0, pz, 5));
      g.add(box(0.55, 0.5, 0.55, MAT.plaster, px, 2.2, pz));
      g.add(cone(0.45, 0.4, MAT.roofD, px, 2.65, pz, 4));
      const doveM = new THREE.MeshLambertMaterial({ color:0xe8e6e0 });
      for (const [dx, dy, dz] of [[0.28, 2.5, 0], [-0.2, 0.06, 0.5]]) {
        const dv = new THREE.Mesh(new THREE.SphereGeometry(0.07, 5, 4), doveM);
        dv.position.set(px+dx, dy, pz+dz); dv.scale.z = 1.3; g.add(dv);
      }
    }
    if ((vh*23) % 1 < 0.5) {   // split-rail fence along the lane side
      for (let i = 0; i < 4; i++) g.add(cyl(0.06, 0.07, 0.8, MAT.timber, -2.6 + i*1.75, 0.4, -2.75, 4));
      g.add(box(5.3, 0.08, 0.08, MAT.timber, 0, 0.62, -2.75));
      g.add(box(5.3, 0.08, 0.08, MAT.timber, 0, 0.34, -2.75));
    }
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
    // striped awning in the stallholder's colours
    const awnBase = [0xb8452f, 0x3e5c7a, 0x4e7a3e][(vh*3)|0];
    const r = new THREE.Mesh(prismGeo(4.4, 1.1, 4.4), new THREE.MeshLambertMaterial({ color: awnBase }));
    r.position.y = 2.3; r.castShadow=true; g.add(r);
    const stripeM = new THREE.MeshLambertMaterial({ color:0xe8dcc2 });
    const slope = Math.atan2(1.1, 2.2);
    for (let i = 0; i < 4; i += 2) {
      const sz = -1.65 + i*1.1;
      for (const s of [-1, 1]) {
        const st = box(2.5, 0.04, 0.55, stripeM, s*1.08, 2.87, sz);
        st.rotation.z = -s * slope;
        g.add(st);
      }
    }
    g.add(box(1.0, 0.7, 0.6, MAT.plaster, -0.7, 0.75, 0.4));
    g.add(box(0.8, 0.5, 0.8, MAT.crop, 0.8, 0.65, -0.5));
    // crates and a barrel stacked beside the stalls
    g.add(box(0.6, 0.55, 0.6, MAT.timber, 2.35, 0.28, 1.4));
    g.add(box(0.5, 0.45, 0.5, MAT.timber, 2.35, 0.78, 1.4));
    g.add(cyl(0.28, 0.32, 0.55, MAT.timber, -2.35, 0.28, -1.5, 7));
  } else if (type === 'tower') {
    g.add(cyl(1.1, 1.35, 7.0, MAT.stone, 0, 3.5, 0, 8));
    g.add(cyl(1.5, 1.5, 0.7, MAT.stoneD, 0, 7.3, 0, 8));
    g.add(cone(1.5, 1.9, MAT.roofB, 0, 8.6, 0, 8));
    const b = box(0.06, 1.0, 0.7, MAT.rankBanner, 1.45, 6.4, 0);
    b.userData.isFlag = true;
    g.add(b);
  } else if (type === 'barracks') {
    g.add(box(3.8, 2.2, 2.6, MAT.stoneD, 0, 1.1, 0));
    const r = new THREE.Mesh(prismGeo(4.2, 1.3, 3.0), MAT.roofB); r.position.y = 2.2; r.castShadow=true; g.add(r);
    g.add(cyl(0.09, 0.09, 3.6, MAT.timber, 1.6, 1.8, 1.2, 6));
    const bf = box(0.06, 0.9, 0.65, MAT.banner, 1.6, 3.1, 1.55);
    bf.userData.isFlag = true;
    g.add(bf);
  } else if (type === 'keep') {
    g.add(box(4.6, 4.4, 4.6, MAT.stone, 0, 2.2, 0));
    for (const [px,pz] of [[-2.3,-2.3],[2.3,-2.3],[-2.3,2.3],[2.3,2.3]]) {
      g.add(cyl(0.9, 1.0, 5.6, MAT.stoneD, px, 2.8, pz, 8));
      g.add(cone(1.1, 1.6, MAT.roofB, px, 6.4, pz, 8));
    }
    g.add(cyl(0.08, 0.08, 3.0, MAT.timber, 0, 6.0, 0, 6));
    const kf = box(0.06, 1.0, 1.4, MAT.rankBanner, 0, 7.0, 0.7);
    kf.userData.isFlag = true;
    g.add(kf);
    for (const ry of [0, Math.PI/2, Math.PI, -Math.PI/2]) {
      const win = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.8), MAT.window);
      win.position.set(Math.sin(ry)*2.32, 3.1, Math.cos(ry)*2.32);
      win.rotation.y = ry; g.add(win);
      const glow = new THREE.Sprite(MAT.windowGlow);
      glow.scale.setScalar(1.6);
      glow.position.copy(win.position);
      g.add(glow);
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
MAT.windowGlow.map = P_TEX;
MAT.windowGlow.needsUpdate = true;
scatterWorld(REGIONS[0].seed);   // title-screen backdrop (needs MAT + P_TEX)
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

// rain: recycled particle sheet that follows the camera
const RAIN_N = 650;
let rainPts;
{
  const v = new Float32Array(RAIN_N * 3);
  for (let i=0;i<RAIN_N;i++){
    v[i*3] = (Math.random()-0.5)*130;
    v[i*3+1] = Math.random()*55;
    v[i*3+2] = (Math.random()-0.5)*130;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(v, 3));
  rainPts = new THREE.Points(g, new THREE.PointsMaterial({
    color:0x9db8d8, size:0.22, transparent:true, opacity:0, depthWrite:false }));
  rainPts.frustumCulled = false;
  scene.add(rainPts);
}

// fireflies at dusk, leaves on the autumn wind — small clouds around the camera
const FLY_N = 42;
let flyPts;
const flyPh = new Float32Array(FLY_N);
{
  const v = new Float32Array(FLY_N * 3);
  for (let i=0;i<FLY_N;i++){
    v[i*3] = (Math.random()-0.5)*90;
    v[i*3+1] = 0.5 + Math.random()*2.5;
    v[i*3+2] = (Math.random()-0.5)*90;
    flyPh[i] = Math.random()*6.28;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(v, 3));
  flyPts = new THREE.Points(g, new THREE.PointsMaterial({
    color:0xd8f090, size:0.3, transparent:true, opacity:0, depthWrite:false, blending:THREE.AdditiveBlending }));
  flyPts.frustumCulled = false;
  scene.add(flyPts);
}
const LEAF_N = 70;
let leafPts;
{
  const v = new Float32Array(LEAF_N * 3);
  for (let i=0;i<LEAF_N;i++){
    v[i*3] = (Math.random()-0.5)*110;
    v[i*3+1] = Math.random()*16;
    v[i*3+2] = (Math.random()-0.5)*110;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(v, 3));
  leafPts = new THREE.Points(g, new THREE.PointsMaterial({
    color:0xd9a860, size:0.34, transparent:true, opacity:0, depthWrite:false }));
  leafPts.frustumCulled = false;
  scene.add(leafPts);
}
function ambientTick(dt) {
  const seasonNm = seasonOf(state.day).nm;
  // fireflies keep to warm, dry dusks
  const fTarget = (state.started && nightFactor > 0.45 && !state.raining && seasonNm !== 'Winter') ? 0.85 : 0;
  flyPts.material.opacity += (fTarget - flyPts.material.opacity) * Math.min(1, dt*0.8);
  if (flyPts.material.opacity > 0.03) {
    flyPts.position.set(camTarget.x, 0, camTarget.z);
    const p = flyPts.geometry.attributes.position;
    for (let i=0;i<FLY_N;i++){
      flyPh[i] += dt * (0.6 + (i % 5) * 0.13);
      p.setX(i, p.getX(i) + Math.sin(flyPh[i]*1.3 + i) * dt * 1.2);
      p.setY(i, 0.6 + Math.sin(flyPh[i]*0.7)*0.5 + Math.sin(flyPh[i]*2.1 + i)*0.3);
      p.setZ(i, p.getZ(i) + Math.cos(flyPh[i]*1.1 + i*2) * dt * 1.2);
    }
    p.needsUpdate = true;
  }
  // leaves drift down all through autumn — and blossom petals through spring
  const spring = seasonNm === 'Spring';
  leafPts.material.color.setHex(spring ? 0xf2c9d8 : 0xd9a860);
  const lTarget = (state.started && (seasonNm === 'Autumn' || spring) && !state.raining) ? (spring ? 0.6 : 0.8) : 0;
  leafPts.material.opacity += (lTarget - leafPts.material.opacity) * Math.min(1, dt*0.5);
  if (leafPts.material.opacity > 0.03) {
    leafPts.position.set(camTarget.x, 0, camTarget.z);
    const p = leafPts.geometry.attributes.position;
    for (let i=0;i<LEAF_N;i++){
      let y = p.getY(i) - dt * (1.0 + (i % 4) * 0.3) * (spring ? 0.55 : 1);
      p.setX(i, p.getX(i) + Math.sin(state.time*1.5 + i) * dt * 1.6);
      if (y < 0) {
        y = 10 + Math.random()*8;
        p.setX(i, (Math.random()-0.5)*110);
        p.setZ(i, (Math.random()-0.5)*110);
      }
      p.setY(i, y);
    }
    p.needsUpdate = true;
  }
}
const _seasonCol = new THREE.Color();
function seasonVisualTick(dt) {
  const s = seasonOf(state.day);
  const k = Math.min(1, dt * 0.35);
  ground.material.color.lerp(_seasonCol.setHex(s.ground).multiply(_regionTint), k);
  for (const m of seasonMats.leaves) m.color.lerp(_seasonCol.setHex(s.leaf), k);
  // roofs take their snow blankets on and off with the season
  const wNow = s.nm === 'Winter';
  if (wNow !== winterVisible) {
    winterVisible = wNow;
    for (const b of state.buildings) if (b._snow) for (const c of b._snow) c.visible = wNow;
  }
  // autumn's leaf carpet fades in and lingers into the snow
  if (seasonMats.litterMat) {
    const lt = s.nm === 'Autumn' ? 0.85 : s.nm === 'Winter' ? 0.2 : 0;
    seasonMats.litterMat.opacity += (lt - seasonMats.litterMat.opacity) * Math.min(1, dt * 0.3);
  }
}
function rainVisualTick(dt) {
  const target = (state.raining ? 1 : 0);
  rainFactor += (target - rainFactor) * Math.min(1, dt * 0.7);
  const snow = seasonOf(state.day).nm === 'Winter';
  rainPts.material.color.setHex(snow ? 0xffffff : 0x9db8d8);
  rainPts.material.size = snow ? 0.36 : 0.22;
  rainPts.material.opacity = rainFactor * (snow ? 0.8 : 0.55);
  if (rainFactor < 0.02) return;
  rainPts.position.set(camTarget.x, 0, camTarget.z);
  const p = rainPts.geometry.attributes.position;
  const fall = snow ? 9 : 55;
  for (let i=0;i<RAIN_N;i++){
    let y = p.getY(i) - fall * dt;
    if (y < 0) {
      y = 45 + Math.random()*15;
      p.setX(i, (Math.random()-0.5)*130);
      p.setZ(i, (Math.random()-0.5)*130);
    }
    p.setY(i, y);
  }
  p.needsUpdate = true;
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
  } else if (role === 'monk') {
    // robe: swap the legs for a long habit
    legL.visible = legR.visible = false;
    const habit = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.34, 1.15, 7), bodyM.clone());
    habit.position.y = 0.55; habit.castShadow = true;
    g.add(habit);
    g.add(cone(0.24, 0.32, bodyM.clone(), 0, 1.4, 0, 7));   // hood
    const cord = new THREE.Mesh(new THREE.TorusGeometry(0.24, 0.035, 5, 10), mat(0xc9a86a));
    cord.rotation.x = Math.PI/2; cord.position.y = 0.85;
    g.add(cord);
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

// merchant caravan: horse + covered cart
function makeCaravan() {
  const g = new THREE.Group();
  const mat = c => new THREE.MeshLambertMaterial({ color:c });
  // cart
  g.add(box(1.4, 0.5, 2.2, MAT.timber, 0, 0.75, -0.6));
  const canopy = new THREE.Mesh(prismGeo(1.6, 0.8, 2.0), mat(0xd9cfb8));
  canopy.position.set(0, 1.0, -0.6); canopy.castShadow = true; g.add(canopy);
  for (const [sx, sz] of [[-0.75, -1.2], [0.75, -1.2], [-0.75, 0.1], [0.75, 0.1]]) {
    const wh = cyl(0.35, 0.35, 0.12, MAT.timber, sx, 0.35, sz, 8);
    wh.rotation.z = Math.PI/2; g.add(wh);
  }
  // horse
  const horse = mat(0x6b4a30);
  g.add(box(0.55, 0.6, 1.2, horse, 0, 0.85, 1.3));
  g.add(box(0.3, 0.5, 0.45, horse, 0, 1.35, 1.9));
  for (const [sx, sz] of [[-0.18, 0.85], [0.18, 0.85], [-0.18, 1.75], [0.18, 1.75]])
    g.add(box(0.12, 0.55, 0.12, horse, sx, 0.28, sz));
  g.traverse(o => { if (o.isMesh) o.castShadow = true; });
  return g;
}

// critters: chickens scratch about the wards, a dog trails the townsfolk
function makeChicken() {
  const g = new THREE.Group();
  const white = new THREE.MeshLambertMaterial({ color:0xe8e2d4 });
  const body = new THREE.Mesh(new THREE.SphereGeometry(0.22, 6, 5), white);
  body.position.y = 0.22; body.scale.set(1, 0.85, 1.25); body.castShadow = true;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.11, 6, 5), white);
  head.position.set(0, 0.44, 0.2); head.castShadow = true;
  const comb = box(0.04, 0.09, 0.09, new THREE.MeshLambertMaterial({ color:0xc23b2a }), 0, 0.54, 0.2);
  const beak = cone(0.04, 0.1, new THREE.MeshLambertMaterial({ color:0xd9a44a }), 0, 0.44, 0.3, 4);
  beak.rotation.x = Math.PI/2;
  g.add(body, head, comb, beak);
  return g;
}
function makeDog() {
  const g = new THREE.Group();
  const brown = new THREE.MeshLambertMaterial({ color:0x6b4a30 });
  const body = box(0.26, 0.28, 0.62, brown, 0, 0.34, 0);
  const head = box(0.22, 0.22, 0.26, brown, 0, 0.52, 0.38);
  const tail = box(0.06, 0.06, 0.3, brown, 0, 0.48, -0.4);
  tail.rotation.x = -0.5;
  for (const [sx, sz] of [[-0.09,0.2],[0.09,0.2],[-0.09,-0.2],[0.09,-0.2]])
    g.add(box(0.07, 0.24, 0.07, brown, sx, 0.12, sz));
  g.add(body, head, tail);
  g.traverse(o => { if (o.isMesh) o.castShadow = true; });
  return g;
}
function makeDeer(buck) {
  const g = new THREE.Group();
  const tan = new THREE.MeshLambertMaterial({ color:0x9c7a52 });
  const dark = new THREE.MeshLambertMaterial({ color:0x6e5238 });
  const body = box(0.42, 0.5, 1.0, tan, 0, 0.82, -0.05);
  const rump = box(0.38, 0.42, 0.3, tan, 0, 0.86, -0.6);
  // the head assembly pivots down to graze
  const head = new THREE.Group();
  head.position.set(0, 1.0, 0.45);
  const neck = box(0.18, 0.55, 0.2, tan, 0, 0.22, 0.05);
  neck.rotation.x = 0.35;
  const skull = box(0.2, 0.22, 0.4, tan, 0, 0.52, 0.22);
  const snout = box(0.12, 0.12, 0.16, dark, 0, 0.48, 0.44);
  head.add(neck, skull, snout);
  for (const s of [-1, 1]) {
    const ear = cone(0.06, 0.16, tan, s*0.13, 0.66, 0.16, 4);
    ear.rotation.z = s*0.5;
    head.add(ear);
    if (buck) {
      const a1 = cyl(0.025, 0.035, 0.5, dark, s*0.1, 0.85, 0.1, 4);
      a1.rotation.z = s*0.55;
      const a2 = cyl(0.02, 0.025, 0.3, dark, s*0.24, 0.95, 0.1, 4);
      a2.rotation.z = s*1.15;
      head.add(a1, a2);
    }
  }
  head.userData.isHead = true;
  const tail = box(0.09, 0.16, 0.06, new THREE.MeshLambertMaterial({ color:0xe8e2d4 }), 0, 0.98, -0.76);
  for (const [sx, sz] of [[-0.14,0.32],[0.14,0.32],[-0.14,-0.5],[0.14,-0.5]])
    g.add(cyl(0.045, 0.055, 0.62, dark, sx, 0.31, sz, 4));
  g.add(body, rump, head, tail);
  g.traverse(o => { if (o.isMesh) o.castShadow = true; });
  return g;
}
function makeRabbit() {
  const g = new THREE.Group();
  const fur = new THREE.MeshLambertMaterial({ color: Math.random() < 0.3 ? 0x8a7a68 : 0xb8a68e });
  const body = new THREE.Mesh(new THREE.SphereGeometry(0.16, 6, 5), fur);
  body.position.y = 0.15; body.scale.set(1, 0.9, 1.3);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.1, 6, 5), fur);
  head.position.set(0, 0.28, 0.17);
  for (const s of [-1, 1]) {
    const ear = box(0.04, 0.18, 0.06, fur, s*0.05, 0.44, 0.14);
    ear.rotation.z = s*0.15;
    g.add(ear);
  }
  const tail = new THREE.Mesh(new THREE.SphereGeometry(0.06, 5, 4), new THREE.MeshLambertMaterial({ color:0xe8e2d4 }));
  tail.position.set(0, 0.18, -0.2);
  g.add(body, head, tail);
  g.traverse(o => { if (o.isMesh) o.castShadow = true; });
  return g;
}

// wildlife — deer and rabbits keep to the open country, never inside walls,
// and bolt when anyone comes near. Not saved; the land refills on load.
function wildSpawnSpot() {
  for (let tries = 0; tries < 24; tries++) {
    const t = trees.length ? trees[Math.random()*trees.length|0] : { x:(Math.random()-0.5)*160, z:(Math.random()-0.5)*160 };
    const x = t.x + (Math.random()-0.5)*16, z = t.z + (Math.random()-0.5)*16;
    if (Math.abs(x) > MAP-4 || Math.abs(z) > MAP-4) continue;
    if (wardDepth(x, z) > 0) continue;
    if (Math.hypot(x-LAKE.x, z-LAKE.z) < LAKE.r + 4) continue;
    if (state.buildings.some(b => Math.hypot(b.x-x, b.z-z) < 18)) continue;
    return { x, z };
  }
  return null;
}
function wildTick(dt) {
  const wantDeer = 5, wantRabbits = 5;
  state._wildT = (state._wildT || 0) - dt;
  const maySpawn = state._wildT <= 0;
  if (maySpawn) state._wildT = 4 + Math.random()*4;
  const deer = state.wild.filter(c => c.kind === 'deer');
  if (maySpawn && deer.length < wantDeer) {
    const spot = wildSpawnSpot();
    if (spot) {
      // a small herd arrives together
      const n = Math.min(wantDeer - deer.length, 2 + (Math.random()*2|0));
      for (let i = 0; i < n; i++) {
        const buck = i === 0;
        const grp = makeDeer(buck);
        const x = spot.x + (Math.random()-0.5)*7, z = spot.z + (Math.random()-0.5)*7;
        grp.position.set(x, 0, z);
        grp.scale.setScalar(buck ? 1.05 : 0.9 + Math.random()*0.12);
        scene.add(grp);
        let hd = null;
        grp.traverse(o => { if (o.userData.isHead) hd = o; });
        state.wild.push({ kind:'deer', x, z, ax:spot.x, az:spot.z, speed:3.2, grp, head:hd,
          bob:Math.random()*6, wait:Math.random()*3, tgt:null, graze:0, flee:0, checkT:2+Math.random()*3 });
      }
    }
  }
  if (maySpawn && state.wild.filter(c => c.kind === 'rabbit').length < wantRabbits) {
    const spot = wildSpawnSpot();
    if (spot) {
      const grp = makeRabbit();
      grp.position.set(spot.x, 0, spot.z);
      scene.add(grp);
      state.wild.push({ kind:'rabbit', x:spot.x, z:spot.z, ax:spot.x, az:spot.z, speed:5.5, grp,
        bob:Math.random()*6, wait:Math.random()*2, tgt:null, flee:0, checkT:2+Math.random()*3 });
    }
  }
  for (const c of [...state.wild]) {
    c.bob += dt * 8;
    // walls may have grown around the meadow — wild things slip away
    c.checkT -= dt;
    if (c.checkT <= 0) {
      c.checkT = 3 + Math.random()*2;
      if (wardDepth(c.x, c.z) > 0) { removeWild(c); continue; }
    }
    // spook check
    const scare = c.kind === 'deer' ? 10 : 6;
    let threat = null, best = scare;
    for (const arr of [state.villagers, state.bandits, state.guards]) {
      for (const v of arr) {
        const d = Math.hypot(v.x-c.x, v.z-c.z);
        if (d < best) { best = d; threat = v; }
      }
    }
    if (threat) {
      c.flee = 2.2;
      const dx = c.x - threat.x, dz = c.z - threat.z;
      const L = Math.hypot(dx, dz) || 1;
      c.fdx = dx/L; c.fdz = dz/L;
      c.tgt = null; c.wait = 0;
      if (c.head) c.head.rotation.x = 0;
    }
    if (c.flee > 0) {
      c.flee -= dt;
      const spd = c.kind === 'deer' ? 9.5 : 7.5;
      const nx = c.x + c.fdx * spd * dt, nz = c.z + c.fdz * spd * dt;
      if (Math.abs(nx) < MAP-2 && Math.abs(nz) < MAP-2) { c.x = nx; c.z = nz; }
      else c.flee = 0;
      c.grp.position.set(c.x, Math.abs(Math.sin(c.bob*1.6))*0.22, c.z);
      c.grp.rotation.y = Math.atan2(c.fdx, c.fdz);
      if (c.flee <= 0 && Math.random() < 0.35) removeWild(c);   // sometimes they're gone for good
      continue;
    }
    // idle graze / hop about
    if (c.wait > 0) {
      c.wait -= dt;
      if (c.kind === 'deer' && c.head) {
        c.graze += dt;
        c.head.rotation.x = Math.min(0.9, c.graze * 1.4);   // head dips to the grass
      }
      c.grp.position.y = 0;
      continue;
    }
    if (c.head) { c.graze = 0; c.head.rotation.x = Math.max(0, c.head.rotation.x - dt*3); }
    if (!c.tgt || Math.hypot(c.tgt.x-c.x, c.tgt.z-c.z) < 0.5) {
      c.tgt = { x: c.ax + (Math.random()-0.5)*16, z: c.az + (Math.random()-0.5)*16 };
      c.wait = c.kind === 'deer' ? 2.5 + Math.random()*4 : 0.8 + Math.random()*1.6;
      continue;
    }
    const dx = c.tgt.x - c.x, dz = c.tgt.z - c.z;
    const L = Math.hypot(dx, dz) || 1;
    c.x += dx/L * c.speed * dt; c.z += dz/L * c.speed * dt;
    c.grp.position.set(c.x, c.kind === 'rabbit' ? Math.abs(Math.sin(c.bob*1.3))*0.14 : 0, c.z);
    c.grp.rotation.y = Math.atan2(dx, dz);
  }
}
function removeWild(c) {
  const i = state.wild.indexOf(c);
  if (i >= 0) state.wild.splice(i, 1);
  scene.remove(c.grp); disposeGroup(c.grp);
}
function critterTick(dt) {
  const wantChickens = Math.min(5, Math.floor(state.pop / 6));
  const wantDogs = state.pop >= 10 ? 1 : 0;
  const chickens = state.critters.filter(c => c.kind === 'chicken');
  const dogs = state.critters.filter(c => c.kind === 'dog');
  const homes = state.buildings.filter(b => !b.ruined && b.depth > 0);
  if (chickens.length < wantChickens && homes.length) {
    const h = homes[Math.random()*homes.length|0];
    const grp = makeChicken();
    grp.position.set(h.x+2, 0, h.z+2);
    scene.add(grp);
    state.critters.push({ kind:'chicken', x:h.x+2, z:h.z+2, ax:h.x, az:h.z, speed:2.8, grp, bob:Math.random()*6, wait:Math.random()*2, tgt:null });
  }
  if (dogs.length < wantDogs && homes.length) {
    const grp = makeDog();
    grp.position.set(homes[0].x+3, 0, homes[0].z);
    scene.add(grp);
    state.critters.push({ kind:'dog', x:homes[0].x+3, z:homes[0].z, speed:3.4, grp, bob:0, follow:null, followT:0 });
  }
  while (state.critters.length > wantChickens + wantDogs) {
    const c = state.critters.pop();
    scene.remove(c.grp); disposeGroup(c.grp);
  }
  for (const c of state.critters) {
    c.bob += dt * 9;
    if (c.kind === 'chicken') {
      if (c.wait > 0) { c.wait -= dt; c.grp.position.y = 0; continue; }
      if (!c.tgt || Math.hypot(c.tgt.x-c.x, c.tgt.z-c.z) < 0.4) {
        c.tgt = { x: c.ax + (Math.random()-0.5)*9, z: c.az + (Math.random()-0.5)*9 };
        c.wait = 0.5 + Math.random()*2.5;   // peck, look around
        continue;
      }
      moveToward(c, c.tgt.x, c.tgt.z, dt);
      c.grp.position.y = Math.abs(Math.sin(c.bob)) * 0.09;   // hoppy little gait
      c._moved = false;
    } else {
      c.followT -= dt;
      if (c.followT <= 0 || !c.follow || !state.villagers.includes(c.follow)) {
        c.follow = state.villagers[Math.random()*state.villagers.length|0] || null;
        c.followT = 14 + Math.random()*12;
      }
      if (c.follow) {
        const d = Math.hypot(c.follow.x-c.x, c.follow.z-c.z);
        if (d > 1.6) { moveToward(c, c.follow.x, c.follow.z, dt); c._moved = false; }
        c.grp.position.y = Math.abs(Math.sin(c.bob * 0.8)) * 0.05;
      }
    }
  }
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
      // hoardings turn watchmen into archers
      if (w.hoardings && watch && best < 16) {
        st.cool = (st.cool || 0) - dt;
        if (st.cool <= 0) {
          st.cool = 1.2;
          fireArrow(st.x, st.baseY + 1.2, st.z, watch, 6);
        }
      }
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
  for (const w of state.walls) {
    if (w.breached) continue;   // a breached ring shelters no one
    if (pointInPoly(x, z, w.poly)) d++;
  }
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
      if (g.breach || (g.openT || 0) > 0.6) continue;
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
      if (!want) for (const cv of state.caravans) if (Math.hypot(cv.x-p.x, cv.z-p.z) < 6) { want = true; break; }
      if (g.breach) continue;   // a breach has no door to work
      const prev = g.openT || 0;
      const target = want ? 1 : 0;
      const spd = GATE_TIERS[g.tier || 'gate'].openSpd;
      g.openT = Math.max(0, Math.min(1, prev + Math.sign(target - prev) * dt * spd));
      if (prev <= 0.02 && g.openT > 0.02) AudioSys.play('creak');
      if (g._door) g._door.position.y = -g.openT * (g._doorH || 4);
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
function buildWallMeshes(verts, closed=true, gates=null, tierKey='wall', hoardings=false) {
  const tier = WALL_TIERS[tierKey] || WALL_TIERS.wall;
  const WH = tier.h;
  const pal = tierKey === 'palisade';
  const spanMat = pal ? MAT.timber : MAT.stone;
  const postMat = pal ? MAT.timber : MAT.stoneD;
  const group = new THREE.Group();
  const n = verts.length;
  const segCount = closed ? n : n-1;
  const segLen = i => Math.hypot(verts[(i+1)%n].x-verts[i].x, verts[(i+1)%n].z-verts[i].z);
  if (!gates) gates = [];
  const blockers = [], gatePts = [];   // solid spans + gate centers, for pathing
  const merlonMats = [], spikeMats = [];
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
      const w = box(WALL_T, WH, w2, spanMat, p.x, WH/2, p.z);
      if (!pal) {
        // scale UVs by span size so the stone coursing doesn't stretch
        const uv = w.geometry.attributes.uv;
        for (let k=0;k<uv.count;k++) uv.setXY(k, uv.getX(k) * Math.max(1, w2/4), uv.getY(k) * (WH/4));
      }
      w.rotation.y = ang; group.add(w);
      const cnt = Math.floor(w2/2.2);
      for (let k=0;k<cnt;k++){
        const q = along(s0 + (k+0.5)*w2/cnt);
        (pal ? spikeMats : merlonMats).push({ x:q.x, z:q.z, ang });
      }
      if (tierKey === 'highwall') {
        // gold string-course band near the top
        const trim = box(WALL_T+0.15, 0.3, w2, MAT.rankBanner, p.x, WH-1.2, p.z);
        trim.rotation.y = ang; group.add(trim);
      }
      if (hoardings) {
        // timber fighting gallery hung out over the wall face
        const rail = box(WALL_T+1.4, 0.5, w2, MAT.timber, p.x, WH+0.9, p.z);
        rail.rotation.y = ang; group.add(rail);
      }
    }
    // gatehouses, doors and levers — breaches render as charred stumps instead
    for (const sg of segGates) {
      const gc = sg.off;
      const p = along(gc);
      if (sg.g.breach) {
        // fire took this stretch: blackened stubs, permanently passable until repaired
        for (const off of [-GATE_W/2 + 0.4, -GATE_W/4, GATE_W/4, GATE_W/2 - 0.4]) {
          const q = along(gc + off);
          group.add(box(0.4, 0.7 + Math.abs(off)*0.15, 0.4, MAT.ruin, q.x, 0.35, q.z));
        }
        gatePts.push({ x: p.x, z: p.z });
        continue;
      }
      gatePts.push({ x: p.x, z: p.z });
      const gTier = sg.g.tier || 'gate';
      const grand = gTier === 'greatgate';
      const towerH = WH + (grand ? 3.6 : 2.4);
      for (const s of [-1, 1]) {
        const q = along(gc + s * (GATE_W/2 + 0.6));
        group.add(cyl(grand ? 1.5 : 1.2, grand ? 1.7 : 1.4, towerH, postMat, q.x, towerH/2, q.z, 8));
        group.add(cone(grand ? 1.9 : 1.5, grand ? 2.1 : 1.7, MAT.roofB, q.x, towerH + (grand ? 1.1 : 0.9), q.z, 8));
        if (grand) {
          const fl = box(0.06, 0.9, 0.7, MAT.rankBanner, q.x, towerH + 1.6, q.z);
          fl.userData.isFlag = true;
          group.add(fl);
        }
      }
      const lintel = box(WALL_T+0.4, grand ? 2.2 : 1.6, GATE_W, postMat, p.x, WH-0.2, p.z);
      lintel.rotation.y = ang; group.add(lintel);
      // the door: planks for wood, bars for portcullis tiers
      const door = new THREE.Group();
      const gh = WH - 1.2, gw = GATE_W - 1.2;
      if (gTier === 'woodgate') {
        door.add(box(0.2, gh, gw, MAT.timber, 0, gh/2, 0));
        door.add(box(0.24, 0.2, gw, MAT.ruin, 0, gh*0.3, 0));
        door.add(box(0.24, 0.2, gw, MAT.ruin, 0, gh*0.7, 0));
      } else {
        for (let k=0;k<5;k++)
          door.add(box(0.16, gh, 0.16, MAT.ruin, 0, gh/2, -gw/2 + k*gw/4));
        door.add(box(0.14, 0.16, gw, MAT.ruin, 0, gh*0.35, 0));
        door.add(box(0.14, 0.16, gw, MAT.ruin, 0, gh*0.75, 0));
      }
      door.position.set(p.x, 0, p.z);
      door.rotation.y = ang;
      group.add(door);
      sg.g._door = door;
      sg.g._doorH = gh + 0.3;
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
      // gate lanterns — the shared hearth-glow material lights them at dusk
      for (const s of [-1, 1]) {
        const q = along(gc + s * (GATE_W/2 + 0.6));
        group.add(box(0.22, 0.3, 0.22, MAT.timber, q.x + perpX*1.5, WH - 1.4, q.z + perpZ*1.5));
        const lam = new THREE.Sprite(MAT.windowGlow);
        lam.scale.setScalar(2.2);
        lam.position.set(q.x + perpX*1.5, WH - 1.3, q.z + perpZ*1.5);
        group.add(lam);
      }
    }
    // vertex post
    if (pal) {
      group.add(cyl(0.5, 0.6, WH+0.8, MAT.timber, a.x, (WH+0.8)/2, a.z, 6));
    } else {
      group.add(cyl(1.1, 1.3, WH+1.6, postMat, a.x, (WH+1.6)/2, a.z, 8));
      group.add(cone(1.4, 1.5, MAT.roofB, a.x, WH+2.3, a.z, 8));
    }
  }
  if (!closed) {
    const e = verts[n-1];
    if (pal) group.add(cyl(0.5, 0.6, WH+0.8, MAT.timber, e.x, (WH+0.8)/2, e.z, 6));
    else {
      group.add(cyl(1.1, 1.3, WH+1.6, postMat, e.x, (WH+1.6)/2, e.z, 8));
      group.add(cone(1.4, 1.5, MAT.roofB, e.x, WH+2.3, e.z, 8));
    }
  }
  // instanced toppers: merlons for stone, sharpened spikes for palisade
  const topper = (mats, geo, mat, y) => {
    if (!mats.length) return;
    const im = new THREE.InstancedMesh(geo, mat, mats.length);
    im.castShadow = true;
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), one = new THREE.Vector3(1,1,1);
    mats.forEach((m, idx) => {
      q.setFromEuler(new THREE.Euler(0, m.ang, 0));
      m4.compose(new THREE.Vector3(m.x, y, m.z), q, one);
      im.setMatrixAt(idx, m4);
    });
    group.add(im);
  };
  topper(merlonMats, new THREE.BoxGeometry(WALL_T+0.2, 0.9, 0.9), MAT.stoneD, WH+0.45);
  topper(spikeMats, new THREE.ConeGeometry(0.42, 1.1, 5), MAT.timber, WH+0.5);
  return { group, gates, blockers, gatePts };
}

// rebuild one wall's meshes in place (after adding a gate)
function rebuildWall(w) {
  scene.remove(w.group);
  disposeGroup(w.group);
  const r = buildWallMeshes(w.path, w.closed, w.gates, w.tier || 'wall', !!w.hoardings);
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
let ghostRot = 0;                // R rotates placement by quarter turns
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

function pointInBuilding(x, z) {
  for (const b of state.buildings) {
    if (b.ruined) continue;
    const def = BUILD_DEFS[b.type];
    if (Math.abs(x-b.x) < def.w/2 + 0.5 && Math.abs(z-b.z) < def.d/2 + 0.5) return true;
  }
  return false;
}
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
  const lockRank = toolLocked(type);
  if (lockRank) return { ok:false, why:`${def.nm}s unlock at ${lockRank.pop} folk` };
  if (type === 'keep' && state.buildings.some(b => b.type === 'keep')) return { ok:false, why:'The town already has its Keep' };
  if (def.needsWard && wardDepth(x, z) === 0) return { ok:false, why:`A ${def.nm.toLowerCase()} must stand inside walls — raise the ward first` };
  if (overlapsBuilding(x, z, def.w, def.d)) return { ok:false, why:'Blocked by a building' };
  if (nearWall(x, z, Math.max(def.w, def.d)/2 + 1.2)) return { ok:false, why:'Too close to a wall' };
  if (def.needsTrees && countNear(trees, x, z, 15) < def.needsTrees) return { ok:false, why:`Needs ${def.needsTrees}+ trees within reach` };
  if (def.needsRocks && countNear(rocks, x, z, 15) < def.needsRocks) return { ok:false, why:`Needs ${def.needsRocks}+ rocks within reach` };
  if (!canAfford(def.cost)) return { ok:false, why:'Cannot afford' };
  return { ok:true };
}

const BUILD_TIME = 8;   // seconds of visible construction
function makeScaffold(def) {
  const g = new THREE.Group();
  const hw = def.w/2 + 0.5, hd = def.d/2 + 0.5, h = 3.2;
  for (const [sx, sz] of [[-hw,-hd],[hw,-hd],[-hw,hd],[hw,hd]])
    g.add(cyl(0.09, 0.09, h, MAT.timber, sx, h/2, sz, 5));
  for (const s of [-1, 1]) {
    g.add(box(hw*2, 0.1, 0.1, MAT.timber, 0, h-0.4, s*hd));
    g.add(box(0.1, 0.1, hd*2, MAT.timber, s*hw, h-0.4, 0));
  }
  return g;
}
function cleanupConstruction(b) {
  if (b._scaff) { scene.remove(b._scaff); disposeGroup(b._scaff); b._scaff = null; }
  if (b._crew) {
    for (const w of b._crew) { scene.remove(w.grp); disposeGroup(w.grp); }
    b._crew = null;
  }
}
function finishConstruction(b) {
  cleanupConstruction(b);
  b.group.scale.set(1, 1, 1);
  dustBurst(b.x, b.z, Math.max(BUILD_DEFS[b.type].w, BUILD_DEFS[b.type].d)/2 + 0.5, 8);
  AudioSys.play('thunk');
  refreshCoverage();   // a finished well/market starts covering only now
}

function placeBuilding(type, x, z, free=false, rot=0) {
  const def = BUILD_DEFS[type];
  if (!free) {
    const chk = placementCheck(type, x, z);
    if (!chk.ok) return null;
    pay(def.cost);
  }
  const group = buildMesh(type, x, z);
  group.position.set(x, 0, z);
  group.rotation.y += rot;
  scene.add(group);
  const b = { type, x, z, rot, hp:def.hp, maxHp:def.hp, depth:wardDepth(x,z), ruined:false, group, hitFlash:0,
    buildT: free ? 1 : 0, burnT: 0, smolderT: 0, day: state.day || 1 };
  if (!free) {
    dustBurst(x, z, Math.max(def.w, def.d)/2 + 0.5, 10);
    group.scale.setScalar(0.25);
    AudioSys.play('thunk');
    // scaffold + a two-man crew hammer away until it's done
    b._scaff = makeScaffold(def);
    b._scaff.position.set(x, 0, z);
    scene.add(b._scaff);
    b._crew = [];
    for (const s of [-1, 1]) {
      const wgrp = makeFigure(0x8c6a3a, 'villager');
      wgrp.scale.setScalar(0.8);
      const wx = x + s*(def.w/2 + 1.0), wz = z + s*0.6;
      wgrp.position.set(wx, 0, wz);
      wgrp.rotation.y = Math.atan2(x - wx, z - wz);
      scene.add(wgrp);
      b._crew.push({ grp: wgrp, bob: Math.random()*6 });
    }
  }
  wireGroup(b, group);
  state.buildings.push(b);
  refreshCoverage();
  stampFoundation(x, z, def.w, def.d);
  return b;
}

function demolish(b) {
  if (b.type === 'keep') { msg('The Keep cannot be demolished.', 'warn'); return; }
  cleanupConstruction(b);
  scene.remove(b.group);
  disposeGroup(b.group);
  state.buildings.splice(state.buildings.indexOf(b), 1);
  refreshCoverage();
  if (!b.ruined) {
    const def = BUILD_DEFS[b.type];
    for (const k in def.cost) state[k] += Math.floor(def.cost[k]*0.5);
    msg(`${def.nm} demolished (half cost refunded).`, 'dim');
  } else msg('Rubble cleared.', 'dim');
}

function activeWallTier() { return WALL_TIERS[tool] ? tool : 'wall'; }
function wallDraftCost(tierKey = activeWallTier()) {
  let len = 0;
  for (let i=1;i<wallDraft.length;i++)
    len += Math.hypot(wallDraft[i].x-wallDraft[i-1].x, wallDraft[i].z-wallDraft[i-1].z);
  // a free-standing draft will close back to its first corner; a joined draft won't
  if (!startAttach && wallDraft.length >= 3) {
    const a = wallDraft[wallDraft.length-1], b = wallDraft[0];
    len += Math.hypot(b.x-a.x, b.z-a.z);
  }
  return Math.ceil(len * WALL_TIERS[tierKey].cost);
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
  const tierKey = activeWallTier();
  const tier = WALL_TIERS[tierKey];
  const cost = wallDraftCost(tierKey);
  if (state[tier.res] < cost) { msg(`Not enough ${tier.res} — this wall costs ${cost}.`, 'warn'); wallDraft.pop(); return; }
  const hit = wallSegsCrossBuilding(D, false);
  if (hit) { msg(`The wall would cut through a ${hit.nm.toLowerCase()}. Route it around.`, 'warn'); wallDraft.pop(); return; }
  const poly = composeWard(startAttach, endAttach, D);
  if (!poly) { msg('That ward would be too small — give it more room.', 'warn'); wallDraft.pop(); return; }
  state[tier.res] -= cost;
  const { group, gates, blockers, gatePts } = buildWallMeshes(D, false, null, tierKey);
  scene.add(group);
  state.walls.push({ poly, path:D, closed:false, tier:tierKey, group, gates, blockers, gatePts });
  state.villagers.forEach(v => { v.path = null; });
  refreshDepths();
  const inside = state.buildings.filter(b => b.depth > 0 && !b.ruined).length;
  teleEv('wall_join', cost);
  msg(`Walls joined — 🪨${cost}. A new ward is enclosed (${inside} building${inside===1?'':'s'} behind walls).`, 'good');
  const maxDepth = Math.max(...state.buildings.map(b => b.depth), 0);
  if (maxDepth >= 2) msg('An inner ward! Deep wards pay richer taxes.', 'good');
  wallDraft = []; startAttach = null;
  redrawWallPreview();
  saveGame();
}

function wallStoneValue(w) {
  const n = w.path.length, segs = w.closed ? n : n-1;
  let len = 0;
  for (let i=0;i<segs;i++) len += Math.hypot(w.path[(i+1)%n].x-w.path[i].x, w.path[(i+1)%n].z-w.path[i].z);
  const tier = WALL_TIERS[w.tier || 'wall'];
  const gateCost = w.gates.reduce((s,g) => s + (g.breach ? 0 : GATE_TIERS[g.tier || 'gate'].cost), 0);
  return Math.ceil(len * tier.cost) + gateCost;
}
function touchesWall(w, pt) {
  const n = w.path.length, segs = w.closed ? n : n-1;
  for (let i=0;i<segs;i++){
    const a = w.path[i], b = w.path[(i+1)%n];
    if (distToSeg(pt.x, pt.z, a.x, a.z, b.x, b.z) < 1.6) return true;
  }
  return false;
}
// fire breaches a palisade: a charred gap opens, the ward's shelter is lost
// until it is repaired with the wall tool
function breachWall(w, nearX, nearZ) {
  const n = w.path.length, segs = w.closed ? n : n-1;
  let best = { d: 1e9, seg: 0, t: 0.5 };
  for (let i=0;i<segs;i++){
    const a = w.path[i], b = w.path[(i+1)%n];
    const L2 = (b.x-a.x)**2 + (b.z-a.z)**2 || 1;
    let t = ((nearX-a.x)*(b.x-a.x) + (nearZ-a.z)*(b.z-a.z)) / L2;
    t = Math.max(0.15, Math.min(0.85, t));
    const px = a.x + (b.x-a.x)*t, pz = a.z + (b.z-a.z)*t;
    const d = Math.hypot(nearX-px, nearZ-pz);
    if (d < best.d) best = { d, seg: i, t };
  }
  w.gates.push({ seg: best.seg, t: best.t, breach: true });
  w.breached = true;
  rebuildWall(w);
  refreshDepths();
  refreshCoverage();
  teleEv('palisade_breach');
  msg('🔥 The palisade burns through — the ward lies OPEN until it is repaired (wall tool).', 'warn');
  AudioSys.play('bell');
}
function raiseHoardings(w) {
  if (w.hoardings) { msg('That wall already has hoardings.', 'warn'); return false; }
  if (state.wood < HOARDING_COST) { msg(`Hoardings cost ${HOARDING_COST} wood.`, 'warn'); return false; }
  state.wood -= HOARDING_COST;
  w.hoardings = true;
  rebuildWall(w);
  teleEv('hoardings');
  msg('Hoardings raised — this wall\'s sentries take up bows.', 'good');
  AudioSys.play('thunk');
  saveGame();
  return true;
}
function repairWall(w) {
  const cost = 25;
  if (state.wood < cost) { msg(`Repairs need ${cost} wood.`, 'warn'); return false; }
  state.wood -= cost;
  w.gates = w.gates.filter(g => !g.breach);
  w.breached = false;
  rebuildWall(w);
  refreshDepths();
  refreshCoverage();
  msg('The palisade is mended — the ward is sheltered again.', 'good');
  AudioSys.play('thunk');
  saveGame();
  return true;
}

// tear down a wall (quarter of the stone salvaged); connectors left dangling
// with a missing host are torn down with it
function removeWall(w, refundFrac = 0.25) {
  const tear = (x) => {
    scene.remove(x.group); disposeGroup(x.group);
    (x.sentries || []).forEach(st => { scene.remove(st.grp); disposeGroup(st.grp); });
    state.walls.splice(state.walls.indexOf(x), 1);
    state.stone += Math.floor(wallStoneValue(x) * refundFrac);
  };
  tear(w);
  let again = true;
  while (again) {
    again = false;
    for (const c of [...state.walls]) {
      if (c.closed) continue;
      const ends = [c.path[0], c.path[c.path.length-1]];
      if (!ends.every(e => state.walls.some(o => o !== c && touchesWall(o, e)))) {
        tear(c);
        again = true;
      }
    }
  }
  refreshDepths();
  refreshCoverage();
  state.villagers.forEach(v => { v.path = null; });
  teleEv('wall_down');
}

// one gate-tool click at world coords (shared by mouse input and test hooks)
function gateClickAt(wx, wz, tierKey) {
  tierKey = GATE_TIERS[tierKey] ? tierKey : (GATE_TIERS[tool] ? tool : 'gate');
  const gt = GATE_TIERS[tierKey];
  const sp = wallSnap(wx, wz);
  if (!sp) { msg('Click on a wall to cut a gate into it.', 'warn'); return false; }
  const w = sp.wall, n = w.path.length;
  const a = w.path[sp.seg], b = w.path[(sp.seg+1)%n];
  const len = Math.hypot(b.x-a.x, b.z-a.z);
  if (len <= GATE_W + 2) { msg('That stretch of wall is too short for a gate.', 'warn'); return false; }
  if (w.gates.some(g => g.seg === sp.seg && Math.abs(g.t - sp.t) * len < GATE_W + 2)) { msg('There is already a gate there.', 'warn'); return false; }
  if (state[gt.res] < gt.cost) { msg(`A ${gt.nm.toLowerCase()} costs ${gt.cost} ${gt.res}.`, 'warn'); return false; }
  state[gt.res] -= gt.cost;
  w.gates.push({ seg: sp.seg, t: sp.t, tier: tierKey });
  rebuildWall(w);
  teleEv('gate_cut', tierKey);
  msg(`${gt.nm} cut through the wall.`, 'good');
  AudioSys.play('creak');
  saveGame();
  return true;
}

// one wall-tool click at world coords (shared by mouse input and test hooks)
function wallClickAt(wx, wz) {
  const sp = wallSnap(wx, wz);
  if (sp && sp.wall.breached && !wallDraft.length) { repairWall(sp.wall); return; }
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
  let x = snap(wx), z = snap(wz);
  if (Math.abs(x) > MAP || Math.abs(z) > MAP) return;
  if (!startAttach && wallDraft.length >= 3 && Math.hypot(x-wallDraft[0].x, z-wallDraft[0].z) < 3.5) { tryCloseWall(); return; }
  if (wallDraft.length) {
    // auto-straighten: near-axis segments snap square, so rings come out clean
    const p = wallDraft[wallDraft.length-1];
    const dx = x - p.x, dz = z - p.z;
    if (Math.abs(dx) < Math.abs(dz) * 0.25) x = p.x;
    else if (Math.abs(dz) < Math.abs(dx) * 0.25) z = p.z;
  }
  if (wallDraft.length && Math.hypot(x-wallDraft[wallDraft.length-1].x, z-wallDraft[wallDraft.length-1].z) < 2) return;
  wallDraft.push({ x, z });
  dustBurst(x, z, 0.6, 4);
  AudioSys.play('click');
  redrawWallPreview();
}

function redrawWallPreview() {
  for (const c of [...wallPreview.children]) disposeGroup(c);
  wallPreview.clear();
  const pts = [...wallDraft];
  let cursorSnapped = false;
  if (isWallTool(tool)) {
    const sp = wallSnap(mouseGround.x, mouseGround.z);
    cursorSnapped = !!sp;
    if (pts.length || sp) pts.push(sp ? { x:sp.x, z:sp.z } : { x:mouseGround.x, z:mouseGround.z });
  }
  const broke = wallDraft.length >= 2 && wallDraftCost() > state.stone;
  const baseCol = broke ? 0xc35b4a : 0xd9a44a;
  for (let i=0;i<pts.length;i++){
    const isCursor = (i === pts.length-1);
    const joined = (i === 0 && startAttach) || (isCursor && cursorSnapped);
    const post = cyl(0.5, 0.6, 3.4, new THREE.MeshLambertMaterial({ color: joined ? 0x7ac36a : baseCol, transparent:true, opacity:0.85 }), pts[i].x, 1.7, pts[i].z, 6);
    if (isCursor && isWallTool(tool)) post.scale.setScalar(1 + Math.sin(performance.now()*0.006)*0.09);
    wallPreview.add(post);
    if (i>0) {
      const a = pts[i-1], b = pts[i];
      const len = Math.hypot(b.x-a.x, b.z-a.z);
      const seg = box(0.5, 2.2, len, new THREE.MeshLambertMaterial({ color: baseCol, transparent:true, opacity:0.45 }),
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
  const tierKey = activeWallTier();
  const tier = WALL_TIERS[tierKey];
  const cost = wallDraftCost(tierKey);
  if (state[tier.res] < cost) { msg(`Not enough ${tier.res} — the ring costs ${cost}.`, 'warn'); return; }
  const hit = wallSegsCrossBuilding(wallDraft, true);
  if (hit) { msg(`The wall would cut through a ${hit.nm.toLowerCase()}. Route it around.`, 'warn'); return; }
  state[tier.res] -= cost;
  const verts = wallDraft.map(v => ({x:v.x, z:v.z}));
  const { group, gates, blockers, gatePts } = buildWallMeshes(verts, true, null, tierKey);
  scene.add(group);
  state.walls.push({ poly: verts, path: verts, closed: true, tier: tierKey, group, gates, blockers, gatePts });
  state.villagers.forEach(v => { v.path = null; });
  AudioSys.play('stone');
  if (state.walls.length === 1 && state.raidNum === 0 && DIFF[state.difficulty].raid > 0) {
    state.raidTimer = 90;
    msg('Word of a walled town spreads. Raiders will come — and they strike whatever stands OUTSIDE the walls.', 'warn');
  }
  refreshDepths();
  const inside = state.buildings.filter(b => b.depth > 0 && !b.ruined).length;
  teleEv('wall_ring', cost);
  msg(`Ring closed — ${cost} ${tier.res}. ${inside} building${inside===1?'':'s'} now behind walls.`, 'good');
  if (state.walls.length === 1) msg('The ring is solid — cut a gate (WALLS tab) where you want one.', 'dim');
  if (tierKey === 'palisade') msg('A wooden palisade — quick and cheap, but fire can breach it.', 'dim');
  const maxDepth = Math.max(...state.buildings.map(b => b.depth), 0);
  if (maxDepth >= 2) msg('An inner ward! Deep wards pay richer taxes.', 'good');
  wallDraft = [];
  redrawWallPreview();
  saveGame();
}

function refreshPaletteLocks() { renderPalette(); }

function setTool(t) {
  const lockRank = t && toolLocked(t);
  if (lockRank) { msg(`${TOOL_NAME(t)} unlocks at ${lockRank.pop} folk (${lockRank.nm}).`, 'warn'); return; }
  if (t) selectBuilding(null);
  ghostRot = 0;
  if (isWallTool(tool) && !isWallTool(t)) { wallDraft = []; startAttach = null; redrawWallPreview(); }
  tool = (tool === t) ? null : t;
  if (ghost) { scene.remove(ghost); ghost = null; }
  if (tool && BUILD_DEFS[tool]) {
    ghost = buildMesh(tool);
    ghost.traverse(o => { if (o.material) { o.material = o.material.clone(); o.material.transparent = true; o.material.opacity = 0.55; } });
    scene.add(ghost);
  }
  renderPalette();
  hintEl.style.display = 'none';
  if (tool) { AudioSys.play('click'); tele.tools[tool] = (tele.tools[tool] || 0) + 1; }
  const hintKey = isWallTool(tool) ? 'wall' : isGateTool(tool) ? 'gate' : isRoadTool(tool) ? 'road' : tool;
  if (tool && TOOL_HINTS[hintKey] && !seenHints[hintKey]) { seenHints[hintKey] = true; msg(TOOL_HINTS[hintKey], 'dim'); }
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

// ---------------------------------------------------------------- telemetry
// silent session log -> one-button report, so a human playtest yields data
const tele = {
  samples: [], events: [], tools: {}, sampleT: 0, active: false,
  speedSecs: { paused: 0, 1: 0, 2: 0, 4: 0 },
};
function teleStart(resumed) {
  tele.active = true;
  teleEv(resumed ? 'session_resume' : 'town_founded', state.townName);
}
function teleEv(type, detail) {
  if (!tele.active) return;
  tele.events.push({ day: state.day, t: Math.round(state.time), type, detail: detail === undefined ? '' : String(detail) });
  if (tele.events.length > 800) tele.events.shift();
}
function teleSample(dt) {
  tele.sampleT += dt;
  if (tele.sampleT < 5) return;
  tele.sampleT = 0;
  tele.samples.push({ t: Math.round(state.time), day: state.day,
    g: Math.floor(state.gold), w: Math.floor(state.wood), s: Math.floor(state.stone),
    f: Math.floor(state.food), p: Math.floor(state.pop) });
  if (tele.samples.length > 700) tele.samples.shift();
}
function buildTeleReport() {
  const mins = v => (v/60).toFixed(1) + 'm';
  const real = Object.values(tele.speedSecs).reduce((a,b) => a+b, 0);
  let out = 'BULWARK PLAYTEST REPORT\n';
  out += `${state.townName || 'Unnamed'} in ${state.regionNm || '?'} — ${RANKS[state.rankIdx].nm}, Day ${state.day} (${seasonOf(state.day).nm})\n`;
  out += `Real time ${mins(real)} — paused ${mins(tele.speedSecs.paused)} · 1x ${mins(tele.speedSecs[1])} · 2x ${mins(tele.speedSecs[2])} · 4x ${mins(tele.speedSecs[4])}\n`;
  out += `Now: gold ${Math.floor(state.gold)}, wood ${Math.floor(state.wood)}, stone ${Math.floor(state.stone)}, food ${Math.floor(state.food)}/${foodCap()}, pop ${Math.floor(state.pop)}/${popCap()}\n\n`;
  const mile = tele.events.filter(e => ['town_founded','session_resume','rank_up','charter','game_over'].includes(e.type));
  out += 'MILESTONES\n' + mile.map(e => `  day ${e.day} (t=${e.t}s): ${e.type} ${e.detail}`).join('\n') + '\n\n';
  const counts = {};
  tele.events.forEach(e => { counts[e.type] = (counts[e.type] || 0) + 1; });
  out += 'EVENTS: ' + Object.entries(counts).map(([k,v]) => `${k}×${v}`).join(', ') + '\n';
  const tradeGold = tele.events.filter(e => e.type === 'caravan_trade').reduce((s,e) => s + (+e.detail || 0), 0);
  out += `Caravan gold total: ${tradeGold}\n`;
  let maxGap = 0, gapAt = 0;
  for (let i = 1; i < tele.events.length; i++) {
    const g = tele.events[i].t - tele.events[i-1].t;
    if (g > maxGap) { maxGap = g; gapAt = tele.events[i-1].t; }
  }
  out += `Longest quiet stretch: ${maxGap}s of sim time (after t=${gapAt}s)\n\n`;
  out += 'RESOURCE CURVE (gold/wood/stone/food/pop)\n';
  const step = Math.max(1, Math.floor(tele.samples.length / 30));
  for (let i = 0; i < tele.samples.length; i += step) {
    const s = tele.samples[i];
    out += `  d${s.day} t=${s.t}s: ${s.g}/${s.w}/${s.s}/${s.f}/${s.p}\n`;
  }
  out += '\nTOOL SELECTIONS: ' + (Object.entries(tele.tools).map(([k,v]) => `${k}×${v}`).join(', ') || 'none') + '\n';
  return out;
}

// ---------------------------------------------------------------- founding charter
const OBJECTIVES = [
  { id:'keep',   label:'Raise your Keep — choose good ground', test:() => state.buildings.some(b => b.type === 'keep') },
  { id:'wall',   label:'Ring the Keep with a wall (WALLS tab)', test:() => state.buildings.some(b => b.type==='keep' && b.depth > 0) },
  { id:'gate',   label:'Cut a gate through it (WALLS tab)',     test:() => state.walls.some(w => w.gates.some(g => !g.breach)) },
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
      if (o.test()) { objDone[o.id] = true; teleEv('charter', o.id); if (!silent) { msg(`✔ ${o.label}`, 'good'); AudioSys.play('chime'); } }
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
  road: 'Click or drag across the ground to lay cobbles. Folk and caravans travel faster on roads.',
  keep: 'Your Keep is the heart of the town — near trees and stone is wise. If it falls, the town falls.',
};
const seenHints = {};

function costStr(cost) {
  return Object.entries(cost).map(([k,v]) => `${resSVG(k, 11)}${v}`).join(' ') || '—';
}
function toolCostStr(t) {
  if (WALL_TIERS[t]) return `${resSVG(WALL_TIERS[t].res, 11)}${WALL_TIERS[t].cost}/u`;
  if (GATE_TIERS[t]) return `${resSVG(GATE_TIERS[t].res, 11)}${GATE_TIERS[t].cost}`;
  if (ROAD_TIERS[t]) return `${resSVG(ROAD_TIERS[t].res, 11)}${ROAD_TIERS[t].cost}/u`;
  if (t === 'hoardings') return `${resSVG('wood', 11)}${HOARDING_COST}/wall`;
  if (t === 'demolish') return 'refund ½';
  return costStr(BUILD_DEFS[t].cost);
}
function canAffordTool(t) {
  if (WALL_TIERS[t]) return state[WALL_TIERS[t].res] >= WALL_TIERS[t].cost * 8;
  if (GATE_TIERS[t]) return state[GATE_TIERS[t].res] >= GATE_TIERS[t].cost;
  if (ROAD_TIERS[t]) return state[ROAD_TIERS[t].res] >= ROAD_TIERS[t].cost;
  if (t === 'hoardings') return state.wood >= HOARDING_COST;
  if (BUILD_DEFS[t]) return canAfford(BUILD_DEFS[t].cost);
  return true;
}

// tabbed woodcut palette: digits pick within the open tab, Tab cycles tabs
let activeTab = 0;
function renderPalette() {
  const pal = $('palette');
  pal.innerHTML = '';
  const open = TABS[activeTab].tools.filter(t => !toolLocked(t));
  const row = document.createElement('div');
  row.className = 'grow';
  open.forEach((t, i) => {
    const el = document.createElement('div');
    el.className = 'tool' + (tool === t ? ' active' : '');
    el.dataset.t = t;
    el.innerHTML = `<div class="key">${i < 9 ? i+1 : ''}</div><div class="ico">${iconSVG(t, 30)}</div><div class="nm">${TOOL_NAME(t)}</div><div class="cost">${toolCostStr(t)}</div>`;
    el.onclick = () => setTool(t);
    row.appendChild(el);
  });
  pal.appendChild(row);
  const tabRow = document.createElement('div');
  tabRow.className = 'tabrow';
  TABS.forEach((tb, i) => {
    const anyOpen = tb.tools.some(t => !toolLocked(t));
    if (!anyOpen) return;   // whole trades appear as the town earns them
    const el = document.createElement('div');
    el.className = 'ptab' + (i === activeTab ? ' on' : '');
    el.textContent = tb.nm;
    el.onclick = () => { activeTab = i; renderPalette(); AudioSys.play('click'); };
    tabRow.appendChild(el);
  });
  const dem = document.createElement('div');
  dem.className = 'ptab demtab' + (tool === 'demolish' ? ' on' : '');
  dem.textContent = 'DEMOLISH (X)';
  dem.onclick = () => setTool('demolish');
  tabRow.appendChild(dem);
  pal.appendChild(tabRow);
}

function fmt(n) { return Math.floor(n); }

// shared ledger text for hover tooltips and the selection card
function buildingInfoHTML(b) {
  const def = BUILD_DEFS[b.type];
  let html = `<b>${def.nm}</b>${b.ruined ? ' — ruin (Demolish to clear)' : ''}${b.onFire ? ' — 🔥 ON FIRE' : ''}${!b.ruined && b.buildT < 1 ? ' — under construction' : ''}`;
  if (!b.ruined && def.popCap) {
    const occ = Math.round(def.popCap * Math.min(1, state.pop / Math.max(1, popCap())));
    let rate = b.depth >= 1 ? 2 * (1 + 0.25 * (b.depth - 1)) : 0.8;
    for (const [flag, m] of [['_mkt',1.3],['_well',1.15],['_tav',1.1],['_chap',1.08],['_fnt',1.05],['_road',1.05],['_high',1.15]])
      if (b[flag]) rate *= m;
    html += `\n<span class="${b.depth ? 'safe' : 'unsafe'}">${b.depth ? `🛡 Ward ${['','I','II','III','IV','V'][Math.min(b.depth,5)]}` : '⚠ Outside walls'}</span> · ${occ} folk · ${(occ*rate).toFixed(1)} gold/day`;
    const marks = [
      ['_well','well'],['_mkt','market'],['_tav','tavern'],['_chap','chapel'],['_fnt','fountain'],['_road','street'],['_high','high wall'],
    ].filter(([f]) => b[f]).map(([,n]) => n);
    html += `\n<span class="safe">${marks.length ? '+ ' + marks.join(' · ') : ''}</span>`;
    if (b.type === 'house' && b._well && b._mkt && b.depth >= 1) html += `\n<span class="safe">↑ will grow into a townhouse</span>`;
    if (b.type === 'townhouse' && b.depth >= 2 && b._well && b._mkt && (b._tav || b._chap)) html += `\n<span class="safe">↑ will grow into a MANOR</span>`;
  }
  if (!b.ruined && def.storage) html += `\n+${def.storage} food storage (town total ${foodCap()})`;
  if (!b.ruined && b.type === 'farm') html += `\n${seasonOf(state.day).nm}: ×${seasonOf(state.day).farm}${b._mill ? ' · mill ×1.25' : ''}${state.raining ? ' · rain ×1.25' : ''}`;
  if (!b.ruined && b.type === 'woodcutter' && b._saw) html += `\nsawmill ×1.25`;
  if (!b.ruined && b.type === 'well') html += `\nwaters houses within ${def.coverR} — and fights fires`;
  if (!b.ruined && (b.type === 'mill' || b.type === 'sawmill')) html += `\nboosts ${b.type === 'mill' ? 'farms' : 'woodcutters'} within ${def.auraR}`;
  if (!b.ruined && b.type === 'tradepost') html += `\ncaravans pay extra here — but it stands unwalled`;
  if (!b.ruined && b.type === 'infirmary') html += `\ntends the sick within ${def.boostR} — winter fevers halved`;
  if (!b.ruined && b.type === 'bathhouse') html += `\nclean living within ${def.boostR} — fevers ×0.7`;
  if (!b.ruined && b.type === 'school') html += `\na lettered town works smarter — workforce 70% → 80%`;
  if (!b.ruined && b.type === 'orchard') html += `\n${def.foodPerDay} food/day${seasonOf(state.day).nm === 'Winter' ? ' — ×0.5 in winter' : ''} — needs no field hands beyond its keeper`;
  if (!b.ruined && b.type === 'beacon') html += `\nthe watch lights it early — raid warning 45s → 75s`;
  if (!b.ruined && b.buildT >= 1 && JOB_SLOTS[b.type])
    html += `\n<span class="${(b.workers || 0) > 0 ? 'safe' : 'unsafe'}">⚒ ${b.workers || 0}/${b.jobs || JOB_SLOTS[b.type]} workers${(b.workers || 0) === 0 ? ' — idle, does nothing' : ''}</span>`;
  if (!b.ruined && b.type === 'townhall' && b.buildT >= 1) {
    html += (b.workers || 0) > 0
      ? `\n<span class="safe">the council sits — proclaim edicts below</span>`
      : `\n<span class="unsafe">no clerk — edicts suspended</span>`;
    for (const [k, e] of Object.entries(EDICTS)) {
      const on = !!(state.edicts || {})[k];
      html += `\n<button class="edictbtn${on ? ' on' : ''}" data-edict="${k}">${on ? '✓ ' : ''}${e.nm}</button><span class="edictdesc">${e.desc}</span>`;
    }
  }
  if (!b.ruined && b.hp < b.maxHp - 0.5) html += `\n${Math.round(b.hp)}/${b.maxHp} hp`;
  return html;
}

// ---------------------------------------------------------------- selection
let selB = null;
const selRing = new THREE.Mesh(
  new THREE.RingGeometry(1, 1.15, 32),
  new THREE.MeshBasicMaterial({ color:0xd9a44a, transparent:true, opacity:0.85, side:THREE.DoubleSide, depthWrite:false })
);
selRing.rotation.x = -Math.PI/2;
selRing.position.y = 0.07;
selRing.visible = false;
scene.add(selRing);
function selectBuilding(b) {
  selB = b;
  const card = $('bcard');
  if (!b) { card.style.display = 'none'; selRing.visible = false; return; }
  selRing.visible = true;
  selRing.position.x = b.x; selRing.position.z = b.z;
  selRing.scale.setScalar(Math.max(BUILD_DEFS[b.type].w, BUILD_DEFS[b.type].d)/2 + 1.1);
  $('bcard-body').innerHTML = buildingInfoHTML(b).replace(/\n/g, '<br>');
  $('bcard-demolish').style.display = (b.type === 'keep') ? 'none' : '';
  card.style.display = 'block';
}
$('bcard-x').onclick = () => selectBuilding(null);
// edict toggles live inside the re-rendered card body — delegate the clicks
$('bcard-body').addEventListener('click', ev => {
  const btn = ev.target.closest('[data-edict]');
  if (!btn || !selB || selB.type !== 'townhall') return;
  const k = btn.dataset.edict;
  setEdict(k, !(state.edicts || {})[k]);
  selectBuilding(selB);
});
$('bcard-demolish').onclick = () => {
  if (selB && selB.type !== 'keep') {
    demolish(selB);
    saveGame();
    selectBuilding(null);
  }
};
function updateHUD() {
  $('r-gold').textContent = fmt(state.gold);
  $('r-wood').textContent = fmt(state.wood);
  $('r-stone').textContent = fmt(state.stone);
  $('r-food').textContent = `${fmt(state.food)}∕${foodCap()}`;
  $('r-pop').textContent = `${fmt(state.pop)}/${popCap()}${state.sick ? ` · ${state.sick} sick` : ''}`;
  $('r-jobs').textContent = `${state.employed || 0}/${state.jobsTotal || 0}`;
  $('daycount').textContent = `${state.townName ? state.townName + ' — ' : ''}${RANKS[state.rankIdx].nm} · Day ${state.day} · ${seasonOf(state.day).nm}`;
  const warn = $('raidwarn');
  const raidsOn = DIFF[state.difficulty].raid > 0 && state.walls.length > 0;
  if (state.bandits.length) {
    warn.style.display = 'inline';
    warn.textContent = '⚠ RAID IN PROGRESS';
    warn.style.animation = '';
  } else if (!state.over && raidsOn && state.raidTimer <= (state.buildings.some(b => !b.ruined && b.buildT >= 1 && b.type === 'beacon') ? 75 : 45)) {
    warn.style.display = 'inline';
    warn.textContent = state.raidTimer < 15
      ? `⚠ RAIDERS FROM THE ${state.raidEdge.name} — ${Math.ceil(state.raidTimer)}s`
      : `⚔ Raid in ${Math.ceil(state.raidTimer)}s`;
    warn.style.animation = state.raidTimer < 15 ? '' : 'none';
  } else warn.style.display = 'none';
  $('vignette').style.opacity = state.bandits.length ? 1 : 0;
  // food delta
  const dfood = foodRate();
  const df = $('d-food');
  df.textContent = dfood >= 0 ? ` +${dfood.toFixed(1)}/d` : ` ${dfood.toFixed(1)}/d`;
  df.style.color = dfood >= 0 ? '#8faf68' : '#ff9b6a';
  // affordability shading
  document.querySelectorAll('.tool').forEach(el => {
    el.classList.toggle('disabled', !canAffordTool(el.dataset.t));
  });
}

// ---------------------------------------------------------------- economy
function popCap() {
  let c = 0;
  for (const b of state.buildings) if (!b.ruined && BUILD_DEFS[b.type].popCap) c += BUILD_DEFS[b.type].popCap;
  return c;
}
function foodCap() {
  let c = 120;
  for (const b of state.buildings) if (!b.ruined && b.buildT >= 1 && b.type === 'granary') c += BUILD_DEFS.granary.storage;
  return c;
}
function foodRate() { // per day
  let r = 0;
  const seas = seasonOf(state.day);
  for (const b of state.buildings) {
    if (b.ruined || b.buildT < 1) continue;
    if (b.type === 'farm') r += BUILD_DEFS.farm.foodPerDay * seas.farm * (b._mill ? 1.25 : 1) * staffEff(b);
    else if (b.type === 'orchard') r += BUILD_DEFS.orchard.foodPerDay * (seas.nm === 'Winter' ? 0.5 : 1) * staffEff(b);
  }
  return r - state.pop * 0.5;
}
function coveredBy(b, type, r) {
  return state.buildings.some(o => !o.ruined && o.type === type && Math.hypot(o.x-b.x, o.z-b.z) <= r);
}
// coverage flags are cached and refreshed only when buildings change —
// the per-tick economy/fire/upgrade loops read b._well / b._mkt
function coveredByBuilt(b, type, r) {
  return state.buildings.some(o => !o.ruined && o.buildT >= 1 && o.type === type
    && (JOB_SLOTS[type] ? (o.workers || 0) > 0 : true)
    && Math.hypot(o.x-b.x, o.z-b.z) <= r);
}
function refreshCoverage() {
  refreshJobs();   // services only cover when someone staffs them
  for (const b of state.buildings) {
    if (b.ruined) { b._well = b._mkt = b._tav = b._chap = b._fnt = b._mill = b._saw = false; continue; }
    b._well = coveredByBuilt(b, 'well', BUILD_DEFS.well.coverR);
    b._mkt  = coveredByBuilt(b, 'market', BUILD_DEFS.market.boostR);
    b._tav  = coveredByBuilt(b, 'tavern', BUILD_DEFS.tavern.boostR);
    b._chap = coveredByBuilt(b, 'chapel', BUILD_DEFS.chapel.boostR);
    b._fnt  = coveredByBuilt(b, 'fountain', BUILD_DEFS.fountain.boostR);
    b._mill = b.type === 'farm' && coveredByBuilt(b, 'mill', BUILD_DEFS.mill.auraR);
    b._saw  = b.type === 'woodcutter' && coveredByBuilt(b, 'sawmill', BUILD_DEFS.sawmill.auraR);
    // high walls and street frontage lend prestige to homes
    b._high = false;
    for (const w of state.walls) {
      if (w.tier === 'highwall' && !w.breached && pointInPoly(b.x, b.z, w.poly)) { b._high = true; break; }
    }
    b._road = nearFlagRoad(b.x, b.z);
  }
}

// ---------------------------------------------------------------- jobs
// production and services need hands: workforce ≈ 70% of the well,
// auto-assigned by priority. Understaffed buildings run proportionally slower.
const JOB_SLOTS = {
  farm:2, orchard:1, woodcutter:1, sawmill:1, quarry:2, mill:1,
  market:2, tavern:1, tradepost:1, infirmary:1, bathhouse:1, school:1, chapel:1, townhall:1,
};
const JOB_PRIORITY = ['farm','orchard','woodcutter','quarry','mill','sawmill','market',
  'tavern','infirmary','bathhouse','school','chapel','tradepost','townhall'];
function workforce() {
  const schooled = state.buildings.some(b => !b.ruined && b.buildT >= 1 && b.type === 'school' && b.workers > 0);
  const ratio = schooled ? 0.8 : 0.7;
  return Math.max(0, Math.floor((state.pop - (state.sick || 0)) * ratio));
}
function refreshJobs() {
  let hands = workforce();
  state.employed = 0;
  state.jobsTotal = 0;
  for (const t of JOB_PRIORITY) {
    for (const b of state.buildings) {
      if (b.type !== t || b.ruined || b.buildT < 1) continue;
      b.jobs = JOB_SLOTS[t];
      state.jobsTotal += b.jobs;
      b.workers = Math.min(b.jobs, hands);
      hands -= b.workers;
      state.employed += b.workers;
    }
  }
}
function staffEff(b) {
  if (!JOB_SLOTS[b.type]) return 1;
  return b.jobs ? (b.workers || 0) / b.jobs : 1;
}

// ---------------------------------------------------------------- sickness
// winter fevers thin the workforce; staffed infirmaries and bathhouses resist
function sicknessDaily() {
  if (seasonOf(state.day).nm !== 'Winter') {
    const rec = Math.ceil((state.sick || 0) * 0.5);
    if (rec > 0) { state.sick = Math.max(0, state.sick - rec); }
    return;
  }
  let rate = 0.12;
  const staffed = t => state.buildings.some(b => !b.ruined && b.buildT >= 1 && b.type === t && b.workers > 0);
  if (staffed('infirmary')) rate *= 0.5;
  if (staffed('bathhouse')) rate *= 0.7;
  const fresh = Math.ceil(state.pop * rate * (0.6 + Math.random()*0.8));
  const rec = Math.ceil((state.sick || 0) * 0.35);
  state.sick = Math.max(0, Math.min(Math.floor(state.pop * 0.6), (state.sick || 0) + fresh - rec));
  if (fresh > 2) msg(`Winter fever — ${fresh} folk take to their beds${staffed('infirmary') ? ', the infirmary tends them' : ''}.`, 'warn');
}

// ---------------------------------------------------------------- occasions
// special days derive from the calendar — nothing extra to save
function isFestivalDay(day) { return seasonOf(day).nm === 'Autumn' && ((day - 1) % 3) === 0; }
function isHolyDay(day) { return day % 6 === 0; }
let festGroup = null;
function refreshOccasions(announce) {
  state.festivalBias = isFestivalDay(state.day);
  state.holyBias = isHolyDay(state.day)
    && state.buildings.some(b => !b.ruined && b.buildT >= 1 && b.type === 'chapel');
  if (festGroup) { scene.remove(festGroup); disposeGroup(festGroup); festGroup = null; }
  const keep = state.buildings.find(b => b.type === 'keep' && !b.ruined);
  if (state.festivalBias && keep) {
    // pennant strings from the keep turrets out to poles in the yard
    festGroup = new THREE.Group();
    const cols = [0xc23b2a, 0xd9a44a, 0x4a6a9c, 0x5a7a4a];
    for (let k = 0; k < 4; k++) {
      const a = k * Math.PI/2 + Math.PI/4;
      const ex = Math.sin(a) * 8, ez = Math.cos(a) * 8;
      festGroup.add(cyl(0.05, 0.07, 2.6, MAT.timber, ex, 1.3, ez, 5));
      for (let i = 1; i <= 5; i++) {
        const t = i / 6;
        const x = THREE.MathUtils.lerp(Math.sin(a)*2.6, ex, t);
        const z = THREE.MathUtils.lerp(Math.cos(a)*2.6, ez, t);
        const y = THREE.MathUtils.lerp(5.6, 2.6, t) - Math.sin(t * Math.PI) * 0.5;
        const p = cone(0.14, 0.34, new THREE.MeshLambertMaterial({ color: cols[(k + i) % 4] }), x, y, z, 4);
        p.rotation.x = Math.PI;
        festGroup.add(p);
      }
    }
    festGroup.position.set(keep.x, 0, keep.z);
    scene.add(festGroup);
    if (announce) {
      msg('Harvest festival! The town gathers at the Keep.', 'good');
      AudioSys.play('fanfare');
      teleEv('festival');
    }
  } else if (state.holyBias && announce) {
    msg('The chapel bell rings out — a holy day.', 'dim');
    AudioSys.play('bell');
  }
}

// ---------------------------------------------------------------- edicts
const EDICTS = {
  heavytax: { nm:'Heavy Taxes', desc:'Tax ×1.3, but folk settle half as fast' },
  curfew:   { nm:'Curfew',      desc:'Fire risk halved, but taverns earn nothing' },
  opengates:{ nm:'Open Gates',  desc:'Caravans pay ×1.3, but raids come larger' },
};
function townhallStaffed() {
  return state.buildings.some(b => !b.ruined && b.buildT >= 1 && b.type === 'townhall' && b.workers > 0);
}
function edictOn(key) { return townhallStaffed() && !!(state.edicts || {})[key]; }
function setEdict(key, val) {
  state.edicts = state.edicts || {};
  state.edicts[key] = !!val;
  msg(val ? `Edict proclaimed: ${EDICTS[key].nm}.` : `Edict repealed: ${EDICTS[key].nm}.`, 'dim');
  AudioSys.play('chime');
  saveGame();
}

// population ranks — growth unlocks the deeper toolbox (high-water: never re-locks)
function toolLocked(t) {
  for (let i = state.rankIdx + 1; i < RANKS.length; i++)
    if (RANKS[i].unlocks.includes(t)) return RANKS[i];
  return null;
}
function rankTick() {
  state.maxPop = Math.max(state.maxPop || 0, state.pop);
  let idx = 0;
  for (let i = 0; i < RANKS.length; i++) if (state.maxPop >= RANKS[i].pop) idx = i;
  if (idx > state.rankIdx) {
    state.rankIdx = idx;
    MAT.rankBanner.color.setHex(RANK_BANNER_COLORS[idx]);
    const r = RANKS[idx];
    teleEv('rank_up', r.nm);
    const names = r.unlocks.map(t => BUILD_DEFS[t] ? BUILD_DEFS[t].nm : t).join(', ');
    msg(`The settlement is now a ${r.nm.toUpperCase()}! Unlocked: ${names}.`, 'good');
    // ceremony
    $('ranktoast-main').textContent = `⚜ ${(state.townName || 'THE TOWN').toUpperCase()} IS NOW A ${r.nm.toUpperCase()} ⚜`;
    $('ranktoast-sub').textContent = `unlocked: ${names}`;
    const toast = $('ranktoast');
    toast.classList.remove('show');
    void toast.offsetWidth;   // restart the animation
    toast.classList.add('show');
    AudioSys.play('fanfare');
    // the whole town throws its hands up
    for (const v of state.villagers) v.cheer = 4 + Math.random() * 4;
    refreshPaletteLocks();
    saveGame();
  }
}

// houses in well-planned wards grow into townhouses — density is the reward
function upgradeTick(dt) {
  state.upgCool -= dt;
  const grow = (b, into, note) => {
    state.upgCool = 12;
    scene.remove(b.group);
    disposeGroup(b.group);
    b.type = into;
    b.hp = b.maxHp = BUILD_DEFS[into].hp;
    b.group = buildMesh(into, b.x, b.z);
    b.group.position.set(b.x, 0, b.z);
    b.group.rotation.y += b.rot || 0;
    wireGroup(b, b.group);
    scene.add(b.group);
    b.buildT = 0;
    b.upT = 0;
    dustBurst(b.x, b.z, 2, 10);
    AudioSys.play('thunk');
    teleEv(into);
    msg(note, 'good');
    saveGame();
  };
  for (const b of state.buildings) {
    if (b.ruined || b.onFire || b.buildT < 1 || b.depth < 1) continue;
    if (b.type === 'house') {
      const ready = b._well && b._mkt && state.pop >= popCap() * 0.85;
      if (!ready) { b.upT = 0; continue; }
      b.upT = (b.upT || 0) + dt;
      if (b.upT > 25 && state.upgCool <= 0)
        grow(b, 'townhouse', 'A house grows into a townhouse — twice the folk, twice the rent.');
    } else if (b.type === 'townhouse') {
      // the pinnacle: deep ward, full services, a thriving town
      const ready = b.depth >= 2 && b._well && b._mkt && (b._tav || b._chap) && state.pop >= popCap() * 0.9;
      if (!ready) { b.upT = 0; continue; }
      b.upT = (b.upT || 0) + dt;
      if (b.upT > 30 && state.upgCool <= 0)
        grow(b, 'manor', 'A townhouse becomes a MANOR — the ward has made someone rich.');
    }
  }
}

// weather: occasional rain — quenches fires, waters the fields
function weatherTick(dt) {
  state.weatherT = (state.weatherT ?? 150) - dt;
  if (state.weatherT <= 0) {
    if (state.raining) {
      state.raining = false;
      state.weatherT = 180 + Math.random()*240;
    } else {
      state.raining = true;
      state.weatherT = 45 + Math.random()*50;
      msg(seasonOf(state.day).nm === 'Winter' ? 'Snow drifts over the valley.' : 'Rain sweeps over the valley.', 'dim');
    }
  }
}

// fire — the price of density. Starts only after the charter is fulfilled.
const FLAMMABLE = { hovel:1.3, house:1, townhouse:1.6, manor:1.4, market:1, tavern:1.3,
  mill:1.2, sawmill:1.5, tradepost:1, woodcutter:1.4, barracks:1 };
function igniteBuilding(b) {
  if (b.ruined || b.onFire) return;
  b.onFire = true; b.fireT = 0; b._spread = false;
  teleEv('fire', b.type);
  msg('🔥 Fire has broken out in the ward!', 'warn');
  AudioSys.play('bell');
}
function fireTick(dt) {
  // new fires only start once the charter is fulfilled — but anything already
  // burning is always processed
  state.fireCool -= dt;
  if (objAllDoneAt && state.fireCool <= 0) {
    for (const b of state.buildings) {
      if (b.ruined || b.onFire || b.depth < 1 || !FLAMMABLE[b.type]) continue;
      const perSec = 0.0006 * DIFF[state.difficulty].fire * (edictOn('curfew') ? 0.5 : 1) * FLAMMABLE[b.type] * (b._well ? 0.3 : 1) * (state.raining ? 0.2 : 1);
      if (Math.random() < perSec * dt) {
        igniteBuilding(b);
        state.fireCool = 140 + Math.random()*80;
        break;
      }
    }
  }
  for (const b of state.buildings) {
    if (!b.onFire || b.ruined) continue;
    const welled = b._well, rainy = !!state.raining;
    b.fireT += dt;
    b.burnT = 0.5;   // feeds the flame/smoke particles
    b.hp -= ((welled || rainy) ? 2 : 3.5) * dt;
    if (!b._spread && b.fireT > 8) {
      b._spread = true;
      for (const o of state.buildings) {
        if (o === b || o.ruined || o.onFire || !FLAMMABLE[o.type]) continue;
        if (Math.hypot(o.x-b.x, o.z-b.z) > 7) continue;
        const resist = o._well ? 0.15 : 0.45;
        if (Math.random() < resist) igniteBuilding(o);
      }
      // wooden palisades near the blaze can burn through
      if (!state.raining) {
        for (const w of state.walls) {
          if (w.tier !== 'palisade' || w.breached) continue;
          const close = (w.blockers || []).some(s => distToSeg(b.x, b.z, s.ax, s.az, s.bx, s.bz) < 7);
          if (close && Math.random() < 0.6) breachWall(w, b.x, b.z);
        }
      }
    }
    if (rainy && b.fireT > 5) {
      b.onFire = false;
      msg('The rain quells the flames.', 'good');
    } else if (welled && b.fireT > 7) {
      b.onFire = false;
      msg('The well brigade douses the flames.', 'good');
    } else if (b.hp <= 0) {
      b.onFire = false;
      destroyBuilding(b);
      msg('A building burns to the ground. Wells slow the flames — space is a firebreak.', 'warn');
    }
  }
}

// merchant caravans — gates as arteries of trade
function caravanTick(dt) {
  const markets = state.buildings.filter(b => !b.ruined && b.type === 'market' && b.depth > 0);
  const gatesAll = [];
  for (const w of state.walls) for (const g of (w.gates||[])) { const p = gateWorld(w, g); if (p) gatesAll.push(p); }
  if (markets.length && gatesAll.length && !state.bandits.length && state.caravans.length < 2) {
    state.caravanT -= dt;
    if (state.caravanT <= 0) {
      state.caravanT = 55 + Math.random()*45;
      const e = EDGES[Math.random()*4|0];
      const sx = e.x !== 0 ? e.x*(MAP+16) : (Math.random()-0.5)*120;
      const sz = e.z !== 0 ? e.z*(MAP+16) : (Math.random()-0.5)*120;
      const m = markets[Math.random()*markets.length|0];
      gatesAll.sort((a,b2) => Math.hypot(a.x-m.x,a.z-m.z) - Math.hypot(b2.x-m.x,b2.z-m.z));
      const gate = gatesAll[0];
      const grp = makeCaravan();
      grp.position.set(sx, 0, sz);
      scene.add(grp);
      state.caravans.push({ x:sx, z:sz, speed:4.5, grp, bob:Math.random()*6,
        wps:[{x:gate.x, z:gate.z}, {x:m.x+3.5, z:m.z+3.5}], i:0, phase:'in', tradeT:4,
        exit:{x:sx, z:sz}, gate:{x:gate.x, z:gate.z} });
    }
  }
  for (const c of [...state.caravans]) {
    c.bob += dt*6;
    c.grp.rotation.z = Math.sin(c.bob)*0.02;
    if (state.bandits.length && c.phase !== 'flee') { c.phase = 'flee'; c.speed = 7; c.wps = [c.exit]; c.i = 0; }
    if (c.phase === 'trade') {
      c.tradeT -= dt;
      if (c.tradeT <= 0) {
        let take = 10 + markets.length*4 + Math.min(20, Math.floor(state.pop/3));
        if (state.buildings.some(b => !b.ruined && b.buildT >= 1 && b.type === 'tradepost')) take += 10;
        if (state.walls.some(w => w.gates.some(g => g.tier === 'greatgate' && !g.breach))) take = Math.round(take * 1.25);
        if (edictOn('opengates')) take = Math.round(take * 1.3);
        state.gold += take;
        teleEv('caravan_trade', take);
        AudioSys.play('coin');
        if (Math.random() < 0.4) msg(`A caravan trades at the market — 🪙${take}.`, 'good');
        c.phase = 'out';
        c.wps = [c.gate, c.exit]; c.i = 0;
      }
      continue;
    }
    const wp = c.wps[c.i];
    if (!wp) { scene.remove(c.grp); disposeGroup(c.grp); state.caravans.splice(state.caravans.indexOf(c),1); continue; }
    if (Math.hypot(wp.x-c.x, wp.z-c.z) < 1.6) {
      c.i++;
      if (c.i >= c.wps.length) {
        if (c.phase === 'in') c.phase = 'trade';
        else { scene.remove(c.grp); disposeGroup(c.grp); state.caravans.splice(state.caravans.indexOf(c),1); }
      }
      continue;
    }
    moveToward(c, wp.x, wp.z, dt);
    c._wearT = (c._wearT || 0) - dt;
    if (c._wearT <= 0) { c._wearT = 0.25; stampWear(c.x, c.z, 1.3, 0.06); }
    if (c.phase !== 'in' && (Math.abs(c.x) > MAP+15 || Math.abs(c.z) > MAP+15)) {
      scene.remove(c.grp); disposeGroup(c.grp); state.caravans.splice(state.caravans.indexOf(c),1);
    }
  }
}

let growthT = 0;
function economyTick(dt) {
  const perDay = dt / DAY;
  let tax = 0;
  const markets = state.buildings.filter(b => !b.ruined && b.type === 'market');
  const housesInside = [];
  for (const b of state.buildings) {
    if (b.ruined || b.buildT < 1) continue;   // under construction = not yet working
    if (b.type === 'farm') state.food += BUILD_DEFS.farm.foodPerDay * staffEff(b) * (b._mill ? 1.25 : 1) * seasonOf(state.day).farm * (state.raining ? 1.25 : 1) * perDay;
    else if (b.type === 'orchard') state.food += BUILD_DEFS.orchard.foodPerDay * staffEff(b) * (seasonOf(state.day).nm === 'Winter' ? 0.5 : 1) * perDay;
    else if (b.type === 'woodcutter') state.wood += BUILD_DEFS.woodcutter.woodPerDay * staffEff(b) * (b._saw ? 1.25 : 1) * perDay;
    else if (b.type === 'quarry') state.stone += BUILD_DEFS.quarry.stonePerDay * staffEff(b) * perDay;
    else if (BUILD_DEFS[b.type].popCap) {
      const occupants = BUILD_DEFS[b.type].popCap * Math.min(1, state.pop / Math.max(1, popCap()));
      let rate = b.depth >= 1 ? 2 * (1 + 0.25 * (b.depth - 1)) : 0.8;   // deep wards pay more; outside pays little
      if (b._mkt) rate *= 1.3;
      if (b._well) rate *= 1.15;
      if (b._tav && !edictOn('curfew')) rate *= 1.1;
      if (b._chap) rate *= 1.08;
      if (b._fnt) rate *= 1.05;
      if (b._road) rate *= 1.05;
      if (b._high) rate *= 1.15;
      tax += occupants * rate;
      if (b.depth >= 1) housesInside.push(b);
    }
  }
  state.gold += tax * (edictOn('heavytax') ? 1.3 : 1) * perDay;
  state.food = Math.max(0, state.food - state.pop * 0.5 * perDay);
  // stores are finite — surplus beyond the granaries spoils
  const cap = foodCap();
  if (state.food > cap) {
    state.food = cap;
    state._spoilT = (state._spoilT || 0) - dt;
    if (state._spoilT <= 0) {
      state._spoilT = 45;
      msg('The stores are full — surplus grain spoils. Raise a granary before winter.', 'warn');
    }
  }
  // growth / starvation
  growthT += dt;
  if (growthT >= (edictOn('heavytax') ? 12 : 6)) {
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
  state.raidStats = { kills: 0, lost: 0 };
  const size = Math.max(1, Math.min(14,
    Math.round((2 + Math.floor(state.day/3) + Math.floor(state.raidNum/4)) * DIFF[state.difficulty].raid * (edictOn('opengates') ? 1.2 : 1))));
  const e = state.raidEdge;
  const roster = { raider:0, runner:0, brute:0, torch:0 };
  for (let i=0;i<size;i++){
    const r = Math.random();
    let kind = 'raider';
    if (state.raidNum >= 3 && r < 0.15) kind = 'brute';
    else if (state.raidNum >= 2 && r < 0.35) kind = 'torch';
    else if (r < 0.55) kind = 'runner';
    roster[kind]++;
    const K = RAIDER_KINDS[kind];
    const ox = e.x !== 0 ? e.x * (MAP+18) : (Math.random()-0.5)*140;
    const oz = e.z !== 0 ? e.z * (MAP+18) : (Math.random()-0.5)*140;
    const grp = makeFigure(K.color, 'bandit');
    grp.scale.setScalar(K.scale);
    grp.position.set(ox + (Math.random()-0.5)*6, 0, oz + (Math.random()-0.5)*6);
    if (kind === 'torch') {
      const fl = new THREE.Sprite(new THREE.SpriteMaterial({ map:P_TEX, color:0xff8a2a, transparent:true, opacity:0.9, blending:THREE.AdditiveBlending, depthWrite:false }));
      fl.scale.setScalar(1.1);
      fl.position.set(0.35, 1.5, 0.15);
      grp.add(fl);
    }
    scene.add(grp);
    state.bandits.push({
      x:grp.position.x, z:grp.position.z, kind,
      hp:K.hp, dps:K.dps, speed:K.spMin + Math.random()*(K.spMax-K.spMin),
      target:null, state:'seek', loiter:0, grp, bob:Math.random()*6,
    });
  }
  const notes = [];
  if (roster.brute) notes.push(`${roster.brute} brute${roster.brute>1?'s':''}`);
  if (roster.torch) notes.push(`${roster.torch} torch-bearer${roster.torch>1?'s':''}`);
  msg(`${size} raiders ride in from the ${e.name.toLowerCase()}${notes.length ? ' — with ' + notes.join(' and ') : ''}!`, 'warn');
  teleEv('raid', size);
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
    else if (bd.kind === 'torch' && FLAMMABLE[t.type] && !t.onFire) {
      // torch-bearers set the place alight and run
      igniteBuilding(t);
      teleEv('torched', t.type);
      bd.state = 'flee'; bd.target = null;
    } else {
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
  const spd = a.speed * roadSpeedAt(a.x, a.z);
  let nx = a.x + (tx-a.x)/d * spd * dt;
  let nz = a.z + (tz-a.z)/d * spd * dt;
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
  disposeGroup(bd.grp);
  if (bd.hp <= 0 && state.raidStats) state.raidStats.kills++;
  const i = state.bandits.indexOf(bd);
  if (i >= 0) state.bandits.splice(i, 1);
  if (!state.bandits.length && !state.over) {
    const rs = state.raidStats || { kills:0, lost:0 };
    msg(`Raid over — ${rs.kills} raider${rs.kills===1?'':'s'} slain${rs.lost ? `, ${rs.lost} building${rs.lost===1?'':'s'} burned` : ', nothing lost'}.`, rs.lost ? 'warn' : 'good');
    teleEv('raid_end');
  }
}

function destroyBuilding(b, byBandit=null) {
  b.ruined = true; b.hp = 0;
  cleanupConstruction(b);
  teleEv('destroyed', b.type + (byBandit ? ' (raid)' : ''));
  b.burnT = 0; b.smolderT = 25;
  AudioSys.play('crash');
  for (let i=0;i<6;i++) { flamePuff(b.x, 1.5, b.z); smokePuff(b.x, 2.0, b.z, true); }
  scene.remove(b.group);
  disposeGroup(b.group);
  refreshCoverage();
  b.group = makeRuin(b);
  b.group.traverse(o => { o.userData.b = b; });
  scene.add(b.group);
  if (byBandit) {
    if (state.raidStats) state.raidStats.lost++;
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
    disposeGroup(g.grp);
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
function fireArrow(fx, fy, fz, foe, dmg, big=false) {
  foe.hp -= dmg;
  const m = new THREE.Mesh(arrowGeo, arrowMat);
  if (big) m.scale.set(3, 3, 2.2);
  const from = new THREE.Vector3(fx, fy, fz);
  const to = new THREE.Vector3(foe.x, 1.0, foe.z);
  m.position.copy(from);
  m.lookAt(to);
  scene.add(m);
  state.arrows.push({ m, from, to, t:0 });
  if (foe.hp <= 0) removeBandit(foe);
}
function towerTick(tw, dt) {
  tw.cool = (tw.cool || 0) - dt;
  if (tw.cool > 0 || !state.bandits.length) return;
  const def = BUILD_DEFS[tw.type] || BUILD_DEFS.tower;
  let foe = null, best = def.range;
  for (const bd of state.bandits) {
    const d = Math.hypot(bd.x-tw.x, bd.z-tw.z);
    if (d < best) { best = d; foe = bd; }
  }
  if (!foe) return;
  if (def.boltDmg) {   // ballista: slow, devastating
    tw.cool = def.boltCd;
    fireArrow(tw.x, 4.0, tw.z, foe, def.boltDmg, true);
    AudioSys.play('thunk');
  } else {
    tw.cool = 0.7;
    fireArrow(tw.x, tw.type === 'watchpost' ? 4.2 : 7.2, tw.z, foe, def.dps * 0.7);
  }
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
    const tunic = [0x8c6a3a, 0x5a7a4a, 0x7a5a7a, 0x9c8248, 0x6a4a6a, 0x4a6a7a, 0xa87848, 0x836b52][Math.random()*8|0];
    // folk come in kinds: children run, elders shuffle, monks drift near the chapel
    const kr = Math.random();
    const hasChapel = state.buildings.some(b => !b.ruined && b.type === 'chapel');
    const kind = kr < 0.15 ? 'child' : kr < 0.25 ? 'elder' : (hasChapel && kr < 0.33) ? 'monk' : 'adult';
    const grp = makeFigure(kind === 'monk' ? 0x6a5a48 : tunic, kind === 'monk' ? 'monk' : 'villager');
    grp.scale.setScalar(kind === 'child' ? 0.5 + Math.random()*0.08 : kind === 'elder' ? 0.72 : 0.7 + Math.random()*0.22);
    grp.position.set(h.x+1.5, 0, h.z+1.5);
    scene.add(grp);
    const sack = box(0.34, 0.3, 0.26, new THREE.MeshLambertMaterial({ color:0xa8905e }), 0, 1.0, 0.32);
    sack.visible = false;
    grp.add(sack);
    // winter cloak, hidden until the snow
    const cloak = box(0.46, 0.62, 0.09, new THREE.MeshLambertMaterial({ color:0x4a3828 }), 0, 0.85, -0.21);
    cloak.visible = false;
    grp.add(cloak);
    const trade = kind === 'monk' ? 'monk' : kind === 'child' ? 'child' : FOLK_TRADES[Math.random()*FOLK_TRADES.length|0];
    // trades carry their tools
    const L = grp.userData.limbs;
    if (L && kind === 'adult') {
      if (['shepherd','miller','carter'].includes(trade)) {
        const hoe = cyl(0.03, 0.03, 1.3, MAT.timber, 0, -0.5, 0.1, 5);
        hoe.add(box(0.2, 0.06, 0.1, MAT.stoneD, 0, -0.62, 0.05));
        L.armR.add(hoe);
      } else if (['smith','cooper','fletcher','tanner','mason'].includes(trade)) {
        const ham = cyl(0.03, 0.03, 0.6, MAT.timber, 0, -0.45, 0.1, 5);
        ham.add(box(0.16, 0.1, 0.22, MAT.stoneD, 0, -0.28, 0));
        L.armR.add(ham);
      }
    }
    if (L && kind === 'elder') {
      const cane = cyl(0.025, 0.025, 0.85, MAT.timber, 0, -0.5, 0.12, 5);
      L.armR.add(cane);
    }
    const vv = { x:h.x+1.5, z:h.z+1.5, home:h, tgt:null, kind,
      speed: kind === 'child' ? 2.5 : kind === 'elder' ? 0.95 : kind === 'monk' ? 1.2 : 1.6,
      grp, sack, cloak, bob:Math.random()*6, wait:Math.random()*3,
      vname: FOLK_NAMES[Math.random()*FOLK_NAMES.length|0], trade };
    grp.traverse(o => { o.userData.v = vv; });
    state.villagers.push(vv);
  }
  while (state.villagers.length > want) {
    const v = state.villagers.pop();
    scene.remove(v.grp);
    disposeGroup(v.grp);
  }
  // neighbours who cross paths sometimes stop for a word
  state._chatT = (state._chatT || 0) - dt;
  if (state._chatT <= 0) {
    state._chatT = 1.5;
    for (let i = 0; i < state.villagers.length; i++) {
      const a = state.villagers[i];
      if (a.chat > 0 || (a._chatCd || 0) > 0 || a.kind === 'child') continue;
      for (let j = i + 1; j < state.villagers.length; j++) {
        const b2 = state.villagers[j];
        if (b2.chat > 0 || (b2._chatCd || 0) > 0 || b2.kind === 'child') continue;
        if (Math.hypot(a.x-b2.x, a.z-b2.z) < 1.8 && Math.random() < 0.4) {
          a.chat = b2.chat = 3.5 + Math.random()*3;
          a.chatMate = b2; b2.chatMate = a;
          a.path = b2.path = null;
          break;
        }
      }
    }
  }
  const winterNow = seasonOf(state.day).nm === 'Winter';
  for (const v of state.villagers) {
    if (v.home.ruined) { v.home = homes.length ? homes[0] : v.home; }
    v.bob += dt*8;
    if (v.cloak) v.cloak.visible = winterNow;
    v._chatCd = Math.max(0, (v._chatCd || 0) - dt);
    if (v.cheer) v.cheer = Math.max(0, v.cheer - dt);
    if (v.chat > 0) {
      v.chat -= dt;
      if (v.chatMate) v.grp.rotation.y = Math.atan2(v.chatMate.x - v.x, v.chatMate.z - v.z);
      if (v.chat <= 0) { v._chatCd = 25 + Math.random()*20; v.chatMate = null; v.wait = 0.5; }
      continue;
    }
    if (v.wait > 0) { v.wait -= dt; continue; }
    if (!v.path) {
      // pick an errand: fields, market, the keep — routed through gates.
      // The town keeps hours: lamps out after dark, save the tavern few.
      const dayF = ((state.time / (DAY*3)) + 0.30) % 1;
      const nightNow = dayF > 0.80 || dayF < 0.05;
      let dest = null;
      const pick = (type) => {
        const arr = state.buildings.filter(b => !b.ruined && b.buildT >= 1 && b.type === type);
        return arr.length ? arr[Math.random()*arr.length|0] : null;
      };
      if (v.phase === 'out') dest = v.home;
      else if (nightNow) {
        dest = (v.kind === 'adult' && Math.random() < 0.2) ? (pick('tavern') || v.home) : v.home;
      } else {
        const r = Math.random();
        // the town gathers on special days
        if (state.festivalBias && r < 0.5) dest = state.buildings.find(b => b.type === 'keep');
        else if (state.holyBias && r < 0.4) dest = pick('chapel');
        else if (v.kind === 'monk') dest = r < 0.7 ? pick('chapel') : state.buildings.find(b => b.type === 'keep');
        else if (v.kind === 'child') dest = r < 0.3 ? pick('fountain') || pick('garden') : null;
        else if (r < 0.25) dest = pick('farm');
        else if (r < 0.36) dest = pick('quarry') || pick('woodcutter') || pick('sawmill');
        else if (r < 0.48) dest = pick('market');
        else if (r < 0.57) dest = nightFactor > 0.3 ? pick('tavern') : pick('chapel');
        else if (r < 0.64) dest = pick('fountain') || pick('tavern');
        else if (r < 0.7) dest = state.buildings.find(b => b.type === 'keep');
      }
      if (dest) {
        const dd = BUILD_DEFS[dest.type];
        const oa = Math.random()*Math.PI*2;
        // clear the footprint even on the diagonal, so nobody shoves the walls
        const off = Math.max(dd.w, dd.d)/2 * 1.45 + 1.0 + Math.random()*1.5;
        v.path = findPath(v.x, v.z, dest.x + Math.cos(oa)*off, dest.z + Math.sin(oa)*off);
        if (v.path) {
          v.pathi = 0; v.wpT = 0; v.wpBest = undefined;
          if (dest === v.home) {
            v.phase = 'homeward';
            // haul goods back from the fields and the market
            if (v.sack && (v.destType === 'farm' || v.destType === 'market')) v.sack.visible = true;
          } else {
            v.phase = 'out';
            v.destType = dest.type;
          }
        }
      }
      if (!v.path) {
        // no errand (or sealed ward): wander near home — never to a spot inside a building
        const tx = v.home.x + (Math.random()-0.5)*12, tz = v.home.z + (Math.random()-0.5)*12;
        if (!pointInBuilding(tx, tz) && canWalk(v.x, v.z, tx, tz)) { v.path = [{x:tx, z:tz}]; v.pathi = 0; v.wpT = 0; }
        else v.wait = 1.5;
        if (v.phase === 'homeward') v.phase = 'idle';
      }
      continue;
    }
    const wp = v.path[v.pathi];
    const wd = Math.hypot(wp.x-v.x, wp.z-v.z);
    // abandon only when NOT making progress (blocked by crowd/building) —
    // long honest walks are fine
    if (wd < (v.wpBest ?? Infinity) - 0.4) { v.wpBest = wd; v.wpT = 0; }
    v.wpT = (v.wpT || 0) + dt;
    if (v.wpT > 6) {
      v.path = null; v.wait = 1.5; v.wpBest = undefined;
      if (v.phase === 'homeward') v.phase = 'idle';
      continue;
    }
    if (wd < 0.8) {
      v.pathi++; v.wpT = 0; v.wpBest = undefined;
      if (v.pathi >= v.path.length) {
        v.path = null;
        const dayF2 = ((state.time / (DAY*3)) + 0.30) % 1;
        // home for the night stays home; day errands turn over quickly
        v.wait = (dayF2 > 0.80 || dayF2 < 0.05) ? 8 + Math.random()*8 : 2 + Math.random()*4;
        if (v.phase === 'homeward') {
          v.phase = 'idle';
          v.destType = null;
          if (v.sack) v.sack.visible = false;
        }
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
    if (photoMode) { setPhotoMode(false); return; }
    if ($('almanac').style.display !== 'none') { $('almanac').style.display = 'none'; return; }
    if ($('settings').style.display !== 'none') { $('settings').style.display = 'none'; return; }
    if (isWallTool(tool) && wallDraft.length) { wallDraft = []; startAttach = null; redrawWallPreview(); }
    else if (selB) selectBuilding(null);
    else setTool(null);
  }
  if (e.code === 'Backspace' && isWallTool(tool) && wallDraft.length) {
    e.preventDefault();
    wallDraft.pop();
    if (!wallDraft.length) startAttach = null;
    redrawWallPreview();
  }
  if (e.code === 'Enter' && isWallTool(tool)) tryCloseWall();
  const idx = ['Digit1','Digit2','Digit3','Digit4','Digit5','Digit6','Digit7','Digit8','Digit9'].indexOf(e.code);
  if (idx >= 0) {
    const open = TABS[activeTab].tools.filter(t2 => !toolLocked(t2));
    if (open[idx]) setTool(open[idx]);
  }
  if (e.code === 'Tab' && state.started) {
    e.preventDefault();
    for (let i = 1; i <= TABS.length; i++) {
      const ni = (activeTab + i) % TABS.length;
      if (TABS[ni].tools.some(t2 => !toolLocked(t2))) { activeTab = ni; break; }
    }
    renderPalette();
    AudioSys.play('click');
  }
  if (e.code === 'KeyX') setTool('demolish');
  if (e.code === 'KeyB' && state.started) {
    const alm = $('almanac');
    alm.style.display === 'flex' ? (alm.style.display = 'none') : openAlmanac();
  }
  if (e.code === 'KeyP' && state.started) setPhotoMode(!photoMode);
  if (e.code === 'KeyR' && tool && BUILD_DEFS[tool]) ghostRot = (ghostRot + Math.PI/2) % (Math.PI*2);
  if (e.code === 'Space' && state.started && !state.over && $('settings').style.display === 'none') {
    e.preventDefault();
    setSpeed(0);
  }
});
addEventListener('keyup', e => { keys[e.code] = false; });

let dragBtn = -1, lastMx = 0, lastMy = 0, dragDist = 0;
const touchPts = new Map();   // active pointers on the canvas (for pinch)
let pinchPrev = null;
renderer.domElement.addEventListener('contextmenu', e => e.preventDefault());
renderer.domElement.addEventListener('pointerdown', e => {
  touchPts.set(e.pointerId, { x:e.clientX, y:e.clientY });
  if (touchPts.size >= 2) { dragBtn = -1; dragDist = 99; pinchPrev = null; return; }
  dragBtn = e.button; lastMx = e.clientX; lastMy = e.clientY; dragDist = 0;
});
addEventListener('pointerup', e => {
  touchPts.delete(e.pointerId);
  pinchPrev = null;
  // right-click (no drag) undoes the last wall corner
  if (dragBtn === 2 && dragDist < 6 && isWallTool(tool) && wallDraft.length) {
    wallDraft.pop();
    if (!wallDraft.length) startAttach = null;
    redrawWallPreview();
    dragBtn = -1;
    return;
  }
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
  if (touchPts.has(e.pointerId)) touchPts.set(e.pointerId, { x:e.clientX, y:e.clientY });
  if (touchPts.size === 2) {
    // pinch: zoom by spread, pan by midpoint drift
    const [a, b] = [...touchPts.values()];
    const dist = Math.hypot(a.x-b.x, a.y-b.y);
    const cx = (a.x+b.x)/2, cy = (a.y+b.y)/2;
    if (pinchPrev) {
      camDist *= pinchPrev.dist / Math.max(1, dist);
      const panSpeed = camDist * 0.0016;
      const dx = cx - pinchPrev.cx, dy = cy - pinchPrev.cy;
      camTarget.x -= (dx*Math.cos(camYaw))*panSpeed + (dy*Math.sin(camYaw))*panSpeed;
      camTarget.z -= (-dx*Math.sin(camYaw))*panSpeed + (dy*Math.cos(camYaw))*panSpeed;
    }
    pinchPrev = { dist, cx, cy };
    return;
  }
  if (dragBtn === 0 && isRoadTool(tool) && state.started && !state.over) {
    // drag-paint roads
    ray.setFromCamera(mouse, camera);
    ray.ray.intersectPlane(groundPlane, mouseGround);
    paintRoadAt(mouseGround.x, mouseGround.z);
  }
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
  if (isWallTool(tool)) {
    wallClickAt(mouseGround.x, mouseGround.z);
    return;
  }
  if (isRoadTool(tool)) {
    paintRoadAt(mouseGround.x, mouseGround.z);
    saveGame();
    return;
  }
  if (isGateTool(tool)) {
    gateClickAt(mouseGround.x, mouseGround.z);
    return;
  }
  if (tool === 'hoardings') {
    const sp = wallSnap(mouseGround.x, mouseGround.z);
    if (!sp) { msg('Click a wall to raise hoardings on it.', 'warn'); return; }
    raiseHoardings(sp.wall);
    return;
  }
  if (tool === 'demolish') {
    const b = pickBuilding();
    if (b) { demolish(b); saveGame(); return; }
    const sp = wallSnap(mouseGround.x, mouseGround.z);
    if (sp) {
      const salvage = Math.floor(wallStoneValue(sp.wall) * 0.25);
      if (confirm(`Tear down this entire wall? 🪨${salvage} of the stone will be salvaged.`)) {
        removeWall(sp.wall);
        msg(`The wall comes down — 🪨${salvage} salvaged.`, 'dim');
        AudioSys.play('crash');
        saveGame();
      }
    }
    return;
  }
  if (tool && BUILD_DEFS[tool]) {
    const x = snap(mouseGround.x), z = snap(mouseGround.z);
    const chk = placementCheck(tool, x, z);
    if (!chk.ok) { msg(chk.why, 'warn'); return; }
    const b = placeBuilding(tool, x, z, false, ghostRot);
    if (b) {
      if (b.type === 'keep') msg('The Keep rises. Now: walls first (Wall — 1).', 'good');
      else if (b.depth === 0 && b.type !== 'farm' && b.type !== 'woodcutter' && b.type !== 'quarry')
        msg(`${BUILD_DEFS[b.type].nm} built OUTSIDE the walls — raiders can reach it.`, 'warn');
      saveGame();
      if (!keys.ShiftLeft && !keys.ShiftRight) setTool(null);
    }
    return;
  }
  // no tool: tap/click a building to pin its ledger card
  selectBuilding(pickBuilding() || null);
}
function pickBuilding() {
  ray.setFromCamera(mouse, camera);
  const hits = ray.intersectObjects(state.buildings.map(b => b.group), true);
  return hits.length ? hits[0].object.userData.b : null;
}

// ---------------------------------------------------------------- game over / restart
function gameOver() {
  state.over = true;
  teleEv('game_over');
  $('go-stats').textContent = `${state.townName || 'Your town'} stood for ${state.day} days · population ${fmt(state.pop)} · ${state.walls.length} wall${state.walls.length===1?'':'s'}.`;
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
      v: 3,
      gold:state.gold, wood:state.wood, stone:state.stone, food:state.food,
      townName:state.townName, seed:state.seed, regionNm:state.regionNm,
      difficulty:state.difficulty, roads:state.roads,
      pop:state.pop, maxPop:state.maxPop, rankIdx:state.rankIdx, time:state.time, raidNum:state.raidNum,
      sick:state.sick||0, edicts:state.edicts||{},
      buildings: state.buildings.map(b => ({ type:b.type, x:b.x, z:b.z, rot:b.rot||0, hp:b.hp, ruined:b.ruined, day:b.day||1 })),
      walls: state.walls.map(w => ({ poly:w.poly, path:w.path, closed:w.closed,
        tier:w.tier||'wall', breached:!!w.breached, hoardings:!!w.hoardings,
        gates: w.gates.map(g => ({ seg:g.seg, t:g.t, tier:g.tier, breach:!!g.breach })) })),
    }));
  } catch (e) {}
}
function loadGame() {
  let s = null;
  try { s = JSON.parse(localStorage.getItem('bulwark-save')); } catch (e) {}
  if (!s) return false;
  Object.assign(state, { gold:s.gold, wood:s.wood, stone:s.stone, food:s.food, pop:s.pop, time:s.time, raidNum:s.raidNum||0 });
  state.day = Math.floor(s.time / DAY) + 1;
  state.seed = s.seed || REGIONS[0].seed;
  state.regionNm = s.regionNm || REGIONS[0].nm;
  state.difficulty = DIFF[s.difficulty] ? s.difficulty : 'standard';
  state.sick = s.sick || 0;
  state.edicts = s.edicts || {};
  scatterWorld(state.seed);
  state.roads = (s.roads || []).map(r2 => r2.length === 2 ? [r2[0], r2[1], 'road'] : r2);
  roadSet.clear();
  for (const [gx, gz, tk] of state.roads) { roadSet.set(`${gx},${gz}`, tk); stampRoadCell(gx, gz, tk); }
  // rank: stored high-water mark, grandfathering legacy saves by what they built
  let mp = s.maxPop ?? s.pop;
  for (const b of s.buildings) {
    if (b.type === 'well' || b.type === 'quarry' || b.type === 'granary') mp = Math.max(mp, 12);
    if (b.type === 'market' || b.type === 'tower' || b.type === 'townhouse') mp = Math.max(mp, 20);
    if (b.type === 'barracks') mp = Math.max(mp, 32);
  }
  state.maxPop = mp;
  state.rankIdx = 0;
  for (let i = 0; i < RANKS.length; i++) if (mp >= RANKS[i].pop) state.rankIdx = i;
  MAT.rankBanner.color.setHex(RANK_BANNER_COLORS[state.rankIdx]);
  state.townName = s.townName || '';
  refreshPaletteLocks();
  refreshCoverage();
  for (const w of s.walls) {
    const path = w.path || w.verts, poly = w.poly || w.verts;   // legacy saves used {verts}
    const closed = w.closed !== undefined ? w.closed : true;
    const tierKey = WALL_TIERS[w.tier] ? w.tier : 'wall';
    const { group, gates, blockers, gatePts } = buildWallMeshes(path, closed, w.gates || null, tierKey, !!w.hoardings);
    scene.add(group);
    state.walls.push({ poly, path, closed, tier: tierKey, breached: !!w.breached, hoardings: !!w.hoardings, group, gates, blockers, gatePts });
  }
  for (const b of s.buildings) {
    const nb = placeBuilding(b.type, b.x, b.z, true, b.rot || 0);
    nb.hp = b.hp;
    nb.day = b.day || state.day;
    if (b.ruined) destroyBuilding(nb);
  }
  refreshDepths();
  return true;
}

function newTownSetup(diff = 'standard') {
  state.difficulty = DIFF[diff] ? diff : 'standard';
  const rm = DIFF[state.difficulty].res;
  state.gold = Math.round(100 * rm);
  state.wood = Math.round(120 * rm);
  state.stone = Math.round(155 * rm);
  state.food = Math.round(60 * rm);
  state.townName = TOWN_PRE[Math.random()*TOWN_PRE.length|0] + TOWN_SUF[Math.random()*TOWN_SUF.length|0];
  const region = REGIONS[Math.random()*REGIONS.length|0];
  state.seed = region.seed;
  state.regionNm = region.nm;
  scatterWorld(region.seed);
  for (const c of [...state.wild]) removeWild(c);   // the old land's animals go with it
  state.roads = [];
  roadSet.clear();
  msg(`${state.townName}, in ${state.regionNm}. First: choose ground and raise your Keep.`, 'good');
  setTool('keep');
  updateObjectives(true);
}

// ---------------------------------------------------------------- main loop
function step(dt) {
  if (!state.started || state.over) return;
  state.time += dt;
  const newDay = Math.floor(state.time / DAY) + 1;
  if (newDay !== state.day) {
    const prevSeason = seasonOf(state.day).nm;
    state.day = newDay;
    const s = seasonOf(state.day).nm;
    if (s !== prevSeason) {
      teleEv('season', s);
      msg(`${SEASON_MSGS[s]}`, s === 'Winter' ? 'warn' : 'dim');
      if (s === 'Winter' && state.food < state.pop * 1.5) msg('The stores look thin for winter.', 'warn');
    }
    sicknessDaily();
    // buildings that have stood six days gather moss
    for (const b of state.buildings)
      if (!b._mossed && !b.ruined && b.buildT >= 1 && state.day - (b.day || 1) >= 6) mossify(b);
    refreshOccasions(true);
    saveGame();
  }
  // pop and sickness drift between building changes — re-deal jobs and coverage each second
  state._jobT = (state._jobT || 0) - dt;
  if (state._jobT <= 0) { state._jobT = 1; refreshCoverage(); }
  economyTick(dt);
  // raiders only muster once there are walls worth plundering — never on Peaceful
  if (state.walls.length && DIFF[state.difficulty].raid > 0) {
    state.raidTimer -= dt;
    if (state.raidTimer <= 0) spawnRaid();
  }
  for (const bd of [...state.bandits]) banditTick(bd, dt);
  for (const g of [...state.guards]) guardTick(g, dt);
  for (const b of state.buildings) {
    if (b.ruined) continue;
    if (b.buildT < 1) {
      b.buildT = Math.min(1, b.buildT + dt / BUILD_TIME);
      if (b.buildT >= 1) finishConstruction(b);
      continue;   // nothing works until it's built
    }
    if (b.type === 'tower' || b.type === 'watchpost' || b.type === 'ballista') towerTick(b, dt);
    if (b.type === 'stakes' && state.bandits.length) {
      const dead = [];
      for (const bd of state.bandits) {
        if (Math.hypot(bd.x-b.x, bd.z-b.z) < 2.8) {
          bd.hp -= BUILD_DEFS.stakes.stakeDps * dt;
          b.hp -= 2.5 * dt;
          if (bd.hp <= 0) dead.push(bd);
        }
      }
      dead.forEach(removeBandit);
      if (b.hp <= 0) destroyBuilding(b);
    }
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
  upgradeTick(dt);
  weatherTick(dt);
  fireTick(dt);
  caravanTick(dt);
  rankTick();
  // walk-cycle pass: reads the _moved flags the ticks above just set
  const figures = [...state.bandits, ...state.guards, ...state.villagers];
  for (const w of state.walls) if (w.sentries) figures.push(...w.sentries);
  for (const a of figures) {
    animateFigure(a, dt);
    // field hands swing their tools while working at the farm
    if (a.path === null && a.phase === 'out' && a.wait > 0 && a.destType === 'farm') {
      const L = a.grp.userData.limbs;
      if (L) { L.armR.rotation.x = -0.6 + Math.sin(a.bob * 1.4) * 0.8; a._moved = false; }
    }
    // pick-swings at the quarry, axe-chops at the woodcutter, saw strokes at the mill
    if (a.path === null && a.phase === 'out' && a.wait > 0 &&
        (a.destType === 'quarry' || a.destType === 'woodcutter' || a.destType === 'sawmill')) {
      const L = a.grp.userData.limbs;
      if (L) {
        if (a.destType === 'sawmill') L.armR.rotation.x = -0.4 + Math.sin(a.bob * 2.2) * 0.45;
        else L.armR.rotation.x = -1.0 + Math.abs(Math.sin(a.bob * 1.5)) * 1.2;
        a._moved = false;
      }
      // chips fly on the downstroke
      if (Math.random() < 0.015)
        spawnP(a.x + (Math.random()-0.5)*0.6, 0.9, a.z + (Math.random()-0.5)*0.6,
          { color: a.destType === 'quarry' ? 0x9a968c : 0xa8814e, life:0.5, vy:1.6, grow:0.1, scale:0.22, opacity:0.8 });
    }
    // talkers talk with their hands
    if (a.chat > 0) {
      const L = a.grp.userData.limbs;
      if (L) { L.armR.rotation.x = -0.3 + Math.sin(a.bob * 0.7) * 0.35; a._moved = false; }
    }
    // and the whole town cheers a new charter
    if (a.cheer > 0) {
      const L = a.grp.userData.limbs;
      if (L) {
        L.armR.rotation.x = Math.PI * 0.85 + Math.sin(a.bob * 1.3) * 0.35;
        L.armL.rotation.x = Math.PI * 0.85 + Math.sin(a.bob * 1.3 + 1.2) * 0.35;
      }
    }
    if (a._moved && !a.baseY) {   // sentries walk the parapet, no ground wear
      a._wearT = (a._wearT || 0) - dt;
      if (a._wearT <= 0) { a._wearT = 0.3; stampWear(a.x, a.z, 0.7, 0.04); }
    }
    a._moved = false;
  }
  critterTick(dt);
  wildTick(dt);
  objT += dt;
  if (objT >= 0.5) { objT = 0; updateObjectives(); }
  teleSample(dt);
}

const _smokeV = new THREE.Vector3();
let camGlide = null;   // minimap jumps ease in rather than teleport
function frame(dt) {
  // camera glide toward a minimap destination (any manual pan cancels it)
  if (camGlide) {
    const k = Math.min(1, dt * 5);
    camTarget.x += (camGlide.x - camTarget.x) * k;
    camTarget.z += (camGlide.z - camTarget.z) * k;
    if (Math.hypot(camGlide.x - camTarget.x, camGlide.z - camTarget.z) < 0.5) camGlide = null;
    if (keys.KeyW || keys.KeyA || keys.KeyS || keys.KeyD || keys.ArrowUp || keys.ArrowDown || keys.ArrowLeft || keys.ArrowRight) camGlide = null;
  }
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
  if (isWallTool(tool)) {
    redrawWallPreview();
    if (wallDraft.length) {
      hintEl.style.display = 'block';
      hintEl.style.left = (mousePx.x + 16) + 'px';
      hintEl.style.top = (mousePx.y + 12) + 'px';
      const cost = wallDraftCost();
      const afford = state[WALL_TIERS[activeWallTier()].res] >= cost;
      let enclose = '';
      if (!startAttach && wallDraft.length >= 3) {
        const area = Math.abs(shoelace(wallDraft));
        const n = state.buildings.filter(b => !b.ruined && pointInPoly(b.x, b.z, wallDraft)).length;
        enclose = `\nencloses ~${Math.round(area)} u² · <span class="safe">${n} building${n===1?'':'s'} inside</span>`;
      }
      const lastP = wallDraft[wallDraft.length-1];
      const segLen = Math.round(Math.hypot(mouseGround.x-lastP.x, mouseGround.z-lastP.z));
      const wt = WALL_TIERS[activeWallTier()];
      hintEl.innerHTML = `${wt.nm} ${startAttach ? '' : 'ring '}cost: <span class="${afford?'safe':'unsafe'}">${cost} ${wt.res}</span> · seg ${segLen}u` +
        `\n${wallDraft.length} corner${wallDraft.length===1?'':'s'} — ` +
        (startAttach ? 'end on the same wall to enclose a ward'
          : (wallDraft.length >= 3 ? 'click the first post or press Enter to close' : 'click to add corners')) +
        enclose + '\nright-click or Backspace undoes a corner';
    } else hintEl.style.display = 'none';
  } else if (isGateTool(tool)) {
    const sp = wallSnap(mouseGround.x, mouseGround.z);
    hintEl.style.display = 'block';
    hintEl.style.left = (mousePx.x + 16) + 'px';
    hintEl.style.top = (mousePx.y + 12) + 'px';
    const gt = GATE_TIERS[tool] || GATE_TIERS.gate;
    hintEl.innerHTML = sp
      ? (sp.wall.breached
          ? `<span class="unsafe">breached wall — use a wall tool to repair it</span>`
          : `<span class="safe">Cut a ${gt.nm.toLowerCase()} here — ${gt.cost} ${gt.res}</span>`)
      : `Click a wall to cut a ${gt.nm.toLowerCase()} (${gt.cost} ${gt.res})`;
  } else if (ghost && tool) {
    const x = snap(mouseGround.x), z = snap(mouseGround.z);
    ghost.position.set(x, 0, z);
    ghost.rotation.y = ghostRot;
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
    hintEl.innerHTML = (chk.ok ? safety : `<span class="unsafe">✖ ${chk.why}</span>`) + '\nR rotates';
  } else if (state.started && !state.over) {
    // no tool: hover a building for its ledger entry (throttled raycast)
    hoverT -= dt;
    if (hoverT <= 0) {
      hoverT = 0.12;
      hoverB = pickBuilding();
      hoverV = null;
      if (!hoverB && state.villagers.length) {
        ray.setFromCamera(mouse, camera);
        const hits = ray.intersectObjects(state.villagers.map(v => v.grp), true);
        hoverV = hits.length ? hits[0].object.userData.v : null;
      }
    }
    const b = hoverB;
    if (!b && hoverV) {
      hintEl.style.display = 'block';
      hintEl.style.left = (mousePx.x + 16) + 'px';
      hintEl.style.top = (mousePx.y + 12) + 'px';
      hintEl.innerHTML = hoverV.trade === 'child' ? `${hoverV.vname}, a child` :
        hoverV.trade === 'monk' ? `Brother ${hoverV.vname}` : `${hoverV.vname} the ${hoverV.trade}`;
    } else if (b && b !== selB) {
      hintEl.style.display = 'block';
      hintEl.style.left = (mousePx.x + 16) + 'px';
      hintEl.style.top = (mousePx.y + 12) + 'px';
      hintEl.innerHTML = buildingInfoHTML(b);
    } else hintEl.style.display = 'none';
  } else hintEl.style.display = 'none';

  // selection card stays live while the town changes around it
  if (selB) {
    cardT -= dt;
    if (cardT <= 0) {
      cardT = 0.5;
      if (!state.buildings.includes(selB)) selectBuilding(null);
      else $('bcard-body').innerHTML = buildingInfoHTML(selB).replace(/\n/g, '<br>');
    }
  }

  // visual pass: atmosphere, particles, build-in scaling, fire & smoke
  if (!state.started) camYaw += dt * 0.05;   // slow orbit behind the title screen
  updateAtmosphere();
  seasonVisualTick(dt);
  rainVisualTick(dt);
  ambientTick(dt);
  AudioSys.update(dt, nightFactor, rainFactor);
  updateParticles(dt);
  // lake ripple
  {
    const p = lakeWater.geometry.attributes.position;
    for (let i=1;i<p.count;i++) p.setZ(i, Math.sin(state.time*1.3 + i*0.85) * 0.09);
    p.needsUpdate = true;
  }
  // fire light follows the nearest blaze
  {
    let burning = null;
    for (const b of state.buildings) if (b.onFire || b.smolderT > 15) { burning = b; break; }
    if (burning) {
      fireLight.position.set(burning.x, 3.2, burning.z);
      fireLight.intensity = 35 + Math.sin(state.time*29)*10 + Math.sin(state.time*67)*6;
    } else fireLight.intensity = 0;
  }
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
  // the wind comes in gusts — every flag, cloth and vane feels the same breeze
  const gust = 0.55 + 0.45 * Math.sin(state.time*0.41) * Math.sin(state.time*0.13 + 2.0);
  const windDir = state.time * 0.02;
  for (const b of state.buildings) {
    if (b.buildT < 1) {
      const e = 1 - Math.pow(1 - b.buildT, 3);
      b.group.scale.set(0.3+0.7*e, 0.15+0.85*e, 0.3+0.7*e);
      if (b._crew) for (const w of b._crew) {   // hammering
        w.bob += dt * 10;
        const L = w.grp.userData.limbs;
        if (L) L.armR.rotation.x = -0.5 + Math.sin(w.bob) * 0.9;
        w.grp.position.y = Math.abs(Math.sin(w.bob * 0.5)) * 0.05;
      }
    }
    if (b._flags && !b.ruined) {
      for (const f of b._flags) f.rotation.x = Math.sin(state.time*2.3 + b.x*0.7) * 0.12 * (0.5 + gust);
    }
    if (b._blades && !b.ruined && b.buildT >= 1) b._blades.rotation.z += dt * (0.5 + gust) * 1.1;
    // laundry and shop signs swing in the breeze
    if (b._sway && !b.ruined) {
      for (const s2 of b._sway)
        s2.rotation.x = Math.sin(state.time*1.8 + (s2.userData.sway || 0)) * 0.16 * (0.5 + gust) * (state.raining ? 1.8 : 1);
    }
    // weather vanes swing to the wind
    if (b._vanes && !b.ruined) {
      for (const v2 of b._vanes) v2.rotation.y = windDir + Math.sin(state.time*0.9 + b.z*0.3) * 0.3 * gust;
    }
    // hearth smoke curls from lived-in homes (heavier in winter)
    if (b._chims && b._chims.length && !b.ruined && b.buildT >= 1 && !b.onFire && state.pop > 0 && state.started) {
      b._chT = (b._chT === undefined ? Math.random()*2 : b._chT) - dt;
      if (b._chT <= 0) {
        b._chT = seasonOf(state.day).nm === 'Winter' ? 0.7 : 1.4 + Math.random();
        const ch = b._chims[(Math.random()*b._chims.length)|0];
        ch.getWorldPosition(_smokeV);
        spawnP(_smokeV.x, _smokeV.y + 0.55, _smokeV.z,
          { color:0xb9b2a4, life:2.6 + Math.random(), vy:0.75, grow:0.85, scale:0.45, opacity:0.26 });
      }
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

  // minimap (2Hz)
  mapT -= dt;
  if (state.started && mapT <= 0) { mapT = 0.5; drawMinimap(); }

  // upload accumulated path wear at most twice a second
  wearUp -= dt;
  if (wearDirty && wearUp <= 0) { wearUp = 0.5; wearTex.needsUpdate = true; wearDirty = false; }

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
let autosaveT = 0, hoverT = 0, hoverB = null, hoverV = null, mapT = 0, cardT = 0;

// ---------------------------------------------------------------- minimap
const MMAP_W = 150, MMAP_EXT = MAP + 20;
const mmapEl = document.getElementById('minimap');
const mmapCtx = mmapEl.getContext('2d');
const MM_COLORS = { keep:'#d9a44a', house:'#c9b184', townhouse:'#e0c088', market:'#a05050',
  well:'#6a9ab8', farm:'#8a9a4a', woodcutter:'#7a5c38', quarry:'#8a8a84', tower:'#b0b8c0', barracks:'#7a8598' };
const mm = v => (v + MMAP_EXT) / (MMAP_EXT*2) * MMAP_W;
function drawMinimap() {
  mmapEl.style.display = 'block';
  const g = mmapCtx;
  g.clearRect(0, 0, MMAP_W, MMAP_W);
  // walls
  g.strokeStyle = '#b8b2a4'; g.lineWidth = 1.4;
  for (const w of state.walls) {
    g.beginPath();
    w.path.forEach((p, i) => { i ? g.lineTo(mm(p.x), mm(p.z)) : g.moveTo(mm(p.x), mm(p.z)); });
    if (w.closed) g.closePath();
    g.stroke();
  }
  // buildings
  for (const b of state.buildings) {
    g.fillStyle = b.ruined ? '#3a352e' : (b.onFire ? '#ff7030' : (MM_COLORS[b.type] || '#999'));
    const s = b.type === 'keep' ? 5 : 3;
    g.fillRect(mm(b.x)-s/2, mm(b.z)-s/2, s, s);
  }
  // caravans + raiders
  g.fillStyle = '#e8dcc2';
  for (const c of state.caravans) g.fillRect(mm(c.x)-1.5, mm(c.z)-1.5, 3, 3);
  g.fillStyle = '#ff4030';
  for (const bd of state.bandits) { g.beginPath(); g.arc(mm(bd.x), mm(bd.z), 2, 0, Math.PI*2); g.fill(); }
  // camera target
  g.strokeStyle = '#d9a44a'; g.lineWidth = 1;
  g.strokeRect(mm(camTarget.x)-4, mm(camTarget.z)-4, 8, 8);
}
mmapEl.addEventListener('pointerdown', e => {
  const r = mmapEl.getBoundingClientRect();
  // glide there rather than teleporting — frame() eases toward camGlide
  camGlide = {
    x: Math.max(-MAP, Math.min(MAP, ((e.clientX - r.left) / r.width) * MMAP_EXT*2 - MMAP_EXT)),
    z: Math.max(-MAP, Math.min(MAP, ((e.clientY - r.top) / r.height) * MMAP_EXT*2 - MMAP_EXT)),
  };
  e.stopPropagation();
});
// consume ALL elapsed real time in fixed substeps so throttled RAF (hidden or
// occluded tab) never slows the simulation — clamped to 1s to avoid spirals
let gameSpeed = 1, gamePaused = false;
function setSpeed(n) {
  if (n === 0) gamePaused = !gamePaused;
  else { gameSpeed = n; gamePaused = false; }
  document.querySelectorAll('#speedctl button').forEach(b => {
    const v = +b.dataset.spd;
    b.classList.toggle('on', v === 0 ? gamePaused : (!gamePaused && v === gameSpeed));
  });
  AudioSys.play('click');
}
document.querySelectorAll('#speedctl button').forEach(b => { b.onclick = () => setSpeed(+b.dataset.spd); });
function advance(now) {
  const rawDt = Math.min(1.0, (now - last) / 1000);
  let elapsed = rawDt * (gamePaused ? 0 : gameSpeed);
  last = now;
  if (state.started && !state.over) tele.speedSecs[gamePaused ? 'paused' : gameSpeed] += rawDt;
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
// music is now real published tracks (Kevin MacLeod, CC BY 3.0) — modest default
const settings = Object.assign({ music:45, sfx:80, amb:60, shadows:true },
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
  // export/import: towns as files
  const io = document.createElement('div');
  io.className = 'slotrow';
  io.innerHTML = `<span class="snm">File</span><span class="smeta">share or back up this town</span>`;
  const ex = document.createElement('button');
  ex.textContent = 'EXPORT';
  ex.onclick = () => {
    if (state.started && !state.over) saveGame();
    const data = localStorage.getItem('bulwark-save');
    if (!data) { msg('Nothing to export yet.', 'warn'); return; }
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([data], { type:'application/json' }));
    a.download = `bulwark-${(state.townName || 'town').toLowerCase()}-day${state.day}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  };
  const im = document.createElement('button');
  im.textContent = 'IMPORT';
  im.onclick = () => $('importFile').click();
  io.appendChild(ex);
  io.appendChild(im);
  el.appendChild(io);
}
$('importFile').addEventListener('change', e => {
  const f = e.target.files[0];
  if (!f) return;
  const rd = new FileReader();
  rd.onload = () => {
    try {
      const s = JSON.parse(rd.result);
      if (!s.buildings || !s.walls) throw new Error('not a town');
      localStorage.setItem('bulwark-save', rd.result);
      localStorage.setItem('bulwark-boot-slot', 'bulwark-save');
      location.reload();
    } catch (err) { msg('That file is not a BULWARK town.', 'warn'); }
  };
  rd.readAsText(f);
  e.target.value = '';
});
// photo mode: hide every scrap of chrome, keep the town
let photoMode = false;
function setPhotoMode(on) {
  photoMode = on;
  for (const id of ['topbar','palette','log','objectives','minimap','bcard','hint',
    'newtown','gearbtn','bookbtn','raidarrow','ranktoast','vignette']) {
    const el = document.getElementById(id);
    if (el) el.style.visibility = on ? 'hidden' : '';
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
$('teleCopy').onclick = async () => {
  const report = buildTeleReport();
  try {
    await navigator.clipboard.writeText(report);
    msg('Playtest report copied — paste it to Claude.', 'good');
  } catch (e) {
    console.log(report);
    msg('Clipboard blocked — report printed to the console instead.', 'warn');
  }
  $('settings').style.display = 'none';
};
$('gearbtn').onclick = openSettings;
$('titleSettings').onclick = openSettings;
applySettings(false);

// ---------------------------------------------------------------- the Almanac
// every tool explained in one honest line, auto-built from the defs
const ALM_DESC = {
  palisade:'A timber ring — cheap and quick, but fire breaches it. Anything it encloses becomes a ward.',
  wall:'Dressed stone. Does not burn. The bones of a lasting town.',
  highwall:'Tall stone. Homes inside pay ×1.15 tax for the prestige.',
  woodgate:'A door in the wall. Villagers pull the lever to pass; raiders cannot.',
  gate:'An iron portcullis — opens twice as fast as wood.',
  greatgate:'A ceremonial gate. Caravans that enter by it pay ×1.25.',
  dirtroad:'Trodden earth. Folk walk ×1.2 along it.',
  road:'Cobblestones. ×1.35 walking speed.',
  flagroad:'Flagstones. ×1.5 speed — homes fronting them gain prestige.',
  moat:'Dug water. Everything wades at half pace — dig it in a raider’s path.',
  hoardings:'Timber galleries on a wall. Its sentries shoot raiders below.',
  hovel:'The humblest roof — 2 folk. No services needed.',
  house:'A family home — 4 folk. With a well and market nearby it grows into a townhouse.',
  townhouse:'A grown house — 8 folk. In a deep ward with full services it becomes a manor.',
  manor:'The pinnacle — 12 folk and handsome taxes. Only wards this rich grow one.',
  well:'Waters homes within its reach (tax ×1.15) — and the bucket line fights fires.',
  granary:'Stores 180 food. Without stores, winter eats the town.',
  greatstore:'A stone warehouse — 400 food.',
  market:'Stalls and trade — covered homes pay ×1.3 tax. Needs 2 traders.',
  tavern:'Ale and news — covered homes pay ×1.1. Earns nothing under Curfew.',
  chapel:'Bells and quiet — covered homes pay ×1.08, and folk take heart.',
  farm:'12 food a day at full strength. Follows the seasons; a mill nearby adds ×1.25.',
  orchard:'6 food a day, and half that in winter. Prettier than a field.',
  mill:'Boosts every farm within its aura ×1.25.',
  woodcutter:'8 wood a day. Must stand near living trees.',
  sawmill:'Boosts every woodcutter within its aura ×1.25.',
  quarry:'8 stone a day. Must stand near bare rock.',
  tradepost:'Caravans pay extra at its yard — but it must stand outside the walls.',
  stakes:'Sharpened stakes. Raiders that cross them bleed; the stakes wear out.',
  watchpost:'A lookout with a bow. Short reach, cheap.',
  tower:'A proper arrow tower — long reach, steady loosing.',
  ballista:'A siege engine turned to defense. Slow, but one bolt fells most raiders.',
  barracks:'Musters 3 guards who patrol and fight. Fallen guards are replaced in time.',
  beacon:'A watch-fire on a mast. Raid warnings come at 75s instead of 45s.',
  infirmary:'Tends the sick. Winter fevers strike half as often within its care.',
  bathhouse:'Clean water and steam — fevers ×0.7 nearby.',
  school:'A lettered town works smarter: workforce rises from 70% to 80% of the folk.',
  townhall:'Seat of the council. A staffed hall may proclaim EDICTS — town-wide laws with a price.',
  garden:'A green square. Purely for the eye.',
  fountain:'Carved stone and water — covered homes pay ×1.05.',
  bannerpole:'The town’s colours, flying.',
  statue:'A founder in stone. Prestige for the plaza.',
  keep:'The heart of the town. If the Keep falls, everything falls.',
  demolish:'Tear a structure down for half its cost back.',
};
const ALM_TERMS = [
  ['Ward','Land enclosed by an unbroken wall ring. Homes in a ward pay full tax; nest rings inside rings and each depth pays ×1.25 more. Outside the walls, homes cannot stand at all.'],
  ['Breach','Fire eats palisades. A breached ring shelters no one until it is mended — click the gap with a wall tool (25 wood).'],
  ['Workforce','About 70% of well folk can work (80% with a staffed school). Jobs fill by priority — farms first, town hall last. Understaffed buildings run proportionally slower; unstaffed services do nothing at all.'],
  ['Sickness','Winter fevers send folk to bed, shrinking the workforce. A staffed infirmary halves the rate; a bathhouse cuts it further. The sick recover as the seasons warm.'],
  ['Coverage','Wells, markets, taverns and the like serve a radius — and only while someone staffs them. Hover any home to see what reaches it.'],
  ['Seasons','Three days each. Autumn harvests swell ×1.6; in winter the fields sleep and the town lives on its stores. Fill the granaries before the snow.'],
  ['Raids','Once you raise walls, raiders come — runners are fast, brutes batter walls, torch-bearers set fires. A beacon lengthens the warning; guards, towers and moats answer it.'],
  ['Edicts','Laws proclaimed from a staffed Town Hall. Heavy Taxes, Curfew, Open Gates — each pays one way and costs another. Repeal them any time.'],
  ['Caravans','Merchants arrive by road to buy your surplus. A trade post and a Great Gate both raise the take; Open Gates raises it further but emboldens raiders.'],
  ['Prestige','High walls and flagstone frontage make an address worth more — richer homes pay richer taxes.'],
  ['Rank','The town’s title — Hamlet, Village, Town, City — follows its highest population ever reached, and each rank unlocks new tools. See THE LADDER.'],
  ['Days of note','Every sixth day the chapel bell rings a holy day and folk walk to prayer. The first day of autumn is the HARVEST FESTIVAL — pennants fly and the town gathers at the Keep. Press P to hide the panels and watch.'],
];
let almTab = 'build';
function renderAlmanac() {
  const body = $('alm-body');
  document.querySelectorAll('.almtab').forEach(el => el.classList.toggle('on', el.dataset.alm === almTab));
  if (almTab === 'build') {
    const seen = new Set();
    let html = '';
    const row = t => {
      if (seen.has(t)) return;
      seen.add(t);
      const lockRank = toolLocked(t);
      const icon = iconSVG(ICONALIAS[t] || t, 26);
      const stats = [];
      if (BUILD_DEFS[t] || WALL_TIERS[t] || GATE_TIERS[t] || ROAD_TIERS[t] || t === 'hoardings') stats.push(toolCostStr(t));
      if (BUILD_DEFS[t] && BUILD_DEFS[t].popCap) stats.push(`${BUILD_DEFS[t].popCap} folk`);
      if (JOB_SLOTS[t]) stats.push(`⚒ ${JOB_SLOTS[t]} worker${JOB_SLOTS[t] > 1 ? 's' : ''}`);
      html += `<div class="almrow${lockRank ? ' locked' : ''}">
        <div class="aico">${icon}</div>
        <div><span class="anm">${TOOL_NAME(t)}${lockRank ? `<span class="alock">unlocks at ${lockRank.nm} (${lockRank.pop} folk)</span>` : ''}</span>
        <div class="adesc">${ALM_DESC[t] || ''}</div>
        <div class="astats">${stats.join(' · ')}</div></div></div>`;
    };
    const ICONALIAS = { townhouse:'house', manor:'house' };
    row('keep');
    for (const tb of TABS) for (const t of tb.tools) row(t);
    for (const t of ['townhouse','manor']) row(t);
    body.innerHTML = html;
  } else if (almTab === 'terms') {
    body.innerHTML = ALM_TERMS.map(([nm, d]) => `<div class="almterm"><b>${nm}</b> — ${d}</div>`).join('');
  } else {
    body.innerHTML = RANKS.map((r, i) => `<div class="almrank${i === state.rankIdx ? ' now' : ''}">
      <div class="rnm">${i === state.rankIdx ? '⚜ ' : ''}${r.nm.toUpperCase()}</div>
      <div class="rpop">${r.pop} folk</div>
      <div class="runl">${r.unlocks.filter(t => t !== 'demolish').map(TOOL_NAME).join(' · ')}</div></div>`).join('')
      + `<div style="padding:10px 6px; color:#8a7a58; font-size:12px">Rank follows the most folk the town has ever held — it never falls back.</div>`;
  }
}
function openAlmanac() {
  renderAlmanac();
  $('almanac').style.display = 'flex';
  AudioSys.play('click');
}
document.querySelectorAll('.almtab').forEach(el => {
  el.onclick = () => { almTab = el.dataset.alm; renderAlmanac(); AudioSys.play('click'); };
});
$('bookbtn').onclick = openAlmanac;
$('almClose').onclick = () => { $('almanac').style.display = 'none'; };

// woodcut dress: resource glyphs and the first palette render
document.querySelectorAll('.rico').forEach(el => { el.innerHTML = resSVG(el.dataset.r); });
renderPalette();

// ---------------------------------------------------------------- boot
function startGame(cont, diff = 'standard') {
  $('intro').style.display = 'none';
  state.started = true;
  AudioSys.init();
  applySettings(false);
  if (cont && loadGame()) {
    msg('The town wakes.', 'dim');
    updateObjectives(true);   // seed the charter from restored progress, silently
    refreshOccasions(false);
    teleStart(true);
  } else {
    newTownSetup(diff);
    teleStart(false);
  }
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
      $('startbtn').style.display = 'none';
      $('diffrow').style.display = 'flex';
    };
    document.querySelectorAll('.diffbtn').forEach(b => {
      b.onclick = () => {
        localStorage.removeItem('bulwark-save');
        startGame(false, b.dataset.diff);
      };
    });
  }
}

// headless / test hooks (per project convention: expose sim + step)
window.BULWARK = {
  state, step,
  place: (t,x,z) => placeBuilding(t,x,z),
  wall: (verts, tier) => { wallDraft = verts.map(v=>({x:v[0],z:v[1]})); startAttach = null; const p = tool; if (WALL_TIERS[tier]) tool = tier; tryCloseWall(); tool = p; },
  clickWall: (x,z) => { const prev = tool; tool = 'wall'; wallClickAt(x, z); tool = prev; },
  cutGate: (x,z,tier) => gateClickAt(x, z, tier),
  breachAt: (x,z) => { const sp = wallSnap(x, z); if (sp) breachWall(sp.wall, x, z); return !!sp; },
  hoardingsAt: (x,z) => { const sp = wallSnap(x, z); return sp ? raiseHoardings(sp.wall) : false; },
  placeFree: (t,x,z) => placeBuilding(t, x, z, true),
  roadSpeedAt,
  removeWallAt: (x,z) => { const sp = wallSnap(x, z); if (sp) removeWall(sp.wall); return !!sp; },
  paintRoad: (x,z,tier) => paintRoadAt(x, z, tier),
  teleReport: () => buildTeleReport(),
  save: (k) => saveGame(k),
  seasonOf,
  setEdict, refreshJobs, workforce, staffEff, edictOn, isFestivalDay, isHolyDay,
  // debug capture: render into a target and read pixels — the canvas back
  // buffer is cleared after present on Windows, so toDataURL comes back blank
  shot: (q) => {
    const w = renderer.domElement.width, h = renderer.domElement.height;
    const rt = new THREE.WebGLRenderTarget(w, h, { colorSpace: THREE.SRGBColorSpace });
    renderer.setRenderTarget(rt);
    renderer.render(scene, camera);
    const buf = new Uint8Array(w * h * 4);
    renderer.readRenderTargetPixels(rt, 0, 0, w, h, buf);
    renderer.setRenderTarget(null);
    rt.dispose();
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const ctx = c.getContext('2d');
    const img = ctx.createImageData(w, h);
    for (let y = 0; y < h; y++) img.data.set(buf.subarray((h-1-y)*w*4, (h-y)*w*4), y*w*4);
    ctx.putImageData(img, 0, 0);
    return c.toDataURL('image/jpeg', q || 0.78);
  },
  // raw-pixel capture for profiles where canvas readback is spoofed
  // (anti-fingerprinting): returns row-flipped RGBA as base64, sRGB-encoded
  shotRaw: (scale) => {
    // sync lighting to sim time WITHOUT a screen render — a canvas render
    // immediately before the RT render leaves the RT pass empty on this GPU
    updateAtmosphere();
    const w = Math.round(renderer.domElement.width * (scale || 0.5));
    const h = Math.round(renderer.domElement.height * (scale || 0.5));
    const rt = new THREE.WebGLRenderTarget(w, h, { colorSpace: THREE.SRGBColorSpace });
    renderer.setRenderTarget(rt);
    renderer.render(scene, camera);
    const buf = new Uint8Array(w * h * 4);
    renderer.readRenderTargetPixels(rt, 0, 0, w, h, buf);
    renderer.setRenderTarget(null);
    rt.dispose();
    const flip = new Uint8Array(w * h * 4);
    for (let y = 0; y < h; y++) flip.set(buf.subarray((h-1-y)*w*4, (h-y)*w*4), y*w*4);
    let bin = '';
    for (let i = 0; i < flip.length; i += 8192)
      bin += String.fromCharCode.apply(null, flip.subarray(i, i + 8192));
    return { w, h, b64: btoa(bin), calls: renderer.info.render.calls, tris: renderer.info.render.triangles };
  },
  start: () => { $('intro').style.display='none'; state.started = true; if (!state.buildings.length) newTownSetup(); },
  sim: (seconds, dt=0.1) => { for (let t=0;t<seconds;t+=dt) step(dt); return { ...state, buildings:state.buildings.length, walls:state.walls.length, bandits:state.bandits.length }; },
};
installTests();

// crash guard: if anything blows up, save the town before it can be lost
let crashShown = false;
function crashToast(kind) {
  try { saveGame(); } catch (e) {}
  if (crashShown) return;
  crashShown = true;
  const d = document.createElement('div');
  d.style.cssText = 'position:fixed;left:50%;top:64px;transform:translateX(-50%);z-index:40;' +
    'background:#3a2016;border:1px solid #a3542a;color:#f0c9a8;border-radius:8px;' +
    'padding:10px 18px;font-size:13px;font-family:Georgia,serif';
  d.textContent = '⚠ Something went wrong — your town has been saved. Reload if the game misbehaves.';
  document.body.appendChild(d);
  setTimeout(() => d.remove(), 9000);
}
addEventListener('error', () => crashToast('error'));
addEventListener('unhandledrejection', () => crashToast('promise'));
