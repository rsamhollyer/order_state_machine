import type { Order } from "../domain/order";

export interface OrderFulfillment {
  /**
   * Delivers the tickets for an order. Rejects if delivery fails.
   * Any rejection is treated as a completion failure by the service.
   */
  fulfill(order: Order): Promise<void>;
}
