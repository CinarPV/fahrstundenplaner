/* Easy Fahrstundenplaner – Offline-Modus für Fahrlehrer/innen (einschaltbar unter Einstellungen → Funktionen)
   - Auf dem Gerät liegt eine Kopie der eigenen Daten (IndexedDB).
   - Ohne Internet liest die App aus dieser Kopie; jede Änderung kommt in eine Warteschlange.
   - Sobald wieder Internet da ist, wird die Warteschlange der Reihe nach hochgeladen (automatisch oder per Taste).
     Mitteilungen an Schüler/innen gehen erst dann raus – in der richtigen Reihenfolge, nach den Daten.
   - Schüler/innen nutzen das nie: für sie läuft alles direkt online. */
(() => {
  const TABLES = ["profiles", "settings", "slots", "bookings", "own_entries", "exams", "theory_lessons", "time_blocks", "time_off", "teacher_pay",
    "training_topics", "training_progress", "lesson_reviews", "student_reflections", "student_limits", "student_time_limits", "waitlist"];
  const KEYS = { settings: ["teacher_id"], teacher_pay: ["teacher_id"], training_progress: ["student_id", "topic_id"], lesson_reviews: ["booking_id"],
    student_reflections: ["booking_id"], push_subscriptions: ["endpoint"] };
  const UUID_TABLES = new Set(["slots", "bookings", "own_entries", "exams", "theory_lessons", "time_blocks", "time_off", "student_limits", "student_time_limits", "waitlist"]);
  const OWN_TABLES = new Set(["slots", "own_entries", "theory_lessons", "time_blocks", "time_off", "teacher_pay", "settings"]);   // teacher_id = ich (Standard in der Datenbank)
  const REL = {
    bookings: { profiles: { table: "profiles", one: true, local: "student_id", remote: "id" }, slots: { table: "slots", one: true, local: "slot_id", remote: "id" } },
    slots: { bookings: { table: "bookings", one: false, local: "id", remote: "slot_id" } },
    exams: { profiles: { table: "profiles", one: true, local: "student_id", remote: "id" } },
  };
  const NAMES = { slots: "Termine", bookings: "Fahrstunden", own_entries: "Einträge ohne App", exams: "Prüfungen", theory_lessons: "Theorie", time_blocks: "Private Termine",
    time_off: "Urlaub/Krank", teacher_pay: "Lohn-Einstellungen", settings: "Einstellungen", training_progress: "Ausbildungsstand", training_topics: "Ausbildungs-Themen",
    lesson_reviews: "Bewertungen", student_limits: "Grenzen", student_time_limits: "Uhrzeit-Grenzen", profiles: "Schüler/innen-Daten", waitlist: "Warteliste" };
  const OP_NAMES = { insert: "neu", upsert: "gespeichert", update: "geändert", delete: "gelöscht" };
  const now = () => new Date().toISOString();
  const uuid = () => (crypto.randomUUID ? crypto.randomUUID() : "10000000-1000-4000-8000-100000000000".replace(/[018]/g, (c) => (c ^ (crypto.getRandomValues(new Uint8Array(1))[0] & (15 >> (c / 4)))).toString(16)));

  // Was die Warteschlange bei Funktionen der Datenbank lokal vorwegnimmt (damit die App sofort den neuen Stand zeigt)
  const RPC_LOCAL = {
    announce_late: (a) => { const b = find("bookings", a.p_booking); if (b) { b.late_teacher = a.p_min || null; b.late_teacher_seen = null; } return "teacher"; },
    ack_late: (a) => { const b = find("bookings", a.p_booking); if (b) b.late_student_seen = now(); return "teacher"; },
    set_teacher_status: (a) => { const p = find("profiles", a.p_id); if (p) p.status = a.p_status; },
    set_teacher_valid: (a) => { const p = find("profiles", a.p_id); if (p) p.valid_until = a.p_until; },
    set_teacher_sick_pay: (a) => { const p = find("profiles", a.p_id); if (p) p.sick_pay = !!a.p_on; },
    set_my_gender: () => null, update_my_profile: () => null, request_transfer: () => null, answer_transfer: () => null, ack_transfer: () => null,
    delete_student: (a) => { data.profiles = (data.profiles || []).filter((p) => p.id !== a.p_id); data.bookings = (data.bookings || []).filter((b) => b.student_id !== a.p_id); },
  };
  const RPC_SKIP = new Set(["backup_after_change", "cleanup_old_data"]);   // offline einfach auslassen – nach dem Synchronisieren wird gesichert

  let real = null, uid = null, enabled = false, loaded = false, data = {}, outbox = [], rpcCache = {}, failed = [], refreshedAt = null, lastSync = null;
  let forcedOffline = false, syncing = false, refreshTimer = null, saveTimer = null, version = 0;
  const flagKey = (id) => "fsp_offline_" + id;
  const isOffline = () => !navigator.onLine || forcedOffline;
  const local = () => enabled && loaded && (isOffline() || outbox.length > 0);
  const find = (t, id) => (data[t] || []).find((r) => r.id === id);
  const netErr = (e) => !!e && (e.name === "TypeError" || /Failed to fetch|NetworkError|Load failed|network|fetch failed|ERR_INTERNET|ERR_NETWORK|Netzwerk/i.test((e.message || "") + " " + (e.details || "")));
  const emit = () => { try { window.dispatchEvent(new CustomEvent("fsp-offline", { detail: api.status() })); } catch { /* egal */ } };

  // ---------- Speicher (IndexedDB) ----------
  let dbp = null;
  const idb = () => (dbp ||= new Promise((res, rej) => {
    const r = indexedDB.open("fsp-offline", 1);
    r.onupgradeneeded = () => r.result.createObjectStore("kv");
    r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
  }));
  const idbGet = async (k) => { const d = await idb(); return new Promise((res, rej) => { const q = d.transaction("kv").objectStore("kv").get(k); q.onsuccess = () => res(q.result); q.onerror = () => rej(q.error); }); };
  const idbSet = async (k, v) => { const d = await idb(); return new Promise((res, rej) => { const tx = d.transaction("kv", "readwrite"); tx.objectStore("kv").put(v, k); tx.oncomplete = () => res(); tx.onerror = () => rej(tx.error); }); };
  const idbDel = async (k) => { const d = await idb(); return new Promise((res) => { const tx = d.transaction("kv", "readwrite"); tx.objectStore("kv").delete(k); tx.oncomplete = () => res(); tx.onerror = () => res(); }); };
  const saveOutbox = () => idbSet("outbox_" + uid, { outbox, failed, lastSync }).catch(() => {});
  const saveData = () => { clearTimeout(saveTimer); saveTimer = setTimeout(() => idbSet("data_" + uid, { data, rpcCache, refreshedAt }).catch(() => {}), 400); };

  // ---------- Vergleiche wie in der Datenbank ----------
  const isTs = (v) => typeof v === "string" && /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}/.test(v);
  const norm = (a, b) => (isTs(a) || isTs(b)) && typeof a === "string" && typeof b === "string" && /^\d{4}-\d{2}-\d{2}/.test(a) && /^\d{4}-\d{2}-\d{2}/.test(b)
    ? [Date.parse(a.replace(" ", "T")), Date.parse(b.replace(" ", "T"))] : [a, b];
  const cmp = (a, b) => { const [x, y] = norm(a, b); return x < y ? -1 : x > y ? 1 : 0; };
  const same = (a, b) => a === b || (a != null && b != null && (cmp(a, b) === 0 && String(typeof a) === String(typeof b) || String(a) === String(b)));
  const TEST = {
    eq: (v, x) => same(v, x), neq: (v, x) => v != null && !same(v, x),
    gt: (v, x) => v != null && cmp(v, x) > 0, gte: (v, x) => v != null && cmp(v, x) >= 0,
    lt: (v, x) => v != null && cmp(v, x) < 0, lte: (v, x) => v != null && cmp(v, x) <= 0,
    in: (v, x) => (x || []).some((y) => same(v, y)), is: (v, x) => (v ?? null) === x,
  };
  const pred = ([m, args]) => {
    if (m === "not") { const [c, op, x] = args; const t = TEST[op]; return { col: c, f: (v) => !(t ? t(v, x) : true) }; }
    if (m === "match") { const o = args[0]; return { col: null, f: (r) => Object.entries(o).every(([k, x]) => same(r[k], x)) }; }
    const t = TEST[m]; if (!t) return null;
    return { col: args[0], f: (v) => t(v, args[1]) };
  };

  // ---------- Abfragen auf der lokalen Kopie ----------
  function parseSelect(s) {
    const out = { embeds: [] }; s = (s || "*").replace(/\s/g, "");
    let depth = 0, cur = "";
    const parts = [];
    for (const ch of s) { if (ch === "(") depth++; if (ch === ")") depth--; if (ch === "," && depth === 0) { parts.push(cur); cur = ""; } else cur += ch; }
    if (cur) parts.push(cur);
    for (const p of parts) {
      const m = p.match(/^(?:(\w+):)?(\w+)(!inner)?\((.*)\)$/);
      if (m) out.embeds.push({ alias: m[1] || m[2], name: m[2], inner: !!m[3], sub: parseSelect(m[4]) });
    }
    return out;
  }
  const idx = {};
  const index = (t, key) => {
    const k = t + ":" + key;
    if (!idx[k] || idx[k].v !== version) { const m = new Map(); for (const r of data[t] || []) { const x = r[key]; if (x == null) continue; if (!m.has(x)) m.set(x, []); m.get(x).push(r); } idx[k] = { v: version, m }; }
    return idx[k].m;
  };
  function shape(t, row, sel, nested) {
    const o = { ...row };
    for (const e of sel.embeds) {
      const rel = (REL[t] || {})[e.name];
      if (!rel) continue;
      let v;
      const hits = row[rel.local] == null ? [] : index(rel.table, rel.remote).get(row[rel.local]) || [];
      const conds = nested.filter((n) => n.embed === e.alias);
      const ok = (r) => conds.every((c) => c.f(r[c.col]));
      if (rel.one) { const r = hits[0]; v = r && ok(r) ? shape(rel.table, r, e.sub, []) : null; }
      else v = hits.filter(ok).map((r) => shape(rel.table, r, e.sub, []));
      o[e.alias] = v;
    }
    return o;
  }
  function runSelect(q) {
    const sel = parseSelect(q.cols);
    const top = [], nested = [];
    for (const c of q.filters) {
      const p = pred(c); if (!p) continue;
      if (p.col && p.col.includes(".")) { const [embed, col] = p.col.split("."); nested.push({ embed, col, f: p.f }); }
      else top.push(p);
    }
    let rows = (data[q.t] || []).filter((r) => top.every((p) => (p.col ? p.f(r[p.col]) : p.f(r))));
    rows = rows.map((r) => shape(q.t, r, sel, nested));
    for (const e of sel.embeds) if (e.inner) rows = rows.filter((r) => (Array.isArray(r[e.alias]) ? r[e.alias].length : r[e.alias]));
    if (q.orders.length) rows.sort((a, b) => {
      for (const [c, asc] of q.orders) {
        const x = a[c], y = b[c];
        if (x == null && y == null) continue;
        if (x == null) return asc ? 1 : -1;
        if (y == null) return asc ? -1 : 1;
        const r = cmp(x, y); if (r) return asc ? r : -r;
      }
      return 0;
    });
    const count = rows.length;
    if (q.rng) rows = rows.slice(q.rng[0], q.rng[1] + 1);
    if (q.lim != null) rows = rows.slice(0, q.lim);
    if (q.head) return { data: null, count, error: null, status: 200 };
    if (q.one) {
      if (rows.length > 1) return { data: null, error: { message: "Mehrere Zeilen gefunden", code: "PGRST116" } };
      if (!rows.length) return q.one === 2 ? { data: null, error: { message: "Nicht gefunden (offline)", code: "PGRST116" } } : { data: null, error: null };
      return { data: rows[0], error: null, count };
    }
    return { data: rows, error: null, count: q.count ? count : null };
  }
  function applyWrite(q) {
    const tab = data[q.t] || (data[q.t] = []);
    const top = q.filters.map(pred).filter(Boolean);
    const match = (r) => top.every((p) => (p.col ? p.f(r[p.col]) : p.f(r)));
    let out = [];
    if (q.op === "insert" || q.op === "upsert") {
      const keys = KEYS[q.t] || ["id"];
      const sample = tab[0] || {};
      for (const v0 of Array.isArray(q.val) ? q.val : [q.val]) {
        const v = { ...v0 };
        if (OWN_TABLES.has(q.t) && v.teacher_id == null && uid) v.teacher_id = uid;
        const ex = q.op === "upsert" || (q.opts && q.opts.onConflict) ? tab.find((r) => keys.every((k) => r[k] != null && same(r[k], v[k]))) : null;
        if (ex) { Object.assign(ex, v); out.push(ex); continue; }
        const row = {};
        for (const [k, x] of Object.entries(sample)) row[k] = typeof x === "boolean" ? false : null;
        Object.assign(row, { created_at: now() }, v);
        tab.push(row); out.push(row);
      }
    } else if (q.op === "update") {
      for (const r of tab) if (match(r)) { Object.assign(r, q.val); out.push(r); }
    } else if (q.op === "delete") {
      out = tab.filter(match);
      data[q.t] = tab.filter((r) => !match(r));
    }
    version++; saveData();
    return out.map((r) => ({ ...r }));
  }

  // ---------- Ersatz für sb.from(…) ----------
  class OQ {
    constructor(t) { this.t = t; this.op = "select"; this.filters = []; this.orders = []; this.cols = "*"; this.one = 0; this.lim = null; this.rng = null; this.head = false; this.count = false; this.ret = false; }
    select(cols, o) { if (this.op === "select") { this.cols = cols || "*"; this.head = !!(o && o.head); this.count = !!(o && o.count); } else this.ret = true; this.retCols = cols; return this; }
    insert(v, o) { this.op = "insert"; this.val = this.withIds(v); this.opts = o; return this; }
    upsert(v, o) { this.op = "upsert"; this.val = this.withIds(v); this.opts = o; return this; }
    update(v) { this.op = "update"; this.val = v; return this; }
    delete() { this.op = "delete"; return this; }
    withIds(v) { if (!UUID_TABLES.has(this.t)) return v; const add = (r) => (r && r.id == null ? { id: uuid(), ...r } : r); return Array.isArray(v) ? v.map(add) : add(v); }
    order(c, o) { this.orders.push([c, !(o && o.ascending === false)]); return this; }
    limit(n) { this.lim = n; return this; }
    range(a, b) { this.rng = [a, b]; return this; }
    maybeSingle() { this.one = 1; return this; }
    single() { this.one = 2; return this; }
    then(res, rej) { return this.run().then(res, rej); }
    catch(f) { return this.run().catch(f); }
    realQuery() {
      let q = real.from(this.t);
      if (this.op === "select") q = q.select(this.cols, this.head || this.count ? { count: "exact", head: this.head } : undefined);
      else if (this.op === "delete") q = q.delete();
      else q = q[this.op](this.val, this.opts);
      for (const [m, a] of this.filters) q = q[m](...a);
      if (this.op !== "select" && this.ret) q = q.select(this.retCols);
      for (const [c, asc] of this.orders) q = q.order(c, { ascending: asc });
      if (this.rng) q = q.range(...this.rng);
      if (this.lim != null) q = q.limit(this.lim);
      if (this.one === 1) q = q.maybeSingle(); else if (this.one === 2) q = q.single();
      return q;
    }
    async run() {
      if (!local()) {
        let r;
        try { r = await this.realQuery(); } catch (e) { r = { data: null, error: e }; }
        if (!(r.error && netErr(r.error)) || !loaded) {
          if (!r.error && this.op !== "select" && loaded) { applyWrite(this); scheduleRefresh(4000); }
          return r;
        }
        forcedOffline = true; emit();   // Netz weg → ab hier mit der Kopie weiterarbeiten
      }
      if (this.op === "select") return runSelect(this);
      const rows = applyWrite(this);
      outbox.push({ kind: "q", id: uuid(), at: now(), t: this.t, op: this.op, val: this.val, opts: this.opts || null, filters: this.filters });
      await saveOutbox(); emit();
      const d = this.ret ? (this.one ? rows[0] || null : rows) : null;
      return { data: d, error: null, status: 201 };
    }
  }
  for (const m of ["eq", "neq", "gt", "gte", "lt", "lte", "in", "is", "not", "match"]) OQ.prototype[m] = function (...a) { this.filters.push([m, a]); return this; };

  // ---------- Hochladen der Warteschlange ----------
  async function sync(manual = false) {
    if (!enabled || syncing) return api.status();
    if (!navigator.onLine) { if (manual) throw new Error("📴 Kein Internet – die Änderungen werden hochgeladen, sobald wieder eine Verbindung da ist."); return api.status(); }
    syncing = true; emit();
    let done = 0, wrote = false;
    try {
      const { data: s } = await real.auth.getSession();
      if (!s || !s.session) throw new Error("Bitte melde dich neu an – danach werden die gespeicherten Änderungen hochgeladen.");
      forcedOffline = false;
      while (outbox.length) {
        const it = outbox[0];
        let r;
        try {
          if (it.kind === "rpc") r = await real.rpc(it.name, it.args);
          else if (it.kind === "fn") r = await real.functions.invoke(it.name, { body: it.body });
          else {
            const q = new OQ(it.t); Object.assign(q, { op: it.op, val: it.val, opts: it.opts || undefined, filters: it.filters });
            r = await q.realQuery();
          }
        } catch (e) { r = { error: e }; }
        if (r && r.error && netErr(r.error)) { forcedOffline = true; break; }
        if (r && r.error && !(it.kind === "q" && it.op === "insert" && (r.error.code === "23505" || /duplicate key/i.test(r.error.message || "")))) {
          if (it.kind !== "fn") failed.push({ at: it.at, what: it.kind === "rpc" ? it.name : `${NAMES[it.t] || it.t} ${OP_NAMES[it.op] || it.op}`, msg: r.error.message || String(r.error) });
        } else { done++; if (it.kind !== "fn") wrote = true; }
        outbox.shift(); await saveOutbox(); emit();
      }
      if (!outbox.length) {
        lastSync = now(); await saveOutbox();
        if (wrote) real.rpc("backup_after_change").then(() => {}, () => {});
        await refresh(true);
      }
    } finally { syncing = false; emit(); }
    if (done || manual) try { window.dispatchEvent(new CustomEvent("fsp-synced", { detail: { done, manual, ...api.status() } })); } catch { /* egal */ }
    return api.status();
  }

  // ---------- Kopie vom Server holen ----------
  async function refresh(force = false) {
    if (!enabled || !real || isOffline() || outbox.length || syncing && !force) return false;
    if (!force && refreshedAt && Date.now() - Date.parse(refreshedAt) < 60000) return false;
    const next = {};
    try {
      for (const t of TABLES) {
        const all = [];
        for (let from = 0; ; from += 1000) {
          const { data: d, error } = await real.from(t).select("*").range(from, from + 999);
          if (error) { if (netErr(error)) throw error; break; }   // Tabelle fehlt o. Ä. → leer lassen
          all.push(...(d || []));
          if (!d || d.length < 1000) break;
        }
        next[t] = all;
      }
    } catch (e) { if (netErr(e)) { forcedOffline = true; emit(); } return false; }
    if (outbox.length) return false;   // in der Zwischenzeit offline geändert → nicht überschreiben
    data = next; version++; loaded = true; refreshedAt = now();
    saveData(); emit();
    return true;
  }
  function scheduleRefresh(ms) { clearTimeout(refreshTimer); refreshTimer = setTimeout(() => refresh(true), ms); }

  async function load(id) {
    uid = id;
    try {
      const [d, o] = await Promise.all([idbGet("data_" + id), idbGet("outbox_" + id)]);
      if (d) { data = d.data || {}; rpcCache = d.rpcCache || {}; refreshedAt = d.refreshedAt || null; loaded = true; version++; }
      if (o) { outbox = o.outbox || []; failed = o.failed || []; lastSync = o.lastSync || null; }
    } catch { /* kein IndexedDB → nur online */ }
  }
  async function enable(id) {
    if (enabled && uid === id) return;
    enabled = true;
    // iPhone/Android: das System bitten, die Kopie dauerhaft zu behalten (nicht nach ein paar Tagen löschen)
    try { if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {}); } catch { /* egal */ }
    await load(id);
    emit();
    if (outbox.length) sync(); else refresh();
  }

  // Gespeicherte Anmeldung lesen (ohne Netz kann Supabase das Zugangs-Token nicht erneuern)
  const storedSession = () => {
    try {
      const k = Object.keys(localStorage).find((x) => /^sb-.*-auth-token$/.test(x));
      const s = k && JSON.parse(localStorage.getItem(k));
      const sess = s && (s.currentSession || s);
      return sess && sess.user && localStorage.getItem(flagKey(sess.user.id)) === "1" ? sess : null;
    } catch { return null; }
  };

  const api = {
    wrap(client) {
      real = client;
      const auth = new Proxy(client.auth, { get(target, p) {
        if (p === "getSession") return async () => {
          let r; try { r = await target.getSession(); } catch (e) { r = { data: { session: null }, error: e }; }
          let s = r && r.data && r.data.session;
          if (!s && !navigator.onLine) { s = storedSession(); if (s) r = { data: { session: s }, error: null }; }
          if (s) { try { if (localStorage.getItem(flagKey(s.user.id)) === "1") await enable(s.user.id); } catch { /* egal */ } }
          return r;
        };
        if (p === "onAuthStateChange") return (cb) => target.onAuthStateChange((ev, session) => {
          if (!session && ev !== "SIGNED_OUT" && !navigator.onLine) { const s = storedSession(); if (s) return cb(ev, s); }
          return cb(ev, session);
        });
        const v = target[p]; return typeof v === "function" ? v.bind(target) : v;
      } });
      const rpc = (name, args = {}) => ({
        then(res, rej) { return api.rpc(name, args).then(res, rej); },
        catch(f) { return api.rpc(name, args).catch(f); },
      });
      const functions = { invoke: (name, o) => api.invoke(name, o) };
      return new Proxy(client, { get(target, p) {
        if (p === "from") return (t) => (enabled && loaded && (TABLES.includes(t) || UUID_TABLES.has(t)) ? new OQ(t) : target.from(t));
        if (p === "rpc") return (n, a) => (enabled ? rpc(n, a) : target.rpc(n, a));
        if (p === "functions") return enabled ? functions : target.functions;
        if (p === "auth") return auth;
        const v = target[p]; return typeof v === "function" ? v.bind(target) : v;
      } });
    },
    async rpc(name, args) {
      const key = name + ":" + JSON.stringify(args || {});
      if (!local()) {
        let r; try { r = await real.rpc(name, args); } catch (e) { r = { data: null, error: e }; }
        if (!(r.error && netErr(r.error)) || !loaded) {
          if (!r.error) { if (RPC_LOCAL[name]) { RPC_LOCAL[name](args || {}); version++; saveData(); scheduleRefresh(4000); } else { rpcCache[key] = r.data; saveData(); } }
          return r;
        }
        forcedOffline = true; emit();
      }
      if (RPC_SKIP.has(name)) return { data: null, error: null };
      if (RPC_LOCAL[name]) {
        const d = RPC_LOCAL[name](args || {}); version++; saveData();
        outbox.push({ kind: "rpc", id: uuid(), at: now(), name, args }); await saveOutbox(); emit();
        return { data: d ?? null, error: null };
      }
      if (key in rpcCache) return { data: rpcCache[key], error: null };
      return { data: null, error: { message: "📴 Offline – dafür brauchst du Internet." } };
    },
    async invoke(name, o) {
      const body = o && o.body;
      if (body && body.kind === "test" && local()) return { data: null, error: { message: "📴 Offline – die Test-Mitteilung geht nur mit Internet." } };
      if (!local()) {
        let r; try { r = await real.functions.invoke(name, o); } catch (e) { r = { data: null, error: e }; }
        if (!(r.error && netErr(r.error) && loaded)) return r;
        forcedOffline = true;
      }
      outbox.push({ kind: "fn", id: uuid(), at: now(), name, body }); await saveOutbox(); emit();
      return { data: { queued: true }, error: null };
    },
    // Von der App nach dem Laden der Einstellungen: Funktion an/aus (nur Fahrlehrer/innen)
    async configure(id, on) {
      try { if (on) localStorage.setItem(flagKey(id), "1"); else localStorage.removeItem(flagKey(id)); } catch { /* egal */ }
      if (on) return enable(id);
      if (enabled && outbox.length) return;   // erst alles hochladen, dann aus
      enabled = false; loaded = false; data = {}; rpcCache = {};
      idbDel("data_" + id).catch(() => {});
      emit();
    },
    sync: () => sync(true),
    clearFailed() { failed = []; saveOutbox(); emit(); },
    status: () => ({ enabled, loaded, offline: enabled && isOffline(), pending: outbox.length, syncing, failed: failed.slice(), lastSync, refreshedAt }),
    pendingCount: () => outbox.length,
  };
  window.fspOffline = api;

  window.addEventListener("online", () => { forcedOffline = false; emit(); setTimeout(() => (outbox.length ? sync() : refresh()), 1500); });
  window.addEventListener("offline", () => emit());
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible" && enabled && navigator.onLine) (outbox.length ? sync() : refresh()); });
  // Regelmäßig: hängende Änderungen erneut versuchen, Kopie auffrischen
  setInterval(() => {
    if (!enabled || !navigator.onLine || document.visibilityState !== "visible") return;
    if (outbox.length) sync(); else if (!refreshedAt || Date.now() - Date.parse(refreshedAt) > 5 * 60000) refresh(true);
  }, 30000);
})();
