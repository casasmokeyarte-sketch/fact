import { useState } from 'react';

export function OperationsBoardBubble({ notes = [], onCreateNote }) {
  const [isOpen, setIsOpen] = useState(false);
  const [noteText, setNoteText] = useState('');

  const handleSaveNote = async () => {
    const text = String(noteText || '').trim();
    if (!text) return;
    const ok = await onCreateNote?.(text);
    if (ok !== false) setNoteText('');
  };

  return (
    <div className="ops-board-bubble">
      {isOpen && (
        <section className="ops-board-panel" role="dialog" aria-label="Pizarra operativa">
          <div className="ops-board-header">
            <strong>Pizarra</strong>
            <button type="button" className="ops-board-close" onClick={() => setIsOpen(false)} aria-label="Cerrar pizarra">x</button>
          </div>

          <div className="ops-board-content">
            <textarea
              className="ops-board-textarea"
              value={noteText}
              onChange={(event) => setNoteText(event.target.value)}
              placeholder="Escribe una nota operativa para el equipo..."
            />
            <div className="ops-board-actions">
              <button type="button" className="ops-board-save" onClick={handleSaveNote}>Guardar nota</button>
            </div>

            <div className="ops-board-list">
              {notes.length === 0 && <p>No hay notas todavia.</p>}
              {notes.map((note) => (
                <article key={note.id} className="ops-board-note">
                  <div className="ops-board-note-meta">
                    <strong>{note.author}</strong>
                    <span>{new Date(note.createdAt).toLocaleString()}</span>
                  </div>
                  <p>{note.text}</p>
                </article>
              ))}
            </div>
          </div>
        </section>
      )}

      <button
        type="button"
        className="ops-board-trigger"
        onClick={() => setIsOpen((prev) => !prev)}
        aria-expanded={isOpen}
        aria-label="Abrir pizarra"
        title="Pizarra"
      >
        PZ
      </button>
    </div>
  );
}
