import swaggerJsdoc from 'swagger-jsdoc';
import swaggerUi from 'swagger-ui-express';
import { Express } from 'express';
import fs from 'fs';
import path from 'path';
import yaml from 'js-yaml';

/**
 * Swagger/OpenAPI documentation configuration and setup
 */

// Load OpenAPI specification from YAML file
const openApiSpecPath = path.join(__dirname, 'openapi.yaml');
let openApiSpec: any;

try {
  const yamlContent = fs.readFileSync(openApiSpecPath, 'utf8');
  openApiSpec = yaml.load(yamlContent);
} catch (error) {
  console.warn('Could not load OpenAPI spec from YAML file, using fallback configuration');
  
  // Fallback OpenAPI configuration
  openApiSpec = {
    openapi: '3.0.3',
    info: {
      title: 'Hikma Engine Semantic Search API',
      version: '1.0.0',
      description: 'A comprehensive semantic search API for indexed codebases',
    },
    servers: [
      {
        url: 'http://localhost:3000/api/v1',
        description: 'Development server',
      },
    ],
  };
}

// Swagger JSDoc options for generating documentation from code comments
const swaggerOptions: swaggerJsdoc.Options = {
  definition: openApiSpec,
  apis: [
    path.join(__dirname, '../routes/*.ts'),
    path.join(__dirname, '../controllers/*.ts'),
    path.join(__dirname, '../middleware/*.ts'),
  ],
};

// Generate OpenAPI specification
const specs:any = swaggerJsdoc(swaggerOptions);

// Custom CSS for Swagger UI
const customCss = `
  .swagger-ui .topbar { display: none; }
  .swagger-ui .info { margin: 20px 0; }
  .swagger-ui .info .title { color: #2c3e50; }
  .swagger-ui .scheme-container { background: #f8f9fa; padding: 15px; margin: 20px 0; border-radius: 5px; }
  .swagger-ui .opblock.opblock-get { border-color: #28a745; }
  .swagger-ui .opblock.opblock-post { border-color: #007bff; }
  .swagger-ui .opblock.opblock-put { border-color: #ffc107; }
  .swagger-ui .opblock.opblock-delete { border-color: #dc3545; }
  .swagger-ui .btn.authorize { background-color: #007bff; border-color: #007bff; }
  .swagger-ui .btn.authorize:hover { background-color: #0056b3; border-color: #0056b3; }
`;

// Swagger UI options
const swaggerUiOptions: swaggerUi.SwaggerUiOptions = {
  customCss,
  customSiteTitle: 'Hikma Engine API Documentation',
  customfavIcon: '/favicon.ico',
  swaggerOptions: {
    persistAuthorization: true,
    displayRequestDuration: true,
    docExpansion: 'none',
    filter: true,
    showExtensions: true,
    showCommonExtensions: true,
    tryItOutEnabled: true,
  },
};

/**
 * Setup Swagger UI documentation for the Express app
 */
export function setupSwaggerDocs(app: Express): void {
  // Serve OpenAPI spec as JSON
  app.get('/api/v1/docs/openapi.json', (req, res) => {
    res.setHeader('Content-Type', 'application/json');
    res.send(specs);
  });

  // Serve OpenAPI spec as YAML
  app.get('/api/v1/docs/openapi.yaml', (req, res) => {
    res.setHeader('Content-Type', 'text/yaml');
    res.send(yaml.dump(specs));
  });

  // Serve Swagger UI
  app.use('/api/v1/docs', swaggerUi.serve);
  app.get('/api/v1/docs', swaggerUi.setup(specs, swaggerUiOptions));

  // Redirect root docs path to versioned path
  app.get('/docs', (req, res) => {
    res.redirect('/api/v1/docs');
  });

  console.log('📚 API Documentation available at:');
  console.log('   - Swagger UI: http://localhost:3000/api/v1/docs');
  console.log('   - OpenAPI JSON: http://localhost:3000/api/v1/docs/openapi.json');
  console.log('   - OpenAPI YAML: http://localhost:3000/api/v1/docs/openapi.yaml');
}

/**
 * Generate static documentation files
 */
