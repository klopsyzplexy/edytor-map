import raw from '../examples/schemat-przyklad.json';
import { parseSchema } from '../src/core/schema';

export function exampleSchema() {
  return parseSchema(structuredClone(raw));
}
