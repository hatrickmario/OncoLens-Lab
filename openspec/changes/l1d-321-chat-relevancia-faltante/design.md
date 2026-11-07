# Design — l1d-321-chat-relevancia-faltante

## Context

US-264 (capacidad B del chat): tras el turno de faltantes, el oncólogo pregunta «¿Por qué importa el estado
menopáusico?». El grafo (`l1d-316-chat-turn-langgraph`) y el nodo `faltantes` con `gapType` (`l1d-320-faltantes-tipo-vacio`)
son prerrequisitos; este change añade la subintención `relevancia`.

Lo que ya existe en `main`:
- `packages/clinical-catalogs/mama/{datos-criticos,aplicabilidad,sinonimos}.json` montados en Backend 2
  (`CLINICAL_CATALOG_PATH`); `app/domain/catalogo.py` y `app/infrastructure/catalogo_clinico/sinonimos.py` los leen.
- Recuperación con umbral y segundo loop de reescritura (`app/domain/reescritura.py`, `RAGOrchestratorService`).
- `app/domain/citations.py`, `app/application/verificacion_de_soporte.py` (`VerificadorDeSoporte`: NLI + saneamiento) y
  `app/domain/lenguaje.py` (`check_prohibited_terms`, lista `lenguaje/terminos-prohibidos.json`).
- `app/domain/claims.py` (afirmaciones atómicas, US-245).

**Catálogo vigente (decidido en el Gate 1):** en `mama/aplicabilidad.json` (1.1.0) el criterio `estado_menopausico` tiene
el mismo `destination` que el ítem `estado_menopausico` de `datos-criticos.json` (`ClinicalAttribute.value`,
`attribute_key = estado_menopausico`); AC-1 usa ese dato real. Ningún criterio tiene como `destination` el biomarcador
Ki-67: se cubre con un escenario propio cuyo bloque `catalogo` dice, con texto fijo, que es dato crítico sin criterio de
aplicabilidad en el catálogo. No se crea catálogo de test ni se cambia el catálogo real.

## Goals / Non-Goals

**Goals:** identificar el dato crítico preguntado sin LLM; bloque `catalogo` determinista; consulta al corpus por el
pipeline existente; validación cita-del-turno + términos prohibidos + NLI; `omittedClaims`; prompt `chat-relevancia@0.1.0`.

**Non-Goals:** `gapType` y catálogo 1.6.0 (US-263); UI; suite del chat (US-269); explicar datos fuera del catálogo.

## Decisions

1. **Identificación del dato por regla pura** `identificar_dato_critico(pregunta, items, sinonimos) -> ItemCritico | None`
   en `app/domain/chat/relevancia.py` (NFC + `normalizar_texto` de `lenguaje.py`, etiquetas `es`/`en` y sinónimos del
   catálogo del tipo de cáncer). Nunca el LLM: el catálogo manda (RN-29, RN-27). `None` → AC-5.
2. **Criterios del bloque `catalogo` por cobertura de `destination`** (`entity`, `field`, `match`) entre el ítem de
   `datos-criticos.json` y los de `aplicabilidad.json`: `criterios_que_usan(item, aplicabilidad)`. Es la única relación
   explícita entre los dos ficheros; no se añade un campo nuevo al catálogo (no sube `CLINICAL_CATALOG_VERSION`). Se
   descarta comparar por `key` (las claves difieren: `re` frente a `receptores_hormonales`).
   **Desviación en la implementación (igualdad estricta → cobertura):** con igualdad estricta, `re`/`rp` (criterio
   `receptores_hormonales` con `name: [RE, RP]`), `her2_ihq`/`her2_ish` (criterio `estado_her2` sin la prueba en `match`) y
   `ecog` (criterio con `performance_scale` que el ítem no repite) saldrían «sin criterio», una afirmación falsa frente al
   catálogo. La regla es: misma entidad; mismo campo (un ítem sin campo cubre cualquiera); y en las claves de `match` que
   ambos nombran, los valores del ítem están entre los del criterio. Ki-67 y menopausia dan el mismo resultado que con
   igualdad (sin criterio y `estado_menopausico`).
3. **Consulta al corpus**: `"{label.es} {cancerType}"` por la recuperación existente con el mismo umbral y el único bucle
   de reescritura (US-238); sin chunks → respuesta sin LLM de generación (RN-02), `top_relevance_score = null`.
4. **Validación por el camino existente, sin copia**: el nodo arma afirmaciones atómicas y las pasa, en este orden, por
   `afirmacion_tiene_soporte_del_turno()` (de `l1d-316`, RN-04/RN-24), `check_prohibited_terms` (RN-23) y el
   `VerificadorDeSoporte` (NLI, RN-01). Cada descarte suma 1 a `omittedClaims`; una afirmación descartada antes del NLI no
   llega al NLI.
5. **Textos fijos** («La evidencia recuperada no explica la relevancia de este dato», «no es un dato crítico del catálogo
   vigente», «ningún criterio de aplicabilidad del catálogo vigente usa este dato», aviso «sin evidencia») en `Settings`
   como literales de configuración, igual que el aviso RN-19.
