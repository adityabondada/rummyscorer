import '@testing-library/jest-dom/vitest';

// jsdom has no ResizeObserver, which the charts use to fit their container.
class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
globalThis.ResizeObserver ??= ResizeObserverStub;
