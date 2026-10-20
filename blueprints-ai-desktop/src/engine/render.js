import { SHEET_W, SHEET_H, COLORS, AREA } from './draw.js';
import { DISCIPLINES } from './catalog.js';

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const col = (c) => COLORS[c] || c || COLORS.ink;
const f = (n) => Math.round(n * 1000) / 1000;

function primSvg(p, s) {
  const sw = (w) => `stroke-width="${f(Math.max(0.15, (w ?? 1) * 0.45))}" vector-effect="non-scaling-stroke"`;
  const dash = (d) => (d ? ` stroke-dasharray="${d.split(' ').map((v) => f(Number(v) * 1.4)).join(' ')}"` : '');
  // stroke widths are in sheet units (non-scaling), so no division by s
  switch (p.t) {
    case 'line': return `<line x1="${f(p.x1)}" y1="${f(p.y1)}" x2="${f(p.x2)}" y2="${f(p.y2)}" stroke="${col(p.c)}" ${sw(p.w)}${dash(p.dash)} stroke-linecap="round"/>`;
    case 'rect': return `<rect x="${f(p.x)}" y="${f(p.y)}" width="${f(p.w)}" height="${f(p.h)}" fill="${p.fill ? col(p.fill) : 'none'}" stroke="${p.lw === 0 ? 'none' : col(p.c)}" ${sw(p.lw)}${dash(p.dash)}/>`;
    case 'circle': return `<circle cx="${f(p.cx)}" cy="${f(p.cy)}" r="${f(p.r)}" fill="${p.fill ? col(p.fill) : 'none'}" stroke="${p.lw === 0 ? 'none' : col(p.c)}" ${sw(p.lw)}${dash(p.dash)}/>`;
    case 'path': return `<path d="${p.d}" fill="${p.fill ? col(p.fill) : 'none'}" stroke="${col(p.c)}" ${sw(p.lw)}${dash(p.dash)}/>`;
    case 'poly': return `<${p.closed ? 'polygon' : 'polyline'} points="${p.pts.map((q) => `${f(q[0])},${f(q[1])}`).join(' ')}" fill="${p.fill ? col(p.fill) : 'none'}" stroke="${col(p.c)}" ${sw(p.lw)}${dash(p.dash)} stroke-linejoin="round"/>`;
    case 'text': {
      const fs = f(p.h / s);
      const tr = p.rot ? ` transform="rotate(${p.rot} ${f(p.x)} ${f(p.y)})"` : '';
      return `<text x="${f(p.x)}" y="${f(p.y)}" font-size="${fs}" text-anchor="${p.anchor}" fill="${col(p.c)}"${p.bold ? ' font-weight="700"' : ''}${tr}>${esc(p.s)}</text>`;
    }
    default: return '';
  }
}

export function sheetBody(sheet) {
  return sheet.items.map((it) => `<g transform="translate(${f(it.ox)} ${f(it.oy)}) scale(${f(it.s)})">${it.prims.map((p) => primSvg(p, it.s)).join('')}</g>`).join('');
}

