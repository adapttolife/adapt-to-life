import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Mission Control (Spec 127 P1).
//
// Builds INTO public/admin/app/ rather than over public/admin/, so the existing
// single-file /admin/qr keeps serving untouched for the whole migration —
// AC1's "nothing goes dark mid-flight" is a property of the layout, not a
// promise anyone has to remember to keep.
//
// Root-level config, and the deps live in the root package.json, because merges
// auto-deploy through Workers Builds: one `npm install` at the repo root has to
// be enough to build this, or CI ships a stale app and nobody notices.
export default defineConfig({
  root: "admin-app",
  base: "/admin/app/",
  plugins: [react()],
  build: {
    outDir: "../public/admin/app",
    emptyOutDir: true,
    // Sourcemaps are worth the disk here: this is behind Access, seen by two
    // people, and a stack trace that names a minified symbol wastes an hour.
    sourcemap: true,
    // No manual chunking yet: P1 has no chart library to split out. Observable
    // Plot and d3-geo were installed while scaffolding and removed again once
    // it was clear nothing in P1 uses them — a bar and a sparkline are less
    // code direct than configured. They come back in P2 for the map, where a
    // projection is real work.
  },
});
