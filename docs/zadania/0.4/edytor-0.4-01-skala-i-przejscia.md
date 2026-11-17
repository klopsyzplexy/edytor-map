# 0.4 / 01 – Skala świata, rozmiar mapy, reguły i przejścia

## 1. Skala świata (dotyczy postaci, budynków i wszystkich modeli – nie mapy)

- **Przelicznik w schemacie:** ile jednostek mapy to 1 metr (domyślnie 1). Wzorcem jest postać: jej wysokość w sekcji gracz podana w jednostkach mapy odpowiada 1,8 m. Edytor pokazuje wymiary obiektów w metrach (i w jednostkach mapy w dymku), a rozmiar mapy nie zależy od przelicznika.
- **Manekin postaci** (klawisz **M**): półprzezroczysta postać w skali gracza przy kursorze i obok zaznaczonego obiektu.
- **Normalizacja przy imporcie:** edytor mierzy model i proponuje skalę bazową według kategorii z rozmiarami docelowymi w metrach (postać 1,8 m, drzewo 6–10 m, krzew 1 m, skała, płot, budynek według szerokości podstawy); można wpisać własny rozmiar. Kategorie i rozmiary w schemacie, z wartościami domyślnymi w edytorze.
- **Skala bazowa modelu i mnożnik obiektu osobno:** skala bazowa należy do modelu w bibliotece, a postawiony obiekt ma własny mnożnik. Zmiana skali bazowej zmienia od razu wszystkie kopie modelu na mapie.
- **Losowa wariacja** przy stawianiu wielu dekoracji: zakres skali i losowy obrót.
- Typy ze schematu z prostą bryłą (bez modelu) też korzystają z przelicznika (domyślne rozmiary w metrach).

## 2. Zmiana rozmiaru mapy

- „Mapa → Zmień rozmiar…”: nowa szerokość i długość (także w procentach), punkt zakotwiczenia (środek albo róg).
- Dwa tryby: **rozszerz** (nowy teren dookoła, płaski, z wybraną warstwą; obiekty zostają na miejscu względem kotwicy) albo **rozciągnij** (teren i pozycje obiektów skalowane proporcjonalnie, rozmiary obiektów bez zmian).
- Rozdzielczość siatki terenu dopasowana do nowego rozmiaru (z ostrzeżeniem o wydajności powyżej ustalonego progu); cofanie przez Ctrl + Z.

## 3. Reguły walidacji

Schemat obsługuje liczebność typu: **dokładnie N, co najmniej N, co najwyżej N, przedział N–M** (także w obrębie strefy, jeśli schemat tak określi). Komunikaty walidacji mówią, której reguły dotyczą.

## 4. Zachowania w trybie gry (ze schematu, uniwersalne)

- **Przejście:** typ może mieć zachowanie „przejście” z właściwością wskazującą obiekt docelowy (odwołanie). Wejście postaci w obiekt przenosi ją do celu (krótkie przyciemnienie ekranu). Brak celu – komunikat w panelu.
- **Strefa z komunikatem:** typ strefy może mieć zachowanie „komunikat”: wejście i wyjście ze strefy pokazuje na ekranie tekst z wybranej właściwości (np. nazwa obszaru). Panel trybu gry pokazuje strefy, w których stoi postać.
- Nakładka trybu gry (C) zaznacza przejścia strzałką do celu.

## Kryteria odbioru

- Postać i modele mają poprawne proporcje po ustawieniu przelicznika; manekin, normalizacja i skala bazowa działają.
- Mapę można powiększyć (np. o 50–100% boku) w obu trybach bez utraty obiektów.
- Wszystkie rodzaje reguł liczebności działają.
- Przejście przenosi postać do celu; strefy pokazują komunikaty przy wejściu i wyjściu.
- Dokumentacja formatów zaktualizowana (nowe pola schematu, zmiany formatu mapy z migracją).
