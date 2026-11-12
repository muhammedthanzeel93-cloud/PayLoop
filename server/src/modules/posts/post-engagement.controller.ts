import { Request, Response, NextFunction } from 'express';
import {
  PostEngagementService,
  postEngagementService,
} from './post-engagement.service';
import {
  CreateCommentInput,
  PostCommentsQuery,
  UpdateCommentInput,
} from './post-engagement.types';

export class PostEngagementController {
  constructor(private readonly service: PostEngagementService = postEngagementService) {}

  public likePost = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const result = await this.service.likePost(req.user!, req.params.postId);
      res.status(201).json({
        success: true,
        message: 'Post liked successfully',
        data: result,
      });
    } catch (err) {
      next(err);
    }
  };

  public unlikePost = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const result = await this.service.unlikePost(req.user!, req.params.postId);
      res.status(200).json({
        success: true,
        message: 'Post unliked successfully',
        data: result,
      });
    } catch (err) {
      next(err);
    }
  };

  public createComment = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const result = await this.service.createComment(
        req.user!,
        req.params.postId,
        req.body as CreateCommentInput,
      );
      res.status(201).json({
        success: true,
        message: 'Comment added successfully',
        data: result.comment,
        commentsCount: result.commentsCount,
      });
    } catch (err) {
      next(err);
    }
  };

  public listPostComments = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const result = await this.service.listPostComments(
        req.params.postId,
        req.query as unknown as PostCommentsQuery,
      );
      res.status(200).json({
        success: true,
        data: result.items,
        pagination: result.pagination,
      });
    } catch (err) {
      next(err);
    }
  };

  public updateComment = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const updated = await this.service.updateComment(
        req.user!,
        req.params.commentId,
        req.body as UpdateCommentInput,
      );
      res.status(200).json({
        success: true,
        message: 'Comment updated successfully',
        data: updated,
      });
    } catch (err) {
      next(err);
    }
  };

  public deleteComment = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const deleted = await this.service.deleteComment(req.user!, req.params.commentId);
      res.status(200).json({
        success: true,
        message: 'Comment deleted successfully',
        data: deleted,
      });
    } catch (err) {
      next(err);
    }
  };

  public repostPost = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const result = await this.service.repostPost(req.user!, req.params.postId);
      res.status(201).json({
        success: true,
        message: 'Post reposted successfully',
        data: result,
      });
    } catch (err) {
      next(err);
    }
  };

  public unrepostPost = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const result = await this.service.unrepostPost(req.user!, req.params.postId);
      res.status(200).json({
        success: true,
        message: 'Post unreposted successfully',
        data: result,
      });
    } catch (err) {
      next(err);
    }
  };
}

export const postEngagementController = new PostEngagementController();
