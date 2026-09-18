-- ============================================================================
--  SQL №2 — Включение защиты (RLS) на всех таблицах
--  Выполнять ТОЛЬКО ПОСЛЕ того, как проверен вход через Supabase Auth!
--  Если запустить раньше — CRM перестанет видеть данные, пока не войдёте.
--
--  Что делает: после запуска базу можно читать и писать ТОЛЬКО вошедшему
--  сотруднику. Публичный ключ из браузера в одиночку не отдаёт ничего.
-- ============================================================================

-- Таблицы с рабочими данными: доступны любому ВОШЕДШЕМУ сотруднику.
-- (Тонкое разделение «преподаватель видит только своих» добавим позже,
--  когда у преподавателей появятся учётные записи.)
do $$
declare t text;
begin
  foreach t in array array[
    'students','tutors','lessons','payments','salaries','subscriptions',
    'tasks','homework','tariffs','discount_settings','attachments',
    'backups','crm_state'
  ] loop
    execute format('alter table public.%I enable row level security;', t);
    execute format('drop policy if exists %I on public.%I;', t||'_all_auth', t);
    execute format(
      'create policy %I on public.%I for all to authenticated using (true) with check (true);',
      t||'_all_auth', t);
  end loop;
end $$;

-- Старая таблица users (логины + md5-хэши) больше не используется приложением.
-- Закрываем её полностью: без единой политики её не прочитать из браузера.
-- Данные остаются на случай отката; позже её можно будет удалить.
alter table public.users enable row level security;

-- Проверка: у всех таблиц должно стоять rowsecurity = true.
select tablename, rowsecurity
from pg_tables
where schemaname = 'public'
  and tablename in ('students','tutors','lessons','payments','salaries',
    'subscriptions','tasks','homework','tariffs','discount_settings',
    'attachments','backups','crm_state','users','profiles','parent_links')
order by tablename;
