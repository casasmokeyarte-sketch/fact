import React, { useMemo, useState } from 'react';

const INITIAL_EXCHANGE = {
    clientId: '',
    productIdGiven: '',
    quantityGiven: 1,
    affectsInventory: true,
    productIdReceived: '',
    quantityReceived: 1,
    receivedConcept: '',
    notes: ''
};

export function TruequeModule({ products, stock, clients, onCommitExchange, onLog }) {
    const [exchange, setExchange] = useState(INITIAL_EXCHANGE);
    const saleableProducts = useMemo(
        () => (Array.isArray(products) ? products : []).filter(Boolean),
        [products]
    );
    const availableClients = useMemo(
        () => (Array.isArray(clients) ? clients : []).filter(Boolean),
        [clients]
    );

    const handleExchange = async () => {
        const quantityGiven = Math.max(1, Math.trunc(Number(exchange.quantityGiven) || 0));
        const quantityReceived = Math.max(1, Math.trunc(Number(exchange.quantityReceived) || 0));
        const affectsInventory = exchange.affectsInventory !== false;

        if (!exchange.clientId || !exchange.productIdGiven) {
            return alert('Seleccione cliente y producto entregado.');
        }

        if (affectsInventory && !exchange.productIdReceived) {
            return alert('Seleccione el producto que va a ingresar al inventario.');
        }

        if (!affectsInventory && !String(exchange.receivedConcept || '').trim()) {
            return alert('Describa lo que se recibe si no afecta inventario.');
        }

        if ((stock?.ventas?.[exchange.productIdGiven] || 0) < quantityGiven) {
            return alert('No hay suficiente stock para entregar este producto.');
        }

        const client = availableClients.find((c) => String(c?.id || '') === String(exchange.clientId || ''));
        const prodOut = saleableProducts.find((p) => String(p?.id || '') === String(exchange.productIdGiven || ''));
        const prodIn = saleableProducts.find((p) => String(p?.id || '') === String(exchange.productIdReceived || ''));

        try {
            await onCommitExchange?.({
                ...exchange,
                quantityGiven,
                quantityReceived,
                affectsInventory,
                clientName: client?.name || 'Cliente',
                productNameGiven: prodOut?.name || 'Producto',
                productNameReceived: affectsInventory
                    ? (prodIn?.name || 'Producto')
                    : String(exchange.receivedConcept || '').trim(),
                notes: String(exchange.notes || '').trim(),
            });

            onLog?.({
                module: 'Trueque',
                action: 'Intercambio Realizado',
                details: affectsInventory
                    ? `Cliente: ${client?.name}. Entregado: ${prodOut?.name} x${quantityGiven}. Recibido: ${prodIn?.name} x${quantityReceived}.`
                    : `Cliente: ${client?.name}. Entregado: ${prodOut?.name} x${quantityGiven}. Recibido fuera de inventario: ${String(exchange.receivedConcept || '').trim()}.`
            });

            alert(affectsInventory
                ? 'Trueque guardado. El inventario fue actualizado.'
                : 'Trueque guardado. No se afecto el inventario de ingreso.');
            setExchange(INITIAL_EXCHANGE);
        } catch (error) {
            alert(error?.message || 'No se pudo registrar el trueque.');
        }
    };

    return (
        <div className="trueque-module">
            <h2>Modulo de Trueque</h2>
            <div className="card" style={{ maxWidth: '760px', margin: '0 auto' }}>
                <p style={{ color: '#64748b', marginBottom: '1.5rem' }}>
                    Registre lo que se entrega al cliente, lo que se recibe y si el ingreso debe o no afectar inventario.
                </p>

                <div className="input-group">
                    <label className="input-label">Cliente</label>
                    <select
                        className="input-field"
                        value={exchange.clientId}
                        onChange={(e) => setExchange({ ...exchange, clientId: e.target.value })}
                    >
                        <option value="">Seleccione cliente...</option>
                        {availableClients.map((c, idx) => (
                            <option
                                key={`${c?.id || c?.document || c?.name || 'cliente'}-${idx}`}
                                value={c?.id || ''}
                            >
                                {c?.name || 'Cliente'}{c?.document ? ` - ${c.document}` : ''}
                            </option>
                        ))}
                    </select>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1.6fr 0.8fr', gap: '1rem' }}>
                    <div className="input-group">
                        <label className="input-label">Producto entregado</label>
                        <select
                            className="input-field"
                            value={exchange.productIdGiven}
                            onChange={(e) => setExchange({ ...exchange, productIdGiven: e.target.value })}
                        >
                            <option value="">Seleccione...</option>
                            {saleableProducts.map((p, idx) => (
                                <option key={`${p?.id || p?.name || 'product'}-given-${idx}`} value={p?.id || ''}>
                                    {p?.name || 'Producto'} (Stock: {Number(stock?.ventas?.[p?.id] || 0)})
                                </option>
                            ))}
                        </select>
                    </div>

                    <div className="input-group">
                        <label className="input-label">Cantidad entregada</label>
                        <input
                            type="number"
                            className="input-field"
                            value={exchange.quantityGiven}
                            min="1"
                            onChange={(e) => setExchange({ ...exchange, quantityGiven: Number(e.target.value) })}
                        />
                    </div>
                </div>

                <div className="input-group">
                    <label className="input-label">Lo recibido afecta inventario</label>
                    <select
                        className="input-field"
                        value={exchange.affectsInventory ? 'si' : 'no'}
                        onChange={(e) => setExchange({
                            ...exchange,
                            affectsInventory: e.target.value === 'si',
                            productIdReceived: e.target.value === 'si' ? exchange.productIdReceived : '',
                            receivedConcept: e.target.value === 'si' ? '' : exchange.receivedConcept,
                        })}
                    >
                        <option value="si">Si, ingresa a inventario</option>
                        <option value="no">No, es otra cosa y no afecta inventario</option>
                    </select>
                </div>

                {exchange.affectsInventory ? (
                    <div style={{ display: 'grid', gridTemplateColumns: '1.6fr 0.8fr', gap: '1rem' }}>
                        <div className="input-group">
                            <label className="input-label">Producto recibido</label>
                            <select
                                className="input-field"
                                value={exchange.productIdReceived}
                                onChange={(e) => setExchange({ ...exchange, productIdReceived: e.target.value })}
                            >
                                <option value="">Seleccione...</option>
                                {saleableProducts.map((p, idx) => (
                                    <option key={`${p?.id || p?.name || 'product'}-received-${idx}`} value={p?.id || ''}>
                                        {p?.name || 'Producto'}
                                    </option>
                                ))}
                            </select>
                        </div>

                        <div className="input-group">
                            <label className="input-label">Cantidad recibida</label>
                            <input
                                type="number"
                                className="input-field"
                                value={exchange.quantityReceived}
                                min="1"
                                onChange={(e) => setExchange({ ...exchange, quantityReceived: Number(e.target.value) })}
                            />
                        </div>
                    </div>
                ) : (
                    <div className="input-group">
                        <label className="input-label">Que se recibe</label>
                        <input
                            type="text"
                            className="input-field"
                            value={exchange.receivedConcept}
                            onChange={(e) => setExchange({ ...exchange, receivedConcept: e.target.value })}
                            placeholder="Ej: dinero adicional, accesorio externo, garantia, servicio"
                        />
                    </div>
                )}

                <div className="input-group">
                    <label className="input-label">Observaciones</label>
                    <textarea
                        className="input-field"
                        rows="3"
                        value={exchange.notes}
                        onChange={(e) => setExchange({ ...exchange, notes: e.target.value })}
                        placeholder="Opcional"
                    />
                </div>

                <button className="btn btn-primary" onClick={handleExchange} style={{ width: '100%', marginTop: '1rem' }}>
                    Confirmar Trueque
                </button>
            </div>
        </div>
    );
}
