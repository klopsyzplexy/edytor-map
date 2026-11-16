# Changelog

Wszystkie zmiany w edytorze map. Numeracja w fazie alfa: `0.MINOR.PATCH`. MINOR to kolejna aktualizacja z zadań PM, a PATCH to drobna poprawka między aktualizacjami. Numer wersji jest w jednym miejscu: pole `version` w `package.json`.

## [0.1.1] – 2026-11-17

### Naprawione
- `npm start` / `npm run dev` zgłaszał błąd „Assets in public directory cannot be imported from JavaScript”: przykłady z `examples/` są teraz udostępniane przez własną wtyczkę Vite (w trybie dev pod tym samym adresem, w buildzie jako pliki), zamiast przez `publicDir`.

## [0.1.0] – 2026-11-16

Podstawy edytora (zadanie `docs/zadania/0.1/01-podstawy.md`, raport `docs/raporty/0.1.md`).

### Dodane
- Schemat gry (JSON): typy obiektów (punkt, bryła, ścieżka, strefa), wygląd (prosta bryła lub model .glb), domyślny rozmiar, flagi (kolizja, widoczny w grze, chodliwy), właściwości (liczba, tekst, lista, tak/nie, kolor, odwołanie) z wartością domyślną i walidacją, warstwy terenu (kolor/tekstura, woda), kamera gry, zasady mapy (`count`, `minDistance`), domyślne ustawienia nowej mapy. Pełna lista błędów przy wczytaniu złego schematu.
- Przykładowy schemat do nauki `examples/schemat-przyklad.json` i model `examples/modele/kladka.glb`.
- Teren z mapą wysokości (rozmiar i dokładność przy tworzeniu mapy); pędzle podnieś, obniż, wygładź, wyrównaj (Ctrl + klik pobiera wysokość), szum; rozmiar, siła, miękkość.
- Malowanie do 8 warstw z mieszaniem; warstwa wody z animowaną powierzchnią i poziomem wody.
- Strome zbocza: próg w stopniach, podgląd na czerwono, maska nieprzechodniości w zapisanym pliku.
- Obiekty: paleta, wstawianie z przyklejaniem do terenu, przeciąganie po terenie, uchwyty przesuń/obróć/skaluj (też dla wielu obiektów), siatka z przyciąganiem, zaznaczanie prostokątem, kopiuj/wklej w miejscu kursora, duplikuj, usuń, postaw na terenie.
- Ścieżki i strefy: rysowanie punktów, przeciąganie, dodawanie i usuwanie wierzchołków.
- Panel właściwości generowany ze schematu; lista obiektów z wyszukiwaniem, filtrem typu, grupami, ukrywaniem i blokowaniem.
- Kamera swobodna i „widok gry” (kąt, odległość, pole widzenia ze schematu; ukrywa obiekty tylko dla edytora).
- Cofnij/ponów wszystkich zmian (także pędzli), skróty klawiszowe z ekranem pomocy (F1), podpowiedzi przy narzędziach.
- Walidacja na bieżąco: lista błędów i ostrzeżeń, kliknięcie przenosi do obiektu, błędne pola na czerwono.
- Plik mapy (JSON, `formatVersion` 1): ustawienia, teren (base64), grupy, obiekty z właściwościami, ścieżki, strefy, ściany kolizji; dane dla gry: maska nieprzechodniości i powierzchnie chodliwe (górna ściana bryły albo siatka „walkable” modelu). Import bez strat.
- Zapis roboczy w IndexedDB (z modelami), zapis i otwieranie plików (File System Access API w Chrome/Edge, w innych przeglądarkach wgranie/pobranie).
- Interfejs po polsku i angielsku (przełącznik, pliki `src/i18n/pl.json`, `en.json`).
- README dla nie-programistów, `docs/formaty.md`, `npm start`.
- Testy: format (zapis → odczyt → zapis daje identyczny plik), walidacja mapy i schematu, teren, historia, wklejanie z odwołaniami, zgodność obrotu z Three.js, zgodność tłumaczeń.

## [0.0.0] – 2026-11-16

Szkielet projektu.

### Dodane
- Pusty projekt Vite + TypeScript (strict) + Three.js: scena z siatką i numerem wersji „Edytor map alfa 0.0.0”.
- Polecenia `npm run dev`, `npm run build`, `npm run preview`, `npm test` (Vitest).
- `CLAUDE.md` z zasadami projektu, licencja MIT, struktura `docs/zadania/<wersja>/` i `docs/raporty/`.
