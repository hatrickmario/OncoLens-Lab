# DEC-05 — Destino del TNM y de la gradación (Gleason/ISUP en próstata, Nottingham en mama)

> Linear: [L1D-54](https://linear.app/l1der-lab-mjbc/issue/L1D-54) · Historia: US-011 · DEC-05 (FEAT-00, Pre-S1) · Q-04 · C-11 · RN-29 · PRD v1.4 E-05

- **Estado:** Decidida por el usuario (2026-10-09; ampliada en el Gate 1 el 2026-10-11) `[Pre-S1 resp. 1, 2, 18, 29]`.
- **Validación clínica:** **hecha** según el usuario (refinamiento del S1, 2026-10-13, `[S1 resp. 1]`), por el "Oncólogo asesor A" (DEC-02), antes de US-038. Si en adelante se rechazara, se escala a Ingeniería y no se difiere al S3 (AC-3).

| Validación | Responsable | Fecha | Resultado |
|---|---|---|---|
| Destino y formato | Oncólogo asesor A | Confirmada por el usuario el 2026-10-13 `[S1 resp. 1]` | Validada; sin cambios en el destino ni en el formato |

## Destino de cada ítem

| Ítem crítico | Tipo | Destino |
|---|---|---|
| TNM (clínico o patológico) | Mama y próstata | `Diagnosis.staging_system` / `Diagnosis.stage_value` |
| Gleason / grupo ISUP | Próstata | Tabla hija **`clinical.diagnosis_grading`** con `grading_system = gleason_isup`. `Diagnosis.grade` es su texto derivado |
| Grado histológico (Nottingham 1–3) | Mama | `clinical.diagnosis_grading` con `grading_system = nottingham`. `Diagnosis.grade` es su texto derivado |

El modelo de diagnóstico sigue siendo **genérico** (#21). La gradación vive en una tabla hija 1:N, porque un diagnóstico puede tener varias, por ejemplo de biopsia y de prostatectomía.

## `diagnosis_grading`

- **Campos:**
  - `grading_system`: `gleason_isup | nottingham`, del catálogo.
  - `specimen_type`: `biopsia | prostatectomia`, nullable.
  - `grade_scope`: `nucleo_sitio | peor | global`, nullable.
  - `gleason_primary_pattern`, `gleason_secondary_pattern`, `gleason_score` e `isup_grade_group`.
  - `nottingham_grade`.
  - Procedencia y `review_status` propios de cada gradación.
- **Coherencia** (validación de dominio y `CHECK`): `gleason_score = primario + secundario`. El grupo ISUP se deriva de los patrones: 3+3 → 1, 3+4 → 2, 4+3 → 3, 8 → 4, 9–10 → 5. En la entrada manual, `gleasonScore` e `isupGradeGroup` son **opcionales**: el servidor los deriva y, si llegan y no cuadran, responde `422 GRADACION_INCOHERENTE`.
- **Gradación de referencia** para `grade` y para el checklist:
  - En próstata, la de prostatectomía con alcance `global`; si no existe, la `peor` de la biopsia.
  - En mama, la más reciente verificada (supuesto, a confirmar en US-110).

## Formato canónico de `Diagnosis.grade` (AC-4)

- Próstata: **"Gleason 4+3=7 · ISUP 3"**.
- Mama: **"Nottingham grado 2"**.

`grade` **nunca se escribe a mano**: siempre se deriva de la gradación de referencia. El registro manual envía un `grading` (US-110, `[Pre-S1 resp. 18]`). El seed (US-039) y la extracción (FEAT-01b) escriben con este mismo formato.

## Corrección en el readme (AC-2)

El readme v1.3 ya puso Gleason/ISUP en `grade`, lo que resolvió C-11. El modelo completo pasa a `docs/architecture/data-model.md` con US-033 y el readme §3.1 enlaza a él.

## Impacto

- **US-033:** AC-5 y AC-11, modelo y contrato.
- **US-038:** migración.
- **US-039:** seed de próstata y de mama con gradación.
- **FEAT-01b:** la extracción propone la gradación.
- **FEAT-04 US-001:** los ítems ISUP y grado apuntan a `diagnosis_grading`.
- **US-110:** el registro manual usa `grading`.
