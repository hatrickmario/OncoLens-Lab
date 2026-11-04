> REGISTRO DE UN INTENTO «G-DEMO NO SUPERADO» (modo real, 2026-11-04). NO declara G-Demo y NO está firmado como superado. Conservado por decisión del humano como evidencia del intento.
> Nota: las filas «REAL_*_ENABLED=true» y «Solo sintético: no» son efecto del defecto de la herramienta D5-53 (`banderas.mjs` lee las variables de un servicio que no las declara), no el estado real del stack (13 pacientes sintéticos, 0 reales). Las demás causas: D5-54, D5-50, D5-55.

# Registro del gate G-Demo (2026-11-04)

> Generado por `scripts/verify-g-demo` (US-142, L1D-248). Uso académico/investigación. Solo datos sintéticos (RN-13).
> Análisis generado por IA; requiere validación clínica independiente por el oncólogo tratante (RN-19). Las métricas describen el comportamiento del sistema, no la utilidad clínica de lo mostrado.
> Solo un registro en modo real con el resultado «G-Demo superado» y la firma del dueño declara G-Demo; el modo fingido es
> regresión del recorrido.

**Resultado:** G-Demo no superado: paso fallido: pregunta de seguimiento 1 con citas; REAL_ANONYMIZED_ENABLED no está en false; REAL_IDENTIFIED_ENABLED no está en false; fidelidad fuera de meta (valor 0.8620689655172413, meta ≥ 0.9)

| Campo | Valor |
|---|---|
| Modo | real |
| Commit | 67f376f1c348deb7a3f57760034dd5f0b8098c1e |
| `catalogVersion` | 1.4.0 |
| `corpusRelease` | rel-opciones-1 |
| Modelo de generación | gemma4:26b-a4b-it-q4_K_M |
| Modelo de embeddings | No disponible |
| Modelo de reranker | No disponible |
| Modelo de NLI | No disponible |
| Fecha | 2026-11-04 |
| Dueño | usuario (PO) |

## Solo datos sintéticos (RN-13)

- Solo sintético: no
- Pacientes por `data_origin` (conteo agregado): sintetico=13, real_anonimizado=0, real_identificado=0
- Variables de datos reales activas (`true` = activa): REAL_ANONYMIZED_ENABLED=true, REAL_IDENTIFIED_ENABLED=true

## Métricas frente a las metas iniciales

Las metas se leen de `apps/rag-orchestrator/eval/configs/metas-iniciales.yaml` sin modificarlas; las recalibra DEC-07 (S6).
G-2 (M-10.1) y G-14 (M-10.2) son obligatorias: si faltan, el gate no se supera.

| Métrica | Valor | Meta | Origen de la meta | Estado | Casos validados / no validados |
|---|---|---|---|---|---|
| M-10.1 | 1 | ≥ 1 | metricas.json (invariante del gate) | en meta | 0 / 12 |
| M-10.2 | 0 | ≤ 0 | metricas.json (invariante del gate) | en meta | 0 / 12 |
| recall@10 | 1 | ≥ 0.8 | metas-iniciales.yaml | en meta | 0 / 12 |
| recall@10 es→en | 1 | ≥ 0.7 | metas-iniciales.yaml | en meta | 0 / 12 |
| MRR | 0.7111111111111111 | ≥ 0.6 | metas-iniciales.yaml | en meta | 0 / 12 |
| fidelidad | 0.8620689655172413 | ≥ 0.9 | metas-iniciales.yaml | FUERA DE META | 0 / 12 |
| precisión de citas | 1 | ≥ 0.9 | metas-iniciales.yaml | en meta | 0 / 12 |
| sin evidencia | 1 | ≥ 0.9 | metas-iniciales.yaml | en meta | 0 / 12 |

### Métricas no medidas

Se declaran, no se cuentan como superadas ni como fallo (salvo M-10.1 y M-10.2).

- Ninguna.

## p95 de `POST /platform/evidence-analyses` frente a G-5

no medida (sin medición del baseline; baseline de l1d-119 AC-6 (mediana de 3 corridas), contra Compose con los modelos de ADR-39); meta 15 s (clave `p95_evidence_analyses_s`); no bloquea

Un p95 fuera de meta es insumo de ADR-42 y no cambia el resultado del gate.

## Avisos del recorrido

No bloquean el resultado en modo fingido; en modo real un paso no verificable impide superar el gate.

- Ninguno.

## Excepciones declaradas

Capacidades diferidas por el slicing y criterios que se verifican en G-Piloto. No se cuentan como fallo.

