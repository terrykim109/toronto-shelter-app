export function getDistance(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const toRad = (val: number) => (val * Math.PI) / 180;
  const R = 6371;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

export function formatCapacity(shelter: {
  CAPACITY_ACTUAL_ROOM?: string | number | null;
  OCCUPIED_ROOMS?: string | number | null;
  CAPACITY_ACTUAL_BED?: string | number | null;
  OCCUPIED_BEDS?: string | number | null;
}): string {
  const roomCap = parseInt(String(shelter.CAPACITY_ACTUAL_ROOM ?? ""), 10);
  const roomOcc = parseInt(String(shelter.OCCUPIED_ROOMS ?? ""), 10);
  if (!Number.isNaN(roomCap) && roomCap > 0) {
    return `Rooms ${roomOcc || 0}/${roomCap}`;
  }

  const bedCap = parseInt(String(shelter.CAPACITY_ACTUAL_BED ?? ""), 10);
  const bedOcc = parseInt(String(shelter.OCCUPIED_BEDS ?? ""), 10);
  if (!Number.isNaN(bedCap) && bedCap > 0) {
    return `Beds ${bedOcc || 0}/${bedCap}`;
  }

  return "Capacity unavailable";
}
