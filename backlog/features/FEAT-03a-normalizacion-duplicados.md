# FEAT-03a — Normalización terminológica final, duplicados y no reemplazo silencioso

> Linear: [L1D-12](https://linear.app/l1der-lab-mjbc/issue/L1D-12)

**Talla:** L · **Sprint:** 3 · **Capacidad:** CAP-03 (AC-03.1, AC-03.2 parte de detección, AC-03.3, AC-03.4, AC-03.5) · T-3 (AC-T3.2: no reemplazo silencioso) · **Recorrido principal:** sí (lo mínimo para no mezclar datos al reconstruir el caso)
**Requisitos:** FR-22 (parte S2: normalización final y duplicados; detección de conflictos en la extracción; dueña vía HU-17) · RN-27 (dueña) · RN-08 (dueña) · ADR-33 · FR-08 (regla de diagnóstico, parte automática)
**Evidencia:** [→ PRD §5 FR-08, FR-22], [→ PRD §6 RN-08, RN-27], [→ PRD §18.3.3 AC-03.1–AC-03.5, M-03.1–M-03.5], [→ PRD §18.4 AC-T3.2], [→ readme §5.6 HU-17], [→ readme §6 OL-05 (tareas 6, 7; tests)], [→ readme §3.3 #12, #23, #25, #33], [→ readme §6.1 #10], [→ backlog/02-adrs.md DEC-04, DEC-09], [→ docs/AS-IS.md P3]
**Dependencias:** ↪ US-041 (catálogo montado), US-086 (propuesta de Backend 2) · ⛔ DEC-09 · escenario más probable (US-100) · ⛔ DEC-04 · *workaround* Q-07 (US-098: solo CIE-10 en el catálogo real hasta cerrar) · 🔗 Consumida por: US-087 (persistencia), US-094, US-110 (datos manuales) · 🔗 Medido en: US-106 (M-03.1–M-03.5) · 🔗 Regresión [AC-T3.2] → US-070
**Valor:** hoy el oncólogo compara a mano si dos informes dicen lo mismo o se contradicen (P3). Con esta Feature el mismo dato repetido en dos documentos queda como un solo dato con sus dos fuentes, dos valores distintos del mismo día quedan marcados en conflicto y nada verificado se reemplaza sin que él lo decida.
**Stories:** US-098, US-099, US-100 (15 puntos, S3)

## Fixtures

- Usa **FX-01b-b** (catálogo terminológico `test-s2-1.0.0`) y **FX-02b-a** (P-CASO).
- **FX-03a-a · Paciente "F-REC" (mama, sintético)**: `Diagnosis` activo `TNM_8` "IIA", `diagnosed_at = 2026-01-10`, `verificado`; Ki-67 "20 %" del 2026-03-01 de un documento `R1` (`verificado`); receptor de estrógeno "80 %" del 2026-03-01 de `R1` (`requiere_revision`). Extracciones simuladas de un documento `R2`: (i) Ki-67 "20 %" del 2026-03-01; (ii) Ki-67 "30 %" del 2026-03-01; (iii) receptor de estrógeno "80%" escrito "80 %" del 2026-03-01; (iv) diagnóstico `TNM_8` "IIA" igual al vigente; (v) diagnóstico `TNM_8` "IB" del 2025-06-01; (vi) diagnóstico `TNM_8` "IIIA" del 2026-06-01; (vii) diagnóstico sin fecha confiable.

---

## US-098 — Backend 1 decide la normalización final de todo dato, también del manual, y nunca acepta un código fuera del catálogo

> Linear: [L1D-84](https://linear.app/l1der-lab-mjbc/issue/L1D-84)

`FEAT-03a` · Sprint 3 · Estimación **5** · HU-17 · FR-22 (normalización final), RN-27 (dueña), ADR-33 · AC-03.3, AC-03.5 · ⛔ DEC-04 · *workaround* Q-07 · ↪ US-041, US-086 · 🔗 Consumida por: US-087, US-094, US-110 · 🔗 Medido en: US-106 (M-03.4, M-03.5)

## Story
Como oncólogo, quiero que todo dato de mi paciente, venga de un documento o lo escriba
yo, quede con su término canónico, su código estándar y el texto original, para que el
mismo concepto se reconozca siempre igual y ningún código sea inventado.

## AC (Given/When/Then)
- **AC-1 (happy path)** · Dada una propuesta de Backend 2 con `name = HER2`,
  `originalName = "c-erbB-2"`, `loincCode = LOINC-T-HER2`, cuando `ReconciliationService`
  la decide con la versión `test-s2-1.0.0`, entonces el `Biomarker` queda con
  `name = HER2`, `loinc_code = LOINC-T-HER2`, `original_name = "c-erbB-2"` y
  `mapping_status = mapeado`. `[AC-03.3]` `[ADR-33]`
- **AC-2 (invariante · código fuera del catálogo)** · Dada una propuesta con
  `loincCode = "99999-9"` (inyectada con un Backend 2 simulado), cuando se decide,
  entonces el dato se guarda con `mapping_status = no_mapeado`, sin código y con su
  `original_name`; el dato no se descarta. `[RN-27]` `[M-03.5]`
- **AC-3 (borde · Backend 1 corrige la propuesta)** · Dada una propuesta `no_mapeado`
  cuyo `originalName = "ERBB2"` es sinónimo en el catálogo, cuando se decide, entonces
  queda `name = HER2` y `mapping_status = mapeado`. `[ADR-33]` `[AC-03.3]`
- **AC-4 (borde · datos manuales)** · Dado un tratamiento previo manual con
  `regimenName = "leuprorelina"` (US-094), cuando se guarda, entonces pasa por el mismo
  servicio y queda con `atc_codes = [ATC-T-LEUP]` y la misma `catalogVersion`.
  `[AC-03.3]` `[ADR-33]`
- **AC-5 (borde · toda entidad con códigos)** · Dados un `Diagnosis`, un `Biomarker`, un
  `PriorTreatment` y un `ClinicalEvent` de tipo `procedimiento` creados por el flujo,
  cuando se leen, entonces todos tienen `mapping_status` no nulo; un `ClinicalEvent` de
  tipo `progresion` queda en `n_a`. `[AC-03.3]` `[readme §3.1]`
- **AC-6 (borde · versión distinta)** · Dada una extracción con `catalogVersion` distinta
  de la cargada en `clinical-api`, cuando se procesa, entonces el documento pasa a
  `error` con el código `CATALOG_VERSION_MISMATCH` en el *log* y no persiste datos.
  `[ADR-38]` (asumido: el PRD solo define el `409` en `/rag/query`)
- **AC-7 (borde · sin reporte CAC)** · Dado el spec OpenAPI de `clinical-api` y la lista
  de comandos de CLI, cuando un test los recorre, entonces no existe ninguna ruta ni
  comando que genere, exporte o envíe un reporte a la Cuenta de Alto Costo. `[AC-03.5]`

## Contexto técnico
`ReconciliationService` (módulo `reconciliation` de `clinical-api`), dueño de la
normalización final `[PRD §8]` `[ADR-33]`: verifica cada código contra el catálogo montado
(`CLINICAL_CATALOG_PATH`), resuelve sinónimos ES/EN y conserva el texto original. Por
Q-07, hasta DEC-04 el catálogo real del repo solo trae CIE-10 y los demás estándares
quedan `no_mapeado`. Tests: Vitest unitarios con FX-01b-b y Supertest del flujo de
persistencia.

## INVEST
**Small** ✓ un servicio puro de decisión sobre el catálogo.
**Testable** ✓ siete tests deterministas.

---

## US-099 — El mismo dato en dos documentos queda como un solo dato con dos fuentes, y dos valores distintos del mismo día quedan en conflicto

> Linear: [L1D-85](https://linear.app/l1der-lab-mjbc/issue/L1D-85)

`FEAT-03a` · Sprint 3 · Estimación **5** · HU-17 · FR-22 (duplicados; detección de conflictos) · AC-03.1, AC-03.2 (detección), AC-01.1 (reproceso) · ↪ US-098 · 🔗 Consumida por: US-087, US-089, US-080 · 🔗 Produce para: US-109 (resolución de conflictos, `si-hay-capacidad`), US-124 (aviso `en_conflicto`, S5) · 🔗 Medido en: US-106 (M-03.1–M-03.3)

## Story
Como oncólogo, quiero saber si dos resultados son el mismo dato repetido o datos
distintos sin compararlos a mano, para no contar dos veces un examen ni pasar por alto
una contradicción.

## AC (Given/When/Then)
- **AC-1 (happy path · duplicado)** · Dado F-REC con el Ki-67 "20 %" de `R1`, cuando se
  persiste la extracción (i) de `R2`, entonces sigue existiendo un solo `Biomarker` Ki-67
  del 2026-03-01, con una fila en `clinical_data_source` hacia `R2`, y su `provenance`
  trae `sourceDocumentId = R1` y `additionalSourceDocumentIds = [R2]`.
  `[AC-03.1]` `[readme §3.3 #25]` `[OL-05]`
- **AC-2 (borde · unidad normalizada)** · Dada la extracción (iii) ("80%" frente a
  "80 %"), cuando se persiste, entonces se trata como duplicado del receptor de `R1`.
  `[FR-22]`
- **AC-3 (borde · conflicto)** · Dada la extracción (ii) (Ki-67 "30 %" del mismo día),
  cuando se persiste, entonces existen dos `Biomarker` Ki-67 del 2026-03-01, ambos en
  `requiere_revision`, cada uno con `conflicts_with_id` apuntando al otro y
  `provenance.conflict = true`; ninguno se fusiona. `[AC-03.2]` `[readme §3.3 #25]`
- **AC-4 (borde · misma cifra, otra fecha)** · Dado un Ki-67 "20 %" del 2026-05-01,
  cuando se persiste, entonces queda como un dato nuevo de la serie, sin fusión.
  `[M-03.3]` `[FR-22]`
- **AC-5 (borde · reproceso)** · Dado `R2` ya procesado, cuando se reprocesa, entonces
  no se agrega una segunda fila en `clinical_data_source` para el mismo dato. `[AC-01.1]`
- **AC-6 (borde · tratamientos y atributos)** · Dado el mismo tratamiento previo
  (esquema e inicio iguales) en dos documentos, cuando se persiste el segundo, entonces
  queda un solo `PriorTreatment` con una fila `clinical_data_source` de
  `data_type = prior_treatment`. (asumido)
  > Pendiente de definir en refinamiento (dueño: oncólogo + Ingeniería · afecta: AC-6): ¿qué hace que dos tratamientos previos, eventos o atributos sean "el mismo dato" (p. ej., esquema + fecha de inicio; tipo + fecha; clave + fecha de observación)? FR-22 solo lo define para biomarcadores (concepto, fecha del examen y valor con unidad normalizada).

## Contexto técnico
Parte de `ReconciliationService`, invocada dentro de la transacción de US-087. Un
conflicto nunca se resuelve solo (AC-T3.2): la resolución es de US-109 (`si-hay-capacidad`). Lo que
depende del dato en conflicto mostrará el aviso desde el S3 (US-124, US-136). Tests:
Vitest + Supertest con FX-03a-a.

## INVEST
**Small** ✓ una regla de comparación con tres salidas (duplicado, conflicto, nuevo).
**Testable** ✓ seis tests sobre filas y enlaces en BD.

---

## US-100 — Un dato extraído nunca reemplaza en silencio a uno verificado; en diagnósticos decide la fecha

> Linear: [L1D-86](https://linear.app/l1der-lab-mjbc/issue/L1D-86)

`FEAT-03a` · Sprint 3 · Estimación **5** · HU-09 (parte automática), HU-17 · RN-08 (dueña), FR-08 (regla de diagnóstico), ADR-12 · AC-03.4, AC-T3.2 · ⛔ DEC-09 · escenario más probable · ↪ US-087 · 🔗 Regresión [AC-T3.2] → US-070 · 🔗 Produce para: US-107 (confirmar o descartar, S4)

## Story
Como oncólogo, quiero que un diagnóstico o un valor leído de un documento nuevo nunca
reemplace por su cuenta lo que yo ya verifiqué, para que el caso de mi paciente no
cambie sin que yo lo decida.

## AC (Given/When/Then)
- **AC-1 (happy path · igual al vigente)** · Dada la extracción (iv) de F-REC, cuando se
  persiste, entonces no se inserta un `Diagnosis` nuevo y el vigente sigue siendo el
  mismo. `[OL-05]` `[ADR-12]`
- **AC-2 (borde · anterior al vigente)** · Dada la extracción (v) (2025-06-01), cuando se
  persiste, entonces se guarda como histórico (`is_active = false`) y el vigente no
  cambia. `[ADR-12]` `[RN-08]`
- **AC-3 (borde · posterior al vigente)** · Dada la extracción (vi) (2026-06-01), cuando
  se persiste, entonces se guarda con `review_status = requiere_revision`,
  `is_active = false` y `conflicts_with_id` = el vigente; el vigente sigue activo y el
  `clinicalContext` de un análisis posterior trae `TNM_8` "IIA". `[ADR-12]` `[OL-05]` `[RN-08]`
- **AC-4 (borde · sin fecha confiable)** · Dada la extracción (vii), cuando se persiste,
  entonces queda igual que en el AC-3. `[ADR-12]`
- **AC-5 (borde · sin diagnóstico vigente)** · Dado un paciente sin `Diagnosis` activo y
  una extracción de diagnóstico, cuando se persiste, entonces queda `requiere_revision`
  y no se activa sola. `[OL-05]`
- **AC-6 (invariante · ninguna fila verificada se sobrescribe)** · Dada cualquier
  extracción de FX-03a-a, cuando termina la persistencia, entonces ninguna fila con
  `review_status` `verificado` o `corregido` cambió su valor, y las únicas
  modificaciones sobre ellas son las de US-099 AC-3 (conflicto). `[RN-08]` `[AC-T3.2]`

## Contexto técnico
Regla pura `diagnosis-precedence.ts` en `reconciliation` (igualdad = `cancer_type` +
`staging_system` + `stage_value`). Los diagnósticos en `requiere_revision` se confirman o
descartan en el S3 (US-107). El AC-6 se verifica con un *snapshot* de las filas
verificadas antes y después de persistir. Tests: Vitest unitarios de la regla y
Supertest con FX-03a-a.

## INVEST
**Small** ✓ una regla de cuatro ramas y una invariante.
**Testable** ✓ seis tests deterministas.

---

## Conflictos de fuentes

| # | Fuente A | Fuente B | Se siguió |
|---|---|---|---|
| — | PRD §5 FR-22 y §14: conflictos en el S3 | readme OL-05 (S2): la reconciliación marca el conflicto al persistir (`requiere_revision` + `conflicts_with_id`) | No se contradicen: la **detección** ocurre al extraer (S2, US-099, porque RN-08 rige desde que hay extracción) y la **resolución**, en el S3 (US-109) |
| — | PRD FR-22: conflicto → **ambos** en `requiere_revision` | PRD RN-08: un dato extraído nunca reemplaza en silencio a uno verificado | Se siguen los dos: el dato verificado pasa a revisión visible (no se reemplaza ni se pierde); ver US-099 AC-3 y US-100 AC-6 |
| — | readme §3.3 #12: reglas "a validar con el oncólogo" | — | DEC-09 (US-019, S1) · escenario más probable |
| Slicing v2 | PRD §14 S2 y readme §5.0 S2 (OL-05): normalización y duplicados en el S2 | Slicing v2 aprobado por el usuario (`01-requisitos.md` §15, 2026-10-07): normalización en el S3, junto con la extracción | Se siguió el slicing v2 |
