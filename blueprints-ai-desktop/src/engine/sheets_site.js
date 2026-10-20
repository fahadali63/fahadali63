import { P, Sheet, viewTitle, northArrow, Column, fitScale, dimLine, ftin } from './draw.js';
import { MAIN, RIGHT } from './sheets_arch.js';
import { OCCUPANCIES } from './catalog.js';

function siteGeometry(ctx) {
  const { layout, project } = ctx; const { W, D } = layout;
  const occ = OCCUPANCIES[project.occupancy];
  const footprint = W * D;
  const stalls = Math.max(4, Math.ceil(ctx.mech.gross / (project.occupancy.startsWith('R') ? 500 : project.occupancy === 'M' ? 250 : 300)));
  const ada = stalls <= 25 ? 1 : stalls <= 50 ? 2 : stalls <= 75 ? 3 : stalls <= 100 ? 4 : 5 + Math.ceil((stalls - 100) / 100);
  const rows = Math.ceil(stalls / Math.max(1, Math.floor((W + 30) / 9)));
  const perRow = Math.ceil(stalls / rows);
  const lotW = Math.max(W + 40, perRow * 9 + 30); const lotD = D + 40 + rows * 18 + 26 + 20;
  return { footprint, stalls, ada, rows, perRow, lotW, lotD, occ, bx: (lotW - W) / 2, by: 20 };
}

export function civilSheets(ctx) {
  const g = siteGeometry(ctx); const { layout } = ctx; const { W, D } = layout; const out = [];
  const sh = new Sheet('civil', 'C-101', 'Site, grading and utility plan'); const p = [];
  p.push(P.rect(0, 0, g.lotW, g.lotD, { w: 1.8, c: 'mid', dash: '10 3 2 3' }), P.text(g.lotW / 2, -3, 'PROPERTY LINE', { h: 5, anchor: 'middle', c: 'mid' }));
  p.push(P.rect(10, 20, g.lotW - 20, g.lotD - 30, { w: 0.7, c: 'light', dash: '5 3' }), P.text(14, 17, 'SETBACK LINE (VERIFY WITH ZONING)', { h: 3.6, c: 'light' }));
  p.push(P.rect(g.bx, g.by, W, D, { fill: '#e8e3d8', w: 2.4 }), P.text(g.bx + W / 2, g.by + D / 2, 'BUILDING', { h: 8, anchor: 'middle', bold: true }), P.text(g.bx + W / 2, g.by + D / 2 + 9, `FFE 100.00`, { h: 5.2, anchor: 'middle', c: 'mid' }));
  const py = g.by + D + 26;
  p.push(P.rect(g.bx - 15, g.by + D, W + 30, 26 + g.rows * 18, { fill: '#f0f0f0', w: 0.8, c: 'light' }));
  let n = 0;
  for (let r = 0; r < g.rows; r++) for (let k = 0; k < g.perRow && n < g.stalls; k++, n++) {
    const x = g.bx - 15 + 6 + k * 9; const y = py + r * 18 - 0; const isAda = n < g.ada;
    p.push(P.rect(x, y - 8, isAda ? 11 : 9, 18, { w: 0.6, c: isAda ? 'blue' : 'mid', fill: isAda ? '#dbe8f5' : undefined }));
    if (isAda) p.push(P.text(x + 5, y + 2, 'A', { h: 5, anchor: 'middle', c: 'blue', bold: true }));
  }
  p.push(P.rect(g.bx + W / 2 - 12, g.by + D, 24, 8, { fill: 'paper', w: 0.6, c: 'light' }), P.text(g.bx + W / 2, g.by + D + 5, 'ACCESSIBLE ROUTE', { h: 3, anchor: 'middle', c: 'blue' }));
  p.push(P.rect(g.lotW / 2 - 12, g.lotD - 2, 24, 4, { fill: '#d7d7d7', w: 0.8 }), P.text(g.lotW / 2, g.lotD + 7, 'DRIVEWAY APPROACH', { h: 4.4, anchor: 'middle' }));
  // utilities
  const ux = g.lotW - 6;
  p.push(P.line(ux, g.lotD, ux, g.by + D / 2, { w: 1.2, c: 'green', dash: '6 2' }), P.line(ux, g.by + D / 2, g.bx + W, g.by + D / 2, { w: 1.2, c: 'green', dash: '6 2' }), P.text(ux - 2, g.lotD - 14, 'SS 6" @ 2%', { h: 4.2, c: 'green', rot: -90 }));
  p.push(P.line(ux - 8, g.lotD, ux - 8, g.by + D * 0.7, { w: 1.2, c: 'blue' }), P.line(ux - 8, g.by + D * 0.7, g.bx + W, g.by + D * 0.7, { w: 1.2, c: 'blue' }), P.text(ux - 10, g.lotD - 14, `W ${ctx.plumb.svc}`, { h: 4.2, c: 'blue', rot: -90 }));
  p.push(P.line(6, g.lotD * 0.6, 6, g.lotD, { w: 1.2, c: 'orange', dash: '3 2' }), P.text(8, g.lotD * 0.8, 'SD 12"', { h: 4.2, c: 'orange', rot: -90 }), P.circ(6, g.lotD * 0.6, 2, { fill: 'paper', w: 1.2, c: 'orange' }), P.text(10, g.lotD * 0.6, 'CB', { h: 4, c: 'orange' }));
  [30, 50, 70].forEach((y) => p.push(P.poly([[0, y], [g.lotW * 0.3, y + 2], [g.lotW * 0.7, y - 2], [g.lotW, y + 1]], { closed: false, w: 0.5, c: 'light' })));
  p.push(P.text(g.lotW - 40, 5, '2% MAX SLOPE TO STREET', { h: 4, c: 'mid', anchor: 'middle' }));
  const vp = sh.view(p, g.lotW, g.lotD + 12, MAIN, { pad: 6 });
  sh.add([...viewTitle(MAIN.x, 38, '1', 'Site, grading and utility plan', vp.label), ...northArrow(MAIN.x + MAIN.w - 14, 44)]);
  const col = new Column(RIGHT.x, 40, RIGHT.w, 12);
  col.table('Parking summary', ['Item', 'Qty'], [['Total stalls', g.stalls], ['Accessible (ADA 208.2)', g.ada], ['Van accessible', Math.max(1, Math.ceil(g.ada / 6))], ['EV capable (10%)', Math.max(1, Math.ceil(g.stalls * 0.1))]], { rh: 9.4, fs: 5 });
  col.table('Site data', ['Item', 'Value'], [['Building footprint', `${Math.round(g.footprint).toLocaleString()} sf`], ['Lot area (assumed)', `${Math.round(g.lotW * g.lotD).toLocaleString()} sf`], ['Est. earthwork', `${Math.round(g.footprint * 2 / 27)} cy`], ['Pad elevation', 'TBD (survey)']], { rh: 9.4, fs: 5 });
  col.notes('Notes', ['Lot dimensions and utilities are placeholders until a boundary and topographic survey is provided.', 'Provide stormwater controls (LID / SWPPP) per local requirements.', 'Verify parking ratios and setbacks with zoning.'], { fs: 4.8 });
  sh.add(col.prims); out.push(sh);
  return out;
}

