export function fitImage(width, height, edge = 1600) {
  const scale = Math.min(1, edge / Math.max(width, height));
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}

export function cropRectangle(start, end, width, height) {
  const clamp = (value, max) => Math.min(max, Math.max(0, value));
  const x = clamp(Math.min(start.x, end.x), width), y = clamp(Math.min(start.y, end.y), height);
  return { x, y, width: clamp(Math.max(start.x, end.x), width) - x,
    height: clamp(Math.max(start.y, end.y), height) - y };
}

export function compressImage(image, rect = { x: 0, y: 0, width: image.naturalWidth, height: image.naturalHeight }, makeCanvas = () => document.createElement('canvas')) {
  if (!(rect.width > 0 && rect.height > 0)) throw new Error('請框選有效範圍。');
  const size = fitImage(rect.width, rect.height);
  const canvas = makeCanvas();
  canvas.width = size.width; canvas.height = size.height;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('瀏覽器無法處理圖片。');
  context.fillStyle = '#fff'; context.fillRect(0, 0, size.width, size.height);
  context.drawImage(image, rect.x, rect.y, rect.width, rect.height, 0, 0, size.width, size.height);
  const url = canvas.toDataURL('image/jpeg', 0.88);
  const data = url.split(',')[1];
  if (!url.startsWith('data:image/jpeg;base64,') || !data || data.length * 0.75 > 5 * 1024 * 1024) throw new Error('壓縮後圖片仍過大，請先縮小圖片再試。');
  return { url, mimeType: 'image/jpeg', data, ...size };
}

export function createCropTool(onApply) {
  const byId = (id) => document.getElementById(id);
  const dialog = byId('crop-dialog'), canvas = byId('crop-canvas'), status = byId('crop-status');
  const fields = ['x', 'y', 'w', 'h'].map((key) => byId(`crop-${key}`));
  let image, rect, start, version = 0;
  const draw = () => {
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#061c17aa'; ctx.fillRect(0, 0, canvas.width, canvas.height);
    if (rect.width && rect.height) {
      ctx.drawImage(image, rect.x / canvas.width * image.naturalWidth, rect.y / canvas.height * image.naturalHeight,
        rect.width / canvas.width * image.naturalWidth, rect.height / canvas.height * image.naturalHeight,
        rect.x, rect.y, rect.width, rect.height);
      ctx.strokeStyle = '#ffe399'; ctx.lineWidth = 3; ctx.strokeRect(rect.x, rect.y, rect.width, rect.height);
    }
    const values = [rect.x / canvas.width, rect.y / canvas.height, rect.width / canvas.width, rect.height / canvas.height];
    fields.forEach((field, i) => { field.value = String(Math.round(values[i] * 100)); });
    status.textContent = `已選取寬 ${fields[2].value}%、高 ${fields[3].value}%。`;
  };
  const point = (event) => {
    const bounds = canvas.getBoundingClientRect();
    return { x: (event.clientX - bounds.left) * canvas.width / bounds.width,
      y: (event.clientY - bounds.top) * canvas.height / bounds.height };
  };
  canvas.addEventListener('pointerdown', (event) => {
    if (!image || event.button > 0) return;
    start = point(event); canvas.setPointerCapture(event.pointerId); event.preventDefault();
  });
  canvas.addEventListener('pointermove', (event) => {
    if (!start) return;
    rect = cropRectangle(start, point(event), canvas.width, canvas.height); draw();
  });
  canvas.addEventListener('pointerup', (event) => {
    if (start) { rect = cropRectangle(start, point(event), canvas.width, canvas.height); draw(); }
    start = null;
  });
  canvas.addEventListener('pointercancel', () => { start = null; });
  fields.forEach((field) => field.addEventListener('input', () => {
    const [x, y, w, h] = fields.map((entry) => Math.min(100, Math.max(0, Number(entry.value) || 0)) / 100);
    rect = cropRectangle({ x: x * canvas.width, y: y * canvas.height },
      { x: (x + w) * canvas.width, y: (y + h) * canvas.height }, canvas.width, canvas.height); draw();
  }));
  byId('cancel-crop').addEventListener('click', () => dialog.close());
  dialog.addEventListener('close', () => { version++; image = null; start = null; });
  byId('apply-crop').addEventListener('click', () => {
    if (!image || rect.width < 8 || rect.height < 8) { status.textContent = '範圍太小，請框選完整題目。'; return; }
    try {
      const sx = image.naturalWidth / canvas.width, sy = image.naturalHeight / canvas.height;
      const result = compressImage(image, { x: rect.x * sx, y: rect.y * sy, width: rect.width * sx, height: rect.height * sy });
      onApply(result, { x: rect.x / canvas.width, y: rect.y / canvas.height, width: rect.width / canvas.width, height: rect.height / canvas.height }); dialog.close();
    } catch (error) { status.textContent = error.message; }
  });
  return { open(url, selectionOnly = false) {
    const current = ++version;
    byId('crop-title').textContent = selectionOnly ? '圈選旁支討論的位置' : '框選這一道題';
    byId('apply-crop').textContent = selectionOnly ? '在圈選處開啟旁支（不送出 AI）' : '使用裁切圖片';
    status.textContent = '正在開啟圖片…'; byId('apply-crop').disabled = true;
    dialog.showModal();
    const loadingImage = new Image();
    loadingImage.onload = () => {
      if (current !== version || !dialog.open) return;
      image = loadingImage;
      const size = fitImage(image.naturalWidth, image.naturalHeight, 1000);
      canvas.width = size.width; canvas.height = size.height;
      rect = { x: 0, y: 0, ...size }; draw(); byId('apply-crop').disabled = false;
    };
    loadingImage.onerror = () => { if (current === version) status.textContent = '無法開啟圖片，請重新選圖。'; };
    loadingImage.src = url;
  }, close() { if (dialog.open) dialog.close(); } };
}
