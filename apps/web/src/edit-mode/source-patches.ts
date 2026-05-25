import { emptyManualEditStyles, MANUAL_EDIT_STYLE_PROPS, type ManualEditFields, type ManualEditPatch, type ManualEditStyles } from './types';
import { MANUAL_EDIT_HOST_NODE_SELECTOR, MANUAL_EDIT_SOURCE_PATH_ATTR } from './bridge';

export interface ManualEditPatchResult {
  ok: boolean;
  source: string;
  error?: string;
}

export function applyManualEditPatch(source: string, patch: ManualEditPatch): ManualEditPatchResult {
  if (patch.kind === 'set-full-source') return { ok: true, source: patch.source };

  const doc = parseSource(source);
  if (!doc) return { ok: false, source, error: 'Could not parse source.' };

  if (patch.kind === 'set-token') {
    const changed = setCssToken(doc, patch.token, patch.value);
    return changed
      ? { ok: true, source: serializeSource(doc, source) }
      : { ok: false, source, error: `Token not found: ${patch.token}` };
  }

  const el = findEditableElement(doc, patch.id);
  if (!el) return { ok: false, source, error: `Target not found: ${patch.id}` };

  if (patch.kind === 'set-text') {
    // Clear all child nodes first (including nested markup)
    while (el.firstChild) {
      el.removeChild(el.firstChild);
    }
    el.textContent = patch.value;
  } else if (patch.kind === 'set-link') {
    if (hasElementChildren(el)) {
      const currentText = el.textContent?.trim() ?? '';
      if (patch.text.trim() !== currentText) {
        return { ok: false, source, error: 'This link contains nested markup. Use the HTML tab to change its label.' };
      }
    } else {
      el.textContent = patch.text;
    }
    el.setAttribute('href', patch.href);
  } else if (patch.kind === 'set-image') {
    el.setAttribute('src', patch.src);
    el.setAttribute('alt', patch.alt);
  } else if (patch.kind === 'set-style') {
    setInlineStyles(el as HTMLElement, patch.styles);
  } else if (patch.kind === 'set-attributes') {
    setAttributes(el, patch.attributes);
  } else if (patch.kind === 'set-outer-html') {
    const replaced = replaceOuterHtml(doc, el, patch.html);
    if (!replaced.ok) return { ok: false, source, error: replaced.error };
  } else if (patch.kind === 'move-element') {
    const moved = moveElement(doc, patch.id, patch.afterId, patch.beforeId);
    if (!moved.ok) return { ok: false, source, error: moved.error };
  }

  return { ok: true, source: serializeSource(doc, source) };
}

export function readManualEditFields(source: string, id: string): ManualEditFields {
  const doc = parseSource(source);
  const el = doc ? findEditableElement(doc, id) : null;
  if (!el) return {};
  const kind = inferKind(el);
  if (kind === 'link') {
    return {
      text: el.textContent?.trim() ?? '',
      href: el.getAttribute('href') ?? '',
    };
  }
  if (kind === 'image') {
    return {
      src: el.getAttribute('src') ?? '',
      alt: el.getAttribute('alt') ?? '',
    };
  }
  return { text: el.textContent?.trim() ?? '' };
}

export function readManualEditStyles(source: string, id: string): ManualEditStyles {
  const doc = parseSource(source);
  const el = doc ? findEditableElement(doc, id) : null;
  if (!el) return emptyManualEditStyles();
  const style = (el as HTMLElement).style;
  return MANUAL_EDIT_STYLE_PROPS.reduce<ManualEditStyles>((acc, key) => {
    acc[key] = (style[key as unknown as keyof CSSStyleDeclaration] as string | undefined) ?? '';
    return acc;
  }, {} as ManualEditStyles);
}

export function readManualEditAttributes(source: string, id: string): Record<string, string> {
  const doc = parseSource(source);
  const el = doc ? findEditableElement(doc, id) : null;
  if (!el) return {};
  const attrs: Record<string, string> = {};
  Array.from(el.attributes).forEach((attr) => {
    if (attr.name === 'data-od-runtime-id') return;
    attrs[attr.name] = attr.value;
  });
  return attrs;
}

export function readManualEditOuterHtml(source: string, id: string): string {
  const doc = parseSource(source);
  return (doc ? findEditableElement(doc, id)?.outerHTML : '') ?? '';
}

function parseSource(source: string): Document | null {
  if (typeof DOMParser !== 'undefined') {
    return new DOMParser().parseFromString(source, 'text/html');
  }
  if (typeof document !== 'undefined') {
    const doc = document.implementation.createHTMLDocument('');
    doc.documentElement.innerHTML = source;
    return doc;
  }
  return null;
}

