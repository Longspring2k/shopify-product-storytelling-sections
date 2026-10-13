const ALLOWED_PAUSE_REASONS = new Set([
  'hover',
  'focuswithin',
  'documenthidden',
  'reducedmotion',
]);
const ALLOWED_NAVIGATION_SOURCES = new Set(['manual', 'autoplay']);

function assertScheduler(scheduler) {
  if (!scheduler || typeof scheduler.set !== 'function' || typeof scheduler.clear !== 'function') {
    throw new TypeError('scheduler must expose set(callback, delay) and clear(id)');
  }
}

function assertInterval(intervalMs) {
  if (!Number.isSafeInteger(intervalMs) || intervalMs < 1000 || intervalMs > 60000) {
    throw new TypeError('intervalMs must be a safe integer from 1000 through 60000');
  }
}

function normalizeNavigationOptions(options) {
  if (!options || typeof options !== 'object' || Array.isArray(options) || Object.getPrototypeOf(options) !== Object.prototype) {
    throw new TypeError('navigation options must be a plain object');
  }
  const keys = Object.keys(options);
  if (keys.some((key) => key !== 'source')) throw new TypeError('navigation options have unsupported fields');
  const source = Object.hasOwn(options, 'source') ? options.source : 'manual';
  if (typeof source !== 'string' || !ALLOWED_NAVIGATION_SOURCES.has(source)) {
    throw new TypeError(`unsupported navigation source: ${String(source)}`);
  }
  return source;
}

export function normalizeSlides(value) {
  if (!Array.isArray(value)) throw new TypeError('slides must be an array');
  const seen = new Set();
  const result = Array.from(value, (slide, index) => {
    if (!slide || typeof slide !== 'object' || Array.isArray(slide)) {
      throw new TypeError(`slide ${index} must be an object`);
    }
    const keys = Object.keys(slide);
    if (keys.some((key) => key !== 'id' && key !== 'label')) {
      throw new TypeError(`slide ${index} has unsupported fields`);
    }
    if (typeof slide.id !== 'string' || slide.id.trim() === '') {
      throw new TypeError(`slide ${index} id must be a non-empty string`);
    }
    if (typeof slide.label !== 'string' || slide.label.trim() === '') {
      throw new TypeError(`slide ${index} label must be a non-empty string`);
    }
    if (seen.has(slide.id)) throw new TypeError(`duplicate slide id: ${slide.id}`);
    seen.add(slide.id);
    return Object.freeze({ id: slide.id, label: slide.label });
  });
  return Object.freeze(result);
}

export function createBrowserScheduler(windowObject = globalThis) {
  return Object.freeze({
    set: (callback, delay) => windowObject.setTimeout(callback, delay),
    clear: (id) => windowObject.clearTimeout(id),
  });
}

export function createFakeScheduler() {
  let now = 0;
  let nextId = 1;
  const records = new Map();

  const dueActiveRecords = (target) => [...records.values()]
    .filter((record) => !record.cancelled && !record.invoked && record.due <= target)
    .sort((a, b) => a.due - b.due || a.id - b.id);

  return {
    set(callback, delay) {
      const id = nextId++;
      records.set(id, { id, callback, due: now + delay, cancelled: false, invoked: false });
      return id;
    },
    clear(id) {
      const record = records.get(id);
      if (record) record.cancelled = true;
    },
    advanceBy(milliseconds) {
      if (!Number.isFinite(milliseconds) || milliseconds < 0) throw new TypeError('milliseconds must be non-negative');
      const target = now + milliseconds;
      for (;;) {
        const record = dueActiveRecords(target)[0];
        if (!record) break;
        now = record.due;
        record.invoked = true;
        record.callback();
      }
      now = target;
    },
    invokeEvenIfCancelled(id) {
      const record = records.get(id);
      if (!record || record.invoked) return;
      record.invoked = true;
      record.callback();
    },
    get pendingIds() {
      return [...records.values()]
        .filter((record) => !record.cancelled && !record.invoked)
        .map((record) => record.id);
    },
    get pendingCount() {
      return this.pendingIds.length;
    },
  };
}

export class CarouselLifecycle {
  #slides;
  #activeIndex;
  #scheduler;
  #intervalMs;
  #onChange;
  #pauseReasons = new Set();
  #rotationRequested = false;
  #timerId = null;
  #timerGeneration = 0;
  #destroyed = false;

  constructor({ slides = [], scheduler = createBrowserScheduler(), intervalMs = 5000, onChange = () => {} } = {}) {
    assertScheduler(scheduler);
    assertInterval(intervalMs);
    if (typeof onChange !== 'function') throw new TypeError('onChange must be a function');
    this.#slides = normalizeSlides(slides);
    this.#activeIndex = this.#slides.length > 0 ? 0 : -1;
    this.#scheduler = scheduler;
    this.#intervalMs = intervalMs;
    this.#onChange = onChange;
    this.#syncInsufficientSlides();
  }

