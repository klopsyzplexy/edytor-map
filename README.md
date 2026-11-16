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

**Mysz w widoku 3D:**

- lewy przycisk – narzędzie;
- prawy – obrót widoku; Shift + prawy albo środkowy – przesuwanie;
- kółko – przybliżanie.

Klawisz **F1** (albo **?**) pokazuje wszystkie skróty.

### Teren

1. Zakładka **Teren** (albo klawisz **B**).
2. Wybierz pędzel: **Podnieś, Obniż, Wygładź, Wyrównaj, Szum** (klawisze 1–5). Ustaw rozmiar (klawisze `[` i `]`), siłę i miękkość krawędzi.
3. Przytrzymaj lewy przycisk i maluj po terenie:
   - **Shift** odwraca podnoszenie i obniżanie;
   - **Ctrl + klik** pobiera wysokość dla pędzla „Wyrównaj”.
   - **Kształt pędzla:** koło, kwadrat albo romb. Kwadrat i romb można obracać (klawisze `,` i `.` albo suwak „Obrót”). Kształt widać na terenie pod kursorem. Siłę zmienia **Shift + `[` / `]`**.
   - **Stempel z obrazu** (klawisz **T**): wybierz obraz (Góra, Płaskowyż, Krater, Wąwóz) albo wgraj własny szary obraz i kliknij teren. Jasne miejsca podnoszą teren o ustawioną „Wysokość”. Przy opcji „Szary 50% = bez zmian” ciemne miejsca obniżają teren (tak działają Krater i Wąwóz). Shift + klik odbija stempel odwrotnie, a przeciąganie odbija kolejne co rozmiar pędzla. Pod kursorem widać podgląd: jasne podniesie, niebieskie obniży, a kreska pokazuje górę obrazu.
4. **Warstwy:** kliknij warstwę (np. Piasek, Woda) i maluj (klawisz **P**). Pierwsza warstwa to podłoże, więc malowanie nią działa jak gumka (to samo robi Shift). Woda faluje w podglądzie. Jej poziom ustawisz w polu „Poziom wody”.
5. **Strome zbocza:** zaznacz „Oznacz zbyt strome zbocza jako nieprzechodnie” i ustaw próg w stopniach. Zbyt strome miejsca zrobią się czerwone, a przy zapisie trafią do maski nieprzechodniości.

### Obiekty

1. Zakładka **Obiekty**: kliknij typ w palecie, potem kliknij teren. Obiekt przyklei się do powierzchni. Możesz klikać dalej, żeby wstawiać kolejne. **Esc** kończy wstawianie.
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
8. **Lista** (zakładka po lewej):
   - wyszukiwanie i filtr typu;
   - grupy (**Ctrl + G**);
   - ukrywanie (👁, klawisz **H**) i blokowanie (🔒, klawisz **L**), także całych grup;
   - dwuklik na pozycji pokazuje obiekt.

### Podgląd i sprawdzanie

- **Widok gry** (klawisz **C**) ustawia kamerę jak w grze i ukrywa obiekty widoczne tylko w edytorze (np. niewidzialne ściany). Ponowne kliknięcie wraca do swobodnej kamery.
- **Sprawdzanie mapy** (prawy dolny panel) działa na bieżąco i pokazuje błędy (⛔) oraz ostrzeżenia (⚠) według zasad schematu, np. „dokładnie jeden start gracza”. Kliknięcie problemu przenosi do obiektu.
- **Ctrl + Z / Ctrl + Y** cofa i ponawia każdą zmianę, także pociągnięcia pędzlem.

---

## 3. Zapisywanie i wczytywanie

- **Zapis roboczy:** edytor sam zapisuje pracę w przeglądarce kilka sekund po każdej zmianie (na dole widać „Wersja robocza zapisana …”). Po zamknięciu i ponownym otwarciu wszystko wraca. To tylko zabezpieczenie: dane leżą w tej jednej przeglądarce, na tym komputerze.
- **Plik → Zapisz mapę** (Ctrl + S) zapisuje mapę do pliku `.json`, który przekazujesz grze. W Chrome i Edge edytor pyta, gdzie zapisać, a kolejne Ctrl + S nadpisują ten sam plik. W innych przeglądarkach plik trafia do folderu „Pobrane”.
- **Plik → Otwórz mapę** (Ctrl + O) wczytuje zapisany plik. Mapa wraca dokładnie taka, jaka była.
- **Plik → Nowa mapa** pyta o nazwę, rozmiar i dokładność terenu.

Zapisany plik zawiera wszystko, czego gra potrzebuje:

- teren, warstwy i obiekty;
- ścieżki, strefy i ściany kolizji;
- maskę stromych zboczy;
- powierzchnie, po których można chodzić (np. mosty).

Opis dla programistów gry: [docs/formaty.md](docs/formaty.md).

### Schemat gry i modele

- **Plik → Wczytaj schemat gry…** – wybierz plik `.json` dostarczony przez grę. Jeśli ma błędy, edytor pokaże ich listę. Po wczytaniu możesz od razu utworzyć nową mapę.
- **Plik → Użyj przykładowego schematu** wraca do schematu do nauki (`examples/schemat-przyklad.json`).
- **Plik → Wczytaj modele…** – jeśli schemat używa modeli 3D, wskaż ich pliki. Edytor dopasuje je po nazwie pliku (bez rozszerzenia, więc `drzewo.fbx` pasuje do `drzewo.glb` w schemacie) i zapamięta w wersji roboczej.
- **Plik → Pobierz modele jako .glb** – wszystkie wczytane modele w jednym archiwum `.zip`, w formacie, którego używa gra.

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
  - `core/` – czyste dane i logika bez DOM: schemat, mapa, format pliku, teren, walidacja, historia;
  - `render/` – scena Three.js;
  - `tools/` – narzędzia myszy;
  - `ui/` – panele i okna;
  - `storage/` – zapis roboczy i pliki;
  - `i18n/` – tłumaczenia.
- Zasady projektu: [CLAUDE.md](CLAUDE.md). Zmiany: [CHANGELOG.md](CHANGELOG.md).
- `node tools/make-example-glb.mjs` odtwarza przykładowy model `examples/modele/kladka.glb`, a `node tools/make-example-stamps.mjs` – przykładowe stemple `examples/stemple/*.png`.
