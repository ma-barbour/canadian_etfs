// Global Data States
let dividendData = [];
let pricesIndexed = [];
let pricesWithMa = [];

// Chart Instances
let baseChart = null;
let comparisonChart = null;
let betaChart = null; // NEW: Track the beta chart instance

// UI State Defaults for Comparison Chart
let activeEtf1 = 'XEG';
let activeEtf2 = 'XFN';
let activeYears = 1;
let showRatio = false;
let activeCorrYears = 1; 

// Core Color Palette (Reversed Viridis)
const colorMap = {
    XFN: '#fde725', // Vibrant Yellow
    XEG: '#7ad151', // Light Green
    XMA: '#22a884', // Emerald Green
    XIT: '#2a788e', // Teal Blue
    XRE: '#414487', // Dark Blue
    XUT: '#440154', // Deep Purple
    VCN: '#ef4444', // Explicit Red for broad market index
    RATIO: '#f97316' // Distinct orange for the ratio line
};

const compColors = {
    primary: '#f97316',     
    comparison: '#2563eb',  
    vcn: '#ffffff',         
    ratio: '#64748b'        
};

document.addEventListener("DOMContentLoaded", () => {
    initializeDashboard();
});

async function initializeDashboard() {
    try {
        const [divRes, idxRes, maRes] = await Promise.all([
            fetch('./data/dividend_data.json'),
            fetch('./data/prices_indexed.json'),
            fetch('./data/prices_with_ma.json')
        ]);

        dividendData = await divRes.json();
        pricesIndexed = await idxRes.json();
        pricesWithMa = await maRes.json();

        // Render Dashboard Elements
        buildTickerGrid();
        renderBaseChart();
        setupComparisonControls();
        updateAndRenderComparison();
        setupCorrelationControls();
        calculateAndRenderMatrix();
        
        // NEW: Render the Rolling Beta chart
        calculateAndRenderBeta();

    } catch (error) {
        console.error("Pipeline Sync Error: Unable to fetch local dataset components.", error);
    }
}

// -----------------------------------------------------------------------------
// COMPONENT 1: Top Metrics Grid
// -----------------------------------------------------------------------------
function buildTickerGrid() {
    const grid = document.getElementById("ticker-grid");
    grid.innerHTML = "";

    dividendData.forEach(item => {
        const card = document.createElement("div");
        card.className = "bg-slate-950 p-5 rounded-xl border border-slate-800 flex flex-col justify-center items-center text-center";
        
        card.innerHTML = `
            <span class="text-lg font-bold text-slate-300 tracking-wider">${item.symbol}</span>
            <div class="text-2xl font-extrabold tracking-tight text-cyan-400 mt-2">
                ${item.yield_pct.toFixed(2)}%
            </div>
            <span class="text-[10px] text-slate-500 font-medium tracking-wide uppercase mt-1">
                ${item.frequency}
            </span>
        `;
        grid.appendChild(card);
    });
}

