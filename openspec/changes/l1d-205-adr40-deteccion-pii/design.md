# Design — l1d-205-adr40-deteccion-pii

## Context

Hechos (S2-refinamiento §3.1, verificados en la fuente el 2026-10-20): la opción A ya rige en
`clinical-api` (`pii-detector.opcion-a.ts`, formatos en `config/pii-formats.json`, `[S1 resp. 3]`);
`rag-orchestrator` no tiene adapter `pii/`; no hay dataset de PII sembrada; la ingesta de documentos
(consumidor del gate de B2) llega en el S3. Margen de memoria del stack con el LLM G
(`gemma4:26b-a4b-it-q4_K_M`, ADR-39 fase B): **0,71 GB**.

> **Encuadre decidido por el usuario el 2026-10-21 (P-2, `[S2 resp. 2]`).** Si el usuario lo cambia, se
> actualiza este design antes de implementar (`/opsx:update`).

## Goals / Non-Goals

**Goals:** medir candidato 1 frente a 2 con cifras reproducibles; fijar el punto de
enmascaramiento (AC-2), la capa de identidad exacta (AC-3), formatos en configuración (AC-4), el
motor del adapter `pii/` y la verificación `identityFound` (AC-5), y motor, versión y umbrales en
configuración (AC-6).

**Non-Goals:** implementar `pii/` (S3); cambiar US-049; medir GLiNER.

## Decisions

### D1 · Candidatos y descartes (decisión cara de revertir: privacidad)

| Candidato | Pesos / memoria | Licencia | Español | Estado |
|---|---|---|---|---|
| **1** · patrones configurables en B1 y B2 + identidad exacta solo en B1 (B2 sin identidad; informa `identityFound` en la respuesta) | 0 | propia | por reglas | **base, se mide** |
| **2** · 1 + NER spaCy `es_core_news_md` 3.8.0 en `pii/` de B2 (directo o vía Presidio 2.2.364) | wheel 42 MB (RSS a medir) | código MIT; **pesos GPL-3.0** (AnCora) | NER PER/LOC/ORG; F1 0,89 en noticias | **se mide** |
| 3 · GLiNER `urchade/gliner_multi_pii-v1` | 1,16 GB PyTorch, sin ONNX multilingüe | Apache-2.0 | sin evidencia | **descartado por memoria** (> 0,71 GB) |

Descartadas también: servicio de PII aparte (memoria, operación), NER con el LLM local (no
determinista, consume el semáforo de inferencia), enmascarar la pregunta en B2 (viola RN-10/RN-11).

### D2 · Regla de elección (fijada antes de medir)

1. Descartar el candidato con sensibilidad < 0,95 (G-8) en identificadores directos (nombre,
   documento, teléfono, correo, dirección, fecha de nacimiento) o con RSS que no quepa en el margen.
2. Entre los que cumplen, gana **el más simple** (1 antes que 2).
3. Los falsos positivos sobre términos clínicos de control y la latencia p95 por texto se registran
   siempre; un FP que enmascara un dato crítico del catálogo (p. ej. "HER2", "Gleason") se reporta
   como riesgo, no como descarte automático.
4. Ninguno cumple → el ADR lo declara, no elige y escala al usuario.

Por candidato: sensibilidad por tipo y total (IC 95 % *bootstrap*), FP clínicos, p95 de latencia,
RSS medida, licencia y versión exacta; 3 corridas, mediana.

### D3 · Punto de enmascaramiento e identidad (AC-2, AC-3)

La pregunta y las notas se enmascaran en `clinical-api` **antes** de construir el request a B2
(ya así en L1D-203); el ADR lo fija y descarta toda opción que envíe texto sin desidentificar. La
coincidencia exacta con la identidad descifrada del paciente y su representante se mantiene como
capa adicional en B1; la identidad vive solo en memoria del request, nunca en logs ni contexto
(el detector registra tipos, `findingTypes`, nunca valores).

### D4 · Documentos y `identityFound` (AC-5)

**Backend 1 no envía a Backend 2 ningún dato de identidad**: ni en claro, ni hashes, ni "indicios" de
verificación, ni la identidad del representante (RN-10). El adapter `pii/` de B2 (S3) detecta PII en el
texto del documento solo con su motor y sus formatos configurados, y la enmascara. La **única
excepción del contrato** es `identityFound`, y va en la **respuesta** de `/documents/extract` (B2 → B1):
B2 informa que encontró PII de identificación, y es B1 quien la contrasta con la identidad descifrada
del paciente, en su propio proceso. El ADR describe el motor elegido y el flujo por clase de datos
(`sintetico`, `real_anonimizado`, `real_identificado`); el detalle de contrato lo cierra FEAT-01b sin
añadir identidad al request.

