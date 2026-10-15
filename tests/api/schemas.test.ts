import { describe, expect, it } from "vitest";
import { createOrderSchema } from "../../src/api/schemas";

describe("createOrderSchema", () => {
  it("accepts a valid body and uppercases the currency", () => {
    const result = createOrderSchema.parse({ amountCents: 2500, currency: "usd" });

    expect(result).toEqual({ amountCents: 2500, currency: "USD" });
  });

  it.each([
    ["amountCents is missing", { currency: "USD" }],
    ["amountCents is zero", { amountCents: 0, currency: "USD" }],
    ["amountCents is negative", { amountCents: -100, currency: "USD" }],
    ["amountCents is a decimal", { amountCents: 25.5, currency: "USD" }],
    ["amountCents is a string", { amountCents: "2500", currency: "USD" }],
    ["currency is missing", { amountCents: 2500 }],
    ["currency has two letters", { amountCents: 2500, currency: "US" }],
    ["currency has four letters", { amountCents: 2500, currency: "USDX" }],
    ["currency contains digits", { amountCents: 2500, currency: "U5D" }],
  ])("rejects the body when %s", (_description, body) => {
    expect(createOrderSchema.safeParse(body).success).toBe(false);
  });
});
