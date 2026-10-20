import { api } from './api.js';
import { PHASES, DISCIPLINES, OCCUPANCIES, CONSTRUCTION_TYPES, JURISDICTIONS, ROOM_TYPES } from '../engine/catalog.js';
import { newProject, applyUpdates, defaultProgram, uid } from '../engine/project.js';
import { generateSet } from '../engine/generate.js';
import { sheetSvg, printHtml } from '../engine/render.js';
import { sheetDxf } from '../engine/dxf.js';
import { interpret } from '../engine/assistant.js';
import { SHEET_W, SHEET_H } from '../engine/draw.js';

const $ = (s, r = document) => r.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const money = (n) => `$${Math.round(n).toLocaleString()}`;

const S = { projects: [], cur: null, set: null, tab: 'sheets', sheetId: null, settings: { model: 'claude-sonnet-5-5', enterprise: false, hasKey: false, firm: '' }, pending: [], busy: false, markMode: false, view: { x: 0, y: 0, k: 1 }, openMenu: null, dragOver: false };

// ---------------- persistence + generation ----------------
let saveTimer;
const persist = () => { clearTimeout(saveTimer); saveTimer = setTimeout(() => S.cur && api.saveProject(S.cur), 250); };
const hash = (str) => { let h = 2166136261; for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0).toString(36); };

function regenerate(summary) {
  const p = S.cur; const prev = new Map((p.sheets || []).map((s) => [s.id, s]));
  const set = generateSet(p, { enterprise: S.settings.enterprise });
  let changed = 0; let added = 0;
  p.sheets = set.sheets.map((sh) => {
    const hsh = hash(JSON.stringify(sh.items));
    const old = prev.get(sh.id);
    let status = old ? old.status : 'draft';
    if (old && old.hash !== hsh) { status = 'draft'; changed++; } else if (!old) added++;
    sh.status = status;
    return { id: sh.id, number: sh.number, title: sh.title, discipline: sh.discipline, status, hash: hsh };
  });
  const removed = [...prev.keys()].filter((id) => !p.sheets.find((s) => s.id === id)).length;
  if (prev.size && summary) p.revisions.push({ n: p.revisions.length + 1, date: Date.now(), summary: String(summary).slice(0, 240), changed, added, removed });
  if (p.approval.approved && changed) p.approval.approved = false;
  S.set = set;
  if (!S.sheetId || !p.sheets.find((s) => s.id === S.sheetId)) S.sheetId = p.sheets[1]?.id || p.sheets[0]?.id;
  p.updatedAt = Date.now();
  persist();
  return { changed, added, removed };
}

async function openProject(id) {
  S.cur = S.projects.find((p) => p.id === id); if (!S.cur) return;
  S.pending = []; S.sheetId = null; regenerate(); render();
}
async function loadAll() {
  S.settings = await api.getSettings();
  S.projects = await api.listProjects();
  if (S.projects.length) await openProject(S.projects[0].id); else render();
}

// ---------------- helpers ----------------
function toast(msg, ms = 3200) { const el = document.createElement('div'); el.className = 'toast'; el.textContent = msg; $('#toast-root').appendChild(el); setTimeout(() => el.remove(), ms); }
function modal(html, onMount) {
  const root = $('#modal-root'); root.innerHTML = `<div class="modal-bg"><div class="modal">${html}</div></div>`;
  const close = () => { root.innerHTML = ''; };
  root.querySelector('.modal-bg').addEventListener('mousedown', (e) => { if (e.target.classList.contains('modal-bg')) close(); });
  onMount?.(root.querySelector('.modal'), close); return close;
}
function askText(title, placeholder = '', initial = '') {
  return new Promise((res) => modal(`<h2>${esc(title)}</h2><textarea class="inp" id="q" rows="3" placeholder="${esc(placeholder)}">${esc(initial)}</textarea><div class="btns"><button class="btn" id="c">Cancel</button><button class="btn primary" id="o">Save</button></div>`, (m, close) => {
    const q = $('#q', m); q.focus();
    $('#c', m).onclick = () => { close(); res(null); }; $('#o', m).onclick = () => { close(); res(q.value.trim() || null); };
  }));
}
const opts = (obj, sel, fmt = (k, v) => v.name) => Object.entries(obj).map(([k, v]) => `<option value="${esc(k)}"${k === sel ? ' selected' : ''}>${esc(fmt(k, v))}</option>`).join('');

// ---------------- render ----------------
function render() {
  const app = $('#app');
  const keepChat = $('.msgs')?.scrollTop;
  app.innerHTML = `${sideHtml()}<section class="main">${S.cur ? mainHtml() : emptyHtml()}</section>${S.cur ? chatHtml() : '<aside class="chat"></aside>'}`;
  bind();
  const m = $('.msgs'); if (m) m.scrollTop = keepChat == null ? m.scrollHeight : (S.stickChat ? m.scrollHeight : keepChat);
  if (S.tab === 'sheets' && S.cur) mountViewer();
}

