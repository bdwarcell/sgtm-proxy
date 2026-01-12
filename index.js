const http = require('http');
const httpProxy = require('http-proxy');
const Redis = require('ioredis');

// 1. Initialize Redis Connection
const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
const redis = new Redis(redisUrl);

redis.on('connect', () => console.log('✅ Connected to Redis'));
redis.on('error', (err) => console.error('❌ Redis Error:', err));

// 2. Initialize Proxy Server
const proxy = httpProxy.createProxyServer({
    xfwd: true, // Adds X-Forwarded-For headers
    secure: false // Disable SSL verification for internal container traffic if needed
});

// Global Error Handler for Proxy
proxy.on('error', (err, req, res) => {
    console.error('❌ Proxy Error:', err.message);
    if (!res.headersSent) {
        res.writeHead(502, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Bad Gateway', message: 'Could not reach sGTM container' }));
    }
});

// 3. Create HTTP Server
const server = http.createServer(async (req, res) => {
    // Health Check Endpoint
    if (req.url === '/health' || req.url === '/healthy') {
        res.writeHead(200);
        return res.end('OK');
    }

    const host = req.headers.host;

    if (!host) {
        res.writeHead(400);
        return res.end('Missing Host Header');
    }

    try {
        // 4. Redis Lookup: Get Target URL
        const routeKey = `route:${host}`;
        const target = await redis.get(routeKey);

        if (!target) {
            console.warn(`⚠️ No route found for host: ${host}`);
            res.writeHead(404);
            return res.end('Route not found');
        }

        // 5. Billing: Fire and forget counter increment
        const usageKey = `usage:${host}`;
        redis.incr(usageKey).catch(err => console.error('⚠️ Failed to increment usage:', err));

        // 6. Forward Traffic
        // native http + http-proxy preserves the stream automatically (POST body intact)
        proxy.web(req, res, { target: target }, (e) => {
            // This callback is only for errors in the `proxy.web` call setup itself,
            // connection errors are handled by proxy.on('error') above.
            console.error('Proxy web error:', e);
        });

    } catch (error) {
        console.error('❌ Internal Server Error:', error);
        if (!res.headersSent) {
            res.writeHead(500);
            res.end('Internal Server Error');
        }
    }
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`🚀 sGTM Proxy running on port ${PORT}`);
});