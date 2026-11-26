# Tasks — l1d-299-poblacion-dorado-suite

Orden: después de `l1d-292-poblacion-abanico-ingesta` (extractor), `l1d-293-estado-criterio-lista-poblacion` (reglas),
`l1d-244-eval-aplicabilidad-metadatos` (runner, `revision_muestra.py`) y US-233a / L1D-298 (`proveedor: local`).
Regresión [AC-T5.4] → US-074 activa desde que existe la familia. Sin cambios de API: no hay sección `## contratos`.
Sin TDD de contenido (prompts, modelos, corpus: suite `evaluate`); TDD estricto solo en métricas y veredicto.

> **Sprint 7 (movido-S7, 2026-11-22):** lo que falta está en la sección «Sprint 7» del final, agrupado por ventana
> (antes de la corrida base · corrida base · corrida final). Esa sección manda sobre los destinos antiguos de las tareas
> abiertas («corrida nocturna del S5», «D5-26»). Las tareas `[x]` no se tocan.

## 1. ai-services

- [ ] 1.1 (test después) `[HUMANO]` DIFERIDA -> H-1 (revisión del usuario). Ampliar `data/evaluation/corpus-metadatos/PLANTILLA.md` (valor, `scope`, fragmento y
      estado esperado por paciente de prueba) y revisión por el usuario (`l1d-117` 2.3, `l1d-244` 2.2, 20-40 min).
      Verificación: la plantilla ampliada se versiona en el PR. _Estado (L1D-299, continuación):_ la ampliación de `PLANTILLA.md` (valor, `scope`, fragmento, estado esperado, bucle) está escrita y versionada; solo falta la revisión del usuario (H-1).
- [ ] 1.2 (test después) DIFERIDA -> H-2 (revisor y fecha del manifiesto, humanos). Dataset `data/evaluation/poblacion-dorado/` (D2): `manifest.json` con clase, licencias, revisor
      y fecha; `pares.yaml` (≥ 30 pares, estratos guía/ensayo/revisión × es/en), `estados.yaml` (F-20…F-24) y
      `pares-bucle.yaml` (≥ 20, distintos del tamoxifeno). Verificación: la carga y el rechazo de un manifiesto sin
      licencia o sin revisor corren en el test de aceptación (verde). `[US-233b AC-1]` `[AC-8]` _Estado (L1D-299):_ la carga, las guardas de licencia/clase y la semilla sintética están hechas (`dataset_poblacion.py`, `data/evaluation/poblacion-dorado/`: 36 pares, 6 estratos, 24 del bucle, F-20…F-24; `4 tests` en `test_poblacion_dorado_versionado.py`). **Sigue sin marcar: el AC-1 exige revisor y fecha** y la semilla va con `revisor: {rol: null, fecha: null}` (la suite la marca «no concluyente»). Pendiente de la revisión humana (1.1); destino: H-2.
- [x] 1.3 (TDD estricto) Test de aceptación en rojo: "reporta precisión, cobertura y duplicados por criterio cuando se
      ejecuta la familia poblacion con la configuración falsa [US-233b AC-2]" · integración del runner. Esqueleto de
      `metricas/poblacion.py` con `raise NotImplementedError`. Commit `test(L1D-299)`. _Evidencia:_ rojo `af6d55b3` (22 tests, 21 en rojo por aserción: la suite no estaba registrada y salía con 2) → verde `9bc2b426`; `tests/evaluation/test_poblacion_dorado_aceptacion.py`.
- [x] 1.4 (TDD estricto) Test de aceptación en rojo: "sale con código ≠ 0 y nombra documento y criterio cuando una
      tarea termina con finish_reason length [US-233b AC-3]" · incluye variante sin contenido en mensaje y reporte.
      Commit `test(L1D-299)`. _Evidencia:_ rojo `af6d55b3` → verde `9bc2b426`; el mensaje y el reporte nombran documento y criterio sin prompt, salida ni fragmentos. El reintento que también se corta cuenta una vez. Los cortes del bucle (OUT-06) NO rompen la suite: alimentan su tasa.
