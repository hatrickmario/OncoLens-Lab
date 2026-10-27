# Tasks — l1d-244-eval-aplicabilidad-metadatos

Orden: después de `l1d-127-estado-criterio-estructurado`, `l1d-128-aplicabilidad-textual-citada`,
`l1d-129-aplicabilidad-causas-avisos` y `l1d-126-criterios-aplicabilidad-catalogo` (`studyKey` por criterio, del que
dependen las claves de `population_criteria` del dataset `[S3 resp. 16]`). Sin cambios de API: no hay sección
`## contratos`.

## 1. ai-services

- [x] 1.1 (test después) Dataset `data/evaluation/aplicabilidad/` (D2): `manifest.json` con `clase: sintetico` y
      `catalogVersion: test-apl-1.0.0`, contextos A-M1 y P-A1, fuentes `doc-a1`…`doc-a5` de FX-08b-a más una de
      próstata evaluada con el catálogo real (`test-apl-1.0.0` no tiene criterios de próstata; claves de `population_criteria`
      según el `studyKey` del catálogo, `[S3 resp. 16]`),
      `pares.yaml` con el estado y la causa esperados por criterio y los guiones `APL-OK`,
      `APL-SIN-SOPORTE`, `APL-VALOR-PACIENTE`, `APL-CITA-AJENA`. Verificación: la carga y el rechazo del manifiesto no sintético
      corren en `test_aplicabilidad_aceptacion.py` (verde).
- [x] 1.2 (test después) *Desviación:* las fixtures viven junto al dataset (`data/evaluation/aplicabilidad/revision-muestra.yaml` y `corpus-catalogo.yaml`, `clase: sintetico`) y las variantes (pendiente, mal formada, sin archivo, sin vigentes) se generan en `tmp_path` dentro de los tests. Fixtures de test: muestra de revisión sintética (19
      `correcto` + 1 `incorrecto`; variante con `pendiente`; variante mal formada) y catálogo del corpus de test de
      10 + 2 documentos del AC-3. Verificación: test de humo de lectura en verde.
- [x] 1.3 (TDD estricto) Test de aceptación en rojo: "reporta la concordancia de estados, cero coincidencias sin
      cita y cero valores no copiados cuando se ejecuta la familia aplicabilidad con la configuración falsa
      [US-132 AC-1]" · integración del runner (incluye A-M1 × `doc-a1`, `APL-VALOR-PACIENTE`, `APL-SIN-SOPORTE`,
      `APL-CITA-AJENA`, el rechazo del manifiesto no sintético y el código 2 con un `studyKey` que no resuelve,
      `[S3 resp. 16]`). Esqueleto de `metricas/aplicabilidad.py` con
      `raise NotImplementedError`. Commit `test(L1D-244)`.
- [x] 1.4 (TDD estricto) Test de aceptación en rojo: "sale con código 3 y nombra la métrica cuando M-08.2 (Criterios en
      Coincide sin cita) o M-08.6
      son mayores que cero [US-132 AC-2]" · integración del runner con resultados construidos con tipos de dominio
      (sin mocks de módulos propios), y código 0 con ambas en cero. Commit `test(L1D-244)`.
- [x] 1.5 (TDD estricto) *(runner con el lector en memoria; el adapter SQL real con `rag_corpus` en `tests/integration/corpus_store/test_catalogo_cobertura_poblacion.py`, `-m servicios_reales`)* Test de aceptación en rojo: "reporta la versión de CORPUS_CUTOFF_DATE y la cobertura 0,70
      fuera de meta sobre los documentos vigentes [US-132 AC-3]" (con metadatos = al menos una clave distinta de
      `no_disponible`, `[S3 resp. 16]`) · integración con PostgreSQL `corpus` real y el rol
      `rag_corpus` (incluye coincidencia con `meta.corpusRelease`, `null` sin vigentes y código 1 con el catálogo
      caído). Commit `test(L1D-244)`.
- [x] 1.6 (TDD estricto) Test de aceptación en rojo: "reporta exactitud 0,95 en meta con 2 documentos y 20 campos
      cuando se lee la muestra revisada [US-132 AC-4]" · integración del runner (pendientes aparte, `null` sin
      archivo, código 2 con `revision` desconocida, sin `valor` ni `nota` en el reporte). Commit `test(L1D-244)`.
