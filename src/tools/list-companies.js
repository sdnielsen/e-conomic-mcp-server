import { z } from "zod";
import { loadCompanies } from "../economic/companies.js";
import { EconomicApiError, request } from "../economic/api-client.js";
import { errorToContent, jsonContent } from "./tool-helpers.js";

/**
 * Describes one configured company by asking the API who the token belongs to.
 *
 * Args:
 *   company (string): Company key.
 *
 * Returns:
 *   object: `{ company, agreementNumber, companyName,
 *   companyIdentificationNumber }`, or `{ company, error, errorCode, status }`
 *   when the API rejects the call.
 *
 * Raises:
 *   Error: Anything that is not an `EconomicApiError`.
 */
const describeCompany = async (company) => {
  try {
    const self = await request("GET", "/self", undefined, { company });
    return {
      company,
      agreementNumber: self?.agreementNumber,
      companyName: self?.company?.name,
      companyIdentificationNumber: self?.company?.companyIdentificationNumber,
    };
  } catch (error) {
    if (!(error instanceof EconomicApiError)) {
      throw error;
    }
    // Reuse the standard error path so the failure is logged the same way.
    const logged = errorToContent(error);
    const body = JSON.parse(logged.content[0].text);
    return {
      company,
      error: body.error,
      errorCode: body.errorCode,
      status: body.status,
    };
  }
};

export const registerListCompaniesTool = (server) => {
  server.registerTool(
    "list_companies",
    {
      title: "List companies",
      description:
        "List the e-conomic companies this server is configured for, with their agreement numbers. Call this first; when more than one company is listed, every other tool needs the company argument.",
      inputSchema: z.object({}),
    },
    async () => {
      const companies = [...loadCompanies(process.env).keys()].sort();

      if (companies.length === 0) {
        return errorToContent(
          new EconomicApiError(
            "No company configured. Set ECONOMIC_GRANT_<NAME> for each company (or ECONOMIC_AGREEMENT_GRANT_TOKEN for a single company).",
            { status: 0, errorCode: "E_NO_CREDENTIALS" }
          )
        );
      }

      const results = [];
      for (const company of companies) {
        results.push(await describeCompany(company));
      }

      const allFailed = results.every((entry) => entry.error !== undefined);
      return { ...jsonContent(results), ...(allFailed ? { isError: true } : {}) };
    }
  );
};