// -----------------------------------------------------------------------------
// COMPONENT 2: 5-Year Base-100 Performance Graph
// -----------------------------------------------------------------------------
function renderBaseChart() {
    if (baseChart) baseChart.destroy();

    const ctx = document.getElementById('baseChart').getContext('2d');
    const dates = [...new Set(pricesIndexed.map(d => d.date))].sort();
    const symbols = [...new Set(pricesIndexed.map(d => d.symbol))];

    const datasets = symbols.map(sym => {
        const symData = pricesIndexed.filter(d => d.symbol === sym);
        const dataPoints = dates.map(dt => {
            const row = symData.find(d => d.date === dt);
            return row ? row.price_indexed : null;
        });

        return {
            label: sym,
            data: dataPoints,
            borderColor: colorMap[sym] || '#ffffff',
            backgroundColor: colorMap[sym] || '#ffffff',
            borderWidth: sym === 'VCN' ? 2.5 : 1.75, 
            pointRadius: 0, hoverRadius: 4, fill: false
        };
    });

    baseChart = new Chart(ctx, {
        type: 'line',
        data: { labels: dates, datasets: datasets },
        options: {
            layout: { padding: { right: 25 } },
            responsive: true, maintainAspectRatio: false,
            interaction: { mode: 'index', intersect: false },
            plugins: {
                legend: { 
                    labels: { color: '#94a3b8', font: { family: 'sans-serif', size: 12 }, boxWidth: 40, boxHeight: 3 } 
                },
                tooltip: { backgroundColor: '#0f172a', titleColor: '#94a3b8', bodyColor: '#f1f5f9', borderColor: '#334155', borderWidth: 1 }
            },
            scales: {
                x: { 
                    grid: { 
                        color: function(context) {
                            if (context.tick === undefined) return 'transparent';
                            const index = context.tick.value;
                            const majorColor = '#1e293b'; 
                            const minorColor = 'rgba(30, 41, 59, 0.3)'; 
                            
                            if (index === 0) return majorColor; 
                            
                            const prevDateStr = dates[index - 1];
                            const currDateStr = dates[index];
                            
                            if (prevDateStr && currDateStr) {
                                const prevMonth = prevDateStr.substring(0, 7);
                                const currMonth = currDateStr.substring(0, 7);
                                if (prevMonth !== currMonth) {
                                    const currentDate = new Date(currDateStr + "T00:00:00");
                                    const startDate = new Date(dates[0] + "T00:00:00");
                                    const monthDiff = (currentDate.getFullYear() - startDate.getFullYear()) * 12 + 
                                                      (currentDate.getMonth() - startDate.getMonth());
                                    return (monthDiff % 6 === 0) ? majorColor : minorColor; 
                                }
                            }
                            return 'transparent';
                        },
                        drawBorder: false
                    }, 
                    ticks: { 
                        color: '#64748b', autoSkip: false, maxRotation: 0, 
                        callback: function(val, index) {
                            if (index === 0) {
                                const d = new Date(dates[0] + "T00:00:00");
                                return d.toLocaleDateString('en-US', { year: 'numeric', month: 'short' });
                            }
                            const prevDateStr = dates[index - 1];
                            const currDateStr = dates[index];
                            if (!prevDateStr || !currDateStr) return ''; 
                            
                            const prevMonth = prevDateStr.substring(0, 7);
                            const currMonth = currDateStr.substring(0, 7);
                            if (prevMonth !== currMonth) {
                                const currentDate = new Date(currDateStr + "T00:00:00");
                                const startDate = new Date(dates[0] + "T00:00:00");
                                const monthDiff = (currentDate.getFullYear() - startDate.getFullYear()) * 12 + 
                                                  (currentDate.getMonth() - startDate.getMonth());
                                if (monthDiff % 6 === 0) {
                                    return currentDate.toLocaleDateString('en-US', { year: 'numeric', month: 'short' });
                                }
                            }
                            return '';
                        }
                    } 
                },
                y: { grid: { color: '#1e293b' }, ticks: { color: '#64748b' }, title: { display: true, text: "Relative Price Performance", color: '#94a3b8', font: { size: 12, weight: 'medium' } } }
            }
        }
    });
}

