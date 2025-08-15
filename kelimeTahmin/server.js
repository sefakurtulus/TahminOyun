const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const fs = require('fs');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

const PORT = process.env.PORT || 3000;

app.use(express.static('public'));

const KELIME_SOZLUGU = {};
const turkceHarfler = "abcçdefgğhıijklmnoöprsştuüvyz".split('');

console.log('Kelime sözlükleri yükleniyor...');
turkceHarfler.forEach(harf => {
    try {
        const dosyaYolu = path.join(__dirname, 'sozluk', `${harf}.txt`);
        const data = fs.readFileSync(dosyaYolu, 'utf8');
        KELIME_SOZLUGU[harf] = new Set(data.split(/\r?\n/).filter(k => k.length > 0));
    } catch (err) {
        // console.warn(`Uyarı: sozluk/${harf}.txt dosyası bulunamadı.`);
    }
});
console.log('Kelime sözlükleri yüklendi.');

function compareWords(secret, guess) {
    if (!secret || !guess || secret.length !== guess.length) return [];
    const secretChars = secret.toLowerCase().split('');
    const guessChars = guess.toLowerCase().split('');
    const result = new Array(secret.length).fill('absent');
    const secretLetterCounts = {};
    for (let i = 0; i < secret.length; i++) {
        if (guessChars[i] === secretChars[i]) {
            result[i] = 'correct';
        } else {
            secretLetterCounts[secretChars[i]] = (secretLetterCounts[secretChars[i]] || 0) + 1;
        }
    }
    for (let i = 0; i < secret.length; i++) {
        if (result[i] !== 'correct' && secretLetterCounts[guessChars[i]] > 0) {
            result[i] = 'misplaced';
            secretLetterCounts[guessChars[i]]--;
        }
    }
    return result;
}

function isWordValid(word) {
    if (!word) return false;
    const firstLetter = word[0].toLowerCase();
    const wordSet = KELIME_SOZLUGU[firstLetter];
    return wordSet && wordSet.has(word.toLowerCase());
}

let rooms = {};

io.on('connection', (socket) => {
    console.log('Bir kullanıcı bağlandı:', socket.id);

    socket.on('createRoom', (options) => {
        let { wordLength = 5 } = options;
        // Gelen değeri sayıya çevirmeye çalış, '2-3' gibi bir string ise NaN olacak
        const numericWordLength = parseInt(wordLength);

        // DEĞİŞTİ: Gelen 'wordLength' değerini kontrol et. Ya belirli sayılardan biri ya da '2-3' string'i olmalı.
        const validLengths = [4, 5, 6, 7];
        if (!validLengths.includes(numericWordLength) && wordLength !== '2-3') {
            return; // Geçersiz seçenek ise odayı kurma
        }

        let roomId;
        do { roomId = Math.random().toString(36).substring(2, 8).toUpperCase(); } while (rooms[roomId]);
        socket.join(roomId);
        rooms[roomId] = { players: [{ id: socket.id, word: null }], wordLength }; // '2-3' ise string olarak saklanacak
        socket.roomId = roomId;
        socket.emit('roomCreated', roomId);
    });

    socket.on('joinRoom', (roomId) => {
        roomId = roomId.toUpperCase();
        const room = rooms[roomId];
        if (!room) return socket.emit('showError', 'Oda bulunamadı!');
        if (room.players.length >= 2) return socket.emit('showError', 'Bu oda zaten dolu!');
        socket.join(roomId);
        room.players.push({ id: socket.id, word: null });
        socket.roomId = roomId;
        io.to(roomId).emit('gameStart', { wordLength: room.wordLength });
    });

    socket.on('setWord', (word) => {
        const roomId = socket.roomId;
        const room = rooms[roomId];
        if (!room) return;
        const cleanWord = word.trim().toLowerCase();

        // DEĞİŞTİ: Kelime uzunluğunu esnek kontrol et
        let isValidLength = false;
        if (room.wordLength === '2-3') {
            isValidLength = (cleanWord.length === 2 || cleanWord.length === 3);
        } else {
            isValidLength = (cleanWord.length === room.wordLength);
        }

        if (!isValidLength || !isWordValid(cleanWord)) {
            const message = room.wordLength === '2-3' ?
                'Lütfen 2 veya 3 harfli geçerli bir kelime girin.' :
                `Lütfen ${room.wordLength} harfli geçerli bir kelime girin.`;
            return socket.emit('showError', message);
        }

        const player = room.players.find(p => p.id === socket.id);
        if (player) player.word = cleanWord;
        socket.emit('updateStatus', 'Rakibin kelimesini belirlemesi bekleniyor...');

        if (room.players.length === 2 && room.players.every(p => p.word)) {
            room.turn = room.players[0].id;
            io.to(roomId).emit('updateStatus', 'Oyun başlıyor! Sıra ilk oyuncuda.');
            io.to(roomId).emit('turnChange', room.turn);
        }
    });

    socket.on('makeGuess', (guess) => {
        const roomId = socket.roomId;
        const room = rooms[roomId];
        if (!room || room.turn !== socket.id) return;

        const cleanGuess = guess.trim().toLowerCase();
        const opponent = room.players.find(p => p.id !== socket.id);
        if (!opponent || !opponent.word) return;

        // DEĞİŞTİ: Tahmin uzunluğunu kelime uzunluğuna göre kontrol et
        if (cleanGuess.length !== opponent.word.length || !isWordValid(cleanGuess)) {
            return socket.emit('showError', `Geçersiz tahmin. Lütfen ${opponent.word.length} harfli geçerli bir kelime girin.`);
        }

        const player = room.players.find(p => p.id === socket.id);
        if (!player) return;

        const result = compareWords(opponent.word, cleanGuess);
        socket.emit('guessResult', { guess: cleanGuess, result });
        socket.to(roomId).emit('opponentGuessed', { guess: cleanGuess, result });

        const isWin = result.every(status => status === 'correct');
        if (isWin) {
            const winData = { yourWord: player.word, opponentWord: opponent.word };
            const loseData = { yourWord: opponent.word, opponentWord: player.word };
            socket.emit('gameWin', winData);
            socket.to(roomId).emit('gameLose', loseData);
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