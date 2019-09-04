// TODO: use ES6 import / export
// import async from 'async'
// import cheerio from 'cheerio'
// import extend from 'extend'
// import request from 'request'
// import { sprintf } from 'sprintf-js'
// import util from 'util'
// import vm from 'vm'

// import HttpError from './httpError'
// import constants from './constants'
// import manifest from '../package'

const async = require('async')
const cheerio = require('cheerio')
const extend = require('extend')
const request = require('request')
const { sprintf } = require('sprintf-js')
const util = require('util')
const vm = require('vm')

const HttpError = require('./httpError')
const constants = require('./constants')
const manifest = require('../package')

class Netflix {
  constructor(options) {
    console.warn('Using new Netflix2 class!')

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
    this.__requestAsPromised = util.promisify(this.__request)
  }

  async login(credentials) {
    // TODO: get rid of this quick & dirty fix
    const getContextData = () => new Promise((resolve, reject) => {
      this.__getContextDataFromUrls([constants.yourAccountUrl, constants.manageProfilesUrl], (error, ...params) => {
        if (error) {
          reject(error)
        } else {
          resolve(...params)
        }
      })
    })

    if (credentials) {
      const loginForm = await this.__getLoginForm(credentials)
      await this.__postLoginForm(loginForm)
      await getContextData()
    } else {
      // Try using cookies from previous login instead of credentials
      await getContextData()
    }
  }

  /**
   * Browse movies, to simply get all films use Category ID 34399
   *
   * @param genreId The Netflix Category ID, Like https://www.netflix.com/browse/genre/34399
   * @param page The content is paged, this is the page number.
   * @param perPage How many items do you want per page?
   * @param callback Function to be called when the request is finished.
   */
  browse(genreId, page, perPage, callback) {
    const pager = {
      from: page * perPage,
      to: (page + 1) * perPage
    }

    const defaultQuery = ['genres', genreId, 'su']

    // The Netflix shakti API is a bit strange,
    // It needs a path structured in this way.
    const options = {
      method: 'POST',
      body: {
        paths: [
          [...defaultQuery, pager, 'title', 'genres'],
          [...defaultQuery, pager, 'boxarts', '_342x192', 'jpg']
        ]
      }
    }

    const endpoint = constants.pathEvaluatorEndpointUrl
    this.__apiRequest(endpoint, options, (error, response, json) => {
      if (error) {
        callback(error)
      } else {
        callback(null, json)
      }
    })
  }

  getProfiles(callback) {
    const options = {}
    const endpoint = constants.profilesEndpointUrl
    this.__apiRequest(endpoint, options, (error, response, json) => {
      if (error) {
        callback(error)
      } else {
        // TODO; check if status is 2xx
        callback(null, json.profiles)
      }
    })
  }

  switchProfile(guid, callback) {
    const options = {
      qs: {
        switchProfileGuid: guid
      }
    }

    const getContextData = () => this.__getContextDataFromUrls([constants.yourAccountUrl, constants.manageProfilesUrl], callback)

    const endpoint = constants.switchProfileEndpointUrl
    this.__apiRequest(endpoint, options, (error, response, json) => {
      if (error) {
        callback(error)
      } else if (json.status !== 'success') {
        callback(new Error())
      } else {
        this.activeProfile = guid
        getContextData()
      }
    })
  }

  getRatingHistory(callback) {
    let ratingItems = []
    let page = 0
    let pages = 1

    async.doWhilst(
      (cb) => {
        this.__getRatingHistory(page, (error, json) => {
          if (error) {
            return callback(error)
          } else {
            page = json.page + 1
            pages = Math.floor(json.totalRatings / json.size) + 1
            ratingItems = ratingItems.concat(json.ratingItems)
            cb(null)
          }
        })
      },
      () => page < pages,
      (error) => callback(error, ratingItems)
    )
  }

