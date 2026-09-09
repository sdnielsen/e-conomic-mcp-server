import { z } from "zod";
import {
  EconomicApiError,
  request,
  resolveCompanyName,
} from "../economic/api-client.js";
import { companySchema, errorToContent, jsonContent } from "./tool-helpers.js";

const productSchema = z.object({
  company: companySchema,
  productNumber: z
    .string()
    .min(1)
    .max(50)
    .transform((s) => s.trim())
    .describe("Product number"),
  name: z
    .string()
    .min(1)
    .max(250)
    .transform((s) => s.trim())
    .describe("Product name"),
  salesPrice: z.number().nonnegative().optional().describe("Sales price"),
  costPrice: z.number().nonnegative().optional().describe("Cost price"),
  barCode: z.string().max(100).optional().describe("Barcode"),
  unitNumber: z.number().int().positive().optional().describe("Unit number"),
  productGroupNumber: z
    .number()
    .int()
    .positive()
    .optional()
    .describe("Product group number (required when creating)"),
  departmentNumber: z
    .number()
    .int()
    .positive()
    .optional()
    .describe("Department number"),
});

const buildProductPayload = (input) => {
  const payload = {
    productNumber: input.productNumber,
    name: input.name,
  };

  if (input.salesPrice !== undefined) {
    payload.salesPrice = input.salesPrice;
  }

  if (input.costPrice !== undefined) {
    payload.costPrice = input.costPrice;
  }

  if (input.barCode) {
    payload.barCode = input.barCode;
  }

  if (input.unitNumber) {
    payload.unit = { unitNumber: input.unitNumber };
  }

  if (input.productGroupNumber) {
    payload.productGroup = { productGroupNumber: input.productGroupNumber };
  }

  if (input.departmentNumber) {
    payload.departmentalDistribution = {
      departmentNumber: input.departmentNumber,
    };
  }

  return payload;
};

export const registerUpsertProductTool = (server) => {
  server.registerTool(
    "upsert_product",
    {
      title: "Upsert product",
      description: "Create or update a product by productNumber.",
      inputSchema: productSchema,
    },
    async (input) => {
      try {
        let exists = false;
        try {
          await request("GET", `/products/${input.productNumber}`, undefined, {
            company: input.company,
          });
          exists = true;
        } catch (error) {
          if (!(error instanceof EconomicApiError) || error.status !== 404) {
            throw error;
          }
        }

        const payload = buildProductPayload(input);

        if (!exists && !payload.productGroup) {
          throw new EconomicApiError(
            "productGroupNumber is required when creating a new product.",
            { status: 400, errorCode: "E_PRODUCT_GROUP_REQUIRED" }
          );
        }

        const data = exists
          ? await request("PUT", `/products/${input.productNumber}`, payload, {
              company: input.company,
            })
          : await request("POST", "/products", payload, {
              company: input.company,
            });

        return jsonContent({
          company: resolveCompanyName(input.company),
          product: data,
        });
      } catch (error) {
        return errorToContent(error);
      }
    }
  );
};
