import { CFG } from "./config.js";
import { esc } from "./lib.js";
const $ = s => document.querySelector(s);

const redirect = chrome.identity.getRedirectURL();
$("#redir").textContent = redirect;
$("#dom").textContent = new URL(redirect).host;
$("#extid").textContent = chrome.runtime.id;

async function loadAcct() {
  const { auth } = await chrome.storage.local.get("auth");
  if (auth) {
    $("#acct").innerHTML = `Conectado como <b>${esc(auth.email)}</b>. Tarefas e Pomodoro sincronizados com o app.`;
    $("#acct-acts").innerHTML = `<button class="btn" id="out" type="button">Sair</button>`;
    $("#out").onclick = async () => { await chrome.runtime.sendMessage({ type: "signout" }); loadAcct(); };
  } else {
    $("#acct").textContent = "Não conectado.";
    $("#acct-acts").innerHTML = `<button class="btn primary" id="in" type="button">Entrar com Google</button>`;
    $("#in").onclick = async () => {
      const r = await chrome.runtime.sendMessage({ type: "signin" });
      if (!r || !r.ok) $("#acct").textContent = "Não foi possível entrar: " + ((r && r.error) || "erro");
      loadAcct();
    };
  }
}

async function loadBlock() {
  const { block = { on: false, domains: [] } } = await chrome.storage.local.get("block");
  $("#block-on").checked = !!block.on;
  $("#domains").value = block.domains.join("\n");
}
function parseDomains(v) {
  return [...new Set(v.split(/[\s,]+/).map(x => x.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/.*$/, "")).filter(x => /^[a-z0-9.-]+\.[a-z]{2,}$/.test(x)))];
}
$("#save").onclick = async () => {
  const on = $("#block-on").checked, domains = parseDomains($("#domains").value);
  // Mostrar a tela "Em foco" precisa de acesso aos sites; sem isso, o Chrome só bloqueia a página.
  if (on && domains.length) { try { await chrome.permissions.request({ origins: ["<all_urls>"] }); } catch (e) {} }
  await chrome.storage.local.set({ block: { on, domains } });
  $("#domains").value = domains.join("\n");
  $("#saved").textContent = "Salvo.";
  setTimeout(() => ($("#saved").textContent = ""), 2000);
};
$("#shortcuts").onclick = () => chrome.tabs.create({ url: "chrome://extensions/shortcuts" });

async function loadCid() {
  const { clientId } = await chrome.storage.local.get("clientId");
  $("#cid").value = CFG.googleClientId || clientId || "";
}
$("#cid-save").onclick = async () => {
  const v = $("#cid").value.trim();
  if (v && !/\.apps\.googleusercontent\.com$/.test(v)) { $("#cid-msg").textContent = "Esse não parece um ID de cliente (termina com .apps.googleusercontent.com)."; return; }
  if (v) await chrome.storage.local.set({ clientId: v }); else await chrome.storage.local.remove("clientId");
  $("#cid-msg").textContent = "Salvo.";
};
loadAcct(); loadBlock(); loadCid();