export function generateStaticDocs(outputDir: string): void {
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  // Write OpenAPI spec as JSON
  const jsonPath = path.join(outputDir, 'openapi.json');
  fs.writeFileSync(jsonPath, JSON.stringify(specs, null, 2));

  // Write OpenAPI spec as YAML
  const yamlPath = path.join(outputDir, 'openapi.yaml');
  fs.writeFileSync(yamlPath, yaml.dump(specs));

  // Generate HTML documentation
  const htmlContent = generateHtmlDocs();
  const htmlPath = path.join(outputDir, 'index.html');
  fs.writeFileSync(htmlPath, htmlContent);

  console.log(`📄 Static documentation generated in: ${outputDir}`);
}

/**
 * Generate HTML documentation
 */
function generateHtmlDocs(): string {
  return `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Hikma Engine API Documentation</title>
    <link rel="stylesheet" type="text/css" href="https://unpkg.com/swagger-ui-dist@4.15.5/swagger-ui.css" />
    <style>
        ${customCss}
        body { margin: 0; padding: 0; }
        .swagger-ui .info .title { font-size: 2.5em; }
        .swagger-ui .info .description { font-size: 1.1em; line-height: 1.6; }
    </style>
</head>
<body>
    <div id="swagger-ui"></div>
    <script src="https://unpkg.com/swagger-ui-dist@4.15.5/swagger-ui-bundle.js"></script>
    <script src="https://unpkg.com/swagger-ui-dist@4.15.5/swagger-ui-standalone-preset.js"></script>
    <script>
        window.onload = function() {
            const ui = SwaggerUIBundle({
                url: './openapi.json',
                dom_id: '#swagger-ui',
                deepLinking: true,
                presets: [
                    SwaggerUIBundle.presets.apis,
                    SwaggerUIStandalonePreset
                ],
                plugins: [
                    SwaggerUIBundle.plugins.DownloadUrl
                ],
                layout: "StandaloneLayout",
                persistAuthorization: true,
                displayRequestDuration: true,
                docExpansion: 'none',
                filter: true,
                showExtensions: true,
                showCommonExtensions: true,
                tryItOutEnabled: true
            });
        };
    </script>
</body>
</html>
  `;
}

/**
 * Validate OpenAPI specification
 */
export function validateOpenApiSpec(): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  try {
    // Basic validation
    if (!(specs as any).openapi) {
      errors.push('Missing openapi version');
    }

    if (!(specs as any).info || !(specs as any).info.title || !(specs as any).info.version) {
      errors.push('Missing required info fields (title, version)');
    }

    if (!(specs as any).paths || Object.keys((specs as any).paths).length === 0) {
      errors.push('No paths defined');
    }

    // Validate paths
    for (const [path, methods] of Object.entries((specs as any).paths)) {
      if (typeof methods !== 'object') {
        errors.push(`Invalid path definition: ${path}`);
        continue;
      }

      for (const [method, operation] of Object.entries(methods as any)) {
        if (typeof operation !== 'object') {
          continue;
        }

        const op = operation as any;
        if (!op.operationId) {
          errors.push(`Missing operationId for ${method.toUpperCase()} ${path}`);
        }

        if (!op.responses || Object.keys(op.responses).length === 0) {
          errors.push(`No responses defined for ${method.toUpperCase()} ${path}`);
        }
      }
    }

    return { valid: errors.length === 0, errors };
  } catch (error) {
    errors.push(`Validation error: ${error}`);
    return { valid: false, errors };
  }
}

/**
 * Get OpenAPI specification
 */
export function getOpenApiSpec(): any {
  return specs;
}

/**
 * Generate API client code examples
 */
