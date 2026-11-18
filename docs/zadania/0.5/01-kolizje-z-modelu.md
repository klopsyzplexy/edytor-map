# Wersja 0.5 (kolizje z kształtu modelu)

Problem: kolizja obiektów to prostokąt z bryły ograniczającej, większy niż model (na zrzutach testera także źle obrócony), więc postać zatrzymuje się na pustym terenie.

1) Kolizja z modelu: dla każdego modelu w bibliotece wylicz raz obrys kolizji – przekrój geometrii w paśmie wysokości od podstawy do wysokości postaci (ze schematu), rzutowany na płaszczyznę terenu i zamieniony na uproszczony wielokąt (może być wklęsły; kilka osobnych wielokątów, jeśli model ma kilka części, np. dwie skały). Obrys przekształca się razem z obiektem (położenie, obrót, skala bazowa i mnożnik).
2) Poziom szczegółu obrysu do ustawienia (suwak uproszczenia) z podglądem; ręczna poprawka: edycja wierzchołków obrysu dla modelu w bibliotece i możliwość zastąpienia go narysowanym kształtem.
3) Tryb gry i nakładka kolizji (C) używają nowych obrysów; dla prostych brył ze schematu kolizja jak ich kształt.
4) Eksport: obrysy kolizji obiektów zapisane w mapie (w układzie świata), żeby gra używała dokładnie tego samego; podnieś wersję formatu z migracją i opisz zmianę w docs/formaty.md.
5) Popraw obrót kolizji obiektów obróconych (dziś prostokąty nie pokrywają się z modelami).

Testy: obrys skały i płotu zgodny z modelem, obrót i skala, eksport–import bez strat. Commit po każdym etapie z prefiksem 0.5.0, na koniec raport docs/raporty/0.5.md ze zrzutami przed i po, git push.
