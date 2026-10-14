# Proposal — l1d-238-baseline-manual-vm

## Trazabilidad

L1D-238 · US-075 · FEAT-T5a (L1D-46) · Sprint 1 · Estimación **3** · historia técnica de medición (PRD §17; OL-06) ·
FR-20 (baseline manual) · AC-T5.2 · M-02.5 (baseline de VM-1) · VM-1, VM-2 (PRD §2.2) · R-15 (metas congeladas) ·
RN-13, RN-14 (sin datos reales ni identificadores en el repo) · RN-22 (valores en configuración) ·
DEC-02 decidida (2026-10-09, `docs/decisions/DEC-02-protocolo-vm.md`) · SUP-4 · TBD-11 · US-075 AC-1…AC-5

> **Decidido (usuario, 2026-10-13, `[S1 resp. 2]`):** hay agenda con los oncólogos asesores dentro del S1; la
> historia se mantiene en el sprint. El orquestador prepara al inicio los casos estandarizados y la plantilla de
> registro; el usuario registra las sesiones (roles anónimos de DEC-02, sin nombres en el repo).
>
> **Decidido (usuario, 2026-10-13, `[S1 resp. 3]`):** los supuestos marcados "(asumido)" en los AC se aceptan
> (AC-5: rótulo "cohorte sintética" y cohorte real después de G-Piloto).

## Why

La hipótesis del MVP (caso reconstruido → faltantes → opciones más aplicables) solo puede validarse contra un
punto de partida humano: cuánto tarda hoy un oncólogo asesor en reconstruir un caso (VM-1) y en encontrar
evidencia aplicable (VM-2) **sin** OncoLens. PRD §2.2 y AC-T5.2 exigen medirlo antes de cerrar el S1, con el
protocolo y las metas congeladas en DEC-02 (R-15). Sin este baseline, VM-1 y VM-2 de US-152 (S6) no son
comparables.

Es una historia de **medición y proceso**, no de producto: no cambia el comportamiento de `web`,
`clinical-api` ni `rag-orchestrator`. Lo único verificable por máquina es el **cálculo reproducible** de las
medianas y la validación del registro (privacidad incluida), que se especifica en una capacidad propia.

## What Changes

- **Nuevo** `data/evaluation/vm-baseline/`: ≥ 6 casos sintéticos estandarizados (3 de mama, 3 de próstata),
  cada uno con documentos sintéticos (Markdown, exportables a PDF para la sesión), una pregunta de referencia
  (VM-2) y el checklist de "caso reconstruido" del Discovery P1 (VM-1); `manifest.json` con `clase: sintetico`.
  Dos casos reutilizan el contenido de los pacientes semilla (a) mama y (b) próstata de OL-01 (change de
  L1D-169, US-039); los otros cuatro se escriben con valores ficticios fijos.
- **Nuevo** protocolo aplicado y plantilla de registro: `docs/evaluation/vm-baseline-protocolo.md` (guion de
  sesión, cronometraje, criterios de parada) y `eval/vm/baseline-S1.template.csv` (columnas y reglas).
- **Nuevo** comando determinista `evaluate-vm baseline` (Python, solo biblioteca estándar) en
  `apps/rag-orchestrator/app/evaluation/vm/`: valida el CSV (participantes `O<n>`, casos del manifiesto, tiempos
  presentes y positivos, condición `manual`, **solo las columnas declaradas**: rechaza cualquier columna no
  declarada, p. ej. notas libres, y no guarda fecha por sesión; Gate 1, 2026-10-14), calcula la mediana de VM-1 y VM-2 por tipo de cáncer y en total, y
  escribe `eval/vm/baseline-S1.md` con fecha, rótulo "cohorte sintética", huella SHA-256 de DEC-02 y la
  declaración de que las metas no se modificaron. Test después (unitario de medianas y validación, Pytest).
- **Registro humano** de las sesiones en `eval/vm/baseline-S1.csv` y publicación del reporte antes de
  `/sprint-close` del S1.

## Capabilities

### New Capabilities

- `value-metrics`: cálculo y validación de las métricas de valor VM-1…VM-6 (PRD §2.2, DEC-02). Se justifica
  como capacidad nueva porque `ai-evaluation` es la suite técnica de calidad de la IA (OL-06: recuperación,
  fidelidad, PII…), mientras que las VM son mediciones humanas con su propio protocolo, cohortes y metas
  congeladas; US-152…US-155 (FEAT-T5d, S6) la amplían con los subcomandos `time`, `vm3`, `vm6` y `g-exito`.

### Modified Capabilities

Ninguna. No se toca `openspec/specs/api-contracts` ni `openspec/specs/data-model`.

