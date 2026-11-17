# Edytor map

Uniwersalny edytor map 3D, który działa w przeglądarce. Jest dla osób, które nie programują. Wszystko, co dotyczy konkretnej gry (rodzaje obiektów, ich ustawienia, warstwy terenu, zasady), pochodzi z **pliku schematu**, który dostarcza gra. Sam edytor nie zna żadnej gry.

*English: a browser-based 3D map editor driven by a game-provided schema file. The interface is available in Polish and English (switch in the top-right corner). File formats: [docs/formaty.md](docs/formaty.md).*

- Działa na komputerze z myszą i klawiaturą (telefon nie jest obsługiwany). Najlepiej w Chrome lub Edge.
- Nie potrzebuje serwera ani internetu: to zwykła strona.
- Licencja MIT.

---

## 1. Uruchomienie (pierwszy raz)

1. Zainstaluj **Node.js** w wersji 20.19 lub nowszej ze strony https://nodejs.org (wybierz „LTS”, instalator „dalej, dalej”).
2. Pobierz edytor: na stronie repozytorium kliknij zielony przycisk **Code → Download ZIP** i rozpakuj plik. Jeśli używasz gita, możesz zamiast tego wpisać `git clone https://github.com/klopsyzplexy/edytor-map.git`.
3. Otwórz terminal w folderze edytora:
   - **Windows:** otwórz folder w Eksploratorze, kliknij pasek adresu, wpisz `cmd` i naciśnij Enter;
   - **macOS:** prawy klik na folderze → „Nowy terminal w folderze”;
   - **Linux:** prawy klik w folderze → „Otwórz w terminalu”.
4. Wpisz jedną komendę i naciśnij Enter:

   ```bash
   npm start
   ```

   Za pierwszym razem komenda pobiera potrzebne pliki (może to potrwać minutę). Potem sama otwiera edytor w przeglądarce pod adresem http://localhost:5173. Terminal zostaw otwarty, dopóki pracujesz. Żeby zakończyć, naciśnij w nim `Ctrl + C`.

### Zbudowanie statycznej strony

```bash
npm run build
```

Gotowa strona trafia do folderu `dist/`. Można ją wrzucić na dowolny hosting plików (np. GitHub Pages, Netlify) albo otworzyć poleceniem `npm run preview`. Przykładowy schemat i model są w niej dostępne obok edytora.

---

## 2. Pierwsze kroki

Po pierwszym uruchomieniu edytor wczytuje **przykładowy schemat** i tworzy pustą mapę 64 × 64, więc możesz od razu próbować.

**Ekran:**

- u góry: menu **Plik**, cofnij/ponów, narzędzia, siatka, „Widok gry”, język i pomoc (**?**);
- po lewej: zakładki **Obiekty** (paleta), **Teren** (pędzle i warstwy) i **Lista** (wszystkie obiekty);
- pośrodku: widok 3D;
- po prawej: **Właściwości** zaznaczonego obiektu i **Sprawdzanie mapy** (błędy i ostrzeżenia);
- na dole: podpowiedź do bieżącego narzędzia, położenie kursora i stan zapisu.

**Poruszanie się po mapie:**

- lewy przycisk – narzędzie;
- prawy – obrót widoku;
- przesuwanie widoku: środkowy przycisk, Shift + prawy, **spacja + lewy** albo **strzałki** (z Shiftem szybciej);
- kółko – przybliżanie w stronę kursora;
- **minimapa** w prawym dolnym rogu pokazuje całą mapę i żółty obrys tego, co widzisz. Kliknij albo przeciągnij po niej, żeby przenieść kamerę;
- **F** – wyśrodkuj na zaznaczonych obiektach, **Home** – pokaż całą mapę.

Klawisz **?** (albo **F1**) otwiera ściągę ze wszystkimi skrótami. Każde narzędzie ma swój skrót w dymku i małą literę w rogu przycisku. Skróty nie działają podczas pisania w polach tekstowych.

### Teren

