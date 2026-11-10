// Login com Google e acesso ao Firestore pela API REST (sem SDK, compatível com o service worker).
import { CFG } from "./config.js";

const BASE = `https://firestore.googleapis.com/v1/projects/${CFG.projectId}/databases/(default)/documents`;

export async function signIn() {
  if (!CFG.googleClientId) throw new Error("no_client_id");
  const redirect = chrome.identity.getRedirectURL();
  const params = new URLSearchParams({
    client_id: CFG.googleClientId,
    response_type: "id_token",
    redirect_uri: redirect,
    scope: "openid email profile",
    nonce: crypto.randomUUID(),
    prompt: "select_account"
  });
  const resp = await chrome.identity.launchWebAuthFlow({ url: "https://accounts.google.com/o/oauth2/v2/auth?" + params, interactive: true });
  const idToken = new URLSearchParams(new URL(resp).hash.slice(1)).get("id_token");
  if (!idToken) throw new Error("no_id_token");
  const r = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithIdp?key=${CFG.apiKey}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ postBody: `id_token=${idToken}&providerId=google.com`, requestUri: redirect, returnSecureToken: true, returnIdpCredential: true })
  });
  const j = await r.json();
  if (!r.ok) throw new Error((j.error && j.error.message) || "auth_failed");
  const auth = { uid: j.localId, email: j.email || "", idToken: j.idToken, refreshToken: j.refreshToken, exp: Date.now() + (Number(j.expiresIn) - 60) * 1000 };
  await chrome.storage.local.set({ auth });
  return auth;
}

export async function signOut() {
  await chrome.storage.local.remove(["auth", "cache"]);
}

let refreshing = null;
export async function getAuth() {
  const { auth } = await chrome.storage.local.get("auth");
  if (!auth) return null;
  if (Date.now() < auth.exp) return auth;
  if (!refreshing) {
    refreshing = (async () => {
      const r = await fetch(`https://securetoken.googleapis.com/v1/token?key=${CFG.apiKey}`, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ grant_type: "refresh_token", refresh_token: auth.refreshToken })
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) {
        if (r.status === 400 || r.status === 401) await chrome.storage.local.remove("auth");
        throw new Error("refresh_failed");
      }
      const a = { ...auth, idToken: j.id_token, refreshToken: j.refresh_token, exp: Date.now() + (Number(j.expires_in) - 60) * 1000 };
      await chrome.storage.local.set({ auth: a });
      return a;
    })().finally(() => { refreshing = null; });
  }
  return refreshing;
}

async function call(path, opt = {}) {
  const a = await getAuth();
  if (!a) throw new Error("signed_out");
  const r = await fetch(`${BASE}/users/${a.uid}/items${path}`, {
    ...opt,
    headers: { "Content-Type": "application/json", Authorization: "Bearer " + a.idToken }
  });
  if (r.status === 404) return null;
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error((j.error && j.error.status) || "http_" + r.status);
  return j;
}

export async function listItems() {
  const out = [];
  let pt = "";
  do {
    const j = await call("?pageSize=300" + (pt ? "&pageToken=" + encodeURIComponent(pt) : ""));
    ((j && j.documents) || []).forEach(d => out.push({ ...fromFields(d.fields || {}), id: d.name.split("/").pop() }));
    pt = j && j.nextPageToken;
  } while (pt);
  return out;
}
export async function getDoc(id) {
  const j = await call("/" + encodeURIComponent(id));
  return j ? { ...fromFields(j.fields || {}), id } : null;
}
// Substitui o documento inteiro (cria se não existir).
export async function setDoc(id, obj) {
  await call("/" + encodeURIComponent(id), { method: "PATCH", body: JSON.stringify({ fields: toFields(obj) }) });
}
// Atualiza só os campos informados.
export async function updateDoc(id, obj) {
  const mask = Object.keys(obj).map(k => "updateMask.fieldPaths=" + encodeURIComponent(k)).join("&");
  await call("/" + encodeURIComponent(id) + "?" + mask, { method: "PATCH", body: JSON.stringify({ fields: toFields(obj) }) });
}

function toValue(v) {
  if (v === null || v === undefined) return { nullValue: null };
  if (typeof v === "boolean") return { booleanValue: v };
  if (typeof v === "number") return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
  if (typeof v === "string") return { stringValue: v };
  if (Array.isArray(v)) return { arrayValue: { values: v.map(toValue) } };
  return { mapValue: { fields: toFields(v) } };
}
export function toFields(o) {
  const f = {};
  for (const k in o) if (o[k] !== undefined) f[k] = toValue(o[k]);
  return f;
}
function fromValue(v) {
  if ("nullValue" in v) return null;
  if ("booleanValue" in v) return v.booleanValue;
  if ("integerValue" in v) return Number(v.integerValue);
  if ("doubleValue" in v) return v.doubleValue;
  if ("stringValue" in v) return v.stringValue;
  if ("timestampValue" in v) return v.timestampValue;
  if ("arrayValue" in v) return (v.arrayValue.values || []).map(fromValue);
  if ("mapValue" in v) return fromFields(v.mapValue.fields || {});
  return null;
}
export function fromFields(f) {
  const o = {};
  for (const k in f) o[k] = fromValue(f[k]);
  return o;
}
