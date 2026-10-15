import { z } from "zod";

/** Request body for POST /orders. */
export const createOrderSchema = z.object({
  amountCents: z.number().int().positive(),
  currency: z
    .string()
    .regex(/^[A-Za-z]{3}$/, "currency must be a 3-letter code")
    .transform(value => value.toUpperCase()),
});

export type CreateOrderBody = z.infer<typeof createOrderSchema>;
