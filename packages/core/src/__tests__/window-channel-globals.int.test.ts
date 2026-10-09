// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { CID_PARAM, connectToOpener, openWindow } from "../window-channel.js";
import { FakeWindow, fakeWindowPair } from "./helpers/fake-window.js";

/**
 * vitest 5's happy-dom environment exposes `opener` as a getter-only accessor,
 * so the fallback under test has to be shadowed with an own property rather
 * than assigned to. Cleared in afterEach, which restores the real getter.
 */
function stubOpener(value: unknown): void {
  Object.defineProperty(window, "opener", { value, configurable: true, writable: true });
}

/**
 * Exercises the no-test-seam fallbacks: window.open, window.opener,
 * the global message listeners, and cid extraction from location.search.
 */
describe("window-channel global fallbacks (happy-dom)", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    Reflect.deleteProperty(window, "opener");
  });

  it("openWindow falls back to window.open and resolves relative URLs against location", () => {
    const { child } = fakeWindowPair(location.origin, location.origin);
    const openSpy = vi
      .spyOn(window, "open")
      .mockReturnValue(child as unknown as ReturnType<typeof window.open>);

    const opened = openWindow("/payment", { peerOrigin: location.origin });

    expect(openSpy).toHaveBeenCalledOnce();
    const openedUrl = openSpy.mock.calls[0]![0] as string;
    expect(new URL(openedUrl).searchParams.get(CID_PARAM)).toBeTruthy();
    expect(opened.window).toBe(child);
    opened.close();
  });

  it("connectToOpener falls back to window.opener, location cid, and window.close", () => {
    const openerWindow = new FakeWindow("http://shop.example");
    openerWindow.peer = new FakeWindow(location.origin);
    stubOpener(openerWindow);
    history.replaceState(null, "", `/pay?${CID_PARAM}=abc123`);
    const closeSpy = vi.spyOn(window, "close").mockImplementation(() => {});

    const conn = connectToOpener({ peerOrigin: "http://shop.example" });
    conn.close();

    expect(closeSpy).toHaveBeenCalledOnce();
  });

  it("connectToOpener throws when the global window has no opener", () => {
    stubOpener(undefined);
    expect(() => connectToOpener({ peerOrigin: "http://shop.example" })).toThrow(
      /no window.opener/,
    );
  });
});
