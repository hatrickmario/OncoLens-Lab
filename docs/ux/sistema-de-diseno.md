# Sistema de diseño · OncoLens (Pre-S1)

> Dirección **C · "Mesa de trabajo"**, elegida por el usuario el 2026-10-09 (`[Pre-S1 resp. 10]`): cabecera navy, superficies blancas sobre gris frío, *split* caso | análisis y tabla de aplicabilidad por criterio. La implementación es Tailwind v4 (`@theme`) sobre shadcn/ui en Atomic Design (`apps/web`). Flujo: [`flujo-e2e.md`](flujo-e2e.md) · prototipo: [`prototipo/README.md`](prototipo/README.md).
> Revisado con `clinical-language-auditor` (modo Diseño, dos pasadas) y con `design:accessibility-review` (WCAG 2.1 AA). Los valores de abajo ya incorporan sus correcciones.

## 1. Tokens

### Color

| Token | Valor | Uso | Contraste |
|---|---|---|---|
| `--color-chrome` | `#13233A` | Cabecera y aviso IA (fondo) | Texto blanco 15,9:1 |
| `--color-chrome-muted` | `#C9D4E5` | Texto secundario sobre chrome | 10,6:1 |
| `--color-bg` | `#EDF0F4` | Fondo de página | — |
| `--color-surface` | `#FFFFFF` | Tarjetas, tablas, formularios | — |
| `--color-surface-alt` | `#F3F5F8` | Cabecera de tabla, fragmentos | — |
| `--color-text` | `#172133` | Texto principal | 16,1:1 |
| `--color-text-muted` | `#44506A` | Texto secundario | 8,1:1 |
| `--color-primary` | `#1F4FB8` | Enlaces, botón primario, foco | 7,3:1 (blanco sobre primario: 7,3:1) |
| `--color-border` | `#C4CDDB` | Divisores decorativos (no controles) | — |
| `--color-control-border` | `#7C8696` | **Borde de inputs y botones secundarios** | ≥ 3:1 (1.4.11) |
| `--color-status-coincide` | `#17592F` sobre `#E4F1E8` | ✓ Coincide | 7,2:1 |
| `--color-status-parcial` | `#774500` sobre `#FBEFD6` | ◐ Parcial | 7,0:1 |
| `--color-status-nocoincide` | `#8E1F18` sobre `#F9E3E1` | ✕ No coincide | 7,3:1 |
| `--color-status-desconocido` | `#3A4553` sobre `#ECEEF1` | ? Desconocido | 8,4:1 |
| `--color-warn` | `#5E3A00` / `#774500` sobre `#FFF4E0`, borde `#E8C77A` | Avisos que no bloquean | ≥ 7:1 |
| `--color-postmvp` | `#4A2F86` sobre `#E9E4F5` | Etiqueta "Post-MVP" en diseños | ≥ 7:1 |

**Reglas de color:**
- **El color nunca es la única señal.** Todo estado lleva símbolo y texto (✓ ◐ ✕ ? ◌ ⚑ ⟳).
- El rojo se reserva para "No coincide", error y valores alterados. **Un dato faltante usa ◌ en gris neutro, no rojo**, porque no es un error del paciente (auditoría C4).
- Solo modo claro en el MVP. Los tokens se definen en `:root` para poder añadir el oscuro sin tocar los componentes.

### Tipografía

- Familia **Public Sans**, con `system-ui` de respaldo. Pesos 400, 500, 600 y 700. Sin una segunda familia; el código usa `ui-monospace`.
- Escala: 12 (metadatos) · 13 (ayudas, *captions*) · 14 (tablas, listas) · **15 (cuerpo)** · 16 (pregunta, títulos de tarjeta) · 17–18 (h2) · 20–22 (h1 de pantalla) · 24 (título de listado).
- Interlineado de 1,5. Las mayúsculas con `letter-spacing: .05em` solo se usan en los rótulos de las secciones laterales.

### Espaciado, forma y elevación

