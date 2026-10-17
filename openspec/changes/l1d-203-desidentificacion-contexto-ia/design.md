# Design — l1d-203-desidentificacion-contexto-ia

## Context

Ver `proposal.md` (Why). Estado de partida (S1): L1D-103 crea el módulo `evidence-analysis` de `clinical-api` con el
flujo `leerCaso → ClinicalContextBuilder.construir(caso, ahora) → ContextDeidentifier.desidentificar(contexto, query)
→ armarRagQueryRequest → RagQueryClient → AnalysisCompletion`, y un `ContextDeidentifier` mínimo que solo asigna
`pseudoPatientId` y deja la pregunta sin enmascarar. L1D-104 persiste el `AIAnalysisRecord` antes de responder.
L1D-275 crea `construir_prompt_rag_query()` en `rag-orchestrator`. No hay identidad almacenada hasta US-046 (S2):
el seed del S1 no tiene nombres, documentos ni teléfonos (L1D-169, design).

Decisión de base: escenario A de ADR-40, aceptado para el S1 `[S1 resp. 3]` (ver Trazabilidad del proposal).

```
service (L1D-103)
  contexto = ClinicalContextBuilder.construir(caso, ahora)        ← fechas relativas (L1D-103)
  ContextDeidentifier.desidentificar(contexto, query, caso)       ← este change (firma de L1D-103)
     identidad = PatientIdentityReader.leer(caso.patientId)       ── lanza ──▶ 503, 0 llamadas
     detector  = PiiDetector.para(identidad)                      (opción A: identidad + patrones)
     queryEnmascarada = enmascararTexto(query)                    ── lanza ──▶ 503, 0 llamadas
     contexto' = enmascararTextoLibre(contexto)  (campos TextoEnmascarado)
     contexto'.clinicalNotes = []                                 (minimización S1)
     contexto'.pseudoPatientId = PseudonymGenerator.nuevo()
     verificarDesidentificado(contexto', queryEnmascarada)        ── falla ──▶ 503, 0 llamadas
  → { clinicalContext: contexto', query: queryEnmascarada }       (identidad descartada aquí)
```

## Goals / Non-Goals

**Goals:**
- Ningún identificador del paciente ni de su representante en el `RagQueryInternalRequest`, ni en la pregunta.
- Seudónimo aleatorio por consulta, nunca persistido ni en el prompt.
- RN-11 verificada en **un** método con nombre propio (`verificarDesidentificado()`), que falla cerrado.

**Non-Goals:**
- Motor definitivo de PII (ADR-40, S2), documentos (FEAT-01b), identidad cifrada (US-046), notas en el contexto (S3).

## Decisions

1. **División con L1D-103 (aceptada): el builder calcula las fechas relativas; este change las verifica.** El
   contrato `ClinicalContext` no tiene campos de fecha absoluta, así que el builder de L1D-103 ya debe producir
   `monthsSinceDiagnosis`, `monthsAgo`, `monthsSinceStart`, `monthsSinceEnd` con `mesesTranscurridos(fecha, ahora)`.
   Duplicar ese cálculo aquí sería una regla en dos sitios. Este change aporta la **guarda** de RN-11:
   `verificarDesidentificado()` recorre el contexto serializado y falla si encuentra una cadena `AAAA-MM-DD` (o
   `AAAA-MM-DDThh:mm`), y el test de aceptación del AC-3 fija los valores exactos con el reloj congelado. Si el
   builder de L1D-103 no llegara a calcularlas, el AC-3 lo detecta en rojo.
