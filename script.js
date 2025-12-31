// ==========================================
// 1. ИМПОРТ И НАСТРОЙКА FIREBASE
// ==========================================
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getFirestore, collection, addDoc, deleteDoc, doc, onSnapshot, query, orderBy } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

// Твои настройки (REAL DATA)
const firebaseConfig = {
    apiKey: "AIzaSyAehkl3LCxbd07zHWASbcJSQpfcDv8mmEE",
    authDomain: "jashtyk-cinema.firebaseapp.com",
    projectId: "jashtyk-cinema",
    storageBucket: "jashtyk-cinema.firebasestorage.app",
    messagingSenderId: "566863733816",
    appId: "1:566863733816:web:64803fcc5feba28719b2cd",
    measurementId: "G-G2MX1N36JP"
};

// Инициализация
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

// Глобальные переменные
let movies = [];
let schedule = [];
let bookings = [];


// ==========================================
// 2. ЗАПУСК И СИНХРОНИЗАЦИЯ (REALTIME)
// ==========================================
console.log("Приложение запущено...");

// --- Слушаем Фильмы ---
// Используем imported функции напрямую: query, collection, orderBy
onSnapshot(query(collection(db, "movies"), orderBy("id", "desc")), (snapshot) => {
    movies = [];
    snapshot.forEach((doc) => {
        movies.push({ fireId: doc.id, ...doc.data() });
    });
    renderMovies();
    updateAdminUI();
}, (error) => {
    console.error("Ошибка загрузки фильмов:", error);
});

// --- Слушаем Расписание ---
onSnapshot(collection(db, "schedule"), (snapshot) => {
    schedule = [];
    snapshot.forEach((doc) => {
        schedule.push({ fireId: doc.id, ...doc.data() });
    });
    renderSchedule();
});

// --- Слушаем Брони ---
onSnapshot(collection(db, "bookings"), (snapshot) => {
    bookings = [];
    snapshot.forEach((doc) => {
        bookings.push({ fireId: doc.id, ...doc.data() });
    });
    
    // Если открыто окно бронирования, обновляем места в реальном времени
    const modal = document.getElementById('booking-modal');
    if(modal && modal.style.display === 'block') {
        const currentSessionId = modal.getAttribute('data-session-id');
        if(currentSessionId) window.generateSeats(Number(currentSessionId));
    }
    
    // Если открыт список броней в админке
    if(document.getElementById('admin-bookings-list').style.display === 'block') {
        window.showBookingsList();
    }
});


// ==========================================
// 3. ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ
// ==========================================

