# Design — l1d-317-chat-caso-situacion

## Context

US-260 (capacidad A del chat): el oncólogo pregunta por la situación o la evolución de su paciente y recibe bloques
enlazados a los datos y verificados. El grafo (`l1d-316-chat-turn-langgraph`) y la conversación persistida (`l1d-315-conversacion-paciente`) son prerrequisitos; este change rellena el nodo `caso` y la construcción de `caseFacts`.

Lo que ya existe en `main`:
- `apps/clinical-api/src/modules/evidence-analysis/analysis-basis.verbalizacion.ts`: `verbalizarDatoDelContexto()`,
  verbalización determinista de diagnóstico, biomarcador, atributo, tratamiento y evento (ADR-34).
- `clinical-context.builder.ts` y `deidentification/`: contexto desidentificado con meses/días relativos (US-049).
- La vista de caso (`GET …/case`) ya excluye `rechazado` y `reemplazado` (`case-timeline`).
- `apps/rag-orchestrator/app/application/verificacion_de_soporte.py` y el puerto NLI; formato de afirmaciones atómicas
  de US-245.

## Goals / Non-Goals

**Goals:** `caseFacts[]` desidentificado con `factRef` opaco; nodo `caso` con validación «≥ 1 `factRef` válido + NLI»;
`dataLinks` resueltos solo en Backend 1 y ordenados por día relativo; prompt `chat-caso@0.2.0`.

**Non-Goals:** `…/case-summary`; US-261, US-262; faltantes y evidencia; UI; suite `evaluate` del chat (US-269).

## Decisions

1. **`factRef` opaco por turno (`f1…fn`) y tabla en Backend 1.** El LLM solo ve `factRef`, verbalización y día relativo.
   Backend 1 traduce `factRefs → dataLinks` con la fecha absoluta del registro. Descartadas: enviar UUID de recursos
   (fuga de identificadores, RN-11) y pedir al LLM la fecha (no verificable).
2. **Verbalización en código: reutilizar `verbalizarDatoDelContexto()`** (regla de un solo dueño, **decidido** en el
   Gate 1). Se amplía para el valor de serie y el día relativo en un único sitio; `l1d-318` y `l1d-319` usan la misma
   función. El Contexto técnico de US-260 decía «plantillas en `packages/clinical-catalogs/`», pero la verbalización
   ADR-34 vive en código y `plantillas.json` es de preguntas; moverla al catálogo duplicaría la regla y obligaría a subir
   `CLINICAL_CATALOG_VERSION`.
3. **Orden de evolución determinista en Backend 1** (AC-6): los `dataLinks` de una misma serie se ordenan por día
   relativo ascendente al construir la respuesta; nunca se confía en el orden que devuelve el LLM.
4. **Validación en dos pasos en el dominio de Backend 2**: `filtrarAfirmacionesSinEnlace()` (no llega al NLI) y luego la
   verificación NLI existente contra la concatenación de verbalizaciones de los `factRefs` citados. Ambas suman a
   `omittedClaims`. Una afirmación respaldada solo por memoria (RN-24) ya la cubre `l1d-316` (AC-7 de US-259).
5. **Bloques `documentado`**: el nodo `caso` emite bloques `kind=documentado` (enum cerrado de `l1d-316`), cada uno con
   ≥ 1 `factRef` válido. Backend 1 resuelve cada `factRef` a un `ConversationDataLink` del turno.
6. **Avisos en Backend 2**: `avisos_del_turno(settings, intencion)` rellena `notices[]` con los literales de RN-19 (sin punto
   final, igual que en configuración) y, **solo en la intención `caso`**, «Verifique contra las fuentes»
   (`CHAT_NOTICE_VERIFY`; el PRD lo reserva a los datos del paciente y sus fuentes). Las demás intenciones conservan los dos
   avisos de L1D-316. Backend 1 los persiste tal cual y la UI solo los pinta (glosario §3).
7. **LLM caído**: el nodo propaga el error tipado del adapter local; Backend 1 lo traduce a `503` sin persistir
   (comportamiento de US-258 AC-7). Sin *fallback* de nube (RN-12).

Alternativas: la decisión cara (LLM + verificación frente a resumen determinista) ya la tomó el usuario `[S6 resp. 3]`;
no se reabre.

## Privacidad y ownership

