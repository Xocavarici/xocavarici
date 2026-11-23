import { auth, db } from "./firebase.js";
import { onAuthStateChanged, signInWithEmailAndPassword, createUserWithEmailAndPassword, updateProfile, signOut, sendPasswordResetEmail } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";
import { ref, onValue, set, update, push, remove, serverTimestamp, query, limitToLast, orderByChild, equalTo, runTransaction } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-database.js";

/* ---------- Köməkçilər ---------- */
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const ic = (n, c = "") => `<svg class="ic ${c}"><use href="#i-${n}"/></svg>`;
const pad = n => String(n).padStart(2, "0");
const fmtT = t => { if (!t) return ""; const d = new Date(t); return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`; };
const money = n => Number(n || 0).toFixed(2) + " ₼";
const now = () => Date.now() + (S.off || 0);
const ago = t => {
  if (!t) return "indicə";
  const s = Math.max(0, Math.floor((now() - t) / 1000));
  if (s < 60) return "indicə";
  const m = Math.floor(s / 60); if (m < 60) return m + " dəq əvvəl";
  const h = Math.floor(m / 60); if (h < 24) return h + " saat əvvəl";
  return Math.floor(h / 24) + " gün əvvəl";
};
const telHref = p => {
  let d = String(p || "").replace(/[^\d+]/g, ""); if (!d) return "";
  if (d[0] !== "+") { if (d.startsWith("994")) d = "+" + d; else if (d[0] === "0") d = "+994" + d.slice(1); }
  return "tel:" + d;
};
const callBtn = (p, label = "Zəng et") => telHref(p) ? `<a class="callbtn" href="${esc(telHref(p))}">${ic("phone")} ${label}</a>` : "";
const navUrl = p => `https://www.google.com/maps/dir/?api=1&destination=${Number(p && p.lat)},${Number(p && p.lon)}`;
let tt;
function toast(m) { const t = $("#toast"); t.textContent = m; t.classList.add("on"); clearTimeout(tt); tt = setTimeout(() => t.classList.remove("on"), 3000); }

const AUTH_ERR = {
  "auth/invalid-email": "E-poçt ünvanı düzgün deyil.",
  "auth/missing-password": "Şifrəni yazın.",
  "auth/invalid-credential": "E-poçt və ya şifrə yanlışdır.",
  "auth/wrong-password": "E-poçt və ya şifrə yanlışdır.",
  "auth/user-not-found": "Bu e-poçt ilə hesab tapılmadı.",
  "auth/email-already-in-use": "Bu e-poçt artıq qeydiyyatdan keçib.",
  "auth/weak-password": "Şifrə ən azı 6 simvol olmalıdır.",
  "auth/too-many-requests": "Çox sayda cəhd edildi. Bir az sonra yenidən yoxlayın.",
  "auth/network-request-failed": "İnternet bağlantısı yoxdur.",
  "auth/user-disabled": "Bu hesab deaktiv edilib."
};
const authMsg = e => AUTH_ERR[e && e.code] || "Xəta baş verdi. Yenidən cəhd edin.";
const dbMsg = e => (e && /permission/i.test(e.code + e.message)) ? "Bu əməliyyat üçün icazəniz yoxdur." : "Xəta baş verdi. İnternet bağlantısını yoxlayın.";

const PROMOS = {
  XOCAVAR10: "İlk səfərə 10% endirim",
  XOSGELDIN: "Xoş gəlmisiniz: 2 ₼ endirim",
  YENI2026: "Yeni il kampaniyası: 5% endirim"
};
const CLASSES = { econ: { n: "Ekonom", m: 1, d: "Sərfəli və rahat" }, comf: { n: "Komfort", m: 1.3, d: "Geniş və rahat avtomobil" }, biz: { n: "Biznes", m: 1.7, d: "Premium sinif" } };
const PAYS = { cash: "Nağd", bal: "Balans" };
const FRESH_MS = 30 * 60 * 1000; // 30 dəqiqədən köhnə açıq sifarişlər sürücü siyahısında göstərilmir

/* ---------- Vəziyyət ---------- */
const S = {
  user: null, profile: {}, orders: {}, app: null, dest: null, pos: null, cls: "econ", pay: "cash", otab: "active",
  unsubs: [], registering: false, sub: null, subUn: null, back: null, chatCtx: null, off: 0,
  live: {}, priv: {}, watched: new Set(), seen: {}, unread: {},
  dOpen: {}, dMine: {}, dPriv: {}, drvOn: false, dErr: false
};
let map, meMarker, accCircle, destMarker, mapReady = false, firstFix = false, watchId = null, installEv = null;
let drvUns = [], drvPriv = {};

function detach() {
  S.unsubs.forEach(u => { try { u(); } catch (e) { } }); S.unsubs = [];
  stopDriverFeed();
  S.watched = new Set(); S.live = {}; S.priv = {}; S.seen = {}; S.unread = {};
}
function listen(r, cb) { const u = onValue(r, cb, () => toast("Məlumat oxunarkən xəta baş verdi.")); S.unsubs.push(u); }

/* ---------- Giriş / qeydiyyat ---------- */
onAuthStateChanged(auth, u => {
  $("#boot").classList.add("hide");
  detach();
  if (!u) {
    S.user = null; S.profile = {}; S.orders = {}; S.app = null;
    closeSub(); closeModal(); stopGeo(); updatePill();
    $("#auth").classList.remove("hide"); $("#app").classList.add("hide");
    return;
  }
  S.user = u;
  $("#auth").classList.add("hide"); $("#app").classList.remove("hide");
  S.unsubs.push(onValue(ref(db, ".info/serverTimeOffset"), s => { S.off = s.val() || 0; }));
  listen(ref(db, `users/${u.uid}`), s => {
    if (!s.exists()) {
      if (!S.registering) set(ref(db, `users/${u.uid}`), { name: u.displayName || "", email: u.email || "", phone: "", balance: 0, createdAt: serverTimestamp() }).catch(() => { });
      return;
    }
    S.profile = s.val() || {};
    renderProfile(); renderFavs(); renderOrders(); refreshSub("promo"); refreshSub("settings");
  });
  listen(ref(db, `orders/${u.uid}`), s => { S.orders = s.val() || {}; renderOrders(); });
  listen(ref(db, `driver_applications/${u.uid}`), s => {
    const prev = S.app && S.app.status;
    S.app = s.exists() ? s.val() : null;
    syncDriverFeed(); renderProfile(); updatePill();
    if ((S.app && S.app.status) !== prev) refreshSub("driver");
  });
  requestAnimationFrame(() => { if (!mapReady) initMap(); else { map.invalidateSize(); startGeo(); } });
  renderProfile(); renderFavs(); renderOrders();
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
    await set(ref(db, `users/${c.user.uid}`), { name, phone, email, balance: 0, createdAt: serverTimestamp() });
  } catch (er) { $("#upErr").textContent = er && er.code ? authMsg(er) : dbMsg(er); }
  S.registering = false; b.disabled = false;
});

/* ---------- Naviqasiya ---------- */
function showTab(v) {
  closeSub();
  $$("#views > .view").forEach(x => x.classList.toggle("on", x.id === "v-" + v));
  $$("#nav button").forEach(b => b.classList.toggle("on", b.dataset.v === v));
  if (v === "home" && map) setTimeout(() => map.invalidateSize(), 50);
}

