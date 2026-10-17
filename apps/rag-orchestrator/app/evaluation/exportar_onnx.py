"""Exportación de un candidato a ONNX (fp32) y cuantización dinámica int8 para la medición de ADR-39.

    python -m app.evaluation.exportar_onnx --spec '<json de ModeloSpec>' --destino DIR [--fase fp32|int8]

Cada fase corre en su propio proceso: ``fp32`` importa ``torch`` y ``transformers`` (exporta con el exportador
basado en ``torch.export``); ``int8`` solo usa ONNX Runtime y ``tokenizers`` (cuantiza y compara con fp32), así
el pico de memoria de la cuantización no arrastra el modelo de PyTorch. El proceso que MIDE la memoria solo
carga ONNX Runtime y ``tokenizers``. Los pesos se descargan a ``HF_HOME`` (volumen, ``MODEL_CACHE_DIR``); nunca al repo.
"""

from __future__ import annotations

import argparse
import dataclasses
import json
import shutil
import time
from pathlib import Path
from typing import Any

from app.evaluation.config_medicion import ModeloSpec

SONDAS = [
    "Instruct: ejemplo\nQuery: ¿Qué dice la evidencia? The HR was 0.67 (95% CI 0.48–0.93).",
    "x",
]
SONDAS_PAR = ("¿Qué dice la evidencia?", "The hazard ratio was 0.67 (95% CI 0.48–0.93).")
PARCIAL_FP32 = "export-fp32.json"
REGISTRO = "export.json"


def _envolver(modelo: Any, spec: ModeloSpec, ids_si_no: tuple[int, int] | None) -> Any:
    import torch

    class Envoltorio(torch.nn.Module):
        def __init__(self) -> None:
            super().__init__()
            self.m = modelo

        def forward(self, input_ids: Any, attention_mask: Any) -> Any:
            if spec.tarea == "embedding":
                return self.m(input_ids=input_ids, attention_mask=attention_mask).last_hidden_state
            if spec.tarea in ("reranker_cls", "nli"):
                return self.m(input_ids=input_ids, attention_mask=attention_mask).logits
            oculto = self.m.model(
                input_ids=input_ids, attention_mask=attention_mask
            ).last_hidden_state
            ultimo = oculto[torch.arange(oculto.shape[0]), attention_mask.sum(1) - 1]
            assert ids_si_no is not None
            return (
                ultimo @ self.m.lm_head.weight[list(ids_si_no)].T
            )  # solo los logits de "no" y "yes"

    return Envoltorio().eval()


def _cargar(spec: ModeloSpec) -> Any:
    import torch
    from transformers import AutoModel, AutoModelForCausalLM, AutoModelForSequenceClassification

    comunes: dict[str, Any] = {
        "revision": spec.revision,
        "dtype": torch.float32,
        "trust_remote_code": spec.codigo_remoto,
    }
    if spec.atencion != "sdpa":
        comunes["attn_implementation"] = spec.atencion
    if spec.codigo_remoto:
        comunes["code_revision"] = (
            spec.code_revision
        )  # el código remoto se ejecuta: solo el commit fijado
    if spec.tarea == "embedding":
        return AutoModel.from_pretrained(spec.modelo, **comunes).eval()
    if spec.tarea == "reranker_causal":
        return AutoModelForCausalLM.from_pretrained(spec.modelo, **comunes).eval()
    return AutoModelForSequenceClassification.from_pretrained(spec.modelo, **comunes).eval()


def _lote_de_sondas(tok: Any, spec: ModeloSpec) -> Any:
    if spec.tarea in ("reranker_cls", "nli"):
        return tok([SONDAS_PAR[0], "x"], [SONDAS_PAR[1], "y"], padding=True, return_tensors="pt")
    return tok(SONDAS, padding=True, return_tensors="pt")


def _diferencia_max(ref: Any, obtenido: Any, mascara: Any, spec: ModeloSpec) -> float:
    import numpy as np

    if spec.tarea == "embedding":
        valida = mascara.astype(bool)
        return max(
            float(np.abs(ref[i][valida[i]] - obtenido[i][valida[i]]).max()) for i in range(len(ref))
        )
    return float(np.abs(ref - obtenido).max())


