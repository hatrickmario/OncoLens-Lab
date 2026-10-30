"""Extracción de la población del estudio en abanico (US-242, ADR-47): una tarea corta por (documento, criterio).

Orquestador determinista (``asyncio.gather`` + semáforo, sin agente). Por criterio: recuperar k fragmentos del MISMO
documento → pedir al LLM local un JSON cerrado → depurar (relleno, fragmento, longitud, lenguaje, NLI) → deduplicar →
acotar por fragmento. Un fallo del LLM, del NLI o una salida inválida deja SOLO ese criterio ``pendiente``; el resto se
guarda y el documento sigue ``embebido`` (RN-26). Solo depende de puertos; las reglas viven en ``domain/corpus_metadata``.

Los *logs* llevan criterio, ``chunkId``, ``finish_reason`` y longitudes; nunca el prompt, la salida del LLM, el texto de
los fragmentos ni los valores (RN-14).
"""

from __future__ import annotations

import asyncio
import logging
from collections.abc import Callable, Mapping, Sequence
from dataclasses import dataclass, replace
from typing import Any

from app.application.corpus_metadata.esquema import SalidaInvalida
from app.application.corpus_metadata.esquema_poblacion import (
    construir_prompt,
    esquema_de_poblacion,
    parsear_valores,
)
from app.application.corpus_metadata.poblacion_puertos import (
    DocumentoParaExtraer,
    Fragmento,
    LlmDePoblacion,
    PoblacionExtraida,
    PoblacionGuardada,
    RecuperadorDeFragmentos,
)
from app.application.ports import FalloDeInferencia, FalloDelLlm, NliClassifier
from app.domain.corpus_metadata.poblacion_abanico import (
    ValorPropuesto,
    pares_de_verificacion,
)
from app.domain.corpus_metadata.poblacion_contadores import ContadoresDePoblacion
from app.domain.corpus_metadata.poblacion_escritura import (
    FORMA_LISTA,
    VersionesDeExtraccion,
    criterios_con_valores,
    exigir_forma_de_lista,
    lista_de_criterio,
    marca_pendiente,
)
from app.domain.criterios_aplicabilidad import CriterioDeAplicabilidad, CriteriosDeAplicabilidad

logger = logging.getLogger(__name__)

# Los únicos fallos que dejan un criterio pendiente (D5): el LLM, el NLI o una salida fuera del esquema. Cualquier otro
# error es un defecto y sube; ``KeyboardInterrupt`` nunca se captura.
FALLOS_QUE_DEJAN_PENDIENTE = (FalloDelLlm, FalloDeInferencia, SalidaInvalida)
FINISH_REASON_CORTADA = "length"


@dataclass(frozen=True)
class ConfiguracionDePoblacion:
    """Lo que la configuración (RN-22) y las versiones fijan en una corrida de extracción."""

    top_k: int
    max_valores_por_criterio: int
    max_tokens_de_salida: int
    concurrencia: int
    reintentos: int
    version_del_prompt: str
    version_del_modelo: str
    version_del_catalogo: str
    umbral_nli: float

    @property
    def versiones(self) -> VersionesDeExtraccion:
        return VersionesDeExtraccion(
            self.version_del_prompt, self.version_del_modelo, self.version_del_catalogo
        )


@dataclass(frozen=True)
class _ResultadoDeCriterio:
    """Lo que una tarea devuelve: el contenido a guardar (lista o marca) y lo que contó."""

    clave_de_estudio: str
    contenido: Any
    contadores: ContadoresDePoblacion


@dataclass(frozen=True)
class _SalidaDelLlm:
    valores: tuple[ValorPropuesto, ...] | None
    contadores: ContadoresDePoblacion


