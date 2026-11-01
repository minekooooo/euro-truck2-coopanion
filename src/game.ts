/** SCS telemetry game ids: ETS2 = 1, ATS = 2. */
export type GameKind = 'ets2' | 'ats';

export function gameKind(game: number): GameKind {
  return game === 2 ? 'ats' : 'ets2';
}

export function gameShort(kind: GameKind): string {
  return kind === 'ats' ? 'ATS' : 'ETS2';
}

export function gameTitle(kind: GameKind): string {
  return kind === 'ats' ? '美国卡车模拟' : '欧洲卡车模拟 2';
}

export function gameRegion(kind: GameKind): string {
  return kind === 'ats' ? '州' : '国家';
}
