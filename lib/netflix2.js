'use strict'

var async = require('async')
var cheerio = require('cheerio')
var extend = require('extend')
var request = require('request')
var util = require('util')
var vm = require('vm')

var HttpError = require('./httpError')
var manifest = require('../package.json')

function Netflix (options) {
  // return new instance if called as a function
  if (!(this instanceof Netflix)) {
    return new Netflix(options)
  }
  options = extend(true, {
    cookieJar: request.jar()
  }, options)
  this.cookieJar = options.cookieJar
  this.apiBase = ''
  this.endpointIdentifiers = {}
  this.__request = request.defaults({
    baseUrl: 'https://www.netflix.com/',
    headers: {
      'User-Agent': util.format('%s/%s', manifest.name, manifest.version)
    },
    gzip: true,
    jar: this.cookieJar
  })
}

Netflix.prototype.login = function (credentials, callback) {
  var self = this
  async.waterfall([
    async.constant(credentials),
    self.__getLoginForm.bind(self),
    self.__postLoginForm.bind(self),
    self.__getContextData.bind(self)
  ],
  function (error, contextData) {
    if (error) {
      return callback(error)
    }
    self.apiRoot = contextData.serverDefs.data.SHAKTI_API_ROOT
    self.endpointIdentifiers = contextData.serverDefs.data.endpointIdentifiers
    self.authUrl = contextData.userInfo.data.authURL
    callback(null)
  })
}

Netflix.prototype.getProfiles = function (callback) {
  var options = {}
  var endpoint = '/profiles'
  this.__apiRequest(endpoint, options, function (error, response, json) {
    if (error) {
      return callback(error)
    }
    callback(null, json.profiles)
  })
}

Netflix.prototype.switchProfile = function (guid, callback) {
  var options = {}
  var endpoint = '/profiles/switch'
  this.__apiRequest(endpoint, options, function (error, response, json) {
    if (error) {
      return callback(error)
    }
    if (json.status !== 'success') {
      return callback(new Error())
    }
    callback(null)
  })
}

Netflix.prototype.getRatingHistory = function (callback) {
  var self = this
  var ratingItems = []
  var page = 0
  var pages = 1
  async.doWhilst(
    function (cb) {
      self.__getRatingHistory(page, function (error, json) {
        if (error) {
          return callback(error)
        }
        page = json.page + 1
        pages = Math.floor(json.totalRatings / json.size) + 1
        ratingItems = ratingItems.concat(json.ratingItems)
        cb(null)
      })
    },
    function () {
      return page < pages
    },
    function (error) {
      callback(error, ratingItems)
    }
  )
}

Netflix.prototype.setVideoRating = function (titleId, rating, callback) {
  var endpoint = '/setVideoRating'
  var options = {
    qs: {
      titleid: titleId,
      rating: rating
    }
  }
  this.__apiRequest(endpoint, options, function (error, response, json) {
    if (error) {
      return callback(error)
    }
    if (json.newRating !== rating) {
      return callback(new Error())
    }
    callback(null)
  })
}

Netflix.prototype.__getEndpoint = function (endpoint) {
  return endpoint + '/' + this.endpointIdentifiers[endpoint]
}

Netflix.prototype.__apiRequest = function (endpoint, options, callback) {
  var self = this
  options = extend(true, options, {
    baseUrl: this.apiRoot,
    url: this.__getEndpoint(endpoint),
    json: true,
    qs: {
      authURL: self.authUrl
    }
  })
  self.__request(options, function (error, response, json) {
    if (error) {
      return callback(error)
    }
    if (response.statusCode === 500 && json.errorCode) {
      return callback(new Error(json.errorCode))
    }
    if (response.statusCode !== 200) {
      return callback(
        new HttpError(response.statusCode, response.statusMessage)
      )
    }
    callback(null, response, json)
  })
}

Netflix.prototype.__getAuthUrl = function (callback) {
  this.__getContextData(function (error, contextData) {
    if (error) {
      return callback(error)
    }
    callback(null, contextData.userInfo.data.authURL)
  })
}

Netflix.prototype.__getLoginForm = function (credentials, callback) {
  var options = {
    url: '/Login',
    method: 'GET'
  }
  this.__request(options, function (error, response, body) {
    if (error) {
      return callback(error)
    }
    if (response.statusCode !== 200) {
      return callback(
        new HttpError(response.statusCode, response.statusMessage)
      )
    }
    var $ = cheerio.load(body)
    var form = $('.login-input-email')
      .parent('form')
      .serializeArray()
      // reduce array of key-values to object
      .reduce(function (obj, pair) {
        obj[pair.name] = pair.value
        return obj
      }, {})
    form.email = credentials.email
    form.password = credentials.password
    callback(null, form)
  })
}

Netflix.prototype.__postLoginForm = function (form, callback) {
  var options = {
    url: '/Login',
    method: 'POST',
    form: form
  }
  this.__request(options, function (error, response, body) {
    if (error) {
      return callback(error)
    }
    // we expect a 302 redirect upon success
    if (response.statusCode !== 302) {
      var $ = cheerio.load(body)
      var message = $('.ui-message-contents').text() || 'Login failed'
      return callback(new Error(message))
    }
    callback(null)
  })
}

Netflix.prototype.__getContextData = function (callback) {
  var options = {
    url: '/YourAccount',
    method: 'GET',
    followAllRedirects: true
  }
  this.__request(options, function (error, response, body) {
    if (error) {
      return callback(error)
    }
    if (response.statusCode !== 200) {
      return callback(
        new HttpError(response.statusCode, response.statusMessage)
      )
    }
    var context = {
      window: {},
      netflix: {}
    }
    vm.createContext(context)
    var $ = cheerio.load(body)
    $('script').map(function (index, element) {
      // don't run external scripts
      if (!element.attribs.src) {
        var script = $(element).text()
        vm.runInContext(script, context)
      }
    })
    callback(null, context.netflix.contextData)
  })
}

Netflix.prototype.__getRatingHistory = function (page, callback) {
  var options = {
    qs: {
      pg: page
    }
  }
  var endpoint = '/ratinghistory'
  this.__apiRequest(endpoint, options, function (error, response, json) {
    if (error) {
      return callback(error)
    }
    callback(null, json)
  })
}

module.exports = Netflix
