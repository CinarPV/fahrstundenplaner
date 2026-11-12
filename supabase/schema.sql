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
-- Fahrschul-Admins: vom Haupt-Admin angelegt, dürfen Fahrlehrer ihrer eigenen Fahrschule anlegen/verwalten.
-- school_id = der Fahrschul-Admin, zu dessen Fahrschule ein Fahrlehrer gehört (leer = Fahrschule des Haupt-Admins)
alter table public.profiles add column if not exists is_school_admin boolean not null default false;
alter table public.profiles add column if not exists school_id uuid references public.profiles(id) on delete set null;
-- Befristung: gültig bis (einschließlich). Leer = unbegrenzt.
--   Schüler: bei Freischaltung automatisch 1 Jahr; der eigene Fahrlehrer verlängert (z. B. +6 Monate).
--            Nach Ablauf noch 4 Wochen Schonfrist, danach gesperrt (Daten bleiben, „archiviert“).
--   Fahrlehrer / Fahrschul-Admins: legt nur der Haupt-Admin fest (Abo). Fahrlehrer einer Fahrschule
--            sind nur so lange gültig wie ihr Fahrschul-Admin. Der Haupt-Admin selbst läuft nie ab.
alter table public.profiles add column if not exists valid_until date;

-- Einstellungen: eine Zeile pro Fahrlehrer
create table if not exists public.settings (
  teacher_id        uuid primary key references public.profiles(id) on delete cascade,
  display_name      text not null default 'Fahrlehrer' check (char_length(display_name) <= 60),
  default_duration  int not null default 90 check (default_duration between 5 and 600),
  max_open          int not null default 3 check (max_open between 0 and 50),  -- max. Fahrstunden pro Schüler und Woche, 0 = unbegrenzt
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
                  -- sick / cancelled_student / cancelled_teacher / no_show = Fahrstunde nicht zustande gekommen
                  check (status in ('requested','confirmed','rejected','cancelled','offered','declined',
                                    'sick','cancelled_student','cancelled_teacher','no_show')),
  cancel_reason   text check (char_length(cancel_reason) <= 300),
  late_cancel     boolean not null default false,  -- Fehlstunde (kostenpflichtig)
  lesson_type     text not null default 'normal'
                  check (lesson_type in ('normal','ueberland','autobahn','nacht','schalt','schaltpruefung')),  -- Sonderfahrten, B197
  student_note    text check (char_length(student_note) <= 300),
  admin_reply     text check (char_length(admin_reply) <= 1000),
  actual_minutes  int check (actual_minutes between 0 and 1000),
  created_at      timestamptz not null default now(),
  decided_at      timestamptz
);
-- Pro Termin höchstens EINE offene, angebotene oder bestätigte Buchung
-- Status „no_show“ (Schüler nicht erschienen) für bestehende Datenbanken nachrüsten
alter table public.bookings drop constraint if exists bookings_status_check;
alter table public.bookings add constraint bookings_status_check
  check (status in ('requested','confirmed','rejected','cancelled','offered','declined',
                    'sick','cancelled_student','cancelled_teacher','no_show'));

-- B197: Schaltstunden und Schaltkompetenz-Test (15 Min.) als eigene Fahrt-Arten
alter table public.bookings drop constraint if exists bookings_lesson_type_check;
alter table public.bookings add constraint bookings_lesson_type_check
  check (lesson_type in ('normal','ueberland','autobahn','nacht','schalt','schaltpruefung'));
-- Wunschzeit des Schülers: höchstens 60 Min. vor/nach dem angebotenen Beginn
alter table public.bookings add column if not exists wish_start timestamptz;

create unique index if not exists bookings_one_active_per_slot
  on public.bookings (slot_id) where status in ('requested','confirmed','offered');
create index if not exists bookings_student_idx on public.bookings (student_id);

-- Treffpunkte: Standard + weitere (eine pro Zeile) je Fahrlehrer; pro Fahrstunde optional abweichend
alter table public.settings add column if not exists meeting_point  text check (char_length(meeting_point) <= 200);
alter table public.settings add column if not exists meeting_points text check (char_length(meeting_points) <= 2000);
alter table public.bookings add column if not exists meeting_point  text check (char_length(meeting_point) <= 200);
alter table public.slots    add column if not exists meeting_point  text check (char_length(meeting_point) <= 200);
-- Fahrstunde davor wurde vorgezogen: freier Termin kann auf Wunsch schon ab dieser Zeit beginnen (Hinweis für Schüler)
alter table public.slots    add column if not exists earlier_from   timestamptz;
-- Angeheftete Uhrzeiten beim Anlegen, z. B. "08:00,09:45,11:30"
alter table public.settings add column if not exists time_presets   text check (char_length(time_presets) <= 400);
-- Wochen-Höchstzahl nur in einem Zeitfenster (z. B. 14–18 Uhr); beide leer = ganzer Tag
alter table public.settings add column if not exists limit_from time;
alter table public.settings add column if not exists limit_to   time;
-- Tab „☀️ Heute“ (Fahrtag mit Abhaken per Tipp) – jeder Fahrlehrer kann ihn in den Einstellungen einschalten
alter table public.settings add column if not exists show_today boolean not null default false;
-- Neu: Heute-Ansicht ist für alle Fahrlehrer standardmäßig an (und Startseite); wer sie nicht will, schaltet sie aus
alter table public.settings add column if not exists hide_today boolean not null default false;
-- Kontrolle: wann die Fahrstunde ins Fahrschulsystem übertragen wurde (NULL = noch nicht)
alter table public.bookings add column if not exists transferred_at timestamptz;
-- Anfrage über der Höchstzahl: Schüler bittet um eine Ausnahme (Fahrlehrer entscheidet)
alter table public.bookings add column if not exists over_limit boolean not null default false;

-- Urlaub / freie Tage eines Fahrlehrers: an diesen Tagen kann nichts angefragt werden
create table if not exists public.time_off (
  id          uuid primary key default gen_random_uuid(),
  teacher_id  uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  from_day    date not null,
  to_day      date not null,
  note        text check (char_length(note) <= 100),
  created_at  timestamptz not null default now(),
  check (to_day >= from_day)
);
create index if not exists time_off_teacher_idx on public.time_off (teacher_id, from_day);

-- Gegenangebot: ursprüngliche Zeit des Termins, falls der Schüler ablehnt
alter table public.bookings add column if not exists counter_from timestamptz;

-- Vom Fahrlehrer gehaltene Theoriestunden (nur für seine Monatsübersicht)
create table if not exists public.theory_lessons (
  id            uuid primary key default gen_random_uuid(),
  teacher_id    uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  held_at       timestamptz not null,
  duration_min  int not null check (duration_min between 5 and 600),
  note          text check (char_length(note) <= 200),
  created_at    timestamptz not null default now()
);
create index if not exists theory_teacher_idx on public.theory_lessons (teacher_id, held_at);

-- Lohnangaben – bewusst NICHT in settings, die auch Schüler lesen dürfen
create table if not exists public.teacher_pay (
  teacher_id    uuid primary key references public.profiles(id) on delete cascade,
  lesson_rate   numeric(10,2) check (lesson_rate >= 0),
  theory_bonus  numeric(10,2) check (theory_bonus >= 0),
  exam_bonus    numeric(10,2) check (exam_bonus >= 0),
  night_bonus   numeric(10,2) check (night_bonus >= 0),
  updated_at    timestamptz not null default now()
);

-- Prüfungen (Theorie/Praxis): Termin + Ergebnis; bei „nicht bestanden“ folgt ein neuer Termin
create table if not exists public.exams (
  id          uuid primary key default gen_random_uuid(),
  student_id  uuid not null references public.profiles(id) on delete cascade,
  kind        text not null default 'praxis' check (kind in ('theorie','praxis','schalt')),
  exam_at     timestamptz not null,
  result      text check (result in ('passed','failed')),   -- NULL = noch offen
  note        text check (char_length(note) <= 300),
  created_at  timestamptz not null default now()
);
create index if not exists exams_student_idx on public.exams (student_id, exam_at);
-- Prüfungsarten: praktische Prüfung, Schaltkompetenz-Test (B197, 15 Min.); „theorie“ nur für alte Einträge
alter table public.exams drop constraint if exists exams_kind_check;
alter table public.exams add constraint exams_kind_check check (kind in ('theorie','praxis','schalt'));
alter table public.exams add column if not exists duration_min int not null default 55 check (duration_min between 5 and 600);
-- Treffpunkt der Prüfung (z. B. TÜV-Station), getrennt vom Hinweis
alter table public.exams add column if not exists meeting_point text check (char_length(meeting_point) <= 300);

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
-- Ist dieser Fahrlehrer gerade gültig (aktiv, nicht abgelaufen, seine Fahrschule auch nicht)?
create or replace function public.teacher_valid(p_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from profiles t
    where t.id = p_id and t.role = 'teacher' and t.status = 'active'
      and (t.is_owner or t.valid_until is null or t.valid_until >= current_date)
      and (t.school_id is null or exists (
            select 1 from profiles a where a.id = t.school_id and a.status = 'active'
              and (a.is_owner or a.valid_until is null or a.valid_until >= current_date))));
$$;

create or replace function public.is_teacher()
returns boolean language sql stable security definer set search_path = public as $$
  select public.teacher_valid(auth.uid());
$$;

-- Haupt-Admin?
create or replace function public.is_owner()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from profiles where id = auth.uid() and is_owner and status = 'active');
$$;

create or replace function public.is_school_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from profiles where id = auth.uid() and role = 'teacher' and is_school_admin and status = 'active')
         and public.teacher_valid(auth.uid());
$$;

-- Darf ich diesen Fahrlehrer verwalten? Haupt-Admin: alle (außer sich selbst);
-- Fahrschul-Admin: nur Fahrlehrer seiner eigenen Fahrschule.
create or replace function public.can_manage_teacher(p_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select p_id <> auth.uid() and exists (
    select 1 from profiles t where t.id = p_id and t.role = 'teacher' and not t.is_owner
      and (public.is_owner() or (public.is_school_admin() and t.school_id = auth.uid() and not t.is_school_admin)));
$$;

-- Zu welchem Fahrlehrer gehöre ich? (Fahrlehrer: ich selbst)
create or replace function public.my_teacher_id()
returns uuid language sql stable security definer set search_path = public as $$
  select case when role = 'teacher' then id else teacher_id end from profiles where id = auth.uid();
$$;

-- Freigeschaltet = aktiver Fahrlehrer oder aktiver Schüler eines aktiven Fahrlehrers
-- Praktische Prüfung bestanden? Dann gilt der Zugang nur noch 6 Wochen – ohne Schonfrist, Verlängern nur um 4 Wochen
create or replace function public.student_passed(p_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from exams e where e.student_id = p_id and e.kind = 'praxis' and e.result = 'passed');
$$;

create or replace function public.is_active()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from profiles p
    where p.id = auth.uid() and p.status = 'active'
      and (case when p.role = 'teacher' then public.teacher_valid(p.id)
                -- Schüler: gültig bis Ablaufdatum + 4 Wochen Schonfrist (nach bestandener Prüfung ohne Schonfrist),
                -- und sein Fahrlehrer muss gültig sein
                else (p.valid_until is null
                      or p.valid_until + (case when public.student_passed(p.id) then 0 else 28 end) >= current_date)
                     and public.teacher_valid(p.teacher_id) end));
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
-- Liegt der Zeitpunkt an einem gesperrten Tag (Urlaub/frei) des Fahrlehrers? (deutsche Zeit)
create or replace function public.is_time_off(p_teacher uuid, p_at timestamptz)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from time_off t where t.teacher_id = p_teacher
                 and (p_at at time zone 'Europe/Berlin')::date between t.from_day and t.to_day);
$$;

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
drop function if exists public.create_teacher(uuid, text, text, text);
create or replace function public.create_teacher(p_id uuid, p_slug text, p_first text, p_last text, p_school_admin boolean default false)
returns void language plpgsql security definer set search_path = public as $$
declare v_owner boolean := is_owner();
begin
  if not v_owner and not is_school_admin() then raise exception 'Nur der Haupt-Admin oder ein Fahrschul-Admin darf Fahrlehrer anlegen'; end if;
  if coalesce(p_school_admin, false) and not v_owner then raise exception 'Nur der Haupt-Admin darf Fahrschul-Admins anlegen'; end if;
  -- Fahrschul-Admins dürfen nur ein gerade neu registriertes Konto zum Fahrlehrer machen (kein bestehendes übernehmen)
  if not v_owner and not exists (select 1 from profiles where id = p_id and role = 'student' and status = 'pending'
                                   and teacher_id is null and created_at > now() - interval '1 hour') then
    raise exception 'Dieses Konto kann nicht als Fahrlehrer angelegt werden';
  end if;
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
         is_school_admin = v_owner and coalesce(p_school_admin, false),
         school_id = case when v_owner then null else auth.uid() end,   -- Fahrschul-Admin: Fahrlehrer gehört zu seiner Schule
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
  if p_id = auth.uid() then raise exception 'Du kannst dich nicht selbst sperren'; end if;
  if not can_manage_teacher(p_id) then raise exception 'Diesen Fahrlehrer darfst du nicht verwalten'; end if;
  if p_status not in ('active','blocked') then raise exception 'Ungültiger Status'; end if;
  update profiles set status = p_status where id = p_id and role = 'teacher';
  -- Fahrschul-Admin gesperrt/freigeschaltet → seine ganze Fahrschule mit
  update profiles set status = p_status where school_id = p_id and role = 'teacher'
    and exists (select 1 from profiles a where a.id = p_id and a.is_school_admin);
end $$;