1. Zakładka **Teren** (albo klawisz **B**).
2. Wybierz pędzel: **Podnieś, Obniż, Wygładź, Wyrównaj, Szum** (klawisze 1–5). Ustaw rozmiar (klawisze `[` i `]`), siłę (Shift + `[` / `]`) i miękkość krawędzi.
3. Przytrzymaj lewy przycisk i maluj po terenie:
   - **Shift** odwraca podnoszenie i obniżanie;
   - **Ctrl + klik** pobiera wysokość dla pędzla „Wyrównaj”.
   - **Kształt pędzla:** koło, kwadrat albo romb. Kwadrat i romb można obracać (klawisze `,` i `.` albo suwak „Obrót”). Kształt widać na terenie pod kursorem. Siłę zmienia **Shift + `[` / `]`**.
   - **Stempel z obrazu** (klawisz **T**): wybierz obraz (Góra, Płaskowyż, Krater, Wąwóz) albo wgraj własny szary obraz i kliknij teren. Jasne miejsca podnoszą teren o ustawioną „Wysokość”. Przy opcji „Szary 50% = bez zmian” ciemne miejsca obniżają teren (tak działają Krater i Wąwóz). Shift + klik odbija stempel odwrotnie, a przeciąganie odbija kolejne co rozmiar pędzla. Pod kursorem widać podgląd: jasne podniesie, niebieskie obniży, a kreska pokazuje górę obrazu.
4. **Warstwy:** kliknij warstwę (np. Piasek, Woda) i maluj (klawisz **P**). Pierwsza warstwa to podłoże, więc malowanie nią działa jak gumka (to samo robi Shift). Woda faluje w podglądzie. Jej poziom ustawisz w polu „Poziom wody”.
5. **Strome zbocza:** zaznacz „Oznacz zbyt strome zbocza jako nieprzechodnie” i ustaw próg w stopniach. Zbyt strome miejsca zrobią się czerwone, a przy zapisie trafią do maski nieprzechodniości.

### Obiekty

1. Zakładka **Obiekty**: kliknij typ w palecie, potem kliknij teren. Obiekt przyklei się do powierzchni. Możesz klikać dalej, żeby wstawiać kolejne. **Esc** kończy wstawianie, a klawisz **O** wraca do wstawiania ostatnio wybranego typu.
2. **Ścieżki i strefy** (np. „Trasa wozu”, „Obszar”) rysujesz punkt po punkcie:
   - **Enter** albo dwuklik kończy rysowanie;
   - **Backspace** cofa ostatni punkt;
   - strefę zamyka też kliknięcie w jej pierwszy punkt.
3. **Zaznaczanie:**
   - klik zaznacza obiekt, a Shift + klik dodaje kolejny;
   - przeciągnięcie w pustym miejscu zaznacza prostokątem;
   - **Ctrl + A** zaznacza wszystko.
4. **Przesuwanie:** przeciągnij obiekt myszą po terenie albo użyj kolorowych uchwytów:
   - **W** – przesuń, **E** – obróć, **R** – skaluj;
   - **Siatka** (klawisz **X**) włącza przyciąganie do siatki o wybranym kroku;
   - **G** stawia zaznaczone obiekty z powrotem na terenie.
5. **Kopiowanie:**
   - **Ctrl + C / Ctrl + V** kopiuje i wkleja obiekty w miejscu kursora;
   - **Ctrl + D** duplikuje;
   - **Delete** usuwa.
6. **Punkty ścieżki lub strefy:** zaznacz ją i przeciągaj białe kropki. Dwuklik przy linii dodaje punkt, a Alt + klik albo Delete usuwa zaznaczony punkt.
7. **Właściwości** (panel po prawej) pochodzą ze schematu: liczby, teksty, listy, tak/nie, kolory i odwołania do innych obiektów (np. generator → jego obszar). Pola z błędem są czerwone.
8. **Lista** (zakładka po lewej) to drzewo grup:
   - **Ctrl + G** zamyka zaznaczone obiekty (i całe zaznaczone grupy) w nowej grupie; grupy mogą mieć podgrupy. **Ctrl + Shift + G** rozgrupowuje;
   - ▾ / ▸ zwija i rozwija grupę, a jej nazwę zmienisz, klikając ją;
   - **przeciąganie:** obiekt albo grupę upuść na grupę (trafi do środka), na obiekt (stanie przed nim) albo na pole na dole listy (wyjdzie z grup);
   - kliknięcie grupy zaznacza całą jej zawartość. Wtedy uchwyty przesuwają, obracają i skalują wszystkie obiekty naraz, a **Ctrl + C / Ctrl + V / Ctrl + D** kopiują grupę razem z podgrupami (przycisk ⧉ duplikuje grupę od razu);
   - ukrywanie (👁, klawisz **H**; **Shift + H** pokazuje wszystko) i blokowanie (🔒, **Shift + L**) działa także na całe grupy z podgrupami;
   - wyszukiwanie i filtr typu; dwuklik na pozycji pokazuje obiekt.
   Grupy zapisują się w pliku mapy, ale służą tylko do porządku – gra ich nie używa.
