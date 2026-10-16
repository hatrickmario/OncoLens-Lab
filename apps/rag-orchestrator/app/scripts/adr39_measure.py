"""Medición de ADR-39 (US-012): fase A (modelos), T2–T5 (chunking e índice) y chequeo de configuración.

    python -m app.scripts.adr39_measure --config eval/configs/adr39-fase-a.yaml
    python -m app.scripts.adr39_measure --config eval/configs/adr39-fase-a2.yaml --stage t2|t3|t4|t5
    python -m app.scripts.adr39_measure --check-config

Orquesta: validar dataset → descargar fuentes y verificar citas → exportar candidatos a ONNX → medir cada
candidato en un proceso nuevo por corrida → seleccionar → reporte JSON con agregados (sin textos).
Códigos de salida: 0 ok · 1 cita ausente · 2 dataset inválido · 3 fuente no descargable ·
4 algún componente sin candidato (escalar al usuario, G-5 / NFR-01) · 5 configuración distinta del ADR.
"""

from __future__ import annotations

import argparse
import dataclasses
import json
import os
import platform
import subprocess
import sys
import time
from collections.abc import Callable, Sequence
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import httpx

from app.evaluation import fase_a
from app.evaluation.chunking_variants import Seccion
from app.evaluation.config_medicion import ConfigMedicion, ModeloSpec, cargar_config
from app.evaluation.dataset_loader import Dataset, DatasetInvalido, cargar_dataset
from app.evaluation.model_selection import Medicion, Seleccion
from app.evaluation.reporte import escribir_reporte
from app.evaluation.trabajos import Fabrica, FabricaOnnx, Trabajo, ejecutar_trabajo
from app.scripts.adr39_fetch_sources import (
    FuenteNoDescargable,
    descargar_fuentes,
    leer_fuentes_de_cache,
    verificar_citas,
)

SALIDA_OK, SALIDA_CITA, SALIDA_DATASET, SALIDA_FUENTE, SALIDA_SIN_CANDIDATO, SALIDA_CONFIG = 0, 1, 2, 3, 4, 5
HF_API = "https://huggingface.co/api/models/{modelo}/revision/{revision}"

Ejecutor = Callable[[Trabajo], None]
Exportador = Callable[[ModeloSpec, Path], None]


def raiz_repo() -> Path:
    return Path(__file__).resolve().parents[4]


def verificar_en_fuente(spec: ModeloSpec, cliente: httpx.Client) -> dict[str, Any]:
    """Revisión exacta, licencia y tamaño de los pesos leídos en el repositorio de Hugging Face (no de memoria)."""
    respuesta = cliente.get(HF_API.format(modelo=spec.modelo, revision=spec.revision), timeout=30.0, params={"blobs": "true"})
    respuesta.raise_for_status()
    datos = respuesta.json()
    etiquetas = [t.split(":", 1)[1] for t in datos.get("tags", []) if t.startswith("license:")]
    pesos = [s for s in datos.get("siblings", []) if s["rfilename"].endswith((".safetensors", ".bin"))]
    return {
        "modelo": spec.modelo,
        "revision_pedida": spec.revision,
        "revision_en_fuente": datos.get("sha"),
        "revision_coincide": datos.get("sha") == spec.revision,
        "licencia": (datos.get("cardData") or {}).get("license") or (etiquetas[0] if etiquetas else "desconocida"),
        "bytes_pesos_originales": sum(s.get("size") or 0 for s in pesos if s["rfilename"].endswith(".safetensors"))
        or sum(s.get("size") or 0 for s in pesos),
        "gated": bool(datos.get("gated")),
        "ultima_modificacion": datos.get("lastModified"),
    }


def exportar_en_subproceso(spec: ModeloSpec, destino: Path) -> None:
    entorno = dict(os.environ)
    if spec.export_pythonpath:
        entorno["PYTHONPATH"] = os.pathsep.join(filter(None, [spec.export_pythonpath, entorno.get("PYTHONPATH", "")]))
    from app.evaluation.exportar_onnx import spec_a_json

    for fase, marca in (("fp32", "export-fp32.json"), ("int8", "export.json")):  # cada fase en su proceso
        if (destino / marca).exists():
            continue
        entorno_fase = entorno if fase == "fp32" else {k: v for k, v in entorno.items() if k != "PYTHONPATH"}
        subprocess.run(
            [sys.executable, "-m", "app.evaluation.exportar_onnx", "--spec", spec_a_json(spec), "--destino", str(destino), "--fase", fase],
            check=True,
            env=entorno_fase,
        )


