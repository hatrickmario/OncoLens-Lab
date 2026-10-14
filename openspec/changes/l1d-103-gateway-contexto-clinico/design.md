# Design — l1d-103-gateway-contexto-clinico

## Context

Ver `proposal.md` (Why). Estado de partida: `apps/clinical-api` solo tiene `openapi.yaml`; el esqueleto Express,
workspaces y Compose llegan con L1D-164 (US-034); el esquema con L1D-168 (US-038); el seed con L1D-169 (US-039); el
guard de sesión con L1D-197 (US-211); el JWT de servicio con L1D-105 (US-054). `packages/api-contracts` ya genera el
cliente TS de `rag-orchestrator` y los schemas Zod de `clinical-api` (US-033). `packages/clinical-catalogs/manifest.json`
lo crea L1D-169 (creador único) y L1D-164 monta el directorio de solo lectura con `CLINICAL_CATALOG_PATH`; el `409`
por versión llega con US-041 en el S2 (dependencia hacia adelante del slicing v2).

Flujo del módulo `evidence-analysis` (readme §2.3, FEAT-06a Contexto técnico):

```
POST /platform/evidence-analyses
  traceId = IdGenerator.traceId()                    ← siempre generado; X-Trace-Id entrante solo al log
  guard de sesión (US-211) ──401──▶ fin, 0 llamadas
  exigirRolDoctor(req.sesion) ──403 PERMISO_DENEGADO──▶ fin, 0 llamadas   [S1 resp. 14c]
  Zod (borde) ───────────────422──▶ fin, 0 llamadas
  controller → service
     repository.leerCaso(patientId) ──404──▶ fin, 0 llamadas
     ClinicalContextBuilder.construir(caso, ahora)            ← este change (allowlist)
     [ContextLabeler — US-065, S3]
     ContextDeidentifier.desidentificar(contexto, query, caso) ← puerto; provisional falla cerrado
                                                                 (data_origin ≠ sintetico o APP_ENV ∉ {local,test})
                                                                 ──502──▶ fin, 0 llamadas   [S1 resp. 14d]; L1D-203
     armarRagQueryRequest(...)                                ← este change
     RagQueryClient.consultar(request, { deadline })          ← cliente generado hey-api de L1D-105 sobre
                                                                 createRagOrchestratorFetch() [S1 resp. 13]
     AnalysisCompletion.completar(request, respuesta)         ← puerto; L1D-104
```

## Goals / Non-Goals

**Goals:**
- Borde validado con el schema Zod generado; cero llamadas a `rag-orchestrator` ante `401`, `422` o `404`.
- Allowlist del contexto en **un** lugar con nombre propio, verificable contra `ClinicalContext` con
  `additionalProperties: false` (RN-10).
- Request interno completo y válido contra `RagQueryInternalRequest`.

**Non-Goals:**
- Persistencia, respuesta `200`, *deadline* y mapeo de errores (L1D-104); desidentificación completa (L1D-203);
  etiquetado RN-07 (US-065, S3); filtros reales (S3).

## Decisions

1. **Allowlist como construcción positiva, no como filtrado.** `ClinicalContextBuilder.construir(caso, ahora)` arma
   cada objeto del contexto campo a campo desde las filas leídas (nunca `{...fila}` ni `omit`), de modo que un
   campo nuevo del modelo no puede filtrarse por accidente. Selección: `Diagnosis` activo con histología, `grade`
   (en próstata, grupo ISUP, PRD B-08), `stagingSystem`/`stageValue`, escala funcional; último valor por
   biomarcador; `PriorTreatment`; `ClinicalEvent` relevantes; `ClinicalAttribute`; `currentLine`.
   `clinicalNotes = []` por minimización (readme §2.5); `biomarkerTrends = []` (S2), `missingCriticalData = []` (S3),
   `priorAnalyses = []` (Post-MVP). Descartado: serializar entidades Prisma y quitar campos prohibidos (una
   omisión olvidada es una fuga).
2. **Fechas relativas en el builder porque el contrato las impone.** `ClinicalContext` no tiene campos de fecha
   absoluta (`monthsSinceDiagnosis`, `monthsAgo`, `monthsSinceStart`, `monthsSinceEnd`); para producir un objeto
   válido el builder calcula meses con `mesesTranscurridos(fecha, ahora)` (función pura, reloj inyectado, `null` si
   la fecha es `null`). La **verificación** de RN-11 (ninguna cadena `AAAA-MM-DD`, valores exactos del AC-3 de
   US-049) es de L1D-203, que puede reutilizar la función. Frontera a confirmar con L1D-203 (ver "Pendiente").
3. **`dataRef` opacos por petición.** `r1…rN` asignados en orden de construcción; el mapa `dataRef → entidad` se
   devuelve al service (no viaja a Backend 2) para que L1D-104 lo persista en `patient_data_links`.
