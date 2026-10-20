'use strict';
const { app, BrowserWindow, ipcMain, dialog, safeStorage, shell, Menu } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const { callClaude } = require('./ai');
const pointcloud = require('./pointcloud');

const userData = app.getPath('userData');
const dirs = { projects: path.join(userData, 'projects'), attachments: path.join(userData, 'attachments') };
for (const d of Object.values(dirs)) fs.mkdirSync(d, { recursive: true });
const settingsFile = path.join(userData, 'settings.json');
let win;

// Test hook: BPAI_TEST_DIR skips native dialogs so the e2e harness can export files.
const pickSave = (opts) => (process.env.BPAI_TEST_DIR ? Promise.resolve({ canceled: false, filePath: path.join(process.env.BPAI_TEST_DIR, path.basename(opts.defaultPath)) }) : dialog.showSaveDialog(win, opts));
const pickDir = (opts) => (process.env.BPAI_TEST_DIR ? Promise.resolve({ canceled: false, filePaths: [process.env.BPAI_TEST_DIR] }) : dialog.showOpenDialog(win, opts));
const readJson = (f, d) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return d; } };
const safeName = (s) => String(s).replace(/[^a-z0-9._-]+/gi, '_').slice(0, 80);

function loadSettings() {
  const s = readJson(settingsFile, {});
  let apiKey = '';
  if (s.apiKeyEnc && safeStorage.isEncryptionAvailable()) { try { apiKey = safeStorage.decryptString(Buffer.from(s.apiKeyEnc, 'base64')); } catch { apiKey = ''; } }
  else if (s.apiKeyPlain) apiKey = s.apiKeyPlain;
  return { apiKey, model: s.model || 'claude-sonnet-5-5', firm: s.firm || '', enterprise: !!s.enterprise, theme: s.theme || 'light' };
}
function saveSettings(next) {
  const cur = readJson(settingsFile, {});
  const out = { ...cur, model: next.model, firm: next.firm, enterprise: !!next.enterprise, theme: next.theme };
  if (typeof next.apiKey === 'string') {
    delete out.apiKeyEnc; delete out.apiKeyPlain;
    if (next.apiKey) { if (safeStorage.isEncryptionAvailable()) out.apiKeyEnc = safeStorage.encryptString(next.apiKey).toString('base64'); else out.apiKeyPlain = next.apiKey; }
  }
  fs.writeFileSync(settingsFile, JSON.stringify(out, null, 2));
  return loadSettings();
}

function createWindow() {
  win = new BrowserWindow({
    width: 1480, height: 940, minWidth: 1100, minHeight: 700, backgroundColor: '#f6f4ef', title: 'Blueprints AI Desktop',
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false, sandbox: true },
  });
  win.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));
  win.webContents.setWindowOpenHandler(({ url }) => { if (/^https:\/\//.test(url)) shell.openExternal(url); return { action: 'deny' }; });
}

app.whenReady().then(() => {
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    ...(process.platform === 'darwin' ? [{ role: 'appMenu' }] : []),
    { role: 'fileMenu' }, { role: 'editMenu' }, { role: 'viewMenu' }, { role: 'windowMenu' },
  ]));
  createWindow();
  app.on('activate', () => { if (!BrowserWindow.getAllWindows().length) createWindow(); });
});
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });

// ---- projects ----
ipcMain.handle('projects:list', () => fs.readdirSync(dirs.projects).filter((f) => f.endsWith('.json')).map((f) => readJson(path.join(dirs.projects, f), null)).filter(Boolean).sort((a, b) => b.updatedAt - a.updatedAt));
ipcMain.handle('projects:save', (_e, p) => { fs.writeFileSync(path.join(dirs.projects, `${safeName(p.id)}.json`), JSON.stringify(p)); return true; });
ipcMain.handle('projects:delete', (_e, id) => { fs.rmSync(path.join(dirs.projects, `${safeName(id)}.json`), { force: true }); fs.rmSync(path.join(dirs.attachments, safeName(id)), { recursive: true, force: true }); return true; });

