import { generateSet } from '../src/engine/generate.js';
import { newProject } from '../src/engine/project.js';
import { sheetSvg } from '../src/engine/render.js';
import fs from 'node:fs';
const pr = newProject({ stories: 2, totalArea: 8000, name: 'Harbor Street Offices' });
const r = generateSet(pr, { enterprise: true });
fs.mkdirSync('/tmp/claude-0/-home-user-fahadali63/3e443f3f-730c-5f11-8ec2-1e7109da0391/scratchpad/svg', { recursive: true });
r.sheets.forEach((s, i) => fs.writeFileSync(`/tmp/claude-0/-home-user-fahadali63/3e443f3f-730c-5f11-8ec2-1e7109da0391/scratchpad/svg/${s.number}.svg`, sheetSvg(pr, s, r.sheets.length, i + 1, { width: 1620 })));
console.log(r.sheets.length);
