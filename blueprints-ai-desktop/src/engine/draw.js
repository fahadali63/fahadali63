// Drawing primitives. Model coordinates are feet (x east, y south). Each sheet is
// a list of viewports; a viewport maps model feet to sheet units (30 units = 1 inch
// on a 36x24 in sheet) so the same data renders to SVG, PDF and DXF.

export const SHEET_W = 1080;
export const SHEET_H = 720;
export const AREA = { x: 24, y: 24, w: 918, h: 672 };
export const SCALES = [
  ['1/32" = 1\'-0"', 0.9375], ['1/16" = 1\'-0"', 1.875], ['3/32" = 1\'-0"', 2.8125], ['1/8" = 1\'-0"', 3.75],
  ['3/16" = 1\'-0"', 5.625], ['1/4" = 1\'-0"', 7.5], ['3/8" = 1\'-0"', 11.25], ['1/2" = 1\'-0"', 15], ['3/4" = 1\'-0"', 22.5], ['1" = 1\'-0"', 30],
];

export const P = {
  line: (x1, y1, x2, y2, o = {}) => ({ t: 'line', x1, y1, x2, y2, w: o.w ?? 1, c: o.c ?? 'ink', dash: o.dash }),
  rect: (x, y, w, h, o = {}) => ({ t: 'rect', x, y, w, h, fill: o.fill, lw: o.w ?? 1, c: o.c ?? 'ink', dash: o.dash }),
  circ: (cx, cy, r, o = {}) => ({ t: 'circle', cx, cy, r, fill: o.fill, lw: o.w ?? 1, c: o.c ?? 'ink', dash: o.dash }),
  text: (x, y, s, o = {}) => ({ t: 'text', x, y, s: String(s), h: o.h ?? 6, anchor: o.anchor ?? 'start', rot: o.rot ?? 0, c: o.c ?? 'ink', bold: !!o.bold }),
  path: (d, o = {}) => ({ t: 'path', d, lw: o.w ?? 1, c: o.c ?? 'ink', fill: o.fill, dash: o.dash }),
  poly: (pts, o = {}) => ({ t: 'poly', pts, fill: o.fill, lw: o.w ?? 1, c: o.c ?? 'ink', closed: o.closed ?? true, dash: o.dash }),
};

export const COLORS = {
  ink: '#1b1b1b', light: '#9a9a9a', mid: '#5c5c5c', red: '#c0392b', blue: '#1f5fa8', green: '#2e8b57',
  orange: '#d9822b', paper: '#ffffff', cyan: '#168a9a', magenta: '#a23b8c',
};

export function fitScale(w, h, box) {
  let pick = SCALES[0];
  for (const sc of SCALES) if (w * sc[1] <= box.w && h * sc[1] <= box.h) pick = sc;
  return { label: pick[0], s: pick[1] };
}

export class Sheet {
  constructor(discipline, number, title, opts = {}) {
    this.id = `${discipline}_${number}`;
    this.discipline = discipline;
    this.number = number;
    this.title = title;
    this.items = [];
    this.status = 'draft';
    this.notes = opts.notes || [];
  }
  /** Sheet-space primitives (scale 1). */
  add(prims) { this.items.push({ s: 1, ox: 0, oy: 0, prims: Array.isArray(prims) ? prims : [prims] }); return this; }
  /** A viewport: model feet -> sheet units. Returns placement helpers. */
  view(prims, w, h, box, o = {}) {
    const pad = o.pad ?? 0;
    const sc = o.scale ? { s: o.scale[1], label: o.scale[0] } : fitScale(w + 2 * pad, h + 2 * pad, box);
    const ox = box.x + (box.w - (w + 2 * pad) * sc.s) / 2 + pad * sc.s;
    const oy = box.y + pad * sc.s + (o.vcenter ? (box.h - (h + 2 * pad) * sc.s) / 2 : 0);
    this.items.push({ s: sc.s, ox, oy, prims });
    return { s: sc.s, ox, oy, label: sc.label, w: w * sc.s, h: h * sc.s };
  }
}