-- Fahrlehrer endgültig löschen – mit ALLEN seinen Schülern, Terminen und Buchungen
create or replace function public.delete_teacher(p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if p_id = auth.uid() then raise exception 'Du kannst dich nicht selbst löschen'; end if;
  if not can_manage_teacher(p_id) then raise exception 'Diesen Fahrlehrer darfst du nicht verwalten'; end if;
  if exists (select 1 from profiles where school_id = p_id and role = 'teacher') then
    raise exception 'Diese Fahrschule hat noch Fahrlehrer – bitte zuerst diese löschen';
  end if;
  delete from auth.users where id in (select id from profiles where teacher_id = p_id);
  delete from auth.users where id = p_id;
end $$;

-- Neues Passwort für einen Fahrlehrer setzen (Passwörter selbst sind nie lesbar, nur neu setzbar).
-- Gilt NUR für Fahrlehrer – Schüler setzen ihr Passwort selbst über „Passwort vergessen?“ zurück.
create or replace function public.owner_set_teacher_password(p_id uuid, p_password text)
returns void language plpgsql security definer set search_path = public, extensions as $$
begin
  if p_id = auth.uid() then raise exception 'Dein eigenes Passwort änderst du unter Einstellungen'; end if;
  if not can_manage_teacher(p_id) then raise exception 'Passwörter können nur für eigene Fahrlehrer neu gesetzt werden'; end if;
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
  where p.role = 'teacher' and p.status = 'active' and p.slug is not null and public.teacher_valid(p.id)
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

-- Befristung schützen: Ablaufdatum ändern dürfen nur der eigene Fahrlehrer (Schüler) bzw. der Haupt-Admin (Fahrlehrer).
-- Bei der Freischaltung eines Schülers wird automatisch 1 Jahr eingetragen.
create or replace function public.profiles_valid_guard()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.role = 'student' and new.status = 'active' and old.status is distinct from 'active' and new.valid_until is null then
    new.valid_until := (current_date + interval '1 year')::date;
  end if;
  if new.valid_until is distinct from old.valid_until and auth.uid() is not null then
    if not ((new.role = 'student' and new.teacher_id = auth.uid() and public.is_teacher())
            or (new.role = 'teacher' and new.id <> auth.uid() and (public.is_owner()
                or (public.is_school_admin() and new.school_id = auth.uid() and not new.is_school_admin)))) then
      raise exception 'Die Gültigkeit darf hier nicht geändert werden';
    end if;
    -- Nach bestandener Prüfung: höchstens 4 Wochen ab dem bisherigen Ablauf (bzw. ab heute) verlängern.
    -- Ausnahme: das automatische Setzen auf 6 Wochen beim Eintragen von „bestanden“.
    if new.role = 'student' and public.student_passed(new.id) and coalesce(current_setting('fsp.exam_passed', true), '') <> '1'
       and new.valid_until is not null
       and new.valid_until > greatest(coalesce(old.valid_until, current_date), current_date) + 28 then
      raise exception 'Nach bestandener Prüfung kann der Zugang nur um 4 Wochen verlängert werden';
    end if;
  end if;
  return new;
end $$;
drop trigger if exists profiles_valid_guard on public.profiles;
create trigger profiles_valid_guard before update on public.profiles
  for each row execute function public.profiles_valid_guard();

-- Prüfung bestanden eingetragen → Zugang läuft noch 6 Wochen (ab Prüfungstag bzw. ab heute), danach gesperrt
create or replace function public.exam_passed_access()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.kind = 'praxis' and new.result = 'passed' and (tg_op = 'INSERT' or old.result is distinct from 'passed') then
    perform set_config('fsp.exam_passed', '1', true);
    update profiles set valid_until = greatest((new.exam_at at time zone 'Europe/Berlin')::date, current_date) + 42
      where id = new.student_id and role = 'student';
    perform set_config('fsp.exam_passed', '', true);
  end if;
  return new;
end $$;
drop trigger if exists exam_passed_access on public.exams;
create trigger exam_passed_access after insert or update of result on public.exams
  for each row execute function public.exam_passed_access();

-- Bestehende freigeschaltete Schüler ohne Datum: ab heute 1 Jahr (einmalig, betrifft nur leere Felder)
update public.profiles set valid_until = (current_date + interval '1 year')::date
  where role = 'student' and status = 'active' and valid_until is null;

-- Laufzeit eines Fahrlehrers setzen (leer = unbegrenzt):
--   Haupt-Admin → alle Fahrlehrer und Fahrschul-Admins; Fahrschul-Admin → nur die Fahrlehrer seiner Fahrschule
--   (die trotzdem nie länger laufen als die Fahrschule selbst). Niemand verlängert sich selbst.
create or replace function public.set_teacher_valid(p_id uuid, p_until date)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not can_manage_teacher(p_id) then raise exception 'Diese Laufzeit darfst du nicht ändern'; end if;
  update profiles set valid_until = p_until where id = p_id;
end $$;

-- Aufräumen: alles, was älter als 15 Monate ist, wird gelöscht (nur die eigenen Daten des Fahrlehrers).
-- Termine/Fahrstunden, Prüfungen und Urlaubstage – und Schüler, die seit 15 Monaten nichts mehr hatten
-- (Konto wird komplett gelöscht). Die App ruft das beim Fahrlehrer einmal am Tag automatisch auf.
create or replace function public.cleanup_old_data()
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  v_cut timestamptz := now() - interval '15 months';
  n_slots int; n_exams int; n_off int; n_students int;
begin
  if not is_teacher() then raise exception 'Nur Fahrlehrer können alte Daten löschen'; end if;
  delete from theory_lessons where teacher_id = me and held_at < v_cut;
  delete from slots where teacher_id = me and starts_at < v_cut;           -- Buchungen werden mitgelöscht
  get diagnostics n_slots = row_count;
  delete from exams where student_teacher(student_id) = me and exam_at < v_cut;
  get diagnostics n_exams = row_count;
  delete from time_off where teacher_id = me and to_day < v_cut::date;
  get diagnostics n_off = row_count;
  -- Schüler ohne jede Fahrstunde/Prüfung in den letzten 15 Monaten (und schon länger angemeldet)
  delete from auth.users u where u.id in (
    select p.id from profiles p
    where p.role = 'student' and p.teacher_id = me and p.created_at < v_cut
      and not exists (select 1 from bookings b join slots s on s.id = b.slot_id where b.student_id = p.id and s.starts_at >= v_cut)
      and not exists (select 1 from exams e where e.student_id = p.id and e.exam_at >= v_cut));
  get diagnostics n_students = row_count;
  return jsonb_build_object('slots', n_slots, 'exams', n_exams, 'time_off', n_off, 'students', n_students);
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
        admin_phone      = p_data->'settings'->>'admin_phone',
        limit_from       = (p_data->'settings'->>'limit_from')::time,
        limit_to         = (p_data->'settings'->>'limit_to')::time
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

  -- Eigene Prüfungsstrecken/Themen (vor dem Ausbildungsstand, der darauf verweist)
  for r in select * from jsonb_array_elements(coalesce(p_data->'topics', '[]'::jsonb)) loop
    begin
      insert into training_topics (id, teacher_id, stage, sort, title)
      values (r->>'id', me, coalesce(r->>'stage', 'eigene'), coalesce((r->>'sort')::int, 0), r->>'title')
      on conflict (id) do update set title = excluded.title, sort = excluded.sort
        where training_topics.teacher_id = me;
    exception when others then n_skipped := n_skipped + 1;
    end;
  end loop;

  -- Urlaub / freie Tage
  for r in select * from jsonb_array_elements(coalesce(p_data->'time_off', '[]'::jsonb)) loop
    begin
      insert into time_off (id, teacher_id, from_day, to_day, note)
      values ((r->>'id')::uuid, me, (r->>'from_day')::date, (r->>'to_day')::date, r->>'note')
      on conflict (id) do update set from_day = excluded.from_day, to_day = excluded.to_day, note = excluded.note
        where time_off.teacher_id = me;
    exception when others then n_skipped := n_skipped + 1;
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
      insert into exams (id, student_id, kind, exam_at, duration_min, result, note, meeting_point, created_at)
      values ((r->>'id')::uuid, (r->>'student_id')::uuid, coalesce(r->>'kind', 'praxis'), (r->>'exam_at')::timestamptz,
              coalesce((r->>'duration_min')::int, 55), r->>'result', r->>'note', r->>'meeting_point', coalesce((r->>'created_at')::timestamptz, now()))
      on conflict (id) do update set kind = excluded.kind, exam_at = excluded.exam_at, duration_min = excluded.duration_min,
        result = excluded.result, note = excluded.note, meeting_point = excluded.meeting_point
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
returns table (slot_id uuid, starts_at timestamptz, duration_min int, status text, mine boolean, meeting_point text, earlier_from timestamptz)
language sql stable security definer set search_path = public as $$
  select s.id, s.starts_at, s.duration_min,
         coalesce(b.status, 'free'),
         coalesce(b.student_id = auth.uid(), false),
         coalesce(b.meeting_point, s.meeting_point),
         case when b.id is null and s.earlier_from < s.starts_at and not exists (
           select 1 from slots o join bookings ob on ob.slot_id = o.id and ob.status in ('requested','confirmed','offered')
           where o.teacher_id = s.teacher_id and o.id <> s.id and o.starts_at < s.starts_at
             and o.starts_at + make_interval(mins => o.duration_min) > s.earlier_from
         ) then s.earlier_from end
  from slots s
  left join bookings b on b.slot_id = s.id and b.status in ('requested','confirmed','offered')
  where s.starts_at >= p_from and s.starts_at < p_to
    and s.teacher_id = my_teacher_id()
    and (b.id is null or b.status = 'requested' or b.student_id = auth.uid())
    and (b.id is not null or not is_time_off(s.teacher_id, s.starts_at))  -- freie Termine an Urlaubstagen ausblenden
    and is_active()
  order by s.starts_at;
$$;

-- Termin anfragen. Über der Höchstzahl nur als Ausnahme-Bitte (p_exception) mit Nachricht an den Fahrlehrer.
drop function if exists public.book_slot(uuid, text);
drop function if exists public.book_slot(uuid, text, boolean);
create or replace function public.book_slot(p_slot uuid, p_note text, p_exception boolean default false, p_wish timestamptz default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_start timestamptz; v_max int; v_open int; v_over boolean := false;
        v_from time; v_to time; v_window boolean; v_used boolean;
begin
  if not is_active() then raise exception 'Dein Zugang ist nicht freigeschaltet'; end if;
  select starts_at into v_start from slots where id = p_slot and teacher_id = my_teacher_id();
  if v_start is null then raise exception 'Termin nicht gefunden'; end if;
  if v_start < now() then raise exception 'Termin liegt in der Vergangenheit'; end if;
  if is_time_off(my_teacher_id(), v_start) then raise exception 'An diesem Tag ist dein Fahrlehrer nicht verfügbar (Urlaub/frei).'; end if;
  -- Wunschzeit: nur Abweichung bis höchstens 1 Stunde und nicht in der Vergangenheit
  if p_wish is not null and p_wish <> v_start then
    if abs(extract(epoch from p_wish - v_start)) > 3600 then raise exception 'Die Wunschzeit darf höchstens 1 Stunde abweichen'; end if;
    if p_wish < now() then raise exception 'Die Wunschzeit liegt in der Vergangenheit'; end if;
  else
    p_wish := null;
  end if;
  -- Obergrenze PRO WOCHE (Mo–So, deutsche Zeit): eigene Höchstzahl des Schülers, sonst Standard seines Fahrlehrers.
  -- Gezählt werden alle Anfragen, Angebote und Fahrstunden (auch schon gefahrene) in der Woche des gewünschten Termins.
  -- Eine gewährte Ausnahme gilt nur für diesen einen Termin – die Höchstzahl bleibt.
  -- Mit Zeitfenster (limit_from–limit_to, z. B. 14–18 Uhr) gilt und zählt die Höchstzahl nur für Termine,
  -- die in diesem Fenster beginnen; Termine außerhalb sind frei buchbar.
  select coalesce(p.max_open, st.max_open), st.limit_from, st.limit_to into v_max, v_from, v_to
  from profiles p join settings st on st.teacher_id = p.teacher_id where p.id = auth.uid();
  v_window := v_from is not null and v_to is not null and v_from < v_to;
  if coalesce(v_max, 0) > 0
     and (not v_window or (v_start at time zone 'Europe/Berlin')::time >= v_from and (v_start at time zone 'Europe/Berlin')::time < v_to) then
    select count(*) into v_open from bookings b join slots s on s.id = b.slot_id
    where b.student_id = auth.uid()
      and date_trunc('week', s.starts_at at time zone 'Europe/Berlin') = date_trunc('week', v_start at time zone 'Europe/Berlin')
      and b.status in ('requested', 'offered', 'confirmed')
      and (not v_window or ((s.starts_at at time zone 'Europe/Berlin')::time >= v_from and (s.starts_at at time zone 'Europe/Berlin')::time < v_to));
    if v_open >= v_max then
      -- Pro Woche nur EINE Ausnahme-Bitte – egal, ob sie gewährt, abgelehnt oder zurückgezogen wurde
      select exists (select 1 from bookings b join slots s on s.id = b.slot_id
        where b.student_id = auth.uid() and b.over_limit
          and date_trunc('week', s.starts_at at time zone 'Europe/Berlin') = date_trunc('week', v_start at time zone 'Europe/Berlin'))
        into v_used;
      if not coalesce(p_exception, false) or v_used then
        -- „LIMIT:“ erkennt die App und zeigt das Pop-up (mit Zeitfenster; |U = Ausnahme diese Woche schon genutzt)
        raise exception 'LIMIT:%:%:%|%', v_open, v_max,
          case when v_window then to_char(v_from, 'HH24:MI') || '-' || to_char(v_to, 'HH24:MI') else '' end,
          case when v_used then 'U' else 'N' end;
      end if;
      if coalesce(trim(p_note), '') = '' then raise exception 'Bitte schreib deinem Fahrlehrer kurz, warum du eine weitere Fahrstunde möchtest'; end if;
      v_over := true;
    end if;
  end if;
  begin
    insert into bookings (slot_id, student_id, student_note, over_limit, wish_start)
    values (p_slot, auth.uid(), nullif(left(trim(coalesce(p_note,'')), 300), ''), v_over, p_wish)
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
declare v_slot uuid; v_from timestamptz;
begin
  if not is_active() then raise exception 'Dein Zugang ist nicht freigeschaltet'; end if;
  select b.slot_id, b.counter_from into v_slot, v_from
  from bookings b join slots s on s.id = b.slot_id
  where b.id = p_booking and b.student_id = auth.uid() and b.status = 'offered' and s.starts_at > now();
  if v_slot is null then raise exception 'Dieses Angebot ist nicht mehr offen'; end if;
  update bookings b set
    status = case when p_accept then 'confirmed' else 'declined' end,
    student_note = coalesce(nullif(left(trim(coalesce(p_note, '')), 300), ''), b.student_note),
    counter_from = null,
    decided_at = now()
  where b.id = p_booking;
  -- Gegenangebot abgelehnt: Termin wieder zur angelegten Zeit
  if not p_accept and v_from is not null then
    update slots set starts_at = v_from where id = v_slot;
  end if;
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
alter table public.time_off          enable row level security;

-- Profile: man sieht sich selbst; Fahrlehrer sehen ihre eigenen Schüler; Haupt-Admin sieht die Fahrlehrer
drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles for select
  using (id = auth.uid()
         or (public.is_teacher() and teacher_id = auth.uid())
         or (public.is_owner() and role = 'teacher')
         or (public.is_school_admin() and role = 'teacher' and school_id = auth.uid()));
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

-- Push-Mitteilungen: pro Gerät ein Abo (wohin die Mitteilung geschickt wird). Jeder sieht/ändert nur seine eigenen.
-- Verschickt werden die Mitteilungen von der Supabase-Funktion „notify“ (supabase/functions/notify).
create table if not exists public.push_subscriptions (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  endpoint    text not null unique check (char_length(endpoint) <= 1000),
  p256dh      text not null check (char_length(p256dh) <= 200),
  auth        text not null check (char_length(auth) <= 100),
  created_at  timestamptz not null default now()
);
alter table public.push_subscriptions enable row level security;
drop policy if exists push_own on public.push_subscriptions;
create policy push_own on public.push_subscriptions for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Urlaub/freie Tage: Schüler sehen die ihres Fahrlehrers; nur der Fahrlehrer selbst trägt ein
drop policy if exists time_off_select on public.time_off;
create policy time_off_select on public.time_off for select
  using (teacher_id = public.my_teacher_id() and public.is_active());
drop policy if exists time_off_teacher on public.time_off;
create policy time_off_teacher on public.time_off for all
  using (teacher_id = auth.uid() and public.is_teacher())
  with check (teacher_id = auth.uid() and public.is_teacher());

-- Rechte für Funktionen
grant execute on function public.get_calendar(timestamptz, timestamptz) to authenticated;
grant execute on function public.book_slot(uuid, text, boolean, timestamptz) to authenticated;
grant execute on function public.cancel_request(uuid) to authenticated;
grant execute on function public.cancel_booking(uuid, text) to authenticated;
grant execute on function public.respond_offer(uuid, boolean, text) to authenticated;
grant execute on function public.update_my_profile(text, text, text, boolean, boolean, text) to authenticated;
grant execute on function public.cancel_deadline(timestamptz) to authenticated;
grant execute on function public.is_teacher() to authenticated;
grant execute on function public.is_owner() to authenticated;
grant execute on function public.is_active() to authenticated;
grant execute on function public.student_passed(uuid) to authenticated;
grant execute on function public.my_teacher_id() to authenticated;
grant execute on function public.slot_teacher(uuid) to authenticated;
grant execute on function public.student_teacher(uuid) to authenticated;
grant execute on function public.has_own_booking(uuid) to authenticated;
grant execute on function public.is_time_off(uuid, timestamptz) to authenticated;
grant execute on function public.delete_student(uuid) to authenticated;
grant execute on function public.create_teacher(uuid, text, text, text, boolean) to authenticated;
grant execute on function public.is_school_admin() to authenticated;
grant execute on function public.can_manage_teacher(uuid) to authenticated;
grant execute on function public.set_teacher_status(uuid, text) to authenticated;
grant execute on function public.delete_teacher(uuid) to authenticated;
grant execute on function public.owner_set_teacher_password(uuid, text) to authenticated;
grant execute on function public.restore_backup(jsonb) to authenticated;
grant execute on function public.cleanup_old_data() to authenticated;
grant execute on function public.set_teacher_valid(uuid, date) to authenticated;
grant execute on function public.teacher_valid(uuid) to authenticated;
grant execute on function public.password_changed() to authenticated;
grant execute on function public.public_teachers() to anon, authenticated;

-- Theorie und Lohn: nur der Fahrlehrer selbst (auch nicht Betreiber oder andere Fahrlehrer)
alter table public.theory_lessons enable row level security;
alter table public.teacher_pay    enable row level security;
drop policy if exists theory_own on public.theory_lessons;
create policy theory_own on public.theory_lessons for all
  using (teacher_id = auth.uid() and public.is_teacher())
  with check (teacher_id = auth.uid() and public.is_teacher());
drop policy if exists pay_own on public.teacher_pay;
create policy pay_own on public.teacher_pay for all
  using (teacher_id = auth.uid() and public.is_teacher())
  with check (teacher_id = auth.uid() and public.is_teacher());
grant select, insert, update, delete on public.theory_lessons to authenticated;
grant select, insert, update, delete on public.teacher_pay to authenticated;

-- Urlaubstage pro Jahr (für „noch übrig“)
alter table public.teacher_pay add column if not exists vacation_days int check (vacation_days between 0 and 366);

-- Blockierte Zeiten des Fahrlehrers (Begründung sieht nur er)
create table if not exists public.time_blocks (
  id            uuid primary key default gen_random_uuid(),
  teacher_id    uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  starts_at     timestamptz not null,
  duration_min  int not null check (duration_min between 5 and 1440),
  reason        text not null check (char_length(reason) between 1 and 200),
  created_at    timestamptz not null default now()
);
create index if not exists blocks_teacher_idx on public.time_blocks (teacher_id, starts_at);
alter table public.time_blocks enable row level security;
drop policy if exists blocks_own on public.time_blocks;
create policy blocks_own on public.time_blocks for all
  using (teacher_id = auth.uid() and public.is_teacher())
  with check (teacher_id = auth.uid() and public.is_teacher());
grant select, insert, update, delete on public.time_blocks to authenticated;

-- Erste freigegebene Uhrzeit eines verschobenen Termins
alter table public.slots add column if not exists original_start timestamptz;

-- Wird ein gebuchter Termin verschoben (Wunschzeit, Gegenangebot, Änderung): erste Zeit merken
create or replace function public.remember_first_time()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.starts_at is distinct from old.starts_at
     and exists (select 1 from bookings x where x.slot_id = new.id and x.status in ('requested','offered','confirmed')) then
    new.original_start := coalesce(old.original_start, old.starts_at);
  end if;
  return new;
end $$;
drop trigger if exists slots_remember_first_time on public.slots;
create trigger slots_remember_first_time before update of starts_at on public.slots
  for each row execute function public.remember_first_time();

-- Fahrstunde fällt weg (Absage, Ablehnung, Löschen): Termin steht wieder zur ersten freigegebenen Uhrzeit im Kalender.
-- Freie Termine desselben Tages, die deswegen verschoben wurden, gehen mit zurück, soweit keine Fahrstunde im Weg ist.
create or replace function public.restore_slot_time()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_teacher uuid; v_orig timestamptz; r record;
begin
  if old.status not in ('requested','offered','confirmed') then return null; end if;
  if tg_op = 'UPDATE' and new.status in ('requested','offered','confirmed') then return null; end if;
  if exists (select 1 from bookings x where x.slot_id = old.slot_id and x.id <> old.id and x.status in ('requested','offered','confirmed')) then return null; end if;
  select teacher_id, original_start into v_teacher, v_orig from slots where id = old.slot_id;
  if v_teacher is null or v_orig is null or v_orig <= now() then return null; end if;
  for r in
    select s.id, s.original_start, s.duration_min from slots s
    where s.teacher_id = v_teacher and s.original_start is not null and s.original_start > now()
      and (s.original_start at time zone 'Europe/Berlin')::date = (v_orig at time zone 'Europe/Berlin')::date
      and not exists (select 1 from bookings x where x.slot_id = s.id and x.status in ('requested','offered','confirmed'))
    order by s.original_start
  loop
    if not exists (
      select 1 from slots o join bookings x on x.slot_id = o.id and x.status in ('requested','offered','confirmed')
      where o.teacher_id = v_teacher and o.id <> r.id
        and o.starts_at < r.original_start + make_interval(mins => r.duration_min)
        and o.starts_at + make_interval(mins => o.duration_min) > r.original_start
    ) then
      update slots set starts_at = r.original_start, original_start = null, earlier_from = null where id = r.id;
    end if;
  end loop;
  update slots s set earlier_from = null
  where s.teacher_id = v_teacher and s.earlier_from is not null
    and (s.starts_at at time zone 'Europe/Berlin')::date = (v_orig at time zone 'Europe/Berlin')::date;
  return null;
end $$;
drop trigger if exists bookings_restore_slot on public.bookings;
create trigger bookings_restore_slot after update of status or delete on public.bookings
  for each row execute function public.restore_slot_time();
-- Anrede: Frau (w) oder Mann (m) – für richtige Wörter in Nachrichten
alter table public.profiles add column if not exists gender text check (gender in ('m','w'));
alter table public.settings add column if not exists teacher_gender text check (teacher_gender in ('m','w'));
create or replace function public.set_my_gender(p_gender text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'Nicht angemeldet'; end if;
  if p_gender not in ('m','w') then raise exception 'Bitte Frau oder Mann wählen'; end if;
  update profiles set gender = p_gender where id = auth.uid();
  update settings set teacher_gender = p_gender where teacher_id = auth.uid();
end $$;
grant execute on function public.set_my_gender(text) to authenticated;

-- Erste Dauer merken und Vorschlag, wenn nach einer Absage nur noch wenig Zeit frei ist
alter table public.slots add column if not exists original_dur int;
alter table public.slots add column if not exists review_start timestamptz;
alter table public.slots add column if not exists review_dur int;

create or replace function public.remember_first_time()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if (new.starts_at is distinct from old.starts_at or new.duration_min is distinct from old.duration_min)
     and exists (select 1 from bookings x where x.slot_id = new.id and x.status in ('requested','offered','confirmed')) then
    new.original_start := coalesce(old.original_start, old.starts_at);
    new.original_dur := coalesce(old.original_dur, old.duration_min);
  end if;
  if new.original_start is null then new.original_dur := null; end if;
  return new;
end $$;
drop trigger if exists slots_remember_first_time on public.slots;
create trigger slots_remember_first_time before update of starts_at, duration_min, original_start on public.slots
  for each row execute function public.remember_first_time();

-- Schüler/innen ohne App: eigene Einträge des Fahrlehrers (Fahrstunden und Prüfungen)
-- (nachträglich ergänzt am 11.11.2026 – die Tabelle wurde früher außerhalb dieser Datei angelegt; im Live-Projekt existiert sie schon)
create table if not exists public.own_entries (
  id             uuid primary key default gen_random_uuid(),
  teacher_id     uuid not null references public.profiles(id) on delete cascade,
  kind           text not null default 'lesson' check (kind in ('lesson', 'exam')),
  lesson_type    text,
  student_name   text not null check (char_length(student_name) <= 80),
  starts_at      timestamptz not null,
  duration_min   int not null check (duration_min between 5 and 600),
  done           boolean not null default false,
  note           text check (char_length(note) <= 1000),
  transferred_at timestamptz,
  created_at     timestamptz not null default now()
);
alter table public.own_entries add column if not exists transferred_at timestamptz;
create index if not exists own_entries_teacher_idx on public.own_entries (teacher_id, starts_at);
alter table public.own_entries enable row level security;
drop policy if exists own_entries_teacher on public.own_entries;
create policy own_entries_teacher on public.own_entries for all
  using (teacher_id = auth.uid() and public.is_teacher())
  with check (teacher_id = auth.uid() and public.is_teacher());
grant select, insert, update, delete on public.own_entries to authenticated;

-- Ist im Zeitraum etwas eingetragen? (gebuchte Fahrstunden, Schüler ohne App, blockierte Zeiten)
create or replace function public.slot_busy_until(p_teacher uuid, p_slot uuid, p_at timestamptz)
returns timestamptz language sql stable security definer set search_path = public as $$
  select max(e) from (
    select o.starts_at + make_interval(mins => o.duration_min) e from slots o
      join bookings x on x.slot_id = o.id and x.status in ('requested','offered','confirmed')
      where o.teacher_id = p_teacher and o.id <> p_slot and o.starts_at <= p_at and o.starts_at + make_interval(mins => o.duration_min) > p_at
    union all
    select w.starts_at + make_interval(mins => w.duration_min) from own_entries w
      where w.teacher_id = p_teacher and w.starts_at <= p_at and w.starts_at + make_interval(mins => w.duration_min) > p_at
    union all
    select b.starts_at + make_interval(mins => b.duration_min) from time_blocks b
      where b.teacher_id = p_teacher and b.starts_at <= p_at and b.starts_at + make_interval(mins => b.duration_min) > p_at
  ) z;
$$;
create or replace function public.slot_next_busy(p_teacher uuid, p_slot uuid, p_from timestamptz, p_to timestamptz)
returns timestamptz language sql stable security definer set search_path = public as $$
  select min(s) from (
    select o.starts_at s from slots o join bookings x on x.slot_id = o.id and x.status in ('requested','offered','confirmed')
      where o.teacher_id = p_teacher and o.id <> p_slot and o.starts_at > p_from and o.starts_at < p_to
    union all select w.starts_at from own_entries w where w.teacher_id = p_teacher and w.starts_at > p_from and w.starts_at < p_to
    union all select b.starts_at from time_blocks b where b.teacher_id = p_teacher and b.starts_at > p_from and b.starts_at < p_to
  ) z;
$$;

-- Fahrstunde fällt weg (Absage, Ablehnung, Löschen): zurück zur ersten Zeit.
-- Ist dort inzwischen etwas eingetragen: in die freie Lücke rücken („hinten dran“) und kürzen; unter 60 Min. fragt die App nach.
create or replace function public.restore_slot_time()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_teacher uuid; v_orig timestamptz; v_dur int; v_s timestamptz; v_e timestamptz; v_b timestamptz; v_n timestamptz; v_gap int; r record; i int := 0;
begin
  if old.status not in ('requested','offered','confirmed') then return null; end if;
  if tg_op = 'UPDATE' and new.status in ('requested','offered','confirmed') then return null; end if;
  if exists (select 1 from bookings x where x.slot_id = old.slot_id and x.id <> old.id and x.status in ('requested','offered','confirmed')) then return null; end if;
  select teacher_id, original_start, coalesce(original_dur, duration_min) into v_teacher, v_orig, v_dur from slots where id = old.slot_id;
  if v_teacher is null or v_orig is null or v_orig <= now() then return null; end if;
  -- freie Lücke ab der ersten Zeit suchen
  v_s := v_orig; v_e := v_orig + make_interval(mins => v_dur);
  loop
    v_b := slot_busy_until(v_teacher, old.slot_id, v_s);
    exit when v_b is null or i > 20;
    v_s := v_b; i := i + 1;
  end loop;
  v_n := slot_next_busy(v_teacher, old.slot_id, v_s, v_e);
  if v_n is not null then v_e := v_n; end if;
  v_gap := greatest(0, floor(extract(epoch from (v_e - v_s)) / 60)::int);
  if v_s = v_orig and v_gap = v_dur then
    update slots set starts_at = v_orig, duration_min = v_dur, original_start = null, original_dur = null, earlier_from = null, review_start = null, review_dur = null where id = old.slot_id;
  elsif v_gap >= 60 then
    update slots set starts_at = v_s, duration_min = v_gap, original_start = null, original_dur = null, earlier_from = null, review_start = null, review_dur = null where id = old.slot_id;
  else
    update slots set review_start = v_s, review_dur = v_gap where id = old.slot_id;   -- App fragt den Fahrlehrer
  end if;
  -- freie Termine desselben Tages, die deswegen verschoben wurden, ebenfalls zurück (wenn dort nichts liegt)
  for r in
    select s.id, s.original_start, s.duration_min from slots s
    where s.teacher_id = v_teacher and s.id <> old.slot_id and s.original_start is not null and s.original_start > now()
      and (s.original_start at time zone 'Europe/Berlin')::date = (v_orig at time zone 'Europe/Berlin')::date
      and not exists (select 1 from bookings x where x.slot_id = s.id and x.status in ('requested','offered','confirmed'))
    order by s.original_start
  loop
    if slot_busy_until(v_teacher, r.id, r.original_start) is null
       and slot_next_busy(v_teacher, r.id, r.original_start, r.original_start + make_interval(mins => r.duration_min)) is null then
      update slots set starts_at = r.original_start, original_start = null, earlier_from = null where id = r.id;
    end if;
  end loop;
  update slots s set earlier_from = null
  where s.teacher_id = v_teacher and s.earlier_from is not null
    and (s.starts_at at time zone 'Europe/Berlin')::date = (v_orig at time zone 'Europe/Berlin')::date;
  return null;
end $$;
drop trigger if exists bookings_restore_slot on public.bookings;
create trigger bookings_restore_slot after update of status or delete on public.bookings
  for each row execute function public.restore_slot_time();
-- Wie weit im Voraus dürfen Schüler anfragen? (Tage, leer = ohne Grenze)
alter table public.settings add column if not exists book_ahead_days int check (book_ahead_days between 1 and 365);

-- Anfragen eines Schülers für einen Zeitraum begrenzen (außerhalb gilt weiter die normale Grenze)
create table if not exists public.student_limits (
  id          uuid primary key default gen_random_uuid(),
  student_id  uuid not null references public.profiles(id) on delete cascade,
  from_day    date not null,
  to_day      date not null,
  max_count   int not null check (max_count between 0 and 50),
  created_at  timestamptz not null default now(),
  check (to_day >= from_day)
);
create index if not exists student_limits_idx on public.student_limits (student_id, from_day);
alter table public.student_limits enable row level security;
drop policy if exists limits_teacher on public.student_limits;
create policy limits_teacher on public.student_limits for all
  using (public.is_teacher() and public.student_teacher(student_id) = auth.uid())
  with check (public.is_teacher() and public.student_teacher(student_id) = auth.uid());
drop policy if exists limits_own on public.student_limits;
create policy limits_own on public.student_limits for select using (student_id = auth.uid());
grant select, insert, update, delete on public.student_limits to authenticated;

-- Beim Anfragen durch den Schüler: Buchungsfenster und Zeitraum-Grenzen prüfen
create or replace function public.check_request_rules()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_start timestamptz; v_teacher uuid; v_days int; v_day date; l record; v_n int;
begin
  if new.status <> 'requested' or auth.uid() is null or new.student_id <> auth.uid() then return new; end if;
  select starts_at, teacher_id into v_start, v_teacher from slots where id = new.slot_id;
  if v_start is null then return new; end if;
  v_day := (v_start at time zone 'Europe/Berlin')::date;
  select book_ahead_days into v_days from settings where teacher_id = v_teacher;
  if v_days is not null and v_day > (now() at time zone 'Europe/Berlin')::date + v_days then
    raise exception 'Diese Fahrstunde kann erst % Tage vorher angefragt werden.', v_days;
  end if;
  for l in select * from student_limits where student_id = new.student_id and v_day between from_day and to_day loop
    select count(*) into v_n from bookings b join slots s on s.id = b.slot_id
      where b.student_id = new.student_id and b.status in ('requested','offered','confirmed')
        and (s.starts_at at time zone 'Europe/Berlin')::date between l.from_day and l.to_day;
    if v_n >= l.max_count then
      raise exception 'Vom % bis % darfst du höchstens % Fahrstunde(n) anfragen.', to_char(l.from_day, 'DD.MM.'), to_char(l.to_day, 'DD.MM.'), l.max_count;
    end if;
  end loop;
  return new;
end $$;
drop trigger if exists bookings_request_rules on public.bookings;
create trigger bookings_request_rules before insert on public.bookings
  for each row execute function public.check_request_rules();
-- Wann dürfen Schüler anfragen? (gesperrt / nur an bestimmten Wochentagen und Uhrzeiten)
alter table public.settings add column if not exists booking_closed boolean not null default false;
alter table public.settings add column if not exists booking_days text check (booking_days ~ '^[0-6](,[0-6])*$');   -- 0 = Sonntag … 6 = Samstag
alter table public.settings add column if not exists booking_from time;
alter table public.settings add column if not exists booking_to time;

create or replace function public.check_request_rules()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_start timestamptz; v_teacher uuid; v_day date; l record; v_n int; st record; v_now timestamp;
begin
  if new.status <> 'requested' or auth.uid() is null or new.student_id <> auth.uid() then return new; end if;
  select starts_at, teacher_id into v_start, v_teacher from slots where id = new.slot_id;
  if v_start is null then return new; end if;
  select * into st from settings where teacher_id = v_teacher;
  v_now := now() at time zone 'Europe/Berlin';
  -- Anfragen gesperrt oder nur zu bestimmten Zeiten
  if st.booking_closed then raise exception 'Dein Fahrlehrer hat Anfragen gerade gesperrt.'; end if;
  if st.booking_days is not null and (
       not (extract(dow from v_now)::int = any (string_to_array(st.booking_days, ',')::int[]))
       or (st.booking_from is not null and v_now::time < st.booking_from)
       or (st.booking_to is not null and v_now::time >= st.booking_to)) then
    raise exception 'Anfragen sind gerade nicht möglich – nur zu den Zeiten, die dein Fahrlehrer festgelegt hat.';
  end if;
  v_day := (v_start at time zone 'Europe/Berlin')::date;
  if st.book_ahead_days is not null and v_day > v_now::date + st.book_ahead_days then
    raise exception 'Diese Fahrstunde kann erst % Tage vorher angefragt werden.', st.book_ahead_days;
  end if;
  for l in select * from student_limits where student_id = new.student_id and v_day between from_day and to_day loop
    select count(*) into v_n from bookings b join slots s on s.id = b.slot_id
      where b.student_id = new.student_id and b.status in ('requested','offered','confirmed')
        and (s.starts_at at time zone 'Europe/Berlin')::date between l.from_day and l.to_day;
    if v_n >= l.max_count then
      raise exception 'Vom % bis % darfst du höchstens % Fahrstunde(n) anfragen.', to_char(l.from_day, 'DD.MM.'), to_char(l.to_day, 'DD.MM.'), l.max_count;
    end if;
  end loop;
  return new;
end $$;
-- Mitteilungen an alle Schüler (jeder Fahrlehrer schaltet selbst ein)
alter table public.settings add column if not exists notify_new_slots boolean not null default false;
alter table public.settings add column if not exists notify_freed boolean not null default false;
alter table public.settings add column if not exists notify_button boolean not null default false;
-- Samstag als Arbeitstag (Standard: ja; aus = Samstage in Heute/Kalender ausblenden)
alter table public.settings add column if not exists saturday_work boolean not null default true;
-- Änderungsanfrage an App-Schüler/innen: auch der Treffpunkt gilt erst nach Zusage
alter table public.bookings add column if not exists change_meeting text check (char_length(change_meeting) <= 200);

-- Schüler/in sagt zu oder ab: neue Zeit, Dauer und Treffpunkt übernehmen bzw. alles verwerfen
create or replace function public.respond_change_v2(p_booking uuid, p_accept boolean, p_note text)
returns void language plpgsql security definer set search_path = public as $$
declare b record;
begin
  if not is_active() then raise exception 'Dein Zugang ist nicht freigeschaltet'; end if;
  select x.id, x.slot_id, x.change_start, x.change_dur, x.change_meeting into b
  from bookings x where x.id = p_booking and x.student_id = auth.uid() and x.status = 'confirmed'
    and (x.change_start is not null or x.change_meeting is not null);
  if b.id is null then raise exception 'Diese Änderung ist nicht mehr offen'; end if;
  if p_accept then
    update slots set starts_at = coalesce(b.change_start, starts_at), duration_min = coalesce(b.change_dur, duration_min) where id = b.slot_id;
    if b.change_meeting is not null then
      update bookings set meeting_point = nullif(b.change_meeting, '') where id = p_booking;
    end if;
  end if;
  update bookings set change_start = null, change_dur = null, change_meeting = null, change_note = null,
    student_note = coalesce(nullif(left(trim(coalesce(p_note, '')), 300), ''), student_note)
  where id = p_booking;
end $$;
grant execute on function public.respond_change_v2(uuid, boolean, text) to authenticated;
-- Ausbildung abgeschlossen: Zeitpunkt (Schüler/in kommt ins Archiv; deaktiviert = gesperrt ohne Datum)
alter table public.profiles add column if not exists finished_at timestamptz;

-- Antworten der Schüler/innen (Angebot/Änderung angenommen oder abgelehnt, Absage) – Fahrlehrer sieht sie unter „Anfragen“, bis er sie abhakt
alter table public.bookings add column if not exists answer text;
alter table public.bookings add column if not exists answer_at timestamptz;
alter table public.bookings add column if not exists answer_seen boolean not null default true;

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
         late_cancel = v_late, decided_at = now(), answer = 'cancelled', answer_at = now(), answer_seen = false
  where id = p_booking;
  return v_late;
end $$;

create or replace function public.respond_offer(p_booking uuid, p_accept boolean, p_note text)
returns void language plpgsql security definer set search_path = public as $$
declare v_slot uuid; v_from timestamptz;
begin
  if not is_active() then raise exception 'Dein Zugang ist nicht freigeschaltet'; end if;
  select b.slot_id, b.counter_from into v_slot, v_from
  from bookings b join slots s on s.id = b.slot_id
  where b.id = p_booking and b.student_id = auth.uid() and b.status = 'offered' and s.starts_at > now();
  if v_slot is null then raise exception 'Dieses Angebot ist nicht mehr offen'; end if;
  update bookings b set
    status = case when p_accept then 'confirmed' else 'declined' end,
    student_note = coalesce(nullif(left(trim(coalesce(p_note, '')), 300), ''), b.student_note),
    counter_from = null,
    decided_at = now(),
    answer = case when p_accept then 'offer_accepted' else 'offer_declined' end, answer_at = now(), answer_seen = false
  where b.id = p_booking;
  if not p_accept and v_from is not null then
    update slots set starts_at = v_from where id = v_slot;
  end if;
end $$;

create or replace function public.respond_change_v2(p_booking uuid, p_accept boolean, p_note text)
returns void language plpgsql security definer set search_path = public as $$
declare b record;
begin
  if not is_active() then raise exception 'Dein Zugang ist nicht freigeschaltet'; end if;
  select x.id, x.slot_id, x.change_start, x.change_dur, x.change_meeting into b
  from bookings x where x.id = p_booking and x.student_id = auth.uid() and x.status = 'confirmed'
    and (x.change_start is not null or x.change_meeting is not null);
  if b.id is null then raise exception 'Diese Änderung ist nicht mehr offen'; end if;
  if p_accept then
    update slots set starts_at = coalesce(b.change_start, starts_at), duration_min = coalesce(b.change_dur, duration_min) where id = b.slot_id;
    if b.change_meeting is not null then
      update bookings set meeting_point = nullif(b.change_meeting, '') where id = p_booking;
    end if;
  end if;
  update bookings set change_start = null, change_dur = null, change_meeting = null, change_note = null,
    student_note = coalesce(nullif(left(trim(coalesce(p_note, '')), 300), ''), student_note),
    answer = case when p_accept then 'change_accepted' else 'change_declined' end, answer_at = now(), answer_seen = false
  where id = p_booking;
end $$;

-- Automatische tägliche Sicherung in der Cloud (je Fahrlehrer, die letzten 14 Tage; jede/r sieht nur die eigenen)
create table if not exists public.cloud_backups (
  id          uuid primary key default gen_random_uuid(),
  teacher_id  uuid not null references public.profiles(id) on delete cascade,
  created_at  timestamptz not null default now(),
  auto        boolean not null default true,
  counts      jsonb,
  data        jsonb not null
);
create index if not exists cloud_backups_idx on public.cloud_backups (teacher_id, created_at desc);
alter table public.cloud_backups enable row level security;
drop policy if exists cloud_backups_own on public.cloud_backups;
create policy cloud_backups_own on public.cloud_backups for select
  using (teacher_id = auth.uid() and public.is_teacher());
grant select on public.cloud_backups to authenticated;

-- Sicherung eines Fahrlehrers bauen (gleiches Format wie die Datei aus der App)
create or replace function public.build_backup(p_teacher uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare d jsonb; t record;
begin
  select id, email, first_name, last_name, slug into t from profiles where id = p_teacher;
  d := jsonb_build_object(
    'app', 'Fahrstundenplaner', 'format', 1, 'name', 'Easy Fahrstundenplaner', 'created_at', now(), 'auto', true,
    'teacher', jsonb_build_object('id', t.id, 'email', t.email, 'first_name', t.first_name, 'last_name', t.last_name, 'slug', t.slug),
    'settings', (select to_jsonb(x) from settings x where x.teacher_id = p_teacher),
    'students', coalesce((select jsonb_agg(to_jsonb(x) order by x.last_name) from profiles x where x.teacher_id = p_teacher), '[]'),
    'slots', coalesce((select jsonb_agg(to_jsonb(x) order by x.starts_at) from slots x where x.teacher_id = p_teacher), '[]'),
    'bookings', coalesce((select jsonb_agg(to_jsonb(b) order by b.created_at) from bookings b join slots s on s.id = b.slot_id where s.teacher_id = p_teacher), '[]'),
    'progress', coalesce((select jsonb_agg(to_jsonb(x)) from training_progress x join profiles p on p.id = x.student_id where p.teacher_id = p_teacher), '[]'),
    'exams', coalesce((select jsonb_agg(to_jsonb(x) order by x.exam_at) from exams x join profiles p on p.id = x.student_id where p.teacher_id = p_teacher), '[]'),
    'time_off', coalesce((select jsonb_agg(to_jsonb(x)) from time_off x where x.teacher_id = p_teacher), '[]'),
    'topics', coalesce((select jsonb_agg(to_jsonb(x)) from training_topics x where x.teacher_id = p_teacher), '[]'),
    'own_entries', coalesce((select jsonb_agg(to_jsonb(x)) from own_entries x where x.teacher_id = p_teacher), '[]'),
    'theory_lessons', coalesce((select jsonb_agg(to_jsonb(x)) from theory_lessons x where x.teacher_id = p_teacher), '[]'),
    'time_blocks', coalesce((select jsonb_agg(to_jsonb(x)) from time_blocks x where x.teacher_id = p_teacher), '[]'),
    'teacher_pay', coalesce((select jsonb_agg(to_jsonb(x)) from teacher_pay x where x.teacher_id = p_teacher), '[]'));
  return d || jsonb_build_object('counts', jsonb_build_object(
    'students', jsonb_array_length(d->'students'), 'slots', jsonb_array_length(d->'slots'),
    'bookings', jsonb_array_length(d->'bookings'), 'progress', jsonb_array_length(d->'progress'), 'exams', jsonb_array_length(d->'exams')));
end $$;
revoke all on function public.build_backup(uuid) from public, anon, authenticated;

-- Speichern + Aufräumen (älter als 14 Tage weg, höchstens 30 je Fahrlehrer)
create or replace function public.store_backup(p_teacher uuid, p_auto boolean)
returns void language plpgsql security definer set search_path = public as $$
declare d jsonb;
begin
  d := build_backup(p_teacher);
  insert into cloud_backups (teacher_id, auto, counts, data) values (p_teacher, p_auto, d->'counts', d);
  delete from cloud_backups where teacher_id = p_teacher and created_at < now() - interval '14 days';
  delete from cloud_backups where id in (select id from cloud_backups where teacher_id = p_teacher order by created_at desc offset 30);
end $$;
revoke all on function public.store_backup(uuid, boolean) from public, anon, authenticated;

-- Nachts für alle aktiven Fahrlehrer
create or replace function public.run_daily_backups()
returns int language plpgsql security definer set search_path = public as $$
declare r record; n int := 0;
begin
  for r in select id from profiles where role = 'teacher' and status = 'active' loop
    begin
      perform store_backup(r.id, true); n := n + 1;
    exception when others then raise warning 'Sicherung % fehlgeschlagen: %', r.id, sqlerrm;
    end;
  end loop;
  return n;
end $$;
revoke all on function public.run_daily_backups() from public, anon, authenticated;

-- „Jetzt sichern“ aus der App (nur für sich selbst)
create or replace function public.backup_now()
returns void language plpgsql security definer set search_path = public as $$
begin
  if not is_teacher() then raise exception 'Nur für Fahrlehrer'; end if;
  perform store_backup(auth.uid(), false);
end $$;
grant execute on function public.backup_now() to authenticated;

-- Zeitplan: jede Nacht um 02:30 Uhr (UTC 01:30)
create extension if not exists pg_cron;
select cron.schedule('fsp-daily-backup', '30 1 * * *', 'select public.run_daily_backups()');
-- gleich eine erste Sicherung anlegen
select public.run_daily_backups();

-- Zeitfenster mit eigener Höchstzahl (z. B. 14–18 Uhr höchstens 1), außerhalb gilt die normale Höchstzahl (0 = frei)
alter table public.settings add column if not exists window_max int check (window_max between 0 and 50);
-- Bisherige Einstellung beibehalten: Fenster-Grenze = alte Höchstzahl, außerhalb wie bisher frei
update public.settings set window_max = max_open, max_open = 0
where window_max is null and limit_from is not null and limit_to is not null;

create or replace function public.book_slot(p_slot uuid, p_note text, p_exception boolean default false, p_wish timestamptz default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_start timestamptz; v_max int; v_open int; v_over boolean := false;
        v_from time; v_to time; v_window boolean; v_used boolean; v_in boolean; v_own int; v_wmax int;
begin
  if not is_active() then raise exception 'Dein Zugang ist nicht freigeschaltet'; end if;
  select starts_at into v_start from slots where id = p_slot and teacher_id = my_teacher_id();
  if v_start is null then raise exception 'Termin nicht gefunden'; end if;
  if v_start < now() then raise exception 'Termin liegt in der Vergangenheit'; end if;
  if is_time_off(my_teacher_id(), v_start) then raise exception 'An diesem Tag ist dein Fahrlehrer nicht verfügbar (Urlaub/frei).'; end if;
  if p_wish is not null and p_wish <> v_start then
    if abs(extract(epoch from p_wish - v_start)) > 3600 then raise exception 'Die Wunschzeit darf höchstens 1 Stunde abweichen'; end if;
    if p_wish < now() then raise exception 'Die Wunschzeit liegt in der Vergangenheit'; end if;
  else
    p_wish := null;
  end if;
  -- Höchstzahl PRO WOCHE (Mo–So). Mit Zeitfenster zwei getrennte Zähler:
  --   im Fenster: settings.window_max · außerhalb: eigene Höchstzahl des Schülers, sonst settings.max_open (0 = frei)
  --   Schüler/in mit eigener Höchstzahl 0 (= unbegrenzt) ist überall frei.
  select p.max_open, st.max_open, st.window_max, st.limit_from, st.limit_to into v_own, v_max, v_wmax, v_from, v_to
  from profiles p join settings st on st.teacher_id = p.teacher_id where p.id = auth.uid();
  v_window := v_from is not null and v_to is not null and v_from < v_to;
  v_in := v_window and (v_start at time zone 'Europe/Berlin')::time >= v_from and (v_start at time zone 'Europe/Berlin')::time < v_to;
  if v_own = 0 then v_max := 0;
  elsif v_in then v_max := coalesce(v_wmax, v_max);
  else v_max := coalesce(v_own, v_max);
  end if;
  if coalesce(v_max, 0) > 0 then
    select count(*) into v_open from bookings b join slots s on s.id = b.slot_id
    where b.student_id = auth.uid()
      and date_trunc('week', s.starts_at at time zone 'Europe/Berlin') = date_trunc('week', v_start at time zone 'Europe/Berlin')
      and b.status in ('requested', 'offered', 'confirmed')
      and (not v_window or (((s.starts_at at time zone 'Europe/Berlin')::time >= v_from and (s.starts_at at time zone 'Europe/Berlin')::time < v_to) = v_in));
    if v_open >= v_max then
      select exists (select 1 from bookings b join slots s on s.id = b.slot_id
        where b.student_id = auth.uid() and b.over_limit
          and date_trunc('week', s.starts_at at time zone 'Europe/Berlin') = date_trunc('week', v_start at time zone 'Europe/Berlin'))
        into v_used;
      if not coalesce(p_exception, false) or v_used then
        -- „LIMIT:“ erkennt die App (Fenster „14:00-18:00“ = im Fenster, „!14:00-18:00“ = außerhalb)
        raise exception 'LIMIT:%:%:%|%', v_open, v_max,
          case when v_window then (case when v_in then '' else '!' end) || to_char(v_from, 'HH24:MI') || '-' || to_char(v_to, 'HH24:MI') else '' end,
          case when v_used then 'U' else 'N' end;
      end if;
      if coalesce(trim(p_note), '') = '' then raise exception 'Bitte schreib deinem Fahrlehrer kurz, warum du eine weitere Fahrstunde möchtest'; end if;
      v_over := true;
    end if;
  end if;
  begin
    insert into bookings (slot_id, student_id, student_note, over_limit, wish_start)
    values (p_slot, auth.uid(), nullif(left(trim(coalesce(p_note,'')), 300), ''), v_over, p_wish)
    returning id into v_id;
  exception when unique_violation then
    raise exception 'Dieser Termin ist leider schon vergeben';
  end;
  return v_id;
end $$;
grant execute on function public.book_slot(uuid, text, boolean, timestamptz) to authenticated;

-- ===== November-Paket: Lohn-Schalter, Notizen, Wunsch-Treffpunkt, Übergabe an anderen Fahrlehrer, 3 Monate Lesezugriff =====

-- Fahrstunde zählt nicht für den Lohn + private Notiz des Fahrlehrers
alter table public.bookings add column if not exists no_pay boolean not null default false;
alter table public.bookings add column if not exists teacher_note text check (char_length(teacher_note) <= 1000);
alter table public.own_entries add column if not exists no_pay boolean not null default false;
-- Wunsch-Treffpunkt der Schülerin / des Schülers bei der Anfrage
alter table public.bookings add column if not exists wish_meeting text check (char_length(wish_meeting) <= 200);

create or replace function public.set_wish_meeting(p_booking uuid, p_text text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not is_active() then raise exception 'Dein Zugang ist nicht freigeschaltet'; end if;
  update bookings set wish_meeting = nullif(left(trim(coalesce(p_text, '')), 200), '')
  where id = p_booking and student_id = auth.uid() and status = 'requested';
end $$;
grant execute on function public.set_wish_meeting(uuid, text) to authenticated;

-- Gesperrt seit (für 3 Monate Lesezugriff nach Sperre / Abschluss)
alter table public.profiles add column if not exists blocked_at timestamptz;
update public.profiles set blocked_at = coalesce(finished_at, now()) where status = 'blocked' and blocked_at is null;
create or replace function public.track_blocked_at()
returns trigger language plpgsql as $$
begin
  if new.status = 'blocked' and old.status is distinct from 'blocked' then new.blocked_at := now();
  elsif new.status <> 'blocked' then new.blocked_at := null;
  end if;
  return new;
end $$;
drop trigger if exists profiles_blocked_at on public.profiles;
create trigger profiles_blocked_at before update of status on public.profiles
  for each row execute function public.track_blocked_at();

-- Schüler/in darf die eigenen Fahrstunden noch ansehen: aktiv ODER bis 3 Monate nach Sperre/Abschluss/Ablauf
create or replace function public.can_view_own()
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_active() or exists (
    select 1 from profiles p where p.id = auth.uid() and p.role = 'student' and (
      (p.status = 'blocked' and coalesce(p.blocked_at, p.finished_at, now()) >= now() - interval '90 days')
      or (p.status = 'active' and p.valid_until is not null and p.valid_until >= current_date - 90 - 28)));
$$;
grant execute on function public.can_view_own() to authenticated;

drop policy if exists bookings_select on public.bookings;
create policy bookings_select on public.bookings for select
  using (student_id = auth.uid() and public.can_view_own());
drop policy if exists slots_own on public.slots;
create policy slots_own on public.slots for select
  using (public.can_view_own() and public.has_own_booking(id));
drop policy if exists progress_select on public.training_progress;
create policy progress_select on public.training_progress for select
  using ((student_id = auth.uid() and public.can_view_own())
         or (public.is_teacher() and public.student_teacher(student_id) = auth.uid()));
drop policy if exists exams_select on public.exams;
create policy exams_select on public.exams for select
  using (student_id = auth.uid() and public.can_view_own());
drop policy if exists topics_select on public.training_topics;
create policy topics_select on public.training_topics for select
  using (public.can_view_own() and (teacher_id is null or teacher_id = public.my_teacher_id()));

-- Übergabe an anderen Fahrlehrer
alter table public.profiles add column if not exists transferred_from uuid references public.profiles(id) on delete set null;
alter table public.profiles add column if not exists transfer_to_name text;
alter table public.profiles add column if not exists transferred_at timestamptz;
alter table public.profiles add column if not exists transfer_ack boolean not null default true;

-- Frühere Schüler/innen (Fahrstunden auf meinen Terminen): Namen weiter sichtbar (Kontrolle, Lohn)
create or replace function public.taught_by_me(p_student uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from bookings b join slots s on s.id = b.slot_id where b.student_id = p_student and s.teacher_id = auth.uid());
$$;
grant execute on function public.taught_by_me(uuid) to authenticated;
drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles for select
  using (id = auth.uid()
         or (public.is_teacher() and teacher_id = auth.uid())
         or (public.is_teacher() and role = 'student' and public.taught_by_me(id))
         or (public.is_owner() and role = 'teacher')
         or (public.is_school_admin() and role = 'teacher' and school_id = auth.uid()));

-- Mögliche Ziel-Fahrlehrer (aktive, gültige Fahrlehrer außer mir)
create or replace function public.transfer_targets()
returns table (id uuid, display_name text)
language sql stable security definer set search_path = public as $$
  select p.id, coalesce(nullif(s.display_name, ''), trim(p.first_name || ' ' || p.last_name))
  from profiles p left join settings s on s.teacher_id = p.id
  where p.role = 'teacher' and p.status = 'active' and p.id <> auth.uid() and public.teacher_valid(p.id) and public.is_teacher()
  order by 2;
$$;
grant execute on function public.transfer_targets() to authenticated;

-- Schüler/in übergeben: nur der aktuelle Fahrlehrer. Offene Anfragen/Angebote und künftige Fahrstunden beim alten Fahrlehrer werden abgesagt.
create or replace function public.transfer_student(p_student uuid, p_teacher uuid)
returns int language plpgsql security definer set search_path = public as $$
declare v_name text; v_n int;
begin
  if not is_teacher() then raise exception 'Nur Fahrlehrer'; end if;
  if not exists (select 1 from profiles where id = p_student and role = 'student' and teacher_id = auth.uid()) then
    raise exception 'Diese/r Schüler/in gehört nicht zu dir';
  end if;
  if p_teacher = auth.uid() or not teacher_valid(p_teacher) then raise exception 'Bitte einen gültigen Fahrlehrer wählen'; end if;
  select coalesce(nullif(s.display_name, ''), trim(p.first_name || ' ' || p.last_name)) into v_name
  from profiles p left join settings s on s.teacher_id = p.id where p.id = p_teacher;
  update bookings b set status = 'cancelled_teacher', cancel_reason = 'Fahrlehrerwechsel', late_cancel = false, decided_at = now()
  from slots s where s.id = b.slot_id and b.student_id = p_student and s.teacher_id = auth.uid()
    and b.status in ('requested', 'offered', 'confirmed') and b.actual_minutes is null and s.starts_at > now();
  get diagnostics v_n = row_count;
  delete from student_limits where student_id = p_student;
  update profiles set teacher_id = p_teacher, transferred_from = auth.uid(), transfer_to_name = v_name,
    transferred_at = now(), transfer_ack = false, max_open = null
  where id = p_student;
  return v_n;
end $$;
grant execute on function public.transfer_student(uuid, uuid) to authenticated;

-- Schüler/in bestätigt, dass er/sie die Übergabe gesehen hat
create or replace function public.ack_transfer()
returns void language sql security definer set search_path = public as $$
  update profiles set transfer_ack = true where id = auth.uid();
$$;
grant execute on function public.ack_transfer() to authenticated;

-- Funktionen ein-/ausschalten je Fahrlehrer (Einstellungen → Funktionen). Leer = alles an; ausgeschaltet = { "schluessel": false }
alter table public.settings add column if not exists features jsonb not null default '{}'::jsonb;

-- Vorabend-Erinnerung an Schüler/innen (je Fahrlehrer unter Einstellungen → Funktionen einschaltbar, Standard: aus)
-- Geheimer Schlüssel für den Zeitplan – nur die Datenbank und die notify-Funktion kennen ihn (keine Lese-Rechte für App-Nutzer)
create table if not exists public.app_secrets (name text primary key, value text not null);
alter table public.app_secrets enable row level security;
revoke all on public.app_secrets from anon, authenticated;
insert into public.app_secrets (name, value) values ('cron', replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '')) on conflict (name) do nothing;

create extension if not exists pg_net;
create extension if not exists pg_cron;
-- Jeden Abend um 18:00 Uhr (Winterzeit; Sommerzeit 19:00): notify-Funktion schickt die Erinnerungen für morgen
select cron.schedule('fsp-evening-reminder', '0 17 * * *', $cron$
  select net.http_post(
    url := 'https://bxyxickwkfzefuixijmt.supabase.co/functions/v1/notify',
    headers := jsonb_build_object('Content-Type', 'application/json',
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJ4eXhpY2t3a2Z6ZWZ1aXhpam10Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTM0MDI0NjksImV4cCI6MjEwODk3ODQ2OX0.h78Sm2TqP8zsVt9D61ksN1UbWTXXKfcvtBt3ctxisT4',
      'x-cron-secret', (select value from public.app_secrets where name = 'cron')),
    body := '{"kind":"evening"}'::jsonb)
$cron$);

-- Fahrstunde im Fahrschulsystem an einem anderen Tag eingetragen (z. B. gefahren am 14.01., aufgeschrieben am 10.01.)
alter table public.bookings add column if not exists booked_on date;
alter table public.own_entries add column if not exists booked_on date;

-- Prüfungsergebnis auch bei Schüler/innen ohne App (NULL = noch offen)
alter table public.own_entries add column if not exists exam_result text check (exam_result in ('passed','failed'));

-- Theorieunterricht abhaken (gehalten)
alter table public.theory_lessons add column if not exists done boolean not null default false;

-- Archiv für Schüler/innen ohne App: aus der aktiven Liste raus; 1 Jahr nach dem Archivieren automatisch gelöscht
alter table public.own_entries add column if not exists archived_at timestamptz;
select cron.schedule('fsp-own-archive-cleanup', '30 3 * * *', $cron$
  delete from public.own_entries where archived_at is not null and archived_at < now() - interval '1 year'
$cron$);

-- ===== Paket Nov. 2026: Verspätung, Rückmeldung, Warteliste, Erinnerung 1 Std. vorher =====
alter table public.bookings add column if not exists late_student int;          -- Schüler/in kommt X Min. später
alter table public.bookings add column if not exists late_teacher int;          -- Fahrlehrer/in kommt X Min. später
alter table public.bookings add column if not exists student_feedback smallint check (student_feedback in (-1, 1));  -- 👍 / 👎 (nur Fahrlehrer/in sieht es)
alter table public.bookings add column if not exists hour_reminded boolean not null default false;

-- Verspätung melden (5–25 Min., 0 = zurücknehmen): Schüler/in für die eigene, Fahrlehrer/in für eigene Termine
create or replace function public.announce_late(p_booking uuid, p_min int)
returns text language plpgsql security definer set search_path = public as $$
declare b record;
begin
  if p_min not in (0, 5, 10, 15, 20, 25) then raise exception 'Ungültige Minuten'; end if;
  select bk.id, bk.student_id, bk.status, s.teacher_id, s.starts_at into b
    from bookings bk join slots s on s.id = bk.slot_id where bk.id = p_booking;
  if b.id is null or b.status <> 'confirmed' then raise exception 'Fahrstunde nicht gefunden'; end if;
  if b.starts_at < now() - interval '2 hours' then raise exception 'Die Fahrstunde ist schon vorbei'; end if;
  if auth.uid() = b.student_id then
    update bookings set late_student = nullif(p_min, 0) where id = p_booking; return 'student';
  elsif auth.uid() = b.teacher_id then
    update bookings set late_teacher = nullif(p_min, 0) where id = p_booking; return 'teacher';
  end if;
  raise exception 'Nicht erlaubt';
end $$;
grant execute on function public.announce_late(uuid, int) to authenticated;

-- Rückmeldung nach der Fahrstunde (nur der/die Schüler/in selbst, nur gefahrene Fahrstunden)
create or replace function public.set_feedback(p_booking uuid, p_val smallint)
returns void language plpgsql security definer set search_path = public as $$
begin
  if p_val is not null and p_val not in (-1, 1) then raise exception 'Ungültig'; end if;
  update bookings set student_feedback = p_val
   where id = p_booking and student_id = auth.uid() and status = 'confirmed' and actual_minutes is not null;
  if not found then raise exception 'Fahrstunde nicht gefunden'; end if;
end $$;
grant execute on function public.set_feedback(uuid, smallint) to authenticated;

-- Warteliste: „Benachrichtige mich, wenn an diesem Tag etwas frei wird“
create table if not exists public.waitlist (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.profiles(id) on delete cascade default auth.uid(),
  teacher_id uuid not null references public.profiles(id) on delete cascade,
  day date not null,
  created_at timestamptz not null default now(),
  unique (student_id, day)
);
alter table public.waitlist enable row level security;
drop policy if exists waitlist_student on public.waitlist;
create policy waitlist_student on public.waitlist for all to authenticated
  using (student_id = auth.uid())
  with check (student_id = auth.uid() and day >= current_date
    and teacher_id = (select p.teacher_id from public.profiles p where p.id = auth.uid()));
drop policy if exists waitlist_teacher on public.waitlist;
create policy waitlist_teacher on public.waitlist for select to authenticated using (teacher_id = auth.uid());

-- Erinnerung 1 Std. vorher (je Fahrlehrer/in unter Einstellungen → Funktionen) – alle 10 Minuten prüfen
select cron.schedule('fsp-hour-reminder', '*/10 * * * *', $cron$
  select net.http_post(
    url := 'https://bxyxickwkfzefuixijmt.supabase.co/functions/v1/notify',
    headers := jsonb_build_object('Content-Type', 'application/json',
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJ4eXhpY2t3a2Z6ZWZ1aXhpam10Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTM0MDI0NjksImV4cCI6MjEwODk3ODQ2OX0.h78Sm2TqP8zsVt9D61ksN1UbWTXXKfcvtBt3ctxisT4',
      'x-cron-secret', (select value from public.app_secrets where name = 'cron')),
    body := '{"kind":"hour"}'::jsonb)
$cron$);
-- Alte Wartelisten-Einträge täglich aufräumen
select cron.schedule('fsp-waitlist-cleanup', '15 3 * * *', $cron$ delete from public.waitlist where day < current_date $cron$);

-- Schon genommene Urlaubstage selbst eintragen (z. B. vor der App), gilt für das angegebene Jahr
alter table public.teacher_pay add column if not exists vacation_taken int check (vacation_taken between 0 and 366);
alter table public.teacher_pay add column if not exists vacation_taken_year int;

-- Übergabe nur innerhalb derselben Fahrschule
-- Fahrschule eines Fahrlehrers: Fahrschul-Admin = eigene id, sonst school_id (leer = Fahrschule des Haupt-Admins)
create or replace function public.school_key(p_id uuid)
returns uuid language sql stable security definer set search_path = public as $$
  select case when p.is_school_admin then p.id else p.school_id end from profiles p where p.id = p_id;
$$;
create or replace function public.transfer_targets()
returns table (id uuid, display_name text)
language sql stable security definer set search_path = public as $$
  select p.id, coalesce(nullif(s.display_name, ''), trim(p.first_name || ' ' || p.last_name))
  from profiles p left join settings s on s.teacher_id = p.id
  where p.role = 'teacher' and p.status = 'active' and p.id <> auth.uid() and public.teacher_valid(p.id) and public.is_teacher()
    and public.school_key(p.id) is not distinct from public.school_key(auth.uid())
  order by 2;
$$;
grant execute on function public.transfer_targets() to authenticated;
-- Übergabe selbst ebenfalls nur innerhalb derselben Fahrschule
create or replace function public.transfer_student(p_student uuid, p_teacher uuid)
returns int language plpgsql security definer set search_path = public as $$
declare v_name text; v_n int;
begin
  if not is_teacher() then raise exception 'Nur Fahrlehrer'; end if;
  if not exists (select 1 from profiles where id = p_student and role = 'student' and teacher_id = auth.uid()) then
    raise exception 'Diese/r Schüler/in gehört nicht zu dir';
  end if;
  if p_teacher = auth.uid() or not teacher_valid(p_teacher) then raise exception 'Bitte einen gültigen Fahrlehrer wählen'; end if;
  if public.school_key(p_teacher) is distinct from public.school_key(auth.uid()) then
    raise exception 'Übergabe nur an Kollegen/Kolleginnen derselben Fahrschule';
  end if;
  select coalesce(nullif(s.display_name, ''), trim(p.first_name || ' ' || p.last_name)) into v_name
  from profiles p left join settings s on s.teacher_id = p.id where p.id = p_teacher;
  update bookings b set status = 'cancelled_teacher', cancel_reason = 'Fahrlehrerwechsel', late_cancel = false, decided_at = now()
  from slots s where s.id = b.slot_id and b.student_id = p_student and s.teacher_id = auth.uid()
    and b.status in ('requested', 'offered', 'confirmed') and b.actual_minutes is null and s.starts_at > now();
  get diagnostics v_n = row_count;
  delete from student_limits where student_id = p_student;
  update profiles set teacher_id = p_teacher, transferred_from = auth.uid(), transfer_to_name = v_name,
    transferred_at = now(), transfer_ack = false, max_open = null
  where id = p_student;
  return v_n;
end $$;

-- ===== Uhrzeit-Grenzen je Schüler/in: z. B. 14–18 Uhr höchstens 1 Fahrstunde pro Woche; außerhalb gelten die allgemeinen Regeln =====
create table if not exists public.student_time_limits (
  id          uuid primary key default gen_random_uuid(),
  student_id  uuid not null references public.profiles(id) on delete cascade,
  from_time   time not null,
  to_time     time not null,
  max_count   int not null check (max_count between 0 and 50),
  created_at  timestamptz not null default now(),
  check (to_time > from_time)
);
create index if not exists student_time_limits_idx on public.student_time_limits (student_id);
alter table public.student_time_limits enable row level security;
drop policy if exists tlimits_teacher on public.student_time_limits;
create policy tlimits_teacher on public.student_time_limits for all
  using (public.is_teacher() and public.student_teacher(student_id) = auth.uid())
  with check (public.is_teacher() and public.student_teacher(student_id) = auth.uid());
drop policy if exists tlimits_own on public.student_time_limits;
create policy tlimits_own on public.student_time_limits for select using (student_id = auth.uid());
grant select, insert, update, delete on public.student_time_limits to authenticated;

create or replace function public.book_slot(p_slot uuid, p_note text, p_exception boolean default false, p_wish timestamptz default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_start timestamptz; v_max int; v_open int; v_over boolean := false;
        v_from time; v_to time; v_window boolean; v_used boolean; v_in boolean; v_own int; v_wmax int;
        v_t time; w record; v_win text := '';
begin
  if not is_active() then raise exception 'Dein Zugang ist nicht freigeschaltet'; end if;
  select starts_at into v_start from slots where id = p_slot and teacher_id = my_teacher_id();
  if v_start is null then raise exception 'Termin nicht gefunden'; end if;
  if v_start < now() then raise exception 'Termin liegt in der Vergangenheit'; end if;
  if is_time_off(my_teacher_id(), v_start) then raise exception 'An diesem Tag ist dein Fahrlehrer nicht verfügbar (Urlaub/frei).'; end if;
  if p_wish is not null and p_wish <> v_start then
    if abs(extract(epoch from p_wish - v_start)) > 3600 then raise exception 'Die Wunschzeit darf höchstens 1 Stunde abweichen'; end if;
    if p_wish < now() then raise exception 'Die Wunschzeit liegt in der Vergangenheit'; end if;
  else
    p_wish := null;
  end if;
  v_t := (v_start at time zone 'Europe/Berlin')::time;
  -- 1) Eigene Uhrzeit-Grenze der Schülerin / des Schülers (pro Woche Mo–So) – hat Vorrang
  select * into w from student_time_limits where student_id = auth.uid() and v_t >= from_time and v_t < to_time
    order by max_count limit 1;
  if found then
    v_max := w.max_count;
    v_win := to_char(w.from_time, 'HH24:MI') || '-' || to_char(w.to_time, 'HH24:MI');
    select count(*) into v_open from bookings b join slots s on s.id = b.slot_id
    where b.student_id = auth.uid() and b.status in ('requested', 'offered', 'confirmed')
      and date_trunc('week', s.starts_at at time zone 'Europe/Berlin') = date_trunc('week', v_start at time zone 'Europe/Berlin')
      and (s.starts_at at time zone 'Europe/Berlin')::time >= w.from_time and (s.starts_at at time zone 'Europe/Berlin')::time < w.to_time;
    if v_max = 0 then v_max := -1; end if;   -- 0 = in dieser Zeit gar nicht (wird unten als Grenze erreicht behandelt)
  else
    -- 2) Allgemeine Regeln: Zeitfenster des Fahrlehrers bzw. normale Höchstzahl (Fahrstunden in eigenen Uhrzeit-Grenzen zählen hier nicht mit)
    select p.max_open, st.max_open, st.window_max, st.limit_from, st.limit_to into v_own, v_max, v_wmax, v_from, v_to
    from profiles p join settings st on st.teacher_id = p.teacher_id where p.id = auth.uid();
    v_window := v_from is not null and v_to is not null and v_from < v_to;
    v_in := v_window and v_t >= v_from and v_t < v_to;
    if v_own = 0 then v_max := 0;
    elsif v_in then v_max := coalesce(v_wmax, v_max);
    else v_max := coalesce(v_own, v_max);
    end if;
    if v_window then v_win := (case when v_in then '' else '!' end) || to_char(v_from, 'HH24:MI') || '-' || to_char(v_to, 'HH24:MI'); end if;
    if coalesce(v_max, 0) > 0 then
      select count(*) into v_open from bookings b join slots s on s.id = b.slot_id
      where b.student_id = auth.uid()
        and date_trunc('week', s.starts_at at time zone 'Europe/Berlin') = date_trunc('week', v_start at time zone 'Europe/Berlin')
        and b.status in ('requested', 'offered', 'confirmed')
        and (not v_window or (((s.starts_at at time zone 'Europe/Berlin')::time >= v_from and (s.starts_at at time zone 'Europe/Berlin')::time < v_to) = v_in))
        and not exists (select 1 from student_time_limits x where x.student_id = auth.uid()
          and (s.starts_at at time zone 'Europe/Berlin')::time >= x.from_time and (s.starts_at at time zone 'Europe/Berlin')::time < x.to_time);
    end if;
  end if;
  if v_max = -1 or (coalesce(v_max, 0) > 0 and v_open >= v_max) then
    select exists (select 1 from bookings b join slots s on s.id = b.slot_id
      where b.student_id = auth.uid() and b.over_limit
        and date_trunc('week', s.starts_at at time zone 'Europe/Berlin') = date_trunc('week', v_start at time zone 'Europe/Berlin'))
      into v_used;
    if not coalesce(p_exception, false) or v_used then
      -- „LIMIT:“ erkennt die App (Fenster „14:00-18:00“ = im Fenster, „!14:00-18:00“ = außerhalb)
      raise exception 'LIMIT:%:%:%|%', coalesce(v_open, 0), greatest(v_max, 0), v_win, case when v_used then 'U' else 'N' end;
    end if;
    if coalesce(trim(p_note), '') = '' then raise exception 'Bitte schreib deinem Fahrlehrer kurz, warum du eine weitere Fahrstunde möchtest'; end if;
    v_over := true;
  end if;
  begin
    insert into bookings (slot_id, student_id, student_note, over_limit, wish_start)
    values (p_slot, auth.uid(), nullif(left(trim(coalesce(p_note,'')), 300), ''), v_over, p_wish)
    returning id into v_id;
  exception when unique_violation then
    raise exception 'Dieser Termin ist leider schon vergeben';
  end;
  return v_id;
end $$;
grant execute on function public.book_slot(uuid, text, boolean, timestamptz) to authenticated;

-- ===== Automatische Sicherung nach jeder deutlichen Änderung (abhaken, bestätigen, private Termine, Einstellungen …) =====
-- Art der Sicherung: 'daily' (nachts), 'manual' (von Hand), 'change' (nach Änderung)
alter table public.cloud_backups add column if not exists kind text not null default 'daily' check (kind in ('daily', 'manual', 'change'));
update public.cloud_backups set kind = 'manual' where auto = false and kind = 'daily';

-- Nächtliche/manuelle Sicherungen: Aufbewahrung wie bisher, Änderungs-Sicherungen zählen dabei nicht mit
create or replace function public.store_backup(p_teacher uuid, p_auto boolean)
returns void language plpgsql security definer set search_path = public as $$
declare d jsonb;
begin
  d := build_backup(p_teacher);
  insert into cloud_backups (teacher_id, auto, counts, data, kind) values (p_teacher, p_auto, d->'counts', d, case when p_auto then 'daily' else 'manual' end);
  delete from cloud_backups where teacher_id = p_teacher and created_at < now() - interval '14 days';
  delete from cloud_backups where id in (select id from cloud_backups where teacher_id = p_teacher and kind <> 'change' order by created_at desc offset 30);
end $$;
revoke all on function public.store_backup(uuid, boolean) from public, anon, authenticated;

-- Nach einer Änderung (die App ruft das gebündelt ca. 30 Sek. nach der letzten Änderung auf):
-- es gibt genau EINE Änderungs-Sicherung pro Fahrlehrer – sie wird jedes Mal überschrieben (die nächtlichen bleiben 14 Tage)
create or replace function public.backup_after_change()
returns void language plpgsql security definer set search_path = public as $$
declare d jsonb; v_id uuid;
begin
  if not is_teacher() then raise exception 'Nur für Fahrlehrer'; end if;
  d := build_backup(auth.uid());
  select id into v_id from cloud_backups where teacher_id = auth.uid() and kind = 'change' order by created_at desc limit 1;
  if v_id is not null then
    update cloud_backups set data = d, counts = d->'counts', created_at = now() where id = v_id;
  else
    insert into cloud_backups (teacher_id, auto, counts, data, kind) values (auth.uid(), true, d->'counts', d, 'change');
  end if;
  delete from cloud_backups where teacher_id = auth.uid() and kind = 'change' and id <> coalesce(v_id, (select id from cloud_backups where teacher_id = auth.uid() and kind = 'change' order by created_at desc limit 1));
end $$;
grant execute on function public.backup_after_change() to authenticated;

-- ===== Paket 12.11.2026: Ausbildung in 4 Stufen, Technik/Grundfahraufgaben je Fahrstunde, Attest-Foto, Übergabe mit Bestätigung =====

-- 1) Ausbildungsstand: 4 Stufen (1 eingeführt · 2 geübt, noch unsicher · 3 gute Fortschritte · 4 beherrscht)
--    Bisher 3 = „sicher“ → wird zu 4 = „beherrscht“ (läuft nur einmal, solange noch die alte 1–3-Regel besteht)
do $$
declare c record; v_old boolean := false;
begin
  for c in select conname, pg_get_constraintdef(oid) d from pg_constraint
           where conrelid = 'public.training_progress'::regclass and contype = 'c' and pg_get_constraintdef(oid) like '%level%' loop
    if c.d like '%<= 3%' then v_old := true; end if;
    execute format('alter table public.training_progress drop constraint %I', c.conname);
  end loop;
  if v_old then update public.training_progress set level = 4 where level = 3; end if;
  alter table public.training_progress add constraint training_progress_level_check check (level between 1 and 4);
end $$;

-- 2) Neue Stufe „Technik“ mit den Prüfpunkten der Abfahrtkontrolle
do $$
declare c record;
begin
  for c in select conname from pg_constraint
           where conrelid = 'public.training_topics'::regclass and contype = 'c' and pg_get_constraintdef(oid) like '%stage%' loop
    execute format('alter table public.training_topics drop constraint %I', c.conname);
  end loop;
  alter table public.training_topics add constraint training_topics_stage_check
    check (stage in ('grund','aufbau','leistung','grundfahr','sonder','technik','reife','eigene'));
end $$;
insert into public.training_topics (id, stage, sort, title) values
  ('t01', 'technik', 41, 'Motorraum (Ölstand, Kühlmittel, Bremsflüssigkeit, Scheibenwaschwasser)'),
  ('t02', 'technik', 42, 'Beleuchtungseinrichtungen innen einschalten (Schalter, Kontrollleuchten)'),
  ('t03', 'technik', 43, 'Beleuchtungseinrichtungen außen prüfen'),
  ('t04', 'technik', 44, 'Reifen (Profil, Luftdruck, Beschädigungen)')
on conflict (id) do update set stage = excluded.stage, sort = excluded.sort, title = excluded.title;

-- 3) Was in einer Fahrstunde gemacht wurde (Technik, Grundfahraufgaben) – Themen-Kürzel, z. B. {t01,f02}
alter table public.bookings add column if not exists lesson_topics text[];

-- 5) Übergabe nur mit Bestätigung der neuen Fahrlehrerin / des neuen Fahrlehrers
alter table public.profiles add column if not exists transfer_request_to uuid references public.profiles(id) on delete set null;
alter table public.profiles add column if not exists transfer_request_at timestamptz;

