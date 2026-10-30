/* Fahrstundenplaner – Web-App für Fahrlehrer (Admin) und Fahrschüler */
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
const fullName = (p) => (p ? `${p.first_name || ""} ${p.last_name || ""}`.trim() || "Unbekannt" : "Unbekannt");
const STATUS_TEXT = {
  requested: "Angefragt", confirmed: "Bestätigt", rejected: "Abgelehnt", cancelled: "Anfrage zurückgezogen",
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
const isAdmin = () => state.profile && state.profile.role === "admin";

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
    rejected: `${hi} deine Anfrage für ${when} kann ich leider nicht bestätigen. Schau gern nach einem anderen freien Termin.`,
    cancelled_teacher: `${hi} ich muss die Fahrstunde am ${when} leider absagen.`,
  }[kind];
  return body + (reply ? `\n${reply}` : "") + "\n\nDein Fahrlehrer";
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
      el("label", {}, "Handynummer (für WhatsApp-Nachrichten, freiwillig)"), phone),
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
  const blob = new Blob(["\ufeff" + lines.join("\r\n")], { type: "text/csv;charset=utf-8" });
  const a = el("a", { href: URL.createObjectURL(blob), download: `Fahrstunden_${fullName(p).replace(/\s+/g, "_")}.csv` });
  document.body.append(a); a.click(); a.remove();
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
    tag("p", `Gefahren: ${done.length} Fahrstunden, ${total} Min. (${fmtMinutes(total)}) · ${counts}`),
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

// Minuten-Auswahl: Wert vorbelegt, mit −/+ im 15-Minuten-Takt änderbar.
// opts.fine = true erlaubt zusätzlich 5er-Schritte (für tatsächlich gefahrene Minuten).
function durationControl(initial, opts = {}) {
  const unit = opts.fine ? 5 : 15;
  const clamp = (v) => Math.min(600, Math.max(unit, Math.round((Number(v) || 0) / unit) * unit));
  const input = el("input", { type: "number", min: unit, max: 600, step: unit, value: clamp(initial), "aria-label": "Minuten" });
  const set = (v) => { input.value = clamp(v); input.dispatchEvent(new Event("input")); };
  const b = (label, fn) => el("button", { type: "button", class: "btn small ghost", onclick: fn }, label);
  const node = el("div", { class: "dur" },
    el("div", { class: "dur-row" },
      b("−15", () => set(+input.value - 15)),
      opts.fine ? b("−5", () => set(+input.value - 5)) : null,
      el("label", { class: "dur-field" }, input, el("span", {}, "Min.")),
      opts.fine ? b("+5", () => set(+input.value + 5)) : null,
      b("+15", () => set(+input.value + 15)),
    ),
    opts.fine ? null : el("div", { class: "chips" }, [45, 60, 90, 135].map((m) => b(`${m} Min.`, () => set(m)))),
  );
  input.addEventListener("change", () => (input.value = clamp(input.value)));
  return { node, input, get value() { return clamp(input.value); } };
}

function openModal(title, ...content) {
  modalBody.replaceChildren(
    el("div", { class: "modal-head" },
      el("h3", {}, title),
      el("button", { class: "close", "aria-label": "Schließen", onclick: closeModal }, "×")),
    el("div", {}, ...content),
  );
  if (!modal.open) modal.showModal();
}
function closeModal() { if (modal.open) modal.close(); }
modal.addEventListener("click", (e) => { if (e.target === modal) closeModal(); });

async function busy(button, fn) {
  if (button) button.disabled = true;
  try { await fn(); } catch (e) { fail(e); } finally { if (button) button.disabled = false; }
}

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
    const { data: settings } = await sb.from("settings").select("*").eq("id", 1).maybeSingle();
    if (settings) state.settings = settings;
  } catch (e) { fail(e); }
  state.tab = "calendar";
  renderUserbox();
  if (state.profile && !isAdmin() && state.profile.status !== "active") renderWaiting();
  else render();
}

