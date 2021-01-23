'use strict'

class HttpError extends Error {
  constructor (statusCode, statusMessage, ...params) {
    super(...params)

    Error.captureStackTrace(this, HttpError)
    this.name = this.constructor.name
    this.message = statusCode + ': ' + statusMessage
  }
}

module.exports = HttpError
