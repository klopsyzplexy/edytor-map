# Edytor map – zasady projektu

Uniwersalny edytor map 3D działający w przeglądarce, dla osób, które nie programują. Służy Gainerowi i przyszłym grom. **Edytor nie zna żadnej gry:** wszystko, co specyficzne dla gry (typy obiektów, właściwości, warstwy terenu, kamera, zasady walidacji), pochodzi z pliku schematu dostarczonego przez grę.

- Repozytorium publiczne, licencja MIT, niezależne od repozytorium gry: https://github.com/klopsyzplexy/edytor-map
- Język komentarzy, commitów i dokumentacji: polski. Interfejs: polski i angielski (teksty tylko w plikach tłumaczeń, nigdy wpisane w kod UI).

## Stack i polecenia

- Vite 8 + TypeScript 7 (strict) + Three.js z npm, testy Vitest. Wszystkie wersje przypięte w `package.json`, bez `^`. Lokalny Node: 26.
- Bez serwera i bez frameworka UI: statyczna strona, interfejs to DOM, scena to Three.js.
- `npm install`, `npm run dev` (edytor pod http://localhost:5173), `npm run build` (typecheck + statyczna strona w `dist/`, `base: './'`, więc działa z dowolnego katalogu), `npm run preview`, `npm test`.
- Wersja: jedno źródło to `version` w `package.json` (Vite wstawia `__APP_VERSION__`, widoczne w edytorze jako „Edytor map alfa X.Y.Z”).

## Sposób pracy

- Wersjonowanie i zamykanie wersji: `docs/zadania/0.0/00-wersjonowanie.md` (`0.MINOR.PATCH`; MINOR = zadania PM z `docs/zadania/<wersja>/NN-nazwa.md`, PATCH = drobne poprawki od testera).
- Przed zadaniem przeczytać plik zadania w całości i ten plik; przy sprzeczności zapytać.
- Po każdym etapie commit z prefiksem wersji, np. `0.1.0: pędzle terenu`.
- Każda wersja (także PATCH) ma sekcję w `CHANGELOG.md`; po wersji MINOR raport `docs/raporty/0.MINOR.md` (samodzielny – PM nie widzi repozytorium) i tag `v0.MINOR.0`.
- Zmiany formatu schematu lub mapy zawsze opisywać w `docs/formaty.md` i w CHANGELOG.

## Zasady techniczne

- **Edytor jest niezależny od gry.** Żadnych nazw, liczb ani zasad konkretnej gry w kodzie; tylko w plikach schematu (przykładowy schemat do nauki leży w repozytorium).
- **Formaty to kontrakt z grami.** Plik mapy ma pole wersji formatu; każda zmiana kształtu = nowa wersja formatu + migracja przy wczytywaniu starszych plików. Zapis → odczyt musi dawać to samo (testy formatu).
- Logika formatu, walidacji i operacji na danych w czystych funkcjach bez DOM i bez Three.js (testowalne w Vitest); scena i UI tylko odczytują i zmieniają stan przez te funkcje.
- Każda zmiana mapy przechodzi przez system cofnij/ponów.
