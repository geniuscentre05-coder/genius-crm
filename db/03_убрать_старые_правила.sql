-- ============================================================================
--  SQL №3 — Удаление старых правил «разрешено всем без входа»
--  Выполнять ПОСЛЕ 01 и 02, когда вход через Supabase Auth уже проверен.
--
--  Зачем: SQL №2 включил защиту и дал доступ вошедшим сотрудникам, но на
--  таблицах остались прежние правила вида «allow anon all students» для
--  роли public. Пока они есть, защита ничего не закрывает: данные 1975
--  учеников и хэши паролей из users по-прежнему отдаются любому, кто
--  откроет сайт.
--
--  Правило profiles_select_own сохраняется: оно отдаёт вошедшему только
--  его собственный профиль (условие id = auth.uid()).
-- ============================================================================

-- 1. Удаляем все правила для роли public, кроме профиля.
do $$
declare r record;
begin
  for r in
    select tablename, policyname
    from pg_policies
    where schemaname = 'public'
      and 'public' = any(roles)
      and policyname <> 'profiles_select_own'
    order by tablename, policyname
  loop
    execute format('drop policy %I on public.%I;', r.policyname, r.tablename);
    raise notice 'удалено правило % на таблице %', r.policyname, r.tablename;
  end loop;
end $$;

-- 2. Включаем защиту на всех таблицах, включая забытые прежними скриптами
--    (advances, candidates, course_catalog, mailings, pricing, requests,
--     rules, teachers — код CRM их не использует, доступ им не нужен).
do $$
declare t record;
begin
  for t in select tablename from pg_tables where schemaname = 'public' loop
    execute format('alter table public.%I enable row level security;', t.tablename);
  end loop;
end $$;

-- 3. Проверка: правил для роли public остаться не должно, кроме профиля.
select tablename, policyname, roles::text, cmd
from pg_policies
where schemaname = 'public' and 'public' = any(roles)
order by tablename, policyname;