// -----------------------------------------------------------------------------
// COMPONENT 3: Comparative Deep Dive Chart
// -----------------------------------------------------------------------------
function setupComparisonControls() {
    const allSymbols = [...new Set(pricesWithMa.map(d => d.symbol))];
    const selectableSymbols = allSymbols.filter(sym => sym !== 'VCN').sort();

    const select1 = document.getElementById('etf1-select');
    const select2 = document.getElementById('etf2-select');

    selectableSymbols.forEach(sym => {
        select1.add(new Option(sym, sym, false, sym === activeEtf1));
        select2.add(new Option(sym, sym, false, sym === activeEtf2));
    });

    select1.addEventListener('change', (e) => { activeEtf1 = e.target.value; updateAndRenderComparison(); });
    select2.addEventListener('change', (e) => { activeEtf2 = e.target.value; updateAndRenderComparison(); });
    
    const ratioToggle = document.getElementById('toggle-ratio');
    if (ratioToggle) {
        ratioToggle.addEventListener('change', (e) => { 
            showRatio = e.target.checked; 
            updateAndRenderComparison(); 
        });
    }

    const btnContainer = document.getElementById('timeframe-buttons');
    [1, 2, 3, 4, 5].forEach(year => {
        const btn = document.createElement('button');
        btn.textContent = `${year}Y`;
        btn.className = `px-4 py-2 text-sm font-medium border ${year === 1 ? 'rounded-l-lg' : year === 5 ? 'rounded-r-lg' : ''} border-slate-700 transition-colors`;
        
        btn.addEventListener('click', () => {
            activeYears = year;
            updateTimeframeButtons('timeframe-buttons', activeYears);
            updateAndRenderComparison();
        });
        btnContainer.appendChild(btn);
    });
    updateTimeframeButtons('timeframe-buttons', activeYears);
}

function updateTimeframeButtons(containerId, activeState) {
    const btns = document.getElementById(containerId).children;
    Array.from(btns).forEach((btn, index) => {
        const year = index + 1;
        if (year === activeState) {
            btn.classList.add('bg-cyan-600', 'text-white');
            btn.classList.remove('bg-slate-900', 'text-slate-400', 'hover:bg-slate-800');
        } else {
            btn.classList.add('bg-slate-900', 'text-slate-400', 'hover:bg-slate-800');
            btn.classList.remove('bg-cyan-600', 'text-white');
        }
    });
}

function processComparisonData() {
    const allDates = [...new Set(pricesWithMa.map(d => d.date))].sort();
    const maxDateStr = allDates[allDates.length - 1];
    
    const maxDate = new Date(maxDateStr + "T00:00:00");
    const cutoffDate = new Date(maxDate);
    
    cutoffDate.setFullYear(maxDate.getFullYear() - activeYears);
    cutoffDate.setDate(1);
    
    const y = cutoffDate.getFullYear();
    const m = String(cutoffDate.getMonth() + 1).padStart(2, '0');
    const cutoffDateStr = `${y}-${m}-01`;

    const filteredData = pricesWithMa.filter(d => d.date >= cutoffDateStr);
    const dates = [...new Set(filteredData.map(d => d.date))].sort();

    function getMetrics(symbol) {
        const symData = filteredData.filter(d => d.symbol === symbol).sort((a,b) => a.date.localeCompare(b.date));
        if (symData.length === 0) return { indexedPrices: [], indexedMAs: [], rawPrices: [] };
        
        const basePrice = symData[0].price;
        
        return dates.map(dt => {
            const row = symData.find(d => d.date === dt);
            if (!row) return { indexedPrice: null, indexedMA: null, rawPrice: null };
            return {
                indexedPrice: (row.price / basePrice) * 100,
                indexedMA: (row.ma_50 !== "NA" && row.ma_50 != null) ? (row.ma_50 / basePrice) * 100 : null,
                rawPrice: row.price
            };
        });
    }

    const data1 = getMetrics(activeEtf1);
    const data2 = getMetrics(activeEtf2);
    const dataVCN = getMetrics('VCN');

    const ratios = dates.map((dt, i) => {
        const p1 = data1[i]?.rawPrice;
        const p2 = data2[i]?.rawPrice;
        return (p1 && p2) ? (p1 / p2) : null;
    });

    return {
        dates,
        series: {
            etf1: { price: data1.map(d => d.indexedPrice), ma: data1.map(d => d.indexedMA) },
            etf2: { price: data2.map(d => d.indexedPrice), ma: data2.map(d => d.indexedMA) },
            vcn: { price: dataVCN.map(d => d.indexedPrice), ma: dataVCN.map(d => d.indexedMA) },
            ratio: ratios
        }
    };
}

