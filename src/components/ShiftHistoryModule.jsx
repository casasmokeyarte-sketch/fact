import React, { useState } from 'react';
import { printShiftClosure } from '../lib/printReports';

export function ShiftHistoryModule({ shiftHistory, onLog }) {
    const [selectedShift, setSelectedShift] = useState(null);

    const handlePrint = (shift, mode = '58mm') => {
        printShiftClosure(shift, mode);
        onLog?.({ module: 'Cierres', action: 'Reimprimir Cierre', details: `Cierre #${shift.id} reimpreso (${mode.toUpperCase()}).` });
    };

    return (
        <div className="shift-history-module">
            <h2>Historial de Cierres de Jornada</h2>

            <div className="card">
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                        <tr style={{ borderBottom: '2px solid var(--border-color)' }}>
                            <th style={{ padding: '0.5rem', textAlign: 'left' }}>Fecha/Hora Cierre</th>
                            <th style={{ padding: '0.5rem', textAlign: 'left' }}>Cajero</th>
                            <th style={{ padding: '0.5rem', textAlign: 'right' }}>Ventas</th>
                            <th style={{ padding: '0.5rem', textAlign: 'right' }}>Diferencia</th>
                            <th style={{ padding: '0.5rem', textAlign: 'center' }}>Acciones</th>
                        </tr>
                    </thead>
                    <tbody>
                        {shiftHistory.length === 0 ? (
                            <tr><td colSpan="5" style={{ textAlign: 'center', padding: '2rem' }}>No hay cierres registrados</td></tr>
                        ) : (
                            shiftHistory.slice().reverse().map(shift => (
                                <tr key={shift.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                                    <td style={{ padding: '0.5rem' }}>{new Date(shift.endTime).toLocaleString()}</td>
                                    <td style={{ padding: '0.5rem' }}>{shift.user}</td>
                                    <td style={{ padding: '0.5rem', textAlign: 'right' }}>${shift.salesTotal.toLocaleString()}</td>
                                    <td style={{ padding: '0.5rem', textAlign: 'right', color: shift.discrepancy === 0 ? 'green' : 'red' }}>
                                        ${shift.discrepancy.toLocaleString()}
                                    </td>
                                    <td style={{ padding: '0.5rem', textAlign: 'center' }}>
                                        <button className="btn" onClick={() => setSelectedShift(shift)}>{'\uD83D\uDC41\uFE0F'} Ver</button>
                                        <button className="btn" style={{ marginLeft: '5px' }} onClick={() => handlePrint(shift, '58mm')}>{'\uD83D\uDDA8\uFE0F'} 58mm</button>
                                        <button className="btn" style={{ marginLeft: '5px' }} onClick={() => handlePrint(shift, 'a4')}>{'\uD83D\uDDA8\uFE0F'} A4</button>
                                    </td>
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </div>

            {selectedShift && (
                <div className="modal-overlay" style={{
                    position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
                    backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000
                }}>
                    <div className="card" style={{ width: '350px', maxHeight: '80vh', overflowY: 'auto' }}>
                        <h3>Detalle de Cierre</h3>
                        <pre style={{
                            backgroundColor: '#f8fafc',
                            padding: '1rem',
                            borderRadius: '8px',
                            whiteSpace: 'pre-wrap',
                            fontFamily: 'monospace',
                            fontSize: '0.9rem'
                        }}>
                            {selectedShift.reportText}
                        </pre>
                        <div style={{ display: 'flex', gap: '0.5rem', marginTop: '1rem' }}>
                            <button className="btn btn-primary" style={{ flex: 1 }} onClick={() => handlePrint(selectedShift, '58mm')}>{'\uD83D\uDDA8\uFE0F'} 58mm</button>
                            <button className="btn" style={{ flex: 1 }} onClick={() => handlePrint(selectedShift, 'a4')}>{'\uD83D\uDDA8\uFE0F'} A4</button>
                            <button className="btn" style={{ flex: 1 }} onClick={() => setSelectedShift(null)}>Cerrar</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
