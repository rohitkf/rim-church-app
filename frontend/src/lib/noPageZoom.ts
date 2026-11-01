/*
 * No pinching the whole page bigger, so the app feels like an app.
 *
 * The viewport tag says so (maximum-scale=1, user-scalable=no), and
 * Android keeps to it. iOS Safari has ignored user-scalable since iOS 10,
 * but it still sends its own gesture events for a pinch. Cancelling those
 * stops the page zooming. Pointer and touch events are untouched, so the
 * stage layout's own pinch (StageCanvas) and the map's (PlaceMap) still work.
 * A double tap doesn't zoom either: the body's touch-action: manipulation
 * covers that.
 */
export function stopPageZoom(target: Pick<Document, 'addEventListener'> = document) {
  const cancel = (e: Event) => e.preventDefault()
  for (const type of ['gesturestart', 'gesturechange', 'gestureend']) {
    target.addEventListener(type, cancel, { passive: false })
  }
}
