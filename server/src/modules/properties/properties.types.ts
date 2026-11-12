export interface CreatePropertyDto {
  ownerId: string;
  name: string;
  category: 'HOMESTAY' | 'HOTEL' | 'RESORT' | 'HOUSEBOAT';
  district: string;
  address: string;
  amenities: string[];
  supportsHourly: boolean;
  supportsDaily: boolean;
}

export interface CreateRoomDto {
  propertyId: string;
  roomName: string;
  roomType: string;
  baseHourlyRate?: number;
  baseDailyRate: number;
  capacity: number;
  turnoverBufferMinutes?: number;
}
