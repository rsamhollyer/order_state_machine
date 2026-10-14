import { randomUUID } from "node:crypto";
import { OrderNotFoundError } from "../domain/errors";
import type { Order } from "../domain/order";
import { OrderState } from "../domain/order";
import { assertTransition } from "../domain/transitions";
import type { OrderFulfillment } from "../fulfillment/order-fulfillment";
import type { AuthorizeResult, PaymentGateway } from "../payments/payment-gateway";
import type { OrderRepository } from "../repository/order-repository";

export interface OrderServiceDeps {
  repository: OrderRepository;
  payments: PaymentGateway;
  fulfillment: OrderFulfillment;
  now?: () => Date;
  generateId?: () => string;
}

export interface CreateOrderInput {
  amountCents: number;
  currency: string;
}

export class OrderService {
  private readonly repository: OrderRepository;
  private readonly payments: PaymentGateway;
  private readonly fulfillment: OrderFulfillment;
  private readonly now: () => Date;
  private readonly generateId: () => string;

  constructor(deps: OrderServiceDeps) {
    this.repository = deps.repository;
    this.payments = deps.payments;
    this.fulfillment = deps.fulfillment;
    this.now = deps.now ?? (() => new Date());
    this.generateId = deps.generateId ?? randomUUID;
  }

  async createOrder(input: CreateOrderInput): Promise<Order> {
    const at = this.now().toISOString();
    const order: Order = {
      id: this.generateId(),
      state: OrderState.Initialized,
      amountCents: input.amountCents,
      currency: input.currency,
      history: [{ from: null, to: OrderState.Initialized, at, reason: "order created" }],
      createdAt: at,
      updatedAt: at,
    };

    await this.repository.create(order);
    return order;
  }

  async getOrder(id: string): Promise<Order> {
    const order = await this.repository.findById(id);
    if (!order) {
      throw new OrderNotFoundError(id);
    }
    return order;
  }

  /**
   * Initialized -> PaymentAuthorized, or Initialized -> Rejected if the payment fails.
   * A decline is a normal outcome, so it returns the rejected order instead of throwing.
   */
  async authorizePayment(id: string): Promise<Order> {
    const order = await this.getOrder(id);
    // Check BEFORE touching the gateway, so an illegal call has no side effects.
    assertTransition(order.state, OrderState.PaymentAuthorized);

    let result: AuthorizeResult;
    try {
      result = await this.payments.authorize({
        orderId: order.id,
        amountCents: order.amountCents,
        currency: order.currency,
      });
    }
    catch (error) {
      // The gateway itself failed (not a card decline). We fail closed and reject.
      result = { status: "declined", reason: `gateway error: ${errorMessage(error)}` };
    }

    if (result.status === "declined") {
      order.failure = { stage: "payment", message: result.reason };
      this.applyTransition(order, OrderState.Rejected, `payment failed: ${result.reason}`);
    }
    else {
      order.paymentAuthorizationId = result.authorizationId;
      this.applyTransition(order, OrderState.PaymentAuthorized, "payment authorized");
    }

    await this.repository.save(order);
    return order;
  }

  /**
   * PaymentAuthorized -> Complete on success. If fulfillment fails, void the
   * payment and end in Cancelled, or NeedsAttention if the void fails too.
   */
  async completeOrder(id: string): Promise<Order> {
    const order = await this.getOrder(id);
    assertTransition(order.state, OrderState.Complete);

    try {
      await this.fulfillment.fulfill(order);
    }
    catch (error) {
      await this.recoverFromCompletionFailure(order, errorMessage(error));
      await this.repository.save(order);
      return order;
    }

    this.applyTransition(order, OrderState.Complete, "tickets delivered");
    await this.repository.save(order);
    return order;
  }

  private async recoverFromCompletionFailure(order: Order, completionError: string): Promise<void> {
    const authorizationId = order.paymentAuthorizationId;
    if (!authorizationId) {
      // Can't happen if the state machine is respected: PaymentAuthorized always has an id.
      throw new Error(`Order ${order.id} is payment_authorized but has no authorization id`);
    }

    try {
      await this.payments.voidAuthorization(authorizationId);
    }
    catch (voidError) {
      const voidMessage = errorMessage(voidError);
      order.failure = { stage: "completion", message: completionError, voidError: voidMessage };
      this.applyTransition(
        order,
        OrderState.NeedsAttention,
        `completion failed: ${completionError}; void failed: ${voidMessage}`,
      );
      // Loud on purpose: this order may have a live hold on a customer's card.
      console.error(`[needs_attention] order ${order.id}: completion failed and void failed`, {
        authorizationId,
        completionError,
        voidError: voidMessage,
      });
      return;
    }

    order.failure = { stage: "completion", message: completionError };
    this.applyTransition(
      order,
      OrderState.Cancelled,
      `completion failed: ${completionError}; payment voided`,
    );
  }

  /** Validates the move, appends a history entry, and updates the order in place. */
  private applyTransition(order: Order, to: OrderState, reason: string): void {
    assertTransition(order.state, to);
    const at = this.now().toISOString();
    order.history.push({ from: order.state, to, at, reason });
    order.state = to;
    order.updatedAt = at;
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
