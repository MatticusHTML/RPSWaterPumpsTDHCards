// RPS Pump Curve Tool
// Data driven: everything comes from data/families.json. No values are hardcoded here.
// Calibration is stored as fractions of each chart image, so it is resolution independent.

let FAM = {}, ORDER = [];
const imgCache = {};
let curKey = null, cur = null;

// DOM
const grid = document.getElementById('grid');
const home = document.getElementById('home');
const tool = document.getElementById('tool');
const cv = document.getElementById('cv');
const ctx = cv.getContext('2d');
const modelSel = document.getElementById('model');
const tdhIn = document.getElementById('tdh');
const readout = document.getElementById('readout');
const pill = document.getElementById('pill');
const sizeNote = document.getElementById('sizeNote');
const toolTitle = document.getElementById('toolTitle');
const themeToggle = document.getElementById('themeToggle');

const THEME_KEY = 'rps-pump-curve-theme';
let chartBlob = null, chartFn = 'pump-chart.jpg';

function applyTheme(dark){
  document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light');
  themeToggle.textContent = dark ? 'Light mode' : 'Dark mode';
  themeToggle.setAttribute('aria-label', dark ? 'Switch to light mode' : 'Switch to dark mode');
}

function initTheme(){
  const saved = localStorage.getItem(THEME_KEY);
  applyTheme(saved === 'dark');
}

themeToggle.addEventListener('click', () => {
  const dark = document.documentElement.getAttribute('data-theme') !== 'dark';
  applyTheme(dark);
  localStorage.setItem(THEME_KEY, dark ? 'dark' : 'light');
});

initTheme();

async function init(){
  const res = await fetch('data/families.json');
  if(!res.ok){ grid.innerHTML = '<p>Could not load data/families.json. The site must be served over http (GitHub Pages or a local server), not opened from the file system.</p>'; return; }
  const payload = await res.json();
  FAM = payload.families;
  ORDER = payload.order;
  buildHome();
}

function buildHome(){
  grid.innerHTML = '';
  ORDER.forEach(key => {
    const f = FAM[key];
    const smart = f.models.filter(m => m.data).length;
    const card = document.createElement('button');
    card.className = 'pcard';
    card.innerHTML =
      '<div class="thumb"><img src="' + f.image + '" alt=""></div>' +
      '<div class="body"><div class="name">' + f.title + '</div>' +
      '<div class="fam">' + f.fam + '</div>' +
      '<div class="blurb">' + f.blurb + '</div>' +
      '<div class="count">' + f.models.length + ' models \u00b7 ' + smart + ' with GPM readout</div></div>';
    card.addEventListener('click', () => openTool(key));
    grid.appendChild(card);
  });
}

function loadImg(key){
  return new Promise(res => {
    if(imgCache[key]) return res(imgCache[key]);
    const im = new Image();
    im.onload = () => { imgCache[key] = im; res(im); };
    im.src = FAM[key].image;
  });
}

async function openTool(key){
  curKey = key;
  cur = FAM[key];
  toolTitle.textContent = cur.title + ' Pump Curves';
  modelSel.innerHTML = '';
  cur.models.forEach(m => {
    const o = document.createElement('option');
    o.value = m.id; o.textContent = m.label;
    modelSel.appendChild(o);
  });
  // default to 1 HP if present, else 1.5 HP, else first smart, else first
  const def = cur.models.find(m => m.data && m.id.endsWith('10'))
           || cur.models.find(m => m.data && m.id.endsWith('15'))
           || cur.models.find(m => m.data)
           || cur.models[0];
  modelSel.value = def.id;
  tdhIn.max = cur.cal.tdhMax;
  tdhIn.value = cur.default;
  const im = await loadImg(key);
  cv.width = im.naturalWidth;
  cv.height = im.naturalHeight;
  home.classList.add('hidden');
  tool.classList.remove('hidden');
  window.scrollTo(0, 0);
  draw();
}

document.getElementById('back').addEventListener('click', () => {
  tool.classList.add('hidden');
  home.classList.remove('hidden');
  sizeNote.textContent = 'Download size will show here.';
});

function curModel(){ return cur.models.find(m => m.id === modelSel.value); }

// linear interpolation of GPM at a TDH from a [tdh, gpm] table (tdh ascending)
function interpGPM(data, tdh){
  if(tdh <= data[0][0]) return { gpm: data[0][1], off: false };
  const last = data[data.length - 1];
  if(tdh > last[0]) return { gpm: null, off: true, maxTdh: last[0] };
  for(let i = 0; i < data.length - 1; i++){
    const [t0, g0] = data[i], [t1, g1] = data[i + 1];
    if(tdh >= t0 && tdh <= t1){
      const f = (t1 === t0) ? 0 : (tdh - t0) / (t1 - t0);
      return { gpm: g0 + (g1 - g0) * f, off: false };
    }
  }
  return { gpm: last[1], off: false };
}

