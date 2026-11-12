import { Request, Response, NextFunction } from 'express';
import { PostsService, postsService } from './post.service';
import {
  CreatePostInput,
  FollowingFeedQuery,
  PublicPostsFeedQuery,
  TouristOwnPostsQuery,
  UpdatePostInput,
} from './post.types';

export class PostsController {
  constructor(private readonly service: PostsService = postsService) {}

  public createPost = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const created = await this.service.createPost(req.user!, req.body as CreatePostInput);
      res.status(201).json({
        success: true,
        message: 'Post created successfully',
        data: created,
      });
    } catch (err) {
      next(err);
    }
  };

  public getPublicFeed = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const result = await this.service.getPublicFeed(
        req.query as unknown as PublicPostsFeedQuery,
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

  public getFollowingFeed = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const result = await this.service.getFollowingFeed(
        req.user!,
        req.query as unknown as FollowingFeedQuery,
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

  public getPublicPostById = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const post = await this.service.getPublicPostById(req.params.postId);
      res.status(200).json({
        success: true,
        data: post,
      });
    } catch (err) {
      next(err);
    }
  };

  public listOwnPosts = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const result = await this.service.listOwnPosts(
        req.user!,
        req.query as unknown as TouristOwnPostsQuery,
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

  public getOwnPostById = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const post = await this.service.getOwnPostById(req.user!, req.params.postId);
      res.status(200).json({
        success: true,
        data: post,
      });
    } catch (err) {
      next(err);
    }
  };

  public updateOwnPost = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const updated = await this.service.updateOwnPost(
        req.user!,
        req.params.postId,
        req.body as UpdatePostInput,
      );
      res.status(200).json({
        success: true,
        message: 'Post updated successfully',
        data: updated,
      });
    } catch (err) {
      next(err);
    }
  };

  public deleteOwnPost = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const deleted = await this.service.deleteOwnPost(req.user!, req.params.postId);
      res.status(200).json({
        success: true,
        message: 'Post deleted successfully',
        data: deleted,
      });
    } catch (err) {
      next(err);
    }
  };
}

export const postsController = new PostsController();
