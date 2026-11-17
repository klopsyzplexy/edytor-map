# Formaty plików: schemat gry i mapa

Ten dokument jest dla twórców gier. Opisuje dwa pliki JSON:

- **schemat gry** – gra go dostarcza; mówi edytorowi, jakie obiekty, właściwości, warstwy terenu i zasady istnieją;
- **plik mapy** – zapisuje go edytor; gra go wczytuje.

Edytor nie zna żadnej gry. Wszystko, co dotyczy konkretnej gry, jest w schemacie.

Przykład do nauki: [`examples/schemat-przyklad.json`](../examples/schemat-przyklad.json). W zbudowanej stronie leży obok edytora jako `schemat-przyklad.json`.

---

## 1. Układ współrzędnych i jednostki

- Ziemia to płaszczyzna **X–Z**, wysokość to oś **Y** (jak w Three.js).
- Mapa zajmuje prostokąt `x ∈ [0, szerokość]`, `z ∈ [0, głębokość]`. Początek układu jest w rogu mapy.
- Gra 2D (np. Gainer) traktuje współrzędną edytora `(x, z)` jako swoje `(x, y)`.
- Jednostki mapy są takie same jak w grze. Pole `units` w schemacie służy tylko do wyświetlania.
- **Skala świata** (od 0.4): schemat mówi, ile jednostek mapy to 1 metr (`scale.unitsPerMeter`, 2.1b). Edytor pokazuje wymiary obiektów w metrach, a rozmiary w schemacie (`defaultSize`, kategorie modeli) podaje się w metrach. Rozmiar mapy i położenia obiektów są zawsze w jednostkach mapy i nie zależą od przelicznika.
- Obroty zapisujemy w **stopniach**, jako kąty Eulera w kolejności **XYZ**. To ta sama konwencja co `THREE.Euler(x, y, z, 'XYZ')`, czyli macierz `R = Rx · Ry · Rz`.

---

## 2. Schemat gry

```jsonc
{
  "schemaVersion": 1,            // wersja formatu schematu (obecnie 1)
  "id": "gainer",                // identyfikator gry: litery, cyfry, _ . -
  "name": { "pl": "Gainer", "en": "Gainer" },
  "version": "1.0",              // wersja schematu nadana przez grę (dowolny napis)
  "units": "m",
  "scale": { "unitsPerMeter": 1, "categories": [ { "id": "lampa", "name": "Lampa", "size": 3, "measure": "height" } ] },
  "camera": { "pitchDeg": 55, "yawDeg": 0, "distance": 40, "fovDeg": 45, "followSmoothing": 0.15, "minDistance": 15, "maxDistance": 90 },
  "player": { "model": "modele/postac.glb", "radius": 0.4, "height": 1.8, "speed": 6, "stepHeight": 0.4, "startType": "start" },
  "mapDefaults": { "size": [64, 64], "resolution": 129, "height": 0, "waterLevel": 0.4, "slopeMaxDeg": 40 },
  "terrainLayers": [ … ],
  "objectTypes": [ … ],
  "rules": [ … ]
}
```

**Teksty** (`name`, `category`, `hint`, nazwy opcji, komunikaty zasad) mogą być zwykłym napisem albo obiektem z wersjami językowymi, np. `{ "pl": "Most", "en": "Bridge" }`. Edytor pokazuje wersję w języku interfejsu. Gdy jej nie ma, pokazuje angielską, a potem pierwszą dostępną.

### 2.1. Kamera gry (`camera`)

Przycisk „Widok gry” ustawia kamerę według tych pól:

| Pole | Znaczenie | Domyślnie |
|---|---|---|
| `pitchDeg` | nachylenie od poziomu w stopniach (90 = prosto z góry) | 50 |
| `yawDeg` | obrót wokół osi pionowej; przy 0 kamera stoi po stronie +Z i patrzy w stronę −Z, więc góra ekranu to mniejsze `z` (jak w obrazie 2D) | 0 |
| `distance` | odległość kamery od punktu, na który patrzy | 30 |
| `fovDeg` | pionowe pole widzenia | 50 |
| `followSmoothing` | tryb gry: czas w sekundach, w jakim kamera dogania postać (0 = bez opóźnienia) | 0,15 |
| `minDistance`, `maxDistance` | tryb gry: granice przybliżania kółkiem myszy (odległość kamery) | `distance` × 0,4 i × 2,5 |

### 2.1a. Postać gracza (`player`) – tryb „zagraj tę mapę”

Cała sekcja i wszystkie pola są opcjonalne. Służą tylko do podglądu w edytorze; gra może je czytać, ale nie musi.

```json
"player": {
  "model": "modele/postac.glb",
  "modelScale": 1, "modelOffset": [0, 0, 0], "modelRotation": [0, 0, 0],
  "animations": { "idle": "stoi", "walk": "idzie" },
  "radius": 0.4, "height": 1.8, "speed": 6, "stepHeight": 0.4,
  "startType": "start"
}
```

