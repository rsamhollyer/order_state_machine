import type { AuthorizeRequest, AuthorizeResult, PaymentGateway } from "./payment-gateway";
import { PaymentGatewayError } from "./payment-gateway";

export interface StubGatewayOptions {
  authorize?: "approve" | "decline";
  declineReason?: string;
  void?: "succeed" | "fail";
}

/**
 * In-memory PaymentGateway for tests and local demos.
 * Behavior is configurable, and every call is recorded so tests can assert
 * what the service did (e.g. "void was called once, with this id").
 */
export class StubPaymentGateway implements PaymentGateway {
  authorizeBehavior: "approve" | "decline";
  voidBehavior: "succeed" | "fail";
  declineReason: string;

  readonly authorizeCalls: AuthorizeRequest[] = [];
  readonly voidCalls: string[] = [];

  private nextId = 1;

  constructor(options: StubGatewayOptions = {}) {
    this.authorizeBehavior = options.authorize ?? "approve";
    this.voidBehavior = options.void ?? "succeed";
    this.declineReason = options.declineReason ?? "card_declined";
  }

  async authorize(request: AuthorizeRequest): Promise<AuthorizeResult> {
    this.authorizeCalls.push(request);

    if (this.authorizeBehavior === "decline") {
      return { status: "declined", reason: this.declineReason };
    }
    return { status: "authorized", authorizationId: `auth_${this.nextId++}` };
  }

  async voidAuthorization(authorizationId: string): Promise<void> {
    this.voidCalls.push(authorizationId);

    if (this.voidBehavior === "fail") {
      throw new PaymentGatewayError(`Void failed for ${authorizationId}`);
    }
  }
}
