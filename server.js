const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const fs = require('fs');
const path = require('path');

// =======================================================================
// === ORTAK KODLAR VE KÜTÜPHANELER ======================================
// =======================================================================

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

const PORT = process.env.PORT || 3000;

// --- Statik Dosya Sunucuları ---
app.use(express.static(path.join(__dirname, 'public')));
app.use('/kelime', express.static(path.join(__dirname, 'kelimeTahmin/public')));
app.use('/sayi', express.static(path.join(__dirname, 'sayiTahmin/public')));

// --- Ana Sayfa Yönlendirmesi ---
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// --- Oda Yönetimi için Global Değişkenler ---
let kelimeRooms = {};
let sayiRooms = {};
// =======================================================================
// === KELİME OYUNU BÖLÜMÜ ===============================================
// =======================================================================

// --- Kelime Oyunu Altyapısı (Yardımcı Fonksiyonlar) ---

// YENİ VE DAHA SAĞLAM YAPI: Tek, birleşik bir kelime seti
const TUM_KELIMELER = new Set();

// YENİ: Türkçe karakterleri güvenli bir şekilde işlemek için yardımcı fonksiyon
function normalizeAndLower(text) {
    if (!text) return '';
    return text.toLocaleLowerCase('tr-TR').normalize("NFC");
}

console.log('Kelime sözlükleri yükleniyor...');
try {
    const sozlukKlasoru = path.join(__dirname, 'kelimeTahmin/sozluk');
    const dosyalar = fs.readdirSync(sozlukKlasoru); // sozluk klasöründeki tüm dosyaları oku

    dosyalar.forEach(dosya => {
        if (dosya.endsWith('.txt')) {
            const dosyaYolu = path.join(sozlukKlasoru, dosya);
            const data = fs.readFileSync(dosyaYolu, 'utf8');
            data.split(/\r?\n/).forEach(kelime => {
                if (kelime.length > 0) {
                    TUM_KELIMELER.add(normalizeAndLower(kelime));
                }
            });
        }
    });
    console.log(`Toplam ${TUM_KELIMELER.size} kelime başarıyla yüklendi.`);
} catch (err) {
    console.error("HATA: Sözlük klasörü okunamadı!", err);
}


