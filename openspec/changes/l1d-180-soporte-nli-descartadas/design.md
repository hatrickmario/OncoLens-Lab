# Design — l1d-180-soporte-nli-descartadas

## Context

Ver `proposal.md` (Why). Punto de partida: el pipeline con evidencia de L1D-275 aplica, en orden,
`validar_citas()` (L1D-179) → `verificar_soporte()` (**este change**) → `recortar_a_max_opciones()`
(L1D-275) → ensamblado (design de L1D-275, D2). L1D-179 entrega opciones con solo citas válidas y
`chunkTextSnapshot` copiado del corpus (su D4: el NLI usa esa premisa, nunca texto del LLM). La salida
interna del LLM (`GenerationOutput`, L1D-275 D1) trae `options[{option, rationale, citedChunkIds[]}]`
y `synthesis` (vacía en S1–S2); **no trae `limitations`**: el LLM no genera limitaciones en el S1
`[S1 resp. 11]`. El tipo que devuelve el puerto `EvidenceGenerator` conserva `limitaciones_propuestas`
(vacío con el LLM real; un generador falso puede proponerlas). Contexto técnico de la historia
(`backlog/features/FEAT-T1a-citas-soporte-procedencia.md`, US-064): `SupportChecker` en
`app/domain/support.py`, `checkProhibitedTerms` antes del NLI, umbral en configuración, tests Pytest
unitarios y de integración con FX-06a-b.

## Goals / Non-Goals

**Goals:**
- Una sola regla con nombre propio, `verificar_soporte()` (RN-01), que decide opción → válida o
  descartada y afirmación suelta → conservada u omitida; pura y probada sin E/S.
- RN-23 en ejecución en el mismo validador: ningún término prohibido generado sale en la respuesta.
- Falla cerrada ante el NLI caído (`[S1 resp. 3]`).

**Non-Goals:**
- Citas (L1D-179); generación y recorte (L1D-275); afirmaciones sobre datos del paciente (ADR-34),
  síntesis, aplicabilidad y supuestos (S2–S5); elección del modelo NLI (L1D-102).

## Decisions

1. **División determinista en afirmaciones** (`dividir_en_afirmaciones()` en `domain/claims.py`, puro):
   segmentación por oraciones (`.`, `;`, `?`, `!` seguidos de espacio o fin de texto), sin partir
   números decimales (`0,5`, `0.5`) ni abreviaturas de una lista fija; recorte de espacios y descarte de
   fragmentos vacíos. Nunca usa al LLM para dividir (no determinista y le daría la última palabra sobre
   qué se verifica). La justificación de una sola oración es una afirmación (caso de `LLM-OK`).
   Alternativa descartada en una línea: dividir con un modelo de segmentación (dependencia y
   no determinismo sin un segundo uso).
2. **Regla de soporte por afirmación** (`soporta()`): soportada ⇔ ∃ chunk citado con
   `label = entailment` y `p_entailment ≥ NLI_ENTAILMENT_THRESHOLD`. `neutral` y `contradiction` nunca
   soportan. Con varias citas basta una que implique (asumido: fuentes distintas pueden cubrir partes
   distintas; las discrepancias entre fuentes son de la síntesis, S3). Ver Open Questions.
3. **Opción = todas sus afirmaciones soportadas.** Una sola sin soporte → `discardedOptions`,
   `discardReason = afirmacion_sin_soporte`, `unsupportedClaims` = textos de las afirmaciones sin soporte
   por NLI, en orden de aparición. No hay soporte parcial de una opción (RN-01).
