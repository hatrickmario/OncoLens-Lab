# DEC-04 — Términos de uso de LOINC, CUPS, ATC y CIE-10 en un repositorio público

> Linear: [L1D-53](https://linear.app/l1der-lab-mjbc/issue/L1D-53) · Historia: US-010 · DEC-04 (FEAT-00, Pre-S1) · TBD-17 · SUP-5 · Q-07 · PRD v1.4 E-08

- **Estado:** Decidida (usuario, 2026-10-09) `[Pre-S1 resp. 6, 8]`.
- **Firma:** el usuario (PO), **en calidad académica**. No hay área legal institucional en el proyecto. Se revisa antes de G-Piloto (S6).
- **Fuentes consultadas** el 2026-10-09 (investigación de Ingeniería). La política de LOINC se leyó en la copia de Wayback del 2026-08-06, porque la página respondió 403.

## Conclusión por estándar

| Estándar | Fuente de los términos | Conclusión | Condiciones |
|---|---|---|---|
| **LOINC** | [loinc.org/license](https://loinc.org/license) · [loinc.org/kb/license](https://loinc.org/kb/license/) | **Permitido con aviso** | Aviso literal de Regenstrief. Cada código va con uno de sus nombres oficiales (LONG_COMMON_NAME, o el del *Linguistic Variants File* es-ES/es-AR/es-MX), **sin modificar**; las etiquetas propias en español van en un campo aparte. Se excluyen los códigos con `EXTERNAL_COPYRIGHT_NOTICE`. No se usan el Part File ni las jerarquías (contienen SNOMED CT). Se registra la versión de LOINC |
| **CUPS** (Colombia) | Resolución 2706 de 2025 de MinSalud, Anexo Técnico 2. Ley 23 de 1982, art. 41 | **Permitido con aviso** | Es un acto administrativo, reproducible "conformándose puntualmente con la edición oficial". Se copia literal **de MinSalud o SISPRO**, nunca de compilaciones privadas, y se versiona por resolución. No se leyó el articulado íntegro: el riesgo queda registrado |
| **ATC** | [atcddd.fhi.no/copyright_disclaimer](https://atcddd.fhi.no/copyright_disclaimer/) | **Permitido con aviso** | Uso **no comercial**, sin modificar el material y **sin DDD**. El nombre en inglés se guarda literal y la DCI en español va en un campo propio |
| **CIE-10** | La OMS no publica términos para la CIE-10; la versión en español es © OPS | **Incierto → se versiona con riesgo registrado** | Se copia de la **tabla oficial de MinSalud o SISPRO** (acto administrativo), con aviso OMS/OPS. Se envía una consulta informativa a icd@who.int, que **no bloquea** |

Ningún estándar resultó "no permitido", así que no se activa la configuración local fuera del repo (AC-2). Si una revisión futura cambia una conclusión a "no permitido", el subconjunto de ese estándar sale del repo y el escaneo de la CI impide volver a versionarlo (US-042).

## Avisos (`packages/clinical-catalogs/NOTICE-<estándar>.txt`)

- **LOINC:** "This material contains content from LOINC (http://loinc.org). LOINC is copyright © Regenstrief Institute, Inc. and the Logical Observation Identifiers Names and Codes (LOINC) Committee and is available at no cost under the license at http://loinc.org/license. LOINC® is a registered United States trademark of Regenstrief Institute, Inc."
- **CUPS:** "Códigos y descripciones CUPS tomados de la Resolución 2706 de 2025 del Ministerio de Salud y Protección Social de Colombia (Anexo Técnico 2), edición oficial. Reproducción conforme al art. 41 de la Ley 23 de 1982."
- **ATC:** "ATC codes © WHO Collaborating Centre for Drug Statistics Methodology, Oslo, Norway (ATC/DDD Index [año]). Use for non-commercial purposes only; not to be modified."
- **CIE-10:** "CIE-10 © Organización Mundial de la Salud; versión en español © Organización Panamericana de la Salud. Tomada de las tablas de referencia oficiales de MinSalud/SISPRO. Usada con fines académicos no comerciales."
- Todos los avisos llevan además la nota **"uso académico no comercial"** del proyecto.

## Consecuencias

- **CIE-10 sigue disponible desde el S1 (AC-3).** El *workaround* de Q-07 ("solo CIE-10 en el S1") **queda sin efecto**: el seed y el catálogo del S1 pueden usar también LOINC, CUPS y ATC con sus avisos.
- **Lista de estándares permitidos** para el validador del catálogo, US-042 (AC-4): `cie10`, `loinc`, `cups` y `atc`. Cada uno exige su `NOTICE` y su versión o resolución.
- Un código sin mapeo sigue como término canónico con `mapping_status = no_mapeado` (RN-27).

## Riesgos registrados

1. La CIE-10 no tiene una licencia pública verificada de la OMS.
2. No se leyó el texto íntegro de la Resolución 2706 de 2025.
3. ATC prohíbe la distribución comercial y un repositorio público permite que terceros copien el contenido; la nota no comercial lo mitiga.
4. La firma es académica: antes de G-Piloto se valora si hace falta un aval legal de la entidad.
