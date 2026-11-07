# Design — l1d-330-relative-end-day

## Context

Ver `proposal.md` (Why). `l1d-318` dejó probada en unitario la rama de intervalos de `filtrar_hechos_por_periodo`
(`HechoDelCaso.dia_relativo_fin`) pero `CaseFact` solo trae `relativeDay` (el inicio), así que en integración «la
quimioterapia que empezó antes del periodo queda fuera». Este change añade el fin al contrato, lo calcula en Backend 1 y
activa la rama en Backend 2.

## Goals / Non-Goals

**Goals:** `CaseFact.relativeEndDay` aditivo; cálculo determinista en Backend 1 con el ancla del día 0; activar la regla de
periodo en integración; mantener RN-11 (solo días relativos).

**Non-Goals:** cambiar el ancla del periodo; eventos con intervalo; tratamientos decididos; UI.

## Decisions

1. **Valores de `relativeEndDay` (Backend 1).** Solo para `prior_treatment` (único dato con intervalo en el contexto):
   - `endedAt` presente y confiable → entero, `diasEntre(fechaDelDiagnostico, endedAt)` (mismo ancla y función que
     `relativeDay`).
   - `ongoing = true` y `endedAt` ausente → **`null` explícito** (en curso).
   - `ongoing = true` **con** `endedAt` (dato incoherente) → gana la fecha documentada (entero).
   - `ongoing = false` sin `endedAt` (fin desconocido), sin fecha de diagnóstico, u otro tipo de hecho → el campo se **omite**.
   La serialización a Backend 2 debe conservar el `null` explícito (un test lo comprueba sobre el cuerpo enviado; con
   `undefined` el campo se omite). **Supuesto a validar (P-1):** «`null` = en curso solo con estado activo» de US-272 AC-2
   se implementa como `ongoing = true` sin fin, porque `PriorTreatment` no tiene `status`.
2. **Dónde vive el dato.** `EnlaceDeDato` (puerto interno de Backend 1, no viaja a Backend 2) gana `fechaFin?: string | null`
   y `enCurso?: boolean`; `clinical-context.builder.ts` los rellena al asignar el `dataRef` del tratamiento previo y
   `construirHechosDelCaso` los usa para calcular `relativeEndDay`. Ninguno de los dos campos nuevos se persiste ni se envía
   (la fecha absoluta de fin se queda en Backend 1, RN-11); un test comprueba que `patient_data_links` no los guarda.
3. **Backend 2, borde.** `traduccion.hechos_del_caso` pasa `relativeEndDay` a `HechoDelCaso.dia_relativo_fin` y fija
   `HechoDelCaso.en_curso = True` cuando el campo viene presente y es `null` (Pydantic: `"relativeEndDay" in
   model_fields_set and relativeEndDay is None`). El dominio no depende de Pydantic: solo ve `dia_relativo_fin` y
   `en_curso`. Por defecto `en_curso = False` (hecho puntual o fin no informado, el comportamiento de `l1d-318`).
   Alternativa descartada: un booleano `ongoing` en `CaseFact` (un campo más y otra decisión de contrato); si P-1 la
   cambia, esta decisión se reescribe.
4. **Regla de periodo (activa).** Con el periodo `[-N, 0]` (ancla del día 0, sin cambios): un hecho puntual entra si
   `dia ≥ -N`; con intervalo, si `fin ≥ -N`; en curso, siempre. Marcas fijas (constantes únicas en `domain/`): si empezó
   antes (`dia < -N`) se añade «(iniciado antes del periodo)» (la de `l1d-318`) y si está en curso, «(en curso)»; ambas
   pueden aplicar. Un hecho cuyo fin cae **antes** del periodo (`fin < -N`) no entra y no se marca: queda fuera del prompt
   y de los bloques (escenario ya existente de `l1d-318`). Sin periodo reconocido no se filtra ni se marca.
5. **`describir_hecho` y el intervalo.** La descripción (línea del prompt y premisa del NLI) añade «hasta N días antes del
   diagnóstico» (o «después» / «al momento del diagnóstico») cuando `dia_relativo_fin` es un entero, con la misma forma
   que `_momento_de`, de modo que el chequeo numérico de `l1d-318` reconoce la cifra. Para un hecho en curso no añade nada
   (el «(en curso)» lo da la marca del filtro cuando se pregunta por un periodo). La verbalización de Backend 1 y el bloque
   `documentado` (byte a byte, ADR-34) no cambian salvo por las marcas del filtro, que ya existen para el inicio.
