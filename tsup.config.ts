import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts', 'src/typeorm.ts'],
  format: ['esm', 'cjs'],
  dts: true,
  sourcemap: true,
  clean: true,
  splitting: false,
  treeshake: true,
  target: 'es2022',
  // Keep peer deps external; never bundle Nest / AI SDK / provider packages.
  external: [
    '@nestjs/common',
    '@nestjs/core',
    'rxjs',
    '@nestjs/event-emitter',
    '@nestjs/typeorm',
    'typeorm',
    'bullmq',
    'pg',
    '@modelcontextprotocol/sdk',
    'ai',
    'zod',
    'reflect-metadata',
    '@ai-sdk/openai',
    '@ai-sdk/anthropic',
    '@ai-sdk/google',
  ],
});
