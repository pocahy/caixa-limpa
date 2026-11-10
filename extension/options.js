import { CFG } from "./config.js";
import { esc } from "./lib.js";
const $ = s => document.querySelector(s);

const redirect = chrome.identity.getRedirectURL();
$("#redir").textContent = redirect;
$("#dom").textContent = new URL(redirect).host;
$("#extid").textContent = chrome.runtime.id;

function errMsg(e) {
  if (e === "no_client_id") return "Cole o ID do cliente Google acima e tente de novo.";
  if (/redirect_uri_mismatch|Authorization page could not be loaded/i.test(e)) return "O Google recusou o login: falta autorizar o endereço da extensão no Google Cloud (passo 2 abaixo).";
  if (/canceled|cancelled|did not approve|closed/i.test(e)) return "Login cancelado.";
  if (/UNAUTHORIZED_DOMAIN|INVALID_IDP_RESPONSE/i.test(e)) return "O Firebase recusou o login: adicione o domínio da extensão em Domínios autorizados (passo 3 abaixo).";
  return "Não foi possível entrar: " + e;
}
async function currentCid() { const { clientId } = await chrome.storage.local.get("clientId"); return CFG.googleClientId || clientId || ""; }
async function loadAcct(showCid) {
  const { auth } = await chrome.storage.local.get("auth"), cid = await currentCid();
  $("#cid-now").textContent = cid || "nenhum";
  $("#cid").value = cid;
  $("#cid-box").hidden = !!auth || (!!cid && !showCid);
  if (auth) {
    $("#acct").innerHTML = `Conectado como <b>${esc(auth.email)}</b>. Tarefas e Pomodoro sincronizados com o app.`;
    $("#acct-acts").innerHTML = `<button class="btn" id="out" type="button">Sair</button>`;
    $("#out").onclick = async () => { await chrome.runtime.sendMessage({ type: "signout" }); loadAcct(); };
    return;
  }
  $("#acct").textContent = "Não conectado. O jeito mais simples: abra o Caixa Limpa neste navegador, conectado com sua conta Google, e a extensão entra junto.";
  $("#acct-acts").innerHTML = `<button class="btn primary" id="site" type="button">Abrir o Caixa Limpa</button><button class="btn" id="in" type="button">Entrar direto com Google</button>`;
  $("#site").onclick = () => chrome.runtime.sendMessage({ type: "open", hash: "hoje" });
  $("#in").onclick = async () => {
    const b = $("#in"); b.disabled = true; b.textContent = "Abrindo login…"; $("#acct-err").hidden = true;
    const r = await chrome.runtime.sendMessage({ type: "signin" }).catch(e => ({ ok: false, error: String(e) }));
    await loadAcct();
    if (!r || !r.ok) { $("#acct-err").textContent = errMsg((r && r.error) || "erro"); $("#acct-err").hidden = false; if (r && r.error === "no_client_id") { $("#cid-box").hidden = false; $("#cid").focus(); } }
  };
}
$("#cid-save").onclick = async () => {
  const v = $("#cid").value.trim();
  if (v && !/\.apps\.googleusercontent\.com$/.test(v)) { $("#cid-msg").textContent = "Esse não parece um ID de cliente: ele termina com .apps.googleusercontent.com."; return; }
  if (v) await chrome.storage.local.set({ clientId: v }); else await chrome.storage.local.remove("clientId");
  $("#cid-msg").textContent = v ? "Salvo. Agora clique em Entrar com Google." : "Removido.";
  $("#acct-err").hidden = true;
  loadAcct(true);
};
$("#cid-edit").onclick = () => { $("#cid-box").hidden = false; $("#cid").focus(); };

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

loadAcct(); loadBlock();