4. **Procedencia mínima en el S1.** El contrato exige `provenance` en cada ítem; el builder copia `entry_method`,
   `extraction_confidence` (o `n_a` si no hay), `review_status` y `conflict = conflicts_with_id != null` de la fila.
   No excluye `rechazado`/`reemplazado` ni etiqueta más allá: eso es RN-07, dueña US-065 (S3). (asumido; cubierto por
   el bloque aceptado `[S1 resp. 3]` en cuanto a supuestos del S1)
5. **Desidentificación y cierre detrás de puertos.** `ContextDeidentifier` y `AnalysisCompletion` se reciben por la
   *factory* del service (sin contenedor de DI, CLAUDE.md). Adaptadores por defecto de este change, reemplazados por
   los changes hermanos:
   - `ContextDeidentifier` mínimo: asigna `pseudoPatientId` con un `PseudonymGenerator` inyectado (formato
     `psd_…`), deja `clinicalNotes = []`, no enmascara la pregunta. **Falla cerrado** `[S1 resp. 14d]`: antes de
     devolver nada, `exigirEntornoSintetico(caso.dataOrigin, config.APP_ENV)` lanza `DesidentificacionProvisionalRechazada`
     si `data_origin ≠ sintetico` o `APP_ENV ∉ {local,test}` (`APP_ENV` ausente también rechaza). El controlador lo
     mapea a `502 ERROR_SERVICIO_IA` genérico (respuesta ya declarada; sin contrato nuevo), sin llamar a
     `rag-orchestrator` y sin persistir; el log lleva solo `traceId`, UUID y `motivo` (`data_origin` | `app_env`).
     Alternativas descartadas: `503 LOCAL_LLM_UNAVAILABLE` (miente sobre la causa); código propio (contrato nuevo, ya
     lo trae L1D-203 con `503 DESIDENTIFICACION_NO_DISPONIBLE`). L1D-203 lo sustituye por el definitivo.
   - `AnalysisCompletion` provisional: no muestra resultados; responde `502 ERROR_SERVICIO_IA` genérico
     (respuesta ya declarada) para no responder `200` sin persistir (RN-06). L1D-104 lo sustituye.
   Ventana entre merges: aceptable solo porque el S1 usa exclusivamente datos sintéticos (RN-13) y ambos changes son
   del mismo sprint; ver "Pendiente de definir".
6. **`dataClassification` desde `patient.data_origin`**, nunca de un literal; en el S1 siempre `sintetico`.
7. **`catalogVersion` desde `manifest.json`** en `CLINICAL_CATALOG_PATH` (workaround del slicing v2), leído una vez
   al arrancar por un `CatalogVersionProvider`; si falta el manifiesto, `clinical-api` no arranca. Sin `409` (US-041).
8. **`maxOptions` y filtros efectivos.** `maxOptions` desde `ANALYSIS_MAX_OPTIONS` (1 en el S1, 3 desde el S4; nombre
   asumido, RN-22). `filtersApplied` se reenvía como `RagFiltersApplied` con los cuatro booleanos (defecto `false`) y
   `publishedFromYear` efectivo (año actual del reloj inyectado menos `EVIDENCE_DEFAULT_YEARS` si viene ausente).
   En el S1 los filtros **no cambian** el `clinicalContext` (AC-5).
9. **`traceId` siempre generado por `clinical-api`** (corrección del Gate 1). Un *middleware* del módulo genera
   `traceId` con el `IdGenerator` inyectado (`req_` + base62, patrón `^req_[A-Za-z0-9]{8,32}$` del contrato) al
   inicio de cada petición; ese valor viaja en el body del `RagQueryInternalRequest`, en el `traceId` de toda
   respuesta (incluidos los errores) y, con L1D-104, en `ai_analysis_record.trace_id`. El `X-Trace-Id` entrante es
   **dato no confiable**: `traceIdEntranteRegistrable(valor)` (función pura) lo devuelve solo si cumple el patrón, y
   entonces se registra en el log como `traceIdEntrante` para correlación; si no lo cumple (p. ej. PII sembrada) se
   descarta sin registrarlo. Nunca se copia al body hacia `rag-orchestrator`, a la respuesta ni a la persistencia; el
   transporte de L1D-105 no copia cabeceras entrantes. Descartado: reutilizar el entrante si cumple el patrón (un
   cliente podría enlazar consultas o inyectar un valor elegido en el registro trazable).
