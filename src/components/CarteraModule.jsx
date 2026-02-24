import React, { useState } from 'react';
import { COMPANY_INFO } from '../constants';

export function CarteraModule({ currentUser, clients = [], cartera, setCartera }) {
    const [abonoAmounts, setAbonoAmounts] = useState({});
    
    // Check if user is Cajero
    const isCajero = currentUser?.role === 'Cajero';
    const canCancel = !isCajero && (currentUser?.permissions?.cartera?.cancelar !== false);
    const canNotify = !isCajero && (currentUser?.permissions?.cartera?.notificar !== false);

    const handleAbonoChange = (id, amount) => {
        setAbonoAmounts({ ...abonoAmounts, [id]: amount });
    };

    const isClientBlocked = (invoice) => {
        const match = clients.find((c) =>
            String(c?.document || '') === String(invoice?.clientDoc || '') ||
            String(c?.name || '').toLowerCase() === String(invoice?.clientName || '').toLowerCase()
        );
        return !!match?.blocked;
    };

    const applyAbono = (id) => {
        const invoice = cartera.find((inv) => inv.id === id);
        if (invoice && isClientBlocked(invoice)) {
            alert("Este cliente esta bloqueado. No se permiten abonos hasta desbloquearlo.");
            return;
        }
        const amount = Number(abonoAmounts[id]) || 0;
        if (amount <= 0) return;
        if (!invoice) return;
        if (amount > Number(invoice.balance || 0)) {
            alert("El abono no puede ser mayor al saldo pendiente.");
            return;
        }

        setCartera(cartera.map(inv => {
            if (inv.id === id) {
                const newBalance = inv.balance - amount;
                const newAbono = {
                    id: Date.now(),
                    amount,
                    date: new Date().toISOString(),
                    user: currentUser?.name || currentUser?.email || "Sistema"
                };
                return {
                    ...inv,
                    balance: Math.max(0, newBalance),
                    status: newBalance <= 0 ? 'pagado' : 'pendiente',
                    abonos: [newAbono, ...(inv.abonos || [])]
                };
            }
            return inv;
        }));
        setAbonoAmounts({ ...abonoAmounts, [id]: '' });
    };

    const cancelInvoice = (id) => {
        setCartera(cartera.map(inv =>
            inv.id === id ? { ...inv, balance: 0, status: 'pagado' } : inv
        ));
    };

    const checkAlert = (dueDate) => {
        if (!dueDate) return false;
        const now = new Date();
        const due = new Date(dueDate);
        const diffTime = due - now;
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        // Alerta si faltan 3 Dias o menos, o si ya venciA (negativo)
        return diffDays <= 3;
    };

    const sendWhatsApp = (inv) => {
        const message = `Hola ${inv.clientName}, te saludamos de ${COMPANY_INFO.name}. Te recordamos que tu factura #${inv.id} por un valor de $${inv.balance.toLocaleString()} tiene fecha de vencimiento para el ${new Date(inv.dueDate).toLocaleDateString()}. ADeseas realizar un abono hoy?`;
        const encodedMsg = encodeURIComponent(message);
        // We'll try to find the client's phone if available in the invoice object (might need to pass it from App.jsx or find in registeredClients)
        // For now, if not found, we'll just open WhatsApp with the message
        const url = `https://wa.me/?text=${encodedMsg}`;
        window.open(url, '_blank');
    };

    const sendEmail = (inv) => {
        const subject = encodeURIComponent(`Recordatorio de Pago - Factura #${inv.id}`);
        const body = encodeURIComponent(`Hola ${inv.clientName},\n\nTe recordamos que tu factura #${inv.id} vence el ${new Date(inv.dueDate).toLocaleDateString()}.\nSaldo pendiente: $${inv.balance.toLocaleString()}\n\nPor favor contActanos para coordinar el pago.\n\nSaludos,\n${COMPANY_INFO.name}`);
        window.location.href = `mailto:?subject=${subject}&body=${body}`;
    };

    return (
        <div className="cartera-container">
            <h2>Modulo de Cartera (Cuentas por Cobrar)</h2>

            {cartera.length === 0 ? (
                <div className="card" style={{ textAlign: 'center', padding: '3rem' }}>No hay facturas a Credito registradas.</div>
            ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                    {cartera.map(inv => {
                        const isAlert = checkAlert(inv.dueDate);
                        const blockedClient = isClientBlocked(inv);
                        return (
                            <div key={inv.id} className="card" style={{ borderLeft: isAlert ? '5px solid var(--danger-color)' : '1px solid var(--border-color)' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                                    <div>
                                        <h3 style={{ margin: 0 }}>{inv.clientName}</h3>
                                        <p style={{ color: 'var(--text-secondary)', fontSize: '0.9em' }}>Factura ID: {inv.id} | Fecha: {new Date(inv.date).toLocaleDateString()}</p>
                                        <p><strong>Vencimiento:</strong> {new Date(inv.dueDate).toLocaleDateString()}</p>
                                        {inv.status !== 'pagado' && canNotify && (
                                            <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem' }}>
                                                <button className="btn" onClick={() => sendWhatsApp(inv)} style={{ backgroundColor: '#25D366', color: 'white', border: 'none', padding: '0.3rem 0.6rem', fontSize: '0.8em' }}>
                                                    {'\uD83D\uDFE2'} WhatsApp
                                                </button>
                                                <button className="btn" onClick={() => sendEmail(inv)} style={{ backgroundColor: '#3b82f6', color: 'white', border: 'none', padding: '0.3rem 0.6rem', fontSize: '0.8em' }}>
                                                    {'\uD83D\uDCE7'} Email
                                                </button>
                                            </div>
                                        )}
                                        {checkAlert(inv.dueDate) && inv.status !== 'pagado' && (
                                            <p style={{ color: 'var(--danger-color)', fontWeight: 'bold', marginTop: '0.5rem' }}>
                                                {'\u26A0\uFE0F'} {new Date(inv.dueDate) < new Date() ? 'VENCIDA' : 'Proximo a vencer (3 dias o menos)'}
                                            </p>
                                        )}
                                        {blockedClient && (
                                            <p style={{ color: '#b91c1c', fontWeight: 'bold', marginTop: '0.5rem' }}>
                                                Cliente bloqueado: sin abonos ni gestion de cartera
                                            </p>
                                        )}
                                    </div>
                                    <div style={{ textAlign: 'right' }}>
                                        <p style={{ margin: 0, color: 'var(--text-secondary)' }}>Total: ${inv.total.toLocaleString()}</p>
                                        <p style={{ fontSize: '1.5em', fontWeight: 'bold', margin: '0.5rem 0' }}>Saldo: ${inv.balance.toLocaleString()}</p>
                                        <span className={`alert ${inv.status === 'pagado' ? 'alert-success' : 'alert-warning'}`} style={{ padding: '0.2rem 0.5rem' }}>
                                            {inv.status.toUpperCase()}
                                        </span>
                                    </div>
                                </div>

                                {inv.status !== 'pagado' && (
                                    <div style={{ marginTop: '1rem', paddingTop: '1rem', borderTop: '1px solid var(--border-color)', display: 'flex', gap: '1rem', alignItems: 'flex-end' }}>
                                        <div className="input-group" style={{ marginBottom: 0, flex: 1 }}>
                                            <label className="input-label">Monto Abono</label>
                                            <input
                                                type="number"
                                                className="input-field"
                                                value={abonoAmounts[inv.id] || ''}
                                                onChange={(e) => handleAbonoChange(inv.id, e.target.value)}
                                                placeholder="Ej: 5000"
                                                disabled={blockedClient}
                                            />
                                        </div>
                                        <button className="btn btn-primary" onClick={() => applyAbono(inv.id)} disabled={blockedClient}>Abonar</button>
                                        {canCancel && <button className="btn btn-danger" onClick={() => cancelInvoice(inv.id)} disabled={blockedClient}>Cancelar Deuda</button>}
                                    </div>
                                )}

                                {(inv.abonos || []).length > 0 && (
                                    <div style={{ marginTop: '0.75rem', paddingTop: '0.75rem', borderTop: '1px dashed #e2e8f0' }}>
                                        <p style={{ margin: '0 0 0.4rem', fontWeight: '600' }}>Abonos</p>
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', fontSize: '0.85rem', color: '#475569' }}>
                                            {(inv.abonos || []).slice(0, 5).map((abono) => (
                                                <div key={abono.id}>
                                                    {new Date(abono.date).toLocaleString()} - ${Number(abono.amount || 0).toLocaleString()} - {abono.user || 'Sistema'}
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
