# FEAT-T5d — Medición del valor clínico en el piloto mixto (VM-1…VM-6) y evaluación de las capacidades diferidas

> Linear: [L1D-49](https://linear.app/l1der-lab-mjbc/issue/L1D-49)

**Talla:** XL (propone división: **T5d-núcleo** US-152…US-156, S6, recorrido principal · **T5d-anexos** US-157…US-161, evaluación de Features diferidas, cada una en el sprint de la Feature que mide) · **Sprint:** 6 (núcleo, piloto mixto) · anexos: S6 `si-hay-capacidad` y Post-MVP · **Capacidad:** T-5 (AC-T5.1, AC-T5.3; VM-1…VM-6, G-15; M-02.5, M-08.1 en la cohorte real) · CAP-07, CAP-08 (agente), CAP-09, CAP-11 (medibles técnicos) · **Recorrido principal:** sí (núcleo: mide la hipótesis con casos sintéticos y reales) · no (anexos: solo si su Feature se construye)
**Requisitos:** FR-20 (medición de VM-1…VM-6 en el piloto) · G-15, G-16 · M-02.5, M-08.1 (mixtos; cohorte real) · M-07.1, M-07.3, M-08.5, M-09.1, M-09.2, M-11.1…M-11.4 (técnicos de Features diferidas) · PRD §14 G-Éxito y cierre del piloto
**Evidencia:** [→ PRD §2.2 VM-1…VM-6, regla R-15], [→ PRD §2.1 G-5, G-15, G-16], [→ PRD §5 FR-20], [→ PRD §14 S6 ("medición de VM-1 a VM-6 en el piloto"), G-Éxito, cierre del piloto], [→ PRD §18.3.2 M-02.5], [→ PRD §18.3.7 M-07.1, M-07.3], [→ PRD §18.3.8 M-08.1, M-08.5], [→ PRD §18.3.9 M-09.1, M-09.2], [→ PRD §18.3.11 M-11.1…M-11.4], [→ PRD §18.4 AC-T5.1, AC-T5.3], [→ readme §2.6 (evaluación y métricas de valor)], [→ readme §5.0 S6 KR4], [→ backlog/02-adrs.md US-008 · DEC-02 (dos cohortes), US-024 · DEC-14], [→ backlog/01-requisitos.md §5.5, §15 (validación mixta)]
**Dependencias:** ↪ US-075 (baseline manual VM-1/VM-2), US-139 (reporte de feedback VM-4/VM-5), US-024 · DEC-14 (muestra de VM-3 sintética), US-142 (G-Demo), US-143 (G-Piloto en verde: sin él no hay cohorte real), US-072 y US-074 (suite `evaluate` y DoD) · ⛔ DEC-02 (US-008) · escenario más probable (protocolo de dos cohortes y metas congeladas) · anexos: ↪ FEAT-07, FEAT-09, FEAT-11a, FEAT-11c, FEAT-08c · 🔗 Regresión [RN-13] → US-143 · 🔗 Regresión [RN-14] → US-036 (nada de la cohorte real entra al repositorio)
**Valor:** el proyecto existe para responder si la IA mejora el análisis del oncólogo. Esta Feature convierte el piloto en evidencia: mide con el mismo protocolo, congelado antes del S1, el tiempo para reconstruir el caso y encontrar evidencia aplicable, la concordancia de la aplicabilidad, la utilidad percibida y la verificabilidad, y deja el veredicto de G-Éxito registrado. Los anexos aseguran que, si una capacidad diferida se construye, llegue con su medición.
**Workaround en el MVP (anexos):** mientras su Feature no exista, el medible no se calcula y el informe de G-Éxito lo lista como "capacidad diferida, no medida" (US-156 AC-4), sin contarlo como fallo.
**Stories:** núcleo US-152 … US-156 (16 puntos, S6) · anexos US-157, US-158, US-159 (8 puntos, S6 `si-hay-capacidad`) · US-160, US-161 (6 puntos, Post-MVP)

## Fixtures

- **FX-T5d-a · Sesiones cronometradas de VM-1 y VM-2** (CSV sintéticos en `data/evaluation/vm/fixtures/`, participantes seudonimizados `O1`, `O2`; 6 casos estandarizados `C1`…`C6`, 3 de mama y 3 de próstata, de US-075):
  - `baseline` (condición manual, US-075): VM-1 (min) = 40, 50, 60, 30, 45, 55 · VM-2 (min) = 30, 36, 24, 40, 20, 28.
  - `oncolens` (misma cohorte sintética, condición con OncoLens, orden contrabalanceado): VM-1 = 20, 25, 30, 15, 22, 28 · VM-2 = 18, 20, 15, 22, 16, 19.
  - **Resultado esperado (cohorte sintética):** mediana VM-1 47,5 → 23,5 (reducción 0,505, "en meta" con `VM1_TARGET_REDUCTION = 0.50`) · mediana VM-2 29 → 18,5 (reducción 0,362, "fuera de meta" con `VM2_TARGET_REDUCTION = 0.50`).
- **FX-T5d-b · Revisión de VM-3** (hoja de revisión sintética con la etiqueta de cohorte `real_anonimizado` simulada): 20 criterios revisados de 4 tablas de aplicabilidad; 18 concordantes; 2 "Parcial" en los que el revisor marca "Coincide" (tratamiento de "Parcial" según DEC-02). **Esperado:** concordancia 0,90 con "Parcial ≠ Coincide" (18/20); "en meta" con `VM3_TARGET = 0.85`.
- **FX-T5d-c · Encuesta VM-6** (10 respuestas Likert 1–5, `O1`…`O10`): P1 "Pude verificar el origen de lo que me mostró OncoLens" = 5, 4, 4, 5, 3, 4, 5, 4, 4, 2 · P2 "Sentí que OncoLens me indicaba qué tratamiento dar" = 1, 2, 1, 4, 2, 1, 3, 2, 1, 5. **Esperado:** P1 de acuerdo (≥ 4) 8/10 = 0,80 ("en meta", ≥ 0,80) · P2 de acuerdo 2/10 = 0,20 ("en meta", ≤ 0,20).
- **FX-T5d-d · Discrepancias sembradas** (anexo, `data/evaluation/discrepancias/`): 5 pares de fuentes sintéticas con una discrepancia conocida cada uno (`explainedBy` esperado: `poblacion`, `endpoint`, `fecha`, `diseno`, `no_identificada`); LLM falso `SINT-4DE5` que reporta 4 de las 5.

---

## US-152 — VM-1 y VM-2 se miden con OncoLens en ambas cohortes y se comparan con el baseline manual

> Linear: [L1D-253](https://linear.app/l1der-lab-mjbc/issue/L1D-253)

`FEAT-T5d` · Sprint 6 · Estimación **5** · — (técnica, PRD §17; OL-06) · FR-20 · M-02.5 (VM-1), VM-2 · AC-T5.3 · ↪ US-075, US-143 · ⛔ DEC-02 (US-008) · escenario más probable · 🔗 Regresión [RN-14] → US-036

## Story
Como product owner, quiero cronometrar con el mismo protocolo cuánto tardan los
oncólogos en reconstruir un caso y en encontrar evidencia aplicable usando OncoLens, en
casos sintéticos y en casos reales del piloto, para saber si la reducción frente al
baseline manual alcanza la meta fijada antes del S1.

## AC (Given/When/Then)
- **AC-1 (happy path · cohorte sintética)** · Dados los CSV de FX-T5d-a, cuando se
  ejecuta `evaluate-vm time --cohort sintetico`, entonces el reporte trae mediana de
  VM-1 47,5 → 23,5 min (reducción 0,505, "en meta") y de VM-2 29 → 18,5 min (reducción
  0,362, "fuera de meta"), por tipo de cáncer y en total. `[M-02.5]` `[VM-1]` `[VM-2]`
  `[DEC-02]`
- **AC-2 (borde · metas congeladas)** · Dado `docs/decisions/DEC-02-protocolo-vm.md` con
  metas marcadas como congeladas, cuando el reporte se genera con una configuración cuya
  meta difiere de la del documento, entonces el comando falla con "La meta no coincide
  con la congelada en DEC-02" y no publica resultados. `[R-15]` `[DEC-02]` (asumido en el
  mecanismo)
- **AC-3 (borde · cohortes separadas)** · Dadas sesiones sintéticas y reales en la misma
  ejecución, cuando se agregan, entonces el reporte trae un bloque por cohorte, ninguna
  mediana mezcla ambas, y el veredicto de G-Éxito toma solo la cohorte real.
  `[AC-T5.3]` `[DEC-02]` (asumido: escenario más probable de DEC-02)
- **AC-4 (borde · cohorte real fuera del repositorio)** · Dadas las sesiones de la
  cohorte real, cuando se registran, entonces el CSV crudo vive en el volumen cifrado
  configurado (`VM_REAL_DATA_PATH`, fuera del repo), el repo solo recibe
  `eval/vm/piloto-S6.md` con medianas y conteos, y el escaneo de PII de la CI pasa sobre
  ese fichero. `[RN-14]` `[RN-13]` (asumido en la ruta)
- **AC-5 (borde · muestra insuficiente)** · Dado que la cohorte real tiene menos sesiones
  que el mínimo del protocolo (`VM_MIN_SESSIONS`), cuando se genera el reporte, entonces
  VM-1 y VM-2 de esa cohorte quedan "muestra_insuficiente" y no "fuera de meta".
  `[DEC-02]` `[RN-22]` (asumido)
- **AC-6 (borde · diseño de la cohorte real)** · Dadas sesiones de la cohorte real en las
  que un participante usa el mismo caso en las dos condiciones, o en las que todos los
  participantes empiezan por la misma condición, cuando se ejecuta
  `evaluate-vm time --cohort real`, entonces el comando falla con "Diseño no
  contrabalanceado" y nombra la regla incumplida; con casos distintos por condición y
  orden alternado, calcula la reducción de la mediana manual → OncoLens.
  `[§15 resp. 6]` `[DEC-02]`

## Contexto técnico
Extiende `evaluate-vm` de US-075 con el subcomando `time` y la columna `cohorte`. Las
sesiones con OncoLens se cronometran con el mismo checklist de "caso reconstruido" (P1)
y las mismas preguntas de referencia que el baseline. Medianas y reducciones se calculan
en Python, deterministas; metas y mínimos en configuración (`VM1_TARGET_REDUCTION`,
`VM2_TARGET_REDUCTION`, `VM_MIN_SESSIONS`) con los valores de DEC-02 `[RN-22]`. Tests:
Pytest con FX-T5d-a (AC-1, AC-3, AC-5, AC-6), test del comprobador de metas contra un
`DEC-02` de test (AC-2) y escaneo de PII de la CI sobre el reporte (AC-4). En la cohorte
real la condición manual usa casos reales distintos con orden contrabalanceado entre
participantes (respuesta 6 del usuario, `01-requisitos.md` §15); el comprobador del AC-6
lee la columna `caso` y la columna `orden` del CSV.

## INVEST
**Small** ✓ un subcomando sobre el agregador de US-075 y dos rondas de sesiones.
**Testable** ✓ seis tests deterministas con CSV sintéticos.

---

## US-153 — VM-3 se mide en la cohorte real con una muestra de tablas de aplicabilidad revisada por el oncólogo

> Linear: [L1D-254](https://linear.app/l1der-lab-mjbc/issue/L1D-254)

`FEAT-T5d` · Sprint 6 · Estimación **3** · — (técnica, PRD §17) · FR-20 · M-08.1 (mixto, cohorte real), VM-3 · AC-T5.3 · ↪ US-024 · DEC-14 (protocolo de revisión, cohorte sintética), US-126 (tabla de aplicabilidad), US-143 · ⛔ DEC-02 (US-008) · escenario más probable (muestra y tratamiento de "Parcial")

## Story
Como product owner, quiero que el oncólogo asesor revise una muestra de tablas de
aplicabilidad generadas sobre casos reales del piloto, para medir si el sistema asigna
los estados como lo haría un clínico con pacientes reales y no solo con sintéticos.

## AC (Given/When/Then)
- **AC-1 (happy path)** · Dada la hoja de revisión de FX-T5d-b, cuando se ejecuta
  `evaluate-vm vm3 --cohort real`, entonces el reporte trae concordancia 0,90 (18/20),
  "en meta" con `VM3_TARGET = 0.85`, y el número de tablas y criterios revisados.
  `[M-08.1]` `[VM-3]` `[DEC-02]`
- **AC-2 (borde · muestra aleatoria y reproducible)** · Dado el universo de análisis
  `con_evidencia` de la cohorte real, cuando se ejecuta `evaluate-vm vm3 sample --seed
  42 --n <muestra de DEC-02>`, entonces dos ejecuciones con la misma semilla eligen los
  mismos análisis y la hoja trae por criterio solo `criterion`, `patientValue`,
  `studyPopulationValue`, `status` e identificadores opacos, sin identidad.
  `[M-08.1]` `[RN-10]` (asumido en el formato de la hoja)
- **AC-3 (borde · "Parcial")** · Dados los 2 criterios "Parcial" de FX-T5d-b que el
  revisor marca "Coincide", cuando se calcula, entonces cuentan como no concordantes y el
  reporte declara la regla aplicada de DEC-02. `[VM-3]` `[DEC-02]`
- **AC-4 (borde · validado vs. no validado)** · Dado el reporte, cuando se publica,
  entonces rotula VM-3 "validado por el oncólogo" con revisor seudonimizado y fecha, y
  separa la cohorte sintética de DEC-14 de la real. `[AC-T5.3]`
- **AC-5 (borde · hoja fuera del repositorio)** · Dada la hoja de la cohorte real, cuando
  se guarda, entonces vive en `VM_REAL_DATA_PATH` y el repo solo recibe el agregado.
  `[RN-14]` (asumido en la ruta)

## Contexto técnico
La hoja se genera desde `clinical-api` (lectura de `AIAnalysisRecord.applicability`,
solo análisis de pacientes `real_*` tras G-Piloto) con un comando de administración que
corre dentro del equipo del piloto; el revisor la completa en la red privada (VPN, US-144).
Tests: Pytest con FX-T5d-b (AC-1, AC-3, AC-4), test de reproducibilidad de la muestra con
datos sintéticos rotulados como cohorte real (AC-2) y test de ruta (AC-5).

## INVEST
**Small** ✓ un muestreo, una hoja y un cálculo de concordancia.
**Testable** ✓ cinco tests con una hoja sintética.

---

## US-154 — VM-4 y VM-5 del piloto se reportan por cohorte con su tasa de respuesta y las metas congeladas

> Linear: [L1D-255](https://linear.app/l1der-lab-mjbc/issue/L1D-255)

`FEAT-T5d` · Sprint 6 · Estimación **2** · — (técnica, PRD §17; HU-25) · FR-20 · VM-4, VM-5 · AC-T5.3 · ↪ US-137, US-139 · ⛔ DEC-02 (US-008) · escenario más probable

## Story
Como product owner, quiero el reporte de utilidad percibida y de faltantes útiles del
piloto separado por cohorte, para saber si la meta de G-Éxito se cumple con casos reales
y no solo con los sintéticos de la demo.

## AC (Given/When/Then)
- **AC-1 (happy path)** · Dado FX-T5c-a con sus 10 análisis rotulados como cohorte
  `real_anonimizado` (datos sintéticos de test), cuando se ejecuta `oncolens feedback
  report --cohort real --period piloto`, entonces trae tasa de respuesta 0,80, VM-4 0,75
  ("en meta") y VM-5 correcto y útil 0,60 ("fuera de meta"). `[VM-4]` `[VM-5]` `[DEC-02]`
- **AC-2 (borde · tasa de respuesta mínima)** · Dada una tasa de respuesta por debajo de
  `FEEDBACK_MIN_RESPONSE_RATE`, cuando se genera, entonces VM-4 y VM-5 quedan
  "no_valido_por_tasa" y el reporte lo explica. `[PRD §2.2 VM-4]` `[RN-22]` `[DEC-02]`
- **AC-3 (borde · período del piloto)** · Dados análisis anteriores a la fecha de G-Piloto
  registrada por US-143, cuando se genera el reporte de la cohorte real, entonces quedan
  excluidos. `[RN-13]` (asumido)
- **AC-4 (borde · metas congeladas)** · Dada una meta de configuración distinta de la de
  DEC-02, cuando se genera, entonces el comando falla igual que en US-152 AC-2. `[R-15]`

## Contexto técnico
Amplía el agregador de US-139 con el filtro de período (fecha de G-Piloto leída del
registro del `preflight`, US-143) y el umbral de tasa de respuesta. Tests: Vitest del
agregador con FX-T5c-a re-rotulado (AC-1…AC-4).

## INVEST
**Small** ✓ dos filtros y un umbral sobre un reporte existente.
**Testable** ✓ cuatro tests unitarios.

---

## US-155 — La encuesta de VM-6 se aplica al final del piloto y mide verificabilidad y no prescripción percibidas

> Linear: [L1D-256](https://linear.app/l1der-lab-mjbc/issue/L1D-256)

`FEAT-T5d` · Sprint 6 (cierre del piloto) · Estimación **3** · — (técnica, PRD §17) · FR-20 · VM-6 · AC-T5.3 · ↪ US-152 · ⛔ DEC-02 (US-008) · escenario más probable (instrumento Likert) · 🔗 Regresión [RN-23] → US-068 (textos de la encuesta)

## Story
Como product owner, quiero preguntar a los oncólogos del piloto si pudieron verificar el
origen de lo que vieron y si sintieron que OncoLens les indicaba qué tratamiento dar,
para medir el riesgo de lectura prescriptiva que ninguna métrica técnica captura.

## AC (Given/When/Then)
- **AC-1 (happy path)** · Dadas las respuestas de FX-T5d-c, cuando se ejecuta
  `evaluate-vm vm6`, entonces el reporte trae P1 0,80 de acuerdo ("en meta", ≥ 0,80) y P2
  0,20 ("en meta", ≤ 0,20). `[VM-6]` `[DEC-02]`
- **AC-2 (borde · instrumento versionado)** · Dado el instrumento de DEC-02, cuando se
  publica, entonces `data/evaluation/vm/vm6-instrumento.json` contiene las dos preguntas
  literales de PRD §2.2, la escala y la versión, y la herramienta rechaza respuestas a un
  instrumento de otra versión. `[VM-6]` `[PRD §2.2]`
- **AC-3 (borde · sin texto libre)** · Dado el formulario de la encuesta, cuando se
  inspecciona, entonces no tiene campos de texto libre y las respuestas guardan solo el
  participante seudonimizado, la pregunta y el valor. `[RN-10]` (asumido)
- **AC-4 (borde · participación mínima)** · Dadas menos respuestas que el mínimo de
  DEC-02, cuando se calcula, entonces VM-6 queda "muestra_insuficiente". `[DEC-02]`
  (asumido)

## Contexto técnico
La encuesta se aplica fuera de la aplicación (formulario estático del repo o papel
transcrito) al cierre del piloto; solo se versionan el instrumento y el agregado.
Tests: Pytest del agregador con FX-T5d-c (AC-1, AC-4), validación de esquema del
instrumento (AC-2) y revisión automatizada del formulario (AC-3).

## INVEST
**Small** ✓ un instrumento de dos preguntas y un agregado.
**Testable** ✓ cuatro tests deterministas.

---

## US-156 — El informe de G-Éxito consolida VM-1…VM-6 contra las metas congeladas y los incidentes críticos, y cierra el piloto

> Linear: [L1D-257](https://linear.app/l1der-lab-mjbc/issue/L1D-257)

`FEAT-T5d` · Sprint 6 (cierre del piloto) · Estimación **3** · — (técnica, PRD §17) · FR-20 · G-15 · AC-T5.3 · PRD §14 G-Éxito y cierre del piloto · ↪ US-152, US-153, US-154, US-155, US-150 (auditoría), US-074 (suite) · ⛔ DEC-02 (US-008)

## Story
Como product owner, quiero un único informe que diga si cada métrica de valor quedó en
la meta fijada antes del S1 y si hubo algún incidente crítico, para declarar G-Éxito (o
no) con evidencia y documentar el aprendizaje del piloto.

## AC (Given/When/Then)
- **AC-1 (happy path)** · Dados los reportes de US-152…US-155 sobre los fixtures,
  cuando se ejecuta `evaluate-vm g-exito`, entonces `eval/vm/g-exito.md` lista VM-1…VM-6
  con valor, meta congelada y estado, y el veredicto es "G-Éxito no alcanzado" porque
  VM-2 y VM-5 están fuera de meta, nombrándolas. `[G-15]` `[PRD §14 G-Éxito]` `[R-15]`
- **AC-2 (borde · incidentes críticos)** · Dado un registro de auditoría de test con una
  denegación `403` por opt-out que, por error inyectado, aparece seguida de un
  `AIAnalysisRecord` del mismo paciente, cuando se genera el informe, entonces cuenta 1
  incidente "generación con IA sobre un paciente con opt-out" y el veredicto es "G-Éxito
  no alcanzado" aunque todas las VM estén en meta. `[PRD §14 G-Éxito]` `[RN-15]`
- **AC-3 (borde · salidas prescriptivas del piloto)** · Dados los `AIAnalysisRecord` de
  la cohorte real, cuando el informe ejecuta la lista de términos prohibidos de US-068
  dentro del entorno del piloto, entonces reporta solo el conteo (meta 0) sin copiar
  textos al repositorio. `[RN-23]` `[G-14]` `[RN-14]`
- **AC-4 (borde · capacidades diferidas)** · Dadas Features del S6 `si-hay-capacidad` o
  Post-MVP no construidas, cuando se genera, entonces sus medibles aparecen como
  "capacidad diferida, no medida" con su Feature, sin contar como fallo.
  `[01-requisitos §15]` (asumido)
- **AC-5 (borde · cierre del piloto)** · Dado el informe, cuando se cierra el piloto,
  entonces `docs/decisions/cierre-piloto.md` registra el aprendizaje (incluidas las
  métricas fuera de meta) y la decisión sobre el Post-MVP, y declara que el cierre no
  reemplaza a G-Éxito. `[PRD §14 cierre del piloto]` (asumido en la ubicación)

## Contexto técnico
El informe solo lee agregados y conteos: VM de US-152…US-155, incidentes desde
`AuditLog` (US-150: denegaciones por opt-out frente a análisis creados), el detector de
fuga de identidad de la suite (US-072) y la regla de proveedores (US-050) sobre el
registro del piloto. Tests: Pytest con reportes de fixture (AC-1, AC-4) y con un
`AuditLog` de test con el incidente inyectado (AC-2); AC-3 corre la lista de US-068 sobre
una BD de test rotulada `real_anonimizado`.

## INVEST
**Small** ✓ un consolidador de reportes existentes y un documento.
**Testable** ✓ cinco tests con entradas sintéticas.

---

## US-157 — La suite mide que la síntesis reporta las discrepancias sembradas y copia las etiquetas factuales del catálogo

> Linear: [L1D-258](https://linear.app/l1der-lab-mjbc/issue/L1D-258)

`FEAT-T5d` · Sprint 6 (`si-hay-capacidad`, junto con FEAT-07) · Estimación **3** · — (técnica, PRD §17; OL-06) · FR-20, FR-24 · M-07.1, M-07.3 · AC-T5.1 (discrepancias sembradas) · ↪ US-166, US-167, US-168, US-072 · ⛔ DEC-07 (US-017) · escenario más probable (meta)

## Story
Como responsable de calidad de la IA, quiero medir si la síntesis detecta las
discrepancias que sembramos y si sus etiquetas factuales coinciden con el catálogo, para
que FEAT-07 no se active sin demostrar que preserva las diferencias entre fuentes.

## AC (Given/When/Then)
- **AC-1 (happy path)** · Dado FX-T5d-d con el LLM falso `SINT-4DE5`, cuando se ejecuta
  `evaluate --suite sintesis`, entonces M-07.1 = 0,80 ("en meta" con
  `SYNTH_DISCREPANCY_TARGET = 0.80`) y el reporte nombra el par no reportado.
  `[M-07.1]` `[AC-T5.1]`
- **AC-2 (borde · etiquetas = catálogo)** · Dadas las citas de la síntesis de FX-T5d-d,
  cuando se comparan `studyDesign`, `trialPhase`, `primaryEndpoint`, `sampleSize` y
  `publishedAt` con `corpus_document`, entonces M-07.3 = 1,00; y con un LLM falso que
  altera `sampleSize`, M-07.3 sigue 1,00 porque el validador lo corrige (si no, la suite
  falla). `[M-07.3]` `[RN-25]`
- **AC-3 (borde · causa esperada)** · Dado un par sembrado con `explainedBy = poblacion`,
  cuando la síntesis lo reporta como `no_identificada`, entonces cuenta como reportada
  para M-07.1 y aparece en el detalle "causa distinta de la esperada". (asumido)
- **AC-4 (borde · regresión en PR)** · Dado un PR que cambia el prompt de síntesis y baja
  M-07.1 por debajo de la meta, cuando corre la suite (US-074), entonces el *check*
  falla. `[AC-T5.4]` `[FR-20]`

## Contexto técnico
Nueva familia `sintesis` en la suite de US-072, con FX-T5d-d en `data/evaluation/`
(sintético). Meta en la configuración de la suite `[RN-22]`. Tests: Pytest con adapters
falsos (AC-1…AC-3) y la ejecución en CI (AC-4).

## INVEST
**Small** ✓ un dataset y dos métricas.
**Testable** ✓ cuatro tests con LLM falso.

---

## US-158 — La suite verifica que el 100 % de las citas muestra su fecha y el de las guías su versión

> Linear: [L1D-259](https://linear.app/l1der-lab-mjbc/issue/L1D-259)

`FEAT-T5d` · Sprint 6 (`si-hay-capacidad`, junto con FEAT-09) · Estimación **2** · — (técnica, PRD §17) · FR-20, FR-26 · M-09.1, M-09.2 · ↪ US-162, US-164

## Story
Como responsable de calidad, quiero comprobar en cada corrida de la suite que todas las
citas llevan fecha y que las guías llevan versión, para que la vigencia visible no dependa
de que alguien lo revise a mano.

## AC (Given/When/Then)
- **AC-1 (happy path)** · Dadas las respuestas de la suite sobre FX-09-a, cuando se
  calcula, entonces M-09.1 = 1,00 (toda cita con `publishedAt` o `lastUpdatedAt`) y
  M-09.2 = 1,00 (toda cita `sourceType = guideline` con `guidelineVersion`).
  `[M-09.1]` `[M-09.2]`
- **AC-2 (borde · cita sin fecha)** · Dada una cita de `doc-v3` (FX-09-a, sin fechas en
  el catálogo), cuando se calcula, entonces M-09.1 < 1,00, la suite falla y nombra el
  documento. `[M-09.1]` (asumido)
  > Pendiente de definir en refinamiento (dueño: Ingeniería · afecta: AC-2, M-09.1): ¿una fuente sin fecha en el catálogo es un fallo de M-09.1 o la ingesta (US-117) debe rechazarla para que nunca llegue a citarse?
- **AC-3 (borde · visibilidad en la UI)** · Dado el panel con una opción que cita una
  guía de FX-09-a, cuando se inspecciona en Playwright, entonces la fecha y la versión
  aparecen en texto en la tarjeta. `[M-09.2]` `[AC-09.1]`
- **AC-4 (borde · no guías)** · Dada una cita `clinical_trial` sin `guidelineVersion`,
  cuando se calcula M-09.2, entonces no entra al denominador. `[M-09.2]`

## Contexto técnico
Métrica determinista sobre las respuestas de la suite (Pytest) y verificación visual en
Playwright contra Compose con FX-09-a sembrado. Sin LLM juez.

## INVEST
**Small** ✓ dos conteos sobre salidas existentes.
**Testable** ✓ cuatro tests.

---

## US-159 — La suite verifica que todo análisis afectado queda desactualizado y que ninguna cita del historial deja de resolverse

> Linear: [L1D-260](https://linear.app/l1der-lab-mjbc/issue/L1D-260)

`FEAT-T5d` · Sprint 6 (`si-hay-capacidad`, junto con FEAT-11a) · Estimación **3** · — (técnica, PRD §17) · FR-20, FR-12 · M-11.1, M-11.2 · ↪ US-174, US-175

## Story
Como responsable de calidad, quiero sembrar cambios de datos y nuevas versiones del
corpus y comprobar que el historial los refleja, para que el oncólogo nunca reutilice un
análisis viejo creyendo que sigue vigente.

## AC (Given/When/Then)
- **AC-1 (happy path · M-11.1)** · Dados los 6 análisis de FX-11a-a y los 3 cambios
  sembrados que afectan a 4 de ellos, cuando se ejecuta `evaluate --suite historial`,
  entonces M-11.1 = 4/4 = 1,00 y los 2 no afectados no están marcados. `[M-11.1]`
- **AC-2 (borde · M-11.2)** · Dada una nueva `CorpusRelease` que deja `is_current =
  false` los documentos citados por 2 análisis, cuando se abre el historial, entonces el
  100 % de sus citas se resuelve desde el snapshot (título, fuente, `chunkTextSnapshot`) y
  M-11.2 = 0 citas no resolubles. `[M-11.2]` `[RN-05]`
- **AC-3 (borde · falso positivo)** · Dado un cambio en un dato que ningún análisis usó,
  cuando se recalcula, entonces ningún análisis cambia su marca y el reporte cuenta 0
  falsos positivos. (asumido)
- **AC-4 (borde · regresión en PR)** · Dado un PR que rompe la huella de contexto, cuando
  corre la suite, entonces M-11.1 < 1,00 y el *check* falla. `[AC-T5.4]`

## Contexto técnico
Familia `historial` de la suite: corre contra `clinical-api` con FX-11a-a (Supertest en
un proceso de evaluación) y calcula los dos medibles; deterministas, sin LLM juez.

## INVEST
**Small** ✓ dos medibles deterministas sobre un fixture existente.
**Testable** ✓ cuatro tests.

---

## US-160 — La suite verifica que la memoria de análisis nunca es soporte y nunca lleva datos personales

> Linear: [L1D-261](https://linear.app/l1der-lab-mjbc/issue/L1D-261)

`FEAT-T5d` · Post-MVP (junto con FEAT-11c) · Estimación **3** · — (técnica, PRD §17) · FR-20, FR-29 (c) · M-11.3, M-11.4 · AC-T4.3 (memoria) · ↪ US-189, US-190, US-191 · ⛔ ADR-40 (US-013) · detector de PII

## Story
Como responsable de calidad, quiero sembrar en análisis previos afirmaciones que solo
ellos respaldan y datos personales, y medir que nada de eso llega a mostrarse, para que la
memoria no convierta a la IA en su propia fuente ni filtre identidad.

## AC (Given/When/Then)
- **AC-1 (happy path · M-11.3)** · Dado el dataset `data/evaluation/memoria/` (construido
  como FX-11c-a) con 5 afirmaciones sembradas cuyo único soporte es un análisis previo, cuando se ejecuta `evaluate --suite memoria` con un LLM
  falso que las repite, entonces ninguna aparece en `evidenceOptions`, `synthesis` ni
  `applicability`, y M-11.3 = 0. `[M-11.3]` `[RN-24]`
- **AC-2 (borde · M-11.4)** · Dados análisis previos con PII sembrada en la pregunta
  (nombre y cédula), cuando se captura el contexto enviado a `/rag/query`, entonces el
  detector no encuentra ninguna PII y M-11.4 = 0. `[M-11.4]` `[AC-T4.3]` `[RN-11]`
- **AC-3 (borde · regresión en PR)** · Dado un PR que permite citar la memoria, cuando
  corre la suite, entonces M-11.3 > 0 y el *check* falla. `[AC-T5.4]`
- **AC-4 (borde · validado vs. no validado)** · Dado el reporte, cuando se publica,
  entonces marca M-11.3 y M-11.4 como "no requieren validación clínica" (automáticos).
  `[AC-T5.3]` (asumido)

## Contexto técnico
Familia `memoria` en la suite; reutiliza FX-11c-a y el detector de PII de ADR-40.

## INVEST
**Small** ✓ dos medibles sobre un fixture de la Feature.
**Testable** ✓ cuatro tests.

---

## US-161 — La suite mide cuántos criterios resuelve la búsqueda complementaria y recalibra el p95 con el agente

> Linear: [L1D-262](https://linear.app/l1der-lab-mjbc/issue/L1D-262)

`FEAT-T5d` · Post-MVP (junto con FEAT-08c) · Estimación **3** · — (técnica, PRD §17) · FR-20, FR-30 · M-08.5 (G-16), M-06.2 (recalibración con el agente) · ↪ US-186, US-187, US-188, US-141 · ⛔ DEC-07 (US-017)

## Story
Como responsable de calidad, quiero saber qué proporción de criterios "No reportado por
la fuente" pasa a un estado evaluado gracias a la búsqueda complementaria y cuánto cuesta
en latencia, para decidir si el agente vale lo que tarda.

## AC (Given/When/Then)
- **AC-1 (happy path · G-16)** · Dado el dataset `data/evaluation/agente/` (construido
  como FX-08c-a) con 10 criterios "Desconocido: no reportado por la fuente" tras el
  primer borrador, de los cuales la búsqueda complementaria encuentra soporte para 3, cuando se ejecuta `evaluate --suite agente`,
  entonces M-08.5 = 0,30 y el reporte lo compara con `AGENT_RESOLVED_TARGET` (0,20,
  propuesta). `[M-08.5]` `[G-16]`
- **AC-2 (borde · solo lo validado cuenta)** · Dado un criterio que el agente "resuelve"
  con una afirmación que no pasa el NLI, cuando se calcula, entonces no cuenta como
  resuelto. `[M-08.5]` `[RN-01]`
- **AC-3 (borde · p95 con agente)** · Dada la medición de latencia del S4 (US-141),
  cuando se repite con el agente activo, entonces el reporte trae el p95 con y sin agente
  y cuántos análisis devolvieron el primer resultado por *deadline*. `[M-06.2]` `[G-5]`
- **AC-4 (borde · sin evidencia)** · Dadas preguntas `Q-SIN` del dataset, cuando corre la
  suite, entonces el agente registra cero ejecuciones en ellas. `[RN-02]` `[AC-08.7]`

## Contexto técnico
Familia `agente`; métricas de US-186…US-188 (`agent_steps`) y del exportador de latencia
de US-141. Meta en configuración `[RN-22]`.

## INVEST
**Small** ✓ una métrica de conteo y una repetición de la medición de latencia.
**Testable** ✓ cuatro tests con adapters falsos.

---

## Conflictos de fuentes

| # | Fuente A | Fuente B | Se siguió |
|---|---|---|---|
| — | PRD §14 G-Demo: "VM-1 a VM-3 medidas con el oncólogo asesor" al final del S4 | Slicing adoptado y DEC-02 (dos cohortes): VM-1/VM-2 sintéticas solo como baseline en el S1 y con OncoLens en el S6; VM-3 sintética en el S4 (DEC-14) y real en el S6 | Slicing: la medición con OncoLens de VM-1/VM-2 y la de VM-3 real se hacen en el S6 (US-152, US-153); G-Demo registra VM-3 sintética (US-142) |
| — | backlog/01-requisitos.md §5.5: dueña de M-08.1 "FEAT-T5d + DEC-16" | backlog/02-adrs.md: la revisión de VM-3 es DEC-14 (US-024); DEC-16 es el alcance del opt-out | 02-adrs.md: M-08.1 → US-024 · DEC-14 (sintética, S4) y US-153 (real, S6) |
| — | readme §2.6: métricas de las capacidades (síntesis, agente, memoria, historial) en la suite desde el S4 | Slicing adoptado: esas Features son S6 `si-hay-capacidad` o Post-MVP | Las historias de evaluación (US-157…US-161) se activan con su Feature; mientras tanto el informe de G-Éxito las lista como diferidas (US-156 AC-4) |
| Slicing v2 | PRD §14: G-Piloto al cierre del S5 y piloto real en el S6 | Slicing v2 aprobado por el usuario (`01-requisitos.md` §15, 2026-10-07): G-Piloto, piloto mixto y G-Éxito en el S6 | El núcleo de la medición (US-152…US-156) sigue en el S6 y arranca tras G-Piloto en el mismo sprint; G-Éxito al cierre del S6 |