- **web → clinical-api**: pregunta del oncólogo (sesión opaca). Sin cambios en `web` en este change.
- **clinical-api → rag-orchestrator** (JWT de servicio): pregunta enmascarada (ADR-40), `caseFacts[]` con `factRef`
  opaco, verbalización y día relativo; sin identidad, sin texto libre sin enmascarar, sin UUID ni fechas absolutas
  (RN-10, RN-11). El texto libre de notas solo viaja enmascarado o no viaja (minimización vigente de `deidentification`).
- **rag-orchestrator**: procesa en memoria dentro del hilo efímero de ADR-51; no toca schemas clínicos ni
  `clinical-minio`; no persiste `caseFacts` (invariante de US-259 AC-8). Solo LLM local (RN-12).
- **Retorno**: Backend 2 devuelve afirmaciones con `factRefs`; Backend 1 resuelve `dataLinks` y persiste el turno antes
  de responder (RN-06).
- Logs: sin verbalizaciones ni preguntas; solo `traceId` y conteos.

## Contratos

Proveedores: `rag-orchestrator` (`/chat/turn`, contrato **1.12.0** de `l1d-316`) y `clinical-api` (`ConversationTurn`,
contrato **1.24.0** de `l1d-315`). Consumidores: `clinical-api` y `web` respectivamente. Este change **no crea endpoints,
no cambia esquemas y no sube versión** (glosario S6 §1): consume el contrato de `l1d-316` 1.12.0 y el de `l1d-315` 1.24.0.

Nombres del glosario que usa (sin redefinirlos):

- `CaseFact`: `factRef` (`^f[0-9]+$`), `kind`, `verbalization`, `relativeDay` (entero o `null`; `null` = sin fecha
  confiable, nunca `0`), `reviewStatus`, `seriesKey?`.
- `ChatBlock`: `kind` del enum cerrado de 8 valores (aquí solo `documentado`), `text`, `factRefs?`.
- `ConversationDataLink`: `{ factRef, resourceType, resourceId, origin, relativeDay|null, recordedDate|null }`, solo
  hacia el navegador; `recordedDate` sale del registro de Backend 1, nunca del LLM.

Ejemplos: un fichero por caso. Este change añade `contracts/examples/chat-turn-caso-situacion.json` (respuesta
validada de `CHAT-CASO-OK`); `chat-turn-caso-ok.json` es de `l1d-316`. `CHAT-CASO-INVENTA` y `CHAT-CASO-SIN-ENLACE` son
salidas del LLM previas al filtro, no respuestas del contrato: viven como fixtures del LLM falso en
`apps/rag-orchestrator/tests/fixtures/llm/chat-caso-inventa.json` y `chat-caso-sin-enlace.json`.

## Dependencias y colaboradores

- `clinical-api` (estado final): se **extiende el constructor de L1D-315** (`conversation/hechos-del-caso.ts`:
  `construirHechosDelCaso`, con `seriesKey` sin separadores y `corrected`); no hay `case-facts.builder.ts` ni `data-links.ts`
  (existieron en un commit intermedio de esta rama y se consolidaron en el de 315). El orden por día relativo es
  `ordenarPorDiaRelativo()` en `conversation.reglas.ts` (lo aplica `enlacesDelTurno`). `clinical-context.builder.ts` gana
  `construirContextoDelChat()` (serie completa de cada biomarcador) junto a `construirContextoPermitido()` (último valor,
  análisis) y un único `compararBiomarcadores()`.
- `rag-orchestrator`: `application/chat/capacidades/caso.py` (`NodoCaso`, sobre los puertos LLM y NLI; se inyecta en
  `construir_grafo(capacidades=...)`); `grafo.py` expone `pedir_afirmaciones()` (etapa de generación común al esqueleto y a
  los nodos); `domain/chat/descripcion_de_hechos.py` (`describir_hecho`, `describir_hechos`, `es_la_descripcion_de`);
  `domain/chat/enlaces_del_caso.py` con `filtrar_afirmaciones_sin_enlace()` y `ordenar_series_por_dia_relativo()` (reglas
  puras, RN-01/AC-T1.2); `prompts/chat_caso.py` (`chat-caso@0.2.0`, instrucciones en sistema y datos delimitados con el
  `PromptBuilder` de `l1d-108-prompt-instrucciones-datos`; su test de arquitectura y el *helper*
  `tests/support/prompt_separado.py` lo verifican).
