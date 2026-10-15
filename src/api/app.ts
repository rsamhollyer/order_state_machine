import type { ErrorRequestHandler, Express } from "express";
import express from "express";
import { ZodError } from "zod";
import { InvalidTransitionError, OrderNotFoundError } from "../domain/errors";
import type { OrderService } from "../services/order-service";
import { createOrderRouter } from "./routes";

export interface AppDeps {
  orderService: OrderService;
}

export function createApp(deps: AppDeps): Express {
  const app = express();

  app.use(express.json());
  app.use("/orders", createOrderRouter(deps.orderService));

  app.use((_req, res) => {
    res.status(404).json({ error: "not_found", message: "Route not found" });
  });
  app.use(errorHandler);

  return app;
}

export const errorHandler: ErrorRequestHandler = (error, _req, res, _next) => {
  if (error instanceof ZodError) {
    res.status(400).json({
      error: "validation_error",
      details: error.issues.map(issue => ({
        path: issue.path.map(String).join("."),
        message: issue.message,
      })),
    });
    return;
  }

  if (error instanceof OrderNotFoundError) {
    res.status(404).json({ error: "order_not_found", message: error.message });
    return;
  }

  if (error instanceof InvalidTransitionError) {
    res.status(409).json({
      error: "invalid_transition",
      message: error.message,
      from: error.from,
      to: error.to,
    });
    return;
  }

  const status = (error as { status?: unknown }).status;
  if (typeof status === "number" && status >= 400 && status < 500) {
    res.status(status).json({ error: "bad_request", message: "Malformed request" });
    return;
  }

  console.error("[unhandled error]", error);
  res.status(500).json({ error: "internal_error", message: "Something went wrong" });
};
