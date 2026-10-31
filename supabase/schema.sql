-- =====================================================================
-- Fahrstundenplaner – Datenbank-Schema für Supabase
-- Einmal komplett im Supabase "SQL Editor" ausführen (Run).
--
-- Rollen:
--   Haupt-Admin  = Fahrlehrer mit is_owner = true; legt weitere Fahrlehrer an
--   Fahrlehrer   = role 'teacher'; sieht NUR eigene Schüler, Termine, Einstellungen
--   Schüler      = role 'student'; gehört genau einem Fahrlehrer (teacher_id)
-- =====================================================================

-- ---------- Tabellen -------------------------------------------------

create table if not exists public.profiles (
  id             uuid primary key references auth.users(id) on delete cascade,
  first_name     text not null default '',
  last_name      text not null default '',
  email          text,
  license_class  text check (license_class in ('B','B197','B Automatik')),
  needs_glasses  boolean not null default false,   -- Sehhilfe (Brille/Kontaktlinsen)
  is_conversion  boolean not null default false,   -- Umschreiber (ausländischer Führerschein)
  phone          text check (char_length(phone) <= 30),  -- für WhatsApp-Nachrichten
  max_open       int check (max_open between 0 and 50),  -- eigene Höchstzahl: NULL = Standard, 0 = unbegrenzt
  role           text not null default 'student' check (role in ('student','teacher')),
  is_owner       boolean not null default false,   -- Haupt-Admin
  must_change_password boolean not null default false,  -- vom Haupt-Admin vergebenes Passwort → selbst neu festlegen
  terms_accepted_at timestamptz,                    -- Zustimmung zu Nutzungsbedingungen/Datenschutz bei der Registrierung
  -- pending = wartet auf Freischaltung, active = freigeschaltet, blocked = gesperrt
  status         text not null default 'pending' check (status in ('pending','active','blocked')),
  teacher_id     uuid references public.profiles(id) on delete cascade,  -- Schüler → sein Fahrlehrer
  slug           text unique check (slug ~ '^[a-z0-9-]{2,30}$'),          -- Fahrlehrer: Kürzel für den Schüler-Link
  created_at     timestamptz not null default now()
);
create index if not exists profiles_teacher_idx on public.profiles (teacher_id);

-- Einstellungen: eine Zeile pro Fahrlehrer
create table if not exists public.settings (
  teacher_id        uuid primary key references public.profiles(id) on delete cascade,
  display_name      text not null default 'Fahrlehrer' check (char_length(display_name) <= 60),
  default_duration  int not null default 90 check (default_duration between 5 and 600),
  max_open          int not null default 3 check (max_open between 0 and 50),  -- max. Termine pro Schüler, 0 = unbegrenzt
  admin_phone       text check (char_length(admin_phone) <= 30)
);

-- Termine eines Fahrlehrers
create table if not exists public.slots (
  id            uuid primary key default gen_random_uuid(),
  teacher_id    uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  starts_at     timestamptz not null,
  duration_min  int not null check (duration_min between 5 and 600),
  created_at    timestamptz not null default now()
);
create index if not exists slots_teacher_start_idx on public.slots (teacher_id, starts_at);

-- Anfragen / Buchungen eines Schülers für einen Termin
create table if not exists public.bookings (
  id              uuid primary key default gen_random_uuid(),
  slot_id         uuid not null references public.slots(id) on delete cascade,
  student_id      uuid not null references public.profiles(id) on delete cascade,
  status          text not null default 'requested'
                  -- requested  = angefragt, wartet auf Bestätigung
                  -- confirmed  = bestätigt (verbindlich)
                  -- rejected   = Anfrage vom Fahrlehrer abgelehnt
                  -- cancelled  = unbestätigte Anfrage vom Schüler zurückgezogen
                  -- offered    = vom Fahrlehrer angeboten, wartet auf Zusage des Schülers
                  -- declined   = Angebot vom Schüler abgelehnt
                  -- sick / cancelled_student / cancelled_teacher = Fahrstunde nicht zustande gekommen
                  check (status in ('requested','confirmed','rejected','cancelled','offered','declined',
                                    'sick','cancelled_student','cancelled_teacher')),
  cancel_reason   text check (char_length(cancel_reason) <= 300),
  late_cancel     boolean not null default false,  -- Fehlstunde (kostenpflichtig)
  lesson_type     text not null default 'normal'
                  check (lesson_type in ('normal','ueberland','autobahn','nacht')),  -- Sonderfahrten
  student_note    text check (char_length(student_note) <= 300),
  admin_reply     text check (char_length(admin_reply) <= 1000),
  actual_minutes  int check (actual_minutes between 0 and 1000),
  created_at      timestamptz not null default now(),
  decided_at      timestamptz
);
-- Pro Termin höchstens EINE offene, angebotene oder bestätigte Buchung
create unique index if not exists bookings_one_active_per_slot
  on public.bookings (slot_id) where status in ('requested','confirmed','offered');
