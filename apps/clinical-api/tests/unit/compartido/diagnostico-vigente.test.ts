import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { diagnosticoVigente } from '../../../src/modules/completeness/completeness.rules.js';
import type { RegistroDeDato } from '../../../src/modules/completeness/ports.js';
import {
  compararVigencia,
  elegirDiagnosticoVigente,
  sqlOrdenDeDiagnosticoVigente,
  type DatosDeVigencia,
} from '../../../src/modules/compartido/diagnostico-vigente.js';
import { elegirDiagnosticoVigenteDeLaFicha } from '../../../src/modules/patients/ficha.reglas.js';
import type { FilaDeDiagnostico } from '../../../src/modules/patients/ficha.repository.js';

const dato = (id: string, fecha: string | null): DatosDeVigencia => ({ id, fecha });
const idsElegidos = (candidatos: readonly DatosDeVigencia[]) =>
  elegirDiagnosticoVigente(candidatos, (c) => c)?.id;

describe('elegirDiagnosticoVigente', () => {
  it('devuelve undefined cuando no hay candidatos', () => {
    expect(idsElegidos([])).toBeUndefined();
  });

  it('devuelve el único candidato cuando hay un solo diagnóstico', () => {
    expect(idsElegidos([dato('d-1', '2026-01-01')])).toBe('d-1');
  });

  it('devuelve el de diagnosed_at más reciente cuando hay varios, sin importar el orden de llegada', () => {
    const candidatos = [
      dato('d-1', '2026-01-01'),
      dato('d-3', '2026-09-01'),
      dato('d-2', '2026-05-01'),
    ];

    expect(idsElegidos(candidatos)).toBe('d-3');
    expect(idsElegidos([...candidatos].reverse())).toBe('d-3');
  });

  it('devuelve el de id menor cuando empatan en diagnosed_at aunque el de id mayor se haya creado antes', () => {
    // `created_at` no participa en la regla: el desempate es solo por id ascendente.
    const creadoPrimero = { ...dato('d-2', '2026-06-01'), creadoEn: '2026-10-01T00:00:00Z' };
    const creadoDespues = { ...dato('d-1', '2026-06-01'), creadoEn: '2026-10-09T00:00:00Z' };

    expect(idsElegidos([creadoPrimero, creadoDespues])).toBe('d-1');
    expect(idsElegidos([creadoDespues, creadoPrimero])).toBe('d-1');
  });

  it('prefiere el diagnóstico con fecha cuando el otro no tiene fecha', () => {
    expect(idsElegidos([dato('d-1', null), dato('d-2', '2020-01-01')])).toBe('d-2');
  });

  it('desempata por id cuando ninguno tiene fecha', () => {
    expect(idsElegidos([dato('d-2', null), dato('d-1', null)])).toBe('d-1');
  });

  it('no modifica la lista recibida', () => {
    const candidatos = [dato('d-1', '2026-01-01'), dato('d-2', '2026-09-01')];

    idsElegidos(candidatos);

    expect(candidatos.map((c) => c.id)).toEqual(['d-1', 'd-2']);
  });
});

describe('compararVigencia', () => {
  it('es negativa cuando el primero es más reciente, positiva cuando es más antiguo y cero cuando son iguales', () => {
    expect(compararVigencia(dato('a', '2026-09-01'), dato('a', '2026-01-01'))).toBeLessThan(0);
    expect(compararVigencia(dato('a', '2026-01-01'), dato('a', '2026-09-01'))).toBeGreaterThan(0);
    expect(compararVigencia(dato('a', '2026-01-01'), dato('a', '2026-01-01'))).toBe(0);
  });

  it('es negativa para el id menor cuando las fechas son iguales', () => {
    expect(compararVigencia(dato('a', '2026-01-01'), dato('b', '2026-01-01'))).toBeLessThan(0);
    expect(compararVigencia(dato('b', '2026-01-01'), dato('a', '2026-01-01'))).toBeGreaterThan(0);
  });
});

