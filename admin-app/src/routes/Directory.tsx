import { useEffect, useRef, useState } from "react";

const KINDS = ["organizations", "programs", "events", "grants", "blog"] as const;

type Kind = (typeof KINDS)[number];
type Item = Record<string, unknown> & { id: string; name?: string; title?: string };
type Detail = {
  label: string;
  fields: string[];
  booleans: string[];
  numbers: string[];
};
type Activity = {
  id: string;
  kind: string;
  summary: string;
  actor?: string;
  created_at: string;
};
type SelectOption = { value: string; label: string };

const STATES = [
  ["", "Select a state"],
  ["AL", "Alabama"],
  ["AK", "Alaska"],
  ["AZ", "Arizona"],
  ["AR", "Arkansas"],
  ["CA", "California"],
  ["CO", "Colorado"],
  ["CT", "Connecticut"],
  ["DE", "Delaware"],
  ["FL", "Florida"],
  ["GA", "Georgia"],
  ["HI", "Hawaii"],
  ["ID", "Idaho"],
  ["IL", "Illinois"],
  ["IN", "Indiana"],
  ["IA", "Iowa"],
  ["KS", "Kansas"],
  ["KY", "Kentucky"],
  ["LA", "Louisiana"],
  ["ME", "Maine"],
  ["MD", "Maryland"],
  ["MA", "Massachusetts"],
  ["MI", "Michigan"],
  ["MN", "Minnesota"],
  ["MS", "Mississippi"],
  ["MO", "Missouri"],
  ["MT", "Montana"],
  ["NE", "Nebraska"],
  ["NV", "Nevada"],
  ["NH", "New Hampshire"],
  ["NJ", "New Jersey"],
  ["NM", "New Mexico"],
  ["NY", "New York"],
  ["NC", "North Carolina"],
  ["ND", "North Dakota"],
  ["OH", "Ohio"],
  ["OK", "Oklahoma"],
  ["OR", "Oregon"],
  ["PA", "Pennsylvania"],
  ["RI", "Rhode Island"],
  ["SC", "South Carolina"],
  ["SD", "South Dakota"],
  ["TN", "Tennessee"],
  ["TX", "Texas"],
  ["UT", "Utah"],
  ["VT", "Vermont"],
  ["VA", "Virginia"],
  ["WA", "Washington"],
  ["WV", "West Virginia"],
  ["WI", "Wisconsin"],
  ["WY", "Wyoming"],
  ["DC", "District of Columbia"],
];

const SPORTS = [
  ["tennis", "Tennis"],
  ["soccer", "Soccer"],
  ["baseball", "Baseball"],
  ["equestrian", "Horseback riding"],
  ["basketball", "Basketball"],
  ["rowing", "Rowing and paddling"],
  ["sledhockey", "Sled hockey"],
  ["skiing", "Skiing"],
  ["swimming", "Swimming"],
  ["golf", "Golf"],
  ["cycling", "Cycling"],
  ["archery", "Archery"],
  ["sailing", "Sailing"],
  ["trackfield", "Track and field"],
  ["fencing", "Fencing"],
  ["climbing", "Climbing"],
  ["rugby", "Rugby"],
  ["triathlon", "Triathlon"],
  ["martialarts", "Martial arts"],
  ["running", "Running"],
  ["pickleball", "Pickleball"],
  ["amputeesports", "Amputee sports"],
  ["waterskiing", "Water skiing"],
  ["goalball", "Goalball"],
  ["volleyball", "Volleyball"],
  ["football", "Football"],
  ["curling", "Curling"],
  ["beepbaseball", "Beep baseball"],
  ["boccia", "Boccia"],
  ["nordicskiing", "Nordic skiing"],
  ["shooting", "Shooting sports"],
  ["veteran-meetup", "Veteran meetups"],
  ["art-therapy", "Art therapy"],
  ["softball", "Softball"],
  ["lacrosse", "Lacrosse"],
  ["handball", "Handball"],
  ["powerlifting", "Powerlifting"],
  ["dance", "Wheelchair dance"],
];

const DETAILS: Record<Kind, Detail> = {
  organizations: {
    label: "Organizations",
    fields: [
      "name",
      "org_type",
      "website_url",
      "email",
      "claim_email",
      "phone",
      "city",
      "state",
      "zip",
      "address",
      "country",
      "lat",
      "lng",
      "geo_precision",
      "description",
      "cost_note",
      "sports_json",
      "equipment_provided",
      "ages",
      "data_quality_rating",
      "primary_data_source",
      "verification_status",
      "status",
      "is_public",
      "publicity_consent",
      "address_publicity_consent",
      "last_ok_at",
    ],
    booleans: [
      "equipment_provided",
      "is_public",
      "publicity_consent",
      "address_publicity_consent",
    ],
    numbers: ["lat", "lng"],
  },
  programs: {
    label: "Programs",
    fields: [
      "organization_id",
      "name",
      "sports_json",
      "website_url",
      "email",
      "phone",
      "city",
      "state",
      "zip",
      "address",
      "country",
      "lat",
      "lng",
      "geo_precision",
      "description",
      "cost_note",
      "equipment_provided",
      "ages",
      "verification_status",
      "verification_method",
      "status",
      "is_public",
      "publicity_consent",
      "address_publicity_consent",
      "last_ok_at",
      "listing",
      "seasons_json",
      "usual_month",
      "first_year",
      "slug",
    ],
    booleans: [
      "equipment_provided",
      "is_public",
      "publicity_consent",
      "address_publicity_consent",
    ],
    numbers: ["lat", "lng", "usual_month", "first_year"],
  },
  events: {
    label: "Events",
    fields: [
      "title",
      "description",
      "org_id",
      "program_id",
      "sport_key",
      "venue",
      "city",
      "state",
      "url",
      "recap_url",
      "starts_at",
      "ends_at",
      "all_day",
      "status",
      "is_public",
      "source",
    ],
    booleans: ["all_day", "is_public"],
    numbers: [],
  },
  grants: {
    label: "Grants",
    fields: [
      "name",
      "source",
      "type",
      "audience",
      "amount_min_cents",
      "amount_max_cents",
      "amount_display",
      "deadline_display",
      "deadline_next",
      "description",
      "eligibility_criteria",
      "how_to_apply",
      "application_url",
      "source_url",
      "email",
      "phone",
      "sports_json",
      "is_open",
      "is_renewable",
      "is_public",
      "status",
    ],
    booleans: ["is_open", "is_renewable", "is_public"],
    numbers: ["amount_min_cents", "amount_max_cents"],
  },
  blog: {
    label: "Blog posts",
    fields: [
      "title",
      "slug",
      "subtitle",
      "publish_at",
      "thumbnail_data_url",
      "content_markdown",
      "status",
      "is_public",
    ],
    booleans: ["is_public"],
    numbers: [],
  },
};

