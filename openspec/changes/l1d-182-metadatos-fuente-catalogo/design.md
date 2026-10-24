# Design — l1d-182-metadatos-fuente-catalogo

## Context

Motivación en `proposal.md`. Estado observado en el código:

- `app/domain/citations.py` ya tiene `FichaDeFuente` (ausente = `None`) y `construir_cita()`, que copia los
  siete metadatos factuales de la ficha; `OpcionGenerada` solo guarda `chunk_ids_citados`, así que cualquier
  otro campo que el LLM ponga en la cita se pierde al parsear (RN-04, US-063).
- `infrastructure/catalog/catalogo_reader.py` (`ficha_de_fila`) convierte `""` en `None` para las columnas de
  texto (`_o_none`), pero `sample_size` pasa directo (un `0` sembrado por error llegaría como `0`; la columna
  es `INTEGER NULL`, `0` es un valor válido y se respeta).
- `authors` es siempre `None`: el catálogo no la registra (data-model §4.6).
- `clinical-api` trata `evidenceOptions` como JSON opaco: lo persiste en `AIAnalysisRecord` y lo devuelve
  con el mapper, sin tocar los campos de la cita.
- `apps/web/components/molecules/citation-details.tsx` muestra autores, diseño, fechas, idioma, licencia y
  fuente original con `valorONoDisponible()`; no muestra `trialPhase`, `primaryEndpoint`, `sampleSize` ni
  `guidelineVersion`.
- `studyPopulationValue` lo calcula `l1d-127-estado-criterio-estructurado` (`valor_del_estudio()` en
  `app/domain/applicability_rules.py`).

La historia es mayormente **fijar con tests** un comportamiento casi existente y cerrar el hueco de la UI.

## Goals / Non-Goals

**Goals:** pruebas de aceptación que conviertan RN-25 en contrato verificable en ambos backends y en el
panel; las filas que faltan en `CitationDetails`.

**Non-Goals:** columna de autoría, vigencia, nuevos metadatos en el catálogo, cambios del contrato.

## Decisions

- **D1 · Sin cambio de dominio salvo que un test lo exija.** `construir_cita()` ya copia los campos; los AC-1
  a AC-3 entran como tests de integración de `/rag/query` sobre el schema `corpus` real de test. Si algún AC
  pasa en verde al escribirse, el commit `test(L1D-182)` lo declara como regresión (no hay rojo posible sin
  romper código a propósito, y eso está prohibido); el Gate 2 lo acepta con esa nota. Descartado: reescribir
  `construir_cita` para "tener un rojo".
- **D2 · `null` en el dominio, "No disponible" solo en la UI.** El centinela vive en `messages/es.json`
  (`evidence.cita.noDisponible`) y en `valorONoDisponible()`; ni `FichaDeFuente` ni `CitaDelCorpus` ni el
  JSON persistido llevan texto sustituto (regla del S1, L1D-103).
- **D3 · `sampleSize` numérico se formatea en la UI.** `valorONoDisponible` acepta `string | null`; se añade
  una variante para `number | null` (o se convierte con `String()` antes) en `lib/evidence/procedencia.ts`,
  sin tratar `0` como ausente. Descartado: convertir a texto en el backend (cambiaría el contrato).
- **D4 · AC-2 con un generador falso nuevo, `LLM-METADATOS-FALSOS`**, en el `FakeEvidenceGenerator` de
  FX-06a-b: devuelve el JSON de generación con `sampleSize` y `trialPhase` dentro de la cita. Prueba el
  parseo real (el JSON del LLM pasa por el mismo camino que en producción) y no un objeto ya filtrado.
- **D5 · AC-4 por igualdad exacta de cadena** contra la fila sembrada de `doc-a1`, con un valor que tenga
  raya y tilde ("I–III") para detectar cualquier normalización Unicode o de mayúsculas. Se apoya en
  `valor_del_estudio()` de `l1d-127`; si ese change normaliza, este test lo rompe y manda RN-25.
- **D5b · Un solo requisito para `studyPopulationValue`** (decisión del usuario, 2026-10-24, `[S3 resp. 16]`).
  El requisito es de `l1d-127`; este change lo reescribe como `MODIFIED` en `applicability` con el texto de
  l1d-127 sin cambios y su escenario de US-122 AC-5, y añade solo el escenario de US-127 AC-4. Se archiva
  después de 127 → 128 → 129 → 130. Descartado: un requisito `ADDED` propio (duplicaba la regla).
- **D6 · Fixture de `doc-a3` y `doc-a1` con metadatos completos.** FX-08b-a (lo crea `l1d-127`, tarea 1.1)
  se amplía con columnas de diseño, fase, endpoint, tamaño, fechas y versión para `doc-a1` y con
  `primary_endpoint = NULL`, `sample_size = NULL` para `doc-a3`. Si `l1d-127` aún no está en `main`, el
  fixture se crea aquí con la misma forma y se concilia al rebasar.

