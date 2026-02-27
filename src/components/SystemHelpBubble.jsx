import { useMemo, useState } from 'react';
import { COMPANY_INFO } from '../constants';

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

const DOMAIN_KEYWORDS = [
  'sistema',
  'modulo',
  'facturacion',
  'factura',
  'inventario',
  'stock',
  'compras',
  'clientes',
  'cartera',
  'caja',
  'reportes',
  'bitacora',
  'notas',
  'historial',
  'cierres',
  'permisos',
  'permiso',
  'rol',
  'usuario',
  'jornada',
  'consulta rapida',
  'codigo',
  'barra',
  'supabase',
  'empresa',
  'casa smoke',
  'nit',
  'direccion',
  'telefono',
  'correo'
];

const normalizeText = (value) => String(value || '')
  .toLowerCase()
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '');

const buildGuideAnswer = (guide) => (
  `${guide.title}: ${guide.auth} Pasos clave: ${guide.steps.join(' ')}`
);

const isSystemScopedQuestion = (rawQuestion) => {
  const question = normalizeText(rawQuestion);
  if (!question || question.length < 3) return false;
  return DOMAIN_KEYWORDS.some((keyword) => question.includes(keyword));
};

const buildScopedAnswer = (rawQuestion) => {
  const question = normalizeText(rawQuestion);

  if (/^hola|buenas|buen dia|buenas tardes|buenas noches/.test(question)) {
    return 'Hola, con gusto te ayudo. Puedes preguntarme sobre modulos, procesos del sistema o datos de la empresa.';
  }

  if (!isSystemScopedQuestion(question)) {
    return 'Con gusto te ayudo, pero solo con temas del sistema y de la empresa. Si quieres, preguntame por facturacion, inventario, permisos, jornada o datos de CASA SMOKE.';
  }

  if (/empresa|casa smoke|nit|direccion|telefono|correo|email|contacto/.test(question)) {
    return `Datos de la empresa: ${COMPANY_INFO.name}. NIT: ${COMPANY_INFO.nit}. Direccion: ${COMPANY_INFO.address}. Telefono: ${COMPANY_INFO.phone}. Correo: ${COMPANY_INFO.email}.`;
  }

  if (/permiso|permisos|rol|acceso|autoriz/.test(question)) {
    return 'Si no puedes entrar a un modulo, revisa el rol del usuario y sus permisos en Configuracion/perfil. El sistema bloquea acciones sensibles para mantener trazabilidad.';
  }

  if (/jornada|abrir caja|cerrar jornada|cierre/.test(question)) {
    return 'Primero abre jornada para operar. Sin jornada abierta, varios modulos quedan restringidos. Al cerrar, valida base inicial, ventas del turno, gastos y diferencia.';
  }

  if (/no guarda|no guard|error|sincron|internet/.test(question)) {
    return 'Cuando no guarda cambios: valida internet estable, reintenta la accion y revisa Bitacora para confirmar el evento. Si persiste, reporta modulo, hora y accion exacta.';
  }

  if (/consulta rapida|escan|codigo|tab|barra/.test(question)) {
    return 'Consulta Rapida funciona para escanear codigos y confirmar precio/stock. Usa Enter para buscar. Si escribes en otros campos, el foco no debe saltar a Consulta Rapida.';
  }

  const guideByIntent = [
    { pattern: /factur|venta|pago|credito/, id: 'facturacion' },
    { pattern: /inventario|producto|stock|bodega/, id: 'inventario' },
    { pattern: /compras|proveedor|entrada/, id: 'compras' },
    { pattern: /cliente|documento|cupo/, id: 'clientes' },
    { pattern: /caja|ingreso|egreso|transferencia/, id: 'caja' },
    { pattern: /reporte|asesor|utilidad|auditoria/, id: 'reportes' }
  ];

  const matched = guideByIntent.find((rule) => rule.pattern.test(question));
  if (matched) {
    const guide = MODULE_GUIDES.find((item) => item.id === matched.id);
    if (guide) return buildGuideAnswer(guide);
  }

  return 'Puedo ayudarte con: Facturacion, Inventario, Compras, Clientes, Caja, Reportes, permisos, jornada y datos oficiales de la empresa.';
};