10. **Cliente generado y transporte de L1D-105, no propios** `[S1 resp. 13]`. `RagQueryClient` es el cliente hey-api
   generado por L1D-105 en `packages/api-contracts` (`fetch` inyectable), instanciado con
   `createRagOrchestratorFetch({ baseUrl: RAG_ORCHESTRATOR_URL, signer })` de
   `src/infrastructure/rag-orchestrator.http.ts`; el firmador es `src/infrastructure/service-jwt.ts`. La composición
   (en el arranque de la app) los conecta; el service solo ve el puerto. `X-Request-Deadline` es un **parámetro
   tipado de la operación** (cabecera declarada en el spec de `rag-orchestrator`), no una cabecera ad hoc: este
   change deja el parámetro en la firma del puerto y L1D-104 lo calcula (`RAG_TIMEOUT_MS`). El controlador nunca pasa
   cabeceras entrantes al cliente. El test del gateway re-afirma US-054 AC-4 (`Authorization: Bearer` verificable,
   sin `Cookie`).
11. **Rol `doctor` exigido en el S1** `[S1 resp. 14c]`. `exigirRolDoctor(sesion)` (función pura sobre
   `req.sesion = { userId, rol }` de L1D-197) se monta tras el guard y antes de Zod: `rol ≠ doctor` → `403
   PERMISO_DENEGADO` (respuesta `PermisoDenegadoOOptOut` ya declarada, mensaje fijo de
   `contracts/examples/error-permiso-denegado.json`), sin leer el caso ni llamar a `rag-orchestrator`. US-045 (S2) la
   reemplaza por el permiso `ai_analysis:create` y mantiene este escenario como regresión.
12. **Validación de respuestas con el *helper* de L1D-164** `[S1 resp. 17]` (Vitest con Ajv2020 sobre el *bundle* del
   spec de `clinical-api`) en cada test de integración; `contracts:verify-provider` llega con US-214 y no se usa aquí.

Alternativas: ninguna decisión es cara de revertir (sin contrato, esquema ni modelos nuevos); se descartan en línea.

## Privacidad y ownership

- **Fronteras:** `web` (BFF, US-060) → `clinical-api` con cookie opaca; `clinical-api` → `rag-orchestrator` con JWT de
  servicio (L1D-105) por su transporte `createRagOrchestratorFetch()`. La cookie nunca se reenvía (US-211 AC-5,
  US-054 AC-4, re-afirmado en el test del gateway).
- **Qué cruza hacia Backend 2:** solo `RagQueryInternalRequest`. El `clinicalContext` no contiene `patientId`,
  `identification`, `birthYear`, `agreementReference`, `sourceDataset` ni identidad (schema `identity` no se lee en
  este flujo). AC-4 lo verifica validando contra `ClinicalContext` con `additionalProperties: false`.
- **Desidentificación (RN-11):** dueña US-049 (L1D-203). Este change: fechas relativas forzadas por el contrato,
  `clinicalNotes = []`, `pseudoPatientId` por consulta (generador inyectado). Pendiente hasta L1D-203: enmascarar la
  pregunta y el texto libre de eventos/tratamientos.
- **rag-orchestrator no toca datos clínicos:** recibe el contexto en el cuerpo; no tiene ruta a PostgreSQL clínico ni
  a `clinical-minio` (L1D-164). Se invoca por `RAG_ORCHESTRATOR_URL` (hostname interno de Compose).
- **Logs:** solo `traceId` (generado), `traceIdEntrante` si cumple el patrón, `patientId` (UUID) y códigos; nunca
  `query`, contexto, identidad ni un `X-Trace-Id` que no cumpla el patrón. Test de no-fuga con FX-T4a-a y con PII
  sintética sembrada en `X-Trace-Id`.
- **`traceId` no confiable:** el entrante no cruza a Backend 2, a la respuesta ni a `ai_analysis_record`.
- **Mínimo privilegio:** `admin` no genera análisis (`403`, `[S1 resp. 14c]`, PRD E-04).
- **Ventana provisional cerrada a datos sintéticos:** el desidentificador provisional rechaza `data_origin ≠
  sintetico` y `APP_ENV ∉ {local,test}` `[S1 resp. 14d]`, de modo que la pregunta sin enmascarar no puede salir con
  datos reales ni en un entorno de piloto antes de L1D-203.
- **Datos:** solo seed sintético (semillas a/b) y fixtures; ningún dato real (RN-13, RN-14).

## Contratos

- **Proveedor:** `clinical-api` (`POST /platform/evidence-analyses`); **consumidor:** `web` (US-060).
  **Proveedor:** `rag-orchestrator` (`POST /rag/query`); **consumidor:** `clinical-api` (este change).
