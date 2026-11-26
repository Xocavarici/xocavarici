import { auth, db } from "./firebase.js";
import { onAuthStateChanged, signInWithEmailAndPassword, createUserWithEmailAndPassword, updateProfile, signOut, sendPasswordResetEmail } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";
import { ref, onValue, set, update, push, remove, get, serverTimestamp, query, orderByChild, equalTo, limitToLast, runTransaction } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-database.js";

/* ================= Köməkçilər ================= */
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const ic = (n, c = "") => `<svg class="ic ${c}"><use href="#i-${n}"/></svg>`;
const pad = n => String(n).padStart(2, "0");
const fmtT = t => { if (!t) return ""; const d = new Date(t); return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`; };
const fmtP = n => { n = Number(n || 0); return (n % 1 ? n.toFixed(2) : String(n)) + " ₼"; };
const priceTxt = l => l.priceType === "nego" ? "Razılaşma yolu ilə" : l.priceType === "order" ? "Sifarişlə" : fmtP(l.price);
const ptCls = l => (l.priceType && l.priceType !== "fixed") ? " t" : "";
const fmtAV = n => Number(n || 0).toFixed(2) + " AV";
const initials = n => String(n || "?").trim().split(/\s+/).slice(0, 2).map(w => w[0] || "").join("").toUpperCase() || "?";
const now = () => Date.now() + (S.off || 0);
const ago = t => {
  if (!t) return "indicə";
  const s = Math.max(0, Math.floor((now() - t) / 1000));
  if (s < 60) return "indicə";
  const m = Math.floor(s / 60); if (m < 60) return m + " dəq əvvəl";
  const h = Math.floor(m / 60); if (h < 24) return h + " saat əvvəl";
  const d = Math.floor(h / 24); if (d < 30) return d + " gün əvvəl";
  return fmtT(t).slice(0, 10);
};
const telHref = p => {
  let d = String(p || "").replace(/[^\d+]/g, ""); if (!d) return "";
  if (d[0] !== "+") { if (d.startsWith("994")) d = "+" + d; else if (d[0] === "0") d = "+994" + d.slice(1); }
  return "tel:" + d;
};
const lsGet = k => { try { return JSON.parse(localStorage.getItem(k) || "[]"); } catch (e) { return []; } };
const lsSet = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { } };
const lsAdd = (k, v, max = 200) => { const a = lsGet(k).filter(x => x !== v); a.unshift(v); lsSet(k, a.slice(0, max)); };
let tt, toastFn = null;
function toast(m, fn) {
  const t = $("#toast"); t.textContent = m; toastFn = fn || null; t.style.pointerEvents = fn ? "auto" : "none";
  t.classList.add("on"); clearTimeout(tt); tt = setTimeout(() => t.classList.remove("on"), fn ? 5000 : 3000);
}
$("#toast").addEventListener("click", () => { if (toastFn) { const f = toastFn; toastFn = null; $("#toast").classList.remove("on"); f(); } });

const AUTH_ERR = {
  "auth/invalid-email": "E-poçt ünvanı düzgün deyil.", "auth/missing-password": "Şifrəni yazın.",
  "auth/invalid-credential": "E-poçt və ya şifrə yanlışdır.", "auth/wrong-password": "E-poçt və ya şifrə yanlışdır.",
  "auth/user-not-found": "Bu e-poçt ilə hesab tapılmadı.", "auth/email-already-in-use": "Bu e-poçt artıq qeydiyyatdan keçib.",
  "auth/weak-password": "Şifrə ən azı 6 simvol olmalıdır.", "auth/too-many-requests": "Çox sayda cəhd edildi. Bir az sonra yenidən yoxlayın.",
  "auth/network-request-failed": "İnternet bağlantısı yoxdur.", "auth/user-disabled": "Bu hesab deaktiv edilib."
};
const authMsg = e => AUTH_ERR[e && e.code] || "Xəta baş verdi. Yenidən cəhd edin.";
const dbMsg = e => (e && /permission/i.test((e.code || "") + (e.message || ""))) ? "Bu əməliyyat üçün icazəniz yoxdur." : "Xəta baş verdi. İnternet bağlantısını yoxlayın.";

const CATS = [
  { k: "bike", n: "Velosiped", i: "bike" }, { k: "frame", n: "Velosiped Çərçivəsi", i: "frame" },
  { k: "gear", n: "Sürət Ötürücü", i: "cog" }, { k: "brake", n: "Tormuz Sistemi", i: "disc" },
  { k: "light", n: "İşıq Sistemi", i: "lamp" }, { k: "lock", n: "Kilid və Aksesuar", i: "lock" }, { k: "other", n: "Digər", i: "dots" }
];
const catName = k => (CATS.find(c => c.k === k) || { n: "Digər" }).n;
const CITIES = ["Alvero", "Masallı", "Lənkəran", "Bakı", "Sumqayıt", "Xırdalan", "Gəncə", "Mingəçevir", "Şəki", "Naxçıvan", "Digər"];
const COND = { new: "Yeni", used: "İşlənmiş" };

/* ================= Vəziyyət ================= */
const S = {
  user: null, profile: {}, wallet: {}, cfg: { boostCost: 3, boostDays: 3 }, off: 0,
  listings: {}, mine: {}, extra: {}, photos: {}, chats: {}, chatSeen: {}, chatsInit: false, tx: {}, anns: {},
  stack: [], cur: null, subUn: null, ignorePop: false, openChat: null, chatAttach: null,
  mtab: "active", htab: "viewed", city: "", f: { q: "", cat: "", city: "", sort: "new", min: "", max: "", cond: "" },
  annShown: new Set(), annBusy: false, annInit: false, unsubs: [], registering: false, heroT: null, fetching: new Set()
};
try { S.city = localStorage.getItem("xi_city") || ""; } catch (e) { }
let installEv = null;

function detach() {
  S.unsubs.forEach(u => { try { u(); } catch (e) { } }); S.unsubs = [];
  Object.assign(S, { profile: {}, wallet: {}, listings: {}, mine: {}, chats: {}, chatSeen: {}, chatsInit: false, tx: {} });
  clearInterval(S.heroT);
}
function listen(r, cb, err) { const u = onValue(r, cb, err || (() => toast("Məlumat oxunarkən xəta baş verdi."))); S.unsubs.push(u); }

/* ================= Giriş / qeydiyyat ================= */
onAuthStateChanged(auth, u => {
  $("#boot").classList.add("hide");
  detach();
  if (!u) {
    S.user = null; closeAll(); closeModal();
    $("#auth").classList.remove("hide"); $("#app").classList.add("hide"); updateBadges();
    return;
  }
  S.user = u; S.isAdmin = false;
  get(ref(db, `admins/${u.uid}`)).then(x => { S.isAdmin = x.val() === true; refreshSub("settings"); }).catch(() => { });
  $("#auth").classList.add("hide"); $("#app").classList.remove("hide");
  buildHome();
  const uid = u.uid;
  S.unsubs.push(onValue(ref(db, ".info/serverTimeOffset"), s => { S.off = s.val() || 0; }));
  listen(ref(db, `users/${uid}`), s => {
    if (!s.exists()) {
      if (!S.registering) set(ref(db, `users/${uid}`), { name: u.displayName || "", email: u.email || "", phone: "", createdAt: serverTimestamp() }).catch(() => { });
      return;
    }
    S.profile = s.val() || {}; renderAll(); refreshSub("profile");
  });
  listen(ref(db, `wallets/${uid}`), s => { S.wallet = s.val() || {}; renderProfile(); refreshSub("wallet"); });
  listen(ref(db, "config"), s => { S.cfg = Object.assign({ boostCost: 3, boostDays: 3 }, s.val() || {}); refreshSub("wallet", "listing"); }, () => { });
  listen(query(ref(db, "listings"), limitToLast(150)), s => { S.listings = s.val() || {}; renderAll(); refreshSub("listing", "browse"); });
  listen(query(ref(db, "listings"), orderByChild("uid"), equalTo(uid)), s => { S.mine = s.val() || {}; renderMine(); refreshSub("listing"); });
  listen(query(ref(db, `av_tx/${uid}`), limitToLast(60)), s => { S.tx = s.val() || {}; renderHistory(); refreshSub("wallet"); }, () => { });
  listen(ref(db, `user_chats/${uid}`), s => onChats(s.val() || {}));
  refreshBell();
  renderAll();
  handleHash();
});
$("#fIn").addEventListener("submit", async e => {
  e.preventDefault(); const b = $("#inBtn"); b.disabled = true; $("#inErr").textContent = "";
  try { await signInWithEmailAndPassword(auth, $("#inEmail").value.trim(), $("#inPass").value); }
  catch (er) { $("#inErr").textContent = authMsg(er); }
  b.disabled = false;
});
$("#fUp").addEventListener("submit", async e => {
  e.preventDefault(); const b = $("#upBtn"); b.disabled = true; $("#upErr").textContent = "";
  const name = $("#upName").value.trim(), phone = $("#upPhone").value.trim(), email = $("#upEmail").value.trim();
  if (name.length < 3) { $("#upErr").textContent = "Ad və soyadı tam yazın."; b.disabled = false; return; }
  if (phone.replace(/\D/g, "").length < 9) { $("#upErr").textContent = "Telefon nömrəsi düzgün deyil."; b.disabled = false; return; }
  S.registering = true;
  try {
    const c = await createUserWithEmailAndPassword(auth, email, $("#upPass").value);
    try { await updateProfile(c.user, { displayName: name }); } catch (x) { }
    await set(ref(db, `users/${c.user.uid}`), { name, phone, email, createdAt: serverTimestamp() });
  } catch (er) { $("#upErr").textContent = er && er.code ? authMsg(er) : dbMsg(er); }
  S.registering = false; b.disabled = false;
});

/* ================= Naviqasiya ================= */
function showTab(v) {
  closeAll();
  $$("#views > .view").forEach(x => x.classList.toggle("on", x.id === "v-" + v));
  $$("#nav button[data-v]").forEach(b => b.classList.toggle("on", b.dataset.v === v));
}
function openSub(name, arg) {
  S.stack.push({ name, arg });
  try { history.pushState({ s: S.stack.length }, ""); } catch (e) { }
  drawSub();
}
function replaceSub(name, arg) { S.stack[S.stack.length - 1] = { name, arg }; drawSub(); }
function backSub() { if (!S.stack.length) return; try { history.back(); } catch (e) { S.stack.pop(); drawSub(); } }
function closeAll() {
  const n = S.stack.length; if (!n) return;
  S.stack = []; drawSub(); S.ignorePop = true;
  try { history.go(-n); } catch (e) { S.ignorePop = false; }
}
window.addEventListener("popstate", () => {
  if (S.ignorePop) { S.ignorePop = false; return; }
  if (S.stack.length) { S.stack.pop(); drawSub(); }
});
function drawSub() {
  if (S.subUn) { try { S.subUn(); } catch (e) { } S.subUn = null; }
  const t = S.stack[S.stack.length - 1], el = $("#sub");
  $("#app").classList.toggle("insub", !!t);
  if (!t) { el.classList.remove("on"); S.cur = null; return; }
  const s = SUB[t.name]; S.cur = t;
  $("#subTitle").textContent = typeof s.title === "function" ? s.title(t.arg) : s.title;
  $("#subRight").innerHTML = s.right ? s.right(t.arg) : "";
  const b = $("#subBody"); b.className = "subbody" + (s.flush ? " flush" : ""); b.innerHTML = s.render(t.arg); b.scrollTop = 0;
  el.classList.add("on"); if (s.mount) s.mount(t.arg, b);
}
function refreshSub(...names) {
  const t = S.cur; if (!t || !names.includes(t.name)) return;
  const s = SUB[t.name]; if (!s.live) return;
  const b = $("#subBody"), y = ($(".dscroll", b) || b).scrollTop;
  if (s.upd) { s.upd(t.arg, b); return; }
  $("#subTitle").textContent = typeof s.title === "function" ? s.title(t.arg) : s.title;
  b.innerHTML = s.render(t.arg); ($(".dscroll", b) || b).scrollTop = y; if (s.mount) s.mount(t.arg, b);
}
function renderAll() { renderHomeGrid(); renderMine(); renderHistory(); renderProfile(); updateBadges(); }

/* ================= Modal ================= */
function modal(html) { $("#msheet").innerHTML = html; $("#modal").classList.remove("hide"); return $("#msheet"); }
function closeModal() { $("#modal").classList.add("hide"); $("#msheet").innerHTML = ""; }
function ask(msg, okText = "Bəli", danger = true) {
  return new Promise(res => {
    const m = modal(`<h3>${esc(msg)}</h3><button class="btn ${danger ? "red" : ""}" id="aok">${esc(okText)}</button><button class="btn ghost" id="ano">Xeyr</button>`);
    $("#aok", m).onclick = () => { closeModal(); res(true); };
    $("#ano", m).onclick = () => { closeModal(); res(false); };
  });
}

/* ================= Elan məlumatları ================= */
const getL = id => S.listings[id] || S.mine[id] || S.extra[id] || null;
const isBoosted = l => l && l.boostedUntil && l.boostedUntil > now();
const visible = l => l && l.status === "active" && !l.blocked;
function sortL(arr) { return arr.sort((a, b) => (isBoosted(b[1]) - isBoosted(a[1])) || ((b[1].createdAt || 0) - (a[1].createdAt || 0))); }
async function fetchL(id) {
  if (S.fetching.has(id) || getL(id)) return; S.fetching.add(id);
  try { const s = await get(ref(db, `listings/${id}`)); if (s.exists()) { S.extra[id] = s.val(); renderHistory(); refreshSub("listing"); } } catch (e) { }
  S.fetching.delete(id);
}
const favSet = () => S.profile.favs || {};
function card(id, l) {
  const fav = !!favSet()[id];
  return `<article class="lc" data-act="open" data-id="${esc(id)}"><div class="lc-img">${l.thumb ? `<img src="${l.thumb}" alt="" loading="lazy">` : `<span class="noimg">${ic("bike", "xl")}</span>`}${isBoosted(l) ? `<span class="vip">${ic("bolt")} VIP</span>` : ""}${l.status === "sold" ? '<span class="soldtag">Satılıb</span>' : ""}<button class="fav ${fav ? "on" : ""}" data-act="fav" data-id="${esc(id)}" aria-label="Sevimlilərə əlavə et">${ic("heart")}</button></div>
  <div class="lc-b"><h4>${esc(l.title)}</h4><div class="pr${ptCls(l)}">${priceTxt(l)}</div><small>${esc(l.city || "")} · ${ago(l.createdAt)}</small></div></article>`;
}
const emptyBox = (icon, h, p, btn = "") => `<div class="empty">${ic(icon)}<h3>${h}</h3><p>${p}</p>${btn}</div>`;

/* ================= Ana səhifə ================= */
function buildHome() {
  const el = $("#v-home");
  el.innerHTML = `<header class="top"><div class="logo"><img class="lg" src="logo-mark.png" alt="Alvero"><div><span>Alvero</span><em>Daha yaxın, daha rahat!</em></div></div>
    <div class="hicons">
    <button class="circ" data-act="chats" aria-label="Mesajlar">${ic("chat")}<i class="badge hide" id="bChat">0</i></button>
    <button class="circ" data-act="bell" aria-label="Bildirişlər">${ic("bell")}<i class="dotg hide" id="bBell"></i></button></div></header>
    <form class="search" id="hs"><div class="sbox">${ic("search")}<input id="hq" placeholder="Velosiped axtar…" enterkeyhint="search" autocomplete="off"></div><button type="button" class="fbtn" data-act="filters" aria-label="Filtr">${ic("filter")}</button></form>
    <div class="scroll" id="hscroll">
      <div class="hero" id="hero">
        <div class="slide s1"><h3>Alvero</h3><p>Daha yaxın, daha rahat!</p><button class="go" data-act="browse">Elanlara bax</button><svg class="bk" viewBox="0 0 64 40"><use href="#i-bike"/></svg></div>
        <div class="slide s2"><h3>Aksesuarlarda ən yaxşı seçim!</h3><p>Kilid, işıq, tormuz və daha çox</p><button class="go" data-act="cat" data-k="lock">Bax</button><svg class="bk" viewBox="0 0 48 48"><use href="#i-lock"/></svg></div>
        <div class="slide s3"><h3>Elanını pulsuz yerləşdir</h3><p>Bir neçə saniyəyə satışa çıxar</p><button class="go" data-act="add">Elan ver</button><svg class="bk" viewBox="0 0 24 24"><use href="#i-tag"/></svg></div>
      </div><div class="dots" id="dots"><i class="on"></i><i></i><i></i></div>
      <div class="cats"><button class="cat" data-act="cat" data-k="">${ic("all")}<span>Hamısı</span></button>${CATS.map(c => `<button class="cat" data-act="cat" data-k="${c.k}">${ic(c.i)}<span>${esc(c.n)}</span></button>`).join("")}</div>
      <div class="promoban" data-act="sub" data-n="wallet"><b>AV pulu ilə elanını önə çıxar!</b><em>Promokod daxil et</em>${ic("bolt")}</div>
      <div class="cityrow"><button class="pill" data-act="cityPick">${ic("pin")}<span id="cityLbl">${esc(S.city || "Bütün şəhərlər")}</span>${ic("down", "sm")}</button></div>
      <div class="sech"><h2>Ən yeni elanlar</h2><button data-act="browse">Hamısına bax ${ic("chev")}</button></div>
      <div class="grid" id="hgrid"></div>
    </div>`;
  const hero = $("#hero"), dots = $$("#dots i");
  hero.addEventListener("scroll", () => { const i = Math.round(hero.scrollLeft / Math.max(1, hero.clientWidth)); dots.forEach((d, k) => d.classList.toggle("on", k === i)); });
  clearInterval(S.heroT);
  S.heroT = setInterval(() => { if (!$("#v-home").classList.contains("on") || S.stack.length) return; const i = (Math.round(hero.scrollLeft / Math.max(1, hero.clientWidth)) + 1) % 3; hero.scrollTo({ left: i * hero.clientWidth, behavior: "smooth" }); }, 4500);
  $("#hs").addEventListener("submit", e => { e.preventDefault(); const q = $("#hq").value.trim(); $("#hq").blur(); S.f = Object.assign(blankF(), { q }); openSub("browse", {}); });
}
const blankF = () => ({ q: "", cat: "", city: S.city || "", sort: "new", min: "", max: "", cond: "" });
function renderHomeGrid() {
  const g = $("#hgrid"); if (!g) return;
  let arr = sortL(Object.entries(S.listings).filter(([, l]) => visible(l)));
  if (S.city) arr = arr.filter(([, l]) => l.city === S.city);
  arr = arr.slice(0, 12);
  g.innerHTML = arr.length ? arr.map(([id, l]) => card(id, l)).join("") : `<div style="grid-column:1/-1">${emptyBox("tag", "Hələ elan yoxdur", S.city ? "Bu şəhər üçün elan tapılmadı." : "İlk elanı siz yerləşdirin.", '<button class="btn" data-act="add">Elan ver</button>')}</div>`;
}

/* ================= Elanlarım ================= */
function renderMine() {
  const el = $("#v-mine"); if (!el) return;
  const arr = Object.entries(S.mine).sort((a, b) => (b[1].createdAt || 0) - (a[1].createdAt || 0));
  const f = { active: arr.filter(([, l]) => l.status === "active" && !l.blocked), sold: arr.filter(([, l]) => l.status === "sold"), hidden: arr.filter(([, l]) => l.status === "hidden" || l.blocked) };
  const list = f[S.mtab] || [];
  el.innerHTML = `<header class="top plain"><div class="logo"><img class="lg" src="logo-mark.png" alt="Alvero"><div><span>Alvero</span></div></div></header>
  <div class="scroll"><h1 class="ptitle">Elanlarım</h1>
  <div class="tabs">${[["active", "Aktiv"], ["sold", "Satılıb"], ["hidden", "Gizli"]].map(([k, n]) => `<button class="${S.mtab === k ? "on" : ""}" data-act="mtab" data-v="${k}">${n} (${f[k].length})</button>`).join("")}</div>
  <div class="list">${list.length ? list.map(([id, l]) => mineItem(id, l)).join("") : emptyBox("tag", "Elan yoxdur", S.mtab === "active" ? "İlk elanınızı yerləşdirin, alıcılar sizinlə birbaşa əlaqə saxlasın." : "Bu bölmədə elan yoxdur.", S.mtab === "active" ? `<button class="btn" data-act="add">${ic("plus")} Elan ver</button>` : "")}</div></div>`;
}
function mineItem(id, l) {
  const b = isBoosted(l);
  return `<div class="mi"><div class="mi-top" data-act="open" data-id="${esc(id)}"><div class="mi-img">${l.thumb ? `<img src="${l.thumb}" alt="">` : ic("bike")}</div>
  <div class="mi-b"><div class="row"><span class="st ${l.blocked ? "r" : l.status === "sold" ? "d" : l.status === "hidden" ? "p" : ""}">${l.blocked ? "Bloklanıb" : l.status === "sold" ? "Satılıb" : l.status === "hidden" ? "Gizli" : "Aktiv"}</span>${b ? `<span class="st p">${ic("bolt", "sm")} VIP</span>` : ""}</div><h4>${esc(l.title)}</h4><div class="pr${ptCls(l)}">${priceTxt(l)}</div><small>${ago(l.createdAt)}</small></div></div>
  <div class="mi-acts"><button class="chipb" data-act="edit" data-id="${esc(id)}">${ic("edit")} Redaktə</button>${l.status === "active" && !l.blocked ? `<button class="chipb a" data-act="boost" data-id="${esc(id)}">${ic("bolt")} ${b ? "VIP aktivdir" : "Önə çıxar"}</button>` : ""}
  ${l.status === "active" ? `<button class="chipb g" data-act="setst" data-id="${esc(id)}" data-v="sold">${ic("check")} Satıldı</button>` : `<button class="chipb g" data-act="setst" data-id="${esc(id)}" data-v="active">${ic("check")} Aktiv et</button>`}
  <button class="chipb r" data-act="del" data-id="${esc(id)}">${ic("trash")}</button></div></div>`;
}

/* ================= Tarixçə ================= */
function renderHistory() {
  const el = $("#v-history"); if (!el) return;
  let body = "";
  if (S.htab === "viewed") {
    const ids = lsGet("xi_recent"); ids.forEach(fetchL);
    const arr = ids.map(id => [id, getL(id)]).filter(([, l]) => l && !l.blocked);
    body = arr.length ? `<div class="grid">${arr.map(([id, l]) => card(id, l)).join("")}</div>` : emptyBox("eye", "Baxılan elan yoxdur", "Baxdığınız elanlar burada görünəcək.");
  } else if (S.htab === "favs") {
    const ids = Object.keys(favSet()); ids.forEach(fetchL);
    const arr = ids.map(id => [id, getL(id)]).filter(([, l]) => l && !l.blocked);
    body = arr.length ? `<div class="grid">${arr.map(([id, l]) => card(id, l)).join("")}</div>` : emptyBox("heart", "Sevimli elan yoxdur", "Elanın üzərindəki ürək işarəsinə basaraq sevimlilərə əlavə edin.");
  } else {
    const arr = Object.values(S.tx).sort((a, b) => (b.ts || 0) - (a.ts || 0));
    body = arr.length ? `<div class="list">${arr.map(txRow).join("")}</div>` : emptyBox("coin", "Əməliyyat yoxdur", "AV pulu ilə bağlı əməliyyatlarınız burada görünəcək.");
  }
  el.innerHTML = `<header class="top plain"><div class="logo"><img class="lg" src="logo-mark.png" alt="Alvero"><div><span>Alvero</span></div></div></header>
  <div class="scroll"><h1 class="ptitle">Tarixçə</h1><div class="tabs">${[["viewed", "Baxılanlar"], ["favs", "Sevimlilər"], ["av", "AV əməliyyatları"]].map(([k, n]) => `<button class="${S.htab === k ? "on" : ""}" data-act="htab" data-v="${k}">${n}</button>`).join("")}</div>${body}</div>`;
}
const txRow = t => `<div class="tx"><span class="coin" style="background:var(--gl)">${ic("coin")}</span><div><b>${esc(t.note || "Əməliyyat")}</b><small>${fmtT(t.ts)}</small></div><span class="am ${t.amount >= 0 ? "p" : "m"}">${t.amount >= 0 ? "+" : ""}${Number(t.amount).toFixed(2)} AV</span></div>`;

/* ================= Profil ================= */
function renderProfile() {
  const el = $("#v-profile"); if (!el) return;
  const p = S.profile, u = S.user || {}, name = p.name || u.displayName || "İstifadəçi", unread = unreadTotal();
  const row = (icon, label, attrs, extra = "") => `<button class="mrow" ${attrs}>${ic(icon)}<span>${label}</span>${extra}${ic("chev", "sm")}</button>`;
  el.innerHTML = `<header class="top plain"><div class="logo"><img class="lg" src="logo-mark.png" alt="Alvero"><div><span>Alvero</span></div></div><button class="circ" data-act="sub" data-n="settings" aria-label="Ayarlar">${ic("gear")}</button></header>
  <div class="scroll"><button class="phead" data-act="sub" data-n="edit"><div class="ava">${esc(initials(name))}</div><div class="pinfo"><h2>${esc(name)}</h2><p>${esc(p.phone || u.email || "")}</p><span class="vbadge">${ic("shield")}Təsdiqlənmiş hesab</span></div>${ic("chev", "sm")}</button>
  <div class="avcard"><span class="coin">${ic("coin")}</span><div><small>AV balansı</small><b>${Number(S.wallet.balance || 0).toFixed(2)} AV</b></div><button class="btn" data-act="sub" data-n="wallet">${ic("plus")} Yüklə</button></div>
  <div class="menu">${row("grid", "Elanlarım", 'data-act="tab" data-v="mine"')}${row("heart", "Sevimlilər", 'data-act="favtab"')}${row("chat", "Mesajlarım", 'data-act="chats"', unread ? `<span class="tag">${unread}</span>` : "")}
  ${row("coin", "AV pulu və promokodlar", 'data-act="sub" data-n="wallet"')}${row("help", "Dəstək və yardım", 'data-act="sub" data-n="support"')}${row("info", "Tətbiq haqqında", 'data-act="sub" data-n="about"')}${row("shield", "Təhlükəsizlik", 'data-act="sub" data-n="security"')}${row("logout", "Hesabdan çıxış", 'data-act="logout"')}</div>
  <button class="supcard" data-act="sub" data-n="support">${ic("headset")}<div><b>24/7 Dəstək</b><small>Hər zaman sizin üçün</small></div>${ic("chev", "sm")}</button></div>`;
}

/* ================= Bildiriş nişanları ================= */
const unreadTotal = () => Object.values(S.chats).reduce((a, c) => a + (Number(c.unread) || 0), 0);
const annActive = a => a && a.active !== false && (!a.expiresAt || a.expiresAt > now());
function refreshBell() {
  const seen = lsGet("xi_ann_seen"), n = Object.entries(S.anns).filter(([id, a]) => annActive(a) && !seen.includes(id)).length;
  const d = $("#bBell"); if (d) d.classList.toggle("hide", !n);
}
function updateBadges() {
  const n = unreadTotal(), b = $("#bChat"); if (b) { b.textContent = n > 99 ? "99+" : n; b.classList.toggle("hide", !n); }
  document.title = (n ? `(${n}) ` : "") + "Alvero";
  refreshBell();
}

/* ================= Əməliyyatlar ================= */
const A = {
  tab: b => showTab(b.dataset.v),
  authTab: b => { $$("#authTabs button").forEach(x => x.classList.toggle("on", x === b)); $("#fIn").classList.toggle("hide", b.dataset.v !== "in"); $("#fUp").classList.toggle("hide", b.dataset.v !== "up"); },
  forgot: async () => {
    const em = $("#inEmail").value.trim(); if (!em) { $("#inErr").textContent = "Əvvəl e-poçt ünvanınızı yazın."; return; }
    try { await sendPasswordResetEmail(auth, em); toast("Şifrə bərpa linki e-poçtunuza göndərildi."); } catch (e) { $("#inErr").textContent = authMsg(e); }
  },
  back: () => backSub(), mclose: () => closeModal(),
  sub: b => openSub(b.dataset.n),
  add: () => openSub("add", {}),
  open: b => openListing(b.dataset.id),
  edit: b => openSub("add", { id: b.dataset.id }),
  browse: () => { S.f = blankF(); openSub("browse", {}); },
  filters: () => { S.f = Object.assign(blankF(), { q: $("#hq") ? $("#hq").value.trim() : "" }); openSub("browse", { filters: true }); },
  cat: b => { S.f = Object.assign(blankF(), { cat: b.dataset.k }); openSub("browse", {}); },
  fav: async b => {
    const id = b.dataset.id, on = !!favSet()[id];
    try { await update(ref(db, `users/${S.user.uid}/favs`), { [id]: on ? null : true }); } catch (e) { toast(dbMsg(e)); }
  },
  favtab: () => { S.htab = "favs"; renderHistory(); showTab("history"); },
  mtab: b => { S.mtab = b.dataset.v; renderMine(); },
  htab: b => { S.htab = b.dataset.v; renderHistory(); },
  cityPick: () => openCityPicker(),
  chats: () => openSub("chats"),
  bell: () => { SUB.notif.seen = null; openSub("notif"); },
  setst: async b => {
    try { await update(ref(db, `listings/${b.dataset.id}`), { status: b.dataset.v }); toast(b.dataset.v === "sold" ? "Elan «Satılıb» olaraq işarələndi." : "Elan yenidən aktivdir."); } catch (e) { toast(dbMsg(e)); }
  },
  del: async b => {
    if (!(await ask("Elanı həmişəlik silmək istəyirsiniz?", "Sil"))) return;
    const id = b.dataset.id;
    try { await update(ref(db), { [`listings/${id}`]: null, [`listing_photos/${id}`]: null }); toast("Elan silindi."); if (S.cur && S.cur.name === "listing") backSub(); } catch (e) { toast(dbMsg(e)); }
  },
  boost: b => boostListing(b.dataset.id),
  msg: b => openChatFor(b.dataset.id),
  share: async b => {
    const id = b.dataset.id, url = location.origin + location.pathname + "#l=" + id, l = getL(id);
    try { if (navigator.share) await navigator.share({ title: l ? l.title : "Elan", url }); else { await navigator.clipboard.writeText(url); toast("Link kopyalandı."); } } catch (e) { }
  },
  report: b => { const l = getL(b.dataset.id); openSub("support", `Şikayət: «${l ? l.title : ""}» elanı (ID: ${b.dataset.id}). Səbəb: `); },
  logout: async () => { if (await ask("Hesabdan çıxmaq istəyirsiniz?", "Çıx")) { try { await signOut(auth); } catch (e) { toast("Xəta baş verdi."); } } },
  install: async () => { if (installEv) { installEv.prompt(); await installEv.userChoice; installEv = null; refreshSub("about"); } },
  resetPass: async () => { try { await sendPasswordResetEmail(auth, S.user.email); toast("Şifrə dəyişmə linki e-poçtunuza göndərildi."); } catch (e) { toast(authMsg(e)); } },
  toggleNotify: async () => {
    const on = !(S.profile.settings && S.profile.settings.notify === false);
    try { await update(ref(db, `users/${S.user.uid}/settings`), { notify: !on }); } catch (e) { toast(dbMsg(e)); }
  },
  askPerm: async () => {
    if (!("Notification" in window)) { toast("Bu brauzer bildirişləri dəstəkləmir."); return; }
    try { const r = await Notification.requestPermission(); toast(r === "granted" ? "Bildirişlər aktiv edildi." : "Bildiriş icazəsi verilmədi."); } catch (e) { }
    refreshSub("settings", "notif");
  },
  annClose: () => closeAnn()
};
document.addEventListener("click", e => {
  const b = e.target.closest("[data-act]"); if (!b) return;
  const f = A[b.dataset.act]; if (f) f(b, e);
});
window.addEventListener("beforeinstallprompt", e => { e.preventDefault(); installEv = e; });

function openListing(id) {
  lsAdd("xi_recent", id, 30); renderHistory();
  openSub("listing", { id });
}
function handleHash() {
  const m = /^#l=(.+)$/.exec(location.hash || ""); if (!m) return;
  try { history.replaceState(null, "", location.pathname); } catch (e) { }
  openListing(m[1]);
}
function openCityPicker() {
  const m = modal(`<h3>Şəhər seçin</h3><button class="opt ${!S.city ? "on" : ""}" data-c=""><div><b>Bütün şəhərlər</b></div>${!S.city ? ic("check") : ""}</button>${CITIES.map(c => `<button class="opt ${S.city === c ? "on" : ""}" data-c="${esc(c)}"><div><b>${esc(c)}</b></div>${S.city === c ? ic("check") : ""}</button>`).join("")}`);
  $$(".opt", m).forEach(b => b.onclick = () => {
    S.city = b.dataset.c; try { localStorage.setItem("xi_city", S.city); } catch (e) { }
    $("#cityLbl").textContent = S.city || "Bütün şəhərlər"; closeModal(); renderHomeGrid();
  });
}

/* ================= Şəkil sıxışdırma ================= */
function shrink(src, max, q) {
  return new Promise((res, rej) => {
    const im = new Image(); im.onerror = () => rej(new Error("img")); im.onload = () => {
      const k = Math.min(1, max / Math.max(im.width, im.height)), w = Math.max(1, Math.round(im.width * k)), h = Math.max(1, Math.round(im.height * k));
      const c = document.createElement("canvas"); c.width = w; c.height = h; const x = c.getContext("2d");
      x.fillStyle = "#fff"; x.fillRect(0, 0, w, h); x.drawImage(im, 0, 0, w, h); res(c.toDataURL("image/jpeg", q));
    }; im.src = src;
  });
}
const readFile = f => new Promise((res, rej) => { const r = new FileReader(); r.onerror = () => rej(new Error("read")); r.onload = () => res(r.result); r.readAsDataURL(f); });

/* ================= AV pulu: önə çıxarma ================= */
async function boostListing(id) {
  const l = getL(id); if (!l) return;
  if (isBoosted(l)) { toast("Bu elan artıq VIP statusdadır."); return; }
  const cost = Number(S.cfg.boostCost), days = Number(S.cfg.boostDays), bal = Number(S.wallet.balance || 0);
  if (bal < cost) {
    const m = modal(`<h3>AV balansı çatmır</h3><div class="info">Elanı ${days} gün önə çıxarmaq üçün <b>${fmtAV(cost)}</b> lazımdır. Balansınız: <b>${fmtAV(bal)}</b>.</div><button class="btn" id="bw">Promokod daxil et</button><button class="btn ghost" data-act="mclose">Bağla</button>`);
    $("#bw", m).onclick = () => { closeModal(); openSub("wallet"); }; return;
  }
  const m = modal(`<h3>Elanı önə çıxar</h3><div class="info">«${esc(l.title)}» elanı <b>${days} gün</b> ərzində siyahının yuxarısında və VIP nişanı ilə göstəriləcək.</div><div class="kv"><span>Qiymət</span><b>${fmtAV(cost)}</b></div><div class="kv"><span>Balansınız</span><b>${fmtAV(bal)}</b></div><button class="btn" id="bok">${ic("bolt")} Təsdiqlə</button><button class="btn ghost" data-act="mclose">Ləğv et</button>`);
  $("#bok", m).onclick = async () => {
    const btn = $("#bok", m); btn.disabled = true;
    const uid = S.user.uid, tx = push(ref(db, `av_tx/${uid}`)).key;
    try {
      await update(ref(db), {
        [`listings/${id}/boostedUntil`]: Math.round(now() + days * 86400000),
        [`wallets/${uid}/balance`]: +(bal - cost).toFixed(2),
        [`av_tx/${uid}/${tx}`]: { type: "boost", amount: -cost, note: `«${l.title}» önə çıxarıldı`, ts: serverTimestamp() }
      });
      closeModal(); toast("Elan önə çıxarıldı.");
    } catch (e) { btn.disabled = false; toast(dbMsg(e)); }
  };
}
async function redeemPromo(e) {
  e.preventDefault(); const err = $("#pe"), btn = $("#pb"); err.textContent = "";
  const code = $("#pc").value.trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (code.length < 3) { err.textContent = "Promokodu düzgün yazın."; return; }
  btn.disabled = true; const uid = S.user.uid;
  try {
    for (let t = 0; t < 3; t++) {
      const ps = await get(ref(db, `promo_codes/${code}`));
      if (!ps.exists()) { err.textContent = "Belə promokod tapılmadı."; break; }
      const p = ps.val();
      if (p.active !== true) { err.textContent = "Bu promokod aktiv deyil."; break; }
      if ((p.used || 0) >= (p.maxUses || 0)) { err.textContent = "Bu promokodun istifadə limiti bitib."; break; }
      if (p.expiresAt && now() > p.expiresAt) { err.textContent = "Bu promokodun müddəti bitib."; break; }
      if ((await get(ref(db, `promo_redeem/${code}/${uid}`))).exists()) { err.textContent = "Bu promokodu artıq istifadə etmisiniz."; break; }
      const cur = Number((await get(ref(db, `wallets/${uid}/balance`))).val() || 0), tx = push(ref(db, `av_tx/${uid}`)).key;
      const upd = {
        [`promo_redeem/${code}/${uid}`]: true,
        [`wallets/${uid}/balance`]: +(cur + Number(p.amount)).toFixed(2),
        [`wallets/${uid}/lastPromo`]: code,
        [`promo_codes/${code}/used`]: (p.used || 0) + 1,
        [`av_tx/${uid}/${tx}`]: { type: "promo", amount: Number(p.amount), note: `Promokod: ${code}`, ts: serverTimestamp() }
      };
      try { await update(ref(db), upd); toast(`Balansınıza ${fmtAV(p.amount)} əlavə olundu.`); const i = $("#pc"); if (i) i.value = ""; break; }
      catch (er) { if (t === 2) err.textContent = "Promokod tətbiq olunmadı. Bir az sonra yenidən cəhd edin."; else await new Promise(r => setTimeout(r, 500)); }
    }
  } catch (er) { err.textContent = dbMsg(er); }
  btn.disabled = false;
}

/* ================= Söhbət ================= */
const chatList = () => Object.entries(S.chats).sort((a, b) => (b[1].ts || 0) - (a[1].ts || 0));
function openChatFor(listingId) {
  const l = getL(listingId); if (!l) return;
  if (l.uid === S.user.uid) { toast("Bu sizin öz elanınızdır."); return; }
  openSub("chat", { cid: `${listingId}_${S.user.uid}`, listingId });
}
function onChats(v) {
  const first = !S.chatsInit, uid = S.user && S.user.uid; S.chats = v;
  Object.entries(v).forEach(([cid, c]) => {
    const prev = S.chatSeen[cid]; S.chatSeen[cid] = c.ts || 0;
    if (!first && c.lastFrom && c.lastFrom !== uid && (c.ts || 0) > (prev || 0) && S.openChat !== cid) incoming(cid, c);
  });
  S.chatsInit = true; updateBadges(); renderProfile(); refreshSub("chats");
  if (S.chatAttach) S.chatAttach();
  if (S.openChat && v[S.openChat] && v[S.openChat].unread > 0) markRead(S.openChat);
}
function incoming(cid, c) {
  if (S.profile.settings && S.profile.settings.notify === false) return;
  toast(`${c.other || "Yeni mesaj"}: ${c.last || ""}`, () => openSub("chat", { cid }));
  try { navigator.vibrate && navigator.vibrate([120, 60, 120]); } catch (e) { }
  sysNotify(c.other || "Yeni mesaj", c.last || "", cid);
}
async function sysNotify(title, body, tag) {
  try {
    if (!("Notification" in window) || Notification.permission !== "granted" || !document.hidden) return;
    const reg = await navigator.serviceWorker.getRegistration(); if (!reg) return;
    reg.showNotification(title, { body, tag, icon: "icon-192.png", badge: "icon-192.png" });
  } catch (e) { }
}
function markRead(cid) { if (S.user && S.chats[cid] && S.chats[cid].unread > 0) update(ref(db, `user_chats/${S.user.uid}/${cid}`), { unread: 0 }).catch(() => { }); }
function chatCtx(a) {
  const c = S.chats[a.cid], uid = S.user.uid;
  if (c) return { cid: a.cid, exists: true, other: c.other || "İstifadəçi", otherId: c.otherId, title: c.title || "", listingId: c.listingId };
  const l = getL(a.listingId) || {};
  return { cid: a.cid, exists: false, other: l.sellerName || "Satıcı", otherId: l.uid, title: l.title || "", listingId: a.listingId, thumb: l.thumb };
}
async function sendChat(ctx, text) {
  const uid = S.user.uid, mid = push(ref(db, `chats/${ctx.cid}/messages`)).key, ts = serverTimestamp(), me = S.profile.name || S.user.displayName || "İstifadəçi";
  const last = text.slice(0, 100), upd = { [`chats/${ctx.cid}/messages/${mid}`]: { from: uid, text, ts } };
  if (!ctx.exists) {
    upd[`chats/${ctx.cid}/meta`] = { listingId: ctx.listingId, title: ctx.title, buyerId: uid, sellerId: ctx.otherId, buyerName: me, sellerName: ctx.other, createdAt: ts };
    upd[`user_chats/${uid}/${ctx.cid}`] = { other: ctx.other, otherId: ctx.otherId, title: ctx.title, listingId: ctx.listingId, last, lastFrom: uid, ts, unread: 0 };
    upd[`user_chats/${ctx.otherId}/${ctx.cid}`] = { other: me, otherId: uid, title: ctx.title, listingId: ctx.listingId, last, lastFrom: uid, ts, unread: 1 };
    await update(ref(db), upd);
  } else {
    upd[`user_chats/${uid}/${ctx.cid}/last`] = last; upd[`user_chats/${uid}/${ctx.cid}/lastFrom`] = uid; upd[`user_chats/${uid}/${ctx.cid}/ts`] = ts;
    upd[`user_chats/${ctx.otherId}/${ctx.cid}/last`] = last; upd[`user_chats/${ctx.otherId}/${ctx.cid}/lastFrom`] = uid; upd[`user_chats/${ctx.otherId}/${ctx.cid}/ts`] = ts;
    await update(ref(db), upd);
    try { await runTransaction(ref(db, `user_chats/${ctx.otherId}/${ctx.cid}/unread`), c => (Number(c) || 0) + 1); } catch (e) { }
  }
}
const msgsHtml = (arr, uid) => arr.map(m => `<div class="msg ${m.from === uid ? "u" : "a"}">${esc(m.text)}<small>${fmtT(m.ts)}</small></div>`).join("");

/* ================= Elan pop-up (admin) və bildiriş siyahısı ================= */
onValue(query(ref(db, "announcements"), limitToLast(30)), s => {
  S.anns = s.val() || {}; S.annInit = true; refreshBell(); refreshSub("notif"); checkPopups();
}, () => { });
function checkPopups() {
  if (S.annBusy || !S.annInit) return;
  const pop = lsGet("xi_ann_pop");
  const q = Object.entries(S.anns).filter(([id, a]) => annActive(a) && a.popup !== false && !S.annShown.has(id) && (a.repeat === true || !pop.includes(id))).sort((a, b) => (a[1].createdAt || 0) - (b[1].createdAt || 0));
  if (!q.length) return;
  showAnn(q[0][0], q[0][1]);
}
const KIND = { info: "Məlumat", update: "Yenilik", promo: "Kampaniya", warning: "Diqqət" };
function showAnn(id, a) {
  S.annBusy = true; S.annShown.add(id); S.annCur = { id, a };
  const k = KIND[a.kind] ? a.kind : "info";
  $("#annCard").innerHTML = `<div class="ann-h ${k}"><button class="ann-x" data-act="annClose" aria-label="Bağla">${ic("x")}</button><small>${KIND[k]}</small><h3>${esc(a.title || "")}</h3></div><div class="ann-b">${esc(a.body || "")}</div><div class="ann-f"><button class="btn" data-act="annClose">Bağla</button></div>`;
  $("#ann").classList.remove("hide");
}
function closeAnn() {
  const c = S.annCur; $("#ann").classList.add("hide");
  if (c) { if (!c.a.repeat) lsAdd("xi_ann_pop", c.id, 100); }
  S.annCur = null; S.annBusy = false; setTimeout(checkPopups, 250);
}

/* ================= Alt səhifələr ================= */
const SUB = {};

/* --- Elan səhifəsi --- */
SUB.listing = {
  title: "Elan", live: true, flush: true,
  right: a => `<button class="circ sm" data-act="share" data-id="${esc(a.id)}" aria-label="Paylaş">${ic("share")}</button>`,
  render: a => {
    const l = getL(a.id);
    if (!l) { fetchL(a.id); return emptyBox("tag", "Elan yüklənir…", "Elan silinib və ya tapılmayıb ola bilər."); }
    const uid = S.user.uid, own = l.uid === uid, ph = S.photos[a.id], imgs = ph && ph.length ? ph : (l.thumb ? [l.thumb] : []), fav = !!favSet()[a.id];
    const gal = imgs.length ? imgs.map(s => `<img src="${s}" alt="">`).join("") : `<div class="ph">${ic("bike", "xl")}</div>`;
    const tags = `<div class="tags"><span class="tag2">${ic("tag")}${esc(catName(l.category))}</span><span class="tag2">${ic("check")}${esc(COND[l.cond] || "")}</span>${l.city ? `<span class="tag2">${ic("pin")}${esc(l.city)}</span>` : ""}<span class="tag2">${ic("history")}${ago(l.createdAt)}</span></div>`;
    let bar;
    if (own) bar = `<div class="abar"><button class="btn ghost" data-act="edit" data-id="${esc(a.id)}">${ic("edit")} Redaktə</button><button class="btn" data-act="boost" data-id="${esc(a.id)}">${ic("bolt")} ${isBoosted(l) ? "VIP aktivdir" : "Önə çıxar"}</button></div>`;
    else if (l.status === "sold") bar = `<div class="abar"><div class="info" style="flex:1;text-align:center">Bu elan satılıb.</div></div>`;
    else bar = `<div class="abar"><button class="btn" data-act="msg" data-id="${esc(a.id)}">${ic("chat")} Mesaj yaz</button>${l.phone ? `<a class="btn ghost" style="text-decoration:none" href="${esc(telHref(l.phone))}">${ic("phone")} Zəng et</a>` : ""}</div>`;
    return `<div class="dscroll"><div class="gal" id="gal">${gal}</div>
    <div class="row"><div class="dprice${ptCls(l)}">${priceTxt(l)}</div><button class="circ sm" data-act="fav" data-id="${esc(a.id)}" style="color:${fav ? "var(--red)" : "inherit"}">${ic("heart", fav ? "fill" : "")}</button></div>
    <div class="dtitle">${esc(l.title)}</div>${tags}
    ${l.blocked ? '<div class="info bad">Bu elan inzibatçı tərəfindən bloklanıb.</div>' : ""}${isBoosted(l) ? `<div class="info ok">${ic("bolt", "sm")} VIP elan · ${fmtT(l.boostedUntil).slice(0, 10)} tarixinədək önə çıxarılıb</div>` : ""}
    <div class="card"><div class="sec" style="margin:0 0 8px">Təsvir</div><div class="desc">${esc(l.desc || "Təsvir əlavə edilməyib.")}</div></div>
    <div class="card seller"><div class="ava">${esc(initials(l.sellerName))}</div><div style="flex:1"><b>${esc(l.sellerName || "Satıcı")}</b><span class="meta">${own ? "Bu sizin elanınızdır" : "Satıcı"}</span></div></div>
    ${own ? "" : `<button class="link" data-act="report" data-id="${esc(a.id)}">Elanı şikayət et</button>`}</div>${bar}`;
  },
  mount: (a, b) => {
    const l = getL(a.id); if (!l) return;
    if (!S.photos[a.id] && !S.photoLoading) {
      S.photoLoading = true;
      get(ref(db, `listing_photos/${a.id}`)).then(s => { S.photos[a.id] = Object.values(s.val() || {}); }).catch(() => { S.photos[a.id] = []; }).finally(() => { S.photoLoading = false; refreshSub("listing"); });
    }
  }
};

/* --- Axtarış / filtr --- */
SUB.browse = {
  title: "Elanlar", live: true,
  render: a => {
    const f = S.f;
    return `<form id="bf" class="form" style="gap:10px"><div class="sbox" style="background:#fff;box-shadow:var(--sh)">${ic("search")}<input id="bq" value="${esc(f.q)}" placeholder="Nə axtarırsınız?" autocomplete="off"></div>
    <div class="chips" id="bc"><button type="button" class="${!f.cat ? "on" : ""}" data-k="">Hamısı</button>${CATS.map(c => `<button type="button" class="${f.cat === c.k ? "on" : ""}" data-k="${c.k}">${esc(c.n)}</button>`).join("")}</div>
    <div id="bx" class="${a.filters ? "" : "hide"}" style="display:flex;flex-direction:column;gap:10px"><div class="grid2"><label>Min qiymət (₼)<input id="bmin" type="number" inputmode="decimal" value="${esc(f.min)}"></label><label>Max qiymət (₼)<input id="bmax" type="number" inputmode="decimal" value="${esc(f.max)}"></label></div>
    <div class="grid2"><label>Şəhər<select id="bcity"><option value="">Hamısı</option>${CITIES.map(c => `<option ${f.city === c ? "selected" : ""}>${esc(c)}</option>`).join("")}</select></label><label>Vəziyyət<select id="bcond"><option value="">Hamısı</option><option value="new" ${f.cond === "new" ? "selected" : ""}>Yeni</option><option value="used" ${f.cond === "used" ? "selected" : ""}>İşlənmiş</option></select></label></div></div>
    <div class="grid2"><button type="button" class="btn ghost" id="bt">${ic("filter")} Filtr</button><label style="margin:0"><select id="bsort"><option value="new" ${f.sort === "new" ? "selected" : ""}>Ən yeni</option><option value="cheap" ${f.sort === "cheap" ? "selected" : ""}>Ən ucuz</option><option value="exp" ${f.sort === "exp" ? "selected" : ""}>Ən bahalı</option></select></label></div></form>
    <div class="meta" id="bn"></div><div class="grid" id="bres" style="padding:0"></div>`;
  },
  mount: (a, b) => {
    const read = () => { Object.assign(S.f, { q: $("#bq").value.trim(), min: $("#bmin").value, max: $("#bmax").value, city: $("#bcity").value, cond: $("#bcond").value, sort: $("#bsort").value }); drawBrowse(); };
    $("#bf").addEventListener("submit", e => { e.preventDefault(); read(); $("#bq").blur(); });
    $("#bq").addEventListener("input", read);
    ["bmin", "bmax", "bcity", "bcond", "bsort"].forEach(i => $("#" + i).addEventListener("input", read));
    $("#bt").onclick = () => $("#bx").classList.toggle("hide");
    $("#bc").addEventListener("click", e => { const x = e.target.closest("button"); if (!x) return; S.f.cat = x.dataset.k; $$("#bc button").forEach(y => y.classList.toggle("on", y === x)); drawBrowse(); });
    drawBrowse();
  },
  upd: () => drawBrowse()
};
function drawBrowse() {
  const el = $("#bres"); if (!el) return; const f = S.f, q = f.q.toLowerCase();
  let arr = Object.entries(S.listings).filter(([, l]) => visible(l));
  if (f.cat) arr = arr.filter(([, l]) => l.category === f.cat);
  if (f.city) arr = arr.filter(([, l]) => l.city === f.city);
  if (f.cond) arr = arr.filter(([, l]) => l.cond === f.cond);
  const fx = l => (l.priceType || "fixed") === "fixed";
  if (f.min !== "") arr = arr.filter(([, l]) => fx(l) && l.price >= Number(f.min));
  if (f.max !== "") arr = arr.filter(([, l]) => fx(l) && l.price <= Number(f.max));
  if (q) arr = arr.filter(([, l]) => (l.title + " " + (l.desc || "")).toLowerCase().includes(q));
  const pv = (l, d) => fx(l) ? l.price : d;
  if (f.sort === "cheap") arr.sort((a, b) => pv(a[1], 1e12) - pv(b[1], 1e12)); else if (f.sort === "exp") arr.sort((a, b) => pv(b[1], -1) - pv(a[1], -1)); else sortL(arr);
  $("#bn").textContent = arr.length + " elan tapıldı";
  el.innerHTML = arr.length ? arr.map(([id, l]) => card(id, l)).join("") : `<div style="grid-column:1/-1">${emptyBox("search", "Elan tapılmadı", "Axtarış və ya filtri dəyişib yenidən yoxlayın.")}</div>`;
}

/* --- Elan əlavə et / redaktə --- */
SUB.add = {
  title: a => a && a.id ? "Elanı redaktə et" : "Yeni elan",
  render: a => {
    const l = a.id ? getL(a.id) : null, p = S.profile, pt = l ? (l.priceType || "fixed") : "fixed";
    return `<form id="af" class="form"><div><div class="sec" style="margin:0 0 8px">Şəkillər (ən çox 4)</div><div class="photos" id="ph"></div><input id="pf" type="file" accept="image/*" multiple hidden></div>
    <div><div class="sec" style="margin:0 0 8px">Kateqoriya</div><div class="chips" id="ac">${CATS.map(c => `<button type="button" data-k="${c.k}" class="${l && l.category === c.k ? "on" : ""}">${esc(c.n)}</button>`).join("")}</div></div>
    <label>Başlıq<input id="at" maxlength="80" required placeholder="Məs: Dağ velosipedi 26&quot;" value="${esc(l ? l.title : "")}"></label>
    <div><div class="sec" style="margin:0 0 8px">Qiymət növü</div><div class="chips" id="apt"><button type="button" data-k="fixed" class="${pt === "fixed" ? "on" : ""}">Qiymət</button><button type="button" data-k="nego" class="${pt === "nego" ? "on" : ""}">Razılaşma yolu ilə</button><button type="button" data-k="order" class="${pt === "order" ? "on" : ""}">Sifarişlə</button></div></div>
    <label id="apw" class="${pt === "fixed" ? "" : "hide"}">Qiymət (₼)<input id="ap" type="number" inputmode="decimal" min="0" step="0.01" value="${l && pt === "fixed" ? l.price : ""}"></label>
    <div><div class="sec" style="margin:0 0 8px">Vəziyyət</div><div class="chips" id="ad"><button type="button" data-k="new" class="${l && l.cond === "new" ? "on" : ""}">Yeni</button><button type="button" data-k="used" class="${!l || l.cond === "used" ? "on" : ""}">İşlənmiş</button></div></div>
    <label>Şəhər<select id="aci">${CITIES.map(c => `<option ${(l ? l.city : (S.city || p.city || "Alvero")) === c ? "selected" : ""}>${esc(c)}</option>`).join("")}</select></label>
    <label>Təsvir<textarea id="ads" maxlength="2000" placeholder="Məhsul haqqında ətraflı məlumat yazın…">${esc(l ? l.desc || "" : "")}</textarea></label>
    <label class="chk"><input type="checkbox" id="asp" ${!l || l.phone ? "checked" : ""}> Telefon nömrəmi elanda göstər</label>
    <p class="err" id="ae"></p><button class="btn" id="ab">${a.id ? "Yadda saxla" : "Elanı yerləşdir"}</button></form>`;
  },
  mount: a => {
    const old = a.id ? getL(a.id) : null; let P = [], changed = false, ptype = old ? (old.priceType || "fixed") : "fixed", cat = old ? old.category : "", cond = old ? old.cond : "used", loading = false;
    const draw = () => {
      $("#ph").innerHTML = P.map((p, i) => `<div class="slot ${i === 0 ? "first" : ""}"><img src="${p}" alt=""><button type="button" class="rm" data-i="${i}" aria-label="Sil">${ic("x")}</button></div>`).join("") + (P.length < 4 ? `<label class="slot" for="pf">${ic("camera")}<span>Əlavə et</span></label>` : "");
    };
    if (old) { const c = S.photos[a.id]; if (c) P = c.slice(); else { loading = true; get(ref(db, `listing_photos/${a.id}`)).then(s => { if (!changed) P = Object.values(s.val() || {}); }).catch(() => { }).finally(() => { loading = false; draw(); }); } }
    draw();
    $("#ph").addEventListener("click", e => { const r = e.target.closest(".rm"); if (!r) return; P.splice(+r.dataset.i, 1); changed = true; draw(); });
    $("#pf").addEventListener("change", async e => {
      const files = [...e.target.files].slice(0, 4 - P.length); e.target.value = "";
      for (const f of files) { try { P.push(await shrink(await readFile(f), 900, 0.72)); changed = true; } catch (x) { toast("Şəkil oxunmadı."); } }
      draw();
    });
    $("#ac").addEventListener("click", e => { const b = e.target.closest("button"); if (!b) return; cat = b.dataset.k; $$("#ac button").forEach(x => x.classList.toggle("on", x === b)); });
    $("#apt").addEventListener("click", e => { const b = e.target.closest("button"); if (!b) return; ptype = b.dataset.k; $$("#apt button").forEach(x => x.classList.toggle("on", x === b)); $("#apw").classList.toggle("hide", ptype !== "fixed"); });
    $("#ad").addEventListener("click", e => { const b = e.target.closest("button"); if (!b) return; cond = b.dataset.k; $$("#ad button").forEach(x => x.classList.toggle("on", x === b)); });
    $("#af").addEventListener("submit", async e => {
      e.preventDefault(); const err = $("#ae"), btn = $("#ab"); err.textContent = "";
      const title = $("#at").value.trim(), price0 = parseFloat(String($("#ap").value).replace(",", ".")), desc = $("#ads").value.trim(), city = $("#aci").value, price = ptype === "fixed" ? price0 : 0;
      if (!cat) { err.textContent = "Kateqoriya seçin."; return; }
      if (title.length < 3) { err.textContent = "Başlıq ən azı 3 simvol olmalıdır."; return; }
      if (ptype === "fixed" && (!isFinite(price) || price < 0)) { err.textContent = "Qiyməti düzgün yazın."; return; }
      if (loading) { err.textContent = "Şəkillər yüklənir, bir az gözləyin."; return; }
      if (!P.length) { err.textContent = "Ən azı 1 şəkil əlavə edin."; return; }
      btn.disabled = true;
      try {
        const uid = S.user.uid, name = S.profile.name || S.user.displayName || "İstifadəçi", phone = $("#asp").checked ? (S.profile.phone || "") : "";
        const id = old ? a.id : push(ref(db, "listings")).key, upd = {};
        const fields = { title, desc, price, priceType: ptype, category: cat, cond, city, phone, sellerName: name };
        if (old) { Object.entries(fields).forEach(([k, v]) => { upd[`listings/${id}/${k}`] = v; }); }
        else upd[`listings/${id}`] = Object.assign({ uid, status: "active", createdAt: serverTimestamp() }, fields);
        if (!old || changed) {
          const thumb = await shrink(P[0], 420, 0.72), ph = {}; P.forEach((p, i) => { ph[i] = p; });
          upd[`listing_photos/${id}`] = ph;
          if (old) upd[`listings/${id}/thumb`] = thumb; else upd[`listings/${id}`].thumb = thumb;
          if (old) S.photos[id] = P.slice();
        }
        await update(ref(db), upd);
        if (!old) S.photos[id] = P.slice();
        toast(old ? "Elan yeniləndi." : "Elanınız yerləşdirildi.");
        replaceSub("listing", { id });
      } catch (er) { btn.disabled = false; err.textContent = dbMsg(er); }
    });
  }
};

/* --- Mesajlar --- */
SUB.chats = {
  title: "Mesajlar", live: true,
  render: () => {
    const l = chatList();
    return l.length ? l.map(([cid, c]) => `<button class="conv" data-act="openchat" data-cid="${esc(cid)}"><div class="ava">${esc(initials(c.other))}</div><div><b>${esc(c.other || "İstifadəçi")}</b><small>${esc(c.title || "")}</small><small style="color:#334155">${c.lastFrom === (S.user && S.user.uid) ? "Siz: " : ""}${esc(c.last || "")}</small></div><div class="t">${ago(c.ts)}${c.unread > 0 ? `<br><span class="unr">${c.unread}</span>` : ""}</div></button>`).join("") : emptyBox("chat", "Mesaj yoxdur", "Elan səhifəsində «Mesaj yaz» düyməsi ilə satıcıya yaza bilərsiniz.");
  }
};
A.openchat = b => openSub("chat", { cid: b.dataset.cid });
SUB.chat = {
  title: a => chatCtx(a).other, flush: true,
  render: a => {
    const c = chatCtx(a);
    return `<div class="lhead" data-act="open" data-id="${esc(c.listingId)}">${c.thumb ? `<img src="${c.thumb}" alt="">` : `<span class="ph">${ic("bike")}</span>`}<div><b>${esc(c.title || "Elan")}</b><small>Elana bax</small></div></div>
    <div class="chat" id="chat"><div class="msg a">Satıcı ilə yazışmağa başlayın. Şəxsi məlumatlarınızı və ödəniş detallarını diqqətlə paylaşın.</div></div>
    <form id="cf" class="cform"><input id="ci" maxlength="1000" placeholder="Mesajınızı yazın…" autocomplete="off"><button class="send" aria-label="Göndər">${ic("send")}</button></form>`;
  },
  mount: a => {
    const ctx0 = chatCtx(a), cid = a.cid, uid = S.user.uid, chat = $("#chat"); let off = null, attached = false;
    S.openChat = cid;
    const attach = () => {
      if (attached || !S.chats[cid]) return; attached = true;
      off = onValue(query(ref(db, `chats/${cid}/messages`), limitToLast(200)), snap => {
        const arr = []; snap.forEach(c => { arr.push(c.val()); });
        chat.innerHTML = '<div class="msg a">Satıcı ilə yazışmağa başlayın. Şəxsi məlumatlarınızı və ödəniş detallarını diqqətlə paylaşın.</div>' + msgsHtml(arr, uid);
        chat.scrollTop = chat.scrollHeight; markRead(cid);
      }, () => { attached = false; toast("Söhbət yüklənmədi."); });
    };
    S.chatAttach = attach; attach();
    S.subUn = () => { if (off) off(); S.chatAttach = null; S.openChat = null; };
    $("#cf").addEventListener("submit", async e => {
      e.preventDefault(); const inp = $("#ci"), text = inp.value.trim(); if (!text) return; inp.value = "";
      try { await sendChat(chatCtx(a), text); } catch (er) { toast(dbMsg(er)); inp.value = text; }
    });
  }
};

/* --- Bildirişlər --- */
SUB.notif = {
  title: "Bildirişlər", live: true,
  render: () => {
    const seen = SUB.notif.seen || (SUB.notif.seen = lsGet("xi_ann_seen")), n = unreadTotal();
    const l = Object.entries(S.anns).filter(([, a]) => annActive(a)).sort((a, b) => (b[1].createdAt || 0) - (a[1].createdAt || 0));
    const perm = "Notification" in window ? Notification.permission : "denied";
    return `${n ? `<button class="conv" data-act="chats"><span class="coin" style="background:var(--g)">${ic("chat")}</span><div><b>Oxunmamış mesajlar</b><small>${n} yeni mesaj</small></div>${ic("chev", "sm")}</button>` : ""}
    ${perm !== "granted" && "Notification" in window ? `<div class="info">Yeni mesajları dərhal bilmək üçün brauzer bildirişlərini aktiv edin.<br><br><button class="btn sm" data-act="askPerm">Bildirişləri aktiv et</button></div>` : ""}
    ${l.length ? l.map(([id, a]) => `<div class="nt ${esc(a.kind || "info")} ${seen.includes(id) ? "" : "new"}"><b>${esc(a.title)}</b><p>${esc(a.body)}</p><small>${ago(a.createdAt)}</small></div>`).join("") : emptyBox("bell", "Bildiriş yoxdur", "Yeniliklər və elanlar burada görünəcək.")}`;
  },
  mount: () => { const ids = Object.keys(S.anns); lsSet("xi_ann_seen", ids); refreshBell(); }
};

/* --- AV pulu --- */
SUB.wallet = {
  title: "AV pulu", live: true,
  render: () => {
    const tx = Object.values(S.tx).sort((a, b) => (b.ts || 0) - (a.ts || 0)).slice(0, 30);
    return `<div class="avcard" style="margin:0"><span class="coin">${ic("coin")}</span><div><small>AV balansı</small><b>${Number(S.wallet.balance || 0).toFixed(2)} AV</b></div></div>
    <form id="fp" class="form"><label>Promokod<input id="pc" placeholder="Kodu daxil edin" autocapitalize="characters" autocomplete="off" required></label><p class="err" id="pe"></p><button class="btn" id="pb">${ic("plus")} Balansı yüklə</button></form>
    <div class="info"><b>AV nədir?</b><br>AV — Alvero daxilindəki ayrıca pul balansıdır. Promokod və ya inzibatçı tərəfindən yüklənir. Elanı <b>${S.cfg.boostDays} gün</b> önə çıxarmaq üçün <b>${fmtAV(S.cfg.boostCost)}</b> xərclənir.</div>
    <div class="sec">Son əməliyyatlar</div>${tx.length ? tx.map(txRow).join("") : '<p class="meta">Hələ əməliyyat yoxdur.</p>'}`;
  },
  mount: () => { const f = $("#fp"); if (f) f.addEventListener("submit", redeemPromo); }
};

/* --- Profil redaktə / ayarlar / təhlükəsizlik / haqqında --- */
SUB.edit = {
  title: "Profili redaktə et", live: false,
  render: () => `<form id="fe" class="form"><label>Ad Soyad<input id="en" required value="${esc(S.profile.name || "")}"></label><label>Telefon<input id="ep" type="tel" required value="${esc(S.profile.phone || "")}"></label>
  <label>Şəhər<select id="ec">${CITIES.map(c => `<option ${(S.profile.city || "Alvero") === c ? "selected" : ""}>${esc(c)}</option>`).join("")}</select></label><label>E-poçt<input value="${esc(S.user.email)}" disabled></label><button class="btn">Yadda saxla</button></form>`,
  mount: () => $("#fe").addEventListener("submit", async e => {
    e.preventDefault(); const name = $("#en").value.trim(), phone = $("#ep").value.trim();
    if (name.length < 3 || phone.replace(/\D/g, "").length < 9) { toast("Ad və telefonu düzgün yazın."); return; }
    try { await update(ref(db, `users/${S.user.uid}`), { name, phone, city: $("#ec").value }); try { await updateProfile(auth.currentUser, { displayName: name }); } catch (x) { } toast("Profil yeniləndi."); backSub(); } catch (er) { toast(dbMsg(er)); }
  })
};
SUB.settings = {
  title: "Ayarlar", live: true,
  render: () => {
    const on = !(S.profile.settings && S.profile.settings.notify === false), perm = "Notification" in window ? Notification.permission : "yoxdur";
    return `<div class="menu" style="margin:0">${S.isAdmin ? `<a class="setrow" href="admin.html" style="text-decoration:none;color:inherit;font-weight:700">${ic("shield")}<span>Admin paneli</span>${ic("chev", "sm")}</a>` : ""}<button class="setrow" data-act="sub" data-n="edit">${ic("user")}<span>Profili redaktə et</span>${ic("chev", "sm")}</button>
    <button class="setrow" data-act="toggleNotify">${ic("bell")}<span>Mesaj bildirişləri</span><i class="sw ${on ? "on" : ""}"></i></button>
    <button class="setrow" data-act="askPerm">${ic("phone")}<span>Brauzer bildirişləri<br><small class="meta">${perm === "granted" ? "Aktivdir" : perm === "denied" ? "Bloklanıb (brauzer ayarlarından açın)" : "Aktiv etmək üçün toxunun"}</small></span>${ic("chev", "sm")}</button>
    <button class="setrow" data-act="sub" data-n="security">${ic("shield")}<span>Təhlükəsizlik</span>${ic("chev", "sm")}</button>
    <button class="setrow" data-act="sub" data-n="about">${ic("info")}<span>Tətbiq haqqında</span>${ic("chev", "sm")}</button>
    <button class="setrow" data-act="logout">${ic("logout")}<span>Hesabdan çıxış</span>${ic("chev", "sm")}</button></div>`;
  }
};
SUB.security = {
  title: "Təhlükəsizlik",
  render: () => `<div class="info">Hesab e-poçtu: <b>${esc(S.user.email)}</b></div><button class="btn ghost" data-act="resetPass">${ic("shield")} Şifrəni dəyiş (e-poçtla link)</button>
  <div class="info">Şifrənizi heç kimlə bölüşməyin. Alıcı ilə görüşərkən ictimai yeri seçin və məhsulu yoxlamadan ödəniş etməyin.</div><button class="btn red" data-act="logout">${ic("logout")} Hesabdan çıx</button>`
};
SUB.about = {
  title: "Tətbiq haqqında", live: true,
  render: () => `<div style="text-align:center;padding:10px"><img class="lg" style="width:auto;height:84px" src="logo-mark.png" alt="Alvero"><h2 style="margin:8px 0 2px">Alvero</h2><p class="meta">Versiya 3.0.0 · Alver</p></div>
  <div class="info">Alvero — velosiped və aksesuarların alqı-satqısı üçün yerli elan platformasıdır. Elan yerləşdirin, satıcı ilə birbaşa yazışın və AV pulu ilə elanlarınızı önə çıxarın.</div>
  ${installEv ? `<button class="btn" data-act="install">Ana ekrana əlavə et</button>` : '<div class="info">Brauzer menyusundan «Ana ekrana əlavə et» seçərək tətbiqi quraşdıra bilərsiniz.</div>'}
  <button class="btn ghost" data-act="sub" data-n="support">${ic("headset")} Dəstəyə yaz</button>`
};

/* --- Dəstək (admin ilə canlı söhbət) --- */
SUB.support = {
  title: "24/7 Dəstək", flush: true,
  render: () => `<div class="chat" id="chat"></div><form id="cf" class="cform"><input id="ci" maxlength="1000" placeholder="Mesajınızı yazın…" autocomplete="off"><button class="send" aria-label="Göndər">${ic("send")}</button></form>`,
  mount: prefill => {
    const uid = S.user.uid, chat = $("#chat"), input = $("#ci"), hello = '<div class="msg a">Salam! Sualınızı yazın, dəstək komandamız tezliklə cavab verəcək.</div>';
    if (typeof prefill === "string") input.value = prefill;
    chat.innerHTML = hello;
    const off = onValue(query(ref(db, `support/${uid}/messages`), limitToLast(200)), snap => {
      const arr = []; snap.forEach(c => { arr.push(c.val()); });
      const prevN = SUB.support.n; SUB.support.n = arr.length;
      if (prevN !== undefined && arr.length > prevN && arr[arr.length - 1].from === "admin") { try { navigator.vibrate && navigator.vibrate(120); } catch (e) { } }
      chat.innerHTML = hello + arr.map(m => `<div class="msg ${m.from === "admin" ? "a" : "u"}">${esc(m.text)}<small>${fmtT(m.ts)}</small></div>`).join("");
      chat.scrollTop = chat.scrollHeight;
    }, () => toast("Söhbət yüklənmədi."));
    S.subUn = off;
    $("#cf").addEventListener("submit", async e => {
      e.preventDefault(); const text = input.value.trim(); if (!text) return; input.value = "";
      try {
        await push(ref(db, `support/${uid}/messages`), { from: "user", text, ts: serverTimestamp() });
        await update(ref(db, `support/${uid}/meta`), { name: S.profile.name || S.user.displayName || "", email: S.user.email, phone: S.profile.phone || "", last: text.slice(0, 120), ts: serverTimestamp(), unreadAdmin: true });
      } catch (er) { toast(dbMsg(er)); input.value = text; }
    });
  }
};

/* ================= PWA ================= */
if ("serviceWorker" in navigator) window.addEventListener("load", () => navigator.serviceWorker.register("./service-worker.js").catch(() => { }));
