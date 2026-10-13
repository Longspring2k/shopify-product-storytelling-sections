# Carousel lifecycle engineering notes

This public demo narrows the original project's broader section work to one mechanism: deterministic carousel lifecycle management. It is newly authored, dependency-free code. It is not extracted Shopify theme source and it does not connect to a store.

## Entry points

| Path | Responsibility |
| --- | --- |
| `src/carousel-lifecycle.mjs` | Pure state transitions, validation, pause arbitration and timer ownership |
| `test/carousel-lifecycle.test.mjs` | Deterministic unit tests using an injectable fake scheduler |
| `demo/browser-adapter.mjs` | DOM events, focus-order updates, visibility and reduced-motion integration |
| `demo/index.html` | Native-control demo with three illustrative panels |
| `demo/server.mjs` | Static loopback server with route and method restrictions |
| `demo/run.mjs` | Deterministic command-line lifecycle trace |

## Data contract and atomic validation

A slide collection is an array of exact objects:

```js
{ id: 'stable-id', label: 'Human-readable label' }
```

`id` and `label` must be non-empty strings. IDs must be unique. Unknown object fields, sparse arrays and non-array collections are rejected before internal state changes. The implementation stores frozen copies, so later caller mutation cannot change the model accidentally. An empty collection and a single-slide collection are valid in the core, but they add the internally derived `insufficientslides` reason and cannot schedule rotation. That reason cannot be added or removed through the public pause API.

`intervalMs` must be a safe integer from 1000 through 60000 milliseconds. This demo bound avoids native timer overflow/clamping behavior and is not presented as a universal browser limit. Navigation indexes must be safe integers within the current collection. Navigation options must be plain exact objects with only `source`, whose value is `manual` or `autoplay`. Failed `setSlides` and navigation operations leave prior state, timers and events untouched.

## Pause-reason lattice

The model separates **intent** from **permission**:

- `rotationRequested` records whether the user explicitly requested rotation.
- The pause-reason set records independent external blockers: `hover`, `focuswithin`, `documenthidden`, and `reducedmotion`, plus the core-derived `insufficientslides` guard.
- A timer may exist only when intent is true, the set is empty, and the instance is alive.

Removing one reason never restarts while another reason remains. Hover, hidden-document and reduced-motion reasons preserve intent, so clearing the final transient reason may schedule a new full interval. Focus uses a more conservative policy: focus entry also clears rotation intent. Leaving the component therefore cannot resume motion unexpectedly; the user must press **Start rotation** again. This policy is visible in the demo and locked by a unit test.

## Timer ownership and interval reset

At most one timer is active. Manual navigation cancels the current timer and starts a full interval only if rotation remains permitted. A timer callback captures a generation token and its own ID. Cancellation increments the generation, so even a hostile scheduler that invokes a cancelled callback late cannot advance the slide. `destroy()` cancels and invalidates pending work, drops the observer callback and is idempotent.

This implementation uses chained one-shot timeouts instead of `setInterval`. The next period begins after each accepted advance, which makes resets explicit and prevents queued interval ticks from racing manual input.

## Dynamic collections

`setSlides()` validates the complete candidate first. If the active ID remains present, it stays active even if its position changes. Otherwise the first item in the new collection is selected. This is a stable and explainable fallback; the model does not guess a nearest semantic neighbor. Replacing with zero or one item disables scheduling through the normal reason lattice.

## Focus and ARIA policy

The three selectors are ordinary buttons, not fake tabs. They choose content but do not implement the complete ARIA tabs pattern, so they intentionally omit `role="tab"` and `role="tabpanel"`. Arrow Left/Right, Home and End are convenience keyboard bindings; they update the same active index as pointer clicks and move focus only among selector buttons after a key command.

The adapter does not move focus when autoplay or previous/next controls change the active item. Focusable descendants in hidden panels receive `tabindex="-1"`; their prior tabindex is restored when the panel becomes active. Native `hidden` also removes inactive panels from rendering and accessibility traversal in supporting browsers.

The polite live region announces manual changes only. Autoplay changes stay silent to avoid repeated screen-reader interruptions. The rotation control exposes pressed state and explicit Start/Stop wording. These choices improve the review surface but are not a claim of complete accessibility certification.

## Browser lifecycle adapter

The adapter owns listeners for pointer entry/exit, focus entry/exit, document visibility, `matchMedia` changes, controls and selectors. Before attaching behavior it requires non-empty, matching panel/thumbnail collections and every required control/output; zero slides remain valid only at the pure-core boundary. During mount it evaluates current `document.hidden`, reduced-motion, `root.matches(':hover')`, and whether `document.activeElement` is already inside the root. This prevents editor-style remounts from losing an already-active pause condition. `focusout` checks `relatedTarget` containment, avoiding false exits while focus moves between descendants. `pointerenter`/`pointerleave` avoid bubbling child transitions that `mouseover`/`mouseout` would produce.

`destroy()` removes every registered listener before destroying the model. `mount()` destroys an existing adapter first, which demonstrates the responsibility a Shopify Theme Editor integration would have during section unload/reload. Actual `shopify:section:load`, `shopify:section:unload`, block-selection events and schema settings are not implemented here.

## Alternatives considered

- **CSS scroll snap:** useful for direct manipulation, but it does not remove the need for pause intent, live-region and dynamic-collection policy.
- **`setInterval`:** shorter, but makes cancellation races and post-navigation reset semantics less explicit.
- **ARIA tabs:** suitable if the selectors are genuinely a tab interface. Ordinary buttons avoid claiming that pattern while still offering optional arrow-key convenience.
- **Automatic resume after focus leaves:** rejected because content could move immediately after keyboard exploration.

## Failure and response matrix

| Condition | Response | State mutation |
| --- | --- | --- |
| Duplicate/empty slide ID | `TypeError` | None |
| Unknown slide fields | `TypeError` | None |
| Interval outside 1000–60000 ms | Constructor `TypeError` | No instance |
| Sparse slide array | `TypeError` | None / no instance |
| Malformed navigation options/source | `TypeError` | None |
| Unknown ID/out-of-range index | `RangeError` | None |
| Zero slides | Navigation `RangeError`; rotation blocked | Collection remains valid |
| Late cancelled callback | Ignored by generation/ID guard | None |
| Destroyed instance method | Error, except idempotent `destroy()` | None |

## Test matrix

The unit tests cover explicit start, overlapping pause reasons, persistent manual stop, focus policy, hostile late callbacks, one-timer ownership, rapid wraparound, exact navigation validation, bounded intervals, derived insufficient-slide protection, zero/one-slide behavior, sparse-array rejection and atomic replacement, active-ID preservation, stable fallback, idempotent disposal, announcement policy and defensive copying. Tests use no sleeps and do not depend on wall-clock timing. Browser adapter remount behavior requires browser review; Node unit tests do not impersonate DOM coverage.

## Shopify section mapping (not executed)

A production section could map blocks to the `{id, label}` model, pass interval seconds after converting and validating them, and instantiate an adapter per section root. The Theme Editor adapter would destroy on section unload and remount on load. It would also decide how merchant block selection affects active state and rotation. This repository does not include Liquid schema, theme assets, store data, platform APIs or deployment code, so it should not be treated as a theme engine or an installable Shopify section.
