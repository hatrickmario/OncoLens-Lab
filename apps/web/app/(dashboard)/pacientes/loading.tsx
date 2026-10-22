import { mensajes } from '../../../lib/mensajes';

/** Estado de carga del listado: filas esqueleto, `aria-busy` y un anuncio para lectores de pantalla. */
export default function CargandoPacientes() {
  const { pacientes } = mensajes();
  return (
    <main className="mx-auto max-w-6xl p-4 sm:p-6">
      <h1 className="m-0 mb-4 text-2xl font-semibold">{pacientes.titulo}</h1>
      <div role="status" aria-busy="true">
        <span className="sr-only">{pacientes.cargando}</span>
        {[0, 1, 2].map((fila) => (
          <div key={fila} aria-hidden="true" className="bg-surface-alt rounded-control mb-2 h-12" />
        ))}
      </div>
    </main>
  );
}