function sideHtml() {
  return `<aside class="side"><div class="brand"><div class="logo"><svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2"><path d="M3 21V8l9-5 9 5v13"/><path d="M9 21v-7h6v7"/></svg></div>Blueprints AI</div>
  <div class="actions"><button class="btn primary" id="new" style="flex:1">New project</button><button class="btn" id="import" title="Import project file">Import</button></div>
  <div class="plist">${S.projects.map((p) => `<div class="pitem ${S.cur?.id === p.id ? 'active' : ''}" data-id="${p.id}"><div><div class="n">${esc(p.name)}</div><div class="m">${esc(p.jurisdiction)} · ${p.stories} story · ${p.totalArea.toLocaleString()} sf</div></div><button class="x" data-del="${p.id}" title="Delete">×</button></div>`).join('') || '<div class="note" style="padding:12px">No projects yet.</div>'}</div>
  <div class="foot"><button class="btn sm" id="settings" style="flex:1">Settings</button></div></aside>`;
}
function emptyHtml() {
  return `<div class="empty"><div><svg width="54" height="54" viewBox="0 0 24 24" fill="none" stroke="#1f4fa3" stroke-width="1.6"><path d="M3 21V8l9-5 9 5v13"/><path d="M9 21v-7h6v7"/></svg><h2>Start your first permit set</h2><p>Describe a building, attach a sketch or site photo, and generate coordinated drawings across every discipline.</p><button class="btn primary" id="new2">New project</button></div></div>`;
}
function mainHtml() {
  const p = S.cur; const tabs = [['sheets', 'Sheets', p.sheets.length], ['program', 'Program'], ['code', 'Code'], ['cost', 'Cost'], ['review', 'Review', p.markups.filter((m) => !m.resolved).length || ''], ['setup', 'Setup']];
  return `<div class="head"><div class="row1"><input class="title" id="pname" value="${esc(p.name)}" spellcheck="false"><button class="btn" id="regen">Regenerate</button>
  <div class="menu"><button class="btn primary" id="exp">Export ▾</button>${S.openMenu === 'exp' ? `<div class="pop"><button data-exp="pdf">PDF set (36 x 24 in)</button><button data-exp="dxf">DXF files (CAD)</button><button data-exp="csv">Schedules and cost (CSV)</button><button data-exp="json">Project file (.json)</button></div>` : ''}</div></div>
  <div class="phases">${PHASES.map((ph) => `<button class="phase ${p.phase === ph.id ? 'active' : ''}" data-phase="${ph.id}">${ph.name}</button>`).join('')}</div>
  <div class="tabs">${tabs.map(([id, l, n]) => `<button class="tab ${S.tab === id ? 'active' : ''}" data-tab="${id}">${l}${n !== undefined && n !== '' ? `<span class="badge">${n}</span>` : ''}</button>`).join('')}</div></div>
  <div class="content ${S.tab === 'sheets' ? 'noscroll' : ''}">${({ sheets: sheetsHtml, program: programHtml, code: codeHtml, cost: costHtml, review: reviewHtml, setup: setupHtml })[S.tab]()}</div>`;
}

function sheetsHtml() {
  const p = S.cur; const groups = DISCIPLINES.map((d) => ({ d, list: p.sheets.filter((s) => s.discipline === d.id) })).filter((g) => g.list.length);
  const cur = p.sheets.find((s) => s.id === S.sheetId);
  const enterpriseOff = !S.settings.enterprise && p.phase !== 'programming' && p.phase !== 'schematic';
  return `<div class="viewer"><div class="slist">${groups.map((g) => `<div class="sgroup">${esc(g.d.name)}${g.d.enterprise ? ' · Enterprise' : ''}</div>${g.list.map((s) => `<div class="sitem ${s.id === S.sheetId ? 'active' : ''}" data-sheet="${s.id}"><span class="dot ${s.status}"></span><span class="no">${esc(s.number)}</span><span class="tt">${esc(s.title)}</span></div>`).join('')}`).join('')}${enterpriseOff ? '<div class="note" style="padding:12px 10px">Civil and landscape sheets are an Enterprise option. Turn them on in Settings.</div>' : ''}</div>
  <div class="vwrap"><div class="vbar"><b>${esc(cur?.number || '')}</b><span>${esc(cur?.title || '')}</span><span class="sp"></span>
   <button class="btn sm ${S.markMode ? 'primary' : ''}" id="markbtn">${S.markMode ? 'Click sheet to place pin' : 'Add markup'}</button>
   <select class="inp" id="sstatus" style="width:auto;padding:4px 8px"><option value="draft"${cur?.status === 'draft' ? ' selected' : ''}>Draft</option><option value="review"${cur?.status === 'review' ? ' selected' : ''}>In review</option><option value="approved"${cur?.status === 'approved' ? ' selected' : ''}>Approved</option></select>
   <button class="btn sm" id="zfit">Fit</button><button class="btn sm" id="zin">+</button><button class="btn sm" id="zout">−</button></div>
   <div class="vcanvas ${S.markMode ? 'mark' : ''}" id="vc"><div class="sheetbox" id="sb"></div></div></div></div>`;
}

function programHtml() {
  const p = S.cur; const prog = p.program.length ? p.program : defaultProgram(p.occupancy, p.totalArea, p.stories);
  const total = prog.reduce((s, r) => s + (+r.area || 0), 0);
  return `<div class="card"><div class="rowtools"><h3 style="margin:0;flex:1">Space program<small>${p.program.length ? 'custom' : 'default for this occupancy, edit to customize'}</small></h3><button class="btn sm" id="addroom">Add room</button><button class="btn sm primary" id="applyprog">Apply and regenerate</button></div>
  <table class="t"><thead><tr><th>Name</th><th>Type</th><th>Area (sf)</th><th>Level</th><th></th></tr></thead><tbody id="progbody">${prog.map((r, i) => progRow(r, i)).join('')}</tbody></table>
  <p class="note">Stairs, elevators, restrooms and mechanical/electrical rooms are added automatically when needed. Total listed: <b>${total.toLocaleString()} sf</b> of ${p.totalArea.toLocaleString()} sf gross target.</p></div>
  ${S.set ? `<div class="card"><h3>Laid out by level</h3>${S.set.layout.floors.map((f) => `<div class="note" style="margin:6px 0"><b>Level ${f.level}</b> · ${f.rooms.map((r) => `${esc(r.name)} (${Math.round(r.w * r.h)} sf)`).join(', ')}</div>`).join('')}</div>` : ''}`;
}
const progRow = (r, i) => `<tr data-i="${i}"><td><input class="inp" data-f="name" value="${esc(r.name)}"></td><td><select class="inp" data-f="type">${opts(ROOM_TYPES, r.type, (k, v) => v.label)}</select></td><td><input class="inp" data-f="area" type="number" min="20" value="${r.area}" style="width:100px"></td><td><input class="inp" data-f="floor" type="number" min="1" max="${S.cur.stories}" placeholder="auto" value="${r.floor ?? ''}" style="width:80px"></td><td><button class="btn sm ghost danger" data-rm="${i}">Remove</button></td></tr>`;

