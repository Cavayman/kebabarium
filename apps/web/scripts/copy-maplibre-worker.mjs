// MapLibre loads its worker from a URL; ship the files next to the app (dev-only map engine).
import { copyFileSync, mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
const dist = dirname(createRequire(import.meta.url).resolve("maplibre-gl/dist/maplibre-gl.mjs"));
const out = new URL("../public/maplibre/", import.meta.url);
mkdirSync(out, { recursive: true });
for (const f of ["maplibre-gl-worker.mjs", "maplibre-gl-shared.mjs"]) copyFileSync(join(dist, f), new URL(f, out));
