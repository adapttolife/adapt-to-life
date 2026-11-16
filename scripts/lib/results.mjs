// Tournament results from data/event-stories.mjs (`results`), written out the
// same way everywhere: the event page's medal list, its structured data, and
// the Facts section of /llms.txt.

const SITE = "https://adapttolife.org";

// "singles bronze, and doubles silver with Ken Carwell"
export function resultLine(r) {
  if (!r.won.length) return r.note || "competed";
  return r.won
    .map((w) => `${w.draw} ${w.medal}` + (w.partner ? (r.won.length === 1 ? `, with ${w.partner}` : ` with ${w.partner}`) : ""))
    .join(", and ");
}

export function resultsList(results) {
  return `<ul class="es-list">\n${results.map((r) => `        <li><b>${r.name}</b>: ${resultLine(r)}</li>`).join("\n")}\n      </ul>`;
}

// schema.org competitors: athletes we support carry the @id of their card on
// /pickleball; their partners from outside the crew are named too, so a reader
// never has to guess who won a doubles medal with whom.
export function competitors(results, eventName) {
  const people = new Map();
  const award = (w) =>
    `${eventName}: wheelchair ${w.draw} ${w.medal}` + (w.partner ? `, with ${w.partner}` : "");
  for (const r of results) {
    people.set(r.name, {
      "@type": "Person",
      "@id": `${SITE}/pickleball#${r.slug}`,
      name: r.name,
      memberOf: { "@type": "SportsTeam", name: "Chicago Pickleball: Wheelie Big Dills", url: SITE + "/pickleball" },
      ...(r.won.length ? { award: r.won.map((w) => award(w)) } : {}),
    });
  }
  for (const r of results)
    for (const w of r.won)
      if (w.partner && !people.has(w.partner))
        people.set(w.partner, { "@type": "Person", name: w.partner, award: [award({ ...w, partner: r.name })] });
  return [...people.values()];
}