function codeHtml() {
  const a = S.set.analysis; const pl = a.plumbing;
  return `<div class="grid3" style="margin-bottom:14px"><div class="stat"><div class="v">${a.load.total}</div><div class="l">Occupant load</div></div><div class="stat"><div class="v">${a.travel.max} ft</div><div class="l">Longest travel (limit ${a.travel.limit} ft)</div></div><div class="stat"><div class="v">${a.exitsProv}/${a.exitsReq}</div><div class="l">Exits provided / required</div></div></div>
  <div class="card"><h3>Code compliance summary<small>${esc(a.editions)}</small></h3><table class="t"><thead><tr><th>Code</th><th>Section</th><th>Topic</th><th>Requirement</th><th>Provided</th><th>Status</th></tr></thead><tbody>${a.items.map((i) => `<tr><td><b>${esc(i.code)}</b></td><td>${esc(i.section)}</td><td>${esc(i.topic)}</td><td>${esc(i.req)}</td><td>${esc(i.prov)}</td><td><span class="pill ${i.status}">${i.status.toUpperCase()}</span></td></tr>`).join('')}</tbody></table></div>
  <div class="grid2"><div class="card"><h3>Plumbing fixtures<small>${esc(pl.rule)}</small></h3>${pl.dwelling ? '<p class="note">Per dwelling unit fixtures. See sheet P-201.</p>' : `<table class="t"><tbody><tr><td>Water closets (M / F)</td><td>${pl.wcM} / ${pl.wcF}</td></tr><tr><td>Urinals</td><td>${pl.urinalsM}</td></tr><tr><td>Lavatories (M / F)</td><td>${pl.lavM} / ${pl.lavF}</td></tr><tr><td>Drinking fountains</td><td>${pl.df}</td></tr><tr><td>Service sink</td><td>${pl.serviceSink}</td></tr></tbody></table>`}</div>
  <div class="card"><h3>Sprinklers</h3><p>${a.sprinkler.required ? 'Required' : 'Not required by occupancy trigger'}: ${esc(a.sprinkler.basis)}</p></div></div>
  ${S.cur.codeNotes.length ? `<div class="card"><h3>Project code notes<small>from the assistant</small></h3>${S.cur.codeNotes.map((c) => `<p><b>${esc(c.code)} ${esc(c.section)}</b> ${esc(c.note)}</p>`).join('')}</div>` : ''}
  ${S.cur.assumptions.length ? `<div class="card"><h3>Assumptions to confirm</h3><ul>${S.cur.assumptions.map((x) => `<li>${esc(x)}</li>`).join('')}</ul></div>` : ''}
  <p class="note">Code references are planning-level and must be verified against the editions and amendments adopted by your jurisdiction.</p>`;
}

function costHtml() {
  const c = S.set.cost; const max = Math.max(...c.lines.map((l) => l.amount));
  return `<div class="grid3" style="margin-bottom:14px"><div class="stat"><div class="v">${money(c.total)}</div><div class="l">Project total (planning level)</div></div><div class="stat"><div class="v">$${c.perSf}/sf</div><div class="l">Baseline x location ${c.factor}</div></div><div class="stat"><div class="v">${money(c.low)} – ${money(c.high)}</div><div class="l">Range, hard cost plus markups</div></div></div>
  <div class="card"><h3>Construction cost by discipline</h3><table class="t"><tbody>${c.lines.map((l) => `<tr><td style="width:150px;text-transform:capitalize">${esc(l.division)}</td><td><div class="bar"><i style="width:${(l.amount / max) * 100}%"></i></div></td><td style="text-align:right;width:120px">${money(l.amount)}</td></tr>`).join('')}<tr><td><b>Hard cost</b></td><td></td><td style="text-align:right"><b>${money(c.hard)}</b></td></tr><tr><td>General conditions, overhead and profit</td><td></td><td style="text-align:right">${money(c.general)}</td></tr><tr><td>Design contingency</td><td></td><td style="text-align:right">${money(c.contingency)}</td></tr><tr><td>Soft costs</td><td></td><td style="text-align:right">${money(c.soft)}</td></tr><tr><td><b>Total</b></td><td></td><td style="text-align:right"><b>${money(c.total)}</b></td></tr></tbody></table></div>
  <p class="note">Planning-level estimate on ${c.gross.toLocaleString()} gross sf. Replace with a quantity-based estimate as the design develops.</p>`;
}

