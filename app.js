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
const STATUS_TEXT = { requested: "Angefragt", confirmed: "Bestätigt", rejected: "Abgelehnt", cancelled: "Zurückgezogen", sick: "Abgesagt – krank" };
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

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible" && state.profile && !modal.open) render();
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
  const tabs = isAdmin()
    ? [["calendar", "Kalender"], ["requests", "Anfragen"], ["students", "Schüler"], ["settings", "Einstellungen"]]
    : [["calendar", "Kalender"], ["mine", "Meine Fahrstunden"]];

  const tabbar = el("div", { class: "tabs" }, tabs.map(([id, label]) =>
    el("button", { class: "tab" + (state.tab === id ? " active" : ""), "data-tab": id, onclick: () => { state.tab = id; render(); } }, label)));
  const content = el("div", {}, el("p", { class: "muted" }, "Lädt …"));
  app.replaceChildren(tabbar, content);

  if (isAdmin()) updateRequestCount(tabbar);

  try {
    let view;
    if (state.tab === "calendar") view = isAdmin() ? await adminCalendar() : await studentCalendar();
    else if (state.tab === "requests") view = await adminRequests();
    else if (state.tab === "students") view = await adminStudents();
    else if (state.tab === "settings") view = adminSettings();
    else if (state.tab === "mine") view = await studentMine();
    content.replaceChildren(view);
  } catch (e) {
    content.replaceChildren(el("p", { class: "muted" }, "Konnte nicht geladen werden."));
    fail(e);
  }
}

async function updateRequestCount(tabbar) {
  const [req, pend] = await Promise.all([
    sb.from("bookings").select("id", { count: "exact", head: true }).eq("status", "requested"),
    sb.from("profiles").select("id", { count: "exact", head: true }).eq("status", "pending"),
  ]);
  const badge = (tab, count) => {
    const btn = tabbar.querySelector(`[data-tab="${tab}"]`);
    if (btn && count) btn.append(el("span", { class: "count" }, count));
  };
  badge("requests", req.count);
  badge("students", pend.count);
}