- [x] 1.5 (TDD estricto) Test de aceptación en rojo: "cuenta aparte No coincide indebido y Coincide indebido cuando
      compara los estados esperados F-20…F-24 [US-233b AC-4]" · reglas reales de US-243, sin mocks de módulos propios.
      Commit `test(L1D-299)`. _Evidencia:_ rojo `af6d55b3` → verde `9bc2b426`; reglas reales de US-243 (`estado_de_poblacion`), catálogo `test-apl-1.2.0`.
- [x] 1.6 (TDD estricto) Test de aceptación en rojo: "no baja sin evidencia respecto del baseline y no invoca al LLM
      cuando la extracción de US-242 está activa [US-233b AC-5]" · con variante que baja. Commit `test(L1D-299)`. _Evidencia:_ rojo `af6d55b3` → verde `9bc2b426`; la suite `all` de `test-fake.yaml` se corre de verdad contra `data/evaluation/baseline.json`; variantes que bajan (0,8 frente a 1,0) y que invocan al LLM (`violaciones_rn02` 1).
- [x] 1.7 (TDD estricto) Test de aceptación en rojo: "marca OUT-06 cerrada solo con tasa de cortes 0 sobre ≥ 20 pares
      [US-233b AC-6]" · con variante de 19 pares y de tasa > 0. Commit `test(L1D-299)`. _Evidencia:_ rojo `af6d55b3` → verde `9bc2b426`; variantes de 20, 19 y 20 con un corte (`cerrada` / `insuficiente` / `abierta`). Con adapters falsos «cerrada» solo prueba la lógica: el cierre real de OUT-06 es la medición 2.1.
- [x] 1.8 (TDD estricto) Test de aceptación en rojo: "marca no concluyente y nunca PASS cuando el dorado no trae
      revisor o fecha [US-233b AC-7]". Commit `test(L1D-299)`. _Evidencia:_ rojo `af6d55b3` → verde `9bc2b426`; cuatro variantes (sin revisor, sin fecha, sin rol, sin nada) y muestra < 30 pares: nunca `pass`.
- [x] 1.9 (TDD estricto) Test de aceptación: "contiene solo corpus público con licencia y agregados, y el escaneo de PII
      no encuentra nada [US-233b AC-8]" · integración con el escáner de la CI y código 1 con manifiesto sin licencia.
      Commit `test(L1D-299)`. _Evidencia:_ rojo `af6d55b3` → verde `9bc2b426` (manifiesto sin licencia, con licencia no aceptada y con otra clase: código 1, sin reporte). `node scripts/ci/pii-scan.mjs` y `dataset-class-check.mjs` corridos a mano sobre el directorio: sin hallazgos; el job `data-scan` de la CI los vuelve a correr (3.2). **No hay un test de pytest que invoque el escáner.** Ojo: `dataset-class-check` solo admite `clase: sintetico`; un dorado real con `corpus_publico` exigirá ampliar ese chequeo.
- [x] 1.9b (TDD estricto; Decidido (usuario, 2026-10-30), Mayor de `clinical-language-auditor` en el Gate 2 de L1D-291) El recolector de textos generados de la suite `evaluate` (`apps/rag-orchestrator/app/evaluation/salida_generada.py`, `textos_de_respuesta`) recorre `applicability[].criteria[]` incluyendo `studyPopulationValue` y `studyPopulationValues[].value`, para que la métrica «salidas prescriptivas = 0» cubra los valores de población (RN-23). Test de aceptación en rojo: «marca salida prescriptiva cuando un studyPopulationValues[].value o un studyPopulationValue contiene un término prohibido sembrado [US-233b AC-9]» (con variante limpia que no marca). Commits `test(L1D-299)` y `feat(L1D-299)`. _Evidencia:_ rojo `44426fd2` (1 en rojo por aserción) → verde `7a115e08`; `salida_generada.textos_de_poblacion`, cubre `studyPopulationValue` y `studyPopulationValues[].value`.
- [x] 1.10 (TDD estricto) Implementar `metricas/poblacion.py` (`precision_por_criterio`, `cobertura_por_criterio`,
      `tasa_duplicados`, `cortes_por_longitud`, `concordancia_de_estados`, `sin_evidencia_vs_baseline`,
      `tasa_cortes_del_bucle`, `veredicto`) con unitarios uno a la vez, del caso más simple al siguiente. Reloj y
      semillas inyectados. Commit `feat(L1D-299)`. _Evidencia:_ `9bc2b426`; `metricas/poblacion.py` (19 unitarios en `test_metricas_poblacion.py`). Funciones puras: no necesitan reloj ni semilla.