const AREAS = new Set([
  "description",
  "cost_note",
  "eligibility_criteria",
  "how_to_apply",
  "subtitle",
  "content_markdown",
  "seasons_json",
]);
const DATE_TIMES = new Set(["starts_at", "ends_at", "last_ok_at", "publish_at"]);
const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
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
    ? Array.isArray(value)
      ? value
      : []
    : Array.isArray(value)
      ? value[0] || ""
      : value;
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
      {selectedValues.filter(Boolean).map((entry) => (
        <input key={entry} name={name} type="hidden" value={entry} />
      ))}
      <button
        className="search-select-trigger"
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
      >
        <span>{selectedLabels.length ? selectedLabels.join(", ") : placeholder}</span>
        <span aria-hidden="true">⌄</span>
      </button>
      {open && (
        <div className="search-select-menu">
          <input
            className="search-select-input"
            autoFocus
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search options"
          />
          {visible.length ? (
            <div className="search-select-options">
              {visible.map((option) => (
                <button
                  className={selectedValues.includes(option.value) ? "is-selected" : ""}
                  key={option.value}
                  type="button"
                  onClick={() => choose(option.value)}
                >
                  <span>{option.label}</span>
                  {selectedValues.includes(option.value) && (
                    <span aria-hidden="true">✓</span>
                  )}
                </button>
              ))}
            </div>
          ) : (
            <p>No matching options.</p>
          )}
        </div>
      )}
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
  const terms = query.toLocaleLowerCase().trim().split(/\s+/).filter(Boolean);

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
    if (Array.isArray(values))
      return values.filter((value) => typeof value === "string");
  } catch {
    // The legacy single-sport columns below cover malformed or missing JSON.
  }

  return item.sport_key ? [String(item.sport_key)] : [];
}

function selectedSeasons(item: Item) {
  try {
    const values = JSON.parse(String(item.seasons_json || ""));
    return Array.isArray(values)
      ? values.filter((value) =>
          ["spring", "summer", "fall", "winter"].includes(String(value)),
        )
      : [];
  } catch {
    return [];
  }
}

function selectedStateName(value: string) {
  return STATES.find(([code]) => code === value)?.[1] || "";
}

function selectOptions(field: string, current: string, kind: Kind) {
  const options =
    field === "state"
      ? STATES
      : field === "geo_precision"
        ? [
            ["", "Not set"],
            ["address", "Address"],
            ["zip", "ZIP"],
            ["city", "City"],
            ["state", "State"],
          ]
        : field === "data_quality_rating"
          ? [
              ["", "Not set"],
              ["high", "High"],
              ["medium", "Medium"],
              ["low", "Low"],
            ]
          : field === "verification_status"
            ? [
                ["", "Not set"],
                ["verified", "Verified"],
                ["pending", "Pending"],
                ["unverified", "Unverified"],
              ]
            : kind === "events"
              ? [
                  ["scheduled", "Scheduled"],
                  ["cancelled", "Cancelled"],
                ]
              : [
                  ["", "Not set"],
                  ["active", "Active"],
                  ["inactive", "Inactive"],
                  ["archived", "Archived"],
                ];

  if (current && !options.some(([value]) => value === current)) {
    options.unshift([current, current]);
  }

  return options;
}

function detailRoute() {
  const match = location.pathname.match(
    /^\/admin\/directory\/(organizations|programs|events|grants|blog)\/(new|[0-9a-f-]{36})$/i,
  );
  return match ? { kind: match[1].toLowerCase() as Kind, id: match[2] } : null;
}

function newItem(kind: Kind): Item {
  const detail = DETAILS[kind];
  const item = Object.fromEntries(detail.fields.map((field) => [field, ""])) as Item;

  for (const field of detail.booleans) {
    item[field] = 0;
  }

  if (kind === "organizations" || kind === "programs") {
    item.status = "active";
    item.verification_status = "unverified";
    item.is_public = 1;
  }
  if (kind === "events") {
    item.status = "scheduled";
    item.source = "admin";
    item.is_public = 1;
  }
  if (kind === "grants") {
    item.audience = "athlete";
    item.status = "active";
    item.is_open = 1;
    item.is_public = 1;
  }
  if (kind === "blog") {
    item.status = "draft";
  }

  return item;
}

function inputType(detail: Detail, field: string) {
  if (DATE_TIMES.has(field)) return "datetime-local";
  if (field === "deadline_next") return "date";
  if (detail.numbers.includes(field)) return "number";
  if (field.includes("email")) return "email";
  if (field.endsWith("url")) return "url";
  return "text";
}

function fieldPlaceholder(field: string) {
  const label = fieldLabel(field).toLocaleLowerCase();
  return field === "slug" ? "Generated from the title" : `Enter ${label}`;
}