4. **Términos prohibidos antes del NLI** (Contexto técnico de US-064, `[S1 resp. 15]`/`[S1 resp. 16]`):
   `check_prohibited_terms()` (gemelo Python de L1D-193, nivel A de `terminos-prohibidos.json` 1.1.0)
   sobre `option` y sobre cada afirmación; una afirmación con término prohibido es "sin soporte" y **no**
   se envía al NLI (ahorra inferencia). Retiro, **siempre igual** `[S1 resp. 16]`:
   - el fragmento con término prohibido (la `option`, una afirmación de `rationale` o una entrada de
     `unsupportedClaims`) se **reemplaza** por el literal de `[S1 resp. 16]`: "[afirmación retirada:
     formulación no permitida]" o, con `queryLanguage = en`, "[claim removed: disallowed wording]".
     No hay literales distintos para opción y justificación;
   - la opción va a `discardedOptions` con `discardReason = afirmacion_sin_soporte` (el enum no cambia);
     la afirmación retirada entra en `unsupportedClaims` como el literal, nunca con su texto original;
   - la UI (L1D-140) aclara "o contenía lenguaje no permitido";
   - **registro en el log** `[S1 resp. 29]`: por cada fragmento retirado, un evento
     `{ event: "fragmento_retirado_lenguaje", traceId, campo, ruleId, languagePolicyVersion }`, donde `ruleId` es el
     `id` de la entrada coincidente de `terminos-prohibidos.json` y `languagePolicyVersion` su `version` (1.1.0 en el
     S1). **Nunca** el texto retirado, el término coincidente, la opción, la justificación ni la pregunta. Por eso
     `ProhibitedTermsChecker` devuelve las coincidencias como `(ruleId, campo)` además del booleano, y el adapter
     expone la versión cargada. La traza completa persistida (frase original, regla, versión y `chunkIds`) es un
     AC nuevo de US-150 (FEAT-T1b, S6), con contrato y esquema propios; fuera de alcance aquí.
   Los dos literales viven en `domain/support.py` y figuran en `packages/clinical-language/conformidad/casos.json`
   (L1D-193) como casos de cero coincidencias (dependencia ↪); un unitario lo comprueba aquí también.
   **Alcance del verificador:** solo los campos **generados**, declarados en `domain/support.py` como
   tupla con nombre `CAMPOS_GENERADOS = ("option", "rationale", "unsupportedClaims",
   "limitations[].text", "synthesis")`; quedan fuera los copiados del corpus (`citedSources[*]`,
   `chunkTextSnapshot`, títulos), que pueden contener legítimamente vocabulario de la lista. La fuente
   de verdad es `packages/clinical-language/origen-de-campos.json` (lo crea L1D-193). Un test compara la
   tupla con los campos de origen generado de ese archivo y falla si divergen. Así la lista no se
   mantiene a mano en dos sitios sin control.
5. **Limitaciones propuestas por el generador** `[S1 resp. 11]`. En el S1 el LLM no genera limitaciones;
   la regla existe para cuando el generador las proponga y se prueba con un **generador falso**
   (`FakeEvidenceGenerator` de FX-06a-b) que rellena `limitaciones_propuestas`. Premisas: todos los
   chunks entregados a la generación. Soportada → `limitations[]` con `origin = llm_verificado`; sin
   soporte o prohibida → se omite y `omittedClaims += 1`. Las limitaciones `estructural` (de regla, p. ej.
   "sin evidencia" de L1D-106) no pasan por el NLI. La síntesis está vacía en S1–S2: cuando llegue (S3)
   sus afirmaciones usan este mismo método (`🔗 Regresión [RN-01]`).
6. **Falla cerrada.** Cualquier excepción o *timeout* del puerto `NliClassifier` se traduce en
   `NliNoDisponibleError` de `application/` → el router (`app/api/rag_query.py`) responde `503`
   `ErrorNliNoDisponible`
   (`NLI_UNAVAILABLE`, `message` genérico, `traceId`). Sin reintento silencioso, sin respuesta parcial,
   sin *fallback* (RN-12). El LLM ya se invocó: el coste se acepta.
7. **Puerto `NliClassifier`** (`Protocol` en `application/ports.py`):
   `clasificar(pares: list[ParNli]) -> list[ResultadoNli]` con `ResultadoNli(label, p_entailment)` y
   `label ∈ {entailment, neutral, contradiction}`. Por lotes para acotar la latencia (p95 ≤ 15 s).
   El fake (FX-06a-b) registra las llamadas (premisa, hipótesis), permite fijar label y probabilidad por
   hipótesis y lanzar error; cumple el contrato del real (mismo tipo de error, nunca `None`).
   El adapter real (`infrastructure/nli/mdeberta.py`) usa `NLI_MODEL` / `NLI_MODEL_REVISION` de L1D-102
   y alimenta `meta.nliModel`.
