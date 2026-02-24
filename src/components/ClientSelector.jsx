import React from 'react';
import { CLIENT_OCASIONAL } from '../constants';

export function ClientSelector({
    clientName,
    setClientName,
    registeredClients,
    setSelectedClient,
    selectedClient,
    selectedClientPendingBalance = 0,
    selectedClientAvailableCredit = 0
}) {
    const normalizeText = (value) => String(value || '').trim().toLowerCase();
    const normalizeDoc = (value) => String(value || '').replace(/\D/g, '');

    const handleChange = (e) => {
        const val = e.target.value;
        setClientName(val);

        // Auto-match registered client
        const byName = normalizeText(val);
        const byDoc = normalizeDoc(val);
        const found = registeredClients.find((c) =>
            normalizeText(c.name) === byName ||
            normalizeText(c.document) === byName ||
            (byDoc && normalizeDoc(c.document) === byDoc)
        );
        if (found) {
            setSelectedClient(found);
        } else {
            setSelectedClient(null);
        }
    };

    const handleBlur = () => {
        if (!clientName.trim()) {
            setClientName(CLIENT_OCASIONAL);
            setSelectedClient(null);
        }
    };

    const isOcasional = clientName === CLIENT_OCASIONAL;

    return (
        <div className="card">
            <h2 style={{ marginTop: 0 }}>Datos del Cliente</h2>
            <div className="input-group">
                <label className="input-label">Nombre o NIT del Cliente</label>
                <input
                    type="text"
                    className="input-field"
                    value={clientName}
                    onChange={handleChange}
                    onBlur={handleBlur}
                    list="clients-list"
                    placeholder="Busque cliente por nombre o NIT..."
                />
                <datalist id="clients-list">
                    {registeredClients.map(c => (
                        <option key={c.document} value={c.name}>
                            {c.document}{c.blocked ? ' - BLOQUEADO' : ''}
                        </option>
                    ))}
                </datalist>
            </div>

            {selectedClient?.blocked && (
                <div className="alert alert-warning">
                    <strong>Cliente bloqueado:</strong> No puede facturar ni abonar hasta que Administracion lo desbloquee.
                </div>
            )}

            {selectedClient && !selectedClient.blocked && (
                <div className="card" style={{ marginTop: '0.75rem', backgroundColor: '#f8fafc' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: '0.6rem' }}>
                        <div>
                            <div style={{ fontSize: '0.78rem', color: '#64748b' }}>Nivel</div>
                            <strong>{selectedClient.creditLevel || 'ESTANDAR'}</strong>
                        </div>
                        <div>
                            <div style={{ fontSize: '0.78rem', color: '#64748b' }}>Cupo</div>
                            <strong>${Number(selectedClient.creditLimit || 0).toLocaleString()}</strong>
                        </div>
                        <div>
                            <div style={{ fontSize: '0.78rem', color: '#64748b' }}>Saldo Pendiente</div>
                            <strong>${Number(selectedClientPendingBalance || 0).toLocaleString()}</strong>
                        </div>
                        <div>
                            <div style={{ fontSize: '0.78rem', color: '#64748b' }}>Disponible</div>
                            <strong style={{ color: '#10b981' }}>${Number(selectedClientAvailableCredit || 0).toLocaleString()}</strong>
                        </div>
                    </div>
                </div>
            )}

            {isOcasional && (
                <div className="alert alert-warning">
                    <strong>Nota:</strong> El Cliente Ocasional no puede facturar a Credito.
                </div>
            )}
        </div>
    );
}