6. **Aviso de «sin evidencia» (AC-3)**: viaja en `notices[]` (texto fijo de `Settings`, sin punto final), no como bloque
   `limitacion`, para que el turno quede «solo con el bloque `catalogo` y el aviso» como dice el spec. P-3: si la UI
   prefiere un bloque `limitacion`, es un cambio de una línea en el nodo.
7. **Tipos de bloque (glosario §3)**: lo que sale del catálogo es `kind = "catalogo"` (determinista, exento de cita); la
   explicación de «por qué importa» generada por el LLM es `kind = "evidencia"`, con ≥ 1 `ChatCitation` y NLI, y sin
   soporte se omite; los textos fijos de ausencia son `kind = "limitacion"` (deterministas, exentos). Backend 2 rellena
   `notices[]`.

Alternativa de fondo (LLM libre frente a limitado al catálogo y evidencia) ya decidida `[S6 resp. 7]`; no se reabre.

## Privacidad y ownership

- **clinical-api → rag-orchestrator** (JWT de servicio): pregunta enmascarada (ADR-40), `completeness[]` y contexto
  desidentificado ya definidos por `l1d-316`/US-263. Este change no añade campos de paciente.
- **rag-orchestrator**: solo lee el catálogo montado de solo lectura, el schema `corpus` y Milvus; no toca datos clínicos
  ni `clinical-minio`; no persiste nada del paciente (ADR-51, US-259 AC-8). Solo LLM local (RN-12).
- La consulta al corpus solo lleva la etiqueta del catálogo y el tipo de cáncer: ningún dato del paciente.
- Logs: `traceId`, clave del ítem, conteos de omisiones; nunca la pregunta ni el texto generado.

## Contratos

Proveedor: `rag-orchestrator` (`POST /chat/turn`, de `l1d-316`); consumidor: `clinical-api`. **Sin diff** del
`openapi.yaml`: se usan `ChatBlock.kind ∈ {catalogo, evidencia, limitacion}`, `ChatBlock.citations[]`, `omittedClaims`
y `notices[]` del contrato **1.12.0** de `l1d-316`. **No sube versión** (glosario S6 §1): consume el contrato de
`l1d-316` 1.12.0; no comprueba ni añade campos.

Ejemplos nuevos (FX-12-e), base de MSW/`respx`:
`contracts/examples/chat-turn-relevancia-ok.json`, `chat-turn-relevancia-sin-soporte.json`,
`chat-turn-relevancia-sin-evidencia.json`, `chat-turn-relevancia-fuera-de-catalogo.json`,
`chat-turn-relevancia-sin-criterio.json` (Ki-67). Pydantic y TS se generan del
spec. oasdiff: sin cambios.

## Dependencias y colaboradores

- `app/domain/chat/relevancia.py` (nuevo, puro): `identificar_dato_critico()`, `criterios_que_usan()`,
  `bloque_de_catalogo()`.
- `app/application/chat/nodo_faltantes.py` (modificado, de `l1d-320`): rama `relevancia`, que delega en
  `app/application/chat/capacidades/relevancia_del_dato.py` (`NodoRelevancia`, nuevo); recibe por constructor los puertos de
  recuperación, LLM, NLI (vía `RecuperadorDeEvidencia`) y `DatosDeRelevancia` (catálogo), nunca adapters concretos. Sin
  corpus detrás no se inyecta y `faltantes` verbaliza como antes. `DatosCriticosDelCatalogo` expone el `destination` de cada
  ítem y `DatosDeRelevanciaDelCatalogo` compone los tres lectores del catálogo.
- La consulta al corpus usa un contexto clínico sin ningún dato del paciente (solo el tipo de cáncer): el resumen del
  contexto también se embebe (RN-11).
- `app/domain/chat/enrutado.py` (de `l1d-316`): patrones «por qué importa / para qué sirve / qué relevancia tiene» →
  `faltantes` con subintención `relevancia` (un solo dueño de los patrones).
- `app/prompts/chat_relevancia.py` (nuevo): `chat-relevancia@0.1.0`, instrucciones en sistema y chunks delimitados con
  el `PromptBuilder` de `l1d-108-prompt-instrucciones-datos`; sin datos del paciente.
- Fakes tocados: LLM falso (respuestas `CHAT-RELEVANCIA-*`) y NLI falso; su test de contrato vive en
  `apps/rag-orchestrator/tests/contract/` junto al del adapter real.

## Evaluación

Prompt nuevo `chat-relevancia@0.1.0`: suite `evaluate` en el PR (OL-06) con `eval/configs/rn23-local.yaml --suite all`
y `eval/configs/s5.yaml --suite opciones`. Métricas: fidelidad ≥ 0,90, precisión de citas ≥ 0,90, «sin evidencia»
≥ 0,90, salidas prescriptivas = 0 (RN-23). El caso AC04 del chat se mide en US-269.

## Pendientes de definir (para `/sprint-start`)

- **P-2 · Texto de AC-5** (asumido en el backlog): el literal exacto vive en `Settings`; lo valida el humano.

## Risks / Trade-offs

- [Sinónimos insuficientes] → una pregunta con otra grafía cae en AC-5; visible y se amplía en el catálogo.
- [Depende de `l1d-320`] → rebasar tras su merge; el nodo `faltantes` lo define ese change.
- [NLI estricto omite explicaciones correctas] → visible en `omittedClaims`; se calibra en US-269.
