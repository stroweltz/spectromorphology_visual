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
        server.middlewares.use('/api/perf', (req, res) => {
          if (req.method === 'POST') {
            let body = '';
            req.on('data', chunk => { body += chunk; });
            req.on('end', () => {
              try {
                const data = JSON.parse(body);
                fs.writeFileSync(path.resolve('.perf_report.json'), JSON.stringify(data, null, 2), 'utf-8');
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

