/**
 * SCS Telemetry shared-memory reader.
 *
 * The byte layout is the SCS SDK 1.12 / `scs-sdk-plugin` revision 12 layout used by
 * `Local\SCSTelemetry`. It is a direct port of the Python reader in the standalone
 * D:\euro app; keep the zone offsets in sync with `SCSSdkConvert.cs`.
 */
import koffi from 'koffi';

const MAP_SIZE = 32 * 1024;
const FILE_MAP_READ = 0x0004;
const AREAS = [0, 40, 500, 700, 1500, 1640, 2000, 2200, 2300, 4000, 4200, 4300, 4400, 6000];

export interface TruckState {
  speedMs: number;
  speedKmh: number;
  rpm: number;
  gear: number;
  displayedGear: number;
  fuelL: number;
  fuelCapacityL: number;
  fuelRatio: number | null;
  fuelRangeKm: number;
  adblueRatio: number | null;
  damageMax: number;
  odometerKm: number;
  navDistanceM: number;
  navTimeS: number;
  speedLimitKmh: number;
  parkingBrake: boolean;
  engineOn: boolean;
  warnings: Record<string, boolean>;
  world: { x: number; y: number; z: number; heading: number };
  accelMag: number;
}

export interface JobState {
  active: boolean;
  cargo: string;
  cargoMassKg: number;
  cargoDamage: number;
  sourceCity: string;
  sourceCompany: string;
  destinationCity: string;
  destinationCompany: string;
  plannedDistanceKm: number;
  income: number;
  remainingDistanceKm: number;
}

export interface SpecialEvents {
  onJob: boolean;
  jobFinished: boolean;
  jobCancelled: boolean;
  jobDelivered: boolean;
  fined: boolean;
  tollgate: boolean;
  ferry: boolean;
  train: boolean;
  refuel: boolean;
  refuelPayed: boolean;
}

export interface GameEvents {
  special: SpecialEvents;
  fine: { amount: number; offence: string };
  toll: { amount: number };
  ferry: { source: string; target: string; pay: number };
  train: { source: string; target: string; pay: number };
  delivery: {
    revenue: number;
    distanceKm: number;
    cargoDamage: number;
    xp: number;
  };
  cancelled: { penalty: number };
  refuel: { amount: number };
}

export interface Ets2Telemetry {
  mappingOpen: boolean;
  connected: boolean;
  sdkActive: boolean;
  paused: boolean;
  dllVersion: number;
  game: number;
  gameVersion: string;
  telemetryVersion: string;
  truck: TruckState;
  job: JobState;
  events: GameEvents;
  rawOk: boolean;
  errors: string[];
  readAt: number;
  meta?: Record<string, unknown>;
}

class Reader {
  off = 0;
  area = 0;
  truncated = false;

  constructor(private readonly b: Buffer) {}

  take(n: number): Buffer {
    if (this.off + n > this.b.length) {
      this.truncated = true;
      this.off = this.b.length;
      return Buffer.alloc(n);
    }
    const out = this.b.subarray(this.off, this.off + n);
    this.off += n;
    return out;
  }

  skip(n: number): void {
    this.take(n);
  }

  align4(): void {
    this.off += (-this.off) % 4;
  }

  bool(): boolean {
    return this.take(1)[0] !== 0;
  }

  u32(): number {
    this.align4();
    return this.take(4).readUInt32LE(0);
  }

  i32(): number {
    this.align4();
    return this.take(4).readInt32LE(0);
  }

  f32(): number {
    this.align4();
    return this.take(4).readFloatLE(0);
  }

  f64(): number {
    this.align4();
    return this.take(8).readDoubleLE(0);
  }

  u64(): number {
    return Number(this.take(8).readBigUInt64LE(0));
  }

  i64(): number {
    return Number(this.take(8).readBigInt64LE(0));
  }