| Pole | Znaczenie | Domyślnie |
|---|---|---|
| `model` | model postaci (jak `look.model`, 2.6); bez modelu edytor pokazuje kapsułę o promieniu `radius` i wysokości `height` | brak |
| `modelScale`, `modelOffset`, `modelRotation` | ułożenie modelu względem stóp postaci (jak przy typach, 2.6); przód modelu to kierunek +Z | 1, [0,0,0], [0,0,0] |
| `animations.idle`, `animations.walk` | nazwy animacji „stoi” i „idzie” w modelu. Bez nich edytor szuka animacji po nazwach (`idle`, `stand`, `stoi`… oraz `walk`, `run`, `idzie`…), a gdy jest tylko jedna – używa jej do chodzenia | brak |
| `radius`, `height` | rozmiar postaci do kolizji w jednostkach mapy (koło o promieniu `radius` na ziemi; `height` decyduje, czy postać mieści się pod mostem). `height` to wzorzec skali: odpowiada 1,8 m (2.1b) | 0,4 m i 1,8 m × przelicznik |
| `speed` | szybkość w jednostkach mapy na sekundę; pod górę bez zmian | 5 m/s × przelicznik |
| `stepHeight` | najwyższy stopień, na który postać wchodzi (krawężnik, schodek, wejście na most) | 0,35 m × przelicznik |
| `startType` | typ obiektu, w którym postać zaczyna (pierwszy obiekt tego typu w mapie); musi istnieć w `objectTypes` | brak – start na środku mapy |

Model postaci korzysta też ze skali bazowej swojego modelu zapisanej w mapie (`models`, 3.3a).

### 2.1b. Skala świata (`scale`) – od 0.4

```json
"scale": {
  "unitsPerMeter": 1,
  "categories": [
    { "id": "drzewo", "size": 12 },
    { "id": "lampa", "name": { "pl": "Lampa", "en": "Lamp" }, "size": 3, "measure": "height" }
  ]
}
```

| Pole | Znaczenie | Domyślnie |
|---|---|---|
| `unitsPerMeter` | ile jednostek mapy to 1 metr (np. gra 2D z pikselami: 32) | patrz niżej |
| `categories` | kategorie modeli do normalizacji przy imporcie: rozmiar docelowy w metrach | kategorie domyślne edytora |

**Skąd przelicznik:** pole `scale.unitsPerMeter`; gdy go nie ma, a schemat podaje `player.height`, przelicznik = `player.height / 1,8` (wzorcem jest postać o wysokości 1,8 m); bez obu – 1. Gdy schemat podaje oba pola, a postać wychodzi według przelicznika wyraźnie inna niż 1,8 m (o ponad 10%), walidacja mapy pokazuje ostrzeżenie.

**Co zależy od przelicznika:** rozmiary prostych brył (`defaultSize` w metrach, 2.4), domyślne rozmiary i szybkość postaci (2.1a), wymiary w metrach w panelu właściwości, proponowana skala modeli przy imporcie. Rozmiar mapy, położenia obiektów i plik mapy – nie.

**Kategorie** (`categories`, każde pole poza `id` opcjonalne): `id`, `name` (tekst; kategorie domyślne mają nazwy w tłumaczeniach edytora), `size` – rozmiar docelowy w metrach, `min` i `max` – zakres w metrach (model w zakresie zostaje bez zmian, poza nim dostaje najbliższą granicę), `measure` – co mierzymy: `height` (wysokość) albo `width` (szerokość podstawy: większy z boków X, Z). Kategoria o `id` takim jak domyślna zastępuje jej pola; nowe `id` dodaje kategorię.

Kategorie domyślne:

| `id` | rozmiar | mierzone |
|---|---|---|
| `postac` | 1,8 m | wysokość |
| `drzewo` | 8 m, zakres 6–10 m | wysokość |
| `krzew` | 1 m | wysokość |
| `skala` | 1,5 m | wysokość |
| `plot` | 1,2 m | wysokość |
| `budynek` | 10 m | szerokość podstawy |

**Normalizacja przy imporcie:** po wczytaniu modeli edytor mierzy każdy z nich, zgaduje kategorię z nazwy pliku (np. `oak_tree` → drzewo) i proponuje **skalę bazową** = rozmiar docelowy × przelicznik / zmierzony wymiar. Można wybrać inną kategorię, „bez zmian” albo wpisać własny rozmiar w metrach. Skala bazowa należy do modelu (3.3a), a każdy obiekt ma jeszcze własny mnożnik (`scale`). To samo okno otwiera „Skala bazowa (rozmiar w metrach)…” w menu modelu w bibliotece.

