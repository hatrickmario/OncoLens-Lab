import { describe, expect, it } from 'vitest';
import {
  hallazgosDeLaCli,
  hallazgosDelContrato,
  leerArchivosDeLaCli,
  leerOpenapi,
} from '../../support/sin-reporte-cac.js';

describe('Sin reporte a la Cuenta de Alto Costo (AC-03.5)', () => {
  it('no existe ruta ni comando de CLI que genere, exporte o envíe un reporte a la Cuenta de Alto Costo [US-098 AC-7]', () => {
    const archivos = leerArchivosDeLaCli();

    expect(Object.keys(archivos)).toContain('oncolens.ts');
    expect(hallazgosDelContrato(leerOpenapi())).toEqual([]);
    expect(hallazgosDeLaCli(archivos)).toEqual([]);
  });

  it('falla con un fixture que añade /platform/reports/cac al contrato', () => {
    const conReporte = `${leerOpenapi()}`.replace(
      /^paths:\n/m,
      "paths:\n  /platform/reports/cac:\n    get:\n      operationId: exportarReporteCac\n      summary: Reporte\n      responses:\n        '200': { description: ok }\n",
    );

    expect(hallazgosDelContrato(conReporte)).toEqual(
      expect.arrayContaining(['paths//platform/reports/cac']),
    );
  });

  it('falla con un fixture que describe el envío a la Cuenta de Alto Costo en una operación', () => {
    const spec =
      'paths:\n  /platform/x:\n    get:\n      operationId: x\n      description: Envía a la Cuenta de Alto Costo\n      responses: {}\n';

    expect(hallazgosDelContrato(spec)).toEqual(['paths//platform/x/get/description']);
  });

  it('falla con un fixture de la CLI que registra un comando de reporte CAC', () => {
    const archivos = { 'oncolens.ts': "if (grupo === 'reports') exportar('high-cost')" };

    expect(hallazgosDeLaCli(archivos)).toEqual(['oncolens.ts']);
  });

  it('no marca palabras que solo contienen cac cuando se recorre el texto', () => {
    expect(hallazgosDeLaCli({ 'a.ts': 'eficacia vacaciones' })).toEqual([]);
  });
});