  str(n: number): string {
    const raw = this.take(n);
    const zero = raw.indexOf(0);
    return (zero >= 0 ? raw.subarray(0, zero) : raw).toString('utf8').trim();
  }

  fvec(): { x: number; y: number; z: number } {
    return { x: this.f32(), y: this.f32(), z: this.f32() };
  }

  next(): void {
    this.area += 1;
    if (this.area < AREAS.length) this.off = AREAS[this.area]!;
  }
}

function emptyTruck(): TruckState {
  return {
    speedMs: 0,
    speedKmh: 0,
    rpm: 0,
    gear: 0,
    displayedGear: 0,
    fuelL: 0,
    fuelCapacityL: 0,
    fuelRatio: null,
    fuelRangeKm: 0,
    adblueRatio: null,
    damageMax: 0,
    odometerKm: 0,
    navDistanceM: 0,
    navTimeS: 0,
    speedLimitKmh: 0,
    parkingBrake: false,
    engineOn: false,
    warnings: {},
    world: { x: 0, y: 0, z: 0, heading: 0 },
    accelMag: 0,
  };
}

function emptyJob(): JobState {
  return {
    active: false,
    cargo: '',
    cargoMassKg: 0,
    cargoDamage: 0,
    sourceCity: '',
    sourceCompany: '',
    destinationCity: '',
    destinationCompany: '',
    plannedDistanceKm: 0,
    income: 0,
    remainingDistanceKm: 0,
  };
}

function emptyEvents(): GameEvents {
  return {
    special: {
      onJob: false,
      jobFinished: false,
      jobCancelled: false,
      jobDelivered: false,
      fined: false,
      tollgate: false,
      ferry: false,
      train: false,
      refuel: false,
      refuelPayed: false,
    },
    fine: { amount: 0, offence: '' },
    toll: { amount: 0 },
    ferry: { source: '', target: '', pay: 0 },
    train: { source: '', target: '', pay: 0 },
    delivery: { revenue: 0, distanceKm: 0, cargoDamage: 0, xp: 0 },
    cancelled: { penalty: 0 },
    refuel: { amount: 0 },
  };
}