- [x] 1.11 (TDD estricto) `dataset_poblacion.py` (carga, guardas de clase y licencia, revisor y fecha), familia
      `poblacion` en `config_suite.py`, `evaluate.py`, `composicion_poblacion.py`, `armado_reporte.py` y
      `esquema_suite.py`; metas en `eval/configs/test-poblacion.yaml` y `poblacion-local.yaml` (RN-22). Fuera de `all`.
      Commit `feat(L1D-299)`. _Estado (L1D-299), parcial:_ hecho `dataset_poblacion.py`, `config_poblacion.py`, `corrida_poblacion.py` (en lugar de `composicion_poblacion.py`/`armado_reporte.py`), familia `poblacion` en `SUITES` (fuera de `all`), `evaluate.py` y `esquema_suite.py`; metas en `eval/configs/test-poblacion.yaml` (`9bc2b426`, `757e15b3`). _Cierre (S7.1 y S7.2):_ `poblacion-local.yaml` y `proveedor: local` están hechos; solo queda la medición real (S7.4, bajo D5-26).

## 2. evaluación

- [ ] 2.1 TRASLADADA -> D5-26 (suite `evaluate`) Ejecutar `evaluate --suite poblacion` con `proveedor: local` en el MacBook de referencia
      sobre el dorado revisado; `ai-eval-runner` guarda el reporte en `reports/eval/` (precisión y cobertura por
      criterio, duplicados, `length` = 0, concordancia, «sin evidencia», tasa del bucle). Sin TDD de contenido. **TRASLADADA -> D5-26** (corrida nocturna del S5; sin LLM local ni revisor en esta corrida; depende de 1.1/1.2 y de cablear `proveedor: local` en `corrida_poblacion.py`). No se ejecutó.
- [x] 2.2 `run-ai-eval`: confirmar que `baseline.json` y la huella de `test-fake.yaml` no cambian. _Evidencia:_ `EVAL_PYTHON=… HF_HUB_OFFLINE=1 node scripts/eval/evaluate.mjs --suite all` da un reporte **byte a byte igual** a `data/evaluation/baseline.json` (huella `57b8a05d…`); `--suite aplicabilidad` y `--suite poblacion` salen con 0.

## 3. Verificación

- [x] 3.1 Suite Pytest de la familia y suites existentes del runner en verde; `openspec validate l1d-299-poblacion-dorado-suite --strict`. _Evidencia:_ `pytest` de `apps/rag-orchestrator` 3549 passed (187 deseleccionados por marca); `tests/evaluation` 900 passed; `ruff format --check` limpio; `lint-imports` 2 contratos kept; `contracts:verify-provider --proveedor rag-orchestrator` 311 respuestas; `openspec validate … --strict` válido. `ruff check` tiene 2 hallazgos previos (E741 en `test_barrido_configuracion.py`).
- [ ] 3.2 DIFERIDA -> entrega 2 (la CI del PR, que abre el orquestador). CI en verde (escaneo de secretos y PII sobre `data/evaluation/poblacion-dorado/`) antes de pedir el merge. CI aún sin correr: no se abrió PR (lo hace el orquestador).

## 4. Deuda absorbida (acelerada, 2026-10-31)

