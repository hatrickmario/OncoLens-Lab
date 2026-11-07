import { readFileSync, readdirSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { mesesTranscurridos } from '../../src/modules/evidence-analysis/clinical-context.builder.js';
import { leerCatalogo, resolverAtcDelRegimen } from '../../prisma/seed/catalogo.js';
import { idSembrado } from '../../prisma/seed/determinismo.js';
import {
  DOCUMENTO_SINTETICO_CHAT,
  NACIMIENTO_SINTETICO_CHAT,
  NOMBRE_SINTETICO_CHAT,
} from '../../prisma/seed/pacientes/chat.js';
import { PACIENTES_SEMILLA } from '../../prisma/seed/pacientes/indice.js';

const DIRECTORIO = new URL('../../prisma/seed/pacientes/', import.meta.url);

describe('PACIENTES_SEMILLA', () => {
  it('lista un paciente por cada archivo <letra>.ts del directorio cuando se compara con el sistema de archivos', () => {
    // El E2E de `web` cuenta los pacientes por estos archivos (no puede importar clinical-api): deben coincidir.
    const claves = readdirSync(DIRECTORIO)
      .filter((archivo) => /^[a-z]\.ts$/.test(archivo))
      .map((archivo) => `paciente-${archivo.replace('.ts', '')}`)
      .sort();

    expect(PACIENTES_SEMILLA.map((paciente) => paciente.clave).sort()).toEqual(claves);
  });

  it('coincide con los ids que usa el E2E de la demo del S5 para (g)–(m) cuando se derivan con idSembrado [US-254 AC-4]', () => {
    // `web` no importa código de clinical-api: el E2E repite los UUID deterministas y este test detecta una deriva.
    const soporte = readFileSync(new URL('../../../web/e2e/soporte.ts', import.meta.url), 'utf8');
    const ids = [...soporte.matchAll(/'([g-m])-[a-z0-9-]+': '([0-9a-f-]{36})'/g)];

    expect(ids).toHaveLength(7);
    for (const [, letra, id] of ids) expect(id).toBe(idSembrado(`paciente-${letra}`));
  });

  it('coincide con la identidad sintética de P-CHAT que usa el E2E del chat cuando se lee soporte.ts [US-269 AC-6]', () => {
    // `web` no importa código de clinical-api: el E2E repite la identidad y este test detecta una deriva.
    const soporte = readFileSync(new URL('../../../web/e2e/soporte.ts', import.meta.url), 'utf8');
    const bloque = /IDENTIDAD_SINTETICA_CHAT = \{([^}]*)\}/.exec(soporte)?.[1] ?? '';
    const campo = (nombre: string) => new RegExp(`${nombre}: '([^']*)'`).exec(bloque)?.[1];

    expect({
      nombre: campo('nombre'),
      documento: campo('documento'),
      nacimiento: campo('nacimiento'),
    }).toEqual({
      nombre: NOMBRE_SINTETICO_CHAT,
      documento: DOCUMENTO_SINTETICO_CHAT,
      nacimiento: NACIMIENTO_SINTETICO_CHAT,
    });
  });

  it('los tratamientos del contexto de cada ejemplo demo-s5 son los del paciente semilla resuelto con el catálogo [US-254 AC-4]', () => {
    // Los ejemplos del modo fingido llevan el contexto ya desidentificado a mano: este cruce detecta su deriva del seed.
    const referencia = new Date('2026-10-16T12:00:00.000Z');
    const catalogo = leerCatalogo(
      new URL('../../../../packages/clinical-catalogs', import.meta.url).pathname,
      (ruta) => readFileSync(ruta, 'utf8'),
    );
    const mesesDesde = (dias: number): number => {
      const fecha = new Date(referencia);
      fecha.setUTCDate(fecha.getUTCDate() - dias);
      return mesesTranscurridos(fecha.toISOString().slice(0, 10), referencia) ?? 0;
    };
    const ejemplos = [
      ['g', 'g-inicial'],
      ['h', 'h-adyuvante'],
      ['i', 'i-recaida'],
      ['j', 'j-metastasica-1l'],
      ['k', 'k-her2-tras-tdm1'],
      ['l', 'l-hspc'],
      ['m', 'm-crpc'],
    ] as const;

    for (const [letra, nombre] of ejemplos) {
      const paciente = PACIENTES_SEMILLA.find((p) => p.clave === `paciente-${letra}`);
      const ruta = new URL(
        `../../../../contracts/examples/rag-query-request-demo-s5-${nombre}.json`,
        import.meta.url,
      );
      const contexto = JSON.parse(readFileSync(ruta, 'utf8')).clinicalContext;

      expect(
        contexto.priorTreatments.map((t: Record<string, unknown>) => [
          t.lineNumber,
          t.setting,
          t.regimenName,
          t.atcCodes,
          t.monthsSinceStart,
          t.monthsSinceEnd,
          t.endReason,
        ]),
        nombre,
      ).toEqual(
        (paciente?.tratamientosPrevios ?? []).map((t) => [
          t.numeroDeLinea,
          t.setting,
          t.regimen,
          resolverAtcDelRegimen(catalogo, t).codigos,
          mesesDesde(t.diasDesdeElInicio),
          t.fin === undefined ? null : mesesDesde(t.fin.diasAntes),
          t.fin?.motivo ?? 'desconocido',
        ]),
      );
    }
  });
});
