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
  it('devuelve los conteos de pacientes, identidades, usuarios e historia clínica con las claves que publica el seed [US-247 AC-6] [US-254 AC-5]', async () => {
    const { db } = dbFalsa({
      'clinical.patient': 5,
      'identity.patient_identity': 0,
      'auth."user"': 2,
      'clinical.prior_treatment': 9,
      'clinical.clinical_event': 7,
      'clinical.clinical_attribute': 11,
    });

    await expect(contarFilasDelSeed(db)).resolves.toEqual({
      'clinical.patient': 5,
      'identity.patient_identity': 0,
      'auth."user"': 2,
      'clinical.prior_treatment': 9,
      'clinical.clinical_event': 7,
      'clinical.clinical_attribute': 11,
    });
  });

  it('ejecuta solo SELECT count(*) sin leer filas ni columnas cuando cuenta [US-247 AC-6]', async () => {
    const { db, consultas } = dbFalsa({
      'clinical.patient': 5,
      'identity.patient_identity': 5,
      'auth."user"': 2,
      'clinical.prior_treatment': 9,
      'clinical.clinical_event': 7,
      'clinical.clinical_attribute': 11,
    });

    await contarFilasDelSeed(db);

    expect(consultas).toHaveLength(6);
    for (const consulta of consultas)
      expect(consulta).toMatch(/^SELECT count\(\*\)::int AS n FROM [a-z_."]+$/);
  });
});