-- Übergabe ausführen (intern): künftige Termine beim bisherigen Fahrlehrer absagen, Schüler/in umhängen
create or replace function public.do_transfer(p_student uuid, p_from uuid, p_to uuid)
returns int language plpgsql security definer set search_path = public as $$
declare v_name text; v_n int;
begin
  select coalesce(nullif(s.display_name, ''), trim(p.first_name || ' ' || p.last_name)) into v_name
  from profiles p left join settings s on s.teacher_id = p.id where p.id = p_to;
  update bookings b set status = 'cancelled_teacher', cancel_reason = 'Fahrlehrerwechsel', late_cancel = false, decided_at = now()
  from slots s where s.id = b.slot_id and b.student_id = p_student and s.teacher_id = p_from
    and b.status in ('requested', 'offered', 'confirmed') and b.actual_minutes is null and s.starts_at > now();
  get diagnostics v_n = row_count;
  delete from student_limits where student_id = p_student;
  delete from student_time_limits where student_id = p_student;
  update profiles set teacher_id = p_to, transferred_from = p_from, transfer_to_name = v_name,
    transferred_at = now(), transfer_ack = false, max_open = null, transfer_request_to = null, transfer_request_at = null
  where id = p_student;
  return v_n;
end $$;
revoke all on function public.do_transfer(uuid, uuid, uuid) from public, anon, authenticated;

