import test from "node:test";
import assert from "node:assert/strict";

import {
  loadCompanies,
  resolveCompany,
} from "../../src/economic/companies.js";

test("loadCompanies reads ECONOMIC_GRANT_<NAME> variables as lower-case keys", () => {
  const companies = loadCompanies({
    ECONOMIC_GRANT_ACME: "token-a",
    ECONOMIC_GRANT_BETA_APS: " token-b ",
    UNRELATED: "x",
  });

  assert.deepEqual(
    [...companies.entries()],
    [
      ["acme", "token-a"],
      ["beta_aps", "token-b"],
    ]
  );
});

test("loadCompanies maps the legacy variable to the default company", () => {
  const companies = loadCompanies({
    ECONOMIC_AGREEMENT_GRANT_TOKEN: "legacy-token",
  });

  assert.deepEqual([...companies.entries()], [["default", "legacy-token"]]);
});

test("loadCompanies never lets the legacy variable override ECONOMIC_GRANT_DEFAULT, in either order", () => {
  const legacyFirst = loadCompanies({
    ECONOMIC_AGREEMENT_GRANT_TOKEN: "legacy-token",
    ECONOMIC_GRANT_DEFAULT: "grant-default-token",
  });
  assert.equal(legacyFirst.get("default"), "grant-default-token");

  const legacySecond = loadCompanies({
    ECONOMIC_GRANT_DEFAULT: "grant-default-token",
    ECONOMIC_AGREEMENT_GRANT_TOKEN: "legacy-token",
  });
  assert.equal(legacySecond.get("default"), "grant-default-token");
});

test("loadCompanies ignores empty values and invalid suffixes", () => {
  const companies = loadCompanies({
    ECONOMIC_GRANT_: "x",
    ECONOMIC_GRANT_lower: "x",
    "ECONOMIC_GRANT_WITH-DASH": "x",
    ECONOMIC_GRANT_EMPTY: "   ",
    ECONOMIC_AGREEMENT_GRANT_TOKEN: "",
  });

  assert.equal(companies.size, 0);
});

test("resolveCompany returns the only company when none is named", () => {
  const resolved = resolveCompany({ ECONOMIC_GRANT_ACME: "token-a" });

  assert.deepEqual(resolved, { name: "acme", grantToken: "token-a" });
});

test("resolveCompany matches names case-insensitively and trims them", () => {
  const env = { ECONOMIC_GRANT_ACME: "token-a", ECONOMIC_GRANT_BETA: "token-b" };

  assert.deepEqual(resolveCompany(env, " Acme "), {
    name: "acme",
    grantToken: "token-a",
  });
});

test("resolveCompany requires a company when several are configured", () => {
  const env = { ECONOMIC_GRANT_BETA: "token-b", ECONOMIC_GRANT_ACME: "token-a" };

  assert.throws(
    () => resolveCompany(env),
    (error) =>
      error.name === "EconomicApiError" &&
      error.errorCode === "E_COMPANY_REQUIRED" &&
      error.status === 0 &&
      error.message.includes("acme, beta")
  );
});

test("resolveCompany rejects an unknown company and lists the known ones", () => {
  const env = { ECONOMIC_GRANT_ACME: "token-a" };

  assert.throws(
    () => resolveCompany(env, "nope"),
    (error) =>
      error.errorCode === "E_UNKNOWN_COMPANY" &&
      error.message.includes('"nope"') &&
      error.message.includes("acme")
  );
});

test("resolveCompany fails when no company is configured", () => {
  assert.throws(
    () => resolveCompany({}),
    (error) => error.errorCode === "E_NO_CREDENTIALS"
  );
});