export function SystemHelpBubble() {
  const [isOpen, setIsOpen] = useState(false);
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [assistantQuery, setAssistantQuery] = useState('');
  const [isAsking, setIsAsking] = useState(false);
  const [chatMessages, setChatMessages] = useState([
    {
      id: 'welcome',
      role: 'assistant',
      text: 'Hola. Soy tu asistente de la empresa. Te ayudo con dudas del sistema y procesos internos.'
    }
  ]);

  const filteredGuides = useMemo(() => {
    const value = query.trim().toLowerCase();
    if (!value) return MODULE_GUIDES;

    return MODULE_GUIDES.filter((guide) => {
      const plain = `${guide.title} ${guide.auth} ${guide.steps.join(' ')}`.toLowerCase();
      return plain.includes(value);
    });
  }, [query]);

  const buildAssistantContext = () => [
    `Empresa: ${COMPANY_INFO.name}`,
    `NIT: ${COMPANY_INFO.nit}`,
    `Direccion: ${COMPANY_INFO.address}`,
    `Telefono: ${COMPANY_INFO.phone}`,
    `Correo: ${COMPANY_INFO.email}`,
    `Modulos soportados: ${MODULE_GUIDES.map((g) => g.title).join(', ')}`,
    `Atajos de ayuda: ${QUICK_HELP.join(' | ')}`,
  ].join('\n');

  const askAssistant = async (event) => {
    event.preventDefault();
    const userQuestion = assistantQuery.trim();
    if (!userQuestion || isAsking) return;

    const stamp = Date.now();
    setIsAsking(true);
    setChatMessages((prev) => ([
      ...prev,
      { id: `u-${stamp}`, role: 'user', text: userQuestion }
    ].slice(-10)));
    setAssistantQuery('');

    let assistantReply = buildScopedAnswer(userQuestion);
    const canUseElectronAI = Boolean(window?.companyAI?.ask);

    if (isSystemScopedQuestion(userQuestion) && canUseElectronAI) {
      try {
        const result = await window.companyAI.ask(userQuestion, buildAssistantContext());
        if (result?.ok && result?.answer) {
          assistantReply = String(result.answer);
        } else if (result?.answer) {
          assistantReply = String(result.answer);
        }
      } catch {
        assistantReply = `${assistantReply} (Respaldo local: no se pudo conectar con Electron.)`;
      }
    } else if (isSystemScopedQuestion(userQuestion)) {
      try {
        const response = await fetch('/api/company-ai', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            question: userQuestion,
            context: buildAssistantContext(),
          }),
        });
        if (response.ok) {
          const result = await response.json();
          if (result?.answer) assistantReply = String(result.answer);
        }
      } catch {
        assistantReply = `${assistantReply} (Respaldo local: no se pudo conectar con API web.)`;
      }
    }

    setChatMessages((prev) => ([
      ...prev,
      { id: `a-${stamp}`, role: 'assistant', text: assistantReply }
    ].slice(-10)));
    setIsAsking(false);
  };

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

          <div className="system-help-tools">
            <input
              className="system-help-search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Buscar modulo o tema..."
            />
            <button
              type="button"
              className="system-help-chat-open"
              onClick={() => setIsChatOpen(true)}
            >
              Chat GPT
            </button>
          </div>

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

      {isChatOpen && (
        <section className="system-help-chat-window" role="dialog" aria-label="Chat de la empresa">
          <div className="system-help-header">
            <strong>Chat de la Empresa</strong>
            <button
              type="button"
              className="system-help-close"
              onClick={() => setIsChatOpen(false)}
              aria-label="Cerrar chat"
            >
              x
            </button>
          </div>
          <p className="system-help-chat-hint">Consulta solo temas del sistema o de CASA SMOKE.</p>
          <div className="system-help-chat-log" aria-live="polite">
            {chatMessages.map((msg) => (
              <div key={msg.id} className={`system-help-chat-msg ${msg.role === 'user' ? 'user' : 'assistant'}`}>
                {msg.text}
              </div>
            ))}
          </div>
          <form className="system-help-chat-form" onSubmit={askAssistant}>
            <input
              className="system-help-chat-input"
              value={assistantQuery}
              onChange={(event) => setAssistantQuery(event.target.value)}
              placeholder="Escribe tu pregunta..."
              disabled={isAsking}
            />
            <button type="submit" className="system-help-chat-send" disabled={isAsking}>
              {isAsking ? 'Consultando...' : 'Enviar'}
            </button>
          </form>
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
