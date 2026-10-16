# adr39-mini

Mini-dataset de la fase A de ADR-39 (US-012, L1D-102): decide los modelos de *embeddings*, *reranker* y NLI midiendo recuperación y NLI sobre un corpus pequeño de mama y próstata. Lo reutilizará US-072 (suite `evaluate`).

**Estado:** `0.1.0`, revisado y aprobado por el oncólogo asesor (2026-10-15): preguntas, citas y pares NLI.

## Archivos

| Archivo | Contenido |
|---|---|
| `manifest.yaml` | Fuentes (con licencia por documento), regla de acierto, fuentes pendientes y excluidas |
| `golden.yaml` | 75 preguntas de recuperación: 59 con respuesta en español, 6 sin respuesta en el corpus y 10 controles en inglés |
| `nli-pares.yaml` | 39 pares afirmación–fragmento (`entailment`, `neutral`, `contradiction`; 13 de cada una) |

## Cómo se usa

- **Acierto de recuperación:** un chunk acierta si pertenece al documento esperado **y** contiene la `cita` (normalizando espacios y puntuación). La etiqueta es por pasaje, no por chunk, para que el resultado no dependa del *chunking* que se compara. Acierto por documento es una métrica secundaria.
- **`modo_acierto`:** `cualquiera` (basta una cita), `cobertura_documentos` (cuántos de los documentos esperados aparecen en el top-k) y `sin_evidencia` (no hay acierto; se mide el puntaje máximo recuperado para calibrar el umbral de RN-02).
- **NLI:** la etiqueta se decide solo con el fragmento, no con el resto del documento ni con conocimiento externo.
- **Idiomas:** las fuentes están en inglés. Las preguntas están en español, con 10 controles en inglés (`control_de` apunta a la pregunta original). Las afirmaciones NLI están en inglés (mismo idioma) y en español (mezcla es/en), con la variante en el otro idioma en cada par.

## Datos y licencias

- Preguntas, respuestas y afirmaciones son **sintéticas**; no hay datos de pacientes (RN-13, RN-14).
- **NCI:** texto libre de copyright según su [política de reutilización](https://www.cancer.gov/policies/copyright-reuse). Se acredita a NCI con la URL de origen de cada documento. Se excluyen los gráficos. No se usa el logo de NCI ni la marca PDQ como rótulo de fuente.
- **PMC:** artículos con licencia CC BY 4.0. El manifiesto guarda autoría, revista, año y DOI.
- **ClinicalTrials.gov:** *Source: ClinicalTrials.gov, National Library of Medicine.* Cada registro se identifica como `ClinicalTrials.gov / NCTxxxxxxxx`, con URL, fecha de consulta (2026-10-15) y fecha de última actualización del registro, y puede no reflejar la versión más reciente. Se usan metadatos del registro y citas breves. **Su inclusión no implica validación clínica ni aval de NLM, NIH ni ClinicalTrials.gov.** El proyecto registra que el uso fue confirmado por el usuario; la página de términos no pudo leerse con las herramientas de la sesión.
- **Excluidas:** NCCN y ESMO (RN-21).
- Los **textos completos de las fuentes no se versionan**: el repo contiene solo las citas literales necesarias para evaluar. Para reproducir la verificación hay que descargar cada documento desde su origen.

## Pendiente

- Preguntas de chunking, solapamiento e índice (T2–T5): requieren decidir si amplían US-012.