const A = {
  tab: b => showTab(b.dataset.v),
  authTab: b => {
    $$("#authTabs button").forEach(x => x.classList.toggle("on", x === b));
    $("#fIn").classList.toggle("hide", b.dataset.v !== "in"); $("#fUp").classList.toggle("hide", b.dataset.v !== "up");
  },
  forgot: async () => {
    const em = $("#inEmail").value.trim();
    if (!em) { $("#inErr").textContent = "Əvvəl e-poçt ünvanınızı yazın."; return; }
    try { await sendPasswordResetEmail(auth, em); toast("Şifrə bərpa linki e-poçtunuza göndərildi."); } catch (e) { $("#inErr").textContent = authMsg(e); }
  },
  locate: () => { if (S.pos && map) map.setView([S.pos.lat, S.pos.lon], 16); else { toast("Konum hələ müəyyən edilməyib."); startGeo(); } },
  geoRetry: () => { stopGeo(); firstFix = false; startGeo(); },
  clearDest: () => { clearDest(); },
  sheetToggle: () => setCompact(!$("#sheet").classList.contains("compact")),
  saveFav: async () => {
    if (!S.dest) return;
    try { await push(ref(db, `users/${S.user.uid}/favorites`), { name: S.dest.text, lat: S.dest.lat, lon: S.dest.lon }); toast("Sevimlilərə əlavə edildi."); } catch (e) { toast(dbMsg(e)); }
  },
  quick: b => {
    const k = b.dataset.k, a = S.profile[k];
    if (a) { setDest({ lat: a.lat, lon: a.lon, text: a.name }); toast((k === "home" ? "Ev" : "İş") + " ünvanı hədəf seçildi."); }
    else openPicker(k === "home" ? "Ev ünvanını seçin" : "İş ünvanını seçin", d => saveAddr(k, d));
  },
  taxi: () => openClassSheet(),
  trips: () => { S.otab = "history"; renderOrders(); showTab("orders"); },
  pay: () => openPaySheet(),
  order: () => openConfirm(),
  otab: b => { S.otab = b.dataset.v; renderOrders(); },
  cancelOrder: async b => {
    if (!(await ask("Sifarişi ləğv etmək istəyirsiniz?", "Bəli, ləğv et"))) return;
    const id = b.dataset.id, uid = S.user.uid;
    try {
      const l = S.live[id];
      if (l && (l.status === "open" || l.status === "accepted")) await update(ref(db, `live_orders/${id}`), { status: "cancelled", cancelledAt: serverTimestamp() });
      await update(ref(db, `orders/${uid}/${id}`), { status: "cancelled", cancelledAt: serverTimestamp() });
      toast("Sifariş ləğv edildi.");
    } catch (e) { toast(dbMsg(e)); }
  },
  sub: b => openSub(b.dataset.n),
  back: () => { const b = S.back; S.back = null; closeSub(); if (b) openSub(b); },
  goto: b => {
    const k = b.dataset.k; let a;
    if (k === "fav") a = (S.profile.favorites || {})[b.dataset.id]; else a = S.profile[k];
    if (!a) return;
    setDest({ lat: a.lat, lon: a.lon, text: a.name }); showTab("home");
  },
  delAddr: async b => {
    if (!(await ask("Bu ünvanı silmək istəyirsiniz?", "Sil"))) return;
    const k = b.dataset.k; const p = k === "fav" ? `users/${S.user.uid}/favorites/${b.dataset.id}` : `users/${S.user.uid}/${k}`;
    try { await remove(ref(db, p)); toast("Ünvan silindi."); } catch (e) { toast(dbMsg(e)); }
  },
  editAddr: b => { const k = b.dataset.k; openPicker(k === "home" ? "Ev ünvanını seçin" : "İş ünvanını seçin", d => saveAddr(k, d)); },
  addFav: () => openPicker("Yeni sevimli ünvan", async d => {
    try { await push(ref(db, `users/${S.user.uid}/favorites`), { name: d.text, lat: d.lat, lon: d.lon }); toast("Ünvan əlavə edildi."); } catch (e) { toast(dbMsg(e)); }
  }),
  logout: async () => { if (await ask("Hesabdan çıxmaq istəyirsiniz?", "Çıx")) { try { await signOut(auth); } catch (e) { toast("Xəta baş verdi."); } } },
  mclose: () => closeModal(),
  install: async () => { if (installEv) { installEv.prompt(); await installEv.userChoice; installEv = null; refreshSub("about"); } },
  topup: () => toast("Balans artırma tezliklə əlavə olunacaq."),
  resetPass: async () => {
    try { await sendPasswordResetEmail(auth, S.user.email); toast("Şifrə dəyişmə linki e-poçtunuza göndərildi."); } catch (e) { toast(authMsg(e)); }
  },
  toggleNotif: async () => {
    const v = !(S.profile.settings && S.profile.settings.notifications === false);
    try { await update(ref(db, `users/${S.user.uid}/settings`), { notifications: !v }); } catch (e) { toast(dbMsg(e)); }
  },
  supportRejected: () => openSub("support", "Salam! Şoför ərizəm rədd edilib. Zəhmət olmasa səbəbi izah edin və yenidən müraciət etmək üçün kömək edin."),
  chat: b => {
    const oid = b.dataset.oid, role = b.dataset.role; let name, phone;
    if (role === "customer") { const l = S.live[oid] || {}, pv = S.priv[oid] || {}; name = l.driverName || pv.driverName || "Sürücü"; phone = pv.driverPhone; }
    else { const pv = S.dPriv[oid] || {}, l = S.dMine[oid] || {}; name = pv.customerName || l.name || "Müştəri"; phone = pv.customerPhone; }
    S.unread[oid] = false;
    if (S.sub === "driverpanel") S.back = "driverpanel";
    openSub("ochat", { oid, role, name, phone });
  },
  accept: b => acceptOrder(b.dataset.oid),
  finish: async b => {
    if (!(await ask("Səfəri tamamladınız?", "Bəli, tamamla"))) return;
    try { await update(ref(db, `live_orders/${b.dataset.oid}`), { status: "completed", completedAt: serverTimestamp() }); toast("Səfər tamamlandı."); } catch (e) { toast(dbMsg(e)); }
  },
  release: async b => {
    if (!(await ask("Bu sifarişdən imtina etmək istəyirsiniz?", "Bəli, imtina et"))) return;
    const id = b.dataset.oid;
    try {
      await update(ref(db, `order_private/${id}`), { driverId: null, driverName: null, driverPhone: null });
      await update(ref(db, `live_orders/${id}`), { status: "open", driverId: null, driverName: null, car: null, acceptedAt: null });
      toast("Sifarişdən imtina etdiniz.");
    } catch (e) { toast(dbMsg(e)); }
  }
};
document.addEventListener("click", e => {
  const b = e.target.closest("[data-act]"); if (!b) return;
  const f = A[b.dataset.act]; if (f) f(b, e);
});
window.addEventListener("beforeinstallprompt", e => { e.preventDefault(); installEv = e; });

/* ---------- Modal ---------- */
function modal(html) { $("#msheet").innerHTML = html; $("#modal").classList.remove("hide"); return $("#msheet"); }
function closeModal() { $("#modal").classList.add("hide"); $("#msheet").innerHTML = ""; }
function ask(msg, okText = "Bəli") {
  return new Promise(res => {
    const m = modal(`<h3>${esc(msg)}</h3><button class="btn red" id="aok">${esc(okText)}</button><button class="btn ghost" id="ano">Xeyr</button>`);
    $("#aok", m).onclick = () => { closeModal(); res(true); };
    $("#ano", m).onclick = () => { closeModal(); res(false); };
  });
}

