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

const cheerio = require('cheerio')
const extend = require('extend')
const request = require('request-promise-native')
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
      simple: false,
      resolveWithFullResponse: true,
    })
  }

  async login(credentials) {
    try {
      if (credentials) {
        const loginForm = await this.__getLoginForm(credentials)
        await this.__postLoginForm(loginForm)
        await this.__getContextDataFromUrls([constants.yourAccountUrl, constants.manageProfilesUrl])
        console.log('Login successful!')
      } else {
        // Try using cookies from previous login instead of credentials
        await this.__getContextDataFromUrls([constants.yourAccountUrl, constants.manageProfilesUrl])
        console.log('Welcome back!')
      }
    } catch (err) {
      console.log(err)
    }
  }

  /**
   * Browse movies, to simply get all films use Category ID 34399
   *
   * @param genreId The Netflix Category ID, Like https://www.netflix.com/browse/genre/34399
   * @param page The content is paged, this is the page number.
   * @param perPage How many items do you want per page?
   */
  async browse(genreId, page, perPage) {
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
    const response = await this.__apiRequest(endpoint, options)
    return response.body
  }

  async getProfiles() {
    const options = {}
    const endpoint = constants.profilesEndpointUrl
    try {
      const response = await this.__apiRequest(endpoint, options)
      if (response.statusCode !== 200) {
        throw new HttpError(response.statusCode, response.statusMessage)
      }
      // TODO; check if status is 2xx
      return response.body.profiles
    } catch (err) {
      console.log(err)
    }
  }

  async switchProfile(guid) {
    const options = {
      qs: {
        switchProfileGuid: guid
      }
    }

    try {
      const endpoint = constants.switchProfileEndpointUrl
      const response = await this.__apiRequest(endpoint, options)
      if (!response || !response.body || response.body.status !== 'success') {
        throw new Error('There was an error while trying to switch profile')
      } else {
        this.activeProfile = guid
        await this.__getContextDataFromUrls([constants.yourAccountUrl, constants.manageProfilesUrl])
      }
    } catch (err) {
      console.log(err)
    }
  }

  async getRatingHistory() {
    let ratingItems = []
    let page = 0
    let pages = 1

    while (page < pages) {
      const json = await this.__getRatingHistory(page)
      page = json.page + 1
      pages = Math.floor(json.totalRatings / json.size) + 1
      ratingItems = ratingItems.concat(json.ratingItems)
    }

    return ratingItems
  }

  /**
   * Downloads the whole list of viewed movies.
   * The Netflix endpoint is paged.
   * This structure is copied from getRatingHistory.
   */
  async getViewingHistory() {
    let viewedItems = []
    let page = 0
    let pages = 1

    while (page < pages) {
      const json = await this.__getViewingHistory(page)
      page = json.page + 1
      pages = Math.floor(json.vhSize / json.size) + 1
      viewedItems = viewedItems.concat(json.viewedItems)
    }

    return viewedItems
  }

  /**
   * Hides viewing history for a specific movie or episode
   * @param movieID  - the ID of the movie (e.g. 80057281 for "Stranger Things")
   */
  async hideSingleEpisodeFromViewingHistory(movieID) {
    return await this.__hideSpecificViewingHistory(movieID, false)
  }

  /**
   * Hides viewing history for a the whole series with the supplied movieID
   * @param movieID  - the ID of the movie (e.g. 80057281 for "Stranger Things")
   */
  async hideEntireSeriesFromViewingHistory(movieID) {
    return await this.__hideSpecificViewingHistory(movieID, true)
  }

  async __hideSpecificViewingHistory(movieID, seriesAll) {
    const options = {
      body: {
        movieID: movieID,
        seriesAll: seriesAll,
        authURL: this.authUrls[constants.yourAccountUrl]
      },
      method: 'POST'
    }
    const endpoint = constants.viewingActivity

    const response = await this.__apiRequest(endpoint, options)
    return response.body
  }

  /**
   * Hides ALL viewing history: this may not always reset the viewing history per series.
   * Use hideMovieViewingHistory passing the movieID and setting seriesAll to true
   * to reset that series' history back to the first episode
   */
  async hideAllViewingHistory() {
    return await this.__hideAllViewingHistory()
  }

  async __hideAllViewingHistory() {
    const options = {
      body: {
        hideAll: true,
        authURL: this.authUrls[constants.yourAccountUrl]
      },
      method: 'POST'
    }
    const endpoint = constants.viewingActivity

    const result = await this.__apiRequest(endpoint, options)
    return result.body
  }

  async __getViewingHistory(page) {
    const options = {
      qs: {
        pg: page
      }
    }

    const endpoint = constants.viewingActivity
    try {
      const response = await this.__apiRequest(endpoint, options)
      return response.body
    } catch (err) {
      console.log(err)
    }
  }

  async __setRating(isThumbRating, titleId, rating) {
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

    try {
      const response = await this.__apiRequest(endpoint, options)
      if (response.body.newRating !== rating) {
        throw new Error('Something went wrong! The saved rating does not match the rating that was supposed to be saved.')
      }
    } catch (err) {
      console.log(err)
    }
  }

  async setStarRating(titleId, rating) {
    await this.__setRating(false, titleId, rating)
  }

  async setThumbRating(titleId, rating) {
    await this.__setRating(true, titleId, rating)
  }

  async getActiveProfile() {
    const endpoint = constants.profilesEndpointUrl
    const options = {}

    const response = await this.__apiRequest(endpoint, options)
    return response.body.active
  }

  getAvatarUrl(avatarName, size) {
    return sprintf(constants.avatarUrl, size || 320, avatarName.split('icon')[1])
  }

  async setAvatar(avatarName) {
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

    const response = await this.__apiRequest(endpoint, options)
    return response.body
  }

  async __getLoginForm(credentials) {
    const options = {
      url: constants.loginUrl,
      method: 'GET',
    }

    try {
      const response = await this.__request(options)
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
    } catch (err) {
      throw new Error(err.message)
    }
  }

  async __postLoginForm(form) {
    const options = {
      url: constants.loginUrl,
      method: 'POST',
      form: form,
    }

    try {
      const response = await this.__request(options)
      if (response.statusCode !== 302) {
        // we expect a 302 redirect upon success
        const $ = cheerio.load(response.body)
        const message = $('.ui-message-contents').text() || 'Login failed'
        throw new Error(message)
      }
    } catch (err) {
      throw new Error(err.message)
    }
  }

  async __getRatingHistory(page) {
    const options = {
      qs: {
        pg: page
      }
    }
    const endpoint = constants.ratingHistoryEndpointUrl

    try {
      const response = await this.__apiRequest(endpoint, options)
      return response.body
    } catch (err) {
      console.log(err)
    }
  }

  async __apiRequest(endpoint, options) {
    const extendedOptions = extend(true, options, {
      baseUrl: this.apiRoot,
      url: endpoint,
      json: true
    })

    try {
      const response = await this.__request(extendedOptions)
      if (response.statusCode !== 200) {
        throw new HttpError(response.statusCode, response.statusMessage)
      } else {
        return response
      }
    } catch (err) {
      throw new Error(err.message)
    }
  }

  async __getContextData(url) {
    const options = {
      url: url,
      method: 'GET',
      followAllRedirects: true,
    }

    try {
      const response = await this.__request(options)
      if (response.statusCode !== 200) {
        throw new HttpError(response.statusCode, response.statusMessage)
      } else {
        const context = {
          window: {},
          netflix: {}
        }
        vm.createContext(context)

        const $ = cheerio.load(response.body)
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
      }
    } catch (err) {
      throw new Error(err.message)
    }
  }

  async __getContextDataFromUrls(urls) {
    for (const url of urls) {
      await this.__getContextData(url)
    }
  }
}

// TODO: use ES6 import / export
// export default Netflix

module.exports = Netflix