function serializeSource(doc: Document, originalSource: string): string {
  const isFull = isManualEditFullHtmlDocument(originalSource);
  const result = isFull ? `<!doctype html>\n${doc.documentElement.outerHTML}` : doc.body.innerHTML;
  console.error('[source-patches] serializeSource:', { isFull, originalLen: originalSource.length, resultLen: result.length, resultSnippet: result.slice(0, 200) });
  return result;
}

export function isManualEditFullHtmlDocument(source: string): boolean {
  const normalized = firstSourceToken(source).slice(0, 32).toLowerCase();
  return normalized.startsWith('<!doctype') || normalized.startsWith('<html');
}

function firstSourceToken(source: string): string {
  let rest = source.trimStart();
  while (rest.startsWith('<!--') || rest.startsWith('<?')) {
    const close = rest.startsWith('<!--') ? '-->' : '?>';
    const end = rest.indexOf(close);
    if (end === -1) return rest;
    rest = rest.slice(end + close.length).trimStart();
  }
  return rest;
}

function inferKind(el: Element): 'text' | 'link' | 'image' | 'container' {
  const explicit = el.getAttribute('data-od-edit');
  if (explicit === 'text' || explicit === 'link' || explicit === 'image' || explicit === 'container') return explicit;
  const tag = el.tagName.toLowerCase();
  if (tag === 'a') return 'link';
  if (tag === 'img') return 'image';
  if (['section', 'main', 'nav', 'div', 'article', 'header', 'footer'].includes(tag)) return 'container';
  return 'text';
}

function findEditableElement(doc: Document, id: string): Element | null {
  if (id === '__body__') return doc.body;
  return (
    doc.querySelector(`[data-od-id="${cssEscape(id)}"]`) ??
    doc.querySelector(`[data-od-runtime-id="${cssEscape(id)}"]`) ??
    doc.querySelector(`[data-od-source-path="${cssEscape(id)}"]`) ??
    findElementByPath(doc, id)
  );
}

function findElementByPath(doc: Document, id: string): Element | null {
  if (!id.startsWith('path-')) return null;
  const indexes = id
    .slice('path-'.length)
    .split('-')
    .map((part) => Number(part));
  if (indexes.some((index) => !Number.isInteger(index) || index < 0)) return null;
  let current: Element | null = doc.body;
  for (const index of indexes) {
    if (!current) return null;
    // Filter host nodes to match bridge.ts behavior and pathForElement logic
    const filteredSiblings: Element[] = Array.from(current.children).filter(
      (child) => !child.matches(MANUAL_EDIT_HOST_NODE_SELECTOR),
    );
    current = filteredSiblings[index] ?? null;
  }
  return current;
}

function hasElementChildren(el: Element): boolean {
  return Array.from(el.children).some((child) => child.nodeType === 1);
}

function setInlineStyles(el: HTMLElement, styles: Partial<ManualEditStyles>): void {
  for (const [name, value] of Object.entries(styles)) {
    const cssName = camelToKebab(name);
    if (typeof value !== 'string' || value.trim() === '') el.style.removeProperty(cssName);
    else el.style.setProperty(cssName, value.trim());
  }
}

function setAttributes(el: Element, attributes: Record<string, string>): void {
  const protectedAttrs = new Set(['data-od-id', 'data-od-edit', 'data-od-label', 'data-od-runtime-id']);
  for (const [name, value] of Object.entries(attributes)) {
    if (!isSafeAttributeName(name) || protectedAttrs.has(name)) continue;
    if (value.trim() === '') el.removeAttribute(name);
    else el.setAttribute(name, value);
  }
}