function reviewHtml() {
  const p = S.cur; const ap = p.approval; const all = p.sheets.length && p.sheets.every((s) => s.status === 'approved');
  const sorted = [...p.markups];
  return `<div class="grid2"><div class="card"><h3>Markups<small>${p.markups.filter((m) => !m.resolved).length} open</small></h3>${sorted.map((m, i) => { const sh = p.sheets.find((s) => s.id === m.sheetId); return `<div class="mk ${m.resolved ? 'done' : ''}"><div class="no">${i + 1}</div><div style="flex:1"><div><b>${esc(sh?.number || '?')}</b> ${esc(m.text)}</div><div class="note">${new Date(m.date).toLocaleString()}</div></div><button class="btn sm" data-gomk="${m.id}">Go</button><button class="btn sm" data-resmk="${m.id}">${m.resolved ? 'Reopen' : 'Resolve'}</button><button class="btn sm ghost danger" data-delmk="${m.id}">×</button></div>`; }).join('') || '<p class="note">No markups yet. Use Add markup in the sheet viewer.</p>'}</div>
  <div><div class="card"><h3>Professional of record</h3><div class="form"><label class="f full">Name<input id="apby" value="${esc(ap.by)}" placeholder="Name of architect or engineer"></label><label class="f">License number<input id="aplic" value="${esc(ap.license)}"></label><label class="f">Date<input id="apdate" type="date" value="${esc(ap.date)}"></label></div>
  <div class="rowtools" style="margin-top:12px"><button class="btn" id="apreview">Send all to review</button><button class="btn primary" id="apall" ${p.sheets.length ? '' : 'disabled'}>Approve all sheets</button></div>
  <p class="note">${all ? 'Every sheet is approved. The PDF export carries the approval stamp.' : 'Approved sheets reset to Draft when a revision changes them. You remain the professional of record.'}</p></div>
  <div class="card"><h3>Sheet status</h3><table class="t"><tbody>${p.sheets.map((s) => `<tr><td><b>${esc(s.number)}</b></td><td>${esc(s.title)}</td><td><span class="pill ${s.status}">${s.status}</span></td></tr>`).join('')}</tbody></table></div>
  <div class="card"><h3>Revision history</h3>${[...p.revisions].reverse().map((r) => `<div class="mk"><div class="no" style="background:var(--accent)">${r.n}</div><div><div>${esc(r.summary)}</div><div class="note">${new Date(r.date).toLocaleString()} · ${r.changed} changed, ${r.added} added, ${r.removed} removed</div></div></div>`).join('') || '<p class="note">No revisions yet. Each change you request in chat is logged here.</p>'}</div></div></div>`;
}

function setupHtml() {
  const p = S.cur;
  return `<div class="card"><h3>Project setup</h3><div class="form">
  <label class="f full">Project description<textarea id="su_desc" rows="3">${esc(p.description)}</textarea></label>
  <label class="f">Jurisdiction<select id="su_j">${opts(JURISDICTIONS, p.jurisdiction, (k) => k)}</select></label>
  <label class="f">Occupancy<select id="su_o">${opts(OCCUPANCIES, p.occupancy)}</select></label>
  <label class="f">Construction type<select id="su_c">${opts(CONSTRUCTION_TYPES, p.construction, (k, v) => `${v.name} · ${v.desc}`)}</select></label>
  <label class="f">Stories<input id="su_s" type="number" min="1" max="12" value="${p.stories}"></label>
  <label class="f">Gross area (sf)<input id="su_a" type="number" min="400" step="100" value="${p.totalArea}"></label>
  <label class="f">California climate zone<input id="su_z" type="number" min="1" max="16" value="${p.climateZone}"></label>
  <label class="f">Footprint width (ft, optional)<input id="su_fw" type="number" min="15" value="${p.footprint?.width ?? ''}"></label>
  <label class="f">Footprint depth (ft, optional)<input id="su_fd" type="number" min="15" value="${p.footprint?.depth ?? ''}"></label>
  <label class="check full"><input type="checkbox" id="su_sp" ${p.sprinklered ? 'checked' : ''}> Fully sprinklered (NFPA 13)</label></div>
  <div class="rowtools" style="margin-top:14px"><button class="btn primary" id="su_apply">Apply and regenerate</button></div></div>`;
}

function chatHtml() {
  const p = S.cur; const sugg = p.messages.length ? ['Add a 400 sf conference room', 'Make it 3 stories', 'Remove sprinklers', 'Change occupancy to retail'] : ['Design a 2-story 8,000 sf office building in Austin', 'A 3,200 sf single-family home in Phoenix with 4 bedrooms', 'Restaurant, 4,500 sf, Los Angeles'];
  return `<aside class="chat" id="chat"><div class="ch"><span>Design assistant</span><small>${S.settings.hasKey ? esc(S.settings.model) : 'Offline mode'}</small></div>
  <div class="msgs">${p.messages.length ? p.messages.map(msgHtml).join('') : `<div class="msg assistant">Describe the project in plain language, or attach a hand sketch, site photo, PDF or point cloud. I keep the full project history, so you can ask for changes any time and every discipline updates together.${S.settings.hasKey ? '' : '\n\nOffline mode handles direct edits (stories, area, rooms, occupancy, footprint). Add an Anthropic API key in Settings to read sketches and photos and to take free-form requests.'}</div>`}${S.busy ? '<div class="msg assistant"><div class="typing"><i></i><i></i><i></i></div></div>' : ''}</div>
  <div class="chips">${sugg.map((s) => `<button class="chip" data-sugg="${esc(s)}">${esc(s)}</button>`).join('')}</div>
  <div class="composer ${S.dragOver ? 'dropping' : ''}" id="comp">${S.pending.length ? `<div class="atts">${S.pending.map((a, i) => `<span class="att-chip">${esc(a.name)}<button data-rmatt="${i}">×</button></span>`).join('')}</div>` : ''}
  <textarea id="msg" placeholder="Describe your project or ask for a change..."></textarea><div class="row"><button class="btn sm" id="attach">Attach</button><span class="sp"></span><button class="btn primary" id="send" ${S.busy ? 'disabled' : ''}>Send</button></div><input type="file" id="file" multiple hidden accept="image/*,.pdf,.txt,.csv,.xyz,.pts,.asc,.dxf,.json,.md"></div></aside>`;
}
const msgHtml = (m) => `<div class="msg ${m.role}${m.err ? ' err' : ''}">${esc(m.text)}${m.atts?.length ? `<span class="att">📎 ${m.atts.map(esc).join(', ')}</span>` : ''}</div>`;

