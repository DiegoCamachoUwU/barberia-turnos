import assert from "node:assert/strict";
import test from "node:test";
import { createAdminAuth } from "../src/middleware/adminAuth.js";

const validToken = "0123456789abcdef0123456789abcdef";

function createResponse() {
  return {
    statusCode: 200,
    headers: {},
    body: undefined,
    set(name, value) {
      this.headers[name] = value;
      return this;
    },
    status(statusCode) {
      this.statusCode = statusCode;
      return this;
    },
    json(body) {
      this.body = body;
      return this;
    }
  };
}

test("admin operations fail closed when no token is configured", () => {
  const response = createResponse();
  let nextCalled = false;
  createAdminAuth(() => undefined)(
    { get: () => `Bearer ${validToken}` },
    response,
    () => { nextCalled = true; }
  );

  assert.equal(response.statusCode, 503);
  assert.equal(nextCalled, false);
});

test("admin operations reject missing and invalid bearer tokens", () => {
  for (const authorization of [undefined, "Bearer wrong"]) {
    const response = createResponse();
    let nextCalled = false;
    createAdminAuth(() => validToken)(
      { get: () => authorization },
      response,
      () => { nextCalled = true; }
    );

    assert.equal(response.statusCode, 401);
    assert.equal(response.headers["WWW-Authenticate"], 'Bearer realm="admin"');
    assert.equal(nextCalled, false);
  }
});

test("admin operations accept a configured bearer token", () => {
  const response = createResponse();
  let nextCalled = false;
  createAdminAuth(() => validToken)(
    { get: () => `Bearer ${validToken}` },
    response,
    () => { nextCalled = true; }
  );

  assert.equal(response.statusCode, 200);
  assert.equal(nextCalled, true);
});

test("admin operations reject configured tokens shorter than 32 bytes", () => {
  const response = createResponse();
  createAdminAuth(() => "short")({ get: () => "Bearer short" }, response, () => {
    assert.fail("next must not be called for a short token");
  });

  assert.equal(response.statusCode, 503);
});
