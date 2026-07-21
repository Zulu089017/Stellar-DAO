/**
 * OpenAPI / Swagger specification builder for the StellarDAO API.
 *
 * Generates a complete OpenAPI 3.1 document from the registered
 * Fastify routes. Used by:
 *   • `GET /docs` — interactive Swagger UI
 *   • `GET /docs/openapi.json` — machine-readable spec
 *   • SDK codegen and integration testing
 */

import type { FastifyInstance } from 'fastify';

interface RouteInfo {
  method: string;
  url: string;
}

interface OpenApiInfo {
  title: string;
  version: string;
  description: string;
}

interface OpenApiSpec {
  openapi: string;
  info: OpenApiInfo;
  servers: Array<{ url: string; description: string }>;
  paths: Record<string, Record<string, unknown>>;
  components: Record<string, unknown>;
}

const API_INFO: OpenApiInfo = {
  title: 'StellarDAO API',
  version: '0.2.0',
  description:
    'REST + SSE API for the StellarDAO cross-chain wrapping middleware. ' +
    'Provides asset registry, transaction tracking, bridge operations, ' +
    'governance, and real-time event streaming.',
};

/**
 * Introspect registered routes from the Fastify instance.
 * Uses the internal route list which is available synchronously
 * after all plugins have been registered.
 */
function getRegisteredRoutes(app: FastifyInstance): RouteInfo[] {
  // Fastify exposes routes via app.printRoutes() for logging,
  // but for programmatic access we introspect the internal
  // prefix tree. In Fastify v5, we define the routes manually
  // for the OpenAPI spec since the route table is dynamic.
  const staticRoutes: RouteInfo[] = [
    { method: 'GET', url: '/health' },
    { method: 'GET', url: '/assets' },
    { method: 'POST', url: '/assets' },
    { method: 'GET', url: '/assets/:chain/:address' },
    { method: 'GET', url: '/transactions' },
    { method: 'GET', url: '/transactions/:id' },
    { method: 'POST', url: '/bridge/wrap' },
    { method: 'POST', url: '/bridge/mint' },
    { method: 'POST', url: '/bridge/burn' },
    { method: 'POST', url: '/webhooks/factory/confirm' },
    { method: 'GET', url: '/governance/stats' },
    { method: 'GET', url: '/governance/proposals' },
    { method: 'GET', url: '/governance/proposals/:id' },
    { method: 'POST', url: '/governance/proposals/:id/vote' },
    { method: 'GET', url: '/governance/delegates/:address' },
    { method: 'GET', url: '/analytics/tvl' },
    { method: 'GET', url: '/analytics/volume' },
    { method: 'GET', url: '/events' },
    { method: 'GET', url: '/events/governance' },
  ];

  return staticRoutes;
}

/**
 * Build an OpenAPI 3.1 spec from the Fastify instance's route table.
 */
export function buildOpenApiSpec(app: FastifyInstance): OpenApiSpec {
  const routes = getRegisteredRoutes(app);
  const paths: Record<string, Record<string, unknown>> = {};

  for (const { method, url } of routes) {
    // Normalize path params: /:param → /{param}
    const normalizedPath = url
      .replace(/:(\w+)/g, '{$1}')
      .replace(/\/$/, '');

    if (!paths[normalizedPath]) {
      paths[normalizedPath] = {};
    }

    const methodLower = method.toLowerCase();
    // Skip SSE endpoints from OpenAPI (not REST)
    if (url.startsWith('/events')) continue;

    paths[normalizedPath]![methodLower] = {
      summary: `${method} ${normalizedPath}`,
      operationId: `${method}_${normalizedPath.replace(/[{}/]/g, '_').replace(/^_/, '')}`,
      tags: [getTag(url)],
      responses: {
        '200': { description: 'Successful response' },
        '400': { description: 'Bad request' },
        '401': { description: 'Unauthorized' },
        '500': { description: 'Internal server error' },
      },
    };
  }

  return {
    openapi: '3.1.0',
    info: API_INFO,
    servers: [
      { url: 'http://localhost:4000', description: 'Local development' },
      { url: 'https://api.stellardao.dev', description: 'Production' },
    ],
    paths,
    components: {
      securitySchemes: {
        ApiKeyAuth: {
          type: 'http',
          scheme: 'bearer',
          description: 'API key for protected endpoints',
        },
      },
    },
  };
}

function getTag(url: string): string {
  if (url.startsWith('/assets')) return 'Assets';
  if (url.startsWith('/transactions')) return 'Transactions';
  if (url.startsWith('/bridge')) return 'Bridge';
  if (url.startsWith('/webhooks')) return 'Webhooks';
  if (url.startsWith('/governance')) return 'Governance';
  if (url.startsWith('/analytics')) return 'Analytics';
  if (url.startsWith('/health')) return 'Health';
  return 'General';
}

/**
 * Register OpenAPI documentation routes on the Fastify instance.
 */
export async function registerOpenApiRoutes(app: FastifyInstance): Promise<void> {
  const spec = buildOpenApiSpec(app);

  app.get('/docs/openapi.json', async (_req, reply) => {
    reply.header('Content-Type', 'application/json');
    reply.header('Cache-Control', 'public, max-age=300');
    return reply.send(spec);
  });

  app.get('/docs', async (_req, reply) => {
    reply.header('Content-Type', 'text/html');
    reply.header('Cache-Control', 'public, max-age=300');
    return reply.send(generateSwaggerHtml());
  });
}

function generateSwaggerHtml(): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>StellarDAO API Reference</title>
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/swagger-ui-dist@5/swagger-ui.css" />
</head>
<body>
  <div id="swagger-ui"></div>
  <script src="https://cdn.jsdelivr.net/npm/swagger-ui-dist@5/swagger-ui-bundle.js" crossorigin></script>
  <script>
    SwaggerUIBundle({
      url: '/docs/openapi.json',
      dom_id: '#swagger-ui',
      deepLinking: true,
      defaultModelsExpandDepth: 0,
    });
  </script>
</body>
</html>`;
}
