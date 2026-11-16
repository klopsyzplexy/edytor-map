# Edytor map – zasady projektu

Uniwersalny edytor map 3D działający w przeglądarce, dla osób, które nie programują. Służy Gainerowi i przyszłym grom. **Edytor nie zna żadnej gry:** wszystko, co specyficzne dla gry (typy obiektów, właściwości, warstwy terenu, kamera, zasady walidacji), pochodzi z pliku schematu dostarczonego przez grę.

- Repozytorium publiczne, licencja MIT, niezależne od repozytorium gry: https://github.com/klopsyzplexy/edytor-map
- Język komentarzy, commitów i dokumentacji: polski. Interfejs: polski i angielski (teksty tylko w plikach tłumaczeń, nigdy wpisane w kod UI).

## Stack i polecenia

- Vite 8 + TypeScript 7 (strict) + Three.js z npm, testy Vitest. Wszystkie wersje przypięte w `package.json`, bez `^`. Lokalny Node: 26.
- Bez serwera i bez frameworka UI: statyczna strona, interfejs to DOM, scena to Three.js.
- `npm start` (instaluje zależności i otwiera edytor pod http://localhost:5173), `npm run dev`, `npm run build` (instalacja + typecheck + statyczna strona w `dist/`, `base: './'`, więc działa z dowolnego katalogu), `npm run preview`, `npm test`.
- Wtyczka `edytor-examples` w `vite.config.ts` udostępnia pliki z `examples/` obok edytora (nie `publicDir` – Vite zabrania importu z niego, a kod importuje schemat): przykładowy schemat (`schemat-przyklad.json`) i model (`modele/kladka.glb`) trafiają do zbudowanej strony. Model odtwarza `node tools/make-example-glb.mjs`, stemple wysokości (`stemple/*.png`) – `node tools/make-example-stamps.mjs`.
- Wersja: jedno źródło to `version` w `package.json` (Vite wstawia `__APP_VERSION__`, widoczne w edytorze jako „Edytor map alfa X.Y.Z”).

## Sposób pracy

- Wersjonowanie i zamykanie wersji: `docs/zadania/0.0/00-wersjonowanie.md` (`0.MINOR.PATCH`; MINOR = zadania PM z `docs/zadania/<wersja>/NN-nazwa.md`, PATCH = drobne poprawki od testera).
- Przed zadaniem przeczytać plik zadania w całości i ten plik; przy sprzeczności zapytać.
- Po każdym etapie commit z prefiksem wersji, np. `0.1.0: pędzle terenu`.
- Każda wersja (także PATCH) ma sekcję w `CHANGELOG.md`; po wersji MINOR raport `docs/raporty/0.MINOR.md` (samodzielny – PM nie widzi repozytorium) i tag `v0.MINOR.0`.
- Zmiany formatu schematu lub mapy zawsze opisywać w `docs/formaty.md` i w CHANGELOG.

## Struktura `src/`

- `core/` – czyste dane i logika (bez DOM i Three.js, testowane w `tests/`): `schema.ts` (parsowanie i sprawdzanie schematu), `map.ts` (model mapy, wysokość terenu), `format.ts` + `binary.ts` (plik mapy, base64, migracje), `terrain.ts` (pędzle, malowanie warstw, strome zbocza, promień w teren), `walkable.ts` (powierzchnie chodliwe do eksportu), `validate.ts`, `history.ts`, `doc.ts` (dokument: zaznaczenie, transakcje obiektów, pociągnięcia pędzlem, zdarzenia), `math.ts`.
- `render/` – `viewport.ts` (renderer, kamera swobodna i „widok gry”), `terrainMesh.ts` (shader mieszania warstw, woda, maska zboczy, kursor pędzla, siatka), `objectsView.ts` (bryły, modele, ścieżki, strefy, obrysy, uchwyty wierzchołków), `gizmo.ts` (TransformControls na wielu obiektach przez wspólny punkt obrotu), `models.ts` (.glb).
- `tools/tools.ts` – narzędzia myszy: zaznaczanie (przeciąganie po terenie, prostokąt, wierzchołki), rzeźba, malowanie, wstawianie i rysowanie ścieżek/stref.
- `ui/` – panele (`panels.ts`), okna (`dialogs.ts`), pomocniki DOM; `app.ts` łączy wszystko (skróty, pliki, zapis roboczy); `context.ts` – wspólny interfejs dla narzędzi i paneli.
- `storage/` – zapis roboczy w IndexedDB, pliki (File System Access API albo wgranie/pobranie); `i18n/` – `pl.json`, `en.json` (test pilnuje zgodności kluczy).

## Zasady techniczne

- Układ: ziemia X–Z, wysokość Y, mapa od (0, 0) do (szerokość, głębokość); obrót w stopniach, Euler XYZ (jak Three.js). Szczegóły i uzasadnienia formatu: `docs/formaty.md`.
- Teren w pliku mapy jako base64 (Float32 LE dla wysokości, bajty dla wag warstw) – bezstratnie, w jednym pliku. Sekcja `derived` (maska nieprzechodniości, powierzchnie chodliwe) jest liczona przy zapisie i pomijana przy wczytywaniu.
- Zmiany obiektów robione „na żywo” w trakcie przeciągania przywracamy na końcu i zapisujemy jednym `doc.updateObjects`, żeby cofnij/ponów miało jeden krok.

- **Edytor jest niezależny od gry.** Żadnych nazw, liczb ani zasad konkretnej gry w kodzie; tylko w plikach schematu (przykładowy schemat do nauki leży w repozytorium).
- **Formaty to kontrakt z grami.** Plik mapy ma pole wersji formatu; każda zmiana kształtu = nowa wersja formatu + migracja przy wczytywaniu starszych plików. Zapis → odczyt musi dawać to samo (testy formatu).
- Logika formatu, walidacji i operacji na danych w czystych funkcjach bez DOM i bez Three.js (testowalne w Vitest); scena i UI tylko odczytują i zmieniają stan przez te funkcje.
- Każda zmiana mapy przechodzi przez system cofnij/ponów.
