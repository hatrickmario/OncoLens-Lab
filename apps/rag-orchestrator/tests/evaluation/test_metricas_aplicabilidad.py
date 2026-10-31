"""Unitarios de las reglas puras de la familia `aplicabilidad` (US-132): métricas, cobertura y lector de revisión."""

from __future__ import annotations

from pathlib import Path

import pytest

from app.domain.aplicabilidad_tipos import (
    AtributoDelPaciente,
    BiomarcadorDelPaciente,
    ContextoDelPaciente,
    CriterioEvaluado,
)
from app.config.settings import POBLACION_MAX_VALORES_POR_CRITERIO_INICIAL as MAX_VALORES
from app.domain.cobertura_poblacion import proporcion_con_criterios, tiene_criterios_de_poblacion
from app.evaluation.config_suite import ConfigInvalida
from app.evaluation.metricas.aplicabilidad import (
    Esperado,
    coincide_sin_cita,
    concordancia_de_estados,
    marca_frente_a_meta,
    valores_no_copiados,
    veredicto_de_invariantes,
)
from app.evaluation.revision_muestra import leer_revision
from tests.support.aplicabilidad import criterios_de_test_apl_1_0_0

CATALOGO = {c.clave: c for c in criterios_de_test_apl_1_0_0().criterios("mama")}
CONTEXTO = ContextoDelPaciente(
    biomarcadores=(BiomarcadorDelPaciente("HER2", "3+ (IHQ)", 1),),
    atributos=(AtributoDelPaciente("estado_menopausico", "posmenopausica", 2),),
)


def criterio(clave: str = "estado_her2", **cambios: object) -> CriterioEvaluado:
    base: dict[str, object] = {
        "clave": clave,
        "valor_paciente": "3+ (IHQ)",
        "valor_estudio": "positivo",
        "estado": "coincide",
        "causa": None,
        "es_excluyente": True,
    }
    return CriterioEvaluado(**{**base, **cambios})  # type: ignore[arg-type]


class TestConcordanciaDeEstados:
    def test_devuelve_total_cero_cuando_no_hay_criterios_esperados(self) -> None:
        resultado = concordancia_de_estados({}, [])

        assert (resultado.aciertos, resultado.total) == (0, 0)

    def test_cuenta_todos_cuando_los_estados_coinciden_con_lo_esperado(self) -> None:
        resultado = concordancia_de_estados({"estado_her2": Esperado("coincide")}, [criterio()])

        assert (resultado.aciertos, resultado.total) == (1, 1)

    def test_no_cuenta_el_criterio_cuando_el_estado_difiere(self) -> None:
        resultado = concordancia_de_estados({"estado_her2": Esperado("no_coincide")}, [criterio()])

        assert resultado.aciertos == 0

    def test_no_cuenta_el_criterio_cuando_la_causa_difiere(self) -> None:
        obtenido = criterio(estado="desconocido", causa="falta_en_paciente", valor_estudio=None)
        esperado = Esperado("desconocido", "no_reportado_por_fuente")

        assert concordancia_de_estados({"estado_her2": esperado}, [obtenido]).aciertos == 0

    def test_cuenta_como_fallo_el_criterio_esperado_que_no_se_obtuvo(self) -> None:
        resultado = concordancia_de_estados({"ecog": Esperado("coincide")}, [criterio()])

        assert (resultado.aciertos, resultado.total) == (0, 1)

    def test_cuenta_el_criterio_cuando_el_aviso_esperado_coincide_con_el_del_dato_del_paciente(
        self,
    ) -> None:
        obtenido = criterio(aviso="sin_verificar")
        esperado = Esperado("coincide", aviso="sin_verificar")

        assert concordancia_de_estados({"estado_her2": esperado}, [obtenido]).aciertos == 1

    def test_no_cuenta_el_criterio_cuando_el_aviso_esperado_difiere(self) -> None:
        esperado = Esperado("coincide", aviso="sin_verificar")

        assert concordancia_de_estados({"estado_her2": esperado}, [criterio()]).aciertos == 0

    def test_no_compara_el_aviso_cuando_el_esperado_no_lo_declara(self) -> None:
        obtenido = criterio(aviso="sin_verificar")

        assert (
            concordancia_de_estados({"estado_her2": Esperado("coincide")}, [obtenido]).aciertos == 1
        )


class TestCoincideSinCita:
    def test_vale_cero_cuando_el_criterio_cita_el_mejor_chunk_de_la_fuente(self) -> None:
        assert coincide_sin_cita([criterio()], {"ch-1"}) == 0

    def test_vale_cero_cuando_la_cita_textual_es_un_chunk_de_la_fuente(self) -> None:
        assert coincide_sin_cita([criterio(chunk_citado_id="ch-1")], {"ch-1"}) == 0

    def test_cuenta_cuando_la_cita_es_de_otra_fuente(self) -> None:
        assert coincide_sin_cita([criterio(chunk_citado_id="ch-ajeno")], {"ch-1"}) == 1

    def test_cuenta_cuando_la_fuente_no_tiene_chunks(self) -> None:
        assert coincide_sin_cita([criterio()], set()) == 1

    def test_cuenta_cuando_un_coincide_no_trae_valor_del_estudio(self) -> None:
        assert coincide_sin_cita([criterio(valor_estudio=None)], {"ch-1"}) == 1

    def test_ignora_los_criterios_que_no_estan_en_coincide(self) -> None:
        desconocido = criterio(estado="desconocido", valor_estudio=None, chunk_citado_id="x")

        assert coincide_sin_cita([desconocido], {"ch-1"}) == 0