2. **Opción A de ADR-40 detrás de `PiiDetector`** `[S1 resp. 3]`. `crearDetectorOpcionA(identidad, patrones)`:
   - *Identidad conocida*: tokens del nombre completo del paciente y de su representante (longitud ≥
     `PII_NAME_TOKEN_MIN_LENGTH`, para no enmascarar partículas), comparados por palabra completa, sin mayúsculas y
     sin tildes (`Lucía` = `lucia`); número de documento comparado solo por dígitos (tolera `52.123.456`).
     Se sustituyen por `[NOMBRE]` y `[DOCUMENTO]`.
   - *Formatos de PII: fuente única `config/pii-formats.json` de L1D-166* (Gate 1, 2ª vuelta; ↪ L1D-166 D5, que
     ya prevé que el detector de ejecución lo reutilice). `PII_FORMATS_PATH` apunta a ese archivo (montado de solo
     lectura en `clinical-api`, como `CLINICAL_CATALOG_PATH`); se valida con Zod contra su esquema
     `{ version, formatos: [{ id, tipo, patron, palabrasClave?, descripcion }] }` al arrancar. Este change **no copia
     ni define formatos**: documento de identidad con palabra clave, teléfono (E.164, o 7–12 dígitos con separadores
     tras `tel`/`teléfono`/`celular`, p. ej. "teléfono 300 123 4567") y correo son los de L1D-166. Un formato que
     falte (p. ej. un documento sin palabra clave) se añade **allí**, en un PR revisado que también afecta al escaneo
     de la CI; nunca en un archivo paralelo.
   - *Reglas de reemplazo propias* (`PII_MASKS_PATH`, `apps/clinical-api/config/pii-masks.json`, RN-22):
     `{ version, formatsVersion, marcadores: { <tipo>: "[<MARCADOR>]" }, orden: [...], fechas: {...} }`. Un marcador
     por cada `tipo` de L1D-166 (`documento_identidad` → `[DOCUMENTO]`, `telefono` → `[TELEFONO]`, `correo` →
     `[CORREO]`); si falta el de algún `tipo` o `formatsVersion` ≠ `version` de `pii-formats.json`, `clinical-api` no
     arranca. La única regla que no viene de L1D-166 es la de **fechas en texto libre** de RN-11 (numéricas
     `dd/mm/aaaa`, `dd-mm-aaaa` y con el mes en palabras, nombres de mes en el propio archivo → `[FECHA]`): no es un
     formato de PII sino la regla de fechas relativas, por eso no va a `pii-formats.json` (la CI no debe fallar por
     cada fecha de `docs/`). Orden de aplicación: identidad conocida → fechas → formatos de L1D-166, para que una fecha
     no se rotule como teléfono o documento. Todos los valores de los tests son ficticios.
   - Los términos clínicos pasan sin cambio: "HER2 3+" y "Gleason 4+3" no coinciden con la identidad ni con los
     patrones por defecto (AC-1). Riesgo de falso positivo (apellido que coincide con un término) → lo mide US-072/ADR-40.
   - El detector devuelve el texto enmascarado y `findingTypes` (solo tipos, nunca valores) para *logs*.
3. **Texto libre del contexto también enmascarado ya en el S1.** CLAUDE.md: "desidentificar siempre, no cuando haga
   falta". El mismo `enmascararTexto()` se aplica a cada campo `TextoEnmascarado`/`TextoEnmascaradoNulo` del
   contexto (descripciones de eventos, tratamientos, atributos). Coste nulo y evita depender de que el seed no tenga
   PII. Los tests con PII sembrada en esos campos llegan por regresión con sus Features (S2, S3); aquí solo un
   unitario lo cubre.
4. **`PatientIdentityReader` como puerto; en el S1, "sin identidad registrada".** El adapter real del S1 devuelve
   `null` (no hay `identity.*` poblado hasta US-046); con `null` el detector usa solo patrones. Esto no es un fallo:
   lanzar sí lo es (AC-7). Los tests usan un repositorio falso con la identidad de FX-T4a-a (y FX-T4a-c para el
   representante), como fija la historia ("identidad falsa en el test hasta US-046"). La identidad vive solo en la
   pila de `desidentificar()`; nunca se devuelve, registra ni adjunta al error.
