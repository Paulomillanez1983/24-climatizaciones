const {
  hasAuthConfig,
  verifyPassword,
  verifySession,
  createSessionCookie,
  clearSessionCookie
} = require('../lib/admin-auth');

function sendJson(response, statusCode, body) {
  response.statusCode = statusCode;
  response.setHeader('Content-Type', 'application/json; charset=utf-8');
  response.setHeader('Cache-Control', 'no-store');
  response.end(JSON.stringify(body));
}

async function readJsonBody(request) {
  if (request.body && typeof request.body === 'object') return request.body;
  if (typeof request.body === 'string') return JSON.parse(request.body || '{}');
  const chunks = [];
  for await (const chunk of request) chunks.push(Buffer.from(chunk));
  const raw = Buffer.concat(chunks).toString('utf8');
  return raw ? JSON.parse(raw) : {};
}

module.exports = async function adminSession(request, response) {
  try {
    if (!hasAuthConfig()) {
      sendJson(response, 503, { configured: false, authenticated: false, error: 'admin_auth_missing' });
      return;
    }

    if (request.method === 'GET') {
      sendJson(response, 200, { configured: true, authenticated: verifySession(request) });
      return;
    }

    if (request.method === 'POST') {
      const body = await readJsonBody(request);
      if (!verifyPassword(body.password)) {
        sendJson(response, 401, { configured: true, authenticated: false, error: 'invalid_password' });
        return;
      }
      const session = createSessionCookie(request);
      response.setHeader('Set-Cookie', session.cookie);
      sendJson(response, 200, { configured: true, authenticated: true, expiresAt: session.expiresAt });
      return;
    }

    if (request.method === 'DELETE') {
      response.setHeader('Set-Cookie', clearSessionCookie(request));
      sendJson(response, 200, { configured: true, authenticated: false });
      return;
    }

    response.setHeader('Allow', 'GET, POST, DELETE');
    sendJson(response, 405, { error: 'method_not_allowed' });
  } catch (error) {
    sendJson(response, 500, { configured: hasAuthConfig(), authenticated: false, error: 'session_request_failed' });
  }
};
