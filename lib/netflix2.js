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
const vm = require('vm')

const HttpError = require('./httpError')
const errorLogger = require('./errorLogger')
const constants = require('./constants')
const fetch = require('node-fetch')
const fs = require('fs').promises
const path = require('path')

/** @namespace */
class Netflix {
  /**
   * Creates a new Netlfix API library instance
   *
   * @constructor
   * @param {Object} options
   */
  constructor(options) {
    console.warn('Using new Netflix2 class!')

    const cookieJar = request.jar()
    options = extend(true, {
      cookieJar
    }, options)
    this.cookieJar = options.cookieJar
    this.netflixContext = {}
    this.endpointIdentifiers = {}
    this.authUrls = {}
    this.activeProfile = null
  }

  async __request(url, options = {}) {
    const config = {
      redirect: 'follow',
      ...options,
      headers: {
        cookie: this.cookie,
        ...options.headers
      },
    }
    return await fetch(url, config)
  }

  /**
   * Sets cookies, API endpoints, and the authURL that must be used to
   * make API calls
   *
   * This must be called before using any other functions
   *
   * @param {{email: string, password: string, cookies: string}} credentials
   *
   */
  async login(credentials) {
    try {
      this.cookie = credentials.cookies
      if (credentials) {
        // const loginForm = await this.__getLoginForm(credentials)
        // await this.__postLoginForm(loginForm)
        await this.__getContextDataFromUrls([constants.yourAccountUrl, constants.manageProfilesUrl])
        console.log('Login successful!')
      } else {
        // Try using cookies from previous login instead of credentials
        await this.__getContextDataFromUrls([constants.yourAccountUrl, constants.manageProfilesUrl])
        console.log('Welcome back!')
      }
    } catch (err) {
      errorLogger(err)
      // This error will need to be handled by the callee as in
      // netflix.login().then().catch((err) => handleError(err))
      // Otherwise, it will always throw an "UnhandledPromiseRejectionWarning".
      throw new Error('Something went wrong. For more information, see previous log statements.')
    }
  }

  /**
   * Browse movies, to simply get all films use Category ID 34399
   *
   * @param {number} genreId The Netflix Category ID, Like https://www.netflix.com/browse/genre/34399
   * @param {number} page The content is paged, this is the page number.
   * @param {number} perPage How many items do you want per page?
   *
   * @returns {Promise<Object>} movies
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
    return await response.json()
  }

  /**
   * @typedef {Object} Profile
   * @property {string} firstName
   * @property {string} rawFirstName
   * @property {string} guid
   * @property {boolean} isAccountOwner
   * @property {boolean} isActive
   * @property {boolean} defaultKidsProfile
   * @property {string} experience
   * @property {boolean} isAutoCreated
   * @property {string} avatarName
   * @property {{32: string, 50: string, 64: string, 80: string, 100: string, 112: string, 160: string, 200: string,
   *   320: string, }} avatarImages
   * @property {boolean} canEdit
   * @property {boolean} isDefault
   */

  /**
   * @returns {Profile[]} profiles
   */
  async getProfiles() {
    const options = {}
    const endpoint = constants.profilesEndpointUrl
    try {
      const response = await this.__apiRequest(endpoint, options)
      const body = await response.json()
      if (response.status !== 200) {
        throw new HttpError(response.status, response.statusText)
      }
      // TODO; check if status is 2xx
      return body.profiles
    } catch (err) {
      console.error(err)
    }
  }

  /**
   *
   * @param {string} guid - can be found from {}
   */
  async switchProfile(guid) {
    try {
      const endpoint = `${constants.switchProfileEndpointUrl}?switchProfileGuid=${guid}`
      const response = await this.__apiRequest(endpoint)
      const body = await response.json()
      if (!response || !body || body.status !== 'success') {
        throw new Error('There was an error while trying to switch profile')
      } else {
        this.activeProfile = guid
        await this.__getContextDataFromUrls([constants.yourAccountUrl, constants.manageProfilesUrl])
      }
    } catch (err) {
      errorLogger(err)
      throw new Error("Couldn't switch profiles. For more information, see previous log statements.")
    }
  }

