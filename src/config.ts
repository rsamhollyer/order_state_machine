import "dotenv/config";
import { z } from "zod";

const envSchema = z.object({
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  STUB_AUTHORIZE: z.enum(["approve", "decline"]).default("approve"),
  STUB_FULFILL: z.enum(["succeed", "fail"]).default("succeed"),
  STUB_VOID: z.enum(["succeed", "fail"]).default("succeed"),
});

export const config = envSchema.parse(process.env);
