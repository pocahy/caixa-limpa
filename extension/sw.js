// Service worker: motor do Pomodoro (alarmes, contador no ícone, notificações),
// sincronização com o Firestore, captura rápida, atalhos e bloqueio de sites no foco.
import { CFG } from "./config.js";
import { signIn, signOut, getAuth, listItems, getDoc, setDoc, updateDoc } from "./fb.js";
import { IDLE, rid, today, iso, settingsOf, plen, left } from "./lib.js";

const COLORS = { focus: "#0e6a57", short: "#2f5f9e", long: "#2f5f9e", await: "#a84c0c" };

async function dev() {
  let { dev } = await chrome.storage.local.get("dev");
  if (!dev) { dev = "ext-" + Math.random().toString(36).slice(2, 10); await chrome.storage.local.set({ dev }); }
  return dev;
}
async function getT() { const { timer } = await chrome.storage.local.get("timer"); return { ...IDLE, ...(timer || {}) }; }
async function getCache() { const { cache } = await chrome.storage.local.get("cache"); return cache || { items: [], at: 0 }; }
async function settings() { return settingsOf((await getCache()).items); }

// ---------- estado do timer ----------
async function apply(t) {
  await chrome.storage.local.set({ timer: t });
  await chrome.alarms.clear("pom-end");
  await chrome.alarms.clear("tick");
  if (t.run) {
    chrome.alarms.create("pom-end", { when: Math.max(Date.now() + 500, t.endAt) });
    chrome.alarms.create("tick", { periodInMinutes: 0.5 });
  }
  await badge(t);
  await updateBlock(t);
}
async function save(t, push = true) {
  t.upd = Date.now();
  t.dev = await dev();
  await apply(t);
  if (push && (await getAuth().catch(() => null))) {
    const o = { kind: "timer" };
    for (const k of Object.keys(IDLE)) o[k] = t[k] === undefined ? null : t[k];
    setDoc("timer", o).catch(() => {});
  }
  return t;
}
async function adopt(remote) {
  const t = await getT();
  if (!remote || (remote.upd || 0) <= (t.upd || 0)) return;
  const n = { ...IDLE };
  for (const k of Object.keys(IDLE)) if (k in remote) n[k] = remote[k];
  await apply(n);
}
async function badge(t) {
  let text = "", color = COLORS.focus;
  if (t.await) { text = "!"; color = COLORS.await; }
  else if (t.phase !== "idle") {
    const m = Math.ceil(left(t) / 60000);
    text = t.run ? String(m) : "II";
    color = COLORS[t.phase] || COLORS.focus;
  }
  await chrome.action.setBadgeText({ text });
  await chrome.action.setBadgeBackgroundColor({ color });
  if (chrome.action.setBadgeTextColor) await chrome.action.setBadgeTextColor({ color: "#ffffff" });
  const ph = { focus: "Foco", short: "Pausa", long: "Pausa longa" }[t.phase];
  await chrome.action.setTitle({ title: t.await ? "Caixa Limpa: tempo esgotado" : ph ? `Caixa Limpa: ${ph}, ${text} min` : "Caixa Limpa" });
}

async function start(ph, task) {
  const s = await settings(), t = await getT();
  if (task !== undefined) t.task = task;
  t.phase = ph; t.run = true; t.endAt = Date.now() + plen(ph, s); t.left = plen(ph, s); t.await = null;
  if (ph === "focus") { t.intr = 0; t.sid = rid(); }
  return save(t);
}
async function act(a, arg) {
  const t = await getT(), s = await settings();
  switch (a) {
    case "focus": return start("focus", arg);
    case "break": return start((t.cycle || 0) % s.every === 0 ? "long" : "short");
    case "pause": if (!t.run) return t; t.left = left(t); t.run = false; return save(t);
    case "resume": if (t.run || t.phase === "idle") return t; t.endAt = Date.now() + t.left; t.run = true; return save(t);
    case "stop": return save({ ...t, phase: "idle", run: false, await: null, left: 0 });
    case "task": t.task = arg || null; return save(t);
    case "toggle":
      if (t.run) return act("pause");
      if (t.await === "focus-end") return act("break");
      if (t.await === "break-end" || t.phase === "idle") return act("focus");
      return act("resume");
    case "taskdone": {
      const el = plen("focus", s) - left(t), tid = t.task, sid = t.sid, intr = t.intr;
      t.run = false; t.left = 0; t.await = "focus-end";
      if (el >= 60000) t.cycle = (t.cycle || 0) + 1;
      t.task = null;
      await save(t);
      if (el >= 60000) await logPom(sid, tid, Math.round(el / 60000), intr);
      if (tid) await complete(tid);
      return t;
    }
  }
  return t;
}