function updateAndRenderComparison() {
    if (comparisonChart) comparisonChart.destroy();

    const { dates, series } = processComparisonData();
    const ctx = document.getElementById('comparisonChart').getContext('2d');

    const datasets = [
        {
            label: `${activeEtf1} Price`, data: series.etf1.price,
            borderColor: compColors.primary, backgroundColor: compColors.primary,
            borderWidth: 2, yAxisID: 'y', pointRadius: 0, fill: false
        },
        {
            label: `${activeEtf1} 50D MA`, data: series.etf1.ma,
            borderColor: compColors.primary, borderWidth: 1.5, borderDash: [5, 5],
            yAxisID: 'y', pointRadius: 0, fill: false
        },
        {
            label: `${activeEtf2} Price`, data: series.etf2.price,
            borderColor: compColors.comparison, backgroundColor: compColors.comparison,
            borderWidth: 2, yAxisID: 'y', pointRadius: 0, fill: false
        },
        {
            label: `${activeEtf2} 50D MA`, data: series.etf2.ma,
            borderColor: compColors.comparison, borderWidth: 1.5, borderDash: [5, 5],
            yAxisID: 'y', pointRadius: 0, fill: false
        },
        {
            label: `VCN Price`, data: series.vcn.price,
            borderColor: compColors.vcn, backgroundColor: compColors.vcn,
            borderWidth: 1.25, yAxisID: 'y', pointRadius: 0, fill: false
        },
        {
            label: `VCN 50D MA`, data: series.vcn.ma,
            borderColor: compColors.vcn, borderWidth: 1, borderDash: [5, 5],
            yAxisID: 'y', pointRadius: 0, fill: false
        }
    ];

    if (showRatio) {
        datasets.push({
            label: `${activeEtf1} / ${activeEtf2} Ratio`, data: series.ratio,
            borderColor: compColors.ratio, backgroundColor: compColors.ratio,
            borderWidth: 1.25, yAxisID: 'y1', pointRadius: 0, fill: false
        });
    }

    comparisonChart = new Chart(ctx, {
        type: 'line',
        data: { labels: dates, datasets: datasets },
        options: {
            layout: { padding: { right: 25 } },
            responsive: true, maintainAspectRatio: false,
            interaction: { mode: 'index', intersect: false },
            plugins: {
                legend: { labels: { color: '#94a3b8', font: { family: 'sans-serif', size: 12 }, boxWidth: 35, boxHeight: 3 } },
                tooltip: {
                    backgroundColor: '#0f172a', titleColor: '#94a3b8', bodyColor: '#f1f5f9', borderColor: '#334155', borderWidth: 1,
                    callbacks: {
                        label: function(context) {
                            let label = context.dataset.label || '';
                            if (label) label += ': ';
                            if (context.parsed.y !== null) {
                                if (context.dataset.yAxisID === 'y1') {
                                    label += context.parsed.y.toFixed(4) + 'x';
                                } else {
                                    label += context.parsed.y.toFixed(2);
                                }
                            }
                            return label;
                        }
                    }
                }
            },
            scales: {
                x: {
                    grid: { 
                        color: function(context) {
                            if (context.tick === undefined) return 'transparent';
                            const index = context.tick.value;
                            const majorColor = '#1e293b'; 
                            const minorColor = 'rgba(30, 41, 59, 0.3)'; 
                            
                            if (index === 0) return majorColor; 
                            
                            const prevDateStr = dates[index - 1];
                            const currDateStr = dates[index];
                            
                            if (prevDateStr && currDateStr) {
                                const prevMonth = prevDateStr.substring(0, 7);
                                const currMonth = currDateStr.substring(0, 7);
                                
                                if (prevMonth !== currMonth) {
                                    const currentDate = new Date(currDateStr + "T00:00:00");
                                    const startDate = new Date(dates[0] + "T00:00:00");
                                    const monthDiff = (currentDate.getFullYear() - startDate.getFullYear()) * 12 + 
                                                      (currentDate.getMonth() - startDate.getMonth());
                                    const interval = activeYears <= 1 ? 1 : (activeYears <= 3 ? 3 : 6);
                                    return (monthDiff % interval === 0) ? majorColor : minorColor; 
                                }
                            }
                            return 'transparent';
                        },
                        drawBorder: false 
                    },
                    ticks: {
                        color: '#64748b', autoSkip: false, maxRotation: 0,
                        callback: function(val, index) {
                            if (index === 0) {
                                const d = new Date(dates[0] + "T00:00:00");
                                return d.toLocaleDateString('en-US', { year: '2-digit', month: 'short' });
                            }
                            
                            const prevDateStr = dates[index - 1];
                            const currDateStr = dates[index];
                            if (!prevDateStr || !currDateStr) return '';
                            
                            const prevMonth = prevDateStr.substring(0, 7);
                            const currMonth = currDateStr.substring(0, 7);
                            
                            if (prevMonth !== currMonth) {
                                const currentDate = new Date(currDateStr + "T00:00:00");
                                const startDate = new Date(dates[0] + "T00:00:00");
                                const monthDiff = (currentDate.getFullYear() - startDate.getFullYear()) * 12 + 
                                                  (currentDate.getMonth() - startDate.getMonth());
                                const interval = activeYears <= 1 ? 1 : (activeYears <= 3 ? 3 : 6);
                                
                                if (monthDiff % interval === 0) {
                                    return currentDate.toLocaleDateString('en-US', { year: '2-digit', month: 'short' });
                                }
                            }
                            return '';
                        }
                    }
                },
                y: {
                    type: 'linear', display: true, position: 'left',
                    grid: { color: '#1e293b' }, ticks: { color: '#94a3b8' },
                    title: { display: true, text: "Relative Price Performance", color: '#94a3b8', font: { size: 11 } }
                },
                y1: {
                    type: 'linear', 
                    display: showRatio, 
                    position: 'right',
                    grid: { drawOnChartArea: false }, 
                    ticks: { color: compColors.ratio },
                    title: { display: true, text: "Price Ratio", color: compColors.ratio, font: { size: 11, weight: 'bold' } }
                }
            }
        }
    });
}