-- Bisheriger Fahrlehrer: Übergabe anfragen (p_teacher = null → Anfrage zurückziehen)
create or replace function public.request_transfer(p_student uuid, p_teacher uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not is_teacher() then raise exception 'Nur Fahrlehrer'; end if;
  if not exists (select 1 from profiles where id = p_student and role = 'student' and teacher_id = auth.uid()) then
    raise exception 'Diese/r Schüler/in gehört nicht zu dir';
  end if;
  if p_teacher is not null then
    if p_teacher = auth.uid() or not teacher_valid(p_teacher) then raise exception 'Bitte einen gültigen Fahrlehrer wählen'; end if;
    if public.school_key(p_teacher) is distinct from public.school_key(auth.uid()) then
      raise exception 'Übergabe nur an Kollegen/Kolleginnen derselben Fahrschule';
    end if;
  end if;
  update profiles set transfer_request_to = p_teacher, transfer_request_at = case when p_teacher is null then null else now() end
  where id = p_student;
end $$;
grant execute on function public.request_transfer(uuid, uuid) to authenticated;

-- Neuer Fahrlehrer: offene Übergabe-Anfragen an mich
create or replace function public.incoming_transfers()
returns table (student_id uuid, first_name text, last_name text, license_class text, from_id uuid, from_name text, requested_at timestamptz)
language sql stable security definer set search_path = public as $$
  select p.id, p.first_name, p.last_name, p.license_class, p.teacher_id,
         coalesce(nullif(s.display_name, ''), trim(t.first_name || ' ' || t.last_name)), p.transfer_request_at
  from profiles p join profiles t on t.id = p.teacher_id left join settings s on s.teacher_id = t.id
  where p.transfer_request_to = auth.uid() and p.role = 'student' and public.is_teacher()
  order by p.transfer_request_at;
$$;
grant execute on function public.incoming_transfers() to authenticated;

-- Neuer Fahrlehrer: annehmen oder ablehnen
create or replace function public.answer_transfer(p_student uuid, p_accept boolean)
returns int language plpgsql security definer set search_path = public as $$
declare v_from uuid;
begin
  if not is_teacher() then raise exception 'Nur Fahrlehrer'; end if;
  select teacher_id into v_from from profiles where id = p_student and transfer_request_to = auth.uid();
  if v_from is null then raise exception 'Keine offene Übergabe gefunden'; end if;
  if not p_accept then
    update profiles set transfer_request_to = null, transfer_request_at = null where id = p_student;
    return 0;
  end if;
  return public.do_transfer(p_student, v_from, auth.uid());
end $$;
grant execute on function public.answer_transfer(uuid, boolean) to authenticated;

-- Alle Fahrstunden einer Schülerin / eines Schülers, auch die bei früheren Fahrlehrern (mit Namen, nur lesen)
create or replace function public.student_lessons_all(p_student uuid)
returns table (id uuid, status text, actual_minutes int, lesson_type text, late_cancel boolean, cancel_reason text,
               starts_at timestamptz, duration_min int, teacher_id uuid, teacher_name text, lesson_topics text[])
language sql stable security definer set search_path = public as $$
  select b.id, b.status, b.actual_minutes, b.lesson_type, b.late_cancel, b.cancel_reason, s.starts_at, s.duration_min, s.teacher_id,
         coalesce(nullif(st.display_name, ''), trim(t.first_name || ' ' || t.last_name)), b.lesson_topics
  from bookings b join slots s on s.id = b.slot_id join profiles t on t.id = s.teacher_id left join settings st on st.teacher_id = t.id
  where b.student_id = p_student and public.is_teacher() and public.student_teacher(p_student) = auth.uid()
  order by s.starts_at desc;
$$;
grant execute on function public.student_lessons_all(uuid) to authenticated;

-- 6) Bewertung der Fahrstunde durch den Fahrlehrer (nur für den Fahrlehrer sichtbar – eigene Tabelle, Schüler/innen sehen sie nie)
create table if not exists public.lesson_reviews (
  booking_id  uuid primary key references public.bookings(id) on delete cascade,
  teacher_id  uuid not null references public.profiles(id) on delete cascade,
  student_id  uuid references public.profiles(id) on delete cascade,
  rating      smallint check (rating in (-1, 0, 1)),
  traits      text[],
  updated_at  timestamptz not null default now()
);
create index if not exists lesson_reviews_student_idx on public.lesson_reviews (student_id, updated_at desc);
alter table public.lesson_reviews enable row level security;
drop policy if exists lesson_reviews_teacher on public.lesson_reviews;
create policy lesson_reviews_teacher on public.lesson_reviews for all
  using (teacher_id = auth.uid() and public.is_teacher())
  with check (teacher_id = auth.uid() and public.is_teacher());
