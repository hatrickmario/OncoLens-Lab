import { Router, type RequestHandler } from 'express';
import { z } from 'zod';
import { describe, expect, it } from 'vitest';
import { comoUuid } from '../../../src/modules/opt-outs/opt-out.guard.js';
import {
  RUTAS_GENERA_IA,
  esGuardiaDeOptOut,
  registrarRutaGeneraIA,
} from '../../../src/modules/opt-outs/rutas-genera-ia.js';
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

    const montados = capa?.stack.map((c) => c.handle) ?? [];
    expect(montados[0]).toBe(previo);
    expect(esGuardiaDeOptOut(montados[1])).toBe(true);
    expect(montados[2]).toBe(handler);
  });

  it('nombra la ruta montada sin guardia aunque el mismo handler esté registrado con guardia en otras dos [US-148 AC-3]', () => {
    const router = Router();
    const fabrica = () => guardiaDeUnaSolaVez;
    registrarRutaGeneraIA(router, 'createEvidenceAnalysis', fabrica, [], manejador);
    registrarRutaGeneraIA(router, 'createFollowUp', fabrica, [], manejador);
    router.post('/conversations/:conversationId/turns', guardiaDeUnaSolaVez, manejador);
    const operaciones: OperacionDelSpec[] = [
      OPERACION_DE_PRUEBA,
      {
        operationId: 'createFollowUp',
        metodo: 'post',
        ruta: '/platform/evidence-analyses/{analysisId}/follow-ups',
        generaIA: true,
      },
      {
        operationId: 'createConversationTurn',
        metodo: 'post',
        ruta: '/platform/conversations/{conversationId}/turns',
        generaIA: true,
      },
    ];

    expect(operacionesGeneraIASinGuardia([router], operaciones)).toEqual([
      'createConversationTurn',
    ]);
  });

  it.each(RUTAS_GENERA_IA)(
    'declara en la ruta de $operationId el parámetro del que sale el paciente',
    (entrada) => {
      const { fuente, parametro } = entrada.origenDelPaciente;

      if (fuente === 'cuerpo') expect(parametro).toBeNull();
      else expect(entrada.ruta).toContain(`:${parametro}`);
    },
  );

  it('resuelve a un UUID todo id que z.uuid acepta, incluidos los de versión 8 y el nulo', () => {
    const ids = [
      '8f2b3c4d-9a1e-4b5c-8d6e-7f8091a2b3c4',
      '00000000-0000-0000-0000-000000000000',
      '0190a1b2-c3d4-8e5f-a6b7-c8d9e0f1a2b3',
    ];

    for (const id of ids) {
      expect(z.uuid().safeParse(id).success).toBe(true);
      expect(comoUuid(id)).toBe(id);
    }
    expect(comoUuid('no-es-uuid')).toBeNull();
  });
});
