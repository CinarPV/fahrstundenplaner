/* Easy Fahrstundenplaner – Web-App für Fahrlehrer (Admin) und Fahrschüler */
"use strict";

const cfg = window.FSP_CONFIG || {};
const app = document.getElementById("app");
const userbox = document.getElementById("userbox");
const modal = document.getElementById("modal");
const modalBody = document.getElementById("modal-body");

const state = {
  session: null,
  profile: null,
  settings: { default_duration: 90 },
  tab: "calendar",
  weekStart: startOfWeek(new Date()),
};

let sb = null;

/* ---------------- Hilfsfunktionen ---------------- */

// Kleiner DOM-Baukasten: Text wird immer als Text eingefügt (kein HTML) → sicher gegen Einschleusen.
function el(tag, attrs, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v === null || v === undefined || v === false) continue;
    if (k.startsWith("on") && typeof v === "function") node.addEventListener(k.slice(2), v);
    else if (k === "class") node.className = v;
    else if (k === "value") node.value = v;
    else if (v === true) node.setAttribute(k, "");
    else node.setAttribute(k, v);
  }
  for (const c of children.flat(Infinity)) {
    if (c === null || c === undefined || c === false) continue;
    node.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return node;
}

function toast(msg, isError) {
  const t = document.getElementById("toast");
  t.textContent = msg;
  t.className = "toast" + (isError ? " error" : "");
  t.hidden = false;
  clearTimeout(toast._t);
  toast._t = setTimeout(() => (t.hidden = true), isError ? 6000 : 3000);
}

function fail(error) {
  console.error(error);
  const msg = (error && (error.message || error.error_description)) || String(error);
  toast("Fehler: " + msg, true);
}

function startOfWeek(d) {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const wd = (x.getDay() + 6) % 7; // Montag = 0
  x.setDate(x.getDate() - wd);
  return x;
}
const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
const addMin = (d, n) => new Date(new Date(d).getTime() + n * 60000);
const sameDay = (a, b) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
const pad = (n) => String(n).padStart(2, "0");

const fmtTime = (d) => new Date(d).toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" });
const fmtDay = (d) => new Date(d).toLocaleDateString("de-DE", { weekday: "short", day: "2-digit", month: "2-digit" });
const fmtDate = (d) => new Date(d).toLocaleDateString("de-DE", { weekday: "long", day: "2-digit", month: "2-digit", year: "numeric" });
const fmtRange = (start, min) => `${fmtTime(start)} – ${fmtTime(addMin(start, min))}`;
const dateInput = (d) => { d = new Date(d); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
const timeInput = (d) => { d = new Date(d); return `${pad(d.getHours())}:${pad(d.getMinutes())}`; };
const fromInputs = (date, time) => new Date(`${date}T${time}`);
function fmtMinutes(m) {
  if (m === null || m === undefined) return "–";
  const h = Math.floor(m / 60), r = m % 60;
  return h ? `${h} Std. ${r ? r + " Min." : ""}`.trim() : `${r} Min.`;
}
// Eine Fahrstunde = 45 Minuten; z. B. 90 Min. → „2 Fahrstunden“, 60 Min. → „1,3 Fahrstunden“
const LESSON_MIN = 45;
function fmtLessons(m) {
  const n = Math.round(((+m || 0) / LESSON_MIN) * 10) / 10;
  return `${n.toLocaleString("de-DE")} Fahrstunde${n === 1 ? "" : "n"}`;
}
const fullName = (p) => (p ? `${p.first_name || ""} ${p.last_name || ""}`.trim() || "Unbekannt" : "Unbekannt");
const STATUS_TEXT = {
  requested: "Angefragt", confirmed: "Bestätigt", rejected: "Abgelehnt", cancelled: "Anfrage zurückgezogen",
  offered: "Angeboten – wartet auf Zusage", declined: "Angebot abgelehnt",
  sick: "Krank gemeldet", cancelled_student: "Vom Schüler abgesagt", cancelled_teacher: "Vom Fahrlehrer abgesagt",
};
// Gründe, warum eine bestätigte Fahrstunde nicht zustande kam
const NOT_HELD = [
  ["sick", "🤒 Krank gemeldet"],
  ["cancelled_student", "🙋 Schüler hat abgesagt"],
  ["cancelled_teacher", "🚫 Ich habe abgesagt"],
];
const NOT_HELD_ICON = { sick: "🤒", cancelled_student: "🙋", cancelled_teacher: "🚫" };

// Kostenlose Absage bis Vortag 18:00 Uhr – danach Fehlstunde (kostenpflichtig)
function cancelDeadline(start) {
  const d = new Date(start);
  d.setHours(0, 0, 0, 0);
  d.setHours(-6);
  return d;
}
const isLate = (start) => Date.now() > cancelDeadline(start).getTime();
const fmtDeadline = (start) => `${fmtDay(cancelDeadline(start))}, 18:00 Uhr`;
const LICENSE_CLASSES = ["B", "B197", "B Automatik"];

// Kurzinfo zum Schüler: Klasse, Sehhilfe, Umschreiber
function studentTags(p) {
  if (!p) return null;
  const tags = [];
  if (p.license_class) tags.push(el("span", { class: "tag" }, "Klasse " + p.license_class));
  if (p.needs_glasses) tags.push(el("span", { class: "tag warn" }, "👓 Sehhilfe"));
  if (p.is_conversion) tags.push(el("span", { class: "tag" }, "Umschreiber"));
  return tags.length ? el("span", { class: "tags" }, tags) : null;
}
// "Admin" = Fahrlehrer (verwaltet eigene Schüler); "Owner" = Haupt-Admin (legt Fahrlehrer an)
const isAdmin = () => !!state.profile && state.profile.role === "teacher" && state.profile.status === "active";
const isOwner = () => isAdmin() && state.profile.is_owner;
const teacherSignature = () => `Dein Fahrlehrer ${state.settings.display_name || ""}`.trim();
// Ein Link für alle – Schüler wählen ihren Fahrlehrer bei der Registrierung aus
const studentLink = () => location.origin + location.pathname;

// Sonderfahrten
const LESSON_TYPES = { normal: "Übungsfahrt", ueberland: "Überlandfahrt", autobahn: "Autobahnfahrt", nacht: "Nachtfahrt" };
const LESSON_ICON = { normal: "", ueberland: "🌳", autobahn: "🛣️", nacht: "🌙" };
const SPECIAL_TYPES = ["ueberland", "autobahn", "nacht"];
const typeLabel = (t) => `${LESSON_ICON[t || "normal"]} ${LESSON_TYPES[t || "normal"]}`.trim();

// WhatsApp: Handynummer in internationales Format bringen (0151… → 49151…)
function waNumber(phone) {
  let d = (phone || "").replace(/[^\d+]/g, "");
  if (d.startsWith("+")) d = d.slice(1);
  else if (d.startsWith("00")) d = d.slice(2);
  else if (d.startsWith("0")) d = "49" + d.slice(1);
  return /^\d{8,15}$/.test(d) ? d : null;
}
function waButton(phone, text, label = "💬 Per WhatsApp schreiben") {
  const n = waNumber(phone);
  return n ? el("a", { class: "btn ok", href: `https://wa.me/${n}?text=${encodeURIComponent(text)}`, target: "_blank", rel: "noopener" }, label) : null;
}
// Nachrichtentext vom Fahrlehrer an den Schüler
function waTextForStudent(kind, profile, slot, reply) {
  const when = `${fmtDate(slot.starts_at)} um ${fmtTime(slot.starts_at)} Uhr`;
  const hi = `Hallo ${(profile && profile.first_name) || ""},`;
  const body = {
    confirmed: `${hi} deine Fahrstunde am ${when} (${slot.duration_min} Min.) ist bestätigt.`,
    offered: `${hi} ich biete dir eine Fahrstunde an: ${when} (${slot.duration_min} Min.). Bitte schau in die App und sag zu oder ab.`,
    rejected: `${hi} deine Anfrage für ${when} kann ich leider nicht bestätigen. Schau gern nach einem anderen freien Termin.`,
    cancelled_teacher: `${hi} ich muss die Fahrstunde am ${when} leider absagen.`,
  }[kind];
  return body + (reply ? `\n${reply}` : "") + `\n\nZur App: ${appLink()}\n\n` + teacherSignature();
}
// Nach einer Aktion: Erfolg anzeigen und anbieten, den Schüler per WhatsApp zu informieren
function notifyStep(msg, phone, text, who = "den Schüler") {
  state.renderOnClose = true;
  const wa = waButton(phone, text, `💬 ${who[0].toUpperCase() + who.slice(1)} per WhatsApp informieren`);
  openModal("✓ " + msg,
    wa ? el("p", {}, `Möchtest du ${who} per WhatsApp informieren? Der Text ist schon vorbereitet.`)
       : el("p", { class: "muted small" }, `Für ${who} ist keine Handynummer hinterlegt – keine WhatsApp-Nachricht möglich.`),
    wa ? el("div", { class: "note" }, text) : null,
    el("div", { class: "actions" }, wa, el("button", { class: "btn ghost", onclick: closeModal }, "Schließen")));
}
modal.addEventListener("close", () => { if (state.renderOnClose) { state.renderOnClose = false; render(); } });

// "Neu"-Markierung: Zeitpunkt des letzten Besuchs pro Gerät merken
const seenKey = (name) => `fsp_seen_${name}_${state.profile && state.profile.id}`;
function getSeen(name) { try { return localStorage.getItem(seenKey(name)) || "1970-01-01T00:00:00Z"; } catch { return new Date().toISOString(); } }
function markSeen(name) { try { localStorage.setItem(seenKey(name), new Date().toISOString()); } catch { /* egal */ } }

// Formularfelder für Profildaten (Registrierung ausgenommen)
function profileFields(p) {
  const first = el("input", { value: p.first_name || "", autocomplete: "given-name" });
  const last = el("input", { value: p.last_name || "", autocomplete: "family-name" });
  const cls = el("select", {}, el("option", { value: "" }, "– keine Angabe –"),
    LICENSE_CLASSES.map((c) => el("option", { value: c }, c)));
  cls.value = p.license_class || "";
  const glasses = el("input", { type: "checkbox" }); glasses.checked = !!p.needs_glasses;
  const conversion = el("input", { type: "checkbox" }); conversion.checked = !!p.is_conversion;
  const phone = el("input", { type: "tel", value: p.phone || "", placeholder: "z. B. 0151 23456789", autocomplete: "tel" });
  return {
    node: el("div", {},
      el("div", { class: "row" },
        el("div", {}, el("label", {}, "Vorname"), first),
        el("div", {}, el("label", {}, "Nachname"), last)),
      el("label", {}, "Führerscheinklasse"), cls,
      el("label", { class: "check" }, glasses, "Sehhilfe (Brille / Kontaktlinsen)"),
      el("label", { class: "check" }, conversion, "Umschreiber"),
      el("label", {}, "WhatsApp-Nummer"), phone),
    values: () => ({
      first_name: first.value.trim(), last_name: last.value.trim(), license_class: cls.value || null,
      needs_glasses: glasses.checked, is_conversion: conversion.checked, phone: phone.value.trim() || null,
    }),
  };
}

// Export der Fahrstunden eines Schülers: Excel (CSV) oder Drucken/PDF
function lessonRows(rows) {
  return rows.filter((b) => b.slots && b.status !== "requested" && b.status !== "cancelled")
    .sort((a, b) => a.slots.starts_at.localeCompare(b.slots.starts_at))
    .map((b) => ({
      date: new Date(b.slots.starts_at).toLocaleDateString("de-DE"),
      time: fmtRange(b.slots.starts_at, b.slots.duration_min),
      type: b.actual_minutes !== null ? LESSON_TYPES[b.lesson_type || "normal"] : "",
      minutes: b.actual_minutes ?? "",
      status: b.status === "confirmed" ? (b.actual_minutes !== null ? "Gefahren" : "Bestätigt") : STATUS_TEXT[b.status],
      late: b.late_cancel ? "ja" : "",
      reason: b.cancel_reason || "",
    }));
}
function exportCsv(p, rows) {
  const head = ["Nr.", "Datum", "Uhrzeit", "Art", "Minuten", "Status", "Fehlstunde", "Grund"];
  const esc = (v) => `"${String(v).replace(/"/g, '""')}"`;
  const lines = [head.map(esc).join(";")].concat(lessonRows(rows).map((r, i) =>
    [i + 1, r.date, r.time, r.type, r.minutes, r.status, r.late, r.reason].map(esc).join(";")));
  downloadFile(csvBlob(lines), `Fahrstunden_${fullName(p).replace(/\s+/g, "_")}.csv`);
}
const csvBlob = (lines) => new Blob(["\ufeff" + lines.join("\r\n")], { type: "text/csv;charset=utf-8" });
function downloadFile(blob, name) {
  const url = URL.createObjectURL(blob);
  const a = el("a", { href: url, download: name });
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}
function exportPrint(p, rows) {
  const w = window.open("", "_blank");
  if (!w) { toast("Bitte Pop-ups für diese Seite erlauben.", true); return; }
  const d = w.document;
  d.title = "Fahrstunden " + fullName(p);
  const st = d.createElement("style");
  st.textContent = "body{font:13px system-ui,sans-serif;margin:24px;color:#111}h1{font-size:20px;margin:0 0 4px}table{border-collapse:collapse;width:100%;margin-top:12px}th,td{border:1px solid #bbb;padding:5px 7px;text-align:left}th{background:#eee}.r{text-align:right}";
  d.head.append(st);
  const r = lessonRows(rows);
  const done = r.filter((x) => x.status === "Gefahren");
  const total = done.reduce((s, x) => s + (+x.minutes || 0), 0);
  const tag = (t, txt, cls) => { const e = d.createElement(t); if (txt !== undefined) e.textContent = txt; if (cls) e.className = cls; return e; };
  const table = tag("table");
  const hr = tag("tr"); ["Nr.", "Datum", "Uhrzeit", "Art", "Minuten", "Status", "Fehlstunde", "Grund"].forEach((h) => hr.append(tag("th", h)));
  table.append(hr);
  r.forEach((x, i) => { const tr = tag("tr"); [i + 1, x.date, x.time, x.type, x.minutes, x.status, x.late, x.reason].forEach((v, j) => tr.append(tag("td", v, j === 4 ? "r" : ""))); table.append(tr); });
  const counts = SPECIAL_TYPES.map((t) => `${LESSON_TYPES[t]}: ${done.filter((x) => x.type === LESSON_TYPES[t]).length}`).join(" · ");
  d.body.append(tag("h1", "Fahrstunden – " + fullName(p)),
    tag("div", [p.license_class ? "Klasse " + p.license_class : "", `Stand: ${new Date().toLocaleDateString("de-DE")}`].filter(Boolean).join(" · ")),
    tag("p", `Gefahren: ${fmtLessons(total)} (à 45 Min.) · ${done.length} Termine · ${total} Min. (${fmtMinutes(total)}) · ${counts}`),
    table);
  setTimeout(() => w.print(), 300);
}
function exportButtons(p, rows) {
  return el("div", { class: "actions" },
    el("button", { class: "btn small ghost", onclick: () => exportCsv(p, rows) }, "⬇ Excel (CSV)"),
    el("button", { class: "btn small ghost", onclick: () => exportPrint(p, rows) }, "🖨 Drucken / PDF"));
}
// Sonderfahrten zählen
function specialSummary(rows) {
  const done = rows.filter((b) => b.status === "confirmed" && b.actual_minutes !== null);
  return SPECIAL_TYPES.map((t) => {
    const list = done.filter((b) => b.lesson_type === t);
    return `${LESSON_ICON[t]} ${LESSON_TYPES[t]}: ${list.length}× (${list.reduce((s, b) => s + b.actual_minutes, 0)} Min.)`;
  }).join(" · ");
}

// Minuten-Auswahl: Wert vorbelegt (Standard 90), mit −/+ im 5-Minuten-Takt änderbar.
// Auf die Zahl tippen → beliebige Minuten selbst eingeben (auch „krumme“ Werte).
// opts.fine = true: ohne Schnellwahl (für tatsächlich gefahrene Minuten)
function durationControl(initial, opts = {}) {
  const clamp = (v) => Math.min(600, Math.max(5, Math.round(Number(v) || 0)));
  const input = el("input", { type: "number", inputmode: "numeric", min: 5, max: 600, step: 1, value: clamp(initial), "aria-label": "Minuten" });
  const set = (v) => { input.value = clamp(v); input.dispatchEvent(new Event("input")); };
  const b = (label, fn) => el("button", { type: "button", class: "btn small ghost", onclick: fn }, label);
  const node = el("div", { class: "dur" },
    el("div", { class: "dur-row" },
      b("−15", () => set(+input.value - 15)),
      b("−5", () => set(+input.value - 5)),
      el("label", { class: "dur-field" }, input, el("span", {}, "Min.")),
      b("+5", () => set(+input.value + 5)),
      b("+15", () => set(+input.value + 15)),
    ),
    opts.fine ? null : el("div", { class: "chips" }, [45, 90, 135].map((m) => b(`${m} Min.`, () => set(m)))),
  );
  input.addEventListener("focus", () => input.select());           // Antippen markiert die Zahl → direkt überschreiben
  input.addEventListener("change", () => (input.value = clamp(input.value)));
  return { node, input, get value() { return clamp(input.value); } };
}

function openModal(title, ...content) {
  modalBody.replaceChildren(
    el("div", { class: "modal-head" },
      el("button", { class: "back", "aria-label": "Zurück", onclick: closeModal }, "‹ Zurück"),
      el("h3", {}, title),
      el("button", { class: "close", "aria-label": "Schließen", onclick: closeModal }, "×")),
    el("div", {}, ...content),
  );
  if (!modal.open) {
    modal.showModal();
    // Eintrag im Verlauf: Die Zurück-Taste/-Geste des Handys schließt das Fenster
    history.pushState({ tab: state.tab, modal: true }, "");
  }
}
function closeModal() {
  if (!modal.open) return;
  if (history.state && history.state.modal) history.back();   // → popstate schließt das Fenster
  else modal.close();
}

/* ---------------- Navigation (Tabs, Zurück) ---------------- */

// Tab wechseln und im Verlauf merken, damit „Zurück“ funktioniert
function goTab(id) {
  if (state.tab === id) return render();
  history.pushState({ tab: id }, "");
  state.tab = id;
  render();
}
// Sichtbare Zurück-Taste: eine Seite zurück, sonst zum Kalender
function goBack() {
  if (history.state && history.state.tab && history.state.tab !== "calendar" && history.length > 1) history.back();
  else goTab("calendar");
}
window.addEventListener("popstate", (e) => {
  if (modal.open) { modal.close(); return; }
  const tab = (e.state && e.state.tab) || "calendar";
  if (state.profile && tab !== state.tab) { state.tab = tab; render(); }
});
// Fenster mit Esc geschlossen → Verlaufseintrag mitnehmen
modal.addEventListener("close", () => { if (history.state && history.state.modal) history.back(); });
modal.addEventListener("click", (e) => { if (e.target === modal) closeModal(); });

async function busy(button, fn) {
  if (button) button.disabled = true;
  try { await fn(); } catch (e) { fail(e); } finally { if (button) button.disabled = false; }
}

/* ---------------- Rechtstexte (Impressum, Datenschutz, AGB) ---------------- */

function openLegal(key) {
  const t = (window.FSP_LEGAL_TEXTS || {})[key];
  if (!t) return;
  // "[bitte ergänzen]" gelb markieren, damit fehlende Angaben auffallen
  const para = (text) => {
    const parts = String(text).split(/(\[bitte ergänzen\])/);
    return el("p", {}, parts.map((x) => (x === "[bitte ergänzen]" ? el("span", { class: "missing" }, x) : x)));
  };
  openModal(t.title, el("div", { class: "legal" }, t.sections.map((sec) => [el("h4", {}, sec.h), sec.p.map(para)])));
}
document.getElementById("copyright").textContent = window.FSP_COPYRIGHT || "";
document.querySelectorAll("[data-legal]").forEach((b) => b.addEventListener("click", () => openLegal(b.dataset.legal)));
const legalLink = (key, text) => el("button", { type: "button", class: "linkbtn", onclick: () => openLegal(key) }, text);

/* ---------------- Start / Anmeldung ---------------- */

function configMissing() {
  return !cfg.SUPABASE_URL || cfg.SUPABASE_URL.startsWith("HIER") || !cfg.SUPABASE_ANON_KEY || cfg.SUPABASE_ANON_KEY.startsWith("HIER");
}

async function init() {
  if (configMissing()) {
    app.replaceChildren(el("div", { class: "card narrow" },
      el("h2", {}, "Fast fertig!"),
      el("p", {}, "Die App ist noch nicht mit der Datenbank verbunden. Trage in der Datei ", el("code", {}, "config.js"),
        " die Project URL und den anon-Key aus Supabase ein (siehe Anleitung in der README)."),
    ));
    return;
  }
  sb = window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY);

  sb.auth.onAuthStateChange((event, session) => {
    if (event === "PASSWORD_RECOVERY") { state.session = session; renderNewPassword(); return; }
    const changed = (session && session.user.id) !== (state.session && state.session.user.id);
    state.session = session;
    if (changed) setTimeout(loadUserAndRender, 0);
  });

  const { data } = await sb.auth.getSession();
  state.session = data.session;
  await loadUserAndRender();

  // Beim Zurückkehren zur Seite neu laden – aber nie, während jemand gerade etwas eingibt
  app.addEventListener("input", () => (state.dirty = true));
  app.addEventListener("click", (e) => { if (e.target.closest(".card button, .card details")) state.dirty = true; });
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible" && state.profile && !modal.open && !state.dirty) render();
  });
}