export function parseTelemetry(data: Buffer): Ets2Telemetry {
  const t: Ets2Telemetry = {
    mappingOpen: true,
    connected: false,
    sdkActive: false,
    paused: false,
    dllVersion: 0,
    game: 0,
    gameVersion: '',
    telemetryVersion: '',
    truck: emptyTruck(),
    job: emptyJob(),
    events: emptyEvents(),
    rawOk: true,
    errors: [],
    readAt: Date.now(),
  };
  const r = new Reader(data);

  // zone 0
  t.sdkActive = r.bool();
  r.skip(3);
  t.paused = r.bool();
  r.skip(3);
  r.u64(); // timestamp
  r.u64(); // simulation
  r.u64(); // render
  r.i64(); // multiplayer offset
  r.next();

  // zone 1
  t.dllVersion = r.u32();
  const gvMajor = r.u32();
  const gvMinor = r.u32();
  t.game = r.u32();
  const tvMajor = r.u32();
  const tvMinor = r.u32();
  t.gameVersion = `${gvMajor}.${gvMinor}`;
  t.telemetryVersion = `${tvMajor}.${tvMinor}`;
  r.u32(); // game time
  r.u32(); // forward gear count
  r.u32(); // reverse gear count
  r.u32(); // retarder steps
  r.u32(); // wheel count
  r.u32(); // selector count
  const deliveryTime = r.u32();
  r.u32(); // max trailer count
  r.u32(); // cargo units
  const plannedDistanceKm = r.u32();
  r.u32(); // hshifter slot
  r.u32(); // retarder level
  r.u32(); // aux front
  r.u32(); // aux roof
  r.skip(16 * 4); // wheel substances
  r.skip(32 * 4); // slot handle positions
  r.skip(32 * 4); // slot selectors
  const jobDeliveryTime = r.u32();
  r.u32(); // job started
  r.u32(); // job finished
  r.next();

  // zone 2
  const nextRestStop = r.i32();
  const gear = r.i32();
  const displayedGear = r.i32();
  r.skip(32 * 4); // slot gears
  const earnedXp = r.i32();
  r.next();

  // zone 3: 193 floats (700..1472)
  const scale = r.f32();
  const fuelCapacityL = r.f32();
  r.f32(); // fuel warning factor
  const adblueCapacityL = r.f32();
  r.f32(); // adblue warning factor
  r.f32();
  r.f32();
  r.f32();
  r.f32();
  r.f32();
  r.f32(); // engine rpm max
  r.f32(); // differential ratio
  const cargoMassKg = r.f32();
  r.skip(16 * 4); // wheel radius
  r.skip(24 * 4); // forward gear ratios
  r.skip(8 * 4); // reverse gear ratios
  r.f32(); // cargo unit mass
  const speedMs = r.f32();
  const rpm = r.f32();
  r.f32();
  r.f32();
  r.f32();
  r.f32();
  r.f32();
  r.f32();
  r.f32();
  r.f32();
  r.f32(); // cruise control speed
  r.f32();
  r.f32();
  const fuelL = r.f32();
  r.f32(); // avg consumption
  const fuelRangeKm = r.f32();
  const adblueAmount = r.f32();
  r.f32();
  r.f32();
  r.f32();
  r.f32();
  r.f32(); // dashboard backlight
  const damageEngine = r.f32();
  const damageTransmission = r.f32();
  const damageCabin = r.f32();
  const damageChassis = r.f32();
  const damageWheels = r.f32();
  const odometerKm = r.f32();
  const navDistanceM = r.f32();
  const navTimeS = r.f32();
  const speedLimitMs = r.f32();
  r.skip(16 * 4 * 6); // susp, velocity, steering, rotation, lift, lift offset
  const deliveredCargoDamage = r.f32();
  const deliveredDistanceKm = r.f32();
  const refuelAmount = r.f32();
  const jobCargoDamage = r.f32();
  if (r.off !== 1472) {
    t.rawOk = false;
    t.errors.push(`zone3 offset ${r.off}, expected 1472`);
  }
  r.next();

  // zone 4: booleans
  r.skip(16 * 4); // steerable/simulated/powered/liftable
  const cargoLoaded = r.bool();
  const specialJob = r.bool();
  const parkingBrake = r.bool();
  r.bool(); // motor brake
  const warnAir = r.bool();
  const warnAirEmergency = r.bool();
  const warnFuel = r.bool();
  const warnAdblue = r.bool();
  const warnOil = r.bool();
  const warnWater = r.bool();
  const warnBattery = r.bool();
  const electricOn = r.bool();
  const engineOn = r.bool();
  r.bool(); // wipers
  r.bool();
  r.bool();
  r.bool();
  r.bool(); // blinkers
  r.skip(7); // lights
  r.bool(); // cruise
  r.skip(16); // wheels on ground
  r.skip(2); // hshifter selectors
  r.skip(5); // diff/lift/trailer
  const autoParked = r.bool();
  const autoLoaded = r.bool();
  if (r.off !== 1615) {
    t.rawOk = false;
    t.errors.push(`zone4 offset ${r.off}, expected 1615`);
  }
  r.next();

  // zone 5
  r.skip(3 * 4); // cabin position
  r.skip(3 * 4); // head position
  r.skip(3 * 4); // hook position
  r.skip(16 * 3 * 4); // wheel positions
  r.skip(3 * 4); // linear velocity
  r.skip(3 * 4); // angular velocity
  const accel = r.fvec();
  r.skip(3 * 4); // angular acceleration
  r.skip(3 * 4);
  r.skip(3 * 4);
  if (r.off !== 1940) {
    t.rawOk = false;
    t.errors.push(`zone5 offset ${r.off}, expected 1940`);
  }
  r.next();

  // zone 6
  r.skip(12 * 4);
  r.next();

  // zone 7: world placement (three doubles + three doubles orientation)
  const worldX = r.f64();
  const worldY = r.f64();
  const worldZ = r.f64();
  const heading = r.f64();
  r.skip(16);
  r.next();

  // zone 8: strings
  const brandId = r.str(64);
  const brand = r.str(64);
  r.str(64); // truck id
  const truckName = r.str(64);
  r.str(64); // cargo id
  const cargoName = r.str(64);
  r.str(64); // destination city id
  const destinationCity = r.str(64);
  r.str(64); // destination company id
  const destinationCompany = r.str(64);
  r.str(64); // source city id
  const sourceCity = r.str(64);
  r.str(64); // source company id
  const sourceCompany = r.str(64);
  r.str(16); // shifter type
  r.str(64); // license plate
  r.str(64); // license country id
  r.str(64); // license country
  r.str(32); // job market
  const fineOffence = r.str(32);
  const ferrySource = r.str(64);
  const ferryTarget = r.str(64);
  r.str(64);
  r.str(64);
  const trainSource = r.str(64);
  const trainTarget = r.str(64);
  r.str(64);
  r.str(64);
  if (r.off !== 3980) {
    t.rawOk = false;
    t.errors.push(`zone8 offset ${r.off}, expected 3980`);
  }
  r.next();

  // zone 9: income
  const income = r.u64();
  r.next();

  // zone 10: amounts
  const cancelledPenalty = r.i64();
  const deliveryRevenue = r.i64();
  const fineAmount = r.i64();
  const tollAmount = r.i64();
  const ferryPay = r.i64();
  const trainPay = r.i64();
  r.next();

  // zone 11: special events
  const onJob = r.bool();
  const jobFinished = r.bool();
  const jobCancelled = r.bool();
  const jobDelivered = r.bool();
  const fined = r.bool();
  const tollgate = r.bool();
  const ferry = r.bool();
  const train = r.bool();
  const refuel = r.bool();
  const refuelPayed = r.bool();
  r.next();

  // zone 12/13: substances/trailers are not needed
  if (r.truncated) {
    t.rawOk = false;
    t.errors.push('shared memory truncated');
  }

  const fuelRatio =
    fuelCapacityL > 0.01 ? Math.max(0, Math.min(1, fuelL / fuelCapacityL)) : null;
  const adblueRatio =
    adblueCapacityL > 0.01 ? Math.max(0, Math.min(1, adblueAmount / adblueCapacityL)) : null;
  const damageMax = Math.max(
    damageEngine, damageTransmission, damageCabin, damageChassis, damageWheels,
  );
  const jobActive =
    Boolean(destinationCity) &&
    Boolean(onJob || cargoLoaded || plannedDistanceKm > 0);

  t.truck = {
    speedMs,
    speedKmh: speedMs * 3.6,
    rpm,
    gear,
    displayedGear,
    fuelL,
    fuelCapacityL,
    fuelRatio,
    fuelRangeKm,
    adblueRatio,
    damageMax,
    odometerKm,
    navDistanceM,
    navTimeS,
    speedLimitKmh: speedLimitMs * 3.6,
    parkingBrake,
    engineOn,
    warnings: {
      airPressure: warnAir,
      airPressureEmergency: warnAirEmergency,
      fuel: warnFuel,
      adblue: warnAdblue,
      oilPressure: warnOil,
      waterTemperature: warnWater,
      battery: warnBattery,
    },
    world: { x: worldX, y: worldY, z: worldZ, heading },
    accelMag: Math.hypot(accel.x, accel.y, accel.z),
  };
  t.job = {
    active: jobActive,
    cargo: cargoName,
    cargoMassKg,
    cargoDamage: jobCargoDamage,
    sourceCity,
    sourceCompany,
    destinationCity,
    destinationCompany,
    plannedDistanceKm,
    income,
    remainingDistanceKm: Math.max(0, navDistanceM) / 1000,
  };
  t.events = {
    special: {
      onJob, jobFinished, jobCancelled, jobDelivered, fined, tollgate, ferry, train,
      refuel, refuelPayed,
    },
    fine: { amount: Math.abs(fineAmount), offence: fineOffence },
    toll: { amount: Math.abs(tollAmount) },
    ferry: { source: ferrySource, target: ferryTarget, pay: Math.abs(ferryPay) },
    train: { source: trainSource, target: trainTarget, pay: Math.abs(trainPay) },
    delivery: {
      revenue: deliveryRevenue,
      distanceKm: deliveredDistanceKm,
      cargoDamage: deliveredCargoDamage,
      xp: earnedXp,
    },
    cancelled: { penalty: Math.abs(cancelledPenalty) },
    refuel: { amount: refuelAmount },
  };
  // Metadata fields that are useful in tool output.
  t.meta = {
    brand, brandId, truckName, scale, nextRestStop, deliveryTime, jobDeliveryTime,
    autoParked, autoLoaded, electricOn,
  };
  t.connected = t.sdkActive && t.rawOk;
  return t;
}

