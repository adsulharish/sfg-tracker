import { describe, it, expect, vi } from 'vitest';
import { buildServer } from '../src/server.js';
import { prisma } from '../src/lib/prisma.js';

describe('GET /health', () => {
  it('should return 200 and db: connected when database is reachable', async () => {
    vi.spyOn(prisma, '$queryRaw').mockResolvedValueOnce([{ '?column?': 1 }]);

    const app = await buildServer();
    const response = await app.inject({
      method: 'GET',
      url: '/health'
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.status).toBe('ok');
    expect(body.db).toBe('connected');
    expect(body.timestamp).toBeDefined();

    await app.close();
  });

  it('should return 503 and db: disconnected when database fails', async () => {
    vi.spyOn(prisma, '$queryRaw').mockRejectedValueOnce(new Error('Connection refused'));

    const app = await buildServer();
    const response = await app.inject({
      method: 'GET',
      url: '/health'
    });

    expect(response.statusCode).toBe(503);
    const body = JSON.parse(response.body);
    expect(body.status).toBe('error');
    expect(body.db).toBe('disconnected');
    expect(body.error).toContain('Connection refused');

    await app.close();
  });
});