async function loadUserAndRender() {
  if (!state.session) { state.profile = null; renderUserbox(); renderAuth(); return; }
  try {
    const { data: profile, error } = await sb.from("profiles").select("*").eq("id", state.session.user.id).single();
    if (error) throw error;
    state.profile = profile;
    const teacherId = profile.role === "teacher" ? profile.id : profile.teacher_id;
    state.settings = { default_duration: 90, max_open: 3 };
    if (teacherId) {
      const { data: settings } = await sb.from("settings").select("*").eq("teacher_id", teacherId).maybeSingle();
      if (settings) state.settings = settings;
    }
    // Schüler: ist der Zugang wirklich aktiv (auch der Fahrlehrer nicht gesperrt)?
    state.active = profile.role === "teacher" ? profile.status === "active" : !!(await sb.rpc("is_active")).data;
  } catch (e) { fail(e); }
  state.tab = "calendar";
  renderUserbox();
  render();
}

// Schüler ist (noch) nicht freigeschaltet oder wurde gesperrt
// Fahrlehrer mit vom Haupt-Admin vergebenem Passwort: erst eigenes Passwort festlegen
function renderForcePassword() {
  const pw1 = el("input", { type: "password", minlength: 6, autocomplete: "new-password" });
  const pw2 = el("input", { type: "password", minlength: 6, autocomplete: "new-password" });
  const btn = el("button", { class: "btn" }, "Passwort speichern & weiter");
  btn.onclick = () => busy(btn, async () => {
    if (pw1.value.length < 6) throw new Error("Mindestens 6 Zeichen");
    if (pw1.value !== pw2.value) throw new Error("Die beiden Passwörter stimmen nicht überein");
    const { error } = await sb.auth.updateUser({ password: pw1.value });
    if (error) throw new Error(/different|same/i.test(error.message) ? "Bitte ein anderes Passwort als das bisherige wählen" : error.message);
    const { error: e2 } = await sb.rpc("password_changed");
    if (e2) throw e2;
    toast("Dein neues Passwort ist gespeichert.");
    await loadUserAndRender();
  });
  app.replaceChildren(el("div", { class: "card narrow" },
    el("h2", {}, "Willkommen! Bitte eigenes Passwort festlegen"),
    el("p", {}, "Du hast ein Passwort vom Haupt-Admin bekommen. Lege jetzt dein eigenes fest – nur du kennst es dann."),
    el("label", {}, "Neues Passwort (mind. 6 Zeichen)"), pw1,
    el("label", {}, "Neues Passwort wiederholen"), pw2,
    el("div", { class: "actions" }, btn)));
}

function renderWaiting() {
  const p = state.profile;
  const blocked = p.status !== "pending";
  const noTeacher = p.role === "student" && !p.teacher_id;
  app.replaceChildren(el("div", { class: "card narrow" },
    el("h2", {}, noTeacher ? "Kein Fahrlehrer zugeordnet" : blocked ? (p.role === "teacher" ? "Zugang nicht aktiv" : "🎓 Ausbildung abgeschlossen") : "Fast geschafft – warte auf Freischaltung"),
    el("p", {}, noTeacher
      ? "Dein Konto ist keinem Fahrlehrer zugeordnet. Bitte registriere dich über den Link, den dir dein Fahrlehrer geschickt hat, oder sprich ihn direkt an."
      : blocked
      ? (p.role === "teacher" ? "Dein Fahrlehrer-Zugang ist gesperrt. Bitte wende dich an den Betreiber der App."
        : "Deine Ausbildung ist abgeschlossen – herzlichen Glückwunsch und allzeit gute Fahrt! Bei Fragen wende dich bitte direkt an deinen Fahrlehrer.")
      : `Hallo ${p.first_name || ""}! Deine Anmeldung ist angekommen. Dein Fahrlehrer muss dich noch freischalten – danach siehst du hier den Kalender und kannst Fahrstunden anfragen.`),
    el("div", { class: "actions" },
      blocked ? null : el("button", { class: "btn", onclick: () => loadUserAndRender() }, "↻ Erneut prüfen"),
      el("button", { class: "btn ghost", onclick: async () => { await sb.auth.signOut(); renderAuth("login"); } }, "‹ Zur Anmeldung / anderes Konto")),
  ));
}

function renderUserbox() {
  if (!state.profile) { userbox.replaceChildren(); return; }
  userbox.replaceChildren(...[
    el("span", {}, fullName(state.profile)),
    isAdmin() ? el("span", { class: "badge admin" }, isOwner() ? "Haupt-Admin" : "Fahrlehrer") : null,
    isAdmin() ? el("button", { class: "btn small", onclick: openLinkModal, "aria-label": "Schüler-Link", title: "Schüler-Link" }, "🔗", el("span", { class: "hide-sm" }, " Schüler-Link")) : null,
    !isAdmin() && state.settings.display_name ? el("span", { class: "small muted" }, "· Fahrlehrer " + state.settings.display_name) : null,
    el("button", { class: "btn small ghost", onclick: async () => { await sb.auth.signOut(); } }, "Abmelden"),
  ].filter(Boolean));
}

// Kürzel des Fahrlehrers aus dem Link (?l=…), auf diesem Gerät gemerkt
function urlTeacherSlug() {
  const fromUrl = new URLSearchParams(location.search).get("l");
  try {
    if (fromUrl) localStorage.setItem("fsp_teacher", fromUrl.toLowerCase());
    return (fromUrl || localStorage.getItem("fsp_teacher") || "").toLowerCase();
  } catch { return (fromUrl || "").toLowerCase(); }
}

function renderAuth(mode = (urlTeacherSlug() && new URLSearchParams(location.search).get("l") ? "register" : "login")) {
  const email = el("input", { type: "email", autocomplete: "email", required: true });
  const pw = el("input", { type: "password", autocomplete: mode === "login" ? "current-password" : "new-password", minlength: 6, required: true });
  const first = el("input", { autocomplete: "given-name", required: true });
  const last = el("input", { autocomplete: "family-name", required: true });
  const licenseClass = el("select", { required: true },
    el("option", { value: "" }, "Bitte wählen …"),
    LICENSE_CLASSES.map((c) => el("option", { value: c }, c === "B" ? "B (Schaltwagen)" : c === "B197" ? "B197 (Automatik-Prüfung + Schalt-Schulung)" : c)));
  const glasses = el("input", { type: "checkbox" });
  const conversion = el("input", { type: "checkbox" });
  const phone = el("input", { type: "tel", autocomplete: "tel", placeholder: "z. B. 0151 23456789", required: mode === "register" });
  // Sehhilfe ist ein Gesundheitsdatum → nur mit ausdrücklicher Einwilligung (Art. 9 DSGVO)
  const glassesConsent = el("input", { type: "checkbox" });
  const glassesConsentRow = el("label", { class: "check", hidden: true }, glassesConsent,
    el("span", { class: "small" }, "Ich willige ein, dass die Angabe „Sehhilfe“ gespeichert und meinem Fahrlehrer angezeigt wird. Widerruf jederzeit im Profil möglich."));
  glasses.addEventListener("change", () => { glassesConsentRow.hidden = !glasses.checked; if (!glasses.checked) glassesConsent.checked = false; });
  const terms = el("input", { type: "checkbox" });
  const submit = el("button", { class: "btn", type: "submit" }, mode === "login" ? "Anmelden" : "Registrieren");

  // Fahrlehrer aus dem Link (?l=kuersat) – sonst Auswahl
  const linkSlug = urlTeacherSlug();
  const teacherSel = el("select", { required: true }, el("option", { value: "" }, "Lädt …"));
  const teacherInfo = el("p", { class: "notice", hidden: true });
  const teacherWrap = el("div", {}, el("label", {}, "Mit welchem Fahrlehrer fährst du?"), teacherSel);
  const studentOnly = el("div", {});   // Felder nur für Schüler (bei der Ersteinrichtung ausgeblendet)
  let firstSetup = false;
  if (mode === "register") sb.rpc("public_teachers").then(({ data, error }) => {
    if (error) return fail(error);
    const list = data || [];
    if (!list.length) {
      // Allererste Registrierung: noch kein Fahrlehrer vorhanden → Betreiber legt sein Konto an
      firstSetup = true;
      [teacherSel, licenseClass, phone].forEach((x) => (x.required = false));
      teacherWrap.hidden = true;
      studentOnly.hidden = true;
      teacherInfo.hidden = false;
      teacherInfo.replaceChildren(el("b", {}, "Erste Einrichtung: "),
        "Es ist noch kein Fahrlehrer angelegt. Registriere dich hier als Betreiber – danach wirst du per Befehl in Supabase zum Haupt-Admin.");
      return;
    }
    teacherSel.replaceChildren(el("option", { value: "" }, "Bitte deinen Fahrlehrer wählen …"),
      ...list.map((t) => el("option", { value: t.slug }, t.display_name)));
    const match = list.find((t) => t.slug === linkSlug);
    if (match) teacherSel.value = match.slug;   // alter Kürzel-Link (?l=…) wählt nur vor
  });

  const form = el("form", {
    onsubmit: (e) => {
      e.preventDefault();
      busy(submit, async () => {
        if (mode === "login") {
          const { error } = await sb.auth.signInWithPassword({ email: email.value.trim(), password: pw.value });
          if (error) throw new Error(error.message === "Invalid login credentials" ? "E-Mail oder Passwort falsch" : error.message);
        } else {
          if (!firstSetup && !waNumber(phone.value)) throw new Error("Bitte eine gültige WhatsApp-Nummer angeben, z. B. 0151 23456789");
          if (glasses.checked && !glassesConsent.checked) throw new Error("Bitte die Einwilligung zur Angabe „Sehhilfe“ bestätigen – oder den Haken bei Sehhilfe entfernen.");
          if (!terms.checked) throw new Error("Bitte den Nutzungsbedingungen zustimmen.");
          const { data, error } = await sb.auth.signUp({
            email: email.value.trim(), password: pw.value,
            options: {
              data: {
                first_name: first.value.trim(), last_name: last.value.trim(),
                license_class: licenseClass.value, needs_glasses: glasses.checked && glassesConsent.checked, is_conversion: conversion.checked,
                phone: phone.value.trim(), teacher: teacherSel.value, accepted_terms: true,
              },
              emailRedirectTo: location.origin + location.pathname },
          });
          if (error) throw error;
          if (!data.session) {
            app.replaceChildren(el("div", { class: "card narrow" },
              el("h2", {}, "Fast geschafft"),
              el("p", {}, "Wir haben dir eine E-Mail geschickt. Klicke auf den Link darin, um dein Konto zu bestätigen. Danach kannst du dich hier anmelden."),
              el("button", { class: "btn ghost", onclick: () => renderAuth("login") }, "Zur Anmeldung")));
          }
        }
      });
    },
  },
    mode === "register" ? el("div", { class: "row" },
      el("div", {}, el("label", {}, "Vorname"), first),
      el("div", {}, el("label", {}, "Nachname"), last)) : null,
    mode === "register" ? [
      teacherInfo, teacherWrap,
      (studentOnly.append(
        el("label", {}, "Führerscheinklasse"), licenseClass,
        el("label", { class: "check" }, glasses, "Ich brauche eine Sehhilfe (Brille / Kontaktlinsen)"),
        glassesConsentRow,
        el("label", { class: "check" }, conversion, "Ich bin Umschreiber (habe schon einen ausländischen Führerschein)"),
        el("label", {}, "Deine WhatsApp-Nummer"), phone,
        el("p", { class: "muted small", style: "margin:4px 0 0" }, "Darüber schickt dir dein Fahrlehrer Angebote und Bestätigungen.")), studentOnly),
    ] : null,
    el("label", {}, "E-Mail"), email,
    el("label", {}, "Passwort" + (mode === "register" ? " (mind. 6 Zeichen)" : "")), pw,
    mode === "register" ? el("label", { class: "check" }, terms,
      el("span", { class: "small" }, "Ich akzeptiere die ", legalLink("agb", "Nutzungsbedingungen"),
        " (u. a.: Fahrstunden sind nach Bestätigung verbindlich, Absagen nach Vortag 18 Uhr kostenpflichtig) und habe die ",
        legalLink("datenschutz", "Datenschutzerklärung"), " gelesen.")) : null,
    el("div", { class: "actions" }, submit),
  );

  app.replaceChildren(el("div", { class: "card narrow" },
    el("div", { class: "tabs" },
      el("button", { type: "button", class: "tab" + (mode === "login" ? " active" : ""), onclick: () => renderAuth("login") }, "Anmelden"),
      el("button", { type: "button", class: "tab" + (mode === "register" ? " active" : ""), onclick: () => renderAuth("register") }, "Neu registrieren")),
    el("p", { class: "muted small" }, mode === "login"
      ? "Melde dich an, um Fahrstunden zu sehen und zu buchen."
      : "Einmal registrieren mit Vor- und Nachnamen – danach kannst du freie Fahrstunden anfragen."),
    form,
    mode === "login" ? el("p", { class: "small" }, el("a", {
      href: "#", onclick: (e) => {
        e.preventDefault();
        if (!email.value.trim()) { toast("Bitte zuerst deine E-Mail eintragen.", true); return; }
        sb.auth.resetPasswordForEmail(email.value.trim(), { redirectTo: location.origin + location.pathname })
          .then(({ error }) => error ? fail(error) : toast("E-Mail zum Zurücksetzen wurde verschickt."));
      },
    }, "Passwort vergessen?")) : null,
  ));
}

function renderNewPassword() {
  const pw = el("input", { type: "password", minlength: 6, autocomplete: "new-password" });
  const btn = el("button", { class: "btn" }, "Passwort speichern");
  btn.onclick = () => busy(btn, async () => {
    const { error } = await sb.auth.updateUser({ password: pw.value });
    if (error) throw error;
    toast("Neues Passwort gespeichert.");
    await loadUserAndRender();
  });
  app.replaceChildren(el("div", { class: "card narrow" }, el("h2", {}, "Neues Passwort"), el("label", {}, "Neues Passwort (mind. 6 Zeichen)"), pw, el("div", { class: "actions" }, btn)));
}

/* ---------------- Hauptansicht ---------------- */

