export interface CreateTourPackageDto {
  agencyId: string;
  title: string;
  durationDays: number;
  durationNights: number;
  pricePerPerson: number;
  itinerary: { day: number; title: string; activities: string[] }[];
  inclusions: string[];
  exclusions: string[];
  maxGroupSize: number;
}

export interface AgencyProfileDto {
  businessName: string;
  licenseNumber: string;
  district: string;
  contactEmail: string;
  contactPhone: string;
}