8. **Orden y conteos.** `verificar_soporte()` conserva el orden de las opciones; las descartadas por
   soporte se añaden a `discardedOptions` después de las de L1D-179. El recorte a `maxOptions`
   (L1D-275) se aplica a las que sobreviven.

Alternativas (la decisión es barata de revertir, regla interna salvo el código de error): elegida, regla
pura en `domain/` con puerto NLI por constructor. Descartadas: validar dentro del adapter del LLM (mezcla
infraestructura y RN-01); "autoverificación" por el propio LLM (confianza autorreportada, no determinista).

## Privacidad y ownership

- **Fronteras:** este change no añade ninguna. El NLI corre dentro de `rag-orchestrator` (modelo local,
  RN-12) sobre: texto de chunks del corpus (premisa) y texto generado por el LLM (hipótesis). No recibe
  el `clinicalContext` ni la `query`; el `pseudoPatientId` nunca llega al NLI (RN-11).
- **`rag-orchestrator` no toca datos clínicos:** solo Milvus y schema `corpus` (rol `rag_corpus`); sin
  credenciales ni ruta a `clinical-minio` ni a otros schemas.
- **Logs:** `traceId`, número de afirmaciones, de pares NLI, de opciones descartadas y `omittedClaims`,
  latencia de la etapa, `nliModel` y, por cada fragmento retirado por lenguaje, `ruleId`, `campo` y
  `languagePolicyVersion` `[S1 resp. 29]`; **nunca** el texto de afirmaciones, chunks, opciones, el fragmento
  retirado, el término coincidente ni la pregunta.
  Test de no-fuga en logs (tarea 2.13).
- **Errores:** `503 NLI_UNAVAILABLE` con `message` genérico, sin eco ni detalle del modelo.
- **Datos:** FX-06a-a, FX-06a-b y FX-T1a sintéticos; ningún dato real ni identificador de paciente
  (RN-13, RN-14).
- **Lenguaje** (RN-23): los literales de retiro (`[S1 resp. 16]`) y los textos de prueba no contienen
  términos de la lista; la regla de esta historia es la última defensa en ejecución (L1D-275 D-Privacidad).

## Contratos

- **Proveedor:** `rag-orchestrator` (`apps/rag-orchestrator/openapi.yaml`). **Consumidor:**
  `clinical-api` (cliente generado en `packages/api-contracts`).
- **Diff propuesto del `openapi.yaml`** (aditivo, `[S1 resp. 12]`): solo se añade una alternativa al
  `oneOf` del `503` de `/rag/query` que crea L1D-106; el resto no cambia.

  ```yaml
  # paths./rag/query.post.responses."503" (tras L1D-106)
  description: >-
    ... (texto de L1D-106) ... o verificador de soporte (NLI_UNAVAILABLE): falla cerrada, ninguna
    opción se devuelve sin validar (RN-01).
  content:
    application/json:
      schema:
        oneOf:
          - $ref: '#/components/schemas/ErrorLlmLocalNoDisponible'
          - $ref: '#/components/schemas/ErrorRecuperacionNoDisponible'
          - $ref: '#/components/schemas/ErrorNliNoDisponible'      # nuevo
  # components.schemas
  ErrorNliNoDisponible:
    type: object
    additionalProperties: false
    required: [error, message, traceId]
    properties:
      error: { type: string, const: NLI_UNAVAILABLE }
      message: { type: string }
      traceId: { type: string }
  # info.version: 1.2.0 (L1D-106) → 1.3.0 [S1 resp. 37]
  ```
  `/rag/follow-up` y `/case/summary` no cambian en este change (su NLI llega con sus historias).
