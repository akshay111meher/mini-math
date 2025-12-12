import type { RequestHandler } from 'express'
import { ImageStore } from '@mini-math/images'

export function handleCountImages(imageStore: ImageStore): RequestHandler {
  return async (req, res, next) => {
    try {
      const userAddress = req.user.address
      const count = await imageStore.count(userAddress)

      return res.status(200).json({
        success: true,
        data: count,
      })
    } catch (err) {
      return next(err)
    }
  }
}
