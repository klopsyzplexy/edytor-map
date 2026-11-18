# Changelog

Wszystkie zmiany w edytorze map. Numeracja w fazie alfa: `0.MINOR.PATCH`. MINOR to kolejna aktualizacja z zadań PM, a PATCH to drobna poprawka między aktualizacjami. Numer wersji jest w jednym miejscu: pole `version` w `package.json`.

## [0.5.0] – 2026-11-18

Kolizje z kształtu modelu (zadanie `docs/zadania/0.5/01-kolizje-z-modelu.md`, raport `docs/raporty/0.5.md`, zrzuty przed i po: `docs/zrzuty/0.5.0/`).

### Dodane
- **Obrys kolizji z kształtu modelu:** edytor raz dla każdego modelu wycina z geometrii pasmo od podstawy do wysokości postaci (`player.height`, z uwzględnieniem skali bazowej), rzutuje je na teren, wypełnia dziury i obrysowuje. Obrys może być wklęsły (płot w kształcie L) i mieć kilka części (dwie skały w jednym modelu); części modelu nad głową postaci (korona drzewa) nie blokują. Obrys przekształca się razem z obiektem: ułożenie z typu, skala bazowa, mnożnik, obrót i położenie (`src/core/modelCollision.ts`).
- **Okno „Obrys kolizji…”** (menu ⋯ modelu w bibliotece i przycisk w panelu właściwości obiektu z kolizją): podgląd z góry (przekrój na wysokości postaci, reszta modelu, obrys, postać dla porównania, kratka w metrach), **suwak szczegółu** (0 – prosty obrys, odrobinę większy; 1 – dokładny), **poprawka wierzchołków** (przeciąganie, dwuklik na krawędzi – nowy wierzchołek, prawy przycisk albo Delete – usunięcie), **własny narysowany kształt** (kilka wielokątów), „Przywróć obrys z modelu”. Zapis trafia do mapy (cofnij/ponów) i do biblioteki jako domyślny dla innych map.
- Panel właściwości pokazuje, skąd jest kolizja obiektu z modelem (z kształtu modelu, poprawiona, narysowana).
- Nakładka kolizji (**C**) w trybie gry wypełnia obrysy obiektów półprzezroczystym kolorem (cienkie obrysy, np. płotu, są widoczne mimo modelu).
- Przykładowe modele: `skaly.glb` (dwie nieregularne skały, druga obrócona w węźle), `plot.glb` (płot w kształcie L), `drzewo.glb` (cienki pień, szeroka korona) – „Przykładowe modele” w bibliotece.
- Testy: obrys skał, płotu i drzewa zgodny z geometrią modelu (czytaną z plików .glb), poziom szczegółu, obrót (także zapisany inaczej: 180, 30, 180 = 0, 150, 0), skala bazowa i mnożnik, obrys poprawiony i narysowany z cofaniem, pudełko gdy model niewczytany, format 5 zapis → odczyt bez strat, migracja 4 → 5, chodzenie w trybie gry wewnątrz litery L płotu (razem 123).

### Zmienione
- **Format mapy 5** (migracja z 4 bez zmian w danych): opcjonalne `models[].collision` (`detail` albo `polygons` + `source`: `edited`/`drawn`, w układzie pliku modelu); w `derived.collision` obrysy obiektów z modelem pochodzą z kształtu modelu – wielokąty mogą być wklęsłe, jeden obiekt może mieć kilka wpisów – i mają pole `source` (`model`, `edited`, `drawn`, `shape`, `bounds`). Szczegóły: `docs/formaty.md` (3.1, 3.3b, 3.7).
- Kolizja obiektu z modelem to obrys z kształtu zamiast pudełka modelu; pudełko zostaje tylko jako zastępstwo, gdy model się nie wczytał. Proste bryły ze schematu – bez zmian (ich kształt widziany z góry).
- Przejścia (`behavior: teleport`) z modelem używają obrysu z kształtu modelu (otoczki jego części).
- Biblioteka (`biblioteka.json` w projekcie i zapis roboczy) pamięta obrys kolizji modelu.
- Duża mapa testowa `docs/przyklady-map/duza-mapa.zip` w formacie 5 (z nowymi przykładowymi modelami).

