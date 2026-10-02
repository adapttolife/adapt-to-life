// The menu is one decision, made once. Every public page carries the same
// one; each group answers one question with at most three links (Our Work:
// what we do. Get Involved: how to help. About: who we are); and individual
// partners, people, and events are reached through their index pages
// (/sponsorship, /ambassadors, /events), never their own menu item.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";

const pub = new URL("../public/", import.meta.url);
const read = (f) => readFileSync(new URL(f, pub), "utf8");
const pages = [
  ...readdirSync(pub).filter((f) => f.endsWith(".html")),
  ...readdirSync(new URL("volunteer/", pub)).filter((f) => f.endsWith(".html")).map((f) => "volunteer/" + f),
].filter((f) => !read(f).includes("noindex"));

const desktop = (s) => (s.match(/<nav class="nav-links">[\s\S]*?<\/nav>/) || [""])[0];
const mobile = (s) => (s.match(/<div class="mobile-menu">[\s\S]*?<\/header>/) || [""])[0];

test("every public page carries the same menu as the home page", () => {
  const home = read("index.html");
  for (const f of pages) {
    const s = read(f);
    assert.equal(desktop(s), desktop(home), `${f}: desktop menu differs from the home page`);
    assert.equal(mobile(s), mobile(home), `${f}: mobile menu differs from the home page`);
  }
});

test("each menu group holds at most three links", () => {
  const panels = [...desktop(read("index.html")).matchAll(/<div class="nav-panel" id="(\w+)">([\s\S]*?)<\/div>/g)];
  assert.ok(panels.length >= 3, "the three groups exist");
  for (const [, id, body] of panels) {
    const n = (body.match(/<a /g) || []).length;
    assert.ok(n >= 1 && n <= 3, `${id} has ${n} links; three is the ceiling`);
  }
  const groups = mobile(read("index.html")).split('<span class="m-group">').slice(1);
  for (const g of groups) assert.ok((g.match(/class="m-sub"/g) || []).length <= 3, `mobile group "${g.slice(0, 20)}" has more than three links`);
});

test("no individual partner or person page is a menu item", () => {
  const menus = desktop(read("index.html")) + mobile(read("index.html"));
  for (const slug of ["brickhouse", "juan", "karen", "tim"]) {
    assert.ok(!menus.includes(`href="/${slug}"`), `/${slug} belongs on its index page, not in the menu`);
  }
});
