import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  BRAND_SCALES,
  BRAND_SWATCHES,
  DEFAULT_CONFIG,
  decodeChartState,
  deriveChartMeta
} from './chartUtils';
import { ChartVisualizer, ErrorBoundary } from './ChartVisualizer';

function parseEncodedFromLocation(): string | null {
  let rawEncoded: string | null = null;
  try {
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.has('view')) rawEncoded = urlParams.get('view');
    else if (urlParams.has('data')) rawEncoded = urlParams.get('data');
  } catch (e) {}

  if (!rawEncoded && window.location.hash) {
    const hash = window.location.hash;
    if (hash.startsWith('#view=')) rawEncoded = hash.slice('#view='.length);
    else if (hash.startsWith('#data=')) rawEncoded = hash.slice('#data='.length);
  }
  return rawEncoded;
}

export default function EmbedApp() {
  const [chartState, setChartState] = useState<{
    tableHeaders: any[];
    tableRows: any[][];
    config: any;
    seriesColors: Record<string, string>;
  } | null>(() => {
    const raw = parseEncodedFromLocation();
    if (!raw) return null;
    try {
      return decodeChartState(raw);
    } catch (e) {
      return null;
    }
  });

  useEffect(() => {
    const onHashChange = () => {
      const raw = parseEncodedFromLocation();
      if (!raw) return;
      try {
        const parsed = decodeChartState(raw);
        if (parsed) setChartState(parsed);
      } catch (e) {}
    };
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  const editorialCardRef = useRef<HTMLDivElement | null>(null);
  const [cardWidth, setCardWidth] = useState(800);

  useEffect(() => {
    const card = editorialCardRef.current;
    if (!card) return;
    const updateWidth = () => {
      const w = Math.round(card.getBoundingClientRect().width || card.clientWidth);
      if (w > 0) setCardWidth(prev => (Math.abs(prev - w) >= 2 ? w : prev));
    };
    updateWidth();
    const ro = new ResizeObserver(updateWidth);
    ro.observe(card);
    window.addEventListener('resize', updateWidth);
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', updateWidth);
    };
  }, [chartState]);

  const tableHeaders = chartState?.tableHeaders || [];
  const tableRows = chartState?.tableRows || [];
  const config = chartState?.config || DEFAULT_CONFIG;

  const {
    seriesList,
    pieCategories,
    isPieByRow,
    chartContainerHeight,
    footerLines
  } = useMemo(
    () => deriveChartMeta(tableHeaders, tableRows, config, cardWidth),
    [tableHeaders, tableRows, config, cardWidth]
  );

  const seriesColors = useMemo(() => {
    const rawColors = chartState?.seriesColors || {};
    const items = config.chartType === 'Pie'
      ? (isPieByRow ? seriesList : pieCategories)
      : seriesList;
    const count = Math.min(Math.max(items.length, 2), 10);
    const palette = BRAND_SCALES[count] || BRAND_SCALES[10];
    const resolved: Record<string, string> = { ...rawColors };
    items.forEach((s, idx) => {
      if (!resolved[s]) {
        resolved[s] = palette[idx % palette.length];
      }
    });
    return resolved;
  }, [chartState?.seriesColors, config.chartType, isPieByRow, seriesList, pieCategories]);

  // Pang and Infogram protocol auto-resize for iframe CMS embeds
  useEffect(() => {
    let lastSentHeight = 0;

    const broadcastHeight = () => {
      const card = document.getElementById('editorial-graphic-card') || document.body;
      const rect = card.getBoundingClientRect();
      const height = Math.ceil(rect.height);

      if (Math.abs(height - lastSentHeight) < 2) return;
      lastSentHeight = height;

      try {
        window.parent.postMessage({ type: 'pang-resize', height }, '*');
        if (window.top && window.top !== window.parent) {
          window.top.postMessage({ type: 'pang-resize', height }, '*');
        }
        window.parent.postMessage(JSON.stringify({ src: window.location.href, context: 'iframe.resize', height }), '*');
      } catch (e) {}
    };

    const timer = setTimeout(broadcastHeight, 60);
    const ro = new ResizeObserver(broadcastHeight);
    const target = document.getElementById('editorial-graphic-card') || document.body;
    ro.observe(target);

    return () => {
      clearTimeout(timer);
      ro.disconnect();
    };
  }, [chartState, chartContainerHeight, cardWidth]);

  if (!chartState) {
    return (
      <div className="bg-white text-slate-500 p-6 text-xs text-center font-sans">
        Ingen grafdata hittades i länken.
      </div>
    );
  }

  return (
    <div className="bg-white text-slate-800 p-0 m-0 w-full overflow-hidden">
      <main className="flex-1 w-full max-w-4xl mx-auto relative">
        <div className="w-full p-0 flex flex-col items-center justify-start relative">
          <div className="w-full max-w-2xl transition-all duration-200 border-0 bg-transparent p-0 m-0 flex flex-col items-center">
            <div
              ref={editorialCardRef}
              id="editorial-graphic-card"
              className="w-full select-none"
              style={{ margin: 0, padding: 0, backgroundColor: '#ffffff', color: '#0f172a' }}
            >
              <div className="mb-2 select-none" style={{ marginTop: 0, paddingTop: 0 }}>
                <h1
                  className="leading-none whitespace-pre-line tracking-tight mb-1 transition-all"
                  style={{ fontSize: '2rem', fontWeight: config.titleWeight, margin: 0, marginTop: '-0.1em', padding: 0, color: '#0f172a' }}
                >
                  {config.title || 'Rubrik'}
                </h1>

                {config.ingress && (
                  <p
                    className="mt-1 leading-normal transition-all"
                    style={{ fontSize: '1.125rem', fontWeight: config.ingressWeight, margin: 0, marginTop: '0.25rem', padding: 0, color: '#475569' }}
                  >
                    {config.ingress}
                  </p>
                )}

                {config.drawLegend && config.legendPosition === 'Below Ingress' && (!config.useHierarchy || seriesList.length > 1 || (config.categoryColorOverrides && config.categoryColorOverrides.length > 0)) && (
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-1">
                    {(config.chartType === 'Pie' ? (isPieByRow ? seriesList : pieCategories) : seriesList)
                      .filter(sName => !(config.hiddenLegendItems || []).includes(sName))
                      .map((sName, sIdx) => {
                        const swatchColor = config.chartType === 'Pie'
                          ? (seriesColors[sName] || (isPieByRow ? BRAND_SWATCHES[sIdx % BRAND_SWATCHES.length] : BRAND_SCALES[Math.min(Math.max(pieCategories.length, 2), 10)][sIdx % 10]))
                          : (seriesColors[sName] || BRAND_SWATCHES[sIdx % BRAND_SWATCHES.length]);
                        return (
                          <div key={`${sName}-${sIdx}`} className="flex items-center space-x-1.5 py-0.5">
                            <span className="w-2.5 h-2.5 inline-block shrink-0" style={{ backgroundColor: swatchColor }} />
                            <span className="text-sm" style={{ fontWeight: config.legendWeight, color: '#1e293b' }}>
                              {sName}
                            </span>
                          </div>
                        );
                      })}
                    {(config.categoryColorOverrides || []).filter((o: any) => o.category && o.color).map((ov: any, oIdx: number) => {
                      const label = ov.legendLabel || (ov.series && ov.series !== '*' && ov.series !== 'Alla' && ov.series !== 'Alla serier' ? `${ov.category} (${ov.series})` : ov.category);
                      return (
                        <div key={`ov-leg-${ov.id || oIdx}`} className="flex items-center space-x-1.5 py-0.5">
                          <span className="w-2.5 h-2.5 inline-block shrink-0" style={{ backgroundColor: ov.color }} />
                          <span className="text-sm font-semibold" style={{ fontWeight: config.legendWeight, color: '#1e293b' }}>
                            {label}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              <div className="w-full relative" style={{ height: `${chartContainerHeight}px`, minHeight: `${chartContainerHeight}px` }}>
                <ErrorBoundary>
                  <ChartVisualizer
                    key={`chart-${config.hierarchySource}-${config.useHierarchy}-${config.chartType}`}
                    headers={tableHeaders}
                    rows={tableRows}
                    seriesList={seriesList}
                    pieCategories={pieCategories}
                    seriesColors={seriesColors}
                    config={config}
                    isDark={false}
                    containerWidth={cardWidth}
                    containerHeight={chartContainerHeight}
                    isViewerMode={true}
                  />
                </ErrorBoundary>
              </div>

              {config.footers && config.footers.length > 0 && (
                <div className="mt-1.5 space-y-0.5 text-xs select-none pb-2 transition-all" style={{ color: '#1e293b' }}>
                  {footerLines.map((line, lIdx) => (
                    <div key={lIdx} className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5">
                      {line.map((item: any) => (
                        <div key={item.id} className="inline-flex items-baseline space-x-1">
                          {item.prefix && <span style={{ fontWeight: item.prefixWeight, color: '#0f172a' }}>{item.prefix}</span>}
                          {item.text && <span style={{ fontWeight: item.textWeight, color: '#334155' }}>{item.text}</span>}
                        </div>
                      ))}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
