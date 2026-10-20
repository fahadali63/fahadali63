import { P, Sheet, planBase, roomTags, outerDims, northArrow, viewTitle, Column, fitScale, gridBubble, ftin, dimLine, table, notesBlock } from './draw.js';
import { MAIN, RIGHT, lvlName } from './sheets_arch.js';
import { OCCUPANCIES, CONSTRUCTION_TYPES, ROOM_TYPES, JURISDICTIONS } from './catalog.js';

const BREAKERS = [15, 20, 25, 30, 35, 40, 45, 50, 60, 70, 80, 90, 100, 110, 125, 150, 175, 200, 225, 250, 300, 350, 400, 450, 500, 600, 700, 800, 1000, 1200, 1600, 2000, 2500, 3000, 4000];
const nextBrk = (a) => BREAKERS.find((b) => b >= a) || BREAKERS[BREAKERS.length - 1];
const feeder = (a) => (a <= 60 ? '#6' : a <= 100 ? '#3' : a <= 125 ? '#1' : a <= 150 ? '#1/0' : a <= 175 ? '#2/0' : a <= 200 ? '#3/0' : a <= 225 ? '#4/0' : a <= 250 ? '250 kcmil' : a <= 300 ? '350 kcmil' : a <= 400 ? '600 kcmil' : `${Math.ceil(a / 400)} sets 600 kcmil`);
const nonCore = (r) => !ROOM_TYPES[r.type].core;

function planScaffold(disc, number, title, fl, ctx, o = {}) {
  const sh = new Sheet(disc, number, title);
  const { W, D } = ctx.layout;
  const sc = fitScale(W + 24, D + 20, MAIN);
  const prims = planBase(fl, ctx.layout, { thin: true });
  if (o.tags !== false) prims.push(...roomTags(fl, { s: sc.s, h: 4.4, c: 'light', skip: o.skip }));
  prims.push(...outerDims(W, D));
  return { sh, prims, sc, W, D };
}
function finish(sc, title, num = '1') {
  const vp = sc.sh.view(sc.prims, sc.W, sc.D, MAIN, { pad: 10, vcenter: true });
  sc.sh.add([...viewTitle(MAIN.x, 38, num, title, vp.label), ...northArrow(MAIN.x + MAIN.w - 14, 44)]);
  return vp;
}

// ================= Structural =================
export function computeStruct(ctx) {
  const { layout, project } = ctx; const { W, D, stories } = layout;
  const ct = CONSTRUCTION_TYPES[project.construction];
  const nx = Math.max(2, Math.ceil(W / 28)); const ny = Math.max(2, Math.ceil(D / 28));
  const bx = W / nx; const by = D / ny; const span = Math.max(bx, by);
  let beam;
  if (ct.system === 'wood') beam = span <= 12 ? 'GLB 5-1/8x12' : span <= 16 ? 'GLB 5-1/8x15' : span <= 20 ? 'GLB 5-1/8x18' : span <= 24 ? 'GLB 6-3/4x24' : span <= 28 ? 'GLB 6-3/4x27' : 'GLB 8-3/4x30';
  else beam = span <= 16 ? 'W12x16' : span <= 20 ? 'W16x26' : span <= 24 ? 'W18x35' : span <= 28 ? 'W21x44' : span <= 32 ? 'W24x55' : 'W27x84';
  const col = ct.system === 'wood' ? (stories <= 2 ? '6x6 DF#1 post' : '8x8 DF#1 post') : (stories <= 2 ? 'HSS6x6x1/4' : stories <= 4 ? 'HSS8x8x3/8' : 'W12x65');
  const floorDL = ct.system === 'wood' ? 15 : 55; const roofDL = 20;
  const floorLL = Math.max(...layout.floors[0].rooms.map((r) => ({ lobby: 100, assembly: 100, dining: 100, retail: 100, classroom: 40, storage: 125, warehouse: 125, bedroom: 40, living: 40, office: 50, open_office: 50 }[r.type] || 50)));
  const q = (floorDL + floorLL + 15) / 1000; // ksf incl. partitions
  const psfBearing = 2000;
  const sized = (trib) => { const P_ = trib * (q * (stories - 1) + (roofDL + 20) / 1000) * 1000; const side = Math.max(3, Math.ceil(Math.sqrt(P_ / psfBearing) * 2) / 2); return { load: Math.round(P_ / 1000), side }; };
  const full = sized(bx * by); const edge = sized(bx * by * 0.5); const corner = sized(bx * by * 0.25);
  const footings = [['F1', 'Interior', `${full.side}'-0" sq x ${Math.max(12, Math.round(full.side * 3))}"`, `${full.load} kips`], ['F2', 'Edge', `${edge.side}'-0" sq x ${Math.max(12, Math.round(edge.side * 3))}"`, `${edge.load} kips`], ['F3', 'Corner', `${corner.side}'-0" sq x 12"`, `${corner.load} kips`]];
  return { nx, ny, bx, by, span, beam, col, footings, floorLL, floorDL, roofDL, system: ct.system, psfBearing };
}

