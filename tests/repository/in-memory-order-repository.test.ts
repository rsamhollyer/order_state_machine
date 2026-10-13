import { beforeEach, describe, expect, it } from "vitest";
import type { Order } from "../../src/domain/order";
import { OrderState } from "../../src/domain/order";
import { InMemoryOrderRepository } from "../../src/repository/in-memory-order-repository";

function buildOrder(overrides: Partial<Order> = {}): Order {
  const now = "2026-10-13T14:00:00.000Z";
  return {
    id: "order-1",
    state: OrderState.Initialized,
    amountCents: 2500,
    currency: "USD",
    history: [{ from: null, to: OrderState.Initialized, at: now }],
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

describe("InMemoryOrderRepository.findById", () => {
  let repository: InMemoryOrderRepository;

  beforeEach(() => {
    repository = new InMemoryOrderRepository();
  });

  it("returns the stored order when the id exists", async () => {
    await repository.create(buildOrder());

    const found = await repository.findById("order-1");

    expect(found).toEqual(buildOrder());
  });

  it("returns undefined when the id does not exist", async () => {
    const found = await repository.findById("missing");

    expect(found).toBeUndefined();
  });

  it("returns a copy, so mutating the result does not change the stored order", async () => {
    await repository.create(buildOrder());

    const found = await repository.findById("order-1");
    found!.state = OrderState.Complete;

    const foundAgain = await repository.findById("order-1");
    expect(foundAgain?.state).toBe(OrderState.Initialized);
  });
});

describe("InMemoryOrderRepository.create", () => {
  it("throws when an order with the same id already exists", async () => {
    const repository = new InMemoryOrderRepository();
    await repository.create(buildOrder());

    await expect(repository.create(buildOrder())).rejects.toThrow("Order already exists: order-1");
  });

  it("stores a copy, so mutating the original afterwards does not change the stored order", async () => {
    const repository = new InMemoryOrderRepository();
    const order = buildOrder();
    await repository.create(order);

    order.state = OrderState.Complete;

    const found = await repository.findById("order-1");
    expect(found?.state).toBe(OrderState.Initialized);
  });
});

describe("InMemoryOrderRepository.save", () => {
  it("replaces the stored order with the updated one", async () => {
    const repository = new InMemoryOrderRepository();
    await repository.create(buildOrder());

    await repository.save(buildOrder({ state: OrderState.PaymentAuthorized }));

    const found = await repository.findById("order-1");
    expect(found?.state).toBe(OrderState.PaymentAuthorized);
  });

  it("throws when the order was never created", async () => {
    const repository = new InMemoryOrderRepository();

    await expect(repository.save(buildOrder())).rejects.toThrow("Cannot save unknown order: order-1");
  });
});
