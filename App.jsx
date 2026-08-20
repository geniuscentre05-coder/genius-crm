jsx
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { createClient } from '@supabase/supabase-js';

// ВАЖНО: Это ключ, который мы вставим позже. ПОКА НЕ ТРОГАЕМ.
const supabaseUrl = 'https://rmqpevnruootzvqnsagv.supabase.co';
const supabaseKey = 'СЮДА_ВСТАВИТЬ_ВАШ_КЛЮЧ_ИЗ_SUPABASE';

const supabase = createClient(supabaseUrl, supabaseKey);

function App() {
  const [students, setStudents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [syncStatus, setSyncStatus] = useState('Синхронизация...');
  const [selectedStudent, setSelectedStudent] = useState(null);
  const [isEditing, setIsEditing] = useState(false);
  const [showAIAssistant, setShowAIAssistant] = useState(false);
  const [aiMessage, setAiMessage] = useState('');
  const [aiResponse, setAiResponse] = useState('');
  const [aiLoading, setAiLoading] = useState(false);
  const [formData, setFormData] = useState({
    name: '', phone: '', email: '', birthDate: '', address: '', parents: '',
    subjects: [], teachers: [], payment: 0, balance: 0, notes: '', status: 'active'
  });

  const loadStudents = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.from('students').select('*');
      if (error) throw error;
      if (data && data.length > 0) {
        setStudents(data);
        localStorage.setItem('educrmData_v1', JSON.stringify(data));
        setSyncStatus('Синхронизировано ✓');
      } else {
        const localData = localStorage.getItem('educrmData_v1');
        if (localData) {
          const parsed = JSON.parse(localData);
          setStudents(parsed);
          await supabase.from('students').upsert(parsed);
        }
      }
    } catch (error) {
      console.error('Ошибка загрузки:', error);
      const localData = localStorage.getItem('educrmData_v1');
      if (localData) setStudents(JSON.parse(localData));
      setSyncStatus('Офлайн режим');
    } finally {
      setLoading(false);
    }
  }, []);

  const saveStudent = async (studentData) => {
    setLoading(true);
    try {
      if (studentData.id) {
        await supabase.from('students').update(studentData).eq('id', studentData.id);
        setStudents(prev => prev.map(s => s.id === studentData.id ? studentData : s));
      } else {
        const newStudent = { ...studentData, id: Date.now().toString(), created_at: new Date().toISOString() };
        await supabase.from('students').insert(newStudent);
        setStudents(prev => [newStudent, ...prev]);
      }
      localStorage.setItem('educrmData_v1', JSON.stringify(students));
      setSyncStatus('Сохранено ✓');
      setIsEditing(false);
      resetForm();
    } catch (error) {
      console.error('Ошибка сохранения:', error);
      setSyncStatus('Ошибка сохранения');
    } finally {
      setLoading(false);
    }
  };

  const deleteStudent = async (id) => {
    if (!window.confirm('Удалить ученика?')) return;
    setLoading(true);
    try {
      await supabase.from('students').delete().eq('id', id);
      const updatedStudents = students.filter(s => s.id !== id);
      setStudents(updatedStudents);
      localStorage.setItem('educrmData_v1', JSON.stringify(updatedStudents));
      setSyncStatus('Удалено ✓');
    } catch (error) {
      console.error('Ошибка удаления:', error);
      setSyncStatus('Ошибка удаления');
    } finally {
      setLoading(false);
    }
  };

  const askAI = async () => {
    if (!aiMessage.trim()) return;
    setAiLoading(true);
    try {
      const response = await fetch('/.netlify/functions/ai-proxy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: aiMessage, context: students })
      });
      const data = await response.json();
      setAiResponse(data.response || 'Ответ получен');
    } catch (error) {
      console.error('Ошибка ИИ:', error);
      setAiResponse('Извините, ошибка. Попробуйте позже.');
    } finally {
      setAiLoading(false);
    }
  };

  const resetForm = () => {
    setFormData({ name: '', phone: '', email: '', birthDate: '', address: '', parents: '', subjects: [], teachers: [], payment: 0, balance: 0, notes: '', status: 'active' });
    setSelectedStudent(null);
  };

  const editStudent = (student) => {
    setFormData(student);
    setSelectedStudent(student);
    setIsEditing(true);
  };

  useEffect(() => {
    loadStudents();
    const subscription = supabase
      .channel('students_changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'students' }, () => loadStudents())
      .subscribe();
    return () => subscription.unsubscribe();
  }, [loadStudents]);

  return (
    <div style={styles.app}>
      <header style={styles.header}>
        <h1 style={styles.title}>🎓 CRM «ГЕНИЙ»</h1>
        <div style={styles.headerControls}>
          <span style={styles.syncStatus}>{syncStatus}</span>
          <button style={styles.aiButton} onClick={() => setShowAIAssistant(!showAIAssistant)}>🤖 ИИ-помощник</button>
        </div>
      </header>
      {showAIAssistant && (
        <div style={styles.aiAssistant}>
          <div style={styles.aiHeader}><h3>🤖 ИИ-помощник DeepSeek</h3><button style={styles.closeButton} onClick={() => setShowAIAssistant(false)}>✕</button></div>
          <div style={styles.aiChat}>
            <div style={styles.aiMessages}>{aiResponse && <div style={styles.aiMessage}><strong>ИИ:</strong> {aiResponse}</div>}</div>
            <div style={styles.aiInput}>
              <input type="text" value={aiMessage} onChange={(e) => setAiMessage(e.target.value)} placeholder="Задайте вопрос..." style={styles.aiInputField} onKeyPress={(e) => e.key === 'Enter' && askAI()} />
              <button onClick={askAI} disabled={aiLoading} style={styles.aiSendButton}>{aiLoading ? '⏳' : 'Отправить'}</button>
            </div>
          </div>
        </div>
      )}
      <div style={styles.mainContent}>
        <div style={styles.studentList}>
          <div style={styles.listHeader}><h2>Ученики</h2><button style={styles.addButton} onClick={() => { resetForm(); setIsEditing(true); }}>+ Добавить</button></div>
          {loading ? <div style={styles.loading}>Загрузка...</div> : (
            <div style={styles.studentCards}>
              {students.map(student => (
                <div key={student.id} style={styles.studentCard}>
                  <div style={styles.cardHeader}><h3>{student.name}</h3><span style={{ ...styles.statusBadge, backgroundColor: student.status === 'active' ? '#5cb85c' : '#f5a623' }}>{student.status === 'active' ? 'Активен' : 'На паузе'}</span></div>
                  <div style={styles.cardInfo}><p>📞 {student.phone || '—'}</p><p>📧 {student.email || '—'}</p><p>💰 {student.balance || 0} руб.</p></div>
                  <div style={styles.cardActions}><button style={styles.editButton} onClick={() => editStudent(student)}>✎</button><button style={styles.deleteButton} onClick={() => deleteStudent(student.id)}>✕</button></div>
                </div>
              ))}
            </div>
          )}
        </div>
        {isEditing && (
          <div style={styles.editForm}>
            <h2>{selectedStudent ? 'Редактирование' : 'Новый ученик'}</h2>
            <div style={styles.formSection}><h4>Личные данные</h4><input type="text" placeholder="ФИО" value={formData.name} onChange={(e) => setFormData({...formData, name: e.target.value})} style={styles.input} /><input type="date" placeholder="Дата рождения" value={formData.birthDate} onChange={(e) => setFormData({...formData, birthDate: e.target.value})} style={styles.input} /><input type="text" placeholder="Адрес" value={formData.address} onChange={(e) => setFormData({...formData, address: e.target.value})} style={styles.input} /><input type="text" placeholder="Родители" value={formData.parents} onChange={(e) => setFormData({...formData, parents: e.target.value})} style={styles.input} /></div>
            <div style={styles.formSection}><h4>Контакты</h4><input type="tel" placeholder="Телефон" value={formData.phone} onChange={(e) => setFormData({...formData, phone: e.target.value})} style={styles.input} /><input type="email" placeholder="Email" value={formData.email} onChange={(e) => setFormData({...formData, email: e.target.value})} style={styles.input} /></div>
            <div style={styles.formSection}><h4>Педагоги и предметы</h4><input type="text" placeholder="Предметы (через запятую)" value={formData.subjects.join(', ')} onChange={(e) => setFormData({...formData, subjects: e.target.value.split(',').map(s => s.trim()).filter(Boolean)})} style={styles.input} /><input type="text" placeholder="Педагоги (через запятую)" value={formData.teachers.join(', ')} onChange={(e) => setFormData({...formData, teachers: e.target.value.split(',').map(s => s.trim()).filter(Boolean)})} style={styles.input} /></div>
            <div style={styles.formSection}><h4>Финансы</h4><input type="number" placeholder="Стоимость обучения" value={formData.payment} onChange={(e) => setFormData({...formData, payment: Number(e.target.value)})} style={styles.input} /><input type="number" placeholder="Баланс" value={formData.balance} onChange={(e) => setFormData({...formData, balance: Number(e.target.value)})} style={styles.input} /></div>
            <div style={styles.formSection}><h4>Дополнительно</h4><select value={formData.status} onChange={(e) => setFormData({...formData, status: e.target.value})} style={styles.select}><option value="active">Активен</option><option value="paused">На паузе</option><option value="completed">Завершил</option></select><textarea placeholder="Заметки" value={formData.notes} onChange={(e) => setFormData({...formData, notes: e.target.value})} style={styles.textarea} /></div>
            <div style={styles.formActions}><button style={styles.saveButton} onClick={() => saveStudent(formData)}>💾 Сохранить</button><button style={styles.cancelButton} onClick={() => { setIsEditing(false); resetForm(); }}>Отмена</button></div>
          </div>
        )}
      </div>
    </div>
  );
}

