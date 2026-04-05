import React, { useMemo, useState, useEffect, useRef } from 'react';
import * as XLSX from 'xlsx';
import { PaginationControls } from './PaginationControls';
import { usePagination } from '../lib/usePagination';
import { useTableSort } from '../lib/useTableSort';
import { SortButton } from './SortButton';
import { printReportHtml } from '../lib/printReports';

export function InventoryModule({ currentUser, products, setProducts, onDeleteProduct, onAdjustStock, onApplyInventoryCount, stock, categories, onLog, setActiveTab, setPreselectedProductId, shift }) {
    const [view, setView] = useState('list'); // 'list', 'edit', 'count'
    const [editingProduct, setEditingProduct] = useState(null);
    const [physicalCounts, setPhysicalCounts] = useState({});
    const [countSessionRows, setCountSessionRows] = useState([]);
    const [countScanCode, setCountScanCode] = useState('');
    const [manualCountProductId, setManualCountProductId] = useState('');
    const [activeCountProductId, setActiveCountProductId] = useState('');
    const [activeCountValue, setActiveCountValue] = useState('');
    const [countSearchTerm, setCountSearchTerm] = useState('');
    const [countStage, setCountStage] = useState('capture');
    const [countReportPrinted, setCountReportPrinted] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');
    const [categoryFilter, setCategoryFilter] = useState('');
    const [statusFilter, setStatusFilter] = useState('');
    const [openActionMenuId, setOpenActionMenuId] = useState(null);
    const countScanInputRef = useRef(null);
    const countedQtyInputRef = useRef(null);
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
    const toProductExportRow = (product) => ({
        id: product?.id || '',
        codigo_barras: normalizeBarcode(product?.barcode),
        nombre: String(product?.name || ''),
        categoria: String(product?.category || 'General'),
        precio: Number(product?.price || 0),
        costo: Number(product?.cost || 0),
        unidad: String(product?.unit || 'un'),
        estado: String(product?.status || 'activo'),
        reorder_level: Number(product?.reorder_level ?? 10),
        is_visible: product?.is_visible !== false
    });

    const normalizeImportedProduct = (raw) => {
        const id = String(raw?.id || '').trim();
        const barcode = normalizeBarcode(raw?.barcode ?? raw?.codigo_barras);
        return {
            id: id || createProductId(),
            name: String(raw?.name ?? raw?.nombre ?? 'Sin nombre').trim() || 'Sin nombre',
            price: Number(raw?.price ?? raw?.precio ?? 0) || 0,
            cost: Number(raw?.cost ?? raw?.costo ?? 0) || 0,
            unit: String(raw?.unit ?? raw?.unidad ?? 'un').trim() || 'un',
            barcode,
            category: String(raw?.category ?? raw?.categoria ?? 'General').trim() || 'General',
            reorder_level: Number(raw?.reorder_level ?? raw?.minimo ?? 10) || 10,
            status: String(raw?.status ?? raw?.estado ?? 'activo').trim() || 'activo',
            is_visible: String(raw?.is_visible ?? raw?.visible ?? 'true').toLowerCase() !== 'false'
        };
    };

    const mergeImportedProducts = (currentProducts, importedRawRows) => {
        const normalizedRows = (importedRawRows || []).map(normalizeImportedProduct);
        const merged = [...(currentProducts || [])];
        const indexById = new Map();
        const indexByBarcode = new Map();

        merged.forEach((product, idx) => {
            const id = String(product?.id || '').trim();
            const barcode = normalizeBarcode(product?.barcode);
            if (id) indexById.set(id, idx);
            if (barcode) indexByBarcode.set(barcode, idx);
        });

        let updatedCount = 0;
        let insertedCount = 0;

        normalizedRows.forEach((incoming) => {
            const incomingId = String(incoming?.id || '').trim();
            const incomingBarcode = normalizeBarcode(incoming?.barcode);

            let existingIndex = -1;
            if (incomingId && indexById.has(incomingId)) {
                existingIndex = indexById.get(incomingId);
            } else if (incomingBarcode && indexByBarcode.has(incomingBarcode)) {
                existingIndex = indexByBarcode.get(incomingBarcode);
            }

            if (existingIndex >= 0) {
                const existing = merged[existingIndex];
                merged[existingIndex] = {
                    ...existing,
                    ...incoming,
                    id: existing.id || incoming.id
                };
                updatedCount += 1;
                return;
            }

            merged.push(incoming);
            const newIndex = merged.length - 1;
            if (incomingId) indexById.set(incomingId, newIndex);
            if (incomingBarcode) indexByBarcode.set(incomingBarcode, newIndex);
            insertedCount += 1;
        });

        return { merged, updatedCount, insertedCount };
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

    const filteredProducts = useMemo(() => (
        (products || []).filter((p) => {
            const matchesSearch =
                String(p?.name || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
                String(p?.category || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
                String(p?.barcode || '').toLowerCase().includes(searchTerm.toLowerCase());
            const matchesCategory = !categoryFilter || String(p?.category || '') === categoryFilter;
            const stockVentas = Number(stock?.ventas?.[p?.id] || 0);
            const reorderLevel = Number(p?.reorder_level ?? 10);
            const computedStatus = stockVentas <= 0 ? 'agotado' : (stockVentas <= reorderLevel ? 'pocos' : 'disponible');
            const matchesStatus = !statusFilter || computedStatus === statusFilter;
            return matchesSearch && matchesCategory && matchesStatus;
        })
    ), [products, searchTerm, categoryFilter, statusFilter, stock]);

    const { sortedRows: sortedProducts, sortConfig: productsSort, setSortKey: setProductsSortKey } = useTableSort(
        filteredProducts,
        {
            name: { getValue: (p) => p?.name || '', type: 'string' },
            price: { getValue: (p) => Number(p?.price || 0), type: 'number' },
            bodega: { getValue: (p) => Number(stock?.bodega?.[p?.id] || 0), type: 'number' },
            ventas: { getValue: (p) => Number(stock?.ventas?.[p?.id] || 0), type: 'number' },
            status: { getValue: (p) => String(p?.status || ''), type: 'string' },
            web: { getValue: (p) => (p?.is_visible === false ? 0 : 1), type: 'number' },
        },
        'name'
    );

    const productsPagination = usePagination(sortedProducts, 15);

    const { sortedRows: sortedCountProducts, sortConfig: countSort, setSortKey: setCountSortKey } = useTableSort(
        products,
        {
            name: { getValue: (p) => p?.name || '', type: 'string' },
            sys: { getValue: (p) => Number(stock?.ventas?.[p?.id] || 0), type: 'number' },
            real: { getValue: (p) => Number(physicalCounts?.[p?.id] || 0), type: 'number' },
            diff: { getValue: (p) => Number(physicalCounts?.[p?.id] || 0) - Number(stock?.ventas?.[p?.id] || 0), type: 'number' },
        },
        'name'
    );

    const productsByBarcode = useMemo(() => {
        const map = new Map();
        (products || []).forEach((product) => {
            const barcode = normalizeBarcode(product?.barcode);
            if (barcode) {
                map.set(barcode, product);
            }
        });
        return map;
    }, [products]);

    const manualCountOptions = useMemo(() => (
        [...(products || [])]
            .sort((a, b) => String(a?.name || '').localeCompare(String(b?.name || '')))
            .map((product) => ({
                id: String(product?.id || ''),
                name: product?.name || 'Producto',
                barcode: normalizeBarcode(product?.barcode),
                category: product?.category || 'General',
            }))
            .filter((product) => product.id)
    ), [products]);

    const countedProducts = useMemo(() => {
        const q = String(countSearchTerm || '').trim().toLowerCase();
        const rowsById = new Map((countSessionRows || []).map((row) => [String(row.productId), row]));
        return (countStage === 'capture' ? (countSessionRows || []).map((row) => ({
            product: (products || []).find((item) => String(item?.id || '') === String(row.productId || '')) || {
                id: row.productId,
                name: row.productName,
                barcode: row.barcode,
                category: ''
            },
            countRow: row,
        })) : sortedCountProducts
            .map((product) => ({
                product,
                countRow: rowsById.get(String(product?.id || '')) || null,
            })))
            .filter(({ product, countRow }) => {
                if (!q) return true;
                const haystack = [
                    product?.name || '',
                    product?.barcode || '',
                    product?.category || '',
                    countRow?.countedAt ? new Date(countRow.countedAt).toLocaleString() : ''
                ].join(' ').toLowerCase();
                return haystack.includes(q);
            });
    }, [sortedCountProducts, countSessionRows, countSearchTerm, countStage, products]);

    const countSummary = useMemo(() => {
        const rows = countedProducts.map(({ product, countRow }) => {
            const systemQty = Number(stock?.ventas?.[product?.id] || 0);
            const countedQty = countRow
                ? Number(countRow.countedQty ?? physicalCounts?.[product?.id] ?? 0)
                : Number(physicalCounts?.[product?.id] ?? 0);
            const diff = countedQty - systemQty;
            return {
                productId: product?.id,
                productName: product?.name || 'Producto',
                barcode: normalizeBarcode(product?.barcode),
                systemQty,
                countedQty,
                diff,
            };
        });

        return {
            rows,
            adjustedRows: rows.filter((row) => Number(row.diff || 0) !== 0),
            totals: {
                systemQty: rows.reduce((sum, row) => sum + Number(row.systemQty || 0), 0),
                countedQty: rows.reduce((sum, row) => sum + Number(row.countedQty || 0), 0),
                diff: rows.reduce((sum, row) => sum + Number(row.diff || 0), 0),
            }
        };
    }, [countedProducts, physicalCounts, stock]);

    useEffect(() => {
        const handleOutsideClick = (event) => {
            if (!openActionMenuId) return;
            const root = event.target?.closest?.('[data-inv-menu-root="1"]');
            if (!root) setOpenActionMenuId(null);
        };
        document.addEventListener('mousedown', handleOutsideClick);
        return () => document.removeEventListener('mousedown', handleOutsideClick);
    }, [openActionMenuId]);

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
            full_price_only: formData.get('full_price_only') === 'on',
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
        const exportRows = products.map(toProductExportRow);
        if (type === 'json') {
            const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(exportRows));
            const dlAnchor = document.createElement('a');
            dlAnchor.setAttribute("href", dataStr);
            dlAnchor.setAttribute("download", "productos.json");
            dlAnchor.click();
            dlAnchor.remove();
        } else if (type === 'excel') {
            const ws = XLSX.utils.json_to_sheet(exportRows);
            const wb = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(wb, ws, "Productos");
            XLSX.writeFile(wb, "productos.xlsx");
        } else if (type === 'notes') {
            const headers = "id,nombre,precio,costo,unidad,codigo_barras,categoria,estado,reorder_level,is_visible\n";
            const rows = exportRows.map(p => `${p.id},"${p.nombre}",${p.precio},${p.costo || 0},"${p.unidad || 'un'}","${p.codigo_barras || ''}","${p.categoria}","${p.estado || 'activo'}",${Number(p.reorder_level ?? 10)},${p.is_visible !== false}`).join("\n");
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
                                id: find(['ID']) || createProductId(),
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
                        const { merged, updatedCount, insertedCount } = mergeImportedProducts(products, mapped);
                        setProducts(merged);
                        onLog?.({
                            module: 'Inventario',
                            action: 'Importar Excel',
                            details: `Importacion acumulativa. Nuevos: ${insertedCount}, actualizados por ID/codigo: ${updatedCount}`
                        });
                        alert(`Importacion completada.\nNuevos: ${insertedCount}\nActualizados (ID/codigo): ${updatedCount}`);
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
                                id: id || createProductId(),
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
                        const { merged, updatedCount, insertedCount } = mergeImportedProducts(products, imported);
                        setProducts(merged);
                        onLog?.({
                            module: 'Inventario',
                            action: 'Importar',
                            details: `Importacion acumulativa (${type}). Nuevos: ${insertedCount}, actualizados por ID/codigo: ${updatedCount}`
                        });
                        alert(`Importacion completada.\nNuevos: ${insertedCount}\nActualizados (ID/codigo): ${updatedCount}`);
                    }
                } catch (err) { alert("Error: Archivo invAlido."); }
                finally { e.target.value = ''; }
            };
        }
    };

    // Physical Count Logic
    const handleStartCount = () => {
        setPhysicalCounts({});
        setCountSessionRows([]);
        setCountScanCode('');
        setManualCountProductId('');
        setActiveCountProductId('');
        setActiveCountValue('');
        setCountSearchTerm('');
        setCountStage('capture');
        setCountReportPrinted(false);
        setView('count');
    };

    useEffect(() => {
        if (view !== 'count') return;
        setTimeout(() => countScanInputRef.current?.focus(), 80);
    }, [view]);

    useEffect(() => {
        if (!activeCountProductId) return;
        setTimeout(() => countedQtyInputRef.current?.focus(), 50);
    }, [activeCountProductId]);

    const upsertCountSessionRow = (product, countedQty) => {
        const systemQty = Number(stock?.ventas?.[product?.id] || 0);
        const nextRow = {
            productId: product?.id,
            productName: product?.name || 'Producto',
            barcode: normalizeBarcode(product?.barcode),
            systemQty,
            countedQty: Number(countedQty || 0),
            diff: Number(countedQty || 0) - systemQty,
            countedAt: new Date().toISOString(),
        };

        setCountSessionRows((prev) => {
            const others = (prev || []).filter((row) => String(row.productId || '') !== String(product?.id || ''));
            return [nextRow, ...others];
        });
    };

    const activateCountProduct = (product) => {
        if (!product?.id) return;
        setActiveCountProductId(String(product.id));
        const previousCount = physicalCounts?.[product.id];
        setActiveCountValue(previousCount === undefined ? '' : String(Number(previousCount || 0)));
        setCountScanCode('');
        setManualCountProductId('');
    };

    const handleScanCountProduct = (rawCode) => {
        const barcode = normalizeBarcode(rawCode);
        if (!barcode) {
            alert('Escanee un codigo de barras valido.');
            return;
        }

        const product = productsByBarcode.get(barcode);
        if (!product) {
            alert(`No se encontro producto para el codigo ${barcode}.`);
            setCountScanCode('');
            return;
        }

        activateCountProduct(product);
    };

    const handleManualCountProductSelect = (productId) => {
        const normalizedProductId = String(productId || '').trim();
        setManualCountProductId(normalizedProductId);
        if (!normalizedProductId) {
            setActiveCountProductId('');
            setActiveCountValue('');
            return;
        }
        const product = (products || []).find((row) => String(row?.id || '') === normalizedProductId);
        if (!product) return;
        activateCountProduct(product);
    };

    const handleSaveCountForActiveProduct = () => {
        const product = (products || []).find((row) => String(row?.id || '') === String(activeCountProductId || ''));
        if (!product) return;
        const countedQty = Math.max(0, Number(activeCountValue || 0));
        setPhysicalCounts((prev) => ({ ...prev, [product.id]: countedQty }));
        upsertCountSessionRow(product, countedQty);
        onLog?.({
            module: 'Inventario',
            action: 'Conteo Producto',
            details: `Conteo por escaner: ${product?.name || product?.id} | Contado ${countedQty}`
        });
        setActiveCountProductId('');
        setActiveCountValue('');
        setCountReportPrinted(false);
        setTimeout(() => countScanInputRef.current?.focus(), 50);
    };

    const buildInventoryPhysicalCountReportHtml = (rows) => `
        <div style="margin-bottom:12px;">
            <strong>Usuario:</strong> ${String(currentUser?.name || 'Sistema')}<br/>
            <strong>Fecha:</strong> ${new Date().toLocaleString()}<br/>
            <strong>Total productos:</strong> ${Number(rows.length || 0).toLocaleString()}
        </div>
        <table>
            <thead>
                <tr>
                    <th>Producto</th>
                    <th>Codigo</th>
                    <th>Contado</th>
                </tr>
            </thead>
            <tbody>
                ${rows.map((row) => `
                    <tr>
                        <td>${String(row.productName || 'Producto')}</td>
                        <td>${String(row.barcode || 'N/A')}</td>
                        <td>${Number(row.countedQty || 0).toLocaleString()}</td>
                    </tr>
                `).join('')}
            </tbody>
        </table>
    `;

    const buildInventoryReconciliationReportHtml = (rows) => `
        <div style="margin-bottom:12px;">
            <strong>Usuario:</strong> ${String(currentUser?.name || 'Sistema')}<br/>
            <strong>Fecha:</strong> ${new Date().toLocaleString()}<br/>
            <strong>Total productos:</strong> ${Number(rows.length || 0).toLocaleString()}
        </div>
        <table>
            <thead>
                <tr>
                    <th>Producto</th>
                    <th>Codigo</th>
                    <th>Sistema</th>
                    <th>Contado</th>
                    <th>Diferencia</th>
                </tr>
            </thead>
            <tbody>
                ${rows.map((row) => `
                    <tr>
                        <td>${String(row.productName || 'Producto')}</td>
                        <td>${String(row.barcode || 'N/A')}</td>
                        <td>${Number(row.systemQty || 0).toLocaleString()}</td>
                        <td>${Number(row.countedQty || 0).toLocaleString()}</td>
                        <td>${Number(row.diff || 0).toLocaleString()}</td>
                    </tr>
                `).join('')}
            </tbody>
        </table>
    `;

    const handlePrintPhysicalCountReport = () => {
        const rows = (countSessionRows || []).map((row) => ({
            productName: row.productName,
            barcode: row.barcode,
            countedQty: row.countedQty
        }));
        if (rows.length === 0) {
            return alert('No hay productos para imprimir en el conteo.');
        }
        printReportHtml({
            title: 'Reporte de Conteo Fisico',
            subtitle: `Usuario: ${currentUser?.name || 'Sistema'}`,
            contentHtml: buildInventoryPhysicalCountReportHtml(rows),
            mode: 'a4'
        });
        setCountReportPrinted(true);
        onLog?.({
            module: 'Inventario',
            action: 'Imprimir Conteo',
            details: `Conteo de inventario impreso. Productos: ${rows.length}. Diferencias: ${countSummary.adjustedRows.length}.`
        });
    };

    const handleOpenReconciliation = () => {
        if ((countSessionRows || []).length === 0) {
            return alert('Primero registre al menos un conteo fisico.');
        }
        setCountStage('reconcile');
        setCountSearchTerm('');
    };

    const handlePrintReconciliationReport = () => {
        const rows = countSummary.rows;
        if (rows.length === 0) return alert('No hay productos para imprimir.');
        printReportHtml({
            title: 'Reporte de Conciliacion de Inventario',
            subtitle: `Usuario: ${currentUser?.name || 'Sistema'}`,
            contentHtml: buildInventoryReconciliationReportHtml(rows),
            mode: 'a4'
        });
        setCountReportPrinted(true);
    };

    const handleApplyCountAdjustments = async () => {
        const rowsToAdjust = countSummary.adjustedRows;
        if (rowsToAdjust.length === 0) {
            return alert('No hay diferencias para ajustar.');
        }

        const reason = String(prompt('Motivo obligatorio del ajuste masivo de inventario:') || '').trim();
        if (reason.length < 10) {
            return alert('Debe ingresar un motivo claro (minimo 10 caracteres).');
        }

        try {
            if (typeof onApplyInventoryCount === 'function') {
                await onApplyInventoryCount(rowsToAdjust, reason);
            } else {
                for (const row of rowsToAdjust) {
                    const product = (products || []).find((item) => String(item?.id || '') === String(row.productId || ''));
                    if (!product) continue;
                    await onAdjustStock?.(product, 'ventas', Number(row.diff || 0), reason);
                }
            }

            printReportHtml({
                title: 'Reporte de Ajuste de Inventario',
                subtitle: `Usuario: ${currentUser?.name || 'Sistema'}`,
                contentHtml: buildInventoryReconciliationReportHtml(rowsToAdjust),
                mode: 'a4'
            });

            onLog?.({
                module: 'Inventario',
                action: 'Ajuste Inventario Conteo',
                details: `Ajuste masivo desde conteo. Productos ajustados: ${rowsToAdjust.length}. Motivo: ${reason}`
            });

            alert(`Ajuste aplicado en ${rowsToAdjust.length} producto(s).`);
            setView('list');
        } catch (err) {
            alert(`No se pudo aplicar el ajuste masivo.\n\nDetalle: ${err?.message || 'Error desconocido'}`);
        }
    };

    const handleAdjustStock = async (product) => {
        if (!canEdit) return alert('No tiene permisos para ajustar stock.');
        const target = String(prompt('Ajustar en cual inventario? Escriba "bodega" o "ventas"') || '').trim().toLowerCase();
        if (!['bodega', 'ventas'].includes(target)) return alert('Debe escribir "bodega" o "ventas".');

        const delta = Number(prompt('Cantidad a ajustar. Use positivo para sumar y negativo para restar (ej: -2, 5):') || 0);
        if (!Number.isFinite(delta) || delta === 0) return alert('El ajuste debe ser diferente de 0.');

        const reason = String(prompt('Motivo obligatorio del ajuste de stock:') || '').trim();
        if (reason.length < 10) return alert('Debe ingresar un motivo claro (minimo 10 caracteres).');

        try {
            if (typeof onAdjustStock === 'function') {
                await onAdjustStock(product, target, delta, reason);
            }
        } catch (err) {
            const message = err?.message || 'Error desconocido';
            alert(`No se pudo aplicar el ajuste.\n\nDetalle: ${message}`);
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

            {isCajero && (
                <div className="card" style={{ marginBottom: '1rem', backgroundColor: 'var(--surface-muted)', border: '1px solid var(--border-soft)' }}>
                    <strong>Inventario por turno</strong>
                    <p style={{ margin: '0.45rem 0 0', color: 'var(--text-secondary)' }}>
                        La entrega y devolucion de inventario ya no se solicita desde este modulo.
                        Ahora se registra al abrir y cerrar la jornada con validacion del supervisor.
                        {shift?.startTime ? ' Su turno actual ya tiene control de inventario activo.' : ' Inicie jornada para recibir inventario del turno.'}
                    </p>
                </div>
            )}

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
                        <div className="input-group" style={{ marginTop: '0.25rem' }}>
                            <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
                                <input
                                    name="full_price_only"
                                    type="checkbox"
                                    defaultChecked={editingProduct?.full_price_only === true}
                                />
                                Precio Full / Sin Descuento
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
	                <div className="card">
	                    <h3>Hacer Inventario por Escaner o Busqueda Manual</h3>
	                    <p>
                            {countStage === 'capture'
                                ? 'Paso 1: registre solo el conteo fisico. Aun no se muestra ni se cruza con el sistema.'
                                : 'Paso 2: revise la conciliacion contra sistema antes de aplicar ajustes.'}
                        </p>

                        <div className="card card--muted" style={{ marginBottom: '1rem' }}>
                            <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1.2fr 1fr', gap: '1rem' }}>
                                <div className="input-group" style={{ marginBottom: 0 }}>
                                    <label className="input-label">Escanear codigo de barras</label>
                                    <input
                                        ref={countScanInputRef}
                                        type="text"
                                        className="input-field"
                                        value={countScanCode}
                                        onChange={(e) => setCountScanCode(e.target.value)}
                                        onKeyDown={(e) => {
                                            if (e.key === 'Enter') {
                                                e.preventDefault();
                                                handleScanCountProduct(countScanCode);
                                            }
                                        }}
                                        placeholder="Escanee y presione Enter"
                                    />
                                </div>
                                <div className="input-group" style={{ marginBottom: 0 }}>
                                    <label className="input-label">Buscar producto manualmente</label>
                                    <select
                                        className="input-field"
                                        value={manualCountProductId}
                                        onChange={(e) => handleManualCountProductSelect(e.target.value)}
                                    >
                                        <option value="">Seleccione un producto...</option>
                                        {manualCountOptions.map((product) => (
                                            <option key={product.id} value={product.id}>
                                                {product.name}{product.barcode ? ` | ${product.barcode}` : ''}{product.category ? ` | ${product.category}` : ''}
                                            </option>
                                        ))}
                                    </select>
                                </div>
                                <div className="input-group" style={{ marginBottom: 0 }}>
                                    <label className="input-label">Filtrar lista del conteo</label>
                                    <input
                                        type="text"
                                        className="input-field"
                                        value={countSearchTerm}
                                        onChange={(e) => setCountSearchTerm(e.target.value)}
                                        placeholder="Nombre o codigo"
                                    />
                                </div>
                            </div>

                            {countStage === 'capture' && activeCountProductId && (
                                (() => {
                                    const product = (products || []).find((row) => String(row?.id || '') === String(activeCountProductId || ''));
                                    if (!product) return null;
                                    return (
                                        <div className="card" style={{ marginTop: '0.75rem' }}>
                                            <div style={{ display: 'grid', gridTemplateColumns: '1.6fr 1fr 1fr', gap: '0.75rem', alignItems: 'end' }}>
                                                <div>
                                                    <div style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>Producto</div>
                                                    <strong>{product?.name || 'Producto'}</strong>
                                                    <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginTop: '0.2rem' }}>
                                                        Codigo: {product?.barcode || 'N/A'} | Categoria: {product?.category || 'General'}
                                                    </div>
                                                </div>
                                                <div className="input-group" style={{ marginBottom: 0 }}>
                                                    <label className="input-label">Cantidad contada</label>
                                                    <input
                                                        ref={countedQtyInputRef}
                                                        type="number"
                                                        className="input-field"
                                                        min="0"
                                                        value={activeCountValue}
                                                        onChange={(e) => setActiveCountValue(e.target.value)}
                                                        onKeyDown={(e) => {
                                                            if (e.key === 'Enter') {
                                                                e.preventDefault();
                                                                handleSaveCountForActiveProduct();
                                                            }
                                                        }}
                                                    />
                                                </div>
                                                <div style={{ display: 'flex', gap: '0.5rem' }}>
                                                    <button className="btn btn-primary" onClick={handleSaveCountForActiveProduct}>Guardar conteo</button>
                                                    <button className="btn" onClick={() => {
                                                        setActiveCountProductId('');
                                                        setActiveCountValue('');
                                                        countScanInputRef.current?.focus();
                                                    }}>Cancelar</button>
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })()
                            )}
                        </div>

                        {countStage === 'capture' ? (
                            <table>
                                <thead>
                                    <tr>
                                        <th><SortButton label="Producto" sortKey="name" sortConfig={countSort} onChange={setCountSortKey} /></th>
                                        <th>Codigo</th>
                                        <th><SortButton label="Conteo Real" sortKey="real" sortConfig={countSort} onChange={setCountSortKey} /></th>
                                        <th>Ultimo conteo</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {countedProducts.length === 0 ? (
                                        <tr><td colSpan="4" style={{ textAlign: 'center', padding: '1rem' }}>Aun no hay productos contados.</td></tr>
                                    ) : countedProducts.map(({ product, countRow }, idx) => (
                                        <tr key={`${product.id}-${idx}`}>
                                            <td>{product.name}</td>
                                            <td>{product.barcode || 'N/A'}</td>
                                            <td>{Number(countRow?.countedQty || 0).toLocaleString()}</td>
                                            <td>{countRow?.countedAt ? new Date(countRow.countedAt).toLocaleString() : 'Sin contar'}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        ) : (
                            <table>
                                <thead>
                                    <tr>
                                        <th><SortButton label="Producto" sortKey="name" sortConfig={countSort} onChange={setCountSortKey} /></th>
                                        <th>Codigo</th>
                                        <th><SortButton label="Saldo Sistema" sortKey="sys" sortConfig={countSort} onChange={setCountSortKey} /></th>
                                        <th><SortButton label="Conteo Real" sortKey="real" sortConfig={countSort} onChange={setCountSortKey} /></th>
                                        <th><SortButton label="Diferencia" sortKey="diff" sortConfig={countSort} onChange={setCountSortKey} /></th>
                                        <th>Ultimo conteo</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {countedProducts.map(({ product, countRow }, idx) => {
                                        const sys = Number(stock?.ventas?.[product.id] || 0);
                                        const real = Number(physicalCounts?.[product.id] ?? 0);
                                        const diff = real - sys;
                                        return (
                                            <tr key={`${product.id}-${idx}`}>
                                                <td>{product.name}</td>
                                                <td>{product.barcode || 'N/A'}</td>
                                                <td>{sys}</td>
                                                <td>{real}</td>
                                                <td style={{ color: diff === 0 ? 'green' : 'red', fontWeight: 700 }}>{diff}</td>
                                                <td>{countRow?.countedAt ? new Date(countRow.countedAt).toLocaleString() : 'Sin contar'}</td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        )}

                    <div className="card card--muted" style={{ marginTop: '1rem' }}>
                        <strong>Resumen</strong>
                        <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', marginTop: '0.5rem' }}>
                            <span>Productos: {Number((countStage === 'capture' ? countSessionRows.length : countSummary.rows.length) || 0).toLocaleString()}</span>
                            {countStage === 'reconcile' && <span>Sistema: {Number(countSummary.totals.systemQty || 0).toLocaleString()}</span>}
                            <span>Contado: {Number(countSummary.totals.countedQty || 0).toLocaleString()}</span>
                            {countStage === 'reconcile' && <span>Diferencia total: {Number(countSummary.totals.diff || 0).toLocaleString()}</span>}
                            {countStage === 'reconcile' && <span>Con ajuste: {Number(countSummary.adjustedRows.length || 0).toLocaleString()}</span>}
                        </div>
                    </div>

                    <div style={{ marginTop: '1rem', display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }} className="no-print">
                        {countStage === 'capture' ? (
                            <>
                                <button className="btn btn-primary" onClick={handlePrintPhysicalCountReport}>Imprimir reporte de conteo fisico</button>
                                <button className="btn" onClick={handleOpenReconciliation}>Continuar a conciliacion</button>
                            </>
                        ) : (
                            <>
                                <button className="btn btn-primary" onClick={handlePrintReconciliationReport}>Imprimir reporte de conciliacion</button>
                                <button className="btn" onClick={handleApplyCountAdjustments}>
                                    Ajustar inventario e imprimir reporte
                                </button>
                                {!countReportPrinted && (
                                    <div className="alert alert-info" style={{ margin: 0, padding: '0.5rem 0.75rem' }}>
                                        Recomendado: imprima primero la conciliacion y luego aplique el ajuste.
                                    </div>
                                )}
                                <button className="btn" onClick={() => setCountStage('capture')}>Volver al conteo</button>
                            </>
                        )}
                        <button className="btn" onClick={() => setView('list')}>Cancelar</button>
                    </div>
                </div>
            )}

            {view === 'list' && (
                <div className="card">
                    <div style={{ marginBottom: '1rem', display: 'grid', gridTemplateColumns: 'minmax(220px, 1.6fr) repeat(2, minmax(160px, 1fr))', gap: '0.75rem' }}>
                        <input
                            type="text"
                            placeholder={'\uD83D\uDD0D Buscar por nombre o categoria...'}
                            className="input-field"
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                        />
                        <select className="input-field" value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)}>
                            <option value="">Todas las categorias</option>
                            {(categories || []).map((cat, idx) => (
                                <option key={`${cat}-${idx}`} value={cat}>{cat}</option>
                            ))}
                        </select>
                        <select className="input-field" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
                            <option value="">Todos los estados</option>
                            <option value="disponible">Disponible</option>
                            <option value="pocos">Quedan pocos</option>
                            <option value="agotado">Agotado</option>
                        </select>
                    </div>
	                    <table>
	                        <thead>
	                            <tr>
	                                <th><SortButton label="Nombre" sortKey="name" sortConfig={productsSort} onChange={setProductsSortKey} /></th>
	                                <th><SortButton label="Venta ($)" sortKey="price" sortConfig={productsSort} onChange={setProductsSortKey} /></th>
	                                <th><SortButton label="Bodega" sortKey="bodega" sortConfig={productsSort} onChange={setProductsSortKey} /></th>
	                                <th><SortButton label="Ventas" sortKey="ventas" sortConfig={productsSort} onChange={setProductsSortKey} /></th>
	                                <th><SortButton label="Estado" sortKey="status" sortConfig={productsSort} onChange={setProductsSortKey} /></th>
	                                <th><SortButton label="Web" sortKey="web" sortConfig={productsSort} onChange={setProductsSortKey} /></th>
	                                <th>Acciones</th>
	                            </tr>
	                        </thead>
                        <tbody>
                            {productsPagination.pageItems.map((p, idx) => (
                                (() => {
                                    const stockVentas = Number(stock.ventas[p.id] || 0);
                                    const reorderLevel = Number(p.reorder_level ?? 10);
                                    const hasFewByStock = stockVentas > 0 && stockVentas <= reorderLevel;
                                    const isAgotado = String(p.status || '').toLowerCase() === 'agotado' || stockVentas <= 0;
                                    const isFew = String(p.status || '').toLowerCase() === 'pocos' || hasFewByStock;
                                    const isVisible = p.is_visible !== false;
                                    return (
                                <tr key={`${p.id}-${productsPagination.startItem}-${idx}`}>
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
                                        {!isCajero && (
                                            <div data-inv-menu-root="1" style={{ position: 'relative', display: 'inline-block' }}>
                                                <button
                                                    className="btn"
                                                    onClick={() => setOpenActionMenuId((prev) => (prev === p.id ? null : p.id))}
                                                    title="Opciones del producto"
                                                >
                                                    {'\u22EE'}
                                                </button>
                                                {openActionMenuId === p.id && (
                                                    <div className="card" style={{ position: 'absolute', right: 0, top: '105%', minWidth: '210px', zIndex: 20, padding: '0.4rem' }}>
                                                        <button
                                                            className="btn"
                                                            style={{ width: '100%', marginBottom: '0.3rem' }}
                                                            onClick={() => {
                                                                setPreselectedProductId(p.id);
                                                                setActiveTab('historial');
                                                                setOpenActionMenuId(null);
                                                            }}
                                                        >
                                                            Ver historial/movimientos
                                                        </button>
                                                        {canEdit && (
                                                            <button
                                                                className="btn"
                                                                style={{ width: '100%', marginBottom: '0.3rem' }}
                                                                onClick={() => {
                                                                    setEditingProduct(p);
                                                                    setView('edit');
                                                                    setOpenActionMenuId(null);
                                                                }}
                                                            >
                                                                Editar producto
                                                            </button>
                                                        )}
                                                        {canEdit && (
                                                            <button
                                                                className="btn"
                                                                style={{ width: '100%', marginBottom: '0.3rem' }}
                                                                onClick={() => {
                                                                    handleAdjustStock(p);
                                                                    setOpenActionMenuId(null);
                                                                }}
                                                            >
                                                                Ajustar stock
                                                            </button>
                                                        )}
                                                        <button
                                                            className="btn"
                                                            style={{ width: '100%', marginBottom: canDelete ? '0.3rem' : 0 }}
                                                            onClick={() => {
                                                                setPreselectedProductId(p.id);
                                                                setActiveTab('codigos');
                                                                setOpenActionMenuId(null);
                                                            }}
                                                        >
                                                            Generar etiqueta
                                                        </button>
                                                        {canDelete && (
                                                            <button
                                                                className="btn"
                                                                style={{ width: '100%', color: '#e11d48', borderColor: '#e11d48' }}
                                                                onClick={() => {
                                                                    handleDelete(p.id);
                                                                    setOpenActionMenuId(null);
                                                                }}
                                                            >
                                                                Eliminar
                                                            </button>
                                                        )}
                                                    </div>
                                                )}
                                            </div>
                                        )}
                                    </td>
                                </tr>
                                    );
                                })()
                            ))}
                        </tbody>
                    </table>
                    <PaginationControls
                        page={productsPagination.page}
                        totalPages={productsPagination.totalPages}
                        totalItems={productsPagination.totalItems}
                        pageSize={productsPagination.pageSize}
                        onPageChange={productsPagination.setPage}
                    />
                </div>
            )}
        </div>
    );
}
