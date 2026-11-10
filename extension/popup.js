import { CFG } from "./config.js";
import { IDLE, esc, settingsOf, plen, left, fmt, index, isToday, dayDiff, relDate, today } from "./lib.js";

const $ = s => document.querySelector(s);
let st = { auth: null, timer: { ...IDLE }, cache: { items: [] }, syncErr: null, pending: [] };

const send = msg => chrome.runtime.sendMessage(msg).then(r => { if (r && !r.ok && r.error) toast(errText(r.error)); return r; });
function errText(e) {
  if (e === "no_client_id") return "Falta configurar o ID do cliente Google (veja Opções).";
  if (e === "signed_out") return "Entre com sua conta Google para sincronizar.";
  if (/canceled|cancelled|did not approve|closed/i.test(e)) return "Login cancelado.";
  return "Algo deu errado: " + e;
}
let tt;
function toast(m) { const t = $("#toast"); t.textContent = m; t.hidden = false; clearTimeout(tt); tt = setTimeout(() => (t.hidden = true), 2600); }

$("#main").innerHTML = `
  <div id="authbox"></div>
  <div id="timerbox"></div>
  <form class="cap" id="cap" autocomplete="off">
    <input class="inp" id="cap-in" placeholder="Capturar: o que está na sua cabeça?" aria-label="Capturar na caixa de entrada">
    <button class="btn primary" type="submit">Capturar</button>
  </form>
  <div id="todaybox"></div>`;

function showAuthError(e) {
  let msg;
  if (e === "no_client_id") msg = "Não encontrei o ID do cliente Google do seu Firebase. Cole o ID em Opções.";
  else if (/redirect_uri_mismatch|Authorization page could not be loaded/i.test(e)) msg = "O Google recusou o login: falta autorizar o endereço da extensão no Google Cloud (passo 2 em Opções).";
  else if (/canceled|cancelled|did not approve|closed/i.test(e)) msg = "Login cancelado.";
  else if (/UNAUTHORIZED_DOMAIN|INVALID_IDP_RESPONSE/i.test(e)) msg = "O Firebase recusou o login: adicione o domínio da extensão em Domínios autorizados (passo 3 em Opções).";
  else msg = "Não foi possível entrar: " + e;
  renderAuth();
  const box = $("#authbox .card");
  if (box) box.insertAdjacentHTML("beforeend", `<p class="small" style="margin:0;color:var(--warn)">${esc(msg)}</p><button class="btn small" data-a="options" type="button">Abrir Opções</button>`);
}
function renderAuth() {
  const box = $("#authbox");
  if (st.auth) { box.innerHTML = st.syncErr ? `<div class="note"><span>Não foi possível sincronizar agora. Tentando de novo em 1 min.</span></div>` : ""; return; }
  box.innerHTML = `<div class="card"><h3>Conecte sua conta</h3>
    <p class="muted" style="margin:0">Entre com a mesma conta Google do site para ver suas tarefas e sincronizar o Pomodoro com o app.</p>
    <button class="btn primary" data-a="open" data-hash="hoje" type="button">Conectar pelo site</button>
    <p class="small muted" style="margin:0">Abra o Caixa Limpa neste navegador, conectado com sua conta Google. A extensão entra junto em alguns segundos.</p>
    <button class="btn small ghost" data-a="signin" type="button" style="align-self:flex-start">Entrar direto com Google</button>
    <p class="small muted" style="margin:0">O timer funciona mesmo sem entrar.</p></div>`;
}

