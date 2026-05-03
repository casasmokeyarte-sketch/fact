# DIAN Software Propio - MVP por fases

Este plan esta adaptado a FACT (React + Vite + Supabase + Electron).
Objetivo: salir a habilitacion DIAN con una base estable y luego pasar a produccion.

## Fase 0 - Registro DIAN (1 dia)

1. En DIAN seleccionar opcion Software propio.
2. Registrar el software y obtener identificadores del ambiente de habilitacion.
3. Definir certificado digital a usar (proveedor, vigencia, responsable).
4. Guardar datos en company settings por empresa.

Entregable:
- Credenciales y parametros de habilitacion listos para desarrollo.

## Fase 1 - Base de datos FE (1 dia)

Ejecutar en SQL Editor:
- docs/dian_software_propio_base.sql

Tablas creadas:
- public.fe_dian_settings: configuracion DIAN por empresa.
- public.fe_documents: cola y estado de documentos FE.
- public.fe_document_events: trazabilidad tecnica por documento.

Entregable:
- Estructura FE con RLS por company_id y estados auditables.

## Fase 2 - Motor XML UBL (3 a 5 dias)

Alcance minimo:
1. Convertir una factura local a XML UBL 2.1.
2. Implementar validaciones de campos obligatorios (emisor, receptor, impuestos, totales).
3. Guardar XML sin firma en fe_documents.xml_unsigned.

Recomendacion tecnica:
- Construir este modulo en backend (Edge Function o API server), no en cliente React.

Entregable:
- XML de factura valido en pruebas internas.

## Fase 3 - CUFE + firma digital (2 a 4 dias)

1. Implementar calculo CUFE segun anexo DIAN vigente.
2. Firmar XML con certificado digital (XAdES segun exigencia vigente).
3. Guardar XML firmado en fe_documents.xml_signed y CUFE en fe_documents.cufe.
4. Registrar evento signed en fe_document_events.

Entregable:
- Documento firmado con CUFE consistente y trazabilidad.

## Fase 4 - Envio y validacion DIAN (3 a 5 dias)

1. Integrar cliente DIAN para habilitacion.
2. Enviar XML firmado y registrar dian_track_id.
3. Consultar estado hasta validado o rechazado.
4. Guardar errores DIAN en last_error y eventos en fe_document_events.

Entregable:
- Flujo de extremo a extremo: pending -> sent -> validated/rejected.

## Fase 5 - Representacion grafica y QR (1 a 2 dias)

1. Construir payload QR a partir de datos DIAN.
2. Mostrar CUFE y QR en la representacion de la factura.
3. Bloquear cambios de documento cuando estado sea validated.

Entregable:
- Factura imprimible con datos legales FE.

## Fase 6 - Notas credito/debito (2 a 4 dias)

1. Extender generador XML para nota_credito y nota_debito.
2. Referenciar documento origen y motivo.
3. Reutilizar firma, envio y validacion.

Entregable:
- Notas funcionando dentro del mismo pipeline.

## Fase 7 - Habilitacion oficial y paso a produccion (1 a 3 dias)

1. Ejecutar set de pruebas exigido por DIAN.
2. Corregir rechazos hasta completar habilitacion.
3. Cambiar environment a produccion en fe_dian_settings.

Entregable:
- Habilitacion completada y operacion en produccion.

## Roadmap de implementacion recomendado

Semana 1:
1. Fase 0 y Fase 1.
2. Esqueleto de servicio backend FE.
3. Primer XML UBL de factura (sin firma).

Semana 2:
1. CUFE + firma digital.
2. Envio y polling de estado DIAN (habilitacion).
3. QR y visualizacion en factura.

Semana 3:
1. Notas credito/debito.
2. Casos de error, reintentos y monitoreo.
3. Pruebas de habilitacion y salida a produccion.

## Criterios de aceptacion MVP

1. Se puede emitir una factura y queda validada por DIAN.
2. Se conserva request/response por cada intento.
3. Se visualiza CUFE y QR en la factura.
4. Se puede emitir al menos una nota credito y una nota debito.
5. El sistema soporta rechazo DIAN sin perder trazabilidad.

## Riesgos a controlar

1. Certificado vencido o mal configurado.
2. Divergencia entre totales locales y totales XML.
3. Errores de conectividad con DIAN sin politica de reintentos.
4. Cambios de anexo DIAN sin versionado del motor.

## Proximo paso inmediato

1. Ejecutar docs/dian_software_propio_base.sql en Supabase.
2. Crear modulo backend FE (Edge Function o API) solo para:
   - generar XML UBL de factura,
   - calcular CUFE,
   - firmar,
   - enviar a habilitacion DIAN,
   - persistir estados en fe_documents.