// ---------------- viewer ----------------
function mountViewer() {
  const vc = $('#vc'); const sb = $('#sb'); if (!vc || !sb || !S.set) return;
  const sheet = S.set.sheets.find((s) => s.id === S.sheetId); if (!sheet) return;
  const idx = S.set.sheets.indexOf(sheet); const meta = S.cur.sheets.find((s) => s.id === sheet.id); sheet.status = meta?.status || 'draft';
  const W = 1500; sb.style.width = `${W}px`; sb.style.height = `${(W * SHEET_H) / SHEET_W}px`;
  sb.innerHTML = sheetSvg(S.cur, sheet, S.set.sheets.length, idx + 1, { width: `${W}px`, markups: S.cur.markups });
  const fit = () => { const k = Math.min((vc.clientWidth - 40) / W, (vc.clientHeight - 40) / ((W * SHEET_H) / SHEET_W)); S.view = { k, x: (vc.clientWidth - W * k) / 2, y: (vc.clientHeight - ((W * SHEET_H) / SHEET_W) * k) / 2 }; apply(); };
  const apply = () => { sb.style.transform = `translate(${S.view.x}px,${S.view.y}px) scale(${S.view.k})`; };
  if (S.view.k === 1 && S.view.x === 0) fit(); else apply();
  const zoom = (f, cx = vc.clientWidth / 2, cy = vc.clientHeight / 2) => { const k = Math.min(8, Math.max(0.1, S.view.k * f)); S.view.x = cx - ((cx - S.view.x) / S.view.k) * k; S.view.y = cy - ((cy - S.view.y) / S.view.k) * k; S.view.k = k; apply(); };
  vc.onwheel = (e) => { e.preventDefault(); const r = vc.getBoundingClientRect(); zoom(e.deltaY < 0 ? 1.12 : 0.89, e.clientX - r.left, e.clientY - r.top); };
  let drag = null; let moved = false;
  vc.onmousedown = (e) => { drag = { x: e.clientX, y: e.clientY, vx: S.view.x, vy: S.view.y }; moved = false; vc.classList.add('drag'); };
  window.onmousemove = (e) => { if (!drag) return; const dx = e.clientX - drag.x; const dy = e.clientY - drag.y; if (Math.abs(dx) + Math.abs(dy) > 3) moved = true; S.view.x = drag.vx + dx; S.view.y = drag.vy + dy; apply(); };
  window.onmouseup = async (e) => {
    vc.classList.remove('drag'); const was = drag; drag = null;
    if (was && !moved && S.markMode && vc.contains(e.target)) {
      const svg = sb.querySelector('svg'); const pt = svg.createSVGPoint(); pt.x = e.clientX; pt.y = e.clientY; const loc = pt.matrixTransform(svg.getScreenCTM().inverse());
      const text = await askText('Markup comment', 'Describe the change or question for this location'); S.markMode = false;
      if (text) { S.cur.markups.push({ id: uid('mk'), sheetId: sheet.id, x: loc.x, y: loc.y, text, resolved: false, date: Date.now() }); persist(); toast('Markup added'); }
      render();
    }
  };
  $('#zfit').onclick = fit; $('#zin').onclick = () => zoom(1.25); $('#zout').onclick = () => zoom(0.8);
}

