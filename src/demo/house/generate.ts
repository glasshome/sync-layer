import type { EntityCategory, EntityRegistryEntry } from "@glasshome/ha-types";
import type { AreaRegistryEntry, DeviceRegistryEntry, FloorRegistryEntry } from "../../core/types";
import { KINDS } from "../kinds";
import type { DeviceSpec, EntitySeed, ServiceCall } from "../kinds/types";
import { inRoom } from "./builders";
import type { SceneTarget } from "./builders";
import type { House, HouseRoom } from "./house";

export interface GeneratedHouse {
  devices: DeviceSpec[];
  registry: {
    entityRegistry: Record<string, EntityRegistryEntry>;
    devices: Record<string, DeviceRegistryEntry>;
    areas: Record<string, AreaRegistryEntry>;
    floors: Record<string, FloorRegistryEntry>;
  };
  entityIds: string[];
  roomOf: Record<string, string>;
  friendlyNames: Record<string, string>;
}

type SideRole = "signal" | "battery" | "firmware";

const SIDE_NAME: Record<SideRole, string> = {
  signal: "Signal strength",
  battery: "Battery",
  firmware: "Firmware",
};

interface Placed {
  spec: DeviceSpec;
  deviceId: string;
  side: boolean;
  seeds: EntitySeed[];
  category?: EntitySeed["category"];
}

const registryIdOf = (d: DeviceSpec) => d.deviceId ?? d.key;

function sideRoles(owner: DeviceSpec): SideRole[] {
  const transport = owner.params.transport;
  const roles: SideRole[] = [];
  if (transport === "zigbee" || transport === "wifi") roles.push("signal");
  if (transport === "zigbee" && owner.params.battery) roles.push("battery");
  if (transport === "wifi" || owner.kind === "light") roles.push("firmware");
  return roles;
}

function sideSpec(owner: DeviceSpec, role: SideRole): DeviceSpec {
  const deviceId = registryIdOf(owner);
  const base = {
    name: owner.name,
    areaId: owner.areaId,
    manufacturer: owner.manufacturer,
    model: owner.model,
    deviceId,
    entityName: SIDE_NAME[role],
  };
  const integration = owner.params.integration;
  switch (role) {
    case "signal":
      return {
        ...base,
        key: `${deviceId}_signal_strength`,
        kind: "sensor",
        params: { reading: "signal", integration },
      };
    case "battery": {
      const batteryId = owner.ids?.battery;
      return {
        ...base,
        key: `${deviceId}_battery`,
        kind: "sensor",
        params: { reading: "battery", integration },
        ...(batteryId ? { ids: { sensor: batteryId } } : {}),
      };
    }
    case "firmware":
      return {
        ...base,
        key: `${deviceId}_firmware`,
        kind: "update",
        params: { integration },
        ids: { update: `update.${deviceId}_firmware` },
      };
  }
}

function peopleSpecs(house: House): DeviceSpec[] {
  const b = inRoom(null);
  return house.people.flatMap((p) => [
    b.person(p.name, { key: `person_${p.id}`, id: `person.${p.id}`, template: p.template }),
    b.phone(`${p.name}'s Phone`, { key: `phone_${p.id}`, id: `sensor.phone_${p.id}_battery` }),
  ]);
}

function place(declared: DeviceSpec[]): Placed[] {
  const groups = new Map<string, DeviceSpec[]>();
  for (const d of declared) {
    const id = registryIdOf(d);
    groups.set(id, [...(groups.get(id) ?? []), d]);
  }
  const placed: Placed[] = [];
  for (const [deviceId, specs] of groups) {
    const owner = specs[0];
    if (!owner) continue;
    for (const spec of specs)
      placed.push({ spec, deviceId, side: false, seeds: KINDS[spec.kind].entities(spec) });
    for (const role of sideRoles(owner)) {
      const spec = sideSpec(owner, role);
      // A battery with a declared id is a user-facing entity, so it stays uncategorised.
      const category = role === "battery" && owner.ids?.battery ? undefined : "diagnostic";
      placed.push({ spec, deviceId, side: true, seeds: KINDS[spec.kind].entities(spec), category });
    }
  }
  return placed;
}

function resolveTarget(t: SceneTarget, placed: Placed[]): ServiceCall {
  const entityIds =
    t.entityIds ??
    placed
      .filter((p) => !p.side && (t.area === undefined || p.spec.areaId === t.area))
      .flatMap((p) =>
        p.seeds
          .filter((s) => s.primary && s.entityId.startsWith(`${t.domain}.`))
          .map((s) => s.entityId),
      );
  return { domain: t.domain, service: t.service, data: t.data ?? {}, entityIds };
}

function resolveScenes(placed: Placed[]): Placed[] {
  return placed.map((p) => {
    if (p.spec.kind !== "scene") return p;
    const targets = (p.spec.params.targets as SceneTarget[]).map((t) => resolveTarget(t, placed));
    return { ...p, spec: { ...p.spec, params: { ...p.spec.params, targets } } };
  });
}

function assertUnique(label: string, values: string[]): void {
  const seen = new Set<string>();
  for (const v of values) {
    if (seen.has(v)) throw new Error(`demo house: duplicate ${label} ${v}`);
    seen.add(v);
  }
}

