// Menu (⋯, Plik, Mapa…) zawsze w oknie: lista otwiera się pod przyciskiem albo nad nim i w prawo albo w lewo –
// tam, gdzie się mieści; gdy nie mieści się nigdzie, jest dosuwana do krawędzi okna i przewijana w środku.
// Lista ma pozycję względem okna (fixed), więc panele z przewijaniem jej nie ucinają.

const MARGIN = 6;
const GAP = 4;

/** Ustawia otwartą listę menu `details.menu` tak, żeby cała mieściła się w oknie. */
export function placeMenu(menu: HTMLDetailsElement): void {
  const list = menu.querySelector<HTMLElement>(':scope > .menu-list');
  const summary = menu.querySelector<HTMLElement>(':scope > summary');
  if (!list || !summary) return;
  const vw = document.documentElement.clientWidth;
  const vh = document.documentElement.clientHeight;
  const s = summary.getBoundingClientRect();
  Object.assign(list.style, { position: 'fixed', left: '0px', top: '0px', right: 'auto', bottom: 'auto', maxHeight: '', maxWidth: `${vw - 2 * MARGIN}px`, overflowY: '' });
  const w = list.offsetWidth;
  let h = list.offsetHeight;

  // poziomo: domyślnie od lewej krawędzi przycisku (menu w rogu karty – od prawej), potem w drugą stronę, potem dosunięcie
  const preferRight = menu.classList.contains('lib-menu');
  const fromLeft = s.left;
  const fromRight = s.right - w;
  const fitsLeft = fromLeft + w <= vw - MARGIN;
  const fitsRight = fromRight >= MARGIN;
  let x = preferRight ? (fitsRight ? fromRight : fitsLeft ? fromLeft : fromRight) : fitsLeft ? fromLeft : fitsRight ? fromRight : fromLeft;
  x = Math.min(Math.max(x, MARGIN), Math.max(MARGIN, vw - MARGIN - w));

  // pionowo: pod przyciskiem, a gdy się nie mieści – nad nim; inaczej po stronie z większym miejscem, z przewijaniem
  const below = vh - MARGIN - (s.bottom + GAP);
  const above = s.top - GAP - MARGIN;
  let y: number;
  if (h <= below) y = s.bottom + GAP;
  else if (h <= above) y = s.top - GAP - h;
  else {
    const room = Math.max(below, above);
    list.style.maxHeight = `${Math.max(80, room)}px`;
    list.style.overflowY = 'auto';
    h = list.offsetHeight;
    y = below >= above ? s.bottom + GAP : s.top - GAP - h;
    y = Math.min(Math.max(y, MARGIN), Math.max(MARGIN, vh - MARGIN - h));
  }
  list.style.left = `${Math.round(x)}px`;
  list.style.top = `${Math.round(y)}px`;
}

/**
 * Włącza dopasowanie do okna dla wszystkich menu w dokumencie (także tworzonych później):
 * ustawienie przy otwarciu, poprawka po zmianie rozmiaru okna, zamknięcie przy przewinięciu panelu pod menu.
 * Rozwijane listy (select) dostają dymek z pełnym tekstem wybranej pozycji, bo w wąskim panelu bywają skrócone.
 */
export function installFitToWindow(): void {
  const openMenus = () => [...document.querySelectorAll<HTMLDetailsElement>('details.menu[open]')];
  document.addEventListener(
    'toggle',
    (e) => {
      const d = e.target as HTMLElement;
      if (d instanceof HTMLDetailsElement && d.classList.contains('menu') && d.open) placeMenu(d);
    },
    true,
  );
  window.addEventListener('resize', () => openMenus().forEach(placeMenu));
  document.addEventListener(
    'scroll',
    (e) => {
      const t = e.target;
      for (const m of openMenus()) if (!(t instanceof Node && m.contains(t))) m.open = false;
    },
    true,
  );
  document.addEventListener('pointerover', (e) => {
    const el = e.target;
    if (el instanceof HTMLSelectElement && !el.dataset.ownTitle) {
      if (el.title && el.dataset.autoTitle !== '1') {
        el.dataset.ownTitle = '1';
        return;
      }
      el.title = el.selectedOptions[0]?.text ?? '';
      el.dataset.autoTitle = '1';
    }
  });
}