/** A thin koffi wrapper around the game's named shared memory. */
export class ScsSharedMemory {
  private kernel32: ReturnType<typeof koffi.load> | null = null;
  private openFileMappingW:
    | ((access: number, inherit: number, name: string) => bigint | null)
    | null = null;
  private mapViewOfFile:
    | ((handle: bigint, access: number, hi: number, lo: number, size: number) => bigint | null)
    | null = null;
  private unmapViewOfFile: ((ptr: bigint) => number) | null = null;
  private closeHandle: ((handle: bigint) => number) | null = null;
  private handle: bigint | null = null;
  private view: bigint | null = null;
  name: string | null = null;
  lastError: string | null = null;

  constructor(private readonly names = ['Local\\SCSTelemetry', 'SCSTelemetry']) {}

  private init(): void {
    if (this.kernel32) return;
    this.kernel32 = koffi.load('kernel32.dll');
    const k = this.kernel32;
    this.openFileMappingW = k.func(
      'void *OpenFileMappingW(uint32_t access, int inherit, const char16_t *name)',
    );
    this.mapViewOfFile = k.func(
      'void *MapViewOfFile(void *handle, uint32_t access, uint32_t hi, uint32_t lo, size_t size)',
    );
    this.unmapViewOfFile = k.func('int UnmapViewOfFile(void *ptr)');
    this.closeHandle = k.func('int CloseHandle(void *handle)');
  }