5. **Seudónimo criptográfico por consulta.** `PseudonymGenerator` (puerto) con adapter `crypto.randomBytes` →
   `psd_` + 16 caracteres base62 (patrón del contrato `^psd_[A-Za-z0-9]+$`). Nunca derivado de `patientId` (ni hash).
   Lo usa solo el request saliente; L1D-104 persiste el snapshot **sin** `pseudoPatientId` (data-model:
   "desidentificado, con etiquetas; sin pseudoPatientId"). Los tests de servicio inyectan una secuencia fija; el test
   de aceptación del AC-2 usa el adapter real porque lo que verifica es la aleatoriedad por consulta.
6. **Snapshot = contexto enviado sin `pseudoPatientId` (AC-6).** El AC-6 pide "igual al `clinicalContext` enviado
   (mismo hash)", y el modelo de datos exige que el snapshot no tenga `pseudoPatientId`. Se concilian comparando el
   hash SHA-256 del JSON canónico de ambos **sin** la clave `pseudoPatientId`. El `query_text` persistido es la
   pregunta enmascarada (data-model: "enmascarado si tenía PII").
7. **Fallo cerrado como error de dominio.** `desidentificar()` lanza `DesidentificacionNoDisponible` ante cualquier
   excepción del lector o del detector, o si `verificarDesidentificado()` falla; el controlador lo mapea a `503`
   `DESIDENTIFICACION_NO_DISPONIBLE` con `{ error, message, traceId }` genérico. No hay reintento ni *fallback* al
   texto original (asumido: falla cerrada, aceptado `[S1 resp. 3]`).
8. **AC-5 sin código nuevo en Backend 2; va después de L1D-275.** `construir_prompt_rag_query()` es de L1D-275, que
   ya declara "sin `pseudoPatientId`"; por eso este change se implementa en una oleada posterior a su merge. Añade el
   test de aceptación `@pytest.mark.ac("US-049", 5)` con `pseudoPatientId = "psd_p7f3a"` `[S1 resp. 18]` (el
   `p-7f3a` del Markdown no cumple el patrón `^psd_[A-Za-z0-9]+$`; el Markdown se corrige aparte).
9. **Retiro del adaptador provisional de L1D-103; la guarda de entorno sintético se conserva hasta G-Piloto**
   `[S1 resp. 14d]` (Gate 1, 2ª vuelta). El adaptador mínimo (`context-deidentifier.provisional.ts`) se borra al
   componer `crearContextDeidentifier()` y su requisito se elimina con un delta `REMOVED` en
   `evidence-analysis-gateway`. **`exigirEntornoSintetico()` NO se borra**: se mueve a
   `deidentification/entorno-sintetico.guard.ts` y `crearContextDeidentifier()` la invoca **primero**, antes de leer
   la identidad o enmascarar; con `APP_ENV ∉ {local, test}` (incluido ausente) o `data_origin ≠ sintetico` lanza
   `EntornoNoSintetico`, que el controlador mapea al mismo `502 ERROR_SERVICIO_IA` genérico de L1D-103 (sin cambio de
   contrato, cero llamadas a `rag-orchestrator`, sin persistir, log `motivo = data_origin | app_env`). Queda como
   requisito propio de `deidentification` y sus tests de L1D-103 se mueven con ella (renombrados en un commit
   `refactor(L1D-203): tests`, sin cambiar aserciones ni `Test-Removal:`). La desidentificación definitiva no
   sustituye a esta defensa en profundidad: la retira la historia de G-Piloto (**US-143**, `preflight real-data`,
   S6) cuando RN-13 y RN-12 (US-050) estén verificados, con su propio delta `REMOVED`.
   ⛔ **Orden de archivo:** l1d-103 se archiva antes que l1d-203; si no, el delta `REMOVED` no encuentra el requisito en
   la spec principal y el archivo falla.

