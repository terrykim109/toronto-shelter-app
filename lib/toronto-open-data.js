const https = require("https");

// "Daily Shelter & Overnight Service Occupancy & Capacity" on open.toronto.ca.
const OCCUPANCY_PACKAGE_ID = "21c83b32-d5a8-4106-a54f-010dbe49f6f2";
const CKAN_PACKAGE_URL = `https://ckan0.cf.opendata.inter.prod-toronto.ca/api/3/action/package_show?id=${OCCUPANCY_PACKAGE_ID}`;
const COOLING_CENTRES_URL =
  "https://gis.toronto.ca/arcgis/rest/services/cot_geospatial10/FeatureServer/3/query?where=1%3D1&outFields=PLACE_NAME,ADDRESS_NUMBER,LINEAR_NAME_FULL,POSTAL_CODE,LATITUDE,LONGITUDE,OBJECTID&returnGeometry=false&outSR=4326&f=json&resultRecordCount=2000";

function getJson(url) {
  return new Promise((resolve, reject) => {
    https
      .get(url, (res) => {
        const chunks = [];
        res.on("data", (chunk) => chunks.push(chunk));
        res.on("end", () => {
          try {
            resolve(JSON.parse(Buffer.concat(chunks).toString()));
          } catch (err) {
            reject(err);
          }
        });
        res.on("error", reject);
      })
      .on("error", reject);
  });
}

/**
 * Downloads the current-year occupancy file: one record per program per night,
 * for every night since January 1. The first JSON resource in the package is
 * the current year; later ones are prior-year archives.
 */
async function fetchOccupancyRecords() {
  const pkg = (await getJson(CKAN_PACKAGE_URL)).result;
  const resource = pkg.resources.find((r) => r.format === "JSON");
  if (!resource) {
    throw new Error("Shelter JSON resource not found.");
  }
  return getJson(resource.url);
}

/** Returns the raw ArcGIS query payload ({ features: [{ attributes }] }). */
function fetchCoolingCentres() {
  return getJson(COOLING_CENTRES_URL);
}

module.exports = {
  OCCUPANCY_PACKAGE_ID,
  COOLING_CENTRES_URL,
  getJson,
  fetchOccupancyRecords,
  fetchCoolingCentres,
};
