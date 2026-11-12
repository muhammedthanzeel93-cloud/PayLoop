import { Request, Response, NextFunction } from 'express';
import { DestinationsService, destinationsService } from './destinations.service';
import {
  createDestinationSchema,
  updateDestinationSchema,
  createDestinationSubmissionSchema,
  reviewDestinationSubmissionSchema,
  destinationQuerySchema,
  nearbyDestinationQuerySchema,
  attachDestinationMediaSchema,
  updateDestinationMediaSchema,
} from '@kerala-tourism/validation';

export class DestinationsController {
  constructor(private readonly service: DestinationsService = destinationsService) {}

  // ==============================================================================
  // PUBLIC CONTROLLERS
  // ==============================================================================

  public listPublished = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const query = destinationQuerySchema.parse(req.query);
      const result = await this.service.listPublishedDestinations(query);
      res.status(200).json({
        success: true,
        data: result.items,
        pagination: result.pagination,
      });
    } catch (err) {
      next(err);
    }
  };

  public getNearby = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const query = nearbyDestinationQuerySchema.parse(req.query);
      const result = await this.service.findNearbyDestinations(query);
      res.status(200).json({
        success: true,
        data: result.items,
        pagination: result.pagination,
      });
    } catch (err) {
      next(err);
    }
  };

  public getBySlug = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const destination = await this.service.getPublishedDestinationBySlug(req.params.slug);
      res.status(200).json({
        success: true,
        data: destination,
      });
    } catch (err) {
      next(err);
    }
  };

  public searchPublished = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const q = (req.query.q || req.query.search || '') as string;
      const page = req.query.page ? Number(req.query.page) : 1;
      const limit = req.query.limit ? Number(req.query.limit) : 10;
      const result = await this.service.searchPublishedDestinations(q, page, limit);
      res.status(200).json({
        success: true,
        data: result.items,
        pagination: result.pagination,
      });
    } catch (err) {
      next(err);
    }
  };

  public listCategories = async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const categories = await this.service.listActiveCategories();
      res.status(200).json({
        success: true,
        data: categories,
      });
    } catch (err) {
      next(err);
    }
  };

  // ==============================================================================
  // TOURIST CONTROLLERS
  // ==============================================================================

  public touristCreateSubmission = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const validated = createDestinationSubmissionSchema.parse(req.body);
      const submission = await this.service.submitByTourist(req.user!.id, validated);
      res.status(201).json({
        success: true,
        message: 'Destination suggestion submitted successfully',
        data: submission,
      });
    } catch (err) {
      next(err);
    }
  };

  public touristListSubmissions = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const page = req.query.page ? Number(req.query.page) : 1;
      const limit = req.query.limit ? Number(req.query.limit) : 20;
      const result = await this.service.getTouristSubmissions(req.user!.id, page, limit);
      res.status(200).json({
        success: true,
        data: result.items,
        pagination: result.pagination,
      });
    } catch (err) {
      next(err);
    }
  };

  public touristGetSubmission = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const submission = await this.service.getTouristSubmissionById(
        req.user!.id,
        req.params.id,
      );
      res.status(200).json({
        success: true,
        data: submission,
      });
    } catch (err) {
      next(err);
    }
  };

  // ==============================================================================
  // ADMIN CONTROLLERS
  // ==============================================================================

  public adminCreateDestination = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const validated = createDestinationSchema.parse(req.body);
      const destination = await this.service.adminCreateDestination(req.user!.id, validated);
      res.status(201).json({
        success: true,
        message: 'Destination created in draft state',
        data: destination,
      });
    } catch (err) {
      next(err);
    }
  };

  public adminUpdateDestination = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const validated = updateDestinationSchema.parse(req.body);
      const destination = await this.service.adminUpdateDestination(req.params.id, validated);
      res.status(200).json({
        success: true,
        message: 'Destination updated successfully',
        data: destination,
      });
    } catch (err) {
      next(err);
    }
  };

  public adminPublishDestination = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const destination = await this.service.adminPublishDestination(req.params.id);
      res.status(200).json({
        success: true,
        message: 'Destination published successfully',
        data: destination,
      });
    } catch (err) {
      next(err);
    }
  };

  public adminArchiveDestination = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const destination = await this.service.adminArchiveDestination(req.params.id);
      res.status(200).json({
        success: true,
        message: 'Destination archived successfully',
        data: destination,
      });
    } catch (err) {
      next(err);
    }
  };

  public adminListSubmissions = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const status = req.query.status as string | undefined;
      const page = req.query.page ? Number(req.query.page) : 1;
      const limit = req.query.limit ? Number(req.query.limit) : 20;

      const result = await this.service.adminListSubmissions({ status, page, limit });
      res.status(200).json({
        success: true,
        data: result.items,
        pagination: result.pagination,
      });
    } catch (err) {
      next(err);
    }
  };

  public adminReviewSubmission = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const validated = reviewDestinationSubmissionSchema.parse(req.body);
      const result = await this.service.adminReviewSubmission(
        req.user!.id,
        req.params.id,
        validated,
      );
      res.status(200).json({
        success: true,
        message:
          validated.action === 'APPROVE'
            ? 'Submission approved and official destination created'
            : 'Submission rejected',
        data: result,
      });
    } catch (err) {
      next(err);
    }
  };

  // ==============================================================================
  // MEDIA CONTROLLERS
  // ==============================================================================

  public attachMedia = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const validated = attachDestinationMediaSchema.parse(req.body);
      const media = await this.service.attachMedia(req.user!, req.params.id, validated);
      res.status(201).json({
        success: true,
        message: 'Media attached to destination successfully',
        data: media,
      });
    } catch (err) {
      next(err);
    }
  };

  public updateMedia = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const validated = updateDestinationMediaSchema.parse(req.body);
      const media = await this.service.updateMedia(
        req.user!,
        req.params.id,
        req.params.mediaId,
        validated,
      );
      res.status(200).json({
        success: true,
        message: 'Destination media updated successfully',
        data: media,
      });
    } catch (err) {
      next(err);
    }
  };

  public deleteMedia = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      await this.service.deleteMedia(req.user!, req.params.id, req.params.mediaId);
      res.status(200).json({
        success: true,
        message: 'Destination media deleted successfully',
      });
    } catch (err) {
      next(err);
    }
  };

  public listMedia = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const mediaList = await this.service.listMedia(req.params.id);
      res.status(200).json({
        success: true,
        data: mediaList,
      });
    } catch (err) {
      next(err);
    }
  };
}

export const destinationsController = new DestinationsController();
