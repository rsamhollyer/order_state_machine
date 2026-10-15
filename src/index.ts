import { createApp } from "./api/app";
import { config } from "./config";
import { StubOrderFulfillment } from "./fulfillment/stub-order-fulfillment";
import { StubPaymentGateway } from "./payments/stub-payment-gateway";
import { InMemoryOrderRepository } from "./repository/in-memory-order-repository";
import { OrderService } from "./services/order-service";

const orderService = new OrderService({
  repository: new InMemoryOrderRepository(),
  payments: new StubPaymentGateway({
    authorize: config.STUB_AUTHORIZE,
    void: config.STUB_VOID,
  }),
  fulfillment: new StubOrderFulfillment({ behavior: config.STUB_FULFILL }),
});

const app = createApp({ orderService });

app.listen(config.PORT, () => {
  console.log(`Listening on http://localhost:${config.PORT}`);
  console.log(
    `Stubs: authorize=${config.STUB_AUTHORIZE} fulfill=${config.STUB_FULFILL} void=${config.STUB_VOID}`,
  );
});
