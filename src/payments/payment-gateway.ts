export interface AuthorizeRequest {
  orderId: string;
  amountCents: number;
  currency: string;
}

export type AuthorizeResult
  = | { status: "authorized"; authorizationId: string }
    | { status: "declined"; reason: string };

export class PaymentGatewayError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PaymentGatewayError";
  }
}

export interface PaymentGateway {
  authorize(request: AuthorizeRequest): Promise<AuthorizeResult>;
  voidAuthorization(authorizationId: string): Promise<void>;
}
