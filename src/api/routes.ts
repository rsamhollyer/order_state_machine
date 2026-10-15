import { Router } from "express";
import type { OrderService } from "../services/order-service";
import { createOrderSchema } from "./schemas";

export function createOrderRouter(service: OrderService): Router {
  const router = Router();

  router.post("/", async (req, res) => {
    const input = createOrderSchema.parse(req.body);
    const order = await service.createOrder(input);
    res.status(201).json(order);
  });

  router.get("/:id", async (req, res) => {
    res.json(await service.getOrder(req.params.id));
  });

  router.post("/:id/authorize", async (req, res) => {
    res.json(await service.authorizePayment(req.params.id));
  });

  router.post("/:id/complete", async (req, res) => {
    res.json(await service.completeOrder(req.params.id));
  });

  return router;
}
