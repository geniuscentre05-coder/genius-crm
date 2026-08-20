jsx
function App() {
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
    editForm: { backgroundColor: 'white', borderRadius: '12px', padding: '20px', boxShadow: '0 2px 8px rgba(0,0,0,0.1)' },
    formSection: { marginBottom: '20px' },
    input: { width: '100%', padding: '10px', marginBottom: '10px', border: '1px solid #ddd', borderRadius: '6px', fontSize: '14px', boxSizing: 'border-box' },
    select: { width: '100%', padding: '10px', marginBottom: '10px', border: '1px solid #ddd', borderRadius: '6px', fontSize: '14px', boxSizing: 'border-box' },
    textarea: { width: '100%', padding: '10px', border: '1px solid #ddd', borderRadius: '6px', fontSize: '14px', minHeight: '80px', boxSizing: 'border-box' },
    formButtons: { display: 'flex', gap: '10px', marginTop: '20px' },
    saveButton: { backgroundColor: '#5c8d5c', color: 'white', border: 'none', padding: '10px 20px', borderRadius: '6px', cursor: 'pointer', fontSize: '14px' },
    cancelButton: { backgroundColor: '#6c757d', color: 'white', border: 'none', padding: '10px 20px', borderRadius: '6px', cursor: 'pointer', fontSize: '14px' },
    aiAssistant: { position: 'fixed', bottom: '20px', right: '20px', width: '400px', backgroundColor: 'white', borderRadius: '12px', boxShadow: '0 4px 20px rgba(0,0,0,0.15)', zIndex: '1000', maxHeight: '500px', display: 'flex', flexDirection: 'column' },
    aiHeader: { padding: '15px', borderBottom: '1px solid #e9ecef', display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
    closeButton: { background: 'none', border: 'none', fontSize: '20px', cursor: 'pointer', color: '#6c757d' },
    aiChat: { display: 'flex', flexDirection: 'column', height: '400px' },
    aiMessages: { flex: 1, padding: '15px', overflowY: 'auto', backgroundColor: '#f8f9fa' },
    aiMessage: { backgroundColor: 'white', padding: '10px', borderRadius: '8px', marginBottom: '8px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' },
    aiInput: { padding: '15px', borderTop: '1px solid #e9ecef', display: 'flex', gap: '10px' },
    aiInputField: { flex: 1, padding: '8px 12px', border: '1px solid #ddd', borderRadius: '6px', fontSize: '14px' },
    aiSendButton: { backgroundColor: '#5a6b23', color: 'white', border: 'none', padding: '8px 16px', borderRadius: '6px', cursor: 'pointer' },
    loading: { textAlign: 'center', padding: '40px', color: '#6c757d' }
  };

  return (
    <div className="App">
      <header style={styles.header}>
        <h1 style={styles.title}>GENIUS CRM</h1>
        <div style={styles.headerControls}>
          <span style={styles.syncStatus}>Синхронизировано</span>
          <button style={styles.aiButton}>ИИ-ассистент</button>
        </div>
      </header>

      <main style={styles.mainContent}>
        <div style={styles.studentList}>
          <div style={styles.listHeader}>
            <h2>Студенты</h2>
            <button style={styles.addButton}>+ Добавить</button>
          </div>
          <div style={styles.studentCards}>
            <div style={styles.studentCard}>
              <div style={styles.cardHeader}>
                <strong>Иван Петров</strong>
                <span style={{...styles.statusBadge, backgroundColor: '#28a745'}}>Активен</span>
              </div>
              <div style={styles.cardInfo}>
                <p>Email: ivan@example.com</p>
                <p>Телефон: +7 (999) 123-45-67</p>
              </div>
              <div style={styles.cardActions}>
                <button style={styles.editButton}>Редактировать</button>
                <button style={styles.deleteButton}>Удалить</button>
              </div>
            </div>
          </div>
        </div>

        <div style={styles.editForm}>
          <h2>Редактирование студента</h2>
          <div style={styles.formSection}>
            <input type="text" placeholder="Имя" style={styles.input} />
            <input type="email" placeholder="Email" style={styles.input} />
            <input type="tel" placeholder="Телефон" style={styles.input} />
            <select style={styles.select}>
              <option value="active">Активен</option>
              <option value="inactive">Неактивен</option>
            </select>
            <textarea placeholder="Заметки" style={styles.textarea}></textarea>
          </div>
          <div style={styles.formButtons}>
            <button style={styles.saveButton}>Сохранить</button>
            <button style={styles.cancelButton}>Отмена</button>
          </div>
        </div>
      </main>

      <div style={styles.aiAssistant}>
        <div style={styles.aiHeader}>
          <h3>ИИ-ассистент</h3>
          <button style={styles.closeButton}>&times;</button>
        </div>
        <div style={styles.aiChat}>
          <div style={styles.aiMessages}>
            <div style={styles.aiMessage}>Здравствуйте! Чем я могу помочь?</div>
          </div>
          <div style={styles.aiInput}>
            <input type="text" placeholder="Введите сообщение..." style={styles.aiInputField} />
            <button style={styles.aiSendButton}>Отправить</button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default App;
