/** Package entry: default export is the `WorldDefinition` loader reads. */
import { ETS2_DEFINITION } from './definition.ts';

export default ETS2_DEFINITION;
export { ETS2_DEFINITION };
export type { Ets2ConfigSection } from './config.ts';
export { Ets2World } from './world.ts';
export { parseTelemetry, ScsSharedMemory } from './telemetry.ts';
export { EventEngine } from './events.ts';
export { RadarBook } from './radar.ts';
