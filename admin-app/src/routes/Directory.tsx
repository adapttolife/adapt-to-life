import { useEffect, useRef, useState } from "react";

const KINDS = ["organizations", "programs", "events", "grants", "blog"] as const;

type Kind = typeof KINDS[number];
type Item = Record<string, unknown> & { id: string; name?: string; title?: string };
type Detail = { label: string; fields: string[]; booleans: string[]; numbers: string[] };
type Activity = { id: string; kind: string; summary: string; actor?: string; created_at: string };
type SelectOption = { value: string; label: string };

const STATES = [
  ["", "Select a state"],
  ["AL", "Alabama"], ["AK", "Alaska"], ["AZ", "Arizona"], ["AR", "Arkansas"],
  ["CA", "California"], ["CO", "Colorado"], ["CT", "Connecticut"], ["DE", "Delaware"],
  ["FL", "Florida"], ["GA", "Georgia"], ["HI", "Hawaii"], ["ID", "Idaho"],
  ["IL", "Illinois"], ["IN", "Indiana"], ["IA", "Iowa"], ["KS", "Kansas"],
  ["KY", "Kentucky"], ["LA", "Louisiana"], ["ME", "Maine"], ["MD", "Maryland"],
  ["MA", "Massachusetts"], ["MI", "Michigan"], ["MN", "Minnesota"], ["MS", "Mississippi"],
  ["MO", "Missouri"], ["MT", "Montana"], ["NE", "Nebraska"], ["NV", "Nevada"],
  ["NH", "New Hampshire"], ["NJ", "New Jersey"], ["NM", "New Mexico"], ["NY", "New York"],
  ["NC", "North Carolina"], ["ND", "North Dakota"], ["OH", "Ohio"], ["OK", "Oklahoma"],
  ["OR", "Oregon"], ["PA", "Pennsylvania"], ["RI", "Rhode Island"], ["SC", "South Carolina"],
  ["SD", "South Dakota"], ["TN", "Tennessee"], ["TX", "Texas"], ["UT", "Utah"],
  ["VT", "Vermont"], ["VA", "Virginia"], ["WA", "Washington"], ["WV", "West Virginia"],
  ["WI", "Wisconsin"], ["WY", "Wyoming"], ["DC", "District of Columbia"],
];

const SPORTS = [
  ["tennis", "Tennis"], ["soccer", "Soccer"], ["baseball", "Baseball"],
  ["equestrian", "Horseback riding"], ["basketball", "Basketball"],
  ["rowing", "Rowing and paddling"], ["sledhockey", "Sled hockey"], ["skiing", "Skiing"],
  ["swimming", "Swimming"], ["golf", "Golf"], ["cycling", "Cycling"], ["archery", "Archery"],
  ["sailing", "Sailing"], ["trackfield", "Track and field"], ["fencing", "Fencing"],
  ["climbing", "Climbing"], ["rugby", "Rugby"], ["triathlon", "Triathlon"],
  ["martialarts", "Martial arts"], ["running", "Running"], ["pickleball", "Pickleball"],
  ["amputeesports", "Amputee sports"], ["waterskiing", "Water skiing"],
  ["goalball", "Goalball"], ["volleyball", "Volleyball"], ["football", "Football"],
  ["curling", "Curling"], ["beepbaseball", "Beep baseball"], ["boccia", "Boccia"],
  ["nordicskiing", "Nordic skiing"], ["shooting", "Shooting sports"],
  ["veteran-meetup", "Veteran meetups"], ["art-therapy", "Art therapy"],
  ["softball", "Softball"], ["lacrosse", "Lacrosse"], ["handball", "Handball"],
  ["powerlifting", "Powerlifting"], ["dance", "Wheelchair dance"],
];