/** Border and title block (right strip). */
export function titleBlock(project, sheet, total, index, opts = {}) {
  const x = 952; const w = 110; const disc = DISCIPLINES.find((d) => d.id === sheet.discipline)?.name || '';
  const statusTxt = sheet.status === 'approved' ? 'APPROVED FOR PERMIT' : sheet.status === 'review' ? 'IN REVIEW' : 'DRAFT - NOT FOR CONSTRUCTION';
  const lines = (txt, max) => { const out = []; let cur = ''; for (const wd of String(txt).split(' ')) { if ((cur + wd).length > max) { out.push(cur.trim()); cur = ''; } cur += wd + ' '; } out.push(cur.trim()); return out; };
  let y = 40; const t = [];
  const label = (l, v, size = 6.4, max = 22, bold = false) => { t.push(`<text x="${x + 5}" y="${y}" font-size="4" fill="#777">${esc(l)}</text>`); y += 8; for (const ln of lines(v, max)) { t.push(`<text x="${x + 5}" y="${y}" font-size="${size}"${bold ? ' font-weight="700"' : ''}>${esc(ln)}</text>`); y += size + 2.4; } y += 4; t.push(`<line x1="${x}" y1="${y - 6}" x2="${x + w}" y2="${y - 6}" stroke="#555" stroke-width="0.4"/>`); };
  t.push(`<rect x="${x}" y="24" width="${w}" height="672" fill="#fff" stroke="#111" stroke-width="1.2"/>`);
  t.push(`<text x="${x + 5}" y="34" font-size="5.4" font-weight="700" letter-spacing="0.6">BLUEPRINTS AI DESKTOP</text>`);
  y = 50;
  label('PROJECT', project.name, 7.4, 17, true);
  label('JURISDICTION', project.jurisdiction, 5.6);
  label('DISCIPLINE', disc, 5.6);
  label('SHEET TITLE', sheet.title, 7, 17, true);
  label('REVISION', project.revisions.length ? `Rev ${project.revisions.length} - ${new Date(project.revisions[project.revisions.length - 1].date).toLocaleDateString()}` : 'Rev 0', 5.6);
  label('SHEET', `${index} of ${total}`, 5.6);
  label('STATUS', statusTxt, 5.2, 22, true);
  t.push(`<rect x="${x + 6}" y="560" width="${w - 12}" height="62" fill="none" stroke="#999" stroke-width="0.5" stroke-dasharray="3 2"/>`);
  t.push(`<text x="${x + w / 2}" y="${sheet.status === 'approved' && project.approval.by ? 576 : 594}" font-size="4.6" fill="#999" text-anchor="middle">${sheet.status === 'approved' && project.approval.by ? 'REVIEWED AND APPROVED' : 'SEAL / STAMP'}</text>`);
  if (sheet.status === 'approved' && project.approval.by) {
    t.push(`<text x="${x + w / 2}" y="588" font-size="5.2" font-weight="700" text-anchor="middle">${esc(project.approval.by)}</text>`);
    t.push(`<text x="${x + w / 2}" y="598" font-size="4.6" text-anchor="middle">Lic. ${esc(project.approval.license || '-')}</text>`);
    t.push(`<text x="${x + w / 2}" y="607" font-size="4.6" text-anchor="middle">${esc(project.approval.date || '')}</text>`);
  }
  t.push(`<text x="${x + w / 2}" y="${AREA.y + 664}" font-size="${sheet.number.length > 5 ? 20 : 28}" font-weight="700" text-anchor="middle">${esc(sheet.number)}</text>`);
  t.push(`<text x="${x + w / 2}" y="${AREA.y + 640 - 4}" font-size="4.4" fill="#777" text-anchor="middle">SHEET NUMBER</text>`);
  void opts;
  return `<rect x="12" y="12" width="1056" height="696" fill="none" stroke="#111" stroke-width="1.4"/><rect x="18" y="18" width="1044" height="684" fill="none" stroke="#111" stroke-width="0.5"/>${t.join('')}`;
}

export function sheetSvg(project, sheet, total, index, o = {}) {
  const pins = (o.markups || []).filter((m) => m.sheetId === sheet.id).map((m, i) => `<g data-markup="${m.id}" transform="translate(${f(m.x)} ${f(m.y)})"><circle r="7" fill="${m.resolved ? '#2e8b57' : '#d9382b'}" stroke="#fff" stroke-width="1"/><text y="3.2" font-size="8" fill="#fff" text-anchor="middle" font-weight="700">${i + 1}</text></g>`).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${SHEET_W} ${SHEET_H}" width="${o.width || '100%'}" font-family="Helvetica, Arial, sans-serif" data-sheet="${sheet.id}"><rect width="${SHEET_W}" height="${SHEET_H}" fill="#fff"/><g class="sheet-body">${sheetBody(sheet)}</g>${titleBlock(project, sheet, total, index)}<g class="pins">${pins}</g></svg>`;
}

export function printHtml(project, sheets, o = {}) {
  const pages = sheets.map((s, i) => `<div class="pg">${sheetSvg(project, s, sheets.length, i + 1, { width: '100%', markups: o.markups })}</div>`).join('');
  return `<!doctype html><html><head><meta charset="utf-8"><style>@page{size:36in 24in;margin:0}html,body{margin:0;padding:0;background:#fff}.pg{width:36in;height:24in;page-break-after:always;overflow:hidden}.pg svg{width:36in;height:24in;display:block}</style></head><body>${pages}</body></html>`;
}