async function render() {
  if (!state.profile) return;
  state.dirty = false;
  // Sperrseiten immer zuerst – egal von wo render() aufgerufen wird
  if (state.profile.must_change_password) return renderForcePassword();
  if (!isAdmin() && !state.active) return renderWaiting();
  const tabs = isAdmin()
    ? [["calendar", "Kalender"], ["requests", "Anfragen"], ["students", "Schüler"], ["training", "Ausbildung"], ["settings", "Einstellungen"]]
      .concat(isOwner() ? [["teachers", "Fahrlehrer"]] : [])
    : [["calendar", "Kalender"], ["mine", "Stunden"], ["training", "Ausbildung"], ["profile", "Profil"]];

  const tabbar = el("div", { class: "tabs" }, tabs.map(([id, label]) =>
    el("button", { class: "tab" + (state.tab === id ? " active" : ""), "data-tab": id, onclick: () => goTab(id) }, label)));
  const content = el("div", {}, el("p", { class: "muted" }, "Lädt …"));
  const back = state.tab !== "calendar"
    ? el("button", { class: "btn small ghost backbtn", onclick: goBack }, "‹ Zurück") : null;
  app.replaceChildren(...[tabbar, back, content].filter(Boolean));
  if (!history.state || !history.state.tab) history.replaceState({ tab: state.tab }, "");

  if (isAdmin()) updateRequestCount(tabbar);
  else updateStudentNews(tabbar);

  try {
    let view;
    if (state.tab === "calendar") view = isAdmin() ? await adminCalendar() : await studentCalendar();
    else if (state.tab === "requests") view = await adminRequests();
    else if (state.tab === "students") view = await adminStudents();
    else if (state.tab === "settings") view = adminSettings();
    else if (state.tab === "teachers") view = await ownerTeachers();
    else if (state.tab === "mine") view = await studentMine();
    else if (state.tab === "profile") view = studentProfile();
    else if (state.tab === "training") view = isAdmin() ? await adminTraining() : await studentTraining();
    content.replaceChildren(view);
  } catch (e) {
    content.replaceChildren(el("p", { class: "muted" }, "Konnte nicht geladen werden."));
    fail(e);
  }
}

// Schüler: Zahl der Neuigkeiten (Bestätigung, Ablehnung, Abhaken …) seit dem letzten Blick auf "Meine Fahrstunden"
async function updateStudentNews(tabbar) {
  if (state.tab === "mine") return;
  const { count } = await sb.from("bookings").select("id", { count: "exact", head: true })
    .eq("student_id", state.profile.id).gt("decided_at", getSeen("mine"));
  const btn = tabbar.querySelector('[data-tab="mine"]');
  if (btn && count) btn.append(el("span", { class: "count" }, count));
}

async function updateRequestCount(tabbar) {
  const [req, pend, canc] = await Promise.all([
    sb.from("bookings").select("id", { count: "exact", head: true }).eq("status", "requested"),
    sb.from("profiles").select("id", { count: "exact", head: true }).eq("status", "pending"),
    sb.from("bookings").select("id", { count: "exact", head: true }).in("status", ["cancelled_student", "declined"]).gt("decided_at", getSeen("requests")),
  ]);
  const badge = (tab, count) => {
    const btn = tabbar.querySelector(`[data-tab="${tab}"]`);
    if (btn && count) btn.append(el("span", { class: "count" }, count));
  };
  badge("requests", (req.count || 0) + (state.tab === "requests" ? 0 : canc.count || 0));
  if (state.tab === "requests") markSeen("requests");
  badge("students", pend.count);
  // Erinnerung: Sicherung älter als 30 Tage
  const st = tabbar.querySelector('[data-tab="settings"]');
  if (st && backupOverdue()) st.append(el("span", { class: "count", title: "Datensicherung fällig" }, "!"));
}

function openCopyWeek(slots) {
  const weeks = el("input", { type: "number", min: 1, max: 26, value: 1 });
  const btn = el("button", { class: "btn" }, "Kopieren");
  btn.onclick = () => busy(btn, async () => {
    const n = Math.max(1, Math.min(26, +weeks.value || 1)), list = [];
    for (let k = 1; k <= n; k++) {
      for (const s of slots) {
        const d = new Date(s.starts_at);
        const at = fromInputs(dateInput(addDays(d, k * 7)), timeInput(d)); // gleiche Uhrzeit, auch bei Zeitumstellung
        list.push({ starts_at: at.toISOString(), duration_min: s.duration_min });
      }
    }
    const res = await insertSlots(list);
    toast(insertedMsg(res));
    closeModal();
    render();
  });
  openModal("Woche kopieren",
    el("p", {}, `Alle ${slots.length} Termine dieser Woche (${fmtDay(state.weekStart)} – ${fmtDay(addDays(state.weekStart, 6))}) mit denselben Tagen, Uhrzeiten und Dauern als `,
      el("b", {}, "freie Termine"), " in die folgenden Wochen übernehmen."),
    el("label", {}, "Für wie viele folgende Wochen?"), weeks,
    el("p", { class: "muted small" }, "Buchungen werden nicht mitkopiert. Termine, die es zur selben Zeit schon gibt, werden übersprungen."),
    el("div", { class: "actions" }, btn, el("button", { class: "btn ghost", onclick: closeModal }, "Abbrechen")));
}

function weekBar(extra) {
  const end = addDays(state.weekStart, 6);
  const go = (n) => { state.weekStart = addDays(state.weekStart, n); render(); };
  return el("div", { class: "weekbar" },
    el("div", { class: "actions", style: "margin:0" },
      el("button", { class: "btn small ghost", onclick: () => go(-7), "aria-label": "Vorherige Woche" }, "‹"),
      el("button", { class: "btn small ghost", onclick: () => { state.weekStart = startOfWeek(new Date()); render(); } }, "Heute"),
      el("button", { class: "btn small ghost", onclick: () => go(7), "aria-label": "Nächste Woche" }, "›")),
    el("span", { class: "title" }, `${fmtDay(state.weekStart)} – ${fmtDay(end)} ${end.getFullYear()}`),
    el("div", { class: "actions", style: "margin:0" }, extra,
      el("button", { class: "btn small ghost", onclick: () => render() }, "↻ Aktualisieren")),
  );
}

function legend(items) {
  return el("div", { class: "legend" }, items.map(([cls, text]) => el("span", {}, el("i", { class: "slot " + cls, style: "padding:0;margin:0" }), text)));
}

function weekGrid(slots, renderSlot, onAddDay) {
  const today = new Date();
  const days = [];
  for (let i = 0; i < 7; i++) {
    const day = addDays(state.weekStart, i);
    const daySlots = slots.filter((s) => sameDay(new Date(s.starts_at), day));
    days.push(el("div", {
      class: "day" + (sameDay(day, today) ? " today" : "") + (onAddDay ? " tappable" : ""),
      onclick: onAddDay ? (e) => { if (!e.target.closest(".slot")) onAddDay(day); } : null,
    },
      el("div", { class: "day-head" }, el("span", {}, fmtDay(day)),
        onAddDay ? el("button", { class: "plus", title: "Termin an diesem Tag anlegen", onclick: (e) => { e.stopPropagation(); onAddDay(day); } }, "+") : null),
      daySlots.length ? daySlots.map(renderSlot) : el("div", { class: "empty" }, "—"),
    ));
  }
  return el("div", { class: "week" }, days);
}

/* ---------------- Admin: Kalender ---------------- */

// „Fahrstunden anlegen“ als Fenster – optional mit vorausgewähltem Tag
function openSlotForm(day) {
  const form = newSlotForm({ inModal: true });
  openModal("➕ Fahrstunden anlegen", form.node);
  if (day) form.setDate(day);
}

// Countdown bis zur Fahrstunde („in 2 Std. 15 Min.“) – wird alle 30 Sek. aktualisiert
function countdownText(start, durMin) {
  const t = new Date(start).getTime(), now = Date.now();
  if (t <= now) return now < t + durMin * 60000 ? "läuft gerade" : "vorbei";
  const m = Math.floor((t - now) / 60000), d = Math.floor(m / 1440), h = Math.floor((m % 1440) / 60), mm = m % 60;
  if (d > 0) return `in ${d} ${d === 1 ? "Tag" : "Tagen"}${h ? ` ${h} Std.` : ""}`;
  if (h > 0) return `in ${h} Std. ${mm} Min.`;
  return `in ${mm} Min.`;
}
function countdownEl(start, durMin, cls = "") {
  const e = el("span", { class: "countdown " + cls, "data-start": start, "data-dur": durMin });
  e.textContent = countdownText(start, durMin);
  return e;
}
setInterval(() => document.querySelectorAll(".countdown").forEach((e) => (e.textContent = countdownText(e.dataset.start, +e.dataset.dur))), 30000);

// Nächste bestätigte Fahrstunden des Fahrlehrers – mit wem und wann
async function nextLessonsCard() {
  const since = addMin(new Date(), -180).toISOString();
  const [{ data, error }, req] = await Promise.all([
    sb.from("bookings").select("id,profiles(first_name,last_name,needs_glasses),slots!inner(id,starts_at,duration_min)")
      .eq("status", "confirmed").is("actual_minutes", null).gte("slots.starts_at", since),
    sb.from("bookings").select("id", { count: "exact", head: true }).eq("status", "requested"),
  ]);
  if (error) throw error;
  const now = Date.now();
  const list = data.filter((b) => b.slots && addMin(b.slots.starts_at, b.slots.duration_min).getTime() > now)
    .sort((a, b) => a.slots.starts_at.localeCompare(b.slots.starts_at)).slice(0, 5);
  return el("div", { class: "card next-card" },
    el("div", { class: "done-row", style: "justify-content:space-between;margin:0" },
      el("h3", { style: "margin:0" }, "🚗 Nächste Fahrstunden"),
      req.count ? el("button", { class: "btn small", onclick: () => goTab("requests") }, `${req.count} offene Anfrage${req.count === 1 ? "" : "n"} ›`) : null),
    list.length ? list.map((b, i) => el("button", { class: "next-row" + (i === 0 ? " first" : ""), onclick: () => openAdminSlot(b.slots.id) },
      countdownEl(b.slots.starts_at, b.slots.duration_min),
      el("span", { class: "next-when" }, `${fmtDay(b.slots.starts_at)} ${fmtRange(b.slots.starts_at, b.slots.duration_min)}`),
      el("span", { class: "next-who" }, fullName(b.profiles) + (b.profiles && b.profiles.needs_glasses ? " 👓" : ""))))
      : el("p", { class: "muted", style: "margin:8px 0 0" }, "Keine anstehenden bestätigten Fahrstunden."));
}

const activeBooking = (slot) => (slot.bookings || []).find((b) => ["requested", "confirmed", "offered"].includes(b.status));

async function adminCalendar() {
  const from = state.weekStart, to = addDays(state.weekStart, 7);
  const { data: slots, error } = await sb.from("slots")
    .select("id,starts_at,duration_min,bookings(id,status,actual_minutes,late_cancel,lesson_type,student_id,profiles(first_name,last_name,license_class,needs_glasses,is_conversion))")
    .gte("starts_at", from.toISOString()).lt("starts_at", to.toISOString()).order("starts_at");
  if (error) throw error;

  const grid = weekGrid(slots, (s) => {
    const b = activeBooking(s);
    const notHeld = (s.bookings || []).filter((x) => NOT_HELD_ICON[x.status]).pop();
    const past = new Date(s.starts_at).getTime() < Date.now();
    const glasses = (p) => (p && p.needs_glasses ? " 👓" : "");
    let cls = past ? "past" : "free", label = past ? "Nicht gebucht" : "Frei";
    if (!b && notHeld) label = `${NOT_HELD_ICON[notHeld.status]} ${fullName(notHeld.profiles)} – ${STATUS_TEXT[notHeld.status]}`
      + (notHeld.late_cancel ? " · Fehlstunde" : "") + (past ? "" : " · wieder frei");
    if (b && b.status === "requested") { cls = "requested"; label = "Anfrage: " + fullName(b.profiles) + glasses(b.profiles); }
    if (b && b.status === "offered") { cls = "offered"; label = "Angebot an " + fullName(b.profiles) + " – wartet"; }
    if (b && b.status === "confirmed") {
      cls = b.actual_minutes !== null ? "done" : "confirmed";
      label = (b.actual_minutes !== null ? `✓ ${b.actual_minutes} Min. ${LESSON_ICON[b.lesson_type] || ""} · ` : "") + fullName(b.profiles) + glasses(b.profiles);
    }
    const upcoming = b && b.status === "confirmed" && b.actual_minutes === null && !past;
    return el("button", { class: "slot " + cls, onclick: (e) => { e.stopPropagation(); openAdminSlot(s.id); } },
      el("b", {}, fmtRange(s.starts_at, s.duration_min)), label,
      upcoming ? el("div", {}, countdownEl(s.starts_at, s.duration_min, "small")) : null);
  }, (day) => openSlotForm(day));

  return el("div", {},
    await nextLessonsCard(),
    el("div", { class: "actions", style: "margin:0 0 12px" },
      el("button", { class: "btn add-btn", onclick: () => openSlotForm() }, "➕ Fahrstunden anlegen / freigeben")),
    weekBar(slots.length ? el("button", { class: "btn small ghost", onclick: () => openCopyWeek(slots) }, "⧉ Woche kopieren") : null),
    legend([["free", "frei"], ["requested", "angefragt – bitte bestätigen"], ["offered", "angeboten – Schüler muss zusagen"], ["confirmed", "bestätigt"], ["done", "gefahren ✓ / vergangen"]]),
    grid,
  );
}

const WEEKDAYS = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"];
const weekdayIndex = (d) => (new Date(d).getDay() + 6) % 7; // Montag = 0

// Neue Termine an Datenbank senden – Termine, die es zur selben Zeit schon gibt, werden übersprungen
async function insertSlots(list) {
  if (!list.length) throw new Error("Keine Termine ausgewählt");
  const times = list.map((x) => new Date(x.starts_at).getTime());
  const { data: existing, error: e1 } = await sb.from("slots").select("starts_at")
    .gte("starts_at", new Date(Math.min(...times)).toISOString())
    .lte("starts_at", new Date(Math.max(...times)).toISOString());
  if (e1) throw e1;
  const taken = new Set((existing || []).map((x) => new Date(x.starts_at).getTime()));
  const fresh = list.filter((x) => !taken.has(new Date(x.starts_at).getTime()));
  let rows = [];
  if (fresh.length) {
    const { data, error } = await sb.from("slots").insert(fresh).select("id,starts_at,duration_min");
    if (error) throw error;
    rows = data || [];
  }
  return { added: fresh.length, skipped: list.length - fresh.length, rows };
}
const insertedMsg = ({ added, skipped }) =>
  `${added} Termin${added === 1 ? "" : "e"} freigegeben` + (skipped ? ` (${skipped} gab es schon)` : "") + ".";

