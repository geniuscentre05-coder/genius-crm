// ============================================================
// ПАТЧ 1 — nav: добавить 2 пункта меню
// Вставить в массив `nav` (строка ~1579)
// ============================================================

const nav = [
  { id:"dashboard", icon:LayoutGrid,    label:"Дашборд"        },
  { id:"tutors",    icon:GraduationCap, label:"Преподаватели"  },
  { id:"students",  icon:Users,         label:"Ученики"        },
  { id:"courses",   icon:BookOpen,      label:"Курсы"          },
  { id:"schedule",  icon:Calendar,      label:"Расписание"     },
  { id:"subscriptions", icon:CreditCard, label:"Абонементы"    },   // НОВОЕ
  { id:"pricing",   icon:Wallet,        label:"Цены и правила" },
  { id:"payments",  icon:CreditCard,    label:"Финансы"        },
  { id:"reports",   icon:BarChart3,     label:"Отчёты"         },
  { id:"requests",  icon:Inbox,         label:"Запросы родит." },
  { id:"mailings",  icon:Send,          label:"Рассылки"       },
  { id:"candidates",icon:UserPlus,      label:"Соискатели"     },
  { id:"users",     icon:Users,         label:"Пользователи"   },   // НОВОЕ — только isAdmin, см. патч 6
  { id:"ai",        icon:Sparkles,      label:"ИИ-Помощник"    },
];

// В sidebar, там где рендерится nav.map(...), заменить на:
// {nav.filter(n => n.id !== "users" || isAdmin).map(n => ( ... ))}


// ============================================================
// ПАТЧ 2 — state + загрузка/realtime для subscriptions и users
// ============================================================

const [subscriptions, setSubscriptions] = useState(saved?.subscriptions || []);
const [allUsers, setAllUsers] = useState([]);

// В loadInitial(), добавить subscriptions к остальным таблицам:
// const [tData, sData, lData, pData, salData, subData] = await Promise.all([
//   fetchTable("tutors"), fetchTable("students"), fetchTable("lessons"),
//   fetchTable("payments"), fetchTable("salaries"), fetchTable("subscriptions"),
// ]);
// if (subData) setSubscriptions(subData);

// В блоке realtime подписок "core_tables_changes", добавить:
// .on("postgres_changes", { event: "*", schema: "public", table: "subscriptions" }, async () => {
//   const d = await fetchTable("subscriptions"); if (d) setSubscriptions(d);
// })

async function loadUsers() {
  const { data, error } = await supabase
    .from("users")
    .select("id, login, role, name, tutor_id, created_at")
    .order("created_at", { ascending: false });
  if (error) { console.error("Load users error:", error); return; }
  setAllUsers(data || []);
}
// Вызывать лениво: useEffect(() => { if (view === "users" && isAdmin) loadUsers(); }, [view]);


// ============================================================
// ПАТЧ 3 — CRUD-функции для абонементов
// ============================================================

const [nSubscription, setNSubscription] = useState({
  studentId: "", subject: "", tutorId: "", type: "package",
  totalLessons: 8, periodStart: "", periodEnd: "", price: 0, comment: "",
});
const [editingSubscriptionId, setEditingSubscriptionId] = useState(null);

function addMonths(dateStr, months) {
  const d = dateStr ? new Date(dateStr) : new Date();
  d.setMonth(d.getMonth() + months);
  return d.toISOString().slice(0, 10);
}

async function addSubscription() {
  if (!nSubscription.studentId) { notify("Выберите ученика"); return; }
  const student = students.find(s => s.id === Number(nSubscription.studentId));
  const periodStart = nSubscription.periodStart || new Date().toISOString().slice(0, 10);
  const row = {
    studentId: Number(nSubscription.studentId),
    subject: nSubscription.subject || null,
    tutorId: nSubscription.tutorId ? Number(nSubscription.tutorId) : null,
    type: nSubscription.type,
    totalLessons: nSubscription.type === "package" ? Number(nSubscription.totalLessons) || 0 : null,
    usedLessons: 0,
    periodStart,
    periodEnd: nSubscription.periodEnd || addMonths(periodStart, 1),
    price: Number(nSubscription.price) || 0,
    status: "active",
    comment: nSubscription.comment || "",
  };
  const ok = await insertRow("subscriptions", row);
  if (ok) {
    const d = await fetchTable("subscriptions");
    if (d) setSubscriptions(d);
    notify(`Абонемент для ${student?.name || "ученика"} добавлен`);
    setModal(null);
    setNSubscription({ studentId:"", subject:"", tutorId:"", type:"package", totalLessons:8, periodStart:"", periodEnd:"", price:0, comment:"" });
  } else {
    notify("Ошибка при сохранении абонемента");
  }
}