  /**
   * Downloads the whole list of viewed movies.
   * The Netflix endpoint is paged.
   * This structure is copied from getRatingHistory.
   * @param callback
   */
  getViewingHistory(callback) {
    let viewedItems = []
    let page = 0
    let pages = 1

    async.doWhilst(
      (cb) => {
        this.__getViewingHistory(page, (error, json) => {
          if (error) {
            callback(error)
          } else {
            page = json.page + 1
            pages = Math.floor(json.vhSize / json.size) + 1
            viewedItems = viewedItems.concat(json.viewedItems)
            cb(null)
          }
        })
      },
      () => page < pages,
      (error) => callback(error, viewedItems)
    )
  }

  __getViewingHistory(page, callback) {
    const options = {
      qs: {
        pg: page
      }
    }
    const endpoint = constants.viewingActivity

    this.__apiRequest(endpoint, options, (error, response, json) => {
      if (error) {
        callback(error)
      } else {
        callback(null, json)
      }
    })
  }

  __setRating(isThumbRating, titleId, rating, callback) {
    const endpoint = isThumbRating ? constants.setThumbRatingEndpointUrl : constants.setVideoRatindEndpointUrl
    let options = {
      qs: {
        rating: rating,
        authURL: this.authUrls[constants.yourAccountUrl]
      }
    }

    // Note the capital I in titleId in the if-case vs. the lower case i in the else-case. This is necessary
    // due to the Shakti API.
    if (isThumbRating) {
      options.qs.titleId = titleId
    } else {
      options.qs.titleid = titleId
    }

    this.__apiRequest(endpoint, options, (error, response, json) => {
      if (error) {
        callback(error)
      } else if (json.newRating !== rating) {
        callback(new Error())
      } else {
        callback(null)
      }
    })
  }

  /**
   * @deprecated since version 0.1.1
   * @param titleId
   * @param rating
   * @param callback
   */
  setVideoRating(titleId, rating, callback) {
    console.warn('Netflix.prototype.setVideoRating is deprecated. Please use Netflix.prototype.setStarRating ' +
      ' or Netflix.prototype.setThumbRating instead.')
    this.__setRating(false, titleId, rating, callback)
  }

  setStarRating(titleId, rating, callback) {
    this.__setRating(false, titleId, rating, callback)
  }

  setThumbRating(titleId, rating, callback) {
    this.__setRating(true, titleId, rating, callback)
  }

  getActiveProfile(callback) {
    const endpoint = constants.profilesEndpointUrl
    const options = {}
    this.__apiRequest(endpoint, options, (error, response, json) => {
      if (error) {
        callback(error)
      } else {
        callback(null, json.active)
      }
    })
  }

  getAvatarUrl(avatarName, size) {
    return sprintf(constants.avatarUrl, size || 320, avatarName.split('icon')[1])
  }

  setAvatar(avatarName, callback) {
    const endpoint = constants.pathEvaluatorEndpointUrl
    const options = {
      body: {
        callPath: ['profiles', this.activeProfile, 'edit'],
        params: [null, null, null, avatarName, null],
        authURL: this.authUrls[constants.manageProfilesUrl]
      },
      method: 'POST',
      qs: { method: 'call' }
    }

    this.__apiRequest(endpoint, options, (error, response, json) => {
      if (error) {
        callback(error)
      } else {
        callback(null, json)
      }
    })
  }

  async __getLoginForm(credentials) {
    const options = {
      url: constants.loginUrl,
      method: 'GET',
      resolveWithFullPromise: true,
    }

    const response = await this.__requestAsPromised(options)

    if (response.statusCode !== 200) {
      throw new HttpError(response.statusCode, response.statusMessage)
    } else {
      const $ = cheerio.load(response.body)
      let form = $('.login-input-email')
        .parent('form')
        .serializeArray()
        // reduce array of key-value pairs to object
        .reduce((obj, pair) => {
          obj[pair.name] = pair.value
          return obj
        }, {})
      form.userLoginId = credentials.email
      form.password = credentials.password

      return form
    }
  }

