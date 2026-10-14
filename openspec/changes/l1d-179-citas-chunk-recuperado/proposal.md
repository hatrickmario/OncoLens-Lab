# Proposal — l1d-179-citas-chunk-recuperado

## Trazabilidad

L1D-179 · US-063 · FEAT-T1a (L1D-34) · Sprint 1 · Estimación **5** · HU-03 (escenario 3) ·
RN-01 (citas; dueña del soporte NLI: US-064 = L1D-180), RN-04 (dueña), RN-24 (regresión, S4) ·
AC-T1.2 (parte S1), AC-T1.3, AC-10.4 · OL-02 · ADR-26 · IA-04 ·
US-063 AC-1, AC-2, AC-3, AC-4, AC-5, AC-6 · Medido en: US-072 (precisión de citas, M-10.1 = 100 %, M-07.2) ·
DoR del S1: ✓ sin excepciones (`backlog/sprints/S1-refinamiento.md` §1). La historia no tiene
supuestos "(asumido)" en sus AC ni notas "Decidido" propias; le aplican, por el contexto del sprint,
`[S1 resp. 6]` (división de US-055: el tramo de generación donde se invoca este validador es
US-225 = L1D-275), `[S1 resp. 8]` (traducción de las citas fuera del MVP: refuerza el AC-6) y
`[S1 resp. 17]` (nombres canónicos, *helper* de validación de L1D-164 y orden de merge).

## Why

El oncólogo no puede verificar cada cita de la IA contra el corpus (AS-IS P12, JTBD 8). Si una
cita apunta a un fragmento que el sistema no recuperó en **esta** consulta, o si su título o su
fuente salen del texto generado, el oncólogo abre una fuente que no dice lo que se le atribuye o
que ni siquiera existe. Esta historia hace que el LLM solo aporte el `chunkId` y que todo lo
demás de cada `CitedSource` se copie del corpus (RN-04), y que una opción sin cita válida nunca
se muestre como evidencia (RN-01, parte de citas). Es la primera mitad de la garantía G-2; la
segunda (soporte NLI) es US-064.

## What Changes

- **Nuevo** en `apps/rag-orchestrator/app/domain/citations.py`: regla pura de validación de
  citas. Recibe las opciones crudas del LLM (solo `chunkId` por cita) y el conjunto de chunks
  recuperados en esta consulta; devuelve las opciones con citas válidas y las descartadas con
  `discardReason = cita_invalida` (ninguna cita válida) o `sin_citas` (lista vacía). Una cita a
  un chunk no recuperado se quita de la opción; si queda al menos una válida, la opción se
  conserva (cita mixta).
- **Copia desde el corpus** (RN-04): cada `CitedSource` se construye desde el catálogo del
  corpus (puerto `CorpusCatalogReader`, del que este change es dueño; schema `corpus`) y el chunk recuperado de Milvus
  (`chunkTextSnapshot`, `chunkId`). Cualquier metadato que el LLM incluya en la cita (`title`,
  `sourceName`…) se ignora y no se propaga a ningún campo de la respuesta.
- **Idioma original** (RN-04, `[S1 resp. 8]`): `chunkTextSnapshot` y `language` son los del
  corpus, sin traducción, aunque la pregunta esté en español.
- **Integración** en la rama con evidencia de `RAGOrchestratorService`: este change, que mergea antes
  que L1D-275, abre esa rama sobre el puerto `EvidenceGenerator` de L1D-106 (generación →
  `validar_citas()` → `construir_cita()` → respuesta) y sus tests usan el `FakeEvidenceGenerator`
  (FX-06a-b), sin la generación real. L1D-275 añade después el generador real, el recorte y el `meta`
  completo; L1D-180 inserta el soporte NLI después de las citas.
- **Sin cambios de contrato:** `CitedSource`, `EvidenceOption.citedSources` (`minItems: 1`) y
  `DiscardedOption.discardReason` (`cita_invalida`, `sin_citas`) ya están congelados en
  `contracts/schemas/evidence.yaml` (US-033).

## Capabilities

### New Capabilities

