const socket = io('/sayi');

// === DOM Elementleri ===
const statusElem = document.getElementById('game-status');
const homeScreen = document.getElementById('home-screen');
const createRoomBtn = document.getElementById('create-room-btn');
const joinRoomBtn = document.getElementById('join-room-btn');
const digitCountSelect = document.getElementById('digit-count-select');
const createRoomScreen = document.getElementById('create-room-screen');
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
const myNumberDisplay = document.getElementById('my-number-display').querySelector('span');
const endGameScreen = document.getElementById('end-game-screen');
const endGameInfo = document.getElementById('end-game-info');
const playAgainBtn = document.getElementById('play-again-btn');
const botPlayBtn = document.getElementById('start-bot-game-btn');
const botDifficultySelect = document.getElementById('bot-difficulty-select');
const botDigitCountSelect = document.getElementById('bot-digit-count-select');

let mySecretNumber = '';

function showScreen(screen) {
    [homeScreen, createRoomScreen, joinRoomScreen, setupScreen, gameScreen, endGameScreen].forEach(s => s.classList.add('hidden'));
    screen.classList.remove('hidden');
}

createRoomBtn.addEventListener('click', () => {
    const digitCount = parseInt(digitCountSelect.value);
    socket.emit('createRoom', { digitCount });
});

botPlayBtn.addEventListener('click', () => {
    const digitCount = parseInt(botDigitCountSelect.value);
    const difficulty = botDifficultySelect.value;
    socket.emit('createBotRoom', { digitCount, difficulty });
});

joinRoomBtn.addEventListener('click', () => { showScreen(joinRoomScreen); });
submitJoinBtn.addEventListener('click', () => {
    const roomId = roomIdInput.value.trim().toUpperCase();
    if (roomId) socket.emit('joinRoom', roomId);
});
setNumberBtn.addEventListener('click', () => {
    const number = secretInput.value;
    mySecretNumber = number;
    socket.emit('setNumber', number);
});
guessBtn.addEventListener('click', () => {
    const guess = guessInput.value;
    socket.emit('makeGuess', guess);
    guessInput.value = '';
});
playAgainBtn.addEventListener('click', () => window.location.reload());

socket.on('connect', () => { showScreen(homeScreen); });
socket.on('roomCreated', (roomId) => {
    roomIdDisplay.textContent = roomId;
    showScreen(createRoomScreen);
});
socket.on('gameStart', ({ digitCount }) => {
    secretInput.maxLength = digitCount;
    guessInput.maxLength = digitCount;
    setupScreen.querySelector('p').textContent = `Lütfen ${digitCount} basamaklı bir sayı belirleyin:`;
    showScreen(setupScreen);
});
socket.on('updateStatus', (message) => { statusElem.textContent = message; });
socket.on('turnChange', (turnPlayerId) => {
    if (!setupScreen.classList.contains('hidden')) {
        myNumberDisplay.textContent = mySecretNumber;
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

function addGuessToList(listElement, data) {
    const li = document.createElement('li');
    li.innerHTML = `${data.guess} -> <span class="result plus">+${data.result.plus}</span> <span class="result minus">-${data.result.minus}</span>`;
    listElement.prepend(li);
}
socket.on('guessResult', (data) => addGuessToList(myGuessesList, data));
socket.on('opponentGuessed', (data) => addGuessToList(opponentGuessesList, data));

function handleGameEnd(message, data) {
    statusElem.textContent = message;
    const yourNumberHTML = `<div class="word-display-box">Senin Sayın: <span>${data.yourNumber}</span></div>`;
    const opponentNumberHTML = `<div class="word-display-box">Rakibin/Botun Sayısı: <span>${data.opponentNumber}</span></div>`;
    endGameInfo.innerHTML = yourNumberHTML + opponentNumberHTML;
    showScreen(endGameScreen);
}
socket.on('gameWin', (data) => handleGameEnd('Tebrikler, Kazandınız!', data));
socket.on('gameLose', (data) => handleGameEnd('Kaybettiniz. Rakibiniz/Bot sayıyı buldu.', data));
socket.on('opponentLeft', () => {
    alert('Rakibiniz oyundan ayrıldı.');
    window.location.reload();
});
socket.on('showError', (message) => alert(message));