- Escala de 4 px: 4 · 6 · 8 · 10 · 12 · 14 · 16 · 20 · 24 · 32.
- Radios: 4 (etiquetas) · 6 (controles) · 8 (tarjetas) · 10 (diálogo de *login*).
- Elevación: sin sombras salvo en el *login*. Las capas se separan por superficie y fondo.
- **Objetivo táctil ≥ 44 × 44 px** en todo control, incluido "Cerrar sesión" (2.5.5).
- **Foco visible:** `outline: 3px solid var(--color-primary); outline-offset: 2px` en `:focus-visible`, global y sin excepciones (2.4.7).

### Layout

- Cabecera de 56 px.
- Barra del paciente con pestañas.
- Contenido con `max-width` de 1240–1400 px y márgenes de 20 px.
- **Split:** el caso en `flex: 1 1 290–320px` y el análisis en `flex: 999 1 640px`. Por debajo de unos 960 px se apila, con el caso arriba.
- Las tablas anchas van en un contenedor con `overflow-x: auto`, nunca con *scroll* horizontal de página.
- Ancho mínimo de diseño: 375 px (lo verifica `visual-check`).

## 2. Componentes (shadcn/ui + Atomic Design)

| Nivel | Componente | Base shadcn | Notas |
|---|---|---|---|
| Átomo | `Button` (primario, secundario, *ghost*) | `button` | Primario `--color-primary`; secundario con borde `--color-control-border`; altura mínima de 44 |
| Átomo | `Input`, `Select`, `Textarea`, `Checkbox`, `RadioGroup` | sí | Siempre con `<label>` visible; las ayudas van ligadas con `aria-describedby` |
| Átomo | `StatusChip` | `badge` | Variantes `coincide`, `parcial`, `no_coincide`, `desconocido`, `ocr-*`; símbolo, texto y color |
| Átomo | `DataOriginTag` | `badge` | `sintetico`, `real_anonimizado`, `real_identificado` |
| Átomo | `PostMvpTag` | `badge` | Solo en diseños y prototipos |
| Átomo | `OriginBadge` | `badge` | **OCR** (icono de escáner, `#1D4F7A` sobre `#E3EEF9`) y **Manual** (icono de médico, `#5A2D78` sobre `#F1E9F7`). Siempre con la palabra, más un `title` explicativo |
| Molécula | `YearRangeSlider` | `slider` | Antigüedad de la evidencia, de 2000 al año actual; atajos 5, 10 y todo; anuncia el año elegido y funciona con flechas |
| Molécula | `NonBlockingNotice` | `alert` | Aviso que **nunca deshabilita** acciones. Texto, enlace a la acción (Revisar o Cargar) y `role="status"` |
| Molécula | `AiDisclaimer` | — | Banda navy con el texto literal de RN-19. Obligatoria en toda salida generada |
| Molécula | `CitationItem` | — | Fuente, título, autores ("No disponible"), diseño, n, fecha, idioma, **licencia**, "ver fragmento", "fuente original" y `possiblyOutdated` |
| Molécula | `CitedFragment` | `blockquote` | Texto original del chunk, sin traducir, con su licencia |
| Molécula | `CriticalDataItem` | — | ✓ / ◐ / ◌ con su estado y la acción |
| Molécula | `ProvenanceLine` | — | Método, confianza y revisión: **dos ejes, siempre juntos** |
| Organismo | `AppHeader` | `navigation-menu` | Incluye "Uso académico/investigación" |
| Organismo | `PatientBar` + `PatientTabs` | `tabs` (como enlaces) | `aria-current="page"` |
| Organismo | `ApplicabilityTable` | `table` | Criterio con el valor del paciente; columnas por opción; fila Resumen calculada de las celdas; `<caption>` y `scope` |
| Organismo | `EvidenceOptionCard` | `card` | Título numerado según el orden, `rationale`, avisos, citas y relevancia **al final, como metadato** |
| Organismo | `OrderingCriterion` | — | Texto del criterio y explicación del desempate |
| Organismo | `DiscardedOptions` | `collapsible` | Plegado; "para revisión, no son opciones" |
| Organismo | `AnalysisBasisPanel` | `collapsible` | Incisos (a)–(i) y `omittedClaims` |
| Organismo | `FollowUpThread` | — | Seguimiento: contexto fijo, contador n/10, turnos con citas y la marca "nueva en el seguimiento", estados `sin_evidencia`, `fuera_de_contexto` y límite; `aria-live="polite"` |
| Organismo | `AdminHeader` | `navigation-menu` | Menú Administración: Solicitudes, Configuración y Auditoría; rol visible |
| Organismo | `AnalysisFeedback` | `toggle-group` + `checkbox` | 1–5 y dos casillas; sin texto libre |
| Organismo | `CaseRail` | — | Resumen del caso, checklist y fragmento citado |
| Organismo | `BiomarkerSeriesChart` | — | SVG con `role="img"` y `aria-label` que enuncia los valores; los valores también van rotulados en el gráfico |
| Plantilla | `PatientWorkspace` | — | Cabecera, barra del paciente y *split* |

