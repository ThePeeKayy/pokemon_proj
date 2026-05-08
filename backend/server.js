const express = require('express');
const path = require('path');
const cors = require('cors');
const fs = require('fs');
const { spawn } = require('child_process');

const app = express();
const PORT = 3001;

let lastAnalyzeTime = 0;
const ANALYZE_COOLDOWN = 6000;
const BUILD_DIR = path.join(__dirname, 'build');

const lastRequestTime = new Map();
const RATE_LIMIT_MS = 1000; // 1 seconds

const rateLimitMiddleware = (req, res, next) => {
    const ip = req.ip || req.connection.remoteAddress;
    const now = Date.now();
    
    if (!lastRequestTime.has(ip)) {
        lastRequestTime.set(ip, 0);
    }
    
    const lastTime = lastRequestTime.get(ip);
    const timeSinceLastRequest = now - lastTime;
    
    if (timeSinceLastRequest < RATE_LIMIT_MS) {
        const waitTime = Math.ceil((RATE_LIMIT_MS - timeSinceLastRequest) / 1000);
        console.warn(`⚠️  Rate limit hit for IP: ${ip}. Wait ${waitTime}s`);
        return res.status(429).json({ 
            error: 'Too many requests',
            message: `Please wait ${waitTime} seconds before trying again`,
            retry_after: waitTime
        });
    }
    
    lastRequestTime.set(ip, now);
    next();
};

const VALID_POKEMON = [
    'charizard',
    'pikachu',
    'mewtwo',
    'blastoise',
    'venusaur',
    'gyarados'
];

app.use(cors());
app.use(express.static(path.join(__dirname, '../frontend/dist')));
app.use(express.json());
app.use(rateLimitMiddleware);

app.get('/health', (req, res) => {
    res.json({ status: 'ok' });
});

// Metrics endpoint
app.get('/api/metrics', (req, res) => {
    try {
        const metricsPath = path.join(BUILD_DIR, 'metrics.json');
        
        if (!fs.existsSync(metricsPath)) {
            return res.status(500).json({ error: 'No json file' });
        }
        
        const data = fs.readFileSync(metricsPath, 'utf-8');
        const metrics = JSON.parse(data);
        res.json(metrics);
    } catch (e) {
        res.status(500).json({ error: 'Failed to read metrics: ' + e.message });
    }
});

// Regenerate metrics
app.post('/api/regenerate-metrics', (req, res) => {
    let cardName = req.body?.cardName || 'Charizard';
    
    cardName = cardName.toLowerCase().trim();
    if (!VALID_POKEMON.includes(cardName)) {
        return res.status(400).json({ 
            error: 'Invalid pokemon',
            message: `Pokemon must be one of: ${VALID_POKEMON.join(', ')}`
        });
    }

    let exporterPath = path.join(BUILD_DIR, 'metrics-exporter.exe');
    if (!fs.existsSync(exporterPath)) {
        exporterPath = path.join(BUILD_DIR, 'metrics-exporter');
    }
    
    if (!fs.existsSync(exporterPath)) {
        return res.status(500).json({ 
            error: 'metrics-exporter not found',
            checked_paths: [
                path.join(BUILD_DIR, 'metrics-exporter.exe'),
                path.join(BUILD_DIR, 'metrics-exporter')
            ]
        });
    }
    
    fs.chmodSync(exporterPath, 0o755);
    
    const exporter = spawn(exporterPath, [cardName], { cwd: BUILD_DIR });
    let output = '';
    let stderr = '';
    let responseSent = false;
    
    const timeout = setTimeout(() => {
        if (!responseSent) {
            responseSent = true;
            exporter.kill();
            res.status(500).json({ error: 'timeout' });
        }
    }, 60000);
    
    exporter.stdout.on('data', (data) => {
        output += data.toString();
    });
    
    exporter.stderr.on('data', (data) => {
        stderr += data.toString();
    });
    
    exporter.on('close', (code) => {
        clearTimeout(timeout);
        
        if (responseSent) return;
        
        if (code !== 0) {
            responseSent = true;
            return res.status(500).json({
                error: 'metrics-exporter failed',
                code: code
            });
        }
        
        try {
            const metricsPath = path.join(BUILD_DIR, 'metrics.json');
            
            if (!fs.existsSync(metricsPath)) {
                responseSent = true;
                return res.status(500).json({ 
                    error: 'metrics.json not found after generation'
                });
            }
            
            const data = fs.readFileSync(metricsPath, 'utf-8');
            const metrics = JSON.parse(data);
            
            responseSent = true;
            res.json({
                success: true,
                message: 'Metrics regenerated successfully',
                metrics: metrics
            });
        } catch (e) {
            if (!responseSent) {
                responseSent = true;
                res.status(500).json({ error: 'Failed to read metrics.json after generation: ' + e.message });
            }
        }
    });
    
    exporter.on('error', (err) => {
        clearTimeout(timeout);
        
        if (!responseSent) {
            responseSent = true;
            res.status(500).json({ error: 'Failed to start metrics-exporter: ' + err.message });
        }
    });
});

