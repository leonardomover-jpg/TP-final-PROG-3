import { useEffect } from 'react';
import { io } from 'socket.io-client';

// Singleton: una sola conexión para toda la app
const socket = io('http://localhost:3000');

export const useSocket = (event: string, handler: (data: unknown) => void) => {
  useEffect(() => {
    socket.on(event, handler);
    return () => { socket.off(event, handler); };
  }, [event, handler]);
};
