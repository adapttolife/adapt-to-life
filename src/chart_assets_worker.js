// chart_assets_worker.js — Worker-only static asset imports for the Spec 70
// P2 PNG chart pipeline. wrangler resolves these via module rules: .wasm is
// CompiledWasm by default (imports as WebAssembly.Module — both satori's
// standalone init and resvg's initWasm accept a Module), .ttf via the Data
// rule in wrangler.jsonc (imports as ArrayBuffer).
//
// This module is ONLY reached through the dynamic import in chart_png.js's
// ensureInit(), so plain node (`node --test`) never evaluates it — tests
// call initChartAssets() with bytes read from disk instead.

import yogaWasm from "satori/yoga.wasm";
import resvgWasm from "@resvg/resvg-wasm/index_bg.wasm";
import interRegular from "../assets/fonts/Inter-Regular.ttf";
import interSemiBold from "../assets/fonts/Inter-SemiBold.ttf";

export { yogaWasm, resvgWasm, interRegular, interSemiBold };
