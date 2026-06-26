import express from 'express';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import { app as apiApp } from './server-api.js';
import { startWhatsApp } from './services/whatsapp.js';

async function bootstrap() {
  const app = express();
  const PORT = 3000;

  // Mount API endpoints from server-api
  app.use(apiApp);

  // Vite middleware
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', async () => {
    console.log(`Server is running on port ${PORT}`);
    console.log('Starting WhatsApp bot...');
    try {
      await startWhatsApp();
    } catch (error) {
      console.error('Failed to start WhatsApp bot:', error);
    }
  });

  // Graceful shutdown
  process.on('SIGINT', async () => {
    console.log('Shutting down gracefully...');
    process.exit(0);
  });
}

bootstrap();
