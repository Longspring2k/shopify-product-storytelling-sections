import test from 'node:test';
import assert from 'node:assert/strict';

import {
  CarouselLifecycle,
  createFakeScheduler,
  normalizeSlides,
} from '../src/carousel-lifecycle.mjs';

const slides = [
  { id: 'origin', label: 'Origin' },
  { id: 'texture', label: 'Texture' },
  { id: 'ritual', label: 'Ritual' },
];

function setup(options = {}) {
  const scheduler = createFakeScheduler();
  const events = [];
  const carousel = new CarouselLifecycle({
    slides,
    scheduler,
    intervalMs: 2000,
    onChange: (state, event) => events.push({ state, event }),
    ...options,
  });
  return { carousel, scheduler, events };
}

test('autoplay is opt-in and advances after an explicit start', () => {
  const { carousel, scheduler } = setup();
  assert.equal(carousel.state.rotationRequested, false);
  assert.equal(scheduler.pendingCount, 0);

  carousel.startRotation();
  assert.equal(scheduler.pendingCount, 1);
  scheduler.advanceBy(2000);

  assert.equal(carousel.state.activeId, 'texture');
  assert.equal(scheduler.pendingCount, 1);
});

test('independent pause reasons arbitrate rotation without premature restart', () => {
  const { carousel, scheduler } = setup();
  carousel.startRotation();
  carousel.addPauseReason('hover');
  carousel.addPauseReason('documenthidden');
  assert.equal(scheduler.pendingCount, 0);

  carousel.removePauseReason('hover');
  assert.equal(scheduler.pendingCount, 0);
  assert.deepEqual(carousel.state.pauseReasons, ['documenthidden']);

  carousel.removePauseReason('documenthidden');
  assert.equal(scheduler.pendingCount, 1);
});

test('manual pause persists after transient reasons clear', () => {
  const { carousel, scheduler } = setup();
  carousel.startRotation();
  carousel.addPauseReason('hover');
  carousel.stopRotation();
  carousel.removePauseReason('hover');

  assert.equal(carousel.state.rotationRequested, false);
  assert.equal(scheduler.pendingCount, 0);
});

test('focus entry pauses and clearing focus still requires explicit resume', () => {
  const { carousel, scheduler } = setup();
  carousel.startRotation();
  carousel.addPauseReason('focuswithin');
  carousel.removePauseReason('focuswithin');

  assert.equal(carousel.state.rotationRequested, false);
  assert.equal(scheduler.pendingCount, 0);

  carousel.startRotation();
  assert.equal(scheduler.pendingCount, 1);
});

test('late callback from a cancelled timer cannot advance', () => {
  const { carousel, scheduler } = setup();
  carousel.startRotation();
  const pending = scheduler.pendingIds[0];
  carousel.addPauseReason('hover');

  scheduler.invokeEvenIfCancelled(pending);
  assert.equal(carousel.state.activeId, 'origin');
  assert.equal(scheduler.pendingCount, 0);
});

test('manual navigation resets the interval and keeps one active timer', () => {
  const { carousel, scheduler } = setup();
  carousel.startRotation();
  const stale = scheduler.pendingIds[0];

  carousel.next({ source: 'manual' });
  carousel.next({ source: 'manual' });

  assert.equal(carousel.state.activeId, 'ritual');
  assert.equal(scheduler.pendingCount, 1);
  scheduler.invokeEvenIfCancelled(stale);
  assert.equal(carousel.state.activeId, 'ritual');
});

test('rapid navigation wraps in both directions', () => {
  const { carousel } = setup();
  carousel.previous({ source: 'manual' });
  assert.equal(carousel.state.activeId, 'ritual');
  carousel.next({ source: 'manual' });
  assert.equal(carousel.state.activeId, 'origin');
  carousel.next({ source: 'manual' });
  carousel.next({ source: 'manual' });
  carousel.next({ source: 'manual' });
  assert.equal(carousel.state.activeId, 'origin');
});

test('goTo accepts an id or bounded safe integer and rejects malformed input atomically', () => {
  const { carousel } = setup();
  carousel.goTo('ritual', { source: 'manual' });
  assert.equal(carousel.state.activeIndex, 2);
  carousel.goTo(0, { source: 'manual' });
  const before = carousel.state;

  assert.throws(() => carousel.goTo(8, { source: 'manual' }), RangeError);
  assert.throws(() => carousel.goTo(1.5, { source: 'manual' }), TypeError);
  assert.deepEqual(carousel.state, before);
});

test('interval validation requires a safe integer from 1000ms through 60000ms', () => {
  for (const value of [999, 60001, Number.MAX_SAFE_INTEGER, 1.5, NaN, Infinity, '2000']) {
    assert.throws(() => setup({ intervalMs: value }), /intervalMs/);
  }
  assert.doesNotThrow(() => setup({ intervalMs: 60000 }));
});

