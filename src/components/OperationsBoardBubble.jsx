import { useEffect, useMemo, useState } from 'react';

const BOARD_NOTES_STORAGE_KEY = 'fact_ops_board_notes';
const MAX_NOTES = 40;
const MAX_ATTACHMENTS = 2;
const MAX_FILE_SIZE_BYTES = 450 * 1024;

const normalizeRole = (role) => {
  const normalized = String(role || '').trim().toLowerCase();
  if (!normalized) return '';
  if (normalized === 'administrador' || normalized === 'admin') return 'Administrador';
  if (normalized.includes('supervisor')) return 'Supervisor';
  if (normalized.includes('cajer')) return 'Cajero';
  return String(role || '').trim();
};

const fileToDataUrl = (file) => new Promise((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => resolve(String(reader.result || ''));
  reader.onerror = () => reject(new Error('No se pudo leer el archivo.'));
  reader.readAsDataURL(file);
});

const loadSavedNotes = () => {
  try {
    const raw = localStorage.getItem(BOARD_NOTES_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.slice(0, MAX_NOTES) : [];
  } catch {
    return [];
  }
};

export function OperationsBoardBubble({ currentUser, requests = [], onResolveRequest }) {
  const [isOpen, setIsOpen] = useState(false);
  const [activeTab, setActiveTab] = useState('board');
  const [noteText, setNoteText] = useState('');
  const [pendingFiles, setPendingFiles] = useState([]);
  const [notes, setNotes] = useState(loadSavedNotes);

  useEffect(() => {
    localStorage.setItem(BOARD_NOTES_STORAGE_KEY, JSON.stringify(notes.slice(0, MAX_NOTES)));
  }, [notes]);

  const normalizedRole = normalizeRole(currentUser?.role);
  const canResolve = normalizedRole === 'Administrador' || normalizedRole === 'Supervisor';

  const orderedRequests = useMemo(() => {
    return [...(requests || [])].sort((a, b) => {
      const aTime = new Date(a?.createdAt || 0).getTime();
      const bTime = new Date(b?.createdAt || 0).getTime();
      return bTime - aTime;
    });
  }, [requests]);

  const pendingCount = orderedRequests.filter((req) => req.status === 'PENDING').length;

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

  const handleSaveNote = () => {
    const text = String(noteText || '').trim();
    if (!text && pendingFiles.length === 0) return;

    const note = {
      id: `n-${Date.now()}`,
      text,
      createdAt: new Date().toISOString(),
      author: currentUser?.name || currentUser?.email || 'Usuario',
      attachments: pendingFiles,
    };

    setNotes((prev) => [note, ...prev].slice(0, MAX_NOTES));
    setNoteText('');
    setPendingFiles([]);
  };

  return (
    <div className="ops-board-bubble">
      {isOpen && (
        <section className="ops-board-panel" role="dialog" aria-label="Pizarra operativa">
          <div className="ops-board-header">
            <strong>Pizarra</strong>
            <button type="button" className="ops-board-close" onClick={() => setIsOpen(false)} aria-label="Cerrar pizarra">x</button>
          </div>

          <div className="ops-board-tabs">
            <button
              type="button"
              className={`ops-board-tab ${activeTab === 'board' ? 'active' : ''}`}
              onClick={() => setActiveTab('board')}
            >
              Pizarra
            </button>
            <button
              type="button"
              className={`ops-board-tab ${activeTab === 'auth' ? 'active' : ''}`}
              onClick={() => setActiveTab('auth')}
            >
              Autorizaciones {pendingCount > 0 ? `(${pendingCount})` : ''}
            </button>
          </div>

          {activeTab === 'board' && (
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
          )}

          {activeTab === 'auth' && (
            <div className="ops-board-content">
              {orderedRequests.length === 0 && (
                <p>No hay solicitudes de autorizacion.</p>
              )}
              {orderedRequests.map((req) => (
                <article key={req.id} className="ops-board-auth-item">
                  <div className="ops-board-note-meta">
                    <strong>{req.reasonLabel || req.reasonType || 'Solicitud'}</strong>
                    <span>{new Date(req.createdAt).toLocaleString()}</span>
                  </div>
                  <p style={{ margin: '0 0 6px' }}>
                    Estado: <strong>{req.status}</strong> | Cajero: {req.requestedBy?.name || 'N/A'}
                  </p>
                  <p style={{ margin: '0 0 6px' }}>
                    Cliente: {req.clientName || 'N/A'} | Total: ${Number(req.total || 0).toLocaleString()} | Pago: {req.paymentMode || 'N/A'}
                  </p>
                  {req.note && <p style={{ margin: '0 0 6px' }}>Nota: {req.note}</p>}
                  {req.status === 'PENDING' && canResolve && (
                    <div className="ops-board-auth-actions">
                      <button type="button" onClick={() => onResolveRequest?.(req.id, 'APPROVED')}>Aprobar</button>
                      <button type="button" onClick={() => onResolveRequest?.(req.id, 'REJECTED')}>Rechazar</button>
                    </div>
                  )}
                  {req.resolvedAt && (
                    <p style={{ margin: '6px 0 0', fontSize: '0.8rem', color: '#475569' }}>
                      Resuelto por {req.resolvedBy?.name || 'N/A'} el {new Date(req.resolvedAt).toLocaleString()}
                    </p>
                  )}
                </article>
              ))}
            </div>
          )}
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
