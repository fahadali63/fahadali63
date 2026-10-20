'use strict';
const fs = require('node:fs');

const SYSTEM = `You are the design assistant inside Blueprints AI Desktop, a tool that drafts coordinated construction document sets (architectural, structural, mechanical, electrical, plumbing, Title 24 energy, fire and life safety, interior; civil and landscape on enterprise plans) for review by a licensed professional.

You receive the current project data, the conversation so far, and optional attachments (sketches, site photos, PDFs, text). Interpret the architectural intent and respond ONLY with one JSON object, no prose outside it:
{
  "reply": "short, plain answer to the user (2-5 sentences). Say what you changed and anything they should verify.",
  "updates": {
    "name": string?, "description": string?, "jurisdiction": one of the allowed jurisdictions?, "occupancy": one of the occupancy codes?,
    "construction": one of the construction types?, "stories": integer?, "totalArea": gross square feet integer?, "sprinklered": boolean?, "climateZone": integer?,
    "footprint": {"width": feet, "depth": feet}?,
    "program": [{"name": string, "type": room type, "area": square feet integer, "floor": integer or null}]?
  },
  "codeNotes": [{"code": "IBC|CBC|IFC|NFPA|ADA|Title 24|IPC|NEC", "section": "section number", "note": "how it applies to this project"}],
  "assumptions": ["each assumption you had to make"]
}
Rules:
- Include only fields you are changing in "updates". If you return "program" it replaces the whole room list, so include every room. Do not list stairs, elevators, restrooms or mechanical/electrical rooms unless the user specified them; the generator adds support spaces.
- Allowed occupancy codes: B, A-2, A-3, E, M, R-2, R-3, S-1, F-1. Allowed construction types: IA, IB, IIA, IIB, IIIA, IIIB, VA, VB.
- Allowed room types: lobby, office, open_office, conference, classroom, assembly, dining, kitchen, retail, storage, restroom, stair, elevator, mechanical, electrical, bedroom, bath, living, garage, lab, warehouse.
- Cite real sections of IBC, CBC, IFC, NFPA, ADA and Title 24 only when you are confident. Never invent section numbers. If unsure, say so in "assumptions".
- Read dimensions and room labels from sketches and drawings. If a scale is not stated, say what you assumed.
- You draft; the user is the professional of record. Do not claim code compliance is guaranteed.`;

function contentBlocks(attachments, text) {
  const blocks = [];
  for (const a of attachments) {
    try {
      const buf = fs.readFileSync(a.path);
      if (/^image\/(png|jpe?g|gif|webp)$/.test(a.mime)) blocks.push({ type: 'image', source: { type: 'base64', media_type: a.mime === 'image/jpg' ? 'image/jpeg' : a.mime, data: buf.toString('base64') } });
      else if (a.mime === 'application/pdf') blocks.push({ type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: buf.toString('base64') } });
      else if (a.pointCloud) blocks.push({ type: 'text', text: `[Point cloud ${a.name}: ${JSON.stringify(a.pointCloud)}]` });
      else if (buf.length < 200000) blocks.push({ type: 'text', text: `[Attachment ${a.name}]\n${buf.toString('utf8').slice(0, 40000)}` });
    } catch (e) { blocks.push({ type: 'text', text: `[Could not read attachment ${a.name}: ${e.message}]` }); }
  }
  blocks.push({ type: 'text', text });
  return blocks;
}

async function callClaude({ apiKey, model, project, messages, attachments }) {
  const summary = JSON.stringify({ name: project.name, description: project.description, jurisdiction: project.jurisdiction, occupancy: project.occupancy, construction: project.construction, stories: project.stories, totalArea: project.totalArea, sprinklered: project.sprinklered, climateZone: project.climateZone, footprint: project.footprint, phase: project.phase, program: project.program });
  const history = messages.slice(-12, -1).map((m) => ({ role: m.role === 'user' ? 'user' : 'assistant', content: m.role === 'user' ? m.text : m.text }));
  const last = messages[messages.length - 1];
  const body = {
    model,
    max_tokens: 4096,
    system: SYSTEM,
    messages: [...history, { role: 'user', content: contentBlocks(attachments, `Current project:\n${summary}\n\nUser request:\n${last.text}`) }],
  };
  // history must alternate and start with user
  while (body.messages.length > 1 && body.messages[0].role !== 'user') body.messages.shift();
  const out = [];
  for (const m of body.messages) { if (out.length && out[out.length - 1].role === m.role) { if (typeof m.content === 'string' && typeof out[out.length - 1].content === 'string') out[out.length - 1].content += `\n${m.content}`; else out.push(m); } else out.push(m); }
  body.messages = out;
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error?.message || `Anthropic API error ${res.status}`);
  const text = (data.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('\n');
  return parseJson(text);
}

function parseJson(text) {
  const a = text.indexOf('{'); const b = text.lastIndexOf('}');
  if (a < 0 || b < a) return { reply: text.trim() || 'No response.', updates: {}, codeNotes: [], assumptions: [] };
  try {
    const j = JSON.parse(text.slice(a, b + 1));
    return { reply: String(j.reply || 'Done.'), updates: j.updates && typeof j.updates === 'object' ? j.updates : {}, codeNotes: Array.isArray(j.codeNotes) ? j.codeNotes : [], assumptions: Array.isArray(j.assumptions) ? j.assumptions : [] };
  } catch {
    return { reply: text.slice(0, 1200), updates: {}, codeNotes: [], assumptions: [] };
  }
}

module.exports = { callClaude, parseJson };
