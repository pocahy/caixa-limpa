// Regras compartilhadas entre o service worker e as telas da extensão.
export const PDEF = { focus: 25, short: 5, long: 15, every: 4 };
export const IDLE = { phase: "idle", run: false, endAt: 0, left: 0, task: null, cycle: 0, intr: 0, await: null, sid: null, upd: 0, dev: null };

export const rid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
export function iso(d) { d = new Date(d); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 10); }
export const today = () => iso(new Date());
export function dayDiff(s) { const a = new Date(today() + "T12:00"), b = new Date(s + "T12:00"); return Math.round((b - a) / 864e5); }
export function relDate(s) {
  const d = dayDiff(s);
  if (d === 0) return "hoje"; if (d === 1) return "amanhã"; if (d === -1) return "ontem";
  if (d < 0) return -d + " dias atrás"; if (d < 7) return "em " + d + " dias";
  return new Date(s + "T12:00").toLocaleDateString("pt-BR", { day: "numeric", month: "short" }).replace(".", "");
}
export const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

export function settingsOf(items) { const m = (items || []).find(x => x.id === "meta"); return { ...PDEF, ...((m && m.pom) || {}) }; }
export function plen(ph, s) { return (ph === "focus" ? s.focus : ph === "short" ? s.short : s.long) * 60000; }
export function left(t) { return t.run ? Math.max(0, t.endAt - Date.now()) : (t.left || 0); }
export function fmt(ms) { const s = Math.ceil(ms / 1000); return String(Math.floor(s / 60)).padStart(2, "0") + ":" + String(s % 60).padStart(2, "0"); }

export function index(items) {
  const by = new Map((items || []).map(x => [x.id, x]));
  const name = (id, kind) => { const x = id && by.get(id); return x && x.kind === kind ? x.title : ""; };
  const cliOf = it => { if (!it) return null; const p = it.project && by.get(it.project); return (p && p.client) || it.client || null; };
  const label = it => [name(cliOf(it), "client"), name(it.project, "project")].filter(Boolean).join(" · ");
  return { by, name, cliOf, label };
}
export const isToday = i => i.list === "next" && i.today === today();
