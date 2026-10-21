# Tasks — l1d-205-adr40-deteccion-pii

> Historia de ADR (US-013 · ADR-40). Matriz TDD: ADR y mediciones **exento**; scripts, dataset y
> configuración **test después** (test en el mismo PR); la elección del detector es **evaluate**.
> Sin cambios de API (no hay `## contratos`). Solo datos sintéticos. Encuadre decidido en P-2 (`[S2 resp. 2]`).

## 1. ai-services

- [x] 1.1 Dataset `data/eval/pii-mini/`: generador versionado, textos sintéticos (pregunta, notas,
      eventos, atributos, texto de documento) con PII sembrada etiquetada por *span* y tipo, formatos
      de ≥ 3 países (valores de rangos reservados: `@example.test`, teléfonos ficticios, documentos
      sin titular), términos clínicos de control y `manifest` con `clase: sintetico`; test de humo
      (conteo, manifiesto, cada texto con etiquetas) y alta en `dataset-class-check` · **test después**
      `[US-013 AC-1]` `[RN-14]`
- [x] 1.1b Admitir `pii-mini` en el `pii-scan` **por valor**: entrada en `config/pii-allowlist.json`
      (`clase: sintetico`, `rutas: ["data/eval/pii-mini/**"]`, `valores` con `{ formato, sha256 }` de
      `pii-scan.mjs --hash`); sin tocar `config/pii-scan.json` ni `EXCLUSIONES_PERMITIDAS`. Verificación:
      `pii-scan` en verde y un valor sembrado nuevo no listado lo rompe · **test después** `[RN-14]`
      > Cumplida sin allowlist (instrucción del orquestador: no tocarla): los valores sembrados se
      > generan en memoria con `generar.py` y no se versionan; `pii-scan` y `dataset-class-check` en 0.
      > Ver design.md "Resultados y desviaciones".
- [x] 1.2 Script `app/scripts/adr40/` (candidatos 1 y 2; 3 corridas, mediana; JSON de agregados en
      `reports/adr40/`) y funciones puras `sensibilidad_por_tipo()`, `falsos_positivos_clinicos()`,
      `elegir_mas_simple_que_cumple()` (G-8); `es_core_news_md` 3.8.0 solo en `requirements-eval.txt` ·
      **test después** `[US-013 AC-1]`
- [x] 1.3 Tests Pytest del script: sensibilidad e IC con un fake de detector, descarte < 0,95, empate
      → más simple, ninguno cumple → código ≠ 0, reporte sin valores de PII · **test después**
- [ ] 1.4 **[HUMANO]** (medido aquí sin el stack: ver design.md; falta RSS con el stack y G cargado) Medición de 1 y 2 en la máquina de referencia (RSS con el stack y G cargado) ·
      **evaluate** `[US-013 AC-1]`
- [x] 1.5 Redactar `docs/architecture/adr/ADR-40-deteccion-pii.md` (MADR): candidatos, descartes,
      regla D2, tabla medida, decisión, punto de enmascaramiento (AC-2), identidad exacta (AC-3),
      formatos en configuración (AC-4), motor de `pii/` e `identityFound` (AC-5), claves (AC-6);
      estado `propuesto` · **exento** `[US-013 AC-1…AC-6]`
- [ ] 1.6 Fila de ADR-40 en `docs/architecture/adr/README.md` (hecha) y marca en `backlog/02-adrs.md` (al
      implementarse; pendiente: fuera de los paths de ai-services-dev) · **exento**
- [x] 1.7 Refactor: Extract Method / Inline Method en los archivos tocados, sin cambio de
      comportamiento, tests en verde antes y después, commit refactor(L1D-205)

## 2. clinical-platform

- [ ] 2.1 Comando `npm run eval:pii` en `clinical-api`: corre el detector opción A sobre `pii-mini`
      y escribe JSON de agregados (sensibilidad por tipo, FP clínicos, p95); test de integración del
      comando con tiempo máximo explícito (proceso real) · **test después** `[US-013 AC-1]`
- [ ] 2.2 Test de configuración: ningún patrón de país literal fuera de `config/pii-formats.json` ·
      **test después** `[US-013 AC-4]` `[RN-22]`
- [ ] 2.3 Refactor: Extract Method / Inline Method en los archivos tocados, sin cambio de
      comportamiento, tests en verde antes y después, commit refactor(L1D-205)

## 3. evaluación

- [ ] 3.1 `ai-eval-runner` revisa el reporte de `reports/adr40/` (métrica PII ≥ 0,95) · **evaluate**

## 4. Verificación

- [x] 4.1 `openspec validate l1d-205-adr40-deteccion-pii --strict` en verde
- [ ] 4.2 Tests de `rag-orchestrator` y `clinical-api` en verde; sin `contracts:verify-provider`
- [ ] 4.3 `run-ai-eval` (familia `pii`) si la suite ya existe (US-072b); si no, la revisión 3.1