function startEditSubscription(sub) {
  setNSubscription({
    studentId: sub.studentId, subject: sub.subject || "", tutorId: sub.tutorId || "",
    type: sub.type, totalLessons: sub.totalLessons || 8,
    periodStart: sub.periodStart || "", periodEnd: sub.periodEnd || "",
    price: sub.price || 0, comment: sub.comment || "",
  });
  setEditingSubscriptionId(sub.id);
  setModal("editSubscription");
}

async function saveEditSubscription() {
  const patch = {
    subject: nSubscription.subject || null,
    tutorId: nSubscription.tutorId ? Number(nSubscription.tutorId) : null,
    type: nSubscription.type,
    totalLessons: nSubscription.type === "package" ? Number(nSubscription.totalLessons) || 0 : null,
    periodStart: nSubscription.periodStart,
    periodEnd: nSubscription.periodEnd,
    price: Number(nSubscription.price) || 0,
    comment: nSubscription.comment || "",
  };
  setSubscriptions(subscriptions.map(s => s.id === editingSubscriptionId ? { ...s, ...patch } : s));
  await updateRow("subscriptions", editingSubscriptionId, patch);
  setModal(null); setEditingSubscriptionId(null);
  notify("Абонемент обновлён");
}

async function deleteSubscription(id) {
  if (!window.confirm("Удалить абонемент?")) return;
  setSubscriptions(subscriptions.filter(s => s.id !== id));
  await deleteRow("subscriptions", id);
  notify("Абонемент удалён");
}

async function freezeSubscription(id, freeze) {
  const patch = { status: freeze ? "frozen" : "active" };
  setSubscriptions(subscriptions.map(s => s.id === id ? { ...s, ...patch } : s));
  await updateRow("subscriptions", id, patch);
  notify(freeze ? "Абонемент заморожен" : "Абонемент возобновлён");
}

// Списание занятия с абонемента — вызывать после смены lessons.status на
// "completed" или "noshow_burned" (см. патч 4).
async function chargeSubscriptionForLesson(lesson) {
  const candidates = subscriptions.filter(s =>
    s.studentId === lesson.studentId &&
    s.status === "active" &&
    s.type === "package" &&
    (s.totalLessons - s.usedLessons) > 0 &&
    (!s.periodEnd || s.periodEnd >= lesson.date)
  );
  if (!candidates.length) return;

  const exact = candidates.find(s => s.subject === lesson.subject && s.tutorId === lesson.tutorId);
  const bySubject = candidates.find(s => s.subject === lesson.subject && !s.tutorId);
  const general = candidates.find(s => !s.subject);
  const target = exact || bySubject || general || candidates[0];

  const newUsed = target.usedLessons + 1;
  const patch = {
    usedLessons: newUsed,
    status: newUsed >= target.totalLessons ? "finished" : "active",
  };
  setSubscriptions(prev => prev.map(s => s.id === target.id ? { ...s, ...patch } : s));
  await updateRow("subscriptions", target.id, patch);
}


// ============================================================
// ПАТЧ 4 — списание при смене статуса занятия (интегрировать в
// существующую функцию, которая уже меняет lessons.status)
// ============================================================

// async function updateLessonStatus(lessonId, newStatus) {
//   const lesson = lessons.find(l => l.id === lessonId);
//   setLessons(lessons.map(l => l.id === lessonId ? { ...l, status: newStatus } : l));
//   await updateRow("lessons", lessonId, { status: newStatus });
//   if (["completed", "noshow_burned"].includes(newStatus) && lesson) {
//     await chargeSubscriptionForLesson(lesson);
//   }
// }


// ============================================================
// ПАТЧ 5 — UI страницы "Абонементы"
// ============================================================

