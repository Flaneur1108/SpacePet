'use strict';

/**
 * SpacePet / 星际宠物嘟嘟
 * 零依赖静态服务器 + DeepSeek 代理。
 *
 * 本地开发：
 *   node server.js
 *
 * 学校/生产环境：
 *   DEEPSEEK_API_KEY=sk-xxx PORT=8000 node server.js
 *
 * 生产环境不要把 Key 放进 config.js，也不要提交 .env。
 */

const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');

const ROOT = fs.realpathSync(__dirname);
const HOST = process.env.HOST || '0.0.0.0';
const PORT = clamp(Number(process.env.PORT), 1, 65535, 8000);
const API_KEY = String(process.env.DEEPSEEK_API_KEY || '').trim();
const MODEL = String(process.env.DEEPSEEK_MODEL || 'deepseek-chat').trim();
const UPSTREAM_URL = String(process.env.DEEPSEEK_API_URL || 'https://api.deepseek.com/chat/completions').trim();
const UPSTREAM_TIMEOUT_MS = clamp(Number(process.env.UPSTREAM_TIMEOUT_MS), 3000, 60000, 18000);
const RATE_LIMIT_PER_MIN = clamp(Number(process.env.RATE_LIMIT_PER_MIN), 1, 10000, 60);
const IP_RATE_LIMIT_PER_MIN = clamp(Number(process.env.IP_RATE_LIMIT_PER_MIN), 1, 100000, 500);
const MAX_CONCURRENT = clamp(Number(process.env.MAX_CONCURRENT), 1, 1000, 80);
const TRUST_PROXY = process.env.TRUST_PROXY === '1';
const MAX_BODY_BYTES = 64 * 1024;
const MAX_MESSAGES = 24;
const MAX_MESSAGE_CHARS = 4000;
const MAX_UPSTREAM_BYTES = 2 * 1024 * 1024;

const MIME_TYPES = {
    '.html': 'text/html; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.js': 'application/javascript; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.svg': 'image/svg+xml',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.webp': 'image/webp',
    '.gif': 'image/gif',
    '.ico': 'image/x-icon',
    '.woff': 'font/woff',
    '.woff2': 'font/woff2',
    '.txt': 'text/plain; charset=utf-8'
};

const upstreamAgent = new https.Agent({
    keepAlive: true,
    maxSockets: Math.min(128, MAX_CONCURRENT + 8),
    maxFreeSockets: 16,
    timeout: UPSTREAM_TIMEOUT_MS
});

const rateBuckets = new Map();
let activeUpstreamRequests = 0;

function clamp(value, min, max, fallback) {
    if (!Number.isFinite(value)) return fallback;
    return Math.min(max, Math.max(min, value));
}

function now() {
    return Date.now();
}

function securityHeaders(extra) {
    return Object.assign({
        'X-Content-Type-Options': 'nosniff',
        'Referrer-Policy': 'no-referrer',
        'X-Frame-Options': 'DENY',
        'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=(), usb=()',
        'Cross-Origin-Opener-Policy': 'same-origin',
        'Cross-Origin-Resource-Policy': 'same-origin',
        'Content-Security-Policy': [
            "default-src 'self'",
            "script-src 'self'",
            "style-src 'self' 'unsafe-inline'",
            "img-src 'self' data:",
            "font-src 'self' data:",
            "connect-src 'self' https://api.deepseek.com",
            "media-src 'self' blob:",
            "object-src 'none'",
            "base-uri 'none'",
            "form-action 'self'",
            "frame-ancestors 'none'"
        ].join('; ')
    }, extra || {});
}

function writeJson(res, status, payload, extraHeaders) {
    const body = JSON.stringify(payload);
    const headers = securityHeaders(Object.assign({
        'Content-Type': 'application/json; charset=utf-8',
        'Content-Length': Buffer.byteLength(body),
        'Cache-Control': 'no-store'
    }, extraHeaders || {}));
    res.writeHead(status, headers);
    res.end(body);
}

function writeText(res, status, text) {
    const body = String(text || '');
    res.writeHead(status, securityHeaders({
        'Content-Type': 'text/plain; charset=utf-8',
        'Content-Length': Buffer.byteLength(body),
        'Cache-Control': 'no-store'
    }));
    res.end(body);
}

function getClientIp(req) {
    if (TRUST_PROXY) {
        const forwarded = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
        if (forwarded) return forwarded.slice(0, 80);
    }
    return String(req.socket && req.socket.remoteAddress || 'unknown').slice(0, 80);
}

function getClientKey(req) {
    const header = String(req.headers['x-dudu-client'] || '');
    if (/^[A-Za-z0-9_-]{6,80}$/.test(header)) return 'client:' + header;
    return 'ip:' + getClientIp(req);
}

