# Edit Mode Implementation Guide

## Overview

This document describes how the edit mode functionality works in Open Design, specifically the text editing and element drag-and-drop reorder features.

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     FileViewer (React)                      │
│  - Manages edit mode state                                  │
│  - Receives postMessage from iframe                        │
│  - Applies patches via source-patches.ts                   │
│  - Writes changes back to file via writeProjectTextFile   │
└─────────────────────────┬───────────────────────────────────┘
                          │ postMessage (od-edit-reorder, od-edit-select, od-edit-text-change)
┌─────────────────────────▼───────────────────────────────────┐
│                    iframe (srcdoc)                          │
│  - Contains buildManualEditBridge() injected script        │
│  - Handles drag-drop on HTML elements                      │
│  - Sends messages to parent via window.parent.postMessage   │
└─────────────────────────────────────────────────────────────┘
```

## Key Files

| File | Purpose |
|------|---------|
| `apps/web/src/edit-mode/bridge.ts` | Generates JavaScript for iframe drag-drop handling |
| `apps/web/src/edit-mode/source-patches.ts` | Applies DOM mutations to HTML source |
| `apps/web/src/edit-mode/types.ts` | TypeScript types for patches and messages |
| `apps/web/src/components/FileViewer.tsx` | React component managing edit mode |

## Element Discovery

Elements are discovered using `MANUAL_EDIT_DISCOVERY_SELECTOR`:

```typescript
export const MANUAL_EDIT_DISCOVERY_SELECTOR = 'main, nav, section, article, header, footer, div, h1, h2, h3, p, a, button, img, strong, span';
```

Each discovered element is assigned a stable ID via `manualEditStableIdForElement()`:

```typescript
// Priority: explicit data-od-id > data-od-source-path > data-od-runtime-id > generated DOM path
export function manualEditStableIdForElement(el: Element): string {
  const explicit = el.getAttribute('data-od-id');
  if (explicit) return explicit;
  const generated = el.getAttribute(MANUAL_EDIT_SOURCE_PATH_ATTR) || el.getAttribute('data-od-runtime-id') || manualEditDomPathForElement(el);
  if (generated) el.setAttribute('data-od-runtime-id', generated);
  return generated || 'unknown';
}
```

## Drag-and-Drop Reorder

### Bridge (iframe-side)

The `buildManualEditBridge()` function generates an inline `<script>` that:

1. **Attaches drag handlers** to all discovered elements via `attachDragHandlers()`
2. **Tracks drag source** using `draggedId` variable and `data-od-drag-source` attribute
3. **Shows drop indicator** (blue line) on `dragover`
4. **Sends reorder message** on `drop` via `window.parent.postMessage()`

```javascript
window.parent.postMessage({
  type: 'od-edit-reorder',
  id: dropId,           // ID of element being moved
  afterId: afterId,      // Insert after this element (or null)
  beforeId: beforeId     // Insert before this element (or null)
}, '*');
```

### Cycle Prevention

Before allowing a drop, the bridge checks if the target is a descendant of the source:

```typescript
if (srcEl && el !== srcEl && srcEl.contains(el)) {
  // Invalid: would create a DOM cycle
  return;
}
```

### Source Patches (applyManualEditPatch)

The `moveElement` function in `source-patches.ts` performs the actual DOM manipulation:

```typescript
function moveElement(doc, id, afterId, beforeId) {
  const el = findEditableElement(doc, id);
  el.remove();
  if (anchor) {
    if (afterId !== null) {
      // Insert after anchor
      anchor.parentElement.insertBefore(el, anchor.nextElementSibling);
    } else {
      // Insert before anchor
      anchor.parentElement.insertBefore(el, anchor);
    }
  } else {
    parent.appendChild(el);
  }
  return { ok: true };
}
```

## Text Editing

### Double-Click Edit Flow

1. User double-clicks an element in the iframe
2. Bridge sets `contenteditable="true"` and `data-od-editing-text="true"`
3. Text is selected via `window.getSelection()`
4. On blur, bridge sends `od-edit-text-change` message:

```javascript
window.parent.postMessage({
  type: 'od-edit-text-change',
  id: stableId(el),
  text: newText
}, '*');
```

5. FileViewer applies `set-text` patch via `applyManualEditPatch()`

## Message Handling (FileViewer)

FileViewer listens for messages from the iframe:

```typescript
function onMessage(ev: MessageEvent) {
  const data = ev.data as ManualEditBridgeMessage;
  if (!data?.type) return;

  switch (data.type) {
    case 'od-edit-reorder':
      void applyManualEdit({ kind: 'move-element', id: data.id, afterId: data.afterId, beforeId: data.beforeId }, 'Move element');
      break;
    case 'od-edit-text-change':
      void applyManualEdit({ kind: 'set-text', id: data.id, value: data.text }, 'Edit text');
      break;
  }
}
```

**Important**: Due to iframe sandbox restrictions, `ev.source` cannot be reliably compared. Messages are filtered by type prefix `od-edit-`.

## State Flow

```
1. Enter edit mode → setManualEditFrozenSource(livePreviewSource)
2. User drags element → bridge sends od-edit-reorder
3. FileViewer receives → applyManualEditPatch()
4. Patch applied to source → writeProjectTextFile()
5. File saved → setManualEditFrozenSource(result.source)  // Updates iframe without full reload
6. History entry created → setManualEditHistory()
```

## Key Challenges

### 1. Iframe Sandbox Restrictions

The srcdoc iframe runs with `sandbox="allow-scripts"` (no `allow-same-origin`), which means:
- `ev.source` in postMessage cannot be compared to `iframeRef.current?.contentWindow`
- `dataTransfer.getData()` may not work reliably across iframe boundary

**Solution**: Track drag source using closure variable `draggedId` and `data-od-drag-source` attribute, not relying on dataTransfer.

### 2. DOM Path Instability

Elements without `data-od-id` get generated path IDs like `path-0-1-0-0`. These are fragile if DOM structure changes.

**Solution**: Elements are annotated with `data-od-source-path` during srcdoc building, which is stable per source structure.

### 3. Cycle Prevention

Moving an element into its own descendant would cause `HierarchyRequestError`.

**Solution**: Check `srcEl.contains(el)` before allowing drop. If target is inside source, reject the drop silently.

### 4. Live Preview vs Frozen Source

In edit mode, the iframe shows a "frozen" snapshot (`manualEditFrozenSource`) to avoid iframe reloads during style edits. But after structural changes (move, text edit), the frozen source must be updated.

**Solution**: After applying `move-element` or `set-text` patches, call `setManualEditFrozenSource(result.source)` so the iframe rebuilds with correct content.

## Patch Types

| Kind | Description |
|------|-------------|
| `set-text` | Replace text content |
| `set-link` | Change link text and href |
| `set-image` | Change image src and alt |
| `set-style` | Apply inline style changes |
| `set-attributes` | Modify element attributes |
| `set-outer-html` | Replace entire element markup |
| `set-token` | Modify CSS custom property value |
| `set-full-source` | Replace entire document (undo) |
| `move-element` | Reorder element in DOM |

## Testing

Run unit tests:

```bash
pnpm --filter @open-design/web exec vitest run tests/edit-mode/
```

Key test files:
- `tests/edit-mode/source-patches.test.ts` - Patch application logic
- `tests/edit-mode/bridge.test.ts` - Bridge message handling
- `tests/edit-mode/move-element.test.ts` - Move operation specific tests