function weekBar() {
  const end = addDays(state.weekStart, 6);
  const go = (n) => { state.weekStart = addDays(state.weekStart, n); render(); };
  return el("div", { class: "weekbar" },
    el("div", { class: "actions", style: "margin:0" },
      el("button", { class: "btn small ghost", onclick: () => go(-7), "aria-label": "Vorherige Woche" }, "‹"),
      el("button", { class: "btn small ghost", onclick: () => { state.weekStart = startOfWeek(new Date()); render(); } }, "Heute"),
      el("button", { class: "btn small ghost", onclick: () => go(7), "aria-label": "Nächste Woche" }, "›")),
    el("span", { class: "title" }, `${fmtDay(state.weekStart)} – ${fmtDay(end)} ${end.getFullYear()}`),
    el("button", { class: "btn small ghost", onclick: () => render() }, "↻ Aktualisieren"),
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
    .select("id,starts_at,duration_min,bookings(id,status,actual_minutes,student_id,profiles(first_name,last_name,license_class,needs_glasses,is_conversion))")
    .gte("starts_at", from.toISOString()).lt("starts_at", to.toISOString()).order("starts_at");
  if (error) throw error;

  const form = newSlotForm();
  const grid = weekGrid(slots, (s) => {
    const b = activeBooking(s);
    const sick = (s.bookings || []).find((x) => x.status === "sick");
    const past = new Date(s.starts_at).getTime() < Date.now();
    const glasses = (p) => (p && p.needs_glasses ? " 👓" : "");
    let cls = past ? "past" : "free", label = past ? "Nicht gebucht" : "Frei";
    if (!b && sick) label = `🤒 ${fullName(sick.profiles)} krank` + (past ? "" : " – wieder frei");
    if (b && b.status === "requested") { cls = "requested"; label = "Anfrage: " + fullName(b.profiles) + glasses(b.profiles); }
    if (b && b.status === "confirmed") {
      cls = b.actual_minutes !== null ? "done" : "confirmed";
      label = (b.actual_minutes !== null ? `✓ ${b.actual_minutes} Min. · ` : "") + fullName(b.profiles) + glasses(b.profiles);
    }
    return el("button", { class: "slot " + cls, onclick: () => openAdminSlot(s.id) },
      el("b", {}, fmtRange(s.starts_at, s.duration_min)), label);
  }, (day) => { form.setDate(day); form.node.scrollIntoView({ behavior: "smooth" }); });

  return el("div", {},
    form.node,
    weekBar(),
    legend([["free", "frei"], ["requested", "angefragt – bitte bestätigen"], ["confirmed", "bestätigt"], ["done", "gefahren ✓ / vergangen"]]),
    grid,
  );
}

function newSlotForm() {
  const now = new Date();
  const date = el("input", { type: "date", value: dateInput(now) });
  const time = el("input", { type: "time", value: "08:00", step: 300 });
  const dur = durationControl(state.settings.default_duration);
  const count = el("input", { type: "number", min: 1, max: 10, value: 1 });
  const pause = el("input", { type: "number", min: 0, max: 240, step: 5, value: 0 });
  const weeks = el("input", { type: "number", min: 1, max: 26, value: 1 });
  const preview = el("p", { class: "muted small" });
  const btn = el("button", { class: "btn" }, "Termine freigeben");

  function build() {
    const list = [];
    const base = fromInputs(date.value, time.value);
    if (isNaN(base)) return list;
    const n = Math.max(1, +count.value || 1), w = Math.max(1, +weeks.value || 1), p = Math.max(0, +pause.value || 0);
    for (let wk = 0; wk < w; wk++) {
      for (let i = 0; i < n; i++) {
        const start = addMin(addDays(base, wk * 7), i * (dur.value + p));
        list.push({ starts_at: start.toISOString(), duration_min: dur.value });
      }
    }
    return list;
  }
  function updatePreview() {
    const list = build();
    if (!list.length) { preview.textContent = ""; return; }
    const first = list[0];
    preview.textContent = `${list.length} Termin${list.length > 1 ? "e" : ""} – erster: ${fmtDate(first.starts_at)}, ${fmtRange(first.starts_at, first.duration_min)}`;
  }
  [date, time, count, pause, weeks, dur.input].forEach((i) => i.addEventListener("input", updatePreview));
  updatePreview();

  btn.onclick = () => busy(btn, async () => {
    const list = build();
    if (!list.length) throw new Error("Bitte Datum und Uhrzeit angeben");
    const { error } = await sb.from("slots").insert(list);
    if (error) throw error;
    toast(`${list.length} Termin${list.length > 1 ? "e" : ""} freigegeben.`);
    state.weekStart = startOfWeek(new Date(list[0].starts_at));
    render();
  });

  const node = el("div", { class: "card" },
    el("h3", {}, "Neue Fahrstunden freigeben"),
    el("div", { class: "row" },
      el("div", {}, el("label", {}, "Datum"), date),
      el("div", {}, el("label", {}, "Beginn"), time)),
    el("label", {}, "Dauer (Standard: " + state.settings.default_duration + " Min.)"), dur.node,
    el("details", {},
      el("summary", { class: "small muted", style: "margin-top:10px;cursor:pointer" }, "Mehrere Termine auf einmal …"),
      el("div", { class: "row" },
        el("div", {}, el("label", {}, "Anzahl hintereinander"), count),
        el("div", {}, el("label", {}, "Pause dazwischen (Min.)"), pause),
        el("div", {}, el("label", {}, "Wöchentlich für … Wochen"), weeks))),
    preview,
    el("div", { class: "actions" }, btn),
  );
  return { node, setDate: (d) => { date.value = dateInput(d); updatePreview(); } };
}

async function openAdminSlot(slotId) {
  const { data: slot, error } = await sb.from("slots")
    .select("id,starts_at,duration_min,bookings(id,status,student_note,admin_reply,actual_start,actual_end,actual_minutes,created_at,decided_at,profiles(first_name,last_name,license_class,needs_glasses,is_conversion))")
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
      timeFields, el("div", { class: "actions" }, save, del));
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
        done("Fahrstunde bestätigt.");
      });
      const no = el("button", { class: "btn danger" }, "Ablehnen");
      no.onclick = () => busy(no, async () => {
        if (!confirm("Anfrage ablehnen? Der Termin wird danach wieder frei.")) return;
        const { error } = await sb.from("bookings").update({ status: "rejected", admin_reply: reply.value.trim() || null, decided_at: new Date().toISOString() }).eq("id", b.id);
        if (error) throw error;
        done("Anfrage abgelehnt – Termin ist wieder frei.");
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
      const cancel = el("button", { class: "btn danger" }, "Fahrstunde absagen");
      cancel.onclick = () => busy(cancel, async () => {
        if (!confirm("Bestätigte Fahrstunde absagen? Der Schüler sieht 'Abgelehnt' und deine Antwort. Der Termin wird wieder frei.")) return;
        const { error } = await sb.from("bookings").update({ status: "rejected", admin_reply: reply.value.trim() || null, decided_at: new Date().toISOString() }).eq("id", b.id);
        if (error) throw error;
        done("Fahrstunde abgesagt.");
      });
      parts.push(el("div", { class: "actions" }, save, cancel));
    }
  }

  if (history.length) {
    parts.push(el("hr"), el("p", { class: "muted small" }, "Frühere Anfragen zu diesem Termin:"),
      history.map((h) => {
        // Krankmeldung versehentlich gesetzt? Solange der Termin frei ist, lässt sie sich zurücknehmen.
        const undo = h.status === "sick" && !b ? el("button", { class: "btn small ghost" }, "Rückgängig") : null;
        if (undo) undo.onclick = () => busy(undo, async () => {
          const { error } = await sb.from("bookings").update({ status: "confirmed" }).eq("id", h.id);
          if (error) throw error;
          done("Krankmeldung zurückgenommen – Fahrstunde wieder bestätigt.");
        });
        return el("div", { class: "done-row small" }, `${fullName(h.profiles)} – ${STATUS_TEXT[h.status]}`, undo);
      }));
  }

  openModal(`${fmtDate(slot.starts_at)}, ${fmtRange(slot.starts_at, slot.duration_min)}`, ...parts);
}

