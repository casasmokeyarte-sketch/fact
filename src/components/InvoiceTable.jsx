import React from 'react';
import { useTableSort } from '../lib/useTableSort';
import { SortButton } from './SortButton';

export function InvoiceTable({ items, onRemoveItem, onChangeQuantity }) {
    const safeItems = Array.isArray(items) ? items : [];
    const indexedItems = safeItems.map((item, index) => ({ ...item, __rowIndex: index }));

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

    if (safeItems.length === 0) {
        return (
            <div className="card pos-order-empty">
                <span aria-hidden="true">🛒</span>
                <strong>Factura vacia</strong>
                <p>Toque un producto del catalogo para comenzar.</p>
            </div>
        );
    }

    return (
        <div className="card pos-order-card">
            <div className="pos-order-card__header">
                <div>
                    <span className="pos-catalog__eyebrow">ORDEN ACTUAL</span>
                    <h3>Productos facturados</h3>
                </div>
                <span className="pos-order-count">{safeItems.reduce((sum, item) => sum + Number(item?.quantity || 0), 0)} unidades</span>
            </div>
            <div className="pos-order-table-wrap">
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
                            <td style={{ padding: '0.75rem' }}>
                                <div className="pos-line-quantity">
                                    <button
                                        type="button"
                                        onClick={() => onChangeQuantity?.(item.__rowIndex, Math.max(1, Number(item.quantity || 1) - 1))}
                                        aria-label={`Reducir cantidad de ${item.name}`}
                                    >−</button>
                                    <strong>{item.quantity}</strong>
                                    <button
                                        type="button"
                                        onClick={() => onChangeQuantity?.(item.__rowIndex, Number(item.quantity || 0) + 1)}
                                        aria-label={`Aumentar cantidad de ${item.name}`}
                                    >+</button>
                                </div>
                            </td>
                            <td style={{ padding: '0.75rem' }}>${item.price.toLocaleString()}</td>
                            <td style={{ padding: '0.75rem' }}>${item.total.toLocaleString()}</td>
                            <td style={{ padding: '0.75rem' }}>
                                <button
                                    className="btn btn-danger"
                                    style={{ minWidth: '44px', minHeight: '44px', padding: '0.35rem 0.55rem', fontSize: '1rem' }}
                                    onClick={() => onRemoveItem(item.__rowIndex)}
                                    aria-label={`Eliminar ${item.name}`}
                                >
                                    ×
                                </button>
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
            </div>
        </div>
    );
}
