import { afterEach, describe, expect, test } from "bun:test";
import { settle } from "../testing/ha-wire";
import {
  registerEntity,
  setManagerConnection,
  setResubscribeHandler,
} from "./subscription-manager";
import type { SyncLayerConnection } from "./types";

interface Call {
  link: SyncLayerConnection;
  ids: string[];
  resolve: (unsub: () => void) => void;
  reject: (error: Error) => void;
}

const link = () => ({}) as SyncLayerConnection;
let calls: Call[] = [];
const closed: SyncLayerConnection[] = [];
let unregister = () => {};

function recordSubscribes(): void {
  calls = [];
  closed.length = 0;
  setResubscribeHandler(
    (conn, ids) =>
      new Promise((resolve, reject) => {
        calls.push({ link: conn, ids, resolve, reject });
      }),
  );
}

const unsubFor = (conn: SyncLayerConnection) => () => void closed.push(conn);

afterEach(() => {
  unregister();
  setResubscribeHandler(async () => () => {});
});

describe("a new link while a subscribe is in flight", () => {
  test("a subscribe the old link answers late never stands for the new one", async () => {
    recordSubscribes();
    const [a, b] = [link(), link()];
    setManagerConnection(a);
    unregister = registerEntity("light.late");
    await settle();
    setManagerConnection(b);
    await settle();

    calls[0]?.resolve(unsubFor(a));
    await settle();

    expect(calls.filter((c) => c.link === b && c.ids.includes("light.late"))).toHaveLength(1);
    expect(closed).toContain(a);
  });

  test("a subscribe the old link refuses is made on the new one", async () => {
    recordSubscribes();
    const [a, b] = [link(), link()];
    setManagerConnection(a);
    unregister = registerEntity("light.refused");
    await settle();
    setManagerConnection(b);
    await settle();

    calls[0]?.reject(new Error("link closed"));
    await settle();

    expect(calls.filter((c) => c.link === b && c.ids.includes("light.refused"))).toHaveLength(1);
  });

  test("the old link's subscription is closed when a new link takes over", async () => {
    recordSubscribes();
    const [a, b] = [link(), link()];
    setManagerConnection(a);
    unregister = registerEntity("light.handover");
    await settle();
    calls[0]?.resolve(unsubFor(a));
    await settle();

    setManagerConnection(b);
    await settle();

    expect(closed).toEqual([a]);
    expect(calls.filter((c) => c.link === b)).toHaveLength(1);
  });
});