// -----------------------------------------------------------------------------
// COMPONENT 4: Correlation Matrix Heatmap
// -----------------------------------------------------------------------------
function setupCorrelationControls() {
    const btnContainer = document.getElementById('corr-timeframe-buttons');
    [1, 2, 3, 4, 5].forEach(year => {
        const btn = document.createElement('button');
        btn.textContent = `${year}Y`;
        btn.className = `px-4 py-2 text-sm font-medium border ${year === 1 ? 'rounded-l-lg' : year === 5 ? 'rounded-r-lg' : ''} border-slate-700 transition-colors`;
        btn.addEventListener('click', () => {
            activeCorrYears = year;
            updateTimeframeButtons('corr-timeframe-buttons', activeCorrYears);
            calculateAndRenderMatrix();
        });
        btnContainer.appendChild(btn);
    });
    updateTimeframeButtons('corr-timeframe-buttons', activeCorrYears);
}

function getPearsonCorrelation(arr1, arr2) {
    if (arr1.length === 0 || arr1.length !== arr2.length) return null;
    let sum1 = 0, sum2 = 0, sum1Sq = 0, sum2Sq = 0, pSum = 0;
    const n = arr1.length;
    for (let i = 0; i < n; i++) {
        sum1 += arr1[i];
        sum2 += arr2[i];
        sum1Sq += Math.pow(arr1[i], 2);
        sum2Sq += Math.pow(arr2[i], 2);
        pSum += arr1[i] * arr2[i];
    }
    const num = pSum - (sum1 * sum2 / n);
    const den = Math.sqrt((sum1Sq - Math.pow(sum1, 2) / n) * (sum2Sq - Math.pow(sum2, 2) / n));
    return den === 0 ? 0 : num / den;
}