### Naprawione
- **Kolizje obiektów obróconych nie pokrywały się z modelami:** prostokąt był pudełkiem modelu w jego własnym układzie, więc dla modeli, których kształt nie leży wzdłuż osi pliku (np. obrócona część w węźle modelu, ukośny płot), był przekrzywiony względem modelu i dużo większy. Teraz obrys jest liczony z geometrii i obracany dokładnie jak model (testy dla kątów 0–315° i kątów zapisanych inaczej).
- Postać nie zatrzymuje się już na pustym terenie obok modelu (wnętrze litery L płotu, obszar pod koroną drzewa, puste miejsca wokół skał, które pudełko obejmowało).

## [0.4.1] – 2026-11-17

Poprawka interfejsu od testera: menu, panele i okna zawsze mieszczą się w oknie. Zrzuty przed i po: `docs/zrzuty/0.4.1/` (okno 853 × 533 to 1280 × 800 przy skali przeglądarki 150%; 560 px – bardzo wąskie okno).

### Naprawione
- **Menu** (⋯ w bibliotece, Plik, Mapa – wszystkie menu rozwijane edytora) zawsze mieszczą się w oknie: otwierają się pod przyciskiem albo nad nim, w prawo albo w lewo – tam, gdzie jest miejsce; gdy nie ma miejsca nigdzie, są dosuwane do krawędzi okna, a długa lista przewija się w środku menu. Menu nie są już ucinane przez panel z przewijaniem; przewinięcie panelu zamyka otwarte menu, zmiana rozmiaru okna je przestawia (`src/ui/menus.ts`). Puste pola skrótu w menu „Plik” nie są już pokazywane.
- **Panele boczne** zwężają się w małym oknie i przy powiększeniu przeglądarki (lewy 180–270 px, prawy 200–310 px, widok 3D co najmniej 120 px); wcześniej poniżej ~580 px prawy panel wychodził poza okno. Przy szerokości okna od ok. 1130 px wygląd bez zmian.
- **Panel właściwości:** pola i rozwijane listy dopasowują się do szerokości panelu (odwołanie „→” zawsze widoczne), długie teksty są zawijane albo skracane z dymkiem z pełną treścią (rozwijane listy – dymek z wybraną pozycją, wiersz „Model typu”, zakładki lewego panelu).
- **Lewy panel:** suwaki, pola „Losowej wariacji”, zakładki i typy na liście obiektów nie wychodzą poza panel.
- **Okna dialogowe** nie są szersze niż okno i przewijają się w środku; w oknie „Zmień rozmiar” pole „Zachowaj proporcje” ma pole wyboru obok tekstu (było nad nim), a pola rozmiaru zwężają się; tabela normalizacji skali mieści się w wąskim oknie.
- Panel trybu gry nie wychodzi poza mały widok 3D (przewija się).

## [0.4.0] – 2026-11-17

Skala świata, rozmiar mapy, reguły i przejścia (zadanie `docs/zadania/0.4/01-skala-i-przejscia.md`, raport `docs/raporty/0.4.md`).

