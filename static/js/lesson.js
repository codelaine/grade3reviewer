/* ============================================================
   lesson.js – Quiz engine for the lesson page
   ============================================================ */

// ── Parse embedded data ────────────────────────────────────────
const QUESTIONS  = JSON.parse(document.getElementById('questions-data').textContent);
const TOPIC      = JSON.parse(document.getElementById('topic-data').textContent);

// ── State ──────────────────────────────────────────────────────
let currentIndex = 0;
let correctCount = 0;
let heartsLeft   = 3;
let answered     = false;
let quizStarted  = false;

const LETTERS = ['A', 'B', 'C', 'D'];

// ── DOM refs ───────────────────────────────────────────────────
const startBtn      = document.getElementById('start-btn');
const introCard     = document.getElementById('intro-card');
const questionCard  = document.getElementById('question-card');
const qNumber       = document.getElementById('q-number');
const qTypeBadge    = document.getElementById('q-type-badge');
const qText         = document.getElementById('q-text');
const hintBtn       = document.getElementById('hint-btn');
const hintText      = document.getElementById('hint-text');
const choicesGrid   = document.getElementById('choices-grid');
const feedbackBar   = document.getElementById('feedback-bar');
const feedbackIcon  = document.getElementById('feedback-icon');
const feedbackMsg   = document.getElementById('feedback-msg');
const nextBtn       = document.getElementById('next-btn');
const progressFill  = document.getElementById('progress-fill');
const progressText  = document.getElementById('progress-text');

// ── Start lesson ───────────────────────────────────────────────
startBtn.addEventListener('click', () => {
  introCard.classList.add('hidden');
  questionCard.classList.remove('hidden');
  quizStarted = true;
  renderQuestion(0);
});

// ── Hint toggle ────────────────────────────────────────────────
hintBtn.addEventListener('click', () => {
  hintText.classList.toggle('hidden');
});

// ── Render a question ──────────────────────────────────────────
function renderQuestion(idx) {
  answered = false;
  const q = QUESTIONS[idx];
  if (!q) return;

  // Reset UI
  feedbackBar.className = 'feedback-bar hidden';
  nextBtn.classList.add('hidden');
  hintText.classList.add('hidden');
  hintText.textContent = q.hint || '';

  // Header
  qNumber.textContent   = `Question ${idx + 1} / ${QUESTIONS.length}`;
  qTypeBadge.textContent = q.type === 'true_false'
    ? 'True or False?'
    : 'Choose the correct answer';
  qText.textContent = q.question;

  // Image (if applicable)
  const questionImageWrap = document.getElementById('question-image-wrap');
  questionImageWrap.innerHTML = '';

  if (q.image) {
    const image = document.createElement('img');
    image.src = q.image;
    image.alt = q.question;
    image.className = 'question-image';
    questionImageWrap.appendChild(image);
  }

  // Progress bar
  const pct = (idx / QUESTIONS.length) * 100;
  progressFill.style.width = pct + '%';
  progressText.textContent = `${idx} / ${QUESTIONS.length}`;

  // Choices — shuffle order each render (answer comparison is by value, not index)
  choicesGrid.innerHTML = '';
  const isTF = q.type === 'true_false';
  choicesGrid.className = 'choices-grid ' + (isTF ? 'grid-2' : 'grid-4');

  const shuffledChoices = isTF ? [...q.choices] : [...q.choices].sort(() => Math.random() - 0.5);
  shuffledChoices.forEach((choice, i) => {
    const btn = document.createElement('button');
    btn.className = 'choice-btn';
    btn.innerHTML = `
      <span class="choice-letter">${isTF ? (i === 0 ? '✔' : '✖') : LETTERS[i]}</span>
      <span>${choice}</span>
    `;
    btn.addEventListener('click', () => handleAnswer(btn, choice, q));
    choicesGrid.appendChild(btn);
  });

  // Entrance animation
  questionCard.classList.remove('bounce-in');
  void questionCard.offsetWidth; // reflow
  questionCard.classList.add('bounce-in');
}