export function landscapeSheets(ctx) {
  const g = siteGeometry(ctx); const { W, D } = ctx.layout; const out = [];
  const sh = new Sheet('landscape', 'L-101', 'Planting and hardscape plan'); const p = [];
  p.push(P.rect(0, 0, g.lotW, g.lotD, { w: 1.2, c: 'mid', dash: '10 3 2 3' }), P.rect(g.bx, g.by, W, D, { fill: '#e8e3d8', w: 2 }));
  const trees = []; for (let x = 12; x < g.lotW - 6; x += 24) { trees.push([x, 8]); trees.push([x + 6, g.lotD - 6]); }
  let nt = 0; for (const [x, y] of trees) { nt++; p.push(P.circ(x, y, 6, { fill: '#cfe5cf', w: 0.8, c: 'green' }), P.circ(x, y, 0.8, { fill: 'green', w: 0.4, c: 'green' })); }
  let ns = 0; for (let x = g.bx; x < g.bx + W - 2; x += 5) { ns++; p.push(P.circ(x + 2, g.by - 3, 1.6, { fill: '#e2f0d8', w: 0.6, c: 'green' })); }
  p.push(P.rect(2, 14, 14, g.lotD - 28, { fill: '#eef5e6', w: 0.4, c: 'green', dash: '3 2' }), P.text(9, g.lotD / 2, 'GROUNDCOVER', { h: 4.4, anchor: 'middle', rot: -90, c: 'green' }));
  p.push(P.rect(g.bx + W / 2 - 6, g.by + D, 12, 12, { fill: '#d9d1c1', w: 0.8 }), P.text(g.bx + W / 2, g.by + D + 7, 'ENTRY PLAZA', { h: 3.6, anchor: 'middle' }));
  const vp = sh.view(p, g.lotW, g.lotD, MAIN, { pad: 6 });
  sh.add([...viewTitle(MAIN.x, 38, '1', 'Planting and hardscape plan', vp.label), ...northArrow(MAIN.x + MAIN.w - 14, 44)]);
  const col = new Column(RIGHT.x, 40, RIGHT.w, 12);
  col.table('Plant schedule', ['Sym', 'Description', 'Qty'], [['O', 'Canopy tree, 24" box (low water)', nt], ['o', 'Shrub, 5 gal (low water)', ns], ['///', 'Groundcover, flats @ 12" OC', Math.round((14 * (g.lotD - 28)) / 1)]], { rh: 9.4, fs: 4.8 });
  col.notes('Notes', ['Select drought-tolerant species suited to the local climate zone.', 'Irrigation: drip for shrubs and trees, smart controller with rain sensor.', 'In California, provide the Landscape Documentation Package and water budget (MWELO) with the permit set.'], { fs: 4.8 });
  sh.add(col.prims); out.push(sh);
  return out;
}
