/**
 * Request ID Middleware
 *
 * Attaches a unique `X-Request-Id` header to every request and response,
 * enabling end-to-end tracing across logs and downstream systems.
 *
 * Priority order:
 *   1. Honour an existing `X-Request-Id` header sent by the client
 *   2. Honour `X-Correlation-Id` (common in enterprise proxies)
 *   3. Generate a new UUID v4
 *
 * @module middleware/request-id
 */

import { Request, Response, NextFunction } from 'express';
import { randomUUID } from 'crypto';

declare global {
  // Augment Express Request so downstream handlers can read req.requestId
  namespace Express {
    interface Request {
      requestId: string;
    }
  }
}

export function requestIdMiddleware(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  const id =
    (req.headers['x-request-id'] as string | undefined) ||
    (req.headers['x-correlation-id'] as string | undefined) ||
    randomUUID();

  req.requestId = id;
  res.setHeader('X-Request-Id', id);
  next();
}
