import { InvalidTransitionError } from "./errors";
import { OrderState } from "./order";

export const ALLOWED_TRANSITIONS: Record<OrderState, readonly OrderState[]> = {
  [OrderState.Initialized]: [OrderState.PaymentAuthorized, OrderState.Rejected],
  [OrderState.PaymentAuthorized]: [
    OrderState.Complete,
    OrderState.Cancelled,
    OrderState.NeedsAttention,
  ],
  [OrderState.Complete]: [],
  [OrderState.Rejected]: [],
  [OrderState.Cancelled]: [],
  [OrderState.NeedsAttention]: [],
};

export function canTransition(from: OrderState, to: OrderState) {
  return ALLOWED_TRANSITIONS[from].includes(to);
};

export function assertTransition(from: OrderState, to: OrderState) {
  if (!canTransition(from, to)) {
    throw new InvalidTransitionError(from, to);
  }
}

export function isTerminal(state: OrderState) {
  return ALLOWED_TRANSITIONS[state].length === 0;
}
