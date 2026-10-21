import { readFileSync } from 'node:fs';
import express from 'express';
import { describe, expect, it } from 'vitest';
import { clienteVerificado } from '../../support/verificarProveedor.js';

const ejemplo = (nombre: string): Record<string, unknown> =>
  JSON.parse(
    readFileSync(new URL(`../../../../../contracts/examples/${nombre}`, import.meta.url), 'utf8'),
  ) as Record<string, unknown>;

/** Un proveedor que siempre responde `status` con `cuerpo` en el endpoint del análisis (sin leer nada de la petición). */
function proveedorQueResponde(status: number, cuerpo: unknown) {
  const app = express();
  app.post('/platform/evidence-analyses', (_peticion, respuesta) => {
    respuesta.status(status).json(cuerpo);
  });
  return app;
}

const VALOR_SENTINELA = 'VALOR-SINTETICO-QUE-NO-DEBE-IMPRIMIRSE';

describe('excepciones del cliente verificado', () => {
  it('lanza cuando una ruta que existe en el contrato se declara ajena sin acotarla con status [US-214 AC-1]', () => {
    const app = proveedorQueResponde(200, {});

    expect(() =>
      clienteVerificado(app, {
        respuestasAjenasAlContrato: [{ ruta: '/platform/evidence-analyses' }],
      }),
    ).toThrow(/existe en el contrato.*status/);
  });

  it('acepta una ruta de mentira o una ruta del contrato acotada con status [US-214 AC-1]', () => {
    const app = proveedorQueResponde(200, {});

    expect(() =>
      clienteVerificado(app, {
        respuestasAjenasAlContrato: [
          { ruta: '/platform/de-mentira' },
          { ruta: '/platform/evidence-analyses', status: 200 },
        ],
      }),
    ).not.toThrow();
  });
});

describe('ruta de mentira con esquema', () => {
  const ESQUEMA = '#/components/responses/ErrorInterno';
  const appDeMentira = (cuerpo: unknown) => {
    const app = express();
    app.get('/platform/de-mentira', (_peticion, respuesta) => {
      respuesta.status(500).json(cuerpo);
    });
    return app;
  };
  const opciones = {
    respuestasAjenasAlContrato: [{ ruta: '/platform/de-mentira', esquema: ESQUEMA }],
  };

  it('valida la respuesta contra el esquema declarado y acepta un cuerpo conforme [US-214 AC-3]', async () => {
    const respuesta = await clienteVerificado(
      appDeMentira(ejemplo('error-interno.json')),
      opciones,
    ).get('/platform/de-mentira');

    expect(respuesta.status).toBe(500);
  });

  it('falla nombrando el campo, sin el valor, cuando el cuerpo incumple el esquema declarado [US-214 AC-3]', async () => {
    const app = appDeMentira({ ...ejemplo('error-interno.json'), error: VALOR_SENTINELA });
    const peticion = async () => clienteVerificado(app, opciones).get('/platform/de-mentira');

    await expect(peticion()).rejects.toThrow(/\/error/);
    await expect(peticion()).rejects.not.toThrow(VALOR_SENTINELA);
  });
});

describe('verificación automática del proveedor', () => {
  it('falla nombrando proveedor, operación, código y campo, sin el valor, cuando EvidenceAnalysis trae un campo no declarado [US-214 AC-2]', async () => {
    const app = proveedorQueResponde(200, {
      ...ejemplo('con-evidencia-s1.json'),
      campoNoDeclarado: VALOR_SENTINELA,
    });

    const peticion = async () =>
      clienteVerificado(app).post('/platform/evidence-analyses').send({});

    await expect(peticion()).rejects.toThrow(
      /clinical-api POST \/platform\/evidence-analyses 200: .*\/campoNoDeclarado/,
    );
    await expect(peticion()).rejects.not.toThrow(VALOR_SENTINELA);
  });

  it('falla nombrando el campo cuando un error 422 trae un code que su operación no declara [US-214 AC-3]', async () => {
    const app = proveedorQueResponde(422, {
      ...ejemplo('error-cuerpo-invalido.json'),
      error: VALOR_SENTINELA,
    });

    const peticion = async () =>
      clienteVerificado(app).post('/platform/evidence-analyses').send({});

    await expect(peticion()).rejects.toThrow(
      /clinical-api POST \/platform\/evidence-analyses 422: \/error/,
    );
    await expect(peticion()).rejects.not.toThrow(VALOR_SENTINELA);
  });
});
