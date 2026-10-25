export type Shelter = {
  LOCATION_ID?: string | number;
  LOCATION_NAME: string;
  PROGRAM_NAME?: string;
  LOCATION_ADDRESS?: string;
  LOCATION_POSTAL_CODE?: string;
  CAPACITY_ACTUAL_ROOM?: string | number | null;
  OCCUPIED_ROOMS?: string | number | null;
  CAPACITY_ACTUAL_BED?: string | number | null;
  OCCUPIED_BEDS?: string | number | null;
  PROGRAM_AREA?: string;
  OCCUPANCY_DATE?: string;
  SECTOR?: string;
  lat: number | null;
  lon: number | null;
  fsa?: string | null;
};

export type GeocodeResult = {
  fsa: string;
  lat: number;
  lon: number;
  name?: string;
};