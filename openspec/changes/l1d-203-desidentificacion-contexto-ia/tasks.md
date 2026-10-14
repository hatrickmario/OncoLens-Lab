# Tasks — l1d-203-desidentificacion-contexto-ia

> Matriz TDD (CLAUDE.md): desidentificación (RN-11) y endpoint → **TDD estricto, doble bucle** (commit
> `test(L1D-203)` con el test de aceptación en rojo antes de su `feat(L1D-203)`); contrato → `contract(L1D-203)`;
> configuración de patrones y composición → **test después**; AC-5 sobre código de L1D-275 → **test de regresión**.
> Integración como nivel principal: Vitest + Supertest + **PostgreSQL real de test** (L1D-168), FX-T4a-a/FX-T4a-c
> creados en el test, **repositorio de identidad falso** en el puerto `PatientIdentityReader` (decidido en la
> historia hasta US-046) y **MSW** hacia `rag-orchestrator` desde `contracts/examples/` (captura el request y cuenta
> llamadas). Nunca `vi.mock` de módulos propios ni de Prisma; reloj y seudónimo inyectados (`vi.useFakeTimers`),
> salvo el AC-2, que usa el generador criptográfico real. Nunca `.skip`, `.only`, `it.todo`, `xfail`.
> Secuencia de commits: `contract` → `test` → `feat` → `refactor`.
>
> ⛔ **Orden de archivo (Gate 1, 2ª vuelta):** `l1d-103-gateway-contexto-clinico` MUST archivarse **antes** que este
> change: el delta `REMOVED` de `evidence-analysis-gateway` retira un requisito que solo existe en la spec principal
> tras archivar l1d-103 (si no, `openspec archive` falla). ↪ Requiere en `main` `config/pii-formats.json` de L1D-166.

## 1. contratos

- [ ] 1.1 (contract-first, skill sync-contracts) Editar `apps/clinical-api/openapi.yaml`: respuesta `GeneracionNoDisponible` (`oneOf` de `ErrorLlmLocalNoDisponible` y `ErrorDesidentificacionNoDisponible`, `error: const DESIDENTIFICACION_NO_DISPONIBLE`) en el `503` de `POST /platform/evidence-analyses`; `info.version` 1.2.1 → **1.3.0** `[S1 resp. 17]`. Añadir `contracts/examples/error-desidentificacion-no-disponible.json` y su entrada en `index.json`.
- [ ] 1.2 `contracts:generate` **primero** (cliente, Zod y extracto generado del `readme.md` §4, que se lista como archivo tocado) y **después** `contracts:check` (con `contracts:generate:check`) `[S1 resp. 17]`.
- [ ] 1.3 Comparación de incompatibilidades: `oasdiff breaking --fail-on ERR` contra `main` (o `contracts:breaking` si ya existe, US-214); citar en el PR el aviso esperado `response-body-wrapped-in-one-of-original-preserved` (alternativas disjuntas por el `const` de `error`, design §Contratos); cualquier `ERR` detiene el change y se escala a contract-keeper. Ante conflicto de merge, rebasar y regenerar, nunca fusionar a mano. Commit `contract(L1D-203)`.

## 2. clinical-platform