9. **Losowa wariacja** (pod paletą): gdy jest włączona, każdy wstawiony obiekt (także dekoracja z biblioteki) dostaje losowy mnożnik skali z podanego zakresu (np. 0,8–1,2) i losowy obrót. Przydaje się przy sadzeniu lasu albo rozrzucaniu kamieni.

### Skala świata i proporcje

- Schemat mówi, **ile jednostek mapy to 1 metr** (wzorcem jest postać gracza: 1,8 m). Panel właściwości pokazuje **wymiary** zaznaczonego obiektu w metrach (w dymku – w jednostkach mapy).
- **Manekin** (klawisz **M** albo przycisk „Manekin”): półprzezroczysta postać w skali gracza przy kursorze i obok zaznaczonego obiektu. Od razu widać, czy drzwi, drzewo albo beczka mają dobry rozmiar.
- **Skala bazowa modelu i mnożnik obiektu:** skala bazowa należy do modelu – jej zmiana (pole „Skala bazowa modelu” w panelu właściwości) od razu zmienia wszystkie kopie tego modelu na mapie. Każdy obiekt ma jeszcze własny **mnożnik skali** (uchwyt **R** albo pola X/Y/Z).
- **Normalizacja przy imporcie:** po wgraniu modeli edytor je mierzy i pyta, czym są (postać 1,8 m, drzewo 6–10 m, krzew 1 m, skała, płot, budynek według szerokości podstawy… albo własny rozmiar w metrach), i proponuje skalę bazową. Kategorie i rozmiary może zmienić schemat gry. Później to samo okno otwiera „Skala bazowa (rozmiar w metrach)…” w menu modelu (⋯) w bibliotece.

### Rozmiar mapy

**Mapa → Zmień rozmiar…** – nowa szerokość i długość (w jednostkach albo w procentach) i jeden z dwóch trybów:

- **Rozszerz** – obecny teren zostaje bez zmian, a dookoła powstaje płaski teren z wybraną warstwą. **Kotwica** (środek albo róg) mówi, gdzie zostaje stara część mapy. Obiekty zostają na swoim terenie.
- **Rozciągnij** – teren i położenia obiektów rozciągają się proporcjonalnie, a obiekty zachowują swój rozmiar.

Gęstość siatki terenu zostaje taka sama; przy bardzo dużej siatce okno ostrzega, że edytor i gra mogą zwolnić. **Ctrl + Z** cofa całą zmianę.

### Kolizje rysowane

W zakładce **Obiekty** (sekcja „Kolizje (edytor)”) i na pasku narzędzi są dwa narzędzia. Działają z każdym schematem gry:

- **Lasso kolizji** (klawisz **L**): przytrzymaj lewy przycisk i obrysuj obszar, do którego nie można wejść (np. jezioro, gęsty las). Po puszczeniu powstaje czerwony obszar, a edytor wraca do zaznaczania. Punkty obszaru możesz od razu przeciągać jak punkty strefy. Suwak „Wygładzanie lassa” zaokrągla kształt przy rysowaniu, a przyciski **Wygładź** i **Uprość** w panelu właściwości poprawiają go później.
- **Linia kolizji** (klawisz **K**): klikaj punkty jak przy ścieżce (Enter albo dwuklik kończy). Powstaje ściana wzdłuż linii, np. brzeg klifu albo rzeki. **Grubość** ustawisz w panelu właściwości.

Obie są widoczne tylko w edytorze (znikają w „Widoku gry”). Przy zapisie trafiają do pliku mapy razem ze ścianami kolizji i maską stromych zboczy.

### Biblioteka modeli i dekoracje

Zakładka **Biblioteka** (z lewej) pokazuje wszystkie wczytane modele z miniaturami:

