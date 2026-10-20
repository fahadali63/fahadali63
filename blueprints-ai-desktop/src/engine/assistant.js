import { ROOM_TYPES, OCCUPANCIES, JURISDICTIONS, CONSTRUCTION_TYPES } from './catalog.js';
import { guessType, normalizeRoom, defaultProgram } from './project.js';

const ROOM_WORDS = 'lobby|reception|open office|private office|office|conference room|meeting room|boardroom|classroom|restroom|bathroom|bedroom|bath|kitchen|break room|storage room|storage|closet|garage|living room|dining room|dining|server room|data room|lab|workshop|warehouse|sales floor|showroom|gym|library|auditorium|mechanical room|electrical room|stair|elevator|training room|waiting area';
const OCC_WORDS = [
  [/office|business|professional|co-?working/i, 'B'], [/restaurant|cafe|café|bar\b|dining hall/i, 'A-2'], [/church|assembly|auditorium|community center|theater|theatre/i, 'A-3'],
  [/school|classroom building|education|daycare|training center/i, 'E'], [/retail|store|shop|mercantile|showroom/i, 'M'], [/apartment|multifamily|multi-family|condo|dormitory/i, 'R-2'],
  [/single[- ]family|house|home|residence|adu|duplex/i, 'R-3'], [/warehouse|storage building|self[- ]storage/i, 'S-1'], [/factory|manufactur|industrial|production/i, 'F-1'],
];
const num = (s) => Number(String(s).replace(/,/g, ''));
const plural = (n) => (n === 1 ? '' : 's');

