// Server.js
const express = require('express');
const http = require('http');
const socketIo = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

const PORT = process.env.PORT || 3000;

app.use(express.static('public'));

let rooms = {};

// === YARDIMCI FONKSİYONLAR ===
function compareNumbers(secret, guess) {
    if (!secret || !guess || secret.length !== guess.length) {
        return { plus: 0, minus: 0 };
    }
    let plus = 0,
        minus = 0;
    const secretDigits = secret.split(''),
        guessDigits = guess.split('');
    const digitCount = secret.length;

    for (let i = 0; i < digitCount; i++) {
        if (secretDigits[i] === guessDigits[i]) {
            plus++;
            secretDigits[i] = null;
            guessDigits[i] = null;
        }
    }
    for (let i = 0; i < digitCount; i++) {
        if (guessDigits[i] !== null) {
            const index = secretDigits.indexOf(guessDigits[i]);
            if (index !== -1) {
                minus++;
                secretDigits[index] = null;
            }
        }
    }
    return { plus, minus };
}

function generateAllPossibleNumbers(digitCount) {
    const numbers = [];
    const digits = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9'];

    function findPermutations(current, remaining) {
        if (current.length === digitCount) {
            if (digitCount > 1 && current.startsWith('0')) return;
            numbers.push(current);
            return;
        }
        for (let i = 0; i < remaining.length; i++) {
            const newCurrent = current + remaining[i];
            const newRemaining = [...remaining.slice(0, i), ...remaining.slice(i + 1)];
            findPermutations(newCurrent, newRemaining);
        }
    }
    findPermutations('', digits);
    return numbers;
}

function generateRandomUniqueNumber(digitCount) {
    const allNumbers = generateAllPossibleNumbers(digitCount);
    return allNumbers[Math.floor(Math.random() * allNumbers.length)];
}

function getBotGuess(room) {
    const { possibleNumbers, difficulty, botHistory } = room;
    if (possibleNumbers.length === 0) return null;
    if (possibleNumbers.length === 1) return possibleNumbers[0];
    if (botHistory.length === 0) return possibleNumbers[Math.floor(Math.random() * possibleNumbers.length)];

    switch (difficulty) {
        case 'easy':
            return possibleNumbers[Math.floor(Math.random() * possibleNumbers.length)];
        case 'normal':
            return possibleNumbers[Math.floor(Math.random() * possibleNumbers.length)];
        case 'hard':
            let bestGuess = null,
                minMaxGroups = Infinity;
            const candidatesToTest = possibleNumbers.length > 500 ? [...Array(100)].map(() => possibleNumbers[Math.floor(Math.random() * possibleNumbers.length)]) : possibleNumbers;
            for (let candidate of candidatesToTest) {
                const groups = {};
                for (let possible of possibleNumbers) {
                    const result = compareNumbers(possible, candidate);
                    const key = `${result.plus}-${result.minus}`;
                    groups[key] = (groups[key] || 0) + 1;
                }
                const maxGroupSize = Math.max(...Object.values(groups));
                if (maxGroupSize < minMaxGroups) {
                    minMaxGroups = maxGroupSize;
                    bestGuess = candidate;
                }
            }
            return bestGuess || possibleNumbers[0];
        default:
            return possibleNumbers[0];
    }
}

function botPlay(roomId) {
    const room = rooms[roomId];
    if (!room || !room.players.find(p => p.isBot)) return;

    const guess = getBotGuess(room);
    if (!guess) {
        room.possibleNumbers = generateAllPossibleNumbers(room.digitCount);
        room.botHistory = [];
        setTimeout(() => botPlay(roomId), 1000);
        return;
    }
    const humanPlayer = room.players.find(p => !p.isBot);
    const result = compareNumbers(humanPlayer.number, guess);
    room.botHistory.push({ guess, result });

    if (room.difficulty !== 'easy') {
        room.possibleNumbers = room.possibleNumbers.filter(num => {
            const res = compareNumbers(num, guess);
            return res.plus === result.plus && res.minus === result.minus;
        });
    }
    io.to(humanPlayer.id).emit('opponentGuessed', { guess, result });
    if (result.plus === room.digitCount) {
        io.to(humanPlayer.id).emit('gameLose', {
            yourNumber: humanPlayer.number,
            opponentNumber: room.players.find(p => p.isBot).number
        });
        delete rooms[roomId];
    } else {
        room.turn = humanPlayer.id;
        io.to(roomId).emit('turnChange', humanPlayer.id);
    }
}

