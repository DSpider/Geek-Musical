export class TtlCache<T> {
  private entries = new Map<string, { value: T; expires: number }>();
  constructor(
    private maxEntries = 100,
    private ttlMs = 300_000,
  ) {}
  get(key: string): T | undefined {
    const entry = this.entries.get(key);
    if (!entry) return;
    if (entry.expires <= Date.now()) {
      this.entries.delete(key);
      return;
    }
    return entry.value;
  }
  set(key: string, value: T, ttlMs = this.ttlMs) {
    this.entries.delete(key);
    if (this.entries.size >= this.maxEntries)
      this.entries.delete(this.entries.keys().next().value!);
    this.entries.set(key, { value, expires: Date.now() + ttlMs });
  }
  clear() {
    this.entries.clear();
  }
}