// ── Handle answer selection ────────────────────────────────────
function handleAnswer(btn, selected, q) {
  if (answered) return;
  answered = true;

  const isCorrect = selected === q.answer;

  // Disable all choices and style them
  const allBtns = choicesGrid.querySelectorAll('.choice-btn');
  allBtns.forEach(b => {
    b.disabled = true;
    const label = b.querySelector('span:last-child').textContent.trim();
    if (label === q.answer) b.classList.add('correct');
  });
  if (!isCorrect) {
    btn.classList.remove('correct');
    btn.classList.add('wrong');
    btn.classList.add('shake');
  }

  // Feedback
  if (isCorrect) {
    correctCount++;
    feedbackBar.className = 'feedback-bar correct-fb';
    feedbackIcon.textContent = '🎉';
    feedbackMsg.textContent  = getPositiveFeedback();
    showToast('🌟 Correct! Excellent!');
  } else {
    heartsLeft--;
    updateHearts();
    feedbackBar.className = 'feedback-bar wrong-fb';
    feedbackIcon.textContent = '💪';
    feedbackMsg.textContent  = `The correct answer is: "${q.answer}" — Keep going!`;
    showToast(`🌱 The correct answer is: ${q.answer}`);
  }
  feedbackBar.classList.remove('hidden');
  nextBtn.classList.remove('hidden');
}

// ── Next button ────────────────────────────────────────────────
nextBtn.addEventListener('click', () => {
  currentIndex++;
  if (currentIndex < QUESTIONS.length) {
    renderQuestion(currentIndex);
  } else {
    finishLesson();
  }
});

// ── Update hearts display ──────────────────────────────────────
function updateHearts() {
  const hearts = [
    document.getElementById('h1'),
    document.getElementById('h2'),
    document.getElementById('h3'),
  ];
  const lost = 3 - heartsLeft;
  hearts.forEach((h, i) => {
    if (i < lost) h.classList.add('lost');
    else          h.classList.remove('lost');
  });
}

// ── Finish lesson: call API and show celebration ───────────────
async function finishLesson() {
  // Final progress fill
  progressFill.style.width = '100%';
  progressText.textContent = `${QUESTIONS.length} / ${QUESTIONS.length}`;

  try {
    const res  = await fetch('/api/complete_lesson', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        topic_id:  TOPIC.id,
        correct:   correctCount,
        total:     QUESTIONS.length,
      }),
    });
    const data = await res.json();
    const pct  = QUESTIONS.length > 0 ? correctCount / QUESTIONS.length : 0;

    // Pick celebration content based on score
    let emoji, title, msg;
    if (pct >= 0.9) {
      emoji = '🏆'; title = 'Excellent!';
      msg   = `${correctCount} out of ${QUESTIONS.length} correct! You are a star! 🌟`;
      burstConfetti(50);
    } else if (pct >= 0.6) {
      emoji = '🌼'; title = 'Great job!';
      msg   = `${correctCount} out of ${QUESTIONS.length} correct! Keep practicing! 🌱`;
      burstConfetti(25);
    } else {
      emoji = '🌿'; title = 'Keep going!';
      msg   = `${correctCount} out of ${QUESTIONS.length} correct. Try again to improve! 🔁`;
    }

    // Update nav counters
    const sc = document.getElementById('streak-count');
    const st = document.getElementById('stars-count');
    if (sc) sc.textContent = data.streak;
    if (st) st.textContent = data.total_stars;

    showCelebration({
      emoji, title, msg,
      stars: data.stars_earned,
      onClose: () => { window.location.href = '/'; },
    });
  } catch (err) {
    console.error(err);
    window.location.href = '/';
  }
}

// ── Positive feedback phrases ──────────────────────────────────
function getPositiveFeedback() {
  const phrases = [
    'Correct! Excellent work! 🌟',
    'Amazing! Keep growing! 🌱',
    'Wow, you got it! Awesome! ⭐',
    'Fantastic! You nailed it! ✨',
    'You are doing great! 🌿',
    'Correct! You are a bright thinker! 🧠',
    'Bravo! That was right! 🌼',
    'Outstanding! Great job! 🏆',
  ];
  return phrases[Math.floor(Math.random() * phrases.length)];
}
