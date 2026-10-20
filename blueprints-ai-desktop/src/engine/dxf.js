import { COLORS } from './draw.js';

// Minimal ASCII DXF writer (R12-compatible entities) for CAD hand-off.
const ACI = { ink: 7, light: 8, mid: 9, red: 1, blue: 5, green: 3, orange: 30, paper: 7, cyan: 4, magenta: 6 };
const layerOf = (c) => `BP_${(c || 'ink').toString().replace(/[^a-z0-9]/gi, '').toUpperCase()}`;

export function sheetDxf(sheet) {
  const out = ['0', 'SECTION', '2', 'HEADER', '9', '$ACADVER', '1', 'AC1009', '0', 'ENDSEC', '0', 'SECTION', '2', 'TABLES', '0', 'TABLE', '2', 'LAYER'];
  const layers = new Map();
  const add = (g, v) => out.push(String(g), String(v));
  const body = [];
  const ent = (type, c, kv) => { const l = layerOf(c); layers.set(l, ACI[c] ?? 7); body.push('0', type, '8', l, ...kv.flatMap(([g, v]) => [String(g), String(v)])); };
  // 30 sheet units = 1 inch. Emit in inches, Y up.
  const U = 1 / 30;
  for (const it of sheet.items) {
    const X = (x) => ((it.ox + x * it.s) * U).toFixed(4); const Y = (y) => (-(it.oy + y * it.s) * U).toFixed(4); const L = (v) => (v * it.s * U).toFixed(4);
    for (const p of it.prims) {
      if (p.t === 'line') ent('LINE', p.c, [[10, X(p.x1)], [20, Y(p.y1)], [30, 0], [11, X(p.x2)], [21, Y(p.y2)], [31, 0]]);
      else if (p.t === 'rect') { const pts = [[p.x, p.y], [p.x + p.w, p.y], [p.x + p.w, p.y + p.h], [p.x, p.y + p.h], [p.x, p.y]]; for (let i = 0; i < 4; i++) ent('LINE', p.c, [[10, X(pts[i][0])], [20, Y(pts[i][1])], [30, 0], [11, X(pts[i + 1][0])], [21, Y(pts[i + 1][1])], [31, 0]]); }
      else if (p.t === 'circle') ent('CIRCLE', p.c, [[10, X(p.cx)], [20, Y(p.cy)], [30, 0], [40, L(p.r)]]);
      else if (p.t === 'poly') { const pts = p.closed ? [...p.pts, p.pts[0]] : p.pts; for (let i = 0; i < pts.length - 1; i++) ent('LINE', p.c, [[10, X(pts[i][0])], [20, Y(pts[i][1])], [30, 0], [11, X(pts[i + 1][0])], [21, Y(pts[i + 1][1])], [31, 0]]); }
      else if (p.t === 'text') ent('TEXT', p.c, [[10, X(p.x)], [20, Y(p.y)], [30, 0], [40, (p.h * U).toFixed(4)], [1, p.s], [50, -p.rot || 0]]);
    }
  }
  add(70, layers.size);
  for (const [l, c] of layers) { out.push('0', 'LAYER', '2', l, '70', '0', '62', String(c), '6', 'CONTINUOUS'); }
  out.push('0', 'ENDTAB', '0', 'ENDSEC', '0', 'SECTION', '2', 'ENTITIES', ...body, '0', 'ENDSEC', '0', 'EOF');
  return out.join('\n');
}
void COLORS;
