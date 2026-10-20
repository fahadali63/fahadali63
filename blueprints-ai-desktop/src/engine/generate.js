import { PHASES, PHASE_DISCIPLINES, JURISDICTIONS, DISCIPLINES } from './catalog.js';
import { buildLayout } from './layout.js';
import { codeAnalysis, costEstimate } from './codes.js';
import { coverSheet, codeSheet, costSheet, floorPlanSheets, elevationSheet, sectionSheet, roofPlanSheet, scheduleSheet, interiorSheets, fireSheets } from './sheets_arch.js';
import { structuralSheets, mechanicalSheets, electricalSheets, plumbingSheets, title24Sheets, computeStruct, computeMech, computeElec, computePlumb } from './sheets_eng.js';
import { civilSheets, landscapeSheets } from './sheets_site.js';

/**
 * Build the whole drawing set for a project. Pure function: same project in,
 * same set out, so revisions only differ where the project data differs.
 */
export function generateSet(project, opts = {}) {
  const layout = buildLayout(project);
  layout.floors.forEach((fl) => fl.doors.forEach((d, i) => { d.tag = `${fl.level}${String(i + 1).padStart(2, '0')}`; }));
  const an = codeAnalysis(project, layout);
  const cost = costEstimate(project, layout);
  const ctx = { project, layout, an, cost, phaseName: PHASES.find((p) => p.id === project.phase)?.name || project.phase };
  ctx.struct = computeStruct(ctx);
  ctx.mech = computeMech(ctx);
  ctx.elec = computeElec(ctx);
  ctx.plumb = computePlumb(ctx);
  ctx.rtuPlacement = ctx.mech.units;
  const wanted = new Set(PHASE_DISCIPLINES[project.phase] || PHASE_DISCIPLINES.cd);
  const j = JURISDICTIONS[project.jurisdiction] || JURISDICTIONS.Other;
  const enterprise = !!opts.enterprise;
  const atLeast = (...ph) => ph.includes(project.phase);
  let sheets = [];
  const push = (d, ...s) => { if (wanted.has(d)) sheets.push(...s.flat()); };

  if (atLeast('cd', 'cost', 'dd')) push('general', codeSheet(ctx));
  if (atLeast('cd', 'cost')) push('general', costSheet(ctx));
  if (project.phase === 'cost') push('general', costSheet(ctx));
  push('architectural', floorPlanSheets(ctx), elevationSheet(ctx));
  if (atLeast('dd', 'cd', 'cost')) push('architectural', sectionSheet(ctx));
  if (atLeast('cd', 'cost')) push('architectural', roofPlanSheet(ctx), scheduleSheet(ctx));
  push('structural', structuralSheets(ctx));
  push('mechanical', mechanicalSheets(ctx));
  push('electrical', electricalSheets(ctx));
  push('plumbing', plumbingSheets(ctx));
  if (j.title24 && atLeast('cd', 'cost')) push('title24', title24Sheets(ctx));
  if (atLeast('cd', 'cost')) push('fire', fireSheets(ctx));
  push('interior', interiorSheets(ctx));
  if (enterprise && atLeast('cd', 'cost')) { push('civil', civilSheets(ctx)); push('landscape', landscapeSheets(ctx)); }

  // de-duplicate sheet numbers (cost phase can add G-003 twice)
  const seen = new Set(); sheets = sheets.filter((s) => (seen.has(s.number) ? false : (seen.add(s.number), true)));
  const order = DISCIPLINES.map((d) => d.id);
  sheets.sort((a, b) => order.indexOf(a.discipline) - order.indexOf(b.discipline) || a.number.localeCompare(b.number, undefined, { numeric: true }));
  const cover = coverSheet(ctx, [{ number: 'G-001', title: 'Cover sheet and sheet index', discipline: 'general' }, ...sheets]);
  sheets.unshift(cover);
  if (project.phase === 'programming') sheets = [cover, programSheet(ctx)];
  return { sheets, layout, analysis: an, cost, ctx };
}

import { Sheet, Column } from './draw.js';
import { ROOM_TYPES } from './catalog.js';
function programSheet(ctx) {
  const sh = new Sheet('general', 'G-010', 'Program summary');
  const rows = ctx.layout.floors.flatMap((fl) => fl.rooms.filter((r) => !r.core || true).map((r) => [fl.level, r.name, ROOM_TYPES[r.type].label, Math.round(r.w * r.h)]));
  const c = new Column(40, 40, 520, 14);
  c.table('Space program (as laid out)', ['Level', 'Space', 'Type', 'Area (sf)'], rows.slice(0, 48), { rh: 8.6, fs: 5 });
  const d = new Column(600, 40, 336, 12);
  d.table('Area summary', ['Item', 'Value'], [['Target gross area', `${ctx.project.totalArea.toLocaleString()} sf`], ['Laid-out gross area', `${Math.round(ctx.cost.gross).toLocaleString()} sf`], ['Stories', ctx.project.stories], ['Building footprint', `${ctx.layout.W} ft x ${ctx.layout.D} ft`], ['Estimated occupant load', ctx.an.load.total]], { rh: 10, fs: 5.4 });
  sh.add([...c.prims, ...d.prims]);
  return sh;
}
