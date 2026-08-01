-- Spec 116 P5+ — everything Cloudflare already knows about a scan.
--
--   cfrun npx wrangler d1 execute atl-waivers --remote \
--     --file schema/migrations/2026-08-01-qr-scan-geo.sql
--
-- Why now rather than when a dashboard needs it: capture cannot be backfilled.
-- Every scan that happens before these columns exist loses this data forever,
-- and the first real scans are about to arrive on printed shirts and stickers.
-- Storage is the cheap half; the expensive half is the scan you didn't record.
--
-- PRIVACY POSTURE, UNCHANGED. Every column here is something Cloudflare already
-- used to route the request. We still store NO IP address, NO cookie, and NO
-- identifier that could link one scan to another or to a person.
--
-- On latitude/longitude specifically: this is IP geolocation, accurate to a
-- city or region — the centroid of an area, not a person's position. It is NOT
-- GPS and cannot be. Nobody gets true GPS from a QR scan, Uniqode included;
-- that would require a browser permission prompt on the landing page, which we
-- are not going to put in front of a donor.

ALTER TABLE qr_scans ADD COLUMN latitude    TEXT;   -- city-level centroid, not GPS
ALTER TABLE qr_scans ADD COLUMN longitude   TEXT;
ALTER TABLE qr_scans ADD COLUMN postal_code TEXT;
ALTER TABLE qr_scans ADD COLUMN continent   TEXT;
ALTER TABLE qr_scans ADD COLUMN timezone    TEXT;   -- lets us ask "what LOCAL time do people scan?"
ALTER TABLE qr_scans ADD COLUMN network     TEXT;   -- carrier or ISP; separates a phone on cell data from venue wifi
ALTER TABLE qr_scans ADD COLUMN colo        TEXT;   -- Cloudflare edge that served it — a coarse sanity check on geo
ALTER TABLE qr_scans ADD COLUMN os          TEXT;   -- iOS / Android / Windows / macOS
ALTER TABLE qr_scans ADD COLUMN browser     TEXT;   -- in-app browser vs Safari vs Chrome: tells us HOW they scanned