- [x] 1.7 (TDD estricto) Test de aceptación en rojo: "da métricas y huella idénticas cuando la familia aplicabilidad
      se ejecuta dos veces con la configuración falsa [US-132 AC-5]" · integración con reloj inyectado. Commit
      `test(L1D-244)`.
- [x] 1.8 (TDD estricto) Extraer `concordancia_de_estados()`, `coincide_sin_cita()` (RN-01, M-08.2),
      `valores_no_copiados()` (ADR-34, M-08.6) y `veredicto_de_invariantes()` en `metricas/aplicabilidad.py` con
      unitarios uno a la vez (sin criterios; todos esperados; un estado distinto; `coincide` sin cita; cita de otra
      fuente; `null` en ambos valores; valor distinto). Verificación: unitarios en verde. Commit `feat(L1D-244)`.
- [x] 1.9 (TDD estricto) *Desviaciones:* la composición y el armado del reporte viven en `corrida_aplicabilidad.py`
      (no se toca `composicion_suite.py` ni `armado_reporte.py`), la configuración en `config_aplicabilidad.py`, y las
      metas (RN-22) en el bloque `metas:` de `test-aplicabilidad.yaml`, no en `metas-iniciales.yaml` (que las leen el
      informe del baseline y otros consumidores). Familia `aplicabilidad` en `config_suite.py`, `evaluate.py` (código
      3) y `esquema_suite.py`; puerto `LectorDeCoberturaDePoblacion` con adapter SQL
      (`rag_corpus`) y en memoria; `revision_muestra.py`; metas `cobertura_poblacion` y
      `exactitud_extraido_verificado` en `metas-iniciales.yaml` sin tocar las existentes (ver desviación); configuración propia
      `test-aplicabilidad.yaml` (no se toca `test-fake.yaml` ni `baseline.json`) y selección de config en el envoltorio. Verificación: 1.3–1.7 en verde. Commit `feat(L1D-244)`.
- [x] 1.10 (test después) No-fuga: el reporte y la salida de la familia no contienen `patientValue`, valores de
      metadatos, notas de revisión ni textos de chunks. Verificación: test con captura de salidas en verde.
- [x] 1.11 (test después) Regresión: suites existentes de `app/evaluation` (familias `retrieval`, `generation`,
      `pii`, `all`) en verde sin cambiar aserciones. Verificación: Pytest de `tests/evaluation` en verde.
- [x] 1.12 *(Extract · `domain/cobertura_poblacion.py:contar_cobertura` · una sola agregación para el adapter SQL y el catálogo en memoria, hallazgo Mayor 1; Extract · `corrida_aplicabilidad.py:_servicio_textual` · hallazgo 4; el hallazgo 2 —nombres privados de `config_suite`—, 3 y 5 quedan como deuda menor sin ID.)* Refactor: Extract Method / Inline Method en los archivos tocados, sin cambio de comportamiento, tests en
      verde antes y después, commit `refactor(L1D-244)`.

## 2. evaluación

- [x] 2.1 (evaluate) `run-ai-eval` en el PR: las familias existentes mantienen sus métricas y la familia
      `aplicabilidad` da M-08.2 = 0 y M-08.6 = 0 con la configuración falsa. Verificación: `reports/eval/l1d-244-eval-aplicabilidad-metadatos.md` (PASS; `all` idéntico a `baseline.json`).
- [ ] 2.2 TRASLADADA a US-233 (S4) / tarea `[HUMANO]` de l1d-117 (evaluate) `[HUMANO]` dependiente: cuando el usuario complete la revisión de la muestra de
      `l1d-117-metadatos-poblacion-verificados` `[S3 resp. 13]`, ejecutar la familia sobre ese archivo y anotar
      M-08.4 en el PR; si no hay documentos `extraido_verificado` en el S3, diferir a US-233. Verificación: valor o
      `null` con causa en el reporte.

## 3. Verificación

- [x] 3.1 `openspec validate l1d-244-eval-aplicabilidad-metadatos --strict` en verde.
- [x] 3.2 Suite de `apps/rag-orchestrator` en verde (Pytest unitarios, evaluación e integración); sin cambios de API,
      no aplican `contracts:verify-provider` ni `contracts:breaking`.
