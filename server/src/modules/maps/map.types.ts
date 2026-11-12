import { MapProviderType, MapMarkerDto, MapConfigDto } from '@kerala-tourism/shared-types';

export interface MapCoordinate {
  latitude: number;
  longitude: number;
}

export interface IMapProvider {
  getProviderName(): MapProviderType;
  getPublicClientConfig(): MapConfigDto;
  formatMarker(destination: {
    id: string;
    name: string;
    slug: string;
    location: { coordinates: [number, number] };
    district: string;
    locality?: string;
    categoryIds?: string[];
    images?: string[];
  }, distanceKm?: number): MapMarkerDto;
  generateStaticMapUrl(center: MapCoordinate, zoom?: number, markers?: MapCoordinate[]): string;
}

export type { MapProviderType, MapMarkerDto, MapConfigDto };
