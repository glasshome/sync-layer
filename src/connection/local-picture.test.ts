import { afterAll, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { bulkUpdateEntities } from "../core/reducers";
import { resetStore, state } from "../core/store";
import type { HassEntity } from "../core/types";
import { registerEntity } from "./subscription-manager";
import { subscribeToUpdates } from "./subscriptions";
import type { SyncLayerConnection } from "./types";

const ID = "media_player.music_assistant";
const REMOTE = "http://192.168.1.20:8095/imageproxy?path=cover.jpg";
const LOCAL = `/api/media_player_proxy/${ID}?token=abc&cache=111`;

type Push = (message: unknown) => void;

function makeFakeConn() {
  const pushes: Push[] = [];
  const conn = {
    sendMessagePromise<T>(): Promise<T> {
      return Promise.reject(new Error("unused"));
    },
    subscribeEvents(): Promise<() => void> {
      return Promise.resolve(() => {});
    },
    subscribeMessage(callback: Push): Promise<() => Promise<void>> {
      pushes.push(callback);
      return Promise.resolve(async () => {});
    },
  };
  return { conn: conn as unknown as SyncLayerConnection, pushes };
}

const settle = () => new Promise<void>((r) => setTimeout(r, 0));

function entity(attributes: Record<string, unknown>): HassEntity {
  return {
    entity_id: ID,
    state: "playing",
    attributes,
    last_changed: "2026-10-02T00:00:00.000Z",
    last_updated: "2026-10-02T00:00:00.000Z",
    context: { id: "c", parent_id: null, user_id: null },
  };
}

const picture = () => state.entities[ID]?.attributes.entity_picture;

beforeEach(() => {
  resetStore();
});

describe("get_states", () => {
  test("remote art is replaced by HA's local copy", () => {
    bulkUpdateEntities([entity({ entity_picture: REMOTE, entity_picture_local: LOCAL })]);
    expect(picture()).toBe(LOCAL);
  });

  test("art without a local copy is left alone", () => {
    bulkUpdateEntities([entity({ entity_picture: LOCAL })]);
    expect(picture()).toBe(LOCAL);
    bulkUpdateEntities([entity({ entity_picture: REMOTE })]);
    expect(picture()).toBe(REMOTE);
  });
});

describe("subscribe_entities", () => {
  let push: Push = () => {};
  let unregister = () => {};

  beforeAll(async () => {
    const fake = makeFakeConn();
    await subscribeToUpdates(fake.conn);
    unregister = registerEntity(ID);
    await settle();
    const last = fake.pushes.at(-1);
    if (!last) throw new Error("no entity subscription");
    push = last;
  });

  afterAll(() => unregister());

  async function playing() {
    push({
      a: { [ID]: { s: "playing", a: { entity_picture: REMOTE, entity_picture_local: LOCAL } } },
    });
    await settle();
  }

  test("added state stores the local copy", async () => {
    await playing();
    expect(picture()).toBe(LOCAL);
  });

  test("diff with a new track stores the new local copy", async () => {
    await playing();
    const nextLocal = `/api/media_player_proxy/${ID}?token=abc&cache=222`;
    push({
      c: {
        [ID]: { "+": { a: { entity_picture: `${REMOTE}&t=2`, entity_picture_local: nextLocal } } },
      },
    });
    await settle();
    expect(picture()).toBe(nextLocal);
  });

  test("diff carrying only the remote URL keeps the local copy and changes nothing", async () => {
    await playing();
    const before = state.entities[ID]?.last_updated;
    push({ c: { [ID]: { "+": { a: { entity_picture: `${REMOTE}&t=2` }, lu: 1_800_000_000 } } } });
    await settle();
    expect(picture()).toBe(LOCAL);
    expect(state.entities[ID]?.last_updated).toBe(before);
  });

  test("full state for a stored entity stores the new local copy", async () => {
    await playing();
    const nextLocal = `/api/media_player_proxy/${ID}?token=abc&cache=333`;
    push({
      a: { [ID]: { s: "playing", a: { entity_picture: REMOTE, entity_picture_local: nextLocal } } },
    });
    await settle();
    expect(picture()).toBe(nextLocal);
  });

  test("player turning off drops both pictures", async () => {
    await playing();
    push({
      c: { [ID]: { "+": { s: "off" }, "-": { a: ["entity_picture", "entity_picture_local"] } } },
    });
    await settle();
    expect(picture()).toBeUndefined();
  });
});