/* ---------- Xəritə / GPS ---------- */
function initMap() {
  mapReady = true;
  map = L.map("map", { zoomControl: false, attributionControl: true }).setView([40.4093, 49.8671], 14);
  map.attributionControl.setPrefix(false);
  L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19, attribution: "&copy; OpenStreetMap" }).addTo(map);
  map.on("click", e => setDestFromMap(e.latlng));
  if ("ResizeObserver" in window) new ResizeObserver(syncSheetH).observe($("#sheet"));
  syncSheetH();
  startGeo();
}
function syncSheetH() { if (map) map.invalidateSize(); $("#v-home").style.setProperty("--sheet-h", $("#sheet").offsetHeight + "px"); }
function geoBanner(msg) { const b = $("#geoBanner"); if (!msg) { b.classList.add("hide"); return; } $("#geoMsg").textContent = msg; b.classList.remove("hide"); }
function startGeo() {
  if (watchId !== null) return;
  if (!("geolocation" in navigator)) { geoBanner("Brauzeriniz konum xidmətini dəstəkləmir. Təxmini konum istifadə olunur."); ipLocate(); return; }
  watchId = navigator.geolocation.watchPosition(onPos, onGeoErr, { enableHighAccuracy: true, maximumAge: 0, timeout: 20000 });
}
function stopGeo() { if (watchId !== null) { navigator.geolocation.clearWatch(watchId); watchId = null; } }
function drawMe(lat, lon, acc) {
  if (!map) return;
  const ll = [lat, lon];
  if (!meMarker) {
    meMarker = L.marker(ll, { icon: L.divIcon({ className: "me", html: '<div class="me-dot"></div>', iconSize: [22, 22], iconAnchor: [11, 11] }), interactive: false, zIndexOffset: 1000 }).addTo(map);
    accCircle = L.circle(ll, { radius: acc, color: "#1a73e8", weight: 1, fillColor: "#1a73e8", fillOpacity: .15, interactive: false }).addTo(map);
  } else { meMarker.setLatLng(ll); accCircle.setLatLng(ll); accCircle.setRadius(acc); }
}
function onPos(p) {
  const c = p.coords;
  S.pos = { lat: c.latitude, lon: c.longitude, acc: c.accuracy || 50, src: "gps" };
  drawMe(S.pos.lat, S.pos.lon, S.pos.acc);
  geoBanner("");
  if (!firstFix) { firstFix = true; map.setView([S.pos.lat, S.pos.lon], 16); }
  if (S.dest) renderDestInfo();
}
function onGeoErr(e) {
  if (e.code === 1) {
    stopGeo();
    geoBanner("Konum icazəsi rədd edildi. Dəqiq mövqeyiniz üçün brauzer ayarlarında konuma icazə verin. Hələlik təxmini (IP) konum göstərilir.");
  } else if (e.code === 2) geoBanner("Konum müəyyən edilə bilmədi. GPS-i yandırın. Hələlik təxmini konum göstərilir.");
  else geoBanner("Dəqiq konum hələ tapılmadı. Açıq havada gözləyin və ya yenidən cəhd edin.");
  if (!S.pos || S.pos.src !== "gps") ipLocate();
}
async function ipLocate() {
  if (S.pos && S.pos.src === "gps") return;
  try {
    const r = await fetch("https://ipapi.co/json/"); const j = await r.json();
    if (j && j.latitude && (!S.pos || S.pos.src !== "gps")) {
      S.pos = { lat: j.latitude, lon: j.longitude, acc: 5000, src: "ip" };
      drawMe(S.pos.lat, S.pos.lon, S.pos.acc);
      if (!firstFix) map.setView([S.pos.lat, S.pos.lon], 12);
    }
  } catch (e) { /* IP konumu alına bilmədi */ }
}

