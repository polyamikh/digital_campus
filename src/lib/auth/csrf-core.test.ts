import assert from "node:assert/strict";
import { test } from "node:test";
import { isSameOriginRequest } from "./csrf-core";

test("accepts same-origin requests and rejects cross-origin or missing Origin", () => {
  assert.equal(isSameOriginRequest("http://localhost:3002/", "localhost:3002", "http", false), true);
  assert.equal(isSameOriginRequest("http://attacker.invalid/", "localhost:3002", "http", false), false);
  assert.equal(isSameOriginRequest(null, "localhost:3002", "http", false), false);
});

test("requires HTTPS origin in production and checks forwarded protocol", () => {
  assert.equal(isSameOriginRequest("http://campus.example/", "campus.example", "https", true), false);
  assert.equal(isSameOriginRequest("https://campus.example/", "campus.example", "https", true), true);
  assert.equal(isSameOriginRequest("https://campus.example/", "campus.example", "http", false), false);
});
