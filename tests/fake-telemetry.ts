import { parseTelemetry, type Ets2Telemetry } from '../src/telemetry.ts';

function writeString(buf: Buffer, offset: number, text: string): void {
  Buffer.from(text, 'utf8').copy(buf, offset);
}

/** A minimal but layout-correct 32 KiB snapshot for unit tests. */
export function makeBuffer(): Buffer {
  const b = Buffer.alloc(32768);
  b.writeUInt8(1, 0); // sdk active
  b.writeUInt32LE(12, 40); // revision
  b.writeUInt32LE(1, 44);
  b.writeUInt32LE(61, 48);
  b.writeUInt32LE(1, 52); // ETS2
  b.writeUInt32LE(1, 56);
  b.writeUInt32LE(12, 60);
  b.writeUInt32LE(450, 100); // planned km
  b.writeFloatLE(800, 704); // fuel capacity
  b.writeFloatLE(80, 712); // adblue capacity
  b.writeFloatLE(25, 948); // 90 km/h
  b.writeFloatLE(1300, 952);
  b.writeFloatLE(300, 1000);
  b.writeFloatLE(650, 1008);
  b.writeFloatLE(60, 1012);
  b.writeFloatLE(0.03, 1036);
  b.writeFloatLE(9000, 1056);
  b.writeFloatLE(12000, 1060);
  b.writeFloatLE(22.22, 1068);
  b.writeDoubleLE(1200, 2200);
  b.writeDoubleLE(5, 2208);
  b.writeDoubleLE(-3400, 2216);
  b.writeDoubleLE(0.7, 2224);
  writeString(b, 2620, '医疗用品');
  writeString(b, 2748, '柏林');
  writeString(b, 3004, '阿姆斯特丹');
  b.writeBigUInt64LE(12500n, 4000);
  b.writeUInt8(1, 4300); // on_job
  return b;
}

export function makeTelemetry(): Ets2Telemetry {
  return parseTelemetry(makeBuffer());
}

export function cloneTelemetry(t: Ets2Telemetry): Ets2Telemetry {
  return structuredClone(t);
}