function calculateAndRenderMatrix() {
    const allDates = [...new Set(pricesWithMa.map(d => d.date))].sort();
    const maxDateStr = allDates[allDates.length - 1];
    
    const maxDate = new Date(maxDateStr + "T00:00:00");
    const cutoffDate = new Date(maxDate);
    cutoffDate.setFullYear(maxDate.getFullYear() - activeCorrYears);
    cutoffDate.setDate(1); 
    
    const y = cutoffDate.getFullYear();
    const m = String(cutoffDate.getMonth() + 1).padStart(2, '0');
    const cutoffDateStr = `${y}-${m}-01`;

    const filteredData = pricesWithMa.filter(d => d.date >= cutoffDateStr);
    
    let symbols = [...new Set(filteredData.map(d => d.symbol))];
    symbols = ['VCN', ...symbols.filter(s => s !== 'VCN').sort()];

    const returnsBySymbol = {};
    symbols.forEach(sym => {
        const symData = filteredData.filter(d => d.symbol === sym).sort((a,b) => a.date.localeCompare(b.date));
        const returns = [];
        for (let i = 1; i < symData.length; i++) {
            const prev = symData[i-1].price;
            const curr = symData[i].price;
            returns.push(prev === 0 ? 0 : (curr - prev) / prev);
        }
        returnsBySymbol[sym] = returns;
    });

    const container = document.getElementById('correlation-matrix');
    let html = `<div class="grid gap-1" style="grid-template-columns: repeat(${symbols.length + 1}, minmax(0, 1fr));">`;
    html += `<div></div>`;
    
    symbols.forEach(sym => {
        html += `<div class="text-center text-xs font-bold ${sym === 'VCN' ? 'text-red-400' : 'text-slate-400'} p-2">${sym}</div>`;
    });

    symbols.forEach(symY => {
        html += `<div class="flex items-center justify-end pr-4 text-xs font-bold ${symY === 'VCN' ? 'text-red-400' : 'text-slate-400'}">${symY}</div>`;
        
        symbols.forEach(symX => {
            const r = getPearsonCorrelation(returnsBySymbol[symY], returnsBySymbol[symX]);
            
            let bgColor = 'rgba(15, 23, 42, 1)'; 
            let textColor = 'text-slate-400';
            
            if (r !== null) {
                if (r > 0) {
                    const intensity = Math.max(0.1, r); 
                    bgColor = `rgba(6, 182, 212, ${intensity})`; 
                    textColor = r >= 0.99 ? 'text-slate-950' : 'text-slate-200'; 
                } 
                else if (r < 0) {
                    const intensity = Math.max(0.1, Math.abs(r));
                    bgColor = `rgba(244, 63, 94, ${intensity})`; 
                    textColor = 'text-slate-200';
                }
            }
            
            const displayVal = r === null ? 'N/A' : r.toFixed(2);
            html += `<div class="text-center rounded text-sm font-medium ${textColor} p-3 border border-slate-800 transition-colors" style="background-color: ${bgColor};">${displayVal}</div>`;
        });
    });

    html += `</div>`;
    container.innerHTML = html;
}

