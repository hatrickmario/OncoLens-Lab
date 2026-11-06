import { expect, test, type Page } from '@playwright/test';
import { ID_SEMILLA_H, iniciarSesion } from './soporte';
import es from '../messages/es.json' with { type: 'json' };

const { caso, ficha } = es;
const { registro } = caso;
const { correccion } = ficha;

const seccion = (page: Page, nombre: string) => page.getByRole('region', { name: nombre });

async function abrirElCaso(page: Page) {
  await iniciarSesion(page);
  await page.goto(`/pacientes/${ID_SEMILLA_H}/caso`);
  await expect(seccion(page, caso.secciones.tratamientos)).toBeVisible();
}

/**
 * Corrección de un tratamiento y de un atributo desde la vista de caso (d5fb-05) sobre el paciente semilla (h) (mama
 * adyuvante: letrozol en curso y estado menopáusico), que muta: solo corre sobre un seed recién sembrado
 * (`scripts/e2e/ejecutar.sh` hace `down -v`). Va después de `demo-s5-pacientes.spec.ts` (orden alfabético, un worker) y
 * en serie. `serial` no basta: con `retries: 1` Playwright reintentaría el grupo entero sobre un paciente ya corregido
 * (el selector «Corregir dato · Letrozol» ya no existiría), así que va con `retries: 0`, como `g-demo.spec.ts`. Lo ejerce
 * el job `e2e` de la CI; no se corre en local (Compose completo).
 */
test.describe.configure({ mode: 'serial', retries: 0 });

/** Precondición explícita (como `exigirPacienteSinModificar` de g-demo): el paciente (h) debe estar sin corregir. */
async function exigirPacienteSinCorregir(page: Page) {
  await expect(
    seccion(page, caso.secciones.tratamientos).getByRole('button', {
      name: 'Corregir dato · Letrozol',
    }),
    '(h) ya no tiene el letrozol original: el recorrido necesita el seed intacto; reiniciar el seed (scripts/e2e/ejecutar.sh hace down -v)',
  ).toBeVisible();
}

test.describe('Corrección de tratamientos y atributos en la vista de caso (d5fb-05)', () => {
  test('corregir el esquema de un tratamiento deja la fila nueva con Corrección manual, el anterior en el histórico y el aviso de análisis anteriores [AC-04.1]', async ({
    page,
  }) => {
    await abrirElCaso(page);
    await exigirPacienteSinCorregir(page);
    const tratamientos = seccion(page, caso.secciones.tratamientos);

    await tratamientos.getByRole('button', { name: 'Corregir dato · Letrozol' }).click();
    const dialogo = page.getByRole('dialog', { name: registro.correccion.tratamiento.titulo });
    await expect(dialogo.getByLabel(registro.tratamiento.esquema)).toHaveValue('Letrozol');
    await dialogo.getByLabel(registro.tratamiento.esquema).fill('Anastrozol');
    await dialogo.getByRole('button', { name: correccion.formulario.guardar }).click();

    await expect(dialogo).toHaveCount(0);
    const fila = tratamientos.getByRole('row', { name: /Anastrozol/ });
    await expect(fila).toContainText('Corrección manual');
    await expect(
      tratamientos.getByRole('button', { name: 'Corregir dato · Anastrozol' }),
    ).toBeFocused();
    await expect(tratamientos.getByRole('status')).toContainText(
      correccion.avisoAnalisisAnteriores,
    );

    await tratamientos.getByRole('button', { name: correccion.historico.abrir }).click();
    await expect(
      tratamientos.getByRole('list', { name: correccion.historico.etiqueta }),
    ).toContainText('Letrozol');
  });

  test('corregir el valor de un atributo deja la fila nueva y el valor anterior en el histórico [AC-04.1]', async ({
    page,
  }) => {
    await abrirElCaso(page);
    const atributos = seccion(page, caso.secciones.atributos);

    await atributos.getByRole('button', { name: 'Corregir dato · Estado menopáusico' }).click();
    const dialogo = page.getByRole('dialog', { name: registro.correccion.atributo.titulo });
    await expect(dialogo.getByLabel(registro.atributo.valor)).toHaveValue('posmenopausica');
    await dialogo.getByLabel(registro.atributo.valor).selectOption('perimenopausica');
    await dialogo.getByRole('button', { name: correccion.formulario.guardar }).click();

    await expect(dialogo).toHaveCount(0);
    const fila = atributos.getByRole('row', { name: /Estado menopáusico/ });
    await expect(fila).toContainText('Perimenopáusica');
    await expect(fila).toContainText('Corrección manual');
    await expect(atributos.getByRole('status')).toContainText(correccion.avisoAnalisisAnteriores);

    await atributos.getByRole('button', { name: correccion.historico.abrir }).click();
    await expect(
      atributos.getByRole('list', { name: correccion.historico.etiqueta }),
    ).toContainText('Posmenopáusica');
  });

  test('la vista de caso no desborda horizontalmente a 375 px, con las acciones por fila', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 375, height: 800 });
    await abrirElCaso(page);

    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
      375,
    );
  });
});
