/**
 * OpenAPI / Swagger specification builder for the StellarDAO API.
 *
 * Generates a complete OpenAPI 3.1 document from the registered
 * Fastify routes. Used by:
 *   • `GET /docs` — interactive Swagger UI
 *   • `GET /docs/openapi.json` — machine-readable spec
 *   • SDK codegen and integration testing
 *
 * The spec is built at server start so it stays in sync with
 * the live route table without manual maintenance.
 */

import type { FastifyInstance } from 'fastify';

interface OpenApiInfo {
  title: string;
  version: string;
  description: string;
}

interface OpenApiSpec {
  openapi: '3.1.0';
  info: OpenApiInfo;
  servers: Array<{ url: string; description: string }>;
  paths: Record<string, unknown>;
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
 * Build an OpenAPI 3.1 spec from the Fastify instance's route table.
 */
export function buildOpenApiSpec(app: FastifyInstance): OpenApiSpec {
  const paths: Record<string, unknown> = {};

  // Extract route information from Fastify's internal route table.
  const routes = app.printRoutes({ commonPrefix: false });
  const routeLines = routes.split('\n').filter(Boolean);

  for (const line of routeLines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    // Fastify prints routes as:  GET  /path  → handlerName
    const match = trimmed.match(/^(GET|POST|PUT|DELETE|PATCH)\s+(\/[^\s]+)/);
    if (!match) continue;

    const [, method, path] = match;

    // Normalize path params: /assets/:chain/:address → /assets/{chain}/{address}
    const normalizedPath = path.replace(/:(\w+)/g, '{$1}');

    if (!paths[normalizedPath]) {
      paths[normalizedPath] = {};
    }

    (paths[normalizedPath] as Record<string, unknown>)[method!.toLowerCase()] = {
      summary: `${method} ${normalizedPath}`,
      operationId: `${method}_${normalizedPath.replace(/[{}]/g, '').replace(/\//g, '_')}`,
      responses: {
        '200': { description: 'Successful response' },
        '400': { description: 'Bad request' },
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

/**
 * Register OpenAPI documentation routes on the Fastify instance.
 */
export async function registerOpenApiRoutes(app: FastifyInstance): Promise<void> {
  const spec = buildOpenApiSpec(app);

  // Machine-readable spec
  app.get('/docs/openapi.json', async (_req, reply) => {
    reply.header('Content-Type', 'application/json');
    reply.header('Cache-Control', 'public, max-age=300');
    return reply.send(spec);
  });

  // Interactive Swagger UI (lightweight inline HTML)
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
