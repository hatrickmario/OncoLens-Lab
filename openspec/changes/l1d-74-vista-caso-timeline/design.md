# Design — l1d-74-vista-caso-timeline

## Contexto

`GET /platform/patients/{patientId}/case` y `CaseView` están congelados desde US-033 (`apps/clinical-api/openapi.yaml`,
ejemplo `contracts/examples/case-view.json`); no hay implementación. El esquema (`data-model.md`, OL-01) ya tiene
`Diagnosis`, `Exam` + `Biomarker`, `PriorTreatment`, `ClinicalEvent`, `ClinicalAttribute`, `ClinicalDataSource` y
`AIAnalysisRecord`. El módulo `completeness` expone `CompletenessService.calcular()`, la única implementación del
checklist, ya inyectada en `patients`. `compartido/estados-de-revision.ts` tiene el predicado único de RN-07
(`sqlDatoVigente`) y el catálogo `FUENTES_POR_REVISAR` del contador de la ficha vive en `patients.repository.ts`.
Los repositorios del módulo usan SQL sobre `Consultador` (pg), no Prisma Client.

Decisiones del refinamiento del S5 que se respetan: **D-1** (vista de caso mínima, US-088 + US-090), **D-8**
(`priorTreatments`, `attributes` y `biomarkerSeries` con lecturas simples, sin las reglas de US-089; fixtures
sembrados, sin OCR) y **ADR-50** (las correcciones dejan la fila anterior `reemplazado`; ninguna lectura la muestra).
Decisiones del Gate 1 (usuario, 2026-11-03): `[S5 resp. 10]` (ATC reales en los fixtures), `[S5 resp. 11a]` (origen
visible de los eventos de IA), `[S5 resp. 12]` (`description` sin enmascarar con `no-store`), `[S5 resp. 13]`
(supuestos `(asumido)` decididos) y la cadena de versiones (clinical-api 1.17.0).

## Decisiones

Ninguna es cara de revertir (sin cambio de forma del contrato, sin esquema, sin privacidad nueva): una recomendación
por decisión y las descartadas en una línea. Los supuestos antes marcados `(asumido)` en los escenarios quedan
**Decidido (usuario, 2026-11-03)** y se citan `[S5 resp. 13]`.

- **D1 · Módulo nuevo `src/modules/case-view/`** (`case-view.controller.ts`, `case-view.service.ts`,
  `case-view.repository.ts`, `case-view.schema.ts`, `case-view.vista.ts`, `timeline.reglas.ts`), montado detrás del
  guard de sesión con `authorize('clinical:read')`. *Descartado:* meterlo en `patients` (ya mezcla listado, ficha e
  identidad; la vista de caso no toca identidad).
- **D2 · Derivación pura en `timeline.reglas.ts`** (sin E/S): `eventosDerivados(filas)`, `unirYOrdenar(eventos)`,
  `procedenciaDeExamen(biomarcadores)`. El service solo lee del repositorio, llama a las reglas y al
  `CompletenessService`, y el mapeo a contrato valida con el Zod generado (`zCaseView`), como `completeness.vista.ts`.
- **D3 · Tipos y textos de los eventos derivados** (el contrato deja `eventType` como `string`):

  | Origen | `eventType` | `eventDate` / `datePrecision` | `description` | `codes` |
  |---|---|---|---|---|
  | `Diagnosis` | `diagnostico` | `diagnosed_at` / `dia` | `histology` | `icd10 = icd10_code`, `cups = null` |
  | `PriorTreatment` inicio | `inicio_tratamiento_previo` | `started_at` / `dia` (`null` → `incierta`) | `regimen_name` | `cups = cups_code` |
  | `PriorTreatment` fin | `fin_tratamiento_previo` | `ended_at` / `dia` (solo si `ended_at` no es nulo) | `regimen_name` | `cups = cups_code` |
  | `Exam` | `examen` | `performed_at` / `dia` | `exam_type` | ambos `null` |
  | `AIAnalysisRecord` `analisis_evidencia` | `analisis_ia` | fecha de `created_at` / `dia` | «Análisis de IA» | ambos `null` |
  | `AIAnalysisRecord` `resumen_caso` | `resumen_caso` | fecha de `created_at` / `dia` | «Resumen del caso» | ambos `null` |
  | `ClinicalEvent` | `event_type` | `event_date` / `date_precision` | `description` | `icd10_code`, `cups_code` |

  Los literales de `eventType` y las dos descripciones viven en una constante del módulo (un solo dueño).
