// server.js dosyasının tamamını bununla değiştirin.

const express = require('express');
const http = require('http');
const socketIo = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

const PORT = process.env.PORT || 3000;

app.use(express.static('public'));

let rooms = {}; // Oda bilgilerini burada tutacağız

// Oyun mantığı fonksiyonu (Bu fonksiyon aynı kalıyor)
function compareNumbers(secret, guess) {
    // ... (Önceki kodda olduğu gibi, değişiklik yok)
    let plus = 0;
    let minus = 0;
    const secretDigits = secret.split('');
    const guessDigits = guess.split('');
    for (let i = 0; i < 4; i++) {
        if (secretDigits[i] === guessDigits[i]) {
            plus++;
            secretDigits[i] = null;
            guessDigits[i] = null;
        }
    }
    for (let i = 0; i < 4; i++) {
        if (guessDigits[i] !== null) {
            const indexInSecret = secretDigits.indexOf(guessDigits[i]);
            if (indexInSecret !== -1) {
                minus++;
                secretDigits[indexInSecret] = null;
            }
        }
    }
    return { plus, minus };
}

io.on('connection', (socket) => {
    console.log('Bir kullanıcı bağlandı:', socket.id);

    socket.on('createRoom', () => {
        // Benzersiz ve basit bir oda kodu üretelim
        let roomId = Math.random().toString(36).substring(2, 8).toUpperCase();
        while (rooms[roomId]) { // Eğer bu kod zaten varsa yenisini üret
            roomId = Math.random().toString(36).substring(2, 8).toUpperCase();
        }

        socket.join(roomId);
        rooms[roomId] = {
            players: [{ id: socket.id, number: null }],
            gameStarted: false
        };
        socket.roomId = roomId; // Bu soketin hangi odada olduğunu kolayca bulmak için saklayalım

        // Oda kodunu odayı kuran oyuncuya geri gönderelim
        socket.emit('roomCreated', roomId);
    });

    socket.on('joinRoom', (roomId) => {
        roomId = roomId.toUpperCase();
        const room = rooms[roomId];

        if (!room) {
            socket.emit('joinError', 'Oda bulunamadı!');
            return;
        }

        if (room.players.length >= 2) {
            socket.emit('joinError', 'Bu oda zaten dolu!');
            return;
        }

        socket.join(roomId);
        room.players.push({ id: socket.id, number: null });
        socket.roomId = roomId;

        // Oyunun başladığını odadaki herkese bildirelim
        room.gameStarted = true;
        io.to(roomId).emit('updateStatus', 'Oyun başlıyor! Lütfen 4 basamaklı sayınızı belirleyin.');
        io.to(roomId).emit('gameStart');
    });

    // Sayı belirleme ve tahmin mantıkları neredeyse aynı kalıyor, sadece roomId kullanılıyor.
    socket.on('setNumber', (number) => {
        const roomId = socket.roomId;
        if (!rooms[roomId]) return;

        const player = rooms[roomId].players.find(p => p.id === socket.id);
        if (player) {
            player.number = number;
            socket.emit('updateStatus', 'Rakibin sayısını belirlemesi bekleniyor...');
        }

        const allPlayersSet = rooms[roomId].players.length === 2 && rooms[roomId].players.every(p => p.number !== null);
        if (allPlayersSet) {
            const firstPlayerId = rooms[roomId].players[0].id;
            rooms[roomId].turn = firstPlayerId;
            io.to(roomId).emit('turnChange', firstPlayerId);
        }
    });

    socket.on('makeGuess', (guess) => {
        const roomId = socket.roomId;
        const room = rooms[roomId];
        if (!room || room.turn !== socket.id) return;

        const opponent = room.players.find(p => p.id !== socket.id);
        const result = compareNumbers(opponent.number, guess);

        socket.emit('guessResult', { guess, result });
        socket.to(roomId).emit('opponentGuessed', { guess, result });

        if (result.plus === 4) {
            socket.emit('gameWin');
            socket.to(roomId).emit('gameLose');
            delete rooms[roomId];
        } else {
            room.turn = opponent.id;
            io.to(roomId).emit('turnChange', opponent.id);
        }
    });

    socket.on('disconnect', () => {
        console.log('Bir kullanıcı ayrıldı:', socket.id);
        const roomId = socket.roomId;
        if (rooms[roomId]) {
            io.to(roomId).emit('opponentLeft');
            delete rooms[roomId];
        }
    });
});

server.listen(PORT, () => {
    console.log(`Sunucu http://localhost:${PORT} adresinde çalışıyor`);
});