/**
 * Seeded course library: well-known races with published distance and
 * elevation figures, plus typical race-day conditions and signature climbs.
 * This ships in the bundle so course search works offline. A scraped or
 * community-maintained database (the "top 1000 races" idea) would replace
 * this file behind the same interface once the app has a backend worth
 * maintaining it in.
 */

export interface LibraryCourse {
  name: string;
  location: string;
  distanceMi: number;
  elevationGainFt: number;
  typicalTempF: number;
  typicalHumidityPct: number;
  month: string;
  keyFeatures: { mile: number; label: string }[];
}

export const COURSE_LIBRARY: LibraryCourse[] = [
  {
    name: 'Boston Marathon', location: 'Boston, MA', distanceMi: 26.2, elevationGainFt: 815,
    typicalTempF: 52, typicalHumidityPct: 60, month: 'April',
    keyFeatures: [
      { mile: 17, label: 'Newton hills begin' },
      { mile: 20, label: 'Heartbreak Hill' },
    ],
  },
  {
    name: 'NYC Marathon', location: 'New York, NY', distanceMi: 26.2, elevationGainFt: 810,
    typicalTempF: 52, typicalHumidityPct: 58, month: 'November',
    keyFeatures: [
      { mile: 1, label: 'Verrazzano Bridge' },
      { mile: 15, label: 'Queensboro Bridge' },
      { mile: 23, label: 'Fifth Avenue climb' },
    ],
  },
  {
    name: 'Chicago Marathon', location: 'Chicago, IL', distanceMi: 26.2, elevationGainFt: 243,
    typicalTempF: 55, typicalHumidityPct: 62, month: 'October',
    keyFeatures: [{ mile: 26, label: 'Roosevelt Road rise' }],
  },
  {
    name: 'Berlin Marathon', location: 'Berlin, Germany', distanceMi: 26.2, elevationGainFt: 240,
    typicalTempF: 57, typicalHumidityPct: 70, month: 'September', keyFeatures: [],
  },
  {
    name: 'London Marathon', location: 'London, UK', distanceMi: 26.2, elevationGainFt: 400,
    typicalTempF: 52, typicalHumidityPct: 70, month: 'April', keyFeatures: [],
  },
  {
    name: 'Tokyo Marathon', location: 'Tokyo, Japan', distanceMi: 26.2, elevationGainFt: 300,
    typicalTempF: 48, typicalHumidityPct: 55, month: 'March', keyFeatures: [],
  },
  {
    name: 'Marine Corps Marathon', location: 'Washington, DC', distanceMi: 26.2, elevationGainFt: 690,
    typicalTempF: 55, typicalHumidityPct: 65, month: 'October',
    keyFeatures: [{ mile: 8, label: 'Rock Creek climb' }, { mile: 26, label: 'Iwo Jima hill finish' }],
  },
  {
    name: 'Philadelphia Marathon', location: 'Philadelphia, PA', distanceMi: 26.2, elevationGainFt: 520,
    typicalTempF: 45, typicalHumidityPct: 60, month: 'November',
    keyFeatures: [{ mile: 10, label: 'Fairmount Park hills' }],
  },
  {
    name: 'Grandmas Marathon', location: 'Duluth, MN', distanceMi: 26.2, elevationGainFt: 300,
    typicalTempF: 60, typicalHumidityPct: 75, month: 'June',
    keyFeatures: [{ mile: 22, label: 'Lemon Drop Hill' }],
  },
  {
    name: 'California International Marathon', location: 'Sacramento, CA', distanceMi: 26.2, elevationGainFt: 350,
    typicalTempF: 45, typicalHumidityPct: 70, month: 'December',
    keyFeatures: [{ mile: 13, label: 'Rolling descent flattens' }],
  },
  {
    name: 'Big Sur Marathon', location: 'Big Sur, CA', distanceMi: 26.2, elevationGainFt: 2100,
    typicalTempF: 54, typicalHumidityPct: 75, month: 'April',
    keyFeatures: [{ mile: 10, label: 'Hurricane Point (2 mi climb)' }],
  },
  {
    name: 'Brooklyn Half', location: 'Brooklyn, NY', distanceMi: 13.1, elevationGainFt: 220,
    typicalTempF: 62, typicalHumidityPct: 68, month: 'May',
    keyFeatures: [{ mile: 4, label: 'Prospect Park hill' }],
  },
  {
    name: 'NYC Half', location: 'New York, NY', distanceMi: 13.1, elevationGainFt: 350,
    typicalTempF: 45, typicalHumidityPct: 55, month: 'March',
    keyFeatures: [{ mile: 7, label: 'Times Square rise' }],
  },
  {
    name: 'Rock n Roll DC Half', location: 'Washington, DC', distanceMi: 13.1, elevationGainFt: 400,
    typicalTempF: 50, typicalHumidityPct: 60, month: 'March',
    keyFeatures: [{ mile: 6, label: 'Calvert Street hill' }],
  },
  {
    name: 'Houston Half', location: 'Houston, TX', distanceMi: 13.1, elevationGainFt: 120,
    typicalTempF: 50, typicalHumidityPct: 80, month: 'January', keyFeatures: [],
  },
  {
    name: 'Cherry Blossom 10 Mile', location: 'Washington, DC', distanceMi: 10, elevationGainFt: 190,
    typicalTempF: 52, typicalHumidityPct: 60, month: 'April', keyFeatures: [],
  },
  {
    name: 'Broad Street Run', location: 'Philadelphia, PA', distanceMi: 10, elevationGainFt: 60,
    typicalTempF: 58, typicalHumidityPct: 62, month: 'May', keyFeatures: [],
  },
  {
    name: 'Peachtree Road Race 10K', location: 'Atlanta, GA', distanceMi: 6.2, elevationGainFt: 340,
    typicalTempF: 75, typicalHumidityPct: 80, month: 'July',
    keyFeatures: [{ mile: 3, label: 'Cardiac Hill' }],
  },
  {
    name: 'Bolder Boulder 10K', location: 'Boulder, CO', distanceMi: 6.2, elevationGainFt: 300,
    typicalTempF: 60, typicalHumidityPct: 45, month: 'May',
    keyFeatures: [{ mile: 4, label: 'Folsom climb (altitude: 5,300 ft)' }],
  },
  {
    name: 'Cooper River Bridge Run 10K', location: 'Charleston, SC', distanceMi: 6.2, elevationGainFt: 200,
    typicalTempF: 62, typicalHumidityPct: 78, month: 'April',
    keyFeatures: [{ mile: 2, label: 'Ravenel Bridge' }],
  },
  {
    name: 'Carlsbad 5000', location: 'Carlsbad, CA', distanceMi: 3.1, elevationGainFt: 80,
    typicalTempF: 62, typicalHumidityPct: 70, month: 'April', keyFeatures: [],
  },
  {
    name: 'Falmouth Road Race', location: 'Falmouth, MA', distanceMi: 7, elevationGainFt: 220,
    typicalTempF: 72, typicalHumidityPct: 80, month: 'August',
    keyFeatures: [{ mile: 7, label: 'Final hill to the finish' }],
  },
];

export function searchCourses(query: string): LibraryCourse[] {
  const q = query.trim().toLowerCase();
  if (!q) return COURSE_LIBRARY;
  return COURSE_LIBRARY.filter(
    (c) => c.name.toLowerCase().includes(q) || c.location.toLowerCase().includes(q),
  );
}
