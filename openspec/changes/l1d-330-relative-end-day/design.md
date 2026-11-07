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
   - `endedAt` presente → entero, `diasEntre(fechaDelDiagnostico, endedAt)` (mismo ancla y función que `relativeDay`).
   - `ongoing = true` y `endedAt` ausente → **`null` explícito** (en curso). «Activo» = exactamente esto (decidido, usuario,
     2026-11-06); no hay campo nuevo en `CaseFact`.
   - `ongoing = true` **con** `endedAt` (dato incoherente o con fecha incierta) → **gana la fecha** (entero), aunque la fecha
     sea incierta; el hecho conserva su `reviewStatus` y no se marca «en curso».
   - `ongoing = false` **sin** `endedAt` (fin desconocido), sin fecha de diagnóstico, u otro tipo de hecho → el campo se **omite**.
   La serialización a Backend 2 debe conservar el `null` explícito (un test lo comprueba sobre el cuerpo enviado; con
   `undefined` el campo se omite). **Decidido (usuario, 2026-11-06):** «estado activo» de US-272 AC-2 es `ongoing = true`
   sin fin, porque `PriorTreatment` no tiene `status`.
2. **Dónde vive el dato.** `EnlaceDeDato` (puerto interno de Backend 1, no viaja a Backend 2) gana `fechaFin?: string | null`
   y `enCurso?: boolean`; `clinical-context.builder.ts` los rellena al asignar el `dataRef` del tratamiento previo y
   `construirHechosDelCaso` los usa para calcular `relativeEndDay`. Ninguno de los dos campos nuevos se persiste ni se envía
   (la fecha absoluta de fin se queda en Backend 1, RN-11); un test comprueba que `patient_data_links` no los guarda.
3. **Backend 2, borde.** `traduccion.hechos_del_caso` pasa `relativeEndDay` a `HechoDelCaso.dia_relativo_fin` y fija
   `HechoDelCaso.en_curso = True` cuando el campo viene presente y es `null` (Pydantic: `"relativeEndDay" in
   model_fields_set and relativeEndDay is None`); un test pasa el **JSON crudo** (campo `null`, ausente y entero) por
   `TestClient` y `respx`, porque un modelo ya construido no distingue ambas formas. El dominio no depende de Pydantic: solo ve `dia_relativo_fin` y
   `en_curso`. Por defecto `en_curso = False` (hecho puntual o fin no informado, el comportamiento de `l1d-318`).
   Alternativa descartada por el usuario (2026-11-06): un booleano `ongoing` en `CaseFact` (un campo más y otra decisión
   de contrato).
4. **Regla de periodo (activa).** Con el periodo `[-N, 0]` (ancla del día 0, sin cambios): un hecho puntual entra si
   `dia ≥ -N`; con intervalo, si `fin ≥ -N`; en curso, siempre. Marcas fijas (constantes únicas en `domain/`): si empezó
   antes (`dia < -N`) se añade «(iniciado antes del periodo)» (la de `l1d-318`) y si está en curso, «(en curso)»; ambas
   pueden aplicar. Un hecho cuyo fin cae **antes** del periodo (`fin < -N`) **se excluye sin marca** (decidido, usuario,
   2026-11-06): queda fuera del prompt y de los bloques. Sin periodo reconocido no se filtra ni se marca. Si un hecho «en
   curso» tiene `reviewStatus = requiere_revision`, `notices[]` añade un aviso fijo de «sin verificar» (constante en
   `domain/chat/mensajes.py`; RN-26: informa, no bloquea). El bloque `limitacion` fijo «Periodo medido desde la fecha del diagnóstico» (constante única en `mensajes.py`, no
   calibrable; exento de cita, glosario §3) se emite **solo cuando algún hecho entró o se excluyó por la rama de intervalo**
   (es decir, algún `CaseFact` trae `relativeEndDay`, entero o `null`), de modo que los turnos de periodo sin intervalo, como
   `contracts/examples/chat-turn-caso-periodo.json` de `l1d-318`, **no cambian**.
5. **`describir_hecho` y el intervalo.** La descripción (línea del prompt y premisa del NLI) añade «hasta N días antes del
   diagnóstico» (o «después» / «al momento del diagnóstico») cuando `dia_relativo_fin` es un entero, con la misma forma
   que `_momento_de`, de modo que el chequeo numérico de `l1d-318` reconoce la cifra. Para un hecho en curso no añade nada
   (el «(en curso)» lo da la marca del filtro cuando se pregunta por un periodo). La verbalización de Backend 1 y el bloque
   `documentado` (byte a byte, ADR-34) no cambian salvo por las marcas del filtro, que ya existen para el inicio.
6. **Sin datos (AC-4, decidido 2026-11-06).** Dos casos, ambos con un único bloque `limitacion` fijo de `Settings`, sin LLM
   ni cita: (a) **sin datos en absoluto** → «No se encontró información documentada sobre lo preguntado en el expediente»
   (`CHAT_SIN_DATOS_TEXTO`); (b) **sin datos en el periodo pero con datos fuera de él** → el texto de `l1d-318`
   (`CHAT_SIN_DATOS_PERIODO_TEXTO`). Se conserva el texto de `l1d-318`; el AC-4 de US-272 se enmienda para citar ambos.
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
- **Versiones (glosario S6 §1; «si una versión colisiona, se renumera el segundo en mergear»):** rag toma «la siguiente
  menor libre respecto de `main`». Orden de merge esperado: `l1d-323` (1.14.0) → este change (1.15.0) → `l1d-329`
  (1.16.0). **clinical-api no sube:** su `openapi.yaml` no contiene `CaseFact` ni cambia `ConversationDataLink`. La
  tarea 1.1 comprueba con `git fetch` el número libre antes del commit `contract(L1D-330)`; si `l1d-329` mergea antes,
  este change se renumera. El segundo en mergear rebasa y regenera `packages/api-contracts/`, nunca a mano.
- **Ejemplos** (uno por caso, glosario §3; **no se editan los de `l1d-318`**, el glosario §3 los lista para este change):
  nuevos `contracts/examples/chat-turn-request-caso-intervalo.json` y `chat-turn-caso-intervalo.json` (quimioterapia
  `relativeDay −160`, `relativeEndDay −60`, rotulada «(iniciado antes del periodo)», con el bloque «Periodo medido desde la
  fecha del diagnóstico», que solo aparece porque el hecho lleva `relativeEndDay`), y `chat-turn-request-caso-en-curso.json` y `chat-turn-caso-en-curso.json`
  (`relativeEndDay: null`, rótulos «(iniciado antes del periodo)» y «(en curso)», más el aviso de «sin verificar» si el hecho
  está en `requiere_revision`). Los ejemplos de periodo de `l1d-318` siguen sin `relativeEndDay` y su comportamiento (campo
  ausente) no cambia.
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
- [`ongoing = true` con una `endedAt` incierta: gana la fecha; si la fecha es errónea el hecho puede salir del periodo] →
  el hecho conserva su `reviewStatus` y el aviso de «sin verificar» lo hace visible; limitación del expediente.
- [`ongoing = false` sin `endedAt` (fin desconocido): el campo se omite y el hecho puntual de inicio antes del periodo no
  entra, como en `l1d-318`] → declarado; el oncólogo ve la regla en el bloque «Periodo medido desde la fecha del diagnóstico».
- [Dos changes sobre `hechos-del-caso.ts`] → orden en O5 (330 antes de 319; el change de `l1d-319` cita `case-facts.builder.ts`,
  que ya no existe: el archivo es `hechos-del-caso.ts`).