## Bounded contexts

- **ai-services** (único): `apps/rag-orchestrator/app/evaluation/vm/` y sus tests; datasets sintéticos de
  evaluación en `data/evaluation/vm-baseline/`; `eval/vm/`. El comando no importa nada de `api/`,
  `application/` ni `infrastructure/`, no abre conexiones y no lee datos clínicos.
- Documentación del protocolo en `docs/evaluation/`.
- clinical-platform y frontend: no se tocan.

## Dependencias

- ↪ **change de L1D-164 (US-034)** (`l1d-164-compose-stack`): esqueleto de `apps/rag-orchestrator` con Pytest
  donde vive `app/evaluation/vm/`.
- ↪ **change de L1D-169 (US-039)** (`l1d-169-synthetic-demo-seed`): contenido de los pacientes semilla (a) y (b)
  que reutilizan dos casos.
- ↪ **change de L1D-166 (US-036)** (`l1d-166-ci-build-contracts-scan`): chequeo de CI de clase `sintetico` de
  los datasets (AC-5) y escaneo de PII; este change añade `eval/vm/` a la configuración del escaneo.
- ↪ **change de L1D-140 (US-061)** y **change de L1D-103 (US-052)**: no bloquean (el baseline es la condición
  manual), pero la demo del S1 sobre el paciente semilla y estos casos deben ser coherentes: la pregunta de
  referencia de los casos (a) y (b) es la misma que usa la demo.
- ⛔ DEC-02 (US-008): **decidida** (2026-10-09) — sin bloqueo. ⛔ Agenda de los oncólogos (SUP-4): **resuelta**
  `[S1 resp. 2]`.
- 🔗 Produce para: FEAT-T5d (US-152: `evaluate-vm time` reutiliza casos, CSV y comando).

## Fuera de alcance

- Condición con OncoLens, comparación y reducción de la mediana, contrabalanceo verificado por el comando,
  cohorte real fuera del repo (`VM_REAL_DATA_PATH`), `muestra_insuficiente` y comprobador de metas: US-152 (S6).
- VM-3…VM-6 (DEC-14, FEAT-T5c, FEAT-T5d).
- Suite técnica `evaluate` (US-072, S2) y baseline técnico (US-073, S2).
- Cualquier cambio de API, esquema, UI, modelo, prompt, umbral, catálogo o corpus.

## Pendientes de definir

1. **Seudónimos `O1`, `O2` frente a "Oncólogo asesor A/B"** (dueño: PO; afecta: AC-2). US-075 AC-2 usa `O1`,
   `O2`; DEC-02 usa "Oncólogo asesor A". Supuesto: el CSV usa `O<n>` y el reporte trae la leyenda
   `O1 = Oncólogo asesor A`, `O2 = Oncólogo asesor B`; la correspondencia nombre ↔ rol queda **fuera del repo**.
2. **Confirmar con los oncólogos, antes de medir, las dos definiciones operativas propuestas de DEC-02** que
   aplican aquí (dueño: PO con los oncólogos; afecta: protocolo): el checklist de "caso reconstruido" (VM-1) y
   las herramientas permitidas en la condición manual (VM-2). Confirmarlas no cambia ninguna meta (R-15).
3. **Tiempo máximo por tarea** (dueño: PO; afecta: CSV). Supuesto: `VM_SESSION_MAX_MINUTES` en la configuración
   del comando (RN-22); una tarea que lo supera se registra con `completado = no` y el tiempo máximo, y el
   reporte la cuenta aparte. Valor a fijar con los oncólogos.
4. **Formato de los documentos para la sesión** (dueño: Ingeniería; afecta: AC-1). Supuesto: Markdown versionado;
   el PDF se exporta para la sesión (DEC-02 pide PDF) y no se versiona. Sin generador de PDF en este change.

5. **Consentimiento de O1/O2 para publicar sus tiempos seudonimizados en un repo público** (dueño: **usuario**;
   afecta: tareas 3.3–3.4, publicación de `eval/vm/baseline-S1.csv` y `.md`). Abierta tras el Gate 1
   (2026-10-14); ver design.md "Open Questions".

## Impact

- Archivos nuevos en `data/evaluation/vm-baseline/`, `docs/evaluation/`, `eval/vm/` y
  `apps/rag-orchestrator/app/evaluation/vm/` (+ tests). Sin dependencias nuevas (solo `statistics`, `csv`,
  `hashlib`, `argparse`).
- Sin cambios de API ni de `contracts/`; sin migraciones.
- OL-06: no aplica (no cambia modelo, prompt, umbral, catálogo ni corpus).