### 2.2. Domyślne ustawienia nowej mapy (`mapDefaults`)

`size` [szerokość, głębokość], `resolution` (liczba punktów terenu na dłuższym boku), `height` (początkowa wysokość terenu), `waterLevel` (poziom wody) i `slopeMaxDeg` (próg stromych zboczy). Wszystkie pola są opcjonalne.

### 2.3. Warstwy terenu (`terrainLayers`)

Najwyżej 8 warstw. **Pierwsza warstwa jest podłożem:** nowa mapa jest nią w całości pokryta, a malowanie podłożem działa jak gumka.

```json
{ "id": "woda", "name": { "pl": "Woda", "en": "Water" }, "color": "#2f6f9e", "water": true }
```

| Pole | Znaczenie |
|---|---|
| `id` | identyfikator, unikalny w schemacie |
| `name` | nazwa w palecie |
| `color` | kolor `#rrggbb` |
| `texture` | (opcjonalnie) adres obrazka tekstury; powtarza się co `textureScale` jednostek (domyślnie 4) |
| `water` | `true` = woda: w podglądzie faluje animowana powierzchnia |
| `passable` | `false` = postać tędy nie przejdzie (np. głęboka woda); takie miejsca trafiają do maski `derived.blocked` (3.5). Domyślnie `true` |

### 2.4. Typy obiektów (`objectTypes`)

```json
{
  "id": "generator",
  "name": { "pl": "Generator", "en": "Spawner" },
  "category": { "pl": "Rozgrywka", "en": "Gameplay" },
  "kind": "point",
  "look": { "shape": "box", "color": "#e0623a" },
  "defaultSize": [1.5, 1, 1.5],
  "flags": { "collision": true, "visibleInGame": true, "walkable": false },
  "hint": { "pl": "Podpowiedź w palecie", "en": "Palette tooltip" },
  "properties": [ … ],
  "behavior": { "type": "teleport", "target": "cel" }
}
```

| Pole | Znaczenie |
|---|---|
| `kind` | rodzaj obiektu: `point` (punkt, np. generator), `solid` (bryła, np. ściana kolizji, most), `path` (ścieżka – polilinia, np. trasa wozu), `zone` (strefa – wielokąt, np. obszar generatora) |
| `category` | grupa w palecie |
| `look.shape` | prosta bryła w edytorze: `box`, `cylinder`, `sphere`, `cone` |
| `look.color` | kolor w edytorze (dla ścieżek i stref – kolor linii) |
| `look.model` | (opcjonalnie) model `.glb` – patrz 2.6 |
| `look.modelScale`, `look.modelOffset`, `look.modelRotation` | (opcjonalnie) ułożenie modelu względem punktu obiektu – patrz 2.6 |
| `defaultSize` | rozmiar prostej bryły [X, Y, Z] **w metrach** (od 0.4; w jednostkach mapy = `defaultSize` × przelicznik, 2.1b); podstawa bryły leży na ziemi (y = 0 w układzie obiektu). Przy przeliczniku 1 nic się nie zmienia |
| `flags.collision` | blokuje ruch (informacja dla gry) |
| `flags.visibleInGame` | `false` = obiekt widoczny tylko w edytorze (np. niewidzialna ściana). W edytorze jest półprzezroczysty, a w „Widoku gry” znika |
| `flags.walkable` | gracz może po nim chodzić (np. most) – patrz 3.6 |
| `behavior` | (opcjonalnie, od 0.4) zachowanie w trybie gry – patrz 2.4a |

### 2.4a. Zachowania w trybie gry (`behavior`) – od 0.4

Uniwersalne zachowania, które edytor pokazuje w trybie „zagraj tę mapę”. Gra może je czytać ze schematu i zrobić u siebie po swojemu.

```json
{ "id": "przejscie", "kind": "point", "behavior": { "type": "teleport", "target": "cel" },
  "properties": [ { "id": "cel", "name": "Cel", "type": "ref", "refTypes": ["przejscie", "start"] } ] }
{ "id": "obszar", "kind": "zone", "behavior": { "type": "message", "text": "nazwa" },
  "properties": [ { "id": "nazwa", "name": "Nazwa", "type": "text" } ] }
```

| `type` | Pole | Znaczenie |
|---|---|---|
| `teleport` (przejście) | `target` – id właściwości typu `ref` | Wejście postaci w obiekt (punkt i bryła: obrys widziany z góry, wystarczy go dotknąć; strefa: jej wielokąt) przenosi postać do obiektu wskazanego tą właściwością (strefa i ścieżka – do środka ich wierzchołków), z krótkim przyciemnieniem ekranu. Przejście w miejscu docelowym nie odsyła postaci od razu z powrotem: działa dopiero po wyjściu z niego i ponownym wejściu. Brak celu: komunikat w panelu trybu gry i ostrzeżenie walidacji. |
| `message` (strefa z komunikatem) | `text` – id właściwości z tekstem | Tylko dla stref (`kind: "zone"`). Wejście środka postaci do strefy pokazuje na ekranie tekst z tej właściwości (pusty – nazwę obiektu), a wyjście – „Wychodzisz: …”. |