const DETAILS: Record<Kind, Detail> = {
  organizations: {
    label: "Organizations",
    fields: ["name", "org_type", "website_url", "email", "claim_email", "phone", "city", "state", "zip", "address", "country", "lat", "lng", "geo_precision", "description", "cost_note", "sports_json", "equipment_provided", "ages", "data_quality_rating", "primary_data_source", "verification_status", "status", "is_public", "publicity_consent", "address_publicity_consent", "last_ok_at"],
    booleans: ["equipment_provided", "is_public", "publicity_consent", "address_publicity_consent"],
    numbers: ["lat", "lng"],
  },
  programs: {
    label: "Programs",
    fields: ["organization_id", "name", "sports_json", "website_url", "email", "phone", "city", "state", "zip", "address", "country", "lat", "lng", "geo_precision", "description", "cost_note", "equipment_provided", "ages", "verification_status", "verification_method", "status", "is_public", "publicity_consent", "address_publicity_consent", "last_ok_at", "listing", "seasons_json", "usual_month", "first_year", "slug"],
    booleans: ["equipment_provided", "is_public", "publicity_consent", "address_publicity_consent"],
    numbers: ["lat", "lng", "usual_month", "first_year"],
  },
  events: {
    label: "Events",
    fields: ["title", "description", "org_id", "program_id", "sport_key", "venue", "city", "state", "url", "recap_url", "starts_at", "ends_at", "all_day", "status", "is_public", "source"],
    booleans: ["all_day", "is_public"],
    numbers: [],
  },
  grants: {
    label: "Grants",
    fields: ["name", "source", "type", "audience", "amount_min_cents", "amount_max_cents", "amount_display", "deadline_display", "deadline_next", "description", "eligibility_criteria", "how_to_apply", "application_url", "source_url", "email", "phone", "sports_json", "is_open", "is_renewable", "is_public", "status"],
    booleans: ["is_open", "is_renewable", "is_public"],
    numbers: ["amount_min_cents", "amount_max_cents"],
  },
  blog: {
    label: "Blog posts",
    fields: ["title", "slug", "subtitle", "publish_at", "thumbnail_data_url", "content_markdown", "status", "is_public"],
    booleans: ["is_public"],
    numbers: [],
  },
};

const AREAS = new Set(["description", "cost_note", "eligibility_criteria", "how_to_apply", "subtitle", "content_markdown", "seasons_json"]);
const DATE_TIMES = new Set(["starts_at", "ends_at", "last_ok_at", "publish_at"]);
const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];
const CURRENT_YEAR = new Date().getFullYear();

function fieldLabel(field: string) {
  if (field === "is_public") return "Public Listing";
  if (field === "publicity_consent") return "Show Contact Details";
  if (field === "address_publicity_consent") return "Show Full Address";

  return field
    .replaceAll("_", " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase())
    .replace(/\bUrl\b/g, "URL");
}

function SearchSelect({
  name,
  options,
  value,
  multiple = false,
  placeholder = "Choose an option",
}: {
  name: string;
  options: SelectOption[];
  value: string | string[];
  multiple?: boolean;
  placeholder?: string;
}) {
  const initial = multiple
    ? Array.isArray(value) ? value : []
    : Array.isArray(value) ? value[0] || "" : value;
  const [selected, setSelected] = useState<string | string[]>(initial);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setSelected(initial);
  }, [value, multiple]);

  useEffect(() => {
    const closeOutside = (event: PointerEvent) => {
      if (root.current && !root.current.contains(event.target as Node)) {
        setOpen(false);
        setQuery("");
      }
    };

    addEventListener("pointerdown", closeOutside);
    return () => removeEventListener("pointerdown", closeOutside);
  }, []);

  const selectedValues = Array.isArray(selected) ? selected : [selected];
  const selectedLabels = options
    .filter((option) => selectedValues.includes(option.value))
    .map((option) => option.label);
  const visible = options.filter((option) => fuzzyMatches(option.label, query));

  const choose = (optionValue: string) => {
    if (multiple) {
      setSelected((current) => {
        const currentValues = Array.isArray(current) ? current : [];
        return currentValues.includes(optionValue)
          ? currentValues.filter((entry) => entry !== optionValue)
          : [...currentValues, optionValue];
      });
      return;
    }

    setSelected(optionValue);
    setOpen(false);
    setQuery("");
  };

  return (
    <div className="search-select" ref={root}>
      {selectedValues.filter(Boolean).map((entry) => <input key={entry} name={name} type="hidden" value={entry} />)}
      <button className="search-select-trigger" type="button" aria-expanded={open} onClick={() => setOpen((current) => !current)}>
        <span>{selectedLabels.length ? selectedLabels.join(", ") : placeholder}</span>
        <span aria-hidden="true">⌄</span>
      </button>
      {open && <div className="search-select-menu"><input className="search-select-input" autoFocus value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search options" />{visible.length ? <div className="search-select-options">{visible.map((option) => <button className={selectedValues.includes(option.value) ? "is-selected" : ""} key={option.value} type="button" onClick={() => choose(option.value)}><span>{option.label}</span>{selectedValues.includes(option.value) && <span aria-hidden="true">✓</span>}</button>)}</div> : <p>No matching options.</p>}</div>}
    </div>
  );
}

