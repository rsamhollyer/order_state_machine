import type { Order } from "../domain/order";
import type { OrderRepository } from "./order-repository";

export class InMemoryOrderRepository implements OrderRepository {
  private readonly orders = new Map<string, Order>();

  async create(order: Order): Promise<void> {
    if (this.orders.has(order.id)) {
      throw new Error(`Order already exists: ${order.id}`);
    }
    this.orders.set(order.id, structuredClone(order));
  }

  async findById(id: string): Promise<Order | undefined> {
    const order = this.orders.get(id);
    return order ? structuredClone(order) : undefined;
  }

  async save(order: Order): Promise<void> {
    if (!this.orders.has(order.id)) {
      throw new Error(`Cannot save unknown order: ${order.id}`);
    }
    this.orders.set(order.id, structuredClone(order));
  }
}
