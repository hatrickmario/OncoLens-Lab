# Proposal — l1d-203-desidentificacion-contexto-ia

## Trazabilidad

L1D-203 · US-049 · FEAT-T4a (L1D-40; división propuesta T4a-3 Desidentificación y proveedores) · Sprint 1 ·
Estimación **5** · HU-03 · RN-11 (dueña), RN-10, RN-22 · SEG-04 (parte S1) · AC-06.2 (fechas relativas),
AC-T4.2, AC-T4.3 (parte S1), AC-T1.4 · OL-03 · readme §2.5, §6.1 #6 · US-049 AC-1…AC-7 ·
⛔ ADR-40 (US-013, L1D-205, S2) resuelto para el S1 por el escenario más probable ·
Decidido (usuario, 2026-10-13, `[S1 resp. 3]`): "los supuestos marcados '(asumido)' en los AC se aceptan. Incluye el
escenario más probable de ADR-40 (opción A: coincidencia exacta con la identidad conocida + patrones configurables,
detrás del puerto `PiiDetector`); si ADR-40 elige otra opción en el S2, se sustituye el adapter y se re-estima"
(`backlog/features/FEAT-T4a-acceso-identidad-pacientes.md` §US-049; `backlog/sprints/S1-refinamiento.md` resp. 3;
`backlog/02-adrs.md` nota de ADR-40) · DoR del S1 ✓ "identidad falsa en el test hasta US-046" (S1-refinamiento §DoR) ·
🔗 Medido en: US-072 (sensibilidad de PII, G-8) ·
Decidido en el Gate 1 (usuario, 2026-10-14, `backlog/sprints/S1-plan.md` §2): `[S1 resp. 17]` (versión sustituida por `[S1 resp. 37]`:
`clinical-api` **1.4.0** tras el `422` nuevo de L1D-103, validación clínica 2026-10-14, `S1-plan.md` §7),
`contracts:generate` antes de `contracts:check`, `readme.md` (extracto generado) como archivo tocado · `[S1 resp. 18]`
el seudónimo del AC-5 es `psd_p7f3a` (el Markdown se corrige aparte) · `[S1 resp. 14d]` este change sustituye el
desidentificador provisional de L1D-103, que fallaba cerrado con `502` · correcciones del Gate 1: va después de
L1D-275 y añade patrones de teléfono con separadores y de fechas en texto libre · correcciones de la 2ª vuelta del
Gate 1: los formatos de PII salen **solo** de `config/pii-formats.json` de L1D-166 (este change añade únicamente las
reglas de reemplazo), la guarda `exigirEntornoSintetico()` se **conserva** hasta G-Piloto y l1d-103 se archiva antes
que este change.

## Why

El oncólogo solo usará una herramienta de IA sobre sus pacientes si la identidad de esos pacientes nunca sale de
`clinical-api` (AS-IS P12), incluso cuando él mismo escribe el nombre o el documento del paciente en la pregunta. El
gateway del S1 (L1D-103) ya envía un contexto por allowlist, pero con una desidentificación mínima provisional en la
que la pregunta viaja sin enmascarar. Esta historia es la **dueña de RN-11**: convierte "desidentificar" en un paso
obligatorio, con nombre propio, que falla cerrado, antes de cualquier llamada a `rag-orchestrator`. Una fuga en el S1
contaminaría `clinical_context_snapshot` y la memoria de análisis de forma irreversible (US-013, Contexto técnico).

## What Changes

- **Nuevo** adapter definitivo del puerto `ContextDeidentifier` (declarado por L1D-103) en
  `apps/clinical-api/src/modules/evidence-analysis/` que sustituye al mínimo provisional:
  - `pseudoPatientId` nuevo **por consulta** con un generador criptográfico inyectado (`psd_` + base62), nunca derivado
    del `patientId` ni persistido (AC-2).
  - Enmascaramiento de la **pregunta** y de todos los campos de texto libre del contexto (`TextoEnmascarado`) con un
    `PiiDetector` (puerto) cuyo adapter del S1 implementa la **opción A de ADR-40**: coincidencia exacta,
    sin mayúsculas ni tildes, con la identidad conocida del paciente y de su representante, más patrones
    configurables sin asumir país (RN-22) cuya **fuente única** es `config/pii-formats.json` de L1D-166 (documento de
    identidad con palabra clave, teléfono E.164 o con separadores tras palabra clave — "teléfono 300 123 4567" →
    `[TELEFONO]` —, correo); este change **no define formatos de PII propios**: solo añade sus reglas de reemplazo
    (`apps/clinical-api/config/pii-masks.json`: marcador por `tipo` del archivo de L1D-166, orden de aplicación y la
    regla RN-11 de **fechas en texto libre**, "15/03/2024", "15 de marzo de 2024" → `[FECHA]`, que no es un formato de
    PII ni la escanea la CI). Sustitución por marcadores `[<TIPO>]`; los términos clínicos ("HER2 3+",
    "Gleason 4+3") pasan sin cambio (AC-1).
  - Identidad conocida leída por un puerto `PatientIdentityReader`: en el S1 su adapter real devuelve "sin identidad
    registrada" (no hay identidad hasta US-046, S2); los tests usan un repositorio de identidad falso con FX-T4a-a.
  - Guardas de RN-11 sobre el resultado: `clinicalNotes = []` (minimización del S1, AC-4) y ninguna fecha absoluta
    `AAAA-MM-DD` en el `clinicalContext` (AC-3); si una guarda falla, el análisis falla cerrado.
  - **Fallo cerrado** (AC-7): si el detector o el lector de identidad lanzan, `503` sin llamar a `rag-orchestrator`
    y sin persistir.
