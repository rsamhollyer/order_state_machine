import { createApp } from "../../src/api/app";
import type { StubFulfillmentOptions } from "../../src/fulfillment/stub-order-fulfillment";
import { StubOrderFulfillment } from "../../src/fulfillment/stub-order-fulfillment";
import type { StubGatewayOptions } from "../../src/payments/stub-payment-gateway";
import { StubPaymentGateway } from "../../src/payments/stub-payment-gateway";
import { InMemoryOrderRepository } from "../../src/repository/in-memory-order-repository";
import type { OrderRepository } from "../../src/repository/order-repository";
import { OrderService } from "../../src/services/order-service";

interface TestAppOptions {
  payments?: StubGatewayOptions;
  fulfillment?: StubFulfillmentOptions;
  repository?: OrderRepository;
}

export function buildTestApp(options: TestAppOptions = {}) {
  const payments = new StubPaymentGateway(options.payments);
  const fulfillment = new StubOrderFulfillment(options.fulfillment);
  const orderService = new OrderService({
    repository: options.repository ?? new InMemoryOrderRepository(),
    payments,
    fulfillment,
  });

  return { app: createApp({ orderService }), payments, fulfillment };
}