/* ---------- Ünvan axtarışı ---------- */
async function geocode(q) {
  let u = `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=6&accept-language=az&q=${encodeURIComponent(q)}`;
  const c = S.pos || (map && { lat: map.getCenter().lat, lon: map.getCenter().lng });
  if (c) u += `&viewbox=${c.lon - .5},${c.lat + .5},${c.lon + .5},${c.lat - .5}&bounded=0`;
  const r = await fetch(u); if (!r.ok) throw new Error("geo");
  return (await r.json()).map(x => {
    const p = String(x.display_name || "").split(",").map(s => s.trim());
    return { lat: +x.lat, lon: +x.lon, text: p.slice(0, 3).join(", "), title: p[0], sub: p.slice(1, 4).join(", ") };
  });
}
async function revGeo(lat, lon) {
  try {
    const r = await fetch(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&accept-language=az&lat=${lat}&lon=${lon}`);
    const j = await r.json(); if (!j.display_name) return null;
    return String(j.display_name).split(",").map(s => s.trim()).slice(0, 3).join(", ");
  } catch (e) { return null; }
}
function bindSearch(input, list, onPick, onState) {
  let timer, seq = 0, items = [];
  input.addEventListener("input", () => {
    clearTimeout(timer);
    const q = input.value.trim();
    if (q.length < 3) { list.classList.add("hide"); list.innerHTML = ""; onState && onState(false); return; }
    timer = setTimeout(async () => {
      const my = ++seq;
      list.classList.remove("hide"); list.innerHTML = '<div class="note">Axtarılır…</div>'; onState && onState(true);
      try {
        items = await geocode(q); if (my !== seq) return;
        list.innerHTML = items.length ? items.map((x, i) => `<button class="ri" data-i="${i}"><b>${esc(x.title)}</b><small>${esc(x.sub)}</small></button>`).join("") : '<div class="note">Nəticə tapılmadı.</div>';
      } catch (e) { if (my === seq) list.innerHTML = '<div class="note">Axtarış zamanı xəta baş verdi. İnterneti yoxlayın.</div>'; }
    }, 500);
  });
  list.addEventListener("click", e => {
    const b = e.target.closest(".ri"); if (!b) return;
    const d = items[+b.dataset.i]; if (d) onPick(d);
  });
  input.addEventListener("keydown", e => { if (e.key === "Enter") e.preventDefault(); });
}
function openPicker(title, onPick) {
  const m = modal(`<h3>${esc(title)}</h3><div class="srch">${ic("search")}<input id="pk" placeholder="Ünvanı yazın" autocomplete="off"></div><div id="pkr" class="res hide"></div>
    ${S.dest ? '<button class="btn ghost" id="pkd">Seçilmiş hədəfdən istifadə et</button>' : ""}
    ${S.pos && S.pos.src === "gps" ? '<button class="btn ghost" id="pkc">Cari konumumdan istifadə et</button>' : ""}
    <button class="btn ghost" data-act="mclose">Bağla</button>`);
  const done = d => { closeModal(); onPick(d); };
  bindSearch($("#pk", m), $("#pkr", m), done);
  const d = $("#pkd", m); if (d) d.onclick = () => done({ lat: S.dest.lat, lon: S.dest.lon, text: S.dest.text });
  const c = $("#pkc", m); if (c) c.onclick = async () => { const t = (await revGeo(S.pos.lat, S.pos.lon)) || "Cari konumum"; done({ lat: S.pos.lat, lon: S.pos.lon, text: t }); };
  setTimeout(() => $("#pk", m) && $("#pk", m).focus(), 100);
}
async function saveAddr(k, d) {
  try { await set(ref(db, `users/${S.user.uid}/${k}`), { name: d.text, lat: d.lat, lon: d.lon }); toast((k === "home" ? "Ev" : "İş") + " ünvanı yadda saxlanıldı."); } catch (e) { toast(dbMsg(e)); }
}

/* ---------- Hədəf və alt panel ---------- */
function setCompact(on) { $("#sheet").classList.toggle("compact", on); setTimeout(syncSheetH, 60); }
(function sheetSwipe() {
  const h = $("#sheetHandle"); let y0 = null;
  h.addEventListener("touchstart", e => { y0 = e.touches[0].clientY; }, { passive: true });
  h.addEventListener("touchend", e => {
    if (y0 === null) return; const dy = e.changedTouches[0].clientY - y0; y0 = null;
    if (dy > 25) setCompact(true); else if (dy < -25) setCompact(false);
  });
})();
function setDest(d) {
  S.dest = d;
  const pinHtml = '<svg class="pinmk" viewBox="0 0 34 42"><path d="M17 41S3 27.5 3 16a14 14 0 0 1 28 0c0 11.5-14 25-14 25z" fill="#22b14c" stroke="#fff" stroke-width="2.5"/><circle cx="17" cy="16" r="5.5" fill="#fff"/></svg>';
  if (destMarker) destMarker.setLatLng([d.lat, d.lon]);
  else destMarker = L.marker([d.lat, d.lon], { icon: L.divIcon({ className: "me", html: pinHtml, iconSize: [0, 0] }), interactive: false }).addTo(map);
  renderDest();
  setCompact(true);
  setTimeout(() => map.panTo([d.lat, d.lon]), 120);
}
function renderDestInfo() {
  const d = S.dest; if (!d) return;
  const c = S.pos || (map && { lat: map.getCenter().lat, lon: map.getCenter().lng });
  let t = String(d.text).split(",")[0];
  if (c) { const km = distKm(c, d); t += ` · ~${km.toFixed(1)} km · ~${money(priceFor(km, S.cls))}`; }
  $("#destTxt").textContent = t;
}
function renderDest() {
  const d = S.dest;
  $("#destRow").classList.toggle("hide", !d); $("#qx").classList.toggle("hide", !d);
  if (d) { renderDestInfo(); $("#q").value = d.text; }
  $("#qr").classList.add("hide"); $("#qr").innerHTML = ""; $("#sheet").classList.remove("searching");
}
function clearDest() {
  S.dest = null; if (destMarker) { map.removeLayer(destMarker); destMarker = null; }
  $("#q").value = ""; renderDest(); setCompact(false);
}
async function setDestFromMap(ll) {
  setDest({ lat: ll.lat, lon: ll.lng, text: "Xəritədən seçilmiş nöqtə" });
  const t = await revGeo(ll.lat, ll.lng);
  if (t && S.dest && S.dest.lat === ll.lat) { S.dest.text = t; renderDest(); }
}
bindSearch($("#q"), $("#qr"), d => setDest(d), on => $("#sheet").classList.toggle("searching", on));
$("#q").addEventListener("input", () => { if (!$("#q").value.trim()) $("#sheet").classList.remove("searching"); });
$("#q").addEventListener("focus", () => { if ($("#sheet").classList.contains("compact") && !S.dest) setCompact(false); });

/* ---------- Sifariş ---------- */
const rad = x => x * Math.PI / 180;
function distKm(a, b) {
  const R = 6371, dLa = rad(b.lat - a.lat), dLo = rad(b.lon - a.lon);
  const h = Math.sin(dLa / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLo / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}
const priceFor = (km, cls) => Math.max(2.5, (1.2 + 0.55 * km) * CLASSES[cls].m);

function openClassSheet() {
  const m = modal(`<h3>Taksi növü</h3>${Object.entries(CLASSES).map(([k, v]) => `<button class="opt ${S.cls === k ? "on" : ""}" data-k="${k}">${ic("car")}<div><b>${v.n}</b><small>${v.d}</small></div>${S.cls === k ? ic("check") : ""}</button>`).join("")}<button class="btn ghost" data-act="mclose">Bağla</button>`);
  $$(".opt", m).forEach(b => b.onclick = () => { S.cls = b.dataset.k; closeModal(); renderDestInfo(); toast("Seçildi: " + CLASSES[S.cls].n); });
}
function openPaySheet() {
  const m = modal(`<h3>Ödəniş üsulu</h3>${Object.entries(PAYS).map(([k, v]) => `<button class="opt ${S.pay === k ? "on" : ""}" data-k="${k}">${ic(k === "cash" ? "card" : "wallet")}<div><b>${v}</b><small>${k === "bal" ? "Balans: " + money(S.profile.balance) : "Səfərin sonunda sürücüyə"}</small></div>${S.pay === k ? ic("check") : ""}</button>`).join("")}<button class="btn ghost" data-act="mclose">Bağla</button>`);
  $$(".opt", m).forEach(b => b.onclick = () => { S.pay = b.dataset.k; closeModal(); toast("Ödəniş: " + PAYS[S.pay]); });
}
function openConfirm() {
  if (!S.dest) { toast("Əvvəlcə gedəcəyiniz ünvanı seçin."); setCompact(false); $("#q").focus(); return; }
  if (Object.values(S.orders).some(o => ["active", "accepted"].includes(o.status))) { toast("Artıq aktiv sifarişiniz var."); S.otab = "active"; renderOrders(); showTab("orders"); return; }
  const c = S.pos || { lat: map.getCenter().lat, lon: map.getCenter().lng };
  const km = distKm(c, S.dest), price = priceFor(km, S.cls);
  const m = modal(`<h3>Sifarişi təsdiqlə</h3>
    <div class="kv"><span>Haradan</span><b>${S.pos ? "Cari konumum" : "Xəritə mərkəzi"}</b></div>
    <div class="kv"><span>Hara</span><b>${esc(S.dest.text)}</b></div>
    <div class="kv"><span>Məsafə</span><b>~${km.toFixed(1)} km</b></div>
    <div class="kv"><span>Taksi növü</span><b>${CLASSES[S.cls].n}</b></div>
    <div class="kv"><span>Ödəniş</span><b>${PAYS[S.pay]}</b></div>
    <div class="kv"><span>Təxmini qiymət</span><b>${money(price)}</b></div>
    <button class="btn" id="cok">Sifarişi təsdiqlə</button><button class="btn ghost" data-act="mclose">Ləğv et</button>`);
  $("#cok", m).onclick = () => placeOrder(c, km, price, $("#cok", m));
}
async function placeOrder(c, km, price, btn) {
  btn.disabled = true;
  const uid = S.user.uid, id = push(ref(db, `orders/${uid}`)).key;
  const from = { lat: c.lat, lon: c.lon, text: S.pos ? "Cari konumum" : "Xəritədə seçilmiş nöqtə" };
  const to = { lat: S.dest.lat, lon: S.dest.lon, text: S.dest.text };
  const base = { cls: S.cls, pay: S.pay, km: +km.toFixed(2), price: +price.toFixed(2) };
  const name = S.profile.name || S.user.displayName || "", phone = S.profile.phone || "";
  let shared = true;
  try {
    await set(ref(db, `live_orders/${id}`), { uid, name: name.split(" ")[0] || "Müştəri", status: "open", from, to, ...base, createdAt: serverTimestamp() });
    await set(ref(db, `order_private/${id}`), { uid, customerName: name, customerPhone: phone, createdAt: serverTimestamp() });
  } catch (e) {
    shared = false; console.warn("live order yazılmadı:", e);
    try { await remove(ref(db, `live_orders/${id}`)); } catch (x) { }
  }
  try {
    await set(ref(db, `orders/${uid}/${id}`), { status: "active", uid, name, phone, from, to, ...base, createdAt: serverTimestamp() });
  } catch (e) { btn.disabled = false; toast(dbMsg(e)); return; }
  closeModal();
  toast(shared ? "Sifarişiniz sürücülərə göndərildi." : "Sifariş yadda saxlanıldı, amma sürücülərə göndərilə bilmədi.");
  S.otab = "active"; renderOrders(); showTab("orders");
}

/* Sifarişi izləmə (müştəri tərəfi) */
function effStatus(o) { const l = S.live[o.id]; if (l) return l.status === "open" ? "active" : l.status; return o.status; }
function notifyChat(oid, chat, role) {
  const n = chat.length, prev = S.seen[oid]; S.seen[oid] = n;
  if (prev === undefined || n <= prev) return;
  const last = chat[n - 1];
  if (last && last.from !== role && !(S.sub === "ochat" && S.chatCtx && S.chatCtx.oid === oid)) {
    S.unread[oid] = true; toast("Yeni mesaj: " + String(last.text).slice(0, 60));
    try { navigator.vibrate && navigator.vibrate(150); } catch (e) { }
  }
}
const chatArr = v => v && v.chat ? Object.values(v.chat).sort((a, b) => (a.ts || 0) - (b.ts || 0)) : [];
function watchOrder(oid) {
  if (S.watched.has(oid)) return; S.watched.add(oid);
  S.unsubs.push(onValue(ref(db, `live_orders/${oid}`), s => {
    const prev = S.live[oid] && S.live[oid].status;
    const l = s.exists() ? s.val() : null; S.live[oid] = l;
    if (l && prev === "open" && l.status === "accepted") toast("Sürücü sifarişinizi qəbul etdi.");
    if (l && (l.status === "completed" || l.status === "cancelled") && S.orders[oid] && S.orders[oid].status !== l.status)
      update(ref(db, `orders/${S.user.uid}/${oid}`), { status: l.status }).catch(() => { });
    renderOrders();
  }, () => { S.live[oid] = null; }));
  S.unsubs.push(onValue(ref(db, `order_private/${oid}`), s => {
    const v = s.exists() ? s.val() : null; S.priv[oid] = v;
    notifyChat(oid, chatArr(v), "customer"); renderOrders();
  }, () => { }));
}

/* ---------- Render: sifarişlər ---------- */
const CAR_ILLU = `<svg viewBox="0 0 300 190" xmlns="http://www.w3.org/2000/svg"><g fill="#e8eefb"><rect x="30" y="100" width="46" height="70" rx="4"/><rect x="92" y="62" width="30" height="108"/><rect x="195" y="78" width="40" height="92"/><rect x="238" y="56" width="30" height="114"/><ellipse cx="60" cy="150" rx="55" ry="22"/><ellipse cx="240" cy="150" rx="55" ry="22"/></g><path d="M150 6c-14 0-24 10-24 23 0 17 24 38 24 38s24-21 24-38c0-13-10-23-24-23z" fill="#a8e0b9"/><circle cx="150" cy="29" r="8" fill="#fff"/><ellipse cx="150" cy="172" rx="100" ry="5" fill="#dde6f5"/><path d="M62 150c0-14 8-22 22-27l24-14c8-5 17-7 26-7h38c11 0 20 4 28 12l14 15c16 3 26 9 26 21v8H62z" fill="#22b14c"/><path d="M104 118l16-9c6-3 12-5 19-5h20l-4 22h-51z M165 104h12c7 0 13 3 18 8l9 10h-39z" fill="#14532d" opacity=".85"/><circle cx="104" cy="158" r="17" fill="#1f2937"/><circle cx="104" cy="158" r="8" fill="#9ca3af"/><circle cx="208" cy="158" r="17" fill="#1f2937"/><circle cx="208" cy="158" r="8" fill="#9ca3af"/></svg>`;
const ST_MAP = { active: ["p", "Sürücü axtarılır"], accepted: ["", "Sürücü yolda"], completed: ["d", "Tamamlandı"], cancelled: ["c", "Ləğv edildi"] };
function orderCard(o) {
  const es = effStatus(o), pv = S.priv[o.id], st = ST_MAP[es] || ["", es];
  let drv = "";
  if (es === "accepted") {
    const l = S.live[o.id] || {}, nm = l.driverName || (pv && pv.driverName) || "Sürücü";
    drv = `<div class="drv"><div><b>${esc(nm)}</b><small>${esc(l.car || "")}</small></div><div class="acts">${pv && pv.driverPhone ? callBtn(pv.driverPhone) : '<span class="meta">Nömrə yüklənir…</span>'}<button class="callbtn alt" data-act="chat" data-oid="${esc(o.id)}" data-role="customer">${ic("chat")} Mesaj${S.unread[o.id] ? '<i class="dotb"></i>' : ""}</button></div></div>`;
  }
  const live = es === "active" || es === "accepted";
  return `<div class="card"><div class="row"><span class="meta">${fmtT(o.createdAt)}</span><span class="st ${st[0]}">${st[1]}</span></div>
    <div class="route"><div><i></i><span>${esc(o.from && o.from.text)}</span></div><div><i class="t"></i><span>${esc(o.to && o.to.text)}</span></div></div>
    <div class="row"><span class="meta">${esc((CLASSES[o.cls] || {}).n || "")} · ${esc(PAYS[o.pay] || "")} · ${o.km || 0} km</span><span class="price">${money(o.price)}</span></div>
    ${drv}${live ? `<button class="btn red" style="margin-top:12px" data-act="cancelOrder" data-id="${esc(o.id)}">Sifarişi ləğv et</button>` : ""}</div>`;
}
function renderOrders() {
  const el = $("#ordBody"); if (!el) return;
  $$("#otabs button").forEach(b => b.classList.toggle("on", b.dataset.v === S.otab));
  const list = Object.entries(S.orders).map(([id, o]) => ({ id, ...o })).sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  list.forEach(o => { if (o.status === "active" && S.user) watchOrder(o.id); });
  if (S.otab === "active") {
    const a = list.filter(o => ["active", "accepted"].includes(effStatus(o)));
    el.innerHTML = a.length ? a.map(orderCard).join("") :
      `<div class="empty">${CAR_ILLU}<h3>Hazırda aktiv sifariş yoxdur</h3><p>Sifariş etmək üçün aşağıdakı düyməni basın</p><button class="btn" data-act="tab" data-v="home">${ic("car")} Sifariş et</button></div>`;
  } else if (S.otab === "history") {
    const h = list.filter(o => !["active", "accepted"].includes(effStatus(o)));
    el.innerHTML = h.length ? h.map(orderCard).join("") :
      `<div class="empty">${CAR_ILLU}<h3>Səfər tarixçəsi boşdur</h3><p>Tamamlanmış və ləğv edilmiş səfərləriniz burada görünəcək</p></div>`;
  } else el.innerHTML = favHtml();
}

/* ---------- Render: sevimlilər ---------- */
function addrRow(k, label, icon) {
  const a = S.profile[k];
  if (!a) return `<div class="addr"><button class="main" data-act="editAddr" data-k="${k}">${ic(icon)}<div><b>${label}</b><small>Ünvan əlavə et</small></div></button><span class="iconbtn">${ic("plus")}</span></div>`;
  return `<div class="addr"><button class="main" data-act="goto" data-k="${k}">${ic(icon)}<div><b>${label}</b><small>${esc(a.name)}</small></div></button>
    <button class="iconbtn" data-act="editAddr" data-k="${k}" aria-label="Dəyiş">${ic("edit")}</button><button class="iconbtn" data-act="delAddr" data-k="${k}" aria-label="Sil">${ic("trash")}</button></div>`;
}
function favHtml() {
  const f = Object.entries(S.profile.favorites || {});
  return `${addrRow("home", "Ev", "home")}${addrRow("work", "İş", "briefcase")}<div class="sec">Sevimli ünvanlar</div>
    ${f.length ? f.map(([id, a]) => `<div class="addr"><button class="main" data-act="goto" data-k="fav" data-id="${esc(id)}">${ic("star")}<div><b>${esc(String(a.name).split(",")[0])}</b><small>${esc(a.name)}</small></div></button><button class="iconbtn" data-act="delAddr" data-k="fav" data-id="${esc(id)}" aria-label="Sil">${ic("trash")}</button></div>`).join("") : '<p class="meta" style="padding:4px 2px">Hələ sevimli ünvanınız yoxdur.</p>'}
    <button class="btn ghost" style="margin-top:8px" data-act="addFav">${ic("plus")} Yeni ünvan əlavə et</button>`;
}
function renderFavs() { const el = $("#favBody"); if (el) el.innerHTML = favHtml(); if (S.otab === "favs") renderOrders(); }

/* ---------- Render: profil ---------- */
const isDriver = () => !!(S.app && S.app.status === "approved");
function appTag() {
  const a = S.app; if (!a) return "";
  if (a.status === "approved") { const n = openList().length; return `<span class="tag st">${n ? n + " yeni" : "Aktiv"}</span>`; }
  const m = { pending: ['p', "Yoxlanılır"], rejected: ["c", "Rədd edildi"] }[a.status];
  return m ? `<span class="tag st ${m[0]}">${m[1]}</span>` : "";
}
function row(icon, label, act, extra = "", v = "") { return `<button class="mrow" data-act="${act[0]}" ${act[1] ? `data-n="${act[1]}"` : ""} ${v ? `data-v="${v}"` : ""}>${ic(icon)}<span>${label}</span>${extra}${ic("chev", "sm")}</button>`; }
function renderProfile() {
  const el = $("#profBody"); if (!el) return;
  const p = S.profile, u = S.user || {};
  el.innerHTML = `<button class="phead" data-act="sub" data-n="edit"><div class="ava"><svg viewBox="0 0 24 24"><circle cx="12" cy="8" r="4.5"/><path d="M3 24c0-6 4-9 9-9s9 3 9 9z"/></svg></div>
    <div class="pinfo"><h2>${esc(p.name || u.displayName || "İstifadəçi")}</h2><p>${esc(p.phone || u.email || "")}</p><span class="badge">${ic("shield")}Təsdiqlənmiş hesab</span></div>${ic("chev", "sm")}</button>
    <div class="bal">${ic("wallet", "w")}<div><small>Balans</small><b>${Number(p.balance || 0).toFixed(2)} ₼</b></div><button class="btn" data-act="topup">${ic("plus")} Yüklə</button></div>
    <div class="menu">
      ${row("car", "Səfər tarixçəsi", ["trips"])}${row("star", "Sevimli ünvanlar", ["tab"], "", "favs")}
      ${row("tag", "Promokodlar", ["sub", "promo"])}${isDriver() ? row("wheel", "Şoför paneli", ["sub", "driverpanel"], appTag()) : row("wheel", "Şoför ol", ["sub", "driver"], appTag())}
      ${row("help", "Dəstək və yardım", ["sub", "support"])}${row("info", "Tətbiq haqqında", ["sub", "about"])}
      ${row("shield", "Təhlükəsizlik", ["sub", "security"])}${row("logout", "Hesabdan çıxış", ["logout"])}
    </div>
    <button class="supcard" data-act="sub" data-n="support">${ic("headset")}<div><b>24/7 Dəstək</b><small>Hər zaman sizin üçün</small></div>${ic("chev", "sm")}</button>`;
}

/* ---------- Alt səhifələr ---------- */
const SUB = {
  edit: {
    title: "Profili redaktə et",
    render: () => `<form id="fe" class="form"><label>Ad Soyad<input id="en" required value="${esc(S.profile.name || "")}"></label><label>Telefon<input id="ep" type="tel" required value="${esc(S.profile.phone || "")}"></label><label>E-poçt<input value="${esc(S.user.email)}" disabled></label><button class="btn" style="font-size:18px">Yadda saxla</button></form>`,
    mount: () => $("#fe").addEventListener("submit", async e => {
      e.preventDefault(); const name = $("#en").value.trim(), phone = $("#ep").value.trim();
      if (name.length < 3 || phone.replace(/\D/g, "").length < 9) { toast("Ad və telefonu düzgün yazın."); return; }
      try { await update(ref(db, `users/${S.user.uid}`), { name, phone }); try { await updateProfile(auth.currentUser, { displayName: name }); } catch (x) { } toast("Profil yeniləndi."); closeSub(); } catch (er) { toast(dbMsg(er)); }
    })
  },
  settings: {
    title: "Ayarlar",
    render: () => {
      const on = !(S.profile.settings && S.profile.settings.notifications === false);
      return `<div class="menu">
      <button class="setrow" data-act="sub" data-n="edit">${ic("user")}<span>Profili redaktə et</span>${ic("chev", "sm")}</button>
      <button class="setrow" data-act="toggleNotif">${ic("info")}<span>Bildirişlər</span><i class="sw ${on ? "on" : ""}"></i></button>
      <button class="setrow" data-act="sub" data-n="security">${ic("shield")}<span>Təhlükəsizlik</span>${ic("chev", "sm")}</button>
      <button class="setrow" data-act="sub" data-n="about">${ic("info")}<span>Tətbiq haqqında</span>${ic("chev", "sm")}</button>
      <button class="setrow" data-act="logout">${ic("logout")}<span>Hesabdan çıxış</span>${ic("chev", "sm")}</button></div>`;
    }
  },
  security: {
    title: "Təhlükəsizlik",
    render: () => `<div class="info">Hesab e-poçtu: <b>${esc(S.user.email)}</b></div>
      <button class="btn ghost" data-act="resetPass">${ic("shield")} Şifrəni dəyiş (e-poçtla link)</button>
      <div class="info">Şifrəni dəyişmək üçün e-poçtunuza təhlükəsiz link göndərilir. Şifrənizi heç kimlə bölüşməyin.</div>
      <button class="btn red" data-act="logout">${ic("logout")} Hesabdan çıx</button>`
  },
  about: {
    title: "Tətbiq haqqında",
    render: () => `<div style="text-align:center;padding:10px"><svg class="lg" style="width:80px;height:70px"><use href="#i-logo"/></svg><h2 style="margin:8px 0 2px">Xocavar İçi</h2><p class="meta">Versiya 2.0.0</p></div>
      <div class="info">Xocavar İçi — şəhər daxilində rahat və təhlükəsiz taksi sifarişi tətbiqidir. Sifariş verin, ünvanlarınızı yadda saxlayın, sürücü ilə əlaqə saxlayın və dəstək komandası ilə 24/7 yazışın.</div>
      ${installEv ? `<button class="btn" style="font-size:18px" data-act="install">Ana ekrana əlavə et</button>` : '<div class="info">Brauzer menyusundan «Ana ekrana əlavə et» seçərək tətbiqi quraşdıra bilərsiniz.</div>'}
      <button class="btn ghost" data-act="sub" data-n="support">${ic("headset")} Dəstəyə yaz</button>`
  },
  promo: {
    title: "Promokodlar",
    render: () => {
      const l = Object.values(S.profile.promos || {});
      return `<form id="fp" class="form"><label>Promokod<input id="pc" placeholder="Kodu daxil edin" autocapitalize="characters" required></label><button class="btn" style="font-size:18px">Aktivləşdir</button></form>
      <div class="sec">Aktiv promokodlarım</div>${l.length ? l.map(p => `<div class="card"><div class="row"><b>${esc(p.code)}</b><span class="st">Aktiv</span></div><p class="meta" style="margin:6px 0 0">${esc(p.desc || "")}</p></div>`).join("") : '<p class="meta">Hələ promokodunuz yoxdur.</p>'}`;
    },
    mount: () => $("#fp").addEventListener("submit", async e => {
      e.preventDefault(); const code = $("#pc").value.trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
      if (!PROMOS[code]) { toast("Promokod düzgün deyil."); return; }
      if ((S.profile.promos || {})[code]) { toast("Bu promokod artıq aktivdir."); return; }
      try { await set(ref(db, `users/${S.user.uid}/promos/${code}`), { code, desc: PROMOS[code], ts: serverTimestamp() }); toast("Promokod aktivləşdirildi."); $("#pc").value = ""; } catch (er) { toast(dbMsg(er)); }
    })
  },
  driver: { title: "Şoför ol", render: driverHtml, mount: driverMount },
  driverpanel: { title: "Şoför paneli", render: () => '<div id="dpBody"></div>', mount: driverPanelMount },
  support: { title: "24/7 Dəstək", chat: true, render: () => `<div class="chat" id="chat"></div><form id="cf" class="cform"><input id="ci" maxlength="1000" placeholder="Mesajınızı yazın…" autocomplete="off"><button class="send" aria-label="Göndər">${ic("send")}</button></form>`, mount: supportMount },
  ochat: {
    title: "Mesajlar", chat: true,
    render: c => `<div class="callbar"><div><b>${esc(c.name)}</b><small>${esc(c.phone || "")}</small></div>${callBtn(c.phone)}</div><div class="chat" id="chat"></div><form id="cf" class="cform"><input id="ci" maxlength="500" placeholder="Mesajınızı yazın…" autocomplete="off"><button class="send" aria-label="Göndər">${ic("send")}</button></form>`,
    mount: ochatMount
  }
};
function openSub(name, arg) {
  closeSubCleanup();
  const s = SUB[name]; if (!s) return;
  if (name !== "ochat") S.back = null;
  S.sub = name;
  $("#subTitle").textContent = s.title;
  const b = $("#subBody"); b.className = "subbody" + (s.chat ? " chatpage" : ""); b.innerHTML = s.render(arg);
  $("#sub").classList.add("on");
  if (s.mount) s.mount(arg);
}
function refreshSub(name) {
  if (S.sub !== name || ["support", "ochat", "driverpanel"].includes(name)) return;
  const s = SUB[name]; $("#subBody").innerHTML = s.render(); if (s.mount) s.mount();
}
function closeSubCleanup() { if (S.subUn) { try { S.subUn(); } catch (e) { } S.subUn = null; } S.chatCtx = null; }
function closeSub() { closeSubCleanup(); S.sub = null; $("#sub").classList.remove("on"); }

/* ---------- Şoför ol ---------- */
function driverHtml() {
  const a = S.app;
  if (a && a.status === "pending") return `<div class="info wait"><b>Ərizəniz yoxlanılır</b><br>Ərizəniz qəbul edildi və yoxlanılır. Nəticə burada göstəriləcək.</div>${summary(a)}`;
  if (a && a.status === "approved") return `<div class="info ok"><b>Qəbul edildi 🎉</b><br>Ərizəniz təsdiqləndi. İndi aktiv sifarişləri görə bilərsiniz.</div><button class="btn" style="font-size:18px" data-act="sub" data-n="driverpanel">${ic("wheel")} Şoför panelinə keç</button>${summary(a)}`;
  if (a && a.status === "rejected") return `<div class="info bad"><b>Rədd edildi</b><br>${a.reason ? "Səbəb: " + esc(a.reason) : "Səbəb göstərilməyib."}</div>
    <div class="info">Dəstək ilə əlaqə saxlayın. Rədd edilmiş ərizə ilə yenidən müraciət etmək üçün dəstək komandası sizə kömək edəcək.</div>
    <button class="btn" style="font-size:18px" data-act="supportRejected">${ic("headset")} Dəstək ilə əlaqə saxlayın</button>${summary(a)}`;
  return `<div class="info">Sürücü olmaq üçün məlumatlarınızı doldurun. Ərizə yoxlanıldıqdan sonra nəticə burada göstəriləcək.</div>
  <form id="fd" class="form">
    <label>Ad Soyad<input id="d_name" required value="${esc(S.profile.name || "")}"></label>
    <label>Telefon<input id="d_phone" type="tel" required value="${esc(S.profile.phone || "")}"></label>
    <label>Şəhər / rayon<input id="d_city" required></label>
    <div class="grid2"><label>Marka<input id="d_make" required></label><label>Model<input id="d_model" required></label></div>
    <div class="grid2"><label>İl<input id="d_year" type="number" inputmode="numeric" min="1990" max="2027" required></label><label>Rəng<input id="d_color" required></label></div>
    <label>Dövlət nömrə nişanı<input id="d_plate" required placeholder="10-AA-123" autocapitalize="characters"></label>
    <label>Sürücülük vəsiqəsi nömrəsi<input id="d_lic" required></label>
    <p class="err" id="d_err"></p><button class="btn" id="d_btn" style="font-size:18px">Ərizə göndər</button></form>`;
}
function summary(a) {
  return `<div class="card"><div class="kv"><span>Ad Soyad</span><b>${esc(a.fullName)}</b></div><div class="kv"><span>Şəhər</span><b>${esc(a.city)}</b></div><div class="kv"><span>Avtomobil</span><b>${esc(a.make)} ${esc(a.model)}, ${esc(a.year)}</b></div><div class="kv"><span>Nömrə</span><b>${esc(a.plate)}</b></div></div>`;
}
function driverMount() {
  const f = $("#fd"); if (!f) return;
  f.addEventListener("submit", async e => {
    e.preventDefault(); const err = $("#d_err"), btn = $("#d_btn"); err.textContent = "";
    const g = id => $("#" + id).value.trim();
    const year = parseInt(g("d_year"), 10);
    if (g("d_name").length < 3) { err.textContent = "Ad və soyadı tam yazın."; return; }
    if (g("d_phone").replace(/\D/g, "").length < 9) { err.textContent = "Telefon nömrəsi düzgün deyil."; return; }
    if (!(year >= 1990 && year <= 2027)) { err.textContent = "Avtomobilin ilini düzgün yazın (1990–2027)."; return; }
    btn.disabled = true;
    try {
      await set(ref(db, `driver_applications/${S.user.uid}`), {
        uid: S.user.uid, email: S.user.email, fullName: g("d_name"), phone: g("d_phone"), city: g("d_city"),
        make: g("d_make"), model: g("d_model"), year, color: g("d_color"), plate: g("d_plate").toUpperCase(), license: g("d_lic"),
        status: "pending", createdAt: serverTimestamp()
      });
      toast("Ərizəniz göndərildi.");
    } catch (er) {
      btn.disabled = false;
      err.textContent = /permission/i.test(er.code + er.message) ? "Ərizə göndərilə bilmədi. Əvvəl müraciət etmisiniz — dəstək ilə əlaqə saxlayın." : "Xəta baş verdi. Yenidən cəhd edin.";
    }
  });
}

/* ---------- Şoför paneli (canlı sifarişlər) ---------- */
const openList = () => Object.entries(S.dOpen)
  .filter(([, o]) => !o.createdAt || now() - o.createdAt < FRESH_MS)
  .sort((a, b) => (b[1].createdAt || now()) - (a[1].createdAt || now()));
function updatePill() {
  const p = $("#drvPill"); if (!p) return;
  const ok = !!S.user && isDriver(); p.classList.toggle("hide", !ok);
  if (ok) { const n = openList().length; $("#drvCnt").textContent = n; $("#drvCnt").classList.toggle("hide", !n); }
}
function syncDriverFeed() { if (S.user && isDriver()) startDriverFeed(); else stopDriverFeed(); }
function stopDriverFeed() {
  drvUns.forEach(u => { try { u(); } catch (e) { } }); drvUns = [];
  Object.values(drvPriv).forEach(u => { try { u(); } catch (e) { } }); drvPriv = {};
  S.dOpen = {}; S.dMine = {}; S.dPriv = {}; S.drvOn = false; S.dErr = false;
}
function watchPrivDriver(id, tries = 0) {
  return onValue(ref(db, `order_private/${id}`), ps => {
    const v = ps.val(); S.dPriv[id] = v;
    notifyChat(id, chatArr(v), "driver"); renderDriverPanel();
  }, () => {
    delete drvPriv[id];
    if (tries < 6) setTimeout(() => { if (S.dMine[id] && !drvPriv[id]) drvPriv[id] = watchPrivDriver(id, tries + 1); }, 1500);
  });
}
function startDriverFeed() {
  if (S.drvOn) return; S.drvOn = true; S.dErr = false;
  const uid = S.user.uid; let first = true;
  drvUns.push(onValue(query(ref(db, "live_orders"), orderByChild("status"), equalTo("open")), s => {
    const v = s.val() || {}, next = {};
    Object.entries(v).forEach(([id, o]) => { if (o.uid !== uid) next[id] = o; });
    if (!first) Object.keys(next).forEach(id => {
      if (!S.dOpen[id]) { toast("Yeni sifariş: " + ((next[id].from && next[id].from.text) || "")); try { navigator.vibrate && navigator.vibrate(200); } catch (e) { } }
    });
    first = false; S.dErr = false; S.dOpen = next; updatePill(); renderDriverPanel(); renderProfile();
  }, e => { console.warn(e); S.dErr = true; renderDriverPanel(); }));
  drvUns.push(onValue(query(ref(db, "live_orders"), orderByChild("driverId"), equalTo(uid)), s => {
    const v = s.val() || {}; S.dMine = {};
    Object.entries(v).forEach(([id, o]) => { if (o.status === "accepted") S.dMine[id] = o; });
    Object.keys(S.dMine).forEach(id => { if (!drvPriv[id]) drvPriv[id] = watchPrivDriver(id); });
    Object.keys(drvPriv).forEach(id => { if (!S.dMine[id]) { try { drvPriv[id](); } catch (e) { } delete drvPriv[id]; delete S.dPriv[id]; } });
    renderDriverPanel();
  }, e => console.warn(e)));
}
async function acceptOrder(oid) {
  if (!isDriver()) return;
  if (Object.keys(S.dMine).length) { toast("Əvvəlcə cari sifarişi tamamlayın."); return; }
  const a = S.app, uid = S.user.uid, nm = a.fullName || S.profile.name || "Sürücü", ph = a.phone || S.profile.phone || "";
  try {
    const res = await runTransaction(ref(db, `live_orders/${oid}`), cur => {
      if (!cur) return cur;
      if (cur.status !== "open") return;
      cur.status = "accepted"; cur.driverId = uid; cur.driverName = nm;
      cur.car = `${a.make} ${a.model}, ${a.color}, ${a.plate}`; cur.acceptedAt = Date.now();
      return cur;
    });
    if (!res.committed) { toast("Bu sifariş artıq götürülüb və ya ləğv edilib."); return; }
    await update(ref(db, `order_private/${oid}`), { driverId: uid, driverName: nm, driverPhone: ph });
    toast("Sifarişi qəbul etdiniz.");
  } catch (e) { toast(dbMsg(e)); }
}
function routeHtml(o) {
  return `<div class="route"><div><i></i><span>${esc(o.from && o.from.text)}</span></div><div><i class="t"></i><span>${esc(o.to && o.to.text)}</span></div></div>`;
}
function jobCard(id, o) {
  const pv = S.dPriv[id] || {}, nm = pv.customerName || o.name || "Müştəri";
  return `<div class="card"><div class="row"><b>${esc(nm)}</b><span class="st">Qəbul edilib</span></div>${routeHtml(o)}
  <div class="row"><span class="meta">${o.km || 0} km · ${esc((CLASSES[o.cls] || {}).n || "")} · ${esc(PAYS[o.pay] || "")}</span><span class="price">${money(o.price)}</span></div>
  <div class="acts" style="margin-top:12px">${pv.customerPhone ? callBtn(pv.customerPhone, "Müştərini ara") : '<span class="meta">Nömrə yüklənir…</span>'}<button class="callbtn alt" data-act="chat" data-oid="${esc(id)}" data-role="driver">${ic("chat")} Mesaj${S.unread[id] ? '<i class="dotb"></i>' : ""}</button></div>
  <div class="acts" style="margin-top:8px"><a class="callbtn alt" target="_blank" rel="noopener" href="${esc(navUrl(o.from))}">${ic("nav")} Götürmə yeri</a><a class="callbtn alt" target="_blank" rel="noopener" href="${esc(navUrl(o.to))}">${ic("nav")} Təyinat</a></div>
  <div class="acts" style="margin-top:10px"><button class="btn sm" data-act="finish" data-oid="${esc(id)}">Tamamla</button><button class="btn sm red" data-act="release" data-oid="${esc(id)}">İmtina et</button></div></div>`;
}
function openCard(id, o) {
  const near = S.pos && S.pos.src === "gps" && o.from ? ` · sizdən ${distKm(S.pos, o.from).toFixed(1)} km` : "";
  return `<div class="card"><div class="row"><b>${esc(o.name || "Müştəri")}</b><span class="meta">${ago(o.createdAt)}</span></div>${routeHtml(o)}
  <div class="row"><span class="meta">${o.km || 0} km · ${esc((CLASSES[o.cls] || {}).n || "")} · ${esc(PAYS[o.pay] || "")}${near}</span><span class="price">${money(o.price)}</span></div>
  <button class="btn" style="font-size:17px;padding:12px;margin-top:12px" data-act="accept" data-oid="${esc(id)}">Qəbul et</button></div>`;
}
function renderDriverPanel() {
  const el = $("#dpBody"); if (!el) return;
  if (!isDriver()) { el.innerHTML = '<div class="info wait">Şoför paneli yalnız təsdiqlənmiş sürücülər üçündür.</div>'; return; }
  const mine = Object.entries(S.dMine), open = openList();
  el.innerHTML = (S.dErr ? '<div class="info bad">Sifarişlər yüklənmədi. İnterneti yoxlayın və ya bir az sonra yenidən cəhd edin.</div>' : "") +
    (mine.length ? `<div class="sec">Qəbul etdiyim sifariş</div>${mine.map(([id, o]) => jobCard(id, o)).join("")}` : "") +
    `<div class="sec">Aktiv sifarişlər${open.length ? " (" + open.length + ")" : ""}</div>` +
    (open.length ? open.map(([id, o]) => openCard(id, o)).join("") : '<div class="empty" style="padding:24px 6px"><p style="font-size:16px;margin:0 auto">Hazırda aktiv sifariş yoxdur. Yeni sifariş gələndə burada görünəcək.</p></div>') +
    `<button class="btn ghost" style="margin-top:6px" data-act="sub" data-n="driver">Ərizə məlumatlarım</button>`;
}
function driverPanelMount() {
  renderDriverPanel();
  const t = setInterval(() => { renderDriverPanel(); updatePill(); }, 30000);
  S.subUn = () => clearInterval(t);
}

/* ---------- Dəstək və sifariş söhbəti ---------- */
function msgHtml(arr, mine) {
  return arr.map(m => `<div class="msg ${m.from === mine ? "u" : "a"}">${esc(m.text)}<small>${fmtT(m.ts)}</small></div>`).join("");
}
function supportMount(prefill) {
  const uid = S.user.uid, chat = $("#chat"), form = $("#cf"), input = $("#ci");
  if (typeof prefill === "string") input.value = prefill;
  const hello = '<div class="msg a">Salam! Sualınızı yazın, dəstək komandamız tezliklə cavab verəcək.</div>';
  chat.innerHTML = hello;
  S.subUn = onValue(query(ref(db, `support/${uid}/messages`), limitToLast(200)), snap => {
    const arr = []; snap.forEach(c => { arr.push(c.val()); });
    chat.innerHTML = hello + msgHtml(arr, "user");
    chat.scrollTop = chat.scrollHeight;
  }, () => toast("Söhbət yüklənmədi."));
  form.addEventListener("submit", async e => {
    e.preventDefault(); const text = input.value.trim(); if (!text) return; input.value = "";
    try {
      await push(ref(db, `support/${uid}/messages`), { from: "user", text, ts: serverTimestamp() });
      await update(ref(db, `support/${uid}/meta`), { name: S.profile.name || S.user.displayName || "", email: S.user.email, phone: S.profile.phone || "", last: text.slice(0, 120), ts: serverTimestamp(), unreadAdmin: true });
    } catch (er) { toast(dbMsg(er)); input.value = text; }
  });
}
function ochatMount(c) {
  S.chatCtx = c;
  const chat = $("#chat"), form = $("#cf"), input = $("#ci");
  chat.innerHTML = '<div class="msg a">Burada sürücü / müştəri ilə yazışa bilərsiniz.</div>';
  S.subUn = onValue(query(ref(db, `order_private/${c.oid}/chat`), limitToLast(200)), snap => {
    const arr = []; snap.forEach(x => { arr.push(x.val()); });
    S.seen[c.oid] = arr.length;
    chat.innerHTML = '<div class="msg a">Burada sürücü / müştəri ilə yazışa bilərsiniz.</div>' + msgHtml(arr, c.role);
    chat.scrollTop = chat.scrollHeight;
  }, () => toast("Söhbət yüklənmədi."));
  form.addEventListener("submit", async e => {
    e.preventDefault(); const text = input.value.trim(); if (!text) return; input.value = "";
    try { await push(ref(db, `order_private/${c.oid}/chat`), { from: c.role, uid: S.user.uid, text, ts: serverTimestamp() }); }
    catch (er) { toast(dbMsg(er)); input.value = text; }
  });
}

/* ---------- PWA ---------- */
if ("serviceWorker" in navigator) window.addEventListener("load", () => navigator.serviceWorker.register("./service-worker.js").catch(() => { }));
