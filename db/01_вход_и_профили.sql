-- ============================================================================
--  SQL №1 — Перевод входа на Supabase Auth
--  Выполнять в Supabase → SQL Editor → New query → Run.
--  На работающий сайт НЕ влияет: только готовит почву.
--
--  ПЕРЕД запуском этого SQL сделайте ОДНО действие мышкой:
--    Supabase → Authentication → Users → Add user →
--      Email:    admin@genius.local
--      Password: (придумайте новый пароль администратора)
--      ✅ Auto Confirm User  — обязательно поставьте галочку
--    → Create user
--  (Пароль знаете только вы. Мне его сообщать не нужно.)
-- ============================================================================

-- Таблица профилей: связывает учётную запись входа с ролью в CRM.
-- Пароли здесь НЕ хранятся — они лежат в защищённой зоне Supabase.
create table if not exists public.profiles (
  id         uuid primary key references auth.users(id) on delete cascade,
  login      text unique not null,
  role       text not null default 'tutor' check (role in ('admin','manager','tutor')),
  tutor_id   bigint,
  name       text,
  created_at timestamptz not null default now()
);

-- Включаем защиту на самой таблице профилей.
alter table public.profiles enable row level security;

-- Правило: каждый вошедший видит ТОЛЬКО свой профиль (свою роль).
-- Прочитать чужие роли из браузера нельзя.
drop policy if exists "profiles_select_own" on public.profiles;
create policy "profiles_select_own" on public.profiles
  for select using (id = auth.uid());

-- Привязываем профиль администратора к учётной записи, созданной выше.
insert into public.profiles (id, login, role, name)
select id, 'admin', 'admin', 'Администратор'
from auth.users
where email = 'admin@genius.local'
on conflict (id) do update set role = 'admin', login = 'admin';

-- Проверка: должна вернуться одна строка — admin / admin.
select login, role, name from public.profiles;
