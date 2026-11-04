# Registro del gate G-Demo ({{fecha}})

> Generado por `scripts/verify-g-demo` (US-142, L1D-248). Uso académico/investigación. Solo datos sintéticos (RN-13).
> Análisis generado por IA; requiere validación clínica independiente por el oncólogo tratante (RN-19). Las métricas describen el comportamiento del sistema, no la utilidad clínica de lo mostrado.
> Solo un registro en modo real con el resultado «G-Demo superado» y la firma del dueño declara G-Demo; el modo fingido es
> regresión del recorrido.

**Resultado:** {{titulo}}

| Campo | Valor |
|---|---|
| Modo | {{modo}} |
| Commit | {{commit}} |
| `catalogVersion` | {{catalogVersion}} |
| `corpusRelease` | {{corpusRelease}} |
| Modelo de generación | {{modeloGeneracion}} |
| Modelo de embeddings | {{modeloEmbeddings}} |
| Modelo de reranker | {{modeloReranker}} |
| Modelo de NLI | {{modeloNli}} |
| Fecha | {{fecha}} |
| Dueño | {{dueno}} |

## Solo datos sintéticos (RN-13)

- Solo sintético: {{soloSintetico}}
- Pacientes por `data_origin` (conteo agregado): {{conteoPorOrigen}}
- Variables de datos reales activas (`true` = activa): {{banderas}}

## Métricas frente a las metas iniciales

Las metas se leen de `apps/rag-orchestrator/eval/configs/metas-iniciales.yaml` sin modificarlas; las recalibra DEC-07 (S6).
G-2 (M-10.1) y G-14 (M-10.2) son obligatorias: si faltan, el gate no se supera.

{{tablaMetricas}}

### Métricas no medidas

Se declaran, no se cuentan como superadas ni como fallo (salvo M-10.1 y M-10.2).

{{noMedidas}}

## p95 de `POST /platform/evidence-analyses` frente a G-5

{{p95}}

Un p95 fuera de meta es insumo de ADR-42 y no cambia el resultado del gate.

## Excepciones declaradas

Capacidades diferidas por el slicing y criterios que se verifican en G-Piloto. No se cuentan como fallo.

{{excepciones}}

## Validación clínica

El oncólogo tratante valida de forma independiente la utilidad clínica de lo mostrado; ese juicio no se simula en este
gate. Se miden en el piloto (FEAT-T5c / FEAT-T5d, S6), con su historia y su Feature:

{{validacionClinica}}

Baseline manual de VM-1 y VM-2 ya registrado: [protocolo y registro](../evaluation/vm-baseline-protocolo.md).

## Firma del dueño

- Dueño: {{dueno}}
- Firma: {{firma}}
