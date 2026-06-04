/**
 * Energy Preferences Fetching
 *
 * Reads HA's energy dashboard config via `energy/get_prefs`.
 *
 * @packageDocumentation
 */

import type { SyncLayerConnection } from "../connection/types";

/**
 * An energy source entry. Only the fields the widgets read are typed; the
 * rest is passthrough. HA emits one of several shapes keyed by `type`:
 * - grid: `flow_from[].stat_energy_from`, `flow_to[].stat_energy_to`
 * - solar: `stat_energy_from`
 * - battery: `stat_energy_from`, `stat_energy_to`
 */
export interface EnergySource {
  type: "grid" | "solar" | "battery" | "gas" | "water" | string;
  stat_energy_from?: string;
  stat_energy_to?: string;
  flow_from?: Array<{ stat_energy_from: string; [key: string]: unknown }>;
  flow_to?: Array<{ stat_energy_to: string; [key: string]: unknown }>;
  [key: string]: unknown;
}

/** A device tracked on the energy dashboard. */
export interface EnergyDeviceConsumption {
  stat_consumption: string;
  name?: string;
  [key: string]: unknown;
}

/**
 * HA energy dashboard preferences.
 *
 * Based on HA frontend: EnergyPreferences.
 */
export interface EnergyPreferences {
  energy_sources: EnergySource[];
  device_consumption: EnergyDeviceConsumption[];
  [key: string]: unknown;
}

/** Connection surface used by energy prefs fetching. */
type EnergyConnection = Pick<SyncLayerConnection, "sendMessagePromise">;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

/**
 * Fetch the HA energy dashboard preferences.
 *
 * Returns `null` when no energy dashboard is configured (HA raises an error
 * for `energy/get_prefs` in that case); callers treat `null` as "not
 * configured".
 */
export async function fetchEnergyPreferences(
  connection: EnergyConnection,
): Promise<EnergyPreferences | null> {
  let response: unknown;
  try {
    response = await connection.sendMessagePromise({ type: "energy/get_prefs" });
  } catch {
    return null;
  }

  if (!isRecord(response)) {
    return null;
  }

  const sources = Array.isArray(response.energy_sources)
    ? (response.energy_sources.filter(isRecord) as EnergySource[])
    : [];
  const devices = Array.isArray(response.device_consumption)
    ? (response.device_consumption.filter(isRecord) as EnergyDeviceConsumption[])
    : [];

  return {
    ...response,
    energy_sources: sources,
    device_consumption: devices,
  };
}