- [x] 4.1 D4-09 módulo estadístico único: `app/evaluation/estadistica.py` (`mediana`, `percentil_rango_mas_cercano`, `percentil_interpolado`); `cronometro`, `medicion_modelos`, `fase_a`, `fase_a3`, `retrieval_metrics` y `vm/dominio` delegan en él · _Evidencia:_ `4bc5903f` (`test_estadistica.py`; 851 passed en `tests/evaluation`). `armado_comparacion` usa `statistics.mean`, que no es mediana ni percentil: no se tocó.
- [x] 4.2 D4-04 (parcial) cobertura de aplicabilidad: pares `a-m2` con escala de desempeño no comparable (Karnofsky frente al ECOG del criterio → `desconocido` / `falta_en_paciente`), HER2 `requiere_revision` con `aviso: sin_verificar` sin cambiar el estado (RN-26) y análisis previo en `priorAnalyses` citado por el LLM falso (omitido, RN-24); `Esperado` gana el `aviso` opcional · _Evidencia:_ `5d86162f`. **Queda sin hacer:** la causa `escala_no_comparable` no existe en el contrato (el enum `unknownReason` de `openapi.yaml` no la tiene; añadirla es un cambio de contrato) y mover el armado del reporte fuera de `corrida_aplicabilidad.py` (refactor).
- [ ] 4.3 D4-13 medir la población del respaldo y la cobertura 0/1 del respaldo con el modelo local: **TRASLADADA -> D5-26**. `finish_reason` ya se mide en la familia `poblacion` (1.4) con adapters falsos; con el LLM real depende de 2.1.
- [ ] 4.4 D4-07 muestra etiquetada a mano del alcance elegibilidad/subgrupo/mención: **TRASLADADA -> H-1** (es trabajo `[HUMANO]`, se ata a 1.1) y el test del criterio vacío sin llamar al LLM sigue en `test_poblacion_abanico.py`.
- [ ] 4.5 D4-05 menores G2.B2–B4 y A1–A4 de `us-117b`: **TRASLADADA -> D5-27**; el detalle no está en el repo (solo «ver su Gate 2»).

## humano

- [ ] H-1 DIFERIDA -> H-1: revisar y firmar la ampliación de `data/evaluation/corpus-metadatos/PLANTILLA.md` (sección «conjunto dorado de
  población») y etiquetar a mano una muestra del alcance elegibilidad / subgrupo / mención (D4-07); 20-40 min.
- [ ] H-2 DIFERIDA -> H-2: revisar `data/evaluation/poblacion-dorado/` (`pares.yaml`, `estados.yaml`, `pares-bucle.yaml`) y completar
  `revisor.rol` y `revisor.fecha` en `manifest.json` (sin nombre, RN-10). Bloque literal de la clave `revisor`:

```json
"revisor": { "rol": "<rol del revisor>", "fecha": "<AAAA-MM-DD>" }
```

## deuda (propuesta de ID, sin tocar aquí)

- [ ] D5-26 DIFERIDA -> D5-26 (S7: el cableado y `poblacion-local.yaml` ya están por S7.1 y S7.2; queda la medición, S7.4): cablear `adaptadores.proveedor: local` en `corrida_poblacion.py` (LLM local por Ollama, NLI por ONNX, mismo
  patrón que `modelos_locales.cargar_puertos_locales`), crear `eval/configs/poblacion-local.yaml` (metas en RN-22) y ejecutar
  `evaluate --suite poblacion` en la corrida nocturna sobre el dorado revisado (2.1, 4.3); el reporte va a
  `reports/eval/` (ruta protegida: la escribe `ai-eval-runner`).
- [ ] D5-27 DIFERIDA -> D5-27: menores G2.B2–B4 y A1–A4 de `us-117b` (D4-05): el detalle no está en el repo.

## Sprint 7 (movido-S7) · proveedor local, medición y dorado ampliado

> Alcance: `proposal.md` («Alcance del Sprint 7») y `design.md` (S7-D1…S7-D5). Regla del sprint: ninguna cifra sin
> reporte versionado en `reports/eval/` producido por `run-ai-eval` (ruta protegida para el implementador). El revisor
> del dorado sigue siendo «IA, provisional»: precisión y cobertura «no concluyentes», nunca PASS.

### (a) Antes de la corrida base · código sin modelos reales

- [x] S7.1 (TDD estricto) Cierra **1.11** y la parte de código de **D5-26**. Tests de aceptación en rojo: «corre y declara
      proveedor local cuando la configuración es poblacion-local [US-233b AC-2]» y «termina con código ≠ 0 nombrando la
      variable y sin reporte cuando falta un peso o el proveedor es de nube [US-233b AC-2]» · integración con
      adaptadores falsos en el puerto · commit `test(L1D-299)`. _Evidencia:_ rojo `7cedcc11` (6 tests en rojo por aserción: la corrida salía con 2 «se cablea con la medición real») → verde `a20776fc`; `tests/evaluation/test_poblacion_proveedor_local.py` (6 tests: corre y declara local, falta un peso, modelo de nube ×2, URL no local, corte por longitud del LLM real). El único cambio al test entre rojo y verde es su fixture de NLI (el léxico rechazaba la hipótesis verbalizada), sin tocar aserciones.
