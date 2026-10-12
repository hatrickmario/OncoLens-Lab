# Prototipo navegable · Pre-S1

- **Prototipo vivo:** https://claude.ai/artifact/PPPKXaXtq23cMfSGsg22Yp. Es privado: el dueño lo comparte desde el menú *Share*.
  - Página **"Flujo E2E (dirección C)"**: las 16 pantallas enlazadas entre sí (12 + 03b, 13, 14 y 15). En modo *Play* los enlaces navegan.
  - Página **"Exploración A · B · C"**: las tres direcciones de partida. Se eligió la C (`[Pre-S1 resp. 10]`).
- **Fuente versionada:** [`fuente/`](fuente/). Son los `.dc.html` de cada pantalla y su `canvas.json`. `Main.dc.html` se renombró a `DireccionA.dc.html`.
  - Son **referencia de diseño, no código de producto**. Dependen del *runtime* del canvas (`support.js`, que no está en el repo), así que no se sirven tal cual.
  - `frontend-dev` toma de ellos la estructura, los textos y los tokens, y los implementa en `apps/web` con shadcn/ui y Tailwind v4, según [`../sistema-de-diseno.md`](../sistema-de-diseno.md).
- **Datos:** solo sintéticos. Los corchetes (`[fecha]`, `[título del artículo]`, `[n]`) son marcadores que se llenan desde el catálogo del corpus; nunca se inventa contenido.

| # | Archivo | Pantalla |
|---|---|---|
| 01 | `Login.dc.html` | Inicio de sesión |
| 02 | `Pacientes.dc.html` | Búsqueda y listado |
| 03 | `RegistroPaciente.dc.html` | Registro de paciente |
| 04 | `Ficha.dc.html` | Caso clínico del paciente |
| 05 | `Documentos.dc.html` | Carga de documentos |
| 06 | `Revision.dc.html` | Revisión de datos extraídos |
| 07 | `VistaCaso.dc.html` | Resumen y faltantes del caso |
| 08 | `Analisis.dc.html` | Nueva pregunta y espera |
| 09 | `Resultado.dc.html` | Análisis de evidencia |
| 10 | `Estados.dc.html` | Estados del análisis |
| 11 | `Decision.dc.html` | Decisión registrada (Post-MVP) |
| 12 | `Evolucion.dc.html` | Evolución (Post-MVP) |
| 03b | `RegistroPDF.dc.html` | Registro de paciente desde PDF (S3 o posterior) |
| 13 | `Registro.dc.html` | Registro de usuario (S6) |
| 14 | `AprobacionCuentas.dc.html` | Aprobación de cuentas · admin (S6) |
| 15 | `Configuracion.dc.html` | Configuración del sistema · admin (S6) |

**Revisiones hechas:**
- **Revisión y aprobación del usuario** (2026-10-11): 17 hilos de comentarios, todos resueltos, que añadieron 03b, 13, 14 y 15, las preguntas de seguimiento, el filtro de antigüedad, las insignias OCR/Manual, las fechas y los nombres nuevos.
- `clinical-language-auditor`, modo Diseño, en dos pasadas. La segunda dio PASS sin bloqueantes y sus 9 observaciones están aplicadas.
- `design:accessibility-review` (WCAG 2.1 AA). Sus correcciones están en los tokens.
- Contraste con el contrato `openapi.yaml` de readme §4.1. Las brechas están en [`../flujo-e2e.md`](../flujo-e2e.md#brechas-con-el-contrato-resueltas-en-us-033-antes-de-congelar).
