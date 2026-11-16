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

// Nigerian geopolitical zones with approximate demonstration polygons.
// Polygons are schematic (for map display only) and do not represent
// official administrative boundaries.
export const DISTRICT_BOUNDARIES: GisDistrict[] = [
  {
    id: 'dist-01',
    name: 'North Central Zone',
    region: 'North Central',
    country: 'Nigeria',
    population: 28500000,
    healthZone: 'Zone A - High Priority',
    center: [7.8, 9.0],
    coordinates: [
      [
        [6.5, 10.2],
        [9.5, 10.2],
        [9.5, 7.8],
        [6.5, 7.8],
        [6.5, 10.2],
      ],
    ],
    facilities: ['F001', 'F002', 'F009', 'F012'],
  },
  {
    id: 'dist-02',
    name: 'South West Zone',
    region: 'South West',
    country: 'Nigeria',
    population: 41000000,
    healthZone: 'Zone B - Supply Buffer',
    center: [4.5, 7.0],
    coordinates: [
      [
        [2.5, 8.2],
        [6.5, 8.2],
        [6.5, 5.8],
        [2.5, 5.8],
        [2.5, 8.2],
      ],
    ],
    facilities: ['F003', 'F004'],
  },
  {
    id: 'dist-03',
    name: 'South East Zone',
    region: 'South East',
    country: 'Nigeria',
    population: 17000000,
    healthZone: 'Zone C - Regional Hub',
    center: [7.0, 6.2],
    coordinates: [
      [
        [6.2, 7.0],
        [8.2, 7.0],
        [8.2, 5.4],
        [6.2, 5.4],
        [6.2, 7.0],
      ],
    ],
    facilities: ['F005'],
  },
  {
    id: 'dist-04',
    name: 'South South Zone',
    region: 'South South',
    country: 'Nigeria',
    population: 26000000,
    healthZone: 'Zone D - Vulnerable Basin',
    center: [6.5, 5.0],
    coordinates: [
      [
        [4.5, 6.0],
        [8.8, 6.0],
        [8.8, 4.2],
        [4.5, 4.2],
        [4.5, 6.0],
      ],
    ],
    facilities: ['F006', 'F010', 'F011'],
  },
  {
    id: 'dist-05',
    name: 'North West Zone',
    region: 'North West',
    country: 'Nigeria',
    population: 35000000,
    healthZone: 'Zone E - Mountain Access',
    center: [8.0, 11.5],
    coordinates: [
      [
        [5.5, 13.2],
        [10.5, 13.2],
        [10.5, 9.8],
        [5.5, 9.8],
        [5.5, 13.2],
      ],
    ],
    facilities: ['F007', 'F008'],
  },
];

// Approximate city coordinates [lng, lat] for the named hospitals.
export const FACILITY_COORDINATES: Record<string, [number, number]> = {
  F001: [7.495, 9.057], // National Hospital Abuja
  F002: [7.08, 8.94], // University of Abuja Teaching Hospital, Gwagwalada
  F003: [3.36, 6.45], // Lagos University Teaching Hospital, Idi-Araba
  F004: [3.91, 7.4], // University College Hospital Ibadan
  F005: [7.5, 6.45], // University of Nigeria Teaching Hospital, Ituku-Ozalla
  F006: [5.61, 6.33], // University of Benin Teaching Hospital
  F007: [8.52, 12.0], // Aminu Kano University Teaching Hospital
  F008: [7.71, 11.07], // Ahmadu Bello University Teaching Hospital, Zaria
  F009: [8.89, 9.93], // Jos University Teaching Hospital
  F010: [8.32, 4.95], // University of Calabar Teaching Hospital
  F011: [7.01, 4.85], // University of Port Harcourt Teaching Hospital
  F012: [7.49, 9.06], // Federal Medical Centre Abuja
};
