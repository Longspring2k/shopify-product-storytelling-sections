# Engineering decisions

## Pure lifecycle core

The core knows about slide identity, active index, user rotation intent, pause reasons and scheduler ownership. It does not query the DOM. This permits deterministic tests and lets a platform adapter translate real lifecycle events without embedding browser state in transition logic.

## Independent blockers, not one paused flag

A set models simultaneous reasons. Clearing hover cannot override a hidden document or reduced-motion preference. User intent is stored separately; explicit Stop persists after transient reasons disappear.

## Conservative focus policy

Focus entry stops requested rotation rather than merely suspending it. This avoids motion resuming immediately after keyboard exploration. The user can restart through a native button after focus leaves.

## One-shot scheduling

Chained one-shot timers expose reset rules and enable generation-token invalidation. Manual navigation begins a new full interval only when rotation is still permitted. A cancelled callback is harmless even if an injected scheduler invokes it late.

## Button selectors rather than fake tabs

The selectors are native buttons with `aria-current`, not incomplete ARIA tabs. Arrow/Home/End handling is an optional convenience layered on normal button operation. Previous/next navigation does not steal focus.

## Dynamic update policy

A valid replacement preserves the active ID when possible; otherwise it selects the first item. Invalid candidates are rejected before mutation. This deterministic policy is appropriate for section re-rendering without pretending to resolve semantic similarity.

## Core and DOM boundaries

The pure core accepts zero or one slide so collection transitions stay representable, and derives a non-removable scheduling guard for them. The browser adapter is stricter: it fails before listener attachment unless it finds matching, non-empty panels and thumbnails plus every required control/output. On remount it samples existing hover and focus-within state instead of waiting for a new entry event.

See [Carousel lifecycle engineering notes](carousel-lifecycle.md) for contracts, lifecycle details, failure responses and the Shopify adapter boundary.
