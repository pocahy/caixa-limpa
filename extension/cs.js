// Ponte com o site Caixa Limpa:
// 1) avisa a extensão quando o Pomodoro muda numa aba aberta do app;
// 2) entrega à extensão o login que o site já tem (Firebase), para não precisar entrar de novo.
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

function readSiteAuth() {
  return new Promise(resolve => {
    let req;
    try { req = indexedDB.open("firebaseLocalStorageDb"); } catch (e) { return resolve(null); }
    req.onerror = () => resolve(null);
    req.onupgradeneeded = () => { try { req.transaction.abort(); } catch (e) {} resolve(null); };
    req.onsuccess = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains("firebaseLocalStorage")) { db.close(); return resolve(null); }
      const all = db.transaction("firebaseLocalStorage", "readonly").objectStore("firebaseLocalStorage").getAll();
      all.onsuccess = () => {
        db.close();
        const rec = (all.result || []).find(r => String(r.fbase_key || "").startsWith("firebase:authUser:"));
        const u = rec && rec.value, tok = u && u.stsTokenManager;
        resolve(u && tok && tok.refreshToken ? { uid: u.uid, email: u.email || "", refreshToken: tok.refreshToken } : null);
      };
      all.onerror = () => { db.close(); resolve(null); };
    };
  });
}
let lastUid = "";
async function shareAuth() {
  const a = await readSiteAuth();
  if (a && a.uid !== lastUid) {
    lastUid = a.uid;
    chrome.runtime.sendMessage({ type: "site-auth", auth: a }).catch(() => {});
  }
}
shareAuth();
setInterval(shareAuth, 5000);