  /**
   *
   * @typedef {Object} rating
   * @property {"thumb"|"star"} ratingType
   * @property {string} title
   * @property {number} movieID
   * @property {number} rating
   * @property {string} date
   * @property {number} timestamp
   * @property {number} comparableDate
   */

  /**
   *
   * @returns {Promise<rating[]>}
   */
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
   * @typedef {Object} viewingHistoryItem
   * @property {string} title
   * @property {string} videoTitle
   * @property {number} movieID
   * @property {string} country
   * @property {number} bookmark - Amount of seconds the user has already seen
   * @property {number} duration - Total duration of episode/movie in seconds
   * @property {number} date
   * @property {number} deviceType
   * @property {string} dateStr
   * @property {number} index
   * @property {string} topNodeId
   * @property {string} rating
   * @property {number} series
   * @property {string} seriesTitle
   * @property {string} seasonDescriptor
   * @property {string} episodeTitle
   */

  /**
   * Downloads the whole list of viewed movies.
   * The Netflix endpoint is paged.
   * This structure is copied from getRatingHistory.
   *
   * @returns viewingHistoryItem[]
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
   * @param {number} movieID  - the ID of the movie (e.g. 80057281 for "Stranger Things")
   */
  async hideSingleEpisodeFromViewingHistory(movieID) {
    return await this.__hideSpecificViewingHistory(movieID, false)
  }

  /**
   * Hides viewing history for a the whole series with the supplied movieID
   * @param {number} movieID  - the ID of the movie (e.g. 80057281 for "Stranger Things")
   */
  async hideEntireSeriesFromViewingHistory(movieID) {
    return await this.__hideSpecificViewingHistory(movieID, true)
  }

  /**
   *
   * @param {number} movieID
   * @param {boolean} seriesAll
   */
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
    return await response.json()
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

