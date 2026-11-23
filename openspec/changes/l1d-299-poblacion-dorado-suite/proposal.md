# Proposal — l1d-299-poblacion-dorado-suite

## Trazabilidad

L1D-299 · US-233b (partida de US-233, `[S4 resp. 6b]`) · FEAT-T5a (OL-06) · Sprint 4 · Estimación **3** · historia
técnica (PRD §17) · FR-20, FR-25 · TBD-02, TBD-20 · M-08.3, M-08.4 · AC-1…AC-8 de US-233b · `[S4 resp. 3]`
`[S4 resp. 6]` `[S4 resp. 8]` · ADR-47 (aceptado; riesgos `ADR47-R1`, `R2`, `R4`, `R9`, `R17`) · DEC-11 (US-021; casos
F-20…F-24) · M-08.2 · RN-02 · RN-14 · RN-21 · RN-22 · OUT-06 · G-4 · Regresión [AC-T5.4] → US-074 (PR que cambia
prompt, modelo, catálogo o corpus).

## Por qué

La aplicabilidad del S4 depende de que el extractor en abanico (US-242) saque la población del estudio por criterio y de
que las reglas con listas (US-243) calculen los estados que DEC-11 acepta. Sin un conjunto dorado revisado por una persona
y una suite que lo mida, nadie sabe si la aplicabilidad "dice la verdad" antes de enseñarla en la demo, ni si el bucle de
repetición que causó OUT-06 está de verdad cerrado (`ADR47-R4`, `R17`), ni si el nuevo extractor degrada «sin evidencia»
(RN-02). US-233 se partió (`[S4 resp. 6b]`): US-233a cablea los adaptadores locales; esta historia mide la población.

## Qué cambia

- **Conjunto dorado `data/evaluation/poblacion-dorado/`** (manifiesto `clase: sintetico`/corpus público con licencia
  aceptada, solo agregados en el reporte): por (documento, criterio, fragmento) los valores esperados con su `scope`, el
  rol del revisor y la fecha; ≥ 30 pares documento × criterio estratificados por tipo de fuente (guía, ensayo, revisión)
  e idioma (es/en) (tamaño mínimo asumido). Se alimenta de la muestra humana con `PLANTILLA.md` ampliada
  (tareas `[HUMANO]` `l1d-117` 2.3 y `l1d-244` 2.2); la revisión la hace el usuario (20-40 min).
- **Suite `evaluate --suite poblacion`** (nueva familia del runner, `proveedor: local`): precisión y cobertura por
  criterio frente a metas en configuración (RN-22, provisionales hasta DEC-07), tasa de duplicados (M-08.3, M-08.4),
  `finish_reason = length` = 0 (sale con código ≠ 0 nombrando documento y criterio, sin contenido), concordancia de
  estados contra los casos F-20…F-24 con conteo aparte de No coincide indebido (`ADR47-R2`) y Coincide indebido
  (`ADR47-R1`), regresión de «sin evidencia» contra el baseline (cero invocaciones del LLM) y la repetición de la causa
  del bucle en ≥ 20 pares pregunta + fuentes distintos del tamoxifeno: OUT-06 solo «cerrada» con tasa de cortes 0.
- **Conjunto sin revisor o sin fecha** → precisión y cobertura «no concluyente», nunca PASS (asumido).
- **Ampliación de la plantilla** `data/evaluation/corpus-metadatos/PLANTILLA.md` (valor, `scope`, fragmento y estado
  esperado por paciente de prueba).
- La CI corre la suite con adaptadores falsos solo para la regresión de forma; la medición con el LLM real es manual en
  el MacBook de referencia.
- Sin cambio de contrato HTTP, esquema del catálogo del corpus ni Milvus.

## Capacidades

### Capacidades nuevas

Ninguna.

### Capacidades modificadas

- `ai-evaluation` (ADDED: conjunto dorado de población; suite por criterio con proveedor local; bloqueo por cortes de
  longitud; concordancia de estados; regresión de «sin evidencia»; repetición de la causa del bucle; conjunto sin
  revisión no concluyente; solo corpus público y agregados). Los requisitos existentes (reporte, solo sintéticos,
  métricas deterministas, `eval-required`) se aplican a la familia nueva como regresión.

## Bounded contexts

- **ai-services**: `apps/rag-orchestrator/app/evaluation/` (familia `poblacion`, métricas, lector del dorado),
  `apps/rag-orchestrator/eval/configs/`, `data/evaluation/poblacion-dorado/` y tests Pytest.
- **clinical-platform**: no se toca.
- **frontend**: no se toca.

## Dependencias

- ⛔ ADR-47 (aceptado) y ⛔ DEC-11 (US-021; firma pendiente `[S4 resp. 8]`/`[S4 resp. 9]`): definen lista acotada
  `{value, chunkId, scope}` y estados esperados F-20…F-24.
- ↪ `l1d-292-poblacion-abanico-ingesta` (US-242): el extractor en abanico que la suite invoca y mide (`finish_reason`,
  duplicados). Va **después**.
