// Client.js
const socket = io();

// === DOM Elementleri ===
const statusElem = document.getElementById('game-status');

const homeScreen = document.getElementById('home-screen');
const createRoomBtn = document.getElementById('create-room-btn');
const joinRoomBtn = document.getElementById('join-room-btn');
const botPlayBtn = document.getElementById('start-bot-game-btn');
const botDifficultySelect = document.getElementById('bot-difficulty-select');

const createRoomScreen = document.getElementById('create-room-screen');
const digitSelectionContainer = document.getElementById('digit-selection-container');
const waitingForPlayerContainer = document.getElementById('waiting-for-player-container');
const roomIdDisplay = document.getElementById('room-id-display');

const joinRoomScreen = document.getElementById('join-room-screen');
const roomIdInput = document.getElementById('room-id-input');
const submitJoinBtn = document.getElementById('submit-join-btn');

const setupScreen = document.getElementById('setup-screen');
const secretInput = document.getElementById('secret-number-input');
const setNumberBtn = document.getElementById('set-number-btn');

const gameScreen = document.getElementById('game-screen');
const guessInput = document.getElementById('guess-input');
const guessBtn = document.getElementById('guess-btn');
const myGuessesList = document.getElementById('my-guesses');
const opponentGuessesList = document.getElementById('opponent-guesses');

const endGameInfo = document.getElementById('end-game-info');
const endScreen = document.getElementById('end-screen');
const backToMenuBtn = document.getElementById('back-to-menu-btn');


// === GLOBAL DEĞİŞKENLER ===
let gameSettings = { digitCount: 4 };
let isBotMode = false;

// === EKRAN YÖNETİMİ VE YARDIMCI FONKSİYONLAR ===
function showScreen(screen) {
    const screens = [homeScreen, createRoomScreen, joinRoomScreen, setupScreen, gameScreen, endScreen];
    screens.forEach(s => s.classList.add('hidden'));
    screen.classList.remove('hidden');
}

function resetGameState() {
    myGuessesList.innerHTML = '';
    opponentGuessesList.innerHTML = '';
    guessInput.value = '';
    secretInput.value = '';
    secretInput.disabled = false;
    setNumberBtn.disabled = false;
    guessInput.disabled = true;
    guessBtn.disabled = true;
    endGameInfo.classList.add('hidden');
    endGameInfo.innerHTML = '';
    isBotMode = false;
    gameSettings.digitCount = 4;
    showScreen(homeScreen);
    statusElem.textContent = 'Bir seçenek seçin.';
}


// === BUTON OLAYLARI ===
createRoomBtn.addEventListener('click', () => {
    isBotMode = false;
    showScreen(createRoomScreen);
    digitSelectionContainer.classList.remove('hidden');
    waitingForPlayerContainer.classList.add('hidden');
});

botPlayBtn.addEventListener('click', () => {
    isBotMode = true;
    showScreen(createRoomScreen);
    digitSelectionContainer.classList.remove('hidden');
    waitingForPlayerContainer.classList.add('hidden');
});

document.querySelectorAll('.digit-btn').forEach(button => {
    button.addEventListener('click', (event) => {
        const digitCount = parseInt(event.target.getAttribute('data-digits'));
        if (isBotMode) {
            const difficulty = botDifficultySelect.value;
            socket.emit('createBotRoom', { digitCount, difficulty });
        } else {
            socket.emit('createRoom', { digitCount });
        }
        digitSelectionContainer.classList.add('hidden');
        waitingForPlayerContainer.classList.remove('hidden');
    });
});

joinRoomBtn.addEventListener('click', () => {
    showScreen(joinRoomScreen);
});

submitJoinBtn.addEventListener('click', () => {
    const roomId = roomIdInput.value.trim();
    if (roomId) socket.emit('joinRoom', roomId);
});

setNumberBtn.addEventListener('click', () => {
    const number = secretInput.value;
    const hasUniqueDigits = new Set(number).size === gameSettings.digitCount;
    if (number.length === gameSettings.digitCount && hasUniqueDigits && /^\d+$/.test(number)) {
        socket.emit('setNumber', number);
        secretInput.disabled = true;
        setNumberBtn.disabled = true;
    } else {
        alert(`Lütfen rakamları birbirinden farklı, ${gameSettings.digitCount} basamaklı bir sayı girin.`);
    }
});

guessBtn.addEventListener('click', () => {
    const guess = guessInput.value;
    if (guess.length === gameSettings.digitCount && /^\d+$/.test(guess)) {
        socket.emit('makeGuess', guess);
        guessInput.value = '';
    } else {
        alert(`Lütfen ${gameSettings.digitCount} basamaklı bir tahmin girin.`);
    }
});

backToMenuBtn.addEventListener('click', resetGameState);


// === SOCKET.IO OLAY DİNLEYİCİLERİ ===
socket.on('connect', resetGameState);

socket.on('roomCreated', (roomId) => {
    roomIdDisplay.textContent = roomId;
});

socket.on('joinError', (message) => {
    alert(message);
    showScreen(homeScreen);
});

socket.on('gameStart', (options) => {
    gameSettings = options;
    secretInput.maxLength = gameSettings.digitCount;
    guessInput.maxLength = gameSettings.digitCount;
    const placeholderExample = '123456'.substring(0, gameSettings.digitCount);
    secretInput.placeholder = `Örn: ${placeholderExample}`;
    guessInput.placeholder = "Tahmininiz";
    setupScreen.querySelector('p').textContent = `Rakamları farklı, ${gameSettings.digitCount} basamaklı bir sayı girin ve başlayın:`;
    showScreen(setupScreen);
});

socket.on('updateStatus', (message) => {
    statusElem.textContent = message;
});

socket.on('turnChange', (turnPlayerId) => {
    if (!setupScreen.classList.contains('hidden')) {
        showScreen(gameScreen);
    }
    if (socket.id === turnPlayerId) {
        statusElem.textContent = 'Sıra sizde! Tahmininizi yapın.';
        guessInput.disabled = false;
        guessBtn.disabled = false;
        guessInput.focus();
    } else {
        statusElem.textContent = 'Rakibin/Botun sırası...';
        guessInput.disabled = true;
        guessBtn.disabled = true;
    }
});

socket.on('guessResult', (data) => {
    const li = document.createElement('li');
    li.innerHTML = `${data.guess} -> <span class="result plus">+${data.result.plus}</span> <span class="result minus">-${data.result.minus}</span>`;
    myGuessesList.prepend(li);
});

socket.on('opponentGuessed', (data) => {
    const li = document.createElement('li');
    li.innerHTML = `${data.guess} -> <span class="result plus">+${data.result.plus}</span> <span class="result minus">-${data.result.minus}</span>`;
    opponentGuessesList.prepend(li);
});

function handleGameEnd(data, message) {
    statusElem.textContent = message;
    guessInput.disabled = true;
    guessBtn.disabled = true;
    endGameInfo.innerHTML = `Sizin sayınız: <span>${data.yourNumber}</span> | Rakibin sayısı: <span>${data.opponentNumber}</span>`;
    endGameInfo.classList.remove('hidden');
    showScreen(endScreen);
}

socket.on('gameWin', (data) => {
    handleGameEnd(data, 'Tebrikler, Kazandınız!');
});

socket.on('gameLose', (data) => {
    handleGameEnd(data, 'Kaybettiniz. Rakibiniz/Bot sayıyı buldu.');
});

socket.on('opponentLeft', () => {
    alert('Rakibiniz oyundan ayrıldı. Ana menüye yönlendiriliyorsunuz.');
    resetGameState();
});