describe('sqlOrdenDeDiagnosticoVigente', () => {
  it('ordena por diagnosed_at descendente y luego por id ascendente cuando no hay alias', () => {
    expect(sqlOrdenDeDiagnosticoVigente()).toBe('diagnosed_at DESC, id ASC');
  });

  it('antepone el alias a ambas columnas cuando se indica', () => {
    expect(sqlOrdenDeDiagnosticoVigente('d.')).toBe('d.diagnosed_at DESC, d.id ASC');
  });
});

const PROCEDENCIA = {
  entryMethod: 'seed',
  extractionConfidence: 'n_a',
  reviewStatus: 'verificado',
  conflictsWithId: null,
  sourceDocumentId: null,
} as const;

const filaDeFicha = (id: string, diagnosedAt: string): FilaDeDiagnostico => ({
  id,
  cancerType: 'mama',
  icd10Code: null,
  histology: null,
  histologyCode: null,
  grade: null,
  stagingSystem: 'TNM_8',
  stageValue: 'IIA',
  performanceScale: 'ECOG',
  performanceValue: 1,
  diagnosedAt,
  isActive: true,
  ...PROCEDENCIA,
});

const registroDeChecklist = (id: string, fecha: string, creadoEn: string): RegistroDeDato => ({
  id,
  reviewStatus: 'verificado',
  fecha,
  creadoEn,
  procedencia: { entryMethod: 'seed', sourceDocumentId: null, page: null },
  columnas: { cancer_type: 'mama' },
});

describe('el diagnóstico vigente de la ficha y del checklist', () => {
  const casos: ReadonlyArray<{
    nombre: string;
    esperado: string;
    filas: ReadonlyArray<[string, string, string]>;
  }> = [
    {
      nombre: 'varios por fecha',
      esperado: 'd-2',
      filas: [
        ['d-1', '2026-01-01', '2026-10-01T00:00:00Z'],
        ['d-2', '2026-08-01', '2026-10-02T00:00:00Z'],
      ],
    },
    {
      nombre: 'empate de fecha con created_at invertido',
      esperado: 'd-1',
      filas: [
        ['d-1', '2026-06-01', '2026-10-09T00:00:00Z'],
        ['d-2', '2026-06-01', '2026-10-01T00:00:00Z'],
      ],
    },
    {
      nombre: 'un solo diagnóstico',
      esperado: 'd-7',
      filas: [['d-7', '2026-03-03', '2026-10-01T00:00:00Z']],
    },
  ];

  it.each(casos)('es el mismo registro cuando hay $nombre', ({ filas, esperado }) => {
    const ficha = elegirDiagnosticoVigenteDeLaFicha(
      filas.map(([id, fecha]) => filaDeFicha(id, fecha)),
    );
    const checklist = diagnosticoVigente(
      filas.map(([id, fecha, creado]) => registroDeChecklist(id, fecha, creado)),
    );

    expect(ficha?.id).toBe(esperado);
    expect(checklist?.id).toBe(ficha?.id);
  });
});

describe('la regla del diagnóstico vigente en el código', () => {
  const RAIZ = join(__dirname, '../../../src');

  const archivosTs = (carpeta: string): string[] =>
    readdirSync(carpeta, { withFileTypes: true }).flatMap((entrada) => {
      const ruta = join(carpeta, entrada.name);
      if (entrada.isDirectory()) return archivosTs(ruta);
      return ruta.endsWith('.ts') ? [ruta] : [];
    });

  it('vive solo en compartido/diagnostico-vigente.ts cuando se busca un ORDER BY diagnosed_at DESC', () => {
    const conLaRegla = archivosTs(RAIZ).filter((ruta) =>
      /diagnosed_at\s+DESC/i.test(readFileSync(ruta, 'utf8')),
    );

    expect(conLaRegla.map((ruta) => ruta.slice(RAIZ.length + 1))).toEqual([
      join('modules', 'compartido', 'diagnostico-vigente.ts'),
    ]);
  });
});