export function generateClientExamples(): Record<string, string> {
  const examples: Record<string, string> = {};

  // JavaScript/TypeScript example
  examples.javascript = `
// JavaScript/TypeScript Client Example
import axios from 'axios';

const API_BASE_URL = 'http://localhost:3000/api/v1';
const API_KEY = 'your-api-key-here';

class HikmaSearchClient {
  constructor(baseUrl = API_BASE_URL, apiKey = null) {
    this.baseUrl = baseUrl;
    this.apiKey = apiKey;
    this.client = axios.create({
      baseURL: baseUrl,
      headers: apiKey ? { 'X-API-Key': apiKey } : {},
    });
  }

  async semanticSearch(query, options = {}) {
    const response = await this.client.get('/search/semantic', {
      params: { q: query, ...options }
    });
    return response.data;
  }

  async structuralSearch(query, options = {}) {
    const response = await this.client.get('/search/structure', {
      params: { q: query, ...options }
    });
    return response.data;
  }

  async gitSearch(query, options = {}) {
    const response = await this.client.get('/search/git', {
      params: { q: query, ...options }
    });
    return response.data;
  }

  async hybridSearch(query, options = {}) {
    const response = await this.client.get('/search/hybrid', {
      params: { q: query, ...options }
    });
    return response.data;
  }

  async comprehensiveSearch(query, options = {}) {
    const response = await this.client.get('/search/comprehensive', {
      params: { q: query, ...options }
    });
    return response.data;
  }

  async getHealth() {
    const response = await this.client.get('/monitoring/health');
    return response.data;
  }
}

// Usage example
const client = new HikmaSearchClient();

// Semantic search
const results = await client.semanticSearch('authentication function', {
  limit: 10,
  minSimilarity: 0.3
});

console.log('Search results:', results.data.results);
  `;

  // Python example
  examples.python = `
# Python Client Example
import requests
from typing import Optional, Dict, Any

class HikmaSearchClient:
    def __init__(self, base_url: str = "http://localhost:3000/api/v1", api_key: Optional[str] = None):
        self.base_url = base_url
        self.session = requests.Session()
        if api_key:
            self.session.headers.update({"X-API-Key": api_key})

    def semantic_search(self, query: str, **options) -> Dict[str, Any]:
        response = self.session.get(
            f"{self.base_url}/search/semantic",
            params={"q": query, **options}
        )
        response.raise_for_status()
        return response.json()

    def structural_search(self, query: str, **options) -> Dict[str, Any]:
        response = self.session.get(
            f"{self.base_url}/search/structure",
            params={"q": query, **options}
        )
        response.raise_for_status()
        return response.json()

    def git_search(self, query: str, **options) -> Dict[str, Any]:
        response = self.session.get(
            f"{self.base_url}/search/git",
            params={"q": query, **options}
        )
        response.raise_for_status()
        return response.json()

    def hybrid_search(self, query: str, **options) -> Dict[str, Any]:
        response = self.session.get(
            f"{self.base_url}/search/hybrid",
            params={"q": query, **options}
        )
        response.raise_for_status()
        return response.json()

    def comprehensive_search(self, query: str, **options) -> Dict[str, Any]:
        response = self.session.get(
            f"{self.base_url}/search/comprehensive",
            params={"q": query, **options}
        )
        response.raise_for_status()
        return response.json()

    def get_health(self) -> Dict[str, Any]:
        response = self.session.get(f"{self.base_url}/monitoring/health")
        response.raise_for_status()
        return response.json()

# Usage example
client = HikmaSearchClient()

# Semantic search
results = client.semantic_search("authentication function", limit=10, min_similarity=0.3)
print("Search results:", results["data"]["results"])
  `;

  // cURL examples
  examples.curl = `
# cURL Examples

# Semantic Search
curl -X GET "http://localhost:3000/api/v1/search/semantic?q=authentication%20function&limit=10" \\
  -H "X-API-Key: your-api-key-here" \\
  -H "Accept: application/json"

# Structural Search
curl -X GET "http://localhost:3000/api/v1/search/structure?q=class%20UserService&language=typescript" \\
  -H "X-API-Key: your-api-key-here" \\
  -H "Accept: application/json"

# Git Search
curl -X GET "http://localhost:3000/api/v1/search/git?q=fix%20authentication&author=john.doe@example.com" \\
  -H "X-API-Key: your-api-key-here" \\
  -H "Accept: application/json"

# Hybrid Search
curl -X GET "http://localhost:3000/api/v1/search/hybrid?q=user%20service&weights[semantic]=0.6&weights[structural]=0.4" \\
  -H "X-API-Key: your-api-key-here" \\
  -H "Accept: application/json"

# Comprehensive Search
curl -X GET "http://localhost:3000/api/v1/search/comprehensive?q=authentication%20system&limit=20" \\
  -H "X-API-Key: your-api-key-here" \\
  -H "Accept: application/json"

# Health Check
curl -X GET "http://localhost:3000/api/v1/monitoring/health" \\
  -H "Accept: application/json"

# System Information
curl -X GET "http://localhost:3000/api/v1/monitoring/system" \\
  -H "Accept: application/json"
  `;

  return examples;
}

export { specs as openApiSpec };
