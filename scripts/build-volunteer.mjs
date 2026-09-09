// Generates the volunteer board and every role page from data/volunteer-roles.mjs.
//
//   node scripts/build-volunteer.mjs          # write, then report
//   node scripts/build-volunteer.mjs --check  # fail if the tree is out of date
//
// Why generated rather than hand-written: twenty-seven job descriptions sharing
// one set of promises is exactly the shape that drifts. The culture blocks (how
// we work, what you get, the volunteer-not-employment line) are written once in
// the data file and rendered identically everywhere, so a page cannot quietly
// promise something the others do not.
//
// The chrome (head boilerplate, header, footer, nav script) is READ from a
// shipped page rather than duplicated here. When the nav changes, these pages
// change with it and nobody has to remember they exist. `--check` is wired into
// the test suite so a nav edit that skips the generator fails the build.
import { readFileSync, writeFileSync, mkdirSync, readdirSync, existsSync, rmSync } from "node:fs";
import { PAGE_HEADER_SHEET, PAGE_HEADER_CLASS, PAGE_HEADER_VARS,
         TIER_CLASS } from "./lib/page-header.mjs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { SHARED, LANES, ROLES } from "../data/volunteer-roles.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const PUB = join(ROOT, "public");
const CHECK = process.argv.includes("--check");
const SITE = "https://adapttolife.org";

// ---- chrome, lifted from a shipped page ---------------------------------
const donor = readFileSync(join(PUB, "contact.html"), "utf8");
const HEADER = donor.slice(donor.indexOf('<header class="nav'), donor.indexOf("</header>") + 9);
const FOOTER = donor.slice(donor.indexOf('<footer class="footer">'), donor.indexOf("</footer>") + 9);
const afterFooter = donor.slice(donor.indexOf("</footer>") + 9);
const NAVJS = afterFooter.slice(afterFooter.indexOf("<script>"), afterFooter.indexOf("</script>") + 9);

