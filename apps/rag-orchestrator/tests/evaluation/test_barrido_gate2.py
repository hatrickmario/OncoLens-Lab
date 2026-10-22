"""Salvaguardas del barrido pedidas por el Gate 2 de L1D-236: dataset sintético, ``--fijar`` acotado, esquema y paridad del umbral."""

from __future__ import annotations

import json
import shutil
from pathlib import Path

import pytest
import yaml

from app.domain.relevance import ChunkPuntuado, filtrar_sobre_umbral, supera_umbral
from app.evaluation.config_suite import ConfigInvalida
from app.evaluation.corrida_barrido import fijar_umbral_en_config
from app.evaluation.evaluate import main
from app.evaluation.informe_baseline import ESQUEMA_BASELINE
from app.evaluation.reporte import ReporteFueraDeEsquema, validar_esquema_cerrado
from tests.evaluation.conftest import RAIZ_APP, RAIZ_REPO
from tests.evaluation.test_barrido_aceptacion import config_de_barrido
from tests.support.fakes import RelojFijo

CONFIG = RAIZ_APP / "eval" / "configs" / "test-fake.yaml"
INFORME = RAIZ_APP / "eval" / "reports" / "S1-baseline.md"
SALIDA_DE_ARCHIVOS = ("S1-baseline.json", "S1-baseline.md")


def dataset_real_anonimizado(tmp_path: Path) -> Path:
    """Copia de FX-T5a-a declarada ``real_anonimizado`` en su manifiesto y en cada archivo."""
    destino = tmp_path / "dataset-real"
    shutil.copytree(RAIZ_REPO / "data" / "eval" / "fx-t5a-a", destino)
    for archivo in destino.glob("*.yaml"):
        archivo.write_text(
            archivo.read_text(encoding="utf-8").replace(
                "clase: sintetico", "clase: real_anonimizado"
            ),
            encoding="utf-8",
        )
    return destino


def barrer_con(tmp_path: Path, config: Path, *extra: str, **kwargs: Path) -> int:
    return main(
        [
            "--config",
            str(config),
            "--sweep",
            "relevance_threshold",
            "--salida",
            str(tmp_path / "salida"),
            *extra,
        ],
        reloj=RelojFijo(),
        **kwargs,
    )


def test_barrido_se_niega_sin_escribir_nada_cuando_el_dataset_es_real_anonimizado(
    tmp_path: Path,
) -> None:
    config = config_de_barrido(tmp_path)
    crudo = yaml.safe_load(config.read_text(encoding="utf-8"))
    crudo["dataset"]["ruta"] = str(dataset_real_anonimizado(tmp_path))
    config.write_text(yaml.safe_dump(crudo), encoding="utf-8")
    antes = config.read_bytes()

    codigo = barrer_con(tmp_path, config, "--fijar", directorio_de_configs=tmp_path)

    assert codigo == 1
    assert [(tmp_path / "salida" / n).exists() for n in SALIDA_DE_ARCHIVOS] == [False, False]
    assert config.read_bytes() == antes


def test_fijar_se_niega_con_adapters_falsos_sobre_la_configuracion_versionada(
    tmp_path: Path,
) -> None:
    antes = CONFIG.read_bytes()

    codigo = barrer_con(tmp_path, CONFIG, "--fijar")

    assert codigo == 2
    assert CONFIG.read_bytes() == antes


def test_fijar_se_niega_cuando_la_ruta_esta_fuera_del_directorio_permitido(
    tmp_path: Path,
) -> None:
    config = config_de_barrido(tmp_path)
    antes = config.read_bytes()

    with pytest.raises(ConfigInvalida):
        fijar_umbral_en_config(config, 0.4, directorio=tmp_path / "otro")

    assert config.read_bytes() == antes


def test_fijar_se_niega_cuando_la_ruta_es_un_enlace_simbolico(tmp_path: Path) -> None:
    real = config_de_barrido(tmp_path)
    enlace = tmp_path / "enlace.yaml"
    enlace.symlink_to(real)
    antes = real.read_bytes()

    with pytest.raises(ConfigInvalida):
        fijar_umbral_en_config(enlace, 0.4, directorio=tmp_path)

    assert real.read_bytes() == antes


def test_fijar_escribe_de_forma_atomica_sin_dejar_temporales(tmp_path: Path) -> None:
    config = config_de_barrido(tmp_path)

    fijar_umbral_en_config(config, 0.45, directorio=tmp_path)

    assert sorted(p.name for p in tmp_path.iterdir()) == ["config.yaml"]
    assert (
        yaml.safe_load(config.read_text(encoding="utf-8"))["umbrales"]["relevance_threshold"]
        == 0.45
    )


def reporte_versionado() -> dict[str, object]:
    return json.loads(
        (RAIZ_APP / "eval" / "reports" / "S1-baseline.json").read_text(encoding="utf-8")
    )


def test_esquema_exige_un_nombre_de_dataset_identificador() -> None:
    reporte = reporte_versionado()
    validar_esquema_cerrado(reporte, ESQUEMA_BASELINE)

    with pytest.raises(ReporteFueraDeEsquema):
        validar_esquema_cerrado(
            {**reporte, "dataset": "texto libre con espacios"}, ESQUEMA_BASELINE
        )


@pytest.mark.parametrize("huella", ["abc", "Z" * 64, "A" * 64])
def test_esquema_exige_una_huella_sha256_en_minusculas(huella: str) -> None:
    with pytest.raises(ReporteFueraDeEsquema):
        validar_esquema_cerrado({**reporte_versionado(), "hashConfig": huella}, ESQUEMA_BASELINE)


def test_informe_aclara_que_la_fila_elegida_no_significa_nada_con_adapters_falsos() -> None:
    assert "valores de la fila elegida (sin significado con adapters falsos)" in INFORME.read_text(
        encoding="utf-8"
    )


def test_procedimiento_del_p95_va_por_la_bff_desde_el_host_y_no_desde_un_contenedor() -> None:
    informe = INFORME.read_text(encoding="utf-8")

    assert (
        "python -m app.scripts.adr39 e2e --bff --base-url https://localhost --origin https://localhost"
        in informe
    )
    assert "nunca desde un contenedor de clinical-net/ai-net ni desde rag-orchestrator" in informe
    assert "en la red interna" not in informe


def test_supera_umbral_excluye_el_puntaje_igual_al_umbral_igual_que_filtrar_sobre_umbral() -> None:
    chunks = [ChunkPuntuado(f"c{i}", "d", "t", p) for i, p in enumerate((0.29, 0.30, 0.31))]

    sobre = filtrar_sobre_umbral(chunks, 0.30)

    assert [supera_umbral(c.relevance_score, 0.30) for c in chunks] == [False, False, True]
    assert [c.chunk_id for c in sobre] == ["c2"]
