import {
  escapeHtml,
  normalizeQuestion,
  loadQuestionBank,
  saveQuestionToBank
} from './api.js';

const state = {
  subject: null,
  method: null,
  question: '',
  image: null,
  answer: null
};

const subjectButtons = Array.from(
  document.querySelectorAll('.subject')
);

let methodButtons = [];

const questionInput = document.getElementById('question');
const resultBox = document.getElementById('result');
const bankBox = document.getElementById('bank');
const previewText = document.getElementById('previewText');

const photoInput = document.getElementById('photo');
const photoPreview = document.getElementById('preview');
const photoStatus = document.getElementById('photoStatus');

const solveButton = document.getElementById('solve-button');
const saveButton = document.getElementById('save-button');
const methodGrid = document.getElementById('method-grid');

const subjectLabels = {
  math: '數學',
  chinese: '國文',
  english: '英文',
  basic_electricity: '基本電學',
  electronics: '電子學',
  digital_logic: '數位邏輯',
  programming: '程式設計',
  microprocessor: '微處理機'
};

const methodLabels = {
  auto: 'AI 自動選擇',
  algebra: '代數',
  calculus: '微積分',
  combinatorics: '排列組合',
  arithmetic: '算術',
  node_voltage: '節點電壓法',
  mesh_current: '迴路電流法',
  kcl: 'KCL',
  kvl: 'KVL',
  series_parallel: '串並聯',
  diode: '二極體',
  bjt: 'BJT',
  fet: 'FET',
  op_amp: '運算放大器',
  amplifier: '放大電路',
  boolean: '布林代數',
  logic_gate: '邏輯閘',
  truth_table: '真值表',
  karnaugh_map: '卡諾圖',
  flip_flop: '觸發器',
  c: 'C',
  cpp: 'C++',
  python: 'Python',
  javascript: 'JavaScript',
  debugging: '除錯',
  algorithm: '演算法',
  instruction: '指令',
  register: '暫存器',
  memory: '記憶體',
  assembly: '組合語言',
  io: '輸入輸出',
  architecture: '架構',
  reading: '閱讀',
  classical_chinese: '文言文',
  vocabulary: '字詞',
  idiom: '成語',
  literature: '文學常識',
  grammar: '文法',
  translation: '翻譯',
  cloze: '克漏字',
  sentence: '句子修正'
};

const subjectMethods = {
  math: ['auto', 'algebra', 'calculus', 'combinatorics', 'arithmetic'],
  basic_electricity: ['auto', 'kcl', 'kvl', 'node_voltage', 'mesh_current', 'series_parallel'],
  electronics: ['auto', 'diode', 'bjt', 'fet', 'op_amp', 'amplifier'],
  digital_logic: ['auto', 'boolean', 'logic_gate', 'truth_table', 'karnaugh_map', 'flip_flop'],
  programming: ['auto', 'c', 'cpp', 'python', 'javascript', 'debugging', 'algorithm'],
  microprocessor: ['auto', 'instruction', 'register', 'memory', 'assembly', 'io', 'architecture'],
  chinese: ['auto', 'reading', 'classical_chinese', 'vocabulary', 'idiom', 'literature', 'grammar'],
  english: ['auto', 'vocabulary', 'grammar', 'reading', 'translation', 'cloze', 'sentence']
};

function renderMethodButtons(subjectId) {
  const methods = subjectMethods[subjectId] || ['auto'];

  methodGrid.innerHTML = methods
    .map((method) => `
      <button class="method" data-method="${method}" type="button">
        ${methodLabels[method] || method}
      </button>
    `)
    .join('');

  methodButtons = Array.from(methodGrid.querySelectorAll('.method'));
  methodButtons.forEach((button) => {
    button.addEventListener('click', () => {
      chooseMethod(button.dataset.method);
    });
  });

  chooseMethod('auto');
}

