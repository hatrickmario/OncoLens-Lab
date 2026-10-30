# Tasks — l1d-299-poblacion-dorado-suite

Orden: después de `l1d-292-poblacion-abanico-ingesta` (extractor), `l1d-293-estado-criterio-lista-poblacion` (reglas),
`l1d-244-eval-aplicabilidad-metadatos` (runner, `revision_muestra.py`) y US-233a / L1D-298 (`proveedor: local`).
Regresión [AC-T5.4] → US-074 activa desde que existe la familia. Sin cambios de API: no hay sección `## contratos`.
Sin TDD de contenido (prompts, modelos, corpus: suite `evaluate`); TDD estricto solo en métricas y veredicto.

## 1. ai-services

- [ ] 1.1 (test después) `[HUMANO]` Ampliar `data/evaluation/corpus-metadatos/PLANTILLA.md` (valor, `scope`, fragmento y
      estado esperado por paciente de prueba) y revisión por el usuario (`l1d-117` 2.3, `l1d-244` 2.2, 20-40 min).
      Verificación: la plantilla ampliada se versiona en el PR.
- [ ] 1.2 (test después) Dataset `data/evaluation/poblacion-dorado/` (D2): `manifest.json` con clase, licencias, revisor
      y fecha; `pares.yaml` (≥ 30 pares, estratos guía/ensayo/revisión × es/en), `estados.yaml` (F-20…F-24) y
      `pares-bucle.yaml` (≥ 20, distintos del tamoxifeno). Verificación: la carga y el rechazo de un manifiesto sin
      licencia o sin revisor corren en el test de aceptación (verde). `[US-233b AC-1]` `[AC-8]`
- [ ] 1.3 (TDD estricto) Test de aceptación en rojo: "reporta precisión, cobertura y duplicados por criterio cuando se
      ejecuta la familia poblacion con la configuración falsa [US-233b AC-2]" · integración del runner. Esqueleto de
      `metricas/poblacion.py` con `raise NotImplementedError`. Commit `test(L1D-299)`.
- [ ] 1.4 (TDD estricto) Test de aceptación en rojo: "sale con código ≠ 0 y nombra documento y criterio cuando una
      tarea termina con finish_reason length [US-233b AC-3]" · incluye variante sin contenido en mensaje y reporte.
      Commit `test(L1D-299)`.
- [ ] 1.5 (TDD estricto) Test de aceptación en rojo: "cuenta aparte No coincide indebido y Coincide indebido cuando
      compara los estados esperados F-20…F-24 [US-233b AC-4]" · reglas reales de US-243, sin mocks de módulos propios.
      Commit `test(L1D-299)`.
- [ ] 1.6 (TDD estricto) Test de aceptación en rojo: "no baja sin evidencia respecto del baseline y no invoca al LLM
      cuando la extracción de US-242 está activa [US-233b AC-5]" · con variante que baja. Commit `test(L1D-299)`.
- [ ] 1.7 (TDD estricto) Test de aceptación en rojo: "marca OUT-06 cerrada solo con tasa de cortes 0 sobre ≥ 20 pares
      [US-233b AC-6]" · con variante de 19 pares y de tasa > 0. Commit `test(L1D-299)`.
- [ ] 1.8 (TDD estricto) Test de aceptación en rojo: "marca no concluyente y nunca PASS cuando el dorado no trae
      revisor o fecha [US-233b AC-7]". Commit `test(L1D-299)`.
- [ ] 1.9 (TDD estricto) Test de aceptación: "contiene solo corpus público con licencia y agregados, y el escaneo de PII
      no encuentra nada [US-233b AC-8]" · integración con el escáner de la CI y código 1 con manifiesto sin licencia.
      Commit `test(L1D-299)`.
- [ ] 1.10 (TDD estricto) Implementar `metricas/poblacion.py` (`precision_por_criterio`, `cobertura_por_criterio`,
      `tasa_duplicados`, `cortes_por_longitud`, `concordancia_de_estados`, `sin_evidencia_vs_baseline`,
      `tasa_cortes_del_bucle`, `veredicto`) con unitarios uno a la vez, del caso más simple al siguiente. Reloj y
      semillas inyectados. Commit `feat(L1D-299)`.
- [ ] 1.11 (TDD estricto) `dataset_poblacion.py` (carga, guardas de clase y licencia, revisor y fecha), familia
      `poblacion` en `config_suite.py`, `evaluate.py`, `composicion_poblacion.py`, `armado_reporte.py` y
      `esquema_suite.py`; metas en `eval/configs/test-poblacion.yaml` y `poblacion-local.yaml` (RN-22). Fuera de `all`.
      Commit `feat(L1D-299)`.

## 2. evaluación

- [ ] 2.1 (suite `evaluate`) Ejecutar `evaluate --suite poblacion` con `proveedor: local` en el MacBook de referencia
      sobre el dorado revisado; `ai-eval-runner` guarda el reporte en `reports/eval/` (precisión y cobertura por
      criterio, duplicados, `length` = 0, concordancia, «sin evidencia», tasa del bucle). Sin TDD de contenido.
- [ ] 2.2 `run-ai-eval`: confirmar que `baseline.json` y la huella de `test-fake.yaml` no cambian.

## 3. Verificación

- [ ] 3.1 Suite Pytest de la familia y suites existentes del runner en verde; `openspec validate l1d-299-poblacion-dorado-suite --strict`.
- [ ] 3.2 CI en verde (escaneo de secretos y PII sobre `data/evaluation/poblacion-dorado/`) antes de pedir el merge.