// -----------------------------------------------------------------------------
// COMPONENT 5: Rolling 200-Day Beta Chart
// -----------------------------------------------------------------------------
// -----------------------------------------------------------------------------
// COMPONENT 5: Rolling 200-Day Beta Chart
// -----------------------------------------------------------------------------
function calculateAndRenderBeta() {
    if (betaChart) betaChart.destroy();

    const allDates = [...new Set(pricesWithMa.map(d => d.date))].sort();
    const symbols = [...new Set(pricesWithMa.map(d => d.symbol))].filter(s => s !== 'VCN');

    // 1. Build a quick lookup dictionary for daily returns to handle sparse data dates
    const returnsMatrix = {};
    allDates.forEach(dt => returnsMatrix[dt] = {});

    ['VCN', ...symbols].forEach(sym => {
        const symData = pricesWithMa.filter(d => d.symbol === sym).sort((a,b) => a.date.localeCompare(b.date));
        for (let i = 1; i < symData.length; i++) {
            const prev = symData[i-1].price;
            const curr = symData[i].price;
            if (prev > 0) {
                returnsMatrix[symData[i].date][sym] = (curr - prev) / prev;
            }
        }
    });

    // 2. Iterate through dates with a rolling window of 200 trading days
    const windowSize = 200;
    const calcDates = allDates.slice(windowSize);
    const betaSeries = {};
    symbols.forEach(sym => betaSeries[sym] = []);

    for (let i = windowSize; i < allDates.length; i++) {
        const windowDates = allDates.slice(i - windowSize, i);

        const vcnReturns = [];
        const symReturns = {};
        symbols.forEach(sym => symReturns[sym] = []);

        // Extract returns aligned perfectly by date for the 200-day block
        windowDates.forEach(dt => {
            const v = returnsMatrix[dt]['VCN'];
            if (v !== undefined) {
                vcnReturns.push(v);
                symbols.forEach(sym => {
                    symReturns[sym].push(returnsMatrix[dt][sym] !== undefined ? returnsMatrix[dt][sym] : null);
                });
            } else {
                vcnReturns.push(null);
                symbols.forEach(sym => symReturns[sym].push(null));
            }
        });

        // 3. Calculate VCN Variance for the denominator
        const validVcn = vcnReturns.filter(v => v !== null);
        if (validVcn.length < 50) { 
            symbols.forEach(sym => betaSeries[sym].push(null));
            continue;
        }

        const meanVcn = validVcn.reduce((a, b) => a + b, 0) / validVcn.length;
        const varVcn = validVcn.reduce((sum, v) => sum + Math.pow(v - meanVcn, 2), 0);

        // 4. Calculate covariance for each sector and derive beta
        symbols.forEach(sym => {
            let covSum = 0;
            let validCount = 0;
            
            let sumSym = 0;
            let countPairs = 0;
            for(let j=0; j<windowSize; j++) {
                if(vcnReturns[j] !== null && symReturns[sym][j] !== null) {
                    sumSym += symReturns[sym][j];
                    countPairs++;
                }
            }
            const meanSym = countPairs > 0 ? sumSym / countPairs : 0;

            for(let j=0; j<windowSize; j++) {
                if(vcnReturns[j] !== null && symReturns[sym][j] !== null) {
                    covSum += (symReturns[sym][j] - meanSym) * (vcnReturns[j] - meanVcn);
                    validCount++;
                }
            }

            if (validCount > 50 && varVcn > 0) {
                betaSeries[sym].push(covSum / varVcn);
            } else {
                betaSeries[sym].push(null);
            }
        });
    }

    // NEW STEP: Filter the calculated arrays down to the 4-year display window
    const maxDateStr = allDates[allDates.length - 1];
    const maxDate = new Date(maxDateStr + "T00:00:00");
    const cutoffDate = new Date(maxDate);
    
    // Set to 4 years ago, anchored to the 1st of the month
    cutoffDate.setFullYear(maxDate.getFullYear() - 4);
    cutoffDate.setDate(1); 
    
    const y = cutoffDate.getFullYear();
    const m = String(cutoffDate.getMonth() + 1).padStart(2, '0');
    const displayCutoffStr = `${y}-${m}-01`;

    const displayDates = [];
    const displayBetaSeries = {};
    symbols.forEach(sym => displayBetaSeries[sym] = []);

    // Only push data to the display arrays if the date falls within the 4-year window
    for (let i = 0; i < calcDates.length; i++) {
        if (calcDates[i] >= displayCutoffStr) {
            displayDates.push(calcDates[i]);
            symbols.forEach(sym => {
                displayBetaSeries[sym].push(betaSeries[sym][i]);
            });
        }
    }

    // 5. Construct datasets and map to Chart.js
    const datasets = symbols.map(sym => ({
        label: sym,
        data: displayBetaSeries[sym],
        borderColor: colorMap[sym] || '#ffffff',
        backgroundColor: colorMap[sym] || '#ffffff',
        borderWidth: 1.75,
        pointRadius: 0, hoverRadius: 4, fill: false
    }));

    // Add VCN Market Baseline
    datasets.push({
        label: 'VCN Baseline (\u03B2 = 1.0)',
        data: new Array(displayDates.length).fill(1.0),
        borderColor: '#ffffff',
        borderWidth: 1.5,
        borderDash: [5, 5],
        pointRadius: 0, hoverRadius: 0, fill: false
    });

    const ctx = document.getElementById('betaChart').getContext('2d');
    betaChart = new Chart(ctx, {
        type: 'line',
        data: { labels: displayDates, datasets: datasets },
        options: {
            layout: { padding: { right: 25 } },
            responsive: true, maintainAspectRatio: false,
            interaction: { mode: 'index', intersect: false },
            plugins: {
                legend: { labels: { color: '#94a3b8', font: { family: 'sans-serif', size: 12 }, boxWidth: 40, boxHeight: 3 } },
                tooltip: { 
                    backgroundColor: '#0f172a', titleColor: '#94a3b8', bodyColor: '#f1f5f9', borderColor: '#334155', borderWidth: 1,
                    callbacks: {
                        label: function(context) {
                            let label = context.dataset.label || '';
                            if (label) label += ': ';
                            if (context.parsed.y !== null) label += context.parsed.y.toFixed(2);
                            return label;
                        }
                    }
                }
            },
            scales: {
                x: { 
                    grid: { 
                        color: function(context) {
                            if (context.tick === undefined) return 'transparent';
                            const index = context.tick.value;
                            if (index === 0) return '#1e293b'; 
                            const prevDateStr = displayDates[index - 1];
                            const currDateStr = displayDates[index];
                            if (prevDateStr && currDateStr && prevDateStr.substring(0, 7) !== currDateStr.substring(0, 7)) {
                                const currentDate = new Date(currDateStr + "T00:00:00");
                                const startDate = new Date(displayDates[0] + "T00:00:00");
                                const monthDiff = (currentDate.getFullYear() - startDate.getFullYear()) * 12 + (currentDate.getMonth() - startDate.getMonth());
                                // 4 Year chart displays best with 6-month intervals
                                return (monthDiff % 6 === 0) ? '#1e293b' : 'rgba(30, 41, 59, 0.3)'; 
                            }
                            return 'transparent';
                        }, drawBorder: false
                    }, 
                    ticks: { 
                        color: '#64748b', autoSkip: false, maxRotation: 0, 
                        callback: function(val, index) {
                            if (index === 0) return new Date(displayDates[0] + "T00:00:00").toLocaleDateString('en-US', { year: 'numeric', month: 'short' });
                            const prevDateStr = displayDates[index - 1];
                            const currDateStr = displayDates[index];
                            if (!prevDateStr || !currDateStr) return ''; 
                            if (prevDateStr.substring(0, 7) !== currDateStr.substring(0, 7)) {
                                const currentDate = new Date(currDateStr + "T00:00:00");
                                const startDate = new Date(displayDates[0] + "T00:00:00");
                                const monthDiff = (currentDate.getFullYear() - startDate.getFullYear()) * 12 + (currentDate.getMonth() - startDate.getMonth());
                                if (monthDiff % 6 === 0) return currentDate.toLocaleDateString('en-US', { year: 'numeric', month: 'short' });
                            }
                            return '';
                        }
                    } 
                },
                y: { grid: { color: '#1e293b' }, ticks: { color: '#94a3b8' }, title: { display: true, text: "Market Beta (LM Slope)", color: '#94a3b8', font: { size: 12, weight: 'medium' } } }
            }
        }
    });
}