import { Request, Response, NextFunction } from 'express';
import { getMapProvider } from './map.provider';

export class MapController {
  public getConfig = async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const provider = getMapProvider();
      const config = provider.getPublicClientConfig();
      res.status(200).json({
        success: true,
        data: config,
      });
    } catch (err) {
      next(err);
    }
  };
}

export const mapController = new MapController();