// ---------------- events ----------------
function bind() {
  $('#new')?.addEventListener('click', newProjectDialog); $('#new2')?.addEventListener('click', newProjectDialog);
  $('#import')?.addEventListener('click', async () => { const r = await api.importJson(); if (r.data?.id && r.data?.name) { r.data.id = uid('prj'); S.projects.unshift(r.data); await api.saveProject(r.data); await openProject(r.data.id); toast('Project imported'); } else if (!r.canceled) toast('That file is not a project'); });
  $('#settings')?.addEventListener('click', settingsDialog);
  document.querySelectorAll('.pitem').forEach((el) => el.addEventListener('click', (e) => { if (e.target.dataset.del) return; openProject(el.dataset.id); }));
  document.querySelectorAll('[data-del]').forEach((b) => b.addEventListener('click', async (e) => { e.stopPropagation(); const id = b.dataset.del; const p = S.projects.find((x) => x.id === id); if (!confirm(`Delete "${p.name}"? This cannot be undone.`)) return; await api.deleteProject(id); S.projects = S.projects.filter((x) => x.id !== id); if (S.cur?.id === id) { S.cur = null; S.set = null; if (S.projects[0]) await openProject(S.projects[0].id); } render(); }));
  if (!S.cur) return;
  $('#pname')?.addEventListener('change', (e) => { S.cur.name = e.target.value.trim() || 'Untitled project'; syncList(); persist(); render(); });
  $('#regen')?.addEventListener('click', () => { const r = regenerate('Manual regeneration'); render(); toast(r.changed ? `${r.changed} sheet${r.changed > 1 ? 's' : ''} changed` : 'Set is up to date'); });
  $('#exp')?.addEventListener('click', (e) => { e.stopPropagation(); S.openMenu = S.openMenu === 'exp' ? null : 'exp'; render(); });
  document.querySelectorAll('[data-exp]').forEach((b) => b.addEventListener('click', () => { S.openMenu = null; render(); doExport(b.dataset.exp); }));
  document.querySelectorAll('[data-phase]').forEach((b) => b.addEventListener('click', () => { S.cur.phase = b.dataset.phase; const r = regenerate(`Phase changed to ${PHASES.find((x) => x.id === S.cur.phase).name}`); if (S.cur.phase === 'cost') S.tab = 'cost'; render(); toast(`${S.cur.sheets.length} sheets for this phase`); }));
  document.querySelectorAll('[data-tab]').forEach((b) => b.addEventListener('click', () => { S.tab = b.dataset.tab; S.openMenu = null; render(); }));
  document.querySelectorAll('[data-sheet]').forEach((b) => b.addEventListener('click', () => { S.sheetId = b.dataset.sheet; S.view = { x: 0, y: 0, k: 1 }; render(); }));
  $('#markbtn')?.addEventListener('click', () => { S.markMode = !S.markMode; render(); });
  $('#sstatus')?.addEventListener('change', (e) => setStatus(S.sheetId, e.target.value));
  // program
  $('#addroom')?.addEventListener('click', () => { materializeProgram(); S.cur.program.push({ id: uid('rm'), name: 'New room', type: 'office', area: 150, floor: null }); render(); });
  $('#progbody')?.addEventListener('input', (e) => { materializeProgram(); const tr = e.target.closest('tr'); const r = S.cur.program[+tr.dataset.i]; const f = e.target.dataset.f; r[f] = f === 'area' ? +e.target.value : f === 'floor' ? (e.target.value ? +e.target.value : null) : e.target.value; });
  document.querySelectorAll('[data-rm]').forEach((b) => b.addEventListener('click', () => { materializeProgram(); S.cur.program.splice(+b.dataset.rm, 1); render(); }));
  $('#applyprog')?.addEventListener('click', () => { materializeProgram(); S.cur.program = S.cur.program.map((r) => ({ ...r, area: Math.max(20, +r.area || 100) })); const r = regenerate('Program edited'); render(); toast(`Program applied, ${r.changed} sheet(s) changed`); });
  // review
  document.querySelectorAll('[data-gomk]').forEach((b) => b.addEventListener('click', () => { const m = S.cur.markups.find((x) => x.id === b.dataset.gomk); S.sheetId = m.sheetId; S.tab = 'sheets'; S.view = { x: 0, y: 0, k: 1 }; render(); }));
  document.querySelectorAll('[data-resmk]').forEach((b) => b.addEventListener('click', () => { const m = S.cur.markups.find((x) => x.id === b.dataset.resmk); m.resolved = !m.resolved; persist(); render(); }));
  document.querySelectorAll('[data-delmk]').forEach((b) => b.addEventListener('click', () => { S.cur.markups = S.cur.markups.filter((x) => x.id !== b.dataset.delmk); persist(); render(); }));
  ['apby', 'aplic', 'apdate'].forEach((id) => $('#' + id)?.addEventListener('change', (e) => { S.cur.approval[{ apby: 'by', aplic: 'license', apdate: 'date' }[id]] = e.target.value; persist(); }));
  $('#apreview')?.addEventListener('click', () => { S.cur.sheets.forEach((s) => { if (s.status !== 'approved') s.status = 'review'; }); persist(); render(); });
  $('#apall')?.addEventListener('click', () => { const a = S.cur.approval; if (!a.by.trim() || !a.license.trim()) { toast('Enter the professional name and license first'); return; } if (!a.date) a.date = new Date().toISOString().slice(0, 10); S.cur.sheets.forEach((s) => { s.status = 'approved'; }); a.approved = true; persist(); render(); toast('All sheets approved'); });
  // setup
  $('#su_apply')?.addEventListener('click', () => {
    const fw = +$('#su_fw').value; const fd = +$('#su_fd').value;
    S.cur = applyUpdates(S.cur, { description: $('#su_desc').value, jurisdiction: $('#su_j').value, occupancy: $('#su_o').value, construction: $('#su_c').value, stories: +$('#su_s').value, totalArea: +$('#su_a').value, climateZone: +$('#su_z').value, sprinklered: $('#su_sp').checked, footprint: fw && fd ? { width: fw, depth: fd } : null });
    S.projects = S.projects.map((p) => (p.id === S.cur.id ? S.cur : p)); regenerate('Project setup changed'); render(); toast('Setup applied');
  });
  // chat
  const msg = $('#msg');
  $('#send')?.addEventListener('click', () => sendMessage());
  msg?.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); } });
  document.querySelectorAll('[data-sugg]').forEach((b) => b.addEventListener('click', () => { msg.value = b.dataset.sugg; msg.focus(); }));
  $('#attach')?.addEventListener('click', () => $('#file').click());
  $('#file')?.addEventListener('change', async (e) => { await addFiles([...e.target.files]); });
  document.querySelectorAll('[data-rmatt]').forEach((b) => b.addEventListener('click', () => { S.pending.splice(+b.dataset.rmatt, 1); const t = msg.value; render(); $('#msg').value = t; }));
  const comp = $('#chat');
  if (comp) {
    comp.ondragover = (e) => { e.preventDefault(); if (!S.dragOver) { S.dragOver = true; $('#comp')?.classList.add('dropping'); } };
    comp.ondragleave = (e) => { if (e.target === comp) { S.dragOver = false; $('#comp')?.classList.remove('dropping'); } };
    comp.ondrop = async (e) => { e.preventDefault(); S.dragOver = false; await addFiles([...e.dataTransfer.files]); };
  }
}
document.addEventListener('click', () => { if (S.openMenu) { S.openMenu = null; const pop = $('.menu .pop'); pop?.remove(); } });

