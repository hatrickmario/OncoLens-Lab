import { Router, type RequestHandler } from 'express';
import { describe, expect, it } from 'vitest';
import { registrarRutaGeneraIA } from '../../../src/modules/opt-outs/rutas-genera-ia.js';
import {
  operacionesGeneraIASinGuardia,
  type OperacionDelSpec,
} from '../../support/cobertura-genera-ia.js';

const manejador: RequestHandler = (_peticion, respuesta) => {
  respuesta.status(204).end();
};
const guardiaDeUnaSolaVez: RequestHandler = (_peticion, _respuesta, siguiente) => {
  siguiente();
};

const OPERACION_DE_PRUEBA: OperacionDelSpec = {
  operationId: 'createEvidenceAnalysis',
  metodo: 'post',
  ruta: '/platform/evidence-analyses',
  generaIA: true,
};

describe('cobertura de las rutas generaIA', () => {
  it('nombra el operationId cuando una operación x-genera-ia se monta sin el guardia [US-148 AC-3]', () => {
    const router = Router();
    router.post('/evidence-analyses', manejador);

    const sinGuardia = operacionesGeneraIASinGuardia([router], [OPERACION_DE_PRUEBA]);

    expect(sinGuardia).toEqual(['createEvidenceAnalysis']);
  });

  it('no reporta nada cuando la ruta se monta con registrarRutaGeneraIA [US-148 AC-3]', () => {
    const router = Router();
    registrarRutaGeneraIA(
      router,
      'createEvidenceAnalysis',
      () => guardiaDeUnaSolaVez,
      [],
      manejador,
    );

    const sinGuardia = operacionesGeneraIASinGuardia([router], [OPERACION_DE_PRUEBA]);

    expect(sinGuardia).toEqual([]);
  });

  it('monta el guardia antes del handler y después de los manejadores previos', () => {
    const router = Router();
    const llamadas: string[] = [];
    const previo: RequestHandler = (_p, _r, siguiente) => {
      llamadas.push('previo');
      siguiente();
    };
    const guardia: RequestHandler = (_p, _r, siguiente) => {
      llamadas.push('guardia');
      siguiente();
    };
    const handler: RequestHandler = (_p, _r) => {
      llamadas.push('handler');
    };

    registrarRutaGeneraIA(router, 'createFollowUp', () => guardia, [previo], handler);
    const capa = (
      router as unknown as { stack: { route: { stack: { handle: RequestHandler }[] } }[] }
    ).stack[0]?.route;

    expect(capa?.stack.map((c) => c.handle)).toEqual([previo, guardia, handler]);
  });
});