Alternativas: solo la del contrato del `503` es cara de revertir (ver §Contratos). El resto se descarta en línea:
enmascarar en Backend 2 (viola RN-10/RN-11, descartada por US-013); NER o LLM local en el S1 (opciones B/C de ADR-40,
fuera del escenario aceptado); seudónimo derivado por HMAC del `patientId` (enlazable entre consultas, viola §6.1 #6).

## Privacidad y ownership

- **Fronteras:** `web` → `clinical-api` (cookie opaca, L1D-197) → `rag-orchestrator` (JWT de servicio, L1D-105). La
  identidad (hoy fixture falsa; con US-046 descifrada) se lee y se usa **dentro** de `clinical-api`, en memoria, solo
  durante `desidentificar()`; nunca cruza a Backend 2, a *logs*, a auditoría ni al error (RN-10).
- **Qué cruza:** `RagQueryInternalRequest` con `query` enmascarada y `clinicalContext` con `pseudoPatientId` efímero,
  fechas relativas, texto libre enmascarado y `clinicalNotes = []`. Sin `patientId`, `birthYear`, documento,
  nombre ni teléfono (AC-1). Lo refuerza `IDENTIDAD_B2` en el contrato (US-033).
- **Desidentificación (RN-11):** dueña esta historia; `verificarDesidentificado()` es el único punto de verificación.
- **Persistencia:** snapshot sin `pseudoPatientId` y `query_text` enmascarado (L1D-104, data-model).
- **rag-orchestrator** no toca datos clínicos ni `clinical-minio`; el test del AC-5 usa solo un request sintético.
- **Logs:** `traceId`, UUID del paciente, `findingTypes` y conteos; nunca valores detectados, pregunta, contexto ni
  identidad. Test de no-fuga con FX-T4a-a.
- **Datos:** FX-T4a-a/FX-T4a-c son sintéticos (fixtures del backlog); ningún dato real (RN-13, RN-14).

## Contratos

- **Proveedor:** `clinical-api`; **consumidor:** `web` (US-060, L1D-139, que ya maneja el `503`).
- **Diff propuesto de `apps/clinical-api/openapi.yaml`** (aditivo, `info.version` **1.4.1 → 1.5.0** según el
  registro de versiones (decisión 58 del plan): L1D-164 1.1.0, L1D-197 1.2.0, L1D-103 1.3.0, L1D-104 1.4.0, L1D-194 1.4.1):

  ```yaml
  # paths./platform/evidence-analyses.post.responses
  -        "503":
  -          $ref: '#/components/responses/LlmLocalNoDisponible'
  +        "503":
  +          $ref: '#/components/responses/GeneracionNoDisponible'
  # components.responses
  +    GeneracionNoDisponible:
  +      description: >-
  +        La generación no está disponible: LLM local caído (los datos reales nunca se envían a la
  +        nube) o desidentificación no disponible (falla cerrada, RN-11; no se invoca a Backend 2).
  +      content:
  +        application/json:
  +          schema:
  +            oneOf:
  +              - $ref: '#/components/schemas/ErrorLlmLocalNoDisponible'
  +              - $ref: '#/components/schemas/ErrorDesidentificacionNoDisponible'
  # components.schemas
  +    ErrorDesidentificacionNoDisponible:
  +      type: object
  +      additionalProperties: false
  +      required: [error, message, traceId]
  +      properties:
  +        error: { type: string, const: DESIDENTIFICACION_NO_DISPONIBLE }
  +        message: { type: string }
  +        traceId: { type: string }
  ```

  `LlmLocalNoDisponible` sigue intacto para las demás operaciones (seguimiento, resumen del caso), que adoptarán
  `GeneracionNoDisponible` con sus historias.
- **Ejemplo nuevo:** `contracts/examples/error-desidentificacion-no-disponible.json`
  (`{ "error": "DESIDENTIFICACION_NO_DISPONIBLE", "message": "No fue posible preparar la consulta.", "traceId": "req_…" }`,
  mensaje sin detalles internos) y su entrada en `index.json` con `target` a la respuesta `503` de la operación.
- **Compatibilidad (ADR-26):** aditivo para el consumidor (un valor nuevo del `oneOf` en una respuesta de error ya
  declarada). **Aviso declarado de `oasdiff`:** `response-body-wrapped-in-one-of-original-preserved` (el schema
  original `ErrorLlmLocalNoDisponible` queda envuelto en el `oneOf` y se conserva como alternativa). Es nivel `WARN`,
  no `ERR`: las alternativas son **disjuntas** por el `const` de `error` (`LOCAL_LLM_UNAVAILABLE` |
  `DESIDENTIFICACION_NO_DISPONIBLE`), así que todo cuerpo válido antes sigue validando contra exactamente una rama.
  La CI corre `oasdiff breaking --fail-on ERR`, que no falla por este aviso; se cita en el PR. Cualquier `ERR` detiene
  el change.
- **Orden y archivos tocados** `[S1 resp. 17]`: `contracts:generate` (cliente, Zod y extracto del `readme.md` §4)
  **antes** de `contracts:check`; `readme.md` figura como archivo tocado. Ante conflicto, rebasar y regenerar, nunca
  fusionar a mano.
- **Verificación:** el `503` se valida con el *helper* de L1D-164 (Ajv2020); `contracts:verify-provider` llega con
  US-214.
- **`rag-orchestrator`:** sin cambios (`RagQueryInternalRequest.query` ya se describe "Pregunta ya enmascarada").
- **Generado, nunca fuente:** el schema Zod y los tipos se regeneran en `packages/api-contracts`.

**Alternativas (decisión de contrato, cara de revertir):**

| Opción | A favor | En contra |
|---|---|---|
| **Elegida** · `503` con `oneOf` y código nuevo `DESIDENTIFICACION_NO_DISPONIBLE` | Cumple AC-7 (`503`) con un código cerrado que describe la causa; aditivo | Toca el contrato congelado (*minor*) |
| `503 LOCAL_LLM_UNAVAILABLE` reutilizado | Sin cambio de contrato | Miente sobre la causa; confunde la regla de proveedores (US-050) y el soporte |
| `502 ERROR_SERVICIO_IA` | Sin cambio de contrato | Contradice el AC-7 (`503`) y describe un fallo de comunicación con Backend 2 que no ocurrió |

## Dependencias y colaboradores

| Módulo | Nuevo/Mod. | Depende de (puertos) | Reglas extraídas |
|---|---|---|---|
| `deidentification/context-deidentifier.ts` (*factory* `crearContextDeidentifier`) | nuevo | `PatientIdentityReader`, `PiiDetectorFactory`, `PseudonymGenerator` | `desidentificar()`, `enmascararTextoLibre()`, `verificarDesidentificado()` (RN-11) |
| `deidentification/pii-detector.opcion-a.ts` | nuevo | patrones de config | `crearDetectorOpcionA()`, `normalizarParaComparar()`, `tokensDeIdentidad()` |
| `deidentification/pii-formats.config.ts` | nuevo | `PII_FORMATS_PATH` (L1D-166), `PII_MASKS_PATH` | validación Zod de `pii-formats.json` y `pii-masks.json`; marcador por cada `tipo`, `formatsVersion` coherente |
| `deidentification/entorno-sintetico.guard.ts` | movido desde L1D-103 | config (`APP_ENV`) | `exigirEntornoSintetico()` (decisión 9, hasta US-143) |
| `deidentification/pseudonym-generator.crypto.ts` | nuevo | `node:crypto` | — |
| `deidentification/patient-identity.reader.ts` | nuevo | — (S1: devuelve `null`; S2: US-046) | — |
| `ports.ts` (L1D-103) | mod. | — | añade `PiiDetector`, `PatientIdentityReader`, `PseudonymGenerator`; la firma `desidentificar(contexto, query, caso)` de L1D-103 se conserva (`caso.patientId`) |
| `evidence-analysis.controller.ts` (L1D-103) | mod. | — | mapeo `DesidentificacionNoDisponible → 503` |
| Composición del módulo | mod. | — | sustituye el adaptador mínimo por `crearContextDeidentifier(...)` |
| `context-deidentifier.provisional.ts` (L1D-103) | **borrado** | — | el adaptador se retira; `exigirEntornoSintetico()` se mueve (decisión 9) |
| `apps/clinical-api/config/pii-masks.json` | nuevo | `config/pii-formats.json` (L1D-166) | datos, sin código: solo marcadores, orden y regla de fechas |

Los subarchivos van en `src/modules/evidence-analysis/deidentification/` (un solo módulo de dominio, CLAUDE.md).
Ningún componente importa Prisma ni un cliente HTTP: reciben puertos por la *factory*.

## Evaluación

No cambia modelo, prompt, umbral de recuperación, catálogo ni corpus. Los patrones de PII son configuración del
detector (US-013 AC-6: su cambio dispara OL-06 cuando la suite exista, S2). Métrica afectada: **PII ≥ 0,95** (G-8),
medida en US-072 con el dataset de PII sembrada; en el S1 no hay suite `evaluate` en la DoD, así que la evidencia
son los tests de aceptación con FX-T4a-a.

## Risks / Trade-offs

- **Opción A no detecta nombres de terceros** ni identidad no registrada en el S1 (sin US-046 solo hay patrones) →
  aceptado `[S1 resp. 3]`; en el S1 solo hay datos sintéticos (RN-13). ADR-40 lo mide en el S2.
- **Falsos positivos** (token del nombre igual a un término clínico) → `PII_NAME_TOKEN_MIN_LENGTH` y palabra completa;
  medido en US-072.
- **Orden de merge:** necesita L1D-103, L1D-104, L1D-166 y L1D-275 en `main`; la ventana provisional de L1D-103
  (pregunta sin enmascarar) se cierra con este merge, y la guarda de datos sintéticos y `APP_ENV ∈ {local,test}`
  sigue activa hasta US-143. **Orden de archivo:** l1d-103 antes que l1d-203 (delta `REMOVED`).
- **Formatos de L1D-166 más estrictos que los anteriores** (teléfono o documento sin palabra clave no se detectan
  si el paciente no tiene identidad registrada) → aceptado en el S1 (solo datos sintéticos y guarda de entorno);
  ADR-40/US-072 decide si se amplía `pii-formats.json`.
- **Falsos positivos de los patrones nuevos** (un número de dosis o una fecha clínica en la pregunta pasan a
  `[FECHA]`/`[TELEFONO]`) → aceptado: RN-11 prima; la pregunta conserva el tiempo relativo si el médico lo escribe así.

## Pendiente de definir

- ~~Código del `503`~~: confirmado por el registro de versiones (decisión 58 del plan: L1D-203 → 1.5.0 por código nuevo; sustituye al de `[S1 resp. 37]`).
- ~~Firma de `ContextDeidentifier`~~: L1D-103 la fija como `desidentificar(contexto, query, caso)`.
- ~~AC-5 con `p-7f3a`~~: `psd_p7f3a` por `[S1 resp. 18]`.


> **Nota (L1D-115, 2026-10-17):** `config/pii-formats.json` lleva exenciones (`prefijosExentos`, `contextosExentos`, `prefijosDeRegistroExentos` —desde L1D-115 también en `telefono_local` para el identificador NCT—, `dominiosExentos`, `correosExentos`) que solo aplica el escáner de la CI (`scripts/lib/formatosPii.mjs`). El enmascarado en ejecución de este change debe decidir de forma EXPLÍCITA si usa `coincidenciasPii(..., { sinExenciones: true })` o respeta esas exenciones: una exención pensada para texto de documentos públicos no tiene por qué valer para el contexto clínico de un paciente.
