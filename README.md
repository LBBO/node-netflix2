# netflix2

A client library to access the not-so-public Netflix Shakti API.

## Installation
```bash
npm install netflix2
```

## Usage
All functions take standard Node callbacks:
```javascript
function callback (error, result) {}
```

### Initialization
```javascript
var Netflix = require('netflix2')
var netflix = new Netflix()
```
or
```javascript
var netflix = require('netflix2')()
```

### Login
You must call `login` before using any of the other below functions. This will set cookies, API endpoints, and the authURL that must used to make API calls.
```javascript
var credentials = {
  email: 'youremail@example.com'
  password: 'yourpassword'
}
netflix.login(credentials, callback)
```

### Browse
Browse movies: pass the genre (id), which page number (if more are available) and how many items per page to display along with the callback for the result.
```javascript
/**
 * Browse movies, to simply get all films use Category ID 34399
 *
 * @param genreId The Netflix Category ID, Like https://www.netflix.com/browse/genre/34399
 * @param page The content is paged, this is the page number.
 * @param perPage How many items do you want per page?
 * @param callback Function to be called when the request is finished.
 */
netflix.browse(genreId, page, perPage, function (error, result) {
  if(error){
    console.error(error);
  } else {
    console.log(JSON.stringify(result));
  }
})
``` 

### Get Profiles
```javascript
netflix.getProfiles(function (error, profiles) {
  profiles === [
    {"firstName":"Lana", "guid":"BLRHT3T5WVF5TLL6VDX2Z2NA2E", ...},
    {"firstName":"Danielle", "guid":"CPPS2FVBJVBNJPRKNBYHEWC524", ...},
    ...
  ]
})
```

### Switch Profile
Functions like `getRatingHistory` and `getRatingHistory` operate in the context of the current profile. Use `switchProfile` to change the current profile. Find the profile GUID using `getProfiles` above.
```javascript
netflix.switchProfile(guid, callback)
```

### Get Rating History
```javascript
netflix.getRatingHistory(function (error, ratings) {
  ratings === [
    {"title":"Futurama","movieID":70153380,"yourRating":4.0, ...},
    {"title":"Super Troopers","movieID":60022689,"yourRating":4.0, ...},
    ...
  ]
})
```

### Get Viewing History
```javascript
netflix.getViewingHistory(function (error, result) {
  if(error){
    console.error(error);
  } else {
    console.log(JSON.stringify(result));
  }
})
```

### Hide Viewing History

Hide a single episode / a movie or an entire series from viewing activity

```javascript
// Hide single episode / movie
netflix.hideSingleEpisodeFromViewingHistory(movieID, function (error, result){
  if(error){
    console.error(error);
  } else {
    console.log(JSON.stringify(result));
  }
})

// Hide entire series
netflix.hideEntireSeriesFromViewingHistory(movieID, function (error, result){
  if(error){
    console.error(error);
  } else {
    console.log(JSON.stringify(result));
  }
})
```

### Hide complete Viewing History

Hide the complete viewing history.
**Note:** this may not always reset the viewing history per series

```javascript
/**
 * Hides ALL viewing history: this may not always reset the viewing history per series (**no UNDO!**)
 * use hideEntireSeriesFromViewingHistory passing the movieID to reset that series' history back
 * to the first episode
 */
 netflix.hideAllViewingHistory(function (error, result){
  if(error){
    console.error(error);
  } else {
    console.log(JSON.stringify(result));
  }
})
```

### Set Video Rating
On Netflix, users used to rate videos with stars. Then Netflix switched over to thumbs and now some users don't even 
know about the stars. You can set both types of ratings by using these two functions:
```javascript
netflix.setStarRating(movieID, rating, callback)
netflix.setThumbRating(movieID, rating, callback)
```

### Get Active Profile
```javascript
netflix.getActiveProfile(function (error, result){
  if(error){
    console.error(error);
  } else {
    console.log(JSON.stringify(result));
  }
})
```

### Get Avatar URL
```javascript
console.log(netflix.getAvatarUrl(avatarName, size));
```

### Set Avatar Name
```javascript
netflix.setAvatar(avatarName, callback);
```

## Warning

Use of this software may constitute a breach in the [Netflix Terms of
Use](https://help.netflix.com/legal/termsofuse) and/or the [End User License
Agreement](https://help.netflix.com/legal/eula). Use at your own risk.