### Dodane
- **Skala świata** w schemacie: `scale.unitsPerMeter` (ile jednostek mapy to 1 metr); bez niego przelicznik liczony z wysokości postaci (`player.height` = 1,8 m), bez obu – 1. Ostrzeżenie walidacji, gdy przelicznik i wysokość postaci się nie zgadzają.
- **Wymiary w metrach** w panelu właściwości (w dymku – w jednostkach mapy).
- **Manekin postaci** (klawisz **M**, przycisk „Manekin”): półprzezroczysta postać w skali gracza przy kursorze i obok zaznaczonego obiektu.
- **Skala bazowa modelu i mnożnik obiektu:** skala bazowa należy do modelu (pole w panelu właściwości, menu biblioteki) i zmienia od razu wszystkie kopie modelu, także postać gracza; `scale` obiektu to jego mnożnik. Biblioteka pamięta skalę bazową i nadaje ją mapie przy pierwszym użyciu modelu.
- **Normalizacja przy imporcie:** pomiar modelu, kategorie z rozmiarami w metrach (postać 1,8 m, drzewo 6–10 m, krzew 1 m, skała 1,5 m, płot 1,2 m, budynek 10 m szerokości podstawy), zgadywanie kategorii z nazwy pliku, własny rozmiar; kategorie i rozmiary zmienia schemat (`scale.categories`). Menu modelu w bibliotece: „Skala bazowa (rozmiar w metrach)…”.
- **Losowa wariacja** przy wstawianiu: zakres mnożnika skali i losowy obrót (punkty, bryły, dekoracje z biblioteki).
- **Mapa → Zmień rozmiar…:** szerokość i długość (także w %), kotwica (środek albo róg), tryb „rozszerz” (płaski teren dookoła z wybraną warstwą i wysokością) albo „rozciągnij” (teren i położenia obiektów); gęstość siatki zachowana (albo własna liczba punktów), ostrzeżenie powyżej 1025 × 1025 punktów; jeden krok cofania.
- **Zasady liczebności:** `exactly` (dokładnie N), `min`, `max`, przedział `min`–`max`, opcjonalnie `within` (osobno w każdej strefie danego typu). Komunikat zawsze mówi, której zasady dotyczy.
- **Zachowania typów w trybie gry** (`behavior`): przejście (`teleport`, cel we właściwości typu `ref`; przyciemnienie ekranu, bez odsyłania z powrotem, brak celu – komunikat w panelu i ostrzeżenie walidacji) i strefa z komunikatem (`message`, tekst z właściwości; przy wejściu i wyjściu). Panel trybu gry pokazuje strefy pod postacią, nakładka C – strzałki od przejść do celów.
- Przykładowy schemat: `scale`, typ „Przejście”, komunikat strefy „Obszar”, zasada „najwyżej 2 generatory w każdym obszarze”, kategoria „Lampa”.
- Testy: zasady liczebności, skala w schemacie, zachowania, format 4 i skala bazowa (z cofaniem), normalizacja, wariacja, zmiana rozmiaru mapy, przejścia i strefy (razem 108).

### Zmienione
- **Format mapy 4** (migracja z 3: pusta sekcja `models`, mapa wygląda tak samo): sekcja `models` ze skalą bazową modeli; `objects[].scale` to mnożnik obiektu. Szczegóły: `docs/formaty.md` (3.1, 3.3, 3.3a).
- **Schemat:** `defaultSize` i kategorie modeli są w metrach (× przelicznik); domyślne `player.radius`, `height`, `speed`, `stepHeight` liczone w metrach × przelicznik. Przy przeliczniku 1 (dotychczasowe schematy) nic się nie zmienia. `schemaVersion` bez zmian (nowe pola opcjonalne).
- Komunikaty zasad liczebności: nowe kody `ruleCountExact`, `ruleCountRange` (obok `ruleCountMin`, `ruleCountMax`); własny komunikat ze schematu dostaje dopisek z opisem zasady.
- Pole „Skala” obiektu z modelem nazywa się „Mnożnik skali”.
- Duża mapa testowa `docs/przyklady-map/duza-mapa.zip` w formacie 4.
- Plik zadania `docs/zadania/0.4/edytor-0.4-01-skala-i-przejscia.md` → `01-skala-i-przejscia.md` (konwencja `NN-nazwa.md`).

## [0.3.0] – 2026-11-17

Tryb „zagraj tę mapę” i biblioteka modeli (zadanie `docs/zadania/0.3/01-zagraj.md`, raport `docs/raporty/0.3.md`).