// Nach der Fahrstunde: Minuten anpassen und abhaken – oder als krank abgesagt markieren
function doneControls(slot, b, after, opts = {}) {
  const isDone = b.actual_minutes !== null;
  const mins = durationControl(isDone ? b.actual_minutes : slot.duration_min, { fine: true });
  const check = el("button", { class: "btn ok" }, isDone ? "✓ Minuten speichern" : "✓ Gefahren – abhaken");
  check.onclick = () => busy(check, async () => {
    const { error } = await sb.from("bookings").update({ actual_minutes: mins.value }).eq("id", b.id);
    if (error) throw error;
    after(`✓ Abgehakt: ${fmtMinutes(mins.value)} gefahren`);
  });
  const sick = el("button", { class: "btn danger" }, "🤒 Abgesagt – krank");
  sick.onclick = () => busy(sick, async () => {
    if (!confirm(`${fullName(b.profiles)} als „abgesagt – krank“ markieren? Der Schüler sieht das auf seiner Seite.${new Date(slot.starts_at) > new Date() ? " Der Termin wird wieder frei." : ""}`)) return;
    const { error } = await sb.from("bookings").update({ status: "sick", actual_minutes: null, decided_at: new Date().toISOString() }).eq("id", b.id);
    if (error) throw error;
    after("Als krank abgesagt markiert.");
  });
  const undo = el("button", { class: "btn ghost" }, "Haken entfernen");
  undo.onclick = () => busy(undo, async () => {
    const { error } = await sb.from("bookings").update({ actual_minutes: null }).eq("id", b.id);
    if (error) throw error;
    after("Haken entfernt.");
  });

  return el("div", {},
    opts.compact ? null : el("h3", {}, isDone ? `✓ Gefahren: ${fmtMinutes(b.actual_minutes)}` : "Gefahren?"),
    opts.compact ? null : el("p", { class: "muted small" }, isDone
      ? "Erledigt. Falls nötig, Minuten korrigieren oder den Haken entfernen."
      : "Geplant waren " + slot.duration_min + " Min. Kürzer oder länger gefahren? Minuten anpassen, dann abhaken."),
    mins.node,
    el("div", { class: "actions" }, check, isDone ? undo : sick));
}

/* ---------------- Admin: Anfragen ---------------- */

async function adminRequests() {
  const [req, open] = await Promise.all([
    sb.from("bookings").select("id,student_note,created_at,profiles(first_name,last_name,license_class,needs_glasses,is_conversion),slots(id,starts_at,duration_min)").eq("status", "requested").order("created_at"),
    sb.from("bookings").select("id,profiles(first_name,last_name,license_class,needs_glasses,is_conversion),slots(id,starts_at,duration_min)").eq("status", "confirmed").is("actual_minutes", null),
  ]);
  if (req.error) throw req.error;
  if (open.error) throw open.error;

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
    el("h2", { style: "margin-top:24px" }, "Noch abzuhaken"),
    el("p", { class: "muted small" }, "Vergangene Fahrstunden: Minuten prüfen und abhaken – oder als krank abgesagt markieren."),
    missing.length ? missing.map((b) => item(b, doneControls(b.slots, b, (msg) => { toast(msg); render(); }, { compact: true })))
      : el("p", { class: "muted" }, "Alles abgehakt. 👍"),
  );
}

