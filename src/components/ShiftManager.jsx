import React, { useState } from 'react';

export function ShiftManager({ shift, onStartShift, onEndShift, salesTotal }) {
    const [showReconciliation, setShowReconciliation] = useState(false);
    const [physicalCash, setPhysicalCash] = useState(0);
    const [adminAuth, setAdminAuth] = useState('');

    const theoreticalBalance = shift ? (shift.initialCash + salesTotal) : 0;
    const discrepancy = physicalCash - theoreticalBalance;

    const handleEndAttempt = () => {
        if (Math.abs(discrepancy) > 1) {
            const pass = prompt("DESCUADRE DETECTADO. Si no coincide con lo fAsico, no puede cerrar. Ingrese clave Admin para autorizar cierre con descuadre:");
            if (pass === 'Admin') {
                onEndShift({ physicalCash, theoreticalBalance, discrepancy, authorized: true });
                setShowReconciliation(false);
            } else {
                alert("Clave incorrecta o no autorizada. Debe cuadrar la caja.");
            }
        } else {
            onEndShift({ physicalCash, theoreticalBalance, discrepancy: 0, authorized: false });
            setShowReconciliation(false);
        }
    };

    if (!shift) {
        return (
            <div className="card" style={{ textAlign: 'center', padding: '3rem' }}>
                <span style={{ fontSize: '4rem' }}>{'\uD83D\uDD52'}</span>
                <h2>Jornada No Iniciada</h2>
                <p>Debe iniciar su jornada laboral para acceder al sistema.</p>
                <div className="input-group" style={{ maxWidth: '300px', margin: '1rem auto' }}>
                    <label className="input-label">Base de Caja Inicial ($)</label>
                    <input
                        type="number" className="input-field"
                        placeholder="Ej: 100000"
                        id="initial-cash-input"
                    />
                </div>
                <button
                    className="btn btn-primary"
                    onClick={() => {
                        const val = Number(document.getElementById('initial-cash-input').value);
                        onStartShift(val);
                    }}
                >
                    Iniciar Jornada
                </button>
            </div>
        );
    }

    return (
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
            <div className="badge" style={{ backgroundColor: '#dcfce7', color: '#166534' }}>
                {'\uD83D\uDFE2'} Jornada Activa (Base: ${shift.initialCash.toLocaleString()})
            </div>
            <button className="btn" style={{ backgroundColor: '#fee2e2', color: '#991b1b' }} onClick={() => setShowReconciliation(true)}>
                Cerrar Jornada
            </button>

            {showReconciliation && (
                <div className="modal-overlay" style={{
                    position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
                    backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000
                }}>
                    <div className="card" style={{ width: '400px' }}>
                        <h3>Cierre de Caja / Cuadre</h3>
                        <div style={{ marginBottom: '1rem' }}>
                            <p>Base Inicial: <strong>${shift.initialCash.toLocaleString()}</strong></p>
                            <p>Ventas del Turno: <strong>${salesTotal.toLocaleString()}</strong></p>
                            <hr />
                            <p style={{ fontSize: '1.2rem' }}>Saldo TeArico: <strong>${theoreticalBalance.toLocaleString()}</strong></p>
                        </div>

                        <div className="input-group">
                            <label className="input-label">Efectivo FAsico Real ($)</label>
                            <input
                                type="number" className="input-field"
                                value={physicalCash}
                                onChange={e => setPhysicalCash(Number(e.target.value))}
                                style={{ fontSize: '1.5rem', height: 'auto' }}
                            />
                        </div>

                        <div style={{ padding: '10px', borderRadius: '4px', backgroundColor: discrepancy === 0 ? '#f0fdf4' : '#fef2f2', marginBottom: '1rem' }}>
                            <p style={{ margin: 0, color: discrepancy === 0 ? 'green' : 'red' }}>
                                Diferencia: <strong>${discrepancy.toLocaleString()}</strong>
                            </p>
                        </div>

                        <div style={{ display: 'flex', gap: '0.5rem' }}>
                            <button className="btn btn-primary" style={{ flex: 1 }} onClick={handleEndAttempt}>Finalizar y Reportar (CR)</button>
                            <button className="btn" style={{ flex: 1 }} onClick={() => setShowReconciliation(false)}>Cancelar</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
