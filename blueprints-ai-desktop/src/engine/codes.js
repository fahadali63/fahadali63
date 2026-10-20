import { OCCUPANCIES, ROOM_TYPES, CONSTRUCTION_TYPES, JURISDICTIONS, LOCATION_FACTOR, COST_SPLIT } from './catalog.js';

const roomLF = (room, occ) => {
  const t = ROOM_TYPES[room.type];
  if (room.type === 'restroom' || room.type === 'stair' || room.type === 'elevator') return 0;
  if (occ.dwelling || ['bedroom', 'bath', 'living', 'garage'].includes(room.type)) return t.lf || occ.lf;
  return t.lf || occ.lf;
};

export function occupantLoad(layout, project) {
  const occ = OCCUPANCIES[project.occupancy];
  const perFloor = layout.floors.map((fl) => {
    const rooms = fl.rooms.map((r) => {
      const lf = roomLF(r, occ);
      const area = r.w * r.h;
      return { id: r.id, name: r.name, type: r.type, area: Math.round(area), lf, load: lf ? Math.ceil(area / lf) : 0 };
    });
    return { level: fl.level, rooms, total: rooms.reduce((s, r) => s + r.load, 0) };
  });
  return { perFloor, total: perFloor.reduce((s, f) => s + f.total, 0) };
}

export function requiredExits(load) {
  if (load <= 500) return load <= 49 ? 1 : 2;
  if (load <= 1000) return 3;
  return 4;
}

/** Exit access travel distance: farthest point in the room -> door -> corridor -> nearest exit. */
export function travelDistances(layout, project) {
  const occ = OCCUPANCIES[project.occupancy];
  const limit = occ.travel[project.sprinklered ? 1 : 0];
  const results = [];
  for (const fl of layout.floors) {
    const exits = fl.doors.filter((d) => d.exit);
    const half = fl.corridor ? fl.corridor.h / 2 : 0;
    const cy = fl.corridor ? fl.corridor.y + half : 0;
    for (const r of fl.rooms) {
      if (['stair', 'elevator'].includes(r.type)) continue;
      const door = fl.doors.find((d) => d.roomId === r.id && d.kind === 'int');
      if (!door) continue;
      const inside = Math.hypot(Math.max(door.x - r.x, r.x + r.w - door.x), Math.max(door.y - r.y, r.y + r.h - door.y));
      let best = Infinity;
      for (const e of exits) {
        if (e.roomId === r.id) { best = 0; continue; }
        let d;
        if (fl.corridor) {
          d = Math.abs(door.x - e.x) + half;
          if (e.side === 'S') d += fl.corridor.y + fl.corridor.h - cy + 8; // through the lobby to the street door
          else if (e.kind === 'int') d += 3; // into the stair enclosure
        } else d = Math.abs(door.x - e.x) + Math.abs(door.y - e.y);
        best = Math.min(best, d);
      }
      if (!isFinite(best)) best = 0;
      const total = inside + best;
      results.push({ level: fl.level, room: r.name, id: r.id, distance: Math.round(total), ok: total <= limit });
    }
  }
  return { limit, results, max: results.reduce((m, r) => Math.max(m, r.distance), 0), ok: results.every((r) => r.ok) };
}

export function sprinklerRequirement(project, layout) {
  const t = project.occupancy;
  const area = layout.W * layout.D;
  const total = project.totalArea;
  if (t.startsWith('R')) return { required: true, basis: t === 'R-3' ? 'CRC R313 / local amendment for new one- and two-family dwellings (confirm adoption)' : 'IBC 903.2.8 (Group R)' };
  if (t === 'A-2' || t === 'A-3') return { required: area > 5000 || total > 5000, basis: 'IBC 903.2.1 (fire area > 5,000 sf or occupant load >= 100)' };
  if (t === 'E') return { required: area > 12000, basis: 'IBC 903.2.3 (fire area > 12,000 sf)' };
  if (t === 'M') return { required: area > 12000 || layout.stories > 3, basis: 'IBC 903.2.7 (fire area > 12,000 sf or > 3 stories)' };
  if (t === 'S-1') return { required: area > 12000 || layout.stories > 3, basis: 'IBC 903.2.9 (fire area > 12,000 sf)' };
  if (t === 'F-1') return { required: area > 12000 || layout.stories > 3, basis: 'IBC 903.2.4 (fire area > 12,000 sf)' };
  return { required: false, basis: 'IBC 903.2 - Group B has no area-based trigger; sprinklers may be elected for design trade-offs (IBC 504.2, 506.3)' };
}

