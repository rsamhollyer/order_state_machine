export const OrderState = {
  Initialized: "initialized",
  PaymentAuthorized: "payment_authorized",
  Complete: "complete",
  Rejected: "rejected",
  Cancelled: "cancelled",
  NeedsAttention: "needs_attention",
} as const;

export type OrderState = (typeof OrderState)[keyof typeof OrderState];

export interface StateHistoryEntry {
  from: OrderState | null;
  to: OrderState;
  at: string;
  reason?: string;
}

export interface OrderFailure {
  stage: "payment" | "completion";
  message: string;
  voidError?: string;
}

export interface Order {
  id: string;
  state: OrderState;
  amountCents: number;
  currency: string;
  paymentAuthorizationId?: string;
  failure?: OrderFailure;
  history: StateHistoryEntry[];
  createdAt: string;
  updatedAt: string;
}
