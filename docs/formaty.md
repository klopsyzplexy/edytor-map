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
- Jednostki są takie same jak w grze. Pole `units` w schemacie służy tylko do wyświetlania.
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
  "camera": { "pitchDeg": 55, "yawDeg": 0, "distance": 40, "fovDeg": 45 },
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
  "properties": [ … ]
}
```

| Pole | Znaczenie |
|---|---|
| `kind` | rodzaj obiektu: `point` (punkt, np. generator), `solid` (bryła, np. ściana kolizji, most), `path` (ścieżka – polilinia, np. trasa wozu), `zone` (strefa – wielokąt, np. obszar generatora) |
| `category` | grupa w palecie |
| `look.shape` | prosta bryła w edytorze: `box`, `cylinder`, `sphere`, `cone` |
| `look.color` | kolor w edytorze (dla ścieżek i stref – kolor linii) |
| `look.model` | (opcjonalnie) model `.glb` – patrz 2.6 |
| `defaultSize` | rozmiar prostej bryły [X, Y, Z]; podstawa bryły leży na ziemi (y = 0 w układzie obiektu) |
| `flags.collision` | blokuje ruch (informacja dla gry) |
| `flags.visibleInGame` | `false` = obiekt widoczny tylko w edytorze (np. niewidzialna ściana). W edytorze jest półprzezroczysty, a w „Widoku gry” znika |
| `flags.walkable` | gracz może po nim chodzić (np. most) – patrz 3.6 |

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

Model ma własne wymiary, a obiekt mnoży je przez swoją skalę (`defaultSize` dotyczy tylko prostej bryły). Dopóki model się wczytuje albo gdy wczytać się go nie da, edytor pokazuje zastępczą bryłę z `look.shape` i `defaultSize`. Wczytane pliki modeli trafiają do zapisu roboczego w przeglądarce.

### 2.7. Zasady walidacji mapy (`rules`)

```json
{ "type": "count", "objectType": "start", "min": 1, "max": 1, "level": "error",
  "message": { "pl": "Mapa musi mieć dokładnie jeden start gracza.", "en": "…" } }
{ "type": "minDistance", "objectType": "generator", "otherType": "start", "distance": 6, "level": "warning" }
```

| `type` | Znaczenie |
|---|---|
| `count` | liczba obiektów typu `objectType` musi mieścić się w `min`…`max` (każde z pól opcjonalne) |
| `minDistance` | obiekty `objectType` muszą być od siebie (albo od obiektów `otherType`) dalej niż `distance`; odległość liczona po ziemi, od środków obiektów |

`level`: `error` (błąd) albo `warning` (ostrzeżenie). `message` (opcjonalnie) zastępuje standardowy komunikat.

Poza zasadami ze schematu edytor zawsze sprawdza:

- wymagane pola i zakresy `min`/`max`;
- wartości spoza listy i błędne kolory;
- odwołania do nieistniejących obiektów albo obiektów złego typu;
- ścieżki krótsze niż 2 punkty i strefy z mniej niż 3 punktami;
- obiekty poza mapą;
- nieznane typy i warstwy.

Gdy schemat ma błędy, edytor pokazuje ich pełną listę i nie wczytuje go.

---

## 3. Plik mapy

Jeden plik JSON. Przykład w skrócie:

```jsonc
{
  "format": "edytor-map",
  "formatVersion": 2,
  "editorVersion": "0.2.0",
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
      "points": [[30, 0, 2], [40, 0, 2], [40, 0, 12]], "props": { "width": 2.5 } }
  ],
  "derived": {
    "blocked": "AAAA…",
    "walkable": [ { "objectId": "o3", "type": "most", "triangles": [ … ] } ],
    "collision": [
      { "objectId": "o4", "type": "@collision-line", "shape": "line", "points": [[30, 2], [40, 2], [40, 12]], "width": 2.5 },
      { "objectId": "o5", "type": "sciana", "shape": "polygon", "points": [[9, 9.8], [11, 9.8], [11, 10.2], [9, 10.2]] }
    ]
  }
}
```

### 3.1. Wersja formatu

`formatVersion` rośnie przy każdej zmianie kształtu pliku. Edytor wczytuje starsze wersje (migracje w `src/core/format.ts`). Pliku nowszego niż sam edytor nie otworzy i poprosi o aktualizację edytora.

| Wersja | Edytor | Zmiany |
|---|---|---|
| 1 | 0.1.0 | pierwsza wersja |
| 2 | 0.2.0 | grupy z podgrupami (`groups[].parent`); wbudowane typy kolizji `@collision-zone` i `@collision-line`; sekcja `derived.collision`; `derived.blocked` obejmuje też wszystkie kolizje (3.5). Migracja 1 → 2: każda grupa dostaje `parent: null`. |

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

- **Punkt i bryła:** `position` to położenie podstawy obiektu. Bryła o rozmiarze `defaultSize × scale` stoi na tym punkcie, obrócona o `rotation`.
- **Ścieżka i strefa:** `points` to wierzchołki w układzie mapy, w kolejności rysowania. Strefa jest zamknięta: ostatni punkt łączy się z pierwszym. `position`, `rotation` i `scale` są wtedy nieużywane.
- **Ściany kolizji** to zwykłe obiekty rodzaju `solid` z `flags.collision = true` (w przykładzie typ `sciana`, niewidoczny w grze).
- **Kolizje rysowane** to obiekty wbudowanych typów edytora. Działają z każdym schematem i nie trzeba ich w nim deklarować. Ich `type` zaczyna się od `@`, czego nie może mieć typ ze schematu:
  - `@collision-zone` – obszar nieprzechodni narysowany lassem: wielokąt w `points` (jak strefa);
  - `@collision-line` – ściana wzdłuż łamanej w `points` (jak ścieżka), z grubością `props.width` w jednostkach mapy.

  Obie są widoczne tylko w edytorze. Gra nie musi czytać tych obiektów: ich kształty są w `derived.collision` (3.8) i w masce `derived.blocked` (3.5).

### 3.4. Grupy

`groups` to lista grup: `id`, `name`, `parent` (id grupy nadrzędnej albo `null` – podgrupy tworzą drzewo), `hidden`, `locked`. Obiekt należy do grupy przez swoje pole `group`. Grupy służą tylko do porządkowania w edytorze i nie mają znaczenia dla gry. Ukrycie albo zablokowanie grupy działa na całą jej zawartość, także w podgrupach. Kolejność w `groups` i `objects` to kolejność w drzewie edytora.

### 3.5. Maska nieprzechodniości (`derived.blocked`)

Maska ma tę samą siatkę co teren: `nx · nz` bajtów, base64. `255` oznacza „nie można przejść”, a `0` – „można przejść”. Edytor zapisuje ją, gdy jest w niej cokolwiek do oznaczenia. Punkt siatki ma `255`, jeśli:

- w mapie włączono „Oznacz zbyt strome zbocza” (`settings.slope.enabled`) i zbocze w tym punkcie jest bardziej strome niż `settings.slope.maxDeg`. Nachylenie liczymy z różnic wysokości sąsiednich punktów;
- punkt leży w którymkolwiek kształcie z `derived.collision` (3.8): w obszarze lassa, w pasie linii kolizji albo w obrysie obiektu z `flags.collision`.

Wchodzenie pod górę nie zmienia szybkości; gra używa maski tylko jako „przejść / nie przejść”. Dokładność maski to oczko siatki terenu. Gdy gra potrzebuje dokładniejszych kształtów, bierze je z `derived.collision`.

### 3.6. Powierzchnie chodliwe (`derived.walkable`)

Dla każdego obiektu typu z `flags.walkable = true` edytor zapisuje trójkąty w układzie mapy: `triangles` to płaska lista `[x, y, z, x, y, z, x, y, z, …]`, po 9 liczb na trójkąt.

- **Prosta bryła:** górna ściana bryły (dla walca – koło z 16 trójkątów), po obrocie i skali.
- **Model `.glb`:** siatki, które mają `walkable` w nazwie (ich ściany skierowane choć trochę do góry). Gdy model takich siatek nie ma – wszystkie prawie poziome ściany modelu skierowane do góry.

Gra liczy wysokość ruchu jako **najwyższą z terenu i powierzchni chodliwych** pod postacią.

### 3.8. Kształty kolizji (`derived.collision`)

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
- obiekty typów z `flags.collision = true`: strefa (`zone`) → `polygon`, ścieżka (`path`) → `line` (grubość z właściwości `width`, gdy typ ją ma, inaczej 1); punkt i bryła → `polygon` – obrys widziany z góry (otoczka wypukła bryły po obrocie i skali; dla modelu – pudełko `defaultSize`).

### 3.7. Co edytor robi z `derived` przy wczytywaniu

Sekcja `derived` to dane pochodne dla gry. Przy wczytywaniu edytor ją pomija i liczy od nowa przy kolejnym zapisie. Dzięki temu nie może się rozjechać z resztą mapy. Wszystko inne wraca bez strat: zapis → odczyt → zapis daje identyczny plik (sprawdzają to testy w `tests/format.test.ts`).
