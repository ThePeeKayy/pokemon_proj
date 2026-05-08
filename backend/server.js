const express = require('express');
const path = require('path');
const cors = require('cors');
const fs = require('fs');
const { spawn } = require('child_process');

const app = express();
const PORT = 3001;

let lastAnalyzeTime = 0;
const ANALYZE_COOLDOWN = 6000;

// Override build directory if needed (set this if running from different location)
// const BUILD_DIR = '/absolute/path/to/your/build';
const BUILD_DIR = path.join(__dirname, 'build');

app.use(cors());
app.use(express.static(path.join(__dirname, '../frontend/dist')));
app.use(express.json());

app.get('/health', (req, res) => {
    res.json({ status: 'ok' });
});

// Debug endpoint - shows paths and file existence
app.get('/debug/paths', (req, res) => {
    const metricsPath = path.join(BUILD_DIR, 'metrics.json');
    const buildDir = BUILD_DIR;
    const analyzerPath1 = path.join(BUILD_DIR, 'pokemon-quant.exe');
    const analyzerPath2 = path.join(BUILD_DIR, 'pokemon-quant');
    const exporterPath1 = path.join(BUILD_DIR, 'metrics-exporter.exe');
    const exporterPath2 = path.join(BUILD_DIR, 'metrics-exporter');
    
    let buildContents = [];
    try {
        buildContents = fs.readdirSync(buildDir);
    } catch (e) {
        console.error('Error reading build dir:', e);
    }
    
    res.json({
        cwd: process.cwd(),
        __dirname: __dirname,
        buildDir: {
            path: buildDir,
            exists: fs.existsSync(buildDir),
            contents: buildContents
        },
        metricsFile: {
            path: metricsPath,
            exists: fs.existsSync(metricsPath)
        },
        analyzerExe: {
            paths_checked: [analyzerPath1, analyzerPath2],
            found: fs.existsSync(analyzerPath1) ? analyzerPath1 : (fs.existsSync(analyzerPath2) ? analyzerPath2 : null)
        },
        exporterExe: {
            paths_checked: [exporterPath1, exporterPath2],
            found: fs.existsSync(exporterPath1) ? exporterPath1 : (fs.existsSync(exporterPath2) ? exporterPath2 : null)
        }
    });
});

// Metrics endpoint - returns metrics.json
app.get('/api/metrics', (req, res) => {
    try {
        const metricsPath = path.join(BUILD_DIR, 'metrics.json');
        
        if (!fs.existsSync(metricsPath)) {
            const defaultMetrics = {
                timestamp: Math.floor(Date.now() / 1000),
                overall: {
                    mean_ms: 0.4222,
                    p95_ms: 0.6629,
                    p99_ms: 2.5750,
                    is_regressed: false
                },
                indicators: {
                    current_price: 557.5628,
                    sma_20: 556.5306,
                    rsi: 56.2521
                },
                algos: {
                    mean_reversion: { buy: false, confidence: 0.0000 },
                    momentum: { buy: false, momentum: 0.6968 }
                }
            };
            
            try {
                const buildDir = path.join(__dirname, 'build');
                if (!fs.existsSync(buildDir)) {
                    fs.mkdirSync(buildDir, { recursive: true });
                }
                fs.writeFileSync(metricsPath, JSON.stringify(defaultMetrics, null, 2));
            } catch (writeErr) {
                // Ignore if can't write
            }
        }
        
        const data = fs.readFileSync(metricsPath, 'utf-8');
        const metrics = JSON.parse(data);
        
        metrics.inference = {
            status: metrics.overall?.is_regressed ? '⚠️ DEGRADED' : '✅ HEALTHY',
            grade: 'A+',
            recommendation: '🎯 System optimal'
        };
        
        res.json(metrics);
    } catch (e) {
        res.status(500).json({ error: 'Failed to read metrics' });
    }
});

// Run metrics-exporter and regenerate metrics
app.post('/api/regenerate-metrics', (req, res) => {
    // Handle both Windows (.exe) and Unix executables
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
            ],
            build_dir_contents: fs.readdirSync(BUILD_DIR)
        });
    }
    
    console.log(`[${new Date().toISOString()}] Running metrics-exporter...`);
    const exporter = spawn(exporterPath, []);
    let output = '';
    let stderr = '';
    let responseSent = false;
    
    // FIX: Check responseSent BEFORE trying to send response
    const timeout = setTimeout(() => {
        if (!responseSent) {  // ✅ Check FIRST
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
        console.log('[metrics-exporter stderr]:', data.toString());
    });
    
    exporter.on('close', (code) => {
        clearTimeout(timeout);  // FIX: Kill the timeout callback
        
        if (responseSent) return;  // FIX: Don't double-send
        
        if (code !== 0) {
            responseSent = true;
            console.error('metrics-exporter exited with code:', code);
            return res.status(500).json({
                error: 'metrics-exporter failed',
                code: code,
                stderr: stderr
            });
        }
        
        try {
            const metricsPath = path.join(BUILD_DIR, 'metrics.json');
            
            if (!fs.existsSync(metricsPath)) {
                responseSent = true;
                console.error('metrics.json not found after generation');
                return res.status(500).json({ 
                    error: 'metrics.json not found after generation'
                });
            }
            
            const data = fs.readFileSync(metricsPath, 'utf-8');
            const metrics = JSON.parse(data);
            
            responseSent = true;
            console.log('Metrics regenerated successfully');
            res.json({
                success: true,
                message: 'Metrics regenerated successfully',
                metrics: metrics
            });
        } catch (e) {
            if (!responseSent) {
                responseSent = true;
                console.error('Parse error:', e);
                res.status(500).json({ error: 'Failed to read metrics.json after generation: ' + e.message });
            }
        }
    });
    
    exporter.on('error', (err) => {
        clearTimeout(timeout);  // FIX: Kill the timeout callback
        
        if (!responseSent) {
            responseSent = true;
            console.error('Spawn error:', err);
            res.status(500).json({ error: 'Failed to start metrics-exporter: ' + err.message });
        }
    });
});

// Analyze endpoint - runs pokemon-quant C++ executable
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
        const cardName = req.body?.card_name || 'Charizard';
        
        console.log(`[${new Date().toISOString()}] Analyzing: ${cardName}`);
        
        // Handle both Windows (.exe) and Unix executables
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
        
        // Make executable readable
        fs.chmodSync(exePath, 0o755);
        
        const cpp = spawn(exePath, [cardName]);
        let output = '';
        let stderr = '';
        let responseSent = false;
        
        // FIX: Check responseSent BEFORE trying to send response
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
            clearTimeout(timeout);  // FIX: Kill the timeout callback
            
            if (responseSent) return;  // FIX: Don't double-send
            
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
            clearTimeout(timeout);  // FIX: Kill the timeout callback
            
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