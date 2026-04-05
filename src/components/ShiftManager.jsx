import React, { useMemo, useState } from 'react';

const ACCOUNT_FIELDS = [
  { key: 'efectivo', label: 'Efectivo' },
  { key: 'transferencia', label: 'Transferencia' },
  { key: 'tarjeta', label: 'Tarjeta' },
  { key: 'credito', label: 'Credito (CxC)' },
  { key: 'otros', label: 'Otros' },
  { key: 'gastos', label: 'Gastos / Egresos' },
  { key: 'inversion', label: 'Compras / Inversion' },
];

const parseMoneyInput = (value) => Number(String(value || '').replace(/[^\d]/g, '')) || 0;
const POSITIVE_ACCOUNT_KEYS = ['efectivo', 'transferencia', 'tarjeta', 'credito', 'otros'];
const NEGATIVE_ACCOUNT_KEYS = ['gastos', 'inversion'];

const formatSignedMoney = (key, amount) => {
  const numericAmount = Number(amount || 0);
  const prefix = NEGATIVE_ACCOUNT_KEYS.includes(key) && numericAmount > 0 ? '-' : '';
  return `${prefix}$${Math.abs(numericAmount).toLocaleString()}`;
};

const normalizeInventoryDraftValue = (value) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) return '';
  return String(Math.trunc(parsed));
};

const isSmokeCategory = (value) => String(value || '')
  .trim()
  .toLowerCase()
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '') === 'smoke';