- Ninguna. La capacidad `evidence-analysis` la crea el change de **L1D-106** (US-055).

### Modified Capabilities

- `evidence-analysis`: este change **añade** (ADDED) requisitos de nombre propio sobre validación
  y copia de citas; no redefine su `## Purpose` ni modifica requisitos de L1D-106, L1D-275 ni
  L1D-180. `api-contracts` y `data-model` no cambian.

## Bounded contexts

- **ai-services** (único): `apps/rag-orchestrator`.
- No toca `clinical-platform` ni `frontend` (la UI de las descartadas es US-061 = L1D-140).

## Dependencias

- ↪ **Depende de** el change de **L1D-106** (US-055): `RAGOrchestratorService`, puertos, conjunto
  de chunks recuperados sobre el umbral y fixtures FX-06a-a / FX-06a-b (adapters falsos).
- **Sin dependencia de L1D-275:** los tests de aceptación corren sobre el service con el
  `FakeEvidenceGenerator` del puerto `EvidenceGenerator` (L1D-106), con las salidas `LLM-OK`,
  `LLM-CITA-AJENA` y `LLM-TITULO-FALSO` (decisión del coordinador del Gate 1, orden 106 → 179 → 275).
- 🔗 **Consumido por** el change de **L1D-275** (US-225): reutiliza `construir_cita()` y
  `CorpusCatalogReader` (dueño: este change).
- ↪ **Depende de** el change de **L1D-114** (US-058): schema `corpus` (catálogo de documentos) y
  colección `corpus_chunks` de donde se copian los campos de la cita.
- 🔗 **Consumido por** el change de **L1D-180** (US-064, ↪ US-063): el `SupportChecker` corre
  después de este validador y solo sobre citas válidas.
- 🔗 **Consumido por** el change de **L1D-140** (US-061): muestra las descartadas.
- ↪ **Depende de** el change de **L1D-164** (US-034): `app/application/ports.py` (lo amplía),
  `app/bootstrap.py` (raíz de composición) y el *helper* de validación de respuestas contra el spec
  `[S1 resp. 17]`.
- **Orden de merge** `[S1 resp. 17]`: L1D-164 → L1D-105 → L1D-106 → **L1D-179** → L1D-275 → L1D-180.
- ⛔ Ninguno: ADR-39 no bloquea (los AC se verifican con adapters falsos).

## Fuera de alcance

- Soporte NLI, `afirmacion_sin_soporte`, `omittedClaims` y términos prohibidos: US-064 (L1D-180).
- Metadatos ausentes en el catálogo → `null` / "No disponible" (RN-25): US-127 (S5). En el S1 el
  corpus de prueba trae todos los campos que exigen los AC.
- `possiblyOutdated` y `newerVersionAvailable` calculados (FR-26, FEAT-09): en el S1 viajan
  `false` (análisis nuevo).
- Análisis previos como memoria no citable (RN-24): llega en el S4; se anota como
  "Regresión [RN-24] activa desde S4" (nunca está en el conjunto recuperado).
- Citas en la síntesis, la aplicabilidad y las afirmaciones sobre datos del paciente (ADR-34):
  sus Features amplían este validador con `🔗 Regresión [RN-01] → US-064`.
- Traducción de citas: Post-MVP `[S1 resp. 8]`.

## Impact

- Código: `apps/rag-orchestrator/app/domain/citations.py` (nuevo), puerto
  `CorpusCatalogReader` en `application/ports.py`, su adapter en `infrastructure/` y la llamada
  desde `RAGOrchestratorService`; tests en `apps/rag-orchestrator/tests/`.
- Configuración: ninguna clave nueva.
- Contratos: ninguno; respuestas validadas contra el spec con el *helper* de L1D-164 (la
  verificación del proveedor completa llega con US-214).
- Datos: solo los fixtures sintéticos FX-06a-a y FX-06a-b; ningún identificador de paciente.
- Evaluación: sin cambio de modelo, prompt, umbral, catálogo ni corpus → no exige `run-ai-eval`;
  la precisión de citas (M-10.1) se mide en US-072 (S2).