  get state() {
    return Object.freeze({
      slides: this.#slides,
      activeIndex: this.#activeIndex,
      activeId: this.#activeIndex >= 0 ? this.#slides[this.#activeIndex].id : null,
      rotationRequested: this.#rotationRequested,
      pauseReasons: Object.freeze([...this.#pauseReasons].sort()),
      rotating: this.#timerId !== null,
      destroyed: this.#destroyed,
    });
  }

  startRotation() {
    this.#assertAlive();
    this.#rotationRequested = true;
    this.#reconcileTimer();
    this.#emit({ type: 'rotation', source: 'manual', announce: false });
  }

  stopRotation() {
    this.#assertAlive();
    this.#rotationRequested = false;
    this.#cancelTimer();
    this.#emit({ type: 'rotation', source: 'manual', announce: false });
  }

  addPauseReason(reason) {
    this.#assertAlive();
    this.#assertPauseReason(reason);
    if (reason === 'focuswithin') this.#rotationRequested = false;
    this.#pauseReasons.add(reason);
    this.#reconcileTimer();
    this.#emit({ type: 'pause', source: reason, announce: false });
  }

  removePauseReason(reason) {
    this.#assertAlive();
    if (reason === 'insufficientslides') throw new TypeError('insufficientslides is a derived pause reason');
    this.#assertPauseReason(reason);
    this.#pauseReasons.delete(reason);
    this.#reconcileTimer();
    this.#emit({ type: 'resume-check', source: reason, announce: false });
  }

  next(options = {}) {
    this.#moveBy(1, options);
  }

  previous(options = {}) {
    this.#moveBy(-1, options);
  }

  goTo(target, options = {}) {
    this.#assertAlive();
    const source = normalizeNavigationOptions(options);
    if (this.#slides.length === 0) throw new RangeError('cannot navigate an empty slide collection');
    let index;
    if (typeof target === 'string') {
      index = this.#slides.findIndex((slide) => slide.id === target);
      if (index < 0) throw new RangeError(`unknown slide id: ${target}`);
    } else {
      if (!Number.isSafeInteger(target)) throw new TypeError('slide index must be a safe integer');
      if (target < 0 || target >= this.#slides.length) throw new RangeError('slide index is out of bounds');
      index = target;
    }
    this.#activeIndex = index;
    this.#afterNavigation(source);
  }

  setSlides(value) {
    this.#assertAlive();
    const nextSlides = normalizeSlides(value);
    const activeId = this.#activeIndex >= 0 ? this.#slides[this.#activeIndex].id : null;
    const preservedIndex = activeId === null ? -1 : nextSlides.findIndex((slide) => slide.id === activeId);
    this.#slides = nextSlides;
    this.#activeIndex = nextSlides.length === 0 ? -1 : (preservedIndex >= 0 ? preservedIndex : 0);
    this.#syncInsufficientSlides();
    this.#reconcileTimer();
    this.#emit({ type: 'slides', source: 'collection', announce: false });
  }

  destroy() {
    if (this.#destroyed) return;
    this.#destroyed = true;
    this.#rotationRequested = false;
    this.#cancelTimer();
    this.#timerGeneration += 1;
    this.#onChange = () => {};
  }

  #moveBy(delta, options = {}) {
    this.#assertAlive();
    const source = normalizeNavigationOptions(options);
    if (this.#slides.length === 0) throw new RangeError('cannot navigate an empty slide collection');
    const target = (this.#activeIndex + delta + this.#slides.length) % this.#slides.length;
    this.#activeIndex = target;
    this.#afterNavigation(source);
  }

  #afterNavigation(source) {
    this.#reconcileTimer({ reset: true });
    this.#emit({ type: 'navigation', source, announce: source !== 'autoplay' });
  }

  #syncInsufficientSlides() {
    if (this.#slides.length <= 1) this.#pauseReasons.add('insufficientslides');
    else this.#pauseReasons.delete('insufficientslides');
  }

  #reconcileTimer({ reset = false } = {}) {
    const shouldSchedule = this.#rotationRequested && this.#pauseReasons.size === 0 && !this.#destroyed;
    if (!shouldSchedule) {
      this.#cancelTimer();
      return;
    }
    if (reset) this.#cancelTimer();
    if (this.#timerId !== null) return;
    const generation = ++this.#timerGeneration;
    const timerId = this.#scheduler.set(() => {
      if (this.#destroyed || generation !== this.#timerGeneration || timerId !== this.#timerId) return;
      this.#timerId = null;
      this.next({ source: 'autoplay' });
    }, this.#intervalMs);
    this.#timerId = timerId;
  }

  #cancelTimer() {
    if (this.#timerId !== null) this.#scheduler.clear(this.#timerId);
    this.#timerId = null;
    this.#timerGeneration += 1;
  }

  #assertPauseReason(reason) {
    if (typeof reason !== 'string' || !ALLOWED_PAUSE_REASONS.has(reason)) {
      throw new TypeError(`unsupported pause reason: ${String(reason)}`);
    }
  }

  #assertAlive() {
    if (this.#destroyed) throw new Error('carousel lifecycle is destroyed');
  }

  #emit(event) {
    this.#onChange(this.state, Object.freeze(event));
  }
}