create index if not exists bookings_student_idx on public.bookings (student_id);

-- Treffpunkte: Standard + weitere (eine pro Zeile) je Fahrlehrer; pro Fahrstunde optional abweichend
alter table public.settings add column if not exists meeting_point  text check (char_length(meeting_point) <= 200);
alter table public.settings add column if not exists meeting_points text check (char_length(meeting_points) <= 2000);
alter table public.bookings add column if not exists meeting_point  text check (char_length(meeting_point) <= 200);
alter table public.slots    add column if not exists meeting_point  text check (char_length(meeting_point) <= 200);
-- Angeheftete Uhrzeiten beim Anlegen, z. B. "08:00,09:45,11:30"
alter table public.settings add column if not exists time_presets   text check (char_length(time_presets) <= 400);
-- Kontrolle: wann die Fahrstunde ins Fahrschulsystem übertragen wurde (NULL = noch nicht)
alter table public.bookings add column if not exists transferred_at timestamptz;

-- Prüfungen (Theorie/Praxis): Termin + Ergebnis; bei „nicht bestanden“ folgt ein neuer Termin
create table if not exists public.exams (
  id          uuid primary key default gen_random_uuid(),
  student_id  uuid not null references public.profiles(id) on delete cascade,
  kind        text not null default 'praxis' check (kind in ('theorie','praxis')),
  exam_at     timestamptz not null,
  result      text check (result in ('passed','failed')),   -- NULL = noch offen
  note        text check (char_length(note) <= 300),
  created_at  timestamptz not null default now()
);
create index if not exists exams_student_idx on public.exams (student_id, exam_at);

-- Ausbildungsthemen (eigene Formulierung, angelehnt an den gesetzlichen Ausbildungsplan).
-- teacher_id NULL = Standardthemen für alle; später können Fahrlehrer eigene Themen/Strecken ergänzen.
create table if not exists public.training_topics (
  id          text primary key,
  teacher_id  uuid references public.profiles(id) on delete cascade,
  stage       text not null check (stage in ('grund','aufbau','leistung','grundfahr','sonder','reife','eigene')),
  sort        int not null default 0,
  title       text not null check (char_length(title) <= 120)
);
insert into public.training_topics (id, stage, sort, title) values
  ('g01', 'grund', 1, 'Einsteigen, Sitz, Spiegel und Lenkrad einstellen'),
  ('g02', 'grund', 2, 'Bedienelemente und Kontrollleuchten'),
  ('g03', 'grund', 3, 'Motor starten, anfahren und anhalten'),
  ('g04', 'grund', 4, 'Schalten bzw. Automatik richtig bedienen'),
  ('g05', 'grund', 5, 'Lenkhaltung und Lenktechnik'),
  ('g06', 'grund', 6, 'Dosiert und zielgenau bremsen'),
  ('g07', 'grund', 7, 'Anfahren und Halten an Steigung und Gefälle'),
  ('g08', 'grund', 8, 'Geradeaus rückwärtsfahren'),
  ('g09', 'grund', 9, 'Richtige Fahrbahn- und Fahrstreifenbenutzung'),
  ('a01', 'aufbau', 10, 'Angepasste Geschwindigkeit und Rollen'),
  ('a02', 'aufbau', 11, 'Abstand nach vorne und zur Seite'),
  ('a03', 'aufbau', 12, 'Beobachten: Spiegel und Schulterblick'),
  ('a04', 'aufbau', 13, 'Vorfahrt und Vorrang'),
  ('a05', 'aufbau', 14, 'Verkehrszeichen, Markierungen und Ampeln'),
  ('a06', 'aufbau', 15, 'Ein- und Ausfahren (Grundstücke, Parkplätze)'),
  ('a07', 'aufbau', 16, 'Fahrstreifenwechsel'),
  ('a08', 'aufbau', 17, 'Rechts abbiegen'),
  ('a09', 'aufbau', 18, 'Links abbiegen'),
  ('a10', 'aufbau', 19, 'Kreisverkehr'),
  ('l01', 'leistung', 20, 'Kreuzungen und Einmündungen sicher bewältigen'),
  ('l02', 'leistung', 21, 'Fußgänger, Radfahrer, Schulwege und Haltestellen'),
  ('l03', 'leistung', 22, 'Engstellen, Hindernisse, Vorbeifahren und Überholen'),
  ('l04', 'leistung', 23, 'Bahnübergänge'),
  ('l05', 'leistung', 24, 'Verkehrsberuhigte Bereiche und Tempo-30-Zonen'),
  ('l06', 'leistung', 25, 'Vorausschauend und partnerschaftlich fahren'),
  ('l07', 'leistung', 26, 'Gefahren erkennen und richtig reagieren'),
  ('l08', 'leistung', 27, 'Umweltschonend und energiesparend fahren'),
  ('f01', 'grundfahr', 28, 'Rückwärts um eine Ecke'),
  ('f02', 'grundfahr', 29, 'Rückwärts längs einparken'),
  ('f03', 'grundfahr', 30, 'Rückwärts quer einparken'),
  ('f04', 'grundfahr', 31, 'Vorwärts quer einparken'),
  ('f05', 'grundfahr', 32, 'Umkehren (Wenden)'),
  ('f06', 'grundfahr', 33, 'Gefahrbremsung'),
  ('s01', 'sonder', 34, 'Überlandfahrt'),
  ('s02', 'sonder', 35, 'Autobahnfahrt'),
  ('s03', 'sonder', 36, 'Fahrt bei Dunkelheit'),
  ('r01', 'reife', 37, 'Fahrzeugtechnik und Abfahrtkontrolle'),
  ('r02', 'reife', 38, 'Selbstständig fahren ohne Hilfestellung'),
  ('r03', 'reife', 39, 'Testfahrt unter Prüfungsbedingungen'),
  ('r04', 'reife', 40, 'Prüfungsreife erreicht')
