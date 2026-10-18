import express from 'express';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Server } from 'socket.io';
import { TikTokLiveConnection, WebcastEvent, ControlEvent } from 'tiktok-live-connector';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: true, methods: ['GET', 'POST'] } });
const publicDir = path.resolve(__dirname, '..');
const PORT = Number(process.env.PORT || 3000);

app.disable('x-powered-by');
app.get('/health', (_req, res) => res.json({ ok: true, service: 'grayxon-live-tools-pilot' }));
app.use(express.static(publicDir, { index: 'index.html' }));

io.on('connection', socket => {
  let liveConnection = null;
  let currentUsername = '';

  const status = (message, connected = false) => socket.emit('live-status', { message, connected });

  socket.on('connect-live', async payload => {
    const username = String(payload?.username || '').trim().replace(/^@/, '');
    if (!/^[A-Za-z0-9._]{2,50}$/.test(username)) {
      status('Usuario no válido. Revisa el nombre público de TikTok.');
      return;
    }
    if (liveConnection) {
      try { await liveConnection.disconnect(); } catch {}
      liveConnection = null;
    }
    currentUsername = username;
    try {
      liveConnection = new TikTokLiveConnection(username, { enableExtendedGiftInfo: true });
      liveConnection.on(WebcastEvent.CHAT, data => {
        socket.emit('chat', {
          uniqueId: data?.user?.uniqueId || data?.uniqueId || '',
          nickname: data?.user?.nickname || data?.nickname || '',
          comment: String(data?.comment || '')
        });
      });
      liveConnection.on(WebcastEvent.GIFT, data => {
        socket.emit('gift', {
          uniqueId: data?.user?.uniqueId || data?.uniqueId || '',
          nickname: data?.user?.nickname || data?.nickname || '',
          giftId: data?.giftId,
          giftName: data?.giftDetails?.giftName || data?.extendedGiftInfo?.giftName || data?.giftName || '',
          repeatCount: data?.repeatCount || 1,
          repeatEnd: data?.repeatEnd
        });
      });
      liveConnection.on(ControlEvent.ERROR, err => {
        console.error('TikTok connector error:', err?.message || err);
        status('El conector informó un error. Puede ser temporal o por cambios de TikTok.');
      });
      await liveConnection.connect();
      status('Conectado al LIVE de @' + currentUsername, true);
    } catch (err) {
      console.error('LIVE connection failed:', err?.message || err);
      status('No se pudo conectar. Confirma que la cuenta esté EN VIVO e inténtalo otra vez.');
      try { if (liveConnection) await liveConnection.disconnect(); } catch {}
      liveConnection = null;
    }
  });

  socket.on('disconnect-live', async () => {
    if (liveConnection) {
      try { await liveConnection.disconnect(); } catch {}
      liveConnection = null;
    }
    currentUsername = '';
    status('LIVE desconectado');
  });

  socket.on('disconnect', async () => {
    if (liveConnection) {
      try { await liveConnection.disconnect(); } catch {}
      liveConnection = null;
    }
  });
});

server.listen(PORT, '0.0.0.0', () => console.log('Grayxon LIVE Tools pilot listening on port ' + PORT));