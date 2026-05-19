const express = require('express');
const path = require('path');
const cors = require('cors');
const fs = require('fs');
const { spawn } = require('child_process');

const app = express();
const PORT = 3001;

const BUILD_DIR = path.join(__dirname, 'build');

const endpointCooldowns = {
    '/api/analyze':             { last: 0, ms: 6000 },
    '/api/regenerate-metrics':  { last: 0, ms: 6000 },
    '/api/concurrency':         { last: 0, ms: 10000 },
    '/api/correctness':         { last: 0, ms: 5000 },
};

const lastRequestTime = new Map();
const RATE_LIMIT_MS = 1000;

const rateLimitMiddleware = (req, res, next) => {
    const ip = req.ip || req.connection.remoteAddress;
    const now = Date.now();
    const lastTime = lastRequestTime.get(ip) ?? -Infinity;
    if (now - lastTime < RATE_LIMIT_MS) {
        const waitTime = Math.ceil((RATE_LIMIT_MS - (now - lastTime)) / 1000);
        return res.status(429).json({
            error: 'Too many requests',
            message: `Please wait ${waitTime} seconds before trying again`,
            retry_after: waitTime,
        });
    }
    lastRequestTime.set(ip, now);
    next();
};

const checkEndpointCooldown = (key) => (req, res, next) => {
    const cd = endpointCooldowns[key];
    if (!cd) return next();
    const now = Date.now();
    const remaining = cd.ms - (now - cd.last);
    if (remaining > 0) {
        return res.status(429).json({
            error: 'Endpoint on cooldown',
            message: `Please wait ${Math.ceil(remaining / 1000)} seconds`,
            retry_after: Math.ceil(remaining / 1000),
        });
    }
    cd.last = now;
    next();
};

const VALID_POKEMON = [
    'charizard', 'pikachu', 'mewtwo', 'blastoise', 'venusaur', 'gyarados',
];

app.use(cors());
app.use(express.static(path.join(__dirname, '../frontend/dist')));
app.use(express.json());

app.use((req, res, next) => {
    if (req.method === 'POST') rateLimitMiddleware(req, res, next);
    else next();
});

app.get('/health', (req, res) => res.json({ status: 'ok' }));

// ---- helpers --------------------------------------------------------------

function resolveBinary(names) {
    for (const n of names) {
        const p = path.join(BUILD_DIR, n);
        if (fs.existsSync(p)) {
            try { fs.chmodSync(p, 0o755); } catch (_) {}
            return p;
        }
    }
    return null;
}

function runChild(binary, args, { cwd, timeoutMs }) {
    return new Promise((resolve, reject) => {
        const child = spawn(binary, args, cwd ? { cwd } : {});
        let out = '', err = '';
        let timer = setTimeout(() => {
            try { child.kill('SIGKILL'); } catch (_) {}
            reject(new Error(`timeout after ${timeoutMs}ms`));
        }, timeoutMs);
        child.stdout.on('data', d => { out += d.toString(); });
        child.stderr.on('data', d => { err += d.toString(); });
        child.on('error', e => { clearTimeout(timer); reject(e); });
        child.on('close', code => {
            clearTimeout(timer);
            resolve({ code, stdout: out, stderr: err });
        });
    });
}

function readJsonIfExists(p) {
    return fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, 'utf-8')) : null;
}

// ---- /api/metrics ---------------------------------------------------------

app.get('/api/metrics', (req, res) => {
    try {
        const metrics    = readJsonIfExists(path.join(BUILD_DIR, 'metrics.json'));
        const benchmark  = readJsonIfExists(path.join(BUILD_DIR, 'benchmark.json'));
        const concurrency = readJsonIfExists(path.join(BUILD_DIR, 'concurrency.json'));
        const correctness = readJsonIfExists(path.join(BUILD_DIR, 'correctness.json'));
        res.json({ metrics, benchmark, concurrency, correctness });
    } catch (e) {
        res.status(500).json({ error: 'Failed to read metrics: ' + e.message });
    }
});

// ---- /api/regenerate-metrics ---------------------------------------------

