import { ACTUATORS } from "./actuators";
import { READINGS } from "./readings";
import type { DeviceKind, KindName } from "./types";

export const KINDS = { ...ACTUATORS, ...READINGS } satisfies Record<KindName, DeviceKind>;

export { ACTUATORS } from "./actuators";
export { APPLIANCE_ENERGY_IDS, READINGS, WEATHER_FIXTURES } from "./readings";
