// Uses the Electron bridge when present; otherwise a localStorage fallback so the
// UI also runs in a plain browser (useful for testing).
const KEY = 'bpai.projects.v1'; const SKEY = 'bpai.settings.v1';
const ls = { get: (k, d) => { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } }, set: (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* ignore */ } } };
const download = (name, content, type) => { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([content], { type })); a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000); };

const shim = {
  isDesktop: false,
  async listProjects() { return ls.get(KEY, []).sort((a, b) => b.updatedAt - a.updatedAt); },
  async saveProject(p) { const all = ls.get(KEY, []).filter((x) => x.id !== p.id); all.push(p); ls.set(KEY, all); return true; },
  async deleteProject(id) { ls.set(KEY, ls.get(KEY, []).filter((x) => x.id !== id)); return true; },
  async getSettings() { const s = ls.get(SKEY, { model: 'claude-sonnet-5-5', firm: '', enterprise: false }); return { ...s, apiKey: '', hasKey: false }; },
  async setSettings(s) { const cur = ls.get(SKEY, {}); const n = { ...cur, ...s }; delete n.apiKey; ls.set(SKEY, n); return { ...n, apiKey: '', hasKey: false }; },
  async saveAttachment({ name, mime, base64 }) { return { id: `${Date.now()}_${name}`, name, mime, size: Math.round((base64.length * 3) / 4), path: '' }; },
  async chat() { return { error: 'no-key' }; },
  async exportPdf({ html, defaultName }) { download(`${defaultName}.html`, html, 'text/html'); return { path: `${defaultName}.html` }; },
  async exportText({ content, defaultName, ext }) { download(`${defaultName}.${ext}`, content, 'text/plain'); return { path: `${defaultName}.${ext}` }; },
  async exportFiles({ files }) { files.forEach((f) => download(f.name, f.content, 'text/plain')); return { path: 'Downloads', count: files.length }; },
  async importJson() {
    return new Promise((res) => { const i = document.createElement('input'); i.type = 'file'; i.accept = '.json,.bpai'; i.onchange = async () => { const f = i.files[0]; if (!f) return res({ canceled: true }); try { res({ data: JSON.parse(await f.text()) }); } catch { res({ canceled: true }); } }; i.click(); });
  },
  async reveal() { return true; },
};
export const api = window.api || shim;
