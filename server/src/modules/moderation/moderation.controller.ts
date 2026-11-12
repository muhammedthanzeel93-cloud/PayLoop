import { Request, Response, NextFunction } from 'express';
import { UnauthorizedError } from '../../shared/errors/AppError';
import { ModerationService, moderationService } from './moderation.service';
import { ModerationRequestContext } from './moderation.types';
import {
  AdminReportsQueryInput,
  ApproveDestinationModerationInput,
  ApprovePostModerationInput,
  CreateContentReportInput,
  ModerationCommentsQueryInput,
  ModerationDestinationsQueryInput,
  ModerationPostsQueryInput,
  ModerationQueueQueryInput,
  RejectDestinationModerationInput,
  RejectPostModerationInput,
  RemoveCommentModerationInput,
  RemovePostModerationInput,
  RestoreCommentModerationInput,
  ReviewReportInput,
  TouristReportsQueryInput,
} from './moderation.validation';

export class ModerationController {
  constructor(private readonly service: ModerationService = moderationService) {}

  private extractRequestContext(req: Request): ModerationRequestContext {
    const ipAddress = req.ip || req.socket?.remoteAddress || null;
    const rawUserAgent = req.headers['user-agent'];
    const userAgent = typeof rawUserAgent === 'string' ? rawUserAgent : null;
    return { ipAddress, userAgent };
  }

  private assertAuthenticatedActor(req: Request): string {
    if (!req.user?.id) {
      throw new UnauthorizedError('Authentication required', 'AUTHENTICATION_REQUIRED');
    }
    return req.user.id;
  }

  // ==============================================================================
  // ADMIN MODERATION CONTROLLERS
  // ==============================================================================

  public getModerationQueue = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const data = await this.service.getModerationQueue(
        req.query as unknown as ModerationQueueQueryInput,
      );
      res.status(200).json({
        success: true,
        message: 'Moderation queue retrieved successfully',
        data,
      });
    } catch (err) {
      next(err);
    }
  };

  public listDestinations = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const data = await this.service.listDestinationsForModeration(
        req.query as unknown as ModerationDestinationsQueryInput,
      );
      res.status(200).json({
        success: true,
        message: 'Destination submissions retrieved successfully',
        data,
      });
    } catch (err) {
      next(err);
    }
  };

  public approveDestination = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const actorId = this.assertAuthenticatedActor(req);
      const data = await this.service.approveDestinationSubmission(
        actorId,
        req.params.submissionId,
        (req.body ?? {}) as ApproveDestinationModerationInput,
        this.extractRequestContext(req),
      );
      res.status(200).json({
        success: true,
        message: 'Destination submission approved successfully',
        data,
      });
    } catch (err) {
      next(err);
    }
  };

  public rejectDestination = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const actorId = this.assertAuthenticatedActor(req);
      const data = await this.service.rejectDestinationSubmission(
        actorId,
        req.params.submissionId,
        req.body as RejectDestinationModerationInput,
        this.extractRequestContext(req),
      );
      res.status(200).json({
        success: true,
        message: 'Destination submission rejected successfully',
        data,
      });
    } catch (err) {
      next(err);
    }
  };

  public listPosts = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const data = await this.service.listPostsForModeration(
        req.query as unknown as ModerationPostsQueryInput,
      );
      res.status(200).json({
        success: true,
        message: 'Posts for moderation retrieved successfully',
        data,
      });
    } catch (err) {
      next(err);
    }
  };

  public approvePost = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const actorId = this.assertAuthenticatedActor(req);
      const data = await this.service.approvePost(
        actorId,
        req.params.postId,
        (req.body ?? {}) as ApprovePostModerationInput,
        this.extractRequestContext(req),
      );
      res.status(200).json({
        success: true,
        message: 'Post approved and published successfully',
        data,
      });
    } catch (err) {
      next(err);
    }
  };

  public rejectPost = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const actorId = this.assertAuthenticatedActor(req);
      const data = await this.service.rejectPost(
        actorId,
        req.params.postId,
        req.body as RejectPostModerationInput,
        this.extractRequestContext(req),
      );
      res.status(200).json({
        success: true,
        message: 'Post rejected successfully',
        data,
      });
    } catch (err) {
      next(err);
    }
  };

  public removePost = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const actorId = this.assertAuthenticatedActor(req);
      const data = await this.service.removePost(
        actorId,
        req.params.postId,
        req.body as RemovePostModerationInput,
        this.extractRequestContext(req),
      );
      res.status(200).json({
        success: true,
        message: 'Post removed successfully',
        data,
      });
    } catch (err) {
      next(err);
    }
  };

  public listComments = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const data = await this.service.listCommentsForModeration(
        req.query as unknown as ModerationCommentsQueryInput,
      );
      res.status(200).json({
        success: true,
        message: 'Comments for moderation retrieved successfully',
        data,
      });
    } catch (err) {
      next(err);
    }
  };

  public removeComment = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const actorId = this.assertAuthenticatedActor(req);
      const data = await this.service.removeComment(
        actorId,
        req.params.commentId,
        req.body as RemoveCommentModerationInput,
        this.extractRequestContext(req),
      );
      res.status(200).json({
        success: true,
        message: 'Comment removed successfully',
        data,
      });
    } catch (err) {
      next(err);
    }
  };

  public restoreComment = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const actorId = this.assertAuthenticatedActor(req);
      const data = await this.service.restoreComment(
        actorId,
        req.params.commentId,
        (req.body ?? {}) as RestoreCommentModerationInput,
        this.extractRequestContext(req),
      );
      res.status(200).json({
        success: true,
        message: 'Comment restored successfully',
        data,
      });
    } catch (err) {
      next(err);
    }
  };

  public listAdminReports = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const data = await this.service.listAdminReports(
        req.query as unknown as AdminReportsQueryInput,
      );
      res.status(200).json({
        success: true,
        message: 'Content reports retrieved successfully',
        data,
      });
    } catch (err) {
      next(err);
    }
  };

  public reviewReport = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const actorId = this.assertAuthenticatedActor(req);
      const data = await this.service.reviewReport(
        actorId,
        req.params.reportId,
        req.body as ReviewReportInput,
        this.extractRequestContext(req),
      );
      res.status(200).json({
        success: true,
        message: 'Report reviewed successfully',
        data,
      });
    } catch (err) {
      next(err);
    }
  };

  // ==============================================================================
  // TOURIST REPORTS CONTROLLERS
  // ==============================================================================

  public createTouristReport = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const actorId = this.assertAuthenticatedActor(req);
      const data = await this.service.createTouristReport(
        actorId,
        req.body as CreateContentReportInput,
      );
      res.status(201).json({
        success: true,
        message: 'Content report submitted successfully',
        data,
      });
    } catch (err) {
      next(err);
    }
  };

  public listTouristReports = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const actorId = this.assertAuthenticatedActor(req);
      const data = await this.service.listTouristReports(
        actorId,
        req.query as unknown as TouristReportsQueryInput,
      );
      res.status(200).json({
        success: true,
        message: 'Your content reports retrieved successfully',
        data,
      });
    } catch (err) {
      next(err);
    }
  };
}

export const moderationController = new ModerationController();