Regla de oro (`.claude/README.md`): los componentes `.tsx` tienen 100 líneas de alerta y 150 de límite duro, y se dividen por concepto.

## 3. Patrones normativos

1. **Encabezado del análisis:** "Opciones descritas en la evidencia". Nunca "recomendaciones", "recomendado para este paciente", "debe recibir", "mejor opción" (RN-23).
2. **Sujeto del rationale:** siempre "las fuentes describen…" o "la población estudiada…", nunca el paciente como destinatario de una indicación.
3. **Orden visible:**
   - Desde la aplicabilidad (S5): "Ordenadas por coincidencia con la población estudiada, no por eficacia", más la explicación de los tres pasos.
   - En S1–S4: "Seleccionada por relevancia de la búsqueda, no por eficacia" `[§15 resp. 7]`.
4. **La relevancia es metadato:** va al final de la tarjeta, en 12 px y con el texto "metadato secundario". Nunca como barra, estrella ni porcentaje destacado (RN-03).
5. **Avisos que no bloquean** (RN-26): ámbar o gris, siempre con una acción. Solo bloquean el `403` por opt-out, el `422` por egreso y la sesión. El tipo de cáncer no habilitado (`tipo_no_habilitado`, RN-20) no es un aviso clínico sino el alcance del piloto (`ENABLED_CANCER_TYPES`): deja sin IA y no bloquea ningún otro uso.
6. **Sin evidencia:** se dice qué se buscó, y la relevancia máxima es "no aplica", nunca "0" (RN-02).
7. **Citas verificables** (RN-01, RN-04, RN-25): cada opción tiene ≥ 1 cita con "ver fragmento" (el texto original) y "fuente original". Los metadatos salen del catálogo; si falta uno, se muestra "No disponible". **NCCN y ESMO solo aparecen como "no incluidas"** `[Pre-S1 resp. 12]`.
8. **Descartadas:** separadas, plegadas y rotuladas como no-opciones.
9. **Análisis previos:** solo como evento derivado en el timeline o en el historial. Nunca como dato del paciente ni como cita (RN-24).
10. **Identidad:** el documento siempre va enmascarado (`CC ••• 4407`). En diseños, demos y pruebas solo hay pacientes "sintéticos" (RN-13, RN-14).
11. **Progreso, no contenido:** mientras se analiza se muestran pasos, nunca texto parcial del LLM (TBD-08).

## 4. Accesibilidad (WCAG 2.1 AA) · lista que verifica `visual-check`

- Contraste del texto ≥ 4,5:1 y de los controles y bordes funcionales ≥ 3:1 (tokens anteriores).
- Navegación completa por teclado. El orden de foco sigue el orden visual: cabecera → pestañas → rail del caso → análisis. Las secciones plegables se abren con Enter y Espacio.
- Puntos de referencia: `header`, `nav` con `aria-label`, `main` y `aside`. Un solo `h1` por pantalla.
- Tablas con `<caption>`, `th scope` y el valor del paciente en la cabecera de fila.
- Estados dinámicos: `aria-live="polite"` en la espera del análisis y en los estados de carga de documentos.
- Formularios con `<label for>` asociado a un control real; nunca `label` apuntando a texto (auditoría 1.3.1).
- Al 200 % de zoom y a 375 px no hay pérdida de contenido ni *scroll* horizontal de página.
