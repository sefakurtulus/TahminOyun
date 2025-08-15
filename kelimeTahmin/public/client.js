const socket = io('/kelime');

// === DOM Elementleri ===
const statusElem = document.getElementById('game-status');
const homeScreen = document.getElementById('home-screen');
const createRoomBtn = document.getElementById('create-room-btn');
const joinRoomBtn = document.getElementById('join-room-btn');
const wordLengthSelect = document.getElementById('word-length-select');
const createRoomScreen = document.getElementById('create-room-screen');
const roomIdDisplay = document.getElementById('room-id-display');
const joinRoomScreen = document.getElementById('join-room-screen');
const roomIdInput = document.getElementById('room-id-input');
const submitJoinBtn = document.getElementById('submit-join-btn');
const setupScreen = document.getElementById('setup-screen');
const secretWordInput = document.getElementById('secret-word-input');
const setWordBtn = document.getElementById('set-word-btn');
const gameScreen = document.getElementById('game-screen');
const guessInput = document.getElementById('guess-input');
const guessBtn = document.getElementById('guess-btn');
const myGuessesList = document.getElementById('my-guesses');
const opponentGuessesList = document.getElementById('opponent-guesses');
const myWordDisplay = document.getElementById('my-word-display').querySelector('span');
const endGameScreen = document.getElementById('end-game-screen');
const endGameInfo = document.getElementById('end-game-info');
const playAgainBtn = document.getElementById('play-again-btn');

// Bota karşı oyna elementleri (Eğer HTML'de varsa)
const botPlayBtn = document.getElementById('start-bot-game-btn');
const botDifficultySelect = document.getElementById('bot-difficulty-select');
const botWordLengthSelect = document.getElementById('bot-word-length-select');

let mySecretWord = '';
let gameSettings = {};

// === Ekran Yönetimi ===
function showScreen(screen) {
    [homeScreen, createRoomScreen, joinRoomScreen, setupScreen, gameScreen, endGameScreen].forEach(s => s.classList.add('hidden'));
    screen.classList.remove('hidden');
}

// === Buton Olayları ===
createRoomBtn.addEventListener('click', () => {
    const wordLength = wordLengthSelect.value;
    socket.emit('createRoom', { wordLength });
    showScreen(createRoomScreen);
});

if (botPlayBtn) {
    botPlayBtn.addEventListener('click', () => {
        const wordLength = botWordLengthSelect.value;
        const difficulty = botDifficultySelect.value;
        socket.emit('createBotRoom', { wordLength, difficulty });
    });
}

joinRoomBtn.addEventListener('click', () => {
    showScreen(joinRoomScreen);
});

submitJoinBtn.addEventListener('click', () => {
    const roomId = roomIdInput.value.trim().toUpperCase();
    if (roomId) socket.emit('joinRoom', roomId);
});

setWordBtn.addEventListener('click', () => {
    const word = secretWordInput.value.trim().toLowerCase();
    mySecretWord = word; // Artık toUpperCase yok
    socket.emit('setWord', word);
});

guessBtn.addEventListener('click', () => {
    const guess = guessInput.value.trim().toLowerCase();
    socket.emit('makeGuess', guess);
    guessInput.value = '';
});

playAgainBtn.addEventListener('click', () => window.location.reload());

// === Socket Olayları ===
socket.on('connect', () => {
    statusElem.textContent = 'Lütfen bir oyun modu seçin.';
    showScreen(homeScreen);
});

socket.on('roomCreated', (roomId) => {
    roomIdDisplay.textContent = roomId;
});

socket.on('gameStart', (options) => {
    gameSettings = options;
    let maxLength, setupText;
    if (gameSettings.wordLength === '2-3') {
        maxLength = 3;
        setupText = 'Lütfen 2 veya 3 harfli bir kelime belirleyin:';
    } else {
        maxLength = parseInt(gameSettings.wordLength);
        setupText = `Lütfen ${maxLength} harfli bir kelime belirleyin:`;
    }
    secretWordInput.maxLength = maxLength;
    setupScreen.querySelector('p').textContent = setupText;
    showScreen(setupScreen);
});

socket.on('updateStatus', (message) => {
    statusElem.textContent = message;
});

socket.on('turnChange', (data) => {
    const { turn, lengthToGuess } = data;
    // DEĞİŞTİ: Hatalı 'checkVisibility' yerine doğru kontrol yapıldı
    if (!setupScreen.classList.contains('hidden') || !createRoomScreen.classList.contains('hidden')) {
        myWordDisplay.textContent = mySecretWord;
        showScreen(gameScreen);
    }
    if (socket.id === turn) {
        statusElem.textContent = `Sıra sizde! ${lengthToGuess} harfli bir tahmin yapın.`;
        guessInput.maxLength = lengthToGuess;
        guessInput.disabled = false;
        guessBtn.disabled = false;
        guessInput.focus();
    } else {
        statusElem.textContent = 'Rakibin/Botun sırası...';
        guessInput.disabled = true;
        guessBtn.disabled = true;
    }
});

function addGuessToList(listElement, data) {
    const li = document.createElement('li');
    li.classList.add('guess-row');
    // DEĞİŞTİ: toUpperCase kaldırıldı
    const guessChars = data.guess.split('');
    const resultStates = data.result;
    guessChars.forEach((char, index) => {
        const letterBox = document.createElement('span');
        letterBox.classList.add('letter-box', resultStates[index]);
        letterBox.textContent = char;
        li.appendChild(letterBox);
    });
    listElement.prepend(li);
}

socket.on('guessResult', (data) => addGuessToList(myGuessesList, data));
socket.on('opponentGuessed', (data) => addGuessToList(opponentGuessesList, data));

function handleGameEnd(message, data) {
    statusElem.textContent = message;
    // DEĞİŞTİ: toUpperCase kaldırıldı
    const yourWordHTML = `<div class="word-display-box">Senin Kelimen: <span>${data.yourWord}</span></div>`;
    const opponentWordHTML = `<div class="word-display-box">Rakibin/Botun Kelimesi: <span>${data.opponentWord}</span></div>`;
    endGameInfo.innerHTML = yourWordHTML + opponentWordHTML;
    showScreen(endGameScreen);
}

socket.on('gameWin', (data) => handleGameEnd('Tebrikler, Kazandınız!', data));
socket.on('gameLose', (data) => handleGameEnd('Kaybettiniz. Rakibiniz/Bot kelimeyi buldu.', data));
socket.on('opponentLeft', () => {
    alert('Rakibiniz oyundan ayrıldı.');
    window.location.reload();
});
socket.on('showError', (message) => alert(message));