async function finish() {
  const t = await getT();
  if (!t.run) return;
  if (Date.now() < t.endAt - 1000) return apply(t);
  const ph = t.phase, s = await settings();
  t.run = false; t.left = 0;
  const items = (await getCache()).items, task = t.task && items.find(x => x.id === t.task);
  if (ph === "focus") {
    t.cycle = (t.cycle || 0) + 1; t.await = "focus-end";
    await save(t);
    const brk = t.cycle % s.every === 0 ? s.long : s.short;
    notify("focus-end", "Pomodoro concluído", task ? task.title : "Hora da pausa.", [{ title: `Iniciar pausa de ${brk} min` }, { title: "Pular pausa" }]);
    // Espera o site registrar primeiro, se estiver aberto; o sid impede contar duas vezes.
    await new Promise(r => setTimeout(r, 5000));
    await logPom(t.sid, t.task, s.focus, t.intr);
  } else {
    if (ph === "long") t.cycle = 0;
    t.await = "break-end";
    await save(t);
    notify("break-end", "Pausa terminada", "Pronto para o próximo pomodoro?", [{ title: "Começar pomodoro" }]);
  }
}
function notify(id, title, message, buttons) {
  chrome.notifications.clear(id, () => chrome.notifications.create(id, { type: "basic", iconUrl: "icons/128.png", title, message, buttons, requireInteraction: true, priority: 2 }));
}

// ---------- dados ----------
async function logPom(sid, taskId, min, intr) {
  if (!(await getAuth().catch(() => null))) return;
  try {
    const meta = (await getDoc("meta")) || {};
    const log = { ...(meta.pomLog || {}) }, day = today(), d = log[day] || { n: 0, min: 0, s: [] };
    if (sid && (d.s || []).some(x => x.sid === sid)) return;
    const it = taskId ? await getDoc(taskId) : null;
    log[day] = { n: (d.n || 0) + 1, min: (d.min || 0) + min, s: (d.s || []).concat({ t: taskId || null, title: it ? it.title : "Sem tarefa específica", at: Date.now(), intr: intr || 0, sid: sid || null }).slice(-40) };
    const keys = Object.keys(log).sort(); while (keys.length > 60) delete log[keys.shift()];
    await updateDoc("meta", { kind: "meta", pomLog: log });
    if (it) await updateDoc(taskId, { poms: (it.poms || 0) + 1 });
    sync();
  } catch (e) {}
}
async function complete(id) {
  const items = (await getCache()).items, it = items.find(x => x.id === id);
  const ch = { list: "done", prevList: (it && it.list) || "next", doneAt: Date.now(), updated: Date.now() };
  await patchCache(id, ch);
  await updateDoc(id, ch);
}
async function setToday(id, on) {
  const ch = { today: on ? today() : null, updated: Date.now() };
  await patchCache(id, ch);
  await updateDoc(id, ch);
}
async function patchCache(id, ch) {
  const c = await getCache();
  c.items = c.items.map(x => (x.id === id ? { ...x, ...ch } : x));
  await chrome.storage.local.set({ cache: c });
}
async function capture(title, notes) {
  title = String(title || "").trim().slice(0, 300);
  if (!title) return;
  const now = Date.now(), id = rid();
  const doc = { kind: "item", title, list: "inbox", created: now, updated: now, notes: notes || null };
  const t = await getT();
  if (t.phase === "focus" && t.run) { t.intr = (t.intr || 0) + 1; await save(t); }
  const c = await getCache(); c.items = c.items.concat({ ...doc, id }); await chrome.storage.local.set({ cache: c });
  try { await setDoc(id, doc); }
  catch (e) { const { pending = [] } = await chrome.storage.local.get("pending"); pending.push({ id, doc }); await chrome.storage.local.set({ pending }); }
}
async function flushPending() {
  const { pending = [] } = await chrome.storage.local.get("pending");
  if (!pending.length) return;
  const rest = [];
  for (const p of pending) { try { await setDoc(p.id, p.doc); } catch (e) { rest.push(p); } }
  await chrome.storage.local.set({ pending: rest });
}
let syncing = null;
async function sync() {
  if (syncing) return syncing;
  syncing = (async () => {
    if (!(await getAuth().catch(() => null))) return;
    await flushPending();
    const items = await listItems();
    await chrome.storage.local.set({ cache: { items, at: Date.now() }, syncErr: null });
    const remote = items.find(x => x.id === "timer");
    if (remote && remote.dev !== (await dev())) await adopt(remote);
  })().catch(e => chrome.storage.local.set({ syncErr: String(e.message || e) })).finally(() => { syncing = null; });
  return syncing;
}

