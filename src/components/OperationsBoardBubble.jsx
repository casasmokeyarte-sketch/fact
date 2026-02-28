import { useState } from 'react';

const MAX_ATTACHMENTS = 2;
const MAX_FILE_SIZE_BYTES = 450 * 1024;

const fileToDataUrl = (file) => new Promise((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => resolve(String(reader.result || ''));
  reader.onerror = () => reject(new Error('No se pudo leer el archivo.'));
  reader.readAsDataURL(file);
});

export function OperationsBoardBubble({ notes = [], onCreateNote, hasAttention = false, onOpenChange }) {
  const [isOpen, setIsOpen] = useState(false);
  const [noteText, setNoteText] = useState('');
  const [pendingFiles, setPendingFiles] = useState([]);

  const toggleOpen = () => {
    const next = !isOpen;
    setIsOpen(next);
    onOpenChange?.(next);
  };

  const handleFileSelect = async (event) => {
    const incoming = Array.from(event.target.files || []);
    event.target.value = '';

    const chosen = incoming.slice(0, MAX_ATTACHMENTS);
    const accepted = [];

    for (const file of chosen) {
      if (file.size > MAX_FILE_SIZE_BYTES) {
        alert(`Archivo ${file.name} excede 450KB. Adjunta uno mas liviano.`);
        continue;
      }
      const dataUrl = await fileToDataUrl(file);
      accepted.push({
        id: `f-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        name: file.name,
        type: file.type || 'application/octet-stream',
        size: file.size,
        dataUrl,
      });
    }

    setPendingFiles(accepted.slice(0, MAX_ATTACHMENTS));
  };

  const handleSaveNote = async () => {
    const text = String(noteText || '').trim();
    if (!text && pendingFiles.length === 0) return;

    const ok = await onCreateNote?.({
      text,
      attachments: pendingFiles
    });
    if (ok !== false) {
      setNoteText('');
      setPendingFiles([]);
    }
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
              <label className="ops-board-attach">
                Adjuntar
                <input
                  type="file"
                  onChange={handleFileSelect}
                  accept="image/*,.pdf,.txt,.doc,.docx,.xls,.xlsx"
                  multiple
                />
              </label>
              <button type="button" className="ops-board-save" onClick={handleSaveNote}>Guardar nota</button>
            </div>

            {pendingFiles.length > 0 && (
              <div className="ops-board-pending-files">
                {pendingFiles.map((file) => (
                  <span key={file.id}>{file.name}</span>
                ))}
              </div>
            )}

            <div className="ops-board-list">
              {notes.length === 0 && <p>No hay notas todavia.</p>}
              {notes.map((note) => (
                <article key={note.id} className="ops-board-note">
                  <div className="ops-board-note-meta">
                    <strong>{note.author}</strong>
                    <span>{new Date(note.createdAt).toLocaleString()}</span>
                  </div>
                  {note.text && <p>{note.text}</p>}
                  {Array.isArray(note.attachments) && note.attachments.length > 0 && (
                    <div className="ops-board-attachments">
                      {note.attachments.map((file) => (
                        <a key={file.id} href={file.dataUrl} download={file.name}>
                          {String(file.type || '').startsWith('image/') ? (
                            <img src={file.dataUrl} alt={file.name} />
                          ) : (
                            <span>{file.name}</span>
                          )}
                        </a>
                      ))}
                    </div>
                  )}
                </article>
              ))}
            </div>
          </div>
        </section>
      )}

      <button
        type="button"
        className={`ops-board-trigger ${hasAttention ? 'attention' : ''}`}
        onClick={toggleOpen}
        aria-expanded={isOpen}
        aria-label="Abrir pizarra"
        title="Pizarra"
      >
        PZ
      </button>
    </div>
  );
}
