/**
 * One shared floating tooltip for every chart on the page. Text-only (set via
 * textContent), positioned next to the pointer and kept inside the viewport.
 */
let element: HTMLDivElement | undefined;

function ensure(): HTMLDivElement {
  if (element) return element;
  element = document.createElement('div');
  element.className = 'viz-tooltip';
  element.setAttribute('role', 'tooltip');
  element.hidden = true;
  document.body.append(element);
  return element;
}

export interface TooltipContent {
  title: string;
  lines?: string[];
  swatch?: string;
}

export function showTooltip(
  content: TooltipContent,
  clientX: number,
  clientY: number,
): void {
  const tip = ensure();
  tip.replaceChildren();

  const head = document.createElement('p');
  head.className = 'viz-tooltip__title';
  if (content.swatch) {
    const swatch = document.createElement('span');
    swatch.className = 'viz-tooltip__swatch';
    swatch.style.background = content.swatch;
    head.append(swatch);
  }
  head.append(content.title);
  tip.append(head);

  for (const line of content.lines ?? []) {
    const p = document.createElement('p');
    p.textContent = line;
    tip.append(p);
  }

  tip.hidden = false;
  const { width, height } = tip.getBoundingClientRect();
  const x = Math.min(clientX + 16, window.innerWidth - width - 12);
  const y =
    clientY + height + 24 > window.innerHeight
      ? clientY - height - 14
      : clientY + 18;
  tip.style.transform = `translate(${Math.max(12, x)}px, ${Math.max(12, y)}px)`;
}

export function hideTooltip(): void {
  if (element) element.hidden = true;
}
