# Segundo loop contextual (contextual)

Configuración `contextual-local-apagado` (huella `afb1cc9ef1467aef26c854467c4105c0ce0c347203dd36af15cb3003e5dda393`), dataset `s5-corpus-ampliado` versión 1 (`data/eval/s5-corpus-ampliado`) sobre el corpus `s5-corpus-ampliado` (release `rel-s5-corpus-ampliado-1`, 252 chunks), proveedor `local`, catálogo `2026.10.0`.

Expansión contextual: apagada (campos tipo, estadio, biomarcador_principal; formato plano); casos: mama-completo, prostata-con-grado.
Umbrales: RETRIEVAL_TOP_K 30, RERANKER_MAX_PAIRS 20, RELEVANCE_THRESHOLD 0.3, NLI_ENTAILMENT_THRESHOLD 0.7.
Rótulo: `no_validada`.

## Preguntas de sinónimos

La causa de una pregunta que no supera el umbral (la primera condición que se cumple manda):

1. algún chunk supera RELEVANCE_THRESHOLD: —.
2. ninguna forma del término (canónica o sinónimo, es o en, sin distinguir mayúsculas ni tildes) aparece en un chunk del corpus de la corrida recuperable para el tipo de cáncer del caso: termino_ausente_del_corpus.
3. alguna forma del término aparece en un chunk del corpus y ningún chunk supera RELEVANCE_THRESHOLD: bajo_umbral_con_termino_en_corpus.

| pregunta | término | caso | supera umbral | causa |
|---|---|---|---|---|
| CTX-C12 | antraciclinas | mama-completo | True | — |
| CTX-C12 | antraciclinas | prostata-con-grado | False | termino_ausente_del_corpus |
| CTX-C13 | pertuzumab | mama-completo | True | — |
| CTX-C13 | pertuzumab | prostata-con-grado | False | termino_ausente_del_corpus |
| CTX-C14 | TILs | mama-completo | True | — |
| CTX-C14 | TILs | prostata-con-grado | False | termino_ausente_del_corpus |

## Recuentos por clase

| ámbito | clase | con evidencia | total |
|---|---|---|---|
| total | generica | 1 | 44 |
| total | con_tema | 1 | 48 |
| total | control | 13 | 28 |
| mama-completo | generica | 0 | 22 |
| mama-completo | con_tema | 0 | 24 |
| mama-completo | control | 8 | 14 |
| prostata-con-grado | generica | 1 | 22 |
| prostata-con-grado | con_tema | 1 | 24 |
| prostata-con-grado | control | 5 | 14 |

## Cobertura de genéricas por caso

La meta es la de US-273 AC-2; los casos ajenos a esa historia se comparan con ella a modo informativo.

| caso | genéricas con evidencia | genéricas | meta | cumple | campos usados |
|---|---|---|---|---|---|
| mama-completo | 0 | 22 | 18 | False | — |
| prostata-con-grado | 1 | 22 | 18 | False | — |

## Adversarias (tema fuera del corpus)

| caso | total | sin evidencia | falsos positivos | puntaje null | llamadas al generador |
|---|---|---|---|---|---|
| mama-completo | 24 | 24 | 0 | 24 | 0 |
| prostata-con-grado | 24 | 23 | 1 | 23 | 1 |

## Por pregunta