def lanzar_en_subproceso(trabajo: Trabajo, ruta_config: Path, cache_datos: Path) -> None:
    carga = json.dumps(
        {
            "spec": dataclasses.asdict(trabajo.spec),
            "cuantizacion": trabajo.cuantizacion,
            "corrida": trabajo.corrida,
            "calidad": trabajo.calidad,
            "directorio_onnx": str(trabajo.directorio_onnx),
            "directorio_corridas": str(trabajo.directorio_corridas),
            "salida": str(trabajo.salida),
            "candidatos_dir": str(trabajo.candidatos_dir) if trabajo.candidatos_dir else None,
        }
    )
    subprocess.run(
        [sys.executable, "-m", "app.scripts.adr39_measure", "--trabajador", carga, "--config", str(ruta_config), "--cache-datos", str(cache_datos)],
        check=True,
    )


def lanzar_a3_en_subproceso(cache_datos: Path) -> Callable[[Any, Path], None]:
    """Cada corrida de la medición del reranker en un proceso nuevo (RSS limpio)."""
    from app.evaluation.fase_a3 import TrabajoFallido, trabajo_a_json

    def lanzar(trabajo: Any, ruta_config: Path) -> None:
        try:
            subprocess.run(
                [sys.executable, "-m", "app.scripts.adr39_measure", "--trabajador-a3", json.dumps(trabajo_a_json(trabajo)), "--config", str(ruta_config), "--cache-datos", str(cache_datos)],
                check=True,
            )
        except subprocess.CalledProcessError as exc:
            raise TrabajoFallido(f"el proceso de medición terminó con código {exc.returncode} (-9 = SIGKILL por memoria de la VM)") from exc

    return lanzar


def _trabajo_desde_json(carga: dict[str, Any]) -> Trabajo:
    return Trabajo(
        spec=ModeloSpec(**carga["spec"]),
        cuantizacion=carga["cuantizacion"],
        corrida=carga["corrida"],
        calidad=carga["calidad"],
        directorio_onnx=Path(carga["directorio_onnx"]),
        directorio_corridas=Path(carga["directorio_corridas"]),
        salida=Path(carga["salida"]),
        candidatos_dir=Path(carga["candidatos_dir"]) if carga["candidatos_dir"] else None,
    )


def _secciones_por_documento(dataset: Dataset, cache_datos: Path) -> dict[str, Sequence[Seccion]]:
    return {i: f.secciones for i, f in leer_fuentes_de_cache(dataset, cache_datos).items()}


def trabajar(carga: dict[str, Any], ruta_config: Path, cache_datos: Path, fabrica: Fabrica | None = None) -> int:
    """Modo trabajador: mide un candidato en este proceso."""
    config = cargar_config(ruta_config)
    dataset = cargar_dataset(raiz_repo() / config.dataset)
    trabajo = _trabajo_desde_json(carga)
    ejecutar_trabajo(trabajo, config, dataset, _secciones_por_documento(dataset, cache_datos), fabrica or FabricaOnnx(), time.perf_counter)
    return SALIDA_OK


