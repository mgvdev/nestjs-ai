/**
 * Testing utilities. Published as `@mgvdev/nestjs-ai/testing` because it imports
 * `ai/test` (which needs the optional `msw` peer) and `@nestjs/testing`.
 */
export { createMockModel, createEmbeddingMock } from './testing/mock-model.js';
export {
  createTestingAiModule,
  type TestingAiModuleOptions,
} from './testing/testing.module.js';
