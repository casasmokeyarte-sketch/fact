import React, { useState } from 'react';

export function TruequeModule({ products, stock, setStock, clients, onLog }) {
    const [exchange, setExchange] = useState({
        clientId: '',
        productIdGiven: '',
        productIdReceived: '',
        quantity: 1
    });

    const handleExchange = () => {
        if (!exchange.clientId || !exchange.productIdGiven || !exchange.productIdReceived) {
            return alert("Complete todos los campos del trueque.");
        }

        const { productIdGiven, productIdReceived, quantity } = exchange;

        // Validate stock for product given (decreases)
        if ((stock.ventas[productIdGiven] || 0) < quantity) {
            return alert("No hay suficiente stock para entregar este producto.");
        }

        const newStock = {
            ...stock,
            ventas: {
                ...stock.ventas,
                [productIdGiven]: (stock.ventas[productIdGiven] || 0) - quantity,
                [productIdReceived]: (stock.ventas[productIdReceived] || 0) + quantity
            }
        };

        const client = clients.find(c => c.id === exchange.clientId);
        const prodOut = products.find(p => p.id === productIdGiven);
        const prodIn = products.find(p => p.id === productIdReceived);

        setStock(newStock);
        onLog?.({
            module: 'Trueque',
            action: 'Intercambio Realizado',
            details: `Cliente: ${client?.name}. Entregado: ${prodOut?.name} x${quantity}. Recibido: ${prodIn?.name} x${quantity}.`
        });

        alert("ATrueque realizado con Axito! Inventario actualizado.");
        setExchange({ clientId: '', productIdGiven: '', productIdReceived: '', quantity: 1 });
    };

    return (
        <div className="trueque-module">
            <h2>Modulo de Trueque (Intercambio)</h2>
            <div className="card" style={{ maxWidth: '600px', margin: '0 auto' }}>
                <p style={{ color: '#64748b', marginBottom: '1.5rem' }}>
                    Realice intercambios directos de productos con clientes. El sistema actualizarA el stock automAticamente.
                </p>

                <div className="input-group">
                    <label className="input-label">Cliente</label>
                    <select
                        className="input-field"
                        value={exchange.clientId}
                        onChange={e => setExchange({ ...exchange, clientId: e.target.value })}
                    >
                        <option value="">Seleccione cliente...</option>
                        {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                    <div className="input-group">
                        <label className="input-label">Producto ENTREGADO (Sale de Stock)</label>
                        <select
                            className="input-field"
                            value={exchange.productIdGiven}
                            onChange={e => setExchange({ ...exchange, productIdGiven: e.target.value })}
                        >
                            <option value="">Seleccione...</option>
                            {products.map((p, idx) => (
                                <option key={`${p.id}-${idx}`} value={p.id}>{p.name} (Stock: {stock.ventas[p.id] || 0})</option>
                            ))}
                        </select>
                    </div>

                    <div className="input-group">
                        <label className="input-label">Producto RECIBIDO (Suma a Stock)</label>
                        <select
                            className="input-field"
                            value={exchange.productIdReceived}
                            onChange={e => setExchange({ ...exchange, productIdReceived: e.target.value })}
                        >
                            <option value="">Seleccione...</option>
                            {products.map((p, idx) => <option key={`${p.id}-${idx}`} value={p.id}>{p.name}</option>)}
                        </select>
                    </div>
                </div>

                <div className="input-group">
                    <label className="input-label">Cantidad del Intercambio</label>
                    <input
                        type="number"
                        className="input-field"
                        value={exchange.quantity}
                        min="1"
                        onChange={e => setExchange({ ...exchange, quantity: Number(e.target.value) })}
                    />
                </div>

                <button className="btn btn-primary" onClick={handleExchange} style={{ width: '100%', marginTop: '1rem' }}>
                    Confirmar Trueque
                </button>
            </div>
        </div>
    );
}
