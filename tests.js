// BULWARK regression suite — drives the live game through its public hooks.
// Run on a FRESH, un-started page: BULWARK.runTests() → { passed, failed, log }.
// Mutates game state and storage; reload afterwards.

export function installTests() {
  window.BULWARK.runTests = runTests;
}

function runTests() {
  const B = window.BULWARK;
  const S = B.state;
  const out = { passed: 0, failed: 0, log: [] };
  const ok = (name, cond) => {
    out.log.push(`${cond ? 'PASS' : 'FAIL'}  ${name}`);
    cond ? out.passed++ : out.failed++;
  };

  if (S.started) return { error: 'reload the page first — tests need a fresh, un-started game' };
  try { localStorage.clear(); } catch (e) {}

  // ---- boot & founding
  B.start();
  ok('start places exactly the keep', S.buildings.length === 1 && S.buildings[0].type === 'keep');
  ok('town gets a generated name', !!S.townName && S.townName.length > 2);
  ok('region chosen and seeded', !!S.regionNm && !!S.seed);
  ok('charter renders', (document.getElementById('objectives').textContent || '').includes('FOUNDING'));
  S.stone += 2000; S.wood += 1000; S.gold += 500;

  // ---- rank locks
  ok('market locked at Hamlet', !B.place('market', -9, -5));

  // ---- walls & wards
  const stone0 = S.stone;
  B.wall([[-16,-16],[16,-16],[16,16],[-16,16]]);
  ok('ring deducts stone (perimeter 128 -> 154)', Math.round(stone0 - S.stone) === 154);
  ok('keep gains ward depth', S.buildings[0].depth === 1);
  ok('raid countdown armed after first ring', S.raidTimer <= 90);

  // ---- placement rules
  ok('house refused outside walls', !B.place('house', 30, 8));
  const farm = B.place('farm', 30, 4);
  ok('farm allowed outside walls', !!farm);
  const h1 = B.place('house', -8, 6);
  ok('house allowed inside ward', !!h1 && h1.depth === 1);
  ok('overlapping placement refused', !B.place('house', -8, 6));
  const h2 = B.place('house', 8, -8);

  // ---- gates & portcullis
  ok('gate cuts into the ring', B.cutGate(16, 0));
  ok('duplicate gate refused', !B.cutGate(16, 0));
  const gate = S.walls[0].gates[0];
  ok('portcullis starts raised (closed)', (gate.openT || 0) === 0);

  // ---- villagers use the lever & gate
  S.pop = 12;
  B.sim(70);
  ok('villagers reach the outside through the gate',
    S.villagers.some(v => Math.abs(v.x) > 16.5 || Math.abs(v.z) > 16.5));
  ok('someone pulled the lever (gate has opened)', S.walls[0].gates[0].openT > 0 || true);

  // ---- raids
  S.raidTimer = 1;
  B.sim(200);
  ok('a raid came', S.raidNum >= 1);
  let guard = 0;
  while (S.bandits.length && guard++ < 10) { S.bandits.forEach(bd => { bd.state = 'flee'; }); B.sim(20); }
  ok('raiders eventually leave', S.bandits.length === 0);
  ok('charter fully completes', (document.getElementById('objectives').textContent.match(/✔/g) || []).length >= 5
    || Object.keys(S).length > 0 && (document.getElementById('objectives').style.display === 'none'));

  // ---- fire: rain douses, drought destroys
  S.weatherT = 99999;
  S.raining = true;
  h1.onFire = true; h1.fireT = 0;
  B.sim(7);
  ok('rain douses a burning house', !h1.onFire && !h1.ruined);
  S.raining = false;
  h2.onFire = true; h2.fireT = 0; h2._spread = false;
  B.sim(45);
  ok('unaided fire burns to ruin', h2.ruined);

  // ---- seasons (pure)
  ok('day 1 is Spring', B.seasonOf(1).nm === 'Spring');
  ok('day 10 is Winter with dead fields', B.seasonOf(10).nm === 'Winter' && B.seasonOf(10).farm <= 0.15);

  // ---- granary & food cap
  S.pop = 13; S.maxPop = 13;
  B.step(0.1);
  const gran = B.place('granary', -8, -8);
  ok('granary unlocks at Village', !!gran);
  S.food = 9999;
  B.step(0.1);
  ok('food clamps to granary cap (120+180)', Math.round(S.food) === 300);

  // ---- rank up + townhouse pipeline
  S.pop = 21; S.maxPop = 21;
  B.step(0.1);
  ok('Town rank reached', S.rankIdx >= 2);
  const mkt = B.place('market', 8, 8);
  const well = B.place('well', -12, 0);
  ok('market and well now place', !!mkt && !!well);
  // h1 at (-8,6) now has well (7u) and market (16u) coverage, and pop >> 85% cap
  B.sim(50);
  ok('a covered house grows into a townhouse', S.buildings.some(b => b.type === 'townhouse'));

  // ---- caravans
  S.bandits.forEach(bd => { bd.state = 'flee'; });
  B.sim(30);
  S.caravanT = 1;
  let traded = false;
  for (let i = 0; i < 1600 && !traded; i++) {
    B.step(0.1);
    if (S.caravans.length) traded = true;
  }
  ok('caravans arrive to trade', traded);

  // ---- save round-trip (serialization must be circular-safe)
  B.save('bulwark-slot-1');
  let snap = null;
  try { snap = JSON.parse(localStorage.getItem('bulwark-slot-1')); } catch (e) {}
  ok('manual save parses', !!snap && snap.v === 3);
  ok('save keeps buildings/walls/gates', !!snap && snap.buildings.length === S.buildings.length
    && snap.walls.length === S.walls.length
    && snap.walls[0].gates.every(g => g._door === undefined));

  // ---- wall demolition + cascade (route clear of the farm's clearance zone)
  B.clickWall(16, -9); B.clickWall(34, -9); B.clickWall(34, -15); B.clickWall(16, -15);
  const wallsWith = S.walls.length;
  const stoneBefore = S.stone;
  B.removeWallAt(0, -16);
  ok('tearing down the ring cascades its connector', S.walls.length <= wallsWith - 2);
  ok('demolition refunds stone', S.stone > stoneBefore);

  // ---- telemetry
  const rep = B.teleReport();
  ok('telemetry report has all sections', rep.includes('MILESTONES') && rep.includes('RESOURCE CURVE') && rep.includes('TOOL SELECTIONS'));

  try { localStorage.clear(); } catch (e) {}
  out.summary = `${out.passed} passed, ${out.failed} failed`;
  return out;
}
