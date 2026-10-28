# Guía de la Demo 3 (review del S3): qué probar y cómo reproducirlo

Para la sesión con oncólogos y equipo técnico. Todo con **datos sintéticos**. Complementa `docs/demo/runbook-demo-S1.md` (preparar, levantar, apagar, fallos frecuentes) y `docs/demo/flujo-s1-s2.md` (diagrama). Tema del S3: **aplicabilidad por criterio**, **faltantes críticos** y **Base del análisis**.

## 0. Antes de la demo (ensayo obligatorio, 20 min)

1. Levanta con `scripts/demo/levantar.sh` (ver runbook §2). Credenciales: `cat infra/docker/secrets/seed_doctor_password` (médico `doc1@test.local`).
2. **Riesgo a descartar en el ensayo:** `levantar.sh` no se tocó en el S3. Si el corpus del demo no tiene metadatos de población extraídos (`extraido_verificado`), la opción mostrará **«Aplicabilidad no evaluada: sin datos de población en las fuentes citadas»** en vez de los estados por criterio. Comprobación: haz la pregunta del §2.1 y mira si cada opción trae la línea «Criterios del estudio frente a datos registrados: …».
   - Si aparecen los estados: sigue el guion en vivo.
   - Si no aparecen: muestra la aplicabilidad con la evidencia del §6 (reportes y tests), y di claramente que la extracción de población sobre el corpus real se mide en el S4 (US-233).
3. Cierra apps pesadas (stack ~29 GB con el LLM) y verifica `ollama ps` con contexto 8192.

## 1. Datos de partida

| Paciente | Qué muestra |
|---|---|
| (a) Mama HER2+ completa | Caso completo: TNM_8 IIA, ECOG 1, HER2 3+, RE positivo, posmenopáusica. Base sin faltantes críticos. |
| (e) Mama sin estado menopáusico ni Ki-67 | Faltantes críticos; criterios «Desconocido» por dato ausente en el paciente. |
| (b) Próstata ISUP 3 | Checklist de próstata (solo ítems de próstata); serie de PSA, ADT previo y progresión. |
| (c) Biomarcador fuera del catálogo | `no_mapeado`: presente sin verificar, nunca inventado ni descartado (RN-27). |
| (d) Opt-out de `analisis_ia` | `403` en toda generación con IA (comentado; el recorrido completo es del S5/S6). |

## 2. Recorrido en vivo (≈ 15 min)

### 2.1 Aplicabilidad por criterio — paciente (a)
**Pasos:** login → paciente (a) → Análisis → pregunta: *«¿Qué opciones adyuvantes describe la evidencia para cáncer de mama HER2 positivo en estadio IIA?»*

**Qué mirar (visual):**
- Encabezado **«Opciones descritas en la evidencia»** (nunca «recomendado»).
- Por opción: línea **«Criterios del estudio frente a datos registrados»** con los conteos **Coincide / Parcial / No coincide / Desconocido** (no hay puntaje combinado).
- Texto del **criterio de orden**: «Orden por aplicabilidad: primero la opción con menos criterios excluyentes en No coincide; luego la que coincide en más criterios; la relevancia solo desempata. Es un criterio de orden, no una …».
- **Relevancia de recuperación** como metadato secundario («no mide eficacia ni solidez clínica»), después de las citas.
- **Citas** con título, fuente y diseño del estudio copiados del catálogo (no del texto generado); ausente → «No disponible».
- Aviso «Generado por IA; requiere validación clínica independiente por el oncólogo tratante» y «Uso académico/investigación».

**Pregunta para los oncólogos:** ¿el orden y los estados por criterio reflejan cómo ustedes compararían el estudio con esta paciente? ¿Falta algún criterio excluyente (DEC-01/DEC-11, hoy en `propuesta_revisada` hasta el S4)?

### 2.2 Población no comparable
**Qué mirar:** si una opción tiene un criterio excluyente en «No coincide» en todas sus fuentes, aparece el aviso «Según los datos registrados, al menos un criterio excluyente del estudio no coincide con este paciente. La opción se muestra igualmente.» (no se oculta ni se bloquea, RN-26).

### 2.3 Base del análisis y faltantes — pacientes (a) y (e)
**Pasos:** repite una pregunta de mama con (e) y abre **«Ver detalle de la Base»**.

**Qué mirar:**
- Resumen visible sin expandir: «Supuestos · Fuentes no incluidas · Afirmaciones omitidas» y **«N datos críticos faltantes»** («Solo informa; no bloquea el análisis»).
- En el detalle: datos del paciente usados, fuentes consultadas, «N fragmentos recuperados · M sobre el umbral», fecha de corte de la evidencia («Evidencia del corpus al …»), fuentes no incluidas (NCCN y ESMO solo como no incluidas).
- Con (e): criterio dependiente de menopausia/Ki-67 en **«Desconocido»** por dato ausente, no «No coincide».

**Pregunta para los oncólogos:** ¿los datos críticos listados para mama/próstata son los que ustedes exigirían? ¿Faltan o sobran? (A-1: destinos de `psa_serie`, BRCA/HRR, `tratamientos_previos`, `estado_menopausico`.)

### 2.4 Lista de pacientes y checklist
**Pasos:** `/pacientes`.
**Qué mirar:** columnas **Faltantes críticos** y **Por revisar**; (a) sin faltantes, (e) con faltantes; paciente de próstata solo con ítems de próstata. Un dato en `requiere_revision` cuenta como presente **sin verificar**; `rechazado` cuenta como faltante.