- **Wgrywanie:** przycisk „Wgraj modele…” albo **upuść pliki na okno edytora** (.glb, .gltf, .fbx, .obj albo .zip z modelem). Przycisk „Przykładowe modele” wczytuje kładkę, postać z animacjami, beczkę i skrzynię.
- **Szukanie i foldery:** pole wyszukiwania (po nazwie, folderze albo roli), a w menu modelu (⋯) „Folder…” przenosi model do folderu.
- **Dekoracja:** przeciągnij model z biblioteki na mapę (albo dwuklik – wstawia na środku widoku). Powstaje obiekt „Dekoracja” – dowolny model bez logiki gry. Przy obiekcie zaznaczysz **Kolizja** (blokuje ruch) i **Chodliwy** (można po nim chodzić).
- **Użyj jako…** (menu ⋯ modelu): model postaci gracza albo model dowolnego typu ze schematu (np. generator, boss, budynek). Otworzy się okno „Model typu” z **skalą, obrotem i przesunięciem** modelu względem punktu obiektu. Zmiana zapisuje się w schemacie, bez edycji pliku JSON (Ctrl + Z cofa). Przy modelu w bibliotece widać jego rolę, np. „Gracz”, „Drzewo”.
- **Model typu…** – ten sam przycisk jest w panelu właściwości zaznaczonego obiektu.
- **Zmień typ** (panel właściwości): dekoracja może stać się obiektem typu ze schematu i odwrotnie. Model, pozycja, obrót i skala zostają, a panel pokazuje właściwości nowego typu.
- **Plik → Pobierz schemat** zapisuje schemat ze zmianami (np. przypisanymi modelami), żeby przekazać go grze.

### Tryb gry – „zagraj tę mapę”

Przycisk **▶ Zagraj** albo **F5** stawia postać w obiekcie startowym (typ wskazany w schemacie, w przykładzie „Start gracza”). **Shift + F5** stawia ją pod kursorem. **Esc** wraca do edytora z tą samą kamerą i narzędziami. Mapa w trybie gry się nie zmienia.

- **Ruch:** WASD albo strzałki (względem kamery). Kliknięcie na terenie – postać idzie do punktu; przytrzymanie przycisku – idzie w stronę kursora jak joystick. **Kółko** przybliża kamerę w granicach ze schematu.
- **Kolizje:** postać nie przejdzie przez lasso i linie kolizji, ściany i obiekty z kolizją (także dekoracje), strome zbocza (gdy w mapie włączono „Oznacz zbyt strome zbocza”) ani warstwy nieprzechodnie (np. głęboka woda). Przy ukośnym zderzeniu ślizga się wzdłuż przeszkody. Wchodzi na mosty i inne powierzchnie chodliwe oraz na stopnie do wysokości ze schematu; pod wysokim mostem przechodzi.
- **Nakładki** (klawisz **C** albo pola w panelu): kolizje kolorami (lasso, linie, obiekty, zbocza i warstwy, powierzchnie chodliwe), strefy i ścieżki, nazwy obiektów.
- **Panel** w rogu: pozycja postaci, wysokość stóp i terenu, nachylenie, liczba klatek na sekundę, to, co właśnie blokuje ruch, i strefy, w których stoi postać.
- **Przejścia i komunikaty** (jeśli schemat je ma): wejście w przejście przenosi postać do wskazanego celu (ekran na chwilę gaśnie), a wejście do strefy z komunikatem i wyjście z niej pokazuje na ekranie jej nazwę. Nakładka **C** rysuje strzałkę od przejścia do celu. Przejście bez celu – komunikat w panelu.
- Postać to kapsuła albo model ze schematu (sekcja `player`) z animacjami „stoi” i „idzie”. Model postaci ustawisz w bibliotece: „Użyj jako… → Model postaci gracza”.

### Podgląd i sprawdzanie

- **Widok gry** (klawisz **V**) ustawia kamerę jak w grze i ukrywa obiekty widoczne tylko w edytorze (np. niewidzialne ściany). Ponowne kliknięcie wraca do swobodnej kamery.
- **Sprawdzanie mapy** (prawy dolny panel) działa na bieżąco i pokazuje błędy (⛔) oraz ostrzeżenia (⚠) według zasad schematu, np. „dokładnie jeden start gracza”, „od 10 do 50 drzew” albo „najwyżej 2 generatory w każdym obszarze”. Każdy komunikat mówi, której zasady dotyczy. Kliknięcie problemu przenosi do obiektu.
- **Ctrl + Z / Ctrl + Y** cofa i ponawia każdą zmianę, także pociągnięcia pędzlem.

---

## 3. Zapisywanie i wczytywanie

- **Zapis roboczy:** edytor sam zapisuje pracę w przeglądarce kilka sekund po każdej zmianie (na dole widać „Wersja robocza zapisana …”). Po zamknięciu i ponownym otwarciu wszystko wraca. To tylko zabezpieczenie: dane leżą w tej jednej przeglądarce, na tym komputerze.
- **Plik → Zapisz mapę** (Ctrl + S) zapisuje mapę do pliku `.json`, który przekazujesz grze. W Chrome i Edge edytor pyta, gdzie zapisać, a kolejne Ctrl + S nadpisują ten sam plik. W innych przeglądarkach plik trafia do folderu „Pobrane”.
- **Plik → Otwórz mapę** (Ctrl + O) wczytuje zapisany plik. Mapa wraca dokładnie taka, jaka była.
- **Plik → Nowa mapa** pyta o nazwę, rozmiar i dokładność terenu.

