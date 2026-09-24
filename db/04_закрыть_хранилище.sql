-- ============================================================================
--  SQL №4 — Закрытие хранилища файлов
--  Выполнять ПОСЛЕ выкатки новой версии CRM, где файлы открываются
--  временной ссылкой (иначе в карточках перестанут открываться документы).
--
--  Зачем: таблицы мы закрыли в SQL №2 и №3, но файлы лежат отдельно — в
--  хранилище. Проверка снаружи, без входа, показала: список папок
--  attachments (candidates, students) отдаётся любому, а ссылки на файлы
--  создавались постоянные и общедоступные. Это резюме соискателей,
--  договоры и сканы документов учеников.
-- ============================================================================

-- 1. Бакет перестаёт быть публичным: постоянные ссылки /object/public/...
--    больше не работают, файл открывается только временной ссылкой.
update storage.buckets set public = false where id = 'attachments';

-- 2. Убираем прежние правила, разрешавшие доступ без входа.
do $$
declare r record;
begin
  for r in
    select policyname from pg_policies
    where schemaname = 'storage' and tablename = 'objects' and 'public' = any(roles)
  loop
    execute format('drop policy %I on storage.objects;', r.policyname);
    raise notice 'удалено правило хранилища: %', r.policyname;
  end loop;
end $$;

-- 3. Полный доступ к файлам — только вошедшим сотрудникам.
drop policy if exists "attachments_auth_all" on storage.objects;
create policy "attachments_auth_all" on storage.objects
  for all to authenticated
  using (bucket_id = 'attachments')
  with check (bucket_id = 'attachments');

-- 4. Проверка: правил для роли public остаться не должно.
select policyname, roles::text, cmd from pg_policies
where schemaname = 'storage' and tablename = 'objects'
order by policyname;
