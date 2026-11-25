// The lists this Worker keeps, one per brand (docs/EMAIL.md, "Contacts, lists
// and unsubscribing"). The Resend team is shared by every brand, and its
// `unsubscribed` flag is team wide, so a brand's permission lives in its Topic:
// joining opts the contact in to that Topic, unsubscribing opts them out of that
// Topic only. The Segment records where they signed up.
//
// The ids are Worker vars (wrangler.jsonc), never hard coded here. The Adaptive
// Sports Near Me list belongs to the adaptivesportsnearme Worker, and the
// AlecTranel.com Topic and Segment are never read or written by this code.
import { HOUSE_INBOX, SHOP_FROM, SHOP_REPLY_TO } from "./email.js";

export const POSTAL_ADDRESS = "1509 N Milwaukee Ave, Libertyville, IL 60048";

export const BRANDS = {
  atl: {
    key: "atl",
    name: "Adapt To Life",
    list: "Adapt To Life news",
    tag: "adapttolife",
    site: "adapttolife.org",
    signupUrl: "https://adapttolife.org/subscribe",
    topicVar: "RESEND_TOPIC_ATL",
    segmentVar: "RESEND_SEGMENT_ID",
    from: (env) =>
      env.NEWSLETTER_FROM || "Alec at Adapt To Life <hello@mail.adapttolife.org>",
    replyTo: (env) => env.NEWSLETTER_REPLY_TO || HOUSE_INBOX,
    inbox: HOUSE_INBOX,
    // Who sends it, at the foot of every list email (CAN-SPAM wants the address).
    postal: `Adapt To Life NFP, ${POSTAL_ADDRESS}`,
  },
  bodyshop: {
    key: "bodyshop",
    name: "Adapt Body Shop",
    list: "Adapt Body Shop news",
    tag: "bodyshop",
    site: "adaptbodyshop.com",
    signupUrl: "https://adaptbodyshop.com",
    topicVar: "RESEND_TOPIC_BODYSHOP",
    segmentVar: "RESEND_SEGMENT_BODYSHOP",
    from: () => SHOP_FROM,
    replyTo: () => SHOP_REPLY_TO,
    inbox: SHOP_REPLY_TO,
    postal: `Adapt Body Shop is part of Adapt To Life NFP, ${POSTAL_ADDRESS}`,
  },
};

export const brandFor = (key) =>
  Object.prototype.hasOwnProperty.call(BRANDS, key) ? BRANDS[key] : null;
export const topicIdFor = (env, brand) => String(env?.[brand.topicVar] || "");
export const segmentIdFor = (env, brand) => String(env?.[brand.segmentVar] || "");