grant select, insert, update, delete on public.lesson_reviews to authenticated;

-- 7) Rückmeldung der Schüler/innen: 👍 / 👌 Mittel / 👎
do $$
declare c record;
begin
  for c in select conname from pg_constraint
           where conrelid = 'public.bookings'::regclass and contype = 'c' and pg_get_constraintdef(oid) like '%student_feedback%' loop
    execute format('alter table public.bookings drop constraint %I', c.conname);
  end loop;
  alter table public.bookings add constraint bookings_student_feedback_check check (student_feedback in (-1, 0, 1));
end $$;
create or replace function public.set_feedback(p_booking uuid, p_val smallint)
returns void language plpgsql security definer set search_path = public as $$
begin
  if p_val is not null and p_val not in (-1, 0, 1) then raise exception 'Ungültig'; end if;
  update bookings set student_feedback = p_val
   where id = p_booking and student_id = auth.uid() and status = 'confirmed' and actual_minutes is not null;
  if not found then raise exception 'Fahrstunde nicht gefunden'; end if;
end $$;
grant execute on function public.set_feedback(uuid, smallint) to authenticated;

-- 8) Bewertung des Fahrlehrers für Schüler/innen sichtbar (zur Motivation; schaltbar: settings.features.review_to_student)
--    👍 und 👌 mit Eigenschaften wie eingetragen. 👎 sieht der/die Schüler/in NIE – stattdessen aufmunternde Formulierungen.
create or replace function public.my_lesson_reviews()
returns table (booking_id uuid, rating smallint, traits text[])
language sql stable security definer set search_path = public as $$
  select r.booking_id, r.rating,
    case when r.rating = -1 then array(
      select coalesce(m.nice, t) from unnest(r.traits) with ordinality u(t, n)
      left join (values
        ('unsicher', 'Sicherheit kommt mit jeder Fahrstunde'),
        ('angespannt', 'Locker bleiben – du schaffst das'),
        ('gestresst', 'Ruhig atmen, Schritt für Schritt'),
        ('unkonzentriert', 'Nächstes Mal voll konzentriert'),
        ('verwirrt', 'Wir gehen es nochmal in Ruhe durch'),
        ('überfordert', 'Wir machen es Schritt für Schritt'),
        ('müde', 'Ausgeschlafen fährt es sich leichter'),
        ('zu schnell', 'Etwas mehr Ruhe beim Tempo'),
        ('zu zögerlich', 'Mehr Mut – du kannst das')
      ) m(raw, nice) on m.raw = u.t
      order by u.n)
    else r.traits end
  from lesson_reviews r join bookings b on b.id = r.booking_id
  where b.student_id = auth.uid()
    and coalesce((select (s.features->>'review_to_student')::boolean from settings s where s.teacher_id = r.teacher_id), true);
