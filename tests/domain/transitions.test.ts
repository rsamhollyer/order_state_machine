import { describe, expect, it } from "vitest";
import { InvalidTransitionError } from "../../src/domain/errors";
import { OrderState } from "../../src/domain/order";
import {
  ALLOWED_TRANSITIONS,
  assertTransition,
  canTransition,
  isTerminal,
} from "../../src/domain/transitions";

const allStates = Object.values(OrderState);

const terminalStates: OrderState[] = [
  OrderState.Complete,
  OrderState.Rejected,
  OrderState.Cancelled,
  OrderState.NeedsAttention,
];

const legalMoves: [OrderState, OrderState, string][] = [
  [OrderState.Initialized, OrderState.PaymentAuthorized, "payment authorized"],
  [OrderState.Initialized, OrderState.Rejected, "payment declined"],
  [OrderState.PaymentAuthorized, OrderState.Complete, "completion succeeded"],
  [OrderState.PaymentAuthorized, OrderState.Cancelled, "completion failed, void succeeded"],
  [OrderState.PaymentAuthorized, OrderState.NeedsAttention, "completion failed, void failed"],
];

const illegalMoves: [OrderState, OrderState, string][] = [
  [OrderState.Initialized, OrderState.Complete, "skips payment"],
  [OrderState.Initialized, OrderState.Cancelled, "a decline is a rejection, nothing was held"],
  [OrderState.Initialized, OrderState.NeedsAttention, "nothing was authorized to get stuck"],
  [OrderState.PaymentAuthorized, OrderState.Initialized, "moves backwards"],
  [OrderState.PaymentAuthorized, OrderState.Rejected, "declines only happen before authorization"],
];

describe("canTransition", () => {
  it.each(legalMoves)(
    "returns true for %s -> %s (%s)",
    (from, to) => {
      expect(canTransition(from, to)).toBe(true);
    },
  );

  it.each(illegalMoves)(
    "returns false for %s -> %s (%s)",
    (from, to) => {
      expect(canTransition(from, to)).toBe(false);
    },
  );

  it.each(terminalStates)(
    "returns false from terminal state %s to every other state",
    (from) => {
      for (const to of allStates) {
        expect(canTransition(from, to)).toBe(false);
      }
    },
  );
});

describe("assertTransition", () => {
  it("does not throw when the transition is legal", () => {
    expect(() =>
      assertTransition(OrderState.Initialized, OrderState.PaymentAuthorized),
    ).not.toThrow();
  });

  it("throws InvalidTransitionError when the transition is illegal", () => {
    expect(() =>
      assertTransition(OrderState.Complete, OrderState.Initialized),
    ).toThrow(InvalidTransitionError);
  });

  it("includes the attempted from and to states on the thrown error", () => {
    const error = captureError(() =>
      assertTransition(OrderState.Complete, OrderState.Initialized),
    );

    expect(error).toBeInstanceOf(InvalidTransitionError);
    expect(error).toMatchObject({ from: "complete", to: "initialized" });
  });
});

describe("isTerminal", () => {
  it.each(terminalStates)("returns true for %s", (state) => {
    expect(isTerminal(state)).toBe(true);
  });

  it.each([OrderState.Initialized, OrderState.PaymentAuthorized])(
    "returns false for non-terminal state %s",
    (state) => {
      expect(isTerminal(state)).toBe(false);
    },
  );
});

describe("ALLOWED_TRANSITIONS", () => {
  it("defines an entry for every OrderState", () => {
    for (const state of allStates) {
      expect(ALLOWED_TRANSITIONS[state]).toBeDefined();
    }
  });
});

function captureError(fn: () => void): unknown {
  try {
    fn();
  }
  catch (error) {
    return error;
  }
  return undefined;
}
