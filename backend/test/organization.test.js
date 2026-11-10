import assert from "node:assert/strict";
import test from "node:test";
import { createOrganizationMiddleware } from "../src/middleware/organization.js";

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

test("organization middleware resolves active shops by slug", async () => {
  const expected = {
    id: "org-1",
    name: "Barbería",
    slug: "barberia-principal",
    timezone: "America/Bogota",
    active: true
  };
  const middleware = createOrganizationMiddleware({
    organization: {
      findUnique: async ({ where }) => where.slug === expected.slug ? expected : null
    }
  });
  const req = { params: { slug: expected.slug } };
  const res = createResponse();
  let nextCalled = false;

  await middleware(req, res, () => { nextCalled = true; });
  assert.deepEqual(req.organization, expected);
  assert.equal(nextCalled, true);
});

test("organization middleware rejects missing, inactive, and malformed shops", async () => {
  const middleware = createOrganizationMiddleware({
    organization: {
      findUnique: async ({ where }) => where.slug === "inactive-shop"
        ? { id: "org-2", slug: "inactive-shop", active: false }
        : null
    }
  });

  for (const slug of ["missing-shop", "inactive-shop", "Invalid Slug", "turnos"]) {
    const req = { params: { slug } };
    const res = createResponse();
    let nextCalled = false;

    await middleware(req, res, () => { nextCalled = true; });
    assert.equal(res.statusCode, 404);
    assert.equal(nextCalled, false);
  }
});

test("organization lookup errors are passed to Express error handling", async () => {
  const failure = new Error("database unavailable");
  const middleware = createOrganizationMiddleware({
    organization: { findUnique: async () => { throw failure; } }
  });
  let forwarded;

  await middleware({ params: { slug: "barberia-principal" } }, createResponse(), (error) => {
    forwarded = error;
  });
  assert.equal(forwarded, failure);
});