Panel trybu gry pokazuje strefy (wszystkich typów stref), w których stoi postać, a nakładka (C, „Strefy i ścieżki”) rysuje łuk ze strzałką od każdego przejścia do jego celu.

### 2.5. Właściwości (`properties`)

Z nich edytor buduje panel „Właściwości typu”.

| `type` | Pole w edytorze | Wartość w pliku mapy |
|---|---|---|
| `number` | liczba (`min`, `max`, `step`; `step: 1` = liczby całkowite) | liczba |
| `text` | tekst (`min`/`max` = długość) | napis |
| `enum` | wybór z listy `options` | `value` wybranej opcji |
| `bool` | tak/nie | `true` / `false` |
| `color` | kolor | `"#rrggbb"` |
| `ref` | odwołanie do innego obiektu; `refTypes` zawęża dozwolone typy | `id` wskazanego obiektu albo `null` |

Wspólne pola: `id`, `name`, `default` (wartość nowego obiektu), `required` (puste pole = błąd), `hint`.

```json
{ "id": "rodzaj", "name": "Rodzaj", "type": "enum", "default": "zwykly",
  "options": [ { "value": "zwykly", "name": { "pl": "Zwykły", "en": "Common" } }, "boss" ] }
```

Opcję można zapisać krótko jako napis (`"boss"`): wtedy wartość i nazwa są takie same.

### 2.6. Modele (`look.model`)

`look.model` to adres pliku modelu: `.glb`, `.gltf`, `.fbx` albo `.obj`. **Formatem wewnętrznym edytora jest `.glb`** (binarny glTF 2.0): każdy inny format edytor zamienia na `.glb` przy wczytaniu. Grze najlepiej przekazać właśnie pliki `.glb` („Plik → Pobierz modele jako .glb” daje archiwum `.zip` ze wszystkimi wczytanymi modelami).

Edytor szuka modelu w tej kolejności:

1. wśród modeli wskazanych przez użytkownika („Plik → Wczytaj modele…”), po **nazwie pliku bez katalogu i rozszerzenia** – `modele/drzewo.glb` w schemacie pasuje do wczytanego `drzewo.fbx` (po zamianie to `drzewo.glb`); dzięki temu działa schemat wczytany z dysku;
2. pod adresem względem strony edytora albo pod pełnym adresem URL. Dla `.gltf` i `.obj` pliki towarzyszące (`.bin`, `.mtl`, tekstury) muszą leżeć obok, pod adresami wskazanymi w pliku.

Przy wczytywaniu z dysku pliki towarzyszące (`.bin`, `.mtl`, tekstury `.png/.jpg/.webp/.tga…`) dobierane są po nazwie, bez względu na katalogi. Można też wskazać archiwum `.zip`. Gdy czegoś brakuje, edytor pokazuje listę brakujących plików i wczytuje model bez nich (brak `.bin` w `.gltf` uniemożliwia wczytanie). Materiały Phong/Lambert z `.fbx` i `.obj` są zamieniane na materiały PBR glTF (kolor, tekstura, przezroczystość; połysk przybliżony szorstkością).

**Ułożenie modelu** (opcjonalne, w `look`): `modelScale` – liczba albo `[x, y, z]`; `modelRotation` – `[x, y, z]` w stopniach (XYZ); `modelOffset` – `[x, y, z]` w jednostkach mapy. Punkt modelu `p` trafia do układu obiektu jako `offset + R(rotation) · (modelScale · baseScale · p)`, gdzie `baseScale` to skala bazowa modelu z pliku mapy (3.3a, domyślnie 1). Potem działa położenie, obrót i skala (mnożnik) obiektu. Edytor ustawia te pola w oknie „Model typu” (przypisanie modelu z biblioteki bez edycji pliku; „Plik → Pobierz schemat” zapisuje zmieniony schemat).

Model ma własne wymiary, a obiekt mnoży je przez swoją skalę (`defaultSize` dotyczy tylko prostej bryły). Dopóki model się wczytuje albo gdy wczytać się go nie da, edytor pokazuje zastępczą bryłę z `look.shape` i `defaultSize`. Wczytane pliki modeli trafiają do zapisu roboczego w przeglądarce.

### 2.7. Zasady walidacji mapy (`rules`)

```json
{ "type": "count", "objectType": "start", "min": 1, "max": 1, "level": "error",
  "message": { "pl": "Mapa musi mieć dokładnie jeden start gracza.", "en": "…" } }
{ "type": "minDistance", "objectType": "generator", "otherType": "start", "distance": 6, "level": "warning" }
```

