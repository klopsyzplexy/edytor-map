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

## Kryteria odbioru

- Tryb gry startuje z obiektu startowego i spod kursora, Esc wraca do edytora bez zmian w mapie.
- Postać nie przechodzi przez żaden rodzaj kolizji ani strome zbocza, chodzi po mostach i innych powierzchniach chodliwych, ślizga się wzdłuż ścian.
- Działa z kapsułą i z modelem postaci z animacjami.
- Na dużej mapie płynnie (panel pokazuje klatki na sekundę; w raporcie wynik na przykładowej dużej mapie).
