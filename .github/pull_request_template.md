## [L1D-nn] Título

**Historia:** US-xxx · `backlog/features/FEAT-….md` · **Change:** `l1d-nn-…` · **Tipo:** feature | bug | refactor | ADR/DEC | spike

### Trazabilidad
<!-- FR / RN / AC del PRD que cubre; bloque copiado del proposal.md -->

### Gate 2
| Guardián | Veredicto | Mayores | Menores |
|---|---|---|---|

### Definition of Done (`docs/process/definition-of-done.md`)
<!-- Deja el bloque común y el del tipo de este PR; borra los demás. -->

**Común**
- [ ] Título `[L1D-nn]`, historia en el Markdown
- [ ] Gate 2 en verde; Menores listados abajo
- [ ] `openspec validate --strict` y `/opsx:verify` en verde
- [ ] Sin datos reales, secretos ni identificadores de paciente; fixtures `SINT-`
- [ ] `evaluate` adjunto si toca modelo, prompt, umbral, catálogo o corpus
- [ ] `visual-check` PASS si toca la UI
- [ ] Sin tests desactivados ni borrados sin `Test-Removal:`

**Feature**
- [ ] Contract-first: `contract(L1D-nn)` primero, `contracts:check` y `contracts:generate:check` en verde
- [ ] Patrón de la capa; unitarios e integración de entradas y salidas
- [ ] Un test de aceptación `[US-xxx AC-n]` por AC, en rojo antes del `feat`

**Bug**
- [ ] Test que reproduce el bug en rojo, en su propio commit, antes del fix
- [ ] Fix y el mismo test en verde
- [ ] 5-whys en el issue

**Refactor**
- [ ] Cobertura del módulo ≥ `main`
- [ ] Mismos contratos y tests de aceptación intactos
- [ ] Mejora de diseño explicada

**ADR/DEC**
- [ ] MADR / plantilla DEC; decisión registrada en la historia y en `02-adrs.md`; firma externa si aplica

**Spike**
- [ ] Informe enlazado; el código no se mergea

### Menores y deuda
<!-- Menores de los guardianes y deuda con su historia dueña -->
