import { CarouselLifecycle, createFakeScheduler } from '../src/carousel-lifecycle.mjs';

const scheduler = createFakeScheduler();
const trace = [];
const carousel = new CarouselLifecycle({
  slides: [
    { id: 'origin', label: 'Origin notes' },
    { id: 'texture', label: 'Texture study' },
    { id: 'ritual', label: 'Use ritual' },
  ],
  scheduler,
  intervalMs: 2000,
  onChange: (state, event) => trace.push({ activeId: state.activeId, reasons: state.pauseReasons, event }),
});

carousel.startRotation();
carousel.addPauseReason('hover');
scheduler.advanceBy(5000);
carousel.removePauseReason('hover');
scheduler.advanceBy(2000);
carousel.next({ source: 'manual' });

console.log(JSON.stringify({ finalState: carousel.state, trace }, null, 2));