- [x] S7.2 Cablear `adaptadores.proveedor: local` en `corrida_poblacion.py` (patrón de
      `modelos_locales.cargar_puertos_locales`) y crear `eval/configs/poblacion-local.yaml` (metas en RN-22) · commit
      `feat(L1D-299)` · verificación: S7.1 en verde, `--suite poblacion` falsa y `--suite all` sin cambio de huella. _Evidencia:_ `a20776fc`; `--suite all` byte a byte igual a `data/evaluation/baseline.json` (huella `57b8a05d…`). El LLM real nunca corre en la CI: la prueba usa `respx` contra un Ollama fingido y pesos de ONNX falsos en el puerto del cargador.
- [ ] S7.3 TRASLADADA -> entrega 1 (la CI del PR, que abre el orquestador). Cierra **3.2**: CI del PR en verde (secretos y PII sobre `data/evaluation/poblacion-dorado/`) antes de pedir el
      merge.

#### Dorado que no depende de `l1d-126` parte B (datos y código, sin modelos reales)

Ventana: **antes de la corrida base** (design S7-D5; misma política que `l1d-246`). Así la base y la final miden el
mismo dorado. S7.5–S7.8, S7.11 y S7.12 no esperan a `l1d-126`.

- [x] S7.5 (TDD estricto) `revision_provisional` en el manifiesto: test de aceptación en rojo «queda no concluyente y
      declara la revisión provisional cuando el manifiesto solo trae revision_provisional de rol ia [US-233b AC-7]» ·
      validación en `dataset_poblacion.py` con la regla pura compartida de forma (design S7-D2: si `l1d-246` o
      `l1d-334` ya la crearon, se importa; si no, se crea aquí y ellos la importan; nunca dos copias) ·
      `test(L1D-299)` y `feat(L1D-299)`. `manifest.json`: `revision_provisional: {rol: ia, fecha: 2026-11-21}`;
      `revisor` sigue en `null`. _Evidencia:_ rojo `a848a04e` (6 en rojo por aserción) → verde `6c50614b`; se importa `exigir_revision_provisional` de `app/evaluation/revision_provisional.py` (creada por l1d-334, usada por l1d-246: una sola copia). El reporte declara `configuracion.revision_provisional`; el veredicto sigue `no_concluyente` con la causa `sin_revisor`.
- [x] S7.6 (TDD estricto) Métricas nuevas en `metricas/poblacion.py`, puras y con unitarios uno a uno: precisión y
      cobertura por tipo de redacción, valores indebidos en distractores y recuento de la rendija de C-3; tests de
      aceptación en rojo antes [US-233b AC-2] [US-233b AC-4]; sección nueva en `esquema_suite.py` · solo agregados e ids. _Evidencia:_ rojo `5b9c8b52` (7 en rojo por aserción) → verde `01491b3a`; 7 unitarios nuevos en `test_metricas_poblacion.py`. El reporte gana `por_redaccion`, `por_tipo_de_redaccion`, `distractores` y `rendija_c3`, informativas: no entran en el veredicto.
- [x] S7.7 (datos, test después · D-1, parte sin `l1d-126`) Pares de próstata en `pares.yaml` de `estado_castracion`,
      `isup`, `ecog` y `linea_tratamiento` × guía, ensayo y revisión × es/en; licencias en `manifest.json`. Los de
      `extension` y `hrr_brca` van en S7.10b; el total de ≥ 16 pares de próstata se comprueba al cerrar S7.10b.
      Test de carga [US-233b AC-1]. _Evidencia:_ `3a91bdbe`; 6 documentos y 14 pares de próstata (los 4 criterios × guía/ensayo/revisión × es/en, cada celda); `test_poblacion_dorado_versionado.py`.
- [x] S7.8 (datos, test después · D-2, D-3, D-4 y C-3) ≥ 12 casos difíciles con su `redaccion` y tipo (negación, rango,
      definición implícita, inclusión total, umbral, tabla) y ≥ 8 distractores de subgrupo o mención, sobre criterios
      que la parte B de `l1d-126` no toca; reescritura de las frases sin sentido clínico de `pares.yaml` («tenían
      mujeres posmenopáusicas»), salvo el etiquetado del triple negativo; y en `estados.yaml` los casos de C-3 con
      criterios de mama y el esperado de la regla vigente (fixture `test-apl-1.2.0`). Texto sintético, descriptivo
      (RN-23), sin NCCN ni ESMO, sin datos de pacientes. Test de carga [US-233b AC-1] y de aceptación [US-233b AC-4]. _Evidencia:_ `3a91bdbe`; 12 casos difíciles (2 por tipo), 8 distractores, 12 frases de la semilla reescritas (el triple negativo se dejó como estaba: S7.9) y 4 casos C-3 de mama (menopáusico ×2, línea, ECOG) con esperado `desconocido`, que las reglas vigentes confirman (9/9 de concordancia). Los criterios usados no son `extension`, `estado_her2`, `receptores_hormonales` ni `hrr_brca`.
