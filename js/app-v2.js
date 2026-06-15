// TDH Cards 2.0: Chart.js pump curves (no PDF/chart PNG overlay).

(function(){
  let FAM = {}, ORDER = [];
  let famKey = null, fam = null;
  let chart = null;
  let built = false;
  let wired = false;
  let exportCaption = { prefix: '', value: '', suffix: '', valueColor: '#1a7a42' };

  const BRAND = {
    navy: '#08366B',
    sky: '#B2DFF1',
    gold: '#C59A4A',
    brown: '#8F7262',
    good: '#1a7a42',
    exportBg: '#f3fafe',
    exportLine: '#c5dce8',
    headFont: '900 18px Montserrat, "Arial Black", Arial, sans-serif',
    bodyFont: '600 13px Montserrat, Arial, sans-serif'
  };

  const root = document.getElementById('v2Root');
  let annoRegistered = false;

  const whiteBgPlugin = {
    id: 'v2WhiteBg',
    beforeDraw(chart){
      const { ctx, width, height } = chart;
      ctx.save();
      ctx.globalCompositeOperation = 'destination-over';
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, width, height);
      ctx.restore();
    }
  };

  function registerChartPlugins(){
    if(annoRegistered || typeof Chart === 'undefined') return;
    const anno = window.ChartAnnotation || window['chartjs-plugin-annotation'];
    if(anno) Chart.register(anno);
    annoRegistered = true;
  }

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

  function curModel(){
    return fam.models.find(m => m.id === document.getElementById('v2Model').value);
  }

  function getTdh(){
    const tdhIn = document.getElementById('v2Tdh');
    let tdh = parseFloat(tdhIn.value);
    if(isNaN(tdh)) return null;
    tdh = Math.max(0, Math.min(fam.cal.tdhMax, tdh));
    tdhIn.value = tdh;
    return tdh;
  }

  function plotAspect(cal){
    const w = cal.xRf - cal.xLf;
    const h = cal.yBf - cal.yTf;
    return w / h;
  }

  function chartTitle(){
    const gpmTag = fam.fam.match(/[\d.]+\s*GPM/i);
    const suffix = gpmTag ? gpmTag[0] : fam.fam;
    return fam.title + ' Pump Curves, ' + suffix;
  }

  function optimalBand(cal){
    const max = cal.gpmMax;
    return {
      xMin: Math.max(0.5, max * 0.08 + 0.5),
      xMax: max - Math.max(1, max * 0.05)
    };
  }

  function gpmTickStep(max){
    if(max <= 20) return 1;
    if(max <= 125) return 5;
    if(max <= 400) return 20;
    if(max <= 700) return 50;
    return 100;
  }

  function tdhTickStep(max){
    if(max <= 200) return 50;
    if(max <= 600) return 100;
    return 200;
  }

  function curveLabel(m){
    const match = m.label.match(/^(\S+)\s+\((.+)\)$/);
    if(!match) return m.id;
    return match[2].replace(/\s+/g, '') + ', ' + match[1];
  }

  // Build chart polyline from [TDH, GPM] table: one point per GPM, stop where data ends.
  function extendCurveForChart(data){
    const byGpm = new Map();
    data.forEach(([tdh, gpm]) => {
      if(gpm <= 0 || tdh < 0) return;
      const key = Math.round(gpm * 100) / 100;
      const prev = byGpm.get(key);
      // Same GPM at several TDH values: keep lowest TDH (rightmost point on the curve).
      if(prev == null || tdh < prev) byGpm.set(key, tdh);
    });
    const pts = Array.from(byGpm.entries())
      .map(([gpm, tdh]) => ({ x: gpm, y: tdh }))
      .sort((a, b) => a.x - b.x);

    if(pts.length >= 2 && pts[0].x > 0){
      const p0 = pts[0], p1 = pts[1];
      const slope = (p1.y - p0.y) / (p1.x - p0.x);
      pts.unshift({ x: 0, y: Math.max(0, p0.y + slope * (0 - p0.x)) });
    }
    return pts;
  }

  function shutoffHead(data){
    const pts = extendCurveForChart(data);
    return pts[0].y;
  }

  function curvePoints(m){
    return extendCurveForChart(m.data);
  }

  function buildShell(){
    root.innerHTML =
      '<div class="controls v2-controls">' +
        '<div class="fld"><label for="v2Family">Pump family</label><select id="v2Family"></select></div>' +
        '<div class="fld"><label for="v2Model">Pump model</label><select id="v2Model"></select></div>' +
        '<div class="fld"><label for="v2Tdh">TDH (feet)</label><input id="v2Tdh" type="number" min="0" step="1"></div>' +
        '<button class="btn secondary" id="v2Copy" type="button">Copy chart</button>' +
        '<button class="btn" id="v2Dl" type="button">Download chart</button>' +
      '</div>' +
      '<div class="readout v2-readout" id="v2Readout">Pick a family and enter TDH.</div>' +
      '<div class="v2-chart-shell"><div class="v2-chart-wrap"><canvas id="v2Chart"></canvas></div></div>' +
      '<div class="foot"><span class="size-note" id="v2SizeNote">Copy or download size will show here.</span></div>' +
      '<p class="hint v2-hint">Rendered with Chart.js from curve data in families.json. No PDF chart images.</p>';
    built = true;
  }

  function fillFamilies(){
    const sel = document.getElementById('v2Family');
    sel.innerHTML = '';
    ORDER.forEach(key => {
      const o = document.createElement('option');
      o.value = key;
      o.textContent = FAM[key].title + ' (' + FAM[key].fam + ')';
      sel.appendChild(o);
    });
  }

  function fillModels(){
    const sel = document.getElementById('v2Model');
    sel.innerHTML = '';
    fam.models.forEach(m => {
      const o = document.createElement('option');
      o.value = m.id;
      o.textContent = m.label;
      sel.appendChild(o);
    });
    const def = fam.models.find(m => m.data && m.id.endsWith('10'))
             || fam.models.find(m => m.data && m.id.endsWith('15'))
             || fam.models.find(m => m.data)
             || fam.models[0];
    sel.value = def.id;
  }

  function destroyChart(){
    if(chart){
      chart.destroy();
      chart = null;
    }
  }

  function buildDatasets(selectedId, tdh, mark){
    const gpmMax = fam.cal.gpmMax;
    const models = fam.models.filter(m => m.data).slice().sort((a, b) =>
      shutoffHead(a.data) - shutoffHead(b.data)
    );
    const datasets = [];
    models.forEach(m => {
      const selected = m.id === selectedId;
      datasets.push({
        label: m.id,
        data: curvePoints(m),
        borderColor: m.color,
        backgroundColor: m.color,
        borderWidth: selected ? 3 : 2,
        pointRadius: 0,
        pointHoverRadius: 4,
        tension: 0,
        fill: false,
        order: selected ? 0 : 1
      });
    });
    if(mark && mark.gpm != null){
      datasets.push({
        label: 'Operating point',
        data: [{ x: mark.gpm, y: tdh }],
        borderColor: mark.color,
        backgroundColor: mark.color,
        pointRadius: 9,
        pointHoverRadius: 9,
        pointBorderColor: BRAND.navy,
        pointBorderWidth: 3,
        showLine: false,
        order: -1
      });
    }
    return datasets;
  }

  function tdhBand(cal){
    return cal.tdhMax * 0.065;
  }

  function tdhLabelAdjust(tdh, cal, entries){
    const band = tdhBand(cal);
    const conflict = entries.some(e => Math.abs(e.head - tdh) < band);
    return conflict ? -30 : -18;
  }

  function computeLabelAdjustments(entries, tdh, cal, mark){
    const band = tdhBand(cal);
    const minGap = cal.tdhMax * 0.048;
    const markNearLeft = mark && mark.gpm != null && mark.gpm <= cal.gpmMax * 0.22;
    const adj = entries.map(e => ({ id: e.m.id, head: e.head, yAdj: 0, xAdj: 8 }));

    adj.forEach(a => {
      const d = Math.abs(a.head - tdh);
      if(d >= band) return;
      let push = Math.round(24 + (1 - d / band) * 20);
      if(markNearLeft && d < band * 1.2){
        push += 12;
        a.xAdj = 22;
      }
      a.yAdj = a.head >= tdh ? -push : push;
    });

    const sorted = adj.slice().sort((a, b) => b.head - a.head);
    for(let i = 1; i < sorted.length; i++){
      const prev = sorted[i - 1], cur = sorted[i];
      const headGap = Math.abs(cur.head - prev.head);
      const effGap = headGap + (Math.abs(cur.yAdj - prev.yAdj) * cal.tdhMax / 520);
      if(effGap < minGap){
        const bump = 18;
        cur.yAdj += cur.head <= prev.head ? bump : -bump;
      }
    }
    return adj;
  }

  function curveLabelAnnotation(m, cal, yAdjust, xAdjust){
    const head = shutoffHead(m.data);
    return {
      type: 'label',
      xValue: 0,
      yValue: head,
      content: curveLabel(m),
      color: m.color,
      backgroundColor: 'rgba(255,255,255,0.96)',
      borderColor: m.color,
      borderWidth: 1.5,
      borderRadius: 4,
      padding: 6,
      font: { size: 12, weight: 'bold', family: 'Montserrat, Arial, sans-serif' },
      textAlign: 'left',
      position: { x: 'start', y: 'center' },
      xAdjust: xAdjust != null ? xAdjust : 8,
      yAdjust: yAdjust || 0,
      drawTime: 'afterDatasetsDraw'
    };
  }

  function curveLabelAnnotations(cal, tdh, mark){
    const entries = fam.models.filter(m => m.data).map(m => ({
      m,
      head: shutoffHead(m.data)
    })).sort((a, b) => b.head - a.head);
    const adjustments = computeLabelAdjustments(entries, tdh, cal, mark);
    const adjMap = Object.fromEntries(adjustments.map(a => [a.id, a]));
    const out = {};
    entries.forEach(entry => {
      const a = adjMap[entry.m.id] || { yAdj: 0, xAdj: 8 };
      out['lbl_' + entry.m.id] = curveLabelAnnotation(entry.m, cal, a.yAdj, a.xAdj);
    });
    return out;
  }

  function annotationConfig(tdh, mark){
    const cal = fam.cal;
    const band = optimalBand(cal);
    const entries = fam.models.filter(m => m.data).map(m => ({
      m,
      head: shutoffHead(m.data)
    }));
    const annotations = {
      optimalBand: {
        type: 'box',
        xMin: band.xMin,
        xMax: band.xMax,
        yMin: 0,
        yMax: cal.tdhMax,
        backgroundColor: 'rgba(178, 223, 241, 0.42)',
        borderWidth: 0,
        drawTime: 'beforeDatasetsDraw'
      },
      optimalLabel: {
        type: 'label',
        xValue: band.xMax - 0.3,
        yValue: cal.tdhMax * 0.045,
        content: 'OPTIMAL RANGE FOR ' + fam.title + ' SERIES',
        color: BRAND.navy,
        backgroundColor: 'rgba(255,255,255,0.88)',
        borderRadius: 3,
        padding: 5,
        font: { size: 12, weight: 'bold', family: 'Montserrat, Arial, sans-serif' },
        textAlign: 'right',
        position: { x: 'end', y: 'end' },
        drawTime: 'afterDatasetsDraw'
      },
      tdhLine: {
        type: 'line',
        yMin: tdh,
        yMax: tdh,
        borderColor: 'rgba(8,54,107,.85)',
        borderWidth: 3,
        borderDash: [10, 6],
        drawTime: 'afterDatasetsDraw'
      },
      tdhLabel: {
        type: 'label',
        xValue: 0,
        yValue: tdh,
        content: tdh + ' ft TDH',
        color: BRAND.navy,
        backgroundColor: 'rgba(255,255,255,0.98)',
        borderColor: BRAND.navy,
        borderWidth: 2,
        borderRadius: 4,
        padding: 8,
        font: { weight: 'bold', size: 14, family: 'Montserrat, Arial, sans-serif' },
        textAlign: 'left',
        position: { x: 'start', y: 'center' },
        xAdjust: 8,
        yAdjust: tdhLabelAdjust(tdh, cal, entries),
        drawTime: 'afterDraw'
      }
    };

    Object.assign(annotations, curveLabelAnnotations(cal, tdh, mark));
    return annotations;
  }

  function chartOptions(tdh){
    const cal = fam.cal;
    const m = curModel();
    const mark = markFromTdh(m, tdh);
    const xStep = gpmTickStep(cal.gpmMax);
    const yStep = tdhTickStep(cal.tdhMax);
    return {
      responsive: true,
      maintainAspectRatio: true,
      aspectRatio: plotAspect(cal),
      backgroundColor: '#ffffff',
      animation: false,
      animations: { colors: false, x: false, y: false },
      transitions: {
        active: { animation: { duration: 0 } },
        resize: { animation: { duration: 0 } },
        show: { animation: { duration: 0 } },
        hide: { animation: { duration: 0 } }
      },
      layout: { padding: { top: 12, right: 84, bottom: 10, left: 10 } },
      plugins: {
        legend: {
          display: true,
          position: 'right',
          align: 'start',
          labels: {
            boxWidth: 28,
            boxHeight: 4,
            padding: 10,
            font: { size: 13, weight: '600', family: 'Montserrat, Arial, sans-serif' },
            color: BRAND.navy,
            filter: item => item.text !== 'Operating point'
          }
        },
        title: {
          display: true,
          text: chartTitle(),
          color: BRAND.navy,
          font: { size: 22, weight: '900', family: 'Montserrat, "Arial Black", Arial, sans-serif' },
          padding: { bottom: 16 },
          align: 'start'
        },
        annotation: {
          annotations: annotationConfig(tdh, mark)
        },
        tooltip: {
          callbacks: {
            title(items){
              return items[0].dataset.label === 'Operating point' ? 'Operating point' : items[0].dataset.label;
            },
            label(ctx){
              if(ctx.dataset.label === 'Operating point'){
                return '~' + Math.round(ctx.parsed.x * 10) / 10 + ' GPM at ' + tdh + ' ft TDH';
              }
              return ctx.parsed.y + ' ft @ ' + ctx.parsed.x + ' GPM';
            }
          }
        }
      },
      scales: {
        x: {
          type: 'linear',
          min: 0,
          max: cal.gpmMax,
          title: {
            display: true,
            text: 'Gallons Per Minute (GPM)',
            color: BRAND.navy,
            font: { weight: '700', size: 16, family: 'Montserrat, Arial, sans-serif' },
            padding: { top: 8 }
          },
          grid: { color: 'rgba(8,54,107,.12)' },
          ticks: {
            color: BRAND.navy,
            font: { size: 13, weight: '600', family: 'Montserrat, Arial, sans-serif' },
            stepSize: xStep,
            maxTicksLimit: Math.ceil(cal.gpmMax / xStep) + 2
          }
        },
        y: {
          type: 'linear',
          min: 0,
          max: cal.tdhMax,
          title: {
            display: true,
            text: 'Total Dynamic Head (Feet)',
            color: BRAND.navy,
            font: { weight: '700', size: 16, family: 'Montserrat, Arial, sans-serif' },
            padding: { bottom: 8 }
          },
          grid: { color: 'rgba(8,54,107,.12)' },
          ticks: {
            color: BRAND.navy,
            font: { size: 13, weight: '600', family: 'Montserrat, Arial, sans-serif' },
            stepSize: yStep,
            maxTicksLimit: Math.ceil(cal.tdhMax / yStep) + 2
          }
        }
      }
    };
  }

  function markFromTdh(m, tdh){
    if(!m || !m.data) return null;
    const r = interpGPM(m.data, tdh);
    if(r.off) return null;
    return { gpm: Math.round(r.gpm * 10) / 10, color: m.color };
  }

  function applyChartOptions(tdh){
    const opts = chartOptions(tdh);
    chart.options.aspectRatio = opts.aspectRatio;
    chart.options.backgroundColor = opts.backgroundColor;
    chart.options.layout = opts.layout;
    chart.options.plugins = opts.plugins;
    chart.options.scales = opts.scales;
  }

  function syncMarkDataset(m, tdh){
    let markDs = chart.data.datasets.find(d => d.label === 'Operating point');
    const mark = markFromTdh(m, tdh);
    if(!mark){
      if(markDs) markDs.data = [];
      return;
    }
    if(!markDs){
      chart.data.datasets.push({
        label: 'Operating point',
        data: [{ x: mark.gpm, y: tdh }],
        borderColor: mark.color,
        backgroundColor: mark.color,
        pointRadius: 9,
        pointHoverRadius: 9,
        pointBorderColor: BRAND.navy,
        pointBorderWidth: 3,
        showLine: false,
        order: -1
      });
      return;
    }
    markDs.data = [{ x: mark.gpm, y: tdh }];
    markDs.borderColor = mark.color;
    markDs.backgroundColor = mark.color;
  }

  function syncAnnotations(tdh, mark){
    const cal = fam.cal;
    const ann = chart.options.plugins.annotation.annotations;
    const entries = fam.models.filter(m => m.data).map(m => ({
      m,
      head: shutoffHead(m.data)
    }));

    ann.tdhLine.yMin = tdh;
    ann.tdhLine.yMax = tdh;

    ann.tdhLabel.yValue = tdh;
    ann.tdhLabel.content = tdh + ' ft TDH';
    ann.tdhLabel.yAdjust = tdhLabelAdjust(tdh, cal, entries);

    const adjustments = computeLabelAdjustments(entries, tdh, cal, mark);
    adjustments.forEach(a => {
      const lbl = ann['lbl_' + a.id];
      if(lbl){
        lbl.yAdjust = a.yAdj;
        lbl.xAdjust = a.xAdj;
      }
    });
  }

  function chartDraw(){
    chart.update('none');
  }

  function createChart(){
    registerChartPlugins();
    if(typeof Chart === 'undefined'){
      document.getElementById('v2Readout').textContent =
        'Chart.js did not load. Check your internet connection and refresh.';
      return;
    }
    destroyChart();
    const tdh = getTdh();
    if(tdh == null) return;
    const m = curModel();
    const canvas = document.getElementById('v2Chart');
    const mark = markFromTdh(m, tdh);
    chart = new Chart(canvas, {
      type: 'line',
      plugins: [whiteBgPlugin],
      data: { datasets: buildDatasets(m.id, tdh, mark) },
      options: chartOptions(tdh)
    });
  }

  function rebuildChart(){
    if(!chart) return createChart();
    const tdh = getTdh();
    if(tdh == null) return;
    const m = curModel();
    chart.data.datasets = buildDatasets(m.id, tdh, markFromTdh(m, tdh));
    applyChartOptions(tdh);
    chartDraw();
  }

  function refreshTdh(){
    if(!chart) return;
    const tdh = getTdh();
    if(tdh == null) return;
    updateReadout();
    const m = curModel();
    const mark = markFromTdh(m, tdh);
    syncAnnotations(tdh, mark);
    syncMarkDataset(m, tdh);
    chartDraw();
  }

  function refreshModel(){
    if(!chart) return;
    const selectedId = curModel().id;
    chart.data.datasets.forEach(ds => {
      if(ds.label !== 'Operating point') ds.borderWidth = ds.label === selectedId ? 3 : 2;
    });
    refreshTdh();
  }

  function updateReadout(){
    const out = document.getElementById('v2Readout');
    const tdh = getTdh();
    if(tdh == null){
      out.innerHTML = 'Enter a TDH value.';
      exportCaption = { prefix: 'Enter a TDH value.', value: '', suffix: '', valueColor: BRAND.good };
      return;
    }
    const m = curModel();
    if(!m.data){
      out.innerHTML = '<b>' + m.label + '</b>: no curve data for this model.';
      exportCaption = {
        prefix: m.label + ': no curve data.',
        value: '', suffix: '', valueColor: BRAND.good
      };
      return;
    }
    const r = interpGPM(m.data, tdh);
    if(r.off){
      out.innerHTML = '<b>' + m.label + '</b> at <b>' + tdh + ' ft</b>: ' +
        '<span class="gpm warn">off the curve</span>. Past its practical range above ' +
        r.maxTdh + ' ft TDH. Size up to a higher head code.';
      exportCaption = {
        prefix: m.label + ' at ' + tdh + ' ft: ',
        value: 'off the curve',
        suffix: '. Past its practical range above ' + r.maxTdh + ' ft TDH. Size up to a higher head code.',
        valueColor: '#c0392b'
      };
      return;
    }
    const gpm = Math.round(r.gpm * 10) / 10;
    out.innerHTML = '<b>' + m.label + '</b> at <b>' + tdh + ' ft TDH</b> gives about ' +
      '<span class="gpm good">' + gpm + ' GPM</span>.';
    exportCaption = {
      prefix: m.label + ' at ' + tdh + ' ft TDH gives about ',
      value: gpm + ' GPM',
      suffix: '.',
      valueColor: BRAND.good
    };
  }

  function setFamily(key){
    famKey = key;
    fam = FAM[key];
    fillModels();
    const tdhIn = document.getElementById('v2Tdh');
    tdhIn.max = fam.cal.tdhMax;
    tdhIn.value = fam.default;
    updateReadout();
    rebuildChart();
  }

  function buildExportCanvas(){
    if(!chart) return null;
    chart.options.backgroundColor = '#ffffff';
    chart.update('none');
    const src = chart.canvas;
    const W = src.width, H = src.height;
    const bandH = Math.max(64, Math.round(H * 0.058));
    const pad = Math.max(14, Math.round(W * 0.016));
    const out = document.createElement('canvas');
    out.width = W;
    out.height = H + bandH;
    const o = out.getContext('2d');

    o.fillStyle = '#ffffff';
    o.fillRect(0, 0, W, out.height);

    o.fillStyle = BRAND.exportBg;
    o.fillRect(0, 0, W, bandH);
    o.strokeStyle = BRAND.exportLine;
    o.lineWidth = Math.max(2, Math.round(W / 640));
    o.strokeRect(o.lineWidth / 2, o.lineWidth / 2, W - o.lineWidth, bandH - o.lineWidth);

    let fontSize = Math.max(18, Math.round(W * 0.022));
    o.textBaseline = 'middle';
    const full = exportCaption.prefix + exportCaption.value + exportCaption.suffix;
    o.font = '600 ' + fontSize + 'px Arial, sans-serif';
    while(fontSize > 14 && o.measureText(full).width > W - pad * 2) fontSize -= 1;

    let x = pad, y = bandH / 2;
    o.font = '600 ' + fontSize + 'px Montserrat, Arial, sans-serif';
    o.fillStyle = BRAND.navy;
    o.fillText(exportCaption.prefix, x, y);
    x += o.measureText(exportCaption.prefix).width;
    if(exportCaption.value){
      o.font = '700 ' + Math.round(fontSize * 1.12) + 'px Montserrat, Arial, sans-serif';
      o.fillStyle = exportCaption.valueColor;
      o.fillText(exportCaption.value, x, y);
      x += o.measureText(exportCaption.value).width;
      o.font = '600 ' + fontSize + 'px Montserrat, Arial, sans-serif';
      o.fillStyle = BRAND.navy;
    }
    if(exportCaption.suffix) o.fillText(exportCaption.suffix, x, y);

    o.fillStyle = '#ffffff';
    o.fillRect(0, bandH, W, H);
    o.drawImage(src, 0, bandH);
    return out;
  }

  function blobFromCanvas(canvas, type, q){
    return new Promise((resolve, reject) => {
      if(type === 'image/jpeg'){
        canvas.toBlob(b => b ? resolve(b) : reject(new Error('Could not render chart.')), type, q);
      } else {
        canvas.toBlob(b => b ? resolve(b) : reject(new Error('Could not render chart.')), type);
      }
    });
  }

  function chartFilename(ext){
    const m = curModel();
    const tdh = parseInt(document.getElementById('v2Tdh').value, 10) || 0;
    return (m ? m.id : 'pump') + '_TDH' + tdh + (ext || '.jpg');
  }

  function wireEvents(){
    document.getElementById('v2Family').addEventListener('change', e => setFamily(e.target.value));
    document.getElementById('v2Model').addEventListener('change', refreshModel);
    const tdhIn = document.getElementById('v2Tdh');
    tdhIn.addEventListener('input', refreshTdh);
    tdhIn.addEventListener('change', refreshTdh);

    document.getElementById('v2Copy').addEventListener('click', () => {
      const note = document.getElementById('v2SizeNote');
      if(!navigator.clipboard || !window.ClipboardItem){
        note.textContent = 'Copy is not supported in this browser. Use Download instead.';
        return;
      }
      if(!chart){
        note.textContent = 'Chart is not ready yet.';
        return;
      }
      refreshTdh();
      const exp = buildExportCanvas();
      if(!exp){
        note.textContent = 'Could not copy chart.';
        return;
      }
      const pngPromise = blobFromCanvas(exp, 'image/png');
      navigator.clipboard.write([
        new ClipboardItem({ 'image/png': pngPromise })
      ]).then(() => {
        note.textContent = 'Copied! Click the Dialpad message box and press Ctrl+V to paste.';
      }).catch(() => {
        note.textContent = 'Copy blocked. Use Download, or allow clipboard access for this site.';
      });
    });

    document.getElementById('v2Dl').addEventListener('click', async () => {
      const note = document.getElementById('v2SizeNote');
      if(!chart){
        note.textContent = 'Chart is not ready yet.';
        return;
      }
      refreshTdh();
      const exp = buildExportCanvas();
      if(!exp){
        note.textContent = 'Could not generate image.';
        return;
      }
      let q = 0.92, b = await blobFromCanvas(exp, 'image/jpeg', q);
      while(b && b.size > 500 * 1024 && q > 0.32){
        q = Math.round((q - 0.07) * 100) / 100;
        b = await blobFromCanvas(exp, 'image/jpeg', q);
      }
      if(!b){
        note.textContent = 'Could not generate image.';
        return;
      }
      const fn = chartFilename('.jpg');
      const kb = Math.round(b.size / 1024);
      const url = URL.createObjectURL(b), a = document.createElement('a');
      a.href = url; a.download = fn; document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1500);
      note.textContent = 'Saved ' + fn + ' at ' + kb + ' KB (quality ' + q + '). Target was under 500 KB.';
    });
  }

  window.initV2 = function(data){
    FAM = data.FAM;
    ORDER = data.ORDER;
    if(!built) buildShell();
    fillFamilies();
    if(!wired){
      wireEvents();
      wired = true;
    }
    setFamily(ORDER[0]);
  };

  window.destroyV2 = function(){
    destroyChart();
  };
})();