/** Offline natural-language interpreter for project edits. Returns { reply, updates, changed }. */
export function interpret(project, text) {
  const t = ` ${text} `;
  const lower = t.toLowerCase();
  const updates = {}; const notes = [];
  let program = project.program.length ? project.program.map((r) => ({ ...r })) : null;
  const ensureProgram = () => { if (!program) program = defaultProgram(updates.occupancy || project.occupancy, updates.totalArea || project.totalArea, updates.stories || project.stories).map(normalizeRoom); return program; };

  // occupancy
  for (const [re, code] of OCC_WORDS) if (re.test(text) && /(building|project|occupancy|change|make|convert|design|a |an )/i.test(text)) {
    if (code !== project.occupancy && (/occupancy|change|convert|make it|make this|turn it/i.test(text) || !project.program.length)) { updates.occupancy = code; notes.push(`Occupancy set to ${OCCUPANCIES[code].name}.`); break; }
  }
  // stories
  let m = lower.match(/(\d+|one|two|three|four|five|six)[- ]?(?:story|stories|storey|floors?|levels?)/);
  if (m) { const w = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6 }; const n = w[m[1]] || num(m[1]); if (n >= 1 && n <= 12) { updates.stories = n; notes.push(`Stories set to ${n}.`); } }
  // total area (not tied to a specific room)
  m = lower.match(/(\d[\d,]*(?:\.\d+)?)\s*(?:k\b)?\s*(?:sf|sq\.?\s?ft|square feet|square foot|sqft)(?!\s*(?:conference|meeting|office|bed|bath|kitchen|lobby|room|storage|classroom|restroom))/);
  const totalHint = /total|overall|building|gross|about|approximately|around|project|footprint of|make it|resize|bigger|smaller/.test(lower) || !/\badd\b/.test(lower);
  const resizeRe = new RegExp(`(?:make|resize|set|enlarge|change)\\s+(?:the\\s+)?(?:${ROOM_WORDS})s?\\s+(?:to\\s+|be\\s+)?\\d[\\d,]*\\s*(?:sf|sq\\.?\\s?ft|square feet)`);
  if (m && totalHint && !resizeRe.test(lower)) { let a = num(m[1]); if (/k\s*(sf|sq)/.test(lower)) a *= 1000; if (a >= 400) { updates.totalArea = Math.round(a); notes.push(`Gross area set to ${a.toLocaleString()} sf.`); } }
  // footprint W x D
  m = lower.match(/(\d{2,3})\s*(?:ft|feet|')?\s*(?:x|by)\s*(\d{2,3})\s*(?:ft|feet|')?/);
  if (m) { updates.footprint = { width: num(m[1]), depth: num(m[2]) }; notes.push(`Footprint set to ${m[1]}' x ${m[2]}'.`); }
  // sprinklers
  if (/no sprinkler|without sprinkler|unsprinklered/.test(lower)) { updates.sprinklered = false; notes.push('Sprinklers removed.'); }
  else if (/sprinkler/.test(lower)) { updates.sprinklered = true; notes.push('Sprinklers added (NFPA 13).'); }
  // construction type
  m = text.match(/type\s*(i{1,3}[ab]?|iv|v[ab])\b/i);
  if (m && CONSTRUCTION_TYPES[m[1].toUpperCase()]) { updates.construction = m[1].toUpperCase(); notes.push(`Construction type ${m[1].toUpperCase()}.`); }
  // jurisdiction
  for (const j of Object.keys(JURISDICTIONS)) { const city = j.split(',')[0].toLowerCase(); if (j !== 'Other' && lower.includes(city)) { updates.jurisdiction = j; notes.push(`Jurisdiction set to ${j}.`); break; } }
  // project name
  m = text.match(/(?:call|name|rename)\s+(?:the\s+)?(?:project|it|this)\s+(?:to\s+)?["“']?([^"”'.\n]{3,60})["”']?/i);
  if (m) { updates.name = m[1].trim(); notes.push(`Project renamed "${updates.name}".`); }

  // add rooms
  const addRe = new RegExp(`\\b(?:add|include|need|needs|want|with|plus|and)\\s+(?:an?\\s+|(\\d+)\\s+)?(?:(\\d[\\d,]*)\\s*(?:sf|sq\\.?\\s?ft|square feet)\\s+)?(${ROOM_WORDS})s?\\b`, 'gi');
  let am; let added = 0;
  while ((am = addRe.exec(t))) {
    const count = am[1] ? num(am[1]) : 1; const area = am[2] ? num(am[2]) : null; const word = am[3].toLowerCase();
    const type = guessType(word); const def = ROOM_TYPES[type];
    const prog = ensureProgram();
    const existing = prog.filter((r) => r.type === type).length;
    for (let i = 0; i < Math.min(count, 20); i++) { const nm = `${word.replace(/\b\w/g, (c) => c.toUpperCase())}${count + existing > 1 ? ` ${existing + i + 1}` : ''}`; prog.push(normalizeRoom({ name: nm, type, area: area || def.area })); added++; }
  }
  if (added) notes.push(`Added ${added} room${plural(added)} to the program.`);
  // remove rooms
  const rmRe = new RegExp(`\\b(?:remove|delete|drop|get rid of|take out)\\s+(?:the\\s+|all\\s+)?(${ROOM_WORDS}|[a-z0-9 ]{3,24}?)s?\\b(?:\\s*\\d+)?(?=[,.;]|\\s+and\\b|\\s*$)`, 'gi');
  let rm; let removed = 0;
  while ((rm = rmRe.exec(t))) {
    const key = rm[1].trim().toLowerCase(); const prog = ensureProgram();
    const before = prog.length; program = prog.filter((r) => !r.name.toLowerCase().includes(key) && !(ROOM_WORDS.split('|').includes(key) && r.type === guessType(key) && key !== 'office' && false));
    removed += before - program.length;
  }
  if (removed) notes.push(`Removed ${removed} room${plural(removed)}.`);
  // resize a room: "make the lobby 500 sf" / "lobby to 500 sf"
  const rs = lower.match(new RegExp(`(?:make|resize|set|enlarge|change)\\s+(?:the\\s+)?(${ROOM_WORDS})s?\\s+(?:to\\s+|be\\s+)?(\\d[\\d,]*)\\s*(?:sf|sq\\.?\\s?ft|square feet)`));
  if (rs) { const key = rs[1]; const prog = ensureProgram(); let c = 0; prog.forEach((r) => { if (r.name.toLowerCase().includes(key) || r.type === guessType(key)) { r.area = num(rs[2]); c++; } }); if (!c) { prog.push(normalizeRoom({ name: key.replace(/\b\w/g, (x) => x.toUpperCase()), type: guessType(key), area: num(rs[2]) })); c = 1; } notes.push(`Set ${key} to ${rs[2]} sf.`); }
  const bigger = lower.match(new RegExp(`(?:make|enlarge)\\s+(?:the\\s+)?(${ROOM_WORDS})s?\\s+(bigger|larger|smaller)`));
  if (bigger) { const prog = ensureProgram(); const f = bigger[2] === 'smaller' ? 0.75 : 1.3; let c = 0; prog.forEach((r) => { if (r.name.toLowerCase().includes(bigger[1]) || r.type === guessType(bigger[1])) { r.area = Math.round(r.area * f); c++; } }); if (c) notes.push(`${bigger[2] === 'smaller' ? 'Reduced' : 'Enlarged'} ${c} ${bigger[1]} room${plural(c)}.`); }
  // floor assignment: "put the conference room on level 2"
  const fl = lower.match(new RegExp(`(?:put|move|place)\\s+(?:the\\s+)?(${ROOM_WORDS})s?\\s+(?:on|to|at)\\s+(?:the\\s+)?(?:level|floor)\\s*(\\d+)`));
  if (fl) { const prog = ensureProgram(); prog.forEach((r) => { if (r.name.toLowerCase().includes(fl[1])) r.floor = num(fl[2]); }); notes.push(`Moved ${fl[1]} to level ${fl[2]}.`); }

  if (program) updates.program = program;
  const changed = Object.keys(updates).length > 0;
  let reply;
  if (changed) reply = `${notes.join(' ')} I regenerated the set with these changes.`;
  else if (/\?\s*$/.test(text.trim()) || /^(what|why|how|can|does|is|which)/i.test(text.trim())) reply = answer(project, lower);
  else reply = 'I could not map that to a change in offline mode. Try things like "make it 3 stories", "add 2 conference rooms", "make the lobby 500 sf", "change occupancy to retail", "move the kitchen to level 2", or "footprint 90 x 50". Add an Anthropic API key in Settings to use free-form requests, sketches and photos.';
  return { reply, updates, changed };
}

function answer(project, lower) {
  if (/code|ibc|nfpa|ada/.test(lower)) return 'The Code tab lists each check with the IBC, NFPA, ADA or Title 24 section it comes from, and every sheet set cites the same sections on G-002.';
  if (/permit|submit|stamp|certif/.test(lower)) return 'Review every sheet, add markups, then approve each one on the Review tab. Approval needs the professional of record name and license. Blueprints AI Desktop drafts the set. You remain responsible for certification.';
  if (/cost|price|budget/.test(lower)) return 'The Cost tab shows a planning-level estimate by discipline, with a low-to-high range. It updates every time the set is regenerated.';
  return 'I can change the stories, area, occupancy, rooms, footprint, sprinklers and jurisdiction, then regenerate every discipline. Tell me what to change.';
}