## Dependencias y colaboradores

| Módulo | Cambio | Depende de |
|---|---|---|
| `rag-orchestrator/app/domain/citations.py` | sin cambio previsto (D1) | — (regla pura) |
| `rag-orchestrator/app/infrastructure/catalog/catalogo_reader.py` | sin cambio previsto; test de `sample_size = 0` ≠ `None` | motor SQLAlchemy con rol `rag_corpus` |
| `rag-orchestrator/app/evaluation/adaptadores_falsos.py` / FX-06a-b | escenario `LLM-METADATOS-FALSOS` | puerto del generador |
| `clinical-api/src/modules/evidence-analysis/*` | solo test de regresión | puerto `RagQueryPort` (MSW en el test) |
| `web/lib/evidence/procedencia.ts` | `valorONoDisponible` para números | `mensajes()` |
| `web/components/molecules/citation-details.tsx` | 4 filas nuevas | `procedencia.ts`, `mensajes()` |

No se extrae ninguna regla nueva; la regla RN-25 sigue en `construir_cita()` y en `valor_del_estudio()`.

## Componentes y patrones

`CitationDetails` (molécula, 69 líneas) crece en 8 líneas de `<dt>/<dd>`; queda bajo el umbral de 100. Sin
componentes nuevos ni patrones nuevos (YAGNI); sigue siendo el componente que ya era (lo monta el panel
cliente de `l1d-140`). Rótulos nuevos en `messages/es.json`: `evidence.cita.fase` "Fase del ensayo",
`endpoint` "Endpoint principal", `tamanoMuestra` "Tamaño de muestra", `versionGuia` "Versión de la guía".
Referencia: `docs/ux/sistema-de-diseno.md` (`CitationItem`: diseño, n, fecha… y "No disponible") y
`docs/ux/S1/pantallas-s1.md` (lista de la cita expandida). Desviación: `pantallas-s1.md` no enumera fase,
endpoint ni versión; se añaden a continuación de "Diseño del estudio" porque RN-25 y US-127 los exigen, sin
cambiar el resto del orden.

## Privacidad y ownership

- Solo cruzan fronteras metadatos públicos del corpus (`corpus_document`), de `rag-orchestrator` a
  `clinical-api` y de ahí a `web`. Ningún dato clínico ni identidad nueva; `rag-orchestrator` sigue leyendo
  únicamente el schema `corpus` con `rag_corpus` y no toca `clinical-minio`.
- Los logs no registran metadatos ni texto de chunks (sin cambio).
- **Seguridad web:** sin variables `NEXT_PUBLIC_` nuevas ni módulos `server-only` nuevos; los valores del
  corpus se renderizan como texto de React (sin `dangerouslySetInnerHTML`); sin impacto en CSP ni cabeceras;
  sin dependencias nuevas. Validación: los tipos vienen del cliente generado del contrato; no hay entrada del
  usuario nueva.

## Contratos

Proveedor `rag-orchestrator` (`/rag/query`) y `clinical-api` (`/platform/evidence-analyses`); consumidores
`clinical-api` y `web`. **Diff de `openapi.yaml`: ninguno.** `CitedSourceFields` ya declara `studyDesign`,
`trialPhase`, `primaryEndpoint`, `sampleSize`, `publishedAt`, `lastUpdatedAt`, `guidelineVersion` como
nullables, y `ApplicabilityCriterion.studyPopulationValue` como `[string, null]` (Pre-S1, US-033; compatible
con ADR-26). Ejemplos: si ningún ejemplo de `contracts/examples/` trae `primaryEndpoint = null` y
`sampleSize = null` en una cita, se añade un caso (respuesta `con_evidencia` con una cita de `doc-a3`) para
construir los handlers MSW del test de `clinical-api` y del panel; `contracts:check` lo valida. No aplica
`oasdiff` (sin cambio de schema).

## Evaluación

Sin cambio de modelo, prompt, umbral, catálogo real ni corpus: `run-ai-eval` no aplica. La calidad de los
metadatos del corpus real se mide en US-132 (L1D-244).

## Risks / Trade-offs

- [AC que pasan en verde al escribirse (D1)] → se documentan como regresión en el commit `test`; el valor está
  en impedir que FEAT-07/FEAT-09 rompan RN-25.
- [`l1d-127` cambia la forma de FX-08b-a] → este change se rebasa sobre él; la tarea del fixture nombra la
  conciliación.
- [El MODIFIED de `applicability` se desalinea si l1d-127 cambia el texto del requisito] → al rebasar, se copia
  de nuevo el texto vigente de l1d-127; orden de archivo 127 → 128 → 129 → 130 → 182.
- [`l1d-140` no archivado: `evidence-panel` aún no está en `openspec/specs`] → archivar `l1d-140` antes que
  este change (orden en `/sprint-close`).
