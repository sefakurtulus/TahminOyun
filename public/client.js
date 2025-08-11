// public/client.js dosyasının tamamını bununla değiştirin
const socket = io();

// DOM Elementleri
const statusElem = document.getElementById('game-status');

const homeScreen = document.getElementById('home-screen');
const createRoomBtn = document.getElementById('create-room-btn');
const joinRoomBtn = document.getElementById('join-room-btn');

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

// Ekranları yönetmek için bir fonksiyon
function showScreen(screen) {
    homeScreen.classList.add('hidden');
    createRoomScreen.classList.add('hidden');
    joinRoomScreen.classList.add('hidden');
    setupScreen.classList.add('hidden');
    gameScreen.classList.add('hidden');
    screen.classList.remove('hidden');
}

// Buton Olayları
createRoomBtn.addEventListener('click', () => {
    socket.emit('createRoom');
});

joinRoomBtn.addEventListener('click', () => {
    showScreen(joinRoomScreen);
});

submitJoinBtn.addEventListener('click', () => {
    const roomId = roomIdInput.value.trim();
    if (roomId) {
        socket.emit('joinRoom', roomId);
    }
});

setNumberBtn.addEventListener('click', () => {
    const number = secretInput.value;
    if (number.length === 4 && /^\d+$/.test(number)) {
        socket.emit('setNumber', number);
        secretInput.disabled = true;
        setNumberBtn.disabled = true;
    } else {
        alert('Lütfen 4 basamaklı bir sayı girin.');
    }
});

guessBtn.addEventListener('click', () => {
    const guess = guessInput.value;
    if (guess.length === 4 && /^\d+$/.test(guess)) {
        socket.emit('makeGuess', guess);
        guessInput.value = '';
    } else {
        alert('Lütfen 4 basamaklı bir tahmin girin.');
    }
});

// Sunucudan Gelen Olaylar
socket.on('connect', () => {
    statusElem.textContent = 'Bağlantı başarılı. Bir seçenek seçin.';
    showScreen(homeScreen);
});

socket.on('roomCreated', (roomId) => {
    roomIdDisplay.textContent = roomId;
    showScreen(createRoomScreen);
});

socket.on('joinError', (message) => {
    alert(message);
    showScreen(homeScreen);
});

socket.on('gameStart', () => {
    showScreen(setupScreen);
});

// Geri kalan socket olayları (updateStatus, turnChange, vs.) aynı kalıyor.
socket.on('updateStatus', (message) => { statusElem.textContent = message; });
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
        statusElem.textContent = 'Rakibin sırası...';
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
socket.on('gameWin', () => {
    statusElem.textContent = 'Tebrikler, Kazandınız!';
    guessInput.disabled = true;
    guessBtn.disabled = true;
});
socket.on('gameLose', () => {
    statusElem.textContent = 'Kaybettiniz. Rakibiniz sayıyı buldu.';
    guessInput.disabled = true;
    guessBtn.disabled = true;
});
socket.on('opponentLeft', () => {
    alert('Rakibiniz oyundan ayrıldı. Ana menüye yönlendiriliyorsunuz.');
    showScreen(homeScreen);
    statusElem.textContent = 'Bir seçenek seçin.';
});