# Edytor map – zadanie 01: podstawy (nowe repozytorium)

## Cel

Uniwersalny edytor map 3D działający w przeglądarce, łatwy w obsłudze dla osób, które nie programują. Ma służyć Gainerowi i przyszłym grom: wszystko, co specyficzne dla gry, pochodzi z **pliku schematu** dostarczonego przez grę, a sam edytor nie zna żadnej gry.

## Repozytorium i technologia

- Nowe, osobne, **publiczne** repozytorium (licencja MIT), niezależne od repozytorium gry.
- Vite, TypeScript, Three.js; bez serwera – całość działa w przeglądarce (statyczna strona).
- Interfejs po polsku i angielsku (przełącznik języka; teksty w plikach tłumaczeń).
- README dla nie-programistów: jak uruchomić, jak wczytać schemat i mapę, jak eksportować. Osobny dokument formatu schematu i formatu mapy.
- Edytor na komputer (mysz i klawiatura); telefon nie jest wymagany.
- Zapis: automatyczny zapis roboczy w przeglądarce (IndexedDB) oraz zapis i wczytanie plików (pobranie/wgranie; File System Access API tam, gdzie jest dostępne).

## Schemat gry (plik JSON)

Definiuje:
- **typy obiektów:** identyfikator, nazwa, kategoria (do palety), wygląd w edytorze (kolor i prosta bryła albo model .glb), domyślny rozmiar;
- **właściwości** każdego typu: typ (liczba, tekst, wybór z listy, tak/nie, kolor, odwołanie do innego obiektu), wartość domyślna, walidacja (wymagane, minimum, maksimum);
- **flagi:** kolizja (blokuje ruch), widoczny w grze (np. niewidzialne ściany: widoczne tylko w edytorze), **chodliwy** (gracz może po nim chodzić – patrz niżej);
- **rodzaje obiektów:** punkt (np. generator), bryła (np. ściana kolizji), ścieżka (polilinia, np. trasa wozu), strefa (wielokąt, np. obszar generatora);
- **warstwy terenu** (nazwa, kolor/tekstura, czy to woda);
- **ustawienia kamery gry** (kąt, odległość) do podglądu „jak w grze”;
- **zasady walidacji całej mapy** (np. „dokładnie jeden obiekt typu start”).

W repozytorium: przykładowy, minimalny schemat do nauki.

## Teren

- Siatka z mapą wysokości, rozmiar i rozdzielczość ustawiane przy tworzeniu mapy.
- Pędzle: podnieś, obniż, wygładź, wyrównaj do wskazanej wysokości, szum; rozmiar, siła, miękkość krawędzi.
- Malowanie warstw terenu ze schematu (mieszanie warstw). **Woda** jako warstwa z animowanym shaderem (falowanie) w podglądzie.
- **Nieprzechodniość:** obiekt „ściana kolizji” (bryła, dowolnie obracana i skalowana, niewidzialna w grze) oraz opcjonalne automatyczne oznaczanie zbyt stromych zboczy (próg w stopniach, podgląd na czerwono, wynik jako maska nieprzechodniości w eksporcie). Wchodzenie pod górę nie zmienia szybkości.

## Obiekty

- Paleta z typów schematu; wstawianie kliknięciem, obiekt przykleja się do terenu.
- Przesuwanie, obrót, skala (uchwyty), przyciąganie do siatki, zaznaczanie wielu, kopiuj/wklej, duplikuj, usuń.
- Panel właściwości generowany ze schematu; lista obiektów z wyszukiwaniem i filtrem typu; grupy; ukrywanie i blokowanie.
- Ścieżki i strefy: rysowanie punktów, edycja wierzchołków.
- **Obiekty chodliwe** (np. mosty): flaga w schemacie; w eksporcie powierzchnia, po której można chodzić (górna ściana bryły albo osobna siatka modelu). Gra liczy wysokość ruchu jako najwyższą z terenu i powierzchni chodliwych pod postacią.

## Podgląd i obsługa

- Kamera swobodna (obrót, przybliżenie, przesuwanie) oraz przełącznik **„widok jak w grze”** (kąt i odległość ze schematu).
- Cofnij/ponów, skróty klawiszowe (z ekranem pomocy), podpowiedzi przy narzędziach.
- **Walidacja** według schematu: lista błędów i ostrzeżeń; kliknięcie przenosi do obiektu.

## Eksport i import

- Jeden plik mapy (JSON): wersja formatu, ustawienia, obiekty z właściwościami, ścieżki, strefy, ściany kolizji, warstwy; teren (mapa wysokości, warstwy i maska nieprzechodniości) w tym samym pliku albo jako obrazy obok – opisz wybór w dokumentacji.
- Import tego samego formatu (pełny obieg bez strat).

## Poza zakresem tego zadania (zadanie 02)

Tryb „zagraj tę mapę” (chodzenie postacią z kolizjami i powierzchniami chodliwymi), wczytywanie map z edytora w Gainerze.

## Kryteria odbioru

- Uruchomienie lokalne i zbudowanie statycznej strony jedną komendą; README prowadzi nie-programistę krok po kroku.
- Z przykładowym schematem można: stworzyć mapę, wyrzeźbić teren, pomalować warstwy z wodą, wstawić i edytować obiekty, ścieżki, strefy i ściany kolizji, oznaczyć strome zbocza, zwalidować, wyeksportować, wczytać ponownie bez strat.
- Testy formatu (zapis → odczyt daje to samo) i walidacji.
