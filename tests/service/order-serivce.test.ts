import { afterEach, describe, expect, it, vi } from "vitest";
import { InvalidTransitionError, OrderNotFoundError } from "../../src/domain/errors";
import { OrderState } from "../../src/domain/order";
import type { StubFulfillmentOptions } from "../../src/fulfillment/stub-order-fulfillment";
import { StubOrderFulfillment } from "../../src/fulfillment/stub-order-fulfillment";
import type { PaymentGateway } from "../../src/payments/payment-gateway";
import { PaymentGatewayError } from "../../src/payments/payment-gateway";
import type { StubGatewayOptions } from "../../src/payments/stub-payment-gateway";
import { StubPaymentGateway } from "../../src/payments/stub-payment-gateway";
import { InMemoryOrderRepository } from "../../src/repository/in-memory-order-repository";
import { OrderService } from "../../src/services/order-service";

interface SetupOptions {
  payments?: StubGatewayOptions;
  fulfillment?: StubFulfillmentOptions;
  gateway?: PaymentGateway; // overrides the stub gateway entirely
}

function setup(options: SetupOptions = {}) {
  const repository = new InMemoryOrderRepository();
  const payments = new StubPaymentGateway(options.payments);
  const fulfillment = new StubOrderFulfillment(options.fulfillment);

  let tick = 0;
  const service = new OrderService({
    repository,
    payments: options.gateway ?? payments,
    fulfillment,
    // Each clock read is one second later, so history timestamps are distinct and ordered.
    now: () => new Date(Date.UTC(2026, 9, 13, 14, 0, tick++)),
    generateId: () => "order-1",
  });

  return { service, repository, payments, fulfillment };
}

const input = { amountCents: 2500, currency: "USD" };

afterEach(() => {
  vi.restoreAllMocks();
});

describe("OrderService happy path (initialized -> payment_authorized -> complete)", () => {
  it("creates an order in the initialized state with a single history entry", async () => {
    const { service } = setup();

    const order = await service.createOrder(input);

    expect(order.state).toBe(OrderState.Initialized);
    expect(order.history).toHaveLength(1);
    expect(order.history[0]).toMatchObject({ from: null, to: OrderState.Initialized });
  });

  it("moves to payment_authorized and stores the authorization id when payment is approved", async () => {
    const { service } = setup();
    const created = await service.createOrder(input);

    const order = await service.authorizePayment(created.id);

    expect(order.state).toBe(OrderState.PaymentAuthorized);
    expect(order.paymentAuthorizationId).toBe("auth_1");
  });

  it("moves to complete with no failure recorded and no void attempted when fulfillment succeeds", async () => {
    const { service, payments, fulfillment } = setup();
    const created = await service.createOrder(input);
    await service.authorizePayment(created.id);

    const order = await service.completeOrder(created.id);

    expect(order.state).toBe(OrderState.Complete);
    expect(order.failure).toBeUndefined();
    expect(fulfillment.fulfillCalls).toEqual(["order-1"]);
    expect(payments.voidCalls).toEqual([]);
  });

  it("records every transition in history, in order, with strictly increasing timestamps", async () => {
    const { service } = setup();
    const created = await service.createOrder(input);
    await service.authorizePayment(created.id);
    await service.completeOrder(created.id);

    const { history } = await service.getOrder(created.id);

    expect(history.map(entry => entry.to)).toEqual([
      OrderState.Initialized,
      OrderState.PaymentAuthorized,
      OrderState.Complete,
    ]);
    expect(history.map(entry => entry.from)).toEqual([
      null,
      OrderState.Initialized,
      OrderState.PaymentAuthorized,
    ]);
    const times = history.map(entry => entry.at);
    expect(times).toEqual([...times].sort());
    expect(new Set(times).size).toBe(times.length);
  });

  it("persists the final state so getOrder returns it", async () => {
    const { service } = setup();
    const created = await service.createOrder(input);
    await service.authorizePayment(created.id);
    await service.completeOrder(created.id);

    const found = await service.getOrder(created.id);

    expect(found.state).toBe(OrderState.Complete);
  });
});

describe("OrderService payment decline (initialized -> rejected)", () => {
  it("moves to rejected and records the decline reason as a payment failure", async () => {
    const { service } = setup({ payments: { authorize: "decline", declineReason: "insufficient_funds" } });
    const created = await service.createOrder(input);

    const order = await service.authorizePayment(created.id);

    expect(order.state).toBe(OrderState.Rejected);
    expect(order.failure).toEqual({ stage: "payment", message: "insufficient_funds" });
  });

  it("does not store an authorization id, call void, or attempt fulfillment", async () => {
    const { service, payments, fulfillment } = setup({ payments: { authorize: "decline" } });
    const created = await service.createOrder(input);

    const order = await service.authorizePayment(created.id);

    expect(order.paymentAuthorizationId).toBeUndefined();
    expect(payments.voidCalls).toEqual([]);
    expect(fulfillment.fulfillCalls).toEqual([]);
  });

  it("explains the decline in the final history entry", async () => {
    const { service } = setup({ payments: { authorize: "decline", declineReason: "card_expired" } });
    const created = await service.createOrder(input);

    const order = await service.authorizePayment(created.id);

    expect(order.history.at(-1)).toMatchObject({
      from: OrderState.Initialized,
      to: OrderState.Rejected,
      reason: "payment failed: card_expired",
    });
  });

  it("moves to rejected when the gateway itself throws during authorize", async () => {
    const brokenGateway: PaymentGateway = {
      authorize: async () => {
        throw new PaymentGatewayError("connection timed out");
      },
      voidAuthorization: async () => undefined,
    };
    const { service } = setup({ gateway: brokenGateway });
    const created = await service.createOrder(input);

    const order = await service.authorizePayment(created.id);

    expect(order.state).toBe(OrderState.Rejected);
    expect(order.failure).toEqual({ stage: "payment", message: "gateway error: connection timed out" });
  });
});

