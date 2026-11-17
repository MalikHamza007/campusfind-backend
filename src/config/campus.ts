import { env } from './env';

export interface Landmark {
  name: string;
  lat: number;
  lng: number;
  type: string;
}

/** Cached campus landmarks — always selectable, even when Nominatim is unavailable. */
export const CAMPUS_LANDMARKS: Landmark[] = [
  { name: 'Main Library', lat: 31.5212, lng: 74.3521, type: 'library' },
  { name: 'IT Lab 03', lat: 31.5198, lng: 74.3488, type: 'lab' },
  { name: 'Cafeteria', lat: 31.5181, lng: 74.3542, type: 'cafe' },
  { name: 'Auditorium', lat: 31.5226, lng: 74.3497, type: 'hall' },
  { name: 'Admin Block', lat: 31.5205, lng: 74.3560, type: 'office' },
  { name: 'Sports Complex', lat: 31.5163, lng: 74.3475, type: 'sports' },
  { name: 'Parking Area', lat: 31.5240, lng: 74.3569, type: 'parking' },
  { name: 'Engineering Block', lat: 31.5189, lng: 74.3510, type: 'faculty' },
];

export const CAMPUS_CENTER = { lat: 31.5203, lng: 74.3520 };

export function insideCampus(lat: number, lng: number): boolean {
  const b = env.campusBounds;
  return lat >= b.minLat && lat <= b.maxLat && lng >= b.minLng && lng <= b.maxLng;
}