on conflict (id) do update set stage = excluded.stage, sort = excluded.sort, title = excluded.title;

-- Ausbildungsstand: pro Schüler und Thema eine Stufe (1 = eingeführt, 2 = geübt, 3 = sicher)
create table if not exists public.training_progress (
  student_id  uuid not null references public.profiles(id) on delete cascade,
  topic_id    text not null references public.training_topics(id) on delete cascade,
  level       smallint not null check (level between 1 and 3),
  updated_at  timestamptz not null default now(),
  primary key (student_id, topic_id)
);

-- ---------- Hilfsfunktionen ------------------------------------------

-- Aktiver Fahrlehrer?
create or replace function public.is_teacher()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from profiles where id = auth.uid() and role = 'teacher' and status = 'active');
$$;

-- Haupt-Admin?
create or replace function public.is_owner()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from profiles where id = auth.uid() and is_owner and status = 'active');
$$;

-- Zu welchem Fahrlehrer gehöre ich? (Fahrlehrer: ich selbst)
create or replace function public.my_teacher_id()
returns uuid language sql stable security definer set search_path = public as $$
  select case when role = 'teacher' then id else teacher_id end from profiles where id = auth.uid();
$$;

-- Freigeschaltet = aktiver Fahrlehrer oder aktiver Schüler eines aktiven Fahrlehrers
create or replace function public.is_active()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from profiles p
    where p.id = auth.uid() and p.status = 'active'
      and (p.role = 'teacher'
           or exists (select 1 from profiles t where t.id = p.teacher_id and t.role = 'teacher' and t.status = 'active')));
$$;

-- Hilfen für die Zugriffsregeln (ohne sich gegenseitig auszulösen)
create or replace function public.slot_teacher(p_slot uuid)
returns uuid language sql stable security definer set search_path = public as $$
  select teacher_id from slots where id = p_slot;
$$;
create or replace function public.student_teacher(p_student uuid)
returns uuid language sql stable security definer set search_path = public as $$
  select teacher_id from profiles where id = p_student;
$$;
create or replace function public.has_own_booking(p_slot uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from bookings where slot_id = p_slot and student_id = auth.uid());
$$;

-- Neues Profil automatisch anlegen, wenn sich jemand registriert.
-- Schüler werden über das Link-Kürzel (Metadaten "teacher") ihrem Fahrlehrer zugeordnet.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_teacher uuid;
begin
  select id into v_teacher from profiles
  where slug = lower(trim(coalesce(new.raw_user_meta_data->>'teacher', ''))) and role = 'teacher' and status = 'active';
  insert into profiles (id, email, first_name, last_name, license_class, needs_glasses, is_conversion, phone, teacher_id, terms_accepted_at)
  values (
    new.id,
    new.email,
    coalesce(trim(new.raw_user_meta_data->>'first_name'), ''),
    coalesce(trim(new.raw_user_meta_data->>'last_name'), ''),
    case when new.raw_user_meta_data->>'license_class' in ('B','B197','B Automatik')
         then new.raw_user_meta_data->>'license_class' end,
    coalesce((new.raw_user_meta_data->>'needs_glasses')::boolean, false),
    coalesce((new.raw_user_meta_data->>'is_conversion')::boolean, false),
    nullif(left(trim(coalesce(new.raw_user_meta_data->>'phone', '')), 30), ''),
    v_teacher,
    case when coalesce((new.raw_user_meta_data->>'accepted_terms')::boolean, false) then now() end
  );
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Sich selbst zum Haupt-Admin machen: nach der eigenen Registrierung im SQL Editor ausführen:
--   select public.make_owner('deine@email.de', 'kuersat');     -- 2. Wert = Kürzel für deinen Schüler-Link
create or replace function public.make_owner(p_email text, p_slug text)
returns text language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_first text;
begin
  select id into v_id from auth.users where lower(email) = lower(p_email);
  if v_id is null then
    return 'Kein Benutzer mit dieser E-Mail gefunden – erst in der App registrieren.';
  end if;
  update profiles set role = 'teacher', is_owner = true, status = 'active', teacher_id = null,
         slug = lower(trim(p_slug))
  where id = v_id returning first_name into v_first;
  insert into settings (teacher_id, display_name) values (v_id, coalesce(nullif(v_first, ''), 'Fahrlehrer'))
  on conflict (teacher_id) do nothing;
  return 'OK – ' || p_email || ' ist jetzt Haupt-Admin. Schüler-Link-Kürzel: ' || lower(trim(p_slug));