app.post('/api/regenerate-metrics',
    checkEndpointCooldown('/api/regenerate-metrics'),
    async (req, res) => {
        let cardName = (req.body?.cardName || 'Charizard').toLowerCase().trim();
        if (!VALID_POKEMON.includes(cardName)) {
            return res.status(400).json({
                error: 'Invalid pokemon',
                message: `Pokemon must be one of: ${VALID_POKEMON.join(', ')}`,
            });
        }

        const bin = resolveBinary(['metrics-benchmark', 'metrics-benchmark.exe']);
        if (!bin) return res.status(500).json({ error: 'metrics-benchmark not found' });

        try {
            const r = await runChild(bin, [cardName], { cwd: BUILD_DIR, timeoutMs: 60000 });
            if (r.code !== 0) {
                return res.status(500).json({ error: 'metrics-benchmark failed', code: r.code });
            }
            const metrics   = readJsonIfExists(path.join(BUILD_DIR, 'metrics.json'));
            const benchmark = readJsonIfExists(path.join(BUILD_DIR, 'benchmark.json'));
            res.json({ success: true, metrics, benchmark });
        } catch (e) {
            res.status(500).json({ error: e.message });
        }
    });

// ---- /api/concurrency -----------------------------------------------------

app.post('/api/concurrency',
    checkEndpointCooldown('/api/concurrency'),
    async (req, res) => {
        const bin = resolveBinary(['bench-pool-comparison', 'bench-pool-comparison.exe']);
        if (!bin) return res.status(500).json({ error: 'bench-pool-comparison not found' });

        try {
            const r = await runChild(bin, ['1'], { cwd: BUILD_DIR, timeoutMs: 30000 });
            if (r.code !== 0) {
                return res.status(500).json({ error: 'bench failed', code: r.code, stderr: r.stderr });
            }
            const parsed = JSON.parse(r.stdout);
            fs.writeFileSync(path.join(BUILD_DIR, 'concurrency.json'), JSON.stringify(parsed, null, 2));
            res.json({ success: true, concurrency: parsed });
        } catch (e) {
            res.status(500).json({ error: e.message });
        }
    });

// ---- /api/correctness -----------------------------------------------------

app.post('/api/correctness',
    checkEndpointCooldown('/api/correctness'),
    async (req, res) => {
        const bin = resolveBinary(['test-metrics-concurrent', 'test-metrics-concurrent.exe']);
        if (!bin) return res.status(500).json({ error: 'test-metrics-concurrent not found' });

        try {
            const r = await runChild(bin, ['1'], { cwd: BUILD_DIR, timeoutMs: 60000 });
            let parsed = null;
            try { parsed = JSON.parse(r.stdout); } catch (_) {}
            const payload = {
                success: r.code === 0,
                exit_code: r.code,
                correctness: parsed,
                tsan_output: r.code !== 0 ? r.stderr.substring(0, 4000) : undefined,
            };
            fs.writeFileSync(path.join(BUILD_DIR, 'correctness.json'), JSON.stringify(payload, null, 2));
            res.json(payload);
        } catch (e) {
            res.status(500).json({ error: e.message });
        }
    });

// ---- /api/analyze ---------------------------------------------------------

app.post('/api/analyze',
    checkEndpointCooldown('/api/analyze'),
    async (req, res) => {
        let cardName = (req.body?.card_name || 'Charizard').toLowerCase().trim();
        if (!VALID_POKEMON.includes(cardName)) {
            return res.status(400).json({
                error: 'Invalid pokemon',
                message: `Pokemon must be one of: ${VALID_POKEMON.join(', ')}`,
            });
        }

        const bin = resolveBinary(['pokemon-quant.exe', 'pokemon-quant']);
        if (!bin) return res.status(500).json({ error: 'pokemon-quant not found' });

        try {
            const r = await runChild(bin, [cardName], { timeoutMs: 30000 });
            if (r.code !== 0) {
                return res.status(500).json({ error: 'pokemon-quant failed', code: r.code, details: r.stderr.substring(0, 500) });
            }
            const jsonMatch = r.stdout.match(/\{[\s\S]*\}/);
            if (!jsonMatch) {
                return res.status(500).json({ error: 'No JSON output from pokemon-quant', output: r.stdout.substring(0, 500) });
            }
            const cppData = JSON.parse(jsonMatch[0]);
            res.json({
                card_name: cppData.card || cardName,
                indicators: {
                    price:         cppData.price ?? null,
                    sma20:         cppData.sma20 ?? null,
                    rsi:           cppData.rsi ?? null,
                    volatility:    cppData.volatility ?? null,
                    bbands_upper:  cppData.bbands_upper ?? null,
                    bbands_lower:  cppData.bbands_lower ?? null,
                    macd:          cppData.macd ?? null,
                    signal_line:   cppData.signal_line ?? null,
                    buy_signal:    cppData.buy_signal ?? false,
                    sell_signal:   cppData.sell_signal ?? false,
                    latency_ms:    cppData.latency_ms ?? null,
                },
            });
        } catch (e) {
            res.status(500).json({ error: e.message });
        }
    });

app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
});