| `type` | Znaczenie |
|---|---|
| `count` | liczebność obiektów typu `objectType`: `exactly` (dokładnie N), `min` (co najmniej N), `max` (co najwyżej N) albo `min` i `max` razem (przedział N–M). Liczby całkowite ≥ 0; `exactly` nie łączy się z `min`/`max`. `min` = `max` oznacza „dokładnie”. Opcjonalne `within` (id typu strefy) – liczba liczona osobno w każdej strefie tego typu (obiekty, których środek leży w strefie), np. „najwyżej 2 generatory w każdym obszarze” |
| `minDistance` | obiekty `objectType` muszą być od siebie (albo od obiektów `otherType`) dalej niż `distance`; odległość liczona po ziemi, od środków obiektów |

```json
{ "type": "count", "objectType": "skrzynia", "exactly": 3, "level": "error" }
{ "type": "count", "objectType": "drzewo", "min": 10, "max": 50, "level": "warning" }
{ "type": "count", "objectType": "generator", "max": 2, "within": "obszar", "level": "warning" }
```

`level`: `error` (błąd) albo `warning` (ostrzeżenie). `message` (opcjonalnie) zastępuje standardowy komunikat. Komunikat zasady liczebności zawsze kończy się opisem zasady, której dotyczy (np. „– zasada: od 10 do 50 × „Drzewo””, a w strefie: „… w strefie „Polana””). Za mało obiektów: wpis wskazuje strefę (zasada z `within`) albo pierwszy obiekt typu; za dużo: każdy nadmiarowy obiekt osobno.

Poza zasadami ze schematu edytor zawsze sprawdza:

- wymagane pola i zakresy `min`/`max`;
- wartości spoza listy i błędne kolory;
- odwołania do nieistniejących obiektów albo obiektów złego typu;
- ścieżki krótsze niż 2 punkty i strefy z mniej niż 3 punktami;
- przejścia bez celu (2.4a) i niezgodność przelicznika z wysokością postaci (2.1b) – ostrzeżenia;
- obiekty poza mapą;
- nieznane typy i warstwy.

Gdy schemat ma błędy, edytor pokazuje ich pełną listę i nie wczytuje go.

---

## 2a. Zmiana rozmiaru mapy (bez zmiany formatu)

„Mapa → Zmień rozmiar…” zmienia `settings.size`, `settings.resolution`, `terrain` i położenia obiektów; kształt pliku zostaje ten sam.

- **Rozszerz:** stary teren zostaje bez zmian w miejscu wyznaczonym przez kotwicę (środek albo róg; przesunięcie wyrównane do oczka siatki), dookoła powstaje płaski teren o wybranej wysokości z wybraną warstwą. Obiekty przesuwają się razem z terenem. Przy zmniejszaniu brzegi terenu są odcinane, a obiekty zostają (walidacja pokaże te poza mapą).
- **Rozciągnij:** teren i położenia obiektów (także wierzchołki ścieżek i stref) skalują się proporcjonalnie do nowego rozmiaru; rozmiary, obroty i mnożniki obiektów się nie zmieniają.
- Gęstość siatki terenu zostaje taka sama (oczko o tym samym rozmiarze), chyba że użytkownik poda inną liczbę punktów. Powyżej 1025 × 1025 punktów okno ostrzega o wydajności.

---

## 3. Plik mapy

Jeden plik JSON. Przykład w skrócie:

