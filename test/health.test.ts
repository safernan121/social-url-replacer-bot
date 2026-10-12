import { describe, expect, it, vi } from "vitest";
import { HEARTBEAT_MAX_AGE_MS, HealthMonitor, MAX_UNHEALTHY_MS, isHeartbeatFresh } from "../src/health.js";
import "./helpers.js"; // silences logs

describe("isHeartbeatFresh", () => {
  it("accepts recent heartbeats only", () => {
    expect(isHeartbeatFresh("1000", 1000)).toBe(true);
    expect(isHeartbeatFresh("1000\n", 1000 + HEARTBEAT_MAX_AGE_MS)).toBe(true);
    expect(isHeartbeatFresh("1000", 1001 + HEARTBEAT_MAX_AGE_MS)).toBe(false);
  });

  it("rejects garbage and timestamps from the future", () => {
    expect(isHeartbeatFresh("", 1000)).toBe(false);
    expect(isHeartbeatFresh("not a number", 1000)).toBe(false);
    expect(isHeartbeatFresh("5000", 1000)).toBe(false);
  });
});

describe("HealthMonitor", () => {
  it("writes a heartbeat while connected", () => {
    const write = vi.fn();
    const onUnhealthy = vi.fn();
    const monitor = new HealthMonitor(() => true, onUnhealthy, write, 0);
    monitor.tick(15_000);
    expect(write).toHaveBeenCalledWith(15_000);
    expect(onUnhealthy).not.toHaveBeenCalled();
  });

  it("stops writing while disconnected, and gives up after the grace period", () => {
    let connected = true;
    const write = vi.fn();
    const onUnhealthy = vi.fn();
    const monitor = new HealthMonitor(() => connected, onUnhealthy, write, 0);
    monitor.tick(1_000);
    connected = false;
    monitor.tick(1_000 + MAX_UNHEALTHY_MS);
    expect(write).toHaveBeenCalledTimes(1);
    expect(onUnhealthy).not.toHaveBeenCalled();
    monitor.tick(1_001 + MAX_UNHEALTHY_MS);
    expect(onUnhealthy).toHaveBeenCalledTimes(1);
  });

  it("recovers if the connection comes back in time", () => {
    let connected = false;
    const onUnhealthy = vi.fn();
    const monitor = new HealthMonitor(() => connected, onUnhealthy, vi.fn(), 0);
    monitor.tick(MAX_UNHEALTHY_MS - 1);
    connected = true;
    monitor.tick(MAX_UNHEALTHY_MS);
    connected = false;
    monitor.tick(MAX_UNHEALTHY_MS * 2 - 1);
    expect(onUnhealthy).not.toHaveBeenCalled();
  });

  it("gives up if it never connects", () => {
    const onUnhealthy = vi.fn();
    const monitor = new HealthMonitor(() => false, onUnhealthy, vi.fn(), 0);
    monitor.tick(MAX_UNHEALTHY_MS + 1);
    expect(onUnhealthy).toHaveBeenCalled();
  });

  it("survives heartbeat write failures", () => {
    const monitor = new HealthMonitor(
      () => true,
      vi.fn(),
      () => {
        throw new Error("EROFS");
      },
      0,
    );
    expect(() => monitor.tick(1)).not.toThrow();
  });
});
