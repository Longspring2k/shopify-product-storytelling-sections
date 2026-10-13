import { CarouselLifecycle } from '../src/carousel-lifecycle.mjs';

function createBrowserCarouselAdapter(root, { windowObject = window, documentObject = document } = {}) {
  if (!(root instanceof windowObject.HTMLElement)) throw new TypeError('root must be an HTMLElement');

  const panels = [...root.querySelectorAll('[data-carousel-panel]')];
  const thumbnails = [...root.querySelectorAll('[data-carousel-thumbnail]')];
  const previousButton = root.querySelector('[data-carousel-previous]');
  const nextButton = root.querySelector('[data-carousel-next]');
  const rotationButton = root.querySelector('[data-carousel-rotation]');
  const liveRegion = root.querySelector('[data-carousel-live]');
  const reasonsOutput = root.querySelector('[data-carousel-reasons]');
  const requiredControls = { previousButton, nextButton, rotationButton, liveRegion, reasonsOutput };
  for (const [name, element] of Object.entries(requiredControls)) {
    if (!element) throw new TypeError(`carousel requires ${name}`);
  }
  if (panels.length === 0 || thumbnails.length === 0 || panels.length !== thumbnails.length) {
    throw new TypeError('carousel DOM requires matching non-empty panels and thumbnails');
  }
  const motionQuery = windowObject.matchMedia('(prefers-reduced-motion: reduce)');
  const disposers = [];
  let destroyed = false;

  const slides = panels.map((panel) => ({
    id: panel.dataset.carouselPanel,
    label: panel.dataset.label,
  }));

  const render = (state, event = { announce: false }) => {
    panels.forEach((panel, index) => {
      const active = index === state.activeIndex;
      panel.hidden = !active;
      panel.setAttribute('aria-hidden', String(!active));
      for (const focusable of panel.querySelectorAll('a, button, input, select, textarea, [tabindex]')) {
        if (!active) {
          if (!focusable.hasAttribute('data-carousel-tabindex')) {
            focusable.setAttribute('data-carousel-tabindex', focusable.getAttribute('tabindex') ?? '');
          }
          focusable.setAttribute('tabindex', '-1');
        } else if (focusable.hasAttribute('data-carousel-tabindex')) {
          const stored = focusable.getAttribute('data-carousel-tabindex');
          if (stored === '') focusable.removeAttribute('tabindex');
          else focusable.setAttribute('tabindex', stored);
          focusable.removeAttribute('data-carousel-tabindex');
        }
      }
    });

    thumbnails.forEach((button, index) => {
      const active = index === state.activeIndex;
      button.setAttribute('aria-current', active ? 'true' : 'false');
      button.classList.toggle('is-active', active);
    });

    rotationButton.textContent = state.rotationRequested ? 'Stop rotation' : 'Start rotation';
    rotationButton.setAttribute('aria-pressed', String(state.rotationRequested));
    root.dataset.reducedMotion = String(state.pauseReasons.includes('reducedmotion'));
    reasonsOutput.textContent = state.pauseReasons.length ? state.pauseReasons.join(', ') : 'none';
    if (event.announce && state.activeIndex >= 0) {
      liveRegion.textContent = `Showing ${state.slides[state.activeIndex].label}, slide ${state.activeIndex + 1} of ${state.slides.length}.`;
    }
  };

  const lifecycle = new CarouselLifecycle({ slides, intervalMs: 4000, onChange: render });

  const listen = (target, type, listener) => {
    target.addEventListener(type, listener);
    disposers.push(() => target.removeEventListener(type, listener));
  };

  listen(previousButton, 'click', () => lifecycle.previous({ source: 'manual' }));
  listen(nextButton, 'click', () => lifecycle.next({ source: 'manual' }));
  listen(rotationButton, 'click', () => {
    if (lifecycle.state.rotationRequested) lifecycle.stopRotation();
    else lifecycle.startRotation();
  });

  thumbnails.forEach((button, index) => {
    listen(button, 'click', () => lifecycle.goTo(index, { source: 'manual' }));
    listen(button, 'keydown', (event) => {
      const keys = ['ArrowLeft', 'ArrowRight', 'Home', 'End'];
      if (!keys.includes(event.key)) return;
      event.preventDefault();
      let targetIndex = index;
      if (event.key === 'ArrowLeft') targetIndex = (index - 1 + thumbnails.length) % thumbnails.length;
      if (event.key === 'ArrowRight') targetIndex = (index + 1) % thumbnails.length;
      if (event.key === 'Home') targetIndex = 0;
      if (event.key === 'End') targetIndex = thumbnails.length - 1;
      lifecycle.goTo(targetIndex, { source: 'manual' });
      thumbnails[targetIndex].focus();
    });
  });

  listen(root, 'pointerenter', () => lifecycle.addPauseReason('hover'));
  listen(root, 'pointerleave', () => lifecycle.removePauseReason('hover'));
  listen(root, 'focusin', () => lifecycle.addPauseReason('focuswithin'));
  listen(root, 'focusout', (event) => {
    if (!root.contains(event.relatedTarget)) lifecycle.removePauseReason('focuswithin');
  });

  const applyVisibility = () => {
    const hidden = documentObject.hidden;
    const hasReason = lifecycle.state.pauseReasons.includes('documenthidden');
    if (hidden && !hasReason) lifecycle.addPauseReason('documenthidden');
    if (!hidden && hasReason) lifecycle.removePauseReason('documenthidden');
  };
  const applyMotion = () => {
    const reduced = motionQuery.matches;
    const hasReason = lifecycle.state.pauseReasons.includes('reducedmotion');
    if (reduced && !hasReason) lifecycle.addPauseReason('reducedmotion');
    if (!reduced && hasReason) lifecycle.removePauseReason('reducedmotion');
  };
  const applyHover = () => {
    if (root.matches(':hover')) lifecycle.addPauseReason('hover');
  };
  const applyFocusWithin = () => {
    if (root.contains(documentObject.activeElement)) lifecycle.addPauseReason('focuswithin');
  };
  listen(documentObject, 'visibilitychange', applyVisibility);
  listen(motionQuery, 'change', applyMotion);

  applyVisibility();
  applyMotion();
  applyHover();
  applyFocusWithin();
  render(lifecycle.state);

  return Object.freeze({
    lifecycle,
    destroy() {
      if (destroyed) return;
      destroyed = true;
      for (const dispose of disposers.splice(0)) dispose();
      lifecycle.destroy();
    },
  });
}

let adapter = null;
function mount() {
  adapter?.destroy();
  adapter = createBrowserCarouselAdapter(document.querySelector('[data-carousel]'));
}

mount();
window.addEventListener('pagehide', () => adapter?.destroy(), { once: true });
window.carouselDemo = Object.freeze({ mount, destroy: () => adapter?.destroy() });

export { createBrowserCarouselAdapter };