// ---------- bloqueio de sites durante o foco ----------
async function updateBlock(t) {
  const { block = { on: false, domains: [] } } = await chrome.storage.local.get("block");
  const want = block.on && t.phase === "focus" && t.run && block.domains.length > 0;
  const old = (await chrome.declarativeNetRequest.getDynamicRules()).map(r => r.id);
  let addRules = [];
  if (want) {
    const canRedirect = await chrome.permissions.contains({ origins: ["<all_urls>"] });
    addRules = block.domains.slice(0, 200).map((d, i) => ({
      id: i + 1, priority: 1,
      action: canRedirect ? { type: "redirect", redirect: { extensionPath: "/blocked.html" } } : { type: "block" },
      condition: { requestDomains: [d], resourceTypes: ["main_frame"] }
    }));
  }
  await chrome.declarativeNetRequest.updateDynamicRules({ removeRuleIds: old, addRules });
}

// ---------- abrir o site ----------
async function openSite(hash) {
  const url = CFG.siteUrl + (hash ? "#" + hash : "");
  const tabs = await chrome.tabs.query({ url: CFG.siteUrl + "*" });
  if (tabs[0]) { await chrome.tabs.update(tabs[0].id, { active: true, url }); await chrome.windows.update(tabs[0].windowId, { focused: true }); }
  else await chrome.tabs.create({ url });
}

// ---------- eventos ----------
chrome.runtime.onInstalled.addListener(async () => {
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({ id: "cl-sel", title: "Enviar \"%s\" para o Caixa Limpa", contexts: ["selection"] });
    chrome.contextMenus.create({ id: "cl-link", title: "Enviar link para o Caixa Limpa", contexts: ["link"] });
    chrome.contextMenus.create({ id: "cl-page", title: "Enviar esta página para o Caixa Limpa", contexts: ["page"] });
  });
  chrome.alarms.create("sync", { periodInMinutes: 1 });
  await apply(await getT());
  sync();
});
chrome.runtime.onStartup.addListener(async () => { chrome.alarms.create("sync", { periodInMinutes: 1 }); await apply(await getT()); sync(); });

chrome.alarms.onAlarm.addListener(async a => {
  if (a.name === "pom-end") await finish();
  else if (a.name === "tick") { const t = await getT(); if (t.run && left(t) <= 0) await finish(); else await badge(t); }
  else if (a.name === "sync") await sync();
});

chrome.notifications.onButtonClicked.addListener(async (id, i) => {
  chrome.notifications.clear(id);
  if (id === "focus-end") await act(i === 0 ? "break" : "focus");
  else if (id === "break-end") await act("focus");
});
chrome.notifications.onClicked.addListener(id => { chrome.notifications.clear(id); openSite("foco"); });

chrome.commands.onCommand.addListener(c => { if (c === "toggle-pomodoro") act("toggle"); });

chrome.contextMenus.onClicked.addListener((info, tab) => {
  const page = tab ? `${tab.title || ""}\n${tab.url || ""}`.trim() : "";
  if (info.menuItemId === "cl-sel") capture(info.selectionText, page);
  else if (info.menuItemId === "cl-link") capture(info.linkUrl, page);
  else if (info.menuItemId === "cl-page" && tab) capture(tab.title || tab.url, tab.url);
});

chrome.omnibox.setDefaultSuggestion({ description: "Capturar na caixa de entrada do Caixa Limpa: %s" });
chrome.omnibox.onInputEntered.addListener(text => capture(text));

chrome.storage.onChanged.addListener(async (ch, area) => { if (area === "local" && ch.block) await updateBlock(await getT()); });

chrome.runtime.onMessage.addListener((msg, sender, reply) => {
  (async () => {
    switch (msg.type) {
      case "act": return { ok: true, t: await act(msg.act, msg.arg) };
      case "capture": await capture(msg.title, msg.notes); return { ok: true };
      case "complete": await complete(msg.id); return { ok: true };
      case "today": await setToday(msg.id, msg.on); return { ok: true };
      case "sync": await sync(); return { ok: true };
      case "open": await openSite(msg.hash); return { ok: true };
      case "signin": await signIn(); await sync(); return { ok: true };
      case "signout": await signOut(); return { ok: true };
      case "site-timer": await adopt(msg.t); return { ok: true };
    }
    return { ok: false };
  })().then(reply, e => reply({ ok: false, error: String((e && e.message) || e) }));
  return true;
});