  async __postLoginForm(form) {
    const options = {
      url: constants.loginUrl,
      method: 'POST',
      form: form,
      resolveWithFullPromise: true,
    }

    const response = await this.__requestAsPromised(options)
    if (response.statusCode !== 302) {
      // we expect a 302 redirect upon success
      const $ = cheerio.load(response.body)
      const message = $('.ui-message-contents').text() || 'Login failed'
      throw new Error(message)
    }
  }

  __getRatingHistory(page, callback) {
    const options = {
      qs: {
        pg: page
      }
    }
    const endpoint = constants.ratingHistoryEndpointUrl

    this.__apiRequest(endpoint, options, (error, response, json) => {
      if (error) {
        callback(error)
      } else {
        callback(null, json)
      }
    })
  }

  __apiRequest(endpoint, options, callback) {
    options = extend(true, options, {
      baseUrl: this.apiRoot,
      url: endpoint,
      json: true
    })

    this.__request(options, (error, response, json) => {
      if (error) {
        callback(error)
      } else if (response.statusCode === 500 && json.errorCode) {
        callback(new Error(json.errorCode))
      } else if (response.statusCode !== 200) {
        callback(
          new HttpError(response.statusCode, response.statusMessage)
        )
      } else {
        callback(null, response, json)
      }
    })
  }

  __getContextData(url, callback) {
    const options = {
      url: url,
      method: 'GET',
      followAllRedirects: true
    }

    this.__request(options, (error, response, body) => {
      if (error) {
        callback(error)
      } else if (response.statusCode !== 200) {
        callback(
          new HttpError(response.statusCode, response.statusMessage)
        )
      } else {
        const context = {
          window: {},
          netflix: {}
        }
        vm.createContext(context)

        const $ = cheerio.load(body)
        $('script').map((index, element) => {
          // don't run external scripts
          if (!element.attribs.src) {
            const script = $(element).text()
            if (script.indexOf('window.netflix') === 0) {
              vm.runInContext(script, context)
            }
          }
        })

        const shaktiApiRootUrl = 'https://www.netflix.com/api/shakti/'
        /*
         * For some reason, context.netflix.reactContext does not always exist. The cause may be wether an account is active
         * or not, but that is not for sure.
         *
         * Currently, this fixes the issue, as the shakti API root seems to always be identical and endpointIdentifiers
         * seem to always be an empty object. This is a quick and dirty fix due to lack of more information!
         */
        if (context.netflix.reactContext) {
          this.netflixContext = context.netflix.reactContext.models
          this.apiRoot = shaktiApiRootUrl + this.netflixContext.serverDefs.data.BUILD_IDENTIFIER
          this.endpointIdentifiers = this.netflixContext.serverDefs.data.endpointIdentifiers
          this.authUrls[url] = context.netflix.reactContext.models.memberContext.data.userInfo.authURL
        } else if (context.netflix.contextData) {
          this.netflixContext = context.netflix.contextData
          this.apiRoot = shaktiApiRootUrl + context.netflix.contextData.serverDefs.BUILD_IDENTIFIER
          this.endpointIdentifiers = {}
          // TODO: The auth URL is probably somewhere else. Figure out where it is exactly when a user logs into an inactive
          // account.
          this.authUrls[url] = context.netflix.contextData.authURL
        } else {
          throw new Error(
            'An error occurred that appears to be similar to ' +
            'https://github.com/LBBO/netflix-migrate/issues/24 !'
          )
        }

        callback(null)
      }
    })
  }

  __getContextDataFromUrls(urls, callback) {
    // TODO: can the .bind(this) be left away? maybe use ES6 arrow functions
    async.waterfall(urls.map(url => this.__getContextData.bind(this, url)), callback)
  }
}

// TODO: use ES6 import / export
// export default Netflix

module.exports = Netflix
