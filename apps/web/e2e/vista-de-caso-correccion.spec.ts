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
 * en serie: los dos tests no comparten estado, pero un fallo del primero no debe reintentarse sobre un paciente ya
 * corregido (`retries: 1` en la CI). Lo ejerce el job `e2e` de la CI; no se corre en local (Compose completo).
 */
test.describe.configure({ mode: 'serial' });

test.describe('Corrección de tratamientos y atributos en la vista de caso (d5fb-05)', () => {
  test('corregir el esquema de un tratamiento deja la fila nueva con Corrección manual, el anterior en el histórico y el aviso de análisis anteriores [AC-04.1]', async ({
    page,
  }) => {
    await abrirElCaso(page);
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
});