const esc = (s) => String(s).replace(/&(?!(amp|lt|gt|quot|#39|rarr|mdash|nbsp);)/g, "&amp;");
const strip = (s) => String(s).replace(/<[^>]*>/g, "").replace(/&amp;/g, "&").trim();

function head({ title, desc, canonical, card, cardAlt }) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta name="color-scheme" content="light only">
<title>${esc(title)}</title>
<meta name="description" content="${esc(desc)}">
<link rel="canonical" href="${canonical}">
<link rel="icon" type="image/svg+xml" href="/images/favicon-v2-option2.svg">
<link rel="icon" type="image/png" sizes="32x32" href="/images/favicon-v2-option2-32.png">
<link rel="apple-touch-icon" href="/images/apple-touch-icon-v2-option2.png">
<meta property="og:type" content="website">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(desc)}">
<meta property="og:image" content="${SITE}${card}">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:image:alt" content="${esc(cardAlt)}">
<meta property="og:url" content="${canonical}">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${esc(title)}">
<meta name="twitter:description" content="${esc(desc)}">
<meta name="twitter:image" content="${SITE}${card}">
<meta name="twitter:image:alt" content="${esc(cardAlt)}">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Sofia+Sans:ital,wght@0,400..900;1,400..900&display=swap" rel="stylesheet">
<link rel="stylesheet" href="/css/site.css">
${PAGE_HEADER_SHEET}\n${PAGE_HEADER_VARS}
<script src="/js/attribution.js" defer></script>
</head>
<body>
`;
}

const TICK = '<span class="role-tick" aria-hidden="true"><svg viewBox="0 0 12 12" fill="none" stroke="#fff" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M1.6 6.4 4.4 9.2 10.4 2.8"/></svg></span>';

const ul = (items, cls = "") =>
  `<ul class="jd-list${cls ? " " + cls : ""}">` +
  items.map((i) => `<li>${esc(i)}</li>`).join("") + `</ul>`;

// ---- the board ----------------------------------------------------------
// The whole card is one link to the role page. Alec, 2026-09-02: almost everyone
// applies for one role, so the shortest path wins. That killed the multi-select
// the first version had, which cost a reader two extra decisions (which roles,
// then scroll to a shared form) to reach a two-field form they could have had on
// the role page itself.
//
// One consequence worth keeping in mind: the card cannot contain another link or
// a form control, because it IS an anchor. A "read the role" link inside it would
// be a nested anchor, which is invalid, and it would also be redundant.
function card(r) {
  return `      <li><a class="role" href="/volunteer/${r.slug}">
        <span class="role-n">${esc(r.name)}</span>
        <span class="role-d">${esc(r.card)}</span>
        <span class="role-foot"><span class="role-t">${esc(r.time)}</span><span class="role-go" aria-hidden="true">&rarr;</span></span>
      </a></li>`;
}

function boardPage() {
  const lanes = LANES.map((l, i) => {
    const roles = ROLES.filter((r) => r.lane === l.key);
    return `  <section class="band${i % 2 ? " tint" : ""}">
    <div class="wrap">
      <div class="reveal sec-head">
        <span class="eyebrow orange">${l.name}</span>
        <h2 class="serif h2" style="margin-top:0.8rem;">${l.head}</h2>
        <p class="lane-blurb">${l.blurb}</p>
      </div>
      <ul class="roles">
${roles.map(card).join("\n")}
      </ul>
    </div>
  </section>`;
  }).join("\n\n");

  const terms = SHARED.terms
    .map(([t, d]) => `        <div class="term reveal">\n          <h3>${esc(t)}</h3>\n          <p>${esc(d)}</p>\n        </div>`)
    .join("\n");

  return head({
    title: "Volunteer | Adapt To Life",
    desc: "Adapt To Life is building a team. Grant writers, accountants, coaches, storytellers, equipment techs, and people who can open a door. Every role says what it costs you.",
    canonical: `${SITE}/volunteer`,
    card: "/images/og/volunteer-v3-athlete.jpg",
    cardAlt: "Your place on this team. Adapt To Life. A wheelchair pickleball player in a cap reaches for a shot.",
  }) + HEADER + `

<main>

  <section class="hero dark ${PAGE_HEADER_CLASS} ${TIER_CLASS("volunteer.html")}">
    <div class="wrap">
      <span class="eyebrow orange reveal">Volunteer</span>
      <h1 class="serif display reveal">Your place on <em class="italic" style="color:var(--orange)">this team</em>.</h1>
      <p class="lead sub reveal">We are early, and we need people more than hours. Open any role to see what you would own and what it costs you. Applying takes a name and an email.</p>
      <div class="actions reveal">
        <a href="#roles" class="btn">See what we need <span class="arrow">&rarr;</span></a>
      </div>
    </div>
  </section>

  <section class="band tint">
    <div class="wrap">
      <div class="reveal sec-head">
        <span class="eyebrow orange">Before you scroll</span>
        <h2 class="serif h2" style="margin-top:0.8rem;">What you would be joining.</h2>
      </div>
      <div class="terms">
${terms}
      </div>
    </div>
  </section>

  <span id="roles"></span>

${lanes}

  <section class="band tint">
    <div class="wrap reading center">
      <span class="eyebrow orange reveal">Not on the list</span>
      <h2 class="serif h3 reveal" style="margin-top:0.7rem;">We wrote down what we know we need.</h2>
      <p class="prose reveal" style="margin-top:1rem;">Not the same as everything we need, so tell us below if you have something we did not think to ask for. And if none of it is you, somebody still has to pay for the chair. <a class="textlink" href="/donate">See the ways to give <span class="arrow">&rarr;</span></a></p>
    </div>
  </section>

  <section class="photoband" aria-label="An adaptive pickleball player waiting on an indoor court, paddle raised">
    <!-- 58% not centre: wheelie-9-band is 2400x923 and the band is ~2.6:1 on a
         laptop, so the whole frame shows and this value does nothing there. On a
         PHONE the band is 390x360 and background-size:cover crops hard to the
         middle — which on this frame is empty floor. 58% is where the player
         actually is, so he survives the narrow crop. The old "center 18%" was
         tuned for wheelie-68, a PORTRAIT file, and means nothing for a band
         crop. (No backticks in this file: the page is a JS template literal and
         a backtick in a comment ends the string. It did.) -->
    <div class="photoband-img" style="background-image:url('/images/athletes/wheelie-9-band.webp'); background-position:58% center"></div>
    <!-- No caption. Alec, 2026-09-09: delete "What the hours turn into" and the
         "Somebody found the program..." line. The frame carries this on its own
         and the words were describing the previous photograph. The band's
         bottom gradient stays — it grounds the image against the section below,
         and it is shared with /sponsorship, which still has copy over it.

         THIS LIVES HERE, NOT IN public/volunteer.html. That file is GENERATED by
         this script: the same edit made there by hand was silently reverted the
         next time the volunteer pages were rebuilt. -->
  </section>

  <section class="band band-lg to-form" id="signup">
    <div class="wrap">
      <div class="reveal sec-head">
        <span class="eyebrow orange">Nothing fit</span>
        <h2 class="serif h2" style="margin-top:0.8rem;">Then tell us in your own words.</h2>
        <p class="lane-blurb">If a role above is you, open it and apply there. This form is for everything else.</p>
      </div>

      <div class="vform reveal" style="margin-top:clamp(2rem,3.6vw,2.8rem);">
        <form class="contact-form" id="volForm" novalidate>
          <div class="field-row">
            <div class="field"><label for="name">Your name</label><input id="name" name="name" type="text" autocomplete="name"></div>
            <div class="field"><label for="em">Email</label><input id="em" name="em" type="email" autocomplete="email"></div>
          </div>
          <div class="field"><label for="bring">What would you want to do?</label><textarea id="bring" name="bring" rows="4" placeholder="A sentence is plenty."></textarea></div>
          <input type="text" name="company" id="company" tabindex="-1" autocomplete="off" aria-hidden="true" style="position:absolute;left:-9999px;width:1px;height:1px;opacity:0">
          <div class="cf-turnstile" data-sitekey="0x4AAAAAADrOxscajsf1zBC2" data-appearance="interaction-only" style="margin-bottom:1rem;"></div>
          <button type="submit" class="btn" id="volSubmit">Send it over</button>
          <p class="form-status" id="formStatus" role="status" aria-live="polite" style="margin-top:.9rem;font-weight:600"></p>
          <p class="form-note">We will reply at the email you provide.</p>
        </form>
      </div>
    </div>
  </section>

</main>

` + FOOTER + "\n\n" + NAVJS + "\n" + FORM_JS + `

<script src="/js/subscribe.js" defer></script>
<script src="/js/turnstile-lazy.js" defer></script>
</body>
</html>
`;
}

// One submit handler, used by the role-page form and the board's
// nothing-fit form alike. The chips, the role checkboxes and the ?role=
// deep-link reader are all gone: they existed to serve a multi-select that
// cost a reader two decisions before reaching a two-field form.
const FORM_JS = `<script>
  (function(){
    var f = document.getElementById('volForm');
    if(!f) return;
    var statusEl = document.getElementById('formStatus');
    var btn = document.getElementById('volSubmit');
    var dark = !!f.closest('.dark');
    function val(n){ var el = f.elements[n]; return el ? String(el.value).trim() : ''; }
    function setStatus(msg, ok){
      if(!statusEl) return;
      statusEl.textContent = msg;
      statusEl.style.color = ok ? (dark ? '#8FE3B4' : '#2e7d32') : (dark ? '#FFB4A2' : '#c0392b');
    }
    f.addEventListener('submit', function(e){
      e.preventDefault();
      if(val('company')) return; // honeypot: silently drop bots
      if(!val('name')){ setStatus('Please add your name.', false); return; }
      if(!val('em')){ setStatus('Please add your email so we can reply.', false); return; }
      // A role page carries a hidden role, so a name and an email is a whole
      // application. The board form has no role, so it needs the free text.
      if(!val('role') && !val('bring')){
        setStatus('Tell us what you would want to do.', false); return;
      }
      var tk = f.querySelector('[name="cf-turnstile-response"]');
      var payload = {
        name: val('name'), em: val('em'), role: val('role'),
        bring: val('bring'), links: val('links'), cf_token: tk ? tk.value : ''
      };
      var orig = btn ? btn.textContent : '';
      if(btn){ btn.disabled = true; btn.textContent = 'Sending...'; }
      setStatus('', true);
      fetch('/api/volunteer', {
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body: JSON.stringify(payload)
      })
      .then(function(r){ return r.json().catch(function(){ return { ok:r.ok }; }); })
      .then(function(d){
        if(d && d.ok){
          f.reset();
          setStatus("Thanks. A person will read this and get back to you.", true);
        } else {
          setStatus((d && d.error) || 'Something went wrong. Please email hello@adapttolife.org.', false);
        }
      })
      .catch(function(){ setStatus('Network error. Please email hello@adapttolife.org.', false); })
      .then(function(){ if(btn){ btn.disabled = false; btn.textContent = orig; } });
    });
  })();
</script>`;

// ---- one role page ------------------------------------------------------
// The shape of a job posting, cut to what a reader actually uses. The first
// build ran to nearly a thousand words per role across nine headings, and Alec
// called it: "say all the same things with less bloat."
//
// What came out, and why each was fat rather than content:
//   - "Why this role exists" as its own heading. The paragraph earns its place;
//     the heading did not. It now opens the page, which is how a posting reads.
//   - "What helps" AND "What you do not need" as two lists answering one
//     question. Now one section: two bullets, then a single line of relief.
//   - "How we work" and "What you get out of it", eight headed blocks repeated
//     on all 27 pages. They are the terms of joining, so the BOARD owns them.
//   - The at-a-glance table, which restated the hero chips. The sidebar is now
//     the one fact the chips do not carry plus a button that stays reachable.
//   - Every sentence whose job was to introduce the next one.
function rolePage(r) {
  const lane = LANES.find((l) => l.key === r.lane);
  const title = `${strip(r.name)} (volunteer) | Adapt To Life`;

  const sec = (h, body) =>
    `        <section class="jd-sec reveal">\n          <h2 class="jd-h">${h}</h2>\n${body}\n        </section>`;

  return head({
    title,
    desc: strip(r.card).slice(0, 200),
    canonical: `${SITE}/volunteer/${r.slug}`,
    card: `/images/og/role-${r.slug}-v3-athlete.jpg`,
    // The role cards became photographs on 2026-09-09 like everything else, so
    // the alt says what is in the picture as well as which role it is.
    cardAlt: `${strip(r.name)}, a volunteer role at Adapt To Life. A wheelchair pickleball player in a cap reaches for a shot.`,
    // No JobPosting structured data, ever: Google's job markup is for paid
    // employment and expects a salary signal, so it would list unpaid volunteer
    // roles as jobs.
  }) + HEADER + `

<main>

  <section class="hero dark jd-hero">
    <div class="wrap">
      <a class="jd-back reveal" href="/volunteer">&larr; All volunteer roles</a>
      <span class="eyebrow orange reveal">${lane.name}</span>
      <h1 class="serif jd-title reveal">${esc(r.name)}</h1>
      <p class="lead sub reveal">${esc(r.card)}</p>
      <div class="jd-chips reveal">
        <span class="jd-chip">${esc(r.time)}</span>
        <span class="jd-chip">${esc(r.where)}</span>
        <span class="jd-chip">Volunteer, unpaid</span>
      </div>
      <div class="actions reveal">
        <a href="#apply" class="btn">Apply for this role <span class="arrow">&rarr;</span></a>
      </div>
    </div>
  </section>

  <section class="band">
    <div class="wrap jd-grid">
      <div class="jd-main">
        <p class="jd-lede reveal">${esc(r.why)}</p>
${sec("The work", "          " + ul(r.own))}
${sec("Your first month", "          " + ul(r.first, "jd-ordered"))}
${sec("Who it suits", "          " + ul(r.helps) + `\n          <p class="jd-skip">${esc(r.skip)}</p>`)}
${sec("Not this", "          " + ul(r.isNot, "jd-no"))}
        <p class="jd-payoff reveal">${esc(r.payoff)}</p>
      </div>

      <aside class="jd-side reveal">
        <div class="jd-glance">
          <span class="gl-k">You would work with</span>
          <span class="gl-v">${esc(r.withWhom)}</span>
          <a href="#apply" class="btn jd-side-btn">Apply for this role</a>
          <p class="gl-foot">A name and an email.</p>
        </div>
      </aside>
    </div>
  </section>

  <section class="band-sm tint">
    <div class="wrap reading">
      <p class="prose reveal">${SHARED.about} <a class="textlink" href="/about">Read our story <span class="arrow">&rarr;</span></a></p>
    </div>
  </section>

  <section class="closing dark band-lg jd-apply" id="apply">
    <div class="wrap">
      <div class="jd-apply-grid">
        <div class="jd-apply-copy">
          <span class="eyebrow orange reveal">Apply</span>
          <h2 class="serif h2 reveal" style="margin-top:0.7rem;">${esc(r.name)}.</h2>
          <p class="lead sub reveal">${esc(SHARED.apply)}</p>
        </div>
        <form class="jd-form reveal" id="volForm" novalidate>
          <input type="hidden" name="role" value="${esc(r.name)}">
          <div class="field"><label for="name">Your name</label><input id="name" name="name" type="text" autocomplete="name"></div>
          <div class="field"><label for="em">Email</label><input id="em" name="em" type="email" autocomplete="email"></div>
          <details class="jd-more">
            <summary>Add a note or a link (optional)</summary>
            <div class="field" style="margin-top:0.9rem;"><label for="bring">Anything you want us to know</label><textarea id="bring" name="bring" rows="3"></textarea></div>
            <div class="field"><label for="links">A link</label><input id="links" name="links" type="text" placeholder="LinkedIn, a portfolio, a firm page"></div>
          </details>
          <input type="text" name="company" tabindex="-1" autocomplete="off" aria-hidden="true" style="position:absolute;left:-9999px;width:1px;height:1px;opacity:0">
          <div class="cf-turnstile" data-sitekey="0x4AAAAAADrOxscajsf1zBC2" data-appearance="interaction-only" style="margin-bottom:0.9rem;"></div>
          <button type="submit" class="btn" id="volSubmit">Apply for this role</button>
          <p class="form-status" id="formStatus" role="status" aria-live="polite" style="margin-top:.9rem;font-weight:600"></p>
          <p class="jd-form-note">You hear back either way.</p>
        </form>
      </div>
      <p class="jd-legal reveal">${esc(SHARED.legal)}</p>
    </div>
  </section>

</main>

` + FOOTER + "\n\n" + NAVJS + "\n" + FORM_JS + `

<script src="/js/subscribe.js" defer></script>
<script src="/js/turnstile-lazy.js" defer></script>
</body>
</html>
`;
}

// ---- write / check ------------------------------------------------------
const files = new Map();
files.set(join(PUB, "volunteer.html"), boardPage());
for (const r of ROLES) files.set(join(PUB, "volunteer", `${r.slug}.html`), rolePage(r));

mkdirSync(join(PUB, "volunteer"), { recursive: true });

// Any role page in the tree that is no longer in the data is a dead URL that
// would keep serving. Removed here so the directory can never outlive the data.
const want = new Set(ROLES.map((r) => `${r.slug}.html`));
const stale = existsSync(join(PUB, "volunteer"))
  ? readdirSync(join(PUB, "volunteer")).filter((f) => f.endsWith(".html") && !want.has(f))
  : [];

let drift = [];
for (const [path, body] of files) {
  const current = existsSync(path) ? readFileSync(path, "utf8") : null;
  if (current !== body) drift.push(path.replace(ROOT + "/", ""));
}

if (CHECK) {
  const problems = [...drift, ...stale.map((f) => `public/volunteer/${f} (stale, not in the data)`)];
  if (problems.length) {
    console.error("build-volunteer --check FAILED. Run `npm run volunteer` and commit the result.\n" +
      problems.map((p) => "  " + p).join("\n"));
    process.exit(1);
  }
  console.log(`build-volunteer --check ok (${files.size} files, ${ROLES.length} roles)`);
} else {
  for (const f of stale) { rmSync(join(PUB, "volunteer", f)); console.log(`removed stale ${f}`); }
  for (const [path, body] of files) writeFileSync(path, body);
  console.log(`wrote ${files.size} files: public/volunteer.html + ${ROLES.length} role pages` +
    (drift.length ? `\nchanged: ${drift.length}` : "\nno changes"));
}