```jsonc
{
  "format": "edytor-map",
  "formatVersion": 4,
  "editorVersion": "0.4.0",
  "schema": { "id": "przyklad", "version": "1.0" },
  "settings": {
    "name": "Polana",
    "size": [64, 64],
    "resolution": [129, 129],
    "waterLevel": 0.4,
    "slope": { "enabled": true, "maxDeg": 40 }
  },
  "terrain": {
    "resolution": [129, 129],
    "encoding": "base64",
    "heights": "AAAAAAAA…",
    "layers": { "trawa": "////…", "woda": "AAAA…" }
  },
  "groups": [
    { "id": "g1", "name": "Las", "parent": null, "hidden": false, "locked": false },
    { "id": "g2", "name": "Polana", "parent": "g1", "hidden": false, "locked": false }
  ],
  "objects": [
    { "id": "o1", "type": "generator", "name": "generator-1", "group": null, "hidden": false, "locked": false,
      "position": [20, 1.5, 7.5], "rotation": [0, 45, 0], "scale": [1, 1, 1],
      "props": { "nazwa": "Gniazdo", "liczba": 3, "obszar": "o2" } },
    { "id": "o2", "type": "obszar", "name": "obszar-1", "group": null, "hidden": false, "locked": false,
      "position": [0, 0, 0], "rotation": [0, 0, 0], "scale": [1, 1, 1],
      "points": [[1, 0, 1], [10, 0, 1], [10, 0.5, 10]], "props": { "nazwa": "" } },
    { "id": "o4", "type": "@collision-line", "name": "collision-line-1", "group": null, "hidden": false, "locked": false,
      "position": [0, 0, 0], "rotation": [0, 0, 0], "scale": [1, 1, 1],
      "points": [[30, 0, 2], [40, 0, 2], [40, 0, 12]], "props": { "width": 2.5 } },
    { "id": "o6", "type": "@decoration", "name": "decoration-1", "group": null, "hidden": false, "locked": false,
      "position": [12, 1, 30], "rotation": [0, 90, 0], "scale": [1, 1, 1],
      "props": { "collision": true, "walkable": false }, "model": "modele/beczka.glb" }
  ],
  "models": {
    "modele/beczka.glb": { "baseScale": 0.5 }
  },
  "derived": {
    "blocked": "AAAA…",
    "walkable": [ { "objectId": "o3", "type": "most", "triangles": [ … ] } ],
    "collision": [
      { "objectId": "o4", "type": "@collision-line", "shape": "line", "points": [[30, 2], [40, 2], [40, 12]], "width": 2.5 },
      { "objectId": "o5", "type": "sciana", "shape": "polygon", "points": [[9, 9.8], [11, 9.8], [11, 10.2], [9, 10.2]] }
    ],
    "models": ["modele/beczka.glb", "modele/kladka.glb"]
  }
}
```

### 3.1. Wersja formatu

`formatVersion` rośnie przy każdej zmianie kształtu pliku. Edytor wczytuje starsze wersje (migracje w `src/core/format.ts`). Pliku nowszego niż sam edytor nie otworzy i poprosi o aktualizację edytora.

| Wersja | Edytor | Zmiany |
|---|---|---|
| 1 | 0.1.0 | pierwsza wersja |
| 2 | 0.2.0 | grupy z podgrupami (`groups[].parent`); wbudowane typy kolizji `@collision-zone` i `@collision-line`; sekcja `derived.collision`; `derived.blocked` obejmuje też wszystkie kolizje (3.5). Migracja 1 → 2: każda grupa dostaje `parent: null`. |
| 3 | 0.3.0 | własny model obiektu (`objects[].model`); wbudowany typ `@decoration`; sekcja `derived.models`; `derived.blocked` obejmuje też warstwy nieprzechodnie. Migracja 2 → 3: bez zmian w danych (nowe pola są opcjonalne). |
| 4 | 0.4.0 | sekcja `models` – skala bazowa modeli (3.3a); `objects[].scale` to od teraz mnożnik obiektu (dla modelu: razem ze skalą bazową modelu). Migracja 3 → 4: pusta sekcja `models` (skala bazowa 1), więc stare mapy wyglądają tak samo. |

### 3.2. Teren – dlaczego w tym samym pliku

Teren zapisujemy **w tym samym pliku JSON jako base64**, a nie jako obrazy obok:

- **bez strat:** wysokości to liczby `Float32`, a zwykły PNG ma tylko 8 bitów na kanał. Przeglądarka nie zapisuje wygodnie 16-bitowych PNG, więc obraz zgubiłby dokładność, a obieg zapis → odczyt nie dawałby tego samego;
- **jeden plik:** łatwo go przenosić, wysyłać i wersjonować; nie da się zgubić obrazka;
- rozmiar jest rozsądny: przy siatce 257 × 257 wysokości zajmują około 350 KB.

Siatka ma `nx × nz` punktów (`terrain.resolution`). Punkt `(i, j)` leży w `x = i · szerokość / (nx − 1)`, `z = j · głębokość / (nz − 1)`, a jego indeks w tablicach to `j · nx + i`. Pierwszy wiersz to `z = 0`.

| Pole | Zawartość |
|---|---|
| `terrain.heights` | `nx · nz` liczb `Float32` **little-endian**, zakodowanych base64 |
| `terrain.layers.<id>` | dla każdej warstwy `nx · nz` bajtów (0–255), waga warstwy w punkcie, base64 |

Wagi warstw mieszamy proporcjonalnie: udział warstwy = waga / suma wag w punkcie. Warstwa wodna (`water: true` w schemacie) to woda. Jej powierzchnia leży na wysokości `max(settings.waterLevel, teren)`.

Odczyt w JavaScript:

```js
function decodeF32(b64) {
  const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
  const dv = new DataView(bytes.buffer);
  return Float32Array.from({ length: bytes.length / 4 }, (_, i) => dv.getFloat32(i * 4, true));
}
const decodeU8 = (b64) => Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
```

### 3.3. Obiekty

