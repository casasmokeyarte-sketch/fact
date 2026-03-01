import React, { useState } from 'react';
import { CLIENT_OCASIONAL, PAYMENT_MODES } from '../constants';
import { printInvoiceDocument } from '../lib/printInvoice.js';
import { playSound } from '../lib/soundService';

const CASH_MODE = PAYMENT_MODES.CONTADO;
const CREDIT_MODE = PAYMENT_MODES.CREDITO;
const OTHER_MODE = PAYMENT_MODES.OTROS || 'Otros';

const normalizeMode = (mode) => String(mode || '')
  .trim()
  .toLowerCase()
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '');

const isCreditMode = (mode) => normalizeMode(mode) === normalizeMode(CREDIT_MODE);
const isCashMode = (mode) => normalizeMode(mode) === normalizeMode(CASH_MODE);
const requiresReference = (mode) => {
  const normalized = normalizeMode(mode);
  return normalized !== normalizeMode(CASH_MODE) && normalized !== normalizeMode(CREDIT_MODE);
};
const requiresOtherDetail = (mode) => normalizeMode(mode) === normalizeMode(OTHER_MODE);

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

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
  selectedClientDiscount = 0,
  selectedClientPendingBalance = 0,
  selectedClientAvailableCredit = 0,
  items,
  currentUser,
  onCreateRemoteAuthRequest,
  remoteAuthDecisionByRequestId = {},
  remoteAuthRequestById = {},
  onSaveDraft
}) {
  const normalizeRole = (role) => {
    const normalized = String(role || '').trim().toLowerCase();
    if (!normalized) return '';
    if (normalized === 'administrador' || normalized === 'admin') return 'Administrador';
    if (normalized.includes('supervisor')) return 'Supervisor';
    if (normalized.includes('cajer')) return 'Cajero';
    return String(role || '').trim();
  };

  const normalizedRole = normalizeRole(currentUser?.role);
  const shouldUseRemoteAuth = !!onCreateRemoteAuthRequest && !['Administrador', 'Supervisor'].includes(normalizedRole);

  const [extraDiscount, setExtraDiscount] = useState(0);
  const [authNote, setAuthNote] = useState('');
  const [activeRemoteRequestId, setActiveRemoteRequestId] = useState('');
  const [isRequestingRemoteAuth, setIsRequestingRemoteAuth] = useState(false);
  const [cashReceived, setCashReceived] = useState(0);
  const [isMixed, setIsMixed] = useState(false);
  const [otherPaymentDetail, setOtherPaymentDetail] = useState('');
  const [mixedModeA, setMixedModeA] = useState(CASH_MODE);
  const [mixedModeB, setMixedModeB] = useState(CREDIT_MODE);
  const [mixedAmountA, setMixedAmountA] = useState(0);
  const [mixedRefA, setMixedRefA] = useState('');
  const [mixedRefB, setMixedRefB] = useState('');
  const [mixedOtherA, setMixedOtherA] = useState('');
  const [mixedOtherB, setMixedOtherB] = useState('');

  const paymentMethodsWithOther = Array.from(
    new Set([...(paymentMethods || []), OTHER_MODE].filter(Boolean))
  );

  const automaticDiscountPercent = Number(selectedClientDiscount || 0);
  const automaticDiscountAmount = subtotal * (automaticDiscountPercent / 100);
  const totalDiscount = automaticDiscountAmount + (Number(extraDiscount) || 0);
  const total = Math.max(0, subtotal + (Number(deliveryFee) || 0) - totalDiscount);
  const safeMixedAmountA = clamp(Number(mixedAmountA) || 0, 0, Math.max(0, total));
  const mixedAmountB = Math.max(0, total - safeMixedAmountA);

  const mixedCreditPortion =
    (isCreditMode(mixedModeA) ? safeMixedAmountA : 0) +
    (isCreditMode(mixedModeB) ? mixedAmountB : 0);
  const mixedCashPortion =
    (isCashMode(mixedModeA) ? safeMixedAmountA : 0) +
    (isCashMode(mixedModeB) ? mixedAmountB : 0);

  const creditPortion = isMixed ? mixedCreditPortion : (paymentMode === CREDIT_MODE ? total : 0);
  const isCredit = creditPortion > 0;
  const clientLimit = Number(selectedClient?.creditLimit || 0);
  const limitExceeded = isCredit && creditPortion > clientLimit;
  const excess = creditPortion - clientLimit;

  const isOcasional = clientName === CLIENT_OCASIONAL;
  const isStandardClient = (selectedClient?.creditLevel || selectedClient?.credit_level) === 'ESTANDAR';
  const vuelta = cashReceived > total ? cashReceived - total : 0;

  const hasGift = items.some((item) => item.isGift);
  const hasExtraDiscount = Number(extraDiscount) > 0;
  const isTransferWithoutRef = !isMixed && requiresReference(paymentMode) && !paymentRef;
  const needsApproval = hasGift || hasExtraDiscount || isTransferWithoutRef;

  const currentRemoteRequest = activeRemoteRequestId
    ? remoteAuthRequestById?.[activeRemoteRequestId] || null
    : null;
  const currentRemoteDecision = currentRemoteRequest?.status || (
    activeRemoteRequestId ? remoteAuthDecisionByRequestId?.[activeRemoteRequestId] : null
  );

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

  const buildAuthorizationMeta = () => {
    if (!needsApproval) return null;

    if (shouldUseRemoteAuth) {
      const approved = currentRemoteRequest && currentRemoteRequest.status === 'APPROVED'
        ? currentRemoteRequest
        : null;

      return {
        required: true,
        mode: 'REMOTE',
        status: approved ? 'APPROVED' : 'PENDING',
        requestId: activeRemoteRequestId || '',
        reasonType,
        reasonLabel,
        note: String(authNote || '').trim(),
        approvedAt: approved?.resolvedAt || null,
        approvedBy: approved?.resolvedBy || null
      };
    }

    return {
      required: true,
      mode: 'ROLE_DIRECT',
      status: 'APPROVED',
      requestId: '',
      reasonType,
      reasonLabel,
      note: String(authNote || '').trim(),
      approvedAt: new Date().toISOString(),
      approvedBy: {
        id: currentUser?.id || null,
        name: currentUser?.name || currentUser?.email || 'Usuario',
        role: normalizedRole || ''
      }
    };
  };

  const handleAuthAction = async (action) => {
    if (needsApproval) {
      if (shouldUseRemoteAuth) {
        if (activeRemoteRequestId) {
          if (currentRemoteDecision === 'APPROVED') {
            setActiveRemoteRequestId('');
            setAuthNote('');
            playSound('success');
            action();
            return;
          }
          if (currentRemoteDecision === 'REJECTED') {
            setActiveRemoteRequestId('');
            playSound('error');
            alert('La solicitud fue rechazada por Administracion.');
            return;
          }
          playSound('notify');
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
            paymentMode: isMixed ? `Mixto (${mixedModeA} + ${mixedModeB})` : paymentMode,
          });
          if (requestId) {
            setActiveRemoteRequestId(requestId);
            await onSaveDraft?.({
              source: 'AUTH_REQUEST',
              authRequestId: requestId,
              reasonType,
              reasonLabel,
              authNote: String(authNote || '').trim(),
              paymentMode: isMixed ? `Mixto (${mixedModeA} + ${mixedModeB})` : paymentMode,
              extraDiscount: Number(extraDiscount || 0),
              mixedData: isMixed
                ? {
                    modeA: mixedModeA,
                    modeB: mixedModeB,
                    amountA: Number(safeMixedAmountA || 0),
                    amountB: Number(mixedAmountB || 0),
                    refA: String(mixedRefA || ''),
                    refB: String(mixedRefB || ''),
                    otherA: String(mixedOtherA || ''),
                    otherB: String(mixedOtherB || ''),
                  }
                : null,
            });
            playSound('notify');
            alert('Solicitud enviada. Esperando respuesta de Administracion.');
          }
        } finally {
          setIsRequestingRemoteAuth(false);
        }
        return;
      }

      // Admin/Supervisor: autorización directa por rol, sin clave.
      playSound('success');
      action();
      return;
    }

    action();
  };

  const onFinalFacturar = () => {
    if (isStandardClient && creditPortion > 0) {
      return alert('Cliente en nivel ESTANDAR no puede facturar a credito.');
    }

    if (isMixed) {
      if (safeMixedAmountA <= 0 || safeMixedAmountA >= total) {
        return alert('En pago mixto debe definir un monto parcial mayor a 0 y menor al total.');
      }
      if (!mixedModeA || !mixedModeB || mixedModeA === mixedModeB) {
        return alert('En pago mixto seleccione dos metodos diferentes.');
      }

      const parts = [
        { method: mixedModeA, amount: safeMixedAmountA, reference: String(mixedRefA || '').trim(), otherDetail: String(mixedOtherA || '').trim() },
        { method: mixedModeB, amount: mixedAmountB, reference: String(mixedRefB || '').trim(), otherDetail: String(mixedOtherB || '').trim() },
      ];

      const invalidReference = parts.find((part) => Number(part.amount || 0) > 0 && requiresReference(part.method) && !part.reference);
      if (invalidReference) {
        return alert(`Debe ingresar numero de referencia para ${invalidReference.method} en pago mixto.`);
      }

      const invalidOther = parts.find((part) => Number(part.amount || 0) > 0 && requiresOtherDetail(part.method) && !part.otherDetail);
      if (invalidOther) {
        return alert('Cuando use metodo "Otros" debe describir el medio exacto.');
      }

      if (limitExceeded) return alert('El monto a credito supera el limite permitido.');

      onFacturar(
        {
          cash: mixedCashPortion,
          credit: mixedCreditPortion,
          discount: extraDiscount,
          parts,
          splitSummary: `${mixedModeA}: ${safeMixedAmountA.toLocaleString()} | ${mixedModeB}: ${mixedAmountB.toLocaleString()}`,
        },
        extraDiscount,
        {
          authorization: buildAuthorizationMeta(),
        }
      );
      return;
    }

    if (requiresOtherDetail(paymentMode) && !String(otherPaymentDetail || '').trim()) {
      return alert('En metodo "Otros" debe escribir el medio de pago exacto.');
    }
    if (requiresReference(paymentMode) && !String(paymentRef || '').trim()) {
      return alert('Debe ingresar numero de referencia para este metodo de pago.');
    }
    if (limitExceeded) return alert('El monto de la factura supera el limite de credito permitido.');

    onFacturar(
      null,
      extraDiscount,
      {
        otherPaymentDetail: String(otherPaymentDetail || '').trim(),
        authorization: buildAuthorizationMeta(),
      }
    );
  };

  React.useEffect(() => {
    if (!activeRemoteRequestId) return;
    if (currentRemoteDecision === 'REJECTED') {
      playSound('error');
      alert('Administracion rechazo la solicitud de autorizacion.');
      setActiveRemoteRequestId('');
      return;
    }
    if (currentRemoteDecision === 'APPROVED') {
      playSound('success');
      alert('Autorizacion aprobada. Ya puede facturar.');
    }
  }, [activeRemoteRequestId, currentRemoteDecision]);

  React.useEffect(() => {
    if (isOcasional && paymentMode === CREDIT_MODE) {
      setPaymentMode(CASH_MODE);
    }
  }, [isOcasional, paymentMode, setPaymentMode]);

  React.useEffect(() => {
    if (isStandardClient) {
      if (paymentMode === CREDIT_MODE) {
        setPaymentMode(CASH_MODE);
      }
      if (isMixed && (mixedModeA === CREDIT_MODE || mixedModeB === CREDIT_MODE)) {
        setMixedModeB(CASH_MODE);
      }
    }
  }, [isStandardClient, paymentMode, isMixed, mixedModeA, mixedModeB, setPaymentMode]);

  React.useEffect(() => {
    if (!isMixed) return;
    const fallbackA = paymentMethodsWithOther[0] || CASH_MODE;
    const fallbackB = paymentMethodsWithOther[1] || CREDIT_MODE;
    if (!paymentMethodsWithOther.includes(mixedModeA)) setMixedModeA(fallbackA);
    if (!paymentMethodsWithOther.includes(mixedModeB)) setMixedModeB(fallbackB);
  }, [isMixed, paymentMethodsWithOther, mixedModeA, mixedModeB]);

  const handlePrintInvoice = (mode) => {
    const previewInvoice = {
      id: `PRE-${Date.now()}`,
      clientName,
      clientDoc: selectedClient?.document || 'N/A',
      items,
      subtotal,
      deliveryFee: Number(deliveryFee || 0),
      automaticDiscountPercent,
      automaticDiscountAmount,
      extraDiscount: Number(extraDiscount || 0),
      totalDiscount,
      total,
      paymentMode: isMixed ? `Mixto (${mixedModeA} + ${mixedModeB})` : paymentMode,
      authorization: buildAuthorizationMeta(),
      date: new Date().toISOString(),
    };
    printInvoiceDocument(previewInvoice, mode);
  };

  return (
    <div className="card" style={{ position: 'sticky', top: '2rem' }}>
      <h2 style={{ marginTop: 0 }}>Total Pago</h2>
      <div style={{ fontSize: '2.5rem', fontWeight: 'bold', margin: '1rem 0' }}>
        ${total.toLocaleString()}
      </div>

      {automaticDiscountAmount > 0 && (
        <div className="card" style={{ backgroundColor: '#f8fafc', marginBottom: '1rem' }}>
          <div style={{ fontSize: '0.9rem', color: '#334155' }}>
            Descuento por nivel cliente ({automaticDiscountPercent}%): <strong>-${automaticDiscountAmount.toLocaleString()}</strong>
          </div>
        </div>
      )}

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
          type="number"
          className="input-field"
          value={deliveryFee}
          onChange={(e) => setDeliveryFee(Number(e.target.value))}
        />
      </div>

      <div className="input-group" style={{ border: '2px solid #fee2e2' }}>
        <label className="input-label">Descuento Extraordinario ($)</label>
        <input
          type="number"
          className="input-field"
          value={extraDiscount}
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
          type="number"
          className="input-field"
          value={cashReceived}
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
            onChange={(e) => setIsMixed(e.target.checked)}
            disabled={isStandardClient}
          />
          <strong>Pago Mixto (Metodo libre)</strong>
        </label>
      </div>

      {isStandardClient && (
        <div className="alert alert-warning" style={{ backgroundColor: '#fffbeb', color: '#92400e', border: '1px solid #f59e0b', padding: '0.75rem', borderRadius: '8px', marginBottom: '1rem', fontSize: '0.85rem' }}>
          Cliente ESTANDAR: solo se permite facturacion de contado (sin credito).
        </div>
      )}

      {isMixed && (
        <div style={{ backgroundColor: '#f1f5f9', padding: '10px', borderRadius: '8px', marginBottom: '1rem' }}>
          <div style={{ display: 'grid', gap: '0.6rem' }}>
            <div style={{ fontWeight: 600, fontSize: '0.9rem' }}>Pago 1</div>
            <div className="input-group">
              <label className="input-label">Metodo 1</label>
              <select className="input-field" value={mixedModeA} onChange={(e) => setMixedModeA(e.target.value)}>
                {paymentMethodsWithOther.map((mode) => (
                  <option key={`mix-a-${mode}`} value={mode}>{mode}</option>
                ))}
              </select>
            </div>
            <div className="input-group">
              <label className="input-label">Monto Metodo 1</label>
              <input
                type="number"
                className="input-field"
                value={safeMixedAmountA}
                onChange={(e) => setMixedAmountA(Number(e.target.value))}
              />
            </div>
            {requiresReference(mixedModeA) && (
              <div className="input-group">
                <label className="input-label">Referencia Metodo 1</label>
                <input className="input-field" value={mixedRefA} onChange={(e) => setMixedRefA(e.target.value)} />
              </div>
            )}
            {requiresOtherDetail(mixedModeA) && (
              <div className="input-group">
                <label className="input-label">Detalle Metodo 1 (Otros)</label>
                <input className="input-field" value={mixedOtherA} onChange={(e) => setMixedOtherA(e.target.value)} placeholder="Ej: Nequi, PayPal, Bono, etc." />
              </div>
            )}

            <div style={{ marginTop: '0.45rem', fontWeight: 600, fontSize: '0.9rem' }}>Pago 2 (restante)</div>
            <div className="input-group">
              <label className="input-label">Metodo 2</label>
              <select className="input-field" value={mixedModeB} onChange={(e) => setMixedModeB(e.target.value)}>
                {paymentMethodsWithOther.map((mode) => (
                  <option key={`mix-b-${mode}`} value={mode}>{mode}</option>
                ))}
              </select>
            </div>
            <div className="input-group">
              <label className="input-label">Monto Metodo 2 (auto)</label>
              <input type="number" className="input-field" value={mixedAmountB} readOnly />
            </div>
            {requiresReference(mixedModeB) && (
              <div className="input-group">
                <label className="input-label">Referencia Metodo 2</label>
                <input className="input-field" value={mixedRefB} onChange={(e) => setMixedRefB(e.target.value)} />
              </div>
            )}
            {requiresOtherDetail(mixedModeB) && (
              <div className="input-group">
                <label className="input-label">Detalle Metodo 2 (Otros)</label>
                <input className="input-field" value={mixedOtherB} onChange={(e) => setMixedOtherB(e.target.value)} placeholder="Ej: Nequi, PayPal, Bono, etc." />
              </div>
            )}
          </div>

          <p style={{ margin: '0.35rem 0 0', fontSize: '0.9em' }}>
            Monto a credito en mixto: <strong style={{ color: limitExceeded ? '#ef4444' : '#10b981' }}>${creditPortion.toLocaleString()}</strong>
          </p>
        </div>
      )}

      <div className="input-group">
        <label className="input-label">Metodo de Pago Principal</label>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
          {paymentMethodsWithOther.map((mode) => (
            <label
              key={mode}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.4rem',
                fontSize: '0.9em',
                opacity: (isOcasional && mode === CREDIT_MODE) || (isStandardClient && mode === CREDIT_MODE) ? 0.5 : 1
              }}
            >
              <input
                type="radio"
                name="paymentMode"
                value={mode}
                checked={paymentMode === mode}
                onChange={() => setPaymentMode(mode)}
                disabled={(isOcasional && mode === CREDIT_MODE) || (isStandardClient && mode === CREDIT_MODE) || isMixed}
              />
              {mode}
            </label>
          ))}
        </div>
      </div>

      {!isMixed && requiresReference(paymentMode) && (
        <div className="input-group">
          <label className="input-label">Nro de Referencia</label>
          <input
            type="text"
            className="input-field"
            required
            value={paymentRef}
            onChange={(e) => setPaymentRef(e.target.value)}
          />
        </div>
      )}

      {!isMixed && requiresOtherDetail(paymentMode) && (
        <div className="input-group">
          <label className="input-label">Detalle del medio (Otros)</label>
          <input
            type="text"
            className="input-field"
            value={otherPaymentDetail}
            onChange={(e) => setOtherPaymentDetail(e.target.value)}
            placeholder="Ej: Nequi, Daviplata, App empresarial, etc."
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
        <button
          className="btn"
          onClick={() => onSaveDraft?.({
            source: 'MANUAL_SAVE',
            authRequestId: activeRemoteRequestId || '',
            reasonType,
            reasonLabel,
            authNote: String(authNote || '').trim(),
            paymentMode: isMixed ? `Mixto (${mixedModeA} + ${mixedModeB})` : paymentMode,
            extraDiscount: Number(extraDiscount || 0),
            mixedData: isMixed
              ? {
                  modeA: mixedModeA,
                  modeB: mixedModeB,
                  amountA: Number(safeMixedAmountA || 0),
                  amountB: Number(mixedAmountB || 0),
                  refA: String(mixedRefA || ''),
                  refB: String(mixedRefB || ''),
                  otherA: String(mixedOtherA || ''),
                  otherB: String(mixedOtherB || ''),
                }
              : null,
          })}
          title="Guardar borrador"
        >
          Guardar
        </button>
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
