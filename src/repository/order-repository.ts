import type { Order } from "../domain/order";

export interface OrderRepository {
  create(order: Order): Promise<void>;
  findById(id: string): Promise<Order | undefined>;
  save(order: Order): Promise<void>;
}
