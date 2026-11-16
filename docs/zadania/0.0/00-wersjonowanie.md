# Zadanie: wersjonowanie i porządek pracy (alfa 0.0)

Cel: oznaczyć obecny stan repozytorium jako alfa 0.0 i ustawić stały sposób pracy nad kolejnymi wersjami. Kod gry się nie zmienia, poza wyświetlaniem numeru wersji.

## 1. Numeracja wersji

- Format: `0.MINOR.PATCH` w fazie alfa.
- **MINOR (część dziesiętna) podnosi PM:** każda zaplanowana aktualizacja z plików zadań (0.1, 0.2…). Po jej ukończeniu wersja to `0.MINOR.0`.
- **PATCH (część setna) podnosisz Ty:** każda drobna poprawka lub zmiana zgłoszona przez testera między aktualizacjami (błędy, strojenie balansu, drobne zmiany interfejsu), np. 0.1.0 → 0.1.1 → 0.1.2. Kilka drobnych zmian zrobionych naraz może iść w jednym numerze.
- Jedno źródło numeru: pole `version` w `package.json` (obecny stan to `0.0.0`).

## 2. Struktura katalogów

Utwórz:

```
docs/
  zadania/
    0.0/        ← ten plik (00-wersjonowanie.md)
    0.1/        ← zadania na kolejną wersję (pliki NN-nazwa.md)
  raporty/      ← raporty po każdej wersji (0.0.md, 0.1.md…)
CHANGELOG.md
```

Pliki zadań przygotowuje PM (osobna rozmowa), wrzuca je tester do `docs/zadania/<wersja>/`. Numeracja `NN` wyznacza kolejność realizacji.

## 3. CHANGELOG.md

Załóż plik z sekcją dla 0.0.0 (opisz stan po przeniesieniu prototypu: co działa). Każda wersja, także PATCH, ma własną sekcję. Format sekcji:

```
## [0.1.1] – RRRR-MM-DD
### Dodane
### Zmienione
### Balans (stare → nowe wartości)
### Naprawione
```

Zmiany balansu zawsze zapisuj ze starą i nową wartością.

## 4. Wersja widoczna w grze

Pokaż pełny numer wersji w oknie Menu (np. „Gainer alfa 0.1.2”), czytany z `package.json` podczas budowania.

## 5. Sposób pracy przy każdym zadaniu

1. Przeczytaj plik zadania w całości i CLAUDE.md. Jeśli zadanie jest sprzeczne z CLAUDE.md albo z poprzednimi ustaleniami, zapytaj, zanim zaczniesz.
2. Realizuj etapami; po każdym etapie commit z opisem zaczynającym się od numeru wersji, np. `0.1.0: dwie ręce widoczne na modelu postaci`.
3. Kryteria odbioru z pliku zadania traktuj jako listę rzeczy do sprawdzenia przed oddaniem.
4. Zmiany zasad gry lub balansu dopisuj do CLAUDE.md i CHANGELOG.md.

## 6. Zamknięcie wersji

**PATCH (drobna zmiana od testera):** podnieś PATCH w `package.json`, dopisz sekcję do CHANGELOG.md, commit i tag gita `v0.MINOR.PATCH`.

**MINOR (aktualizacja z zadań PM):** gdy wszystkie zadania wersji są gotowe i przetestowane:

1. Ustaw `version` na `0.MINOR.0`, uzupełnij sekcję w CHANGELOG.md, utwórz tag gita `v0.MINOR.0`.
2. Napisz raport `docs/raporty/0.MINOR.md` dla PM: co zrobiono, wszystkie zmiany balansu (stare → nowe), zmiany zasad, znane problemy i rzeczy odłożone na później.
3. Przed rozpoczęciem kolejnej aktualizacji tester poprosi o raport zbiorczy wszystkich wersji PATCH od ostatniego raportu (np. 0.1.1–0.1.4); dopisz go do tego samego pliku raportu. Raporty mają być samodzielne, bo PM nie widzi repozytorium.

## Kryteria odbioru

- Istnieją `docs/zadania/0.0/`, `docs/zadania/0.1/`, `docs/raporty/` i `CHANGELOG.md` z sekcją 0.0.
- `package.json` ma wersję `0.0.0`, a Menu w grze pokazuje „alfa 0.0.0”.
- Repozytorium ma tag `v0.0.0` na commicie z tymi zmianami.
- Plik `docs/raporty/0.0.md` opisuje stan gry po przeniesieniu prototypu.
