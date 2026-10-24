# Proposal — l1d-93-catalogo-datos-criticos-validado

## Trazabilidad

L1D-93 · US-001 · FEAT-04 (L1D-14) · Sprint 3 · Estimación **5** · HU-18 · FR-23 · RN-29 (dueña) · RN-22 ·
AC-04.4 · AC-04.5 · TBD-12 · DEC-05 (cerrada: Gleason/ISUP en `Diagnosis.grade`) · US-001 AC-1…AC-8 ·
DEC-01 (L1D-92) sobre `propuesta_revisada` `[S3 resp. 1]` · paquete técnico de FEAT-04 `[S3 resp. 5]` (AC-6 servicio
no listo; AC-7 HER2 IHQ/ISH por `Exam.exam_type`) · 🔗 Regresión [AC-T5.4] → US-074 · 🔗 Relacionada: US-042
(`si-hay-capacidad`; su regla de destino inexistente la cubre el AC-4)

## Por qué

El checklist de faltantes (US-002) solo es fiable si cada dato crítico apunta a un campo que el sistema puede
guardar y si sus reglas viven en datos versionados, no en código. Hoy `packages/clinical-catalogs/<tipo>/datos-criticos.json`
es `{ "version": "1.0.0", "items": [] }` con un esquema que acepta cualquier `items`, y `catalog:validate` no existe:
nada impide publicar un catálogo que pida un dato sin destino (RN-29) ni modificar en silencio una versión ya revisada.

## Qué cambia

- **Esquema estricto del ítem de dato crítico** (`schemas/datos-criticos.schema.json`): `key`, `cancerType`, `label`,
  `destination` (`entity` ∈ lista cerrada de entidades clínicas {`Diagnosis`, `Exam`, `Biomarker`, `PriorTreatment`,
  `ClinicalAttribute`, `ClinicalEvent`}, nunca `PatientIdentity`, `User`, `Session`, `AuditLog` ni `ClinicalNote`
  `[S3 resp. 16]`; `field`, `match`),
  `condition` declarativa opcional con `whenConditionUnknown` obligatorio si hay condición, `minValues`, `estado` ∈
  {`propuesta`, `pendiente`, `revisado`}; a nivel de archivo, `verifiedReviewStatuses` y bloque `validation` opcional
  (`scope` **array** con valores ∈ {`datos_criticos`, `matriz_item_campo`, `aplicabilidad`}, `status`,
  `reviewerRole`, `date`, `catalogHash`); el mismo formato lo usa `aplicabilidad.json` (l1d-126) `[S3 resp. 16]`.
- **Validador `catalog:validate`** (nuevo, script de raíz): esquema + reglas con nombre — destino obligatorio en
  **todo** ítem con destino del catálogo (datos críticos, criterios de aplicabilidad y reglas de supuestos), destino
  existente contra una allowlist **generada del DMMF de Prisma y limitada a las seis entidades clínicas**, claves de `ClinicalAttribute` declaradas en el
  catálogo, condiciones bien formadas e integridad `catalogHash`. Sale con código ≠ 0 nombrando el ítem; corre en CI
  y al arrancar `clinical-api`.
- **Arranque de `clinical-api`**: un catálogo que no pasa la validación deja el servicio no listo, con el evento
  `configuracion_invalida` y `motivo = catalogo_invalido` (sin ruta ni contenido) `[S3 resp. 5]`.
- **Contenido inicial del S3** de `mama/datos-criticos.json` y `prostata/datos-criticos.json` (AC-7) con
  `estado = "propuesta"`, declaración de claves de `ClinicalAttribute` y subida de `manifest.json.version` a la
  versión de catálogo del S3, **única para FEAT-04 y FEAT-08b** (l1d-126 D5 la delega en este change).
- **Fixture FX-04-a**: `test-1.0.0` y `test-1.1.0` en `packages/clinical-catalogs/test/fixtures/`, más copias
  inválidas por AC.

## Capacidades

- `clinical-catalogs` — ADDED: ítems de datos críticos con destino y regla declarativa; contenido del S3; validador
  `catalog:validate` (destino obligatorio, destino existente, condición bien formada, integridad del bloque de
  revisión). MODIFIED: "Sin catálogo los backends no quedan listos" (un catálogo que no valida también deja no listo
  a `clinical-api`).
- `completeness` (prevista en `openspec/config.yaml`) **no** se crea aquí: nace con US-002 (L1D-94), que consume
  este catálogo.

## Bounded contexts

- **clinical-platform**: `packages/clinical-catalogs` (esquema, contenido, fixtures), `scripts/catalog/` y script
  `catalog:validate` de raíz, generación de la allowlist desde Prisma, arranque de `clinical-api`, job de CI.
- **ai-services**: no se toca código. `rag-orchestrator` sigue leyendo solo `manifest.json`; solo se actualiza la
  versión esperada del catálogo en su configuración de test/Compose si la subida de versión lo exige.
- **frontend**: no se toca.

## Dependencias

- ⛔ DEC-05 — cerrada en el Pre-S1 (Gleason/ISUP → `Diagnosis.grade`).
- ↪ US-041 (`l1d-171-catalogo-montaje-version`, archivado): montaje, `manifest.json`, `409`, evento
  `configuracion_invalida` — ya en `main`.
- **Orden con `l1d-126-criterios-aplicabilidad-catalogo`:** este change va **antes** (misma oleada o anterior).
  l1d-126 añade sobre este validador la regla `rechazarCamposDePuntaje()` (RN-28), el esquema del criterio y su
  contenido; este change no define la forma del criterio ni su contenido, solo que su `destination` es obligatorio y
  existe (misma forma `entity`/`field`/`match`, l1d-126 D1). El requisito "Todo ítem del catálogo con destino lo
  declara" es de aquí; l1d-126 le añade su escenario como `MODIFIED` y por eso se archiva **después** `[S3 resp. 16]`.
- 🔗 Produce para: L1D-92 (DEC-01, publica `validation.status = "propuesta_revisada"` validado por el AC-8),
  L1D-94 (US-002, checklist), L1D-98 (US-006), L1D-126 (US-121), US-129 (reglas de supuestos).

## Fuera de alcance

- El `409 CATALOG_VERSION_MISMATCH` entre backends (US-041) y su regresión con aplicabilidad (l1d-126).
- La forma, el contenido y la regla "sin puntaje" de los criterios de aplicabilidad (l1d-126 · US-121).
- El cálculo del checklist y la ausencia confirmada (US-002; ausencia confirmada al S4 `[S3 resp. 5]`).
- La revisión clínica y el registro `docs/decisions/DEC-01-…` (L1D-92); la sesión con oncólogos del S4.
- Mapeos terminológicos (DEC-17, S5) y plantillas (DEC-10).