// ---- settings ----
ipcMain.handle('settings:get', () => { const s = loadSettings(); return { ...s, apiKey: s.apiKey ? '••••••••' + s.apiKey.slice(-4) : '', hasKey: !!s.apiKey }; });
ipcMain.handle('settings:set', (_e, next) => {
  const patch = { ...next };
  if (typeof patch.apiKey === 'string' && patch.apiKey.startsWith('••••')) delete patch.apiKey;
  const cur = loadSettings();
  const s = saveSettings({ model: patch.model ?? cur.model, firm: patch.firm ?? cur.firm, enterprise: patch.enterprise ?? cur.enterprise, theme: patch.theme ?? cur.theme, ...(typeof patch.apiKey === 'string' ? { apiKey: patch.apiKey } : {}) });
  return { ...s, apiKey: s.apiKey ? '••••••••' + s.apiKey.slice(-4) : '', hasKey: !!s.apiKey };
});

// ---- attachments ----
ipcMain.handle('attach:save', async (_e, { projectId, name, mime, base64 }) => {
  const dir = path.join(dirs.attachments, safeName(projectId)); fs.mkdirSync(dir, { recursive: true });
  const id = `${Date.now().toString(36)}_${safeName(name)}`; const file = path.join(dir, id);
  fs.writeFileSync(file, Buffer.from(base64, 'base64'));
  const meta = { id, name, mime: mime || guessMime(name), size: fs.statSync(file).size, path: file };
  if (/\.(xyz|pts|txt|csv|asc)$/i.test(name)) { try { const pc = await pointcloud.analyze(file); if (pc) meta.pointCloud = pc; } catch { /* ignore */ } }
  return meta;
});
function guessMime(n) { const e = path.extname(n).toLowerCase(); return { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.gif': 'image/gif', '.pdf': 'application/pdf' }[e] || 'application/octet-stream'; }

// ---- AI ----
ipcMain.handle('ai:chat', async (_e, { project, messages, attachments }) => {
  const s = loadSettings();
  if (!s.apiKey) return { error: 'no-key' };
  try { return { result: await callClaude({ apiKey: s.apiKey, model: s.model, project, messages, attachments: attachments || [] }) }; }
  catch (err) { return { error: String(err.message || err) }; }
});

// ---- export ----
ipcMain.handle('export:pdf', async (_e, { html, defaultName }) => {
  const r = await pickSave({ defaultPath: `${safeName(defaultName)}.pdf`, filters: [{ name: 'PDF', extensions: ['pdf'] }] });
  if (r.canceled || !r.filePath) return { canceled: true };
  const tmp = path.join(userData, `print_${Date.now()}.html`); fs.writeFileSync(tmp, html);
  const pw = new BrowserWindow({ show: false, webPreferences: { sandbox: true } });
  try {
    await pw.loadFile(tmp);
    const buf = await pw.webContents.printToPDF({ pageSize: { width: 914400, height: 609600 }, printBackground: true, margins: { marginType: 'none' } });
    fs.writeFileSync(r.filePath, buf);
  } finally { pw.destroy(); fs.rmSync(tmp, { force: true }); }
  return { path: r.filePath };
});
ipcMain.handle('export:text', async (_e, { content, defaultName, ext }) => {
  const r = await pickSave({ defaultPath: `${safeName(defaultName)}.${ext}`, filters: [{ name: ext.toUpperCase(), extensions: [ext] }] });
  if (r.canceled || !r.filePath) return { canceled: true };
  fs.writeFileSync(r.filePath, content); return { path: r.filePath };
});
ipcMain.handle('export:files', async (_e, { files }) => {
  const r = await pickDir({ properties: ['openDirectory', 'createDirectory'], title: 'Choose a folder for the DXF files' });
  if (r.canceled || !r.filePaths[0]) return { canceled: true };
  for (const f of files) fs.writeFileSync(path.join(r.filePaths[0], safeName(f.name)), f.content);
  return { path: r.filePaths[0], count: files.length };
});
ipcMain.handle('import:json', async () => {
  const r = await dialog.showOpenDialog(win, { properties: ['openFile'], filters: [{ name: 'Blueprints AI project', extensions: ['json', 'bpai'] }] });
  if (r.canceled || !r.filePaths[0]) return { canceled: true };
  return { data: readJson(r.filePaths[0], null) };
});
ipcMain.handle('app:reveal', (_e, p) => { shell.showItemInFolder(p); return true; });
