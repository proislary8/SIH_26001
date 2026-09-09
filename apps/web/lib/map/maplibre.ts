/**
 * MapLibre worker bootstrap.
 *
 * MapLibre parses GeoJSON in a Web Worker. Under Turbopack — which Next 16
 * uses for both dev and build — that worker was never instantiated, so
 * every GeoJSON source sat at `loaded: false` with an unresolved actor
 * promise. Raster basemaps and DOM markers still rendered, so the maps
 * looked alive while every risk zone, road and boundary silently vanished.
 *
 * next.config.ts carried a webpack rule for this, but webpack no longer
 * runs, so it was dead configuration.
 *
 * The fix is to serve the worker as a static asset and point MapLibre at
 * it. maplibre-gl-worker.mjs imports ./maplibre-gl-shared.mjs, so both are
 * copied into public/maplibre/ by scripts/copy-maplibre-worker.mjs, which
 * runs before dev and build.
 *
 * The maplibregl namespace is passed in rather than imported: importing it
 * here would pull the whole library into the server component graph and
 * break the build.
 */

interface WorkerConfigurable {
  setWorkerUrl(url: string): void;
}

let configured = false;

export function ensureMapLibreWorker(maplibregl: WorkerConfigurable): void {
  if (configured || typeof window === "undefined") return;
  maplibregl.setWorkerUrl("/maplibre/maplibre-gl-worker.mjs");
  configured = true;
}
