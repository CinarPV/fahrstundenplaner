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
const STATUS_TEXT = { requested: "Angefragt", confirmed: "Bestätigt", rejected: "Abgelehnt", cancelled: "Zurückgezogen" };
const isAdmin = () => state.profile && state.profile.role === "admin";

// Dauer-Auswahl: Standardwert vorbelegt, in 5er/15er-Schritten änderbar, Schnellwahl-Knöpfe
function durationControl(initial) {
  const clamp = (v) => Math.min(600, Math.max(5, Math.round((Number(v) || 0) / 5) * 5));
  const input = el("input", { type: "number", min: 5, max: 600, step: 5, value: clamp(initial), "aria-label": "Dauer in Minuten" });
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
    el("div", { class: "chips" }, [45, 60, 90, 135].map((m) => b(`${m} Min.`, () => set(m)))),
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
  render();
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
            options: { data: { first_name: first.value.trim(), last_name: last.value.trim() }, emailRedirectTo: location.origin + location.pathname },
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
  const { count } = await sb.from("bookings").select("id", { count: "exact", head: true }).eq("status", "requested");
  const btn = tabbar.querySelector('[data-tab="requests"]');
  if (btn && count) btn.append(el("span", { class: "count" }, count));
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
    .select("id,starts_at,duration_min,bookings(id,status,actual_minutes,student_id,profiles(first_name,last_name))")
    .gte("starts_at", from.toISOString()).lt("starts_at", to.toISOString()).order("starts_at");
  if (error) throw error;

  const form = newSlotForm();
  const grid = weekGrid(slots, (s) => {
    const b = activeBooking(s);
    let cls = "free", label = "Frei";
    if (b && b.status === "requested") { cls = "requested"; label = "Anfrage: " + fullName(b.profiles); }
    if (b && b.status === "confirmed") {
      cls = b.actual_minutes !== null ? "done" : "confirmed";
      label = (b.actual_minutes !== null ? "✓ " : "") + fullName(b.profiles);
    }
    return el("button", { class: "slot " + cls, onclick: () => openAdminSlot(s.id) },
      el("b", {}, fmtRange(s.starts_at, s.duration_min)), label);
  }, (day) => { form.setDate(day); form.node.scrollIntoView({ behavior: "smooth" }); });

  return el("div", {},
    form.node,
    weekBar(),
    legend([["free", "frei"], ["requested", "angefragt – bitte bestätigen"], ["confirmed", "bestätigt"], ["done", "durchgeführt"]]),
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
    .select("id,starts_at,duration_min,bookings(id,status,student_note,admin_reply,actual_start,actual_end,actual_minutes,created_at,decided_at,profiles(first_name,last_name))")
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
      el("p", {}, el("b", {}, fullName(b.profiles)), " ", el("span", { class: "badge " + b.status }, STATUS_TEXT[b.status])),
      b.student_note ? el("div", { class: "note" }, "Nachricht vom Schüler: ", b.student_note) : el("p", { class: "muted small" }, "Keine Nachricht vom Schüler."),
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
      parts.push(el("div", { class: "actions" }, save, cancel), el("hr"), actualTimeForm(slot, b, done));
    }
  }

  if (history.length) {
    parts.push(el("hr"), el("p", { class: "muted small" }, "Frühere Anfragen zu diesem Termin:"),
      history.map((h) => el("div", { class: "small" }, `${fullName(h.profiles)} – ${STATUS_TEXT[h.status]}`)));
  }

  openModal(`${fmtDate(slot.starts_at)}, ${fmtRange(slot.starts_at, slot.duration_min)}`, ...parts);
}