export function structuralSheets(ctx) {
  const { layout } = ctx; const st = ctx.struct; const out = [];
  const { W, D } = layout;
  const grid = (prims) => {
    for (let i = 0; i <= st.nx; i++) { const x = i * st.bx; prims.push(P.line(x, -8, x, D + 8, { w: 0.5, c: 'red', dash: '8 2 2 2' }), ...gridBubble(x, -10.5, String.fromCharCode(65 + i)), ...gridBubble(x, D + 10.5, String.fromCharCode(65 + i))); }
    for (let j = 0; j <= st.ny; j++) { const y = j * st.by; prims.push(P.line(-8, y, W + 8, y, { w: 0.5, c: 'red', dash: '8 2 2 2' }), ...gridBubble(-10.5, y, String(j + 1)), ...gridBubble(W + 10.5, y, String(j + 1))); }
  };
  // foundation
  {
    const sc = planScaffold('structural', 'S-101', 'Foundation plan', layout.floors[0], ctx, { tags: false });
    sc.prims.length = 0; const p = sc.prims;
    p.push(P.rect(0, 0, layout.W, layout.D, { w: 2.5 }), P.rect(-0.75, -0.75, W + 1.5, D + 1.5, { w: 0.8, c: 'mid', dash: '3 2' }));
    grid(p);
    for (let i = 0; i <= st.nx; i++) for (let j = 0; j <= st.ny; j++) {
      const edgeX = i === 0 || i === st.nx; const edgeY = j === 0 || j === st.ny;
      const tag = edgeX && edgeY ? 'F3' : edgeX || edgeY ? 'F2' : 'F1'; const f = st.footings.find((q) => q[0] === tag);
      const side = parseFloat(f[2]) || 4; const x = i * st.bx; const y = j * st.by;
      p.push(P.rect(x - side / 2, y - side / 2, side, side, { fill: '#e8e3d8', w: 1 }), P.rect(x - 0.5, y - 0.5, 1, 1, { fill: 'ink', w: 0.5 }), P.text(x + side / 2 + 0.6, y - side / 2 + 3, tag, { h: 3.6, bold: true }));
    }
    p.push(...outerDims(W, D));
    const vp = finish(sc, 'Foundation plan');
    const col = new Column(RIGHT.x, 40, RIGHT.w, 12);
    col.table('Footing schedule', ['Mark', 'Location', 'Size', 'Service load'], st.footings, { rh: 9.4, fs: 5 });
    col.notes('Foundation notes', [`Assumed allowable soil bearing ${st.psfBearing} psf pending a geotechnical report.`, 'Continuous perimeter footing 18 in wide x 12 in deep minimum, bottom 18 in below finish grade.', 'Slab on grade 5 in with #4 at 18 in OC each way over vapor retarder.', 'Preliminary sizes. The structural engineer of record shall verify all loads and member sizes.'], { fs: 4.8 });
    sc.sh.add(col.prims); out.push(sc.sh); void vp;
  }
  for (let lv = 2; lv <= layout.stories + 1; lv++) {
    const isRoof = lv === layout.stories + 1;
    const sc = planScaffold('structural', `S-2${String(lv - 1).padStart(2, '0')}`, isRoof ? 'Roof framing plan' : `${lvlName(lv)} floor framing plan`, layout.floors[Math.min(lv, layout.stories) - 1], ctx, { tags: false });
    sc.prims.length = 0; const p = sc.prims;
    p.push(P.rect(0, 0, W, D, { w: 2.2 })); grid(p);
    for (let j = 0; j <= st.ny; j++) p.push(P.line(0, j * st.by, W, j * st.by, { w: 2, c: 'blue' }));
    for (let i = 0; i <= st.nx; i++) p.push(P.line(i * st.bx, 0, i * st.bx, D, { w: 1.2, c: 'blue' }));
    for (let i = 0; i < st.nx; i++) for (let j = 0; j < st.ny; j++) {
      const cx = (i + 0.5) * st.bx; const cy = (j + 0.5) * st.by;
      p.push(P.line(cx, cy - st.by * 0.3, cx, cy + st.by * 0.3, { w: 0.6, c: 'mid' }), P.poly([[cx - 1, cy - st.by * 0.3 + 2], [cx, cy - st.by * 0.3], [cx + 1, cy - st.by * 0.3 + 2]], { closed: false, w: 0.6, c: 'mid' }), P.poly([[cx - 1, cy + st.by * 0.3 - 2], [cx, cy + st.by * 0.3], [cx + 1, cy + st.by * 0.3 - 2]], { closed: false, w: 0.6, c: 'mid' }));
      if (i === 0 && j === 0) p.push(P.text(cx + 2, cy, st.system === 'wood' ? isRoof ? 'PREFAB TRUSSES @ 24" OC' : `${st.system === 'wood' ? 'I-JOISTS' : 'JOISTS'} @ 16" OC` : 'JOISTS + DECK', { h: 3.8, c: 'mid' }));
    }
    for (let i = 0; i <= st.nx; i++) for (let j = 0; j <= st.ny; j++) p.push(P.rect(i * st.bx - 0.9, j * st.by - 0.9, 1.8, 1.8, { fill: 'ink', w: 0.5 }));
    p.push(...outerDims(W, D));
    finish(sc, isRoof ? 'Roof framing plan' : `${lvlName(lv)} floor framing plan`);
    const col = new Column(RIGHT.x, 40, RIGHT.w, 12);
    col.table('Typical members', ['Member', 'Size'], [['Girder / beam', st.beam], ['Column', st.col], ['Bay size', `${st.bx.toFixed(1)}' x ${st.by.toFixed(1)}'`], ['Floor dead load', `${st.floorDL} psf`], ['Floor live load', `${st.floorLL} psf`], ['Roof dead / live', `${st.roofDL} / 20 psf`]], { rh: 9.4, fs: 5 });
    sc.sh.add(col.prims); out.push(sc.sh);
  }
  const sh = new Sheet('structural', 'S-301', 'Structural general notes and design criteria');
  const ct = CONSTRUCTION_TYPES[ctx.project.construction];
  const c = new Column(40, 40, 440, 12);
  c.notes('Design criteria', [`Governing code: ${JURISDICTIONS[ctx.project.jurisdiction]?.codes || 'IBC as adopted'}; loads per ASCE 7.`, `Risk category II. Occupancy ${ctx.project.occupancy}. Construction ${ct.name}.`, 'Wind and seismic parameters (Vult, SDS, SD1, site class) to be established from the site-specific geotechnical report and ASCE 7 hazard tool.', `Floor live load ${st.floorLL} psf; roof live load 20 psf; partitions 15 psf where applicable.`, `Lateral system: ${st.system === 'wood' ? 'plywood shear walls and diaphragms' : st.system === 'steel' ? 'braced frames or moment frames at the column grid' : 'reinforced masonry shear walls'}.`]);
  c.notes('Materials', [st.system === 'wood' ? 'Sawn lumber Douglas fir-larch No. 2; glulam 24F-V4.' : 'Structural steel ASTM A992; HSS ASTM A500 Gr. C.', 'Concrete f\'c = 3,000 psi (footings), 4,000 psi (slabs on deck).', 'Reinforcing ASTM A615 Gr. 60.']);
  const d = new Column(500, 40, 436, 12);
  d.notes('Preliminary design note', ['Member sizes and footings are generated by rule of thumb and are for coordination only.', 'The structural engineer of record shall perform and stamp all calculations before permit submittal.']);
  sh.add([...c.prims, ...d.prims]); out.push(sh);
  return out;
}

