const SOUND_ENABLED_KEY = 'sedifexbiz:sound-enabled'

type SoundTone = 'action' | 'success' | 'error'

type ToneStep = {
  frequency: number
  duration: number
  delay?: number
}

function canUseWebAudio(): boolean {
  return typeof window !== 'undefined' && typeof window.AudioContext !== 'undefined'
}

function getAudioContext(): AudioContext | null {
  if (!canUseWebAudio()) return null
  const globalWindow = window as typeof window & { __sedifexAudioContext?: AudioContext }
  if (!globalWindow.__sedifexAudioContext) {
    globalWindow.__sedifexAudioContext = new window.AudioContext()
  }
  return globalWindow.__sedifexAudioContext
}

export function isSoundEnabled(): boolean {
  if (typeof window === 'undefined') return false
  const stored = window.localStorage.getItem(SOUND_ENABLED_KEY)
  return stored !== 'off'
}

export function setSoundEnabled(enabled: boolean) {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(SOUND_ENABLED_KEY, enabled ? 'on' : 'off')
}

function getTonePattern(tone: SoundTone): ToneStep[] {
  switch (tone) {
    case 'success':
      return [
        { frequency: 740, duration: 0.06 },
        { frequency: 988, duration: 0.08, delay: 0.03 },
      ]
    case 'error':
      return [
        { frequency: 220, duration: 0.1 },
        { frequency: 180, duration: 0.1, delay: 0.04 },
      ]
    case 'action':
    default:
      return [{ frequency: 660, duration: 0.05 }]
  }
}

export async function playSound(tone: SoundTone) {
  if (!isSoundEnabled()) return

  const context = getAudioContext()
  if (!context) return

  if (context.state === 'suspended') {
    try {
      await context.resume()
    } catch {
      return
    }
  }

  const steps = getTonePattern(tone)
  const now = context.currentTime

  steps.forEach((step, index) => {
    const startAt = now + (step.delay ?? 0) + index * 0.005
    const oscillator = context.createOscillator()
    const gain = context.createGain()

    oscillator.type = 'sine'
    oscillator.frequency.setValueAtTime(step.frequency, startAt)

    gain.gain.setValueAtTime(0.0001, startAt)
    gain.gain.exponentialRampToValueAtTime(0.12, startAt + 0.01)
    gain.gain.exponentialRampToValueAtTime(0.0001, startAt + step.duration)

    oscillator.connect(gain)
    gain.connect(context.destination)

    oscillator.start(startAt)
    oscillator.stop(startAt + step.duration + 0.02)
  })
}