function checkBucket(key, limit) {
    const timestamp = now();
    let bucket = rateBuckets.get(key);
    if (!bucket || timestamp - bucket.startedAt >= 60000) {
        bucket = { startedAt: timestamp, count: 0 };
        rateBuckets.set(key, bucket);
    }
    bucket.count += 1;
    return bucket.count <= limit;
}

function rateLimited(req, res) {
    const clientKey = getClientKey(req);
    const ipKey = 'ip:' + getClientIp(req);
    // 没有有效客户端标识时，clientKey 会退回成 ipKey；不要再对同一个桶计一次数。
    const clientOk = clientKey === ipKey
        ? true
        : checkBucket(clientKey, RATE_LIMIT_PER_MIN);
    const ipOk = checkBucket(ipKey, IP_RATE_LIMIT_PER_MIN);
    if (clientOk && ipOk) return false;
    writeJson(res, 429, { error: 'busy', message: '请求太快了，请稍后再试。' }, {
        'Retry-After': '20'
    });
    return true;
}

function readBody(req, limit) {
    return new Promise(function (resolve, reject) {
        const chunks = [];
        let size = 0;
        let settled = false;

        function fail(error) {
            if (settled) return;
            settled = true;
            reject(error);
        }

        req.on('data', function (chunk) {
            if (settled) return;
            size += chunk.length;
            if (size > limit) {
                fail(new Error('body_too_large'));
                req.destroy();
                return;
            }
            chunks.push(chunk);
        });
        req.on('end', function () {
            if (settled) return;
            settled = true;
            resolve(Buffer.concat(chunks).toString('utf8'));
        });
        req.on('error', fail);
        req.on('aborted', function () {
            fail(new Error('aborted'));
        });
    });
}

function validateMessages(messages) {
    if (!Array.isArray(messages) || messages.length === 0 || messages.length > MAX_MESSAGES) {
        return { ok: false, error: '消息格式不正确。' };
    }
    let total = 0;
    const cleaned = [];
    for (let i = 0; i < messages.length; i++) {
        const message = messages[i];
        if (!message || typeof message !== 'object') {
            return { ok: false, error: '消息格式不正确。' };
        }
        const role = message.role;
        const content = message.content;
        if ((role !== 'system' && role !== 'user' && role !== 'assistant') ||
            typeof content !== 'string' ||
            !content.trim()) {
            return { ok: false, error: '消息格式不正确。' };
        }
        if (content.length > MAX_MESSAGE_CHARS) {
            return { ok: false, error: '消息太长了。' };
        }
        total += content.length;
        if (total > 20000) {
            return { ok: false, error: '消息太长了。' };
        }
        cleaned.push({
            role: role,
            content: content.slice(0, MAX_MESSAGE_CHARS)
        });
    }
    return { ok: true, messages: cleaned };
}

function upstreamRequest(payload) {
    return new Promise(function (resolve, reject) {
        if (!API_KEY) {
            const error = new Error('ai_unavailable');
            error.code = 'ai_unavailable';
            reject(error);
            return;
        }

        const body = JSON.stringify(payload);
        const url = new URL(UPSTREAM_URL);
        const isHttps = url.protocol === 'https:';
        const transport = isHttps ? https : http;
        const options = {
            protocol: url.protocol,
            hostname: url.hostname,
            port: url.port || (isHttps ? 443 : 80),
            path: url.pathname + url.search,
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json',
                'Content-Length': Buffer.byteLength(body),
                'Authorization': 'Bearer ' + API_KEY
            }
        };
        if (isHttps) options.agent = upstreamAgent;

        let settled = false;
        let responseSize = 0;
        let request;
        const timer = setTimeout(function () {
            if (settled) return;
            settled = true;
            if (request) request.destroy();
            const error = new Error('upstream_timeout');
            error.code = 'upstream_timeout';
            reject(error);
        }, UPSTREAM_TIMEOUT_MS);

        function finish(error, value) {
            if (settled) return;
            settled = true;
            clearTimeout(timer);
            if (error) reject(error);
            else resolve(value);
        }

        try {
            request = transport.request(options, function (upstreamResponse) {
                const chunks = [];
                upstreamResponse.on('data', function (chunk) {
                    responseSize += chunk.length;
                    if (responseSize > MAX_UPSTREAM_BYTES) {
                        upstreamResponse.destroy();
                        finish(new Error('upstream_too_large'));
                        return;
                    }
                    chunks.push(chunk);
                });
                upstreamResponse.on('end', function () {
                    const status = upstreamResponse.statusCode || 502;
                    const raw = Buffer.concat(chunks).toString('utf8');
                    let data = null;
                    try {
                        data = raw ? JSON.parse(raw) : null;
                    } catch (error) {
                        data = null;
                    }
                    if (status < 200 || status >= 300) {
                        const error = new Error('upstream_status_' + status);
                        error.code = 'upstream_status';
                        error.status = status;
                        finish(error);
                        return;
                    }
                    const content = data &&
                        data.choices &&
                        data.choices[0] &&
                        data.choices[0].message &&
                        data.choices[0].message.content;
                    if (typeof content !== 'string' || !content.trim()) {
                        finish(new Error('upstream_empty'));
                        return;
                    }
                    finish(null, content);
                });
                upstreamResponse.on('error', function (error) {
                    finish(error);
                });
                upstreamResponse.on('aborted', function () {
                    finish(new Error('upstream_aborted'));
                });
            });

            request.setTimeout(UPSTREAM_TIMEOUT_MS, function () {
                finish(new Error('upstream_timeout'));
                request.destroy();
            });
            request.on('error', function (error) {
                finish(error);
            });
            request.end(body);
        } catch (error) {
            finish(error);
        }
    });
}

