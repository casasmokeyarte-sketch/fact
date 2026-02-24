/**
 * EJEMPLO DE INTEGRACIÓN SUPABASE EN InventoryModule
 * 
 * Este archivo muestra cómo adaptar InventoryModule para usar Supabase
 * en lugar de almacenamiento local.
 */

import React, { useState, useEffect } from 'react';
import { useSupabase } from '../lib/useSupabase';
import {
  getProducts,
  createProduct as createProductDB,
  updateProduct as updateProductDB
} from '../lib/databaseService';

export function InventoryModule({ products, setProducts, onLog }) {
  const { user, loading: userLoading } = useSupabase();
  const [newProduct, setNewProduct] = useState({
    code: '',
    name: '',
    category: 'General',
    price: 0,
    cost: 0,
    quantity: 0,
    reorder_level: 10,
    unit: 'unidad'
  });
  const [isEditing, setIsEditing] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterCategory, setFilterCategory] = useState('');

  // **Cargar productos desde Supabase**
  useEffect(() => {
    if (!user) return;

    const loadProducts = async () => {
      setLoading(true);
      setError(null);
      try {
        const { data, error } = await getProducts(user.id);
        if (error) {
          setError(error);
        } else {
          setProducts(data || []);
        }
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    loadProducts();
  }, [user]);

  const handleSave = async (e) => {
    e.preventDefault();

    if (!newProduct.name) {
      return alert("El nombre es obligatorio");
    }

    setLoading(true);
    setError(null);

    try {
      if (isEditing) {
        // **Actualizar producto en Supabase**
        const { data, error } = await updateProductDB(newProduct.id, {
          code: newProduct.code,
          name: newProduct.name,
          category: newProduct.category,
          price: parseFloat(newProduct.price),
          cost: parseFloat(newProduct.cost),
          quantity: parseInt(newProduct.quantity),
          reorder_level: parseInt(newProduct.reorder_level),
          unit: newProduct.unit
        });

        if (error) {
          setError(error);
          alert(`Error: ${error}`);
        } else {
          setProducts(products.map(p => p.id === newProduct.id ? data : p));
          setIsEditing(false);
          onLog?.({
            module: 'Inventario',
            action: 'Editar Producto',
            details: `Se editó: ${newProduct.name}`
          });
        }
      } else {
        // **Crear nuevo producto en Supabase**
        const { data, error } = await createProductDB({
          user_id: user.id,
          code: newProduct.code || `PROD-${Date.now()}`,
          name: newProduct.name,
          category: newProduct.category,
          price: parseFloat(newProduct.price),
          cost: parseFloat(newProduct.cost),
          quantity: parseInt(newProduct.quantity),
          reorder_level: parseInt(newProduct.reorder_level),
          unit: newProduct.unit,
          status: 'activo'
        });

        if (error) {
          setError(error);
          alert(`Error: ${error}`);
        } else {
          setProducts([...products, data]);
          onLog?.({
            module: 'Inventario',
            action: 'Crear Producto',
            details: `Se creó: ${newProduct.name}`
          });
        }
      }

      setNewProduct({
        code: '',
        name: '',
        category: 'General',
        price: 0,
        cost: 0,
        quantity: 0,
        reorder_level: 10,
        unit: 'unidad'
      });
    } catch (err) {
      setError(err.message);
      alert(`Error: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleEdit = (product) => {
    setNewProduct(product);
    setIsEditing(true);
  };

  const handleCancel = () => {
    setIsEditing(false);
    setNewProduct({
      code: '',
      name: '',
      category: 'General',
      price: 0,
      cost: 0,
      quantity: 0,
      reorder_level: 10,
      unit: 'unidad'
    });
  };

  if (userLoading) {
    return <div style={{ padding: '2rem', textAlign: 'center' }}>Cargando...</div>;
  }

  if (error) {
    return (
      <div style={{
        padding: '2rem',
        backgroundColor: '#fee',
        color: '#c33',
        borderRadius: '5px',
        marginBottom: '1rem'
      }}>
        Error: {error}
        <button onClick={() => setError(null)} style={{ marginLeft: '1rem' }}>
          Cerrar
        </button>
      </div>
    );
  }

  const filteredProducts = products.filter(p => {
    const matchesSearch = p.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      p.code?.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesCategory = !filterCategory || p.category === filterCategory;
    return matchesSearch && matchesCategory;
  });

  const categories = [...new Set(products.map(p => p.category))];
  const lowStock = products.filter(p => p.quantity <= p.reorder_level).length;
  const totalValue = products.reduce((sum, p) => sum + (p.price * p.quantity), 0);

  return (
    <div>
      {/* Estadísticas */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: '1fr 1fr 1fr',
        gap: '1rem',
        marginBottom: '2rem'
      }}>
        <div style={{ padding: '1rem', backgroundColor: '#e3f2fd', borderRadius: '5px' }}>
          <div style={{ fontSize: '0.9rem', color: '#666' }}>Total Productos</div>
          <div style={{ fontSize: '2rem', fontWeight: 'bold', color: '#1976d2' }}>{products.length}</div>
        </div>
        <div style={{ padding: '1rem', backgroundColor: '#fff3e0', borderRadius: '5px' }}>
          <div style={{ fontSize: '0.9rem', color: '#666' }}>Bajo Stock</div>
          <div style={{ fontSize: '2rem', fontWeight: 'bold', color: '#f57c00' }}>{lowStock}</div>
        </div>
        <div style={{ padding: '1rem', backgroundColor: '#e8f5e9', borderRadius: '5px' }}>
          <div style={{ fontSize: '0.9rem', color: '#666' }}>Valor Total</div>
          <div style={{ fontSize: '2rem', fontWeight: 'bold', color: '#388e3c' }}>
            ${totalValue.toLocaleString()}
          </div>
        </div>
      </div>

      {/* Formulario */}
      <form onSubmit={handleSave} style={{
        padding: '1.5rem',
        border: '1px solid #ddd',
        borderRadius: '5px',
        marginBottom: '2rem',
        backgroundColor: '#f9f9f9'
      }}>
        <h2>{isEditing ? 'Editar Producto' : 'Nuevo Producto'}</h2>

        <div style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr 1fr 1fr',
          gap: '1rem',
          marginBottom: '1rem'
        }}>
          <div>
            <label>Código</label>
            <input
              type="text"
              value={newProduct.code}
              onChange={(e) => setNewProduct({ ...newProduct, code: e.target.value })}
              placeholder="PROD-001"
            />
          </div>
          <div>
            <label>Nombre *</label>
            <input
              type="text"
              value={newProduct.name}
              onChange={(e) => setNewProduct({ ...newProduct, name: e.target.value })}
              placeholder="Nombre del producto"
              required
            />
          </div>
          <div>
            <label>Categoría</label>
            <select
              value={newProduct.category}
              onChange={(e) => setNewProduct({ ...newProduct, category: e.target.value })}
            >
              <option value="General">General</option>
              <option value="Alimentos">Alimentos</option>
              <option value="Bebidas">Bebidas</option>
              <option value="Limpieza">Limpieza</option>
              <option value="Otros">Otros</option>
            </select>
          </div>
          <div>
            <label>Unidad</label>
            <input
              type="text"
              value={newProduct.unit}
              onChange={(e) => setNewProduct({ ...newProduct, unit: e.target.value })}
              placeholder="unidad"
            />
          </div>
        </div>

        <div style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr 1fr 1fr',
          gap: '1rem',
          marginBottom: '1rem'
        }}>
          <div>
            <label>Precio Venta ($)</label>
            <input
              type="number"
              step="0.01"
              value={newProduct.price}
              onChange={(e) => setNewProduct({ ...newProduct, price: e.target.value })}
              placeholder="0.00"
            />
          </div>
          <div>
            <label>Costo ($)</label>
            <input
              type="number"
              step="0.01"
              value={newProduct.cost}
              onChange={(e) => setNewProduct({ ...newProduct, cost: e.target.value })}
              placeholder="0.00"
            />
          </div>
          <div>
            <label>Cantidad</label>
            <input
              type="number"
              value={newProduct.quantity}
              onChange={(e) => setNewProduct({ ...newProduct, quantity: e.target.value })}
              placeholder="0"
            />
          </div>
          <div>
            <label>Reorden en</label>
            <input
              type="number"
              value={newProduct.reorder_level}
              onChange={(e) => setNewProduct({ ...newProduct, reorder_level: e.target.value })}
              placeholder="10"
            />
          </div>
        </div>

        <div style={{ display: 'flex', gap: '1rem' }}>
          <button type="submit" disabled={loading} style={{ flex: 1 }}>
            {loading ? 'Guardando...' : isEditing ? 'Actualizar' : 'Crear Producto'}
          </button>
          {isEditing && (
            <button type="button" onClick={handleCancel} style={{ flex: 1 }}>
              Cancelar
            </button>
          )}
        </div>
      </form>

      {/* Búsqueda y filtros */}
      <div style={{ marginBottom: '1rem', display: 'flex', gap: '1rem' }}>
        <input
          type="text"
          placeholder="Buscar por nombre o código..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          style={{ flex: 1, padding: '0.5rem' }}
        />
        <select
          value={filterCategory}
          onChange={(e) => setFilterCategory(e.target.value)}
          style={{ padding: '0.5rem' }}
        >
          <option value="">Todas las categorías</option>
          {categories.map(cat => (
            <option key={cat} value={cat}>{cat}</option>
          ))}
        </select>
      </div>

      {/* Tabla de productos */}
      <div style={{ overflowX: 'auto' }}>
        <table style={{
          width: '100%',
          borderCollapse: 'collapse',
          fontSize: '0.9rem'
        }}>
          <thead>
            <tr style={{ backgroundColor: '#f5f5f5' }}>
              <th style={{ padding: '0.75rem', border: '1px solid #ddd', textAlign: 'left' }}>Código</th>
              <th style={{ padding: '0.75rem', border: '1px solid #ddd', textAlign: 'left' }}>Nombre</th>
              <th style={{ padding: '0.75rem', border: '1px solid #ddd', textAlign: 'left' }}>Categoría</th>
              <th style={{ padding: '0.75rem', border: '1px solid #ddd', textAlign: 'right' }}>Precio</th>
              <th style={{ padding: '0.75rem', border: '1px solid #ddd', textAlign: 'right' }}>Costo</th>
              <th style={{ padding: '0.75rem', border: '1px solid #ddd', textAlign: 'right' }}>Stock</th>
              <th style={{ padding: '0.75rem', border: '1px solid #ddd', textAlign: 'right' }}>Valor</th>
              <th style={{ padding: '0.75rem', border: '1px solid #ddd', textAlign: 'center' }}>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {filteredProducts.map((product) => {
              const valor = product.price * product.quantity;
              const lowStock = product.quantity <= product.reorder_level;
              return (
                <tr
                  key={product.id}
                  style={{
                    backgroundColor: lowStock ? '#fff9c4' : 'white',
                    borderBottom: '1px solid #ddd'
                  }}
                >
                  <td style={{ padding: '0.75rem', border: '1px solid #ddd' }}>{product.code}</td>
                  <td style={{ padding: '0.75rem', border: '1px solid #ddd' }}>
                    {product.name}
                    {lowStock && (
                      <div style={{ fontSize: '0.8rem', color: '#f57c00' }}>⚠️ Stock bajo</div>
                    )}
                  </td>
                  <td style={{ padding: '0.75rem', border: '1px solid #ddd' }}>{product.category}</td>
                  <td style={{ padding: '0.75rem', border: '1px solid #ddd', textAlign: 'right' }}>
                    ${parseFloat(product.price).toFixed(2)}
                  </td>
                  <td style={{ padding: '0.75rem', border: '1px solid #ddd', textAlign: 'right' }}>
                    ${parseFloat(product.cost || 0).toFixed(2)}
                  </td>
                  <td style={{ padding: '0.75rem', border: '1px solid #ddd', textAlign: 'right' }}>
                    {product.quantity}
                  </td>
                  <td style={{ padding: '0.75rem', border: '1px solid #ddd', textAlign: 'right' }}>
                    ${valor.toFixed(2)}
                  </td>
                  <td style={{ padding: '0.75rem', border: '1px solid #ddd', textAlign: 'center' }}>
                    <button
                      onClick={() => handleEdit(product)}
                      style={{
                        padding: '0.3rem 0.6rem',
                        marginRight: '0.3rem',
                        backgroundColor: '#1976d2',
                        color: 'white',
                        border: 'none',
                        borderRadius: '3px',
                        cursor: 'pointer'
                      }}
                    >
                      Editar
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {filteredProducts.length === 0 && (
        <div style={{
          padding: '2rem',
          textAlign: 'center',
          color: '#999'
        }}>
          No hay productos que coincidan con tu búsqueda
        </div>
      )}
    </div>
  );
}
