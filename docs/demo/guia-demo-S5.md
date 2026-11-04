# Guía de la Demo 5 (S5): pacientes en distintos momentos de la enfermedad

Todo con **datos sintéticos** (pacientes del seed; corpus público con licencia aceptada). Complementa `docs/demo/runbook-demo-S1.md` (preparar, levantar, apagar, fallos frecuentes) y `docs/demo/guia-demo-S4.md`. Esta guía crece con las demás historias del S5 (US-142, G-Demo); aquí solo está lo de US-254.

> **Solo modo fingido.** Los conteos de este documento son los de `LLM_PROVIDER=fake`, que responde con los ejemplos de `contracts/examples/`. En vivo, con el LLM real, la redacción y las opciones varían y **los estados por criterio los calculan las reglas** con lo que cite cada opción (ver `guia-demo-S4.md` §3). Todo resultado muestra «Generado por IA; requiere validación clínica independiente por el oncólogo tratante» y «Uso académico/investigación».

## Pacientes en distintos momentos de la enfermedad

El seed siembra 13 pacientes sintéticos: (a)–(f) de las demos anteriores y (g)–(m) de US-254, con su historia de tratamientos por línea y sus eventos (fechas relativas a la fecha de referencia del seed). En el listado aparecen como «Prueba Sintética 7» … «13» (`SINT-0000007` … `SINT-0000013`). Para preparar, levantar y apagar, ver `docs/demo/runbook-demo-S1.md`; `levantar.sh` imprime en «Verificación del seed» `esperado=13 obtenido=13` para pacientes e identidades y los mínimos de tratamientos, eventos y atributos.

Los **faltantes** los calcula el servicio de completitud con el catálogo real (no están escritos a mano): salen de la prueba de integración `pacientes-momentos.test.ts` (`[US-254 AC-3]`), que imprime la lista. (g) y (l) tienen faltantes distintos y (j), (k) y (m) no tienen ninguno. Ningún faltante bloquea la ficha ni el análisis (RN-26).

| Paciente                  | Momento                                                             | Historia resumida                                                                                                                                                                                                   | Faltantes calculados                                     | Pregunta sugerida (exacta)                                                                                                                                                                                          |
| ------------------------- | ------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| (g) · Prueba Sintética 7  | Mama, diagnóstico inicial sin tratar                                | F 1978, CDI IIA, ECOG 0; RE 90 %, RP 70 %, HER2 2+ (IHQ); premenopáusica. Sin tratamientos ni eventos.                                                                                                              | HER2 por ISH, Ki-67, Tratamientos previos, BRCA germinal | _«¿Qué opciones de terapia sistémica describe la evidencia del corpus de la demo para una paciente premenopáusica con cáncer de mama en estadio inicial, receptores hormonales positivos y HER2 2+ sin confirmar?»_ |
| (h) · Prueba Sintética 8  | Mama adyuvante tras cirugía                                         | F 1966, CDI IIA; HER2 1+, Ki-67 20 %. Cuadrantectomía y letrozol adyuvante en curso (línea 1).                                                                                                                      | BRCA germinal                                            | _«¿Qué describe la evidencia del corpus de la demo sobre la duración y el beneficio de la terapia endocrina adyuvante en una paciente posmenopáusica operada con receptores hormonales positivos y HER2 1+?»_       |
| (i) · Prueba Sintética 9  | Mama con recaída local                                              | F 1961, CDI IIB; HER2 1+. Mastectomía, tamoxifeno adyuvante terminado por la recaída local (línea 1, `no_mapeado`).                                                                                                 | BRCA germinal                                            | _«¿Qué opciones sistémicas describe la evidencia del corpus de la demo tras una recaída local en una paciente con cáncer de mama con receptores hormonales positivos que recibió tamoxifeno adyuvante?»_            |
| (j) · Prueba Sintética 10 | Mama metastásica en primera línea                                   | F 1958, CDI IV; HER2 0, BRCA no mutado. Letrozol + palbociclib en curso (línea 1; solo letrozol tiene ATC en el catálogo).                                                                                          | ninguno                                                  | _«¿Qué opciones sistémicas describe la evidencia del corpus de la demo para una paciente con cáncer de mama metastásico, receptores hormonales positivos y HER2 0 en primera línea?»_                               |
| (k) · Prueba Sintética 11 | Mama HER2 positiva metastásica tras trastuzumab, pertuzumab y T-DM1 | F 1970, CDI IV; HER2 3+ y amplificado. Línea 1 trastuzumab + pertuzumab + docetaxel (progresión hepática) y línea 2 trastuzumab emtansina (progresión pulmonar y hepática).                                         | ninguno                                                  | _«¿Qué describe la evidencia del corpus de la demo para pacientes con cáncer de mama metastásico HER2 positivo que ya recibieron trastuzumab, pertuzumab y trastuzumab emtansina?»_                                 |
| (l) · Prueba Sintética 12 | Próstata metastásica sensible a la castración                       | M 1952, adenocarcinoma T3aN1M1b, Gleason 4+4; PSA 48,0 y 6,2 ng/mL; `sensible_castracion`, sitio óseo. Leuprorelina + abiraterona en curso (línea 1).                                                               | Genes HRR / BRCA                                         | _«¿Qué opciones sistémicas describe la evidencia del corpus de la demo para un paciente con cáncer de próstata metastásico sensible a la castración?»_                                                              |
| (m) · Prueba Sintética 13 | Próstata resistente a la castración                                 | M 1948, adenocarcinoma T3bN1M1b, Gleason 4+5; PSA 85,0 → 0,8 → 14,5 ng/mL; HRR no mutado; `resistente_castracion`. Línea 1 leuprorelina + docetaxel (progresión bioquímica y ósea) y línea 2 enzalutamida en curso. | ninguno                                                  | _«¿Qué describe la evidencia del corpus de la demo sobre el tratamiento del cáncer de próstata metastásico resistente a la castración tras progresión a docetaxel?»_                                                |

