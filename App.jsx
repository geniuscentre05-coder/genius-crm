import { useState, useEffect, useRef } from 'react';
import { supabase } from './supabaseClient';

// ---------- Облачное хранение данных (Supabase) ----------
const RECORD_ID = 'educrmData_v1';
const LOCAL_CACHE_KEY = 'educrmData_v1_cache';
const SAVE_DEBOUNCE_MS = 800;

const DEFAULT_DATA = { students: [] };

function useCloudData(defaultData) {
  const [data, setData] = useState(() => {
    const cached = localStorage.getItem(LOCAL_CACHE_KEY);
    return cached ? JSON.parse(cached) : defaultData;
  });
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);

  const saveTimeout = useRef(null);
  const isRemoteUpdate = useRef(false);

  useEffect(() => {
    let cancelled = false;

    async function loadInitial() {
      const { data: row, error } = await supabase
        .from('crm_state')
        .select('data')
        .eq('id', RECORD_ID)
        .maybeSingle();

      if (cancelled) return;

      if (error) {
        console.error('Supabase load error:', error);
      } else if (row) {
        isRemoteUpdate.current = true;
        setData(row.data);
        localStorage.setItem(LOCAL_CACHE_KEY, JSON.stringify(row.data));
      } else {
        await supabase.from('crm_state').upsert({
          id: RECORD_ID,
          data,
          updated_at: new Date().toISOString(),
        });
      }
      setLoading(false);
    }

    loadInitial();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const channel = supabase
      .channel('crm_state_changes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'crm_state', filter: `id=eq.${RECORD_ID}` },
        (payload) => {
          const incoming = payload.new?.data;
          if (incoming) {
            isRemoteUpdate.current = true;
            setData(incoming);
            localStorage.setItem(LOCAL_CACHE_KEY, JSON.stringify(incoming));
          }
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, []);

  useEffect(() => {
    if (isRemoteUpdate.current) {
      isRemoteUpdate.current = false;
      return;
    }
    if (loading) return;

    localStorage.setItem(LOCAL_CACHE_KEY, JSON.stringify(data));

    if (saveTimeout.current) clearTimeout(saveTimeout.current);
    saveTimeout.current = setTimeout(async () => {
      setSyncing(true);
      const { error } = await supabase.from('crm_state').upsert({
        id: RECORD_ID,
        data,
        updated_at: new Date().toISOString(),
      });
      if (error) console.error('Supabase save error:', error);
      setSyncing(false);
    }, SAVE_DEBOUNCE_MS);

    return () => clearTimeout(saveTimeout.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data]);

  return [data, setData, { loading, syncing }];
}

// ---------- Пустой шаблон анкеты студента ----------
function emptyStudent() {
  return {
    id: crypto.randomUUID(),
    status: 'active',
    // Личные данные
    fullName: '',
    birthDate: '',
    // Контакты
    phone: '',
    email: '',
    parentName: '',
    parentPhone: '',
    // Педагоги и предметы
    teacherSubjects: [{ teacher: '', subject: '' }],
    // Финансы
    tuitionAmount: '',
    paymentStatus: 'unpaid',
    notes: '',
  };
}

function App() {
  const [data, setData, { loading, syncing }] = useCloudData(DEFAULT_DATA);
  const [editingStudent, setEditingStudent] = useState(null);
  const [isNew, setIsNew] = useState(false);
  const [aiOpen, setAiOpen] = useState(false);
  const [aiMessages, setAiMessages] = useState([
    { role: 'assistant', content: 'Здравствуйте! Чем я могу помочь?' },
  ]);
  const [aiInput, setAiInput] = useState('');
  const [aiLoading, setAiLoading] = useState(false);

  const students = data.students || [];

  const styles = {
    header: { backgroundColor: '#a1a4b4', color: 'white', padding: '20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', boxShadow: '0 2px 4px rgba(0,0,0,0.1)' },
    title: { margin: '0', fontSize: '24px', fontFamily: '"DM Serif Display", serif' },
    headerControls: { display: 'flex', gap: '10px', alignItems: 'center' },
    syncStatus: { fontSize: '14px', opacity: '0.9' },
    aiButton: { backgroundColor: '#5a6b23', color: 'white', border: 'none', padding: '8px 16px', borderRadius: '20px', cursor: 'pointer', fontSize: '14px' },
    mainContent: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', padding: '20px', maxWidth: '1400px', margin: '0 auto' },
    studentList: { backgroundColor: 'white', borderRadius: '12px', padding: '20px', boxShadow: '0 2px 8px rgba(0,0,0,0.1)' },
    listHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' },
    addButton: { backgroundColor: '#5c8d5c', color: 'white', border: 'none', padding: '8px 16px', borderRadius: '6px', cursor: 'pointer', fontSize: '14px' },
    studentCards: { display: 'flex', flexDirection: 'column', gap: '12px' },
    studentCard: { backgroundColor: '#f8f9fa', borderRadius: '8px', padding: '15px', border: '1px solid #dee2ef' },
    cardHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' },
    statusBadge: { padding: '4px 8px', borderRadius: '12px', fontSize: '12px', color: 'white' },
    cardInfo: { fontSize: '14px', color: '#495057' },
    cardActions: { display: 'flex', gap: '8px', marginTop: '8px' },
    editButton: { backgroundColor: '#5a6b23', color: 'white', border: 'none', padding: '4px 10px', borderRadius: '4px', cursor: 'pointer', fontSize: '12px' },
    deleteButton: { backgroundColor: '#6c757d', color: 'white', border: 'none', padding: '4px 10px', borderRadius: '4px', cursor: 'pointer', fontSize: '12px' },
    editForm: { backgroundColor: 'white', borderRadius: '12px', padding: '20px', boxShadow: '0 2px 8px rgba(0,0,0,0.1)', maxHeight: '80vh', overflowY: 'auto' },
    formSection: { marginBottom: '20px' },
    sectionTitle: { fontSize: '15px', fontWeight: 'bold', color: '#1da0d4', marginBottom: '8px', marginTop: '0' },
    input: { width: '100%', padding: '10px', marginBottom: '10px', border: '1px solid #ddd', borderRadius: '6px', fontSize: '14px', boxSizing: 'border-box' },
    select: { width: '100%', padding: '10px', marginBottom: '10px', border: '1px solid #ddd', borderRadius: '6px', fontSize: '14px', boxSizing: 'border-box' },
    textarea: { width: '100%', padding: '10px', border: '1px solid #ddd', borderRadius: '6px', fontSize: '14px', minHeight: '80px', boxSizing: 'border-box' },
    formButtons: { display: 'flex', gap: '10px', marginTop: '20px' },
    saveButton: { backgroundColor: '#5c8d5c', color: 'white', border: 'none', padding: '10px 20px', borderRadius: '6px', cursor: 'pointer', fontSize: '14px' },
    cancelButton: { backgroundColor: '#6c757d', color: 'white', border: 'none', padding: '10px 20px', borderRadius: '6px', cursor: 'pointer', fontSize: '14px' },
    teacherRow: { display: 'flex', gap: '8px', marginBottom: '8px', alignItems: 'center' },
    smallRemoveButton: { backgroundColor: '#f5a623', color: 'white', border: 'none', borderRadius: '4px', padding: '8px 10px', cursor: 'pointer', fontSize: '12px', flexShrink: 0 },
    addRowButton: { backgroundColor: 'transparent', color: '#1da0d4', border: '1px dashed #1da0d4', borderRadius: '6px', padding: '6px 12px', cursor: 'pointer', fontSize: '13px', marginBottom: '10px' },
    aiAssistant: { position: 'fixed', bottom: '20px', right: '20px', width: '400px', backgroundColor: 'white', borderRadius: '12px', boxShadow: '0 4px 20px rgba(0,0,0,0.15)', zIndex: '1000', maxHeight: '500px', display: 'flex', flexDirection: 'column' },
    aiHeader: { padding: '15px', borderBottom: '1px solid #e9ecef', display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
    closeButton: { background: 'none', border: 'none', fontSize: '20px', cursor: 'pointer', color: '#6c757d' },
    aiChat: { display: 'flex', flexDirection: 'column', height: '400px' },
    aiMessages: { flex: 1, padding: '15px', overflowY: 'auto', backgroundColor: '#f8f9fa' },
    aiMessage: { backgroundColor: 'white', padding: '10px', borderRadius: '8px', marginBottom: '8px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' },
    aiMessageUser: { backgroundColor: '#e7f5ff', padding: '10px', borderRadius: '8px', marginBottom: '8px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)', textAlign: 'right' },
    aiInput: { padding: '15px', borderTop: '1px solid #e9ecef', display: 'flex', gap: '10px' },
    aiInputField: { flex: 1, padding: '8px 12px', border: '1px solid #ddd', borderRadius: '6px', fontSize: '14px' },
    aiSendButton: { backgroundColor: '#5a6b23', color: 'white', border: 'none', padding: '8px 16px', borderRadius: '6px', cursor: 'pointer' },
    loading: { textAlign: 'center', padding: '40px', color: '#6c757d' },
    emptyState: { textAlign: 'center', padding: '30px', color: '#6c757d', fontSize: '14px' },
  };

  // ---------- CRUD студентов ----------
  function handleAddNew() {
    setEditingStudent(emptyStudent());
    setIsNew(true);
  }

  function handleEdit(student) {
    setEditingStudent({ ...student, teacherSubjects: student.teacherSubjects?.length ? student.teacherSubjects : [{ teacher: '', subject: '' }] });
    setIsNew(false);
  }

  function handleDelete(id) {
    if (!window.confirm('Удалить этого студента?')) return;
    setData((prev) => ({ ...prev, students: (prev.students || []).filter((s) => s.id !== id) }));
    if (editingStudent?.id === id) setEditingStudent(null);
  }

  function handleSave() {
    if (!editingStudent.fullName.trim()) {
      alert('Укажите ФИО студента');
      return;
    }
    setData((prev) => {
      const list = prev.students || [];
      const exists = list.some((s) => s.id === editingStudent.id);
      return {
        ...prev,
        students: exists
          ? list.map((s) => (s.id === editingStudent.id ? editingStudent : s))
          : [...list, editingStudent],
      };
    });
    setEditingStudent(null);
  }

  function handleCancel() {
    setEditingStudent(null);
  }

  function updateField(field, value) {
    setEditingStudent((prev) => ({ ...prev, [field]: value }));
  }

  function updateTeacherSubject(index, field, value) {
    setEditingStudent((prev) => {
      const list = [...prev.teacherSubjects];
      list[index] = { ...list[index], [field]: value };
      return { ...prev, teacherSubjects: list };
    });
  }

  function addTeacherRow() {
    setEditingStudent((prev) => ({
      ...prev,
      teacherSubjects: [...prev.teacherSubjects, { teacher: '', subject: '' }],
    }));
  }

  function removeTeacherRow(index) {
    setEditingStudent((prev) => ({
      ...prev,
      teacherSubjects: prev.teacherSubjects.filter((_, i) => i !== index),
    }));
  }

  // ---------- ИИ-помощник ----------
  async function sendAiMessage() {
    const text = aiInput.trim();
    if (!text || aiLoading) return;

    const newMessages = [...aiMessages, { role: 'user', content: text }];
    setAiMessages(newMessages);
    setAiInput('');
    setAiLoading(true);

    try {
      const response = await fetch('/api/ai-proxy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [
            {
              role: 'system',
              content: 'Ты — ИИ-помощник CRM образовательного центра "ГЕНИЙ". Помогай администратору с вопросами по ученикам, расписанию и организации.',
            },
            ...newMessages.map((m) => ({ role: m.role, content: m.content })),
          ],
        }),
      });

      const result = await response.json();

      if (!response.ok) {
        setAiMessages((prev) => [
          ...prev,
          { role: 'assistant', content: `Ошибка: ${result.error || 'не удалось получить ответ'}` },
        ]);
        return;
      }

      const reply = result.choices?.[0]?.message?.content || 'Не удалось получить ответ.';
      setAiMessages((prev) => [...prev, { role: 'assistant', content: reply }]);
    } catch (err) {
      setAiMessages((prev) => [
        ...prev,
        { role: 'assistant', content: 'Не удалось связаться с ИИ-помощником. Проверьте подключение.' },
      ]);
    } finally {
      setAiLoading(false);
    }
  }

  function handleAiKeyDown(e) {
    if (e.key === 'Enter') sendAiMessage();
  }

  const statusColors = { active: '#28a745', inactive: '#6c757d' };
  const statusLabels = { active: 'Активен', inactive: 'Неактивен' };
  const paymentLabels = { paid: 'Оплачено', unpaid: 'Не оплачено', partial: 'Частично' };

  if (loading) {
    return <div style={styles.loading}>Загрузка данных из облака...</div>;
  }

  return (
    <div className="App">
      <header style={styles.header}>
        <h1 style={styles.title}>GENIUS CRM</h1>
        <div style={styles.headerControls}>
          <span style={styles.syncStatus}>{syncing ? 'Сохранение...' : 'Синхронизировано'}</span>
          <button style={styles.aiButton} onClick={() => setAiOpen(true)}>ИИ-ассистент</button>
        </div>
      </header>

      <main style={styles.mainContent}>
        <div style={styles.studentList}>
          <div style={styles.listHeader}>
            <h2>Студенты</h2>
            <button style={styles.addButton} onClick={handleAddNew}>+ Добавить</button>
          </div>
          <div style={styles.studentCards}>
            {students.length === 0 && (
              <div style={styles.emptyState}>Пока нет ни одного студента — нажмите «+ Добавить»</div>
            )}
            {students.map((student) => (
              <div style={styles.studentCard} key={student.id}>
                <div style={styles.cardHeader}>
                  <strong>{student.fullName || 'Без имени'}</strong>
                  <span style={{ ...styles.statusBadge, backgroundColor: statusColors[student.status] || '#6c757d' }}>
                    {statusLabels[student.status] || student.status}
                  </span>
                </div>
                <div style={styles.cardInfo}>
                  {student.email && <p>Email: {student.email}</p>}
                  {student.phone && <p>Телефон: {student.phone}</p>}
                  {student.teacherSubjects?.some((t) => t.teacher || t.subject) && (
                    <p>
                      Предметы:{' '}
                      {student.teacherSubjects
                        .filter((t) => t.teacher || t.subject)
                        .map((t, i) => `${t.subject || '—'} (${t.teacher || '—'})`)
                        .join(', ')}
                    </p>
                  )}
                  {student.tuitionAmount && (
                    <p>Оплата: {student.tuitionAmount} — {paymentLabels[student.paymentStatus] || student.paymentStatus}</p>
                  )}
                </div>
                <div style={styles.cardActions}>
                  <button style={styles.editButton} onClick={() => handleEdit(student)}>Редактировать</button>
                  <button style={styles.deleteButton} onClick={() => handleDelete(student.id)}>Удалить</button>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div style={styles.editForm}>
          <h2>{editingStudent ? (isNew ? 'Новый студент' : 'Редактирование студента') : 'Анкета студента'}</h2>

          {!editingStudent && (
            <p style={{ color: '#6c757d', fontSize: '14px' }}>
              Выберите студента для редактирования слева или нажмите «+ Добавить».
            </p>
          )}

          {editingStudent && (
            <>
              <div style={styles.formSection}>
                <p style={styles.sectionTitle}>Личные данные</p>
                <input
                  type="text"
                  placeholder="ФИО"
                  style={styles.input}
                  value={editingStudent.fullName}
                  onChange={(e) => updateField('fullName', e.target.value)}
                />
                <input
                  type="date"
                  placeholder="Дата рождения"
                  style={styles.input}
                  value={editingStudent.birthDate}
                  onChange={(e) => updateField('birthDate', e.target.value)}
                />
                <select
                  style={styles.select}
                  value={editingStudent.status}
                  onChange={(e) => updateField('status', e.target.value)}
                >
                  <option value="active">Активен</option>
                  <option value="inactive">Неактивен</option>
                </select>
              </div>

              <div style={styles.formSection}>
                <p style={styles.sectionTitle}>Контакты</p>
                <input
                  type="tel"
                  placeholder="Телефон студента"
                  style={styles.input}
                  value={editingStudent.phone}
                  onChange={(e) => updateField('phone', e.target.value)}
                />
                <input
                  type="email"
                  placeholder="Email"
                  style={styles.input}
                  value={editingStudent.email}
                  onChange={(e) => updateField('email', e.target.value)}
                />
                <input
                  type="text"
                  placeholder="ФИО родителя"
                  style={styles.input}
                  value={editingStudent.parentName}
                  onChange={(e) => updateField('parentName', e.target.value)}
                />
                <input
                  type="tel"
                  placeholder="Телефон родителя"
                  style={styles.input}
                  value={editingStudent.parentPhone}
                  onChange={(e) => updateField('parentPhone', e.target.value)}
                />
              </div>

              <div style={styles.formSection}>
                <p style={styles.sectionTitle}>Педагоги и предметы</p>
                {editingStudent.teacherSubjects.map((row, index) => (
                  <div style={styles.teacherRow} key={index}>
                    <input
                      type="text"
                      placeholder="Предмет"
                      style={{ ...styles.input, marginBottom: 0 }}
                      value={row.subject}
                      onChange={(e) => updateTeacherSubject(index, 'subject', e.target.value)}
                    />
                    <input
                      type="text"
                      placeholder="Педагог"
                      style={{ ...styles.input, marginBottom: 0 }}
                      value={row.teacher}
                      onChange={(e) => updateTeacherSubject(index, 'teacher', e.target.value)}
                    />
                    {editingStudent.teacherSubjects.length > 1 && (
                      <button style={styles.smallRemoveButton} onClick={() => removeTeacherRow(index)}>✕</button>
                    )}
                  </div>
                ))}
                <button style={styles.addRowButton} onClick={addTeacherRow}>+ Добавить предмет</button>
              </div>

              <div style={styles.formSection}>
                <p style={styles.sectionTitle}>Финансы</p>
                <input
                  type="text"
                  placeholder="Сумма оплаты (например, 5000 руб/мес)"
                  style={styles.input}
                  value={editingStudent.tuitionAmount}
                  onChange={(e) => updateField('tuitionAmount', e.target.value)}
                />
                <select
                  style={styles.select}
                  value={editingStudent.paymentStatus}
                  onChange={(e) => updateField('paymentStatus', e.target.value)}
                >
                  <option value="paid">Оплачено</option>
                  <option value="unpaid">Не оплачено</option>
                  <option value="partial">Частично</option>
                </select>
                <textarea
                  placeholder="Заметки"
                  style={styles.textarea}
                  value={editingStudent.notes}
                  onChange={(e) => updateField('notes', e.target.value)}
                />
              </div>

              <div style={styles.formButtons}>
                <button style={styles.saveButton} onClick={handleSave}>Сохранить</button>
                <button style={styles.cancelButton} onClick={handleCancel}>Отмена</button>
              </div>
            </>
          )}
        </div>
      </main>

      {aiOpen && (
        <div style={styles.aiAssistant}>
          <div style={styles.aiHeader}>
            <h3 style={{ margin: 0 }}>ИИ-ассистент</h3>
            <button style={styles.closeButton} onClick={() => setAiOpen(false)}>&times;</button>
          </div>
          <div style={styles.aiChat}>
            <div style={styles.aiMessages}>
              {aiMessages.map((m, i) => (
                <div key={i} style={m.role === 'user' ? styles.aiMessageUser : styles.aiMessage}>
                  {m.content}
                </div>
              ))}
              {aiLoading && <div style={styles.aiMessage}>Печатает...</div>}
            </div>
            <div style={styles.aiInput}>
              <input
                type="text"
                placeholder="Введите сообщение..."
                style={styles.aiInputField}
                value={aiInput}
                onChange={(e) => setAiInput(e.target.value)}
                onKeyDown={handleAiKeyDown}
              />
              <button style={styles.aiSendButton} onClick={sendAiMessage} disabled={aiLoading}>Отправить</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