// ================= Mechanical =================
export function computeMech(ctx) {
  const { layout, project, an } = ctx; const occ = OCCUPANCIES[project.occupancy];
  const gross = layout.floors.reduce((s, f) => s + f.W * f.D, 0);
  const tons = Math.max(2, Math.ceil(gross / occ.sfTon));
  const dwelling = project.occupancy === 'R-3';
  const n = Math.max(1, Math.ceil(tons / 20));
  const per = Math.max(2, Math.ceil(tons / n / 2.5) * 2.5);
  const oaTot = an.load.total * occ.oa[0] + gross * occ.oa[1];
  const prefix = dwelling ? 'AHU' : 'RTU';
  const amps = (per * 1500) / (1.732 * 208);
  const units = Array.from({ length: n }, (_, i) => ({ tag: `${prefix}-${i + 1}`, tons: per, cfm: per * 400, oa: Math.ceil(oaTot / n / 50) * 50, mbh: Math.ceil((25 * gross) / n / 1000 / 10) * 10, mca: Math.round(amps * 1.25 * 10) / 10, mocp: nextBrk(amps * 1.75), x: ((i + 0.5) * layout.W) / n, y: layout.D * 0.28 }));
  const grilles = [];
  for (const fl of layout.floors) for (const r of fl.rooms.filter(nonCore)) {
    const cnt = Math.max(1, Math.round((r.w * r.h) / 150)); const cfm = Math.ceil(((r.w * r.h) * 1.0) / cnt / 5) * 5;
    const cols = Math.max(1, Math.round(Math.sqrt(cnt * (r.w / r.h)))); const rows = Math.ceil(cnt / cols);
    for (let k = 0; k < cnt; k++) grilles.push({ level: fl.level, roomId: r.id, cfm, x: r.x + ((k % cols) + 0.5) * (r.w / cols), y: r.y + (Math.floor(k / cols) + 0.5) * (r.h / rows) });
  }
  const neck = (cfm) => (cfm <= 100 ? '6"' : cfm <= 160 ? '8"' : cfm <= 250 ? '10"' : cfm <= 360 ? '12"' : '14"');
  return { tons, n, per, units, grilles, neck, oaTot: Math.round(oaTot), dwelling, gross };
}

