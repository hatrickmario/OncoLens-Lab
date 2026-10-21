"""Solo datos sintéticos y solo agregados en el reporte (US-072 AC-5, RN-13, RN-14)."""

from __future__ import annotations

import json
import shutil
from pathlib import Path

import pytest
import yaml

from app.evaluation.dataset_loader import DatasetInvalido
from app.evaluation.evaluate import main
from app.evaluation.fuente_dataset import FuenteDatasetEnDirectorio
from app.evaluation.reporte import (
    Booleano,
    Enumerado,
    Identificador,
    Numero,
    Objeto,
    ReporteFueraDeEsquema,
    escribir_reporte_cerrado,
)
from tests.evaluation.conftest import RAIZ_APP, RAIZ_REPO
from tests.support.fakes import RelojFijo

CONFIG = RAIZ_APP / "eval" / "configs" / "test-fake.yaml"
FX = RAIZ_REPO / "data" / "eval" / "fx-t5a-a"


def dataset_con_clase(destino: Path, clase: str) -> Path:
    """Copia de FX-T5a-a cuyo manifiesto y cuyos archivos declaran ``clase``."""
    shutil.copytree(FX, destino)
    for archivo in destino.glob("*.yaml"):
        contenido = yaml.safe_load(archivo.read_text(encoding="utf-8"))
        contenido["clase"] = clase
        archivo.write_text(yaml.safe_dump(contenido, allow_unicode=True), encoding="utf-8")
    return destino


def config_para(tmp_path: Path, dataset: Path) -> Path:
    crudo = yaml.safe_load(CONFIG.read_text(encoding="utf-8"))
    crudo["dataset"]["ruta"] = str(dataset)
    ruta = tmp_path / "config.yaml"
    ruta.write_text(yaml.safe_dump(crudo), encoding="utf-8")
    return ruta


@pytest.mark.ac("US-072", 5)
def test_un_dataset_del_repo_sin_clase_sintetico_termina_con_codigo_distinto_de_0_sin_resultados(
    tmp_path: Path,
) -> None:
    repo = tmp_path / "repo"
    dataset = dataset_con_clase(repo / "data" / "eval" / "ajeno", "real_anonimizado")
    salida = tmp_path / "salida"

    codigo = main(
        ["--config", str(config_para(tmp_path, dataset)), "--salida", str(salida)],
        reloj=RelojFijo(),
        raiz=repo,
    )

    assert codigo != 0
    assert not salida.exists()


def test_un_dataset_fuera_del_repo_puede_declarar_real_anonimizado(tmp_path: Path) -> None:
    dataset = dataset_con_clase(tmp_path / "ajeno", "real_anonimizado")

    cargado = FuenteDatasetEnDirectorio(dataset, raiz=tmp_path / "repo").cargar()

    assert cargado.clase == "real_anonimizado"


def test_un_archivo_con_otra_clase_que_el_manifiesto_se_rechaza(tmp_path: Path) -> None:
    dataset = dataset_con_clase(tmp_path / "ds", "sintetico")
    preguntas = dataset / "preguntas.yaml"
    contenido = yaml.safe_load(preguntas.read_text(encoding="utf-8"))
    contenido["clase"] = "real_anonimizado"
    preguntas.write_text(yaml.safe_dump(contenido, allow_unicode=True), encoding="utf-8")

    with pytest.raises(DatasetInvalido):
        FuenteDatasetEnDirectorio(dataset).cargar()


def textos_del_dataset() -> list[str]:
    dataset = FuenteDatasetEnDirectorio(FX).cargar()
    return [
        *(p.texto for p in dataset.preguntas),
        *(c.texto for c in dataset.chunks),
        *(o.opcion for ops in dataset.propuestas.values() for o in ops),
        *(o.justificacion for ops in dataset.propuestas.values() for o in ops),
        *dataset.textos_pii,
        *dataset.salidas_prescriptivas,
    ]


@pytest.mark.ac("US-072", 5)
def test_el_resultado_no_contiene_textos_de_preguntas_fragmentos_ni_salidas(
    tmp_path: Path,
) -> None:
    assert main(["--config", str(CONFIG), "--salida", str(tmp_path)], reloj=RelojFijo()) == 0

    contenido = next(tmp_path.glob("*.json")).read_text(encoding="utf-8")
    assert [t for t in textos_del_dataset() if t in contenido or t.lower() in contenido] == []
    assert "FX-0" not in contenido  # ni siquiera los ids de las preguntas


ESQUEMA = Objeto(
    {
        "n": Numero(),
        "ok": Booleano(),
        "rotulo": Enumerado(frozenset({"validada", "no_validada"})),
        "modelo": Identificador(),
    }
)
VALIDO = {"n": 1, "ok": True, "rotulo": "validada", "modelo": "fake-bow@1"}


@pytest.mark.parametrize(
    "reporte",
    [
        {**VALIDO, "pregunta": "¿Qué describe la evidencia?"},
        {**VALIDO, "modelo": "¿Qué describe la evidencia sobre anti-HER2?"},
        {**VALIDO, "modelo": "texto_libre sin enumerar con espacios"},
        {**VALIDO, "rotulo": "cualquier texto"},
        {**VALIDO, "n": "7"},
        {**VALIDO, "n": True},
        {k: v for k, v in VALIDO.items() if k != "n"},
    ],
    ids=[
        "clave_ajena",
        "texto_en_clave_permitida",
        "cadena_libre",
        "fuera_del_enumerado",
        "numero_como_cadena",
        "booleano_como_numero",
        "clave_faltante",
    ],
)
def test_el_esquema_cerrado_rechaza_y_no_deja_archivo_cuando_el_reporte_sale_de_la_lista_blanca(
    tmp_path: Path, reporte: dict
) -> None:
    destino = tmp_path / "reporte.json"

    with pytest.raises(ReporteFueraDeEsquema):
        escribir_reporte_cerrado(destino, reporte, ESQUEMA)

    assert not destino.exists()


def test_el_esquema_cerrado_acepta_null_donde_la_metrica_no_existe_y_lo_escribe_como_null(
    tmp_path: Path,
) -> None:
    destino = tmp_path / "reporte.json"

    escribir_reporte_cerrado(destino, {**VALIDO, "n": float("nan")}, ESQUEMA)

    assert json.loads(destino.read_text(encoding="utf-8"))["n"] is None
