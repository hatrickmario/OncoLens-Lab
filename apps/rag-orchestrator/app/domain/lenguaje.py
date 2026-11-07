"""RN-23: verificador de términos prohibidos (gemelo Python de ``packages/clinical-language``). Puro.

Reproduce el algoritmo de la referencia TypeScript (``normalizar.ts``, ``check-prohibited-terms.ts``,
``secuencias.ts``): los casos de ``packages/clinical-language/conformidad/casos.json`` deben dar los mismos
id y niveles en ambos lenguajes. El dominio no lee archivos: la carga de la lista es de otra capa.
"""

from __future__ import annotations

import re
import unicodedata
from collections.abc import Collection, Sequence
from dataclasses import dataclass
from typing import Literal, Self

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

Nivel = Literal["A", "B"]

_LONGITUD_MINIMA_PARA_FLEXION = 4
_ENCLITICO = re.compile(r"(ar|er|ir)(los|las|les|lo|la|le|se)$")
_PLURAL_VERBAL = re.compile(r"(an|en)$")
_GENERO = re.compile(r"[aeo]$")
_SEMVER = re.compile(r"[0-9]+\.[0-9]+\.[0-9]+")
# Marca que ocupa el lugar de una frase permitida: ninguna clave de la lista la iguala.
_HUECO = ""


def normalizar_texto(texto: str) -> str:
    """NFKD sin marcas Mn (no Mc ni Me, como TypeScript), ``lower()`` (no ``casefold()``).

    Todo lo que no es letra ni dígito pasa a espacio y los espacios se colapsan.
    """
    sin_marcas = "".join(
        c for c in unicodedata.normalize("NFKD", texto) if unicodedata.category(c) != "Mn"
    )
    minusculas = sin_marcas.lower()
    return " ".join("".join(c if _es_letra_o_digito(c) else " " for c in minusculas).split())


def sin_tildes(texto: str) -> str:
    """``casefold()`` y sin marcas diacríticas (NFD), conservando signos y espacios: para comparar frases sin acentos."""
    descompuesto = unicodedata.normalize("NFD", texto.casefold())
    return "".join(c for c in descompuesto if not unicodedata.combining(c))


def clave_flexiva(palabra: str) -> str:
    """Enclítico, plural nominal, plural verbal y género, en ese orden; cada paso con >= 4 letras."""
    clave = palabra
    if len(clave) >= _LONGITUD_MINIMA_PARA_FLEXION:
        clave = _ENCLITICO.sub(r"\1", clave)
    if len(clave) >= _LONGITUD_MINIMA_PARA_FLEXION and clave.endswith("s"):
        clave = clave[:-1]
    if len(clave) >= _LONGITUD_MINIMA_PARA_FLEXION and _PLURAL_VERBAL.search(clave):
        clave = clave[:-1]
    if len(clave) >= _LONGITUD_MINIMA_PARA_FLEXION and _GENERO.search(clave):
        clave = clave[:-1]
    return clave


def _categoria(caracter: str) -> str:
    return unicodedata.category(caracter)[0]


def _es_letra_o_digito(caracter: str) -> bool:
    return _categoria(caracter) in ("L", "N")


def _palabras_de(texto: str) -> list[str]:
    normalizado = normalizar_texto(texto)
    return normalizado.split(" ") if normalizado else []


def _claves_de(texto: str) -> list[str]:
    return [clave_flexiva(p) for p in _palabras_de(texto)]


def _posiciones_de(haystack: Sequence[str], secuencia: Sequence[str]) -> list[int]:
    """Posiciones de inicio en las que ``secuencia`` aparece completa y consecutiva en ``haystack``."""
    if not secuencia:
        return []
    n = len(secuencia)
    return [
        inicio
        for inicio in range(len(haystack) - n + 1)
        if all(haystack[inicio + i] == secuencia[i] for i in range(n))
    ]


def _texto_normalizable(valor: str) -> str:
    """Un texto que queda vacío tras la normalización base coincidiría con todo o con nada."""
    if not normalizar_texto(valor):
        raise ValueError("el texto queda vacío tras la normalización")
    return valor


class _Modelo(BaseModel):
    model_config = ConfigDict(frozen=True, populate_by_name=True)


