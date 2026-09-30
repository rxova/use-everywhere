import { act, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { BroadcastChannelTransport, createLeader } from "@use-everywhere/core";
import { useIsLeader, useLeader, useLeaderEffect } from "../use-leader.js";
import type { UseLeaderOptions } from "../use-leader.types.js";

// Real timers on purpose: fake timers, act(), and BroadcastChannel's async
// delivery interact badly. So every test waits for the state it is about with
// `waitFor`, never for a fixed number of milliseconds: a fixed sleep is a bet
// on how fast the runner is, and a slow Windows runner loses it.
const FAST: UseLeaderOptions = { heartbeatMs: 20, leaseMs: 60 };

// For every test with an incumbent. A newcomer listens for heartbeatMs before
// it claims, and the incumbent's answer to its hello has to arrive inside that
// window: miss it, and both hold a claim at the same term, which the client id
// tie-break then settles at random. 20ms is not enough margin on a loaded CI
// runner; 250ms is, and the lease is long enough that a stalled heartbeat
// cannot hand the seat over either. Nothing here waits for these timings to
// elapse except the one initial election, so they cost little.
const STEADY: UseLeaderOptions = { heartbeatMs: 250, leaseMs: 5000 };

// The registry keys leaders by name and they live for the page, so every test
// needs a name of its own.
let n = 0;
const uniqueName = () => `led-${++n}`;

/** Another tab, already holding the seat when this returns. */
const incumbentOn = async (name: string) => {
  const leader = createLeader(name, {
    ...STEADY,
    transport: (busName) => new BroadcastChannelTransport(busName),
  });
  await waitFor(() => expect(leader.getSnapshot().isLeader).toBe(true));
  return leader;
};

function Crown({
  name,
  eligible,
  timings = FAST,
}: {
  name: string;
  eligible?: boolean;
  timings?: UseLeaderOptions;
}) {
  const { leaderId, isLeader } = useLeader({
    name,
    ...timings,
    ...(eligible === undefined ? {} : { eligible }),
  });
  return <span data-testid="crown">{isLeader ? "me" : (leaderId ?? "none")}</span>;
}

const crown = () => screen.getByTestId("crown").textContent;

describe("useLeader", () => {
  it("elects this tab when it is alone", async () => {
    const name = uniqueName();
    render(<Crown name={name} />);
    expect(crown()).toBe("none");

    await waitFor(() => expect(crown()).toBe("me"));
  });

  it("follows an incumbent that is already leading", async () => {
    const name = uniqueName();
    const incumbent = await incumbentOn(name);

    render(<Crown name={name} timings={STEADY} />);

    await waitFor(() => expect(crown()).toBe(incumbent.clientId));

    incumbent.close();
  });

  it("takes the seat when the incumbent resigns", async () => {
    const name = uniqueName();
    const incumbent = await incumbentOn(name);

    render(<Crown name={name} timings={STEADY} />);
    await waitFor(() => expect(crown()).toBe(incumbent.clientId));

    // Resigns on the way out, and a resign fails over at once rather than
    // after a lease, so the long STEADY lease does not slow this down.
    act(() => incumbent.close());

    await waitFor(() => expect(crown()).toBe("me"));
  });

  it("elects on the shared default bus when no name is given", async () => {
    // No `name`: the common case, and the only path through the DEFAULT_NAME
    // fallback. Fast timings so this costs 60ms, not a full 3s lease.
    function DefaultCrown() {
      const { isLeader } = useLeader(FAST);
      return <span data-testid="default">{isLeader ? "me" : "none"}</span>;
    }
    render(<DefaultCrown />);

    await waitFor(() => expect(screen.getByTestId("default").textContent).toBe("me"));
  });

  it("stands by when told it is not eligible", async () => {
    const name = uniqueName();
    render(<Crown name={name} eligible={false} />);

    // An absence has no event to wait for, so this one does wait: two full
    // leases, well past the point an eligible tab would have claimed.
    await act(() => new Promise<void>((r) => setTimeout(r, 120)));

    expect(crown()).toBe("none");
  });
});

describe("useIsLeader", () => {
  it("reports the seat as a boolean", async () => {
    const name = uniqueName();
    function Flag() {
      return <span data-testid="flag">{useIsLeader({ name, ...FAST }) ? "yes" : "no"}</span>;
    }
    render(<Flag />);
    expect(screen.getByTestId("flag").textContent).toBe("no");

    await waitFor(() => expect(screen.getByTestId("flag").textContent).toBe("yes"));
  });
});

describe("useLeaderEffect", () => {
  it("runs only in the leading tab, and cleans up when the seat is lost", async () => {
    const name = uniqueName();
    const start = vi.fn();
    const stop = vi.fn();

    function Worker() {
      useLeaderEffect(
        () => {
          start();
          return stop;
        },
        { name, ...STEADY },
      );
      return null;
    }

    // Somebody else already holds the seat, so our effect must not run. The
    // crown shares this tab's leader (the registry keys it by name), so it is
    // what says this tab has heard the incumbent and settled as a follower.
    const incumbent = await incumbentOn(name);
    render(
      <>
        <Worker />
        <Crown name={name} timings={STEADY} />
      </>,
    );
    await waitFor(() => expect(crown()).toBe(incumbent.clientId));
    expect(start).not.toHaveBeenCalled();

    // The seat comes to us.
    act(() => incumbent.close());
    await waitFor(() => expect(start).toHaveBeenCalledTimes(1));
    expect(stop).not.toHaveBeenCalled();

    // Now lose it: a claim with a term we cannot beat. This is the path that
    // matters — the socket must close when the seat moves, not just on unmount.
    const usurper = new BroadcastChannelTransport(name);
    act(() => {
      usurper.post({
        v: 1,
        scope: "leader",
        type: "claim",
        term: [999, "zzz-usurper"],
        clientId: "zzz-usurper",
        kind: "tab",
      });
    });

    await waitFor(() => expect(stop).toHaveBeenCalledTimes(1));
    expect(start).toHaveBeenCalledTimes(1);

    usurper.close();
  });

  it("does not restart when the callback identity changes", async () => {
    const name = uniqueName();
    const start = vi.fn();

    function Worker({ tick }: { tick: number }) {
      // A fresh arrow every render — the effect must not care.
      useLeaderEffect(
        () => {
          start(tick);
        },
        { name, ...FAST },
      );
      return <span data-testid="tick">{tick}</span>;
    }

    const { rerender } = render(<Worker tick={1} />);
    await waitFor(() => expect(start).toHaveBeenCalledTimes(1));

    // `rerender` runs inside act(), which flushes effects before it returns,
    // so a restart would already have happened by the next line.
    rerender(<Worker tick={2} />);
    rerender(<Worker tick={3} />);

    // Still once: re-running here would reconnect a real socket every render.
    expect(start).toHaveBeenCalledTimes(1);
  });

  it("tears the effect down when the component unmounts", async () => {
    const name = uniqueName();
    const start = vi.fn();
    const stop = vi.fn();

    function Worker() {
      useLeaderEffect(
        () => {
          start();
          return stop;
        },
        { name, ...FAST },
      );
      return null;
    }

    const { unmount } = render(<Worker />);
    await waitFor(() => expect(start).toHaveBeenCalledTimes(1));

    unmount();

    expect(stop).toHaveBeenCalledTimes(1);
  });
});
