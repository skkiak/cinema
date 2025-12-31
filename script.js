// Ждем, пока загрузится библиотека Firebase из HTML
document.addEventListener('DOMContentLoaded', () => {
    // Небольшая задержка, чтобы firebase точно инициализировался
    setTimeout(initApp, 500);
});

let movies = [];
let schedule = [];
let bookings = [];

function initApp() {
    console.log("App started...");
    
    // 1. СЛУШАЕМ ФИЛЬМЫ ИЗ ИНТЕРНЕТА (В РЕАЛЬНОМ ВРЕМЕНИ)
    // Как только ты добавишь фильм на компе, эта функция сработает на телефоне сама!
    window.onSnapshot(window.query(window.collection(window.db, "movies"), window.orderBy("id", "desc")), (snapshot) => {
        movies = [];
        snapshot.forEach((doc) => {
            movies.push({ fireId: doc.id, ...doc.data() });
        });
        renderMovies();
        updateAdminUI(); // Обновляем списки в админке
    });

    // 2. СЛУШАЕМ РАСПИСАНИЕ
    window.onSnapshot(window.collection(window.db, "schedule"), (snapshot) => {
        schedule = [];
        snapshot.forEach((doc) => {
            schedule.push({ fireId: doc.id, ...doc.data() });
        });
        renderSchedule();
    });

    // 3. СЛУШАЕМ БРОНИ
    window.onSnapshot(window.collection(window.db, "bookings"), (snapshot) => {
        bookings = [];
        snapshot.forEach((doc) => {
            bookings.push({ fireId: doc.id, ...doc.data() });
        });
        // Если открыто окно бронирования, перерисуем места (вдруг кто-то купил билет прямо сейчас)
        if(document.getElementById('booking-modal').style.display === 'block') {
            const currentSessionId = document.getElementById('booking-modal').getAttribute('data-session-id');
            if(currentSessionId) generateSeats(Number(currentSessionId));
        }
        if(typeof showBookingsList === 'function') showBookingsList();
    });
}

// --- ОБРАБОТКА ФАЙЛОВ ---
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
        // Лимит для Firebase Firestore (документ макс 1МБ)
        if (file.size > 800 * 1024) { 
            alert('Файл слишком большой! Выбери картинку меньше 800КБ или используй ссылку.');
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

// --- НАВИГАЦИЯ ---
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
    
    // Сортировка дней
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
        const sessions = schedule.filter(s => s.day === day).sort((a,b)=>a.time.localeCompare(b.time));
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
                        ${isAdminMode() ? `<button class="btn-danger btn-small" onclick="deleteSession('${sess.fireId}')" style="margin-top:10px;">Удалить</button>` : ''}
                    </div>
                `;
            }
        });
        block.innerHTML = html;
        container.appendChild(block);
    });
}

// --- БРОНИРОВАНИЕ ---
let currentSessionId = null;
let selectedSeat = null;

window.openBooking = function(sessionId) {
    currentSessionId = sessionId;
    selectedSeat = null;
    const btn = document.getElementById('confirm-booking-btn');
    if(btn) btn.disabled = true;
    document.getElementById('selected-seat-display').innerText = "Выберите место";
    
    // Сохраняем ID сессии в модалке для обновления в реальном времени
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
            
            const isTaken = occupied.find(b => b.row === r && b.seat === c);
            if (isTaken) {
                seatDiv.classList.add('occupied');
            } else {
                seatDiv.onclick = () => selectSeat(r, c, seatDiv);
            }
            rowDiv.appendChild(seatDiv);
        }
        grid.appendChild(rowDiv);
    }
}

function selectSeat(r, c, el) {
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

    // СОХРАНЯЕМ В FIREBASE
    try {
        await window.addDoc(window.collection(window.db, "bookings"), {
            id: Date.now(),
            scheduleId: currentSessionId,
            row: selectedSeat.row,
            seat: selectedSeat.seat,
            timestamp: Date.now()
        });
        
        const message = `Здравствуйте! Бронирую билет:%0AФильм: ${m.title}%0AСеанс: ${sess.day} ${sess.time}%0AРяд: ${selectedSeat.row}, Место: ${selectedSeat.seat}%0A%0AКак оплатить по QR?`;
        window.open(`https://wa.me/996702444888?text=${message}`, '_blank');

        window.closeBookingModal();
        showToast('Успешно! Место забронировано.', 'success');
    } catch (e) {
        console.error(e);
        showToast('Ошибка бронирования', 'error');
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
        document.querySelectorAll('section:not(#admin-dashboard)').forEach(s => s.style.display='none');
        updateAdminUI();
        window.showBookingsList();
    } else { showToast('Неверный код', 'error'); }
}