Każdy obiekt ma: `id` (unikalny w mapie), `type` (id typu ze schematu), `name`, `group` (id grupy albo `null`), `hidden` i `locked` (tylko dla edytora), `position`, `rotation` (stopnie, XYZ), `scale` i `props` (wartości właściwości ze schematu, klucz = id właściwości).

`scale` to **mnożnik obiektu** [X, Y, Z]: dla prostej bryły mnoży `defaultSize` (po przeliczeniu na jednostki mapy), a dla modelu – model po jego skali bazowej (3.3a) i ułożeniu z typu.

- **Punkt i bryła:** `position` to położenie podstawy obiektu. Bryła o rozmiarze `defaultSize × scale` stoi na tym punkcie, obrócona o `rotation`.
- **Ścieżka i strefa:** `points` to wierzchołki w układzie mapy, w kolejności rysowania. Strefa jest zamknięta: ostatni punkt łączy się z pierwszym. `position`, `rotation` i `scale` są wtedy nieużywane.
- **Ściany kolizji** to zwykłe obiekty rodzaju `solid` z `flags.collision = true` (w przykładzie typ `sciana`, niewidoczny w grze).
- **Kolizje rysowane** to obiekty wbudowanych typów edytora. Działają z każdym schematem i nie trzeba ich w nim deklarować. Ich `type` zaczyna się od `@`, czego nie może mieć typ ze schematu:
  - `@collision-zone` – obszar nieprzechodni narysowany lassem: wielokąt w `points` (jak strefa);
  - `@collision-line` – ściana wzdłuż łamanej w `points` (jak ścieżka), z grubością `props.width` w jednostkach mapy.

  Obie są widoczne tylko w edytorze. Gra nie musi czytać tych obiektów: ich kształty są w `derived.collision` (3.7) i w masce `derived.blocked` (3.5).
- **Dekoracje** (`@decoration`, wbudowany typ edytora, od formatu 3) – dowolny model z biblioteki bez logiki gry. Model jest w polu `model` obiektu, a flagi w `props.collision` (blokuje ruch) i `props.walkable` (można po nim chodzić). Gra może je narysować jak zwykły model; ich kolizje i powierzchnie są już w `derived`.
- **Własny model obiektu** (`model`, opcjonalnie, od formatu 3) – odwołanie do pliku modelu, np. `"modele/beczka.glb"`, które zastępuje `look.model` typu. Ma je każda dekoracja, a także obiekt typu ze schematu, który powstał z dekoracji przez „Zmień typ”. Taki model stoi w punkcie obiektu bez ułożenia z typu (bez `modelScale`/`modelOffset`/`modelRotation`); działają tylko położenie, obrót i skala obiektu.

### 3.3a. Skala bazowa modeli (`models`) – od formatu 4

```json
"models": {
  "modele/beczka.glb": { "baseScale": 0.5 },
  "modele/postac.glb": { "baseScale": 0.01 }
}
```

Klucz to odwołanie do modelu (jak w `objects[].model` i `look.model`; edytor dopasowuje je po nazwie pliku bez katalogu i rozszerzenia). `baseScale` (liczba dodatnia) to skala bazowa modelu: zwykle wynik normalizacji do rozmiaru w metrach (2.1b). Działa na **wszystkie** kopie modelu w mapie: na dekoracje, obiekty z własnym modelem, obiekty typów z tym modelem (`look.model`) i na postać gracza (`player.model`). Model, którego nie ma w `models`, ma skalę bazową 1.

Punkt pliku modelu `p` trafia na mapę tak: `położenie + R(obrót obiektu) · (scale · (modelOffset + R(modelRotation) · (modelScale · baseScale · p)))`. Dla własnego modelu obiektu (3.3) `modelOffset`, `modelRotation` i `modelScale` są zerowe/jedynkowe.

Zmiana skali bazowej w edytorze (pole „Skala bazowa modelu” w panelu właściwości albo okno normalizacji w bibliotece) zmienia od razu wszystkie kopie i jest jednym krokiem cofania. Biblioteka edytora pamięta skalę bazową modelu (`biblioteka.json`, 3.7a) i nadaje ją mapie, gdy model pojawia się w niej pierwszy raz.

### 3.4. Grupy

`groups` to lista grup: `id`, `name`, `parent` (id grupy nadrzędnej albo `null` – podgrupy tworzą drzewo), `hidden`, `locked`. Obiekt należy do grupy przez swoje pole `group`. Grupy służą tylko do porządkowania w edytorze i nie mają znaczenia dla gry. Ukrycie albo zablokowanie grupy działa na całą jej zawartość, także w podgrupach. Kolejność w `groups` i `objects` to kolejność w drzewie edytora.

### 3.5. Maska nieprzechodniości (`derived.blocked`)

