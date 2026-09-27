import { ACTUATORS } from "./actuators";
import { READINGS } from "./readings";
import type { DeviceKind, KindName } from "./types";

export const KINDS = { ...ACTUATORS, ...READINGS } satisfies Record<KindName, DeviceKind>;

export { APPLIANCE_ENERGY_IDS } from "./readings";
