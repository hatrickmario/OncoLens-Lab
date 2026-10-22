import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  iniciarEscenarioDePacientes,
  montarPacientes,
  type EscenarioDePacientes,
} from '../../support/pacientes.js';
import { clienteVerificado } from '../../support/verificarProveedor.js';

const ESPACIO_DE_IDS = 2027;
let escenario: EscenarioDePacientes;

beforeAll(async () => {
  escenario = await iniciarEscenarioDePacientes('pac_orden', ESPACIO_DE_IDS);
});
afterAll(() => escenario.cerrar());

interface ElementoAdmin {
  id: string;
  registeredAt: string;
}

describe('orden del listado', () => {
  it('ordena por alta descendente y desempata por id ascendente cuando varios pacientes comparten la fecha de alta [US-048 AC-1]', async () => {
    // Los cinco pacientes semilla comparten `created_at`: sin desempate el orden no sería determinista.
    await escenario.mundo.cliente.query(
      `UPDATE clinical.patient SET created_at = '2026-10-17T09:00:00Z' WHERE id IN
         (SELECT id FROM clinical.patient ORDER BY id DESC LIMIT 1)`,
    );
    const { app } = montarPacientes(escenario.mundo, { pageSize: 10 });

    const respuesta = await clienteVerificado(app)
      .get('/platform/patients')
      .set('Cookie', escenario.cookieAdmin);

    const items: ElementoAdmin[] = respuesta.body.items;
    expect(items).toHaveLength(5);
    const esperado = [...items].sort(
      (a, b) => b.registeredAt.localeCompare(a.registeredAt) || a.id.localeCompare(b.id),
    );
    expect(items.map((elemento) => elemento.id)).toEqual(esperado.map((elemento) => elemento.id));
    expect(new Set(items.map((elemento) => elemento.registeredAt)).size).toBeLessThan(items.length);
    expect(items[0]?.registeredAt).toBe('2026-10-17T09:00:00.000Z');
  });
});