describe("OrderService completion failure with successful void (payment_authorized -> cancelled)", () => {
  it("voids the exact authorization that was placed", async () => {
    const { service, payments } = setup({ fulfillment: { behavior: "fail" } });
    const created = await service.createOrder(input);
    await service.authorizePayment(created.id);

    await service.completeOrder(created.id);

    expect(payments.voidCalls).toEqual(["auth_1"]);
  });

  it("moves to cancelled and records the completion error without a void error", async () => {
    const { service } = setup({ fulfillment: { behavior: "fail", failureMessage: "venue system unavailable" } });
    const created = await service.createOrder(input);
    await service.authorizePayment(created.id);

    const order = await service.completeOrder(created.id);

    expect(order.state).toBe(OrderState.Cancelled);
    expect(order.failure).toEqual({ stage: "completion", message: "venue system unavailable" });
  });

  it("records the full path (initialized, payment_authorized, cancelled) in history", async () => {
    const { service } = setup({ fulfillment: { behavior: "fail" } });
    const created = await service.createOrder(input);
    await service.authorizePayment(created.id);

    const order = await service.completeOrder(created.id);

    expect(order.history.map(entry => entry.to)).toEqual([
      OrderState.Initialized,
      OrderState.PaymentAuthorized,
      OrderState.Cancelled,
    ]);
    expect(order.history.at(-1)?.reason).toBe("completion failed: ticket delivery failed; payment voided");
  });
});

describe("OrderService completion failure with failed void (payment_authorized -> needs_attention)", () => {
  it("moves to needs_attention, not cancelled, when the void also fails", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const { service } = setup({ payments: { void: "fail" }, fulfillment: { behavior: "fail" } });
    const created = await service.createOrder(input);
    await service.authorizePayment(created.id);

    const order = await service.completeOrder(created.id);

    expect(order.state).toBe(OrderState.NeedsAttention);
  });

  it("records both the completion error and the void error on the order", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const { service } = setup({
      payments: { void: "fail" },
      fulfillment: { behavior: "fail", failureMessage: "venue system unavailable" },
    });
    const created = await service.createOrder(input);
    await service.authorizePayment(created.id);

    const order = await service.completeOrder(created.id);

    expect(order.failure).toEqual({
      stage: "completion",
      message: "venue system unavailable",
      voidError: "Void failed for auth_1",
    });
  });

  it("attempts the void exactly once and describes both failures in the history reason", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const { service, payments } = setup({ payments: { void: "fail" }, fulfillment: { behavior: "fail" } });
    const created = await service.createOrder(input);
    await service.authorizePayment(created.id);

    const order = await service.completeOrder(created.id);

    expect(payments.voidCalls).toEqual(["auth_1"]);
    expect(order.history.at(-1)?.reason).toBe(
      "completion failed: ticket delivery failed; void failed: Void failed for auth_1",
    );
  });

  it("logs an error naming the order so the failure is not silent", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const { service } = setup({ payments: { void: "fail" }, fulfillment: { behavior: "fail" } });
    const created = await service.createOrder(input);
    await service.authorizePayment(created.id);

    await service.completeOrder(created.id);

    expect(errorSpy).toHaveBeenCalledOnce();
    expect(errorSpy.mock.calls[0]?.[0]).toContain("order-1");
  });

  it("persists needs_attention so a later getOrder still shows it", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const { service } = setup({ payments: { void: "fail" }, fulfillment: { behavior: "fail" } });
    const created = await service.createOrder(input);
    await service.authorizePayment(created.id);
    await service.completeOrder(created.id);

    const found = await service.getOrder(created.id);

    expect(found.state).toBe(OrderState.NeedsAttention);
    expect(found.failure?.voidError).toBe("Void failed for auth_1");
  });
});

describe("OrderService invalid calls", () => {
  it("throws InvalidTransitionError and does not fulfill when completing before payment is authorized", async () => {
    const { service, fulfillment } = setup();
    const created = await service.createOrder(input);

    await expect(service.completeOrder(created.id)).rejects.toThrow(InvalidTransitionError);

    expect(fulfillment.fulfillCalls).toEqual([]);
  });

  it("throws InvalidTransitionError and does not charge twice when authorizing an already authorized order", async () => {
    const { service, payments } = setup();
    const created = await service.createOrder(input);
    await service.authorizePayment(created.id);

    await expect(service.authorizePayment(created.id)).rejects.toThrow(InvalidTransitionError);

    expect(payments.authorizeCalls).toHaveLength(1);
  });

  it("throws InvalidTransitionError and does not fulfill again when completing an already complete order", async () => {
    const { service, fulfillment } = setup();
    const created = await service.createOrder(input);
    await service.authorizePayment(created.id);
    await service.completeOrder(created.id);

    await expect(service.completeOrder(created.id)).rejects.toThrow(InvalidTransitionError);

    expect(fulfillment.fulfillCalls).toHaveLength(1);
  });

  it("throws InvalidTransitionError when authorizing a rejected order", async () => {
    const { service } = setup({ payments: { authorize: "decline" } });
    const created = await service.createOrder(input);
    await service.authorizePayment(created.id);

    await expect(service.authorizePayment(created.id)).rejects.toThrow(InvalidTransitionError);
  });

  it.each(["getOrder", "authorizePayment", "completeOrder"] as const)(
    "throws OrderNotFoundError from %s when the id does not exist",
    async (method) => {
      const { service } = setup();

      await expect(service[method]("missing")).rejects.toThrow(OrderNotFoundError);
    },
  );
});
