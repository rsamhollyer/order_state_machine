import { describe, expect, it } from "vitest";
import { PaymentGatewayError } from "../../src/payments/payment-gateway";
import { StubPaymentGateway } from "../../src/payments/stub-payment-gateway";

const request = { orderId: "order-1", amountCents: 2500, currency: "USD" };

describe("StubPaymentGateway.authorize", () => {
  it("returns an authorized result with an authorization id by default", async () => {
    const gateway = new StubPaymentGateway();

    const result = await gateway.authorize(request);

    expect(result).toEqual({ status: "authorized", authorizationId: "auth_1" });
  });

  it("returns a different authorization id on each approved call", async () => {
    const gateway = new StubPaymentGateway();

    const first = await gateway.authorize(request);
    const second = await gateway.authorize(request);

    expect(first).not.toEqual(second);
  });

  it("returns a declined result with the configured reason when set to decline", async () => {
    const gateway = new StubPaymentGateway({
      authorize: "decline",
      declineReason: "insufficient_funds",
    });

    const result = await gateway.authorize(request);

    expect(result).toEqual({ status: "declined", reason: "insufficient_funds" });
  });

  it("records every authorize request it receives", async () => {
    const gateway = new StubPaymentGateway();

    await gateway.authorize(request);

    expect(gateway.authorizeCalls).toEqual([request]);
  });
});

describe("StubPaymentGateway.voidAuthorization", () => {
  it("resolves and records the authorization id by default", async () => {
    const gateway = new StubPaymentGateway();

    await expect(gateway.voidAuthorization("auth_1")).resolves.toBeUndefined();

    expect(gateway.voidCalls).toEqual(["auth_1"]);
  });

  it("rejects with PaymentGatewayError when set to fail", async () => {
    const gateway = new StubPaymentGateway({ void: "fail" });

    await expect(gateway.voidAuthorization("auth_1")).rejects.toThrow(PaymentGatewayError);
  });

  it("still records the void attempt when the void fails", async () => {
    const gateway = new StubPaymentGateway({ void: "fail" });

    await gateway.voidAuthorization("auth_1").catch(() => undefined);

    expect(gateway.voidCalls).toEqual(["auth_1"]);
  });
});
