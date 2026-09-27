import { writeFileSync } from "node:fs";
import { generateHouse } from "../src/demo/house/generate";
import { HOUSE } from "../src/demo/house/house";

const ids = generateHouse(HOUSE, new Date(0).toISOString()).entityIds.slice().sort();
const body = `export const DEMO_ENTITY_IDS = [\n${ids.map((id) => `  "${id}",`).join("\n")}\n] as const;\n\nexport type DemoEntityId = (typeof DEMO_ENTITY_IDS)[number];\n`;
writeFileSync(new URL("../src/demo/ids.ts", import.meta.url), body);