io.on('connection', (socket) => {
    console.log('Bir kullanıcı bağlandı:', socket.id);

    function handleCreateRoom(options, isBotGame) {
        const { digitCount = 4, difficulty = 'normal' } = options;
        if (![3, 4, 5, 6].includes(digitCount)) return;
        let roomId;
        do { roomId = Math.random().toString(36).substring(2, 8).toUpperCase(); } while (rooms[roomId]);
        socket.join(roomId);

        const players = [{ id: socket.id, number: null, isBot: false }];
        if (isBotGame) {
            players.push({ id: 'BOT', number: generateRandomUniqueNumber(digitCount), isBot: true });
        }

        rooms[roomId] = {
            players,
            gameStarted: false,
            digitCount,
            difficulty: isBotGame ? difficulty : null,
            botHistory: isBotGame ? [] : null,
            possibleNumbers: isBotGame ? generateAllPossibleNumbers(digitCount) : null,
        };
        socket.roomId = roomId;

        if (isBotGame) {
            io.to(socket.id).emit('updateStatus', `Bot (${difficulty}) ile oyun başladı!`);
            io.to(socket.id).emit('gameStart', { digitCount });
        } else {
            socket.emit('roomCreated', roomId);
        }
    }

    socket.on('createRoom', (options) => handleCreateRoom(options, false));
    socket.on('createBotRoom', (options) => handleCreateRoom(options, true));

    socket.on('joinRoom', (roomId) => {
        roomId = roomId.toUpperCase();
        const room = rooms[roomId];
        if (!room) return socket.emit('joinError', 'Oda bulunamadı!');
        if (room.players.length >= 2 || room.players.find(p => p.isBot)) return socket.emit('joinError', 'Bu odaya katılamazsınız!');
        socket.join(roomId);
        room.players.push({ id: socket.id, number: null, isBot: false });
        socket.roomId = roomId;
        io.to(roomId).emit('updateStatus', `Oyun başlıyor!`);
        io.to(roomId).emit('gameStart', { digitCount: room.digitCount });
    });

    socket.on('setNumber', (number) => {
        const roomId = socket.roomId;
        const room = rooms[roomId];
        if (!room) return;
        const player = room.players.find(p => p.id === socket.id);
        if (!player) return;
        const hasUniqueDigits = new Set(number).size === room.digitCount;
        if (number.length !== room.digitCount || !hasUniqueDigits) return;
        player.number = number;
        socket.emit('updateStatus', 'Rakibin/Botun sayısını belirlemesi bekleniyor...');
        if (room.players.every(p => p.number !== null)) {
            room.gameStarted = true;
            const firstPlayer = room.players.find(p => !p.isBot) || room.players[0];
            room.turn = firstPlayer.id;
            io.to(roomId).emit('turnChange', room.turn);
        }
    });

    socket.on('makeGuess', (guess) => {
        const roomId = socket.roomId;
        const room = rooms[roomId];
        if (!room || room.turn !== socket.id) return;
        const opponent = room.players.find(p => p.id !== socket.id);
        if (!opponent || !opponent.number) return;
        const result = compareNumbers(opponent.number, guess);
        socket.emit('guessResult', { guess, result });
        if (!opponent.isBot) {
            io.to(opponent.id).emit('opponentGuessed', { guess, result });
        }
        if (result.plus === room.digitCount) {
            socket.emit('gameWin', {
                yourNumber: room.players.find(p => p.id === socket.id).number,
                opponentNumber: opponent.number
            });
            if (!opponent.isBot) {
                io.to(opponent.id).emit('gameLose', {
                    yourNumber: opponent.number,
                    opponentNumber: room.players.find(p => p.id === socket.id).number
                });
            }
            delete rooms[roomId];
        } else {
            room.turn = opponent.id;
            io.to(roomId).emit('turnChange', opponent.id);
            if (opponent.isBot) {
                setTimeout(() => botPlay(roomId), 1000);
            }
        }
    });

    socket.on('disconnect', () => {
        console.log('Bir kullanıcı ayrıldı:', socket.id);
        const roomId = socket.roomId;
        if (rooms[roomId]) {
            const remainingPlayer = rooms[roomId].players.find(p => p.id !== socket.id && !p.isBot);
            if (remainingPlayer) io.to(remainingPlayer.id).emit('opponentLeft');
            delete rooms[roomId];
        }
    });
});

server.listen(PORT, () => {
    console.log(`Sunucu http://localhost:${PORT} adresinde çalışıyor`);
});