// Analyze endpoint
app.post('/api/analyze', (req, res) => {
    try {
        const now = Date.now();
        const timeSinceLastAnalyze = now - lastAnalyzeTime;
        const timeRemaining = ANALYZE_COOLDOWN - timeSinceLastAnalyze;
        
        if (timeSinceLastAnalyze < ANALYZE_COOLDOWN) {
            console.log(`[${new Date().toISOString()}] Rate limit hit. Remaining cooldown: ${Math.ceil(timeRemaining / 1000)}s`);
            return res.status(429).json({ 
                error: 'Analyze endpoint is on cooldown',
                message: `Please wait ${Math.ceil(timeRemaining / 1000)} seconds before trying again`,
                retry_after: Math.ceil(timeRemaining / 1000)
            });
        }
        
        lastAnalyzeTime = now;
        let cardName = req.body?.card_name || 'Charizard';
        
        cardName = cardName.toLowerCase().trim();
        if (!VALID_POKEMON.includes(cardName)) {
            return res.status(400).json({ 
                error: 'Invalid pokemon',
                message: `Pokemon must be one of: ${VALID_POKEMON.join(', ')}`
            });
        }
        
        console.log(`[${new Date().toISOString()}] Analyzing: ${cardName}`);
        
        let exePath = path.join(BUILD_DIR, 'pokemon-quant.exe');
        if (!fs.existsSync(exePath)) {
            exePath = path.join(BUILD_DIR, 'pokemon-quant');
        }
        
        console.log('Executable path:', exePath);
        
        if (!fs.existsSync(exePath)) {
            console.error('Executable NOT found at:', exePath);
            return res.status(500).json({ 
                error: 'C++ executable not found',
                checked_paths: [
                    path.join(BUILD_DIR, 'pokemon-quant.exe'),
                    path.join(BUILD_DIR, 'pokemon-quant')
                ],
                build_dir_contents: fs.readdirSync(BUILD_DIR)
            });
        }
        
        fs.chmodSync(exePath, 0o755);
        
        const cpp = spawn(exePath, [cardName]);
        let output = '';
        let stderr = '';
        let responseSent = false;
        
        const timeout = setTimeout(() => {
            if (!responseSent) {
                responseSent = true;
                cpp.kill();
                res.status(500).json({ error: 'C++ process timeout (>30s)' });
            }
        }, 30000);
        
        cpp.stdout.on('data', (data) => {
            output += data.toString();
        });
        
        cpp.stderr.on('data', (data) => {
            stderr += data.toString();
            console.log('[C++ stderr]:', data.toString());
        });
        
        cpp.on('close', (code) => {
            clearTimeout(timeout);
            
            if (responseSent) return;
            
            console.log('C++ exit code:', code);
            
            if (code !== 0) {
                responseSent = true;
                console.error('C++ exited with code:', code);
                console.error('stderr:', stderr);
                return res.status(500).json({ 
                    error: 'C++ backend failed',
                    code: code,
                    details: stderr.substring(0, 500)
                });
            }
            
            try {
                const jsonMatch = output.match(/\{[\s\S]*\}/);
                
                if (!jsonMatch) {
                    responseSent = true;
                    console.error('No JSON found in output:', output.substring(0, 500));
                    return res.status(500).json({ 
                        error: 'No JSON output from C++',
                        output: output.substring(0, 500)
                    });
                }
                
                const cppData = JSON.parse(jsonMatch[0]);
                console.log('C++ Response:', cppData);
                
                responseSent = true;
                res.json({
                    card_name: cppData.card || cardName,
                    indicators: {
                        price: cppData.price ?? null,
                        sma20: cppData.sma20 ?? null,
                        rsi: cppData.rsi ?? null,
                        volatility: cppData.volatility ?? null,
                        bbands_upper: cppData.bbands_upper ?? null,
                        bbands_lower: cppData.bbands_lower ?? null,
                        macd: cppData.macd ?? null,
                        signal_line: cppData.signal_line ?? null,
                        buy_signal: cppData.buy_signal ?? false,
                        sell_signal: cppData.sell_signal ?? false,
                        latency_ms: cppData.latency_ms ?? null,
                    }
                });
            } catch (e) {
                if (!responseSent) {
                    responseSent = true;
                    console.error('Parse error:', e);
                    res.status(500).json({ 
                        error: 'Failed to parse C++ output: ' + e.message,
                        output: output.substring(0, 500)
                    });
                }
            }
        });
        
        cpp.on('error', (err) => {
            clearTimeout(timeout);
            
            if (!responseSent) {
                responseSent = true;
                console.error('Spawn error:', err);
                res.status(500).json({ 
                    error: 'Failed to start C++ process: ' + err.message
                });
            }
        });
        
    } catch (e) {
        console.error('Unexpected server error:', e);
        res.status(500).json({ error: 'Unexpected server error: ' + e.message });
    }
});

app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Server running on http://0.0.0.0:${PORT}`);
});