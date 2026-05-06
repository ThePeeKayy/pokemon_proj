const express = require('express');
const path = require('path');
const { spawn } = require('child_process');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.static(path.join(__dirname, '../frontend')));
app.use(express.json());

// Health check endpoint
app.get('/health', (req, res) => {
    res.json({ status: 'ok' });
});

// API endpoint - calls C++ backend
app.post('/api/analyze', (req, res) => {
    try {
        // Get path to compiled C++ executable
        const exePath = path.join(__dirname, 'bin', 'pokemon-quant');
        
        // Spawn the C++ process
        const cpp = spawn(exePath);
        let output = '';
        let error = '';
        
        // Capture stdout
        cpp.stdout.on('data', (data) => {
            output += data.toString();
        });
        
        // Capture stderr
        cpp.stderr.on('data', (data) => {
            error += data.toString();
        });
        
        // Handle process exit
        cpp.on('close', (code) => {
            if (code !== 0) {
                console.error('C++ error:', error);
                return res.status(500).json({ 
                    error: error || 'C++ backend failed',
                    code: code
                });
            }
            
            try {
                // Parse JSON from output
                // C++ outputs something like: {"price":111,"rsi":...}
                const jsonMatch = output.match(/\{[\s\S]*\}/);
                
                if (jsonMatch) {
                    const data = JSON.parse(jsonMatch[0]);
                    res.json(data);
                } else {
                    res.status(500).json({ 
                        error: 'No JSON output from C++',
                        output: output.substring(0, 200)
                    });
                }
            } catch (e) {
                res.status(500).json({ 
                    error: 'Failed to parse C++ output: ' + e.message,
                    output: output
                });
            }
        });
        
        // Handle spawn error
        cpp.on('error', (err) => {
            console.error('Spawn error:', err);
            res.status(500).json({ 
                error: 'Failed to start C++ process: ' + err.message
            });
        });
        
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// Start server
app.listen(PORT, () => {});