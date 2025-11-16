import { PrivateKey, decrypt, encrypt } from 'eciesjs'
import { makeLogger } from '@mini-math/logger'

const logger = makeLogger('secrets')

const sk = new PrivateKey()
const data = Buffer.from('hello world🌍')
const decrypted = decrypt(sk.secret, encrypt(sk.publicKey.toBytes(), data))
logger.trace(Buffer.from(decrypted).toString())

export type CryptoResult =
  | { status: true; data: string }
  | { status: false; error: Error; data?: undefined }

const strip0x = (hex: string) => (hex.startsWith('0x') ? hex.slice(2) : hex)

const isHex = (hex: string) => /^[0-9a-fA-F]+$/.test(hex)

export const encryptData = (pkHexString: string, hexStringData: string): CryptoResult => {
  try {
    if (!pkHexString || typeof pkHexString !== 'string') {
      return { status: false, error: new Error('Public key hex string is required') }
    }
    if (!hexStringData || typeof hexStringData !== 'string') {
      return { status: false, error: new Error('Data hex string is required') }
    }

    const cleanPk = strip0x(pkHexString)
    const cleanData = strip0x(hexStringData)

    if (!isHex(cleanPk)) {
      return { status: false, error: new Error('Public key is not valid hex') }
    }
    if (!isHex(cleanData)) {
      return { status: false, error: new Error('Data is not valid hex') }
    }

    const msg = Buffer.from(cleanData, 'hex')

    // eciesjs encrypt API: encrypt(receiverPubhex: string, msg: Buffer): Buffer
    const encrypted = encrypt(cleanPk, msg)

    // return encrypted payload as 0x-prefixed hex
    return { status: true, data: '0x' + encrypted.toString('hex') }
  } catch (err) {
    logger.error(String(err))
    return {
      status: false,
      error: err instanceof Error ? err : new Error(String(err)),
    }
  }
}

export const decryptData = (skHexString: string, encryptedHexStringData: string): CryptoResult => {
  try {
    if (!skHexString || typeof skHexString !== 'string') {
      return { status: false, error: new Error('Private key hex string is required') }
    }
    if (!encryptedHexStringData || typeof encryptedHexStringData !== 'string') {
      return { status: false, error: new Error('Encrypted data hex string is required') }
    }

    const cleanSk = strip0x(skHexString)
    const cleanEnc = strip0x(encryptedHexStringData)

    if (!isHex(cleanSk)) {
      return { status: false, error: new Error('Private key is not valid hex') }
    }
    if (!isHex(cleanEnc)) {
      return { status: false, error: new Error('Encrypted data is not valid hex') }
    }

    const encBuf = Buffer.from(cleanEnc, 'hex')

    // eciesjs decrypt API: decrypt(receiverPrvhex: string, msg: Buffer): Buffer
    const decrypted = decrypt(cleanSk, encBuf)

    // return original data as hex again (same format as input to encryptData)
    return { status: true, data: '0x' + decrypted.toString('hex') }
  } catch (err) {
    logger.error(String(err))
    return {
      status: false,
      error: err instanceof Error ? err : new Error(String(err)),
    }
  }
}
