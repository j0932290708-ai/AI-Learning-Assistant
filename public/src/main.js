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
  answer: null,
  activeRequest: null,
  solvedRequest: null
};

const maxQuestionLength = 5000;
const maxImageBytes = 5 * 1024 * 1024;

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
const aiDrawButton = document.getElementById('ai-draw-button');
const visualResult = document.getElementById('visual-result');
const methodGrid = document.getElementById('method-grid');
const installButton = document.getElementById('install-button');
const installStatus = document.getElementById('install-status');
const modeBanner = document.getElementById('mode-banner');

let installPrompt = null;

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

const appMode = document.body.dataset.appMode || 'api';
const isPublicDemo = appMode === 'demo';
const defaultSolveButtonText = isPublicDemo
  ? '🧪 執行示範解題'
  : '🚀 開始 AI 解題';

function createRequestId() {
  if (globalThis.crypto?.randomUUID) {
    return globalThis.crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function createPublicDemoAnswer(request) {
  const methodName = methodLabels[request.method] || request.method;
  return {
    success: true,
    subject: request.subject,
    method: request.method,
    steps: [
      '辨認題目所屬單元，整理已知條件與要求。',
      `示範如何依「${methodName}」組織解題步驟。`,
      '檢查答案格式，整理成容易複習的內容。'
    ],
    answer: '這是固定的互動 Demo，不是模型生成的答案，請勿當作題目的真正解答。',
    explanation: '公開版用來展示八科流程與介面；真 AI 模式必須連接安全後端。'
  };
}

function sameRequestSelection(request) {
  return request
    && request.question === normalizeQuestion(questionInput?.value || '')
    && request.subject === state.subject
    && request.method === state.method;
}

function invalidateAnswerForInputChange() {
  visualResult.innerHTML = '<p class="hint">題目或選擇變更後，請重新產生圖解。</p>';
  if (state.solvedRequest && !sameRequestSelection(state.solvedRequest)) {
    state.answer = null;
    state.solvedRequest = null;
    resultBox.innerHTML = '<p class="hint">題目或選擇已變更，請重新解題。</p>';
  }

  if (state.activeRequest && !sameRequestSelection(state.activeRequest)) {
    state.activeRequest = null;
    resultBox.innerHTML = `
      <div class="hint">
        題目或科目已變更，剛才的解題結果不會套用到目前題目。
      </div>
    `;
  }
}

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
    const selected = button.dataset.subject === subjectId;
    button.classList.toggle('active', selected);
    button.setAttribute('aria-pressed', String(selected));
  });

  renderMethodButtons(subjectId);
  invalidateAnswerForInputChange();
}

