import { useState, useEffect, useRef, useMemo, memo, useCallback } from "react";
import { supabase } from "./supabaseClient";
import {
  LayoutGrid, GraduationCap, Users, BookOpen, Calendar, Wallet, CreditCard,
  BarChart3, Inbox, Send, Sparkles, Plus, Trash2, Printer, Pencil, Paperclip,
  FileText, MapPin, Phone, X, Check, ChevronLeft, UploadCloud, UserPlus, Mail,
} from "lucide-react";

// ─── CLOUD + LOCAL STORAGE HELPERS ───────────────────────────────────────────
const LS_KEY = "educrmData_v1";
const CLOUD_ID = "educrmData_v1";
function saveToLS(data) {
  try { localStorage.setItem(LS_KEY, JSON.stringify(data)); } catch(e) {}
}
function loadFromLS() {
  try { const d = localStorage.getItem(LS_KEY); return d ? JSON.parse(d) : null; } catch(e) { return null; }
}

// ─── NORMALIZED TABLES HELPERS ───────────────────────────────────────────────
// Preподаватели, ученики, занятия, платежи и зарплаты now live in real Supabase
// tables (tutors/students/lessons/payments/salaries) instead of one big JSON
// blob. These helpers translate between JS camelCase (birthDate, tutorId...)
// and SQL snake_case (birth_date, tutor_id...) automatically, so the rest of
// the app's code can keep working with the same camelCase objects as before.
function camelToSnakeObj(obj) {
  const out = {};
  for (const k in obj) {
    if (k === undefined) continue;
    const snake = k.replace(/[A-Z]/g, m => "_" + m.toLowerCase());
    out[snake] = obj[k];
  }
  return out;
}
function snakeToCamelObj(obj) {
  const out = {};
  for (const k in obj) {
    const camel = k.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
    out[camel] = obj[k];
  }
  return out;
}
async function fetchTable(table) {
  const { data, error } = await supabase.from(table).select("*");
  if (error) { console.error(`Fetch ${table} error:`, error); return null; }
  return (data || []).map(snakeToCamelObj);
}
async function insertRow(table, obj) {
  const { error } = await supabase.from(table).insert(camelToSnakeObj(obj));
  if (error) console.error(`Insert into ${table} failed:`, error);
  return !error;
}
async function insertRows(table, objs) {
  if (!objs || !objs.length) return true;
  const { error } = await supabase.from(table).insert(objs.map(camelToSnakeObj));
  if (error) console.error(`Bulk insert into ${table} failed:`, error);
  return !error;
}
async function updateRow(table, id, patch) {
  const { error } = await supabase.from(table).update(camelToSnakeObj(patch)).eq("id", id);
  if (error) console.error(`Update ${table} (id=${id}) failed:`, error);
  return !error;
}
async function upsertRows(table, objs) {
  if (!objs || !objs.length) return true;
  const { error } = await supabase.from(table).upsert(objs.map(camelToSnakeObj));
  if (error) console.error(`Upsert into ${table} failed:`, error);
  return !error;
}
async function deleteRow(table, id) {
  const { error } = await supabase.from(table).delete().eq("id", id);
  if (error) console.error(`Delete from ${table} (id=${id}) failed:`, error);
  return !error;
}
async function deleteRows(table, ids) {
  if (!ids || !ids.length) return true;
  const { error } = await supabase.from(table).delete().in("id", ids);
  if (error) console.error(`Bulk delete from ${table} failed:`, error);
  return !error;
}
// Replace the ENTIRE contents of a table with a new array — used where the old
// code used to just do setLessons(newFullArray) wholesale (e.g. dedup cleanup,
// demo reset, Excel import "replace all"). Deletes everything, then re-inserts.
async function replaceTable(table, objs) {
  const { error: delErr } = await supabase.from(table).delete().neq("id", -1);
  if (delErr) { console.error(`Clear ${table} failed:`, delErr); return false; }
  return insertRows(table, objs);
}

// ─── PRINT HELPERS ───────────────────────────────────────────────────────────
function printSchedule(lessons, tutors, students, weekLabel) {
  const rows = lessons.sort((a,b)=>a.date>b.date?1:a.date<b.date?-1:a.time>b.time?1:-1).map(l => {
    const t = tutors.find(x=>x.id===l.tutorId);
    return `<tr><td>${l.date}</td><td>${l.time||"—"}</td><td>${l.studentName}</td><td>${l.subject}</td><td>${t?.short||"—"}</td><td>${l.duration} мин</td><td>${l.price}₽</td><td>${lsnCfg[l.status]?.label||l.status}</td></tr>`;
  }).join("");
  const w = window.open("","_blank");
  w.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>Расписание</title><style>
    body{font-family:Arial,sans-serif;padding:20px;color:#111}
    h1{font-size:20px;margin-bottom:4px}
    p{color:#555;margin:0 0 16px;font-size:13px}
    table{width:100%;border-collapse:collapse;font-size:13px}
    th{background:#f3f4f6;padding:8px 10px;text-align:left;border-bottom:2px solid #e5e7eb;font-weight:600}
    td{padding:7px 10px;border-bottom:1px solid #e5e7eb}
    tr:nth-child(even){background:#fafafa}
    @media print{button{display:none}}
  </style></head><body>
    <h1>📅 Расписание занятий</h1>
    <p>${weekLabel} · Всего занятий: ${lessons.length}</p>
    <button onclick="window.print()" style="margin-bottom:16px;padding:8px 20px;background:#1da0d4;color:white;border:none;border-radius:8px;cursor:pointer;font-size:14px">🖨️ Распечатать</button>
    <table><thead><tr><th>Дата</th><th>Время</th><th>Ученик</th><th>Предмет</th><th>Преподаватель</th><th>Длит.</th><th>Цена</th><th>Статус</th></tr></thead>
    <tbody>${rows}</tbody></table>
  </body></html>`);
  w.document.close();
}

function printReceipt(student, payment) {
  const w = window.open("","_blank");
  w.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>Квитанция</title><style>
    body{font-family:Arial,sans-serif;padding:40px;max-width:500px;margin:0 auto;color:#111}
    .logo{font-size:22px;font-weight:bold;color:#1da0d4;margin-bottom:4px}
    .subtitle{color:#888;font-size:13px;margin-bottom:30px}
    h2{font-size:18px;border-bottom:2px solid #e5e7eb;padding-bottom:10px;margin-bottom:20px}
    .row{display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid #f3f4f6;font-size:14px}
    .label{color:#666}.value{font-weight:600}
    .total{display:flex;justify-content:space-between;padding:14px 0;font-size:18px;font-weight:bold;color:#1da0d4;border-top:2px solid #1da0d4;margin-top:8px}
    .footer{margin-top:30px;font-size:11px;color:#aaa;text-align:center}
    @media print{button{display:none}}
  </style></head><body>
    <div class="logo">Гений</div>
    <div class="subtitle">Образовательный центр «ГЕНИЙ»</div>
    <h2>Квитанция об оплате</h2>
    <div class="row"><span class="label">Дата</span><span class="value">${payment.date}</span></div>
    <div class="row"><span class="label">Ученик</span><span class="value">${student?.name||payment.studentName}</span></div>
    ${student?.parentName?`<div class="row"><span class="label">Родитель</span><span class="value">${student.parentName}</span></div>`:""}
    ${student?.school?`<div class="row"><span class="label">Школа</span><span class="value">${student.school}</span></div>`:""}
    <div class="row"><span class="label">Способ оплаты</span><span class="value">${payment.method==="card"?"Банковская карта":payment.method==="cash"?"Наличные":"Перевод"}</span></div>
    ${payment.comment?`<div class="row"><span class="label">Комментарий</span><span class="value">${payment.comment}</span></div>`:""}
    <div class="total"><span>Итого</span><span>${payment.amount.toLocaleString("ru")} ₽</span></div>
    <button onclick="window.print()" style="margin-top:20px;width:100%;padding:10px;background:#1da0d4;color:white;border:none;border-radius:8px;cursor:pointer;font-size:14px">🖨️ Распечатать</button>
    <div class="footer">Квитанция сформирована автоматически · EduCRM</div>
  </body></html>`);
  w.document.close();
}

// ─── EXCEL IMPORT PARSER ─────────────────────────────────────────────────────
function parseExcelStudents(rows) {
  if (!rows || rows.length < 2) return [];
  const header = rows[0].map(h => String(h||"").toLowerCase().trim());
  const find = (...keys) => keys.map(k=>header.findIndex(h=>h.includes(k))).find(i=>i>=0) ?? -1;
  const iName    = find("имя","фио","ученик","name");
  const iPhone   = find("телефон","phone","тел");
  const iParent  = find("родитель","parent","мама","папа");
  const iSchool  = find("школ","лицей","гимназия");
  const iSubject = find("предмет","subject");
  const iStatus  = find("статус","status");
  const iAge     = find("возраст","age","лет");
  const iAddress = find("адрес","address");
  const iBalance = find("баланс","balance","оплат");
  const result = [];
  for (let i=1; i<rows.length; i++) {
    const r = rows[i];
    const name = iName>=0 ? String(r[iName]||"").trim() : "";
    if (!name) continue;
    const subjects = iSubject>=0 ? String(r[iSubject]||"").split(/[,;\/]/).map(s=>s.trim()).filter(Boolean) : [];
    result.push({
      id: Date.now()+i,
      name,
      phone:       iPhone>=0   ? String(r[iPhone]||"").trim()   : "",
      parentName:  iParent>=0  ? String(r[iParent]||"").trim()  : "",
      school:      iSchool>=0  ? String(r[iSchool]||"").trim()  : "",
      subjects,
      status:      iStatus>=0  ? String(r[iStatus]||"trial").toLowerCase().trim() : "trial",
      age:         iAge>=0     ? Number(r[iAge])||0 : 0,
      address:     iAddress>=0 ? String(r[iAddress]||"").trim() : "",
      balance:     iBalance>=0 ? Number(r[iBalance])||0 : 0,
      totalLessons: 0,
    });
  }
  return result;
}

const initialTutors = [
  { id: 1, name: "Иванова Наталья Владимировна",  short: "Иванова Н.В.",   phone: "+7 905 111-11-11", subjects: ["Математика", "Физика"],          rateType: "percent", rateValue: 50, status: "active", color: "#1da0d4" },
  { id: 2, name: "Сидорова Елена Андреевна",      short: "Сидорова Е.А.", phone: "+7 916 222-22-22", subjects: ["Русский язык", "Литература"],     rateType: "fixed",   rateValue: 500,status: "active", color: "#d6539a" },
  { id: 3, name: "Петров Константин Михайлович",  short: "Петров К.М.",   phone: "+7 926 333-33-33", subjects: ["Английский язык"],                rateType: "percent", rateValue: 55, status: "active", color: "#5cb85c" },
  { id: 4, name: "Орлов Дмитрий Сергеевич",       short: "Орлов Д.С.",    phone: "+7 903 444-44-44", subjects: ["Физика", "Химия"],                rateType: "fixed",   rateValue: 600,status: "active", color: "#f5a623" },
  { id: 5, name: "Кузнецова Людмила Борисовна",   short: "Кузнецова Л.Б.",phone: "+7 915 555-55-55", subjects: ["Биология", "Химия"],              rateType: "percent", rateValue: 45, status: "active", color: "#17a6c9" },
];

const initialStudents = [
  { id: 1, name: "Анна Петрова",   age: 14, phone: "+7 905 123-45-67", parentName: "Петрова Мария Ивановна",          subjects: ["Математика","Физика"],   status: "active", balance: 2400, totalLessons: 12, address: "ул. Ленина, д. 12, кв. 34", school: "Школа №15" },
  { id: 2, name: "Дмитрий Козлов", age: 11, phone: "+7 916 234-56-78", parentName: "Козлов Игорь Петрович",           subjects: ["Русский язык"],          status: "active", balance: 0,    totalLessons: 8,  address: "пр. Мира, д. 5, кв. 78",   school: "Школа №3"  },
  { id: 3, name: "Елена Смирнова", age: 16, phone: "+7 926 345-67-89", parentName: "Смирнова Ольга Андреевна",        subjects: ["Английский язык"],       status: "trial",  balance: 1200, totalLessons: 2,  address: "ул. Садовая, д. 7, кв. 2",  school: "Гимназия №1" },
  { id: 4, name: "Иван Новиков",   age: 13, phone: "+7 903 456-78-90", parentName: "Новиков Александр Вячеславович", subjects: ["Математика"],             status: "paused", balance: -600, totalLessons: 20, address: "",                           school: "Школа №22" },
  { id: 5, name: "Мария Белова",   age: 15, phone: "+7 912 567-89-01", parentName: "Белова Светлана Николаевна",      subjects: ["Физика","Химия"],         status: "active", balance: 3600, totalLessons: 9,  address: "ул. Пушкина, д. 18, кв. 9", school: "Лицей №7"  },
];

const initialLessons = [
  { id: 1, studentId: 1, studentName: "Анна Петрова",   subject: "Математика",      tutorId: 1, tutorShort: "Иванова Н.В.",   date: "2026-03-10", time: "15:00", duration: 60, price: 1200, status: "scheduled" },
  { id: 2, studentId: 2, studentName: "Дмитрий Козлов", subject: "Русский язык",    tutorId: 2, tutorShort: "Сидорова Е.А.",  date: "2026-03-11", time: "14:00", duration: 60, price: 1000, status: "scheduled" },
  { id: 3, studentId: 3, studentName: "Елена Смирнова", subject: "Английский язык", tutorId: 3, tutorShort: "Петров К.М.",    date: "2026-03-12", time: "16:30", duration: 90, price: 1500, status: "scheduled" },
  { id: 4, studentId: 1, studentName: "Анна Петрова",   subject: "Физика",          tutorId: 4, tutorShort: "Орлов Д.С.",     date: "2026-03-07", time: "15:00", duration: 60, price: 1200, status: "completed" },
  { id: 5, studentId: 2, studentName: "Дмитрий Козлов", subject: "Русский язык",    tutorId: 2, tutorShort: "Сидорова Е.А.",  date: "2026-03-05", time: "14:00", duration: 60, price: 1000, status: "completed" },
  { id: 6, studentId: 5, studentName: "Мария Белова",   subject: "Физика",          tutorId: 4, tutorShort: "Орлов Д.С.",     date: "2026-03-08", time: "16:00", duration: 60, price: 1200, status: "completed" },
  { id: 7, studentId: 5, studentName: "Мария Белова",   subject: "Химия",           tutorId: 5, tutorShort: "Кузнецова Л.Б.", date: "2026-03-09", time: "11:00", duration: 60, price: 1100, status: "completed" },
  { id: 8, studentId: 4, studentName: "Иван Новиков",   subject: "Математика",      tutorId: 1, tutorShort: "Иванова Н.В.",   date: "2026-03-01", time: "13:00", duration: 60, price: 1200, status: "completed" },
];

const initialPayments = [
  { id: 1, studentId: 1, studentName: "Анна Петрова",   amount: 4800, date: "2026-03-01", method: "card",     comment: "Абонемент 4 занятия" },
  { id: 2, studentId: 2, studentName: "Дмитрий Козлов", amount: 2000, date: "2026-03-03", method: "cash",     comment: "2 занятия" },
  { id: 3, studentId: 3, studentName: "Елена Смирнова", amount: 1500, date: "2026-03-08", method: "transfer", comment: "Пробное занятие" },
  { id: 4, studentId: 5, studentName: "Мария Белова",   amount: 3600, date: "2026-03-06", method: "card",     comment: "Абонемент" },
];

const initialSalaryPayouts = [
  { id: 1, tutorId: 1, amount: 3600, date: "2026-03-01", comment: "Аванс за февраль", month: "2026-02" },
  { id: 2, tutorId: 2, amount: 2000, date: "2026-03-05", comment: "Зарплата февраль",  month: "2026-02" },
];

const courseCategories = [
  { id:"prep",     label:"🎓 Подготовка к экзаменам", color:"#e2574c", courses:["Подготовка к ОГЭ","Подготовка к ЕГЭ (базовый)","Подготовка к ЕГЭ (профильный)","Подготовка к ВПР"] },
  { id:"math",     label:"📐 Математика и IT",       color:"#1da0d4", courses:["Математика","Базовая математика","Профильная математика","Геометрия","Информатика","Программирование"] },
  { id:"sciences", label:"🔬 Естественные науки",     color:"#5cb85c", courses:["Физика","Химия","Биология","География"] },
  { id:"lang",     label:"🗣️ Языки и литература",     color:"#f5a623", courses:["Русский язык","Английский язык","Арабский язык","Литература","Литературный клуб"] },
  { id:"social",   label:"📚 Гуманитарные",           color:"#d6539a", courses:["История","Обществознание"] },
  { id:"school",   label:"🏫 По классам",             color:"#5cb85c", courses:["1 класс","2 класс","3 класс","4 класс","5 класс","6 класс","7 класс","8 класс","9 класс","10 класс","11 класс"] },
  { id:"early",    label:"🌱 Дошкольное",             color:"#17a6c9", courses:["Дошкольная подготовка","Каллиграфия","Скорочтение"] },
  { id:"special",  label:"🧠 Специалисты",            color:"#8a5cc9", courses:["Логопед","Психолог"] },
  { id:"creative", label:"🎨 Творчество и клубы",     color:"#f5a623", courses:["Живопись","Шахматы","Путешественники во времени","Онлайн занятия"] },
];
const allSubjects = courseCategories.flatMap(c => c.courses);
const subjectColor = s => courseCategories.find(c=>c.courses.includes(s))?.color || "#1da0d4";
const subjectCategory = s => courseCategories.find(c=>c.courses.includes(s)) || {};
const COLORS = ["#1da0d4","#d6539a","#5cb85c","#f5a623","#17a6c9","#8a5cc9","#e2574c","#84cc16"];
const initialPricing = [
  { id:1, category:"📐 Математика и IT",          course:"Математика (базовая)",            price45:600,  price60:800,  price90:1100, price120:1450, groupPrice:400,  note:"" },
  { id:2, category:"📐 Математика и IT",          course:"Профильная математика",           price45:700,  price60:900,  price90:1200, price120:1550, groupPrice:500,  note:"" },
  { id:3, category:"📐 Математика и IT",          course:"Геометрия",                       price45:600,  price60:800,  price90:1100, price120:1450, groupPrice:400,  note:"" },
  { id:4, category:"📐 Математика и IT",          course:"Информатика / Программирование",  price45:700,  price60:900,  price90:1200, price120:1550, groupPrice:500,  note:"" },
  { id:5, category:"🔬 Естественные науки",       course:"Физика",                          price45:600,  price60:900,  price90:1200, price120:1550, groupPrice:450,  note:"" },
  { id:6, category:"🔬 Естественные науки",       course:"Химия",                           price45:600,  price60:900,  price90:1200, price120:1550, groupPrice:450,  note:"" },
  { id:7, category:"🔬 Естественные науки",       course:"Биология / География",            price45:600,  price60:800,  price90:1100, price120:1450, groupPrice:400,  note:"" },
  { id:8, category:"🗣️ Языки",                    course:"Русский язык",                    price45:600,  price60:800,  price90:1100, price120:1450, groupPrice:400,  note:"" },
  { id:9, category:"🗣️ Языки",                    course:"Английский язык",                 price45:700,  price60:1000, price90:1400, price120:1800, groupPrice:500,  note:"" },
  { id:10,category:"🗣️ Языки",                   course:"Арабский язык",                   price45:700,  price60:1000, price90:1400, price120:1800, groupPrice:500,  note:"" },
  { id:11,category:"📚 Гуманитарные",             course:"История / Обществознание",        price45:600,  price60:800,  price90:1100, price120:1450, groupPrice:400,  note:"" },
  { id:12,category:"📚 Гуманитарные",             course:"Литература",                      price45:600,  price60:800,  price90:1100, price120:1450, groupPrice:400,  note:"" },
  { id:13,category:"🎓 Подготовка к экзаменам",   course:"Подготовка к ОГЭ",               price45:700,  price60:1000, price90:1400, price120:1800, groupPrice:500,  note:"Интенсив в мае–июне +20%" },
  { id:14,category:"🎓 Подготовка к экзаменам",   course:"Подготовка к ЕГЭ (базовый)",     price45:800,  price60:1100, price90:1500, price120:1950, groupPrice:600,  note:"Интенсив в мае–июне +20%" },
  { id:15,category:"🎓 Подготовка к экзаменам",   course:"Подготовка к ЕГЭ (профильный)",  price45:900,  price60:1200, price90:1600, price120:2100, groupPrice:700,  note:"Интенсив в мае–июне +20%" },
  { id:16,category:"🎓 Подготовка к экзаменам",   course:"Подготовка к ВПР",               price45:600,  price60:800,  price90:1100, price120:1450, groupPrice:400,  note:"" },
  { id:17,category:"🌱 Дошкольное",               course:"Дошкольная подготовка",           price45:500,  price60:700,  price90:1000, price120:1300, groupPrice:350,  note:"" },
  { id:18,category:"🌱 Дошкольное",               course:"Каллиграфия",                     price45:400,  price60:600,  price90:null, price120:null, groupPrice:300,  note:"" },
  { id:19,category:"🌱 Дошкольное",               course:"Скорочтение",                     price45:500,  price60:700,  price90:null, price120:null, groupPrice:350,  note:"" },
  { id:20,category:"🧠 Специалисты",              course:"Логопед",                         price45:800,  price60:1000, price90:null, price120:null, groupPrice:null, note:"Только индивидуально" },
  { id:21,category:"🧠 Специалисты",              course:"Психолог",                        price45:null, price60:1200, price90:null, price120:null, groupPrice:null, note:"Только индивидуально" },
  { id:22,category:"🎨 Творчество и клубы",       course:"Живопись",                        price45:500,  price60:700,  price90:null, price120:null, groupPrice:350,  note:"" },
  { id:23,category:"🎨 Творчество и клубы",       course:"Шахматы",                         price45:400,  price60:600,  price90:null, price120:null, groupPrice:300,  note:"" },
  { id:24,category:"🎨 Творчество и клубы",       course:"Путешественники во времени",      price45:null, price60:600,  price90:null, price120:null, groupPrice:350,  note:"Только групповые" },
  { id:25,category:"🎨 Творчество и клубы",       course:"Онлайн занятия",                  price45:500,  price60:700,  price90:1000, price120:1300, groupPrice:400,  note:"-10% к очной цене" },
];

// Editable course catalog — one row per course, combining category info with a base price (60 min, from pricing where available)
const initialCourseCatalog = courseCategories.flatMap(cat =>
  cat.courses.map((course, i) => {
    const p = initialPricing.find(pr => pr.course === course);
    return {
      id: `${cat.id}_${i}`,
      category: cat.label,
      name: course,
      price: p?.price60 ?? "",
      description: "",
    };
  })
);

const initialRules = [
  { id:1, section:"📋 Запись и пробное занятие", text:"Первое пробное занятие — бесплатно для новых учеников центра." },
  { id:2, section:"📋 Запись и пробное занятие", text:"Запись на занятия осуществляется по телефону, WhatsApp или лично в центре." },
  { id:3, section:"📋 Запись и пробное занятие", text:"При записи необходимо указать имя ребёнка, класс, предмет и удобное время." },
  { id:4, section:"💳 Оплата", text:"Оплата производится авансом — за месяц или за 4 занятия." },
  { id:5, section:"💳 Оплата", text:"Принимается оплата наличными, банковской картой и переводом на карту." },
  { id:6, section:"💳 Оплата", text:"При оплате 8 и более занятий вперёд — скидка 5%." },
  { id:7, section:"💳 Оплата", text:"Абонемент действителен 1 месяц с момента первого занятия." },
  { id:8, section:"❌ Отмена и перенос", text:"Отмена занятия принимается не позднее чем за 3 часа до начала." },
  { id:9, section:"❌ Отмена и перенос", text:"При отмене менее чем за 3 часа — занятие считается проведённым и не возвращается." },
  { id:10,section:"❌ Отмена и перенос", text:"Перенос занятия возможен 1 раз в месяц по уважительной причине." },
  { id:11,section:"❌ Отмена и перенос", text:"Занятия, пропущенные без предупреждения, не переносятся и не возвращаются." },
  { id:12,section:"📐 Порядок проведения занятий", text:"Ученик должен приходить на занятие с тетрадью, учебником и необходимыми принадлежностями." },
  { id:13,section:"📐 Порядок проведения занятий", text:"Опоздание ученика более чем на 15 минут не компенсируется дополнительным временем." },
  { id:14,section:"📐 Порядок проведения занятий", text:"Домашние задания, заданные преподавателем, обязательны для выполнения." },
  { id:15,section:"👨‍👩‍👧 Для родителей", text:"Родители получают информацию об успеваемости ребёнка по запросу или раз в месяц." },
  { id:16,section:"👨‍👩‍👧 Для родителей", text:"Вопросы по расписанию и оплате решаются с администратором центра." },
  { id:17,section:"👨‍👩‍👧 Для родителей", text:"Центр не несёт ответственности за личные вещи учеников, оставленные в помещении." },
];
const initialRequests = [
  { id:1, parentName:"Козлова Ирина",   phone:"+7 900 111-22-33", course:"Подготовка к ОГЭ",     studentName:"Козлов Артём",   age:15, comment:"Нужна подготовка к ОГЭ по математике, хотим с апреля", status:"new",       date:"2026-03-08", assignedTutorId:null },
  { id:2, parentName:"Петров Андрей",   phone:"+7 900 222-33-44", course:"Английский язык",      studentName:"Петрова Алина",   age:9,  comment:"Дочь хочет учить английский, уровень нулевой",          status:"contacted", date:"2026-03-07", assignedTutorId:3 },
  { id:3, parentName:"Смирнова Татьяна",phone:"+7 900 333-44-55", course:"Дошкольная подготовка",studentName:"Смирнов Миша",    age:6,  comment:"Готовимся к школе, интересует подготовительная группа",status:"trial",     date:"2026-03-06", assignedTutorId:null },
  { id:4, parentName:"Алиев Руслан",    phone:"+7 900 444-55-66", course:"Шахматы",              studentName:"Алиева Зарина",   age:10, comment:"Ребёнок увлекается шахматами, хотим записать в секцию",status:"new",       date:"2026-03-09", assignedTutorId:null },
  { id:5, parentName:"Захарова Мария",  phone:"+7 900 555-66-77", course:"Логопед",              studentName:"Захаров Никита",  age:7,  comment:"Проблемы с произношением, нужна консультация логопеда",status:"enrolled",  date:"2026-03-05", assignedTutorId:null },
];

const statusCfg = {
  active:   { label:"Активен",   color:"#5cb85c", bg:"rgba(34,197,94,0.12)"   },
  trial:    { label:"Пробный",   color:"#f5a623", bg:"rgba(245,158,11,0.12)"  },
  paused:   { label:"Пауза",     color:"#6d7f92", bg:"rgba(148,163,184,0.12)" },
  inactive: { label:"Неактивен", color:"#e2574c", bg:"rgba(239,68,68,0.12)"   },
};
const lsnCfg = {
  scheduled:     { label:"Запланировано",              color:"#1da0d4" },
  completed:     { label:"Проведено",                  color:"#5cb85c" },
  cancelled:     { label:"Отменено",                   color:"#a9b8c6" },
  noshow_burned: { label:"Не пришёл — сгорело",         color:"#e2574c" },
  sick_valid:    { label:"Болен (уважительная)",        color:"#17a6c9" },
  sick_invalid:  { label:"Болен (неуважительная)",      color:"#f5a623" },
};
const channelCfg = {
  whatsapp:{ label:"WhatsApp", icon:"💬", color:"#25d366" },
  sms:     { label:"SMS",      icon:"📱", color:"#1da0d4" },
  telegram:{ label:"Telegram", icon:"✈️", color:"#229ed9" },
  email:   { label:"Email",    icon:"📧", color:"#f5a623" },
};
const audLabels = { all:"Все ученики", active:"Активные", debtors:"Должники", zeroblance:"Нулевой баланс", trial:"На пробном", paused:"На паузе", inactive:"Неактивные", math:"Математика", english:"Английский язык" };
const audIcons  = { all:"👥", active:"✅", debtors:"💸", zeroblance:"⚠️", trial:"🔍", paused:"⏸️", inactive:"❌", math:"📐", english:"🇬🇧" };

function calcEarning(lesson, tutor) {
  if (!tutor) return 0;
  return tutor.rateType === "percent" ? Math.round(lesson.price * tutor.rateValue / 100) : tutor.rateValue;
}

// Requests used to store a plain "course" string, then a "courses" array; now they
// can have subject+teacher pairs via "subjectTeachers", same shape as the student form.
// These helpers keep all older data working without any migration step.
function getReqSubjectTeachers(req) {
  if (req.subjectTeachers && req.subjectTeachers.length) return req.subjectTeachers;
  if (req.courses && req.courses.length) return req.courses.map(c=>({ subject:c, tutorId:"" }));
  return req.course ? [{ subject:req.course, tutorId:"" }] : [];
}
function getReqCourses(req) {
  return getReqSubjectTeachers(req).map(st=>st.subject);
}
function getReqGrade(req) {
  if (req.grade) return req.grade;
  return req.age ? `${req.age} лет` : "";
}

function Av({ name, color, size = 36 }) {
  const i = name.split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase();
  return <div style={{ width:size, height:size, borderRadius:size*0.28, background:`linear-gradient(135deg, ${color||"#1da0d4"}, ${color||"#1da0d4"}dd)`, display:"flex", alignItems:"center", justifyContent:"center", fontSize:size*0.35, fontWeight:700, color:"white", flexShrink:0, boxShadow:`0 2px 6px ${color||"#1da0d4"}40`, letterSpacing:"0.02em" }}>{i}</div>;
}
function Tag({ c, bg, children }) {
  return <span style={{ display:"inline-block", padding:"3px 10px", borderRadius:20, fontSize:11, fontWeight:600, margin:2, color:c, background:bg }}>{children}</span>;
}

const MONTH_NAMES = ["январь","февраль","март","апрель","май","июнь","июль","август","сентябрь","октябрь","ноябрь","декабрь"];
function BirthDatePicker({ value, onChange }) {
  const parseVal = v => v ? v.split("-").map(Number) : [null, null, null]; // [year, month, day]
  const [localY, setLocalY] = useState(() => parseVal(value)[0]);
  const [localM, setLocalM] = useState(() => parseVal(value)[1]);
  const [localD, setLocalD] = useState(() => parseVal(value)[2]);

  // Re-sync if the parent's value changes from outside (e.g. switching to edit a different student)
  useEffect(() => {
    const [yy, mm, dd] = parseVal(value);
    setLocalY(yy); setLocalM(mm); setLocalD(dd);
  }, [value]);

  const currentYear = new Date().getFullYear();
  const years = Array.from({ length: 30 }, (_, i) => currentYear - i); // last 30 years, most recent first
  const daysInMonth = (yy, mm) => (yy && mm) ? new Date(yy, mm, 0).getDate() : 31;
  const days = Array.from({ length: daysInMonth(localY, localM) }, (_, i) => i + 1);

  const commit = (newD, newM, newY) => {
    setLocalD(newD); setLocalM(newM); setLocalY(newY);
    if (newD && newM && newY) onChange(`${newY}-${String(newM).padStart(2,"0")}-${String(newD).padStart(2,"0")}`);
  };
  return (
    <div style={{ display:"grid", gridTemplateColumns:"1fr 1.4fr 1fr", gap:6 }}>
      <select value={localD||""} onChange={e=>commit(Number(e.target.value), localM, localY)}>
        <option value="">День</option>
        {days.map(dd=><option key={dd} value={dd}>{dd}</option>)}
      </select>
      <select value={localM||""} onChange={e=>commit(localD, Number(e.target.value), localY)}>
        <option value="">Месяц</option>
        {MONTH_NAMES.map((mn,i)=><option key={i} value={i+1}>{mn}</option>)}
      </select>
      <select value={localY||""} onChange={e=>commit(localD, localM, Number(e.target.value))}>
        <option value="">Год</option>
        {years.map(yy=><option key={yy} value={yy}>{yy}</option>)}
      </select>
    </div>
  );
}
function AttachmentsBlock({ title = "Документы", files = [], onUpload, onDelete, uploading }) {
  const inputRef = useRef(null);
  return (
    <div style={{ background:"#f2f6fa", borderRadius:12, padding:16, marginTop:16, boxShadow:"inset 0 1px 2px rgba(18,40,61,0.04)" }}>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:10 }}>
        <div style={{ fontSize:13, fontWeight:700, color:"#12283d", display:"flex", alignItems:"center", gap:6 }}><Paperclip size={15} /> {title}</div>
        <button className="bg" style={{ fontSize:11, padding:"5px 10px", display:"flex", alignItems:"center", gap:5 }} disabled={uploading} onClick={()=>inputRef.current?.click()}>
          {uploading ? "Загрузка..." : (<><UploadCloud size={13} /> Загрузить файл</>)}
        </button>
        <input ref={inputRef} type="file" style={{ display:"none" }} onChange={e=>{ const f=e.target.files[0]; if(f) onUpload(f); e.target.value=""; }} />
      </div>
      {files.length===0 ? (
        <div style={{ fontSize:12, color:"#7a8a9c" }}>Файлов пока нет — договор, скан паспорта и т.п.</div>
      ) : (
        <div style={{ display:"flex", flexDirection:"column", gap:6 }}>
          {files.map((f,i)=>(
            <div key={i} style={{ display:"flex", alignItems:"center", gap:8, background:"#ffffff", border:"1px solid #dbe6f0", boxShadow:"0 1px 3px rgba(18,40,61,.05)", borderRadius:8, padding:"7px 10px", boxShadow:"0 1px 2px rgba(18,40,61,0.05)", transition:"box-shadow .15s" }}>
              <FileText size={15} color="#1da0d4" style={{ flexShrink:0 }} />
              <a href={f.url} target="_blank" rel="noopener noreferrer" style={{ flex:1, fontSize:12, color:"#1da0d4", textDecoration:"none", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{f.name}</a>
              <span style={{ fontSize:10, color:"#7a8a9c" }}>{f.uploadedAt}</span>
              <button onClick={()=>onDelete(f)} style={{ background:"rgba(226,87,76,0.08)", border:"1px solid rgba(226,87,76,0.2)", color:"#e2574c", padding:"3px 8px", borderRadius:6, cursor:"pointer", display:"flex", alignItems:"center" }}><Trash2 size={13} /></button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Requests page: memoized row/card components ─────────────────────────────
// Wrapped in memo() so that typing in the search box, sorting, or paginating
// doesn't force every single row to re-render — only rows whose own props changed do.
const RequestTableRow = memo(function RequestTableRow({ req, reqCfg, assignedTutor, tutors, onStatusChange, onAssignTutor, onScheduleTrial, onEnroll, onDelete, onOpen }) {
  return (
    <tr className="rh" style={{ borderBottom:"1px solid #f2f6fa" }}>
      <td style={{ padding:"11px 14px", fontSize:12, color:"#7a8a9c", whiteSpace:"nowrap" }}>{req.date}</td>
      <td style={{ padding:"11px 14px" }}>
        <div style={{ display:"flex", alignItems:"center", gap:10 }}>
          <Av name={req.parentName||"?"} color="#1da0d4" size={30} />
          <div>
            <div style={{ fontSize:13, fontWeight:700 }}>{req.parentName}</div>
            <a href={`tel:${req.phone}`} style={{ fontSize:12, color:"#1da0d4", textDecoration:"none" }}>{req.phone}</a>
          </div>
        </div>
      </td>
      <td style={{ padding:"11px 14px" }}>
        <div style={{ fontSize:13 }}>{req.studentName}</div>
        {getReqGrade(req) ? <div style={{ fontSize:11, color:"#7a8a9c" }}>{getReqGrade(req)}</div> : null}
      </td>
      <td style={{ padding:"11px 14px" }}>
        <div style={{ display:"flex", flexDirection:"column", gap:3 }}>
          {getReqSubjectTeachers(req).map((st,i)=>{
            const cc = subjectCategory(st.subject);
            const tu = tutors.find(t=>t.id===Number(st.tutorId));
            return (
              <div key={i} style={{ display:"flex", alignItems:"center", gap:5 }}>
                <Tag c={cc.color||"#1da0d4"} bg={`${cc.color||"#1da0d4"}18`}>{st.subject}</Tag>
                {tu && <span style={{ fontSize:10, color:"#7a8a9c" }}>— {tu.short}</span>}
              </div>
            );
          })}
        </div>
      </td>
      <td style={{ padding:"11px 14px" }}>
        <select value={req.status} onChange={e=>onStatusChange(req.id, e.target.value)} style={{ fontSize:12, padding:"5px 8px", color: reqCfg[req.status]?.color, fontWeight:600 }}>
          {Object.entries(reqCfg).map(([k,v])=><option key={k} value={k}>{v.label}</option>)}
        </select>
      </td>
      <td style={{ padding:"11px 14px" }}>
        <select value={req.assignedTutorId||""} onChange={e=>onAssignTutor(req.id, e.target.value)} style={{ fontSize:12, padding:"5px 8px" }}>
          <option value="">—</option>
          {tutors.map(t=><option key={t.id} value={t.id}>{t.name}</option>)}
        </select>
      </td>
      <td style={{ padding:"11px 14px" }}>
        <div style={{ display:"flex", gap:6, flexWrap:"wrap" }}>
          <button className="bg" style={{ fontSize:11, padding:"5px 10px" }} onClick={()=>onOpen(req)}><Pencil size={11} /> Редактировать</button>
          {req.status==="contacted" && <button className="bp" style={{ fontSize:11, padding:"5px 8px" }} onClick={()=>onScheduleTrial(req)}>Пробное</button>}
          {req.status==="trial" && <button className="bp" style={{ fontSize:11, padding:"5px 8px", background:"linear-gradient(135deg,#5cb85c,#16a34a)" }} onClick={()=>onEnroll(req.id)}>Записать</button>}
          <button style={{ background:"rgba(226,87,76,0.08)", border:"1px solid rgba(226,87,76,0.2)", color:"#e2574c", padding:"5px 8px", borderRadius:7, cursor:"pointer", fontSize:11, fontFamily:"inherit" }} onClick={()=>onDelete(req.id)}>🗑</button>
        </div>
      </td>
    </tr>
  );
});

const RequestKanbanCard = memo(function RequestKanbanCard({ req, tutors, assignedTutor, onDragStart, onOpen, onDelete }) {
  return (
    <div
      draggable
      onDragStart={e=>onDragStart(e, req.id)}
      style={{ background:"#ffffff", border:"1px solid #dbe6f0", borderRadius:12, padding:"12px 14px", marginBottom:8, cursor:"grab", boxShadow:"0 1px 3px rgba(18,40,61,.05)" }}>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", gap:8 }}>
        <div style={{ display:"flex", alignItems:"center", gap:8, minWidth:0 }}>
          <Av name={req.parentName||"?"} color="#1da0d4" size={26} />
          <div style={{ fontSize:13, fontWeight:700, color:"#12283d", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{req.parentName}</div>
        </div>
        <button onClick={()=>onDelete(req.id)} style={{ background:"transparent", border:"none", color:"#a9b8c6", cursor:"pointer", fontSize:11, flexShrink:0 }}>✕</button>
      </div>
      <div style={{ fontSize:12, color:"#55677a", marginTop:6 }}>{req.studentName}{getReqGrade(req) ? `, ${getReqGrade(req)}` : ""}</div>
      {getReqSubjectTeachers(req).length>0 && (
        <div style={{ marginTop:6, display:"flex", flexDirection:"column", gap:3 }}>
          {getReqSubjectTeachers(req).map((st,i)=>{
            const cc = subjectCategory(st.subject);
            const tu = tutors.find(t=>t.id===Number(st.tutorId));
            return (
              <div key={i} style={{ display:"flex", alignItems:"center", gap:5, flexWrap:"wrap" }}>
                <Tag c={cc.color||"#1da0d4"} bg={`${cc.color||"#1da0d4"}18`}>{st.subject}</Tag>
                {tu && <span style={{ fontSize:10, color:"#7a8a9c" }}>— {tu.short}</span>}
              </div>
            );
          })}
        </div>
      )}
      {assignedTutor && <div style={{ marginTop:4 }}><Tag c={assignedTutor.color} bg={`${assignedTutor.color}18`}>{assignedTutor.short}</Tag></div>}
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginTop:8 }}>
        <div style={{ fontSize:10, color:"#a9b8c6" }}>{req.date}</div>
        <button className="bg" style={{ fontSize:10, padding:"3px 8px" }} onClick={()=>onOpen(req)}><Pencil size={10} /> Изменить</button>
      </div>
    </div>
  );
});

const ReqSkeletonRow = () => (
  <tr>
    {Array.from({length:7}).map((_,i)=>(
      <td key={i} style={{ padding:"14px" }}><div style={{ height:14, borderRadius:6, background:"linear-gradient(90deg,#f2f6fa,#e9eef3,#f2f6fa)", backgroundSize:"200% 100%", animation:"reqShimmer 1.3s ease-in-out infinite" }} /></td>
    ))}
  </tr>
);

export default function App() {
  // ── Load from localStorage or use defaults (instant local cache) ──
  const saved = loadFromLS();
  const [view, setView]         = useState("dashboard");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [tutors, setTutors]     = useState(saved?.tutors     || initialTutors);
  const [students, setStudents] = useState(saved?.students   || initialStudents);
  const [lessons, setLessons]   = useState(saved?.lessons    || initialLessons);
  const [payments, setPayments] = useState(saved?.payments   || initialPayments);
  const [salaries, setSalaries] = useState(saved?.salaries   || initialSalaryPayouts);
  const [mailings,  setMailings]  = useState(saved?.mailings  || [
    { id:1, title:"Напоминание об оплате", channel:"whatsapp", audience:"debtors", status:"sent", sentAt:"2026-03-07", sentCount:1, text:"Здравствуйте, {{parentName}}! У {{studentName}} задолженность {{balance}}₽. Просим оплатить до конца недели." },
    { id:2, title:"Поздравление 8 марта",  channel:"sms",      audience:"all",     status:"sent", sentAt:"2026-03-08", sentCount:5, text:"Дорогой {{studentName}} и {{parentName}}! Поздравляем с праздником! 🌸" },
  ]);
  const [requests,  setRequests]  = useState(saved?.requests  || initialRequests);
  const [nRequest,  setNRequest]  = useState({ parentName:"", phone:"", comment:"", status:"new", children:[{ studentName:"", grade:"", subjectTeachers:[{ subject:"", tutorId:"" }] }] });
  const [pricing,    setPricing]    = useState(saved?.pricing   || initialPricing);
  const [courseCatalog, setCourseCatalog] = useState(saved?.courseCatalog || initialCourseCatalog);
  const [candidates, setCandidates] = useState(saved?.candidates || []);
  const [rules,      setRules]      = useState(saved?.rules     || initialRules);
  const [editPricing,setEditPricing]= useState(null);
  const [editRule,   setEditRule]   = useState(null);
  const [pricingTab, setPricingTab] = useState("prices");
  const [reportMonth, setReportMonth] = useState("2026-03");
  const [calendarMonthOffset, setCalendarMonthOffset] = useState(0);
  const [reportTab, setReportTab] = useState("finance");
  const [reqSearch, setReqSearch] = useState("");
  const [reqFilter, setReqFilter] = useState("all");
  const [reqSearchInput, setReqSearchInput] = useState(""); // raw typed value, debounced into reqSearch
  const [reqSearching, setReqSearching] = useState(false);  // true during the debounce window (drives skeleton rows)
  const [reqViewMode, setReqViewMode] = useState("table");  // "table" | "kanban"
  const [reqSortKey, setReqSortKey] = useState("date");
  const [reqSortDir, setReqSortDir] = useState("desc");
  const [reqPage, setReqPage] = useState(1);
  const [editingRequest, setEditingRequest] = useState(null);
  const REQ_PAGE_SIZE = 10;

  // ── Requests page: filtering/sorting/pagination/handlers ──
  // Kept at the top level (not inside the conditional {view==="requests" && ...} block)
  // because hooks must run in the same order on every render — putting them inside a
  // conditionally-rendered block crashes React the moment the view changes.
  const reqCfg = {
    new:       { label:"Новый",        color:"#1da0d4", bg:"rgba(99,102,241,0.12)"  },
    contacted: { label:"Связались",    color:"#f5a623", bg:"rgba(245,158,11,0.12)"  },
    trial:     { label:"Пробное",      color:"#5cb85c", bg:"rgba(34,197,94,0.12)"   },
    enrolled:  { label:"Записан",      color:"#17a6c9", bg:"rgba(6,182,212,0.12)"   },
    rejected:  { label:"Отказался",    color:"#e2574c", bg:"rgba(239,68,68,0.12)"   },
  };
  const reqFiltered = useMemo(() => {
    const q = reqSearch.toLowerCase();
    const qDigits = reqSearch.replace(/\D/g,"");
    let list = requests.filter(r=>{
      const matchQ = !q || r.parentName.toLowerCase().includes(q) || r.studentName.toLowerCase().includes(q) || getReqCourses(r).some(c=>c.toLowerCase().includes(q)) || (qDigits && r.phone.replace(/\D/g,"").includes(qDigits));
      const matchF = reqFilter==="all" || r.status===reqFilter;
      return matchQ && matchF;
    });
    list = [...list].sort((a,b)=>{
      let av = a[reqSortKey], bv = b[reqSortKey];
      if (reqSortKey==="assignedTutorId") { av = tutors.find(t=>t.id===a.assignedTutorId)?.short||""; bv = tutors.find(t=>t.id===b.assignedTutorId)?.short||""; }
      if (av==null) av=""; if (bv==null) bv="";
      const cmp = String(av).localeCompare(String(bv), "ru", { numeric:true });
      return reqSortDir==="asc" ? cmp : -cmp;
    });
    return list;
  }, [requests, reqSearch, reqFilter, reqSortKey, reqSortDir, tutors]);
  const reqTotalPages = Math.max(1, Math.ceil(reqFiltered.length / REQ_PAGE_SIZE));
  const reqPageSafe = Math.min(reqPage, reqTotalPages);
  const reqPageItems = useMemo(() => reqFiltered.slice((reqPageSafe-1)*REQ_PAGE_SIZE, reqPageSafe*REQ_PAGE_SIZE), [reqFiltered, reqPageSafe]);

  const toggleReqSort = useCallback((key) => {
    setReqSortDir(d => reqSortKey===key ? (d==="asc"?"desc":"asc") : "desc");
    setReqSortKey(key);
  }, [reqSortKey]);
  const handleReqStatusChange = useCallback((id, status) => setRequests(prev=>prev.map(r=>r.id===id?{...r,status}:r)), []);
  const handleReqAssignTutor = useCallback((id, tutorId) => setRequests(prev=>prev.map(r=>r.id===id?{...r,assignedTutorId:tutorId?Number(tutorId):null}:r)), []);
  const handleReqScheduleTrial = useCallback((req) => {
    setNLesson({ studentId:"", subject:getReqCourses(req)[0]||"", tutorId:req.assignedTutorId||"", date:"", time:"", duration:60, price:1200 });
    setModal("addLesson");
    setRequests(prev=>prev.map(r=>r.id===req.id?{...r,status:"trial"}:r));
  }, []);
  const handleReqEnroll = useCallback((id) => { setRequests(prev=>prev.map(r=>r.id===id?{...r,status:"enrolled"}:r)); notify("Ученик переведён в базу!"); }, []);
  const handleReqDelete = useCallback((id) => { if (window.confirm("Удалить запрос?")) { setRequests(prev=>prev.filter(r=>r.id!==id)); notify("Запрос удалён"); } }, []);
  const handleReqOpen = useCallback((req) => setEditingRequest({...req, subjectTeachers: getReqSubjectTeachers(req).length ? getReqSubjectTeachers(req) : [{subject:"",tutorId:""}], grade: getReqGrade(req) }), []);
  const handleReqDragStart = useCallback((e, id) => { e.dataTransfer.setData("text/requestId", String(id)); }, []);
  const handleReqDropOnColumn = useCallback((e, status) => {
    e.preventDefault();
    const id = Number(e.dataTransfer.getData("text/requestId"));
    if (id) setRequests(prev=>prev.map(r=>r.id===id?{...r,status}:r));
  }, []);
  const [candSearch, setCandSearch] = useState("");
  const [candFilter, setCandFilter] = useState("all");
  const [selCandidate, setSelCandidate] = useState(null);
  const [nCandidate, setNCandidate] = useState({ name:"", phone:"", email:"", subjects:[], notes:"", status:"new" });

  const [selTutor,  setSelTutor]   = useState(null);
  const [selStudent,setSelStudent] = useState(null);
  const [modal,  setModal]  = useState(null);
  const [notif,  setNotif]  = useState(null);
  const [search, setSearch] = useState("");
  const [fStatus,setFStatus]= useState("all");
  const [tTab,   setTTab]   = useState("overview");
  const [weekOffset,    setWeekOffset]    = useState(0);
  const [schedView,     setSchedView]     = useState("week");
  const [editLesson,    setEditLesson]    = useState(null);
  const [editLessonType, setEditLessonType] = useState("individual");
  const [editGroupRoster, setEditGroupRoster] = useState([]);
  const [editGroupName, setEditGroupName] = useState("");
  const [editRecurOn,       setEditRecurOn]       = useState(false);
  const [editRecurWeekdays, setEditRecurWeekdays] = useState([]);
  const [editRecurEndDate,  setEditRecurEndDate]  = useState("");
  const [schedTutorFilter, setSchedTutorFilter] = useState("all");
  const [schedSelectedDate, setSchedSelectedDate] = useState(null); // for "По педагогам" view — null = today
  const [recurModal,    setRecurModal]    = useState(false);
  const [recurCount,    setRecurCount]    = useState(4);
  const [recurInterval, setRecurInterval] = useState(7);
  const [recurWeekdays, setRecurWeekdays] = useState([]); // 0=Пн ... 6=Вс
  const [recurEndDate,  setRecurEndDate]  = useState("");
  const [saveIndicator, setSaveIndicator] = useState(false);
  const [importModal,   setImportModal]   = useState(false);
  const [importPreview, setImportPreview] = useState([]);
  const [importMode,    setImportMode]    = useState("merge"); // merge | replace
  const fileInputRef = useRef(null);

  // ── Cloud sync state ──
  const [cloudLoading, setCloudLoading] = useState(true);
  const [cloudSyncing, setCloudSyncing] = useState(false);
  const isRemoteUpdate = useRef(false);
  const cloudSaveTimeout = useRef(null);

  // ── Helper: apply a snapshot of the REMAINING blob-based data (everything not
  // yet migrated to its own table: mailings, requests, pricing, rules, catalog,
  // candidates). Tutors/students/lessons/payments/salaries now live in real
  // tables and are loaded/synced separately below. ──
  function applyCloudSnapshot(data) {
    if (!data) return;
    isRemoteUpdate.current = true;
    if (data.mailings) setMailings(data.mailings);
    if (data.requests) setRequests(data.requests);
    if (data.pricing) setPricing(data.pricing);
    if (data.rules) setRules(data.rules);
    if (data.courseCatalog) setCourseCatalog(data.courseCatalog);
    if (data.candidates) setCandidates(data.candidates);
    saveToLS({ ...loadFromLS(), ...data });
  }

  // ── Initial load from Supabase (runs once on mount) ──
  useEffect(() => {
    let cancelled = false;
    async function loadInitial() {
      try {
        // Load the 5 migrated entities from their own real tables
        const [tData, sData, lData, pData, salData] = await Promise.all([
          fetchTable("tutors"),
          fetchTable("students"),
          fetchTable("lessons"),
          fetchTable("payments"),
          fetchTable("salaries"),
        ]);
        if (cancelled) return;
        if (tData) setTutors(tData);
        if (sData) setStudents(sData);
        if (lData) setLessons(lData);
        if (pData) setPayments(pData);
        if (salData) setSalaries(salData);

        // Load the remaining, not-yet-migrated entities from the old blob
        const { data: row, error } = await supabase
          .from("crm_state")
          .select("data")
          .eq("id", CLOUD_ID)
          .maybeSingle();
        if (cancelled) return;
        if (error) {
          console.error("Supabase load error:", error);
        } else if (row?.data) {
          applyCloudSnapshot(row.data);
        } else {
          // No cloud record yet for the remaining fields — push current (demo) data
          await supabase.from("crm_state").upsert({
            id: CLOUD_ID,
            data: { mailings, requests, pricing, rules, courseCatalog, candidates },
            updated_at: new Date().toISOString(),
          });
        }
      } catch (e) {
        console.error("Supabase init error:", e);
      }
      if (!cancelled) setCloudLoading(false);
    }
    loadInitial();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Realtime: pick up changes to the 5 migrated tables from other devices ──
  useEffect(() => {
    const channel = supabase
      .channel("core_tables_changes")
      .on("postgres_changes", { event: "*", schema: "public", table: "tutors" }, async () => {
        const d = await fetchTable("tutors"); if (d) setTutors(d);
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "students" }, async () => {
        const d = await fetchTable("students"); if (d) setStudents(d);
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "lessons" }, async () => {
        const d = await fetchTable("lessons"); if (d) setLessons(d);
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "payments" }, async () => {
        const d = await fetchTable("payments"); if (d) setPayments(d);
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "salaries" }, async () => {
        const d = await fetchTable("salaries"); if (d) setSalaries(d);
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, []);

  // ── Realtime subscription: pick up changes made from other devices/browsers ──
  useEffect(() => {
    const channel = supabase
      .channel("crm_state_changes")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "crm_state", filter: `id=eq.${CLOUD_ID}` },
        (payload) => {
          if (payload.new?.data) applyCloudSnapshot(payload.new.data);
        }
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, []);

  // ── Auto-save the REMAINING (not-yet-migrated) data to localStorage + Supabase (debounced) ──
  // Tutors/students/lessons/payments/salaries are NOT included here any more —
  // they save themselves immediately at the point of each change (see addStudent,
  // addLesson, etc. below), since they now live in their own real tables.
  useEffect(() => {
    saveToLS({ ...loadFromLS(), mailings, requests, pricing, rules, courseCatalog, candidates });
    setSaveIndicator(true);
    const t = setTimeout(() => setSaveIndicator(false), 1500);

    if (isRemoteUpdate.current) {
      isRemoteUpdate.current = false;
      return () => clearTimeout(t);
    }
    if (cloudLoading) return () => clearTimeout(t);

    if (cloudSaveTimeout.current) clearTimeout(cloudSaveTimeout.current);
    cloudSaveTimeout.current = setTimeout(async () => {
      setCloudSyncing(true);
      try {
        const { error } = await supabase.from("crm_state").upsert({
          id: CLOUD_ID,
          data: { mailings, requests, pricing, rules, courseCatalog, candidates },
          updated_at: new Date().toISOString(),
        });
        if (error) console.error("Supabase save error:", error);
      } catch (e) {
        console.error("Supabase save exception:", e);
      }
      setCloudSyncing(false);
    }, 800);

    return () => {
      clearTimeout(t);
      clearTimeout(cloudSaveTimeout.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mailings, requests, pricing, rules, courseCatalog, candidates]);

  function emptyChild() { return { name:"", birthDate:"", school:"", grade:"", subjectTeachers:[{ subject:"", tutorId:"" }], status:"trial", tuitionNote:"" }; }
  const [familyForm, setFamilyForm] = useState({ parentName:"", phone:"", extraPhones:[], address:"", notes:"", children:[emptyChild()] });
  function calcAge(birthDate) {
    if (!birthDate) return null;
    const b = new Date(birthDate); const now = new Date();
    let a = now.getFullYear() - b.getFullYear();
    const m = now.getMonth() - b.getMonth();
    if (m < 0 || (m === 0 && now.getDate() < b.getDate())) a--;
    return a;
  }

  // ── Edit existing student ──
  const [editingStudentId, setEditingStudentId] = useState(null);
  const [nStudentEdit, setNStudentEdit] = useState(null);
  function startEditStudent(s) {
    setNStudentEdit({
      name: s.name, birthDate: s.birthDate||"", school: s.school||"", grade: s.grade||"",
      phone: s.phone||"", extraPhones: s.extraPhones||[], parentName: s.parentName||"", parentPhone: s.parentPhone||"",
      address: s.address||"", notes: s.notes||"", tuitionNote: s.tuitionNote||"", status: s.status,
      subjectTeachers: s.subjectTeachers?.length ? s.subjectTeachers : (s.subjects||[]).map(sub=>({subject:sub,tutorId:""})),
    });
    setEditingStudentId(s.id);
    setModal("editStudent");
  }
  function saveEditStudent() {
    if (!nStudentEdit.name) return;
    const editedStudent = students.find(s => s.id === editingStudentId);
    const sharedFamilyFields = {
      parentName: nStudentEdit.parentName,
      parentPhone: nStudentEdit.parentPhone,
      phone: nStudentEdit.phone,
      extraPhones: nStudentEdit.extraPhones.filter(Boolean),
      address: nStudentEdit.address,
    };
    const siblingCount = editedStudent?.familyId ? students.filter(s => s.familyId===editedStudent.familyId && s.id!==editingStudentId).length : 0;
    const mainPatch = {
      name: nStudentEdit.name, birthDate: nStudentEdit.birthDate,
      age: calcAge(nStudentEdit.birthDate) ?? editedStudent?.age,
      school: nStudentEdit.school, grade: nStudentEdit.grade,
      ...sharedFamilyFields,
      notes: nStudentEdit.notes, tuitionNote: nStudentEdit.tuitionNote,
      status: nStudentEdit.status,
      subjectTeachers: nStudentEdit.subjectTeachers.filter(st=>st.subject),
      subjects: nStudentEdit.subjectTeachers.filter(st=>st.subject).map(st=>st.subject),
    };
    setStudents(students.map(s => {
      if (s.id===editingStudentId) return { ...s, ...mainPatch };
      // Keep siblings' contact info (parent name/phone/address) in sync — they share the same family
      if (editedStudent?.familyId && s.familyId===editedStudent.familyId) {
        return { ...s, ...sharedFamilyFields };
      }
      return s;
    }));
    updateRow("students", editingStudentId, mainPatch);
    if (editedStudent?.familyId) {
      students.forEach(s => {
        if (s.familyId===editedStudent.familyId && s.id!==editingStudentId) {
          updateRow("students", s.id, sharedFamilyFields);
        }
      });
    }
    setModal(null); setEditingStudentId(null); setNStudentEdit(null);
    notify(siblingCount>0 ? `Данные ученика обновлены, контакты семьи синхронизированы у ${siblingCount} братьев/сестёр` : "Данные ученика обновлены");
  }
  const [nTutor,    setNTutor]    = useState({ name:"", phone:"", email:"", address:"", notes:"", subjects:[], rateType:"percent", rateValue:50, status:"active", color:"#1da0d4" });
  const [editingTutorId, setEditingTutorId] = useState(null);
  const [editingCatalogId, setEditingCatalogId] = useState(null);
  const [nLesson,   setNLesson]   = useState({ studentId:"", subject:"", tutorId:"", date:"", time:"", duration:60, price:1200 });
  const [lessonType,  setLessonType]  = useState("individual"); // individual | group
  const [groupStudents, setGroupStudents] = useState([]); // [{studentId, price}]
  const [groupName,   setGroupName]   = useState("");
  const [lessonStudentLocked, setLessonStudentLocked] = useState(false); // true when opened from a student's own profile — no need to search for them again
  const [nPayment,  setNPayment]  = useState({ studentId:"", amount:"", method:"card", comment:"" });
  const [nSalary,   setNSalary]   = useState({ tutorId:"", amount:"", comment:"", month:"2026-03" });
  const [mDraft,    setMDraft]    = useState({ title:"", channel:"whatsapp", audience:"all", text:"" });
  const [mStep,     setMStep]     = useState(1);

  // ── AI assistant state ──
  const [aiMessages, setAiMessages] = useState([
    { role: "assistant", content: "Здравствуйте! Я ИИ-помощник центра «ГЕНИЙ». Спросите меня об учениках, расписании, финансах или попросите помочь составить сообщение родителю." },
  ]);
  const [aiInput, setAiInput] = useState("");
  const [aiLoading, setAiLoading] = useState(false);
  const [aiProvider, setAiProvider] = useState("gemini");
  const aiMessagesEndRef = useRef(null);

  useEffect(() => {
    if (view === "ai") aiMessagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [aiMessages, view]);

  // Debounced search for "Запросы от родителей" — waits 350ms after typing stops
  // before actually filtering, so we don't re-filter on every keystroke.
  useEffect(() => {
    setReqSearching(true);
    const t = setTimeout(() => {
      setReqSearch(reqSearchInput);
      setReqSearching(false);
      setReqPage(1); // reset to first page whenever the search changes
    }, 350);
    return () => clearTimeout(t);
  }, [reqSearchInput]);

  // ── Claude agent: tool definitions ──────────────────────────────────────
  // Только безопасные действия — добавление и изменение статуса, без удаления,
  // чтобы чат-агент не мог случайно (или по ошибке модели) стереть данные.
  const AGENT_TOOLS = [
    {
      name: "find_student",
      description: "Найти ученика по имени или телефону (частичное совпадение). Возвращает список найденных с их id, именем, телефоном, предметами и балансом.",
      input_schema: { type: "object", properties: { query: { type: "string", description: "Имя, часть имени или телефон" } }, required: ["query"] },
    },
    {
      name: "find_tutor",
      description: "Найти преподавателя по имени или предмету. Возвращает список найденных с id, именем и предметами.",
      input_schema: { type: "object", properties: { query: { type: "string" } }, required: ["query"] },
    },
    {
      name: "add_student",
      description: "Добавить нового ученика в CRM.",
      input_schema: {
        type: "object",
        properties: {
          name: { type: "string", description: "ФИО ученика" },
          phone: { type: "string", description: "Телефон родителя" },
          parentName: { type: "string" },
          birthDate: { type: "string", description: "Дата рождения в формате YYYY-MM-DD, если известна" },
          subjects: { type: "array", items: { type: "string" }, description: "Список предметов" },
          address: { type: "string" },
        },
        required: ["name", "phone"],
      },
    },
    {
      name: "add_lesson",
      description: "Запланировать индивидуальное занятие для существующего ученика у существующего преподавателя.",
      input_schema: {
        type: "object",
        properties: {
          studentQuery: { type: "string", description: "Имя ученика (или часть имени) — уже существующего в базе" },
          tutorQuery: { type: "string", description: "Имя преподавателя (или часть имени) — уже существующего в базе" },
          subject: { type: "string" },
          date: { type: "string", description: "Дата в формате YYYY-MM-DD" },
          time: { type: "string", description: "Время в формате HH:MM" },
          duration: { type: "number", description: "Длительность в минутах, по умолчанию 60" },
          price: { type: "number", description: "Стоимость занятия в рублях" },
        },
        required: ["studentQuery", "tutorQuery", "subject", "date", "time"],
      },
    },
    {
      name: "record_payment",
      description: "Записать оплату от ученика/родителя.",
      input_schema: {
        type: "object",
        properties: {
          studentQuery: { type: "string" },
          amount: { type: "number" },
          method: { type: "string", enum: ["card", "cash", "transfer"] },
          comment: { type: "string" },
        },
        required: ["studentQuery", "amount"],
      },
    },
    {
      name: "update_student_status",
      description: "Изменить статус ученика (активен/пробный/пауза/неактивен).",
      input_schema: {
        type: "object",
        properties: {
          studentQuery: { type: "string" },
          status: { type: "string", enum: ["active", "trial", "paused", "inactive"] },
        },
        required: ["studentQuery", "status"],
      },
    },
    {
      name: "get_debtors",
      description: "Получить список учеников с отрицательным балансом (должников).",
      input_schema: { type: "object", properties: {} },
    },
    {
      name: "get_schedule_for_date",
      description: "Получить список занятий на конкретную дату.",
      input_schema: { type: "object", properties: { date: { type: "string", description: "YYYY-MM-DD" } }, required: ["date"] },
    },
  ];

  function describeAgentTool(name, input) {
    switch (name) {
      case "find_student": return `Ищу ученика: «${input.query}»`;
      case "find_tutor": return `Ищу преподавателя: «${input.query}»`;
      case "add_student": return `Добавляю ученика: ${input.name}`;
      case "add_lesson": return `Создаю занятие: ${input.subject} для «${input.studentQuery}» у «${input.tutorQuery}», ${input.date} ${input.time}`;
      case "record_payment": return `Записываю оплату: ${input.amount}₽ от «${input.studentQuery}»`;
      case "update_student_status": return `Меняю статус «${input.studentQuery}» на «${statusCfg[input.status]?.label||input.status}»`;
      case "get_debtors": return "Смотрю список должников";
      case "get_schedule_for_date": return `Смотрю расписание на ${input.date}`;
      default: return `Выполняю: ${name}`;
    }
  }

  // Executes one tool call against LIVE local copies of the CRM arrays (so a sequence
  // of tool calls within the same agent turn — e.g. add_student then add_lesson for
  // that same new student — sees each other's effects immediately, before React state
  // has actually re-rendered).
  function executeAgentTool(name, input, localState) {
    const fmtStudent = s => `id=${s.id}, ${s.name}, тел: ${s.phone||"—"}, предметы: ${(s.subjects||[]).join(", ")||"—"}, статус: ${statusCfg[s.status]?.label||s.status}, баланс: ${s.balance}₽`;
    try {
      switch (name) {
        case "find_student": {
          const q = String(input.query||"").toLowerCase();
          const qDigits = String(input.query||"").replace(/\D/g,"");
          const matches = localState.students.filter(s =>
            s.name.toLowerCase().includes(q) ||
            (qDigits && (s.phone||"").replace(/\D/g,"").includes(qDigits)) ||
            (qDigits && (s.parentPhone||"").replace(/\D/g,"").includes(qDigits))
          );
          if (matches.length===0) return "Ученики не найдены.";
          return matches.slice(0,10).map(fmtStudent).join("\n");
        }
        case "find_tutor": {
          const q = String(input.query||"").toLowerCase();
          const matches = localState.tutors.filter(t => t.name.toLowerCase().includes(q) || (t.subjects||[]).some(s=>s.toLowerCase().includes(q)));
          if (matches.length===0) return "Преподаватели не найдены.";
          return matches.map(t=>`id=${t.id}, ${t.short}, предметы: ${(t.subjects||[]).join(", ")}`).join("\n");
        }
        case "add_student": {
          const newStudent = {
            id: Date.now(), name: input.name, phone: input.phone, parentName: input.parentName||"",
            parentPhone: input.phone, birthDate: input.birthDate||"", age: input.birthDate ? (calcAge(input.birthDate)??0) : 0,
            subjects: input.subjects||[], subjectTeachers: (input.subjects||[]).map(s=>({subject:s,tutorId:""})),
            status:"trial", balance:0, totalLessons:0, address: input.address||"", school:"", files:[],
          };
          localState.students = [...localState.students, newStudent];
          setStudents(localState.students);
          insertRow("students", newStudent);
          return `Ученик добавлен: id=${newStudent.id}, ${newStudent.name}`;
        }
        case "add_lesson": {
          const st = localState.students.find(s=>s.name.toLowerCase().includes(String(input.studentQuery||"").toLowerCase()));
          const tu = localState.tutors.find(t=>t.name.toLowerCase().includes(String(input.tutorQuery||"").toLowerCase()));
          if (!st) return `Ошибка: ученик "${input.studentQuery}" не найден. Сначала найдите или создайте его.`;
          if (!tu) return `Ошибка: преподаватель "${input.tutorQuery}" не найден.`;
          const newLesson = {
            id: Date.now(), studentId: st.id, studentName: st.name, subject: input.subject,
            tutorId: tu.id, tutorShort: tu.short, date: input.date, time: input.time||"",
            duration: Number(input.duration)||60, price: Number(input.price)||0, status:"scheduled", isGroup:false,
          };
          localState.lessons = [...localState.lessons, newLesson];
          setLessons(localState.lessons);
          insertRow("lessons", newLesson);
          return `Занятие создано: ${st.name} с ${tu.short}, ${input.subject}, ${input.date} ${input.time}`;
        }
        case "record_payment": {
          const st = localState.students.find(s=>s.name.toLowerCase().includes(String(input.studentQuery||"").toLowerCase()));
          if (!st) return `Ошибка: ученик "${input.studentQuery}" не найден.`;
          const newPayment = { id: Date.now(), studentId: st.id, studentName: st.name, amount: Number(input.amount), date: new Date().toISOString().split("T")[0], method: input.method||"cash", comment: input.comment||"" };
          localState.payments = [...localState.payments, newPayment];
          localState.students = localState.students.map(s=>s.id===st.id?{...s,balance:s.balance+Number(input.amount)}:s);
          setPayments(localState.payments);
          setStudents(localState.students);
          insertRow("payments", newPayment);
          updateRow("students", st.id, { balance: localState.students.find(s=>s.id===st.id).balance });
          return `Оплата записана: ${input.amount}₽ от ${st.name}. Новый баланс: ${localState.students.find(s=>s.id===st.id).balance}₽`;
        }
        case "update_student_status": {
          const st = localState.students.find(s=>s.name.toLowerCase().includes(String(input.studentQuery||"").toLowerCase()));
          if (!st) return `Ошибка: ученик "${input.studentQuery}" не найден.`;
          localState.students = localState.students.map(s=>s.id===st.id?{...s,status:input.status}:s);
          setStudents(localState.students);
          updateRow("students", st.id, { status: input.status });
          return `Статус ученика ${st.name} изменён на "${statusCfg[input.status]?.label||input.status}"`;
        }
        case "get_debtors": {
          const debtors = localState.students.filter(s=>s.balance<0);
          if (debtors.length===0) return "Должников нет.";
          return debtors.map(fmtStudent).join("\n");
        }
        case "get_schedule_for_date": {
          const dayLessons = localState.lessons.filter(l=>l.date===input.date);
          if (dayLessons.length===0) return `На ${input.date} занятий нет.`;
          return dayLessons.map(l=>`${l.time||"—"} — ${l.studentName}, ${l.subject}, преп. ${l.tutorShort}, статус: ${lsnCfg[l.status]?.label||l.status}`).join("\n");
        }
        default:
          return `Неизвестный инструмент: ${name}`;
      }
    } catch (e) {
      return `Ошибка при выполнении: ${e.message}`;
    }
  }

  async function runClaudeAgent(displayHistory, contextSummary) {
    const systemPrompt = `Ты — ИИ-агент CRM образовательного центра "ГЕНИЙ". Ты можешь не только отвечать на вопросы, но и выполнять действия в системе через инструменты: искать учеников/преподавателей, добавлять учеников, создавать занятия, записывать оплаты, менять статус ученика, смотреть должников и расписание.

Правила:
- Прежде чем создать занятие или записать оплату для ученика, сначала найди его через find_student, чтобы убедиться, что он существует и правильно определить его.
- Если ученика или преподавателя не существует и создание не запрошено явно — сообщи об этом пользователю, а не выдумывай.
- Всегда кратко и понятно объясняй пользователю, что ты сделал, в конце.
- Отвечай на русском языке.

${contextSummary}`;

    let claudeMessages = displayHistory.map(m => ({ role: m.role, content: m.content }));
    const localState = { students:[...students], tutors:[...tutors], lessons:[...lessons], payments:[...payments] };
    let iterations = 0;

    while (iterations < 6) {
      iterations++;
      const response = await fetch("/api/ai-proxy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider: "claude",
          messages: [{ role:"system", content:systemPrompt }, ...claudeMessages],
          tools: AGENT_TOOLS,
        }),
      });
      const result = await response.json();
      if (!response.ok) {
        setAiMessages(prev => [...prev, { role:"assistant", content:`⚠️ Ошибка: ${result.error || "не удалось получить ответ от агента"}` }]);
        return;
      }
      const content = result.content || [];
      const textBlocks = content.filter(b=>b.type==="text").map(b=>b.text).join("\n").trim();
      const toolBlocks = content.filter(b=>b.type==="tool_use");

      if (textBlocks) {
        setAiMessages(prev => [...prev, { role:"assistant", content:textBlocks }]);
      }
      if (toolBlocks.length===0) return; // финальный ответ, без вызова инструментов — закончили

      claudeMessages.push({ role:"assistant", content });
      const toolResultBlocks = [];
      for (const tb of toolBlocks) {
        setAiMessages(prev => [...prev, { role:"assistant", content:`🔧 ${describeAgentTool(tb.name, tb.input)}` }]);
        const resultText = executeAgentTool(tb.name, tb.input, localState);
        toolResultBlocks.push({ type:"tool_result", tool_use_id: tb.id, content: resultText });
      }
      claudeMessages.push({ role:"user", content: toolResultBlocks });
    }
    setAiMessages(prev => [...prev, { role:"assistant", content:"⚠️ Слишком много шагов подряд — остановлено для безопасности. Уточните запрос." }]);
  }

  async function sendAiMessage() {
    const text = aiInput.trim();
    if (!text || aiLoading) return;
    const newMessages = [...aiMessages, { role: "user", content: text }];
    setAiMessages(newMessages);
    setAiInput("");
    setAiLoading(true);

    // Give the assistant a compact snapshot of current CRM data for context
    const contextSummary = `Контекст CRM центра "ГЕНИЙ" (для справки, не показывай пользователю сырые данные без необходимости):
- Учеников: ${students.length} (активных: ${students.filter(s=>s.status==="active").length}, должников: ${students.filter(s=>s.balance<0).length})
- Преподавателей: ${tutors.length}
- Занятий запланировано: ${lessons.filter(l=>l.status==="scheduled").length}
- Новых запросов от родителей: ${requests.filter(r=>r.status==="new").length}`;

    try {
      if (aiProvider === "claude") {
        await runClaudeAgent(newMessages, contextSummary);
      } else {
        const response = await fetch("/api/ai-proxy", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            provider: aiProvider,
            messages: [
              { role: "system", content: `Ты — ИИ-помощник CRM образовательного центра "ГЕНИЙ". Помогай администратору центра: отвечай на вопросы об учениках, преподавателях, расписании, финансах, помогай составлять сообщения родителям, объясняй как пользоваться разделами CRM. Отвечай кратко и по делу, на русском языке.\n\n${contextSummary}` },
              ...newMessages.map(m => ({ role: m.role, content: m.content })),
            ],
          }),
        });
        const result = await response.json();
        if (!response.ok) {
          setAiMessages(prev => [...prev, { role: "assistant", content: `⚠️ Ошибка: ${result.error || "не удалось получить ответ от ИИ"}` }]);
        } else {
          const reply = result.choices?.[0]?.message?.content || "Не удалось получить ответ.";
          setAiMessages(prev => [...prev, { role: "assistant", content: reply }]);
        }
      }
    } catch (e) {
      setAiMessages(prev => [...prev, { role: "assistant", content: "⚠️ Не удалось связаться с ИИ-помощником. Проверьте подключение к интернету." }]);
    } finally {
      setAiLoading(false);
    }
  }
  function handleAiKeyDown(e) {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendAiMessage(); }
  }

  const notify = (msg, type = "success") => { setNotif({ msg, type }); setTimeout(() => setNotif(null), 3000); };

  // ── File attachments (Supabase Storage) ──
  const [uploadingFile, setUploadingFile] = useState(false);
  async function uploadAttachment(kind, entityId, file) {
    if (!file) return;
    setUploadingFile(true);
    try {
      const safeName = file.name.replace(/[^a-zA-Z0-9а-яА-Я._-]/g, "_");
      const path = `${kind}/${entityId}/${Date.now()}_${safeName}`;
      const { error: upErr } = await supabase.storage.from("attachments").upload(path, file);
      if (upErr) { notify("Не удалось загрузить файл: " + upErr.message, "error"); setUploadingFile(false); return; }
      const { data: urlData } = supabase.storage.from("attachments").getPublicUrl(path);
      const fileEntry = { name: file.name, url: urlData.publicUrl, path, uploadedAt: new Date().toISOString().split("T")[0] };
      if (kind === "students") {
        const newFiles = [...(students.find(s=>s.id===entityId)?.files||[]), fileEntry];
        setStudents(prev => prev.map(s => s.id===entityId ? { ...s, files: newFiles } : s));
        updateRow("students", entityId, { files: newFiles });
      } else if (kind === "candidates") {
        setCandidates(prev => prev.map(c => c.id===entityId ? { ...c, files: [...(c.files||[]), fileEntry] } : c));
      } else {
        const newFiles = [...(tutors.find(t=>t.id===entityId)?.files||[]), fileEntry];
        setTutors(prev => prev.map(t => t.id===entityId ? { ...t, files: newFiles } : t));
        updateRow("tutors", entityId, { files: newFiles });
      }
      notify("Файл загружен");
    } catch (e) {
      notify("Ошибка загрузки файла", "error");
    }
    setUploadingFile(false);
  }
  async function deleteAttachment(kind, entityId, fileEntry) {
    if (!window.confirm(`Удалить файл «${fileEntry.name}»?`)) return;
    try {
      if (fileEntry.path) await supabase.storage.from("attachments").remove([fileEntry.path]);
    } catch (e) {}
    if (kind === "students") {
      const newFiles = (students.find(s=>s.id===entityId)?.files||[]).filter(f=>f.path!==fileEntry.path);
      setStudents(prev => prev.map(s => s.id===entityId ? { ...s, files:newFiles } : s));
      updateRow("students", entityId, { files: newFiles });
    } else if (kind === "candidates") {
      setCandidates(prev => prev.map(c => c.id===entityId ? { ...c, files:(c.files||[]).filter(f=>f.path!==fileEntry.path) } : c));
    } else {
      const newFiles = (tutors.find(t=>t.id===entityId)?.files||[]).filter(f=>f.path!==fileEntry.path);
      setTutors(prev => prev.map(t => t.id===entityId ? { ...t, files:newFiles } : t));
      updateRow("tutors", entityId, { files: newFiles });
    }
    notify("Файл удалён");
  }


  // ── Excel import ──
  const handleExcelFile = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const XLSX = await import("https://cdn.sheetjs.com/xlsx-0.20.3/package/xlsx.mjs");
    const reader = new FileReader();
    reader.onload = (ev) => {
      const wb = XLSX.read(ev.target.result, { type:"array" });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(ws, { header:1, defval:"" });
      const parsed = parseExcelStudents(rows);
      setImportPreview(parsed);
      setImportModal(true);
    };
    reader.readAsArrayBuffer(file);
    e.target.value = "";
  };

  const confirmImport = () => {
    if (importMode === "replace") {
      setStudents(importPreview);
      replaceTable("students", importPreview);
    } else {
      const normalize = n => n.toLowerCase().trim().replace(/\s+/g," ").replace(/[.,]/g,"");
      const existingNames = students.map(s=>normalize(s.name));
      const newOnes = importPreview.filter(s=>!existingNames.includes(normalize(s.name)));
      setStudents([...students, ...newOnes]);
      insertRows("students", newOnes);
      notify(`Добавлено ${newOnes.length} учеников, пропущено ${importPreview.length-newOnes.length} дублей`);
    }
    setImportModal(false);
    setImportPreview([]);
    if (importMode==="replace") notify(`Загружено ${importPreview.length} учеников`);
  };

  // ── Reset all data ──
  const resetAllData = async () => {
    if (!window.confirm("Сбросить все данные до демо-версии? Это нельзя отменить.")) return;
    setTutors(initialTutors); setStudents(initialStudents); setLessons(initialLessons);
    setPayments(initialPayments); setSalaries(initialSalaryPayouts);
    await Promise.all([
      replaceTable("tutors", initialTutors),
      replaceTable("students", initialStudents),
      replaceTable("lessons", initialLessons),
      replaceTable("payments", initialPayments),
      replaceTable("salaries", initialSalaryPayouts),
    ]);
    notify("Данные сброшены");
  };

  // Removes exact-duplicate lesson records — leftovers from an earlier bug where
  // recurring group series accidentally shared one groupId across every date,
  // which could balloon into hundreds/thousands of duplicate rows and make the
  // whole app (especially the schedule) freeze on load.
  // ── ОБЛАЧНЫЕ РЕЗЕРВНЫЕ КОПИИ ─────────────────────────────────────────
  // Сохраняет полный снимок данных в таблицу backups прямо в Supabase.
  // Ничего скачивать не нужно — копии хранятся в облаке, доступны с
  // любого устройства, восстанавливаются одной кнопкой прямо в CRM.
  const [lastBackup, setLastBackup] = useState(() => localStorage.getItem("lastBackupDate") || null);
  const [backupBusy, setBackupBusy] = useState(false);
  const [backupList, setBackupList] = useState([]);
  const [showBackups, setShowBackups] = useState(false);

  // Автосохранение раз в 24 часа
  useEffect(() => {
    const lastTs = localStorage.getItem("lastBackupTs");
    const hoursSince = lastTs ? (Date.now() - Number(lastTs)) / 3600000 : 999;
    if (hoursSince >= 24) {
      // Делаем тихий автобэкап через 10 секунд после загрузки
      const t = setTimeout(() => saveCloudBackup("Авто"), 10000);
      return () => clearTimeout(t);
    }
  }, []);

  const saveCloudBackup = async (label = "Ручная") => {
    setBackupBusy(true);
    try {
      const [t, s, l, p, sal] = await Promise.all([
        fetchTable("tutors"), fetchTable("students"), fetchTable("lessons"),
        fetchTable("payments"), fetchTable("salaries"),
      ]);
      const data = {
        tutors: t || tutors, students: s || students, lessons: l || lessons,
        payments: p || payments, salaries: sal || salaries,
        mailings, requests, pricing, rules, courseCatalog, candidates,
      };
      const { error } = await supabase.from("backups").insert({
        label: `${label} — ${new Date().toLocaleString("ru-RU")}`,
        students_count: (s || students).length,
        lessons_count: (l || lessons).length,
        data,
      });
      if (error) throw error;
      // Оставляем только последние 30 копий
      const { data: old } = await supabase.from("backups").select("id").order("created_at", { ascending: true });
      if (old && old.length > 30) {
        const toDelete = old.slice(0, old.length - 30).map(r => r.id);
        await supabase.from("backups").delete().in("id", toDelete);
      }
      const today = new Date().toISOString().split("T")[0];
      localStorage.setItem("lastBackupDate", today);
      localStorage.setItem("lastBackupTs", String(Date.now()));
      setLastBackup(today);
      if (label !== "Авто") notify(`Копия сохранена в облако: ${(s||students).length} учеников, ${(l||lessons).length} занятий`);
    } catch (e) {
      notify("Не удалось сохранить копию: " + e.message, "error");
    }
    setBackupBusy(false);
  };

  const loadBackupList = async () => {
    const { data } = await supabase.from("backups").select("id, created_at, label, students_count, lessons_count").order("created_at", { ascending: false }).limit(30);
    setBackupList(data || []);
    setShowBackups(true);
  };

  const restoreCloudBackup = async (backupId, label) => {
    if (!window.confirm(`Восстановить данные из копии:\n«${label}»?\n\nТекущие данные будут заменены.`)) return;
    setBackupBusy(true);
    try {
      const { data: row } = await supabase.from("backups").select("data").eq("id", backupId).single();
      if (!row?.data) throw new Error("Копия не найдена");
      const b = row.data;
      await replaceTable("tutors", b.tutors || []);
      await replaceTable("students", b.students || []);
      await replaceTable("lessons", b.lessons || []);
      await replaceTable("payments", b.payments || []);
      await replaceTable("salaries", b.salaries || []);
      setTutors(b.tutors || []); setStudents(b.students || []);
      setLessons(b.lessons || []); setPayments(b.payments || []);
      setSalaries(b.salaries || []);
      if (b.mailings) setMailings(b.mailings);
      if (b.requests) setRequests(b.requests);
      if (b.pricing) setPricing(b.pricing);
      if (b.rules) setRules(b.rules);
      if (b.courseCatalog) setCourseCatalog(b.courseCatalog);
      if (b.candidates) setCandidates(b.candidates);
      setShowBackups(false);
      notify("Данные восстановлены из облачной копии ✅");
    } catch (e) {
      notify("Ошибка восстановления: " + e.message, "error");
    }
    setBackupBusy(false);
  };

  // Напоминание: если копию не делали больше 7 дней — подсветим кнопку
  const backupOverdue = (() => {
    if (!lastBackup) return true;
    const diff = (Date.now() - new Date(lastBackup).getTime()) / 86400000;
    return diff > 7;
  })();

  // ── КОРЗИНА ─────────────────────────────────────────────────────────
  // Удалённые записи не исчезают навсегда: копия остаётся в браузере на
  // 30 дней, и её можно вернуть одной кнопкой. Защита от случайного клика.
  const [trash, setTrash] = useState(() => {
    try { return JSON.parse(localStorage.getItem("crmTrash") || "[]"); } catch { return []; }
  });
  const saveTrash = (items) => {
    // выкидываем всё старше 30 дней
    const cutoff = Date.now() - 30*86400000;
    const fresh = items.filter(i => i.deletedAt > cutoff);
    setTrash(fresh);
    try { localStorage.setItem("crmTrash", JSON.stringify(fresh)); } catch {}
  };
  const moveToTrash = (table, record, label) => {
    saveTrash([{ id: `${table}-${record.id}-${Date.now()}`, table, record, label, deletedAt: Date.now() }, ...trash]);
  };
  const restoreFromTrash = async (entry) => {
    const ok = await insertRow(entry.table, entry.record);
    if (!ok) { notify("Не удалось восстановить — возможно, запись уже есть", "error"); return; }
    if (entry.table === "tutors") setTutors(prev => [...prev, entry.record]);
    if (entry.table === "students") setStudents(prev => [...prev, entry.record]);
    if (entry.table === "lessons") setLessons(prev => [...prev, entry.record]);
    saveTrash(trash.filter(t => t.id !== entry.id));
    notify(`Восстановлено: ${entry.label}`);
  };

  const cleanupDuplicateLessons = () => {
    const seen = new Map();
    const deduped = [];
    let removed = 0;
    for (const l of lessons) {
      const key = `${l.studentId}|${l.date}|${l.time}|${l.subject}|${l.tutorId}`;
      if (seen.has(key)) { removed++; continue; }
      seen.set(key, true);
      deduped.push(l);
    }
    if (removed === 0) { notify("Дубликатов не найдено — данные уже чистые"); return; }
    if (!window.confirm(`Найдено ${removed} дубликатов занятий (было ${lessons.length}, останется ${deduped.length}). Удалить их?`)) return;
    setLessons(deduped);
    replaceTable("lessons", deduped);
    notify(`Удалено дубликатов: ${removed}. Занятий осталось: ${deduped.length}`);
  };

  const audMap = {
    all: students, active: students.filter(s=>s.status==="active"),
    debtors: students.filter(s=>s.balance<0), zeroblance: students.filter(s=>s.balance===0),
    trial: students.filter(s=>s.status==="trial"), paused: students.filter(s=>s.status==="paused"),
    inactive: students.filter(s=>s.status==="inactive"),
    math: students.filter(s=>s.subjects.includes("Математика")),
    english: students.filter(s=>s.subjects.includes("Английский язык")),
  };

  const tLessons   = id => lessons.filter(l => l.tutorId === id);
  const tCompleted = id => lessons.filter(l => l.tutorId === id && l.status === "completed");
  const tBillable  = id => lessons.filter(l => l.tutorId === id && (l.status === "completed" || l.status === "noshow_burned"));
  const tStudents  = id => {
    const lessonIds = [...new Set(tLessons(id).map(l=>l.studentId))];
    const assignedIds = students.filter(s => (s.subjectTeachers||[]).some(st=>Number(st.tutorId)===id)).map(s=>s.id);
    const allIds = [...new Set([...lessonIds, ...assignedIds])];
    return students.filter(s=>allIds.includes(s.id));
  };
  const tEarned    = id => { const t=tutors.find(x=>x.id===id); return tBillable(id).reduce((s,l)=>s+calcEarning(l,t),0); };
  const tPaid      = id => salaries.filter(p=>p.tutorId===id).reduce((s,p)=>s+p.amount,0);
  const tDebt      = id => tEarned(id) - tPaid(id);

  const addStudent = () => {
    const validChildren = familyForm.children.filter(c=>c.name.trim());
    if (validChildren.length===0 || !familyForm.phone) return;
    const familyId = validChildren.length > 1 ? "fam_"+Date.now() : undefined;
    const newStudents = validChildren.map((c, i) => ({
      id: Date.now()+i,
      name: c.name,
      birthDate: c.birthDate,
      age: calcAge(c.birthDate) ?? 0,
      phone: familyForm.phone,
      extraPhones: familyForm.extraPhones.filter(Boolean),
      parentName: familyForm.parentName,
      parentPhone: familyForm.phone,
      address: familyForm.address,
      notes: familyForm.notes,
      school: c.school,
      grade: c.grade,
      subjectTeachers: c.subjectTeachers.filter(st=>st.subject),
      subjects: c.subjectTeachers.filter(st=>st.subject).map(st=>st.subject),
      status: c.status,
      tuitionNote: c.tuitionNote,
      balance: 0,
      totalLessons: 0,
      familyId,
      files: [],
    }));
    setStudents([...students, ...newStudents]);
    insertRows("students", newStudents);
    setFamilyForm({ parentName:"", phone:"", extraPhones:[], address:"", notes:"", children:[emptyChild()] });
    setModal(null); notify(newStudents.length>1 ? `Добавлено детей: ${newStudents.length} — прикрепите документы в карточке` : "Ученик добавлен — прикрепите документы в его карточке");
    setView("students"); setSelTutor(null); setSelStudent(newStudents[0]);
  };
  const addTutor = () => {
    if (!nTutor.name || !nTutor.phone) return;
    const parts = nTutor.name.trim().split(" ");
    const short = parts[0] + " " + parts.slice(1).map(w=>w[0]+".").join("");
    if (editingTutorId) {
      const patch = { ...nTutor, short, rateValue:Number(nTutor.rateValue) };
      setTutors(tutors.map(t => t.id===editingTutorId ? { ...t, ...patch } : t));
      updateRow("tutors", editingTutorId, patch);
      setNTutor({ name:"", phone:"", email:"", address:"", notes:"", subjects:[], rateType:"percent", rateValue:50, status:"active", color:"#1da0d4" });
      setEditingTutorId(null);
      setModal(null); notify("Данные преподавателя обновлены");
      return;
    }
    const newTutor = { ...nTutor, id:Date.now(), short, rateValue:Number(nTutor.rateValue), files:[] };
    setTutors([...tutors, newTutor]);
    insertRow("tutors", newTutor);
    setNTutor({ name:"", phone:"", email:"", address:"", notes:"", subjects:[], rateType:"percent", rateValue:50, status:"active", color:"#1da0d4" });
    setModal(null); notify("Преподаватель добавлен — прикрепите документы в его карточке");
    setView("tutors"); setSelStudent(null); setTTab("overview"); setSelTutor(newTutor);
  };
  const startEditTutor = (t) => {
    setNTutor({ name:t.name, phone:t.phone, email:t.email||"", address:t.address||"", notes:t.notes||"", subjects:t.subjects||[], rateType:t.rateType, rateValue:t.rateValue, status:t.status, color:t.color });
    setEditingTutorId(t.id);
    setModal("addTutor");
  };

  // ── Candidates (job applicants) ──
  const addCandidate = () => {
    if (!nCandidate.name || !nCandidate.phone) return;
    const newCandidate = { ...nCandidate, id:Date.now(), date:new Date().toISOString().split("T")[0], files:[] };
    setCandidates([newCandidate, ...candidates]);
    setNCandidate({ name:"", phone:"", email:"", subjects:[], notes:"", status:"new" });
    setModal(null); notify("Соискатель добавлен — прикрепите резюме в его карточке");
    setView("candidates"); setSelCandidate(newCandidate);
  };
  const hireCandidate = (c) => {
    if (!window.confirm(`Принять ${c.name} на работу как преподавателя?`)) return;
    const parts = c.name.trim().split(" ");
    const short = parts[0] + " " + parts.slice(1).map(w=>w[0]+".").join("");
    const newTutor = { name:c.name, short, phone:c.phone, address:"", notes:c.notes||"", subjects:c.subjects||[], rateType:"percent", rateValue:50, status:"active", color:COLORS[tutors.length % COLORS.length], id:Date.now(), files:c.files||[] };
    setTutors([...tutors, newTutor]);
    insertRow("tutors", newTutor);
    setCandidates(candidates.map(x=>x.id===c.id?{...x,status:"hired"}:x));
    setSelCandidate(null);
    notify(`${c.name} принят(а) в штат преподавателей!`);
    setView("tutors"); setSelTutor(newTutor); setTTab("overview");
  };

  const addLesson = () => {
    if (!nLesson.studentId || !nLesson.subject || !nLesson.date || !nLesson.tutorId) return;
    const st = students.find(s=>s.id===Number(nLesson.studentId));
    const tu = tutors.find(t=>t.id===Number(nLesson.tutorId));
    setLessons([...lessons, { ...nLesson, id:Date.now(), studentName:st?.name||"", tutorShort:tu?.short||"", price:Number(nLesson.price), duration:Number(nLesson.duration), studentId:Number(nLesson.studentId), tutorId:Number(nLesson.tutorId), status:"scheduled" }]);
    setNLesson({ studentId:"", subject:"", tutorId:"", date:"", time:"", duration:60, price:1200 });
    setModal(null); notify("Занятие добавлено");
  };
  const addPayment = () => {
    if (!nPayment.studentId || !nPayment.amount) return;
    const st = students.find(s=>s.id===Number(nPayment.studentId));
    const newPayment = { ...nPayment, id:Date.now(), studentName:st?.name||"", amount:Number(nPayment.amount), date:new Date().toISOString().split("T")[0] };
    setPayments([...payments, newPayment]);
    insertRow("payments", newPayment);
    const newBalance = st.balance + Number(nPayment.amount);
    setStudents(students.map(s=>s.id===Number(nPayment.studentId)?{...s,balance:newBalance}:s));
    updateRow("students", Number(nPayment.studentId), { balance: newBalance });
    setNPayment({ studentId:"", amount:"", method:"card", comment:"" });
    setModal(null); notify("Платёж записан");
  };
  const addSalary = () => {
    if (!nSalary.tutorId || !nSalary.amount) return;
    const newSalary = { ...nSalary, id:Date.now(), tutorId:Number(nSalary.tutorId), amount:Number(nSalary.amount), date:new Date().toISOString().split("T")[0] };
    setSalaries([...salaries, newSalary]);
    insertRow("salaries", newSalary);
    setNSalary({ tutorId:"", amount:"", comment:"", month:"2026-03" });
    setModal(null); notify("Выплата записана");
  };
  const completeLesson = id => { setLessons(lessons.map(l=>l.id===id?{...l,status:"completed"}:l)); updateRow("lessons", id, { status:"completed" }); notify("Занятие проведено"); };
  const sendMailing = () => {
    const cnt = audMap[mDraft.audience]?.length||0;
    setMailings([{ ...mDraft, id:Date.now(), status:"sent", sentAt:new Date().toISOString().split("T")[0], sentCount:cnt }, ...mailings]);
    setMDraft({ title:"", channel:"whatsapp", audience:"all", text:"" });
    setModal(null); setMStep(1); notify(`Отправлено ${cnt} получателям`);
  };
  const renderText = (text, s) => text.replace(/{{parentName}}/g,s.parentName||"Родитель").replace(/{{studentName}}/g,s.name).replace(/{{balance}}/g,Math.abs(s.balance)+"₽").replace(/{{phone}}/g,s.phone);

  const filteredStudents = students.filter(s => {
    const q = search.toLowerCase();
    const qDigits = search.replace(/\D/g, "");
    const phoneMatch = qDigits.length>0 && [s.phone, s.parentPhone, ...(s.extraPhones||[])].some(p => p && p.replace(/\D/g,"").includes(qDigits));
    return (s.name.toLowerCase().includes(q) || s.subjects.some(x=>x.toLowerCase().includes(q)) || phoneMatch) && (fStatus==="all"||s.status===fStatus);
  });

  const nav = [
    { id:"dashboard", icon:LayoutGrid,    label:"Дашборд"        },
    { id:"tutors",    icon:GraduationCap, label:"Преподаватели"  },
    { id:"students",  icon:Users,         label:"Ученики"        },
    { id:"courses",   icon:BookOpen,      label:"Курсы"          },
    { id:"schedule",  icon:Calendar,      label:"Расписание"     },
    { id:"pricing",   icon:Wallet,        label:"Цены и правила" },
    { id:"payments",  icon:CreditCard,    label:"Финансы"        },
    { id:"reports",   icon:BarChart3,     label:"Отчёты"         },
    { id:"requests",  icon:Inbox,         label:"Запросы родит." },
    { id:"mailings",  icon:Send,          label:"Рассылки"       },
    { id:"candidates",icon:UserPlus,      label:"Соискатели"     },
    { id:"ai",        icon:Sparkles,      label:"ИИ-Помощник"    },
  ];

  const goView = v => { setView(v); setSelTutor(null); setSelStudent(null); setSidebarOpen(false); };

  const totalRevenue = payments.reduce((s,p)=>s+p.amount,0);
  // ── Performance: pre-index all lessons by tutor+date+time so the schedule grid
  // can look up a cell's lessons in O(1) instead of re-scanning the whole lessons
  // array for every one of the ~200 grid cells on every render — this is what was
  // causing the browser to freeze once recurring series pushed lesson counts into
  // the hundreds/thousands. Must be a top-level hook call (not inside a conditional
  // view block) — React requires hooks to run in the same order on every render.
  const lessonsByTutorDateTime = useMemo(() => {
    const idx = {};
    lessons.forEach(l => {
      const key = `${l.tutorId}|${l.date}|${l.time}`;
      (idx[key] ||= []).push(l);
    });
    return idx;
  }, [lessons]);
  const lessonsByDateTime = useMemo(() => {
    const idx = {};
    lessons.forEach(l => {
      const key = `${l.date}|${l.time}`;
      (idx[key] ||= []).push(l);
    });
    return idx;
  }, [lessons]);
  const lessonCountByDate = useMemo(() => {
    const idx = {};
    lessons.forEach(l => { if (l.status!=="cancelled") idx[l.date] = (idx[l.date]||0)+1; });
    return idx;
  }, [lessons]);
  // Derived from the editable course catalog — so adding/removing a course in "Каталог курсов"
  // immediately makes it available in every subject picker across the app (lessons, students,
  // tutors, candidates, requests) instead of only showing in the catalog page itself.
  const catalogGrouped = (() => {
    const map = {};
    courseCatalog.forEach(c => { if (!map[c.category]) map[c.category] = []; if (!map[c.category].includes(c.name)) map[c.category].push(c.name); });
    return Object.entries(map).map(([label, courses]) => ({
      id: label,
      label,
      color: courseCategories.find(cc=>cc.label===label)?.color || "#1da0d4",
      courses,
    }));
  })();
  const selStudentLive = selStudent ? (students.find(x=>x.id===selStudent.id) || selStudent) : null;
  const totalSalPaid = salaries.reduce((s,p)=>s+p.amount,0);

  // ── Система входа по логину и паролю ──────────────────────────────────
  const [currentUser, setCurrentUser] = useState(() => {
    try { const u = sessionStorage.getItem("genius_crm_user"); return u ? JSON.parse(u) : null; } catch { return null; }
  });
  const [loginInput, setLoginInput] = useState("");
  const [passInput, setPassInput] = useState("");
  const [loginError, setLoginError] = useState("");
  const [loginBusy, setLoginBusy] = useState(false);

  const doLogin = async () => {
    if (!loginInput || !passInput) { setLoginError("Введите логин и пароль"); return; }
    setLoginBusy(true); setLoginError("");
    try {
      const { data, error } = await supabase
        .from("users")
        .select("id, login, role, name, tutor_id")
        .eq("login", loginInput.trim().toLowerCase())
        .maybeSingle();
      if (!data) { setLoginError("Неверный логин или пароль"); setLoginBusy(false); return; }
      // Проверяем пароль: сравниваем md5(пароль) через базу
      const { data: ok } = await supabase.rpc("check_password", {
        p_login: loginInput.trim().toLowerCase(),
        p_password: passInput,
      });
      if (!ok) { setLoginError("Неверный логин или пароль"); setLoginBusy(false); return; }
      sessionStorage.setItem("genius_crm_user", JSON.stringify(data));
      setCurrentUser(data);
    } catch (e) {
      setLoginError("Ошибка входа: " + e.message);
    }
    setLoginBusy(false);
  };

  const doLogout = () => {
    sessionStorage.removeItem("genius_crm_user");
    setCurrentUser(null);
    setLoginInput(""); setPassInput("");
  };

  if (!currentUser) {
    return (
      <div style={{ fontFamily:"'Plus Jakarta Sans','Segoe UI',sans-serif", background:"linear-gradient(135deg,#1da0d4,#5cb85c)", minHeight:"100vh", display:"flex", alignItems:"center", justifyContent:"center" }}>
        <div style={{ background:"#ffffff", borderRadius:24, padding:"48px 44px", width:460, boxShadow:"0 24px 64px rgba(18,40,61,.3)", textAlign:"center" }}>
          <img src="/logo.jpg" alt="Гений" style={{ width:96, height:96, borderRadius:"50%", margin:"0 auto 20px", objectFit:"cover" }} />
          <div style={{ fontFamily:"'DM Serif Display',serif", fontSize:30, color:"#12283d", marginBottom:6 }}>Гений CRM</div>
          <div style={{ fontSize:14, color:"#7a8a9c", marginBottom:32 }}>Образовательный центр</div>
          <div style={{ textAlign:"left", marginBottom:16 }}>
            <div style={{ fontSize:14, color:"#55677a", marginBottom:7, fontWeight:600 }}>Логин</div>
            <input autoFocus placeholder="Введите логин" value={loginInput}
              style={{ fontSize:16, padding:"14px 18px" }}
              onChange={e=>{ setLoginInput(e.target.value); setLoginError(""); }}
              onKeyDown={e=>e.key==="Enter" && doLogin()} />
          </div>
          <div style={{ textAlign:"left", marginBottom:loginError?12:28 }}>
            <div style={{ fontSize:14, color:"#55677a", marginBottom:7, fontWeight:600 }}>Пароль</div>
            <input type="password" placeholder="Введите пароль" value={passInput}
              style={{ fontSize:16, padding:"14px 18px" }}
              onChange={e=>{ setPassInput(e.target.value); setLoginError(""); }}
              onKeyDown={e=>e.key==="Enter" && doLogin()} />
          </div>
          {loginError && <div style={{ color:"#e2574c", fontSize:13, marginBottom:16 }}>{loginError}</div>}
          <button className="bp" style={{ width:"100%", fontSize:16, padding:"14px" }} onClick={doLogin} disabled={loginBusy}>
            {loginBusy ? "Вхожу..." : "Войти →"}
          </button>
        </div>
      </div>
    );
  }

  const isAdmin = currentUser.role === "admin";
  const myTutorId = currentUser.tutor_id;


  if (cloudLoading) {
    return (
      <div style={{ fontFamily:"'Plus Jakarta Sans','Segoe UI',sans-serif", background:"#eef3f8", minHeight:"100vh", color:"#22344a", display:"flex", alignItems:"center", justifyContent:"center" }}>
        <div style={{ textAlign:"center" }}>
          <div style={{ fontSize:32, marginBottom:12 }}>☁️</div>
          <div style={{ fontSize:15, color:"#6d7f92" }}>Загрузка данных из облака...</div>
        </div>
      </div>
    );
  }

  // ── RENDER ──────────────────────────────────────────────────────────────────
  return (
    <div style={{ fontFamily:"'Plus Jakarta Sans','Segoe UI',sans-serif", background:"#eef3f8", minHeight:"100vh", color:"#22344a", display:"flex" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&family=DM+Serif+Display&display=swap');
        *{box-sizing:border-box}
        ::-webkit-scrollbar{width:4px}::-webkit-scrollbar-track{background:#e9eef3}::-webkit-scrollbar-thumb{background:#a9b8c6;border-radius:2px}
        .nb{transition:all .2s}.nb:hover{background:rgba(255,255,255,.15)!important;color:#ffffff!important}
        .nb.on{background:rgba(255,255,255,.22)!important;color:#ffffff!important;border-left:3px solid #ffffff!important}
        .card{box-shadow:0 1px 3px rgba(18,40,61,.06),0 1px 2px rgba(18,40,61,.04);transition:transform .18s ease,box-shadow .18s ease}.card:hover{transform:translateY(-3px);box-shadow:0 12px 24px rgba(29,160,212,.12),0 4px 8px rgba(18,40,61,.06)!important}
        .bp{background:linear-gradient(135deg,#1da0d4,#5cb85c);border:none;color:#fff;padding:9px 20px;border-radius:10px;cursor:pointer;font-family:inherit;font-size:14px;font-weight:600;transition:all .2s;box-shadow:0 2px 6px rgba(29,160,212,.25),0 1px 2px rgba(18,40,61,.06)}
        .bp:hover{opacity:.95;transform:translateY(-1px);box-shadow:0 4px 12px rgba(29,160,212,.35),0 2px 4px rgba(18,40,61,.08)}.bp:disabled{opacity:.4;cursor:not-allowed;transform:none;box-shadow:none}
        .bg{background:rgba(29,160,212,.08);border:1px solid rgba(29,160,212,.18);color:#1da0d4;padding:7px 14px;border-radius:8px;cursor:pointer;font-family:inherit;font-size:13px;transition:all .18s;display:inline-flex;align-items:center;gap:6px}
        .bg:hover{background:rgba(29,160,212,.16);transform:translateY(-1px)}
        input,select,textarea{background:#ffffff;border:1px solid #d7e2ee;color:#22344a;padding:9px 12px;border-radius:9px;font-family:inherit;font-size:14px;outline:none;transition:border-color .18s,box-shadow .18s;width:100%}
        input:focus,select:focus,textarea:focus{border-color:#1da0d4;box-shadow:0 0 0 3px rgba(29,160,212,.15)}
        select option{background:#ffffff}
        .ov{position:fixed;inset:0;background:rgba(18,40,61,.5);backdrop-filter:blur(4px);z-index:100;display:flex;align-items:center;justify-content:center}
        .mo{background:#ffffff;border:1px solid #d7e2ee;border-radius:18px;padding:28px;width:500px;max-width:95vw;max-height:90vh;overflow-y:auto;box-shadow:0 24px 48px rgba(18,40,61,.18),0 8px 16px rgba(18,40,61,.08)}
        .rh{transition:background .15s;cursor:pointer}.rh:hover{background:rgba(29,160,212,.05)!important}
        .notif{position:fixed;bottom:24px;right:24px;padding:12px 20px;border-radius:12px;font-size:14px;font-weight:500;z-index:999;animation:si .3s ease}
        @keyframes si{from{transform:translateY(20px);opacity:0}to{transform:translateY(0);opacity:1}}
        @keyframes reqShimmer{0%{background-position:200% 0}100%{background-position:-200% 0}}
        .stab{padding:7px 16px;border-radius:8px;font-size:12px;font-weight:600;cursor:pointer;border:none;font-family:inherit;transition:all .2s}
        .hamburger-btn{display:none}
        .sidebar-overlay{display:none}
        @media (max-width:860px){
          .app-sidebar{position:fixed!important;top:0;left:0;z-index:200;transform:translateX(-100%);transition:transform .25s ease;box-shadow:0 0 40px rgba(0,0,0,.3)}
          .app-sidebar.open{transform:translateX(0)}
          .hamburger-btn{display:flex!important}
          .sidebar-overlay.open{display:block;position:fixed;inset:0;background:rgba(18,40,61,.5);z-index:150}
          .app-main{padding:16px!important}
        }
      `}</style>

      {/* SIDEBAR */}
      {/* Mobile overlay — tap outside sidebar to close it */}
      <div className={`sidebar-overlay ${sidebarOpen ? "open" : ""}`} onClick={()=>setSidebarOpen(false)} />

      <div className={`app-sidebar ${sidebarOpen ? "open" : ""}`} style={{ width:300, background:"linear-gradient(180deg, #1da0d4 0%, #17a6c9 45%, #5cb85c 100%)", borderRight:"1px solid #dbe6f0", padding:"28px 0", display:"flex", flexDirection:"column", flexShrink:0, position:"sticky", top:0, height:"100vh" }}>
        <div style={{ padding:"0 16px 30px", display:"flex", flexDirection:"column", alignItems:"center", textAlign:"center", gap:12 }}>
          <div style={{ position:"relative", width:140, height:140, display:"flex", alignItems:"center", justifyContent:"center" }}>
            {/* Decorative geometric accents around the logo, echoing the brand's diamond/circle motif */}
            <div style={{ position:"absolute", width:20, height:20, background:"#f5a623", borderRadius:5, transform:"rotate(45deg)", top:-2, left:14, boxShadow:"0 2px 6px rgba(18,40,61,.2)" }} />
            <div style={{ position:"absolute", width:16, height:16, background:"#ffffff", borderRadius:"50%", bottom:2, left:-4, boxShadow:"0 2px 6px rgba(18,40,61,.2)" }} />
            <div style={{ position:"absolute", width:22, height:22, background:"#5cb85c", borderRadius:6, transform:"rotate(45deg)", bottom:-4, right:10, boxShadow:"0 2px 6px rgba(18,40,61,.2)" }} />
            <div style={{ position:"absolute", inset:0, borderRadius:"50%", border:"3px solid rgba(255,255,255,0.35)" }} />
            <img src="/logo.jpg" alt="Гений" style={{ width:126, height:126, borderRadius:"50%", boxShadow:"0 6px 20px rgba(18,40,61,.35)", flexShrink:0, position:"relative", zIndex:1 }} />
          </div>
          <div>
            <div style={{ fontFamily:"'DM Serif Display',serif", fontSize:34, fontWeight:400, color:"#ffffff", lineHeight:1.15 }}>Гений</div>
            <div style={{ fontSize:13, color:"rgba(255,255,255,0.9)", marginTop:5, textTransform:"uppercase", letterSpacing:"0.08em", fontWeight:600 }}>Образовательный центр</div>
          </div>
        </div>
        {nav.map(n=>(
          <button key={n.id} className={`nb ${view===n.id?"on":""}`} onClick={()=>goView(n.id)}
            style={{ display:"flex", alignItems:"center", gap:13, padding:"14px 24px", background:"transparent", border:"none", borderLeft:"3px solid transparent", color:"rgba(255,255,255,0.9)", fontSize:17, fontWeight:500, cursor:"pointer", width:"100%", textAlign:"left" }}>
            <n.icon size={21} strokeWidth={2} style={{ flexShrink:0 }} />{n.label}
            {n.id==="requests" && requests.filter(r=>r.status==="new").length>0 && (
              <span style={{ marginLeft:"auto", background:"#e2574c", color:"white", fontSize:11, fontWeight:700, borderRadius:10, padding:"2px 7px" }}>{requests.filter(r=>r.status==="new").length}</span>
            )}
          </button>
        ))}
        <div style={{ marginTop:"auto", padding:16 }}>
          {/* Save / cloud sync indicator */}
          <div style={{ display:"flex", alignItems:"center", gap:6, marginBottom:10, padding:"6px 10px", background:"#ffffff", boxShadow:"0 1px 3px rgba(18,40,61,.15)", borderRadius:8, transition:"all .3s" }}>
            <div style={{ width:7, height:7, borderRadius:"50%", background:(saveIndicator||cloudSyncing)?"#5cb85c":"#a9b8c6", transition:"all .3s", flexShrink:0 }} />
            <span style={{ fontSize:11, color:(saveIndicator||cloudSyncing)?"#5cb85c":"#55677a", fontWeight:600 }}>{cloudSyncing?"Синхронизация...":saveIndicator?"Сохранено ✓":"Облако · синхронизировано"}</span>
          </div>
          {/* Текущий пользователь + выход */}
          <div style={{ background:"rgba(255,255,255,0.12)", borderRadius:10, padding:"8px 12px", marginBottom:8, display:"flex", alignItems:"center", justifyContent:"space-between" }}>
            <div>
              <div style={{ fontSize:11, fontWeight:700, color:"#ffffff" }}>{currentUser.name || currentUser.login}</div>
              <div style={{ fontSize:9, color:"rgba(255,255,255,0.7)" }}>{isAdmin ? "Администратор" : "Преподаватель"}</div>
            </div>
            <button onClick={doLogout} style={{ background:"rgba(255,255,255,0.2)", border:"none", borderRadius:7, color:"#ffffff", fontSize:10, fontWeight:600, cursor:"pointer", padding:"5px 8px", fontFamily:"inherit" }}>Выйти</button>
          </div>
          {/* Import Excel */}
          <button onClick={()=>fileInputRef.current?.click()} style={{ width:"100%", padding:"8px", background:"#ffffff", border:"none", boxShadow:"0 1px 3px rgba(18,40,61,.15)", borderRadius:9, color:"#1da0d4", fontSize:12, fontWeight:700, cursor:"pointer", marginBottom:8, fontFamily:"inherit", display:"flex", alignItems:"center", justifyContent:"center", gap:6 }}>
            <UploadCloud size={14} /> Импорт из Excel
          </button>
          <input ref={fileInputRef} type="file" accept=".xlsx,.xls,.csv" style={{ display:"none" }} onChange={handleExcelFile} />
          <div style={{ background:"#ffffff", boxShadow:"0 1px 3px rgba(18,40,61,.15)", borderRadius:12, padding:12, textAlign:"center" }}>
            <div style={{ fontSize:10, color:"#55677a", fontWeight:600 }}>Должники</div>
            <div style={{ fontSize:20, fontWeight:700, color:"#e2574c" }}>{students.filter(s=>s.balance<0).length}</div>
            <div style={{ fontSize:10, color:"#7a8a9c" }}>учеников</div>
          </div>
          <div style={{ fontSize:10, color:"rgba(255,255,255,0.7)", textAlign:"center", marginTop:8 }}>Занятий в базе: {lessons.length}</div>
          <button onClick={cleanupDuplicateLessons} style={{ width:"100%", marginTop:6, padding:"7px", background:"rgba(255,255,255,0.15)", border:"1px solid rgba(255,255,255,0.3)", borderRadius:8, color:"#ffffff", fontSize:11, fontWeight:600, cursor:"pointer", fontFamily:"inherit" }}>
            🧹 Убрать дубликаты занятий
          </button>

          {/* ── ОБЛАЧНЫЕ РЕЗЕРВНЫЕ КОПИИ ── */}
          <div style={{ marginTop:10, background: backupOverdue ? "rgba(245,166,35,0.25)" : "rgba(255,255,255,0.12)", border:`1px solid ${backupOverdue ? "rgba(245,166,35,0.6)" : "rgba(255,255,255,0.25)"}`, borderRadius:12, padding:10 }}>
            <div style={{ fontSize:11, fontWeight:700, color:"#ffffff", marginBottom:2 }}>🛡️ Резервные копии</div>
            <div style={{ fontSize:9, color:"rgba(255,255,255,0.75)", marginBottom:8, lineHeight:1.4 }}>
              {lastBackup ? `Последняя: ${new Date(lastBackup).toLocaleDateString("ru-RU")}` : "Ещё ни разу не делали"}
              {backupOverdue && " · пора сохранить"}
            </div>
            <button onClick={()=>saveCloudBackup("Ручная")} disabled={backupBusy}
              style={{ width:"100%", padding:"8px", background:"#ffffff", border:"none", borderRadius:8, color:"#1da0d4", fontSize:11, fontWeight:700, cursor:backupBusy?"wait":"pointer", fontFamily:"inherit", marginBottom:5 }}>
              {backupBusy ? "Сохраняю..." : "☁️ Сохранить копию в облако"}
            </button>
            <button onClick={loadBackupList} disabled={backupBusy}
              style={{ width:"100%", padding:"6px", background:"transparent", border:"1px solid rgba(255,255,255,0.4)", borderRadius:8, color:"#ffffff", fontSize:10, cursor:backupBusy?"wait":"pointer", fontFamily:"inherit" }}>
              ↩️ Восстановить из копии
            </button>
          </div>

          {trash.length > 0 && (
            <button onClick={()=>setModal("trash")}
              style={{ width:"100%", marginTop:8, padding:"8px", background:"rgba(255,255,255,0.12)", border:"1px solid rgba(255,255,255,0.25)", borderRadius:10, color:"#ffffff", fontSize:11, fontWeight:600, cursor:"pointer", fontFamily:"inherit" }}>
              🗑️ Корзина ({trash.length}) — вернуть удалённое
            </button>
          )}
        </div>
      </div>

      {/* MAIN */}
      <div className="app-main" style={{ flex:1, padding:32, overflowY:"auto", maxHeight:"100vh" }}>
        <button className="hamburger-btn" onClick={()=>setSidebarOpen(o=>!o)}
          style={{ alignItems:"center", justifyContent:"center", gap:8, marginBottom:16, background:"#ffffff", border:"1px solid #dbe6f0", boxShadow:"0 1px 3px rgba(18,40,61,.05)", borderRadius:10, padding:"10px 16px", cursor:"pointer", fontFamily:"inherit", fontSize:14, fontWeight:600, color:"#1da0d4" }}>
          <LayoutGrid size={16} /> Меню
        </button>

        {/* ── DASHBOARD ── */}
        {view==="dashboard" && (
          <div>
            <div style={{ marginBottom:28 }}>
              <h1 style={{ fontFamily:"'DM Serif Display',serif", fontSize:28, fontWeight:800, color:"#12283d", margin:0 }}>Дашборд</h1>
              <div style={{ color:"#7a8a9c", fontSize:14, marginTop:4 }}>{new Date().toLocaleDateString("ru-RU", { weekday:"long", day:"numeric", month:"long", year:"numeric" })}</div>
            </div>
            <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:16, marginBottom:28 }}>
              {[
                { label:"Активных учеников", value:students.filter(s=>s.status==="active").length, icon:Users, color:"#1da0d4", goTo:"students" },
                { label:"Преподавателей",    value:tutors.filter(t=>t.status==="active").length,   icon:GraduationCap, color:"#5cb85c", goTo:"tutors" },
                { label:"Занятий впереди",   value:lessons.filter(l=>l.status==="scheduled").length,icon:Calendar,color:"#f5a623", goTo:"schedule" },
                { label:`Выручка в ${new Date().toLocaleDateString("ru-RU",{month:"long"})}`, value:`${(payments.filter(p=>p.date.slice(0,7)===new Date().toISOString().slice(0,7)).reduce((s,p)=>s+p.amount,0)/1000).toFixed(1)}к`, icon:Wallet, color:"#d6539a", goTo:"payments" },
              ].map((s,i)=>(
                <div key={i} className="card" onClick={()=>goView(s.goTo)} style={{ background:"#ffffff", border:"1px solid #dbe6f0", boxShadow:"0 1px 3px rgba(18,40,61,.05)", borderRadius:16, padding:20, cursor:"pointer" }}>
                  <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start" }}>
                    <div>
                      <div style={{ fontSize:12, color:"#7a8a9c", marginBottom:8 }}>{s.label}</div>
                      <div style={{ fontSize:30, fontWeight:700, color:s.color, fontFamily:"'DM Serif Display',serif" }}>{s.value}</div>
                    </div>
                    <div style={{ width:44, height:44, borderRadius:12, background:`${s.color}15`, display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>
                      <s.icon size={22} color={s.color} strokeWidth={2} />
                    </div>
                  </div>
                </div>
              ))}
            </div>
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:20 }}>
              <div style={{ background:"#ffffff", border:"1px solid #dbe6f0", boxShadow:"0 1px 3px rgba(18,40,61,.05)", borderRadius:16, padding:22 }}>
                <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:18 }}>
                  <h3 style={{ margin:0, fontSize:15, fontWeight:600 }}>Ближайшие занятия</h3>
                  <button className="bg" style={{ fontSize:11, padding:"4px 10px" }} onClick={()=>goView("schedule")}>Все</button>
                </div>
                {lessons.filter(l=>l.status==="scheduled").slice(0,5).map(l=>(
                  <div key={l.id} style={{ display:"flex", alignItems:"center", gap:12, padding:"10px 0", borderBottom:"1px solid #f2f6fa" }}>
                    <div style={{ width:38, height:38, borderRadius:10, background:"rgba(99,102,241,0.15)", display:"flex", alignItems:"center", justifyContent:"center", fontSize:16, flexShrink:0 }}>📖</div>
                    <div style={{ flex:1, minWidth:0 }}>
                      <div style={{ fontSize:13, fontWeight:600, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{l.studentName}</div>
                      <div style={{ fontSize:11, color:"#7a8a9c" }}>{l.subject} · {l.tutorShort}</div>
                    </div>
                    <div style={{ textAlign:"right", flexShrink:0 }}>
                      <div style={{ fontSize:12, color:"#1da0d4", fontWeight:600 }}>{l.date}</div>
                      <div style={{ fontSize:11, color:"#7a8a9c" }}>{l.time}</div>
                    </div>
                  </div>
                ))}
              </div>
              <div style={{ background:"#ffffff", border:"1px solid #dbe6f0", boxShadow:"0 1px 3px rgba(18,40,61,.05)", borderRadius:16, padding:22 }}>
                <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:18 }}>
                  <h3 style={{ margin:0, fontSize:15, fontWeight:600 }}>💼 Зарплаты к выплате</h3>
                  <button className="bg" style={{ fontSize:11, padding:"4px 10px" }} onClick={()=>goView("tutors")}>Все</button>
                </div>
                {tutors.map(t=>{ const d=tDebt(t.id); if(d<=0) return null; return (
                  <div key={t.id} style={{ display:"flex", alignItems:"center", gap:12, padding:"10px 0", borderBottom:"1px solid #f2f6fa", cursor:"pointer" }} onClick={()=>{ setSelTutor(t); setView("tutors"); }}>
                    <Av name={t.name} color={t.color} size={34} />
                    <div style={{ flex:1 }}>
                      <div style={{ fontSize:13, fontWeight:600 }}>{t.short}</div>
                      <div style={{ fontSize:11, color:"#7a8a9c" }}>{tCompleted(t.id).length} занятий</div>
                    </div>
                    <div style={{ fontSize:15, fontWeight:700, color:"#f5a623" }}>{d.toLocaleString("ru")}₽</div>
                  </div>
                ); })}
                {tutors.every(t=>tDebt(t.id)<=0) && <div style={{ color:"#7a8a9c", fontSize:13, textAlign:"center", padding:"20px 0" }}>🎉 Все выплаты сделаны!</div>}
              </div>
            </div>

            {/* ── MINI CALENDAR ── */}
            {(() => {
              const now = new Date();
              const viewDate = new Date(now.getFullYear(), now.getMonth() + calendarMonthOffset, 1);
              const calMonth = viewDate.getMonth();
              const calYear = viewDate.getFullYear();
              const firstDay = new Date(calYear, calMonth, 1);
              const startOffset = (firstDay.getDay() + 6) % 7; // Monday-first
              const daysInMonth = new Date(calYear, calMonth+1, 0).getDate();
              const lessonsByDay = {};
              lessons.forEach(l => {
                if (l.status==="cancelled") return;
                const d = new Date(l.date);
                if (d.getMonth()===calMonth && d.getFullYear()===calYear) {
                  lessonsByDay[d.getDate()] = (lessonsByDay[d.getDate()]||0)+1;
                }
              });
              const cells = [];
              for (let i=0;i<startOffset;i++) cells.push(null);
              for (let d=1; d<=daysInMonth; d++) cells.push(d);
              const isCurrentMonth = calMonth===now.getMonth() && calYear===now.getFullYear();
              const todayNum = now.getDate();
              return (
                <div style={{ background:"#ffffff", border:"1px solid #dbe6f0", boxShadow:"0 1px 3px rgba(18,40,61,.05)", borderRadius:14, padding:16, marginTop:20, maxWidth:320 }}>
                  <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:10 }}>
                    <button className="bg" style={{ padding:"3px 8px", fontSize:11 }} onClick={()=>setCalendarMonthOffset(o=>o-1)}>‹</button>
                    <h3 style={{ margin:0, fontSize:13, fontWeight:700, display:"flex", alignItems:"center", gap:6, color:"#12283d" }}>
                      <Calendar size={13} color="#1da0d4" /> {viewDate.toLocaleDateString("ru-RU",{month:"long",year:"numeric"})}
                    </h3>
                    <button className="bg" style={{ padding:"3px 8px", fontSize:11 }} onClick={()=>setCalendarMonthOffset(o=>o+1)}>›</button>
                  </div>
                  {calendarMonthOffset!==0 && (
                    <button className="bg" style={{ fontSize:10, padding:"2px 8px", marginBottom:8, display:"block", marginLeft:"auto", marginRight:"auto" }} onClick={()=>setCalendarMonthOffset(0)}>Сегодня</button>
                  )}
                  <div style={{ display:"grid", gridTemplateColumns:"repeat(7,1fr)", gap:2, marginBottom:4 }}>
                    {["Пн","Вт","Ср","Чт","Пт","Сб","Вс"].map(d=>(
                      <div key={d} style={{ textAlign:"center", fontSize:9, color:"#a9b8c6", fontWeight:600 }}>{d}</div>
                    ))}
                  </div>
                  <div style={{ display:"grid", gridTemplateColumns:"repeat(7,1fr)", gap:2 }}>
                    {cells.map((d,i)=>{
                      if (d===null) return <div key={i} />;
                      const isToday = isCurrentMonth && d===todayNum;
                      const count = lessonsByDay[d]||0;
                      return (
                        <div key={i} onClick={()=>goView("schedule")}
                          style={{ aspectRatio:"1", display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", borderRadius:6, cursor:"pointer",
                            background:isToday?"linear-gradient(135deg,#1da0d4,#5cb85c)":count>0?"rgba(29,160,212,0.08)":"transparent",
                            color:isToday?"#ffffff":"#22344a", fontWeight:isToday?700:500, fontSize:11, transition:"background .15s" }}>
                          {d}
                          {count>0 && <div style={{ width:3, height:3, borderRadius:"50%", background:isToday?"#ffffff":"#1da0d4", marginTop:1 }} />}
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })()}
          </div>
        )}

        {/* ── TUTORS LIST ── */}
        {view==="tutors" && !selTutor && (
          <div>
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:24 }}>
              <div>
                <h1 style={{ fontFamily:"'DM Serif Display',serif", fontSize:26, fontWeight:800, color:"#12283d", margin:0 }}>Преподаватели</h1>
                <div style={{ color:"#7a8a9c", fontSize:13, marginTop:4 }}>{tutors.length} в базе</div>
              </div>
              <button className="bp" onClick={()=>setModal("addTutor")}>+ Добавить преподавателя</button>
            </div>
            <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:16 }}>
              {tutors.map(t=>{
                const earned=tEarned(t.id), paid=tPaid(t.id), debt=earned-paid;
                return (
                  <div key={t.id} className="card" style={{ background:"#ffffff", border:"1px solid #dbe6f0", boxShadow:"0 1px 3px rgba(18,40,61,.05)", borderRadius:16, padding:22, cursor:"pointer" }} onClick={()=>{ setSelTutor(t); setTTab("overview"); }}>
                    <div style={{ display:"flex", alignItems:"center", gap:12, marginBottom:16 }}>
                      <Av name={t.name} color={t.color} size={46} />
                      <div>
                        <div style={{ fontSize:14, fontWeight:700 }}>{t.short}</div>
                        <div style={{ fontSize:11, color:"#7a8a9c", marginTop:2 }}>{t.subjects.join(", ")}</div>
                      </div>
                    </div>
                    <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:8, marginBottom:14 }}>
                      {[
                        { l:"Учеников",  v:tStudents(t.id).length,          c:"#1da0d4" },
                        { l:"Занятий",   v:tCompleted(t.id).length,         c:"#5cb85c" },
                        { l:"К выдаче",  v:`${debt.toLocaleString("ru")}₽`, c:debt>0?"#f5a623":"#6d7f92" },
                      ].map((m,i)=>(
                        <div key={i} style={{ background:"#f2f6fa", borderRadius:10, padding:8, textAlign:"center" }}>
                          <div style={{ fontSize:10, color:"#7a8a9c", marginBottom:3 }}>{m.l}</div>
                          <div style={{ fontSize:13, fontWeight:700, color:m.c }}>{m.v}</div>
                        </div>
                      ))}
                    </div>
                    <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center" }}>
                      <div style={{ fontSize:11, color:"#7a8a9c" }}>{t.rateType==="percent"?`${t.rateValue}% от занятия`:`${t.rateValue}₽/занятие`}</div>
                      <Tag c={statusCfg[t.status]?.color} bg={statusCfg[t.status]?.bg}>{statusCfg[t.status]?.label}</Tag>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ── TUTOR PROFILE ── */}
        {view==="tutors" && selTutor && (()=>{
          const t = tutors.find(x=>x.id===selTutor.id)||selTutor;
          const myL=tLessons(t.id), myC=tCompleted(t.id), myBillable=tBillable(t.id), mySt=tStudents(t.id), myPay=salaries.filter(p=>p.tutorId===t.id);
          const earned=tEarned(t.id), paid=tPaid(t.id), debt=earned-paid;
          return (
            <div>
              <button className="bg" style={{ marginBottom:20 }} onClick={()=>setSelTutor(null)}>← Назад</button>
              {/* header card */}
              <div style={{ background:"#ffffff", border:"1px solid #dbe6f0", boxShadow:"0 1px 3px rgba(18,40,61,.05)", borderRadius:18, padding:28, marginBottom:20 }}>
                <div style={{ display:"flex", gap:20, alignItems:"flex-start", marginBottom:22 }}>
                  <Av name={t.name} color={t.color} size={64} />
                  <div style={{ flex:1 }}>
                    <div style={{ fontSize:22, fontWeight:700, color:"#12283d" }}>{t.name}</div>
                    <div style={{ fontSize:16, fontWeight:600, color:"#22344a", marginTop:6, display:"flex", alignItems:"center", gap:6 }}><Phone size={14} color="#1da0d4" /> {t.phone}</div>
                    {t.email && <div style={{ fontSize:14, color:"#55677a", marginTop:4, display:"flex", alignItems:"center", gap:6 }}><Mail size={14} color="#1da0d4" /> {t.email}</div>}
                    {t.address && <div style={{ fontSize:14, color:"#55677a", marginTop:4, display:"flex", alignItems:"center", gap:6 }}><MapPin size={14} color="#1da0d4" /> {t.address}</div>}
                    <div style={{ display:"flex", flexWrap:"wrap", gap:6, marginTop:8 }}>
                      {t.subjects.map(s=><Tag key={s} c="#1da0d4" bg="rgba(99,102,241,0.15)">{s}</Tag>)}
                      <Tag c={statusCfg[t.status]?.color} bg={statusCfg[t.status]?.bg}>{statusCfg[t.status]?.label}</Tag>
                    </div>
                  </div>
                  <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
                    <button className="bp" onClick={()=>{ setNSalary({...nSalary,tutorId:String(t.id)}); setModal("addSalary"); }}>💰 Выплатить зарплату</button>
                    <button className="bg" onClick={()=>printSchedule(myL, tutors, students, `Преподаватель: ${t.short}`)}>🖨️ Расписание преподавателя</button>
                    <button className="bg" onClick={()=>startEditTutor(t)}>✏️ Редактировать</button>
                    <button style={{ background:"rgba(226,87,76,0.08)", border:"1px solid rgba(226,87,76,0.2)", color:"#e2574c", padding:"7px 14px", borderRadius:8, cursor:"pointer", fontSize:13, fontFamily:"inherit", display:"flex", alignItems:"center", gap:6 }}
                      onClick={()=>{ if(window.confirm(`Удалить преподавателя "${t.name}"?\n\nЗанятия и история останутся. Запись попадёт в Корзину — её можно вернуть в течение 30 дней.`)){ moveToTrash("tutors", t, `Преподаватель: ${t.name}`); setTutors(tutors.filter(x=>x.id!==t.id)); deleteRow("tutors", t.id); setSelTutor(null); notify("Преподаватель удалён — можно вернуть из Корзины"); } }}><Trash2 size={13} /> Удалить</button>
                  </div>
                </div>
                <div style={{ display:"grid", gridTemplateColumns:"repeat(5,1fr)", gap:12 }}>
                  {[
                    { l:"Учеников",      v:mySt.length,                     c:"#1da0d4" },
                    { l:"Всего занятий", v:myL.length,                      c:"#6d7f92" },
                    { l:"Проведено",     v:myC.length,                      c:"#5cb85c" },
                    { l:"Заработано",    v:`${earned.toLocaleString("ru")}₽`,c:"#f5a623"},
                    { l:"К выплате",     v:`${debt.toLocaleString("ru")}₽`, c:debt>0?"#e2574c":"#5cb85c" },
                  ].map((m,i)=>(
                    <div key={i} style={{ background:"#f2f6fa", borderRadius:12, padding:14, textAlign:"center" }}>
                      <div style={{ fontSize:11, color:"#7a8a9c", marginBottom:4 }}>{m.l}</div>
                      <div style={{ fontSize:18, fontWeight:700, color:m.c }}>{m.v}</div>
                    </div>
                  ))}
                </div>
                {t.notes && (
                  <div style={{ background:"#f2f6fa", borderRadius:10, padding:"12px 14px", marginTop:16, fontSize:13, color:"#22344a", lineHeight:1.6 }}>
                    <span style={{ fontWeight:700, color:"#12283d" }}>Примечания: </span>{t.notes}
                  </div>
                )}
                <AttachmentsBlock
                  title="Документы преподавателя"
                  files={t.files||[]}
                  uploading={uploadingFile}
                  onUpload={(file)=>uploadAttachment("tutors", t.id, file)}
                  onDelete={(f)=>deleteAttachment("tutors", t.id, f)}
                />
              </div>
              {/* tabs */}
              <div style={{ display:"flex", gap:4, marginBottom:20, background:"#ffffff", border:"1px solid #dbe6f0", boxShadow:"0 1px 3px rgba(18,40,61,.05)", borderRadius:12, padding:6, width:"fit-content" }}>
                {[["overview","📊 Обзор"],["students","👥 Ученики"],["lessons","📚 Занятия"],["salary","💼 Зарплата"]].map(([k,l])=>(
                  <button key={k} className="stab" onClick={()=>setTTab(k)}
                    style={{ background:tTab===k?"rgba(99,102,241,0.25)":"transparent", color:tTab===k?"#1da0d4":"#55677a" }}>{l}</button>
                ))}
              </div>

              {/* TAB overview */}
              {tTab==="overview" && (
                <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:16 }}>
                  <div style={{ background:"#ffffff", border:"1px solid #dbe6f0", boxShadow:"0 1px 3px rgba(18,40,61,.05)", borderRadius:14, padding:20 }}>
                    <h4 style={{ margin:"0 0 14px", fontSize:14, color:"#6d7f92", fontWeight:600 }}>Последние занятия</h4>
                    {myC.length===0 && <div style={{ color:"#7a8a9c", fontSize:13 }}>Нет проведённых занятий</div>}
                    {myC.slice(-5).reverse().map(l=>(
                      <div key={l.id} style={{ display:"flex", gap:10, padding:"9px 0", borderBottom:"1px solid #f2f6fa", alignItems:"center" }}>
                        <div style={{ flex:1 }}>
                          <div style={{ fontSize:13, fontWeight:600 }}>{l.studentName}</div>
                          <div style={{ fontSize:11, color:"#7a8a9c" }}>{l.subject} · {l.date}</div>
                        </div>
                        <div style={{ textAlign:"right" }}>
                          <div style={{ fontSize:13, fontWeight:700 }}>{l.price}₽</div>
                          <div style={{ fontSize:11, color:"#5cb85c" }}>+{calcEarning(l,t)}₽</div>
                        </div>
                      </div>
                    ))}
                  </div>
                  <div style={{ background:"#ffffff", border:"1px solid #dbe6f0", boxShadow:"0 1px 3px rgba(18,40,61,.05)", borderRadius:14, padding:20 }}>
                    <h4 style={{ margin:"0 0 14px", fontSize:14, color:"#6d7f92", fontWeight:600 }}>Ставка оплаты</h4>
                    <div style={{ background:"#f2f6fa", borderRadius:10, padding:14, marginBottom:12 }}>
                      <div style={{ fontSize:12, color:"#55677a", marginBottom:4 }}>Тип</div>
                      <div style={{ fontSize:16, fontWeight:700, color:"#1da0d4" }}>
                        {t.rateType==="percent"?`${t.rateValue}% от стоимости занятия`:`Фиксированно ${t.rateValue}₽ за занятие`}
                      </div>
                    </div>
                    <div style={{ fontSize:12, color:"#55677a", marginBottom:8 }}>Примеры расчёта:</div>
                    {[800,1000,1200,1500,2000].map(price=>(
                      <div key={price} style={{ display:"flex", justifyContent:"space-between", padding:"6px 0", borderBottom:"1px solid #f2f6fa", fontSize:13 }}>
                        <span style={{ color:"#6d7f92" }}>Занятие {price}₽</span>
                        <span style={{ color:"#5cb85c", fontWeight:700 }}>→ {calcEarning({price},t)}₽</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* TAB students */}
              {tTab==="students" && (()=>{
                const activeSt = mySt.filter(s=>s.status!=="inactive");
                const pastSt = mySt.filter(s=>s.status==="inactive");
                const printStudentList = (list, label) => {
                  const w = window.open("","_blank");
                  const rows = list.map(s=>`<tr><td>${s.name}</td><td>${(s.subjects||[]).join(", ")}</td><td>${statusCfg[s.status]?.label||s.status}</td><td>${s.balance}₽</td></tr>`).join("");
                  w.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>${label}</title><style>
                    body{font-family:Arial,sans-serif;padding:20px;color:#111}
                    table{width:100%;border-collapse:collapse;font-size:13px}
                    th{background:#f3f4f6;padding:8px 10px;text-align:left;border-bottom:2px solid #e5e7eb}
                    td{padding:7px 10px;border-bottom:1px solid #e5e7eb}
                    @media print{button{display:none}}
                  </style></head><body>
                    <h2>${label} — ${t.short}</h2>
                    <button onclick="window.print()" style="margin-bottom:14px;padding:8px 20px;background:#1da0d4;color:white;border:none;border-radius:8px;cursor:pointer">🖨️ Распечатать</button>
                    <table><thead><tr><th>Ученик</th><th>Предметы</th><th>Статус</th><th>Баланс</th></tr></thead><tbody>${rows}</tbody></table>
                  </body></html>`);
                  w.document.close();
                };
                const renderTable = (list) => (
                  list.length===0 ? <div style={{ padding:24, textAlign:"center", color:"#7a8a9c", fontSize:13 }}>Нет учеников</div> : (
                    <table style={{ width:"100%", borderCollapse:"collapse" }}>
                      <thead>
                        <tr style={{ borderBottom:"1px solid #dbe6f0" }}>
                          {["Ученик","Телефон родителя","Предметы","Статус","Баланс","Занятий с преп."].map(h=>(
                            <th key={h} style={{ padding:"13px 16px", textAlign:"left", fontSize:11, color:"#7a8a9c", fontWeight:600, textTransform:"uppercase" }}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {list.map(s=>{
                          const cnt = myC.filter(l=>l.studentId===s.id).length;
                          return (
                            <tr key={s.id} className="rh" style={{ borderBottom:"1px solid #f2f6fa" }} onClick={()=>{ setSelStudent(s); goView("students"); }}>
                              <td style={{ padding:"12px 16px" }}>
                                <div style={{ display:"flex", alignItems:"center", gap:10 }}>
                                  <Av name={s.name} color="#1da0d4" size={32} />
                                  <div>
                                    <div style={{ fontSize:13, fontWeight:600 }}>{s.name}</div>
                                    <div style={{ fontSize:11, color:"#7a8a9c" }}>{s.age} лет</div>
                                  </div>
                                </div>
                              </td>
                              <td style={{ padding:"12px 16px" }}>
                                {(s.parentPhone||s.phone) ? (
                                  <a href={`tel:${s.parentPhone||s.phone}`} onClick={e=>e.stopPropagation()} style={{ fontSize:13, color:"#1da0d4", fontWeight:600, textDecoration:"none", display:"flex", alignItems:"center", gap:5 }}>
                                    <Phone size={12} /> {s.parentPhone||s.phone}
                                  </a>
                                ) : <span style={{ fontSize:12, color:"#a9b8c6" }}>—</span>}
                              </td>
                              <td style={{ padding:"12px 16px" }}>{s.subjects.map(sub=><Tag key={sub} c="#1da0d4" bg="rgba(29,160,212,0.12)">{sub}</Tag>)}</td>
                              <td style={{ padding:"12px 16px" }}><Tag c={statusCfg[s.status]?.color} bg={statusCfg[s.status]?.bg}>{statusCfg[s.status]?.label}</Tag></td>
                              <td style={{ padding:"12px 16px", fontWeight:700, color:s.balance>=0?"#5cb85c":"#e2574c" }}>{s.balance}₽</td>
                              <td style={{ padding:"12px 16px", color:"#6d7f92", fontWeight:600 }}>{cnt}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  )
                );
                return (
                  <div style={{ display:"flex", flexDirection:"column", gap:20 }}>
                    <div>
                      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:8 }}>
                        <div style={{ fontSize:13, fontWeight:700, color:"#12283d" }}>✅ Активные ({activeSt.length})</div>
                        <button className="bg" style={{ fontSize:11, padding:"4px 10px" }} onClick={()=>printStudentList(activeSt, "Активные ученики")}>🖨️ Печать</button>
                      </div>
                      <div style={{ background:"#ffffff", border:"1px solid #dbe6f0", boxShadow:"0 1px 3px rgba(18,40,61,.05)", borderRadius:14, overflow:"hidden" }}>{renderTable(activeSt)}</div>
                    </div>
                    <div>
                      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:8 }}>
                        <div style={{ fontSize:13, fontWeight:700, color:"#12283d" }}>🕓 Ранее посещавшие ({pastSt.length})</div>
                        <button className="bg" style={{ fontSize:11, padding:"4px 10px" }} onClick={()=>printStudentList(pastSt, "Ранее посещавшие ученики")}>🖨️ Печать</button>
                      </div>
                      <div style={{ background:"#ffffff", border:"1px solid #dbe6f0", boxShadow:"0 1px 3px rgba(18,40,61,.05)", borderRadius:14, overflow:"hidden" }}>{renderTable(pastSt)}</div>
                    </div>
                  </div>
                );
              })()}

              {/* TAB lessons */}
              {tTab==="lessons" && (
                <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
                  {myL.length===0 && <div style={{ color:"#7a8a9c", padding:"40px", textAlign:"center" }}>Нет занятий</div>}
                  {myL.sort((a,b)=>a.date>b.date?-1:1).map(l=>(
                    <div key={l.id} style={{ background:"#ffffff", border:"1px solid #dbe6f0", boxShadow:"0 1px 3px rgba(18,40,61,.05)", borderRadius:12, padding:"14px 18px", display:"flex", alignItems:"center", gap:12 }}>
                      <div style={{ width:4, height:36, borderRadius:2, background:lsnCfg[l.status]?.color, flexShrink:0 }} />
                      <div style={{ width:70, flexShrink:0 }}>
                        <div style={{ fontSize:13, fontWeight:700 }}>{l.time||"—"}</div>
                        <div style={{ fontSize:11, color:"#7a8a9c" }}>{l.date}</div>
                      </div>
                      <div style={{ flex:1 }}>
                        <div style={{ fontSize:13, fontWeight:600 }}>{l.studentName}</div>
                        <div style={{ fontSize:11, color:"#7a8a9c" }}>{l.subject} · {l.duration} мин</div>
                      </div>
                      <div style={{ textAlign:"right" }}>
                        <div style={{ fontSize:14, fontWeight:700 }}>{l.price}₽</div>
                        <div style={{ fontSize:12, color:"#5cb85c", fontWeight:600 }}>+{calcEarning(l,t)}₽ вам</div>
                      </div>
                      <Tag c={lsnCfg[l.status]?.color} bg={`${lsnCfg[l.status]?.color}22`}>{lsnCfg[l.status]?.label}</Tag>
                      {l.status==="scheduled" && <button className="bg" style={{ fontSize:11, padding:"5px 10px" }} onClick={()=>completeLesson(l.id)}>✓</button>}
                    </div>
                  ))}
                </div>
              )}

              {/* TAB salary */}
              {tTab==="salary" && (
                <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:16 }}>
                  <div>
                    <div style={{ background:"#ffffff", border:"1px solid #dbe6f0", boxShadow:"0 1px 3px rgba(18,40,61,.05)", borderRadius:14, padding:20, marginBottom:16 }}>
                      <h4 style={{ margin:"0 0 14px", fontSize:14, color:"#6d7f92", fontWeight:600 }}>Итого</h4>
                      {[
                        { l:"Заработано всего",  v:`${earned.toLocaleString("ru")}₽`, c:"#f5a623" },
                        { l:"Выплачено всего",   v:`${paid.toLocaleString("ru")}₽`,   c:"#5cb85c" },
                        { l:"Остаток к выплате", v:`${debt.toLocaleString("ru")}₽`,   c:debt>0?"#e2574c":"#5cb85c" },
                      ].map((m,i)=>(
                        <div key={i} style={{ display:"flex", justifyContent:"space-between", padding:"11px 14px", background:"#f2f6fa", borderRadius:10, marginBottom:8 }}>
                          <span style={{ fontSize:13, color:"#6d7f92" }}>{m.l}</span>
                          <span style={{ fontSize:15, fontWeight:700, color:m.c }}>{m.v}</span>
                        </div>
                      ))}
                      <button className="bp" style={{ width:"100%", marginTop:8 }} onClick={()=>{ setNSalary({...nSalary,tutorId:String(t.id)}); setModal("addSalary"); }}>
                        💰 Выплатить зарплату
                      </button>
                    </div>
                    <div style={{ background:"#ffffff", border:"1px solid #dbe6f0", boxShadow:"0 1px 3px rgba(18,40,61,.05)", borderRadius:14, padding:20 }}>
                      <h4 style={{ margin:"0 0 12px", fontSize:14, color:"#6d7f92", fontWeight:600 }}>Детализация по занятиям</h4>
                      {myBillable.map(l=>(
                        <div key={l.id} style={{ display:"flex", justifyContent:"space-between", padding:"7px 0", borderBottom:"1px solid #f2f6fa", fontSize:12 }}>
                          <div>
                            <div style={{ fontWeight:600, color:"#22344a" }}>{l.studentName} · {l.subject}{l.status==="noshow_burned" && <span style={{ color:"#e2574c", fontWeight:600 }}> · сгорело</span>}</div>
                            <div style={{ color:"#7a8a9c" }}>{l.date}</div>
                          </div>
                          <div style={{ textAlign:"right" }}>
                            <div style={{ color:"#6d7f92" }}>{l.price}₽</div>
                            <div style={{ color:"#5cb85c", fontWeight:700 }}>+{calcEarning(l,t)}₽</div>
                          </div>
                        </div>
                      ))}
                      {myBillable.length===0 && <div style={{ color:"#7a8a9c", fontSize:13 }}>Нет оплачиваемых занятий</div>}
                    </div>
                  </div>
                  <div style={{ background:"#ffffff", border:"1px solid #dbe6f0", boxShadow:"0 1px 3px rgba(18,40,61,.05)", borderRadius:14, padding:20 }}>
                    <h4 style={{ margin:"0 0 14px", fontSize:14, color:"#6d7f92", fontWeight:600 }}>История выплат</h4>
                    {myPay.length===0 && <div style={{ color:"#7a8a9c", fontSize:13 }}>Выплат пока нет</div>}
                    {myPay.map(p=>(
                      <div key={p.id} style={{ background:"#f2f6fa", borderRadius:10, padding:"12px 14px", marginBottom:8 }}>
                        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start" }}>
                          <div>
                            <div style={{ fontSize:15, fontWeight:700, color:"#5cb85c" }}>+{p.amount.toLocaleString("ru")}₽</div>
                            <div style={{ fontSize:11, color:"#7a8a9c", marginTop:3 }}>{p.date} · {p.month}</div>
                          </div>
                          <Tag c="#5cb85c" bg="rgba(34,197,94,0.12)">Выплачено</Tag>
                        </div>
                        {p.comment && <div style={{ fontSize:12, color:"#55677a", marginTop:6 }}>{p.comment}</div>}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          );
        })()}

        {/* ── STUDENTS ── */}
        {view==="students" && (
          <div>
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:24 }}>
              <div>
                <h1 style={{ fontFamily:"'DM Serif Display',serif", fontSize:26, fontWeight:800, color:"#12283d", margin:0 }}>Ученики</h1>
                <div style={{ color:"#7a8a9c", fontSize:13, marginTop:4 }}>{students.length} в базе</div>
              </div>
              <button className="bp" onClick={()=>setModal("addStudent")}>+ Добавить ученика</button>
            </div>
            <div style={{ display:"flex", gap:12, marginBottom:20 }}>
              <input placeholder="🔍  Имя, предмет или телефон (даже частично)..." value={search} onChange={e=>setSearch(e.target.value)} style={{ maxWidth:340 }} />
              <select value={fStatus} onChange={e=>setFStatus(e.target.value)} style={{ maxWidth:160 }}>
                <option value="all">Все статусы</option>
                {Object.entries(statusCfg).map(([k,v])=><option key={k} value={k}>{v.label}</option>)}
              </select>
            </div>
            {selStudent ? (
              <div>
                <button className="bg" style={{ marginBottom:20 }} onClick={()=>setSelStudent(null)}>← Назад</button>
                <div style={{ background:"#ffffff", border:"1px solid #dbe6f0", boxShadow:"0 1px 3px rgba(18,40,61,.05)", borderRadius:18, padding:28 }}>
                  <div style={{ display:"flex", gap:20, alignItems:"flex-start", marginBottom:20 }}>
                    <Av name={selStudentLive.name} color="#1da0d4" size={60} />
                    <div style={{ flex:1 }}>
                      <div style={{ fontSize:20, fontWeight:700 }}>{selStudentLive.name}</div>
                      <div style={{ fontSize:13, color:"#7a8a9c", marginTop:4 }}>{selStudentLive.birthDate ? `${calcAge(selStudentLive.birthDate)} лет (${selStudentLive.birthDate})` : (selStudentLive.age ? `${selStudentLive.age} лет` : "")} · {selStudentLive.phone}{selStudentLive.extraPhones?.length>0 ? `, ${selStudentLive.extraPhones.join(", ")}` : ""}</div>
                      <div style={{ fontSize:12, color:"#55677a", marginTop:2 }}>👤 Родитель: {selStudentLive.parentName}{selStudentLive.parentPhone ? ` · ${selStudentLive.parentPhone}` : ""}</div>
                      {selStudentLive.school && <div style={{ fontSize:12, color:"#55677a", marginTop:2 }}>🏫 {selStudentLive.school}{selStudentLive.grade ? ` · ${selStudentLive.grade} класс` : ""}</div>}
                      {selStudentLive.address && <div style={{ fontSize:12, color:"#55677a", marginTop:2 }}>📍 {selStudentLive.address}</div>}
                      {selStudentLive.familyId && students.filter(s=>s.familyId===selStudentLive.familyId && s.id!==selStudentLive.id).length>0 && (
                        <div style={{ fontSize:12, color:"#55677a", marginTop:6 }}>
                          👨‍👩‍👧‍👦 Братья/сёстры в центре: {students.filter(s=>s.familyId===selStudentLive.familyId && s.id!==selStudentLive.id).map((sib,i,arr)=>(
                            <span key={sib.id}>
                              <span style={{ color:"#1da0d4", cursor:"pointer", fontWeight:600 }} onClick={()=>setSelStudent(sib)}>{sib.name}</span>{i<arr.length-1?", ":""}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                    <div style={{ display:"flex", flexDirection:"column", gap:8, alignItems:"flex-end" }}>
                      <Tag c={statusCfg[selStudentLive.status]?.color} bg={statusCfg[selStudentLive.status]?.bg}>{statusCfg[selStudentLive.status]?.label}</Tag>
                      <button className="bp" onClick={()=>{ setNLesson({ studentId:String(selStudentLive.id), subject:selStudentLive.subjects?.[0]||"", tutorId:selStudentLive.subjectTeachers?.[0]?.tutorId||"", date:"", time:"", duration:60, price:1200 }); setLessonType("individual"); setLessonStudentLocked(true); setModal("addLesson"); }}><Calendar size={14} /> Запланировать занятие</button>
                      <button className="bg" onClick={()=>printSchedule(lessons.filter(l=>l.studentId===selStudentLive.id), tutors, students, `Ученик: ${selStudentLive.name}`)}>🖨️ Расписание ученика</button>
                      <button className="bg" onClick={()=>startEditStudent(selStudentLive)}>✏️ Редактировать</button>
                      <button style={{ background:"rgba(226,87,76,0.08)", border:"1px solid rgba(226,87,76,0.2)", color:"#e2574c", padding:"7px 14px", borderRadius:8, cursor:"pointer", fontSize:13, fontFamily:"inherit", display:"flex", alignItems:"center", gap:6 }}
                        onClick={()=>{ if(window.confirm(`Удалить ученика "${selStudentLive.name}"?\n\nЗанятия и история останутся. Запись попадёт в Корзину — её можно вернуть в течение 30 дней.`)){ moveToTrash("students", selStudentLive, `Ученик: ${selStudentLive.name}`); setStudents(students.filter(x=>x.id!==selStudentLive.id)); deleteRow("students", selStudentLive.id); setSelStudent(null); notify("Ученик удалён — можно вернуть из Корзины"); } }}><Trash2 size={13} /> Удалить</button>
                    </div>
                  </div>
                  <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:12, marginBottom:20 }}>
                    {[
                      { l:"Баланс",  v:`${selStudentLive.balance}₽`, c:selStudentLive.balance>=0?"#5cb85c":"#e2574c" },
                      { l:"Занятий", v:selStudentLive.totalLessons,   c:"#1da0d4" },
                      { l:"Предметов",v:selStudentLive.subjects.length,c:"#f5a623"},
                    ].map((m,i)=>(
                      <div key={i} style={{ background:"#f2f6fa", borderRadius:12, padding:14, textAlign:"center" }}>
                        <div style={{ fontSize:11, color:"#7a8a9c", marginBottom:4 }}>{m.l}</div>
                        <div style={{ fontSize:22, fontWeight:700, color:m.c }}>{m.v}</div>
                      </div>
                    ))}
                  </div>
                  <div style={{ marginBottom:16, display:"flex", flexDirection:"column", gap:6 }}>
                    {(selStudentLive.subjectTeachers?.length ? selStudentLive.subjectTeachers : (selStudentLive.subjects||[]).map(s=>({subject:s,tutorId:""}))).map((st,i)=>{
                      const tu = tutors.find(t=>t.id===Number(st.tutorId));
                      return (
                        <div key={i} style={{ display:"flex", alignItems:"center", gap:8 }}>
                          <Tag c="#1da0d4" bg="rgba(29,160,212,0.15)">{st.subject}</Tag>
                          {tu && <span style={{ fontSize:12, color:"#55677a" }}>— {tu.short}</span>}
                        </div>
                      );
                    })}
                  </div>
                  {selStudentLive.tuitionNote && (
                    <div style={{ fontSize:12, color:"#22344a", marginBottom:12 }}><strong>Условия оплаты:</strong> {selStudentLive.tuitionNote}</div>
                  )}
                  {selStudentLive.notes && (
                    <div style={{ background:"#f2f6fa", borderRadius:10, padding:"12px 14px", marginBottom:16, fontSize:13, color:"#22344a", lineHeight:1.6 }}>
                      <span style={{ fontWeight:700, color:"#12283d" }}>Примечания: </span>{selStudentLive.notes}
                    </div>
                  )}
                  <AttachmentsBlock
                    title="Документы ученика (договор, сканы)"
                    files={selStudentLive.files||[]}
                    uploading={uploadingFile}
                    onUpload={(file)=>uploadAttachment("students", selStudentLive.id, file)}
                    onDelete={(f)=>deleteAttachment("students", selStudentLive.id, f)}
                  />
                  <h4 style={{ color:"#6d7f92", fontSize:13, marginBottom:12, fontWeight:600 }}>История занятий</h4>
                  {lessons.filter(l=>l.studentId===selStudentLive.id).map(l=>(
                    <div key={l.id} style={{ display:"flex", alignItems:"center", gap:12, padding:"10px 14px", background:"#f2f6fa", borderRadius:10, marginBottom:8 }}>
                      <div style={{ flex:1 }}>
                        <div style={{ fontSize:13, fontWeight:600 }}>{l.subject}</div>
                        <div style={{ fontSize:11, color:"#7a8a9c" }}>{l.tutorShort} · {l.date} {l.time}</div>
                      </div>
                      <div style={{ fontSize:13, fontWeight:600 }}>{l.price}₽</div>
                      <Tag c={lsnCfg[l.status]?.color} bg={`${lsnCfg[l.status]?.color}22`}>{lsnCfg[l.status]?.label}</Tag>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div style={{ background:"#ffffff", border:"1px solid #dbe6f0", boxShadow:"0 1px 3px rgba(18,40,61,.05)", borderRadius:16, overflow:"hidden" }}>
                <table style={{ width:"100%", borderCollapse:"collapse" }}>
                  <thead>
                    <tr style={{ borderBottom:"1px solid #dbe6f0" }}>
                      {["Ученик","Предметы","Преподаватель","Статус","Баланс",""].map(h=>(
                        <th key={h} style={{ padding:"13px 16px", textAlign:"left", fontSize:11, color:"#7a8a9c", fontWeight:600, textTransform:"uppercase" }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {filteredStudents.map(s=>{
                      const myTutors=[...new Set(lessons.filter(l=>l.studentId===s.id).map(l=>l.tutorShort))];
                      return (
                        <tr key={s.id} className="rh" style={{ borderBottom:"1px solid #f2f6fa" }} onClick={()=>setSelStudent(s)}>
                          <td style={{ padding:"13px 16px" }}>
                            <div style={{ display:"flex", alignItems:"center", gap:10 }}>
                              <Av name={s.name} color="#1da0d4" size={34} />
                              <div>
                                <div style={{ fontSize:13, fontWeight:600 }}>{s.name}</div>
                                <div style={{ fontSize:11, color:"#7a8a9c" }}>{s.age} лет</div>
                              </div>
                            </div>
                          </td>
                          <td style={{ padding:"13px 16px" }}>{s.subjects.slice(0,2).map(sub=><Tag key={sub} c="#1da0d4" bg="rgba(99,102,241,0.12)">{sub}</Tag>)}</td>
                          <td style={{ padding:"13px 16px", fontSize:12, color:"#6d7f92" }}>{myTutors.slice(0,2).join(", ")||"—"}</td>
                          <td style={{ padding:"13px 16px" }}><Tag c={statusCfg[s.status]?.color} bg={statusCfg[s.status]?.bg}>{statusCfg[s.status]?.label}</Tag></td>
                          <td style={{ padding:"13px 16px", fontWeight:700, fontSize:14, color:s.balance>=0?"#5cb85c":"#e2574c" }}>{s.balance}₽</td>
                          <td style={{ padding:"13px 16px" }} onClick={e=>e.stopPropagation()}>
                            <button className="bp" style={{ padding:"5px 12px", fontSize:12, borderRadius:7 }} onClick={()=>{ setNPayment({...nPayment,studentId:String(s.id)}); setModal("addPayment"); }}>Оплата</button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* ── SCHEDULE ── */}
        {view==="schedule" && (()=>{
          const DAYS = ["Пн","Вт","Ср","Чт","Пт","Сб","Вс"];
          const SLOTS = Array.from({length:29},(_,i)=>{ const h=8+Math.floor(i/2); const m=i%2===0?"00":"30"; return `${String(h).padStart(2,"0")}:${m}`; });

          const today = new Date();
          const todayDay = today.getDay() === 0 ? 6 : today.getDay()-1;
          const weekStart = new Date(today);
          weekStart.setDate(today.getDate() - todayDay + weekOffset*7);
          const weekDates = DAYS.map((_,i)=>{ const d=new Date(weekStart); d.setDate(weekStart.getDate()+i); return d; });
          const fmt = d => d.toISOString().split("T")[0];
          const fmtLabel = d => `${d.getDate()} ${["янв","фев","мар","апр","май","июн","июл","авг","сен","окт","ноя","дек"][d.getMonth()]}`;
          const weekLessons = lessons.filter(l=> weekDates.some(d=>fmt(d)===l.date) && (schedTutorFilter==="all" || l.tutorId===Number(schedTutorFilter)));
          const allLessonsFiltered = schedTutorFilter==="all" ? lessons : lessons.filter(l=>l.tutorId===Number(schedTutorFilter));

          const addRecurring = () => {
            if (!nLesson.studentId || !nLesson.subject || !nLesson.date || !nLesson.tutorId) return;
            const st = students.find(s=>s.id===Number(nLesson.studentId));
            const tu = tutors.find(t=>t.id===Number(nLesson.tutorId));
            const base = { studentName:st?.name||"", tutorShort:tu?.short||"", price:Number(nLesson.price), duration:Number(nLesson.duration), studentId:Number(nLesson.studentId), tutorId:Number(nLesson.tutorId), subject:nLesson.subject, time:nLesson.time, status:"scheduled" };
            const newLessons = Array.from({length:recurCount}, (_,i) => {
              const d = new Date(nLesson.date);
              d.setDate(d.getDate() + i * recurInterval);
              return { ...base, id: Date.now() + i, date: fmt(d) };
            });
            setLessons(prev => [...prev, ...newLessons]);
            insertRows("lessons", newLessons);
            setNLesson({ studentId:"", subject:"", tutorId:"", date:"", time:"", duration:60, price:1200 });
            setModal(null); setRecurModal(false);
            notify(`Создано ${recurCount} занятий`);
          };

          const openEditLesson = (l) => {
            if (!l) { setEditLesson(null); return; }
            setEditLesson({...l});
            setEditLessonType(l.isGroup ? "group" : "individual");
            if (l.isGroup && l.groupId) {
              const siblings = lessons.filter(x=>x.groupId===l.groupId);
              setEditGroupRoster(siblings.map(s=>({ studentId:String(s.studentId), price:s.price })));
              setEditGroupName(l.groupName||"");
            } else {
              setEditGroupRoster([{ studentId:String(l.studentId), price:l.price }]);
              setEditGroupName("");
            }
            setEditRecurOn(false); setEditRecurWeekdays([]); setEditRecurEndDate("");
          };
          const closeEditLesson = () => { setEditLesson(null); };

          const saveEdit = () => {
            if (!editLesson) return;
            const tu = tutors.find(t=>t.id===Number(editLesson.tutorId));
            const shared = { subject:editLesson.subject, tutorId:Number(editLesson.tutorId), tutorShort:tu?.short||editLesson.tutorShort, date:editLesson.date, time:editLesson.time, duration:Number(editLesson.duration), status:editLesson.status };

            // Compute list of extra recurring dates (excluding the original date itself)
            const getExtraRecurDates = () => {
              if (!editRecurOn || !editRecurEndDate || editRecurWeekdays.length===0) return [];
              const dates = [];
              const start = new Date(editLesson.date), end = new Date(editRecurEndDate);
              for (let d=new Date(start); d<=end; d.setDate(d.getDate()+1)) {
                const wd = (d.getDay()+6)%7;
                const ds = d.toISOString().split("T")[0];
                if (editRecurWeekdays.includes(wd) && ds!==editLesson.date) dates.push(ds);
              }
              return dates;
            };
            const extraDates = getExtraRecurDates();

            if (editLessonType==="group") {
              const validRoster = editGroupRoster.filter(r=>r.studentId);
              if (validRoster.length===0) { notify("Добавьте хотя бы одного ученика в группу", "error"); return; }
              const groupId = editLesson.groupId || Date.now();
              const name = editGroupName || `Группа ${editLesson.subject} ${editLesson.time}`;
              // Remove old records for this group (if any) and the original individual record
              const oldIds = editLesson.groupId ? lessons.filter(l=>l.groupId===editLesson.groupId).map(l=>l.id) : [editLesson.id];
              let base = lessons.filter(l => (editLesson.groupId ? l.groupId!==editLesson.groupId : true) && l.id!==editLesson.id);
              const mainRows = validRoster.map((r,i)=>{
                const st = students.find(s=>s.id===Number(r.studentId));
                return { ...shared, id:groupId+i, studentId:Number(r.studentId), studentName:st?.name||"", price:Number(r.price||0), isGroup:true, groupId, groupName:name };
              });
              const extraRows = [];
              extraDates.forEach((dateStr,di)=>{
                const gid = groupId + (di+1)*1000;
                validRoster.forEach((r,i)=>{
                  const st = students.find(s=>s.id===Number(r.studentId));
                  extraRows.push({ ...shared, id:gid+i, date:dateStr, studentId:Number(r.studentId), studentName:st?.name||"", price:Number(r.price||0), isGroup:true, groupId:gid, groupName:name });
                });
              });
              let all = [...base, ...mainRows, ...extraRows];
              setLessons(all);
              deleteRows("lessons", oldIds).then(() => insertRows("lessons", [...mainRows, ...extraRows]));
            } else {
              const st = students.find(s=>s.id===Number(editLesson.studentId));
              const updated = { ...shared, id:editLesson.id, studentId:Number(editLesson.studentId), studentName:st?.name||editLesson.studentName, price:Number(editLesson.price), isGroup:false };
              const extraRows = extraDates.map((dateStr,di)=>({ ...updated, id:Date.now()+di+1, date:dateStr }));
              let base = lessons.filter(l => l.id!==editLesson.id);
              let all = [...base, updated, ...extraRows];
              setLessons(all);
              updateRow("lessons", editLesson.id, shared).then(() => insertRows("lessons", extraRows));
            }
            const totalCreated = 1 + extraDates.length;
            setEditLesson(null);
            notify(extraDates.length>0 ? `Занятие обновлено, создано ещё ${extraDates.length} по расписанию` : "Занятие обновлено");
          };
          const deleteLesson = id => {
            setLessons(lessons.filter(l=>l.id!==id));
            deleteRow("lessons", id);
            setEditLesson(null);
            notify("Занятие удалено");
          };
          const deleteGroup = groupId => {
            const groupLessonIds = lessons.filter(l=>l.groupId===groupId).map(l=>l.id);
            if (!window.confirm(`Удалить всю группу целиком (${groupLessonIds.length} записей)?`)) return;
            setLessons(lessons.filter(l=>l.groupId!==groupId));
            deleteRows("lessons", groupLessonIds);
            setEditLesson(null);
            notify("Группа удалена");
          };

          return (
            <div>
              {/* Header */}
              <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:20 }}>
                <div>
                  <h1 style={{ fontFamily:"'DM Serif Display',serif", fontSize:26, fontWeight:800, color:"#12283d", margin:0 }}>Расписание</h1>
                  <div style={{ color:"#7a8a9c", fontSize:13, marginTop:4 }}>{fmtLabel(weekDates[0])} — {fmtLabel(weekDates[6])} 2026</div>
                </div>
                <div style={{ display:"flex", gap:10, alignItems:"center" }}>
                  <div style={{ display:"flex", gap:4, background:"#ffffff", border:"1px solid #dbe6f0", boxShadow:"0 1px 3px rgba(18,40,61,.05)", borderRadius:10, padding:4 }}>
                    <button className="bg" style={{ padding:"5px 12px" }} onClick={()=>setWeekOffset(w=>w-1)}>‹</button>
                    <button className="bg" style={{ padding:"5px 12px", fontSize:12 }} onClick={()=>setWeekOffset(0)}>Сегодня</button>
                    <button className="bg" style={{ padding:"5px 12px" }} onClick={()=>setWeekOffset(w=>w+1)}>›</button>
                  </div>
                  <div style={{ display:"flex", gap:4, background:"#ffffff", border:"1px solid #dbe6f0", boxShadow:"0 1px 3px rgba(18,40,61,.05)", borderRadius:10, padding:4 }}>
                    {[["week",Calendar,"Неделя"],["tutors",Users,"По педагогам"],["list",BookOpen,"Список"]].map(([k,Ic,l])=>(
                      <button key={k} className="stab" onClick={()=>setSchedView(k)}
                        style={{ background:schedView===k?"rgba(29,160,212,0.15)":"transparent", color:schedView===k?"#1da0d4":"#55677a", display:"flex", alignItems:"center", gap:6, fontSize:14 }}><Ic size={15} />{l}</button>
                    ))}
                  </div>
                  <button className="bp" onClick={()=>{ setLessonStudentLocked(false); setModal("addLesson"); }} style={{ fontSize:14, display:"flex", alignItems:"center", gap:6 }}><Plus size={15} /> Добавить занятие</button>
                  <button className="bg" style={{ fontSize:14 }} onClick={()=>printSchedule(allLessonsFiltered, tutors, students, `${fmtLabel(weekDates[0])} — ${fmtLabel(weekDates[6])}`)}><Printer size={14} /> Печать</button>
                </div>
              </div>

              {/* Tutor filter */}
              <div style={{ display:"flex", gap:8, marginBottom:16, flexWrap:"wrap" }}>
                <button onClick={()=>setSchedTutorFilter("all")}
                  style={{ padding:"5px 14px", borderRadius:20, fontSize:12, fontWeight:600, border:"1px solid", cursor:"pointer", transition:"all .15s",
                    background:schedTutorFilter==="all"?"rgba(99,102,241,0.2)":"transparent",
                    borderColor:schedTutorFilter==="all"?"#1da0d4":"#d7e2ee",
                    color:schedTutorFilter==="all"?"#1da0d4":"#55677a" }}>Все преподаватели</button>
                {tutors.map(t=>(
                  <button key={t.id} onClick={()=>setSchedTutorFilter(String(t.id))}
                    style={{ padding:"5px 14px", borderRadius:20, fontSize:12, fontWeight:600, border:"1px solid", cursor:"pointer", display:"flex", alignItems:"center", gap:6, transition:"all .15s",
                      background:schedTutorFilter===String(t.id)?`${t.color}22`:"transparent",
                      borderColor:schedTutorFilter===String(t.id)?t.color:"#d7e2ee",
                      color:schedTutorFilter===String(t.id)?t.color:"#55677a" }}>
                    <div style={{ width:8, height:8, borderRadius:"50%", background:t.color }} />{t.short}
                  </button>
                ))}
              </div>

              {/* Edit lesson — popup modal */}
              {editLesson && (
                <div className="ov" onClick={closeEditLesson}>
                  <div className="mo" style={{ width:680, maxHeight:"92vh", overflowY:"auto" }} onClick={e=>e.stopPropagation()}>
                    <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:18 }}>
                      <div style={{ fontSize:19, fontWeight:700, color:"#12283d", display:"flex", alignItems:"center", gap:8 }}><Pencil size={18} color="#1da0d4" /> Редактирование занятия</div>
                      <button onClick={closeEditLesson} style={{ background:"transparent", border:"none", cursor:"pointer", color:"#7a8a9c", display:"flex" }}><X size={20} /></button>
                    </div>

                    {/* TYPE SWITCHER */}
                    <div style={{ display:"flex", gap:0, marginBottom:16, background:"#f2f6fa", borderRadius:12, padding:4 }}>
                      {[["individual","Индивидуальное"],["group","Групповое"]].map(([k,l])=>(
                        <button key={k} onClick={()=>setEditLessonType(k)}
                          style={{ flex:1, padding:"9px", borderRadius:9, fontSize:13, fontWeight:700, border:"none", cursor:"pointer", fontFamily:"inherit", transition:"all .2s",
                            background:editLessonType===k?"linear-gradient(135deg,#1da0d4,#5cb85c)":"transparent",
                            color:editLessonType===k?"white":"#55677a" }}>{l}</button>
                      ))}
                    </div>

                    <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:14 }}>
                      <div><div style={{ fontSize:13, color:"#55677a", marginBottom:6, fontWeight:600 }}>Преподаватель</div>
                        <select value={editLesson.tutorId} onChange={e=>{ const t=tutors.find(x=>x.id===Number(e.target.value)); setEditLesson({...editLesson,tutorId:Number(e.target.value),tutorShort:t?.short||""}); }}>
                          {tutors.map(t=><option key={t.id} value={t.id}>{t.name}</option>)}
                        </select>
                      </div>
                      <div><div style={{ fontSize:13, color:"#55677a", marginBottom:6, fontWeight:600 }}>Предмет</div>
                        <select value={editLesson.subject} onChange={e=>setEditLesson({...editLesson,subject:e.target.value})}>
                          {catalogGrouped.map(cat=>(
                            <optgroup key={cat.id} label={cat.label}>
                              {cat.courses.map(c=><option key={c} value={c}>{c}</option>)}
                            </optgroup>
                          ))}
                        </select>
                      </div>

                      {editLessonType==="individual" ? (
                        <>
                          <div style={{ gridColumn:"1/-1" }}><div style={{ fontSize:13, color:"#55677a", marginBottom:6, fontWeight:600 }}>Ученик</div>
                            <select value={editLesson.studentId} onChange={e=>{ const s=students.find(x=>x.id===Number(e.target.value)); setEditLesson({...editLesson,studentId:Number(e.target.value),studentName:s?.name||""}); }}>
                              {students.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}
                            </select>
                            {(()=>{
                              const st = students.find(s=>s.id===Number(editLesson.studentId));
                              if (!st || (!st.parentPhone && !st.phone)) return null;
                              return (
                                <div style={{ marginTop:6, fontSize:12, color:"#55677a", display:"flex", alignItems:"center", gap:6 }}>
                                  <Phone size={12} color="#1da0d4" />
                                  {st.parentName ? `${st.parentName}: ` : "Родитель: "}
                                  <a href={`tel:${st.parentPhone||st.phone}`} style={{ color:"#1da0d4", fontWeight:600, textDecoration:"none" }}>{st.parentPhone||st.phone}</a>
                                </div>
                              );
                            })()}
                          </div>
                          <div><div style={{ fontSize:13, color:"#55677a", marginBottom:6, fontWeight:600 }}>Стоимость (₽)</div>
                            <input type="number" value={editLesson.price} onChange={e=>setEditLesson({...editLesson,price:Number(e.target.value)})} />
                          </div>
                        </>
                      ) : (
                        <div style={{ gridColumn:"1/-1" }}>
                          <div style={{ fontSize:13, color:"#55677a", marginBottom:6, fontWeight:600 }}>Название группы</div>
                          <input placeholder="напр. Группа ОГЭ Пн" value={editGroupName} onChange={e=>setEditGroupName(e.target.value)} style={{ marginBottom:10 }} />
                          <div style={{ fontSize:13, color:"#55677a", marginBottom:6, fontWeight:600 }}>Ученики группы ({editGroupRoster.filter(r=>r.studentId).length})</div>
                          {editGroupRoster.map((gs,i)=>{
                            const st = students.find(s=>s.id===Number(gs.studentId));
                            return (
                              <div key={i} style={{ background:"#f2f6fa", borderRadius:9, marginBottom:6, border:"1px solid #d7e2ee", padding:"7px 10px" }}>
                                <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                                  <select value={gs.studentId} onChange={e=>{ const arr=[...editGroupRoster]; arr[i]={...arr[i],studentId:e.target.value}; setEditGroupRoster(arr); }} style={{ flex:1 }}>
                                    <option value="">Выберите ученика...</option>
                                    {students.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}
                                  </select>
                                  <input type="number" value={gs.price} placeholder="Цена" onChange={e=>{ const arr=[...editGroupRoster]; arr[i]={...arr[i],price:e.target.value}; setEditGroupRoster(arr); }} style={{ width:90, fontSize:12, padding:"4px 8px" }} />
                                  <button onClick={()=>setEditGroupRoster(editGroupRoster.filter((_,j)=>j!==i))} style={{ background:"rgba(226,87,76,0.1)", border:"1px solid rgba(226,87,76,0.2)", color:"#e2574c", padding:"3px 8px", borderRadius:6, cursor:"pointer", fontFamily:"inherit" }}><X size={13} /></button>
                                </div>
                                {st && (st.parentPhone || st.phone) && (
                                  <div style={{ marginTop:6, fontSize:11, color:"#55677a", display:"flex", alignItems:"center", gap:5 }}>
                                    <Phone size={11} color="#1da0d4" />
                                    {st.parentName ? `${st.parentName}: ` : "Родитель: "}
                                    <a href={`tel:${st.parentPhone||st.phone}`} style={{ color:"#1da0d4", fontWeight:600, textDecoration:"none" }}>{st.parentPhone||st.phone}</a>
                                  </div>
                                )}
                              </div>
                            );
                          })}
                          <button className="bg" style={{ fontSize:12 }} onClick={()=>setEditGroupRoster([...editGroupRoster,{studentId:"",price:""}])}><Plus size={13} /> Добавить ученика</button>
                        </div>
                      )}

                      <div><div style={{ fontSize:13, color:"#55677a", marginBottom:6, fontWeight:600 }}>Статус</div>
                        <select value={editLesson.status} onChange={e=>setEditLesson({...editLesson,status:e.target.value})}>
                          {Object.entries(lsnCfg).map(([k,v])=><option key={k} value={k}>{v.label}</option>)}
                        </select>
                      </div>
                      <div><div style={{ fontSize:13, color:"#55677a", marginBottom:6, fontWeight:600 }}>Дата</div>
                        <input type="date" value={editLesson.date} onChange={e=>setEditLesson({...editLesson,date:e.target.value})} />
                      </div>
                      <div><div style={{ fontSize:13, color:"#55677a", marginBottom:6, fontWeight:600 }}>Время</div>
                        <input type="time" value={editLesson.time} onChange={e=>setEditLesson({...editLesson,time:e.target.value})} />
                      </div>
                      <div><div style={{ fontSize:13, color:"#55677a", marginBottom:6, fontWeight:600 }}>Длительность (мин)</div>
                        <input type="number" value={editLesson.duration} onChange={e=>setEditLesson({...editLesson,duration:Number(e.target.value)})} />
                      </div>
                    </div>

                    {/* RECURRING / PIN SCHEDULE */}
                    <div style={{ background:"#f2f6fa", borderRadius:12, padding:"14px 16px", marginTop:16 }}>
                      <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between" }}>
                        <div style={{ fontSize:14, fontWeight:700, color:"#12283d", display:"flex", alignItems:"center", gap:6 }}><Calendar size={15} color="#1da0d4" /> Закрепить расписание</div>
                        <div onClick={()=>setEditRecurOn(r=>!r)} style={{ width:40, height:22, borderRadius:11, background:editRecurOn?"#1da0d4":"#d7e2ee", cursor:"pointer", transition:"all .2s", position:"relative", flexShrink:0 }}>
                          <div style={{ position:"absolute", top:3, left:editRecurOn?20:3, width:16, height:16, borderRadius:"50%", background:"white", transition:"all .2s" }} />
                        </div>
                      </div>
                      {editRecurOn && (
                        <div style={{ marginTop:12, display:"grid", gap:10 }}>
                          <div>
                            <div style={{ fontSize:12, color:"#55677a", marginBottom:5 }}>Дни недели</div>
                            <div style={{ display:"flex", gap:5, flexWrap:"wrap" }}>
                              {["Пн","Вт","Ср","Чт","Пт","Сб","Вс"].map((d,idx)=>(
                                <button key={idx} onClick={()=>setEditRecurWeekdays(prev=>prev.includes(idx)?prev.filter(x=>x!==idx):[...prev,idx])}
                                  style={{ width:38, padding:"6px 0", borderRadius:7, fontSize:12, border:"1px solid", cursor:"pointer", fontFamily:"inherit", fontWeight:600,
                                    background:editRecurWeekdays.includes(idx)?"#1da0d4":"transparent",
                                    borderColor:editRecurWeekdays.includes(idx)?"#1da0d4":"#d7e2ee",
                                    color:editRecurWeekdays.includes(idx)?"#ffffff":"#55677a" }}>{d}</button>
                              ))}
                            </div>
                            <div style={{ fontSize:10, color:"#a9b8c6", marginTop:4 }}>Например Вт и Чт — начиная с даты этого занятия, на каждый такой день в периоде ниже</div>
                          </div>
                          <div>
                            <div style={{ fontSize:12, color:"#55677a", marginBottom:5 }}>Период — до какой даты</div>
                            <div style={{ display:"flex", gap:5, flexWrap:"wrap", marginBottom:6 }}>
                              {[["Неделя",7],["2 недели",14],["1 месяц",30],["2 месяца",60],["3 месяца",90],["Год",365]].map(([label,days])=>(
                                <button key={days} onClick={()=>{
                                  if (!editLesson.date) return;
                                  const d = new Date(editLesson.date); d.setDate(d.getDate()+days);
                                  setEditRecurEndDate(d.toISOString().split("T")[0]);
                                }}
                                  style={{ padding:"4px 10px", borderRadius:7, fontSize:12, border:"1px solid #d7e2ee", cursor:"pointer", fontFamily:"inherit", background:"transparent", color:"#55677a" }}>{label}</button>
                              ))}
                            </div>
                            <input type="date" value={editRecurEndDate} onChange={e=>setEditRecurEndDate(e.target.value)} />
                          </div>
                          {editLesson.date && editRecurEndDate && editRecurWeekdays.length>0 && (()=>{
                            const start = new Date(editLesson.date), end = new Date(editRecurEndDate);
                            let cnt = 0;
                            for (let d=new Date(start); d<=end; d.setDate(d.getDate()+1)) {
                              const wd = (d.getDay()+6)%7;
                              if (editRecurWeekdays.includes(wd) && d.toISOString().split("T")[0]!==editLesson.date) cnt++;
                            }
                            return (
                              <div style={{ background:"rgba(29,160,212,0.08)", borderRadius:8, padding:"8px 12px", fontSize:11, color:"#1da0d4" }}>
                                Будет дополнительно создано занятий: {cnt}
                              </div>
                            );
                          })()}
                        </div>
                      )}
                    </div>

                    <div style={{ display:"flex", gap:10, marginTop:20, flexWrap:"wrap" }}>
                      <button className="bp" style={{ flex:1 }} onClick={saveEdit}>Сохранить</button>
                      <button style={{ background:"rgba(226,87,76,0.08)", border:"1px solid rgba(226,87,76,0.2)", color:"#e2574c", padding:"10px 18px", borderRadius:10, cursor:"pointer", fontSize:14, fontFamily:"inherit", display:"flex", alignItems:"center", gap:6 }} onClick={()=>deleteLesson(editLesson.id)}><Trash2 size={15} /> Удалить</button>
                      {editLesson.isGroup && editLesson.groupId && (
                        <button style={{ background:"rgba(226,87,76,0.15)", border:"1px solid rgba(226,87,76,0.4)", color:"#e2574c", padding:"10px 18px", borderRadius:10, cursor:"pointer", fontSize:14, fontFamily:"inherit", fontWeight:700, display:"flex", alignItems:"center", gap:6 }} onClick={()=>deleteGroup(editLesson.groupId)}><Trash2 size={15} /> Удалить группу</button>
                      )}
                      <button className="bg" onClick={closeEditLesson}>Отмена</button>
                    </div>
                  </div>
                </div>
              )}

              {/* WEEK GRID */}
              {schedView==="week" && (
                <div style={{ background:"#ffffff", border:"1px solid #dbe6f0", boxShadow:"0 1px 3px rgba(18,40,61,.05)", borderRadius:16, overflow:"hidden" }}>
                  <div style={{ display:"grid", gridTemplateColumns:"52px repeat(7,1fr)", borderBottom:"1px solid #dbe6f0" }}>
                    <div style={{ background:"#1b6f8c" }} />
                    {weekDates.map((d,i)=>{
                      const isToday = fmt(d)===fmt(today);
                      const dayCount = weekLessons.filter(l=>l.date===fmt(d)).length;
                      return (
                        <div key={i} style={{ padding:"12px 6px", textAlign:"center", background:"#1b6f8c", borderLeft:"1px solid #dbe6f0" }}>
                          <div style={{ fontSize:11, color:"#7a8a9c", marginBottom:3 }}>{DAYS[i]}</div>
                          <div style={{ fontSize:17, fontWeight:700, color:isToday?"#1da0d4":"#22344a", background:isToday?"rgba(99,102,241,0.18)":"transparent", borderRadius:8, padding:"2px 6px", display:"inline-block" }}>{d.getDate()}</div>
                          {dayCount>0 && <div style={{ fontSize:10, color:"#1da0d4", marginTop:2, fontWeight:600 }}>{dayCount} занят.</div>}
                        </div>
                      );
                    })}
                  </div>
                  <div style={{ overflowY:"auto", maxHeight:"58vh" }}>
                    {SLOTS.map(slot=>(
                      <div key={slot} style={{ display:"grid", gridTemplateColumns:"52px repeat(7,1fr)", borderBottom: slot.endsWith(":30") ? "1px dashed #f2f6fa" : "1px solid #dbe6f0", minHeight:26 }}>
                        <div style={{ padding:"3px 6px", fontSize:10, color:"#a9b8c6", textAlign:"right", borderRight:"1px solid #dbe6f0", background:"#1b6f8c" }}>{slot.endsWith(":00") ? slot : ""}</div>
                        {weekDates.map((d,di)=>{
                          const dateStr = fmt(d);
                          const cellAll = lessonsByDateTime[`${dateStr}|${slot}`] || [];
                          const dayLessons = schedTutorFilter==="all" ? cellAll : cellAll.filter(l=>l.tutorId===Number(schedTutorFilter));
                          const isToday = dateStr===fmt(today);
                          return (
                            <div key={di}
                              style={{ borderLeft:"1px solid #f2f6fa", padding:"3px 4px", background:isToday?"rgba(99,102,241,0.03)":"transparent", cursor:"pointer" }}
                              onClick={()=>{ setNLesson(prev=>({...prev,date:dateStr,time:slot})); setLessonStudentLocked(false); setModal("addLesson"); }}>
                              {dayLessons.map(l=>{
                                const tu=tutors.find(x=>x.id===l.tutorId);
                                const isActive = editLesson?.id===l.id;
                                return (
                                  <div key={l.id} onClick={e=>{ e.stopPropagation(); openEditLesson(isActive?null:l); }}
                                    title={`${l.subject} · ${l.isGroup?l.groupName:l.studentName} · ${l.time}`}
                                    style={{ display:"flex", alignItems:"center", gap:4, background: isActive?`${tu?.color||"#1da0d4"}33`:`${tu?.color||"#1da0d4"}18`, border:`1px solid ${isActive?tu?.color||"#1da0d4":(tu?.color||"#1da0d4")+"33"}`, borderLeft:`3px solid ${tu?.color||"#1da0d4"}`, borderRadius:5, padding:"3px 5px", marginBottom:2, cursor:"pointer", transition:"all .15s", minHeight:20 }}>
                                    {l.isGroup && <Users size={9} color="#22344a" style={{ flexShrink:0 }} />}
                                    <span style={{ fontSize:10, fontWeight:700, color:"#22344a", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap", flex:1, lineHeight:1.2 }}>{l.subject}</span>
                                    {l.status!=="scheduled" && (
                                      <span style={{ width:6, height:6, borderRadius:"50%", background:lsnCfg[l.status]?.color, flexShrink:0 }} />
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                          );
                        })}
                      </div>
                    ))}
                  </div>
                  <div style={{ padding:"10px 14px", borderTop:"1px solid #dbe6f0", fontSize:12, color:"#7a8a9c" }}>
                    Нажмите на занятие — редактировать · Нажмите на пустую ячейку — добавить в это время
                  </div>
                </div>
              )}

              {/* LIST VIEW */}
              {schedView==="list" && (
                <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
                  {lessons.length===0 && <div style={{ color:"#7a8a9c", textAlign:"center", padding:40 }}>Нет занятий</div>}
                  {allLessonsFiltered.sort((a,b)=>a.date>b.date?1:a.date<b.date?-1:a.time>b.time?1:-1).map(l=>{
                    const t=tutors.find(x=>x.id===l.tutorId);
                    const isEditing = editLesson?.id===l.id;
                    return (
                      <div key={l.id} style={{ background:isEditing?"rgba(99,102,241,0.08)":"#ffffff", border:`1px solid ${isEditing?"#1da0d4":"#dbe6f0"}`, borderRadius:14, padding:"14px 20px", display:"flex", alignItems:"center", gap:14, transition:"all .2s" }}>
                        <div style={{ width:4, height:40, borderRadius:2, background:lsnCfg[l.status]?.color, flexShrink:0 }} />
                        <div style={{ width:70, flexShrink:0 }}>
                          <div style={{ fontSize:14, fontWeight:700 }}>{l.time||"—"}</div>
                          <div style={{ fontSize:11, color:"#7a8a9c" }}>{l.date}</div>
                        </div>
                        <div style={{ flex:1, minWidth:0 }}>
                          <div style={{ display:"flex", alignItems:"center", gap:6 }}>
                            {l.isGroup && <span style={{ fontSize:9, background:"#f5a62322", color:"#f5a623", border:"1px solid #f5a62344", borderRadius:4, padding:"1px 6px", fontWeight:700 }}>ГРУППА</span>}
                            <div style={{ fontSize:14, fontWeight:600 }}>{l.isGroup ? l.groupName : l.studentName}</div>
                          </div>
                          <div style={{ fontSize:12, color:"#7a8a9c" }}>{l.subject} · {l.duration} мин · {l.tutorShort}{l.isGroup ? ` · ${l.studentName}` : ""}</div>
                        </div>
                        {t && <Av name={t.name} color={t.color} size={28} />}
                        <div style={{ textAlign:"right", flexShrink:0 }}>
                          <div style={{ fontSize:15, fontWeight:700 }}>{l.price}₽</div>
                          <Tag c={lsnCfg[l.status]?.color} bg={`${lsnCfg[l.status]?.color}22`}>{lsnCfg[l.status]?.label}</Tag>
                        </div>
                        <div style={{ display:"flex", gap:6, flexShrink:0 }}>
                          {l.status==="scheduled" && <button className="bg" style={{ fontSize:11, padding:"5px 10px" }} onClick={()=>completeLesson(l.id)}>✓</button>}
                          <button className="bg" style={{ fontSize:11, padding:"5px 10px", background:isEditing?"rgba(99,102,241,0.25)":"" }} onClick={()=>openEditLesson(isEditing?null:l)}>✏️</button>
                          <button style={{ background:"rgba(239,68,68,0.08)", border:"1px solid rgba(239,68,68,0.2)", color:"#e2574c", padding:"5px 10px", borderRadius:7, cursor:"pointer", fontSize:11, fontFamily:"inherit" }} onClick={()=>{ moveToTrash("lessons", l, `Занятие: ${l.subject}, ${l.date} — ${l.studentName||l.groupName||""}`); setLessons(lessons.filter(x=>x.id!==l.id)); deleteRow("lessons", l.id); notify("Занятие удалено — можно вернуть из Корзины"); }}>🗑</button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* ── TUTOR COLUMN VIEW (like Excel table) ── */}
              {schedView==="tutors" && (()=>{
                const DAYS_FULL = ["Понедельник","Вторник","Среда","Четверг","Пятница","Суббота","Воскресенье"];
                const DAYS_SHORT = ["Пн","Вт","Ср","Чт","Пт","Сб","Вс"];
                const SLOTS = Array.from({length:29},(_,i)=>{ const h=8+Math.floor(i/2); const m=i%2===0?"00":"30"; return `${String(h).padStart(2,"0")}:${m}`; });
                const activeTutors = schedTutorFilter==="all" ? tutors : tutors.filter(t=>t.id===Number(schedTutorFilter));
                const todayStr = fmt(today);
                const weekDateStrs = weekDates.map(d=>fmt(d));
                const selectedDate = (schedSelectedDate && weekDateStrs.includes(schedSelectedDate)) ? schedSelectedDate : (weekDateStrs.includes(todayStr) ? todayStr : weekDateStrs[0]);
                const selectedDateObj = weekDates.find(d=>fmt(d)===selectedDate) || weekDates[0];
                const selectedDayIdx = weekDateStrs.indexOf(selectedDate);

                const printTutorSchedule = () => {
                  const w = window.open("","_blank");
                  const dateLabel = `${DAYS_FULL[selectedDayIdx]}, ${fmtLabel(selectedDateObj)} 2026`;
                  let tableRows = "";
                  SLOTS.forEach(slot => {
                    let row = `<tr><td class="time">${slot.endsWith(":00")?slot:""}</td>`;
                    activeTutors.forEach(t => {
                      const cell = lessons.filter(l=>l.tutorId===t.id && l.date===selectedDate && l.time===slot);
                      row += `<td class="${cell.length?'has-lesson':''}">` + cell.map(l=>`<div class="lesson-cell"><b>${l.studentName}</b><br/>${l.subject}<br/>${l.time} · ${l.duration}мин</div>`).join("") + `</td>`;
                    });
                    row += "</tr>";
                    tableRows += row;
                  });
                  let headerCells = '<th class="time-h">Время</th>';
                  activeTutors.forEach(t => { headerCells += `<th>${t.short}<br/><span style="font-weight:400;font-size:11px">${t.subjects.join(", ")}</span></th>`; });
                  w.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>Расписание ${dateLabel}</title>
                  <style>
                    body{font-family:Arial,sans-serif;padding:16px;font-size:11px}
                    h2{font-size:15px;margin-bottom:4px}p{color:#666;margin:0 0 12px;font-size:12px}
                    table{border-collapse:collapse;width:100%}
                    th{background:#f0f0f0;padding:6px 5px;text-align:center;border:1px solid #ddd;font-size:11px;white-space:nowrap}
                    td{padding:3px 4px;border:1px solid #eee;vertical-align:top;min-width:90px;font-size:10px}
                    td.time{background:#f9f9f9;font-weight:600;text-align:center;color:#666;white-space:nowrap}
                    th.time-h{background:#e8e8e8}
                    td.has-lesson{background:#f0f4ff}
                    .lesson-cell{background:#1da0d4;color:white;border-radius:3px;padding:3px 4px;margin-bottom:2px;font-size:9px}
                    @media print{button{display:none}}
                  </style></head><body>
                  <h2>📅 Расписание — ${dateLabel}</h2>
                  <p>Образовательный центр ГЕНИЙ</p>
                  <button onclick="window.print()" style="margin-bottom:10px;padding:6px 16px;background:#1da0d4;color:white;border:none;border-radius:6px;cursor:pointer">🖨️ Распечатать</button>
                  <table><thead><tr>${headerCells}</tr></thead><tbody>${tableRows}</tbody></table>
                  </body></html>`);
                  w.document.close();
                };

                return (
                  <div>
                    {/* Day picker — one day at a time, since columns are now per-teacher */}
                    <div style={{ display:"flex", gap:6, marginBottom:14, flexWrap:"wrap" }}>
                      {weekDates.map((d,i)=>{
                        const dStr = fmt(d);
                        const isSel = dStr===selectedDate;
                        const isToday = dStr===todayStr;
                        const dCount = lessons.filter(l=>l.date===dStr && l.status!=="cancelled" && (schedTutorFilter==="all"||l.tutorId===Number(schedTutorFilter))).length;
                        return (
                          <button key={i} onClick={()=>setSchedSelectedDate(dStr)}
                            style={{ padding:"8px 14px", borderRadius:10, border:"1px solid", cursor:"pointer", fontFamily:"inherit", transition:"all .15s", textAlign:"center", minWidth:64,
                              background:isSel?"linear-gradient(135deg,#1da0d4,#5cb85c)":"#ffffff",
                              borderColor:isSel?"#1da0d4":"#dbe6f0",
                              color:isSel?"#ffffff":"#22344a" }}>
                            <div style={{ fontSize:11, opacity:.85 }}>{DAYS_SHORT[i]}</div>
                            <div style={{ fontSize:16, fontWeight:700 }}>{d.getDate()}</div>
                            {dCount>0 && <div style={{ fontSize:9, marginTop:2, color:isSel?"#ffffff":"#1da0d4", fontWeight:600 }}>{dCount} зан.</div>}
                            {isToday && <div style={{ fontSize:8, marginTop:1, color:isSel?"rgba(255,255,255,0.85)":"#5cb85c", fontWeight:700 }}>СЕГОДНЯ</div>}
                          </button>
                        );
                      })}
                    </div>

                    <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:12 }}>
                      <div style={{ fontSize:14, fontWeight:700, color:"#12283d" }}>{DAYS_FULL[selectedDayIdx]}, {fmtLabel(selectedDateObj)}</div>
                      <button className="bg" onClick={printTutorSchedule}><Printer size={14} /> Распечатать расписание</button>
                    </div>

                    <div style={{ overflowX:"auto", background:"#ffffff", border:"1px solid #dbe6f0", boxShadow:"0 1px 3px rgba(18,40,61,.05)", borderRadius:16 }}>
                      <table style={{ borderCollapse:"collapse", minWidth:"100%", fontSize:11 }}>
                        <thead>
                          <tr>
                            <th style={{ width:56, padding:"10px 4px", border:"1px solid #dbe6f0", background:"#1b6f8c", position:"sticky", left:0, zIndex:2 }}></th>
                            {activeTutors.map(t=>(
                              <th key={t.id} style={{ padding:"10px 8px", textAlign:"center", border:"1px solid #dbe6f0", background:`${t.color}18`, borderTop:`3px solid ${t.color}`, minWidth:130 }}>
                                <div style={{ display:"flex", flexDirection:"column", alignItems:"center", gap:3 }}>
                                  <Av name={t.name} color={t.color} size={26} />
                                  <span style={{ color:t.color, fontWeight:700, fontSize:12 }}>{t.short}</span>
                                  <span style={{ color:"#7a8a9c", fontWeight:400, fontSize:9, textAlign:"center" }}>{t.subjects.slice(0,2).join(", ")}</span>
                                </div>
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {SLOTS.map(slot=>(
                            <tr key={slot} style={{ borderBottom: slot.endsWith(":30") ? "1px dashed #f2f6fa" : "1px solid #dbe6f0" }}>
                              <td style={{ padding:"3px 6px", fontSize:10, color:"#a9b8c6", textAlign:"right", background:"#1b6f8c", border:"1px solid #dbe6f0", fontWeight:600, whiteSpace:"nowrap", position:"sticky", left:0, zIndex:1 }}>{slot.endsWith(":00") ? slot : ""}</td>
                              {activeTutors.map(t=>{
                                const cellLessons = lessonsByTutorDateTime[`${t.id}|${selectedDate}|${slot}`] || [];
                                return (
                                  <td key={t.id}
                                    style={{ padding:"2px 4px", border:"1px solid #f2f6fa", verticalAlign:"top", background:`${t.color}06`, cursor:"pointer", minWidth:130 }}
                                    onClick={()=>{ setNLesson(prev=>({...prev,date:selectedDate,time:slot,tutorId:String(t.id)})); setLessonStudentLocked(false); setModal("addLesson"); }}>
                                    {cellLessons.map(l=>{
                                      const isActive = editLesson?.id===l.id;
                                      return (
                                        <div key={l.id}
                                          onClick={e=>{ e.stopPropagation(); openEditLesson(isActive?null:l); }}
                                          title={`${l.subject} · ${l.isGroup?l.groupName:l.studentName} · ${l.time}`}
                                          style={{ display:"flex", alignItems:"center", gap:3, background:isActive?`${t.color}44`:`${t.color}22`, border:`1px solid ${isActive?t.color:t.color+"44"}`, borderLeft:`3px solid ${t.color}`, borderRadius:4, padding:"3px 5px", marginBottom:2, cursor:"pointer", transition:"all .15s" }}>
                                          {l.isGroup && <Users size={9} color="#22344a" style={{ flexShrink:0 }} />}
                                          <span style={{ fontSize:10, fontWeight:700, color:"#22344a", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap", flex:1 }}>{l.subject}</span>
                                          {l.status!=="scheduled" && <span style={{ width:6, height:6, borderRadius:"50%", background:lsnCfg[l.status]?.color, flexShrink:0 }} />}
                                        </div>
                                      );
                                    })}
                                  </td>
                                );
                              })}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    <div style={{ padding:"10px 0", fontSize:12, color:"#7a8a9c", marginTop:8 }}>
                      Выберите день выше · Нажмите на ячейку — создать занятие · Нажмите на занятие — редактировать
                    </div>
                  </div>
                );
              })()}
            </div>
          );
        })()}


        {/* ── PRICING & RULES ── */}
        {view==="pricing" && (()=>{
          const pricingCategories = [...new Set(pricing.map(p=>p.category))];
          const rulesSections = [...new Set(rules.map(r=>r.section))];

          const printPricing = () => {
            const w = window.open("","_blank");
            const cats = [...new Set(pricing.map(p=>p.category))];
            let pRows = cats.map(cat=>{
              const items = pricing.filter(p=>p.category===cat);
              return `<tr><td colspan="5" style="background:#f3f4f6;font-weight:700;padding:8px 10px">${cat}</td></tr>` +
                items.map(p=>`<tr><td>${p.course}</td><td style="text-align:center">${p.price45?""+p.price45+" ₽":"—"}</td><td style="text-align:center">${p.price60?""+p.price60+" ₽":"—"}</td><td style="text-align:center">${p.price90?""+p.price90+" ₽":"—"}</td><td style="text-align:center">${p.price120?""+p.price120+" ₽":"—"}</td><td style="text-align:center">${p.groupPrice?""+p.groupPrice+" ₽":"—"}</td></tr>`).join("");
            }).join("");
            const ruleSecs = [...new Set(rules.map(r=>r.section))];
            let rHtml = ruleSecs.map(sec=>`<h3 style="margin:16px 0 8px;font-size:13px">${sec}</h3><ul style="margin:0;padding-left:20px">${rules.filter(r=>r.section===sec).map(r=>`<li style="margin-bottom:5px;font-size:12px">${r.text}</li>`).join("")}</ul>`).join("");
            w.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>Прайс-лист и правила</title>
            <style>body{font-family:Arial,sans-serif;padding:24px;max-width:900px;margin:0 auto;color:#111}
            h1{font-size:20px}h2{font-size:16px;margin:24px 0 10px;border-bottom:2px solid #e5e7eb;padding-bottom:6px}
            table{width:100%;border-collapse:collapse;font-size:12px;margin-bottom:16px}
            th{background:#1da0d4;color:white;padding:8px 10px;text-align:left}
            td{padding:7px 10px;border-bottom:1px solid #e5e7eb}
            @media print{button{display:none}}</style></head><body>
            <h1>Образовательный центр ГЕНИЙ</h1>
            <button onclick="window.print()" style="margin-bottom:16px;padding:8px 20px;background:#1da0d4;color:white;border:none;border-radius:8px;cursor:pointer">🖨️ Распечатать</button>
            <h2>💰 Прайс-лист</h2>
            <table><thead><tr><th>Курс</th><th>45 мин</th><th>60 мин</th><th>90 мин</th><th>120 мин</th><th>Групп.</th></tr></thead>
            <tbody>${pRows}</tbody></table>
            <h2>📋 Правила центра</h2>${rHtml}
            </body></html>`);
            w.document.close();
          };

          return (
            <div>
              <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:20 }}>
                <div>
                  <h1 style={{ fontFamily:"'DM Serif Display',serif", fontSize:26, fontWeight:800, color:"#12283d", margin:0 }}>Цены и правила</h1>
                  <div style={{ color:"#7a8a9c", fontSize:13, marginTop:4 }}>Прайс-лист и правила центра · редактируемые</div>
                </div>
                <button className="bg" onClick={printPricing}>🖨️ Распечатать памятку</button>
              </div>

              {/* tabs */}
              <div style={{ display:"flex", gap:4, marginBottom:20, background:"#ffffff", border:"1px solid #dbe6f0", boxShadow:"0 1px 3px rgba(18,40,61,.05)", borderRadius:12, padding:6, width:"fit-content" }}>
                {[["prices","💰 Прайс-лист"],["rules","📋 Правила"]].map(([k,l])=>(
                  <button key={k} className="stab" onClick={()=>setPricingTab(k)}
                    style={{ background:pricingTab===k?"rgba(99,102,241,0.25)":"transparent", color:pricingTab===k?"#1da0d4":"#55677a" }}>{l}</button>
                ))}
              </div>

              {/* PRICES TAB */}
              {pricingTab==="prices" && (
                <div>
                  <div style={{ background:"#ffffff", border:"1px solid #dbe6f0", boxShadow:"0 1px 3px rgba(18,40,61,.05)", borderRadius:16, overflow:"hidden" }}>
                    <table style={{ width:"100%", borderCollapse:"collapse" }}>
                      <thead>
                        <tr style={{ background:"#1b6f8c" }}>
                          {["Курс / направление","45 мин","60 мин","90 мин","120 мин","Групп.","Примечание",""].map(h=>(
                            <th key={h} style={{ padding:"12px 14px", textAlign:h==="Курс / направление"||h===""?"left":"center", fontSize:11, color:"#7a8a9c", fontWeight:600, textTransform:"uppercase", whiteSpace:"nowrap" }}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {pricingCategories.map(cat=>(
                          <>
                            <tr key={cat} style={{ background:"rgba(99,102,241,0.08)" }}>
                              <td colSpan={7} style={{ padding:"9px 14px", fontSize:12, fontWeight:700, color:"#1da0d4" }}>{cat}</td>
                            </tr>
                            {pricing.filter(p=>p.category===cat).map(p=>(
                              <tr key={p.id} style={{ borderBottom:"1px solid #f2f6fa" }}>
                                {editPricing?.id===p.id ? (
                                  <>
                                    <td style={{ padding:"8px 10px" }}><input value={editPricing.course} onChange={e=>setEditPricing({...editPricing,course:e.target.value})} style={{ fontSize:12 }} /></td>
                                    {["price45","price60","price90","price120","groupPrice"].map(f=>(
                                      <td key={f} style={{ padding:"8px 6px", textAlign:"center" }}>
                                        <input type="number" value={editPricing[f]||""} onChange={e=>setEditPricing({...editPricing,[f]:e.target.value?Number(e.target.value):null})} style={{ fontSize:12, width:70, textAlign:"center" }} placeholder="—" />
                                      </td>
                                    ))}
                                    <td style={{ padding:"8px 6px" }}><input value={editPricing.note||""} onChange={e=>setEditPricing({...editPricing,note:e.target.value})} style={{ fontSize:11 }} placeholder="Примечание" /></td>
                                    <td style={{ padding:"8px 6px" }}>
                                      <div style={{ display:"flex", gap:4 }}>
                                        <button className="bp" style={{ fontSize:10, padding:"4px 8px" }} onClick={()=>{ setPricing(pricing.map(x=>x.id===p.id?{...editPricing}:x)); setEditPricing(null); notify("Цена обновлена"); }}>✓</button>
                                        <button className="bg" style={{ fontSize:10, padding:"4px 8px" }} onClick={()=>setEditPricing(null)}>✗</button>
                                      </div>
                                    </td>
                                  </>
                                ) : (
                                  <>
                                    <td style={{ padding:"10px 14px", fontSize:13, fontWeight:500 }}>{p.course}</td>
                                    {[p.price45,p.price60,p.price90,p.price120,p.groupPrice].map((v,i)=>(
                                      <td key={i} style={{ padding:"10px 8px", textAlign:"center", fontSize:13, color:v?"#5cb85c":"#a9b8c6", fontWeight:v?600:400 }}>{v?`${v} ₽`:"—"}</td>
                                    ))}
                                    <td style={{ padding:"10px 10px", fontSize:11, color:"#f5a623" }}>{p.note||""}</td>
                                    <td style={{ padding:"10px 8px" }}>
                                      <button className="bg" style={{ fontSize:10, padding:"3px 8px" }} onClick={()=>setEditPricing({...p})}>✏️</button>
                                    </td>
                                  </>
                                )}
                              </tr>
                            ))}
                          </>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <div style={{ display:"flex", gap:10, marginTop:14 }}>
                    <button className="bp" onClick={()=>{ const newRow={id:Date.now(),category:pricingCategories[0],course:"Новый курс",price45:null,price60:600,price90:null,price120:null,groupPrice:null,note:""}; setPricing([...pricing,newRow]); setEditPricing(newRow); }}>+ Добавить курс</button>
                  </div>
                </div>
              )}

              {/* RULES TAB */}
              {pricingTab==="rules" && (
                <div>
                  {rulesSections.map(sec=>(
                    <div key={sec} style={{ background:"#ffffff", border:"1px solid #dbe6f0", boxShadow:"0 1px 3px rgba(18,40,61,.05)", borderRadius:16, padding:20, marginBottom:14 }}>
                      <div style={{ fontSize:15, fontWeight:700, color:"#1da0d4", marginBottom:14 }}>{sec}</div>
                      {rules.filter(r=>r.section===sec).map(r=>(
                        <div key={r.id} style={{ display:"flex", alignItems:"flex-start", gap:12, padding:"9px 0", borderBottom:"1px solid #f2f6fa" }}>
                          {editRule?.id===r.id ? (
                            <>
                              <textarea value={editRule.text} onChange={e=>setEditRule({...editRule,text:e.target.value})} rows={2} style={{ flex:1, fontSize:13 }} />
                              <div style={{ display:"flex", gap:4, flexShrink:0 }}>
                                <button className="bp" style={{ fontSize:11, padding:"4px 10px" }} onClick={()=>{ setRules(rules.map(x=>x.id===r.id?{...editRule}:x)); setEditRule(null); notify("Правило обновлено"); }}>✓ Сохранить</button>
                                <button className="bg" style={{ fontSize:11, padding:"4px 8px" }} onClick={()=>setEditRule(null)}>✗</button>
                              </div>
                            </>
                          ) : (
                            <>
                              <div style={{ width:6, height:6, borderRadius:"50%", background:"#1da0d4", marginTop:6, flexShrink:0 }} />
                              <div style={{ flex:1, fontSize:13, color:"#cbd5e1", lineHeight:1.6 }}>{r.text}</div>
                              <div style={{ display:"flex", gap:4, flexShrink:0 }}>
                                <button className="bg" style={{ fontSize:10, padding:"3px 8px" }} onClick={()=>setEditRule({...r})}>✏️</button>
                                <button style={{ background:"rgba(239,68,68,0.08)", border:"1px solid rgba(239,68,68,0.2)", color:"#e2574c", padding:"3px 8px", borderRadius:6, cursor:"pointer", fontSize:10, fontFamily:"inherit" }} onClick={()=>setRules(rules.filter(x=>x.id!==r.id))}>🗑</button>
                              </div>
                            </>
                          )}
                        </div>
                      ))}
                      <button className="bg" style={{ marginTop:10, fontSize:11 }} onClick={()=>{ const nr={id:Date.now(),section:sec,text:"Новое правило"}; setRules([...rules,nr]); setEditRule(nr); }}>+ Добавить правило</button>
                    </div>
                  ))}
                  <button className="bp" onClick={()=>{ const sec="📌 Новый раздел"; const nr={id:Date.now(),section:sec,text:"Первое правило"}; setRules([...rules,nr]); }}>+ Добавить раздел</button>
                </div>
              )}
            </div>
          );
        })()}

        {/* ── PAYMENTS ── */}
        {view==="payments" && (
          <div>
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:24 }}>
              <div><h1 style={{ fontFamily:"'DM Serif Display',serif", fontSize:26, fontWeight:800, color:"#12283d", margin:0 }}>Финансы</h1></div>
              <button className="bp" onClick={()=>setModal("addPayment")}>+ Записать оплату</button>
            </div>
            <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:16, marginBottom:24 }}>
              {[
                { l:"Получено от учеников", v:`${totalRevenue.toLocaleString("ru")} ₽`,              c:"#5cb85c" },
                { l:"Выплачено преподавателям", v:`${totalSalPaid.toLocaleString("ru")} ₽`,         c:"#f5a623" },
                { l:"Прибыль центра",        v:`${(totalRevenue-totalSalPaid).toLocaleString("ru")} ₽`, c:"#1da0d4" },
              ].map((s,i)=>(
                <div key={i} style={{ background:"#ffffff", border:"1px solid #dbe6f0", boxShadow:"0 1px 3px rgba(18,40,61,.05)", borderRadius:14, padding:"18px 20px" }}>
                  <div style={{ fontSize:12, color:"#7a8a9c", marginBottom:6 }}>{s.l}</div>
                  <div style={{ fontSize:24, fontWeight:700, color:s.c }}>{s.v}</div>
                </div>
              ))}
            </div>
            <div style={{ background:"#ffffff", border:"1px solid #dbe6f0", boxShadow:"0 1px 3px rgba(18,40,61,.05)", borderRadius:16, overflow:"hidden" }}>
              <table style={{ width:"100%", borderCollapse:"collapse" }}>
                <thead>
                  <tr style={{ borderBottom:"1px solid #dbe6f0" }}>
                    {["Ученик","Сумма","Дата","Способ","Комментарий"].map(h=>(
                      <th key={h} style={{ padding:"13px 16px", textAlign:"left", fontSize:11, color:"#7a8a9c", fontWeight:600, textTransform:"uppercase" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {payments.map(p=>(
                    <tr key={p.id} style={{ borderBottom:"1px solid #f2f6fa" }}>
                      <td style={{ padding:"12px 16px", fontSize:13, fontWeight:600 }}>{p.studentName}</td>
                      <td style={{ padding:"12px 16px", fontSize:15, fontWeight:700, color:"#5cb85c" }}>+{p.amount.toLocaleString("ru")}₽</td>
                      <td style={{ padding:"12px 16px", fontSize:12, color:"#55677a" }}>{p.date}</td>
                      <td style={{ padding:"12px 16px" }}><Tag c="#1da0d4" bg="rgba(99,102,241,0.12)">{p.method==="card"?"💳 Карта":p.method==="cash"?"💵 Наличные":"📱 Перевод"}</Tag></td>
                      <td style={{ padding:"12px 16px", fontSize:12, color:"#7a8a9c" }}>{p.comment}</td>
                      <td style={{ padding:"12px 16px" }}>
                        <button className="bg" style={{ fontSize:11, padding:"4px 10px" }} onClick={()=>printReceipt(students.find(s=>s.id===p.studentId), p)}>🖨️ Квитанция</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ── REPORTS ── */}
        {view==="reports" && (()=>{
          const MONTHS = ["Янв","Фев","Мар","Апр","Май","Июн","Июл","Авг","Сен","Окт","Ноя","Дек"];
          const allMonths = [...new Set([...payments.map(p=>p.date.slice(0,7)), ...lessons.filter(l=>l.status==="completed").map(l=>l.date.slice(0,7))])].sort();
          const effectiveReportMonth = allMonths.includes(reportMonth) ? reportMonth : (allMonths[allMonths.length-1] || "2026-03");

          // Finance stats for selected month
          const mPayments  = payments.filter(p=>p.date.startsWith(effectiveReportMonth));
          const mRevenue   = mPayments.reduce((s,p)=>s+p.amount,0);
          const mLessons   = lessons.filter(l=>l.date.startsWith(effectiveReportMonth));
          const mCompleted = mLessons.filter(l=>l.status==="completed");
          const mSalaries  = salaries.filter(s=>s.month===effectiveReportMonth || s.date?.startsWith(effectiveReportMonth));
          const mSalTotal  = mSalaries.reduce((s,p)=>s+p.amount,0);
          const mProfit    = mRevenue - mSalTotal;
          const mAvgCheck  = mPayments.length ? Math.round(mRevenue/mPayments.length) : 0;

          // Students stats
          const mNewStudents = students.filter(s=>{
            const firstLesson = lessons.filter(l=>l.studentId===s.id).sort((a,b)=>a.date>b.date?1:-1)[0];
            return firstLesson?.date?.startsWith(effectiveReportMonth);
          });
          const mActiveStudents = [...new Set(mCompleted.map(l=>l.studentId))];

          // Tutor stats for month
          const tutorStats = tutors.map(t=>{
            const tLsns = mCompleted.filter(l=>l.tutorId===t.id);
            const earned = tLsns.reduce((s,l)=>s+calcEarning(l,t),0);
            const revenue = tLsns.reduce((s,l)=>s+l.price,0);
            return { ...t, lessons:tLsns.length, earned, revenue, students:[...new Set(tLsns.map(l=>l.studentId))].length };
          }).filter(t=>t.lessons>0).sort((a,b)=>b.lessons-a.lessons);

          // Subject stats
          const subjectStats = {};
          mCompleted.forEach(l=>{ subjectStats[l.subject]=(subjectStats[l.subject]||0)+1; });
          const subjectArr = Object.entries(subjectStats).sort((a,b)=>b[1]-a[1]);
          const maxSubj = subjectArr[0]?.[1]||1;

          // Monthly trend (last 6 months)
          const trendMonths = allMonths.slice(-6);
          const trendData = trendMonths.map(m=>({
            month: MONTHS[parseInt(m.split("-")[1])-1],
            revenue: payments.filter(p=>p.date.startsWith(m)).reduce((s,p)=>s+p.amount,0),
            lessons: lessons.filter(l=>l.date.startsWith(m)&&l.status==="completed").length,
          }));
          const maxRevenue = Math.max(...trendData.map(d=>d.revenue),1);
          const maxLessons = Math.max(...trendData.map(d=>d.lessons),1);

          const printReport = () => {
            const w = window.open("","_blank");
            const mLabel = `${MONTHS[parseInt(effectiveReportMonth.split("-")[1])-1]} ${effectiveReportMonth.split("-")[0]}`;
            w.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>Отчёт ${mLabel}</title>
            <style>body{font-family:Arial,sans-serif;padding:24px;color:#111;max-width:900px;margin:0 auto}
            h1{font-size:20px;margin-bottom:4px}p{color:#777;font-size:13px;margin:0 0 20px}
            .grid{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-bottom:24px}
            .card{background:#f9fafb;border:1px solid #e5e7eb;border-radius:10px;padding:14px;text-align:center}
            .card .v{font-size:24px;font-weight:700;color:#1da0d4;margin-bottom:4px}.card .l{font-size:12px;color:#777}
            table{width:100%;border-collapse:collapse;font-size:13px;margin-bottom:20px}
            th{background:#f3f4f6;padding:8px 10px;text-align:left;border-bottom:2px solid #e5e7eb;font-weight:600}
            td{padding:7px 10px;border-bottom:1px solid #e5e7eb}h2{font-size:15px;margin:20px 0 10px}
            @media print{button{display:none}}</style></head><body>
            <h1>📊 Отчёт за ${mLabel}</h1><p>CRM образовательного центра «ГЕНИЙ»</p>
            <button onclick="window.print()" style="margin-bottom:20px;padding:8px 20px;background:#1da0d4;color:white;border:none;border-radius:8px;cursor:pointer">🖨️ Распечатать</button>
            <div class="grid">
              <div class="card"><div class="v">${mRevenue.toLocaleString("ru")}₽</div><div class="l">Выручка</div></div>
              <div class="card"><div class="v">${mProfit.toLocaleString("ru")}₽</div><div class="l">Прибыль</div></div>
              <div class="card"><div class="v">${mCompleted.length}</div><div class="l">Занятий проведено</div></div>
              <div class="card"><div class="v">${mActiveStudents.length}</div><div class="l">Активных учеников</div></div>
            </div>
            <h2>Преподаватели</h2>
            <table><thead><tr><th>Преподаватель</th><th>Занятий</th><th>Учеников</th><th>Выручка</th><th>К выплате</th></tr></thead>
            <tbody>${tutorStats.map(t=>`<tr><td>${t.short}</td><td>${t.lessons}</td><td>${t.students}</td><td>${t.revenue.toLocaleString("ru")}₽</td><td>${t.earned.toLocaleString("ru")}₽</td></tr>`).join("")}</tbody></table>
            <h2>По предметам</h2>
            <table><thead><tr><th>Предмет</th><th>Занятий</th></tr></thead>
            <tbody>${subjectArr.map(([s,c])=>`<tr><td>${s}</td><td>${c}</td></tr>`).join("")}</tbody></table>
            </body></html>`);
            w.document.close();
          };

          return (
            <div>
              <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:24 }}>
                <div>
                  <h1 style={{ fontFamily:"'DM Serif Display',serif", fontSize:26, fontWeight:800, color:"#12283d", margin:0 }}>Отчёты</h1>
                  <div style={{ color:"#7a8a9c", fontSize:13, marginTop:4 }}>Аналитика и статистика по месяцам</div>
                </div>
                <div style={{ display:"flex", gap:8, alignItems:"center" }}>
                  <select value={reportMonth} onChange={e=>setReportMonth(e.target.value)} style={{ width:"auto" }}>
                    {allMonths.map(m=>{
                      const [y,mo]=m.split("-");
                      return <option key={m} value={m}>{MONTHS[parseInt(mo)-1]} {y}</option>;
                    })}
                    {!allMonths.includes("2026-03") && <option value="2026-03">Март 2026</option>}
                  </select>
                  <button className="bg" onClick={printReport}>🖨️ Печать</button>
                </div>
              </div>

              {/* tabs */}
              <div style={{ display:"flex", gap:4, marginBottom:20, background:"#ffffff", border:"1px solid #dbe6f0", boxShadow:"0 1px 3px rgba(18,40,61,.05)", borderRadius:12, padding:6, width:"fit-content" }}>
                {[["finance","💰 Финансы"],["tutors_r","🎓 Преподаватели"],["subjects","📚 Предметы"],["trend","📈 Динамика"]].map(([k,l])=>(
                  <button key={k} className="stab" onClick={()=>setReportTab(k)}
                    style={{ background:reportTab===k?"rgba(99,102,241,0.25)":"transparent", color:reportTab===k?"#1da0d4":"#55677a" }}>{l}</button>
                ))}
              </div>

              {/* ── TAB: finance ── */}
              {reportTab==="finance" && (
                <div>
                  <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:14, marginBottom:20 }}>
                    {[
                      { l:"Выручка",          v:`${mRevenue.toLocaleString("ru")}₽`,   c:"#5cb85c", icon:"💰" },
                      { l:"Расходы (зарп.)",  v:`${mSalTotal.toLocaleString("ru")}₽`,  c:"#f5a623", icon:"💸" },
                      { l:"Прибыль центра",   v:`${mProfit.toLocaleString("ru")}₽`,    c:mProfit>=0?"#1da0d4":"#e2574c", icon:"📈" },
                      { l:"Средний чек",      v:`${mAvgCheck.toLocaleString("ru")}₽`,  c:"#d6539a", icon:"🧾" },
                    ].map((s,i)=>(
                      <div key={i} className="card" style={{ background:"#ffffff", border:"1px solid #dbe6f0", boxShadow:"0 1px 3px rgba(18,40,61,.05)", borderRadius:16, padding:20 }}>
                        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start" }}>
                          <div>
                            <div style={{ fontSize:12, color:"#7a8a9c", marginBottom:8 }}>{s.l}</div>
                            <div style={{ fontSize:26, fontWeight:700, color:s.c, fontFamily:"'DM Serif Display',serif" }}>{s.v}</div>
                          </div>
                          <div style={{ fontSize:26, opacity:.5 }}>{s.icon}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                  <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:14, marginBottom:20 }}>
                    {[
                      { l:"Занятий проведено", v:mCompleted.length,       c:"#1da0d4", icon:"📚" },
                      { l:"Занятий запланировано", v:mLessons.filter(l=>l.status==="scheduled").length, c:"#6d7f92", icon:"📅" },
                      { l:"Уникальных учеников",v:mActiveStudents.length, c:"#5cb85c", icon:"👥" },
                      { l:"Новых учеников",     v:mNewStudents.length,    c:"#f5a623", icon:"🆕" },
                    ].map((s,i)=>(
                      <div key={i} className="card" style={{ background:"#ffffff", border:"1px solid #dbe6f0", boxShadow:"0 1px 3px rgba(18,40,61,.05)", borderRadius:16, padding:20 }}>
                        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start" }}>
                          <div>
                            <div style={{ fontSize:12, color:"#7a8a9c", marginBottom:8 }}>{s.l}</div>
                            <div style={{ fontSize:26, fontWeight:700, color:s.c, fontFamily:"'DM Serif Display',serif" }}>{s.v}</div>
                          </div>
                          <div style={{ fontSize:26, opacity:.5 }}>{s.icon}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                  {/* payments list */}
                  <div style={{ background:"#ffffff", border:"1px solid #dbe6f0", boxShadow:"0 1px 3px rgba(18,40,61,.05)", borderRadius:16, overflow:"hidden" }}>
                    <div style={{ padding:"16px 20px", borderBottom:"1px solid #dbe6f0", fontSize:14, fontWeight:600 }}>Платежи за месяц</div>
                    {mPayments.length===0
                      ? <div style={{ padding:"30px", textAlign:"center", color:"#7a8a9c" }}>Нет платежей</div>
                      : <table style={{ width:"100%", borderCollapse:"collapse" }}>
                          <thead><tr style={{ borderBottom:"1px solid #dbe6f0" }}>
                            {["Ученик","Сумма","Дата","Способ","Комментарий"].map(h=><th key={h} style={{ padding:"10px 16px", textAlign:"left", fontSize:11, color:"#7a8a9c", fontWeight:600, textTransform:"uppercase" }}>{h}</th>)}
                          </tr></thead>
                          <tbody>
                            {mPayments.map(p=>(
                              <tr key={p.id} style={{ borderBottom:"1px solid #f2f6fa" }}>
                                <td style={{ padding:"11px 16px", fontWeight:600, fontSize:13 }}>{p.studentName}</td>
                                <td style={{ padding:"11px 16px", fontWeight:700, color:"#5cb85c" }}>+{p.amount.toLocaleString("ru")}₽</td>
                                <td style={{ padding:"11px 16px", fontSize:12, color:"#55677a" }}>{p.date}</td>
                                <td style={{ padding:"11px 16px" }}><Tag c="#1da0d4" bg="rgba(99,102,241,0.12)">{p.method==="card"?"💳 Карта":p.method==="cash"?"💵 Наличные":"📱 Перевод"}</Tag></td>
                                <td style={{ padding:"11px 16px", fontSize:12, color:"#7a8a9c" }}>{p.comment}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                    }
                  </div>
                </div>
              )}

              {/* ── TAB: tutors_r ── */}
              {reportTab==="tutors_r" && (
                <div>
                  {tutorStats.length===0
                    ? <div style={{ background:"#ffffff", border:"1px solid #dbe6f0", boxShadow:"0 1px 3px rgba(18,40,61,.05)", borderRadius:16, padding:"60px", textAlign:"center", color:"#7a8a9c" }}>Нет данных за этот месяц</div>
                    : (
                      <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:14 }}>
                        {tutorStats.map((t,i)=>(
                          <div key={t.id} className="card" style={{ background:"#ffffff", border:"1px solid #dbe6f0", boxShadow:"0 1px 3px rgba(18,40,61,.05)", borderRadius:16, padding:20 }}>
                            <div style={{ display:"flex", alignItems:"center", gap:12, marginBottom:16 }}>
                              <Av name={t.name} color={t.color} size={42} />
                              <div>
                                <div style={{ fontSize:14, fontWeight:700 }}>{t.short}</div>
                                <div style={{ fontSize:11, color:"#7a8a9c", marginTop:2 }}>{t.subjects.join(", ")}</div>
                              </div>
                              {i===0 && <div style={{ marginLeft:"auto", fontSize:18 }}>🥇</div>}
                              {i===1 && <div style={{ marginLeft:"auto", fontSize:18 }}>🥈</div>}
                              {i===2 && <div style={{ marginLeft:"auto", fontSize:18 }}>🥉</div>}
                            </div>
                            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:8 }}>
                              {[
                                { l:"Занятий",  v:t.lessons,                         c:"#1da0d4" },
                                { l:"Учеников", v:t.students,                        c:"#5cb85c" },
                                { l:"К выплате",v:`${t.earned.toLocaleString("ru")}₽`,c:"#f5a623"},
                              ].map((m,j)=>(
                                <div key={j} style={{ background:"#f2f6fa", borderRadius:9, padding:"9px", textAlign:"center" }}>
                                  <div style={{ fontSize:10, color:"#7a8a9c", marginBottom:3 }}>{m.l}</div>
                                  <div style={{ fontSize:14, fontWeight:700, color:m.c }}>{m.v}</div>
                                </div>
                              ))}
                            </div>
                            {/* mini bar */}
                            <div style={{ marginTop:12 }}>
                              <div style={{ fontSize:11, color:"#7a8a9c", marginBottom:5 }}>Доля занятий в центре</div>
                              <div style={{ height:6, background:"#f2f6fa", borderRadius:3, overflow:"hidden" }}>
                                <div style={{ height:"100%", background:t.color, borderRadius:3, width:`${Math.round(t.lessons/Math.max(...tutorStats.map(x=>x.lessons),1)*100)}%`, transition:"width .5s" }} />
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )
                  }
                  {/* salary summary */}
                  {mSalaries.length>0 && (
                    <div style={{ background:"#ffffff", border:"1px solid #dbe6f0", boxShadow:"0 1px 3px rgba(18,40,61,.05)", borderRadius:16, padding:20, marginTop:16 }}>
                      <div style={{ fontSize:14, fontWeight:600, marginBottom:14 }}>💼 Выплаты зарплат в этом месяце</div>
                      {mSalaries.map(s=>{
                        const t=tutors.find(x=>x.id===s.tutorId);
                        return (
                          <div key={s.id} style={{ display:"flex", alignItems:"center", gap:12, padding:"9px 0", borderBottom:"1px solid #f2f6fa" }}>
                            {t && <Av name={t.name} color={t.color} size={30} />}
                            <div style={{ flex:1 }}>
                              <div style={{ fontSize:13, fontWeight:600 }}>{t?.short||"—"}</div>
                              <div style={{ fontSize:11, color:"#7a8a9c" }}>{s.date} · {s.comment}</div>
                            </div>
                            <div style={{ fontSize:15, fontWeight:700, color:"#5cb85c" }}>+{s.amount.toLocaleString("ru")}₽</div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

              {/* ── TAB: subjects ── */}
              {reportTab==="subjects" && (
                <div style={{ background:"#ffffff", border:"1px solid #dbe6f0", boxShadow:"0 1px 3px rgba(18,40,61,.05)", borderRadius:16, padding:24 }}>
                  <div style={{ fontSize:14, fontWeight:600, marginBottom:20 }}>Занятий по предметам за {MONTHS[parseInt(effectiveReportMonth.split("-")[1])-1]}</div>
                  {subjectArr.length===0
                    ? <div style={{ textAlign:"center", color:"#7a8a9c", padding:"40px 0" }}>Нет данных</div>
                    : subjectArr.map(([subj, cnt])=>(
                      <div key={subj} style={{ marginBottom:14 }}>
                        <div style={{ display:"flex", justifyContent:"space-between", marginBottom:5 }}>
                          <span style={{ fontSize:13, fontWeight:600 }}>{subj}</span>
                          <span style={{ fontSize:13, color:"#6d7f92" }}>{cnt} занятий</span>
                        </div>
                        <div style={{ height:10, background:"#f2f6fa", borderRadius:5, overflow:"hidden" }}>
                          <div style={{ height:"100%", background:"linear-gradient(90deg,#1da0d4,#5cb85c)", borderRadius:5, width:`${Math.round(cnt/maxSubj*100)}%`, transition:"width .6s" }} />
                        </div>
                      </div>
                    ))
                  }
                  <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:12, marginTop:24 }}>
                    {subjectArr.slice(0,6).map(([subj,cnt])=>(
                      <div key={subj} style={{ background:"#f2f6fa", borderRadius:12, padding:"14px", textAlign:"center" }}>
                        <div style={{ fontSize:22, fontWeight:700, color:"#1da0d4" }}>{cnt}</div>
                        <div style={{ fontSize:11, color:"#7a8a9c", marginTop:3 }}>{subj}</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* ── TAB: trend ── */}
              {reportTab==="trend" && (
                <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:16 }}>
                  {/* revenue chart */}
                  <div style={{ background:"#ffffff", border:"1px solid #dbe6f0", boxShadow:"0 1px 3px rgba(18,40,61,.05)", borderRadius:16, padding:24 }}>
                    <div style={{ fontSize:14, fontWeight:600, marginBottom:20 }}>📈 Выручка по месяцам</div>
                    <div style={{ display:"flex", alignItems:"flex-end", gap:10, height:140 }}>
                      {trendData.map((d,i)=>(
                        <div key={i} style={{ flex:1, display:"flex", flexDirection:"column", alignItems:"center", gap:4 }}>
                          <div style={{ fontSize:10, color:"#7a8a9c", marginBottom:2 }}>{d.revenue>0?`${Math.round(d.revenue/1000)}к`:""}</div>
                          <div style={{ width:"100%", background:`${d.month===MONTHS[parseInt(effectiveReportMonth.split("-")[1])-1]?"#1da0d4":"rgba(99,102,241,0.3)"}`, borderRadius:"4px 4px 0 0", height:`${Math.max(Math.round(d.revenue/maxRevenue*120),4)}px`, transition:"height .5s" }} />
                          <div style={{ fontSize:11, color:"#7a8a9c" }}>{d.month}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                  {/* lessons chart */}
                  <div style={{ background:"#ffffff", border:"1px solid #dbe6f0", boxShadow:"0 1px 3px rgba(18,40,61,.05)", borderRadius:16, padding:24 }}>
                    <div style={{ fontSize:14, fontWeight:600, marginBottom:20 }}>📚 Занятий по месяцам</div>
                    <div style={{ display:"flex", alignItems:"flex-end", gap:10, height:140 }}>
                      {trendData.map((d,i)=>(
                        <div key={i} style={{ flex:1, display:"flex", flexDirection:"column", alignItems:"center", gap:4 }}>
                          <div style={{ fontSize:10, color:"#7a8a9c", marginBottom:2 }}>{d.lessons||""}</div>
                          <div style={{ width:"100%", background:`${d.month===MONTHS[parseInt(effectiveReportMonth.split("-")[1])-1]?"#5cb85c":"rgba(34,197,94,0.3)"}`, borderRadius:"4px 4px 0 0", height:`${Math.max(Math.round(d.lessons/maxLessons*120),4)}px`, transition:"height .5s" }} />
                          <div style={{ fontSize:11, color:"#7a8a9c" }}>{d.month}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                  {/* summary table */}
                  <div style={{ gridColumn:"1/-1", background:"#ffffff", border:"1px solid #dbe6f0", boxShadow:"0 1px 3px rgba(18,40,61,.05)", borderRadius:16, overflow:"hidden" }}>
                    <div style={{ padding:"16px 20px", borderBottom:"1px solid #dbe6f0", fontSize:14, fontWeight:600 }}>Сводная таблица по месяцам</div>
                    <table style={{ width:"100%", borderCollapse:"collapse" }}>
                      <thead>
                        <tr style={{ borderBottom:"1px solid #dbe6f0" }}>
                          {["Месяц","Выручка","Занятий","Новых учеников","Ср. чек"].map(h=>(
                            <th key={h} style={{ padding:"11px 16px", textAlign:"left", fontSize:11, color:"#7a8a9c", fontWeight:600, textTransform:"uppercase" }}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {allMonths.slice(-6).reverse().map(m=>{
                          const mP = payments.filter(p=>p.date.startsWith(m));
                          const mRev = mP.reduce((s,p)=>s+p.amount,0);
                          const mL = lessons.filter(l=>l.date.startsWith(m)&&l.status==="completed").length;
                          const mNew = students.filter(s=>{ const f=lessons.filter(l=>l.studentId===s.id).sort((a,b)=>a.date>b.date?1:-1)[0]; return f?.date?.startsWith(m); }).length;
                          const mAvg = mP.length ? Math.round(mRev/mP.length) : 0;
                          const isSelected = m===effectiveReportMonth;
                          return (
                            <tr key={m} style={{ borderBottom:"1px solid #f2f6fa", background:isSelected?"rgba(99,102,241,0.06)":"transparent", cursor:"pointer" }} onClick={()=>setReportMonth(m)}>
                              <td style={{ padding:"11px 16px", fontWeight:isSelected?700:400, color:isSelected?"#1da0d4":"#22344a" }}>
                                {MONTHS[parseInt(m.split("-")[1])-1]} {m.split("-")[0]} {isSelected&&"◀"}
                              </td>
                              <td style={{ padding:"11px 16px", fontWeight:600, color:"#5cb85c" }}>{mRev.toLocaleString("ru")}₽</td>
                              <td style={{ padding:"11px 16px", color:"#6d7f92" }}>{mL}</td>
                              <td style={{ padding:"11px 16px", color:"#f5a623" }}>{mNew}</td>
                              <td style={{ padding:"11px 16px", color:"#55677a" }}>{mAvg.toLocaleString("ru")}₽</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          );
        })()}


        {/* ── COURSES CATALOG ── */}
        {view==="courses" && (()=>{
          const catalogCategories = [...new Set(courseCatalog.map(c=>c.category))];
          const printCatalog = () => {
            const w = window.open("","_blank");
            const rows = catalogCategories.map(cat=>{
              const items = courseCatalog.filter(c=>c.category===cat);
              return `<tr><td colspan="3" style="background:#f3f4f6;font-weight:700;padding:8px 10px">${cat}</td></tr>` +
                items.map(c=>`<tr><td>${c.name}</td><td>${c.price?c.price+" ₽":"—"}</td><td>${c.description||""}</td></tr>`).join("");
            }).join("");
            w.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>Каталог курсов</title><style>
              body{font-family:Arial,sans-serif;padding:24px;max-width:900px;margin:0 auto;color:#111}
              h1{font-size:20px}
              table{width:100%;border-collapse:collapse;font-size:13px;margin-bottom:16px}
              th{background:#1da0d4;color:white;padding:8px 10px;text-align:left}
              td{padding:7px 10px;border-bottom:1px solid #e5e7eb}
              @media print{button{display:none}}
            </style></head><body>
              <h1>Образовательный центр ГЕНИЙ — Каталог курсов</h1>
              <button onclick="window.print()" style="margin-bottom:16px;padding:8px 20px;background:#1da0d4;color:white;border:none;border-radius:8px;cursor:pointer">🖨️ Распечатать</button>
              <table><thead><tr><th>Курс</th><th>Цена</th><th>Описание</th></tr></thead><tbody>${rows}</tbody></table>
            </body></html>`);
            w.document.close();
          };
          return (
          <div>
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:24 }}>
              <div>
                <h1 style={{ fontFamily:"'DM Serif Display',serif", fontSize:26, fontWeight:800, color:"#12283d", margin:0 }}>Каталог курсов</h1>
                <div style={{ color:"#7a8a9c", fontSize:13, marginTop:4 }}>Все направления центра · {courseCatalog.length} курсов · редактируемый</div>
              </div>
              <div style={{ display:"flex", gap:10 }}>
                <button className="bg" onClick={printCatalog}>🖨️ Распечатать каталог</button>
                <button className="bp" onClick={()=>{
                  const newCourse = { id:"custom_"+Date.now(), category: catalogCategories[0]||"📌 Другое", name:"Новый курс", price:"", description:"" };
                  setCourseCatalog([...courseCatalog, newCourse]);
                  setEditingCatalogId(newCourse.id);
                }}>+ Добавить курс</button>
              </div>
            </div>

            {catalogCategories.map(cat=>(
              <div key={cat} style={{ background:"#ffffff", border:"1px solid #dbe6f0", boxShadow:"0 1px 3px rgba(18,40,61,.05)", borderRadius:16, padding:20, marginBottom:16 }}>
                <div style={{ fontSize:15, fontWeight:700, color:"#1da0d4", marginBottom:14 }}>{cat}</div>
                <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
                  {courseCatalog.filter(c=>c.category===cat).map(c=>(
                    <div key={c.id} style={{ background:"#f2f6fa", borderRadius:10, padding:"10px 14px" }}>
                      {editingCatalogId===c.id ? (
                        <div style={{ display:"grid", gap:8 }}>
                          <div style={{ display:"grid", gridTemplateColumns:"2fr 1fr 1fr", gap:8 }}>
                            <input value={c.name} onChange={e=>setCourseCatalog(courseCatalog.map(x=>x.id===c.id?{...x,name:e.target.value}:x))} placeholder="Название курса" style={{ fontSize:13 }} />
                            <input value={c.category} onChange={e=>setCourseCatalog(courseCatalog.map(x=>x.id===c.id?{...x,category:e.target.value}:x))} placeholder="Категория" style={{ fontSize:13 }} />
                            <input type="number" value={c.price} onChange={e=>setCourseCatalog(courseCatalog.map(x=>x.id===c.id?{...x,price:e.target.value}:x))} placeholder="Цена ₽" style={{ fontSize:13 }} />
                          </div>
                          <textarea value={c.description} onChange={e=>setCourseCatalog(courseCatalog.map(x=>x.id===c.id?{...x,description:e.target.value}:x))} placeholder="Описание курса" rows={2} style={{ fontSize:13 }} />
                          <div style={{ display:"flex", gap:8 }}>
                            <button className="bp" style={{ fontSize:11, padding:"5px 12px" }} onClick={()=>setEditingCatalogId(null)}>✓ Сохранить</button>
                            <button style={{ background:"rgba(226,87,76,0.08)", border:"1px solid rgba(226,87,76,0.2)", color:"#e2574c", padding:"5px 12px", borderRadius:7, cursor:"pointer", fontSize:11, fontFamily:"inherit" }}
                              onClick={()=>{ if(window.confirm(`Удалить курс "${c.name}"?`)) setCourseCatalog(courseCatalog.filter(x=>x.id!==c.id)); setEditingCatalogId(null); }}>🗑 Удалить</button>
                          </div>
                        </div>
                      ) : (
                        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center" }}>
                          <div style={{ flex:1 }}>
                            <div style={{ fontSize:13, fontWeight:600, color:"#12283d" }}>{c.name}</div>
                            {c.description && <div style={{ fontSize:11, color:"#7a8a9c", marginTop:2 }}>{c.description}</div>}
                          </div>
                          <div style={{ fontSize:14, fontWeight:700, color:c.price?"#5cb85c":"#a9b8c6", marginRight:12 }}>{c.price?`${c.price} ₽`:"—"}</div>
                          <button className="bg" style={{ fontSize:11, padding:"4px 10px" }} onClick={()=>setEditingCatalogId(c.id)}>✏️</button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ))}

            {/* stats row */}
            <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:14, marginTop:20 }}>
              {[
                { l:"Всего курсов",       v:courseCatalog.length,                                     c:"#1da0d4", icon:"📋" },
                { l:"Категорий",          v:catalogCategories.length,                                 c:"#f5a623", icon:"🗂️" },
                { l:"Популярный курс",    v:(()=>{ const m={}; lessons.forEach(l=>{ if(l.status==="completed") m[l.subject]=(m[l.subject]||0)+1; }); return Object.entries(m).sort((a,b)=>b[1]-a[1])[0]?.[0]||"—"; })(), c:"#5cb85c", icon:"🏆" },
                { l:"Курсов с занятиями", v:[...new Set(lessons.filter(l=>l.status==="completed").map(l=>l.subject))].length, c:"#d6539a", icon:"✅" },
              ].map((s,i)=>(
                <div key={i} className="card" style={{ background:"#ffffff", border:"1px solid #dbe6f0", boxShadow:"0 1px 3px rgba(18,40,61,.05)", borderRadius:16, padding:18 }}>
                  <div style={{ display:"flex", justifyContent:"space-between" }}>
                    <div>
                      <div style={{ fontSize:11, color:"#7a8a9c", marginBottom:6 }}>{s.l}</div>
                      <div style={{ fontSize:s.l==="Популярный курс"?14:24, fontWeight:700, color:s.c }}>{s.v}</div>
                    </div>
                    <div style={{ fontSize:22, opacity:.5 }}>{s.icon}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
          );
        })()}


        {/* ── REQUESTS ── */}
        {view==="requests" && (()=>{
          const addRequest = () => {
            if (!nRequest.parentName || !nRequest.phone) return;
            setRequests([{ ...nRequest, id:Date.now(), date:new Date().toISOString().split("T")[0], assignedTutorId:null }, ...requests]);
            setNRequest({ parentName:"", phone:"", comment:"", status:"new", children:[{ studentName:"", grade:"", subjectTeachers:[{ subject:"", tutorId:"" }] }] });
            setModal(null); notify("Запрос добавлен");
          };

          const sortArrow = (key) => reqSortKey!==key ? "" : (reqSortDir==="asc" ? " ▲" : " ▼");

          return (
            <div>
              <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:20, flexWrap:"wrap", gap:12 }}>
                <div>
                  <h1 style={{ fontFamily:"'DM Serif Display',serif", fontSize:26, fontWeight:800, color:"#12283d", margin:0 }}>Запросы от родителей</h1>
                  <div style={{ color:"#7a8a9c", fontSize:13, marginTop:4 }}>Входящие обращения · {requests.filter(r=>r.status==="new").length} новых</div>
                </div>
                <div style={{ display:"flex", gap:10, alignItems:"center", flexWrap:"wrap" }}>
                  <div style={{ display:"flex", gap:4, background:"#ffffff", border:"1px solid #dbe6f0", borderRadius:10, padding:4 }}>
                    {[["table","Таблица"],["kanban","Канбан"]].map(([k,l])=>(
                      <button key={k} className="stab" onClick={()=>setReqViewMode(k)}
                        style={{ background:reqViewMode===k?"rgba(29,160,212,0.15)":"transparent", color:reqViewMode===k?"#1da0d4":"#55677a" }}>{l}</button>
                    ))}
                  </div>
                  <button className="bp" onClick={()=>setModal("addRequest")}>+ Новый запрос</button>
                </div>
              </div>

              {/* status summary */}
              <div style={{ display:"grid", gridTemplateColumns:"repeat(5,1fr)", gap:10, marginBottom:20 }}>
                {Object.entries(reqCfg).map(([k,v])=>{
                  const cnt = requests.filter(r=>r.status===k).length;
                  return (
                    <div key={k} onClick={()=>{ setReqFilter(reqFilter===k?"all":k); setReqPage(1); }} style={{ background:"#ffffff", border:`1px solid ${reqFilter===k?v.color:"#dbe6f0"}`, borderRadius:12, padding:"12px 16px", cursor:"pointer", textAlign:"center", transition:"all .2s" }}>
                      <div style={{ fontSize:22, fontWeight:700, color:v.color }}>{cnt}</div>
                      <div style={{ fontSize:11, color:"#7a8a9c", marginTop:2 }}>{v.label}</div>
                    </div>
                  );
                })}
              </div>

              {/* search — debounced 350ms, shows a subtle skeleton while waiting */}
              <div style={{ marginBottom:16, position:"relative" }}>
                <input placeholder="🔍 Поиск по имени, телефону, курсу..." value={reqSearchInput} onChange={e=>setReqSearchInput(e.target.value)} />
              </div>

              {reqViewMode==="table" ? (
                <>
                  <div style={{ background:"#ffffff", border:"1px solid #dbe6f0", boxShadow:"0 1px 3px rgba(18,40,61,.05)", borderRadius:16, overflow:"hidden", overflowX:"auto" }}>
                    <table style={{ width:"100%", borderCollapse:"collapse", minWidth:760 }}>
                      <thead>
                        <tr style={{ borderBottom:"1px solid #dbe6f0" }}>
                          {[["date","Дата"],["parentName","Родитель"],["studentName","Ученик"],["course","Курс"],["status","Статус"],["assignedTutorId","Педагог"],[null,"Действия"]].map(([key,label])=>(
                            <th key={label} onClick={key?()=>toggleReqSort(key):undefined}
                              style={{ padding:"12px 14px", textAlign:"left", fontSize:11, color:"#7a8a9c", fontWeight:600, textTransform:"uppercase", cursor:key?"pointer":"default", userSelect:"none", whiteSpace:"nowrap" }}>
                              {label}{key && sortArrow(key)}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {reqSearching && Array.from({length:4}).map((_,i)=><ReqSkeletonRow key={i} />)}
                        {!reqSearching && reqPageItems.length===0 && (
                          <tr><td colSpan={7} style={{ padding:"50px", textAlign:"center", color:"#7a8a9c" }}>Запросов не найдено</td></tr>
                        )}
                        {!reqSearching && reqPageItems.map(req=>{
                          const assignedTutor = tutors.find(t=>t.id===req.assignedTutorId);
                          return (
                            <RequestTableRow key={req.id} req={req} reqCfg={reqCfg} assignedTutor={assignedTutor} tutors={tutors}
                              onStatusChange={handleReqStatusChange} onAssignTutor={handleReqAssignTutor} onScheduleTrial={handleReqScheduleTrial}
                              onEnroll={handleReqEnroll} onDelete={handleReqDelete} onOpen={handleReqOpen} />
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                  {/* pagination */}
                  {reqTotalPages>1 && (
                    <div style={{ display:"flex", justifyContent:"center", alignItems:"center", gap:10, marginTop:16 }}>
                      <button className="bg" disabled={reqPageSafe<=1} onClick={()=>setReqPage(p=>Math.max(1,p-1))}>‹ Назад</button>
                      <span style={{ fontSize:12, color:"#7a8a9c" }}>Стр. {reqPageSafe} из {reqTotalPages} · {reqFiltered.length} всего</span>
                      <button className="bg" disabled={reqPageSafe>=reqTotalPages} onClick={()=>setReqPage(p=>Math.min(reqTotalPages,p+1))}>Вперёд ›</button>
                    </div>
                  )}
                </>
              ) : (
                // ── KANBAN VIEW — drag a card between columns to change its status ──
                <div style={{ display:"grid", gridTemplateColumns:"repeat(5,1fr)", gap:14, alignItems:"start", overflowX:"auto" }}>
                  {Object.entries(reqCfg).map(([statusKey,cfg])=>{
                    const colItems = reqFiltered.filter(r=>r.status===statusKey);
                    return (
                      <div key={statusKey}
                        onDragOver={e=>e.preventDefault()}
                        onDrop={e=>handleReqDropOnColumn(e, statusKey)}
                        style={{ background:"#f2f6fa", borderRadius:14, padding:12, minHeight:200, minWidth:200 }}>
                        <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:10 }}>
                          <span style={{ fontSize:12, fontWeight:700, color:cfg.color }}>{cfg.label}</span>
                          <span style={{ fontSize:11, color:"#a9b8c6" }}>{colItems.length}</span>
                        </div>
                        {colItems.map(req=>{
                          const assignedTutor = tutors.find(t=>t.id===req.assignedTutorId);
                          return (
                            <RequestKanbanCard key={req.id} req={req} tutors={tutors} assignedTutor={assignedTutor}
                              onDragStart={handleReqDragStart} onOpen={handleReqOpen} onDelete={handleReqDelete} />
                          );
                        })}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })()}

        {/* ── MAILINGS ── */}
        {view==="mailings" && (
          <div>
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:24 }}>
              <div><h1 style={{ fontFamily:"'DM Serif Display',serif", fontSize:26, fontWeight:800, color:"#12283d", margin:0 }}>Рассылки</h1></div>
              <button className="bp" onClick={()=>{ setMStep(1); setMDraft({title:"",channel:"whatsapp",audience:"all",text:""}); setModal("mailing"); }}>+ Новая рассылка</button>
            </div>
            <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:12, marginBottom:28 }}>
              {[
                { icon:"💸", title:"Напоминание об оплате",  audience:"debtors", channel:"whatsapp", text:"Здравствуйте, {{parentName}}! У {{studentName}} задолженность {{balance}}₽. Просим оплатить до конца недели." },
                { icon:"📅", title:"Напоминание о занятии",  audience:"active",  channel:"whatsapp", text:"Здравствуйте, {{parentName}}! Напоминаем о занятии у {{studentName}} завтра. Ждём вас!" },
                { icon:"🎉", title:"Поздравление",           audience:"all",     channel:"sms",      text:"Дорогой {{studentName}} и {{parentName}}! Поздравляем с праздником! 🎉" },
                { icon:"🔄", title:"Возврат после паузы",    audience:"paused",  channel:"whatsapp", text:"Здравствуйте, {{parentName}}! Первое занятие для {{studentName}} после паузы — бесплатно! 😊" },
                { icon:"⭐", title:"Пробный → Постоянный",   audience:"trial",   channel:"whatsapp", text:"Здравствуйте, {{parentName}}! Оформите абонемент для {{studentName}} со скидкой 10%!" },
                { icon:"📊", title:"Итоги месяца",           audience:"active",  channel:"telegram", text:"Здравствуйте, {{parentName}}! Подводим итоги марта для {{studentName}}. Отличная работа! 💪" },
              ].map((tpl,i)=>(
                <div key={i} className="card" style={{ background:"#ffffff", border:"1px solid #dbe6f0", boxShadow:"0 1px 3px rgba(18,40,61,.05)", borderRadius:14, padding:16, cursor:"pointer" }}
                  onClick={()=>{ setMDraft({title:tpl.title,channel:tpl.channel,audience:tpl.audience,text:tpl.text}); setMStep(1); setModal("mailing"); }}>
                  <div style={{ display:"flex", gap:10, marginBottom:8 }}>
                    <span style={{ fontSize:22 }}>{tpl.icon}</span>
                    <div>
                      <div style={{ fontSize:13, fontWeight:600 }}>{tpl.title}</div>
                      <div style={{ display:"flex", gap:6, marginTop:4, flexWrap:"wrap" }}>
                        <Tag c={channelCfg[tpl.channel].color} bg={`${channelCfg[tpl.channel].color}22`}>{channelCfg[tpl.channel].icon} {channelCfg[tpl.channel].label}</Tag>
                        <Tag c="#6d7f92" bg="rgba(148,163,184,0.1)">{audLabels[tpl.audience]}</Tag>
                      </div>
                    </div>
                  </div>
                  <div style={{ fontSize:11, color:"#7a8a9c", lineHeight:1.5, display:"-webkit-box", WebkitLineClamp:2, WebkitBoxOrient:"vertical", overflow:"hidden" }}>{tpl.text}</div>
                  <div style={{ marginTop:8, fontSize:11, color:"#1da0d4", fontWeight:600 }}>Использовать →</div>
                </div>
              ))}
            </div>
            <div style={{ fontSize:13, color:"#55677a", fontWeight:600, marginBottom:12, textTransform:"uppercase", letterSpacing:"0.05em" }}>История</div>
            <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
              {mailings.map(m=>(
                <div key={m.id} style={{ background:"#ffffff", border:"1px solid #dbe6f0", boxShadow:"0 1px 3px rgba(18,40,61,.05)", borderRadius:14, padding:"16px 20px", display:"flex", gap:14, alignItems:"flex-start" }}>
                  <div style={{ width:42, height:42, borderRadius:12, background:`${channelCfg[m.channel]?.color}22`, display:"flex", alignItems:"center", justifyContent:"center", fontSize:20, flexShrink:0 }}>{channelCfg[m.channel]?.icon}</div>
                  <div style={{ flex:1 }}>
                    <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:4 }}>
                      <div style={{ fontSize:14, fontWeight:600 }}>{m.title}</div>
                      <Tag c={m.status==="sent"?"#5cb85c":"#6d7f92"} bg={m.status==="sent"?"rgba(34,197,94,0.12)":"rgba(148,163,184,0.12)"}>{m.status==="sent"?"✓ Отправлено":"Черновик"}</Tag>
                    </div>
                    <div style={{ fontSize:12, color:"#7a8a9c", marginBottom:6 }}>{m.text}</div>
                    <div style={{ display:"flex", gap:8, flexWrap:"wrap" }}>
                      <Tag c={channelCfg[m.channel]?.color} bg={`${channelCfg[m.channel]?.color}22`}>{channelCfg[m.channel]?.icon} {channelCfg[m.channel]?.label}</Tag>
                      <Tag c="#1da0d4" bg="rgba(99,102,241,0.1)">{audIcons[m.audience]} {audLabels[m.audience]||m.audience}</Tag>
                      {m.status==="sent" && <span style={{ fontSize:11, color:"#7a8a9c", alignSelf:"center" }}>📤 {m.sentCount} получателей · {m.sentAt}</span>}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── CANDIDATES (job applicants) ── */}
        {view==="candidates" && (()=>{
          const candCfg = {
            new:        { label:"Новый",         color:"#1da0d4", bg:"rgba(29,160,212,0.12)" },
            interview:  { label:"Собеседование",  color:"#f5a623", bg:"rgba(245,166,35,0.12)" },
            hired:      { label:"Принят",         color:"#5cb85c", bg:"rgba(92,184,92,0.12)"  },
            rejected:   { label:"Отказано",       color:"#e2574c", bg:"rgba(226,87,76,0.12)"  },
          };
          const filtered = candidates.filter(c=>{
            const q = candSearch.toLowerCase();
            const matchQ = !q || c.name.toLowerCase().includes(q) || c.phone.includes(q) || (c.subjects||[]).some(s=>s.toLowerCase().includes(q));
            const matchF = candFilter==="all" || c.status===candFilter;
            return matchQ && matchF;
          });
          if (selCandidate) {
            const c = candidates.find(x=>x.id===selCandidate.id) || selCandidate;
            return (
              <div>
                <button className="bg" style={{ marginBottom:20 }} onClick={()=>setSelCandidate(null)}><ChevronLeft size={14} /> Назад</button>
                <div style={{ background:"#ffffff", border:"1px solid #dbe6f0", boxShadow:"0 1px 3px rgba(18,40,61,.05)", borderRadius:18, padding:28 }}>
                  <div style={{ display:"flex", gap:20, alignItems:"flex-start", marginBottom:20 }}>
                    <Av name={c.name} color="#f5a623" size={60} />
                    <div style={{ flex:1 }}>
                      <div style={{ fontSize:20, fontWeight:700, color:"#12283d" }}>{c.name}</div>
                      <div style={{ fontSize:13, color:"#7a8a9c", marginTop:4, display:"flex", alignItems:"center", gap:6 }}><Phone size={12} /> {c.phone}</div>
                      {c.email && <div style={{ fontSize:13, color:"#7a8a9c", marginTop:2, display:"flex", alignItems:"center", gap:6 }}><Mail size={12} /> {c.email}</div>}
                    </div>
                    <Tag c={candCfg[c.status]?.color} bg={candCfg[c.status]?.bg}>{candCfg[c.status]?.label}</Tag>
                  </div>
                  {c.subjects?.length>0 && (
                    <div style={{ marginBottom:16 }}>{c.subjects.map(s=><Tag key={s} c="#1da0d4" bg="rgba(29,160,212,0.12)">{s}</Tag>)}</div>
                  )}
                  {c.notes && (
                    <div style={{ background:"#f2f6fa", borderRadius:10, padding:"12px 14px", marginBottom:16, fontSize:13, color:"#22344a", lineHeight:1.6 }}>
                      <span style={{ fontWeight:700, color:"#12283d" }}>Примечания: </span>{c.notes}
                    </div>
                  )}
                  <div style={{ display:"flex", gap:8, marginBottom:16 }}>
                    <select value={c.status} onChange={e=>setCandidates(candidates.map(x=>x.id===c.id?{...x,status:e.target.value}:x))} style={{ maxWidth:200 }}>
                      {Object.entries(candCfg).map(([k,v])=><option key={k} value={k}>{v.label}</option>)}
                    </select>
                    {c.status!=="hired" && (
                      <button className="bp" onClick={()=>hireCandidate(c)}><UserPlus size={14} /> Принять на работу</button>
                    )}
                    <button style={{ background:"rgba(226,87,76,0.08)", border:"1px solid rgba(226,87,76,0.2)", color:"#e2574c", padding:"9px 16px", borderRadius:10, cursor:"pointer", fontSize:14, fontFamily:"inherit", display:"flex", alignItems:"center", gap:6 }}
                      onClick={()=>{ if(window.confirm(`Удалить анкету "${c.name}"?`)){ setCandidates(candidates.filter(x=>x.id!==c.id)); setSelCandidate(null); notify("Анкета удалена"); } }}><Trash2 size={14} /> Удалить</button>
                  </div>
                  <AttachmentsBlock
                    title="Резюме и документы"
                    files={c.files||[]}
                    uploading={uploadingFile}
                    onUpload={(file)=>uploadAttachment("candidates", c.id, file)}
                    onDelete={(f)=>deleteAttachment("candidates", c.id, f)}
                  />
                </div>
              </div>
            );
          }
          return (
            <div>
              <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:20 }}>
                <div>
                  <h1 style={{ fontFamily:"'DM Serif Display',serif", fontSize:26, fontWeight:800, color:"#12283d", margin:0 }}>Соискатели</h1>
                  <div style={{ color:"#7a8a9c", fontSize:13, marginTop:4 }}>Анкеты кандидатов на должность преподавателя · {candidates.length}</div>
                </div>
                <button className="bp" onClick={()=>setModal("addCandidate")}><Plus size={15} /> Добавить соискателя</button>
              </div>

              <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:10, marginBottom:20 }}>
                {Object.entries(candCfg).map(([k,v])=>{
                  const cnt = candidates.filter(c=>c.status===k).length;
                  return (
                    <div key={k} onClick={()=>setCandFilter(candFilter===k?"all":k)} style={{ background:"#ffffff", border:`1px solid ${candFilter===k?v.color:"#dbe6f0"}`, boxShadow:"0 1px 3px rgba(18,40,61,.05)", borderRadius:12, padding:"12px 16px", cursor:"pointer", textAlign:"center", transition:"all .2s" }}>
                      <div style={{ fontSize:22, fontWeight:700, color:v.color }}>{cnt}</div>
                      <div style={{ fontSize:11, color:"#7a8a9c", marginTop:2 }}>{v.label}</div>
                    </div>
                  );
                })}
              </div>

              <div style={{ marginBottom:16 }}>
                <input placeholder="Поиск по имени, телефону, предмету..." value={candSearch} onChange={e=>setCandSearch(e.target.value)} />
              </div>

              <div style={{ display:"grid", gap:12 }}>
                {filtered.length===0 && <div style={{ background:"#ffffff", border:"1px solid #dbe6f0", borderRadius:16, padding:"50px", textAlign:"center", color:"#7a8a9c" }}>Анкет не найдено</div>}
                {filtered.map(c=>(
                  <div key={c.id} className="rh" style={{ background:"#ffffff", border:"1px solid #dbe6f0", boxShadow:"0 1px 3px rgba(18,40,61,.05)", borderRadius:14, padding:"16px 20px", display:"flex", alignItems:"center", gap:14 }} onClick={()=>setSelCandidate(c)}>
                    <Av name={c.name} color="#f5a623" size={40} />
                    <div style={{ flex:1 }}>
                      <div style={{ fontSize:14, fontWeight:700, color:"#12283d" }}>{c.name}</div>
                      <div style={{ fontSize:12, color:"#7a8a9c" }}>{c.phone}{c.subjects?.length ? ` · ${c.subjects.join(", ")}` : ""}</div>
                    </div>
                    {c.files?.length>0 && <span style={{ fontSize:11, color:"#7a8a9c", display:"flex", alignItems:"center", gap:4 }}><Paperclip size={12} /> {c.files.length}</span>}
                    <Tag c={candCfg[c.status]?.color} bg={candCfg[c.status]?.bg}>{candCfg[c.status]?.label}</Tag>
                  </div>
                ))}
              </div>
            </div>
          );
        })()}


        {view==="ai" && (
          <div style={{ display:"flex", flexDirection:"column", height:"calc(100vh - 64px)", maxWidth:800 }}>
            <div style={{ marginBottom:20, display:"flex", justifyContent:"space-between", alignItems:"flex-end" }}>
              <div>
                <h1 style={{ fontFamily:"'DM Serif Display',serif", fontSize:26, fontWeight:800, color:"#12283d", margin:0 }}>✨ ИИ-Помощник</h1>
                <div style={{ color:"#7a8a9c", fontSize:13, marginTop:4 }}>Задайте вопрос об учениках, расписании, финансах — или попросите составить сообщение</div>
              </div>
              <div style={{ display:"flex", gap:4, background:"#ffffff", border:"1px solid #dbe6f0", borderRadius:10, padding:4 }}>
                {[["gemini","Gemini"],["deepseek","DeepSeek"],["claude","Claude (агент)"]].map(([k,l])=>(
                  <button key={k} onClick={()=>setAiProvider(k)}
                    style={{ padding:"6px 14px", borderRadius:7, fontSize:12, fontWeight:600, border:"none", cursor:"pointer", fontFamily:"inherit", transition:"all .15s",
                      background:aiProvider===k?"linear-gradient(135deg,#1da0d4,#5cb85c)":"transparent",
                      color:aiProvider===k?"#ffffff":"#55677a" }}>{l}</button>
                ))}
              </div>
            </div>
            <div style={{ flex:1, background:"#ffffff", border:"1px solid #dbe6f0", boxShadow:"0 1px 3px rgba(18,40,61,.05)", borderRadius:16, display:"flex", flexDirection:"column", overflow:"hidden" }}>
              <div style={{ flex:1, overflowY:"auto", padding:20, display:"flex", flexDirection:"column", gap:12 }}>
                {aiMessages.map((m,i)=>{
                  const isToolAction = m.role==="assistant" && m.content.startsWith("🔧");
                  return (
                    <div key={i} style={{ alignSelf:m.role==="user"?"flex-end":"flex-start", maxWidth:"75%" }}>
                      <div style={{
                        background: m.role==="user" ? "linear-gradient(135deg,#1da0d4,#5cb85c)" : (isToolAction ? "rgba(245,166,35,0.12)" : "#f2f6fa"),
                        color: m.role==="user" ? "white" : (isToolAction ? "#b5721a" : "#22344a"),
                        border: isToolAction ? "1px dashed rgba(245,166,35,0.4)" : "none",
                        padding: isToolAction ? "7px 14px" : "10px 16px", borderRadius:14,
                        borderBottomRightRadius: m.role==="user"?4:14,
                        borderBottomLeftRadius: m.role==="user"?14:4,
                        fontSize: isToolAction ? 12 : 14, fontWeight: isToolAction ? 600 : 400, lineHeight:1.6, whiteSpace:"pre-wrap"
                      }}>{m.content}</div>
                    </div>
                  );
                })}
                {aiLoading && (
                  <div style={{ alignSelf:"flex-start" }}>
                    <div style={{ background:"#f2f6fa", padding:"10px 16px", borderRadius:14, borderBottomLeftRadius:4, fontSize:14, color:"#55677a" }}>Печатает...</div>
                  </div>
                )}
                <div ref={aiMessagesEndRef} />
              </div>
              <div style={{ padding:16, borderTop:"1px solid #dbe6f0", display:"flex", gap:10 }}>
                <textarea
                  placeholder="Напишите сообщение..."
                  value={aiInput}
                  onChange={e=>setAiInput(e.target.value)}
                  onKeyDown={handleAiKeyDown}
                  rows={1}
                  style={{ flex:1, resize:"none", maxHeight:100 }}
                />
                <button className="bp" onClick={sendAiMessage} disabled={aiLoading || !aiInput.trim()}>Отправить</button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ══ MODALS ══ */}

      {modal==="addTutor" && (
        <div className="ov" onClick={()=>{ setModal(null); setEditingTutorId(null); setNTutor({ name:"", phone:"", email:"", address:"", notes:"", subjects:[], rateType:"percent", rateValue:50, status:"active", color:"#1da0d4" }); }}>
          <div className="mo" onClick={e=>e.stopPropagation()}>
            <h2 style={{ margin:"0 0 22px", fontSize:20, fontWeight:700 }}>{editingTutorId ? "Редактирование преподавателя" : "Новый преподаватель"}</h2>
            <div style={{ display:"grid", gap:14 }}>
              <div><div style={{ fontSize:12, color:"#55677a", marginBottom:6 }}>ФИО *</div><input placeholder="Иванова Наталья Владимировна" value={nTutor.name} onChange={e=>setNTutor({...nTutor,name:e.target.value})} /></div>
              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12 }}>
                <div><div style={{ fontSize:12, color:"#55677a", marginBottom:6 }}>Телефон *</div><input placeholder="+7 900 000-00-00" value={nTutor.phone} onChange={e=>setNTutor({...nTutor,phone:e.target.value})} /></div>
                <div><div style={{ fontSize:12, color:"#55677a", marginBottom:6 }}>✉️ Email</div><input type="email" placeholder="ivanova@mail.ru" value={nTutor.email} onChange={e=>setNTutor({...nTutor,email:e.target.value})} /></div>
              </div>
              <div><div style={{ fontSize:12, color:"#55677a", marginBottom:6 }}>📍 Адрес</div><input placeholder="ул. Ленина, д. 12, кв. 34" value={nTutor.address} onChange={e=>setNTutor({...nTutor,address:e.target.value})} /></div>
              <div><div style={{ fontSize:12, color:"#55677a", marginBottom:6 }}>Примечания</div><textarea rows={2} placeholder="Любая дополнительная информация" value={nTutor.notes} onChange={e=>setNTutor({...nTutor,notes:e.target.value})} /></div>
              <div>
                <div style={{ fontSize:12, color:"#55677a", marginBottom:6 }}>Предметы</div>
                <div style={{ maxHeight:200, overflowY:"auto", display:"flex", flexDirection:"column", gap:10 }}>
                  {catalogGrouped.map(cat=>(
                    <div key={cat.id}>
                      <div style={{ fontSize:10, color:cat.color, fontWeight:700, textTransform:"uppercase", marginBottom:5 }}>{cat.label}</div>
                      <div style={{ display:"flex", flexWrap:"wrap", gap:5 }}>
                        {cat.courses.map(s=>(
                          <button key={s} onClick={()=>setNTutor(prev=>({...prev,subjects:prev.subjects.includes(s)?prev.subjects.filter(x=>x!==s):[...prev.subjects,s]}))}
                            style={{ padding:"4px 10px", borderRadius:20, fontSize:11, border:"1px solid", cursor:"pointer",
                              background:nTutor.subjects.includes(s)?`${cat.color}28`:"transparent",
                              borderColor:nTutor.subjects.includes(s)?cat.color:"#d7e2ee",
                              color:nTutor.subjects.includes(s)?cat.color:"#55677a" }}>{s}</button>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12 }}>
                <div>
                  <div style={{ fontSize:12, color:"#55677a", marginBottom:6 }}>Тип ставки</div>
                  <select value={nTutor.rateType} onChange={e=>setNTutor({...nTutor,rateType:e.target.value})}>
                    <option value="percent">% от занятия</option>
                    <option value="fixed">Фиксированная ₽</option>
                  </select>
                </div>
                <div>
                  <div style={{ fontSize:12, color:"#55677a", marginBottom:6 }}>{nTutor.rateType==="percent"?"Процент (%)":"Сумма (₽)"}</div>
                  <input type="number" value={nTutor.rateValue} onChange={e=>setNTutor({...nTutor,rateValue:e.target.value})} />
                </div>
              </div>
              <div>
                <div style={{ fontSize:12, color:"#55677a", marginBottom:8 }}>Цвет</div>
                <div style={{ display:"flex", gap:8 }}>
                  {COLORS.map(c=>(
                    <div key={c} onClick={()=>setNTutor({...nTutor,color:c})}
                      style={{ width:28, height:28, borderRadius:"50%", background:c, cursor:"pointer", border:nTutor.color===c?"3px solid white":"2px solid transparent" }} />
                  ))}
                </div>
              </div>
              <div style={{ display:"flex", gap:10, marginTop:8 }}>
                <button className="bp" style={{ flex:1 }} onClick={addTutor}>{editingTutorId ? "Сохранить" : "Добавить"}</button>
                <button className="bg" onClick={()=>{ setModal(null); setEditingTutorId(null); setNTutor({ name:"", phone:"", email:"", address:"", notes:"", subjects:[], rateType:"percent", rateValue:50, status:"active", color:"#1da0d4" }); }}>Отмена</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {modal==="addStudent" && (
        <div className="ov" onClick={()=>setModal(null)}>
          <div className="mo" style={{ width:640, maxHeight:"92vh", overflowY:"auto" }} onClick={e=>e.stopPropagation()}>
            <h2 style={{ margin:"0 0 4px", fontSize:21, fontWeight:700, color:"#12283d" }}>Новый ученик</h2>
            <div style={{ fontSize:12, color:"#7a8a9c", marginBottom:20 }}>Если из одной семьи несколько детей — добавьте их всех сразу, контакты родителя общие</div>
            <div style={{ display:"grid", gap:14 }}>

              <div style={{ display:"flex", alignItems:"center", gap:7, fontSize:11, fontWeight:700, color:"#1da0d4", textTransform:"uppercase", letterSpacing:"0.06em" }}>
                <Users size={14} /> Контакты семьи
              </div>
              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10 }}>
                <div><div style={{ fontSize:11, fontWeight:600, color:"#55677a", marginBottom:6, textTransform:"uppercase", letterSpacing:"0.03em" }}>ФИО родителя *</div><input placeholder="Иванова Мария Петровна" value={familyForm.parentName} onChange={e=>setFamilyForm({...familyForm,parentName:e.target.value})} /></div>
                <div><div style={{ fontSize:11, fontWeight:600, color:"#55677a", marginBottom:6, textTransform:"uppercase", letterSpacing:"0.03em", display:"flex", alignItems:"center", gap:4 }}><Phone size={11} /> Телефон *</div><input placeholder="+7 900 000-00-00" value={familyForm.phone} onChange={e=>setFamilyForm({...familyForm,phone:e.target.value})} /></div>
              </div>
              {familyForm.extraPhones.map((p,i)=>(
                <div key={i} style={{ display:"flex", gap:8 }}>
                  <input placeholder="Дополнительный телефон" value={p} onChange={e=>{ const arr=[...familyForm.extraPhones]; arr[i]=e.target.value; setFamilyForm({...familyForm,extraPhones:arr}); }} />
                  <button onClick={()=>setFamilyForm({...familyForm,extraPhones:familyForm.extraPhones.filter((_,j)=>j!==i)})} style={{ background:"rgba(226,87,76,0.1)", border:"1px solid rgba(226,87,76,0.2)", color:"#e2574c", padding:"4px 10px", borderRadius:6, cursor:"pointer", fontFamily:"inherit", display:"flex", alignItems:"center" }}><X size={13} /></button>
                </div>
              ))}
              <button className="bg" style={{ width:"fit-content", fontSize:12 }} onClick={()=>setFamilyForm({...familyForm,extraPhones:[...familyForm.extraPhones,""]})}><Plus size={13} /> Ещё телефон</button>
              <div><div style={{ fontSize:11, fontWeight:600, color:"#55677a", marginBottom:6, textTransform:"uppercase", letterSpacing:"0.03em", display:"flex", alignItems:"center", gap:4 }}><MapPin size={11} /> Адрес</div><input placeholder="ул. Ленина, д. 12, кв. 34" value={familyForm.address} onChange={e=>setFamilyForm({...familyForm,address:e.target.value})} /></div>
              <div><div style={{ fontSize:11, fontWeight:600, color:"#55677a", marginBottom:6, textTransform:"uppercase", letterSpacing:"0.03em" }}>Примечания</div><textarea rows={2} placeholder="Любая дополнительная информация" value={familyForm.notes} onChange={e=>setFamilyForm({...familyForm,notes:e.target.value})} /></div>

              <div style={{ height:1, background:"#dbe6f0", margin:"8px 0" }} />
              <div style={{ display:"flex", alignItems:"center", gap:7, fontSize:11, fontWeight:700, color:"#1da0d4", textTransform:"uppercase", letterSpacing:"0.06em" }}>
                <GraduationCap size={14} /> Дети
              </div>

              {familyForm.children.map((child, ci) => (
                <div key={ci} style={{ background:"#f8fafc", border:"1px solid #e7eef5", borderRadius:14, padding:18, display:"grid", gap:12 }}>
                  <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center" }}>
                    <div style={{ display:"flex", alignItems:"center", gap:9 }}>
                      <div style={{ width:26, height:26, borderRadius:"50%", background:"linear-gradient(135deg,#1da0d4,#5cb85c)", color:"#fff", display:"flex", alignItems:"center", justifyContent:"center", fontSize:12, fontWeight:700, flexShrink:0 }}>{ci+1}</div>
                      <div style={{ fontSize:13, fontWeight:700, color:"#12283d" }}>Ребёнок {ci+1}</div>
                    </div>
                    {familyForm.children.length>1 && (
                      <button onClick={()=>setFamilyForm({...familyForm, children: familyForm.children.filter((_,j)=>j!==ci)})}
                        style={{ background:"rgba(226,87,76,0.1)", border:"1px solid rgba(226,87,76,0.2)", color:"#e2574c", padding:"3px 10px", borderRadius:6, cursor:"pointer", fontSize:12, fontFamily:"inherit", display:"flex", alignItems:"center", gap:4 }}><Trash2 size={12} /> Удалить</button>
                    )}
                  </div>
                  <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10 }}>
                    <input placeholder="ФИО ребёнка *" value={child.name} onChange={e=>{ const arr=[...familyForm.children]; arr[ci]={...arr[ci],name:e.target.value}; setFamilyForm({...familyForm,children:arr}); }} />
                    <div>
                      <BirthDatePicker value={child.birthDate} onChange={val=>{ const arr=[...familyForm.children]; arr[ci]={...arr[ci],birthDate:val}; setFamilyForm({...familyForm,children:arr}); }} />
                      {child.birthDate && <div style={{ fontSize:11, color:"#7a8a9c", marginTop:4 }}>Возраст: {calcAge(child.birthDate)} лет</div>}
                    </div>
                  </div>
                  <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10 }}>
                    <input placeholder="Школа" value={child.school} onChange={e=>{ const arr=[...familyForm.children]; arr[ci]={...arr[ci],school:e.target.value}; setFamilyForm({...familyForm,children:arr}); }} />
                    <input placeholder="Класс" value={child.grade} onChange={e=>{ const arr=[...familyForm.children]; arr[ci]={...arr[ci],grade:e.target.value}; setFamilyForm({...familyForm,children:arr}); }} />
                  </div>
                  <div>
                    <div style={{ fontSize:11, fontWeight:600, color:"#55677a", marginBottom:6, textTransform:"uppercase", letterSpacing:"0.03em" }}>Предметы и педагоги</div>
                    {child.subjectTeachers.map((st,si)=>(
                      <div key={si} style={{ display:"flex", gap:8, marginBottom:6 }}>
                        <select value={st.subject} onChange={e=>{ const arr=[...familyForm.children]; const sts=[...arr[ci].subjectTeachers]; sts[si]={...sts[si],subject:e.target.value}; arr[ci]={...arr[ci],subjectTeachers:sts}; setFamilyForm({...familyForm,children:arr}); }}>
                          <option value="">Предмет...</option>
                          {catalogGrouped.map(cat=>(
                            <optgroup key={cat.id} label={cat.label}>
                              {cat.courses.map(c=><option key={c} value={c}>{c}</option>)}
                            </optgroup>
                          ))}
                        </select>
                        <select value={st.tutorId} onChange={e=>{ const arr=[...familyForm.children]; const sts=[...arr[ci].subjectTeachers]; sts[si]={...sts[si],tutorId:e.target.value}; arr[ci]={...arr[ci],subjectTeachers:sts}; setFamilyForm({...familyForm,children:arr}); }}>
                          <option value="">Педагог...</option>
                          {tutors.map(t=><option key={t.id} value={t.id}>{t.name}</option>)}
                        </select>
                        {child.subjectTeachers.length>1 && (
                          <button onClick={()=>{ const arr=[...familyForm.children]; arr[ci]={...arr[ci],subjectTeachers:arr[ci].subjectTeachers.filter((_,j)=>j!==si)}; setFamilyForm({...familyForm,children:arr}); }}
                            style={{ background:"rgba(226,87,76,0.1)", border:"1px solid rgba(226,87,76,0.2)", color:"#e2574c", borderRadius:6, padding:"4px 8px", cursor:"pointer", flexShrink:0, display:"flex", alignItems:"center" }}><X size={13} /></button>
                        )}
                      </div>
                    ))}
                    <button className="bg" style={{ fontSize:11 }} onClick={()=>{ const arr=[...familyForm.children]; arr[ci]={...arr[ci],subjectTeachers:[...arr[ci].subjectTeachers,{subject:"",tutorId:""}]}; setFamilyForm({...familyForm,children:arr}); }}><Plus size={12} /> Ещё предмет</button>
                  </div>
                  <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10 }}>
                    <div>
                      <div style={{ fontSize:11, fontWeight:600, color:"#55677a", marginBottom:6, textTransform:"uppercase", letterSpacing:"0.03em" }}>Статус</div>
                      <select value={child.status} onChange={e=>{ const arr=[...familyForm.children]; arr[ci]={...arr[ci],status:e.target.value}; setFamilyForm({...familyForm,children:arr}); }}>
                        {Object.entries(statusCfg).map(([k,v])=><option key={k} value={k}>{v.label}</option>)}
                      </select>
                    </div>
                    <div>
                      <div style={{ fontSize:11, fontWeight:600, color:"#55677a", marginBottom:6, textTransform:"uppercase", letterSpacing:"0.03em" }}>Условия оплаты</div>
                      <input placeholder="напр. 5000₽/мес" value={child.tuitionNote} onChange={e=>{ const arr=[...familyForm.children]; arr[ci]={...arr[ci],tuitionNote:e.target.value}; setFamilyForm({...familyForm,children:arr}); }} />
                    </div>
                  </div>
                </div>
              ))}
              <button className="bg" onClick={()=>setFamilyForm({...familyForm, children:[...familyForm.children, emptyChild()]})}><Plus size={14} /> Добавить ещё ребёнка</button>

              <div style={{ display:"flex", gap:10, marginTop:8 }}>
                <button className="bp" style={{ flex:1 }} onClick={addStudent}>Добавить {familyForm.children.filter(c=>c.name.trim()).length>1?`(детей: ${familyForm.children.filter(c=>c.name.trim()).length})`:""}</button>
                <button className="bg" onClick={()=>setModal(null)}>Отмена</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {modal==="editStudent" && nStudentEdit && (
        <div className="ov" onClick={()=>{ setModal(null); setEditingStudentId(null); setNStudentEdit(null); }}>
          <div className="mo" style={{ width:560, maxHeight:"92vh", overflowY:"auto" }} onClick={e=>e.stopPropagation()}>
            <h2 style={{ margin:"0 0 18px", fontSize:20, fontWeight:700 }}>Редактирование ученика</h2>
            <div style={{ display:"grid", gap:12 }}>
              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10 }}>
                <input placeholder="ФИО *" value={nStudentEdit.name} onChange={e=>setNStudentEdit({...nStudentEdit,name:e.target.value})} />
              </div>
              <div>
                <div style={{ fontSize:12, color:"#55677a", marginBottom:6 }}>Дата рождения</div>
                <BirthDatePicker value={nStudentEdit.birthDate} onChange={val=>setNStudentEdit({...nStudentEdit,birthDate:val})} />
                {nStudentEdit.birthDate && <div style={{ fontSize:11, color:"#7a8a9c", marginTop:4 }}>Возраст: {calcAge(nStudentEdit.birthDate)} лет</div>}
              </div>
              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10 }}>
                <input placeholder="🏫 Школа" value={nStudentEdit.school} onChange={e=>setNStudentEdit({...nStudentEdit,school:e.target.value})} />
                <input placeholder="Класс" value={nStudentEdit.grade} onChange={e=>setNStudentEdit({...nStudentEdit,grade:e.target.value})} />
              </div>
              <div><div style={{ fontSize:12, color:"#55677a", marginBottom:6 }}>ФИО родителя</div><input value={nStudentEdit.parentName} onChange={e=>setNStudentEdit({...nStudentEdit,parentName:e.target.value})} /></div>
              <div><div style={{ fontSize:12, color:"#55677a", marginBottom:6 }}>Телефон *</div><input value={nStudentEdit.phone} onChange={e=>setNStudentEdit({...nStudentEdit,phone:e.target.value})} /></div>
              {nStudentEdit.extraPhones.map((p,i)=>(
                <div key={i} style={{ display:"flex", gap:8 }}>
                  <input placeholder="Дополнительный телефон" value={p} onChange={e=>{ const arr=[...nStudentEdit.extraPhones]; arr[i]=e.target.value; setNStudentEdit({...nStudentEdit,extraPhones:arr}); }} />
                  <button onClick={()=>setNStudentEdit({...nStudentEdit,extraPhones:nStudentEdit.extraPhones.filter((_,j)=>j!==i)})} style={{ background:"rgba(226,87,76,0.1)", border:"1px solid rgba(226,87,76,0.2)", color:"#e2574c", padding:"4px 10px", borderRadius:6, cursor:"pointer", fontFamily:"inherit" }}>✗</button>
                </div>
              ))}
              <button className="bg" style={{ width:"fit-content", fontSize:12 }} onClick={()=>setNStudentEdit({...nStudentEdit,extraPhones:[...nStudentEdit.extraPhones,""]})}>+ Ещё телефон</button>
              <div><div style={{ fontSize:12, color:"#55677a", marginBottom:6 }}>📍 Адрес</div><input value={nStudentEdit.address} onChange={e=>setNStudentEdit({...nStudentEdit,address:e.target.value})} /></div>

              <div>
                <div style={{ fontSize:12, color:"#55677a", marginBottom:6 }}>Предметы и педагоги</div>
                {nStudentEdit.subjectTeachers.map((st,si)=>(
                  <div key={si} style={{ display:"flex", gap:8, marginBottom:6 }}>
                    <select value={st.subject} onChange={e=>{ const arr=[...nStudentEdit.subjectTeachers]; arr[si]={...arr[si],subject:e.target.value}; setNStudentEdit({...nStudentEdit,subjectTeachers:arr}); }}>
                      <option value="">Предмет...</option>
                      {catalogGrouped.map(cat=>(
                        <optgroup key={cat.id} label={cat.label}>
                          {cat.courses.map(c=><option key={c} value={c}>{c}</option>)}
                        </optgroup>
                      ))}
                    </select>
                    <select value={st.tutorId} onChange={e=>{ const arr=[...nStudentEdit.subjectTeachers]; arr[si]={...arr[si],tutorId:e.target.value}; setNStudentEdit({...nStudentEdit,subjectTeachers:arr}); }}>
                      <option value="">Педагог...</option>
                      {tutors.map(t=><option key={t.id} value={t.id}>{t.name}</option>)}
                    </select>
                    {nStudentEdit.subjectTeachers.length>1 && (
                      <button onClick={()=>setNStudentEdit({...nStudentEdit,subjectTeachers:nStudentEdit.subjectTeachers.filter((_,j)=>j!==si)})}
                        style={{ background:"rgba(226,87,76,0.1)", border:"1px solid rgba(226,87,76,0.2)", color:"#e2574c", borderRadius:6, padding:"4px 8px", cursor:"pointer", flexShrink:0 }}>✗</button>
                    )}
                  </div>
                ))}
                <button className="bg" style={{ fontSize:11 }} onClick={()=>setNStudentEdit({...nStudentEdit,subjectTeachers:[...nStudentEdit.subjectTeachers,{subject:"",tutorId:""}]})}>+ Ещё предмет</button>
              </div>

              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10 }}>
                <div>
                  <div style={{ fontSize:12, color:"#55677a", marginBottom:6 }}>Статус</div>
                  <select value={nStudentEdit.status} onChange={e=>setNStudentEdit({...nStudentEdit,status:e.target.value})}>
                    {Object.entries(statusCfg).map(([k,v])=><option key={k} value={k}>{v.label}</option>)}
                  </select>
                </div>
                <div>
                  <div style={{ fontSize:12, color:"#55677a", marginBottom:6 }}>Условия оплаты</div>
                  <input placeholder="напр. 5000₽/мес" value={nStudentEdit.tuitionNote} onChange={e=>setNStudentEdit({...nStudentEdit,tuitionNote:e.target.value})} />
                </div>
              </div>
              <div><div style={{ fontSize:12, color:"#55677a", marginBottom:6 }}>Примечания</div><textarea rows={2} value={nStudentEdit.notes} onChange={e=>setNStudentEdit({...nStudentEdit,notes:e.target.value})} /></div>

              <div style={{ display:"flex", gap:10, marginTop:8 }}>
                <button className="bp" style={{ flex:1 }} onClick={saveEditStudent}>Сохранить</button>
                <button className="bg" onClick={()=>{ setModal(null); setEditingStudentId(null); setNStudentEdit(null); }}>Отмена</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {modal==="addLesson" && (
        <div className="ov" onClick={()=>{ setModal(null); setRecurModal(false); setLessonType("individual"); setGroupStudents([]); setGroupName(""); setLessonStudentLocked(false); }}>
          <div className="mo" style={{ width:580, maxHeight:"92vh", overflowY:"auto" }} onClick={e=>e.stopPropagation()}>

            {/* ── TYPE SWITCHER ── */}
            <div style={{ display:"flex", gap:0, marginBottom:20, background:"#f2f6fa", borderRadius:12, padding:4 }}>
              {[["individual","👤 Индивидуальное"],["group","👥 Групповое"]].map(([k,l])=>(
                <button key={k} onClick={()=>{ setLessonType(k); setGroupStudents([]); }}
                  style={{ flex:1, padding:"10px", borderRadius:9, fontSize:13, fontWeight:700, border:"none", cursor:"pointer", fontFamily:"inherit", transition:"all .2s",
                    background:lessonType===k?"linear-gradient(135deg,#1da0d4,#5cb85c)":"transparent",
                    color:lessonType===k?"white":"#55677a" }}>{l}</button>
              ))}
            </div>

            <h2 style={{ margin:"0 0 18px", fontSize:18, fontWeight:700 }}>
              {lessonType==="group" ? "👥 Новое групповое занятие" : "👤 Новое индивидуальное занятие"}
            </h2>

            <div style={{ display:"grid", gap:13 }}>

              {/* TUTOR */}
              <div><div style={{ fontSize:12, color:"#55677a", marginBottom:6 }}>Преподаватель *</div>
                <div style={{ display:"flex", gap:8, flexWrap:"wrap" }}>
                  {tutors.map(t=>(
                    <button key={t.id} onClick={()=>setNLesson({...nLesson,tutorId:String(t.id)})}
                      style={{ display:"flex", alignItems:"center", gap:7, padding:"7px 12px", borderRadius:10, fontSize:12, border:"1px solid", cursor:"pointer", fontFamily:"inherit", transition:"all .15s",
                        background:nLesson.tutorId===String(t.id)?`${t.color}22`:"transparent",
                        borderColor:nLesson.tutorId===String(t.id)?t.color:"#d7e2ee",
                        color:nLesson.tutorId===String(t.id)?t.color:"#55677a" }}>
                      <div style={{ width:8,height:8,borderRadius:"50%",background:t.color }} />{t.short}
                    </button>
                  ))}
                </div>
              </div>

              {/* SUBJECT + PRICE */}
              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12 }}>
                <div><div style={{ fontSize:12, color:"#55677a", marginBottom:6 }}>Предмет / курс *</div>
                  <select value={nLesson.subject} onChange={e=>setNLesson({...nLesson,subject:e.target.value})}>
                    <option value="">Выберите курс</option>
                    {catalogGrouped.map(cat=>(
                      <optgroup key={cat.id} label={cat.label}>
                        {cat.courses.map(c=><option key={c} value={c}>{c}</option>)}
                      </optgroup>
                    ))}
                  </select>
                </div>
                {lessonType==="individual" && (
                  <div><div style={{ fontSize:12, color:"#55677a", marginBottom:6 }}>Стоимость (₽)</div>
                    <input type="number" value={nLesson.price} onChange={e=>setNLesson({...nLesson,price:e.target.value})} />
                    {nLesson.tutorId && nLesson.price && (
                      <div style={{ fontSize:11, color:"#5cb85c", marginTop:4 }}>
                        → педагог: {calcEarning({price:Number(nLesson.price)}, tutors.find(t=>t.id===Number(nLesson.tutorId)))}₽
                      </div>
                    )}
                  </div>
                )}
                {lessonType==="group" && (
                  <div><div style={{ fontSize:12, color:"#55677a", marginBottom:6 }}>Название группы</div>
                    <input placeholder="напр. Группа ОГЭ Пн" value={groupName} onChange={e=>setGroupName(e.target.value)} />
                  </div>
                )}
              </div>

              {/* DATE / TIME / DURATION */}
              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:12 }}>
                <div><div style={{ fontSize:12, color:"#55677a", marginBottom:6 }}>Дата *</div>
                  <input type="date" value={nLesson.date} onChange={e=>setNLesson({...nLesson,date:e.target.value})} />
                </div>
                <div><div style={{ fontSize:12, color:"#55677a", marginBottom:6 }}>Время</div>
                  <input type="time" value={nLesson.time} onChange={e=>setNLesson({...nLesson,time:e.target.value})} />
                </div>
                <div><div style={{ fontSize:12, color:"#55677a", marginBottom:6 }}>Длительность</div>
                  <div style={{ display:"flex", gap:4, flexWrap:"wrap" }}>
                    {[45,60,90,120].map(d=>(
                      <button key={d} onClick={()=>setNLesson({...nLesson,duration:d})}
                        style={{ padding:"5px 8px", borderRadius:7, fontSize:11, border:"1px solid", cursor:"pointer", fontFamily:"inherit",
                          background:Number(nLesson.duration)===d?"rgba(99,102,241,0.25)":"transparent",
                          borderColor:Number(nLesson.duration)===d?"#1da0d4":"#d7e2ee",
                          color:Number(nLesson.duration)===d?"#1da0d4":"#55677a" }}>{d}м</button>
                    ))}
                  </div>
                </div>
              </div>

              {/* ── CONFLICT WARNING ── */}
              {(() => {
                if (!nLesson.tutorId || !nLesson.date || !nLesson.time) return null;
                const [h, m] = nLesson.time.split(":").map(Number);
                const startMin = h*60+m;
                const endMin = startMin + Number(nLesson.duration||60);
                const conflicts = lessons.filter(l => {
                  if (l.tutorId !== Number(nLesson.tutorId)) return false;
                  if (l.date !== nLesson.date) return false;
                  if (["cancelled","noshow_burned","sick_valid","sick_invalid"].includes(l.status)) return false;
                  if (!l.time) return false;
                  const [lh, lm] = l.time.split(":").map(Number);
                  const lStart = lh*60+lm;
                  const lEnd = lStart + Number(l.duration||60);
                  return startMin < lEnd && endMin > lStart;
                });
                if (conflicts.length===0) return null;
                return (
                  <div style={{ background:"rgba(226,87,76,0.08)", border:"1px solid rgba(226,87,76,0.3)", borderRadius:10, padding:"10px 14px", fontSize:12, color:"#e2574c" }}>
                    ⚠️ У этого преподавателя уже есть занятие в это время: {conflicts.map(c=>`${c.time} — ${c.studentName||c.groupName}`).join(", ")}. Проверьте, не пересекается ли расписание.
                  </div>
                );
              })()}

              {lessonType==="individual" && (
                <div><div style={{ fontSize:12, color:"#55677a", marginBottom:6 }}>Ученик *</div>
                  {lessonStudentLocked && nLesson.studentId ? (
                    (() => {
                      const st = students.find(s=>s.id===Number(nLesson.studentId));
                      return (
                        <div style={{ display:"flex", alignItems:"center", gap:10, background:"#f2f6fa", border:"1px solid #dbe6f0", borderRadius:10, padding:"9px 14px" }}>
                          <Av name={st?.name||"?"} color="#1da0d4" size={28} />
                          <div style={{ fontWeight:700, fontSize:14 }}>{st?.name}</div>
                        </div>
                      );
                    })()
                  ) : (
                    <select value={nLesson.studentId} onChange={e=>setNLesson({...nLesson,studentId:e.target.value})}>
                      <option value="">Выберите ученика</option>
                      {students.map(s=><option key={s.id} value={s.id}>{s.name} {s.school?`· ${s.school}`:""}</option>)}
                    </select>
                  )}
                  {nLesson.studentId && (()=>{
                    const st = students.find(s=>s.id===Number(nLesson.studentId));
                    if (!st) return null;
                    return (
                      <div style={{ marginTop:6, fontSize:12, color:"#55677a", display:"flex", alignItems:"center", gap:6 }}>
                        <Phone size={12} color="#1da0d4" />
                        {st.parentName ? `${st.parentName}: ` : "Родитель: "}
                        <a href={`tel:${st.parentPhone||st.phone}`} style={{ color:"#1da0d4", fontWeight:600, textDecoration:"none" }}>{st.parentPhone||st.phone||"не указан"}</a>
                      </div>
                    );
                  })()}
                </div>
              )}

              {/* ── GROUP: multiple students with individual prices ── */}
              {lessonType==="group" && (
                <div>
                  <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:8 }}>
                    <div style={{ fontSize:12, color:"#55677a" }}>Ученики группы ({groupStudents.length})</div>
                    <div style={{ fontSize:11, color:"#7a8a9c" }}>Суммарно: {groupStudents.reduce((s,g)=>s+Number(g.price||0),0).toLocaleString("ru")}₽</div>
                  </div>
                  {/* added students */}
                  {groupStudents.map((gs,i)=>{
                    const st = students.find(s=>s.id===Number(gs.studentId));
                    return (
                      <div key={i} style={{ display:"flex", alignItems:"center", gap:8, padding:"7px 10px", background:"#f2f6fa", borderRadius:9, marginBottom:6, border:"1px solid #d7e2ee" }}>
                        <Av name={st?.name||"?"} color="#1da0d4" size={26} />
                        <div style={{ flex:1, minWidth:0 }}>
                          <div style={{ fontSize:13, fontWeight:600 }}>{st?.name||"—"}</div>
                          {st?.parentPhone || st?.phone ? <div style={{ fontSize:10, color:"#7a8a9c" }}>{st.parentPhone||st.phone}</div> : null}
                        </div>
                        <div style={{ width:90 }}>
                          <input type="number" value={gs.price} placeholder="Цена" onChange={e=>{ const ng=[...groupStudents]; ng[i]={...ng[i],price:e.target.value}; setGroupStudents(ng); }}
                            style={{ fontSize:12, padding:"4px 8px" }} />
                        </div>
                        <span style={{ fontSize:11, color:"#7a8a9c" }}>₽</span>
                        <button onClick={()=>setGroupStudents(groupStudents.filter((_,j)=>j!==i))}
                          style={{ background:"rgba(239,68,68,0.1)", border:"1px solid rgba(239,68,68,0.2)", color:"#e2574c", padding:"3px 8px", borderRadius:6, cursor:"pointer", fontSize:12, fontFamily:"inherit" }}>✗</button>
                      </div>
                    );
                  })}
                  {/* add student selector */}
                  <div style={{ display:"flex", gap:8 }}>
                    <select onChange={e=>{ if(!e.target.value) return; const sid=e.target.value; if(groupStudents.find(g=>g.studentId===sid)) return; const p=pricing.find(pr=>pr.course===nLesson.subject); setGroupStudents([...groupStudents,{studentId:sid,price:p?.groupPrice||400}]); e.target.value=""; }}
                      style={{ flex:1, fontSize:13 }}>
                      <option value="">+ Добавить ученика в группу...</option>
                      {students.filter(s=>!groupStudents.find(g=>g.studentId===String(s.id))).map(s=>(
                        <option key={s.id} value={s.id}>{s.name} {s.school?`· ${s.school}`:""}</option>
                      ))}
                    </select>
                  </div>
                  <div style={{ fontSize:11, color:"#7a8a9c", marginTop:6 }}>
                    💡 Цена берётся автоматически из прайса. Можно изменить для каждого ученика отдельно.
                  </div>
                </div>
              )}

              {/* ── RECURRING ── */}
              <div style={{ background:"#f2f6fa", borderRadius:12, padding:"12px 14px" }}>
                <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between" }}>
                  <div>
                    <div style={{ fontSize:14, fontWeight:700, display:"flex", alignItems:"center", gap:6 }}><Calendar size={15} color="#1da0d4" /> Повторяющееся занятие</div>
                    <div style={{ fontSize:11, color:"#7a8a9c", marginTop:2 }}>Создать серию занятий</div>
                  </div>
                  <div onClick={()=>setRecurModal(r=>!r)} style={{ width:40, height:22, borderRadius:11, background:recurModal?"#1da0d4":"#d7e2ee", cursor:"pointer", transition:"all .2s", position:"relative", flexShrink:0 }}>
                    <div style={{ position:"absolute", top:3, left:recurModal?20:3, width:16, height:16, borderRadius:"50%", background:"white", transition:"all .2s" }} />
                  </div>
                </div>
                {recurModal && (
                  <div style={{ marginTop:12, display:"grid", gap:10 }}>
                    <div>
                      <div style={{ fontSize:11, color:"#55677a", marginBottom:5 }}>Дни недели</div>
                      <div style={{ display:"flex", gap:5, flexWrap:"wrap" }}>
                        {["Пн","Вт","Ср","Чт","Пт","Сб","Вс"].map((d,idx)=>(
                          <button key={idx} onClick={()=>setRecurWeekdays(prev=>prev.includes(idx)?prev.filter(x=>x!==idx):[...prev,idx])}
                            style={{ width:38, padding:"6px 0", borderRadius:7, fontSize:12, border:"1px solid", cursor:"pointer", fontFamily:"inherit", fontWeight:600,
                              background:recurWeekdays.includes(idx)?"#1da0d4":"transparent",
                              borderColor:recurWeekdays.includes(idx)?"#1da0d4":"#d7e2ee",
                              color:recurWeekdays.includes(idx)?"#ffffff":"#55677a" }}>{d}</button>
                        ))}
                      </div>
                      <div style={{ fontSize:10, color:"#a9b8c6", marginTop:4 }}>Например, выберите Вт и Чт — занятия создадутся на каждый такой день в периоде ниже</div>
                    </div>
                    <div>
                      <div style={{ fontSize:11, color:"#55677a", marginBottom:5 }}>Период — до какой даты</div>
                      <div style={{ display:"flex", gap:5, flexWrap:"wrap", marginBottom:6 }}>
                        {[["2 недели",14],["1 месяц",30],["2 месяца",60],["3 месяца",90]].map(([label,days])=>(
                          <button key={days} onClick={()=>{
                            if (!nLesson.date) return;
                            const d = new Date(nLesson.date); d.setDate(d.getDate()+days);
                            setRecurEndDate(d.toISOString().split("T")[0]);
                          }}
                            style={{ padding:"4px 10px", borderRadius:7, fontSize:12, border:"1px solid #d7e2ee", cursor:"pointer", fontFamily:"inherit", background:"transparent", color:"#55677a" }}>{label}</button>
                        ))}
                      </div>
                      <input type="date" value={recurEndDate} onChange={e=>setRecurEndDate(e.target.value)} />
                    </div>
                    {nLesson.date && recurEndDate && recurWeekdays.length>0 && (()=>{
                      const start = new Date(nLesson.date), end = new Date(recurEndDate);
                      let cnt = 0;
                      for (let d=new Date(start); d<=end; d.setDate(d.getDate()+1)) {
                        const wd = (d.getDay()+6)%7; // Monday-first
                        if (recurWeekdays.includes(wd)) cnt++;
                      }
                      return (
                        <div style={{ background:"rgba(29,160,212,0.08)", borderRadius:8, padding:"8px 12px", fontSize:11, color:"#1da0d4" }}>
                          Будет создано занятий: {cnt} — с {nLesson.date} по {recurEndDate}
                        </div>
                      );
                    })()}
                  </div>
                )}
              </div>

              {/* ACTION BUTTONS */}
              <div style={{ display:"flex", gap:10, marginTop:4 }}>
                <button className="bp" style={{ flex:1 }} onClick={()=>{
                  if (!nLesson.subject || !nLesson.date || !nLesson.tutorId) return;
                  const tu = tutors.find(t=>t.id===Number(nLesson.tutorId));
                  const baseLesson = { subject:nLesson.subject, tutorId:Number(nLesson.tutorId), tutorShort:tu?.short||"", date:nLesson.date, time:nLesson.time, duration:Number(nLesson.duration), status:"scheduled" };

                  // Generate all matching dates between nLesson.date and recurEndDate for the chosen weekdays
                  const getRecurDates = () => {
                    if (!recurEndDate || recurWeekdays.length===0) return [nLesson.date];
                    const dates = [];
                    const start = new Date(nLesson.date), end = new Date(recurEndDate);
                    for (let d=new Date(start); d<=end; d.setDate(d.getDate()+1)) {
                      const wd = (d.getDay()+6)%7; // Monday-first
                      if (recurWeekdays.includes(wd)) dates.push(new Date(d).toISOString().split("T")[0]);
                    }
                    return dates.length ? dates : [nLesson.date];
                  };

                  if (lessonType==="group") {
                    if (groupStudents.length===0) return;
                    const groupId = Date.now();
                    const name = groupName || `Группа ${nLesson.subject} ${nLesson.time}`;
                    const newLessons = groupStudents.map((gs,i) => {
                      const st = students.find(s=>s.id===Number(gs.studentId));
                      return { ...baseLesson, id:groupId+i, studentId:Number(gs.studentId), studentName:st?.name||"", price:Number(gs.price||0), isGroup:true, groupId, groupName:name };
                    });
                    if (recurModal) {
                      const recurDates = getRecurDates();
                      const all = [];
                      recurDates.forEach((dateStr,ri)=>{
                        const gid = groupId + ri*1000;
                        newLessons.forEach((l,li)=>{ all.push({...l, id:gid+li, date:dateStr, groupId:gid}); });
                      });
                      setLessons(prev=>[...prev,...all]);
                      insertRows("lessons", all);
                      notify(`Создано ${recurDates.length} занятий × ${groupStudents.length} учеников`);
                    } else {
                      setLessons(prev=>[...prev,...newLessons]);
                      insertRows("lessons", newLessons);
                      notify(`Группа "${name}" добавлена (${groupStudents.length} чел.)`);
                    }
                  } else {
                    if (!nLesson.studentId) return;
                    const st = students.find(s=>s.id===Number(nLesson.studentId));
                    const lesson = { ...baseLesson, id:Date.now(), studentId:Number(nLesson.studentId), studentName:st?.name||"", price:Number(nLesson.price), isGroup:false };
                    if (recurModal) {
                      const recurDates = getRecurDates();
                      const all = recurDates.map((dateStr,i)=>({ ...lesson, id:Date.now()+i, date:dateStr }));
                      setLessons(prev=>[...prev,...all]);
                      insertRows("lessons", all);
                      notify(`Создано ${recurDates.length} занятий`);
                    } else {
                      setLessons(prev=>[...prev,lesson]);
                      insertRow("lessons", lesson);
                      notify("Занятие добавлено");
                    }
                  }
                  setNLesson({ studentId:"", subject:"", tutorId:"", date:"", time:"", duration:60, price:1200 });
                  setGroupStudents([]); setGroupName(""); setRecurModal(false); setLessonType("individual");
                  setRecurWeekdays([]); setRecurEndDate(""); setLessonStudentLocked(false);
                  setModal(null);
                }}>
                  {lessonType==="group"
                    ? (recurModal ? `🔁 Создать серию для группы (${groupStudents.length} уч.)` : `👥 Создать групповое (${groupStudents.length} уч.)`)
                    : (recurModal ? "🔁 Создать серию занятий" : "👤 Добавить занятие")}
                </button>
                <button className="bg" onClick={()=>{ setModal(null); setRecurModal(false); setLessonType("individual"); setGroupStudents([]); setGroupName(""); setLessonStudentLocked(false); }}>Отмена</button>
              </div>
            </div>
          </div>
        </div>
      )}

            {modal==="addPayment" && (
        <div className="ov" onClick={()=>setModal(null)}>
          <div className="mo" onClick={e=>e.stopPropagation()}>
            <h2 style={{ margin:"0 0 22px", fontSize:20, fontWeight:700 }}>Записать оплату</h2>
            <div style={{ display:"grid", gap:14 }}>
              <div><div style={{ fontSize:12, color:"#55677a", marginBottom:6 }}>Ученик *</div>
                <select value={nPayment.studentId} onChange={e=>setNPayment({...nPayment,studentId:e.target.value})}>
                  <option value="">Выберите</option>
                  {students.map(s=><option key={s.id} value={s.id}>{s.name} (баланс: {s.balance}₽)</option>)}
                </select>
              </div>
              <div><div style={{ fontSize:12, color:"#55677a", marginBottom:6 }}>Сумма (₽) *</div><input type="number" value={nPayment.amount} onChange={e=>setNPayment({...nPayment,amount:e.target.value})} /></div>
              <div><div style={{ fontSize:12, color:"#55677a", marginBottom:6 }}>Способ</div>
                <select value={nPayment.method} onChange={e=>setNPayment({...nPayment,method:e.target.value})}>
                  <option value="card">💳 Карта</option>
                  <option value="cash">💵 Наличные</option>
                  <option value="transfer">📱 Перевод</option>
                </select>
              </div>
              <div><div style={{ fontSize:12, color:"#55677a", marginBottom:6 }}>Комментарий</div><input value={nPayment.comment} onChange={e=>setNPayment({...nPayment,comment:e.target.value})} /></div>
              <div style={{ display:"flex", gap:10, marginTop:8 }}>
                <button className="bp" style={{ flex:1 }} onClick={addPayment}>Записать</button>
                <button className="bg" onClick={()=>setModal(null)}>Отмена</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {modal==="addSalary" && (
        <div className="ov" onClick={()=>setModal(null)}>
          <div className="mo" onClick={e=>e.stopPropagation()}>
            <h2 style={{ margin:"0 0 8px", fontSize:20, fontWeight:700 }}>Выплата зарплаты</h2>
            {nSalary.tutorId && (()=>{ const t=tutors.find(x=>x.id===Number(nSalary.tutorId)); const d=t?tDebt(t.id):0; return t?(
              <div style={{ background:"rgba(245,158,11,0.08)", border:"1px solid rgba(245,158,11,0.2)", borderRadius:10, padding:"12px 14px", marginBottom:18, fontSize:13 }}>
                <div style={{ fontWeight:600, marginBottom:2 }}>{t.short}</div>
                <div style={{ color:"#f5a623" }}>К выплате: <strong>{d.toLocaleString("ru")}₽</strong></div>
              </div>
            ):null; })()}
            <div style={{ display:"grid", gap:14 }}>
              <div><div style={{ fontSize:12, color:"#55677a", marginBottom:6 }}>Преподаватель *</div>
                <select value={nSalary.tutorId} onChange={e=>setNSalary({...nSalary,tutorId:e.target.value})}>
                  <option value="">Выберите</option>
                  {tutors.map(t=><option key={t.id} value={t.id}>{t.short} (к выплате: {tDebt(t.id)}₽)</option>)}
                </select>
              </div>
              <div><div style={{ fontSize:12, color:"#55677a", marginBottom:6 }}>Сумма (₽) *</div><input type="number" value={nSalary.amount} onChange={e=>setNSalary({...nSalary,amount:e.target.value})} /></div>
              <div><div style={{ fontSize:12, color:"#55677a", marginBottom:6 }}>Месяц</div><input type="month" value={nSalary.month} onChange={e=>setNSalary({...nSalary,month:e.target.value})} /></div>
              <div><div style={{ fontSize:12, color:"#55677a", marginBottom:6 }}>Комментарий</div><input value={nSalary.comment} onChange={e=>setNSalary({...nSalary,comment:e.target.value})} /></div>
              <div style={{ display:"flex", gap:10, marginTop:8 }}>
                <button className="bp" style={{ flex:1 }} onClick={addSalary}>Выплатить</button>
                <button className="bg" onClick={()=>setModal(null)}>Отмена</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {modal==="mailing" && (
        <div className="ov" onClick={()=>{ setModal(null); setMStep(1); }}>
          <div className="mo" style={{ width:560 }} onClick={e=>e.stopPropagation()}>
            <div style={{ display:"flex", gap:8, marginBottom:24 }}>
              {["Составить","Предпросмотр","Отправить"].map((s,i)=>(
                <div key={i} style={{ display:"flex", alignItems:"center", gap:8 }}>
                  <div style={{ width:24, height:24, borderRadius:"50%", display:"flex", alignItems:"center", justifyContent:"center", fontSize:11, fontWeight:700,
                    background:mStep>i+1?"#5cb85c":mStep===i+1?"#1da0d4":"#dbe6f0", color:mStep>=i+1?"white":"#7a8a9c" }}>{mStep>i+1?"✓":i+1}</div>
                  <span style={{ fontSize:12, color:mStep===i+1?"#22344a":"#7a8a9c", fontWeight:mStep===i+1?600:400 }}>{s}</span>
                  {i<2 && <span style={{ color:"#d7e2ee", fontSize:16, marginLeft:4 }}>›</span>}
                </div>
              ))}
            </div>
            {mStep===1 && (
              <div>
                <h2 style={{ margin:"0 0 20px", fontSize:18, fontWeight:700 }}>Новая рассылка</h2>
                <div style={{ display:"grid", gap:14 }}>
                  <div><div style={{ fontSize:12, color:"#55677a", marginBottom:6 }}>Название</div><input value={mDraft.title} onChange={e=>setMDraft({...mDraft,title:e.target.value})} /></div>
                  <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12 }}>
                    <div>
                      <div style={{ fontSize:12, color:"#55677a", marginBottom:6 }}>Канал</div>
                      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:6 }}>
                        {Object.entries(channelCfg).map(([k,v])=>(
                          <button key={k} onClick={()=>setMDraft({...mDraft,channel:k})}
                            style={{ padding:"7px", borderRadius:9, fontSize:11, border:"1px solid", cursor:"pointer",
                              background:mDraft.channel===k?`${v.color}22`:"transparent",
                              borderColor:mDraft.channel===k?v.color:"#d7e2ee",
                              color:mDraft.channel===k?v.color:"#55677a" }}>{v.icon} {v.label}</button>
                        ))}
                      </div>
                    </div>
                    <div>
                      <div style={{ fontSize:12, color:"#55677a", marginBottom:6 }}>Аудитория</div>
                      <div style={{ display:"flex", flexDirection:"column", gap:5, maxHeight:210, overflowY:"auto" }}>
                        {Object.entries(audLabels).map(([k,v])=>(
                          <button key={k} onClick={()=>setMDraft({...mDraft,audience:k})}
                            style={{ padding:"6px 10px", borderRadius:8, fontSize:11, border:"1px solid", cursor:"pointer", textAlign:"left", display:"flex", alignItems:"center", gap:6,
                              background:mDraft.audience===k?"rgba(99,102,241,0.2)":"#f2f6fa",
                              borderColor:mDraft.audience===k?"#1da0d4":"#d7e2ee",
                              color:mDraft.audience===k?"#1da0d4":"#55677a" }}>
                            {audIcons[k]} <span style={{ flex:1 }}>{v}</span>
                            <span style={{ background:"#d7e2ee", color:"#7a8a9c", borderRadius:10, padding:"1px 5px", fontSize:10, fontWeight:700 }}>{audMap[k]?.length||0}</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                  <div>
                    <div style={{ fontSize:12, color:"#55677a", marginBottom:6 }}>Текст</div>
                    <textarea rows={4} value={mDraft.text} onChange={e=>setMDraft({...mDraft,text:e.target.value})} style={{ resize:"vertical", lineHeight:1.6 }} />
                    <div style={{ fontSize:11, color:"#7a8a9c", marginTop:5 }}>
                      Переменные: <span style={{ color:"#1da0d4" }}>{"{{studentName}}"}</span> · <span style={{ color:"#1da0d4" }}>{"{{parentName}}"}</span> · <span style={{ color:"#1da0d4" }}>{"{{balance}}"}</span>
                    </div>
                  </div>
                  <div style={{ display:"flex", gap:10 }}>
                    <button className="bp" style={{ flex:1 }} disabled={!mDraft.text||!mDraft.title} onClick={()=>setMStep(2)}>Предпросмотр →</button>
                    <button className="bg" onClick={()=>{ setModal(null); setMStep(1); }}>Отмена</button>
                  </div>
                </div>
              </div>
            )}
            {mStep===2 && (
              <div>
                <h2 style={{ margin:"0 0 6px", fontSize:18, fontWeight:700 }}>Предпросмотр</h2>
                <div style={{ color:"#7a8a9c", fontSize:13, marginBottom:14 }}>{channelCfg[mDraft.channel]?.icon} {channelCfg[mDraft.channel]?.label} · {audMap[mDraft.audience]?.length||0} получателей</div>
                <div style={{ maxHeight:320, overflowY:"auto", display:"flex", flexDirection:"column", gap:8 }}>
                  {(audMap[mDraft.audience]||[]).length===0
                    ? <div style={{ textAlign:"center", color:"#7a8a9c", padding:"30px 0" }}>Нет получателей</div>
                    : (audMap[mDraft.audience]||[]).map(s=>(
                      <div key={s.id} style={{ background:"#f2f6fa", borderRadius:12, padding:12 }}>
                        <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:8 }}>
                          <Av name={s.name} color="#1da0d4" size={26} />
                          <div style={{ fontSize:12, fontWeight:600 }}>{s.name} <span style={{ color:"#7a8a9c", fontWeight:400 }}>· {s.phone}</span></div>
                        </div>
                        <div style={{ fontSize:12, color:"#6d7f92", background:"#ffffff", borderRadius:8, padding:"9px 12px", lineHeight:1.6 }}>{renderText(mDraft.text,s)}</div>
                      </div>
                    ))
                  }
                </div>
                <div style={{ display:"flex", gap:10, marginTop:14 }}>
                  <button className="bp" style={{ flex:1 }} onClick={()=>setMStep(3)}>Всё верно →</button>
                  <button className="bg" onClick={()=>setMStep(1)}>← Назад</button>
                </div>
              </div>
            )}
            {mStep===3 && (
              <div style={{ textAlign:"center", padding:"20px 0" }}>
                <div style={{ fontSize:52, marginBottom:14 }}>🚀</div>
                <h2 style={{ margin:"0 0 10px", fontSize:20, fontWeight:700 }}>Подтвердите отправку</h2>
                <div style={{ color:"#55677a", fontSize:14, marginBottom:24 }}>
                  Будет отправлено <span style={{ color:"#1da0d4", fontWeight:700 }}>{audMap[mDraft.audience]?.length||0} сообщений</span> через {channelCfg[mDraft.channel]?.label}.
                </div>
                <div style={{ display:"flex", gap:10, justifyContent:"center" }}>
                  <button className="bp" style={{ minWidth:160 }} onClick={sendMailing}>📤 Отправить</button>
                  <button className="bg" onClick={()=>setMStep(2)}>← Назад</button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}


      {/* ── ADD REQUEST MODAL ── */}
      {modal==="addRequest" && (
        <div className="ov" onClick={()=>setModal(null)}>
          <div className="mo" style={{ width:520 }} onClick={e=>e.stopPropagation()}>
            <h2 style={{ margin:"0 0 20px", fontSize:20, fontWeight:700 }}>📩 Новый запрос от родителя</h2>
            <div style={{ display:"grid", gap:14 }}>
              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12 }}>
                <div><div style={{ fontSize:12, color:"#55677a", marginBottom:6 }}>ФИО родителя *</div><input placeholder="Иванова Мария" value={nRequest.parentName} onChange={e=>setNRequest({...nRequest,parentName:e.target.value})} /></div>
                <div><div style={{ fontSize:12, color:"#55677a", marginBottom:6 }}>Телефон *</div><input placeholder="+7 900 000-00-00" value={nRequest.phone} onChange={e=>setNRequest({...nRequest,phone:e.target.value})} /></div>
              </div>
              {nRequest.children.map((child, ci) => (
                <div key={ci} style={{ border:"1px solid #e7eef5", borderRadius:12, padding:12, background:"#f8fafc" }}>
                  <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:8 }}>
                    <div style={{ fontSize:12, fontWeight:700, color:"#1da0d4" }}>Ребёнок {ci+1}</div>
                    {nRequest.children.length>1 && (
                      <button onClick={()=>setNRequest({...nRequest, children: nRequest.children.filter((_,j)=>j!==ci)})}
                        style={{ background:"rgba(226,87,76,0.1)", border:"1px solid rgba(226,87,76,0.2)", color:"#e2574c", borderRadius:6, padding:"3px 8px", cursor:"pointer", fontSize:11 }}><X size={12} /> Убрать</button>
                    )}
                  </div>
                  <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12, marginBottom:10 }}>
                    <div><div style={{ fontSize:12, color:"#55677a", marginBottom:6 }}>Имя ребёнка</div>
                      <input placeholder="Иванов Артём" value={child.studentName} onChange={e=>{ const arr=[...nRequest.children]; arr[ci]={...arr[ci],studentName:e.target.value}; setNRequest({...nRequest,children:arr}); }} />
                    </div>
                    <div><div style={{ fontSize:12, color:"#55677a", marginBottom:6 }}>Класс</div>
                      <input placeholder="4 класс" value={child.grade} onChange={e=>{ const arr=[...nRequest.children]; arr[ci]={...arr[ci],grade:e.target.value}; setNRequest({...nRequest,children:arr}); }} />
                    </div>
                  </div>
                  <div style={{ fontSize:12, color:"#55677a", marginBottom:6 }}>Предметы и педагоги</div>
                  {child.subjectTeachers.map((st,si)=>(
                    <div key={si} style={{ display:"flex", gap:8, marginBottom:6 }}>
                      <select value={st.subject} onChange={e=>{ const arr=[...nRequest.children]; const sts=[...arr[ci].subjectTeachers]; sts[si]={...sts[si],subject:e.target.value}; arr[ci]={...arr[ci],subjectTeachers:sts}; setNRequest({...nRequest,children:arr}); }}>
                        <option value="">Предмет...</option>
                        {catalogGrouped.map(cat=>(
                          <optgroup key={cat.id} label={cat.label}>
                            {cat.courses.map(c=><option key={c} value={c}>{c}</option>)}
                          </optgroup>
                        ))}
                      </select>
                      <select value={st.tutorId} onChange={e=>{ const arr=[...nRequest.children]; const sts=[...arr[ci].subjectTeachers]; sts[si]={...sts[si],tutorId:e.target.value}; arr[ci]={...arr[ci],subjectTeachers:sts}; setNRequest({...nRequest,children:arr}); }}>
                        <option value="">Педагог...</option>
                        {tutors.map(t=><option key={t.id} value={t.id}>{t.name}</option>)}
                      </select>
                      {child.subjectTeachers.length>1 && (
                        <button onClick={()=>{ const arr=[...nRequest.children]; arr[ci]={...arr[ci],subjectTeachers:arr[ci].subjectTeachers.filter((_,j)=>j!==si)}; setNRequest({...nRequest,children:arr}); }}
                          style={{ background:"rgba(226,87,76,0.1)", border:"1px solid rgba(226,87,76,0.2)", color:"#e2574c", borderRadius:6, padding:"4px 8px", cursor:"pointer", flexShrink:0 }}><X size={13} /></button>
                      )}
                    </div>
                  ))}
                  <button className="bg" style={{ fontSize:11 }} onClick={()=>{ const arr=[...nRequest.children]; arr[ci]={...arr[ci],subjectTeachers:[...arr[ci].subjectTeachers,{subject:"",tutorId:""}]}; setNRequest({...nRequest,children:arr}); }}><Plus size={12} /> Ещё предмет</button>
                </div>
              ))}
              <button className="bg" onClick={()=>setNRequest({...nRequest, children:[...nRequest.children, { studentName:"", grade:"", subjectTeachers:[{ subject:"", tutorId:"" }] }]})}>
                <UserPlus size={14} /> Ещё один ребёнок из этой семьи
              </button>
              <div><div style={{ fontSize:12, color:"#55677a", marginBottom:6 }}>Комментарий / пожелания</div>
                <textarea rows={3} placeholder="Опишите запрос родителя..." value={nRequest.comment} onChange={e=>setNRequest({...nRequest,comment:e.target.value})} />
              </div>
              <div><div style={{ fontSize:12, color:"#55677a", marginBottom:6 }}>Статус</div>
                <select value={nRequest.status} onChange={e=>setNRequest({...nRequest,status:e.target.value})}>
                  <option value="new">Новый</option>
                  <option value="contacted">Связались</option>
                  <option value="trial">Пробное</option>
                  <option value="enrolled">Записан</option>
                  <option value="rejected">Отказался</option>
                </select>
              </div>
              <div style={{ display:"flex", gap:10, marginTop:4 }}>
                <button className="bp" style={{ flex:1 }} onClick={()=>{
                  if(!nRequest.parentName||!nRequest.phone)return;
                  const validChildren = nRequest.children.filter(c=>c.studentName);
                  if (validChildren.length===0) return;
                  const dateStr = new Date().toISOString().split("T")[0];
                  const newRows = validChildren.map((c,i)=>({
                    id: Date.now()+i, parentName: nRequest.parentName, phone: nRequest.phone,
                    studentName: c.studentName, grade: c.grade,
                    subjectTeachers: c.subjectTeachers.filter(st=>st.subject),
                    comment: nRequest.comment, status: nRequest.status,
                    date: dateStr, assignedTutorId: null,
                  }));
                  setRequests([...newRows, ...requests]);
                  setNRequest({ parentName:"", phone:"", comment:"", status:"new", children:[{ studentName:"", grade:"", subjectTeachers:[{ subject:"", tutorId:"" }] }] });
                  setModal(null);
                  notify(newRows.length>1 ? `Добавлено заявок: ${newRows.length}` : "Запрос добавлен");
                }}>Добавить запрос</button>
                <button className="bg" onClick={()=>setModal(null)}>Отмена</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── ОБЛАЧНЫЕ КОПИИ — СПИСОК ── */}
      {showBackups && (
        <div className="ov" onClick={()=>setShowBackups(false)}>
          <div className="mo" style={{ width:560, maxHeight:"85vh", overflowY:"auto" }} onClick={e=>e.stopPropagation()}>
            <h2 style={{ margin:"0 0 8px", fontSize:19, fontWeight:700 }}>☁️ Резервные копии в облаке</h2>
            <div style={{ fontSize:12, color:"#7a8a9c", marginBottom:16 }}>
              Хранятся последние 30 копий. Автосохранение происходит каждые 24 часа.
            </div>
            {backupList.length===0 ? (
              <div style={{ padding:"40px", textAlign:"center", color:"#a9b8c6" }}>Копий пока нет — нажмите «Сохранить копию в облако»</div>
            ) : (
              <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
                {backupList.map(b=>(
                  <div key={b.id} style={{ display:"flex", justifyContent:"space-between", alignItems:"center", gap:10, border:"1px solid #dbe6f0", borderRadius:10, padding:"12px 14px" }}>
                    <div>
                      <div style={{ fontSize:13, fontWeight:600, color:"#12283d" }}>{b.label}</div>
                      <div style={{ fontSize:11, color:"#7a8a9c", marginTop:2 }}>
                        👥 {b.students_count} учеников · 📅 {b.lessons_count} занятий
                      </div>
                    </div>
                    <button className="bp" style={{ fontSize:11, padding:"7px 14px", flexShrink:0 }}
                      onClick={()=>restoreCloudBackup(b.id, b.label)}>
                      ↩️ Восстановить
                    </button>
                  </div>
                ))}
              </div>
            )}
            <button className="bg" style={{ width:"100%", marginTop:16 }} onClick={()=>setShowBackups(false)}>Закрыть</button>
          </div>
        </div>
      )}

      {/* ── КОРЗИНА ── */}
      {modal==="trash" && (
        <div className="ov" onClick={()=>setModal(null)}>
          <div className="mo" style={{ width:560, maxHeight:"85vh", overflowY:"auto" }} onClick={e=>e.stopPropagation()}>
            <h2 style={{ margin:"0 0 8px", fontSize:19, fontWeight:700 }}>🗑️ Корзина</h2>
            <div style={{ fontSize:12, color:"#7a8a9c", marginBottom:16 }}>
              Удалённые записи хранятся 30 дней. Нажмите «Вернуть», чтобы восстановить.
            </div>
            {trash.length===0 ? (
              <div style={{ padding:"40px", textAlign:"center", color:"#a9b8c6" }}>Корзина пуста</div>
            ) : (
              <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
                {trash.map(entry=>(
                  <div key={entry.id} style={{ display:"flex", justifyContent:"space-between", alignItems:"center", gap:10, border:"1px solid #dbe6f0", borderRadius:10, padding:"10px 14px" }}>
                    <div style={{ minWidth:0 }}>
                      <div style={{ fontSize:13, fontWeight:600, color:"#12283d", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{entry.label}</div>
                      <div style={{ fontSize:11, color:"#7a8a9c" }}>Удалено: {new Date(entry.deletedAt).toLocaleString("ru-RU")}</div>
                    </div>
                    <div style={{ display:"flex", gap:6, flexShrink:0 }}>
                      <button className="bp" style={{ fontSize:11, padding:"6px 12px" }} onClick={()=>restoreFromTrash(entry)}>↩️ Вернуть</button>
                      <button onClick={()=>{ if(window.confirm("Убрать из корзины навсегда?")) saveTrash(trash.filter(t=>t.id!==entry.id)); }}
                        style={{ background:"transparent", border:"1px solid #dbe6f0", color:"#a9b8c6", borderRadius:7, padding:"6px 10px", cursor:"pointer", fontSize:11, fontFamily:"inherit" }}>✕</button>
                    </div>
                  </div>
                ))}
              </div>
            )}
            <div style={{ display:"flex", gap:10, marginTop:18 }}>
              <button className="bg" style={{ flex:1 }} onClick={()=>setModal(null)}>Закрыть</button>
              {trash.length>0 && (
                <button onClick={()=>{ if(window.confirm(`Очистить корзину полностью (${trash.length} записей)? Восстановить будет нельзя.`)) { saveTrash([]); notify("Корзина очищена"); } }}
                  style={{ background:"rgba(226,87,76,0.08)", border:"1px solid rgba(226,87,76,0.2)", color:"#e2574c", padding:"9px 16px", borderRadius:10, cursor:"pointer", fontSize:13, fontFamily:"inherit" }}>Очистить всё</button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── REQUEST DETAIL / EDIT MODAL ── */}
      {editingRequest && (()=>{
        const reqCfgLocal = {
          new:       { label:"Новый",        color:"#1da0d4" },
          contacted: { label:"Связались",    color:"#f5a623" },
          trial:     { label:"Пробное",      color:"#5cb85c" },
          enrolled:  { label:"Записан",      color:"#17a6c9" },
          rejected:  { label:"Отказался",    color:"#e2574c" },
        };
        return (
          <div className="ov" onClick={()=>setEditingRequest(null)}>
            <div className="mo" style={{ width:520 }} onClick={e=>e.stopPropagation()}>
              <h2 style={{ margin:"0 0 20px", fontSize:19, fontWeight:700, color:"#12283d" }}>Заявка от {editingRequest.parentName}</h2>
              <div style={{ display:"grid", gap:12 }}>
                <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10 }}>
                  <div><div style={{ fontSize:11, color:"#55677a", marginBottom:5 }}>ФИО родителя</div><input value={editingRequest.parentName} onChange={e=>setEditingRequest({...editingRequest,parentName:e.target.value})} /></div>
                  <div><div style={{ fontSize:11, color:"#55677a", marginBottom:5 }}>Телефон</div><input value={editingRequest.phone} onChange={e=>setEditingRequest({...editingRequest,phone:e.target.value})} /></div>
                </div>
                <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10 }}>
                  <div><div style={{ fontSize:11, color:"#55677a", marginBottom:5 }}>Имя ребёнка</div><input value={editingRequest.studentName} onChange={e=>setEditingRequest({...editingRequest,studentName:e.target.value})} /></div>
                  <div><div style={{ fontSize:11, color:"#55677a", marginBottom:5 }}>Класс</div><input placeholder="4 класс" value={editingRequest.grade} onChange={e=>setEditingRequest({...editingRequest,grade:e.target.value})} /></div>
                </div>
                <div>
                  <div style={{ fontSize:11, color:"#55677a", marginBottom:5 }}>Предметы и педагоги</div>
                  {editingRequest.subjectTeachers.map((st,si)=>(
                    <div key={si} style={{ display:"flex", gap:8, marginBottom:6 }}>
                      <select value={st.subject} onChange={e=>{ const arr=[...editingRequest.subjectTeachers]; arr[si]={...arr[si],subject:e.target.value}; setEditingRequest({...editingRequest,subjectTeachers:arr}); }}>
                        <option value="">Предмет...</option>
                        {catalogGrouped.map(cat=>(
                          <optgroup key={cat.id} label={cat.label}>
                            {cat.courses.map(c=><option key={c} value={c}>{c}</option>)}
                          </optgroup>
                        ))}
                      </select>
                      <select value={st.tutorId} onChange={e=>{ const arr=[...editingRequest.subjectTeachers]; arr[si]={...arr[si],tutorId:e.target.value}; setEditingRequest({...editingRequest,subjectTeachers:arr}); }}>
                        <option value="">Педагог...</option>
                        {tutors.map(t=><option key={t.id} value={t.id}>{t.name}</option>)}
                      </select>
                      {editingRequest.subjectTeachers.length>1 && (
                        <button onClick={()=>setEditingRequest({...editingRequest,subjectTeachers:editingRequest.subjectTeachers.filter((_,j)=>j!==si)})}
                          style={{ background:"rgba(226,87,76,0.1)", border:"1px solid rgba(226,87,76,0.2)", color:"#e2574c", borderRadius:6, padding:"4px 8px", cursor:"pointer", flexShrink:0 }}><X size={13} /></button>
                      )}
                    </div>
                  ))}
                  <button className="bg" style={{ fontSize:11 }} onClick={()=>setEditingRequest({...editingRequest,subjectTeachers:[...editingRequest.subjectTeachers,{subject:"",tutorId:""}]})}><Plus size={12} /> Ещё предмет</button>
                </div>
                <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10 }}>
                  <div><div style={{ fontSize:11, color:"#55677a", marginBottom:5 }}>Статус</div>
                    <select value={editingRequest.status} onChange={e=>setEditingRequest({...editingRequest,status:e.target.value})}>
                      {Object.entries(reqCfgLocal).map(([k,v])=><option key={k} value={k}>{v.label}</option>)}
                    </select>
                  </div>
                  <div><div style={{ fontSize:11, color:"#55677a", marginBottom:5 }}>Педагог</div>
                    <select value={editingRequest.assignedTutorId||""} onChange={e=>setEditingRequest({...editingRequest,assignedTutorId:e.target.value?Number(e.target.value):null})}>
                      <option value="">Не назначен</option>
                      {tutors.map(t=><option key={t.id} value={t.id}>{t.name}</option>)}
                    </select>
                  </div>
                </div>
                <div><div style={{ fontSize:11, color:"#55677a", marginBottom:5 }}>Комментарий</div>
                  <textarea rows={3} value={editingRequest.comment} onChange={e=>setEditingRequest({...editingRequest,comment:e.target.value})} />
                </div>
                <div style={{ display:"flex", gap:10, marginTop:6 }}>
                  <button className="bp" style={{ flex:1 }} onClick={()=>{
                    setRequests(prev=>prev.map(r=>r.id===editingRequest.id?{...editingRequest, subjectTeachers:editingRequest.subjectTeachers.filter(st=>st.subject)}:r));
                    setEditingRequest(null);
                    notify("Заявка обновлена");
                  }}>Сохранить</button>
                  <button style={{ background:"rgba(226,87,76,0.08)", border:"1px solid rgba(226,87,76,0.2)", color:"#e2574c", padding:"9px 16px", borderRadius:10, cursor:"pointer", fontSize:14, fontFamily:"inherit" }}
                    onClick={()=>{ if(window.confirm("Удалить заявку?")){ setRequests(prev=>prev.filter(r=>r.id!==editingRequest.id)); setEditingRequest(null); notify("Заявка удалена"); } }}>Удалить</button>
                  <button className="bg" onClick={()=>setEditingRequest(null)}>Отмена</button>
                </div>
              </div>
            </div>
          </div>
        );
      })()}

      {/* ── ADD CANDIDATE MODAL ── */}
      {modal==="addCandidate" && (
        <div className="ov" onClick={()=>{ setModal(null); setNCandidate({ name:"", phone:"", email:"", subjects:[], notes:"", status:"new" }); }}>
          <div className="mo" style={{ width:520 }} onClick={e=>e.stopPropagation()}>
            <h2 style={{ margin:"0 0 20px", fontSize:20, fontWeight:700, color:"#12283d", display:"flex", alignItems:"center", gap:8 }}><UserPlus size={19} /> Новый соискатель</h2>
            <div style={{ display:"grid", gap:14 }}>
              <div><div style={{ fontSize:11, fontWeight:600, color:"#55677a", marginBottom:6, textTransform:"uppercase", letterSpacing:"0.03em" }}>ФИО *</div><input placeholder="Иванова Мария Сергеевна" value={nCandidate.name} onChange={e=>setNCandidate({...nCandidate,name:e.target.value})} /></div>
              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10 }}>
                <div><div style={{ fontSize:11, fontWeight:600, color:"#55677a", marginBottom:6, textTransform:"uppercase", letterSpacing:"0.03em" }}>Телефон *</div><input placeholder="+7 900 000-00-00" value={nCandidate.phone} onChange={e=>setNCandidate({...nCandidate,phone:e.target.value})} /></div>
                <div><div style={{ fontSize:11, fontWeight:600, color:"#55677a", marginBottom:6, textTransform:"uppercase", letterSpacing:"0.03em" }}>Email</div><input placeholder="mail@example.com" value={nCandidate.email} onChange={e=>setNCandidate({...nCandidate,email:e.target.value})} /></div>
              </div>
              <div>
                <div style={{ fontSize:11, fontWeight:600, color:"#55677a", marginBottom:6, textTransform:"uppercase", letterSpacing:"0.03em" }}>Может преподавать</div>
                <div style={{ maxHeight:160, overflowY:"auto", display:"flex", flexDirection:"column", gap:8, background:"#f8fafc", border:"1px solid #e7eef5", borderRadius:10, padding:10 }}>
                  {catalogGrouped.map(cat=>(
                    <div key={cat.id}>
                      <div style={{ fontSize:10, color:cat.color, fontWeight:700, textTransform:"uppercase", marginBottom:5 }}>{cat.label}</div>
                      <div style={{ display:"flex", flexWrap:"wrap", gap:5 }}>
                        {cat.courses.map(s=>(
                          <button key={s} onClick={()=>setNCandidate(prev=>({...prev,subjects:prev.subjects.includes(s)?prev.subjects.filter(x=>x!==s):[...prev.subjects,s]}))}
                            style={{ padding:"4px 10px", borderRadius:20, fontSize:11, border:"1px solid", cursor:"pointer",
                              background:nCandidate.subjects.includes(s)?`${cat.color}28`:"transparent",
                              borderColor:nCandidate.subjects.includes(s)?cat.color:"#d7e2ee",
                              color:nCandidate.subjects.includes(s)?cat.color:"#55677a" }}>{s}</button>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              <div><div style={{ fontSize:11, fontWeight:600, color:"#55677a", marginBottom:6, textTransform:"uppercase", letterSpacing:"0.03em" }}>Примечания</div>
                <textarea rows={3} placeholder="Опыт работы, впечатление от разговора и т.п." value={nCandidate.notes} onChange={e=>setNCandidate({...nCandidate,notes:e.target.value})} />
              </div>
              <div style={{ display:"flex", gap:10, marginTop:4 }}>
                <button className="bp" style={{ flex:1 }} onClick={addCandidate}>Добавить</button>
                <button className="bg" onClick={()=>{ setModal(null); setNCandidate({ name:"", phone:"", email:"", subjects:[], notes:"", status:"new" }); }}>Отмена</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── EXCEL IMPORT MODAL ── */}
      {importModal && (
        <div className="ov" onClick={()=>setImportModal(false)}>
          <div className="mo" style={{ width:640 }} onClick={e=>e.stopPropagation()}>
            <h2 style={{ margin:"0 0 6px", fontSize:20, fontWeight:700 }}>📥 Импорт из Excel</h2>
            <div style={{ fontSize:13, color:"#7a8a9c", marginBottom:18 }}>Найдено <strong style={{ color:"#1da0d4" }}>{importPreview.length}</strong> учеников в файле</div>

            {/* mode toggle */}
            <div style={{ display:"flex", gap:8, marginBottom:16 }}>
              {[["merge","➕ Добавить к существующим"],["replace","🔄 Заменить все данные"]].map(([k,l])=>(
                <button key={k} onClick={()=>setImportMode(k)}
                  style={{ padding:"7px 16px", borderRadius:9, fontSize:12, fontWeight:600, border:"1px solid", cursor:"pointer",
                    background:importMode===k?"rgba(99,102,241,0.2)":"transparent",
                    borderColor:importMode===k?"#1da0d4":"#d7e2ee",
                    color:importMode===k?"#1da0d4":"#55677a" }}>{l}</button>
              ))}
            </div>
            {importMode==="replace" && (
              <div style={{ background:"rgba(239,68,68,0.08)", border:"1px solid rgba(239,68,68,0.25)", borderRadius:10, padding:"10px 14px", fontSize:13, color:"#e2574c", marginBottom:14 }}>
                ⚠️ Все текущие данные учеников будут удалены и заменены импортированными!
              </div>
            )}

            {/* preview table */}
            <div style={{ maxHeight:320, overflowY:"auto", background:"#f2f6fa", borderRadius:12, marginBottom:16 }}>
              <table style={{ width:"100%", borderCollapse:"collapse", fontSize:12 }}>
                <thead>
                  <tr style={{ borderBottom:"1px solid #d7e2ee" }}>
                    {["ФИО","Телефон","Родитель","Школа","Предметы","Статус","Баланс"].map(h=>(
                      <th key={h} style={{ padding:"10px 12px", textAlign:"left", color:"#7a8a9c", fontWeight:600, fontSize:11, textTransform:"uppercase", whiteSpace:"nowrap" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {importPreview.map((s,i)=>(
                    <tr key={i} style={{ borderBottom:"1px solid #2a2e42" }}>
                      <td style={{ padding:"9px 12px", fontWeight:600, color:"#22344a" }}>{s.name}</td>
                      <td style={{ padding:"9px 12px", color:"#6d7f92" }}>{s.phone||"—"}</td>
                      <td style={{ padding:"9px 12px", color:"#6d7f92" }}>{s.parentName||"—"}</td>
                      <td style={{ padding:"9px 12px", color:"#6d7f92" }}>{s.school||"—"}</td>
                      <td style={{ padding:"9px 12px" }}>{s.subjects.slice(0,2).map(sub=><Tag key={sub} c="#1da0d4" bg="rgba(99,102,241,0.12)">{sub}</Tag>)}</td>
                      <td style={{ padding:"9px 12px" }}><Tag c={statusCfg[s.status]?.color||"#6d7f92"} bg={statusCfg[s.status]?.bg||"rgba(148,163,184,0.1)"}>{statusCfg[s.status]?.label||s.status}</Tag></td>
                      <td style={{ padding:"9px 12px", color:s.balance>=0?"#5cb85c":"#e2574c", fontWeight:600 }}>{s.balance}₽</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div style={{ fontSize:12, color:"#7a8a9c", marginBottom:16 }}>
              💡 Система автоматически распознаёт колонки. Убедитесь что данные выглядят правильно перед импортом.
            </div>
            <div style={{ display:"flex", gap:10 }}>
              <button className="bp" style={{ flex:1 }} onClick={confirmImport}>✅ Импортировать {importPreview.length} учеников</button>
              <button className="bg" onClick={()=>{ setImportModal(false); setImportPreview([]); }}>Отмена</button>
            </div>
          </div>
        </div>
      )}

      {notif && (
        <div className="notif" style={{ background:notif.type==="success"?"rgba(34,197,94,0.15)":"rgba(239,68,68,0.15)", border:`1px solid ${notif.type==="success"?"#5cb85c":"#e2574c"}`, color:notif.type==="success"?"#5cb85c":"#e2574c" }}>
          {notif.type==="success"?"✓":"✗"} {notif.msg}
        </div>
      )}
    </div>
  );
}