export function mechanicalSheets(ctx) {
  const { layout } = ctx; const m = ctx.mech; const out = [];
  for (const fl of layout.floors) {
    const sc = planScaffold('mechanical', `M-1${String(fl.level).padStart(2, '0')}`, `${lvlName(fl.level)} floor HVAC plan`, fl, ctx);
    const p = sc.prims; const cy = fl.corridor ? fl.corridor.y + fl.corridor.h / 2 : null;
    if (cy != null) {
      p.push(P.rect(3, cy - 1.2, layout.W - 6, 2.4, { w: 1.4, c: 'orange', fill: '#fbeed9' }), P.text(layout.W / 2, cy + 0.9, 'SA MAIN 24x12', { h: 3.4, anchor: 'middle', c: 'orange', bold: true }));
    }
    for (const g of m.grilles.filter((q) => q.level === fl.level)) {
      const door = fl.doors.find((d) => d.roomId === g.roomId && d.kind === 'int');
      if (cy != null && door) p.push(P.poly([[g.x, cy], [g.x, g.y]], { closed: false, w: 1.6, c: 'orange' }));
      p.push(P.rect(g.x - 1, g.y - 1, 2, 2, { fill: 'paper', w: 0.8, c: 'orange' }), P.line(g.x - 1, g.y - 1, g.x + 1, g.y + 1, { w: 0.5, c: 'orange' }), P.line(g.x - 1, g.y + 1, g.x + 1, g.y - 1, { w: 0.5, c: 'orange' }), P.text(g.x + 1.4, g.y - 1.2, `${g.cfm}`, { h: 2.8, c: 'orange' }));
    }
    for (const r of fl.rooms.filter((q) => q.type === 'restroom')) p.push(P.circ(r.x + r.w / 2, r.y + r.h * 0.3, 1.4, { w: 0.9, c: 'blue' }), P.text(r.x + r.w / 2, r.y + r.h * 0.3 + 0.9, 'EF', { h: 2.6, anchor: 'middle', c: 'blue' }));
    const mech = fl.rooms.find((r) => r.type === 'mechanical');
    if (mech) p.push(P.rect(mech.x + 1, mech.y + 1, mech.w - 2, 4, { w: 1, c: 'orange', dash: '2 1' }), P.text(mech.x + mech.w / 2, mech.y + 8, 'SA / RA SHAFT', { h: 3, anchor: 'middle', c: 'orange', rot: 0 }));
    finish(sc, `${lvlName(fl.level)} floor HVAC plan`);
    const col = new Column(RIGHT.x, 40, RIGHT.w, 12);
    col.table('Legend', ['Symbol', 'Description'], [['Box with X', 'Supply diffuser (cfm shown)'], ['Orange duct', 'Supply air'], ['EF', 'Exhaust fan']], { rh: 9, fs: 5 });
    col.notes('Notes', ['Return air via ceiling plenum with transfer grilles at rated walls (fire dampers as required).', 'Locate thermostats at 48 in AFF; ADA reach compliant.', 'Duct sizes shown are preliminary and require balancing calculations by the mechanical engineer.'], { fs: 4.8 });
    sc.sh.add(col.prims); out.push(sc.sh);
  }
  const sh = new Sheet('mechanical', 'M-201', 'Mechanical schedules');
  const c = new Column(40, 40, 600, 14);
  c.table('Packaged equipment schedule', ['Tag', 'Cooling (tons)', 'Supply (cfm)', 'Min OA (cfm)', 'Heat (MBH)', 'MCA', 'MOCP', 'Voltage'], m.units.map((u) => [u.tag, u.tons, u.cfm, u.oa, u.mbh, u.mca, u.mocp, '208V/3ph']), { rh: 10, fs: 5.2 });
  const counts = new Map(); m.grilles.forEach((g) => counts.set(g.cfm, (counts.get(g.cfm) || 0) + 1));
  c.table('Supply diffuser schedule', ['Type', 'Neck', 'CFM', 'Qty'], [...counts].sort((a, b) => a[0] - b[0]).map(([cfm, q]) => ['SD-1 (24x24 louvered face)', m.neck(cfm), cfm, q]), { rh: 9, fs: 5 });
  c.table('Ventilation summary', ['Item', 'Value'], [['Total cooling', `${m.tons} tons (${Math.round(m.gross / m.tons)} sf/ton)`], ['Outdoor air', `${m.oaTot} cfm (ASHRAE 62.1 / CMC Table 402.1)`], ['Supply air', `${m.units.reduce((s, u) => s + u.cfm, 0)} cfm`]], { rh: 9.4, fs: 5.2 });
  const d = new Column(660, 40, 276, 12);
  d.notes('Mechanical notes', ['Equipment selections are preliminary load estimates (sf/ton method). Perform a full load calculation (ACCA Manual N / ASHRAE) before release.', 'Provide economizer and demand-controlled ventilation as required by the energy code.', 'Seismic restraint for all equipment per ASCE 7 Chapter 13.']);
  sh.add([...c.prims, ...d.prims]); out.push(sh);
  return out;
}

// ================= Electrical =================
export function computeElec(ctx) {
  const { layout, project } = ctx; const occ = OCCUPANCIES[project.occupancy];
  const fixtures = []; const outlets = []; let lightW = 0;
  for (const fl of layout.floors) for (const r of fl.rooms) {
    const area = r.w * r.h; const core = ROOM_TYPES[r.type].core;
    const lpd = core ? 0.5 : occ.lpd; const n = Math.max(1, Math.round((area * lpd) / 36));
    const cols = Math.max(1, Math.round(Math.sqrt(n * (r.w / r.h)))); const rows = Math.ceil(n / cols);
    for (let k = 0; k < n; k++) fixtures.push({ level: fl.level, roomId: r.id, x: r.x + ((k % cols) + 0.5) * (r.w / cols), y: r.y + (Math.floor(k / cols) + 0.5) * (r.h / rows), emerg: k === 0 });
    lightW += n * 36;
    const per = 2 * (r.w + r.h); const nOut = core ? 1 : Math.max(2, Math.round(per / 12));
    for (let k = 0; k < nOut; k++) { const t = (k + 0.5) / nOut * per; let x; let y;
      if (t < r.w) { x = r.x + t; y = r.y + 0.8; } else if (t < r.w + r.h) { x = r.x + r.w - 0.8; y = r.y + (t - r.w); } else if (t < 2 * r.w + r.h) { x = r.x + r.w - (t - r.w - r.h); y = r.y + r.h - 0.8; } else { x = r.x + 0.8; y = r.y + r.h - (t - 2 * r.w - r.h); }
      outlets.push({ level: fl.level, roomId: r.id, x, y }); }
  }
  const gross = layout.floors.reduce((s, f) => s + f.W * f.D, 0);
  const lightVA = lightW; const recVA = Math.round(Math.max(outlets.length * 180, gross * occ.recVA * 0.5));
  const hvacVA = ctx.mech.units.reduce((s, u) => s + u.tons * 1500, 0);
  const elevVA = layout.stories > 1 ? 15000 : 0; const miscVA = Math.round(gross * 0.5);
  const lightCkts = Math.ceil((lightVA * 1.25) / 1920); const recCkts = Math.ceil(outlets.length / 10);
  const dem = lightVA * 1.25 + (recVA <= 10000 ? recVA : 10000 + (recVA - 10000) * 0.5) + hvacVA + elevVA + miscVA;
  const amps = dem / (1.732 * 208); const main = nextBrk(amps * 1.25);
  // build panel schedule with phases A/B/C
  const rows = []; let a = 0; const phase = [0, 0, 0];
  const addCkt = (desc, va, brk) => { const ph = phase.indexOf(Math.min(...phase)); phase[ph] += va; rows.push({ desc, va: Math.round(va), brk, phase: 'ABC'[ph] }); };
  for (let i = 0; i < lightCkts; i++) addCkt(`Lighting circuit ${i + 1}`, lightVA / lightCkts, 20);
  for (let i = 0; i < recCkts; i++) addCkt(`Receptacles circuit ${i + 1}`, Math.min(1800, recVA / recCkts), 20);
  ctx.mech.units.forEach((u) => addCkt(`${u.tag} disconnect`, u.tons * 1500, u.mocp));
  if (elevVA) addCkt('Elevator', elevVA, 60);
  addCkt('Exit/emergency lighting', 600, 20); addCkt('Fire alarm panel', 500, 20); addCkt('Data / telecom', 1800, 20);
  void a;
  return { fixtures, outlets, lightVA, recVA, hvacVA, elevVA, miscVA, demand: Math.round(dem), amps: Math.round(amps), main, rows, lightCkts, recCkts, phase: phase.map(Math.round), gross };
}