Notas para la demo:

- (g) no tiene «Tratamientos previos» sembrados a propósito: el checklist lo marca como faltante y la guía lo explica (no se siembra un «ninguno»).
- Los regímenes sin código en el subconjunto ATC del catálogo (tamoxifeno, palbociclib, abiraterona, enzalutamida) quedan `no_mapeado` (RN-27); letrozol, trastuzumab, pertuzumab, trastuzumab emtansina, docetaxel y leuprorelina llevan su código del catálogo.
- Cada pregunta es distinta de las demás y de las de la Demo 4; abrir la ficha del paciente antes de preguntar (la recuperación filtra por el tipo de cáncer del paciente).

## Conteos esperados en modo fingido

Los conteos de `applicabilitySummary` por opción salen de **este bloque** (fuente única): lo leen la prueba de aceptación (`apps/web/e2e/demo-s5-pacientes.spec.ts`, `[US-254 AC-4]`) y los ejemplos fijos `contracts/examples/rag-query-demo-s5-*.json` que sirve `LLM_PROVIDER=fake`. Orden de las opciones: menos criterios excluyentes en No coincide, más Coincide y, como desempate, la relevancia (RN-28). `poblacionNoComparable = true` marca las opciones con un criterio excluyente en No coincide: se muestran igualmente (RN-26) y su respuesta trae `warnings` con `poblacion_no_comparable`.

<!-- conteos-demo-s5:inicio -->

```json
{
  "g-inicial": {
    "ejemplo": "g-inicial",
    "opciones": [
      {
        "conteos": {
          "coincide": 1,
          "parcial": 1,
          "noCoincide": 0,
          "desconocido": 4
        },
        "poblacionNoComparable": false
      }
    ]
  },
  "h-adyuvante": {
    "ejemplo": "h-adyuvante",
    "opciones": [
      {
        "conteos": {
          "coincide": 2,
          "parcial": 1,
          "noCoincide": 0,
          "desconocido": 3
        },
        "poblacionNoComparable": false
      }
    ]
  },
  "i-recaida": {
    "ejemplo": "i-recaida",
    "opciones": [
      {
        "conteos": {
          "coincide": 2,
          "parcial": 2,
          "noCoincide": 0,
          "desconocido": 2
        },
        "poblacionNoComparable": false
      }
    ]
  },
  "j-metastasica-1l": {
    "ejemplo": "j-metastasica-1l",
    "opciones": [
      {
        "conteos": {
          "coincide": 2,
          "parcial": 2,
          "noCoincide": 0,
          "desconocido": 2
        },
        "poblacionNoComparable": false
      },
      {
        "conteos": {
          "coincide": 0,
          "parcial": 0,
          "noCoincide": 2,
          "desconocido": 4
        },
        "poblacionNoComparable": true
      }
    ]
  },
  "k-her2-tras-tdm1": {
    "ejemplo": "k-her2-tras-tdm1",
    "opciones": [
      {
        "conteos": {
          "coincide": 3,
          "parcial": 0,
          "noCoincide": 0,
          "desconocido": 3
        },
        "poblacionNoComparable": false
      }
    ]
  },
  "l-hspc": {
    "ejemplo": "l-hspc",
    "opciones": [
      {
        "conteos": {
          "coincide": 1,
          "parcial": 1,
          "noCoincide": 0,
          "desconocido": 4
        },
        "poblacionNoComparable": false
      }
    ]
  },
  "m-crpc": {
    "ejemplo": "m-crpc",
    "opciones": [
      {
        "conteos": {
          "coincide": 1,
          "parcial": 0,
          "noCoincide": 1,
          "desconocido": 4
        },
        "poblacionNoComparable": false
      },
      {
        "conteos": {
          "coincide": 0,
          "parcial": 1,
          "noCoincide": 1,
          "desconocido": 4
        },
        "poblacionNoComparable": true
      }
    ]
  }
}
```

<!-- conteos-demo-s5:fin -->

Lectura por paciente:

- (j): la segunda opción (terapia anti-HER2) no es comparable: HER2 0 frente a una población HER2 positivo (criterio excluyente, No coincide).
- (m): la segunda opción (darolutamida en población sensible a la castración) no es comparable: `estado_castracion` del paciente es resistente (excluyente, No coincide); la primera opción trae un No coincide en genes HRR/BRCA que no es excluyente.
- (k): `estado_her2`, línea de tratamiento y ECOG coinciden; es el caso con más Coincide.

## Prueba reproducible (modo fingido, sin LLM real)

```bash
scripts/e2e/ejecutar.sh -- --grep "US-254"      # Compose de test, LLM_PROVIDER=fake, seed sintético, Playwright
```

Cada paciente (g)–(m) con su pregunta devuelve los conteos del bloque y la marca de no comparable `[US-254 AC-4]`. Es determinista: el modo fingido responde con los ejemplos de `contracts/examples/`.

## Si algo falla

Ver `docs/demo/runbook-demo-S1.md` §5. Apagar y limpiar al terminar: `scripts/demo/apagar.sh` (y `--borrar-datos` para empezar de cero).