def exportar_fp32(spec: ModeloSpec, destino: Path) -> dict[str, Any]:
    """Descarga el modelo, exporta ONNX fp32 y lo compara con PyTorch sobre sondas (diferencia máxima)."""
    import numpy as np
    import onnxruntime
    import torch
    import transformers
    from huggingface_hub import hf_hub_download
    from tokenizers import Tokenizer
    from transformers import AutoTokenizer

    destino.mkdir(parents=True, exist_ok=True)
    inicio = time.monotonic()
    tok = AutoTokenizer.from_pretrained(
        spec.modelo,
        revision=spec.revision,
        trust_remote_code=spec.codigo_remoto,
        **({"code_revision": spec.code_revision} if spec.codigo_remoto else {}),
    )
    shutil.copy(
        hf_hub_download(spec.modelo, "tokenizer.json", revision=spec.revision),
        destino / "tokenizer.json",
    )
    shutil.copy(
        hf_hub_download(spec.modelo, "config.json", revision=spec.revision), destino / "config.json"
    )
    rapido = Tokenizer.from_file(str(destino / "tokenizer.json"))
    rapido.no_padding()  # algunos tokenizer.json (gte) traen relleno fijo a la longitud máxima
    rapido.no_truncation()
    tokenizador_igual = all(tok(s)["input_ids"] == rapido.encode(s).ids for s in SONDAS) and (
        tok(*SONDAS_PAR)["input_ids"] == rapido.encode(*SONDAS_PAR).ids
    )
    if not tokenizador_igual:
        raise RuntimeError(f"{spec.modelo}: el tokenizador rápido difiere del de transformers")

    ids_si_no = (
        (tok.convert_tokens_to_ids("no"), tok.convert_tokens_to_ids("yes"))
        if spec.tarea == "reranker_causal"
        else None
    )
    envoltorio = _envolver(_cargar(spec), spec, ids_si_no)
    lote = _lote_de_sondas(tok, spec)
    with torch.no_grad():
        referencia = envoltorio(lote["input_ids"], lote["attention_mask"]).numpy()
    forma = {0: torch.export.Dim("b"), 1: torch.export.Dim("s")}
    (destino / "fp32").mkdir(exist_ok=True)
    ruta = destino / "fp32" / "model.onnx"
    with torch.no_grad():
        torch.onnx.export(
            envoltorio,
            (lote["input_ids"], lote["attention_mask"]),
            str(ruta),
            input_names=["input_ids", "attention_mask"],
            output_names=["salida"],
            dynamic_shapes={"input_ids": forma, "attention_mask": forma},
            dynamo=True,
        )
    sesion = onnxruntime.InferenceSession(str(ruta), providers=["CPUExecutionProvider"])
    obtenido = sesion.run(
        None,
        {"input_ids": lote["input_ids"].numpy(), "attention_mask": lote["attention_mask"].numpy()},
    )[0]
    diferencia = _diferencia_max(
        referencia, np.asarray(obtenido), lote["attention_mask"].numpy(), spec
    )

    if spec.sparse:
        pesos = torch.load(
            hf_hub_download(spec.modelo, spec.sparse, revision=spec.revision),
            map_location="cpu",
            weights_only=True,
        )
        np.savez(destino / "sparse_linear.npz", **{k: v.numpy() for k, v in pesos.items()})
    parcial = {
        "ids_si_no": list(ids_si_no) if ids_si_no else None,
        "diferencia_max_fp32_vs_torch": diferencia,
        "tokenizador_rapido_igual": tokenizador_igual,
        "segundos_fp32": round(time.monotonic() - inicio, 1),
        "versiones": {
            "torch": torch.__version__,
            "transformers": transformers.__version__,
            "onnxruntime": onnxruntime.__version__,
        },
    }
    (destino / PARCIAL_FP32).write_text(json.dumps(parcial, indent=2), encoding="utf-8")
    return parcial


