import React, { useEffect, useRef, useState } from 'react';
import JsBarcode from 'jsbarcode';
import { COMPANY_INFO } from '../constants';

export function BarcodeModule({ products, setProducts, onLog, preselectedProductId, setPreselectedProductId, userId, canManageCodes = true }) {
  const [selectedProductId, setSelectedProductId] = useState(preselectedProductId || '');
  const [generatedLabel, setGeneratedLabel] = useState(null);
  const [savedLabels, setSavedLabels] = useState([]);
  const [massGenerated, setMassGenerated] = useState([]);
  const [barcodeFormat, setBarcodeFormat] = useState('CODE128');
  const [printMenuOpen, setPrintMenuOpen] = useState(false);
  const barcodeRef = useRef(null);
  const printMenuRef = useRef(null);
  const labelsStorageKey = `fact_saved_labels_${userId || 'anon'}`;

  const digitsOnly = (value) => String(value ?? '').replace(/\D/g, '');
  const normalizeNumericBarcode = (value) => {
    const raw = String(value ?? '').trim();
    return /^\d+$/.test(raw) ? raw : '';
  };
  const productsWithoutBarcode = products.filter((p) => !normalizeNumericBarcode(p.barcode));
  const productsWithBarcode = products.filter((p) => normalizeNumericBarcode(p.barcode));

  const barcodeLengthByFormat = (format) => {
    if (format === 'ITF') return 14;
    if (format === 'EAN13') return 13;
    return 12;
  };

  const generateUniqueNumericBarcode = (list, length, currentProductId) => {
    const usedRaw = list
      .filter((p) => String(p.id) !== String(currentProductId))
      .map((p) => digitsOnly(p.barcode))
      .filter((code) => code.length > 0);

    const usedNormalized = new Set(
      usedRaw.map((code) => code.padStart(length, '0').slice(-length))
    );

    const defaultStart = BigInt(`770${'0'.repeat(Math.max(length - 3, 1))}`.slice(0, length));
    let maxUsed = defaultStart - 1n;

    usedRaw.forEach((code) => {
      const asNumber = BigInt(code);
      if (asNumber > maxUsed) maxUsed = asNumber;
    });

    let candidate = maxUsed + 1n;
    let candidateStr = candidate.toString().padStart(length, '0').slice(-length);

    while (usedNormalized.has(candidateStr)) {
      candidate += 1n;
      candidateStr = candidate.toString().padStart(length, '0').slice(-length);
    }

    return candidateStr;
  };

  const toLabelFromProduct = (product, idx = 0) => ({
    id: `p-${product.id}-${idx}-${Date.now()}`,
    productId: product.id,
    name: product.name,
    category: product.category || 'General',
    price: product.price || 0,
    barcode: normalizeNumericBarcode(product.barcode),
    format: barcodeFormat,
    date: new Date().toLocaleDateString(),
  });

  const getProductsWithBarcodeLabels = () =>
    products
      .filter((p) => String(p.barcode || '').trim() !== '')
      .map((p, idx) => toLabelFromProduct(p, idx));

  const getBulkLabels = () => {
    if (savedLabels.length > 0) return savedLabels;
    if (generatedLabel) return [generatedLabel];
    return getProductsWithBarcodeLabels();
  };

  const buildBarcodeSvgMarkup = (label) => {
    try {
      const rawBarcode = normalizeNumericBarcode(label?.barcode);
      const fallbackBarcode = rawBarcode || '770000000001';

      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      JsBarcode(svg, fallbackBarcode, {
        format: 'CODE128',
        width: 1.6,
        height: 52,
        displayValue: true,
        fontSize: 11,
        margin: 2,
      });
      return svg.outerHTML;
    } catch (e) {
      console.error('Error generando codigo para impresion masiva:', e);
      return `<div style="font-size:11px;text-align:center;padding:6px 0;">Codigo: ${label?.barcode || 'N/A'}</div>`;
    }
  };

  const openPrintWindow = (labels, mode) => {
    if (!labels.length) {
      alert('No hay etiquetas para imprimir.');
      return;
    }

    const popup = window.open('', '_blank', 'width=1000,height=800');
    if (!popup) {
      alert('Permite ventanas emergentes para imprimir.');
      return;
    }

    const isLetter = mode === 'letter';

    const stickersHtml = labels
      .map((label) => {
        const barcodeSvg = buildBarcodeSvgMarkup(label);
        return `
          <article class="sticker">
            <div class="company">${COMPANY_INFO.name}</div>
            <div class="meta-row">
              <span><strong>Categoria:</strong> ${label.category || 'General'}</span>
              <span><strong>Producto:</strong> ${label.name || 'N/A'}</span>
            </div>
            <div class="price">$${Number(label.price || 0).toLocaleString('es-CO')}</div>
            <div class="barcode-wrap">${barcodeSvg}</div>
            <div class="exp">Producto: ${label.name || 'N/A'} | Codigo: ${label.barcode} | Fecha exp: ${label.date}</div>
          </article>
        `;
      })
      .join('');

    const css = isLetter
      ? `
        @page { size: Letter portrait; margin: 8mm; }
        body { margin: 0; font-family: Arial, sans-serif; color: #111; }
        .sheet {
          display: grid;
          grid-template-columns: repeat(3, 63mm);
          gap: 4mm;
          justify-content: center;
        }
        .sticker {
          width: 63mm;
          min-height: 34mm;
          box-sizing: border-box;
          border: 1px solid #000;
          padding: 2.5mm;
          page-break-inside: avoid;
          overflow: hidden;
        }
      `
      : `
        @page { size: 58mm auto; margin: 0; }
        body { margin: 0; font-family: Arial, sans-serif; color: #111; width: 58mm; }
        .sheet {
          display: flex;
          flex-direction: column;
          gap: 2mm;
          align-items: center;
          width: 58mm;
          margin: 0 auto;
          padding: 2mm 0;
        }
        .sticker {
          width: 58mm;
          min-height: 34mm;
          box-sizing: border-box;
          border: 1px solid #000;
          padding: 2mm;
          page-break-inside: avoid;
          overflow: hidden;
        }
      `;

    popup.document.open();
    popup.document.write(`
      <html>
        <head>
          <title>Impresion de etiquetas</title>
          <style>
            ${css}
            .company {
              font-size: 9px;
              font-weight: 700;
              text-transform: uppercase;
              text-align: center;
              line-height: 1.2;
              margin-bottom: 1.5mm;
              white-space: normal;
              word-break: break-word;
            }
            .meta-row {
              display: flex;
              justify-content: space-between;
              align-items: center;
              gap: 2mm;
              font-size: 8px;
              margin-bottom: 1.5mm;
            }
            .price {
              font-size: 13px;
              font-weight: 700;
              text-align: center;
              margin-bottom: 1mm;
            }
            .barcode-wrap {
              display: flex;
              justify-content: center;
              align-items: center;
              width: 100%;
              margin-bottom: 1mm;
            }
            .barcode-wrap svg {
              width: 100%;
              height: auto;
              max-height: 19mm;
            }
            .exp {
              font-size: 7px;
              color: #333;
              text-align: center;
              line-height: 1.2;
            }
          </style>
        </head>
        <body>
          <section class="sheet">${stickersHtml}</section>
          <script>
            setTimeout(() => {
              window.focus();
              window.print();
            }, 200);
          </script>
        </body>
      </html>
    `);
    popup.document.close();
  };

  useEffect(() => {
    if (!preselectedProductId) return;
    const product = products.find((p) => String(p.id) === String(preselectedProductId));
    if (!product) {
      setPreselectedProductId('');
      return;
    }

    if (String(product.barcode || '').trim()) {
      // Si ya tiene codigo, no entra al flujo de generar; solo lo carga para reimpresion.
      setGeneratedLabel(toLabelFromProduct(product, 'pre'));
      setSelectedProductId('');
    } else {
      if (!canManageCodes) {
        alert('Solo puedes imprimir codigos ya creados.');
        setPreselectedProductId('');
        return;
      }
      setSelectedProductId(preselectedProductId);
    }
    setPreselectedProductId('');
  }, [preselectedProductId, products, setPreselectedProductId, canManageCodes]);

  useEffect(() => {
    if (generatedLabel && barcodeRef.current) {
      try {
        JsBarcode(barcodeRef.current, generatedLabel.barcode, {
          format: generatedLabel.format || 'CODE128',
          width: 2,
          height: 80,
          displayValue: true,
          fontSize: 14,
          margin: 10,
        });
      } catch (e) {
        console.error('Barcode generation error:', e);
      }
    }
  }, [generatedLabel]);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (!printMenuRef.current) return;
      if (!printMenuRef.current.contains(event.target)) {
        setPrintMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(labelsStorageKey);
      if (!raw) {
        setSavedLabels([]);
        return;
      }
      const parsed = JSON.parse(raw);
      setSavedLabels(Array.isArray(parsed) ? parsed : []);
    } catch (error) {
      console.error('No se pudo restaurar biblioteca de etiquetas:', error);
      setSavedLabels([]);
    }
  }, [labelsStorageKey]);

  useEffect(() => {
    try {
      localStorage.setItem(labelsStorageKey, JSON.stringify(savedLabels));
    } catch (error) {
      console.error('No se pudo persistir biblioteca de etiquetas:', error);
    }
  }, [savedLabels, labelsStorageKey]);

  const handleGenerate = () => {
    if (!canManageCodes) {
      alert('No tienes permiso para crear codigos.');
      return;
    }

    const product = products.find((p) => String(p.id) === String(selectedProductId));
    if (!product) return alert('Seleccione un producto');

    const currentBarcode = normalizeNumericBarcode(product.barcode);
    if (currentBarcode) {
      setGeneratedLabel(toLabelFromProduct(product, 'exists'));
      alert('Este producto ya tiene codigo. Use la biblioteca para reimprimir.');
      return;
    }

    const length = barcodeLengthByFormat(barcodeFormat);

    const finalBarcode = generateUniqueNumericBarcode(products, length, product.id);
    const issuedDate = new Date().toLocaleDateString();

    const newLabel = {
      id: crypto.randomUUID?.() || `lbl-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      productId: product.id,
      name: product.name,
      category: product.category || 'General',
      price: product.price,
      barcode: finalBarcode,
      format: barcodeFormat,
      date: issuedDate,
    };

    setGeneratedLabel(newLabel);

    setProducts((prev) =>
      prev.map((p) => (String(p.id) === String(product.id) ? { ...p, barcode: finalBarcode } : p))
    );

    onLog?.({
      module: 'Codigos',
      action: 'Generar Codigo Barras',
      details: `Etiqueta para: ${product.name} (${newLabel.barcode})`,
    });
  };

  const handleGenerateMassiveCodes = () => {
    if (!canManageCodes) {
      alert('No tienes permiso para crear codigos.');
      return;
    }

    const missingProducts = products.filter((p) => !String(p.barcode || '').trim());
    if (missingProducts.length === 0) {
      alert('Todos los productos ya tienen codigo.');
      setMassGenerated([]);
      return;
    }

    const length = barcodeLengthByFormat(barcodeFormat);
    let workingProducts = [...products];
    const issuedDate = new Date().toLocaleDateString();
    const createdLabels = [];

    for (const product of missingProducts) {
      const newCode = generateUniqueNumericBarcode(workingProducts, length, product.id);

      workingProducts = workingProducts.map((p) =>
        String(p.id) === String(product.id) ? { ...p, barcode: newCode } : p
      );

      createdLabels.push({
        id: crypto.randomUUID?.() || `lbl-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        productId: product.id,
        name: product.name,
        category: product.category || 'General',
        price: product.price || 0,
        barcode: newCode,
        format: barcodeFormat,
        date: issuedDate,
      });
    }

    setProducts(workingProducts);
    setSavedLabels((prev) => [...createdLabels, ...prev]);
    setMassGenerated(createdLabels);

    onLog?.({
      module: 'Codigos',
      action: 'Generar Codigos Masivos',
      details: `Se generaron ${createdLabels.length} codigos para productos sin codigo`,
    });

    alert(`Se generaron ${createdLabels.length} codigos consecutivos.`);
  };

  const handleSaveLabel = () => {
    if (!generatedLabel) return;
    setSavedLabels((prev) => [generatedLabel, ...prev]);
    alert('Etiqueta guardada en la biblioteca');
  };

  const handleApplyToProduct = () => {
    if (!canManageCodes) {
      alert('No tienes permiso para modificar codigos.');
      return;
    }

    if (!generatedLabel) return;

    setProducts((prev) =>
      prev.map((p) =>
        String(p.id) === String(generatedLabel.productId)
          ? { ...p, barcode: generatedLabel.barcode }
          : p
      )
    );

    alert(`Codigo ${generatedLabel.barcode} asignado a ${generatedLabel.name}`);
  };

  const handlePrintBySource = (mode, source) => {
    let labels = [];

    if (source === 'actual') {
      if (!generatedLabel) {
        alert('Primero seleccione o genere una etiqueta para usar "etiqueta actual".');
        return;
      }
      labels = [generatedLabel];
    } else if (source === 'guardadas') {
      labels = savedLabels;
    } else if (source === 'existentes') {
      labels = getProductsWithBarcodeLabels();
    } else {
      labels = getBulkLabels();
    }

    openPrintWindow(labels, mode);
    setPrintMenuOpen(false);
  };

  const handlePrintExistingProduct = (product, mode = '58mm') => {
    const label = toLabelFromProduct(product, 'existing');
    setGeneratedLabel(label);
    openPrintWindow([label], mode);
  };

  const printerIcon = '\uD83D\uDDA8';

  return (
    <div className="barcode-module">
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2rem' }}>
        <div className="card">
          <h2 style={{ marginTop: 49 }}>{canManageCodes ? 'Generador de Codigos' : 'Impresion de Codigos'}</h2>

          {canManageCodes && (
            <div className="input-group">
              <label className="input-label">Seleccionar Producto</label>
              <select
                className="input-field"
                value={selectedProductId}
                onChange={(e) => setSelectedProductId(e.target.value)}
              >
                <option value="">Seleccione...</option>
                {productsWithoutBarcode.map((p, idx) => (
                  <option key={`${p.id}-${idx}`} value={p.id}>
                    {p.name} - ${p.price}
                  </option>
                ))}
              </select>
              {productsWithoutBarcode.length === 0 && (
                <small style={{ color: '#64748b' }}>
                  Todos los productos ya tienen codigo asignado.
                </small>
              )}
            </div>
          )}

          {canManageCodes && (
            <div className="input-group">
              <label className="input-label">Sistema de Codificacion</label>
              <select
                className="input-field"
                value={barcodeFormat}
                onChange={(e) => setBarcodeFormat(e.target.value)}
              >
                <option value="CODE128">CODE 128 (12 digitos)</option>
                <option value="EAN13">EAN-13 (13 digitos)</option>
                <option value="ITF">ITF-14 (14 digitos)</option>
              </select>
            </div>
          )}

          {canManageCodes ? (
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <button className="btn btn-primary" onClick={handleGenerate} style={{ flex: 1 }}>
                Generar Etiqueta
              </button>
              <button
                className="btn"
                onClick={handleGenerateMassiveCodes}
                style={{ flex: 1, backgroundColor: '#f59e0b', color: 'white' }}
              >
                Crear codigos masivos
              </button>
              {generatedLabel && (
                <button className="btn" onClick={handleSaveLabel} style={{ flex: 1 }}>
                  Guardar
                </button>
              )}
            </div>
          ) : (
            <div className="card" style={{ backgroundColor: '#f8fafc', marginTop: '0.5rem' }}>
              <p style={{ margin: 0, color: '#334155' }}>
                Modo Cajero: solo impresion de codigos existentes.
              </p>
            </div>
          )}

          {massGenerated.length > 0 && (
            <div className="card" style={{ marginTop: '1rem', backgroundColor: '#fff7ed' }}>
              <h4 style={{ margin: '0 0 0.5rem 0' }}>Generados automaticamente (sin codigo previo)</h4>
              <div style={{ maxHeight: '180px', overflowY: 'auto', fontSize: '0.85rem' }}>
                {massGenerated.map((item) => (
                  <div key={item.id} style={{ padding: '0.35rem 0', borderBottom: '1px solid #fed7aa' }}>
                    <strong>{item.name}</strong>{' -> '}{item.barcode}
                  </div>
                ))}
              </div>
            </div>
          )}

          {generatedLabel && (
            <div
              className="card printable-area"
              style={{
                marginTop: '1.5rem',
                width: '58mm',
                textAlign: 'center',
                border: '1px dashed #ccc',
                padding: '10px',
                margin: '1.5rem auto',
              }}
            >
              <p style={{ margin: '0 0 6px', fontSize: '10px', fontWeight: 'bold', textTransform: 'uppercase' }}>
                {COMPANY_INFO.name}
              </p>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: '6px', fontSize: '8px', marginBottom: '6px' }}>
                <span><strong>Categoria:</strong> {generatedLabel.category}</span>
                <span><strong>Producto:</strong> {generatedLabel.name}</span>
              </div>
              <p style={{ margin: '0 0 5px', fontSize: '12px' }}>
                <strong>${generatedLabel.price.toLocaleString()}</strong>
              </p>
              <svg ref={barcodeRef} style={{ width: '100%', height: 'auto' }}></svg>
              <p style={{ margin: '5px 0 0', fontSize: '8px', color: '#666' }}>
                Producto: {generatedLabel.name} | Codigo: {generatedLabel.barcode} | Fecha exp: {generatedLabel.date}
              </p>
              {canManageCodes && (
                <button
                  className="btn no-print"
                  style={{ marginTop: '5px', width: '100%', backgroundColor: '#10b981', color: 'white' }}
                  onClick={handleApplyToProduct}
                >
                  Asignar a Producto
                </button>
              )}
            </div>
          )}
        </div>

        <div className="card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
            <h2 style={{ marginTop: 0, marginBottom: 0 }}>Biblioteca de Etiquetas</h2>
            <div ref={printMenuRef} style={{ position: 'relative' }}>
              <button
                className="btn btn-primary"
                onClick={() => setPrintMenuOpen((prev) => !prev)}
                title="Opciones de impresion"
              >
                {printerIcon}
              </button>
              {printMenuOpen && (
                <div
                  className="card"
                  style={{
                    position: 'absolute',
                    right: 0,
                    top: '110%',
                    width: '260px',
                    zIndex: 20,
                    padding: '0.5rem'
                  }}
                >
                  <button className="btn" style={{ width: '100%', marginBottom: '0.35rem' }} onClick={() => handlePrintBySource('58mm', 'actual')}>
                    Imprimir etiqueta actual (58mm)
                  </button>
                  <button className="btn" style={{ width: '100%', marginBottom: '0.35rem' }} onClick={() => handlePrintBySource('letter', 'actual')}>
                    Imprimir etiqueta actual (Carta)
                  </button>
                  <button className="btn" style={{ width: '100%', marginBottom: '0.35rem' }} onClick={() => handlePrintBySource('letter', 'guardadas')}>
                    Impresion masiva guardadas (Carta)
                  </button>
                  <button className="btn" style={{ width: '100%', marginBottom: '0.35rem' }} onClick={() => handlePrintBySource('58mm', 'guardadas')}>
                    Impresion masiva guardadas (58mm)
                  </button>
                  <button className="btn" style={{ width: '100%', marginBottom: '0.35rem' }} onClick={() => handlePrintBySource('letter', 'existentes')}>
                    Productos con codigo (Carta)
                  </button>
                  <button className="btn" style={{ width: '100%' }} onClick={() => handlePrintBySource('58mm', 'existentes')}>
                    Productos con codigo (58mm)
                  </button>
                </div>
              )}
            </div>
          </div>

          {savedLabels.length === 0 ? (
            <p style={{ color: '#64748b', marginTop: '1rem' }}>
              No hay etiquetas guardadas. Tambien puede imprimir productos que ya tienen codigo desde el boton de impresion.
            </p>
          ) : (
            <div style={{ maxHeight: '400px', overflowY: 'auto', marginTop: '1rem' }}>
              {savedLabels.map((label) => (
                <div
                  key={label.id}
                  className="card"
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    padding: '10px',
                    marginBottom: '10px',
                    backgroundColor: '#f8fafc',
                  }}
                >
                  <div>
                    <strong>{label.name}</strong>
                    <div style={{ fontSize: '0.8em', color: '#64748b' }}>
                      {label.barcode} | ${label.price}
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: '5px' }}>
                    <button className="btn" onClick={() => setGeneratedLabel(label)} title="Ver">Ver</button>
                    <button className="btn" style={{ color: 'red' }} onClick={() => setSavedLabels(savedLabels.filter((l) => l.id !== label.id))}>X</button>
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="card" style={{ marginTop: '1rem', backgroundColor: '#f8fafc' }}>
            <h4 style={{ margin: '0 0 0.5rem' }}>Productos ya codificados</h4>
            {productsWithBarcode.length === 0 ? (
              <p style={{ margin: 0, color: '#64748b' }}>Aun no hay productos con codigo.</p>
            ) : (
              <div style={{ maxHeight: '220px', overflowY: 'auto', fontSize: '0.85rem' }}>
                {productsWithBarcode.map((p) => (
                  <div key={p.id} style={{ display: 'grid', gridTemplateColumns: '1fr auto auto', alignItems: 'center', gap: '0.4rem', padding: '0.35rem 0', borderBottom: '1px solid #e2e8f0' }}>
                    <span>{p.name}</span>
                    <strong>{p.barcode}</strong>
                    <div style={{ display: 'flex', gap: '0.25rem' }}>
                      <button className="btn" style={{ padding: '0.2rem 0.4rem', fontSize: '0.75rem' }} onClick={() => setGeneratedLabel(toLabelFromProduct(p, 'view'))}>
                        Ver
                      </button>
                      <button className="btn btn-primary" style={{ padding: '0.2rem 0.4rem', fontSize: '0.75rem' }} onClick={() => handlePrintExistingProduct(p, '58mm')}>
                        {'\uD83D\uDDA8\uFE0F'}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
