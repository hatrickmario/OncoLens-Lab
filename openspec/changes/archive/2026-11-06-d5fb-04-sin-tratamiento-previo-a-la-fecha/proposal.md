# Proposal — d5fb-04-sin-tratamiento-previo-a-la-fecha

## Trazabilidad

Origen: feedback de la Demo 5 (2026-11-05), sin L1D asignado (crear historia en Linear solo con aprobación del
usuario). Relacionado, sin cambiarlos: L1D-80 / US-094 (`DialogoTratamientoPrevio`, `POST …/prior-treatments`,
`POST …/clinical-attributes`), L1D-96 / US-004 (columna «Datos críticos»), US-002 (`CompletenessService`), FR-23
(checklist), FR-08 (registro manual) · RN-08 (un dato nuevo no reemplaza en silencio a uno verificado) · RN-10 / RN-11
(desidentificación) · RN-26 (los avisos clínicos no bloquean) · RN-27 · RN-29 (todo ítem del catálogo tiene un campo
de destino en el modelo) · RN-23 (textos nuevos) · ADR-26 (cambio aditivo del contrato) · ADR-34 (verbalización
determinista de datos del paciente) · AC-04.1 (faltantes).

## Por qué

En la Demo 5 el usuario observó: «Para el registro de Tratamientos previos no existe la opción de "sin tratamiento a la
fecha". Incluir esta opción y validar el formulario para que no solicite los demás datos.»

Hoy el ítem crítico «Tratamientos previos» (`destination.entity = PriorTreatment`, `minValues = 1`) solo se cierra
registrando una línea con esquema, contexto y fechas. Un paciente que de verdad **no ha recibido tratamiento** (caso
frecuente al diagnóstico) queda eternamente como «Faltante» y el oncólogo no tiene cómo decir «lo sé: ninguno». Además
el sistema no distingue «ausencia de dato» de «ausencia de tratamiento»: el análisis ve `priorTreatments: []` en ambos
casos y la aplicabilidad de `linea_tratamiento` sale «Desconocido» aunque el oncólogo sí lo sabe. La guía de la demo
(`docs/demo/guia-demo-S5.md`) siembra el paciente (g) sin tratamientos a propósito y dice «no se siembra un "ninguno"»:
el paciente sirve de caso de prueba de este cambio.

## Qué cambia

- **Representación (design D1):** la declaración «sin tratamiento previo a la fecha» es un `ClinicalAttribute` con
  `attribute_key = sin_tratamiento_previo`, `value = si`, `observed_at` = fecha de la declaración (por defecto hoy,
  editable), `entry_method = manual`, `review_status = verificado`. **No** se crea ninguna fila de `PriorTreatment`.
- **Catálogo (`packages/clinical-catalogs`, datos):** `atributos.json` declara la clave `sin_tratamiento_previo`
  (`mama` y `prostata`, valor único `si`); el ítem `tratamientos_previos` de `datos-criticos.json` gana la propiedad
  opcional `satisfiedBy` (`{ entity: ClinicalAttribute, attribute_key, value }`) que apunta a esa declaración (RN-29).
  Versión de catálogo nueva (el cambio de versión entre backends sigue dando `409`).
- **`clinical-api` · completitud:** `CompletenessService` cuenta la declaración vigente como cumplimiento del ítem
  (estado `presente_verificado`/`presente_sin_verificar` según su `review_status`, con su origen y fecha), de forma
  determinista y declarada por el catálogo, no cableada en el código.
- **`clinical-api` · coherencia (D4):** registrar un `PriorTreatment` manual con una declaración vigente la marca
  `reemplazado` en la misma transacción; declarar «sin tratamiento» con tratamientos vigentes se rechaza con `422`. Nunca
  coexisten las dos verdades.
- **Contrato (aditivo, ADR-26):** `CompletenessItem` gana `resolvedBy` opcional (`registro` | `declaracion_de_ausencia`);
  `POST …/clinical-attributes` documenta el `422` de incoherencia. Sin endpoint nuevo ni cambio de `PriorTreatmentManualCreate`.
  `info.version` sube un minor; se regeneran `packages/api-contracts` y los ejemplos.
- **`web` · formulario (D5):** `DialogoTratamientoPrevio` gana la casilla «Sin tratamiento previo a la fecha». Marcada,
  oculta/deshabilita régimen, línea, contexto, inicio, fin, «En curso» y motivo, **no los valida**, pide solo la fecha de
  la declaración y envía `POST /api/patients/{id}/clinical-attributes`. La tabla de tratamientos muestra «Sin
  tratamiento previo a la fecha (declarado hace N meses)» en vez de «Sin datos»; la columna «Datos críticos» la muestra
  como presente con su origen.
- **Análisis (D6):** el contexto clínico desidentificado ya transporta `attributes[]`; se añade una frase determinista
  «Sin tratamiento previo a la fecha» al hecho del paciente y se **prueba** que no se serializa como dato ausente. Los
  criterios de aplicabilidad **no** cambian (`linea_tratamiento` sigue «Desconocido»: ver Preguntas abiertas).

## Capacidades

- `completeness` (ADDED): la declaración cumple el ítem; `resolvedBy`; coherencia con tratamientos registrados.
- `manual-clinical-entry` (ADDED): opción «Sin tratamiento previo a la fecha» en el formulario; validación; reemplazo.
- `clinical-catalogs` (ADDED): clave de atributo y `satisfiedBy`.
- `api-contracts` (ADDED): cambio aditivo y regeneración.
- `case-timeline` (ADDED): la sección de tratamientos distingue «ninguno declarado» de «sin datos».
- `evidence-analysis-gateway` (ADDED): la declaración viaja al análisis desidentificada y rotulada, sin confundirse con ausencia.

## Bounded contexts

clinical-platform (módulos `completeness`, `prior-treatments`, `clinical-attributes`, catálogo, contrato) · frontend
(diálogo, tabla, columna) · ai-services (solo verificación/verbalización del contexto, sin cambio de reglas de dominio).

## Dependencias

- ↪ Archivados: `l1d-80` (diálogos y endpoints de US-094), `l1d-96` (columna «Datos críticos»), US-002 (checklist).
- ⛔ Coordinar la versión del catálogo con el change que toque `packages/clinical-catalogs` en la misma rama.

## Fuera de alcance

- Lógica de aplicabilidad nueva para `linea_tratamiento` (ver Preguntas abiertas) y cualquier inferencia de «primera línea».
- Declaraciones análogas para otros ítems («sin biomarcadores previos»): el patrón `satisfiedBy` las admite, no se activan.
- Caducidad automática de la declaración; el oncólogo la reemplaza declarando una fecha nueva o registrando un tratamiento.
- Ingesta OCR de tratamientos que contradigan la declaración (Post-MVP, PRD E-17): al llegar, seguirá RN-08 (la declaración
  pasa a `requiere_revision` con conflicto); se deja la regla escrita en design D4.
- Sembrar «ninguno» en el paciente (g): se conserva como caso de prueba del faltante.

## Preguntas abiertas (para el usuario / clínica)

1. ¿«Sin tratamiento previo» debe evaluar `linea_tratamiento` como «Coincide» con estudios de primera línea? Depende del
   contexto (adyuvante vs metastásico), por lo que el diseño lo deja «Desconocido» (no inventar) y solo hace visible el hecho.
2. ¿La declaración debe caducar (p. ej. tras N meses) para pedir reconfirmación? El diseño no la caduca.
