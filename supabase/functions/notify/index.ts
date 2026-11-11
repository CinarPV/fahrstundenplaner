// Easy Fahrstundenplaner – Push-Mitteilungen (Supabase Edge Function „notify“)
// Secrets: VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT

import { createClient } from "npm:@supabase/supabase-js@2.45.4";
// @ts-types="npm:@types/web-push@3.6.4"
import webpush from "npm:web-push@3.6.7";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

// t = Wörter für den Fahrlehrer bzw. die Fahrlehrerin (aus der Anrede in den Einstellungen)
type Words = { Dein: string; deinem: string };
const teacherWords = (g?: string | null): Words =>
  g === "w" ? { Dein: "Deine Fahrlehrerin", deinem: "deiner Fahrlehrerin" } : { Dein: "Dein Fahrlehrer", deinem: "deinem Fahrlehrer" };
type Ctx = { name: string; when: string; meet: string; late: boolean; status: string; reason: string; t: Words; reply: string; lateS: number; lateT: number };
const reasonText = (c: Ctx) => (c.reason ? ` Grund: ${c.reason}` : "");
const NOT_HELD_TEXT: Record<string, (c: Ctx) => string> = {
  sick: (c) => `Deine Fahrstunde am ${c.when} ist wegen Krankheit abgesagt.`,
  cancelled_student: (c) => `Deine Fahrstunde am ${c.when} ist wie von dir gewünscht abgesagt.`,
  no_show: (c) => `Du warst zur Fahrstunde am ${c.when} nicht da. Sie ist ausgefallen.`,
};
const STUDENT_EVENTS: Record<string, (c: Ctx) => [string, string]> = {
  request: (c) => ["📥 Neue Anfrage", `${c.name} möchte am ${c.when} fahren.`],
  exception: (c) => ["⚠️ Ausnahme-Bitte", `${c.name} bittet um eine Ausnahme: ${c.when}.`],
  withdraw: (c) => ["↩️ Anfrage zurückgezogen", `${c.name} hat die Anfrage für ${c.when} zurückgezogen.`],
  cancel: (c) => ["❌ Fahrstunde abgesagt", `${c.name} hat ${c.when} abgesagt${c.late ? " – Fehlstunde" : ""}.`],
  accept: (c) => ["✅ Angebot angenommen", `${c.name} hat ${c.when} zugesagt.`],
  decline: (c) => ["🚫 Angebot abgelehnt", `${c.name} kann ${c.when} leider nicht.`],
  change_ok: (c) => ["✅ Änderung angenommen", `${c.name} ist mit der neuen Zeit für ${c.when} einverstanden.`],
  change_no: (c) => ["🚫 Änderung abgelehnt", `${c.name} bleibt bei der bisherigen Zeit (${c.when}).`],
  attest: (c) => ["📄 Attest hochgeladen", `${c.name} hat ein Attest für die Fahrstunde am ${c.when} hochgeladen – bitte in der App speichern.`],
  late: (c) => (c.lateS ? ["⏰ Verspätung", `${c.name} kommt ca. ${c.lateS} Min. später (Fahrstunde ${c.when}).`]
    : ["⏰ Doch pünktlich", `${c.name} kommt doch pünktlich (${c.when}).`]),
};
const TEACHER_EVENTS: Record<string, (c: Ctx) => [string, string]> = {
  confirmed: (c) => ["✅ Fahrstunde bestätigt", `${c.when}${c.meet ? ` · 📍 ${c.meet}` : ""}`],
  rejected: (c) => ["Anfrage abgelehnt", `Deine Anfrage für ${c.when} wurde leider abgelehnt.`],
  change: (c) => ["🔄 Terminänderung", `${c.t.Dein} möchte die Fahrstunde am ${c.when} ändern (Zeit oder Treffpunkt) – bitte zusagen oder ablehnen.`],
  offered: (c) => ["📨 Neues Angebot", `${c.t.Dein} bietet dir ${c.when} an – bitte zusagen oder absagen.`],
  assigned: (c) => ["📅 Neue Fahrstunde", `${c.when} wurde für dich eingetragen${c.meet ? ` · 📍 ${c.meet}` : ""}.`],
  cancelled_teacher: (c) => ["❌ Fahrstunde abgesagt", `${c.t.Dein} hat die Fahrstunde am ${c.when} abgesagt.${reasonText(c)}`],
  moved: (c) => ["🔄 Fahrstunde geändert", `${c.t.Dein} hat deine Fahrstunde geändert. Neu: ${c.when}${c.meet ? ` · 📍 ${c.meet}` : ""}`],
  note: (c) => ["📝 Hinweis zu deiner Fahrstunde", `${c.when}: ${c.reply}`],
  late_teacher: (c) => (c.lateT ? ["⏰ Kleine Verspätung", `${c.t.Dein} kommt ca. ${c.lateT} Min. später zur Fahrstunde am ${c.when}.`]
    : ["⏰ Doch pünktlich", `${c.t.Dein} ist doch pünktlich zur Fahrstunde am ${c.when}.`]),
  not_held: (c) => ["❌ Fahrstunde abgesagt", `${(NOT_HELD_TEXT[c.status] ?? ((x: Ctx) => `Deine Fahrstunde am ${x.when} findet nicht statt.`))(c)}${c.late ? " Das wird als Fehlstunde berechnet." : ""}${reasonText(c)}`],
};