function chooseSubject(subjectId) {
  state.subject = subjectId;

  subjectButtons.forEach((button) => {
    button.classList.toggle(
      'active',
      button.dataset.subject === subjectId
    );
  });

  renderMethodButtons(subjectId);
}

function chooseMethod(methodName) {
  state.method = methodName;

  methodButtons.forEach((button) => {
    button.classList.toggle(
      'active',
      button.dataset.method === methodName
    );
  });
}

/*
 * 將 AI 回傳的 Markdown 簡單整理成適合網頁閱讀的 HTML。
 * 不使用外部套件，避免再增加依賴。
 */
function formatAIAnswer(text) {
  if (!text) {
    return '<p class="small">AI 沒有回傳答案。</p>';
  }

  let html = escapeHtml(String(text));

  // 移除常見的 Markdown 分隔線
  html = html.replace(/\\-{3,}/g, '');
  html = html.replace(/^-{3,}$/gm, '');

  // 標題
  html = html.replace(
    /^###\s+(.+)$/gm,
    '<h3>$1</h3>'
  );

  html = html.replace(
    /^##\s+(.+)$/gm,
    '<h2>$1</h2>'
  );

  // 粗體
  html = html.replace(
    /\*\*(.+?)\*\*/g,
    '<strong>$1</strong>'
  );

  // LaTeX display math
  html = html.replace(
    /\$\$([\s\S]*?)\$\$/g,
    '<div class="ai-formula">$1</div>'
  );

  // 單行 LaTeX
  html = html.replace(
    /\$([^$\n]+)\$/g,
    '<span class="ai-math">$1</span>'
  );

  // Step 1 / Step 2 / Step 3
  html = html.replace(
    /\bStep\s*(\d+)\s*[:：]/gi,
    '<strong class="step-title">Step $1：</strong>'
  );

  // 最終答案
  html = html.replace(
    /【最終答案】/g,
    '<div class="final-title">最終答案</div>'
  );

  // 解題方法
  html = html.replace(
    /【解題方法】/g,
    '<div class="section-title">解題方法</div>'
  );

  // 解題步驟
  html = html.replace(
    /【解題步驟】/g,
    '<div class="section-title">解題步驟</div>'
  );

  // 計算過程
  html = html.replace(
    /【計算過程】/g,
    '<div class="section-title">計算過程</div>'
  );

  // 觀念整理
  html = html.replace(
    /【觀念整理】/g,
    '<div class="section-title">觀念整理</div>'
  );

  // Markdown bullet
  html = html.replace(
    /^[ \t]*[\*\-]\s+(.+)$/gm,
    '<div class="ai-bullet">• $1</div>'
  );

  // 換行
  html = html.replace(/\n{2,}/g, '<br><br>');
  html = html.replace(/\n/g, '<br>');

  return `
    <div class="ai-answer">
      ${html}
    </div>
  `;
}

function formatStructuredAnswer(data) {
  const steps = Array.isArray(data.steps)
    ? data.steps
      .map((step, index) => `
        <li><strong>Step ${index + 1}</strong> ${escapeHtml(step)}</li>
      `)
      .join('')
    : '';

  return `
    <div class="ai-answer">
      ${steps ? `
        <div class="section-title">解題步驟</div>
        <ol>${steps}</ol>
      ` : ''}
      <div class="final-title">最終答案</div>
      ${formatAIAnswer(data.answer)}
      ${data.explanation ? `
        <div class="section-title">觀念解釋</div>
        <p>${escapeHtml(data.explanation)}</p>
      ` : ''}
    </div>
  `;
}

