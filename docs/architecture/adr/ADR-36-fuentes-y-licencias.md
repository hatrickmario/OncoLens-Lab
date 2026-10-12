# ADR-36 — Fuentes y licencias del corpus científico

> Linear: [L1D-50](https://linear.app/l1der-lab-mjbc/issue/L1D-50) · Historia: US-007 · ADR-36 (FEAT-00, Pre-S1)

- **Estado:** Aceptada (Pre-S1, 2026-10-09). Firma: usuario (PO), en calidad académica `[Pre-S1 resp. 8]`. Se revisa antes de G-Piloto (S6).
- **Decisores:** usuario (PO). Investigación: Ingeniería, con consultas a las fuentes oficiales hechas el 2026-10-09.
- **Requisitos:** FR-19, RN-21, RN-22, RN-25, TBD-04, M-08.3, SUP-3, PREG-1, D-09.

## Contexto

La **regla de licencias ya está decidida** (readme §3.3 #36) y no se reabre: se aceptan dominio público, CC BY y CC BY-SA. CC BY-NC solo se admite en el MVP académico, y marcada. Quedan excluidas las licencias ND y la "libre lectura" sin licencia. Este ADR fija tres cosas: la **lista de fuentes**, la regla para los **resúmenes de PubMed** sin licencia explícita y la **cobertura** frente a M-08.3.

Dos hechos de la investigación del 2026-10-09 condicionan la decisión:

1. **PMC eliminó `oa_file_list` y los paquetes masivos** en la semana del 2026-08-24. La licencia de cada artículo ya no se lee de un listado global: está en el JSON de metadatos de cada versión, en el bucket S3 `pmc-oa-opendata`, o en el campo `<dc:rights>` de OAI-PMH.
2. **Ninguna fuente de texto publica metadatos de población estructurados.** ClinicalTrials.gov es la excepción, y solo con edad, sexo y voluntarios sanos; el estadio y los biomarcadores van en texto libre. Por tanto, la meta de M-08.3 (≥ 90 %) solo se alcanza **curando** esos metadatos en el catálogo del corpus.

## Fuentes evaluadas

| Fuente | Licencia observada | `license_class` | Alcance de la licencia | Metadatos de población estructurados | Idiomas | Decisión |
|---|---|---|---|---|---|---|
| **NCI PDQ** (resúmenes para profesionales) | "all text within NCI products is free of copyright" ([cancer.gov/policies/copyright-reuse](https://www.cancer.gov/policies/copyright-reuse)). No se puede presentar como "resumen PDQ" salvo completo y actualizado. Las imágenes solo se pueden usar dentro de PDQ | `dominio_publico` | Global | No | EN y ES | **Incluida.** Solo texto, sin imágenes. Se cita como "Fuente: NCI PDQ, «título»", nunca como "resumen PDQ" |
| **PMC Open Access Subset** | Por artículo: CC0, CC BY, CC BY-SA, CC BY-ND, CC BY-NC, CC BY-NC-SA, CC BY-NC-ND, "other" ([pmc…/tools/textmining](https://pmc.ncbi.nlm.nih.gov/tools/textmining/)) | CC0 → `dominio_publico` · `cc_by` · `cc_by_sa` | **Por documento** | No | Casi todo EN | **Incluida, solo CC0, CC BY y CC BY-SA.** Se filtra por la licencia exacta, no por el grupo "comercial", porque ese grupo incluye ND |
| PMC OA con CC BY-NC / BY-NC-SA | Por artículo | `cc_by_nc` (marcada) | Por documento | No | EN | **Excluida del MVP** por la composición elegida. La regla #36 la admitiría; queda como ampliación posible |
| Cualquier licencia ND, "other" o manuscrito de autor sin CC | — | — | Por documento | — | — | **Excluida** (#36) |
| **Resúmenes de PubMed** sin licencia | "NLM does not claim the copyright on the abstracts in PubMed; however, journal publishers or authors may" ([NCBI policies](https://www.ncbi.nlm.nih.gov/home/about/policies/)) | sin licencia | Por documento | No | EN | **Excluida: opción A** (ver abajo) |
| ClinicalTrials.gov (API v2) | Obra del gobierno de EE. UU.; atribución "Courtesy of the U.S. National Library of Medicine" (sin verificar el texto literal) | `dominio_publico` | Global | Parcial: `sex`, `minimumAge`, `maximumAge`, `stdAges` | EN | **Excluida del MVP** por la composición elegida. Además, un registro de ensayo no es evidencia de eficacia. Candidata para después del MVP, como tipo de documento propio |
| NICE | UK Open Content Licence, solo para Reino Unido; "Requests to use content for AI purposes… are not covered" | — | — | — | EN | **Excluida** |
| GPC de MinSalud / IETS (Colombia) | Cesión de derechos al Ministerio, sin licencia CC (sin verificar documento por documento) | "libre lectura" | — | — | ES | **Excluida** salvo que un documento concreto muestre una licencia aceptada |
| GuíaSalud (España) | Habitualmente CC BY-NC-ND (sin verificar) | ND | — | — | ES | **Excluida** (ND) |
| Guías de ASCO / JCO | No son OA con CC; JCO Global Oncology probablemente CC BY-NC-ND (sin verificar) | — | — | — | EN | **Excluida.** Solo entran como artículos de PMC OA con licencia aceptada |
| Publicaciones de TCGA / GDC | Sin licencia propia; cada artículo según su revista | Por documento | Por documento | No | EN | **Solo vía PMC OA** con licencia aceptada; si no, excluidas. Poco útiles para opciones terapéuticas |
| cBioPortal | ODbL, con algunos estudios restringidos | — | — | — | — | **Excluida:** son datos, no texto citable (PRD §3) |
| TCIA | CC BY 3.0/4.0, con algunas colecciones NC | — | — | — | — | **Excluida:** son imágenes DICOM, no texto citable (PRD §3) |
| **NCCN** · **ESMO** | NCCN: "may not be reproduced in any form… without the express written permission" | — | — | — | — | **No incluidas:** van en `CorpusRelease.excluded_sources`, sin texto ni ejemplos en el repo. La gestión de su licencia queda para una **versión futura**, no para el MVP; no bloquea (D-09, PREG-1) |

## Opciones

### Composición del corpus

| Opción | Contenido | Cobertura estimada (mama / próstata) | Metadatos de población | Riesgos |
|---|---|---|---|---|
| **A · Mínima-segura (elegida)** | NCI PDQ (EN + ES) + PMC OA con CC0, CC BY o CC BY-SA (revisiones y guías publicadas en revistas) | ~30 / ~25 documentos | 0 % nativos; **100 % curados a mano** en el catálogo, viable con unos 55 documentos | Poco contenido en español en próstata; si PDQ deja de actualizarse, pierde vigencia (sin verificar) |
| B · Equilibrada | A + CC BY-NC marcada + ClinicalTrials.gov (fase 3 con resultados) | ~50 / ~45 | ~30–40 % nativos (solo edad y sexo) y el resto parseado o curado | Un ensayo no es evidencia de eficacia; hay que gestionar la marca NC; el texto libre de elegibilidad exige extracción |
| C · Amplia | B + OMS/OPS (CC BY-NC-SA IGO) + ensayos de fases 2–3 | 100+ / 80+ | Probablemente < 90 %: el volumen desborda la curación | Licencias IGO a revisar por documento; deuda de licencias NC para el piloto |

### Resúmenes de PubMed sin licencia explícita (TBD-04)

| Opción | A favor | En contra |
|---|---|---|
| **A · Excluir el resumen; solo artículos de PMC OA con licencia aceptada (elegida)** | Coherente con #36; sin riesgo legal | Menos cobertura de literatura reciente |
| B · Solo metadatos y enlace, sin texto | Mantiene la referencia visible | Sin *chunk* no hay cita ni soporte NLI (RN-01, RN-04): no aporta al análisis |
| C · Ingerir el resumen | Más cobertura | Contradice #36; copia en un repo público texto con copyright de terceros |

## Decisión

1. **Composición A, mínima-segura** `[Pre-S1 resp. 7]`: NCI PDQ (EN + ES, solo texto) y PMC OA con licencia exacta **CC0, CC BY o CC BY-SA**.
2. **CC0 se asimila a `dominio_publico`.** Es una renuncia de derechos equivalente, así que no reabre #36.
3. **PubMed sin licencia: opción A.** La ingesta **rechaza** todo documento sin licencia registrada o con una licencia no aceptada. No hay registros de solo metadatos.
4. **La licencia se evalúa por documento** (`license_class` por documento). En PMC se lee del JSON de metadatos de la versión, en S3, o de `<dc:rights>` en OAI-PMH. Nunca se infiere de la revista ni del grupo del subconjunto.
5. **Metadatos de población (M-08.3):** cada documento del catálogo lleva sus campos de población **curados** y con origen (`nativo | parseado | curado`; en esta composición, `curado`). Un documento sin esos campos se marca y no cuenta para la meta. Meta: ≥ 90 % de los documentos con población curada.
6. **Fuera del MVP:** NCCN y ESMO (`excluded_sources`), ClinicalTrials.gov, CC BY-NC, NICE, GPC sin licencia aceptada, cBioPortal y TCIA.
7. **Configuración (RN-22):** la lista de fuentes admitidas, las `license_class` aceptadas y la regla de PubMed viven en el catálogo del corpus o en la configuración (`CORPUS_ALLOWED_SOURCES`, `CORPUS_ACCEPTED_LICENSES`), no en el código de la ingesta.
8. **Atribución:** PDQ se atribuye a NCI y enlaza al original. Un artículo de PMC lleva su licencia y su autoría desde el catálogo (RN-25); si falta un dato, se muestra "No disponible".

## Cobertura frente a la meta

- ≥ 20 documentos por tipo habilitado: **se cumple según la estimación** (~30 de mama y ~25 de próstata). La cifra exacta se confirma con la semilla del S1 (US-059) y la ingesta del S4.
- Metadatos de población ≥ 90 %: **solo con curación manual.** Si la curación no llega a tiempo, se declara el riesgo **SUP-3** y no se relaja la regla de licencias.

## Consecuencias

- La semilla del S1 (US-059) y la ingesta del S4 (FEAT-06c) **verifican la licencia documento por documento** contra el JSON de PMC o OAI-PMH. `oa_file_list` ya no existe.
- La curación de los metadatos de población es trabajo explícito de la ingesta (FEAT-06c) y cuenta para su estimación.
- Al haber poco contenido en español para próstata, crece el peso del caso es→en en la evaluación (recall@10 ≥ 0,70 es→en, OL-06).
- Ampliar a la composición B (ClinicalTrials.gov y CC BY-NC) después del MVP **no exige cambiar el esquema**: los campos `source_type`, `license_class` y población ya existen (readme §3.1).

## Pendiente de verificar (no bloquea; antes de la ingesta del S4)

- El aviso de que PDQ "no se está actualizando" ni acepta nuevos socios de sindicación. Apareció en un fragmento de búsqueda y no está confirmado en cancer.gov/syndication.
- Los nombres exactos de los campos de licencia en el JSON de metadatos de PMC (`README.txt` del bucket `pmc-oa-opendata`).
- El número exacto de resúmenes PDQ de mama y próstata, en EN y ES.
- La firma es del PO en calidad académica. Antes de G-Piloto se revisa si hace falta un aval legal externo.
