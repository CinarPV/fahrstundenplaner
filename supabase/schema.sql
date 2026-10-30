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
  role        text not null default 'student' check (role in ('student','admin')),
  -- pending = wartet auf Freischaltung, active = freigeschaltet, blocked = gesperrt (z. B. Ausbildung beendet)
  status      text not null default 'pending' check (status in ('pending','active','blocked')),
  created_at  timestamptz not null default now()
);

-- Einstellungen (genau eine Zeile)
create table if not exists public.settings (
  id                int primary key default 1 check (id = 1),
  default_duration  int not null default 90 check (default_duration between 5 and 600)
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
                  check (status in ('requested','confirmed','rejected','cancelled')),
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
  insert into profiles (id, email, first_name, last_name)
  values (
    new.id,
    new.email,
    coalesce(trim(new.raw_user_meta_data->>'first_name'), ''),
    coalesce(trim(new.raw_user_meta_data->>'last_name'), '')
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

-- Kalender für Schüler: zeigt Status aller Termine, aber KEINE fremden Namen
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
    and is_active()
  order by s.starts_at;
$$;

-- Termin anfragen
create or replace function public.book_slot(p_slot uuid, p_note text)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_start timestamptz;
begin
  if not is_active() then raise exception 'Dein Zugang ist nicht freigeschaltet'; end if;
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
grant execute on function public.is_admin() to authenticated;
grant execute on function public.is_active() to authenticated;
grant execute on function public.delete_student(uuid) to authenticated;