function markdownPreview(value: string) {
  const inline = (text: string) =>
    text
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
      .replace(/\*(.+?)\*/g, "<em>$1</em>")
      .replace(/`(.+?)`/g, "<code>$1</code>")
      .replace(
        /\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g,
        '<a href="$2" rel="noreferrer" target="_blank">$1</a>',
      );
  const blocks: string[] = [];
  let list: "ul" | "ol" | "" = "";
  let listItems: string[] = [];
  const flushList = () => {
    if (!list) return;
    blocks.push(
      `<${list}>${listItems.map((item) => `<li>${inline(item)}</li>`).join("")}</${list}>`,
    );
    list = "";
    listItems = [];
  };

  for (const line of value.split("\n")) {
    const unordered = line.match(/^-\s+(.+)/);
    const ordered = line.match(/^\d+\.\s+(.+)/);
    if (unordered || ordered) {
      const nextType = unordered ? "ul" : "ol";
      if (list && list !== nextType) flushList();
      list = nextType;
      listItems.push((unordered || ordered)?.[1] || "");
      continue;
    }
    flushList();
    if (!line.trim()) {
      blocks.push("<br />");
    } else if (line.startsWith("### ")) {
      blocks.push(`<h4>${inline(line.slice(4))}</h4>`);
    } else if (line.startsWith("## ")) {
      blocks.push(`<h3>${inline(line.slice(3))}</h3>`);
    } else if (line.startsWith("# ")) {
      blocks.push(`<h2>${inline(line.slice(2))}</h2>`);
    } else if (line.startsWith("> ")) {
      blocks.push(`<blockquote>${inline(line.slice(2))}</blockquote>`);
    } else {
      blocks.push(`<p>${inline(line)}</p>`);
    }
  }
  flushList();
  return blocks.join("");
}

function MarkdownEditor({ value }: { value: string }) {
  const [content, setContent] = useState(value);
  const [preview, setPreview] = useState(true);
  const input = useRef<HTMLTextAreaElement>(null);

  useEffect(() => setContent(value), [value]);

  const addMarkdown = (prefix: string, suffix = "") => {
    const textarea = input.current;
    if (!textarea) return;
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const selected = content.slice(start, end) || "";
    const next = `${content.slice(0, start)}${prefix}${selected}${suffix}${content.slice(end)}`;
    setContent(next);
    requestAnimationFrame(() => {
      textarea.focus();
      textarea.setSelectionRange(
        start + prefix.length,
        start + prefix.length + selected.length,
      );
    });
  };

  return (
    <div className={`markdown-editor${preview ? " has-preview" : ""}`}>
      <div className="markdown-tools">
        {[
          ["**", "**", "Bold"],
          ["*", "*", "Italic"],
          ["# ", "", "Heading"],
          ["- ", "", "Unordered list"],
          ["1. ", "", "Ordered list"],
          ["> ", "", "Quote"],
        ].map(([prefix, suffix, label]) => (
          <button
            className="btn btn--line"
            key={label}
            onClick={() => addMarkdown(prefix, suffix)}
            type="button"
          >
            {label}
          </button>
        ))}
        <button
          className="btn btn--line"
          onClick={() => setPreview((shown) => !shown)}
          type="button"
        >
          {preview ? "Hide preview" : "Show preview"}
        </button>
      </div>
      <div className="markdown-panes">
        <textarea
          ref={input}
          name="content_markdown"
          rows={18}
          value={content}
          onChange={(event) => setContent(event.target.value)}
          placeholder="Write the post in Markdown"
        />
        {preview && (
          <article
            className="markdown-preview"
            aria-label="Live Markdown preview"
            dangerouslySetInnerHTML={{ __html: markdownPreview(content) }}
          />
        )}
      </div>
    </div>
  );
}

