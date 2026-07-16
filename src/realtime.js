import { Server } from 'socket.io';
import jwt from 'jsonwebtoken';

// ══════════════════════════════════════════════════════════════════════════════
//  REALTIME — Socket.IO para notificar al dashboard en vivo (pedidos web, etc.)
//  El payload de "nuevo-pedido-web" incluye nombre/celular del cliente, así que
//  solo admins autenticados (mismo JWT que usa verificarToken) pueden conectarse.
// ══════════════════════════════════════════════════════════════════════════════

let io = null;

export function initRealtime(httpServer) {
  io = new Server(httpServer, {
    cors: { origin: '*' },
  });

  io.use((socket, next) => {
    const token = socket.handshake.auth?.token;
    if (!token) return next(new Error('unauthorized'));
    try {
      socket.data.user = jwt.verify(token, process.env.JWT_SECRET);
      next();
    } catch {
      next(new Error('unauthorized'));
    }
  });

  io.on('connection', (socket) => {
    socket.join('verificacion');
  });

  return io;
}

export function getIO() {
  return io;
}
