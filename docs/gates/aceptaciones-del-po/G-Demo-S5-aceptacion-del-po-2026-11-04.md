> ACEPTACIÓN DEL DUEÑO (PO) DE G-DEMO CON EXCEPCIONES, 2026-11-04. Uso académico/investigación. Solo datos sintéticos (RN-13).
> Análisis generado por IA; requiere validación clínica independiente por el oncólogo tratante (RN-19). Las métricas describen el comportamiento del sistema, no la utilidad clínica de lo mostrado.

# Aceptación del PO de G-Demo (S5, L1D-248, H-4)

## Qué es este documento

El dueño del gate (usuario, PO) firma H-4 y **acepta G-Demo como alcanzado por decisión propia, con excepciones**. No es el registro «superado» que genera `scripts/verify-g-demo`: ese veredicto fue **«G-Demo no superado»** y se conserva sin cambios en
[`../no-superados/G-Demo-real-no-superado-2026-11-04.md`](../no-superados/G-Demo-real-no-superado-2026-11-04.md). Este documento no modifica ese registro, no cambia ninguna cifra medida y no relaja ninguna meta de `metas-iniciales.yaml`.
Por eso vive en una subcarpeta propia y no en la raíz de `docs/gates/`, reservada al registro firmado que el script declara «superado».

## Veredicto del script y decisión del PO

| | |
|---|---|
| Veredicto de `scripts/verify-g-demo --modo real` | **G-Demo no superado** (commit `67f376f1`, `catalogVersion` 1.4.0, modelo de generación `gemma4:26b-a4b-it-q4_K_M`, datos 100 % sintéticos: 13 pacientes, 0 reales) |
| Decisión del PO | Acepta los cuatro hallazgos como **no críticos ni bloqueantes** para el hito G-Demo |
| Firma H-4 | usuario (PO), 2026-11-04 (declarada en la sesión de `/sprint-run S5`) |

## Los cuatro hallazgos que se aceptan, tal como se midieron

1. **Pregunta de seguimiento 1 sin citas** (paso 9 de 10 del E2E real; el paso 10 no llegó a correr). La recuperación dio 0 fragmentos sobre el umbral en 30 candidatos, es decir «sin evidencia» (RN-02), sin generar contenido. Los pasos 1 a 8 pasaron. Destino: **D5-54** (calibrar las preguntas de la guía antes de la Demo 5) y **D5-60** (registrar el segundo loop de reescritura).
2. **Fidelidad fuera de meta:** 0,862 en la suite `opciones` y 0,875 en `all`, frente a la meta ≥ 0,90. La meta **no se relaja**. Destino: **D5-50** (deuda del modelo y del prompt; la recalibra DEC-07 en el S6).
3. **Defecto de la herramienta (L1D-248):** `banderas.mjs` lee `REAL_ANONYMIZED_ENABLED` y `REAL_IDENTIFIED_ENABLED` del servicio `clinical-api`, que no las declara en `docker-compose.yml`; salen siempre «true» y el registro dice «Solo sintético: no» aunque el conteo real es sintético = 13, real = 0. Es un error del verificador, no del estado del stack. Destino: **D5-53**, prioritaria del S6 y previa a cualquier G-Demo o G-Piloto real.
4. **Procedencia incompleta del registro:** los modelos de embeddings, reranker y NLI figuran «No disponible». Destino: **D5-55**.

## Lo que no cambia con esta aceptación

- Las métricas obligatorias del gate sí pasaron: M-10.1 en meta (20/20 tras #328) y M-10.2 en meta (0 salidas prescriptivas mostradas); también recall@10 (1,0), recall@10 es→en (1,0), MRR (0,711), precisión de citas (1,0) y «sin evidencia» (1,0).
- Las excepciones declaradas en `g-demo-excepciones.json` y la sección «Validación clínica» del registro «no superado» siguen vigentes: la utilidad clínica la valida de forma independiente el oncólogo tratante en el piloto (S6); este gate no la simula.
- El p95 de `POST /platform/evidence-analyses` sigue **sin medirse** como baseline (el baseline de L1D-119 está diferido). Medido de forma aislada: 11,43 s en `evaluate` (12 consultas) y 36,5 s en un único análisis E2E real; es insumo de ADR-42 (D5-58).
- Esta aceptación **no habilita datos reales**: el gate G-Piloto y `oncolens preflight real-data` (S6) siguen siendo los únicos que lo permiten (RN-13).
- Las deudas D5-52 a D5-60 de `backlog/sprints/S5-deuda.md` siguen abiertas con su destino.

## Firma del dueño

Dueño: usuario (PO). Fecha: 2026-11-04. Decisión: G-Demo aceptado con excepciones; los hallazgos 1 a 4 no son críticos ni bloqueantes.
