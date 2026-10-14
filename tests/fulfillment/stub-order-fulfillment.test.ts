import { describe, expect, it } from "vitest";
import type { Order } from "../../src/domain/order";
import { OrderState } from "../../src/domain/order";
import { StubOrderFulfillment } from "../../src/fulfillment/stub-order-fulfillment";

const order: Order = {
  id: "order-1",
  state: OrderState.PaymentAuthorized,
  amountCents: 2500,
  currency: "USD",
  history: [],
  createdAt: "2026-10-13T14:00:00.000Z",
  updatedAt: "2026-10-13T14:00:00.000Z",
};

describe("StubOrderFulfillment.fulfill", () => {
  it("resolves and records the order id by default", async () => {
    const fulfillment = new StubOrderFulfillment();

    await expect(fulfillment.fulfill(order)).resolves.toBeUndefined();

    expect(fulfillment.fulfillCalls).toEqual(["order-1"]);
  });

  it("rejects with the configured failure message when set to fail", async () => {
    const fulfillment = new StubOrderFulfillment({
      behavior: "fail",
      failureMessage: "venue system unavailable",
    });

    await expect(fulfillment.fulfill(order)).rejects.toThrow("venue system unavailable");
  });
});
