import { Request, Response, NextFunction } from 'express';
import { ZodSchema } from 'zod';
import { commonResponse } from '../utils/response';

export const validate = (schema: ZodSchema, source: 'body' | 'query' | 'params' = 'body') => {
  return (req: Request, res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req[source]);
    if (!result.success) {
      const messages = result.error.issues.map(
        (issue) => `${String(issue.path.join('.'))}: ${issue.message}`,
      );
      res.status(400).json(commonResponse(messages.join('; '), false));
      return;
    }
    req[source] = result.data;
    next();
  };
};
