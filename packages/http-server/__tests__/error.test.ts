import { describe, it, expect, vi } from 'vitest';
import { handleError } from '../src/middleware/error.js';

describe('handleError', () => {
  it('does not write headers when the response is already sent', () => {
    const res = {
      headersSent: true,
      writableEnded: false,
      statusCode: 200,
      setHeader: vi.fn(() => {
        throw new Error('ERR_HTTP_HEADERS_SENT');
      }),
      end: vi.fn(),
    };
    const event = { node: { res } } as never;

    expect(handleError(new Error('late stream failure'), event)).toMatchObject({
      error: { code: 'INTERNAL_ERROR', message: 'late stream failure' },
    });
    expect(res.setHeader).not.toHaveBeenCalled();
    expect(res.end).not.toHaveBeenCalled();
  });

  it('ignores ERR_HTTP_HEADERS_SENT if the response is committed during write', () => {
    const res = {
      headersSent: false,
      writableEnded: false,
      statusCode: 200,
      setHeader: vi.fn(() => {
        const error = new Error('Cannot set headers after they are sent to the client');
        (error as NodeJS.ErrnoException).code = 'ERR_HTTP_HEADERS_SENT';
        throw error;
      }),
      end: vi.fn(),
    };
    const event = { node: { res } } as never;

    expect(handleError(new Error('late stream failure'), event)).toMatchObject({
      error: { code: 'INTERNAL_ERROR', message: 'late stream failure' },
    });
    expect(res.end).not.toHaveBeenCalled();
  });
});
