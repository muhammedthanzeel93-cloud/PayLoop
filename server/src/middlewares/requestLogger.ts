import { Request, Response, NextFunction } from 'express';
import morgan from 'morgan';
import { env } from '../config/env';

const morganLogger = morgan(
  env.NODE_ENV === 'production'
    ? ':remote-addr - :remote-user [:date[clf]] ":method :url HTTP/:http-version" :status :res[content-length] ":referrer" ":user-agent"'
    : ':method :url :status :response-time ms - :res[content-length]',
);

export const requestLogger = (req: Request, res: Response, next: NextFunction): void => {
  if (env.NODE_ENV === 'test') {
    return next();
  }
  return morganLogger(req, res, next);
};
