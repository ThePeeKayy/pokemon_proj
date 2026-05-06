const express = require('express');
const path = require('path');
const cors = require('cors');
const fs = require('fs');
const { spawn } = require('child_process');

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(express.static(path.join(__dirname, '../frontend')));
app.use(express.json());

// Health check endpoint
app.get('/health', (req, res) => {
    res.json({ status: 'ok' });
});

// API endpoint - calls C++ backend with card name
app.post('/api/analyze', (req, res) => {
    try {
        // Get card name from request body
        const cardName = req.body?.card_name || 'Charizard';
        
        console.log(`[${new Date().toISOString()}] Analyzing: ${cardName}`);
        
        // Get path to compiled C++ executable
        const buildDir = path.join(__dirname, 'build');
        let exePath;
        
        // Determine OS and set correct path
        if (process.platform === 'win32') {
            exePath = path.join(buildDir, 'pokemon-quant.exe');
        } else {
            exePath = path.join(buildDir, 'pokemon-quant');
        }
        
        console.log('Executable path:', exePath);
        
        // Check if executable exists
        if (!fs.existsSync(exePath)) {
            console.error('Executable NOT found at:', exePath);
            return res.status(500).json({ 
                error: 'C++ executable not found',
                path: exePath,
                platform: process.platform,
                hint: 'Make sure to compile: cmake --build build'
            });
        }
        
        // Make executable readable (Linux/Mac)
        if (process.platform !== 'win32') {
            fs.chmodSync(exePath, 0o755);
        }
        
        // FIX: Set up environment for C++ process
        // This ensures CURL DLLs can be found
        const env = Object.assign({}, process.env);
        
        // Add MSYS2/MinGW64 paths
        if (process.platform === 'win32') {
            // Windows: Add mingw64 bin to PATH so libcurl.dll is found
            env.PATH = 'C:\\msys64\\mingw64\\bin;' + env.PATH;
            console.log('[SPAWN] Set PATH to include MSYS2 MinGW64 bin');
        }
        
        // Spawn the C++ process with card name as argument
        const cpp = spawn(exePath, [cardName], { env: env });
        let output = '';
        let stderr = '';
        
        // Set timeout to prevent hanging
        const timeout = setTimeout(() => {
            cpp.kill();
            return res.status(500).json({ error: 'C++ process timeout (>10s)' });
        }, 10000);
        
        // Capture stdout
        cpp.stdout.on('data', (data) => {
            output += data.toString();
        });
        
        // Capture stderr (useful for debugging)
        cpp.stderr.on('data', (data) => {
            stderr += data.toString();
            console.log('[C++ stderr]:', data.toString());
        });
        
        // Handle process exit
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
                    hint: 'Exit code 3221225781 means missing DLL (likely libcurl.dll). Ensure MSYS2 PATH is set.'
                });
            }
            
            try {
                // Parse JSON from output
                const jsonMatch = output.match(/\{[\s\S]*\}/);
                
                if (jsonMatch) {
                    const cppData = JSON.parse(jsonMatch[0]);
                    console.log('C++ Response:', cppData);
                    
                    // FIX: Transform C++ output to match frontend expectations
                    // Frontend expects: 
                    // {
                    //   card_name: "...",
                    //   indicators: { price, rsi, sma20, volatility, ... }
                    //   prices: [...]
                    // }
                    
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
                        }
                    };
                    
                    console.log('Transformed Response:', transformedData);
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
        
        // Handle spawn error
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

// Start server
app.listen(PORT, () => {
    console.log(`🚀 Server running on http://localhost:${PORT}`);
    console.log(`📊 POST to http://localhost:${PORT}/api/analyze with { "card_name": "Charizard" }`);
});