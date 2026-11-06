import { expect, test, type Page } from '@playwright/test';
import { ID_SEMILLA_D, iniciarSesion } from './soporte';
import es from '../messages/es.json' with { type: 'json' };

const { caso, datosCriticos } = es;
const { registro } = caso;
const { tratamiento } = registro;
const declaracion = tratamiento.declaracion;

const filaDeTratamientos = (page: Page) =>
  page
    .getByRole('region', { name: datosCriticos.titulo })
    .getByRole('listitem')
    .filter({ hasText: caso.secciones.tratamientos });
const seccionDeTratamientos = (page: Page) =>
  page.getByRole('region', { name: caso.secciones.tratamientos });

/**
 * Recorrido de «Sin tratamiento previo a la fecha» (d5fb-04) sobre el paciente semilla (d) (mama sin tratamientos), que
 * muta: solo corre sobre un seed recién sembrado (`scripts/e2e/ejecutar.sh` hace `down -v`). Son dos pasos en serie: el
 * segundo depende del primero (necesita la declaración ya creada), así que un fallo del primero no se reintenta en el
 * segundo con un estado a medias (`retries: 1` en la CI). Lo ejerce el job `e2e` de la CI.
 */
test.describe.configure({ mode: 'serial' });

test.describe('Declaración «Sin tratamiento previo a la fecha» (d5fb-04)', () => {
  test('declarar la ausencia deja de ser Faltante y la sección lo muestra distinto de «Sin datos» [AC-04.1]', async ({
    page,
  }) => {
    await iniciarSesion(page);
    await page.goto(`/pacientes/${ID_SEMILLA_D}/caso`);
    await expect(filaDeTratamientos(page)).toContainText(datosCriticos.estado.faltante);

    await filaDeTratamientos(page)
      .getByRole('button', { name: datosCriticos.acciones.agregarTratamiento })
      .click();
    const dialogo = page.getByRole('dialog', { name: tratamiento.titulo });
    await dialogo.getByRole('checkbox', { name: declaracion.casilla }).check();
    await expect(dialogo.getByLabel(tratamiento.esquema)).toHaveCount(0);
    await dialogo.getByRole('button', { name: registro.guardar }).click();

    await expect(dialogo).toHaveCount(0);
    await expect(filaDeTratamientos(page)).toContainText(datosCriticos.estado.presente_verificado);
    await expect(filaDeTratamientos(page)).toContainText(declaracion.declarado);
    await expect(seccionDeTratamientos(page).getByText(declaracion.sinTratamiento)).toBeVisible();
  });

  test('registrar un tratamiento después reemplaza la declaración (depende del test anterior) [AC-04.1]', async ({
    page,
  }) => {
    await iniciarSesion(page);
    await page.goto(`/pacientes/${ID_SEMILLA_D}/caso`);
    await expect(
      seccionDeTratamientos(page).getByText(declaracion.sinTratamiento),
      'la declaración del test anterior debe existir: este test depende de él',
    ).toBeVisible();

    await page.getByRole('button', { name: tratamiento.accion }).click();
    const registrar = page.getByRole('dialog', { name: tratamiento.titulo });
    await expect(registrar.getByText(declaracion.reemplazo)).toBeVisible();
    await expect(registrar.getByRole('checkbox', { name: declaracion.casilla })).toHaveCount(0);
    await registrar.getByLabel(tratamiento.esquema).fill('Fármaco experimental X');
    await registrar.getByLabel(tratamiento.contexto).selectOption('segunda_linea_metastasica');
    await registrar.getByLabel(tratamiento.enCurso).check();
    await registrar.getByRole('button', { name: registro.guardar }).click();
    await registrar.getByRole('button', { name: registro.cerrar }).click();

    await expect(
      seccionDeTratamientos(page).getByRole('row', { name: /Fármaco experimental X/ }),
    ).toBeVisible();
    await expect(seccionDeTratamientos(page).getByText(declaracion.sinTratamiento)).toHaveCount(0);
    await expect(filaDeTratamientos(page)).not.toContainText(declaracion.declarado);
  });
});
