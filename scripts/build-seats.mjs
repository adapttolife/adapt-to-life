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

// The face, centred: [centre x, centre y, side] in each 900px-tall cutout.
// The centre is the middle of the head (top of the hair or cap to the chin),
// on the face rather than the hair, and the side is about 1.25 times the
// head's height, so the face fills the circle (Alec, Nov 7: "center the
// profile images better so we can see their face better"). Heads that touch
// the top of a cutout get transparent room above them, so the face can sit
// in the middle. Measured on a 50px grid; check the strip after a new photo.
const FACE = {
  juan: [365, 95, 225],
  brian: [612, 100, 225],
  bob: [322, 222, 175],
  robby: [348, 108, 255],
  ken: [458, 76, 185],
  amanda: [442, 84, 205],
};
const PAD = 160;
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
  // Pad with transparency first, so a box can reach above a head that
  // touches the top of the cutout.
  const padded = await sharp(file)
    .extend({
      top: PAD,
      bottom: PAD,
      left: PAD,
      right: PAD,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
    .png()
    .toBuffer();
  const left = Math.round(cx - side / 2) + PAD;
  const top = Math.round(cy - side / 2) + PAD;
  if (left < 0 || top < 0 || left + side > meta.width + 2 * PAD)
    throw new Error(`face box for ${s.slug} leaves the picture`);
  faces.push({
    input: await sharp(padded)
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