function chooseMethod(methodName) {
  state.method = methodName;

  methodButtons.forEach((button) => {
    const selected = button.dataset.method === methodName;
    button.classList.toggle('active', selected);
    button.setAttribute('aria-pressed', String(selected));
  });

  invalidateAnswerForInputChange();
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
      ${typeof data.code === 'string' ? `<pre style="overflow:auto;white-space:pre;"><code>${escapeHtml(data.code)}</code></pre>` : ''}
      ${data.complexity ? `<p>複雜度：${escapeHtml(typeof data.complexity === 'object' ? JSON.stringify(data.complexity) : data.complexity)}</p>` : ''}
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

  if (question.length > maxQuestionLength) {
    resultBox.innerHTML = `
      <div class="answer">
        <strong>題目太長</strong>
        <p>最多 ${maxQuestionLength} 個字，請縮短後再試。</p>
      </div>
    `;
    return;
  }

  state.question = question;
  state.answer = null;
  state.solvedRequest = null;
  const request = Object.freeze({
    requestId: createRequestId(),
    question,
    subject: state.subject,
    method: state.method
  });
  state.activeRequest = request;

  resultBox.innerHTML = `
    <div class="answer">
      <strong>🤖 AI 正在解題...</strong>
      <p>請稍候。</p>
    </div>
  `;

  solveButton.disabled = true;
  solveButton.textContent = isPublicDemo
    ? '⏳ 載入示範中...'
    : '⏳ AI 解題中...';

  try {
    let data;
    if (isPublicDemo) {
      await new Promise((resolve) => setTimeout(resolve, 350));
      data = createPublicDemoAnswer(request);
    } else {
      const response = await fetch('/api/solve', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Request-ID': request.requestId
        },
        body: JSON.stringify({
          question: request.question,
          subject: request.subject,
          method: request.method
        })
      });

      data = await response.json();
      if (!response.ok || !data.success) {
        throw new Error(data?.error?.message || 'AI 解題失敗');
      }
    }

    if (state.activeRequest?.requestId !== request.requestId) {
      return;
    }

    state.answer = data.answer || '';
    state.solvedRequest = Object.freeze({
      ...request,
      actualMethod: data.method || request.method,
      answer: state.answer
    });

    resultBox.innerHTML = `
      <div class="answer">
        <strong>📚 科目：</strong>
        ${escapeHtml(subjectLabels[request.subject] || request.subject)}
        <br>
        <strong>🧠 解題方法：</strong>
        ${escapeHtml(methodLabels[data.method || request.method] || data.method || request.method)}
      </div>

      ${formatStructuredAnswer(data)}
    `;
  } catch (error) {
    if (state.activeRequest?.requestId !== request.requestId) return;
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
    if (state.activeRequest?.requestId === request.requestId) {
      state.activeRequest = null;
    }
    solveButton.disabled = false;
    solveButton.textContent = defaultSolveButtonText;
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

  const matchedResult = sameRequestSelection(state.solvedRequest)
    ? state.solvedRequest
    : null;

  try {
    const entries = saveQuestionToBank(
      matchedResult?.question || cleanText,
      subjectLabels[matchedResult?.subject || state.subject] || state.subject,
      methodLabels[matchedResult?.actualMethod || state.method] || matchedResult?.actualMethod || state.method,
      matchedResult?.answer || ''
    );
    renderBank(entries);
  } catch (error) {
    bankBox.innerHTML = `
      <div class="hint">
        <strong>題庫沒有儲存成功</strong>
        <p>${escapeHtml(error.message)}</p>
      </div>
    `;
  }
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
          ${entry.answer ? `<details><summary>查看已收藏答案</summary><p style="white-space:pre-wrap;">${escapeHtml(entry.answer)}</p></details>` : ''}
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

  const supportedTypes = new Set([
    'image/png',
    'image/jpeg',
    'image/webp'
  ]);

  if (!supportedTypes.has(file.type)) {
    event.target.value = '';
    photoStatus.textContent = '只支援 PNG、JPEG 或 WebP 圖片。';
    return;
  }

  if (file.size > maxImageBytes) {
    event.target.value = '';
    photoStatus.textContent = '圖片不可超過 5 MB。';
    return;
  }

  state.image = file;

  const reader = new FileReader();

  reader.onload = () => {
    if (photoPreview) {
      photoPreview.onload = () => {
        const pixels = photoPreview.naturalWidth * photoPreview.naturalHeight;
        if (pixels > 20_000_000) {
          photoPreview.removeAttribute('src');
          photoPreview.style.display = 'none';
          photoStatus.textContent = '圖片解析度過大，請使用較小的圖片。';
          state.image = null;
        }
      };
      photoPreview.src = reader.result;
      photoPreview.style.display = 'block';
    }

    if (photoStatus) {
      photoStatus.textContent =
        `📷 已選擇圖片：${file.name}`;
    }
  };

  reader.onerror = () => {
    state.image = null;
    photoStatus.textContent = '圖片無法讀取，請換一張圖片。';
  };

  reader.readAsDataURL(file);
}

function handleQuestionInput() {
  state.question = normalizeQuestion(
    questionInput?.value || ''
  );

  if (previewText) {
    previewText.textContent = state.question
      ? `目前輸入 ${state.question.length} / ${maxQuestionLength} 個字`
      : '請輸入題目';
  }

  invalidateAnswerForInputChange();
}

function showInstallStatus(message) {
  if (installStatus) {
    installStatus.textContent = message;
  }
}

async function installApp() {
  if (matchMedia('(display-mode: standalone)').matches) {
    showInstallStatus('App 已經安裝完成，可以從裝置圖示開啟。');
    return;
  }

  if (installPrompt) {
    installPrompt.prompt();
    const choice = await installPrompt.userChoice;
    showInstallStatus(
      choice.outcome === 'accepted'
        ? '安裝完成後，裝置上會出現 AI 學習助手圖示。'
        : '已取消安裝，之後仍可再按一次。'
    );
    installPrompt = null;
    return;
  }

  showInstallStatus(
    '若沒有跳出安裝視窗，請用瀏覽器選單的「安裝應用程式」或「加入主畫面」。'
  );
}

addEventListener('beforeinstallprompt', (event) => {
  event.preventDefault();
  installPrompt = event;
  showInstallStatus('可以安裝到裝置，安裝後會顯示 App 圖示。');
});

addEventListener('appinstalled', () => {
  installPrompt = null;
  showInstallStatus('App 安裝完成，可以從裝置圖示開啟。');
});

