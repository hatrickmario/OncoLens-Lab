import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { idSembrado } from '../../../prisma/seed/determinismo.js';
import { PACIENTES_SEMILLA } from '../../../prisma/seed/pacientes/indice.js';
import type { PacienteSemilla } from '../../../prisma/seed/pacientes/tipos.js';
import { montarCaso } from '../../support/caso-http.js';
import { servicioDeCompletitud } from '../../support/completitud-http.js';
import { abrirSesion, prepararMundoConSeed, type MundoDeGateway } from '../../support/gateway.js';
import { RUTA_DEL_CATALOGO } from '../../support/seed.js';
import { clienteVerificado } from '../../support/verificarProveedor.js';

/**
 * Pacientes (g)–(m) de US-254 sobre el seed real: la vista de caso muestra su historia (AC-2) y el checklist de
 * faltantes los distingue (AC-3). Catálogo real montado; sin `vi.mock` de módulos propios ni de Prisma.
 */
const ESPACIO_DE_IDS = 7610;
const NUEVOS = PACIENTES_SEMILLA.filter((paciente) => /^paciente-[g-m]$/.test(paciente.clave));
const letraDe = (paciente: PacienteSemilla): string => paciente.clave.replace('paciente-', '');

let mundo: MundoDeGateway;
let cookieDoctor: string;

beforeAll(async () => {
  mundo = await prepararMundoConSeed('caso_momentos', ESPACIO_DE_IDS);
  cookieDoctor = await abrirSesion(mundo, 'doc1@test.local', 'SINT-cookie-doctor-momentos-0001');
});
afterAll(() => mundo.cerrar());

interface VistaDeCaso {
  timeline: {
    eventType: string;
    eventDate: string | null;
    derived: boolean;
    description: string;
  }[];
  priorTreatments: {
    lineNumber: number | null;
    setting: string;
    regimenName: string;
    startedAt: string | null;
    endedAt: string | null;
    ongoing: boolean;
    endReason: string;
  }[];
  completeness: { item: string; status: string }[];
}

async function vistaDe(letra: string): Promise<{ estado: number; cuerpo: VistaDeCaso }> {
  const respuesta = await clienteVerificado(
    montarCaso(mundo, { rutaDelCatalogo: RUTA_DEL_CATALOGO }).app,
  )
    .get(`/platform/patients/${idSembrado(`paciente-${letra}`)}/case`)
    .set('Cookie', cookieDoctor);
  return { estado: respuesta.status, cuerpo: respuesta.body as VistaDeCaso };
}

describe('GET /platform/patients/{id}/case · pacientes por momento de la enfermedad', () => {
  it('GET /case de cada paciente nuevo trae priorTreatments por línea y sus eventos en orden cronológico, validado contra el spec [US-254 AC-2]', async () => {
    expect(NUEVOS).toHaveLength(7);
    for (const paciente of NUEVOS) {
      const { estado, cuerpo } = await vistaDe(letraDe(paciente));

      expect(estado, paciente.clave).toBe(200);
      expect(
        cuerpo.priorTreatments.map((t) => [t.lineNumber, t.setting, t.regimenName]),
        paciente.clave,
      ).toEqual(paciente.tratamientosPrevios.map((t) => [t.numeroDeLinea, t.setting, t.regimen]));
      for (const [indice, previo] of paciente.tratamientosPrevios.entries()) {
        const tratamiento = cuerpo.priorTreatments[indice];
        expect(tratamiento?.startedAt, paciente.clave).not.toBeNull();
        expect(tratamiento?.ongoing, paciente.clave).toBe(previo.fin === undefined);
        expect(tratamiento?.endedAt === null, paciente.clave).toBe(previo.fin === undefined);
      }
      const propios = cuerpo.timeline.filter((evento) => !evento.derived);
      expect(
        propios.map((evento) => evento.eventType),
        paciente.clave,
      ).toEqual(
        [...paciente.eventos]
          .sort((a, b) => b.diasAntes - a.diasAntes)
          .map((evento) => evento.tipo),
      );
      const fechas = cuerpo.timeline.flatMap((e) => (e.eventDate === null ? [] : [e.eventDate]));
      expect(fechas, paciente.clave).toEqual([...fechas].sort());
    }
  });

  it('(k) muestra sus dos líneas terminadas por progresión y (j) la suya en curso [US-254 AC-2]', async () => {
    const k = (await vistaDe('k')).cuerpo;
    const j = (await vistaDe('j')).cuerpo;

    expect(k.priorTreatments).toMatchObject([
      {
        lineNumber: 1,
        setting: 'primera_linea_metastasica',
        ongoing: false,
        endReason: 'progresion',
      },
      {
        lineNumber: 2,
        setting: 'segunda_linea_metastasica',
        ongoing: false,
        endReason: 'progresion',
      },
    ]);
    expect(k.timeline.filter((e) => !e.derived).map((e) => e.eventType)).toEqual([
      'progresion',
      'progresion',
    ]);
    expect(j.priorTreatments).toMatchObject([
      { lineNumber: 1, ongoing: true, endedAt: null, endReason: 'desconocido' },
    ]);
  });
});

describe('Checklist de faltantes de los pacientes nuevos', () => {
  async function faltantesDe(letra: string): Promise<string[]> {
    const servicio = servicioDeCompletitud(mundo, { rutaDelCatalogo: RUTA_DEL_CATALOGO });
    const checklist = await servicio.calcular(idSembrado(`paciente-${letra}`));
    return checklist.items.filter((item) => item.status === 'faltante').map((item) => item.key);
  }

  it('(g) y (l) tienen faltantes distintos y no vacíos y (k) ninguno, sin bloquear la ficha [US-254 AC-3]', async () => {
    const porPaciente: Record<string, string[]> = {};
    for (const paciente of NUEVOS) {
      porPaciente[letraDe(paciente)] = await faltantesDe(letraDe(paciente));
    }
    // Salida que se copia a la guía de la demo (§2.10): una línea por paciente.
    console.info(`faltantes-demo-s5 ${JSON.stringify(porPaciente)}`);

    expect(porPaciente.g?.length).toBeGreaterThan(0);
    expect(porPaciente.l?.length).toBeGreaterThan(0);
    expect(porPaciente.g).not.toEqual(porPaciente.l);
    expect(porPaciente.k).toEqual([]);
    for (const letra of NUEVOS.map(letraDe)) {
      const { estado, cuerpo } = await vistaDe(letra);
      expect(estado, letra).toBe(200);
      expect(
        cuerpo.completeness.some((i) => i.status === 'faltante'),
        letra,
      ).toBe((porPaciente[letra] ?? []).length > 0);
    }
  });
});
