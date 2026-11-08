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
// Uhrzeit-Felder als Tippfeld: Zahlen eintippen, die App setzt den Doppelpunkt (1405 → 14:05, 930 → 09:30, 9 → 09:00)
function normTime(raw, final) {
  const s = String(raw || "").trim().replace(/\s*uhr$/i, "").replace(/[.,h ]/g, ":");
  let h, m, mm;
  if ((mm = s.match(/^(\d{1,2}):(\d{1,2})$/))) { h = +mm[1]; m = +mm[2]; if (mm[2].length === 1 && !final) return null; }
  else if (/^\d{3,4}$/.test(s)) { h = +s.slice(0, -2); m = +s.slice(-2); }
  else if (final && /^\d{1,2}$/.test(s)) { h = +s; m = 0; }
  else return null;
  if (h > 23 || m > 59) return null;
  return String(h).padStart(2, "0") + ":" + String(m).padStart(2, "0");
}
function smartTime(inp) {
  if (inp.dataset.smart) return;
  inp.dataset.smart = "1";
  const v = inp.value;
  inp.type = "text"; inp.inputMode = "numeric"; inp.autocomplete = "off"; inp.maxLength = 8;
  inp.placeholder = "z. B. 1405"; inp.classList.add("time-text"); inp.value = v;
  let busyNorm = false;
  const apply = (final) => {
    if (busyNorm) return;
    const n = normTime(inp.value, final);
    if (n && n !== inp.value) { busyNorm = true; inp.value = n; inp.dispatchEvent(new Event("input", { bubbles: true })); inp.dispatchEvent(new Event("change", { bubbles: true })); busyNorm = false; }
    inp.classList.toggle("bad-time", final && !!inp.value && !n && !/^\d\d:\d\d$/.test(inp.value));
  };
  inp.addEventListener("input", () => { if (/^\d{4}$/.test(inp.value) || /^\d{1,2}[:.,]\d{2}$/.test(inp.value)) apply(false); });
  inp.addEventListener("blur", () => apply(true));
  inp.addEventListener("keydown", (e) => { if (e.key === "Enter") apply(true); });
  inp.addEventListener("focus", () => setTimeout(() => inp.select(), 0));
}
new MutationObserver((list) => {
  for (const m of list) m.addedNodes.forEach((n) => {
    if (n.nodeType !== 1) return;
    if (n.matches && n.matches('input[type="time"]')) smartTime(n);
    n.querySelectorAll && n.querySelectorAll('input[type="time"]').forEach(smartTime);
  });
}).observe(document.documentElement, { childList: true, subtree: true });

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
  t.textContent = isError ? msg : msg.replace(/^[✓✔]\s*/, "");   // das Häkchen setzt das Design
  t.className = "toast" + (isError ? " error" : " ok");
  t.hidden = false;
  // Offene Fenster (Dialoge) liegen sonst VOR der Meldung → in die oberste Schicht holen
  try { t.setAttribute("popover", "manual"); if (t.matches(":popover-open")) t.hidePopover(); t.showPopover(); } catch { /* ältere Browser */ }
  if (!isError) toast._ok = Date.now();   // merkt sich: gerade wurde etwas erfolgreich gespeichert
  t.onclick = () => { try { if (t.matches(":popover-open")) t.hidePopover(); } catch { /* egal */ } t.hidden = true; };
  clearTimeout(toast._t);
  toast._t = setTimeout(() => { try { if (t.matches(":popover-open")) t.hidePopover(); } catch { /* egal */ } t.hidden = true; }, isError ? 9000 : 2000);
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
  sick: "Krank gemeldet", cancelled_student: "Vom Schüler abgesagt", cancelled_teacher: "Vom Fahrlehrer abgesagt", no_show: "Nicht erschienen",
};
// Gründe, warum eine bestätigte Fahrstunde nicht zustande kam
const NOT_HELD = [
  ["sick", "🤒 Krank gemeldet"],
  ["cancelled_student", "🙋 Schüler hat abgesagt"],
  ["no_show", "🚷 Nicht erschienen"],
  ["cancelled_teacher", "🚫 Ich habe abgesagt"],
];
const NOT_HELD_ICON = { sick: "🤒", cancelled_student: "🙋", cancelled_teacher: "🚫", no_show: "🚷" };

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
// Befristung: Tage bis zum Ablauf (negativ = abgelaufen); Schüler haben danach 28 Tage Schonfrist
const GRACE_DAYS = 28;
const daysLeft = (until) => (until ? Math.round((new Date(until + "T12:00:00") - dayStart(new Date()).getTime() - 12 * 3600000) / 86400000) : null);
const fmtUntil = (until) => new Date(until + "T12:00:00").toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" });
// Status-Text + Art für Schüler (student=true) oder Fahrlehrer
// passed = praktische Prüfung bestanden: keine Schonfrist, Zugang endet am Ablaufdatum
const PASSED_DAYS = 42, PASSED_EXTEND = 28;
function accessInfo(until, student, passed) {
  if (!until) return { text: "unbegrenzt", cls: "ok" };
  const d = daysLeft(until);
  if (d >= 0) return { text: (passed ? "🎉 bestanden – " : "") + (d <= 30 ? `läuft in ${d} Tag${d === 1 ? "" : "en"} ab (${fmtUntil(until)})` : `gültig bis ${fmtUntil(until)}`), cls: d <= 30 ? "warn" : "ok" };
  if (passed) return { text: `🎉 bestanden – abgelaufen am ${fmtUntil(until)}, gesperrt`, cls: "bad" };
  if (student && d >= -GRACE_DAYS) return { text: `abgelaufen – Sperre in ${GRACE_DAYS + d} Tag${GRACE_DAYS + d === 1 ? "" : "en"}`, cls: "warn" };
  return { text: `abgelaufen am ${fmtUntil(until)}${student ? " – archiviert" : " – gesperrt"}`, cls: "bad" };
}
const addDaysFrom = (until, n) => {
  const base = until && daysLeft(until) >= 0 ? new Date(until + "T12:00:00") : new Date();
  return dateInput(addDays(base, n));
};
const addMonths = (until, n) => {
  const base = until && daysLeft(until) >= 0 ? new Date(until + "T12:00:00") : new Date();
  base.setMonth(base.getMonth() + n);
  return dateInput(base);
};

const isAdmin = () => !!state.profile && state.profile.role === "teacher" && state.profile.status === "active";
const isOwner = () => isAdmin() && state.profile.is_owner;
// Fahrschul-Admin: vom Haupt-Admin angelegt, verwaltet die Fahrlehrer seiner eigenen Fahrschule
const isSchoolAdmin = () => isAdmin() && state.profile.is_school_admin;
const teacherSignature = () => `Dein Fahrlehrer ${state.settings.display_name || ""}`.trim();
// Ein Link für alle – Schüler wählen ihren Fahrlehrer bei der Registrierung aus
const studentLink = () => location.origin + location.pathname;

// Sonderfahrten
const LESSON_TYPES = { normal: "Übungsfahrt", ueberland: "Überlandfahrt", autobahn: "Autobahnfahrt", nacht: "Nachtfahrt",
  schalt: "Schaltstunde", schaltpruefung: "Schaltkompetenz-Test" };
const LESSON_ICON = { normal: "", ueberland: "🌳", autobahn: "🛣️", nacht: "🌙", schalt: "⚙️", schaltpruefung: "🏁" };
const SPECIAL_TYPES = ["ueberland", "autobahn", "nacht"];
// B197: mind. 10 Schaltstunden à 45 Min. + Schaltkompetenz-Test (15 Min.) auf dem Schaltwagen
const B197_TYPES = ["schalt", "schaltpruefung"];
const B197_MIN_LESSONS = 10;
const isB197 = (p) => !!p && p.license_class === "B197";
const typesFor = (p, current) => Object.keys(LESSON_TYPES).filter((t) => !B197_TYPES.includes(t) || isB197(p) || t === current);
const typeLabel = (t) => `${LESSON_ICON[t || "normal"]} ${LESSON_TYPES[t || "normal"]}`.trim();
// Beim Abhaken nachfragen, ob es eine Schaltstunde war: bei B197-Schülern oder wenn als Schaltstunde/-test geplant
const askSchalt = (b) => isB197(b.profiles) || B197_TYPES.includes(b.lesson_type);
// Auswahl „Was war es?“ (Fahrstunde / Schaltstunde / Schaltkompetenz-Test); onPick(typ) – vorbelegt mit dem geplanten Typ
function schaltPicker(current, onPick) {
  const opts = [["normal", "🚗 Normale Fahrstunde"], ["schalt", "⚙️ Schaltstunde"], ["schaltpruefung", "🏁 Schaltkompetenz-Test"]];
  let type = B197_TYPES.includes(current) ? current : "normal";
  const btns = opts.map(([t, label]) => el("button", { type: "button", class: "tab" + (t === type ? " active" : ""),
    onclick: (e) => { type = t; btns.forEach((x) => x.classList.toggle("active", x === e.currentTarget)); onPick && onPick(t); } }, label));
  return { node: el("div", { class: "tabs type-tabs" }, btns), get value() { return type; } };
}
// Kleines Pop-up nach dem Haken: „War das eine Schaltstunde?“ → speichert Minuten + Art
function openSchaltAsk(b, minutes, save) {
  const p = b.profiles || {};
  const pick = (t) => async () => { closeModal(); try { await save(b, { actual_minutes: t === "schaltpruefung" ? Math.min(minutes, 15) : minutes, lesson_type: t }, `✓ ${fullName(p)}: ${LESSON_TYPES[t]} abgehakt`); } catch (e) { fail(e); } };
  const planned = B197_TYPES.includes(b.lesson_type) ? b.lesson_type : "normal";
  const btn = (t, label) => el("button", { class: "btn" + (t === planned ? " ok" : " ghost") + " inst-big", onclick: pick(t) }, label);
  openModal(`✓ ${fullName(p)} – ${minutes} Min.`,
    el("p", {}, el("b", {}, "War das eine Schaltstunde?")),
    el("div", { class: "ask-col" },
      btn("schalt", "⚙️ Ja, Schaltstunde"),
      btn("schaltpruefung", "🏁 Schaltkompetenz-Test (15 Min.)"),
      btn("normal", "🚗 Nein, normale Fahrstunde")));
}

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
  return n ? el("a", { class: "btn ok", href: `https://wa.me/${n}?text=${encodeURIComponent(typeof genderText === "function" ? genderText(text) : text)}`, target: "_blank", rel: "noopener" }, label) : null;
}
// Angeheftete Uhrzeiten des Fahrlehrers (Einstellungen), z. B. "08:00,09:45,11:30"
const timePresets = () => (state.settings.time_presets ?? "08:00").split(",").map((x) => x.trim()).filter((x) => /^\d\d:\d\d$/.test(x)).sort();
async function saveTimePresets(list) {
  const v = list.join(",");
  state.settings.time_presets = v;
  const { error } = await sb.from("settings").update({ time_presets: v }).eq("teacher_id", state.profile.id);
  if (error) toast("Uhrzeiten konnten nicht gespeichert werden: " + error.message, true);
}
// Treffpunkt einer Fahrstunde: beim Termin gewählt, sonst Standard-Treffpunkt des Fahrlehrers
const meetingOf = (b) => (b && (b.meeting_point || (b.slots && b.slots.meeting_point))) || state.settings.meeting_point || "";
const otherPoints = () => (state.settings.meeting_points || "").split("\n").map((x) => x.trim()).filter(Boolean);
// Auswahl für den Fahrlehrer: Standard, weitere gespeicherte oder anderer Treffpunkt.
// value() = null bedeutet „Standard-Treffpunkt“.
function meetingPicker(current) {
  const std = state.settings.meeting_point || "";
  const others = otherPoints().filter((x) => x !== std);
  const OTHER = "__other";
  const sel = el("select", {},
    el("option", { value: "" }, std ? `Standard: ${std}` : "Kein Treffpunkt (Standard in den Einstellungen festlegen)"),
    others.map((x) => el("option", { value: x }, x)),
    el("option", { value: OTHER }, "Anderer Treffpunkt …"));
  const custom = el("input", { maxlength: 200, placeholder: "z. B. Bahnhof, Haupteingang" });
  const remember = el("input", { type: "checkbox", checked: true });
  const rememberBox = el("label", { class: "check" }, remember, el("span", {}, "In meine Treffpunkte aufnehmen (zum schnellen Auswählen)"));
  if (current && current !== std) {
    if (others.includes(current)) sel.value = current;
    else { sel.value = OTHER; custom.value = current; }
  }
  const sync = () => { custom.hidden = rememberBox.hidden = sel.value !== OTHER; };
  sel.addEventListener("change", () => { sync(); if (!custom.hidden) custom.focus(); });
  sync();
  return {
    node: el("div", {}, el("label", {}, "📍 Treffpunkt"), sel, custom, rememberBox),
    value: () => (sel.value === OTHER ? custom.value.trim() || null : sel.value || null),
    // Neuen Treffpunkt in den Einstellungen merken
    async commit() {
      const v = custom.value.trim();
      if (sel.value !== OTHER || !v || !remember.checked || v === std || otherPoints().includes(v)) return;
      const list = otherPoints().concat(v).join("\n").slice(0, 2000);
      const { error } = await sb.from("settings").update({ meeting_points: list }).eq("teacher_id", state.profile.id);
      if (!error) state.settings.meeting_points = list;
    },
  };
}
// Treffpunkt für Schüler anzeigen – mit Link zur Karte
function meetingBox(point) {
  if (!point) return null;
  return el("div", { class: "note meeting" }, "📍 ", el("b", {}, "Treffpunkt: "), point, " ",
    el("a", { href: "https://www.google.com/maps/search/?api=1&query=" + encodeURIComponent(point), target: "_blank", rel: "noopener" }, "Karte öffnen"));
}
// Nachrichtentext vom Fahrlehrer an den Schüler
function waTextChange(profile, oldStart, newStart, dur, reply) {
  const f = (iso) => `${fmtDate(iso)} um ${fmtTime(iso)} Uhr`;
  return `Hallo ${(profile && profile.first_name) || ""}, ich würde deine Fahrstunde am ${f(oldStart)} gern verschieben auf ${f(newStart)} (${dur} Min.). Passt dir das?`
    + (reply ? `\n${reply}` : "") + `\n\n👉 Bitte öffne die App „Easy Fahrstundenplaner“ und sag unter „Meine Fahrstunden“ zu oder ab.\n\n` + teacherSignature();
}
function waTextForStudent(kind, profile, slot, reply, meeting) {
  const when = `${fmtDate(slot.starts_at)} um ${fmtTime(slot.starts_at)} Uhr`;
  const hi = `Hallo ${(profile && profile.first_name) || ""},`;
  const body = {
    confirmed: `${hi} deine Fahrstunde am ${when} (${slot.duration_min} Min.) ist bestätigt.` + (meeting ? `\n📍 Treffpunkt: ${meeting}` : ""),
    offered: `${hi} ich biete dir eine Fahrstunde an: ${when} (${slot.duration_min} Min.).` + (meeting ? `\n📍 Treffpunkt: ${meeting}` : ""),
    rejected: `${hi} deine Anfrage für ${when} kann ich leider nicht bestätigen.`,
    cancelled_teacher: `${hi} ich muss die Fahrstunde am ${when} leider absagen.`,
    sick: `${hi} deine Fahrstunde am ${when} ist wegen Krankheit abgesagt.`,
    cancelled_student: `${hi} deine Fahrstunde am ${when} ist wie von dir gewünscht abgesagt.`,
    no_show: `${hi} du warst zur Fahrstunde am ${when} leider nicht da. Die Fahrstunde ist deshalb ausgefallen.`,
  }[kind];
  // Wo in der App geht es weiter? (statt eines Links)
  const where = {
    confirmed: "Du findest sie in der App „Easy Fahrstundenplaner“ unter „Meine Fahrstunden“.",
    offered: "👉 Bitte öffne die App „Easy Fahrstundenplaner“ und sag unter „Meine Fahrstunden“ zu oder ab.",
    rejected: "👉 Such dir in der App „Easy Fahrstundenplaner“ unter „Kalender“ gern einen anderen freien Termin aus.",
    cancelled_teacher: "👉 Such dir in der App „Easy Fahrstundenplaner“ unter „Kalender“ gern einen neuen Termin aus.",
    sick: "👉 Such dir in der App „Easy Fahrstundenplaner“ unter „Kalender“ gern einen neuen Termin aus.",
    cancelled_student: "👉 Such dir in der App „Easy Fahrstundenplaner“ unter „Kalender“ gern einen neuen Termin aus.",
    no_show: "👉 Such dir in der App „Easy Fahrstundenplaner“ unter „Kalender“ gern einen neuen Termin aus.",
  }[kind];
  return body + (reply ? `\n${reply}` : "") + `\n\n${where}\n\n` + teacherSignature();
}
// „Nicht gefahren“: Termin gleich neu vergeben – optional einen anderen Schüler wählen (nichts gewählt = Termin bleibt frei)
// Aktive Schüler = freigeschaltet, nicht bestanden (bestanden = archiviert), Zugang nicht abgelaufen
async function onlyActive(list) {
  const { data } = await sb.from("exams").select("student_id").eq("kind", "praxis").eq("result", "passed");
  const passed = new Set((data || []).map((x) => x.student_id));
  return (list || []).filter((st) => st.status === "active" && !passed.has(st.id) && !(st.valid_until && daysLeft(st.valid_until) < -GRACE_DAYS));
}

function replacePicker(excludeId) {
  const who = el("select", {}, el("option", { value: "" }, "— niemand, Termin bleibt frei —"));
  let students = [];
  sb.from("profiles").select("id,first_name,last_name,phone,license_class,needs_glasses,is_conversion,status,valid_until")
    .eq("role", "student").eq("status", "active").order("last_name")
    .then(async ({ data }) => {
      students = (await onlyActive(data)).filter((x) => x.id !== excludeId);
      who.append(...students.map((st) => el("option", { value: st.id }, fullName(st) + (st.license_class ? ` (${st.license_class})` : ""))));
    });
  const how = assignHow();
  const howBox = el("div", { hidden: true }, how.node);
  who.addEventListener("change", () => (howBox.hidden = !who.value));
  return {
    node: el("div", { class: "replace-box" }, el("label", {}, "👤 Termin gleich an einen anderen Schüler vergeben? (optional)"), who, howBox),
    onChange: (fn) => who.addEventListener("change", fn),
    get student() { return students.find((x) => x.id === who.value) || null; },
    // nach dem Absagen aufrufen: trägt den gewählten Schüler ein (angeboten oder fest) und schickt die Mitteilung
    async apply(slot) {
      const st = this.student;
      if (!st) return null;
      const kind = how.offer() ? "offered" : "confirmed";
      const { data, error } = await sb.from("bookings").insert({ slot_id: slot.id, student_id: st.id, status: kind, decided_at: new Date().toISOString() }).select("id");
      if (error) throw new Error(error.code === "23505" ? "Der Termin ist schon an jemand anderen vergeben." : error.message);
      pushNotify("booking", (data || []).map((x) => x.id), kind === "offered" ? "offered" : "assigned");
      return { st, kind };
    },
  };
}
// Nach „nicht gefahren“ (+ evtl. neu vergeben): WhatsApp an den neuen Schüler bzw. bei eigener Absage an den alten
function afterNotHeld(slot, old, status, late, res, note = "") {
  const msg = `${fullName(old)}: ${STATUS_TEXT[status]}${late ? " (Fehlstunde)" : ""}`;
  const extra = [late ? "Das wird als Fehlstunde berechnet." : "", note ? `Grund: ${note}` : ""].filter(Boolean).join("\n");
  const oldText = waTextForStudent(status, old, slot, extra);
  if (res) return notifyStep(`${msg} · ${fullName(res.st)} ${res.kind === "offered" ? "angeboten" : "eingetragen"}`,
    res.st.phone, waTextForStudent(res.kind, res.st, slot, "", meetingOf(slot)), fullName(res.st),
    waButton(old && old.phone, oldText, `💬 ${fullName(old)} per WhatsApp informieren`));
  return notifyStep(msg, old && old.phone, oldText);
}
// Mitteilung an den Schüler, dessen Fahrstunde nicht stattfindet (Text und Grund baut der Server)
const pushNotHeld = (id, status) => pushNotify("booking", id, status === "cancelled_teacher" ? "cancelled_teacher" : "not_held");

// Nach einer Aktion: Erfolg anzeigen und anbieten, den Schüler per WhatsApp zu informieren
function notifyStep(msg, phone, text, who = "den Schüler", extraBtn = null) {
  state.renderOnClose = true;
  const wa = waButton(phone, text, `💬 ${who[0].toUpperCase() + who.slice(1)} per WhatsApp informieren`);
  openModal("✓ " + msg,
    wa ? el("p", {}, `Möchtest du ${who} per WhatsApp informieren? Der Text ist schon vorbereitet.`)
       : el("p", { class: "muted small" }, `Für ${who} ist keine Handynummer hinterlegt – keine WhatsApp-Nachricht möglich.`),
    wa ? el("div", { class: "note" }, text) : null,
    el("div", { class: "actions" }, wa, extraBtn, el("button", { class: "btn ghost", onclick: closeModal }, "Schließen")));
}
modal.addEventListener("close", () => { if (state.renderOnClose) { state.renderOnClose = false; render(); } });

// "Neu"-Markierung: Zeitpunkt des letzten Besuchs pro Gerät merken
const seenKey = (name) => `fsp_seen_${name}_${state.profile && state.profile.id}`;
function getSeen(name) { try { return localStorage.getItem(seenKey(name)) || "1970-01-01T00:00:00Z"; } catch { return new Date().toISOString(); } }
function markSeen(name) { try { localStorage.setItem(seenKey(name), new Date().toISOString()); } catch { /* egal */ } }

// Formularfelder für Profildaten (Registrierung ausgenommen)
// Anrede: Frau oder Mann – für richtige Wörter in Nachrichten (Fahrlehrerin/Fahrlehrer, Schülerin/Schüler)
async function saveGender(g) {
  const { error } = await sb.rpc("set_my_gender", { p_gender: g });
  if (error) throw error;
  state.profile.gender = g;
  if (state.profile.role === "teacher") state.settings.teacher_gender = g;
}
function genderPicker(current, onPick) {
  const btns = [["w", "👩 Frau"], ["m", "👨 Mann"]].map(([g, t]) => el("button", { type: "button", class: "tab" + (g === current ? " active" : ""),
    onclick: (e) => { btns.forEach((x) => x.classList.toggle("active", x === e.currentTarget)); onPick(g); } }, t));
  return el("div", { class: "tabs type-tabs" }, btns);
}
function genderCard() {
  return el("div", { class: "card" }, el("h3", {}, "Anrede"),
    el("p", { class: "muted small" }, "Damit Nachrichten richtig formuliert sind."),
    genderPicker(state.profile.gender, (g) => saveGender(g).then(() => toast("Anrede gespeichert.")).catch(fail)));
}
// Noch keine Anrede gespeichert → einmal fragen (gilt auch für schon angemeldete Nutzer)
function maybeAskGender() {
  if (!state.profile || state.profile.gender || modal.open) return false;
  let chosen = null;
  const ok = el("button", { class: "btn ok", disabled: true }, "Speichern");
  ok.onclick = () => busy(ok, async () => { await saveGender(chosen); closeModal(); toast("Danke!"); render(); });
  openModal("👋 Kurze Frage",
    el("p", {}, isAdmin() ? "Bist du Fahrlehrerin oder Fahrlehrer?" : "Bist du Schülerin oder Schüler?"),
    el("p", { class: "muted small" }, "Damit Nachrichten und Mitteilungen richtig formuliert sind."),
    genderPicker(null, (g) => { chosen = g; ok.disabled = false; }),
    el("div", { class: "actions" }, ok));
  return true;
}
// Fahrlehrerin: Texte in der Schüler-App weiblich (Seiten, Fenster, Meldungen und vorbereitete WhatsApp-Texte)
const FEMALE_TEACHER = [
  [/\bDeines Fahrlehrers\b/g, "Deiner Fahrlehrerin"], [/\bdeines Fahrlehrers\b/g, "deiner Fahrlehrerin"],
  [/\bDeinem Fahrlehrer\b/g, "Deiner Fahrlehrerin"], [/\bdeinem Fahrlehrer\b/g, "deiner Fahrlehrerin"],
  [/\bDeinen Fahrlehrer\b/g, "Deine Fahrlehrerin"], [/\bdeinen Fahrlehrer\b/g, "deine Fahrlehrerin"],
  [/\bDein Fahrlehrer\b/g, "Deine Fahrlehrerin"], [/\bdein Fahrlehrer\b/g, "deine Fahrlehrerin"],
  [/\bMeines Fahrlehrers\b/g, "Meiner Fahrlehrerin"], [/\bmeines Fahrlehrers\b/g, "meiner Fahrlehrerin"],
  [/\bMeinem Fahrlehrer\b/g, "Meiner Fahrlehrerin"], [/\bmeinem Fahrlehrer\b/g, "meiner Fahrlehrerin"],
  [/\bMeinen Fahrlehrer\b/g, "Meine Fahrlehrerin"], [/\bmeinen Fahrlehrer\b/g, "meine Fahrlehrerin"],
  [/\bMein Fahrlehrer\b/g, "Meine Fahrlehrerin"], [/\bmein Fahrlehrer\b/g, "meine Fahrlehrerin"],
  [/\bDer Fahrlehrer\b/g, "Die Fahrlehrerin"], [/\bder Fahrlehrer\b/g, "die Fahrlehrerin"],
  [/\bden Fahrlehrer\b/g, "die Fahrlehrerin"], [/\bdem Fahrlehrer\b/g, "der Fahrlehrerin"], [/\bdes Fahrlehrers\b/g, "der Fahrlehrerin"],
  [/\bFahrlehrer(?![a-zäöüß])/g, "Fahrlehrerin"],
  [/\bEr entscheidet\b/g, "Sie entscheidet"], [/\ber entscheidet\b/g, "sie entscheidet"], [/\bbestätigt er\b/g, "bestätigt sie"],
  [/\ber kann ihn verlängern\b/g, "sie kann ihn verlängern"],
];
const femaleTeacherView = () => state.profile && state.profile.role === "student" && state.settings && state.settings.teacher_gender === "w";
const genderText = (t) => (femaleTeacherView() && typeof t === "string" ? FEMALE_TEACHER.reduce((x, [a, b]) => x.replace(a, b), t) : t);
function genderizeNode(root) {
  if (!femaleTeacherView() || !root) return;
  const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  for (let n = w.nextNode(); n; n = w.nextNode()) {
    if (!/Fahrlehrer|Er entscheidet|er entscheidet|bestätigt er|er kann ihn/.test(n.nodeValue)) continue;
    const v = genderText(n.nodeValue);
    if (v !== n.nodeValue) n.nodeValue = v;
  }
}
new MutationObserver((list) => { if (!femaleTeacherView()) return; for (const m of list) m.addedNodes.forEach((n) => genderizeNode(n.nodeType === 3 ? n.parentNode : n)); })
  .observe(document.body, { childList: true, subtree: true });

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
  const counts = SPECIAL_TYPES.concat(isB197(p) ? B197_TYPES : []).map((t) => `${LESSON_TYPES[t]}: ${done.filter((x) => x.type === LESSON_TYPES[t]).length}`).join(" · ");
  d.body.append(tag("h1", "Fahrstunden – " + fullName(p)),
    tag("div", [p.license_class ? "Klasse " + p.license_class : "", `Stand: ${new Date().toLocaleDateString("de-DE")}`].filter(Boolean).join(" · ")),
    tag("p", `Gefahren: ${fmtLessons(total)} (à 45 Min.) · ${done.length} Termine · ${total} Min. · Fehlstunden: ${r.filter((x) => x.late === "ja").length} · ${counts}`),
    table);
  setTimeout(() => w.print(), 300);
}
function exportButtons(p, rows) {
  return el("div", { class: "actions" },
    el("button", { class: "btn small ghost", onclick: () => exportCsv(p, rows) }, "⬇ Excel (CSV)"),
    el("button", { class: "btn small ghost", onclick: () => exportPrint(p, rows) }, "🖨 Drucken / PDF"));
}
// Sonderfahrten zählen
function specialSummary(rows, p) {
  const done = rows.filter((b) => b.status === "confirmed" && b.actual_minutes !== null);
  const types = SPECIAL_TYPES.concat(isB197(p) || done.some((b) => B197_TYPES.includes(b.lesson_type)) ? B197_TYPES : []);
  return types.map((t) => {
    const list = done.filter((b) => b.lesson_type === t);
    return `${LESSON_ICON[t]} ${LESSON_TYPES[t]}: ${list.length}× (${list.reduce((s, b) => s + b.actual_minutes, 0)} Min.)`;
  }).join(" · ");
}

// Großer farbiger Knopf (wie in „Heute“): Symbol, Titel, Unterzeile
const quickBtn = (cls, icon, title, sub, onclick) => el("button", { class: "quick-btn " + cls, onclick },
  el("span", { class: "qi" }, icon), el("span", {}, el("b", {}, title), el("small", {}, sub)));

// Führerscheinklasse direkt im Steckbrief ändern (Schüler tragen sie oft falsch ein) – ein Tipp, sofort gespeichert
function classPicker(st) {
  const pick = (c) => async () => {
    if (st.license_class === c) return;
    const { error } = await sb.from("profiles").update({ license_class: c }).eq("id", st.id);
    if (error) return fail(error);
    toast(`Klasse geändert: ${c}`);
    state.renderOnClose = true;
    openStudent({ ...st, license_class: c });   // Seite neu aufbauen (z. B. Schaltstunden bei B197)
  };
  return el("div", { class: "pf-item pf-wide" }, el("small", {}, "Führerscheinklasse – zum Ändern antippen"),
    el("div", { class: "class-chips" }, LICENSE_CLASSES.map((c) => el("button", { type: "button", class: "tab" + (st.license_class === c ? " active" : ""), onclick: pick(c) },
      c === "B" ? "B (Schaltwagen)" : c === "B197" ? "B197 (Automatik + Schalt)" : c))));
}

// Steckbrief: alle Stammdaten des Schülers auf einen Blick
function studentProfileCard(st, rows) {
  const yes = (v) => (v ? "✓ Ja" : "Nein");
  const now = Date.now();
  const lessons = rows.filter((b) => b.slots && b.status === "confirmed");
  const next = lessons.filter((b) => new Date(b.slots.starts_at).getTime() > now).sort((a, b) => a.slots.starts_at.localeCompare(b.slots.starts_at))[0];
  const last = lessons.filter((b) => b.actual_minutes !== null).sort((a, b) => b.slots.starts_at.localeCompare(a.slots.starts_at))[0];
  const acc = accessInfo(st.valid_until, true, st.passed);
  // Speichern und Seite neu aufbauen
  const saveField = async (patch, msg) => {
    const { error } = await sb.from("profiles").update(patch).eq("id", st.id);
    if (error) return fail(error);
    toast(msg || "Gespeichert.");
    state.renderOnClose = true;
    openStudent({ ...st, ...patch });
  };
  const jump = (sel) => () => document.querySelector("dialog " + sel)?.scrollIntoView({ behavior: "smooth", block: "center" });
  // Kachel: antippen → Aktion (ändern, umschalten, springen); ✎ zeigt, dass sie änderbar ist
  const item = (k, v, onclick, editable) => el(onclick ? "button" : "div", { type: onclick ? "button" : undefined, class: "pf-item" + (onclick ? " pf-tap" : ""), onclick },
    el("small", {}, k, editable ? el("span", { class: "pf-pen" }, " ✎") : null), el("b", {}, v || "–"));
  // Text-Kachel: antippen → Eingabefeld mit ✓ direkt in der Kachel
  const textItem = (k, v, type, fields) => {
    const box = item(k, v, () => {
      const inputs = fields.map(([key, ph]) => el("input", { type, value: st[key] || "", placeholder: ph }));
      const ok = el("button", { type: "button", class: "btn small ok" }, "✓ Speichern");
      ok.onclick = () => busy(ok, () => {
        const patch = Object.fromEntries(fields.map(([key], i) => [key, inputs[i].value.trim() || null]));
        if ("first_name" in patch && (!patch.first_name || !patch.last_name)) throw new Error("Bitte Vor- und Nachnamen angeben");
        return saveField(patch);
      });
      const form = el("div", { class: "pf-item pf-wide pf-edit" }, el("small", {}, k), ...inputs,
        el("div", { class: "done-row", style: "margin:6px 0 0" }, ok, el("button", { type: "button", class: "btn small ghost", onclick: () => form.replaceWith(box) }, "Abbrechen")));
      box.replaceWith(form);
      inputs[0].focus();
    }, true);
    return box;
  };
  return el("div", { class: "pf-card" },
    el("h3", { class: "sec-title" }, "📋 Steckbrief"),
    el("p", { class: "muted small", style: "margin:0 0 8px" }, "Antippen zum Ändern (✎)."),
    el("div", { class: "pf-grid" },
      classPicker(st),
      textItem("👤 Name", fullName(st), "text", [["first_name", "Vorname"], ["last_name", "Nachname"]]),
      textItem("📞 Telefon / WhatsApp", st.phone, "tel", [["phone", "z. B. 0151 23456789"]]),
      item("👓 Brille / Sehhilfe", yes(st.needs_glasses), () => saveField({ needs_glasses: !st.needs_glasses }, `Brille: ${st.needs_glasses ? "Nein" : "Ja"}`), true),
      item("Umschreiber", yes(st.is_conversion), () => saveField({ is_conversion: !st.is_conversion }, `Umschreiber: ${st.is_conversion ? "Nein" : "Ja"}`), true),
      item("⏳ Zugang", acc.text, jump(".access-sec"), true),
      item("Anfragen pro Woche", limitLabel(st.max_open), jump(".limit-sec"), true),
      item("Nächste Fahrstunde", next ? `${fmtDay(next.slots.starts_at)} ${fmtTime(next.slots.starts_at)} Uhr` : "–", next ? () => openAdminSlot(next.slots.id) : null),
      item("Letzte Fahrstunde", last ? fmtDay(last.slots.starts_at) : "–", last ? () => openAdminSlot(last.slots.id) : null),
      item("✉️ E-Mail (Anmeldung)", st.email),
      item("Angemeldet seit", st.created_at ? fmtDate(st.created_at) : "–")));
}

// Übersicht auf der Schüler-Seite: alles Gefahrene auf einen Blick (Sonderfahrten, bei B197 Schaltstunden + Test)
function lessonOverview(p, rows, exams = []) {
  const done = rows.filter((b) => b.status === "confirmed" && b.actual_minutes !== null && b.slots);
  const sum = (list) => list.reduce((x, b) => x + b.actual_minutes, 0);
  const of = (t) => done.filter((b) => (b.lesson_type || "normal") === t);
  const fs = (m) => (Math.round((m / LESSON_MIN) * 10) / 10).toLocaleString("de-DE");
  const tile = (icon, title, value, sub, cls = "") => el("div", { class: "ov-tile " + cls },
    el("span", { class: "ov-ic" }, icon), el("div", {}, el("small", {}, title), el("b", {}, value), sub ? el("small", { class: "muted" }, sub) : null));
  const total = sum(done);
  const tn = (n) => `${n} Termin${n === 1 ? "" : "e"}`;
  const tiles = [
    tile("🚗", "Gefahren gesamt", `${fs(total)} FS`, `${tn(done.length)} · ${total} Min.`),
    // alles in Fahrstunden (FS à 45 Min.) – wie „Gefahren gesamt“
    tile("🚙", "Übungsfahrten", `${fs(sum(of("normal")))} FS`, `${tn(of("normal").length)} · ${sum(of("normal"))} Min.`),
    ...SPECIAL_TYPES.map((t) => tile(LESSON_ICON[t], LESSON_TYPES[t], `${fs(sum(of(t)))} FS`, `${tn(of(t).length)} · ${sum(of(t))} Min.`)),
  ];
  if (isB197(p) || done.some((b) => B197_TYPES.includes(b.lesson_type))) {
    const sm = sum(of("schalt")), n = sm / LESSON_MIN;
    const test = of("schaltpruefung").sort((a, b) => b.slots.starts_at.localeCompare(a.slots.starts_at))[0];
    tiles.push(
      tile("⚙️", "Schaltstunden (B197)", `${fs(sm)} von ${B197_MIN_LESSONS} FS`, `${tn(of("schalt").length)} · ${sm} Min.`, n >= B197_MIN_LESSONS ? "ok" : "warn"),
      schaltTestTile(tile, test, exams.filter((e) => e.kind === "schalt")));
  }
  const missed = rows.filter((b) => b.late_cancel).length;
  tiles.push(tile("⚠️", "Fehlstunden", `${missed}×`, "kostenpflichtig", missed ? "warn" : ""));
  return el("div", { class: "ov-grid" }, tiles);
}

// Kachel „Schaltkompetenz-Test“: bestanden / nicht bestanden (wiederholen) / geplant / offen
function schaltTestTile(tile, lesson, exams) {
  const passed = exams.find((e) => e.result === "passed");
  const last = exams[exams.length - 1];
  if (passed) return tile("🏁", "Schaltkompetenz-Test", "✓ bestanden", fmtDate(passed.exam_at), "ok");
  if (last && !last.result && new Date(last.exam_at).getTime() > Date.now()) return tile("🏁", "Schaltkompetenz-Test", "geplant", `${fmtDate(last.exam_at)} · ${fmtTime(last.exam_at)} Uhr`, "warn");
  if (last && last.result === "failed") return tile("🏁", "Schaltkompetenz-Test", "✗ nicht bestanden", `${fmtDate(last.exam_at)} – bitte wiederholen`, "warn");
  if (last) return tile("🏁", "Schaltkompetenz-Test", "Ergebnis offen", fmtDate(last.exam_at), "warn");
  if (lesson) return tile("🏁", "Schaltkompetenz-Test", "✓ gemacht", `${fmtDate(lesson.slots.starts_at)} · ${lesson.actual_minutes} Min.`, "ok");
  return tile("🏁", "Schaltkompetenz-Test", "offen", "15 Min. auf dem Schaltwagen", "warn");
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
  return { node, input, set, get value() { return clamp(input.value); } };
}

function openModal(title, ...content) {
  openModal._n = (openModal._n || 0) + 1;
  modal.classList.remove("full-page");
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

// Startseite: für Fahrlehrer „☀️ Heute“ (außer ausgeschaltet), sonst der Kalender
const showToday = () => isAdmin() && !state.settings.hide_today;
const homeTab = () => (showToday() ? "today" : "calendar");

// Tab wechseln und im Verlauf merken, damit „Zurück“ funktioniert
function goTab(id) {
  if (state.tab === id) return render();
  history.pushState({ tab: id }, "");
  state.tab = id;
  render();
}
// Sichtbare Zurück-Taste: eine Seite zurück, sonst zum Kalender
function goBack() {
  if (history.state && history.state.tab && history.state.tab !== homeTab() && history.length > 1) history.back();
  else goTab(homeTab());
}
window.addEventListener("popstate", (e) => {
  if (modal.open) { modal.close(); return; }
  const tab = (e.state && e.state.tab) || homeTab();
  if (state.profile && tab !== state.tab) { state.tab = tab; render(); }
});
// Fenster mit Esc geschlossen → Verlaufseintrag mitnehmen
modal.addEventListener("close", () => { if (history.state && history.state.modal) history.back(); });
modal.addEventListener("click", (e) => { if (e.target === modal) closeModal(); });

// Wurde im Hintergrund „Abbrechen“ in einer Rückfrage gedrückt? (dann keine Erfolgsmeldung)
let lastConfirm = true;
const _confirm = window.confirm.bind(window);
window.confirm = (m) => (lastConfirm = _confirm(m));
async function busy(button, fn) {
  const t0 = Date.now(), n0 = openModal._n || 0;
  let saved = false;
  lastConfirm = true;
  if (button) { button.disabled = true; button.classList.add("working"); }
  try {
    await fn();
    saved = (toast._ok || 0) >= t0;
    // Jeder Knopf bestätigt sich: kam weder eine Meldung noch ein neues Fenster, kurz „Erledigt“ zeigen
    if (!saved && lastConfirm && (openModal._n || 0) === n0) { toast("Erledigt"); saved = true; }
  } catch (e) {
    fail(e);
    if (button) { button.classList.add("failed"); setTimeout(() => button.classList.remove("failed"), 700); }
  } finally { if (button) { button.disabled = false; button.classList.remove("working"); } }
  // Bleibt der Knopf sichtbar: kurz „✓ Gespeichert“ zeigen und gesperrt lassen (verhindert doppeltes Drücken)
  if (saved && button && button.isConnected && button.offsetParent !== null) {
    const old = button.textContent;
    button.textContent = "✓ Gespeichert"; button.classList.add("saved"); button.disabled = true;
    setTimeout(() => { button.textContent = old; button.classList.remove("saved"); button.disabled = false; }, 1400);
  }
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
    state.active = !!(await sb.rpc(profile.role === "teacher" ? "is_teacher" : "is_active")).data;
    // Neu registriert und wartet auf Freischaltung → Fahrlehrer einmal benachrichtigen
    if (profile.role === "student" && profile.status === "pending") {
      const k = "fsp_reg_notified_" + profile.id;
      let sent = false; try { sent = !!localStorage.getItem(k); } catch { /* egal */ }
      if (!sent) { sb.functions.invoke("notify", { body: { kind: "registered", ids: [profile.id], event: "registered" } }).catch(() => {}); try { localStorage.setItem(k, "1"); } catch { /* egal */ } }
    }
    state.passed = profile.role === "student" && !!(await sb.rpc("student_passed", { p_id: profile.id })).data;
  } catch (e) { fail(e); }
  state.tab = homeTab();
  renderUserbox();
  render();
  if (isAdmin() && state.profile.status === "active") cleanupOldData();
  setTimeout(() => { if (!maybeAskGender() && !maybeAskInstall()) maybeAskPush(); }, 3600);  // nach dem Startbildschirm: erst Installieren, dann Mitteilungen
}

// Daten älter als 15 Monate automatisch löschen – beim Fahrlehrer höchstens einmal am Tag (still im Hintergrund)
async function cleanupOldData() {
  const key = "fsp_cleanup_" + state.profile.id, today = dateInput(new Date());
  try { if (localStorage.getItem(key) === today) return; } catch { /* egal */ }
  const { data, error } = await sb.rpc("cleanup_old_data");
  if (error) return;  // z. B. Datenbank noch nicht aktualisiert – nächstes Mal wieder versuchen
  try { localStorage.setItem(key, today); } catch { /* egal */ }
  const n = data || {};
  const parts = [n.slots ? `${n.slots} Termin${n.slots === 1 ? "" : "e"}` : "", n.students ? `${n.students} Schüler` : ""].filter(Boolean);
  if (parts.length) toast(`🧹 Älter als 15 Monate – gelöscht: ${parts.join(", ")}.`);
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
  // Zugang abgelaufen (Befristung)?
  if (p.status === "active" && (p.role === "teacher" || p.teacher_id)) {
    app.replaceChildren(el("div", { class: "card narrow" },
      el("h2", {}, "⏳ Zugang abgelaufen"),
      el("p", {}, p.role === "teacher"
        ? (p.school_id
          ? "Die Laufzeit deines Zugangs ist abgelaufen. Bitte wende dich an deine Fahrschule, um sie zu verlängern. Deine Daten und Schüler bleiben gespeichert."
          : "Die Laufzeit deines Zugangs ist abgelaufen. Bitte wende dich an den Betreiber der App, um sie zu verlängern. Deine Daten und Schüler bleiben gespeichert.")
        : state.passed
          ? "🎉 Herzlichen Glückwunsch zur bestandenen Prüfung! Dein Zugang ist jetzt beendet. Falls du noch etwas brauchst, melde dich bei deinem Fahrlehrer."
          : "Dein Zugang ist abgelaufen. Bitte wende dich an deinen Fahrlehrer – er kann ihn mit einem Tipp verlängern. Deine Fahrstunden bleiben gespeichert."),
      el("div", { class: "actions" },
        el("button", { class: "btn", onclick: () => loadUserAndRender() }, "↻ Erneut prüfen"),
        el("button", { class: "btn ghost", onclick: (e) => logout(e.currentTarget) }, "‹ Zur Anmeldung / anderes Konto"))));
    return;
  }
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
      el("button", { class: "btn ghost", onclick: (e) => logout(e.currentTarget) }, "‹ Zur Anmeldung / anderes Konto")),
  ));
}

function renderUserbox() {
  if (!state.profile) { userbox.replaceChildren(); return; }
  userbox.replaceChildren(...[
    el("span", {}, fullName(state.profile)),
    isAdmin() ? el("span", { class: "badge admin" }, isOwner() ? "Haupt-Admin" : isSchoolAdmin() ? "Fahrschul-Admin" : "Fahrlehrer") : null,
    isAdmin() ? el("button", { class: "btn small", onclick: openLinkModal, "aria-label": "Schüler-Link", title: "Schüler-Link" }, "🔗", el("span", { class: "hide-sm" }, " Schüler-Link")) : null,
    !isAdmin() && state.settings.display_name ? el("span", { class: "small muted" }, "· Fahrlehrer " + state.settings.display_name) : null,
    el("button", { class: "btn small ghost", onclick: (e) => logout(e.currentTarget) }, "Abmelden"),
  ].filter(Boolean));
}

// Abmelden – klappt immer, auch ohne Netz oder mit abgelaufener Anmeldung:
// erst auf diesem Gerät abmelden, die Sitzung beim Server nur nebenbei beenden.
async function logout(btn) {
  if (btn) { btn.disabled = true; btn.textContent = "Abmelden …"; }
  if (modal.open) modal.close();
  // Mitteilungen für dieses Gerät abmelden (sonst bekäme der nächste Nutzer am Gerät fremde Mitteilungen)
  try { if (pushSupported()) await Promise.race([disablePush(), new Promise((r) => setTimeout(r, 1500))]); } catch { /* egal */ }
  const timeout = new Promise((r) => setTimeout(r, 3000));
  try { await Promise.race([sb.auth.signOut({ scope: "local" }), timeout]); } catch { /* egal – unten wird trotzdem abgemeldet */ }
  try { Object.keys(localStorage).filter((k) => k.startsWith("sb-")).forEach((k) => localStorage.removeItem(k)); } catch { /* privater Modus */ }
  state.session = null;
  state.tab = "calendar";
  history.replaceState({}, "");
  await loadUserAndRender();
}

// Klick auf „Easy Fahrstundenplaner“ oben → Startseite (Heute bzw. Kalender)
document.querySelector(".topbar .brand").addEventListener("click", () => {
  if (!state.profile) return;
  if (modal.open) modal.close();
  window.scrollTo({ top: 0, behavior: "smooth" });
  const home = homeTab();
  if (state.tab === home) return render();
  history.pushState({ tab: home }, "");
  state.tab = home;
  render();
});

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
  let regGender = null;
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
          if (!regGender) throw new Error("Bitte die Anrede wählen (Frau oder Mann).");
          const { data, error } = await sb.auth.signUp({
            email: email.value.trim(), password: pw.value,
            options: {
              data: {
                first_name: first.value.trim(), last_name: last.value.trim(),
                license_class: licenseClass.value, needs_glasses: glasses.checked && glassesConsent.checked, is_conversion: conversion.checked,
                phone: phone.value.trim(), teacher: teacherSel.value, accepted_terms: true, gender: regGender,
              },
              emailRedirectTo: location.origin + location.pathname },
          });
          if (error) throw error;
          if (data.session) { try { await sb.rpc("set_my_gender", { p_gender: regGender }); } catch { /* wird nach dem Anmelden erfragt */ } }
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
      el("label", {}, "Anrede"), genderPicker(null, (g) => (regGender = g)),
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
    installHint(),
  ));
}

/* ---------------- Als App installieren (iPhone/Android) ---------------- */

let installPrompt = null;  // Android/Chrome: Installations-Dialog, den wir auf Knopfdruck zeigen
window.addEventListener("beforeinstallprompt", (e) => { e.preventDefault(); installPrompt = e; });
if ("serviceWorker" in navigator && location.protocol !== "file:") {
  // Neue Version übernommen → Seite einmal neu laden, damit sie sofort gilt (nicht beim allerersten Start)
  const hadController = !!navigator.serviceWorker.controller;
  let reloading = false;
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (!hadController || reloading || document.querySelector("dialog[open]") || state.dirty) return;
    reloading = true;
    location.reload();
  });
  window.addEventListener("load", () => navigator.serviceWorker.register("sw.js", { updateViaCache: "none" }).then((reg) => {
    // Beim Zurückkehren in die App nach Updates schauen
    document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") reg.update().catch(() => {}); });
  }).catch(() => {}));
}
// Fahrstunde vorbei, aber noch nicht abgehakt → Fenster: gefahren (Minuten änderbar) oder nicht gefahren
const askLater = (id, hours) => { try { localStorage.setItem("fsp_ask_" + id, String(Date.now() + hours * 3600000)); } catch { /* egal */ } };
const askedLater = (id) => { try { return +(localStorage.getItem("fsp_ask_" + id) || 0) > Date.now(); } catch { return false; } };
let askingDone = false;
// Termin konnte nach einer Absage nicht ganz zur ersten Zeit zurück (dort ist jetzt eine andere Fahrstunde):
// Die Datenbank hat die freie Lücke berechnet – unter 60 Min. fragt die App nach.
async function askSlotReview() {
  const { data, error } = await sb.from("slots").select("id,starts_at,duration_min,review_start,review_dur")
    .eq("teacher_id", state.profile.id).not("review_start", "is", null).gte("review_start", new Date().toISOString()).order("review_start").limit(1);
  if (error || !data || !data.length) return false;
  const x = data[0];
  const clear = { review_start: null, review_dur: null };
  const take = el("button", { class: "btn ok", hidden: !(x.review_dur >= 15) }, `✓ ${x.review_dur} Min. ab ${fmtTime(x.review_start)} Uhr freigeben`);
  take.onclick = () => busy(take, async () => {
    const { error: e } = await sb.from("slots").update({ starts_at: x.review_start, duration_min: x.review_dur, original_start: null, ...clear }).eq("id", x.id);
    if (e) throw e;
    closeModal(); toast(`Freigegeben: ${fmtRange(x.review_start, x.review_dur)} Uhr.`); render();
  });
  const keep = el("button", { class: "btn" }, `So lassen (${fmtRange(x.starts_at, x.duration_min)} Uhr)`);
  keep.onclick = () => busy(keep, async () => {
    const { error: e } = await sb.from("slots").update({ original_start: null, ...clear }).eq("id", x.id);
    if (e) throw e;
    closeModal(); render();
  });
  const del = el("button", { class: "btn danger" }, "Termin löschen");
  del.onclick = () => busy(del, async () => {
    const { error: e } = await sb.from("slots").delete().eq("id", x.id);
    if (e) throw e;
    closeModal(); toast("Termin gelöscht."); render();
  });
  openModal("⚠️ Wenig Zeit frei",
    el("p", {}, "Eine abgesagte Fahrstunde sollte wieder zu ihrer ersten Zeit frei werden. Dort ist inzwischen aber eine andere Fahrstunde eingetragen."),
    el("p", {}, el("b", {}, fmtDate(x.review_start)), el("br"),
      x.review_dur >= 15 ? `Frei wären nur noch ${x.review_dur} Min. (${fmtRange(x.review_start, x.review_dur)} Uhr).` : "Dort ist keine Zeit mehr frei."),
    el("p", { class: "muted small" }, `Der Termin steht im Moment um ${fmtRange(x.starts_at, x.duration_min)} Uhr.`),
    el("div", { class: "actions" }, take, keep, del));
  return true;
}
async function askFinishedLessons() {
  if (askingDone || !state.profile || !isAdmin() || !state.active || document.hidden || modal.open || state.dirty) return;
  askingDone = true;
  try {
    if (maybeAskGender()) return;   // Anrede zuerst (falls noch nicht gespeichert)
    if (await askSlotReview()) return;
    const now = Date.now(), since = new Date(now - 7 * 86400000).toISOString(), until = new Date(now).toISOString();
    const [bk, ow] = await Promise.all([
      sb.from("bookings").select("id,status,actual_minutes,lesson_type,profiles(first_name,last_name,license_class,is_conversion),slots!inner(id,starts_at,duration_min,teacher_id)")
        .eq("status", "confirmed").is("actual_minutes", null).eq("slots.teacher_id", state.profile.id).gte("slots.starts_at", since).lt("slots.starts_at", until),
      sb.from("own_entries").select("id,kind,lesson_type,student_name,starts_at,duration_min,done").eq("teacher_id", state.profile.id)
        .eq("kind", "lesson").eq("done", false).gte("starts_at", since).lt("starts_at", until),
    ]);
    const ended = (start, dur) => new Date(start).getTime() + dur * 60000 <= now;
    const list = (bk.data || []).filter((b) => b.slots && ended(b.slots.starts_at, b.slots.duration_min))
      .map((b) => ({ id: b.id, own: false, b, name: fullName(b.profiles), start: b.slots.starts_at, dur: b.slots.duration_min }))
      .concat((ow.data || []).filter((x) => ended(x.starts_at, x.duration_min))
        .map((x) => ({ id: x.id, own: true, x, name: x.student_name, start: x.starts_at, dur: x.duration_min })))
      .filter((x) => !askedLater(x.id)).sort((a, b) => a.start.localeCompare(b.start));
    if (!list.length || modal.open) return;
    const it = list[0];
    const dur = durationControl(it.dur);
    const kind = !it.own && askSchalt(it.b) ? schaltPicker(it.b.lesson_type, (t) => { if (t === "schaltpruefung") dur.set(15); }) : null;
    const yes = el("button", { class: "btn ok inst-big" });
    const syncYes = () => (yes.textContent = `✓ Gefahren – ${dur.value} Min. abhaken`);
    dur.input.addEventListener("input", syncYes); syncYes();
    yes.onclick = () => busy(yes, async () => {
      const { error } = it.own
        ? await sb.from("own_entries").update({ done: true, duration_min: dur.value }).eq("id", it.id)
        : await sb.from("bookings").update({ actual_minutes: dur.value, lesson_type: kind ? kind.value : it.b.lesson_type || "normal" }).eq("id", it.id);
      if (error) throw error;
      toast(`${it.name}: ${dur.value} Min. gefahren`);
      closeModal(); render();
      setTimeout(askFinishedLessons, 1200);   // gleich die nächste, falls noch eine offen ist
    });
    const no = el("button", { class: "btn danger" }, "✗ Nicht gefahren");
    no.onclick = () => busy(no, async () => {
      if (it.own) {
        if (!confirm(`Nicht gefahren: Eintrag „${it.name}“ entfernen?`)) return;
        const { error } = await sb.from("own_entries").delete().eq("id", it.id);
        if (error) throw error;
        toast(`${it.name}: nicht gefahren – Eintrag entfernt.`);
        closeModal(); render();
        setTimeout(askFinishedLessons, 1200);
        return;
      }
      openAdminSlot(it.b.slots.id);   // dort Grund wählen (krank, abgesagt, nicht erschienen …)
    });
    const later = el("button", { class: "btn ghost" }, "Später fragen");
    later.onclick = () => { askLater(it.id, 2); closeModal(); };
    openModal("🚗 Fahrstunde vorbei",
      el("p", {}, "Bist du die Fahrstunde gefahren?"),
      el("p", {}, el("b", {}, it.name), el("br"), `${fmtDate(it.start)}, ${fmtRange(it.start, it.dur)} Uhr`),
      kind ? [el("label", {}, "Was war es?"), kind.node] : null,
      el("label", {}, "Gefahrene Minuten (bei Bedarf ändern)"), dur.node,
      el("div", { class: "actions" }, yes),
      el("div", { class: "actions" }, no, later),
      list.length > 1 ? el("p", { class: "muted small", style: "margin:8px 0 0" }, `Noch ${list.length - 1} weitere nicht abgehakte Fahrstunde${list.length === 2 ? "" : "n"}.`) : null);
  } catch (e) { console.warn(e); }
  finally { askingDone = false; }
}
setInterval(askFinishedLessons, 60000);
document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") setTimeout(askFinishedLessons, 1500); });
window.addEventListener("load", () => setTimeout(askFinishedLessons, 4000));

const isInstalled = () => matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;
const isIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
function openInstallHelp() {
  if (installPrompt) {
    installPrompt.prompt();
    installPrompt.userChoice.finally(() => (installPrompt = null));
    return;
  }
  openModal("📲 Als App installieren",
    el("h3", {}, "iPhone / iPad (Safari)"),
    el("ol", {},
      el("li", {}, "Diese Seite in ", el("b", {}, "Safari"), " öffnen."),
      el("li", {}, "Unten auf ", el("b", {}, "Teilen"), " tippen (Quadrat mit Pfeil nach oben)."),
      el("li", {}, el("b", {}, "„Zum Home-Bildschirm“"), " wählen und auf ", el("b", {}, "„Hinzufügen“"), " tippen.")),
    el("h3", {}, "Android (Chrome)"),
    el("ol", {},
      el("li", {}, "Diese Seite in ", el("b", {}, "Chrome"), " öffnen."),
      el("li", {}, "Oben rechts auf ", el("b", {}, "⋮"), " tippen."),
      el("li", {}, el("b", {}, "„App installieren“"), " bzw. ", el("b", {}, "„Zum Startbildschirm hinzufügen“"), " wählen.")),
    el("p", { class: "muted small" }, "Danach startet „Easy Fahrstunden“ wie eine normale App vom Startbildschirm – ohne Adresszeile. Du bleibst angemeldet."));
}
// Einmal nach der Anmeldung: geführte Installation aufs Handy (Android mit einem Knopf, iPhone mit Bild-Anleitung)
const ICON_SHARE = '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3v12"/><path d="M7.5 7.5 12 3l4.5 4.5"/><path d="M6 11H5a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-8a1 1 0 0 0-1-1h-1"/></svg>';
const ICON_ADD = '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><rect x="4" y="4" width="16" height="16" rx="4"/><path d="M12 8v8M8 12h8"/></svg>';
function maybeAskInstall() {
  if (!state.profile || isInstalled() || document.querySelector("dialog[open]")) return false;
  const mobile = isIOS() || /android/i.test(navigator.userAgent);
  if (!mobile) return false;
  const key = "fsp_install_asked_" + state.profile.id;
  try { if (localStorage.getItem(key)) return false; localStorage.setItem(key, "1"); } catch { return false; }
  const icon = (svg) => { const i = el("span", { class: "inst-ico" }); i.innerHTML = svg; return i; };
  const step = (n, ...content) => el("div", { class: "inst-step" }, el("span", { class: "inst-n" }, String(n)), el("div", {}, ...content));
  const intro = el("p", {}, "Mit der App auf dem Startbildschirm bist du mit ", el("b", {}, "einem Tipp"), " drin – wie bei einer normalen App – und bekommst ", el("b", {}, "Mitteilungen"), ", z. B. wenn eine Fahrstunde bestätigt oder abgesagt wird.");
  const later = el("button", { class: "btn ghost", onclick: () => { closeModal(); toast("Du findest die Anleitung jederzeit unter " + (isAdmin() ? "„Einstellungen“." : "„Profil“.")); } }, "Später");
  if (isIOS()) {
    openModal("📲 App aufs iPhone holen",
      intro,
      el("div", { class: "inst-steps" },
        step(1, "Tippe in ", el("b", {}, "Safari"), " auf ", el("b", {}, "Teilen"), " ", icon(ICON_SHARE), el("div", { class: "muted small" }, "unten in der Leiste – oder erst auf „…“")),
        step(2, "Wähle ", el("b", {}, "„Zum Home-Bildschirm“"), " ", icon(ICON_ADD), el("div", { class: "muted small" }, "evtl. etwas nach unten wischen")),
        step(3, "Oben rechts auf ", el("b", {}, "„Hinzufügen“"), " tippen – fertig! 🎉")),
      el("p", { class: "muted small" }, "Danach die App über das neue Symbol „Easy Fahrstunden“ auf dem Startbildschirm öffnen."),
      el("div", { class: "inst-arrow", "aria-hidden": "true" }, "⬇"),
      el("div", { class: "actions" }, el("button", { class: "btn ok", onclick: closeModal }, "Verstanden"), later));
    return true;
  }
  // Android: Chrome bietet den Installations-Dialog per Knopf an
  const install = el("button", { class: "btn ok inst-big" }, "📲 App installieren");
  install.onclick = async () => {
    if (!installPrompt) return openInstallHelp();
    installPrompt.prompt();
    const { outcome } = await installPrompt.userChoice.catch(() => ({}));
    installPrompt = null;
    closeModal();
    if (outcome === "accepted") toast("🎉 Installiert – du findest „Easy Fahrstunden“ jetzt auf dem Startbildschirm.");
  };
  openModal("📲 App aufs Handy holen",
    intro,
    installPrompt ? el("p", { class: "small" }, "Ein Tipp auf den Knopf – dann noch „Installieren“ bestätigen. Fertig!")
      : el("div", { class: "inst-steps" },
          step(1, "Oben rechts auf ", el("b", {}, "⋮"), " tippen (Menü)."),
          step(2, el("b", {}, "„App installieren“"), " bzw. ", el("b", {}, "„Zum Startbildschirm hinzufügen“"), " wählen.")),
    el("div", { class: "actions" }, installPrompt ? install : el("button", { class: "btn ok", onclick: closeModal }, "Verstanden"), later));
  return true;
}

function installHint() {
  if (isInstalled()) return null;
  return el("p", { class: "small", style: "margin-top:12px" },
    el("a", { href: "#", onclick: (e) => { e.preventDefault(); openInstallHelp(); } }, "📲 Als App auf dem Handy installieren"));
}
// Startbildschirm: beim App-Start und jedes Mal, wenn die App aus dem Hintergrund wieder geöffnet wird
// (~3 Sek., Antippen überspringt). Nicht beim bloßen Neuladen und nie mitten in einem offenen Fenster oder beim Tippen.
const splash = (() => {
  const first = document.getElementById("splash");
  if (!first) return { show() {} };
  const tpl = first.cloneNode(true);  // unberührte Vorlage, damit die Animation jedes Mal neu startet
  const quick = matchMedia("(prefers-reduced-motion: reduce)").matches;
  function run(sp) {
    const close = () => { sp.classList.add("hide"); setTimeout(() => sp.remove(), 500); };
    sp.addEventListener("click", close);
    setTimeout(close, quick ? 800 : 3000);
  }
  if (document.documentElement.classList.contains("no-splash")) first.remove();
  else { try { sessionStorage.setItem("fsp_splash", "1"); } catch { /* privater Modus */ } run(first); }
  return {
    show() {
      if (document.getElementById("splash") || document.querySelector("dialog[open]") || state.dirty) return;
      document.documentElement.classList.remove("no-splash");
      const sp = tpl.cloneNode(true);
      document.body.prepend(sp);
      run(sp);
    },
  };
})();
// App kommt aus dem Hintergrund zurück → Startbildschirm noch einmal zeigen
let hiddenAt = 0;
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "hidden") hiddenAt = Date.now();
  else if (hiddenAt && Date.now() - hiddenAt > 1500) splash.show();
});

// Passwortfelder: Auge-Knopf zum Anzeigen/Verbergen – gilt automatisch für jedes Passwortfeld der App
function addPasswordEye(input) {
  if (input.dataset.eye) return;
  input.dataset.eye = "1";
  const wrap = el("div", { class: "pw-wrap" });
  const eye = el("button", { type: "button", class: "pw-eye", "aria-label": "Passwort anzeigen", title: "Passwort anzeigen" }, "👁️");
  eye.onclick = () => {
    const show = input.type === "password";
    input.type = show ? "text" : "password";
    eye.textContent = show ? "🙈" : "👁️";
    eye.setAttribute("aria-label", show ? "Passwort verbergen" : "Passwort anzeigen");
    eye.title = eye.getAttribute("aria-label");
    input.focus();
  };
  input.replaceWith(wrap);
  wrap.append(input, eye);
}
new MutationObserver(() => document.querySelectorAll('input[type="password"]:not([data-eye])').forEach(addPasswordEye))
  .observe(document.body, { childList: true, subtree: true });

// Design der App: Hell (Standard) oder Ozean (dunkel) – nur auf diesem Gerät gespeichert
const DARK_BG = ["ocean"];
function setDesign(key) {
  if (key) document.documentElement.dataset.bg = key; else delete document.documentElement.dataset.bg;
  document.documentElement.classList.toggle("dark", DARK_BG.includes(key));
  try { key ? localStorage.setItem("fsp_bg", key) : localStorage.removeItem("fsp_bg"); } catch { /* privater Modus */ }
}
/* ---------------- Push-Mitteilungen ---------------- */

// Nach einer Aktion den Empfänger benachrichtigen (Server-Funktion „notify“ baut den Text selbst). Fehler stören nie.
const FREEING = ["rejected", "decline", "cancel", "withdraw", "cancelled_teacher", "not_held"];
function pushNotify(kind, ids, event) {
  ids = (Array.isArray(ids) ? ids : [ids]).filter(Boolean);
  if (!ids.length && kind !== "test") return;
  sb.functions.invoke("notify", { body: { kind, ids, event } }).catch(() => {});
  // Termin wieder frei → (wenn eingeschaltet) alle Schüler benachrichtigen; die Funktion prüft alles Weitere
  if (kind === "booking" && FREEING.includes(event)) {
    setTimeout(() => sb.functions.invoke("notify", { body: { kind: "slot_freed", ids, event } }).catch(() => {}), 1500);
  }
}
// Test-Mitteilung an die eigenen Geräte – mit sichtbarem Ergebnis (zur Fehlersuche)
async function pushTest() {
  toast("🔔 Test kommt in ca. 10 Sekunden – jetzt das Handy sperren.");
  try {
    const { data, error } = await sb.functions.invoke("notify", { body: { kind: "test", ids: [], event: "test" } });
    if (error) {
      let detail = error.message || String(error);
      try { const body = await error.context.json(); if (body && body.error) detail = body.error; } catch { /* keine Details */ }
      return toast("Test fehlgeschlagen: " + detail, true);
    }
    const n = (data && data.sent) || 0;
    toast(n ? `🔔 Test an ${n} Gerät${n === 1 ? "" : "e"} geschickt – kommt gleich.` : "Test: kein Gerät gefunden – bitte Mitteilungen neu einschalten.", !n);
  } catch (e) { toast("Test fehlgeschlagen: " + (e.message || e), true); }
}
const pushSupported = () => "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
const b64ToBytes = (b64) => {
  const s = atob((b64 + "=".repeat((4 - (b64.length % 4)) % 4)).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(s, (c) => c.charCodeAt(0));
};
async function enablePush() {
  if (!pushSupported()) throw new Error("Dieses Gerät/dieser Browser unterstützt keine Mitteilungen.");
  if (Notification.permission === "denied") throw new Error("Mitteilungen sind in den Handy-Einstellungen für diese App blockiert.");
  const perm = await Notification.requestPermission();
  if (perm !== "granted") throw new Error("Mitteilungen wurden nicht erlaubt.");
  const reg = await navigator.serviceWorker.ready;
  const sub = (await reg.pushManager.getSubscription()) ||
    await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToBytes(cfg.VAPID_PUBLIC_KEY) });
  const j = sub.toJSON();
  const { error } = await sb.from("push_subscriptions").upsert({ user_id: state.profile.id, endpoint: j.endpoint, p256dh: j.keys.p256dh, auth: j.keys.auth }, { onConflict: "endpoint" });
  if (error) throw error;
  try { localStorage.setItem("fsp_push_on_" + state.profile.id, "1"); } catch { /* egal */ }
}
async function disablePush() {
  try { localStorage.removeItem("fsp_push_on_" + state.profile.id); } catch { /* egal */ }   // bewusst aus → keine Erinnerung
  const reg = await navigator.serviceWorker.ready;
  const sub = await reg.pushManager.getSubscription();
  if (sub) { await sb.from("push_subscriptions").delete().eq("endpoint", sub.endpoint); await sub.unsubscribe(); }
}
function pushCard() {
  const box = el("div", {});
  const ios = isIOS(), installed = matchMedia("(display-mode: standalone)").matches || navigator.standalone;   // auch iPad (gibt sich als Mac aus)
  async function draw() {
    if (ios && !installed) return box.replaceChildren(el("p", { class: "muted small" }, "Auf iPhone und iPad gehen Mitteilungen nur mit der installierten App (Teilen → „Zum Home-Bildschirm“). Danach hier einschalten."));
    if (!pushSupported()) return box.replaceChildren(el("p", { class: "muted small" }, "Dieses Gerät unterstützt keine Mitteilungen."));
    let on = false;
    try { on = Notification.permission === "granted" && !!(await (await navigator.serviceWorker.ready).pushManager.getSubscription()); } catch { /* egal */ }
    const btn = el("button", { class: "btn" + (on ? " ghost" : " ok") }, on ? "Mitteilungen ausschalten" : "🔔 Mitteilungen einschalten");
    btn.onclick = () => busy(btn, async () => {
      if (on) { await disablePush(); toast("Mitteilungen auf diesem Gerät ausgeschaltet."); }
      else { await enablePush(); await pushTest(); }
      draw();
    });
    const test = on ? el("button", { class: "btn ghost" }, "Test senden") : null;
    if (test) test.onclick = () => busy(test, pushTest);
    box.replaceChildren(
      el("p", { class: "small", style: "margin:0 0 8px" }, on ? "✅ Auf diesem Gerät eingeschaltet." : "Aus – du bekommst keine Mitteilungen auf dieses Gerät."),
      el("div", { class: "actions", style: "margin:0" }, btn, test));
  }
  draw();
  return el("div", { class: "card" },
    el("h3", {}, "🔔 Mitteilungen auf dieses Gerät"),
    el("p", { class: "muted small", style: "margin:0 0 6px" }, "Geht auf Handy, Tablet, Mac und Windows-PC – auf jedem Gerät einmal einschalten. Am Computer am besten mit Chrome, Edge, Firefox oder Safari."),
    el("p", { class: "muted small" }, isAdmin()
      ? "Sofort Bescheid bei neuen Anfragen, Ausnahme-Bitten, Absagen und Zusagen deiner Schüler."
      : "Sofort Bescheid, wenn dein Fahrlehrer bestätigt, ablehnt, etwas anbietet, absagt oder eine Prüfung einträgt."),
    box);
}

// Nach der Anmeldung EINMAL fragen, ob Mitteilungen erlaubt werden sollen – danach nie wieder (änderbar in Einstellungen/Profil)
async function maybeAskPush() {
  if (!state.profile || (!isAdmin() && !state.active) || state.profile.must_change_password) return;
  if (!pushSupported() || document.querySelector("dialog[open]")) return;
  const ios = isIOS(), installed = matchMedia("(display-mode: standalone)").matches || navigator.standalone;   // auch iPad (gibt sich als Mac aus)
  if (ios && !installed) return;  // iPhone: geht nur mit installierter App
  const uid = state.profile.id, key = "fsp_push_asked_" + uid, onKey = "fsp_push_on_" + uid, remKey = "fsp_push_rem_" + uid;
  const lsGet = (k) => { try { return localStorage.getItem(k); } catch { return null; } };
  const lsSet = (k, v) => { try { localStorage.setItem(k, String(v)); } catch { /* egal */ } };
  let sub = null;
  try { sub = await (await navigator.serviceWorker.ready).pushManager.getSubscription(); } catch { /* egal */ }
  if (Notification.permission === "granted" && sub) { lsSet(onKey, 1); return; }   // alles in Ordnung
  const wasOn = lsGet(onKey) === "1";   // war schon einmal an (und nicht bewusst ausgeschaltet) → Update/Neuinstallation hat es zurückgesetzt
  if (Notification.permission === "granted" && !sub) { try { await enablePush(); return; } catch { /* dann Erinnerung zeigen */ } }
  const asked = !!lsGet(key);
  const lastRem = Number(lsGet(remKey) || 0);
  if (Notification.permission === "denied") {
    if (!wasOn || Date.now() - lastRem < 86400000) return;
    lsSet(remKey, Date.now());
    return openModal("🔔 Mitteilungen sind blockiert",
      el("p", {}, "Dein Handy blockiert Mitteilungen für diese App, deshalb bekommst du keine Nachrichten mehr (z. B. bei bestätigten oder geänderten Fahrstunden)."),
      el("p", { class: "small" }, "Bitte in den ", el("b", {}, "Handy-Einstellungen → Mitteilungen"), " für den Easy Fahrstundenplaner wieder erlauben."),
      el("div", { class: "actions" }, el("button", { class: "btn", onclick: closeModal }, "Verstanden")));
  }
  if (asked && !wasOn) return;                                   // früher abgelehnt: nicht nerven
  if (asked && Date.now() - lastRem < 86400000) return;          // Erinnerung höchstens einmal am Tag
  lsSet(remKey, Date.now());
  const remember = () => lsSet(key, Date.now());
  const examples = isAdmin()
    ? ["📥 Ein Schüler fragt eine Fahrstunde an", "⚠️ Ein Schüler bittet um eine Ausnahme", "❌ Ein Schüler sagt eine Fahrstunde ab", "✅ Ein Schüler nimmt dein Angebot an"]
    : ["✅ Deine Fahrstunde wurde bestätigt", "📨 Dein Fahrlehrer bietet dir eine Fahrstunde an", "❌ Eine Fahrstunde wurde abgesagt oder abgelehnt", "🎓 Dein Prüfungstermin wurde eingetragen"];
  const where = isAdmin() ? "„Einstellungen“" : "„Profil“";
  const yes = el("button", { class: "btn ok inst-big" }, "🔔 Mitteilungen einschalten");
  yes.onclick = () => busy(yes, async () => {
    remember();
    await enablePush();
    closeModal();
    toast("🔔 Mitteilungen sind an – du bekommst ab jetzt Bescheid.");
  });
  const later = el("button", { type: "button", class: "link-btn", onclick: () => {
    remember(); closeModal();
    toast(`Du kannst Mitteilungen jederzeit unter ${where} einschalten.`);
  } }, "Jetzt nicht");
  openModal(wasOn ? "🔔 Mitteilungen wieder einschalten" : "🔔 Mitteilungen einschalten",
    wasOn ? el("div", { class: "notice", style: "margin:0 0 10px" }, "Deine Mitteilungen sind ausgeschaltet – das kann nach einem Update passieren. Bitte einmal wieder einschalten, sonst verpasst du Änderungen an deinen Fahrstunden.") : null,
    el("p", {}, "Der Easy Fahrstundenplaner schickt dir eine ", el("b", {}, "Mitteilung aufs Handy"), " – auch wenn die App geschlossen ist. Zum Beispiel:"),
    el("ul", { class: "push-ask" }, examples.map((t) => el("li", {}, t))),
    el("div", { class: "notice", style: "margin:4px 0 12px" }, "Gleich fragt dein Handy nach – bitte dort auf ", el("b", {}, "„Erlauben“"), " tippen."),
    yes,
    el("p", { class: "muted small", style: "text-align:center;margin:10px 0 0" }, `Ausschalten geht jederzeit unter ${where}. `, later));
}

// Tab „☀️ Heute“ ein-/ausschalten (pro Fahrlehrer gespeichert)
function todayCard() {
  const box = el("input", { type: "checkbox", checked: !state.settings.hide_today });
  box.addEventListener("change", async () => {
    box.disabled = true;
    const { error } = await sb.from("settings").update({ hide_today: !box.checked }).eq("teacher_id", state.profile.id);
    box.disabled = false;
    if (error) { box.checked = !box.checked; return fail(error); }
    state.settings.hide_today = !box.checked;
    toast(box.checked ? "☀️ „Heute“ ist wieder deine Startseite." : "Tab „Heute“ ausgeblendet – Startseite ist der Kalender.");
    render();
  });
  return el("div", { class: "card" },
    el("h3", {}, "☀️ Heute-Ansicht"),
    el("label", { class: "check" }, box, el("span", {}, el("b", {}, "Tab „Heute“ anzeigen (Startseite)"),
      " – deine Fahrstunden von heute und morgen kompakt untereinander. Direkt abhaken (Minuten anpassen) oder „nicht gefahren“ mit Grund wählen. Wischen wechselt den Tag.")));
}

function backgroundCard() {
  const cur = () => document.documentElement.dataset.bg || "";
  const sw = el("div", { class: "design-switch", role: "group", "aria-label": "Design umschalten" });
  const draw = () => sw.replaceChildren(...[["", "☀️ Hell"], ["ocean", "🌊 Ozean"]].map(([key, label]) => el("button", {
    type: "button", class: cur() === key ? "on" : "", "aria-pressed": String(cur() === key), onclick: () => { setDesign(key); draw(); },
  }, label)));
  draw();
  return el("div", { class: "card" },
    el("h3", {}, "🎨 Design"),
    el("p", { class: "muted small" }, "Mit einem Tipp zwischen Hell und Ozean wechseln. Gilt nur auf diesem Gerät."),
    sw);
}

function installCard() {
  if (isInstalled()) return null;
  return el("div", { class: "card" },
    el("h3", {}, "📲 App aufs Handy"),
    el("p", { class: "muted small" }, "Einmal installieren – dann startet die App direkt vom Startbildschirm, wie eine normale App."),
    el("div", { class: "actions" }, el("button", { class: "btn ghost", onclick: openInstallHelp }, isIOS() ? "So geht's auf dem iPhone" : "Als App installieren")));
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

// Ganz oben nach unten ziehen: Loslassen oder kurz halten aktualisiert die Daten (und sucht nach einer neuen App-Version)
(function pullToRefresh() {
  const PULL = 90;      // so weit muss der Finger ziehen (Pixel)
  const HOLD = 500;     // gezogen und gehalten: danach aktualisiert es von selbst (ms)
  const box = el("div", { class: "ptr", hidden: true, "aria-live": "polite" });
  document.body.append(box);
  let startX = 0, startY = 0, active = false, ready = false, busyNow = false, timer = null;
  const show = (text, cls = "") => { box.textContent = text; box.className = "ptr " + cls; box.hidden = false; };
  const hide = () => { box.hidden = true; box.style.removeProperty("--ptr-y"); };
  const reset = () => { active = false; ready = false; clearTimeout(timer); timer = null; };
  const blocked = (t) => modal.open || t.closest("input,textarea,select,[contenteditable]")
    || ["INPUT", "TEXTAREA", "SELECT"].includes((document.activeElement || {}).tagName);
  // Innen scrollende Bereiche nicht stören
  const innerScrolled = (t) => { for (let n = t; n && n !== document.body; n = n.parentElement) if (n.scrollTop > 0) return true; return false; };
  const refresh = async () => {
    if (busyNow) return;
    reset();
    // Halb ausgefülltes Formular nicht einfach überschreiben
    if (state.dirty && !confirm("Nicht gespeicherte Eingaben gehen verloren. Trotzdem aktualisieren?")) { hide(); return; }
    busyNow = true;
    show("⟳ Wird aktualisiert …", "spin");
    box.style.setProperty("--ptr-y", "16px");
    try {
      navigator.serviceWorker && navigator.serviceWorker.getRegistration && navigator.serviceWorker.getRegistration().then((r) => r && r.update()).catch(() => {});
      if (!state.profile || !state.active) return location.reload();
      await render();
      show("✓ Aktualisiert", "ok");
    } catch (e) { hide(); fail(e); }
    finally { busyNow = false; setTimeout(() => { if (!busyNow && !active) hide(); }, 900); }
  };
  document.addEventListener("touchstart", (e) => {
    reset();
    if (busyNow || e.touches.length !== 1 || window.scrollY > 0 || blocked(e.target) || innerScrolled(e.target)) return;
    startX = e.touches[0].clientX; startY = e.touches[0].clientY; active = true;
  }, { passive: true });
  document.addEventListener("touchmove", (e) => {
    if (!active) return;
    const dx = e.touches[0].clientX - startX, dy = e.touches[0].clientY - startY;
    if (e.touches.length !== 1 || window.scrollY > 0 || dy < 0 || Math.abs(dx) > Math.max(dy, 12)) { reset(); if (!busyNow) hide(); return; }
    if (dy < 15) return;
    box.style.setProperty("--ptr-y", Math.min(dy * 0.4, 44) + "px");
    if (dy >= PULL) {
      if (!ready) { ready = true; show("↻ Loslassen zum Aktualisieren", "ok"); timer = setTimeout(refresh, HOLD); }
    } else {
      ready = false; clearTimeout(timer); timer = null;
      show("↓ Weiter ziehen zum Aktualisieren");
    }
  }, { passive: true });
  const end = () => {
    if (!active) return;
    const go = ready; reset();
    if (go) refresh(); else if (!busyNow) hide();
  };
  document.addEventListener("touchend", end, { passive: true });
  document.addEventListener("touchcancel", () => { reset(); if (!busyNow) hide(); }, { passive: true });
})();

async function render() {
  if (!state.profile) return;
  state.dirty = false;
  // Sperrseiten immer zuerst – egal von wo render() aufgerufen wird
  if (state.profile.must_change_password) return renderForcePassword();
  if (!state.active) return renderWaiting();
  const tabs = isAdmin()
    ? (showToday() ? [["today", "☀️ Heute"]] : []).concat([["calendar", "Kalender"], ["requests", "Anfragen"], ["students", "Schüler"], ["training", "Ausbildung"], ["control", "Kontrolle"], ["settings", "Einstellungen"]])
      .concat(isOwner() || isSchoolAdmin() ? [["teachers", "👥", "Fahrlehrer"]] : [])
    : [["calendar", "Kalender"], ["mine", "Fahrstunden"], ["training", "Ausbildung"], ["profile", "👤", "Profil"]];

  // Kleine Symbol-Tabs (👥 Fahrlehrer, 👤 Profil) sparen eine Zeile; der Name steht als Hinweis dran
  const tabbar = el("div", { class: "tabs" }, tabs.map(([id, label, title]) =>
    el("button", { class: "tab" + (title ? " tab-icon" : "") + (state.tab === id ? " active" : ""), "data-tab": id, title, "aria-label": title, onclick: () => goTab(id) }, label)));
  const content = el("div", {}, el("p", { class: "muted" }, "Lädt …"));
  const back = state.tab !== homeTab()
    ? el("button", { class: "btn small ghost backbtn", onclick: goBack }, "‹ Zurück") : null;
  // Fahrlehrer: Zugang läuft bald ab → Hinweis oben
  const left = isAdmin() && !isOwner() ? daysLeft(state.profile.valid_until) : null;
  const expiryNote = left !== null && left <= 30 ? el("div", { class: "notice", style: "margin-bottom:12px" }, el("b", {}, "⏳ "),
    left === 0 ? "Dein Zugang läuft heute ab." : `Dein Zugang läuft am ${fmtUntil(state.profile.valid_until)} ab (noch ${left} Tag${left === 1 ? "" : "e"}).`,
    state.profile.school_id ? " Sprich deine Fahrschule an, um ihn zu verlängern." : " Melde dich beim Betreiber der App, um ihn zu verlängern.") : null;
  app.replaceChildren(...[tabbar, back, expiryNote, content].filter(Boolean));
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
    else if (state.tab === "control") view = await adminControl();
    else if (state.tab === "today") view = await adminToday();
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
        list.push({ starts_at: at.toISOString(), duration_min: s.duration_min, meeting_point: s.meeting_point || null });
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

// Handy: statt Mo–So eine fortlaufende Liste ab heute (7 Tage) – heute steht oben.
// Die 5 Tage davor werden mitgeladen, liegen aber versteckt unter einem Balken („▲ Letzte 5 Tage“).
// Ältere oder spätere Tage über ‹ › oder „📅 Datum“ wählen.
const PHONE_MQ = matchMedia("(max-width: 600px)");
const isPhone = () => PHONE_MQ.matches;
const PHONE_DAYS = 17, PAST_DAYS = 5;   // Handy: 17 Tage = gut 14 Tage ohne Sonntage
const dayStart = (d) => { d = new Date(d); return new Date(d.getFullYear(), d.getMonth(), d.getDate()); };
// state.listStart = erster sichtbarer Tag (Standard: heute)
const listAnchor = () => state.listStart || (state.listStart = dayStart(new Date()));
function viewRange() {
  if (!isPhone()) return { from: state.weekStart, days: 7 };
  return { from: addDays(listAnchor(), -PAST_DAYS), days: PAST_DAYS + PHONE_DAYS };
}
// Kalender auf ein Datum springen lassen (z. B. nach dem Anlegen)
function showDate(d) {
  state.weekStart = startOfWeek(d);
  const a = listAnchor(), day = dayStart(d);
  if (isPhone() && (day < a || day >= addDays(a, PHONE_DAYS))) state.listStart = day;
}
// Beim Drehen/Umschalten zwischen Handy- und Tablet-Breite neu zeichnen (nicht mitten in einem Fenster)
PHONE_MQ.addEventListener("change", () => { if (state.profile && !document.querySelector("dialog[open]")) render(); });

function weekBar(extra) {
  const r = isPhone() ? { from: listAnchor(), days: PHONE_DAYS } : viewRange(), end = addDays(r.from, r.days - 1);
  const go = (n) => {
    if (isPhone()) state.listStart = addDays(r.from, n); else state.weekStart = addDays(state.weekStart, n);
    render();
  };
  const pick = el("input", { type: "date", value: dateInput(r.from), "aria-label": "Datum wählen", class: "date-jump" });
  pick.addEventListener("change", () => {
    if (!pick.value) return;
    const d = fromInputs(pick.value, "00:00");
    state.weekStart = startOfWeek(d);
    state.listStart = dayStart(d);
    render();
  });
  return el("div", { class: "weekbar" },
    el("div", { class: "actions", style: "margin:0" },
      el("button", { class: "btn small ghost", onclick: () => go(-7), "aria-label": "Früher" }, "‹"),
      el("button", { class: "btn small ghost", onclick: () => { state.weekStart = startOfWeek(new Date()); state.listStart = null; state.showPast = false; render(); } }, "Heute"),
      el("button", { class: "btn small ghost", onclick: () => go(7), "aria-label": "Später" }, "›"),
      el("label", { class: "btn small ghost date-pick", title: "Datum wählen",
        onclick: () => { try { pick.showPicker(); } catch { /* ältere Browser: Feld öffnet sich selbst */ } } }, "📅 Datum", pick)),
    el("span", { class: "title" }, `${fmtDay(r.from)} – ${fmtDay(end)} ${end.getFullYear()}`),
    el("div", { class: "actions", style: "margin:0" }, extra,
      el("button", { class: "btn small ghost", onclick: () => render() }, "↻ Aktualisieren")),
  );
}

// Kopfzeile eines Kalender-Eintrags: Uhrzeit links, Status-Wort rechts (statt Legende über dem Kalender)
const slotHead = (time, tag) => el("div", { class: "slot-head" }, el("b", {}, time), tag ? el("span", { class: "slot-tag" }, tag) : null);


/* ---------------- Urlaub / freie Tage ---------------- */

// Gesperrte Zeiträume des (eigenen) Fahrlehrers – werden beim Laden des Kalenders gefüllt
// Krank oder Urlaub: Fahrstunden im Zeitraum absagen, Tage sperren und alle (oder nur betroffene) Schüler benachrichtigen –
// per Push-Mitteilung, E-Mail (alle auf einmal, als Bcc) und WhatsApp (Text vorbereitet, je Schüler ein Knopf)
const AWAY = {
  krank: { icon: "🤒", label: "Krank", note: "krank", reason: "Fahrlehrer krank", subject: "Fahrstunde fällt aus – Fahrlehrer krank",
    send: "🤒 Krankmeldung senden", done: "Krankmeldung gespeichert",
    text: "Ich bin leider krank. Deine Fahrstunde in diesem Zeitraum fällt aus – die Absage ist für dich kostenlos. Such dir in der App gern einen neuen Termin aus. Danke für dein Verständnis!" },
  urlaub: { icon: "🏖️", label: "Urlaub", note: "Urlaub", reason: "Fahrlehrer im Urlaub", subject: "Urlaub – in dieser Zeit keine Fahrstunden",
    send: "🏖️ Urlaub eintragen & senden", done: "Urlaub eingetragen",
    text: "Ich bin in dieser Zeit im Urlaub – es finden keine Fahrstunden statt. Falls du da schon eine Fahrstunde hattest, fällt sie aus (kostenlos für dich). Such dir in der App gern einen Termin davor oder danach aus." },
};
async function openSick(kind = "krank") {
  const today = dateInput(new Date());
  const from = el("input", { type: "date", value: today, min: today });
  const to = el("input", { type: "date", value: today, min: today });
  const text = el("textarea", { maxlength: 300 }, AWAY[kind].text);
  const cancel = el("input", { type: "checkbox" }); cancel.checked = true;
  const block = el("input", { type: "checkbox" }); block.checked = true;
  const rAll = el("input", { type: "radio", name: "sick-who" }), rHit = el("input", { type: "radio", name: "sick-who" });
  rHit.checked = true;
  // Umschalten Krank ↔ Urlaub: Text (falls nicht selbst geändert), Knopf und Empfänger anpassen
  const kindBtns = Object.keys(AWAY).map((k) => el("button", { type: "button", class: "tab", onclick: () => setKind(k) }, `${AWAY[k].icon} ${AWAY[k].label}`));
  function setKind(k) {
    if (text.value === AWAY[kind].text) text.value = AWAY[k].text;
    kind = k;
    kindBtns.forEach((b, i) => b.classList.toggle("active", Object.keys(AWAY)[i] === k));
    btn.textContent = AWAY[k].send;
    (k === "urlaub" ? rAll : rHit).checked = true;  // Urlaub: alle vorher informieren; krank: nur betroffene
  }
  const info = el("p", { class: "small muted" });
  let students = [], hit = [];
  const range = () => {
    const a = new Date(from.value + "T00:00:00"), b = addDays(new Date((to.value || from.value) + "T00:00:00"), 1);
    if (isNaN(a) || isNaN(b) || b <= a) throw new Error("Bitte einen gültigen Zeitraum wählen");
    return [a, b];
  };
  const load = async () => {
    try {
      const [a, b] = range();
      const [st, bk] = await Promise.all([
        students.length ? { data: students } : sb.from("profiles").select("id,first_name,last_name,email,phone").eq("role", "student").eq("status", "active").order("last_name"),
        sb.from("bookings").select("id,status,student_id,slots!inner(starts_at,duration_min)").in("status", ["requested", "offered", "confirmed"])
          .is("actual_minutes", null).gte("slots.starts_at", a.toISOString()).lt("slots.starts_at", b.toISOString()),
      ]);
      if (st.error) throw st.error;
      if (bk.error) throw bk.error;
      students = st.data || []; hit = bk.data || [];
      const n = new Set(hit.map((x) => x.student_id)).size;
      info.textContent = `Im Zeitraum: ${hit.length} Fahrstunde${hit.length === 1 ? "" : "n"}/Anfrage${hit.length === 1 ? "" : "n"} bei ${n} Schüler${n === 1 ? "" : "n"}.`;
      rHit.nextSibling.textContent = ` Nur betroffene Schüler (${n})`;
      rAll.nextSibling.textContent = ` Alle meine Schüler (${students.length})`;
    } catch (e) { info.textContent = e.message || String(e); }
  };
  from.addEventListener("change", () => { if (to.value < from.value) to.value = from.value; load(); });
  to.addEventListener("change", load);
  const btn = el("button", { class: "btn danger" });
  btn.onclick = () => busy(btn, async () => {
    const K = AWAY[kind];
    const [a, b] = range();
    if (!text.value.trim()) text.value = K.text;   // Text ist freiwillig – sonst der vorbereitete
    const hitIds = new Set(hit.map((x) => x.student_id));
    const who = rAll.checked ? students : students.filter((x) => hitIds.has(x.id));
    const span = from.value === to.value ? fmtDayStr(from.value) : `${fmtDayStr(from.value)} – ${fmtDayStr(to.value)}`;
    if (!confirm(`${K.label} für ${span} eintragen und senden?` + (cancel.checked && hit.length ? `\n\n${hit.length} Fahrstunde(n)/Anfrage(n) werden abgesagt.` : ""))) return;
    if (cancel.checked && hit.length) {
      const now = new Date().toISOString(), reason = K.reason;
      const conf = hit.filter((x) => x.status !== "requested").map((x) => x.id), req = hit.filter((x) => x.status === "requested").map((x) => x.id);
      if (conf.length) { const { error } = await sb.from("bookings").update({ status: "cancelled_teacher", cancel_reason: reason, decided_at: now }).in("id", conf); if (error) throw error; }
      if (req.length) { const { error } = await sb.from("bookings").update({ status: "rejected", admin_reply: reason, decided_at: now }).in("id", req); if (error) throw error; }
    }
    if (block.checked) {
      const { error } = await sb.from("time_off").insert({ from_day: from.value, to_day: to.value || from.value, note: K.note });
      if (error) throw error;
    }
    const msg = `${K.icon} ${span}: ${text.value.trim()}`;
    let sent = 0;
    if (who.length) {
      try {
        const { data } = await sb.functions.invoke("notify", { body: { kind: "broadcast", ids: who.map((x) => x.id), text: msg } });
        sent = (data && data.sent) || 0;
      } catch { /* Mitteilung ist kein Muss */ }
    }
    sickShare(who, msg, sent, K);
  });
  setKind(kind);
  openModal("🤒 Krank / 🏖️ Urlaub",
    el("div", { class: "tabs kind-tabs" }, kindBtns),
    el("p", { class: "muted small" }, "Sagt deine Fahrstunden im Zeitraum ab, sperrt die Tage und benachrichtigt deine Schüler – per Mitteilung aufs Handy, E-Mail und WhatsApp. Urlaub kannst du schon lange im Voraus eintragen."),
    el("div", { class: "row" }, el("div", {}, el("label", {}, "Von"), from), el("div", {}, el("label", {}, "Bis"), to)),
    info,
    el("label", { class: "check" }, cancel, "Fahrstunden und Anfragen in diesem Zeitraum absagen (kostenlos für die Schüler)"),
    el("label", { class: "check" }, block, "Tage sperren – Schüler können dort nichts anfragen"),
    el("label", {}, "Wer soll benachrichtigt werden?"),
    el("label", { class: "check" }, rHit, " Nur betroffene Schüler"),
    el("label", { class: "check" }, rAll, " Alle meine Schüler"),
    el("label", {}, "Nachricht"), text,
    el("div", { class: "actions" }, btn, el("button", { class: "btn ghost", onclick: closeModal }, "Abbrechen")));
  load();
}
// Nach der Krankmeldung: E-Mail an alle (Bcc) und WhatsApp je Schüler
function sickShare(who, msg, sent, K = AWAY.krank) {
  state.renderOnClose = true;
  const full = `${msg}\n\n${teacherSignature()}`;
  const mails = who.map((x) => x.email).filter(Boolean);
  const mail = mails.length ? el("a", { class: "btn", href: `mailto:?bcc=${encodeURIComponent(mails.join(","))}&subject=${encodeURIComponent(K.subject)}&body=${encodeURIComponent(full)}` }, `📧 E-Mail an alle (${mails.length})`) : null;
  const copy = el("button", { class: "btn ghost" }, "📋 Text kopieren");
  copy.onclick = async () => { try { await navigator.clipboard.writeText(full); toast("Text kopiert – z. B. für eine WhatsApp-Broadcast-Liste."); } catch { toast("Kopieren nicht möglich."); } };
  const wa = who.map((x) => ({ x, b: waButton(x.phone, `Hallo ${x.first_name || ""},\n${full}`, `💬 ${fullName(x)}`) }));
  openModal("✓ " + K.done,
    el("p", {}, who.length ? `📱 Mitteilung an ${sent} Gerät${sent === 1 ? "" : "e"} geschickt (nur Schüler mit eingeschalteten Mitteilungen).` : "Niemand betroffen – keine Mitteilung nötig."),
    who.length ? [
      el("div", { class: "note" }, full),
      el("div", { class: "actions" }, mail, copy),
      el("h3", {}, "💬 WhatsApp"),
      el("p", { class: "muted small" }, "WhatsApp erlaubt kein automatisches Senden an viele – tippe nacheinander auf die Namen, der Text ist schon drin."),
      el("div", { class: "done-row wa-list" }, wa.filter((w) => w.b).map((w) => w.b)),
      wa.some((w) => !w.b) ? el("p", { class: "muted small" }, "Ohne Handynummer: " + wa.filter((w) => !w.b).map((w) => fullName(w.x)).join(", ")) : null,
    ] : null,
    el("div", { class: "actions" }, el("button", { class: "btn ghost", onclick: closeModal }, "Schließen")));
}

async function loadTimeOff() {
  const { data } = await sb.from("time_off").select("id,from_day,to_day,note").order("from_day");
  state.timeOff = data || [];
  // Eigene Einträge (Schüler ohne App) ab gestern – dort werden keine Fahrstunden angelegt
  const since = addDays(dayStart(new Date()), -1).toISOString();
  const [b, tb] = await Promise.all([
    sb.from("own_entries").select("id,starts_at,duration_min").gte("starts_at", since),
    sb.from("time_blocks").select("id,starts_at,duration_min").gte("starts_at", since),
  ]);
  state.timeBlocks = (b.data || []).concat(tb.data || []);
  return state.timeOff;
}
const blockAt = (startMs, durMin) => (state.timeBlocks || []).find((b) => { const s = new Date(b.starts_at).getTime(); return startMs < s + b.duration_min * 60000 && startMs + durMin * 60000 > s; });

// Theorie und eigene Einträge (Schüler ohne App) eines Zeitraums – nur für den Fahrlehrer sichtbar
async function loadPlanned(from, to) {
  const [t, o, bl] = await Promise.all([
    sb.from("theory_lessons").select("id,held_at,duration_min,note").eq("teacher_id", state.profile.id).gte("held_at", from.toISOString()).lt("held_at", to.toISOString()),
    sb.from("own_entries").select("id,kind,lesson_type,student_name,starts_at,duration_min,done,note").eq("teacher_id", state.profile.id).gte("starts_at", from.toISOString()).lt("starts_at", to.toISOString()),
    sb.from("time_blocks").select("id,starts_at,duration_min,reason").eq("teacher_id", state.profile.id).gte("starts_at", from.toISOString()).lt("starts_at", to.toISOString()),
  ]);
  return { theory: t.data || [], own: o.data || [], blocks: bl.data || [] };
}
const ownLabel = (x) => (x.kind === "exam" ? "🎓 Prüfung" : typeLabel(x.lesson_type));
async function setOwnDone(x, on) {
  const { error } = await sb.from("own_entries").update({ done: on }).eq("id", x.id);
  if (error) throw error;
  toast(on ? `${x.student_name}: ${x.duration_min} Min. gefahren` : "Haken zurückgenommen");
  render();
}
// Blockierte Zeit: anzeigen und löschen
function openBlock(x) {
  const del = el("button", { class: "btn danger" }, "🗑 Blockierung aufheben");
  del.onclick = () => busy(del, async () => {
    if (!confirm("Blockierung aufheben?")) return;
    const { error } = await sb.from("time_blocks").delete().eq("id", x.id);
    if (error) throw error;
    closeModal(); toast("Blockierung aufgehoben."); render();
  });
  openModal("🚫 Blockiert",
    el("p", {}, el("b", {}, fmtDate(x.starts_at)), el("br"), `${fmtRange(x.starts_at, x.duration_min)} Uhr`),
    el("div", { class: "note" }, "Grund: ", x.reason),
    el("p", { class: "small muted" }, "Nur du siehst diesen Eintrag. Freie Termine in dieser Zeit sehen Schüler nicht."),
    el("div", { class: "actions" }, del, el("button", { class: "btn ghost", onclick: closeModal }, "Schließen")));
}
function openPlanned(kind, x) {
  const isT = kind === "theory", start = isT ? x.held_at : x.starts_at, text = x.note;
  const del = el("button", { class: "btn danger" }, "🗑 Löschen");
  del.onclick = () => busy(del, async () => {
    if (!confirm(isT ? "Diese Theoriestunde löschen?" : "Diesen Eintrag löschen? Er verschwindet auch aus Kontrolle und Lohnberechnung.")) return;
    const { error } = await sb.from(isT ? "theory_lessons" : "own_entries").delete().eq("id", x.id);
    if (error) throw error;
    closeModal(); toast("Gelöscht."); render();
  });
  let tick = null;
  if (!isT && x.kind === "lesson") {
    tick = el("button", { class: "btn" + (x.done ? " ghost" : " ok") }, x.done ? "Haken zurücknehmen" : "✓ Als gefahren abhaken");
    tick.onclick = () => busy(tick, async () => { await setOwnDone(x, !x.done); closeModal(); });
  }
  // Ändern: Schüler ohne App (und Theorie) sofort – es wird anderweitig abgesprochen
  const eDate = el("input", { type: "date", value: dateInput(start) });
  const eTime = el("input", { type: "time", value: timeInput(start), step: 300 });
  const eDur = durationControl(x.duration_min);
  const eName = isT ? null : el("input", { maxlength: 80, value: x.student_name || "" });
  const eSave = el("button", { class: "btn" }, "Änderung speichern");
  eSave.onclick = () => busy(eSave, async () => {
    const at = fromInputs(eDate.value, eTime.value);
    if (isNaN(at)) throw new Error("Bitte Datum und Uhrzeit angeben");
    if (eName && !eName.value.trim()) throw new Error("Bitte den Namen eintragen");
    const { error } = isT
      ? await sb.from("theory_lessons").update({ held_at: at.toISOString(), duration_min: eDur.value }).eq("id", x.id)
      : await sb.from("own_entries").update({ starts_at: at.toISOString(), duration_min: eDur.value, student_name: eName.value.trim() }).eq("id", x.id);
    if (error) throw error;
    closeModal(); toast("Geändert."); render();
  });
  const editBox = el("details", { class: "fold" }, el("summary", {}, "✎ Ändern (Datum, Uhrzeit, Dauer)"),
    eName ? [el("label", {}, "Name"), eName] : null,
    el("div", { class: "row" }, el("div", {}, el("label", {}, "Datum"), eDate), el("div", {}, el("label", {}, "Beginn"), eTime)),
    el("label", {}, "Dauer"), eDur.node,
    el("p", { class: "muted small" }, isT ? "" : "Der Schüler hat keine App – die Änderung gilt sofort."),
    el("div", { class: "actions" }, eSave));
  openModal(isT ? "📚 Theorieunterricht" : `${ownLabel(x)} · ${x.student_name}`,
    el("p", {}, el("b", {}, fmtDate(start)), el("br"), `${fmtRange(start, x.duration_min)} Uhr · ${x.duration_min} Min.`),
    editBox,
    !isT ? el("p", { class: "small muted" }, "Eintrag nur für deinen Kalender – der Schüler hat keinen App-Zugang, andere Schüler sehen diese Zeit nicht als frei.") : null,
    !isT && x.kind === "lesson" ? el("p", {}, x.done ? "✓ Abgehakt – zählt in Kontrolle und Lohn" : "☐ Noch nicht abgehakt") : null,
    text ? el("p", {}, "Notiz: ", text) : null,
    el("div", { class: "actions" }, tick, del, el("button", { class: "btn ghost", onclick: closeModal }, "Schließen")));
}
// Einträge für die Kalender-Woche (eigene Einträge sehen aus wie normale Fahrstunden/Prüfungen, nur mit 📵 = ohne App)
const plannedExtras = (p) => (p.blocks || []).map((x) => ({ at: x.starts_at,
  node: el("button", { class: "slot block", onclick: (ev) => { ev.stopPropagation(); openBlock(x); } },
    slotHead(`🚫 ${fmtRange(x.starts_at, x.duration_min)}`, "blockiert"), x.reason) })).concat(p.theory.map((t) => ({ at: t.held_at,
  node: el("button", { class: "slot theory", onclick: (ev) => { ev.stopPropagation(); openPlanned("theory", t); } },
    slotHead(fmtRange(t.held_at, t.duration_min), "Theorie"), "📚 Theorieunterricht" + (t.note ? ` · ${t.note}` : "")) })))
  .concat(p.own.map((x) => ({ at: x.starts_at,
    node: x.kind === "exam"
      ? el("button", { class: "slot exam", onclick: (ev) => { ev.stopPropagation(); openPlanned("own", x); } },
          slotHead(`🎓 ${fmtRange(x.starts_at, x.duration_min)}`, "Prüfung"), x.student_name)
      : el("button", { class: "slot " + (x.done ? "done" : "confirmed"), onclick: (ev) => { ev.stopPropagation(); openPlanned("own", x); } },
          slotHead(fmtRange(x.starts_at, x.duration_min), x.done ? "gefahren" : "bestätigt"),
          (x.done ? `✓ ${x.duration_min} Min. ${LESSON_ICON[x.lesson_type] || ""} · ` : "") + x.student_name) })));
// Einträge für „Heute“
const plannedToday = (p, day) => (p.blocks || []).filter((x) => sameDay(new Date(x.starts_at), day)).map((x) => ({ at: x.starts_at,
  node: el("div", { class: "tr block" }, el("div", { class: "tr-head" }, el("b", { class: "tr-time" }, fmtTime(x.starts_at)),
    el("span", { class: "tr-name" }, "🚫 " + x.reason), el("span", { class: "tr-pill" }, `bis ${fmtTime(addMin(x.starts_at, x.duration_min))}`),
    el("button", { class: "tr-icon", title: "Details", onclick: () => openBlock(x) }, "⋯"))) })).concat(p.theory.filter((t) => sameDay(new Date(t.held_at), day)).map((t) => ({ at: t.held_at,
  node: el("div", { class: "tr theory" }, el("div", { class: "tr-head" }, el("b", { class: "tr-time" }, fmtTime(t.held_at)),
    el("span", { class: "tr-name" }, "📚 Theorieunterricht" + (t.note ? ` · ${t.note}` : "")), el("span", { class: "tr-pill" }, `${t.duration_min} Min.`),
    el("button", { class: "tr-icon", title: "Details", onclick: () => openPlanned("theory", t) }, "⋯"))) }))
  .concat(p.own.filter((x) => sameDay(new Date(x.starts_at), day)).map((x) => {
    const start = new Date(x.starts_at).getTime(), end = start + x.duration_min * 60000, now = Date.now();
    const name = el("button", { type: "button", class: "tr-name name-link", title: "Details", onclick: () => openPlanned("own", x) }, (x.kind === "exam" ? "🎓 " : "") + x.student_name);
    if (x.kind === "exam") return { at: x.starts_at, node: el("div", { class: "tr exam" }, el("div", { class: "tr-head" }, el("b", { class: "tr-time" }, fmtTime(x.starts_at)), name, el("span", { class: "tr-pill" }, "Prüfung"))) };
    const phase = x.done ? "done" : now >= start && now < end ? "live" : now >= end ? "over" : "next";
    const canTick = !x.done && now >= start - 45 * 60000;
    return { at: x.starts_at, node: el("div", { class: "tr " + phase }, el("div", { class: "tr-head" }, el("b", { class: "tr-time" }, fmtTime(x.starts_at)), name,
      x.done ? el("span", { class: "tr-pill ok" }, `✓ ${x.duration_min} Min.`)
        : el("button", { type: "button", class: "tr-pill tap" + (phase === "live" ? " live" : phase === "over" ? " over" : ""), onclick: () => openPlanned("own", x) }, `${x.duration_min} Min. ✎`),
      canTick ? el("button", { class: "tr-tick", title: "Gefahren abhaken", "aria-label": "Gefahren abhaken", onclick: (ev) => { ev.currentTarget.disabled = true; setOwnDone(x, true).catch(fail); } }, "✓") : null,
      el("button", { class: "tr-icon", title: "Details", onclick: () => openPlanned("own", x) }, "⋯")),
      phase === "next" && !canTick ? el("div", { class: "tr-foot" }, el("button", { type: "button", class: "tr-cancel", title: "Fahrstunde absagen", onclick: () => cancelOwn(x) }, "Absagen")) : null) };
  })));
// Fahrstunde eines Schülers ohne App absagen = Eintrag entfernen
async function cancelOwn(x) {
  if (!confirm(`Fahrstunde mit ${x.student_name} am ${fmtDate(x.starts_at)} um ${fmtTime(x.starts_at)} Uhr absagen? Der Eintrag wird entfernt.`)) return;
  const { error } = await sb.from("own_entries").delete().eq("id", x.id);
  if (error) return fail(error);
  toast(`Fahrstunde mit ${x.student_name} abgesagt.`);
  render();
}
// Prüft, ob die neuen Einträge mit etwas Bestehendem kollidieren → verständliche Meldung statt Doppelbelegung
async function findClash(items) {
  const starts = items.map((x) => new Date(x.starts_at).getTime()), ends = items.map((x, i) => starts[i] + x.duration_min * 60000);
  const lo = new Date(Math.min(...starts) - 6 * 3600000).toISOString(), hi = new Date(Math.max(...ends)).toISOString();
  const [sl, ow, ex] = await Promise.all([
    sb.from("slots").select("starts_at,duration_min,bookings(status,profiles(first_name,last_name))").gte("starts_at", lo).lt("starts_at", hi),
    sb.from("own_entries").select("student_name,starts_at,duration_min").eq("teacher_id", state.profile.id).gte("starts_at", lo).lt("starts_at", hi),
    sb.from("exams").select("exam_at,duration_min,profiles(first_name,last_name)").gte("exam_at", lo).lt("exam_at", hi),
  ]);
  const hit = (aS, aD, bS, bD) => aS < bS + bD * 60000 && bS < aS + aD * 60000;
  const when = (iso, d) => `${fmtDay(iso)} ${fmtRange(iso, d)} Uhr`;
  for (let i = 0; i < items.length; i++) {
    const x = items[i];
    for (const q of sl.data || []) {
      const bk = (q.bookings || []).find((y) => ["requested", "confirmed", "offered"].includes(y.status));
      if (bk && hit(starts[i], x.duration_min, new Date(q.starts_at).getTime(), q.duration_min)) return `Nicht gespeichert: Zu dieser Zeit ist schon eine Fahrstunde mit ${fullName(bk.profiles)} eingetragen (${when(q.starts_at, q.duration_min)}). Bitte eine andere Zeit wählen.`;
    }
    for (const q of ow.data || []) if (hit(starts[i], x.duration_min, new Date(q.starts_at).getTime(), q.duration_min)) return `Nicht gespeichert: Zu dieser Zeit ist schon ${q.student_name} eingetragen (${when(q.starts_at, q.duration_min)}). Bitte eine andere Zeit wählen.`;
    for (const q of ex.data || []) if (hit(starts[i], x.duration_min, new Date(q.exam_at).getTime(), q.duration_min || 55)) return `Nicht gespeichert: Zu dieser Zeit ist schon eine Prüfung von ${fullName(q.profiles)} eingetragen (${when(q.exam_at, q.duration_min || 55)}). Bitte eine andere Zeit wählen.`;
  }
  return "";
}
const offOn = (day) => { const d = dateInput(day); return (state.timeOff || []).find((t) => d >= t.from_day && d <= t.to_day); };
const fmtDayStr = (s) => new Date(s + "T12:00:00").toLocaleDateString("de-DE", { weekday: "short", day: "2-digit", month: "2-digit", year: "numeric" });
const offRange = (t) => (t.from_day === t.to_day ? fmtDayStr(t.from_day) : `${fmtDayStr(t.from_day)} – ${fmtDayStr(t.to_day)}`);
// Kalender-Einträge „Urlaub“ für jeden gesperrten Tag der angezeigten Woche
function offExtras(onClick) {
  const list = [];
  const r = viewRange();
  for (let i = 0; i < r.days; i++) {
    const day = addDays(r.from, i), t = offOn(day);
    if (t) list.push({ at: new Date(day.getFullYear(), day.getMonth(), day.getDate(), 0, 0).toISOString(),
      node: el(onClick ? "button" : "div", { class: "slot off", onclick: onClick ? (e) => { e.stopPropagation(); onClick(); } : null },
        slotHead("🏖️ Ganzer Tag", "gesperrt / " + (t.note || "Urlaub")), onClick ? null : "Fahrlehrer nicht verfügbar") });
  }
  return list;
}

// Nach dem Sperren: freie Termine in diesen Tagen löschen (nach Rückfrage), gebuchte nur melden
async function afterTimeOff(fromKey, toKey) {
  const start = fromInputs(fromKey, "00:00"), end = addDays(fromInputs(toKey, "00:00"), 1);
  const { data: slots } = await sb.from("slots").select("id,starts_at,bookings(status)")
    .eq("teacher_id", state.profile.id).gte("starts_at", start.toISOString()).lt("starts_at", end.toISOString());
  const isBooked = (x) => (x.bookings || []).some((b) => ["requested", "confirmed", "offered"].includes(b.status));
  const booked = (slots || []).filter(isBooked);
  await loadTimeOff();
  const freeOff = (slots || []).filter((x) => !isBooked(x) && offOn(new Date(x.starts_at)));
  if (freeOff.length && confirm(`An diesen Tagen gibt es ${freeOff.length} freie Termin${freeOff.length === 1 ? "" : "e"}. Jetzt löschen?`)) {
    const { error } = await sb.from("slots").delete().in("id", freeOff.map((x) => x.id));
    if (error) throw error;
  }
  const bookedOff = booked.filter((x) => offOn(new Date(x.starts_at)));
  if (bookedOff.length) alert(`Achtung: An diesen Tagen gibt es ${bookedOff.length} angefragte/gebuchte Fahrstunde${bookedOff.length === 1 ? "" : "n"}. Bitte im Kalender selbst absagen oder verschieben.`);
}

async function openTimeOff() {
  state.renderOnClose = true;
  const list = await loadTimeOff();
  const from = el("input", { type: "date", value: dateInput(new Date()) });
  const to = el("input", { type: "date", value: dateInput(new Date()) });
  from.addEventListener("change", () => { if (to.value < from.value) to.value = from.value; });
  const note = el("input", { maxlength: 100, value: "Urlaub", placeholder: "z. B. Urlaub, Fortbildung, Feiertag" });
  const chips = el("div", { class: "chips" }, ["Urlaub", "Frei", "Krank", "Fortbildung", "Feiertag"].map((t) =>
    el("button", { type: "button", class: "btn small ghost", onclick: () => (note.value = t) }, t)));
  const save = el("button", { class: "btn" }, "Tage sperren");
  save.onclick = () => busy(save, async () => {
    if (!from.value || !to.value || to.value < from.value) throw new Error("Bitte gültigen Zeitraum wählen (bis ≥ von)");
    const { error } = await sb.from("time_off").insert({ from_day: from.value, to_day: to.value, note: note.value.trim() || null });
    if (error) throw error;
    // Termine im gesperrten Zeitraum prüfen: freie löschen (nach Rückfrage), gebuchte nur melden
    const start = fromInputs(from.value, "00:00"), end = addDays(fromInputs(to.value, "00:00"), 1);
    const { data: slots } = await sb.from("slots").select("id,starts_at,bookings(status)")
      .gte("starts_at", start.toISOString()).lt("starts_at", end.toISOString());
    const isBooked = (x) => (x.bookings || []).some((b) => ["requested", "confirmed", "offered"].includes(b.status));
    const free = (slots || []).filter((x) => !isBooked(x)), booked = (slots || []).filter(isBooked);
    let msg = "Zeitraum gesperrt.";
    if (free.length && confirm(`In diesem Zeitraum gibt es ${free.length} freie Termin${free.length === 1 ? "" : "e"}. Jetzt löschen?`)) {
      const { error: e2 } = await sb.from("slots").delete().in("id", free.map((x) => x.id));
      if (e2) throw e2;
      msg += ` ${free.length} freie Termin${free.length === 1 ? "" : "e"} gelöscht.`;
    }
    if (booked.length) alert(`Achtung: In diesem Zeitraum gibt es ${booked.length} angefragte/gebuchte Fahrstunde${booked.length === 1 ? "" : "n"}. Bitte im Kalender selbst absagen oder verschieben.`);
    toast(msg);
    openTimeOff();
  });
  const row = (t) => el("div", { class: "list-item" },
    el("div", { class: "head" },
      el("div", {}, el("b", {}, "🏖️ " + (t.note || "Frei")), el("div", {}, offRange(t))),
      el("button", { class: "btn small danger", "aria-label": "Sperre aufheben", onclick: async () => {
        if (!confirm("Diese Sperre aufheben? Die Tage sind dann wieder buchbar.")) return;
        const { error } = await sb.from("time_off").delete().eq("id", t.id);
        if (error) return fail(error);
        toast("Sperre aufgehoben.");
        openTimeOff();
      } }, "× Aufheben")));
  const today = dateInput(new Date());
  const current = list.filter((t) => t.to_day >= today), past = list.filter((t) => t.to_day < today);
  openModal("🏖️ Urlaub & freie Tage",
    el("p", { class: "muted small" }, "An gesperrten Tagen können Schüler nichts anfragen, und beim Anlegen werden diese Tage übersprungen. Schüler sehen „Fahrlehrer nicht verfügbar“."),
    el("div", { class: "row" }, el("div", {}, el("label", {}, "Von"), from), el("div", {}, el("label", {}, "Bis einschließlich"), to)),
    el("label", {}, "Grund (sehen auch die Schüler)"), note, chips,
    el("div", { class: "actions" }, save),
    el("hr"),
    el("h3", {}, "Gesperrt"),
    current.length ? current.map(row) : el("p", { class: "muted small" }, "Keine gesperrten Tage."),
    past.length ? el("details", { class: "fold" }, el("summary", {}, `Vergangene (${past.length})`), past.map(row)) : null);
}

// Sperre eines Tages als kurzer Text: krank, Urlaub oder eigener Grund
function offLabel(t) {
  const note = (t.note || "").trim();
  if (/krank/i.test(note)) return "🤒 Krank – gesperrt";
  if (!note || /urlaub/i.test(note)) return "🏖️ Urlaub – gesperrt";
  return `🚫 ${note} – gesperrt`;
}
// Fahrlehrer: Tagesübersicht – wie viele Termine freigegeben, frei, angefragt, bestätigt, voll belegt oder gesperrt.
// Gibt null zurück, wenn es an dem Tag nichts anzuzeigen gibt.
function dayOverview(daySlots, day, { withOff = true, onClick = null } = {}) {
  const off = withOff ? offOn(day) : null;
  const n = { confirmed: 0, done: 0, requested: 0, offered: 0, free: 0, missed: 0, failed: 0 };
  const now = Date.now();
  for (const s of daySlots) {
    const b = activeBooking(s);
    if (b) n[b.status === "confirmed" && b.actual_minutes !== null && b.actual_minutes !== undefined ? "done" : b.status]++;
    else if (new Date(s.starts_at).getTime() >= now) n.free++;
    else if ((s.bookings || []).some((x) => NOT_HELD_ICON[x.status])) n.failed++;
    else n.missed++;
  }
  const total = daySlots.length, taken = n.confirmed + n.done;
  const chip = (cls, text) => el("span", { class: "ov-chip " + cls }, text);
  const chips = [off ? chip("off", offLabel(off)) : null];
  if (total && taken === total) chips.push(chip("full", `✅ Voll belegt · ${taken} von ${total} ${n.done === total ? "gefahren" : "bestätigt"}`));
  else if (total) chips.push(
    chip("all", `${total} freigegeben`),
    n.free ? chip("free", `${n.free} frei`) : null,
    n.requested ? chip("req", `${n.requested} angefragt`) : null,
    n.offered ? chip("offer", `${n.offered} angeboten`) : null,
    n.confirmed ? chip("conf", `${n.confirmed} bestätigt`) : null,
    n.done ? chip("done", `${n.done} gefahren`) : null,
    n.failed ? chip("done", `${n.failed} ausgefallen`) : null,
    n.missed ? chip("done", `${n.missed} nicht gebucht`) : null);
  if (!chips.some(Boolean)) return null;
  return onClick
    ? el("button", { type: "button", class: "day-ov tap", title: "Im Kalender ansehen", onclick: (e) => { e.stopPropagation(); onClick(day); } }, chips)
    : el("div", { class: "day-ov" }, chips);
}
// Text für Tage ohne Termine (Fahrlehrer): nur für heute und später interessant
const noSlotsText = (day) => (dayStart(day) >= dayStart(new Date()) ? "Keine Termine freigegeben" : "—");

// extras: weitere Einträge im Kalender, z. B. Prüfungen – [{ at, node }]
// overview: nur Fahrlehrer – zeigt je Tag die Zusammenfassung über den Terminen
function weekGrid(slots, renderSlot, onAddDay, extras = [], overview = false) {
  const today = new Date();
  const days = [];
  const r = viewRange();
  for (let i = 0; i < r.days; i++) {
    const day = addDays(r.from, i);
    const daySlots = slots.filter((s) => sameDay(new Date(s.starts_at), day));
    const dayExtras = extras.filter((x) => sameDay(new Date(x.at), day)).map((x) => x.node);
    // Sonntage nur zeigen, wenn dort etwas steht (Tage davor bleiben, damit „Letzte Tage“ stimmt)
    if (isPhone() && i >= PAST_DAYS && day.getDay() === 0 && !daySlots.length && !dayExtras.length) continue;
    days.push(el("div", {
      class: "day" + (sameDay(day, today) ? " today" : "") + (onAddDay ? " tappable" : ""),
      onclick: onAddDay ? (e) => { if (!e.target.closest(".slot")) onAddDay(day); } : null,
    },
      el("div", { class: "day-head" }, el("span", {}, fmtDay(day)),
        onAddDay ? el("button", { class: "plus", title: "Termin an diesem Tag anlegen", onclick: (e) => { e.stopPropagation(); onAddDay(day); } }, "+") : null),
      overview ? dayOverview(daySlots, day, { withOff: false }) : null,
      dayExtras,
      daySlots.length ? daySlots.map(renderSlot) : dayExtras.length ? null : el("div", { class: "empty" }, overview ? noSlotsText(day) : "—"),
    ));
  }
  if (!isPhone()) return el("div", { class: "week" }, days);
  // Handy: die Tage vor dem ersten sichtbaren Tag hinter einem Balken verstecken (beim App-Start immer zu)
  const past = el("div", { class: "past-days", hidden: !state.showPast }, days.slice(0, PAST_DAYS));
  const label = sameDay(listAnchor(), today) ? `Letzte ${PAST_DAYS} Tage` : `${PAST_DAYS} Tage davor`;
  const bar = el("button", { type: "button", class: "past-bar", "aria-expanded": String(!!state.showPast) });
  const paint = () => {
    bar.textContent = state.showPast ? `▼ ${label} ausblenden` : `▲ ${label} anzeigen`;
    bar.setAttribute("aria-expanded", String(!!state.showPast));
    past.hidden = !state.showPast;
  };
  bar.onclick = () => { state.showPast = !state.showPast; paint(); };
  paint();
  return el("div", { class: "week" }, bar, past, days.slice(PAST_DAYS));
}

/* ---------------- Admin: Heute – der Fahrtag auf einen Blick, mit Abhaken per Tipp ---------------- */

async function adminToday() {
  // Die nächsten 6 Tage ohne Sonntag untereinander (Start: heute) – wischen oder ‹ › blättert tageweise
  const DAYS = 14;
  const noSunday = (d, dir = 1) => { while (d.getDay() === 0) d = addDays(d, dir); return d; };
  const first = noSunday(dayStart(state.todayDate || new Date()));
  const dayList = [];
  for (let d = first; dayList.length < DAYS; d = addDays(d, 1)) if (d.getDay() !== 0) dayList.push(d);
  const from = first, to = addDays(dayList[dayList.length - 1], 1), now = Date.now();
  const [{ data: slots, error }, { data: exams }, planned] = await Promise.all([
    sb.from("slots").select("id,starts_at,duration_min,meeting_point,bookings(id,status,actual_minutes,late_cancel,lesson_type,meeting_point,student_id,decided_at,profiles(first_name,last_name,phone,needs_glasses,license_class,is_conversion))")
      .gte("starts_at", from.toISOString()).lt("starts_at", to.toISOString()).order("starts_at"),
    sb.from("exams").select("id,kind,exam_at,duration_min,meeting_point,result,student_id,profiles(first_name,last_name,phone)")
      .gte("exam_at", from.toISOString()).lt("exam_at", to.toISOString()).order("exam_at"),
    loadPlanned(from, to),
  ]);
  if (error) throw error;
  await loadTimeOff();
  // je Termin: bestätigte Fahrstunde oder (falls ausgefallen) der zuletzt eingetragene Ausfall
  const lessons = (slots || []).map((s) => {
    const list = s.bookings || [];
    const b = list.find((x) => x.status === "confirmed") || list.filter((x) => NOT_HELD_ICON[x.status]).pop();
    return b ? { s, b } : null;
  }).filter(Boolean);
  const mapsLink = (p) => "https://www.google.com/maps/dir/?api=1&destination=" + encodeURIComponent(p);
  const go = (n) => { state.todayDate = noSunday(addDays(first, n), n); render(); };

  const save = async (b, patch, msg) => {
    const { error } = b._own ? await sb.from("own_entries").update({ done: true }).eq("id", b.id) : await sb.from("bookings").update(patch).eq("id", b.id);
    if (error) throw error;
    toast(msg);
    render();
  };
  // Kleines Fenster beim Tippen auf die Minuten: Dauer anpassen und abhaken (ab 45 Min. vor Beginn) oder Ausfall wählen
  const openQuick = (s, b, canTick) => {
    const p = b.profiles || {};
    const dur = durationControl(s.duration_min);
    const kind = askSchalt(b) ? schaltPicker(b.lesson_type, (t) => { if (t === "schaltpruefung") dur.set(15); }) : null;
    const ok = el("button", { class: "btn ok inst-big" }, "✓ Gefahren – abhaken");
    const syncOk = () => (ok.textContent = `✓ Gefahren – ${dur.value} Min. abhaken`);
    dur.input.addEventListener("input", syncOk); syncOk();
    ok.onclick = () => busy(ok, async () => { closeModal(); await save(b, { actual_minutes: dur.value, lesson_type: kind ? kind.value : b.lesson_type || "normal" }, `✓ ${fullName(p)}: ${dur.value} Min. gefahren`); });
    const keep = el("button", { class: "btn" }, "Dauer speichern");
    keep.onclick = () => busy(keep, async () => {
      const { error } = await sb.from("slots").update({ duration_min: dur.value }).eq("id", s.id);
      if (error) throw error;
      closeModal(); toast(`Dauer geändert: ${dur.value} Min.`); render();
    });
    const { reasonBtns, noBox } = notHeldForm(s, b);
    openModal(`${fmtTime(s.starts_at)} Uhr · ${fullName(p)}`,
      kind && canTick ? [el("label", {}, "War das eine Schaltstunde?"), kind.node] : null,
      el("label", {}, canTick ? "Wie lange gefahren?" : "Geplante Dauer"), dur.node,
      el("div", { class: "actions" }, canTick ? ok : keep),
      canTick ? null : el("p", { class: "muted small", style: "margin:6px 0 0" }, "Abhaken geht ab 45 Minuten vor Beginn."),
      el("hr"),
      el("p", { class: "small", style: "margin:0 0 6px" }, el("b", {}, "✗ Nicht gefahren?")),
      el("div", { class: "tabs type-tabs" }, reasonBtns), noBox);
  };
  // Nicht gefahren: Grund antippen → darunter gleich Fehlstunde und (optional) neuen Schüler wählen → ein Knopf
  const notHeldForm = (s, b) => {
    const p = b.profiles || {};
    let why = null;
    const late = el("input", { type: "checkbox" });
    const lateWrap = el("label", { class: "check" }, late, "Fehlstunde – kostenpflichtig");
    const repl = replacePicker(b.student_id);
    const noBtn = el("button", { class: "btn danger inst-big" });
    const reasonText = el("textarea", { maxlength: 300, rows: 2, placeholder: "z. B. Auto ist in der Werkstatt" });
    // Begründung nur bei „Ich habe abgesagt“ – bei den anderen Gründen ist sie schon klar
    const reasonWrap = el("div", { hidden: true }, el("label", {}, "Begründung (optional) – der Schüler sieht sie"), reasonText);
    const noBox = el("div", { hidden: true }, reasonWrap, lateWrap, repl.node,
      el("p", { class: "muted small", style: "margin:6px 0 0" }, "Der Schüler bekommt eine Mitteilung, danach kannst du ihm auch per WhatsApp schreiben."),
      el("div", { class: "actions" }, noBtn));
    const syncNo = () => (noBtn.textContent = repl.student ? `Speichern & ${fullName(repl.student)} eintragen` : "Speichern – Fahrstunde fällt aus");
    repl.onChange(syncNo); syncNo();
    const reasonBtns = NOT_HELD.map(([v, t]) => el("button", { type: "button", class: "tab", onclick: (e) => {
      why = v;
      reasonBtns.forEach((x) => x.classList.toggle("active", x === e.currentTarget));
      late.checked = v === "no_show" || (v !== "cancelled_teacher" && isLate(s.starts_at));
      lateWrap.hidden = v === "cancelled_teacher";
      reasonWrap.hidden = v !== "cancelled_teacher";
      noBox.hidden = false;
    } }, t));
    noBtn.onclick = () => busy(noBtn, async () => {
      if (!why) throw new Error("Bitte einen Grund antippen");
      const isLateCancel = why !== "cancelled_teacher" && late.checked;
      const note = why === "cancelled_teacher" ? reasonText.value.trim() : "";
      const { error } = await sb.from("bookings").update({ status: why, cancel_reason: note || null, late_cancel: isLateCancel, actual_minutes: null, decided_at: new Date().toISOString() }).eq("id", b.id);
      if (error) throw error;
      pushNotHeld(b.id, why);
      afterNotHeld(s, p, why, isLateCancel, await repl.apply(s), note);
    });
    return { reasonBtns, noBox };
  };
  // Knopf „Absagen“ in der Zeile: gleich die Gründe zeigen
  const openCancel = (s, b) => {
    const { reasonBtns, noBox } = notHeldForm(s, b);
    openModal(`Absagen: ${fmtTime(s.starts_at)} Uhr · ${fullName(b.profiles || {})}`,
      el("p", { class: "small", style: "margin:0 0 6px" }, el("b", {}, "Warum fällt die Fahrstunde aus?")),
      el("div", { class: "tabs type-tabs" }, reasonBtns), noBox);
  };
  // Kompakte Zeile pro Fahrstunde – alles in einer Zeile
  const row = ({ s, b }) => {
    const start = new Date(s.starts_at).getTime(), end = start + s.duration_min * 60000;
    const p = b.profiles || {}, held = b.status === "confirmed", done = held && b.actual_minutes !== null;
    const meet = b.meeting_point || s.meeting_point || state.settings.meeting_point || "";
    const phase = !held ? "nothere" : done ? "done" : now >= start && now < end ? "live" : now >= end ? "over" : "next";
    const canTick = held && !done && now >= start - 45 * 60000;   // abhaken frühestens 45 Min. vor Beginn
    const head = el("div", { class: "tr-head" },
      el("b", { class: "tr-time" }, fmtTime(s.starts_at)),
      el("button", { type: "button", class: "tr-name name-link", title: "Infos zum Schüler", onclick: () => openStudentById(b.student_id) },
        B197_TYPES.includes(b.lesson_type) ? LESSON_ICON[b.lesson_type] + " " : "", fullName(p), p.needs_glasses ? " 👓" : ""),
      phase === "done" ? el("span", { class: "tr-pill ok" }, `✓ ${b.actual_minutes} Min.`)
        : phase === "nothere" ? el("span", { class: "tr-pill no" }, `${NOT_HELD_ICON[b.status]} ${STATUS_TEXT[b.status]}${b.late_cancel ? " · Fehlstd." : ""}`)
        : el("button", { type: "button", class: "tr-pill tap" + (phase === "live" ? " live" : phase === "over" ? " over" : ""), title: "Dauer ändern / abhaken",
            onclick: () => openQuick(s, b, canTick) }, `${s.duration_min} Min. ✎`),
      // Schnell abhaken mit der geplanten Dauer
      canTick ? el("button", { class: "tr-tick", title: `Gefahren – ${s.duration_min} Min. abhaken`, "aria-label": "Gefahren abhaken", onclick: async (ev) => {
        if (askSchalt(b)) return openSchaltAsk(b, s.duration_min, save);
        const btn = ev.currentTarget; btn.disabled = true;
        try { await save(b, { actual_minutes: s.duration_min, lesson_type: b.lesson_type || "normal" }, `✓ ${fullName(p)}: ${s.duration_min} Min. gefahren`); }
        catch (e) { btn.disabled = false; fail(e); }
      } }, "✓") : null,
      el("button", { class: "tr-icon", title: "Details", onclick: () => openAdminSlot(s.id) }, "⋯"));
    const meetLine = phase === "next" || phase === "live" ? el("a", { class: "tr-meet", href: mapsLink(meet), target: "_blank", rel: "noopener" }, "📍 " + meet) : null;
    // Absagen klein und links, weit weg von Minuten und Haken. Ab 45 Min. vor Beginn nur noch über die Minuten („Nicht gefahren?“)
    const cancelBtn = phase === "next" && !canTick ? el("button", { type: "button", class: "tr-cancel", title: "Fahrstunde absagen", onclick: () => openCancel(s, b) }, "Absagen") : null;
    return el("div", { class: "tr " + phase }, head,
      phase === "done" || phase === "nothere" ? null : el("div", { class: "tr-foot" }, cancelBtn, meetLine));
  };
  const examRow = (e) => el("div", { class: "tr exam" },
    el("div", { class: "tr-head" }, el("b", { class: "tr-time" }, fmtTime(e.exam_at)),
      el("span", { class: "tr-name" }, `${EXAM_ICON[e.kind] || "🎓"} ` + fullName(e.profiles || {})), el("span", { class: "tr-pill" }, e.kind === "schalt" ? "Schalt-Test" : "Prüfung")),
    e.meeting_point ? el("a", { class: "tr-meet", href: mapsLink(e.meeting_point), target: "_blank", rel: "noopener" }, "📍 " + e.meeting_point) : null);

  const days = [];
  for (const day of dayList) {
    const items = lessons.filter((x) => sameDay(new Date(x.s.starts_at), day)).map((x) => ({ at: x.s.starts_at, node: row(x) }))
      .concat((exams || []).filter((e) => sameDay(new Date(e.exam_at), day)).map((e) => ({ at: e.exam_at, node: examRow(e) })))
      .concat(plannedToday(planned, day))
      .sort((a, b) => a.at.localeCompare(b.at));
    const dayLessons = lessons.filter((x) => sameDay(new Date(x.s.starts_at), day));
    // Tagessumme: Minuten aller stattfindenden/gefahrenen Fahrstunden (gefahren = tatsächliche, sonst geplante Dauer);
    // FS = Fahrstunden à 45 Min. (90 Min. = 2 FS)
    const minutes = dayLessons.filter((x) => x.b.status === "confirmed")
      .reduce((n, x) => n + (x.b.actual_minutes !== null ? x.b.actual_minutes : x.s.duration_min), 0);
    const fs = Math.round((minutes / LESSON_MIN) * 10) / 10;
    const todo = dayLessons.filter((x) => x.b.status === "confirmed" && x.b.actual_minutes === null && new Date(x.s.starts_at).getTime() <= now).length;
    const overview = dayOverview((slots || []).filter((s) => sameDay(new Date(s.starts_at), day)), day,
      { onClick: (d) => { showDate(d); goTab("calendar"); } });
    days.push(el("div", { class: "day" + (sameDay(day, new Date()) ? " today" : "") },
      el("div", { class: "day-head" }, el("span", {}, (sameDay(day, new Date()) ? "Heute · " : "") + fmtDay(day)),
        el("span", { class: "ctl-sum" }, [minutes ? `${fs.toLocaleString("de-DE")} FS · ${minutes} Min.` : "", todo ? `⏰ ${todo} offen` : ""].filter(Boolean).join(" · "))),
      overview,
      items.length ? items.map((x) => x.node) : overview ? null : el("div", { class: "empty" }, noSlotsText(day))));
  }
  const view = el("div", { class: "today-view" },
    // Schnellzugriff: neue Fahrstunden/Prüfung anlegen oder zum Kalender (Wochen planen)
    el("div", { class: "quick-row" },
      el("button", { class: "quick-btn add", onclick: () => openSlotForm(first) },
        el("span", { class: "qi" }, "➕"), el("span", {}, el("b", {}, "Anlegen"), el("small", {}, "Fahrstunde / Prüfung"))),
      el("button", { class: "quick-btn cal", onclick: () => goTab("calendar") },
        el("span", { class: "qi" }, "📅"), el("span", {}, el("b", {}, "Kalender"), el("small", {}, "Wochen planen"))),
      el("button", { class: "quick-btn", onclick: () => openBackfill() },
        el("span", { class: "qi" }, "✍️"), el("span", {}, el("b", {}, "Nachtragen"), el("small", {}, "schon gefahren"))),
      el("button", { class: "quick-btn sick", onclick: () => openSick() },
        el("span", { class: "qi" }, "🤒"), el("span", {}, el("b", {}, "Krank / Urlaub"), el("small", {}, "Schüler benachrichtigen")))),
    el("div", { class: "today-head" },
      el("button", { class: "btn small ghost", onclick: () => go(-1), "aria-label": "Einen Tag zurück" }, "‹"),
      el("div", {}, el("b", {}, `${fmtDay(first)} – ${fmtDay(dayList[dayList.length - 1])}`),
        el("div", { class: "small muted" }, "Wischen ← → wechselt den Tag")),
      el("button", { class: "btn small ghost", onclick: () => go(1), "aria-label": "Einen Tag weiter" }, "›")),
    !sameDay(first, new Date()) ? el("div", { class: "actions", style: "margin:0 0 10px" }, el("button", { class: "btn small ghost", onclick: () => { state.todayDate = null; render(); } }, "Zurück zu heute")) : null,
    el("div", { class: "ctl-days" }, days));
  // Wischen nach links/rechts = nächster/vorheriger Tag
  let sx = null, sy = null;
  view.addEventListener("touchstart", (e) => { if (e.target.closest("select,input")) return; sx = e.touches[0].clientX; sy = e.touches[0].clientY; }, { passive: true });
  view.addEventListener("touchend", (e) => {
    if (sx === null) return;
    const dx = e.changedTouches[0].clientX - sx, dy = e.changedTouches[0].clientY - sy;
    sx = null;
    if (Math.abs(dx) > 70 && Math.abs(dy) < 50) go(dx < 0 ? 1 : -1);
  }, { passive: true });
  return view;
}

/* ---------------- Admin: Kalender ---------------- */

// „Fahrstunden anlegen“ als Fenster – optional mit vorausgewähltem Tag
function openSlotForm(day, exam, own) {
  const form = newSlotForm({ inModal: true, exam, own });
  openModal(exam ? "🎓 Prüfung eintragen" : "➕ Fahrstunde oder Prüfung anlegen", form.node);
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

const activeBooking = (slot) => (slot.bookings || []).find((b) => ["requested", "confirmed", "offered"].includes(b.status));

async function adminCalendar() {
  const vr = viewRange(), from = vr.from, to = addDays(vr.from, vr.days);
  const { data: slots, error } = await sb.from("slots")
    .select("id,starts_at,duration_min,meeting_point,bookings(id,status,over_limit,actual_minutes,late_cancel,lesson_type,wish_start,student_id,profiles(first_name,last_name,license_class,needs_glasses,is_conversion))")
    .gte("starts_at", from.toISOString()).lt("starts_at", to.toISOString()).order("starts_at");
  if (error) throw error;
  await loadTimeOff();
  const planned = await loadPlanned(from, to);
  const { data: weekExams } = await sb.from("exams").select("id,kind,exam_at,duration_min,result,student_id,profiles(id,first_name,last_name,phone)")
    .gte("exam_at", from.toISOString()).lt("exam_at", to.toISOString()).order("exam_at");
  const examExtras = (weekExams || []).map((e) => ({ at: e.exam_at,
    node: el("button", { class: "slot exam", onclick: (ev) => { ev.stopPropagation(); openExamModal(e.profiles || { id: e.student_id }); } },
      slotHead(`${EXAM_ICON[e.kind] || "🎓"} ${fmtRange(e.exam_at, e.duration_min || 55)}`, e.kind === "schalt" ? "Schalt-Test" : "Prüfung"), fullName(e.profiles),
      e.result ? el("div", {}, e.result === "passed" ? "🎉 Bestanden" : "✗ Nicht bestanden") : null) }));

  const grid = weekGrid(slots, (s) => {
    const b = activeBooking(s);
    const notHeld = (s.bookings || []).filter((x) => NOT_HELD_ICON[x.status]).pop();
    const past = new Date(s.starts_at).getTime() < Date.now();
    const glasses = (p) => (p && p.needs_glasses ? " 👓" : "");
    let cls = past ? "past" : "free", label = past ? "Nicht gebucht" : "", tag = past ? "vergangen" : "frei";
    if (!b && notHeld) label = `${NOT_HELD_ICON[notHeld.status]} ${fullName(notHeld.profiles)} – ${STATUS_TEXT[notHeld.status]}`
      + (notHeld.late_cancel ? " · Fehlstunde" : "") + (past ? "" : " · wieder frei");
    if (!b && notHeld && past) tag = "nicht stattgefunden"; // angesetzt, aber abgesagt/krank – Grund steht im Text
    if (b && b.status === "requested") { cls = "requested"; tag = b.over_limit ? "⚠️ Ausnahme" : "angefragt"; label = fullName(b.profiles) + glasses(b.profiles) + (b.wish_start ? ` · ⏰ Wunsch ${fmtTime(b.wish_start)}` : ""); }
    if (b && b.status === "offered") { cls = "offered"; tag = "angeboten"; label = fullName(b.profiles) + " – wartet auf Zusage"; }
    if (b && b.status === "confirmed") {
      cls = b.actual_minutes !== null ? "done" : "confirmed";
      tag = b.actual_minutes !== null ? "gefahren" : "bestätigt";
      label = (b.actual_minutes !== null ? `✓ ${b.actual_minutes} Min. ${LESSON_ICON[b.lesson_type] || ""} · ` : B197_TYPES.includes(b.lesson_type) ? `${LESSON_ICON[b.lesson_type]} ` : "") + fullName(b.profiles) + glasses(b.profiles);
    }
    // Bestätigte/gefahrene Fahrstunde: Name antippen → Schüler-Infos; Rest des Termins → Termin-Details
    const nameTap = b && b.status === "confirmed" && label
      ? el("span", { class: "name-link", title: "Infos zum Schüler", onclick: (e) => { e.stopPropagation(); openStudentById(b.student_id); } }, label) : label;
    return el("button", { class: "slot " + cls, onclick: (e) => { e.stopPropagation(); openAdminSlot(s.id); } },
      slotHead(fmtRange(s.starts_at, s.duration_min), tag), nameTap || null,
      null);
  }, (day) => openSlotForm(day), offExtras(openTimeOff).concat(examExtras, plannedExtras(planned)), true);

  return el("div", {},
    el("div", { class: "actions", style: "margin:0 0 12px" },
      el("button", { class: "btn add-btn", onclick: () => openSlotForm() }, "➕ Fahrstunde / Prüfung anlegen"),
      el("button", { class: "btn ghost", onclick: () => openBackfill() }, "✍️ Gefahrenes nachtragen")),
    weekBar([el("button", { class: "btn small ghost", onclick: openTimeOff }, "🏖️ Tage sperren"),
      el("button", { class: "btn small ghost", onclick: () => openSick() }, "🤒 Krank / 🏖️ Urlaub"),
      el("button", { class: "btn small ghost", onclick: () => openDeleteMany(slots) }, "🗑 Mehrere löschen"),
      slots.length && !isPhone() ? el("button", { class: "btn small ghost", onclick: () => openCopyWeek(slots) }, "⧉ Woche kopieren") : null]),
    grid,
  );
}

// Bereits Gefahrenes nachtragen: Fahrstunde (alle Arten, bei B197 auch Schaltstunde/-test) oder Prüfung mit Ergebnis.
// Legt einen vergangenen Termin an und hakt ihn sofort ab – ohne Mitteilung an den Schüler.
async function openBackfill(preStudent) {
  const { data: students, error } = await sb.from("profiles")
    .select("id,first_name,last_name,license_class,needs_glasses,is_conversion,status,valid_until")
    .eq("role", "student").in("status", ["active", "blocked"]).order("last_name");
  if (error) return fail(error);
  students.splice(0, students.length, ...(await onlyActive(students)));
  if (!students.length) return openModal("Nachtragen", el("p", { class: "muted" }, "Noch keine Schüler vorhanden."));
  const who = el("select", {}, el("option", { value: "" }, "Schüler wählen …"),
    students.map((st) => el("option", { value: st.id }, fullName(st) + (st.license_class ? ` (${st.license_class})` : ""))));
  if (preStudent) who.value = preStudent.id;
  const now = new Date();
  const date = el("input", { type: "date", value: dateInput(now), max: dateInput(now) });
  const time = el("input", { type: "time", value: timeInput(new Date(now.getTime() - (state.settings.default_duration || 90) * 60000 - (now.getMinutes() % 15) * 60000)), step: 300 });
  const dur = durationControl(state.settings.default_duration || 90);
  let type = "normal";
  const typeRow = el("div", { class: "tabs type-tabs" });
  const result = el("div", { class: "check-row", hidden: true },
    ...[["", "Ergebnis offen"], ["passed", "🎉 Bestanden"], ["failed", "✗ Nicht bestanden"]].map(([v, t], i) => {
      const r = el("input", { type: "radio", name: "bf-result", value: v }); if (i === 1) r.checked = true;
      return el("label", { class: "check" }, r, t);
    }));
  const DEF = { schaltpruefung: 15, exam: 55 };
  const paintTypes = () => {
    const list = Object.keys(LESSON_TYPES).concat("exam");
    if (!list.includes(type)) type = "normal";
    typeRow.replaceChildren(...list.map((t) => el("button", {
      type: "button", class: "tab" + (t === type ? " active" : ""),
      onclick: () => { type = t; dur.set(DEF[t] || state.settings.default_duration || 90); result.hidden = t !== "exam" && t !== "schaltpruefung"; paintTypes(); },
    }, t === "exam" ? "🎓 Prüfung" : typeLabel(t))));
  };
  who.addEventListener("change", paintTypes);
  paintTypes();
  const btn = el("button", { class: "btn ok" }, "✓ Nachtragen");
  const log = el("div", { class: "retro-log" });
  btn.onclick = () => busy(btn, async () => {
    let okMsg = "";
    const st = students.find((x) => x.id === who.value);
    if (!st) throw new Error("Bitte einen Schüler wählen");
    const start = fromInputs(date.value, time.value);
    if (isNaN(start)) throw new Error("Bitte Datum und Uhrzeit angeben");
    if (start.getTime() > Date.now()) throw new Error("Das liegt in der Zukunft – künftige Termine bitte über „➕ Anlegen“ eintragen.");
    if (type === "exam" || type === "schaltpruefung") {
      // Prüfung bzw. Schaltkompetenz-Test → als Prüfung mit Ergebnis (bestanden / nicht bestanden / offen)
      const kind = type === "exam" ? "praxis" : "schalt";
      const res = result.querySelector("input:checked").value || null;
      const { error } = await sb.from("exams").insert({ student_id: st.id, kind, exam_at: start.toISOString(), duration_min: dur.value, result: res });
      if (error) throw error;
      okMsg = `${EXAM_KIND[kind]} · ${fullName(st)} · ${fmtDay(start.toISOString())} ${fmtTime(start.toISOString())} Uhr`;
    } else {
      const { data: slot, error } = await sb.from("slots").insert({ starts_at: start.toISOString(), duration_min: dur.value }).select("id").single();
      if (error) throw error;
      const { error: e2 } = await sb.from("bookings").insert({ slot_id: slot.id, student_id: st.id, status: "confirmed",
        actual_minutes: dur.value, lesson_type: type, decided_at: new Date().toISOString() });
      if (e2) { await sb.from("slots").delete().eq("id", slot.id); throw e2; }
      okMsg = `${LESSON_TYPES[type]} · ${fullName(st)} · ${fmtDay(start.toISOString())} ${fmtTime(start.toISOString())} Uhr · ${dur.value} Min.`;
    }
    // Fenster bleibt offen: gleich die nächste Fahrstunde eintragen (Schüler, Art und Dauer bleiben stehen)
    toast("Nachgetragen: " + okMsg);
    log.prepend(el("div", { class: "list-item small" }, "✓ " + okMsg));
    state.renderOnClose = true;   // Kalender/Kontrolle werden beim Schließen aktualisiert
    const next = new Date(start.getTime() + dur.value * 60000);   // Vorschlag: direkt im Anschluss
    if (next.getTime() < Date.now()) time.value = timeInput(next);   // Datum bleibt, nur die Uhrzeit rückt vor
  });
  openModal("✍️ Gefahrenes nachtragen",
    el("p", { class: "muted small" }, "Für Fahrten, die schon stattgefunden haben (z. B. vergessen einzutragen). Wird sofort als gefahren abgehakt – der Schüler bekommt keine Mitteilung."),
    el("label", {}, "Schüler"), who,
    el("label", {}, "Was?"), typeRow, result,
    el("div", { class: "row" }, el("div", {}, el("label", {}, "Datum"), date), el("div", {}, el("label", {}, "Beginn"), time)),
    el("label", {}, "Dauer (gefahrene Minuten)"), dur.node,
    el("div", { class: "actions" }, btn, el("button", { class: "btn ghost", onclick: closeModal }, "Fertig")),
    log);
}

// Mehrere Termine der angezeigten Tage auf einmal löschen: freie, gebuchte und schon gefahrene
function openDeleteMany(slots) {
  const now = Date.now();
  const info = (x) => {
    const b = activeBooking(x), past = new Date(x.starts_at).getTime() < now;
    const gone = (x.bookings || []).filter((y) => NOT_HELD_ICON[y.status]).pop();
    if (!b) return { group: past ? "past" : "free", text: gone ? `${NOT_HELD_ICON[gone.status]} ${fullName(gone.profiles)} – ${STATUS_TEXT[gone.status]}` : past ? "nicht gebucht" : "frei", b: null };
    if (b.status === "confirmed" && b.actual_minutes !== null) return { group: "past", text: `✓ ${fullName(b.profiles)} – gefahren (${b.actual_minutes} Min.)`, b };
    return { group: past ? "past" : "booked", text: `${fullName(b.profiles)} – ${STATUS_TEXT[b.status]}`, b };
  };
  const list = (slots || []).slice().sort((a, b) => a.starts_at.localeCompare(b.starts_at)).map((x) => ({ x, ...info(x) }));
  if (!list.length) return openModal("🗑 Mehrere löschen", el("p", { class: "muted" }, "In diesem Zeitraum gibt es keine Termine."),
    el("div", { class: "actions" }, el("button", { class: "btn", onclick: closeModal }, "OK")));
  list.forEach((it) => { it.box = el("input", { type: "checkbox" }); it.box.checked = it.group === "free"; });
  const btn = el("button", { class: "btn danger" });
  const picked = () => list.filter((it) => it.box.checked);
  const label = () => { const n = picked().length; btn.textContent = `🗑 ${n} Termin${n === 1 ? "" : "e"} löschen`; };
  list.forEach((it) => it.box.addEventListener("change", label)); label();
  const sel = (fn) => () => { list.forEach((it) => (it.box.checked = fn(it))); label(); };
  const GROUPS = [["free", "Frei (noch nicht gebucht)"], ["booked", "⚠️ Gebucht / angefragt – Termin wird wieder frei, Schüler bekommt eine Absage"], ["past", "Vergangen / gefahren – verschwindet auch aus Kontrolle und Statistik"]];
  btn.onclick = () => busy(btn, async () => {
    const chosen = picked();
    if (!chosen.length) throw new Error("Nichts ausgewählt");
    const booked = chosen.filter((it) => it.group === "booked"), past = chosen.filter((it) => it.group === "past" && it.b);
    if (!confirm(`${chosen.length} Termin${chosen.length === 1 ? "" : "e"} endgültig löschen?`
      + (booked.length ? `\n\n⚠️ ${booked.length} davon sind gebucht/angefragt – die Schüler bekommen eine Absage.` : "")
      + (past.length ? `\n\n${past.length} davon sind schon gefahren/vergangen – sie verschwinden aus Kontrolle und Statistik.` : ""))) return;
    const notify = booked.filter((it) => ["confirmed", "offered"].includes(it.b.status)).map((it) => it.b.id);
    if (notify.length) { try { await sb.functions.invoke("notify", { body: { kind: "booking", ids: notify, event: "cancelled_teacher" } }); } catch { /* kein Muss */ } }
    const freeIds = booked.map((it) => it.b.id), slotIds = chosen.filter((it) => it.group !== "booked").map((it) => it.x.id);
    if (freeIds.length) { const { error: e1 } = await sb.from("bookings").delete().in("id", freeIds); if (e1) throw e1; }   // gebucht → Termin wird wieder frei
    if (slotIds.length) { const { error: e2 } = await sb.from("slots").delete().in("id", slotIds); if (e2) throw e2; }
    toast(`🗑 ${chosen.length} Termin${chosen.length === 1 ? "" : "e"} gelöscht.`);
    closeModal();
    render();
  });
  openModal("🗑 Mehrere Termine löschen",
    el("p", { class: "muted small" }, "Termine der angezeigten Tage ankreuzen und auf einmal löschen."),
    el("div", { class: "done-row" },
      el("button", { class: "btn small ghost", onclick: sel((it) => it.group === "free") }, "Alle freien"),
      el("button", { class: "btn small ghost", onclick: sel(() => true) }, "Alle"),
      el("button", { class: "btn small ghost", onclick: sel(() => false) }, "Keine")),
    el("div", { class: "pick-list del-list" }, GROUPS.map(([g, title]) => {
      const items = list.filter((it) => it.group === g);
      return items.length ? [el("div", { class: "del-group" }, title),
        items.map((it) => el("label", { class: "check" }, it.box, el("span", {}, el("b", {}, `${fmtDay(it.x.starts_at)} · ${fmtRange(it.x.starts_at, it.x.duration_min)}`), el("br"), el("small", { class: "muted" }, it.text))))] : null;
    })),
    el("div", { class: "actions" }, btn, el("button", { class: "btn ghost", onclick: closeModal }, "Abbrechen")));
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
  const meetSlot = meetingPicker(null);
  const search = el("input", { type: "search", placeholder: "Schüler suchen …" });
  const studentList = el("div", { class: "pick-list" });
  const how = assignHow();
  how.onChange(() => refresh());
  // Art: normale Fahrstunde, Schaltstunde oder Schaltkompetenz-Test (15 Min.)
  const planType = schaltPicker("normal", (t) => { if (t === "schaltpruefung") dur.set(15); });
  const assignExtras = el("div", {}, el("label", {}, "Art"), planType.node, how.node, el("label", {}, "Hinweis an den Schüler"), reply);
  const assignBox = el("div", { hidden: true },
    el("label", {}, "Welchem Schüler?"), search, studentList, assignExtras);
  // Prüfung zuordnen: Art, Uhrzeit, Dauer (Standard 55 Min.), Ort/Hinweis
  const examKind = { value: "praxis" };
  const examTime = el("input", { type: "time", value: "08:00", step: 300 });
  const examDur = durationControl(55);
  const examNote = examMeetingField(EXAM_MEETING);
  const examHint = el("input", { maxlength: 300, placeholder: "z. B. Ausweis und Brille mitbringen" });
  const examDurLabel = el("label", {});
  // Praktische Prüfung (55 Min., TÜV) oder Schaltkompetenz-Test (15 Min., B197)
  const examKindBtns = ["praxis", "schalt"].map((k) => el("button", { type: "button", class: "tab", onclick: () => setExamKind(k) }, `${EXAM_ICON[k]} ${EXAM_KIND[k]}`));
  function setExamKind(k) {
    examKind.value = k;
    examKindBtns.forEach((b, i) => b.classList.toggle("active", ["praxis", "schalt"][i] === k));
    examDur.set(EXAM_DUR[k]);
    // Schaltkompetenz-Test findet meist ab der Fahrschule statt, die Prüfung beim TÜV
    const mp = examNote.value();
    if (k === "schalt" && (!mp || mp === EXAM_MEETING)) examNote.set(state.settings.meeting_point || "");
    if (k === "praxis" && (!mp || mp === (state.settings.meeting_point || ""))) examNote.set(EXAM_MEETING);
    examDurLabel.textContent = `Dauer (Standard: ${EXAM_DUR[k]} Min.)`;
    refresh && refresh();
  }
  const examBox = el("div", { hidden: true },
    el("label", {}, "Welche Prüfung?"), el("div", { class: "tabs type-tabs" }, examKindBtns),
    el("label", {}, "Beginn"), examTime,
    examDurLabel, examDur.node,
    examNote.node,
    el("label", {}, "Hinweis (optional, sieht auch der Schüler)"), examHint);
  // Oben: Fahrstunde (Standard) oder Prüfung. Bei Fahrstunde darunter: freigeben oder einem Schüler zuordnen.
  const KINDS = [["lesson", "🚗 Fahrstunde"], ["exam", "🎓 Prüfung"], ["theory", "📚 Theorie"], ["own", "👤 Ohne App"], ["block", "🚫 Blockieren"], ["vacation", "🏖️ Urlaub"]];
  const kindBtns = KINDS.map(([k, text]) => el("button", { type: "button", class: "tab kind-tab" + (k === "exam" ? " exam-mode" : ""),
    onclick: () => setMode(k === "lesson" ? lessonMode : k) }, text));
  const SUBS = [["free", "🟢 Freigeben (für alle)"], ["assign", "👤 Einem Schüler zuordnen"]];
  let lessonMode = "free";
  const subBtns = SUBS.map(([m, text]) => el("button", { type: "button", class: "tab", onclick: () => setMode(m) }, text));
  const subRow = el("div", { class: "tabs", style: "flex-wrap:wrap" }, subBtns);
  async function setMode(m) {
    mode = m;
    if (m === "free" || m === "assign") lessonMode = m;
    const kindOf = m === "free" || m === "assign" ? "lesson" : m;
    const isLesson = kindOf === "lesson";
    kindBtns.forEach((b, i) => b.classList.toggle("active", KINDS[i][0] === kindOf));
    subBtns.forEach((b, i) => b.classList.toggle("active", SUBS[i][0] === lessonMode));
    subRow.hidden = !isLesson;
    assignBox.hidden = m !== "assign";
    assignExtras.hidden = m === "exam";
    examBox.hidden = m !== "exam";
    theoryBox.hidden = m !== "theory";
    ownBox.hidden = m !== "own";
    vacBox.hidden = m !== "vacation";
    blkBox.hidden = m !== "block";
    dayPick.hidden = m === "exam";
    slotBox.hidden = !isLesson;
    if ((m === "assign" || m === "exam") && !students) {
      studentList.replaceChildren(el("p", { class: "muted small" }, "Lädt …"));
      const { data, error } = await sb.from("profiles").select("id,first_name,last_name,phone,license_class,needs_glasses,is_conversion,status,valid_until")
        .eq("role", "student").eq("status", "active").order("last_name");
      if (error) return fail(error);
      students = await onlyActive(data);
    }
    refresh();
  }
  function renderStudents() {
    if (!students) return;
    const q = search.value.trim().toLowerCase();
    const list = students.filter((st) => !q || fullName(st).toLowerCase().includes(q));
    // Schüler ohne App gleich mit anbieten – Antippen wechselt zu „👤 Ohne App“ (Name und Art schon eingetragen)
    const own = ownNameList.filter((n) => !q || n.toLowerCase().includes(q));
    const ownBtns = own.map((n) => el("button", { type: "button", class: "pick", onclick: () => {
      const toExam = mode === "exam";
      setMode("own").then(() => {
        ownName.value = n; ownType = toExam ? "exam" : "normal";
        ownDur.set(toExam ? 55 : state.settings.default_duration || 90);
        paintOwnTypes(); refresh();
      });
    } }, el("b", {}, n), " ", el("span", { class: "badge" }, "ohne App")));
    studentList.replaceChildren(...(list.length || ownBtns.length ? list.map((st) => el("button", {
      type: "button", class: "pick" + (student && student.id === st.id ? " active" : ""),
      onclick: () => { student = st; refresh(); },
    }, el("b", {}, fullName(st)), " ", studentTags(st))).concat(ownBtns) : [el("p", { class: "muted small" }, students.length ? "Kein Treffer." : "Noch keine freigeschalteten Schüler.")]));
  }
  search.addEventListener("input", renderStudents);

  // Wochentage
  const days = new Set([weekdayIndex(new Date())]);
  const dayBtns = WEEKDAYS.map((name, i) => el("button", { type: "button", class: "tab", onclick: () => { days.has(i) ? days.delete(i) : days.add(i); refresh(); } }, name));
  const setDays = (list) => { days.clear(); list.forEach((i) => days.add(i)); refresh(); };

  // Mehrere einzelne Tage in einem Mini-Kalender antippen (Alternative zu „Wiederholen“)
  const multi = el("input", { type: "checkbox" });
  const picked = new Set();
  let calMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
  const calTitle = el("b", { class: "mcal-title" });
  const calGrid = el("div", { class: "mcal-grid" });
  const calInfo = el("p", { class: "small muted", style: "margin:8px 0 0" });
  const multiBox = el("div", { class: "repeat-box multi-box", hidden: true });
  function renderCal() {
    calTitle.textContent = monthName(calMonth);
    const y = calMonth.getFullYear(), mo = calMonth.getMonth();
    const lead = weekdayIndex(new Date(y, mo, 1)), nDays = new Date(y, mo + 1, 0).getDate();
    const todayKey = dateInput(new Date());
    const cells = WEEKDAYS.map((n) => el("span", { class: "mcal-wd" }, n));
    for (let i = 0; i < lead; i++) cells.push(el("span", {}));
    for (let d = 1; d <= nDays; d++) {
      const day = new Date(y, mo, d), key = dateInput(day), on = picked.has(key), off = !!offOn(day);
      cells.push(el("button", {
        type: "button", disabled: key < todayKey, "aria-pressed": String(on),
        class: "mcal-day" + (on ? " on" : "") + (off ? " off" : "") + (key === todayKey ? " today" : ""),
        title: off ? "Gesperrt (Urlaub/frei) – wird übersprungen" : "",
        onclick: () => { on ? picked.delete(key) : picked.add(key); refresh(); },
      }, String(d)));
    }
    calGrid.replaceChildren(...cells);
    calInfo.textContent = picked.size
      ? `${picked.size} Tag${picked.size === 1 ? "" : "e"} gewählt: ` + [...picked].sort().map((k) => fmtDay(fromInputs(k, "12:00"))).join(", ")
      : "Tippe die Tage an, an denen du Termine anlegen möchtest.";
  }

  // Theorie: Beginn, Dauer, Notiz
  const thTime = el("input", { type: "time", value: "18:00", step: 300 });
  const thDur = durationControl(90);
  const thNote = el("input", { maxlength: 200, placeholder: "z. B. Thema 5 (optional)" });
  const theoryBox = el("div", { hidden: true }, el("label", {}, "Beginn"), thTime, el("label", {}, "Dauer"), thDur.node, el("label", {}, "Notiz"), thNote);
  // Fahrstunde/Prüfung eines Schülers ohne App-Zugang: nur im Kalender des Fahrlehrers, zählt in Kontrolle und Lohn
  const ownName = el("input", { maxlength: 80, placeholder: "Name des Schülers", autocomplete: "off" });
  // Schüler ohne App: einmal eingetippte Namen wieder vorschlagen
  const ownNames = el("datalist", { id: "own-names-" + Math.random().toString(36).slice(2) });
  ownName.setAttribute("list", ownNames.id);
  let ownNameList = [];
  sb.from("own_entries").select("student_name").eq("teacher_id", state.profile.id).then(({ data }) => {
    const seen = new Map();
    for (const x of data || []) { const n = (x.student_name || "").trim(); if (n && !seen.has(n.toLowerCase())) seen.set(n.toLowerCase(), n); }
    ownNameList = [...seen.values()].sort((a, b) => a.localeCompare(b, "de"));
    ownNames.replaceChildren(...ownNameList.map((n) => el("option", { value: n })));
    renderStudents();
  });
  let ownType = "normal";
  const ownTypeRow = el("div", { class: "tabs type-tabs" });
  const ownTime = el("input", { type: "time", value: "10:00", step: 300 });
  const ownDur = durationControl(state.settings.default_duration || 90);
  const ownNote = el("input", { maxlength: 200, placeholder: "Notiz (optional)" });
  const paintOwnTypes = () => ownTypeRow.replaceChildren(...Object.keys(LESSON_TYPES).filter((t) => t !== "schaltpruefung").concat("exam", "theory").map((t) => el("button", {
    type: "button", class: "tab" + (t === ownType ? " active" : ""),
    onclick: () => { ownType = t; ownDur.set(t === "exam" ? 55 : t === "theory" ? 90 : state.settings.default_duration || 90); paintOwnTypes(); refresh(); },
  }, t === "exam" ? "🎓 Prüfung" : t === "theory" ? "📚 Theorie" : typeLabel(t))));
  paintOwnTypes();
  const saveLog = el("div", { class: "retro-log" });
  const ownBox = el("div", { hidden: true },
    el("div", { class: "notice", style: "margin:0 0 8px" }, "Für Schüler, die die App nicht nutzen. Der Eintrag steht nur in deinem Kalender, zählt aber in Kontrolle und Lohnberechnung. Für andere Schüler ist diese Zeit nicht mehr buchbar."),
    el("label", {}, "Name"), ownName, ownNames, el("label", {}, "Was?"), ownTypeRow,
    el("label", {}, "Beginn"), ownTime, el("label", {}, "Dauer"), ownDur.node, el("label", {}, "Notiz"), ownNote);
  // Zeit blockieren: Beginn, Dauer, Begründung (nur für den Fahrlehrer sichtbar)
  const blkTime = el("input", { type: "time", value: "12:00", step: 300 });
  const blkDur = durationControl(60);
  const blkReason = el("input", { maxlength: 200, placeholder: "z. B. Arzttermin, Werkstatt" });
  const blkBox = el("div", { hidden: true },
    el("div", { class: "notice", style: "margin:0 0 8px" }, "Die Zeit ist dann belegt: Sie steht in deinem Kalender, Schüler können dort nichts anfragen."),
    el("label", {}, "Beginn"), blkTime, el("label", {}, "Dauer"), blkDur.node, el("label", {}, "Begründung (freiwillig, nur du siehst sie)"), blkReason);
  [blkTime, blkReason].forEach((i) => i.addEventListener("input", () => refresh()));
  blkDur.input.addEventListener("input", () => refresh());
  // Urlaub/freie Tage: ganze Tage sperren (zählt bei „Urlaub“ in den Urlaubstagen)
  const vacNote = el("input", { maxlength: 100, value: "Urlaub" });
  const vacBox = el("div", { hidden: true },
    el("div", { class: "notice", style: "margin:0 0 8px" }, "Ganze Tage sperren. Oben einen Tag wählen oder „Mehrere Tage auswählen“. Einträge mit „Urlaub“ zählen als Urlaubstage."),
    el("label", {}, "Grund"), vacNote,
    el("div", { class: "chips" }, ["Urlaub", "Frei", "Fortbildung", "Feiertag"].map((t) => el("button", { type: "button", class: "btn small ghost", onclick: () => { vacNote.value = t; refresh(); } }, t))));
  vacNote.addEventListener("input", () => refresh());
  [ownName, ownTime, ownNote].forEach((i) => i.addEventListener("input", refresh));
  ownDur.input.addEventListener("input", refresh);
  [thTime, thNote].forEach((i) => i.addEventListener("input", refresh));
  thDur.input.addEventListener("input", refresh);

  // Uhrzeiten: angeheftete Lieblings-Uhrzeiten (gespeichert) antippen = auswählen; × = Uhrzeit entfernen.
  // Neue Uhrzeiten (einzeln oder als Reihe) werden automatisch angeheftet.
  let pinned = timePresets();
  let times = [];
  const first = el("input", { type: "time", value: pinned[0] || "08:00", step: 300 });
  const count = el("input", { type: "number", min: 1, max: 10, value: 1 });
  const pause = el("input", { type: "number", min: 0, max: 240, step: 5, value: 0 });
  const extra = el("input", { type: "time", step: 300 });
  const timeChips = el("div", { class: "chips" });
  const toMin = (t) => { const [h, m] = t.split(":").map(Number); return h * 60 + m; };
  const fromMin = (m) => `${pad(Math.floor(m / 60) % 24)}:${pad(m % 60)}`;
  const uniq = (list) => [...new Set(list)].sort();
  function pinTimes(list) {
    const next = uniq(pinned.concat(list));
    if (next.join() !== pinned.join()) { pinned = next; saveTimePresets(pinned); }
  }
  const makeRow = el("button", { type: "button", class: "btn small ghost", onclick: () => {
    if (!first.value) return;
    const n = Math.max(1, Math.min(10, +count.value || 1)), p = Math.max(0, +pause.value || 0);
    const row = Array.from({ length: n }, (_, i) => fromMin(toMin(first.value) + i * (dur.value + p)));
    pinTimes(row); times = uniq(times.concat(row)); refresh();
  } }, "Reihe übernehmen");
  const addTime = el("button", { type: "button", class: "btn small ghost", onclick: () => {
    if (!extra.value) return;
    pinTimes([extra.value]); times = uniq(times.concat(extra.value)); extra.value = ""; refresh();
  } }, "+ Uhrzeit anheften");

  let skippedOff = 0, skippedBlocked = 0;
  // Tage, an denen angelegt wird (einzeln, mehrere im Kalender oder Wiederholung); gesperrte Urlaubstage fallen weg
  function pickDays() {
    const out = [];
    if (multi.checked) {
      for (const key of [...picked].sort()) { const day = fromInputs(key, "00:00"); if (offOn(day)) skippedOff++; else out.push(day); }
      return out;
    }
    const start = fromInputs(date.value, "00:00");
    if (isNaN(start)) return out;
    let end = start;
    if (repeat.checked) {
      end = fromInputs(until.value, "00:00");
      if (isNaN(end) || end < start) return out;
      const max = addDays(start, 26 * 7);              // höchstens ein halbes Jahr auf einmal
      if (end > max) end = max;
    }
    for (let day = start; day <= end; day = addDays(day, 1)) {
      if (repeat.checked && !days.has(weekdayIndex(day))) continue;
      if (offOn(day)) { skippedOff++; continue; }  // Urlaub/frei: überspringen
      out.push(day);
    }
    return out;
  }
  // Ergebnis je nach Art: Fahrstunden, Theorie oder eigene Einträge
  function build() {
    skippedOff = 0; skippedBlocked = 0;
    const now = Date.now(), list = [];
    for (const day of pickDays()) {
      const key = dateInput(day);
      if (mode === "own") {
        const at = fromInputs(key, ownTime.value);
        if (!isNaN(at)) list.push({ starts_at: at.toISOString(), duration_min: ownDur.value });
      } else if (mode === "block") {
        const at = fromInputs(key, blkTime.value);
        if (!isNaN(at)) list.push({ starts_at: at.toISOString(), duration_min: blkDur.value });
      } else if (mode === "theory") {
        const at = fromInputs(key, thTime.value);
        if (!isNaN(at)) list.push({ starts_at: at.toISOString(), duration_min: thDur.value, note: thNote.value.trim() });
      } else {
        for (const t of times) {
          const at = fromInputs(key, t);
          if (at.getTime() <= now) continue;
          if (blockAt(at.getTime(), dur.value)) { skippedBlocked++; continue; }   // eigener Eintrag: überspringen
          list.push({ starts_at: at.toISOString(), duration_min: dur.value, meeting_point: meetSlot.value() });
        }
      }
    }
    return list;
  }
  function refresh() {
    renderStudents();
    renderCal();
    const vacN = mode === "vacation" ? pickDays().length : 0;
    btn.textContent = mode === "block" ? "🚫 Zeit blockieren" : mode === "vacation" ? (vacN ? `🏖️ ${vacN} Tag${vacN === 1 ? "" : "e"} sperren` : "🏖️ Tage sperren") : mode === "theory" ? "📚 Theorie anlegen" : mode === "own" ? "👤 Eintragen" : mode === "exam" ? (student ? `${EXAM_ICON[examKind.value]} ${EXAM_KIND[examKind.value]} für ${fullName(student)} eintragen` : "Schüler wählen …")
      : mode === "assign" ? (student ? (how.offer() ? `📨 ${student.first_name || fullName(student)} anbieten` : `Für ${fullName(student)} fest eintragen`) : "Schüler wählen …") : "Termine freigeben";
    btn.className = "btn" + (mode === "assign" ? " ok" : mode === "exam" ? " exam-btn" : "");
    dayBtns.forEach((b, i) => b.classList.toggle("active", days.has(i)));
    timeChips.replaceChildren(...(pinned.length ? pinned.map((t) => {
      const on = times.includes(t);
      return el("span", { class: "time-chip" + (on ? " on" : "") },
        el("button", { type: "button", class: "pick", "aria-pressed": String(on),
          onclick: () => { times = on ? times.filter((x) => x !== t) : uniq(times.concat(t)); refresh(); } },
          (on ? "✓ " : "") + `${t} – ${fromMin(toMin(t) + dur.value)}`),
        el("button", { type: "button", class: "unpin", "aria-label": `Uhrzeit ${t} entfernen`, title: "Uhrzeit entfernen",
          onclick: () => { pinned = pinned.filter((x) => x !== t); times = times.filter((x) => x !== t); saveTimePresets(pinned); refresh(); } }, "×"));
    }) : [el("span", { class: "muted small" }, "Noch keine Uhrzeiten angeheftet – unten eine Uhrzeit hinzufügen.")]));
    preview.hidden = mode === "exam";
    const list = build();
    const [n1, nn] = mode === "own" ? ["Eintrag", "Einträge"] : mode === "theory" ? ["Theoriestunde", "Theoriestunden"] : ["Termin", "Termine"];
    const skipTxt = [skippedOff ? `🏖️ ${skippedOff} gesperrte${skippedOff === 1 ? "r Tag" : " Tage"} übersprungen` : "",
      skippedBlocked ? `⛔ ${skippedBlocked} wegen eigenem Eintrag übersprungen` : ""].filter(Boolean).join(" · ");
    const nDays = new Set(list.map((x) => dateInput(x.starts_at))).size;
    preview.replaceChildren(list.length
      ? el("span", {}, el("b", {}, `${list.length} ${list.length === 1 ? n1 : nn}`),
        ` · ${nDays > 1 ? `${nDays} Tage · ${fmtDay(list[0].starts_at)} bis ${fmtDay(list[list.length - 1].starts_at)}` : fmtDate(list[0].starts_at)}`,
        mode !== "own" && mode !== "theory" && nDays === 1 ? ` · ${times.map((t) => t + " Uhr").join(", ")}` : "",
        skipTxt ? ` · ${skipTxt}` : "")
      : el("span", { class: "muted" }, multi.checked && !picked.size ? "Bitte oben im Kalender einen oder mehrere Tage antippen."
        : skipTxt ? skipTxt + " – nichts zu tun."
        : mode === "own" ? "Bitte Datum prüfen."
        : mode === "lesson" || mode === "free" || mode === "assign" ? (times.length ? "Noch keine Termine – Datum bzw. Wochentage prüfen (nur zukünftige Zeiten)." : "Bitte oben eine oder mehrere Uhrzeiten antippen.")
        : "Bitte Datum prüfen."));
  }
  [date, until].forEach((i) => i.addEventListener("input", refresh));
  date.addEventListener("input", () => { if (!repeat.checked) { days.clear(); days.add(weekdayIndex(fromInputs(date.value, "00:00"))); } });
  // Uhrzeit gleich auf die nächste freie Lücke stellen (änderbar); von Hand geänderte Felder bleiben
  const touched = new Set();
  [examTime, thTime, ownTime, blkTime].forEach((i) => i.addEventListener("input", () => touched.add(i)));
  async function suggestTime() {
    const key = date.value;
    if (!key) return;
    const dayS = fromInputs(key, "00:00"), dayE = addDays(dayS, 1);
    const [sl, ow, bl, th] = await Promise.all([
      sb.from("slots").select("starts_at,duration_min").eq("teacher_id", state.profile.id).gte("starts_at", dayS.toISOString()).lt("starts_at", dayE.toISOString()),
      sb.from("own_entries").select("starts_at,duration_min").eq("teacher_id", state.profile.id).gte("starts_at", dayS.toISOString()).lt("starts_at", dayE.toISOString()),
      sb.from("time_blocks").select("starts_at,duration_min").eq("teacher_id", state.profile.id).gte("starts_at", dayS.toISOString()).lt("starts_at", dayE.toISOString()),
      sb.from("theory_lessons").select("held_at,duration_min").eq("teacher_id", state.profile.id).gte("held_at", dayS.toISOString()).lt("held_at", dayE.toISOString()),
    ]);
    if (date.value !== key) return;
    const busyList = [...(sl.data || []), ...(ow.data || []), ...(bl.data || []), ...(th.data || []).map((t) => ({ starts_at: t.held_at, duration_min: t.duration_min }))]
      .map((x) => ({ s: new Date(x.starts_at).getTime(), e: new Date(x.starts_at).getTime() + x.duration_min * 60000 })).sort((a, b) => a.s - b.s);
    const need = (ownDur ? ownDur.value : dur.value) * 60000;
    let t = Math.max(fromInputs(key, "08:00").getTime(), Math.ceil(Date.now() / 300000) * 300000);
    for (const x of busyList) { if (t + need <= x.s) break; if (x.e > t) t = x.e; }
    if (t + need > dayE.getTime()) return;   // kein Platz mehr an diesem Tag
    const hhmm = timeInput(new Date(t));
    [examTime, thTime, ownTime, blkTime].forEach((i) => { if (!touched.has(i)) i.value = hhmm; });
    refresh();
  }
  date.addEventListener("input", () => suggestTime().catch(() => {}));
  setTimeout(() => suggestTime().catch(() => {}), 0);
  repeat.addEventListener("change", () => {
    if (repeat.checked && multi.checked) { multi.checked = false; multiBox.hidden = true; }
    repeatBox.hidden = !repeat.checked;
    // Beim Einschalten: Wochentag des gewählten Datums vorauswählen (weitere Tage dazu antippen)
    if (repeat.checked) setDays([weekdayIndex(fromInputs(date.value, "00:00"))]);
    refresh();
  });
  multi.addEventListener("change", () => {
    if (multi.checked && repeat.checked) { repeat.checked = false; repeatBox.hidden = true; }
    multiBox.hidden = !multi.checked;
    // Beim Einschalten: das oben gewählte Datum gleich vormerken
    if (multi.checked && !picked.size && date.value && fromInputs(date.value, "23:59").getTime() > Date.now()) {
      picked.add(date.value);
      calMonth = new Date(fromInputs(date.value, "12:00").getFullYear(), fromInputs(date.value, "12:00").getMonth(), 1);
    }
    refresh();
  });
  const untilIn = (w) => { until.value = dateInput(addDays(fromInputs(date.value, "00:00"), w * 7 - 1)); refresh(); };
  dur.input.addEventListener("input", refresh);

  btn.onclick = () => busy(btn, async () => {
    if (mode === "vacation") {
      const keys = pickDays().map((d) => dateInput(d));
      if (!keys.length) throw new Error("Bitte mindestens einen Tag wählen (gesperrte Tage werden übersprungen)");
      // Aufeinanderfolgende Tage zu Zeiträumen zusammenfassen
      const ranges = [];
      for (const k of keys) {
        const last = ranges[ranges.length - 1];
        if (last && dateInput(addDays(fromInputs(last.to_day, "12:00"), 1)) === k) last.to_day = k;
        else ranges.push({ from_day: k, to_day: k, note: vacNote.value.trim() || "Urlaub" });
      }
      const { error } = await sb.from("time_off").insert(ranges);
      if (error) throw error;
      await afterTimeOff(keys[0], keys[keys.length - 1]);
      toast(`${keys.length} Tag${keys.length === 1 ? "" : "e"} gesperrt (${vacNote.value.trim() || "Urlaub"}).`);
      showDate(fromInputs(keys[0], "12:00"));
      closeModal(); render();
      return;
    }
    if (mode === "exam") {
      if (!student) throw new Error("Bitte einen Schüler auswählen");
      const at = fromInputs(date.value, examTime.value);
      if (isNaN(at)) throw new Error("Bitte Datum und Beginn angeben");
      const meet = examNote.value() || null, note = examHint.value.trim() || null;
      const { data: madeExam, error } = await sb.from("exams").insert({ student_id: student.id, kind: examKind.value, exam_at: at.toISOString(), duration_min: examDur.value, meeting_point: meet, note }).select("id");
      if (error) throw error;
      pushNotify("exam", (madeExam || []).map((x) => x.id), "exam");
      showDate(at);
      const text = `Hallo ${student.first_name || ""}, dein${examKind.value === "schalt" ? "" : "e"} ${examIn(examKind.value)} ist am ${fmtDate(at.toISOString())} um ${fmtTime(at.toISOString())} Uhr (${examDur.value} Min.).`
        + (meet ? `\n📍 Treffpunkt: ${meet}` : "") + (note ? `\n${note}` : "") + `\n\nTermin, Treffpunkt und was du mitbringen musst, findest du in der App „Easy Fahrstundenplaner“ im „Kalender“. Viel Erfolg! 🍀\n\n` + teacherSignature();
      notifyStep(`${EXAM_KIND[examKind.value]} für ${fullName(student)} eingetragen`, student.phone, text);
      return;
    }
    if (mode === "block") {
      const items = build();
      if (!items.length) throw new Error("Bitte Datum und Beginn prüfen (bei „Mehrere Tage“ mindestens einen Tag antippen).");
      const reason = blkReason.value.trim() || "Blockiert";
      // Begründung ist freiwillig
      const { error } = await sb.from("time_blocks").insert(items.map((x) => ({ teacher_id: state.profile.id, starts_at: x.starts_at, duration_min: x.duration_min, reason })));
      if (error) throw error;
      // Für Schüler nicht mehr buchbar: freie Termine in dieser Zeit entfernen
      const lo = new Date(Math.min(...items.map((x) => new Date(x.starts_at).getTime())) - 12 * 3600000).toISOString();
      const hi = new Date(Math.max(...items.map((x) => new Date(x.starts_at).getTime() + x.duration_min * 60000))).toISOString();
      const { data: near } = await sb.from("slots").select("id,starts_at,duration_min,bookings(status)").eq("teacher_id", state.profile.id).gte("starts_at", lo).lt("starts_at", hi);
      const overlaps = (q) => items.some((x) => { const a = new Date(x.starts_at).getTime(), b = new Date(q.starts_at).getTime(); return a < b + q.duration_min * 60000 && b < a + x.duration_min * 60000; });
      const freeIds = (near || []).filter((q) => !(q.bookings || []).some((y) => ["requested", "confirmed", "offered"].includes(y.status)) && overlaps(q)).map((q) => q.id);
      if (freeIds.length) { const { error: e2 } = await sb.from("slots").delete().in("id", freeIds); if (e2) throw e2; }
      showDate(new Date(items[0].starts_at));
      toast(`${items.length === 1 ? "Zeit" : items.length + " Zeiten"} blockiert${reason !== "Blockiert" ? ": " + reason : "."}`);
      closeModal(); render();
      return;
    }
    if (mode === "theory" || mode === "own") {
      const items = build();
      if (!items.length) throw new Error("Nichts angelegt: Bitte Datum und Uhrzeit prüfen (bei „Mehrere Tage“ mindestens einen Tag antippen).");
      const name = ownName.value.trim();
      if (mode === "own" && !name) throw new Error("Nicht gespeichert: Bitte den Namen des Schülers eintragen.");
      const asTheory = mode === "theory" || ownType === "theory";
      const isExam = mode === "own" && ownType === "exam";
      let summary, extra = "";
      if (asTheory) {
        const noteTxt = mode === "own" ? [name, ownNote.value.trim()].filter(Boolean).join(" · ") : thNote.value.trim();
        const { error } = await sb.from("theory_lessons").insert(items.map((x) => ({ teacher_id: state.profile.id, held_at: x.starts_at, duration_min: x.duration_min, note: noteTxt || null })));
        if (error) throw error;
        summary = "📚 Theorie" + (noteTxt ? ` · ${noteTxt}` : "");
      } else {
        const clash = await findClash(items);
        if (clash) throw new Error(clash);
        const nowMs = Date.now();
        const rows = items.map((x) => ({ teacher_id: state.profile.id, kind: isExam ? "exam" : "lesson", lesson_type: isExam ? null : ownType, student_name: name,
          starts_at: x.starts_at, duration_min: x.duration_min, note: ownNote.value.trim() || null,
          done: new Date(x.starts_at).getTime() + x.duration_min * 60000 <= nowMs }));   // schon vorbei → gleich als gefahren abgehakt
        const { error } = await sb.from("own_entries").insert(rows);
        if (error) throw error;
        // Für andere Schüler nicht mehr buchbar: freie Termine in dieser Zeit entfernen
        const t0 = Math.min(...items.map((x) => new Date(x.starts_at).getTime())), t1 = Math.max(...items.map((x) => new Date(x.starts_at).getTime() + x.duration_min * 60000));
        const { data: sl } = await sb.from("slots").select("id,starts_at,duration_min,bookings(status)").gte("starts_at", new Date(t0 - 6 * 3600000).toISOString()).lt("starts_at", new Date(t1).toISOString());
        const freeIds = (sl || []).filter((q) => !(q.bookings || []).some((y) => ["requested", "confirmed", "offered"].includes(y.status))
          && items.some((x) => { const a = new Date(x.starts_at).getTime(), c = new Date(q.starts_at).getTime(); return c < a + x.duration_min * 60000 && c + q.duration_min * 60000 > a; })).map((q) => q.id);
        if (freeIds.length) { const { error: ed } = await sb.from("slots").delete().in("id", freeIds); if (ed) throw ed; extra = ` · ${freeIds.length} freie Termine entfernt`; }
        summary = `${isExam ? "🎓 Prüfung" : typeLabel(ownType)} · ${name}`;
      }
      // Fenster bleibt offen: Datum bleibt, die Uhrzeit rückt hinter den letzten Eintrag – gleich der nächste
      const nDays = new Set(items.map((x) => dateInput(x.starts_at))).size;
      toast(`${items.length} Eintrag${items.length === 1 ? "" : "e"} gespeichert`);
      saveLog.prepend(el("div", { class: "list-item small" }, `✓ ${summary} · ` + (nDays > 1 ? `${nDays} Tage` : `${fmtDay(items[0].starts_at)} ${fmtTime(items[0].starts_at)} Uhr`) + extra));
      const lastEnd = new Date(Math.max(...items.map((x) => new Date(x.starts_at).getTime() + x.duration_min * 60000)));
      if (mode === "own") { ownTime.value = timeInput(lastEnd); ownName.focus(); ownName.select(); } else thTime.value = timeInput(lastEnd);
      state.renderOnClose = true;   // Kalender/Kontrolle werden beim Schließen aktualisiert
      showDate(new Date(items[0].starts_at));
      refresh();
      return;
    }
    const list = build();
    if (mode === "assign" && !student) throw new Error("Bitte einen Schüler auswählen");
    await meetSlot.commit();
    const res = await insertSlots(list);
    showDate(new Date(list[0].starts_at));
    if (mode === "free") {
      // Neue Termine → (wenn eingeschaltet) alle Schüler benachrichtigen
      if (state.settings.notify_new_slots && res.rows.length) sb.functions.invoke("notify", { body: { kind: "slots_new", ids: res.rows.map((r) => r.id).slice(0, 300) } }).catch(() => {});
      toast(insertedMsg(res) + (state.settings.notify_new_slots && res.rows.length ? " Schüler werden benachrichtigt." : "")); closeModal(); render(); return;
    }
    // Zuordnen: dem Schüler anbieten (er sagt zu/ab) oder gleich fest eintragen
    if (!res.rows.length) throw new Error("Alle diese Termine gibt es schon – nichts eingetragen.");
    const note = reply.value.trim() || null;
    const kind = how.offer() ? "offered" : "confirmed";
    const { data: made, error } = await sb.from("bookings").insert(res.rows.map((r) => ({
      slot_id: r.id, student_id: student.id, status: kind, admin_reply: note, decided_at: new Date().toISOString(), lesson_type: planType.value,
    }))).select("id");
    if (error) throw error;
    pushNotify("booking", (made || []).map((x) => x.id), kind === "offered" ? "offered" : "assigned");
    let lines = res.rows.map((r) => `• ${fmtDay(r.starts_at)} ${fmtRange(r.starts_at, r.duration_min)}`).join("\n");
    if (planType.value !== "normal") lines += `\n${typeLabel(planType.value)}`;
    const n = res.rows.length, pl = n === 1 ? "" : "n";
    const meet = meetingOf({ meeting_point: meetSlot.value() });
    if (meet) lines += `\n📍 Treffpunkt: ${meet}`;
    const text = kind === "offered"
      ? `Hallo ${student.first_name || ""}, ich biete dir folgende Fahrstunde${pl} an:\n${lines}` + (note ? `\n${note}` : "") +
        `\n\n👉 Bitte öffne die App „Easy Fahrstundenplaner“ und sag unter „Meine Fahrstunden“ zu oder ab.\n\n` + teacherSignature()
      : `Hallo ${student.first_name || ""}, ich habe dir folgende Fahrstunde${pl} eingetragen:\n${lines}` + (note ? `\n${note}` : "") +
        `\n\nDu findest sie in der App „Easy Fahrstundenplaner“ unter „Meine Fahrstunden“.\n\n` + teacherSignature();
    notifyStep(`${n} Fahrstunde${pl} ${kind === "offered" ? "angeboten" : "eingetragen"} – ${fullName(student)}` + (res.skipped ? ` (${res.skipped} gab es schon)` : ""),
      student.phone, text);
  });

  refresh();
  const slotBox = el("div", {}), dayPick = el("div", {});
  const node = el("div", { class: opts.inModal ? "" : "card" },
    opts.inModal ? null : el("h3", {}, "Neue Fahrstunden anlegen"),
    el("div", { class: "tabs kind-tabs" }, kindBtns),
    subRow,
    assignBox,
    el("label", {}, "Datum"), date,
    theoryBox,
    ownBox,
    blkBox,
    vacBox,
    examBox,
    dayPick,
    slotBox,
    preview,
    el("div", { class: "actions" }, btn),
    saveLog,
  );
  slotBox.append(
    el("label", {}, `Dauer pro Termin (Standard: ${state.settings.default_duration} Min.)`), dur.node,
    el("label", {}, "Uhrzeiten – antippen zum Auswählen"),
    timeChips,
    el("div", { class: "done-row" }, el("span", { style: "width:130px" }, extra), addTime),
    el("details", { class: "fold" },
      el("summary", {}, "Mehrere Termine hintereinander anheften …"),
      el("div", { class: "row" },
        el("div", {}, el("label", {}, "Erster Termin um"), first),
        el("div", {}, el("label", {}, "Termine hintereinander"), count),
        el("div", {}, el("label", {}, "Pause dazwischen (Min.)"), pause)),
      el("div", { class: "actions" }, makeRow)),
    meetSlot.node,
  );
  dayPick.append(
    el("label", { class: "check repeat-toggle" }, multi, el("span", {}, el("b", {}, "📅 Mehrere Tage wählen"), " – einzelne Tage im Kalender antippen, die Uhrzeiten gelten für alle")),
    multiBox,
    el("label", { class: "check repeat-toggle", style: "margin-top:8px" }, repeat, el("span", {}, el("b", {}, "🔁 Wiederholen"), " – an bestimmten Wochentagen, z. B. jeden Mo und Mi")),
    repeatBox);
  multiBox.append(
    el("div", { class: "done-row", style: "justify-content:space-between;margin:0 0 6px" },
      el("button", { type: "button", class: "btn small ghost", "aria-label": "Vorheriger Monat", onclick: () => { calMonth = new Date(calMonth.getFullYear(), calMonth.getMonth() - 1, 1); renderCal(); } }, "‹"),
      calTitle,
      el("button", { type: "button", class: "btn small ghost", "aria-label": "Nächster Monat", onclick: () => { calMonth = new Date(calMonth.getFullYear(), calMonth.getMonth() + 1, 1); renderCal(); } }, "›")),
    calGrid, calInfo,
    el("div", { class: "actions", style: "margin:6px 0 0" },
      el("button", { type: "button", class: "btn small ghost", onclick: () => { picked.clear(); refresh(); } }, "Auswahl leeren")));
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
  // Aus der Ausbildung: gleich „Prüfung“ mit Schüler und Prüfungsart vorauswählen
  if (opts.exam) {
    date.value = dateInput(addDays(new Date(), 14));
    setExamKind(opts.exam.kind || "praxis");
    setMode("exam").then(() => { student = (students || []).find((x) => x.id === opts.exam.student.id) || opts.exam.student; refresh(); });
  } else if (opts.own) { setMode("own"); ownName.value = opts.own; }
  else setMode("free");
  if (!opts.exam) setExamKind("praxis");
  return { node, setDate: (d) => { date.value = dateInput(d); setDays([weekdayIndex(d)]); refresh(); } };
}

// Termin samt Fahrstunde löschen (egal ob abgelehnt, Fehlstunde, gefahren …). Bestätigt und noch nicht gefahren
// = ungewöhnlich → deutliche Rückfrage; der Schüler bekommt vorher eine Mitteilung „abgesagt“.
async function deleteLessonSlot(slot, b) {
  const p = (b && b.profiles) || {};
  const upcoming = b && b.status === "confirmed" && b.actual_minutes === null && new Date(slot.starts_at).getTime() > Date.now();
  const who = b ? ` mit ${fullName(p)}` : "";
  const freeing = !!b && b.actual_minutes === null && new Date(slot.starts_at).getTime() > Date.now() && ["requested", "confirmed", "offered"].includes(b.status);
  const msg = freeing
    ? (upcoming ? `⚠️ Die Fahrstunde${who} am ${fmtDate(slot.starts_at)} um ${fmtTime(slot.starts_at)} Uhr ist BESTÄTIGT. ` : `Anfrage${who} am ${fmtDate(slot.starts_at)} um ${fmtTime(slot.starts_at)} Uhr: `)
      + `Wirklich löschen?\n\nDer Termin wird wieder frei – zur ursprünglich freigegebenen Zeit.` + (upcoming || b.status === "offered" ? "\nDer Schüler bekommt eine Mitteilung." : "")
    : upcoming
    ? `⚠️ Achtung: Die Fahrstunde${who} am ${fmtDate(slot.starts_at)} um ${fmtTime(slot.starts_at)} Uhr ist BESTÄTIGT und hat noch nicht stattgefunden.\n\nWirklich löschen? Der Schüler bekommt eine Mitteilung, dass die Fahrstunde abgesagt ist.`
    : b && b.status === "requested" ? `Anfrage${who} löschen? Der Termin verschwindet komplett.`
    : `Diesen Termin${who} am ${fmtDate(slot.starts_at)} endgültig löschen?\n\nEr verschwindet auch aus Kontrolle und Statistik.`;
  if (!confirm(msg)) return false;
  if (upcoming || (b && b.status === "offered")) {
    try { await sb.functions.invoke("notify", { body: { kind: "booking", ids: [b.id], event: "cancelled_teacher" } }); } catch { /* Mitteilung ist kein Muss */ }
  }
  if (freeing) {   // nur die Buchung entfernen: der Termin bleibt frei (Datenbank stellt die ursprüngliche Zeit wieder her)
    const { error: eb } = await sb.from("bookings").delete().eq("id", b.id);
    if (eb) throw eb;
    toast("🗑 Fahrstunde gelöscht – Termin ist wieder frei.");
    return true;
  }
  if (b && ["requested", "offered", "confirmed"].includes(b.status) && b.actual_minutes == null && slot.original_start && new Date(slot.original_start).getTime() > Date.now()) {
    const { error: eb } = await sb.from("bookings").delete().eq("id", b.id);
    if (eb) throw eb;
    toast(`Gelöscht. Der Termin ist wieder frei um ${fmtTime(slot.original_start)} Uhr.`);
    return true;
  }
  const { error } = await sb.from("slots").delete().eq("id", slot.id);
  if (error) throw error;
  toast("🗑 Termin gelöscht.");
  return true;
}

// Neue Zeit einer Fahrstunde: Welche freien Termine sind dann im Weg, und wohin passen sie?
// Dauer bleibt gleich, die bisherige Pause zum Nachbarn auch (höchstens 30 Min.). Gebuchtes wird nie verschoben.
function planShift(lesson, others, nowMs = Date.now()) {
  const MIN = 60000;
  const end = (x) => x.start + x.dur * MIN;
  const hits = (a, b, x) => a < end(x) && x.start < b;
  const pause = (ms) => Math.min(Math.max(0, ms), 30 * MIN);
  const newS = lesson.newStart, newE = newS + lesson.newDur * MIN;
  const day = new Date(newS); day.setHours(0, 0, 0, 0);
  const dayE = addDays(day, 1).getTime();
  const blocks = others.filter((x) => !x.free), frees = others.filter((x) => x.free && x.start > nowMs);
  const blockedBy = (a, b) => blocks.find((x) => hits(a, b, x));
  const moves = [], stuck = [];
  // Nur wenn die Fahrstunde nach hinten hinausragt, rutscht der nächste freie Termin nach hinten
  let prevNew = newE, prevOld = lesson.oldStart + lesson.oldDur * MIN;
  for (const x of frees.filter((f) => f.start >= newS).sort((a, b) => a.start - b.start)) {
    if (x.start >= prevNew) break;
    const to = prevNew + pause(x.start - prevOld), toEnd = to + x.dur * MIN;
    const b = blockedBy(to, toEnd);
    if (b || toEnd > dayE) { stuck.push({ ...x, because: b ? b.label : "Tagesende" }); continue; }
    moves.push({ ...x, to });
    prevOld = end(x); prevNew = toEnd;
  }
  // Was davor startet, wird nie nach vorne gezogen: Überschneidung nur melden
  for (const x of frees.filter((f) => f.start < newS && end(f) > newS)) stuck.push({ ...x, because: "liegt davor" });
  return { moves: moves.sort((a, b) => a.start - b.start), stuck, clashes: blocks.filter((x) => hits(newS, newE, x)) };
}

// Fahrstunde endet jetzt früher: Der nächste Termin bleibt, wenn er frei ist, kann aber auf Wunsch früher beginnen
function earlierTarget(lesson, others) {
  const newE = lesson.newStart + lesson.newDur * 60000;
  if (newE >= lesson.oldStart + lesson.oldDur * 60000) return null;
  const next = others.filter((x) => x.start >= newE).sort((a, b) => a.start - b.start)[0];
  return next && next.free && next.id && next.start > newE ? next.id : null;
}

// Vor dem Bestätigen fragen, ob überschneidende freie Termine verschoben werden sollen.
// Ergebnis: false = abgebrochen, sonst Anzahl der verschobenen Termine.
async function askShiftSlots({ slotId, name, oldStart, oldDur, newStart, newDur, verb = "bestätigen" }) {
  const oldMs = new Date(oldStart).getTime(), newMs = new Date(newStart).getTime();
  if (oldMs === newMs && oldDur === newDur) return 0;
  const from = new Date(newMs); from.setHours(0, 0, 0, 0);
  const to = addDays(from, 1);
  const [slotRes, examRes] = await Promise.all([
    sb.from("slots").select("id,starts_at,duration_min,original_start,bookings(status,profiles(first_name,last_name))")
      .eq("teacher_id", state.profile.id).gte("starts_at", from.toISOString()).lt("starts_at", to.toISOString()),
    sb.from("exams").select("exam_at,duration_min,profiles(first_name,last_name)")
      .gte("exam_at", from.toISOString()).lt("exam_at", to.toISOString()),
  ]);
  if (slotRes.error) throw slotRes.error;
  if (examRes.error) throw examRes.error;
  const others = (slotRes.data || []).filter((x) => x.id !== slotId).map((x) => {
    const a = activeBooking(x);
    return { id: x.id, start: new Date(x.starts_at).getTime(), dur: x.duration_min, free: !a, original: x.original_start, label: a ? `Fahrstunde ${fullName(a.profiles || {})}` : "" };
  }).concat((examRes.data || []).map((e) => ({ start: new Date(e.exam_at).getTime(), dur: e.duration_min || 55, free: false, label: `Prüfung ${fullName(e.profiles || {})}` })));
  const pl = await loadPlanned(from, to);
  others.push(...pl.own.map((x) => ({ start: new Date(x.starts_at).getTime(), dur: x.duration_min, free: false, label: x.student_name })),
    ...pl.theory.map((t) => ({ start: new Date(t.held_at).getTime(), dur: t.duration_min, free: false, label: "Theorie" })),
    ...pl.blocks.map((x) => ({ start: new Date(x.starts_at).getTime(), dur: x.duration_min, free: false, label: "Blockiert: " + x.reason })));
  const { moves, stuck, clashes } = planShift({ oldStart: oldMs, oldDur, newStart: newMs, newDur }, others);
  const needAsk = moves.length || stuck.length || clashes.length;

  const iso = (ms) => new Date(ms).toISOString();
  const answer = !needAsk ? 0 : await new Promise((resolve) => {
    let open = true;
    const onClose = () => { if (open) { open = false; resolve(false); } };
    const finish = (n) => {
      open = false; modal.removeEventListener("close", onClose);
      modalBody.replaceChildren(el("p", { class: "muted" }, "Wird gespeichert …"));
      resolve(n);
    };
    modal.addEventListener("close", onClose, { once: true });
    const yes = el("button", { class: "btn ok" }, moves.length ? `✓ Ja, verschieben & ${verb}` : `Trotzdem ${verb}`);
    yes.onclick = () => busy(yes, async () => {
      if (moves.length) {
        // Könnte in der Zwischenzeit jemand einen dieser Termine gebucht haben?
        const { data: taken, error } = await sb.from("bookings").select("id").in("slot_id", moves.map((m) => m.id)).in("status", ["requested", "offered", "confirmed"]);
        if (error) throw error;
        if (taken && taken.length) throw new Error("Einer dieser Termine wurde gerade gebucht – bitte nochmal öffnen.");
        for (const m of moves) {
          const { error: e } = await sb.from("slots").update({ starts_at: iso(m.to), earlier_from: null, original_start: m.original || iso(m.start) }).eq("id", m.id);
          if (e) throw e;
        }
      }
      finish(moves.length);
    });
    const onlyConfirm = moves.length ? el("button", { class: "btn" }, `Nur ${verb}, nichts verschieben`) : null;
    if (onlyConfirm) onlyConfirm.onclick = () => finish(0);
    openModal(moves.length ? "Termine verschieben?" : "Überschneidung",
      el("p", {}, el("b", {}, name), ` fährt dann ${fmtRange(iso(newMs), newDur)} Uhr.`),
      moves.length ? [
        el("p", { class: "small", style: "margin:0 0 6px" }, moves.length === 1 ? "Dieser freie Termin überschneidet sich damit und würde so verschoben:" : "Diese freien Termine überschneiden sich damit und würden so verschoben:"),
        moves.map((m) => el("div", { class: "list-item small" }, `${fmtRange(iso(m.start), m.dur)} → `, el("b", {}, fmtRange(iso(m.to), m.dur)))),
        el("p", { class: "muted small" }, "Die Dauer bleibt gleich. Die Termine sind noch frei, kein Schüler ist betroffen."),
      ] : null,
      stuck.map((x) => el("div", { class: "notice", style: "margin:6px 0 0" }, `⚠️ Freier Termin ${fmtRange(iso(x.start), x.dur)} passt nicht mehr (${x.because}). Er bleibt stehen – bitte selbst ändern oder löschen.`)),
      clashes.map((x) => el("div", { class: "notice", style: "margin:6px 0 0" }, `⚠️ Überschneidung mit ${x.label} (${fmtRange(iso(x.start), x.dur)}). Gebuchtes wird nicht verschoben.`)),
      el("div", { class: "actions" }, yes, onlyConfirm, el("button", { class: "btn ghost", onclick: closeModal }, "Abbrechen")));
  });
  if (answer === false) return false;
  // Der Hinweis „geht auch früher“ ist nur eine Zugabe: Klappt das Speichern nicht, wird trotzdem bestätigt
  const nextId = earlierTarget({ oldStart: oldMs, oldDur, newStart: newMs, newDur }, others);
  if (nextId) await sb.from("slots").update({ earlier_from: iso(newMs + newDur * 60000) }).eq("id", nextId);
  return answer;
}
// Fahrlehrer: Kurzfristig krank abgesagt und Attest liegt vor → Fehlstunde wird gestrichen
function attestButton(b, onDone) {
  if (!b.late_cancel || !/^krank/i.test(b.cancel_reason || "")) return null;
  const btn = el("button", { class: "btn small ok" }, "📄 Attest liegt vor – Fehlstunde streichen");
  btn.onclick = (e) => { e.stopPropagation(); return busy(btn, async () => {
    if (!confirm("Ärztliches Attest liegt vor? Die Fehlstunde wird gestrichen.")) return;
    const { error } = await sb.from("bookings").update({ late_cancel: false }).eq("id", b.id);
    if (error) throw error;
    toast("Fehlstunde gestrichen.");
    onDone();
  }); };
  return btn;
}
// Schüler wünscht eine andere Zeit, Fahrlehrer schlägt seinerseits eine Uhrzeit vor – der Schüler muss zusagen
function openCounterOffer(b, slot, preset = null) {
  const origStart = slot.starts_at;   // falls der Schüler ablehnt, zurück zu dieser Zeit
  const date = el("input", { type: "date", value: dateInput(preset || slot.starts_at) });
  const time = el("input", { type: "time", value: timeInput(preset || b.wish_start || slot.starts_at), step: 300 });
  const reply = el("textarea", { maxlength: 1000, placeholder: "z. B. 10:30 Uhr würde bei mir passen." }, b.admin_reply || "");
  const btn = el("button", { class: "btn ok" }, "📨 Gegenangebot senden");
  btn.onclick = () => busy(btn, async () => {
    const chosen = fromInputs(date.value, time.value);
    if (isNaN(chosen)) throw new Error("Bitte Datum und Uhrzeit angeben");
    if (chosen.getTime() <= Date.now()) throw new Error("Die Uhrzeit liegt in der Vergangenheit");
    const note = reply.value.trim();
    const moved = await askShiftSlots({ slotId: slot.id, name: fullName(b.profiles), oldStart: slot.starts_at, oldDur: slot.duration_min, newStart: chosen, newDur: slot.duration_min, verb: "senden" });
    if (moved === false) return;
    const { error: e1 } = await sb.from("slots").update({ starts_at: chosen.toISOString() }).eq("id", slot.id);
    if (e1) throw e1;
    const { error: e2 } = await sb.from("bookings").update({ status: "offered", counter_from: origStart, admin_reply: note || null }).eq("id", b.id);
    if (e2) {
      await sb.from("slots").update({ starts_at: origStart }).eq("id", slot.id);
      throw e2;
    }
    pushNotify("booking", b.id, "offered");
    notifyStep("Gegenangebot gesendet" + movedText(moved), b.profiles && b.profiles.phone,
      waTextForStudent("offered", b.profiles, { ...slot, starts_at: chosen.toISOString() }, note, meetingOf(b.meeting_point ? b : slot)));
  });
  openModal(`⏱ Gegenangebot an ${fullName(b.profiles)}`,
    el("p", {}, `Angelegt: ${fmtTime(slot.starts_at)} Uhr`, b.wish_start ? ` · Wunsch: ${fmtTime(b.wish_start)} Uhr` : ""),
    el("div", { class: "row" }, el("div", {}, el("label", {}, "Datum"), date), el("div", {}, el("label", {}, "Dein Vorschlag"), time)),
    el("label", {}, "Nachricht an den Schüler (optional)"), reply,
    el("p", { class: "muted small" }, "Der Schüler muss in der App zusagen. Bis dahin ist der Termin für ihn reserviert. Lehnt er ab, wird der Termin wieder frei und steht wieder zur angelegten Zeit im Kalender."),
    el("div", { class: "actions" }, btn, el("button", { class: "btn ghost", onclick: closeModal }, "Abbrechen")));
}
const movedText = (n) => (n ? ` · ${n} ${n === 1 ? "freier Termin" : "freie Termine"} verschoben` : "");

async function openAdminSlot(slotId) {
  const { data: slot, error } = await sb.from("slots")
    .select("id,starts_at,duration_min,meeting_point,original_start,bookings(id,status,student_id,student_note,admin_reply,meeting_point,actual_minutes,cancel_reason,late_cancel,lesson_type,wish_start,counter_from,change_start,change_dur,change_note,created_at,decided_at,profiles(first_name,last_name,license_class,needs_glasses,is_conversion,phone))")
    .eq("id", slotId).single();
  if (error) return fail(error);

  const b = activeBooking(slot);
  const history = (slot.bookings || []).filter((x) => x !== b).sort((x, y) => x.created_at.localeCompare(y.created_at));

  const date = el("input", { type: "date", value: dateInput(slot.starts_at) });
  const time = el("input", { type: "time", value: timeInput(slot.starts_at), step: 300 });
  const dur = durationControl(slot.duration_min);
  const slotMeet = (b0) => (b0 && b0.meeting_point) || slot.meeting_point || null;
  const meet = meetingPicker(slotMeet(activeBooking(slot)));
  const timeFields = el("div", {},
    el("div", { class: "row" },
      el("div", {}, el("label", {}, "Datum"), date),
      el("div", {}, el("label", {}, "Beginn"), time)),
    el("label", {}, "Dauer"), dur.node, meet.node);

  const timeChanged = () => fromInputs(date.value, time.value).getTime() !== new Date(slot.starts_at).getTime() || dur.value !== slot.duration_min
    || meet.value() !== slotMeet(activeBooking(slot));
  // Speichert Zeit, Dauer und Treffpunkt des Termins
  async function saveTime() {
    if (!timeChanged()) return;
    const start = fromInputs(date.value, time.value);
    if (isNaN(start)) throw new Error("Ungültiges Datum/Uhrzeit");
    await meet.commit();
    // Freier Termin von Hand verschoben: die neue Zeit gilt als die normale (bei gebuchten merkt sich die Datenbank die erste Zeit)
    const handMoved = !activeBooking(slot) && start.getTime() !== new Date(slot.starts_at).getTime() ? { original_start: null } : {};
    const { error } = await sb.from("slots").update({ starts_at: start.toISOString(), duration_min: dur.value, meeting_point: meet.value(), ...handMoved }).eq("id", slot.id);
    if (error) throw error;
    const b0 = activeBooking(slot);
    if (b0 && b0.meeting_point) await sb.from("bookings").update({ meeting_point: null }).eq("id", b0.id);  // alter Einzel-Eintrag
  }
  const done = (msg) => { toast(msg); closeModal(); render(); };

  const parts = [];
  if (!b) {
    const save = el("button", { class: "btn" }, "Speichern");
    save.onclick = () => busy(save, async () => { await saveTime(); done("Gespeichert."); });
    const del = el("button", { class: "btn danger" }, "Termin löschen");
    del.onclick = () => busy(del, async () => {
      const last = (slot.bookings || []).slice().sort((x, y) => x.created_at.localeCompare(y.created_at)).pop();
      if (await deleteLessonSlot(slot, last)) { closeModal(); render(); }
    });
    // Schüler auf diesen freien Termin aufmerksam machen (nur wenn in den Einstellungen eingeschaltet)
    if (state.settings.notify_button && new Date(slot.starts_at).getTime() > Date.now()) {
      const nudge = el("button", { class: "btn ok" }, "📣 Schüler auf diesen Termin hinweisen");
      nudge.onclick = () => busy(nudge, async () => {
        const { data, error } = await sb.functions.invoke("notify", { body: { kind: "slots_remind", ids: [slot.id] } });
        if (error) throw error;
        toast(data && data.sent ? `Mitteilung an ${data.sent} Gerät${data.sent === 1 ? "" : "e"} gesendet.` : "Gesendet – aber kein Schüler hat Mitteilungen eingeschaltet.");
      });
      parts.push(el("div", { class: "actions", style: "margin:0 0 10px" }, nudge));
    }
    parts.push(el("p", {}, el("span", { class: "badge confirmed", style: "background:var(--free-bg);color:var(--free-fg);border-color:var(--free-bd)" }, "Frei")),
      timeFields, el("div", { class: "actions" }, save, del), el("hr"), await bookForStudentForm(slot, saveTime, () => meet.value()));
  } else {
    const reply = el("textarea", { maxlength: 1000, placeholder: "z. B. Bitte Ausweis und Brille mitbringen." }, b.admin_reply || "");
    parts.push(
      el("p", {}, el("button", { type: "button", class: "name-link", onclick: () => openStudentById(b.student_id) }, el("b", {}, fullName(b.profiles))), " ",
        el("span", { class: "badge " + b.status }, STATUS_TEXT[b.status]), " ", studentTags(b.profiles), " ",
        el("button", { class: "btn small ghost", onclick: () => openStudentById(b.student_id) }, "👤 Schüler-Infos")),
      b.student_note ? el("div", { class: "note" }, "Nachricht vom Schüler: ", b.student_note) : el("p", { class: "muted small" }, "Keine Nachricht vom Schüler."),
    );
    // Wunschzeit: per Tipp in das Uhrzeit-Feld übernehmen (vorbelegt) – „Bestätigen“ speichert dann die neue Zeit
    if (b.status === "requested" && b.wish_start) {
      const pick = (iso) => () => { date.value = dateInput(iso); time.value = timeInput(iso); };
      pick(b.wish_start)();
      parts.push(wishNote(b.wish_start, slot.starts_at,
        el("div", { class: "done-row", style: "margin:6px 0 0" },
          el("button", { class: "btn small", onclick: pick(b.wish_start) }, `Wunschzeit ${fmtTime(b.wish_start)}`),
          el("button", { class: "btn small ghost", onclick: pick(slot.starts_at) }, `Wie angelegt ${fmtTime(slot.starts_at)}`)),
        el("div", { class: "small muted" }, "Die Wunschzeit ist unten schon eingetragen. „✓ Bestätigen“ übernimmt die Uhrzeit, die im Feld steht.")));
    }
    if (b.status === "confirmed") parts.push(el("hr"), doneControls(slot, b, done), el("hr"), el("h3", {}, "Termin & Hinweis"));
    parts.push(
      timeFields,
      el("label", {}, "Deine Antwort / Hinweis an den Schüler"), reply,
    );

    if (b.status === "offered") {
      const remind = waButton(b.profiles && b.profiles.phone, waTextForStudent("offered", b.profiles, slot, reply.value.trim(), meetingOf({ meeting_point: meet.value() })), "💬 Erinnern per WhatsApp");
      const withdraw = el("button", { class: "btn danger" }, "Angebot zurückziehen");
      withdraw.onclick = () => busy(withdraw, async () => {
        if (!confirm("Angebot zurückziehen? Der Termin wird wieder frei.")) return;
        const { error } = await sb.from("bookings").delete().eq("id", b.id);
        if (error) throw error;
        if (b.counter_from) await sb.from("slots").update({ starts_at: b.counter_from }).eq("id", slot.id);  // Gegenangebot: zurück zur angelegten Zeit
        done("Angebot zurückgezogen – Termin ist wieder frei.");
      });
      // Zeit oder Dauer ändern: Das Angebot geht neu an den Schüler (er muss weiterhin zusagen)
      const reoffer = el("button", { class: "btn ok", hidden: true }, "📨 Geändertes Angebot senden");
      const syncRe = () => (reoffer.hidden = Math.round(fromInputs(date.value, time.value).getTime() / 60000) === Math.round(new Date(slot.starts_at).getTime() / 60000) && dur.value === slot.duration_min);
      [date, time].forEach((i) => i.addEventListener("input", syncRe)); dur.input.addEventListener("input", syncRe);
      reoffer.onclick = () => busy(reoffer, async () => {
        const chosen = fromInputs(date.value, time.value);
        if (isNaN(chosen)) throw new Error("Ungültiges Datum/Uhrzeit");
        if (chosen.getTime() <= Date.now()) throw new Error("Die neue Zeit liegt in der Vergangenheit");
        const moved = await askShiftSlots({ slotId: slot.id, name: fullName(b.profiles), oldStart: slot.starts_at, oldDur: slot.duration_min, newStart: chosen, newDur: dur.value, verb: "senden" });
        if (moved === false) return;
        await saveTime();
        const note = reply.value.trim();
        const { error } = await sb.from("bookings").update({ admin_reply: note || null }).eq("id", b.id);
        if (error) throw error;
        pushNotify("booking", b.id, "offered");
        notifyStep("Geändertes Angebot gesendet" + movedText(moved), b.profiles && b.profiles.phone,
          waTextForStudent("offered", b.profiles, { starts_at: chosen.toISOString(), duration_min: dur.value }, note, meetingOf({ meeting_point: meet.value() })));
      });
      parts.push(el("div", { class: "notice" }, "Der Schüler muss in der App zusagen oder absagen. Änderst du oben Zeit oder Dauer, bekommt er das Angebot neu."), el("div", { class: "actions" }, reoffer, remind, withdraw));
    } else if (b.status === "requested") {
      const ok = el("button", { class: "btn ok" }, "✓ Bestätigen");
      // App-Schüler: Eine Uhrzeit, die weder angelegt noch gewünscht war, geht als Gegenangebot raus (er muss zusagen)
      const minOf = (v) => Math.round(new Date(v).getTime() / 60000);   // auf die Minute genau vergleichen
      const otherTime = () => { const t = minOf(fromInputs(date.value, time.value)); return t !== minOf(slot.starts_at) && (!b.wish_start || t !== minOf(b.wish_start)); };
      const syncOk = () => (ok.textContent = otherTime() ? "📨 Als Gegenangebot senden" : "✓ Bestätigen");
      [date, time].forEach((i) => i.addEventListener("input", syncOk)); syncOk();
      ok.onclick = () => busy(ok, async () => {
        const chosen = fromInputs(date.value, time.value);
        if (isNaN(chosen)) throw new Error("Ungültiges Datum/Uhrzeit");
        if (otherTime()) return openCounterOffer(b, slot, chosen);
        const noteText = reply.value.trim(), chosenDur = dur.value;
        const moved = await askShiftSlots({ slotId: slot.id, name: fullName(b.profiles), oldStart: slot.starts_at, oldDur: slot.duration_min, newStart: chosen, newDur: chosenDur });
        if (moved === false) return;
        await saveTime();
        const { error } = await sb.from("bookings").update({ status: "confirmed", admin_reply: noteText || null, decided_at: new Date().toISOString() }).eq("id", b.id);
        if (error) throw error;
        pushNotify("booking", b.id, "confirmed");
        const newSlot = { starts_at: chosen.toISOString(), duration_min: chosenDur };
        notifyStep("Fahrstunde bestätigt" + movedText(moved), b.profiles && b.profiles.phone, waTextForStudent("confirmed", b.profiles, newSlot, noteText, meetingOf({ meeting_point: meet.value() })));
      });
      const no = el("button", { class: "btn danger" }, "Ablehnen");
      no.onclick = () => busy(no, async () => {
        if (!confirm("Anfrage ablehnen? Der Termin wird danach wieder frei.")) return;
        const { error } = await sb.from("bookings").update({ status: "rejected", admin_reply: reply.value.trim() || null, decided_at: new Date().toISOString() }).eq("id", b.id);
        if (error) throw error;
        pushNotify("booking", b.id, "rejected");
        notifyStep("Anfrage abgelehnt – Termin ist wieder frei", b.profiles && b.profiles.phone, waTextForStudent("rejected", b.profiles, slot, reply.value.trim()));
      });
      const counter = el("button", { class: "btn", onclick: () => openCounterOffer(b, slot) }, "⏱ Gegenangebot");
      parts.push(el("div", { class: "actions" }, ok, counter, no));
    } else {
      const save = el("button", { class: "btn" }, "Änderungen speichern");
      // Bestätigte, noch nicht gefahrene Fahrstunde: Zeit/Dauer ändern = Anfrage an den Schüler (er muss zusagen)
      const askable = b.status === "confirmed" && b.actual_minutes === null && new Date(slot.starts_at).getTime() > Date.now();
      const timeDiff = () => askable && (fromInputs(date.value, time.value).getTime() !== new Date(slot.starts_at).getTime() || dur.value !== slot.duration_min);
      const sync = () => { save.textContent = timeDiff() ? "📨 Änderung an Schüler senden" : "Änderungen speichern"; };
      [date, time].forEach((i) => i.addEventListener("input", sync));
      dur.input.addEventListener("input", sync);
      async function proposeChange() {
        const chosen = fromInputs(date.value, time.value);
        if (isNaN(chosen)) throw new Error("Ungültiges Datum/Uhrzeit");
        if (chosen.getTime() <= Date.now()) throw new Error("Die neue Zeit liegt in der Vergangenheit");
        const endMs = chosen.getTime() + dur.value * 60000;
        const { data: near, error: en } = await sb.from("slots").select("id,starts_at,duration_min,bookings(status)")
          .gte("starts_at", new Date(chosen.getTime() - 12 * 3600000).toISOString()).lt("starts_at", new Date(endMs).toISOString()).neq("id", slot.id);
        if (en) throw en;
        const clash = (near || []).some((q) => (q.bookings || []).some((x) => ["requested", "confirmed", "offered"].includes(x.status))
          && new Date(q.starts_at).getTime() < endMs && new Date(q.starts_at).getTime() + q.duration_min * 60000 > chosen.getTime());
        if (clash) throw new Error("Zu dieser Zeit ist schon eine andere Fahrstunde eingetragen.");
        if (meet.value() !== slotMeet(b)) {   // Treffpunkt ändert sich sofort, nur die Zeit braucht die Zusage
          await meet.commit();
          const { error: em } = await sb.from("slots").update({ meeting_point: meet.value() }).eq("id", slot.id);
          if (em) throw em;
        }
        const note = reply.value.trim();
        const { error } = await sb.from("bookings").update({ change_start: chosen.toISOString(), change_dur: dur.value, change_note: note || null, decided_at: new Date().toISOString() }).eq("id", b.id);
        if (error) throw error;
        pushNotify("booking", b.id, "change");
        notifyStep("Änderung an den Schüler gesendet – er muss zusagen", b.profiles && b.profiles.phone, waTextChange(b.profiles, slot.starts_at, chosen.toISOString(), dur.value, note));
      }
      save.onclick = () => busy(save, async () => {
        if (timeDiff()) return proposeChange();
        await saveTime();
        const { error } = await sb.from("bookings").update({ admin_reply: reply.value.trim() || null }).eq("id", b.id);
        if (error) throw error;
        done("Gespeichert.");
      });
      if (askable && b.change_start) {
        const back = el("button", { class: "btn small ghost" }, "Änderung zurückziehen");
        back.onclick = () => busy(back, async () => {
          const { error } = await sb.from("bookings").update({ change_start: null, change_dur: null, change_note: null }).eq("id", b.id);
          if (error) throw error;
          done("Änderungsanfrage zurückgezogen.");
        });
        parts.push(el("div", { class: "notice wish" }, el("b", {}, `⏳ Änderung vorgeschlagen: ${fmtDate(b.change_start)}, ${fmtRange(b.change_start, b.change_dur || slot.duration_min)} Uhr`),
          el("div", { class: "small" }, "Der Schüler muss noch zusagen. Bis dahin bleibt die Fahrstunde zur bisherigen Zeit bestehen."), el("div", { class: "actions", style: "margin:6px 0 0" }, back)));
      } else if (askable) {
        parts.push(el("div", { class: "small muted" }, "Zeit oder Dauer ändern? Der Schüler bekommt dann eine Anfrage und muss in der App zusagen."));
      }
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
          h.cancel_reason ? el("div", { class: "note" }, "Grund: ", h.cancel_reason) : null,
          attestButton(h, () => done("Fehlstunde gestrichen.")));
      }));
  }

  // Gebuchte Termine (angefragt, angeboten, bestätigt, gefahren) ebenfalls löschbar
  if (b) {
    const delB = el("button", { class: "btn small ghost danger-text" }, "🗑 Fahrstunde löschen");
    delB.onclick = () => busy(delB, async () => { if (await deleteLessonSlot(slot, b)) { closeModal(); render(); } });
    parts.push(el("hr"), el("div", { class: "actions", style: "margin:0" }, delB));
  }
  openModal(`${fmtDate(slot.starts_at)}, ${fmtRange(slot.starts_at, slot.duration_min)}`, ...parts);
}

// Hinweis: Schüler wünscht eine leicht andere Uhrzeit
function wishNote(wish, start, ...extra) {
  const diff = Math.round((new Date(wish) - new Date(start)) / 60000);
  return el("div", { class: "notice wish", style: "margin:8px 0 0" },
    el("b", {}, `⏰ Wunschzeit: ${fmtTime(wish)} Uhr`), ` statt ${fmtTime(start)} Uhr (${diff > 0 ? "+" : "−"}${Math.abs(diff)} Min.)`, ...extra);
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

async function bookForStudentForm(slot, saveTime, meetVal = () => null) {
  const { data: all, error } = await sb.from("profiles")
    .select("id,first_name,last_name,phone,license_class,needs_glasses,is_conversion,status,valid_until")
    .eq("role", "student").eq("status", "active").order("last_name");
  if (error) throw error;
  const students = await onlyActive(all);
  if (!students.length) return el("p", { class: "muted small" }, "Noch keine freigeschalteten Schüler zum Eintragen.");
  const who = el("select", {}, el("option", { value: "" }, "Schüler wählen …"),
    students.map((st) => el("option", { value: st.id }, fullName(st) + (st.license_class ? ` (${st.license_class})` : ""))));
  const reply = el("textarea", { maxlength: 1000, placeholder: "Hinweis an den Schüler (optional)" });
  const planType = schaltPicker("normal");
  const how = assignHow();
  const btn = el("button", { class: "btn ok" }, "Senden");
  const label = () => (btn.textContent = how.offer() ? "📨 Anbieten" : "✓ Fest eintragen");
  how.onChange(label); label();
  btn.onclick = () => busy(btn, async () => {
    const st = students.find((x) => x.id === who.value);
    if (!st) throw new Error("Bitte einen Schüler wählen");
    await saveTime();
    const kind = how.offer() ? "offered" : "confirmed";
    const { data: made, error } = await sb.from("bookings").insert({
      slot_id: slot.id, student_id: st.id, status: kind, lesson_type: planType.value,
      admin_reply: reply.value.trim() || null, decided_at: new Date().toISOString(),
    }).select("id");
    if (error) throw new Error(error.code === "23505" ? "Der Termin wurde gerade schon vergeben." : error.message);
    pushNotify("booking", (made || []).map((x) => x.id), kind === "offered" ? "offered" : "assigned");
    const { data: fresh } = await sb.from("slots").select("starts_at,duration_min").eq("id", slot.id).single();
    notifyStep(kind === "offered" ? `Angebot an ${fullName(st)} gespeichert` : `${fullName(st)} eingetragen`,
      st.phone, waTextForStudent(kind, st, fresh || slot, reply.value.trim(), meetingOf({ meeting_point: meetVal() })));
  });
  return el("div", {},
    el("h3", {}, "Einem Schüler anbieten oder eintragen"),
    who, el("label", {}, "Art"), planType.node, how.node, el("label", {}, "Hinweis"), reply, el("div", { class: "actions" }, btn));
}

// Ergebnis einer bestätigten Fahrstunde: gefahren (mit Minuten) – oder warum sie nicht zustande kam
function doneControls(slot, b, after, opts = {}) {
  const isDone = b.actual_minutes !== null;
  const mins = durationControl(isDone ? b.actual_minutes : slot.duration_min, { fine: true });
  // Art der Fahrt (Sonderfahrten für den Ausbildungsnachweis)
  let type = b.lesson_type || "normal";
  const typeBtns = typesFor(b.profiles, type).map((t) => el("button", {
    type: "button", class: "tab" + (t === type ? " active" : ""),
    onclick: (e) => {
      type = t; typeBtns.forEach((x) => x.classList.toggle("active", x === e.currentTarget));
      if (t === "schaltpruefung" && !isDone) mins.set(15);
    },
  }, typeLabel(t)));
  const typeHint = askSchalt(b) ? el("p", { class: "small", style: "margin:8px 0 4px" }, el("b", {}, "War das eine Schaltstunde? "), "Bitte unten die Art antippen.") : null;
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
  const reason = el("input", { maxlength: 300, placeholder: "Begründung (optional) – der Schüler sieht sie", hidden: true });
  const late = el("input", { type: "checkbox" });
  late.checked = isLate(slot.starts_at);
  const lateWrap = el("label", { class: "check" }, late, "Fehlstunde – kostenpflichtig",
    el("span", { class: "muted small" }, ` (Frist: ${fmtDeadline(slot.starts_at)})`));
  const chosen = () => (radios.find((x) => x.r.checked) || {}).r;
  radios.forEach((x) => x.r.addEventListener("change", () => {
    lateWrap.hidden = chosen().value === "cancelled_teacher";
    reason.hidden = chosen().value !== "cancelled_teacher";
    if (chosen().value === "no_show") late.checked = true;  // nicht erschienen = Fehlstunde
  }));
  const repl = replacePicker(b.student_id);
  const saveNo = el("button", { class: "btn danger" });
  const syncNo = () => (saveNo.textContent = repl.student ? `Speichern & ${fullName(repl.student)} eintragen` : "Speichern – Fahrstunde fällt aus");
  repl.onChange(syncNo); syncNo();
  saveNo.onclick = () => busy(saveNo, async () => {
    const r = chosen();
    if (!r) throw new Error("Bitte einen Grund ankreuzen");
    const isLateCancel = r.value !== "cancelled_teacher" && late.checked;
    const note = r.value === "cancelled_teacher" ? reason.value.trim() : "";
    const { error } = await sb.from("bookings").update({
      status: r.value, cancel_reason: note || null, late_cancel: isLateCancel,
      actual_minutes: null, decided_at: new Date().toISOString(),
    }).eq("id", b.id);
    if (error) throw error;
    pushNotHeld(b.id, r.value);
    afterNotHeld(slot, b.profiles, r.value, isLateCancel, await repl.apply(slot), note);
  });
  const notHeld = el("details", { class: "nothere" },
    el("summary", {}, "✗ Nicht gefahren …"),
    radios.map((x) => x.node), reason, lateWrap, repl.node,
    el("div", { class: "actions" }, saveNo));

  return el("div", {},
    opts.compact ? null : el("h3", {}, isDone ? `✓ Gefahren: ${fmtMinutes(b.actual_minutes)}` : "Ergebnis der Fahrstunde"),
    opts.compact ? null : el("p", { class: "muted small" }, isDone
      ? "Erledigt. Falls nötig, Minuten korrigieren oder den Haken entfernen."
      : "Geplant waren " + slot.duration_min + " Min. Kürzer oder länger gefahren? Minuten anpassen, dann abhaken."),
    mins.node,
    typeHint, el("div", { class: "tabs", style: "margin:10px 0 0;flex-wrap:wrap" }, typeBtns),
    el("div", { class: "actions" }, check, isDone ? undo : null),
    isDone ? null : notHeld);
}

/* ---------------- Ausbildungsstand ---------------- */

const STAGES = [
  ["grund", "Grundstufe"], ["aufbau", "Aufbaustufe"], ["leistung", "Leistungsstufe"],
  ["grundfahr", "Grundfahraufgaben"], ["sonder", "Besondere Ausbildungsfahrten"],
  ["reife", "Reife- und Teststufe"], ["eigene", "🗺️ Prüfungsstrecken & eigene Themen"],
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
    const own = stage === "eigene" && editable;  // Fahrlehrer pflegt seine eigenen Strecken/Themen
    if (!list.length && !own) return null;
    stageBars[stage] = el("div", { class: "bar small" });
    return el("div", { class: "stage" + (stage === "eigene" ? " own" : "") },
      el("div", { class: "stage-head" }, el("h4", {}, name), stageBars[stage]),
      list.map(row),
      own ? el("div", { class: "actions" }, el("button", { class: "btn small", onclick: openOwnTopics },
        list.length ? "✏️ Strecken bearbeiten / hinzufügen" : "➕ Prüfungsstrecken eintragen")) : null);
  });
  updateBars();
  return el("div", { class: "training" },
    total,
    el("div", { class: "lv-legend small muted" },
      [1, 2, 3].map((n) => el("span", {}, el("span", { class: "lv" }, [1, 2, 3].map((k) => el("i", { class: k <= n ? "on l" + n : "" }))), " " + LEVELS[n])),
      editable ? el("span", {}, "· Thema antippen, um die Stufe zu ändern") : null),
    sections);
}

// Eigene Prüfungsstrecken/Themen des Fahrlehrers: hinzufügen, umbenennen, mit × löschen.
// Jeder Fahrlehrer hat seine eigene Liste – andere sehen sie nicht.
async function openOwnTopics() {
  state.renderOnClose = true;
  const { data, error } = await sb.from("training_topics").select("id,title,sort,stage,teacher_id")
    .eq("teacher_id", state.profile.id).eq("stage", "eigene").order("sort");
  if (error) return fail(error);
  const list = (data || []).filter((t) => t.stage === "eigene" && t.teacher_id === state.profile.id);
  const rename = (t, input) => async () => {
    const v = input.value.trim();
    if (!v || v === t.title) { input.value = t.title; return; }
    const { error } = await sb.from("training_topics").update({ title: v }).eq("id", t.id);
    if (error) return fail(error);
    t.title = v;
    toast("Gespeichert.");
  };
  const row = (t) => {
    const input = el("input", { value: t.title, maxlength: 120, "aria-label": "Strecke umbenennen" });
    input.addEventListener("change", rename(t, input));
    input.addEventListener("keydown", (e) => { if (e.key === "Enter") input.blur(); });
    return el("div", { class: "own-topic" }, input,
      el("button", { type: "button", class: "unpin", title: "Löschen", "aria-label": `${t.title} löschen`, onclick: async () => {
        if (!confirm(`„${t.title}“ löschen? Die Häkchen bei allen Schülern für diese Strecke werden mit gelöscht.`)) return;
        const { error } = await sb.from("training_topics").delete().eq("id", t.id);
        if (error) return fail(error);
        toast("Gelöscht.");
        openOwnTopics();
      } }, "×"));
  };
  const add = el("textarea", { rows: 3, maxlength: 2000, placeholder: "Neue Strecke, z. B. „Kreisverkehr am Bahnhof“ – mehrere: eine pro Zeile" });
  const btn = el("button", { class: "btn" }, "➕ Hinzufügen");
  btn.onclick = () => busy(btn, async () => {
    const titles = add.value.split("\n").map((x) => x.trim()).filter(Boolean).map((x) => x.slice(0, 120));
    if (!titles.length) throw new Error("Bitte eine Strecke eintragen");
    let sort = list.reduce((m, t) => Math.max(m, t.sort), 0);
    const { error } = await sb.from("training_topics").insert(titles.map((title) => ({
      id: "own-" + crypto.randomUUID(), teacher_id: state.profile.id, stage: "eigene", sort: ++sort, title })));
    if (error) throw error;
    toast(titles.length === 1 ? "Hinzugefügt." : `${titles.length} Strecken hinzugefügt.`);
    openOwnTopics();
  });
  openModal("🗺️ Prüfungsstrecken & eigene Themen",
    el("p", { class: "muted small" }, "Deine eigene Liste – andere Fahrlehrer sehen sie nicht und haben ihre eigene. Text antippen zum Ändern, × zum Löschen. Deine Schüler sehen die Strecken in ihrem Ausbildungsstand."),
    list.length ? list.map(row) : el("p", { class: "muted small" }, "Noch keine eigenen Strecken."),
    el("label", {}, "Neue Strecke(n)"), add,
    el("div", { class: "actions" }, btn, el("button", { class: "btn ghost", onclick: closeModal }, "Fertig")));
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
    sb.from("bookings").select("id,student_note,created_at,meeting_point,over_limit,wish_start,profiles(first_name,last_name,license_class,needs_glasses,is_conversion,phone),slots(id,starts_at,duration_min,meeting_point)").eq("status", "requested").order("created_at"),
    sb.from("bookings").select("id,student_id,lesson_type,profiles(first_name,last_name,license_class,needs_glasses,is_conversion,phone),slots(id,starts_at,duration_min)").eq("status", "confirmed").is("actual_minutes", null),
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

  // Anfrage direkt in der Liste bestätigen oder ablehnen (Details/Änderungen weiter über „Öffnen“)
  const decideButtons = (b) => {
    // Mit Wunschzeit: „zur Wunschzeit bestätigen“ verschiebt den Termin, sonst bleibt die angebotene Zeit
    const confirmAt = (useWish) => async () => {
      let slot = b.slots, moved = 0;
      if (useWish && b.wish_start) {
        moved = await askShiftSlots({ slotId: b.slots.id, name: fullName(b.profiles), oldStart: b.slots.starts_at, oldDur: b.slots.duration_min, newStart: b.wish_start, newDur: b.slots.duration_min });
        if (moved === false) return;
        const { error } = await sb.from("slots").update({ starts_at: b.wish_start }).eq("id", b.slots.id);
        if (error) throw error;
        slot = { ...b.slots, starts_at: b.wish_start };
      }
      const { error } = await sb.from("bookings").update({ status: "confirmed", decided_at: new Date().toISOString() }).eq("id", b.id);
      if (error) throw error;
      pushNotify("booking", b.id, "confirmed");
      notifyStep("Fahrstunde bestätigt" + movedText(moved), b.profiles && b.profiles.phone, waTextForStudent("confirmed", b.profiles, slot, "", meetingOf(b)));
    };
    const ok = el("button", { class: "btn small ok" }, b.wish_start ? `✓ Zu ${fmtTime(b.wish_start)} Uhr bestätigen` : b.over_limit ? "✓ Ausnahme gewähren" : "✓ Bestätigen");
    ok.onclick = () => busy(ok, confirmAt(true));
    const orig = b.wish_start ? el("button", { class: "btn small ghost" }, `✓ Zu ${fmtTime(b.slots.starts_at)} Uhr (wie angelegt)`) : null;
    if (orig) orig.onclick = () => busy(orig, confirmAt(false));
    const no = el("button", { class: "btn small danger" }, "✗ Ablehnen");
    no.onclick = () => busy(no, async () => {
      if (!confirm(`Anfrage von ${fullName(b.profiles)} ablehnen? Der Termin wird danach wieder frei.`)) return;
      const { error } = await sb.from("bookings").update({ status: "rejected", decided_at: new Date().toISOString() }).eq("id", b.id);
      if (error) throw error;
      pushNotify("booking", b.id, "rejected");
      notifyStep("Anfrage abgelehnt – Termin ist wieder frei", b.profiles && b.profiles.phone, waTextForStudent("rejected", b.profiles, b.slots, ""));
    });
    const counter = b.wish_start ? el("button", { class: "btn small", onclick: () => openCounterOffer(b, b.slots) }, "⏱ Gegenangebot") : null;
    return el("div", { class: "actions", style: "margin-top:8px" }, ok, orig, counter, no);
  };

  return el("div", {},
    el("h2", {}, "Offene Anfragen"),
    req.data.length ? req.data.filter((b) => b.slots).map((b) => item(b, [
      b.over_limit ? el("div", { class: "notice", style: "margin:8px 0 0" }, el("b", {}, "⚠️ Ausnahme gewünscht – Wochen-Höchstzahl erreicht")) : null,
      b.wish_start ? wishNote(b.wish_start, b.slots.starts_at) : null,
      b.student_note ? el("div", { class: "note" }, b.student_note) : null, decideButtons(b)]))
      : el("p", { class: "muted" }, "Keine offenen Anfragen. 👍"),
    cancels.data.length ? [
      el("h2", { style: "margin-top:24px" }, "Absagen & abgelehnte Angebote (letzte 7 Tage)"),
      cancels.data.filter((b) => b.slots).map((b) => item(b, [
        b.status === "declined" ? el("span", { class: "badge declined" }, "Angebot abgelehnt") :
        b.late_cancel ? el("span", { class: "badge late" }, "Fehlstunde – kostenpflichtig") : el("span", { class: "badge rejected" }, "rechtzeitig"),
        b.cancel_reason ? el("div", { class: "note" }, "Grund: ", b.cancel_reason) : null,
        attestButton(b, () => render()),
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
  const [p, b, ex, own] = await Promise.all([
    sb.from("profiles").select(STUDENT_FIELDS).order("last_name"),
    sb.from("bookings").select("student_id,status,actual_minutes,late_cancel,lesson_type"),
    sb.from("exams").select("student_id").eq("kind", "praxis").eq("result", "passed"),
    sb.from("own_entries").select("id,kind,lesson_type,student_name,starts_at,duration_min,done,note").eq("teacher_id", state.profile.id).order("starts_at"),
  ]);
  if (p.error) throw p.error;
  const ownCard = ownStudentsCard(own.data || []);
  const passedIds = new Set((ex.data || []).map((x) => x.student_id));
  p.data.forEach((x) => (x.passed = passedIds.has(x.id)));
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
  // Abgelaufen + Schonfrist vorbei = archiviert (gesperrt, Daten bleiben)
  // Bestanden = archiviert (aus allen Auswahllisten raus); nicht bestanden bleibt aktiv
  const archived = (x) => x.passed || (x.valid_until && daysLeft(x.valid_until) < -GRACE_DAYS);
  const active = students.filter((x) => x.status === "active" && !archived(x));
  const passedList = students.filter((x) => x.status === "active" && x.passed);
  const expired = students.filter((x) => x.status === "active" && !x.passed && archived(x));
  const blocked = students.filter((x) => x.status === "blocked");
  if (!students.length) return el("div", {}, el("p", { class: "muted" }, "Noch keine Schüler registriert. Schicke ihnen den Link aus den Einstellungen."), ownCard);

  const table = (list) => el("div", { style: "overflow-x:auto" }, el("table", {},
    el("thead", {}, el("tr", {}, el("th", {}, "Name"), el("th", {}, "Klasse"), el("th", { class: "num" }, "Termine"), el("th", { class: "num" }, "Gesamtzeit"), el("th", { class: "num", title: "1 Fahrstunde = 45 Min." }, "Fahrstd."), el("th", { class: "num" }, "Geplant"), el("th", {}, "Sonderfahrten"), el("th", { class: "num" }, "Ausgefallen"), el("th", { class: "num" }, "Fehlstd."), el("th", { title: "Darf mehr als den Standard anfragen" }, "Mehr erlauben"), el("th", {}, "Zugang"))),
    el("tbody", {}, list.map((st) => {
      const s = stats[st.id] || { done: 0, minutes: 0, upcoming: 0, open: 0, notHeld: 0, late: 0, special: {} };
      return el("tr", { class: "clickable", onclick: () => openStudent(st) },
        el("td", {}, fullName(st), st.needs_glasses ? " 👓" : "", " ", el("span", { class: "badge " + studentStatus(st)[0] }, studentStatus(st)[1]), st.is_conversion ? el("div", { class: "small muted" }, "Umschreiber") : null),
        el("td", {}, st.license_class || "–"), el("td", { class: "num" }, s.done), el("td", { class: "num" }, fmtMinutes(s.minutes)), el("td", { class: "num" }, fmtLessons(s.minutes).split(" ")[0]),
        el("td", { class: "num" }, s.upcoming + (s.open ? ` (+${s.open} angefragt)` : "")), el("td", { style: "white-space:nowrap" }, SPECIAL_TYPES.map((t) => `${LESSON_ICON[t]}${s.special[t] || 0}`).join(" ")),
        el("td", { class: "num" }, s.notHeld), el("td", { class: "num" }, s.late),
        el("td", { onclick: (e) => e.stopPropagation() }, moreToggle(st)),
        el("td", { onclick: (e) => e.stopPropagation(), style: "white-space:nowrap" }, accessCell(st)));
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
    studentSearchCard(students, own.data || [], stats),
    el("div", { class: "card" },
      el("h2", {}, `Aktive Schüler (${active.length})`),
      active.length ? table(active) : el("p", { class: "muted" }, "Noch keine freigeschalteten Schüler."),
      el("p", { class: "muted small" }, "Namen antippen für Fahrstunden, Ausbildungsstand und Daten.")),
    expired.length ? el("div", { class: "card" },
      el("h2", {}, "⏳ Abgelaufen (archiviert)"),
      el("p", { class: "muted small" }, "Zugang abgelaufen und 4 Wochen Schonfrist vorbei – der Schüler ist gesperrt, die Daten bleiben gespeichert. Mit „+6 Monate“ wieder freischalten."),
      table(expired)) : null,
    ownCard,
    passedList.length ? el("details", { class: "card fold" },
      el("summary", {}, el("b", {}, `🎉 Bestanden – archiviert (${passedList.length})`)),
      el("p", { class: "muted small" }, "Erscheinen nicht mehr in den Auswahllisten. Alte Daten werden nach 15 Monaten ohne Fahrstunde automatisch gelöscht."),
      table(passedList)) : null,
    blocked.length ? el("details", { class: "card fold" },
      el("summary", {}, el("b", {}, `🔒 Deaktiviert (${blocked.length})`)),
      table(blocked)) : null,
  );
}
// Suchfeld über ALLE Schüler (aktiv, bestanden, abgelaufen, deaktiviert, ohne App) – nur hier auf der Schülerseite
function studentStatus(st) {
  if (st.status === "pending") return ["requested", "neu"];
  if (st.status === "blocked") return ["rejected", "deaktiviert"];
  if (st.passed) return ["confirmed", "🎉 bestanden"];
  if (st.valid_until && daysLeft(st.valid_until) < -GRACE_DAYS) return ["rejected", "abgelaufen"];
  return ["offered", "aktiv"];
}
function studentSearchCard(students, ownEntries, stats) {
  const q = el("input", { type: "search", placeholder: "🔍 Alle Schüler suchen (auch archivierte, deaktivierte, ohne App) …" });
  const out = el("div", {});
  const ownNames = [...new Map(ownEntries.map((x) => [(x.student_name || "").trim().toLowerCase(), (x.student_name || "").trim()])).values()].filter(Boolean);
  q.addEventListener("input", () => {
    const t = q.value.trim().toLowerCase();
    if (!t) return out.replaceChildren();
    const hits = students.filter((st) => fullName(st).toLowerCase().includes(t)).slice(0, 30);
    const ownHits = ownNames.filter((n) => n.toLowerCase().includes(t)).slice(0, 15);
    out.replaceChildren(...hits.map((st) => {
      const [cls, label] = studentStatus(st), s = stats[st.id] || { done: 0, minutes: 0 };
      return el("div", { class: "list-item clickable", onclick: () => openStudent(st) },
        el("div", { class: "head" }, el("span", {}, el("b", {}, fullName(st)), ` · ${s.done} Fahrstunden`), el("span", { class: "badge " + cls }, label)));
    }), ...ownHits.map((n) => el("div", { class: "list-item" },
      el("div", { class: "head" }, el("b", {}, n), el("span", { class: "badge" }, "ohne App")))),
      hits.length || ownHits.length ? null : el("p", { class: "muted small" }, "Kein Treffer."));
  });
  return el("div", { class: "card" }, q, out);
}
// Schüler ohne App: aus den eigenen Einträgen, nach Namen zusammengefasst
function ownStudentsCard(entries) {
  const by = new Map();
  for (const x of entries) {
    const key = (x.student_name || "").trim();
    if (!key) continue;
    if (!by.has(key.toLowerCase())) by.set(key.toLowerCase(), { name: key, list: [] });
    by.get(key.toLowerCase()).list.push(x);
  }
  const people = [...by.values()].sort((a, b) => a.name.localeCompare(b.name, "de"));
  if (!people.length) return null;
  const now = Date.now();
  const open = (pp) => openModal(pp.name,
    el("p", { class: "muted small" }, "Schüler ohne App – nur in deinem Kalender."),
    el("div", { class: "actions" }, el("button", { class: "btn ok", onclick: () => { closeModal(); openSlotForm(new Date(), null, pp.name); } }, "➕ Neuen Termin für " + pp.name)),
    pp.list.slice().reverse().map((x) => el("div", { class: "list-item clickable", onclick: () => openPlanned("own", x) },
      el("div", { class: "head" },
        el("span", {}, `${fmtDay(x.starts_at)} ${fmtRange(x.starts_at, x.duration_min)}`),
        el("span", { class: "badge " + (x.done ? "confirmed" : "requested") }, x.kind === "exam" ? "🎓 Prüfung" : x.done ? `✓ ${x.duration_min} Min.` : new Date(x.starts_at).getTime() > now ? "geplant" : "nicht abgehakt")))));
  return el("div", { class: "card" },
    el("h2", {}, "Schüler ohne App"),
    el("div", { style: "overflow-x:auto" }, el("table", {},
      el("thead", {}, el("tr", {}, el("th", {}, "Name"), el("th", { class: "num" }, "Gefahren"), el("th", { class: "num" }, "Gesamtzeit"), el("th", { class: "num" }, "Geplant"))),
      el("tbody", {}, people.map((pp) => {
        const done = pp.list.filter((x) => x.kind === "lesson" && x.done);
        const planned = pp.list.filter((x) => !x.done && new Date(x.starts_at).getTime() > now).length;
        return el("tr", { class: "clickable", onclick: () => open(pp) },
          el("td", {}, pp.name), el("td", { class: "num" }, done.length), el("td", { class: "num" }, fmtMinutes(done.reduce((n, x) => n + x.duration_min, 0))), el("td", { class: "num" }, planned));
      })))),
    el("p", { class: "muted small" }, "Namen antippen für alle Termine. Beim Anlegen unter „👤 Ohne App“ werden die Namen beim Tippen vorgeschlagen."));
}

// Zugang eines Schülers: Status + „+6 Monate“ verlängern (vom aktuellen Ablaufdatum bzw. ab heute)
function accessCell(st) {
  const info = accessInfo(st.valid_until, true, st.passed);
  // Nach bestandener Prüfung nur um 4 Wochen verlängerbar, sonst um 6 Monate
  const btn = el("button", { class: "btn small ghost", title: st.passed ? "Zugang um 4 Wochen verlängern (Prüfung bestanden)" : "Zugang um 6 Monate verlängern" },
    st.passed ? "+4 Wo." : "+6 Mon.");
  btn.onclick = () => busy(btn, async () => {
    const until = st.passed ? addDaysFrom(st.valid_until, PASSED_EXTEND) : addMonths(st.valid_until, 6);
    const { error } = await sb.from("profiles").update({ valid_until: until }).eq("id", st.id);
    if (error) throw error;
    st.valid_until = until;
    toast(`${fullName(st)}: Zugang verlängert bis ${fmtUntil(until)}.`);
    render();
  });
  return el("span", { class: "access" }, el("span", { class: "access-badge " + info.cls }, info.text), " ", btn);
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

// Höchstzahl Termine PRO WOCHE: null = Standard, 0 = unbegrenzt, sonst Zahl
const limitLabel = (v) => (v === null || v === undefined ? `Standard (${state.settings.max_open || "∞"})` : v === 0 ? "∞ unbegrenzt" : String(v));
// Für einen Zeitraum höchstens so viele Fahrstunden anfragen (außerhalb gilt weiter die normale Grenze)
function periodLimits(st) {
  const box = el("div", { style: "margin-top:12px" });
  async function draw() {
    const { data, error } = await sb.from("student_limits").select("id,from_day,to_day,max_count").eq("student_id", st.id).order("from_day");
    if (error) return box.replaceChildren(el("p", { class: "muted small" }, "Zeitraum-Grenzen noch nicht verfügbar (Datenbank-Update fehlt)."));
    const from = el("input", { type: "date", value: dateInput(new Date()) });
    const to = el("input", { type: "date", value: dateInput(addDays(new Date(), 13)) });
    const max = el("input", { type: "number", min: 0, max: 50, value: 2, style: "max-width:90px" });
    const add = el("button", { class: "btn small" }, "Hinzufügen");
    add.onclick = () => busy(add, async () => {
      if (!from.value || !to.value || to.value < from.value) throw new Error("Bitte gültigen Zeitraum wählen (bis ≥ von)");
      const { error: e } = await sb.from("student_limits").insert({ student_id: st.id, from_day: from.value, to_day: to.value, max_count: Math.max(0, +max.value || 0) });
      if (e) throw e;
      toast("Grenze gespeichert."); draw();
    });
    box.replaceChildren(
      el("b", {}, "Für einen Zeitraum begrenzen"),
      el("p", { class: "muted small", style: "margin:2px 0 6px" }, "Im Zeitraum darf der Schüler höchstens so viele Fahrstunden anfragen bzw. haben. Außerhalb gilt weiter die normale Grenze."),
      (data || []).map((x) => {
        const del = el("button", { class: "btn small ghost danger-text" }, "Entfernen");
        del.onclick = () => busy(del, async () => { const { error: e } = await sb.from("student_limits").delete().eq("id", x.id); if (e) throw e; draw(); });
        return el("div", { class: "done-row", style: "justify-content:space-between" },
          el("span", {}, `${fmtDayStr(x.from_day)} – ${fmtDayStr(x.to_day)}: höchstens ${x.max_count}`), del);
      }),
      el("div", { class: "row" }, el("div", {}, el("label", {}, "Von"), from), el("div", {}, el("label", {}, "Bis"), to), el("div", {}, el("label", {}, "Höchstens"), max)),
      el("div", { class: "actions" }, add));
  }
  draw();
  return box;
}
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
    toast(`${fullName(st)}: ${limitLabel(v)} Termine pro Woche.`);
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

// Schüler-Infos per ID öffnen (aus Heute, Kalender, Termin-Details)
const STUDENT_FIELDS = "id,first_name,last_name,email,phone,license_class,needs_glasses,is_conversion,max_open,role,status,valid_until,created_at";
async function openStudentById(id) {
  if (!id) return;
  const { data, error } = await sb.from("profiles").select(STUDENT_FIELDS).eq("id", id).single();
  if (error) return fail(error);
  openStudent(data);
}

// Kurzübersicht: wie viele Prüfungen, wann, bestanden oder nicht
function examSummary(exams) {
  const done = exams.filter((e) => e.result);
  if (!exams.length) return null;
  return el("div", { class: "card", style: "padding:10px 14px" },
    el("b", {}, `🎓 Prüfungen: ${exams.length}`),
    ` · ${done.filter((e) => e.result === "passed").length}× bestanden · ${done.filter((e) => e.result === "failed").length}× nicht bestanden`,
    el("div", { class: "small", style: "margin-top:4px" }, exams.map((e) => `${EXAM_ICON[e.kind] || "🎓"} ${fmtDay(e.exam_at)}: ${e.result === "passed" ? "bestanden" : e.result === "failed" ? "nicht bestanden" : "offen"}`).join(" · ")));
}

async function openStudent(st) {
  const [{ data, error }, { data: stExams }] = await Promise.all([
    sb.from("bookings").select("id,status,student_note,admin_reply,meeting_point,actual_minutes,cancel_reason,late_cancel,lesson_type,slots(id,starts_at,duration_min)").eq("student_id", st.id),
    sb.from("exams").select("id,kind,exam_at,result").eq("student_id", st.id).order("exam_at"),
  ]);
  if (error) return fail(error);
  st.passed = (stExams || []).some((e) => e.kind === "praxis" && e.result === "passed");
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

  // Große Knöpfe wie in „Heute“
  const qb = quickBtn;
  const wa = waNumber(st.phone);
  openModal(fullName(st),
    el("div", { class: "done-row" }, studentTags(st)),
    el("div", { class: "quick-row" },
      qb("add", "✍️", "Nachtragen", "schon gefahren", () => openBackfill(st)),
      qb("exam", "🎓", "Prüfung", "Termin & Ergebnis", () => document.querySelector("dialog .exam-card")?.scrollIntoView({ behavior: "smooth", block: "start" })),
      qb("cal", "📈", "Ausbildung", "Ausbildungsstand", () => { state.trainingStudent = st.id; closeModal(); setTimeout(() => goTab("training"), 50); }),
      wa ? qb("wa", "💬", "WhatsApp", "Nachricht schreiben", () => window.open(`https://wa.me/${wa}?text=${encodeURIComponent(`Hallo ${st.first_name || ""},\n`)}`, "_blank", "noopener"))
         : qb("", "✏️", "Daten", "bearbeiten", () => openEditStudent(st))),
    el("h3", { class: "sec-title" }, "🚗 Fahrstunden-Übersicht"),
    lessonOverview(st, data, stExams || []),
    studentProfileCard(st, rows),
    el("div", { class: "done-row" }, exportButtons(st, data)),
    examSummary(stExams || []),
    await examCard(st, true),
    rows.length ? rows.map((b) => el("div", { class: "list-item clickable", onclick: () => openAdminSlot(b.slots.id) },
      el("div", { class: "head" },
        el("span", {}, `${fmtDay(b.slots.starts_at)} ${fmtRange(b.slots.starts_at, b.slots.duration_min)}`),
        el("span", { class: "badge " + b.status }, b.actual_minutes !== null ? "✓ Gefahren" : STATUS_TEXT[b.status])),
      b.actual_minutes !== null ? el("div", { class: "small" }, `Gefahren: ${fmtMinutes(b.actual_minutes)} · ${typeLabel(b.lesson_type)}`) : null,
      b.late_cancel ? el("span", { class: "badge late" }, "Fehlstunde – kostenpflichtig") : null,
      b.cancel_reason ? el("div", { class: "small muted" }, "Grund: ", b.cancel_reason) : null,
      attestButton(b, () => openStudent(st))))
      : el("p", { class: "muted" }, "Noch keine Fahrstunden."),
    el("hr"),
    el("h3", { class: "access-sec" }, "⏳ Zugang"),
    el("p", { class: "muted small" }, st.passed
      ? "🎉 Prüfung bestanden: Der Zugang läuft noch 6 Wochen ab der Prüfung und wird dann gesperrt (ohne Schonfrist). Verlängern geht nur um 4 Wochen."
      : "Nach der Freischaltung gilt der Zugang 1 Jahr. Danach 4 Wochen Schonfrist, dann wird er gesperrt (Daten bleiben). Verlängern geht jederzeit."),
    accessCell(st),
    el("hr"),
    el("div", { class: "limit-sec" }, limitControl(st), periodLimits(st)),
    el("hr"),
    el("h3", {}, "Ausbildung"),
    el("p", { class: "muted small" }, st.status === "blocked"
      ? "Fertig: kann keine Fahrstunden mehr buchen. Die Daten bleiben bei dir, bis du den Schüler löschst."
      : "Nach der Prüfung als fertig markieren – oder den Schüler mit allen Daten löschen."),
    el("div", { class: "actions" }, st.status === "blocked" ? unblock : block, del));
  modal.classList.add("full-page");  // Schüler-Seite: ganze Seite statt kleines Fenster
  modal.scrollTop = 0;
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
  const { data: all, error } = await sb.from("profiles")
    .select("id,first_name,last_name,email,slug,status,is_owner,is_school_admin,school_id,valid_until,created_at").eq("role", "teacher").order("last_name");
  if (error) throw error;
  const owner = isOwner(), me = state.profile.id;
  // Fahrschul-Admin sieht nur die Fahrlehrer seiner eigenen Fahrschule
  const teachers = owner ? all : all.filter((t) => t.school_id === me);

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

  const asSchool = el("input", { type: "checkbox" });
  const btn = el("button", { class: "btn ok" }, "Fahrlehrer anlegen");
  asSchool.addEventListener("change", () => (btn.textContent = asSchool.checked ? "Fahrschul-Admin anlegen" : "Fahrlehrer anlegen"));
  btn.onclick = () => busy(btn, async () => {
    const v = { first: first.value.trim(), last: last.value.trim(), email: email.value.trim(), pw: pw.value, slug: slugify(slug.value), school: owner && asSchool.checked };
    if (!v.first || !v.last) throw new Error("Bitte Vor- und Nachnamen angeben");
    if (!v.email.includes("@")) throw new Error("Bitte eine gültige E-Mail angeben");
    if (v.pw.length < 6) throw new Error("Passwort: mindestens 6 Zeichen");
    if (v.slug.length < 2) throw new Error("Kürzel: mindestens 2 Zeichen");
    if (teachers.some((t) => t.slug === v.slug)) throw new Error("Dieses Kürzel ist schon vergeben");
    // Konto mit einem zweiten, unabhängigen Zugang anlegen – deine eigene Anmeldung bleibt bestehen
    const tmp = window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY,
      { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false, storageKey: "fsp-tmp" } });
    const { data: su, error: e1 } = await tmp.auth.signUp({ email: v.email, password: v.pw, options: { data: { first_name: v.first, last_name: v.last } } });
    if (e1) throw e1;
    if (!su.user || (su.user.identities && su.user.identities.length === 0)) throw new Error("Mit dieser E-Mail gibt es schon ein Konto.");
    const { error: e2 } = await sb.rpc("create_teacher", { p_id: su.user.id, p_slug: v.slug, p_first: v.first, p_last: v.last, p_school_admin: v.school });
    if (e2) throw e2;
    showTeacherCredentials(v, !su.session);
  });

  const row = (t) => {
    const toggle = el("button", { class: "btn small " + (t.status === "active" ? "danger" : "ok") }, t.status === "active" ? "Sperren" : "Freischalten");
    toggle.onclick = () => busy(toggle, async () => {
      if (t.status === "active" && !confirm(t.is_school_admin
        ? `Fahrschule von ${fullName(t)} sperren? Der Fahrschul-Admin, alle seine Fahrlehrer und deren Schüler sehen dann nichts mehr, bis du wieder freischaltest.`
        : `${fullName(t)} sperren? Er und alle seine Schüler sehen dann nichts mehr, bis du ihn wieder freischaltest.`)) return;
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
          t.is_school_admin ? el("span", { class: "badge admin" }, "Fahrschul-Admin") : null,
          t.is_owner ? null : (() => { const i = accessInfo(t.valid_until, false); return el("div", { style: "margin-top:4px" }, el("span", { class: "access-badge " + i.cls }, "⏳ " + i.text)); })(),
          t.status !== "active" ? el("span", { class: "badge rejected" }, "Gesperrt") : null,
          el("div", { class: "small muted" }, t.email || "")),
        t.is_owner ? null : el("div", { class: "actions", style: "margin:0" },
          el("button", { class: "btn small ghost", onclick: () => openTeacherValidity(t) }, "⏳ Laufzeit"), pwBtn, toggle, del)));
  };

  // Haupt-Admin: eigene Fahrschule + je Fahrschul-Admin eine eigene Gruppe; Fahrschul-Admin: nur seine Fahrlehrer
  const schools = owner ? teachers.filter((t) => t.is_school_admin) : [];
  const ownSchool = owner ? teachers.filter((t) => !t.is_school_admin && !t.school_id) : teachers;
  return el("div", {},
    el("div", { class: "card" },
      el("h2", {}, owner ? "Neuen Fahrlehrer anlegen" : "Neuen Fahrlehrer für deine Fahrschule anlegen"),
      el("p", { class: "muted small" }, "Der Fahrlehrer bekommt einen eigenen Bereich mit eigenen Schülern, Terminen und Einstellungen. Du siehst seine Schüler nicht – und er deine nicht."),
      el("div", { class: "row" },
        el("div", {}, el("label", {}, "Vorname"), first),
        el("div", {}, el("label", {}, "Nachname"), last)),
      el("label", {}, "E-Mail (zum Anmelden)"), email,
      el("div", { class: "row" },
        el("div", {}, el("label", {}, "Passwort (mind. 6 Zeichen)"),
          el("div", { class: "linkbox" }, pw, el("button", { type: "button", class: "btn ghost", title: "Neues Passwort erzeugen", onclick: () => (pw.value = randomPassword()) }, "🎲"))),
        el("div", {}, el("label", {}, "Kürzel (intern)"), slug)),
      linkPreview,
      owner ? el("label", { class: "check", style: "margin-top:12px" }, asSchool,
        el("span", {}, el("b", {}, "Als Fahrschul-Admin anlegen"), " – für eine andere Fahrschule. Darf eigene Fahrlehrer anlegen, sperren und löschen, sieht aber nichts von dir oder anderen Fahrschulen.")) : null,
      el("div", { class: "actions" }, btn)),
    el("div", { class: "card" },
      el("h2", {}, owner ? `Deine Fahrschule (${ownSchool.length})` : `Deine Fahrlehrer (${ownSchool.length})`),
      el("p", { class: "muted small" }, "Sperren: Der Fahrlehrer und seine Schüler sehen nichts mehr, bis du ihn wieder freischaltest – die Daten bleiben erhalten. Löschen: Fahrlehrer mit allen Schülern und Terminen endgültig entfernen."),
      ownSchool.length ? ownSchool.map(row) : el("p", { class: "muted" }, "Noch keine Fahrlehrer angelegt."),
      el("p", { class: "muted small" }, "Alle nutzen denselben Link: ", el("code", {}, appLink()))),
    schools.map((a) => {
      const list = teachers.filter((t) => t.school_id === a.id);
      return el("div", { class: "card" },
        el("h2", {}, `🏫 Fahrschule ${fullName(a)} (${list.length} Fahrlehrer)`),
        el("p", { class: "muted small" }, "Sperren des Fahrschul-Admins sperrt die ganze Fahrschule. Löschen geht erst, wenn keine Fahrlehrer mehr darin sind."),
        row(a),
        list.length ? list.map(row) : el("p", { class: "muted small" }, "Noch keine Fahrlehrer in dieser Fahrschule."));
    }),
  );
}

// Haupt-Admin: Laufzeit (Abo) eines Fahrlehrers / Fahrschul-Admins festlegen oder verlängern
function openTeacherValidity(t) {
  const date = el("input", { type: "date", value: t.valid_until || dateInput(new Date()) });
  const quick = (label, months) => el("button", { type: "button", class: "btn small ghost", onclick: () => (date.value = addMonths(t.valid_until, months)) }, label);
  const saveAs = async (until) => {
    const { error } = await sb.rpc("set_teacher_valid", { p_id: t.id, p_until: until });
    if (error) throw error;
    closeModal();
    toast(until ? `${fullName(t)}: gültig bis ${fmtUntil(until)}.` : `${fullName(t)}: unbegrenzt.`);
    render();
  };
  const save = el("button", { class: "btn ok" }, "Speichern");
  save.onclick = () => busy(save, () => { if (!date.value) throw new Error("Bitte ein Datum wählen"); return saveAs(date.value); });
  const unlimited = el("button", { class: "btn ghost" }, "♾️ Unbegrenzt");
  unlimited.onclick = () => busy(unlimited, () => saveAs(null));
  const i = accessInfo(t.valid_until, false);
  openModal(`⏳ Laufzeit – ${fullName(t)}`,
    el("p", {}, "Aktuell: ", el("span", { class: "access-badge " + i.cls }, i.text)),
    el("p", { class: "muted small" }, t.is_school_admin
      ? "Gilt für die ganze Fahrschule: Läuft sie ab, sind auch alle Fahrlehrer dieser Fahrschule und deren Schüler gesperrt. Die Daten bleiben erhalten."
      : "Läuft die Laufzeit ab, sind der Fahrlehrer und seine Schüler gesperrt. Die Daten bleiben erhalten – nach einer Verlängerung geht es weiter."
        + (isSchoolAdmin() ? " Hinweis: Deine Fahrlehrer laufen nie länger als deine eigene Fahrschule." : "")),
    el("label", {}, "Verlängern um"),
    el("div", { class: "chips" }, quick("+1 Monat", 1), quick("+3 Monate", 3), quick("+6 Monate", 6), quick("+1 Jahr", 12)),
    el("label", {}, "Gültig bis (einschließlich)"), date,
    el("div", { class: "actions" }, save, unlimited, el("button", { class: "btn ghost", onclick: closeModal }, "Abbrechen")));
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
    (v.school ? `Du bist Fahrschul-Admin: Unter „Fahrlehrer“ kannst du die Fahrlehrer deiner Fahrschule selbst anlegen und verwalten.\n\n` : "") +
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
  const opt = (q) => q.then(({ data }) => data || []);   // neuere Tabellen: fehlt eine, bleibt die Sicherung trotzdem möglich
  const [settings, students, slots, bookings, progress, exams, time_off, topics, own_entries, theory_lessons, time_blocks, teacher_pay] = await Promise.all([
    sb.from("settings").select("*").eq("teacher_id", tid).maybeSingle().then(({ data, error }) => { if (error) throw error; return data; }),
    fetchAll(() => sb.from("profiles").select("*").eq("teacher_id", tid).order("last_name")),
    fetchAll(() => sb.from("slots").select("*").eq("teacher_id", tid).order("starts_at")),
    fetchAll(() => sb.from("bookings").select("*").order("created_at")), // Zugriffsregeln: nur Buchungen auf eigenen Terminen
    fetchAll(() => sb.from("training_progress").select("*").order("student_id")), // nur eigene Schüler
    fetchAll(() => sb.from("exams").select("*").order("exam_at")), // nur eigene Schüler
    fetchAll(() => sb.from("time_off").select("*").eq("teacher_id", tid).order("from_day")),
    fetchAll(() => sb.from("training_topics").select("*").eq("teacher_id", tid).order("sort")), // eigene Strecken/Themen
    opt(sb.from("own_entries").select("*").eq("teacher_id", tid).order("starts_at")),       // Schüler ohne App
    opt(sb.from("theory_lessons").select("*").eq("teacher_id", tid).order("held_at")),
    opt(sb.from("time_blocks").select("*").eq("teacher_id", tid).order("starts_at")),
    opt(sb.from("teacher_pay").select("*").eq("teacher_id", tid)),
  ]);
  return { settings, students, slots, bookings, progress, exams, time_off, topics, own_entries, theory_lessons, time_blocks, teacher_pay };
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
    app: "Fahrstundenplaner", format: 1, name: "Easy Fahrstundenplaner", // "app" = interne Kennung, nicht ändern
    created_at: new Date().toISOString(),
    teacher: { id, email, first_name, last_name, slug },
    counts: { students: d.students.length, slots: d.slots.length, bookings: d.bookings.length, progress: d.progress.length, exams: d.exams.length },
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
    // Eigene Einträge (ohne App, Theorie, Blockierungen, Lohn) zurückholen – nur die eigenen
    let extra = 0;
    for (const t of ["own_entries", "theory_lessons", "time_blocks", "teacher_pay"]) {
      const rows = (Array.isArray(data[t]) ? data[t] : []).filter((x) => x && x.teacher_id === state.profile.id);
      if (!rows.length) continue;
      const { error: e } = await sb.from(t).upsert(rows);
      if (e) throw e;
      extra += t === "teacher_pay" ? 0 : rows.length;
    }
    state.renderOnClose = true;
    openModal("✓ Wiederhergestellt",
      el("p", {}, `${res.students} Schüler, ${res.slots} Termine und ${res.bookings} Buchungen${extra ? ` sowie ${extra} eigene Einträge (ohne App, Theorie, Blockierungen)` : ""} wurden auf den Stand vom ${new Date(data.created_at).toLocaleString("de-DE")} gebracht.`),
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
    el("p", { class: "notice small", style: "margin:0 0 10px" }, "🧹 Automatisch aufgeräumt: Termine, Fahrstunden, Prüfungen und Urlaubstage, die älter als 15 Monate sind, werden gelöscht – ebenso Schülerkonten ohne Fahrstunde in den letzten 15 Monaten. Wer etwas länger aufheben möchte: vorher eine Sicherung herunterladen."),
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

// Wann dürfen Schüler anfragen? immer / gesperrt / nur an bestimmten Tagen und Uhrzeiten
// Mitteilungen an alle Schüler: neue Termine, wieder frei gewordene Termine, Knopf „Schüler hinweisen“
function studentPushSettings() {
  const st = state.settings;
  const box = (key, label, hint) => {
    const c = el("input", { type: "checkbox", checked: !!st[key] });
    c.addEventListener("change", async () => {
      c.disabled = true;
      const { error } = await sb.from("settings").update({ [key]: c.checked }).eq("teacher_id", state.profile.id);
      c.disabled = false;
      if (error) { c.checked = !c.checked; return fail(error); }
      st[key] = c.checked;
      toast(c.checked ? "Eingeschaltet." : "Ausgeschaltet.");
    });
    return el("label", { class: "check" }, c, el("span", {}, el("b", {}, label), el("br"), el("span", { class: "muted small" }, hint)));
  };
  return el("div", {},
    el("h3", {}, "📣 Mitteilungen an deine Schüler"),
    el("p", { class: "muted small" }, "Geht an alle aktiven Schüler, die Mitteilungen eingeschaltet haben."),
    box("notify_new_slots", "Neue Termine freigegeben", "Beim Freigeben neuer Termine bekommen die Schüler eine Mitteilung."),
    box("notify_freed", "Termin wieder frei", "Wird eine Anfrage abgelehnt oder eine Fahrstunde abgesagt (von dir oder dem Schüler), erfahren die anderen Schüler, dass der Termin wieder frei ist."),
    box("notify_button", "Knopf „Schüler hinweisen“", "Beim Antippen eines freien Termins (Heute/Kalender) erscheint ein Knopf, mit dem du alle Schüler auf diesen Termin aufmerksam machst."));
}

function bookingWindowSettings() {
  const st = state.settings;
  let mode = st.booking_closed ? "closed" : st.booking_days ? "times" : "open";
  const days = new Set(String(st.booking_days || "").split(",").filter((x) => x !== "").map(Number));
  const from = el("input", { type: "time", value: (st.booking_from || "18:00").slice(0, 5) });
  const to = el("input", { type: "time", value: (st.booking_to || "20:00").slice(0, 5) });
  const timesBox = el("div", {});
  const modeBtns = [["open", "✅ Immer"], ["closed", "⛔ Gesperrt"], ["times", "🕐 Nur zu bestimmten Zeiten"]].map(([m, t]) =>
    el("button", { type: "button", class: "tab", onclick: () => { mode = m; paint(); } }, t));
  const dayBtns = [1, 2, 3, 4, 5, 6, 0].map((d) => el("button", { type: "button", class: "tab", onclick: () => { days.has(d) ? days.delete(d) : days.add(d); paint(); } }, DOW[d]));
  function paint() {
    modeBtns.forEach((b, i) => b.classList.toggle("active", ["open", "closed", "times"][i] === mode));
    dayBtns.forEach((b, i) => b.classList.toggle("active", days.has([1, 2, 3, 4, 5, 6, 0][i])));
    timesBox.hidden = mode !== "times";
  }
  const save = el("button", { class: "btn small" }, "Speichern");
  save.onclick = () => busy(save, async () => {
    if (mode === "times" && !days.size) throw new Error("Bitte mindestens einen Tag wählen");
    if (mode === "times" && from.value >= to.value) throw new Error("„Bis“ muss nach „Von“ liegen");
    const v = { booking_closed: mode === "closed", booking_days: mode === "times" ? [...days].sort().join(",") : null,
      booking_from: mode === "times" ? from.value : null, booking_to: mode === "times" ? to.value : null };
    const { error } = await sb.from("settings").update(v).eq("teacher_id", state.profile.id);
    if (error) throw error;
    Object.assign(state.settings, v);
    toast(mode === "closed" ? "Anfragen sind jetzt gesperrt." : mode === "times" ? `Anfragen nur: ${bookingWindow().when || ""}` : "Anfragen sind jederzeit möglich.");
  });
  timesBox.append(el("label", {}, "An welchen Tagen?"), el("div", { class: "tabs", style: "flex-wrap:wrap" }, dayBtns),
    el("div", { class: "row" }, el("div", {}, el("label", {}, "Von"), from), el("div", {}, el("label", {}, "Bis"), to)));
  paint();
  return el("div", {},
    el("h3", {}, "Wann dürfen Schüler anfragen?"),
    el("p", { class: "muted small" }, "Termine kannst du jederzeit anlegen. Hier bestimmst du, wann Schüler sie anfragen können – z. B. nur sonntags von 18 bis 20 Uhr."),
    el("div", { class: "tabs", style: "flex-wrap:wrap" }, modeBtns), timesBox,
    el("div", { class: "actions" }, save));
}

function adminSettings() {
  const dur = durationControl(state.settings.default_duration);
  const maxOpen = el("input", { type: "number", min: 0, max: 50, value: state.settings.max_open ?? 3, style: "max-width:110px" });
  // Gilt die Wochen-Höchstzahl den ganzen Tag oder nur in einem Zeitfenster (z. B. 14–18 Uhr)?
  const hhmm = (t) => (t ? String(t).slice(0, 5) : "");
  const hasWindow = !!(state.settings.limit_from && state.settings.limit_to);
  const winAll = el("input", { type: "radio", name: "limit-win", checked: !hasWindow });
  const winPart = el("input", { type: "radio", name: "limit-win", checked: hasWindow });
  const winFrom = el("input", { type: "time", step: 900, value: hhmm(state.settings.limit_from) || "14:00" });
  const winTo = el("input", { type: "time", step: 900, value: hhmm(state.settings.limit_to) || "18:00" });
  const winBox = el("div", { class: "row", hidden: !hasWindow, style: "max-width:320px" },
    el("div", {}, el("label", {}, "von"), winFrom), el("div", {}, el("label", {}, "bis"), winTo));
  [winAll, winPart].forEach((r) => r.addEventListener("change", () => (winBox.hidden = !winPart.checked)));
  const phone = el("input", { type: "tel", value: state.settings.admin_phone || "", placeholder: "z. B. 0151 23456789" });
  const display = el("input", { value: state.settings.display_name || "", maxlength: 60 });
  const meetStd = el("input", { value: state.settings.meeting_point || "", maxlength: 200, placeholder: "z. B. Fahrschule, Hauptstraße 1" });
  const meetMore = el("textarea", { maxlength: 2000, rows: 3, placeholder: "z. B.\nBahnhof, Haupteingang\nSchule am Markt" }, state.settings.meeting_points || "");
  const save = el("button", { class: "btn" }, "Speichern");
  save.onclick = () => busy(save, async () => {
    if (winPart.checked && !(winFrom.value && winTo.value && winFrom.value < winTo.value)) throw new Error("Bitte ein gültiges Zeitfenster wählen (von vor bis).");
    const v = { default_duration: dur.value, max_open: Math.max(0, Math.min(50, +maxOpen.value || 0)), admin_phone: phone.value.trim() || null,
      limit_from: winPart.checked ? winFrom.value : null, limit_to: winPart.checked ? winTo.value : null,
      display_name: display.value.trim() || "Fahrlehrer",
      meeting_point: meetStd.value.trim() || null,
      meeting_points: meetMore.value.split("\n").map((x) => x.trim()).filter(Boolean).join("\n") || null };
    const { error } = await sb.from("settings").update(v).eq("teacher_id", state.profile.id);
    if (error) throw error;
    Object.assign(state.settings, v);
    toast("Einstellungen gespeichert.");
  });
  return el("div", {},
    genderCard(),
    isOwner() && (window.FSP_LEGAL_MISSING || []).length ? el("div", { class: "notice danger", style: "margin-bottom:16px" },
      "Impressum/Datenschutz unvollständig: Bitte in der Datei legal.js deine Anschrift und E-Mail eintragen (",
      (window.FSP_LEGAL_MISSING || []).map((k) => ({ street: "Straße", city: "PLZ/Ort", email: "E-Mail" })[k]).join(", "),
      "). ", legalLink("impressum", "Impressum ansehen")) : null,
    el("div", { class: "card" },
      studentPushSettings(),
      el("hr"),
      bookingWindowSettings(),
      el("h3", { style: "margin-top:18px" }, "Wie weit im Voraus dürfen Schüler anfragen?"),
      el("p", { class: "muted small" }, "Du kannst Termine Wochen vorher anlegen – Schüler sehen und anfragen können sie erst so viele Tage vorher. Leer = ohne Grenze."),
      (() => {
        const days = el("input", { type: "number", min: 1, max: 365, value: state.settings.book_ahead_days ?? "", placeholder: "z. B. 14", style: "max-width:110px" });
        const b = el("button", { class: "btn small" }, "Speichern");
        b.onclick = () => busy(b, async () => {
          const v = days.value === "" ? null : Math.max(1, Math.min(365, Math.round(+days.value)));
          const { error } = await sb.from("settings").update({ book_ahead_days: v }).eq("teacher_id", state.profile.id);
          if (error) throw error;
          state.settings.book_ahead_days = v;
          toast(v ? `Schüler können jetzt bis ${v} Tage im Voraus anfragen.` : "Keine Grenze – Schüler sehen alle freien Termine.");
        });
        return el("div", { class: "done-row" }, days, el("span", {}, "Tage"), b);
      })(),
      el("h3", { style: "margin-top:18px" }, "Standarddauer für neue Termine"),
      el("p", { class: "muted small" }, "Wird bei jedem neuen Termin vorausgefüllt. Du kannst sie dort pro Termin trotzdem ändern."),
      dur.node,
      el("h3", { style: "margin-top:18px" }, "Höchstzahl Fahrstunden pro Woche"),
      el("p", { class: "muted small" }, "So viele Termine darf ein Schüler pro Woche (Mo–So) anfragen bzw. haben, z. B. 1 oder 2. 0 = unbegrenzt. Will er mehr, kann er um eine Ausnahme bitten – die gewährst oder ablehnst du unter „Anfragen“. Einzelne Schüler (z. B. vor der Prüfung) kannst du in der Schülerliste dauerhaft freigeben."),
      maxOpen,
      el("label", {}, "Gilt für"),
      el("label", { class: "check" }, winAll, el("span", {}, "den ganzen Tag")),
      el("label", { class: "check" }, winPart, el("span", {}, "nur Termine in einem Zeitfenster – z. B. 14–18 Uhr. Termine davor oder danach sind frei buchbar.")),
      winBox,
      el("h3", { style: "margin-top:18px" }, "Dein Name für Schüler"),
      el("p", { class: "muted small" }, "So erscheinst du bei der Registrierung und in Nachrichten, z. B. „Kürsat“."),
      display,
      el("h3", { style: "margin-top:18px" }, "Deine Handynummer"),
      el("p", { class: "muted small" }, "Damit Schüler dich per WhatsApp-Knopf erreichen (z. B. nach einer Absage). Wird nur freigeschalteten Schülern angezeigt."),
      phone,
      el("h3", { style: "margin-top:18px" }, "📍 Standard-Treffpunkt"),
      el("p", { class: "muted small" }, "Gilt für jede Fahrstunde, solange du beim Bestätigen keinen anderen auswählst. Schüler sehen ihn nach der Bestätigung."),
      meetStd,
      el("h3", { style: "margin-top:18px" }, "Weitere Treffpunkte (Ausweich)"),
      el("p", { class: "muted small" }, "Einer pro Zeile. Diese kannst du beim Bestätigen oder Eintragen schnell auswählen."),
      meetMore,
      el("div", { class: "actions" }, save)),
    el("div", { class: "card" },
      el("h3", {}, "🔗 Link für Schüler"),
      el("p", { class: "muted small" }, "Ein Link für alle Fahrlehrer und Schüler. Bei der Registrierung wählen Schüler ihren Fahrlehrer aus – neue Fahrlehrer erscheinen dort automatisch. Den Link findest du auch jederzeit oben über 🔗."),
      linkBox(studentLink(), `Hallo! Hier kannst du dich für Fahrstunden anmelden. Wähle bei der Registrierung „${state.settings.display_name || "deinen Fahrlehrer"}“ als Fahrlehrer aus:`)),
    backupCard(),
    installCard(),
    pushCard(),
    todayCard(),
    backgroundCard(),
    passwordCard(),
  );
}

/* ---------------- Schüler: Kalender ---------------- */

async function studentCalendar() {
  const vr = viewRange(), from = vr.from, to = addDays(vr.from, vr.days);
  const [{ data, error }, own, myExams] = await Promise.all([
    sb.rpc("get_calendar", { p_from: from.toISOString(), p_to: to.toISOString() }),
    sb.from("bookings").select("id,slot_id,status,actual_minutes,meeting_point,slots(starts_at,duration_min,meeting_point)").eq("student_id", state.profile.id).eq("status", "confirmed"),
    sb.from("exams").select("id,kind,exam_at,duration_min,result,note,meeting_point").eq("student_id", state.profile.id).order("exam_at"),
  ]);
  const exams = myExams.data || [];
  await loadTimeOff();
  const today = dateInput(new Date()), soon = dateInput(addDays(new Date(), 21));
  const nextOff = (state.timeOff || []).find((t) => t.to_day >= today && t.from_day <= soon);
  // Nächste Prüfung (ab heute) – groß oben anzeigen
  const nextExam = exams.find((e) => !e.result && new Date(e.exam_at).getTime() > Date.now() - 6 * 3600000);
  const examExtras = exams.map((e) => ({ at: e.exam_at,
    node: el("button", { class: "slot exam", onclick: (ev) => { ev.stopPropagation(); goTab("training"); } },
      slotHead(`${EXAM_ICON[e.kind] || "🎓"} ${fmtRange(e.exam_at, e.duration_min || 55)}`, e.kind === "schalt" ? "Schalt-Test" : "Prüfung"), "Dein" + (e.kind === "schalt" ? " " : "e ") + examIn(e.kind), e.meeting_point || e.note ? el("div", { class: "small" }, "📍 " + (e.meeting_point || e.note)) : null,
      e.result ? el("div", {}, e.result === "passed" ? "🎉 Bestanden" : "✗ Nicht bestanden") : null) }));
  if (error) throw error;
  // Nächste eigene Fahrstunde mit Countdown
  const nextOwn = (own.data || []).filter((b) => b.slots && b.actual_minutes === null && addMin(b.slots.starts_at, b.slots.duration_min).getTime() > Date.now())
    .sort((a, b) => a.slots.starts_at.localeCompare(b.slots.starts_at))[0];
  const now = Date.now();
  // Freie und fremd angefragte (unbestätigte) Termine in der Zukunft + die eigenen.
  // Fremde bestätigte Fahrstunden liefert die Datenbank gar nicht erst.
  const ahead = state.settings.book_ahead_days;
  const horizon = ahead ? addDays(dayStart(new Date()), ahead + 1).getTime() : Infinity;
  const slots = data.filter((s) => s.mine || (new Date(s.starts_at).getTime() > now && (s.status !== "free" || new Date(s.starts_at).getTime() < horizon)));

  const grid = weekGrid(slots, (s) => {
    const past = new Date(s.starts_at).getTime() < now;
    const cls = s.mine && past ? "past" : s.status;
    const label = s.mine
      ? (s.status === "confirmed" ? "Deine Fahrstunde"
        : s.status === "offered" ? "📨 Für dich – bitte zusagen" : "Deine Anfrage – wartet")
      : s.status === "requested" ? el("span", {}, "Von jemandem angefragt", el("div", { class: "slot-hint" }, "↻ Wird evtl. wieder frei – schau später nochmal rein"))
      : earlyStartMs(s) ? el("span", {}, "Antippen zum Anfragen", el("div", { class: "slot-early" }, `⏰ Auch früher möglich: ab ${fmtTime(new Date(earlyStartMs(s)))} Uhr`))
      : "Antippen zum Anfragen";
    const tag = s.mine && past ? "gefahren"
      : { free: "frei", requested: "angefragt", offered: "angeboten", confirmed: "bestätigt" }[s.status] || "";
    const clickable = s.mine || (s.status === "free" && !past);
    const slotBtn = el("button", {
      class: "slot " + cls + (s.mine ? " mine" : ""), disabled: !clickable,
      onclick: clickable ? () => (s.mine ? goTab("mine") : openBooking(s)) : null,
    }, slotHead(fmtRange(s.starts_at, s.duration_min), tag), label);
    // Jede eigene bestätigte Fahrstunde lässt sich direkt im Kalender absagen
    const ownB = s.mine && s.status === "confirmed" && !past
      ? (own.data || []).find((b) => b.slot_id === s.slot_id && b.actual_minutes === null && b.slots) : null;
    return ownB ? el("div", { class: "slot-with-cancel" }, slotBtn,
      el("button", { class: "btn small cancel-strong", onclick: () => openStudentCancel(ownB) }, "✗ Fahrstunde absagen")) : slotBtn;
  }, null, offExtras(null).concat(examExtras));

  // Zugang läuft bald ab bzw. ist abgelaufen (Schonfrist) → Hinweis an den Schüler
  const left = daysLeft(state.profile.valid_until);
  const expiryNote = left !== null && (left <= 30 || state.passed) ? el("div", { class: "notice", style: "margin-bottom:12px" }, el("b", {}, "⏳ "),
    state.passed ? `🎉 Glückwunsch zur bestandenen Prüfung! Dein Zugang zur App läuft noch bis ${fmtUntil(state.profile.valid_until)}.`
      : left >= 0 ? `Dein Zugang läuft am ${fmtUntil(state.profile.valid_until)} ab.` : `Dein Zugang ist abgelaufen – in ${GRACE_DAYS + left} Tag${GRACE_DAYS + left === 1 ? "" : "en"} wird er gesperrt.`,
    state.passed ? "" : " Sprich deinen Fahrlehrer an, wenn du weiter fahren möchtest – er kann ihn verlängern.") : null;
  // Große Knöpfe wie beim Fahrlehrer: schnell zu den wichtigsten Bereichen
  const waT = waNumber(state.settings.admin_phone);
  const quick = el("div", { class: "quick-row" },
    quickBtn("add", "🚗", "Meine Fahrstunden", "Termine & Zusagen", () => goTab("mine")),
    quickBtn("cal", "📈", "Mein Stand", "Ausbildung & Prüfung", () => goTab("training")),
    waT ? quickBtn("wa", "💬", "Fahrlehrer", "per WhatsApp schreiben",
      () => window.open(`https://wa.me/${waT}?text=${encodeURIComponent(`Hallo, hier ist ${fullName(state.profile)}.\n`)}`, "_blank", "noopener")) : null,
    quickBtn("", "👤", "Profil", "Daten & Mitteilungen", () => goTab("profile")));
  return el("div", {},
    quick,
    expiryNote,
    !bookingWindow().open ? el("div", { class: "notice", style: "margin-bottom:12px" }, el("b", {}, "⏳ "), bookingWindow().text) : null,
    nextOff ? el("div", { class: "notice off-banner", style: "margin-bottom:12px" },
      el("b", {}, `🏖️ Dein Fahrlehrer ist nicht verfügbar (${nextOff.note || "frei"}): `), offRange(nextOff),
      ". An diesen Tagen kannst du nichts anfragen.") : null,
    nextExam ? examBanner(nextExam) : null,
    nextOwn ? el("div", { class: "card next-card" },
      el("div", { class: "next-row first", style: "cursor:default" },
        el("span", { class: "next-when" }, `Deine nächste Fahrstunde: ${fmtDay(nextOwn.slots.starts_at)} ${fmtRange(nextOwn.slots.starts_at, nextOwn.slots.duration_min)}`)),
      meetingBox(meetingOf(nextOwn)),
      new Date(nextOwn.slots.starts_at).getTime() > Date.now()
        ? el("div", { class: "actions", style: "margin-top:8px" }, el("button", { class: "btn small cancel-strong", onclick: () => openStudentCancel(nextOwn) }, "✗ Fahrstunde absagen")) : null) : null,
    weekBar(),
    grid,
    slots.length === 0 ? el("p", { class: "muted", style: "margin-top:12px" }, "In dieser Woche gibt es keine freien Termine. Schau in der nächsten Woche (›) nach.") : null,
  );
}

// Prüfungs-Kasten für den Schüler: Termin, Treffpunkt, was mitbringen, Motivation
const EASY_E = '<svg viewBox="13 9 35.5 46" aria-hidden="true"><rect x="14" y="10" width="8" height="44" rx="4" fill="#0b3d5c"/><rect x="14" y="13.5" width="22" height="7" rx="3.5" fill="#0b3d5c"/><rect x="14" y="28.5" width="22" height="7" rx="3.5" fill="#0b3d5c"/><rect x="14" y="43.5" width="22" height="7" rx="3.5" fill="#0b3d5c"/><circle cx="40" cy="17" r="7" fill="#e5484d"/><circle cx="40" cy="32" r="7" fill="#f5a623"/><circle cx="40" cy="47" r="7" fill="#2fb36d"/></svg>';
function examBanner(e) {
  const easy = el("span", { class: "easy-word", "aria-label": "Easy" });
  easy.innerHTML = EASY_E + "<span>asy!</span>";
  const meet = e.meeting_point;
  const start = new Date(e.exam_at);
  const item = (icon, title, sub) => el("div", { class: "tk-item" }, el("span", { class: "tk-ico" }, icon), el("b", {}, title), el("small", {}, sub));
  // Wie ein Ticket: oben Termin, gestrichelte Abrisskante, unten „Mitbringen“ und Motivation
  return el("div", { class: "exam-ticket" },
    el("div", { class: "tk-head", onclick: () => goTab("training") },
      el("div", { class: "tk-date" },
        el("span", {}, start.toLocaleDateString("de-DE", { weekday: "short" })),
        el("b", {}, start.getDate()),
        el("span", {}, start.toLocaleDateString("de-DE", { month: "short" }))),
      el("div", { class: "tk-main" },
        el("span", { class: "tk-label" }, `${EXAM_ICON[e.kind] || "🎓"} ${EXAM_KIND[e.kind] || "Prüfung"}`),
        el("div", { class: "tk-row" }, el("b", { class: "tk-time" }, `${fmtRange(e.exam_at, e.duration_min || 55)} Uhr`), countdownEl(e.exam_at, e.duration_min || 55, "tk-count")),
        meet ? el("a", { class: "tk-meet", href: "https://www.google.com/maps/search/?api=1&query=" + encodeURIComponent(meet), target: "_blank", rel: "noopener",
          onclick: (ev) => ev.stopPropagation() }, "📍 " + meet) : null)),
    el("div", { class: "tk-cut" }),
    el("div", { class: "tk-bring" },
      item("🪪", "Ausweis", "Personalausweis oder Pass"),
      item("👓", "Sehhilfe", "Brille/Linsen, falls nötig"),
      item("🧾", "Kontoauszug", "auf Papier, falls TÜV-Zahlung < 1 Woche")),
    el("div", { class: "tk-motto" }, el("span", {}, "Du schaffst es"), easy, el("span", { class: "tk-luck" }, "Viel Erfolg 🍀")));
}

// Freier Termin, der auf Wunsch früher beginnen kann (Fahrstunde davor wurde vorgezogen): frühester Beginn, sonst null
function earlyStartMs(s) {
  if (!s.earlier_from || s.status !== "free") return null;
  const base = new Date(s.starts_at).getTime();
  const ms = Math.max(new Date(s.earlier_from).getTime(), base - 3600000);
  return ms < base && ms > Date.now() + 15 * 60000 ? ms : null;
}

// Dürfen Schüler gerade anfragen? (Einstellung des Fahrlehrers: immer / gesperrt / nur zu bestimmten Zeiten)
const DOW = ["So", "Mo", "Di", "Mi", "Do", "Fr", "Sa"];
function bookingWindow() {
  const st = state.settings || {};
  if (st.booking_closed) return { open: false, text: "Dein Fahrlehrer hat Anfragen gerade gesperrt. Du kannst dir die Termine ansehen, aber noch nichts anfragen." };
  const days = String(st.booking_days || "").split(",").filter((x) => x !== "").map(Number);
  if (!days.length) return { open: true };
  const from = (st.booking_from || "00:00").slice(0, 5), to = (st.booking_to || "24:00").slice(0, 5);
  const now = new Date(new Date().toLocaleString("en-US", { timeZone: "Europe/Berlin" }));
  const hm = timeInput(now);
  const open = days.includes(now.getDay()) && hm >= from && hm < to;
  const when = days.map((d) => DOW[d]).join(", ") + (st.booking_from || st.booking_to ? ` von ${from} bis ${to} Uhr` : "");
  return { open, text: open ? "" : `Anfragen sind nur möglich: ${when}.`, when };
}

function openBooking(s) {
  const win = bookingWindow();
  if (!win.open) return openModal("Anfragen gerade nicht möglich", el("p", {}, win.text), el("div", { class: "actions" }, el("button", { class: "btn", onclick: closeModal }, "OK")));
  const note = el("textarea", { maxlength: 300, placeholder: "Optional, z. B. „Kann ich am Bahnhof abgeholt werden?“" });
  const counter = el("div", { class: "muted small", style: "text-align:right" }, "0 / 300");
  note.addEventListener("input", () => (counter.textContent = `${note.value.length} / 300`));
  // Abweichung vorschlagen: bis zu 1 Stunde früher oder später (der Fahrlehrer entscheidet)
  const base = new Date(s.starts_at).getTime();
  s._wish = null;
  // Fahrlehrer hat die Fahrstunde davor vorgezogen: Dieser Termin kann auf Wunsch früher beginnen
  const earlyMs = earlyStartMs(s);
  const hasEarly = !!earlyMs;
  const earlyMin = hasEarly ? Math.round((earlyMs - base) / 60000) : null;
  const wishSteps = [-60, -45, -30, -15, 0, 15, 30, 45, 60];
  if (hasEarly && !wishSteps.includes(earlyMin)) { wishSteps.push(earlyMin); wishSteps.sort((a, b) => a - b); }
  const wishBtns = wishSteps.filter((m) => m === 0 || base + m * 60000 > Date.now() + 15 * 60000).map((m) => el("button", {
    type: "button", class: "tab" + (m === 0 ? " active" : "") + (hasEarly && m === earlyMin ? " early-tab" : ""),
    onclick: (e) => {
      s._wish = m ? new Date(base + m * 60000).toISOString() : null;
      wishBtns.forEach((x) => x.classList.toggle("active", x === e.currentTarget));
      wishHint.hidden = !m;
      btn.textContent = m ? `Fahrstunde für ${fmtTime(s._wish)} Uhr anfragen` : "Fahrstunde anfragen";
    },
  }, fmtTime(new Date(base + m * 60000)) + (m === 0 ? " ✓" : "")));
  const wishHint = el("div", { class: "notice", hidden: true, style: "margin-top:8px" }, el("b", {}, "⚠️ Keine Garantie: "),
    "Dein Fahrlehrer sieht deine Wunschzeit und entscheidet, ob es passt. Klappt es nicht, bestätigt er die angegebene Uhrzeit oder lehnt ab.");
  const btn = el("button", { class: "btn" }, "Fahrstunde anfragen");
  btn.onclick = () => busy(btn, async () => {
    const { data: newId, error } = await sb.rpc("book_slot", { p_slot: s.slot_id, p_note: note.value, p_wish: s._wish });
    // Höchstzahl erreicht → Pop-up mit der Möglichkeit, um eine Ausnahme zu bitten
    const limit = error && /LIMIT:(\d+):(\d+):?([\d:]+-[\d:]+)?\|?([UN])?/.exec(error.message || "");
    if (limit) return openLimitRequest(s, note.value, +limit[1], +limit[2], limit[3], limit[4] === "U");
    if (error) throw error;
    pushNotify("booking", newId, "request");
    toast("Angefragt! Du siehst unter „Meine Fahrstunden“, sobald dein Fahrlehrer bestätigt.");
    closeModal();
    render();
  });
  let earlyBox = null;
  if (hasEarly) {
    const earlyText = fmtTime(new Date(earlyMs));
    const pickEarly = el("button", { type: "button", class: "btn small ok", onclick: () => {
      wishBtns[wishSteps.filter((m) => m === 0 || base + m * 60000 > Date.now() + 15 * 60000).indexOf(earlyMin)].click();
      btn.scrollIntoView({ behavior: "smooth", block: "center" });
    } }, `⏰ Ab ${earlyText} Uhr anfragen`);
    const askTeacher = waButton(state.settings.admin_phone,
      `Hallo, geht die Fahrstunde am ${fmtDate(s.starts_at)} auch schon ab ${earlyText} Uhr statt ${fmtTime(s.starts_at)} Uhr?`, "💬 Fahrlehrer fragen");
    earlyBox = el("div", { class: "early-hint" },
      el("b", {}, "⏰ Das geht auch früher!"),
      el("div", {}, `Dieser Termin kann schon ab ${earlyText} Uhr beginnen. Frag ihn einfach an oder schreib deinem Fahrlehrer. Er entscheidet, ob es passt.`),
      el("div", { class: "actions", style: "margin:8px 0 0" }, pickEarly, askTeacher));
  }
  openModal("Fahrstunde anfragen",
    el("p", {}, el("b", {}, fmtDate(s.starts_at)), el("br"), fmtRange(s.starts_at, s.duration_min), ` (${s.duration_min} Min.)`),
    earlyBox,
    el("div", { class: "wish-box" },
      el("b", { class: "wish-box-title" }, "🕐 Andere Uhrzeit gewünscht?"),
      el("div", {}, "Tippe einfach deine Wunschzeit an: bis zu 1 Stunde früher oder später. Dein Fahrlehrer entscheidet, ob es passt."),
      el("div", { class: "tabs wish-tabs" }, wishBtns),
      el("p", { class: "small muted", style: "margin:6px 0 0" }, "✓ = angegebene Uhrzeit, am sichersten."), wishHint),
    meetingBox(meetingOf(s)),
    el("label", {}, "Kurze Nachricht an deinen Fahrlehrer"), note, counter,
    el("div", { class: "notice" },
      el("b", {}, "Wichtig: "), "Nach der Bestätigung durch deinen Fahrlehrer ist die Fahrstunde verbindlich. ",
      `Kostenlos absagen kannst du bis zum Vortag 18:00 Uhr (hier: ${fmtDeadline(s.starts_at)}). `,
      "Spätere Absagen werden als Fehlstunde berechnet und sind kostenpflichtig."),
    isLate(s.starts_at) ? el("div", { class: "notice danger" },
      "Kurzfristige Buchung: Die Absagefrist ist bereits abgelaufen. Wird diese Fahrstunde bestätigt, ist eine Absage kostenpflichtig.") : null,
    el("div", { class: "actions" }, btn, el("button", { class: "btn ghost", onclick: closeModal }, "Abbrechen")));
}

// Höchstzahl erreicht: Hinweis + kurze Nachricht an den Fahrlehrer → Anfrage als „Ausnahme gewünscht“
// used = Ausnahme-Bitte in dieser Woche schon gestellt → nur noch Hinweis, keine weitere Bitte
function openLimitRequest(s, prevNote, open, max, win, used) {
  const span = win ? ` zwischen ${win.replace("-", " und ")} Uhr` : "";
  const msg = el("textarea", { maxlength: 300, placeholder: "z. B. „Meine Prüfung ist bald – könnte ich diese Woche noch eine Stunde fahren?“" });
  msg.value = prevNote || "";
  const btn = el("button", { class: "btn" }, "📨 Trotzdem anfragen (Ausnahme)");
  btn.onclick = () => busy(btn, async () => {
    if (!msg.value.trim()) throw new Error("Bitte schreib kurz, warum du eine weitere Fahrstunde möchtest.");
    const { data: newId, error } = await sb.rpc("book_slot", { p_slot: s.slot_id, p_note: msg.value.trim(), p_exception: true, p_wish: s._wish || null });
    if (error && /LIMIT:.*\|U/.test(error.message || "")) return openLimitRequest(s, msg.value, open, max, win, true);
    if (error) throw error;
    pushNotify("booking", newId, "exception");
    toast("Deine Bitte ist bei deinem Fahrlehrer angekommen. Er entscheidet, ob er eine Ausnahme macht.");
    closeModal();
    render();
  });
  const info = el("div", { class: "notice" }, el("b", {}, `Du hast in dieser Woche schon ${open} Fahrstunde${open === 1 ? "" : "n"}${span}`),
    ` – die Höchstzahl pro Woche${span ? " für diese Uhrzeit" : ""} ist ${max}.`, win ? " Termine zu anderen Uhrzeiten kannst du ganz normal anfragen." : "");
  if (used) return openModal("Wochen-Höchstzahl erreicht", info,
    el("div", { class: "notice danger" }, el("b", {}, "Ausnahme schon genutzt: "),
      "Du hast in dieser Woche bereits um eine Ausnahme gebeten. Pro Woche ist nur eine Ausnahme-Bitte möglich – ab nächster Woche kannst du wieder normal anfragen."),
    el("div", { class: "actions" }, el("button", { class: "btn", onclick: closeModal }, "Verstanden")));
  openModal("Wochen-Höchstzahl erreicht", info,
    el("p", {}, "Möchtest du diesen Termin trotzdem? Bitte deinen Fahrlehrer um eine Ausnahme und schreib kurz, warum. Die Ausnahme gilt nur für diesen einen Termin – und pro Woche ist nur eine Ausnahme-Bitte möglich."),
    el("p", { class: "small" }, el("b", {}, fmtDate(s.starts_at)), ` · ${fmtRange(s.starts_at, s.duration_min)}`),
    el("label", {}, "Nachricht an deinen Fahrlehrer"), msg,
    el("div", { class: "actions" }, btn, el("button", { class: "btn ghost", onclick: closeModal }, "Abbrechen")));
}

/* ---------------- Kontrolle: abgehakte Fahrstunden eines Monats – zum Übertragen ins Fahrschulsystem ---------------- */

// Kalenderwoche nach ISO 8601 (Woche beginnt Montag)
function isoWeek(d) {
  const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  t.setUTCDate(t.getUTCDate() + 3 - ((t.getUTCDay() + 6) % 7));
  const w1 = new Date(Date.UTC(t.getUTCFullYear(), 0, 4));
  return 1 + Math.round(((t - w1) / 86400000 - 3 + ((w1.getUTCDay() + 6) % 7)) / 7);
}
const monthName = (d) => d.toLocaleDateString("de-DE", { month: "long", year: "numeric" });

async function loadControlRows(from, to) {
  const { data, error } = await sb.from("bookings")
    .select("id,status,actual_minutes,lesson_type,late_cancel,cancel_reason,transferred_at,profiles(first_name,last_name,license_class,is_conversion),slots!inner(id,starts_at,duration_min)")
    .gte("slots.starts_at", from.toISOString()).lt("slots.starts_at", to.toISOString());
  if (error) throw error;
  // Alle bestätigten Fahrstunden (abgehakt oder noch nicht) + kostenpflichtige Fehlstunden
  return data.filter((b) => b.slots && (b.status === "confirmed" || b.late_cancel))
    .sort((a, b) => a.slots.starts_at.localeCompare(b.slots.starts_at));
}
const controlKind = (b) => (b.status === "confirmed" ? LESSON_TYPES[b.lesson_type || "normal"] : "Fehlstunde (kostenpflichtig)");
// Zusammenfassung: Anzahl Fahrstunden und Minuten (bewusst nur Minuten, keine Stunden-Umrechnung)
const sumLine = (list) => {
  const driven = list.filter((b) => b.status === "confirmed");
  const min = driven.reduce((s, b) => s + b.actual_minutes, 0);
  const late = list.length - driven.length;
  return [driven.length ? `${driven.length} Fahrstunde${driven.length === 1 ? "" : "n"} · ${min} Min.` : "",
    late ? `${late} Fehlstunde${late === 1 ? "" : "n"}` : ""].filter(Boolean).join(" · ");
};

// Kontrolle: schlichte Monatsliste Tag für Tag – wer, wann, wie lange; Tages- und Monatsminuten (für die Abrechnung)
async function adminControl() {
  const m = state.controlMonth || new Date(new Date().getFullYear(), new Date().getMonth(), 1);
  state.controlMonth = m;
  const from = new Date(m.getFullYear(), m.getMonth(), 1), to = new Date(m.getFullYear(), m.getMonth() + 1, 1);
  const [bookRows, examRes, theoryRes, payRes, ownRes] = await Promise.all([
    loadControlRows(from, to),
    sb.from("exams").select("id,exam_at,duration_min").gte("exam_at", from.toISOString()).lt("exam_at", to.toISOString()),
    sb.from("theory_lessons").select("id,held_at,duration_min,note").eq("teacher_id", state.profile.id).gte("held_at", from.toISOString()).lt("held_at", to.toISOString()).order("held_at"),
    sb.from("teacher_pay").select("*").eq("teacher_id", state.profile.id).maybeSingle(),
    sb.from("own_entries").select("id,kind,lesson_type,student_name,starts_at,duration_min,done,note,transferred_at").eq("teacher_id", state.profile.id).gte("starts_at", from.toISOString()).lt("starts_at", to.toISOString()).order("starts_at"),
  ]);
  // Eigene Fahrstunden (Schüler ohne App) wie normale Fahrstunden behandeln
  const ownAll = ownRes.data || [];
  const allRows = bookRows.concat(ownAll.filter((x) => x.kind === "lesson").map((x) => ({
    id: x.id, _own: true, _src: x, status: "confirmed", actual_minutes: x.done ? x.duration_min : null, lesson_type: x.lesson_type || "normal",
    transferred_at: x.transferred_at, profiles: { first_name: x.student_name, last_name: "" }, slots: { id: null, starts_at: x.starts_at, duration_min: x.duration_min } })))
    .sort((a, b) => a.slots.starts_at.localeCompare(b.slots.starts_at));
  const isTicked = (b) => b.status === "confirmed" && b.actual_minutes !== null;
  const isFinished = (b) => isTicked(b) || b.status !== "confirmed";
  // Abrechnung und Übertragen betreffen nur Abgehaktes und Fehlstunden
  const rows = allRows.filter(isFinished);
  const openOnly = !!state.controlOpenOnly;
  const shown = openOnly ? allRows.filter((b) => !b.transferred_at) : allRows;
  const openCount = () => rows.filter((b) => !b.transferred_at).length;
  const openInfo = el("span", { class: "small" });
  const updateOpen = () => (openInfo.textContent = openCount() ? `Noch zu übertragen: ${openCount()}` : "✓ Alles übertragen");
  updateOpen();

  async function setTransferred(list, on) {
    const stamp = on ? new Date().toISOString() : null;
    const bk = list.filter((b) => !b._own), ow = list.filter((b) => b._own);
    if (bk.length) { const { error } = await sb.from("bookings").update({ transferred_at: stamp }).in("id", bk.map((b) => b.id)); if (error) throw error; }
    if (ow.length) { const { error } = await sb.from("own_entries").update({ transferred_at: stamp }).in("id", ow.map((b) => b.id)); if (error) throw error; }
    list.forEach((b) => (b.transferred_at = on ? new Date().toISOString() : null));
  }
  // Noch nicht abgehakt: deutlich markiert, ab 45 Min. vor Beginn direkt hier abhaken
  const saveTick = async (b, patch, msg) => {
    const { error } = b._own ? await sb.from("own_entries").update({ done: true }).eq("id", b.id) : await sb.from("bookings").update(patch).eq("id", b.id);
    if (error) throw error;
    toast(msg);
    render();
  };
  const todoLine = (b) => {
    const start = new Date(b.slots.starts_at).getTime(), nowMs = Date.now();
    const over = start + b.slots.duration_min * 60000 <= nowMs;
    const canTick = nowMs >= start - 45 * 60000;
    const tick = canTick ? el("button", { type: "button", class: "tr-tick", title: `Gefahren – ${b.slots.duration_min} Min. abhaken`, "aria-label": "Gefahren abhaken", onclick: async (ev) => {
      if (!b._own && askSchalt(b)) return openSchaltAsk(b, b.slots.duration_min, saveTick);
      const btn = ev.currentTarget; btn.disabled = true;
      try { await saveTick(b, { actual_minutes: b.slots.duration_min, lesson_type: b.lesson_type || "normal" }, `✓ ${fullName(b.profiles)}: ${b.slots.duration_min} Min. gefahren`); }
      catch (e) { btn.disabled = false; fail(e); }
    } }, "✓") : null;
    return el("div", { class: "cl-row todo" + (over ? " over" : "") },
      el("span", { class: "cl-time" }, fmtTime(b.slots.starts_at)),
      el("button", { type: "button", class: "cl-name name-link", title: "Termin öffnen", onclick: () => (b._own ? openPlanned("own", b._src) : openAdminSlot(b.slots.id)) }, fullName(b.profiles)),
      el("span", { class: "cl-flag" }, over ? "☐ nicht abgehakt" : "☐ geplant", ` · ${b.slots.duration_min} Min.`),
      tick);
  };
  // Eine Zeile: Uhrzeit · Name · Minuten · Haken „übertragen“
  const line = (b) => {
    if (!isFinished(b)) return todoLine(b);
    const ok = b.status === "confirmed";
    const box = el("input", { type: "checkbox", checked: !!b.transferred_at, title: "Ins Fahrschulsystem übertragen", "aria-label": "Übertragen" });
    const row = el("label", { class: "cl-row" + (ok ? "" : " late") + (b.transferred_at ? " sent" : "") },
      el("span", { class: "cl-time" }, fmtTime(b.slots.starts_at)),
      el("span", { class: "cl-name" }, fullName(b.profiles)),
      el("b", { class: "cl-min" }, ok ? `✓ ${b.actual_minutes} Min.` : "Fehlstunde"),
      box);
    box.addEventListener("change", async () => {
      box.disabled = true;
      try { await setTransferred([b], box.checked); row.classList.toggle("sent", box.checked); updateOpen(); }
      catch (e) { box.checked = !box.checked; fail(e); }
      box.disabled = false;
    });
    return row;
  };
  // Nach Tagen gruppieren (nur Tage mit Fahrstunden)
  const days = [];
  for (const b of shown) {
    const key = dateInput(b.slots.starts_at);
    let d = days.find((x) => x.key === key);
    if (!d) days.push((d = { key, list: [] }));
    d.list.push(b);
  }
  const dayMin = (list) => list.filter(isTicked).reduce((n, b) => n + b.actual_minutes, 0);
  const driven = rows.filter((b) => b.status === "confirmed"), totalMin = dayMin(rows), late = rows.length - driven.length;
  const notTicked = allRows.filter((b) => !isFinished(b) && new Date(b.slots.starts_at).getTime() + b.slots.duration_min * 60000 <= Date.now()).length;
  // Monatsübersicht: Prüfungen, Theorie, Gesamtzeit, unverbindlicher Lohn
  const examsApp = (examRes.data || []).filter((e) => new Date(e.exam_at).getTime() <= Date.now());
  const examsOwn = ownAll.filter((x) => x.kind === "exam" && new Date(x.starts_at).getTime() <= Date.now());   // Prüfungen von Schülern ohne App
  const examsDone = examsApp.concat(examsOwn);
  const examMin = examsApp.reduce((n, e) => n + (e.duration_min || 55), 0) + examsOwn.reduce((n, x) => n + x.duration_min, 0);
  const theoryAll = theoryRes.data || [];
  const theory = theoryAll.filter((t) => new Date(t.held_at).getTime() <= Date.now());   // geplante, noch nicht gehaltene zählen nicht mit
  const theoryMin = theory.reduce((n, t) => n + t.duration_min, 0);
  const nightMin = driven.filter((b) => b.lesson_type === "nacht").reduce((n, b) => n + b.actual_minutes, 0);
  const allMin = totalMin + theoryMin + examMin;
  await loadTimeOff();
  const yKey = (mm) => `${m.getFullYear()}-${pad(mm)}`;
  const vacMonth = countVacation(state.timeOff, dateInput(from), dateInput(addDays(to, -1)));
  const vacYear = countVacation(state.timeOff, `${yKey(1)}-01`, `${yKey(12)}-31`);
  const monthCard = monthOverview({ vacMonth, vacYear, year: m.getFullYear(), examCount: examsDone.length, theory, theoryAll, theoryMin, allMin, drivenMin: totalMin, nightMin, pay: payRes.data || null, schemaOk: !theoryRes.error });

  const prev = el("button", { class: "btn small ghost", onclick: () => { state.controlMonth = new Date(m.getFullYear(), m.getMonth() - 1, 1); render(); } }, "‹");
  const next = el("button", { class: "btn small ghost", onclick: () => { state.controlMonth = new Date(m.getFullYear(), m.getMonth() + 1, 1); render(); } }, "›");
  const onlyOpen = el("input", { type: "checkbox", checked: openOnly });
  onlyOpen.addEventListener("change", () => { state.controlOpenOnly = onlyOpen.checked; render(); });
  const totals = el("div", { class: "cl-totals" },
    el("div", {}, el("b", {}, String(driven.length)), el("span", {}, "Fahrstunden")),
    el("div", {}, el("b", {}, String(totalMin)), el("span", {}, "Minuten")),
    notTicked ? el("div", { class: "warn" }, el("b", {}, String(notTicked)), el("span", {}, "nicht abgehakt")) : null,
    late ? el("div", { class: "warn" }, el("b", {}, String(late)), el("span", {}, late === 1 ? "Fehlstunde" : "Fehlstunden")) : null);

  return el("div", {},
    el("div", { class: "card" },
      el("div", { class: "done-row", style: "justify-content:space-between;margin:0 0 10px" },
        prev, el("b", { style: "font-size:17px" }, monthName(m)), next),
      totals,
      el("div", { class: "done-row", style: "justify-content:space-between;margin:10px 0 0" }, openInfo,
        el("label", { class: "check", style: "margin:0" }, onlyOpen, el("span", { class: "small" }, "Nur nicht übertragene"))),
      el("div", { class: "actions" },
        el("button", { class: "btn small ghost", onclick: () => exportControlCsv(m, rows) }, "📊 Excel"),
        el("button", { class: "btn small ghost", onclick: () => exportControlPrint(m, rows) }, "🖨️ Drucken / PDF"))),
    monthCard,
    days.length ? el("div", { class: "card cl-list" },
      days.map((d) => el("div", { class: "cl-day" },
        el("div", { class: "cl-head" },
          el("span", {}, new Date(d.list[0].slots.starts_at).toLocaleDateString("de-DE", { weekday: "short", day: "2-digit", month: "2-digit" })),
          el("b", {}, dayMin(d.list) ? `${dayMin(d.list)} Min.` : "–")),
        d.list.map(line))),
      el("div", { class: "cl-sum" }, el("span", {}, `Monat gesamt · ${driven.length} Fahrstunde${driven.length === 1 ? "" : "n"}` + (late ? ` · ${late} Fehlstd.` : "")), el("b", {}, `${totalMin} Min.`)))
      : el("p", { class: "muted" }, openOnly && allRows.length ? "Alles übertragen – nichts mehr offen. 👍" : "In diesem Monat gibt es noch keine bestätigten Fahrstunden."));
}

// Gesamtzeit gut lesbar
const fmtHours = (min) => (min >= 60 ? `${Math.floor(min / 60)} Std.${min % 60 ? ` ${min % 60} Min.` : ""}` : `${min} Min.`);
const euro = (v) => (+v || 0).toLocaleString("de-DE", { style: "currency", currency: "EUR" });
// Unverbindliche Brutto-Schätzung: Sätze je 45 Minuten, Prüfungszuschlag je Prüfung; Fehlstunden zählen nicht mit
// Urlaubstage (Eintrag mit „Urlaub“) zwischen zwei Tagen zählen – Sonntage zählen nicht
const VACATION_MIN = 480;   // 1 Urlaubstag = 480 Min. Fahrstunde
function countVacation(list, fromKey, toKey) {
  let n = 0;
  for (const t of list || []) {
    if (!/urlaub/i.test(t.note || "")) continue;
    const a = t.from_day > fromKey ? t.from_day : fromKey, b = t.to_day < toKey ? t.to_day : toKey;
    for (let d = fromInputs(a, "12:00"); dateInput(d) <= b; d = addDays(d, 1)) if (d.getDay() !== 0) n++;
  }
  return n;
}
function payEstimate(pay, d) {
  const per45 = (rate, min) => (+rate || 0) * min / LESSON_MIN;
  const parts = [
    ["Fahrstunden", per45(pay.lesson_rate, d.drivenMin), +pay.lesson_rate > 0],
    [`Urlaub (${d.vacMonth || 0} × ${VACATION_MIN} Min.)`, per45(pay.lesson_rate, (d.vacMonth || 0) * VACATION_MIN), +pay.lesson_rate > 0 && d.vacMonth > 0],
    ["Zuschlag Theorie", per45(pay.theory_bonus, d.theoryMin), +pay.theory_bonus > 0],
    ["Zuschlag Prüfungen", (+pay.exam_bonus || 0) * d.examCount, +pay.exam_bonus > 0],
    ["Zuschlag Nachtfahrten", per45(pay.night_bonus, d.nightMin), +pay.night_bonus > 0],
  ].filter((x) => x[2]);
  return { parts, total: parts.reduce((n, x) => n + x[1], 0) };
}
function monthOverview(d) {
  const addTheory = el("button", { class: "btn small", onclick: () => openTheoryForm() }, "➕ Theorie eintragen");
  const tl = d.theoryAll || d.theory;
  const theoryList = tl.length ? el("details", { class: "fold" },
    el("summary", {}, `Theoriestunden (${d.theory.length}${tl.length > d.theory.length ? ` + ${tl.length - d.theory.length} geplant` : ""})`),
    tl.map((t) => {
      const del = el("button", { type: "button", class: "btn small ghost danger-text" }, "Löschen");
      del.onclick = () => busy(del, async () => {
        if (!confirm("Diese Theoriestunde löschen?")) return;
        const { error } = await sb.from("theory_lessons").delete().eq("id", t.id);
        if (error) throw error;
        render();
      });
      return el("div", { class: "cl-row", style: "cursor:default" },
        el("span", { class: "cl-name" }, `${new Date(t.held_at).getTime() > Date.now() ? "🗓 geplant · " : ""}${fmtDay(t.held_at)} ${fmtTime(t.held_at)}${t.note ? ` · ${t.note}` : ""}`),
        el("b", { class: "cl-min" }, `${t.duration_min} Min.`), del);
    })) : null;
  const pay = d.pay || {};
  const est = payEstimate(pay, d);
  const field = (label, key) => {
    const input = el("input", { type: "number", min: 0, step: "0.01", inputmode: "decimal", value: pay[key] ?? "", placeholder: "0,00" });
    return { key, input, node: el("div", {}, el("label", {}, label), input) };
  };
  const fields = [field("Fahrstunde, brutto je 45 Min. (€)", "lesson_rate"), field("Zuschlag Theorie je 45 Min. (€)", "theory_bonus"),
    field("Zuschlag je Prüfung (€)", "exam_bonus"), field("Zuschlag Nachtfahrt je 45 Min. (€)", "night_bonus"),
    field("Urlaubstage pro Jahr", "vacation_days")];
  fields[4].input.step = "1"; fields[4].input.placeholder = "z. B. 25";
  const save = el("button", { class: "btn small" }, "Speichern");
  save.onclick = () => busy(save, async () => {
    const row = { teacher_id: state.profile.id, updated_at: new Date().toISOString() };
    for (const f of fields) {
      const v = f.input.value === "" ? null : +f.input.value;
      if (v !== null && (isNaN(v) || v < 0 || v > 100000)) throw new Error("Bitte gültige Beträge eintragen");
      row[f.key] = v;
    }
    const { error } = await sb.from("teacher_pay").upsert(row);
    if (error) throw error;
    toast("Lohnangaben gespeichert.");
    render();
  });
  return el("div", { class: "card" },
    el("h3", { class: "sec-title", style: "margin-top:0" }, "📈 Monatsübersicht"),
    el("div", { class: "cl-totals" },
      el("div", {}, el("b", {}, String(d.examCount)), el("span", {}, d.examCount === 1 ? "Prüfung" : "Prüfungen")),
      el("div", {}, el("b", {}, String(d.theory.length)), el("span", {}, "Theoriestunden")),
      el("div", {}, el("b", {}, fmtHours(d.allMin)), el("span", {}, "Gesamtzeit"))),
    el("p", { class: "muted small", style: "margin:6px 0" }, "Gesamtzeit = abgehakte Fahrstunden, Theorie und Prüfungen."),
    el("div", { class: "cl-totals", style: "margin-top:8px" },
      el("div", {}, el("b", {}, String(d.vacMonth)), el("span", {}, "Urlaubstage im Monat")),
      el("div", {}, el("b", {}, String(d.vacYear)), el("span", {}, `Urlaubstage ${d.year}`)),
      +pay.vacation_days > 0 ? el("div", { class: +pay.vacation_days - d.vacYear < 0 ? "warn" : "" }, el("b", {}, String(+pay.vacation_days - d.vacYear)), el("span", {}, `noch übrig von ${+pay.vacation_days}`)) : null),
    +pay.vacation_days > 0 ? null : el("p", { class: "muted small", style: "margin:6px 0" }, "Trag unten deine Urlaubstage pro Jahr ein, dann siehst du, wie viele noch übrig sind."),
    el("div", { class: "actions", style: "margin:0" }, addTheory),
    theoryList,
    el("hr"),
    el("h3", { class: "sec-title", style: "margin-top:0" }, "💶 Einnahmen brutto (unverbindlich)"),
    est.parts.length ? [
      est.parts.map(([label, value]) => el("div", { class: "cl-row", style: "cursor:default" }, el("span", { class: "cl-name" }, label), el("b", { class: "cl-min" }, euro(value)))),
      el("div", { class: "cl-sum" }, el("span", {}, "Ungefähr brutto"), el("b", {}, euro(est.total))),
      el("p", { class: "muted small", style: "margin:6px 0 0" }, "Nur eine Schätzung, keine Lohnabrechnung. Fehlstunden sind nicht eingerechnet."),
    ] : el("p", { class: "muted small" }, "Trag unten deinen Lohn ein, dann rechnet die App die Einnahmen aus."),
    el("details", { class: "fold", open: !est.parts.length },
      el("summary", {}, "Lohn und Zuschläge eintragen"),
      el("p", { class: "muted small" }, "Nur du siehst diese Angaben. Schüler und andere Fahrlehrer sehen sie nicht."),
      fields.map((f) => f.node),
      el("div", { class: "actions" }, save)));
}
function openTheoryForm() {
  const now = new Date();
  const date = el("input", { type: "date", value: dateInput(now) });
  const time = el("input", { type: "time", value: "18:00", step: 300 });
  const dur = durationControl(90);
  const note = el("input", { maxlength: 200, placeholder: "z. B. Thema 5 (optional)" });
  const btn = el("button", { class: "btn ok" }, "✓ Theorie speichern");
  btn.onclick = () => busy(btn, async () => {
    const start = fromInputs(date.value, time.value);
    if (isNaN(start)) throw new Error("Bitte Datum und Uhrzeit angeben");
    const { error } = await sb.from("theory_lessons").insert({ teacher_id: state.profile.id, held_at: start.toISOString(), duration_min: dur.value, note: note.value.trim() || null });
    if (error) throw error;
    closeModal(); toast("Theoriestunde eingetragen."); render();
  });
  openModal("📚 Theorie eintragen",
    el("div", { class: "row" }, el("div", {}, el("label", {}, "Datum"), date), el("div", {}, el("label", {}, "Beginn"), time)),
    el("label", {}, "Dauer"), dur.node,
    el("label", {}, "Notiz"), note,
    el("div", { class: "actions" }, btn, el("button", { class: "btn ghost", onclick: closeModal }, "Abbrechen")));
}

const controlTable = (rows) => rows.map((b) => [
  `KW ${isoWeek(new Date(b.slots.starts_at))}`, new Date(b.slots.starts_at).toLocaleDateString("de-DE", { weekday: "short", day: "2-digit", month: "2-digit", year: "numeric" }),
  fmtRange(b.slots.starts_at, b.slots.duration_min), fullName(b.profiles), (b.profiles && b.profiles.license_class) || "",
  b.status === "confirmed" ? b.actual_minutes : "", controlKind(b), b.transferred_at ? "ja" : ""]);
const CONTROL_HEAD = ["KW", "Datum", "Uhrzeit", "Name", "Klasse", "Minuten", "Art", "Übertragen"];
function exportControlCsv(m, rows) {
  const esc = (v) => `"${String(v).replace(/"/g, '""')}"`;
  const lines = [CONTROL_HEAD.map(esc).join(";")].concat(controlTable(rows).map((r) => r.map(esc).join(";")));
  downloadFile(csvBlob(lines), `Kontrolle_${m.getFullYear()}-${pad(m.getMonth() + 1)}.csv`);
}
function exportControlPrint(m, rows) {
  const w = window.open("", "_blank");
  if (!w) { toast("Bitte Pop-ups für diese Seite erlauben.", true); return; }
  const d = w.document;
  d.title = "Kontrolle " + monthName(m);
  const st = d.createElement("style");
  st.textContent = "body{font:13px system-ui,sans-serif;margin:24px;color:#111}h1{font-size:20px;margin:0 0 4px}table{border-collapse:collapse;width:100%;margin-top:12px}th,td{border:1px solid #bbb;padding:5px 7px;text-align:left}th{background:#eee}tr.kw td{background:#e6f2f8;font-weight:600}";
  d.head.append(st);
  const tag = (t, txt, cls) => { const e = d.createElement(t); if (txt !== undefined) e.textContent = txt; if (cls) e.className = cls; return e; };
  const table = tag("table");
  const hr = tag("tr"); CONTROL_HEAD.slice(1, 7).concat("✓").forEach((h) => hr.append(tag("th", h))); table.append(hr);
  let lastKw = null;
  controlTable(rows).forEach((r) => {
    if (r[0] !== lastKw) { lastKw = r[0]; const tr = tag("tr", undefined, "kw"); const td = tag("td", r[0]); td.colSpan = 7; tr.append(td); table.append(tr); }
    const tr = tag("tr"); r.slice(1).concat(r[7] ? "☑" : "☐").forEach((v, i) => { if (i !== 6) tr.append(tag("td", v)); }); table.append(tr);
  });
  d.body.append(tag("h1", `Kontrolle – ${monthName(m)}`), tag("div", `${state.settings.display_name || ""} · Stand: ${new Date().toLocaleDateString("de-DE")}`), tag("p", sumLine(rows)), table);
  setTimeout(() => w.print(), 300);
}

/* ---------------- Prüfungen (Theorie/Praxis): Termin, bestanden ja/nein, ggf. neuer Termin ---------------- */

// Geplant werden die praktische Prüfung und (B197) der Schaltkompetenz-Test; „theorie“ nur für ältere Einträge
const EXAM_KIND = { praxis: "Praktische Prüfung", schalt: "Schaltkompetenz-Test", theorie: "Theorieprüfung" };
const EXAM_ICON = { praxis: "🎓", schalt: "🏁", theorie: "📘" };
const EXAM_DUR = { praxis: 55, schalt: 15 };
const examIn = (k) => (k === "praxis" ? "praktische Prüfung" : EXAM_KIND[k] || "Prüfung"); // mitten im Satz
// Standard-Treffpunkt für Prüfungen (wird im Feld „Treffpunkt“ der Prüfung gespeichert, änderbar)
const EXAM_MEETING = "TÜV-Station Siegen, Leimbachstraße 227, 57074 Siegen";
function examMeetingField(value) {
  const input = el("input", { maxlength: 300, value: value || "", placeholder: EXAM_MEETING });
  return {
    node: el("div", {}, el("label", {}, "📍 Treffpunkt (sieht auch der Schüler)"), input,
      el("div", { class: "chips" }, el("button", { type: "button", class: "btn small ghost", onclick: () => (input.value = EXAM_MEETING) }, "TÜV-Station Siegen"))),
    value: () => input.value.trim(),
    set: (v) => (input.value = v || ""),
  };
}
async function examCard(student, editable) {
  const box = el("div", { class: "card exam-card" });
  async function draw() {
    const { data, error } = await sb.from("exams").select("id,kind,exam_at,duration_min,result,note,meeting_point").eq("student_id", student.id).order("exam_at");
    if (error) return box.replaceChildren(el("p", { class: "muted small" }, "Prüfungen konnten nicht geladen werden."));
    const exams = data || [];
    if (!editable && !exams.length) { box.hidden = true; return; }
    const passed = (k) => exams.some((e) => e.kind === k && e.result === "passed");
    // Nach „nicht bestanden“ (und noch kein offener neuer Termin) gleich das Formular für den nächsten Termin zeigen
    const needsNext = ["praxis", "schalt"].find((k) => {
      const ofKind = exams.filter((e) => e.kind === k);
      return ofKind.length && ofKind[ofKind.length - 1].result === "failed" && !passed(k);
    });
    const setResult = (e, result) => async () => {
      const { error } = await sb.from("exams").update({ result }).eq("id", e.id);
      if (error) return fail(error);
      if (result === "passed" && e.kind === "praxis") state.renderOnClose = true;
      toast(result === "passed" ? (e.kind === "praxis" ? "🎉 Bestanden! Der Zugang läuft jetzt noch 6 Wochen, danach wird er gesperrt." : "🎉 Bestanden eingetragen!") : result === "failed" ? "Nicht bestanden – trag gleich den nächsten Termin ein." : "Ergebnis zurückgesetzt.");
      draw();
    };
    const row = (e, i) => {
      const nr = exams.filter((x, j) => x.kind === e.kind && j <= i).length;
      const future = new Date(e.exam_at).getTime() > Date.now();
      const del = el("button", { type: "button", class: "btn small ghost", onclick: async () => {
        if (!confirm("Diesen Prüfungstermin löschen?")) return;
        const { error } = await sb.from("exams").delete().eq("id", e.id);
        if (error) return fail(error);
        draw();
      } }, "Löschen");
      return el("div", { class: "list-item" + (e.result === "passed" ? " exam-passed" : "") },
        el("div", { class: "head" },
          el("div", {}, el("b", {}, `${EXAM_ICON[e.kind] || "🎓"} ${EXAM_KIND[e.kind]}${nr > 1 ? ` (${nr}. Versuch)` : ""}`),
            el("div", {}, `${fmtDate(e.exam_at)} · ${fmtRange(e.exam_at, e.duration_min || 55)} Uhr (${e.duration_min || 55} Min.)`)),
          e.result === "passed" ? el("span", { class: "badge confirmed" }, "🎉 Bestanden")
            : e.result === "failed" ? el("span", { class: "badge rejected" }, "Nicht bestanden")
            : el("span", { class: "badge requested" }, future ? countdownText(e.exam_at, e.duration_min || 55) || "Anstehend" : "Ergebnis offen")),
        meetingBox(e.meeting_point),
        e.note ? el("div", { class: "note" }, "📝 ", e.note) : null,
        editable && !e.result ? editExam(e) : null,
        editable ? el("div", { class: "actions" },
          e.result ? el("button", { type: "button", class: "btn small ghost", onclick: setResult(e, null) }, "Ergebnis ändern")
            : [el("button", { type: "button", class: "btn small ok", onclick: setResult(e, "passed") }, "✓ Bestanden"),
               el("button", { type: "button", class: "btn small danger", onclick: setResult(e, "failed") }, "✗ Nicht bestanden")],
          del) : null);
    };
    // Zeit/Dauer/Ort einer Prüfung ändern
    const editExam = (e) => {
      const d = el("input", { type: "date", value: dateInput(e.exam_at) });
      const t = el("input", { type: "time", value: timeInput(e.exam_at), step: 300 });
      const du = durationControl(e.duration_min || 55);
      const n = examMeetingField(e.meeting_point);
      const h = el("input", { maxlength: 300, value: e.note || "", placeholder: "Hinweis (optional)" });
      const save = el("button", { class: "btn small" }, "Speichern");
      save.onclick = () => busy(save, async () => {
        const at = fromInputs(d.value, t.value);
        if (isNaN(at)) throw new Error("Bitte Datum und Beginn angeben");
        const { error } = await sb.from("exams").update({ exam_at: at.toISOString(), duration_min: du.value, meeting_point: n.value() || null, note: h.value.trim() || null }).eq("id", e.id);
        if (error) throw error;
        toast("Prüfung geändert.");
        state.renderOnClose = true;
        draw();
      });
      return el("details", { class: "fold" }, el("summary", {}, "✏️ Zeit, Dauer oder Treffpunkt ändern"),
        el("div", { class: "row" }, el("div", {}, el("label", {}, "Datum"), d), el("div", {}, el("label", {}, "Beginn"), t)),
        el("label", {}, "Dauer"), du.node, n.node, el("label", {}, "Hinweis"), h, el("div", { class: "actions" }, save));
    };
    // Neuer Prüfungstermin: im selben Fenster wie Fahrstunden („🎓 Prüfung“) – hier nur der Knopf dorthin
    let form = null;
    if (editable) {
      const add = (kind) => el("button", { type: "button", class: "btn " + (kind === "schalt" ? "ghost" : "exam-btn"), onclick: () => openSlotForm(null, { student, kind }) },
        `${EXAM_ICON[kind]} ${needsNext === kind ? "Wiederholung: " : ""}${EXAM_KIND[kind]} eintragen`);
      // Schaltkompetenz-Test nur bei B197 (oder wenn schon einer eingetragen ist) und solange nicht bestanden
      const withSchalt = (isB197(student) || exams.some((e) => e.kind === "schalt")) && !passed("schalt");
      const btns = el("div", { class: "actions" }, passed("praxis") ? null : add("praxis"), withSchalt ? add("schalt") : null);
      form = needsNext
        ? el("div", { class: "notice", style: "margin-top:12px" }, el("b", {}, `Nicht bestanden – nächster Termin für den ${EXAM_KIND[needsNext]}:`), btns)
        : btns;
    }
    box.hidden = false;
    box.replaceChildren(el("div", {},
      el("h3", {}, editable ? "🎓 Prüfungen" : "🎓 Meine Prüfungen"),
      exams.length ? exams.map(row) : el("p", { class: "muted small" }, "Noch kein Prüfungstermin eingetragen."),
      passed("schalt") ? el("p", { class: "small" }, "🏁 Schaltkompetenz-Test bestanden.") : null,
      passed("praxis") ? el("p", { class: "small" }, "🎉 Führerscheinprüfung bestanden – herzlichen Glückwunsch!") : null,
      form));
  }
  await draw();
  return box;
}

// Prüfungen eines Schülers als Fenster (aus dem Kalender)
async function openExamModal(student) {
  state.renderOnClose = true;
  openModal("🎓 Prüfungen – " + fullName(student), await examCard(student, true));
}

/* ---------------- Fahrlehrer: Ausbildungsstand (Schüler wählen → abhaken) ---------------- */

async function adminTraining() {
  const { data: all, error } = await sb.from("profiles")
    .select("id,first_name,last_name,license_class,needs_glasses,is_conversion,status,valid_until")
    .eq("role", "student").eq("status", "active").order("last_name");
  if (error) throw error;
  const students = await onlyActive(all);
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
    await examCard(chosen, true),
    await trainingView(chosen, true, lessons || []));
}

/* ---------------- Schüler: Ausbildungsstand (nur ansehen) ---------------- */

async function studentTraining() {
  const [{ data, error }, { data: myExams }] = await Promise.all([
    sb.from("bookings").select("status,actual_minutes,lesson_type,late_cancel,slots(starts_at)").eq("student_id", state.profile.id),
    sb.from("exams").select("id,kind,exam_at,result").eq("student_id", state.profile.id).order("exam_at"),
  ]);
  if (error) throw error;
  return el("div", { class: "card" },
    el("h2", {}, "📈 Mein Ausbildungsstand"),
    el("h3", { class: "sec-title" }, "🚗 Mein Stand"),
    lessonOverview(state.profile, data, myExams || []),
    el("p", { class: "muted small" }, "1 FS = 1 Fahrstunde à 45 Minuten. Dein Fahrlehrer trägt nach jeder Fahrt ein, was du schon kannst."),
    await examCard(state.profile, false),
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
    el("hr"), genderCard(), passwordCard(), pushCard(), backgroundCard(), installHint());
}

/* ---------------- Schüler: Meine Fahrstunden ---------------- */

// Übersicht aller abgehakten Fahrstunden – nummeriert, mit Datum, Uhrzeit und Minuten
function doneList(rows, total) {
  const late = rows.filter((b) => b.late_cancel).length;
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
        el("th", { colspan: 4 }, `Gesamt: ${fmtLessons(total)} (à 45 Min.) · ${done.length} Termin${done.length === 1 ? "" : "e"} · ${late} Fehlstunde${late === 1 ? "" : "n"}`),
        el("th", { class: "num" }, `${total} Min.`))))));
}

// Angebot zusagen oder absagen – danach Fahrlehrer per WhatsApp informieren
function answerOffer(b, accept) {
  const note = el("input", { maxlength: 300, placeholder: accept ? "Nachricht (optional)" : "Kurzer Grund (optional), z. B. „Da habe ich Schule.“" });
  const btn = el("button", { class: "btn " + (accept ? "ok" : "danger") }, accept ? "✓ Verbindlich zusagen" : "✗ Absagen");
  btn.onclick = () => busy(btn, async () => {
    const { error } = await sb.rpc("respond_offer", { p_booking: b.id, p_accept: accept, p_note: note.value.trim() });
    if (error) throw error;
    pushNotify("booking", b.id, accept ? "accept" : "decline");
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

function answerChange(b, accept) {
  const note = el("input", { maxlength: 300, placeholder: accept ? "Nachricht (optional)" : "Kurzer Grund (optional), z. B. „Da habe ich Schule.“" });
  const btn = el("button", { class: "btn " + (accept ? "ok" : "danger") }, accept ? "✓ Neue Zeit bestätigen" : "✗ Bisherige Zeit behalten");
  btn.onclick = () => busy(btn, async () => {
    const { error } = await sb.rpc("respond_change", { p_booking: b.id, p_accept: accept, p_note: note.value.trim() });
    if (error) throw error;
    pushNotify("booking", b.id, accept ? "change_ok" : "change_no");
    const f = (iso) => `${fmtDate(iso)} um ${fmtTime(iso)} Uhr`;
    const text = `Hallo, hier ist ${fullName(state.profile)}. ` + (accept ? `Die neue Zeit für die Fahrstunde passt mir: ${f(b.change_start)}. 👍` : `Die neue Zeit passt mir leider nicht. Ich bleibe bei ${f(b.slots.starts_at)}.`) +
      (note.value.trim() ? `\n${note.value.trim()}` : "");
    notifyStep(accept ? "Zugesagt – die Fahrstunde ist verschoben" : "Abgesagt – die Fahrstunde bleibt zur bisherigen Zeit", state.settings.admin_phone, text, "deinen Fahrlehrer");
  });
  openModal(accept ? "Neue Zeit bestätigen" : "Änderung ablehnen",
    el("p", {}, "Bisher: ", el("b", {}, `${fmtDate(b.slots.starts_at)}, ${fmtRange(b.slots.starts_at, b.slots.duration_min)} Uhr`), el("br"),
      "Neu: ", el("b", {}, `${fmtDate(b.change_start)}, ${fmtRange(b.change_start, b.change_dur || b.slots.duration_min)} Uhr`)),
    accept ? null : el("div", { class: "notice" }, "Wenn du ablehnst, bleibt deine Fahrstunde zur bisherigen Zeit bestehen. Bitte sprich ggf. kurz mit deinem Fahrlehrer."),
    note, el("div", { class: "actions" }, btn, el("button", { class: "btn ghost", onclick: closeModal }, "Zurück")));
}

function openStudentCancel(b) {
  const late = isLate(b.slots.starts_at);
  let why = null;   // "sick" oder "other"
  const reason = el("textarea", { maxlength: 150, placeholder: "z. B. „Ich habe eine Klausur. Kann ich die Fahrstunde absagen?“", style: "min-height:56px" });
  // Anderer Grund: freier Text – der Schüler kann auch erst fragen, ob er absagen darf
  const teacherWa = waNumber(state.settings.admin_phone);
  const askBtn = teacherWa ? el("button", { type: "button", class: "btn", disabled: true, onclick: () => window.open(
    `https://wa.me/${teacherWa}?text=${encodeURIComponent(`Hallo, hier ist ${fullName(state.profile)}. Es geht um meine Fahrstunde am ${fmtDate(b.slots.starts_at)} um ${fmtTime(b.slots.starts_at)} Uhr:\n${reason.value.trim()}`)}`, "_blank", "noopener") }, "💬 Erst den Fahrlehrer fragen") : null;
  const reasonWrap = el("div", { hidden: true }, el("label", {}, "Dein Grund oder deine Frage"), reason,
    askBtn ? el("p", { class: "muted small", style: "margin:4px 0 0" }, "Du möchtest erst fragen, ob du absagen darfst? Die Fahrstunde bleibt dann bestehen, bis du sie absagst.") : null,
    askBtn ? el("div", { class: "actions", style: "margin:6px 0 0" }, askBtn) : null);
  const agree = el("input", { type: "checkbox" });
  const agreeText = el("span", {});
  const agreeWrap = el("label", { class: "check", hidden: true }, agree, agreeText);
  const btn = el("button", { class: "btn danger", disabled: true }, "Fahrstunde verbindlich absagen");
  const update = () => {
    btn.disabled = !(why && agree.checked && (why === "sick" || reason.value.trim()));
    if (askBtn) askBtn.disabled = !reason.value.trim();
  };
  reason.addEventListener("input", update);
  agree.addEventListener("change", update);
  // Kurzfristig krank: Ohne ärztliches Attest bleibt es eine Fehlstunde
  const lateNotice = el("div", { class: "notice danger" }, `Die Absagefrist (${fmtDeadline(b.slots.starts_at)}) ist abgelaufen. Diese Fahrstunde wird als Fehlstunde berechnet und ist kostenpflichtig.`);
  const attestNotice = el("div", { class: "notice danger", hidden: true },
    el("b", {}, "📄 Ärztliches Attest erforderlich"), el("br"),
    `Die Absagefrist (${fmtDeadline(b.slots.starts_at)}) ist abgelaufen. Du musst deinem Fahrlehrer ein ärztliches Attest vorlegen. Eine AU (Krankschreibung) reicht nicht. Ohne ärztliches Attest gilt die Absage als Fehlstunde und ist kostenpflichtig.`);
  const choose = (v, e) => {
    why = v;
    whyBtns.forEach((x) => x.classList.toggle("active", x === e.currentTarget));
    reasonWrap.hidden = v === "sick";
    attestNotice.hidden = !(late && v === "sick");
    lateNotice.hidden = !late || v === "sick";
    agreeWrap.hidden = false;
    agree.checked = false;
    agreeText.textContent = late && v === "sick"
      ? "Ich sage wegen Krankheit ab und lege ein ärztliches Attest vor. Ohne Attest ist es eine kostenpflichtige Fehlstunde."
      : late ? "Ich sage diese Fahrstunde ab und weiß, dass sie als Fehlstunde kostenpflichtig ist."
      : "Ich möchte diese Fahrstunde absagen.";
    update();
  };
  const whyBtns = [["sick", "🤒 Ich bin krank"], ["other", "📝 Anderer Grund"]].map(([v, t]) =>
    el("button", { type: "button", class: "tab", onclick: (e) => choose(v, e) }, t));
  btn.onclick = () => busy(btn, async () => {
    const text0 = why === "sick" ? "Krank" : reason.value.trim();
    const { data: wasLate, error } = await sb.rpc("cancel_booking", { p_booking: b.id, p_reason: text0 });
    if (error) throw error;
    pushNotify("booking", b.id, "cancel");
    const needAttest = wasLate && why === "sick";
    const text = `Hallo, hier ist ${fullName(state.profile)}. Ich habe meine Fahrstunde am ${fmtDate(b.slots.starts_at)} um ${fmtTime(b.slots.starts_at)} Uhr abgesagt.\nGrund: ${text0}` + (needAttest ? "\nIch reiche ein ärztliches Attest nach." : "");
    notifyStep(needAttest ? "Abgesagt – bitte ärztliches Attest vorlegen, sonst Fehlstunde" : wasLate ? "Abgesagt – als Fehlstunde vermerkt (kostenpflichtig)" : "Fahrstunde abgesagt",
      state.settings.admin_phone, text, "deinen Fahrlehrer");
  });
  openModal("Fahrstunde absagen",
    el("p", {}, el("b", {}, fmtDate(b.slots.starts_at)), el("br"), fmtRange(b.slots.starts_at, b.slots.duration_min)),
    late ? lateNotice : el("div", { class: "notice" }, `Du sagst rechtzeitig ab (Frist: ${fmtDeadline(b.slots.starts_at)}) – die Absage ist kostenlos.`),
    el("label", {}, "Warum sagst du ab?"), el("div", { class: "tabs type-tabs" }, whyBtns),
    attestNotice, reasonWrap, agreeWrap,
    el("div", { class: "actions" }, btn, el("button", { class: "btn ghost", onclick: closeModal }, "Doch nicht")));
}

// Kurzfristig krank abgesagt, Attest noch nicht bestätigt → deutlicher Vermerk (verschwindet, sobald der Fahrlehrer bestätigt)
const sickPending = (b) => b.late_cancel && /^krank/i.test(b.cancel_reason || "")
  ? el("div", { class: "notice danger", style: "margin:6px 0 0;padding:8px 10px" }, el("b", {}, "⚠️ Attest noch nicht bestätigt: "), "Zählt als Fehlstunde und ist kostenpflichtig.") : null;

async function studentMine() {
  const { data, error } = await sb.from("bookings")
    .select("id,status,student_note,admin_reply,meeting_point,actual_minutes,cancel_reason,late_cancel,lesson_type,wish_start,change_start,change_dur,change_note,created_at,decided_at,slots(starts_at,duration_min,meeting_point)")
    .eq("student_id", state.profile.id);
  if (error) throw error;
  const rows = data.filter((b) => b.slots).sort((a, b) => b.slots.starts_at.localeCompare(a.slots.starts_at));
  const now = Date.now();
  const upcoming = rows.filter((b) => (b.status === "requested" || b.status === "offered" || (b.status === "confirmed" && b.actual_minutes === null)) && new Date(b.slots.starts_at).getTime() >= now - 3600000).reverse();
  const offers = upcoming.filter((b) => b.status === "offered" && new Date(b.slots.starts_at).getTime() > now);
  const planned = upcoming.filter((b) => !offers.includes(b));
  const total = rows.reduce((sum, b) => sum + (b.status === "confirmed" && b.actual_minutes ? b.actual_minutes : 0), 0);
  const doneCount = rows.filter((b) => b.status === "confirmed" && b.actual_minutes !== null).length;
  const lateRows = rows.filter((b) => b.late_cancel);
  // Abgesagt: kommende und die der letzten 14 Tage, mit Begründung
  const cancelledRows = rows.filter((b) => NOT_HELD_ICON[b.status] && new Date(b.slots.starts_at).getTime() >= now - 14 * 86400000);
  const seen = getSeen("mine");
  markSeen("mine");

  // Eine Fahrstunde als kompakte Karte: Datum-Block links, rechts Uhrzeit, Status, Treffpunkt, Knöpfe
  const card = (b) => {
    const start = new Date(b.slots.starts_at);
    const future = start.getTime() > now;
    const isOffer = b.status === "offered" && future;
    const hasChange = b.status === "confirmed" && !!b.change_start && future && b.actual_minutes === null;
    const canCancel = b.status === "confirmed" && b.actual_minutes === null && future;
    const withdraw = b.status === "requested" ? el("button", { class: "btn small ghost" }, "Anfrage zurückziehen") : null;
    if (withdraw) withdraw.onclick = () => busy(withdraw, async () => {
      if (!confirm("Anfrage wirklich zurückziehen?")) return;
      const { error } = await sb.rpc("cancel_request", { p_booking: b.id });
      if (error) throw error;
      pushNotify("booking", b.id, "withdraw");
      toast("Anfrage zurückgezogen.");
      render();
    });
    const badge = hasChange ? ["offered", "Änderung – bitte antworten"]
      : isOffer ? ["offered", "Angebot – bitte antworten"]
      : b.status === "requested" ? ["requested", "Angefragt – wartet"]
      : ["confirmed", "✓ Bestätigt"];
    const meet = b.status === "confirmed" || isOffer ? meetingOf(b) : "";
    return el("div", { class: "lesson-card" + (isOffer || hasChange ? " offer" : "") },
      el("div", { class: "date-chip" },
        el("span", { class: "w" }, start.toLocaleDateString("de-DE", { weekday: "short" })),
        el("span", { class: "d" }, start.getDate()),
        el("span", { class: "m" }, start.toLocaleDateString("de-DE", { month: "short" }))),
      el("div", { class: "lesson-body" },
        el("div", { class: "lesson-top" },
          el("b", {}, fmtRange(b.slots.starts_at, b.slots.duration_min) + " Uhr"),
          b.decided_at && b.decided_at > seen ? el("span", { class: "badge late" }, "Neu") : null),
        el("span", { class: "badge " + badge[0] }, badge[1]),
        b.status === "requested" && b.wish_start ? el("div", { class: "lesson-hint" }, `⏰ Deine Wunschzeit: ${fmtTime(b.wish_start)} Uhr (ohne Garantie)`) : null,
        isOffer && b.wish_start ? el("div", { class: "lesson-hint" }, `⏱ Gegenangebot deines Fahrlehrers. Dein Wunsch war ${fmtTime(b.wish_start)} Uhr.`) : null,
        meet ? el("a", { class: "lesson-meet", href: "https://www.google.com/maps/search/?api=1&query=" + encodeURIComponent(meet), target: "_blank", rel: "noopener" }, "📍 " + meet) : null,
        b.admin_reply ? el("div", { class: "lesson-hint" }, "💬 " + b.admin_reply) : null,
        canCancel ? el("div", { class: "lesson-hint muted" }, isLate(b.slots.starts_at)
          ? "Absagefrist abgelaufen – Absage kostenpflichtig"
          : `Kostenlos absagen bis ${fmtDeadline(b.slots.starts_at)}`) : null,
        isOffer ? el("div", { class: "actions" },
          el("button", { class: "btn small ok", onclick: () => answerOffer(b, true) }, "✓ Zusagen"),
          el("button", { class: "btn small danger", onclick: () => answerOffer(b, false) }, "✗ Absagen")) : null,
        hasChange ? el("div", { class: "lesson-hint" }, `🔄 Dein Fahrlehrer möchte die Fahrstunde verschieben auf ${fmtDate(b.change_start)}, ${fmtRange(b.change_start, b.change_dur || b.slots.duration_min)} Uhr.` + (b.change_note ? `  💬 ${b.change_note}` : "")) : null,
        hasChange ? el("div", { class: "actions" },
          el("button", { class: "btn small ok", onclick: () => answerChange(b, true) }, "✓ Neue Zeit passt"),
          el("button", { class: "btn small danger", onclick: () => answerChange(b, false) }, "✗ Passt nicht")) : null,
        withdraw || canCancel ? el("div", { class: "actions" }, withdraw,
          canCancel ? el("button", { class: "btn small cancel-strong", onclick: () => openStudentCancel(b) }, "✗ Fahrstunde absagen") : null) : null));
  };

  const wa = waButton(state.settings.admin_phone, `Hallo, hier ist ${fullName(state.profile)}.\n`, "💬 Fahrlehrer schreiben");
  if (wa) wa.className = "btn small ghost";
  const stat = (num, label, cls = "") => el("div", { class: "stat " + cls }, el("b", {}, num), el("span", {}, label));
  // Nächste bestätigte Fahrstunde – klein und schlicht: Termin, Dauer, Treffpunkt
  const nextTile = () => {
    const n = planned.find((b) => b.status === "confirmed");
    if (!n) return el("div", { class: "stat next" }, el("span", {}, "Nächste Fahrstunde"), el("div", { class: "next-line" }, "noch keine"));
    const meet = meetingOf(n);
    return el("div", { class: "stat next" },
      el("span", {}, "Nächste Fahrstunde"),
      el("div", { class: "next-line" }, el("b", {}, `${fmtDay(n.slots.starts_at)}, ${fmtTime(n.slots.starts_at)} Uhr`)),
      el("div", { class: "next-line muted" }, `${n.slots.duration_min} Min.` + (meet ? ` · 📍 ${meet}` : "")));
  };
  return el("div", {},
    // Auf einen Blick: wie viel gefahren, was steht an, ggf. Fehlstunden
    el("div", { class: "stat-row" },
      nextTile(),
      stat(fmtLessons(total).replace(/ Fahrstunden?$/, ""), "Fahrstunden gefahren"),
      stat(String(lateRows.length), lateRows.length === 1 ? "Fehlstunde" : "Fehlstunden", "warn")),
    !waNumber(state.profile.phone) ? el("div", { class: "notice danger", style: "margin:12px 0 0" },
      "Bitte trage unter „Profil“ deine WhatsApp-Nummer ein, damit dein Fahrlehrer dich erreichen kann.") : null,
    offers.length ? el("h2", { class: "mine-h" }, `📨 Angebote für dich (${offers.length})`) : null,
    offers.map(card),
    el("h2", { class: "mine-h" }, "Anstehende Fahrstunden"),
    planned.length ? planned.map(card) : el("p", { class: "muted" }, "Keine anstehenden Fahrstunden. Im Kalender kannst du freie Termine anfragen."),
    cancelledRows.length ? el("h2", { class: "mine-h" }, `❌ Abgesagt (${cancelledRows.length})`) : null,
    cancelledRows.map((b) => el("div", { class: "list-item small" },
      el("b", {}, `${fmtDay(b.slots.starts_at)} ${fmtRange(b.slots.starts_at, b.slots.duration_min)}`),
      el("div", {}, `${NOT_HELD_ICON[b.status]} ${STATUS_TEXT[b.status]}${b.late_cancel ? " · Fehlstunde" : ""}`),
      b.cancel_reason ? el("div", { class: "note" }, "Grund: ", b.cancel_reason) : null,
      sickPending(b))),
    doneCount ? el("details", { class: "fold" },
      el("summary", {}, `✓ Gefahrene Fahrstunden (${doneCount})`),
      doneList(rows, total),
      el("p", { class: "small" }, specialSummary(rows, state.profile)),
      exportButtons(state.profile, rows)) : null,
    lateRows.length ? el("details", { class: "fold" },
      el("summary", {}, `⚠️ Fehlstunden (${lateRows.length})`),
      lateRows.map((b) => el("div", { class: "small", style: "padding:6px 0;border-bottom:1px solid var(--border)" },
        el("b", {}, `${fmtDay(b.slots.starts_at)} ${fmtRange(b.slots.starts_at, b.slots.duration_min)}`),
        b.status === "no_show" ? " – nicht erschienen, kostenpflichtig" : " – kurzfristig abgesagt, kostenpflichtig", b.cancel_reason ? ` (${b.cancel_reason})` : "", sickPending(b)))) : null,
    wa ? el("div", { class: "actions", style: "margin-top:16px" }, wa) : null,
  );
}

init();