- [ ] 2.1 (test después) Configuración (design decisión 2, Gate 1 2ª vuelta, ↪ L1D-166): `PII_FORMATS_PATH` → `config/pii-formats.json` de L1D-166 como **fuente única** de formatos (montado de solo lectura; validado con Zod contra su esquema; sin copiarlo ni añadir formatos aquí) y `PII_MASKS_PATH` → `apps/clinical-api/config/pii-masks.json` **solo con las reglas de reemplazo**: marcador por cada `tipo` de L1D-166 (`[DOCUMENTO]`, `[TELEFONO]`, `[CORREO]`), `formatsVersion`, orden (identidad → fechas → formatos) y la regla RN-11 de fechas numéricas y con el mes en palabras → `[FECHA]`; `PII_NAME_TOKEN_MIN_LENGTH`. Verificación: test de humo de que `clinical-api` no arranca con `pii-formats.json` o `pii-masks.json` inválido o ausente, con un `tipo` sin marcador o con `formatsVersion` distinto de la `version` de L1D-166.
- [ ] 2.2 (TDD estricto) Test de aceptación en rojo: "envía la query con marcadores en lugar de nombre y documento y conserva HER2 3+, sin patientId ni birthYear en el payload, cuando doc1 pregunta por el nombre y el documento sintéticos de FX-T4a-a [US-049 AC-1]" · integración sobre el payload capturado. Esqueleto de `crearContextDeidentifier()` y `crearDetectorOpcionA()` con `throw new Error('no implementado')`. Commit `test(L1D-203)`.
- [ ] 2.3 (TDD estricto) Test de aceptación en rojo: "envía pseudoPatientId distintos que no contienen el patientId y no se persisten cuando se ejecutan dos análisis seguidos [US-049 AC-2]" · integración con el generador criptográfico real y lectura de `ai_analysis_record` (persistencia de L1D-104). Commit `test(L1D-203)`.
- [ ] 2.4 (TDD estricto) Test de aceptación en rojo: "el clinicalContext no contiene fechas AAAA-MM-DD y trae 14, 13, 12 y 8 meses relativos cuando se analiza FX-T4a-a con el reloj congelado [US-049 AC-3]" · integración. Commit `test(L1D-203)`.
- [ ] 2.5 (TDD estricto) Test de aceptación en rojo: "envía clinicalNotes vacío cuando FX-T4a-a tiene una nota con nombre, documento y teléfono [US-049 AC-4]" · integración. Commit `test(L1D-203)`.
- [ ] 2.6 (TDD estricto) Test de aceptación en rojo: "persiste un clinical_context_snapshot con el mismo hash canónico que el clinicalContext enviado sin pseudoPatientId y sin identificadores, y un query_text enmascarado [US-049 AC-6]" · integración. Commit `test(L1D-203)`.
- [ ] 2.7 (TDD estricto) Test de aceptación en rojo: "responde 503 DESIDENTIFICACION_NO_DISPONIBLE sin llamar a rag-orchestrator ni persistir cuando el detector de PII o el lector de identidad lanzan [US-049 AC-7]" · integración, respuesta validada contra el spec de `clinical-api` con el *helper* de L1D-164. Commit `test(L1D-203)`.
- [ ] 2.8 (TDD estricto) Tests de borde en rojo: "enmascara la identidad del representante cuando la pregunta nombra a la representante de FX-T4a-c [US-049 AC-1]" y "aplica solo los formatos de config/pii-formats.json cuando el paciente no tiene identidad registrada [US-049 AC-1]" (correo y `DNI 12345678` sintéticos) · integración. Commit `test(L1D-203)`.
- [ ] 2.8b (TDD estricto) Tests de borde en rojo: "enmascara como [TELEFONO] un teléfono escrito teléfono 300 123 4567 con el formato de L1D-166 [US-049 AC-1]" y "sustituye 15/03/2024 y 15 de marzo de 2024 por [FECHA] y conserva Gleason 4+3 [US-049 AC-3]" · integración, datos ficticios. Commit `test(L1D-203)`.
- [ ] 2.9 Extraer `crearDetectorOpcionA()`, `normalizarParaComparar()` y `tokensDeIdentidad()` en `deidentification/pii-detector.opcion-a.ts`, con unitarios uno a la vez (nombre sin tildes ni mayúsculas; palabra completa; token corto ignorado; documento con separadores; formato de L1D-166 aplicado con su marcador de `pii-masks.json`; teléfono con separadores y palabra clave; fecha numérica y con mes en palabras; fecha nunca rotulada como teléfono ni documento; "HER2 3+" y "Gleason 4+3" intactos; `findingTypes` sin valores). Verificación: 2.2, 2.8 y 2.8b en verde. Commit `feat(L1D-203)`.
- [ ] 2.10 Extraer `verificarDesidentificado()` (RN-11) y `enmascararTextoLibre()` en `deidentification/context-deidentifier.ts`, con unitarios uno a la vez (rechaza `AAAA-MM-DD`; rechaza notas no vacías; enmascara cada campo `TextoEnmascarado`/`TextoEnmascaradoNulo`; `null` se conserva). Commit `feat(L1D-203)`.
- [ ] 2.11 Implementar `crearContextDeidentifier()` (`PatientIdentityReader`, `PiiDetectorFactory`, `PseudonymGenerator` por la *factory*; error de dominio `DesidentificacionNoDisponible`), `pseudonym-generator.crypto.ts` (`psd_` + 16 base62), `patient-identity.reader.ts` del S1 (devuelve `null` hasta US-046), los puertos nuevos en `ports.ts`, el mapeo `DesidentificacionNoDisponible → 503` en el controlador y la sustitución del adaptador mínimo de L1D-103 en la composición (firma `desidentificar(contexto, query, caso)` de L1D-103). Verificación: 2.2–2.8b en verde.
- [ ] 2.11b Borrar `context-deidentifier.provisional.ts` de L1D-103 (requisito retirado por el delta `REMOVED` de `evidence-analysis-gateway`, `[S1 resp. 14d]`) y **conservar** `exigirEntornoSintetico()` (Gate 1, 2ª vuelta; design decisión 9): moverla a `deidentification/entorno-sintetico.guard.ts`, invocarla **primero** en `crearContextDeidentifier()` (antes del lector de identidad y del detector) y mapear `EntornoNoSintetico` al mismo `502 ERROR_SERVICIO_IA` genérico. Sus tests de L1D-103 (`data_origin = real_anonimizado`; `APP_ENV` piloto o ausente) **se mantienen**: se mueven y renombran al requisito "La guarda de entorno sintético se conserva hasta G-Piloto" en un commit `refactor(L1D-203): tests` sin cambiar aserciones, y se añade la aserción de que el detector de PII no se invoca. Sin `Test-Removal:`. La guarda la retira US-143 (G-Piloto), no este change. Verificación: suite en verde, incluidos esos tests. Commit `feat(L1D-203)`.
- [ ] 2.12 (test después) Test de no-fuga en logs: con FX-T4a-a, las líneas de la desidentificación contienen `traceId` y `findingTypes` (`nombre`, `documento`) y no contienen `52123456`, `Lucía`, `Rondón` ni la pregunta. Verificación: test en verde.
- [ ] 2.13 Refactor: Extract Method / Inline Method en los archivos tocados, sin cambio de comportamiento, tests en verde antes y después, commit `refactor(L1D-203)`.

