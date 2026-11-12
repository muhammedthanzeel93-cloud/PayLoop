import { Request, Response, NextFunction } from 'express';
import { FollowService, followService } from './follow.service';
import { FollowListQuery } from './follow.types';

export class FollowController {
  constructor(private readonly service: FollowService = followService) {}

  public followUser = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const result = await this.service.followUser(req.user!, req.params.userId);
      res.status(201).json({
        success: true,
        message: 'User followed successfully',
        data: result,
      });
    } catch (err) {
      next(err);
    }
  };

  public unfollowUser = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const result = await this.service.unfollowUser(req.user!, req.params.userId);
      res.status(200).json({
        success: true,
        message: 'User unfollowed successfully',
        data: result,
      });
    } catch (err) {
      next(err);
    }
  };

  public listFollowers = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const result = await this.service.listFollowers(
        req.params.userId,
        req.query as unknown as FollowListQuery,
        req.user,
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

  public listFollowing = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const result = await this.service.listFollowing(
        req.params.userId,
        req.query as unknown as FollowListQuery,
        req.user,
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
}

export const followController = new FollowController();
