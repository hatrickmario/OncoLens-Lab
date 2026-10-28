# Design — l1d-141-estados-panel-criterio

## Context

Pantallas de referencia: `docs/ux/S3/pantallas-s3.md` **S3-01** (estados del panel, con su tabla de claves de
mensajes) y **S3-02** (criterio de orden por aplicabilidad, línea de conteos, aviso de población y cambio de
`evidence.relevance.basis`), sobre `docs/ux/S1/pantallas-s1.md` (S1-08/09), `docs/ux/sistema-de-diseno.md`
y la revisión `clinical-language-auditor` del 2026-10-24 (todos sus hallazgos ya aplicados en el diseño). Sin
desviaciones del diseño salvo D6 (confirmada por el usuario el 2026-10-24; ver Open Questions, Q1 y Q2 cerradas).

Estado observado en `apps/web` (S1, `l1d-140-panel-opcion-citas`):

- `EvidenceQueryForm` usa `maxLength={2000}` en el `textarea` (la pregunta se trunca en silencio: AC-4 no se
  puede reproducir) y anuncia el contador desde 1900 caracteres; el botón usa `aria-disabled` y un `if
  (!enviando)` que depende del estado de React (un doble clic antes del re-render puede emitir dos peticiones).
- `solicitarAnalisis` reduce cualquier fallo a `{ tipo: 'error', httpStatus, codigo, traceId }`; el fallo de
  red es `httpStatus = 0` y el `429` cae en `evidence.error.generico`; `Retry-After` no se lee.
- `elegirCriterioDeOrden()` devuelve siempre `evidence.orderCriterion.relevance` (heurística provisional del
  S1, ya preparada para recibir la respuesta).
- `AnalysisResult` muestra en `sin_evidencia` el titular y "Relevancia máxima: no aplica"; la Base
  (`AnalysisBasisPanel`, `l1d-187-panel-base-analisis`) ya incluye "Qué se buscó: fuentes … · filtros …".