/* ---------------- Admin: Schüler ---------------- */

async function adminStudents() {
  const [p, b] = await Promise.all([
    sb.from("profiles").select("id,first_name,last_name,email,license_class,needs_glasses,is_conversion,role,status,created_at").order("last_name"),
    sb.from("bookings").select("student_id,status,actual_minutes"),
  ]);
  if (p.error) throw p.error;
  if (b.error) throw b.error;

  const stats = {};
  for (const x of b.data) {
    const s = (stats[x.student_id] ||= { done: 0, minutes: 0, upcoming: 0, open: 0, sick: 0 });
    if (x.status === "confirmed" && x.actual_minutes !== null) { s.done++; s.minutes += x.actual_minutes; }
    else if (x.status === "confirmed") s.upcoming++;
    else if (x.status === "requested") s.open++;
    else if (x.status === "sick") s.sick++;
  }
  const students = p.data.filter((x) => x.role === "student");
  const pending = students.filter((x) => x.status === "pending");
  const active = students.filter((x) => x.status === "active");
  const blocked = students.filter((x) => x.status === "blocked");
  if (!students.length) return el("p", { class: "muted" }, "Noch keine Schüler registriert. Schicke ihnen den Link aus den Einstellungen.");

  const table = (list) => el("div", { style: "overflow-x:auto" }, el("table", {},
    el("thead", {}, el("tr", {}, el("th", {}, "Name"), el("th", {}, "Klasse"), el("th", { class: "num" }, "Gefahren"), el("th", { class: "num" }, "Gesamtzeit"), el("th", { class: "num" }, "Geplant"), el("th", { class: "num" }, "Krank"))),
    el("tbody", {}, list.map((st) => {
      const s = stats[st.id] || { done: 0, minutes: 0, upcoming: 0, open: 0, sick: 0 };
      return el("tr", { class: "clickable", onclick: () => openStudent(st) },
        el("td", {}, fullName(st), st.needs_glasses ? " 👓" : "", st.is_conversion ? el("div", { class: "small muted" }, "Umschreiber") : null),
        el("td", {}, st.license_class || "–"), el("td", { class: "num" }, s.done), el("td", { class: "num" }, fmtMinutes(s.minutes)),
        el("td", { class: "num" }, s.upcoming + (s.open ? ` (+${s.open} angefragt)` : "")), el("td", { class: "num" }, s.sick));
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

async function openStudent(st) {
  const { data, error } = await sb.from("bookings")
    .select("id,status,student_note,admin_reply,actual_minutes,slots(id,starts_at,duration_min)").eq("student_id", st.id);
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

  openModal(fullName(st),
    el("p", {}, studentTags(st)),
    st.email ? el("p", { class: "muted small" }, st.email) : null,
    rows.length ? rows.map((b) => el("div", { class: "list-item clickable", onclick: () => openAdminSlot(b.slots.id) },
      el("div", { class: "head" },
        el("span", {}, `${fmtDay(b.slots.starts_at)} ${fmtRange(b.slots.starts_at, b.slots.duration_min)}`),
        el("span", { class: "badge " + b.status }, b.actual_minutes !== null ? "✓ Gefahren" : STATUS_TEXT[b.status])),
      b.actual_minutes !== null ? el("div", { class: "small" }, "Gefahren: " + fmtMinutes(b.actual_minutes)) : null))
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
  const save = el("button", { class: "btn" }, "Speichern");
  save.onclick = () => busy(save, async () => {
    const { error } = await sb.from("settings").update({ default_duration: dur.value }).eq("id", 1);
    if (error) throw error;
    state.settings.default_duration = dur.value;
    toast("Standarddauer: " + dur.value + " Min.");
  });
  const link = location.origin + location.pathname;
  const linkInput = el("input", { readonly: true, value: link });
  return el("div", {},
    el("div", { class: "card" },
      el("h3", {}, "Standarddauer für neue Termine"),
      el("p", { class: "muted small" }, "Wird bei jedem neuen Termin vorausgefüllt. Du kannst sie dort pro Termin trotzdem ändern."),
      dur.node, el("div", { class: "actions" }, save)),
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
  // Nur freie (zukünftige) Termine und die eigenen – fremde Buchungen liefert die Datenbank gar nicht erst
  const slots = data.filter((s) => s.mine || (s.status === "free" && new Date(s.starts_at).getTime() > now));

  const grid = weekGrid(slots, (s) => {
    const past = new Date(s.starts_at).getTime() < now;
    const cls = s.mine && past ? "past" : s.status;
    const label = !s.mine ? "Frei – jetzt anfragen"
      : s.status === "confirmed" ? (past ? "Deine Fahrstunde" : "✓ Deine Fahrstunde – bestätigt")
      : "Deine Anfrage – wartet auf Bestätigung";
    const clickable = s.mine || !past;
    return el("button", {
      class: "slot " + cls + (s.mine ? " mine" : ""), disabled: !clickable,
      onclick: clickable ? () => (s.mine ? (state.tab = "mine", render()) : openBooking(s)) : null,
    }, el("b", {}, fmtRange(s.starts_at, s.duration_min)), label);
  });

  return el("div", {},
    weekBar(),
    legend([["free", "frei – antippen zum Anfragen"], ["requested mine", "deine Anfrage"], ["confirmed mine", "deine bestätigte Fahrstunde"]]),
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
    el("p", { class: "muted small" }, "Die Fahrstunde ist erst verbindlich, wenn dein Fahrlehrer sie bestätigt hat."),
    el("div", { class: "actions" }, btn, el("button", { class: "btn ghost", onclick: closeModal }, "Abbrechen")));
}

/* ---------------- Schüler: Meine Fahrstunden ---------------- */

async function studentMine() {
  const { data, error } = await sb.from("bookings")
    .select("id,status,student_note,admin_reply,actual_minutes,created_at,slots(starts_at,duration_min)")
    .eq("student_id", state.profile.id);
  if (error) throw error;
  const rows = data.filter((b) => b.slots).sort((a, b) => b.slots.starts_at.localeCompare(a.slots.starts_at));
  const now = Date.now();
  const upcoming = rows.filter((b) => (b.status === "requested" || (b.status === "confirmed" && b.actual_minutes === null)) && new Date(b.slots.starts_at).getTime() >= now - 3600000).reverse();
  const rest = rows.filter((b) => !upcoming.includes(b));
  const total = rows.reduce((sum, b) => sum + (b.status === "confirmed" && b.actual_minutes ? b.actual_minutes : 0), 0);
  const doneCount = rows.filter((b) => b.status === "confirmed" && b.actual_minutes !== null).length;
  const sickCount = rows.filter((b) => b.status === "sick").length;

  const item = (b) => {
    const cancel = b.status === "requested" ? el("button", { class: "btn small danger" }, "Anfrage zurückziehen") : null;
    if (cancel) cancel.onclick = () => busy(cancel, async () => {
      if (!confirm("Anfrage wirklich zurückziehen?")) return;
      const { error } = await sb.rpc("cancel_request", { p_booking: b.id });
      if (error) throw error;
      toast("Anfrage zurückgezogen.");
      render();
    });
    return el("div", { class: "list-item" },
      el("div", { class: "head" },
        el("div", {}, el("b", {}, fmtDate(b.slots.starts_at)), el("div", {}, fmtRange(b.slots.starts_at, b.slots.duration_min))),
        el("span", { class: "badge " + b.status }, b.status === "requested" ? "Wartet auf Bestätigung"
          : b.status === "confirmed" && b.actual_minutes !== null ? "✓ Gefahren" : STATUS_TEXT[b.status])),
      b.student_note ? el("div", { class: "note" }, "Deine Nachricht: ", b.student_note) : null,
      b.admin_reply ? el("div", { class: "note reply" }, el("b", {}, "Fahrlehrer: "), b.admin_reply) : null,
      b.actual_minutes !== null ? el("div", { class: "small", style: "margin-top:8px" }, "Gefahren: ", el("b", {}, fmtMinutes(b.actual_minutes)),
        b.actual_minutes !== b.slots.duration_min ? ` (geplant waren ${b.slots.duration_min} Min.)` : "") : null,
      cancel ? el("div", { class: "actions" }, cancel) : null);
  };

  return el("div", {},
    el("div", { class: "card" }, el("b", {}, `${doneCount} Fahrstunde${doneCount === 1 ? "" : "n"} gefahren`), " · insgesamt ", el("b", {}, fmtMinutes(total)),
      sickCount ? ` · ${sickCount}× krank abgesagt` : ""),
    el("h2", {}, "Anstehend"),
    upcoming.length ? upcoming.map(item) : el("p", { class: "muted" }, "Keine anstehenden Fahrstunden. Im Kalender kannst du freie Termine anfragen."),
    rest.length ? [el("h2", { style: "margin-top:24px" }, "Gefahren, abgesagt & abgelehnt"), rest.map(item)] : null,
  );
}

init();