$$;
grant execute on function public.my_lesson_reviews() to authenticated;

-- ===== Hinweis zum Termin (z. B. „Fahrstunde endet in Geisweid – danach Theorie“), sehen auch Schüler/innen =====
alter table public.slots add column if not exists note text check (char_length(note) <= 200);
drop function if exists public.get_calendar(timestamptz, timestamptz);
create or replace function public.get_calendar(p_from timestamptz, p_to timestamptz)
returns table (slot_id uuid, starts_at timestamptz, duration_min int, status text, mine boolean, meeting_point text, earlier_from timestamptz, note text)
language sql stable security definer set search_path = public as $$
  select s.id, s.starts_at, s.duration_min,
         coalesce(b.status, 'free'),
         coalesce(b.student_id = auth.uid(), false),
         coalesce(b.meeting_point, s.meeting_point),
         case when b.id is null and s.earlier_from < s.starts_at and not exists (
           select 1 from slots o join bookings ob on ob.slot_id = o.id and ob.status in ('requested','confirmed','offered')
           where o.teacher_id = s.teacher_id and o.id <> s.id and o.starts_at < s.starts_at
             and o.starts_at + make_interval(mins => o.duration_min) > s.earlier_from
         ) then s.earlier_from end,
         case when b.id is null or b.student_id = auth.uid() then s.note end
  from slots s
  left join bookings b on b.slot_id = s.id and b.status in ('requested','confirmed','offered')
  where s.starts_at >= p_from and s.starts_at < p_to
    and s.teacher_id = my_teacher_id()
    and (b.id is null or b.status = 'requested' or b.student_id = auth.uid())
    and (b.id is not null or not is_time_off(s.teacher_id, s.starts_at))  -- freie Termine an Urlaubstagen ausblenden
    and is_active()
  order by s.starts_at;