test('zero and one slide are valid and never schedule rotation', () => {
  for (const candidate of [[], [{ id: 'only', label: 'Only' }]]) {
    const scheduler = createFakeScheduler();
    const carousel = new CarouselLifecycle({ slides: candidate, scheduler });
    carousel.startRotation();
    assert.equal(scheduler.pendingCount, 0);
    assert.ok(carousel.state.pauseReasons.includes('insufficientslides'));
  }
});

test('the derived insufficient-slides reason cannot be removed through the public pause API', () => {
  for (const candidate of [[], [{ id: 'only', label: 'Only' }]]) {
    const scheduler = createFakeScheduler();
    const carousel = new CarouselLifecycle({ slides: candidate, scheduler });
    carousel.startRotation();

    assert.throws(() => carousel.removePauseReason('insufficientslides'), /derived/i);
    assert.equal(scheduler.pendingCount, 0);
    assert.ok(carousel.state.pauseReasons.includes('insufficientslides'));
  }
});

test('dynamic replacement preserves active id or falls back to stable first', () => {
  const { carousel } = setup();
  carousel.goTo('texture', { source: 'manual' });
  carousel.setSlides([
    { id: 'new', label: 'New' },
    { id: 'texture', label: 'Texture revised' },
  ]);
  assert.equal(carousel.state.activeId, 'texture');

  carousel.setSlides([
    { id: 'first', label: 'First' },
    { id: 'second', label: 'Second' },
  ]);
  assert.equal(carousel.state.activeId, 'first');
});

test('duplicate ids and malformed slides fail without changing the collection', () => {
  const { carousel } = setup();
  const before = carousel.state;
  assert.throws(() => carousel.setSlides([
    { id: 'same', label: 'A' },
    { id: 'same', label: 'B' },
  ]), /duplicate/i);
  assert.throws(() => carousel.setSlides([{ id: '', label: 'A' }]), /id/);
  assert.deepEqual(carousel.state, before);
});

test('sparse slide arrays are rejected by construction and setSlides stays atomic', () => {
  const sparse = Array(2);
  sparse[1] = { id: 'present', label: 'Present' };
  assert.throws(() => new CarouselLifecycle({ slides: sparse }), /slide 0/i);

  const { carousel } = setup();
  const before = carousel.state;
  assert.throws(() => carousel.setSlides(sparse), /slide 0/i);
  assert.deepEqual(carousel.state, before);
});

test('navigation validates exact option shape and source before changing state or timers', () => {
  const { carousel, scheduler, events } = setup();
  carousel.startRotation();
  const before = carousel.state;
  const pendingBefore = scheduler.pendingIds;
  const eventCount = events.length;

  const attempts = [
    () => carousel.next(null),
    () => carousel.previous([]),
    () => carousel.goTo(1, { source: 'keyboard' }),
    () => carousel.next({ source: 'manual', extra: true }),
    () => carousel.goTo(1, Object.create({ source: 'manual' })),
  ];

  for (const attempt of attempts) {
    assert.throws(attempt, /options|source/i);
    assert.deepEqual(carousel.state, before);
    assert.deepEqual(scheduler.pendingIds, pendingBefore);
    assert.equal(events.length, eventCount);
  }
});

test('destroy is idempotent, cancels work and invalidates late callbacks', () => {
  const { carousel, scheduler } = setup();
  carousel.startRotation();
  const pending = scheduler.pendingIds[0];
  carousel.destroy();
  carousel.destroy();
  scheduler.invokeEvenIfCancelled(pending);

  assert.equal(carousel.state.destroyed, true);
  assert.equal(carousel.state.activeId, 'origin');
  assert.equal(scheduler.pendingCount, 0);
  assert.throws(() => carousel.next(), /destroyed/);
});

test('manual changes announce while autoplay changes remain silent', () => {
  const { carousel, scheduler, events } = setup();
  carousel.next({ source: 'manual' });
  assert.equal(events.at(-1).event.announce, true);

  carousel.startRotation();
  scheduler.advanceBy(2000);
  assert.equal(events.at(-1).event.source, 'autoplay');
  assert.equal(events.at(-1).event.announce, false);
});

test('normalizeSlides returns frozen copies instead of retaining caller objects', () => {
  const input = [{ id: 'a', label: 'A' }];
  const result = normalizeSlides(input);
  input[0].label = 'Changed';
  assert.equal(result[0].label, 'A');
  assert.equal(Object.isFrozen(result), true);
  assert.equal(Object.isFrozen(result[0]), true);
});
