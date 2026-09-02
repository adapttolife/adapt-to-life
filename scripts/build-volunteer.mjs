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
// A card carries TWO affordances now: the title navigates to the role page and
// a separate control adds it to the form. That is why the card is no longer a
// <label> wrapping the checkbox: a label swallows the click, so the title could
// never have been a link while the whole card was the control.
function card(r) {
  const id = `pick-${r.slug}`;
  return `      <li class="role reveal">
        <input class="role-cb" type="checkbox" id="${id}" name="role" value="${esc(r.name)}">
        <a class="role-n" href="/volunteer/${r.slug}">${esc(r.name)}</a>
        <p class="role-d">${esc(r.card)}</p>
        <span class="role-t">${esc(r.time)}</span>
        <span class="role-foot">
          <label class="role-pick" for="${id}">${TICK}<span class="rp-off">Add to my list</span><span class="rp-on">Added</span></label>
          <a class="role-more" href="/volunteer/${r.slug}">Read the role <span class="arrow">&rarr;</span></a>
        </span>
      </li>`;
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
<form id="volForm" novalidate>

  <section class="hero dark hero-atmos">
    <div class="wrap">
      <span class="eyebrow orange reveal">Volunteer</span>
      <h1 class="serif display reveal">Your place on <em class="italic" style="color:var(--orange)">this team</em>.</h1>
      <p class="lead sub reveal">Adapt To Life is early, and the honest version is that we need people more than we need hours. Below is the real list we work from. Every role has its own page saying what you would own, what your first month looks like, and roughly what it costs you. Some of it is a career's worth of skill. Some of it is one introduction. All of it ends with an athlete on a court.</p>
      <div class="actions reveal">
        <a href="#roles" class="btn">See what we need <span class="arrow">&rarr;</span></a>
        <a href="#signup" class="btn ghost">Sign up</a>
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
        <span class="eyebrow orange">Sign up</span>
        <h2 class="serif h2" style="margin-top:0.8rem;">Tell us where you fit.</h2>
        <p class="lane-blurb">Add anything above that sounds like you, then tell us a little. There is no interview and no minimum commitment. We will come back to you with a real scope, or with an honest no.</p>
      </div>

      <div class="vform reveal" style="margin-top:clamp(2rem,3.6vw,2.8rem);">
        <div class="picked">
          <span class="picked-h">Roles you picked</span>
          <p class="picked-none" id="pickedNone">None yet. Scroll up and add any role, or just tell us in your own words below.</p>
          <div class="picked-list" id="pickedList"></div>
        </div>

        <div class="contact-form">
          <div class="field-row">
            <div class="field"><label for="fn">First name</label><input id="fn" name="fn" type="text" autocomplete="given-name"></div>
            <div class="field"><label for="ln">Last name</label><input id="ln" name="ln" type="text" autocomplete="family-name"></div>
          </div>
          <div class="field-row">
            <div class="field"><label for="em">Email</label><input id="em" name="em" type="email" autocomplete="email"></div>
            <div class="field"><label for="phone">Phone <span style="font-weight:400;color:var(--muted)">(optional)</span></label><input id="phone" name="phone" type="tel" autocomplete="tel"></div>
          </div>
          <div class="field-row">
            <div class="field"><label for="based">Where are you based? <span style="font-weight:400;color:var(--muted)">(optional)</span></label><input id="based" name="based" type="text" autocomplete="address-level2" placeholder="City, state"></div>
            <div class="field">
              <label for="time">How much time feels right?</label>
              <select id="time" name="time">
                <option value="">Select one</option>
                <option>An hour here and there</option>
                <option>A few hours a month</option>
                <option>A few hours a week</option>
                <option>A day at a time, for events</option>
                <option>One project, start to finish</option>
                <option>Not sure yet</option>
              </select>
            </div>
          </div>
          <div class="field"><label for="bring">What would you bring? Anything we did not think to ask for?</label><textarea id="bring" name="bring" rows="5" placeholder="A sentence is plenty. If you added a role above, tell us what you have done before. If you did not, tell us what you would want to do."></textarea></div>
          <div class="field"><label for="links">A link, if you have one <span style="font-weight:400;color:var(--muted)">(optional)</span></label><input id="links" name="links" type="text" placeholder="LinkedIn, a portfolio, a firm page"></div>
          <input type="text" name="company" id="company" tabindex="-1" autocomplete="off" aria-hidden="true" style="position:absolute;left:-9999px;width:1px;height:1px;opacity:0">
          <div class="cf-turnstile" data-sitekey="0x4AAAAAADrOxscajsf1zBC2" data-appearance="interaction-only" style="margin-bottom:1rem;"></div>
          <button type="submit" class="btn" id="volSubmit">Count me in</button>
          <p class="form-status" id="formStatus" role="status" aria-live="polite" style="margin-top:.9rem;font-weight:600"></p>
          <p class="form-note">We will reply at the email you provide. Nothing here signs you up for anything.</p>
        </div>
      </div>
    </div>
  </section>

</form>
</main>

` + FOOTER + "\n\n" + NAVJS + "\n" + BOARD_JS + `

<script src="/js/subscribe.js" defer></script>
<script src="/js/turnstile-lazy.js" defer></script>
</body>
</html>
`;
}

const BOARD_JS = `<script>
  (function(){
    var f = document.getElementById('volForm');
    if(!f) return;
    var statusEl = document.getElementById('formStatus');
    var btn = document.getElementById('volSubmit');
    var list = document.getElementById('pickedList');
    var none = document.getElementById('pickedNone');

    function picked(){
      return Array.prototype.slice.call(f.querySelectorAll('input[name="role"]:checked'))
        .map(function(i){ return i.value; });
    }
    function paint(){
      var sel = picked();
      list.innerHTML = '';
      sel.forEach(function(v){
        var s = document.createElement('span');
        s.className = 'chip';
        s.textContent = v;
        list.appendChild(s);
      });
      none.style.display = sel.length ? 'none' : '';
    }
    f.addEventListener('change', function(e){ if(e.target.name === 'role') paint(); });
    paint();

    // A role deep-link (?role=Grant+writer) so a post, or a role page's own
    // apply button, can point at one ask instead of the whole board.
    (function(){
      var want = new URLSearchParams(location.search).getAll('role').map(function(s){ return s.toLowerCase(); });
      if(!want.length) return;
      var hit = false;
      f.querySelectorAll('input[name="role"]').forEach(function(i){
        if(want.indexOf(i.value.toLowerCase()) >= 0){ i.checked = true; hit = true; }
      });
      if(hit) paint();
    })();

    function v(id){ var el=document.getElementById(id); return el ? el.value.trim() : ''; }
    function setStatus(msg, ok){
      if(!statusEl) return;
      statusEl.textContent = msg;
      statusEl.style.color = ok ? '#2e7d32' : '#c0392b';
    }

    f.addEventListener('submit', function(e){
      e.preventDefault();
      if(v('company')) return; // honeypot: silently drop bots
      if(!v('em')){ setStatus('Please enter your email so we can reply.', false); return; }
      var roles = picked();
      if(!roles.length && !v('bring')){
        setStatus('Add a role above, or tell us what you would want to do.', false);
        return;
      }
      var tk = f.querySelector('[name="cf-turnstile-response"]');
      var payload = {
        fn:v('fn'), ln:v('ln'), em:v('em'), phone:v('phone'), based:v('based'),
        time:v('time'), bring:v('bring'), links:v('links'), roles:roles,
        cf_token: tk?tk.value:''
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
          paint();
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
  const apply = `/volunteer?role=${encodeURIComponent(r.name)}#signup`;
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
          <p class="gl-foot">Or <a class="textlink" href="/volunteer">browse every role</a>.</p>
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

  <section class="closing dark band-lg">
    <div class="wrap center">
      <span class="eyebrow orange reveal">${SHARED.apply.h}</span>
      <h2 class="serif display reveal">${esc(r.name)}.</h2>
      <p class="lead sub reveal">${esc(SHARED.apply.p)}</p>
      <div class="actions reveal" style="justify-content:center;">
        <a href="${apply}" class="btn">Apply for this role <span class="arrow">&rarr;</span></a>
      </div>
      <p class="jd-legal reveal">${esc(SHARED.legal)}</p>
    </div>
  </section>

</main>

` + FOOTER + "\n\n" + NAVJS + `

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