function activityLabel(kind: string) {
  const labels: Record<string, string> = {
    confirmation: "Confirmation received",
    fix: "Fix suggested",
    applied: "Applied",
    self_edit: "Edited by the organization",
    admin_edit: "Edited by the team",
    note: "Note",
  };

  return labels[kind] || fieldLabel(kind);
}

function activityTime(value: string) {
  const iso = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(value)
    ? `${value.replace(" ", "T")}Z`
    : value;

  return new Date(iso).toLocaleString();
}

function dateTimeLocalValue(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";

  const part = (number: number) => String(number).padStart(2, "0");
  return `${date.getFullYear()}-${part(date.getMonth() + 1)}-${part(date.getDate())}T${part(date.getHours())}:${part(date.getMinutes())}:${part(date.getSeconds())}`;
}

function numericValue(value: string, decimal = false) {
  if (!decimal) return value.replace(/\D/g, "");

  const negative = value.startsWith("-");
  const cleaned = value.replace(/[^\d.]/g, "");
  const [whole = "", ...fraction] = cleaned.split(".");
  return `${negative ? "-" : ""}${whole}${fraction.length ? `.${fraction.join("")}` : ""}`;
}

function fuzzyMatches(value: string, query: string) {
  const name = value.toLocaleLowerCase();
  const terms = query
    .toLocaleLowerCase()
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  return terms.every((term) => {
    if (name.includes(term)) return true;

    let cursor = 0;
    for (const letter of term) {
      cursor = name.indexOf(letter, cursor);
      if (cursor < 0) return false;
      cursor += 1;
    }
    return true;
  });
}

