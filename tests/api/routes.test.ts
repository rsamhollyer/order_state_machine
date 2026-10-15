import request from "supertest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { buildTestApp } from "../helpers/build-test-app";

type TestApp = ReturnType<typeof buildTestApp>["app"];

async function createOrder(app: TestApp): Promise<string> {
  const response = await request(app)
    .post("/orders")
    .send({ amountCents: 2500, currency: "usd" })
    .expect(201);
  return response.body.id;
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("POST /orders", () => {
  it("returns 201 with an initialized order and a single history entry", async () => {
    const { app } = buildTestApp();

    const response = await request(app).post("/orders").send({ amountCents: 2500, currency: "usd" });

    expect(response.status).toBe(201);
    expect(response.body).toMatchObject({
      state: "initialized",
      amountCents: 2500,
      currency: "USD",
    });
    expect(response.body.history).toHaveLength(1);
  });

  it("returns 400 with the failing field paths when the body is invalid", async () => {
    const { app } = buildTestApp();

    const response = await request(app).post("/orders").send({ amountCents: -5, currency: "US" });

    expect(response.status).toBe(400);
    expect(response.body.error).toBe("validation_error");
    expect(response.body.details.map((detail: { path: string }) => detail.path).sort()).toEqual([
      "amountCents",
      "currency",
    ]);
  });
});

describe("GET /orders/:id", () => {
  it("returns 200 with the current state and full history", async () => {
    const { app } = buildTestApp();
    const id = await createOrder(app);
    await request(app).post(`/orders/${id}/authorize`);

    const response = await request(app).get(`/orders/${id}`);

    expect(response.status).toBe(200);
    expect(response.body.state).toBe("payment_authorized");
    expect(response.body.history.map((entry: { to: string }) => entry.to)).toEqual([
      "initialized",
      "payment_authorized",
    ]);
  });

  it("returns 404 with order_not_found when the id does not exist", async () => {
    const { app } = buildTestApp();

    const response = await request(app).get("/orders/missing");

    expect(response.status).toBe(404);
    expect(response.body.error).toBe("order_not_found");
  });
});

describe("happy path over HTTP (initialized -> payment_authorized -> complete)", () => {
  it("returns 200 at each step and ends in complete with no failure recorded", async () => {
    const { app, payments } = buildTestApp();
    const id = await createOrder(app);

    const authorized = await request(app).post(`/orders/${id}/authorize`);
    const completed = await request(app).post(`/orders/${id}/complete`);

    expect(authorized.status).toBe(200);
    expect(authorized.body.state).toBe("payment_authorized");
    expect(completed.status).toBe(200);
    expect(completed.body.state).toBe("complete");
    expect(completed.body.failure).toBeUndefined();
    expect(payments.voidCalls).toEqual([]);
  });
});

describe("payment decline over HTTP (initialized -> rejected)", () => {
  it("returns 200 with state rejected and the decline reason as a payment failure", async () => {
    const { app } = buildTestApp({
      payments: { authorize: "decline", declineReason: "insufficient_funds" },
    });
    const id = await createOrder(app);

    const response = await request(app).post(`/orders/${id}/authorize`);

    expect(response.status).toBe(200);
    expect(response.body.state).toBe("rejected");
    expect(response.body.failure).toEqual({ stage: "payment", message: "insufficient_funds" });
  });

  it("returns 409 when completing the rejected order, without calling fulfillment or void", async () => {
    const { app, payments, fulfillment } = buildTestApp({ payments: { authorize: "decline" } });
    const id = await createOrder(app);
    await request(app).post(`/orders/${id}/authorize`);

    const response = await request(app).post(`/orders/${id}/complete`);

    expect(response.status).toBe(409);
    expect(response.body).toMatchObject({
      error: "invalid_transition",
      from: "rejected",
      to: "complete",
    });
    expect(fulfillment.fulfillCalls).toEqual([]);
    expect(payments.voidCalls).toEqual([]);
  });
});

describe("completion failure with successful void over HTTP (payment_authorized -> cancelled)", () => {
  it("returns 200 with state cancelled, a completion failure, and no void error", async () => {
    const { app, payments } = buildTestApp({
      fulfillment: { behavior: "fail", failureMessage: "venue system unavailable" },
    });
    const id = await createOrder(app);
    await request(app).post(`/orders/${id}/authorize`);

    const response = await request(app).post(`/orders/${id}/complete`);

    expect(response.status).toBe(200);
    expect(response.body.state).toBe("cancelled");
    expect(response.body.failure).toEqual({
      stage: "completion",
      message: "venue system unavailable",
    });
    expect(payments.voidCalls).toEqual(["auth_1"]);
  });
});

describe("completion failure with failed void over HTTP (payment_authorized -> needs_attention)", () => {
  it("returns 200 with state needs_attention and both errors recorded", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const { app } = buildTestApp({
      payments: { void: "fail" },
      fulfillment: { behavior: "fail", failureMessage: "venue system unavailable" },
    });
    const id = await createOrder(app);
    await request(app).post(`/orders/${id}/authorize`);

    const response = await request(app).post(`/orders/${id}/complete`);

    expect(response.status).toBe(200);
    expect(response.body.state).toBe("needs_attention");
    expect(response.body.failure).toEqual({
      stage: "completion",
      message: "venue system unavailable",
      voidError: "Void failed for auth_1",
    });
  });

  it("keeps reporting needs_attention on a later GET", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const { app } = buildTestApp({ payments: { void: "fail" }, fulfillment: { behavior: "fail" } });
    const id = await createOrder(app);
    await request(app).post(`/orders/${id}/authorize`);
    await request(app).post(`/orders/${id}/complete`);

    const response = await request(app).get(`/orders/${id}`);

    expect(response.body.state).toBe("needs_attention");
    expect(response.body.failure.voidError).toBe("Void failed for auth_1");
  });

  it("returns 409 when completing the stuck order again, without a second void attempt", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const { app, payments } = buildTestApp({
      payments: { void: "fail" },
      fulfillment: { behavior: "fail" },
    });
    const id = await createOrder(app);
    await request(app).post(`/orders/${id}/authorize`);
    await request(app).post(`/orders/${id}/complete`);

    const response = await request(app).post(`/orders/${id}/complete`);

    expect(response.status).toBe(409);
    expect(payments.voidCalls).toHaveLength(1);
  });
});

describe("illegal transitions and unknown ids", () => {
  it("returns 409 with from and to when completing before payment is authorized", async () => {
    const { app } = buildTestApp();
    const id = await createOrder(app);

    const response = await request(app).post(`/orders/${id}/complete`);

    expect(response.status).toBe(409);
    expect(response.body).toMatchObject({
      error: "invalid_transition",
      from: "initialized",
      to: "complete",
    });
  });

  it("returns 409 and does not authorize a second time when the order is already authorized", async () => {
    const { app, payments } = buildTestApp();
    const id = await createOrder(app);
    await request(app).post(`/orders/${id}/authorize`);

    const response = await request(app).post(`/orders/${id}/authorize`);

    expect(response.status).toBe(409);
    expect(payments.authorizeCalls).toHaveLength(1);
  });

  it.each(["authorize", "complete"])(
    "returns 404 from POST /orders/:id/%s when the id does not exist",
    async (action) => {
      const { app } = buildTestApp();

      const response = await request(app).post(`/orders/missing/${action}`);

      expect(response.status).toBe(404);
      expect(response.body.error).toBe("order_not_found");
    },
  );
});
