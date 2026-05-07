export function playChime() {
  try {
    const ctx = new AudioContext()
    const now = ctx.currentTime
    const pairs: [number, number, number][] = [[880, 0, 0.5], [1108, 0.09, 0.55]]
    pairs.forEach(([freq, offset, decay]) => {
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.connect(gain); gain.connect(ctx.destination)
      osc.type = 'sine'; osc.frequency.value = freq
      gain.gain.setValueAtTime(0, now + offset)
      gain.gain.linearRampToValueAtTime(0.10, now + offset + 0.015)
      gain.gain.exponentialRampToValueAtTime(0.001, now + offset + decay)
      osc.start(now + offset); osc.stop(now + offset + decay)
    })
    setTimeout(() => ctx.close(), 800)
  } catch { /* AudioContext unavailable */ }
}