- **Ejemplos:** nuevo `contracts/examples/rag-nli-no-disponible.json`
  (`{"error":"NLI_UNAVAILABLE","message":"El verificador de soporte no está disponible.","traceId":"req_…"}`)
  y su entrada en `contracts/examples/index.json` con `target: #/paths/~1rag~1query/post/responses/503`.
  `rag-llm-local-no-disponible.json` y `rag-recuperacion-no-disponible.json` siguen válidos. No cambian
  `DiscardedOption`, `omittedClaims` ni `limitations[].origin` (congelados en US-033).
- **Compatibilidad (ADR-26):** se conservan los schemas originales; las alternativas son disjuntas por
  el `const` de `error`. `oasdiff` emite un **ERR**
  `response-body-one-of-added` (alternativa nueva en el `oneOf` del `503` de `POST /rag/query`), medido en la
  implementación; está cubierto por la **excepción declarada E-3** (ADR-26,
  `scripts/ci/contracts-breaking-excepciones.json`), igual que E-1 en el `422`. Cualquier otro `ERR` detiene el change.
  Cumple "Códigos de error cerrados y sin eco" (`const` + ejemplo) de `openspec/specs/api-contracts`.
- **Generados:** modelos Pydantic (`app/schemas/generated/`) y cliente TS (`packages/api-contracts`) se
  regeneran del spec (skill `sync-contracts`: spec → ejemplo e índice → `contracts:generate` →
  `contracts:check`), nunca a mano.
- **Validación de respuestas:** `200 con_evidencia` con descartadas (AC-1…AC-5, AC-7, AC-8) y
  `503 NLI_UNAVAILABLE` (AC-6) se validan contra el spec con el *helper* de L1D-164 `[S1 resp. 17]`;
  `contracts:verify-provider` no existe hasta US-214.
- **Consumidor:** `clinical-api` mapea `NLI_UNAVAILABLE` → `502 ERROR_SERVICIO_IA`, sin persistir
  `AIAnalysisRecord` y sin eco; lo hace L1D-104 con su tabla única `[S1 resp. 12]`.

## Evaluación

Introduce un **umbral** (`NLI_ENTAILMENT_THRESHOLD`) y conecta el modelo NLI → OL-06 obligatoria.
Métricas afectadas: fidelidad (≥ 0,90, M-07.2), precisión de citas (≥ 0,90), M-10.1 (= 100 % de opciones
con cita y soporte), salidas prescriptivas (= 0, M-10.2). La suite `evaluate` llega con US-072 (S2): en el
S1 `ai-eval-runner` evalúa a mano el análisis del paciente semilla con el NLI real (walking skeleton). El
valor de producción del umbral se calibra en US-072 (TBD-02); la configuración de test fija 0,7 (AC-5).

**Coste del filtro de lenguaje (Gate 1, 2ª vuelta).** Junto a salidas prescriptivas = 0, la suite `evaluate`
(y, en el S1, la evaluación manual) MUST registrar **`false_positive_language_filter_rate`** `[S1 resp. 34]`
(validación clínica, 2026-10-14; renombra la antigua "tasa de opciones descartadas por lenguaje no permitido"):
opciones descartadas por `ProhibitedTermsChecker` cuya justificación es fiel al chunk citado / total de opciones
descartadas por lenguaje; se acompaña del recuento bruto de descartes por lenguaje y se revisa periódicamente. Lista los
**falsos positivos**: opciones cuya justificación reproduce con fidelidad una frase del corpus del tipo "patients
should receive…" (soportada por el chunk citado) y se descartó solo por el término. Métrica informativa, sin meta
en el S1 (TBD-02): sirve para ver si "salidas prescriptivas = 0" se consigue a costa de vaciar el análisis y para
calibrar la lista de términos (L1D-193) o el prompt en US-072, nunca relajando RN-23.

## Dependencias y colaboradores