function moveElement(doc: Document, id: string, afterId: string | null, beforeId: string | null): { ok: true } | { ok: false; error: string } {
  const el = findEditableElement(doc, id);
  if (!el) return { ok: false, error: `Element not found: ${id}` };
  const elParent = el.parentElement;
  if (!elParent) return { ok: false, error: 'Element has no parent' };

  console.error('[source-patches] moveElement:', { id, afterId, beforeId, elTag: el.tagName, elParentTag: elParent.tagName, elParentChildren: elParent.children.length });

  // Find anchor element (insert reference point)
  let anchor: Element | null = null;
  if (afterId !== null) {
    anchor = findEditableElement(doc, afterId);
  } else if (beforeId !== null) {
    anchor = findEditableElement(doc, beforeId);
  }

  console.error('[source-patches] moveElement anchor:', anchor ? { tag: anchor.tagName, parentTag: anchor.parentElement?.tagName } : null);

  let newParent: Element;
  let insertBefore: Element | null = null;

  if (anchor) {
    const anchorParent = anchor.parentElement;
    if (!anchorParent) return { ok: false, error: 'Anchor has no parent' };

    if (afterId !== null) {
      // After anchor: insert BEFORE anchor's next sibling (which places el AFTER anchor)
      // If anchor has no next sibling, append to anchor's parent
      // But if anchor CONTAINS el (el is a descendant of anchor), append to anchor instead
      if (anchor.contains(el)) {
        // el is inside anchor - append el to anchor (keeps it inside the same container)
        newParent = anchor;
        insertBefore = null; // append as last child of anchor
      } else {
        newParent = anchorParent;
        insertBefore = anchor.nextElementSibling;
      }
    } else {
      // Before anchor: insert BEFORE anchor
      newParent = anchorParent;
      insertBefore = anchor;
    }
  } else {
    newParent = elParent;
  }

  console.error('[source-patches] moveElement before remove:', { elTag: el.tagName, newParentTag: newParent.tagName, insertBefore: insertBefore ? insertBefore.tagName : null });

  // Remove el from DOM FIRST
  el.remove();

  // Now determine the final insert position
  // Key insight: when beforeId is set, insertBefore is anchor itself (not anchor's next sibling)
  // When insertBefore is null with beforeId set, anchor is last child -> appendChild places el BEFORE anchor (at end)
  // When insertBefore is null with afterId set, anchor is last child -> appendChild places el AFTER anchor (at end)
  if (anchor) {
    if (insertBefore) {
      newParent.insertBefore(el, insertBefore);
    } else {
      // insertBefore is null: anchor is last child
      // For beforeId: appendChild puts el at end, which is BEFORE anchor (correct)
      // For afterId: appendChild puts el at end, which is AFTER anchor (correct)
      newParent.appendChild(el);
    }
  } else {
    newParent.appendChild(el);
  }

  console.error('[source-patches] moveElement after insert, newParent children:', newParent.children.length, Array.from(newParent.children).map(c => c.tagName));

  // Update data-od-source-path to reflect new DOM position
  const newPath = pathForElement(el, doc);
  console.error('[source-patches] moveElement newPath:', newPath);
  if (newPath) {
    el.setAttribute(MANUAL_EDIT_SOURCE_PATH_ATTR, newPath);
  }

  return { ok: true };
}

function pathForElement(el: Element, doc: Document): string {
  const parts: number[] = [];
  let node: Element | null = el;
  while (node && node !== doc.body) {
    const parentEl: Element | null = node.parentElement;
    if (!parentEl) break;
    // Filter out host nodes to match bridge.ts behavior
    const siblings = Array.from(parentEl.children).filter((child) =>
      !child.matches(MANUAL_EDIT_HOST_NODE_SELECTOR),
    );
    parts.unshift(siblings.indexOf(node));
    node = parentEl;
  }
  return parts.length ? `path-${parts.join('-')}` : '';
}

function replaceOuterHtml(doc: Document, el: Element, html: string): { ok: true } | { ok: false; error: string } {
  const template = doc.createElement('template');
  template.innerHTML = html.trim();
  const elements = Array.from(template.content.children);
  if (elements.length !== 1) return { ok: false, error: 'Replacement HTML must contain exactly one root element.' };
  const next = elements[0]!;
  if (el.getAttribute('data-od-id') && !next.getAttribute('data-od-id')) {
    next.setAttribute('data-od-id', el.getAttribute('data-od-id') ?? '');
  }
  if (el.getAttribute('data-od-edit') && !next.getAttribute('data-od-edit')) {
    next.setAttribute('data-od-edit', el.getAttribute('data-od-edit') ?? '');
  }
  el.replaceWith(next);
  return { ok: true };
}

function setCssToken(doc: Document, token: string, value: string): boolean {
  const styles = Array.from(doc.querySelectorAll('style'));
  const pattern = new RegExp(`(${escapeRegExp(token)}\\s*:\\s*)([^;]+)(;)`);
  for (const style of styles) {
    const text = style.textContent ?? '';
    if (!pattern.test(text)) continue;
    style.textContent = text.replace(pattern, `$1${value}$3`);
    return true;
  }
  return false;
}

function cssEscape(value: string): string {
  if (typeof CSS !== 'undefined' && CSS.escape) return CSS.escape(value);
  return value.replace(/"/g, '\\"');
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function camelToKebab(value: string): string {
  return value.replace(/[A-Z]/g, (match) => `-${match.toLowerCase()}`);
}

function isSafeAttributeName(value: string): boolean {
  return /^[a-zA-Z_:][a-zA-Z0-9_:.-]*$/.test(value);
}
