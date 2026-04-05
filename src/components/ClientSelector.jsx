import React from 'react';
import { CLIENT_OCASIONAL, REFERRAL_DISCOUNT_PERCENT } from '../constants';

export function ClientSelector({
    clientName,
    setClientName,
    registeredClients,
    setSelectedClient,
    selectedClient,
    selectedReferrerDocument = '',
    setSelectedReferrerDocument,
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
    const selectedClientReferrerDocument = String(selectedClient?.referrerDocument || '').trim();
    const selectedClientReferralCredits = Math.max(0, Number(selectedClient?.referralCreditsAvailable || 0) || 0);
    const referralCandidates = registeredClients.filter((client) => (
        String(client?.document || '').trim() &&
        String(client?.document || '').trim() !== String(selectedClient?.document || '').trim()
    ));

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
                <div className="card card--muted" style={{ marginTop: '0.75rem' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: '0.6rem' }}>
                        <div>
                            <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>Nivel</div>
                            <strong>{selectedClient.creditLevel || 'ESTANDAR'}</strong>
                        </div>
                        <div>
                            <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>Cupo</div>
                            <strong>${Number(selectedClient.creditLimit || 0).toLocaleString()}</strong>
                        </div>
                        <div>
                            <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>Saldo Pendiente</div>
                            <strong>${Number(selectedClientPendingBalance || 0).toLocaleString()}</strong>
                        </div>
                        <div>
                            <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>Disponible</div>
                            <strong style={{ color: '#10b981' }}>${Number(selectedClientAvailableCredit || 0).toLocaleString()}</strong>
                        </div>
                    </div>

                    <div style={{ marginTop: '0.85rem', paddingTop: '0.85rem', borderTop: '1px solid var(--border-soft)' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.75rem', marginBottom: '0.45rem' }}>
                            <strong style={{ fontSize: '0.92rem' }}>Referidos</strong>
                            <span className="badge">{selectedClientReferralCredits} bonos de {REFERRAL_DISCOUNT_PERCENT}%</span>
                        </div>
                        <label className="input-label" style={{ marginBottom: '0.35rem' }}>Cliente que lo refirio</label>
                        <select
                            className="input-field"
                            value={selectedClientReferrerDocument || selectedReferrerDocument}
                            onChange={(e) => setSelectedReferrerDocument?.(e.target.value)}
                            disabled={!!selectedClientReferrerDocument}
                        >
                            <option value="">Sin registrar</option>
                            {referralCandidates.map((client) => (
                                <option key={client.document} value={client.document}>
                                    {client.name} | {client.document}
                                </option>
                            ))}
                        </select>
                        <div style={{ marginTop: '0.35rem', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                            {selectedClientReferrerDocument
                                ? 'Este cliente ya tiene referido asociado. La recompensa no se repetira en compras futuras del mismo referido.'
                                : 'Solo aplica para clientes registrados en el modulo Clientes. En la primera compra valida, el cliente referido recibe 5% y quien refirio gana 1 bono acumulable del 10% mas puntos CRM.'}
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
