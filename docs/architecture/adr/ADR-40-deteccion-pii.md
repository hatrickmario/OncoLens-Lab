# ADR-40 — La detección de PII usa patrones configurables en ambos backends; el motor de nombres en documentos queda sin elegir porque ningún candidato alcanza G-8

> Linear: [L1D-205](https://linear.app/l1der-lab-mjbc/issue/L1D-205) · Historia: US-013 · Feature: FEAT-T4a
> Plantilla: MADR 4 (variante mínima, en español). Change: `l1d-205-adr40-deteccion-pii`.

- **Estado:** propuesto (la medición no permite elegir motor para nombres en documentos; ver "Decisión pendiente del usuario")
- **Fecha:** 2026-10-21
- **Decisores:** usuario (producto y privacidad); medición: `ai-services-dev`
- **Consultados / informados:** `privacy-guardian`, `design-principles-reviewer`, `ai-eval-runner` (revisión del reporte)
- **Requisitos:** RN-10, RN-11, RN-12, RN-14, RN-21, RN-22, G-8 (sensibilidad ≥ 0,95 en identificadores directos), FR-20, OL-03, OL-06 (PII ≥ 0,95), TBD-01

## Contexto y problema

El texto libre (pregunta, notas, eventos, atributos) debe llegar desidentificado a Backend 2 (RN-10, RN-11) y el gate de PII de documentos (FEAT-01b, S3) necesita un motor que alcance G-8 en identificadores directos: nombre, documento, teléfono, correo, dirección y fecha de nacimiento. Hoy rige la opción A de `[S1 resp. 3]` en `clinical-api` (identidad exacta más `config/pii-formats.json`); `rag-orchestrator` no tiene adapter `pii/` y no existía un dataset de PII sembrada que permitiera afirmar G-8. El margen de memoria del stack con el LLM G de ADR-39 fase B es de 0,71 GB (727 MB).

La regla de elección se fijó antes de medir (design D2): se descarta el candidato con sensibilidad < 0,95 en algún identificador directo o cuya memoria no quepa; entre los que cumplen gana el más simple; si ninguno cumple, el ADR lo declara, no elige y escala al usuario.

## Factores de decisión

- G-8: sensibilidad ≥ 0,95 por identificador directo, medida sobre un dataset sintético etiquetado (RN-13, RN-14).
- Falsos positivos sobre términos clínicos de control; un falso positivo que enmascara un dato crítico (HER2, Gleason…) se reporta como riesgo, no como descarte automático.
- Memoria (margen de 727 MB), latencia p95 por texto y licencia de los pesos (RN-21).
- RN-10: B1 no envía a B2 ningún dato de identidad (ni en claro, ni hashes, ni indicios). RN-12: sin nube. RN-22: motor, versión y umbrales en configuración.

## Opciones consideradas

1. **Candidato 1:** patrones configurables en B1 y B2, más identidad exacta solo en B1.
2. **Candidato 2:** el candidato 1 más el NER de spaCy `es_core_news_md` 3.8.0 en `pii/` de B2.
3. GLiNER `urchade/gliner_multi_pii-v1`: descartado sin medir, 1,16 GB de pesos frente a 0,71 GB de margen.
4. Servicio de PII aparte: descartado (memoria y operación). NER con el LLM local: descartado (no determinista, consume el semáforo de inferencia). Enmascarar la pregunta en B2: descartado (viola RN-10/RN-11).

## Medición (AC-1)

Dataset `data/eval/pii-mini` 1.0.0 (sintético, `manifest.json` con `clase: sintetico`): 60 identidades × 5 contextos = 300 textos, 980 spans etiquetados (nombre 340, documento 140, teléfono 160, correo 120, dirección 120, fecha de nacimiento 100), formatos de seis países (CO, ES, AR, MX, PE, CL) y 770 apariciones de 20 términos clínicos de control. Los valores de PII se generan al azar al materializar el dataset y no se versionan (teléfonos de numeración de ficción, correos `@example.test`, documentos sin titular), por lo que el `pii-scan` no los ve y no hace falta tocar su allowlist. Medición con `python -m app.scripts.adr40` (3 corridas; sensibilidad determinista, latencia = mediana del p95 por corrida; IC 95 % bootstrap de 1000 remuestreos; un span cuenta si los hallazgos cubren ≥ 50 % de sus caracteres). Reporte de agregados: `reports/adr40/medicion.json`.

Contexto decisivo: **texto de documento** (lo que verá el gate de B2, que no conoce la identidad). n = 60 por tipo salvo nombre (120).

| Sensibilidad en documentos | 1-base (referencia: solo `config/pii-formats.json`) | **1** (base + `formatos_b2.json`) | **2** (1 + NER `es_core_news_md`) |
|---|---|---|---|
| nombre | 0,000 | 0,000 | **0,825** (IC 0,758–0,892) |
| documento | 0,667 | 1,000 | 1,000 |
| teléfono | 0,900 | 1,000 | 1,000 |
| correo | 1,000 | 1,000 | 1,000 |
| dirección | 0,000 | 1,000 | 1,000 |
| fecha de nacimiento | 0,000 | 1,000 | 1,000 |
| total | 0,367 | 0,714 | 0,950 |
| Falsos positivos clínicos | 0 de 770 | 0 de 770 | 59 de 770 (BRCA1 20, Gleason 7 20, ECOG 1 19) |
| Latencia p95 por texto | 0,09 ms | 0,11 ms | 6,9 ms |
| Memoria de carga (RSS) | 0 | 0 | 481 MB de 727 MB |
| Licencia | propia | propia | código MIT, **pesos GPL-3.0** (wheel 42 284 033 bytes, sha256 `478b8bb3…6326be2`) |

Informativo (no es un candidato de D1): `es_core_news_sm` 3.8.0 (GPL-3.0, wheel de 12,9 MB) llega a nombre 0,700 con 284 MB de RSS y marca Gleason 7 en 66 apariciones (`reports/adr40/informativo-es_core_news_sm/`).

Aplicando D2:

1. El candidato 1 queda descartado: nombre 0,000. Los patrones no pueden detectar nombres de personas; la identidad exacta solo existe en B1, y B2 no puede conocerla (RN-10).
2. El candidato 2 queda descartado: nombre 0,825, con un IC 95 % cuyo límite superior (0,892) no llega a 0,95. Fallan los nombres en prosa ("El paciente X, nacido el…": 21 de 60 en esa plantilla); los encabezados con etiqueta ("Paciente: X") se detectan. Además marca como persona términos clínicos críticos (Gleason 7, BRCA1, ECOG 1), con riesgo de enmascarar datos que el análisis necesita.
3. Ningún candidato cumple G-8 en nombres de documento. Por D2.4 **este ADR no elige motor de nombres**.

Qué sí queda establecido: en direcciones, fechas de nacimiento, documentos con letra o separadores y teléfonos con espacios, los patrones de `config/pii-formats.json` solos no alcanzan (candidato 1-base); con los formatos adicionales de `apps/rag-orchestrator/app/scripts/adr40/formatos_b2.json` llegan a 1,000 sin falsos positivos clínicos y en 0,11 ms. Eso hace que el candidato 1 ampliado sea suficiente para todo identificador directo **salvo el nombre**.

### Límites de la medición

- Dataset sintético de 60 identidades, generado con plantillas del mismo autor que ajustó los formatos: la sensibilidad de los patrones es optimista. En una primera pasada los formatos de fecha de nacimiento y de dirección dieron 0,90 y se corrigieron (dígitos mínimos de una fecha con mes en letras, dirección estructurada); los números de la tabla son los de la versión final de `formatos_b2.json`. La validación con documentos reales anonimizados es parte de G-Piloto.
- La conclusión sobre nombres no depende de ese sesgo: el límite superior del IC del candidato 2 es 0,892.
- La memoria se midió como el RSS que añade cargar el modelo en un proceso de medición (macOS arm64, Python 3.13.15), no con el stack y el LLM G cargados. **La medición con el stack completo en la máquina de referencia queda a cargo del usuario (tarea 1.4).**
- Las cifras de B1 y B2 no son comparables 1:1: B1 aplica además la etapa de fechas de `pii-masks.json` (fecha de nacimiento 1,00 en B1 frente a 0,00 en 1-base de B2); el modo `con_identidad_conocida` solo existe en B1 y es optimista frente al lector real (sin teléfono ni representante); el p95 usa percentil distinto (B1 por rango, B2 `np.percentile`).
- La coincidencia exacta de identidad compara solo cifras: un CURP alfanumérico queda en claro y de un DNI con letra se tapa el número pero no la letra. Deuda para el gemelo B1/B2.
- spaCy no entrega puntaje por entidad: `PII_NER_MIN_SCORE` solo aplicaría si se usa Presidio.

## Decisión

**Se fijan ahora las decisiones que no dependen del motor de nombres; el motor de nombres en documentos se difiere a una segunda medición (ver más abajo).**

1. **Punto de enmascaramiento (AC-2).** La pregunta y las notas se enmascaran en `clinical-api` antes de construir el request a B2 (ya así por L1D-203). Se descarta toda opción que envíe texto sin desidentificar a B2 o que enmascare la pregunta en B2.
2. **Identidad exacta (AC-3).** La coincidencia exacta con la identidad descifrada del paciente y de su representante se mantiene como capa adicional **solo en B1**. La identidad vive en memoria del request; el detector registra tipos (`findingTypes`), nunca valores. B1 no envía a B2 ni en claro, ni hashes, ni indicios de identidad (RN-10).
3. **Formatos en configuración (AC-4).** Ningún patrón de país vive en código: B1 lee `config/pii-formats.json`; B2 lee su gemelo, que debe contener además los formatos de `formatos_b2.json` (documento alfanumérico, teléfono internacional espaciado, fecha de nacimiento, dirección). Un cambio de forma sube `version` y se revisa en ambos consumidores. Dónde vive el gemelo de B2 (archivo propio montado o copia generada) lo cierra FEAT-01b; no se amplía `config/pii-formats.json` desde este change porque lo comparte el escáner de la CI.
4. **Documentos e `identityFound` (AC-5).** El adapter `pii/` de B2 (S3) detecta PII en el texto del documento solo con su motor y sus formatos configurados y la enmascara; el puerto es `DetectorPii.detectar(texto) -> list[Span]` (tipo, inicio, fin), implementado en esta medición como `DetectorDePatrones` y `DetectorConNer`. La **única excepción del contrato** es `identityFound`, que va en la **respuesta** de `/documents/extract` (B2 → B1): B2 informa que halló PII de identificación y B1 la contrasta con la identidad descifrada en su propio proceso. Flujo por clase de datos: `sintetico`, `real_anonimizado` y `real_identificado` pasan por el gate y, si queda PII, el documento va a `cuarentena_pii`; `real_anonimizado` y `real_identificado` se procesan solo con modelos locales, sin fallback a la nube; la nube solo con `sintetico` (RN-12). El detalle del contrato lo cierra FEAT-01b sin añadir identidad al request.
5. **Configuración (AC-6, RN-22).** Claves: `PII_ENGINE` (`patrones` | `patrones_ner`), `PII_ENGINE_VERSION`, `PII_NER_MODEL` (solo con NER), `PII_NER_MIN_SCORE` (solo con Presidio) y el umbral de sensibilidad de la suite `evaluate` (0,95). Las rutas de `pii-formats*.json` entran en los disparadores de `eval-required` (`l1d-237-eval-required-ci`).
6. **Pesos GPL-3.0.** Si algún modelo de spaCy llega a producción, los pesos se descargan fuera del repo y no se redistribuyen; es riesgo aceptado del MVP académico (RN-21) y se registra en la decisión final.

### Decisión pendiente del usuario

El motor de nombres en documentos no se elige. Opciones y recomendación:

| Opción | Qué implica | Estado |
|---|---|---|
| **A. Segunda medición (recomendada, antes de S3)** | Medir (a) candidato 2 más reglas de nombre ancladas a etiquetas de documento ("Paciente:", "Responsable:", "nacido el") y una lista de exclusión de términos clínicos críticos, y (b) otro modelo de spaCy mayor (`md` ya medido; `lg` o `trf`) verificando antes tamaño y RSS contra los 727 MB. Misma regla D2, mismo dataset ampliado con nombres en prosa. | por medir |
| B. Aceptar un G-8 parcial en documentos | Candidato 1 ampliado para todo salvo el nombre, y nombres cubiertos por cuarentena obligatoria (`cuarentena_pii`) y revisión humana de todo documento con encabezado de paciente. Cambia el flujo de producto y la meta de G-8; es decisión suya. | decisión de producto |
| C. Candidato 2 tal cual | Incumple D2 (0,825) y enmascara Gleason 7/BRCA1/ECOG 1. No recomendado. | descartada por la medición |

Hasta que decida, rige la opción A de `[S1 resp. 3]` en B1 (identidad exacta más `config/pii-formats.json`). **Esa opción no cubre por sí sola todos los identificadores directos de los textos que B1 envía a B2**: el informe de B1 (`npm run eval:pii` en `clinical-api`, escribe `reports/adr40/clinical-api-pii.json`; no se commitea, se regenera) da, solo con formatos, dirección 0/120 (incluidos eventos y atributos), teléfono 141/160, documento 90/140 (130/140 con identidad conocida) y nombre 0/340. Los formatos ampliados (dirección, documento alfanumérico, teléfono espaciado) hoy solo existen en el gemelo de B2.

**Deuda/decisión 7 (condición de G-Piloto).** B1 debe aplicar los mismos formatos ampliados que B2 (la dirección no forma parte de la identidad y solo se tapa con patrones). Responsable: FEAT-01b (S3). Es condición del `preflight real-data` y de G-Piloto: no se habilitan datos reales mientras B1 no cumpla G-8 en sus propios textos. Historia de deuda propuesta: "gemelo B1/B2 antes de FEAT-01b" (incluye un test de paridad B1/B2 de los formatos y la restricción del grupo de bandera en línea `(?i:` frente a Node 22). La ingesta de documentos real es de S3 y no depende de esta decisión para S2.

### Consecuencias

- **Positivas:** hay por primera vez una cifra reproducible de G-8 por tipo y un dataset reutilizable por US-072 (`pii-mini`); se evita adoptar un NER que no cumple y que enmascararía términos clínicos críticos; los formatos adicionales cubren todo menos el nombre con 0,11 ms y sin dependencias.
- **Negativas:** G-8 en documentos queda sin motor decidido hasta una segunda medición; la medición con el stack completo es manual; el dataset es pequeño y de plantillas fijas.
- **Configuración (RN-22):** ver decisión 5; el umbral 0,95, el margen de memoria (727 MB), la cobertura mínima (0,5), las corridas y los remuestreos son argumentos del script, no constantes del algoritmo.

### Confirmación

- `python -m app.scripts.adr40` (código de salida 4 mientras ningún candidato cumpla) y `pytest apps/rag-orchestrator/tests/evaluation/test_adr40_*.py`.
- `npm run eval:pii` en `clinical-api` (tarea 2.1, clinical-platform) para la capa de B1; test de configuración sin patrones de país en código (tarea 2.2).
- Revisión de `reports/adr40/` por `ai-eval-runner` (tarea 3.1); `pii-scan` y `dataset-class-check` en verde sin tocar la allowlist.

## Pros y contras de las opciones

### Candidato 1 (patrones + identidad exacta en B1)

- A favor: determinista, 0,11 ms, sin dependencias ni pesos; con los formatos adicionales cubre documento, teléfono, correo, dirección y fecha de nacimiento al 100 % en el dataset.
- En contra: no detecta nombres de personas en documentos (B2 no conoce la identidad); depende de palabras clave y formatos conocidos.

### Candidato 2 (1 + NER spaCy `es_core_news_md`)

- A favor: detecta nombres sin conocer la identidad (0,825); MIT en el código.
- En contra: no llega a 0,95; marca términos clínicos críticos como personas (59 falsos positivos en 770); 481 MB de RSS de los 727 disponibles; 6,9 ms; pesos GPL-3.0 sin redistribución.

### GLiNER, servicio aparte, NER con el LLM

- Descartados sin medir por memoria (1,16 GB), operación y no determinismo (ver "Opciones consideradas").

## Más información

- Dataset: `data/eval/pii-mini/` (`generar.py --verificar` comprueba las huellas). Script: `apps/rag-orchestrator/app/scripts/adr40/`. Dependencias de medición: `apps/rag-orchestrator/requirements-eval.txt` (spaCy 3.8.14 MIT, `regex` 2026.9.29 Apache-2.0 AND CNRI-Python, `es_core_news_md` 3.8.0 GPL-3.0; versiones, licencias, tamaño y sha256 verificados en la fuente el 2026-10-21).
- Desbloquea (condicionado a la decisión pendiente): FEAT-01b (adapter `pii/` y gate de documentos, S3), FEAT-02b/02c, FEAT-11c. Lo consume `l1d-235-suite-evaluate` (US-072b AC-6).
- Revisión prevista: al inicio de S3, antes de implementar el adapter `pii/`.
