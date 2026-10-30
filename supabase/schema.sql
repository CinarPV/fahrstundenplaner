-- =====================================================================
-- Fahrstundenplaner – Datenbank-Schema für Supabase
-- Einmal komplett im Supabase "SQL Editor" ausführen (Run).
-- =====================================================================

-- ---------- Tabellen -------------------------------------------------

-- Ein Profil pro angemeldeter Person (Schüler oder Admin)
create table if not exists public.profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  first_name  text not null default '',
  last_name   text not null default '',
  email       text,
  license_class  text check (license_class in ('B','B197','B Automatik')),
  needs_glasses  boolean not null default false,   -- Sehhilfe (Brille/Kontaktlinsen)
  is_conversion  boolean not null default false,   -- Umschreiber (ausländischer Führerschein)
  phone          text check (char_length(phone) <= 30),  -- für WhatsApp-Nachrichten
  max_open       int check (max_open between 0 and 50),  -- eigene Höchstzahl: NULL = Standard aus Einstellungen, 0 = unbegrenzt
  role       text not null default 'student' check (role in ('student','admin')),
  -- pending = wartet auf Freischaltung, active = freigeschaltet, blocked = gesperrt (z. B. Ausbildung beendet)
  status      text not null default 'pending' check (status in ('pending','active','blocked')),
  created_at  timestamptz not null default now()
);

-- Einstellungen (genau eine Zeile)
create table if not exists public.settings (
  id                int primary key default 1 check (id = 1),
  default_duration  int not null default 90 check (default_duration between 5 and 600),
  max_open          int not null default 3 check (max_open between 0 and 50),  -- max. offene/anstehende Fahrstunden pro Schüler (0 = unbegrenzt)
  admin_phone       text check (char_length(admin_phone) <= 30)               -- Handynummer des Fahrlehrers für WhatsApp
);
insert into public.settings (id) values (1) on conflict do nothing;

-- Freigegebene Termine
create table if not exists public.slots (
  id            uuid primary key default gen_random_uuid(),
  starts_at     timestamptz not null,
  duration_min  int not null check (duration_min between 5 and 600),
  created_at    timestamptz not null default now()
);
create index if not exists slots_starts_at_idx on public.slots (starts_at);

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
                  -- sick / cancelled_student / cancelled_teacher = Fahrstunde nicht zustande gekommen
                  check (status in ('requested','confirmed','rejected','cancelled',
                                    'sick','cancelled_student','cancelled_teacher')),
  cancel_reason   text check (char_length(cancel_reason) <= 300),
  late_cancel     boolean not null default false,  -- Fehlstunde (kostenpflichtig)
  lesson_type     text not null default 'normal'
                  check (lesson_type in ('normal','ueberland','autobahn','nacht')),  -- Sonderfahrten
  student_note    text check (char_length(student_note) <= 300),
  admin_reply     text check (char_length(admin_reply) <= 1000),
  actual_start    timestamptz,
  actual_end      timestamptz,
  actual_minutes  int check (actual_minutes between 0 and 1000),
  created_at      timestamptz not null default now(),
  decided_at      timestamptz
);
-- Pro Termin höchstens EINE offene oder bestätigte Buchung
create unique index if not exists bookings_one_active_per_slot
  on public.bookings (slot_id) where status in ('requested','confirmed');
create index if not exists bookings_student_idx on public.bookings (student_id);

-- ---------- Hilfsfunktionen ------------------------------------------

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from profiles where id = auth.uid() and role = 'admin');
$$;

-- Freigeschaltet = Admin oder Schüler mit Status 'active'
create or replace function public.is_active()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from profiles where id = auth.uid() and (role = 'admin' or status = 'active'));
$$;

