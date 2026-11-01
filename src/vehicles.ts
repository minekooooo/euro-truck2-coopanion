/** Truck-brand display names used by the first-drive welcome. */
const BRANDS: Array<[string, string]> = [
  ['scania', '斯堪尼亚'],
  ['volvo', '沃尔沃'],
  ['mercedes-benz', '梅赛德斯-奔驰'],
  ['mercedes', '梅赛德斯-奔驰'],
  ['man', '曼恩'],
  ['daf', '达夫'],
  ['renault', '雷诺'],
  ['iveco', '依维柯'],
  ['peterbilt', '彼得比尔特'],
  ['kenworth', '肯沃斯'],
  ['freightliner', '福莱纳'],
  ['western star', '西星'],
  ['westernstar', '西星'],
  ['international', '国际'],
  ['mack', '马克'],
  ['tesla', '特斯拉'],
];

export function vehicleBrandName(brand: string, truckName = ''): string {
  const raw = brand.trim();
  const normalized = raw.toLowerCase().replace(/_/g, ' ').replace(/\s+/g, ' ');
  if (normalized) {
    for (const [key, zh] of BRANDS) {
      if (normalized === key || normalized.startsWith(`${key} `) || normalized.includes(key)) {
        return zh;
      }
    }
  }
  return raw || truckName.trim() || '这辆车';
}

export function vehicleIdentity(brand: string, truckName: string, truckId: string): string {
  const id = truckId.trim();
  if (id) return id;
  return `${brand.trim().toLowerCase()}|${truckName.trim().toLowerCase()}`;
}