{view === "subscriptions" && (
  <div>
    <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:20 }}>
      <h2 style={{ fontSize:22, fontWeight:700 }}>Абонементы</h2>
      <button className="bp" onClick={() => { setNSubscription({ studentId:"", subject:"", tutorId:"", type:"package", totalLessons:8, periodStart:"", periodEnd:"", price:0, comment:"" }); setModal("addSubscription"); }}>
        <Plus size={15} /> Новый абонемент
      </button>
    </div>
    <table style={{ width:"100%", borderCollapse:"collapse", background:"#fff", borderRadius:12, overflow:"hidden", boxShadow:"0 1px 3px rgba(18,40,61,.06)" }}>
      <thead>
        <tr style={{ background:"#f2f6fa" }}>
          <th style={{ padding:"10px 14px", textAlign:"left", fontSize:12 }}>Ученик</th>
          <th style={{ padding:"10px 14px", textAlign:"left", fontSize:12 }}>Предмет / препод.</th>
          <th style={{ padding:"10px 14px", textAlign:"left", fontSize:12 }}>Тип</th>
          <th style={{ padding:"10px 14px", textAlign:"left", fontSize:12 }}>Остаток</th>
          <th style={{ padding:"10px 14px", textAlign:"left", fontSize:12 }}>Действует до</th>
          <th style={{ padding:"10px 14px", textAlign:"left", fontSize:12 }}>Статус</th>
          <th style={{ padding:"10px 14px" }}></th>
        </tr>
      </thead>
      <tbody>
        {subscriptions.map(s => {
          const student = students.find(x => x.id === s.studentId);
          const tutor = tutors.find(x => x.id === s.tutorId);
          const remaining = s.type === "package" ? Math.max((s.totalLessons||0) - (s.usedLessons||0), 0) : null;
          return (
            <tr key={s.id} style={{ borderBottom:"1px solid #f2f6fa" }}>
              <td style={{ padding:"10px 14px", fontWeight:600 }}>{student?.name || "—"}</td>
              <td style={{ padding:"10px 14px", fontSize:13, color:"#55677a" }}>{s.subject || "Все предметы"}{tutor ? ` — ${tutor.short}` : ""}</td>
              <td style={{ padding:"10px 14px", fontSize:13 }}>{s.type === "package" ? "Пакет" : "Безлимит"}</td>
              <td style={{ padding:"10px 14px", fontSize:13, fontWeight:700 }}>
                {s.type === "package" ? `${remaining} из ${s.totalLessons}` : "—"}
              </td>
              <td style={{ padding:"10px 14px", fontSize:13 }}>{s.periodEnd || "—"}</td>
              <td style={{ padding:"10px 14px" }}>
                <Tag
                  c={s.status==="active"?"#5cb85c":s.status==="frozen"?"#f5a623":"#a9b8c6"}
                  bg={s.status==="active"?"rgba(34,197,94,.12)":s.status==="frozen"?"rgba(245,158,11,.12)":"rgba(148,163,184,.12)"}>
                  {s.status==="active"?"Активен":s.status==="frozen"?"Заморожен":s.status==="finished"?"Закончился":"Истёк"}
                </Tag>
              </td>
              <td style={{ padding:"10px 14px", display:"flex", gap:6 }}>
                <button className="bg" style={{ fontSize:11, padding:"5px 8px" }} onClick={() => startEditSubscription(s)}><Pencil size={12} /></button>
                <button className="bg" style={{ fontSize:11, padding:"5px 8px" }} onClick={() => freezeSubscription(s.id, s.status !== "frozen")}>
                  {s.status === "frozen" ? "▶" : "⏸"}
                </button>
                <button style={{ background:"rgba(226,87,76,.08)", border:"1px solid rgba(226,87,76,.2)", color:"#e2574c", padding:"5px 8px", borderRadius:7, cursor:"pointer" }} onClick={() => deleteSubscription(s.id)}>
                  <Trash2 size={12} />
                </button>
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  </div>
)}

{(modal === "addSubscription" || modal === "editSubscription") && (
  <div className="ov" onClick={() => setModal(null)}>
    <div className="mo" onClick={e => e.stopPropagation()}>
      <h3 style={{ marginBottom:16 }}>{modal === "addSubscription" ? "Новый абонемент" : "Редактировать абонемент"}</h3>
      <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
        <div>
          <div style={{ fontSize:13, fontWeight:600, marginBottom:5 }}>Ученик</div>
          <select value={nSubscription.studentId} disabled={modal==="editSubscription"} onChange={e => setNSubscription({...nSubscription, studentId:e.target.value})}>
            <option value="">Выберите ученика</option>
            {students.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </div>
        <div style={{ display:"flex", gap:10 }}>
          <div style={{ flex:1 }}>
            <div style={{ fontSize:13, fontWeight:600, marginBottom:5 }}>Предмет (необязательно)</div>
            <select value={nSubscription.subject} onChange={e => setNSubscription({...nSubscription, subject:e.target.value})}>
              <option value="">Все предметы</option>
              {allSubjects.map(sub => <option key={sub} value={sub}>{sub}</option>)}
            </select>
          </div>
          <div style={{ flex:1 }}>
            <div style={{ fontSize:13, fontWeight:600, marginBottom:5 }}>Преподаватель (необязательно)</div>
            <select value={nSubscription.tutorId} onChange={e => setNSubscription({...nSubscription, tutorId:e.target.value})}>
              <option value="">Любой</option>
              {tutors.map(t => <option key={t.id} value={t.id}>{t.short}</option>)}
            </select>
          </div>
        </div>
        <div>
          <div style={{ fontSize:13, fontWeight:600, marginBottom:5 }}>Тип абонемента</div>
          <select value={nSubscription.type} onChange={e => setNSubscription({...nSubscription, type:e.target.value})}>
            <option value="package">Пакет занятий</option>
            <option value="unlimited">Безлимит на период</option>
          </select>
        </div>
        {nSubscription.type === "package" && (
          <div>
            <div style={{ fontSize:13, fontWeight:600, marginBottom:5 }}>Число занятий</div>
            <input type="number" value={nSubscription.totalLessons} onChange={e => setNSubscription({...nSubscription, totalLessons:e.target.value})} />
          </div>
        )}
        <div style={{ display:"flex", gap:10 }}>
          <div style={{ flex:1 }}>
            <div style={{ fontSize:13, fontWeight:600, marginBottom:5 }}>Начало действия</div>
            <input type="date" value={nSubscription.periodStart} onChange={e => setNSubscription({...nSubscription, periodStart:e.target.value})} />
          </div>
          <div style={{ flex:1 }}>
            <div style={{ fontSize:13, fontWeight:600, marginBottom:5 }}>Действует до</div>
            <input type="date" value={nSubscription.periodEnd} onChange={e => setNSubscription({...nSubscription, periodEnd:e.target.value})} placeholder="По умолч. +1 месяц" />
          </div>
        </div>
        <div>
          <div style={{ fontSize:13, fontWeight:600, marginBottom:5 }}>Стоимость, ₽</div>
          <input type="number" value={nSubscription.price} onChange={e => setNSubscription({...nSubscription, price:e.target.value})} />
        </div>
        <div>
          <div style={{ fontSize:13, fontWeight:600, marginBottom:5 }}>Комментарий</div>
          <input value={nSubscription.comment} onChange={e => setNSubscription({...nSubscription, comment:e.target.value})} />
        </div>
      </div>
      <div style={{ display:"flex", gap:10, marginTop:20 }}>
        <button className="bp" style={{ flex:1 }} onClick={modal === "addSubscription" ? addSubscription : saveEditSubscription}>Сохранить</button>
        <button className="bg" onClick={() => setModal(null)}>Отмена</button>
      </div>
    </div>
  </div>
)}


// ============================================================
// ПАТЧ 6 — UI страницы "Пользователи" (только admin)
// ============================================================

const [nUser, setNUser] = useState({ login:"", password:"", role:"tutor", tutorId:"", name:"" });

async function addUser() {
  if (!isAdmin) return;
  if (!nUser.login || !nUser.password) { notify("Укажите логин и пароль"); return; }
  const { data: exists } = await supabase.rpc("login_exists", { p_login: nUser.login.trim().toLowerCase() });
  if (exists) { notify("Такой логин уже занят"); return; }
  const { error } = await supabase.from("users").insert({
    login: nUser.login.trim().toLowerCase(),
    password_hash: "x", // временное — тут же перезапишется через RPC ниже
    role: nUser.role,
    tutor_id: nUser.role === "tutor" && nUser.tutorId ? Number(nUser.tutorId) : null,
    name: nUser.name || null,
  });
  if (error) { notify("Ошибка: " + error.message); return; }
  await supabase.rpc("set_user_password", { p_login: nUser.login.trim().toLowerCase(), p_new_password: nUser.password });
  notify(`Пользователь ${nUser.login} создан`);
  setModal(null);
  setNUser({ login:"", password:"", role:"tutor", tutorId:"", name:"" });
  loadUsers();
}

async function resetUserPassword(login) {
  const newPass = window.prompt(`Новый пароль для «${login}»:`);
  if (!newPass) return;
  await supabase.rpc("set_user_password", { p_login: login, p_new_password: newPass });
  notify("Пароль обновлён");
}

async function changeUserRole(userId, role) {
  await supabase.from("users").update({ role }).eq("id", userId);
  setAllUsers(allUsers.map(u => u.id === userId ? { ...u, role } : u));
}

async function deleteUser(userId, login) {
  if (login === currentUser.login) { notify("Нельзя удалить свою же учётную запись"); return; }
  if (!window.confirm(`Удалить пользователя «${login}»?`)) return;
  await supabase.from("users").delete().eq("id", userId);
  setAllUsers(allUsers.filter(u => u.id !== userId));
  notify("Пользователь удалён");
}

{view === "users" && isAdmin && (
  <div>
    <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:20 }}>
      <h2 style={{ fontSize:22, fontWeight:700 }}>Пользователи</h2>
      <button className="bp" onClick={() => { setNUser({ login:"", password:"", role:"tutor", tutorId:"", name:"" }); setModal("addUser"); }}>
        <Plus size={15} /> Новый пользователь
      </button>
    </div>
    <table style={{ width:"100%", borderCollapse:"collapse", background:"#fff", borderRadius:12, overflow:"hidden", boxShadow:"0 1px 3px rgba(18,40,61,.06)" }}>
      <thead>
        <tr style={{ background:"#f2f6fa" }}>
          <th style={{ padding:"10px 14px", textAlign:"left", fontSize:12 }}>Логин</th>
          <th style={{ padding:"10px 14px", textAlign:"left", fontSize:12 }}>Имя</th>
          <th style={{ padding:"10px 14px", textAlign:"left", fontSize:12 }}>Роль</th>
          <th style={{ padding:"10px 14px", textAlign:"left", fontSize:12 }}>Привязка к преподавателю</th>
          <th style={{ padding:"10px 14px" }}></th>
        </tr>
      </thead>
      <tbody>
        {allUsers.map(u => (
          <tr key={u.id} style={{ borderBottom:"1px solid #f2f6fa" }}>
            <td style={{ padding:"10px 14px", fontWeight:600 }}>{u.login}</td>
            <td style={{ padding:"10px 14px" }}>{u.name || "—"}</td>
            <td style={{ padding:"10px 14px" }}>
              <select value={u.role} onChange={e => changeUserRole(u.id, e.target.value)} style={{ fontSize:12, padding:"5px 8px" }}>
                <option value="admin">Администратор</option>
                <option value="tutor">Преподаватель</option>
                <option value="manager">Менеджер</option>
              </select>
            </td>
            <td style={{ padding:"10px 14px", fontSize:13 }}>{tutors.find(t => t.id === u.tutor_id)?.short || "—"}</td>
            <td style={{ padding:"10px 14px", display:"flex", gap:6 }}>
              <button className="bg" style={{ fontSize:11, padding:"5px 8px" }} onClick={() => resetUserPassword(u.login)}>Сбросить пароль</button>
              <button style={{ background:"rgba(226,87,76,.08)", border:"1px solid rgba(226,87,76,.2)", color:"#e2574c", padding:"5px 8px", borderRadius:7, cursor:"pointer" }} onClick={() => deleteUser(u.id, u.login)}>
                <Trash2 size={12} />
              </button>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  </div>
)}

{modal === "addUser" && (
  <div className="ov" onClick={() => setModal(null)}>
    <div className="mo" onClick={e => e.stopPropagation()}>
      <h3 style={{ marginBottom:16 }}>Новый пользователь</h3>
      <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
        <div>
          <div style={{ fontSize:13, fontWeight:600, marginBottom:5 }}>Логин</div>
          <input value={nUser.login} onChange={e => setNUser({...nUser, login:e.target.value})} />
        </div>
        <div>
          <div style={{ fontSize:13, fontWeight:600, marginBottom:5 }}>Пароль</div>
          <input type="text" value={nUser.password} onChange={e => setNUser({...nUser, password:e.target.value})} placeholder="Придумайте пароль" />
        </div>
        <div>
          <div style={{ fontSize:13, fontWeight:600, marginBottom:5 }}>Имя</div>
          <input value={nUser.name} onChange={e => setNUser({...nUser, name:e.target.value})} />
        </div>
        <div>
          <div style={{ fontSize:13, fontWeight:600, marginBottom:5 }}>Роль</div>
          <select value={nUser.role} onChange={e => setNUser({...nUser, role:e.target.value})}>
            <option value="admin">Администратор (полный доступ)</option>
            <option value="tutor">Преподаватель (только своё расписание)</option>
            <option value="manager">Менеджер (без финансовой аналитики/настроек)</option>
          </select>
        </div>
        {nUser.role === "tutor" && (
          <div>
            <div style={{ fontSize:13, fontWeight:600, marginBottom:5 }}>Связать с преподавателем</div>
            <select value={nUser.tutorId} onChange={e => setNUser({...nUser, tutorId:e.target.value})}>
              <option value="">—</option>
              {tutors.map(t => <option key={t.id} value={t.id}>{t.short}</option>)}
            </select>
          </div>
        )}
      </div>
      <div style={{ display:"flex", gap:10, marginTop:20 }}>
        <button className="bp" style={{ flex:1 }} onClick={addUser}>Создать</button>
        <button className="bg" onClick={() => setModal(null)}>Отмена</button>
      </div>
    </div>
  </div>
)}