end $$;
revoke execute on function public.make_owner(text, text) from public, anon, authenticated;

-- ---------- Funktionen für den Haupt-Admin ----------------------------

-- Frisch registriertes Konto zum Fahrlehrer machen (die App legt das Konto vorher mit E-Mail + Passwort an)
create or replace function public.create_teacher(p_id uuid, p_slug text, p_first text, p_last text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not is_owner() then raise exception 'Nur der Haupt-Admin darf Fahrlehrer anlegen'; end if;
  if lower(trim(p_slug)) !~ '^[a-z0-9-]{2,30}$' then
    raise exception 'Link-Kürzel: nur Kleinbuchstaben, Zahlen und Bindestrich (2–30 Zeichen)';
  end if;
  if exists (select 1 from profiles where slug = lower(trim(p_slug)) and id <> p_id) then
    raise exception 'Dieses Link-Kürzel ist schon vergeben';
  end if;
  if exists (select 1 from bookings where student_id = p_id) then
    raise exception 'Dieses Konto ist bereits als Schüler aktiv';
  end if;
  update profiles set role = 'teacher', status = 'active', teacher_id = null, is_owner = false,
         slug = lower(trim(p_slug)), first_name = trim(p_first), last_name = trim(p_last),
         must_change_password = true
  where id = p_id;
  if not found then raise exception 'Konto nicht gefunden'; end if;
  insert into settings (teacher_id, display_name) values (p_id, trim(p_first))
  on conflict (teacher_id) do update set display_name = excluded.display_name;
end $$;

-- Fahrlehrer sperren / wieder freischalten
create or replace function public.set_teacher_status(p_id uuid, p_status text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not is_owner() then raise exception 'Nur der Haupt-Admin'; end if;
  if p_id = auth.uid() then raise exception 'Du kannst dich nicht selbst sperren'; end if;
  if p_status not in ('active','blocked') then raise exception 'Ungültiger Status'; end if;
  update profiles set status = p_status where id = p_id and role = 'teacher';
end $$;

-- Fahrlehrer endgültig löschen – mit ALLEN seinen Schülern, Terminen und Buchungen
create or replace function public.delete_teacher(p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not is_owner() then raise exception 'Nur der Haupt-Admin'; end if;
  if p_id = auth.uid() then raise exception 'Du kannst dich nicht selbst löschen'; end if;
  if not exists (select 1 from profiles where id = p_id and role = 'teacher') then
    raise exception 'Kein Fahrlehrer';
  end if;
  delete from auth.users where id in (select id from profiles where teacher_id = p_id);
  delete from auth.users where id = p_id;
end $$;

-- Neues Passwort für einen Fahrlehrer setzen (Passwörter selbst sind nie lesbar, nur neu setzbar).
-- Gilt NUR für Fahrlehrer – Schüler setzen ihr Passwort selbst über „Passwort vergessen?“ zurück.
create or replace function public.owner_set_teacher_password(p_id uuid, p_password text)
returns void language plpgsql security definer set search_path = public, extensions as $$
begin
  if not is_owner() then raise exception 'Nur der Haupt-Admin'; end if;
  if p_id = auth.uid() then raise exception 'Dein eigenes Passwort änderst du unter Einstellungen'; end if;
  if not exists (select 1 from profiles where id = p_id and role = 'teacher') then
    raise exception 'Passwörter können nur für Fahrlehrer neu gesetzt werden';
  end if;
  if char_length(coalesce(p_password, '')) < 6 then raise exception 'Passwort: mindestens 6 Zeichen'; end if;
  update auth.users set encrypted_password = crypt(p_password, gen_salt('bf')), updated_at = now()
  where id = p_id;
  update profiles set must_change_password = true where id = p_id;
end $$;

-- Nach dem Festlegen eines eigenen Passworts: Pflicht-Hinweis entfernen
create or replace function public.password_changed()
returns void language sql security definer set search_path = public as $$
  update profiles set must_change_password = false where id = auth.uid();
$$;

-- Für die Registrierungsseite: Namen + Kürzel der aktiven Fahrlehrer (ohne weitere Daten)
create or replace function public.public_teachers()
returns table (slug text, display_name text)
language sql stable security definer set search_path = public as $$
  select p.slug, s.display_name from profiles p join settings s on s.teacher_id = p.id
  where p.role = 'teacher' and p.status = 'active' and p.slug is not null
  order by s.display_name;
$$;

-- ---------- Funktionen für Fahrlehrer --------------------------------

-- Eigenen Schüler endgültig löschen (Konto, Profil und alle Buchungen)
create or replace function public.delete_student(p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from profiles where id = p_id and role = 'student' and teacher_id = auth.uid())
     or not is_teacher() then
    raise exception 'Nur der eigene Fahrlehrer darf diesen Schüler löschen';
  end if;
  delete from auth.users where id = p_id;
end $$;

-- Sicherung wiederherstellen (nur die eigene!). Gelöschte Termine/Buchungen kommen zurück,
-- geänderte werden auf den Stand der Sicherung gesetzt. Neu Hinzugekommenes bleibt bestehen.
-- Schülerkonten, die inzwischen gelöscht wurden, können nicht neu angelegt werden (deren Buchungen werden übersprungen).
create or replace function public.restore_backup(p_data jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  r jsonb;
  n_students int := 0; n_slots int := 0; n_bookings int := 0; n_skipped int := 0;
begin
  if not is_teacher() then raise exception 'Nur Fahrlehrer können eine Sicherung wiederherstellen'; end if;
  if coalesce(p_data->>'app', '') <> 'Fahrstundenplaner' then raise exception 'Das ist keine Fahrstundenplaner-Sicherung'; end if;
  if (p_data->'teacher'->>'id') is distinct from me::text then
    raise exception 'Diese Sicherung gehört zu einem anderen Fahrlehrer-Konto';
  end if;

  -- Einstellungen
  if jsonb_typeof(p_data->'settings') = 'object' then
    begin
      update settings set
        display_name     = coalesce(p_data->'settings'->>'display_name', display_name),
        default_duration = coalesce((p_data->'settings'->>'default_duration')::int, default_duration),
        max_open         = coalesce((p_data->'settings'->>'max_open')::int, max_open),
        admin_phone      = p_data->'settings'->>'admin_phone'
      where teacher_id = me;
    exception when others then n_skipped := n_skipped + 1;
    end;
  end if;

  -- Schüler (nur Konten, die noch existieren und zu mir gehören bzw. keinem Fahrlehrer zugeordnet sind)
  for r in select * from jsonb_array_elements(coalesce(p_data->'students', '[]'::jsonb)) loop
    begin
      update profiles set
        first_name = coalesce(r->>'first_name', first_name), last_name = coalesce(r->>'last_name', last_name),
        license_class = r->>'license_class',
        needs_glasses = coalesce((r->>'needs_glasses')::boolean, false),
        is_conversion = coalesce((r->>'is_conversion')::boolean, false),
        phone = r->>'phone', max_open = (r->>'max_open')::int,
        status = coalesce(r->>'status', status), teacher_id = me
      where id = (r->>'id')::uuid and role = 'student' and (teacher_id = me or teacher_id is null);
      if found then n_students := n_students + 1; else n_skipped := n_skipped + 1; end if;
    exception when others then n_skipped := n_skipped + 1;
    end;
  end loop;

  -- Termine
  for r in select * from jsonb_array_elements(coalesce(p_data->'slots', '[]'::jsonb)) loop
    begin
      insert into slots (id, teacher_id, starts_at, duration_min, meeting_point, created_at)
      values ((r->>'id')::uuid, me, (r->>'starts_at')::timestamptz, (r->>'duration_min')::int, r->>'meeting_point',
              coalesce((r->>'created_at')::timestamptz, now()))
      on conflict (id) do update set starts_at = excluded.starts_at, duration_min = excluded.duration_min,
        meeting_point = excluded.meeting_point
        where slots.teacher_id = me;
      if found then n_slots := n_slots + 1; else n_skipped := n_skipped + 1; end if;
    exception when others then n_skipped := n_skipped + 1;
    end;
  end loop;

  -- Buchungen (nur auf eigenen Terminen für eigene, noch existierende Schüler)
  for r in select * from jsonb_array_elements(coalesce(p_data->'bookings', '[]'::jsonb)) loop
    begin
      if slot_teacher((r->>'slot_id')::uuid) is distinct from me
         or student_teacher((r->>'student_id')::uuid) is distinct from me then
        n_skipped := n_skipped + 1;
        continue;
      end if;
      insert into bookings (id, slot_id, student_id, status, cancel_reason, late_cancel, lesson_type,
                            student_note, admin_reply, meeting_point, actual_minutes, created_at, decided_at)
      values ((r->>'id')::uuid, (r->>'slot_id')::uuid, (r->>'student_id')::uuid, r->>'status',
              r->>'cancel_reason', coalesce((r->>'late_cancel')::boolean, false), coalesce(r->>'lesson_type', 'normal'),
              r->>'student_note', r->>'admin_reply', r->>'meeting_point', (r->>'actual_minutes')::int,
              coalesce((r->>'created_at')::timestamptz, now()), (r->>'decided_at')::timestamptz)
      on conflict (id) do update set
        status = excluded.status, cancel_reason = excluded.cancel_reason, late_cancel = excluded.late_cancel,
        lesson_type = excluded.lesson_type, student_note = excluded.student_note, admin_reply = excluded.admin_reply,
        meeting_point = excluded.meeting_point, actual_minutes = excluded.actual_minutes, decided_at = excluded.decided_at
        where slot_teacher(bookings.slot_id) = me;
      if found then n_bookings := n_bookings + 1; else n_skipped := n_skipped + 1; end if;
    exception when others then n_skipped := n_skipped + 1;  -- z. B. Termin inzwischen anders vergeben
    end;
  end loop;

  -- Ausbildungsstand
  for r in select * from jsonb_array_elements(coalesce(p_data->'progress', '[]'::jsonb)) loop
    begin
      if student_teacher((r->>'student_id')::uuid) is distinct from me then
        n_skipped := n_skipped + 1;
        continue;
      end if;
      insert into training_progress (student_id, topic_id, level, updated_at)
      values ((r->>'student_id')::uuid, r->>'topic_id', (r->>'level')::smallint,
              coalesce((r->>'updated_at')::timestamptz, now()))
      on conflict (student_id, topic_id) do update set level = excluded.level, updated_at = excluded.updated_at;
    exception when others then n_skipped := n_skipped + 1;
    end;
  end loop;

  -- Prüfungen
  for r in select * from jsonb_array_elements(coalesce(p_data->'exams', '[]'::jsonb)) loop
    begin
      if student_teacher((r->>'student_id')::uuid) is distinct from me then
        n_skipped := n_skipped + 1;
        continue;
      end if;
      insert into exams (id, student_id, kind, exam_at, result, note, created_at)
      values ((r->>'id')::uuid, (r->>'student_id')::uuid, coalesce(r->>'kind', 'praxis'), (r->>'exam_at')::timestamptz,
              r->>'result', r->>'note', coalesce((r->>'created_at')::timestamptz, now()))
      on conflict (id) do update set kind = excluded.kind, exam_at = excluded.exam_at, result = excluded.result, note = excluded.note
        where student_teacher(exams.student_id) = me;
    exception when others then n_skipped := n_skipped + 1;
    end;
  end loop;

  return jsonb_build_object('students', n_students, 'slots', n_slots, 'bookings', n_bookings, 'skipped', n_skipped);
end $$;

-- ---------- Funktionen für Schüler -----------------------------------

-- Kalender: freie Termine des EIGENEN Fahrlehrers, fremde unbestätigte Anfragen (ohne Namen)
-- und die eigenen Termine. Fremde bestätigte Fahrstunden bleiben unsichtbar.
drop function if exists public.get_calendar(timestamptz, timestamptz);  -- Rückgabe hat sich geändert (Treffpunkt)
create or replace function public.get_calendar(p_from timestamptz, p_to timestamptz)
returns table (slot_id uuid, starts_at timestamptz, duration_min int, status text, mine boolean, meeting_point text)
language sql stable security definer set search_path = public as $$
  select s.id, s.starts_at, s.duration_min,
         coalesce(b.status, 'free'),
         coalesce(b.student_id = auth.uid(), false),
         coalesce(b.meeting_point, s.meeting_point)
  from slots s
  left join bookings b on b.slot_id = s.id and b.status in ('requested','confirmed','offered')
  where s.starts_at >= p_from and s.starts_at < p_to
    and s.teacher_id = my_teacher_id()
    and (b.id is null or b.status = 'requested' or b.student_id = auth.uid())
    and is_active()
  order by s.starts_at;
$$;

-- Termin anfragen
create or replace function public.book_slot(p_slot uuid, p_note text)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_start timestamptz; v_max int; v_open int;
begin
  if not is_active() then raise exception 'Dein Zugang ist nicht freigeschaltet'; end if;
  select starts_at into v_start from slots where id = p_slot and teacher_id = my_teacher_id();
  if v_start is null then raise exception 'Termin nicht gefunden'; end if;
  if v_start < now() then raise exception 'Termin liegt in der Vergangenheit'; end if;
  -- Obergrenze: eigene Höchstzahl des Schülers, sonst Standard seines Fahrlehrers
  select coalesce(p.max_open, st.max_open) into v_max
  from profiles p join settings st on st.teacher_id = p.teacher_id where p.id = auth.uid();
  if coalesce(v_max, 0) > 0 then
    select count(*) into v_open from bookings b join slots s on s.id = b.slot_id
    where b.student_id = auth.uid() and s.starts_at > now()
      and (b.status = 'requested' or (b.status = 'confirmed' and b.actual_minutes is null));
    if v_open >= v_max then
      raise exception 'Du hast schon % offene bzw. anstehende Termine – mehr sind gerade nicht möglich.', v_open;
    end if;
  end if;
  begin
    insert into bookings (slot_id, student_id, student_note)
    values (p_slot, auth.uid(), nullif(left(trim(coalesce(p_note,'')), 300), ''))
    returning id into v_id;
  exception when unique_violation then
    raise exception 'Dieser Termin ist leider schon vergeben';
  end;
  return v_id;
end $$;

-- Absagefrist: Vortag 18:00 Uhr (deutsche Zeit)
create or replace function public.cancel_deadline(p_start timestamptz)
returns timestamptz language sql stable set search_path = public as $$
  select ((date_trunc('day', p_start at time zone 'Europe/Berlin') - interval '6 hours')
          at time zone 'Europe/Berlin');
$$;

-- Bestätigte Fahrstunde absagen (Schüler). Nach der Frist = Fehlstunde (kostenpflichtig).
create or replace function public.cancel_booking(p_booking uuid, p_reason text)
returns boolean language plpgsql security definer set search_path = public as $$
declare v_late boolean;
begin
  if not is_active() then raise exception 'Dein Zugang ist nicht freigeschaltet'; end if;
  if coalesce(trim(p_reason), '') = '' then raise exception 'Bitte kurz den Grund angeben'; end if;
  select now() > cancel_deadline(s.starts_at) into v_late
  from bookings b join slots s on s.id = b.slot_id
  where b.id = p_booking and b.student_id = auth.uid() and b.status = 'confirmed'
    and b.actual_minutes is null and s.starts_at > now();
  if v_late is null then raise exception 'Diese Fahrstunde kann nicht mehr abgesagt werden'; end if;
  update bookings set status = 'cancelled_student', cancel_reason = left(trim(p_reason), 300),
         late_cancel = v_late, decided_at = now()
  where id = p_booking;
  return v_late;
end $$;

-- Angebot des Fahrlehrers zusagen (→ bestätigt) oder absagen (→ Termin wieder frei)
create or replace function public.respond_offer(p_booking uuid, p_accept boolean, p_note text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not is_active() then raise exception 'Dein Zugang ist nicht freigeschaltet'; end if;
  update bookings b set
    status = case when p_accept then 'confirmed' else 'declined' end,
    student_note = coalesce(nullif(left(trim(coalesce(p_note, '')), 300), ''), b.student_note),
    decided_at = now()
  from slots s
  where b.id = p_booking and s.id = b.slot_id and b.student_id = auth.uid()
    and b.status = 'offered' and s.starts_at > now();
  if not found then raise exception 'Dieses Angebot ist nicht mehr offen'; end if;
end $$;

-- Eigene, noch nicht bestätigte Anfrage zurückziehen
create or replace function public.cancel_request(p_booking uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  update bookings set status = 'cancelled', decided_at = now()
  where id = p_booking and student_id = auth.uid() and status = 'requested' and is_active();
  if not found then raise exception 'Anfrage kann nicht zurückgezogen werden'; end if;
end $$;

-- Eigene Profildaten ändern (Rolle, Freischaltung und Fahrlehrer bleiben unberührt)
create or replace function public.update_my_profile(
  p_first text, p_last text, p_class text, p_glasses boolean, p_conversion boolean, p_phone text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'Nicht angemeldet'; end if;
  if coalesce(trim(p_first), '') = '' or coalesce(trim(p_last), '') = '' then
    raise exception 'Bitte Vor- und Nachnamen angeben';
  end if;
  update profiles set
    first_name = left(trim(p_first), 60), last_name = left(trim(p_last), 60),
    license_class = case when p_class in ('B','B197','B Automatik') then p_class end,
    needs_glasses = coalesce(p_glasses, false), is_conversion = coalesce(p_conversion, false),
    phone = nullif(left(trim(coalesce(p_phone, '')), 30), '')
  where id = auth.uid();
end $$;

-- ---------- Zugriffsregeln (Row Level Security) ----------------------

alter table public.profiles enable row level security;
alter table public.settings enable row level security;
alter table public.slots    enable row level security;
alter table public.bookings enable row level security;
alter table public.training_topics   enable row level security;
alter table public.training_progress enable row level security;
alter table public.exams             enable row level security;

-- Profile: man sieht sich selbst; Fahrlehrer sehen ihre eigenen Schüler; Haupt-Admin sieht die Fahrlehrer
drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles for select
  using (id = auth.uid()
         or (public.is_teacher() and teacher_id = auth.uid())
         or (public.is_owner() and role = 'teacher'));
-- Fahrlehrer ändern nur eigene Schüler – und können sie nicht zu Fahrlehrern machen oder weitergeben
drop policy if exists profiles_teacher_update on public.profiles;
create policy profiles_teacher_update on public.profiles for update
  using (public.is_teacher() and teacher_id = auth.uid() and role = 'student')
  with check (teacher_id = auth.uid() and role = 'student' and not is_owner and slug is null);

-- Einstellungen: Schüler lesen die ihres Fahrlehrers; Fahrlehrer ändern nur die eigenen
drop policy if exists settings_select on public.settings;
create policy settings_select on public.settings for select
  using (teacher_id = public.my_teacher_id());
drop policy if exists settings_update on public.settings;
create policy settings_update on public.settings for update
  using (teacher_id = auth.uid() and public.is_teacher())
  with check (teacher_id = auth.uid());

-- Termine: Fahrlehrer verwalten nur eigene; Schüler lesen die Termine ihrer eigenen Buchungen
drop policy if exists slots_teacher on public.slots;
create policy slots_teacher on public.slots for all
  using (teacher_id = auth.uid() and public.is_teacher())
  with check (teacher_id = auth.uid() and public.is_teacher());
drop policy if exists slots_own on public.slots;
create policy slots_own on public.slots for select
  using (public.is_active() and public.has_own_booking(id));

-- Buchungen: Schüler sehen eigene; Fahrlehrer verwalten Buchungen auf eigenen Terminen für eigene Schüler
drop policy if exists bookings_select on public.bookings;
create policy bookings_select on public.bookings for select
  using (student_id = auth.uid() and public.is_active());
drop policy if exists bookings_teacher on public.bookings;
create policy bookings_teacher on public.bookings for all
  using (public.is_teacher() and public.slot_teacher(slot_id) = auth.uid())
  with check (public.is_teacher() and public.slot_teacher(slot_id) = auth.uid()
              and public.student_teacher(student_id) = auth.uid());

-- Ausbildungsthemen: Standardthemen + eigene Themen des eigenen Fahrlehrers lesen
drop policy if exists topics_select on public.training_topics;
create policy topics_select on public.training_topics for select
  using (public.is_active() and (teacher_id is null or teacher_id = public.my_teacher_id()));
drop policy if exists topics_teacher on public.training_topics;
create policy topics_teacher on public.training_topics for all
  using (teacher_id = auth.uid() and public.is_teacher())
  with check (teacher_id = auth.uid() and public.is_teacher());

-- Ausbildungsstand: Schüler sehen nur ihren eigenen; nur der eigene Fahrlehrer darf abhaken
drop policy if exists progress_select on public.training_progress;
create policy progress_select on public.training_progress for select
  using ((student_id = auth.uid() and public.is_active())
         or (public.is_teacher() and public.student_teacher(student_id) = auth.uid()));
drop policy if exists progress_teacher on public.training_progress;
create policy progress_teacher on public.training_progress for all
  using (public.is_teacher() and public.student_teacher(student_id) = auth.uid())
  with check (public.is_teacher() and public.student_teacher(student_id) = auth.uid());

-- Prüfungen: Schüler sehen nur die eigenen; nur der eigene Fahrlehrer trägt ein
drop policy if exists exams_select on public.exams;
create policy exams_select on public.exams for select
  using (student_id = auth.uid() and public.is_active());
drop policy if exists exams_teacher on public.exams;
create policy exams_teacher on public.exams for all
  using (public.is_teacher() and public.student_teacher(student_id) = auth.uid())
  with check (public.is_teacher() and public.student_teacher(student_id) = auth.uid());

-- Rechte für Funktionen
grant execute on function public.get_calendar(timestamptz, timestamptz) to authenticated;
grant execute on function public.book_slot(uuid, text) to authenticated;
grant execute on function public.cancel_request(uuid) to authenticated;
grant execute on function public.cancel_booking(uuid, text) to authenticated;
grant execute on function public.respond_offer(uuid, boolean, text) to authenticated;
grant execute on function public.update_my_profile(text, text, text, boolean, boolean, text) to authenticated;
grant execute on function public.cancel_deadline(timestamptz) to authenticated;
grant execute on function public.is_teacher() to authenticated;
grant execute on function public.is_owner() to authenticated;
grant execute on function public.is_active() to authenticated;
grant execute on function public.my_teacher_id() to authenticated;
grant execute on function public.slot_teacher(uuid) to authenticated;
grant execute on function public.student_teacher(uuid) to authenticated;
grant execute on function public.has_own_booking(uuid) to authenticated;
grant execute on function public.delete_student(uuid) to authenticated;
grant execute on function public.create_teacher(uuid, text, text, text) to authenticated;
grant execute on function public.set_teacher_status(uuid, text) to authenticated;
grant execute on function public.delete_teacher(uuid) to authenticated;
grant execute on function public.owner_set_teacher_password(uuid, text) to authenticated;
grant execute on function public.restore_backup(jsonb) to authenticated;
grant execute on function public.password_changed() to authenticated;
grant execute on function public.public_teachers() to anon, authenticated;