- **D4 · `id` determinista de los eventos derivados.** El contrato exige `uuid` único y un tratamiento previo produce
  dos eventos: `id = uuidv5(NAMESPACE_CASE_VIEW, '<origen>:<idDeLaFila>:<hito>')`. Estable entre llamadas, sin
  `uuid()` aleatorio (política de determinismo). *Descartado:* reutilizar el `id` de la fila (choca en inicio/fin).
- **D5 · Orden.** Fechados por `eventDate` ascendente; empate por rango del origen (diagnóstico → inicio → fin →
  examen → evento clínico → análisis → resumen) y luego por `id`. Los `incierta` van al final, con `eventDate = null`,
  ordenados por `createdAt` de la fila y `id`. Regla con nombre: `ordenarTimeline()`.
- **D6 · Procedencia del examen** (la tabla `exam` no tiene revisión): `entryMethod` y `sourceDocumentId` del examen;
  `reviewStatus` = el **más pendiente** de sus biomarcadores vigentes (`requiere_revision` > `auto_aceptado` >
  `corregido` > `verificado`); `extractionConfidence` = la más baja (`baja` < `media` < `alta`; `n_a` si todas lo son);
  `conflict` = algún `conflicts_with_id` no nulo. Un examen sin biomarcadores vigentes no produce evento. Regla:
  `procedenciaDeExamen()`. *Descartado:* el estado del primer biomarcador (no determinista frente al orden de lectura).
- **D7 · Procedencia del análisis y del resumen** (el contrato no admite `null` y su enum de `entryMethod` no tiene
  valor de IA): relleno técnico `entryMethod = manual`, `extractionConfidence = n_a`, `reviewStatus = auto_aceptado`
  (salida de IA sin validación humana: RN-19), `conflict = false`, `sourceDocumentId = null`. **Decidido (usuario,
  2026-11-03) `[S5 resp. 11a]`:** el origen **visible** de estos eventos es «Generado por IA · Sin verificar» (clave
  `caso.origenIa` de `l1d-76`, sin confianza de extracción), elegido por `eventType` (`analisis_ia`, `resumen_caso`);
  ningún consumidor muestra su `entryMethod = manual` como «Registro manual». La constante de D3 exporta la lista de
  `eventType` de IA para que el test de contrato la compare con el ejemplo. *Descartado:* `verificado` (sugiere
  validación clínica, RN-19) y un valor `ia` en el enum (cambio incompatible del contrato congelado).
- **D8 · Lecturas simples (D-8).** `priorTreatments`: `ORDER BY line_number NULLS LAST, started_at NULLS LAST, id`;
  `attributes`: `ORDER BY attribute_key, observed_at NULLS LAST, id`; `biomarkerSeries`: un elemento por `name`
  (orden alfabético), `loincCode` del punto más reciente, puntos por `performed_at` e `id`. Todas las series se
  devuelven aunque tengan un solo punto. `additionalSourceDocumentIds = []` en toda la vista; `conflict` según
  `conflicts_with_id` donde la tabla lo tiene (`diagnosis`, `biomarker`), `false` en las demás.
- **D9 · Exclusión RN-07 en SQL** con `sqlDatoVigente()` en cada consulta (también en `biomarker` y en
  `clinical_event`). Ninguna lista local de estados descartados. El `reviewStatus` resultante cabe siempre en el enum
  de `Provenance` (sin `rechazado`/`reemplazado`).
- **D10 · Checklist (AC-8).** El service recibe `CompletenessService` por la factory y copia `items` → `{ item, status }`
  y `catalogVersion`. Sin diagnóstico activo o tipo no habilitado: `completeness = []` con la `catalogVersion` montada.
  El `404` lo decide primero la vista (`existePaciente`) para no depender del orden del checklist.