// Обработка загрузки файла (превью)
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

        // Ограничение размера 1МБ (Firebase Firestore limitation)
        if (file.size > 1024 * 1024) { 
            alert('Файл слишком большой! (Макс 1МБ). Сжимай картинки или используй ссылки.');
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

// Уведомления (Toast)
function showToast(msg, type='normal') {
    const box = document.getElementById('toast-container');
    const el = document.createElement('div');
    el.className = 'toast';
    el.innerText = msg;
    if(type==='error') el.style.borderLeftColor = 'red';
    box.appendChild(el);
    setTimeout(() => el.remove(), 3000);
}


// ==========================================
// 4. ФУНКЦИИ ИНТЕРФЕЙСА (доступные из HTML)
// ==========================================

// Навигация
window.navigate = function(pageId) {
    document.querySelectorAll('section').forEach(s => {
        s.style.display = 'none';
        s.classList.remove('active');
    });
    
    if (pageId === 'home') {
        const h = document.getElementById('home');
        h.style.display = 'block';
        h.classList.add('active');
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

window.toggleMenu = function() { 
    document.getElementById('nav-menu').classList.toggle('active'); 
}

// Отрисовка фильмов
function renderMovies() {
    const grid = document.getElementById('movies-grid');
    if(!grid) return;
    grid.innerHTML = '';
    
    if (movies.length === 0) {
        grid.innerHTML = '<p style="color:#666; width:100%;">Список фильмов пуст</p>';
        return;
    }

    movies.forEach(m => {
        const d = document.createElement('div');
        d.className = 'movie-card';
        d.innerHTML = `
            <div class="poster-wrapper">
                <img src="${m.poster}" onerror="this.src='https://via.placeholder.com/300x450/333?text=NO+IMG'">
            </div>
            <div class="card-content">
                <div class="card-title">${m.title}</div>
                <div class="card-genre">${m.genre}</div>
                <button class="btn btn-small btn-outline" style="width:100%" onclick="navigate('schedule')">Купить билет</button>
            </div>
        `;
        grid.appendChild(d);
    });
}

// Отрисовка расписания
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
                            <button class="btn btn-small" onclick="openBooking(${sess.id})">
                                <i class="fas fa-ticket-alt"></i>
                            </button>
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


// ==========================================
// 5. ЛОГИКА БРОНИРОВАНИЯ
// ==========================================
let currentSessionId = null;
let selectedSeat = null;

window.openBooking = function(sessionId) {
    currentSessionId = sessionId;
    selectedSeat = null;
    const btn = document.getElementById('confirm-booking-btn');
    if(btn) btn.disabled = true;
    
    document.getElementById('selected-seat-display').innerText = "Выберите место";
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
            const isTaken = occupied.find(b => b.row === r && b.seat === c);
            if (isTaken) {
                seatDiv.classList.add('occupied');
            } else {
                seatDiv.onclick = () => window.selectSeat(r, c, seatDiv);
            }
            rowDiv.appendChild(seatDiv);
        }
        grid.appendChild(rowDiv);
    }
}

window.selectSeat = function(r, c, el) {
    document.querySelectorAll('.seat.selected').forEach(s => s.classList.remove('selected'));
    el.classList.add('selected');
    selectedSeat = { row: r, seat: c };
    
    document.getElementById('selected-seat-display').innerText = `Ряд ${r}, Место ${c}`;
    document.getElementById('confirm-booking-btn').disabled = false;
}

window.submitBooking = async function() {
    if(!currentSessionId || !selectedSeat) return;
    
    const sess = schedule.find(s => s.id == currentSessionId);
    const m = movies.find(x => x.id == sess.movieId);

    try {
        // Сохраняем в Firebase
        await addDoc(collection(db, "bookings"), {
            id: Date.now(),
            scheduleId: currentSessionId,
            row: selectedSeat.row,
            seat: selectedSeat.seat,
            timestamp: Date.now()
        });
        
        // Открываем WhatsApp
        const message = `Здравствуйте! Бронирую билет:%0AФильм: ${m.title}%0AСеанс: ${sess.day} ${sess.time}%0AРяд: ${selectedSeat.row}, Место: ${selectedSeat.seat}%0A%0AКак оплатить по QR?`;
        window.open(`https://wa.me/996702444888?text=${message}`, '_blank');

        window.closeBookingModal();
        showToast('Успешно! Место забронировано.', 'success');
    } catch (e) {
        console.error(e);
        showToast('Ошибка: ' + e.message, 'error');
    }
}

window.closeBookingModal = function() { 
    document.getElementById('booking-modal').style.display = 'none'; 
}


// ==========================================
// 6. АДМИН-ПАНЕЛЬ (CRUD)
// ==========================================
let adminModeActive = false;

window.openModal = function(id) { document.getElementById(id).style.display = 'flex'; }
window.closeModal = function(id) { document.getElementById(id).style.display = 'none'; }

window.attemptLogin = function() {
    if(document.getElementById('login-pass').value === '7777') {
        window.closeModal('login-modal');
        adminModeActive = true;
        document.getElementById('admin-dashboard').style.display = 'block';
        
        // Скрываем обычный сайт
        document.getElementById('home').style.display = 'none';
        document.getElementById('schedule').style.display = 'none';
        document.getElementById('contacts').style.display = 'none';
        
        updateAdminUI();
        window.showBookingsList();
        showToast('Вы вошли как админ', 'success');
    } else { 
        showToast('Неверный код', 'error'); 
    }
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

// --- Добавить Фильм ---
window.addMovie = async function() {
    const title = document.getElementById('admin-movie-title').value;
    const poster = currentFileBase64 || document.getElementById('admin-movie-poster-url').value;
    const genre = document.getElementById('admin-movie-genre').value;
    
    if(!title) return showToast('Название обязательно', 'error');
    
    try {
        await addDoc(collection(db, "movies"), {
            id: Date.now(), 
            title, 
            poster: poster || '', 
            genre: genre || 'Кино'
        });
        showToast('Фильм добавлен!');
        
        // Очистка
        document.getElementById('admin-movie-title').value = '';
        document.getElementById('admin-movie-poster-url').value = '';
        currentFileBase64 = null;
        fileNameDisplay.innerText = "Выбрать изображение...";
        uploadBtn.classList.remove('active');
        
    } catch(e) { showToast('Ошибка: ' + e.message, 'error'); }
}

// --- Удалить Фильм ---
window.deleteMovie = async function(fireId) {
    if(confirm('Удалить этот фильм?')) {
        await deleteDoc(doc(db, "movies", fireId));
        showToast('Фильм удален');
    }
}

// --- Добавить Сеанс ---
window.addSession = async function() {
    const mId = document.getElementById('admin-session-movie').value;
    const day = document.getElementById('admin-session-day').value;
    const time = document.getElementById('admin-session-time').value;
    
    if(!mId || !time) return showToast('Заполните поля', 'error');
    
    try {
        await addDoc(collection(db, "schedule"), {
            id: Date.now(), 
            day, 
            movieId: Number(mId), 
            time
        });
        showToast('Сеанс создан');
    } catch(e) { showToast('Ошибка создания', 'error'); }
}

// --- Удалить Сеанс ---
window.deleteSession = async function(fireId) {
    if(confirm('Удалить сеанс?')) {
        await deleteDoc(doc(db, "schedule", fireId));
        showToast('Сеанс удален');
    }
}

// --- Управление Бронями ---
window.showBookingsList = function() {
    const tbody = document.getElementById('bookings-table-body');
    const noData = document.getElementById('no-bookings-msg');
    const container = document.getElementById('admin-bookings-list');
    
    if(container) container.style.display = 'block'; // Показываем блок
    if(!tbody) return;
    
    tbody.innerHTML = '';
    
    if(bookings.length === 0) {
        if(noData) noData.style.display = 'block';
        return;
    }
    if(noData) noData.style.display = 'none';

    bookings.forEach(b => {
        const sess = schedule.find(s => s.id == b.scheduleId);
        const m = sess ? movies.find(mov => mov.id == sess.movieId) : null;
        
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${m ? m.title : '<span style="color:red">Фильм удален</span>'}</td>
            <td>${sess ? sess.day + ' ' + sess.time : '<span style="color:red">Сеанс удален</span>'}</td>
            <td>Ряд ${b.row}, Место ${b.seat}</td>
            <td>
                <button class="btn-danger btn-small" onclick="deleteSingleBooking('${b.fireId}')">
                    <i class="fas fa-times"></i>
                </button>
            </td>
        `;
        tbody.appendChild(tr);
    });
}

window.deleteSingleBooking = async function(fireId) {
    if(confirm('Отменить эту бронь?')) {
        await deleteDoc(doc(db, "bookings", fireId));
        showToast('Бронь удалена');
    }
}

window.resetBookings = async function() {
    if(confirm('ВНИМАНИЕ: Это удалит ВСЕ брони! Точно?')) {
        // Удаляем по одному (Firebase не умеет удалять коллекцию одной командой с клиента)
        bookings.forEach(async (b) => {
            await deleteDoc(doc(db, "bookings", b.fireId));
        });
        showToast('Зал очищается...');
    }
}
