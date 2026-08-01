import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';

const normalizeCode = (value) => String(value ?? '').trim().replace(/\s+/g, '');

const getCategoryIcon = (category) => {
  const normalized = String(category || '').toLowerCase();
  if (normalized.includes('cafe') || normalized.includes('café')) return '☕';
  if (normalized.includes('pan') || normalized.includes('pastel') || normalized.includes('reposter')) return '🥐';
  if (normalized.includes('dulce') || normalized.includes('snack') || normalized.includes('confiter')) return '🍬';
  if (normalized.includes('bebida') || normalized.includes('jugo')) return '🥤';
  if (normalized.includes('comida') || normalized.includes('alimento')) return '🍽️';
  return '📦';
};

export function ProductSelector({ onAddItem, isAdmin, products }) {
  const [quantity, setQuantity] = useState(1);
  const [isGift, setIsGift] = useState(false);
  const [barcodeInput, setBarcodeInput] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [activeCategory, setActiveCategory] = useState('TODOS');
  const scannerInputRef = useRef(null);
  const searchInputRef = useRef(null);
  const scanBufferRef = useRef('');
  const scanLastKeyAtRef = useRef(0);

  const saleableProducts = useMemo(
    () => (products || []).filter((product) => product?.is_visible !== false),
    [products]
  );

  const categories = useMemo(() => {
    const unique = Array.from(new Set(
      saleableProducts
        .map((product) => String(product?.category || 'General').trim() || 'General')
        .filter(Boolean)
    ));
    return unique.sort((a, b) => a.localeCompare(b, 'es'));
  }, [saleableProducts]);

  const normalizedSearchTerm = String(searchTerm || '').trim().toLowerCase();
  const filteredProducts = useMemo(() => saleableProducts.filter((product) => {
    const productCategory = String(product?.category || 'General').trim() || 'General';
    if (activeCategory !== 'TODOS' && productCategory !== activeCategory) return false;
    if (!normalizedSearchTerm) return true;

    return [product?.name, product?.barcode, productCategory]
      .map((value) => String(value || '').toLowerCase())
      .join(' ')
      .includes(normalizedSearchTerm);
  }), [activeCategory, normalizedSearchTerm, saleableProducts]);

  const isProductOutOfStock = useCallback(
    (product) => String(product?.status || '').toLowerCase() === 'agotado',
    []
  );

  const focusScanner = useCallback(() => scannerInputRef.current?.focus(), []);

  const findProductByBarcode = useCallback((value) => {
    const scanned = normalizeCode(value);
    if (!scanned) return null;
    const scannedDigits = scanned.replace(/\D/g, '');

    return saleableProducts.find((product) => {
      const productBarcode = normalizeCode(product?.barcode);
      if (!productBarcode) return false;
      if (productBarcode === scanned) return true;
      const productDigits = productBarcode.replace(/\D/g, '');
      return !!(scannedDigits && productDigits && scannedDigits === productDigits);
    }) || null;
  }, [saleableProducts]);

  const addProduct = useCallback((product, options = {}) => {
    if (!product) return;
    if (isProductOutOfStock(product)) {
      alert('Este articulo esta marcado como AGOTADO.');
      return;
    }

    const gift = options.isGift ?? isGift;
    if (gift && !isAdmin) {
      alert('Debe estar autorizado por el administrador para marcar un regalo.');
      return;
    }

    const selectedQuantity = Math.max(1, Math.trunc(Number(options.quantity ?? quantity) || 1));
    const finalPrice = gift ? 0 : Number(product?.price || 0);
    onAddItem({
      ...product,
      price: finalPrice,
      isGift: gift,
      quantity: selectedQuantity,
      total: finalPrice * selectedQuantity,
    });
  }, [isAdmin, isGift, isProductOutOfStock, onAddItem, quantity]);

  const processScannedCode = useCallback((rawValue) => {
    const normalized = normalizeCode(rawValue);
    if (!normalized) return;

    const product = findProductByBarcode(normalized);
    if (product) {
      addProduct(product, { quantity: 1, isGift: false });
      setBarcodeInput('');
      focusScanner();
      return;
    }

    if (normalized.length > 3) {
      alert('Producto no encontrado por codigo de barras.');
      setBarcodeInput('');
      focusScanner();
    }
  }, [addProduct, findProductByBarcode, focusScanner]);

  const handleBarcodeScan = (event) => {
    if (event.key !== 'Enter') return;
    event.preventDefault();
    processScannedCode(barcodeInput);
  };

  useEffect(() => {
    const handleShortcuts = (event) => {
      if (event.key === 'F2') {
        event.preventDefault();
        focusScanner();
      }
      if (event.key === 'F3') {
        event.preventDefault();
        searchInputRef.current?.focus();
      }
    };
    window.addEventListener('keydown', handleShortcuts);
    return () => window.removeEventListener('keydown', handleShortcuts);
  }, [focusScanner]);

  useEffect(() => {
    const isTypingTarget = (target) => {
      if (!target || !(target instanceof HTMLElement)) return false;
      return ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName) || target.isContentEditable;
    };

    const handleGlobalScanner = (event) => {
      if (event.ctrlKey || event.altKey || event.metaKey) return;
      if (event.target === scannerInputRef.current || isTypingTarget(event.target)) return;

      const now = Date.now();
      if (now - scanLastKeyAtRef.current > 120) scanBufferRef.current = '';
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
  }, [processScannedCode]);

  return (
    <section className="pos-catalog card" aria-label="Catalogo de productos">
      <div className="pos-catalog__header">
        <div>
          <span className="pos-catalog__eyebrow">FACTURACION RAPIDA</span>
          <h2>Catalogo tactil</h2>
          <p>Toque un producto para agregarlo a la factura.</p>
        </div>
        <div className="pos-catalog__counter">{filteredProducts.length} productos</div>
      </div>

      <div className="pos-toolbar">
        <label className="pos-search">
          <span aria-hidden="true">🔎</span>
          <input
            ref={searchInputRef}
            type="search"
            value={searchTerm}
            onChange={(event) => setSearchTerm(event.target.value)}
            placeholder="Buscar cafe, pan, dulce o codigo..."
            autoComplete="off"
          />
          {searchTerm && (
            <button type="button" onClick={() => setSearchTerm('')} aria-label="Limpiar busqueda">×</button>
          )}
        </label>

        <label className="pos-scanner">
          <span>Codigo</span>
          <input
            ref={scannerInputRef}
            type="text"
            value={barcodeInput}
            onChange={(event) => setBarcodeInput(event.target.value)}
            onKeyDown={handleBarcodeScan}
            placeholder="Escanear + Enter"
            autoComplete="off"
          />
          <button type="button" onClick={focusScanner}>F2</button>
        </label>
      </div>

      <div className="pos-category-strip" aria-label="Categorias de productos">
        <button
          type="button"
          className={activeCategory === 'TODOS' ? 'active' : ''}
          onClick={() => setActiveCategory('TODOS')}
        >
          <span>✨</span> Todos
        </button>
        {categories.map((category) => (
          <button
            key={category}
            type="button"
            className={activeCategory === category ? 'active' : ''}
            onClick={() => setActiveCategory(category)}
          >
            <span>{getCategoryIcon(category)}</span> {category}
          </button>
        ))}
      </div>

      <div className="pos-sale-options">
        <div className="pos-quantity-control" aria-label="Cantidad a agregar">
          <span>Cantidad</span>
          <button type="button" onClick={() => setQuantity((current) => Math.max(1, Number(current || 1) - 1))}>−</button>
          <input
            type="number"
            min="1"
            value={quantity}
            onChange={(event) => setQuantity(Math.max(1, Math.trunc(Number(event.target.value) || 1)))}
            aria-label="Cantidad"
          />
          <button type="button" onClick={() => setQuantity((current) => Number(current || 1) + 1)}>+</button>
        </div>

        <label className="pos-gift-toggle">
          <input type="checkbox" checked={isGift} onChange={(event) => setIsGift(event.target.checked)} />
          <span>Marcar como regalo</span>
        </label>
      </div>

      {filteredProducts.length > 0 ? (
        <div className="pos-product-grid">
          {filteredProducts.map((product) => {
            const outOfStock = isProductOutOfStock(product);
            const category = String(product?.category || 'General').trim() || 'General';
            return (
              <button
                key={product.id}
                type="button"
                className={`pos-product-card${outOfStock ? ' is-out' : ''}`}
                onClick={() => addProduct(product)}
                disabled={outOfStock}
                aria-label={`Agregar ${product.name} por $${Number(product.price || 0).toLocaleString('es-CO')}`}
              >
                <div className="pos-product-card__media">
                  <div className="pos-product-card__fallback" aria-hidden="true">
                    <span>{getCategoryIcon(category)}</span>
                  </div>
                  {product.image_url && (
                    <img
                      src={product.image_url}
                      alt={product.name || 'Producto'}
                      loading="lazy"
                      onError={(event) => { event.currentTarget.style.display = 'none'; }}
                    />
                  )}
                  <span className={`pos-stock-badge${outOfStock ? ' is-out' : ''}`}>
                    {outOfStock ? 'Agotado' : `Stock ${Math.max(0, Number(product?.stock || 0))}`}
                  </span>
                </div>
                <div className="pos-product-card__body">
                  <span className="pos-product-card__category">{category}</span>
                  <strong>{product.name}</strong>
                  <span className="pos-product-card__price">${Number(product.price || 0).toLocaleString('es-CO')}</span>
                </div>
              </button>
            );
          })}
        </div>
      ) : (
        <div className="pos-empty-state">
          <span aria-hidden="true">🔍</span>
          <strong>No encontramos productos</strong>
          <p>Cambie la categoria o borre el texto de busqueda.</p>
        </div>
      )}
    </section>
  );
}
