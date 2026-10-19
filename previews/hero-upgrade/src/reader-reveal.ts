/** One cancelable first-paint reveal; route changes invalidate late callbacks. */
export function mountReaderReveal(reveal: () => void) {
  let frame = 0;
  let generation = 0;
  let disposed = false;

  function cancel(): void {
    generation++;
    if (frame) cancelAnimationFrame(frame);
    frame = 0;
  }

  return {
    get pending() { return frame !== 0; },
    schedule() {
      if (disposed) return;
      cancel();
      const current = generation;
      frame = requestAnimationFrame(() => {
        if (disposed || current !== generation) return;
        frame = 0;
        reveal();
      });
    },
    cancel,
    dispose() { if (disposed) return; disposed = true; cancel(); },
  };
}
