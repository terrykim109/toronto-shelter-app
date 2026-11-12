// Imports TypeScript directly; requires Node's type stripping
// (--experimental-strip-types on Node 22.6–22.17, on by default afterwards).
import test from "node:test";
import assert from "node:assert/strict";
import {
  findNearest,
  formatCapacity,
  getDistance,
} from "../client/src/utils/geo.ts";

const CN_TOWER = { lat: 43.6426, lon: -79.3871 };
const OTTAWA_PARLIAMENT = { lat: 45.4236, lon: -75.7009 };

test("getDistance is zero for identical points and symmetric", () => {
  assert.equal(getDistance(CN_TOWER.lat, CN_TOWER.lon, CN_TOWER.lat, CN_TOWER.lon), 0);
  const there = getDistance(CN_TOWER.lat, CN_TOWER.lon, OTTAWA_PARLIAMENT.lat, OTTAWA_PARLIAMENT.lon);
  const back = getDistance(OTTAWA_PARLIAMENT.lat, OTTAWA_PARLIAMENT.lon, CN_TOWER.lat, CN_TOWER.lon);
  assert.equal(there, back);
});

test("getDistance returns great-circle kilometres (Toronto to Ottawa is about 350 km)", () => {
  const km = getDistance(CN_TOWER.lat, CN_TOWER.lon, OTTAWA_PARLIAMENT.lat, OTTAWA_PARLIAMENT.lon);
  assert.ok(km > 345 && km < 360, `got ${km}`);
});

test("findNearest picks the closest place and skips places without coordinates", () => {
  const places = [
    { name: "unmapped", lat: null, lon: null },
    { name: "far", lat: 43.8, lon: -79.2 },
    { name: "near", lat: 43.645, lon: -79.39 },
  ];
  const nearest = findNearest(CN_TOWER, places);
  assert.equal(nearest?.place.name, "near");
  assert.ok(nearest.distanceKm < 1);
});

test("findNearest keeps the first of equally distant places", () => {
  const places = [
    { name: "first", lat: 43.65, lon: -79.38 },
    { name: "second", lat: 43.65, lon: -79.38 },
  ];
  assert.equal(findNearest(CN_TOWER, places)?.place.name, "first");
});

test("findNearest returns null when no place has coordinates", () => {
  assert.equal(findNearest(CN_TOWER, []), null);
  assert.equal(findNearest(CN_TOWER, [{ lat: null, lon: null }]), null);
});

test("formatCapacity reports rooms for room-based programs and beds otherwise", () => {
  assert.equal(formatCapacity({ CAPACITY_ACTUAL_ROOM: "40", OCCUPIED_ROOMS: "38" }), "Rooms 38/40");
  assert.equal(formatCapacity({ CAPACITY_ACTUAL_ROOM: null, CAPACITY_ACTUAL_BED: 12, OCCUPIED_BEDS: 9 }), "Beds 9/12");
});

test("formatCapacity treats missing occupancy as zero and missing capacity as unavailable", () => {
  assert.equal(formatCapacity({ CAPACITY_ACTUAL_BED: 12, OCCUPIED_BEDS: null }), "Beds 0/12");
  assert.equal(formatCapacity({}), "Capacity unavailable");
});
