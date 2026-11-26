import { preferLocalPicture } from "../media/local-picture";
import { mergeEntities } from "./merge";
import { setLocalState } from "./store";
import type { HassEntity, StatisticMetadata } from "./types";

/** Upserts already-typed entity rows through the merge door; rows not given stay as stored. */
export function bulkUpdateEntities(entities: HassEntity[]): void {
  const rows: Record<string, HassEntity> = {};
  for (const entity of entities) {
    preferLocalPicture(entity.attributes);
    rows[entity.entity_id] = entity;
  }
  mergeEntities(rows);
}

export function updateStatisticsMetadata(metadata: StatisticMetadata[]): void {
  setLocalState("statisticsMetadata", (map) => {
    for (const meta of metadata) {
      map[meta.statistic_id] = meta;
    }
  });
}