function titleCase(value: unknown) {
  return String(value || "")
    .replaceAll("_", " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function itemSummary(item: Item) {
  const parts = [];
  if (item.is_public != null) {
    parts.push(Number(item.is_public) ? "Public" : "Hidden");
  }
  if (item.status) parts.push(titleCase(item.status));
  return parts.join(" - ");
}

function itemValue(item: Item, field: string) {
  return item[field] == null ? "" : String(item[field]);
}

function selectedSports(item: Item) {
  try {
    const values = JSON.parse(String(item.sports_json || ""));
    if (Array.isArray(values)) return values.filter((value) => typeof value === "string");
  } catch {
    // The legacy single-sport columns below cover malformed or missing JSON.
  }

  return item.sport_key ? [String(item.sport_key)] : [];
}

function selectedSeasons(item: Item) {
  try {
    const values = JSON.parse(String(item.seasons_json || ""));
    return Array.isArray(values)
      ? values.filter((value) => ["spring", "summer", "fall", "winter"].includes(String(value)))
      : [];
  } catch {
    return [];
  }
}

function selectedStateName(value: string) {
  return STATES.find(([code]) => code === value)?.[1] || "";
}

function selectOptions(field: string, current: string, kind: Kind) {
  const options = field === "state"
    ? STATES
    : field === "geo_precision"
      ? [["", "Not set"], ["address", "Address"], ["zip", "ZIP"], ["city", "City"], ["state", "State"]]
      : field === "data_quality_rating"
        ? [["", "Not set"], ["high", "High"], ["medium", "Medium"], ["low", "Low"]]
        : field === "verification_status"
          ? [["", "Not set"], ["verified", "Verified"], ["pending", "Pending"], ["unverified", "Unverified"]]
          : kind === "events"
            ? [["scheduled", "Scheduled"], ["cancelled", "Cancelled"]]
            : [["", "Not set"], ["active", "Active"], ["inactive", "Inactive"], ["archived", "Archived"]];

  if (current && !options.some(([value]) => value === current)) {
    options.unshift([current, current]);
  }

  return options;
}

function detailRoute() {
  const match = location.pathname.match(/^\/admin\/directory\/(organizations|programs|events|grants|blog)\/([0-9a-f-]{36})$/i);
  return match ? { kind: match[1].toLowerCase() as Kind, id: match[2] } : null;
}

function inputType(detail: Detail, field: string) {
  if (DATE_TIMES.has(field)) return "datetime-local";
  if (field === "deadline_next") return "date";
  if (detail.numbers.includes(field)) return "number";
  if (field.includes("email")) return "email";
  if (field.endsWith("url")) return "url";
  return "text";
}

async function request(path: string, options?: RequestInit) {
  const response = await fetch(`/admin/api/asnm${path}`, {
    ...options,
    headers: { "content-type": "application/json", ...(options?.headers || {}) },
  });
  const body = await response.json().catch(() => ({}));

  if (!response.ok || !body.ok) {
    throw new Error(body.error || "Request failed");
  }

  return body;
}

export function Directory({ onFail }: { onFail: () => void }) {
  const [kind, setKind] = useState<Kind>("organizations");
  const [items, setItems] = useState<Item[]>([]);
  const [organizations, setOrganizations] = useState<Item[]>([]);
  const [programOptions, setProgramOptions] = useState<Item[]>([]);
  const [item, setItem] = useState<Item | null>(null);
  const [activity, setActivity] = useState<Activity[]>([]);
  const [message, setMessage] = useState("");
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [current, setCurrent] = useState(detailRoute);

  const go = (path: string) => {
    history.pushState(null, "", path);
    setCurrent(detailRoute());
  };

  const chooseKind = (nextKind: Kind) => {
    if (nextKind === kind) return;
    setLoading(true);
    setQuery("");
    setKind(nextKind);
  };

  const handleError = (error: unknown, fallback: string) => {
    if (String(error).includes("Sign in")) {
      onFail();
      return;
    }
    setMessage(error instanceof Error ? error.message : fallback);
  };

  useEffect(() => {
    const onPopState = () => setCurrent(detailRoute());
    addEventListener("popstate", onPopState);
    return () => removeEventListener("popstate", onPopState);
  }, []);

  useEffect(() => {
    if (current) return;
    setLoading(true);
    request(`/admin-data/${kind}`)
      .then((body) => setItems(body.items || []))
      .catch((error) => handleError(error, "Could not load the directory."))
      .finally(() => setLoading(false));
  }, [current, kind]);

  useEffect(() => {
    if (!current) {
      setItem(null);
      return;
    }
    setKind(current.kind);
    setMessage("");
    request(`/admin-data/${current.kind}/${current.id}`)
      .then((body) => {
        const item = body.item;
        for (const field of ["last_ok_at", "starts_at", "ends_at"]) {
          if (!item?.[field]) continue;
          const timestamp = new Date(String(item[field]));
          if (!Number.isNaN(timestamp.getTime())) {
            item[field] = timestamp.toISOString();
          }
        }
        setItem(item);
      })
      .catch((error) => handleError(error, "Could not load this item."));

    if (current.kind === "organizations") {
      request(`/admin-data/organizations/${current.id}/activity`)
        .then((body) => setActivity(body.items || []))
        .catch((error) => handleError(error, "Could not load this organization's activity."));
    } else {
      setActivity([]);
    }

    if (["programs", "events"].includes(current.kind)) {
      request("/admin-data/organizations")
        .then((body) => setOrganizations(body.items || []))
        .catch((error) => handleError(error, "Could not load organizations."));
    }

    if (current.kind === "events") {
      request("/admin-data/programs")
        .then((body) => setProgramOptions(body.items || []))
        .catch((error) => handleError(error, "Could not load programs."));
    }

  }, [current]);

  const save = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!current || !item) return;

    const form = new FormData(event.currentTarget);
    const data: Record<string, FormDataEntryValue | string> = Object.fromEntries(form);

    if (["organizations", "programs"].includes(current.kind)) {
      const sports = form.getAll("sports_json").map(String).filter(Boolean);
      const primary = sports.length === 1 ? SPORTS.find(([key]) => key === sports[0]) : ["multi", "Multi-sport"];
      data.sports_json = JSON.stringify(sports);
      data.sport_key = primary?.[0] || "";
      data.sport = primary?.[1] || "";
      const state = String(data.state || "");
      data.state_name = selectedStateName(state);
    }

    if (current.kind === "programs") {
      data.seasons_json = JSON.stringify(
        form.getAll("seasons_json").map(String).filter(Boolean),
      );
    }

    for (const field of ["last_ok_at", "starts_at", "ends_at"]) {
      if (data[field]) {
        const timestamp = new Date(String(data[field]));
        if (!Number.isNaN(timestamp.getTime())) {
          data[field] = timestamp.toISOString();
        }
      }
    }

    for (const field of DETAILS[current.kind].booleans) {
      data[field] = form.has(field) ? "1" : "0";
    }

    try {
      const body = await request(`/admin-data/${current.kind}/${current.id}`, {
        method: "PATCH",
        body: JSON.stringify(data),
      });
      setItem(body.item);
      setMessage("Changes saved.");
    } catch (error) {
      handleError(error, "Could not save changes.");
    }
  };

  const addActivityNote = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!current || current.kind !== "organizations") return;

    const form = event.currentTarget;
    const note = String(new FormData(form).get("note") || "").trim();
    if (!note) {
      setMessage("Write the note first.");
      return;
    }

    try {
      const body = await request(`/admin-data/organizations/${current.id}/activity`, {
        method: "POST",
        body: JSON.stringify({ note }),
      });
      setActivity(body.items || []);
      form.reset();
      setMessage("Note added.");
    } catch (error) {
      handleError(error, "Could not add that note.");
    }
  };

  if (current) {
    const detail = DETAILS[current.kind];
    return (
      <section className="directory-page">
        <button className="back-link" onClick={() => go("/admin/directory")}>
          ← {detail.label}
        </button>
        <h2>{item ? String(item.name || item.title || "Edit item") : "Edit item"}</h2>
        {item && (
          <form className="directory-form" onSubmit={save}>
            {detail.fields.map((field) => {
              if (detail.booleans.includes(field)) {
                return <label className="switch-field" key={field}><span>{fieldLabel(field)}</span><input name={field} type="checkbox" defaultChecked={Boolean(Number(item[field]))} /><i aria-hidden="true" /></label>;
              }
              if (current.kind === "programs" && field === "seasons_json") {
                return <div className="form-field" key={field}><span>Seasons</span><SearchSelect name={field} multiple value={selectedSeasons(item)} options={["spring", "summer", "fall", "winter"].map((season) => ({ value: season, label: titleCase(season) }))} placeholder="Choose seasons" /><small>Choose every season this program is available.</small></div>;
              }
              if (AREAS.has(field)) {
                return <label className="form-field wide" key={field}><span>{fieldLabel(field)}</span><textarea name={field} rows={field === "content_markdown" ? 16 : 5} defaultValue={itemValue(item, field)} /></label>;
              }

              if (["organizations", "programs"].includes(current.kind) && field === "sports_json") {
                return <div className="form-field wide" key={field}><span>Sports Offered</span><SearchSelect name={field} multiple value={selectedSports(item)} options={SPORTS.map(([value, label]) => ({ value, label }))} placeholder="Choose sports" /><small>Choose every sport this {current.kind === "organizations" ? "organization" : "program"} offers.</small></div>;
              }

              if (current.kind === "programs" && field === "organization_id") {
                const currentOrganization = itemValue(item, field);
                const options = organizations.map((organization) => ({ value: organization.id, label: String(organization.name || "Untitled organization") }));
                if (currentOrganization && !options.some((option) => option.value === currentOrganization)) options.unshift({ value: currentOrganization, label: currentOrganization });
                return <div className="form-field wide" key={field}><span>Organization</span><SearchSelect name={field} value={currentOrganization} options={options} placeholder="Choose an organization" /></div>;
              }

              if (current.kind === "programs" && field === "organization_id") {
                const currentOrganization = itemValue(item, field);
                return <label className="form-field" key={field}><span>Organization</span><select name={field} defaultValue={currentOrganization}><option value="">Choose an organization</option>{currentOrganization && !organizations.some((organization) => organization.id === currentOrganization) && <option value={currentOrganization}>{currentOrganization}</option>}{organizations.map((organization) => <option key={organization.id} value={organization.id}>{String(organization.name || "Untitled organization")}{organization.city ? ` · ${organization.city}${organization.state ? `, ${organization.state}` : ""}` : ""}</option>)}</select></label>;
              }

              if (current.kind === "programs" && field === "listing") {
                return <div className="form-field" key={field}><span>Listing</span><SearchSelect name={field} value={itemValue(item, field)} options={[{ value: "own", label: "Own" }, { value: "with_org", label: "With organization" }]} /></div>;
              }

              if (current.kind === "programs" && field === "listing") {
                return <label className="form-field" key={field}><span>Listing</span><select name={field} defaultValue={itemValue(item, field)}><option value="own">Own</option><option value="with_org">With organization</option></select></label>;
              }

              if (current.kind === "programs" && field === "usual_month") {
                return <div className="form-field" key={field}><span>Usual Month</span><SearchSelect name={field} value={itemValue(item, field)} options={[{ value: "", label: "Not set" }, ...MONTHS.map((label, index) => ({ value: String(index + 1), label }))]} /></div>;
              }

              if (current.kind === "programs" && field === "usual_month") {
                return <label className="form-field" key={field}><span>Usual Month</span><select name={field} defaultValue={itemValue(item, field)}><option value="">Not set</option>{MONTHS.map((month, index) => <option key={month} value={index + 1}>{month}</option>)}</select></label>;
              }

              if (current.kind === "programs" && field === "first_year") {
                return <label className="form-field" key={field}><span>First Year</span><input name={field} type="text" inputMode="numeric" pattern="[0-9]*" min="1950" max={CURRENT_YEAR} defaultValue={itemValue(item, field)} onInput={(event) => { event.currentTarget.value = numericValue(event.currentTarget.value); }} /></label>;
              }

              if (current.kind === "events" && field === "org_id") {
                const currentOrganization = itemValue(item, field);
                const options = organizations.map((organization) => ({ value: organization.id, label: String(organization.name || "Untitled organization") }));
                if (currentOrganization && !options.some((option) => option.value === currentOrganization)) options.unshift({ value: currentOrganization, label: currentOrganization });
                return <div className="form-field wide" key={field}><span>Organization</span><SearchSelect name={field} value={currentOrganization} options={options} placeholder="Choose an organization" /></div>;
              }

              if (current.kind === "events" && field === "org_id") {
                const currentOrganization = itemValue(item, field);
                return <label className="form-field" key={field}><span>Organization</span><select name={field} defaultValue={currentOrganization}><option value="">Choose an organization</option>{currentOrganization && !organizations.some((organization) => organization.id === currentOrganization) && <option value={currentOrganization}>{currentOrganization}</option>}{organizations.map((organization) => <option key={organization.id} value={organization.id}>{String(organization.name || "Untitled organization")}</option>)}</select></label>;
              }

              if (current.kind === "events" && field === "program_id") {
                const currentProgram = itemValue(item, field);
                const options = [{ value: "", label: "No linked program" }, ...programOptions.map((program) => ({ value: program.id, label: String(program.name || "Untitled program") }))];
                if (currentProgram && !options.some((option) => option.value === currentProgram)) options.push({ value: currentProgram, label: currentProgram });
                return <div className="form-field wide" key={field}><span>Program</span><SearchSelect name={field} value={currentProgram} options={options} placeholder="No linked program" /></div>;
              }

              if (current.kind === "events" && field === "program_id") {
                const currentProgram = itemValue(item, field);
                return <label className="form-field" key={field}><span>Program</span><select name={field} defaultValue={currentProgram}><option value="">No linked program</option>{currentProgram && !programOptions.some((program) => program.id === currentProgram) && <option value={currentProgram}>{currentProgram}</option>}{programOptions.map((program) => <option key={program.id} value={program.id}>{String(program.name || "Untitled program")}</option>)}</select></label>;
              }

              if (current.kind === "events" && field === "sport_key") {
                return <div className="form-field" key={field}><span>Sport</span><SearchSelect name={field} value={itemValue(item, field)} options={[{ value: "", label: "Not set" }, ...SPORTS.map(([value, label]) => ({ value, label }))]} /></div>;
              }

              if (current.kind === "events" && field === "sport_key") {
                return <label className="form-field" key={field}><span>Sport</span><select name={field} defaultValue={itemValue(item, field)}><option value="">Not set</option>{SPORTS.map(([key, name]) => <option key={key} value={key}>{name}</option>)}</select></label>;
              }

              if (["organizations", "programs", "events"].includes(current.kind) && ["state", "geo_precision", "data_quality_rating", "verification_status", "status"].includes(field)) {
                return <div className="form-field" key={field}><span>{fieldLabel(field)}</span><SearchSelect name={field} value={itemValue(item, field)} options={selectOptions(field, itemValue(item, field), current.kind).map(([value, label]) => ({ value, label }))} /></div>;
              }

              if (["organizations", "programs", "events"].includes(current.kind) && ["state", "geo_precision", "data_quality_rating", "verification_status", "status"].includes(field)) {
                return <label className="form-field" key={field}><span>{fieldLabel(field)}</span><select name={field} defaultValue={itemValue(item, field)}>{selectOptions(field, itemValue(item, field), current.kind).map(([optionValue, optionLabel]) => <option key={optionValue} value={optionValue}>{optionLabel}</option>)}</select></label>;
              }
              const numeric = detail.numbers.includes(field);
              const decimal = field === "lat" || field === "lng";
              return <label className="form-field" key={field}><span>{fieldLabel(field)}</span><input name={field} type={numeric ? "text" : inputType(detail, field)} inputMode={numeric ? (decimal ? "decimal" : "numeric") : undefined} pattern={numeric ? (decimal ? "-?[0-9]*[.]?[0-9]*" : "[0-9]*") : undefined} step={DATE_TIMES.has(field) ? "1" : undefined} defaultValue={DATE_TIMES.has(field) ? dateTimeLocalValue(itemValue(item, field)) : itemValue(item, field)} onInput={numeric ? (event) => { event.currentTarget.value = numericValue(event.currentTarget.value, decimal); } : undefined} /></label>;
            })}
            <div className="directory-actions"><button className="btn" type="submit">Save changes</button></div>
          </form>
        )}
        <p className="directory-message" role="status">{message}</p>
        {current.kind === "organizations" && (
          <section className="activity-panel" aria-labelledby="activity-heading">
            <h3 id="activity-heading">Activity</h3>
            <p className="sub">Team only, never shown on the site.</p>
            <form className="activity-note-form" onSubmit={addActivityNote}>
              <label className="form-field">
                <span>Add a note</span>
                <textarea name="note" rows={2} maxLength={500} placeholder="Emailed Oct 26" />
              </label>
              <button className="btn" type="submit">Add note</button>
            </form>
            {activity.length ? (
              <ol className="activity-list">
                {activity.map((entry) => (
                  <li key={entry.id}>
                    <p><time dateTime={entry.created_at}>{activityTime(entry.created_at)}</time><b>{activityLabel(entry.kind)}</b></p>
                    <p>{entry.summary}</p>
                    {entry.actor && <small>{entry.actor}</small>}
                  </li>
                ))}
              </ol>
            ) : (
              <p className="activity-empty">Nothing yet. Confirmations, fixes, edits, and your notes show here.</p>
            )}
          </section>
        )}
      </section>
    );
  }

  return (
    <section className="directory-page">
      <div className="directory-seg">
        {KINDS.map((entry) => <button key={entry} className={entry === kind ? "on" : ""} onClick={() => chooseKind(entry)}>{DETAILS[entry].label}</button>)}
      </div>
      <h2>{DETAILS[kind].label}</h2>
      <p className="sub">Manage all Adaptive Sports Near Me {kind} from Adapt To Life.</p>
      <label className="directory-search"><span>Search {DETAILS[kind].label.toLowerCase()}</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Type a name" /></label>
      <p className="directory-message" role="status">{message}</p>
      {loading ? <div className="directory-loading" role="status"><i aria-hidden="true" />Loading {DETAILS[kind].label.toLowerCase()}…</div> : <div className="directory-list">
        {items.filter((entry) => fuzzyMatches(String(entry.name || entry.title || ""), query)).map((entry) => <button className="directory-item" key={entry.id} onClick={() => go(`/admin/directory/${kind}/${entry.id}`)}><span><b>{String(entry.name || entry.title || "Untitled")}</b><small>{itemSummary(entry)}</small></span><span aria-hidden="true">→</span></button>)}
      </div>}
    </section>
  );
}