## 3. ai-services

- [ ] 3.1 (test de regresión, ⛔ después del merge de L1D-275) Test de aceptación `test_prompt_rag_query_con_pseudo_patient_id_no_lo_incluye` con `@pytest.mark.ac("US-049", 5)`: dado un `RagQueryInternalRequest` sintético con `pseudoPatientId = "psd_p7f3a"` `[S1 resp. 18]`, el texto de `construir_prompt_rag_query()` (L1D-275) no contiene `psd_p7f3a` ni `p7f3a`. Sin código de producto en `rag-orchestrator`: si falla, se reporta a L1D-275. Verificación: Pytest en verde.
- [ ] 3.2 Refactor: Extract Method / Inline Method en los archivos tocados, sin cambio de comportamiento, tests en verde antes y después, commit `refactor(L1D-203)` (solo si 3.1 introdujo *builders* de test).

## 4. Verificación

- [ ] 4.1 `openspec validate l1d-203-desidentificacion-contexto-ia --strict` en verde.
- [ ] 4.1b Al archivar: comprobar que `l1d-103-gateway-contexto-clinico` ya está archivado (su requisito "El desidentificador provisional falla cerrado fuera de datos sintéticos" está en `openspec/specs/evidence-analysis-gateway/spec.md`) antes de `openspec archive l1d-203-desidentificacion-contexto-ia`.
- [ ] 4.2 Suites de `apps/clinical-api` (Vitest + Supertest con PostgreSQL real de test) y de `apps/rag-orchestrator` (Pytest) en verde.
- [ ] 4.3 El `503 DESIDENTIFICACION_NO_DISPONIBLE` de `POST /platform/evidence-analyses` validado con el *helper* de L1D-164 (Ajv2020, `[S1 resp. 17]`); `contracts:verify-provider` llega con US-214.
- [ ] 4.4 Sin `run-ai-eval`: no cambia modelo, prompt, umbral, catálogo ni corpus; la métrica PII (G-8) la mide US-072.
