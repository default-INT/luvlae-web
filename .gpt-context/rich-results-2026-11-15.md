# Live Rich Results verification — 2026-11-15

Google Rich Results Test, smartphone agent, public canonical URLs:

- Product: [report](https://search.google.com/test/rich-results/result?id=Kdps_n1O2AA5E9W1o_WLQw). Three valid elements: Product snippets, Merchant listings and Breadcrumbs. Optional Product warnings: missing review/aggregateRating. Optional Merchant warnings: missing shippingDetails/hasMerchantReturnPolicy. Google read USD19.99/InStock. Test success is eligibility, not evidence of indexing or actual rich-result display.
- Home: [report](https://search.google.com/test/rich-results/result?id=C57LszAQDpU5-NRdrRKaZw). No eligible rich-result types found. Live DOM has one video; JSON-LD contains Organization/WebSite, no VideoObject. This result does not mean Home is unindexable.
- VideoObject is optional for ordinary Home indexing. It can clarify film title/thumbnail/content URL, particularly with viewport-triggered video sources. Name, thumbnailUrl and actual first-publication uploadDate are required by Google's video schema guidance. First-publication date is not established here. Homepage video is supplementary; video-feature eligibility generally requires a dedicated watch page. Do not promise video search visibility from markup alone.
- Sources: https://developers.google.com/search/docs/appearance/structured-data/video and https://developers.google.com/search/docs/appearance/video . No schema or deployed configuration was modified during this check.

## VideoObject implementation follow-up

HomePage now prepares a VideoObject in the existing @graph with a canonical MP4 contentUrl, stable poster thumbnailUrl, source-measured PT37.717S duration, English language and publisher reference. The server emits it only once home.video.uploadDate is provided. The user confirmed first publication on 2026-11-15, now recorded as a date-only ISO8601 value without inventing an exact time. Existing Organization/WebSite nodes and media loading behavior are preserved.