async function solve() {
  const question = normalizeQuestion(
    questionInput?.value || ''
  );

  if (!question) {
    resultBox.innerHTML = `
      <div class="answer">
        <strong>請先輸入題目</strong>
        <p>你可以直接打字，或之後使用拍照功能。</p>
      </div>
    `;
    return;
  }

  state.question = question;

  resultBox.innerHTML = `
    <div class="answer">
      <strong>🤖 AI 正在解題...</strong>
      <p>請稍候。</p>
    </div>
  `;

  solveButton.disabled = true;
  solveButton.textContent = '⏳ AI 解題中...';

  try {
    const response = await fetch('/api/solve', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        question: state.question,
        subject: state.subject,
        method: state.method
      })
    });

    const data = await response.json();

    if (!response.ok || !data.success) {
      throw new Error(
        data?.error?.message || 'AI 解題失敗'
      );
    }

    state.answer = data.answer || '';

    resultBox.innerHTML = `
      <div class="answer">
        <strong>📚 科目：</strong>
        ${escapeHtml(subjectLabels[data.subject] || data.subject)}
        <br>
        <strong>🧠 解題方法：</strong>
        ${escapeHtml(methodLabels[data.method] || data.method)}
      </div>

      ${formatStructuredAnswer(data)}
    `;
  } catch (error) {
    console.error('Solve error:', error);

    resultBox.innerHTML = `
      <div class="answer" style="border-left-color:#ef4444;background:#fef2f2;">
        <strong>❌ 解題失敗</strong>
        <p>${escapeHtml(error.message)}</p>
        <p class="small">
          請確認後端服務與 API key 設定。
        </p>
      </div>
    `;
  } finally {
    solveButton.disabled = false;
    solveButton.textContent = '🚀 開始解題';
  }
}

function saveQuestion() {
  const cleanText = normalizeQuestion(
    questionInput?.value || ''
  );

  if (!cleanText) {
    alert('請先輸入題目。');
    return;
  }

  const entries = saveQuestionToBank(
    cleanText,
    subjectLabels[state.subject] || state.subject,
    methodLabels[state.method] || state.method,
    state.answer || ''
  );

  renderBank(entries);
}

function renderBank(entries) {
  if (!bankBox) {
    return;
  }

  if (!entries.length) {
    bankBox.innerHTML = `
      <p class="small">
        目前還沒有收藏的題目。
      </p>
    `;
    return;
  }

  bankBox.innerHTML = entries
    .map(
      (entry) => `
        <div class="question">
          <span class="badge">
            ${escapeHtml(entry.subject || '未分類')}
          </span>

          <div
            class="small"
            style="margin-top:8px;"
          >
            ${escapeHtml(entry.method || 'AI 自動選擇')}
          </div>

          <p>
            ${escapeHtml(entry.question || '')}
          </p>
        </div>
      `
    )
    .join('');
}

function handlePhotoUpload(event) {
  const file = event.target.files?.[0];

  if (!file) {
    return;
  }

  state.image = file;

  const reader = new FileReader();

  reader.onload = () => {
    if (photoPreview) {
      photoPreview.src = reader.result;
      photoPreview.style.display = 'block';
    }

    if (photoStatus) {
      photoStatus.textContent =
        `📷 已選擇圖片：${file.name}`;
    }
  };

  reader.readAsDataURL(file);
}

function handleQuestionInput() {
  state.question = normalizeQuestion(
    questionInput?.value || ''
  );

  if (previewText) {
    previewText.textContent = state.question
      ? `目前輸入 ${state.question.length} 個字`
      : '請輸入題目';
  }
}

subjectButtons.forEach((button) => {
  button.addEventListener('click', () => {
    chooseSubject(button.dataset.subject);
  });
});

if (solveButton) {
  solveButton.addEventListener('click', solve);
}

if (saveButton) {
  saveButton.addEventListener('click', saveQuestion);
}

if (questionInput) {
  questionInput.addEventListener(
    'input',
    handleQuestionInput
  );
}

if (photoInput) {
  photoInput.addEventListener(
    'change',
    handlePhotoUpload
  );
}

// 預設選擇數學
chooseSubject('math');

// 預設使用 AI 自動選擇
chooseMethod('auto');

// 載入題庫
renderBank(loadQuestionBank());
