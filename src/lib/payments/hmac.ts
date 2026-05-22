import { createHmac, timingSafeEqual } from 'crypto'

export function verifyNowPaymentsSignature(
  body: string,
  signature: string,
  secret: string,
): boolean {
  if (!signature) return false
  const expected = createHmac('sha512', secret).update(body).digest('hex')
  try {
    return timingSafeEqual(Buffer.from(signature, 'hex'), Buffer.from(expected, 'hex'))
  } catch {
    return false
  }
}