- Fakes tocados: LLM falso (respuestas `CHAT-CASO-*`, `LLM-CAIDO`) y NLI falso; su test de contrato vive con el de cada
  adapter en `apps/rag-orchestrator/tests/contract/` (mismos errores que el adapter real).

## Evaluación

Prompt nuevo `chat-caso@0.2.0` (0.1.0 no sobrevivió a la primera medición: el NLI real rechazaba la mayoría de las afirmaciones, ver D8): suite `evaluate` en el PR (OL-06). Métricas: fidelidad ≥ 0,90, salidas prescriptivas
= 0 (RN-23), PII ≥ 0,95 (no fuga en `caseFacts`). La suite específica del chat AC01 se mide en US-269.

## Risks / Trade-offs

- [Contexto de 8192 tokens] → `caseFacts` del paciente semilla cabe; si un caso crece, se trunca por prioridad en una
  historia posterior (no en el MVP sintético).
- [Dependencia de tres changes previos (`l1d-108`, `l1d-315`, `l1d-316`)] → rebasar tras su merge; el contrato ya está
  fijado por el glosario, así que no hay commit de esquema propio.
- [NLI estricto omite afirmaciones correctas] → visible en `omittedClaims`; se calibra en US-269 (umbral en config).

## Decisiones del Gate 2 (vuelta 1)

8. **Una sola descripción del hecho, premisa y línea del prompt (`describir_hecho`).** La corrida real mostró que el NLI
   (mDeBERTa, umbral 0,7) no sostiene cifras desnudas ni fragmentos cortos, y que la premisa (solo la verbalización) no contenía
   lo que el prompt pedía escribir (día relativo, estado de revisión). Ahora `describir_hecho(h)` produce una frase completa
   («CA 15-3: 22 U/mL, normal, 30 días después del diagnóstico.») y es el único dueño de (1) la línea `[fN] …` del prompt y
   (2) la premisa del NLI (`describir_hechos`). El enum crudo de revisión nunca llega al texto. **`auto_aceptado` NO cuenta
   como «sin verificar»**: solo `requiere_revision` escribe «requiere revisión» y un conflicto vigente «en conflicto con otro
   dato»; `verificado`, `corregido` y `auto_aceptado` no añaden nada. Un `relativeDay` `null` se escribe «sin fecha confiable»,
   nunca «día 0».
9. **Atajo lógico por identidad (ADR-34).** Una afirmación idéntica (NFC, espacios, mayúsculas y punto final normalizados) a la
   concatenación de las descripciones de sus `factRefs` queda soportada sin invocar al NLI: identidad implica entailment. Toda
   paráfrasis sigue pasando por el NLI contra esa misma descripción; una con dato inventado se omite. Los tests de integración
   usan un NLI falso en `neutral` por defecto (lo que haría el real con frases cortas) para que un desajuste entre prompt y
   premisa no quede oculto.
10. **Forma de afirmación.** Antes del NLI, `validar_forma_de_afirmacion` (`domain/atribucion.py`) descarta lo que excede
    `claim_max_words`, trae modal normativo o artefactos; una hipótesis larga haría fallar cerrado al NLI real.
11. **NLI caído = `503 LOCAL_LLM_UNAVAILABLE`.** El contrato de `/chat/turn` solo declara ese 503 y `LLM_OUTPUT_INVALID`; añadir
    `NLI_UNAVAILABLE` exige tocar el contrato rag 1.12.x. Se mantiene el 503 de LLM local (el verificador forma parte de los
    modelos locales). Un `NLI_UNAVAILABLE` propio queda como deuda de contrato (nota, sin checkbox).
12. **`corrected` y el seam de las capacidades.** `CaseFact.corrected` es un campo para la UI y la evaluación; el prompt y el NLI
    no lo usan. Las capacidades se inyectan en `construir_grafo(capacidades=...)` desde `ChatTurnService`; L1D-318…322 añaden su
    nodo ahí (el NLI llega de `bootstrap` como `soporte`).
13. **Ejemplos.** `chat-turn-request-caso-situacion.json` se regeneró desde `construirHechosDelCaso` (orden cronológico y
    verbalización con `clinicalSignificance`); `chat-turn-caso-ok.json` (de L1D-316) cambia solo el texto de sus bloques (las
    frases canónicas) y gana el tercer aviso porque es de la intención `caso`; los demás ejemplos siguen con dos avisos.
