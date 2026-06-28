export class MinuteThrottle {
  private timestamps: number[] = []

  constructor(private readonly maxPerMinute: number) {}

  /** Returns false if rate limit exceeded */
  tryConsume(): boolean {
    const now = Date.now()
    const windowMs = 60_000
    this.timestamps = this.timestamps.filter((t) => now - t < windowMs)
    if (this.timestamps.length >= this.maxPerMinute) return false
    this.timestamps.push(now)
    return true
  }
}