  get open(): boolean {
    return this.view !== null;
  }

  connect(): boolean {
    if (this.open) return true;
    try {
      this.init();
    } catch (error) {
      this.lastError = error instanceof Error ? error.message : String(error);
      return false;
    }
    for (const name of this.names) {
      const handle = this.openFileMappingW?.(FILE_MAP_READ, 0, name);
      if (!handle) continue;
      const view = this.mapViewOfFile?.(handle, FILE_MAP_READ, 0, 0, MAP_SIZE);
      if (!view) {
        this.closeHandle?.(handle);
        continue;
      }
      this.handle = handle;
      this.view = view;
      this.name = name;
      this.lastError = null;
      return true;
    }
    this.lastError = 'SCSTelemetry shared memory not found';
    return false;
  }

  read(): Buffer | null {
    if (!this.view) return null;
    try {
      const bytes = koffi.decode(this.view, koffi.array('uint8_t', MAP_SIZE)) as Uint8Array;
      return Buffer.from(bytes);
    } catch (error) {
      this.lastError = error instanceof Error ? error.message : String(error);
      this.close();
      return null;
    }
  }

  close(): void {
    if (this.view && this.unmapViewOfFile) this.unmapViewOfFile(this.view);
    if (this.handle && this.closeHandle) this.closeHandle(this.handle);
    this.view = null;
    this.handle = null;
    this.name = null;
  }
}
