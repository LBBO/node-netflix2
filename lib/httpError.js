module.export = function HttpError (statusCode, statusMessage) {
  Error.captureStackTrace(this, this.constructor)
  this.name = this.constructor.name
  this.message = statusCode + ': ' + statusMessage
}
