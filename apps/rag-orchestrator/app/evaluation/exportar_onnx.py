"""Exportación de un candidato a ONNX (fp32) y cuantización dinámica int8 para la medición de ADR-39.

    python -m app.evaluation.exportar_onnx --spec '<json de ModeloSpec>' --destino DIR

Corre en su propio proceso porque importa ``torch`` y ``transformers``: el proceso que MIDE la memoria
solo carga ONNX Runtime y ``tokenizers``, para que el RSS sea el de la inferencia y no el de la exportación.
Los pesos se descargan a ``HF_HOME`` (volumen, ``MODEL_CACHE_DIR``); nunca al repo.
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

SONDAS = ["Instruct: ejemplo\nQuery: ¿Qué dice la evidencia? The HR was 0.67 (95% CI 0.48–0.93).", "x"]
SONDAS_PAR = ("¿Qué dice la evidencia?", "The hazard ratio was 0.67 (95% CI 0.48–0.93).")


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
            oculto = self.m.model(input_ids=input_ids, attention_mask=attention_mask).last_hidden_state
            ultimo = oculto[torch.arange(oculto.shape[0]), attention_mask.sum(1) - 1]
            assert ids_si_no is not None
            return ultimo @ self.m.lm_head.weight[list(ids_si_no)].T  # logits de "no" y "yes" nada más

    return Envoltorio().eval()


def _cargar(spec: ModeloSpec) -> Any:
    import torch
    from transformers import AutoModel, AutoModelForCausalLM, AutoModelForSequenceClassification

    comunes: dict[str, Any] = {"revision": spec.revision, "dtype": torch.float32, "trust_remote_code": spec.codigo_remoto}
    if spec.atencion != "sdpa":
        comunes["attn_implementation"] = spec.atencion
    if spec.tarea == "embedding":
        return AutoModel.from_pretrained(spec.modelo, **comunes).eval()
    if spec.tarea == "reranker_causal":
        return AutoModelForCausalLM.from_pretrained(spec.modelo, **comunes).eval()
    return AutoModelForSequenceClassification.from_pretrained(spec.modelo, **comunes).eval()


def _salida_de_referencia(envoltorio: Any, tok: Any, spec: ModeloSpec) -> tuple[dict[str, Any], Any]:
    import torch

    if spec.tarea in ("reranker_cls", "nli", "reranker_causal"):
        lote = tok([SONDAS_PAR[0], "x"], [SONDAS_PAR[1], "y"], padding=True, return_tensors="pt") if spec.tarea != "reranker_causal" else tok(SONDAS, padding=True, return_tensors="pt")
    else:
        lote = tok(SONDAS, padding=True, return_tensors="pt")
    with torch.no_grad():
        ref = envoltorio(lote["input_ids"], lote["attention_mask"]).numpy()
    return lote, ref


def _verificar_onnx(ruta: Path, lote: Any, ref: Any, spec: ModeloSpec) -> float:
    import numpy as np
    import onnxruntime as ort

    sesion = ort.InferenceSession(str(ruta), providers=["CPUExecutionProvider"])
    obtenido = sesion.run(None, {"input_ids": lote["input_ids"].numpy(), "attention_mask": lote["attention_mask"].numpy()})[0]
    if spec.tarea == "embedding":
        mascara = lote["attention_mask"].numpy().astype(bool)
        return max(float(np.abs(ref[i][mascara[i]] - obtenido[i][mascara[i]]).max()) for i in range(len(ref)))
    return float(np.abs(ref - obtenido).max())


def exportar(spec: ModeloSpec, destino: Path) -> dict[str, Any]:
    """Exporta fp32 con el exportador basado en ``torch.export`` y cuantiza int8; devuelve el registro de exportación."""
    import onnxruntime
    import torch
    import transformers
    from huggingface_hub import hf_hub_download
    from onnxruntime.quantization import QuantType, quantize_dynamic
    from tokenizers import Tokenizer
    from transformers import AutoTokenizer

    registro_previo = destino / "export.json"
    if registro_previo.exists():
        return json.loads(registro_previo.read_text(encoding="utf-8"))
    destino.mkdir(parents=True, exist_ok=True)
    inicio = time.monotonic()

    tok = AutoTokenizer.from_pretrained(spec.modelo, revision=spec.revision, trust_remote_code=spec.codigo_remoto)
    shutil.copy(hf_hub_download(spec.modelo, "tokenizer.json", revision=spec.revision), destino / "tokenizer.json")
    shutil.copy(hf_hub_download(spec.modelo, "config.json", revision=spec.revision), destino / "config.json")
    rapido = Tokenizer.from_file(str(destino / "tokenizer.json"))
    sonda_tokens_igual = all(tok(s)["input_ids"] == rapido.encode(s).ids for s in SONDAS) and (
        tok(*SONDAS_PAR)["input_ids"] == rapido.encode(*SONDAS_PAR).ids
    )
    if not sonda_tokens_igual:
        raise RuntimeError(f"{spec.modelo}: el tokenizador rápido difiere del de transformers")

    ids_si_no = (tok.convert_tokens_to_ids("no"), tok.convert_tokens_to_ids("yes")) if spec.tarea == "reranker_causal" else None
    modelo = _cargar(spec)
    envoltorio = _envolver(modelo, spec, ids_si_no)
    lote, referencia = _salida_de_referencia(envoltorio, tok, spec)

    dim_lote, dim_secuencia = torch.export.Dim("b"), torch.export.Dim("s")
    forma = {0: dim_lote, 1: dim_secuencia}
    (destino / "fp32").mkdir(exist_ok=True)
    ruta_fp32 = destino / "fp32" / "model.onnx"
    with torch.no_grad():
        torch.onnx.export(
            envoltorio,
            (lote["input_ids"], lote["attention_mask"]),
            str(ruta_fp32),
            input_names=["input_ids", "attention_mask"],
            output_names=["salida"],
            dynamic_shapes={"input_ids": forma, "attention_mask": forma},
            dynamo=True,
        )
    diferencia_fp32 = _verificar_onnx(ruta_fp32, lote, referencia, spec)

    if spec.sparse:
        pesos = torch.load(hf_hub_download(spec.modelo, spec.sparse, revision=spec.revision), map_location="cpu", weights_only=True)
        import numpy as np

        np.savez(destino / "sparse_linear.npz", **{k: v.numpy() for k, v in pesos.items()})

    (destino / "int8").mkdir(exist_ok=True)
    ruta_int8 = destino / "int8" / "model.onnx"
    quantize_dynamic(str(ruta_fp32), str(ruta_int8), weight_type=QuantType.QInt8, use_external_data_format=True)
    diferencia_int8 = _verificar_onnx(ruta_int8, lote, referencia, spec)

    tamanos = {
        variante: sum(f.stat().st_size for f in (destino / variante).iterdir()) for variante in ("fp32", "int8")
    }
    registro = {
        "modelo": spec.modelo,
        "revision": spec.revision,
        "tarea": spec.tarea,
        "ids_si_no": list(ids_si_no) if ids_si_no else None,
        "tamano_bytes": tamanos,
        "diferencia_max_fp32_vs_torch": diferencia_fp32,
        "diferencia_max_int8_vs_torch": diferencia_int8,
        "tokenizador_rapido_igual": sonda_tokens_igual,
        "segundos": round(time.monotonic() - inicio, 1),
        "versiones": {
            "torch": torch.__version__,
            "transformers": transformers.__version__,
            "onnxruntime": onnxruntime.__version__,
        },
    }
    registro_previo.write_text(json.dumps(registro, indent=2), encoding="utf-8")
    return registro


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--spec", required=True, help="ModeloSpec en JSON")
    parser.add_argument("--destino", required=True, type=Path)
    args = parser.parse_args(argv)
    spec = ModeloSpec(**json.loads(args.spec))
    registro = exportar(spec, args.destino)
    print(json.dumps({k: registro[k] for k in ("modelo", "tamano_bytes", "diferencia_max_fp32_vs_torch", "diferencia_max_int8_vs_torch", "segundos")}))
    return 0


def spec_a_json(spec: ModeloSpec) -> str:
    return json.dumps(dataclasses.asdict(spec))


if __name__ == "__main__":
    raise SystemExit(main())