class MedicionFaseA:
    """Orquesta la fase A con puertos inyectables (ejecutor de trabajos, exportador, cliente HTTP, reloj)."""

    def __init__(
        self,
        config: ConfigMedicion,
        dataset: Dataset,
        dir_modelos: Path,
        cache_datos: Path,
        ejecutor: Ejecutor,
        exportador: Exportador,
        cliente: httpx.Client | None,
    ) -> None:
        self.config = config
        self.dataset = dataset
        self.dir_modelos = dir_modelos
        self.dir_corridas = cache_datos / "adr39" / "corridas"
        self.ejecutor = ejecutor
        self.exportador = exportador
        self.cliente = cliente

    def directorio_onnx(self, spec: ModeloSpec) -> Path:
        return self.dir_modelos / "onnx" / spec.directorio

    def _corridas(self, spec: ModeloSpec, cuantizacion: str, candidatos_dir: Path | None) -> list[dict[str, Any]]:
        resultados = []
        for corrida in range(1, self.config.corridas + 1):
            salida = self.dir_corridas / f"{spec.clave}-{cuantizacion}-corrida{corrida}.json"
            if not salida.exists():
                self.ejecutor(
                    Trabajo(spec, cuantizacion, corrida, corrida == 1, self.directorio_onnx(spec), self.dir_corridas, salida, candidatos_dir)
                )
            resultados.append(json.loads(salida.read_text(encoding="utf-8")))
        return resultados

    def medir_componente(
        self, componente: str, candidatos_dir: Path | None = None
    ) -> tuple[dict[str, Any], Seleccion, list[Medicion]]:
        detalle: dict[str, dict[str, Any]] = {}
        mediciones: list[Medicion] = []
        for spec in self.config.candidatos[componente]:
            fuente = verificar_en_fuente(spec, self.cliente) if self.cliente else {"licencia": "desconocida"}
            self.exportador(spec, self.directorio_onnx(spec))
            registro = json.loads((self.directorio_onnx(spec) / "export.json").read_text(encoding="utf-8"))
            for cuantizacion in self.config.cuantizaciones:
                agregado = fase_a.agregar_corridas(self._corridas(spec, cuantizacion, candidatos_dir))
                medicion = fase_a.a_medicion(spec, cuantizacion, agregado, str(fuente["licencia"]))
                mediciones.append(medicion)
                detalle[medicion.candidato] = {
                    **agregado,
                    "modelo": spec.modelo,
                    "revision": spec.revision,
                    "fuente": fuente,
                    "exportacion": registro,
                    "tamano_cuantizado_bytes": registro["tamano_bytes"][cuantizacion],
                }
        bloque, seleccion = fase_a.reporte_de_componente(componente, detalle, mediciones, self.config)
        return bloque, seleccion, mediciones

    def candidatos_del_elegido(self, spec_embeddings: ModeloSpec, cuantizacion: str) -> Path:
        return self.dir_corridas / f"{spec_embeddings.clave}-{cuantizacion}-candidatos"


def _entorno() -> dict[str, Any]:
    return {
        "plataforma": platform.platform(),
        "maquina": platform.machine(),
        "python": platform.python_version(),
        "cpus": os.cpu_count(),
        "hilos_onnx": os.environ.get("OMP_NUM_THREADS"),
    }