function newSlotForm(opts = {}) {
  const date = el("input", { type: "date", value: dateInput(new Date()) });
  const dur = durationControl(state.settings.default_duration);
  // Wiederholen: aus = genau ein Tag; an = gewählte Wochentage bis zum Enddatum
  const repeat = el("input", { type: "checkbox" });
  const until = el("input", { type: "date", value: dateInput(addDays(new Date(), 27)) });
  const repeatBox = el("div", { class: "repeat-box", hidden: true });
  const preview = el("p", { class: "small", style: "margin-top:12px" });
  const btn = el("button", { class: "btn" }, "Termine freigeben");

  // Freigeben (für alle) oder direkt einem Schüler zuordnen
  let mode = "free", student = null, students = null;
  const reply = el("textarea", { maxlength: 1000, placeholder: "Hinweis an den Schüler (optional), z. B. „Prüfungsvorbereitung – Treffpunkt Fahrschule“" });
  const search = el("input", { type: "search", placeholder: "Schüler suchen …" });
  const studentList = el("div", { class: "pick-list" });
  const how = assignHow();
  how.onChange(() => refresh());
  const assignBox = el("div", { hidden: true },
    el("label", {}, "Welchem Schüler?"), search, studentList, how.node,
    el("label", {}, "Hinweis an den Schüler"), reply);
  const modeBtns = [["free", "🟢 Freigeben (für alle)"], ["assign", "👤 Einem Schüler zuordnen"]].map(([m, text]) =>
    el("button", { type: "button", class: "tab" + (m === mode ? " active" : ""), onclick: () => setMode(m) }, text));
  async function setMode(m) {
    mode = m;
    modeBtns.forEach((b, i) => b.classList.toggle("active", ["free", "assign"][i] === m));
    assignBox.hidden = m !== "assign";
    if (m === "assign" && !students) {
      studentList.replaceChildren(el("p", { class: "muted small" }, "Lädt …"));
      const { data, error } = await sb.from("profiles").select("id,first_name,last_name,phone,license_class,needs_glasses,is_conversion")
        .eq("role", "student").eq("status", "active").order("last_name");
      if (error) return fail(error);
      students = data;
    }
    refresh();
  }
  function renderStudents() {
    if (!students) return;
    const q = search.value.trim().toLowerCase();
    const list = students.filter((st) => !q || fullName(st).toLowerCase().includes(q));
    studentList.replaceChildren(...(list.length ? list.map((st) => el("button", {
      type: "button", class: "pick" + (student && student.id === st.id ? " active" : ""),
      onclick: () => { student = st; refresh(); },
    }, el("b", {}, fullName(st)), " ", studentTags(st))) : [el("p", { class: "muted small" }, students.length ? "Kein Treffer." : "Noch keine freigeschalteten Schüler.")]));
  }
  search.addEventListener("input", renderStudents);

  // Wochentage
  const days = new Set([weekdayIndex(new Date())]);
  const dayBtns = WEEKDAYS.map((name, i) => el("button", { type: "button", class: "tab", onclick: () => { days.has(i) ? days.delete(i) : days.add(i); refresh(); } }, name));
  const setDays = (list) => { days.clear(); list.forEach((i) => days.add(i)); refresh(); };

  // Uhrzeiten: eine Reihe erzeugen (Beginn + Anzahl + Pause) und einzeln ergänzen/entfernen
  let times = ["08:00"];
  const first = el("input", { type: "time", value: "08:00", step: 300 });
  const count = el("input", { type: "number", min: 1, max: 10, value: 1 });
  const pause = el("input", { type: "number", min: 0, max: 240, step: 5, value: 0 });
  const extra = el("input", { type: "time", step: 300 });
  const timeChips = el("div", { class: "chips" });
  const toMin = (t) => { const [h, m] = t.split(":").map(Number); return h * 60 + m; };
  const fromMin = (m) => `${pad(Math.floor(m / 60) % 24)}:${pad(m % 60)}`;
  function makeRow() {
    if (!first.value) return;
    const n = Math.max(1, Math.min(10, +count.value || 1)), p = Math.max(0, +pause.value || 0);
    times = Array.from({ length: n }, (_, i) => fromMin(toMin(first.value) + i * (dur.value + p)));
    refresh();
  }
  [first, count, pause].forEach((i) => i.addEventListener("input", makeRow));
  dur.input.addEventListener("input", () => { if (+count.value > 1) makeRow(); });
  const addTime = el("button", { type: "button", class: "btn small ghost", onclick: () => {
    if (extra.value && !times.includes(extra.value)) { times.push(extra.value); times.sort(); extra.value = ""; refresh(); }
  } }, "+ Uhrzeit hinzufügen");

  function build() {
    const start = fromInputs(date.value, "00:00");
    if (isNaN(start)) return [];
    const now = Date.now(), list = [];
    let end = start;
    if (repeat.checked) {
      end = fromInputs(until.value, "00:00");
      if (isNaN(end) || end < start) return [];
      const max = addDays(start, 26 * 7);              // höchstens ein halbes Jahr auf einmal
      if (end > max) end = max;
    }
    for (let day = start; day <= end; day = addDays(day, 1)) {
      if (repeat.checked && !days.has(weekdayIndex(day))) continue;
      for (const t of times) {
        const at = fromInputs(dateInput(day), t);
        if (at.getTime() > now) list.push({ starts_at: at.toISOString(), duration_min: dur.value });
      }
    }
    return list;
  }
  function refresh() {
    renderStudents();
    btn.textContent = mode === "assign" ? (student ? (how.offer() ? `📨 ${student.first_name || fullName(student)} anbieten` : `Für ${fullName(student)} fest eintragen`) : "Schüler wählen …") : "Termine freigeben";
    btn.className = "btn" + (mode === "assign" ? " ok" : "");
    dayBtns.forEach((b, i) => b.classList.toggle("active", days.has(i)));
    timeChips.replaceChildren(...times.map((t) => el("span", { class: "tag", style: "font-size:14px;padding:4px 8px" },
      `${t} – ${fromMin(toMin(t) + dur.value)} `,
      el("button", { type: "button", class: "close", style: "font-size:16px", "aria-label": "Uhrzeit entfernen", onclick: () => { times = times.filter((x) => x !== t); refresh(); } }, "×"))));
    const list = build();
    preview.replaceChildren(list.length
      ? el("span", {}, el("b", {}, `${list.length} Termin${list.length > 1 ? "e" : ""}`),
        repeat.checked
          ? ` · jeden ${[...days].sort().map((i) => WEEKDAYS[i]).join(", ")} · ${times.length} pro Tag · ${fmtDay(list[0].starts_at)} bis ${fmtDay(list[list.length - 1].starts_at)}`
          : ` · ${fmtDate(list[0].starts_at)} · ${times.map((t) => t + " Uhr").join(", ")}`)
      : el("span", { class: "muted" }, "Noch keine Termine – Wochentage und Uhrzeiten wählen."));
  }
  [date, until].forEach((i) => i.addEventListener("input", refresh));
  date.addEventListener("input", () => { if (!repeat.checked) { days.clear(); days.add(weekdayIndex(fromInputs(date.value, "00:00"))); } });
  repeat.addEventListener("change", () => {
    repeatBox.hidden = !repeat.checked;
    // Beim Einschalten: Wochentag des gewählten Datums vorauswählen (weitere Tage dazu antippen)
    if (repeat.checked) setDays([weekdayIndex(fromInputs(date.value, "00:00"))]);
    refresh();
  });
  const untilIn = (w) => { until.value = dateInput(addDays(fromInputs(date.value, "00:00"), w * 7 - 1)); refresh(); };
  dur.input.addEventListener("input", refresh);

  btn.onclick = () => busy(btn, async () => {
    const list = build();
    if (mode === "assign" && !student) throw new Error("Bitte einen Schüler auswählen");
    const res = await insertSlots(list);
    state.weekStart = startOfWeek(new Date(list[0].starts_at));
    if (mode === "free") { toast(insertedMsg(res)); closeModal(); render(); return; }
    // Zuordnen: dem Schüler anbieten (er sagt zu/ab) oder gleich fest eintragen
    if (!res.rows.length) throw new Error("Alle diese Termine gibt es schon – nichts eingetragen.");
    const note = reply.value.trim() || null;
    const kind = how.offer() ? "offered" : "confirmed";
    const { error } = await sb.from("bookings").insert(res.rows.map((r) => ({
      slot_id: r.id, student_id: student.id, status: kind, admin_reply: note, decided_at: new Date().toISOString(),
    })));
    if (error) throw error;
    const lines = res.rows.map((r) => `• ${fmtDay(r.starts_at)} ${fmtRange(r.starts_at, r.duration_min)}`).join("\n");
    const n = res.rows.length, pl = n === 1 ? "" : "n";
    const text = kind === "offered"
      ? `Hallo ${student.first_name || ""}, ich biete dir folgende Fahrstunde${pl} an:\n${lines}` + (note ? `\n${note}` : "") +
        `\n\nBitte schau in die App und sag zu oder ab: ${appLink()}\n\n` + teacherSignature()
      : `Hallo ${student.first_name || ""}, ich habe dir folgende Fahrstunde${pl} eingetragen:\n${lines}` + (note ? `\n${note}` : "") +
        `\n\nZur App: ${appLink()}\n\n` + teacherSignature();
    notifyStep(`${n} Fahrstunde${pl} ${kind === "offered" ? "angeboten" : "eingetragen"} – ${fullName(student)}` + (res.skipped ? ` (${res.skipped} gab es schon)` : ""),
      student.phone, text);
  });

  refresh();
  const node = el("div", { class: opts.inModal ? "" : "card" },
    opts.inModal ? null : el("h3", {}, "Neue Fahrstunden anlegen"),
    el("div", { class: "tabs", style: "flex-wrap:wrap" }, modeBtns),
    assignBox,
    el("label", {}, "Datum"), date,
    el("label", { class: "check repeat-toggle" }, repeat, el("span", {}, el("b", {}, "🔁 Wiederholen"), " – an bestimmten Wochentagen, z. B. jeden Mo und Mi")),
    repeatBox,
    el("label", {}, `Dauer pro Termin (Standard: ${state.settings.default_duration} Min.)`), dur.node,
    el("label", {}, "Uhrzeiten pro Tag"),
    el("div", { class: "row" },
      el("div", {}, el("label", {}, "Erster Termin um"), first),
      el("div", {}, el("label", {}, "Termine hintereinander"), count),
      el("div", {}, el("label", {}, "Pause dazwischen (Min.)"), pause)),
    timeChips,
    el("div", { class: "done-row" }, el("span", { style: "width:130px" }, extra), addTime),
    preview,
    el("div", { class: "actions" }, btn),
  );
  repeatBox.append(
    el("label", {}, "An welchen Tagen?"),
    el("div", { class: "tabs", style: "margin-bottom:6px;flex-wrap:wrap" }, dayBtns),
    el("div", { class: "chips" },
      el("button", { type: "button", class: "btn small ghost", onclick: () => setDays([0, 1, 2, 3, 4]) }, "Mo–Fr"),
      el("button", { type: "button", class: "btn small ghost", onclick: () => setDays([0, 1, 2, 3, 4, 5]) }, "Mo–Sa"),
      el("button", { type: "button", class: "btn small ghost", onclick: () => setDays([0, 1, 2, 3, 4, 5, 6]) }, "Jeden Tag")),
    el("label", {}, "Wiederholen bis einschließlich"), until,
    el("div", { class: "chips" },
      [2, 4, 8, 12].map((w) => el("button", { type: "button", class: "btn small ghost", onclick: () => untilIn(w) }, `${w} Wochen`))));
  return { node, setDate: (d) => { date.value = dateInput(d); setDays([weekdayIndex(d)]); refresh(); } };
}

async function openAdminSlot(slotId) {
  const { data: slot, error } = await sb.from("slots")
    .select("id,starts_at,duration_min,bookings(id,status,student_note,admin_reply,actual_minutes,cancel_reason,late_cancel,lesson_type,created_at,decided_at,profiles(first_name,last_name,license_class,needs_glasses,is_conversion,phone))")
    .eq("id", slotId).single();
  if (error) return fail(error);

  const b = activeBooking(slot);
  const history = (slot.bookings || []).filter((x) => x !== b).sort((x, y) => x.created_at.localeCompare(y.created_at));

  const date = el("input", { type: "date", value: dateInput(slot.starts_at) });
  const time = el("input", { type: "time", value: timeInput(slot.starts_at), step: 300 });
  const dur = durationControl(slot.duration_min);
  const timeFields = el("div", {},
    el("div", { class: "row" },
      el("div", {}, el("label", {}, "Datum"), date),
      el("div", {}, el("label", {}, "Beginn"), time)),
    el("label", {}, "Dauer"), dur.node);

  const timeChanged = () => fromInputs(date.value, time.value).getTime() !== new Date(slot.starts_at).getTime() || dur.value !== slot.duration_min;
  async function saveTime() {
    if (!timeChanged()) return;
    const start = fromInputs(date.value, time.value);
    if (isNaN(start)) throw new Error("Ungültiges Datum/Uhrzeit");
    const { error } = await sb.from("slots").update({ starts_at: start.toISOString(), duration_min: dur.value }).eq("id", slot.id);
    if (error) throw error;
  }
  const done = (msg) => { toast(msg); closeModal(); render(); };

  const parts = [];
  if (!b) {
    const save = el("button", { class: "btn" }, "Zeit speichern");
    save.onclick = () => busy(save, async () => { await saveTime(); done("Gespeichert."); });
    const del = el("button", { class: "btn danger" }, "Termin löschen");
    del.onclick = () => busy(del, async () => {
      if (!confirm("Diesen freien Termin wirklich löschen?")) return;
      const { error } = await sb.from("slots").delete().eq("id", slot.id);
      if (error) throw error;
      done("Termin gelöscht.");
    });
    parts.push(el("p", {}, el("span", { class: "badge confirmed", style: "background:var(--free-bg);color:var(--free-fg);border-color:var(--free-bd)" }, "Frei")),
      timeFields, el("div", { class: "actions" }, save, del), el("hr"), await bookForStudentForm(slot, saveTime));
  } else {
    const reply = el("textarea", { maxlength: 1000, placeholder: "z. B. Bitte Ausweis und Brille mitbringen. Treffpunkt: Bahnhof Haupteingang." }, b.admin_reply || "");
    parts.push(
      el("p", {}, el("b", {}, fullName(b.profiles)), " ", el("span", { class: "badge " + b.status }, STATUS_TEXT[b.status]), " ", studentTags(b.profiles)),
      b.student_note ? el("div", { class: "note" }, "Nachricht vom Schüler: ", b.student_note) : el("p", { class: "muted small" }, "Keine Nachricht vom Schüler."),
    );
    if (b.status === "confirmed") parts.push(el("hr"), doneControls(slot, b, done), el("hr"), el("h3", {}, "Termin & Hinweis"));
    parts.push(
      timeFields,
      el("label", {}, "Deine Antwort / Hinweis an den Schüler"), reply,
    );

    if (b.status === "offered") {
      const remind = waButton(b.profiles && b.profiles.phone, waTextForStudent("offered", b.profiles, slot, reply.value.trim()), "💬 Erinnern per WhatsApp");
      const withdraw = el("button", { class: "btn danger" }, "Angebot zurückziehen");
      withdraw.onclick = () => busy(withdraw, async () => {
        if (!confirm("Angebot zurückziehen? Der Termin wird wieder frei.")) return;
        const { error } = await sb.from("bookings").delete().eq("id", b.id);
        if (error) throw error;
        done("Angebot zurückgezogen – Termin ist wieder frei.");
      });
      parts.push(el("div", { class: "notice" }, "Der Schüler muss in der App zusagen oder absagen."), el("div", { class: "actions" }, remind, withdraw));
    } else if (b.status === "requested") {
      const ok = el("button", { class: "btn ok" }, "✓ Bestätigen");
      ok.onclick = () => busy(ok, async () => {
        await saveTime();
        const { error } = await sb.from("bookings").update({ status: "confirmed", admin_reply: reply.value.trim() || null, decided_at: new Date().toISOString() }).eq("id", b.id);
        if (error) throw error;
        const newSlot = { starts_at: fromInputs(date.value, time.value).toISOString(), duration_min: dur.value };
        notifyStep("Fahrstunde bestätigt", b.profiles && b.profiles.phone, waTextForStudent("confirmed", b.profiles, newSlot, reply.value.trim()));
      });
      const no = el("button", { class: "btn danger" }, "Ablehnen");
      no.onclick = () => busy(no, async () => {
        if (!confirm("Anfrage ablehnen? Der Termin wird danach wieder frei.")) return;
        const { error } = await sb.from("bookings").update({ status: "rejected", admin_reply: reply.value.trim() || null, decided_at: new Date().toISOString() }).eq("id", b.id);
        if (error) throw error;
        notifyStep("Anfrage abgelehnt – Termin ist wieder frei", b.profiles && b.profiles.phone, waTextForStudent("rejected", b.profiles, slot, reply.value.trim()));
      });
      parts.push(el("div", { class: "actions" }, ok, no));
    } else {
      const save = el("button", { class: "btn" }, "Änderungen speichern");
      save.onclick = () => busy(save, async () => {
        await saveTime();
        const { error } = await sb.from("bookings").update({ admin_reply: reply.value.trim() || null }).eq("id", b.id);
        if (error) throw error;
        done("Gespeichert.");
      });
      parts.push(el("div", { class: "actions" }, save));
    }
  }

  if (history.length) {
    parts.push(el("hr"), el("p", { class: "muted small" }, "Frühere Anfragen zu diesem Termin:"),
      history.map((h) => {
        // Versehentlich als „nicht gefahren“ markiert? Solange der Termin frei ist, lässt es sich zurücknehmen.
        const undo = NOT_HELD_ICON[h.status] && !b ? el("button", { class: "btn small ghost" }, "Rückgängig") : null;
        if (undo) undo.onclick = () => busy(undo, async () => {
          const { error } = await sb.from("bookings").update({ status: "confirmed", cancel_reason: null, late_cancel: false }).eq("id", h.id);
          if (error) throw error;
          done("Zurückgenommen – Fahrstunde ist wieder bestätigt.");
        });
        return el("div", { class: "list-item small" },
          el("div", { class: "done-row", style: "margin:0" }, el("b", {}, fullName(h.profiles)), el("span", { class: "badge " + h.status }, STATUS_TEXT[h.status]),
            h.late_cancel ? el("span", { class: "badge late" }, "Fehlstunde – kostenpflichtig") : null, undo),
          h.cancel_reason ? el("div", { class: "note" }, "Grund: ", h.cancel_reason) : null);
      }));
  }

  openModal(`${fmtDate(slot.starts_at)}, ${fmtRange(slot.starts_at, slot.duration_min)}`, ...parts);
}

// Admin trägt einen Schüler direkt (bestätigt) in einen freien Termin ein – z. B. nach telefonischer Absprache
// Auswahl: dem Schüler anbieten (er muss zusagen) oder direkt fest eintragen
function assignHow() {
  const name = "how-" + Math.random().toString(36).slice(2);
  const offer = el("input", { type: "radio", name, value: "offer" });
  const fix = el("input", { type: "radio", name, value: "fix" });
  offer.checked = true;
  return {
    node: el("div", {},
      el("label", { class: "check" }, offer, el("span", {}, el("b", {}, "Anbieten"), " – der Schüler sagt in der App zu oder ab")),
      el("label", { class: "check" }, fix, el("span", {}, el("b", {}, "Fest eintragen"), " – sofort bestätigt (z. B. nach Telefonat)"))),
    offer: () => offer.checked,
    onChange: (fn) => [offer, fix].forEach((r) => r.addEventListener("change", fn)),
  };
}

async function bookForStudentForm(slot, saveTime) {
  const { data: students, error } = await sb.from("profiles")
    .select("id,first_name,last_name,phone,license_class,needs_glasses,is_conversion")
    .eq("role", "student").eq("status", "active").order("last_name");
  if (error) throw error;
  if (!students.length) return el("p", { class: "muted small" }, "Noch keine freigeschalteten Schüler zum Eintragen.");
  const who = el("select", {}, el("option", { value: "" }, "Schüler wählen …"),
    students.map((st) => el("option", { value: st.id }, fullName(st) + (st.license_class ? ` (${st.license_class})` : ""))));
  const reply = el("textarea", { maxlength: 1000, placeholder: "Hinweis an den Schüler (optional), z. B. Treffpunkt" });
  const how = assignHow();
  const btn = el("button", { class: "btn ok" }, "Senden");
  const label = () => (btn.textContent = how.offer() ? "📨 Anbieten" : "✓ Fest eintragen");
  how.onChange(label); label();
  btn.onclick = () => busy(btn, async () => {
    const st = students.find((x) => x.id === who.value);
    if (!st) throw new Error("Bitte einen Schüler wählen");
    await saveTime();
    const kind = how.offer() ? "offered" : "confirmed";
    const { error } = await sb.from("bookings").insert({
      slot_id: slot.id, student_id: st.id, status: kind,
      admin_reply: reply.value.trim() || null, decided_at: new Date().toISOString(),
    });
    if (error) throw new Error(error.code === "23505" ? "Der Termin wurde gerade schon vergeben." : error.message);
    const { data: fresh } = await sb.from("slots").select("starts_at,duration_min").eq("id", slot.id).single();
    notifyStep(kind === "offered" ? `Angebot an ${fullName(st)} gespeichert` : `${fullName(st)} eingetragen`,
      st.phone, waTextForStudent(kind, st, fresh || slot, reply.value.trim()));
  });
  return el("div", {},
    el("h3", {}, "Einem Schüler anbieten oder eintragen"),
    who, how.node, el("label", {}, "Hinweis"), reply, el("div", { class: "actions" }, btn));
}

