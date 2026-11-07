import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { expect, test } from '@playwright/test';
import type { ConversationTurn } from '../../../packages/api-contracts/src/types/clinical-api';
import es from '../messages/es.json' with { type: 'json' };
import { buscarSecretos } from './buscar-secretos';
import {
  esRespuestaDeTurno,
  esperarTarjeta,
  IDENTIDAD_SINTETICA_CHAT,
  iniciarSesion,
  preguntarEnElChat,
  tarjetasDelChat,
} from './soporte';

const { conversacion } = es;

/** Los bloques que la UI debe poder verificar: los demás (faltante, catalogo, limitacion, fuente) son deterministas y exentos (glosario §3). */
const CON_ENLACE_A_DATO = ['documentado', 'interpretacion', 'conflicto'];
const CON_CITA = ['evidencia'];

/** Preguntas AC01…AC06 de mama (`data/eval/chat-v1/casos.yaml`), en el orden del hilo del chat. */
const PASOS_DE_MAMA = [
  { ac: 'AC01', intent: 'caso', pregunta: '¿Cuál es la situación actual de la paciente?' },
  /** Variante de AC02 con un término del catálogo: el chat falso solo enruta por reglas y `sinonimos.json` no trae «HER2» solo. */
  { ac: 'AC02', intent: 'caso', pregunta: '¿Qué resultado tuvo el receptor de estrógeno?' },
  { ac: 'AC03', intent: 'faltantes', pregunta: '¿Qué información falta del caso?' },
  { ac: 'AC04', intent: 'faltantes', pregunta: '¿Por qué importa el estado menopáusico?' },
  {
    ac: 'AC05',
    intent: 'evidencia',
    pregunta:
      '¿Qué opciones describe la evidencia sobre adjuvant anti-HER2 therapy after surgery en cáncer de mama?',
  },
  {
    ac: 'AC06',
    intent: 'fuentes_limitaciones',
    pregunta: '¿Cuáles son las fuentes y las limitaciones?',
  },
] as const;

/** `idSembrado('paciente-chat')` (P-CHAT, FX-12-b): el mismo UUID determinista del seed de clinical-api. */
const ID_PACIENTE_CHAT = '71ca1471-4002-541a-a9e1-06e6f7ff026d';
/** FX-12-d: nombre, documento y fecha de nacimiento sintéticos de P-CHAT en la pregunta. */
const {
  nombre: NOMBRE_SINTETICO_CHAT,
  documento: DOCUMENTO_SINTETICO_CHAT,
  nacimiento: NACIMIENTO_SINTETICO_CHAT,
} = IDENTIDAD_SINTETICA_CHAT;
const PREGUNTA_FX_12_D = `La paciente ${NOMBRE_SINTETICO_CHAT}, ${DOCUMENTO_SINTETICO_CHAT}, nacida el ${NACIMIENTO_SINTETICO_CHAT}, ¿cuál es su situación actual?`;

/** Vuelca los logs de los contenedores del proyecto de Compose del E2E a `carpeta`, uno por contenedor. */
function volcarLogsDeCompose(carpeta: string) {
  const proyecto = process.env.COMPOSE_PROJECT_NAME ?? 'oncolens-e2e';
  const ids = execFileSync(
    'docker',
    ['ps', '-aq', '--filter', `label=com.docker.compose.project=${proyecto}`],
    { encoding: 'utf8' },
  )
    .split('\n')
    .filter(Boolean);
  for (const id of ids) {
    const logs = execFileSync('docker', ['logs', id], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      maxBuffer: 64 * 1024 * 1024,
    });
    writeFileSync(path.join(carpeta, `${id}.log`), logs);
  }
  return ids.length;
}

test.describe('Chat AC01…AC06 de punta a punta (L1D-326)', () => {
  test('recorre AC01…AC06 de la paciente de mama con intent, enlaces o citas y avisos RN-19 [US-269 AC-1]', async ({
    page,
  }) => {
    await iniciarSesion(page);
    for (const [indice, paso] of PASOS_DE_MAMA.entries()) {
      const respuesta = page.waitForResponse((r) => esRespuestaDeTurno(r));
      await preguntarEnElChat(page, paso.pregunta);
      const turno = (await (await respuesta).json()) as ConversationTurn;
      await esperarTarjeta(page, indice + 1);

      expect(turno.intent, `${paso.ac}: intent`).toBe(paso.intent);
      for (const bloque of turno.blocks.filter((b) => CON_ENLACE_A_DATO.includes(b.kind))) {
        expect(
          bloque.factRefs?.length ?? 0,
          `${paso.ac}: ${bloque.kind} sin factRef`,
        ).toBeGreaterThan(0);
        const enlazados = new Set(turno.dataLinks.map((e) => e.factRef));
        for (const ref of bloque.factRefs ?? [])
          expect(enlazados.has(ref), `${paso.ac}: ${ref}`).toBe(true);
      }
      for (const bloque of turno.blocks.filter((b) => CON_CITA.includes(b.kind))) {
        expect(bloque.citations?.length ?? 0, `${paso.ac}: evidencia sin cita`).toBeGreaterThan(0);
      }
      expect(turno.notices.length, `${paso.ac}: avisos`).toBeGreaterThan(0);
      const avisos = tarjetasDelChat(page)
        .nth(indice)
        .getByRole('region', { name: conversacion.avisosTitulo });
      for (const aviso of turno.notices) {
        expect(aviso.endsWith('.'), `${paso.ac}: aviso con punto final`).toBe(false);
        await expect(avisos.getByText(aviso, { exact: true })).toBeVisible();
      }
    }
  });

  test('deja 0 apariciones de la identidad sintética en los logs de Compose tras FX-12-d [US-269 AC-6]', async ({
    page,
  }) => {
    await iniciarSesion(page);
    await page.goto(`/pacientes/${ID_PACIENTE_CHAT}/analisis`);
    const respuesta = page.waitForResponse((r) => esRespuestaDeTurno(r));
    await preguntarEnElChat(page, PREGUNTA_FX_12_D);
    expect((await respuesta).ok()).toBe(true);
    await esperarTarjeta(page);

    const carpeta = mkdtempSync(path.join(tmpdir(), 'logs-e2e-chat-'));
    try {
      expect(volcarLogsDeCompose(carpeta), 'contenedores del stack').toBeGreaterThan(0);
      const coincidencias = buscarSecretos(carpeta, [
        NOMBRE_SINTETICO_CHAT,
        DOCUMENTO_SINTETICO_CHAT,
        NACIMIENTO_SINTETICO_CHAT,
      ]);
      expect(coincidencias).toEqual([]);
    } finally {
      rmSync(carpeta, { recursive: true, force: true });
    }
  });
});