function renderTimer() {
  const t = st.timer, s = settingsOf(st.cache.items), ix = index(st.cache.items);
  const idle = t.phase === "idle" && !t.await, isBrk = t.phase === "short" || t.phase === "long";
  const l = idle ? plen("focus", s) : left(t), tot = idle ? plen("focus", s) : plen(t.phase, s);
  const pct = t.await ? 100 : idle ? 0 : Math.min(100, 100 - (l / tot) * 100);
  const ph = t.await === "focus-end" ? "Pomodoro concluído" : t.await === "break-end" ? "Pausa terminada" : ({ idle: "Pronto para focar", focus: "Foco", short: "Pausa curta", long: "Pausa longa" }[t.phase] || "") + (t.phase !== "idle" && !t.run ? " · pausado" : "");
  const filled = !t.cycle ? 0 : ((t.cycle - 1) % s.every) + 1;
  const brkMin = (t.cycle || 0) % s.every === 0 ? s.long : s.short;
  const task = t.task && ix.by.get(t.task);
  let a;
  if (t.await === "focus-end") a = `<button class="btn primary" data-a="break">Pausa de ${brkMin} min</button><button class="btn" data-a="focus">Pular pausa</button><button class="btn ghost" data-a="stop">Encerrar</button>`;
  else if (t.await === "break-end") a = `<button class="btn primary" data-a="focus">Começar pomodoro</button><button class="btn ghost" data-a="stop">Encerrar</button>`;
  else if (idle) a = `<button class="btn primary" data-a="focus">Começar ${s.focus} min</button>`;
  else if (t.run) a = `<button class="btn primary" data-a="pause">Pausar</button>${t.phase === "focus" && task ? `<button class="btn" data-a="taskdone">Terminei a tarefa</button>` : ""}${isBrk ? `<button class="btn" data-a="focus">Pular pausa</button>` : ""}<button class="btn ghost" data-a="stop">Encerrar</button>`;
  else a = `<button class="btn primary" data-a="resume">Continuar</button><button class="btn ghost" data-a="stop">Encerrar</button>`;

  const next = st.cache.items.filter(i => i.kind === "item" && i.list === "next");
  const groups = new Map();
  next.forEach(i => { const k = ix.label(i) || ""; if (!groups.has(k)) groups.set(k, []); groups.get(k).push(i); });
  const keys = [...groups.keys()].sort((x, y) => (x === "") - (y === "") || x.localeCompare(y, "pt-BR"));
  const opt = i => `<option value="${i.id}" ${t.task === i.id ? "selected" : ""}>${esc(i.title)}</option>`;
  const opts = keys.map(k => (k ? `<optgroup label="${esc(k)}">` : keys.length > 1 ? `<optgroup label="Sem projeto">` : "") + groups.get(k).map(opt).join("") + (k || keys.length > 1 ? "</optgroup>" : "")).join("");
  const extra = task && task.list !== "next" ? `<option value="${task.id}" selected>${esc(task.title)}</option>` : "";

  $("#timerbox").innerHTML = `<section class="timer ${isBrk ? "brk" : t.phase === "focus" ? "focus" : ""}" aria-label="Pomodoro">
    <div class="ph"><span class="lbl" style="color:inherit">${esc(ph)}</span><span class="dots" title="${filled} de ${s.every} até a pausa longa">${Array.from({ length: s.every }, (_, k) => `<i class="${k < filled ? "on" : ""}"></i>`).join("")}</span></div>
    <div class="clock" id="clock" role="timer">${fmt(l)}</div>
    <div class="meter"><i id="bar" style="width:${pct.toFixed(1)}%"></i></div>
    ${st.auth ? `<select class="sel" id="task" aria-label="Trabalhando em"><option value="">Sem tarefa específica</option>${extra}${opts}</select>` : ""}
    ${task && ix.label(task) ? `<div class="chips"><span class="chip cli">${esc(ix.label(task))}</span></div>` : ""}
    ${t.phase === "focus" && !t.await && t.intr ? `<div class="small muted">${t.intr} ${t.intr === 1 ? "interrupção capturada" : "interrupções capturadas"}</div>` : ""}
    <div class="acts">${a}</div></section>`;
}

function rowHtml(i, ix, side) {
  const lab = ix.label(i), ch = [];
  if (lab) ch.push(`<span class="chip cli">${esc(lab)}</span>`);
  if (i.date && (i.list === "scheduled" || i.list === "waiting")) ch.push(`<span class="chip ${dayDiff(i.date) <= 0 ? "warn" : ""}">${i.list === "waiting" ? "cobrar " : ""}${esc(relDate(i.date))}</span>`);
  if (i.who) ch.push(`<span class="chip">com ${esc(i.who)}</span>`);
  if (i.ctx) ch.push(`<span class="chip">${esc(i.ctx)}</span>`);
  return `<li class="row" data-id="${i.id}"><button class="check" data-a="done" type="button" aria-label="Concluir: ${esc(i.title)}"></button><div class="rm"><span class="t">${esc(i.title)}</span>${ch.length ? `<span class="chips">${ch.join("")}</span>` : ""}</div>${side ? `<span class="rs">${side}</span>` : ""}</li>`;
}

