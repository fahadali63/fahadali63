import { ROOM_TYPES, OCCUPANCIES, CONSTRUCTION_TYPES, JURISDICTIONS } from './catalog.js';

let seq = 0;
export const uid = (p = 'id') => `${p}_${Date.now().toString(36)}${(seq++).toString(36)}${Math.random().toString(36).slice(2, 5)}`;

export function newProject(over = {}) {
  return {
    id: uid('prj'),
    name: 'Untitled project',
    description: '',
    jurisdiction: 'Los Angeles, CA',
    occupancy: 'B',
    construction: 'VB',
    stories: 2,
    totalArea: 6000,
    sprinklered: true,
    climateZone: 9,
    phase: 'cd',
    program: [],
    footprint: null,
    attachments: [],
    messages: [],
    sheets: [],
    markups: [],
    revisions: [],
    codeNotes: [],
    assumptions: [],
    approval: { by: '', license: '', date: '', approved: false },
    createdAt: Date.now(),
    updatedAt: Date.now(),
    ...over,
  };
}

const clampNum = (v, lo, hi, d) => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : d;
};

export function normalizeRoom(r, i = 0) {
  const type = ROOM_TYPES[r.type] ? r.type : guessType(r.name || '');
  const def = ROOM_TYPES[type];
  return {
    id: r.id || uid('rm'),
    name: String(r.name || def.label).slice(0, 40),
    type,
    area: Math.round(clampNum(r.area, 20, 60000, def.area)),
    floor: r.floor == null || r.floor === '' ? null : Math.max(1, Math.round(Number(r.floor)) || 1),
  };
}

export function guessType(name) {
  const n = name.toLowerCase();
  const map = [
    [/lobby|entry|reception|foyer/, 'lobby'], [/open office|bullpen|workspace|coworking/, 'open_office'],
    [/conference|meeting|board/, 'conference'], [/office|manager|director/, 'office'],
    [/class|lecture|training/, 'classroom'], [/dining|restaurant|cafe|café/, 'dining'],
    [/kitchen|pantry|break/, 'kitchen'], [/retail|sales|shop floor|showroom|store/, 'retail'],
    [/stor|closet|archive|supply/, 'storage'], [/rest ?room|toilet|wc|lavatory/, 'restroom'],
    [/stair/, 'stair'], [/elevator|lift/, 'elevator'], [/mechanical|hvac|mech/, 'mechanical'],
    [/electrical|elec|idf|mdf|server|data/, 'electrical'], [/bed/, 'bedroom'], [/bath|shower/, 'bath'],
    [/living|family|great room|den/, 'living'], [/garage|carport/, 'garage'], [/lab|workshop|shop/, 'lab'],
    [/warehouse|stock/, 'warehouse'], [/assembly|auditorium|hall|gym|sanctuary/, 'assembly'],
  ];
  for (const [re, t] of map) if (re.test(n)) return t;
  return 'office';
}

/** Validate and merge a partial update (from the assistant or the setup form) into the project. */
export function applyUpdates(p, u = {}) {
  const next = { ...p };
  if (typeof u.name === 'string' && u.name.trim()) next.name = u.name.trim().slice(0, 80);
  if (typeof u.description === 'string') next.description = u.description.slice(0, 4000);
  if (u.jurisdiction && JURISDICTIONS[u.jurisdiction]) {
    next.jurisdiction = u.jurisdiction;
    const j = JURISDICTIONS[u.jurisdiction];
    if (j.zone && u.climateZone == null) next.climateZone = j.zone;
  }
  if (u.occupancy && OCCUPANCIES[u.occupancy]) next.occupancy = u.occupancy;
  if (u.construction && CONSTRUCTION_TYPES[u.construction]) next.construction = u.construction;
  if (u.stories != null) next.stories = Math.round(clampNum(u.stories, 1, 12, p.stories));
  if (u.totalArea != null) next.totalArea = Math.round(clampNum(u.totalArea, 400, 400000, p.totalArea));
  if (u.sprinklered != null) next.sprinklered = !!u.sprinklered;
  if (u.climateZone != null) next.climateZone = Math.round(clampNum(u.climateZone, 1, 16, p.climateZone));
  if (u.phase) next.phase = u.phase;
  if (Array.isArray(u.program)) next.program = u.program.map(normalizeRoom);
  if (u.footprint && u.footprint.width && u.footprint.depth) {
    next.footprint = { width: clampNum(u.footprint.width, 15, 600, 60), depth: clampNum(u.footprint.depth, 15, 600, 40) };
  } else if (u.footprint === null) next.footprint = null;
  if (Array.isArray(u.codeNotes)) next.codeNotes = u.codeNotes.slice(0, 40).map((c) => ({ code: String(c.code || ''), section: String(c.section || ''), note: String(c.note || '') }));
  if (Array.isArray(u.assumptions)) next.assumptions = u.assumptions.slice(0, 30).map(String);
  next.updatedAt = Date.now();
  return next;
}