function assertTargetsExist(placed: Placed[], known: Set<string>): void {
  for (const p of placed) {
    if (p.spec.kind !== "scene") continue;
    for (const t of p.spec.params.targets as ServiceCall[]) {
      const missing = t.entityIds.find((id) => !known.has(id));
      if (missing) throw new Error(`demo house: scene ${p.spec.key} targets unknown ${missing}`);
    }
  }
}

function toCategory(c: EntitySeed["category"]): EntityCategory | null {
  return (c ?? null) as EntityCategory | null;
}

function entityEntry(
  p: Placed,
  seed: EntitySeed,
  name: string | null,
  createdIso: string,
): EntityRegistryEntry {
  const integration = p.spec.params.integration;
  const platform = typeof integration === "string" ? integration : "demo";
  return {
    aliases: [],
    area_id: null,
    capabilities: null,
    categories: {},
    config_entry_id: `${platform}_entry`,
    config_subentry_id: null,
    created_at: createdIso,
    device_class: seed.deviceClass ?? null,
    device_id: p.deviceId,
    disabled_by: null,
    entity_category: toCategory(p.side ? p.category : seed.category),
    entity_id: seed.entityId,
    has_entity_name: true,
    hidden_by: null,
    icon: null,
    id: `reg-${seed.entityId.replace(".", "-")}`,
    labels: [],
    modified_at: createdIso,
    name,
    options: {},
    original_device_class: seed.deviceClass ?? null,
    original_icon: null,
    original_name: name,
    platform,
    previous_unique_id: null,
    suggested_object_id: null,
    supported_features: seed.supportedFeatures ?? 0,
    translation_key: null,
    unique_id: `demo_${seed.entityId.replace(".", "_")}`,
    unit_of_measurement: seed.unit ?? null,
  };
}

function deviceEntry(owner: DeviceSpec, id: string, createdIso: string): DeviceRegistryEntry {
  const integration = owner.params.integration;
  const platform = typeof integration === "string" ? integration : "demo";
  const entry = `${platform}_entry`;
  return {
    id,
    name: owner.name,
    name_by_user: null,
    manufacturer: owner.manufacturer,
    model: owner.model,
    model_id: null,
    sw_version: "1.0.0",
    hw_version: null,
    area_id: owner.areaId,
    config_entries: [entry],
    config_entries_subentries: {},
    configuration_url: null,
    connections: [],
    created_at: createdIso,
    disabled_by: null,
    entry_type: null,
    identifiers: [[platform, id]],
    labels: [],
    modified_at: createdIso,
    primary_config_entry: entry,
    serial_number: null,
    via_device_id: null,
  };
}

function areaEntry(room: HouseRoom, placed: Placed[], createdIso: string): AreaRegistryEntry {
  const reading = (...readings: string[]) =>
    placed.find(
      (p) =>
        !p.side &&
        p.spec.areaId === room.id &&
        p.spec.kind === "sensor" &&
        readings.includes(String(p.spec.params.reading)),
    )?.seeds[0]?.entityId ?? null;
  return {
    id: room.id,
    name: room.name,
    normalized_name: room.name.toLowerCase().replace(/\s+/g, "_"),
    created_at: createdIso,
    modified_at: createdIso,
    aliases: [],
    floor_id: room.floor,
    humidity_entity_id: reading("humidity"),
    icon: null,
    labels: [],
    picture: null,
    temperature_entity_id: reading("temperature", "outdoor_temperature"),
  };
}

export function generateHouse(house: House, createdIso: string): GeneratedHouse {
  const declared = [
    ...house.rooms.flatMap((r) => r.devices),
    ...house.whole,
    ...peopleSpecs(house),
  ];
  const placed = resolveScenes(place(declared));
  assertUnique(
    "device key",
    placed.map((p) => p.spec.key),
  );
  const entityIds = placed.flatMap((p) => p.seeds.map((s) => s.entityId));
  assertUnique("entity id", entityIds);
  assertTargetsExist(placed, new Set(entityIds));

  const devices: Record<string, DeviceRegistryEntry> = {};
  const entityRegistry: Record<string, EntityRegistryEntry> = {};
  const roomOf: Record<string, string> = {};
  const friendlyNames: Record<string, string> = {};
  for (const p of placed) {
    const owner =
      devices[p.deviceId] ?? (devices[p.deviceId] = deviceEntry(p.spec, p.deviceId, createdIso));
    for (const seed of p.seeds) {
      const name = seed.primary ? (p.spec.entityName ?? null) : seed.name;
      entityRegistry[seed.entityId] = entityEntry(p, seed, name, createdIso);
      friendlyNames[seed.entityId] = name ? `${owner.name} ${name}` : (owner.name ?? seed.entityId);
      if (p.spec.areaId) roomOf[seed.entityId] = p.spec.areaId;
    }
  }

  const areas = Object.fromEntries(
    house.rooms.map((r) => [r.id, areaEntry(r, placed, createdIso)]),
  );
  const floors = Object.fromEntries(
    house.floors.map((f): [string, FloorRegistryEntry] => [
      f.id,
      {
        floor_id: f.id,
        name: f.name,
        level: f.level,
        icon: null,
        aliases: [],
        created_at: createdIso,
        modified_at: createdIso,
      },
    ]),
  );

  return {
    devices: placed.map((p) => p.spec),
    registry: { entityRegistry, devices, areas, floors },
    entityIds,
    roomOf,
    friendlyNames,
  };
}