// ---------- reusable drawing parts (model feet) ----------

/** Wall outlines, doors and windows for one floor. */
export function planBase(fl, layout, o = {}) {
  const prims = []; const { W, D } = layout;
  if (o.fill) for (const r of fl.rooms) prims.push(P.rect(r.x, r.y, r.w, r.h, { fill: o.fill(r), w: 0, c: 'light' }));
  if (fl.corridor && o.corridorFill) prims.push(P.rect(fl.corridor.x, fl.corridor.y, fl.corridor.w, fl.corridor.h, { fill: o.corridorFill, w: 0 }));
  const wc = o.wallColor || 'ink';
  for (const r of fl.rooms) prims.push(P.rect(r.x, r.y, r.w, r.h, { w: o.thin ? 0.8 : 1.4, c: o.thin ? 'light' : wc }));
  prims.push(P.rect(0, 0, W, D, { w: o.thin ? 1.4 : 3, c: o.thin ? 'mid' : wc }));
  for (const d of fl.doors) prims.push(...doorPrims(d, o.thin));
  for (const w of fl.windows) prims.push(...windowPrims(w, o.thin));
  return prims;
}

function doorPrims(d, thin) {
  const half = d.w / 2; const out = []; const c = thin ? 'light' : 'ink';
  const horiz = d.side === 'N' || d.side === 'S';
  const n = { N: [0, 1], S: [0, -1], W: [1, 0], E: [-1, 0] }[d.side]; // direction the door swings into
  const t = horiz ? [1, 0] : [0, 1];
  if (horiz) out.push(P.rect(d.x - half, d.y - 0.45, d.w, 0.9, { fill: 'paper', w: 0 }));
  else out.push(P.rect(d.x - 0.45, d.y - half, 0.9, d.w, { fill: 'paper', w: 0 }));
  const leaves = d.double ? [-1, 1] : [-1];
  const len = d.double ? half : d.w;
  for (const sg of leaves) {
    const hx = d.x + t[0] * half * sg; const hy = d.y + t[1] * half * sg;
    const ex = hx + n[0] * len; const ey = hy + n[1] * len;
    const sx = hx - t[0] * sg * len; const sy = hy - t[1] * sg * len;
    const cross = n[0] * (-t[1] * sg) - n[1] * (-t[0] * sg);
    out.push(P.line(hx, hy, ex, ey, { w: 1, c }));
    out.push(P.path(`M ${ex} ${ey} A ${len} ${len} 0 0 ${cross > 0 ? 1 : 0} ${sx} ${sy}`, { w: 0.5, c: 'light' }));
  }
  return out;
}

function windowPrims(w, thin) {
  const half = w.w / 2; const c = thin ? 'light' : 'blue';
  if (w.side === 'N' || w.side === 'S') {
    return [P.rect(w.c - half, w.fixed - 0.5, w.w, 1, { fill: 'paper', w: 0 }), P.line(w.c - half, w.fixed - 0.25, w.c + half, w.fixed - 0.25, { w: 0.6, c }), P.line(w.c - half, w.fixed + 0.25, w.c + half, w.fixed + 0.25, { w: 0.6, c })];
  }
  return [P.rect(w.fixed - 0.5, w.c - half, 1, w.w, { fill: 'paper', w: 0 }), P.line(w.fixed - 0.25, w.c - half, w.fixed - 0.25, w.c + half, { w: 0.6, c }), P.line(w.fixed + 0.25, w.c - half, w.fixed + 0.25, w.c + half, { w: 0.6, c })];
}

