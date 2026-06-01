const { io } = require('socket.io-client');

const socket = io('http://localhost:3000', {
  transports: ['websocket'],
});

const userId = 'cmpsgbjc40000jmywjvvxgy3w';

socket.on('connect', () => {
  console.log('Connected:', socket.id);
  socket.emit('join:user', userId, (res) => {
    console.log('Join response:', res);
  });
});

socket.on('notification:new', (data) => {
  console.log('New notification:', data);
});

socket.on('disconnect', () => {
  console.log('Disconnected');
});