const fmtWhen = (iso: string) =>
  new Date(iso).toLocaleString("de-DE", {
    timeZone: "Europe/Berlin", weekday: "short", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit",
  }) + " Uhr";
// Name des Schülers bzw. der Schülerin; ohne Namen je nach Anrede „Eine Schülerin“ / „Ein Schüler“
const fullName = (p: { first_name?: string; last_name?: string; gender?: string } | null) =>
  `${p?.first_name ?? ""} ${p?.last_name ?? ""}`.trim() || (p?.gender === "w" ? "Eine Schülerin" : "Ein Schüler");

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const url = Deno.env.get("SUPABASE_URL")!;
    const userClient = createClient(url, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } },
    });
    const admin = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { kind, ids, event, text } = await req.json();
    // „evening“ kommt vom nächtlichen Zeitplan (pg_cron) mit geheimem Schlüssel aus der Datenbank – sonst muss jemand angemeldet sein
    let user: { id: string } = { id: "" };
    if (kind === "evening" || kind === "hour") {
      const { data: sec } = await admin.from("app_secrets").select("value").eq("name", "cron").maybeSingle();
      if (!sec || !sec.value || req.headers.get("x-cron-secret") !== sec.value) return json({ error: "Nicht erlaubt" }, 403);
    } else {
      const { data: { user: u } } = await userClient.auth.getUser();
      if (!u) return json({ error: "Nicht angemeldet" }, 401);
      user = u;
    }
    webpush.setVapidDetails(Deno.env.get("VAPID_SUBJECT")!, Deno.env.get("VAPID_PUBLIC_KEY")!, Deno.env.get("VAPID_PRIVATE_KEY")!);

    const messages: { to: string; title: string; body: string }[] = [];
    // Einstellungen je Fahrlehrer nur einmal laden (Treffpunkt, Anrede)
    const settingsCache = new Map<string, { meeting_point?: string; teacher_gender?: string; [k: string]: unknown } | null>();
    const teacherSettings = async (id: string) => {
      if (!settingsCache.has(id)) {
        const { data } = await admin.from("settings").select("*").eq("teacher_id", id).maybeSingle();
        settingsCache.set(id, data ?? null);
      }
      return settingsCache.get(id);
    };

    if (kind === "evening") {
      // Vorabend-Erinnerung: nur Fahrlehrer, die sie unter Einstellungen → Funktionen eingeschaltet haben
      const { data: sts } = await admin.from("settings").select("teacher_id,features,meeting_point,teacher_gender");
      const on = (sts ?? []).filter((x) => (x.features as Record<string, unknown> | null)?.evening_reminder === true);
      if (on.length) {
        const day = (d: string | number) => new Date(d).toLocaleDateString("sv-SE", { timeZone: "Europe/Berlin" });
        const tomorrow = day(Date.now() + 86400000);
        const { data: bk } = await admin.from("bookings")
          .select("student_id,meeting_point,slots!inner(starts_at,teacher_id,meeting_point)")
          .eq("status", "confirmed").is("actual_minutes", null)
          .in("slots.teacher_id", on.map((x) => x.teacher_id))
          .gte("slots.starts_at", new Date().toISOString()).lt("slots.starts_at", new Date(Date.now() + 2 * 86400000).toISOString());
        for (const b of bk ?? []) {
          // deno-lint-ignore no-explicit-any
          const sl: any = b.slots;
          if (!sl || day(sl.starts_at) !== tomorrow) continue;
          const st = on.find((x) => x.teacher_id === sl.teacher_id);
          const meet = b.meeting_point || sl.meeting_point || st?.meeting_point || "";
          const t = teacherWords(st?.teacher_gender as string | undefined);
          messages.push({ to: b.student_id, title: "🚗 Morgen Fahrstunde", body: `${fmtWhen(sl.starts_at)}${meet ? ` · 📍 ${meet}` : ""} – ${t.Dein} freut sich auf dich.` });
        }
      }
    } else if (kind === "hour") {
      // Erinnerung ca. 1 Std. vorher: nur Fahrlehrer, die sie unter Einstellungen → Funktionen eingeschaltet haben
      const { data: sts } = await admin.from("settings").select("teacher_id,features,meeting_point,teacher_gender");
      const on = (sts ?? []).filter((x) => (x.features as Record<string, unknown> | null)?.hour_reminder === true);
      if (on.length) {
        const { data: bk } = await admin.from("bookings")
          .select("id,student_id,meeting_point,slots!inner(starts_at,teacher_id,meeting_point)")
          .eq("status", "confirmed").is("actual_minutes", null).eq("hour_reminded", false)
          .in("slots.teacher_id", on.map((x) => x.teacher_id))
          .gte("slots.starts_at", new Date(Date.now() + 40 * 60000).toISOString()).lt("slots.starts_at", new Date(Date.now() + 75 * 60000).toISOString());
        for (const b of bk ?? []) {
          // deno-lint-ignore no-explicit-any
          const sl: any = b.slots;
          const st = on.find((x) => x.teacher_id === sl.teacher_id);
          const meet = b.meeting_point || sl.meeting_point || st?.meeting_point || "";
          const time = new Date(sl.starts_at).toLocaleTimeString("de-DE", { timeZone: "Europe/Berlin", hour: "2-digit", minute: "2-digit" });
          messages.push({ to: b.student_id, title: "🚗 Gleich Fahrstunde", body: `Heute um ${time} Uhr${meet ? ` · 📍 ${meet}` : ""}. Bis gleich!` });
          await admin.from("bookings").update({ hour_reminded: true }).eq("id", b.id);
        }
      }
    } else if (kind === "test") {
      messages.push({ to: user.id, title: "🔔 Mitteilungen sind an", body: "So sehen Mitteilungen vom Easy Fahrstundenplaner aus." });
    } else if (kind === "booking" && Array.isArray(ids) && ids.length && ids.length <= 60) {
      const { data: rows } = await admin.from("bookings")
        .select("id,student_id,status,cancel_reason,late_cancel,meeting_point,admin_reply,late_student,late_teacher,profiles(*),slots(starts_at,teacher_id,meeting_point)")
        .in("id", ids);
      for (const b of rows ?? []) {
        // deno-lint-ignore no-explicit-any
        const slot: any = b.slots, student: any = b.profiles;
        if (!slot) continue;
        const st = await teacherSettings(slot.teacher_id);
        const meet = b.meeting_point || slot.meeting_point || st?.meeting_point || "";
        const ctx: Ctx = { name: fullName(student), when: fmtWhen(slot.starts_at), meet, late: !!b.late_cancel, status: b.status ?? "",
          reason: (b.cancel_reason ?? "").trim(), t: teacherWords(st?.teacher_gender), reply: (b.admin_reply ?? "").trim(),
          lateS: b.late_student ?? 0, lateT: b.late_teacher ?? 0 };
        if (event === "note" && !ctx.reply) continue;
        if (user.id === b.student_id && STUDENT_EVENTS[event]) {
          const [title, body] = STUDENT_EVENTS[event](ctx);
          messages.push({ to: slot.teacher_id, title, body });
        } else if (user.id === slot.teacher_id && TEACHER_EVENTS[event]) {
          const [title, body] = TEACHER_EVENTS[event](ctx);
          messages.push({ to: b.student_id, title, body });
        }
      }
    } else if (kind === "broadcast" && Array.isArray(ids) && ids.length && ids.length <= 500) {
      const msg = String(text ?? "").trim().slice(0, 400);
      if (msg) {
        const w = teacherWords((await teacherSettings(user.id))?.teacher_gender);
        const { data: own } = await admin.from("profiles").select("id").in("id", ids).eq("teacher_id", user.id).eq("role", "student");
        for (const s of own ?? []) messages.push({ to: s.id, title: `📢 Nachricht von ${w.deinem}`, body: msg });
      }
    } else if ((kind === "slots_new" || kind === "slots_remind" || kind === "slot_freed") && Array.isArray(ids) && ids.length && ids.length <= 300) {
      // Freie Termine an alle aktiven Schüler des Fahrlehrers melden (nur wenn der Fahrlehrer das eingeschaltet hat)
      const nowIso = new Date().toISOString();
      let slotRows: { id: string; starts_at: string; teacher_id: string }[] = [];
      let skipStudent = "";
      if (kind === "slot_freed") {
        const { data: bk } = await admin.from("bookings").select("id,student_id,status,slot_id,slots(id,starts_at,teacher_id)").in("id", ids);
        for (const b of bk ?? []) {
          // deno-lint-ignore no-explicit-any
          const sl: any = b.slots;
          if (!sl || ["requested", "offered", "confirmed"].includes(b.status)) continue;
          if (user.id !== b.student_id && user.id !== sl.teacher_id) continue;   // nur Beteiligte dürfen auslösen
          slotRows.push(sl); skipStudent = b.student_id;
        }
      } else {
        const { data: sl } = await admin.from("slots").select("id,starts_at,teacher_id").in("id", ids).eq("teacher_id", user.id);
        slotRows = sl ?? [];
      }
      slotRows = slotRows.filter((x) => x.starts_at > nowIso);
      const teacherId = slotRows[0]?.teacher_id;
      const st = teacherId ? await teacherSettings(teacherId) as Record<string, unknown> | null : null;
      const flag = kind === "slots_new" ? "notify_new_slots" : kind === "slot_freed" ? "notify_freed" : "notify_button";
      // „Alle erinnern“ (slots_remind) drückt der Fahrlehrer selbst – dafür keine Einstellung nötig
      const toAll = kind === "slots_remind" || !!st?.[flag];
      if (teacherId && st && !st.booking_closed) {
        // wirklich noch frei? (keine offene Anfrage/Buchung) und kein gesperrter Tag
        const { data: act } = await admin.from("bookings").select("slot_id").in("slot_id", slotRows.map((x) => x.id)).in("status", ["requested", "offered", "confirmed"]);
        const taken = new Set((act ?? []).map((x) => x.slot_id));
        const { data: off } = await admin.from("time_off").select("from_day,to_day").eq("teacher_id", teacherId);
        const day = (iso: string) => new Date(iso).toLocaleDateString("sv-SE", { timeZone: "Europe/Berlin" });
        const free = slotRows.filter((x) => !taken.has(x.id) && !(off ?? []).some((o) => day(x.starts_at) >= o.from_day && day(x.starts_at) <= o.to_day))
          .sort((a, b) => a.starts_at.localeCompare(b.starts_at));
        if (free.length) {
          // aktive Schüler: freigeschaltet, nicht bestanden, Zugang nicht abgelaufen
          const { data: studs } = await admin.from("profiles").select("id,valid_until").eq("teacher_id", teacherId).eq("role", "student").eq("status", "active");
          const { data: passed } = await admin.from("exams").select("student_id").eq("kind", "praxis").eq("result", "passed");
          const passedIds = new Set((passed ?? []).map((x) => x.student_id));
          const cut = new Date(Date.now() - 28 * 86400000).toISOString().slice(0, 10);
          const okIds = new Set((studs ?? []).filter((x) => !passedIds.has(x.id) && x.id !== skipStudent && !(x.valid_until && x.valid_until < cut)).map((x) => x.id));
          const to = toAll ? [...okIds] : [];
          // Warteliste: wer sich für einen dieser Tage eintragen hat, bekommt immer Bescheid (danach wird der Eintrag gelöscht)
          const freeDays = [...new Set(free.map((x) => day(x.starts_at)))];
          const { data: wl } = await admin.from("waitlist").select("id,student_id,day").eq("teacher_id", teacherId).in("day", freeDays);
          for (const w of wl ?? []) {
            if (!okIds.has(w.student_id)) continue;
            const f = free.find((x) => day(x.starts_at) === w.day)!;
            messages.push({ to: w.student_id, title: "⏳ Dein Wartelisten-Tag: Termin frei!", body: `${fmtWhen(f.starts_at)} ist frei – schnell in der App anfragen.` });
            await admin.from("waitlist").delete().eq("id", w.id);
          }
          const wlIds = new Set((wl ?? []).map((w) => w.student_id));
          const [title, body] = kind === "slots_new"
            ? (free.length === 1 ? ["🆕 Neuer Termin frei", `${fmtWhen(free[0].starts_at)} – jetzt in der App anfragen.`]
              : ["🆕 Neue Termine frei", `${free.length} neue Termine (${fmtWhen(free[0].starts_at)} bis ${fmtWhen(free[free.length - 1].starts_at)}) – jetzt in der App anfragen.`])
            : kind === "slot_freed" ? ["🟢 Termin wieder frei", `${fmtWhen(free[0].starts_at)} ist wieder frei – jetzt in der App anfragen.`]
            : free.length === 1 ? ["📣 Noch frei", `${fmtWhen(free[0].starts_at)} ist noch frei – jetzt in der App anfragen.`]
            : ["📣 Noch Fahrstunden frei", `${free.length} freie Termine (${fmtWhen(free[0].starts_at)} bis ${fmtWhen(free[free.length - 1].starts_at)}) – jetzt in der App anfragen.`];
          for (const id of to) if (!wlIds.has(id)) messages.push({ to: id, title, body });
        }
      }
    } else if (kind === "transferred" && Array.isArray(ids) && ids.length === 1) {
      // Übergabe ausgeführt: auslösen darf der bisherige oder (nach Bestätigung) der neue Fahrlehrer
      const { data: p } = await admin.from("profiles").select("*").eq("id", ids[0]).maybeSingle();
      if (p && p.role === "student" && (p.transferred_from === user.id || p.teacher_id === user.id)) {
        messages.push({ to: p.id, title: "🔀 Neue/r Fahrlehrer/in", body: `Ab sofort ist ${p.transfer_to_name || "ein/e neue/r Fahrlehrer/in"} für deine Fahrstunden zuständig. Bitte öffne die App und bestätige es.` });
        if (p.teacher_id === user.id && p.transferred_from) {
          messages.push({ to: p.transferred_from, title: "✅ Übergabe bestätigt", body: `${p.transfer_to_name || "Dein/e Kollege/Kollegin"} hat ${fullName(p)} übernommen.` });
        }
      }
    } else if (kind === "transfer_request" && Array.isArray(ids) && ids.length === 1) {
      // Übergabe-Anfrage: nur der aktuelle Fahrlehrer darf auslösen → Mitteilung an den gewünschten neuen Fahrlehrer
      const { data: p } = await admin.from("profiles").select("*").eq("id", ids[0]).maybeSingle();
      if (p && p.role === "student" && p.teacher_id === user.id && p.transfer_request_to) {
        const from = (await teacherSettings(user.id))?.display_name as string | undefined;
        messages.push({ to: p.transfer_request_to, title: "🔀 Übergabe-Anfrage", body: `${from || "Ein/e Kollege/Kollegin"} möchte ${fullName(p)} an dich übergeben – bitte in der App unter „Zu erledigen“ bestätigen.` });
      }
    } else if (kind === "registered") {
      // Neue Registrierung: dem Fahrlehrer Bescheid geben (nur solange der Schüler noch auf Freischaltung wartet)
      const { data: p } = await admin.from("profiles").select("*").eq("id", user.id).maybeSingle();
      if (p && p.role === "student" && p.status === "pending" && p.teacher_id) {
        messages.push({ to: p.teacher_id, title: "🆕 Neue Anmeldung", body: `${fullName(p)} hat sich registriert und wartet auf Freischaltung.` });
      }
    } else if (kind === "exam" && Array.isArray(ids) && ids.length === 1) {
      const { data: e } = await admin.from("exams").select("id,kind,exam_at,meeting_point,student_id,profiles(teacher_id)").eq("id", ids[0]).maybeSingle();
      // deno-lint-ignore no-explicit-any
      if (e && (e.profiles as any)?.teacher_id === user.id) {
        const schalt = e.kind === "schalt";
        const what = schalt ? "Schaltkompetenz-Test" : "Praktische Prüfung";
        if (event === "passed") {
          messages.push({ to: e.student_id, title: "🎉 Herzlichen Glückwunsch!", body: schalt ? "Du hast den Schaltkompetenz-Test bestanden!" : "Du hast die Führerscheinprüfung bestanden! Allzeit gute Fahrt! 🚗" });
        } else {
          messages.push({ to: e.student_id, title: event === "exam_changed" ? (schalt ? "🔄 Schalt-Test geändert" : "🔄 Prüfungstermin geändert") : schalt ? "🏁 Schaltkompetenz-Test" : "🎓 Prüfungstermin",
            body: `${what}${event === "exam_changed" ? " – neu" : ""}: ${fmtWhen(e.exam_at)}${e.meeting_point ? ` · 📍 ${e.meeting_point}` : ""}` });
        }
      }
    }

    if (kind === "test") await new Promise((r) => setTimeout(r, 10000));
    let sent = 0;
    for (const m of messages) {
      const { data: subs } = await admin.from("push_subscriptions").select("id,endpoint,p256dh,auth").eq("user_id", m.to);
      for (const s of subs ?? []) {
        try {
          await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
            JSON.stringify({ title: m.title, body: m.body }), { TTL: 60 * 60 * 24 });
          sent++;
        } catch (err) {
          const code = (err as { statusCode?: number }).statusCode;
          if (code === 404 || code === 410) await admin.from("push_subscriptions").delete().eq("id", s.id);
        }
      }
    }
    return json({ sent });
  } catch (err) {
    return json({ error: String((err as Error).message ?? err) }, 500);
  }
});