async function handleChat(req, res) {
    if (rateLimited(req, res)) return;

    const contentType = String(req.headers['content-type'] || '');
    if (contentType && contentType.indexOf('application/json') === -1) {
        writeJson(res, 415, { error: 'content_type', message: '请使用 JSON 格式。' });
        return;
    }

    let raw;
    try {
        raw = await readBody(req, MAX_BODY_BYTES);
    } catch (error) {
        if (error && error.message === 'body_too_large') {
            writeJson(res, 413, { error: 'too_large', message: '请求内容太大了。' });
        } else {
            writeJson(res, 400, { error: 'bad_request', message: '请求没有读完。' });
        }
        return;
    }

    let payload;
    try {
        payload = JSON.parse(raw);
    } catch (error) {
        writeJson(res, 400, { error: 'bad_json', message: '请求格式不正确。' });
        return;
    }

    const checked = validateMessages(payload && payload.messages);
    if (!checked.ok) {
        writeJson(res, 400, { error: 'invalid_messages', message: checked.error });
        return;
    }

    if (!API_KEY) {
        writeJson(res, 503, { error: 'ai_unavailable', message: 'AI 暂时没有连接，使用星际题库也能玩。' });
        return;
    }

    if (activeUpstreamRequests >= MAX_CONCURRENT) {
        writeJson(res, 503, { error: 'busy', message: '现在提问的小朋友有点多，请稍后再试。' }, {
            'Retry-After': '8'
        });
        return;
    }

    const temperature = clamp(
        typeof payload.temperature === 'number' ? payload.temperature : 0.85,
        0,
        1.3,
        0.85
    );
    const maxTokens = Math.round(clamp(
        typeof payload.max_tokens === 'number' ? payload.max_tokens : 700,
        64,
        1200,
        700
    ));

    activeUpstreamRequests += 1;
    try {
        const content = await upstreamRequest({
            model: MODEL,
            messages: checked.messages,
            temperature: temperature,
            max_tokens: maxTokens,
            stream: false
        });
        writeJson(res, 200, { content: content });
    } catch (error) {
        if (error && error.status === 429) {
            writeJson(res, 429, { error: 'busy', message: 'AI 现在有点忙，请稍后再试。' }, {
                'Retry-After': '15'
            });
        } else if (error && error.code === 'ai_unavailable') {
            writeJson(res, 503, { error: 'ai_unavailable', message: 'AI 暂时没有连接。' });
        } else {
            writeJson(res, 502, { error: 'ai_failed', message: 'AI 暂时没有回答，换星际题库试试。' });
        }
    } finally {
        activeUpstreamRequests = Math.max(0, activeUpstreamRequests - 1);
    }
}

function handleHealth(req, res) {
    writeJson(res, 200, {
        ok: true,
        ai: !!API_KEY,
        mode: 'proxy'
    });
}

function isBlockedPath(relativePath) {
    const segments = relativePath.split(/[\\/]+/).filter(Boolean);
    for (let i = 0; i < segments.length; i++) {
        // Windows 会忽略文件名末尾的点和空格，先归一化再判断，避免绕过。
        const segment = segments[i].toLowerCase().replace(/[ .]+$/g, '');
        if (!segment) return true;
        if (segment.startsWith('.')) return true;
        if (segment === 'server.js') return true;
        if (segment === 'secrets.json') return true;
        if (/\.(key|pem|p12|pfx)$/.test(segment)) return true;
        // 即使没有配置环境变量，也不能把可能含 Key 的本机配置文件发给其他设备。
        // 需要本机直连测试时，请用 python -m http.server 或直接打开 index.html。
        if (segment === 'config.js' || segment === 'config.local.js') return true;
    }
    return false;
}