export function roomTags(fl, o = {}) {
  const prims = [];
  for (const r of fl.rooms) {
    if (o.skip && o.skip(r)) continue;
    const small = r.w < 12;
    const cx = r.x + r.w / 2; const cy = r.y + r.h / 2;
    let label = o.label ? o.label(r) : r.name;
    const th = small ? 4.4 : (o.h ?? 5.6); const vert = small && r.h > r.w * 1.6;
    if (o.s) { const mx = Math.max(3, Math.floor(((vert ? r.h : r.w) * o.s - 2) / (th * 0.58))); if (label.length > mx) label = label.slice(0, mx - 1) + '.'; }
    prims.push(P.text(cx, cy - (o.second ? 1 : 0), label, { h: th, anchor: 'middle', bold: true, rot: vert ? -90 : 0, c: o.c || 'ink' }));
    if (o.second) prims.push(P.text(cx, cy + 5, o.second(r), { h: small ? 3.6 : 4.4, anchor: 'middle', c: o.c2 || 'mid', rot: small && r.h > r.w * 1.6 ? -90 : 0 }));
  }
  return prims;
}

export function dimLine(x1, y1, x2, y2, off, label, o = {}) {
  const horiz = Math.abs(y2 - y1) < 0.001;
  const prims = []; const h = o.h ?? 5;
  if (horiz) {
    const y = y1 + off;
    prims.push(P.line(x1, y1 + Math.sign(off) * 1, x1, y, { w: 0.5, c: 'mid' }), P.line(x2, y2 + Math.sign(off) * 1, x2, y, { w: 0.5, c: 'mid' }), P.line(x1, y, x2, y, { w: 0.7, c: 'mid' }),
      P.line(x1 - 0.8, y + 0.8, x1 + 0.8, y - 0.8, { w: 1 }), P.line(x2 - 0.8, y + 0.8, x2 + 0.8, y - 0.8, { w: 1 }),
      P.text((x1 + x2) / 2, y + (off > 0 ? 0 : 0) - 1.2, label, { h, anchor: 'middle' }));
  } else {
    const x = x1 + off;
    prims.push(P.line(x1 + Math.sign(off) * 1, y1, x, y1, { w: 0.5, c: 'mid' }), P.line(x2 + Math.sign(off) * 1, y2, x, y2, { w: 0.5, c: 'mid' }), P.line(x, y1, x, y2, { w: 0.7, c: 'mid' }),
      P.line(x - 0.8, y1 + 0.8, x + 0.8, y1 - 0.8, { w: 1 }), P.line(x - 0.8, y2 + 0.8, x + 0.8, y2 - 0.8, { w: 1 }),
      P.text(x - 1.2, (y1 + y2) / 2, label, { h, anchor: 'middle', rot: -90 }));
  }
  return prims;
}

export const ftin = (ft) => {
  const t = Math.round(ft * 2) / 2; const f = Math.floor(t); const i = Math.round((t - f) * 12);
  return `${f}'-${i}"`;
};

export function outerDims(W, D) {
  return [...dimLine(0, 0, W, 0, -7, ftin(W)), ...dimLine(0, 0, 0, D, -7, ftin(D))];
}

export function northArrow(x, y, r = 8) {
  return [P.circ(x, y, r, { w: 0.8 }), P.poly([[x, y - r], [x - r * 0.4, y + r * 0.6], [x, y + r * 0.25], [x + r * 0.4, y + r * 0.6]], { fill: 'ink', w: 0.5 }), P.text(x, y - r - 2, 'N', { h: 7, anchor: 'middle', bold: true })];
}

/** Sheet-space view title: bubble + name + scale. */
export function viewTitle(x, y, num, title, scaleLabel) {
  return [P.circ(x + 9, y, 9, { w: 1.2 }), P.line(x, y + 9.5, x + 18, y + 9.5, { w: 0.6 }), P.text(x + 9, y + 3, num, { h: 9, anchor: 'middle', bold: true }),
    P.text(x + 24, y - 1, title.toUpperCase(), { h: 9, bold: true }), ...(scaleLabel ? [P.text(x + 24, y + 9, `SCALE: ${scaleLabel}`, { h: 6, c: 'mid' })] : []),
    P.line(x + 24, y + 12, x + 24 + Math.max(110, title.length * 6.4), y + 12, { w: 1.4 })];
}

