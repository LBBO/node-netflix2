'use strict'

var async = require('async')
var cheerio = require('cheerio')
var extend = require('extend')
var request = require('request')
var sprintf = require('sprintf-js').sprintf
var util = require('util')
var vm = require('vm')

var constants = require('./constants')
var HttpError = require('./httpError')
var manifest = require('../package')

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
    jar: this.cookieJar
  })
}

Netflix.prototype.login = function (credentials, callback) {
  var self = this
  var getContextData = function () {
    async.waterfall([
      self.__getContextData.bind(self, constants.yourAccountUrl),
      self.__getContextData.bind(self, constants.manageProfilesUrl)
    ], callback)
  }

  if (credentials) {
    async.waterfall([
      async.constant(credentials),
      self.__getLoginForm.bind(self),
      self.__postLoginForm.bind(self)
    ], getContextData)
  } else {
    getContextData()
  }
}

Netflix.prototype.browse = function (genreId, page, perPage, callback) {
  var pager = {
    from: page * perPage,
    to: (page + 1) * perPage
  }

  var defaultQuery = ['genres', genreId, 'su']

  var options = {
    method: 'POST',
    body: {
      paths: [
        [...defaultQuery, pager, 'title', 'genres'],
        [...defaultQuery, pager, 'boxarts', '_342x192', 'jpg'],
      ]
    }
  }

  var endpoint = constants.pathEvaluatorEndpointUrl
  this.__apiRequest(endpoint, options, function (error, response, json) {
    if (error) {
      return callback(error)
    }

    callback(null, json)
  })
}

Netflix.prototype.getProfiles = function (callback) {
  var options = {}
  var endpoint = constants.profilesEndpointUrl
  this.__apiRequest(endpoint, options, function (error, response, json) {
    if (error) {
      return callback(error)
    }
    callback(null, json.profiles)
  })
}

Netflix.prototype.switchProfile = function (guid, callback) {
  var self = this
  var options = {
    qs: {
      switchProfileGuid: guid
    }
  }
  var getContextData = function () {
    async.waterfall([
      self.__getContextData.bind(self, constants.yourAccountUrl),
      self.__getContextData.bind(self, constants.manageProfilesUrl)
    ], callback)
  }
  var endpoint = constants.switchProfileEndpointUrl
  this.__apiRequest(endpoint, options, function (error, response, json) {
    if (error) {
      return callback(error)
    }
    if (json.status !== 'success') {
      return callback(new Error())
    }
    self.activeProfile = guid
    getContextData()
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


Netflix.prototype.getViewingHistory = function (callback) {
  var self = this
  var viewedItems = []
  var page = 0
  var pages = 1
  async.doWhilst(
    function (cb) {
      self.__getViewingHistory(page, function (error, json) {
        if (error) {
          return callback(error)
        }
        page = json.page + 1
        pages = Math.floor(json.vhSize / json.size) + 1
        viewedItems = viewedItems.concat(json.viewedItems)
        cb(null)
      })
    },
    function () {
      return page < pages
    },
    function (error) {
      callback(error, viewedItems)
    }
  )
}


Netflix.prototype.__getViewingHistory = function (page, callback) {
  var options = {
    qs: {
      pg: page
    }
  }
  var endpoint = constants.viewingActivity
  this.__apiRequest(endpoint, options, function (error, response, json) {
    if (error) {
      return callback(error)
    }
    callback(null, json)
  })
}

Netflix.prototype.__setRating = function (isThumbRating, titleId, rating, callback) {
  var endpoint = isThumbRating ? constants.setThumbRatingEndpointUrl : constants.setVideoRatindEndpointUrl;
  var options = {
    qs: {
      rating: rating,
      authURL: this.authUrls[constants.yourAccountUrl]
    }
  }
  if (isThumbRating) {
    options.qs.titleId = titleId
  } else {
    options.qs.titleid = titleId
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

Netflix.prototype.setVideoRating = function (titleId, rating, callback) {
  this.__setRating(false, titleId, rating, callback)
}

Netflix.prototype.setThumbRating = function (titleId, rating, callback) {
  this.__setRating(true, titleId, rating, callback)
}

Netflix.prototype.getActiveProfile = function (callback) {
  var endpoint = constants.profilesEndpointUrl
  var options = {}
  this.__apiRequest(endpoint, options, function (error, response, json) {
    if (error) {
      return callback(error)
    }
    callback(null, json.active)
  })
}

Netflix.prototype.getAvatarUrl = function (avatarName, size) {
  return sprintf(constants.avatarUrl, size || 320, avatarName.split('icon')[1])
}

Netflix.prototype.setAvatar = function (avatarName, callback) {
  var endpoint = constants.pathEvaluatorEndpointUrl
  var options = {
    body: {
      callPath: ['profiles', this.activeProfile, 'edit'],
      params: [null, null, null, avatarName, null],
      authURL: this.authUrls[constants.manageProfilesUrl]
    },
    method: 'POST',
    qs: {method: 'call'}
  }
  this.__apiRequest(endpoint, options, function (error, response, json) {
    if (error) {
      return callback(error)
    }
    callback(null, json)
  })
}

Netflix.prototype.__getEndpoint = function (endpoint) {
  return endpoint
}

Netflix.prototype.__apiRequest = function (endpoint, options, callback) {
  var self = this
  options = extend(true, options, {
    baseUrl: this.apiRoot,
    url: this.__getEndpoint(endpoint),
    json: true
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

Netflix.prototype.__getLoginForm = function (credentials, callback) {
  var options = {
    url: constants.loginUrl,
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
    form.userLoginId = credentials.email
    form.password = credentials.password
    callback(null, form)
  })
}

Netflix.prototype.__postLoginForm = function (form, callback) {
  var options = {
    url: constants.loginUrl,
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

Netflix.prototype.__getContextData = function (url, callback) {
  var self = this
  var options = {
    url: url,
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
        if(script.indexOf('window.netflix') === 0) {
			    vm.runInContext(script, context);
		    }
      }
    })

    self.netflixContext = context.netflix.reactContext.models
    self.apiRoot = self.netflixContext.serverDefs.data.SHAKTI_API_ROOT + '/' + self.netflixContext.serverDefs.data.BUILD_IDENTIFIER
    self.endpointIdentifiers = self.netflixContext.serverDefs.data.endpointIdentifiers
    self.authUrls[url] = self.netflixContext.userInfo.data.authURL

    callback(null)
  })
}

Netflix.prototype.__getRatingHistory = function (page, callback) {
  var options = {
    qs: {
      pg: page
    }
  }
  var endpoint = constants.ratingHistoryEndpointUrl
  this.__apiRequest(endpoint, options, function (error, response, json) {
    if (error) {
      return callback(error)
    }
    callback(null, json)
  })
}

module.exports = Netflix
