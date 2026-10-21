# Revisión manual de párrafos de detalle (ARR-08 / L1D-284 AC-6, OL-06 manual S1)

Entrada: ~/adr39-muestras/detalle-opciones.jsonl (7 opciones, datos sintéticos/públicos). Revisión a mano; no se ejecutó la suite.
Criterio de fidelidad estricto: un detalle atribuido a un dato que la fuente no ata explícitamente cuenta como "no".

| # | Pregunta (abreviada) | Párrafos | Fiel (por párrafo) | Prescriptivo | Español | Aporta |
|---|---|---|---|---|---|---|
| 0 | Problemas tras cirugía de próstata (impotencia) | 2 | P1 NO: atribuye el 79,3 % «a los 5 años»; la fuente da los 5 años solo para la incontinencia, no para la disfunción eréctil. P2 sí | 0 | P1 con token corrupto «7erm» en «55 y 7erm 74»; P2 ok | P1 sí, P2 sí |
| 1 | Darolutamida + ADT en nmCRPC | 2 | P1 sí. P2 sí (sin eventos graves: ICC, fracturas, HTA) | 0 | P2 con errata «darolutamidad»; ok | P1 sí (diseño, n); P2 sí (seguridad), con una frase inicial que repite el resumen |
| 2 | mHSPC por volumen y momento | 1 | P1 sí | 0 | ok | NO: repite el resumen; la única frase nueva (OS y rPFS) es mínima |
| 3 | Adyuvancia HER2+ IIA (trastuzumab 1 año) | 1 | P1 sí (1 vs 2 años sin beneficio en DFS; análisis conjunto B-31/N9831 con mejora en DFS y OS) | 0 | Glifo CJK corrupto en «NSABP-B-3隀» (debe ser B-31). Además «El estudio también…» sin antecedente (no nombra HERA) | sí |
| 4 | Antraciclinas en cáncer de mama temprano | 2 | P1 sí. P2 sí | 0 | ok | P1 sí (diseño); P2 sí (3 ensayos, toxicidad, límites) |
| 5 | CDK4/6 en alto riesgo (ribociclib) | 1 | P1 sí (NATALEE, estadio IIA y alto riesgo genómico sin afectación ganglionar) | 0 | ok | sí (población) |
| 6 | Mortalidad con anti-HER2 (neratinib) | 0 | n/a | n/a | n/a | n/a (sin detalle) |

## Resumen

- Párrafos revisados: 9 (en 6 de 7 opciones)
- Fidelidad: 8/9 fieles (89 %). Único no fiel: opción 0, párrafo 1 (atribución temporal «5 años»); es un caso límite, no una cifra inventada.
- Prescriptivos: 0
- Fuera de español: 0 párrafos en otro idioma; pero 3 de 9 (33 %) llevan corrupción de caracteres o erratas (opciones 0, 1, 3): «7erm», «darolutamidad», «B-3隀».
- Repiten el resumen: 1/9 (opción 2); opción 1 P2 lo repite solo en su primera frase.

## Conclusiones

1. El español es correcto y claro, sin anglicismos ni mezcla de idioma, pero 1 de cada 3 párrafos tiene artefactos de generación (token basura, glifo CJK, errata) que el NLI no detecta; conviene un filtro de caracteres/ortografía sobre el detalle.
2. El detalle aporta valor real en 8/9 párrafos (diseño, población, cifras, seguridad, límites), y no usa lenguaje prescriptivo; la fidelidad es alta, con el riesgo residual en atribuciones temporales y de cifras a un contexto cercano pero no explícito.
3. Fallos de forma adicionales: referente colgante («El estudio también…» sin nombrar HERA) y un detalle redundante (opción 2).

## Salvedades

- Opción 6 (neratinib) sin detalle: la fuente contiene datos ricos (ExteNET, IDFS, eventos adversos), así que la ausencia no parece por falta de material. Probablemente el modelo devolvió lista vacía o los párrafos fueron descartados por citas/NLI; no se puede distinguir con esta muestra. Además esa opción no responde a la pregunta (mortalidad: la fuente dice «OS data are not mature»).
- El resumen de la opción 4 usa «no debe ser rutinario»; está fuera del alcance (solo se evaluó `detalles`) y describe una conclusión de la fuente, no una orden, pero conviene vigilarlo bajo RN-23.
- Muestra de 7 opciones: las tasas no son estimaciones estadísticas.

## Seguimiento (sesión principal)
- **Artefactos de generación:** 3 de 9 párrafos traían caracteres basura que el NLI no detecta. Se añadió `app/domain/calidad_de_texto.py` (otra escritura distinta de latina/griega, carácter de reemplazo y palabras rotas como «7erm»): el párrafo afectado se omite antes de validar. Sobre esta misma muestra marca 2 de los 3 (el ideograma de «NSABP-B-3隀» y «7erm») y 0 falsos positivos en las opciones y resúmenes. **No** detecta una errata ortográfica con letras latinas («darolutamidad»); queda como riesgo conocido (el detalle es opcional y lo lee un médico).
- **Opción sin detalle:** el modelo a veces devuelve `details` vacío aunque la fuente tenga material; el control «Ver más detalle» simplemente no aparece (AC-4).
- **Latencia (12 consultas reales, Gemma G):** 16–47 s con evidencia (4 s las «sin evidencia»), dentro del plazo de 90 s del demo; el NFR de 15 s sigue sin cumplirse con consultas variadas (ADR-39 fase B).
