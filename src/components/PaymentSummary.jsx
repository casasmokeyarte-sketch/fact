import React, { useState } from 'react';
import { CLIENT_OCASIONAL, PAYMENT_MODES } from '../constants';
import { printInvoiceDocument } from '../lib/printInvoice.js';

export function PaymentSummary({
  subtotal,
  deliveryFee,
  setDeliveryFee,
  paymentMode,
  setPaymentMode,
  clientName,
  paymentRef,
  setPaymentRef,
  paymentMethods,
  onFacturar,
  selectedClient,
  selectedClientPendingBalance = 0,
  selectedClientAvailableCredit = 0,
  items,
  adminPass,
  currentUser,
  onCreateRemoteAuthRequest,
  remoteAuthDecisionByRequestId = {}
}) {
  const normalizeRole = (role) => {
    const normalized = String(role || '').trim().toLowerCase();
    if (!normalized) return '';
    if (normalized === 'administrador' || normalized === 'admin') return 'Administrador';
    if (normalized.includes('supervisor')) return 'Supervisor';
    if (normalized.includes('cajer')) return 'Cajero';
    return String(role || '').trim();
  };

  const [extraDiscount, setExtraDiscount] = useState(0);
  const [authNote, setAuthNote] = useState('');
  const [activeRemoteRequestId, setActiveRemoteRequestId] = useState('');
  const [isRequestingRemoteAuth, setIsRequestingRemoteAuth] = useState(false);
  const total = subtotal + (Number(deliveryFee) || 0) - (Number(extraDiscount) || 0);
  const normalizedRole = normalizeRole(currentUser?.role);
  const isOcasional = clientName === CLIENT_OCASIONAL;
  const isStandardClient = (selectedClient?.creditLevel || selectedClient?.credit_level) === 'ESTANDAR';
  const shouldUseRemoteAuth = !!onCreateRemoteAuthRequest && !['Administrador', 'Supervisor'].includes(normalizedRole);

  const [cashReceived, setCashReceived] = useState(0);
  const [isMixed, setIsMixed] = useState(false);
  const [mixedCash, setMixedCash] = useState(0);

  const vuelta = cashReceived > total ? cashReceived - total : 0;

  const isCredit = paymentMode === PAYMENT_MODES.CREDITO || isMixed;
  const creditPortion = isMixed ? (total - mixedCash) : (paymentMode === PAYMENT_MODES.CREDITO ? total : 0);

  const clientLimit = selectedClient?.creditLimit || 0;
  const limitExceeded = isCredit && creditPortion > clientLimit;
  const excess = creditPortion - clientLimit;
  const hasGift = items.some(item => item.isGift);
  const hasExtraDiscount = Number(extraDiscount) > 0;
  const isTransferWithoutRef = ![PAYMENT_MODES.CONTADO, PAYMENT_MODES.CREDITO].includes(paymentMode) && !paymentRef;
  const needsApproval = hasGift || hasExtraDiscount || isTransferWithoutRef;
  const currentRemoteDecision = activeRemoteRequestId
    ? remoteAuthDecisionByRequestId?.[activeRemoteRequestId]
    : null;
  const reasonType = hasGift
    ? 'REGALO'
    : hasExtraDiscount
      ? 'DESCUENTO_EXTRA'
      : isTransferWithoutRef
        ? 'TRANSFERENCIA_SIN_REFERENCIA'
        : 'OTRO';
  const reasonLabel = hasGift
    ? 'Regalo'
    : hasExtraDiscount
      ? 'Descuento extraordinario'
      : isTransferWithoutRef
        ? 'Transferencia sin referencia'
        : 'Autorizacion manual';

  const handleAuthAction = async (action) => {
    if (needsApproval) {
      if (shouldUseRemoteAuth) {
        if (activeRemoteRequestId) {
          if (currentRemoteDecision === 'APPROVED') {
            setActiveRemoteRequestId('');
            setAuthNote('');
            action();
            return;
          }
          if (currentRemoteDecision === 'REJECTED') {
            setActiveRemoteRequestId('');
            alert('La solicitud fue rechazada por Administracion.');
            return;
          }
          alert('La solicitud sigue pendiente de respuesta de Administracion.');
          return;
        }

        try {
          setIsRequestingRemoteAuth(true);
          const requestId = await onCreateRemoteAuthRequest({
            reasonType,
            reasonLabel,
            note: String(authNote || '').trim(),
            clientName,
            total: Number(total || 0),
            paymentMode: isMixed ? 'Mixto' : paymentMode,
          });
          if (requestId) {
            setActiveRemoteRequestId(requestId);
            alert('Solicitud enviada. Esperando respuesta de Administracion.');
          }
        } finally {
          setIsRequestingRemoteAuth(false);
        }
        return;
      }

      const pass = prompt(`Requiere Autorizacion Admin (${hasGift ? 'Regalo' : hasExtraDiscount ? 'Descuento' : 'Sin Ref Transferencia'}):\nIngrese clave de administrador:`);
      if (pass === adminPass || pass === 'admin123') {
        action();
      } else {
        alert('Clave incorrecta o accion cancelada.');
      }
    } else {
      action();
    }
  };

  const onFinalFacturar = () => {
    if (isStandardClient && (paymentMode === PAYMENT_MODES.CREDITO || isMixed)) {
      return alert('Cliente en nivel ESTANDAR no puede facturar a credito.');
    }

    if (isMixed) {
      if (mixedCash >= total) return alert('El monto del abono debe ser menor al total para ser mixto');
      if (limitExceeded) return alert('El monto restante a credito supera el limite permitido.');
      onFacturar({ cash: mixedCash, credit: total - mixedCash, discount: extraDiscount });
    } else {
      if (limitExceeded) return alert('El monto de la factura supera el limite de credito permitido.');
      onFacturar(null, extraDiscount);
    }
  };

  React.useEffect(() => {
    if (!activeRemoteRequestId) return;
    if (currentRemoteDecision === 'REJECTED') {
      alert('Administracion rechazo la solicitud de autorizacion.');
      setActiveRemoteRequestId('');
      return;
    }
    if (currentRemoteDecision === 'APPROVED') {
      alert('Autorizacion aprobada. Ya puede facturar.');
    }
  }, [activeRemoteRequestId, currentRemoteDecision]);

  const handlePrintInvoice = (mode) => {
    const previewInvoice = {
      id: `PRE-${Date.now()}`,
      clientName,
      clientDoc: selectedClient?.document || 'N/A',
      items,
      total,
      paymentMode: isMixed ? 'Mixto' : paymentMode,
      date: new Date().toISOString(),
    };
    printInvoiceDocument(previewInvoice, mode);
  };

  React.useEffect(() => {
    if (isOcasional && paymentMode === PAYMENT_MODES.CREDITO) {
      setPaymentMode(PAYMENT_MODES.CONTADO);
    }
  }, [isOcasional, paymentMode, setPaymentMode]);

  React.useEffect(() => {
    if (isStandardClient) {
      if (paymentMode === PAYMENT_MODES.CREDITO) {
        setPaymentMode(PAYMENT_MODES.CONTADO);
      }
      if (isMixed) {
        setIsMixed(false);
      }
    }
  }, [isStandardClient, paymentMode, isMixed, setPaymentMode]);

  return (
    <div className="card" style={{ position: 'sticky', top: '2rem' }}>
      <h2 style={{ marginTop: 0 }}>Total Pago</h2>
      <div style={{ fontSize: '2.5rem', fontWeight: 'bold', margin: '1rem 0' }}>
        ${total.toLocaleString()}
      </div>

      {selectedClient && (
        <div className="card" style={{ backgroundColor: '#f8fafc', marginBottom: '1rem' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '0.5rem', fontSize: '0.9rem' }}>
            <div>
              <div style={{ color: '#64748b' }}>Nivel</div>
              <strong>{selectedClient.creditLevel || selectedClient.credit_level || 'ESTANDAR'}</strong>
            </div>
            <div>
              <div style={{ color: '#64748b' }}>Cupo</div>
              <strong>${Number(clientLimit || 0).toLocaleString()}</strong>
            </div>
            <div>
              <div style={{ color: '#64748b' }}>Saldo Pendiente</div>
              <strong>${Number(selectedClientPendingBalance || 0).toLocaleString()}</strong>
            </div>
            <div>
              <div style={{ color: '#64748b' }}>Cupo Disponible</div>
              <strong style={{ color: '#10b981' }}>${Number(selectedClientAvailableCredit || 0).toLocaleString()}</strong>
            </div>
          </div>
        </div>
      )}

      {limitExceeded && (
        <div className="alert alert-warning" style={{ backgroundColor: '#fee2e2', color: '#b91c1c', border: '1px solid #f87171', padding: '1rem', borderRadius: '8px', marginBottom: '1rem', fontSize: '0.9rem' }}>
          <strong>Limite Excedido:</strong> El monto a credito (${creditPortion.toLocaleString()}) supera el maximo permitido para este cliente (${clientLimit.toLocaleString()}).
          <br /><br />
          <strong>Solucion:</strong> El cliente debe realizar un <strong>Abono</strong> de al menos <strong>${excess.toLocaleString()}</strong> en efectivo.
        </div>
      )}

      <div className="input-group">
        <label className="input-label">Domicilio ($)</label>
        <input
          type="number" className="input-field" value={deliveryFee}
          onChange={(e) => setDeliveryFee(Number(e.target.value))}
        />
      </div>

      <div className="input-group" style={{ border: '2px solid #fee2e2' }}>
        <label className="input-label">Descuento Extraordinario ($)</label>
        <input
          type="number" className="input-field" value={extraDiscount}
          onChange={(e) => setExtraDiscount(Number(e.target.value))}
          placeholder="Requiere aprobacion admin"
        />
      </div>

      {shouldUseRemoteAuth && needsApproval && (
        <div className="card" style={{ backgroundColor: '#fff7ed', border: '1px solid #fed7aa', marginBottom: '1rem' }}>
          <p style={{ margin: '0 0 0.5rem', fontWeight: 600 }}>Autorizacion remota requerida</p>
          <p style={{ margin: '0 0 0.5rem', fontSize: '0.85rem', color: '#9a3412' }}>
            Motivo: {reasonLabel}
          </p>
          <textarea
            className="input-field"
            rows={2}
            value={authNote}
            onChange={(e) => setAuthNote(e.target.value)}
            placeholder="Nota breve para administracion (opcional)"
          />
          {activeRemoteRequestId && (
            <p style={{ margin: '0.5rem 0 0', fontSize: '0.82rem', color: '#334155' }}>
              Estado solicitud: {currentRemoteDecision === 'APPROVED' ? 'Aprobada' : currentRemoteDecision === 'REJECTED' ? 'Rechazada' : 'Pendiente'} ({activeRemoteRequestId})
            </p>
          )}
        </div>
      )}

      <div className="input-group" style={{ border: '2px solid #e2e8f0', padding: '10px', borderRadius: '8px' }}>
        <label className="input-label">Efectivo Recibido (Abono / Pago)</label>
        <input
          type="number" className="input-field" value={cashReceived}
          onChange={(e) => setCashReceived(Number(e.target.value))}
          placeholder="Ej: 100000"
        />
        {vuelta > 0 && <p style={{ color: 'green', fontWeight: 'bold', marginTop: '5px', margin: 0 }}>Vuelta: ${vuelta.toLocaleString()}</p>}
      </div>

      <div className="input-group" style={{ marginTop: '1rem' }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
          <input
            type="checkbox"
            checked={isMixed}
            onChange={e => setIsMixed(e.target.checked)}
            disabled={isStandardClient}
          />
          <strong>Pago Mixto (Abono Cash + Credito)</strong>
        </label>
      </div>

      {isStandardClient && (
        <div className="alert alert-warning" style={{ backgroundColor: '#fffbeb', color: '#92400e', border: '1px solid #f59e0b', padding: '0.75rem', borderRadius: '8px', marginBottom: '1rem', fontSize: '0.85rem' }}>
          Cliente ESTANDAR: solo se permite facturacion de contado (sin credito).
        </div>
      )}

      {isMixed && (
        <div style={{ backgroundColor: '#f1f5f9', padding: '10px', borderRadius: '8px', marginBottom: '1rem' }}>
          <div className="input-group">
            <label className="input-label">Monto del Abono (Efectivo)</label>
            <input type="number" className="input-field" value={mixedCash} onChange={e => setMixedCash(Number(e.target.value))} />
          </div>
          <p style={{ margin: 0, fontSize: '0.9em' }}>Saldo que quedara a Credito: <strong style={{ color: limitExceeded ? '#ef4444' : '#10b981' }}>${creditPortion.toLocaleString()}</strong></p>
        </div>
      )}

      <div className="input-group">
        <label className="input-label">Metodo de Pago Principal</label>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
          {paymentMethods.map(mode => (
            <label key={mode} style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.9em', opacity: (isOcasional && mode === PAYMENT_MODES.CREDITO) || (isStandardClient && mode === PAYMENT_MODES.CREDITO) ? 0.5 : 1 }}>
              <input
                type="radio" name="paymentMode" value={mode}
                checked={paymentMode === mode}
                onChange={() => setPaymentMode(mode)}
                disabled={(isOcasional && mode === PAYMENT_MODES.CREDITO) || (isStandardClient && mode === PAYMENT_MODES.CREDITO) || isMixed}
              />
              {mode}
            </label>
          ))}
        </div>
      </div>

      {![PAYMENT_MODES.CONTADO, PAYMENT_MODES.CREDITO].includes(paymentMode) && (
        <div className="input-group">
          <label className="input-label">Nro de Referencia</label>
          <input
            type="text" className="input-field" required
            value={paymentRef}
            onChange={(e) => setPaymentRef(e.target.value)}
          />
        </div>
      )}

      <div style={{ display: 'flex', gap: '0.5rem', marginTop: '1rem' }}>
        <button
          className="btn btn-primary"
          style={{ flex: 1, backgroundColor: limitExceeded ? '#94a3b8' : '' }}
          onClick={() => { handleAuthAction(onFinalFacturar); }}
          disabled={limitExceeded || isRequestingRemoteAuth}
        >
          {limitExceeded ? 'Limite Excedido' : isRequestingRemoteAuth ? 'Enviando Solicitud...' : 'Facturar'}
        </button>
        <button className="btn" onClick={() => handlePrintInvoice('58mm')} title="Imprimir 58mm">58mm</button>
        <button className="btn" onClick={() => handlePrintInvoice('a4')} title="Imprimir A4">A4</button>
      </div>

      <button
        className="btn"
        style={{ width: '100%', marginTop: '0.5rem', backgroundColor: '#10b981', color: 'white', fontSize: '0.8rem' }}
        onClick={async () => {
          const { sendInvoiceEmail } = await import('../lib/emailService.js');

          let email = selectedClient?.email;
          if (!email) {
            email = prompt('Ingrese el correo electronico del cliente:');
            if (!email || !email.includes('@')) {
              return alert('Email invalido o cancelado');
            }
          }

          const lastInvoice = {
            id: Date.now(),
            clientName: clientName,
            date: new Date().toISOString(),
            subtotal: subtotal,
            deliveryFee: deliveryFee,
            total: total,
            paymentMode: paymentMode,
            items: items
          };

          const result = await sendInvoiceEmail(lastInvoice, email);
          if (result.success) {
            alert(`Factura enviada exitosamente a ${email}`);
          } else {
            alert('Error al enviar email. Verifica la configuracion de EmailJS.');
          }
        }}
      >
        Enviar Factura por Email
      </button>
    </div>
  );
}
