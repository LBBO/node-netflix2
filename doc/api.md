## Login
### POST /Login
#### Form Data
email
: [email]
password
: [password]
flow
: websiteSignUp
mode
: login
action
: loginAction
withFields
: email,password,rememberMe,nextPage
authURL
: (get from /Login)
nextPage
:


## Get profiles
### GET /api/shakti/profiles/a2494a1a2fb0bfad57b76a35e2d867bb56fe8db1


## Switch profiles
### GET /api/shakti/profiles/switch/0b32db23dee1781c42f92c935074736f7cdae5a0
### Query String Parameters
switchProfileGuid
: BLRHT3T5WVF5TLL6VDX2Z2NA2E
authURL
: (get from /Profiles)


## Get ratings
### GET api/shakti/ratinghistory/657bc9dee210210a9c80208c22a9f0f0835af1f7
### Query String Parameters
pg
: [0..n]
authURL
: (get from /MoviesYouveSeen)


## Set rating
### POST /api/shakti/setVideoRating/6c9bc5a855c1d7fd6fb28f7c5f4e6350bec04b87
### Form Data
titleid
: 80094557
rating
: [1..5], -2 to delete
authURL
: (get from /MoviesYouveSeen)


## Viewing history
### GET /api/shakti/viewingactivity/dff0cf9e2106e128329595dd8d8350fb3a39ba34
### Query String Parameters
pg
: [0..n]
authURL
: (get from /WiViewingActivity)
