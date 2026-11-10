export interface GisDistrict {
  id: string;
  name: string;
  region: string;
  country: string;
  population: number;
  healthZone: string;
  center: [number, number]; // [lng, lat]
  coordinates: [number, number][][]; // Polygon rings
  facilities: string[];
}

export interface GisFacilityPoint {
  id: string;
  external_id: string;
  name: string;
  type: string;
  district: string;
  region: string;
  country: string;
  coordinates: [number, number]; // [lng, lat]
  riskLevel?: 'Critical' | 'Elevated' | 'Stable';
  daysOfStock?: number;
  criticalMedicines?: string[];
}

export interface GisTransferRoute {
  id: string;
  donorFacility: string;
  donorName: string;
  recipientFacility: string;
  recipientName: string;
  productName: string;
  quantity: number;
  unit: string;
  urgency: 'High' | 'Medium';
  fromCoord: [number, number];
  toCoord: [number, number];
}

export const DISTRICT_BOUNDARIES: GisDistrict[] = [
  {
    id: 'dist-01',
    name: 'Mtoni North District',
    region: 'Northern Zone',
    country: 'Kijani Republic',
    population: 285000,
    healthZone: 'Zone A - High Priority',
    center: [36.68, -3.37],
    coordinates: [
      [
        [36.50, -3.20],
        [36.85, -3.20],
        [36.90, -3.50],
        [36.55, -3.55],
        [36.50, -3.20],
      ],
    ],
    facilities: ['FAC-001', 'FAC-004'],
  },
  {
    id: 'dist-02',
    name: 'Kijiji Central District',
    region: 'Central Zone',
    country: 'Kijani Republic',
    population: 410000,
    healthZone: 'Zone B - Supply Buffer',
    center: [35.75, -6.17],
    coordinates: [
      [
        [35.50, -5.95],
        [36.00, -5.95],
        [36.05, -6.40],
        [35.55, -6.40],
        [35.50, -5.95],
      ],
    ],
    facilities: ['FAC-002', 'FAC-005', 'FAC-006'],
  },
  {
    id: 'dist-03',
    name: 'Nyota Coastal District',
    region: 'Coastal Zone',
    country: 'Kijani Republic',
    population: 530000,
    healthZone: 'Zone C - Regional Hub',
    center: [39.20, -6.80],
    coordinates: [
      [
        [38.90, -6.50],
        [39.50, -6.50],
        [39.45, -7.10],
        [38.85, -7.05],
        [38.90, -6.50],
      ],
    ],
    facilities: ['FAC-003', 'FAC-007'],
  },
  {
    id: 'dist-04',
    name: 'Baraka Western District',
    region: 'Lake Victoria Basin',
    country: 'Umoja Federation',
    population: 340000,
    healthZone: 'Zone D - Vulnerable Basin',
    center: [32.90, -2.52],
    coordinates: [
      [
        [32.60, -2.25],
        [33.25, -2.25],
        [33.20, -2.85],
        [32.55, -2.80],
        [32.60, -2.25],
      ],
    ],
    facilities: ['FAC-008', 'FAC-009'],
  },
  {
    id: 'dist-05',
    name: 'Tumaini Southern District',
    region: 'Southern Highlands',
    country: 'Umoja Federation',
    population: 295000,
    healthZone: 'Zone E - Mountain Access',
    center: [34.70, -8.85],
    coordinates: [
      [
        [34.30, -8.50],
        [35.10, -8.50],
        [35.05, -9.20],
        [34.35, -9.15],
        [34.30, -8.50],
      ],
    ],
    facilities: ['FAC-010', 'FAC-011', 'FAC-012'],
  },
];

export const FACILITY_COORDINATES: Record<string, [number, number]> = {
  'FAC-001': [36.68, -3.37], // Mtoni Clinic
  'FAC-002': [35.75, -6.17], // Kijiji Clinic
  'FAC-003': [39.20, -6.80], // Nyota Health Centre
  'FAC-004': [36.72, -3.42], // Baraka District Hospital
  'FAC-005': [35.70, -6.22], // Ushindi Dispensary
  'FAC-006': [35.80, -6.12], // Amani Health Centre
  'FAC-007': [39.15, -6.75], // Pwani Regional Hospital
  'FAC-008': [32.90, -2.52], // Imani Health Centre
  'FAC-009': [32.95, -2.48], // Tumaini Referral Hospital
  'FAC-010': [34.70, -8.85], // Neema Dispensary
  'FAC-011': [34.75, -8.80], // Faraja Health Post
  'FAC-012': [34.65, -8.90], // Upendo Clinic
};
