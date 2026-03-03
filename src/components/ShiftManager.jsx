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

export function ShiftManager({ shift, onStartShift, onEndShift }) {
  const [showReconciliation, setShowReconciliation] = useState(false);
  const [accounts, setAccounts] = useState(() => (
    ACCOUNT_FIELDS.reduce((acc, f) => ({ ...acc, [f.key]: '' }), {})
  ));

  const totalDeclared = useMemo(() => (
    ACCOUNT_FIELDS.reduce((sum, f) => sum + parseMoneyInput(accounts[f.key]), 0)
  ), [accounts]);

  const allRequiredFilled = useMemo(() => (
    ACCOUNT_FIELDS.every((f) => String(accounts[f.key]).trim() !== '')
  ), [accounts]);

  const handleChange = (key, value) => {
    setAccounts((prev) => ({ ...prev, [key]: value }));
  };

  const handleEndAttempt = () => {
    if (!allRequiredFilled) {
      alert('Debe diligenciar todas las cuentas. Si no hubo movimiento, escriba 0.');
      return;
    }

    const parsed = ACCOUNT_FIELDS.reduce((acc, f) => {
      acc[f.key] = parseMoneyInput(accounts[f.key]);
      return acc;
    }, {});

    onEndShift({
      reconciliation: {
        ...parsed,
        totalDeclarado: totalDeclared,
      },
    });

    setShowReconciliation(false);
    setAccounts(ACCOUNT_FIELDS.reduce((acc, f) => ({ ...acc, [f.key]: '' }), {}));
  };

  if (!shift) {
    return (
      <div className="card" style={{ textAlign: 'center', padding: '3rem' }}>
        <span style={{ fontSize: '4rem' }}>{'\uD83D\uDD52'}</span>
        <h2>Jornada No Iniciada</h2>
        <p>Debe iniciar su jornada laboral para acceder al sistema.</p>
        <div className="input-group" style={{ maxWidth: '300px', margin: '1rem auto' }}>
          <label className="input-label">Base de Caja Inicial ($)</label>
          <input
            type="number"
            className="input-field"
            placeholder="Ej: 100000"
            id="initial-cash-input"
          />
        </div>
        <button
          className="btn btn-primary"
          onClick={() => {
            const val = Number(document.getElementById('initial-cash-input').value);
            onStartShift(val);
          }}
        >
          Iniciar Jornada
        </button>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
      <div className="badge" style={{ backgroundColor: '#dcfce7', color: '#166534' }}>
        {'\uD83D\uDFE2'} Jornada Activa
      </div>
      <button className="btn" style={{ backgroundColor: '#fee2e2', color: '#991b1b' }} onClick={() => setShowReconciliation(true)}>
        Cerrar Jornada
      </button>

      {showReconciliation && (
        <div className="modal-overlay" style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000
        }}>
          <div className="card" style={{ width: '560px', maxWidth: '95vw' }}>
            <h3 style={{ marginTop: 0 }}>Cierre de Caja / Cuadre del Dia</h3>
            <p style={{ marginTop: 0, color: '#64748b' }}>
              Registre todas las cuentas. Si no hubo movimiento, escriba <strong>0</strong>.
            </p>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
              {ACCOUNT_FIELDS.map((f) => (
                <div key={f.key} className="input-group" style={{ marginBottom: 0 }}>
                  <label className="input-label">{f.label} ($)</label>
                  <input
                    type="text"
                    className="input-field"
                    value={accounts[f.key]}
                    onChange={(e) => handleChange(f.key, e.target.value)}
                    inputMode="numeric"
                    placeholder="0"
                  />
                </div>
              ))}
            </div>

            <div style={{ marginTop: '0.9rem', padding: '10px', borderRadius: '6px', backgroundColor: '#f8fafc' }}>
              <p style={{ margin: 0 }}>
                Total declarado: <strong>${Number(totalDeclared || 0).toLocaleString()}</strong>
              </p>
            </div>

            <div style={{ display: 'flex', gap: '0.5rem', marginTop: '1rem' }}>
              <button className="btn btn-primary" style={{ flex: 1 }} onClick={handleEndAttempt}>
                Finalizar y Reportar (CR)
              </button>
              <button className="btn" style={{ flex: 1 }} onClick={() => setShowReconciliation(false)}>
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
