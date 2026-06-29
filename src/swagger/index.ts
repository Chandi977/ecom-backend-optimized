import swaggerUi from 'swagger-ui-express';
import { Application } from 'express';

const apiDocumentation = {
  openapi: '3.0.0',
  info: {
    title: 'Prem Packaging API',
    version: '1.0.0',
    description: 'E-commerce API for Prem Packaging Industries',
  },
  servers: [
    {
      url: 'http://localhost:5000',
      description: 'Development server',
    },
  ],
  components: {
    securitySchemes: {
      bearerAuth: {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
      },
    },
  },
  security: [{ bearerAuth: [] }],
  paths: {},
};

export const setupSwagger = (app: Application): void => {
  app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(apiDocumentation, { explorer: true }));
};