def ejecutar_fase_a(
    ruta_config: Path,
    dir_modelos: Path,
    cache_datos: Path,
    salida_reporte: Path | None,
    ejecutor: Ejecutor,
    exportador: Exportador,
    cliente: httpx.Client | None,
    ahora: Callable[[], datetime],
) -> int:
    config = cargar_config(ruta_config)
    try:
        dataset = cargar_dataset(raiz_repo() / config.dataset)
    except DatasetInvalido as exc:
        print(f"dataset inválido, no se mide nada: {exc}", file=sys.stderr)
        return SALIDA_DATASET
    try:
        fuentes = descargar_fuentes(dataset, cache_datos, cliente or httpx.Client(), ahora)
    except FuenteNoDescargable as exc:
        print(str(exc), file=sys.stderr)
        return SALIDA_FUENTE
    ausentes = verificar_citas(dataset, fuentes)
    for a in ausentes:
        print(f"cita ausente: pregunta {a.pregunta} en el documento {a.documento}", file=sys.stderr)
    if ausentes:
        return SALIDA_CITA

    medicion = MedicionFaseA(config, dataset, dir_modelos, cache_datos, ejecutor, exportador, cliente)
    componentes: dict[str, Any] = {}
    selecciones: dict[str, Seleccion] = {}
    bloque, selecciones["embeddings"], _ = medicion.medir_componente("embeddings")
    componentes["embeddings"] = bloque
    elegido = selecciones["embeddings"].elegido
    if elegido is not None:
        id_elegido, cuantizacion = elegido.candidato.split("@")
        spec_elegida = next(s for s in config.candidatos["embeddings"] if s.id == id_elegido)
        bloque, selecciones["reranker"], _ = medicion.medir_componente("reranker", medicion.candidatos_del_elegido(spec_elegida, cuantizacion))
        componentes["reranker"] = bloque
    bloque, selecciones["nli"], _ = medicion.medir_componente("nli")
    componentes["nli"] = bloque

    reporte = {
        "fase": "A",
        "fecha": ahora().date().isoformat(),
        "dataset": {"nombre": dataset.nombre, "version": dataset.version, "preguntas": len(dataset.preguntas), "pares_nli": len(dataset.pares_nli)},
        "fuentes_sha256": {i: f.sha256 for i, f in sorted(fuentes.items())},
        "entorno": _entorno(),
        "protocolo": config.bruto["protocolo"],
        "restricciones": config.bruto["restricciones"],
        "recuperacion": config.bruto["recuperacion"],
        "componentes": componentes,
        "presupuesto_conjunto": fase_a.presupuesto_conjunto(selecciones, config),
        "componentes_sin_candidato": sorted(c for c, s in selecciones.items() if s.sin_candidato) + (["reranker"] if elegido is None else []),
    }
    destino = salida_reporte or raiz_repo() / "reports" / "adr39" / f"{ahora().date().isoformat()}-fase-a.json"
    escribir_reporte(destino, reporte)
    print(f"reporte: {destino}")
    return SALIDA_SIN_CANDIDATO if reporte["componentes_sin_candidato"] else SALIDA_OK


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--config", type=Path, default=raiz_repo() / "apps/rag-orchestrator/eval/configs/adr39-fase-a.yaml")
    parser.add_argument("--stage", choices=["t2", "t3", "t4", "t5"])
    parser.add_argument("--check-config", action="store_true")
    parser.add_argument("--reranker-chunks", action="store_true", help="medición del reranker sobre chunks de 1024 tokens (eval/configs/adr39-fase-a3.yaml)")
    parser.add_argument("--trabajador-a3", help="(interno) JSON de un trabajo de la medición del reranker")
    parser.add_argument("--trabajador", help="(interno) JSON de un trabajo de medición")
    parser.add_argument("--cache-modelos", type=Path, default=Path(os.environ.get("MODEL_CACHE_DIR", ".cache/models")))
    parser.add_argument("--cache-datos", type=Path, default=Path(os.environ.get("DATA_CACHE_DIR", ".cache/data")))
    parser.add_argument("--salida", type=Path, help="ruta del reporte (por defecto reports/adr39/<fecha>-fase-a.json)")
    parser.add_argument("--sin-verificar-fuente", action="store_true", help="no consulta la API de Hugging Face (solo pruebas)")
    args = parser.parse_args(argv)

    if args.trabajador_a3:
        from app.evaluation.fase_a3 import trabajar_a3

        return trabajar_a3(json.loads(args.trabajador_a3), args.config, args.cache_datos)
    if args.reranker_chunks:
        from app.evaluation.fase_a3 import ejecutar_cli

        return ejecutar_cli(args.config, args.cache_modelos, args.cache_datos, args.salida, lanzar_a3_en_subproceso(args.cache_datos))
    if args.trabajador:
        return trabajar(json.loads(args.trabajador), args.config, args.cache_datos)
    if args.check_config:
        from app.evaluation.chequeo_config import ejecutar_chequeo

        return ejecutar_chequeo(raiz_repo())
    if args.stage:
        from app.evaluation.fase_a2 import ejecutar_etapa

        return ejecutar_etapa(args.stage, args.config, args.cache_modelos, args.cache_datos, args.salida)

    def exportar(spec: ModeloSpec, destino: Path) -> None:
        if not (destino / "export.json").exists():
            exportar_en_subproceso(spec, destino)

    with httpx.Client() as cliente:
        return ejecutar_fase_a(
            args.config,
            args.cache_modelos,
            args.cache_datos,
            args.salida,
            ejecutor=lambda t: lanzar_en_subproceso(t, args.config, args.cache_datos),
            exportador=exportar,
            cliente=None if args.sin_verificar_fuente else cliente,
            ahora=lambda: datetime.now(timezone.utc),
        )


if __name__ == "__main__":
    raise SystemExit(main())