- **Contrato (aditivo)**: el `503` de `POST /platform/evidence-analyses` admite un segundo código cerrado
  `DESIDENTIFICACION_NO_DISPONIBLE`, con su ejemplo en `contracts/examples/` (hoy solo admite
  `LOCAL_LLM_UNAVAILABLE`, que describiría mal la causa); `info.version` **1.3.1 → 1.4.0** `[S1 resp. 37]`. `oasdiff`
  emite el aviso `response-body-wrapped-in-one-of-original-preserved` (no es `ERR`). Ver `design.md` §Contratos.
- **Retira el desidentificador provisional de L1D-103** y su requisito (delta `REMOVED` en
  `evidence-analysis-gateway`): el fallo cerrado de la desidentificación pasa a ser el `503
  DESIDENTIFICACION_NO_DISPONIBLE` de este change. **Conserva la guarda `exigirEntornoSintetico()`** (`APP_ENV ∈
  {local, test}` y `data_origin = sintetico`, `502 ERROR_SERVICIO_IA` genérico sin llamar a la IA ni persistir) como
  requisito propio de `deidentification` **hasta G-Piloto**: la retira la historia de G-Piloto (US-143, `preflight
  real-data`), no este change. Sus tests se mueven con ella (sin `Test-Removal:`). Gate 1, 2ª vuelta.
- **Tests de aceptación** de RN-11 sobre el payload capturado hacia `rag-orchestrator` (AC-1 a AC-4, AC-7), sobre el
  `AIAnalysisRecord` persistido por L1D-104 (AC-2, AC-6) y sobre el constructor de prompt de L1D-275 en
  `rag-orchestrator` (AC-5).

## Capabilities

### New Capabilities

- `deidentification`: comportamiento verificable de la desidentificación de todo lo que sale de `clinical-api` hacia
  la IA (RN-11, dueña US-049): seudónimo por consulta, fechas relativas, texto libre enmascarado, minimización y fallo
  cerrado. **Justificación de la capacidad nueva:** RN-11 no es exclusiva del gateway de análisis: la amplían por
  regresión las Features que agregan contenido al contexto (eventos y tratamientos S2, notas y faltantes S3, memoria),
  el seguimiento (FR-31) y el resumen del caso; y cruza los dos backends (AC-5 se verifica en `rag-orchestrator`).
  Ponerla en `evidence-analysis-gateway` (L1D-103) la ataría a un endpoint; en `patients-identity` la mezclaría con el
  cifrado en reposo (US-046). No redefine el `Purpose` de ninguna capacidad existente ni en curso.

### Modified Capabilities

- `evidence-analysis-gateway` (L1D-103): se **elimina** el requisito "El desidentificador provisional falla cerrado
  fuera de datos sintéticos" (`[S1 resp. 14d]`, ligado al adaptador provisional); la guarda de entorno sintético que
  contenía pasa, con el mismo comportamiento, a `deidentification` hasta G-Piloto (US-143). ⛔ **l1d-103 debe
  archivarse antes que este change**: el delta `REMOVED` solo aplica sobre la spec principal que crea su archivo. El resto no cambia: "Contexto clínico
  por allowlist explícita" ya anota "Regresión [RN-11] activa desde S1 con el change de L1D-203", que este change
  materializa con requisitos propios en `deidentification`. `api-contracts` y `data-model` no cambian de requisito: el código nuevo cumple
  "Códigos de error cerrados y sin eco" (ejemplo en `index.json`) y la regla `IDENTIDAD_B2`; el snapshot "sin
  pseudoPatientId" ya está en `data-model`.

## Bounded contexts

- **clinical-platform** (principal): `apps/clinical-api` (módulo `evidence-analysis`, configuración de patrones).
- **ai-services** (solo test): un test de aceptación Pytest del constructor de prompt de L1D-275 (AC-5); sin código
  de producto en `rag-orchestrator`.