// Ergebnis einer bestätigten Fahrstunde: gefahren (mit Minuten) – oder warum sie nicht zustande kam
function doneControls(slot, b, after, opts = {}) {
  const isDone = b.actual_minutes !== null;
  const mins = durationControl(isDone ? b.actual_minutes : slot.duration_min, { fine: true });
  // Art der Fahrt (Sonderfahrten für den Ausbildungsnachweis)
  let type = b.lesson_type || "normal";
  const typeBtns = Object.keys(LESSON_TYPES).map((t) => el("button", {
    type: "button", class: "tab" + (t === type ? " active" : ""),
    onclick: (e) => { type = t; typeBtns.forEach((x) => x.classList.toggle("active", x === e.currentTarget)); },
  }, typeLabel(t)));
  const check = el("button", { class: "btn ok" }, isDone ? "✓ Speichern" : "✓ Gefahren – abhaken");
  check.onclick = () => busy(check, async () => {
    const { error } = await sb.from("bookings").update({ actual_minutes: mins.value, lesson_type: type }).eq("id", b.id);
    if (error) throw error;
    after(`✓ Abgehakt: ${fmtMinutes(mins.value)} ${LESSON_TYPES[type]}`);
  });
  const undo = el("button", { class: "btn ghost" }, "Haken entfernen");
  undo.onclick = () => busy(undo, async () => {
    const { error } = await sb.from("bookings").update({ actual_minutes: null }).eq("id", b.id);
    if (error) throw error;
    after("Haken entfernt.");
  });

  // „Nicht gefahren“: Grund ankreuzen, optional Text, Fehlstunde ja/nein
  const group = "why-" + b.id;
  const radios = NOT_HELD.map(([value, text]) => {
    const r = el("input", { type: "radio", name: group, value });
    return { r, node: el("label", { class: "check" }, r, text) };
  });
  const reason = el("input", { maxlength: 300, placeholder: "Grund / Notiz (optional), z. B. „Erkältung“" });
  const late = el("input", { type: "checkbox" });
  late.checked = isLate(slot.starts_at);
  const lateWrap = el("label", { class: "check" }, late, "Fehlstunde – kostenpflichtig",
    el("span", { class: "muted small" }, ` (Frist: ${fmtDeadline(slot.starts_at)})`));
  const chosen = () => (radios.find((x) => x.r.checked) || {}).r;
  radios.forEach((x) => x.r.addEventListener("change", () => (lateWrap.hidden = chosen().value === "cancelled_teacher")));
  const saveNo = el("button", { class: "btn danger" }, "Speichern – nicht gefahren");
  saveNo.onclick = () => busy(saveNo, async () => {
    const r = chosen();
    if (!r) throw new Error("Bitte einen Grund ankreuzen");
    const isLateCancel = r.value !== "cancelled_teacher" && late.checked;
    const { error } = await sb.from("bookings").update({
      status: r.value, cancel_reason: reason.value.trim() || null, late_cancel: isLateCancel,
      actual_minutes: null, decided_at: new Date().toISOString(),
    }).eq("id", b.id);
    if (error) throw error;
    if (r.value === "cancelled_teacher") {
      notifyStep("Fahrstunde abgesagt", b.profiles && b.profiles.phone, waTextForStudent("cancelled_teacher", b.profiles, slot, reason.value.trim()));
    } else after(`Gespeichert: ${STATUS_TEXT[r.value]}${isLateCancel ? " (Fehlstunde)" : ""}.`);
  });
  const notHeld = el("details", { class: "nothere" },
    el("summary", {}, "✗ Nicht gefahren …"),
    radios.map((x) => x.node), reason, lateWrap,
    el("div", { class: "actions" }, saveNo));

  return el("div", {},
    opts.compact ? null : el("h3", {}, isDone ? `✓ Gefahren: ${fmtMinutes(b.actual_minutes)}` : "Ergebnis der Fahrstunde"),
    opts.compact ? null : el("p", { class: "muted small" }, isDone
      ? "Erledigt. Falls nötig, Minuten korrigieren oder den Haken entfernen."
      : "Geplant waren " + slot.duration_min + " Min. Kürzer oder länger gefahren? Minuten anpassen, dann abhaken."),
    mins.node,
    el("div", { class: "tabs", style: "margin:10px 0 0;flex-wrap:wrap" }, typeBtns),
    el("div", { class: "actions" }, check, isDone ? undo : null),
    isDone ? null : notHeld);
}

/* ---------------- Ausbildungsstand ---------------- */

const STAGES = [
  ["grund", "Grundstufe"], ["aufbau", "Aufbaustufe"], ["leistung", "Leistungsstufe"],
  ["grundfahr", "Grundfahraufgaben"], ["sonder", "Besondere Ausbildungsfahrten"],
  ["reife", "Reife- und Teststufe"], ["eigene", "Eigene Themen & Strecken"],
];
const LEVELS = ["offen", "eingeführt", "geübt", "sicher"];
// Sonderfahrt-Thema ↔ Fahrt-Art beim Abhaken (zeigt, wie oft schon gefahren)
const TOPIC_LESSON = { s01: "ueberland", s02: "autobahn", s03: "nacht" };

// Ausbildungsstand eines Schülers: editable = Fahrlehrer (antippen), sonst nur ansehen
async function trainingView(student, editable, lessons) {
  const [t, p] = await Promise.all([
    sb.from("training_topics").select("id,stage,sort,title").order("sort"),
    sb.from("training_progress").select("topic_id,level,updated_at").eq("student_id", student.id),
  ]);
  if (t.error) throw t.error;
  if (p.error) throw p.error;
  const level = Object.fromEntries(p.data.map((x) => [x.topic_id, x.level]));
  const topics = t.data;
  const done = (lessons || []).filter((b) => b.status === "confirmed" && b.actual_minutes !== null);
  const total = el("div", {});
  const stageBars = {};

  function percent(list) {
    if (!list.length) return 0;
    return Math.round((list.reduce((sum, x) => sum + (level[x.id] || 0), 0) / (list.length * 3)) * 100);
  }
  function updateBars() {
    const pc = percent(topics);
    total.replaceChildren(
      el("div", { class: "done-row", style: "justify-content:space-between;margin:0" },
        el("b", {}, `Gesamt: ${pc} %`),
        el("span", { class: "small muted" }, `${topics.filter((x) => level[x.id] === 3).length} von ${topics.length} Themen sicher`)),
      el("div", { class: "bar" }, el("i", { style: `width:${pc}%` })));
    for (const [stage, node] of Object.entries(stageBars)) {
      const pcs = percent(topics.filter((x) => x.stage === stage));
      node.replaceChildren(el("i", { style: `width:${pcs}%` }));
      node.title = pcs + " %";
    }
  }

  function row(topic) {
    const dots = el("span", { class: "lv" });
    const label = el("span", { class: "small muted lv-text" });
    const paint = () => {
      const l = level[topic.id] || 0;
      dots.replaceChildren(...[1, 2, 3].map((n) => el("i", { class: n <= l ? "on l" + l : "" })));
      label.textContent = LEVELS[l];
    };
    paint();
    const lt = TOPIC_LESSON[topic.id];
    const count = lt ? done.filter((b) => b.lesson_type === lt) : null;
    const info = count ? el("span", { class: "small muted" }, ` · ${count.length}× gefahren (${count.reduce((s2, b) => s2 + b.actual_minutes, 0)} Min.)`) : null;
    const attrs = { class: "topic" + (editable ? " editable" : "") };
    if (editable) {
      attrs.title = "Antippen: offen → eingeführt → geübt → sicher";
      attrs.onclick = async () => {
        const old = level[topic.id] || 0, next = (old + 1) % 4;
        level[topic.id] = next; paint(); updateBars();
        const { error } = next === 0
          ? await sb.from("training_progress").delete().eq("student_id", student.id).eq("topic_id", topic.id)
          : await sb.from("training_progress").upsert({ student_id: student.id, topic_id: topic.id, level: next, updated_at: new Date().toISOString() });
        if (error) { level[topic.id] = old; paint(); updateBars(); fail(error); }
      };
    }
    return el(editable ? "button" : "div", attrs, el("span", { class: "topic-title" }, topic.title, info), el("span", { class: "lv-wrap" }, label, dots));
  }

  const sections = STAGES.map(([stage, name]) => {
    const list = topics.filter((x) => x.stage === stage);
    if (!list.length) return null;
    stageBars[stage] = el("div", { class: "bar small" });
    return el("div", { class: "stage" },
      el("div", { class: "stage-head" }, el("h4", {}, name), stageBars[stage]),
      list.map(row));
  });
  updateBars();
  return el("div", { class: "training" },
    total,
    el("div", { class: "lv-legend small muted" },
      [1, 2, 3].map((n) => el("span", {}, el("span", { class: "lv" }, [1, 2, 3].map((k) => el("i", { class: k <= n ? "on l" + n : "" }))), " " + LEVELS[n])),
      editable ? el("span", {}, "· Thema antippen, um die Stufe zu ändern") : null),
    sections);
}

async function openTraining(st, lessons) {
  openModal("📈 Ausbildungsstand – " + fullName(st), el("p", { class: "muted" }, "Lädt …"));
  try {
    const view = await trainingView(st, true, lessons);
    openModal("📈 Ausbildungsstand – " + fullName(st), view,
      el("div", { class: "actions" }, el("button", { class: "btn ghost", onclick: () => openStudent(st) }, "‹ Zurück zum Schüler")));
  } catch (e) { fail(e); }
}

/* ---------------- Admin: Anfragen ---------------- */

async function adminRequests() {
  const weekAgo = addDays(new Date(), -7).toISOString();
  const [req, open, cancels, offers] = await Promise.all([
    sb.from("bookings").select("id,student_note,created_at,profiles(first_name,last_name,license_class,needs_glasses,is_conversion),slots(id,starts_at,duration_min)").eq("status", "requested").order("created_at"),
    sb.from("bookings").select("id,lesson_type,profiles(first_name,last_name,license_class,needs_glasses,is_conversion,phone),slots(id,starts_at,duration_min)").eq("status", "confirmed").is("actual_minutes", null),
    sb.from("bookings").select("id,cancel_reason,late_cancel,decided_at,profiles(first_name,last_name,license_class,needs_glasses,is_conversion),slots(id,starts_at,duration_min)")
      .in("status", ["cancelled_student", "declined"]).gte("decided_at", weekAgo).order("decided_at", { ascending: false }),
    sb.from("bookings").select("id,admin_reply,profiles(first_name,last_name,license_class,needs_glasses,is_conversion,phone),slots(id,starts_at,duration_min)")
      .eq("status", "offered"),
  ]);
  if (offers.error) throw offers.error;
  if (req.error) throw req.error;
  if (open.error) throw open.error;
  if (cancels.error) throw cancels.error;

  const now = Date.now();
  const missing = open.data.filter((b) => b.slots && addMin(b.slots.starts_at, b.slots.duration_min).getTime() < now)
    .sort((a, b) => a.slots.starts_at.localeCompare(b.slots.starts_at));

  const item = (b, extra) => el("div", { class: "list-item" },
    el("div", { class: "head" },
      el("div", {}, el("b", {}, fullName(b.profiles)), " ", studentTags(b.profiles), el("div", { class: "small muted" }, `${fmtDate(b.slots.starts_at)}, ${fmtRange(b.slots.starts_at, b.slots.duration_min)}`)),
      el("button", { class: "btn small", onclick: () => openAdminSlot(b.slots.id) }, "Öffnen")),
    extra);

  return el("div", {},
    el("h2", {}, "Offene Anfragen"),
    req.data.length ? req.data.filter((b) => b.slots).map((b) => item(b, b.student_note ? el("div", { class: "note" }, b.student_note) : null))
      : el("p", { class: "muted" }, "Keine offenen Anfragen. 👍"),
    cancels.data.length ? [
      el("h2", { style: "margin-top:24px" }, "Absagen & abgelehnte Angebote (letzte 7 Tage)"),
      cancels.data.filter((b) => b.slots).map((b) => item(b, [
        b.status === "declined" ? el("span", { class: "badge declined" }, "Angebot abgelehnt") :
        b.late_cancel ? el("span", { class: "badge late" }, "Fehlstunde – kostenpflichtig") : el("span", { class: "badge rejected" }, "rechtzeitig"),
        b.cancel_reason ? el("div", { class: "note" }, "Grund: ", b.cancel_reason) : null,
      ])),
    ] : null,
    offers.data.length ? [
      el("h2", { style: "margin-top:24px" }, "Angebote – warten auf Zusage"),
      offers.data.filter((b) => b.slots).sort((a, b) => a.slots.starts_at.localeCompare(b.slots.starts_at)).map((b) =>
        item(b, waButton(b.profiles && b.profiles.phone, waTextForStudent("offered", b.profiles, b.slots, b.admin_reply), "💬 Erinnern"))),
    ] : null,
    el("h2", { style: "margin-top:24px" }, "Noch abzuhaken"),
    el("p", { class: "muted small" }, "Vergangene Fahrstunden: Minuten prüfen und abhaken – oder als krank abgesagt markieren."),
    missing.length ? missing.map((b) => item(b, doneControls(b.slots, b, (msg) => { toast(msg); render(); }, { compact: true })))
      : el("p", { class: "muted" }, "Alles abgehakt. 👍"),
  );
}

/* ---------------- Admin: Schüler ---------------- */

async function adminStudents() {
  const [p, b] = await Promise.all([
    sb.from("profiles").select("id,first_name,last_name,email,phone,license_class,needs_glasses,is_conversion,max_open,role,status,created_at").order("last_name"),
    sb.from("bookings").select("student_id,status,actual_minutes,late_cancel,lesson_type"),
  ]);
  if (p.error) throw p.error;
  if (b.error) throw b.error;

  const stats = {};
  for (const x of b.data) {
    const s = (stats[x.student_id] ||= { done: 0, minutes: 0, upcoming: 0, open: 0, notHeld: 0, late: 0, special: {} });
    if (x.status === "confirmed" && x.actual_minutes !== null) {
      s.done++; s.minutes += x.actual_minutes;
      if (SPECIAL_TYPES.includes(x.lesson_type)) s.special[x.lesson_type] = (s.special[x.lesson_type] || 0) + 1;
    }
    else if (x.status === "confirmed") s.upcoming++;
    else if (x.status === "requested") s.open++;
    else if (NOT_HELD_ICON[x.status]) { s.notHeld++; if (x.late_cancel) s.late++; }
  }
  const students = p.data.filter((x) => x.role === "student");
  const pending = students.filter((x) => x.status === "pending");
  const active = students.filter((x) => x.status === "active");
  const blocked = students.filter((x) => x.status === "blocked");
  if (!students.length) return el("p", { class: "muted" }, "Noch keine Schüler registriert. Schicke ihnen den Link aus den Einstellungen.");

  const table = (list) => el("div", { style: "overflow-x:auto" }, el("table", {},
    el("thead", {}, el("tr", {}, el("th", {}, "Name"), el("th", {}, "Klasse"), el("th", { class: "num" }, "Termine"), el("th", { class: "num" }, "Gesamtzeit"), el("th", { class: "num", title: "1 Fahrstunde = 45 Min." }, "Fahrstd."), el("th", { class: "num" }, "Geplant"), el("th", {}, "Sonderfahrten"), el("th", { class: "num" }, "Ausgefallen"), el("th", { class: "num" }, "Fehlstd."), el("th", { title: "Darf mehr als den Standard anfragen" }, "Mehr erlauben"))),
    el("tbody", {}, list.map((st) => {
      const s = stats[st.id] || { done: 0, minutes: 0, upcoming: 0, open: 0, notHeld: 0, late: 0, special: {} };
      return el("tr", { class: "clickable", onclick: () => openStudent(st) },
        el("td", {}, fullName(st), st.needs_glasses ? " 👓" : "", st.is_conversion ? el("div", { class: "small muted" }, "Umschreiber") : null),
        el("td", {}, st.license_class || "–"), el("td", { class: "num" }, s.done), el("td", { class: "num" }, fmtMinutes(s.minutes)), el("td", { class: "num" }, fmtLessons(s.minutes).split(" ")[0]),
        el("td", { class: "num" }, s.upcoming + (s.open ? ` (+${s.open} angefragt)` : "")), el("td", { style: "white-space:nowrap" }, SPECIAL_TYPES.map((t) => `${LESSON_ICON[t]}${s.special[t] || 0}`).join(" ")),
        el("td", { class: "num" }, s.notHeld), el("td", { class: "num" }, s.late),
        el("td", { onclick: (e) => e.stopPropagation() }, moreToggle(st)));
    }))));

  return el("div", {},
    pending.length ? el("div", { class: "card" },
      el("h2", {}, "Neu angemeldet"),
      pending.map((st) => {
        const ok = el("button", { class: "btn small ok" }, "✓ Freischalten");
        ok.onclick = () => busy(ok, () => setStudentStatus(st, "active"));
        const del = el("button", { class: "btn small danger" }, "Ablehnen & löschen");
        del.onclick = () => busy(del, () => deleteStudent(st));
        return el("div", { class: "list-item" },
          el("div", { class: "head" },
            el("div", {}, el("b", {}, fullName(st)), " ", studentTags(st), el("div", { class: "small muted" }, st.email || "", " · registriert am ", fmtDay(st.created_at))),
            el("div", { class: "actions", style: "margin:0" }, ok, del)));
      })) : null,
    el("div", { class: "card" },
      el("h2", {}, "Aktive Schüler"),
      active.length ? table(active) : el("p", { class: "muted" }, "Noch keine freigeschalteten Schüler."),
      el("p", { class: "muted small" }, "Namen antippen für Fahrstunden, Ausbildungsstand und Daten.")),
    blocked.length ? el("div", { class: "card" },
      el("h2", {}, "Fertige Schüler"),
      table(blocked)) : null,
  );
}

async function setStudentStatus(st, status) {
  const { error } = await sb.from("profiles").update({ status }).eq("id", st.id);
  if (error) throw error;
  const msg = { active: "freigeschaltet", blocked: "als fertig markiert" }[status];
  toast(`${fullName(st)} wurde ${msg}.`);
  closeModal();
  render();
}

