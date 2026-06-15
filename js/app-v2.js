// TDH Cards 2.0: Chart.js pump curves (no PDF/chart PNG overlay).

(function(){
  let FAM = {}, ORDER = [];
  let famKey = null, fam = null;
  let chart = null;
  let built = false;
  let wired = false;
  let exportCaption = { prefix: '', value: '', suffix: '', valueColor: '#1f9d4d' };

  const root = document.getElementById('v2Root');
  let annoRegistered = false;

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

  function curvePoints(m){
    return m.data.map(([tdh, gpm]) => ({ x: gpm, y: tdh }));
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
    const datasets = [];
    fam.models.forEach(m => {
      if(!m.data) return;
      const selected = m.id === selectedId;
      datasets.push({
        label: m.label,
        data: curvePoints(m),
        borderColor: selected ? m.color : m.color + '88',
        backgroundColor: m.color,
        borderWidth: selected ? 3 : 1.5,
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
        pointBorderColor: '#14283a',
        pointBorderWidth: 3,
        showLine: false,
        order: -1
      });
    }
    return datasets;
  }

  function annotationConfig(tdh){
    return {
      tdhLine: {
        type: 'line',
        yMin: tdh,
        yMax: tdh,
        borderColor: 'rgba(20,40,55,.85)',
        borderWidth: 3,
        borderDash: [10, 6],
        label: {
          display: true,
          content: tdh + ' ft TDH',
          position: 'start',
          backgroundColor: 'rgba(255,255,255,.92)',
          color: '#14283a',
          font: { weight: 'bold', size: 13 },
          padding: 6
        }
      }
    };
  }

  function chartOptions(tdh){
    const cal = fam.cal;
    return {
      responsive: true,
      maintainAspectRatio: true,
      aspectRatio: 1275 / 1650,
      animation: { duration: 180 },
      plugins: {
        legend: {
          display: true,
          position: 'bottom',
          labels: {
            boxWidth: 28,
            padding: 10,
            font: { size: 11 },
            filter: item => item.text !== 'Operating point'
          }
        },
        title: {
          display: true,
          text: fam.title + ' Pump Curves',
          color: '#16344a',
          font: { size: 16, weight: 'bold' },
          padding: { bottom: 12 }
        },
        annotation: {
          annotations: annotationConfig(tdh)
        },
        tooltip: {
          callbacks: {
            label(ctx){
              if(ctx.dataset.label === 'Operating point'){
                return '~' + Math.round(ctx.parsed.x * 10) / 10 + ' GPM at ' + tdh + ' ft TDH';
              }
              return ctx.dataset.label + ': ' + ctx.parsed.y + ' ft @ ' + ctx.parsed.x + ' GPM';
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
            text: 'Flow Rate (GPM)',
            color: '#16344a',
            font: { weight: '600', size: 13 }
          },
          grid: { color: 'rgba(20,52,74,.12)' },
          ticks: { color: '#5d6b78' }
        },
        y: {
          type: 'linear',
          min: 0,
          max: cal.tdhMax,
          title: {
            display: true,
            text: 'Dynamic Head (Feet)',
            color: '#16344a',
            font: { weight: '600', size: 13 }
          },
          grid: { color: 'rgba(20,52,74,.12)' },
          ticks: { color: '#5d6b78' }
        }
      }
    };
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
    let mark = null;
    if(m.data){
      const r = interpGPM(m.data, tdh);
      if(!r.off) mark = { gpm: Math.round(r.gpm * 10) / 10, color: m.color };
    }
    chart = new Chart(canvas, {
      type: 'line',
      data: { datasets: buildDatasets(m.id, tdh, mark) },
      options: chartOptions(tdh)
    });
  }

  function refreshChart(){
    if(!chart) return;
    const tdh = getTdh();
    if(tdh == null) return;
    const m = curModel();
    let mark = null;
    if(m.data){
      const r = interpGPM(m.data, tdh);
      if(!r.off) mark = { gpm: Math.round(r.gpm * 10) / 10, color: m.color };
    }
    chart.data.datasets = buildDatasets(m.id, tdh, mark);
    chart.options.plugins.annotation.annotations = annotationConfig(tdh);
    chart.options.plugins.title.text = fam.title + ' Pump Curves';
    chart.options.scales.x.max = fam.cal.gpmMax;
    chart.options.scales.y.max = fam.cal.tdhMax;
    chart.update();
  }

  function updateReadout(){
    const out = document.getElementById('v2Readout');
    const tdh = getTdh();
    if(tdh == null){
      out.innerHTML = 'Enter a TDH value.';
      exportCaption = { prefix: 'Enter a TDH value.', value: '', suffix: '', valueColor: '#1f9d4d' };
      return;
    }
    const m = curModel();
    if(!m.data){
      out.innerHTML = '<b>' + m.label + '</b>: no curve data for this model.';
      exportCaption = {
        prefix: m.label + ': no curve data.',
        value: '', suffix: '', valueColor: '#1f9d4d'
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
      valueColor: '#1f9d4d'
    };
  }

  function render(){
    updateReadout();
    if(chart) refreshChart();
    else createChart();
  }

  function setFamily(key){
    famKey = key;
    fam = FAM[key];
    fillModels();
    const tdhIn = document.getElementById('v2Tdh');
    tdhIn.max = fam.cal.tdhMax;
    tdhIn.value = fam.default;
    createChart();
    updateReadout();
  }

  function buildExportCanvas(){
    if(!chart) return null;
    chart.update('none');
    const src = chart.canvas;
    const W = src.width, H = src.height;
    const bandH = Math.max(64, Math.round(H * 0.058));
    const pad = Math.max(14, Math.round(W * 0.016));
    const out = document.createElement('canvas');
    out.width = W;
    out.height = H + bandH;
    const o = out.getContext('2d');

    o.fillStyle = '#f3f8fc';
    o.fillRect(0, 0, W, bandH);
    o.strokeStyle = '#dcebf6';
    o.lineWidth = Math.max(2, Math.round(W / 640));
    o.strokeRect(o.lineWidth / 2, o.lineWidth / 2, W - o.lineWidth, bandH - o.lineWidth);

    let fontSize = Math.max(18, Math.round(W * 0.022));
    o.textBaseline = 'middle';
    const full = exportCaption.prefix + exportCaption.value + exportCaption.suffix;
    o.font = '600 ' + fontSize + 'px Arial, sans-serif';
    while(fontSize > 14 && o.measureText(full).width > W - pad * 2) fontSize -= 1;

    let x = pad, y = bandH / 2;
    o.font = '600 ' + fontSize + 'px Arial, sans-serif';
    o.fillStyle = '#16344a';
    o.fillText(exportCaption.prefix, x, y);
    x += o.measureText(exportCaption.prefix).width;
    if(exportCaption.value){
      o.font = '700 ' + Math.round(fontSize * 1.12) + 'px Arial, sans-serif';
      o.fillStyle = exportCaption.valueColor;
      o.fillText(exportCaption.value, x, y);
      x += o.measureText(exportCaption.value).width;
      o.font = '600 ' + fontSize + 'px Arial, sans-serif';
      o.fillStyle = '#16344a';
    }
    if(exportCaption.suffix) o.fillText(exportCaption.suffix, x, y);

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
    document.getElementById('v2Model').addEventListener('change', render);
    document.getElementById('v2Tdh').addEventListener('input', render);

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
      render();
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
      render();
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