// Tatsächliche Fahrzeit nach der Fahrstunde
function actualTimeForm(slot, b, done) {
  const plannedStart = new Date(slot.starts_at);
  const start = el("input", { type: "time", step: 60, value: timeInput(b.actual_start || plannedStart) });
  const end = el("input", { type: "time", step: 60, value: timeInput(b.actual_end || addMin(plannedStart, slot.duration_min)) });
  const minutes = el("input", { type: "number", min: 0, max: 1000, value: b.actual_minutes ?? slot.duration_min });
  const calc = () => {
    const s = fromInputs(dateInput(plannedStart), start.value), e = fromInputs(dateInput(plannedStart), end.value);
    let diff = Math.round((e - s) / 60000);
    if (diff < 0) diff += 1440;
    if (!isNaN(diff)) minutes.value = diff;
  };
  start.addEventListener("input", calc);
  end.addEventListener("input", calc);

  const save = el("button", { class: "btn" }, b.actual_minutes !== null ? "Fahrzeit aktualisieren" : "Fahrzeit speichern");
  save.onclick = () => busy(save, async () => {
    const day = dateInput(plannedStart);
    const s = fromInputs(day, start.value);
    let e = fromInputs(day, end.value);
    if (e < s) e = addDays(e, 1);
    const m = Math.max(0, Math.round(+minutes.value || 0));
    const { error } = await sb.from("bookings").update({ actual_start: s.toISOString(), actual_end: e.toISOString(), actual_minutes: m }).eq("id", b.id);
    if (error) throw error;
    done("Tatsächliche Fahrzeit gespeichert: " + fmtMinutes(m));
  });

  return el("div", {},
    el("h3", {}, "Tatsächliche Fahrzeit"),
    b.actual_minutes !== null ? el("p", { class: "small" }, "Eingetragen: ", el("b", {}, fmtMinutes(b.actual_minutes))) :
      el("p", { class: "muted small" }, "Nach der Fahrstunde eintragen, wie lange tatsächlich gefahren wurde."),
    el("div", { class: "row" },
      el("div", {}, el("label", {}, "Beginn"), start),
      el("div", {}, el("label", {}, "Ende"), end),
      el("div", {}, el("label", {}, "Minuten"), minutes)),
    el("div", { class: "actions" }, save));
}

/* ---------------- Admin: Anfragen ---------------- */

async function adminRequests() {
  const [req, open] = await Promise.all([
    sb.from("bookings").select("id,student_note,created_at,profiles(first_name,last_name),slots(id,starts_at,duration_min)").eq("status", "requested").order("created_at"),
    sb.from("bookings").select("id,profiles(first_name,last_name),slots(id,starts_at,duration_min)").eq("status", "confirmed").is("actual_minutes", null),
  ]);
  if (req.error) throw req.error;
  if (open.error) throw open.error;

  const now = Date.now();
  const missing = open.data.filter((b) => b.slots && addMin(b.slots.starts_at, b.slots.duration_min).getTime() < now)
    .sort((a, b) => a.slots.starts_at.localeCompare(b.slots.starts_at));

  const item = (b, extra) => el("div", { class: "list-item" },
    el("div", { class: "head" },
      el("div", {}, el("b", {}, fullName(b.profiles)), el("div", { class: "small muted" }, `${fmtDate(b.slots.starts_at)}, ${fmtRange(b.slots.starts_at, b.slots.duration_min)}`)),
      el("button", { class: "btn small", onclick: () => openAdminSlot(b.slots.id) }, "Öffnen")),
    extra);

  return el("div", {},
    el("h2", {}, "Offene Anfragen"),
    req.data.length ? req.data.filter((b) => b.slots).map((b) => item(b, b.student_note ? el("div", { class: "note" }, b.student_note) : null))
      : el("p", { class: "muted" }, "Keine offenen Anfragen. 👍"),
    el("h2", { style: "margin-top:24px" }, "Fahrzeit noch nicht eingetragen"),
    missing.length ? missing.map((b) => item(b)) : el("p", { class: "muted" }, "Alles eingetragen."),
  );
}

/* ---------------- Admin: Schüler ---------------- */

async function adminStudents() {
  const [p, b] = await Promise.all([
    sb.from("profiles").select("id,first_name,last_name,role,created_at").order("last_name"),
    sb.from("bookings").select("student_id,status,actual_minutes"),
  ]);
  if (p.error) throw p.error;
  if (b.error) throw b.error;

  const stats = {};
  for (const x of b.data) {
    const s = (stats[x.student_id] ||= { done: 0, minutes: 0, upcoming: 0, open: 0 });
    if (x.status === "confirmed" && x.actual_minutes !== null) { s.done++; s.minutes += x.actual_minutes; }
    else if (x.status === "confirmed") s.upcoming++;
    else if (x.status === "requested") s.open++;
  }
  const students = p.data.filter((x) => x.role === "student");
  if (!students.length) return el("p", { class: "muted" }, "Noch keine Schüler registriert. Schicke ihnen den Link aus den Einstellungen.");

  return el("div", { class: "card" },
    el("h2", {}, "Schüler"),
    el("div", { style: "overflow-x:auto" }, el("table", {},
      el("thead", {}, el("tr", {}, el("th", {}, "Name"), el("th", { class: "num" }, "Gefahren"), el("th", { class: "num" }, "Gesamtzeit"), el("th", { class: "num" }, "Geplant"), el("th", { class: "num" }, "Offen"))),
      el("tbody", {}, students.map((st) => {
        const s = stats[st.id] || { done: 0, minutes: 0, upcoming: 0, open: 0 };
        return el("tr", { class: "clickable", onclick: () => openStudent(st) },
          el("td", {}, fullName(st)), el("td", { class: "num" }, s.done), el("td", { class: "num" }, fmtMinutes(s.minutes)),
          el("td", { class: "num" }, s.upcoming), el("td", { class: "num" }, s.open));
      })))),
    el("p", { class: "muted small" }, "Auf einen Namen tippen, um alle Fahrstunden zu sehen."));
}