async function deleteStudent(st) {
  if (!confirm(`${fullName(st)} endgültig löschen?\n\nDas Konto und ALLE Fahrstunden-Einträge dieser Person werden gelöscht. Das kann nicht rückgängig gemacht werden.`)) return;
  const { error } = await sb.rpc("delete_student", { p_id: st.id });
  if (error) throw error;
  toast(`${fullName(st)} wurde gelöscht.`);
  closeModal();
  render();
}

// Schnell-Häkchen: Schüler darf unbegrenzt anfragen (an) oder nur den Standard (aus)
function moreToggle(st) {
  const box = el("input", { type: "checkbox", style: "width:20px;height:20px", "aria-label": `${fullName(st)} darf mehr anfragen` });
  box.checked = st.max_open === 0;
  const own = st.max_open > 0;
  box.addEventListener("change", async () => {
    const v = box.checked ? 0 : null;
    const { error } = await sb.from("profiles").update({ max_open: v }).eq("id", st.id);
    if (error) { box.checked = !box.checked; return fail(error); }
    st.max_open = v;
    hint.textContent = "";
    toast(box.checked ? `${fullName(st)} darf jetzt unbegrenzt anfragen.` : `${fullName(st)}: wieder Standard (${state.settings.max_open || "∞"}).`);
  });
  const hint = el("span", { class: "small muted" }, own ? ` ${st.max_open}` : "");
  return el("label", { class: "check", style: "margin:0;align-items:center" }, box, hint);
}

// Höchstzahl offener TERMINE (nicht Fahrstunden): null = Standard, 0 = unbegrenzt, sonst Zahl
const limitLabel = (v) => (v === null || v === undefined ? `Standard (${state.settings.max_open || "∞"})` : v === 0 ? "∞ unbegrenzt" : String(v));
function limitControl(st) {
  const name = "limit-" + st.id;
  const mk = (value, text) => { const r = el("input", { type: "radio", name, value }); return { r, node: el("label", { class: "check" }, r, text) }; };
  const std = mk("std", `Standard für alle (${state.settings.max_open || "unbegrenzt"})`);
  const own = mk("own", "Eigene Anzahl:");
  const inf = mk("inf", "Unbegrenzt (z. B. Prüfungsvorbereitung)");
  const num = el("input", { type: "number", min: 1, max: 50, value: st.max_open > 0 ? st.max_open : 5, style: "width:90px;margin-left:8px" });
  own.node.append(num);
  (st.max_open === null || st.max_open === undefined ? std : st.max_open === 0 ? inf : own).r.checked = true;
  num.addEventListener("focus", () => (own.r.checked = true));
  const save = el("button", { class: "btn small" }, "Speichern");
  save.onclick = () => busy(save, async () => {
    const v = std.r.checked ? null : inf.r.checked ? 0 : Math.max(1, Math.min(50, +num.value || 1));
    const { error } = await sb.from("profiles").update({ max_open: v }).eq("id", st.id);
    if (error) throw error;
    st.max_open = v;
    state.renderOnClose = true;
    toast(`${fullName(st)}: ${limitLabel(v)} offene Termine.`);
  });
  return el("div", {},
    el("h3", {}, "Wie viele Termine darf dieser Schüler gleichzeitig haben?"),
    el("p", { class: "muted small" }, "Gezählt werden Termine – egal wie lang: offene Anfragen + anstehende bestätigte Termine. Was du selbst einträgst, ist nie begrenzt."),
    std.node, own.node, inf.node, el("div", { class: "actions" }, save));
}

function openEditStudent(st) {
  const f = profileFields(st);
  const save = el("button", { class: "btn" }, "Speichern");
  save.onclick = () => busy(save, async () => {
    const v = f.values();
    if (!v.first_name || !v.last_name) throw new Error("Bitte Vor- und Nachnamen angeben");
    const { error } = await sb.from("profiles").update(v).eq("id", st.id);
    if (error) throw error;
    toast("Gespeichert.");
    Object.assign(st, v);
    openStudent(st);
  });
  openModal("Daten bearbeiten – " + fullName(st), f.node,
    el("div", { class: "actions" }, save, el("button", { class: "btn ghost", onclick: () => openStudent(st) }, "Zurück")));
}

async function openStudent(st) {
  const { data, error } = await sb.from("bookings")
    .select("id,status,student_note,admin_reply,actual_minutes,cancel_reason,late_cancel,lesson_type,slots(id,starts_at,duration_min)").eq("student_id", st.id);
  if (error) return fail(error);
  const rows = data.filter((b) => b.slots).sort((a, b) => b.slots.starts_at.localeCompare(a.slots.starts_at));

  const block = el("button", { class: "btn ok" }, "🎓 Ausbildung abgeschlossen");
  block.onclick = () => busy(block, async () => {
    if (!confirm(`${fullName(st)} als fertig markieren? Er/sie kann danach keine Fahrstunden mehr buchen. Fahrstunden und Ausbildungsstand bleiben bei dir gespeichert.`)) return;
    await setStudentStatus(st, "blocked");
  });
  const unblock = el("button", { class: "btn ghost" }, "Wieder aktiv setzen");
  unblock.onclick = () => busy(unblock, () => setStudentStatus(st, "active"));
  const del = el("button", { class: "btn danger" }, "Endgültig löschen");
  del.onclick = () => busy(del, () => deleteStudent(st));
  const edit = el("button", { class: "btn small ghost", onclick: () => openEditStudent(st) }, "✏️ Daten bearbeiten");
  const training = el("button", { class: "btn small", onclick: () => { state.trainingStudent = st.id; closeModal(); setTimeout(() => goTab("training"), 50); } }, "📈 Ausbildungsstand");

  openModal(fullName(st),
    el("div", { class: "done-row" }, studentTags(st), training, edit),
    el("p", { class: "muted small" }, [st.email, st.phone].filter(Boolean).join(" · ")),
    el("div", { class: "done-row" }, waButton(st.phone, `Hallo ${st.first_name || ""},\n`, "💬 WhatsApp"), exportButtons(st, data)),
    el("p", { class: "small" }, specialSummary(data)),
    rows.length ? rows.map((b) => el("div", { class: "list-item clickable", onclick: () => openAdminSlot(b.slots.id) },
      el("div", { class: "head" },
        el("span", {}, `${fmtDay(b.slots.starts_at)} ${fmtRange(b.slots.starts_at, b.slots.duration_min)}`),
        el("span", { class: "badge " + b.status }, b.actual_minutes !== null ? "✓ Gefahren" : STATUS_TEXT[b.status])),
      b.actual_minutes !== null ? el("div", { class: "small" }, `Gefahren: ${fmtMinutes(b.actual_minutes)} · ${typeLabel(b.lesson_type)}`) : null,
      b.late_cancel ? el("span", { class: "badge late" }, "Fehlstunde – kostenpflichtig") : null,
      b.cancel_reason ? el("div", { class: "small muted" }, "Grund: ", b.cancel_reason) : null))
      : el("p", { class: "muted" }, "Noch keine Fahrstunden."),
    el("hr"),
    limitControl(st),
    el("hr"),
    el("h3", {}, "Ausbildung"),
    el("p", { class: "muted small" }, st.status === "blocked"
      ? "Fertig: kann keine Fahrstunden mehr buchen. Die Daten bleiben bei dir, bis du den Schüler löschst."
      : "Nach der Prüfung als fertig markieren – oder den Schüler mit allen Daten löschen."),
    el("div", { class: "actions" }, st.status === "blocked" ? unblock : block, del));
}

/* ---------------- Haupt-Admin: Fahrlehrer verwalten ---------------- */

const slugify = (t) => (t || "").toLowerCase()
  .replace(/ä/g, "ae").replace(/ö/g, "oe").replace(/ü/g, "ue").replace(/ß/g, "ss")
  .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 30);
function randomPassword() {
  const chars = "abcdefghjkmnpqrstuvwxyz23456789";
  const a = new Uint32Array(8);
  crypto.getRandomValues(a);
  return Array.from(a, (n) => chars[n % chars.length]).join("");
}
const appLink = () => location.origin + location.pathname;

async function ownerTeachers() {
  const { data: teachers, error } = await sb.from("profiles")
    .select("id,first_name,last_name,email,slug,status,is_owner,created_at").eq("role", "teacher").order("last_name");
  if (error) throw error;

  // Neuen Fahrlehrer anlegen
  const first = el("input", { autocomplete: "off" });
  const last = el("input", { autocomplete: "off" });
  const email = el("input", { type: "email", autocomplete: "off" });
  const pw = el("input", { value: randomPassword(), autocomplete: "off", minlength: 6 });
  const slug = el("input", { placeholder: "z. B. mehmet", autocomplete: "off" });
  let slugTouched = false;
  slug.addEventListener("input", () => (slugTouched = true));
  first.addEventListener("input", () => { if (!slugTouched) slug.value = slugify(first.value); });
  const linkPreview = el("div", { class: "small muted" });
  const updatePreview = () => (linkPreview.textContent = "Interne Kennung: " + (slugify(slug.value) || "…") + " · Alle nutzen denselben Link: " + appLink());
  [first, slug].forEach((i) => i.addEventListener("input", updatePreview));
  updatePreview();

  const btn = el("button", { class: "btn ok" }, "Fahrlehrer anlegen");
  btn.onclick = () => busy(btn, async () => {
    const v = { first: first.value.trim(), last: last.value.trim(), email: email.value.trim(), pw: pw.value, slug: slugify(slug.value) };
    if (!v.first || !v.last) throw new Error("Bitte Vor- und Nachnamen angeben");
    if (!v.email.includes("@")) throw new Error("Bitte eine gültige E-Mail angeben");
    if (v.pw.length < 6) throw new Error("Passwort: mindestens 6 Zeichen");
    if (v.slug.length < 2) throw new Error("Link-Kürzel: mindestens 2 Zeichen");
    if (teachers.some((t) => t.slug === v.slug)) throw new Error("Dieses Link-Kürzel ist schon vergeben");
    // Konto mit einem zweiten, unabhängigen Zugang anlegen – deine eigene Anmeldung bleibt bestehen
    const tmp = window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY,
      { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false, storageKey: "fsp-tmp" } });
    const { data: su, error: e1 } = await tmp.auth.signUp({ email: v.email, password: v.pw, options: { data: { first_name: v.first, last_name: v.last } } });
    if (e1) throw e1;
    if (!su.user || (su.user.identities && su.user.identities.length === 0)) throw new Error("Mit dieser E-Mail gibt es schon ein Konto.");
    const { error: e2 } = await sb.rpc("create_teacher", { p_id: su.user.id, p_slug: v.slug, p_first: v.first, p_last: v.last });
    if (e2) throw e2;
    showTeacherCredentials(v, !su.session);
  });

  const row = (t) => {
    const link = appLink() + "?l=" + t.slug;
    const toggle = el("button", { class: "btn small " + (t.status === "active" ? "danger" : "ok") }, t.status === "active" ? "Sperren" : "Freischalten");
    toggle.onclick = () => busy(toggle, async () => {
      if (t.status === "active" && !confirm(`${fullName(t)} sperren? Er und alle seine Schüler sehen dann nichts mehr, bis du ihn wieder freischaltest.`)) return;
      const { error } = await sb.rpc("set_teacher_status", { p_id: t.id, p_status: t.status === "active" ? "blocked" : "active" });
      if (error) throw error;
      render();
    });
    const pwBtn = el("button", { class: "btn small ghost", onclick: () => openTeacherPassword(t) }, "🔑 Neues Passwort");
    const del = el("button", { class: "btn small danger" }, "Löschen");
    del.onclick = () => busy(del, async () => {
      const typed = prompt(`ACHTUNG: ${fullName(t)} wird mit ALLEN seinen Schülern, Terminen und Fahrstunden endgültig gelöscht.\n\nZum Bestätigen den Vornamen „${t.first_name}“ eintippen:`);
      if (typed === null) return;
      if (typed.trim().toLowerCase() !== (t.first_name || "").toLowerCase()) throw new Error("Name stimmt nicht – nichts gelöscht.");
      const { error } = await sb.rpc("delete_teacher", { p_id: t.id });
      if (error) throw error;
      toast(`${fullName(t)} wurde gelöscht.`);
      render();
    });
    return el("div", { class: "list-item" },
      el("div", { class: "head" },
        el("div", {}, el("b", {}, fullName(t)), " ",
          t.is_owner ? el("span", { class: "badge admin" }, "Haupt-Admin") : null,
          t.status !== "active" ? el("span", { class: "badge rejected" }, "Gesperrt") : null,
          el("div", { class: "small muted" }, t.email || "")),
        t.is_owner ? null : el("div", { class: "actions", style: "margin:0" }, pwBtn, toggle, del)),
      el("div", { class: "done-row small" }, el("code", {}, link),
        el("button", { class: "btn small ghost", onclick: () => copyText(link, "Link kopiert.") }, "Kopieren")));
  };

  return el("div", {},
    el("div", { class: "card" },
      el("h2", {}, "Neuen Fahrlehrer anlegen"),
      el("p", { class: "muted small" }, "Der Fahrlehrer bekommt einen eigenen Bereich mit eigenen Schülern, Terminen und Einstellungen. Du siehst seine Schüler nicht – und er deine nicht."),
      el("div", { class: "row" },
        el("div", {}, el("label", {}, "Vorname"), first),
        el("div", {}, el("label", {}, "Nachname"), last)),
      el("label", {}, "E-Mail (zum Anmelden)"), email,
      el("div", { class: "row" },
        el("div", {}, el("label", {}, "Passwort (mind. 6 Zeichen)"),
          el("div", { class: "linkbox" }, pw, el("button", { type: "button", class: "btn ghost", title: "Neues Passwort erzeugen", onclick: () => (pw.value = randomPassword()) }, "🎲"))),
        el("div", {}, el("label", {}, "Link-Kürzel"), slug)),
      linkPreview,
      el("div", { class: "actions" }, btn)),
    el("div", { class: "card" },
      el("h2", {}, `Fahrlehrer (${teachers.length})`),
      teachers.map(row)),
  );
}

// Fahrlehrer hat sein Passwort vergessen: Haupt-Admin setzt ein neues (lesen kann man Passwörter nie)
function openTeacherPassword(t) {
  const pw = el("input", { value: randomPassword(), autocomplete: "off", minlength: 6 });
  const btn = el("button", { class: "btn" }, "Neues Passwort setzen");
  btn.onclick = () => busy(btn, async () => {
    if (pw.value.length < 6) throw new Error("Mindestens 6 Zeichen");
    const { error } = await sb.rpc("owner_set_teacher_password", { p_id: t.id, p_password: pw.value });
    if (error) throw error;
    const text = `Hallo ${t.first_name}, dein Passwort für den Easy Fahrstundenplaner wurde zurückgesetzt.\n\n` +
      `Anmelden: ${appLink()}\nE-Mail: ${t.email}\nNeues Passwort: ${pw.value}\n\nBitte ändere es nach der Anmeldung unter „Einstellungen“.`;
    openModal(`✓ Neues Passwort für ${fullName(t)}`,
      el("div", { class: "note", style: "white-space:pre-wrap" }, text),
      el("div", { class: "actions" },
        el("button", { class: "btn", onclick: () => copyText(text, "Kopiert.") }, "📋 Kopieren"),
        el("a", { class: "btn ok", href: "https://wa.me/?text=" + encodeURIComponent(text), target: "_blank", rel: "noopener" }, "💬 Per WhatsApp senden"),
        el("button", { class: "btn ghost", onclick: closeModal }, "Schließen")));
  });
  openModal(`🔑 Neues Passwort – ${fullName(t)}`,
    el("p", { class: "muted small" }, "Passwörter sind verschlüsselt gespeichert und können von niemandem gelesen werden. Du kannst aber ein neues setzen – das alte gilt dann nicht mehr."),
    el("label", {}, "Neues Passwort (mind. 6 Zeichen)"),
    el("div", { class: "linkbox" }, pw, el("button", { type: "button", class: "btn ghost", title: "Neues Passwort erzeugen", onclick: () => (pw.value = randomPassword()) }, "🎲")),
    el("div", { class: "actions" }, btn, el("button", { class: "btn ghost", onclick: closeModal }, "Abbrechen")));
}

function showTeacherCredentials(v, needsConfirm) {
  state.renderOnClose = true;
  const text = `Hallo ${v.first}, hier sind deine Zugangsdaten für den Easy Fahrstundenplaner:\n\n` +
    `Anmelden: ${appLink()}\nE-Mail: ${v.email}\nPasswort: ${v.pw}\n\n` +
    `Deine Schüler nutzen denselben Link und wählen bei der Registrierung „${v.first}“ als Fahrlehrer aus.\n\n` +
    `Bitte ändere dein Passwort nach der ersten Anmeldung unter „Einstellungen“.`;
  openModal(`✓ ${v.first} ${v.last} angelegt`,
    el("p", {}, "Schick ihm diese Zugangsdaten – z. B. per WhatsApp:"),
    el("div", { class: "note", style: "white-space:pre-wrap" }, text),
    needsConfirm ? el("div", { class: "notice" }, "Hinweis: In Supabase ist die E-Mail-Bestätigung aktiv. Er muss zuerst den Link in der Bestätigungs-E-Mail anklicken, bevor er sich anmelden kann.") : null,
    el("div", { class: "actions" },
      el("button", { class: "btn", onclick: () => copyText(text, "Zugangsdaten kopiert.") }, "📋 Alles kopieren"),
      el("a", { class: "btn ok", href: "https://wa.me/?text=" + encodeURIComponent(text), target: "_blank", rel: "noopener" }, "💬 Per WhatsApp senden"),
      el("button", { class: "btn ghost", onclick: closeModal }, "Schließen")));
}

/* ---------------- Fahrlehrer: Schüler-Link ---------------- */

