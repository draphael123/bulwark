// BULWARK — medieval town builder where THE WALL IS THE TOWN.
// Closed wall rings define wards; nesting depth raises taxes; everything
// outside the rings is raidable by bandits.
import * as THREE from 'three';

// ---------------------------------------------------------------- constants
const MAP = 120;              // half-extent of buildable land
const DAY = 60;               // seconds per day
const WALL_COST_PER_UNIT = 1.2;   // stone
const WALL_H = 5, WALL_T = 1.4;
const GATE_W = 6;

const BUILD_DEFS = {
  house:      { nm:'House',      ico:'🏠', w:3,  d:3,  hp:60,  cost:{wood:20},            popCap:4 },
  farm:       { nm:'Farm',       ico:'🌾', w:6,  d:6,  hp:50,  cost:{wood:30},            foodPerDay:12 },
  woodcutter: { nm:'Woodcutter', ico:'🪵', w:3,  d:3,  hp:50,  cost:{wood:10, gold:10},   woodPerDay:8, needsTrees:2 },
  quarry:     { nm:'Quarry',     ico:'⛏️', w:4,  d:4,  hp:80,  cost:{wood:25, gold:15},   stonePerDay:8, needsRocks:2 },
  market:     { nm:'Market',     ico:'🏪', w:4,  d:4,  hp:80,  cost:{wood:40, stone:20},  boostR:18 },
  tower:      { nm:'Watchtower', ico:'🗼', w:2,  d:2,  hp:120, cost:{wood:20, stone:30},  range:24, dps:11 },
  barracks:   { nm:'Barracks',   ico:'⚔️', w:4,  d:4,  hp:120, cost:{wood:40, stone:30, gold:50}, guards:3 },
  keep:       { nm:'Keep',       ico:'🏰', w:6,  d:6,  hp:400, cost:{},                   popCap:8 },
};
const TOOL_ORDER = ['house','farm','woodcutter','quarry','market','tower','barracks','wall','gate','demolish'];
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
app.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x86a3c3);
scene.fog = new THREE.Fog(0x86a3c3, 180, 420);

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
scene.add(new THREE.HemisphereLight(0xbdd3e8, 0x5a6b3a, 0.9));

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
const ground = new THREE.Mesh(
  new THREE.PlaneGeometry(640, 640),
  new THREE.MeshLambertMaterial({ map: grassTexture() })
);
ground.rotation.x = -Math.PI/2;
ground.receiveShadow = true;
scene.add(ground);

// ---------------------------------------------------------------- scatter: trees & rocks
// seeded PRNG so the land is identical every session (saves reference it)
let _seed = 11813;
function srand() { _seed = (_seed * 1664525 + 1013904223) >>> 0; return _seed / 4294967296; }
const trees = [], rocks = [];
{
  // tree clusters in a rough ring; rocks in a few clumps
  const trunkG = new THREE.CylinderGeometry(0.35, 0.5, 2.4, 6);
  const leafG  = new THREE.ConeGeometry(2.0, 4.4, 7);
  const trunkM = new THREE.MeshLambertMaterial({ color:0x6e4a2a });
  const leafM  = new THREE.MeshLambertMaterial({ color:0x3f6b34 });
  const N = 190;
  const trunkI = new THREE.InstancedMesh(trunkG, trunkM, N);
  const leafI  = new THREE.InstancedMesh(leafG, leafM, N);
  trunkI.castShadow = leafI.castShadow = true;
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3();
  let placed = 0, guard = 0;
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
    q.setFromEuler(new THREE.Euler(0, srand()*Math.PI*2, 0));
    s.set(sc, sc, sc);
    m4.compose(new THREE.Vector3(x, 1.2*sc, z), q, s);
    trunkI.setMatrixAt(placed, m4);
    m4.compose(new THREE.Vector3(x, (2.4+2.2)*sc, z), q, s);
    leafI.setMatrixAt(placed, m4);
    trees.push({ x, z });
    placed++;
  }
  trunkI.count = leafI.count = placed;
  scene.add(trunkI, leafI);

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
};

