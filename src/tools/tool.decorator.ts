import 'reflect-metadata';
import { TOOL_METADATA } from '../ai.constants.js';
import type { ToolMetadata, ToolOptions } from './tool.metadata.js';

/**
 * Marks a method of an injectable provider as an AI tool (a.k.a. function
 * call). The method receives the validated arguments (typed by the Zod
 * `schema`) and its return value is fed back to the model.
 *
 * Because the owning class is a normal NestJS provider, the method keeps full
 * access to injected dependencies.
 *
 * @example
 * ```ts
 * @Injectable()
 * class WeatherTools {
 *   constructor(private readonly api: WeatherApi) {}
 *
 *   @Tool({ description: 'Get the weather for a city', schema: z.object({ city: z.string() }) })
 *   getWeather({ city }: { city: string }) {
 *     return this.api.lookup(city);
 *   }
 * }
 * ```
 */
export function Tool(options: ToolOptions): MethodDecorator {
  return (target, propertyKey, descriptor: PropertyDescriptor) => {
    const metadata: ToolMetadata = {
      ...options,
      methodName: String(propertyKey),
    };
    // Store on the method function itself so `Reflector.get(TOOL_METADATA, fn)`
    // resolves it during discovery.
    Reflect.defineMetadata(TOOL_METADATA, metadata, descriptor.value);
    return descriptor;
  };
}