- **Diff propuesto del `openapi.yaml`:** ninguno en ambos specs. Todo lo emitido (`401 NO_AUTENTICADO`,
  `403 PERMISO_DENEGADO`, `404 NO_ENCONTRADO`, `422 CUERPO_INVALIDO`, `502 ERROR_SERVICIO_IA` provisional) y lo enviado
  (`RagQueryInternalRequest`, `ClinicalContext`) ya está congelado (US-033). Compatible con ADR-26; `oasdiff` sin
  cambios. Si L1D-164 sube `info.version` a 1.1.0, este change no lo toca.
- **Ejemplos:** MSW se construye desde `contracts/examples/` (US-213); se reutilizan `error-cuerpo-invalido.json`,
  `error-no-encontrado.json`, `error-no-autenticado.json`, `error-permiso-denegado.json`, `error-servicio-ia.json`.
  Si falta un ejemplo de
  `RagQueryInternalResponse` para el simulado, se usa el que añadan L1D-106/L1D-275; no se crea uno aquí.
- **Generado, nunca fuente:** el schema Zod de `EvidenceAnalysisRequest` y el cliente hey-api de `/rag/query`
  (L1D-105, `[S1 resp. 13]`) salen de `packages/api-contracts`; no se editan a mano.
- **Verificación:** respuestas validadas con el *helper* de L1D-164 `[S1 resp. 17]`. Nota: el `anyOf` de `sourcesSelected` debe traducirse a un
  `refine` en el Zod generado; si el generador no lo hace, se reporta a contract-keeper en lugar de parchear lo
  generado.

## Dependencias y colaboradores

| Módulo | Nuevo/Mod. | Depende de (puertos) | Reglas extraídas |
|---|---|---|---|
| `evidence-analysis.controller.ts` | nuevo | service | `exigirRolDoctor()` (`[S1 resp. 14c]`) |
| `trace-id.middleware.ts` | nuevo | `IdGenerator` | `traceIdEntranteRegistrable()` |
| `context-deidentifier.provisional.ts` | nuevo | `PseudonymGenerator`, config (`APP_ENV`) | `exigirEntornoSintetico()` (`[S1 resp. 14d]`) |
| `evidence-analysis.service.ts` (*factory* `crearEvidenceAnalysisService`) | nuevo | `CasoRepository`, `ContextDeidentifier`, `RagQueryClient`, `AnalysisCompletion`, `CatalogVersionProvider`, `Clock`, `IdGenerator`, config | `armarRagQueryRequest()` |
| `evidence-analysis.repository.ts` | nuevo | Prisma (real en tests) | — |
| `clinical-context.builder.ts` | nuevo | `Clock` | `construirContextoPermitido()` (RN-10), `mesesTranscurridos()`, `asignarDataRefs()`, `provenanceDe()` |
| `evidence-analysis.schema.ts` | nuevo | Zod generado | — |
| `ports.ts` | nuevo | — | declara `ContextDeidentifier`, `AnalysisCompletion`, `RagQueryClient`, `CatalogVersionProvider` |
| Router de la app | mod. | guard de US-211 | — |
| Composición del módulo (arranque) | nuevo | cliente hey-api generado, `createRagOrchestratorFetch()` y `createServiceTokenSigner()` de L1D-105 (no se crean aquí) | — |

Ningún service ni builder importa un cliente HTTP o Prisma concreto: los reciben por la *factory*.

## Risks / Trade-offs

- **Ventana de RN-11/RN-06 entre merges** → mitigada con adaptadores provisionales que no muestran resultados, un
  desidentificador provisional que falla cerrado fuera de datos sintéticos y de `APP_ENV ∈ {local,test}`
  `[S1 resp. 14d]`; el orquestador fusiona L1D-103 → L1D-104 → L1D-203 en oleadas consecutivas.
- **AC-5 cruza a L1D-104** (`filters_applied` persistido) → este change verifica la parte del request; el test de
  aceptación se completa con la aserción de persistencia en L1D-104.

## Pendiente de definir

- **Frontera de las fechas relativas con L1D-203** (dueño: orquestador/humano; afecta: L1D-103, L1D-203): propuesta
  de este design = el builder las calcula (decisión 2) y L1D-203 las verifica.
- ~~Ventana entre merges~~: resuelta por `[S1 resp. 14d]` (adaptador provisional que falla cerrado).
- **Código del fallo cerrado provisional** (dueño: contract-keeper, informativo): se usa `502 ERROR_SERVICIO_IA`
  porque es la única respuesta genérica declarada que no miente sobre el LLM; vive solo hasta el merge de L1D-203.
- **Nombre de `ANALYSIS_MAX_OPTIONS`** (asumido; coordinar con L1D-275, que recorta a `maxOptions` en Backend 2).
- ~~`manifest.json` mínimo en el S1~~: resuelto en el Gate 1 (2ª vuelta): lo crea L1D-169 (↪, creador único); este
  change solo lo lee y no crea ningún archivo en `packages/clinical-catalogs`.
