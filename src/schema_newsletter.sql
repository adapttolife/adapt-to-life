-- Delivery dedupe only; Resend owns consent and suppression (the contact's unsubscribed flag). publication_id holds the Resend segment id.
CREATE TABLE IF NOT EXISTS newsletter_delivery_claims (claim_key TEXT PRIMARY KEY,publication_id TEXT NOT NULL,subscription_id TEXT,state TEXT NOT NULL);
