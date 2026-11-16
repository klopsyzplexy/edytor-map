# 0.2 / 01 – Usprawnienia po pierwszych testach

Cel: poprawki z pierwszych wrażeń testera. Tryb „zagraj tę mapę” przesuwa się na 0.3.

## 1. Formaty modeli

- Oprócz .glb obsłuż **.gltf** (z plikami towarzyszącymi: wgranie kilku plików naraz albo archiwum .zip), **.fbx** i **.obj** (z .mtl i teksturami).
- Przy imporcie edytor zamienia model na swój format wewnętrzny (glTF), żeby mapa i eksport zawsze korzystały z jednego formatu. Komunikat, jeśli plik jest niekompletny (np. brakuje tekstury).
- README: krótko i prosto wyjaśnij, czym różnią się te formaty i który wybrać.

## 2. Poruszanie się po dużej mapie

- Przesuwanie kamery: przeciąganie środkowym przyciskiem myszy, przeciąganie z wciśniętą spacją, klawisze WASD lub strzałki (z Shiftem szybciej).
- **Minimapa** w rogu: widok całej mapy z prostokątem widoku kamery; kliknięcie lub przeciągnięcie przenosi kamerę.
- **F** – wyśrodkuj kamerę na zaznaczeniu; **Home** – pokaż całą mapę.
- Przybliżanie kółkiem w stronę kursora.

## 3. Kolizje rysowane

- **Lasso kolizji:** rysowanie dowolnego kształtu na terenie (przeciąganie myszą); wynik to strefa nieprzechodnia (wielokąt) z edycją wierzchołków po narysowaniu i wygładzaniem kształtu.
- **Linia kolizji:** łamana z ustawianą grubością (ściana wzdłuż linii), np. wzdłuż klifu albo rzeki.
- Obie widoczne tylko w edytorze, eksportowane razem z istniejącymi ścianami kolizji i maską stromych zboczy.

## 4. Pędzle

- Kształty: **koło, kwadrat, romb**, a także **stempel z obrazu** (szary obraz jako kształt wysokości, np. góra, krater, wąwóz – kilka przykładowych w repozytorium, możliwość wgrania własnych).
- Obrót pędzla (dla kwadratu, rombu i stempla).
- Podgląd kształtu pędzla na terenie pod kursorem.

## 5. Grupy i drzewo obiektów

- Lista obiektów jako **drzewo**: grupy z podgrupami, zwijanie i rozwijanie, przeciąganie obiektów i grup między grupami, zmiana nazwy.
- Zaznaczenie grupy zaznacza całą jej zawartość; przesuwanie, obrót i skala grupy działają na wszystkich obiektach.
- Ukrywanie i blokowanie całej grupy; kopiowanie i duplikowanie grupy z zawartością.
- Grupy zapisują się w formacie mapy (bez wpływu na grę – tylko porządek).

## 6. Skróty klawiszowe

Każde narzędzie pokazuje swój skrót w dymku i na przycisku (mała litera w rogu). Klawisz **?** otwiera ściągę ze wszystkimi skrótami. Propozycja:

| Klawisz | Działanie |
|---|---|
| Q | zaznaczanie |
| W / E / R | przesuwanie / obrót / skala |
| 1 / 2 / 3 / 4 / 5 | pędzel: podnieś / obniż / wygładź / wyrównaj / szum |
| T | stempel |
| P | malowanie warstw terenu |
| O | wstawianie obiektu (ostatni typ z palety) |
| L | lasso kolizji |
| K | linia kolizji |
| [ / ] | mniejszy / większy pędzel |
| Shift + [ / ] | słabszy / mocniejszy pędzel |
| , / . | obrót pędzla |
| Ctrl+G / Ctrl+Shift+G | grupuj / rozgrupuj |
| H / Shift+H | ukryj zaznaczone / pokaż wszystko |
| Ctrl+Z / Ctrl+Y | cofnij / ponów |
| Ctrl+C / Ctrl+V / Ctrl+D / Delete | kopiuj / wklej / duplikuj / usuń |
| F / Home | wyśrodkuj na zaznaczeniu / cała mapa |
| V | przełącz „widok jak w grze” |
| Ctrl+S | zapisz |
| ? | ściąga skrótów |

Skróty nie działają podczas pisania w polach tekstowych.

## Kryteria odbioru

- Modele .glb, .gltf, .fbx i .obj wczytują się i eksportują w jednym formacie.
- Po dużej mapie można sprawnie się poruszać (mysz, klawiatura, minimapa, F, Home).
- Lasso i linia kolizji działają, są edytowalne i trafiają do eksportu.
- Cztery kształty pędzla z obrotem i podglądem.
- Drzewo grup z przeciąganiem, wspólnym przekształcaniem, ukrywaniem i blokowaniem.
- Wszystkie skróty z tabeli działają i są widoczne w interfejsie oraz w ściądze.
