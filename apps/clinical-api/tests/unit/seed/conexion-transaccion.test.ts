import { describe, expect, it } from 'vitest';
import { conexionDesdeCliente } from '../../../prisma/seed/conexion.js';
import type { ClienteSql } from '../../../prisma/seed/sembrar.js';

/** Cliente de prueba que anota las sentencias y puede fallar en una. */
function clienteQueAnota(fallaEn?: string) {
  const sentencias: string[] = [];
  const cliente: ClienteSql = {
    query: (sql) => {
      sentencias.push(sql);
      return sql === fallaEn
        ? Promise.reject(new Error(`falla ${sql}`))
        : Promise.resolve({ rows: [], rowCount: 0 });
    },
  };
  return { cliente, sentencias };
}

describe('conexionDesdeCliente.enTransaccion', () => {
  it('confirma la transacción cuando la función termina', async () => {
    const { cliente, sentencias } = clienteQueAnota();

    await conexionDesdeCliente(cliente, () => Promise.resolve()).enTransaccion(() =>
      Promise.resolve(),
    );

    expect(sentencias).toEqual(['BEGIN', 'COMMIT']);
  });

  it('revierte y relanza el error original cuando la función falla', async () => {
    const { cliente, sentencias } = clienteQueAnota();

    await expect(
      conexionDesdeCliente(cliente, () => Promise.resolve()).enTransaccion(() =>
        Promise.reject(new Error('error original')),
      ),
    ).rejects.toThrow('error original');

    expect(sentencias).toEqual(['BEGIN', 'ROLLBACK']);
  });

  it('relanza el error original cuando además falla el ROLLBACK', async () => {
    const { cliente } = clienteQueAnota('ROLLBACK');

    await expect(
      conexionDesdeCliente(cliente, () => Promise.resolve()).enTransaccion(() =>
        Promise.reject(new Error('error original')),
      ),
    ).rejects.toThrow('error original');
  });
});
