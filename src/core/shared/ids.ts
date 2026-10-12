const alphabet = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'

const encodeTime = (value: number) => {
  let encoded = ''
  let remaining = value

  for (let index = 0; index < 10; index += 1) {
    encoded = alphabet[remaining % 32] + encoded
    remaining = Math.floor(remaining / 32)
  }

  return encoded
}

const randomPart = () => {
  const bytes = crypto.getRandomValues(new Uint8Array(16))
  let encoded = ''

  for (let index = 0; index < 16; index += 1) encoded += alphabet[bytes[index] % 32]

  return encoded
}

export const createUlid = (now = Date.now()) => `${encodeTime(now)}${randomPart()}`
