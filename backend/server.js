const express = require('express');
const path = require('path');
const cors = require('cors');
const fs = require('fs');
const { spawn } = require('child_process');

const app = express();
const PORT = 3001;

let lastAnalyzeTime = 0;
const ANALYZE_COOLDOWN = 6000;

app.use(cors());
app.use(express.static(path.join(__dirname, '../frontend/dist')));
app.use(express.json());

app.get('/health', (req, res) => {
    res.json({ status: 'ok' });
});

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
        
        // In Docker, always use Unix path
        const exePath = path.join(__dirname, 'build', 'pokemon-quant');
        
        console.log('Executable path:', exePath);
        
        if (!fs.existsSync(exePath)) {
            console.error('Executable NOT found at:', exePath);
            return res.status(500).json({ 
                error: 'C++ executable not found',
                path: exePath
            });
        }
        
        // Make executable readable
        fs.chmodSync(exePath, 0o755);
        
        // No need for PATH manipulation in Docker
        const cpp = spawn(exePath, [cardName]);
        let output = '';
        let stderr = '';
        
        const timeout = setTimeout(() => {
            cpp.kill();
            return res.status(500).json({ error: 'C++ process timeout (>10s)' });
        }, 10000);
        
        cpp.stdout.on('data', (data) => {
            output += data.toString();
        });
        
        cpp.stderr.on('data', (data) => {
            stderr += data.toString();
            console.log('[C++ stderr]:', data.toString());
        });
        
        cpp.on('close', (code) => {
            clearTimeout(timeout);
            console.log('C++ exit code:', code);
            
            if (code !== 0) {
                console.error('C++ exited with code:', code);
                console.error('stderr:', stderr);
                return res.status(500).json({ 
                    error: 'C++ backend failed',
                    code: code,
                    details: stderr,
                });
            }
            
            try {
                const jsonMatch = output.match(/\{[\s\S]*\}/);
                
                if (jsonMatch) {
                    const cppData = JSON.parse(jsonMatch[0]);
                    console.log('C++ Response:', cppData);
                    
                    const transformedData = {
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
                    };
                    
                    res.json(transformedData);
                } else {
                    console.error('No JSON found in output:', output);
                    res.status(500).json({ 
                        error: 'No JSON output from C++',
                        output: output.substring(0, 500)
                    });
                }
            } catch (e) {
                console.error('Parse error:', e);
                res.status(500).json({ 
                    error: 'Failed to parse C++ output: ' + e.message,
                    output: output.substring(0, 500)
                });
            }
        });
        
        cpp.on('error', (err) => {
            clearTimeout(timeout);
            console.error('Spawn error:', err);
            res.status(500).json({ 
                error: 'Failed to start C++ process: ' + err.message
            });
        });
        
    } catch (e) {
        console.error('Server error:', e);
        res.status(500).json({ error: e.message });
    }
});

app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Server running on http://0.0.0.0:${PORT}`);
    console.log(`📊 POST to http://0.0.0.0:${PORT}/api/analyze with { "card_name": "Charizard" }`);
});