// gabled roof prism: width x, height y, depth z (ridge along z)
function prismGeo(w, h, d) {
  const g = new THREE.BufferGeometry();
  const hw = w/2, hd = d/2;
  const v = [
    // two triangle end caps + two slopes + bottom (skip bottom)
    -hw,0,-hd,  hw,0,-hd,  0,h,-hd,
     hw,0, hd, -hw,0, hd,  0,h, hd,
    -hw,0,-hd,  0,h,-hd,   0,h,hd,   -hw,0,-hd, 0,h,hd, -hw,0,hd,
     0,h,-hd,   hw,0,-hd,  hw,0,hd,   0,h,-hd,  hw,0,hd, 0,h,hd,
  ];
  g.setAttribute('position', new THREE.Float32BufferAttribute(v, 3));
  g.computeVertexNormals();
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
  }
  return g;
}

function makeRuin(b) {
  const g = new THREE.Group();
  const def = BUILD_DEFS[b.type];
  g.add(box(def.w*0.8, 0.7, def.d*0.8, MAT.ruin, 0, 0.35, 0));
  g.add(box(def.w*0.4, 1.1, def.d*0.3, MAT.ruin, def.w*0.15, 0.55, -def.d*0.1));
  g.position.set(b.x, 0, b.z);
  return g;
}