const syncList = () => { S.projects = S.projects.map((p) => (p.id === S.cur.id ? S.cur : p)); };
function materializeProgram() { if (!S.cur.program.length) S.cur.program = defaultProgram(S.cur.occupancy, S.cur.totalArea, S.cur.stories).map((r) => ({ id: uid('rm'), floor: null, ...r })); }

function setStatus(id, status) {
  const a = S.cur.approval;
  if (status === 'approved' && (!a.by.trim() || !a.license.trim())) {
    modal(`<h2>Professional of record</h2><p class="note">Approval needs the name and license of the architect or engineer who reviewed the sheet.</p><div class="form"><label class="f full">Name<input id="mn" value="${esc(a.by)}"></label><label class="f">License number<input id="ml" value="${esc(a.license)}"></label></div><div class="btns"><button class="btn" id="c">Cancel</button><button class="btn primary" id="o">Approve sheet</button></div>`, (m, close) => {
      $('#c', m).onclick = () => { close(); render(); };
      $('#o', m).onclick = () => { if (!$('#mn', m).value.trim() || !$('#ml', m).value.trim()) return; a.by = $('#mn', m).value.trim(); a.license = $('#ml', m).value.trim(); a.date = a.date || new Date().toISOString().slice(0, 10); close(); setStatus(id, 'approved'); };
    });
    return;
  }
  const m = S.cur.sheets.find((s) => s.id === id); if (m) m.status = status; persist(); render();
}

async function addFiles(files) {
  for (const f of files) {
    if (f.size > 25 * 1024 * 1024) { toast(`${f.name} is larger than 25 MB`); continue; }
    const base64 = await new Promise((res) => { const r = new FileReader(); r.onload = () => res(String(r.result).split(',')[1] || ''); r.readAsDataURL(f); });
    const meta = await api.saveAttachment({ projectId: S.cur.id, name: f.name, mime: f.type, base64 });
    S.pending.push(meta);
  }
  const t = $('#msg')?.value; render(); if ($('#msg')) $('#msg').value = t || '';
}

async function sendMessage(textOverride) {
  const box = $('#msg'); const text = (textOverride ?? box?.value ?? '').trim();
  if ((!text && !S.pending.length) || S.busy) return;
  const p = S.cur; const atts = S.pending; S.pending = [];
  p.messages.push({ role: 'user', text: text || 'See attached.', atts: atts.map((a) => a.name), date: Date.now() });
  S.busy = true; S.stickChat = true; render();
  let reply = ''; let updates = {}; let extra = {};
  try {
    const res = S.settings.hasKey ? await api.chat({ project: p, messages: p.messages.map((m) => ({ role: m.role, text: m.text })), attachments: atts }) : { error: 'no-key' };
    if (res.result) { reply = res.result.reply; updates = res.result.updates || {}; extra = { codeNotes: res.result.codeNotes, assumptions: res.result.assumptions }; }
    else {
      const off = interpret(p, text);
      updates = off.updates; reply = off.reply;
      const pc = atts.find((a) => a.pointCloud)?.pointCloud;
      if (pc && pc.widthFt > 10 && pc.depthFt > 10) { updates.footprint = { width: Math.round(pc.widthFt), depth: Math.round(pc.depthFt) }; if (pc.heightFt > 14) updates.stories = Math.max(1, Math.round(pc.heightFt / 12)); reply = `Point cloud read: ${pc.points.toLocaleString()} points, about ${pc.widthFt} x ${pc.depthFt} ft footprint and ${pc.heightFt} ft tall (assuming ${pc.unit}). Footprint updated. ${off.changed ? reply : ''}`.trim(); }
      else if (atts.some((a) => /^image\/|pdf$/.test(a.mime))) reply = `${reply ? reply + ' ' : ''}I saved your attachment, but reading sketches, photos and PDFs needs an Anthropic API key (Settings).`.trim();
      if (res.error && res.error !== 'no-key') reply = `${res.error}\n\n${reply}`;
    }
  } catch (err) { reply = `Something went wrong: ${err.message || err}`; p.messages.push({ role: 'assistant', text: reply, err: true, date: Date.now() }); S.busy = false; render(); return; }
  const hasUpdates = Object.keys(updates).length > 0 || extra.codeNotes?.length || extra.assumptions?.length;
  if (hasUpdates) {
    const merged = applyUpdates(p, { ...updates, codeNotes: extra.codeNotes ?? updates.codeNotes, assumptions: extra.assumptions ?? updates.assumptions });
    if (!extra.codeNotes) merged.codeNotes = p.codeNotes; if (!extra.assumptions) merged.assumptions = p.assumptions;
    Object.assign(p, merged);
    if (!p.messages.slice(0, -1).length && updates.name == null && /^(design|a |an |build|create)/i.test(text)) p.name = deriveName(p, text);
    const r = regenerate(reply.split('.')[0] || 'Revision');
    reply += r.changed || r.added ? `\n\nUpdated ${r.changed + r.added} sheet${r.changed + r.added === 1 ? '' : 's'}.` : '';
    syncList();
  }
  p.messages.push({ role: 'assistant', text: reply, date: Date.now() });
  S.busy = false; persist(); render();
}
function deriveName(p, text) { const o = OCCUPANCIES[p.occupancy].name.split(' - ')[1] || 'Project'; const city = p.jurisdiction.split(',')[0]; return `${city} ${o}`.replace(/\(.*\)/, '').trim(); }