function isAdminMode() { return adminModeActive; }

window.adminLogout = function() {
    adminModeActive = false;
    document.getElementById('admin-dashboard').style.display = 'none';
    window.navigate('home');
}

function updateAdminUI() {
    const sel = document.getElementById('admin-session-movie');
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

// АДМИНСКИЕ ФУНКЦИИ (FIREBASE)
window.addMovie = async function() {
    const title = document.getElementById('admin-movie-title').value;
    const poster = currentFileBase64 || document.getElementById('admin-movie-poster-url').value;
    const genre = document.getElementById('admin-movie-genre').value;
    
    if(!title) return showToast('Название обязательно', 'error');
    
    try {
        await window.addDoc(window.collection(window.db, "movies"), {
            id: Date.now(), 
            title, 
            poster: poster || '', 
            genre: genre || 'Кино'
        });
        showToast('Фильм добавлен в базу!');
        // Очистка полей
        document.getElementById('admin-movie-title').value = '';
        currentFileBase64 = null;
        fileNameDisplay.innerText = "Выбрать изображение...";
        uploadBtn.classList.remove('active');
    } catch(e) {
        showToast('Ошибка: ' + e.message, 'error');
    }
}

window.deleteMovie = async function(fireId) {
    if(confirm('Удалить фильм?')) {
        await window.deleteDoc(window.doc(window.db, "movies", fireId));
        showToast('Фильм удален');
    }
}

window.addSession = async function() {
    const mId = document.getElementById('admin-session-movie').value;
    const day = document.getElementById('admin-session-day').value;
    const time = document.getElementById('admin-session-time').value;
    if(!mId || !time) return showToast('Заполните поля', 'error');
    
    await window.addDoc(window.collection(window.db, "schedule"), {
        id: Date.now(), 
        day, 
        movieId: Number(mId), 
        time
    });
    showToast('Сеанс создан');
}

window.deleteSession = async function(fireId) {
    if(confirm('Удалить сеанс?')) {
        await window.deleteDoc(window.doc(window.db, "schedule", fireId));
        showToast('Сеанс удален');
    }
}

// --- СПИСОК БРОНЕЙ В АДМИНКЕ ---
window.showBookingsList = function() {
    const tbody = document.getElementById('bookings-table-body');
    const noData = document.getElementById('no-bookings-msg');
    tbody.innerHTML = '';
    
    if(bookings.length === 0) {
        noData.style.display = 'block';
        return;
    }
    noData.style.display = 'none';

    bookings.forEach(b => {
        const sess = schedule.find(s => s.id == b.scheduleId);
        const m = sess ? movies.find(mov => mov.id == sess.movieId) : null;
        
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${m ? m.title : 'Удален'}</td>
            <td>${sess ? sess.day + ' ' + sess.time : '???'}</td>
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
    if(confirm('Снять эту бронь?')) {
        await window.deleteDoc(window.doc(window.db, "bookings", fireId));
        showToast('Бронь удалена');
    }
}

window.resetBookings = async function() {
    if(confirm('ВНИМАНИЕ: Это удалит ВСЕ брони! Точно?')) {
        // Тут хитро: надо удалить каждый документ отдельно
        bookings.forEach(async (b) => {
            await window.deleteDoc(window.doc(window.db, "bookings", b.fireId));
        });
        showToast('Зал очищается...');
    }
}

function showToast(msg, type='normal') {
    const box = document.getElementById('toast-container');
    const el = document.createElement('div');
    el.className = 'toast';
    el.innerText = msg;
    if(type==='error') el.style.borderLeftColor = 'red';
    box.appendChild(el);
    setTimeout(()=>el.remove(), 3000);
}