- **D3b · «Sin fecha confiable» y «evento clínico propio» (Gate 2 #1 y #2).** Un evento clínico está sin fecha confiable si `event_date IS NULL` o `date_precision = 'incierta'` (`sqlFechaNoConfiable()`, el mismo criterio con que el timeline lo coloca al final); solo cuenta/aparece si no tiene `analysis_id` (`sqlEventoClinicoPropio()`, ADR-32: el reflejo de un análisis no es un dato clínico). Ambos viven junto a `sqlDatoVigente()` y los usan el timeline, el contador y el análisis. **Decisión explícita:** un tratamiento previo sin `started_at` produce su evento `incierta` en el timeline pero **no** suma en `pendingReviewCount` (el contador solo mira `clinical_event`, PRD AC-02.2).
- **D11 · Contador de la ficha (AC-3).** Se modifica la entrada `clinical_event` de `FUENTES_POR_REVISAR`: cuenta las
  filas vigentes con `review_status = ANY($2)` **o** `date_precision = 'incierta'`, una vez por fila. No cambia
  `ESTADOS_PENDIENTES_DE_REVISION` (P-4 sigue: `auto_aceptado` no cuenta por su estado).
- **D12 · Una consulta por entidad (M-02.4):** diagnósticos, exámenes con biomarcadores (`JOIN`), tratamientos
  previos, eventos clínicos, atributos, registros de IA (solo `id`, `analysis_type`, `created_at`) y existencia del
  paciente: 7 consultas fijas + las del checklist, sin N+1. Se lanzan **en secuencia** (Gate 2 vuelta 1, #4): el `Consultador` puede ser un `Client` único y `pg` 8 desaprueba las consultas concurrentes sobre él; el service comprueba `existePaciente` primero, así un paciente inexistente no dispara las lecturas.
- **D13 · `description` tal como está guardada.** La vista es una lectura clínica del oncólogo autorizado
  (`clinical:read`), que ya ve la identidad en la ficha; el enmascaramiento de RN-11 aplica al contexto hacia la IA
  (US-052/US-093), no a esta vista. Nunca se registra en logs. La respuesta lleva `Cache-Control: no-store` (ni el
  navegador ni un intermedio guardan la `description`). *Descartado:* enmascarar con ADR-40 en la vista (descifrar la
  identidad en cada lectura y perder contenido clínico). **Decidido (usuario, 2026-11-03) `[S5 resp. 12]`**, con
  revisión en G-Piloto antes de datos reales.
- **D14 · Fixture con ATC reales y UUID fijos `[S5 resp. 10]`.** FX-02b-a usa `atc_codes = [L02AE02]` (leuprorelina)
  y `[L02BB03]` (bicalutamida), del subconjunto ATC que añade `l1d-80`; el patrón del código no se relaja.
  *Desviación de `FEAT-02b` §Fixtures* (`ATC-T-LEUP`), por la decisión. Todas las filas sembradas llevan UUID fijos
  para que la respuesta sea comparable campo a campo con el ejemplo (D15).
- **D15 · El ejemplo del `200` lo publica el proveedor.** `contracts/examples/case-view-p-caso.json` es la respuesta
  de FX-02b-a sembrado **sin** la PII sintética (toxicidad «Toxicidad cutánea grado 2»), reloj 2026-10-01 y el
  catálogo de test montado. Un test de integración compara la respuesta real con el ejemplo (igualdad profunda), de
  modo que el mock de `l1d-76`/`l1d-96` no pueda divergir del proveedor (US-213). La variante con PII sintética solo
  se arma en tiempo de test para el test de no-fuga en logs.

## Privacidad y ownership

- Frontera: `web` (US-090, BFF) → `clinical-api` con cookie de sesión. Este change no llama a `rag-orchestrator` ni a
  `clinical-minio`; `rag-orchestrator` no toca datos clínicos (sin cambios en su ownership).
- `CaseView` no lleva identidad (`identity` no se lee ni se descifra en este módulo). Los ids de documento viajan solo
  como UUID; ningún contenido ni URL de documento.
- Logs: UUID del paciente, `traceId`, código de respuesta y duración; nunca `description`, valores, fármacos ni
  identidad (RN-10). Test de no-fuga con la PII sintética de la toxicidad de P-CASO.
- `description` llega sin enmascarar solo al oncólogo autorizado, con `Cache-Control: no-store` (D13,
  `[S5 resp. 12]`); se revisa en G-Piloto. El ejemplo publicado no lleva PII (D15).
- RN-11 no aplica (no sale nada hacia la IA). RN-12/13: solo datos sintéticos en tests. `admin` → `403` (mínimo
  privilegio, PRD v1.4 §11, E-04).
- Sin cambios en `apps/web`: la «Seguridad web» corresponde a US-090.

## Contratos

Proveedor: `clinical-api`. Consumidores: `web` (US-090, por el cliente generado) y nadie más. Diff propuesto en
`apps/clinical-api/openapi.yaml` (aditivo, compatible con ADR-26; `oasdiff` sin cambios incompatibles):

```yaml
  /platform/patients/{patientId}/case:
    get:
      responses:
        "200":
          description: Vista de caso.
          headers:
            Cache-Control:
              description: Siempre no-store (lectura clínica con texto libre sin enmascarar).
              schema:
                type: string
                const: no-store
          # content sin cambios (CaseView)
        # 401, 403, 404 sin cambios
        "500":
          $ref: '#/components/responses/ErrorInterno'
```

`info.version` sube un *minor*: **1.16.0 → 1.17.0** (cadena del S5: `l1d-306` 1.15.1 → `l1d-268` 1.16.0 → `l1d-74`
1.17.0 → `l1d-80` 1.18.0 …); quien rebase renumera y **regenera** (provisional: este PR se mergea antes de `l1d-268`, publica 1.16.0 y `l1d-268` renumera a 1.17.0 al rebasar) `packages/api-contracts`, nunca fusiona generados a
mano. Ejemplo **nuevo** `contracts/examples/case-view-p-caso.json` (D15) con su entrada en
`contracts/examples/index.json` → `#/paths/~1platform~1patients~1{patientId}~1case/get/responses/200`, más las
entradas de `401`/`403`/`404`/`500` de `/case` con los ejemplos de error existentes (`error-no-autenticado.json`,
`error-permiso-denegado.json`, `error-no-encontrado.json`, `error-interno.json`). `case-view.json` se conserva.
`CaseView`, `zCaseView` y el cliente TS se **regeneran** del spec (`contracts:generate`), nunca se editan a mano.

## Dependencias y colaboradores

- `case-view.service.ts` depende de puertos: `RepositorioDeLaVistaDeCaso` (interfaz en `ports.ts`) y
  `CompletenessService`; nunca de `Consultador` directo. Factory `createCaseViewService({ repo, completitud })`.
- `case-view.repository.ts` implementa el puerto con SQL y `sqlDatoVigente()`; nada de lógica de derivación.
- Reglas con nombre propio en `timeline.reglas.ts`: `eventosDerivados()`, `procedenciaDeExamen()` (D6),
  `ordenarTimeline()` (D5), `idDeEventoDerivado()` (D4). Excluir rechazados/reemplazados queda en SQL con el
  predicado único (D9).
- `patients.repository.ts`: solo la entrada `clinical_event` de `FUENTES_POR_REVISAR` (D11).
- Fakes: ninguno nuevo de borde. Los unitarios de las reglas son puros; los de integración usan PostgreSQL real.
  El fake del repositorio solo para el `500` (por factory, no `vi.mock`), con el mismo contrato de errores que el
  real (lanza, nunca devuelve un `CaseView` parcial).

## Tests

- Integración (nivel principal): Supertest + PostgreSQL real de test + FX-02b-a sembrado (`tests/support/caso.ts`,
  reloj fijo 2026-10-01, `data_origin = sintetico`); cada respuesta validada contra el spec (US-214), errores incluidos.
- Unitarios puros: orden y empates, `id` determinista, procedencia del examen, eventos con fecha `null`.
- AC-8 reutiliza F-M2 y `test-1.0.0` de `tests/support/completitud.ts`.
- Contrato del ejemplo (D15): la respuesta de FX-02b-a sin PII es igual a `case-view-p-caso.json`; la cabecera
  `Cache-Control: no-store` está en el `200`.

## Riesgos

- **Conflicto de versión del contrato** con otros changes de la oleada que también suben `info.version`: se resuelve
  en el rebase según la cadena (1.17.0 tras `l1d-268`), regenerando `packages/api-contracts`.
- **ATC reales antes del catálogo:** si `l1d-80` (subconjunto ATC) no ha mergeado, el fixture inserta igual los
  códigos como datos; el test no valida contra el catálogo.
- **Orden de archivo:** el MODIFIED de `patients-identity` exige que ARR-10 archive antes `l1d-72`.
- **NFR-03 (p95 ≤ 2 s)**: con 7 consultas indexadas por `patient_id` el riesgo es bajo; se mide en US-105.

## Pendiente de definir

Nada. P1 (procedencia de los eventos de IA) quedó decidido en D7 `[S5 resp. 11a]` y P2 (`description` sin
enmascarar) en D13 `[S5 resp. 12]`.
