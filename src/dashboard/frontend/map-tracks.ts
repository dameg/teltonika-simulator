export function visibleTrackImeis(positions: readonly { imei: string }[], selectedImei: string): string[] {
  return selectedImei ? [selectedImei] : [...new Set(positions.map((position) => position.imei))];
}
