import React, { useState } from 'react';

export function ShiftManager({ shift, onStartShift, onEndShift, salesTotal }) {
    const [showReconciliation, setShowReconciliation] = useState(false);
    const [physicalCashInput, setPhysicalCashInput] = useState('');

    const parseMoneyInput = (value) => Number(String(value || '').replace(/[^\d]/g, '')) || 0;

    const physicalCash = parseMoneyInput(physicalCashInput);

    const handleEndAttempt = () => {
        onEndShift({ physicalCash });
        setShowReconciliation(false);
        setPhysicalCashInput('');
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
                            <p>Ventas del Turno: <strong>Oculto para cuadre ciego</strong></p>
                            <hr />
                            <p style={{ fontSize: '0.95rem', color: '#64748b' }}>
                                Ingrese solo el efectivo fisico contado. El sistema calculara el descuadre internamente.
                            </p>
                        </div>

                        <div className="input-group">
                            <label className="input-label">Efectivo Fisicoco Real ($)</label>
                            <input
                                type="text" className="input-field"
                                value={physicalCashInput}
                                onChange={(e) => setPhysicalCashInput(e.target.value)}
                                inputMode="numeric"
                                placeholder="Ej: 150000"
                                style={{ fontSize: '1.5rem', height: 'auto' }}
                            />
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