export function electricalSheets(ctx) {
  const { layout } = ctx; const e = ctx.elec; const out = [];
  for (const fl of layout.floors) {
    const sc = planScaffold('electrical', `E-1${String(fl.level).padStart(2, '0')}`, `${lvlName(fl.level)} floor lighting plan`, fl, ctx);
    const p = sc.prims;
    for (const f of e.fixtures.filter((q) => q.level === fl.level)) {
      p.push(P.rect(f.x - 2, f.y - 1, 4, 2, { fill: 'paper', w: 0.8, c: 'orange' }), P.line(f.x - 2, f.y - 1, f.x + 2, f.y + 1, { w: 0.4, c: 'orange' }));
      if (f.emerg) p.push(P.text(f.x, f.y + 4, 'E', { h: 2.8, anchor: 'middle', c: 'red', bold: true }));
    }
    for (const d of fl.doors.filter((q) => q.kind === 'int')) p.push(P.text(d.x + 2.4, d.y + (d.side === 'N' ? 4 : -2.4), '$', { h: 3.4, bold: true }));
    for (const d of fl.doors.filter((q) => q.exit)) p.push(P.circ(d.x, d.y + (d.side === 'S' ? -3 : 3), 1, { fill: 'green', w: 0.4, c: 'green' }));
    finish(sc, `${lvlName(fl.level)} floor lighting plan`);
    const col = new Column(RIGHT.x, 40, RIGHT.w, 12);
    col.table('Legend', ['Symbol', 'Description'], [['2x4 box', '2x4 LED troffer, 36 W'], ['E', 'Emergency battery pack'], ['$', 'Occupancy sensor switch'], ['Green dot', 'LED exit sign']], { rh: 9, fs: 5 });
    col.table('Level summary', ['Item', 'Value'], [['Fixtures', e.fixtures.filter((q) => q.level === fl.level).length], ['Connected load', `${e.fixtures.filter((q) => q.level === fl.level).length * 36} W`]], { rh: 9, fs: 5 });
    col.notes('Notes', ['Provide occupancy sensors and daylight controls per the energy code.', 'Exit signs and egress lighting on emergency circuit with 90-minute battery backup.'], { fs: 4.8 });
    sc.sh.add(col.prims); out.push(sc.sh);
  }
  for (const fl of layout.floors) {
    const sc = planScaffold('electrical', `E-2${String(fl.level).padStart(2, '0')}`, `${lvlName(fl.level)} floor power plan`, fl, ctx);
    const p = sc.prims;
    for (const o of e.outlets.filter((q) => q.level === fl.level)) p.push(P.circ(o.x, o.y, 0.8, { fill: 'paper', w: 0.7, c: 'magenta' }), P.line(o.x - 0.8, o.y, o.x + 0.8, o.y, { w: 0.5, c: 'magenta' }));
    const room = fl.rooms.find((r) => r.type === 'electrical');
    if (room) p.push(P.rect(room.x + 1, room.y + 1, 3, 4, { fill: '#e8e3d0', w: 1.4, c: 'red' }), P.text(room.x + 2.5, room.y + 7.5, fl.level === 1 ? 'MSB / LP-1' : `LP-${fl.level}`, { h: 3, anchor: 'middle', bold: true }));
    finish(sc, `${lvlName(fl.level)} floor power plan`);
    const col = new Column(RIGHT.x, 40, RIGHT.w, 12);
    col.table('Legend', ['Symbol', 'Description'], [['Circle with bar', 'Duplex receptacle, 20 A'], ['Panel box', 'Panelboard / switchboard']], { rh: 9, fs: 5 });
    col.notes('Notes', ['Ground-fault protection at restrooms, kitchens and exterior receptacles (NEC 210.8).', 'Receptacle spacing 12 ft maximum on walls where required.'], { fs: 4.8 });
    sc.sh.add(col.prims); out.push(sc.sh);
  }
  const sh = new Sheet('electrical', 'E-301', 'Panel schedule and load calculation');
  const c = new Column(40, 40, 560, 14);
  c.table('Panel LP-1 (208Y/120 V, 3 phase, 4 wire)', ['Ckt', 'Description', 'Load (VA)', 'Breaker', 'Phase'], e.rows.map((r, i) => [i + 1, r.desc, r.va, `${r.brk} A / ${r.brk >= 60 ? '3P' : '1P'}`, r.phase]), { rh: 8.8, fs: 5 });
  c.table('Phase balance', ['Phase', 'Load (VA)'], [['A', e.phase[0]], ['B', e.phase[1]], ['C', e.phase[2]]], { rh: 9, fs: 5 });
  const d = new Column(620, 40, 316, 12);
  d.table('Service load calculation (NEC 220)', ['Load', 'VA'], [['Lighting x 125%', Math.round(e.lightVA * 1.25)], ['Receptacles (first 10 kVA at 100%, remainder at 50%)', e.recVA <= 10000 ? e.recVA : 10000 + Math.round((e.recVA - 10000) * 0.5)], ['HVAC', e.hvacVA], ['Elevator', e.elevVA], ['Misc.', e.miscVA], ['Demand load', e.demand], ['Service current at 208 V', `${e.amps} A`], ['Main breaker (125%)', `${e.main} A`]], { rh: 9.4, fs: 5 });
  d.notes('Notes', ['Preliminary load calculation. The electrical engineer shall verify demand factors and utility requirements.', 'Provide surge protection and ground-fault protection of equipment where required by NEC 215.10 / 230.95.']);
  sh.add([...c.prims, ...d.prims]); out.push(sh);

  const sl = new Sheet('electrical', 'E-401', 'Single-line diagram');
  const box = (x, y, w, h, l1, l2) => [P.rect(x, y, w, h, { w: 1.4, fill: 'paper' }), P.text(x + w / 2, y + h / 2 - 1, l1, { h: 7, anchor: 'middle', bold: true }), ...(l2 ? [P.text(x + w / 2, y + h / 2 + 8, l2, { h: 5.6, anchor: 'middle', c: 'mid' })] : [])];
  const prims = [
    ...box(60, 60, 150, 44, 'UTILITY SERVICE', '208Y/120 V 3-phase'), P.line(135, 104, 135, 150, { w: 2 }),
    ...box(60, 150, 150, 44, 'METER', ''), P.line(135, 194, 135, 240, { w: 2 }),
    ...box(40, 240, 190, 60, `MSB ${e.main} A`, '208Y/120 V 3-phase 4-wire'), P.text(150, 222, `${feeder(e.main)} Cu per phase (preliminary)`, { h: 5.4, c: 'mid' }),
  ];
  const branches = [['LP-1', `${nextBrk(e.amps * 0.35)} A`, 'Lighting / receptacle'], ...ctx.mech.units.map((u) => [u.tag, `${u.mocp} A`, `${u.tons} ton`]), ...(e.elevVA ? [['ELEV', '60 A', 'Elevator']] : [])];
  prims.push(P.line(40, 300, 40, 330, { w: 2 }), P.line(40, 330, 40 + Math.max(0, branches.length - 1) * 170 + 70, 330, { w: 2 }));
  branches.forEach((b, i) => { const x = 40 + i * 170; prims.push(P.line(x + 70, 330, x + 70, 360, { w: 2 }), ...box(x - 5, 360, 150, 46, b[0], `${b[1]} - ${b[2]}`)); });
  sl.add(prims);
  const notes = new Column(700, 60, 236, 12); notes.notes('Notes', ['Feeder and breaker sizes are preliminary and for coordination.', 'Coordinate available fault current and AIC ratings with the serving utility.']);
  sl.add(notes.prims);
  out.push(sl);
  return out;
}

