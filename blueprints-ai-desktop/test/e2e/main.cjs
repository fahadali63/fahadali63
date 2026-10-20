// End-to-end smoke test: launches the real app, drives the UI, saves screenshots.
// Run: xvfb-run -a npx electron --no-sandbox test/e2e/main.cjs [outDir]
const { app, BrowserWindow } = require('electron');
const path = require('node:path'); const fs = require('node:fs'); const os = require('node:os');
const out = process.argv.find((a, i) => i > 1 && !a.startsWith('-') && !a.endsWith('.cjs')) || fs.mkdtempSync(path.join(os.tmpdir(), 'bpai-e2e-'));
fs.mkdirSync(out, { recursive: true });
app.setPath('userData', fs.mkdtempSync(path.join(os.tmpdir(), 'bpai-ud-')));
process.env.BPAI_TEST_DIR = path.join(out, 'exports'); fs.mkdirSync(process.env.BPAI_TEST_DIR, { recursive: true });
require('../../src/main/main.js');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const fails = [];
const check = (name, ok, info = '') => { console.log(`${ok ? 'PASS' : 'FAIL'} ${name} ${info}`); if (!ok) fails.push(name); };
app.whenReady().then(async () => {
  await sleep(1500);
  const win = BrowserWindow.getAllWindows()[0];
  const wc = win.webContents;
  const errors = []; wc.on('console-message', (_e, level, msg) => { if (level >= 3) errors.push(msg); });
  const js = (code) => wc.executeJavaScript(code);
  const shot = async (n) => { fs.writeFileSync(path.join(out, `${n}.png`), (await wc.capturePage()).toPNG()); };
  const click = (sel) => js(`document.querySelector(${JSON.stringify(sel)}).click()`);
  try {
    await sleep(500); await shot('01-empty');
    check('empty state shown', await js(`!!document.querySelector('#new2')`));
    await click('#new2'); await sleep(200);
    await js(`document.querySelector('#n_name').value='Harbor Street Offices'; document.querySelector('#n_a').value='9000'`);
    await click('#o'); await sleep(1500); await shot('02-created');
    const n = await js(`window.__bp.cur.sheets.length`); check('sheets generated', n > 25, `(${n})`);
    check('viewer shows svg', await js(`!!document.querySelector('#sb svg')`));
    // switch sheets
    await js(`document.querySelectorAll('.sitem')[3].click()`); await sleep(300); await shot('03-sheet');
    // chat (offline interpreter)
    await js(`document.querySelector('#msg').value='Make it 3 stories and add 2 conference rooms'`); await click('#send'); await sleep(1500); await shot('04-chat');
    check('stories updated', (await js(`window.__bp.cur.stories`)) === 3);
    check('revision logged', (await js(`window.__bp.cur.revisions.length`)) >= 1);
    for (const t of ['code', 'cost', 'review', 'setup', 'program']) { await click(`[data-tab="${t}"]`); await sleep(250); await shot(`05-${t}`); }
    await click('[data-tab="sheets"]'); await sleep(250);
    // phases
    await click('[data-phase="programming"]'); await sleep(600);
    check('programming phase has few sheets', (await js(`window.__bp.cur.sheets.length`)) <= 3);
    await click('[data-phase="cd"]'); await sleep(800);
    // approval flow
    await js(`window.__bp.cur.approval.by='Jane Doe, AIA'; window.__bp.cur.approval.license='C-12345'`);
    await click('[data-tab="review"]'); await sleep(200); await click('#apall'); await sleep(300);
    check('approve all', (await js(`window.__bp.cur.sheets.every(s=>s.status==='approved')`)));
    await click('[data-tab="sheets"]'); await sleep(400); await shot('06-approved');
    // markup flow
    await click('[data-tab="sheets"]'); await sleep(300); await click('#markbtn'); await sleep(100);
    const box = await js(`(()=>{const r=document.querySelector('#sb svg').getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()`);
    wc.sendInputEvent({ type: 'mouseDown', x: Math.round(box.x), y: Math.round(box.y), button: 'left', clickCount: 1 });
    wc.sendInputEvent({ type: 'mouseUp', x: Math.round(box.x), y: Math.round(box.y), button: 'left', clickCount: 1 }); await sleep(400);
    check('markup modal opened', await js(`!!document.querySelector('#q')`));
    await js(`document.querySelector('#q').value='Verify corridor width here'`); await click('#o'); await sleep(400);
    check('markup stored', (await js(`window.__bp.cur.markups.length`)) === 1);
    await shot('06b-markup');
    // point cloud attachment (offline): 80 x 50 m? use feet-like extents in metres
    const lines = []; for (let i = 0; i < 400; i++) lines.push(`${(i % 20) * 1.2} ${Math.floor(i / 20) * 1.0} ${(i % 7) * 1.5}`);
    const b64 = Buffer.from(lines.join('\n')).toString('base64');
    const meta = await js(`window.api.saveAttachment({projectId: window.__bp.cur.id, name:'scan.xyz', mime:'text/plain', base64:${JSON.stringify(b64)}})`);
    check('point cloud analyzed', !!meta.pointCloud && meta.pointCloud.unit === 'm', JSON.stringify(meta.pointCloud));
    await js(`window.__bp.pending.push(${JSON.stringify(meta)})`);
    await js(`document.querySelector('#msg').value='Use this scan'`); await click('#send'); await sleep(1800);
    check('footprint from point cloud', !!(await js(`window.__bp.cur.footprint`)), JSON.stringify(await js(`window.__bp.cur.footprint`)));
    // PDF export through the real IPC + printToPDF
    await click('#exp'); await sleep(100); await click('[data-exp="pdf"]'); await sleep(9000);
    const pdfFile = fs.readdirSync(process.env.BPAI_TEST_DIR).find((f) => f.endsWith('.pdf'));
    check('pdf written', !!pdfFile);
    if (pdfFile) { const buf = fs.readFileSync(path.join(process.env.BPAI_TEST_DIR, pdfFile)); const pages = (buf.toString('latin1').match(/\/Type\s*\/Page[^s]/g) || []).length; const nSheets = await js(`window.__bp.cur.sheets.length`); check('pdf header', buf.slice(0, 4).toString() === '%PDF', `(${Math.round(buf.length / 1024)} KB)`); check('pdf page count = sheets', pages === nSheets, `(${pages} vs ${nSheets})`); }
    await click('#exp'); await sleep(100); await click('[data-exp="dxf"]'); await sleep(1500);
    check('dxf written', fs.readdirSync(process.env.BPAI_TEST_DIR).filter((f) => f.endsWith('.dxf')).length > 20);
    await click('#exp'); await sleep(100); await click('[data-exp="csv"]'); await sleep(600);
    check('csv written', fs.readdirSync(process.env.BPAI_TEST_DIR).some((f) => f.endsWith('.csv')));
    // persistence: projects are on disk
    check('project persisted', fs.readdirSync(path.join(app.getPath('userData'), 'projects')).length === 1);
    // PDF export via main-process printToPDF
    const pdf = await js(`(async()=>{const m=await import('../engine/render.js'); return m.printHtml(window.__bp.cur, window.__bp.set.sheets, {}).length})()`);
    check('print html built', pdf > 1000, `(${pdf})`);
    check('no console errors', errors.length === 0, errors.join(' | ').slice(0, 300));
  } catch (e) { check('exception', false, String(e)); }
  console.log(fails.length ? `FAILED: ${fails.join(', ')}` : 'ALL PASSED'); console.log('screens:', out);
  app.exit(fails.length ? 1 : 0);
});
