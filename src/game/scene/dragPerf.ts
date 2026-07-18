// TEMPORARY drag-stutter diagnostics — remove after we've read the numbers.
// Counts React re-renders of the fit-driven ghost components during a drag, so we can
// correlate them with onUpdate gaps measured in usePartDrag. If a single drag shows dozens
// of ghost/hint re-renders and onUpdate gaps spiking to 100ms+, the JS-thread starvation
// hypothesis is confirmed.
export const dragPerf = {
  ghostRenders: 0,
  hintRenders: 0,
  setDragFitCalls: 0,
  reset() {
    this.ghostRenders = 0;
    this.hintRenders = 0;
    this.setDragFitCalls = 0;
  },
};