function loadQrLib() {
  if (window.QRCode) return Promise.resolve();
  return new Promise((ok, bad) => {
    const sc = document.createElement("script");
    sc.src = "https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js";
    sc.onload = ok; sc.onerror = bad;
    document.head.append(sc);
  });
}
function copyText(text, what = "Kopiert.") {
  return navigator.clipboard.writeText(text).then(() => toast(what), () => toast("Kopieren nicht möglich – bitte manuell markieren.", true));
}
function linkBox(link, shareText) {
  const input = el("input", { readonly: true, value: link, onclick: (e) => e.target.select() });
  const qr = el("div", { class: "qr" });
  loadQrLib().then(() => new window.QRCode(qr, { text: link, width: 180, height: 180 })).catch(() => qr.remove());
  return el("div", {},
    el("div", { class: "linkbox" }, input, el("button", { class: "btn", onclick: () => copyText(link, "Link kopiert.") }, "Kopieren")),
    el("div", { class: "actions" },
      navigator.share ? el("button", { class: "btn ghost", onclick: () => navigator.share({ title: "Easy Fahrstundenplaner", text: shareText, url: link }).catch(() => {}) }, "📤 Teilen") : null,
      el("a", { class: "btn ok", href: "https://wa.me/?text=" + encodeURIComponent(shareText + "\n" + link), target: "_blank", rel: "noopener" }, "💬 Per WhatsApp verschicken")),
    el("p", { class: "muted small", style: "margin-top:12px" }, "Oder den QR-Code mit dem Handy scannen lassen, z. B. direkt im Auto:"),
    qr);
}
function openLinkModal() {
  openModal("🔗 Link für Schüler",
    el("p", {}, "Ein Link für alle: Schüler öffnen ihn, tippen auf „Neu registrieren“ und wählen dort dich als Fahrlehrer aus."),
    linkBox(studentLink(), `Hallo! Hier kannst du dich für Fahrstunden anmelden. Wähle bei der Registrierung „${state.settings.display_name || "deinen Fahrlehrer"}“ als Fahrlehrer aus:`));
}

/* ---------------- Fahrlehrer: Datensicherung ---------------- */

// Supabase liefert höchstens 1000 Zeilen pro Abfrage – daher seitenweise holen
async function fetchAll(makeQuery) {
  let all = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await makeQuery().range(from, from + 999);
    if (error) throw error;
    all = all.concat(data || []);
    if (!data || data.length < 1000) return all;
  }
}
async function loadOwnData() {
  const tid = state.profile.id;
  const [settings, students, slots, bookings, progress] = await Promise.all([
    sb.from("settings").select("*").eq("teacher_id", tid).maybeSingle().then(({ data, error }) => { if (error) throw error; return data; }),
    fetchAll(() => sb.from("profiles").select("*").eq("teacher_id", tid).order("last_name")),
    fetchAll(() => sb.from("slots").select("*").eq("teacher_id", tid).order("starts_at")),
    fetchAll(() => sb.from("bookings").select("*").order("created_at")), // Zugriffsregeln: nur Buchungen auf eigenen Terminen
    fetchAll(() => sb.from("training_progress").select("*").order("student_id")), // nur eigene Schüler
  ]);
  return { settings, students, slots, bookings, progress };
}
const today = () => dateInput(new Date());
const backupKey = () => `fsp_backup_${state.profile && state.profile.id}`;
function lastBackup() { try { return localStorage.getItem(backupKey()); } catch { return null; } }
const backupOverdue = () => { const l = lastBackup(); return !l || Date.now() - new Date(l).getTime() > 30 * 86400000; };

// Komplette Sicherung als JSON-Datei (alle eigenen Daten, maschinenlesbar und wiederherstellbar)
async function makeBackup() {
  const d = await loadOwnData();
  const { id, email, first_name, last_name, slug } = state.profile;
  const backup = {
    app: "Fahrstundenplaner", format: 1, name: "Easy Fahrstundenplaner", // "app" = interne Kennung, nicht ändern created_at: new Date().toISOString(),
    teacher: { id, email, first_name, last_name, slug },
    counts: { students: d.students.length, slots: d.slots.length, bookings: d.bookings.length, progress: d.progress.length },
    ...d,
  };
  downloadFile(new Blob([JSON.stringify(backup, null, 2)], { type: "application/json" }), `Sicherung_Easy_Fahrstundenplaner_${today()}.json`);
  try { localStorage.setItem(backupKey(), new Date().toISOString()); } catch { /* egal */ }
  return backup.counts;
}
// Alle Fahrstunden aller eigenen Schüler als Excel-Liste (CSV)
async function exportAllLessons() {
  const d = await loadOwnData();
  const student = Object.fromEntries(d.students.map((x) => [x.id, x]));
  const slot = Object.fromEntries(d.slots.map((x) => [x.id, x]));
  const esc = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const head = ["Schüler", "Klasse", "Datum", "Uhrzeit", "Geplant (Min.)", "Gefahren (Min.)", "Art", "Status", "Fehlstunde", "Grund", "Notiz Schüler", "Hinweis Fahrlehrer"];
  const rows = d.bookings.filter((b) => slot[b.slot_id] && b.status !== "cancelled")
    .sort((a, b) => slot[a.slot_id].starts_at.localeCompare(slot[b.slot_id].starts_at))
    .map((b) => {
      const s = slot[b.slot_id], p = student[b.student_id];
      return [p ? fullName(p) : "?", p && p.license_class, new Date(s.starts_at).toLocaleDateString("de-DE"), fmtRange(s.starts_at, s.duration_min),
        s.duration_min, b.actual_minutes ?? "", b.actual_minutes !== null ? LESSON_TYPES[b.lesson_type || "normal"] : "",
        b.status === "confirmed" && b.actual_minutes !== null ? "Gefahren" : STATUS_TEXT[b.status],
        b.late_cancel ? "ja" : "", b.cancel_reason, b.student_note, b.admin_reply].map(esc).join(";");
    });
  downloadFile(csvBlob([head.map(esc).join(";")].concat(rows)), `Alle_Fahrstunden_${today()}.csv`);
  return rows.length;
}
// Sicherungsdatei auswählen, prüfen, Zusammenfassung zeigen und nach Bestätigung einspielen
async function openRestore(f) {
  let data;
  try { data = JSON.parse(await f.text()); } catch { return toast("Diese Datei ist keine gültige Sicherung (.json).", true); }
  if (!data || data.app !== "Fahrstundenplaner" || !Array.isArray(data.slots) || !Array.isArray(data.bookings)) {
    return toast("Diese Datei ist keine Sicherung vom Easy Fahrstundenplaner.", true);
  }
  if (!data.teacher || data.teacher.id !== state.profile.id) {
    return toast("Diese Sicherung gehört zu einem anderen Fahrlehrer-Konto und kann hier nicht eingespielt werden.", true);
  }
  const agree = el("input", { type: "checkbox" });
  const btn = el("button", { class: "btn danger", disabled: true }, "Jetzt wiederherstellen");
  agree.addEventListener("change", () => (btn.disabled = !agree.checked));
  btn.onclick = () => busy(btn, async () => {
    const { data: res, error } = await sb.rpc("restore_backup", { p_data: data });
    if (error) throw error;
    state.renderOnClose = true;
    openModal("✓ Wiederhergestellt",
      el("p", {}, `${res.students} Schüler, ${res.slots} Termine und ${res.bookings} Buchungen wurden auf den Stand vom ${new Date(data.created_at).toLocaleString("de-DE")} gebracht.`),
      res.skipped ? el("p", { class: "muted small" }, `${res.skipped} ${res.skipped === 1 ? "Eintrag wurde" : "Einträge wurden"} übersprungen – z. B. weil ein Schülerkonto inzwischen gelöscht wurde oder ein Termin inzwischen anders vergeben ist.`) : null,
      el("div", { class: "actions" }, el("button", { class: "btn", onclick: closeModal }, "Fertig")));
  });
  const c = data.counts || { students: (data.students || []).length, slots: data.slots.length, bookings: data.bookings.length };
  openModal("📂 Sicherung wiederherstellen",
    el("p", {}, "Datei: ", el("b", {}, f.name)),
    el("p", {}, `Stand: ${new Date(data.created_at).toLocaleString("de-DE")} · ${c.students} Schüler · ${c.slots} Termine · ${c.bookings} Buchungen`),
    el("div", { class: "notice" },
      "Was passiert: Gelöschte Termine und Buchungen kommen zurück, geänderte werden auf den Stand der Sicherung zurückgesetzt. ",
      "Was du seit der Sicherung neu angelegt hast, bleibt erhalten. Schülerkonten, die inzwischen gelöscht wurden, können nicht zurückgeholt werden."),
    el("p", { class: "small" }, "Tipp: Mach vorher noch schnell eine aktuelle Sicherung – dann kannst du jederzeit zurück."),
    el("label", { class: "check" }, agree, "Ich möchte die Daten auf den Stand dieser Sicherung zurücksetzen."),
    el("div", { class: "actions" }, btn, el("button", { class: "btn ghost", onclick: closeModal }, "Abbrechen")));
}

function backupCard() {
  const last = lastBackup();
  const btn = el("button", { class: "btn" }, "💾 Komplette Sicherung herunterladen");
  btn.onclick = () => busy(btn, async () => {
    const c = await makeBackup();
    toast(`Sicherung gespeichert: ${c.students} Schüler, ${c.slots} Termine, ${c.bookings} Buchungen.`);
    render();
  });
  const csv = el("button", { class: "btn ghost" }, "📊 Alle Fahrstunden als Excel-Liste");
  const file = el("input", { type: "file", accept: ".json,application/json", hidden: true });
  file.addEventListener("change", () => { if (file.files[0]) openRestore(file.files[0]); file.value = ""; });
  const restore = el("button", { class: "btn ghost", onclick: () => file.click() }, "📂 Sicherung wiederherstellen …");
  csv.onclick = () => busy(csv, async () => { const n = await exportAllLessons(); toast(`${n} Einträge exportiert.`); });
  return el("div", { class: "card" },
    el("h3", {}, "💾 Datensicherung"),
    backupOverdue() ? el("div", { class: "notice danger" }, last
      ? `Deine letzte Sicherung auf diesem Gerät ist vom ${new Date(last).toLocaleDateString("de-DE")} – mehr als 30 Tage her. Bitte neu sichern.`
      : "Auf diesem Gerät wurde noch keine Sicherung gemacht.") :
      el("p", { class: "small" }, `✓ Letzte Sicherung auf diesem Gerät: ${new Date(last).toLocaleDateString("de-DE")}`),
    el("p", { class: "muted small" },
      "Die Sicherung enthält alle deine Daten: Schüler, Termine, Buchungen, Fahrzeiten, Notizen, Ausbildungsstand und Einstellungen. ",
      "Sie wird als Datei auf dieses Gerät geladen (Mac: Ordner „Downloads“, iPhone: App „Dateien“). ",
      "Am besten zusätzlich in iCloud, Google Drive oder auf einen USB-Stick kopieren. ",
      "Zum Wiederherstellen auf „Sicherung wiederherstellen“ tippen und die Datei auswählen."),
    el("div", { class: "actions" }, btn, csv, restore, file),
    el("p", { class: "muted small" }, "Die Excel-Liste ist zum Anschauen und Abrechnen gedacht. Für eine Wiederherstellung braucht man die Sicherungsdatei (.json)."));
}

// Eigenes Passwort ändern (Fahrlehrer und Schüler)
function passwordCard() {
  const pw = el("input", { type: "password", minlength: 6, autocomplete: "new-password", placeholder: "Neues Passwort (mind. 6 Zeichen)" });
  const btn = el("button", { class: "btn ghost" }, "Passwort ändern");
  btn.onclick = () => busy(btn, async () => {
    if (pw.value.length < 6) throw new Error("Mindestens 6 Zeichen");
    const { error } = await sb.auth.updateUser({ password: pw.value });
    if (error) throw error;
    if (state.profile.must_change_password) await sb.rpc("password_changed");
    pw.value = "";
    toast("Passwort geändert.");
  });
  return el("div", { class: "card" }, el("h3", {}, "Passwort ändern"), pw, el("div", { class: "actions" }, btn));
}

/* ---------------- Admin: Einstellungen ---------------- */

function adminSettings() {
  const dur = durationControl(state.settings.default_duration);
  const maxOpen = el("input", { type: "number", min: 0, max: 50, value: state.settings.max_open ?? 3 });
  const phone = el("input", { type: "tel", value: state.settings.admin_phone || "", placeholder: "z. B. 0151 23456789" });
  const display = el("input", { value: state.settings.display_name || "", maxlength: 60 });
  const save = el("button", { class: "btn" }, "Speichern");
  save.onclick = () => busy(save, async () => {
    const v = { default_duration: dur.value, max_open: Math.max(0, Math.min(50, +maxOpen.value || 0)), admin_phone: phone.value.trim() || null,
      display_name: display.value.trim() || "Fahrlehrer" };
    const { error } = await sb.from("settings").update(v).eq("teacher_id", state.profile.id);
    if (error) throw error;
    Object.assign(state.settings, v);
    toast("Einstellungen gespeichert.");
  });
  return el("div", {},
    isOwner() && (window.FSP_LEGAL_MISSING || []).length ? el("div", { class: "notice danger", style: "margin-bottom:16px" },
      "Impressum/Datenschutz unvollständig: Bitte in der Datei legal.js deine Anschrift und E-Mail eintragen (",
      (window.FSP_LEGAL_MISSING || []).map((k) => ({ street: "Straße", city: "PLZ/Ort", email: "E-Mail" })[k]).join(", "),
      "). ", legalLink("impressum", "Impressum ansehen")) : null,
    el("div", { class: "card" },
      el("h3", {}, "Standarddauer für neue Termine"),
      el("p", { class: "muted small" }, "Wird bei jedem neuen Termin vorausgefüllt. Du kannst sie dort pro Termin trotzdem ändern."),
      dur.node,
      el("h3", { style: "margin-top:18px" }, "Höchstzahl Termine pro Schüler"),
      el("p", { class: "muted small" }, "So viele Termine (offene Anfragen + anstehende) darf ein Schüler gleichzeitig haben, z. B. 2 oder 3. 0 = unbegrenzt. Einzelne Schüler (z. B. vor der Prüfung) per Häkchen „Mehr erlauben“ in der Schülerliste komplett freigeben."),
      maxOpen,
      el("h3", { style: "margin-top:18px" }, "Dein Name für Schüler"),
      el("p", { class: "muted small" }, "So erscheinst du bei der Registrierung und in Nachrichten, z. B. „Kürsat“."),
      display,
      el("h3", { style: "margin-top:18px" }, "Deine Handynummer"),
      el("p", { class: "muted small" }, "Damit Schüler dich per WhatsApp-Knopf erreichen (z. B. nach einer Absage). Wird nur freigeschalteten Schülern angezeigt."),
      phone,
      el("div", { class: "actions" }, save)),
    el("div", { class: "card" },
      el("h3", {}, "🔗 Link für Schüler"),
      el("p", { class: "muted small" }, "Ein Link für alle Fahrlehrer und Schüler. Bei der Registrierung wählen Schüler ihren Fahrlehrer aus – neue Fahrlehrer erscheinen dort automatisch. Den Link findest du auch jederzeit oben über 🔗."),
      linkBox(studentLink(), `Hallo! Hier kannst du dich für Fahrstunden anmelden. Wähle bei der Registrierung „${state.settings.display_name || "deinen Fahrlehrer"}“ als Fahrlehrer aus:`)),
    backupCard(),
    passwordCard(),
  );
}

/* ---------------- Schüler: Kalender ---------------- */

async function studentCalendar() {
  const from = state.weekStart, to = addDays(state.weekStart, 7);
  const [{ data, error }, own] = await Promise.all([
    sb.rpc("get_calendar", { p_from: from.toISOString(), p_to: to.toISOString() }),
    sb.from("bookings").select("status,actual_minutes,slots(starts_at,duration_min)").eq("student_id", state.profile.id).eq("status", "confirmed"),
  ]);
  if (error) throw error;
  // Nächste eigene Fahrstunde mit Countdown
  const nextOwn = (own.data || []).filter((b) => b.slots && b.actual_minutes === null && addMin(b.slots.starts_at, b.slots.duration_min).getTime() > Date.now())
    .sort((a, b) => a.slots.starts_at.localeCompare(b.slots.starts_at))[0];
  const now = Date.now();
  // Freie und fremd angefragte (unbestätigte) Termine in der Zukunft + die eigenen.
  // Fremde bestätigte Fahrstunden liefert die Datenbank gar nicht erst.
  const slots = data.filter((s) => s.mine || new Date(s.starts_at).getTime() > now);

  const grid = weekGrid(slots, (s) => {
    const past = new Date(s.starts_at).getTime() < now;
    const cls = s.mine && past ? "past" : s.status;
    const label = s.mine
      ? (s.status === "confirmed" ? (past ? "Deine Fahrstunde" : "✓ Deine Fahrstunde – bestätigt")
        : s.status === "offered" ? "📨 Angebot für dich – bitte zusagen" : "Deine Anfrage – wartet auf Bestätigung")
      : s.status === "requested" ? "Angefragt – noch nicht bestätigt (wird evtl. wieder frei)"
      : "Frei – jetzt anfragen";
    const clickable = s.mine || (s.status === "free" && !past);
    return el("button", {
      class: "slot " + cls + (s.mine ? " mine" : ""), disabled: !clickable,
      onclick: clickable ? () => (s.mine ? goTab("mine") : openBooking(s)) : null,
    }, el("b", {}, fmtRange(s.starts_at, s.duration_min)), label);
  });

  return el("div", {},
    nextOwn ? el("div", { class: "card next-card" },
      el("div", { class: "next-row first", style: "cursor:default" },
        countdownEl(nextOwn.slots.starts_at, nextOwn.slots.duration_min),
        el("span", { class: "next-when" }, `Deine nächste Fahrstunde: ${fmtDay(nextOwn.slots.starts_at)} ${fmtRange(nextOwn.slots.starts_at, nextOwn.slots.duration_min)}`))) : null,
    weekBar(),
    legend([["free", "frei – antippen zum Anfragen"], ["offered", "Angebot für dich"], ["requested", "von jemandem angefragt – schau später wieder rein"], ["confirmed mine", "deine Fahrstunden"]]),
    grid,
    slots.length === 0 ? el("p", { class: "muted", style: "margin-top:12px" }, "In dieser Woche gibt es keine freien Termine. Schau in der nächsten Woche (›) nach.") : null,
  );
}

