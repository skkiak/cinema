
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getFirestore, collection, addDoc, deleteDoc, updateDoc, doc, onSnapshot, query, orderBy } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

const firebaseConfig = {
    apiKey: "AIzaSyAehkl3LCxbd07zHWASbcJSQpfcDv8mmEE",
    authDomain: "jashtyk-cinema.firebaseapp.com",
    projectId: "jashtyk-cinema",
    storageBucket: "jashtyk-cinema.firebasestorage.app",
    messagingSenderId: "566863733816",
    appId: "1:566863733816:web:64803fcc5feba28719b2cd",
    measurementId: "G-G2MX1N36JP"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

let movies = [];
let schedule = [];
let bookings = [];

console.log("App started...");

// --- СЛУШАТЕЛИ ---
onSnapshot(query(collection(db, "movies"), orderBy("id", "desc")), (snapshot) => {
    movies = [];
    snapshot.forEach((doc) => { movies.push({ fireId: doc.id, ...doc.data() }); });
    renderMovies();
    updateAdminUI();
});

onSnapshot(collection(db, "schedule"), (snapshot) => {
    schedule = [];
    snapshot.forEach((doc) => { schedule.push({ fireId: doc.id, ...doc.data() }); });
    renderSchedule();
});

onSnapshot(collection(db, "bookings"), (snapshot) => {
    bookings = [];
    snapshot.forEach((doc) => { bookings.push({ fireId: doc.id, ...doc.data() }); });
    
    const modal = document.getElementById('booking-modal');
    if(modal && modal.style.display === 'block') {
        const currentSessionId = modal.getAttribute('data-session-id');
        if(currentSessionId) window.generateSeats(Number(currentSessionId));
    }
    
    if(document.getElementById('admin-bookings-list')) {
        window.showBookingsList(); // Если мы в админке
    }
});

// --- ФАЙЛЫ ---
let currentFileBase64 = null;
const fileInput = document.getElementById('admin-movie-file');
const fileNameDisplay = document.getElementById('file-name-display');
const uploadBtn = document.querySelector('.upload-btn');

if (fileInput) {
    fileInput.addEventListener('change', function(e) {
        const file = e.target.files[0];
        if (!file) {
            fileNameDisplay.innerText = "Выбрать изображение...";
            uploadBtn.classList.remove('active');
            return;
        }
        if (file.size > 800 * 1024) { 
            alert('Файл слишком большой! (Макс 800КБ).');
            this.value = "";
            return;
        }
        fileNameDisplay.innerText = file.name;
        uploadBtn.classList.add('active');
        const reader = new FileReader();
        reader.onloadend = () => { currentFileBase64 = reader.result; };
        reader.readAsDataURL(file);
    });
}

function showToast(msg, type='normal') {
    const box = document.getElementById('toast-container');
    const el = document.createElement('div');
    el.className = 'toast';
    el.innerText = msg;
    if(type==='error') el.style.borderLeftColor = 'red';
    if(type==='success') el.style.borderLeftColor = '#25D366';
    box.appendChild(el);
    setTimeout(() => el.remove(), 3000);
}

// --- НАВИГАЦИЯ ---
window.navigate = function(pageId) {
    document.querySelectorAll('section').forEach(s => {
        s.style.display = 'none';
        s.classList.remove('active');
    });
    if (pageId === 'home') {
        document.getElementById('home').style.display = 'block';
        document.getElementById('home').classList.add('active');
    } else {
        const t = document.getElementById(pageId);
        if(t) {
            t.style.display = 'block';
            setTimeout(() => t.classList.add('active'), 10);
        }
    }
    document.querySelectorAll('.nav-link').forEach(l => l.classList.remove('active'));
    document.getElementById('nav-menu').classList.remove('active');
    window.scrollTo(0,0);
}
window.toggleMenu = function() { document.getElementById('nav-menu').classList.toggle('active'); }

// --- ОТРИСОВКА ---
function renderMovies() {
    const grid = document.getElementById('movies-grid');
    if(!grid) return;
    grid.innerHTML = '';
    movies.forEach(m => {
        const d = document.createElement('div');
        d.className = 'movie-card';
        d.innerHTML = `
            <div class="poster-wrapper"><img src="${m.poster}" onerror="this.src='https://via.placeholder.com/300x450/333?text=NO+IMG'"></div>
            <div class="card-content">
                <div class="card-title">${m.title}</div>
                <div class="card-genre">${m.genre}</div>
                <button class="btn btn-small btn-outline" style="width:100%" onclick="navigate('schedule')">Купить билет</button>
            </div>
        `;
        grid.appendChild(d);
    });
}

function renderSchedule() {
    const container = document.getElementById('schedule-container');
    if(!container) return;
    container.innerHTML = '';
    const daysOrder = ['Сегодня', 'Завтра', 'Понедельник', 'Вторник', 'Среда', 'Четверг', 'Пятница', 'Суббота', 'Воскресенье'];
    const activeDays = daysOrder.filter(d => schedule.some(s => s.day === d));

    if (activeDays.length === 0) {
        container.innerHTML = '<div style="text-align:center; padding:40px; color:#666;">Пока нет сеансов</div>';
        return;
    }

    activeDays.forEach(day => {
        const block = document.createElement('div');
        block.className = 'schedule-day';
        let html = `<div class="day-title">${day}</div>`;
        const sessions = schedule.filter(s => s.day === day).sort((a,b) => a.time.localeCompare(b.time));
        sessions.forEach(sess => {
            const m = movies.find(x => x.id == sess.movieId);
            if(m) {
                html += `
                    <div class="session-card">
                        <div class="session-info">
                            <div class="time-badge">${sess.time}</div>
                            <div style="flex:1;">
                                <div style="font-weight:bold; font-size:1.1rem;">${m.title}</div>
                                <small style="color:#888;">${m.genre}</small>
                            </div>
                            <button class="btn btn-small" onclick="openBooking(${sess.id})"><i class="fas fa-ticket-alt"></i></button>
                        </div>
                        ${window.isAdminMode() ? `<button class="btn-danger btn-small" onclick="deleteSession('${sess.fireId}')" style="margin-top:10px;">Удалить</button>` : ''}
                    </div>
                `;
            }
        });
        block.innerHTML = html;
        container.appendChild(block);
    });
}

// --- БРОНИРОВАНИЕ (МУЛЬТИ) ---
let currentSessionId = null;
let selectedSeats = [];

window.openBooking = function(sessionId) {
    currentSessionId = sessionId;
    selectedSeats = [];
    const btn = document.getElementById('confirm-booking-btn');
    if(btn) btn.disabled = true;
    
    document.getElementById('selected-seat-display').innerText = "Выберите места";
    document.getElementById('booking-modal').setAttribute('data-session-id', sessionId);
    
    const sess = schedule.find(s => s.id == sessionId);
    const m = movies.find(x => x.id == sess.movieId);
    
    document.getElementById('booking-movie-title').innerText = m.title;
    document.getElementById('booking-info').innerText = `${sess.day} | ${sess.time}`;
    window.generateSeats(sessionId);
    window.openModal('booking-modal');
}

window.generateSeats = function(sessionId) {
    const grid = document.getElementById('seats-grid');
    grid.innerHTML = '';
    const rows = 7;
    const cols = 13;
    const occupied = bookings.filter(b => b.scheduleId == sessionId);

    for (let r = 1; r <= rows; r++) {
        const rowDiv = document.createElement('div');
        rowDiv.className = 'seat-row';
        for (let c = 1; c <= cols; c++) {
            const seatDiv = document.createElement('div');
            seatDiv.className = 'seat';
            
            // Проверка занятости
            const booking = occupied.find(b => b.row === r && b.seat === c);
            
            if (booking) {
                seatDiv.classList.add('occupied'); // Красный по умолчанию (занято)
                if (booking.status === 'pending') {
                    seatDiv.classList.remove('occupied'); // Убираем красный
                    seatDiv.classList.add('pending'); // Добавляем желтый
                }
            } else {
                // Если выбрано нами сейчас
                const isSelected = selectedSeats.some(s => s.row === r && s.seat === c);
                if (isSelected) seatDiv.classList.add('selected');
                seatDiv.onclick = () => window.toggleSeatSelection(r, c, seatDiv);
            }
            rowDiv.appendChild(seatDiv);
        }
        grid.appendChild(rowDiv);
    }
}

window.toggleSeatSelection = function(r, c, el) {
    const index = selectedSeats.findIndex(s => s.row === r && s.seat === c);
    if (index > -1) {
        selectedSeats.splice(index, 1);
        el.classList.remove('selected');
    } else {
        selectedSeats.push({ row: r, seat: c });
        el.classList.add('selected');
    }

    const display = document.getElementById('selected-seat-display');
    const btn = document.getElementById('confirm-booking-btn');

    if (selectedSeats.length === 0) {
        display.innerText = "Выберите места";
        btn.disabled = true;
    } else {
        const seatsText = selectedSeats.map(s => `Р${s.row} М${s.seat}`).join(', ');
        display.innerText = `Выбрано: ${seatsText}`;
        btn.disabled = false;
    }
}

window.submitBooking = async function() {
    if(!currentSessionId || selectedSeats.length === 0) return;
    const sess = schedule.find(s => s.id == currentSessionId);
    const m = movies.find(x => x.id == sess.movieId);

    try {
        const promises = selectedSeats.map(seat => {
            return addDoc(collection(db, "bookings"), {
                id: Date.now() + Math.random(),
                scheduleId: currentSessionId,
                row: seat.row,
                seat: seat.seat,
                status: 'pending', // Желтый статус
                timestamp: Date.now()
            });
        });

        await Promise.all(promises);
        
        const seatsList = selectedSeats.map(s => `- Ряд ${s.row}, Место ${s.seat}`).join('\n');
        const rawText = `Здравствуйте! Бронирую билеты (${selectedSeats.length} шт):\n` +
                        `🎬 Фильм: ${m.title}\n` +
                        `⏰ Сеанс: ${sess.day} ${sess.time}\n\n` +
                        `💺 Места:\n${seatsList}\n\n` +
                        `Жду подтверждения. Как оплатить?`;

        const encodedText = encodeURIComponent(rawText);
        window.location.href = `https://wa.me/996702444888?text=${encodedText}`;

        window.closeBookingModal();
        showToast(`Успешно! Места забронированы.`, 'success');
    } catch (e) {
        console.error(e);
        showToast('Ошибка: ' + e.message, 'error');
    }
}

window.closeBookingModal = function() { 
    document.getElementById('booking-modal').style.display = 'none'; 
}

// --- АДМИНКА ---
let adminModeActive = false;
window.openModal = function(id) { document.getElementById(id).style.display = 'flex'; }
window.closeModal = function(id) { document.getElementById(id).style.display = 'none'; }

window.attemptLogin = function() {
    if(document.getElementById('login-pass').value === '7777') {
        window.closeModal('login-modal');
        adminModeActive = true;
        document.getElementById('admin-dashboard').style.display = 'block';
        document.getElementById('home').style.display = 'none';
        document.getElementById('schedule').style.display = 'none';
        document.getElementById('contacts').style.display = 'none';
        updateAdminUI();
        window.showBookingsList();
        showToast('Вход выполнен', 'success');
    } else { showToast('Неверный код', 'error'); }
}

window.isAdminMode = function() { return adminModeActive; }

window.adminLogout = function() {
    adminModeActive = false;
    document.getElementById('admin-dashboard').style.display = 'none';
    window.navigate('home');
}

function updateAdminUI() {
    const sel = document.getElementById('admin-session-movie');
    if (!sel) return;
    sel.innerHTML = '';
    movies.forEach(m => {
        const opt = document.createElement('option');
        opt.value = m.id;
        opt.innerText = m.title;
        sel.appendChild(opt);
    });

    const list = document.getElementById('admin-movies-list');
    list.innerHTML = '';
    movies.forEach(m => {
        const li = document.createElement('li');
        li.innerHTML = `<span>${m.title}</span> <i class="fas fa-trash delete-icon" onclick="deleteMovie('${m.fireId}')"></i>`;
        list.appendChild(li);
    });
}

// CRUD
window.addMovie = async function() {
    const title = document.getElementById('admin-movie-title').value;
    const poster = currentFileBase64 || document.getElementById('admin-movie-poster-url').value;
    const genre = document.getElementById('admin-movie-genre').value;
    if(!title) return showToast('Введите название', 'error');
    
    await addDoc(collection(db, "movies"), {
        id: Date.now(), title, poster: poster || '', genre: genre || 'Кино'
    });
    showToast('Фильм добавлен');
    document.getElementById('admin-movie-title').value = '';
    currentFileBase64 = null;
    fileNameDisplay.innerText = "Выбрать...";
    uploadBtn.classList.remove('active');
}

window.deleteMovie = async function(fireId) {
    if(confirm('Удалить фильм?')) await deleteDoc(doc(db, "movies", fireId));
}

window.addSession = async function() {
    const mId = document.getElementById('admin-session-movie').value;
    const day = document.getElementById('admin-session-day').value;
    const time = document.getElementById('admin-session-time').value;
    if(!mId || !time) return showToast('Заполните поля', 'error');
    
    await addDoc(collection(db, "schedule"), {
        id: Date.now(), day, movieId: Number(mId), time
    });
    showToast('Сеанс создан');
}

window.deleteSession = async function(fireId) {
    if(confirm('Удалить сеанс?')) await deleteDoc(doc(db, "schedule", fireId));
}

// --- УПРАВЛЕНИЕ БРОНЯМИ В АДМИНКЕ ---
window.showBookingsList = function() {
    const tbody = document.getElementById('bookings-table-body');
    const noData = document.getElementById('no-bookings-msg');
    
    if(!tbody) return;
    tbody.innerHTML = '';
    
    if(bookings.length === 0) {
        if(noData) noData.style.display = 'block';
        return;
    }
    if(noData) noData.style.display = 'none';

    // Сортировка: Сначала желтые (Pending), потом красные
    bookings.sort((a, b) => (a.status === 'pending' ? -1 : 1));

    bookings.forEach(b => {
        const sess = schedule.find(s => s.id == b.scheduleId);
        const m = sess ? movies.find(mov => mov.id == sess.movieId) : null;
        
        let statusBadge = '';
        let actions = '';

        if (b.status === 'pending') {
            statusBadge = '<span style="color:#f1c40f; font-weight:bold;">● Ожидает</span>';
            actions = `
                <button class="btn-small btn-approve" onclick="confirmBooking('${b.fireId}')" title="Подтвердить">✅</button>
                <button class="btn-small btn-danger" onclick="deleteSingleBooking('${b.fireId}')" title="Отклонить">❌</button>
            `;
        } else {
            statusBadge = '<span style="color:#880b12; font-weight:bold;">● Оплачено</span>';
            actions = `
                <button class="btn-small btn-danger" onclick="deleteSingleBooking('${b.fireId}')" title="Удалить">
                    <i class="fas fa-trash"></i>
                </button>
            `;
        }

        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>
                <strong>${m ? m.title : '???'}</strong><br>
                <small>${sess ? sess.day + ' ' + sess.time : '???'}</small>
            </td>
            <td>Р${b.row} М${b.seat}</td>
            <td>${statusBadge}</td>
            <td style="text-align: right;">${actions}</td>
        `;
        tbody.appendChild(tr);
    });
}

window.confirmBooking = async function(fireId) {
    try {
        await updateDoc(doc(db, "bookings", fireId), { status: 'confirmed' });
        showToast('Бронь подтверждена!', 'success');
    } catch(e) { showToast('Ошибка', 'error'); }
}

window.deleteSingleBooking = async function(fireId) {
    if(confirm('Удалить эту бронь?')) {
        await deleteDoc(doc(db, "bookings", fireId));
        showToast('Бронь удалена');
    }
}

window.resetBookings = async function() {
    if(confirm('Удалить ВСЕ брони?')) {
        bookings.forEach(async (b) => await deleteDoc(doc(db, "bookings", b.fireId)));
        showToast('Зал очищен');
    }
}