class TerminoProhibido(_Modelo):
    id: str = Field(min_length=1)
    idioma: Literal["es", "en"]
    texto: str = Field(min_length=1)
    formas: list[str] | None = Field(default=None, min_length=1)
    excepciones: list[str] | None = Field(default=None, min_length=1)

    _texto_normalizable = field_validator("texto")(_texto_normalizable)

    @model_validator(mode="after")
    def _formas_y_excepciones_coherentes(self) -> Self:
        base = " ".join(_palabras_de(self.texto))
        if self.formas and not any(" ".join(_palabras_de(f)) == base for f in self.formas):
            raise ValueError(f'formas no incluye la forma de "{self.texto}"')
        claves = _claves_de(self.texto)
        for excepcion in self.excepciones or []:
            if not _posiciones_de(_claves_de(excepcion), claves):
                raise ValueError(f'la excepción "{excepcion}" no contiene "{self.texto}"')
        return self


class PrefijoProhibido(_Modelo):
    id: str = Field(min_length=1)
    idioma: Literal["es", "en"]
    prefijo: str = Field(min_length=1)

    _prefijo_normalizable = field_validator("prefijo")(_texto_normalizable)


class NivelA(_Modelo):
    aplica_a: list[str] = Field(alias="aplicaA")
    terminos: list[TerminoProhibido] = Field(min_length=1)


class NivelB(_Modelo):
    aplica_a: list[str] = Field(alias="aplicaA")
    prefijos: list[PrefijoProhibido] = Field(min_length=1)
    terminos: list[TerminoProhibido]


class FrasesPermitidas(_Modelo):
    aplica_a: list[str] = Field(alias="aplicaA")
    frases: list[str]


class SalidaGenerada(_Modelo):
    """Subconjunto del Nivel B que también rige la salida generada (US-249 AC-2): ids de ``nivelB``."""

    nivel_b: list[str] = Field(alias="nivelB", min_length=1)
    excepciones: list[str] = Field(default_factory=list)
    """Palabras completas que un prefijo del subconjunto no cuenta: el sustantivo describe, no recomienda."""

    @field_validator("excepciones")
    @classmethod
    def _excepciones_normalizables(cls, valores: list[str]) -> list[str]:
        return [_texto_normalizable(valor) for valor in valores]


@dataclass(frozen=True)
class ReglasDeSalidaGenerada:
    """Qué reglas de la lista aplica el filtro de producción a cada campo generado: el Nivel A y estos ids del B."""

    niveles: tuple[Nivel, ...]
    ids_nivel_b: frozenset[str]
    excepciones_nivel_b: frozenset[str]


class ListaTerminos(_Modelo):
    version: str
    normalizacion: str = Field(min_length=1)
    nivel_a: NivelA = Field(alias="nivelA")
    nivel_b: NivelB = Field(alias="nivelB")
    frases_permitidas: FrasesPermitidas = Field(alias="frasesPermitidas")
    salida_generada: SalidaGenerada = Field(alias="salidaGenerada")

    def reglas_para_salida_generada(self) -> ReglasDeSalidaGenerada:
        """RN-23: el Nivel A más el subconjunto B declarado por la lista; única fuente de la política de salida."""
        return ReglasDeSalidaGenerada(
            ("A", "B"),
            frozenset(self.salida_generada.nivel_b),
            frozenset(self.salida_generada.excepciones),
        )

    @model_validator(mode="after")
    def _salida_generada_solo_con_ids_del_nivel_b(self) -> Self:
        existentes = {t.id for t in self.nivel_b.terminos} | {p.id for p in self.nivel_b.prefijos}
        desconocidos = sorted(set(self.salida_generada.nivel_b) - existentes)
        if desconocidos:
            raise ValueError(
                f"salidaGenerada.nivelB con ids desconocidos: {', '.join(desconocidos)}"
            )
        return self

    @field_validator("version")
    @classmethod
    def _version_semver(cls, version: str) -> str:
        if not _SEMVER.fullmatch(version):
            raise ValueError("version debe ser semver")
        return version

    @model_validator(mode="after")
    def _ids_unicos_entre_niveles(self) -> Self:
        ids = [
            *(t.id for t in self.nivel_a.terminos),
            *(t.id for t in self.nivel_b.terminos),
            *(p.id for p in self.nivel_b.prefijos),
        ]
        repetidos = sorted({i for i in ids if ids.count(i) > 1})
        if repetidos:
            raise ValueError(f"id repetidos entre niveles: {', '.join(repetidos)}")
        return self


