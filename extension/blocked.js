import { IDLE, left, fmt, esc } from "./lib.js";
let t = { ...IDLE }, items = [];
async function load() {
  const d = await chrome.storage.local.get(["timer", "cache"]);
  t = { ...IDLE, ...(d.timer || {}) }; items = (d.cache && d.cache.items) || [];
  const task = t.task && items.find(x => x.id === t.task);
  document.getElementById("task").innerHTML = task ? `Trabalhando em: <b>${esc(task.title)}</b>. Este site fica bloqueado até o fim do pomodoro.` : "Este site fica bloqueado até o fim do pomodoro.";
  tick();
}
function tick() {
  document.getElementById("clock").textContent = t.phase === "focus" && t.run ? fmt(left(t)) : "--:--";
  if (!(t.phase === "focus" && t.run)) document.getElementById("task").textContent = "O foco terminou. Pode voltar para o site.";
}
setInterval(tick, 1000);
chrome.storage.onChanged.addListener((c, a) => { if (a === "local" && (c.timer || c.cache)) load(); });
document.getElementById("back").onclick = () => (history.length > 1 ? history.back() : window.close());
document.getElementById("pause").onclick = async () => { await chrome.runtime.sendMessage({ type: "act", act: "pause" }); history.back(); };
load();