### Dodane
- **Tryb gry:** przycisk „▶ Zagraj” i **F5** (start w obiekcie startowym), **Shift + F5** (start pod kursorem), **Esc** (powrót do edytora z tą samą kamerą i narzędziami; mapa się nie zmienia). Ruch: WASD/strzałki względem kamery, kliknięcie – idź do punktu, przytrzymanie – idź w stronę kursora. Kamera jak w grze, płynnie podąża za postacią, kółko przybliża w granicach ze schematu.
- Kolizje w trybie gry: lasso i linie kolizji, ściany i obiekty z flagą kolizji (także dekoracje), strome zbocza (gdy włączone w mapie), warstwy nieprzechodnie. Ślizg wzdłuż przeszkód, wejście na stopnie do `player.stepHeight`, chodzenie po mostach i powierzchniach chodliwych modeli, przejście pod wysokim mostem, spadanie z wysokości. Ruch pod górę bez zmiany szybkości.
- Postać: kapsuła albo model ze schematu z animacjami „stoi” i „idzie” (płynne przejście, obrót w stronę ruchu).
- Nakładki (**C** i pola w panelu): kolizje kolorami z legendą, strefy i ścieżki, nazwy obiektów. Panel: pozycja, wysokość stóp i terenu, nachylenie, klatki na sekundę, co blokuje ruch.
- **Biblioteka modeli** (zakładka „Biblioteka”): miniatury, wyszukiwanie, foldery, wgrywanie przez upuszczenie plików na okno, „Przykładowe modele”, usuwanie.
- **Dekoracje** (wbudowany typ `@decoration`): dowolny model z biblioteki przeciągnięty na mapę, z flagami „Kolizja” i „Chodliwy” przy obiekcie.
- **Użyj jako…** (postać gracza albo typ ze schematu) i okno **Model typu** (model, skala, obrót, przesunięcie) – zmiana zapisuje się w schemacie, z cofaniem; rola modelu widoczna w bibliotece. **Zmień typ** w panelu właściwości (dekoracja ↔ typ ze schematu, z zachowaniem modelu, pozycji, obrotu i skali).
- **Plik → Eksportuj projekt (.zip)** (mapa, schemat, foldery biblioteki, modele .glb) i otwieranie takiego projektu (menu albo upuszczenie na okno); **Plik → Pobierz schemat**.
- Schemat: sekcja `player` (model, ułożenie modelu, animacje, promień, wysokość, szybkość, stopień, typ startu), `camera.followSmoothing`, `camera.minDistance`/`maxDistance`, warstwy `passable`, `look.modelScale`/`modelOffset`/`modelRotation`. Wszystko opcjonalne (`schemaVersion` bez zmian).
- Przykłady: w schemacie – sekcja `player` i warstwa „Głęboka woda” (nieprzechodnia); modele `postac.glb` (animacje „stoi”, „idzie”), `beczka.glb`, `skrzynia.glb` (`tools/make-example-models.mjs`); duża mapa 512 × 512 z 3881 obiektami `docs/przyklady-map/duza-mapa.zip` (`tools/make-big-map.mjs`).
- Testy: ruch i kolizje trybu gry, wybór animacji, schemat gracza i warstw, modele obiektów i dekoracje, maska warstw, format 3, zmiany schematu z cofaniem, „Zmień typ”, projekt `.zip` (razem 73).

### Zmienione
- **Format mapy 3** (migracja z 2 bez zmian w danych): obiekt może mieć własny `model`; wbudowany typ `@decoration` (`props.collision`, `props.walkable`); nowa sekcja `derived.models` (lista potrzebnych modeli); `derived.blocked` obejmuje też warstwy nieprzechodnie. Szczegóły: `docs/formaty.md`.
- Obrys kolizji obiektu z modelem w `derived.collision` liczony z pudełka samego modelu (po jego ułożeniu), a nie z `defaultSize`; tak samo powierzchnie chodliwe uwzględniają ułożenie modelu.
- Ściąga skrótów: nowa sekcja „Tryb gry” (F5, Shift + F5, WASD, C, Esc).
- Plik zadania `docs/zadania/0.3/edytor-0.3-01-zagraj.md` → `01-zagraj.md` (konwencja `NN-nazwa.md`).

### Naprawione
- Wydajność dużych map: powierzchnia wody rysowana tylko w oczkach z wodą (wcześniej cała siatka terenu drugi raz), wspólne materiały prostych brył.

## [0.2.0] – 2026-11-17

Usprawnienia po pierwszych testach (zadanie `docs/zadania/0.2/01-usprawnienia.md`, raport `docs/raporty/0.2.md`).