async function openStudent(st) {
  const { data, error } = await sb.from("bookings")
    .select("id,status,student_note,admin_reply,actual_minutes,slots(id,starts_at,duration_min)").eq("student_id", st.id);
  if (error) return fail(error);
  const rows = data.filter((b) => b.slots).sort((a, b) => b.slots.starts_at.localeCompare(a.slots.starts_at));
  openModal(fullName(st),
    rows.length ? rows.map((b) => el("div", { class: "list-item clickable", onclick: () => openAdminSlot(b.slots.id) },
      el("div", { class: "head" },
        el("span", {}, `${fmtDay(b.slots.starts_at)} ${fmtRange(b.slots.starts_at, b.slots.duration_min)}`),
        el("span", { class: "badge " + b.status }, STATUS_TEXT[b.status])),
      b.actual_minutes !== null ? el("div", { class: "small" }, "Gefahren: " + fmtMinutes(b.actual_minutes)) : null))
      : el("p", { class: "muted" }, "Noch keine Fahrstunden."));
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
  const slots = data.filter((s) => s.mine || s.status !== "free" || new Date(s.starts_at).getTime() > now);

  const grid = weekGrid(slots, (s) => {
    const past = new Date(s.starts_at).getTime() < now;
    let cls = s.status, label;
    if (s.mine) label = s.status === "confirmed" ? "✓ Deine Fahrstunde" : "Deine Anfrage – wartet auf Bestätigung";
    else if (s.status === "free") label = "Frei – jetzt anfragen";
    else if (s.status === "requested") label = "Angefragt (noch nicht bestätigt)";
    else label = "Gebucht";
    if (past && !s.mine) cls = "past";
    const clickable = s.mine || (s.status === "free" && !past);
    return el("button", {
      class: "slot " + cls + (s.mine ? " mine" : ""), disabled: !clickable,
      onclick: clickable ? () => (s.mine ? (state.tab = "mine", render()) : openBooking(s)) : null,
    }, el("b", {}, fmtRange(s.starts_at, s.duration_min)), label);
  });

  return el("div", {},
    weekBar(),
    legend([["free", "frei"], ["requested", "angefragt – evtl. wird es wieder frei"], ["confirmed", "gebucht"], ["free mine", "deine Termine"]]),
    grid,
    data.length === 0 ? el("p", { class: "muted", style: "margin-top:12px" }, "In dieser Woche gibt es keine freigegebenen Termine. Schau in der nächsten Woche (›) nach.") : null,
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
  const upcoming = rows.filter((b) => (b.status === "requested" || b.status === "confirmed") && new Date(b.slots.starts_at).getTime() >= now - 3600000).reverse();
  const rest = rows.filter((b) => !upcoming.includes(b));
  const total = rows.reduce((sum, b) => sum + (b.status === "confirmed" && b.actual_minutes ? b.actual_minutes : 0), 0);
  const doneCount = rows.filter((b) => b.status === "confirmed" && b.actual_minutes !== null).length;

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
        el("span", { class: "badge " + b.status }, b.status === "requested" ? "Wartet auf Bestätigung" : STATUS_TEXT[b.status])),
      b.student_note ? el("div", { class: "note" }, "Deine Nachricht: ", b.student_note) : null,
      b.admin_reply ? el("div", { class: "note reply" }, el("b", {}, "Fahrlehrer: "), b.admin_reply) : null,
      b.actual_minutes !== null ? el("div", { class: "small", style: "margin-top:8px" }, "Tatsächlich gefahren: ", el("b", {}, fmtMinutes(b.actual_minutes))) : null,
      cancel ? el("div", { class: "actions" }, cancel) : null);
  };

  return el("div", {},
    el("div", { class: "card" }, el("b", {}, `${doneCount} Fahrstunde${doneCount === 1 ? "" : "n"} gefahren`), " · insgesamt ", el("b", {}, fmtMinutes(total))),
    el("h2", {}, "Anstehend"),
    upcoming.length ? upcoming.map(item) : el("p", { class: "muted" }, "Keine anstehenden Fahrstunden. Im Kalender kannst du freie Termine anfragen."),
    rest.length ? [el("h2", { style: "margin-top:24px" }, "Vergangen & abgelehnt"), rest.map(item)] : null,
  );
}

init();
