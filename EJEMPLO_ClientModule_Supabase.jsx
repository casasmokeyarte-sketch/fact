/**
 * EJEMPLO DE INTEGRACIÓN SUPABASE EN ClientModule
 * 
 * Este archivo muestra cómo adaptar ClientModule para usar Supabase
 * en lugar de almacenamiento local.
 * 
 * Para usar este código:
 * 1. Reemplaza el contenido actual de ClientModule.jsx con este
 * 2. Cambia los imports necesarios
 * 3. Actualiza las funciones que usan "setClients" 
 */

import React, { useState, useEffect } from 'react';
import * as XLSX from 'xlsx';
import { INITIAL_REGISTERED_CLIENT, CREDIT_LEVELS } from '../constants';
import { useSupabase } from '../lib/useSupabase';
import {
  getClients,
  createClient as createClientDB,
  updateClient as updateClientDB,
  deleteClient as deleteClientDB
} from '../lib/databaseService';

export function ClientModule({ clients, setClients, cartera, salesHistory, onLog }) {
  const { user, loading: userLoading } = useSupabase(); // Obtener usuario actual
  const [newClient, setNewClient] = useState(INITIAL_REGISTERED_CLIENT);
  const [isEditing, setIsEditing] = useState(false);
  const [selectedClientReport, setSelectedClientReport] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // **NUEVO: Cargar clientes desde Supabase cuando el usuario está autenticado**
  useEffect(() => {
    if (!user) return;

    const loadClients = async () => {
      setLoading(true);
      setError(null);
      try {
        const { data, error } = await getClients(user.id);
        if (error) {
          setError(error);
        } else {
          setClients(data || []);
        }
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    loadClients();
  }, [user]); // Se ejecuta cuando user cambia

  const handleLevelChange = (levelKey) => {
    const levelData = CREDIT_LEVELS[levelKey];
    setNewClient({
      ...newClient,
      credit_level: levelKey, // Cambiar a snake_case como en BD
      discount: levelData.discount,
      credit_limit: levelData.maxInvoice
    });
  };

  const handleSave = async (e) => {
    e.preventDefault();
    
    if (!newClient.name || !newClient.document) {
      return alert("Nombre y Documento son obligatorios");
    }

    setLoading(true);
    setError(null);

    try {
      if (isEditing) {
        // **Actualizar en Supabase**
        const { data, error } = await updateClientDB(newClient.id, {
          name: newClient.name,
          email: newClient.email,
          phone: newClient.phone,
          address: newClient.address,
          credit_level: newClient.credit_level,
          discount: newClient.discount,
          credit_limit: newClient.credit_limit,
          // ... otros campos
        });

        if (error) {
          setError(error);
          alert(`Error al actualizar: ${error}`);
        } else {
          // Actualizar in local state
          setClients(clients.map(c => c.id === newClient.id ? data : c));
          setIsEditing(false);
          onLog?.({
            module: 'Clientes',
            action: 'Editar Cliente',
            details: `Se editó a: ${newClient.name}`
          });
        }
      } else {
        // **Crear nuevo cliente en Supabase**
        const { data, error } = await createClientDB({
          user_id: user.id, // Importante: incluir el user_id
          name: newClient.name,
          document: newClient.document,
          email: newClient.email || null,
          phone: newClient.phone || null,
          address: newClient.address || null,
          credit_level: newClient.credit_level,
          discount: newClient.discount,
          credit_limit: newClient.credit_limit,
          active: true
        });

        if (error) {
          setError(error);
          alert(`Error al crear cliente: ${error}`);
        } else {
          // Agregar a local state
          setClients([...clients, data]);
          onLog?.({
            module: 'Clientes',
            action: 'Crear Cliente',
            details: `Se creó a: ${newClient.name}`
          });
        }
      }

      setNewClient(INITIAL_REGISTERED_CLIENT);
    } catch (err) {
      setError(err.message);
      alert(`Error: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (clientId) => {
    if (!window.confirm('¿Estás seguro de que deseas eliminar este cliente?')) return;

    setLoading(true);
    setError(null);

    try {
      // **Eliminar de Supabase**
      const { error } = await deleteClientDB(clientId);

      if (error) {
        setError(error);
        alert(`Error al eliminar: ${error}`);
      } else {
        // Eliminar del local state
        setClients(clients.filter(c => c.id !== clientId));
        onLog?.({
          module: 'Clientes',
          action: 'Eliminar Cliente',
          details: `Se eliminó un cliente`
        });
      }
    } catch (err) {
      setError(err.message);
      alert(`Error: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleEdit = (client) => {
    setNewClient(client);
    setIsEditing(true);
  };

  const exportClients = (type) => {
    if (type === 'json') {
      const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(clients));
      const downloadAnchorNode = document.createElement('a');
      downloadAnchorNode.setAttribute("href", dataStr);
      downloadAnchorNode.setAttribute("download", "clientes_export.json");
      document.body.appendChild(downloadAnchorNode);
      downloadAnchorNode.click();
      downloadAnchorNode.remove();
    } else if (type === 'excel') {
      const ws = XLSX.utils.json_to_sheet(clients);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Clientes");
      XLSX.writeFile(wb, "clientes_export.xlsx");
    }
  };

  // Mostrar mientras se carga el usuario
  if (userLoading) {
    return <div style={{ padding: '2rem', textAlign: 'center' }}>Cargando...</div>;
  }

  // Mostrar error si existe
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

  // ... Resto del JSX igual que el original, pero con handleDelete agregado
  
  return (
    <div>
      {/* Formulario de cliente */}
      <form onSubmit={handleSave} style={{ marginBottom: '2rem', padding: '1rem', border: '1px solid #ddd' }}>
        <h2>{isEditing ? 'Editar Cliente' : 'Nuevo Cliente'}</h2>
        
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
          <div>
            <label>Nombre *</label>
            <input
              type="text"
              value={newClient.name}
              onChange={(e) => setNewClient({ ...newClient, name: e.target.value })}
              placeholder="Nombre del cliente"
              required
            />
          </div>
          <div>
            <label>Documento *</label>
            <input
              type="text"
              value={newClient.document}
              onChange={(e) => setNewClient({ ...newClient, document: e.target.value })}
              placeholder="Cédula/NIT"
              required
              disabled={isEditing}
            />
          </div>
          <div>
            <label>Email</label>
            <input
              type="email"
              value={newClient.email || ''}
              onChange={(e) => setNewClient({ ...newClient, email: e.target.value })}
              placeholder="email@example.com"
            />
          </div>
          <div>
            <label>Teléfono</label>
            <input
              type="text"
              value={newClient.phone || ''}
              onChange={(e) => setNewClient({ ...newClient, phone: e.target.value })}
              placeholder="Teléfono"
            />
          </div>
          <div>
            <label>Nivel de Crédito</label>
            <select
              value={newClient.credit_level || 'ESTANDAR'}
              onChange={(e) => handleLevelChange(e.target.value)}
            >
              <option value="ESTANDAR">Estándar</option>
              <option value="PREMIUM">Premium</option>
            </select>
          </div>
        </div>

        <div style={{ display: 'flex', gap: '1rem' }}>
          <button type="submit" disabled={loading}>
            {loading ? 'Guardando...' : isEditing ? 'Actualizar' : 'Crear'}
          </button>
          {isEditing && (
            <button type="button" onClick={() => {
              setIsEditing(false);
              setNewClient(INITIAL_REGISTERED_CLIENT);
            }}>
              Cancelar
            </button>
          )}
        </div>
      </form>

      {/* Lista de clientes */}
      <div>
        <h2>Clientes Registrados ({clients.length})</h2>
        <div style={{ marginBottom: '1rem', display: 'flex', gap: '0.5rem' }}>
          <input
            type="text"
            placeholder="Buscar cliente..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
          <button onClick={() => exportClients('excel')}>Exportar Excel</button>
          <button onClick={() => exportClients('json')}>Exportar JSON</button>
        </div>

        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ backgroundColor: '#f5f5f5' }}>
              <th style={{ padding: '0.5rem', border: '1px solid #ddd' }}>Nombre</th>
              <th style={{ padding: '0.5rem', border: '1px solid #ddd' }}>Documento</th>
              <th style={{ padding: '0.5rem', border: '1px solid #ddd' }}>Email</th>
              <th style={{ padding: '0.5rem', border: '1px solid #ddd' }}>Nivel</th>
              <th style={{ padding: '0.5rem', border: '1px solid #ddd' }}>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {clients
              .filter(c => c.name.toLowerCase().includes(searchTerm.toLowerCase()))
              .map((client) => (
                <tr key={client.id}>
                  <td style={{ padding: '0.5rem', border: '1px solid #ddd' }}>{client.name}</td>
                  <td style={{ padding: '0.5rem', border: '1px solid #ddd' }}>{client.document}</td>
                  <td style={{ padding: '0.5rem', border: '1px solid #ddd' }}>{client.email}</td>
                  <td style={{ padding: '0.5rem', border: '1px solid #ddd' }}>{client.credit_level}</td>
                  <td style={{ padding: '0.5rem', border: '1px solid #ddd' }}>
                    <button onClick={() => handleEdit(client)} style={{ marginRight: '0.5rem' }}>
                      Editar
                    </button>
                    <button onClick={() => handleDelete(client.id)} style={{ color: 'red' }}>
                      Eliminar
                    </button>
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