- **contratos**: `apps/clinical-api/openapi.yaml` y `contracts/examples/` (aditivo).
- No toca `frontend`.

## Dependencias

- ↪ **Depende de** el change de **L1D-103** (US-052): módulo `evidence-analysis`, `ClinicalContextBuilder` (calcula
  las fechas relativas), puerto `ContextDeidentifier` y su adaptador mínimo, que este change sustituye.
- ↪ **Depende de** el change de **L1D-104** (US-053): persistencia del `AIAnalysisRecord` (`clinical_context_snapshot`,
  `query_text`) para AC-2 y AC-6; y no persistir ante un error previo a la llamada (AC-7).
- ⛔ **Va después de** el change de **L1D-275** (US-225): `construir_prompt_rag_query()` en `rag-orchestrator`, sobre
  el que corre el test del AC-5; se implementa en una oleada posterior a su merge.
- ↪ **Depende de** el change de **L1D-168** (US-038): esquema y PostgreSQL real de test; y de **L1D-197** (US-211):
  sesión de `doc1@test.local`. ↪ **L1D-169** (US-039) solo por el usuario de test; FX-T4a-a se crea en el test.
- ↪ **L1D-166** (US-036): `config/pii-formats.json`, fuente única de formatos de PII (su design D5 prevé que el
  detector de ejecución lo reutilice); este change solo lo lee y añade las máscaras. Un formato nuevo se añade allí,
  en un PR revisado que afecta también al escaneo de la CI.
- ↪ US-143 (G-Piloto, S6): retira la guarda `exigirEntornoSintetico()` cuando el `preflight` habilite datos reales.
- ↪ **L1D-164** (US-034): `clinical-api` 1.1.0 y el *helper* de validación de respuestas (Ajv2020 sobre el *bundle*);
  tras L1D-103 (1.2.0), L1D-104 (1.3.0) y L1D-194 (1.3.1), este change sube a **1.4.0** `[S1 resp. 37]`; quien mergea segundo rebasa
  y regenera.
- ⛔ ADR-40 (US-013, L1D-205, S2): **no bloquea el S1** por `[S1 resp. 3]`; si elige otra opción, se sustituye el
  adapter de `PiiDetector` y se re-estima.
- ↪ US-046 (S2): el adapter real de `PatientIdentityReader` pasará a leer la identidad descifrada.
- 🔗 Regresión [RN-11] → US-049 en FEAT-02b/02c (eventos, tratamientos, S2), FEAT-04 y notas (S3), FEAT-11c (memoria):
  cada una amplía el AC-1 con su PII sembrada.

## Fuera de alcance

- Decidir el motor de PII (ADR-40, S2) y el gate de PII de documentos y el adapter `pii/` de Backend 2 (FEAT-01b, S2).
- Cifrado e índice ciego de la identidad (US-046, S2); registro manual de pacientes (US-047, S4).
- Regla de proveedores locales para datos reales (US-050, S6). Opt-out `403` (US-148, S6).
- Incluir notas clínicas en el contexto (S3): en el S1 viajan vacías por minimización.
- Enmascarar la pregunta de seguimiento (FR-31) y la del resumen del caso: las historias dueñas reutilizan el puerto
  y amplían este requisito por regresión.
- Construcción de las fechas relativas (L1D-103) y persistencia (L1D-104): aquí solo se verifican.

## Impact

- Código: `apps/clinical-api/src/modules/evidence-analysis/` (adapter de `ContextDeidentifier`, puertos `PiiDetector`
  y `PatientIdentityReader`, adapter de patrones + identidad), composición del módulo; tests en
  `apps/clinical-api/test/` y `apps/rag-orchestrator/tests/`.
- Configuración: `PII_FORMATS_PATH` (por defecto `config/pii-formats.json` de L1D-166, montado de solo lectura; sin
  copia ni formatos propios), `PII_MASKS_PATH` (`apps/clinical-api/config/pii-masks.json`: marcadores por `tipo`,
  orden y regla de fechas numéricas y con mes en texto), `PII_NAME_TOKEN_MIN_LENGTH`; `APP_ENV` (guarda de entorno
  sintético hasta G-Piloto).
- Contratos: `apps/clinical-api/openapi.yaml` (1.4.0, `[S1 resp. 37]`), `contracts/examples/error-desidentificacion-no-disponible.json`,
  `index.json` y `readme.md` (extracto generado del §4); regenerar `packages/api-contracts`.
- Datos: solo fixtures sintéticos (FX-T4a-a, FX-T4a-c) y seed; ningún dato real ni PII real (RN-13, RN-14).