// ---------------- dialogs ----------------
function newProjectDialog() {
  modal(`<h2>New project</h2><div class="form"><label class="f full">Project name<input id="n_name" placeholder="e.g. Harbor Street Offices"></label>
  <label class="f">Jurisdiction<select id="n_j">${opts(JURISDICTIONS, 'Los Angeles, CA', (k) => k)}</select></label>
  <label class="f">Occupancy<select id="n_o">${opts(OCCUPANCIES, 'B')}</select></label>
  <label class="f">Stories<input id="n_s" type="number" min="1" max="12" value="2"></label>
  <label class="f">Gross area (sf)<input id="n_a" type="number" min="400" step="100" value="6000"></label>
  <label class="f full">Start at phase<select id="n_p">${PHASES.map((x) => `<option value="${x.id}"${x.id === 'cd' ? ' selected' : ''}>${x.name}</option>`).join('')}</select></label>
  <label class="f full">Description (optional)<textarea id="n_d" rows="3" placeholder="What are you building?"></textarea></label></div>
  <div class="btns"><button class="btn" id="c">Cancel</button><button class="btn primary" id="o">Create and generate</button></div>`, (m, close) => {
    $('#n_name', m).focus(); $('#c', m).onclick = close;
    $('#o', m).onclick = async () => {
      let p = newProject({ name: $('#n_name', m).value.trim() || 'Untitled project', phase: $('#n_p', m).value });
      p = applyUpdates(p, { jurisdiction: $('#n_j', m).value, occupancy: $('#n_o', m).value, stories: +$('#n_s', m).value, totalArea: +$('#n_a', m).value, description: $('#n_d', m).value });
      S.projects.unshift(p); S.cur = p; S.tab = 'sheets'; S.sheetId = null; S.view = { x: 0, y: 0, k: 1 }; regenerate(); await api.saveProject(p); close(); render(); toast(`Generated ${p.sheets.length} sheets`);
    };
  });
}

function settingsDialog() {
  const s = S.settings;
  modal(`<h2>Settings</h2><div class="form"><label class="f full">Anthropic API key<input id="s_key" type="password" value="${esc(s.apiKey || '')}" placeholder="sk-ant-..." autocomplete="off"></label>
  <p class="note full" style="margin:-4px 0 0">Used for reading sketches, photos and PDFs and for free-form design requests. Stored encrypted on this computer and sent only to api.anthropic.com. Leave empty to use offline mode.</p>
  <label class="f full">Model<input id="s_model" value="${esc(s.model)}"></label>
  <label class="f full">Firm name (shown in exports)<input id="s_firm" value="${esc(s.firm || '')}"></label>
  <label class="check full"><input type="checkbox" id="s_ent" ${s.enterprise ? 'checked' : ''}> Include Enterprise sheets (civil and landscape)</label></div>
  <div class="btns"><button class="btn" id="c">Cancel</button><button class="btn primary" id="o">Save</button></div>`, (m, close) => {
    $('#c', m).onclick = close;
    $('#o', m).onclick = async () => {
      S.settings = await api.setSettings({ apiKey: $('#s_key', m).value, model: $('#s_model', m).value.trim() || 'claude-sonnet-5-5', firm: $('#s_firm', m).value, enterprise: $('#s_ent', m).checked });
      close(); if (S.cur) regenerate(); render(); toast('Settings saved');
    };
  });
}

// ---------------- export ----------------
async function doExport(kind) {
  const p = S.cur; const name = p.name.replace(/[^a-z0-9]+/gi, '_');
  S.set.sheets.forEach((sh) => { sh.status = p.sheets.find((x) => x.id === sh.id)?.status || 'draft'; });
  let r;
  if (kind === 'pdf') { toast('Building PDF...'); r = await api.exportPdf({ html: printHtml(p, S.set.sheets, { markups: [] }), defaultName: `${name}_permit_set` }); }
  else if (kind === 'dxf') r = await api.exportFiles({ files: S.set.sheets.map((s) => ({ name: `${s.number}.dxf`, content: sheetDxf(s) })) });
  else if (kind === 'json') r = await api.exportText({ content: JSON.stringify(p, null, 2), defaultName: `${name}`, ext: 'json' });
  else if (kind === 'csv') r = await api.exportText({ content: buildCsv(), defaultName: `${name}_schedules`, ext: 'csv' });
  if (r && !r.canceled) toast(`Exported to ${r.path}`);
}
function buildCsv() {
  const q = (v) => `"${String(v).replace(/"/g, '""')}"`; const rows = []; const add = (...c) => rows.push(c.map(q).join(','));
  const { layout, cost, analysis } = S.set;
  add('ROOM SCHEDULE'); add('Level', 'Room', 'Type', 'Width ft', 'Depth ft', 'Area sf');
  layout.floors.forEach((f) => f.rooms.forEach((r) => add(f.level, r.name, ROOM_TYPES[r.type].label, r.w, r.h, Math.round(r.w * r.h))));
  add(''); add('DOOR SCHEDULE'); add('No.', 'Room', 'Width ft', 'Exit');
  layout.floors.forEach((f) => f.doors.forEach((d) => add(d.tag, f.rooms.find((r) => r.id === d.roomId)?.name || 'Corridor', d.w, d.exit ? 'yes' : 'no')));
  add(''); add('CODE SUMMARY'); add('Code', 'Section', 'Topic', 'Requirement', 'Provided', 'Status'); analysis.items.forEach((i) => add(i.code, i.section, i.topic, i.req, i.prov, i.status));
  add(''); add('COST ESTIMATE'); add('Division', 'Amount'); cost.lines.forEach((l) => add(l.division, l.amount)); add('Hard cost', cost.hard); add('General conditions', cost.general); add('Contingency', cost.contingency); add('Soft costs', cost.soft); add('Total', cost.total);
  return rows.join('\n');
}

window.__bp = S; // handy for debugging and tests
loadAll();