6. **Periodo sin hechos.** Si el periodo deja sin hechos y el expediente tiene datos, el turno responde un único bloque
   `limitacion` de texto fijo desde `Settings` (`CHAT_SIN_DATOS_PERIODO_TEXTO` de `l1d-318`), sin LLM ni cita. El AC-4 de
   US-272 pide otra redacción: pendiente P-2 (mientras tanto, la de `l1d-318`).
7. **Coordinación con `l1d-319`.** Ambos tocan `conversation/hechos-del-caso.ts` y `application/chat/traduccion.py`: este
   change va antes (tiene contrato; L1D-319 no); si se paraleliza, L1D-319 se rebasa. Sin tareas compartidas.

## Contratos

Proveedor: `rag-orchestrator` (`CaseFact` en `ChatTurnRequest.caseFacts[]`; el schema **solo existe en el
`openapi.yaml` de rag**, no en el de clinical-api, verificado con `git grep`). Consumidor: `clinical-api` (cliente TS
generado de rag, `packages/api-contracts/`). `web` no usa el campo.

- **Qué cambia:** `CaseFact.relativeEndDay: integer | null`, **opcional** (no está en `required`), con descripción:
  «Día relativo al diagnóstico en que termina un hecho con intervalo; `null` = en curso; ausente = puntual o fin no
  informado». Aditivo (ADR-26): sin excepción, porque agregar una propiedad opcional a una **petición** no es un cambio
  incompatible de oasdiff.
- **Versiones (glosario S6 §1; «si una versión colisiona, se renumera el segundo en mergear»):** rag **1.13.0 → 1.14.0**.
  La 1.14.0 que el glosario reservaba a `l1d-320` (solo si quedaba algo propio) quedó libre: `l1d-320` mergeó sin subirla.
  **clinical-api no sube:** su `openapi.yaml` no contiene `CaseFact` ni cambia `ConversationDataLink`; la 1.30.0 que se
  había reservado **no se usa** (queda libre; main sigue en 1.29.0). `l1d-329` toma la siguiente menor libre de rag
  (esperada 1.15.0); si mergea antes que este change, este se renumera a 1.15.0. La tarea 1.1 dice «la siguiente menor
  libre» y se comprueba con `git fetch` antes del commit `contract(L1D-330)`.
- **Ejemplos** (uno por caso, glosario §3): se ajustan `contracts/examples/chat-turn-request-caso-periodo.json` (la
  quimioterapia con `relativeDay −160` y `relativeEndDay −60`) y `chat-turn-caso-periodo.json` (la respuesta con la
  quimioterapia rotulada «(iniciado antes del periodo)»); nuevo `chat-turn-request-caso-en-curso.json` y
  `chat-turn-caso-en-curso.json` (`relativeEndDay: null`, rótulo «(en curso)»). Ningún change amplía el fichero de otro:
  se editan los de `l1d-318` porque este change es quien cambia su comportamiento (se anota en el PR).
- Pydantic y TS se generan; nunca a mano.

## Privacidad y ownership

- Cruza `clinical-api → rag-orchestrator` solo un entero relativo o `null` (RN-10, RN-11): la fecha absoluta de fin
  (`endedAt`) se queda en Backend 1, en `EnlaceDeDato`, y no va al prompt, a los *logs*, al estado del hilo ni a la
  rehidratación. Los *logs* de rag no registran la verbalización ni el día de fin, solo conteos.
- `rag-orchestrator` no toca datos clínicos ni `clinical-minio`; no persiste nada (US-259 AC-8).
- La rehidratación sigue en su lista blanca: no gana `relativeEndDay` (se reconstruye de `caseFacts` en cada turno).

## Evaluación

No cambia prompt, modelo, umbral, catálogo ni corpus: sin `run-ai-eval`. El texto de la descripción de hechos entra al
prompt del nodo `caso` (hecho con intervalo); el LLM no escribe ni las marcas ni el intervalo, y las suites de `l1d-326`
(US-269) medirán el comportamiento.

## Risks / Trade-offs

- [Un `null` implícito (campo omitido por `undefined`) se lee como puntual y el tratamiento activo desaparece de nuevo] →
  test del cuerpo enviado con `"relativeEndDay": null` y ejemplo explícito.
- [`ongoing = true` sin que el tratamiento siga realmente vigente (dato obsoleto)] → el hecho aparece «(en curso)» según
  el dato documentado; un dato sin verificar conserva su `reviewStatus`; es una limitación del expediente, no de la regla.
- [Ancla del día 0] → una quimioterapia activa «en los últimos 100 días» desde hoy y desde el diagnóstico pueden diferir;
  pendiente de revisar en la Demo 6 (decisión del PO).
- [Dos changes sobre `hechos-del-caso.ts`] → orden en O5 (330 antes de 319).