$$;
grant execute on function public.get_calendar(timestamptz, timestamptz) to authenticated;

-- ===== Selbsteinschätzung der Schüler/innen (freiwillig) + Bewertung des Fahrlehrers für Schüler/innen immer aufbauend =====
create table if not exists public.student_reflections (
  booking_id  uuid primary key references public.bookings(id) on delete cascade,
  student_id  uuid not null references public.profiles(id) on delete cascade,
  feeling     smallint check (feeling in (-1, 0, 1)),          -- 😟 unsicher · 😐 geht so · 😊 sicher
  feelings    text[],                                           -- angeklickte Gefühle
  hard        text[],                                           -- „Was war schwierig?“
  wish        text[],                                           -- „Was möchtest du nächstes Mal üben?“
  note        text check (char_length(note) <= 500),
  updated_at  timestamptz not null default now()
);
create index if not exists student_reflections_student_idx on public.student_reflections (student_id, updated_at desc);
alter table public.student_reflections enable row level security;
drop policy if exists reflections_own on public.student_reflections;
create policy reflections_own on public.student_reflections for select using (student_id = auth.uid());
drop policy if exists reflections_teacher on public.student_reflections;
create policy reflections_teacher on public.student_reflections for select
  using (public.is_teacher() and public.student_teacher(student_id) = auth.uid());
