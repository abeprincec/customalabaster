// A small cache with expiry
export enum Level {
  Debug,
  Info,
  Warn,
}

export interface Entry<T> {
  value: T;
  expires: number;
}

export class Cache<K extends string, V> {
  private readonly entries = new Map<K, Entry<V>>();
  static instances = 0;

  constructor(private ttl: number = 60_000) {
    Cache.instances += 1;
  }

  get(key: K): V | undefined {
    const entry = this.entries.get(key);
    if (!entry || entry.expires < Date.now()) {
      this.entries.delete(key);
      return undefined;
    }
    return entry.value;
  }

  set(key: K, value: V): this {
    this.entries.set(key, { value, expires: Date.now() + this.ttl });
    return this;
  }

  async load(key: K, fetcher: (key: K) => Promise<V>): Promise<V> {
    const cached = this.get(key);
    if (cached !== undefined) return cached;
    try {
      const fresh = await fetcher(key);
      this.set(key, fresh);
      return fresh;
    } catch (err) {
      console.warn(`load failed for ${key}`, err, Level.Warn);
      throw err;
    }
  }
}

export const isEmail = (text: string) => /^[\w.+-]+@\w+\.\w{2,}$/.test(text);