def _quitar_formas_inferidas(ruta: Path) -> None:
    """Borra ``value_info`` (formas intermedias del exportador): en algunos clasificadores contradice la inferencia de onnx.

    Solo reescribe el grafo; los pesos siguen en su archivo de datos externo, sin cargarlos.
    """
    import onnx

    modelo = onnx.load(str(ruta), load_external_data=False)
    del modelo.graph.value_info[:]
    onnx.save(modelo, str(ruta))


def cuantizar_int8(spec: ModeloSpec, destino: Path) -> dict[str, Any]:
    """Cuantización dinámica int8 de los pesos de MatMul con ONNX Runtime; compara con fp32 y deja ``export.json``."""
    import numpy as np
    import onnxruntime
    from onnxruntime.quantization import QuantType, quantize_dynamic
    from tokenizers import Tokenizer

    inicio = time.monotonic()
    ruta_fp32 = destino / "fp32" / "model.onnx"
    (destino / "int8").mkdir(exist_ok=True)
    ruta_int8 = destino / "int8" / "model.onnx"
    # Solo MatMul: con todos los operadores (Gather incluido) el cuantizador de ONNX Runtime 1.31 supera 7 GB de RAM en BGE-M3.
    opciones: dict[str, Any] = {
        "weight_type": QuantType.QInt8,
        "use_external_data_format": True,
        "op_types_to_quantize": ["MatMul"],
    }
    _quitar_formas_inferidas(ruta_fp32)
    quantize_dynamic(str(ruta_fp32), str(ruta_int8), **opciones)

    tokenizador = Tokenizer.from_file(str(destino / "tokenizer.json"))
    if spec.tarea in ("reranker_cls", "nli"):
        secuencias = [
            tokenizador.encode(SONDAS_PAR[0], SONDAS_PAR[1]).ids,
            tokenizador.encode("x", "y").ids,
        ]
    else:
        secuencias = [tokenizador.encode(s).ids for s in SONDAS]
    largo = max(len(s) for s in secuencias)
    ids = np.zeros((len(secuencias), largo), dtype=np.int64)
    mascara = np.zeros_like(ids)
    for i, s in enumerate(secuencias):
        ids[i, : len(s)] = s
        mascara[i, : len(s)] = 1
    entradas = {"input_ids": ids, "attention_mask": mascara}
    salidas = [
        np.asarray(
            onnxruntime.InferenceSession(str(r), providers=["CPUExecutionProvider"]).run(
                None, entradas
            )[0]
        )
        for r in (ruta_fp32, ruta_int8)
    ]
    diferencia = _diferencia_max(salidas[0], salidas[1], mascara, spec)

    parcial = json.loads((destino / PARCIAL_FP32).read_text(encoding="utf-8"))
    tamanos = {v: sum(f.stat().st_size for f in (destino / v).iterdir()) for v in ("fp32", "int8")}
    registro = {
        **parcial,
        "modelo": spec.modelo,
        "revision": spec.revision,
        "tarea": spec.tarea,
        "tamano_bytes": tamanos,
        "diferencia_max_int8_vs_fp32": diferencia,
        "segundos_int8": round(time.monotonic() - inicio, 1),
    }
    (destino / REGISTRO).write_text(json.dumps(registro, indent=2), encoding="utf-8")
    return registro


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--spec", required=True, help="ModeloSpec en JSON")
    parser.add_argument("--destino", required=True, type=Path)
    parser.add_argument("--fase", choices=["fp32", "int8"], required=True)
    args = parser.parse_args(argv)
    spec = ModeloSpec(**json.loads(args.spec))
    resultado = (
        exportar_fp32(spec, args.destino)
        if args.fase == "fp32"
        else cuantizar_int8(spec, args.destino)
    )
    print(json.dumps({k: v for k, v in resultado.items() if k != "versiones"}))
    return 0


def spec_a_json(spec: ModeloSpec) -> str:
    return json.dumps(dataclasses.asdict(spec))


if __name__ == "__main__":
    raise SystemExit(main())