### D5 · Configuración (AC-4, AC-6)

Formatos por país en `config/pii-formats.json` (B1) y su gemelo en B2; ningún patrón de país en
código. Claves: `PII_ENGINE`, `PII_ENGINE_VERSION`, `PII_NER_MODEL` (si gana 2),
`PII_NER_MIN_SCORE`. Las rutas de esos archivos entran en los disparadores de `eval-required`
(`l1d-237-eval-required-ci`).

## Criterios de verificación por AC

| AC | Se verifica en |
|---|---|
| AC-1 | ADR §Medición: tabla por candidato con sensibilidad, FP clínicos, latencia y memoria; decisión por D2 |
| AC-2 | ADR §Decisión: enmascaramiento en `clinical-api` antes del request; opción B2-pregunta descartada |
| AC-3 | ADR §Identidad conocida: capa exacta y no registro en logs/contexto |
| AC-4 | ADR + test de configuración: formatos solo en configuración |
| AC-5 | ADR §Documentos: motor de `pii/` y `identityFound` |
| AC-6 | ADR §Configuración: claves; ruta en `ci/eval-trigger-paths.yaml` |

## Privacidad y ownership

- Solo datos sintéticos (RN-13, RN-14): `pii-mini` usa identidades ficticias (FX-T4a-a/c) con
  **valores de rangos reservados**: correos `@example.test`, teléfonos de numeración ficticia, documentos
  con formato válido pero sin titular (generados por el script, nunca copiados de una persona). El
  `pii-scan` de la CI los admite **por valor**: cada valor sembrado entra en `config/pii-allowlist.json`
  como `{ formato, sha256 }` del valor normalizado (obtenido con `pii-scan.mjs --hash`), en una entrada
  con `clase: sintetico` y `rutas: ["data/eval/pii-mini/**"]`. **No** se añade exclusión por ruta en
  `config/pii-scan.json`: `EXCLUSIONES_PERMITIDAS` de `scripts/ci/pii-scan.mjs` es una lista cerrada
  (lockfiles y binarios) y no se amplía. Un valor nuevo no listado sigue rompiendo la CI. Reportes: solo
  agregados y tipos, nunca valores ni textos.
- Fronteras: la medición B1 corre en `clinical-api`; la B2 recibe textos sintéticos por argumento.
  `rag-orchestrator` no lee datos clínicos ni `clinical-minio`. La identidad nunca sale de B1, ni
  en claro ni como hash o indicio (RN-10, D4). Sin nube (RN-12).
- Pesos de spaCy: descargados a una ruta local fuera del repo, no versionados; GPL-3.0 sin
  redistribución.

## Contratos

Sin cambios en ningún `openapi.yaml` ni en `contracts/examples/`; compatible con ADR-26.

## Evaluación

Cambia el detector de PII → OL-06 aplica: PII ≥ 0,95 (G-8). La medición del ADR es el primer valor
de la métrica de privacidad que US-072b integra (`npm run eval:pii`).

## Dependencias y colaboradores

- **Crea:** `apps/rag-orchestrator/app/scripts/adr40/` (CLI + funciones puras
  `sensibilidad_por_tipo()`, `falsos_positivos_clinicos()`, `elegir_mas_simple_que_cumple()` (G-8)),
  `data/eval/pii-mini/`, comando `eval:pii` en `clinical-api` que usa el detector existente por su
  interfaz, ADR-40.
- **Modifica:** `requirements-eval.txt` (spaCy y el modelo, solo medición), índice de ADRs.
- Regla extraída: `elegir_mas_simple_que_cumple()` vive en un solo lugar y la reutiliza US-072b.

## Risks / Trade-offs

- Dataset sintético pequeño → IC ancho; se reporta el IC y se anota que la validación con
  documentos reales anonimizados es parte de G-Piloto.
- GPL-3.0 de los pesos si gana 2 → riesgo aceptado del MVP académico, sin redistribución.
- RSS de spaCy sin publicar → se mide; si no cabe en el margen, 2 queda descartado con su cifra.

## Migration Plan

Sin migraciones. El estado del ADR queda `propuesto` hasta la aprobación del usuario.

## Open Questions

- **P-2** (usuario): confirmar el encuadre (1 frente a 2, regla "más simple que cumpla", GLiNER
  descartado). **Decidido (usuario, 2026-10-21, `[S2 resp. 2]`).**
