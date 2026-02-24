import React, { useState } from 'react';

export function PurchasingModule({ warehouseStock, setWarehouseStock, purchases, setPurchases, onLog, products }) {
    const [purchase, setPurchase] = useState({
        invoiceNumber: '',
        supplier: '',
        productId: '',
        quantity: 0,
        unitCost: 0
    });

    const handleSave = (e) => {
        e.preventDefault();
        if (!purchase.invoiceNumber || !purchase.productId || purchase.quantity <= 0) {
            return alert("Complete todos los campos correctamente");
        }

        const product = products.find(p => String(p.id) === String(purchase.productId));
        const qty = Number(purchase.quantity);

        // Update Warehouse Stock
        setWarehouseStock(prev => ({
            ...prev,
            [purchase.productId]: (prev[purchase.productId] || 0) + qty
        }));

        // Add to history logs (Purchases)
        setPurchases([{
            ...purchase,
            productName: product?.name || 'Producto Desconocido',
            unitCost: Number(purchase.unitCost) || 0,
            date: new Date().toISOString()
        }, ...purchases]);

        // Reset form
        setPurchase({ invoiceNumber: '', supplier: '', productId: '', quantity: 0, unitCost: 0 });
        alert("Compra registrada y stock sumado a BODEGA");
    };

    const distributeStock = (productId, amount) => {
        if ((warehouseStock[productId] || 0) < amount) return alert("No hay suficiente stock en bodega");

        setWarehouseStock(prev => ({
            ...prev,
            [productId]: prev[productId] - amount
        }));
        alert(`Se distribuyeron ${amount} unidades del producto a los puntos de venta.`);
    };

    return (
        <div className="purchasing-container">
            <h2>Modulo de Compras (Entrada a Bodega)</h2>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2rem' }}>
                <div className="card">
                    <h3 style={{ marginTop: 0 }}>Registrar Factura de Compra</h3>
                    <form onSubmit={handleSave}>
                        <div className="input-group">
                            <label className="input-label">Numero de Factura</label>
                            <input
                                type="text" className="input-field" required
                                value={purchase.invoiceNumber}
                                onChange={e => setPurchase({ ...purchase, invoiceNumber: e.target.value })}
                            />
                        </div>
                        <div className="input-group">
                            <label className="input-label">Proveedor</label>
                            <input
                                type="text" className="input-field" required
                                value={purchase.supplier}
                                onChange={e => setPurchase({ ...purchase, supplier: e.target.value })}
                            />
                        </div>
                        <div className="input-group">
                            <label className="input-label">Producto</label>
                            <select
                                className="input-field" required
                                value={purchase.productId}
                                onChange={e => setPurchase({ ...purchase, productId: e.target.value })}
                            >
                                <option value="">Seleccione producto...</option>
                                {products.map((p, idx) => <option key={`${p.id}-${idx}`} value={p.id}>{p.name}</option>)}
                            </select>
                        </div>
                        <div className="input-group">
                            <label className="input-label">Cantidad</label>
                            <input
                                type="number" className="input-field" required min="1"
                                value={purchase.quantity}
                                onChange={e => setPurchase({ ...purchase, quantity: e.target.value })}
                            />
                        </div>
                        <div className="input-group">
                            <label className="input-label">Costo Unitario (Inversiòn n)</label>
                            <input
                                type="number" className="input-field" required min="0" step="0.01"
                                value={purchase.unitCost}
                                onChange={e => setPurchase({ ...purchase, unitCost: e.target.value })}
                            />
                        </div>
                        <button type="submit" className="btn btn-primary" style={{ width: '100%' }}>Guardar Compra</button>
                    </form>
                </div>

                <div className="card">
                    <h3 style={{ marginTop: 0 }}>Stock Actual en Bodega</h3>
                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                        <thead>
                            <tr style={{ borderBottom: '1px solid var(--border-color)' }}>
                                <th style={{ padding: '0.5rem', textAlign: 'left' }}>Producto</th>
                                <th style={{ padding: '0.5rem', textAlign: 'center' }}>Stock Bodega</th>
                                <th style={{ padding: '0.5rem', textAlign: 'right' }}>AcciAn</th>
                            </tr>
                        </thead>
                        <tbody>
                            {products.map((p, idx) => (
                                <tr key={`${p.id}-${idx}`} style={{ borderBottom: '1px solid #f1f5f9' }}>
                                    <td style={{ padding: '0.5rem' }}>{p.name}</td>
                                    <td style={{ padding: '0.5rem', textAlign: 'center' }}><strong>{warehouseStock[p.id] || 0}</strong></td>
                                    <td style={{ padding: '0.5rem', textAlign: 'right' }}>
                                        <button
                                            className="btn"
                                            style={{ padding: '0.2rem 0.5rem', fontSize: '0.8em' }}
                                            onClick={() => distributeStock(p.id, 1)}
                                            disabled={!(warehouseStock[p.id] > 0)}
                                        >
                                            Distribuir (1)
                                        </button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>

            <div className="card" style={{ marginTop: '2rem' }}>
                <h3 style={{ marginTop: 0 }}>Historial de Compras</h3>
                {purchases.length === 0 ? <p>No hay registros aAn.</p> : (
                    <ul style={{ listStyle: 'none', padding: 0 }}>
                        {purchases.map((log, i) => (
                            <li key={i} style={{ padding: '0.5rem 0', borderBottom: '1px solid #f1f5f9' }}>
                                {new Date(log.date).toLocaleDateString()}: Factura <strong>#{log.invoiceNumber}</strong> de <strong>{log.supplier}</strong> - Ingresaron {log.quantity} de {log.productName} (Costo: ${Number(log.unitCost).toLocaleString()} | Total: ${(log.quantity * log.unitCost).toLocaleString()})
                            </li>
                        ))}
                    </ul>
                )}
            </div>
        </div>
    );
}