    const response = await this.__apiRequest(endpoint, options)
    return await response.json()
  }

  /**
   *
   * @param {number} page
   * @returns {Object}
   */
  async __getViewingHistory(page) {
    const endpoint = `${constants.viewingActivity}?pg=${page}`
    try {
      const response = await this.__apiRequest(endpoint)
      return await response.json()
    } catch (err) {
      errorLogger(err)
      throw new Error("Couldn't get your viewing history. For more information, see previous log statements.")
    }
  }

  /**
   *
   * @param {boolean} isThumbRating
   * @param {number} titleId
   * @param {number} rating
   */
  async __setRating(isThumbRating, titleId, rating) {
    const endpoint = isThumbRating ? constants.setThumbRatingEndpointUrl : constants.setVideoRatindEndpointUrl
    const options = {
      body: JSON.stringify({
        rating: rating,
        authURL: this.authUrls[constants.yourAccountUrl],

        // Note the capital I in titleId in the if-case vs. the lower case i in the else-case. This is necessary
        // due to the Shakti API.
        [isThumbRating ? 'titleId' : 'titleid']: titleId,
      }),
      headers: {
        'content-type': 'application/json',
      },
      method: 'POST',
    }

    try {
      const response = await this.__apiRequest(endpoint, options)
      const body = await response.json()
      if (body.newRating !== rating) {
        throw new Error('Something went wrong! The saved rating does not match the rating that was supposed to be saved.')
      }
    } catch (err) {
      errorLogger(err)
      throw new Error(`Couldn't set ${isThumbRating ? 'thumb rating' : 'star rating'}. For more information, see previous log statements.`)
    }
  }

  /**
   *
   * @param {number} titleId
   * @param {number} rating
   */
  async setStarRating(titleId, rating) {
    await this.__setRating(false, titleId, rating)
  }

  /**
   *
   * @param {number} titleId
   * @param {number} rating
   */
  async setThumbRating(titleId, rating) {
    await this.__setRating(true, titleId, rating)
  }

  /**
   *
   * @returns {Promise<Profile>}
   */
  async getActiveProfile() {
    const endpoint = constants.profilesEndpointUrl
    const options = {}

    const response = await this.__apiRequest(endpoint, options)
    const body = await response.json()
    return body.active
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
      method: 'POST'
    }

    const response = await this.__apiRequest(`${endpoint}?method=call`, options)
    return await response.json()
  }

  /**
   *
   * @param {{email: string, password: string}} credentials
   * @returns {Object}
   */
  async __getLoginForm(credentials) {
    try {
      const response = await this.__request(constants.baseUrl + constants.loginUrl)

      // When the statusCode is 403, that means we have been trying to login too many times in succession with incorrect credentials.
      if (response.status === 403) {
        throw new Error('Your credentials are either incorrect or you have attempted to login too many times.')
      } else if (response.status !== 200) {
        throw new HttpError(response.status, response.statusText)
      } else {
        const $ = cheerio.load(await response.text())
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
      errorLogger(err)
      throw new Error('Could not retrieve login page. For more information, see previous log statements.')
    }
  }

  /**
   *
   * @param {Object} form
   */
  async __postLoginForm(form) {
    const options = {
      method: 'POST',
      form: form,
    }

    try {
      const response = await this.__request(constants.baseUrl + constants.loginUrl, options)
      if (response.statusCode !== 302) {
        // we expect a 302 redirect upon success
        const $ = cheerio.load(await response.text())

        // This will always get the correct error message that is displayed on the Netflix website.
        const message = $('.ui-message-contents', '.hybrid-login-form-main').text()
        throw new Error(message)
      }
    } catch (err) {
      errorLogger(err)
      throw new Error('Check your credentials. For more information, see previous log statements.')
    }
  }

  /**
   *
   * @param {number} page
   */
  async __getRatingHistory(page) {
    const endpoint = `${constants.ratingHistoryEndpointUrl}?pg=${page}`

    try {
      const response = await this.__apiRequest(endpoint)
      return await response.json()
    } catch (err) {
      errorLogger(err)
      throw new Error('There was something wrong getting your rating history. For more information, see previous log statements.')
    }
  }

  /**
   *
   * @param {string} endpoint
   * @param {Object} options
   * @returns {Object}
   */
  async __apiRequest(endpoint, options) {
    try {
      const response = await this.__request(this.apiRoot + endpoint, options)
      if (response.status !== 200) {
        throw new HttpError(response.status, response.statusText)
      } else {
        return response
      }
    } catch (err) {
      errorLogger(err)
      throw new Error('There was something wrong with your request. For more information, see previous log statements.')
    }
  }

  /**
   *
   * @param {string} url
   */
  async __getContextData(url) {
    let body
    try {
      const response = await this.__request(constants.baseUrl + url)
      if (response.status !== 200) {
        throw new HttpError(response.status, response.statusText)
      } else {
        const context = {
          window: {},
          netflix: {}
        }
        vm.createContext(context)

        body = await response.text()
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
          if (!context.netflix.reactContext.models.truths.data['CURRENT_MEMBER']) {
            throw new Error('Inactive account')
          }
          if (!context.netflix.reactContext.models.memberContext) {
            throw new Error('You need to setup a profile.')
          }
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
      errorLogger(err)

      if (body) {
        const filePath = path.join(process.cwd(), 'errorResponsePage.html')
        await fs.writeFile(filePath, body)
        console.error(`The exact response HTML file was saved to ${filePath}`)
      }

      throw new Error('There was a problem fetching user data. For more information, see previous log statements.')
    }
  }

  /**
   *
   * @param {...string} urls
   */
  async __getContextDataFromUrls(urls) {
    for (const url of urls) {
      await this.__getContextData(url)
    }
  }
}

// TODO: use ES6 import / export
// export default Netflix

module.exports = Netflix
