# 0.3 / 01 – Tryb „zagraj tę mapę”

Cel: sprawdzić mapę od środka bez eksportu do gry – chodzenie postacią po terenie z prawdziwymi kolizjami, w kamerze takiej jak w grze. Bez walki i bez logiki gry (edytor zostaje uniwersalny).

## Ustawienia ze schematu

Schemat dostaje sekcję **gracz** (wszystko opcjonalne, z rozsądnymi wartościami domyślnymi):
- model postaci (.glb itp., z animacjami „stoi” i „idzie”, jeśli są) albo prosta kapsuła;
- promień i wysokość postaci (do kolizji), szybkość ruchu, maksymalny stopień, na który postać wchodzi (np. krawężnik, schodek);
- kamera gry (już jest w schemacie): kąt, odległość, płynność podążania;
- typ obiektu będący startem gracza (np. „start”).
Warstwy terenu dostają właściwość **przechodnia** (np. głęboka woda: nie).

## Uruchomienie

- Przycisk „Zagraj” i klawisz **F5**: start w obiekcie startowym; **Shift+F5**: start w miejscu pod kursorem.
- **Esc** kończy tryb gry i przywraca kamerę i narzędzia edytora; mapa nie zmienia się w trybie gry.

## Ruch i kolizje

- Sterowanie: WASD lub strzałki; kliknięcie albo przytrzymanie myszy na terenie – postać idzie w tym kierunku (podobnie do joysticka na telefonie).
- Postać chodzi po terenie i po **powierzchniach chodliwych** (wysokość = najwyższa z terenu i powierzchni pod postacią), wchodzi na stopnie do ustawionej wysokości.
- Blokują: ściany kolizji, strefy z lassa, linie kolizji, maska stromych zboczy, obiekty z flagą kolizji, warstwy nieprzechodnie. Postać ślizga się wzdłuż przeszkód (nie zatrzymuje się w miejscu przy ukośnym zderzeniu).
- Ruch pod górę bez zmiany szybkości.

## Podgląd w trybie gry

- Kamera jak w grze, płynnie podąża za postacią; kółko myszy przybliża w ustalonych granicach.
- Nakładki do włączenia (klawisz **C**): kolizje (wszystkie rodzaje, kolorami), strefy i ścieżki, nazwy obiektów.
- Mały panel: pozycja postaci, wysokość terenu, nachylenie pod postacią, liczba klatek na sekundę.
- Przeciwnicy i inne obiekty stoją jako modele (bez zachowań).

## Biblioteka modeli (dodatkowo w tej wersji)

Dziś model można przypisać tylko w schemacie do typu obiektu. Potrzebne:
- **panel Biblioteka:** wszystkie wczytane modele z miniaturami, wyszukiwaniem i folderami; wgrywanie przez przeciągnięcie plików do okna;
- **dekoracje:** dowolny model z biblioteki można przeciągnąć na mapę jako obiekt dekoracyjny (bez logiki gry, z flagami kolizja i chodliwy do ustawienia przy obiekcie); wbudowany, uniwersalny typ „dekoracja”, niezależny od schematu;
- **przypisanie modelu do typu ze schematu z poziomu interfejsu** (bez edycji pliku JSON): wybór modelu, skala, obrót i przesunięcie względem punktu obiektu; zmiana zapisuje się w schemacie;
- **„Użyj jako…”** przy modelu w bibliotece: wybór roli – model postaci gracza (sekcja gracz w schemacie) albo dowolny typ ze schematu (np. generator, boss, budynek); model przy typie ma oznaczenie roli w bibliotece;
- **„Zmień typ”** przy obiekcie na mapie: dekoracja może stać się obiektem typu ze schematu (i odwrotnie), z zachowaniem modelu, pozycji, obrotu i skali; panel pokazuje wtedy właściwości wybranego typu;
- biblioteka zapisuje się razem z projektem; eksport mapy zawiera odwołania do modeli i spakowane modele (opisz wybór w dokumentacji).

## Kryteria odbioru

- Wczytany model widać w bibliotece; można go postawić na mapie jako dekorację i przypisać do typu obiektu bez edycji pliku.

- Tryb gry startuje z obiektu startowego i spod kursora, Esc wraca do edytora bez zmian w mapie.
- Postać nie przechodzi przez żaden rodzaj kolizji ani strome zbocza, chodzi po mostach i innych powierzchniach chodliwych, ślizga się wzdłuż ścian.
- Działa z kapsułą i z modelem postaci z animacjami.
- Na dużej mapie płynnie (panel pokazuje klatki na sekundę; w raporcie wynik na przykładowej dużej mapie).