export function plumbingFixtures(project, load) {
  const t = project.occupancy;
  const ol = Math.max(load.total, 1);
  const split = (n) => Math.max(1, Math.ceil(n / 2));
  const lerp = (first, per1, firstN, per2) => (ol <= firstN ? Math.ceil(ol / per1) : Math.ceil(firstN / per1) + Math.ceil((ol - firstN) / per2));
  let wc; let lav; let df; let rule;
  switch (t) {
    case 'B': wc = lerp(0, 25, 50, 50); lav = lerp(0, 40, 80, 80); df = Math.ceil(ol / 100); rule = 'IPC Table 403.1, Business'; break;
    case 'M': wc = Math.ceil(ol / 500); lav = Math.ceil(ol / 750); df = Math.ceil(ol / 1000); rule = 'IPC Table 403.1, Mercantile'; break;
    case 'A-2': wc = Math.ceil(ol / 75); lav = Math.ceil(ol / 200); df = Math.ceil(ol / 500); rule = 'IPC Table 403.1, Restaurants'; break;
    case 'A-3': wc = Math.ceil(ol / 125); lav = Math.ceil(ol / 200); df = Math.ceil(ol / 500); rule = 'IPC Table 403.1, Assembly'; break;
    case 'E': wc = Math.ceil(ol / 50); lav = Math.ceil(ol / 50); df = Math.ceil(ol / 100); rule = 'IPC Table 403.1, Educational'; break;
    case 'S-1': case 'F-1': wc = Math.ceil(ol / 100); lav = Math.ceil(ol / 100); df = Math.ceil(ol / 400); rule = 'IPC Table 403.1, Factory / Storage'; break;
    default: wc = 0; lav = 0; df = 0; rule = 'IPC Table 403.1, Residential (per dwelling unit)';
  }
  if (OCCUPANCIES[t].dwelling) return { dwelling: true, rule, wcM: 0, wcF: 0, lavM: 0, lavF: 0, df: 0, urinalsM: 0, serviceSink: 0 };
  wc = Math.max(wc, 2); lav = Math.max(lav, 2);
  const urinalsM = ol > 30 && t !== 'E' ? Math.floor(split(wc) / 2) : 0;
  return { dwelling: false, rule, wcF: split(wc), wcM: Math.max(1, split(wc) - urinalsM), urinalsM, lavM: split(lav), lavF: split(lav), df: Math.max(df, 1), serviceSink: 1 };
}