- [x] S7.11 Subir `version` del manifiesto del dorado; `pii-scan` y `dataset-class-check` sin hallazgos; `--suite poblacion`
      falsa en verde y `--suite all` igual a `data/evaluation/baseline.json`. Se repite al cerrar S7.10b. _Evidencia:_ `version` del manifiesto `s7-1` (`0-semilla` antes); `pii-scan` y `dataset-class-check` sin hallazgos; `--suite poblacion` falsa: 70 pares, estratos guía/ensayo/revisión × es/en, no concluyente por `sin_revisor`, precisión y cobertura 1,0 con adapters falsos (prueba el abanico y la recuperación léxica, no el modelo); `--suite all` igual al baseline.
- [x] S7.12 Refactor: Extract Method / Inline Method en los archivos tocados, sin cambio de comportamiento, tests en verde
      antes y después, commit `refactor(L1D-299)`. _Evidencia:_ `f0d2a1b4`: Extract · `corrida_poblacion.py:_reporte` → `_cortes_del_reporte`, `_sin_evidencia_del_reporte`, `_bucle_del_reporte`; Extract · `dataset_poblacion.py:_exigir_redaccion` → `_tipo_corresponde_a_la_redaccion`; test renombrado. `tests/evaluation` 1336 passed antes y después.

### (b) Corrida base

- [ ] S7.4 TRASLADADA -> D5-26 (corrida base por `ai-eval-runner`, humano). Cierra **2.1** y **4.3** (D4-13): `evaluate --suite poblacion --config eval/configs/poblacion-local.yaml` en la
      máquina de referencia por `ai-eval-runner` (`run-ai-eval`), junto con `l1d-119`, `l1d-246`, `l1d-113`, `l1d-329` y
      `l1d-333`, sobre el dorado ya ampliado en lo que no depende de `l1d-126` parte B (S7.5–S7.8), con los umbrales
      actuales (`[S7 resp. 11]`) y los documentos del dorado como corpus declarado (`[S7 resp. 10]`); reporte en
      `reports/eval/` con precisión y cobertura por
      criterio, duplicados, cortes por longitud, concordancia, «sin evidencia» y tasa del bucle, marcado «no
      concluyente». OUT-06 solo se anota «cerrada» si la tasa de cortes es 0 sobre ≥ 20 pares (AC-6).

### Entre la corrida base y la final · solo lo que depende de `l1d-126` parte B (C-1, C-2, C-4, C-5)

Orden de merge: `l1d-126` parte A → corrida base → `l1d-335` (`1.10.0`) → `l1d-126` parte B (`1.11.0`) → S7.9, S7.10 y
S7.10b. Estos casos llevan la marca de ventana del design S7-D5 para que el reporte los separe.

- [x] S7.9 (datos · D-4, C-4) Etiquetar el triple negativo como en C-4 (receptor hormonal positivo y triple negativo en
      la misma cohorte se declara inclusiva). _Evidencia:_ `9176b5b9`; los tres fragmentos con «hormone receptor-positive,
      triple-negative» dicen ahora «the cohort includes both … and …», el triple negativo pasa a `elegibilidad` y se proyecta también en
      `estado_her2` (HER2 negativo); los 6 pares llevan `ventana: tras_catalogo_s7`. Test `[US-233b AC-1]`
      `test_el_triple_negativo_se_declara_inclusivo_y_se_proyecta_en_los_dos_criterios_como_en_c_4`.
