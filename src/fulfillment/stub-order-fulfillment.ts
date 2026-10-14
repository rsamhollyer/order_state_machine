import type { Order } from "../domain/order";
import type { OrderFulfillment } from "./order-fulfillment";

export interface StubFulfillmentOptions {
  behavior?: "succeed" | "fail";
  failureMessage?: string;
}

/** Configurable OrderFulfillment for tests and demos. Records the order ids it was asked to fulfill. */
export class StubOrderFulfillment implements OrderFulfillment {
  behavior: "succeed" | "fail";
  failureMessage: string;

  readonly fulfillCalls: string[] = [];

  constructor(options: StubFulfillmentOptions = {}) {
    this.behavior = options.behavior ?? "succeed";
    this.failureMessage = options.failureMessage ?? "ticket delivery failed";
  }

  async fulfill(order: Order): Promise<void> {
    this.fulfillCalls.push(order.id);

    if (this.behavior === "fail") {
      throw new Error(this.failureMessage);
    }
  }
}