- AC-T1.5: Auditoría completa de accesos y generaciones (FR-18) (FEAT-T1b; destino S6 (se verifica en G-Piloto)). R-14: el PRD §14 la excluye de G-Demo y la verifica en G-Piloto
- AC-T3.3: Bloqueo por opt-out de analisis_ia en toda generación con IA (RN-15) (FEAT-T4c; destino S6 (se verifica en G-Piloto)). R-14 y DEC-22: el 403 por opt-out se construye en el S6; en el S5 solo hay datos sintéticos
- CAP-05: Plantillas de preguntas clínicas (FR-28) (FEAT-05; destino S6 (si hay capacidad)). B-02: el slicing v2 la reporta como diferida, no como fallo
- CAP-07: Síntesis de evidencia: acuerdos y discrepancias explicadas (FR-24) (FEAT-07; destino S6 (si hay capacidad)). B-02: diferida por el slicing v2
- CAP-09: Vigencia visible de la evidencia (FR-26) (FEAT-09; destino S6 (si hay capacidad)). B-02: diferida por el slicing v2
- CAP-11: Historial, re-ejecución y comparación de análisis (FR-12) (FEAT-11a; destino S6 (si hay capacidad)). B-02: diferida por el slicing v2; la decisión y la evolución (FEAT-11b) son Post-MVP
- CAP-08-agente: Agente acotado de búsqueda complementaria (FR-30, AC-08.7) (FEAT-08c; destino Post-MVP). PRD §14: la aplicabilidad entra en G-Demo; el agente queda fuera
- AC-02.5: Resumen del caso verificable (FR-21) (FEAT-02c; destino S6 (si hay capacidad)). Slicing v2: primer candidato si hay capacidad
- busqueda-hibrida-y-filtros: Búsqueda híbrida con expansión bilingüe y filtros (FR-09, IA-02, IA-03) (FEAT-06b; destino S6 (si hay capacidad)). Slicing v2: el análisis denso cubre el recorrido; la híbrida se mide aparte contra la densa
- visor-de-documentos: Visor del documento de origen, descarga y cola de carga múltiple (FR-05, FR-07) (FEAT-01a; destino Post-MVP). PRD E-17: la ingesta de documentos pasa a Post-MVP
- ocr-y-normalizacion-de-documentos: Extracción local con OCR, gate de PII y normalización de documentos (FR-06) (FEAT-01b; destino Post-MVP). PRD E-17: el OCR, su gate de PII y la normalización de documentos pasan a Post-MVP
- resolucion-de-conflictos: Resolución de conflictos de diagnóstico entre fuentes (FR-08, RN-08) (FEAT-03b; destino S6 (si hay capacidad)). Slicing v2: el registro manual y la corrección entran en el S5; la resolución guiada queda diferida
- supuestos-y-limitaciones: Supuestos y limitaciones del análisis redactados por IA (US-129, US-130) (FEAT-T2b; destino S6 (si hay capacidad)). Slicing v2: diferidas; la Base del análisis del S5 lista los faltantes como desconocido
- feedback-del-analisis: Feedback 1-5 al cerrar cada análisis (FR-20, AnalysisFeedback) (FEAT-T5c; destino S6). D-5 (refinamiento del S5): el recorrido de G-Demo no incluye feedback

## Validación clínica

El oncólogo tratante valida de forma independiente la utilidad clínica de lo mostrado; ese juicio no se simula en este
gate. Se miden en el piloto (FEAT-T5c / FEAT-T5d, S6), con su historia y su Feature:

- US-139: Reporte de feedback agregado (VM-4 y VM-5) por cohorte y versión de catálogo: se mide en el piloto (FEAT-T5c, S6).
- DEC-14: Registro de la concordancia de aplicabilidad (VM-3): se mide en el piloto (FEAT-T5d, S6).
- VM-1: Tiempo para reconstruir el caso con el sistema (el baseline manual ya está registrado): se mide en el piloto (FEAT-T5d, S6).
- VM-2: Tiempo para localizar evidencia citada con su aplicabilidad por criterio (el baseline manual ya está registrado): se mide en el piloto (FEAT-T5d, S6).
- VM-4: Utilidad percibida de las opciones descritas (feedback): se mide en el piloto (FEAT-T5c, S6).
- VM-5: Verificabilidad percibida de las fuentes citadas (feedback): se mide en el piloto (FEAT-T5c, S6).

Baseline manual de VM-1 y VM-2 ya registrado: [protocolo y registro](../../evaluation/vm-baseline-protocolo.md).

## Firma del dueño

- Dueño: usuario (PO)
- Firma: pendiente (H-4, del humano, sobre el «no superado»; no es una firma de G-Demo superado)
