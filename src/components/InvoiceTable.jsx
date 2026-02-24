import React from 'react';

export function InvoiceTable({ items, onRemoveItem }) {
    if (items.length === 0) {
        return <div className="card" style={{ textAlign: 'center', padding: '2rem', color: '#64748b' }}>No hay productos en la factura</div>;
    }

    return (
        <div className="card" style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                <thead>
                    <tr style={{ borderBottom: '1px solid #e2e8f0' }}>
                        <th style={{ padding: '0.75rem' }}>Producto</th>
                        <th style={{ padding: '0.75rem' }}>Cant.</th>
                        <th style={{ padding: '0.75rem' }}>Precio Unit.</th>
                        <th style={{ padding: '0.75rem' }}>Total</th>
                        <th style={{ padding: '0.75rem' }}>Acciones</th>
                    </tr>
                </thead>
                <tbody>
                    {items.map((item, index) => (
                        <tr key={index} style={{ borderBottom: '1px solid #f1f5f9' }}>
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
                                    onClick={() => onRemoveItem(index)}
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
