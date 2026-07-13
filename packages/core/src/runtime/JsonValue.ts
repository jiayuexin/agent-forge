export function serializeJsonValue(value: unknown): string {
  assertJsonValue(value, new WeakSet<object>());
  const serialized = JSON.stringify(value);
  if (serialized === undefined) {
    throw new TypeError('Value cannot be represented as JSON');
  }
  return serialized;
}

export function assertJsonValue(
  value: unknown,
  ancestors: WeakSet<object> = new WeakSet<object>()
): void {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') {
    return;
  }
  if (typeof value === 'number') {
    if (Number.isFinite(value)) return;
    throw new TypeError('JSON numbers must be finite');
  }
  if (typeof value !== 'object') {
    throw new TypeError(`JSON does not support ${typeof value}`);
  }
  if (ancestors.has(value)) {
    throw new TypeError('JSON does not support circular values');
  }

  ancestors.add(value);
  try {
    if (Array.isArray(value)) {
      for (const item of value) assertJsonValue(item, ancestors);
      return;
    }

    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) {
      throw new TypeError('JSON objects must be plain objects');
    }
    for (const key of Reflect.ownKeys(value)) {
      if (typeof key === 'symbol') {
        throw new TypeError('JSON does not support symbol keys');
      }
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (!descriptor?.enumerable) {
        throw new TypeError('JSON objects cannot contain non-enumerable properties');
      }
      assertJsonValue((value as Record<string, unknown>)[key], ancestors);
    }
  } finally {
    ancestors.delete(value);
  }
}