// ================= Plumbing =================
export function computePlumb(ctx) {
  const pf = ctx.an.plumbing; const dwelling = pf.dwelling;
  const rows = [];
  if (!dwelling) {
    rows.push(['WC-1', 'Water closet, flush valve, 1.28 gpf', pf.wcM + pf.wcF, 10, 4]);
    if (pf.urinalsM) rows.push(['U-1', 'Urinal, 0.125 gpf', pf.urinalsM, 5, 2]);
    rows.push(['L-1', 'Lavatory, wall hung, sensor faucet', pf.lavM + pf.lavF, 2, 1], ['DF-1', 'Drinking fountain (hi-lo)', pf.df, 0.5, 0.5], ['SS-1', 'Service sink', pf.serviceSink, 3, 3]);
  } else {
    const baths = ctx.layout.floors.flatMap((f) => f.rooms).filter((r) => r.type === 'bath').length || 1; const kit = ctx.layout.floors.flatMap((f) => f.rooms).filter((r) => r.type === 'kitchen').length || 1;
    rows.push(['WC-1', 'Water closet, 1.28 gpf', baths, 2.5, 3], ['L-1', 'Lavatory', baths, 1, 1], ['SH-1', 'Shower / tub combination', baths, 2, 2], ['KS-1', 'Kitchen sink', kit, 1.4, 2], ['WH-1', 'Water heater (tankless)', 1, 0, 0], ['HB-1', 'Hose bibb', 2, 2.5, 0]);
  }
  const wsfu = rows.reduce((s, r) => s + r[2] * r[3], 0); const dfu = rows.reduce((s, r) => s + r[2] * r[4], 0);
  const gpm = Math.round(8.6 * Math.sqrt(wsfu));
  const svc = gpm <= 20 ? '1"' : gpm <= 35 ? '1-1/4"' : gpm <= 50 ? '1-1/2"' : gpm <= 80 ? '2"' : gpm <= 140 ? '2-1/2"' : '3"';
  const drain = dfu <= 216 ? '4"' : dfu <= 720 ? '6"' : '8"';
  return { rows, wsfu: Math.round(wsfu * 10) / 10, dfu: Math.round(dfu), gpm, svc, drain, dwelling };
}