- ↪ `l1d-293-estado-criterio-lista-poblacion` (US-243): reglas puras de estado con listas para la concordancia. Va **después**.
- ↪ `l1d-117-metadatos-poblacion-verificados` (US-118, muestra humana) y `l1d-244-eval-aplicabilidad-metadatos`
  (runner, `revision_muestra.py`, familia `aplicabilidad`): se extiende su runner y su `PLANTILLA.md`; tareas `[HUMANO]`
  2.3 y 2.2.
- ↪ US-233a (L1D-298, `proveedor: local`): proveedores locales del runner.
- 🔗 Mide a: US-242, US-243, US-244 (`l1d-294-respaldo-poblacion-consulta`). 🔗 Regresión [AC-T5.4] → US-074.
- Independent ⚠: depende de la revisión humana del usuario para pasar de «no concluyente» a una conclusión.

## Alcance del Sprint 7 (movido-S7, 2026-11-22)

> L1D-299 pasa al S7 (decisión del usuario, 2026-11-21; `backlog/sprints/S7-refinamiento.md` §1). La familia `poblacion`,
> sus métricas y sus tests no se reescriben. Falta cablear el proveedor local, correr la suite con modelos reales y
> ampliar el dorado según la revisión clínica **provisional** hecha por IA (`[S7 resp. 1]`,
> `backlog/sprints/S7-revision-clinica.md` §4 y §6).

- **`proveedor: local` (D5-26, tarea 1.11):** `corrida_poblacion.py` deja de salir con código 2 y usa el LLM y el NLI
  locales, con `eval/configs/poblacion-local.yaml`. Va **antes de la corrida base**.
- **Correr la suite (2.1 y 4.3)** con modelos locales en la **corrida base** (`[S7 resp. 2]`) y de nuevo en la
  **corrida final** con el dorado ampliado. Reporte en `reports/eval/` producido por `run-ai-eval`.
- **Dorado ampliado (D-1…D-5):** ≥ 16 pares de próstata (hoy los 36 son de mama); ≥ 12 casos difíciles con redacción
  no plantilla (negación, rangos, definiciones implícitas, inclusión total, umbrales, valores en tabla); ≥ 8
  distractores donde el valor solo aparece en un análisis de subgrupo o en la discusión; frases sin sentido clínico
  reescritas; y un caso de estado por regla con un criterio de próstata y con los de C-1 y C-3.
- **El revisor sigue siendo «IA, provisional».** `manifest.json` gana `revision_provisional: {rol: ia, fecha: 2026-11-21}`
  y `revisor` sigue en `null`: la precisión y la cobertura siguen «no concluyentes» y nunca PASS (AC-7) hasta la
  revisión humana (1.1, 1.2, H-1, H-2, que no son del S7). Todo el texto nuevo es sintético (`sintetico_propio`).
- **Ventana de los cambios del dorado (misma política que `l1d-246`).** Lo que no depende de `l1d-126` parte B se hace
  **antes de la corrida base**: base y final miden el mismo dorado. Lo que depende de C-1, C-2, C-4 o C-5 va entre la
  base y la final, y el reporte de la final lo declara como no comparable con la base (`design.md` S7-D5).
- **Corpus y umbrales.** La familia mide sobre los documentos del propio dorado, que es su corpus fijo en la base y en
  la final y queda declarado en cada reporte (`[S7 resp. 10]`). Base y final corren con los umbrales actuales; los
  calibrados de `l1d-119` entran en la final como un brazo más (`[S7 resp. 11]`).
- Sin cambio de API ni de catálogo. Sin contenido de NCCN ni de ESMO.

### Dependencias del S7

- **Orden de merge (único, el mismo en `l1d-126` y `l1d-246`):** `l1d-126` parte A → corrida base → `l1d-335`
  (catálogo `1.10.0`) → `l1d-126` parte B (catálogo `1.11.0`) → la parte de este change que depende de la parte B
  (S7.9, S7.10 y S7.10b) → corrida final. El resto de este change no espera a `l1d-126`.
- ↪ `l1d-126-criterios-aplicabilidad-catalogo` parte B: la extracción de la suite lee `packages/clinical-catalogs`
  (criterios y sinónimos). Los pares de `extension` y `hrr_brca`, los casos de estado de próstata, los de C-1 y el
  triple negativo de D-4 (C-4) necesitan su catálogo: van **después** de la parte B. Este change no supone por su
  cuenta qué estado produce C-1: rige el **supuesto compartido SC-1** de `l1d-126` (`design.md` D10), con su repliegue
  a «Desconocido».
- `revision_provisional` de los datasets: una sola regla pura de forma, compartida con `l1d-246` y `l1d-334`
  (`design.md` S7-D2).
- ↪ `l1d-119-corpus-ampliado-calibracion`: comparte la corrida base (una sola carga de modelos).
- ↪ `l1d-335-sinonimos-procedimientos-relacion`: usa la suite `poblacion` como no regresión en la corrida final.

## Fuera de alcance

Herramienta de revisión humana a escala (S5); extracción doble con comparación (S6 / si hay capacidad); calibración de
`NLI_ENTAILMENT_THRESHOLD` y `RETRIEVAL_TOP_K` y baseline por tipo de cáncer (US-120, S5); metas definitivas (DEC-07,
US-017).
