import { ROOM_TYPES, OCCUPANCIES, CORE_ORDER } from './catalog.js';
import { normalizeRoom, defaultProgram } from './project.js';
import { plumbingFixtures } from './codes.js';

const snap = (v, g = 0.5) => Math.round(v / g) * g;
const CORE_MIN_W = { stair: 10, elevator: 8, restroom: 12, mechanical: 10, electrical: 8 };
let restroomMinW = 12;

/**
 * Turn the project program into stacked floor plans.
 * Layout: a central corridor with a band of rooms on each side. Core rooms
 * (stair, elevator, restrooms, mechanical, electrical) get a fixed position
 * so they stack from floor to floor.
 */
export function buildLayout(project) {
  const occ = OCCUPANCIES[project.occupancy];
  const stories = project.stories;
  const dwelling = occ.dwelling && project.occupancy === 'R-3';
  let program = (project.program.length ? project.program : defaultProgram(project.occupancy, project.totalArea, stories)).map(normalizeRoom);

  // Auto-added support spaces so the plan is buildable.
  const has = (t) => program.some((r) => r.type === t);
  const core = [];
  if (!dwelling) {
    if (stories > 1) core.push({ name: 'Stair', type: 'stair', area: 180 });
    if (stories > 1 && project.occupancy !== 'R-3') core.push({ name: 'Elevator', type: 'elevator', area: 64 });
    if (!has('restroom')) {
      core.push({ name: "Men's restroom", type: 'restroom', area: 130 });
      core.push({ name: "Women's restroom", type: 'restroom', area: 130 });
    }
    if (!has('mechanical')) core.push({ name: 'Mechanical', type: 'mechanical', area: 120 });
    if (!has('electrical')) core.push({ name: 'Electrical', type: 'electrical', area: 100 });
  }
  const userCore = program.filter((r) => ROOM_TYPES[r.type].core);
  const userRooms = program.filter((r) => !ROOM_TYPES[r.type].core);
  const autoLobby = !dwelling && !userRooms.some((r) => r.type === 'lobby') && project.occupancy !== 'S-1' && project.occupancy !== 'F-1';
  const coreRooms = [...core, ...userCore.map((r) => ({ name: r.name, type: r.type, area: r.area }))]
    .map((r, i) => ({ ...r, id: `core_${r.type}_${i}`, core: true }))
    .sort((a, b) => CORE_ORDER.indexOf(a.type) - CORE_ORDER.indexOf(b.type));

  // Distribute non-core rooms over floors.
  const floors = Array.from({ length: stories }, () => ({ rooms: [] }));
  const free = [];
  for (const r of userRooms) {
    if (r.floor && r.floor <= stories) floors[r.floor - 1].rooms.push(r);
    else free.push(r);
  }
  const floorArea = (f) => f.rooms.reduce((s, r) => s + r.area, 0);
  if (autoLobby) floors[0].rooms.push({ id: 'auto_lobby', name: 'Lobby', type: 'lobby', area: Math.min(450, Math.max(150, Math.round(project.totalArea / stories / 14 / 10) * 10)) });
  for (const r of free.sort((a, b) => b.area - a.area)) {
    const target = floors.reduce((m, f) => (floorArea(f) < floorArea(m) ? f : m), floors[0]);
    target.rooms.push(r);
  }
  const coreArea = coreRooms.reduce((s, r) => s + r.area, 0);
  const needs = floors.map((f) => (floorArea(f) + coreArea) * 1.15);
  const wanted = project.totalArea / stories;
  const A = Math.max(wanted, ...needs, 400);

  const olEst = Math.max(10, Math.round(project.totalArea / occ.lf));
  const fx = plumbingFixtures(project, { total: olEst });
  const perRoom = Math.max(fx.wcM || 1, fx.wcF || 1, fx.lavM || 1);
  restroomMinW = Math.max(12, Math.ceil(3.4 * perRoom + 3));
  let W; let D;
  if (project.footprint) { W = snap(project.footprint.width, 1); D = snap(project.footprint.depth, 1); }
  else {
    W = Math.max(20, Math.round(Math.sqrt(A * (dwelling ? 1.4 : 1.7))));
    D = Math.max(16, Math.round(A / W));
  }

  let out;
  let grown = false;
  for (let tries = 0; tries < 60; tries++) {
    out = floors.map((f, fi) => {
      const rooms = [...coreRooms.map((c) => ({ ...c, id: `${c.id}_L${fi + 1}` })), ...f.rooms.map((r) => ({ ...r }))];
      return layoutFloor(rooms, W, D, fi + 1, dwelling);
    });
    const ok = out.every((fl) => fl.rooms.every((r) => r.w >= 6));
    if (ok) break;
    W += 3; D += 1; grown = true;
  }
  const floorH = occ.dwelling ? 10 : 13;
  return { W, D, stories, floorH, floors: out, dwelling, grown };
}