| pregunta | clase | caso | estado | supera umbral | top_relevance_score | segundo loop | top-3 (chunk:puntaje) | llamadas al generador |
|---|---|---|---|---|---|---|---|---|
| CTX-G01 | generica | mama-completo | sin_evidencia | False | — | ninguno | ch-pmc-mama-linfocitos-her2-secundario-5:0.011792509167740849, ch-ct-mama-katherine-4:0.004941808198297115, ch-nci-mama-prevencion-pac-es-4:0.0032587132478120616 | 0 |
| CTX-G01 | generica | prostata-con-grado | sin_evidencia | False | — | ninguno | ch-nci-prostata-prevencion-hp-en-2:0.015595890117327153, ch-nci-prostata-prevencion-hp-en-1:0.011426884134851984, ch-pmc-prostata-cribado-personalizado-es-4:0.004869584294044118 | 0 |
| CTX-G02 | generica | mama-completo | sin_evidencia | False | — | ninguno | ch-ct-mama-monarche-3:0.002695181504996174, ch-pmc-mama-linfocitos-her2-secundario-5:0.0023719707163886174, ch-ct-mama-katherine-4:0.0011093492806977536 | 0 |
| CTX-G02 | generica | prostata-con-grado | sin_evidencia | False | — | ninguno | ch-ct-prostata-prevail-2:0.002729202516192757, ch-pmc-prostata-nueva-perspectiva-cribado-es-1:0.002595104593437776, ch-pmc-prostata-cribado-personalizado-es-4:0.0015928350507785616 | 0 |
| CTX-G03 | generica | mama-completo | sin_evidencia | False | — | ninguno | ch-ct-mama-destiny-breast06-4:0.002116060813325441, ch-nci-mama-pac-es-4:0.0020139903750802175, ch-ct-mama-monarche-3:0.001642583462448858 | 0 |
| CTX-G03 | generica | prostata-con-grado | sin_evidencia | False | — | ninguno | ch-pmc-prostata-cirugia-citorreductora-ma-2:0.0035173413312151783, ch-ct-prostata-prevail-3:0.002962687927655515, ch-nci-prostata-deteccion-hp-en-1:0.0013288763675149552 | 0 |
| CTX-G04 | generica | mama-completo | sin_evidencia | False | — | ninguno | ch-pmc-mama-linfocitos-her2-secundario-3:0.0010681470052265457, ch-nci-mama-prevencion-pac-es-4:0.0005349153685058675, ch-ct-mama-katherine-2:0.0004955019398377178 | 0 |
| CTX-G04 | generica | prostata-con-grado | sin_evidencia | False | — | ninguno | ch-pmc-prostata-nueva-perspectiva-cribado-es-5:0.0024060510691960905, ch-nci-prostata-prevencion-hp-en-4:0.0020803854344221668, ch-nci-prostata-prevencion-hp-en-1:0.001778656475050521 | 0 |
| CTX-G05 | generica | mama-completo | sin_evidencia | False | — | ninguno | ch-ct-mama-katherine-1:0.03660763065038793, ch-ct-mama-katherine-2:0.016581370562616965, ch-ct-mama-natalee-1:0.006292277956666491 | 0 |
| CTX-G05 | generica | prostata-con-grado | sin_evidencia | False | — | ninguno | ch-pmc-prostata-nueva-perspectiva-cribado-es-5:0.026461278419742308, ch-ct-prostata-prevail-3:0.011911541894912935, ch-nci-prostata-prevencion-hp-en-2:0.004769657681713264 | 0 |
| CTX-G06 | generica | mama-completo | sin_evidencia | False | — | ninguno | ch-ct-mama-aphinity-5:0.0020148061479517655, ch-ct-mama-katherine-1:0.0017830499190602093, ch-ct-mama-monarche-2:0.0014225872394815458 | 0 |
| CTX-G06 | generica | prostata-con-grado | sin_evidencia | False | — | ninguno | ch-pmc-prostata-nueva-perspectiva-cribado-es-1:0.006970079931972645, ch-nci-prostata-prevencion-hp-en-4:0.006419070097987551, ch-nci-prostata-prevencion-hp-en-1:0.005011356508418115 | 0 |
| CTX-G07 | generica | mama-completo | sin_evidencia | False | — | ninguno | ch-ct-mama-monarche-3:0.007001762711890418, ch-pmc-mama-linfocitos-her2-secundario-5:0.006822823781146632, ch-nci-mama-prevencion-pac-es-4:0.0017986190380374764 | 0 |
| CTX-G07 | generica | prostata-con-grado | sin_evidencia | False | — | ninguno | ch-pmc-prostata-nueva-perspectiva-cribado-es-5:0.018339546354141194, ch-nci-prostata-prevencion-hp-en-2:0.011696029643342222, ch-nci-prostata-prevencion-hp-en-1:0.007103144415045573 | 0 |
| CTX-G08 | generica | mama-completo | sin_evidencia | False | — | ninguno | ch-pmc-mama-tamoxifeno-eca-1:0.012722989708354301, ch-pmc-mama-cdk46-guia-2:0.004442538259886894, ch-ct-mama-katherine-4:0.0040535100908005665 | 0 |
| CTX-G08 | generica | prostata-con-grado | sin_evidencia | False | — | ninguno | ch-ct-prostata-prevail-3:0.010701872580126896, ch-pmc-prostata-nueva-perspectiva-cribado-es-5:0.003895590437754627, ch-nci-prostata-deteccion-hp-en-1:0.0027430437523874116 | 0 |
| CTX-G09 | generica | mama-completo | sin_evidencia | False | — | ninguno | ch-nci-mama-hp-en-4:0.00019265283484853465, ch-nci-mama-hombre-hp-en-2:0.00018826248638535047, ch-nci-mama-deteccion-hp-en-3:0.00012667843617094184 | 0 |
| CTX-G09 | generica | prostata-con-grado | sin_evidencia | False | — | ninguno | ch-nci-prostata-prevencion-hp-en-1:0.0009113116479576802, ch-nci-prostata-prevencion-hp-en-4:0.0004592196686513844, ch-ct-prostata-prevail-2:0.00042920722978206135 | 0 |
| CTX-G10 | generica | mama-completo | sin_evidencia | False | — | ninguno | ch-ct-mama-katherine-5:0.19177060024377507, ch-ct-mama-katherine-1:0.011802587892112784, ch-nci-mama-pac-es-4:0.007034537682367686 | 0 |
| CTX-G10 | generica | prostata-con-grado | sin_evidencia | False | — | ninguno | ch-ct-prostata-prevail-2:0.022232019109493545, ch-nci-prostata-deteccion-hp-en-1:0.007711568831421645, ch-pmc-prostata-cirugia-citorreductora-ma-3:0.007198318818734047 | 0 |
| CTX-G11 | generica | mama-completo | sin_evidencia | False | — | ninguno | ch-pmc-mama-linfocitos-her2-secundario-5:0.004942966660986315, ch-nci-mama-prevencion-pac-es-4:0.0018507430242110413, ch-ct-mama-katherine-4:0.0010343273022080284 | 0 |
| CTX-G11 | generica | prostata-con-grado | sin_evidencia | False | — | ninguno | ch-nci-prostata-prevencion-hp-en-4:0.007111496213706826, ch-nci-prostata-pac-es-1:0.00688502598379283, ch-pmc-prostata-mhsp-nma-4:0.005035704996819357 | 0 |
| CTX-G12 | generica | mama-completo | sin_evidencia | False | — | ninguno | ch-ct-mama-destiny-breast06-1:0.009887596898025883, ch-ct-mama-monarche-3:0.005424740685376091, ch-ct-mama-destiny-breast06-4:0.004823503311437993 | 0 |
| CTX-G12 | generica | prostata-con-grado | con_evidencia | True | 0.9774731041663257 | ninguno | ch-nci-prostata-pac-es-5:0.9774731041663257, ch-nci-prostata-pac-es-3:0.8893248043420814, ch-pmc-prostata-cirugia-citorreductora-ma-3:0.034284489071582845 | 1 |
| CTX-G13 | generica | mama-completo | sin_evidencia | False | — | ninguno | ch-pmc-mama-irradiacion-pared-toracica-eca-2:0.0033668252964056977, ch-pmc-mama-cdk46-guia-2:0.0032768114610672843, ch-ct-mama-aphinity-5:0.001559465289912626 | 0 |
| CTX-G13 | generica | prostata-con-grado | sin_evidencia | False | — | ninguno | ch-nci-prostata-pac-es-1:0.00233721867014487, ch-ct-prostata-prevail-2:0.00218210172284204, ch-pmc-prostata-nueva-perspectiva-cribado-es-1:0.0008581115916215165 | 0 |
| CTX-G14 | generica | mama-completo | sin_evidencia | False | — | ninguno | ch-ct-mama-katherine-4:0.041801126760466614, ch-ct-mama-monarche-3:0.040484344917444334, ch-pmc-mama-linfocitos-her2-secundario-5:0.031466375462011566 | 0 |
| CTX-G14 | generica | prostata-con-grado | sin_evidencia | False | — | ninguno | ch-nci-prostata-prevencion-hp-en-1:0.06710076343006492, ch-nci-prostata-prevencion-hp-en-2:0.054533104208704844, ch-nci-prostata-deteccion-hp-en-5:0.014799417344284919 | 0 |
| CTX-G15 | generica | mama-completo | sin_evidencia | False | — | ninguno | ch-ct-mama-katherine-4:0.03970173835758094, ch-ct-mama-katherine-3:0.007098703291480011, ch-pmc-mama-linfocitos-her2-secundario-5:0.006664627099209252 | 0 |
| CTX-G15 | generica | prostata-con-grado | sin_evidencia | False | — | ninguno | ch-ct-prostata-prevail-3:0.02626406130075603, ch-nci-prostata-prevencion-hp-en-1:0.017783063430764166, ch-pmc-prostata-cirugia-citorreductora-ma-2:0.01701021588054707 | 0 |
| CTX-G16 | generica | mama-completo | sin_evidencia | False | — | ninguno | ch-ct-mama-aphinity-1:0.036957718203366755, ch-ct-mama-monarche-3:0.02780580400268594, ch-pmc-mama-adn-tumoral-metastasico-rs-3:0.024100392759263498 | 0 |
| CTX-G16 | generica | prostata-con-grado | sin_evidencia | False | — | ninguno | ch-pmc-prostata-enzalutamida-abiraterona-ma-5:0.15779241846054226, ch-pmc-prostata-cirugia-citorreductora-ma-2:0.04972652651671398, ch-nci-prostata-deteccion-hp-en-1:0.036032116244406734 | 0 |
| CTX-G17 | generica | mama-completo | sin_evidencia | False | — | ninguno | ch-ct-mama-katherine-5:0.05112182509070879, ch-ct-mama-destiny-breast06-4:0.014728842201866762, ch-ct-mama-katherine-2:0.009211828713426781 | 0 |
| CTX-G17 | generica | prostata-con-grado | sin_evidencia | False | — | ninguno | ch-pmc-prostata-cirugia-citorreductora-ma-2:0.0873736529148133, ch-nci-prostata-deteccion-hp-en-1:0.054994965896912454, ch-pmc-prostata-darolutamida-rs-4:0.035687706481280675 | 0 |
| CTX-G18 | generica | mama-completo | sin_evidencia | False | — | ninguno | ch-pmc-mama-linfocitos-her2-secundario-5:0.015345810437056876, ch-ct-mama-katherine-4:0.015266668799011788, ch-ct-mama-aphinity-4:0.00917950989699778 | 0 |
| CTX-G18 | generica | prostata-con-grado | sin_evidencia | False | — | ninguno | ch-nci-prostata-prevencion-hp-en-1:0.04262422367895007, ch-nci-prostata-prevencion-hp-en-4:0.02447463860680159, ch-nci-prostata-prevencion-hp-en-2:0.02040953548069982 | 0 |
| CTX-G19 | generica | mama-completo | sin_evidencia | False | — | ninguno | ch-ct-mama-monarche-3:0.0005261051065743006, ch-ct-mama-katherine-4:0.00032489581073307124, ch-ct-mama-katherine-5:0.0002834833468729529 | 0 |
| CTX-G19 | generica | prostata-con-grado | sin_evidencia | False | — | ninguno | ch-pmc-prostata-nueva-perspectiva-cribado-es-5:0.0008396290923476232, ch-nci-prostata-prevencion-hp-en-1:0.00038933858962350294, ch-nci-prostata-hp-en-1:0.00032539674288847105 | 0 |
| CTX-G20 | generica | mama-completo | sin_evidencia | False | — | ninguno | ch-pmc-mama-antraciclinas-rs-1:0.006190757205921128, ch-ct-mama-monarche-3:0.0050646263740882136, ch-ct-mama-katherine-5:0.003966338972276327 | 0 |
| CTX-G20 | generica | prostata-con-grado | sin_evidencia | False | — | ninguno | ch-nci-prostata-prevencion-hp-en-4:0.03532913214487206, ch-nci-prostata-deteccion-hp-en-1:0.013622610213368445, ch-pmc-prostata-cirugia-citorreductora-ma-2:0.012734542844371236 | 0 |
| CTX-G21 | generica | mama-completo | sin_evidencia | False | — | ninguno | ch-ct-mama-katherine-5:0.013112462871339492, ch-pmc-mama-adn-tumoral-metastasico-rs-3:0.01057737306597499, ch-pmc-mama-parp-neoadyuvante-eca-5:0.006092420477113596 | 0 |
| CTX-G21 | generica | prostata-con-grado | sin_evidencia | False | — | ninguno | ch-pmc-prostata-volumen-nma-3:0.005630123593832633, ch-pmc-prostata-hormonoterapia-radioterapia-ma-2:0.005002514754790757, ch-ct-prostata-aramis-2:0.0033263049096331535 | 0 |
| CTX-G22 | generica | mama-completo | sin_evidencia | False | — | ninguno | ch-pmc-mama-linfocitos-her2-secundario-5:0.029388147673228907, ch-nci-mama-hp-en-4:0.0027318825558103185, ch-ct-mama-aphinity-5:0.002063273638447638 | 0 |
| CTX-G22 | generica | prostata-con-grado | sin_evidencia | False | — | ninguno | ch-nci-prostata-prevencion-hp-en-1:0.012743838403204082, ch-nci-prostata-prevencion-hp-en-4:0.009453451693336588, ch-pmc-prostata-mhsp-nma-4:0.00721702743165281 | 0 |
| CTX-A01 | con_tema | mama-completo | sin_evidencia | False | — | ninguno | ch-ct-mama-katherine-5:0.017016771035438312, ch-nci-mama-hp-en-4:0.0018538939269343478, ch-pmc-mama-linfocitos-her2-secundario-5:0.0015191321705999286 | 0 |
| CTX-A01 | con_tema | prostata-con-grado | sin_evidencia | False | — | ninguno | ch-pmc-prostata-nueva-perspectiva-cribado-es-5:0.019571209843682682, ch-ct-prostata-spartan-4:0.010822991114380951, ch-nci-prostata-deteccion-hp-en-4:0.0034778306513234573 | 0 |
| CTX-A02 | con_tema | mama-completo | sin_evidencia | False | — | ninguno | ch-pmc-mama-adn-tumoral-metastasico-rs-3:0.0022673674282074436, ch-ct-mama-katherine-5:0.0012915664301885866, ch-pmc-mama-antraciclinas-rs-1:0.0012641865215731695 | 0 |
| CTX-A02 | con_tema | prostata-con-grado | sin_evidencia | False | — | ninguno | ch-nci-prostata-deteccion-hp-en-1:0.0029611811781526517, ch-pmc-prostata-cribado-personalizado-es-2:0.0012196178776995904, ch-pmc-prostata-cribado-personalizado-es-4:0.0010317483020725962 | 0 |
| CTX-A03 | con_tema | mama-completo | sin_evidencia | False | — | ninguno | ch-nci-mama-hp-en-3:0.018680530266665316, ch-pmc-mama-cdk46-guia-2:0.01003507780179319, ch-ct-mama-katherine-1:0.004392284348488455 | 0 |
| CTX-A03 | con_tema | prostata-con-grado | sin_evidencia | False | — | ninguno | ch-nci-prostata-hp-en-4:0.03942502735105347, ch-nci-prostata-deteccion-hp-en-4:0.004291864184591894, ch-nci-prostata-prevencion-hp-en-1:0.003730336045372293 | 0 |
| CTX-A04 | con_tema | mama-completo | sin_evidencia | False | — | ninguno | ch-pmc-mama-adn-tumoral-metastasico-rs-3:0.010027629114071615, ch-nci-mama-prevencion-hp-en-3:0.007263169725885319, ch-pmc-mama-tamoxifeno-eca-3:0.0055019375793562055 | 0 |
| CTX-A04 | con_tema | prostata-con-grado | sin_evidencia | False | — | ninguno | ch-nci-prostata-deteccion-hp-en-4:0.02964896427898455, ch-pmc-prostata-nueva-perspectiva-cribado-es-5:0.026891701248067182, ch-nci-prostata-prevencion-hp-en-1:0.021643854152422738 | 0 |
| CTX-A05 | con_tema | mama-completo | sin_evidencia | False | — | ninguno | ch-pmc-mama-linfocitos-her2-secundario-5:0.0027427959280601657, ch-ct-mama-katherine-5:0.0015405238398098365, ch-pmc-mama-adn-tumoral-metastasico-rs-3:0.0012114962642408964 | 0 |
| CTX-A05 | con_tema | prostata-con-grado | sin_evidencia | False | — | ninguno | ch-nci-prostata-deteccion-hp-en-1:0.07230917038131097, ch-nci-prostata-deteccion-hp-en-5:0.012010303757089074, ch-nci-prostata-prevencion-hp-en-2:0.011857527875487314 | 0 |
| CTX-A06 | con_tema | mama-completo | sin_evidencia | False | — | ninguno | ch-pmc-mama-irradiacion-pared-toracica-eca-3:0.012935922718674763, ch-pmc-mama-linfocitos-her2-secundario-5:0.011000676699347697, ch-pmc-mama-adn-tumoral-metastasico-rs-3:0.002861435928052654 | 0 |
| CTX-A06 | con_tema | prostata-con-grado | sin_evidencia | False | — | ninguno | ch-nci-prostata-deteccion-hp-en-1:0.04310565587440521, ch-pmc-prostata-nueva-perspectiva-cribado-es-5:0.02032836452598811, ch-nci-prostata-deteccion-hp-en-4:0.010130574239995714 | 0 |
| CTX-A07 | con_tema | mama-completo | sin_evidencia | False | — | ninguno | ch-pmc-mama-linfocitos-her2-secundario-5:0.007785901569466076, ch-ct-mama-monarche-3:0.005716190983354863, ch-nci-mama-deteccion-hp-en-2:0.005129860349960482 | 0 |
| CTX-A07 | con_tema | prostata-con-grado | sin_evidencia | False | — | ninguno | ch-pmc-prostata-nueva-perspectiva-cribado-es-5:0.00685832243439943, ch-pmc-prostata-cirugia-citorreductora-ma-3:0.0018112435328115231, ch-nci-prostata-prevencion-hp-en-1:0.0015042623844012087 | 0 |
| CTX-A08 | con_tema | mama-completo | sin_evidencia | False | — | ninguno | ch-ct-mama-destiny-breast06-2:0.11765801823790815, ch-pmc-mama-linfocitos-her2-secundario-5:0.09152503331023618, ch-pmc-mama-trastuzumab-deruxtecan-eca-1:0.07013977894531294 | 0 |
| CTX-A08 | con_tema | prostata-con-grado | con_evidencia | True | 0.41450587968127195 | ninguno | ch-nci-prostata-prevencion-hp-en-1:0.41450587968127195, ch-nci-prostata-prevencion-pac-es-4:0.3150847290866542, ch-nci-prostata-prevencion-hp-en-4:0.24536509879216747 | 1 |
| CTX-A09 | con_tema | mama-completo | sin_evidencia | False | — | ninguno | ch-nci-mama-prevencion-hp-en-5:0.25914536411686473, ch-nci-mama-hp-en-3:0.046044750639182355, ch-pmc-mama-antraciclinas-rs-1:0.04257108504566143 | 0 |
| CTX-A09 | con_tema | prostata-con-grado | sin_evidencia | False | — | ninguno | ch-pmc-prostata-enzalutamida-abiraterona-ma-1:0.1755508408387442, ch-pmc-prostata-talazoparib-enzalutamida-nma-1:0.08839912643586238, ch-pmc-prostata-nueva-perspectiva-cribado-es-5:0.007509667730284859 | 0 |
| CTX-A10 | con_tema | mama-completo | sin_evidencia | False | — | ninguno | ch-nci-mama-deteccion-hp-en-3:0.0009899050579246812, ch-pmc-mama-parp-neoadyuvante-eca-1:0.0009822933465863228, ch-nci-mama-hp-en-4:0.0008648108902609191 | 0 |
| CTX-A10 | con_tema | prostata-con-grado | sin_evidencia | False | — | ninguno | ch-nci-prostata-prevencion-hp-en-1:0.1495510733094826, ch-nci-prostata-prevencion-hp-en-4:0.12157684929414037, ch-ct-prostata-spartan-1:0.04796536512183288 | 0 |
| CTX-A11 | con_tema | mama-completo | sin_evidencia | False | — | ninguno | ch-pmc-mama-adn-tumoral-metastasico-rs-3:0.0006158532825707825, ch-nci-mama-deteccion-hp-en-3:0.0005688949161749295, ch-nci-mama-hombre-hp-en-2:0.00043002712630710186 | 0 |
| CTX-A11 | con_tema | prostata-con-grado | sin_evidencia | False | — | ninguno | ch-nci-prostata-deteccion-hp-en-4:0.0007650454830112907, ch-pmc-prostata-cribado-personalizado-es-2:0.0006244048239550533, ch-pmc-prostata-darolutamida-rs-4:0.00035855283816965265 | 0 |
| CTX-A12 | con_tema | mama-completo | sin_evidencia | False | — | ninguno | ch-nci-mama-hp-en-3:0.0025563852497195476, ch-pmc-mama-parp-neoadyuvante-eca-5:0.001902499465047328, ch-pmc-mama-adn-tumoral-metastasico-rs-3:0.001419565281466026 | 0 |
| CTX-A12 | con_tema | prostata-con-grado | sin_evidencia | False | — | ninguno | ch-pmc-prostata-cirugia-citorreductora-ma-3:0.002636479396632738, ch-pmc-prostata-cribado-personalizado-es-4:0.002378885191835692, ch-pmc-prostata-cirugia-citorreductora-ma-2:0.0009886618730355278 | 0 |
| CTX-A13 | con_tema | mama-completo | sin_evidencia | False | — | ninguno | ch-ct-mama-aphinity-1:0.0020002725083788915, ch-nci-mama-deteccion-hp-en-3:0.0018676930894395494, ch-nci-mama-hp-en-4:0.0009107569713806241 | 0 |
| CTX-A13 | con_tema | prostata-con-grado | sin_evidencia | False | — | ninguno | ch-nci-prostata-prevencion-hp-en-4:0.02077185182374489, ch-nci-prostata-deteccion-hp-en-4:0.0037689553364386643, ch-pmc-prostata-cribado-personalizado-es-2:0.0027122510211224048 | 0 |
| CTX-A14 | con_tema | mama-completo | sin_evidencia | False | — | ninguno | ch-pmc-mama-adn-tumoral-metastasico-rs-4:0.0016245803507186842, ch-nci-mama-deteccion-hp-en-3:0.0015669223974953215, ch-pmc-mama-linfocitos-her2-secundario-5:0.0014559985437555152 | 0 |
| CTX-A14 | con_tema | prostata-con-grado | sin_evidencia | False | — | ninguno | ch-nci-prostata-prevencion-hp-en-2:0.002215503047663195, ch-pmc-prostata-inhibidores-ar-taxanos-eca-4:0.0016019897904314157, ch-nci-prostata-deteccion-hp-en-5:0.0007154158088618077 | 0 |
| CTX-A15 | con_tema | mama-completo | sin_evidencia | False | — | ninguno | ch-nci-mama-deteccion-hp-en-3:0.0015263923462789336, ch-ct-mama-katherine-5:0.0007821170000108874, ch-nci-mama-hombre-hp-en-2:0.0006392063479704768 | 0 |
| CTX-A15 | con_tema | prostata-con-grado | sin_evidencia | False | — | ninguno | ch-nci-prostata-deteccion-hp-en-5:0.013132266482002367, ch-pmc-prostata-cribado-personalizado-es-2:0.002926250441346407, ch-nci-prostata-prevencion-hp-en-2:0.00104010841231048 | 0 |
| CTX-A16 | con_tema | mama-completo | sin_evidencia | False | — | ninguno | ch-ct-mama-katherine-5:0.0005342852951061191, ch-pmc-mama-parp-neoadyuvante-eca-3:0.0003471355922644625, ch-pmc-mama-antraciclinas-rs-1:0.00032845553961161484 | 0 |
| CTX-A16 | con_tema | prostata-con-grado | sin_evidencia | False | — | ninguno | ch-nci-prostata-prevencion-hp-en-4:0.001389592153441573, ch-nci-prostata-prevencion-hp-en-1:0.0007480614653075859, ch-nci-prostata-deteccion-hp-en-4:0.0005073506748179913 | 0 |
| CTX-A17 | con_tema | mama-completo | sin_evidencia | False | — | ninguno | ch-pmc-mama-adn-tumoral-metastasico-rs-3:0.00031456269936263156, ch-ct-mama-aphinity-4:0.00029313519136960986, ch-pmc-mama-trastuzumab-deruxtecan-eca-1:0.00018860511815409366 | 0 |
| CTX-A17 | con_tema | prostata-con-grado | sin_evidencia | False | — | ninguno | ch-nci-prostata-deteccion-hp-en-4:0.0006911363157374742, ch-nci-prostata-prevencion-hp-en-4:0.0006840497562205239, ch-pmc-prostata-cirugia-citorreductora-ma-3:9.371890353471562e-05 | 0 |
| CTX-A18 | con_tema | mama-completo | sin_evidencia | False | — | ninguno | ch-pmc-mama-adn-tumoral-metastasico-rs-3:0.0003127678620129229, ch-ct-mama-katherine-1:0.0001363016078206943, ch-nci-mama-deteccion-hp-en-3:0.00010838204174217663 | 0 |
| CTX-A18 | con_tema | prostata-con-grado | sin_evidencia | False | — | ninguno | ch-nci-prostata-prevencion-hp-en-4:0.0002306601778516912, ch-nci-prostata-deteccion-hp-en-4:0.00020660559323328403, ch-pmc-prostata-nueva-perspectiva-cribado-es-5:7.570928984347575e-05 | 0 |
| CTX-A19 | con_tema | mama-completo | sin_evidencia | False | — | ninguno | ch-pmc-mama-adn-tumoral-metastasico-rs-3:0.022651447507272292, ch-pmc-mama-parp-neoadyuvante-eca-3:0.013468503565938737, ch-pmc-mama-tamoxifeno-eca-5:0.0067345034903141645 | 0 |
| CTX-A19 | con_tema | prostata-con-grado | sin_evidencia | False | — | ninguno | ch-nci-prostata-deteccion-hp-en-1:0.014085104928704085, ch-pmc-prostata-cirugia-citorreductora-ma-3:0.013246360655666279, ch-nci-prostata-prevencion-hp-en-1:0.008552465928427018 | 0 |
| CTX-A20 | con_tema | mama-completo | sin_evidencia | False | — | ninguno | ch-pmc-mama-adn-tumoral-metastasico-rs-3:0.006034374598308909, ch-ct-mama-katherine-5:0.00219665618406725, ch-ct-mama-aphinity-4:0.0015742419692043672 | 0 |
| CTX-A20 | con_tema | prostata-con-grado | sin_evidencia | False | — | ninguno | ch-nci-prostata-deteccion-hp-en-1:0.06981581055497746, ch-pmc-prostata-nueva-perspectiva-cribado-es-5:0.023577977098113802, ch-nci-prostata-prevencion-hp-en-1:0.019118871894706367 | 0 |
| CTX-A21 | con_tema | mama-completo | sin_evidencia | False | — | ninguno | ch-pmc-mama-adn-tumoral-metastasico-rs-3:0.017696948812801563, ch-pmc-mama-linfocitos-her2-secundario-5:0.004125296418111397, ch-nci-mama-deteccion-hp-en-3:0.0031588209299727612 | 0 |
| CTX-A21 | con_tema | prostata-con-grado | sin_evidencia | False | — | ninguno | ch-nci-prostata-deteccion-hp-en-4:0.006935024809538885, ch-pmc-prostata-cribado-personalizado-es-4:0.0034052846939555425, ch-nci-prostata-deteccion-hp-en-5:0.0018010640213323185 | 0 |
| CTX-A22 | con_tema | mama-completo | sin_evidencia | False | — | ninguno | ch-pmc-mama-linfocitos-her2-secundario-5:0.05956140177081446, ch-pmc-mama-adn-tumoral-metastasico-rs-3:0.011289936686129362, ch-ct-mama-katherine-3:0.004036323243872676 | 0 |
| CTX-A22 | con_tema | prostata-con-grado | sin_evidencia | False | — | ninguno | ch-pmc-prostata-volumen-nma-3:0.051801592566494206, ch-nci-prostata-deteccion-hp-en-4:0.00856869462803296, ch-pmc-prostata-cribado-personalizado-es-4:0.004868791791015909 | 0 |
| CTX-A23 | con_tema | mama-completo | sin_evidencia | False | — | ninguno | ch-pmc-mama-linfocitos-her2-secundario-5:0.011237919839259182, ch-pmc-mama-cdk46-guia-1:0.005993170169781521, ch-pmc-mama-antraciclinas-rs-1:0.005132903197203941 | 0 |
| CTX-A23 | con_tema | prostata-con-grado | sin_evidencia | False | — | ninguno | ch-nci-prostata-deteccion-hp-en-4:0.01172747246530557, ch-pmc-prostata-cirugia-citorreductora-ma-3:0.008307069031223538, ch-pmc-prostata-braquiterapia-focal-rs-4:0.00782401329432129 | 0 |
| CTX-A24 | con_tema | mama-completo | sin_evidencia | False | — | ninguno | ch-ct-mama-katherine-4:0.003526652702845264, ch-pmc-mama-antraciclinas-rs-1:0.0031048937787647632, ch-pmc-mama-adn-tumoral-metastasico-rs-3:0.002257069698478549 | 0 |
| CTX-A24 | con_tema | prostata-con-grado | sin_evidencia | False | — | ninguno | ch-nci-prostata-deteccion-hp-en-1:0.0468077335396885, ch-pmc-prostata-nueva-perspectiva-cribado-es-5:0.006060172568957265, ch-pmc-prostata-cirugia-citorreductora-ma-3:0.0052997502306891455 | 0 |
| CTX-C01 | control | mama-completo | con_evidencia | True | 0.9659727114082316 | ninguno | ch-pmc-mama-pembrolizumab-er-eca-1:0.9659727114082316, ch-pmc-mama-pembrolizumab-er-eca-4:0.8425740611785466, ch-ct-mama-aphinity-1:0.40699208674441795 | 1 |
| CTX-C01 | control | prostata-con-grado | sin_evidencia | False | — | ninguno | ch-nci-prostata-prevencion-hp-en-1:0.01456755949879924, ch-nci-prostata-deteccion-hp-en-1:0.010534154522844577, ch-nci-prostata-prevencion-hp-en-4:0.00581413267342652 | 0 |
| CTX-C02 | control | mama-completo | con_evidencia | True | 0.9886413438290164 | ninguno | ch-pmc-mama-trastuzumab-deruxtecan-eca-1:0.9886413438290164, ch-ct-mama-katherine-2:0.9684991431484549, ch-ct-mama-katherine-1:0.9338060909624714 | 1 |
| CTX-C02 | control | prostata-con-grado | sin_evidencia | False | — | ninguno | ch-nci-prostata-prevencion-hp-en-1:0.09348820116293599, ch-nci-prostata-prevencion-hp-en-4:0.0424554980207586, ch-ct-prostata-arasens-5:0.021026934657230854 | 0 |
| CTX-C03 | control | mama-completo | con_evidencia | True | 0.8552845540944511 | ninguno | ch-pmc-mama-elacestrant-esr1-eca-1:0.8552845540944511, ch-pmc-mama-elacestrant-esr1-eca-4:0.579544392318954, ch-pmc-mama-elacestrant-esr1-eca-2:0.3248664139125293 | 1 |
| CTX-C03 | control | prostata-con-grado | sin_evidencia | False | — | ninguno | ch-pmc-prostata-cribado-personalizado-es-2:0.01227695821904882, ch-nci-prostata-deteccion-hp-en-4:0.006260687392688421, ch-pmc-prostata-cribado-personalizado-es-4:0.006039722386840555 | 0 |
| CTX-C04 | control | mama-completo | con_evidencia | True | 0.8556343061149527 | ninguno | ch-pmc-mama-elacestrant-esr1-eca-1:0.8556343061149527, ch-pmc-mama-elacestrant-esr1-eca-4:0.3904841221890407, ch-pmc-mama-elacestrant-esr1-eca-5:0.36919363767012026 | 1 |
| CTX-C04 | control | prostata-con-grado | sin_evidencia | False | — | ninguno | ch-pmc-prostata-nueva-perspectiva-cribado-es-5:0.0374089538123071, ch-nci-prostata-deteccion-hp-en-1:0.01635031702415439, ch-nci-prostata-deteccion-hp-en-4:0.01255452867271063 | 0 |
| CTX-C05 | control | mama-completo | con_evidencia | True | 0.9245508992236839 | ninguno | ch-pmc-mama-cdk46-guia-2:0.9245508992236839, ch-ct-mama-destiny-breast06-1:0.6896309829357384, ch-pmc-mama-elacestrant-esr1-eca-1:0.48618933460863634 | 1 |
| CTX-C05 | control | prostata-con-grado | sin_evidencia | False | — | ninguno | ch-pmc-prostata-cirugia-citorreductora-ma-3:0.007713627030416054, ch-pmc-prostata-volumen-nma-2:0.004179256223964568, ch-pmc-prostata-cribado-personalizado-es-4:0.0031263239005273414 | 0 |
| CTX-C06 | control | mama-completo | sin_evidencia | False | — | ninguno | ch-pmc-mama-parp-neoadyuvante-eca-3:0.2944757002538446, ch-pmc-mama-parp-neoadyuvante-eca-1:0.202673682845815, ch-pmc-mama-parp-neoadyuvante-eca-2:0.03183168008240904 | 0 |
| CTX-C06 | control | prostata-con-grado | sin_evidencia | False | — | ninguno | ch-pmc-prostata-cirugia-citorreductora-ma-3:0.007673702850845914, ch-pmc-prostata-cribado-personalizado-es-4:0.0022115158333319822, ch-pmc-prostata-niraparib-abiraterona-eca-1:0.001995870070194049 | 0 |
| CTX-C07 | control | mama-completo | sin_evidencia | False | — | ninguno | ch-ct-mama-destiny-breast06-2:0.0012627616719922458, ch-pmc-mama-trastuzumab-deruxtecan-eca-1:0.001176068461665263, ch-ct-mama-katherine-4:0.001094457948919049 | 0 |
| CTX-C07 | control | prostata-con-grado | con_evidencia | True | 0.9726665647103904 | ninguno | ch-pmc-prostata-enzalutamida-abiraterona-ma-1:0.9726665647103904, ch-pmc-prostata-talazoparib-enzalutamida-nma-1:0.9420692925676561, ch-pmc-prostata-darolutamida-rs-2:0.23044711899402828 | 1 |
| CTX-C08 | control | mama-completo | sin_evidencia | False | — | ninguno | ch-pmc-mama-linfocitos-her2-secundario-5:0.01361522459762796, ch-ct-mama-katherine-4:0.007695315824366879, ch-ct-mama-destiny-breast06-1:0.005243388591569738 | 0 |
| CTX-C08 | control | prostata-con-grado | con_evidencia | True | 0.964605944270781 | ninguno | ch-pmc-prostata-volumen-nma-2:0.964605944270781, ch-pmc-prostata-enzalutamida-abiraterona-ma-1:0.9565713311300973, ch-ct-prostata-latitude-1:0.7997834095760225 | 1 |
| CTX-C09 | control | mama-completo | sin_evidencia | False | — | ninguno | ch-pmc-mama-linfocitos-her2-secundario-5:0.0017104570832181733, ch-nci-mama-prevencion-pac-es-4:0.0013018870827973018, ch-pmc-mama-antraciclinas-rs-1:0.0009139246324827266 | 0 |
| CTX-C09 | control | prostata-con-grado | con_evidencia | True | 0.31078563573944956 | ninguno | ch-pmc-prostata-mhsp-nma-4:0.31078563573944956, ch-pmc-prostata-lu-psma-comparadores-2:0.2788132557759527, ch-pmc-prostata-cribado-personalizado-es-1:0.0721372078739255 | 1 |
| CTX-C10 | control | mama-completo | sin_evidencia | False | — | ninguno | ch-pmc-mama-tamoxifeno-eca-3:0.0013972257403133662, ch-pmc-mama-linfocitos-her2-secundario-5:0.0012646459683558822, ch-nci-mama-hp-en-2:0.0012582905824120255 | 0 |
| CTX-C10 | control | prostata-con-grado | con_evidencia | True | 0.36740763848354635 | ninguno | ch-pmc-prostata-braquiterapia-focal-rs-3:0.36740763848354635, ch-pmc-prostata-hormonoterapia-radioterapia-ma-1:0.1973944035982921, ch-ct-prostata-arasens-5:0.04886631052632341 | 1 |
| CTX-C11 | control | mama-completo | sin_evidencia | False | — | ninguno | ch-pmc-mama-parp-neoadyuvante-eca-1:0.04869650398368864, ch-nci-mama-hombre-hp-en-1:0.005408831290433336, ch-pmc-mama-adn-tumoral-metastasico-rs-3:0.0018649953794716823 | 0 |
| CTX-C11 | control | prostata-con-grado | con_evidencia | True | 0.9110396190518086 | ninguno | ch-pmc-prostata-niraparib-abiraterona-eca-1:0.9110396190518086, ch-nci-prostata-deteccion-hp-en-1:0.28436954705074247, ch-nci-prostata-prevencion-hp-en-1:0.19061891123319713 | 1 |
| CTX-C12 | control | mama-completo | con_evidencia | True | 0.9490872976568274 | ninguno | ch-pmc-mama-antraciclinas-rs-1:0.9490872976568274, ch-nci-mama-prevencion-pac-es-4:0.06048799789316352, ch-ct-mama-katherine-1:0.045710769753489415 | 1 |
| CTX-C12 | control | prostata-con-grado | sin_evidencia | False | — | ninguno | ch-pmc-prostata-cirugia-citorreductora-ma-3:0.008696174403592627, ch-pmc-prostata-nueva-perspectiva-cribado-es-5:0.0066102085940145765, ch-nci-prostata-prevencion-hp-en-1:0.0033098229086416355 | 0 |
| CTX-C13 | control | mama-completo | con_evidencia | True | 0.8804545351449024 | ninguno | ch-ct-mama-aphinity-1:0.8804545351449024, ch-pmc-mama-antraciclinas-rs-1:0.41546923118342655, ch-ct-mama-katherine-2:0.3546781153251571 | 1 |
| CTX-C13 | control | prostata-con-grado | sin_evidencia | False | — | ninguno | ch-nci-prostata-deteccion-hp-en-1:0.02586716131564192, ch-nci-prostata-prevencion-hp-en-2:0.0032721488438044355, ch-pmc-prostata-cribado-personalizado-es-4:0.003138111346472817 | 0 |
| CTX-C14 | control | mama-completo | con_evidencia | True | 0.36643217877743334 | ninguno | ch-pmc-mama-linfocitos-her2-secundario-5:0.36643217877743334, ch-pmc-mama-linfocitos-her2-secundario-1:0.03350379729581837, ch-pmc-mama-adn-tumoral-metastasico-rs-3:0.015102374225486968 | 1 |
| CTX-C14 | control | prostata-con-grado | sin_evidencia | False | — | ninguno | ch-nci-prostata-prevencion-hp-en-2:0.0016533060573233936, ch-nci-prostata-deteccion-hp-en-4:0.0007295898715866571, ch-pmc-prostata-cirugia-citorreductora-ma-2:0.0007177475546649588 | 0 |

Salidas inválidas del generador: 0. Muestra pequeña: orienta, no prueba.