function renderToday() {
  const box = $("#todaybox");
  if (!st.auth) { box.innerHTML = st.pending.length ? `<p class="small muted">${st.pending.length} ${st.pending.length === 1 ? "captura esperando" : "capturas esperando"} login para sincronizar.</p>` : ""; return; }
  const ix = index(st.cache.items), its = st.cache.items.filter(i => i.kind === "item");
  const due = its.filter(i => (i.list === "scheduled" || i.list === "waiting") && i.date && dayDiff(i.date) <= 0).sort((a, b) => a.date.localeCompare(b.date));
  const foco = its.filter(isToday);
  const inbox = its.filter(i => i.list === "inbox").length;
  const pom = (((st.cache.items.find(x => x.id === "meta") || {}).pomLog || {})[today()] || {}).n || 0;
  let h = "";
  if (inbox) h += `<div class="note"><span>${inbox} ${inbox === 1 ? "item" : "itens"} na caixa de entrada</span><button class="btn small" data-a="open" data-hash="caixa" type="button">Processar</button></div>`;
  h += `<section><h2 class="lbl"><span>Agenda e cobranças de hoje</span><span>${due.length}</span></h2>${due.length ? `<ul>${due.map(i => rowHtml(i, ix)).join("")}</ul>` : `<p class="small muted" style="margin:4px 0">Nada com data para hoje.</p>`}</section>`;
  h += `<section><h2 class="lbl"><span>Foco do dia</span><span>${foco.length}${pom ? ` · ${pom} pom` : ""}</span></h2>${foco.length ? `<ul>${foco.map(i => rowHtml(i, ix, `<button class="btn small" data-a="focus-item" type="button">Focar</button>`)).join("")}</ul>` : `<p class="small muted" style="margin:4px 0">Marque <b>Hoje</b> nas próximas ações, aqui ou no app.</p>`}</section>`;
  const rest = its.filter(i => i.list === "next" && !isToday(i)).slice(0, 6);
  if (rest.length) h += `<section><h2 class="lbl"><span>Próximas ações</span><span>${its.filter(i => i.list === "next" && !isToday(i)).length}</span></h2><ul>${rest.map(i => rowHtml(i, ix, `<button class="btn small" data-a="today" type="button" title="Colocar no foco de hoje">Hoje</button>`)).join("")}</ul></section>`;
  box.innerHTML = h;
}

function renderFoot() {
  $("#foot").innerHTML = `<span class="who">${st.auth ? esc(st.auth.email) : "Não conectado"}</span><span style="display:flex;gap:6px">${st.auth ? `<button class="btn small ghost" data-a="signout" type="button">Sair</button>` : ""}<button class="btn small ghost" data-a="options" type="button">Opções</button></span>`;
}
function render() { renderAuth(); renderTimer(); renderToday(); renderFoot(); }

async function load() {
  const d = await chrome.storage.local.get(["auth", "timer", "cache", "syncErr", "pending"]);
  st = { auth: d.auth || null, timer: { ...IDLE, ...(d.timer || {}) }, cache: d.cache || { items: [] }, syncErr: d.syncErr || null, pending: d.pending || [] };
  render();
}
chrome.storage.onChanged.addListener((ch, area) => {
  if (area !== "local") return;
  if (ch.timer || ch.cache || ch.auth || ch.syncErr || ch.pending) {
    const keep = document.activeElement && document.activeElement.id === "task";
    if (!keep) load();
  }
});
setInterval(() => {
  const t = st.timer; if (!t.run) return;
  const s = settingsOf(st.cache.items), l = left(t), c = $("#clock"), b = $("#bar");
  if (c) c.textContent = fmt(l);
  if (b) b.style.width = Math.min(100, 100 - (l / plen(t.phase, s)) * 100).toFixed(1) + "%";
}, 1000);

document.addEventListener("click", async e => {
  const b = e.target.closest("[data-a]"); if (!b) return;
  const a = b.dataset.a, id = b.closest("[data-id]") && b.closest("[data-id]").dataset.id;
  switch (a) {
    case "signin": {
      b.disabled = true; b.textContent = "Abrindo login…";
      const r = await chrome.runtime.sendMessage({ type: "signin" }).catch(e => ({ ok: false, error: String(e) }));
      if (!r || !r.ok) showAuthError((r && r.error) || "erro");
      else load();
      break;
    }
    case "signout": await send({ type: "signout" }); load(); break;
    case "options": chrome.runtime.openOptionsPage(); break;
    case "open": send({ type: "open", hash: b.dataset.hash || "hoje" }); window.close(); break;
    case "done": b.closest("li").style.opacity = .4; await send({ type: "complete", id }); toast("Concluída."); break;
    case "today": await send({ type: "today", id, on: true }); toast("No foco de hoje."); break;
    case "focus-item": await send({ type: "act", act: "focus", arg: id }); break;
    default: await send({ type: "act", act: a });
  }
});
$("#open").addEventListener("click", () => { send({ type: "open", hash: "hoje" }); window.close(); });
document.addEventListener("change", e => { if (e.target.id === "task") send({ type: "act", act: "task", arg: e.target.value || null }); });
$("#cap").addEventListener("submit", async e => {
  e.preventDefault();
  const inp = $("#cap-in"), v = inp.value.trim(); if (!v) return;
  inp.value = "";
  await send({ type: "capture", title: v });
  toast(st.timer.phase === "focus" && st.timer.run ? "Na caixa de entrada. Volte ao foco." : "Na caixa de entrada.");
});

load().then(() => { $("#cap-in").focus(); send({ type: "sync" }); });