function ThumbnailUploader({ value }: { value: string }) {
  const [thumbnail, setThumbnail] = useState(value);
  const [error, setError] = useState("");

  useEffect(() => setThumbnail(value), [value]);

  const chooseImage = (event: React.ChangeEvent<HTMLInputElement>) => {
    const image = event.target.files?.[0];
    if (!image) return;
    if (!image.type.startsWith("image/")) {
      setError("Choose an image file.");
      event.target.value = "";
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      setThumbnail(String(reader.result || ""));
      setError("");
    };
    reader.readAsDataURL(image);
  };

  return (
    <div className="thumbnail-uploader">
      <input name="thumbnail_data_url" type="hidden" value={thumbnail} />
      <label className="btn btn--line thumbnail-upload-button">
        <input
          accept="image/avif,image/gif,image/jpeg,image/png,image/webp"
          onChange={chooseImage}
          type="file"
        />
        <span>{thumbnail ? "Replace image" : "Choose image"}</span>
      </label>
      {thumbnail && (
        <button
          className="btn btn--line"
          onClick={() => setThumbnail("")}
          type="button"
        >
          Remove image
        </button>
      )}
      <small>PNG, JPG, GIF, WebP, or AVIF.</small>
      {error && (
        <p className="thumbnail-error" role="alert">
          {error}
        </p>
      )}
      {thumbnail && (
        <img alt="Thumbnail preview" className="thumbnail-preview" src={thumbnail} />
      )}
    </div>
  );
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
  const [counts, setCounts] = useState<Record<Kind, number>>({
    organizations: 0,
    programs: 0,
    events: 0,
    grants: 0,
    blog: 0,
  });
  const [message, setMessage] = useState("");
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [current, setCurrent] = useState(detailRoute);
  const [operations, setOperations] = useState<"queue" | "beta" | null>(null);
  const [queueItems, setQueueItems] = useState<Item[]>([]);
  const [selectedQueueItem, setSelectedQueueItem] = useState<Item | null>(null);
  const [betaTesters, setBetaTesters] = useState<Item[]>([]);
  const [selectedBetaTester, setSelectedBetaTester] = useState<Item | null>(null);

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
      .then((body) => {
        setItems(body.items || []);
        setCounts((currentCounts) => ({
          ...currentCounts,
          [kind]: Number(body.total || 0),
        }));
      })
      .catch((error) => handleError(error, "Could not load the directory."))
      .finally(() => setLoading(false));
  }, [current, kind]);

  useEffect(() => {
    if (current) return;
    Promise.all(
      KINDS.map(async (entry) => {
        const body = await request(`/admin-data/${entry}?counts=1`);
        return [entry, Number(body.total || 0)] as const;
      }),
    )
      .then((entries) => setCounts(Object.fromEntries(entries) as Record<Kind, number>))
      .catch((error) => handleError(error, "Could not load directory totals."));
  }, [current]);

  useEffect(() => {
    if (!operations) return;
    const path =
      operations === "queue" ? "/admin-data/queue" : "/admin-data/beta-testers";
    request(path)
      .then((body) => {
        if (operations === "queue") setQueueItems(body.items || []);
        else setBetaTesters(body.items || []);
      })
      .catch((error) => handleError(error, "Could not load this section."));
  }, [operations]);

  useEffect(() => {
    Promise.all([request("/admin-data/queue"), request("/admin-data/beta-testers")])
      .then(([queue, beta]) => {
        setQueueItems(queue.items || []);
        setBetaTesters(beta.items || []);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!current) {
      setItem(null);
      return;
    }
    setKind(current.kind);
    setMessage("");
    if (current.id === "new") {
      setItem(newItem(current.kind));
    } else {
      request(`/admin-data/${current.kind}/${current.id}`)
        .then((body) => {
          const item = body.item;
          for (const field of ["last_ok_at", "starts_at", "ends_at", "publish_at"]) {
            if (!item?.[field]) continue;
            const timestamp = new Date(String(item[field]));
            if (!Number.isNaN(timestamp.getTime())) {
              item[field] = timestamp.toISOString();
            }
          }
          setItem(item);
        })
        .catch((error) => handleError(error, "Could not load this item."));
    }

    if (current.kind === "organizations" && current.id !== "new") {
      request(`/admin-data/organizations/${current.id}/activity`)
        .then((body) => setActivity(body.items || []))
        .catch((error) =>
          handleError(error, "Could not load this organization's activity."),
        );
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
      const primary =
        sports.length === 1
          ? SPORTS.find(([key]) => key === sports[0])
          : ["multi", "Multi-sport"];
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

    if (current.kind === "grants") {
      data.sports_json = JSON.stringify(
        form.getAll("sports_json").map(String).filter(Boolean),
      );
      const minimum = Number(data.amount_min_cents || 0);
      const maximum = Number(data.amount_max_cents || 0);
      if (data.amount_max_cents && maximum < minimum) {
        setMessage("Maximum grant amount cannot be below the minimum amount.");
        return;
      }
    }

    if (current.kind === "blog" && !String(data.slug || "").trim()) {
      data.slug = String(data.title || "")
        .toLocaleLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "");
    }

    for (const field of ["last_ok_at", "starts_at", "ends_at", "publish_at"]) {
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
      const creating = current.id === "new";
      const body = await request(
        `/admin-data/${current.kind}${creating ? "" : `/${current.id}`}`,
        {
          method: creating ? "POST" : "PATCH",
          body: JSON.stringify(data),
        },
      );
      setItem(body.item);
      if (creating) {
        go(`/admin/directory/${current.kind}/${body.item.id}`);
        setMessage("Item created.");
      } else {
        setMessage("Changes saved.");
      }
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

  const deleteActivityNote = async (activityId: string) => {
    if (!current || current.kind !== "organizations") return;

    try {
      await request(`/admin-data/organizations/${current.id}/activity/${activityId}`, {
        method: "DELETE",
      });
      setActivity((entries) => entries.filter((entry) => entry.id !== activityId));
      setMessage("Note deleted.");
    } catch (error) {
      handleError(error, "Could not delete that note.");
    }
  };

  const saveBetaTester = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    try {
      await request("/admin-data/beta-testers", {
        method: "POST",
        body: JSON.stringify({
          email: String(data.get("email") || ""),
          name: String(data.get("name") || ""),
          organization: String(data.get("organization") || ""),
          phone: String(data.get("phone") || ""),
          enabled: true,
          sendInvitation: true,
        }),
      });
      form.reset();
      const body = await request("/admin-data/beta-testers");
      setBetaTesters(body.items || []);
      setMessage("Beta tester saved and invited by email.");
    } catch (error) {
      handleError(error, "Could not save that beta tester.");
    }
  };

  const updateBetaTester = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selectedBetaTester) return;
    const form = event.currentTarget;
    const data = new FormData(form);
    try {
      await request("/admin-data/beta-testers", {
        method: "POST",
        body: JSON.stringify({
          email: String(selectedBetaTester.email || ""),
          name: String(data.get("name") || ""),
          organization: String(data.get("organization") || ""),
          phone: String(data.get("phone") || ""),
          enabled: data.get("enabled") === "on",
          sendInvitation: false,
        }),
      });
      const body = await request("/admin-data/beta-testers");
      const updated = (body.items || []).find(
        (tester: Item) => String(tester.email) === String(selectedBetaTester.email),
      );
      setBetaTesters(body.items || []);
      setSelectedBetaTester(updated || null);
      setMessage("Beta tester updated.");
    } catch (error) {
      handleError(error, "Could not update that beta tester.");
    }
  };

  const toggleBetaTester = async (tester: Item) => {
    try {
      await request("/admin-data/beta-testers", {
        method: "POST",
        body: JSON.stringify({
          email: String(tester.email || ""),
          enabled: !Number(tester.enabled),
        }),
      });
      const body = await request("/admin-data/beta-testers");
      setBetaTesters(body.items || []);
      setMessage(
        Number(tester.enabled) ? "Beta tester disabled." : "Beta tester enabled.",
      );
    } catch (error) {
      handleError(error, "Could not update that beta tester.");
    }
  };

  const removeBetaTester = async (tester: Item) => {
    const email = String(tester.email || "");
    if (!confirm(`Remove beta access for ${email}?`)) return;
    try {
      await request("/admin-data/beta-testers", {
        method: "DELETE",
        body: JSON.stringify({ email }),
      });
      setBetaTesters((testers) =>
        testers.filter((entry) => String(entry.email) !== email),
      );
      setMessage("Beta tester removed.");
    } catch (error) {
      handleError(error, "Could not remove that beta tester.");
    }
  };

  const acceptQueueItem = async () => {
    if (!selectedQueueItem) return;
    try {
      await request(`/admin-data/queue/${selectedQueueItem.id}`, { method: "POST" });
      setQueueItems((items) =>
        items.filter((entry) => entry.id !== selectedQueueItem.id),
      );
      setSelectedQueueItem(null);
      setMessage("Submission accepted and published.");
    } catch (error) {
      handleError(error, "Could not accept this submission.");
    }
  };

  if (operations === "queue") {
    if (selectedQueueItem)
      return (
        <section className="directory-page">
          <button className="back-link" onClick={() => setSelectedQueueItem(null)}>
            ← Submission queue
          </button>
          <h2>{String(selectedQueueItem.title || "Submission")}</h2>
          <p className="sub">
            Review the submitted details before accepting and publishing.
          </p>
          <section className="queue-editor">
            <dl>
              {Object.entries(
                (selectedQueueItem.payload || {}) as Record<string, unknown>,
              ).map(([key, value]) => (
                <>
                  <dt key={`${key}-term`}>{fieldLabel(key)}</dt>
                  <dd key={`${key}-value`}>{String(value)}</dd>
                </>
              ))}
            </dl>
            <p className="directory-message" role="status">
              {message}
            </p>
            <button className="btn" onClick={acceptQueueItem} type="button">
              Accept and publish
            </button>
          </section>
        </section>
      );
    return (
      <section className="directory-page">
        <button className="back-link" onClick={() => setOperations(null)}>
          ← ASNM directory
        </button>
        <h2>Submission Queue</h2>
        <p className="sub">
          New organization, program, event, and listing submissions awaiting review.
        </p>
        <div className="directory-list queue-grid">
          {queueItems.length ? (
            queueItems.map((entry) => (
              <button
                className="directory-item"
                key={String(entry.id)}
                onClick={() => setSelectedQueueItem(entry)}
              >
                <span>
                  <b>{String(entry.title || "Submission")}</b>
                  <small>
                    {titleCase(entry.kind)} ·{" "}
                    {String(entry.contact_email || "No contact email")}
                  </small>
                </span>
                <span aria-hidden="true">→</span>
              </button>
            ))
          ) : (
            <p>No submissions need review.</p>
          )}
        </div>
      </section>
    );
  }

  if (operations === "beta") {
    if (selectedBetaTester) {
      return (
        <section className="directory-page">
          <button className="back-link" onClick={() => setSelectedBetaTester(null)}>
            ← Beta testers
          </button>
          <h2>{String(selectedBetaTester.name || selectedBetaTester.email)}</h2>
          <p className="sub">Update this beta tester's access and contact details.</p>
          <form className="beta-tester-form" onSubmit={updateBetaTester}>
            <label className="form-field wide">
              <span>Email Address</span>
              <input
                readOnly
                type="email"
                value={String(selectedBetaTester.email || "")}
              />
            </label>
            <label className="form-field">
              <span>Name</span>
              <input
                defaultValue={String(selectedBetaTester.name || "")}
                name="name"
                placeholder="Full name"
                required
              />
            </label>
            <label className="form-field">
              <span>Organization</span>
              <input
                defaultValue={String(selectedBetaTester.organization || "")}
                name="organization"
                placeholder="Optional"
              />
            </label>
            <label className="form-field">
              <span>Phone Number</span>
              <input
                defaultValue={String(selectedBetaTester.phone || "")}
                name="phone"
                placeholder="Optional"
                type="tel"
              />
            </label>
            <label className="switch-field beta-access-switch">
              <span>Beta Access</span>
              <input
                defaultChecked={Boolean(Number(selectedBetaTester.enabled))}
                name="enabled"
                type="checkbox"
              />
            </label>
            <button className="btn" type="submit">
              Save changes
            </button>
          </form>
          <p className="directory-message" role="status">
            {message}
          </p>
        </section>
      );
    }
    return (
      <section className="directory-page">
        <button className="back-link" onClick={() => setOperations(null)}>
          ← ASNM directory
        </button>
        <h2>Beta Testers</h2>
        <p className="sub">
          Approved emails can unlock the production beta while prelaunch mode is
          enabled.
        </p>
        <form className="beta-tester-form" onSubmit={saveBetaTester}>
          <label className="form-field">
            <span>Name</span>
            <input name="name" placeholder="Full name" required />
          </label>
          <label className="form-field">
            <span>Email Address</span>
            <input name="email" type="email" placeholder="name@example.com" required />
          </label>
          <label className="form-field">
            <span>Organization</span>
            <input name="organization" placeholder="Optional" />
          </label>
          <label className="form-field">
            <span>Phone Number</span>
            <input name="phone" type="tel" placeholder="Optional" />
          </label>
          <button className="btn" type="submit">
            Add and invite beta tester
          </button>
        </form>
        <div className="directory-list">
          {betaTesters.map((tester) => (
            <div className="beta-tester" key={String(tester.email)}>
              <span>
                <b>{String(tester.name || tester.email)}</b>
                <small>
                  {String(tester.email)}
                  {tester.organization ? `; ${String(tester.organization)}` : ""}
                  {tester.phone ? `; ${String(tester.phone)}` : ""}
                  {`; ${Number(tester.enabled) ? "Enabled" : "Disabled"}`}
                </small>
              </span>
              <div className="beta-tester-actions">
                <button
                  className="btn btn--line"
                  onClick={() => setSelectedBetaTester(tester)}
                  type="button"
                >
                  Edit
                </button>
                <button
                  className="btn btn--line"
                  onClick={() => toggleBetaTester(tester)}
                  type="button"
                >
                  {Number(tester.enabled) ? "Disable" : "Enable"}
                </button>
                <button
                  className="btn btn--line"
                  onClick={() => removeBetaTester(tester)}
                  type="button"
                >
                  Remove
                </button>
              </div>
            </div>
          ))}
        </div>
        <p className="directory-message" role="status">
          {message}
        </p>
      </section>
    );
  }

  if (current) {
    const detail = DETAILS[current.kind];
    const creating = current.id === "new";
    return (
      <section className="directory-page">
        <button className="back-link" onClick={() => go("/admin/directory")}>
          ← {detail.label}
        </button>
        <h2>
          {creating
            ? `Add ${detail.label.slice(0, -1)}`
            : item
              ? String(item.name || item.title || "Edit item")
              : "Edit item"}
        </h2>
        {item && (
          <form className="directory-form" onSubmit={save}>
            {detail.fields.map((field) => {
              if (detail.booleans.includes(field)) {
                return (
                  <label className="switch-field" key={field}>
                    <span>{fieldLabel(field)}</span>
                    <input
                      name={field}
                      type="checkbox"
                      defaultChecked={Boolean(Number(item[field]))}
                    />
                    <i aria-hidden="true" />
                  </label>
                );
              }
              if (current.kind === "programs" && field === "seasons_json") {
                return (
                  <div className="form-field" key={field}>
                    <span>Seasons</span>
                    <SearchSelect
                      name={field}
                      multiple
                      value={selectedSeasons(item)}
                      options={["spring", "summer", "fall", "winter"].map((season) => ({
                        value: season,
                        label: titleCase(season),
                      }))}
                      placeholder="Choose seasons"
                    />
                    <small>Choose every season this program is available.</small>
                  </div>
                );
              }
              if (current.kind === "blog" && field === "content_markdown") {
                return (
                  <div className="form-field wide" key={field}>
                    <span>Content (Markdown)</span>
                    <MarkdownEditor value={itemValue(item, field)} />
                  </div>
                );
              }

              if (current.kind === "blog" && field === "thumbnail_data_url") {
                return (
                  <div className="form-field wide" key={field}>
                    <span>Thumbnail Image</span>
                    <ThumbnailUploader value={itemValue(item, field)} />
                  </div>
                );
              }

              if (AREAS.has(field)) {
                return (
                  <label className="form-field wide" key={field}>
                    <span>{fieldLabel(field)}</span>
                    <textarea
                      name={field}
                      rows={field === "content_markdown" ? 16 : 5}
                      defaultValue={itemValue(item, field)}
                      placeholder={fieldPlaceholder(field)}
                    />
                  </label>
                );
              }

              if (current.kind === "blog" && field === "status") {
                return (
                  <div className="form-field" key={field}>
                    <span>Status</span>
                    <SearchSelect
                      name={field}
                      value={itemValue(item, field)}
                      options={[
                        { value: "draft", label: "Draft" },
                        { value: "published", label: "Published" },
                      ]}
                    />
                  </div>
                );
              }

              if (current.kind === "grants" && field === "type") {
                return (
                  <div className="form-field" key={field}>
                    <span>Grant Type</span>
                    <SearchSelect
                      name={field}
                      value={itemValue(item, field)}
                      options={[
                        "general",
                        "equipment",
                        "quality_of_life",
                        "training",
                        "program",
                      ].map((value) => ({ value, label: titleCase(value) }))}
                      placeholder="Choose a grant type"
                    />
                  </div>
                );
              }

              if (current.kind === "grants" && field === "audience") {
                return (
                  <div className="form-field" key={field}>
                    <span>Grant Audience</span>
                    <SearchSelect
                      name={field}
                      value={itemValue(item, field)}
                      options={["athlete", "program"].map((value) => ({
                        value,
                        label: titleCase(value),
                      }))}
                      placeholder="Choose a grant audience"
                    />
                  </div>
                );
              }

              if (current.kind === "grants" && field === "status") {
                return (
                  <div className="form-field" key={field}>
                    <span>Grant Status</span>
                    <SearchSelect
                      name={field}
                      value={itemValue(item, field)}
                      options={["active", "inactive", "archived"].map((value) => ({
                        value,
                        label: titleCase(value),
                      }))}
                      placeholder="Choose a grant status"
                    />
                  </div>
                );
              }

              if (current.kind === "grants" && field === "sports_json") {
                return (
                  <div className="form-field wide" key={field}>
                    <span>Sports</span>
                    <SearchSelect
                      name={field}
                      multiple
                      value={selectedSports(item)}
                      options={SPORTS.map(([value, label]) => ({ value, label }))}
                      placeholder="Choose sports"
                    />
                    <small>Leave blank when the grant is open to every sport.</small>
                  </div>
                );
              }

              if (current.kind === "grants" && field === "amount_min_cents") {
                return (
                  <label className="form-field" key={field}>
                    <span>Amount Min Cents</span>
                    <input
                      name={field}
                      type="number"
                      min="0"
                      step="1"
                      defaultValue={itemValue(item, field)}
                      placeholder="Enter minimum cents"
                      onInput={(event) => {
                        const minimum = event.currentTarget.value || "0";
                        const maximum = event.currentTarget.form?.elements.namedItem(
                          "amount_max_cents",
                        ) as HTMLInputElement | null;
                        if (!maximum) return;
                        maximum.min = minimum;
                        if (maximum.value && Number(maximum.value) < Number(minimum))
                          maximum.value = minimum;
                      }}
                    />
                  </label>
                );
              }

              if (current.kind === "grants" && field === "amount_max_cents") {
                return (
                  <label className="form-field" key={field}>
                    <span>Amount Max Cents</span>
                    <input
                      name={field}
                      type="number"
                      min={itemValue(item, "amount_min_cents") || "0"}
                      step="1"
                      defaultValue={itemValue(item, field)}
                      placeholder="Enter maximum cents"
                    />
                  </label>
                );
              }

              if (
                ["organizations", "programs"].includes(current.kind) &&
                field === "sports_json"
              ) {
                return (
                  <div className="form-field wide" key={field}>
                    <span>Sports Offered</span>
                    <SearchSelect
                      name={field}
                      multiple
                      value={selectedSports(item)}
                      options={SPORTS.map(([value, label]) => ({ value, label }))}
                      placeholder="Choose sports"
                    />
                    <small>
                      Choose every sport this{" "}
                      {current.kind === "organizations" ? "organization" : "program"}{" "}
                      offers.
                    </small>
                  </div>
                );
              }

              if (current.kind === "programs" && field === "organization_id") {
                const currentOrganization = itemValue(item, field);
                const options = organizations.map((organization) => ({
                  value: organization.id,
                  label: String(organization.name || "Untitled organization"),
                }));
                if (
                  currentOrganization &&
                  !options.some((option) => option.value === currentOrganization)
                )
                  options.unshift({
                    value: currentOrganization,
                    label: currentOrganization,
                  });
                return (
                  <div className="form-field wide" key={field}>
                    <span>Organization</span>
                    <SearchSelect
                      name={field}
                      value={currentOrganization}
                      options={options}
                      placeholder="Choose an organization"
                    />
                  </div>
                );
              }

              if (current.kind === "programs" && field === "organization_id") {
                const currentOrganization = itemValue(item, field);
                return (
                  <label className="form-field" key={field}>
                    <span>Organization</span>
                    <select name={field} defaultValue={currentOrganization}>
                      <option value="">Choose an organization</option>
                      {currentOrganization &&
                        !organizations.some(
                          (organization) => organization.id === currentOrganization,
                        ) && (
                          <option value={currentOrganization}>
                            {currentOrganization}
                          </option>
                        )}
                      {organizations.map((organization) => (
                        <option key={organization.id} value={organization.id}>
                          {String(organization.name || "Untitled organization")}
                          {organization.city
                            ? ` · ${organization.city}${organization.state ? `, ${organization.state}` : ""}`
                            : ""}
                        </option>
                      ))}
                    </select>
                  </label>
                );
              }

              if (current.kind === "programs" && field === "listing") {
                return (
                  <div className="form-field" key={field}>
                    <span>Listing</span>
                    <SearchSelect
                      name={field}
                      value={itemValue(item, field)}
                      options={[
                        { value: "own", label: "Own" },
                        { value: "with_org", label: "With organization" },
                      ]}
                    />
                  </div>
                );
              }

              if (current.kind === "programs" && field === "listing") {
                return (
                  <label className="form-field" key={field}>
                    <span>Listing</span>
                    <select name={field} defaultValue={itemValue(item, field)}>
                      <option value="own">Own</option>
                      <option value="with_org">With organization</option>
                    </select>
                  </label>
                );
              }

              if (current.kind === "programs" && field === "usual_month") {
                return (
                  <div className="form-field" key={field}>
                    <span>Usual Month</span>
                    <SearchSelect
                      name={field}
                      value={itemValue(item, field)}
                      options={[
                        { value: "", label: "Not set" },
                        ...MONTHS.map((label, index) => ({
                          value: String(index + 1),
                          label,
                        })),
                      ]}
                    />
                  </div>
                );
              }

              if (current.kind === "programs" && field === "usual_month") {
                return (
                  <label className="form-field" key={field}>
                    <span>Usual Month</span>
                    <select name={field} defaultValue={itemValue(item, field)}>
                      <option value="">Not set</option>
                      {MONTHS.map((month, index) => (
                        <option key={month} value={index + 1}>
                          {month}
                        </option>
                      ))}
                    </select>
                  </label>
                );
              }

              if (current.kind === "programs" && field === "first_year") {
                return (
                  <label className="form-field" key={field}>
                    <span>First Year</span>
                    <input
                      name={field}
                      type="text"
                      inputMode="numeric"
                      pattern="[0-9]*"
                      min="1950"
                      max={CURRENT_YEAR}
                      defaultValue={itemValue(item, field)}
                      placeholder="Enter first year"
                      onInput={(event) => {
                        event.currentTarget.value = numericValue(
                          event.currentTarget.value,
                        );
                      }}
                    />
                  </label>
                );
              }

              if (current.kind === "events" && field === "org_id") {
                const currentOrganization = itemValue(item, field);
                const options = organizations.map((organization) => ({
                  value: organization.id,
                  label: String(organization.name || "Untitled organization"),
                }));
                if (
                  currentOrganization &&
                  !options.some((option) => option.value === currentOrganization)
                )
                  options.unshift({
                    value: currentOrganization,
                    label: currentOrganization,
                  });
                return (
                  <div className="form-field wide" key={field}>
                    <span>Organization</span>
                    <SearchSelect
                      name={field}
                      value={currentOrganization}
                      options={options}
                      placeholder="Choose an organization"
                    />
                  </div>
                );
              }

              if (current.kind === "events" && field === "org_id") {
                const currentOrganization = itemValue(item, field);
                return (
                  <label className="form-field" key={field}>
                    <span>Organization</span>
                    <select name={field} defaultValue={currentOrganization}>
                      <option value="">Choose an organization</option>
                      {currentOrganization &&
                        !organizations.some(
                          (organization) => organization.id === currentOrganization,
                        ) && (
                          <option value={currentOrganization}>
                            {currentOrganization}
                          </option>
                        )}
                      {organizations.map((organization) => (
                        <option key={organization.id} value={organization.id}>
                          {String(organization.name || "Untitled organization")}
                        </option>
                      ))}
                    </select>
                  </label>
                );
              }

              if (current.kind === "events" && field === "program_id") {
                const currentProgram = itemValue(item, field);
                const options = [
                  { value: "", label: "No linked program" },
                  ...programOptions.map((program) => ({
                    value: program.id,
                    label: String(program.name || "Untitled program"),
                  })),
                ];
                if (
                  currentProgram &&
                  !options.some((option) => option.value === currentProgram)
                )
                  options.push({ value: currentProgram, label: currentProgram });
                return (
                  <div className="form-field wide" key={field}>
                    <span>Program</span>
                    <SearchSelect
                      name={field}
                      value={currentProgram}
                      options={options}
                      placeholder="No linked program"
                    />
                  </div>
                );
              }

              if (current.kind === "events" && field === "program_id") {
                const currentProgram = itemValue(item, field);
                return (
                  <label className="form-field" key={field}>
                    <span>Program</span>
                    <select name={field} defaultValue={currentProgram}>
                      <option value="">No linked program</option>
                      {currentProgram &&
                        !programOptions.some(
                          (program) => program.id === currentProgram,
                        ) && <option value={currentProgram}>{currentProgram}</option>}
                      {programOptions.map((program) => (
                        <option key={program.id} value={program.id}>
                          {String(program.name || "Untitled program")}
                        </option>
                      ))}
                    </select>
                  </label>
                );
              }

              if (current.kind === "events" && field === "sport_key") {
                return (
                  <div className="form-field" key={field}>
                    <span>Sport</span>
                    <SearchSelect
                      name={field}
                      value={itemValue(item, field)}
                      options={[
                        { value: "", label: "Not set" },
                        ...SPORTS.map(([value, label]) => ({ value, label })),
                      ]}
                    />
                  </div>
                );
              }

              if (current.kind === "events" && field === "sport_key") {
                return (
                  <label className="form-field" key={field}>
                    <span>Sport</span>
                    <select name={field} defaultValue={itemValue(item, field)}>
                      <option value="">Not set</option>
                      {SPORTS.map(([key, name]) => (
                        <option key={key} value={key}>
                          {name}
                        </option>
                      ))}
                    </select>
                  </label>
                );
              }

              if (
                ["organizations", "programs", "events"].includes(current.kind) &&
                [
                  "state",
                  "geo_precision",
                  "data_quality_rating",
                  "verification_status",
                  "status",
                ].includes(field)
              ) {
                return (
                  <div className="form-field" key={field}>
                    <span>{fieldLabel(field)}</span>
                    <SearchSelect
                      name={field}
                      value={itemValue(item, field)}
                      options={selectOptions(
                        field,
                        itemValue(item, field),
                        current.kind,
                      ).map(([value, label]) => ({ value, label }))}
                    />
                  </div>
                );
              }

              if (
                ["organizations", "programs", "events"].includes(current.kind) &&
                [
                  "state",
                  "geo_precision",
                  "data_quality_rating",
                  "verification_status",
                  "status",
                ].includes(field)
              ) {
                return (
                  <label className="form-field" key={field}>
                    <span>{fieldLabel(field)}</span>
                    <select name={field} defaultValue={itemValue(item, field)}>
                      {selectOptions(field, itemValue(item, field), current.kind).map(
                        ([optionValue, optionLabel]) => (
                          <option key={optionValue} value={optionValue}>
                            {optionLabel}
                          </option>
                        ),
                      )}
                    </select>
                  </label>
                );
              }
              const numeric = detail.numbers.includes(field);
              const decimal = field === "lat" || field === "lng";
              const titleSource =
                (current.kind === "programs" && field === "name") ||
                (current.kind === "blog" && field === "title");
              const initialValue = DATE_TIMES.has(field)
                ? dateTimeLocalValue(itemValue(item, field))
                : field === "deadline_next"
                  ? itemValue(item, field).slice(0, 10)
                  : itemValue(item, field);
              return (
                <label className="form-field" key={field}>
                  <span>{fieldLabel(field)}</span>
                  <input
                    name={field}
                    type={numeric ? "text" : inputType(detail, field)}
                    inputMode={numeric ? (decimal ? "decimal" : "numeric") : undefined}
                    pattern={
                      numeric ? (decimal ? "-?[0-9]*[.]?[0-9]*" : "[0-9]*") : undefined
                    }
                    step={DATE_TIMES.has(field) ? "1" : undefined}
                    defaultValue={initialValue}
                    placeholder={fieldPlaceholder(field)}
                    onInput={(event) => {
                      if (numeric)
                        event.currentTarget.value = numericValue(
                          event.currentTarget.value,
                          decimal,
                        );
                      if (titleSource) {
                        const slug = event.currentTarget.form?.elements.namedItem(
                          "slug",
                        ) as HTMLInputElement | null;
                        if (slug)
                          slug.value = event.currentTarget.value
                            .toLocaleLowerCase()
                            .replace(/[^a-z0-9]+/g, "-")
                            .replace(/^-+|-+$/g, "");
                      }
                    }}
                  />
                </label>
              );
            })}
            <div className="directory-actions">
              <button className="btn" type="submit">
                {creating ? `Create ${detail.label.slice(0, -1)}` : "Save changes"}
              </button>
            </div>
          </form>
        )}
        <p className="directory-message" role="status">
          {message}
        </p>
        {current.kind === "organizations" && !creating && (
          <section className="activity-panel" aria-labelledby="activity-heading">
            <h3 id="activity-heading">Activity</h3>
            <p className="sub">Team only, never shown on the site.</p>
            <form className="activity-note-form" onSubmit={addActivityNote}>
              <label className="form-field">
                <span>Add a note</span>
                <textarea
                  name="note"
                  rows={2}
                  maxLength={500}
                  placeholder="Emailed Oct 26"
                />
              </label>
              <button className="btn" type="submit">
                Add note
              </button>
            </form>
            {activity.length ? (
              <ol className="activity-list">
                {activity.map((entry) => (
                  <li key={entry.id}>
                    <p>
                      <time dateTime={entry.created_at}>
                        {activityTime(entry.created_at)}
                      </time>
                      <b>{activityLabel(entry.kind)}</b>
                    </p>
                    <p>{entry.summary}</p>
                    {entry.actor && <small>{entry.actor}</small>}
                    {entry.kind === "note" && (
                      <button
                        className="btn btn--line"
                        onClick={() => deleteActivityNote(entry.id)}
                        type="button"
                      >
                        Delete note
                      </button>
                    )}
                  </li>
                ))}
              </ol>
            ) : (
              <p className="activity-empty">
                Nothing yet. Confirmations, fixes, edits, and your notes show here.
              </p>
            )}
          </section>
        )}
      </section>
    );
  }

  return (
    <section className="directory-page">
      <div className="directory-seg">
        <button
          className={operations === "queue" ? "on" : ""}
          onClick={() => setOperations("queue")}
        >
          Submission Queue ({queueItems.length})
        </button>
        <button
          className={operations === "beta" ? "on" : ""}
          onClick={() => setOperations("beta")}
        >
          Beta Testers ({betaTesters.length})
        </button>
        {KINDS.map((entry) => (
          <button
            key={entry}
            className={entry === kind ? "on" : ""}
            onClick={() => chooseKind(entry)}
          >
            {DETAILS[entry].label} ({counts[entry].toLocaleString()})
          </button>
        ))}
      </div>
      <h2>{DETAILS[kind].label}</h2>
      <p className="sub">
        Manage all Adaptive Sports Near Me {kind} from Adapt To Life.
      </p>
      <div className="directory-actions">
        <button
          className="btn"
          type="button"
          onClick={() => go(`/admin/directory/${kind}/new`)}
        >
          Add {DETAILS[kind].label.slice(0, -1)}
        </button>
      </div>
      <label className="directory-search">
        <span>Search {DETAILS[kind].label.toLowerCase()}</span>
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Type a name"
        />
      </label>
      <p className="directory-message" role="status">
        {message}
      </p>
      {loading ? (
        <div className="directory-loading" role="status">
          <i aria-hidden="true" />
          Loading {DETAILS[kind].label.toLowerCase()}…
        </div>
      ) : (
        <div className="directory-list">
          {items
            .filter((entry) =>
              fuzzyMatches(String(entry.name || entry.title || ""), query),
            )
            .map((entry) => (
              <button
                className="directory-item"
                key={entry.id}
                onClick={() => go(`/admin/directory/${kind}/${entry.id}`)}
              >
                <span>
                  <b>{String(entry.name || entry.title || "Untitled")}</b>
                  <small>{itemSummary(entry)}</small>
                </span>
                <span aria-hidden="true">→</span>
              </button>
            ))}
        </div>
      )}
    </section>
  );
}
