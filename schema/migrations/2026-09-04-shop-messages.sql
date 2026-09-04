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