class Coincidencia(_Modelo):
    id: str
    termino: str
    nivel: Nivel


@dataclass(frozen=True)
class FuenteCitada:
    """Un fragmento que la opción cita: el título del catálogo (RN-25) y el texto del corpus (RN-04), nunca lo generado."""

    titulo: str
    texto: str


# Palabra que ocupa el lugar de una cita tapada: ninguna regla de la lista la iguala y rompe las secuencias que la cruzan.
_MARCA_DE_CITA = "citatapada"
_COMILLAS = r"(?:«([^»]*)»|\"([^\"]*)\"|“([^”]*)”)"


def tapar_citas_textuales_del_corpus(texto: str, fuentes: Sequence[FuenteCitada]) -> str:
    """RN-23, RN-04: tapa el tramo entre comillas atribuido («Según ‹título›: «…»») que está literalmente en la fuente.

    Solo con el título del catálogo de ESA fuente y un tramo cuyo texto normalizado aparece, palabra por palabra, en el
    texto de la misma fuente; comillas sin atribución, de otro título o sin coincidencia literal no tapan nada.
    """
    tapado = texto
    for fuente in fuentes:
        if not normalizar_texto(fuente.titulo):
            continue
        atribucion = re.compile(
            rf"Seg[uú]n\s+{re.escape(fuente.titulo)}\s*:\s*{_COMILLAS}", re.IGNORECASE
        )
        tapado = atribucion.sub(lambda m, f=fuente: _tapar_si_es_literal(m, f.texto), tapado)
    return tapado


def _tapar_si_es_literal(atribucion: re.Match[str], texto_de_la_fuente: str) -> str:
    tramo = next(grupo for grupo in atribucion.groups() if grupo is not None)
    normalizado = normalizar_texto(tramo)
    literal = (
        bool(normalizado) and f" {normalizado} " in f" {normalizar_texto(texto_de_la_fuente)} "
    )
    return f" {_MARCA_DE_CITA} " if literal else atribucion.group(0)


@dataclass(frozen=True)
class _Candidata:
    """Aparición de un término o prefijo: tramo ``[inicio, inicio + longitud)`` en palabras."""

    id: str
    termino: str
    nivel: Nivel
    inicio: int
    longitud: int
    orden: int  # posición del término en la lista (A y luego B), para desempatar
    exacta: bool  # el tramo del texto es, palabra por palabra, el texto normalizado del término


def check_prohibited_terms(
    texto: str,
    lista: ListaTerminos,
    *,
    niveles: Sequence[Nivel] = ("A",),
    permitir_frases: bool = False,
    solo_ids_b: Collection[str] | None = None,
    excepciones_b: Collection[str] | None = None,
) -> list[Coincidencia]:
    """RN-23: coincidencias de la lista en ``texto``, en orden de aparición. Por defecto solo Nivel A.

    ``solo_ids_b`` limita el Nivel B a esos ids; ``excepciones_b`` son frases (el sustantivo negado, «no emite una
    recomendación», que describe) que los prefijos del Nivel B no cuentan. El nivel A siempre ve el texto completo.
    """
    palabras = _palabras_de(texto)
    if permitir_frases:
        palabras = _tapar_frases_permitidas(palabras, lista.frases_permitidas.frases)
    claves = [clave_flexiva(p) for p in palabras]
    palabras_b = _tapar_frases_permitidas(palabras, list(excepciones_b or ()))
    candidatas = _recolectar_candidatas(palabras, claves, lista, niveles, solo_ids_b, palabras_b)
    return [
        Coincidencia(id=c.id, termino=c.termino, nivel=c.nivel)
        for c in _elegir_tramos_mas_largos(candidatas)
    ]


def _tapar_frases_permitidas(palabras: list[str], frases: list[str]) -> list[str]:
    resultado = list(palabras)
    for frase in frases:
        secuencia = _palabras_de(frase)
        for inicio in _posiciones_de(resultado, secuencia):
            resultado[inicio : inicio + len(secuencia)] = [_HUECO] * len(secuencia)
    return resultado


