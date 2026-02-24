import React from 'react';

export function AuditLog({ logs }) {
    return (
        <div className="audit-log">
            <h2>BitAcora de Movimientos</h2>
            <div className="card">
                {logs.length === 0 ? (
                    <p style={{ textAlign: 'center', padding: '2rem' }}>No hay movimientos registrados.</p>
                ) : (
                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                        <thead>
                            <tr style={{ borderBottom: '2px solid var(--border-color)' }}>
                                <th style={{ padding: '0.75rem', textAlign: 'left' }}>Fecha/Hora</th>
                                <th style={{ padding: '0.75rem', textAlign: 'left' }}>Usuario</th>
                                <th style={{ padding: '0.75rem', textAlign: 'left' }}>Modulo</th>
                                <th style={{ padding: '0.75rem', textAlign: 'left' }}>AcciAn</th>
                                <th style={{ padding: '0.75rem', textAlign: 'left' }}>Detalles</th>
                            </tr>
                        </thead>
                        <tbody>
                            {[...logs].reverse().map((log, index) => (
                                <tr key={index} style={{ borderBottom: '1px solid #f1f5f9' }}>
                                    <td style={{ padding: '0.75rem', fontSize: '0.9em' }}>{new Date(log.timestamp).toLocaleString()}</td>
                                    <td style={{ padding: '0.75rem', fontWeight: '600' }}>{log.user_name || log.user || 'Sistema'}</td>
                                    <td style={{ padding: '0.75rem' }}><span className="badge" style={{ backgroundColor: '#e2e8f0', padding: '2px 6px', borderRadius: '4px' }}>{log.module}</span></td>
                                    <td style={{ padding: '0.75rem', fontWeight: 'bold' }}>{log.action}</td>
                                    <td style={{ padding: '0.75rem', fontSize: '0.9em' }}>{log.details}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
            </div>
        </div>
    );
}
