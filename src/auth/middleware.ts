/**
 * Authentication middleware for the gateway HTTP API
 */

import type { Request, Response, NextFunction } from 'express';
import type { AuthConfig } from '../utils/types.js';
import { logger } from '../utils/logger.js';

export function createAuthMiddleware(config?: AuthConfig) {
  if (!config || config.strategy === 'none') {
    return (_req: Request, _res: Response, next: NextFunction) => next();
  }

  switch (config.strategy) {
    case 'api-key':
      return apiKeyMiddleware(config.apiKeys ?? []);
    case 'jwt':
      return jwtMiddleware(config.jwtSecret ?? '');
    default:
      logger.warn(`Unknown auth strategy: ${config.strategy}. Falling back to no auth.`);
      return (_req: Request, _res: Response, next: NextFunction) => next();
  }
}

function apiKeyMiddleware(validKeys: string[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    // Accept key from Authorization header or x-api-key header
    const authHeader = req.headers.authorization;
    const apiKeyHeader = req.headers['x-api-key'] as string | undefined;

    let key: string | undefined;

    if (authHeader?.startsWith('Bearer ')) {
      key = authHeader.slice(7);
    } else if (apiKeyHeader) {
      key = apiKeyHeader;
    }

    if (!key || !validKeys.includes(key)) {
      logger.warn(`Unauthorized request from ${req.ip}: missing or invalid API key`);
      res.status(401).json({ error: 'Unauthorized', message: 'Valid API key required' });
      return;
    }

    // Attach client identity for rate limiting and audit logs
    (req as Request & { clientId: string }).clientId = `key:${key.slice(0, 8)}...`;
    next();
  };
}

function jwtMiddleware(secret: string) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      res.status(401).json({ error: 'Unauthorized', message: 'Bearer token required' });
      return;
    }

    const token = authHeader.slice(7);

    try {
      // Dynamic import to keep jose optional
      const { jwtVerify, createSecretKey } = await import('jose');
      const secretKey = createSecretKey(Buffer.from(secret));
      const { payload } = await jwtVerify(token, secretKey);
      (req as Request & { jwtPayload: unknown }).jwtPayload = payload;
      (req as Request & { clientId: string }).clientId = `jwt:${String(payload.sub ?? 'unknown')}`;
      next();
    } catch (err) {
      logger.warn(`JWT verification failed: ${String(err)}`);
      res.status(401).json({ error: 'Unauthorized', message: 'Invalid or expired token' });
    }
  };
}
