'use strict';
const fs = require('node:fs');
const readline = require('node:readline');

/** Reads XYZ / PTS / CSV / TXT point clouds (first three numeric columns) and returns extents. */
async function analyze(file) {
  const rl = readline.createInterface({ input: fs.createReadStream(file), crlfDelay: Infinity });
  const min = [Infinity, Infinity, Infinity]; const max = [-Infinity, -Infinity, -Infinity]; let n = 0;
  for await (const line of rl) {
    const parts = line.trim().split(/[\s,;]+/);
    if (parts.length < 3) continue;
    const v = [Number(parts[0]), Number(parts[1]), Number(parts[2])];
    if (v.some((x) => !Number.isFinite(x))) continue;
    n++;
    for (let i = 0; i < 3; i++) { if (v[i] < min[i]) min[i] = v[i]; if (v[i] > max[i]) max[i] = v[i]; }
    if (n >= 5000000) break;
  }
  if (!n) return null;
  const ext = [max[0] - min[0], max[1] - min[1], max[2] - min[2]];
  // Unit guess: tiny extents are metres, huge extents are millimetres, otherwise feet.
  const m = Math.max(...ext);
  const unit = m > 5000 ? 'mm' : m < 400 ? 'm' : 'ft';
  const toFt = unit === 'mm' ? 0.00328084 : unit === 'm' ? 3.28084 : 1;
  return { points: n, unit, widthFt: Math.round(ext[0] * toFt * 10) / 10, depthFt: Math.round(ext[1] * toFt * 10) / 10, heightFt: Math.round(ext[2] * toFt * 10) / 10 };
}
module.exports = { analyze };
