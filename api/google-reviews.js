const REVIEW_URL = 'https://g.page/r/CQbJALb3zyusEBM/review';
const DEFAULT_QUERY = '24 Climatizaciones Cordoba Argentina';
const BUSINESS_WEBSITE = '24-climatizaciones.vercel.app';
const BUSINESS_PHONE = '0351 811-1652';

function sendJson(response, statusCode, body, maxAge = 900) {
  response.statusCode = statusCode;
  response.setHeader('Content-Type', 'application/json; charset=utf-8');
  response.setHeader('Cache-Control', `s-maxage=${maxAge}, stale-while-revalidate=86400`);
  response.end(JSON.stringify(body));
}

function cleanReview(review) {
  return {
    author: review.author_name || 'Cliente de Google',
    rating: review.rating || 5,
    text: String(review.text || '').slice(0, 260),
    relativeTime: review.relative_time_description || ''
  };
}

function normalize(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

function pickBestTextSearchCandidate(places) {
  const normalizedName = '24 climatizaciones';
  return (places || []).find((place) => {
    const name = normalize(place.displayName && place.displayName.text);
    const website = normalize(place.websiteUri);
    const phone = normalize(place.nationalPhoneNumber || place.internationalPhoneNumber);
    return name.includes(normalizedName) || website.includes(BUSINESS_WEBSITE) || phone.includes(normalize(BUSINESS_PHONE));
  }) || (places || [])[0];
}

async function fetchReviewsByPlaceId(apiKey, placeId) {
  const params = new URLSearchParams({
    place_id: placeId,
    fields: 'rating,user_ratings_total,url,reviews',
    language: 'es',
    reviews_sort: 'newest',
    key: apiKey
  });

  const googleResponse = await fetch(`https://maps.googleapis.com/maps/api/place/details/json?${params}`);
  const payload = await googleResponse.json();

  if (!googleResponse.ok || payload.status !== 'OK') {
    return null;
  }

  const result = payload.result || {};
  return {
    rating: result.rating || null,
    totalReviewCount: result.user_ratings_total || 0,
    url: result.url || REVIEW_URL,
    reviews: Array.isArray(result.reviews) ? result.reviews.slice(0, 3).map(cleanReview) : []
  };
}

async function fetchReviewsByTextSearch(apiKey) {
  const googleResponse = await fetch('https://places.googleapis.com/v1/places:searchText', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': apiKey,
      'X-Goog-FieldMask': [
        'places.id',
        'places.displayName',
        'places.formattedAddress',
        'places.googleMapsUri',
        'places.rating',
        'places.userRatingCount',
        'places.websiteUri',
        'places.nationalPhoneNumber',
        'places.internationalPhoneNumber'
      ].join(',')
    },
    body: JSON.stringify({
      textQuery: process.env.GOOGLE_PLACE_QUERY || DEFAULT_QUERY,
      languageCode: 'es-419',
      regionCode: 'AR',
      includePureServiceAreaBusinesses: true,
      locationBias: {
        circle: {
          center: { latitude: -31.3994723, longitude: -64.1896443 },
          radius: 50000
        }
      }
    })
  });
  const payload = await googleResponse.json();

  if (!googleResponse.ok || !Array.isArray(payload.places) || !payload.places.length) {
    return null;
  }

  const place = pickBestTextSearchCandidate(payload.places);
  if (!place) return null;

  return {
    placeId: place.id || null,
    rating: place.rating || null,
    totalReviewCount: place.userRatingCount || 0,
    url: place.googleMapsUri || REVIEW_URL,
    reviews: []
  };
}

module.exports = async function googleReviews(request, response) {
  if (request.method !== 'GET') {
    response.setHeader('Allow', 'GET');
    sendJson(response, 405, { error: 'method_not_allowed' }, 60);
    return;
  }

  const apiKey = process.env.GOOGLE_PLACES_API_KEY;
  const placeId = process.env.GOOGLE_PLACE_ID;

  if (!apiKey) {
    sendJson(response, 200, {
      configured: false,
      reviewUrl: REVIEW_URL
    }, 300);
    return;
  }

  try {
    const result = placeId
      ? await fetchReviewsByPlaceId(apiKey, placeId)
      : await fetchReviewsByTextSearch(apiKey);

    if (!result || typeof result.rating !== 'number') {
      sendJson(response, 502, {
        configured: true,
        reviewUrl: REVIEW_URL,
        error: 'google_reviews_unavailable'
      }, 120);
      return;
    }

    sendJson(response, 200, {
      configured: true,
      placeId: result.placeId || placeId || null,
      rating: result.rating,
      totalReviewCount: result.totalReviewCount || 0,
      url: result.url || REVIEW_URL,
      reviewUrl: REVIEW_URL,
      reviews: result.reviews || []
    });
  } catch (error) {
    sendJson(response, 502, {
      configured: true,
      reviewUrl: REVIEW_URL,
      error: 'google_reviews_fetch_failed'
    }, 120);
  }
};
