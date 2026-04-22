import React from 'react';
import { useTableSort } from '../lib/useTableSort';
import { SortButton } from './SortButton';

export function InvoiceTable({ items, onRemoveItem }) {
    if (items.length === 0) {
        return <div className="card" style={{ textAlign: 'center', padding: '2rem', color: '#64748b' }}>No hay productos en la factura</div>;
    }

    const indexedItems = items.map((item, index) => ({ ...item, __rowIndex: index }));

    const { sortedRows, sortConfig, setSortKey } = useTableSort(
        indexedItems,
        {
            name: { getValue: (it) => it?.name || '', type: 'string' },
            quantity: { getValue: (it) => Number(it?.quantity || 0), type: 'number' },
            price: { getValue: (it) => Number(it?.price || 0), type: 'number' },
            total: { getValue: (it) => Number(it?.total || 0), type: 'number' },
        },
        ''
    );

    return (
        <div className="card" style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                <thead>
                    <tr style={{ borderBottom: '1px solid #e2e8f0' }}>
                        <th style={{ padding: '0.75rem' }}>Img.</th>
                        <th style={{ padding: '0.75rem' }}><SortButton label="Producto" sortKey="name" sortConfig={sortConfig} onChange={setSortKey} /></th>
                        <th style={{ padding: '0.75rem' }}><SortButton label="Cant." sortKey="quantity" sortConfig={sortConfig} onChange={setSortKey} /></th>
                        <th style={{ padding: '0.75rem' }}><SortButton label="Precio Unit." sortKey="price" sortConfig={sortConfig} onChange={setSortKey} /></th>
                        <th style={{ padding: '0.75rem' }}><SortButton label="Total" sortKey="total" sortConfig={sortConfig} onChange={setSortKey} /></th>
                        <th style={{ padding: '0.75rem' }}>Acciones</th>
                    </tr>
                </thead>
                <tbody>
                    {sortedRows.map((item) => (
                        <tr key={item.__rowIndex} style={{ borderBottom: '1px solid #f1f5f9' }}>
                            <td style={{ padding: '0.75rem', width: '78px' }}>
                                {item.image_url ? (
                                    <img
                                        src={item.image_url}
                                        alt={item.name || 'Producto'}
                                        style={{ width: '48px', height: '48px', objectFit: 'cover', borderRadius: '0.65rem', backgroundColor: 'var(--surface-muted)' }}
                                    />
                                ) : (
                                    <div style={{ width: '48px', height: '48px', borderRadius: '0.65rem', border: '1px dashed #cbd5e1', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.65rem', color: '#64748b' }}>
                                        Sin
                                    </div>
                                )}
                            </td>
                            <td style={{ padding: '0.75rem' }}>
                                {item.name} {item.isGift && <span style={{ backgroundColor: '#fee2e2', color: '#b91c1c', fontSize: '0.7em', padding: '1px 4px', borderRadius: '4px', marginLeft: '5px' }}>REGALO</span>}
                            </td>
                            <td style={{ padding: '0.75rem' }}>{item.quantity}</td>
                            <td style={{ padding: '0.75rem' }}>${item.price.toLocaleString()}</td>
                            <td style={{ padding: '0.75rem' }}>${item.total.toLocaleString()}</td>
                            <td style={{ padding: '0.75rem' }}>
                                <button
                                    className="btn btn-danger"
                                    style={{ padding: '0.25rem 0.5rem', fontSize: '0.875rem' }}
                                    onClick={() => onRemoveItem(item.__rowIndex)}
                                >
                                    Eliminar
                                </button>
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}
