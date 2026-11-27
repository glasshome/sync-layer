import { afterEach, beforeEach, expect, test } from "bun:test";
import { createRoot, flush } from "solid-js";
import type { HaLink } from "../core/store";
import { setPrivilegedConn } from "../core/privileged-conn";
import { setLocalState } from "../core/store";
import { settle } from "../testing/ha-wire";
import { useCamera } from "./hooks";

const CAMERA = "camera.front_door";
let asked = 0;
let dispose: (() => void) | undefined;

beforeEach(() => {
  asked = 0;
  const conn: HaLink = {
    sendMessagePromise<T>(message: unknown): Promise<T> {
      const ask = message as { type: string; entity_id: string };
      if (ask.type !== "camera/stream" || ask.entity_id !== CAMERA)
        return Promise.reject(new Error(`unexpected ${ask.type}`));
      asked++;
      return Promise.resolve({ url: `https://ha.local/api/hls/${asked}/master.m3u8` } as T);
    },
    subscribeMessage: () => Promise.resolve(async () => {}),
    subscribeEvents: () => Promise.resolve(() => {}),
  };
  setPrivilegedConn(conn);
});

afterEach(() => {
  dispose?.();
  dispose = undefined;
  setPrivilegedConn(null);
  setLocalState("streams", (map) => {
    delete map[CAMERA];
  });
});

test("useCamera refresh asks Home Assistant for the stream again, even when one is cached", async () => {
  const camera = createRoot((d) => {
    dispose = d;
    return useCamera(CAMERA);
  });
  flush();
  expect(camera.stream()).toBeNull();

  camera.refresh();
  await settle();
  flush();
  expect(camera.stream()?.stream.url).toBe("https://ha.local/api/hls/1/master.m3u8");

  camera.refresh();
  await settle();
  flush();
  expect(camera.stream()?.stream.url).toBe("https://ha.local/api/hls/2/master.m3u8");
});