/** A sensible starter program when the user has not listed rooms yet. */
export function defaultProgram(occupancy, totalArea, stories) {
  const A = Math.max(400, totalArea);
  const mk = (name, type, frac, floor) => ({ name, type, area: Math.max(60, Math.round((A * frac) / 10) * 10), floor });
  switch (occupancy) {
    case 'R-3':
      return [mk('Living room', 'living', 0.2), mk('Kitchen', 'kitchen', 0.1), mk('Dining', 'dining', 0.08), mk('Primary bedroom', 'bedroom', 0.14), mk('Bedroom 2', 'bedroom', 0.1), mk('Bedroom 3', 'bedroom', 0.1), mk('Bath 1', 'bath', 0.05), mk('Bath 2', 'bath', 0.05), mk('Garage', 'garage', 0.18)];
    case 'R-2':
      return [mk('Unit A living', 'living', 0.14), mk('Unit A bedroom', 'bedroom', 0.1), mk('Unit A kitchen', 'kitchen', 0.06), mk('Unit A bath', 'bath', 0.04), mk('Unit B living', 'living', 0.14), mk('Unit B bedroom', 'bedroom', 0.1), mk('Unit B kitchen', 'kitchen', 0.06), mk('Unit B bath', 'bath', 0.04), mk('Storage', 'storage', 0.05)];
    case 'E':
      return [mk('Classroom 1', 'classroom', 0.17), mk('Classroom 2', 'classroom', 0.17), mk('Classroom 3', 'classroom', 0.17), mk('Administration', 'office', 0.08), mk('Library', 'assembly', 0.12), mk('Storage', 'storage', 0.05)];
    case 'M':
      return [mk('Sales floor', 'retail', 0.6), mk('Stockroom', 'storage', 0.2), mk('Office', 'office', 0.06)];
    case 'A-2':
      return [mk('Dining', 'dining', 0.45), mk('Kitchen', 'kitchen', 0.25), mk('Bar / waiting', 'assembly', 0.12), mk('Storage', 'storage', 0.08), mk('Office', 'office', 0.04)];
    case 'A-3':
      return [mk('Main hall', 'assembly', 0.55), mk('Meeting room', 'conference', 0.12), mk('Kitchenette', 'kitchen', 0.06), mk('Storage', 'storage', 0.08)];
    case 'S-1':
      return [mk('Warehouse', 'warehouse', 0.82), mk('Office', 'office', 0.06), mk('Break room', 'kitchen', 0.04)];
    case 'F-1':
      return [mk('Production floor', 'lab', 0.7), mk('Storage', 'storage', 0.12), mk('Office', 'office', 0.06), mk('Break room', 'kitchen', 0.04)];
    default:
      return [mk('Open office', 'open_office', 0.42), mk('Private office 1', 'office', 0.035), mk('Private office 2', 'office', 0.035), mk('Private office 3', 'office', 0.035), mk('Conference room', 'conference', 0.07), mk('Break room', 'kitchen', 0.04), mk('Storage', 'storage', 0.03)];
  }
}

export function programArea(program) {
  return program.reduce((s, r) => s + (r.area || 0), 0);
}
