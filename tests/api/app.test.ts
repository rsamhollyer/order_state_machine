import request from "supertest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { InMemoryOrderRepository } from "../../src/repository/in-memory-order-repository";
import { buildTestApp } from "../helpers/build-test-app";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("createApp", () => {
  it("returns 404 with error not_found for a route that does not exist", async () => {
    const { app } = buildTestApp();

    const response = await request(app).get("/nope");

    expect(response.status).toBe(404);
    expect(response.body.error).toBe("not_found");
  });

  it("returns 400 with error bad_request when the JSON body is malformed", async () => {
    const { app } = buildTestApp();

    const response = await request(app)
      .post("/orders")
      .set("content-type", "application/json")
      .send("{not json");

    expect(response.status).toBe(400);
    expect(response.body.error).toBe("bad_request");
  });

  it("returns 500 without leaking the internal error message, and logs it", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const repository = new InMemoryOrderRepository();
    vi.spyOn(repository, "findById").mockRejectedValue(new Error("db password is hunter2"));
    const { app } = buildTestApp({ repository });

    const response = await request(app).get("/orders/any-id");

    expect(response.status).toBe(500);
    expect(response.body.error).toBe("internal_error");
    expect(JSON.stringify(response.body)).not.toContain("hunter2");
    expect(errorSpy).toHaveBeenCalled();
  });
});
