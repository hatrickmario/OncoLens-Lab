import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  alertasDeCobertura,
  lineasInstrumentadasCobertura,
  medirLineasCambiadas,
} from '../../../scripts/quality/cobertura.mjs';
import { leerUmbrales } from '../../../scripts/quality/umbrales.mjs';
import { RAIZ } from './soporte.mjs';

// L1D-285 tarea 3.4 (test después): la Cobertura XML de pytest-cov entra a la misma medición de líneas cambiadas que el LCOV.
// El XML es el que escribe `pytest --cov=app --cov-report=xml`: `<source>` absoluto y `filename` relativo a él.
const FUENTE = path.join(RAIZ, 'apps/rag-orchestrator/app');
const COBERTURA_XML = `<?xml version="1.0" ?>
<coverage version="7.17.0" lines-valid="6" lines-covered="2">
  <sources>
    <source>${FUENTE}</source>
  </sources>
  <packages>
    <package name="domain">
      <classes>
        <class name="umbral.py" filename="domain/umbral.py" line-rate="0.5">
          <methods/>
          <lines>
            <line number="1" hits="1"/>
            <line number="2" hits="1"/>
            <line number="3" hits="0"/>
            <line number="4" hits="0"/>
          </lines>
        </class>
        <class name="__init__.py" filename="__init__.py" line-rate="1">
          <lines>
            <line number="1" hits="1"/>
          </lines>
        </class>
      </classes>
    </package>
  </packages>
</coverage>
`;
const DIFF = `diff --git a/apps/rag-orchestrator/app/domain/umbral.py b/apps/rag-orchestrator/app/domain/umbral.py
index 1111111..2222222 100644
--- a/apps/rag-orchestrator/app/domain/umbral.py
+++ b/apps/rag-orchestrator/app/domain/umbral.py
@@ -0,0 +1,5 @@
+linea 1
+linea 2
+linea 3
+linea 4
+# comentario sin instrumentar
`;
const INFORMES = [{ coberturaXml: COBERTURA_XML }];

describe('cobertura de líneas cambiadas de rag-orchestrator', () => {
  it('resuelve cada archivo del XML contra su fuente y no confunde dos __init__.py [US-213 AC-11]', () => {
    const archivos = lineasInstrumentadasCobertura(COBERTURA_XML, RAIZ);

    expect([...archivos.keys()]).toEqual([
      'apps/rag-orchestrator/app/domain/umbral.py',
      'apps/rag-orchestrator/app/__init__.py',
    ]);
    expect(archivos.get('apps/rag-orchestrator/app/domain/umbral.py').get(3)).toBe(0);
  });

  it('resuelve los filename contra la raíz del repositorio cuando el XML no trae <source> [US-213 AC-11]', () => {
    const sinFuente = `<coverage><packages><package><classes>
      <class name="u.py" filename="apps/rag-orchestrator/app/domain/umbral.py"><lines><line number="7" hits="3"/></lines></class>
    </classes></package></packages></coverage>`;

    const archivos = lineasInstrumentadasCobertura(sinFuente, RAIZ);

    expect(archivos.get('apps/rag-orchestrator/app/domain/umbral.py').get(7)).toBe(3);
  });

  it('respeta un filename absoluto del XML [US-213 AC-11]', () => {
    const absoluto = path.join(FUENTE, 'domain/umbral.py');
    const xml = `<coverage><sources><source>/otra/ruta</source></sources><packages><package><classes>
      <class name="u.py" filename="${absoluto}"><lines><line number="2" hits="0"/></lines></class>
    </classes></package></packages></coverage>`;

    expect(lineasInstrumentadasCobertura(xml, RAIZ).get('apps/rag-orchestrator/app/domain/umbral.py').get(2)).toBe(0);
  });

  it('mide 2 de 4 líneas cambiadas cubiertas y 50 % sin contar la línea no instrumentada [US-213 AC-11]', () => {
    expect(medirLineasCambiadas(DIFF, INFORMES, RAIZ)).toEqual([
      {
        archivo: 'apps/rag-orchestrator/app/domain/umbral.py',
        lineasCambiadas: 4,
        lineasCubiertas: 2,
        porcentaje: 50,
      },
    ]);
  });

  it('alerta con el porcentaje 50 y el umbral leído de la configuración sin producir ningún error [US-213 AC-11]', () => {
    const cobertura = leerUmbrales().coverage;

    const alertas = alertasDeCobertura(medirLineasCambiadas(DIFF, INFORMES, RAIZ), cobertura);

    expect(alertas).toEqual([
      expect.objectContaining({
        file: 'apps/rag-orchestrator/app/domain/umbral.py',
        measured: 50,
        threshold: cobertura.changedLinesWarn,
        severity: 'warn',
      }),
    ]);
  });
});
