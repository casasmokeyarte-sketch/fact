import React, { useState, useEffect, useRef } from 'react';

export function ProductSelector({ onAddItem, isAdmin, products }) {
  const [selectedProductId, setSelectedProductId] = useState('');
  const [quantity, setQuantity] = useState(1);
  const [isGift, setIsGift] = useState(false);
  const [barcodeInput, setBarcodeInput] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const scannerInputRef = useRef(null);
  const scanBufferRef = useRef('');
  const scanLastKeyAtRef = useRef(0);

  const isProductVisibleForSale = (product) => product?.is_visible !== false;
  const isProductOutOfStockFlag = (product) => String(product?.status || '').toLowerCase() === 'agotado';
  const saleableProducts = (products || []).filter((p) => isProductVisibleForSale(p));
  const normalizedSearchTerm = String(searchTerm || '').trim().toLowerCase();
  const filteredProducts = saleableProducts.filter((product) => {
    if (!normalizedSearchTerm) return true;
    const haystack = [
      product?.name || '',
      product?.barcode || '',
      product?.category || '',
    ].join(' ').toLowerCase();
    return haystack.includes(normalizedSearchTerm);
  });
  const selectedProduct = saleableProducts.find((p) => String(p.id) === String(selectedProductId)) || null;

  const normalizeCode = (value) => String(value ?? '').trim().replace(/\s+/g, '');
  const findProductByBarcode = (value) => {
    const scanned = normalizeCode(value);
    if (!scanned) return null;

    const scannedDigits = scanned.replace(/\D/g, '');
    return (
      saleableProducts.find((p) => {
        const productBarcode = normalizeCode(p.barcode);
        if (!productBarcode) return false;
        if (productBarcode === scanned) return true;
        const productDigits = productBarcode.replace(/\D/g, '');
        return scannedDigits && productDigits && scannedDigits === productDigits;
      }) || null
    );
  };

  const processScannedCode = (rawValue) => {
    const normalized = normalizeCode(rawValue);
    if (!normalized) return;

    const product = findProductByBarcode(normalized);
    if (product) {
      if (isProductOutOfStockFlag(product)) {
        alert('Este articulo esta marcado como AGOTADO.');
        setBarcodeInput('');
        focusScanner();
        return;
      }
      const finalPrice = product.price;
      onAddItem({
        ...product,
        quantity: 1,
        isGift: false,
        price: finalPrice,
        total: finalPrice * 1
      });
      setBarcodeInput('');
      focusScanner();
      return;
    }

    if (normalized.length > 3) {
      alert("Producto no encontrado por Codigo de barras");
      setBarcodeInput('');
      focusScanner();
    }
  };

  const handleBarcodeScan = (e) => {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    processScannedCode(barcodeInput);
  };

  const focusScanner = () => scannerInputRef.current?.focus();

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'F2') {
        e.preventDefault();
        focusScanner();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  useEffect(() => {
    const isTypingTarget = (target) => {
      if (!target || !(target instanceof HTMLElement)) return false;
      return target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT' || target.isContentEditable;
    };

    const handleGlobalScanner = (event) => {
      if (event.ctrlKey || event.altKey || event.metaKey) return;
      if (event.target === scannerInputRef.current) return;
      if (isTypingTarget(event.target)) return;

      const now = Date.now();
      if (now - scanLastKeyAtRef.current > 120) {
        scanBufferRef.current = '';
      }
      scanLastKeyAtRef.current = now;

      if (event.key === 'Enter' || event.key === 'Tab') {
        const candidate = normalizeCode(scanBufferRef.current);
        scanBufferRef.current = '';
        if (candidate.length >= 4) {
          event.preventDefault();
          processScannedCode(candidate);
        }
        return;
      }

      if (event.key.length === 1) {
        scanBufferRef.current += event.key;
        setBarcodeInput(scanBufferRef.current);
      }
    };

    window.addEventListener('keydown', handleGlobalScanner, true);
    return () => window.removeEventListener('keydown', handleGlobalScanner, true);
  }, [saleableProducts]);

  useEffect(() => {
    focusScanner();
  }, []);

  const handleAddClick = () => {
    const product = saleableProducts.find(p => String(p.id) === String(selectedProductId));
    if (!product) return alert("Seleccione un producto");
    if (isProductOutOfStockFlag(product)) return alert('Este articulo esta marcado como AGOTADO.');

    if (isGift && !isAdmin) {
      return alert("Debe estar autorizado por el administrador para marcar un regalo.");
    }

    const finalPrice = isGift ? 0 : product.price;
    onAddItem({
      ...product,
      price: finalPrice,
      isGift,
      quantity: Number(quantity),
      total: finalPrice * Number(quantity)
    });
    setSelectedProductId('');
    setQuantity(1);
    setIsGift(false);
    setSearchTerm('');
  };

  return (
    <div className="card">
      <h3 style={{ marginTop: 0 }}>Agregar Producto</h3>
      <div style={{ display: 'flex', gap: '1rem', alignItems: 'flex-end', flexWrap: 'wrap' }}>

        <div className="input-group" style={{ width: '220px', marginBottom: 0 }}>
          <label className="input-label">Escanear Codigo</label>
          <input
            ref={scannerInputRef}
            type="text"
            className="input-field"
            value={barcodeInput}
            onChange={(e) => setBarcodeInput(e.target.value)}
            onKeyDown={handleBarcodeScan}
            placeholder="Pase el lector y Enter"
            autoComplete="off"
          />
        </div>

        <div className="input-group" style={{ flex: 2, minWidth: '200px', marginBottom: 0 }}>
          <label className="input-label" style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span>YZ Buscar Producto o Escanear</span>
            <button className="btn" onClick={focusScanner} style={{ padding: '2px 8px', fontSize: '0.7rem', backgroundColor: '#e2e8f0' }}>Focus Scanner (F2)</button>
          </label>
          <input
            type="text"
            className="input-field"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Buscar por nombre, categoria o codigo"
            style={{ marginBottom: '0.5rem' }}
          />
          <select
            className="input-field"
            value={selectedProductId}
            onChange={(e) => setSelectedProductId(e.target.value)}
          >
            <option value="">Seleccione o pase el escAner...</option>
            {filteredProducts.map((p, idx) => (
              <option key={`${p.id}-${idx}`} value={p.id}>
                {p.name} - ${p.price} [Codigo: {p.barcode}]
              </option>
            ))}
          </select>
        </div>

        <div className="input-group" style={{ width: '80px', marginBottom: 0 }}>
          <label className="input-label">Cant.</label>
          <input
            type="number"
            className="input-field"
            value={quantity}
            min="1"
            onChange={(e) => setQuantity(e.target.value)}
          />
        </div>

        <div className="input-group" style={{ marginBottom: 0, display: 'flex', alignItems: 'center', gap: '5px', alignSelf: 'center', marginTop: 'auto' }}>
          <input
            type="checkbox"
            id="gift"
            checked={isGift}
            onChange={(e) => setIsGift(e.target.checked)}
          />
          <label htmlFor="gift" style={{ cursor: 'pointer', fontSize: '0.9rem' }}>YZ Regalo</label>
        </div>

        <button className="btn btn-primary" style={{ marginBottom: 0 }} onClick={handleAddClick}>
          Agregar
        </button>
      </div>

      {(selectedProduct || normalizedSearchTerm) && (
        <div style={{ marginTop: '1rem', display: 'grid', gridTemplateColumns: 'minmax(220px, 280px) 1fr', gap: '1rem' }}>
          <div className="card card--muted" style={{ padding: '0.9rem', minHeight: '220px' }}>
            {selectedProduct ? (
              <>
                {selectedProduct.image_url ? (
                  <img
                    src={selectedProduct.image_url}
                    alt={selectedProduct.name || 'Producto'}
                    style={{ width: '100%', height: '180px', objectFit: 'contain', borderRadius: '0.9rem', backgroundColor: 'var(--surface-muted)', marginBottom: '0.75rem' }}
                  />
                ) : (
                  <div style={{ width: '100%', height: '180px', borderRadius: '0.9rem', border: '1px dashed var(--border-soft)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-secondary)', marginBottom: '0.75rem' }}>
                    Sin imagen
                  </div>
                )}
                <div style={{ fontWeight: 800 }}>{selectedProduct.name}</div>
                <div style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>{selectedProduct.category || 'General'}</div>
                <div style={{ marginTop: '0.4rem', fontWeight: 700 }}>${Number(selectedProduct.price || 0).toLocaleString()}</div>
              </>
            ) : (
              <div style={{ color: 'var(--text-secondary)' }}>Seleccione un producto para ver su imagen.</div>
            )}
          </div>

          <div className="card card--muted" style={{ padding: '0.9rem' }}>
            <div style={{ fontWeight: 700, marginBottom: '0.75rem' }}>
              Resultados visibles: {filteredProducts.length}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(145px, 1fr))', gap: '0.75rem', maxHeight: '260px', overflowY: 'auto' }}>
              {filteredProducts.slice(0, 18).map((product) => {
                const isSelected = String(product.id) === String(selectedProductId);
                const isOut = isProductOutOfStockFlag(product);
                return (
                  <button
                    key={product.id}
                    type="button"
                    className="btn"
                    onClick={() => setSelectedProductId(product.id)}
                    style={{
                      textAlign: 'left',
                      padding: '0.55rem',
                      borderColor: isSelected ? '#2563eb' : 'var(--border-soft)',
                      backgroundColor: isSelected ? 'rgba(37, 99, 235, 0.08)' : 'transparent',
                      opacity: isOut ? 0.65 : 1
                    }}
                  >
                    {product.image_url ? (
                      <img
                        src={product.image_url}
                        alt={product.name || 'Producto'}
                        style={{ width: '100%', height: '96px', objectFit: 'cover', borderRadius: '0.7rem', marginBottom: '0.5rem', backgroundColor: 'var(--surface-muted)' }}
                      />
                    ) : (
                      <div style={{ width: '100%', height: '96px', borderRadius: '0.7rem', marginBottom: '0.5rem', border: '1px dashed var(--border-soft)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-secondary)', fontSize: '0.8rem' }}>
                        Sin imagen
                      </div>
                    )}
                    <div style={{ fontWeight: 700, fontSize: '0.9rem', lineHeight: 1.2 }}>{product.name}</div>
                    <div style={{ color: 'var(--text-secondary)', fontSize: '0.78rem', marginTop: '0.2rem' }}>{product.category || 'General'}</div>
                    <div style={{ marginTop: '0.35rem', fontWeight: 700 }}>${Number(product.price || 0).toLocaleString()}</div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