export function gridBubble(x, y, label, r = 3.4) { return [P.circ(x, y, r, { w: 0.7, fill: 'paper' }), P.text(x, y + 1.6, label, { h: 4.6, anchor: 'middle', bold: true })]; }

// ---------- tables and notes (sheet space) ----------
export function table(x, y, title, cols, rows, o = {}) {
  const fs = o.fs ?? 5.4; const rh = o.rh ?? fs + 4.2; const prims = [];
  const cw = cols.map((c, i) => Math.max(c.length * fs * 0.66 + 5, ...rows.map((r) => String(r[i] ?? '').length * fs * 0.6 + 5), o.minW?.[i] ?? 0));
  if (o.maxW) { const tot = cw.reduce((a, b) => a + b, 0); if (tot > o.maxW) for (let i = 0; i < cw.length; i++) cw[i] *= o.maxW / tot; }
  const totW = cw.reduce((a, b) => a + b, 0);
  let cy = y;
  if (title) { prims.push(P.text(x, cy + fs + 1.5, title.toUpperCase(), { h: fs + 2, bold: true })); cy += fs + 6; }
  prims.push(P.rect(x, cy, totW, rh, { fill: '#e9e6df', w: 0.8 }));
  let cx = x;
  cols.forEach((c, i) => { prims.push(P.text(cx + 2.5, cy + rh - 3.2, c, { h: fs, bold: true })); cx += cw[i]; });
  cy += rh;
  rows.forEach((r) => {
    prims.push(P.rect(x, cy, totW, rh, { w: 0.4, c: 'mid' }));
    let cx2 = x;
    r.forEach((v, i) => {
      const max = Math.floor((cw[i] - 4) / (fs * 0.56));
      const sv = String(v ?? ''); const txt = sv.length > max ? sv.slice(0, Math.max(1, max - 1)) + '.' : sv;
      prims.push(P.text(cx2 + 2.5, cy + rh - 3.2, txt, { h: fs, c: o.rowColor?.(r) || 'ink' })); cx2 += cw[i];
    });
    cy += rh;
  });
  let cx3 = x; for (let i = 0; i < cols.length - 1; i++) { cx3 += cw[i]; prims.push(P.line(cx3, y + (title ? fs + 6 : 0), cx3, cy, { w: 0.3, c: 'mid' })); }
  return { prims, w: totW, h: cy - y };
}

export function notesBlock(x, y, w, title, lines, o = {}) {
  const fs = o.fs ?? 5.4; const lh = fs + 2.6; const prims = []; let cy = y;
  prims.push(P.text(x, cy + fs + 1, title.toUpperCase(), { h: fs + 2, bold: true })); cy += fs + 6;
  prims.push(P.line(x, cy - 2, x + w, cy - 2, { w: 0.8 }));
  const maxCh = Math.floor(w / (fs * 0.54));
  lines.forEach((ln, i) => {
    const words = String(ln).split(/\s+/); let cur = `${i + 1}. `; const out = [];
    for (const wd of words) { if ((cur + wd).length > maxCh) { out.push(cur); cur = '    ' + wd + ' '; } else cur += wd + ' '; }
    out.push(cur);
    out.forEach((l) => { prims.push(P.text(x, cy + fs, l.trimEnd(), { h: fs })); cy += lh; });
    cy += 1.2;
  });
  return { prims, h: cy - y, w };
}

/** Stack blocks vertically in a column. */
export class Column {
  constructor(x, y, w, gap = 12) { this.x = x; this.y = y; this.w = w; this.gap = gap; this.prims = []; }
  table(title, cols, rows, o) { const t = table(this.x, this.y, title, cols, rows, { maxW: this.w, ...o }); this.prims.push(...t.prims); this.y += t.h + this.gap; return t; }
  notes(title, lines, o) { const n = notesBlock(this.x, this.y, this.w, title, lines, o); this.prims.push(...n.prims); this.y += n.h + this.gap; return n; }
  raw(prims, h) { this.prims.push(...prims); this.y += h + this.gap; }
}
