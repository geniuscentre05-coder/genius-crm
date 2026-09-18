// api/admin-users.js
// Управление сотрудниками (список, создание, сброс пароля, роль, удаление).
// Работает секретным ключом service_role — он есть ТОЛЬКО на сервере,
// в браузер не попадает. Каждый запрос проверяется: вызвать может лишь
// вошедший администратор.
//
// Переменные окружения в Vercel:
//   SUPABASE_URL               — тот же адрес, что VITE_SUPABASE_URL
//   SUPABASE_SERVICE_ROLE_KEY  — Supabase → Settings → API → service_role (секретный!)

import { createClient } from "@supabase/supabase-js";

const URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const EMAIL_DOMAIN = "genius.local";

export default async function handler(req, res) {
  if (req.method !== "POST") { res.status(405).json({ error: "Method not allowed" }); return; }
  if (!URL || !SERVICE_KEY) { res.status(500).json({ error: "На сервере не заданы SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY" }); return; }

  const admin = createClient(URL, SERVICE_KEY, { auth: { autoRefreshToken: false, persistSession: false } });

  // 1. Кто вызывает? Проверяем токен и что это администратор.
  const token = (req.headers.authorization || "").replace(/^Bearer\s+/i, "");
  if (!token) { res.status(401).json({ error: "Не авторизован" }); return; }
  const { data: uData, error: uErr } = await admin.auth.getUser(token);
  if (uErr || !uData?.user) { res.status(401).json({ error: "Сессия недействительна" }); return; }
  const { data: me } = await admin.from("profiles").select("role").eq("id", uData.user.id).maybeSingle();
  if (!me || me.role !== "admin") { res.status(403).json({ error: "Нужны права администратора" }); return; }

  const { action, login, password, role, name, tutor_id, id } = req.body || {};

  try {
    if (action === "list") {
      const { data, error } = await admin
        .from("profiles")
        .select("id, login, role, name, tutor_id, created_at")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return res.status(200).json({ users: data || [] });
    }

    if (action === "create") {
      if (!login || !password) return res.status(400).json({ error: "Нужны логин и пароль" });
      const cleanLogin = String(login).trim().toLowerCase();
      const { data: exists } = await admin.from("profiles").select("id").eq("login", cleanLogin).maybeSingle();
      if (exists) return res.status(400).json({ error: "Такой логин уже занят" });

      const { data: created, error: cErr } = await admin.auth.admin.createUser({
        email: `${cleanLogin}@${EMAIL_DOMAIN}`, password, email_confirm: true,
      });
      if (cErr) throw cErr;

      const { error: pErr } = await admin.from("profiles").insert({
        id: created.user.id, login: cleanLogin,
        role: role || "tutor", name: name || null,
        tutor_id: role === "tutor" && tutor_id ? Number(tutor_id) : null,
      });
      if (pErr) { await admin.auth.admin.deleteUser(created.user.id); throw pErr; }
      return res.status(200).json({ ok: true });
    }

    if (action === "resetPassword") {
      if (!login || !password) return res.status(400).json({ error: "Нужны логин и новый пароль" });
      const cleanLogin = String(login).trim().toLowerCase();
      const { data: prof } = await admin.from("profiles").select("id").eq("login", cleanLogin).maybeSingle();
      if (!prof) return res.status(404).json({ error: "Пользователь не найден" });
      const { error } = await admin.auth.admin.updateUserById(prof.id, { password });
      if (error) throw error;
      return res.status(200).json({ ok: true });
    }

    if (action === "changeRole") {
      if (!id || !role) return res.status(400).json({ error: "Нужны id и роль" });
      const { error } = await admin.from("profiles").update({ role }).eq("id", id);
      if (error) throw error;
      return res.status(200).json({ ok: true });
    }

    if (action === "delete") {
      if (!id) return res.status(400).json({ error: "Нужен id" });
      if (id === uData.user.id) return res.status(400).json({ error: "Нельзя удалить свою учётную запись" });
      const { error } = await admin.auth.admin.deleteUser(id); // профиль удалится каскадом
      if (error) throw error;
      return res.status(200).json({ ok: true });
    }

    return res.status(400).json({ error: "Неизвестное действие" });
  } catch (e) {
    return res.status(500).json({ error: e.message || "Ошибка сервера" });
  }
}
