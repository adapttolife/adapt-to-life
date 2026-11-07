#!/usr/bin/env node
// scripts/build-seats.mjs: the six seats' pictures, cut from the crew cutouts.
//
// Alec, Nov 7 2026: "let's add the names of each seat - it's the same as the
// six on meet the wheelie big dills crew page - maybe use their picture
// instead of the wheelchair icon? More impactful? More personal?"
//
// The seats are the six athletes on /pickleball ("Meet the crew"), listed in
// public/data/campaigns.json (the road's seats). From each cutout
// (public/images/pickleball/<slug>.webp) this writes:
//
//   public/images/pickleball/seats/<slug>.webp  the athlete in the chair, 200px
//                                                tall, for the seat tiles on /send-6
//   public/images/pickleball/seats/faces.webp    all six faces in one strip,
//                                                96px each, so the module and
//                                                /numbers spend one request on six
//
// Every picture keeps the cutout's transparency, so the page draws the ground.
//   node scripts/build-seats.mjs          write them
//   node scripts/build-seats.mjs --check  fail if a seat has no picture
import sharp from "sharp";
import { readFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SRC = join(ROOT, "public/images/pickleball");
const OUT = join(SRC, "seats");
const data = JSON.parse(readFileSync(join(ROOT, "public/data/campaigns.json"), "utf8"));
const road = data.campaigns
  .find((c) => c.slug === "wheelie-big-dills")
  .parts.find((p) => p.key === "send-6");
const SEATS = road.seats;

// Head and shoulders, as [centre x, centre y, side] in each 900px-tall
// cutout. Set by eye against the photos; check the strip after a new photo.
const FACE = {
  juan: [338, 120, 250],
  brian: [578, 140, 270],
  bob: [296, 250, 220],
  robby: [336, 128, 250],
  ken: [430, 118, 220],
  amanda: [474, 120, 220],
};
const FACE_PX = 96;
const FIGURE_H = 200;

if (process.argv.includes("--check")) {
  const missing = SEATS.flatMap((s) =>
    [join(OUT, `${s.slug}.webp`)].filter((f) => !existsSync(f)),
  );
  if (!existsSync(join(OUT, "faces.webp"))) missing.push(join(OUT, "faces.webp"));
  const noBox = SEATS.filter((s) => !FACE[s.slug]).map((s) => s.slug);
  if (missing.length || noBox.length) {
    console.error(
      "build-seats --check FAILED. Run `node scripts/build-seats.mjs`.\n  " +
        missing.concat(noBox.map((n) => `no face box for ${n}`)).join("\n  "),
    );
    process.exit(1);
  }
  console.log(`build-seats --check ok (${SEATS.length} seats)`);
  process.exit(0);
}

mkdirSync(OUT, { recursive: true });
const faces = [];
for (const [i, s] of SEATS.entries()) {
  const file = join(SRC, `${s.slug}.webp`);
  const meta = await sharp(file).metadata();
  // The figure, for the tile.
  await sharp(file)
    .resize({ height: FIGURE_H })
    .webp({ quality: 80, alphaQuality: 90, effort: 6 })
    .toFile(join(OUT, `${s.slug}.webp`));
  // The face, for the strip.
  const box = FACE[s.slug];
  if (!box) throw new Error(`no face box for ${s.slug}`);
  const [cx, cy, side] = box;
  const left = Math.max(0, Math.min(meta.width - side, Math.round(cx - side / 2)));
  const top = Math.max(0, Math.min(meta.height - side, Math.round(cy - side / 2)));
  faces.push({
    input: await sharp(file)
      .extract({ left, top, width: side, height: side })
      .resize(FACE_PX, FACE_PX)
      .png()
      .toBuffer(),
    left: i * FACE_PX,
    top: 0,
  });
}
await sharp({
  create: {
    width: FACE_PX * SEATS.length,
    height: FACE_PX,
    channels: 4,
    background: { r: 0, g: 0, b: 0, alpha: 0 },
  },
})
  .composite(faces)
  .webp({ quality: 82, alphaQuality: 90, effort: 6 })
  .toFile(join(OUT, "faces.webp"));
console.log(`build-seats ok (${SEATS.length} seats)`);
