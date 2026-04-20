import React, { useState } from 'react';
import { COMPANY_INFO } from '../constants';

/**
 * Modal para completar o corregir datos de remitente y destinatario
 * antes de imprimir una guia de envio.
 *
 * Props:
 *   initialValues  - objeto con valores pre-cargados (pueden venir del cliente o del invoice)
 *   onConfirm(data) - se llama con los datos editados al confirmar
 *   onCancel()      - se llama al cerrar sin confirmar
 */
export function ShippingGuideFormModal({ initialValues = {}, onConfirm, onCancel }) {
  const [form, setForm] = useState({
    senderName:       String(initialValues.senderName       ?? ''),
    senderDocument:   String(initialValues.senderDocument   ?? ''),
    senderPhone:      String(initialValues.senderPhone      ?? COMPANY_INFO.phone ?? ''),
    senderAddress:    String(initialValues.senderAddress    ?? COMPANY_INFO.address ?? ''),
    recipientName:    String(initialValues.recipientName    ?? ''),
    recipientDocument:String(initialValues.recipientDocument?? ''),
    recipientAddress: String(initialValues.recipientAddress ?? ''),
    recipientPhone:   String(initialValues.recipientPhone   ?? ''),
    packageCount:     String(initialValues.packageCount     ?? '1'),
    declaredContent:  String(initialValues.declaredContent  ?? ''),
  });

  const set = (field) => (e) =>
    setForm((prev) => ({ ...prev, [field]: e.target.value }));

  const handleConfirm = () => {
    onConfirm({
      senderName:        form.senderName.trim(),
      senderDocument:    form.senderDocument.trim(),
      senderPhone:       form.senderPhone.trim(),
      senderAddress:     form.senderAddress.trim(),
      recipientName:     form.recipientName.trim() || 'Cliente Ocasional',
      recipientDocument: form.recipientDocument.trim(),
      recipientAddress:  form.recipientAddress.trim(),
      recipientPhone:    form.recipientPhone.trim(),
      packageCount:      Math.max(1, Number(form.packageCount) || 1),
      declaredContent:   form.declaredContent.trim(),
    });
  };

  const Field = ({ label, field, placeholder = '', inputMode = 'text' }) => (
    <div className="input-group" style={{ marginBottom: '0.6rem' }}>
      <label className="input-label" style={{ marginBottom: '0.2rem' }}>{label}</label>
      <input
        className="input-field"
        value={form[field]}
        onChange={set(field)}
        placeholder={placeholder}
        inputMode={inputMode}
        style={{ width: '100%' }}
      />
    </div>
  );

  return (
    <div
      style={{
        position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
        backgroundColor: 'rgba(0,0,0,0.55)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        zIndex: 1300,
      }}
      onMouseDown={(e) => { if (e.target === e.currentTarget) onCancel(); }}
    >
      <div
        className="card"
        style={{ width: '560px', maxWidth: '96vw', maxHeight: '92vh', overflowY: 'auto' }}
      >
        <h3 style={{ marginTop: 0, marginBottom: '1rem' }}>Datos de la guia de envio</h3>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: '0 1rem',
          }}
        >
          {/* Columna remitente */}
          <div>
            <div
              style={{
                fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase',
                letterSpacing: '0.8px', marginBottom: '0.5rem', color: 'var(--text-secondary)',
              }}
            >
              Remitente (quien envia)
            </div>
            <Field label="Nombre"       field="senderName"     placeholder="Nombre del remitente" />
            <Field label="Documento"    field="senderDocument" placeholder="CC / NIT (opcional)" />
            <Field label="Telefono"     field="senderPhone"    placeholder="Telefono" inputMode="tel" />
            <Field label="Direccion"    field="senderAddress"  placeholder="Direccion de recogida" />
          </div>

          {/* Columna destinatario */}
          <div>
            <div
              style={{
                fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase',
                letterSpacing: '0.8px', marginBottom: '0.5rem', color: 'var(--text-secondary)',
              }}
            >
              Destinatario (quien recibe)
            </div>
            <Field label="Nombre"       field="recipientName"     placeholder="Nombre del destinatario" />
            <Field label="Documento"    field="recipientDocument" placeholder="CC / NIT (opcional)" />
            <Field label="Telefono"     field="recipientPhone"    placeholder="Telefono" inputMode="tel" />
            <Field label="Direccion"    field="recipientAddress"  placeholder="Direccion de entrega" />
          </div>
        </div>

        {/* Fila inferior: bultos y contenido */}
        <div style={{ display: 'grid', gridTemplateColumns: '100px 1fr', gap: '0 1rem', marginTop: '0.25rem' }}>
          <Field label="Bultos" field="packageCount" placeholder="1" inputMode="numeric" />
          <Field label="Contenido declarado" field="declaredContent" placeholder="Descripcion de la mercancia" />
        </div>

        <div style={{ display: 'flex', gap: '0.5rem', marginTop: '1rem' }}>
          <button className="btn btn-primary" style={{ flex: 1 }} onClick={handleConfirm}>
            Imprimir guia
          </button>
          <button className="btn" style={{ flex: 1 }} onClick={onCancel}>
            Cancelar
          </button>
        </div>
      </div>
    </div>
  );
}
