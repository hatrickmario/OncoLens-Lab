import { describe, expect, it } from 'vitest';
import { contarFilasDelSeed } from '../../prisma/seed/contar.js';
import type { ClienteSql } from '../../prisma/seed/sembrar.js';

function dbFalsa(filasPorTabla: Record<string, number>): { db: ClienteSql; consultas: string[] } {
  const consultas: string[] = [];
  const db: ClienteSql = {
    async query(sql) {
      consultas.push(sql);
      const tabla = Object.keys(filasPorTabla).find((t) => sql.includes(`FROM ${t}`)) as string;
      return { rows: [{ n: filasPorTabla[tabla] }], rowCount: 1 };
    },
  };
  return { db, consultas };
}

describe('contarFilasDelSeed', () => {
  it('devuelve los conteos de pacientes, identidades y usuarios con las claves que publica el seed [US-247 AC-6]', async () => {
    const { db } = dbFalsa({
      'clinical.patient': 5,
      'identity.patient_identity': 0,
      'auth."user"': 2,
    });

    await expect(contarFilasDelSeed(db)).resolves.toEqual({
      'clinical.patient': 5,
      'identity.patient_identity': 0,
      'auth."user"': 2,
    });
  });

  it('ejecuta solo SELECT count(*) sin leer filas ni columnas cuando cuenta [US-247 AC-6]', async () => {
    const { db, consultas } = dbFalsa({
      'clinical.patient': 5,
      'identity.patient_identity': 5,
      'auth."user"': 2,
    });

    await contarFilasDelSeed(db);

    expect(consultas).toHaveLength(3);
    for (const consulta of consultas)
      expect(consulta).toMatch(/^SELECT count\(\*\)::int AS n FROM [a-z_."]+$/);
  });
});