export function codeAnalysis(project, layout) {
  const occ = OCCUPANCIES[project.occupancy];
  const load = occupantLoad(layout, project);
  const travel = travelDistances(layout, project);
  const spk = sprinklerRequirement(project, layout);
  const ct = CONSTRUCTION_TYPES[project.construction];
  const j = JURISDICTIONS[project.jurisdiction] || JURISDICTIONS.Other;
  const maxFloorLoad = Math.max(...load.perFloor.map((f) => f.total));
  const exitsReq = requiredExits(maxFloorLoad);
  const exitsProv = layout.floors[0].doors.filter((d) => d.exit).length;
  const items = [];
  const add = (code, section, topic, req, prov, status) => items.push({ code, section, topic, req, prov, status });
  add('IBC', '302.1', 'Occupancy classification', occ.name, occ.name, 'info');
  add('IBC', '602 / Table 601', 'Construction type', `${ct.name}: ${ct.desc}`, `${ct.name}; primary frame ${ct.frameHr}-hr`, 'info');
  add('IBC', '1004.5 / Table 1004.5', 'Occupant load', `Floor area / load factor (${occ.lf} sf/person typical)`, `${load.total} total; ${maxFloorLoad} max per floor`, 'info');
  add('IBC', '1006.3.4', 'Number of exits', `${exitsReq} per story`, `${exitsProv} on level 1`, exitsProv >= exitsReq ? 'pass' : 'fail');
  add('IBC', 'Table 1017.2', 'Exit access travel distance', `${travel.limit} ft max (${project.sprinklered ? 'sprinklered' : 'unsprinklered'})`, `${travel.max} ft max computed`, travel.ok ? 'pass' : 'fail');
  add('IBC', '1020.2', 'Corridor width', maxFloorLoad >= 50 ? '44 in min' : '36 in min', layout.floors[0].corridor ? `${layout.floors[0].corridor.h * 12} in` : 'Open plan', !layout.floors[0].corridor || layout.floors[0].corridor.h * 12 >= 44 ? 'pass' : 'fail');
  add('IBC', '903.2', 'Automatic sprinkler system', spk.required ? 'Required' : 'Not required by occupancy trigger', project.sprinklered ? 'Provided (NFPA 13)' : 'Not provided', spk.required && !project.sprinklered ? 'fail' : 'pass');
  add('NFPA', '10', 'Portable fire extinguishers', 'Travel distance <= 75 ft to an extinguisher', 'Cabinets located on egress plan', 'info');
  add('NFPA', '72', 'Fire alarm and detection', project.occupancy === 'B' && maxFloorLoad < 500 ? 'Manual fire alarm required when load >= 500 or >= 100 above/below exit level (IFC 907.2.2)' : 'Per IFC 907.2 for the occupancy', 'Pull stations, horn/strobes shown', 'info');
  add('ADA', '206 / 404', 'Accessible route and doors', '36 in min route; 32 in clear doors; 60 in turning space', 'Corridors >= 44 in, 3\'-0" doors', 'pass');
  add('ADA', '213 / 604', 'Toilet rooms', 'Accessible fixtures and clearances in each room', 'See plumbing and architectural plans', 'info');
  if (layout.stories > 1) add('IBC', '1104.4 / CBC 11B-206.2.3', 'Accessible route between stories', 'Elevator required for multi-story', layout.floors[0].rooms.some((r) => r.type === 'elevator') ? 'Elevator provided' : 'Not provided', layout.floors[0].rooms.some((r) => r.type === 'elevator') || project.occupancy === 'R-3' ? 'pass' : 'fail');
  if (layout.stories > 3 && ct.system === 'wood') add('IBC', 'Table 504.4', 'Allowable stories', 'Confirm height and story limits for the selected construction type', `${layout.stories} stories, ${ct.name}`, 'warn');
  if (j.title24) add('CA Title 24', 'Part 6', 'Energy efficiency standards', 'Prescriptive or performance compliance', 'See sheets T24-001 and T24-002', 'info');
  return { occupancy: occ.name, load, travel, sprinkler: spk, exitsReq, exitsProv, items, editions: j.codes, plumbing: plumbingFixtures(project, load) };
}

export function costEstimate(project, layout) {
  const occ = OCCUPANCIES[project.occupancy];
  const j = JURISDICTIONS[project.jurisdiction] || JURISDICTIONS.Other;
  const factor = LOCATION_FACTOR[j.state] ?? 1;
  const gross = layout.floors.reduce((s, f) => s + f.W * f.D, 0);
  const base = gross * occ.cost * factor;
  const lines = Object.entries(COST_SPLIT).map(([k, v]) => ({ division: k, amount: Math.round(base * v) }));
  const hard = lines.reduce((s, l) => s + l.amount, 0);
  const general = Math.round(hard * 0.12);
  const contingency = Math.round(hard * 0.08);
  const soft = Math.round(hard * 0.18);
  return { gross: Math.round(gross), perSf: Math.round(occ.cost * factor), factor, lines, hard, general, contingency, soft, total: hard + general + contingency + soft, low: Math.round((hard + general + contingency) * 0.9), high: Math.round((hard + general + contingency) * 1.2) };
}