class PopulationFanoutExtractor:
    def __init__(
        self,
        *,
        llm: LlmDePoblacion,
        nli: NliClassifier,
        recuperador: RecuperadorDeFragmentos,
        criterios: CriteriosDeAplicabilidad,
        plantilla_del_prompt: str,
        sinonimos: Mapping[str, str],
        buscar_terminos_prohibidos: Callable[[str], Sequence[str]],
        configuracion: ConfiguracionDePoblacion,
    ) -> None:
        self._llm = llm
        self._nli = nli
        self._recuperador = recuperador
        self._criterios = criterios
        self._plantilla = plantilla_del_prompt
        self._sinonimos = sinonimos
        self._buscar_terminos_prohibidos = buscar_terminos_prohibidos
        self._configuracion = configuracion

    def extraer(
        self,
        documento: DocumentoParaExtraer,
        tipos_de_cancer: Sequence[str],
        guardado: PoblacionGuardada | None,
    ) -> PoblacionExtraida:
        """Síncrono: lo invoca la CLI de ingesta, no un bucle de eventos (como ``MetadataExtractionService``)."""
        criterios = self._criterios_de(tipos_de_cancer)
        reutilizables = self._reutilizables(guardado, criterios)
        pendientes = [c for c in criterios if c.clave_de_estudio not in reutilizables]
        resultados = asyncio.run(self._extraer_todos(documento, pendientes))
        por_clave = {r.clave_de_estudio: r for r in resultados}
        poblacion = {
            c.clave_de_estudio: (
                guardado.population_criteria[c.clave_de_estudio]  # type: ignore[union-attr]
                if c.clave_de_estudio in reutilizables
                else por_clave[c.clave_de_estudio].contenido
            )
            for c in criterios
        }
        exigir_forma_de_lista(poblacion)
        contadores = sum(
            (r.contadores for r in resultados),
            ContadoresDePoblacion(criterios_reutilizados=len(reutilizables)),
        )
        return PoblacionExtraida(
            poblacion, FORMA_LISTA, contadores, criterios_con_valores(poblacion)
        )

    def _criterios_de(self, tipos_de_cancer: Sequence[str]) -> list[CriterioDeAplicabilidad]:
        """Los criterios del catálogo vigente de los tipos del documento, sin repetir ``studyKey`` (D3)."""
        por_clave: dict[str, CriterioDeAplicabilidad] = {}
        for tipo in tipos_de_cancer:
            for criterio in self._criterios.criterios(tipo):
                por_clave.setdefault(criterio.clave_de_estudio, criterio)
        return list(por_clave.values())

    def _reutilizables(
        self, guardado: PoblacionGuardada | None, criterios: Sequence[CriterioDeAplicabilidad]
    ) -> frozenset[str]:
        return frozenset()

    async def _extraer_todos(
        self, documento: DocumentoParaExtraer, criterios: Sequence[CriterioDeAplicabilidad]
    ) -> list[_ResultadoDeCriterio]:
        semaforo = asyncio.Semaphore(self._configuracion.concurrencia)
        return list(
            await asyncio.gather(
                *(self._extraer_criterio(documento, c, semaforo) for c in criterios)
            )
        )

    async def _extraer_criterio(
        self,
        documento: DocumentoParaExtraer,
        criterio: CriterioDeAplicabilidad,
        semaforo: asyncio.Semaphore,
    ) -> _ResultadoDeCriterio:
        fragmentos = self._recuperar(documento, criterio)
        try:
            salida = await self._pedir_valores(criterio, fragmentos)
            if salida.valores is None:
                return self._pendiente(criterio, salida.contadores)
            return self._depurar_y_acotar(documento, criterio, salida)
        except FALLOS_QUE_DEJAN_PENDIENTE as fallo:
            # Solo la clase del error: su mensaje podría llevar texto del documento (RN-14).
            logger.warning(
                "poblacion_criterio_pendiente criterio=%s fallo=%s",
                criterio.clave,
                type(fallo).__name__,
            )
            return self._pendiente(criterio, ContadoresDePoblacion())

    def _recuperar(
        self, documento: DocumentoParaExtraer, criterio: CriterioDeAplicabilidad
    ) -> tuple[Fragmento, ...]:
        return self._recuperador.relevantes(documento, criterio, self._configuracion.top_k)

    async def _pedir_valores(
        self, criterio: CriterioDeAplicabilidad, fragmentos: Sequence[Fragmento]
    ) -> _SalidaDelLlm:
        configuracion = self._configuracion
        prompt = construir_prompt(
            self._plantilla, criterio, fragmentos, configuracion.max_valores_por_criterio
        )
        respuesta = await self._llm.completar_json_acotado(
            prompt,
            esquema_de_poblacion(configuracion.max_valores_por_criterio),
            max_tokens=configuracion.max_tokens_de_salida,
            semilla=0,
        )
        return _SalidaDelLlm(parsear_valores(respuesta.texto), ContadoresDePoblacion(llamadas=1))

    def _depurar_y_acotar(
        self,
        documento: DocumentoParaExtraer,
        criterio: CriterioDeAplicabilidad,
        salida: _SalidaDelLlm,
    ) -> _ResultadoDeCriterio:
        """AC-1: cada valor propuesto se guarda con su fragmento y la etiqueta del NLI."""
        todos = self._recuperador.todos(documento)
        texto_del_fragmento = {f.chunk_id: f.texto for f in todos}
        propuestos = salida.valores or ()
        pares = pares_de_verificacion(propuestos, texto_del_fragmento, criterio.etiqueta_es)
        resultados = self._nli.clasificar(pares)
        etiquetados = tuple(
            replace(v, resultado_nli=r.label) for v, r in zip(propuestos, resultados, strict=True)
        )
        lista = lista_de_criterio(etiquetados, self._configuracion.versiones)
        return _ResultadoDeCriterio(criterio.clave_de_estudio, lista, salida.contadores)

    @staticmethod
    def _pendiente(
        criterio: CriterioDeAplicabilidad, contadores: ContadoresDePoblacion
    ) -> _ResultadoDeCriterio:
        return _ResultadoDeCriterio(
            criterio.clave_de_estudio,
            marca_pendiente(),
            contadores + ContadoresDePoblacion(criterios_pendientes=1),
        )