export function plumbingSheets(ctx) {
  const { layout, an } = ctx; const pl = ctx.plumb; const out = [];
  const pf = an.plumbing;
  for (const fl of layout.floors) {
    const sc = planScaffold('plumbing', `P-1${String(fl.level).padStart(2, '0')}`, `${lvlName(fl.level)} floor plumbing plan`, fl, ctx);
    const p = sc.prims; let iM = 0; let iF = 0;
    for (const r of fl.rooms) {
      if (r.type === 'restroom') {
        const isMen = /men'?s|male/i.test(r.name) && !/wom/i.test(r.name);
        const wc = isMen ? pf.wcM : pf.wcF; const ur = isMen ? pf.urinalsM : 0; const lv = isMen ? pf.lavM : pf.lavF;
        const fit = Math.max(1, Math.floor((r.w - 2) / 3.2));
        for (let k = 0; k < Math.min(wc, fit); k++) { const x = r.x + 1 + k * 3.2; p.push(P.rect(x, r.y + 0.6, 2.8, 4.4, { w: 0.5, c: 'mid' }), P.rect(x + 0.7, r.y + 1.2, 1.4, 2.2, { fill: 'paper', w: 0.9, c: 'blue' })); }
        for (let k = 0; k < Math.min(ur, 2); k++) p.push(P.rect(r.x + r.w - 1.6, r.y + r.h * 0.5 + k * 2, 0.9, 1.4, { fill: 'paper', w: 0.9, c: 'blue' }));
        for (let k = 0; k < Math.min(lv, Math.max(1, Math.floor((r.w - 1) / 2.4))); k++) p.push(P.rect(r.x + 1 + k * 2.4, r.y + r.h - 2.4, 1.8, 1.4, { fill: 'paper', w: 0.9, c: 'blue' }));
        p.push(P.line(r.x + 0.5, r.y + r.h * 0.45, r.x + r.w - 0.5, r.y + r.h * 0.45, { w: 0.9, c: 'green', dash: '3 1' }), P.line(r.x + 0.5, r.y + r.h - 3.2, r.x + r.w - 0.5, r.y + r.h - 3.2, { w: 0.9, c: 'blue' }));
        void iM; void iF;
      } else if (['bath', 'kitchen'].includes(r.type)) {
        p.push(P.rect(r.x + 1, r.y + 1, 2, 1.4, { fill: 'paper', w: 0.9, c: 'blue' }), P.rect(r.x + 4, r.y + 1, 1.8, 2.4, { fill: 'paper', w: 0.9, c: 'blue' }));
      }
    }
    const stairCore = fl.rooms.find((r) => r.type === 'mechanical') || fl.rooms[0];
    p.push(P.circ(stairCore.x + 2, stairCore.y + stairCore.h - 2, 1.4, { fill: 'blue', w: 0.5, c: 'blue' }), P.text(stairCore.x + 4, stairCore.y + stairCore.h - 1.2, 'WH', { h: 3, bold: true, c: 'blue' }));
    finish(sc, `${lvlName(fl.level)} floor plumbing plan`);
    const col = new Column(RIGHT.x, 40, RIGHT.w, 12);
    col.table('Legend', ['Line', 'Description'], [['Blue', 'Domestic cold / hot water'], ['Green dashed', 'Sanitary waste and vent'], ['WH', 'Water heater']], { rh: 9, fs: 5 });
    col.notes('Notes', ['Fixtures meet the accessibility standards; provide clearances per CBC 11B-603 / ICC A117.1.', 'Cleanouts at base of each stack and every 100 ft of horizontal drain.', 'Water-conserving fixtures per CALGreen where adopted.'], { fs: 4.8 });
    sc.sh.add(col.prims); out.push(sc.sh);
  }
  const sh = new Sheet('plumbing', 'P-201', 'Fixture schedule and riser diagrams');
  const c = new Column(40, 40, 500, 14);
  c.table('Plumbing fixture schedule', ['Mark', 'Description', 'Qty', 'WSFU', 'DFU'], pl.rows, { rh: 10, fs: 5.2 });
  c.table('Sizing summary', ['Item', 'Value'], [['Total WSFU', pl.wsfu], ['Peak demand', `${pl.gpm} gpm (estimated)`], ['Water service', pl.svc], ['Total DFU', pl.dfu], ['Building drain', pl.drain], ['Basis', an.plumbing.rule]], { rh: 9.6, fs: 5.2 });
  c.notes('Notes', ['Water service and drain sizes are preliminary. Size per IPC / CPC Chapter 6 and 7 pressure and slope calculations.', 'Provide backflow prevention at the domestic service and irrigation.']);
  // riser
  const r = []; const baseY = 280; const lvH = 60; const x0 = 100;
  r.push(P.line(x0 - 60, baseY, x0 + 200, baseY, { w: 1.4 }), P.text(x0 - 58, baseY + 10, 'SEWER', { h: 5.6 }), P.text(x0 - 58, baseY - 4, 'WATER', { h: 5.6, c: 'blue' }));
  r.push(P.line(x0, baseY, x0, baseY - lvH * layout.stories - 14, { w: 2, c: 'green' }), P.line(x0 + 28, baseY - 8, x0 + 28, baseY - lvH * layout.stories - 6, { w: 2, c: 'blue' }), P.line(x0 + 42, baseY - 8, x0 + 42, baseY - lvH * layout.stories - 6, { w: 2, c: 'red' }));
  r.push(P.text(x0, baseY - lvH * layout.stories - 18, 'SANITARY STACK / VENT THRU ROOF', { h: 5, anchor: 'middle' }), P.text(x0 + 28, baseY - lvH * layout.stories - 10, 'CW', { h: 5, anchor: 'middle', c: 'blue' }), P.text(x0 + 42, baseY - lvH * layout.stories - 10, 'HW', { h: 5, anchor: 'middle', c: 'red' }));
  for (let i = 1; i <= layout.stories; i++) { const y = baseY - i * lvH + 10; r.push(P.line(x0 - 30, y, x0 + 160, y, { w: 0.6, c: 'light', dash: '4 2' }), P.text(x0 + 165, y + 1.4, `LEVEL ${i}`, { h: 5 }), P.rect(x0 - 26, y - 14, 12, 14, { fill: 'paper', w: 1 }), P.text(x0 - 20, y - 4, 'WC', { h: 4.4, anchor: 'middle' }), P.rect(x0 + 56, y - 10, 12, 10, { fill: 'paper', w: 1 }), P.text(x0 + 62, y - 3, 'L', { h: 4.4, anchor: 'middle' }), P.line(x0 - 14, y - 6, x0, y - 6, { w: 1.2, c: 'green' }), P.line(x0 + 42, y - 4, x0 + 56, y - 4, { w: 1.2, c: 'blue' })); }
  r.push(P.circ(x0 + 20, baseY - 10, 3.4, { fill: 'paper', w: 1.2 }), P.text(x0 + 20, baseY - 4, 'CO', { h: 4, anchor: 'middle' }), P.text(x0 + 28, baseY + 20, 'METER + BACKFLOW PREVENTER', { h: 5, anchor: 'middle', c: 'blue' }));
  const vp = sh.view(r, 330, 300, { x: 560, y: 90, w: 380, h: 330 }, { scale: ['NOT TO SCALE', 1.12] });
  sh.add(viewTitle(560, 56, '1', 'Domestic water and waste riser diagram', vp.label));
  sh.add([...c.prims]);
  out.push(sh);
  return out;
}

