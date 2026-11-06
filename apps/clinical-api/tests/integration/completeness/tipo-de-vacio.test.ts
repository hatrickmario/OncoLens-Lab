import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { idSembrado } from '../../../prisma/seed/determinismo.js';
import { PACIENTE_CHAT } from '../../../prisma/seed/pacientes/chat.js';
import { montarCompletitud } from '../../support/completitud-http.js';
import { abrirSesion, prepararMundoConSeed, type MundoDeGateway } from '../../support/gateway.js';
import { RUTA_DEL_CATALOGO } from '../../support/seed.js';
import { clienteVerificado } from '../../support/verificarProveedor.js';

/**
 * US-263 (L1D-320): `gapType` en `GET /platform/patients/{id}/completeness` sobre `P-CHAT` (FX-12-b) con el catálogo
 * 1.6.0. El mapeo `sourceDocumentTypes` del catálogo real coincide con FX-12-c en `re`, `tnm`, `ki67` y
 * `estado_menopausico` (se comprueba abajo), así que el catálogo real hace de FX-12-c.
 */
const ESPACIO_DE_IDS = 9515;
const PACIENTE = idSembrado(PACIENTE_CHAT);

let mundo: MundoDeGateway;
let cookie: string;

beforeAll(async () => {
  mundo = await prepararMundoConSeed('compl_tipo_de_vacio', ESPACIO_DE_IDS);
  cookie = await abrirSesion(mundo, 'doc1@test.local', 'SINT-cookie-doctor-tipo-de-vacio-0001');
});
afterAll(() => mundo.cerrar());

interface ItemDeLaVista {
  item: string;
  status: string;
  gapType: string | null;
}

async function checklistDelChat(): Promise<{ status: number; items: ItemDeLaVista[] }> {
  const { app } = montarCompletitud(mundo, { rutaDelCatalogo: RUTA_DEL_CATALOGO });
  const respuesta = await clienteVerificado(app)
    .get(`/platform/patients/${PACIENTE}/completeness`)
    .set('Cookie', cookie);
  return { status: respuesta.status, items: respuesta.body.items as ItemDeLaVista[] };
}

const tipoDeVacioPorItem = (items: ItemDeLaVista[]): Record<string, string | null> =>
  Object.fromEntries(items.map((i) => [i.item, i.gapType]));

describe('GET /completeness · tipo de vacío de P-CHAT (US-263)', () => {
  it('declara en el catálogo 1.6.0 los tipos de documento fuente de FX-12-c para re, tnm, ki67 y estado_menopausico [US-263 AC-2]', () => {
    const archivo = JSON.parse(
      readFileSync(`${RUTA_DEL_CATALOGO}/mama/datos-criticos.json`, 'utf8'),
    ) as { items: { key: string; sourceDocumentTypes: string[] }[] };
    const tipos = Object.fromEntries(archivo.items.map((i) => [i.key, i.sourceDocumentTypes]));

    expect(tipos).toMatchObject({
      ki67: ['examen'],
      estado_menopausico: ['historia_clinica'],
      re: ['examen'],
      tnm: ['historia_clinica', 'examen'],
    });
  });

  it('clasifica Ki-67 no_buscado, menopausia no_encontrado, RE incompleto y TNM por_conciliar, y deja null los verificados sin conflicto cuando el doctor consulta el checklist [US-263 AC-2] [AC-04.1] [S6 resp. 10]', async () => {
    const { status, items } = await checklistDelChat();

    expect(status).toBe(200);
    const tipos = tipoDeVacioPorItem(items);
    expect(tipos).toMatchObject({
      ki67: 'no_buscado',
      estado_menopausico: 'no_encontrado',
      re: 'incompleto',
      tnm: 'por_conciliar',
    });
    // El status no cambia: TNM sigue presente_verificado; solo el segundo eje marca el conflicto pendiente.
    expect(items.find((i) => i.item === 'tnm')?.status).toBe('presente_verificado');
    const verificadosSinConflicto = items.filter(
      (i) => i.status === 'presente_verificado' && i.item !== 'tnm',
    );
    expect(verificadosSinConflicto.length).toBeGreaterThan(0);
    expect(verificadosSinConflicto.map((i) => i.gapType)).toEqual(
      verificadosSinConflicto.map(() => null),
    );
  });

  it('mantiene Ki-67 no_buscado cuando el único examen del paciente tiene ocr_status error [US-263 AC-3] [S6 resp. 10]', async () => {
    const { rows } = await mundo.cliente.query<{ document_type: string; ocr_status: string }>(
      `SELECT document_type::text AS document_type, ocr_status::text AS ocr_status
         FROM clinical.document WHERE patient_id = $1 ORDER BY document_type`,
      [PACIENTE],
    );
    expect(rows.map((r) => [r.document_type, r.ocr_status])).toEqual([
      ['examen', 'error'],
      ['historia_clinica', 'completado'],
    ]);

    const { items } = await checklistDelChat();

    expect(tipoDeVacioPorItem(items)['ki67']).toBe('no_buscado');
  });

  it('pasa Ki-67 a no_encontrado cuando el examen se procesa (ocr_status completado) y vuelve a no_buscado al fallar [US-263 AC-3] [S6 resp. 10]', async () => {
    const fijar = (estado: string) =>
      mundo.cliente.query(
        `UPDATE clinical.document SET ocr_status = $2::clinical.ocr_status
          WHERE patient_id = $1 AND document_type = 'examen'`,
        [PACIENTE, estado],
      );
    await fijar('completado');
    try {
      const procesado = await checklistDelChat();
      expect(tipoDeVacioPorItem(procesado.items)['ki67']).toBe('no_encontrado');
    } finally {
      await fijar('error');
    }

    const fallido = await checklistDelChat();

    expect(tipoDeVacioPorItem(fallido.items)['ki67']).toBe('no_buscado');
  });
});