Maska ma tę samą siatkę co teren: `nx · nz` bajtów, base64. `255` oznacza „nie można przejść”, a `0` – „można przejść”. Edytor zapisuje ją, gdy jest w niej cokolwiek do oznaczenia. Punkt siatki ma `255`, jeśli:

- w mapie włączono „Oznacz zbyt strome zbocza” (`settings.slope.enabled`) i zbocze w tym punkcie jest bardziej strome niż `settings.slope.maxDeg`. Nachylenie liczymy z różnic wysokości sąsiednich punktów;
- punkt leży w którymkolwiek kształcie z `derived.collision` (3.7): w obszarze lassa, w pasie linii kolizji albo w obrysie obiektu z `flags.collision`;
- (od 0.3) warstwy nieprzechodnie (`passable: false` w schemacie) mają w punkcie co najmniej połowę sumy wag wszystkich warstw.

Wchodzenie pod górę nie zmienia szybkości; gra używa maski tylko jako „przejść / nie przejść”. Dokładność maski to oczko siatki terenu. Gdy gra potrzebuje dokładniejszych kształtów, bierze je z `derived.collision`.

### 3.6. Powierzchnie chodliwe (`derived.walkable`)

Dla każdego obiektu typu z `flags.walkable = true` edytor zapisuje trójkąty w układzie mapy: `triangles` to płaska lista `[x, y, z, x, y, z, x, y, z, …]`, po 9 liczb na trójkąt.

- **Prosta bryła:** górna ściana bryły (dla walca – koło z 16 trójkątów), po obrocie i skali.
- **Model `.glb`:** siatki, które mają `walkable` w nazwie (ich ściany skierowane choć trochę do góry). Gdy model takich siatek nie ma – wszystkie prawie poziome ściany modelu skierowane do góry.

Gra liczy wysokość ruchu jako **najwyższą z terenu i powierzchni chodliwych** pod postacią.

### 3.7. Kształty kolizji (`derived.collision`)

Lista wszystkich kolizji w mapie, w układzie mapy na ziemi `(x, z)`:

| Pole | Znaczenie |
|---|---|
| `objectId`, `type` | obiekt, z którego pochodzi kształt |
| `shape` | `polygon` – wielokąt (zamknięty: ostatni punkt łączy się z pierwszym); `line` – łamana |
| `points` | wierzchołki `[x, z]` |
| `width` | tylko dla `line`: grubość ściany; nieprzechodnie jest wszystko w odległości ≤ `width / 2` od łamanej |

Skąd się biorą kształty:

- `@collision-zone` → `polygon` z punktami lassa;
- `@collision-line` → `line` z grubością `props.width`;
- obiekty typów z `flags.collision = true` i dekoracje z `props.collision = true`: strefa (`zone`) → `polygon`, ścieżka (`path`) → `line` (grubość z właściwości `width`, gdy typ ją ma, inaczej 1); punkt i bryła → `polygon` – obrys widziany z góry (otoczka wypukła bryły po obrocie i skali). Dla modelu (od 0.3) to pudełko samego modelu po jego ułożeniu i obrocie obiektu; gdy model nie jest wczytany – pudełko `defaultSize`.

### 3.7a. Modele potrzebne mapie (`derived.models`) i eksport projektu

`derived.models` to lista odwołań do wszystkich modeli, których mapa używa: własnych modeli obiektów i modeli typów obiektów obecnych w mapie, np. `["modele/beczka.glb", "modele/kladka.glb"]`. Odwołania są względne: plik leży w katalogu `modele/` obok mapy.

**Jak przekazać modele grze – wybór:** sama mapa (`.json`) zawiera tylko odwołania, a pliki modeli są obok. „Plik → Eksportuj projekt (.zip)” tworzy archiwum:

```
mapa.json         – plik mapy (jak zwykły zapis, z derived)
schemat.json      – schemat (ze zmianami zrobionymi w edytorze, np. przypisane modele)
biblioteka.json   – foldery, skale bazowe i kategorie modeli w bibliotece (tylko dla edytora)
modele/*.glb      – wszystkie modele z biblioteki edytora
```

Nie wpisujemy modeli do pliku mapy jako base64 (jak teren), bo modele bywają duże (megabajty tekstur), base64 powiększa je o jedną trzecią, a gra zwykle trzyma modele osobno i używa ich w wielu mapach. Archiwum `.zip` można otworzyć w edytorze („Plik → Otwórz mapę…”): wraca mapa, schemat i cała biblioteka modeli.

### 3.8. Co edytor robi z `derived` przy wczytywaniu

Sekcja `derived` to dane pochodne dla gry. Przy wczytywaniu edytor ją pomija i liczy od nowa przy kolejnym zapisie. Dzięki temu nie może się rozjechać z resztą mapy. Wszystko inne wraca bez strat: zapis → odczyt → zapis daje identyczny plik (sprawdzają to testy w `tests/format.test.ts`).
