import {
  IMapProvider,
  MapProviderType,
  MapCoordinate,
  MapMarkerDto,
  MapConfigDto,
} from './map.types';
import { GEOSPATIAL_RULES, MAP_CONFIG } from '@kerala-tourism/constants';

/**
 * OpenStreetMap Provider (Default, Open Source, Zero API Key Requirement)
 */
export class OpenStreetMapProvider implements IMapProvider {
  public getProviderName(): MapProviderType {
    return 'osm';
  }

  public getPublicClientConfig(): MapConfigDto {
    return {
      provider: 'osm',
      defaultCenter: {
        latitude: MAP_CONFIG.DEFAULT_CENTER.latitude,
        longitude: MAP_CONFIG.DEFAULT_CENTER.longitude,
      },
      defaultZoom: MAP_CONFIG.DEFAULT_ZOOM,
      bounds: {
        minLatitude: GEOSPATIAL_RULES.KERALA_BOUNDS.MIN_LATITUDE,
        maxLatitude: GEOSPATIAL_RULES.KERALA_BOUNDS.MAX_LATITUDE,
        minLongitude: GEOSPATIAL_RULES.KERALA_BOUNDS.MIN_LONGITUDE,
        maxLongitude: GEOSPATIAL_RULES.KERALA_BOUNDS.MAX_LONGITUDE,
      },
      tileLayerUrl: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
    };
  }

  public formatMarker(
    destination: {
      id: string;
      name: string;
      slug: string;
      location: { coordinates: [number, number] };
      district: string;
      locality?: string;
      categoryIds?: string[];
      images?: string[];
    },
    distanceKm?: number,
  ): MapMarkerDto {
    const [longitude, latitude] = destination.location.coordinates;
    return {
      id: destination.id,
      name: destination.name,
      slug: destination.slug,
      coordinate: { latitude, longitude },
      district: destination.district,
      locality: destination.locality,
      categoryIds: destination.categoryIds,
      primaryImage: destination.images && destination.images.length > 0 ? destination.images[0] : undefined,
      distanceKm,
      markerType: 'destination',
    };
  }

  public generateStaticMapUrl(center: MapCoordinate, zoom = 12): string {
    return `https://staticmap.openstreetmap.de/staticmap.php?center=${center.latitude},${center.longitude}&zoom=${zoom}&size=600x300&maptype=mapnik`;
  }
}

/**
 * Google Maps Provider
 */
export class GoogleMapsProvider implements IMapProvider {
  constructor(private readonly apiKey: string = process.env.GOOGLE_MAPS_API_KEY || '') {}

  public getProviderName(): MapProviderType {
    return 'google';
  }

  public getPublicClientConfig(): MapConfigDto {
    return {
      provider: 'google',
      defaultCenter: {
        latitude: MAP_CONFIG.DEFAULT_CENTER.latitude,
        longitude: MAP_CONFIG.DEFAULT_CENTER.longitude,
      },
      defaultZoom: MAP_CONFIG.DEFAULT_ZOOM,
      bounds: {
        minLatitude: GEOSPATIAL_RULES.KERALA_BOUNDS.MIN_LATITUDE,
        maxLatitude: GEOSPATIAL_RULES.KERALA_BOUNDS.MAX_LATITUDE,
        minLongitude: GEOSPATIAL_RULES.KERALA_BOUNDS.MIN_LONGITUDE,
        maxLongitude: GEOSPATIAL_RULES.KERALA_BOUNDS.MAX_LONGITUDE,
      },
      // Never expose private server API keys!
    };
  }

  public formatMarker(
    destination: {
      id: string;
      name: string;
      slug: string;
      location: { coordinates: [number, number] };
      district: string;
      locality?: string;
      categoryIds?: string[];
      images?: string[];
    },
    distanceKm?: number,
  ): MapMarkerDto {
    const [longitude, latitude] = destination.location.coordinates;
    return {
      id: destination.id,
      name: destination.name,
      slug: destination.slug,
      coordinate: { latitude, longitude },
      district: destination.district,
      locality: destination.locality,
      categoryIds: destination.categoryIds,
      primaryImage: destination.images && destination.images.length > 0 ? destination.images[0] : undefined,
      distanceKm,
      markerType: 'destination',
    };
  }

  public generateStaticMapUrl(center: MapCoordinate, zoom = 12): string {
    const base = 'https://maps.googleapis.com/maps/api/staticmap';
    const params = `center=${center.latitude},${center.longitude}&zoom=${zoom}&size=600x300&scale=2`;
    return this.apiKey ? `${base}?${params}&key=${this.apiKey}` : `${base}?${params}`;
  }
}

/**
 * Mapbox Provider
 */
export class MapboxProvider implements IMapProvider {
  constructor(private readonly publicToken: string = process.env.MAPBOX_PUBLIC_TOKEN || '') {}

  public getProviderName(): MapProviderType {
    return 'mapbox';
  }

  public getPublicClientConfig(): MapConfigDto {
    return {
      provider: 'mapbox',
      defaultCenter: {
        latitude: MAP_CONFIG.DEFAULT_CENTER.latitude,
        longitude: MAP_CONFIG.DEFAULT_CENTER.longitude,
      },
      defaultZoom: MAP_CONFIG.DEFAULT_ZOOM,
      bounds: {
        minLatitude: GEOSPATIAL_RULES.KERALA_BOUNDS.MIN_LATITUDE,
        maxLatitude: GEOSPATIAL_RULES.KERALA_BOUNDS.MAX_LATITUDE,
        minLongitude: GEOSPATIAL_RULES.KERALA_BOUNDS.MIN_LONGITUDE,
        maxLongitude: GEOSPATIAL_RULES.KERALA_BOUNDS.MAX_LONGITUDE,
      },
      tileLayerUrl: this.publicToken
        ? `https://api.mapbox.com/styles/v1/mapbox/streets-v11/tiles/{z}/{x}/{y}?access_token=${this.publicToken}`
        : undefined,
    };
  }

  public formatMarker(
    destination: {
      id: string;
      name: string;
      slug: string;
      location: { coordinates: [number, number] };
      district: string;
      locality?: string;
      categoryIds?: string[];
      images?: string[];
    },
    distanceKm?: number,
  ): MapMarkerDto {
    const [longitude, latitude] = destination.location.coordinates;
    return {
      id: destination.id,
      name: destination.name,
      slug: destination.slug,
      coordinate: { latitude, longitude },
      district: destination.district,
      locality: destination.locality,
      categoryIds: destination.categoryIds,
      primaryImage: destination.images && destination.images.length > 0 ? destination.images[0] : undefined,
      distanceKm,
      markerType: 'destination',
    };
  }

  public generateStaticMapUrl(center: MapCoordinate, zoom = 12): string {
    return `https://api.mapbox.com/styles/v1/mapbox/streets-v11/static/${center.longitude},${center.latitude},${zoom}/600x300?access_token=${this.publicToken}`;
  }
}

/**
 * Map Provider Factory
 */
export const getMapProvider = (providerType?: string): IMapProvider => {
  const chosen = (providerType || process.env.MAP_PROVIDER || 'osm').toLowerCase();
  switch (chosen) {
    case 'google':
      return new GoogleMapsProvider();
    case 'mapbox':
      return new MapboxProvider();
    case 'osm':
    default:
      return new OpenStreetMapProvider();
  }
};
