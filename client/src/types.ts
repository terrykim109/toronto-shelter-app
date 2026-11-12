export type ShelterAccess = "walk-in" | "referral" | "mixed" | "unknown";

export type ShelterProfile = {
  locationId: string;
  name: string;
  phone: string | null;
  website: string | null;
  whoServed: string | null;
  access: ShelterAccess;
  intakeNotes: string | null;
  requirements: string[];
  transit: string | null;
  summary: string | null;
  confidence: "high" | "medium" | "low";
  sources: string[];
  lastReviewed: string;
};

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
  OVERNIGHT_SERVICE_TYPE?: string;
  lat: number | null;
  lon: number | null;
  fsa?: string | null;
  profile?: ShelterProfile | null;
};

export type GeocodeResult = {
  fsa: string;
  lat: number;
  lon: number;
  name?: string;
};

export type SupportSite = {
  id: string;
  name: string;
  address: string | null;
  postalCode: string | null;
  type: string;
  category: "overnight" | "cooling";
  sector?: string | null;
  programName?: string | null;
  occupancyDate?: string | null;
  available: boolean;
  lat: number | null;
  lon: number | null;
  fsa?: string | null;
  CAPACITY_ACTUAL_ROOM?: string | number | null;
  OCCUPIED_ROOMS?: string | number | null;
  CAPACITY_ACTUAL_BED?: string | number | null;
  OCCUPIED_BEDS?: string | number | null;
};

export type SupportSitesResponse = {
  overnight: SupportSite[];
  cooling: SupportSite[];
};