export function ShiftManager({
  shift,
  onStartShift,
  onEndShift,
  reconciliationPreview = null,
  products = [],
  stock = { ventas: {} },
  activeShiftInventorySummary = null,
  hideSystemResults = false,
  closeBlockers = [],
}) {
  const [showStartModal, setShowStartModal] = useState(false);
  const [showReconciliation, setShowReconciliation] = useState(false);
  const [initialCashInput, setInitialCashInput] = useState('');
  const [startInventoryDraft, setStartInventoryDraft] = useState({});
  const [accounts, setAccounts] = useState(() => (
    ACCOUNT_FIELDS.reduce((acc, f) => ({ ...acc, [f.key]: '' }), {})
  ));
  const [returnedInventoryDraft, setReturnedInventoryDraft] = useState({});
  const [supervisorNote, setSupervisorNote] = useState('');

  const availableShiftProducts = useMemo(() => (
    (products || [])
      .map((product) => ({
        productId: String(product?.id || ''),
        name: product?.name || 'Producto',
        category: product?.category || '',
        available: Number(stock?.ventas?.[product?.id] || 0),
        unit: product?.unit || 'un',
      }))
      .filter((product) => product.productId && product.available > 0 && isSmokeCategory(product.category))
      .sort((a, b) => String(a.name || '').localeCompare(String(b.name || '')))
  ), [products, stock]);

  const parsedAccounts = useMemo(() => (
    ACCOUNT_FIELDS.reduce((acc, f) => {
      acc[f.key] = parseMoneyInput(accounts[f.key]);
      return acc;
    }, {})
  ), [accounts]);

  const totalDeclared = useMemo(() => (
    POSITIVE_ACCOUNT_KEYS.reduce((sum, key) => sum + Number(parsedAccounts[key] || 0), 0)
  ), [parsedAccounts]);

  const differenceAmount = useMemo(() => {
    const systemNet = Number(reconciliationPreview?.netSystemTotal || 0);
    return totalDeclared - systemNet;
  }, [reconciliationPreview?.netSystemTotal, totalDeclared]);

  const allRequiredFilled = useMemo(() => (
    ACCOUNT_FIELDS.every((f) => String(accounts[f.key]).trim() !== '')
  ), [accounts]);

  const assignedRows = useMemo(() => (
    Object.entries(startInventoryDraft || {})
      .map(([productId, quantity]) => {
        const qty = Math.max(0, Math.trunc(Number(quantity) || 0));
        if (!productId || qty <= 0) return null;
        const product = availableShiftProducts.find((item) => item.productId === productId);
        if (!product) return null;
        return {
          productId,
          productName: product.name,
          quantity: qty,
          availableInSystem: product.available,
          unit: product.unit,
        };
      })
      .filter(Boolean)
  ), [availableShiftProducts, startInventoryDraft]);

  const closureRows = useMemo(() => (
    (activeShiftInventorySummary?.rows || []).map((row) => ({
      ...row,
      returnedQty: Object.prototype.hasOwnProperty.call(returnedInventoryDraft || {}, row.productId)
        ? Math.max(0, Math.trunc(Number(returnedInventoryDraft?.[row.productId] || 0) || 0))
        : '',
    }))
  ), [activeShiftInventorySummary?.rows, returnedInventoryDraft]);

  const handleAccountChange = (key, value) => {
    setAccounts((prev) => ({ ...prev, [key]: value }));
  };

  const handleStartInventoryChange = (productId, value) => {
    setStartInventoryDraft((prev) => ({ ...prev, [productId]: normalizeInventoryDraftValue(value) }));
  };

  const handleReturnedInventoryChange = (productId, value) => {
    setReturnedInventoryDraft((prev) => ({ ...prev, [productId]: normalizeInventoryDraftValue(value) }));
  };

  const resetStartState = () => {
    setInitialCashInput('');
    setStartInventoryDraft({});
  };

  const resetCloseState = () => {
    setShowReconciliation(false);
    setAccounts(ACCOUNT_FIELDS.reduce((acc, f) => ({ ...acc, [f.key]: '' }), {}));
    setReturnedInventoryDraft({});
    setSupervisorNote('');
  };

  const handleStartAttempt = () => {
    const invalidAssignment = assignedRows.find((row) => row.quantity > Number(row.availableInSystem || 0));
    if (invalidAssignment) {
      alert(`No puede entregar ${invalidAssignment.quantity} de ${invalidAssignment.productName}. En sistema solo hay ${invalidAssignment.availableInSystem}.`);
      return;
    }

    onStartShift(Number(initialCashInput || 0), {
      inventoryAssignments: assignedRows,
    });

    setShowStartModal(false);
    resetStartState();
  };

  const handleEndAttempt = () => {
    if (!allRequiredFilled) {
      alert('Debe diligenciar todas las cuentas. Si no hubo movimiento, escriba 0.');
      return;
    }

    if ((closeBlockers || []).length > 0) {
      alert(`No puede cerrar la jornada hasta resolver lo siguiente:\n\n- ${closeBlockers.join('\n- ')}`);
      return;
    }

    const missingInventoryRows = closureRows.filter((row) => (
      !Object.prototype.hasOwnProperty.call(returnedInventoryDraft || {}, row.productId) ||
      String(returnedInventoryDraft?.[row.productId] ?? '').trim() === ''
    ));
    if (missingInventoryRows.length > 0) {
      alert(`Debe registrar la cantidad fisica de cierre para todos los productos del turno. Pendientes: ${missingInventoryRows.map((row) => row.productName).join(', ')}`);
      return;
    }

    const inventoryRows = closureRows.map((row) => ({
      productId: row.productId,
      productName: row.productName,
      assignedQty: Number(row.assignedQty || 0),
      soldQty: Number(row.soldQty || 0),
      expectedQty: Number(row.expectedQty || 0),
      returnedQty: Number(row.returnedQty || 0),
      differenceQty: Number(row.returnedQty || 0) - Number(row.expectedQty || 0),
    }));

    onEndShift({
      reconciliation: {
        ...parsedAccounts,
        totalDeclarado: totalDeclared,
      },
      inventoryClosure: {
        returnedItems: inventoryRows,
        supervisorNote: String(supervisorNote || '').trim(),
      },
    });

    resetCloseState();
  };

  if (!shift) {
    return (
      <>
        <div className="card" style={{ textAlign: 'center', padding: '3rem' }}>
          <span style={{ fontSize: '4rem' }}>{'\uD83D\uDD52'}</span>
          <h2>Jornada No Iniciada</h2>
          <p>Debe iniciar su jornada laboral para acceder al sistema.</p>
          <button className="btn btn-primary" onClick={() => setShowStartModal(true)}>
            Iniciar Jornada
          </button>
        </div>

        {showStartModal && (
          <div className="modal-overlay" style={{
            position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
            backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000
          }}>
            <div className="card" style={{ width: '760px', maxWidth: '95vw', maxHeight: '90vh', overflowY: 'auto' }}>
              <h3 style={{ marginTop: 0 }}>Apertura de Jornada y Entrega de Inventario</h3>
              <p style={{ marginTop: 0, color: 'var(--text-secondary)' }}>
                Registre la base de caja y el inventario que se entrega al turno. Ese inventario sera el que el supervisor debera validar al cierre.
              </p>
              <p style={{ marginTop: '-0.2rem', color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
                No es obligatorio diligenciar todos los productos. Si no registra ninguno, la apertura pedira autorizacion del administrador.
              </p>

              <div className="input-group" style={{ maxWidth: '320px' }}>
                <label className="input-label">Base de Caja Inicial ($)</label>
                <input
                  type="number"
                  className="input-field"
                  placeholder="Ej: 100000"
                  value={initialCashInput}
                  onChange={(e) => setInitialCashInput(e.target.value)}
                />
              </div>

              <div style={{ marginTop: '1rem' }}>
                <div style={{ fontWeight: 700, marginBottom: '0.5rem' }}>Inventario entregado al turno</div>
                {availableShiftProducts.length === 0 ? (
                  <div className="badge" style={{ backgroundColor: 'var(--surface-muted)' }}>
                    No hay inventario disponible en ventas para la categoria Smoke.
                  </div>
                ) : (
                  <table>
                    <thead>
                      <tr>
                        <th>Producto</th>
                        <th>Entregado al turno</th>
                      </tr>
                    </thead>
                    <tbody>
                      {availableShiftProducts.map((product) => (
                        <tr key={product.productId}>
                          <td>{product.name}</td>
                          <td>
                            <input
                              type="number"
                              min="0"
                              max={product.available}
                              className="input-field"
                              style={{ width: '110px' }}
                              value={startInventoryDraft?.[product.productId] || ''}
                              onChange={(e) => handleStartInventoryChange(product.productId, e.target.value)}
                              placeholder="0"
                            />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>

              <div style={{ display: 'flex', gap: '0.5rem', marginTop: '1rem' }}>
                <button className="btn btn-primary" style={{ flex: 1 }} onClick={handleStartAttempt}>
                  Confirmar Apertura
                </button>
                <button
                  className="btn"
                  style={{ flex: 1 }}
                  onClick={() => {
                    setShowStartModal(false);
                    resetStartState();
                  }}
                >
                  Cancelar
                </button>
              </div>
            </div>
          </div>
        )}
      </>
    );
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
      <div className="badge" style={{ backgroundColor: 'var(--surface-success)', borderColor: 'rgba(0, 255, 154, 0.45)' }}>
        {'\uD83D\uDFE2'} Jornada Activa
      </div>
      {!!activeShiftInventorySummary?.rows?.length && (
        <div className="badge" style={{ backgroundColor: 'var(--surface-muted)', borderColor: 'var(--border-soft)' }}>
          Inventario turno: {activeShiftInventorySummary.rows.length} producto(s)
        </div>
      )}
      <button
        className="btn"
        style={{ backgroundColor: 'var(--surface-danger)', borderColor: 'rgba(255, 45, 85, 0.45)' }}
        onClick={() => setShowReconciliation(true)}
      >
        Cerrar Jornada
      </button>

      {showReconciliation && (
        <div className="modal-overlay" style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000
        }}>
          <div className="card" style={{ width: '760px', maxWidth: '95vw', maxHeight: '90vh', overflowY: 'auto' }}>
            <h3 style={{ marginTop: 0 }}>Cierre de Caja / Cuadre del Dia</h3>
            <p style={{ marginTop: 0, color: 'var(--text-secondary)' }}>
              Registre todas las cuentas. Si no hubo movimiento, escriba <strong>0</strong>.
            </p>
            <div style={{ marginBottom: '0.9rem', padding: '10px', borderRadius: '6px', backgroundColor: 'var(--surface-warn)', border: '1px solid rgba(255, 180, 0, 0.30)', fontSize: '0.9rem' }}>
              El <strong>efectivo</strong> debe ser el dinero que realmente quedo en caja al final.
              Si ya registro un <strong>gasto</strong> o una <strong>inversion</strong>, ese valor normalmente ya salio del efectivo y no debe sumarse otra vez.
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
              {ACCOUNT_FIELDS.map((f) => (
                <div key={f.key} className="input-group" style={{ marginBottom: 0 }}>
                  <label className="input-label">{f.label} ($)</label>
                  <input
                    type="text"
                    className="input-field"
                    value={accounts[f.key]}
                    onChange={(e) => handleAccountChange(f.key, e.target.value)}
                    inputMode="numeric"
                    placeholder="0"
                  />
                </div>
              ))}
            </div>

            <div style={{ marginTop: '0.9rem', padding: '10px', borderRadius: '6px', backgroundColor: 'var(--surface-muted)', border: '1px solid var(--border-soft)' }}>
              <p style={{ margin: 0 }}>
                Total declarado: <strong>${Number(totalDeclared || 0).toLocaleString()}</strong>
              </p>
              {Math.abs(Number(differenceAmount || 0)) > 0 && (
                <p style={{ margin: '0.45rem 0 0', fontWeight: 700, color: differenceAmount < 0 ? '#b91c1c' : '#15803d' }}>
                  {differenceAmount < 0 ? 'Faltante' : 'Sobrante'}: ${Math.abs(Number(differenceAmount || 0)).toLocaleString()}
                </p>
              )}
            </div>

            {!!closeBlockers.length && (
              <div style={{ marginTop: '0.9rem', padding: '10px', borderRadius: '6px', backgroundColor: 'rgba(255, 45, 85, 0.10)', border: '1px solid rgba(255, 45, 85, 0.30)' }}>
                <div style={{ fontWeight: 700, marginBottom: '0.35rem' }}>Bloqueos de cierre</div>
                {closeBlockers.map((reason, index) => (
                  <div key={`${reason}-${index}`} style={{ fontSize: '0.92rem', color: 'var(--text-secondary)' }}>
                    - {reason}
                  </div>
                ))}
              </div>
            )}

            {!!closureRows.length && (
              <div style={{ marginTop: '1rem', padding: '10px', borderRadius: '6px', backgroundColor: 'var(--surface-muted)', border: '1px solid var(--border-soft)' }}>
                <div style={{ fontWeight: 700, marginBottom: '0.45rem' }}>Entrega final de inventario al supervisor</div>
                <p style={{ marginTop: 0, color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
                  Registre solo la cantidad fisica con la que el turno cierra. El sistema validara internamente la diferencia antes de permitir el cierre.
                </p>
                <table>
                  <thead>
                    <tr>
                      <th>Producto</th>
                      <th>Recibido fisico</th>
                    </tr>
                  </thead>
                  <tbody>
                    {closureRows.map((row) => (
                      <tr key={row.productId}>
                        <td>{row.productName}</td>
                        <td>
                          <input
                            type="number"
                            min="0"
                            className="input-field"
                            style={{ width: '110px' }}
                            value={returnedInventoryDraft?.[row.productId] ?? ''}
                            onChange={(e) => handleReturnedInventoryChange(row.productId, e.target.value)}
                            placeholder="0"
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <div className="input-group" style={{ marginTop: '0.75rem', marginBottom: 0 }}>
                  <label className="input-label">Nota supervisor / entrega</label>
                  <textarea
                    className="input-field"
                    rows="3"
                    value={supervisorNote}
                    onChange={(e) => setSupervisorNote(e.target.value)}
                    placeholder="Ej: supervisor valida fisico sin novedades antes del siguiente turno"
                  />
                </div>
              </div>
            )}

            <div style={{ display: 'flex', gap: '0.5rem', marginTop: '1rem' }}>
              <button className="btn btn-primary" style={{ flex: 1 }} onClick={handleEndAttempt}>
                Finalizar y Reportar (CR)
              </button>
              <button className="btn" style={{ flex: 1 }} onClick={resetCloseState}>
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