- `ScopeNotice` ya muestra `alcance.tipoNoHabilitado` con `tipo_no_habilitado`.
- El BFF ya retransmite `Retry-After` y `X-Trace-Id` (`web-bff`, requisito "Errores de clinical-api
  retransmitidos sin reinterpretar"): **el BFF no cambia**.

Contrato: `apps/clinical-api/openapi.yaml` (`EvidenceAnalysis`, `EvidenceOption.applicabilitySummary`,
`populationNotComparable`, `perSource`, `warnings`; `429` → `LimiteGeneracion` con `Retry-After`), congelado
en US-033, sin diff.

## Goals / Non-Goals

**Goals:** AC-1…AC-7 de US-062 con los literales de `pantallas-s3.md` y `[S3 resp. 6]` / `[S3 resp. 9]`;
claves nuevas en `messages/es.json` limpias para `lint:lenguaje` (US-068).

**Non-Goals:** ver `proposal.md` → Fuera de alcance. A nivel de diseño: ningún hook, provider ni librería
nueva; ningún cambio en Route Handlers, `clinical-api` ni `rag-orchestrator`; ningún temporizador de progreso.

## Decisions

### D1 · Guarda síncrona contra la doble petición (AC-1)

`EvidencePanel` mantiene un `useRef<boolean>` `enCurso` que se pone a `true` **antes** del `fetch` y a
`false` al resolverse; `enviar()` sale si ya está en `true`. El estado `fase = 'enviando'` sigue gobernando
lo visible (skeleton, botón `disabled` real además de `aria-disabled`, texto "Analizando…"). La regla vive en
una función pura con nombre, `puedeEnviar(enCurso, pregunta)`, para probarla sin DOM. *Skeleton*: un bloque
`EvidenceOptionSkeleton` (átomo, sin texto con forma de opción, `aria-hidden`), visible solo en `enviando`.
Descartado: *debounce* del botón (deja una ventana temporal y depende del reloj).

### D2 · Validación de longitud con el Zod generado (AC-4)

Se quita `maxLength` del `textarea`. Antes de enviar, `validarPregunta(pregunta)` usa
`zEvidenceAnalysisRequest.shape.query` (el máximo 2000 sale del contrato, no de un literal nuevo; la constante
`MAXIMO_PREGUNTA` pasa a leerse del schema generado) y devuelve `{ ok: true } | { ok: false, max }`. Con error:
párrafo `id="pregunta-error"` con `evidence.formulario.maximo` añadido al `aria-describedby` del campo,
`aria-invalid="true"`, contador "2001 / 2000" con `aria-live="polite"` **solo** al superar el máximo
(accesibilidad de `pantallas-s3.md`; sustituye al umbral 1900). La misma validación ya la hace el Route
Handler en el servidor con el mismo schema.

### D3 · Fallos tipados: límite, red y servicio (AC-5)

`ResultadoDeSolicitud` gana dos variantes en lugar de sobrecargar `httpStatus`:
`{ tipo: 'limite', reintentarEnSegundos: number }` (de `429`; `leerRetryAfter(headers)`
acepta solo enteros ≥ 0, cualquier otra cosa → `null`) y `{ tipo: 'red' }` (excepción de `fetch`). La fase
del panel refleja ambas. `mensajeDeError()` sigue mapeando `502/503/504`. Con `limite`:
`AnalysisFailure` muestra `evidence.error.limite` con `{s}` en `role="status"` y deshabilita "Reintentar"
hasta que vence el plazo, medido con el reloj inyectado (`setTimeout` controlado con `vi.useFakeTimers` en
los tests); un `429` sin `Retry-After` válido no produce la fase `limite`: cae en `error` (`evidence.error.generico`) con "Reintentar" activo
(implementado así; el contrato declara `Retry-After` en el `429`, así que solo cubre una respuesta mal formada). La espera es un único
`setTimeout` en la molécula `RateLimitNotice` (sin cuenta regresiva visible). Con `red`: `evidence.error.red` sin línea de código de traza (no hay `traceId` que mostrar; nunca
se inventa). El foco va a "Reintentar" tras cualquier error (ya lo hace el S1 al reintentar; se extiende a la
aparición del error).

### D4 · Criterio de orden por la respuesta, no por configuración (AC-7)

`elegirCriterioDeOrden(analisis)` devuelve `evidence.orderCriterion.applicability` cuando **toda** opción de
`evidenceOptions` tiene aplicabilidad calculada (`perSource.length > 0`, que es lo que produce
`l1d-130-herencia-aplicabilidad-recorte` al ordenar por aplicabilidad) y `evidence.orderCriterion.relevance`
en otro caso, que es exactamente la regla de respaldo de US-125 ("sin aplicabilidad calculada se conserva la
regla del S1"). Así el panel nunca afirma un orden que la respuesta no construyó. La misma regla elige la
clave de `relevance-basis` (D6). Descartado: añadir un campo `orderCriterion` al contrato (cambio de contrato
congelado, ADR-26; lo reserva US-126 AC-7 si hiciera falta en el S4).

### D5 · Línea de conteos y aviso de población como moléculas

- `ApplicabilityCounts` (molécula): prefijo `evidence.aplicabilidad.prefijo` y cuatro `StatusChip` en texto
  (símbolo `aria-hidden` + palabra + número), separados por " · "; nombre accesible "Coincide 3, Parcial 1,
  No coincide 0, Desconocido 2". Sin enlace del «Desconocido» a la Base (D9). Solo se monta si la opción tiene aplicabilidad calculada (D4).
- `NonBlockingNotice` (molécula genérica, `role="status"`): la usan el aviso de población y el `429`
  (dos consumidores, por eso es componente propio y no texto inline).
- `EvidenceOptionCard` compone ambas entre la justificación y las citas, en el orden de S3-02.

### D6 · `relevance-basis` en dos claves, elegidas por D4

`pantallas-s3.md` cambia el texto de `evidence.relevance.basis` al de `[S3 resp. 9]`. Como el criterio neutro
del S1 se conserva cuando no hay aplicabilidad calculada (D4), el texto antiguo ("Orden basado en la cita
recuperada más relevante…") sigue siendo el verdadero en ese caso. Decisión: `evidence.relevance.basis` toma el
texto nuevo (como dice el diseño) y el texto del S1 pasa a `evidence.relevance.basisRelevancia`, usado solo con
el criterio neutro. **Desviación menor del diseño** (una clave más), justificada para no mostrar un texto falso.
**Confirmada (usuario, 2026-10-24, Q2):** se mantienen las dos claves.

### D7 · Sin evidencia: alcance y "Qué se buscó" (AC-2)

`AnalysisResult` añade en `sin_evidencia` `evidence.resultado.sinEvidenciaAlcance` y un bloque con título
`evidence.resultado.queSeBusco` que reutiliza `describirBusqueda()` / `evidence.resultado.pregunta` /
`evidence.resultado.idioma` (sin regla nueva). La Base ya se monta para todo estado. No se añade ningún texto
con forma de opción.

### D9 · Aplicabilidad no evaluada no se dibuja como ceros (AC-7, reconciliación con L1D-129/130)

Una opción con `perSource = []` trae `applicabilitySummary` en ceros porque **no se calculó**, no porque haya 0
criterios desconocidos. `ApplicabilityCounts` solo se monta con `tieneAplicabilidadCalculada()` (D4); si no, la
tarjeta muestra una línea de texto `evidence.aplicabilidad.noEvaluada` = "Aplicabilidad no evaluada: sin datos de
población en las fuentes citadas" (sin conteos, sin puntaje). El orden por aplicabilidad (RN-28) no usa puntaje
clínico y la relevancia es solo metadato secundario (desempata); el panel muestra el criterio de orden. El panel
**no** muestra `unknownReason` ni `patientDataWarning` (null en un desconocido sin causa; en_conflicto >
sin_verificar > null, faltante): son del detalle por criterio de US-126 (S4). «Desconocido» no enlaza a la Base del
análisis (su detalle está plegado y sin ancla estable): **desviación menor de S3-02**, la Base va justo debajo.

### D8 · Textos

Claves nuevas, literales de `pantallas-s3.md`: `evidence.resultado.sinEvidenciaAlcance`,
`evidence.resultado.queSeBusco`, `evidence.formulario.maximo` ("La pregunta admite como máximo {max}
caracteres."), `evidence.error.limite` ("Se alcanzó el límite de análisis. Puedes reintentar en {s}
segundos."), `evidence.error.red`, `evidence.orderCriterion.applicability`, `evidence.aplicabilidad.prefijo`
("Criterios del estudio frente a datos registrados:"), `evidence.aplicabilidad.{coincide,parcial,noCoincide,desconocido}`,
`evidence.aplicabilidad.poblacionNoComparable`, `evidence.aplicabilidad.noEvaluada` (D9) y la de D6. Modificada: `evidence.relevance.basis`. Ninguna
contiene el aviso de IA (llega en `disclaimer`).

## Componentes y patrones

| Componente | Nivel | Cambio | `'use client'` |
|---|---|---|---|
| `EvidencePanel` | organismo | guarda `enCurso` (D1), fases `limite`/`red` | sí (única frontera, sin cambio) |
| `EvidenceQueryForm` | organismo | sin `maxLength`, error junto al campo, `disabled` real (D1, D2) | hereda |
| `AnalysisResult` | organismo | alcance y "Qué se buscó" en `sin_evidencia` (D7) | hereda |
| `EvidenceOptionCard` | organismo | compone `ApplicabilityCounts` y `NonBlockingNotice` (D5) | hereda |
| `OrderingCriterion`, `RelevanceMeta` | organismo / molécula | clave elegida por D4 / D6 | hereda |
| `AnalysisFailure` | molécula | variantes `limite` y `red` (D3) | hereda |
| `ApplicabilityCounts` | molécula **nueva** | D5 | hereda |
| `NonBlockingNotice` | molécula **nueva** | D5 (2 consumidores) | hereda |
| `EvidenceOptionSkeleton` | átomo **nuevo** | D1 | hereda |
| `RateLimitNotice` | molécula **nueva** | D3 (espera del `429` con un `setTimeout`; separada de `AnalysisFailure`: un concepto por componente) | sí |
| `QueSeBusco` | molécula **nueva** | D7 (pregunta, idioma y fuentes de `sin_evidencia`) | hereda |

Ningún componente supera 100 líneas (`EvidencePanel` está en 90: si D1 + D3 lo acercan al límite, no se crea
un hook; se extrae la función pura `puedeEnviar` y el manejo de fases ya vive en `faseTrasSolicitud`). Sin hooks, *providers*, *compound components* ni *render props*: ningún concepto tiene
≥2 consumidores con estado compartido (YAGNI). La página sigue siendo RSC.

## Dependencias y colaboradores

- Reglas puras en `apps/web/lib/evidence/` (sin E/S, probadas con unitarios): `puedeEnviar()` (D1),
  `validarPregunta()` (D2), `leerRetryAfter()` (D3, RN-30), `elegirCriterioDeOrden()` y
  `elegirBaseDeRelevancia()` (D4/D6, RN-28 — un solo lugar decide qué orden se afirma),
  `tieneAplicabilidadCalculada()` (predicado compartido por ambas), `faseTrasSolicitud()` ampliada.
- `solicitar-analisis.ts` depende de `fetch` y de los schemas Zod generados de `packages/api-contracts`
  (nunca editados a mano). Los componentes dependen de `lib/mensajes` y de las reglas puras, no de `fetch`.
- El reloj del plazo del `429` se inyecta en `AnalysisFailure` (prop `ahora`/temporizador por defecto) para
  congelarlo en los tests; nada de `Date.now()` directo en las reglas.

## Privacidad y ownership

- Fronteras: navegador → `web` (`/api/evidence-analyses`, mismo origen) → `clinical-api` → `rag-orchestrator`;
  este change no añade ningún dato que cruce fronteras. El panel solo lee campos ya presentes en la respuesta
  (`applicabilitySummary`, `populationNotComparable`, `warnings`, `analysisBasis.sourcesConsulted`) y la cabecera
  `Retry-After`. La desidentificación (RN-11) no cambia; `rag-orchestrator` sigue sin tocar datos clínicos ni
  `clinical-minio`.
- En la redirección por `401` no se arrastra estado del paciente ni la pregunta (AC-3); la URL de login solo
  lleva `motivo=expirada`.
- **Seguridad web:** validación con el schema Zod compartido (`zEvidenceAnalysisRequest`) en cliente y en el
  Route Handler; sin variables `NEXT_PUBLIC_` nuevas; ningún módulo nuevo `server-only`; textos del corpus y del
  LLM renderizados como texto de React (sin `dangerouslySetInnerHTML`); los mensajes de error nunca muestran
  `message`, `error`, URLs internas ni trazas; sin impacto en CSP ni cabeceras; sin dependencias nuevas
  (`npm audit` no cambia).

## Contratos

- Proveedor `clinical-api`, consumidor `web`. **Sin diff** de `apps/clinical-api/openapi.yaml`; `oasdiff` vacío;
  compatible con ADR-26.
- Ejemplos reutilizados para MSW: `con-evidencia-s1.json`, `sin-evidencia.json`, `tipo-no-habilitado.json`,
  `con-evidencia-solo-descartadas.json`, `error-cola-inferencia-llena.json` (`429`, con `Retry-After: 30` en el
  handler), `error-servicio-ia.json` (`502`), `error-llm-local-no-disponible.json` (`503`),
  `error-deadline-vencido.json` (`504`), `error-no-autenticado.json` (`401`).
- Ejemplos de aplicabilidad (AC-7), ya en `main` por `l1d-130-herencia-aplicabilidad-recorte`:
  `con-evidencia-s3-aplicabilidad.json` (catálogo real de 6 criterios; opción con `applicabilitySummary`
  `{coincide: 2, parcial: 0, noCoincide: 0, desconocido: 4}`, `populationNotComparable = false`, `perSource` de una
  fuente; el estadio es `desconocido` con `patientDataWarning = sin_verificar`) y
  `con-evidencia-s1.json` (opción con `perSource = []` y resumen en ceros: **aplicabilidad no calculada**).
  Este change añade, con el commit `contract(L1D-141)`, `con-evidencia-s3-poblacion-no-comparable.json` (derivado
  del anterior: `estado_her2` excluyente en `no_coincide`, resumen `{1,0,1,4}`, `populationNotComparable = true`,
  `warnings` con `poblacion_no_comparable`), registrado en `index.json`, y corrige el primero, que tras integrar
  L1D-188 no cumplía `EvidenceAnalysis` (faltaba `analysisBasis.missingCriticalDataLabels`). `contracts:check`
  y `contracts:breaking` en verde; sin diff de `openapi.yaml`.

## Risks / Trade-offs

- [El criterio depende de `perSource` no vacío] → si L1D-130 llenara `perSource` sin haber ordenado por
  aplicabilidad, el panel afirmaría un orden falso. Mitigación: el escenario de L1D-130 fija que `perSource` solo
  se llena con la agregación que precede al recorte por aplicabilidad; test de componente con ambos ejemplos.
- [Quitar `maxLength`] → el usuario puede pegar textos largos; el Route Handler ya rechaza > 2000 con el mismo
  schema, así que no llega nada inválido a `clinical-api`.
- [Temporizador del `429` en la UI] → riesgo de test inestable; mitigado con reloj falso y sin *retries*.
- [Archivos compartidos con US-237 (L1D-288)] → conflictos de merge en `analysis-result.tsx` y `es.json`;
  mitigación: misma oleada en secuencia o rebase del segundo.

## Migration Plan

Sin migración de datos. Despliegue con el resto de `web`. Rollback: revertir el PR; el contrato no cambia.
El archivo de este change exige que `l1d-140-panel-opcion-citas` esté archivado antes (los MODIFIED apuntan a
`openspec/specs/evidence-panel/spec.md`).

## Open Questions

Ninguna abierta. Cerradas por el usuario el 2026-10-24:

- **Q1 · Aviso de IA en `tipo_no_habilitado` → se muestra** `[S3 resp. 17]`. Rige el requisito vigente de US-069
  (`l1d-194-aviso-ia-etiqueta-academica`, "Aviso de IA en todo resultado del análisis", con cualquier `status`,
  RN-19); `pantallas-s3.md` (S3-01) se corrigió en consecuencia. El panel no cambia ese comportamiento y el
  escenario de AC-6 lo fija; no hace falta MODIFIED de `human-control`.
- **Q2 · D6 → dos claves de `relevance.basis`**: `evidence.relevance.basis` (texto de aplicabilidad) y
  `evidence.relevance.basisRelevancia` (texto neutro del S1), elegidas por D4.
- **Texto del criterio** (hallazgo de `clinical-language-auditor`, con `maxOptions = 1`): "Orden por
  aplicabilidad: primero la opción con menos criterios excluyentes en No coincide; luego, la que coincide en
  más criterios con los datos registrados; la relevancia de recuperación solo desempata. Es un criterio de
  orden, no una valoración clínica.", idéntico en `pantallas-s3.md`, US-062 AC-7 y el spec.

## Regresiones anotadas (no son escenarios de este change)

- Regresión [RN-30] (`429` real de `clinical-api` con `Retry-After`) activa desde S4 (US-056/US-234).
- Regresión [RN-23] → US-068 (`lint:lenguaje` y E2E de términos prohibidos recorren los estados nuevos).
- Regresión [RN-19] → US-069 (aviso de IA en los estados con salida).
