import React from 'react';
import { PaginationControls } from './PaginationControls';
import { usePagination } from '../lib/usePagination';
import { useTableSort } from '../lib/useTableSort';
import { SortButton } from './SortButton';

const AUTH_REQUEST_LOG_PREFIX = 'AUTH_REQUEST_EVENT::';

const parseAuthRequestEvent = (details) => {
    const raw = String(details || '');
    if (!raw.startsWith(AUTH_REQUEST_LOG_PREFIX)) return null;
    try {
        const parsed = JSON.parse(raw.slice(AUTH_REQUEST_LOG_PREFIX.length));
        return parsed && typeof parsed === 'object' ? parsed : null;
    } catch {
        return null;
    }
};

const formatAuthLog = (log) => {
    const event = parseAuthRequestEvent(log?.details);
    if (!event?.requestId) return { action: log?.action, details: log?.details };

    const requester = event?.requestedBy?.name || 'Usuario';
    const resolver = event?.resolvedBy?.name || 'Administracion';
    const moduleName = event?.module || 'General';
    const reason = event?.reasonLabel || event?.reasonType || 'Autorizacion';
    const inventory = event?.inventoryRequest || null;

    if (event.type === 'CREATED') {
        if (moduleName === 'Inventario' && inventory?.productName) {
            return {
                action: 'Solicitud de inventario creada',
                details: `${requester} solicito ${Number(inventory?.quantity || 0).toLocaleString()} unidades de ${inventory.productName} desde bodega. Solicitud: ${event.requestId}.`
            };
        }

        return {
            action: 'Solicitud de autorizacion creada',
            details: `${requester} envio una solicitud para ${moduleName}: ${reason}. Solicitud: ${event.requestId}.`
        };
    }

    if (event.type === 'RESOLVED') {
        if (event.decision === 'APPROVED') {
            return {
                action: moduleName === 'Inventario' ? 'Solicitud de inventario aprobada' : 'Solicitud aprobada',
                details: moduleName === 'Inventario' && inventory?.productName
                    ? `${resolver} aprobo ${Number(inventory?.quantity || 0).toLocaleString()} unidades de ${inventory.productName}. Solicitud: ${event.requestId}.`
                    : `${resolver} aprobo la solicitud ${event.requestId} de ${moduleName}.`
            };
        }

        return {
            action: moduleName === 'Inventario' ? 'Solicitud de inventario rechazada' : 'Solicitud rechazada',
            details: moduleName === 'Inventario' && inventory?.productName
                ? `${resolver} rechazo ${Number(inventory?.quantity || 0).toLocaleString()} unidades de ${inventory.productName}. Solicitud: ${event.requestId}.`
                : `${resolver} rechazo la solicitud ${event.requestId} de ${moduleName}.`
        };
    }

    return { action: log?.action, details: log?.details };
};

export function AuditLog({ logs }) {
    const { sortedRows: sortedLogs, sortConfig, setSortKey } = useTableSort(
        logs,
        {
            timestamp: { getValue: (l) => l?.timestamp, type: 'date' },
            user_name: { getValue: (l) => l?.user_name || l?.user || '', type: 'string' },
            module: { getValue: (l) => l?.module || '', type: 'string' },
            action: { getValue: (l) => l?.action || '', type: 'string' },
            details: { getValue: (l) => l?.details || '', type: 'string' },
        },
        'timestamp',
        'desc'
    );
    const auditPagination = usePagination(sortedLogs, 15);
    return (
        <div className="audit-log">
            <h2>BitAcora de Movimientos</h2>
            <div className="card">
                {auditPagination.totalItems === 0 ? (
                    <p style={{ textAlign: 'center', padding: '2rem' }}>No hay movimientos registrados.</p>
                ) : (
                    <>
                        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                            <thead>
                                <tr style={{ borderBottom: '2px solid var(--border-color)' }}>
                                    <th style={{ padding: '0.75rem', textAlign: 'left' }}>
                                        <SortButton label="Fecha/Hora" sortKey="timestamp" sortConfig={sortConfig} onChange={setSortKey} />
                                    </th>
                                    <th style={{ padding: '0.75rem', textAlign: 'left' }}>
                                        <SortButton label="Usuario" sortKey="user_name" sortConfig={sortConfig} onChange={setSortKey} />
                                    </th>
                                    <th style={{ padding: '0.75rem', textAlign: 'left' }}>
                                        <SortButton label="Modulo" sortKey="module" sortConfig={sortConfig} onChange={setSortKey} />
                                    </th>
                                    <th style={{ padding: '0.75rem', textAlign: 'left' }}>
                                        <SortButton label="Accion" sortKey="action" sortConfig={sortConfig} onChange={setSortKey} />
                                    </th>
                                    <th style={{ padding: '0.75rem', textAlign: 'left' }}>
                                        <SortButton label="Detalles" sortKey="details" sortConfig={sortConfig} onChange={setSortKey} />
                                    </th>
                                </tr>
                            </thead>
                            <tbody>
                                {auditPagination.pageItems.map((log, index) => {
                                    const formatted = log?.module === 'Autorizaciones'
                                        ? formatAuthLog(log)
                                        : { action: log?.action, details: log?.details };
                                    return (
                                        <tr key={index} style={{ borderBottom: '1px solid #f1f5f9' }}>
                                            <td style={{ padding: '0.75rem', fontSize: '0.9em' }}>{new Date(log.timestamp).toLocaleString()}</td>
                                            <td style={{ padding: '0.75rem', fontWeight: '600' }}>{log.user_name || log.user || 'Sistema'}</td>
                                            <td style={{ padding: '0.75rem' }}><span className="badge" style={{ backgroundColor: '#e2e8f0', padding: '2px 6px', borderRadius: '4px' }}>{log.module}</span></td>
                                            <td style={{ padding: '0.75rem', fontWeight: 'bold' }}>{formatted.action}</td>
                                            <td style={{ padding: '0.75rem', fontSize: '0.9em' }}>{formatted.details}</td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                        <PaginationControls
                            page={auditPagination.page}
                            totalPages={auditPagination.totalPages}
                            totalItems={auditPagination.totalItems}
                            pageSize={auditPagination.pageSize}
                            onPageChange={auditPagination.setPage}
                        />
                    </>
                )}
            </div>
        </div>
    );
}