def _recolectar_candidatas(
    palabras: list[str],
    claves: list[str],
    lista: ListaTerminos,
    niveles: Sequence[Nivel],
    solo_ids_b: Collection[str] | None,
    palabras_b: list[str],
) -> list[_Candidata]:
    candidatas: list[_Candidata] = []
    orden = 0
    if "A" in niveles:
        for termino in lista.nivel_a.terminos:
            candidatas += _candidatas_de_termino(termino, "A", orden, palabras, claves)
            orden += 1
    if "B" in niveles:
        for prefijo in lista.nivel_b.prefijos:
            if solo_ids_b is None or prefijo.id in solo_ids_b:
                candidatas += _candidatas_de_prefijo(prefijo, orden, palabras_b)
            orden += 1
        for termino in lista.nivel_b.terminos:
            if solo_ids_b is None or termino.id in solo_ids_b:
                candidatas += _candidatas_de_termino(termino, "B", orden, palabras, claves)
            orden += 1
    return candidatas


def _candidatas_de_prefijo(
    prefijo: PrefijoProhibido, orden: int, palabras: list[str]
) -> list[_Candidata]:
    """Cada palabra de la normalización base que empieza por el prefijo es una candidata de una palabra."""
    normalizado = normalizar_texto(prefijo.prefijo)
    return [
        _Candidata(prefijo.id, prefijo.prefijo, "B", inicio, 1, orden, palabra == normalizado)
        for inicio, palabra in enumerate(palabras)
        if palabra.startswith(normalizado)
    ]


def _candidatas_de_termino(
    termino: TerminoProhibido,
    nivel: Nivel,
    orden: int,
    palabras: list[str],
    claves: list[str],
) -> list[_Candidata]:
    if termino.formas:
        tramos = [t for forma in termino.formas for t in _tramos_de(_palabras_de(forma), palabras)]
    else:
        tramos = _tramos_de(_claves_de(termino.texto), claves)
    normalizado = normalizar_texto(termino.texto)
    return [
        _Candidata(
            termino.id,
            termino.texto,
            nivel,
            inicio,
            longitud,
            orden,
            " ".join(palabras[inicio : inicio + longitud]) == normalizado,
        )
        for inicio, longitud in tramos
        if not _anulado_por_excepcion(inicio, longitud, termino, claves)
    ]


def _anulado_por_excepcion(
    inicio: int, longitud: int, termino: TerminoProhibido, claves: list[str]
) -> bool:
    """Una aparición de una ``excepción`` que contiene el tramo de la coincidencia la anula."""
    for excepcion in termino.excepciones or []:
        secuencia = _claves_de(excepcion)
        for desde in _posiciones_de(claves, secuencia):
            if desde <= inicio and inicio + longitud <= desde + len(secuencia):
                return True
    return False


def _tramos_de(secuencia: list[str], haystack: list[str]) -> list[tuple[int, int]]:
    return [(inicio, len(secuencia)) for inicio in _posiciones_de(haystack, secuencia)]


def _elegir_tramos_mas_largos(candidatas: list[_Candidata]) -> list[_Candidata]:
    """Tramo más largo: en el mismo tramo gana el término exacto y luego el primero de la lista.

    Después, por longitud descendente e inicio ascendente, se aceptan las que no se solapan con una ya
    aceptada. El resultado sale en orden de aparición.
    """
    por_tramo: dict[tuple[int, int], _Candidata] = {}
    for candidata in candidatas:
        clave = (candidata.inicio, candidata.longitud)
        actual = por_tramo.get(clave)
        if actual is None or _gana(candidata, actual):
            por_tramo[clave] = candidata
    ordenadas = sorted(por_tramo.values(), key=lambda c: (-c.longitud, c.inicio))
    aceptadas: list[_Candidata] = []
    for candidata in ordenadas:
        if not any(_se_solapan(a, candidata) for a in aceptadas):
            aceptadas.append(candidata)
    return sorted(aceptadas, key=lambda c: c.inicio)


def _gana(nueva: _Candidata, actual: _Candidata) -> bool:
    if nueva.exacta != actual.exacta:
        return nueva.exacta
    return nueva.orden < actual.orden


def _se_solapan(a: _Candidata, b: _Candidata) -> bool:
    return a.inicio < b.inicio + b.longitud and b.inicio < a.inicio + a.longitud
