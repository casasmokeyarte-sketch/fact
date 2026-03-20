import React, { useState } from 'react';
import { PaginationControls } from './PaginationControls';
import { usePagination } from '../lib/usePagination';
import { useTableSort } from '../lib/useTableSort';
import { SortButton } from './SortButton';

export function PurchasingModule({
    warehouseStock,
    setWarehouseStock,
    purchases,
    setPurchases,
    onLog,
    products,
    currentUser,
    userCashBalance = 0,
    onRegisterPurchase,
}) {
    const [purchase, setPurchase] = useState({
        invoiceNumber: '',
        supplier: '',
        productId: '',
        quantity: 0,
        unitCost: 0
    });
    const purchasesPagination = usePagination(purchases, 15);

    const { sortedRows: sortedWarehouseProducts, sortConfig: warehouseSort, setSortKey: setWarehouseSortKey } = useTableSort(
        products,
        {
            name: { getValue: (p) => p?.name || '', type: 'string' },
            stock: { getValue: (p) => Number(warehouseStock?.[p?.id] || 0), type: 'number' },
        },
        'name'
    );

    const handleSave = async (e) => {
        e.preventDefault();
        if (!purchase.invoiceNumber || !purchase.productId || purchase.quantity <= 0) {
            return alert("Complete todos los campos correctamente");
        }

        const product = products.find(p => String(p.id) === String(purchase.productId));
        const qty = Number(purchase.quantity);
        const unitCost = Number(purchase.unitCost) || 0;
        const totalCost = qty * unitCost;
        if (!Number.isFinite(totalCost) || totalCost <= 0) {
            return alert("El total de la inversion debe ser mayor a 0");
        }
        if (totalCost > Number(userCashBalance || 0)) {
            return alert(`Saldo insuficiente en caja para registrar la inversion. Disponible: $${Number(userCashBalance || 0).toLocaleString()}`);
        }

        const newPurchase = {
            ...purchase,
            productName: product?.name || 'Producto Desconocido',
            unitCost,
            date: new Date().toISOString(),
            user_id: currentUser?.id || null,
            user_name: currentUser?.name || currentUser?.email || 'Sistema',
        };

        try {
            await onRegisterPurchase?.(newPurchase);
        } catch (error) {
            const message = error?.message || 'Error desconocido';
            return alert(`No se pudo registrar la compra.\n\nDetalle: ${message}`);
        }

        // Update Warehouse Stock
        setWarehouseStock(prev => ({
            ...prev,
            [purchase.productId]: (prev[purchase.productId] || 0) + qty
        }));

        // Add to history logs (Purchases)
        setPurchases([newPurchase, ...purchases]);

        onLog?.({
            module: 'Compras',
            action: 'Registrar Compra',
            details: `Compra #${purchase.invoiceNumber} proveedor ${purchase.supplier} - ${qty} x ${product?.name || purchase.productId} | Total: $${totalCost.toLocaleString()} | Caja usuario: ${currentUser?.name || currentUser?.email || 'Sistema'}`
        });

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
        const product = products.find((p) => String(p.id) === String(productId));
        onLog?.({
            module: 'Compras',
            action: 'Traslado Bodega a Ventas',
            details: `Se traslado ${amount} unidad(es) de ${product?.name || productId} desde bodega a ventas`
        });
        alert(`Se distribuyeron ${amount} unidades del producto a los puntos de venta.`);
    };

    return (
        <div className="purchasing-container">
            <h2>Modulo de Compras (Entrada a Bodega)</h2>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2rem' }}>
                <div className="card">
                    <h3 style={{ marginTop: 0 }}>Registrar Factura de Compra</h3>
                    <p style={{ marginTop: 0, color: '#64748b' }}>
                        Caja disponible: ${Number(userCashBalance || 0).toLocaleString()}
                    </p>
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
                                <th style={{ padding: '0.5rem', textAlign: 'left' }}>
                                    <SortButton label="Producto" sortKey="name" sortConfig={warehouseSort} onChange={setWarehouseSortKey} />
                                </th>
                                <th style={{ padding: '0.5rem', textAlign: 'center' }}>
                                    <SortButton label="Stock Bodega" sortKey="stock" sortConfig={warehouseSort} onChange={setWarehouseSortKey} />
                                </th>
                                <th style={{ padding: '0.5rem', textAlign: 'right' }}>AcciAn</th>
                            </tr>
                        </thead>
                        <tbody>
                            {sortedWarehouseProducts.map((p, idx) => (
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
                {purchasesPagination.totalItems === 0 ? <p>No hay registros aAn.</p> : (
                    <ul style={{ listStyle: 'none', padding: 0 }}>
                        {purchasesPagination.pageItems.map((log, i) => (
                            <li key={i} style={{ padding: '0.5rem 0', borderBottom: '1px solid #f1f5f9' }}>
                                {new Date(log.date).toLocaleDateString()}: Factura <strong>#{log.invoiceNumber}</strong> de <strong>{log.supplier}</strong> - Ingresaron {log.quantity} de {log.productName} (Costo: ${Number(log.unitCost).toLocaleString()} | Total: ${(log.quantity * log.unitCost).toLocaleString()})
                            </li>
                        ))}
                    </ul>
                )}
                <PaginationControls
                    page={purchasesPagination.page}
                    totalPages={purchasesPagination.totalPages}
                    totalItems={purchasesPagination.totalItems}
                    pageSize={purchasesPagination.pageSize}
                    onPageChange={purchasesPagination.setPage}
                />
            </div>
        </div>
    );
}
