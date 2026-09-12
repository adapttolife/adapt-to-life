-- Delivery dedupe only; Beehiiv remains the consent/suppression owner.
CREATE TABLE IF NOT EXISTS newsletter_delivery_claims (claim_key TEXT PRIMARY KEY,publication_id TEXT NOT NULL,subscription_id TEXT,state TEXT NOT NULL);
