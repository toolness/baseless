Currently this is just a server that can proxy all content
from any website through a single origin. It's the beginning
of a potential experiment in offline webmaking, though.

## Quick Start

```
npm install
node app.js
```

Then visit http://localhost:3000/ in your browser.

## Use cases

* Configured as a browser's proxy server for accessing
  offline content.
* Accessing all content in a webpage via a single, unrestricted
  origin (bypassing same-origin security restrictions,
  `X-Frame-Options`/CSP/CORS headers, and so forth).
* Configured with an appcache manifest to allow a mobile
  browser to access content offline.
* Blocking third-party tracking services without requiring browser
  configuration.
* Allowing anyone to localize any website without needing
  to ask for permission.
* Creating "standalone" X-ray Goggles remixes.
* Doing things that addons or bookmarklets normally do, but on
  the proxy-side, e.g.
  * parental controls
  * content filtering
  * adding webmaker "hooks" to e.g. every image
  * presenting page assets in a completely different way

## References

* The [Webmaker Field Research Report - Bangladesh][bangladesh]
  mentions that data is slow and costs lots of money, so most
  people either use the apps that came preloaded with their
  phones, or they manually transfer them from their friends'
  storage devices.
* Lots of anecdotal evidence from Hive organizations that need to
  hold events in places with spotty or nonexistent wi-fi.
* The [Cuba's underground alternative to the internet][cuba]
  segment on Spark describes how many Cubans use a massive hard
  drive containing an image of the internet's most popular
  sites.
* The [If the kids don't have wi-fi...][schoolbus] segment on
  Spark describes how strategically-parked school buses
  are delivering wi-fi to students that don't have it at home.
* [Bug 1036975][], "Content Security Policy breaks Webmaker's
  X-Ray Goggles"

<!-- Links -->

  [bangladesh]: https://webmaker-dist.s3.amazonaws.com/reports/bangladesh.pdf
  [cuba]: http://www.cbc.ca/radio/spark/273-school-bus-wi-fi-cuba-s-alternative-internet-capitalism-2-0-and-more-1.2928720/cuba-s-underground-alternative-to-the-internet-1.2928731
  [schoolbus]: http://www.cbc.ca/radio/spark/273-school-bus-wi-fi-cuba-s-alternative-internet-capitalism-2-0-and-more-1.2928720/if-the-kids-don-t-have-wi-fi-the-school-bus-will-it-bring-it-to-them-1.2928738
  [Bug 1036975]: https://bugzilla.mozilla.org/show_bug.cgi?id=1036975