// ================= Title 24 / energy =================
export function title24Sheets(ctx) {
  const { project, layout, an } = ctx; const out = [];
  const occ = OCCUPANCIES[project.occupancy]; const dwelling = occ.dwelling && project.occupancy === 'R-3';
  const sh = new Sheet('title24', 'T24-001', dwelling ? 'Energy compliance summary (low-rise residential)' : 'Energy compliance summary (nonresidential)');
  const gross = ctx.mech.gross; const e = ctx.elec;
  const c = new Column(40, 40, 520, 14);
  c.table('Project energy data', ['Item', 'Value'], [['Climate zone', `CEC CZ ${project.climateZone}`], ['Compliance approach', 'Prescriptive (performance as alternate)'], ['Conditioned floor area', `${Math.round(gross).toLocaleString()} sf`], ['Stories', project.stories], ['Occupancy', occ.name], ['Mechanical system', `${ctx.mech.n} x ${ctx.mech.per} ton ${ctx.mech.dwelling ? 'split systems' : 'packaged rooftop units'}`], ['Water heating', dwelling ? 'Tankless gas / heat pump water heater' : 'Heat pump water heater (per 2022+ prescriptive)']], { rh: 10, fs: 5.4 });
  c.table('Lighting power summary (Section 140.6)', ['Item', 'Value'], [['Installed interior lighting', `${e.lightVA.toLocaleString()} W`], ['Installed LPD', `${(e.lightVA / gross).toFixed(2)} W/sf`], ['Design target LPD', `${occ.lpd.toFixed(2)} W/sf`], ['Status (design target)', e.lightVA / gross <= occ.lpd * 1.05 ? 'Within target' : 'Review']], { rh: 10, fs: 5.4 });
  c.table('Mandatory and prescriptive measures', ['Measure', 'Section'], [['Envelope insulation and fenestration', '140.3'], ['Cool roof', '140.3(a)1'], ['HVAC efficiency and economizer', '140.4'], ['Indoor lighting controls', '130.1 / 140.6'], ['Solar PV and battery', '140.10'], ['Electric-ready / EV capable parking', 'CALGreen 5.106.5.3']], { rh: 9.6, fs: 5.2 });
  const d = new Column(580, 40, 356, 12);
  d.table('Compliance documents', ['Form', 'Purpose'], dwelling ? [['CF1R', 'Certificate of Compliance (low-rise)'], ['CF2R', 'Certificate of Installation'], ['CF3R', 'Certificate of Verification']] : [['NRCC-PRF-E', 'Project summary and certificate'], ['NRCC-ENV-E', 'Envelope'], ['NRCC-LTI-E', 'Indoor lighting'], ['NRCC-MCH-E', 'Mechanical'], ['NRCC-PLB-E', 'Plumbing'], ['NRCC-SRA-E / PV', 'Solar ready and PV']], { rh: 9.6, fs: 5.2 });
  d.notes('Notes', ['Values are planning-level. Run the CEC-approved compliance software to generate the registered documents.', 'Forms listed follow the current edition of the nonresidential and low-rise residential standards; confirm the form set required by the building department.', 'Place the registered Certificate of Compliance on the plans per Section 10-103.']);
  sh.add([...c.prims, ...d.prims]); out.push(sh);
  void layout; void an;
  return out;
}