function serveStatic(req, res) {
    let pathname;
    try {
        pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    } catch (error) {
        writeText(res, 400, 'Bad request');
        return;
    }
    if (pathname === '/') pathname = '/index.html';
    if (pathname.indexOf('\u0000') !== -1) {
        writeText(res, 400, 'Bad request');
        return;
    }

    const relative = pathname.replace(/^\/+/, '');
    // 冒号在静态文件 URL 中没有用途，但在 Windows 上可能被用来访问 NTFS 数据流。
    if (relative.indexOf(':') !== -1 || isBlockedPath(relative)) {
        writeText(res, 404, 'Not found');
        return;
    }

    const candidate = path.resolve(ROOT, relative);
    if (candidate !== ROOT && candidate.indexOf(ROOT + path.sep) !== 0) {
        writeText(res, 403, 'Forbidden');
        return;
    }

    fs.realpath(candidate, function (realError, realPath) {
        if (realError) {
            writeText(res, 404, 'Not found');
            return;
        }
        if (realPath !== ROOT && realPath.indexOf(ROOT + path.sep) !== 0) {
            writeText(res, 403, 'Forbidden');
            return;
        }
        // 短文件名、符号链接解析后的真实路径也要再检查一次。
        if (isBlockedPath(path.relative(ROOT, realPath))) {
            writeText(res, 404, 'Not found');
            return;
        }
        fs.stat(realPath, function (statError, stat) {
            if (statError || !stat.isFile()) {
                writeText(res, 404, 'Not found');
                return;
            }
            const extension = path.extname(realPath).toLowerCase();
            const contentType = MIME_TYPES[extension] || 'application/octet-stream';
            const headers = securityHeaders({
                'Content-Type': contentType,
                'Content-Length': stat.size,
                'Cache-Control': extension === '.html' ? 'no-cache' : 'public, max-age=300'
            });
            res.writeHead(200, headers);
            if (req.method === 'HEAD') {
                res.end();
                return;
            }
            const stream = fs.createReadStream(realPath);
            stream.on('error', function () {
                if (!res.headersSent) writeText(res, 500, 'Server error');
                else res.destroy();
            });
            stream.pipe(res);
        });
    });
}

const server = http.createServer(function (req, res) {
    let pathname;
    try {
        pathname = new URL(req.url, 'http://localhost').pathname;
    } catch (error) {
        writeJson(res, 400, { error: 'bad_request' });
        return;
    }

    if (pathname === '/api/health') {
        if (req.method !== 'GET' && req.method !== 'HEAD') {
            writeJson(res, 405, { error: 'method_not_allowed' }, { 'Allow': 'GET, HEAD' });
            return;
        }
        handleHealth(req, res);
        return;
    }

    if (pathname === '/api/chat') {
        if (req.method !== 'POST') {
            writeJson(res, 405, { error: 'method_not_allowed' }, { 'Allow': 'POST' });
            return;
        }
        handleChat(req, res).catch(function (error) {
            console.error('[spacepet] chat handler failed:', error && error.message ? error.message : 'unknown');
            if (!res.headersSent) {
                writeJson(res, 500, { error: 'server_error' });
            } else {
                try { res.end(); } catch (endError) { /* ignore */ }
            }
        });
        return;
    }

    if (pathname.indexOf('/api/') === 0) {
        writeJson(res, 404, { error: 'not_found' });
        return;
    }

    if (req.method !== 'GET' && req.method !== 'HEAD') {
        writeText(res, 405, 'Method not allowed');
        return;
    }

    serveStatic(req, res);
});

server.on('clientError', function (error, socket) {
    if (!socket.writable) return;
    socket.end('HTTP/1.1 400 Bad Request\r\nConnection: close\r\n\r\n');
});

server.listen(PORT, HOST, function () {
    const mode = API_KEY ? 'AI 代理已启用' : 'AI 未配置，将使用本地星际题库';
    console.log('[spacepet] listening on http://' + HOST + ':' + PORT + ' — ' + mode);
    console.log('[spacepet] 提示：生产环境请用环境变量 DEEPSEEK_API_KEY，不要把 Key 写进前端。');
});

const cleanupTimer = setInterval(function () {
    const timestamp = now();
    rateBuckets.forEach(function (bucket, key) {
        if (timestamp - bucket.startedAt > 5 * 60 * 1000) rateBuckets.delete(key);
    });
}, 5 * 60 * 1000);
cleanupTimer.unref();

function shutdown(signal) {
    console.log('[spacepet] ' + signal + ' received, closing...');
    clearInterval(cleanupTimer);
    server.close(function () {
        upstreamAgent.destroy();
        process.exit(0);
    });
    setTimeout(function () {
        upstreamAgent.destroy();
        process.exit(1);
    }, 5000).unref();
}

process.on('SIGTERM', function () { shutdown('SIGTERM'); });
process.on('SIGINT', function () { shutdown('SIGINT'); });
