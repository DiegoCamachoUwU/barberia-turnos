import assert from "node:assert/strict";
import test from "node:test";
import bcrypt from "bcryptjs";
import {
  isJwtConfigured,
  requireOrganizationMatch,
  requireRoles,
  signAuthToken,
  verifyAuthToken
} from "../src/middleware/auth.js";

const secret = "0123456789abcdef0123456789abcdef";
const user = {
  id: "staff-user-1",
  email: "admin@example.com",
  role: "ADMIN",
  organizationId: "organization-1"
};

function withJwtSecret(value, callback) {
  const previous = process.env.JWT_SECRET;
  if (value === undefined) delete process.env.JWT_SECRET;
  else process.env.JWT_SECRET = value;

  try {
    callback();
  } finally {
    if (previous === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = previous;
  }
}

function createResponse() {
  return {
    statusCode: 200,
    body: undefined,
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

test("JWT configuration requires a secret with at least 32 bytes", () => {
  withJwtSecret(undefined, () => assert.equal(isJwtConfigured(), false));
  withJwtSecret("too-short", () => assert.equal(isJwtConfigured(), false));
  withJwtSecret(secret, () => assert.equal(isJwtConfigured(), true));
});

test("JWT carries user, role, and organization and rejects invalid signatures", () => {
  withJwtSecret(secret, () => {
    const token = signAuthToken(user);
    assert.deepEqual(verifyAuthToken(token), {
      userId: user.id,
      role: user.role,
      organizationId: user.organizationId
    });
    assert.throws(() => verifyAuthToken(token, `${secret}wrong`));
  });
});

test("role middleware rejects missing and unauthorized roles", () => {
  for (const requestUser of [undefined, { ...user, role: "BARBER" }]) {
    const response = createResponse();
    let nextCalled = false;
    requireRoles("ADMIN")(
      { user: requestUser },
      response,
      () => { nextCalled = true; }
    );
    assert.equal(response.statusCode, 403);
    assert.equal(nextCalled, false);
  }

  let nextCalled = false;
  requireRoles("ADMIN")({ user }, createResponse(), () => { nextCalled = true; });
  assert.equal(nextCalled, true);
});

test("organization middleware blocks a user token from another shop", () => {
  const response = createResponse();
  let nextCalled = false;
  requireOrganizationMatch(
    { user, organization: { id: "another-organization" } },
    response,
    () => { nextCalled = true; }
  );
  assert.equal(response.statusCode, 403);
  assert.equal(nextCalled, false);
});

test("seed password hashes are verified by bcrypt without storing plaintext", async () => {
  const password = "a-private-test-password";
  const passwordHash = await bcrypt.hash(password, 4);
  assert.notEqual(passwordHash, password);
  assert.equal(await bcrypt.compare(password, passwordHash), true);
  assert.equal(await bcrypt.compare("wrong-password", passwordHash), false);
});