const styles = {
  app: { minHeight: '100vh', backgroundColor: '#f5f7fa', fontFamily: "'Plus Jakarta Sans', sans-serif" },
  header: { backgroundColor: '#1da0d4', color: 'white', padding: '20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', boxShadow: '0 2px 4px rgba(0,0,0,0.1)' },
  title: { margin: 0, fontSize: '24px', fontFamily: "'DM Serif Display', serif" },
  headerControls: { display: 'flex', gap: '15px', alignItems: 'center' },
  syncStatus: { fontSize: '14px', opacity: 0.9 },
  aiButton: { backgroundColor: '#f5a623', color: 'white', border: 'none', padding: '8px 16px', borderRadius: '20px', cursor: 'pointer', fontSize: '14px' },
  mainContent: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', padding: '20px', maxWidth: '1400px', margin: '0 auto' },
  studentList: { backgroundColor: 'white', borderRadius: '12px', padding: '20px', boxShadow: '0 2px 8px rgba(0,0,0,0.1)' },
  listHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' },
  addButton: { backgroundColor: '#5cb85c', color: 'white', border: 'none', padding: '8px 16px', borderRadius: '6px', cursor: 'pointer', fontSize: '14px' },
  studentCards: { display: 'flex', flexDirection: 'column', gap: '12px' },
  studentCard: { backgroundColor: '#f8f9fa', borderRadius: '8px', padding: '15px', border: '1px solid #e9ecef' },
  cardHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' },
  statusBadge: { padding: '4px 8px', borderRadius: '12px', fontSize: '12px', color: 'white' },
  cardInfo: { fontSize: '14px', color: '#495057' },
  cardActions: { display: 'flex', gap: '8px', marginTop: '8px' },
  editButton: { backgroundColor: '#1da0d4', color: 'white', border: 'none', padding: '4px 10px', borderRadius: '4px', cursor: 'pointer' },
  deleteButton: { backgroundColor: '#dc3545', color: 'white', border: 'none', padding: '4px 10px', borderRadius: '4px', cursor: 'pointer' },
  editForm: { backgroundColor: 'white', borderRadius: '12px', padding: '20px', boxShadow: '0 2px 8px rgba(0,0,0,0.1)' },
  formSection: { marginBottom: '20px' },
  input: { width: '100%', padding: '10px', marginBottom: '10px', border: '1px solid #ddd', borderRadius: '6px', fontSize: '14px', boxSizing: 'border-box' },
  select: { width: '100%', padding: '10px', marginBottom: '10px', border: '1px solid #ddd', borderRadius: '6px', fontSize: '14px' },
  textarea: { width: '100%', padding: '10px', border: '1px solid #ddd', borderRadius: '6px', fontSize: '14px', minHeight: '80px', boxSizing: 'border-box' },
  formActions: { display: 'flex', gap: '10px', marginTop: '20px' },
  saveButton: { backgroundColor: '#5cb85c', color: 'white', border: 'none', padding: '10px 20px', borderRadius: '6px', cursor: 'pointer', fontSize: '14px' },
  cancelButton: { backgroundColor: '#6c757d', color: 'white', border: 'none', padding: '10px 20px', borderRadius: '6px', cursor: 'pointer', fontSize: '14px' },
  aiAssistant: { position: 'fixed', bottom: '20px', right: '20px', width: '400px', backgroundColor: 'white', borderRadius: '12px', boxShadow: '0 4px 20px rgba(0,0,0,0.15)', zIndex: 1000, maxHeight: '500px', display: 'flex', flexDirection: 'column' },
  aiHeader: { padding: '15px', borderBottom: '1px solid #e9ecef', display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
  closeButton: { background: 'none', border: 'none', fontSize: '20px', cursor: 'pointer', color: '#6c757d' },
  aiChat: { display: 'flex', flexDirection: 'column', height: '400px' },
  aiMessages: { flex: 1, padding: '15px', overflowY: 'auto', backgroundColor: '#f8f9fa' },
  aiMessage: { backgroundColor: 'white', padding: '10px', borderRadius: '8px', marginBottom: '8px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' },
  aiInput: { padding: '15px', borderTop: '1px solid #e9ecef', display: 'flex', gap: '10px' },
  aiInputField: { flex: 1, padding: '8px 12px', border: '1px solid #ddd', borderRadius: '6px', fontSize: '14px' },
  aiSendButton: { backgroundColor: '#1da0d4', color: 'white', border: 'none', padding: '8px 16px', borderRadius: '6px', cursor: 'pointer' },
  loading: { textAlign: 'center', padding: '40px', color: '#6c757d' },
};

export default App;
