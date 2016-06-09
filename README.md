# netflix2

A client library to access the not-so-public Netflix Shakti API.

## Installation
```
npm install netflix2
```

## Usage
All functions take standard Node callbacks:
```
function callback (error, result) {}
```

### Initialization
```
var Netflix = require('netflix2')
var netflix = new Netflix()
```
or
```
var netflix = require('netflix2')()
```

### Login
You must call `login` before using any of the other below functions. This will set cookies, API endpoints, and the authURL that must used to make API calls.
```
var credentials = {
  email: 'youremail@example.com'
  password: 'yourpassword'
}
netflix.login(credentials, callback)
```

### Get Profiles
```
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
```
netflix.switchProfile(guid, callback)
```

### Get Rating History
```
netflix.getRatingHistory(function (error, ratings) {
  ratings === [
    {"title":"Futurama","movieID":70153380,"yourRating":4.0, ...},
    {"title":"Super Troopers","movieID":60022689,"yourRating":4.0, ...},
    ...
  ]
})
```

### Set Video Rating
```
netflix.setVideoRating(movieID, rating, callback)
```

## Warning

Use of this software may constitute a breach in the [Netflix Terms of
Use](https://help.netflix.com/legal/termsofuse) and/or the [End User License
Agreement](https://help.netflix.com/legal/eula). Use at your own risk.
