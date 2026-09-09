import { z } from "zod";

export const lineSchema = z.object({
  description: z
    .string()
    .min(1)
    .max(2000)
    .transform((s) => s.trim())
    .describe("Line description"),
  quantity: z.number().positive().describe("Quantity"),
  unitPrice: z.number().describe("Unit net price"),
  productNumber: z
    .string()
    .min(1)
    .max(50)
    .describe("Product number of an existing product. Use list_products to find one."),
  unitNumber: z.number().int().positive().optional().describe("Optional unit number"),
  discountPercentage: z
    .number()
    .min(0)
    .max(100)
    .optional()
    .describe("Optional discount percentage"),
});

/**
 * Converts a validated tool line into an e-conomic invoice line.
 *
 * Args:
 *   line (object): Parsed `lineSchema` value.
 *   index (number): Zero-based position; line numbers start at one.
 *
 * Returns:
 *   object: Invoice line payload with `product`, and `discountPercentage` and
 *   `unit` only when they were given.
 */
export const buildLine = (line, index) => {
  const payload = {
    lineNumber: index + 1,
    sortKey: index + 1,
    description: line.description,
    quantity: line.quantity,
    unitNetPrice: line.unitPrice,
    product: { productNumber: line.productNumber },
  };

  if (line.discountPercentage !== undefined) {
    payload.discountPercentage = line.discountPercentage;
  }

  if (line.unitNumber) {
    payload.unit = { unitNumber: line.unitNumber };
  }

  return payload;
};