class TestValoresNoCopiados:
    def test_vale_cero_cuando_el_valor_es_el_del_contexto(self) -> None:
        assert valores_no_copiados([criterio()], CONTEXTO, CATALOGO) == 0

    def test_vale_cero_cuando_ambos_valores_son_nulos(self) -> None:
        sin_valor = criterio("ecog", valor_paciente=None, estado="desconocido")

        assert valores_no_copiados([sin_valor], CONTEXTO, CATALOGO) == 0

    def test_cuenta_cuando_el_valor_es_distinto_del_contexto(self) -> None:
        assert valores_no_copiados([criterio(valor_paciente="2+")], CONTEXTO, CATALOGO) == 1

    def test_cuenta_cuando_el_criterio_no_esta_en_el_catalogo(self) -> None:
        assert valores_no_copiados([criterio("inventado")], CONTEXTO, CATALOGO) == 1

    def test_acepta_nulo_cuando_el_checklist_declara_el_dato_faltante(self) -> None:
        contexto = ContextoDelPaciente(
            biomarcadores=CONTEXTO.biomarcadores,
            datos_criticos_faltantes=frozenset({"estado_her2"}),
        )

        assert valores_no_copiados([criterio(valor_paciente=None)], contexto, CATALOGO) == 0


class TestVeredictoDeInvariantes:
    def test_devuelve_lista_vacia_cuando_ambas_valen_cero(self) -> None:
        assert veredicto_de_invariantes(0, 0) == []

    def test_nombra_ambas_metricas_cuando_las_dos_son_mayores_que_cero(self) -> None:
        assert veredicto_de_invariantes(1, 2) == [
            "criterios_coincide_sin_cita",
            "valores_paciente_no_copiados",
        ]


class TestMarcaFrenteAMeta:
    @pytest.mark.parametrize(
        ("valor", "marca"),
        [(0.95, "en_meta"), (0.949, "fuera_de_meta"), (None, "no_medida")],
    )
    def test_marca_segun_el_minimo(self, valor: float | None, marca: str) -> None:
        assert marca_frente_a_meta(valor, 0.95) == marca


class TestCoberturaDePoblacion:
    def test_no_cuenta_el_documento_cuando_todo_es_no_disponible(self) -> None:
        assert not tiene_criterios_de_poblacion(
            {"ecog": "no_disponible", "biomarcadores": {}}, MAX_VALORES
        )

    def test_cuenta_el_documento_cuando_un_biomarcador_anidado_trae_valor(self) -> None:
        assert tiene_criterios_de_poblacion(
            {"ecog": "no_disponible", "biomarcadores": {"her2": "positivo"}}, MAX_VALORES
        )

    def test_cuenta_el_valor_con_alcance_como_una_hoja(self) -> None:
        assert tiene_criterios_de_poblacion(
            {"ecog": {"valor": "0-1", "alcance": "subgrupo"}}, MAX_VALORES
        )

    def test_no_cuenta_el_documento_que_produce_la_ingesta_cuando_no_declara_nada(self) -> None:
        from app.domain.corpus_seed.poblacion import resolver_criterios_poblacion

        assert not tiene_criterios_de_poblacion(resolver_criterios_poblacion({}), MAX_VALORES)

    def test_no_cuenta_la_marca_pendiente_la_lista_vacia_ni_la_lista_de_forma_invalida(
        self,
    ) -> None:
        invalida = [{"value": "x", "chunkId": "ch-1", "scope": "global"}]
        for criterios in (
            {"linea": {"status": "pendiente", "values": []}},
            {"linea": []},
            {"linea": invalida},
        ):
            assert not tiene_criterios_de_poblacion(criterios, MAX_VALORES)

    def test_cuenta_el_documento_cuando_un_criterio_trae_una_lista_valida(self) -> None:
        valida = [{"value": "x", "chunkId": "ch-1", "scope": "elegibilidad"}]

        assert tiene_criterios_de_poblacion({"linea": valida}, MAX_VALORES)

    def test_devuelve_nulo_cuando_no_hay_documentos_vigentes(self) -> None:
        assert proporcion_con_criterios(0, 0) is None

    def test_devuelve_la_proporcion_cuando_hay_vigentes(self) -> None:
        assert proporcion_con_criterios(10, 7) == 0.7


class TestLeerRevision:
    def test_devuelve_sin_archivo_cuando_la_ruta_no_existe(self, tmp_path: Path) -> None:
        resultado = leer_revision(tmp_path / "no-existe.yaml")

        assert (resultado.exactitud, resultado.causa) == (None, "sin_archivo")

    def test_devuelve_sin_archivo_cuando_no_hay_ruta(self) -> None:
        assert leer_revision(None).causa == "sin_archivo"

    def test_devuelve_todo_pendiente_cuando_ningun_campo_esta_revisado(
        self, tmp_path: Path
    ) -> None:
        archivo = tmp_path / "m.yaml"
        archivo.write_text(
            "documentos:\n- document_id: d1\n  campos:\n  - {campo: a, valor: x, revision: pendiente}\n",
            encoding="utf-8",
        )

        resultado = leer_revision(archivo)

        assert (resultado.exactitud, resultado.causa, resultado.pendientes) == (
            None,
            "todo_pendiente",
            1,
        )

    def test_rechaza_un_archivo_sin_documentos(self, tmp_path: Path) -> None:
        archivo = tmp_path / "m.yaml"
        archivo.write_text("release: r\n", encoding="utf-8")

        with pytest.raises(ConfigInvalida):
            leer_revision(archivo)
