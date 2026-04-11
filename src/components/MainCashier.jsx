import React, { useEffect, useMemo, useState } from 'react';

export function MainCashier({
    currentUser,
    users,
    warehouseStock,
    setWarehouseStock,
    onLog,
    products,
    cajaMayor,
    setCajaMayor,
    cajaMenor,
    setCajaMenor,
    userCashBalances,
    getCashUserKey,
    getUserCashBalance,
    adjustUserCashBalance,
    inventoryTransferRequests,
    onCreateInventoryTransfer,
    onResolveInventoryTransfer,
    salesHistory,
    expenses,
    shopStock,
    setShopStock
}) {
    const isCajero = currentUser?.role === 'Cajero';
    const [subTab, setSubTab] = useState(isCajero ? 'cajero' : 'flujo');
    const [transfer, setTransfer] = useState({ productId: '', quantity: 0, target: '' });
    const [transferAmount, setTransferAmount] = useState(0);
    const [adminTransfer, setAdminTransfer] = useState({ userKey: '', amount: 0 });

    const canTransferCash = !isCajero && (currentUser?.permissions?.caja?.mover_efectivo !== false);
    const canDistributeInventory = !isCajero && (currentUser?.permissions?.caja?.distribuir_inventario !== false);
    const canReceiveTransfer = isCajero || (currentUser?.permissions?.caja?.transferir === true);

    useEffect(() => {
        if (isCajero) setSubTab('cajero');
    }, [isCajero]);

    const normalizePaymentMethod = (value) => String(value || '')
        .trim()
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '');

    const isFinanciallyClosedInvoice = (sale) => {
        const status = String(sale?.status || '').trim().toLowerCase();
        return status === 'anulada' || status === 'devuelta';
    };

    const resolveNetSaleTotal = (sale) => {
        const storedTotal = Number(sale?.total || 0);
        const subtotal = Number(sale?.subtotal || 0);
        const deliveryFee = Number(sale?.deliveryFee ?? sale?.delivery_fee ?? 0);
        const discount = sale?.mixedDetails?.discount || sale?.mixed_details?.discount || {};
        const totalDiscount = Number(
            sale?.totalDiscount ??
            discount?.totalAmount ??
            (
                Number(sale?.promoDiscountAmount ?? discount?.promoAmount ?? 0) +
                Number(sale?.automaticDiscountAmount ?? discount?.automaticAmount ?? 0) +
                Number(sale?.extraDiscount ?? discount?.extraAmount ?? 0)
            )
        );
        const computedNet = subtotal > 0
            ? Math.max(0, subtotal + deliveryFee - totalDiscount)
            : storedTotal;

        if (subtotal > 0 && Math.abs(computedNet - storedTotal) > 0.009) {
            return computedNet;
        }

        return storedTotal;
    };

    const getCashPortionFromSale = (sale) => {
        const total = resolveNetSaleTotal(sale);
        const paymentMode = String(sale?.paymentMode || '');
        const mixedParts = Array.isArray(sale?.mixedDetails?.parts) ? sale.mixedDetails.parts : [];

        if (paymentMode === 'Mixto' || paymentMode.startsWith('Mixto')) {
            if (mixedParts.length > 0) {
                return mixedParts.reduce((sum, part) => {
                    const method = normalizePaymentMethod(part?.method);
                    return method.includes('efectivo') || method.includes('contado') || method.includes('cash')
                        ? sum + (Number(part?.amount || 0))
                        : sum;
                }, 0);
            }
            return Number(sale?.mixedDetails?.cash || 0);
        }

        const normalizedMode = normalizePaymentMethod(paymentMode);
        return normalizedMode.includes('efectivo') || normalizedMode.includes('contado') || normalizedMode.includes('cash')
            ? total
            : 0;
    };

    const getCashAbonosFromSale = (sale) => {
        const abonos = Array.isArray(sale?.abonos)
            ? sale.abonos
            : (Array.isArray(sale?.mixedDetails?.cartera?.abonos) ? sale.mixedDetails.cartera.abonos : []);

        return abonos.reduce((sum, abono) => {
            const method = normalizePaymentMethod(abono?.method);
            if (method.includes('efectivo') || method.includes('contado') || method.includes('cash')) {
                return sum + (Number(abono?.amount || 0));
            }
            return sum;
        }, 0);
    };

    const today = new Date().toLocaleDateString();
    const dailyCashIncome = salesHistory
        .filter((s) => !isFinanciallyClosedInvoice(s))
        .filter((s) => new Date(s.date).toLocaleDateString() === today)
        .reduce((sum, s) => sum + getCashPortionFromSale(s) + getCashAbonosFromSale(s), 0);

    const dailyExpenses = expenses
        .filter((e) => new Date(e.date).toLocaleDateString() === today)
        .reduce((sum, e) => sum + Number(e.amount), 0);

    const currentUserKey = getCashUserKey?.(currentUser);
    const cajeroBalance = getUserCashBalance?.(currentUser) || 0;

    const asesorOptions = useMemo(() => {
        const base = (users || [])
            .filter((u) => u?.role !== 'Administrador')
            .map((u) => ({
                ...u,
                cashKey: getCashUserKey?.(u) || String(u?.id || u?.username || '')
            }))
            .filter((u) => u.cashKey);

        if (currentUserKey && !base.some((u) => u.cashKey === currentUserKey)) {
            base.unshift({
                ...currentUser,
                cashKey: currentUserKey,
                name: currentUser?.name || currentUser?.email || 'Usuario actual'
            });
        }

        return base;
    }, [users, currentUser, currentUserKey, getCashUserKey]);

    const selectedAsesor = asesorOptions.find((u) => u.cashKey === adminTransfer.userKey);
    const selectedTransferReceiver = asesorOptions.find((u) => u.cashKey === transfer.target);
    const pendingInventoryTransfers = useMemo(() => (
        (inventoryTransferRequests || []).filter((request) => request?.status === 'PENDING')
    ), [inventoryTransferRequests]);
    const myPendingInventoryTransfers = useMemo(() => (
        pendingInventoryTransfers.filter((request) => String(request?.targetUserKey || '') === String(currentUserKey || ''))
    ), [pendingInventoryTransfers, currentUserKey]);

    const handleInventoryTransfer = async () => {
        try {
            if (!transfer.productId || Number(transfer.quantity) <= 0 || !transfer.target) {
                return alert('Complete los datos');
            }

            await onCreateInventoryTransfer?.({
                productId: transfer.productId,
                quantity: Number(transfer.quantity),
                targetUserId: selectedTransferReceiver?.id || null,
                targetUserKey: transfer.target,
                targetUserName: selectedTransferReceiver?.name || selectedTransferReceiver?.username || selectedTransferReceiver?.email || transfer.target
            });

            alert(`Traslado enviado a ${selectedTransferReceiver?.name || 'usuario'}. Debe recibirlo y confirmarlo.`);
            setTransfer({ productId: '', quantity: 0, target: '' });
        } catch (error) {
            alert(error?.message || 'No se pudo registrar el traslado.');
        }
    };

    const handleResolveInventoryTransfer = async (requestId, decision) => {
        try {
            await onResolveInventoryTransfer?.(requestId, decision);
            alert(decision === 'CONFIRMED' ? 'Traslado confirmado.' : 'Traslado rechazado y devuelto a bodega.');
        } catch (error) {
            alert(error?.message || 'No se pudo resolver el traslado.');
        }
    };

    const moveCash = (from, to, amount) => {
        if (amount <= 0 || isNaN(amount)) return;

        if (from === 'Mayor') {
            if (cajaMayor < amount) return alert('Saldo insuficiente en Caja Mayor');
            setCajaMayor((prev) => prev - amount);
            setCajaMenor((prev) => prev + amount);
        } else {
            if (cajaMenor < amount) return alert('Saldo insuficiente en Caja Menor');
            setCajaMenor((prev) => prev - amount);
            setCajaMayor((prev) => prev + amount);
        }

        onLog?.({
            module: 'Caja Principal',
            action: 'Movimiento Efectivo',
            details: `Movimiento de $${amount.toLocaleString()} de Caja ${from} a Caja ${to}`
        });
    };

    const receiveMoney = () => {
        if (!canReceiveTransfer) return alert('No tiene permisos para transferencias');
        if (!currentUserKey) return alert('Usuario sin identificador de caja');
        if (transferAmount <= 0 || isNaN(transferAmount)) return alert('Ingrese un monto valido');
        if (cajaMayor < transferAmount) return alert('Saldo insuficiente en Caja Mayor');

        setCajaMayor((prev) => prev - transferAmount);
        adjustUserCashBalance?.(currentUser, transferAmount);

        onLog?.({
            module: 'Caja Principal',
            action: 'Recibir Dinero',
            details: `Usuario ${currentUser?.name || currentUser?.email || 'N/A'} recibio $${transferAmount.toLocaleString()} de Caja Mayor`
        });

        alert(`Recibido $${transferAmount.toLocaleString()} en su caja`);
        setTransferAmount(0);
    };

    const returnMoney = () => {
        if (!canReceiveTransfer) return alert('No tiene permisos para transferencias');
        if (!currentUserKey) return alert('Usuario sin identificador de caja');
        if (transferAmount <= 0 || isNaN(transferAmount)) return alert('Ingrese un monto valido');
        if (cajeroBalance < transferAmount) return alert('Saldo insuficiente en su caja');

        adjustUserCashBalance?.(currentUser, -transferAmount);
        setCajaMayor((prev) => prev + transferAmount);

        onLog?.({
            module: 'Caja Principal',
            action: 'Devolver Dinero',
            details: `Usuario ${currentUser?.name || currentUser?.email || 'N/A'} devolvio $${transferAmount.toLocaleString()} a Caja Mayor`
        });

        alert(`Devuelto $${transferAmount.toLocaleString()} a Caja Mayor`);
        setTransferAmount(0);
    };

    const transferToAsesor = () => {
        const amount = Number(adminTransfer.amount);
        if (!adminTransfer.userKey || !selectedAsesor) return alert('Seleccione un asesor');
        if (amount <= 0 || isNaN(amount)) return alert('Ingrese un monto valido');
        if (cajaMayor < amount) return alert('Saldo insuficiente en Caja Mayor');

        setCajaMayor((prev) => prev - amount);
        adjustUserCashBalance?.(selectedAsesor, amount);

        onLog?.({
            module: 'Caja Principal',
            action: 'Transferencia a Usuario',
            details: `Se transfirio $${amount.toLocaleString()} desde Caja Mayor a ${selectedAsesor.name || selectedAsesor.username || selectedAsesor.email || selectedAsesor.cashKey}`
        });

        alert(`Transferencia realizada a ${selectedAsesor.name || selectedAsesor.username || 'usuario'}`);
        setAdminTransfer((prev) => ({ ...prev, amount: 0 }));
    };

    const collectFromAsesor = () => {
        const amount = Number(adminTransfer.amount);
        if (!adminTransfer.userKey || !selectedAsesor) return alert('Seleccione un asesor');
        if (amount <= 0 || isNaN(amount)) return alert('Ingrese un monto valido');

        const asesorBalance = Number(userCashBalances?.[selectedAsesor.cashKey] || 0);
        if (asesorBalance < amount) return alert('El asesor no tiene saldo suficiente');

        adjustUserCashBalance?.(selectedAsesor, -amount);
        setCajaMayor((prev) => prev + amount);

        onLog?.({
            module: 'Caja Principal',
            action: 'Recaudo desde Usuario',
            details: `Se recaudo $${amount.toLocaleString()} desde ${selectedAsesor.name || selectedAsesor.username || selectedAsesor.email || selectedAsesor.cashKey} hacia Caja Mayor`
        });

        alert(`Recaudo registrado para ${selectedAsesor.name || selectedAsesor.username || 'usuario'}`);
        setAdminTransfer((prev) => ({ ...prev, amount: 0 }));
    };

    return (
        <div className="main-cashier">
            <h2>Modulo de Caja Principal</h2>
            <div style={{ display: 'flex', gap: '1rem', marginBottom: '1.5rem' }}>
                {!isCajero && (
                    <button className={`btn ${subTab === 'flujo' ? 'btn-primary' : ''}`} onClick={() => setSubTab('flujo')}>
                        Manejo de Cajas (Mayor/Menor)
                    </button>
                )}
                {!isCajero && canDistributeInventory && (
                    <button className={`btn ${subTab === 'transferencias' ? 'btn-primary' : ''}`} onClick={() => setSubTab('transferencias')}>
                        Distribuir Inventario
                    </button>
                )}
                {isCajero && (
                    <button className={`btn ${subTab === 'cajero' ? 'btn-primary' : ''}`} onClick={() => setSubTab('cajero')}>
                        Mi Caja (Transferencias)
                    </button>
                )}
            </div>

            {!isCajero && subTab === 'flujo' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
                    <div className="card card--muted" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', textAlign: 'center' }}>
                        <div>
                            <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Ingresos en Efectivo del Dia</p>
                            <p style={{ fontSize: '1.2rem', fontWeight: 'bold', color: '#10b981' }}>+ ${dailyCashIncome.toLocaleString()}</p>
                        </div>
                        <div>
                            <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Gastos del Dia</p>
                            <p style={{ fontSize: '1.2rem', fontWeight: 'bold', color: '#ef4444' }}>- ${dailyExpenses.toLocaleString()}</p>
                        </div>
                        <div>
                            <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Balance Operativo</p>
                            <p style={{ fontSize: '1.2rem', fontWeight: 'bold' }}>$ {(dailyCashIncome - dailyExpenses).toLocaleString()}</p>
                        </div>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2rem' }}>
                        <div className="card" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', borderTop: '4px solid var(--primary-color)' }}>
                            <span style={{ fontSize: '3rem' }}></span>
                            <h3>Caja Mayor</h3>
                            <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>Fondo de Reserva / Boveda</p>
                            <p style={{ fontSize: '2rem', fontWeight: 'bold', margin: '1rem 0' }}>${cajaMayor.toLocaleString()}</p>
                            {canTransferCash && (
                                <button className="btn btn-primary" onClick={() => {
                                    const amount = Number(prompt('Monto a enviar de Caja Mayor a Menor para transacciones:'));
                                    if (amount) moveCash('Mayor', 'Menor', amount);
                                }}>Enviar a Caja Menor</button>
                            )}
                        </div>

                        <div className="card" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', borderTop: '4px solid #10b981' }}>
                            <span style={{ fontSize: '3rem' }}></span>
                            <h3>Caja Menor</h3>
                            <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>Fondo para Operaciones Diarias</p>
                            <p style={{ fontSize: '2rem', fontWeight: 'bold', margin: '1rem 0' }}>${(cajaMenor + dailyCashIncome - dailyExpenses).toLocaleString()}</p>
                            {canTransferCash && (
                                <button className="btn" onClick={() => {
                                    const amount = Number(prompt('Monto a retornar de Caja Menor hacia Caja Mayor:'));
                                    if (amount) moveCash('Menor', 'Mayor', amount);
                                }}>Retornar a Mayor</button>
                            )}
                        </div>
                    </div>

                    <div className="card" style={{ borderTop: '4px solid #0ea5e9' }}>
                        <h3 style={{ marginTop: 0 }}>Transferencia Individual a Asesores</h3>
                        <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr auto auto', gap: '0.75rem', alignItems: 'end' }}>
                            <div className="input-group" style={{ marginBottom: 0 }}>
                                <label className="input-label">Asesor / Usuario</label>
                                <select
                                    className="input-field"
                                    value={adminTransfer.userKey}
                                    onChange={(e) => setAdminTransfer((prev) => ({ ...prev, userKey: e.target.value }))}
                                >
                                    <option value="">Seleccione...</option>
                                    {asesorOptions.map((u) => (
                                        <option key={u.cashKey} value={u.cashKey}>
                                            {(u.name || u.username || u.email || u.cashKey)} - Saldo: ${(Number(userCashBalances?.[u.cashKey] || 0)).toLocaleString()}
                                        </option>
                                    ))}
                                </select>
                            </div>
                            <div className="input-group" style={{ marginBottom: 0 }}>
                                <label className="input-label">Monto</label>
                                <input
                                    type="number"
                                    className="input-field"
                                    value={adminTransfer.amount}
                                    onChange={(e) => setAdminTransfer((prev) => ({ ...prev, amount: Number(e.target.value) || 0 }))}
                                />
                            </div>
                            <button className="btn btn-primary" onClick={transferToAsesor}>Transferir</button>
                            <button className="btn" style={{ backgroundColor: '#e2e8f0' }} onClick={collectFromAsesor}>Recaudar</button>
                        </div>
                    </div>
                </div>
            )}

            {!isCajero && subTab === 'transferencias' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                    <div className="card">
                        <h3>Traslado de Inventario</h3>
                        <p style={{ color: 'var(--text-secondary)' }}>
                            El sistema descuenta de <strong>Bodega</strong> al crear el pase y deja la recepcion pendiente
                            hasta que el usuario destino confirme la entrada a <strong>Ventas</strong>.
                        </p>

                        <div style={{ display: 'grid', gridTemplateColumns: '1.3fr 0.8fr 1fr auto', gap: '1rem', alignItems: 'end', marginTop: '1rem' }}>
                            <div className="input-group">
                                <label className="input-label">Producto</label>
                                <select className="input-field" value={transfer.productId} onChange={(e) => setTransfer({ ...transfer, productId: e.target.value })}>
                                    <option value="">Seleccione...</option>
                                    {products.map((p, idx) => (
                                        <option key={`${p.id}-${idx}`} value={p.id}>{p.name} (Bodega: {warehouseStock[p.id] || 0})</option>
                                    ))}
                                </select>
                            </div>
                            <div className="input-group">
                                <label className="input-label">Cantidad</label>
                                <input type="number" className="input-field" value={transfer.quantity} onChange={(e) => setTransfer({ ...transfer, quantity: Number(e.target.value) || 0 })} />
                            </div>
                            <div className="input-group">
                                <label className="input-label">Usuario receptor</label>
                                <select className="input-field" value={transfer.target} onChange={(e) => setTransfer({ ...transfer, target: e.target.value })}>
                                    <option value="">Seleccione...</option>
                                    {asesorOptions.map((u) => (
                                        <option key={u.cashKey} value={u.cashKey}>
                                            {u.name || u.username || u.email || u.cashKey}
                                        </option>
                                    ))}
                                </select>
                            </div>
                            <button className="btn btn-primary" onClick={handleInventoryTransfer}>Hacer Pase</button>
                        </div>
                    </div>

                    <div className="card">
                        <h3 style={{ marginTop: 0 }}>Pases Pendientes</h3>
                        {pendingInventoryTransfers.length === 0 ? (
                            <p style={{ marginBottom: 0, color: 'var(--text-secondary)' }}>No hay pases de inventario pendientes.</p>
                        ) : (
                            <table>
                                <thead>
                                    <tr>
                                        <th>Fecha</th>
                                        <th>Producto</th>
                                        <th>Cantidad</th>
                                        <th>Receptor</th>
                                        <th>Enviado por</th>
                                        <th>Estado</th>
                                        <th>Accion</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {pendingInventoryTransfers.map((request) => (
                                        <tr key={request.id}>
                                            <td>{new Date(request.createdAt).toLocaleString()}</td>
                                            <td>{request.productName}</td>
                                            <td>{request.quantity}</td>
                                            <td>{request.targetUserName}</td>
                                            <td>{request.createdBy?.name || 'Sistema'}</td>
                                            <td>Pendiente</td>
                                            <td>
                                                {String(request?.targetUserKey || '') === String(currentUserKey || '') ? (
                                                    <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
                                                        <button className="btn btn-primary" onClick={() => handleResolveInventoryTransfer(request.id, 'CONFIRMED')}>
                                                            Recibir
                                                        </button>
                                                        <button className="btn" style={{ backgroundColor: '#e2e8f0' }} onClick={() => handleResolveInventoryTransfer(request.id, 'REJECTED')}>
                                                            Rechazar
                                                        </button>
                                                    </div>
                                                ) : (
                                                    <span style={{ color: 'var(--text-secondary)' }}>Esperando receptor</span>
                                                )}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        )}
                    </div>
                </div>
            )}

            {isCajero && subTab === 'cajero' && (
                <div className="card">
                    <h3>Mi Caja - Modo Cajero</h3>
                    <p style={{ color: 'var(--text-secondary)' }}>Su saldo queda guardado por usuario y continua para la siguiente apertura.</p>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2rem', marginTop: '2rem' }}>
                        <div className="card card--success" style={{ borderTop: '4px solid #10b981' }}>
                            <div style={{ textAlign: 'center' }}>
                                <span style={{ fontSize: '3rem' }}></span>
                                <h4>Mi Balance Actual</h4>
                                <p style={{ fontSize: '2.5rem', fontWeight: 'bold', color: 'var(--success-color)' }}>${cajeroBalance.toLocaleString()}</p>
                                <p style={{ fontSize: '0.85em', color: 'var(--text-secondary)' }}>Dinero asociado a su usuario</p>
                            </div>
                        </div>

                        <div className="card card--danger" style={{ borderTop: '4px solid #ef4444' }}>
                            <div style={{ textAlign: 'center' }}>
                                <span style={{ fontSize: '3rem' }}></span>
                                <h4>Caja Mayor (Boveda)</h4>
                                <p style={{ fontSize: '2.5rem', fontWeight: 'bold', color: 'var(--danger-color)' }}>${cajaMayor.toLocaleString()}</p>
                                <p style={{ fontSize: '0.85em', color: 'var(--text-secondary)' }}>Fondo disponible para transferencias</p>
                            </div>
                        </div>
                    </div>

                    <div className="card card--muted" style={{ marginTop: '2rem' }}>
                        <h4>Realizar Transferencia</h4>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr auto auto', gap: '1rem', alignItems: 'end' }}>
                            <div className="input-group">
                                <label className="input-label">Monto ($)</label>
                                <input
                                    type="number"
                                    className="input-field"
                                    value={transferAmount}
                                    onChange={(e) => setTransferAmount(Number(e.target.value))}
                                    placeholder="Ingrese el monto"
                                />
                            </div>
                            <button className="btn btn-primary" onClick={receiveMoney} style={{ backgroundColor: '#10b981' }}>
                                Recibir de Boveda
                            </button>
                            <button className="btn" onClick={returnMoney} style={{ backgroundColor: '#3b82f6', color: 'white' }}>
                                Devolver a Boveda
                            </button>
                        </div>
                    </div>

                    <div className="card card--muted" style={{ marginTop: '2rem' }}>
                        <h4>Pases de Inventario por Confirmar</h4>
                        {myPendingInventoryTransfers.length === 0 ? (
                            <p style={{ marginBottom: 0, color: 'var(--text-secondary)' }}>No tiene inventario pendiente por recibir.</p>
                        ) : (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                                {myPendingInventoryTransfers.map((request) => (
                                    <div key={request.id} className="card" style={{ margin: 0, border: '1px solid var(--border-soft)' }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', alignItems: 'center', flexWrap: 'wrap' }}>
                                            <div>
                                                <div style={{ fontWeight: 700 }}>{request.productName}</div>
                                                <div style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
                                                    Cantidad: {request.quantity} | Enviado por: {request.createdBy?.name || 'Sistema'}
                                                </div>
                                                <div style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
                                                    Fecha: {new Date(request.createdAt).toLocaleString()}
                                                </div>
                                            </div>
                                            <div style={{ display: 'flex', gap: '0.5rem' }}>
                                                <button className="btn btn-primary" onClick={() => handleResolveInventoryTransfer(request.id, 'CONFIRMED')}>
                                                    Recibir
                                                </button>
                                                <button className="btn" style={{ backgroundColor: '#e2e8f0' }} onClick={() => handleResolveInventoryTransfer(request.id, 'REJECTED')}>
                                                    Rechazar
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}
