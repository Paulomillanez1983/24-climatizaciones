const { hasAuthConfig, verifySession } = require('../lib/admin-auth');

const MAX_FILES = 60;
const MAX_FILE_BYTES = 2 * 1024 * 1024;
const MAX_TOTAL_BYTES = 8 * 1024 * 1024;

function sendJson(response, statusCode, body) {
  response.statusCode = statusCode;
  response.setHeader('Content-Type', 'application/json; charset=utf-8');
  response.setHeader('Cache-Control', 'no-store');
  response.end(JSON.stringify(body));
}

function requireAdmin(request, response) {
  if (!hasAuthConfig()) {
    sendJson(response, 503, { error: 'admin_auth_missing' });
    return false;
  }
  if (!verifySession(request)) {
    sendJson(response, 401, { error: 'unauthorized' });
    return false;
  }
  return true;
}

async function readJsonBody(request) {
  if (request.body && typeof request.body === 'object') return request.body;
  if (typeof request.body === 'string') return JSON.parse(request.body || '{}');
  const chunks = [];
  let total = 0;
  for await (const chunk of request) {
    const buffer = Buffer.from(chunk);
    total += buffer.length;
    if (total > MAX_TOTAL_BYTES) {
      const error = new Error('body_too_large');
      error.statusCode = 413;
      throw error;
    }
    chunks.push(buffer);
  }
  const raw = Buffer.concat(chunks).toString('utf8');
  return raw ? JSON.parse(raw) : {};
}

function cleanText(value, limit = 120) {
  return String(value || '')
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, limit);
}

function slugify(value) {
  return cleanText(value, 90)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-')
    .slice(0, 80) || 'cliente-web';
}

function githubHeaders() {
  return {
    Authorization: `Bearer ${process.env.FACTORY_GITHUB_TOKEN}`,
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    'User-Agent': '24-climatizaciones-factory'
  };
}

function vercelHeaders() {
  return {
    Authorization: `Bearer ${process.env.VERCEL_TOKEN}`,
    'Content-Type': 'application/json'
  };
}

async function parseApiResponse(response) {
  const text = await response.text();
  let data = {};
  if (text) {
    try {
      data = JSON.parse(text);
    } catch (error) {
      data = { message: text };
    }
  }
  if (!response.ok) {
    const error = new Error(data.message || data.error?.message || 'api_request_failed');
    error.statusCode = response.status;
    error.details = data;
    throw error;
  }
  return data;
}

async function githubRequest(path, options = {}) {
  const response = await fetch(`https://api.github.com${path}`, {
    ...options,
    headers: { ...githubHeaders(), ...(options.headers || {}) }
  });
  return parseApiResponse(response);
}

async function vercelRequest(path, options = {}) {
  const teamId = cleanText(process.env.VERCEL_TEAM_ID || process.env.VERCEL_ORG_ID, 120);
  const join = path.includes('?') ? '&' : '?';
  const url = `https://api.vercel.com${path}${teamId ? `${join}teamId=${encodeURIComponent(teamId)}` : ''}`;
  const response = await fetch(url, {
    ...options,
    headers: { ...vercelHeaders(), ...(options.headers || {}) }
  });
  return parseApiResponse(response);
}

function automationStatus() {
  const githubMissing = [];
  const vercelMissing = [];
  if (!process.env.FACTORY_GITHUB_TOKEN) githubMissing.push('FACTORY_GITHUB_TOKEN');
  if (!process.env.VERCEL_TOKEN) vercelMissing.push('VERCEL_TOKEN');
  return {
    github: {
      ready: githubMissing.length === 0,
      missing: githubMissing,
      owner: cleanText(process.env.FACTORY_GITHUB_OWNER || process.env.FACTORY_GITHUB_ORG, 80) || 'usuario autenticado'
    },
    vercel: {
      ready: vercelMissing.length === 0,
      missing: vercelMissing,
      teamId: cleanText(process.env.VERCEL_TEAM_ID || process.env.VERCEL_ORG_ID, 120) || 'cuenta/token'
    }
  };
}

function validateFiles(files) {
  if (!Array.isArray(files) || !files.length || files.length > MAX_FILES) {
    const error = new Error('invalid_files');
    error.statusCode = 400;
    throw error;
  }

  let total = 0;
  return files.map((file) => {
    const pathname = String(file.path || '').replace(/\\/g, '/').trim();
    if (
      !pathname ||
      pathname.startsWith('/') ||
      pathname.includes('..') ||
      pathname.length > 180 ||
      /(^|\/)\.git(\/|$)/i.test(pathname)
    ) {
      const error = new Error('invalid_file_path');
      error.statusCode = 400;
      throw error;
    }
    const content = Buffer.from(String(file.content || ''), 'base64');
    if (!content.length || content.length > MAX_FILE_BYTES) {
      const error = new Error('invalid_file_content');
      error.statusCode = 400;
      throw error;
    }
    total += content.length;
    if (total > MAX_TOTAL_BYTES) {
      const error = new Error('files_too_large');
      error.statusCode = 413;
      throw error;
    }
    return { path: pathname, content };
  });
}

