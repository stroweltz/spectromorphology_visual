import { defineConfig } from 'vite';
import fs from 'fs';
import path from 'path';

export default defineConfig({
  server: {
    port: 5176,
    open: false
  },
  plugins: [
    {
      name: 'perf-logger',
      configureServer(server) {
        server.middlewares.use('/api/error', (req, res) => {
          if (req.method === 'POST') {
            let body = '';
            req.on('data', chunk => { body += chunk; });
            req.on('end', () => {
              try {
                const data = JSON.parse(body);
                const logLine = `[BROWSER ERROR ${new Date().toLocaleTimeString()}] ${data.msg}\nStack: ${data.stack || 'none'}\nAt: ${data.url}:${data.line}:${data.col}\n`;
                fs.appendFileSync(path.resolve('.browser_errors.log'), logLine, 'utf-8');
                console.error(logLine);
              } catch (e) {}
              res.statusCode = 200;
              res.setHeader('Content-Type', 'text/plain');
              res.end('ok');
            });
            return;
          }
          res.statusCode = 404;
          res.end();
        });

        server.middlewares.use('/api/perf', (req, res) => {
          if (req.method === 'POST') {
            let body = '';
            req.on('data', chunk => { body += chunk; });
            req.on('end', () => {
              try {
                const data = JSON.parse(body);
                fs.writeFileSync(path.resolve('.perf_report.json'), JSON.stringify(data, null, 2), 'utf-8');
                const logLine = `[PERF ${new Date().toLocaleTimeString()}] FPS: ${data.fps} | Frame: ${data.frameTimeMs}ms (max: ${data.maxIntervalMs}ms) | CPU: ${data.cpuMs}ms | GPU: ${data.gpuMs}ms | Trail shifts: ${data.trailShiftsPerSec ?? 'N/A'} Hz | Janks: ${data.jankFrames ?? 0}\n`;
                fs.appendFileSync(path.resolve('.perf_history.log'), logLine, 'utf-8');
                console.log(logLine.trim());
              } catch (e) {}
              res.statusCode = 200;
              res.setHeader('Content-Type', 'text/plain');
              res.end('ok');
            });
            return;
          }
          res.statusCode = 404;
          res.end();
        });
      }
    }
  ]
});

