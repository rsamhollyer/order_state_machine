import type { OrderState } from "./order";

export class InvalidTransitionError extends Error {
  readonly from: OrderState;
  readonly to: OrderState;

  constructor(from: OrderState, to: OrderState) {
    super(`Invalid transition: ${from} -> ${to}`);
    this.name = "InvalidTransitionError";
    this.from = from;
    this.to = to;
  }
}

export class OrderNotFoundError extends Error {
  readonly orderId: string;

  constructor(orderId: string) {
    super(`Order not found: ${orderId}`);
    this.name = "OrderNotFoundError";
    this.orderId = orderId;
  }
}