function layoutFloor(rooms, W, D, level, dwelling) {
  const multi = rooms.length > 3;
  const cd = multi ? (dwelling ? 4 : 6) : 0;
  const bandD = (D - cd) / 2;
  const north = []; const south = [];
  const coreN = ['stair', 'elevator', 'mechanical', 'electrical'];
  const used = { n: 0, s: 0 };
  const rest = [];
  for (const r of rooms) {
    if (r.core) {
      if (coreN.includes(r.type)) { north.push(r); used.n += r.area; } else { south.push(r); used.s += r.area; }
    } else rest.push(r);
  }
  const lobbyIdx = rest.findIndex((r) => r.type === 'lobby');
  if (lobbyIdx >= 0) { const [l] = rest.splice(lobbyIdx, 1); south.push(l); used.s += l.area; }
  rest.sort((a, b) => b.area - a.area);
  for (const r of rest) { if (used.n <= used.s) { north.push(r); used.n += r.area; } else { south.push(r); used.s += r.area; } }
  // every band needs at least one flexible room to absorb width
  const flexOf = (l) => l.filter((r) => !r.core);
  for (const [a, b] of [[north, south], [south, north]]) {
    if (flexOf(a).length === 0) {
      const donors = flexOf(b);
      if (donors.length >= 2) { const d = donors[donors.length - 1]; b.splice(b.indexOf(d), 1); a.push(d); }
      else a.push({ id: `flex_${level}_${a === north ? 'n' : 's'}`, name: 'Flexible space', type: 'open_office', area: 300 });
    }
  }

  const placeBand = (list, y0, isNorth) => {
    if (!list.length) return [];
    const fixed = list.filter((r) => r.core);
    const flex = list.filter((r) => !r.core);
    let x = 0;
    const widths = new Map();
    let fixedW = 0;
    for (const r of fixed) { const w = Math.max(r.type === 'restroom' ? restroomMinW : (CORE_MIN_W[r.type] || 8), snap(r.area / bandD, 1)); widths.set(r.id, w); fixedW += w; }
    const flexArea = flex.reduce((s, r) => s + r.area, 0) || 1;
    const remain = Math.max(8 * flex.length, W - fixedW);
    for (const r of flex) widths.set(r.id, Math.max(8, snap((r.area / flexArea) * remain, 0.5)));
    const sum = [...widths.values()].reduce((a, b) => a + b, 0);
    const k = W / sum;
    const placed = [];
    list.forEach((r, i) => {
      let w = i === list.length - 1 ? W - x : snap(widths.get(r.id) * (r.core ? 1 : k), 0.5);
      if (!r.core) w = Math.max(6, w);
      if (i === list.length - 1) w = W - x;
      const room = {
        ...r, x, y: y0, w, h: bandD, band: isNorth ? 'N' : 'S',
        actualArea: Math.round(w * bandD),
      };
      placed.push(room);
      x += w;
    });
    return placed;
  };
  const nRooms = placeBand(north, 0, true);
  const sRooms = placeBand(south, bandD + cd, false);
  const all = [...nRooms, ...sRooms];
  all.forEach((r) => {
    r.sides = {
      N: r.band === 'N' ? 'ext' : (cd ? 'corr' : 'int'),
      S: r.band === 'S' ? 'ext' : (cd ? 'corr' : 'int'),
      W: r.x === 0 ? 'ext' : 'int',
      E: Math.abs(r.x + r.w - W) < 0.01 ? 'ext' : 'int',
    };
  });
  const corridor = cd ? { x: 0, y: bandD, w: W, h: cd } : null;
  const doors = []; const windows = [];
  for (const r of all) {
    // door to corridor (or shared wall when there is no corridor)
    const side = r.band === 'N' ? 'S' : 'N';
    const cx = r.x + r.w / 2;
    const dy = side === 'S' ? r.y + r.h : r.y;
    if (r.type !== 'elevator') doors.push({ roomId: r.id, x: snap(cx, 0.5), y: dy, side, w: r.type === 'stair' ? 3.5 : 3, kind: 'int', exit: r.type === 'stair' });
    // exterior door for lobby
    if (r.type === 'lobby' && level === 1) doors.push({ roomId: r.id, x: snap(cx, 0.5), y: r.y + r.h, side: 'S', w: 6, kind: 'ext', exit: true, double: true });
    // windows
    if (!ROOM_TYPES[r.type].core && r.type !== 'garage' || r.type === 'restroom') {
      if (ROOM_TYPES[r.type].core) continue;
      const wins = (len, fixedAxis, extSide, axis) => {
        const n = Math.floor(len / 9);
        for (let i = 0; i < n; i++) {
          const c = (axis === 'x' ? r.x : r.y) + ((i + 0.5) * len) / n;
          windows.push({ roomId: r.id, side: extSide, c: snap(c, 0.5), fixed: fixedAxis, w: r.type === 'bath' ? 2.5 : 4 });
        }
      };
      if (r.sides.N === 'ext') wins(r.w, r.y, 'N', 'x');
      if (r.sides.S === 'ext' && !(r.type === 'lobby' && level === 1)) wins(r.w, r.y + r.h, 'S', 'x');
      if (r.sides.W === 'ext') wins(r.h, r.x, 'W', 'y');
      if (r.sides.E === 'ext') wins(r.h, r.x + r.w, 'E', 'y');
    }
  }
  if (corridor) {
    const cy = corridor.y + cd / 2;
    doors.push({ roomId: 'corridor', x: 0, y: cy, side: 'W', w: 3.5, kind: 'ext', exit: true });
    doors.push({ roomId: 'corridor', x: W, y: cy, side: 'E', w: 3.5, kind: 'ext', exit: true });
  }
  return { level, rooms: all, corridor, doors, windows, W, D };
}

export function roomCenter(r) { return { x: r.x + r.w / 2, y: r.y + r.h / 2 }; }