// Schüler ist (noch) nicht freigeschaltet oder wurde gesperrt
function renderWaiting() {
  const blocked = state.profile.status === "blocked";
  app.replaceChildren(el("div", { class: "card narrow" },
    el("h2", {}, blocked ? "Zugang beendet" : "Fast geschafft – warte auf Freischaltung"),
    el("p", {}, blocked
      ? "Dein Zugang zum Fahrstundenplaner ist nicht mehr aktiv. Bei Fragen wende dich bitte direkt an deinen Fahrlehrer."
      : `Hallo ${state.profile.first_name || ""}! Deine Anmeldung ist angekommen. Dein Fahrlehrer muss dich noch freischalten – danach siehst du hier den Kalender und kannst Fahrstunden anfragen.`),
    blocked ? null : el("div", { class: "actions" },
      el("button", { class: "btn", onclick: () => loadUserAndRender() }, "↻ Erneut prüfen")),
  ));
}

function renderUserbox() {
  if (!state.profile) { userbox.replaceChildren(); return; }
  userbox.replaceChildren(...[
    el("span", {}, fullName(state.profile)),
    isAdmin() ? el("span", { class: "badge admin" }, "Fahrlehrer") : null,
    el("button", { class: "btn small ghost", onclick: async () => { await sb.auth.signOut(); } }, "Abmelden"),
  ].filter(Boolean));
}