-- Schüler endgültig löschen (Konto, Profil und alle Buchungen) – nur Admin
create or replace function public.delete_student(p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not is_admin() then raise exception 'Nur der Fahrlehrer darf Schüler löschen'; end if;
  if exists (select 1 from profiles where id = p_id and role = 'admin') then
    raise exception 'Admin-Konten können hier nicht gelöscht werden';
  end if;
  delete from auth.users where id = p_id;
end $$;

-- Neues Profil automatisch anlegen, wenn sich jemand registriert
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into profiles (id, email, first_name, last_name, license_class, needs_glasses, is_conversion, phone)
  values (
    new.id,
    new.email,
    coalesce(trim(new.raw_user_meta_data->>'first_name'), ''),
    coalesce(trim(new.raw_user_meta_data->>'last_name'), ''),
    case when new.raw_user_meta_data->>'license_class' in ('B','B197','B Automatik')
         then new.raw_user_meta_data->>'license_class' end,
    coalesce((new.raw_user_meta_data->>'needs_glasses')::boolean, false),
    coalesce((new.raw_user_meta_data->>'is_conversion')::boolean, false),
    nullif(left(trim(coalesce(new.raw_user_meta_data->>'phone', '')), 30), '')
  );
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Admin festlegen: nach der eigenen Registrierung im SQL Editor ausführen:
--   select public.make_admin('deine@email.de');
create or replace function public.make_admin(p_email text)
returns text language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  select id into v_id from auth.users where lower(email) = lower(p_email);
  if v_id is null then
    return 'Kein Benutzer mit dieser E-Mail gefunden – erst in der App registrieren.';
  end if;
  update profiles set role = 'admin', status = 'active' where id = v_id;
  return 'OK – ' || p_email || ' ist jetzt Admin.';
end $$;
revoke execute on function public.make_admin(text) from public, anon, authenticated;

-- ---------- Funktionen für Schüler -----------------------------------

-- Kalender für Schüler: freie Termine, fremde UNBESTÄTIGTE Anfragen (ohne Namen) und die eigenen.
-- Fremde bestätigte Fahrstunden bleiben unsichtbar.
create or replace function public.get_calendar(p_from timestamptz, p_to timestamptz)
returns table (
  slot_id       uuid,
  starts_at     timestamptz,
  duration_min  int,
  status        text,      -- 'free' | 'requested' | 'confirmed'
  mine          boolean
)
language sql stable security definer set search_path = public as $$
  select s.id, s.starts_at, s.duration_min,
         coalesce(b.status, 'free'),
         coalesce(b.student_id = auth.uid(), false)
  from slots s
  left join bookings b
    on b.slot_id = s.id and b.status in ('requested','confirmed')
  where s.starts_at >= p_from and s.starts_at < p_to
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
  -- Obergrenze: offene Anfragen + anstehende bestätigte Fahrstunden
  -- eigene Höchstzahl des Schülers, sonst Standard aus den Einstellungen
  select coalesce(p.max_open, st.max_open) into v_max
  from profiles p cross join settings st where p.id = auth.uid() and st.id = 1;
  if coalesce(v_max, 0) > 0 then
    select count(*) into v_open from bookings b join slots s on s.id = b.slot_id
    where b.student_id = auth.uid() and s.starts_at > now()
      and (b.status = 'requested' or (b.status = 'confirmed' and b.actual_minutes is null));
    if v_open >= v_max then
      raise exception 'Du hast schon % offene bzw. anstehende Fahrstunden – mehr sind gerade nicht möglich.', v_open;
    end if;
  end if;
  select starts_at into v_start from slots where id = p_slot;
  if v_start is null then raise exception 'Termin nicht gefunden'; end if;
  if v_start < now() then raise exception 'Termin liegt in der Vergangenheit'; end if;
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

-- Eigene Profildaten ändern (Rolle und Freischaltung bleiben unberührt)
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

-- Eigene, noch nicht bestätigte Anfrage zurückziehen
create or replace function public.cancel_request(p_booking uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  update bookings set status = 'cancelled', decided_at = now()
  where id = p_booking and student_id = auth.uid() and status = 'requested' and is_active();
  if not found then raise exception 'Anfrage kann nicht zurückgezogen werden'; end if;
end $$;

-- ---------- Zugriffsregeln (Row Level Security) ----------------------

alter table public.profiles enable row level security;
alter table public.settings enable row level security;
alter table public.slots    enable row level security;
alter table public.bookings enable row level security;

-- Profile: jeder sieht nur sich selbst, Admin sieht alle
drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles for select
  using (id = auth.uid() or public.is_admin());
drop policy if exists profiles_admin_update on public.profiles;
create policy profiles_admin_update on public.profiles for update
  using (public.is_admin()) with check (public.is_admin());

-- Einstellungen: alle Freigeschalteten lesen, nur Admin ändert
drop policy if exists settings_select on public.settings;
create policy settings_select on public.settings for select
  using (public.is_active());
drop policy if exists settings_update on public.settings;
create policy settings_update on public.settings for update
  using (public.is_admin()) with check (public.is_admin());

-- Termine: direkt nur für Admin (Schüler nutzen get_calendar)
drop policy if exists slots_admin on public.slots;
create policy slots_admin on public.slots for all
  using (public.is_admin()) with check (public.is_admin());
-- Schüler dürfen die Termine ihrer EIGENEN Buchungen lesen
drop policy if exists slots_own on public.slots;
create policy slots_own on public.slots for select
  using (public.is_active() and exists (select 1 from public.bookings b
                 where b.slot_id = slots.id and b.student_id = auth.uid()));

-- Buchungen: freigeschaltete Schüler sehen nur eigene; Admin alles
drop policy if exists bookings_select on public.bookings;
create policy bookings_select on public.bookings for select
  using ((student_id = auth.uid() and public.is_active()) or public.is_admin());
drop policy if exists bookings_admin on public.bookings;
create policy bookings_admin on public.bookings for all
  using (public.is_admin()) with check (public.is_admin());

-- Rechte für Funktionen
grant execute on function public.get_calendar(timestamptz, timestamptz) to authenticated;
grant execute on function public.book_slot(uuid, text) to authenticated;
grant execute on function public.cancel_request(uuid) to authenticated;
grant execute on function public.cancel_booking(uuid, text) to authenticated;
grant execute on function public.update_my_profile(text, text, text, boolean, boolean, text) to authenticated;
grant execute on function public.cancel_deadline(timestamptz) to authenticated;
grant execute on function public.is_admin() to authenticated;
grant execute on function public.is_active() to authenticated;
grant execute on function public.delete_student(uuid) to authenticated;
