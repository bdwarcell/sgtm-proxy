const http = require('http');
const httpProxy = require('http-proxy');
const Redis = require('ioredis');

// ১. প্রক্সি সার্ভার এবং রেডিস কানেকশন তৈরি
const proxy = httpProxy.createProxyServer({
    xfwd: true // অরিজিনাল IP ঠিক রাখার জন্য জরুরি
});

// Coolify থেকে REDIS_URL এনভায়রনমেন্ট ভেরিয়েবল আসবে
const redis = new Redis(process.env.REDIS_URL);

const server = http.createServer(async (req, res) => {
    try {
        const host = req.headers.host;

        // ২. Redis থেকে চেক করা: এই ডোমেইন কোন কন্টেইনারে যাবে?
        // আমরা Redis Key ফরম্যাট ধরে নিচ্ছি: "route:domain.com"
        const targetContainer = await redis.get(`route:${host}`);

        if (!targetContainer) {
            console.error(`No route found for: ${host}`);
            res.writeHead(404, { 'Content-Type': 'text/plain' });
            res.end("Tracking Error: Container not linked in SaaS Platform.");
            return;
        }

        // ৩. বিলিং কাউন্টার আপডেট করা (খুবই দ্রুত হয়)
        // Key ফরম্যাট: "usage:domain.com:2023-10" (মাসের নাম দিলে বিলিং সহজ হয়)
        // আপাতত আমরা সিম্পল রাখছি:
        redis.incr(`usage:${host}`);

        // ৪. ট্রাফিক ফরওয়ার্ড করা (sGTM এর কাছে)
        // targetContainer হতে হবে: "http://container_name:8080"
        proxy.web(req, res, { target: targetContainer }, (err) => {
            console.error("Proxy Error:", err);
            res.writeHead(502);
            res.end("Bad Gateway: sGTM Container is down.");
        });

    } catch (error) {
        console.error("System Error:", error);
        res.writeHead(500);
        res.end("Internal Server Error");
    }
});

console.log("TrackingOps Proxy Running on Port 80...");
server.listen(80);