function renderAuth(mode = "login") {
  const email = el("input", { type: "email", autocomplete: "email", required: true });
  const pw = el("input", { type: "password", autocomplete: mode === "login" ? "current-password" : "new-password", minlength: 6, required: true });
  const first = el("input", { autocomplete: "given-name", required: true });
  const last = el("input", { autocomplete: "family-name", required: true });
  const licenseClass = el("select", { required: true },
    el("option", { value: "" }, "Bitte wählen …"),
    LICENSE_CLASSES.map((c) => el("option", { value: c }, c === "B" ? "B (Schaltwagen)" : c === "B197" ? "B197 (Automatik-Prüfung + Schalt-Schulung)" : c)));
  const glasses = el("input", { type: "checkbox" });
  const conversion = el("input", { type: "checkbox" });
  const phone = el("input", { type: "tel", autocomplete: "tel", placeholder: "z. B. 0151 23456789" });
  const submit = el("button", { class: "btn", type: "submit" }, mode === "login" ? "Anmelden" : "Registrieren");

  const form = el("form", {
    onsubmit: (e) => {
      e.preventDefault();
      busy(submit, async () => {
        if (mode === "login") {
          const { error } = await sb.auth.signInWithPassword({ email: email.value.trim(), password: pw.value });
          if (error) throw new Error(error.message === "Invalid login credentials" ? "E-Mail oder Passwort falsch" : error.message);
        } else {
          const { data, error } = await sb.auth.signUp({
            email: email.value.trim(), password: pw.value,
            options: {
              data: {
                first_name: first.value.trim(), last_name: last.value.trim(),
                license_class: licenseClass.value, needs_glasses: glasses.checked, is_conversion: conversion.checked,
                phone: phone.value.trim(),
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
      el("label", {}, "Führerscheinklasse"), licenseClass,
      el("label", { class: "check" }, glasses, "Ich brauche eine Sehhilfe (Brille / Kontaktlinsen)"),
      el("label", { class: "check" }, conversion, "Ich bin Umschreiber (habe schon einen ausländischen Führerschein)"),
      el("label", {}, "Handynummer (freiwillig – für WhatsApp-Nachrichten deines Fahrlehrers)"), phone,
    ] : null,
    el("label", {}, "E-Mail"), email,
    el("label", {}, "Passwort" + (mode === "register" ? " (mind. 6 Zeichen)" : "")), pw,
    el("div", { class: "actions" }, submit),
  );

  app.replaceChildren(el("div", { class: "card narrow" },
    el("div", { class: "tabs" },
      el("button", { class: "tab" + (mode === "login" ? " active" : ""), onclick: () => renderAuth("login") }, "Anmelden"),
      el("button", { class: "tab" + (mode === "register" ? " active" : ""), onclick: () => renderAuth("register") }, "Neu registrieren")),
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
  const tabs = isAdmin()
    ? [["calendar", "Kalender"], ["requests", "Anfragen"], ["students", "Schüler"], ["settings", "Einstellungen"]]
    : [["calendar", "Kalender"], ["mine", "Meine Fahrstunden"], ["profile", "Mein Profil"]];

  const tabbar = el("div", { class: "tabs" }, tabs.map(([id, label]) =>
    el("button", { class: "tab" + (state.tab === id ? " active" : ""), "data-tab": id, onclick: () => { state.tab = id; render(); } }, label)));
  const content = el("div", {}, el("p", { class: "muted" }, "Lädt …"));
  app.replaceChildren(tabbar, content);

  if (isAdmin()) updateRequestCount(tabbar);
  else updateStudentNews(tabbar);

  try {
    let view;
    if (state.tab === "calendar") view = isAdmin() ? await adminCalendar() : await studentCalendar();
    else if (state.tab === "requests") view = await adminRequests();
    else if (state.tab === "students") view = await adminStudents();
    else if (state.tab === "settings") view = adminSettings();
    else if (state.tab === "mine") view = await studentMine();
    else if (state.tab === "profile") view = studentProfile();
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
    sb.from("bookings").select("id", { count: "exact", head: true }).eq("status", "cancelled_student").gt("decided_at", getSeen("requests")),
  ]);
  const badge = (tab, count) => {
    const btn = tabbar.querySelector(`[data-tab="${tab}"]`);
    if (btn && count) btn.append(el("span", { class: "count" }, count));
  };
  badge("requests", (req.count || 0) + (state.tab === "requests" ? 0 : canc.count || 0));
  if (state.tab === "requests") markSeen("requests");
  badge("students", pend.count);
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
    days.push(el("div", { class: "day" + (sameDay(day, today) ? " today" : "") },
      el("div", { class: "day-head" }, el("span", {}, fmtDay(day)),
        onAddDay ? el("button", { class: "plus", title: "Termin an diesem Tag anlegen", onclick: () => onAddDay(day) }, "+") : null),
      daySlots.length ? daySlots.map(renderSlot) : el("div", { class: "empty" }, "—"),
    ));
  }
  return el("div", { class: "week" }, days);
}

/* ---------------- Admin: Kalender ---------------- */

const activeBooking = (slot) => (slot.bookings || []).find((b) => b.status === "requested" || b.status === "confirmed");

async function adminCalendar() {
  const from = state.weekStart, to = addDays(state.weekStart, 7);
  const { data: slots, error } = await sb.from("slots")
    .select("id,starts_at,duration_min,bookings(id,status,actual_minutes,late_cancel,lesson_type,student_id,profiles(first_name,last_name,license_class,needs_glasses,is_conversion))")
    .gte("starts_at", from.toISOString()).lt("starts_at", to.toISOString()).order("starts_at");
  if (error) throw error;

  const form = newSlotForm();
  const grid = weekGrid(slots, (s) => {
    const b = activeBooking(s);
    const notHeld = (s.bookings || []).filter((x) => NOT_HELD_ICON[x.status]).pop();
    const past = new Date(s.starts_at).getTime() < Date.now();
    const glasses = (p) => (p && p.needs_glasses ? " 👓" : "");
    let cls = past ? "past" : "free", label = past ? "Nicht gebucht" : "Frei";
    if (!b && notHeld) label = `${NOT_HELD_ICON[notHeld.status]} ${fullName(notHeld.profiles)} – ${STATUS_TEXT[notHeld.status]}`
      + (notHeld.late_cancel ? " · Fehlstunde" : "") + (past ? "" : " · wieder frei");
    if (b && b.status === "requested") { cls = "requested"; label = "Anfrage: " + fullName(b.profiles) + glasses(b.profiles); }
    if (b && b.status === "confirmed") {
      cls = b.actual_minutes !== null ? "done" : "confirmed";
      label = (b.actual_minutes !== null ? `✓ ${b.actual_minutes} Min. ${LESSON_ICON[b.lesson_type] || ""} · ` : "") + fullName(b.profiles) + glasses(b.profiles);
    }
    return el("button", { class: "slot " + cls, onclick: () => openAdminSlot(s.id) },
      el("b", {}, fmtRange(s.starts_at, s.duration_min)), label);
  }, (day) => { form.setDate(day); form.node.scrollIntoView({ behavior: "smooth" }); });

  return el("div", {},
    form.node,
    weekBar(slots.length ? el("button", { class: "btn small ghost", onclick: () => openCopyWeek(slots) }, "⧉ Woche kopieren") : null),
    legend([["free", "frei"], ["requested", "angefragt – bitte bestätigen"], ["confirmed", "bestätigt"], ["done", "gefahren ✓ / vergangen"]]),
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
  if (fresh.length) {
    const { error } = await sb.from("slots").insert(fresh);
    if (error) throw error;
  }
  return { added: fresh.length, skipped: list.length - fresh.length };
}
const insertedMsg = ({ added, skipped }) =>
  `${added} Termin${added === 1 ? "" : "e"} freigegeben` + (skipped ? ` (${skipped} gab es schon)` : "") + ".";

function newSlotForm() {
  const date = el("input", { type: "date", value: dateInput(new Date()) });
  const dur = durationControl(state.settings.default_duration);
  const weeks = el("input", { type: "number", min: 1, max: 26, value: 1 });
  const preview = el("p", { class: "small", style: "margin-top:12px" });
  const btn = el("button", { class: "btn" }, "Termine freigeben");

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
    const monday = startOfWeek(start), now = Date.now(), list = [];
    const w = Math.max(1, Math.min(26, +weeks.value || 1));
    for (let wk = 0; wk < w; wk++) {
      for (const d of [...days].sort()) {
        const day = addDays(monday, wk * 7 + d);
        if (day < start) continue;
        for (const t of times) {
          const at = fromInputs(dateInput(day), t);
          if (at.getTime() > now) list.push({ starts_at: at.toISOString(), duration_min: dur.value });
        }
      }
    }
    return list;
  }
  function refresh() {
    dayBtns.forEach((b, i) => b.classList.toggle("active", days.has(i)));
    timeChips.replaceChildren(...times.map((t) => el("span", { class: "tag", style: "font-size:14px;padding:4px 8px" },
      `${t} – ${fromMin(toMin(t) + dur.value)} `,
      el("button", { type: "button", class: "close", style: "font-size:16px", "aria-label": "Uhrzeit entfernen", onclick: () => { times = times.filter((x) => x !== t); refresh(); } }, "×"))));
    const list = build();
    preview.replaceChildren(list.length
      ? el("span", {}, el("b", {}, `${list.length} Termin${list.length > 1 ? "e" : ""}`),
        ` · ${[...days].sort().map((i) => WEEKDAYS[i]).join(", ")} · ${times.length} pro Tag · ${+weeks.value > 1 ? weeks.value + " Wochen" : "1 Woche"} · ab ${fmtDay(list[0].starts_at)}`)
      : el("span", { class: "muted" }, "Noch keine Termine – Wochentage und Uhrzeiten wählen."));
  }
  [date, weeks].forEach((i) => i.addEventListener("input", refresh));
  dur.input.addEventListener("input", refresh);

  btn.onclick = () => busy(btn, async () => {
    const list = build();
    const res = await insertSlots(list);
    toast(insertedMsg(res));
    state.weekStart = startOfWeek(new Date(list[0].starts_at));
    render();
  });

  refresh();
  const node = el("div", { class: "card" },
    el("h3", {}, "Neue Fahrstunden freigeben"),
    el("div", { class: "row" },
      el("div", {}, el("label", {}, "Ab Datum"), date),
      el("div", {}, el("label", {}, "Für … Wochen wiederholen (1 = nur diese Woche)"), weeks)),
    el("label", {}, "An welchen Tagen?"),
    el("div", { class: "tabs", style: "margin-bottom:6px;flex-wrap:wrap" }, dayBtns),
    el("div", { class: "chips" },
      el("button", { type: "button", class: "btn small ghost", onclick: () => setDays([0, 1, 2, 3, 4]) }, "Mo–Fr"),
      el("button", { type: "button", class: "btn small ghost", onclick: () => setDays([0, 1, 2, 3, 4, 5]) }, "Mo–Sa"),
      el("button", { type: "button", class: "btn small ghost", onclick: () => setDays([0, 1, 2, 3, 4, 5, 6]) }, "Ganze Woche"),
      el("button", { type: "button", class: "btn small ghost", onclick: () => setDays([]) }, "Keiner")),
    el("label", {}, "Dauer pro Fahrstunde (Standard: " + state.settings.default_duration + " Min.)"), dur.node,
    el("label", {}, "Uhrzeiten pro Tag"),
    el("div", { class: "row" },
      el("div", {}, el("label", {}, "Erste Fahrstunde um"), first),
      el("div", {}, el("label", {}, "Fahrstunden hintereinander"), count),
      el("div", {}, el("label", {}, "Pause dazwischen (Min.)"), pause)),
    timeChips,
    el("div", { class: "done-row" }, el("span", { style: "width:130px" }, extra), addTime),
    preview,
    el("div", { class: "actions" }, btn),
  );
  return { node, setDate: (d) => { date.value = dateInput(d); setDays([weekdayIndex(d)]); } };
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

    if (b.status === "requested") {
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
async function bookForStudentForm(slot, saveTime) {
  const { data: students, error } = await sb.from("profiles")
    .select("id,first_name,last_name,phone,license_class,needs_glasses,is_conversion")
    .eq("role", "student").eq("status", "active").order("last_name");
  if (error) throw error;
  if (!students.length) return el("p", { class: "muted small" }, "Noch keine freigeschalteten Schüler zum Eintragen.");
  const who = el("select", {}, el("option", { value: "" }, "Schüler wählen …"),
    students.map((st) => el("option", { value: st.id }, fullName(st) + (st.license_class ? ` (${st.license_class})` : ""))));
  const reply = el("textarea", { maxlength: 1000, placeholder: "Hinweis an den Schüler (optional), z. B. Treffpunkt" });
  const btn = el("button", { class: "btn ok" }, "✓ Eintragen & bestätigen");
  btn.onclick = () => busy(btn, async () => {
    const st = students.find((x) => x.id === who.value);
    if (!st) throw new Error("Bitte einen Schüler wählen");
    await saveTime();
    const { error } = await sb.from("bookings").insert({
      slot_id: slot.id, student_id: st.id, status: "confirmed",
      admin_reply: reply.value.trim() || null, decided_at: new Date().toISOString(),
    });
    if (error) throw new Error(error.code === "23505" ? "Der Termin wurde gerade schon vergeben." : error.message);
    const { data: fresh } = await sb.from("slots").select("starts_at,duration_min").eq("id", slot.id).single();
    notifyStep(`${fullName(st)} eingetragen`, st.phone, waTextForStudent("confirmed", st, fresh || slot, reply.value.trim()));
  });
  return el("div", {},
    el("h3", {}, "Für einen Schüler eintragen"),
    el("p", { class: "muted small" }, "Z. B. nach telefonischer Absprache. Die Fahrstunde ist dann sofort bestätigt."),
    who, el("label", {}, "Hinweis"), reply, el("div", { class: "actions" }, btn));
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

/* ---------------- Admin: Anfragen ---------------- */

async function adminRequests() {
  const weekAgo = addDays(new Date(), -7).toISOString();
  const [req, open, cancels] = await Promise.all([
    sb.from("bookings").select("id,student_note,created_at,profiles(first_name,last_name,license_class,needs_glasses,is_conversion),slots(id,starts_at,duration_min)").eq("status", "requested").order("created_at"),
    sb.from("bookings").select("id,lesson_type,profiles(first_name,last_name,license_class,needs_glasses,is_conversion,phone),slots(id,starts_at,duration_min)").eq("status", "confirmed").is("actual_minutes", null),
    sb.from("bookings").select("id,cancel_reason,late_cancel,decided_at,profiles(first_name,last_name,license_class,needs_glasses,is_conversion),slots(id,starts_at,duration_min)")
      .eq("status", "cancelled_student").gte("decided_at", weekAgo).order("decided_at", { ascending: false }),
  ]);
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
      el("h2", { style: "margin-top:24px" }, "Absagen von Schülern (letzte 7 Tage)"),
      cancels.data.filter((b) => b.slots).map((b) => item(b, [
        b.late_cancel ? el("span", { class: "badge late" }, "Fehlstunde – kostenpflichtig") : el("span", { class: "badge rejected" }, "rechtzeitig"),
        b.cancel_reason ? el("div", { class: "note" }, "Grund: ", b.cancel_reason) : null,
      ])),
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
    sb.from("profiles").select("id,first_name,last_name,email,phone,license_class,needs_glasses,is_conversion,role,status,created_at").order("last_name"),
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
    el("thead", {}, el("tr", {}, el("th", {}, "Name"), el("th", {}, "Klasse"), el("th", { class: "num" }, "Gefahren"), el("th", { class: "num" }, "Gesamtzeit"), el("th", { class: "num" }, "Geplant"), el("th", {}, "Sonderfahrten"), el("th", { class: "num" }, "Ausgefallen"), el("th", { class: "num" }, "Fehlstd."))),
    el("tbody", {}, list.map((st) => {
      const s = stats[st.id] || { done: 0, minutes: 0, upcoming: 0, open: 0, notHeld: 0, late: 0, special: {} };
      return el("tr", { class: "clickable", onclick: () => openStudent(st) },
        el("td", {}, fullName(st), st.needs_glasses ? " 👓" : "", st.is_conversion ? el("div", { class: "small muted" }, "Umschreiber") : null),
        el("td", {}, st.license_class || "–"), el("td", { class: "num" }, s.done), el("td", { class: "num" }, fmtMinutes(s.minutes)),
        el("td", { class: "num" }, s.upcoming + (s.open ? ` (+${s.open} angefragt)` : "")), el("td", { style: "white-space:nowrap" }, SPECIAL_TYPES.map((t) => `${LESSON_ICON[t]}${s.special[t] || 0}`).join(" ")),
        el("td", { class: "num" }, s.notHeld), el("td", { class: "num" }, s.late));
    }))));

  return el("div", {},
    pending.length ? el("div", { class: "card" },
      el("h2", {}, "Neue Anmeldungen"),
      el("p", { class: "muted small" }, "Diese Personen haben sich registriert und warten auf deine Freischaltung. Erst danach sehen sie den Kalender."),
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
      el("p", { class: "muted small" }, "Auf einen Namen tippen, um Fahrstunden zu sehen oder den Zugang zu beenden.")),
    blocked.length ? el("div", { class: "card" },
      el("h2", {}, "Gesperrt / Ausbildung beendet"),
      table(blocked)) : null,
  );
}

async function setStudentStatus(st, status) {
  const { error } = await sb.from("profiles").update({ status }).eq("id", st.id);
  if (error) throw error;
  const msg = { active: "freigeschaltet", blocked: "gesperrt" }[status];
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

  const block = el("button", { class: "btn danger" }, "Zugang sperren (Ausbildung beendet)");
  block.onclick = () => busy(block, async () => {
    if (!confirm(`Zugang von ${fullName(st)} sperren? Die Person sieht danach keine Termine mehr und kann nichts mehr buchen. Die gefahrenen Stunden bleiben bei dir gespeichert.`)) return;
    await setStudentStatus(st, "blocked");
  });
  const unblock = el("button", { class: "btn ok" }, "Wieder freischalten");
  unblock.onclick = () => busy(unblock, () => setStudentStatus(st, "active"));
  const del = el("button", { class: "btn danger" }, "Endgültig löschen");
  del.onclick = () => busy(del, () => deleteStudent(st));
  const edit = el("button", { class: "btn small ghost", onclick: () => openEditStudent(st) }, "✏️ Daten bearbeiten");

  openModal(fullName(st),
    el("div", { class: "done-row" }, studentTags(st), edit),
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
    el("h3", {}, "Zugang"),
    el("p", { class: "muted small" }, st.status === "blocked"
      ? "Gesperrt: Die Person sieht keine Termine mehr. Du kannst sie wieder freischalten oder endgültig löschen."
      : "Nach der Ausbildung: Sperren behält die Fahrstunden-Historie bei dir. Löschen entfernt Konto und alle Daten (z. B. für den Datenschutz)."),
    el("div", { class: "actions" }, st.status === "blocked" ? unblock : block, del));
}

/* ---------------- Admin: Einstellungen ---------------- */

function adminSettings() {
  const dur = durationControl(state.settings.default_duration);
  const maxOpen = el("input", { type: "number", min: 0, max: 50, value: state.settings.max_open ?? 3 });
  const phone = el("input", { type: "tel", value: state.settings.admin_phone || "", placeholder: "z. B. 0151 23456789" });
  const save = el("button", { class: "btn" }, "Speichern");
  save.onclick = () => busy(save, async () => {
    const v = { default_duration: dur.value, max_open: Math.max(0, Math.min(50, +maxOpen.value || 0)), admin_phone: phone.value.trim() || null };
    const { error } = await sb.from("settings").update(v).eq("id", 1);
    if (error) throw error;
    Object.assign(state.settings, v);
    toast("Einstellungen gespeichert.");
  });
  const link = location.origin + location.pathname;
  const linkInput = el("input", { readonly: true, value: link });
  return el("div", {},
    el("div", { class: "card" },
      el("h3", {}, "Standarddauer für neue Termine"),
      el("p", { class: "muted small" }, "Wird bei jedem neuen Termin vorausgefüllt. Du kannst sie dort pro Termin trotzdem ändern."),
      dur.node,
      el("h3", { style: "margin-top:18px" }, "Höchstzahl offener Fahrstunden pro Schüler"),
      el("p", { class: "muted small" }, "So viele Anfragen + anstehende Fahrstunden darf ein Schüler gleichzeitig haben. 0 = unbegrenzt."),
      maxOpen,
      el("h3", { style: "margin-top:18px" }, "Deine Handynummer"),
      el("p", { class: "muted small" }, "Damit Schüler dich per WhatsApp-Knopf erreichen (z. B. nach einer Absage). Wird nur freigeschalteten Schülern angezeigt."),
      phone,
      el("div", { class: "actions" }, save)),
    el("div", { class: "card" },
      el("h3", {}, "Link für deine Schüler"),
      el("p", { class: "muted small" }, "Diesen Link per WhatsApp oder SMS schicken. Schüler registrieren sich dort einmal mit Vor- und Nachnamen."),
      el("div", { class: "linkbox" }, linkInput,
        el("button", { class: "btn", onclick: () => navigator.clipboard.writeText(link).then(() => toast("Link kopiert."), () => { linkInput.select(); }) }, "Kopieren"))),
  );
}

/* ---------------- Schüler: Kalender ---------------- */

async function studentCalendar() {
  const from = state.weekStart, to = addDays(state.weekStart, 7);
  const { data, error } = await sb.rpc("get_calendar", { p_from: from.toISOString(), p_to: to.toISOString() });
  if (error) throw error;
  const now = Date.now();
  // Freie und fremd angefragte (unbestätigte) Termine in der Zukunft + die eigenen.
  // Fremde bestätigte Fahrstunden liefert die Datenbank gar nicht erst.
  const slots = data.filter((s) => s.mine || new Date(s.starts_at).getTime() > now);

  const grid = weekGrid(slots, (s) => {
    const past = new Date(s.starts_at).getTime() < now;
    const cls = s.mine && past ? "past" : s.status;
    const label = s.mine
      ? (s.status === "confirmed" ? (past ? "Deine Fahrstunde" : "✓ Deine Fahrstunde – bestätigt") : "Deine Anfrage – wartet auf Bestätigung")
      : s.status === "requested" ? "Angefragt – noch nicht bestätigt (wird evtl. wieder frei)"
      : "Frei – jetzt anfragen";
    const clickable = s.mine || (s.status === "free" && !past);
    return el("button", {
      class: "slot " + cls + (s.mine ? " mine" : ""), disabled: !clickable,
      onclick: clickable ? () => (s.mine ? (state.tab = "mine", render()) : openBooking(s)) : null,
    }, el("b", {}, fmtRange(s.starts_at, s.duration_min)), label);
  });

  return el("div", {},
    weekBar(),
    legend([["free", "frei – antippen zum Anfragen"], ["requested", "von jemandem angefragt – schau später wieder rein"], ["confirmed mine", "deine Fahrstunden"]]),
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
    el("p", {}, el("b", {}, fmtDate(s.starts_at)), el("br"), fmtRange(s.starts_at, s.duration_min), ` (${fmtMinutes(s.duration_min)})`),
    el("label", {}, "Kurze Nachricht an deinen Fahrlehrer"), note, counter,
    el("div", { class: "notice" },
      el("b", {}, "Wichtig: "), "Nach der Bestätigung durch deinen Fahrlehrer ist die Fahrstunde verbindlich. ",
      `Kostenlos absagen kannst du bis zum Vortag 18:00 Uhr (hier: ${fmtDeadline(s.starts_at)}). `,
      "Spätere Absagen werden als Fehlstunde berechnet und sind kostenpflichtig."),
    isLate(s.starts_at) ? el("div", { class: "notice danger" },
      "Kurzfristige Buchung: Die Absagefrist ist bereits abgelaufen. Wird diese Fahrstunde bestätigt, ist eine Absage kostenpflichtig.") : null,
    el("div", { class: "actions" }, btn, el("button", { class: "btn ghost", onclick: closeModal }, "Abbrechen")));
}

/* ---------------- Schüler: Mein Profil ---------------- */

function studentProfile() {
  const f = profileFields(state.profile);
  const save = el("button", { class: "btn" }, "Speichern");
  save.onclick = () => busy(save, async () => {
    const v = f.values();
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
    f.node, el("div", { class: "actions" }, save));
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
        el("th", { colspan: 4 }, `Gesamt: ${done.length} Fahrstunde${done.length === 1 ? "" : "n"}`),
        el("th", { class: "num" }, `${total} Min. (${fmtMinutes(total)})`))))));
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
  const upcoming = rows.filter((b) => (b.status === "requested" || (b.status === "confirmed" && b.actual_minutes === null)) && new Date(b.slots.starts_at).getTime() >= now - 3600000).reverse();
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
    return el("div", { class: "list-item" },
      el("div", { class: "head" },
        el("div", {}, el("b", {}, fmtDate(b.slots.starts_at)), el("div", {}, fmtRange(b.slots.starts_at, b.slots.duration_min))),
        b.decided_at && b.decided_at > seen ? el("span", { class: "badge late" }, "Neu") : null,
        el("span", { class: "badge " + b.status }, b.status === "requested" ? "Wartet auf Bestätigung"
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
      cancel || cancelLesson ? el("div", { class: "actions" }, cancel, cancelLesson) : null);
  };

  return el("div", {},
    el("div", { class: "card" }, el("b", {}, `${doneCount} Fahrstunde${doneCount === 1 ? "" : "n"} gefahren`), " · insgesamt ", el("b", {}, fmtMinutes(total)),
      notHeldCount ? ` · ${notHeldCount}× ausgefallen` : "", lateCount ? ` · davon ${lateCount} Fehlstunde${lateCount === 1 ? "" : "n"}` : "",
      el("div", { class: "small", style: "margin-top:6px" }, "Sonderfahrten: ", specialSummary(rows)),
      el("div", { class: "done-row" }, waButton(state.settings.admin_phone, `Hallo, hier ist ${fullName(state.profile)}.\n`, "💬 Fahrlehrer per WhatsApp"),
        rows.length ? exportButtons(state.profile, rows) : null)),
    doneList(rows, total),
    el("h2", { style: "margin-top:24px" }, "Anstehend"),
    upcoming.length ? upcoming.map(item) : el("p", { class: "muted" }, "Keine anstehenden Fahrstunden. Im Kalender kannst du freie Termine anfragen."),
    rest.length ? [el("h2", { style: "margin-top:24px" }, "Gefahren, abgesagt & abgelehnt"), rest.map(item)] : null,
  );
}

init();