function draw(){
  if(!cur) return;
  const im = imgCache[curKey];
  if(!im) return;
  const c = cur.cal, W = cv.width, H = cv.height;
  const X = g => (c.xLf + (c.xRf - c.xLf) * g / c.gpmMax) * W;
  const Y = t => (c.yBf + (c.yTf - c.yBf) * t / c.tdhMax) * H;
  const xL = c.xLf * W, xR = c.xRf * W;

  ctx.clearRect(0, 0, W, H);
  ctx.drawImage(im, 0, 0);

  let tdh = parseFloat(tdhIn.value);
  if(isNaN(tdh)){ readout.innerHTML = 'Enter a TDH value.'; return; }
  tdh = Math.max(0, Math.min(c.tdhMax, tdh));
  const y = Y(tdh);

  // horizontal TDH line + tag
  ctx.save();
  ctx.strokeStyle = 'rgba(20,40,55,.85)';
  ctx.lineWidth = 3; ctx.setLineDash([10, 6]);
  ctx.beginPath(); ctx.moveTo(xL, y); ctx.lineTo(xR, y); ctx.stroke();
  ctx.setLineDash([]);
  ctx.font = 'bold 22px Arial'; ctx.textBaseline = 'middle';
  const tag = tdh + ' ft TDH', tw = ctx.measureText(tag).width;
  ctx.fillStyle = 'rgba(255,255,255,.9)'; ctx.fillRect(xL + 6, y - 15, tw + 12, 30);
  ctx.fillStyle = '#14283a'; ctx.fillText(tag, xL + 12, y);
  ctx.restore();

  const m = curModel(), smart = !!m.data;

  if(smart){
    const r = interpGPM(m.data, tdh);
    if(r.off){
      pill.textContent = 'OFF CURVE';
      pill.className = 'pill basic';
      readout.innerHTML = '<b>' + m.label + '</b> at <b>' + tdh + ' ft</b>: ' +
        '<span class="gpm warn">off the curve</span>. Past its practical range above ' +
        r.maxTdh + ' ft TDH. Size up to a higher head code.';
    } else {
      const gpm = Math.round(r.gpm * 10) / 10, x = X(r.gpm);
      pill.textContent = '~' + gpm + ' GPM';
      pill.className = 'pill smart';
      ctx.save();
      ctx.beginPath(); ctx.arc(x, y, 13, 0, Math.PI * 2);
      ctx.fillStyle = m.color; ctx.fill();
      ctx.lineWidth = 4; ctx.strokeStyle = '#14283a'; ctx.stroke();
      ctx.font = 'bold 26px Arial';
      const lbl = '~' + gpm + ' GPM', lw = ctx.measureText(lbl).width;
      let bx = x + 20, by = y - 44;
      if(bx + lw + 18 > xR) bx = x - lw - 38;
      if(by < c.yTf * H) by = y + 16;
      ctx.fillStyle = '#14283a'; ctx.fillRect(bx, by, lw + 18, 38);
      ctx.fillStyle = '#fff'; ctx.textBaseline = 'middle';
      ctx.fillText(lbl, bx + 9, by + 19);
      ctx.restore();
      readout.innerHTML = '<b>' + m.label + '</b> at <b>' + tdh + ' ft TDH</b> gives about ' +
        '<span class="gpm good">' + gpm + ' GPM</span>.';
    }
  } else {
    pill.textContent = 'LINE ONLY';
    pill.className = 'pill basic';
    readout.innerHTML = '<b>' + m.label + '</b>: line drawn at <b>' + tdh + ' ft</b>. ' +
      'Read where it crosses the ' + m.id + ' curve.';
  }
  cacheChartBlob();
}

function chartFilename(){
  return modelSel.value + '_TDH' + (parseInt(tdhIn.value, 10) || 0) + '.jpg';
}

function cacheChartBlob(){
  if(!cur) return;
  chartFn = chartFilename();
  toBlob(0.88).then(b => { if(b) chartBlob = b; });
}

modelSel.addEventListener('change', draw);
tdhIn.addEventListener('input', draw);

cv.addEventListener('dragstart', e => {
  if(!chartBlob){
    e.preventDefault();
    sizeNote.textContent = 'Chart is still rendering. Try again in a moment.';
    return;
  }
  const file = new File([chartBlob], chartFn, { type: 'image/jpeg' });
  e.dataTransfer.clearData();
  if(e.dataTransfer.items){
    e.dataTransfer.items.add(file);
  } else {
    e.dataTransfer.setData('application/octet-stream', chartFn);
  }
  e.dataTransfer.effectAllowed = 'copy';
  e.dataTransfer.setDragImage(cv, Math.min(cv.width, cv.clientWidth) / 2, Math.min(cv.height, cv.clientHeight) / 2);
  sizeNote.textContent = 'Dragging ' + chartFn + ' into your chat.';
});

// download with auto compression under a byte target
function toBlob(q){ return new Promise(r => cv.toBlob(r, 'image/jpeg', q)); }
async function build(maxBytes){
  draw();
  let q = 0.92, b = await toBlob(q);
  while(b && b.size > maxBytes && q > 0.32){
    q = Math.round((q - 0.07) * 100) / 100;
    b = await toBlob(q);
  }
  return { b, q };
}
document.getElementById('dl').addEventListener('click', async () => {
  const { b, q } = await build(500 * 1024);
  if(!b){ sizeNote.textContent = 'Could not generate image in this preview.'; return; }
  chartBlob = b;
  chartFn = chartFilename();
  const kb = Math.round(b.size / 1024);
  const fn = chartFn;
  const url = URL.createObjectURL(b), a = document.createElement('a');
  a.href = url; a.download = fn; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
  sizeNote.textContent = 'Saved ' + fn + ' at ' + kb + ' KB (quality ' + q + '). Target was under 500 KB.';
});

init();