| Módulo | Nuevo/modifica | Depende de |
|---|---|---|
| `app/domain/claims.py` | nuevo | — (puro): `dividir_en_afirmaciones()` |
| `app/domain/support.py` | nuevo | — (puro): `verificar_soporte(opciones, limitaciones_propuestas, chunks, resultados_nli, umbral, verificador_terminos)` (RN-01), `soporta()`, `retirar_texto_prohibido()` (RN-23, literal de `[S1 resp. 16]`) |
| `app/application/ports.py` | modifica (L1D-164/L1D-106) | añade `NliClassifier` (Protocol) y `ProhibitedTermsChecker` (Protocol) |
| `app/application/rag_orchestrator_service.py` | modifica (L1D-106/L1D-275) | inserta la etapa de soporte tras `validar_citas()`; arma los pares, llama al puerto por lote y aplica `verificar_soporte()`; traduce el fallo a `NliNoDisponibleError` |
| `app/infrastructure/nli/` | nuevo | `FakeNliClassifier` (FX-06a-b) y `MdebertaNliClassifier` (L1D-102) |
| `app/infrastructure/lenguaje/` | nuevo | adapter de `ProhibitedTermsChecker`: carga la lista montada (`CLINICAL_CATALOG_PATH`), aplica `CAMPOS_GENERADOS` y delega en `check_prohibited_terms()` (L1D-193) |
| `app/api/rag_query.py` | modifica (L1D-164/L1D-106) | `NliNoDisponibleError` → `503 ErrorNliNoDisponible` |
| `app/bootstrap.py` | modifica (L1D-164) | enlace de `NliClassifier` (fake / real) y activación de producción de la rama con evidencia (L1D-275 D9) |
| `app/config/settings.py` | modifica (L1D-164) | `NLI_ENTAILMENT_THRESHOLD` |

El dominio no importa modelos ni E/S; el service recibe los puertos por constructor (sin contenedor de DI).

## Risks / Trade-offs

- [Segmentación ingenua de oraciones] → afirmaciones mal cortadas producen falsos "sin soporte"
  (falla cerrada, más descartes). Regla aislada en un método; la suite (US-072) medirá el efecto.
- [NLI multilingüe débil en mezcla es/en (hipótesis en español, premisa en inglés)] → lo mide L1D-102
  (exactitud por idioma); el umbral se recalibra en US-072.
- [Latencia: afirmaciones × chunks citados pares por consulta] → lote único por consulta; con 1 opción en
  el S1 el número de pares es pequeño.
- [Conflicto de merge en `rag_orchestrator_service.py`] → cada change toca solo su etapa; L1D-275 es
  dueño del orden de etapas.

## Migration Plan

Sin datos ni esquema. Rollback: revertir el PR; la composición de producción vuelve al `503` provisional
de L1D-106 (falla cerrada) según el plan de merge de L1D-275.

## Open Questions

- **Resuelta `[S1 resp. 12]` · mapeo en `clinical-api`:** `NLI_UNAVAILABLE` → `502 ERROR_SERVICIO_IA`,
  sin persistir y sin eco; lo implementa L1D-104.
- **Resuelta `[S1 resp. 16]` · retiro del texto prohibido:** literal fijo siempre (D4).
- **Resuelta `[S1 resp. 11]` · limitaciones del LLM:** no se generan en el S1; regla probada con un
  generador falso (D5).
- **Asumido (pendiente de confirmar) · varias citas** (D2): basta un chunk citado que implique la
  afirmación; un `contradiction` de otro chunk no la descarta.
- **Asumido · premisas de las limitaciones propuestas** (D5): todos los chunks entregados a la generación.

## Regresiones anotadas (no son escenarios de este change)

- Regresión [RN-01] afirmaciones sobre datos del paciente (verbalización + NLI, ADR-34) activa desde S2
  (resumen del caso, US-095) y S5 (aplicabilidad, US-123).
- Regresión [RN-01] afirmaciones de la síntesis activa desde S3 (FEAT-07) y supuestos/limitaciones de
  regla (US-129, US-130).
- Regresión [RN-24] un análisis previo nunca es premisa del NLI ni soporte, activa desde S4.
- Regresión [RN-15] `403` por opt-out activa desde S6 (US-148), en `clinical-api`.
