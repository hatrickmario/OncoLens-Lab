"""Exporta a ONNX los tres modelos de recuperación y verificación de ADR-39 (fase A) a una carpeta FUERA del repo.

    python scripts/demo/exportar-modelos.py [DESTINO]      # por defecto ~/adr39-modelos

Se ejecuta con un entorno que tenga `apps/rag-orchestrator/requirements-eval.txt` (torch, transformers, onnx, onnxruntime):
    python3 -m venv ~/.venvs/oncolens-export && ~/.venvs/oncolens-export/bin/pip install -r apps/rag-orchestrator/requirements-eval.txt

Resultado en DESTINO: embeddings/ (BGE-M3 int8 + sparse_linear.npz), reranker/ (bge-reranker-v2-m3 int8) y nli/ (mDeBERTa fp32),
cada uno con `model.onnx` en UN solo archivo y `tokenizer.json`, más `modelos.env` con las rutas del contenedor y el SHA-256
de cada archivo (RN-14: los pesos no se versionan). Reutiliza el exportador de la medición (`app.evaluation.exportar_onnx`)
y las revisiones fijadas del ADR-39. Idempotente: salta lo ya exportado. Tarda ~10 min la primera vez (descarga ~7 GB).
"""

from __future__ import annotations

import hashlib
import os
import shutil
import subprocess
import sys
from pathlib import Path

RAIZ = Path(__file__).resolve().parents[2]
APP = RAIZ / "apps" / "rag-orchestrator"
sys.path.insert(0, str(APP))

import onnx  # noqa: E402
import yaml  # noqa: E402

from app.evaluation.config_medicion import ModeloSpec  # noqa: E402
from app.evaluation.exportar_onnx import spec_a_json  # noqa: E402

# componente -> (prefijo de variables, cuantización que se usa en producción)
COMPONENTES = {
    "embeddings": ("EMBEDDING", "int8"),
    "reranker": ("RERANKER", "int8"),
    "nli": ("NLI", "fp32"),
}


def exportar(destino: Path) -> None:
    config = yaml.safe_load((APP / "eval/configs/adr39-fase-a.yaml").read_text(encoding="utf-8"))
    campos = set(ModeloSpec.__dataclass_fields__)
    entorno = {**os.environ, "HF_HOME": str(destino / "hf")}
    for componente, (_, cuantizacion) in COMPONENTES.items():
        candidato = dict(next(c for c in config[componente] if c["id"] == "A"))
        candidato.pop("id")
        spec = ModeloSpec(id="A", componente=componente, **{k: v for k, v in candidato.items() if k in campos})
        trabajo = destino / "trabajo" / componente
        for fase, marca in (("fp32", "export-fp32.json"), ("int8", "export.json")):
            if fase == "int8" and cuantizacion == "fp32":
                continue
            if (trabajo / marca).exists():
                continue
            print(f"== {componente} {fase}", flush=True)
            subprocess.run(
                [sys.executable, "-m", "app.evaluation.exportar_onnx", "--spec", spec_a_json(spec), "--destino", str(trabajo), "--fase", fase],
                check=True, cwd=APP, env={**entorno, "PYTHONPATH": str(APP)},
            )


def copiar(origen: Path, destino: Path) -> None:
    """Copia sin heredar el modo de solo lectura de la caché de Hugging Face (permite repetir el ensamblado)."""
    destino.unlink(missing_ok=True)
    shutil.copyfile(origen, destino)
    destino.chmod(0o644)


def ensamblar(destino: Path) -> None:
    lineas: list[str] = []
    for componente, (prefijo, cuantizacion) in COMPONENTES.items():
        carpeta = destino / componente
        carpeta.mkdir(exist_ok=True)
        modelo = onnx.load(str(destino / "trabajo" / componente / cuantizacion / "model.onnx"), load_external_data=True)
        # El cargador del servicio solo admite datos externos para el NLI y el ONNX se reexporta en un solo archivo.
        onnx.save_model(modelo, str(carpeta / "model.onnx"), save_as_external_data=False)
        copiar(destino / "trabajo" / componente / "tokenizer.json", carpeta / "tokenizer.json")
        if componente == "embeddings":
            copiar(destino / "trabajo" / componente / "sparse_linear.npz", carpeta / "sparse_linear.npz")
        for archivo, variable in (("model.onnx", "MODEL"), ("tokenizer.json", "TOKENIZER")):
            sha = hashlib.sha256((carpeta / archivo).read_bytes()).hexdigest()
            lineas += [f"{prefijo}_{variable}_PATH=/models/{componente}/{archivo}", f"{prefijo}_{variable}_SHA256={sha}"]
        print(f"{componente}: {cuantizacion}, {(carpeta / 'model.onnx').stat().st_size / 1e6:.0f} MB")
    ruta = destino / "modelos.env"
    ruta.write_text("\n".join(lineas) + "\n", encoding="utf-8")
    ruta.chmod(0o600)


def main() -> int:
    destino = Path(sys.argv[1] if len(sys.argv) > 1 else "~/adr39-modelos").expanduser()
    destino.mkdir(parents=True, exist_ok=True)
    exportar(destino)
    ensamblar(destino)
    print(f"Listo: MODEL_HOST_DIR={destino} (los intermedios `trabajo/` y `hf/` se pueden borrar)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
