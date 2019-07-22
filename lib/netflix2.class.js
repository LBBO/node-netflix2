const async = require('async')
const cheerio = require('cheerio')
const extend = require('extend')
const request = require('request')
const sprintf = require('sprintf-js').sprintf
const util = require('util')
const vm = require('vm')

const constants = require('./constants')
const HttpError = require('./httpError')
const manifest = require('../package')

export class Netflix {
  constructor(options) {
    options = extend(true, {
      cookieJar: request.jar()
    }, options)
    this.cookieJar = options.cookieJar
    this.netflixContext = {}
    this.endpointIdentifiers = {}
    this.authUrls = {}
    this.activeProfile = null
    this.__request = request.defaults({
      baseUrl: constants.baseUrl,
      headers: {
        'User-Agent': util.format('%s/%s', manifest.name, manifest.version)
      },
      gzip: true,
      jar: this.cookieJar,
    })
  }
}
