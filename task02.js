// task02.js — Задание 2: Кристальный шифр
// Медиа: v02_intro.mp4, crystal_sequence.mp4, door_lum_reveal.mp4

const Task02 = (function() {
  // Таблица расшифровки (раздел 4 документа)
  const TABLE = {
    left: [
      { shape: '◇', digit: 8, name: 'Ромб' },
      { shape: '□', digit: 5, name: 'Квадрат' },
      { shape: '✚', digit: 9, name: 'Крест' },
      { shape: '△', digit: 4, name: 'Треугольник (ложная)' },
      { shape: '⠂', digit: 0, name: 'Двоеточие (ложная)' }
    ],
    right: [
      { shape: '○', digit: 1, name: 'Овал' },
      { shape: '∞', digit: 3, name: 'Бесконечность' },
      { shape: '⌒', digit: 2, name: 'Дуга' },
      { shape: '≈', digit: 6, name: 'Две волны (ложная)' },
      { shape: ';', digit: 7, name: 'Точка с запятой (ложная)' }
    ]
  };
  const CORRECT_CODE = [1, 2, 3, 5, 8, 9];
  const MAX_DIGITS = 6;

  let state = {
    phase: 'intro', // intro, selecting, swapping, done
    selectedDigits: [],
    highlightedSlot: null,
    attempts: 0,
    hintLevel: 0,
    videoEnded: false
  };

  let container = null;
  let videoEl = null;

  function mount(targetContainer) {
    container = targetContainer;
    container.innerHTML = `
      <video class="t2-video" id="t2-video" playsinline muted></video>
      <div class="t2-panel left" id="t2-panel-left"></div>
      <div class="t2-panel right" id="t2-panel-right"></div>
      <div class="t2-controls" id="t2-controls" style="display:none;">
        <div class="t2-hint" id="t2-hint">Расположите цифры по возрастанию. Нажмите одну ячейку, затем другую для обмена.</div>
        <div class="t2-cells" id="t2-cells"></div>
        <div class="t2-buttons">
          <button class="t2-btn" id="t2-btn-remove">Убрать выбранную</button>
          <button class="t2-btn" id="t2-btn-repeat">Повторить видео</button>
          <button class="t2-btn primary" id="t2-btn-check" disabled>Открыть дверь</button>
        </div>
      </div>
    `;
    container.classList.add('active');
    renderPanels();
    renderCells();
    bindEvents();
    playIntro();
  }

  function unmount() {
    if (videoEl) { videoEl.pause(); videoEl.src = ''; }
    if (container) { container.classList.remove('active'); container.innerHTML = ''; }
    state = { phase: 'intro', selectedDigits: [], highlightedSlot: null, attempts: 0, hintLevel: 0, videoEnded: false };
  }

  function renderPanels() {
    const left = document.getElementById('t2-panel-left');
    const right = document.getElementById('t2-panel-right');
    const renderRow = (item, side) => {
      const row = document.createElement('div');
      row.className = 't2-row';
      row.dataset.digit = item.digit;
      row.innerHTML = `<span class="shape">${item.shape}</span><span class="digit">${item.digit}</span>`;
      row.addEventListener('click', () => handleRowClick(item.digit));
      return row;
    };
    TABLE.left.forEach(item => left.appendChild(renderRow(item, 'left')));
    TABLE.right.forEach(item => right.appendChild(renderRow(item, 'right')));
  }

  function renderCells() {
    const cellsContainer = document.getElementById('t2-cells');
    cellsContainer.innerHTML = '';
    for (let i = 0; i < MAX_DIGITS; i++) {
      const cell = document.createElement('div');
      cell.className = 't2-cell' + (state.highlightedSlot === i ? ' highlighted' : '');
      cell.textContent = state.selectedDigits[i] || '';
      cell.dataset.index = i;
      cell.addEventListener('click', () => handleCellClick(i));
      cellsContainer.appendChild(cell);
    }
    updateButtons();
  }

  function handleRowClick(digit) {
    if (state.phase !== 'selecting' && state.phase !== 'intro') return;
    if (state.selectedDigits.includes(digit)) return; // без дубликатов
    if (state.selectedDigits.length >= MAX_DIGITS) return;
    
    state.selectedDigits.push(digit);
    renderCells();
  }

  function handleCellClick(index) {
    if (state.phase !== 'swapping') return;
    
    if (state.highlightedSlot === null) {
      // Первое нажатие — выделяем
      if (state.selectedDigits[index] !== undefined) {
        state.highlightedSlot = index;
        renderCells();
      }
    } else {
      // Второе нажатие
      if (state.highlightedSlot === index) {
        // То же самое — снимаем выделение
        state.highlightedSlot = null;
      } else {
        // Обмен
        const temp = state.selectedDigits[state.highlightedSlot];
        state.selectedDigits[state.highlightedSlot] = state.selectedDigits[index];
        state.selectedDigits[index] = temp;
        state.highlightedSlot = null;
      }
      renderCells();
    }
  }

  function removeSelected() {
    if (state.highlightedSlot !== null && state.selectedDigits[state.highlightedSlot] !== undefined) {
      state.selectedDigits.splice(state.highlightedSlot, 1);
      state.highlightedSlot = null;
      renderCells();
    }
  }

  function updateButtons() {
    const checkBtn = document.getElementById('t2-btn-check');
    const removeBtn = document.getElementById('t2-btn-remove');
    if (checkBtn) checkBtn.disabled = state.selectedDigits.length !== MAX_DIGITS || state.phase !== 'swapping';
    if (removeBtn) removeBtn.disabled = state.highlightedSlot === null;
  }

  function checkCode() {
    const isCorrect = state.selectedDigits.every((d, i) => d === CORRECT_CODE[i]);
    if (isCorrect) {
      state.phase = 'done';
      document.getElementById('t2-hint').textContent = 'Код принят! Дверь открывается...';
      document.getElementById('t2-hint').classList.remove('t2-error');
      // Здесь будет переход к door_lum_reveal.mp4 и далее к заданию 3
      setTimeout(() => {
        alert('Задание 2 пройдено! (Здесь будет запуск door_lum_reveal.mp4)');
        // unmount();
      }, 1500);
    } else {
      state.attempts++;
      state.highlightedSlot = null;
      renderCells();
      showHint();
    }
  }

  function showHint() {
    const hintEl = document.getElementById('t2-hint');
    hintEl.classList.add('t2-error');
    hintEl.textContent = 'Код не принят. Проверьте выбранные фигуры и порядок цифр.';
    
    // Уровни помощи (раздел 4)
    if (state.attempts === 1) {
      setTimeout(() => { hintEl.textContent = 'Подсказка 1: берите только полностью собранные фигуры из таблицы.'; hintEl.classList.remove('t2-error'); hintEl.style.color = '#30e5dc'; }, 3000);
    } else if (state.attempts === 2) {
      setTimeout(() => { hintEl.textContent = 'Подсказка 2: вводите цифры от меньшей к большей.'; hintEl.style.color = '#30e5dc'; }, 3000);
    } else if (state.attempts === 3) {
      setTimeout(() => { hintEl.textContent = 'Подсказка 3: нужные формы — Овал, Дуга, Бесконечность, Квадрат, Ромб, Крест.'; hintEl.style.color = '#30e5dc'; }, 3000);
    } else {
      setTimeout(() => { hintEl.textContent = 'Правильный порядок: 1 2 3 5 8 9'; hintEl.style.color = '#30e5dc'; }, 3000);
    }
  }

  function playIntro() {
    state.phase = 'intro';
    videoEl = document.getElementById('t2-video');
    // В реальных файлах: 'assets/v02_intro.mp4'
    videoEl.src = 'assets/v02_intro.mp4'; 
    videoEl.play().catch(e => console.warn('Autoplay blocked', e));
    
    videoEl.onended = () => {
      state.videoEnded = true;
      state.phase = 'swapping';
      document.getElementById('t2-controls').style.display = 'flex';
      document.getElementById('t2-hint').textContent = 'Расположите цифры по возрастанию. Нажмите одну ячейку, затем другую для обмена.';
      document.getElementById('t2-hint').style.color = '#fff';
      document.getElementById('t2-hint').classList.remove('t2-error');
      renderCells();
    };
  }

  function repeatVideo() {
    if (videoEl) {
      videoEl.currentTime = 0;
      videoEl.play();
      state.phase = 'intro';
      document.getElementById('t2-controls').style.display = 'none';
    }
  }

  function bindEvents() {
    document.getElementById('t2-btn-remove').addEventListener('click', removeSelected);
    document.getElementById('t2-btn-repeat').addEventListener('click', repeatVideo);
    document.getElementById('t2-btn-check').addEventListener('click', checkCode);
  }

  // Публичный API
  return { mount, unmount };
})();