"""Dataset ``chat-v1`` de la familia ``chat`` (US-269 AC-2, AC-8; RN-13, RN-14): cobertura, clase y revisión clínica."""

import shutil
from pathlib import Path

import pytest
import yaml

from app.evaluation.dataset_chat import ACS, TIPOS_DE_CANCER, cargar_dataset_de_chat
from app.evaluation.dataset_loader import DatasetInvalido
from app.evaluation.rutas import raiz_repo

CHAT_V1 = raiz_repo() / "data" / "eval" / "chat-v1"


@pytest.fixture()
def copia(tmp_path: Path) -> Path:
    destino = tmp_path / "chat-v1"
    shutil.copytree(CHAT_V1, destino)
    return destino


def _editar_casos(directorio: Path, editar) -> None:
    ruta = directorio / "casos.yaml"
    crudo = yaml.safe_load(ruta.read_text(encoding="utf-8"))
    editar(crudo)
    ruta.write_text(yaml.safe_dump(crudo, allow_unicode=True), encoding="utf-8")


@pytest.mark.ac("US-269", 2)
def test_cargar_dataset_de_chat_cubre_ac01_a_ac06_por_tipo_de_cancer_cuando_se_valida_chat_v1():
    dataset = cargar_dataset_de_chat(CHAT_V1)

    assert dataset.clase == "sintetico"
    assert len(dataset.casos) >= 12
    pares = {(c.ac, c.cancer) for c in dataset.casos}
    assert pares == {(ac, tipo) for ac in ACS for tipo in TIPOS_DE_CANCER}
    assert all(c.respuesta_esperada for c in dataset.casos)
    assert all(c.hechos_esperados or c.criterios_esperados for c in dataset.casos)


@pytest.mark.ac("US-269", 2)
def test_cargar_dataset_de_chat_rechaza_chat_v1_sin_cobertura_de_un_par_cuando_falta_ac04_de_prostata(
    copia: Path,
):
    _editar_casos(
        copia,
        lambda crudo: crudo.update(
            casos=[c for c in crudo["casos"] if c["id"] != "CHAT-AC04-PROSTATA"]
        ),
    )

    with pytest.raises(DatasetInvalido, match="AC04.*prostata"):
        cargar_dataset_de_chat(copia)


@pytest.mark.ac("US-269", 8)
def test_cargar_dataset_de_chat_rechaza_un_caso_sin_revision_oncologo_cuando_falta_el_campo(
    copia: Path,
):
    _editar_casos(copia, lambda crudo: crudo["casos"][0].pop("revision_oncologo"))

    with pytest.raises(DatasetInvalido, match="revision_oncologo"):
        cargar_dataset_de_chat(copia)


def test_cargar_dataset_de_chat_rechaza_un_dataset_que_no_es_sintetico_cuando_el_manifiesto_dice_otra_clase(
    copia: Path,
):
    manifiesto = copia / "manifest.yaml"
    manifiesto.write_text(
        manifiesto.read_text(encoding="utf-8").replace(
            "clase: sintetico", "clase: real_anonimizado"
        ),
        encoding="utf-8",
    )

    with pytest.raises(DatasetInvalido, match="sintetico"):
        cargar_dataset_de_chat(copia)


def test_cargar_dataset_de_chat_rechaza_un_valor_de_revision_desconocido_cuando_no_es_pendiente_ni_aprobado(
    copia: Path,
):
    _editar_casos(copia, lambda crudo: crudo["casos"][0].update(revision_oncologo="firmado"))

    with pytest.raises(DatasetInvalido, match="revision_oncologo"):
        cargar_dataset_de_chat(copia)


def test_cargar_dataset_de_chat_rechaza_un_caso_previo_que_no_va_antes_cuando_el_orden_se_invierte(
    copia: Path,
):
    def invertir(crudo):
        casos = crudo["casos"]
        i05 = next(i for i, c in enumerate(casos) if c["id"] == "CHAT-AC05-MAMA")
        i06 = next(i for i, c in enumerate(casos) if c["id"] == "CHAT-AC06-MAMA")
        casos[i05], casos[i06] = casos[i06], casos[i05]

    _editar_casos(copia, invertir)

    with pytest.raises(DatasetInvalido, match="previo"):
        cargar_dataset_de_chat(copia)


def test_cargar_dataset_de_chat_rechaza_un_caso_sin_hechos_ni_criterios_esperados_cuando_ambos_estan_vacios(
    copia: Path,
):
    def vaciar(crudo):
        caso = crudo["casos"][0]
        caso["hechos_esperados"] = []
        caso["criterios_esperados"] = []

    _editar_casos(copia, vaciar)

    with pytest.raises(DatasetInvalido, match="esperados"):
        cargar_dataset_de_chat(copia)


def test_cargar_dataset_de_chat_rechaza_una_intencion_desconocida_cuando_no_es_de_las_cuatro_del_chat(
    copia: Path,
):
    _editar_casos(copia, lambda crudo: crudo["casos"][0].update(intent="recomendar"))

    with pytest.raises(DatasetInvalido, match="intent"):
        cargar_dataset_de_chat(copia)
