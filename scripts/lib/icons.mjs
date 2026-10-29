// scripts/lib/icons.mjs: the symbols for the pages in between.
//
// Alec, 2026-10-29: the middle of the site should carry meaning with "icons
// and different kinds of symbolism", not photographs. A first pass used stock
// Lucide icons (a shield, a trophy, a handshake) that could belong to any
// nonprofit. This set is drawn from the community's own geometry instead:
// the handrim and spoked wheel, the court from above, the paddle and the
// perforated ball, and the paddle tap at the net.
//
// Sources: Codex (gpt-5.6-sol) drafted the set from a brief; every icon was
// rendered at 14/18/28/56px on both page colors and judged. Five shipped as
// drafted; the rest were redrawn here after failing that review (a paddle
// read as a magnifier, a chair as a tricycle, rims as rings or a clover,
// coins as a pill), with Codex critiquing the redraws in turn. time, place
// and arrow stay Lucide v1.49.0 (ISC, https://lucide.dev), because small meta
// icons need to be conventional more than they need to be ours.
//
// All are 24-unit, stroke-only (stroke from the wrapper, currentColor), so
// color always comes from the page. Draw with icon(name).
export const ICONS = {
  // a coin with a heart on its face: money given from the heart, the Hustle & Heart Fund (drawn here after three Codex drafts read as a pill, gears, a tulip)
  fund: "<circle cx=\"11\" cy=\"12\" r=\"8.5\"/><path d=\"M14.5 3.8A8.5 8.5 0 0 1 21.5 12a8.5 8.5 0 0 1-7 8.2\"/><path d=\"M11 14.0s-3.60-2.10-3.60-4.60a1.90 1.90 0 0 1 3.60-.9a1.90 1.90 0 0 1 3.60.9c0 2.50-3.60 4.60-3.60 4.60Z\"/>",
  // a wrench meeting a wheel and axle: the work that keeps things running (Codex)
  operations: "<circle cx=\"7\" cy=\"17\" r=\"4\"/><circle cx=\"7\" cy=\"17\" r=\"1.5\"/><path d=\"m9.8 14.2 4.5-4.5a4 4 0 0 1 5-5l-2.5 2.5 2 2 2.5-2.5a4 4 0 0 1-5 5l-4.5 4.5\"/>",
  // a paddle sending out signal arcs (redrawn from Codex's idea)
  stories: "<rect x=\"3\" y=\"2.5\" width=\"8\" height=\"10\" rx=\"3.5\"/><path d=\"M7 12.5V21\"/><path d=\"M14.5 5a4 4 0 0 1 0 5\"/><path d=\"M17.5 2.5a7.5 7.5 0 0 1 0 10\"/>",
  // a paddle and a perforated ball in play (drawn here; Codex made the holes irregular so the ball stops reading as a die)
  participation: "<rect x=\"2.5\" y=\"2.5\" width=\"8.5\" height=\"10.5\" rx=\"3.5\"/><path d=\"M6.75 13v8\"/><circle cx=\"17.5\" cy=\"15.5\" r=\"4.25\"/><circle cx=\"15.7\" cy=\"13.4\" r=\".65\" fill=\"currentColor\" stroke=\"none\"/><circle cx=\"18.5\" cy=\"13.3\" r=\".65\" fill=\"currentColor\" stroke=\"none\"/><circle cx=\"16.8\" cy=\"15.5\" r=\".65\" fill=\"currentColor\" stroke=\"none\"/><circle cx=\"19.5\" cy=\"16\" r=\".65\" fill=\"currentColor\" stroke=\"none\"/><circle cx=\"15.2\" cy=\"17.5\" r=\".65\" fill=\"currentColor\" stroke=\"none\"/><circle cx=\"18\" cy=\"18.2\" r=\".65\" fill=\"currentColor\" stroke=\"none\"/><path d=\"M12.75 6.5c3.25-.75 5.75.75 6.75 3.5\"/>",
  // the paddle tap players share at the net after a game
  connections: "<g transform=\"rotate(8 6.5 21.5)\"><rect x=\"3.25\" y=\"5\" width=\"6.5\" height=\"9\" rx=\"3\"/><path d=\"M6.5 14v7.5\"/></g><g transform=\"rotate(-8 17.5 21.5)\"><rect x=\"14.25\" y=\"5\" width=\"6.5\" height=\"9\" rx=\"3\"/><path d=\"M17.5 14v7.5\"/></g><path d=\"M12 1.5v1.75M9 2.4l.9 1.3M15 2.4l-.9 1.3\"/>",
  // a court from above: net, kitchen lines, service courts (Codex)
  courts: "<rect x=\"2\" y=\"5\" width=\"20\" height=\"14\" rx=\"1\"/><path d=\"M12 5v14M8 5v14M16 5v14M2 12h6M16 12h6\"/>",
  // a spoked sport-chair wheel: many spokes, one hub
  community: "<circle cx=\"12\" cy=\"12\" r=\"10\"/><circle cx=\"12\" cy=\"12\" r=\"1.4\"/><path d=\"M14.03 12.84L18.10 14.53M12.84 14.03L14.53 18.10M11.16 14.03L9.47 18.10M9.97 12.84L5.90 14.53M9.97 11.16L5.90 9.47M11.16 9.97L9.47 5.90M12.84 9.97L14.53 5.90M14.03 11.16L18.10 9.47\" stroke-width=\"1.5\"/>",
  // a comment bubble with cheer marks (Codex)
  cheering: "<path d=\"M4 5h12a4 4 0 0 1 4 4v3a4 4 0 0 1-4 4h-6l-5 3v-3H4a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2Z\"/><circle cx=\"7\" cy=\"10.5\" r=\"1\" fill=\"currentColor\" stroke=\"none\"/><circle cx=\"11\" cy=\"10.5\" r=\"1\" fill=\"currentColor\" stroke=\"none\"/><circle cx=\"15\" cy=\"10.5\" r=\"1\" fill=\"currentColor\" stroke=\"none\"/><path d=\"M6 3V1M10 3l1-2M14 3l2-2\"/>",
  // a play mark inside a double handrim (Codex)
  play: "<circle cx=\"12\" cy=\"12\" r=\"9\"/><circle cx=\"12\" cy=\"12\" r=\"6.5\"/><path d=\"m10 8 6 4-6 4Z\" fill=\"currentColor\" stroke=\"none\"/>",
  // an arrow leaving a box: opens another site (Codex)
  external: "<path d=\"M10 5H5v14h14v-5M13 5h6v6M19 5l-9 9\"/>",
  // Lucide clock; kept because it stays crisp at 14px
  time: "<circle cx=\"12\" cy=\"12\" r=\"10\"/><path d=\"M12 6v6l4 2\"/>",
  // Lucide map pin; kept because it stays crisp at 14px
  place: "<path d=\"M20 10c0 4.993-5.539 10.193-7.399 11.799a1 1 0 0 1-1.202 0C9.539 20.193 4 14.993 4 10a8 8 0 0 1 16 0\"/><circle cx=\"12\" cy=\"10\" r=\"3\"/>",
  // Lucide arrow; plain on purpose
  arrow: "<path d=\"M5 12h14\"/><path d=\"m12 5 7 7-7 7\"/>",
};

export function icon(name, cls = "ix-svg") {
  const body = ICONS[name];
  if (!body) throw new Error("no icon " + name);
  return `<svg class="${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${body}</svg>`;
}
