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
<link href="https://fonts.googleapis.com/css2?family=Newsreader:ital,opsz,wght@0,6..72,400;0,6..72,500;0,6..72,600;1,6..72,400;1,6..72,500&family=Hanken+Grotesk:wght@400;500;600;700&family=Space+Mono:wght@400;700&display=swap" rel="stylesheet">
<link rel="stylesheet" href="/css/site.css">
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
        <span class="role-foot"><span class="role-t">${esc(r.time)}</span><span class="role-go">Read the role <span class="arrow">&rarr;</span></span></span>
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

  const terms = SHARED.how.items
    .map(([t, d]) => `        <div class="term reveal">\n          <h3>${esc(t)}</h3>\n          <p>${esc(d)}</p>\n        </div>`)
    .join("\n");

  return head({
    title: "Volunteer | Adapt To Life",
    desc: "Adapt To Life is building a team. Grant writers, accountants, coaches, storytellers, equipment techs, and people who can open a door. Every role says what it costs you.",
    canonical: `${SITE}/volunteer`,
    card: "/images/og/volunteer-v2-option2.jpg",
    cardAlt: "Your place on this team. Adapt To Life.",
  }) + HEADER + `

<main>

  <section class="hero dark hero-atmos">
    <div class="wrap">
      <span class="eyebrow orange reveal">Volunteer</span>
      <h1 class="serif display reveal">Your place on <em class="italic" style="color:var(--orange)">this team</em>.</h1>
      <p class="lead sub reveal">Adapt To Life is early, and the honest version is that we need people more than we need hours. Below is the real list we work from. Open any role to see what you would own, what your first month looks like, and roughly what it costs you. Applying takes a name and an email.</p>
      <div class="actions reveal">
        <a href="#roles" class="btn">See what we need <span class="arrow">&rarr;</span></a>
      </div>
    </div>
  </section>

  <section class="band tint">
    <div class="wrap">
      <div class="reveal sec-head">
        <span class="eyebrow orange">Before you scroll</span>
        <h2 class="serif h2" style="margin-top:0.8rem;">What you would actually be joining.</h2>
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
      <p class="prose reveal" style="margin-top:1rem;">That is not the same as everything we need. If you have something we did not think to ask for, put it in the box below and tell us plainly. The list grows.</p>
      <p class="prose reveal" style="margin-top:1.4rem;">And if none of it is you, that is a fine answer. Somebody still has to pay for the chair. <a class="textlink" href="/ways-to-give">See the ways to give <span class="arrow">&rarr;</span></a></p>
    </div>
  </section>

  <section class="photoband" aria-label="An adaptive pickleball player driving forward for a shot during an indoor match">
    <div class="photoband-img" style="background-image:url('/images/athletes/wheelie-68.webp'); background-position:center 18%"></div>
    <div class="photoband-cap">
      <div class="wrap">
        <span class="eyebrow">What the hours turn into</span>
        <span class="pb-line">Somebody found the program. Somebody cleared the paperwork. Somebody paid for the chair. Then she played.</span>
      </div>
    </div>
  </section>

  <section class="band band-lg to-form" id="signup">
    <div class="wrap">
      <div class="reveal sec-head">
        <span class="eyebrow orange">Nothing fit</span>
        <h2 class="serif h2" style="margin-top:0.8rem;">Then tell us in your own words.</h2>
        <p class="lane-blurb">If one of the roles above is you, open it and apply there. It takes a name and an email. This form is for everything we did not think to ask for.</p>
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
// The shape is deliberately the one people already know from a job board: a
// title, an at-a-glance panel that answers "what does this cost me" without
// scrolling, then the detail. The section that does the real work is "your
// first month", because it is the only part that proves somebody thought about
// the volunteer rather than about the vacancy.
function rolePage(r) {
  const lane = LANES.find((l) => l.key === r.lane);
  const apply = "#apply";
  const title = `${strip(r.name)} (volunteer) | Adapt To Life`;

  const jd = (h, body) =>
    `      <section class="jd-sec reveal">\n        <h2 class="jd-h">${h}</h2>\n${body}\n      </section>`;

  const glance = [
    ["Time", r.time],
    ["Commitment", r.commit],
    ["Where", r.where],
    ["You would work with", r.withWhom],
    ["Type", "Volunteer, unpaid"],
  ]
    .map(([k, v]) => `          <div class="gl-row"><span class="gl-k">${k}</span><span class="gl-v">${esc(v)}</span></div>`)
    .join("\n");

  return head({
    title,
    desc: strip(r.card).slice(0, 200),
    canonical: `${SITE}/volunteer/${r.slug}`,
    card: `/images/og/role-${r.slug}-v2-option2.jpg`,
    cardAlt: `${strip(r.name)}, a volunteer role at Adapt To Life.`,
    // Schema.org JobPosting is deliberately NOT emitted. Google's job markup is
    // for paid employment and requires a salary or an explicit "no salary"
    // signal; publishing it for unpaid volunteer roles would put these in job
    // search results as if they were employment. The pages read like a posting
    // on purpose, but they must never be indexed as one.
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
        <a href="${apply}" class="btn">Apply for this role <span class="arrow">&rarr;</span></a>
      </div>
    </div>
  </section>

  <section class="band">
    <div class="wrap jd-grid">
      <div class="jd-main">
${jd("Why this role exists", `        <p class="jd-p">${esc(r.why)}</p>`)}
${jd("What you would own", "        " + ul(r.own))}
${jd("Your first month", `        <p class="jd-p jd-note">Nobody starts with the whole job. This is what we would actually ask you to do first, in order.</p>\n        ` + ul(r.first, "jd-ordered"))}
${jd("What helps", "        " + ul(r.helps))}
${jd("What you do not need", "        " + ul(r.notNeeded, "jd-no"))}
${jd("What this role is not", `        <p class="jd-p jd-note">Being explicit about the boundary is how we make the rest of this believable.</p>\n        ` + ul(r.isNot, "jd-no"))}
        <p class="jd-payoff reveal">${esc(r.payoff)}</p>
      </div>

      <aside class="jd-side reveal">
        <div class="jd-glance">
          <span class="gl-head">At a glance</span>
${glance}
          <a href="${apply}" class="btn jd-side-btn">Apply for this role</a>
          <p class="gl-foot">A name and an email. That is the whole form.</p>
        </div>
      </aside>
    </div>
  </section>

  <section class="band tint">
    <div class="wrap reading">
      <span class="eyebrow orange reveal">${SHARED.about.h}</span>
      <h2 class="serif h3 reveal" style="margin-top:0.7rem;">Small, and saying so.</h2>
${SHARED.about.p.map((x) => `      <p class="prose reveal" style="margin-top:1rem;">${x}</p>`).join("\n")}
      <p class="prose reveal" style="margin-top:1rem;"><a class="textlink" href="/about">Read our story <span class="arrow">&rarr;</span></a></p>
    </div>
  </section>

  <section class="band">
    <div class="wrap">
      <div class="reveal sec-head">
        <span class="eyebrow orange">${SHARED.how.h}</span>
        <h2 class="serif h2" style="margin-top:0.8rem;">No busywork, and a real scope.</h2>
      </div>
      <div class="terms">
${SHARED.how.items.map(([t, d]) => `        <div class="term reveal">\n          <h3>${esc(t)}</h3>\n          <p>${esc(d)}</p>\n        </div>`).join("\n")}
      </div>
    </div>
  </section>

  <section class="band-sm tint">
    <div class="wrap reading">
      <span class="eyebrow orange reveal">${SHARED.get.h}</span>
      <h2 class="serif h3 reveal" style="margin-top:0.7rem;">Nobody here is paid, including us. You still get something real.</h2>
      ${ul(SHARED.get.items)}
    </div>
  </section>

  <section class="closing dark band-lg jd-apply" id="apply">
    <div class="wrap">
      <div class="jd-apply-grid">
        <div class="jd-apply-copy">
          <span class="eyebrow orange reveal">${SHARED.apply.h}</span>
          <h2 class="serif h2 reveal" style="margin-top:0.7rem;">${esc(r.name)}.</h2>
          <p class="lead sub reveal">${esc(SHARED.apply.p)}</p>
        </div>
        <form class="jd-form reveal" id="volForm" novalidate>
          <input type="hidden" name="role" value="${esc(r.name)}">
          <div class="field"><label for="name">Your name</label><input id="name" name="name" type="text" autocomplete="name"></div>
          <div class="field"><label for="em">Email</label><input id="em" name="em" type="email" autocomplete="email"></div>
          <details class="jd-more">
            <summary>Add a note or a link (optional)</summary>
            <div class="field" style="margin-top:0.9rem;"><label for="bring">Anything you want us to know</label><textarea id="bring" name="bring" rows="3" placeholder="What you have done before, or a question."></textarea></div>
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

