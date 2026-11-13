## ADDED Requirements

### Requirement: HTML malicioso en texto generado o del corpus se muestra escapado
El panel MUST mostrar como texto literal cualquier marcado HTML presente en la síntesis, las opciones, las afirmaciones o las citas del `EvidenceAnalysis`, sin crear elementos ni ejecutar script. Si se renderiza Markdown, MUST usarse `react-markdown` con `rehype-sanitize`, sin `rehype-raw`. `react/no-danger` SHALL seguir siendo error.

#### Scenario: Síntesis y cita con img onerror y script no crean elementos [US-216 AC-3] [RN-01] [RN-04] (asumido en el vector)
- **GIVEN** un fixture sintético de `EvidenceAnalysis` derivado de `contracts/examples/con-evidencia-s1.json` cuya síntesis y cuyo `chunkTextSnapshot` de la cita contienen `<img src=x onerror=alert(1)>` y `<script>window.__xss=1</script>`
- **WHEN** el panel lo muestra y se expande la cita
- **THEN** ambos textos aparecen literalmente en pantalla
- **AND** el contenedor del panel no tiene ningún elemento `img` ni `script` nuevo y `window.__xss` sigue indefinido

#### Scenario: dangerouslySetInnerHTML sigue fallando en el lint [US-216 AC-3] [US-215 AC-3]
- **GIVEN** el fixture `ci/tests/quality/fixtures/web/dangerously-set.tsx`
- **WHEN** se lintea con el bloque `web` de `eslint.config.js`
- **THEN** falla con `react/no-danger` como error

### Requirement: Enlaces de cita solo con esquemas seguros
El enlace de una cita MUST crearse solo si su `url` pasa `esUrlHttpSegura()`; en otro caso, incluidos `javascript:` y `data:`, la fuente SHALL mostrarse como texto sin elemento `a`. Todo enlace externo MUST abrir en otra pestaña con `rel="noopener noreferrer"`.

#### Scenario: Una URL javascript: o data: no crea enlace [US-216 AC-5] [RN-04] [SEG-12] (asumido)
- **GIVEN** dos citas sintéticas con `url = "javascript:alert(1)"` y `url = "data:text/html,<b>x</b>"`
- **WHEN** se renderizan en el panel
- **THEN** ninguna crea un elemento `a` y su título de fuente se muestra como texto

#### Scenario: Una URL https lleva noopener noreferrer [US-216 AC-5] [RN-04]
- **GIVEN** una cita con `url = "https://example.org/estudio"`
- **WHEN** se renderiza
- **THEN** el enlace tiene `href` igual a esa URL, `target="_blank"` y `rel="noopener noreferrer"`
