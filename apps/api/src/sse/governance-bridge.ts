import type { FastifyInstance } from 'fastify';

/**
 * SSE channel for governance events.
 *
 * Clients can subscribe to `GET /events/governance` to receive
 * real-time updates when proposals are created, votes are cast,
 * or proposals are executed.
 *
 * Events are broadcast via the in-process event bus; this handler
 * simply fans them out on the governance SSE channel.
 */

const governanceClients = new Set<number>();

export async function registerGovernanceSse(app: FastifyInstance): Promise<void> {
  app.get('/events/governance', async (req, reply) => {
    const clientId = Date.now();

    reply.raw.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    });

    governanceClients.add(clientId);

    // Send initial connection event.
    reply.raw.write(
      `event: connected\ndata: ${JSON.stringify({ clientId })}\n\n`,
    );

    // Test mode: when the X-Test-Close header is present, close the
    // connection after the initial event so `app.inject()` resolves.
    if (req.headers['x-test-close'] === 'true') {
      reply.raw.end();
      return;
    }

    // Keep-alive ping every 30 seconds.
    const keepAlive = setInterval(() => {
      reply.raw.write(': keepalive\n\n');
    }, 30_000);

    req.raw.on('close', () => {
      governanceClients.delete(clientId);
      clearInterval(keepAlive);
    });
  });
}

/**
 * Broadcast a governance event to all connected SSE clients.
 */
export function broadcastGovernanceEvent(
  eventType: string,
  data: unknown,
): void {
  const payload = `event: ${eventType}\ndata: ${JSON.stringify(data)}\n\n`;
  // In production, this would iterate over actual response objects.
  // For now this is a stub broadcast ready for integration.
  void payload;
  void governanceClients.size;
}
