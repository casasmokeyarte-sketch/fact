import React, { useState } from 'react';
import { printShiftClosure, printShiftOpening } from '../lib/printReports';
import { PaginationControls } from './PaginationControls';
import { usePagination } from '../lib/usePagination';
import { useTableSort } from '../lib/useTableSort';
import { SortButton } from './SortButton';

export function ShiftHistoryModule({ shiftHistory, onLog }) {
    const [selectedShift, setSelectedShift] = useState(null);
    const { sortedRows: sortedShifts, sortConfig, setSortKey } = useTableSort(
        shiftHistory,
        {
            endTime: { getValue: (s) => s?.endTime, type: 'date' },
            user: { getValue: (s) => s?.user || '', type: 'string' },
            salesTotal: { getValue: (s) => Number(s?.salesTotal || 0), type: 'number' },
            discrepancy: { getValue: (s) => Number(s?.discrepancy || 0), type: 'number' },
        },
        'endTime',
        'desc'
    );
    const historyPagination = usePagination(sortedShifts, 15);

    const handlePrint = (shift, mode = '58mm') => {
        printShiftClosure(shift, mode);
        onLog?.({ module: 'Cierres', action: 'Reimprimir Cierre', details: `Cierre #${shift.id} reimpreso (${mode.toUpperCase()}).` });
    };

    const handlePrintOpening = (shift, mode = '58mm') => {
        printShiftOpening(shift, mode);
        onLog?.({ module: 'Jornada', action: 'Reimprimir Apertura', details: `Apertura #${shift.id} reimpresa (${mode.toUpperCase()}).` });
    };

    return (
        <div className="shift-history-module">
            <h2>Historial de Cierres de Jornada</h2>

            <div className="card">
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                        <tr style={{ borderBottom: '2px solid var(--border-color)' }}>
                            <th style={{ padding: '0.5rem', textAlign: 'left' }}>
                                <SortButton label="Fecha/Hora Cierre" sortKey="endTime" sortConfig={sortConfig} onChange={setSortKey} />
                            </th>
                            <th style={{ padding: '0.5rem', textAlign: 'left' }}>
                                <SortButton label="Cajero" sortKey="user" sortConfig={sortConfig} onChange={setSortKey} />
                            </th>
                            <th style={{ padding: '0.5rem', textAlign: 'right' }}>
                                <SortButton label="Ventas" sortKey="salesTotal" sortConfig={sortConfig} onChange={setSortKey} />
                            </th>
                            <th style={{ padding: '0.5rem', textAlign: 'right' }}>
                                <SortButton label="Diferencia" sortKey="discrepancy" sortConfig={sortConfig} onChange={setSortKey} />
                            </th>
                            <th style={{ padding: '0.5rem', textAlign: 'center' }}>Acciones</th>
                        </tr>
                    </thead>
                    <tbody>
                        {historyPagination.totalItems === 0 ? (
                            <tr><td colSpan="5" style={{ textAlign: 'center', padding: '2rem' }}>No hay cierres registrados</td></tr>
                        ) : (
                            historyPagination.pageItems.map(shift => (
                                <tr key={shift.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                                    <td style={{ padding: '0.5rem' }}>{new Date(shift.endTime).toLocaleString()}</td>
                                    <td style={{ padding: '0.5rem' }}>{shift.user}</td>
                                    <td style={{ padding: '0.5rem', textAlign: 'right' }}>${shift.salesTotal.toLocaleString()}</td>
                                    <td style={{ padding: '0.5rem', textAlign: 'right', color: shift.discrepancy === 0 ? 'green' : 'red' }}>
                                        ${shift.discrepancy.toLocaleString()}
                                    </td>
                                    <td style={{ padding: '0.5rem', textAlign: 'center' }}>
                                        <button className="btn" onClick={() => setSelectedShift(shift)}>{'\uD83D\uDC41\uFE0F'} Ver</button>
                                        <button className="btn" style={{ marginLeft: '5px' }} onClick={() => handlePrintOpening(shift, '58mm')}>{'\uD83D\uDDA8\uFE0F'} AP</button>
                                        <button className="btn" style={{ marginLeft: '5px' }} onClick={() => handlePrint(shift, '58mm')}>{'\uD83D\uDDA8\uFE0F'} 58mm</button>
                                        <button className="btn" style={{ marginLeft: '5px' }} onClick={() => handlePrint(shift, 'a4')}>{'\uD83D\uDDA8\uFE0F'} A4</button>
                                    </td>
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
                <PaginationControls
                    page={historyPagination.page}
                    totalPages={historyPagination.totalPages}
                    totalItems={historyPagination.totalItems}
                    pageSize={historyPagination.pageSize}
                    onPageChange={historyPagination.setPage}
                />
            </div>

            {selectedShift && (
                <div className="modal-overlay" style={{
                    position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
                    backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000
                }}>
                    <div className="card" style={{ width: '350px', maxHeight: '80vh', overflowY: 'auto' }}>
                        <h3>Detalle de Jornada</h3>
                        {!!selectedShift?.openingReportText && (
                            <pre style={{
                                backgroundColor: 'var(--surface-muted)',
                                color: 'var(--text-primary)',
                                padding: '1rem',
                                borderRadius: '8px',
                                whiteSpace: 'pre-wrap',
                                fontFamily: 'monospace',
                                fontSize: '0.9rem',
                                marginBottom: '0.75rem'
                            }}>
                                {selectedShift.openingReportText}
                            </pre>
                        )}
                        <pre style={{
                            backgroundColor: 'var(--surface-muted)',
                            color: 'var(--text-primary)',
                            padding: '1rem',
                            borderRadius: '8px',
                            whiteSpace: 'pre-wrap',
                            fontFamily: 'monospace',
                            fontSize: '0.9rem'
                        }}>
                            {selectedShift.reportText}
                        </pre>
                        <div style={{ display: 'flex', gap: '0.5rem', marginTop: '1rem' }}>
                            <button className="btn" style={{ flex: 1 }} onClick={() => handlePrintOpening(selectedShift, '58mm')}>{'\uD83D\uDDA8\uFE0F'} AP</button>
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
