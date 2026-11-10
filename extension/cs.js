// Ponte com o site: avisa a extensão quando o Pomodoro muda numa aba aberta do Caixa Limpa.
let last = "";
setInterval(() => {
  try {
    const v = localStorage.getItem("caixa-limpa-pom") || "";
    if (v && v !== last) {
      last = v;
      chrome.runtime.sendMessage({ type: "site-timer", t: JSON.parse(v) }).catch(() => {});
    }
  } catch (e) {}
}, 1500);
