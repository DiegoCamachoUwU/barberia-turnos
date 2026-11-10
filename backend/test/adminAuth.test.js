import assert from "node:assert/strict";
import test from "node:test";
import {
  createAdminAuth,
  createAdminSession,
  isAdminConfigured,
  verifyAdminCredentials,
  verifyAdminSession
} from "../src/middleware/adminAuth.js";

const username = "barber-admin";
const password = "a-private-test-password";
const secret = "0123456789abcdef0123456789abcdef";

function withAdminEnvironment(callback) {
  const previous = {
    ADMIN_USERNAME: process.env.ADMIN_USERNAME,
    ADMIN_PASSWORD: process.env.ADMIN_PASSWORD,
    ADMIN_SESSION_SECRET: process.env.ADMIN_SESSION_SECRET
  };
  process.env.ADMIN_USERNAME = username;
  process.env.ADMIN_PASSWORD = password;
  process.env.ADMIN_SESSION_SECRET = secret;

  try {
    callback();
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

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

test("admin access fails closed when credentials or signing secret are missing", () => {
  withAdminEnvironment(() => {
    delete process.env.ADMIN_PASSWORD;
    assert.equal(isAdminConfigured(), false);
    assert.equal(verifyAdminCredentials(username, password), false);

    const response = createResponse();
    createAdminAuth()({ get: () => undefined }, response, () => {
      assert.fail("next must not be called when admin access is not configured");
    });
    assert.equal(response.statusCode, 503);
  });
});

test("admin credentials are checked without returning the password", () => {
  withAdminEnvironment(() => {
    assert.equal(verifyAdminCredentials(username, password), true);
    assert.equal(verifyAdminCredentials(username, "wrong-password"), false);
    assert.equal(verifyAdminCredentials("other-user", password), false);
  });
});

test("admin sessions are signed and expire after eight hours", () => {
  const now = Date.now();
  const { token, expiresIn } = createAdminSession(username, secret, now);
  assert.equal(expiresIn, 8 * 60 * 60);
  assert.equal(verifyAdminSession(token, { secret, username, now }), true);
  assert.equal(verifyAdminSession(token, { secret: `${secret}x`, username, now }), false);
  assert.equal(verifyAdminSession(token, { secret, username: "other-user", now }), false);
  assert.equal(
    verifyAdminSession(token, { secret, username, now: now + expiresIn * 1000 }),
    false
  );
});

test("admin endpoints reject missing and invalid bearer sessions", () => {
  withAdminEnvironment(() => {
    for (const authorization of [undefined, "Bearer invalid.token"]) {
      const response = createResponse();
      let nextCalled = false;
      createAdminAuth()(
        { get: () => authorization },
        response,
        () => { nextCalled = true; }
      );

      assert.equal(response.statusCode, 401);
      assert.equal(response.headers["WWW-Authenticate"], 'Bearer realm="admin"');
      assert.equal(nextCalled, false);
    }
  });
});

test("admin endpoints accept a valid bearer session", () => {
  withAdminEnvironment(() => {
    const { token } = createAdminSession(username);
    const response = createResponse();
    let nextCalled = false;
    createAdminAuth()(
      { get: () => `Bearer ${token}` },
      response,
      () => { nextCalled = true; }
    );

    assert.equal(response.statusCode, 200);
    assert.equal(nextCalled, true);
  });
});