Zapisany plik zawiera wszystko, czego gra potrzebuje:

- teren, warstwy i obiekty;
- ścieżki, strefy, ściany kolizji i kolizje rysowane (lasso, linie);
- maskę nieprzechodniości (strome zbocza, warstwy nieprzechodnie i wszystkie kolizje);
- listę potrzebnych modeli (same modele przekaż osobno albo w projekcie `.zip`);
- powierzchnie, po których można chodzić (np. mosty).

Opis dla programistów gry: [docs/formaty.md](docs/formaty.md).

### Schemat gry i modele

- **Plik → Wczytaj schemat gry…** – wybierz plik `.json` dostarczony przez grę. Jeśli ma błędy, edytor pokaże ich listę. Po wczytaniu możesz od razu utworzyć nową mapę.
- **Plik → Użyj przykładowego schematu** wraca do schematu do nauki (`examples/schemat-przyklad.json`).
- **Plik → Wczytaj modele…** – jeśli schemat używa modeli 3D, wskaż ich pliki. Edytor dopasuje je po nazwie pliku (bez rozszerzenia, więc `drzewo.fbx` pasuje do `drzewo.glb` w schemacie) i zapamięta w wersji roboczej.
- **Plik → Pobierz modele jako .glb** – wszystkie wczytane modele w jednym archiwum `.zip`, w formacie, którego używa gra.
- **Plik → Eksportuj projekt (.zip)** – mapa, schemat, foldery biblioteki i wszystkie modele w jednym archiwum. Taki plik otworzysz przez „Plik → Otwórz mapę…” albo upuszczając go na okno – wraca wszystko, także biblioteka. Przykład: `docs/przyklady-map/duza-mapa.zip` (duża mapa do sprawdzania płynności).

### Formaty modeli – który wybrać?

Edytor wczytuje cztery formaty, ale każdy model od razu zamienia na **.glb**. Dzięki temu mapa i gra zawsze używają jednego formatu.

| Format | Co to jest | Co wskazać przy wczytywaniu |
|---|---|---|
| **.glb** | Jeden plik ze wszystkim w środku (siatka, materiały, tekstury). | Sam plik. |
| **.gltf** | To samo co .glb, tylko rozbite na kilka plików: `.gltf` (opis), `.bin` (siatka) i obrazki tekstur. | Wszystkie pliki naraz albo jeden `.zip`. |
| **.fbx** | Popularny format z Blendera, Mayi i sklepów z modelami. Tekstury bywają w środku albo obok. | Plik `.fbx` i tekstury (albo `.zip`). |
| **.obj** | Stary, prosty format: tylko kształt. Kolory i tekstury są w osobnym pliku `.mtl` i obrazkach. | Plik `.obj`, `.mtl` i tekstury (albo `.zip`). |

**Wybieraj .glb**, jeśli tylko się da (w Blenderze: *File → Export → glTF 2.0*, opcja „glTF Binary”). Pozostałe formaty też zadziałają. Jeśli czegoś zabraknie (np. tekstury), edytor powie, którego pliku brakuje, i wczyta model bez niego. Najprościej wtedy spakować cały folder modelu do `.zip` i wskazać to archiwum.

---

## 4. Dla programistów

- `npm test` – testy formatu (zapis → odczyt daje to samo), walidacji, terenu i historii.
- Struktura `src/`:
  - `core/` – czyste dane i logika bez DOM: schemat, mapa, format pliku, teren, walidacja, historia, tryb gry, przejścia, zmiana rozmiaru mapy, normalizacja skali;
  - `render/` – scena Three.js;
  - `tools/` – narzędzia myszy;
  - `ui/` – panele i okna;
  - `storage/` – zapis roboczy i pliki;
  - `i18n/` – tłumaczenia.
- Zasady projektu: [CLAUDE.md](CLAUDE.md). Zmiany: [CHANGELOG.md](CHANGELOG.md).
- `node tools/make-example-glb.mjs` odtwarza przykładowy model `examples/modele/kladka.glb`, `node tools/make-example-models.mjs` – postać z animacjami, beczkę i skrzynię (`examples/modele/`), `node tools/make-example-stamps.mjs` – przykładowe stemple `examples/stemple/*.png`, a `node tools/make-big-map.mjs` – dużą mapę `docs/przyklady-map/duza-mapa.zip`.
