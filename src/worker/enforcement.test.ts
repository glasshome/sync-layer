import { describe, expect, test } from "bun:test";
import { enforceServiceCall, expandTargets, RegistryMirror } from "./enforcement";

function mirror(): RegistryMirror {
  const m = new RegistryMirror();
  m.replace(
    [
      { entity_id: "light.living", device_id: "dev1", area_id: null, labels: [] },
      { entity_id: "light.kitchen", device_id: "dev2", area_id: "kitchen", labels: ["mood"] },
      { entity_id: "lock.front_door", device_id: "dev3", area_id: "hall", labels: [] },
      { entity_id: "sensor.dev1_power", device_id: "dev1", area_id: null, labels: [] },
    ],
    [
      { id: "dev1", area_id: "living", labels: ["smart"] },
      { id: "dev2", area_id: "kitchen", labels: [] },
      { id: "dev3", area_id: "hall", labels: [] },
    ],
  );
  return m;
}

describe("expandTargets", () => {
  test("entity ids pass through from target", () => {
    expect(
      expandTargets({ domain: "light", service: "turn_on", target: { entity_id: "light.living" } }, mirror()),
    ).toEqual(["light.living"]);
  });

  test("entity ids hidden in service data are NOT ignored (smuggling)", () => {
    expect(
      expandTargets(
        { domain: "light", service: "turn_on", data: { entity_id: ["lock.front_door"] } },
        mirror(),
      ),
    ).toEqual(["lock.front_door"]);
  });

  test("device target expands to all its entities", () => {
    expect(
      expandTargets({ domain: "light", service: "turn_on", target: { device_id: "dev1" } }, mirror()).sort(),
    ).toEqual(["light.living", "sensor.dev1_power"]);
  });

  test("area target expands through entity area AND device area", () => {
    const ids = expandTargets(
      { domain: "light", service: "turn_on", target: { area_id: "living" } },
      mirror(),
    );
    // light.living has no own area but its device sits in "living".
    expect(ids).toEqual(["light.living", "sensor.dev1_power"]);
  });

  test("label target matches entity labels and device labels", () => {
    const byEntityLabel = expandTargets(
      { domain: "light", service: "turn_on", target: { label_id: "mood" } },
      mirror(),
    );
    expect(byEntityLabel).toEqual(["light.kitchen"]);

    const byDeviceLabel = expandTargets(
      { domain: "light", service: "turn_on", target: { label_id: "smart" } },
      mirror(),
    ).sort();
    expect(byDeviceLabel).toEqual(["light.living", "sensor.dev1_power"]);
  });

  test("target and data sources merge without duplicates", () => {
    const ids = expandTargets(
      {
        domain: "light",
        service: "turn_on",
        target: { entity_id: "light.living" },
        data: { entity_id: "light.living", area_id: "kitchen" },
      },
      mirror(),
    ).sort();
    expect(ids).toEqual(["light.kitchen", "light.living"]);
  });

  test("non-string garbage in id fields is dropped, not crashed on", () => {
    expect(
      expandTargets(
        {
          domain: "light",
          service: "turn_on",
          target: { entity_id: [42, null, "light.living"], device_id: {} },
        },
        mirror(),
      ),
    ).toEqual(["light.living"]);
  });
});

describe("enforceServiceCall", () => {
  const lightOnly = [{ domain: "light", access: "control" as const }];

  test("allows a covered call", () => {
    const verdict = enforceServiceCall(
      lightOnly,
      { domain: "light", service: "turn_on", target: { entity_id: "light.living" } },
      mirror(),
    );
    expect(verdict.allowed).toBe(true);
  });

  test("denies cross-domain even when routed through an area", () => {
    // Area "hall" contains the lock; a light-only widget targeting the area
    // with a lock call must be denied.
    const verdict = enforceServiceCall(
      lightOnly,
      { domain: "lock", service: "unlock", target: { area_id: "hall" } },
      mirror(),
    );
    expect(verdict.allowed).toBe(false);
    expect(verdict.entityIds).toEqual(["lock.front_door"]);
  });

  test("denies when expansion pulls in an out-of-domain entity", () => {
    // dev1 carries a light AND a sensor; light-only control of the device
    // would touch the sensor entity, so the whole call is denied.
    const verdict = enforceServiceCall(
      lightOnly,
      { domain: "light", service: "turn_on", target: { device_id: "dev1" } },
      mirror(),
    );
    expect(verdict.allowed).toBe(false);
  });

  test("denies smuggled data.entity_id outside narrowing", () => {
    const narrowed = [
      { domain: "light", access: "control" as const, entities: ["light.kitchen"] },
    ];
    const verdict = enforceServiceCall(
      narrowed,
      {
        domain: "light",
        service: "turn_on",
        target: { entity_id: "light.kitchen" },
        data: { entity_id: "light.living" },
      },
      mirror(),
    );
    expect(verdict.allowed).toBe(false);
  });

  test("empty grants deny everything", () => {
    const verdict = enforceServiceCall(
      [],
      { domain: "light", service: "turn_on", target: { entity_id: "light.living" } },
      mirror(),
    );
    expect(verdict.allowed).toBe(false);
  });
});
