import test from "node:test";
import assert from "node:assert/strict";

import { findOrCreateThread } from "../src/agent_mail.js";

const input = {
  inbox: "julia@alectranel.com",
  fromAddr: "eng-intake@alectranel.com",
  subject: "Re: Spec 108 assignment",
  inReplyTo: "<known-message@alectranel.com>",
};

test("reply Message-ID lookup is scoped to the envelope recipient inbox", async () => {
  let sql = "";
  let bindings = [];
  const expected = { id: "julia-thread", inbox: input.inbox };
  const db = {
    prepare(statement) {
      sql = statement;
      return {
        bind(...args) {
          bindings = args;
          return { first: async () => expected };
        },
      };
    },
  };

  const actual = await findOrCreateThread(db, input);
  assert.equal(actual, expected);
  assert.match(sql, /m\.message_id = \? AND t\.inbox = \?/);
  assert.deepEqual(bindings, [input.inReplyTo, input.inbox]);
});

test("cross-inbox Message-ID miss falls back to the recipient's subject thread", async () => {
  const prepared = [];
  const expected = {
    id: "julia-subject-thread",
    inbox: input.inbox,
    from_addr: input.fromAddr,
    subject: "Spec 108 assignment",
  };
  const db = {
    prepare(sql) {
      prepared.push(sql);
      if (sql.includes("m.message_id")) {
        return {
          bind(messageId, inbox) {
            assert.deepEqual([messageId, inbox], [input.inReplyTo, input.inbox]);
            return { first: async () => null };
          },
        };
      }
      if (sql.includes("FROM threads WHERE inbox")) {
        return {
          bind(inbox, fromAddr) {
            assert.deepEqual([inbox, fromAddr], [input.inbox, input.fromAddr]);
            return { all: async () => ({ results: [expected] }) };
          },
        };
      }
      throw new Error(`unexpected SQL: ${sql}`);
    },
  };

  const actual = await findOrCreateThread(db, input);
  assert.equal(actual, expected);
  assert.equal(prepared.length, 2);
});
