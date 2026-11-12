import { Request, Response, NextFunction } from 'express';
import { AuthRepository, authRepository } from '../auth/auth.repository';
import { assertOwnership } from '../../shared/security/ownership';
import { NotFoundError } from '../../shared/errors/AppError';

export class AuthorizationController {
  constructor(private repo: AuthRepository = authRepository) {}

  public setRepository(repository: AuthRepository): void {
    this.repo = repository;
  }

  // ============================================================================
  // Tourist Actions
  // ============================================================================

  public getTouristProfile = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const profile = await this.repo.findTouristProfile(req.user!.id);
      if (!profile) {
        throw new NotFoundError('Tourist profile not found', 'PROFILE_NOT_FOUND');
      }
      res.status(200).json({ success: true, data: profile });
    } catch (err) {
      next(err);
    }
  };

  public updateTouristProfile = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      // Identity strictly derived from verified JWT principal (req.user.id)
      const updated = await this.repo.updateTouristProfile(req.user!.id, req.body);
      if (!updated) {
        throw new NotFoundError('Tourist profile not found', 'PROFILE_NOT_FOUND');
      }
      res.status(200).json({ success: true, data: updated });
    } catch (err) {
      next(err);
    }
  };

  // ============================================================================
  // Business Actions
  // ============================================================================

  public getBusinessProfile = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const profile = await this.repo.findBusinessProfile(req.user!.id);
      if (!profile) {
        throw new NotFoundError('Business profile not found', 'PROFILE_NOT_FOUND');
      }
      res.status(200).json({ success: true, data: profile });
    } catch (err) {
      next(err);
    }
  };

  public updateBusinessProfile = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const updated = await this.repo.updateBusinessProfile(req.user!.id, req.body);
      if (!updated) {
        throw new NotFoundError('Business profile not found', 'PROFILE_NOT_FOUND');
      }
      res.status(200).json({ success: true, data: updated });
    } catch (err) {
      next(err);
    }
  };

  public getBusinessDashboard = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      res.status(200).json({
        success: true,
        data: {
          businessAccountId: req.user!.id,
          dashboard: 'Merchant operations summary',
        },
      });
    } catch (err) {
      next(err);
    }
  };

  public createProperty = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      // Owner ID is anchored strictly on req.user.id
      const property = await this.repo.createProperty({
        ...req.body,
        ownerId: req.user!.id,
        isVerified: true,
      });

      res.status(201).json({ success: true, data: property });
    } catch (err) {
      next(err);
    }
  };

  public createPackage = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      // Agency ID is anchored strictly on req.user.id
      const tourPackage = await this.repo.createTourPackage({
        ...req.body,
        agencyId: req.user!.id,
        isActive: true,
      });

      res.status(201).json({ success: true, data: tourPackage });
    } catch (err) {
      next(err);
    }
  };

  public updateProperty = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const property = await this.repo.findPropertyById(req.params.propertyId);
      if (!property) {
        throw new NotFoundError('Property not found', 'RESOURCE_NOT_FOUND');
      }

      // Assert ownership: conceal with 404 if requested by another business
      assertOwnership(property.ownerId, req.user!.id, {
        resourceName: 'Property',
        concealWithNotFound: true,
      });

      const updated = await this.repo.updateProperty(property._id, req.body);
      res.status(200).json({ success: true, data: updated });
    } catch (err) {
      next(err);
    }
  };

  public updatePackage = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const pkg = await this.repo.findTourPackageById(req.params.packageId);
      if (!pkg) {
        throw new NotFoundError('Package not found', 'RESOURCE_NOT_FOUND');
      }

      // Assert ownership: conceal with 404 if requested by another business
      assertOwnership(pkg.agencyId, req.user!.id, {
        resourceName: 'Package',
        concealWithNotFound: true,
      });

      const updated = await this.repo.updateTourPackage(pkg._id, req.body);
      res.status(200).json({ success: true, data: updated });
    } catch (err) {
      next(err);
    }
  };

  public getBusinessBooking = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const booking = await this.repo.findBookingById(req.params.bookingId);
      if (!booking) {
        throw new NotFoundError('Booking not found', 'RESOURCE_NOT_FOUND');
      }

      // Booking must belong to a property owned by this business
      const property = await this.repo.findPropertyById(booking.propertyId);
      if (!property) {
        throw new NotFoundError('Booking not found', 'RESOURCE_NOT_FOUND');
      }

      assertOwnership(property.ownerId, req.user!.id, {
        resourceName: 'Booking',
        concealWithNotFound: true,
      });

      res.status(200).json({ success: true, data: booking });
    } catch (err) {
      next(err);
    }
  };

  // ============================================================================
  // Admin Actions
  // ============================================================================

  public getAdminDashboard = async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      res.status(200).json({
        success: true,
        data: {
          metrics: 'Platform Analytics & KPIs',
          authorized: true,
        },
      });
    } catch (err) {
      next(err);
    }
  };

  public getAdminUsers = async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      res.status(200).json({
        success: true,
        data: {
          users: [],
          total: 0,
        },
      });
    } catch (err) {
      next(err);
    }
  };

  public verifyBusinessAction = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const updated = await this.repo.updateBusinessVerificationStatus(
        req.params.businessId,
        req.body.status,
      );

      if (!updated) {
        throw new NotFoundError('Business not found', 'BUSINESS_NOT_FOUND');
      }

      res.status(200).json({
        success: true,
        message: `Business verification status updated to ${req.body.status}`,
        data: updated,
      });
    } catch (err) {
      next(err);
    }
  };
}

export const authorizationController = new AuthorizationController();
