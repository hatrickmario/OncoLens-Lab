"""`ApplicabilityService` y el mapeo del contexto (L1D-127): orden entre fuentes, omisiones y recuentos del log.

Sin adapters: el servicio solo compone las reglas puras de ``domain/`` sobre los criterios del catálogo de test.
"""

from app.application.aplicabilidad import (
    ApplicabilityService,
    mejor_chunk_por_documento,
    recuentos_para_el_log,
)
from app.application.chunk_citable import ChunkCitable
from app.application.contexto_del_paciente import contexto_del_paciente
from app.domain.aplicabilidad_tipos import PoblacionDelEstudio
from app.domain.relevance import ChunkPuntuado
from app.schemas.generated.models import RagQueryInternalRequest
from tests.support.aplicabilidad import (
    FICHAS_FX08BA,
    POBLACIONES_FX08BA,
    criterios_de_test_apl_1_0_0,
    solicitud_a_m1,
)

A_M1 = contexto_del_paciente(
    RagQueryInternalRequest.model_validate(solicitud_a_m1()).clinicalContext
)


def citable(chunk_id: str, documento: str, puntaje: float) -> ChunkCitable:
    return ChunkCitable(
        ChunkPuntuado(chunk_id, documento, "texto", puntaje), FICHAS_FX08BA[documento]
    )


def servicio() -> ApplicabilityService:
    return ApplicabilityService(criterios_de_test_apl_1_0_0())


def test_mejor_chunk_por_documento_elige_el_de_mayor_puntaje_y_ordena_los_documentos_por_relevancia():
    citables = {
        "ch-a1-2": citable("ch-a1-2", "doc-a1", 0.50),
        "ch-a1-1": citable("ch-a1-1", "doc-a1", 0.80),
        "ch-a4-1": citable("ch-a4-1", "doc-a4", 0.90),
    }

    mejores = mejor_chunk_por_documento(citables)

    assert list(mejores) == ["doc-a4", "doc-a1"]
    assert mejores["doc-a1"].chunk.chunk_id == "ch-a1-1"


def test_mejor_chunk_por_documento_desempata_por_chunk_id_ascendente_cuando_los_puntajes_son_iguales():
    citables = {
        "ch-a1-2": citable("ch-a1-2", "doc-a1", 0.70),
        "ch-a1-1": citable("ch-a1-1", "doc-a1", 0.70),
    }

    assert mejor_chunk_por_documento(citables)["doc-a1"].chunk.chunk_id == "ch-a1-1"


def test_evaluar_ordena_por_relevancia_del_mejor_chunk_y_desempata_por_external_id():
    mejores = {
        "doc-a4": citable("ch-a4-1", "doc-a4", 0.60),
        "doc-a1": citable("ch-a1-1", "doc-a1", 0.60),
        "doc-a3": citable("ch-a3-1", "doc-a3", 0.95),
    }

    fuentes = servicio().evaluar("mama", A_M1, mejores, POBLACIONES_FX08BA)

    assert [f.external_id for f in fuentes] == ["CDR-TEST-A3", "CDR-TEST-A1", "CDR-TEST-A4"]


def test_evaluar_incluye_el_documento_pendiente_y_omite_el_que_no_tiene_fila_de_poblacion():
    mejores = {
        "doc-a1": citable("ch-a1-1", "doc-a1", 0.90),
        "doc-a6": citable("ch-a6-1", "doc-a6", 0.80),
        "doc-a5": citable("ch-a5-1", "doc-a5", 0.70),
    }
    poblaciones = {d: POBLACIONES_FX08BA[d] for d in ("doc-a1", "doc-a6")}

    fuentes = servicio().evaluar("mama", A_M1, mejores, poblaciones)

    assert [f.external_id for f in fuentes] == ["CDR-TEST-A1", "CDR-TEST-A6"]
    pendiente = fuentes[1]
    assert all(c.estado == "desconocido" and c.valor_estudio is None for c in pendiente.criterios)


def test_evaluar_devuelve_los_criterios_en_el_orden_del_catalogo_con_resumen_y_poblacion_no_comparable():
    mejores = {"doc-a4": citable("ch-a4-1", "doc-a4", 0.90)}

    (fuente,) = servicio().evaluar("mama", A_M1, mejores, POBLACIONES_FX08BA)

    assert [c.clave for c in fuente.criterios] == [
        "estado_her2",
        "estadio",
        "ecog",
        "estado_menopausico",
        "linea_tratamiento",
    ]
    assert fuente.poblacion_no_comparable is True  # HER2 excluyente en no_coincide
    assert (fuente.resumen.no_coincide, fuente.resumen.desconocido) == (1, 4)


def test_evaluar_devuelve_vacio_cuando_el_tipo_no_declara_criterios():
    mejores = {"doc-a1": citable("ch-a1-1", "doc-a1", 0.90)}

    assert servicio().evaluar("leucemia", A_M1, mejores, POBLACIONES_FX08BA) == ()
    assert servicio().criterios_del("leucemia") == ()


def test_recuentos_para_el_log_cuenta_estados_y_motivos_sin_incluir_ningun_valor():
    mejores = {"doc-a1": citable("ch-a1-1", "doc-a1", 0.90)}
    fuentes = servicio().evaluar("mama", A_M1, mejores, POBLACIONES_FX08BA)

    recuentos = recuentos_para_el_log(fuentes)

    assert recuentos["documentos"] == 1
    assert (recuentos["coincide"], recuentos["parcial"], recuentos["no_coincide"]) == (2, 0, 0)
    assert recuentos["desconocido"] == 3
    assert recuentos["sin_escala"] == 1
    assert all(isinstance(valor, int) for valor in recuentos.values())


def test_contexto_del_paciente_copia_los_valores_literales_del_contexto_clinico():
    assert A_M1.biomarcadores[0].nombre == "HER2"
    assert A_M1.biomarcadores[0].valor == "3+ (IHQ)"
    assert (A_M1.valor_de_estadio, A_M1.escala_de_desempeno, A_M1.valor_de_desempeno) == (
        "IIA",
        "ECOG",
        1,
    )
    assert [t.numero_de_linea for t in A_M1.tratamientos_previos] == [1]
    assert A_M1.atributos == ()


def test_contexto_del_paciente_deja_vacios_los_campos_del_diagnostico_cuando_no_hay_diagnostico():
    solicitud = solicitud_a_m1()
    solicitud["clinicalContext"]["diagnosis"] = None

    contexto = contexto_del_paciente(
        RagQueryInternalRequest.model_validate(solicitud).clinicalContext
    )

    assert contexto.valor_de_estadio is None
    assert contexto.valor_de_desempeno is None
    assert contexto.biomarcadores == A_M1.biomarcadores


def test_evaluar_omite_el_documento_cuando_su_metadata_source_no_es_un_origen_estructurado_conocido():
    mejores = {
        "doc-a1": citable("ch-a1-1", "doc-a1", 0.90),
        "doc-a4": citable("ch-a4-1", "doc-a4", 0.80),
    }
    desconocido = PoblacionDelEstudio("origen_nuevo", POBLACIONES_FX08BA["doc-a4"].criterios)  # type: ignore[arg-type]
    poblaciones = {"doc-a1": POBLACIONES_FX08BA["doc-a1"], "doc-a4": desconocido}

    fuentes = servicio().evaluar("mama", A_M1, mejores, poblaciones)

    assert [f.external_id for f in fuentes] == ["CDR-TEST-A1"]
