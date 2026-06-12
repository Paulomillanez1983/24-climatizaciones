const REVIEW_URL = 'https://g.page/r/CQbJALb3zyusEBM/review';

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

module.exports = async function googleReviews(request, response) {
  if (request.method !== 'GET') {
    response.setHeader('Allow', 'GET');
    sendJson(response, 405, { error: 'method_not_allowed' }, 60);
    return;
  }

  const apiKey = process.env.GOOGLE_PLACES_API_KEY;
  const placeId = process.env.GOOGLE_PLACE_ID;

  if (!apiKey || !placeId) {
    sendJson(response, 200, {
      configured: false,
      reviewUrl: REVIEW_URL
    }, 300);
    return;
  }

  const params = new URLSearchParams({
    place_id: placeId,
    fields: 'rating,user_ratings_total,url,reviews',
    language: 'es',
    reviews_sort: 'newest',
    key: apiKey
  });

  try {
    const googleResponse = await fetch(`https://maps.googleapis.com/maps/api/place/details/json?${params}`);
    const payload = await googleResponse.json();

    if (!googleResponse.ok || payload.status !== 'OK') {
      sendJson(response, 502, {
        configured: true,
        reviewUrl: REVIEW_URL,
        error: 'google_reviews_unavailable'
      }, 120);
      return;
    }

    const result = payload.result || {};
    sendJson(response, 200, {
      configured: true,
      rating: result.rating || null,
      totalReviewCount: result.user_ratings_total || 0,
      url: result.url || REVIEW_URL,
      reviewUrl: REVIEW_URL,
      reviews: Array.isArray(result.reviews) ? result.reviews.slice(0, 3).map(cleanReview) : []
    });
  } catch (error) {
    sendJson(response, 502, {
      configured: true,
      reviewUrl: REVIEW_URL,
      error: 'google_reviews_fetch_failed'
    }, 120);
  }
};