### Dodane
- Import modeli **.gltf** (z `.bin` i teksturami, także jako `.zip`), **.fbx** i **.obj** (z `.mtl` i teksturami). Każdy model jest zamieniany na `.glb` – jeden format wewnętrzny dla mapy, zapisu roboczego i eksportu. Lista brakujących plików (np. tekstur) po imporcie. „Plik → Pobierz modele jako .glb” daje archiwum `.zip` dla gry. Schemat znajduje model po nazwie pliku bez rozszerzenia (`drzewo.fbx` pasuje do `drzewo.glb`).
- Poruszanie po dużej mapie: minimapa w rogu (cała mapa, obrys widoku kamery, kliknięcie/przeciągnięcie przenosi kamerę), przesuwanie spacją + lewym przyciskiem i strzałkami (Shift – szybciej), przybliżanie kółkiem w stronę kursora, **F** – kamera na całe zaznaczenie, **Home** – cała mapa.
- Kształty pędzla: koło, kwadrat, romb, z obrotem (`,` `.` albo suwak) i podglądem kształtu pod kursorem; siła pędzla na Shift + `[` `]`.
- Stempel z obrazu (**T**): szary obraz jako kształt wysokości, 4 przykłady (góra, płaskowyż, krater, wąwóz) i wgrywanie własnych obrazów (zapamiętywanych w wersji roboczej); opcja „szary 50% = bez zmian”, Shift odwraca, przeciąganie odbija kolejne stemple, podgląd obrazu i kierunku pod kursorem.
- Kolizje rysowane, wbudowane w edytor (działają z każdym schematem): **lasso kolizji** (**L**) – dowolny obszar z wygładzaniem, potem edycja punktów; **linia kolizji** (**K**) – ściana o ustawianej grubości wzdłuż łamanej. Przyciski „Wygładź” i „Uprość” dla ścieżek, stref i kolizji.
- Drzewo grup na liście obiektów: podgrupy, zwijanie, przeciąganie obiektów i grup (do grupy, przed obiekt, na najwyższy poziom), zmiana nazwy, zaznaczenie grupy zaznacza całą zawartość (wspólne przesuwanie, obrót, skala), ukrywanie i blokowanie dziedziczone przez podgrupy, duplikowanie i kopiowanie grup z zawartością, „Nowa grupa”, Ctrl + Shift + G.
- Skróty według tabeli z zadania: O (wstaw ostatni typ z palety), T, L, K, V, Shift + H (pokaż wszystko), Ctrl + Shift + G, Shift + `[` `]`, `,` `.`. Litera skrótu w rogu przycisków i w dymkach, ściąga pod **?** podzielona na sekcje.
- Narzędzia `tools/make-example-stamps.mjs` (przykładowe stemple) i `tools/make-import-examples.mjs` (pliki do testu importu w `docs/przyklady-importu/`).
- Testy: kształty pędzla i stempel, drzewo grup, kolizje (upraszczanie, wygładzanie, obrys bryły, maska), migracja formatu 1 → 2, rozpoznawanie plików modeli (razem 42).

### Zmienione
- **Format mapy 2** (migracja z 1 przy wczytywaniu): grupy mają pole `parent` (podgrupy); obiekty mogą mieć wbudowane typy `@collision-zone` i `@collision-line` (`props.width`); nowa sekcja `derived.collision` (wielokąty i linie z grubością w układzie mapy: lasso, linie i obrysy obiektów z `flags.collision`); `derived.blocked` obejmuje teraz także wszystkie kolizje, a nie tylko strome zbocza, i jest zapisywana, gdy mapa ma jakąkolwiek kolizję. Szczegóły: `docs/formaty.md`.
- Skróty: „Widok gry” – **V** (było C); blokowanie zaznaczonych – **Shift + L** (L to teraz lasso); **H** – ukryj zaznaczone, **Shift + H** – pokaż wszystko.
- Menu „Wczytaj modele .glb…” → „Wczytaj modele (.glb, .gltf, .fbx, .obj, .zip)…”.
- README: formaty modeli (który wybrać), poruszanie po mapie, stemple, kolizje rysowane, drzewo grup.

### Naprawione
- Promień z kursora liczony był z macierzy kamery z poprzedniej klatki (po przesunięciu kamery bez odświeżenia widoku klik mógł trafić obok).

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
