// Re-export the Swagger spec from a neutral module name so the
// blueprint's reference to "config/docs" resolves cleanly and
// future consumers don't need to know which spec generator is used.

export { swaggerSpec } from './swagger';