function compareWords(secret, guess) {
    if (!secret || !guess || secret.length !== guess.length) return [];
    const secretChars = normalizeAndLower(secret).split(''),
        guessChars = normalizeAndLower(guess).split('');
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

// DÜZELTİLDİ: Artık tek ve büyük sözlükte arama yapıyor
function isWordValid(word) {
    if (!word) return false;
    return TUM_KELIMELER.has(normalizeAndLower(word));
}

// DÜZELTİLDİ: Kelimeleri artık tek bir yerden çekiyor
function generateRandomWordByLength(wordLength) {
    const allWords = [...TUM_KELIMELER]; // Set'i diziye çevir
    let validWords;
    if (wordLength === '2-3') {
        validWords = allWords.filter(k => k.length === 2 || k.length === 3);
    } else {
        validWords = allWords.filter(k => k.length === parseInt(wordLength));
    }
    if (validWords.length === 0) return null;
    return validWords[Math.floor(Math.random() * validWords.length)];
}

function getBotWordGuess(room) {
    const { possibleWords, difficulty, wordLength } = room;
    if (difficulty === 'easy') return generateRandomWordByLength(wordLength);
    if (possibleWords && possibleWords.length > 0) return possibleWords[Math.floor(Math.random() * possibleWords.length)];
    return generateRandomWordByLength(wordLength);
}

// --- Kelime Oyunu Socket Mantığı ---
const kelimeNsp = io.of('/kelime');
kelimeNsp.on('connection', (socket) => {
    console.log('Bir kullanıcı KELİME oyununa bağlandı:', socket.id);

    function botPlay(roomId) {
        const room = kelimeRooms[roomId];
        if (!room || !room.players.find(p => p.isBot)) return;
        const guess = getBotWordGuess(room);
        const humanPlayer = room.players.find(p => !p.isBot);
        if (!humanPlayer || !humanPlayer.word || !guess) return;
        const result = compareWords(humanPlayer.word, guess);
        if (room.difficulty !== 'easy') {
            room.possibleWords = room.possibleWords.filter(pWord => {
                const res = compareWords(pWord, guess);
                return JSON.stringify(res) === JSON.stringify(result);
            });
        }
        kelimeNsp.to(humanPlayer.id).emit('opponentGuessed', { guess, result });
        const isWin = result.every(s => s === 'correct');
        if (isWin) {
            const botPlayer = room.players.find(p => p.isBot);
            kelimeNsp.to(humanPlayer.id).emit('gameLose', { yourWord: humanPlayer.word, opponentWord: botPlayer.word });
            delete kelimeRooms[roomId];
        } else {
            room.turn = humanPlayer.id;
            const data = { turn: humanPlayer.id, lengthToGuess: room.players.find(p => p.isBot).word.length };
            kelimeNsp.to(humanPlayer.id).emit('turnChange', data);
        }
    }

    socket.on('createRoom', (options) => {
        let { wordLength = 5 } = options;
        const numericWordLength = parseInt(wordLength);
        const validLengths = [4, 5, 6, 7];
        if (!validLengths.includes(numericWordLength) && wordLength !== '2-3') return;
        let roomId;
        do { roomId = Math.random().toString(36).substring(2, 6).toUpperCase(); } while (kelimeRooms[roomId]);
        socket.join(roomId);
        kelimeRooms[roomId] = { players: [{ id: socket.id, word: null, isBot: false }], wordLength };
        socket.roomId = roomId;
        socket.emit('roomCreated', roomId);
    });

    socket.on('createBotRoom', (options) => {
        const { wordLength = 5, difficulty = 'normal' } = options;
        const botWord = generateRandomWordByLength(wordLength);
        if (!botWord) {
            const errorMsg = (wordLength === '2-3') ? '2 veya 3 harfli' : `${wordLength} harfli`;
            return socket.emit('showError', `Sözlükte ${errorMsg} hiç kelime bulunamadı. Lütfen başka bir uzunluk seçin.`);
        }
        let roomId;
        do { roomId = Math.random().toString(36).substring(2, 6).toUpperCase(); } while (kelimeRooms[roomId]);
        socket.join(roomId);
        const players = [{ id: socket.id, word: null, isBot: false }, { id: 'BOT', word: botWord, isBot: true }];

        // DÜZELTİLDİ: Olası kelimeleri oluşturmak için `generateRandomWordByLength` değil, doğrudan filtreleme yapılıyor.
        const allWords = [...TUM_KELIMELER];
        let possibleWords;
        if (wordLength === '2-3') {
            possibleWords = allWords.filter(k => k.length === 2 || k.length === 3);
        } else {
            possibleWords = allWords.filter(k => k.length === parseInt(wordLength));
        }

        kelimeRooms[roomId] = { players, wordLength, difficulty, possibleWords };
        socket.roomId = roomId;
        kelimeNsp.to(socket.id).emit('updateStatus', `Bot (${difficulty}) ile oyun başladı!`);
        kelimeNsp.to(socket.id).emit('gameStart', { wordLength });
    });

    socket.on('joinRoom', (roomId) => {
        roomId = roomId.toUpperCase();
        const room = kelimeRooms[roomId];
        if (!room) return socket.emit('showError', 'Oda bulunamadı!');
        if (room.players.length >= 2 || room.players.find(p => p.isBot)) return socket.emit('showError', 'Bu odaya katılamazsınız!');
        socket.join(roomId);
        room.players.push({ id: socket.id, word: null, isBot: false });
        socket.roomId = roomId;
        kelimeNsp.to(roomId).emit('gameStart', { wordLength: room.wordLength });
    });

    socket.on('setWord', (word) => {
        const roomId = socket.roomId;
        const room = kelimeRooms[roomId];
        if (!room) return;
        const cleanWord = normalizeAndLower(word.trim()); // DÜZELTİLDİ
        let isValidLength = (room.wordLength === '2-3') ? (cleanWord.length === 2 || cleanWord.length === 3) : (cleanWord.length === parseInt(room.wordLength));
        if (!isValidLength || !isWordValid(cleanWord)) {
            const msg = (room.wordLength === '2-3') ? '2 veya 3 harfli geçerli bir kelime girin.' : `${room.wordLength} harfli geçerli bir kelime girin.`;
            return socket.emit('showError', msg);
        }
        const player = room.players.find(p => p.id === socket.id);
        if (player) player.word = cleanWord;
        const isBotGame = room.players.find(p => p.isBot);
        if (isBotGame) {
            room.turn = player.id;
            const data = { turn: player.id, lengthToGuess: room.players.find(p => p.isBot).word.length };
            kelimeNsp.to(roomId).emit('updateStatus', 'Oyun başlıyor! İlk sıra sende.');
            kelimeNsp.to(roomId).emit('turnChange', data);
        } else if (room.players.length === 2 && room.players.every(p => p.word)) {
            const p1 = room.players[0];
            const p2 = room.players[1];
            room.turn = p1.id;
            kelimeNsp.to(p1.id).emit('turnChange', { turn: p1.id, lengthToGuess: p2.word.length });
            kelimeNsp.to(p2.id).emit('turnChange', { turn: p1.id, lengthToGuess: p1.word.length });
        } else {
            socket.emit('updateStatus', 'Rakibin kelimesini belirlemesi bekleniyor...');
        }
    });

    socket.on('makeGuess', (guess) => {
        const roomId = socket.roomId;
        const room = kelimeRooms[roomId];
        if (!room || room.turn !== socket.id) return;
        const cleanGuess = normalizeAndLower(guess.trim()); // DÜZELTİLDİ
        const opponent = room.players.find(p => p.id !== socket.id);
        if (!opponent || !opponent.word) return;
        if (cleanGuess.length !== opponent.word.length || !isWordValid(cleanGuess)) {
            return socket.emit('showError', `Geçersiz tahmin. Lütfen ${opponent.word.length} harfli geçerli bir kelime girin.`);
        }
        const player = room.players.find(p => p.id === socket.id);
        if (!player) return;
        const result = compareWords(opponent.word, cleanGuess);
        socket.emit('guessResult', { guess: cleanGuess, result });
        if (!opponent.isBot) socket.to(roomId).emit('opponentGuessed', { guess: cleanGuess, result });
        const isWin = result.every(status => status === 'correct');
        if (isWin) {
            const winData = { yourWord: player.word, opponentWord: opponent.word };
            const loseData = { yourWord: opponent.word, opponentWord: player.word };
            socket.emit('gameWin', winData);
            if (!opponent.isBot) socket.to(roomId).emit('gameLose', loseData);
            delete kelimeRooms[roomId];
        } else {
            room.turn = opponent.id;
            if (opponent.isBot) {
                setTimeout(() => botPlay(roomId), 1000);
            } else {
                const p1 = room.players[0];
                const p2 = room.players[1];
                kelimeNsp.to(p1.id).emit('turnChange', { turn: room.turn, lengthToGuess: p2.word.length });
                kelimeNsp.to(p2.id).emit('turnChange', { turn: room.turn, lengthToGuess: p1.word.length });
            }
        }
    });

    socket.on('disconnect', () => {
        console.log('Bir kullanıcı KELİME oyunundan ayrıldı:', socket.id);
        const roomId = socket.roomId;
        if (kelimeRooms[roomId]) {
            kelimeNsp.to(roomId).emit('opponentLeft');
            delete kelimeRooms[roomId];
        }
    });
});

// =======================================================================
// === SAYI OYUNU BÖLÜMÜ =================================================
// =======================================================================

// --- Sayı Oyunu Altyapısı (Yardımcı Fonksiyonlar) ---
function compareNumbers(secret, guess) {
    let plus = 0,
        minus = 0;
    const secretDigits = secret.split(''),
        guessDigits = guess.split('');
    const secretFreq = {};
    for (let i = 0; i < secret.length; i++) {
        if (secretDigits[i] === guessDigits[i]) {
            plus++;
            secretDigits[i] = null;
            guessDigits[i] = null;
        } else {
            secretFreq[secretDigits[i]] = (secretFreq[secretDigits[i]] || 0) + 1;
        }
    }
    for (let i = 0; i < secret.length; i++) {
        if (guessDigits[i] !== null && secretFreq[guessDigits[i]] > 0) {
            minus++;
            secretFreq[guessDigits[i]]--;
        }
    }
    return { plus, minus };
}

function generateRandomNumber(digitCount) {
    let number = '';
    for (let i = 0; i < digitCount; i++) {
        if (i === 0 && digitCount > 1) {
            number += Math.floor(Math.random() * 9) + 1;
        } else {
            number += Math.floor(Math.random() * 10);
        }
    }
    return number;
}

// --- Sayı Oyunu Socket Mantığı ---
const sayiNsp = io.of('/sayi');
sayiNsp.on('connection', (socket) => {
    console.log('Bir kullanıcı SAYI oyununa bağlandı:', socket.id);

    function botPlay(roomId) {
        const room = sayiRooms[roomId];
        if (!room || !room.players.find(p => p.isBot)) return;
        const guess = generateRandomNumber(room.digitCount);
        const humanPlayer = room.players.find(p => !p.isBot);
        if (!humanPlayer || !humanPlayer.number) return;
        const result = compareNumbers(humanPlayer.number, guess);
        sayiNsp.to(humanPlayer.id).emit('opponentGuessed', { guess, result });
        if (result.plus === room.digitCount) {
            const botPlayer = room.players.find(p => p.isBot);
            sayiNsp.to(humanPlayer.id).emit('gameLose', { yourNumber: humanPlayer.number, opponentNumber: botPlayer.number });
            delete sayiRooms[roomId];
        } else {
            room.turn = humanPlayer.id;
            sayiNsp.to(roomId).emit('turnChange', humanPlayer.id);
        }
    }

    socket.on('createRoom', (options) => {
        const { digitCount = 4 } = options;
        if (![3, 4, 5, 6].includes(digitCount)) return;
        let roomId;
        do { roomId = Math.random().toString(36).substring(2, 6).toUpperCase(); } while (sayiRooms[roomId]);
        socket.join(roomId);
        sayiRooms[roomId] = { players: [{ id: socket.id, number: null, isBot: false }], digitCount };
        socket.roomId = roomId;
        socket.emit('roomCreated', roomId);
    });

    socket.on('createBotRoom', (options) => {
        const { digitCount = 4, difficulty = 'normal' } = options;
        if (![3, 4, 5, 6].includes(digitCount)) return;
        let roomId;
        do { roomId = Math.random().toString(36).substring(2, 6).toUpperCase(); } while (sayiRooms[roomId]);
        socket.join(roomId);
        const players = [{ id: socket.id, number: null, isBot: false }, { id: 'BOT', number: generateRandomNumber(digitCount), isBot: true }];
        sayiRooms[roomId] = { players, digitCount, difficulty };
        socket.roomId = roomId;
        sayiNsp.to(socket.id).emit('updateStatus', `Bot (${difficulty}) ile oyun başladı!`);
        sayiNsp.to(socket.id).emit('gameStart', { digitCount });
    });

    socket.on('joinRoom', (roomId) => {
        const room = sayiRooms[roomId.toUpperCase()];
        if (!room) return socket.emit('showError', 'Oda bulunamadı!');
        if (room.players.length >= 2 || room.players.find(p => p.isBot)) return socket.emit('showError', 'Bu odaya katılamazsınız!');
        socket.join(roomId.toUpperCase());
        room.players.push({ id: socket.id, number: null, isBot: false });
        socket.roomId = roomId.toUpperCase();
        sayiNsp.to(roomId.toUpperCase()).emit('gameStart', { digitCount: room.digitCount });
    });

    socket.on('setNumber', (number) => {
        const roomId = socket.roomId;
        const room = sayiRooms[roomId];
        if (!room) return;
        if (number.length !== room.digitCount || !/^\d+$/.test(number)) {
            return socket.emit('showError', `Lütfen ${room.digitCount} basamaklı bir sayı girin.`);
        }
        const player = room.players.find(p => p.id === socket.id);
        if (player) player.number = number;
        const isBotGame = room.players.find(p => p.isBot);
        if (isBotGame) {
            room.turn = player.id;
            sayiNsp.to(roomId).emit('updateStatus', 'Oyun başlıyor! İlk sıra sende.');
            sayiNsp.to(roomId).emit('turnChange', room.turn);
        } else if (room.players.length === 2 && room.players.every(p => p.number)) {
            room.turn = room.players[0].id;
            sayiNsp.to(roomId).emit('updateStatus', 'Oyun başlıyor! Sıra ilk oyuncuda.');
            sayiNsp.to(roomId).emit('turnChange', room.turn);
        } else {
            socket.emit('updateStatus', 'Rakibin sayısını belirlemesi bekleniyor...');
        }
    });

    socket.on('makeGuess', (guess) => {
        const roomId = socket.roomId;
        const room = sayiRooms[roomId];
        if (!room || room.turn !== socket.id) return;
        if (!/^\d+$/.test(guess) || guess.length !== room.digitCount) return;
        const opponent = room.players.find(p => p.id !== socket.id);
        const player = room.players.find(p => p.id === socket.id);
        if (!opponent || !opponent.number || !player) return;
        const result = compareNumbers(opponent.number, guess);
        socket.emit('guessResult', { guess, result });
        if (!opponent.isBot) socket.to(roomId).emit('opponentGuessed', { guess, result });
        if (result.plus === room.digitCount) {
            const winData = { yourNumber: player.number, opponentNumber: opponent.number };
            const loseData = { yourNumber: opponent.number, opponentNumber: player.number };
            socket.emit('gameWin', winData);
            if (!opponent.isBot) socket.to(roomId).emit('gameLose', loseData);
            delete sayiRooms[roomId];
        } else {
            room.turn = opponent.id;
            sayiNsp.to(roomId).emit('turnChange', opponent.id);
            if (opponent.isBot) {
                setTimeout(() => botPlay(roomId), 1000);
            }
        }
    });

    socket.on('disconnect', () => {
        console.log('Bir kullanıcı SAYI oyunundan ayrıldı:', socket.id);
        const roomId = socket.roomId;
        if (sayiRooms[roomId]) {
            sayiNsp.to(roomId).emit('opponentLeft');
            delete sayiRooms[roomId];
        }
    });
});


// =======================================================================
// === SUNUCUYU BAŞLATMA (Ortak) =========================================
// =======================================================================
server.listen(PORT, () => {
    console.log(`Sunucu http://localhost:${PORT} adresinde çalışıyor`);
});