// agents — little articulated folk: legs/arms pivot at hip/shoulder for a walk cycle
function makeFigure(bodyColor, role='villager') {
  const g = new THREE.Group();
  const mat = c => new THREE.MeshLambertMaterial({ color:c });
  const bodyM = mat(bodyColor), skinM = mat(0xdbb894), darkM = mat(0x3a2d20);

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
    const hat = cone(0.30, 0.16, mat(0xc9a86a), 0, 1.42, 0, 8);   // straw hat
    hat.scale.y = 0.7; g.add(hat);
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
  a.grp.position.y = Math.abs(Math.sin(a.bob)) * 0.06 * a._swing;
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

// gates: [{seg, t}] — gate carved into segment `seg` at param t along it.
// Pass null to auto-place one gate on the longest segment that can host one.
function buildWallMeshes(verts, closed=true, gates=null) {
  const group = new THREE.Group();
  const n = verts.length;
  const segCount = closed ? n : n-1;
  const segLen = i => Math.hypot(verts[(i+1)%n].x-verts[i].x, verts[(i+1)%n].z-verts[i].z);
  if (!gates) {
    let gs = -1, best = GATE_W + 2;
    for (let i=0;i<segCount;i++) if (segLen(i) > best) { best = segLen(i); gs = i; }
    gates = gs >= 0 ? [{ seg:gs, t:0.5 }] : [];
  }
  const merlonMats = [];
  for (let i=0;i<segCount;i++){
    const a = verts[i], b = verts[(i+1)%n];
    const len = segLen(i);
    const ang = Math.atan2(b.x-a.x, b.z-a.z);
    const mx = (a.x+b.x)/2, mz = (a.z+b.z)/2;
    const along = (off) => ({ x: mx + Math.sin(ang)*off, z: mz + Math.cos(ang)*off });
    // gate centers on this segment as along-axis offsets from the midpoint
    const segGates = (len > GATE_W + 2)
      ? gates.filter(g => g.seg === i)
          .map(g => Math.min(len - GATE_W/2 - 1, Math.max(GATE_W/2 + 1, g.t*len)) - len/2)
          .sort((p,q) => p-q)
      : [];
    // wall spans between gates
    let cursor = -len/2;
    const spans = [];
    for (const gc of segGates) { spans.push([cursor, gc - GATE_W/2]); cursor = gc + GATE_W/2; }
    spans.push([cursor, len/2]);
    for (const [s0, s1] of spans) {
      const w2 = s1 - s0;
      if (w2 < 0.4) continue;
      const p = along((s0+s1)/2);
      const w = box(WALL_T, WALL_H, w2, MAT.stone, p.x, WALL_H/2, p.z);
      w.rotation.y = ang; group.add(w);
      const cnt = Math.floor(w2/2.2);
      for (let k=0;k<cnt;k++){
        const q = along(s0 + (k+0.5)*w2/cnt);
        merlonMats.push({ x:q.x, z:q.z, ang });
      }
    }
    // gatehouses
    for (const gc of segGates) {
      for (const s of [-1, 1]) {
        const p = along(gc + s * (GATE_W/2 + 0.6));
        group.add(cyl(1.2, 1.4, WALL_H+2.4, MAT.stoneD, p.x, (WALL_H+2.4)/2, p.z, 8));
        group.add(cone(1.5, 1.7, MAT.roofB, p.x, WALL_H+3.3, p.z, 8));
      }
      const p = along(gc);
      const lintel = box(WALL_T+0.4, 1.6, GATE_W, MAT.stoneD, p.x, WALL_H-0.2, p.z);
      lintel.rotation.y = ang; group.add(lintel);
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
  return { group, gates };
}

// rebuild one wall's meshes in place (after adding a gate)
function rebuildWall(w) {
  scene.remove(w.group);
  const r = buildWallMeshes(w.path, w.closed, w.gates);
  w.group = r.group;
  scene.add(w.group);
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
  const b = { type, x, z, hp:def.hp, maxHp:def.hp, depth:wardDepth(x,z), ruined:false, group, hitFlash:0 };
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
  const { group, gates } = buildWallMeshes(D, false);
  scene.add(group);
  state.walls.push({ poly, path:D, closed:false, group, gates });
  refreshDepths();
  const inside = state.buildings.filter(b => b.depth > 0 && !b.ruined).length;
  msg(`Walls joined — 🪨${cost}. A new ward is enclosed (${inside} building${inside===1?'':'s'} behind walls).`, 'good');
  const maxDepth = Math.max(...state.buildings.map(b => b.depth), 0);
  if (maxDepth >= 2) msg('An inner ward! Deep wards pay richer taxes.', 'good');
  wallDraft = []; startAttach = null;
  redrawWallPreview();
  saveGame();
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
  const { group, gates } = buildWallMeshes(verts, true);
  scene.add(group);
  state.walls.push({ poly: verts, path: verts, closed: true, group, gates });
  refreshDepths();
  const inside = state.buildings.filter(b => b.depth > 0 && !b.ruined).length;
  msg(`Ring closed — 🪨${cost}. ${inside} building${inside===1?'':'s'} now behind walls.`, 'good');
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

function costStr(cost) {
  const ic = { gold:'🪙', wood:'🪵', stone:'🪨' };
  return Object.entries(cost).map(([k,v]) => `${ic[k]}${v}`).join(' ') || '—';
}
{
  const pal = $('palette');
  for (const t of TOOL_ORDER) {
    const el = document.createElement('div');
    el.className = 'tool'; el.dataset.t = t;
    if (t === 'wall') el.innerHTML = `<div class="ico">🧱</div><div class="nm">Wall</div><div class="cost">🪨${WALL_COST_PER_UNIT}/step</div>`;
    else if (t === 'gate') el.innerHTML = `<div class="ico">🚪</div><div class="nm">Gate</div><div class="cost">🪨${GATE_COST}</div>`;
    else if (t === 'demolish') el.innerHTML = `<div class="ico">🔨</div><div class="nm">Demolish</div><div class="cost">refund ½</div>`;
    else {
      const d = BUILD_DEFS[t];
      el.innerHTML = `<div class="ico">${d.ico}</div><div class="nm">${d.nm}</div><div class="cost">${costStr(d.cost)}</div>`;
    }
    el.onclick = () => setTool(t);
    pal.appendChild(el);
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
    if (Math.abs(bd.x) > MAP+16 || Math.abs(bd.z) > MAP+16) removeBandit(bd);
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
      if (t.hp <= 0) destroyBuilding(t, bd);
    }
  }
}
function moveToward(a, tx, tz, dt) {
  const d = Math.hypot(tx-a.x, tz-a.z);
  if (d < 0.01) return;
  a._moved = true;
  a.x += (tx-a.x)/d * a.speed * dt;
  a.z += (tz-a.z)/d * a.speed * dt;
  a.grp.position.x = a.x; a.grp.position.z = a.z;
  a.grp.rotation.y = Math.atan2(tx-a.x, tz-a.z);
}
function removeBandit(bd) {
  scene.remove(bd.grp);
  const i = state.bandits.indexOf(bd);
  if (i >= 0) state.bandits.splice(i, 1);
  if (!state.bandits.length && !state.over) msg('The raid is over.', 'good');
}

function destroyBuilding(b, byBandit=null) {
  b.ruined = true; b.hp = 0;
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
  if (!g.patrol || Math.hypot(g.patrol.x-g.x, g.patrol.z-g.z) < 1) {
    g.patrol = { x:g.home.x + (Math.random()-0.5)*20, z:g.home.z + (Math.random()-0.5)*20 };
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
    const grp = makeFigure([0x8c6a3a, 0x5a7a4a, 0x7a5a7a, 0x9c8248][Math.random()*4|0], 'villager');
    grp.scale.setScalar(0.8);
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
    if (!v.tgt || Math.hypot(v.tgt.x-v.x, v.tgt.z-v.z) < 0.5) {
      v.tgt = { x:v.home.x + (Math.random()-0.5)*10, z:v.home.z + (Math.random()-0.5)*10 };
      v.wait = 1 + Math.random()*4;
    }
    moveToward(v, v.tgt.x, v.tgt.z, dt);
  }
}

// ---------------------------------------------------------------- input
const keys = {};
addEventListener('keydown', e => {
  keys[e.code] = true;
  if (e.code === 'Escape') {
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
    const sp = wallSnap(mouseGround.x, mouseGround.z);
    if (!sp) { msg('Click on a wall to cut a gate into it.', 'warn'); return; }
    const w = sp.wall, n = w.path.length;
    const a = w.path[sp.seg], b = w.path[(sp.seg+1)%n];
    const len = Math.hypot(b.x-a.x, b.z-a.z);
    if (len <= GATE_W + 2) { msg('That stretch of wall is too short for a gate.', 'warn'); return; }
    const tooClose = w.gates.some(g => g.seg === sp.seg && Math.abs(g.t - sp.t) * len < GATE_W + 2);
    if (tooClose) { msg('There is already a gate there.', 'warn'); return; }
    if (state.stone < GATE_COST) { msg(`A gate costs 🪨${GATE_COST}.`, 'warn'); return; }
    state.stone -= GATE_COST;
    w.gates.push({ seg: sp.seg, t: sp.t });
    rebuildWall(w);
    msg('Gate cut through the wall.', 'good');
    saveGame();
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
function saveGame() {
  if (state.over || !state.started) return;
  try {
    localStorage.setItem('bulwark-save', JSON.stringify({
      gold:state.gold, wood:state.wood, stone:state.stone, food:state.food,
      pop:state.pop, time:state.time, raidNum:state.raidNum,
      buildings: state.buildings.map(b => ({ type:b.type, x:b.x, z:b.z, hp:b.hp, ruined:b.ruined })),
      walls: state.walls.map(w => ({ poly:w.poly, path:w.path, closed:w.closed, gates:w.gates })),
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
    const { group, gates } = buildWallMeshes(path, closed, w.gates || null);
    scene.add(group);
    state.walls.push({ poly, path, closed, group, gates });
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
  placeBuilding('house', -7, 3, true);
  placeBuilding('house', 6, -5, true);
  msg('Welcome to the valley. The Keep stands unwalled — raiders arrive on day 3.', 'warn');
  msg('Lay your first ring of stone (Wall tool, key 8).', 'dim');
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
  // raids
  state.raidTimer -= dt;
  if (state.raidTimer <= 0) spawnRaid();
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
  // walk-cycle pass: reads the _moved flags the ticks above just set
  for (const a of [...state.bandits, ...state.guards, ...state.villagers]) {
    animateFigure(a, dt);
    a._moved = false;
  }
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
  } else hintEl.style.display = 'none';

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

// ---------------------------------------------------------------- boot
$('startbtn').onclick = () => {
  $('intro').style.display = 'none';
  state.started = true;
  if (!loadGame()) newTownSetup();
  else msg('The town wakes. (Autosave restored — ⟲ New Town to start fresh.)', 'dim');
};

// headless / test hooks (per project convention: expose sim + step)
window.BULWARK = {
  state, step,
  place: (t,x,z) => placeBuilding(t,x,z),
  wall: (verts) => { wallDraft = verts.map(v=>({x:v[0],z:v[1]})); startAttach = null; tryCloseWall(); },
  clickWall: (x,z) => { const prev = tool; tool = 'wall'; wallClickAt(x, z); tool = prev; },
  start: () => { $('intro').style.display='none'; state.started = true; if (!state.buildings.length) newTownSetup(); },
  sim: (seconds, dt=0.1) => { for (let t=0;t<seconds;t+=dt) step(dt); return { ...state, buildings:state.buildings.length, walls:state.walls.length, bandits:state.bandits.length }; },
};
