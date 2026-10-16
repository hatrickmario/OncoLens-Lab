# ol06-particion-v1

Partición **congelada** del golden `data/eval/adr39-mini` (v0.1.0) en desarrollo, validación y prueba, para la mejora de la recuperación de OL-06 (ADR-45, protocolo P2). Se generó **antes de cualquier experimento** y sin leer ningún resultado de recuperación: solo usa los campos `id`, `control_de`, `cancer`, `tipo` e `idioma` del golden.

| Archivo | Contenido |
|---|---|
| `generar_particion.py` | Generador determinista (sal fija, SHA-256, ciclo fijo). No usa modelos. |
| `particion.yaml` | Ids por conjunto, huella SHA-256 del `golden.yaml` de origen y resumen. Solo ids: sin texto de preguntas. |

## Composición (preguntas totales / con respuesta / sin respuesta)

| Conjunto | Total | Con respuesta (es + controles en) | Sin respuesta | Mama / próstata (con respuesta) | De tipo `valor` | Documentos distintos |
|---|---|---|---|---|---|---|
| desarrollo | 39 | 36 (30 + 6) | 3 | 17 / 19 | 12 | 17 |
| validación | 20 | 18 (15 + 3) | 2 | 11 / 7 | 6 | 15 |
| prueba | 16 | 15 (14 + 1) | 1 | 7 / 8 | 4 | 12 |

Una pregunta y su control en inglés (`control_de`) están siempre en el mismo conjunto: son la misma pregunta y no son independientes.

## Reglas de uso (resumen; el detalle es normativo en ADR-45)

- **Desarrollo:** libre para diagnosticar, explorar y fijar hiperparámetros. Aun así, se prohíbe ajustar sobre preguntas individuales (ADR-45, P7).
- **Validación:** solo para confirmar los finalistas preinscritos (máximo 2), una vez cada uno.
- **Prueba:** se evalúa **una sola vez**, al cierre del ADR, con la configuración ya congelada. Nadie que experimente debe abrir sus preguntas. La prueba definitiva es el conjunto nuevo e independiente de US-229; este subconjunto de 16 es un respaldo de muy baja potencia.
- **Cambiar la partición** (o el golden) crea `ol06-particion-v2`; este directorio no se edita. La CI puede comprobar que `golden_sha256` coincide con el golden vigente.
- No usar `documentos`, `evidencia` ni `respuesta_esperada` para filtrar ni para elegir qué preguntas se evalúan.

## Reproducir

```bash
python3 -I data/eval/ol06-particion-v1/generar_particion.py \
  --golden data/eval/adr39-mini/golden.yaml --salida /tmp/particion.yaml
diff /tmp/particion.yaml data/eval/ol06-particion-v1/particion.yaml
```

Datos sintéticos (RN-13, RN-14); sin NCCN ni ESMO (RN-21).