- [x] S7.10 (datos y fixture · D-5) `estados.yaml`: un caso por regla F-20…F-23 con `estado_castracion` y los casos de
      `extension` (C-1); fixture de catálogo de test nuevo con reglas de próstata y `catalogo_de_estados` apuntando a él (design
      S7-D4). _Evidencia:_ rojo `5ba7aaf0` (12 tests en rojo por aserción) → verde `9176b5b9`. Fixture
      `apps/rag-orchestrator/tests/fixtures/catalogo/test-apl-1.11.0/` (mama y próstata: `aplicabilidad.json` y `poblacion-reglas.json` copiados del
      catálogo `1.11.0`; se llama `1.11.0` y no `1.3.0` porque `test-apl-1.3.0` ya existe para `l1d-126` y solo trae `extension`/HER2). 9 casos nuevos
      con `ventana: tras_catalogo_s7`: `F-20p`, `F-21p`, `F-21pb` (restricción explícita), `F-22p`, `F-23p` (`estado_castracion`) y `C-1a` (M0 con «only
      metastatic» → no_coincide), `C-1b` (M1b → coincide), `C-1c` (sin marcador → desconocido), `C-1d` (`T2c`, repliegue → desconocido). La parte B se mergeó con la lectura de M0/M1, así que el
      esperado es el del supuesto SC-1 y no el de repliegue total. Test `[US-233b AC-4]`
      `test_el_dorado_concuerda_con_las_reglas_del_catalogo_1_11_0_en_castracion_y_extension_sin_indebidos` (concordancia 100 % y 0 indebidos con las reglas reales).
- [x] S7.10b (datos, test después · D-1, C-1, C-2 y C-5) Pares de `extension` y `hrr_brca` × guía, ensayo y revisión ×
      es/en con los códigos del catálogo `1.11.0`, y los casos sobre HER2 bajo. Con ellos el dorado llega a ≥ 16 pares
      de próstata. Subir otra vez la `version` del dorado y repetir S7.11. _Evidencia:_ `9176b5b9`; 12 pares nuevos (6 de `extension`, 6 de `hrr_brca`, cada
      una de las seis celdas), 26 pares de próstata en total (14 + 12) y 4 de HER2 bajo (un `dificil`/`definicion_implicita` con «IHC 1+ o 2+ con ISH negativo»);
      `version` del manifiesto `s7-2`. S7.11 repetido: `pii-scan` y `dataset-class-check` sin hallazgos y `--suite poblacion` falsa en verde (no concluyente por `sin_revisor`); `--suite all` igual al baseline
      (ver el reporte de la entrega). Test `[US-233b AC-1]` `test_el_dorado_trae_pares_de_extension_y_hrr_brca_en_las_seis_celdas_y_llega_a_16_de_prostata` y
      `..._her2_bajo_...`. **Ventana (S7-D5):** el dataset admite `ventana: tras_catalogo_s7` (`dataset_poblacion.VENTANAS`) y el reporte gana `metricas.por_ventana` y
      `concordancia.por_ventana` (informativas, no entran en el veredicto): lo agregado o cambiado tras la corrida base queda **no comparable con la base**. Sin LLM real: la medición de estos pares va a la corrida final (S7.13).
- [ ] S7.13 TRASLADADA -> entrega 3 (corrida final por `ai-eval-runner`). `evaluate --suite poblacion` con modelos locales sobre el dorado ampliado y el catálogo del S7 (`l1d-126`
      parte B), por `ai-eval-runner`, con los umbrales actuales (`[S7 resp. 11]`); reporte en `reports/eval/`, leído por
      criterio, por tipo de cáncer y por tipo de redacción, que declara el corpus (los documentos del dorado,
      `[S7 resp. 10]`). La comparación con la corrida base vale para lo que ya estaba en la base; lo añadido en S7.9,
      S7.10 y S7.10b se declara no comparable con la base. Es también la no regresión que piden `l1d-126` y `l1d-335`.
- [ ] S7.14 TRASLADADA -> entrega 3 (cierre del change). Cierre: `openspec validate l1d-299-poblacion-dorado-suite --strict`; Pytest de `tests/evaluation` en verde;
      CI con 0 fallos, 0 pendientes y 0 alertas antes de pedir el merge.

### Fuera del S7

- **1.1, 1.2, 4.4, H-1 y H-2** (revisión y firma humanas de la plantilla y del dorado): siguen abiertas. Sin ellas el
  dorado no pasa de «no concluyente».
- **4.5 y D5-27** (menores de `us-117b`, sin detalle en el repo): no entran.

