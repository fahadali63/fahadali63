import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateSet } from '../src/engine/generate.js';
import { newProject, applyUpdates } from '../src/engine/project.js';
import { OCCUPANCIES, JURISDICTIONS, CONSTRUCTION_TYPES, PHASES } from '../src/engine/catalog.js';
import { buildLayout } from '../src/engine/layout.js';
import { codeAnalysis, requiredExits, plumbingFixtures } from '../src/engine/codes.js';
import { sheetSvg, printHtml } from '../src/engine/render.js';
import { sheetDxf } from '../src/engine/dxf.js';
import { interpret } from '../src/engine/assistant.js';

const finite = (v) => typeof v !== 'number' || Number.isFinite(v);
function assertSane(set) {
  for (const s of set.sheets) {
    assert.ok(s.items.length > 0, `${s.number} has content`);
    for (const it of s.items) {
      assert.ok(finite(it.s) && finite(it.ox) && finite(it.oy) && it.s > 0, `${s.number} viewport transform`);
      for (const p of it.prims) for (const k of Object.keys(p)) {
        if (typeof p[k] === 'number') assert.ok(Number.isFinite(p[k]), `${s.number} prim ${p.t}.${k} is ${p[k]}`);
        if (k === 'pts') p.pts.flat().forEach((v) => assert.ok(Number.isFinite(v)));
        if (k === 's' && p.t === 'text') assert.ok(!/NaN|undefined|Infinity/.test(p.s), `${s.number} text "${p.s}"`);
      }
    }
  }
}

test('every occupancy, story count and size generates a sane set', () => {
  let n = 0;
  for (const occupancy of Object.keys(OCCUPANCIES)) for (const stories of [1, 2, 4]) for (const totalArea of [1200, 6000, 40000]) {
    if (occupancy === 'R-3' && stories > 2) continue;
    const p = applyUpdates(newProject(), { occupancy, stories, totalArea, jurisdiction: 'Los Angeles, CA' });
    const set = generateSet(p, { enterprise: true });
    assertSane(set);
    const L = set.layout;
    for (const f of L.floors) for (const r of f.rooms) {
      assert.ok(r.w >= 6 && r.h > 0, `${occupancy} ${stories}x${totalArea}: room ${r.name} ${r.w}x${r.h}`);
      assert.ok(r.x >= -0.01 && r.x + r.w <= L.W + 0.01, 'room inside footprint');
    }
    n++;
  }
  assert.ok(n > 40);
});

test('every phase and jurisdiction works', () => {
  for (const phase of PHASES.map((x) => x.id)) for (const jurisdiction of Object.keys(JURISDICTIONS)) {
    const set = generateSet(applyUpdates(newProject(), { phase, jurisdiction }), { enterprise: false });
    assertSane(set);
    assert.ok(set.sheets.length >= 2);
  }
});

test('phase scoping and title 24 / enterprise gating', () => {
  const base = applyUpdates(newProject(), { jurisdiction: 'Los Angeles, CA' });
  const cd = generateSet({ ...base, phase: 'cd' }, { enterprise: false }).sheets.map((s) => s.number);
  assert.ok(cd.includes('T24-001') && cd.includes('FLS-101') && cd.includes('E-401'));
  assert.ok(!cd.includes('C-101') && !cd.includes('L-101'));
  const ent = generateSet({ ...base, phase: 'cd' }, { enterprise: true }).sheets.map((s) => s.number);
  assert.ok(ent.includes('C-101') && ent.includes('L-101'));
  const tx = generateSet({ ...base, phase: 'cd', jurisdiction: 'Austin, TX' }, {}).sheets.map((s) => s.number);
  assert.ok(!tx.includes('T24-001'));
  const sd = generateSet({ ...base, phase: 'schematic' }, {}).sheets.map((s) => s.number);
  assert.ok(sd.every((n) => /^(G|A)-/.test(n)));
  const prog = generateSet({ ...base, phase: 'programming' }, {}).sheets.map((s) => s.number);
  assert.deepEqual(prog, ['G-001', 'G-010']);
});

test('generation is deterministic for identical input', () => {
  const p = applyUpdates(newProject(), { stories: 3, totalArea: 14000 });
  p.id = 'fixed';
  const strip = (set) => JSON.stringify(set.sheets.map((s) => s.items));
  assert.equal(strip(generateSet(p, {})), strip(generateSet(p, {})));
});

test('code rules', () => {
  assert.equal(requiredExits(30), 1); assert.equal(requiredExits(300), 2); assert.equal(requiredExits(700), 3); assert.equal(requiredExits(1500), 4);
  const pf = plumbingFixtures({ occupancy: 'B' }, { total: 100 });
  assert.ok(pf.wcM + pf.wcF + pf.urinalsM >= 3);
  assert.ok(plumbingFixtures({ occupancy: 'R-3' }, { total: 6 }).dwelling);
  const p = applyUpdates(newProject(), { stories: 2, totalArea: 8000 });
  const a = codeAnalysis(p, buildLayout(p));
  assert.equal(a.travel.limit, 300);
  const u = codeAnalysis({ ...p, sprinklered: false }, buildLayout(p));
  assert.equal(u.travel.limit, 200);
  assert.ok(a.items.some((i) => i.section === 'Table 1017.2'));
});

test('svg, print html and dxf output', () => {
  const p = applyUpdates(newProject(), {});
  const set = generateSet(p, {});
  const svg = sheetSvg(p, set.sheets[3], set.sheets.length, 4);
  assert.match(svg, /^<svg/); assert.ok(!/NaN/.test(svg));
  assert.ok(printHtml(p, set.sheets).includes('@page'));
  const dxf = sheetDxf(set.sheets[3]);
  assert.match(dxf, /ENTITIES/); assert.match(dxf, /EOF$/); assert.ok(!/NaN/.test(dxf));
  assert.ok((dxf.match(/\nLINE\n/g) || []).length > 100);
});

test('offline assistant edits', () => {
  const p = newProject();
  let r = interpret(p, 'Make it 3 stories and add 2 conference rooms');
  assert.equal(r.updates.stories, 3); assert.ok(r.updates.program.filter((x) => x.type === 'conference').length === 3) // default program has one already;
  r = interpret(p, 'change occupancy to retail in Austin'); assert.equal(r.updates.occupancy, 'M'); assert.equal(r.updates.jurisdiction, 'Austin, TX');
  r = interpret(p, 'footprint 90 x 50, no sprinklers'); assert.deepEqual(r.updates.footprint, { width: 90, depth: 50 }); assert.equal(r.updates.sprinklered, false);
  r = interpret(p, 'Design a 3 story 12,000 sf restaurant in Dallas'); assert.equal(r.updates.occupancy, 'A-2'); assert.equal(r.updates.totalArea, 12000);
  r = interpret(p, 'make the lobby 500 sf'); assert.ok(!r.updates.totalArea); assert.ok(r.updates.program.some((x) => x.type === 'lobby' && x.area === 500));
  r = interpret(p, 'blah blah'); assert.equal(r.changed, false);
});

test('validation clamps bad input', () => {
  const p = applyUpdates(newProject(), { stories: 99, totalArea: -5, occupancy: 'ZZ', construction: 'nope', footprint: { width: 1, depth: 1 } });
  assert.equal(p.stories, 12); assert.equal(p.totalArea, 400); assert.equal(p.occupancy, 'B'); assert.equal(p.construction, 'VB');
  assert.ok(CONSTRUCTION_TYPES[p.construction]);
  const set = generateSet(p, {}); assertSane(set);
});