function openBooking(s) {
  const note = el("textarea", { maxlength: 300, placeholder: "Optional, z. B. „Kann ich am Bahnhof abgeholt werden?“" });
  const counter = el("div", { class: "muted small", style: "text-align:right" }, "0 / 300");
  note.addEventListener("input", () => (counter.textContent = `${note.value.length} / 300`));
  const btn = el("button", { class: "btn" }, "Fahrstunde anfragen");
  btn.onclick = () => busy(btn, async () => {
    const { error } = await sb.rpc("book_slot", { p_slot: s.slot_id, p_note: note.value });
    if (error) throw error;
    toast("Angefragt! Du siehst unter „Meine Fahrstunden“, sobald dein Fahrlehrer bestätigt.");
    closeModal();
    render();
  });
  openModal("Fahrstunde anfragen",
    el("p", {}, el("b", {}, fmtDate(s.starts_at)), el("br"), fmtRange(s.starts_at, s.duration_min), ` (${s.duration_min} Min.)`),
    el("label", {}, "Kurze Nachricht an deinen Fahrlehrer"), note, counter,
    el("div", { class: "notice" },
      el("b", {}, "Wichtig: "), "Nach der Bestätigung durch deinen Fahrlehrer ist die Fahrstunde verbindlich. ",
      `Kostenlos absagen kannst du bis zum Vortag 18:00 Uhr (hier: ${fmtDeadline(s.starts_at)}). `,
      "Spätere Absagen werden als Fehlstunde berechnet und sind kostenpflichtig."),
    isLate(s.starts_at) ? el("div", { class: "notice danger" },
      "Kurzfristige Buchung: Die Absagefrist ist bereits abgelaufen. Wird diese Fahrstunde bestätigt, ist eine Absage kostenpflichtig.") : null,
    el("div", { class: "actions" }, btn, el("button", { class: "btn ghost", onclick: closeModal }, "Abbrechen")));
}

/* ---------------- Fahrlehrer: Ausbildungsstand (Schüler wählen → abhaken) ---------------- */

async function adminTraining() {
  const { data: students, error } = await sb.from("profiles")
    .select("id,first_name,last_name,license_class,needs_glasses,is_conversion,status")
    .eq("role", "student").eq("status", "active").order("last_name");
  if (error) throw error;
  if (!students.length) return el("div", { class: "card" }, el("h2", {}, "📈 Ausbildungsstand"), el("p", { class: "muted" }, "Noch keine freigeschalteten Schüler."));
  const chosen = students.find((x) => x.id === state.trainingStudent) || students[0];
  state.trainingStudent = chosen.id;
  const sel = el("select", { "aria-label": "Schüler wählen" },
    students.map((st) => el("option", { value: st.id }, fullName(st) + (st.license_class ? ` (${st.license_class})` : ""))));
  sel.value = chosen.id;
  sel.addEventListener("change", () => { state.trainingStudent = sel.value; render(); });
  const { data: lessons } = await sb.from("bookings").select("status,actual_minutes,lesson_type").eq("student_id", chosen.id);
  return el("div", { class: "card" },
    el("h2", {}, "📈 Ausbildungsstand"),
    el("label", {}, "Schüler wählen"), sel,
    el("div", { class: "done-row", style: "margin:8px 0 4px" }, studentTags(chosen)),
    await trainingView(chosen, true, lessons || []));
}

/* ---------------- Schüler: Ausbildungsstand (nur ansehen) ---------------- */

async function studentTraining() {
  const { data, error } = await sb.from("bookings").select("status,actual_minutes,lesson_type").eq("student_id", state.profile.id);
  if (error) throw error;
  return el("div", { class: "card" },
    el("h2", {}, "📈 Mein Ausbildungsstand"),
    el("p", { class: "muted small" }, "Dein Fahrlehrer trägt hier nach den Fahrstunden ein, was du schon kannst."),
    await trainingView(state.profile, false, data));
}

/* ---------------- Schüler: Mein Profil ---------------- */

function studentProfile() {
  const f = profileFields(state.profile);
  const save = el("button", { class: "btn" }, "Speichern");
  save.onclick = () => busy(save, async () => {
    const v = f.values();
    if (!waNumber(v.phone)) throw new Error("Bitte eine gültige WhatsApp-Nummer angeben, z. B. 0151 23456789");
    if (v.needs_glasses && !state.profile.needs_glasses &&
        !confirm("Einwilligung: Die Angabe „Sehhilfe“ ist ein Gesundheitsdatum. Ich willige ein, dass sie gespeichert und meinem Fahrlehrer angezeigt wird. Widerruf jederzeit durch Entfernen des Hakens.")) return;
    const { error } = await sb.rpc("update_my_profile", {
      p_first: v.first_name, p_last: v.last_name, p_class: v.license_class,
      p_glasses: v.needs_glasses, p_conversion: v.is_conversion, p_phone: v.phone,
    });
    if (error) throw error;
    Object.assign(state.profile, v);
    renderUserbox();
    toast("Profil gespeichert.");
  });
  return el("div", { class: "card narrow", style: "margin:0 auto" },
    el("h2", {}, "Mein Profil"),
    el("p", { class: "muted small" }, state.profile.email || ""),
    f.node, el("div", { class: "actions" }, save),
    el("hr"), passwordCard());
}

/* ---------------- Schüler: Meine Fahrstunden ---------------- */

// Übersicht aller abgehakten Fahrstunden – nummeriert, mit Datum, Uhrzeit und Minuten
function doneList(rows, total) {
  const done = rows.filter((b) => b.status === "confirmed" && b.actual_minutes !== null)
    .sort((a, b) => a.slots.starts_at.localeCompare(b.slots.starts_at));
  if (!done.length) return null;
  return el("div", { class: "card" },
    el("h3", {}, "Gefahrene Fahrstunden"),
    el("div", { style: "overflow-x:auto" }, el("table", {},
      el("thead", {}, el("tr", {}, el("th", {}, "Nr."), el("th", {}, "Datum"), el("th", {}, "Uhrzeit"), el("th", {}, "Art"), el("th", { class: "num" }, "Minuten"))),
      el("tbody", {}, done.map((b, i) => el("tr", {},
        el("td", {}, i + 1),
        el("td", {}, new Date(b.slots.starts_at).toLocaleDateString("de-DE", { weekday: "short", day: "2-digit", month: "2-digit", year: "numeric" })),
        el("td", {}, fmtTime(b.slots.starts_at)),
        el("td", {}, typeLabel(b.lesson_type)),
        el("td", { class: "num" }, b.actual_minutes)))),
      el("tfoot", {}, el("tr", {},
        el("th", { colspan: 4 }, `Gesamt: ${fmtLessons(total)} (à 45 Min.) · ${done.length} Termin${done.length === 1 ? "" : "e"}`),
        el("th", { class: "num" }, `${total} Min. (${fmtMinutes(total)})`))))));
}

// Angebot zusagen oder absagen – danach Fahrlehrer per WhatsApp informieren
function answerOffer(b, accept) {
  const note = el("input", { maxlength: 300, placeholder: accept ? "Nachricht (optional)" : "Kurzer Grund (optional), z. B. „Da habe ich Schule.“" });
  const btn = el("button", { class: "btn " + (accept ? "ok" : "danger") }, accept ? "✓ Verbindlich zusagen" : "✗ Absagen");
  btn.onclick = () => busy(btn, async () => {
    const { error } = await sb.rpc("respond_offer", { p_booking: b.id, p_accept: accept, p_note: note.value.trim() });
    if (error) throw error;
    const when = `${fmtDate(b.slots.starts_at)} um ${fmtTime(b.slots.starts_at)} Uhr`;
    const text = `Hallo, hier ist ${fullName(state.profile)}. ` + (accept ? `Ich sage die Fahrstunde am ${when} zu. 👍` : `Ich kann die Fahrstunde am ${when} leider nicht.`) +
      (note.value.trim() ? `\n${note.value.trim()}` : "");
    notifyStep(accept ? "Zugesagt – die Fahrstunde ist jetzt verbindlich" : "Abgesagt – der Termin ist wieder frei",
      state.settings.admin_phone, text, "deinen Fahrlehrer");
  });
  openModal(accept ? "Fahrstunde zusagen" : "Angebot absagen",
    el("p", {}, el("b", {}, fmtDate(b.slots.starts_at)), el("br"), fmtRange(b.slots.starts_at, b.slots.duration_min)),
    accept ? el("div", { class: "notice" }, isLate(b.slots.starts_at)
      ? "Mit der Zusage ist die Fahrstunde verbindlich. Eine spätere Absage ist kostenpflichtig (Frist schon abgelaufen)."
      : `Mit der Zusage ist die Fahrstunde verbindlich. Kostenlos absagen bis ${fmtDeadline(b.slots.starts_at)}, danach kostenpflichtig.`) : null,
    note, el("div", { class: "actions" }, btn, el("button", { class: "btn ghost", onclick: closeModal }, "Zurück")));
}

function openStudentCancel(b) {
  const late = isLate(b.slots.starts_at);
  const reason = el("textarea", { maxlength: 150, placeholder: "Kurzer Satz, z. B. „Ich habe eine Klausur.“", style: "min-height:56px" });
  const agree = el("input", { type: "checkbox" });
  const btn = el("button", { class: "btn danger", disabled: true }, "Fahrstunde verbindlich absagen");
  const update = () => (btn.disabled = !(agree.checked && reason.value.trim()));
  reason.addEventListener("input", update);
  agree.addEventListener("change", update);
  btn.onclick = () => busy(btn, async () => {
    const { data: wasLate, error } = await sb.rpc("cancel_booking", { p_booking: b.id, p_reason: reason.value.trim() });
    if (error) throw error;
    const text = `Hallo, hier ist ${fullName(state.profile)}. Ich habe meine Fahrstunde am ${fmtDate(b.slots.starts_at)} um ${fmtTime(b.slots.starts_at)} Uhr abgesagt.\nGrund: ${reason.value.trim()}`;
    notifyStep(wasLate ? "Abgesagt – als Fehlstunde vermerkt (kostenpflichtig)" : "Fahrstunde abgesagt",
      state.settings.admin_phone, text, "deinen Fahrlehrer");
  });
  openModal("Fahrstunde absagen",
    el("p", {}, el("b", {}, fmtDate(b.slots.starts_at)), el("br"), fmtRange(b.slots.starts_at, b.slots.duration_min)),
    late
      ? el("div", { class: "notice danger" }, `Die Absagefrist (${fmtDeadline(b.slots.starts_at)}) ist abgelaufen. Diese Fahrstunde wird als Fehlstunde berechnet und ist kostenpflichtig.`)
      : el("div", { class: "notice" }, `Du sagst rechtzeitig ab (Frist: ${fmtDeadline(b.slots.starts_at)}) – die Absage ist kostenlos.`),
    el("label", {}, "Warum sagst du ab?"), reason,
    el("label", { class: "check" }, agree, late
      ? "Ich sage diese Fahrstunde ab und weiß, dass sie als Fehlstunde kostenpflichtig ist."
      : "Ich möchte diese Fahrstunde absagen."),
    el("div", { class: "actions" }, btn, el("button", { class: "btn ghost", onclick: closeModal }, "Doch nicht")));
}

async function studentMine() {
  const { data, error } = await sb.from("bookings")
    .select("id,status,student_note,admin_reply,actual_minutes,cancel_reason,late_cancel,lesson_type,created_at,decided_at,slots(starts_at,duration_min)")
    .eq("student_id", state.profile.id);
  if (error) throw error;
  const rows = data.filter((b) => b.slots).sort((a, b) => b.slots.starts_at.localeCompare(a.slots.starts_at));
  const now = Date.now();
  const upcoming = rows.filter((b) => (b.status === "requested" || b.status === "offered" || (b.status === "confirmed" && b.actual_minutes === null)) && new Date(b.slots.starts_at).getTime() >= now - 3600000).reverse();
  const offers = upcoming.filter((b) => b.status === "offered" && new Date(b.slots.starts_at).getTime() > now);
  const rest = rows.filter((b) => !upcoming.includes(b));
  const total = rows.reduce((sum, b) => sum + (b.status === "confirmed" && b.actual_minutes ? b.actual_minutes : 0), 0);
  const doneCount = rows.filter((b) => b.status === "confirmed" && b.actual_minutes !== null).length;
  const notHeldCount = rows.filter((b) => NOT_HELD_ICON[b.status]).length;
  const seen = getSeen("mine");
  markSeen("mine");
  const lateCount = rows.filter((b) => b.late_cancel).length;

  const item = (b) => {
    const cancel = b.status === "requested" ? el("button", { class: "btn small danger" }, "Anfrage zurückziehen") : null;
    if (cancel) cancel.onclick = () => busy(cancel, async () => {
      if (!confirm("Anfrage wirklich zurückziehen?")) return;
      const { error } = await sb.rpc("cancel_request", { p_booking: b.id });
      if (error) throw error;
      toast("Anfrage zurückgezogen.");
      render();
    });
    const future = new Date(b.slots.starts_at).getTime() > now;
    const canCancel = b.status === "confirmed" && b.actual_minutes === null && future;
    const cancelLesson = canCancel ? el("button", { class: "btn small danger", onclick: () => openStudentCancel(b) }, "Fahrstunde absagen") : null;
    const isOffer = b.status === "offered" && future;
    const accept = isOffer ? el("button", { class: "btn ok", onclick: () => answerOffer(b, true) }, "✓ Zusagen") : null;
    const decline = isOffer ? el("button", { class: "btn danger", onclick: () => answerOffer(b, false) }, "✗ Absagen") : null;
    return el("div", { class: "list-item" + (isOffer ? " offer" : "") },
      el("div", { class: "head" },
        el("div", {}, el("b", {}, fmtDate(b.slots.starts_at)), el("div", {}, fmtRange(b.slots.starts_at, b.slots.duration_min))),
        b.decided_at && b.decided_at > seen ? el("span", { class: "badge late" }, "Neu") : null,
        el("span", { class: "badge " + b.status }, b.status === "requested" ? "Wartet auf Bestätigung"
          : b.status === "offered" ? "📨 Angebot"
          : b.status === "confirmed" && b.actual_minutes !== null ? "✓ Gefahren" : STATUS_TEXT[b.status])),
      b.student_note ? el("div", { class: "note" }, "Deine Nachricht: ", b.student_note) : null,
      b.admin_reply ? el("div", { class: "note reply" }, el("b", {}, "Fahrlehrer: "), b.admin_reply) : null,
      b.actual_minutes !== null ? el("div", { class: "small", style: "margin-top:8px" }, `${typeLabel(b.lesson_type)} · gefahren: `, el("b", {}, fmtMinutes(b.actual_minutes)),
        b.actual_minutes !== b.slots.duration_min ? ` (geplant waren ${b.slots.duration_min} Min.)` : "") : null,
      b.cancel_reason ? el("div", { class: "note" }, "Grund der Absage: ", b.cancel_reason) : null,
      b.late_cancel ? el("div", { class: "notice danger" }, "Fehlstunde – kurzfristig abgesagt, kostenpflichtig.") : null,
      canCancel ? el("div", { class: "small muted", style: "margin-top:8px" }, isLate(b.slots.starts_at)
        ? "Absagefrist abgelaufen – eine Absage ist jetzt kostenpflichtig."
        : `Kostenlos absagen bis ${fmtDeadline(b.slots.starts_at)}.`) : null,
      isOffer ? el("div", { class: "small", style: "margin-top:8px" }, isLate(b.slots.starts_at)
        ? "Mit der Zusage ist die Fahrstunde verbindlich. Die Absagefrist ist schon abgelaufen – eine spätere Absage ist kostenpflichtig."
        : `Mit der Zusage ist die Fahrstunde verbindlich. Kostenlos absagen kannst du danach noch bis ${fmtDeadline(b.slots.starts_at)}.`) : null,
      isOffer ? el("div", { class: "actions" }, accept, decline) : null,
      cancel || cancelLesson ? el("div", { class: "actions" }, cancel, cancelLesson) : null);
  };

  // Schlicht: oben das Wichtigste (Anstehend), darunter aufklappbar Liste/Export und Verlauf
  const wa = waButton(state.settings.admin_phone, `Hallo, hier ist ${fullName(state.profile)}.\n`, "💬 Fahrlehrer anschreiben");
  if (wa) wa.className = "btn small ghost";
  return el("div", {},
    el("div", { class: "done-row", style: "justify-content:space-between;margin:0 0 12px" },
      el("span", {}, el("b", {}, fmtLessons(total)), ` gefahren (à 45 Min.) · ${doneCount} Termin${doneCount === 1 ? "" : "e"} · ${total} Min.`,
        lateCount ? el("span", { class: "badge late", style: "margin-left:6px" }, `${lateCount} Fehlstunde${lateCount === 1 ? "" : "n"}`) : null),
      wa),
    !waNumber(state.profile.phone) ? el("div", { class: "notice danger", style: "margin-bottom:12px" },
      "Bitte trage unter „Profil“ deine WhatsApp-Nummer ein, damit dein Fahrlehrer dich erreichen kann.") : null,
    offers.length ? el("div", { class: "notice", style: "margin-bottom:12px" },
      el("b", {}, `📨 Du hast ${offers.length} Angebot${offers.length === 1 ? "" : "e"} von deinem Fahrlehrer.`), " Bitte unten zusagen oder absagen.") : null,
    el("h2", {}, "Anstehend"),
    upcoming.length ? upcoming.map(item) : el("p", { class: "muted" }, "Keine anstehenden Fahrstunden. Im Kalender kannst du freie Termine anfragen."),
    doneCount ? el("details", { class: "fold" },
      el("summary", {}, `Gefahrene Fahrstunden (${doneCount}) · Sonderfahrten · Export`),
      doneList(rows, total),
      el("p", { class: "small" }, specialSummary(rows)),
      exportButtons(state.profile, rows)) : null,
    rest.length ? el("details", { class: "fold" },
      el("summary", {}, `Verlauf (${rest.length})` + (notHeldCount ? ` · ${notHeldCount}× ausgefallen` : "")),
      rest.map(item)) : null,
  );
}

init();