### 2.5 Sin evidencia
**Pregunta:** *«¿Qué dice la evidencia sobre el tratamiento de la leucemia mieloide aguda en niños?»*
**Qué mirar:** «Ningún fragmento del corpus superó el umbral… No se generaron opciones», «Relevancia máxima: no aplica», «Qué se buscó» y el alcance («no implica que no exista evidencia»), en ~3 s y **sin invocar al LLM** (RN-02).

### 2.6 Todas las opciones descartadas
**Qué mirar (si aparece o con el ejemplo de contrato):** «No hay opciones descritas con soporte verificable en la evidencia recuperada» y, bajo el titular, el resumen de motivos con su recuento (un motivo una vez; motivos mixtos con recuento). Las descartadas solo se ven «para revisión», sin forma de opción.

### 2.7 Procedencia del dato en el contexto de la IA
**Concepto (no visible en pantalla):** el prompt etiqueta los datos del paciente **sin verificar** o **en conflicto** (diagnóstico y biomarcadores). Evidencia: tests `[US-065 AC-5]`; se enseña el contrato, no la pantalla.

## 3. Validaciones de concepto con los oncólogos (decisiones que cierran en el S4)

| # | Tema | Qué se pide | Referencia |
|---|---|---|---|
| 1 | Criterios excluyentes (HER2, castración, menopausia) | Validar la lista de `propuesta_revisada` | DEC-01, DEC-11 (US-021) |
| 2 | Dos HER2 en conflicto | ¿Se fuerza «Desconocido»? | A-2 (US-124) |
| 3 | `no_mapeado` | Aceptar: cuenta como presente sin verificar; campo final de «información adicional» donde el oncólogo ingresa o confirma hallazgos | RN-27, US-107 |
| 4 | Datos críticos por tipo de cáncer | Revisar mama y próstata del catálogo `datos-criticos.json` | US-001/US-002 |
| 5 | Lenguaje | ¿Algún texto de la pantalla suena a prescripción o a puntaje clínico? | RN-23, RN-28 |
| 6 | Revisión de la muestra de metadatos | ~20 min con `PLANTILLA.md` sobre `data/evaluation/corpus-metadatos/` | tarea 2.3 de L1D-117 → US-233 |

## 4. Para el equipo técnico (≈ 10 min)

1. **Ownership:** el navegador solo habla con `web`; `rag-orchestrator` solo ve el schema `corpus`; los faltantes críticos viajan como claves del catálogo (la etiqueta se resuelve en `clinical-api`). Prueba: `docker ps` (un solo puerto publicado) y la suite de *permission denied*.
2. **Catálogo versionado:** `npm run catalog:validate` (versión 1.1.0) y `npm run catalog:version-guard` (el hash del catálogo cambia ⇒ cambia la versión; `validation.status` queda fuera del hash).
3. **Contratos:** `npm run contracts:check` (33 reglas) y `npm run contracts:generate:check`.
4. **Lenguaje y calidad:** `npm run test:lenguaje`; `npm run quality` (higiene de tests y cobertura de líneas cambiadas como alerta).
5. **Evaluación:** `npm run evaluate -- --suite all` (con adaptadores falsos) y `reports/eval/s3-cierre.md`.
6. **CI:** pestaña Actions de `main` en verde (CI, E2E, Push) y code scanning sin alertas abiertas.
7. **Corpus híbrido:** el vector sparse de BGE-M3 se calcula en `ingest reindex-sparse` (US-117b) con el mismo modelo y pesos que usará la consulta; la consulta híbrida (US-112) llega en el S4. Ver Milvus: runbook S1 §6.

## 5. Límites honestos (decirlos antes de que pregunten)

- **Métricas con adaptadores falsos y fixtures sintéticos**, no con el LLM real: M-08.3 = **0,70** (7 de 10; meta 0,90), M-08.4 = 0,95, M-08.2 = M-08.6 = 0, concordancia de estados 41/41. Fidelidad NLI 0,75 y precisión de citas 0,80 en la suite `all` están **bajo la meta (0,90)** con modelos falsos; sin regresión frente al baseline. La medición real es US-233 (S4).
- El baseline no cubre la suite de aplicabilidad (se genera en el S4).
- La consulta es **densa**; la híbrida (léxica + semántica) llega con US-112 (S4).
- Orden de aplicabilidad y criterios con el catálogo `propuesta_revisada`: pendiente de validación clínica.
- La opción «continuar con aviso» y el registro manual aún no tienen UI (US-005, S4).
- Latencia y memoria: ver runbook S1 §4 (primera consulta lenta, p95 ≤ 15 s se recalibra en el S5).

## 6. Evidencia de respaldo si el vivo falla

| Qué | Dónde |
|---|---|
| Informe de evaluación del cierre | `reports/eval/s3-cierre.md` (+ `.json`, `s3-cierre-aplicabilidad.json`) |
| Aplicabilidad (criterios del catálogo, textual citada) | `reports/eval/l1d-126-…md`, `l1d-128-…md`, `l1d-244-…md` |
| Alias de chunks en la cita | `reports/eval/l1d-287-alias-chunks-cita.md` y `l1d-287-ac7-temperaturas.md` |
| Procedencia en el prompt | `reports/eval/l1d-181-procedencia-contexto-ia.md` |
| Ejemplos de contrato (respuestas fijas) | `contracts/examples/` |
| Detalle de opciones | `reports/eval/detalle-opciones.md` |
| Cierre y trazabilidad | `backlog/sprints/S3-cierre.md`, `S3-trazabilidad.md` |

## 7. Si algo falla

Ver `docs/demo/runbook-demo-S1.md` §5 (login 500, `DEADLINE_VENCIDO`, Ollama, memoria). Apagar y limpiar al terminar: `scripts/demo/apagar.sh` (y borrar contenedores, redes y volúmenes del proyecto de la demo).