solveButton.textContent = defaultSolveButtonText;
if (isPublicDemo && modeBanner) {
  modeBanner.classList.remove('hidden');
  modeBanner.textContent = '公開互動 Demo：解題答案是固定示範，圖解由可驗證規則產生，不是 AI 模型輸出。';
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

if (aiDrawButton) {
  aiDrawButton.addEventListener('click', generateVisual);
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

if (installButton) {
  installButton.addEventListener('click', installApp);
}

if ('serviceWorker' in navigator) {
  addEventListener('load', () => {
    navigator.serviceWorker.register('/service-worker.js').catch((error) => {
      console.error('Service worker registration failed:', error);
    });
  });
}

function readValue(question, pattern, fallback) {
  const match = question.match(pattern);
  return match ? match[1] : fallback;
}

function createCircuitVisual(question) {
  const voltageValues = Array.from(question.matchAll(/([+-]?\d+(?:\.\d+)?)\s*(?:V\b|伏特)/gi));
  const resistorValues = Array.from(question.matchAll(/([+-]?\d+(?:\.\d+)?)\s*(?:Ω|ohm|歐姆)/gi));
  if (voltageValues.length !== 1 || Number(voltageValues[0][1]) <= 0
    || resistorValues.some(match => Number(match[1]) <= 0)
    || /(並聯|parallel|二極體|電晶體|電容|電感|diode|transistor|capacitor|inductor|BJT|FET|op.?amp)/i.test(question)) {
    return { error: '目前只支援一個正電壓電源與正電阻的單一串聯電路；其他元件或不明接法暫不繪製。' };
  }
  const voltage = readValue(question, /([0-9]+(?:\.[0-9]+)?)\s*(?:V|伏特)/i, null);
  const current = readValue(question, /([0-9]+(?:\.[0-9]+)?)\s*(?:A|安培)/i, null);
  const resistors = Array.from(question.matchAll(
    /(?:\b(R\d+)\s*=\s*)?([0-9]+(?:\.[0-9]+)?)\s*(?:Ω|ohm|歐姆)/gi
  )).map((match, index) => ({
    label: match[1]?.toUpperCase() || `R${index + 1}`,
    value: match[2]
  }));

  if (!voltage || resistors.length === 0) {
    return {
      error: '目前只支援包含電源電壓與電阻值的基本電路題，例如「12V、R1=4Ω」。'
    };
  }

  if (resistors.length > 3) {
    return { error: '目前最多能可靠繪製 3 個電阻，請縮小題目範圍。' };
  }

  if (resistors.length > 1 && !/(串聯|series)/i.test(question)) {
    return {
      error: `偵測到 ${resistors.map((item) => item.label).join('、')}，但無法確認串並聯關係，因此不猜圖。請在題目中寫明「串聯」。`
    };
  }

  const resistorWidth = 220 / resistors.length;
  const resistorShapes = resistors.map((item, index) => {
    const x = 235 + (index * resistorWidth);
    return `
      <rect x="${x}" y="62" width="${resistorWidth - 12}" height="46" rx="8" fill="#ffffff" stroke="#7c3aed" stroke-width="4"></rect>
      <text x="${x + ((resistorWidth - 12) / 2)}" y="92" text-anchor="middle" fill="#5b21b6" font-size="17" font-weight="700">${escapeHtml(item.label)}=${escapeHtml(item.value)}Ω</text>
    `;
  }).join('');

  const resistorSummary = resistors
    .map((item) => `${item.label}=${item.value}Ω`)
    .join('、');

  return {
    html: `
    <svg viewBox="0 0 640 330" role="img" aria-label="電路的電流與電壓方向圖">
      <defs>
        <marker id="arrow-current" markerWidth="10" markerHeight="10" refX="8" refY="3" orient="auto">
          <path d="M0,0 L0,6 L9,3 z" fill="#ef4444"></path>
        </marker>
      </defs>
      <rect x="12" y="12" width="616" height="306" rx="18" fill="#f8fafc" stroke="#cbd5e1"></rect>
      <path d="M100 145 V85 H535 V245 H100 V178" fill="none" stroke="#334155" stroke-width="5"></path>
      ${resistorShapes}
      <line x1="75" y1="145" x2="125" y2="145" stroke="#2563eb" stroke-width="6"></line>
      <line x1="84" y1="178" x2="116" y2="178" stroke="#2563eb" stroke-width="4"></line>
      <line x1="100" y1="85" x2="100" y2="145" stroke="#334155" stroke-width="5"></line>
      <line x1="100" y1="178" x2="100" y2="245" stroke="#334155" stroke-width="5"></line>
      <line x1="145" y1="55" x2="235" y2="55" stroke="#ef4444" stroke-width="4" marker-end="url(#arrow-current)"></line>
      <line x1="500" y1="275" x2="410" y2="275" stroke="#ef4444" stroke-width="4" marker-end="url(#arrow-current)"></line>
      <text x="150" y="43" fill="#b91c1c" font-size="20" font-weight="700">I = ${escapeHtml(current || '待求')} ${current ? 'A' : ''}</text>
      <text x="58" y="168" fill="#1d4ed8" font-size="18" font-weight="700">V = ${escapeHtml(voltage)} V</text>
      <text x="225" y="55" fill="#dc2626" font-size="24">+</text>
      <text x="460" y="55" fill="#2563eb" font-size="28">−</text>
      <text x="175" y="305" fill="#475569" font-size="17">紅色箭頭：傳統電流方向　＋／−：元件電壓方向</text>
    </svg>
    `,
    summary: `已讀取電源 ${voltage}V 與 ${resistorSummary}。圖中紅色箭頭表示傳統電流順時針方向；電阻為${resistors.length > 1 ? '串聯' : '單一元件'}。`
  };
}

function coefficient(value, fallback = 1) {
  if (value === '' || value === '+') return 1;
  if (value === '-') return -1;
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function createMathVisual(question) {
  const expression = question.replace(/\s+/g, '').replace(/²/g, '^2');
  const quadratic = expression.match(/^y=([+-]?(?:\d+(?:\.\d+)?)?)x\^2(?:([+-](?:\d+(?:\.\d+)?)?)x)?([+-]\d+(?:\.\d+)?)?$/i);
  const linear = expression.match(/^y=([+-]?(?:\d+(?:\.\d+)?)?)x([+-]\d+(?:\.\d+)?)?$/i);

  if (!quadratic && !linear) {
    return {
      error: '此題沒有可辨識的函數。請輸入 y=ax+b 或 y=ax²+bx+c；像 2+2 這類題目不會硬畫成函數圖。'
    };
  }

  const isQuadratic = Boolean(quadratic);
  const a = coefficient((quadratic || linear)?.[1] ?? '', 1);
  const b = isQuadratic ? coefficient(quadratic?.[2]?.replace(/x$/i, '') || '0', 0) : 0;
  const c = Number((isQuadratic ? quadratic?.[3] : linear?.[2]) || 0);
  const formula = isQuadratic
    ? `y = ${a}x² ${b >= 0 ? '+' : '−'} ${Math.abs(b)}x ${c >= 0 ? '+' : '−'} ${Math.abs(c)}`
    : `y = ${a}x ${c >= 0 ? '+' : '−'} ${Math.abs(c)}`;
  const points = [];

  for (let x = -5; x <= 5; x += 0.2) {
    const y = isQuadratic ? (a * x * x) + (b * x) + c : (a * x) + c;
    const screenX = 320 + (x * 48);
    const screenY = 170 - (y * 27);
    points.push(`${screenX.toFixed(1)},${screenY.toFixed(1)}`);
  }

  const grid = Array.from({ length: 11 }, (_, index) => {
    const x = 80 + (index * 48);
    const y = 35 + (index * 27);
    return `<line x1="${x}" y1="35" x2="${x}" y2="305"></line><line x1="80" y1="${y}" x2="560" y2="${y}"></line>`;
  }).join('');

  return {
    html: `
    <svg viewBox="0 0 640 350" role="img" aria-label="函數圖形 ${escapeHtml(formula)}">
      <defs><clipPath id="plot-boundary"><rect x="80" y="35" width="480" height="270"></rect></clipPath></defs>
      <rect x="12" y="12" width="616" height="326" rx="18" fill="#f8fafc" stroke="#cbd5e1"></rect>
      <g stroke="#e2e8f0" stroke-width="1">${grid}</g>
      <line x1="80" y1="170" x2="575" y2="170" stroke="#334155" stroke-width="3"></line>
      <line x1="320" y1="315" x2="320" y2="25" stroke="#334155" stroke-width="3"></line>
      <text x="578" y="163" font-size="18">x</text><text x="330" y="30" font-size="18">y</text>
      <polyline clip-path="url(#plot-boundary)" points="${points.join(' ')}" fill="none" stroke="#7c3aed" stroke-width="5" stroke-linejoin="round"></polyline>
      <text x="92" y="55" fill="#5b21b6" font-size="20" font-weight="700">${escapeHtml(formula)}</text>
    </svg>
    `,
    summary: `已辨識函數 ${formula}。橫軸是 x、縱軸是 y，紫色線條表示函數在 x=-5 到 5 的變化。`
  };
}

function createChineseVisual(question) {
  const dictionary = {
    之: '代詞或助詞，要依上下文判斷。',
    其: '可表示他的、那個，或推測語氣。',
    而: '連接前後語意，可表承接、轉折或並列。',
    以: '常表示用、因為、來，需配合句意。',
    於: '常表示在、向、對於或比。',
    者: '可指人事物，也可用來停頓或判斷。',
    也: '句末語氣詞，常用於判斷或說明。'
  };
  const notes = Object.entries(dictionary)
    .filter(([word]) => question.includes(word))
    .slice(0, 5);

  if (!notes.length) {
    return {
      error: '目前只會標註常見文言虛詞（之、其、而、以、於、者、也）。找不到可可靠標註的字詞，因此不自動編造注釋。'
    };
  }

  return {
    html: `
    <div class="annotation-board">
      <div class="annotation-passage">
        <strong>原文／題目</strong><br>${escapeHtml(question)}
      </div>
      <div>
        ${notes.map(([word, note]) => `
          <div class="annotation-note"><strong>${escapeHtml(word)}</strong>：${escapeHtml(note)}</div>
        `).join('')}
      </div>
    </div>
    `,
    summary: `已找到 ${notes.length} 個常見文言虛詞。這些是一般字義提示，仍要配合句子上下文判斷。`
  };
}

function createConceptVisual(request) {
  const subject = subjectLabels[request.subject] || '目前科目';
  const method = methodLabels[request.method] || '自動選擇';
  return {
    html: `
    <svg viewBox="0 0 640 260" role="img" aria-label="${escapeHtml(subject)}觀念流程圖">
      <defs><marker id="arrow-flow" markerWidth="10" markerHeight="10" refX="8" refY="3" orient="auto"><path d="M0,0 L0,6 L9,3 z" fill="#7c3aed"></path></marker></defs>
      <rect x="12" y="12" width="616" height="236" rx="18" fill="#f8fafc" stroke="#cbd5e1"></rect>
      <g font-size="17" text-anchor="middle">
        <rect x="45" y="92" width="125" height="70" rx="12" fill="#dbeafe"></rect><text x="108" y="120"><tspan x="108">讀取題目</tspan><tspan x="108" dy="24">${escapeHtml(subject)}</tspan></text>
        <rect x="255" y="92" width="130" height="70" rx="12" fill="#ede9fe"></rect><text x="320" y="120"><tspan x="320">選擇方法</tspan><tspan x="320" dy="24">${escapeHtml(method)}</tspan></text>
        <rect x="470" y="92" width="125" height="70" rx="12" fill="#dcfce7"></rect><text x="533" y="120"><tspan x="533">整理步驟</tspan><tspan x="533" dy="24">檢查答案</tspan></text>
      </g>
      <line x1="178" y1="127" x2="245" y2="127" stroke="#7c3aed" stroke-width="4" marker-end="url(#arrow-flow)"></line>
      <line x1="393" y1="127" x2="460" y2="127" stroke="#7c3aed" stroke-width="4" marker-end="url(#arrow-flow)"></line>
    </svg>
    `,
    summary: `這是「${subject}・${method}」的一般解題流程，不代表這一題的專屬答案或圖形。`
  };
}

function generateVisual() {
  const question = normalizeQuestion(questionInput?.value || '');

  if (!question) {
    visualResult.innerHTML = '<p class="hint"><strong>請先輸入題目，再按題目圖解。</strong></p>';
    return;
  }

  const request = {
    question,
    subject: state.subject,
    method: state.method
  };

  let visual;
  if (request.subject === 'basic_electricity' || request.subject === 'electronics') {
    visual = createCircuitVisual(request.question);
  } else if (request.subject === 'math') {
    visual = createMathVisual(request.question);
  } else if (request.subject === 'chinese') {
    visual = createChineseVisual(request.question);
  } else {
    visual = createConceptVisual(request);
  }

  if (visual.error) {
    visualResult.innerHTML = `
      <span class="badge">${escapeHtml(subjectLabels[request.subject])}・無法可靠繪圖</span>
      <p class="hint"><strong>${escapeHtml(visual.error)}</strong></p>
    `;
    return;
  }

  visualResult.innerHTML = `
    <span class="badge">${escapeHtml(subjectLabels[request.subject])}・規則式圖解</span>
    ${visual.html}
    <div class="visual-summary">${escapeHtml(visual.summary)}</div>
  `;
}

// 預設選擇數學
chooseSubject('math');

// 預設使用 AI 自動選擇
chooseMethod('auto');

// 載入題庫
renderBank(loadQuestionBank());
