import { Application } from 'express';
import { IncomingMessage, ServerResponse } from 'http';
import { Socket } from 'net';

export interface DispatchOptions {
  method?: string;
  url: string;
  headers?: Record<string, string>;
  body?: unknown;
}

export interface DispatchResponse<T = unknown> {
  status: number;
  headers: Record<string, string | number | string[] | undefined>;
  body: T;
  rawBody: string;
}

/**
 * Dispatches an HTTP request into an Express application in-memory
 * without requiring TCP socket binding, making tests fast and resilient.
 */
export const dispatchRequest = <T = unknown>(
  app: Application,
  options: DispatchOptions,
): Promise<DispatchResponse<T>> => {
  return new Promise((resolve) => {
    const socket = new Socket();
    const req = new IncomingMessage(socket);
    req.method = options.method || 'GET';
    req.url = options.url;
    req.headers = {
      host: 'localhost',
      'user-agent': 'KeralaTourism-TestRunner',
      ...options.headers,
    };

    const res = new ServerResponse(req);
    let rawBody = '';

    res.write = ((chunk: unknown) => {
      if (chunk) {
        rawBody += chunk.toString();
      }
      return true;
    }) as unknown as typeof res.write;

    res.end = ((chunk?: unknown) => {
      if (chunk) {
        rawBody += chunk.toString();
      }

      let parsed = rawBody as unknown as T;
      try {
        parsed = JSON.parse(rawBody) as T;
      } catch {
        // Keep rawBody if not JSON
      }

      resolve({
        status: res.statusCode,
        headers: res.getHeaders(),
        body: parsed,
        rawBody,
      });

      return res;
    }) as unknown as typeof res.end;

    if (options.body) {
      const payload = typeof options.body === 'string' ? options.body : JSON.stringify(options.body);
      req.headers['content-type'] = req.headers['content-type'] || 'application/json';
      req.headers['content-length'] = Buffer.byteLength(payload).toString();

      // Express Application is a RequestListener
      (app as unknown as (req: IncomingMessage, res: ServerResponse) => void)(req, res);
      req.emit('data', Buffer.from(payload));
      req.emit('end');
    } else {
      (app as unknown as (req: IncomingMessage, res: ServerResponse) => void)(req, res);
      req.emit('end');
    }
  });
};