async function resolveGitHubOwner() {
  const explicitOwner = cleanText(process.env.FACTORY_GITHUB_OWNER || process.env.FACTORY_GITHUB_ORG, 80);
  const user = await githubRequest('/user');
  const owner = explicitOwner || user.login;
  return { owner, isUserOwner: owner.toLowerCase() === String(user.login || '').toLowerCase() };
}

async function createGitHubRepo({ repoName, privateRepo, description, homepage, files }) {
  const { owner, isUserOwner } = await resolveGitHubOwner();
  const repoPayload = {
    name: repoName,
    private: privateRepo,
    description,
    homepage,
    auto_init: false,
    has_issues: true,
    has_projects: false,
    has_wiki: false
  };
  const repo = await githubRequest(isUserOwner ? '/user/repos' : `/orgs/${encodeURIComponent(owner)}/repos`, {
    method: 'POST',
    body: JSON.stringify(repoPayload)
  });

  const blobs = [];
  for (const file of files) {
    const blob = await githubRequest(`/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repoName)}/git/blobs`, {
      method: 'POST',
      body: JSON.stringify({
        content: file.content.toString('base64'),
        encoding: 'base64'
      })
    });
    blobs.push({
      path: file.path,
      mode: '100644',
      type: 'blob',
      sha: blob.sha
    });
  }

  const tree = await githubRequest(`/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repoName)}/git/trees`, {
    method: 'POST',
    body: JSON.stringify({ tree: blobs })
  });
  const commit = await githubRequest(`/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repoName)}/git/commits`, {
    method: 'POST',
    body: JSON.stringify({
      message: 'init: generated client web',
      tree: tree.sha,
      parents: []
    })
  });
  await githubRequest(`/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repoName)}/git/refs`, {
    method: 'POST',
    body: JSON.stringify({
      ref: 'refs/heads/main',
      sha: commit.sha
    })
  });
  await githubRequest(`/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repoName)}`, {
    method: 'PATCH',
    body: JSON.stringify({ default_branch: 'main' })
  }).catch(() => null);

  return {
    owner,
    repo: repoName,
    private: privateRepo,
    url: repo.html_url || `https://github.com/${owner}/${repoName}`,
    cloneUrl: repo.clone_url,
    commit: commit.sha
  };
}

function isLikelyBinary(pathname) {
  return /\.(webp|png|jpg|jpeg|gif|ico|pdf|zip|woff2?)$/i.test(pathname);
}

async function createVercelDeployment({ projectName, files }) {
  const vercelFiles = files.map((file) => {
    if (isLikelyBinary(file.path)) {
      return {
        file: file.path,
        data: file.content.toString('base64'),
        encoding: 'base64'
      };
    }
    return {
      file: file.path,
      data: file.content.toString('utf8')
    };
  });

  const deployment = await vercelRequest('/v13/deployments', {
    method: 'POST',
    body: JSON.stringify({
      name: projectName,
      target: 'production',
      files: vercelFiles,
      projectSettings: {
        framework: null,
        buildCommand: null,
        devCommand: null,
        installCommand: null,
        outputDirectory: null
      }
    })
  });

  const deploymentUrl = deployment.url
    ? `https://${deployment.url.replace(/^https?:\/\//, '')}`
    : null;
  return {
    id: deployment.id,
    url: deploymentUrl,
    readyState: deployment.readyState || deployment.state || 'building'
  };
}

module.exports = async function factoryPublish(request, response) {
  try {
    if (!requireAdmin(request, response)) return;

    if (request.method === 'GET') {
      sendJson(response, 200, { ok: true, ...automationStatus() });
      return;
    }

    if (request.method !== 'POST') {
      response.setHeader('Allow', 'GET, POST');
      sendJson(response, 405, { error: 'method_not_allowed' });
      return;
    }

    const body = await readJsonBody(request);
    const repoName = slugify(body.repoName || body.projectName || body.config?.businessName);
    const projectName = slugify(body.projectName || repoName);
    const createGithub = body.createGithub !== false;
    const deployVercel = body.deployVercel !== false;
    const privateRepo = body.privateRepo !== false;
    const status = automationStatus();
    const missing = [
      ...(createGithub ? status.github.missing : []),
      ...(deployVercel ? status.vercel.missing : [])
    ];

    if (missing.length) {
      sendJson(response, 503, {
        ok: false,
        error: 'automation_env_missing',
        missing,
        ...status
      });
      return;
    }

    const files = validateFiles(body.files);
    const config = body.config || {};
    const description = cleanText(config.description || `${repoName} generated by 24 Climatizaciones Factory`, 180);
    const homepage = cleanText(config.siteUrl || config.domain, 240);
    const result = { ok: true, repoName, projectName };

    if (createGithub) {
      result.github = await createGitHubRepo({
        repoName,
        privateRepo,
        description,
        homepage,
        files
      });
    }

    if (deployVercel) {
      result.vercel = await createVercelDeployment({
        projectName,
        files
      });
    }

    sendJson(response, 200, result);
  } catch (error) {
    const statusCode = Number(error.statusCode) || 500;
    sendJson(response, statusCode, {
      ok: false,
      error: cleanText(error.message || 'factory_publish_failed', 120),
      details: error.details || undefined
    });
  }
};
