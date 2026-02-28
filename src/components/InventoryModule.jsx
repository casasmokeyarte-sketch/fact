import React, { useState, useEffect } from 'react';
import * as XLSX from 'xlsx';

export function InventoryModule({ currentUser, products, setProducts, onDeleteProduct, onAcceptFromBodega, stock, setStock, categories, onLog, setActiveTab, setPreselectedProductId }) {
    const [view, setView] = useState('list'); // 'list', 'edit', 'count'
    const [editingProduct, setEditingProduct] = useState(null);
    const [physicalCounts, setPhysicalCounts] = useState({});
    const [searchTerm, setSearchTerm] = useState('');
    const [acceptQuantities, setAcceptQuantities] = useState({});
    const filterStorageKey = `fact_filter_inventory_${currentUser?.id || 'anon'}`;
    
    // Check if user is Cajero (read-only mode)
    const isCajero = currentUser?.role === 'Cajero';
    const canEdit = !isCajero && (currentUser?.permissions?.inventario?.editar !== false);
    const canCreate = !isCajero && (currentUser?.permissions?.inventario?.crear !== false);
    const canDelete = !isCajero && (currentUser?.permissions?.inventario?.eliminar !== false);
    const canExport = !isCajero && (currentUser?.permissions?.inventario?.exportar !== false);
    const canImport = !isCajero && (currentUser?.permissions?.inventario?.importar !== false);
    const canCount = !isCajero && (currentUser?.permissions?.inventario?.hacer_conteo !== false);
    const normalizeBarcode = (value) => {
        const raw = String(value ?? '').trim();
        return /^\d+$/.test(raw) ? raw : '';
    };
    const createProductId = () => {
        if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
            return crypto.randomUUID();
        }
        // Fallback UUID v4-compatible string if randomUUID is unavailable.
        return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
            const r = Math.random() * 16 | 0;
            const v = c === 'x' ? r : (r & 0x3 | 0x8);
            return v.toString(16);
        });
    };

    useEffect(() => {
        if (!currentUser?.id) return;
        const saved = localStorage.getItem(filterStorageKey);
        if (saved !== null) setSearchTerm(saved);
    }, [currentUser?.id]);

    useEffect(() => {
        if (!currentUser?.id) return;
        localStorage.setItem(filterStorageKey, searchTerm);
    }, [searchTerm, currentUser?.id]);

    // CRUD Functions
    const handleSaveProduct = (e) => {
        e.preventDefault();
        const formData = new FormData(e.target);
        const productData = {
            id: editingProduct
                ? editingProduct.id
                : createProductId(),
            name: formData.get('name'),
            price: Number(formData.get('price')),
            cost: Number(formData.get('cost')) || 0,
            unit: formData.get('unit') || 'un',
            barcode: normalizeBarcode(formData.get('barcode')),
            category: formData.get('category'),
            reorder_level: Number(formData.get('reorder_level')) || 10,
            status: String(formData.get('status') || 'activo'),
            is_visible: formData.get('is_visible') === 'on',
        };

        if (editingProduct) {
            setProducts(products.map(p => p.id === editingProduct.id ? productData : p));
            onLog?.({ module: 'Inventario', action: 'Editar Producto', details: `Se editA: ${productData.name}` });
        } else {
            setProducts([...products, productData]);
            onLog?.({ module: 'Inventario', action: 'Crear Producto', details: `Nuevo producto: ${productData.name}` });
        }
        setView('list');
        setEditingProduct(null);
    };

    const handleDelete = async (id) => {
        if (confirm("AEliminar este producto?")) {
            const prevProducts = products;
            setProducts(products.filter(p => p.id !== id));
            try {
                if (typeof onDeleteProduct === 'function') {
                    await onDeleteProduct(id);
                }
                onLog?.({ module: 'Inventario', action: 'Eliminar Producto', details: `Eliminado ID: ${id}` });
            } catch (err) {
                setProducts(prevProducts);
            }
        }
    };

    // Import/Export
    const handleExport = (type) => {
        if (type === 'json') {
            const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(products));
            const dlAnchor = document.createElement('a');
            dlAnchor.setAttribute("href", dataStr);
            dlAnchor.setAttribute("download", "productos.json");
            dlAnchor.click();
            dlAnchor.remove();
        } else if (type === 'excel') {
            const ws = XLSX.utils.json_to_sheet(products);
            const wb = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(wb, ws, "Productos");
            XLSX.writeFile(wb, "productos.xlsx");
        } else if (type === 'notes') {
            const headers = "id,nombre,precio,costo,unidad,codigo_barras,categoria,estado,reorder_level,is_visible\n";
            const rows = products.map(p => `${p.id},"${p.name}",${p.price},${p.cost || 0},"${p.unit || 'un'}","${p.barcode || ''}","${p.category}","${p.status || 'activo'}",${Number(p.reorder_level ?? 10)},${p.is_visible !== false}`).join("\n");
            const blob = new Blob([headers + rows], { type: 'text/csv;charset=utf-8;' });
            const link = document.createElement("a");
            link.href = URL.createObjectURL(blob);
            link.setAttribute("download", "productos_notas.csv");
            link.click();
        }
        onLog?.({ module: 'Inventario', action: 'Exportar', details: `Exportado en formato ${type.toUpperCase()}` });
    };

    const handleImport = (e, type) => {
        const file = e.target.files[0];
        if (!file) return;

        const fileReader = new FileReader();

        if (type === 'excel') {
            fileReader.readAsBinaryString(file);
            fileReader.onload = (evt) => {
                try {
                    const bstr = evt.target.result;
                    const wb = XLSX.read(bstr, { type: 'binary' });
                    const wsname = wb.SheetNames[0];
                    const ws = wb.Sheets[wsname];
                    const data = XLSX.utils.sheet_to_json(ws);
                    if (Array.isArray(data) && data.length > 0) {
                        const mapped = data.map((item, rowIndex) => {
                            // Find values by various possible header names (case insensitive)
                            const find = (keys) => {
                                const foundKey = Object.keys(item).find(k => keys.includes(k.toUpperCase().trim()));
                                return foundKey ? item[foundKey] : undefined;
                            };

                            return {
                                id: createProductId(),
                                name: find(['NOMBRE', 'PRODUCTO', 'NAME']) || 'Sin nombre',
                                price: Number(find(['PRECIO', 'VENTA', 'PRICE'])) || 0,
                                cost: Number(find(['COSTO', 'COST'])) || 0,
                                unit: find(['UNIDAD', 'UNIT', 'UNIDADES', 'MEDIDA']) || 'un',
                                barcode: normalizeBarcode(find(['BARCODE', 'CODIGO BARRAS', 'BARRAS', 'CODE'])),
                                category: find(['CATEGORIA', 'CATEGORY']) || 'General',
                                reorder_level: Number(find(['REORDER_LEVEL', 'MINIMO', 'ALERTA_MINIMA'])) || 10,
                                status: String(find(['STATUS', 'ESTADO']) || 'activo'),
                                is_visible: String(find(['IS_VISIBLE', 'VISIBLE_WEB', 'VISIBLE']) ?? 'true').toLowerCase() !== 'false'
                            };
                        });
                        setProducts(mapped);
                        onLog?.({ module: 'Inventario', action: 'Importar Excel', details: `Importados ${mapped.length} productos con mapeo inteligente` });
                        alert(`Axito: Se importaron ${mapped.length} productos.`);
                    }
                } catch (err) { alert("Error al leer Excel"); }
            };
        } else {
            fileReader.readAsText(file, "UTF-8");
            fileReader.onload = (event) => {
                try {
                    const content = event.target.result;
                    let imported = [];
                    if (type === 'json') {
                        imported = JSON.parse(content);
                    } else if (type === 'notes') {
                        const lines = content.split('\n').filter(l => l.trim().length > 0);
                        const [header, ...rows] = lines;
                        imported = rows.map((row, rowIndex) => {
                            const [id, name, price, cost, unit, barcode, category, status, reorderLevel, isVisible] = row.split(',').map(s => s.replace(/"/g, '').trim());
                            return {
                                id: createProductId(),
                                name,
                                price: Number(price) || 0,
                                cost: Number(cost) || 0,
                                unit: unit || 'un',
                                barcode: normalizeBarcode(barcode),
                                category: category || 'General',
                                reorder_level: Number(reorderLevel) || 10,
                                status: status || 'activo',
                                is_visible: String(isVisible || 'true').toLowerCase() !== 'false'
                            };
                        });
                    }

                    if (Array.isArray(imported)) {
                        setProducts(imported);
                        onLog?.({ module: 'Inventario', action: 'Importar', details: `Importados ${imported.length} productos (${type})` });
                        alert(`Axito: Se importaron ${imported.length} productos.`);
                    }
                } catch (err) { alert("Error: Archivo invAlido."); }
                finally { e.target.value = ''; }
            };
        }
    };

    // Physical Count Logic
    const handleStartCount = () => {
        const initialCounts = {};
        products.forEach(p => initialCounts[p.id] = (stock.ventas[p.id] || 0));
        setPhysicalCounts(initialCounts);
        setView('count');
    };

    const handleFinishCount = () => {
        onLog?.({ module: 'Inventario', action: 'Conteo Fisicoco', details: 'Realizado inventario de control' });
        window.print();
        setView('list');
    };

    const handleAcceptFromBodega = async (product) => {
        const quantity = Number(acceptQuantities[product.id] || 0);
        if (quantity <= 0 || Number.isNaN(quantity)) {
            return alert('Ingrese una cantidad valida');
        }

        const available = Number(stock?.bodega?.[product.id] || 0);
        if (available < quantity) {
            return alert('No hay suficiente stock en bodega');
        }

        try {
            if (typeof onAcceptFromBodega === 'function') {
                await onAcceptFromBodega(product.id, quantity);
            }
            onLog?.({
                module: 'Inventario',
                action: 'Aceptar desde Boveda',
                details: `${currentUser?.name || currentUser?.email || 'Cajero'} recibio ${quantity} unidades de ${product.name}`
            });
            setAcceptQuantities((prev) => ({ ...prev, [product.id]: 0 }));
        } catch (err) {
            const message = err?.message || 'Error desconocido';
            alert(`No se pudo aceptar inventario desde bodega.\n\nDetalle: ${message}`);
        }
    };

    return (
        <div className="inventory-module">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h2>Gestiòn de Inventario Pro</h2>
                <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                    {canExport && (
                    <div className="btn-group">
                        <button className="btn" onClick={() => handleExport('excel')}>{'\uD83D\uDCCA'} Excel</button>
                        <button className="btn" onClick={() => handleExport('json')}>{'\uD83D\uDCC4'} JSON</button>
                        <button className="btn" onClick={() => handleExport('notes')}>{'\uD83D\uDCDD'} Notas</button>
                    </div>
                    )}
                    {canImport && (
                    <div className="btn-group">
                        <label className="btn" style={{ cursor: 'pointer' }}>
                            {'\uD83D\uDCE5'} Imp. Excel <input type="file" hidden accept=".xlsx,.xls" onChange={(e) => handleImport(e, 'excel')} />
                        </label>
                        <label className="btn" style={{ cursor: 'pointer' }}>
                            {'\uD83D\uDCE5'} Imp. JSON <input type="file" hidden accept=".json" onChange={(e) => handleImport(e, 'json')} />
                        </label>
                    </div>
                    )}
                    {canCreate && <button className="btn btn-primary" onClick={() => { setEditingProduct(null); setView('edit'); }}>+ Nuevo Producto</button>}
                    {canCount && <button className="btn" style={{ backgroundColor: '#f59e0b', color: 'white' }} onClick={handleStartCount}>{'\uD83D\uDCDD'} Hacer Inventario</button>}
                    {isCajero && <div className="alert alert-warning" style={{ padding: '0.5rem', fontSize: '0.85em', margin: 0 }}>{'\uD83D\uDD12'} Modo Solo Lectura</div>}
                </div>
            </div>

            {view === 'edit' && (
                <div className="card">
                    <h3>{editingProduct ? 'Editar Producto' : 'Crear Nuevo Producto'}</h3>
                    <form onSubmit={handleSaveProduct}>
                        <div className="input-group">
                            <label className="input-label">Nombre</label>
                            <input name="name" defaultValue={editingProduct?.name} className="input-field" required />
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                            <div className="input-group">
                                <label className="input-label">Precio Venta</label>
                                <input name="price" type="number" defaultValue={editingProduct?.price} className="input-field" required />
                            </div>
                            <div className="input-group">
                                <label className="input-label">Costo Unitario</label>
                                <input name="cost" type="number" defaultValue={editingProduct?.cost} className="input-field" />
                            </div>
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                            <div className="input-group">
                                <label className="input-label">Unidad de Medida</label>
                                <input name="unit" defaultValue={editingProduct?.unit || 'un'} className="input-field" placeholder="Ej: un, kg, lt" />
                            </div>
                            <div className="input-group">
                                <label className="input-label">Categorias</label>
                                <select name="category" defaultValue={editingProduct?.category} className="input-field">
                                    {categories.map((cat, idx) => (
                                        <option key={`${cat}-${idx}`} value={cat}>{cat}</option>
                                    ))}
                                </select>
                            </div>
                        </div>
                        <div className="input-group">
                            <label className="input-label">Codigo de Barras</label>
                            <input name="barcode" defaultValue={editingProduct?.barcode} className="input-field" placeholder="Escanear o ingresar manual" />
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                            <div className="input-group">
                                <label className="input-label">Estado del Articulo</label>
                                <select name="status" defaultValue={editingProduct?.status || 'activo'} className="input-field">
                                    <option value="activo">Activo</option>
                                    <option value="pocos">Quedan pocos</option>
                                    <option value="agotado">Agotado</option>
                                </select>
                            </div>
                            <div className="input-group">
                                <label className="input-label">Minimo para alerta (Quedan pocos)</label>
                                <input
                                    name="reorder_level"
                                    type="number"
                                    min="0"
                                    defaultValue={Number(editingProduct?.reorder_level ?? 10)}
                                    className="input-field"
                                />
                            </div>
                        </div>
                        <div className="input-group" style={{ marginTop: '0.25rem' }}>
                            <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
                                <input
                                    name="is_visible"
                                    type="checkbox"
                                    defaultChecked={editingProduct?.is_visible !== false}
                                />
                                Visible en pagina/publicacion
                            </label>
                        </div>
                        <div style={{ display: 'flex', gap: '0.5rem' }}>
                            <button type="submit" className="btn btn-primary">Guardar</button>
                            <button type="button" className="btn" onClick={() => setView('list')}>Cancelar</button>
                        </div>
                    </form>
                </div>
            )}

            {view === 'count' && (
                <div className="card printable-area">
                    <h3>Hacer Inventario (Conteo Fisicoco)</h3>
                    <p>Ingrese las cantidades reales encontradas en el punto de venta.</p>
                    <table>
                        <thead>
                            <tr><th>Producto</th><th>Saldo Sistema</th><th>Conte Real</th><th>Diferencia</th></tr>
                        </thead>
                        <tbody>
                            {products.map((p, idx) => {
                                const sys = stock.ventas[p.id] || 0;
                                const real = physicalCounts[p.id] || 0;
                                return (
                                    <tr key={`${p.id}-${idx}`}>
                                        <td>{p.name}</td>
                                        <td>{sys}</td>
                                        <td>
                                            <input
                                                type="number" className="input-field" style={{ width: '80px' }}
                                                value={real} onChange={e => setPhysicalCounts({ ...physicalCounts, [p.id]: Number(e.target.value) })}
                                            />
                                        </td>
                                        <td style={{ color: (real - sys) === 0 ? 'green' : 'red' }}>{real - sys}</td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                    <div style={{ marginTop: '1rem', display: 'flex', gap: '0.5rem' }} className="no-print">
                        <button className="btn btn-primary" onClick={handleFinishCount}>Imprimir y Finalizar</button>
                        <button className="btn" onClick={() => setView('list')}>Cancelar</button>
                    </div>
                </div>
            )}

            {view === 'list' && (
                <div className="card">
                    <div style={{ marginBottom: '1rem' }}>
                        <input
                            type="text"
                            placeholder={'\uD83D\uDD0D Buscar por nombre o categoria...'}
                            className="input-field"
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                        />
                    </div>
                    <table>
                        <thead>
                            <tr>
                                <th>Nombre</th>
                                <th>Venta ($)</th>
                                <th>Bodega</th>
                                <th>Ventas</th>
                                <th>Estado</th>
                                <th>Web</th>
                                <th>Acciones</th>
                            </tr>
                        </thead>
                        <tbody>
                            {products.filter(p =>
                                p.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                                (p.category && p.category.toLowerCase().includes(searchTerm.toLowerCase()))
                            ).map((p, idx) => (
                                (() => {
                                    const stockVentas = Number(stock.ventas[p.id] || 0);
                                    const reorderLevel = Number(p.reorder_level ?? 10);
                                    const hasFewByStock = stockVentas > 0 && stockVentas <= reorderLevel;
                                    const isAgotado = String(p.status || '').toLowerCase() === 'agotado' || stockVentas <= 0;
                                    const isFew = String(p.status || '').toLowerCase() === 'pocos' || hasFewByStock;
                                    const isVisible = p.is_visible !== false;
                                    return (
                                <tr key={`${p.id}-${idx}`}>
                                    <td>{p.name}</td>
                                    <td>{(p.price || 0).toLocaleString()}</td>
                                    <td>{stock.bodega[p.id] || 0}</td>
                                    <td>{stock.ventas[p.id] || 0}</td>
                                    <td>
                                        {isAgotado ? (
                                            <span className="badge" style={{ backgroundColor: '#fee2e2', color: '#991b1b' }}>Agotado</span>
                                        ) : isFew ? (
                                            <span className="badge" style={{ backgroundColor: '#fef3c7', color: '#92400e' }}>Quedan pocos</span>
                                        ) : (
                                            <span className="badge" style={{ backgroundColor: '#dcfce7', color: '#166534' }}>Disponible</span>
                                        )}
                                    </td>
                                    <td>
                                        <span className="badge" style={{ backgroundColor: isVisible ? '#dbeafe' : '#e5e7eb', color: isVisible ? '#1d4ed8' : '#6b7280' }}>
                                            {isVisible ? 'Visible' : 'Oculto'}
                                        </span>
                                    </td>
                                    <td>
                                        {canEdit && <button className="btn" onClick={() => { setEditingProduct(p); setView('edit'); }} title="Editar">{'\u270F\uFE0F'}</button>}
                                        {!isCajero && <button className="btn" style={{ marginLeft: '5px' }} onClick={() => { setPreselectedProductId(p.id); setActiveTab('codigos'); }} title="Generar Etiqueta">{'\uD83C\uDFF7\uFE0F'}</button>}
                                        {canDelete && <button className="btn" style={{ marginLeft: '5px' }} onClick={() => handleDelete(p.id)} title="Eliminar">{'\uD83D\uDDD1\uFE0F'}</button>}
                                        {isCajero && !canEdit && !canDelete && (
                                            <div style={{ display: 'flex', gap: '0.35rem', alignItems: 'center', marginLeft: '5px' }}>
                                                <input
                                                    type="number"
                                                    min="0"
                                                    className="input-field"
                                                    style={{ width: '80px', padding: '0.25rem 0.35rem' }}
                                                    value={acceptQuantities[p.id] || ''}
                                                    onChange={(e) => setAcceptQuantities((prev) => ({ ...prev, [p.id]: e.target.value }))}
                                                    placeholder="Cant."
                                                />
                                                <button className="btn btn-primary" onClick={() => handleAcceptFromBodega(p)} title="Aceptar desde bodega">
                                                    Aceptar
                                                </button>
                                            </div>
                                        )}
                                    </td>
                                </tr>
                                    );
                                })()
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
}
