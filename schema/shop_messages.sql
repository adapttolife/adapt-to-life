-- Adapt Body Shop contact form (adaptbodyshop.com/contact).
--
-- D1 is the source of truth, exactly as it is for signed waivers. The customer's
-- auto-reply, the internal notification and the CRM row are all things that
-- happen AFTER this insert succeeds, and every one of them is allowed to fail
-- without losing the message. A shop that drops a customer's question because a
-- Google API blinked is not a shop anyone should trust with an order.
--
-- crm_row is the idempotency key for the Sheets mirror: NULL means the cron has
-- not filed it yet, a value means it has and must not file it twice.
CREATE TABLE IF NOT EXISTS shop_messages (
  id            TEXT PRIMARY KEY,
  created_at    TEXT NOT NULL,              -- ISO-8601 UTC
  name          TEXT NOT NULL,
  email         TEXT NOT NULL,
  topic         TEXT NOT NULL,              -- closed set, see src/shop_contact.js
  order_number  TEXT NOT NULL DEFAULT '',
  message       TEXT NOT NULL,
  source        TEXT NOT NULL DEFAULT '',   -- page/referrer the form was on
  ref           TEXT NOT NULL DEFAULT '',   -- affiliate code carried by app/lib/attribution.ts
  ip            TEXT NOT NULL DEFAULT '',
  country       TEXT NOT NULL DEFAULT '',
  user_agent    TEXT NOT NULL DEFAULT '',
  receipt_sent  INTEGER NOT NULL DEFAULT 0,
  crm_row       TEXT                        -- A1 range written by the CRM cron; NULL = pending
);

CREATE INDEX IF NOT EXISTS shop_messages_created ON shop_messages (created_at);
CREATE INDEX IF NOT EXISTS shop_messages_email   ON shop_messages (email);
-- The cron's working query: everything not yet mirrored to the CRM, oldest first.
CREATE INDEX IF NOT EXISTS shop_messages_pending ON shop_messages (crm_row, created_at);

-- Adapt Body Shop newsletter sign-ups (the footer form on adaptbodyshop.com).
--
-- Capture first, mirror second. The storefront is told "subscribed" only after
-- this row exists; the CRM tab and (later, Spec 197 P3) the Shopify customer
-- with email marketing consent are both copies made after the fact.
--
-- One row per address: email is the primary key and the handler inserts with
-- ON CONFLICT DO NOTHING, so signing up twice is a success that writes nothing.
-- The first sign-up's source and time are kept, because that is when consent
-- was given.
--
-- crm_row is the Sheets idempotency key, same contract as shop_messages:
-- NULL = not yet mirrored to the "Shop Newsletter" tab.
CREATE TABLE IF NOT EXISTS shop_subscribers (
  email       TEXT PRIMARY KEY,             -- lowercased
  created_at  TEXT NOT NULL,                -- ISO-8601 UTC, first sign-up
  source      TEXT NOT NULL DEFAULT '',     -- page the footer form was on
  ref         TEXT NOT NULL DEFAULT '',     -- affiliate code, app/lib/attribution.ts
  ip          TEXT NOT NULL DEFAULT '',
  country     TEXT NOT NULL DEFAULT '',
  user_agent  TEXT NOT NULL DEFAULT '',
  crm_row     TEXT                          -- A1 range written by the CRM cron; NULL = pending
);

CREATE INDEX IF NOT EXISTS shop_subscribers_pending ON shop_subscribers (crm_row, created_at);
