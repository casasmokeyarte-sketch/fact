import { useMemo, useState } from 'react';

const MODULE_GUIDES = [
  {
    id: 'facturacion',
    title: 'Facturacion',
    auth: 'Requiere jornada abierta y permisos de facturacion.',
    steps: [
      'Abre Facturacion desde Inicio.',
      'Busca cliente o deja Cliente Ocasional.',
      'Escanea codigo o escribe producto para agregarlo.',
      'Confirma forma de pago y pulsa Facturar.',
      'Si es credito, valida cupo y fecha de vencimiento.'
    ]
  },
  {
    id: 'inventario',
    title: 'Inventario',
    auth: 'Solo usuarios autorizados pueden crear, editar o mover stock.',
    steps: [
      'Entra a Inventario y usa Nuevo Producto para registrar.',
      'Valida que el codigo de barras no este repetido.',
      'Ajusta cantidades de Bodega y Ventas con cuidado.',
      'Guarda y espera confirmacion de sincronizacion.'
    ]
  },
  {
    id: 'compras',
    title: 'Compras',
    auth: 'Requiere permiso de Compras para registrar entradas.',
    steps: [
      'Abre Compras y registra proveedor, producto y costo.',
      'Confirma cantidades para que sumen a bodega.',
      'Guarda la compra y revisa que aparezca en reportes.'
    ]
  },
  {
    id: 'clientes',
    title: 'Clientes',
    auth: 'Documento y datos clave pueden requerir perfil con permiso.',
    steps: [
      'Abre Clientes y pulsa Nuevo Cliente.',
      'Completa nombre, documento y datos de contacto.',
      'Guarda y verifica en el listado que quedo persistido.'
    ]
  },
  {
    id: 'caja',
    title: 'Caja',
    auth: 'Depende de jornada abierta y permisos de caja.',
    steps: [
      'Registra ingresos y egresos de caja.',
      'Valida saldo actual antes de cerrar jornada.',
      'Usa cierres para dejar trazabilidad completa.'
    ]
  },
  {
    id: 'reportes',
    title: 'Reportes y Asesores',
    auth: 'Solo perfiles autorizados pueden ver totales globales.',
    steps: [
      'Entra a Reportes para ver ventas, compras y utilidades.',
      'Usa Asesores para revisar rendimiento por usuario.',
      'Filtra por fechas para auditorias y seguimiento diario.'
    ]
  }
];

const QUICK_HELP = [
  'Si no puedes entrar a un modulo: revisa permisos del usuario en Configuracion.',
  'Si no te deja guardar: confirma internet estable y vuelve a intentar.',
  'Si algo no aparece: recarga modulo y valida que la jornada siga abierta.',
  'Si persiste: revisa Bitacora y reporta hora exacta del error.'
];

export function SystemHelpBubble() {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState('');

  const filteredGuides = useMemo(() => {
    const value = query.trim().toLowerCase();
    if (!value) return MODULE_GUIDES;

    return MODULE_GUIDES.filter((guide) => {
      const plain = `${guide.title} ${guide.auth} ${guide.steps.join(' ')}`.toLowerCase();
      return plain.includes(value);
    });
  }, [query]);

  return (
    <div className="system-help-bubble">
      {isOpen && (
        <section className="system-help-panel" role="dialog" aria-label="Ayuda del sistema">
          <div className="system-help-header">
            <strong>Centro de Ayuda</strong>
            <button
              type="button"
              className="system-help-close"
              onClick={() => setIsOpen(false)}
              aria-label="Cerrar ayuda"
            >
              x
            </button>
          </div>

          <input
            className="system-help-search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Buscar modulo o tema..."
          />

          <div className="system-help-block">
            <h4>Cuando se requiere autorizacion</h4>
            <p>
              Se solicita autorizacion para proteger ventas, inventario, caja y cambios sensibles.
              Asi evitamos errores y mantenemos trazabilidad por usuario.
            </p>
          </div>

          <div className="system-help-block">
            <h4>Si no puedes avanzar</h4>
            <ul>
              {QUICK_HELP.map((tip) => (
                <li key={tip}>{tip}</li>
              ))}
            </ul>
          </div>

          <div className="system-help-guides">
            {filteredGuides.map((guide) => (
              <details key={guide.id} className="system-help-item">
                <summary>{guide.title}</summary>
                <p><strong>Permiso:</strong> {guide.auth}</p>
                <ol>
                  {guide.steps.map((step) => (
                    <li key={step}>{step}</li>
                  ))}
                </ol>
              </details>
            ))}
          </div>
        </section>
      )}

      <button
        type="button"
        className="system-help-trigger"
        onClick={() => setIsOpen((prev) => !prev)}
        aria-expanded={isOpen}
        aria-label="Abrir ayuda del sistema"
        title="Ayuda del sistema"
      >
        ?
      </button>
    </div>
  );
}