grant select on public.student_reflections to authenticated;

create or replace function public.set_reflection(p_booking uuid, p_feeling smallint, p_feelings text[], p_hard text[], p_wish text[], p_note text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if p_feeling is not null and p_feeling not in (-1, 0, 1) then raise exception 'Ungültig'; end if;
  if not exists (select 1 from bookings where id = p_booking and student_id = auth.uid() and status = 'confirmed' and actual_minutes is not null) then
    raise exception 'Fahrstunde nicht gefunden';
  end if;
  insert into student_reflections (booking_id, student_id, feeling, feelings, hard, wish, note, updated_at)
  values (p_booking, auth.uid(), p_feeling, p_feelings, p_hard, p_wish, nullif(left(trim(coalesce(p_note, '')), 500), ''), now())
  on conflict (booking_id) do update set feeling = excluded.feeling, feelings = excluded.feelings, hard = excluded.hard,
    wish = excluded.wish, note = excluded.note, updated_at = now();
  update bookings set student_feedback = p_feeling where id = p_booking;   -- für die Symbole in Heute/Kalender
end $$;
grant execute on function public.set_reflection(uuid, smallint, text[], text[], text[], text) to authenticated;

-- Bewertung des Fahrlehrers für Schüler/innen: Eigenschaften IMMER aufbauend formuliert (auch bei 👌),
-- 👎 sehen sie nie (die App zeigt dann eine aufmunternde Überschrift). Die echte Bewertung bleibt beim Fahrlehrer.
create or replace function public.my_lesson_reviews()
returns table (booking_id uuid, rating smallint, traits text[])
language sql stable security definer set search_path = public as $$
  select r.booking_id, r.rating,
    array(
      select coalesce(m.nice, t) from unnest(r.traits) with ordinality u(t, n)
      left join (values
        ('unsicher', 'Sicherheit kommt mit jeder Fahrstunde'),
        ('angespannt', 'Locker bleiben – du schaffst das'),
        ('gestresst', 'Ruhig atmen, Schritt für Schritt'),
        ('unkonzentriert', 'Nächstes Mal voll konzentriert'),
        ('verwirrt', 'Wir gehen es nochmal in Ruhe durch'),
        ('überfordert', 'Wir machen es Schritt für Schritt'),
        ('müde', 'Ausgeschlafen fährt es sich leichter'),
        ('zu schnell', 'Etwas mehr Ruhe beim Tempo'),
        ('zu zögerlich', 'Mehr Mut – du kannst das')
      ) m(raw, nice) on m.raw = u.t
      order by u.n)
  from lesson_reviews r join bookings b on b.id = r.booking_id
  where b.student_id = auth.uid()
    and coalesce((select (s.features->>'review_to_student')::boolean from settings s where s.teacher_id = r.teacher_id), true);
$$;
grant execute on function public.my_lesson_reviews() to authenticated;

-- ===== Paket 13.11.2026: Schüler/in krank (bezahlt, still), Lesebestätigung Verspätung, Schüler-Bewertung entfernt =====
-- Krank mit Attest als bezahlte Sondertätigkeit: Haupt-Admin/Fahrschul-Admin immer, Kollegen nur wenn eingeschaltet
alter table public.profiles add column if not exists sick_pay boolean not null default false;
alter table public.bookings add column if not exists sick_paid boolean not null default false;     -- zählt in Kontrolle/Abrechnung
alter table public.bookings add column if not exists sick_hidden boolean not null default false;   -- vom Fahrlehrer still eingetragen: Schüler/in sieht es nicht
alter table public.bookings add column if not exists late_student_seen timestamptz;   -- Fahrlehrer/in hat die Verspätung der Schüler/in gelesen
alter table public.bookings add column if not exists late_teacher_seen timestamptz;   -- Schüler/in hat die Verspätung des Fahrlehrers gelesen

-- „Krank bezahlt“ darf nur der Haupt-Admin bzw. der Fahrschul-Admin für seine Kollegen ändern
create or replace function public.profiles_sick_pay_guard()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.sick_pay is distinct from old.sick_pay and auth.uid() is not null and not public.can_manage_teacher(new.id) then
    raise exception 'Das darf nur der Haupt-Admin oder der Fahrschul-Admin ändern';
  end if;
  return new;
end $$;
drop trigger if exists profiles_sick_pay_guard on public.profiles;
create trigger profiles_sick_pay_guard before update of sick_pay on public.profiles
  for each row execute function public.profiles_sick_pay_guard();

create or replace function public.set_teacher_sick_pay(p_id uuid, p_on boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not can_manage_teacher(p_id) then raise exception 'Das darfst du nicht ändern'; end if;
  update profiles set sick_pay = coalesce(p_on, false) where id = p_id and role = 'teacher';
end $$;
grant execute on function public.set_teacher_sick_pay(uuid, boolean) to authenticated;

-- Verspätung melden: neue Meldung = noch nicht gelesen
create or replace function public.announce_late(p_booking uuid, p_min int)
returns text language plpgsql security definer set search_path = public as $$
declare b record;
begin
  if p_min not in (0, 5, 10, 15, 20, 25) then raise exception 'Ungültige Minuten'; end if;
  select bk.id, bk.student_id, bk.status, s.teacher_id, s.starts_at into b
    from bookings bk join slots s on s.id = bk.slot_id where bk.id = p_booking;
  if b.id is null or b.status <> 'confirmed' then raise exception 'Fahrstunde nicht gefunden'; end if;
  if b.starts_at < now() - interval '2 hours' then raise exception 'Die Fahrstunde ist schon vorbei'; end if;
  if auth.uid() = b.student_id then
    update bookings set late_student = nullif(p_min, 0), late_student_seen = null where id = p_booking; return 'student';
  elsif auth.uid() = b.teacher_id then
    update bookings set late_teacher = nullif(p_min, 0), late_teacher_seen = null where id = p_booking; return 'teacher';
  end if;
  raise exception 'Nicht erlaubt';
end $$;
grant execute on function public.announce_late(uuid, int) to authenticated;

-- Lesebestätigung: die jeweils andere Seite bestätigt die Verspätung
create or replace function public.ack_late(p_booking uuid)
returns text language plpgsql security definer set search_path = public as $$
declare b record;
begin
  select bk.id, bk.student_id, s.teacher_id into b from bookings bk join slots s on s.id = bk.slot_id where bk.id = p_booking;
  if b.id is null then raise exception 'Fahrstunde nicht gefunden'; end if;
  if auth.uid() = b.student_id then
    update bookings set late_teacher_seen = now() where id = p_booking and late_teacher is not null; return 'student';
  elsif auth.uid() = b.teacher_id then
    update bookings set late_student_seen = now() where id = p_booking and late_student is not null; return 'teacher';
  end if;
  raise exception 'Nicht erlaubt';
end $$;
grant execute on function public.ack_late(uuid) to authenticated;

-- Schüler/innen bewerten die Fahrstunde nicht mehr – nur noch die freiwillige Selbsteinschätzung
drop function if exists public.set_feedback(uuid, smallint);
