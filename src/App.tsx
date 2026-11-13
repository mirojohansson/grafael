import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import * as XLSX from 'xlsx';
import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';
import { svg2pdf } from 'svg2pdf.js';
import opentype from 'opentype.js';
import LZString from 'lz-string';
import pdfFonts from 'pdfmake/build/vfs_fonts';
import {
  BRAND_SCALES,
  BRAND_SWATCHES,
  DEFAULT_CONFIG,
  FULL_MONTH_NAMES,
  MONTH_NAMES,
  PRINT_COLUMNS,
  cleanCell,
  cleanFloat,
  computeYScale,
  copyTextToClipboard,
  decodeChartState,
  encodeChartState,
  formatDatapointDate,
  formatValue,
  getContrastColor,
  getItemColor,
  isEmptyValue,
  isPureNumericString,
  isSafeKey,
  isYear,
  parseCSV,
  parseVal,
  safeUrl,
  sanitizeChartState,
  sanitizeColor,
  serializeToCSV,
  tryParseDate
} from './chartUtils';
import { ChartVisualizer, ErrorBoundary } from './ChartVisualizer';

// Ensure global compatibility for any internal references
if (typeof window !== 'undefined') {
  (window as any).XLSX = XLSX;
  (window as any).html2canvas = html2canvas;
  (window as any).jsPDF = jsPDF;
  (window as any).jspdf = { jsPDF };
  (window as any).svg2pdf = svg2pdf;
  (window as any).opentype = opentype;
  (window as any).LZString = LZString;
  const vfsData = (pdfFonts && (pdfFonts as any).pdfMake && (pdfFonts as any).pdfMake.vfs) || pdfFonts || {};
  (window as any).pdfMake = { vfs: vfsData };
}

    // Load bundled Roboto fonts from vfs_fonts (no external CDN fetch, CSP-safe)
    const opentypeFontCache: Record<number, any> = { 300: null, 400: null, 500: null, 700: null, 900: null };

    function base64ToArrayBuffer(base64) {
      const binaryString = window.atob(base64);
      const len = binaryString.length;
      const bytes = new Uint8Array(len);
      for (let i = 0; i < len; i++) bytes[i] = binaryString.charCodeAt(i);
      return bytes.buffer;
    }

    async function loadOpentypeFonts() {
      if (!window.opentype) return opentypeFontCache;
      if (opentypeFontCache[400] && opentypeFontCache[700]) return opentypeFontCache;

      const vfs = ((window as any).pdfMake && (window as any).pdfMake.vfs) || {};
      const regBase64 = vfs["Roboto-Regular.ttf"] || vfs["Roboto.ttf"];
      const medBase64 = vfs["Roboto-Medium.ttf"] || vfs["Roboto-Bold.ttf"] || regBase64;

      if (regBase64 && !opentypeFontCache[400]) {
        try {
          const parsed = window.opentype.parse(base64ToArrayBuffer(regBase64));
          if (parsed) {
            opentypeFontCache[400] = parsed;
            if (!opentypeFontCache[300]) opentypeFontCache[300] = parsed;
          }
        } catch(e) {}
      }
      if (medBase64 && !opentypeFontCache[700]) {
        try {
          const parsed = window.opentype.parse(base64ToArrayBuffer(medBase64));
          if (parsed) {
            opentypeFontCache[500] = parsed;
            opentypeFontCache[700] = parsed;
            if (!opentypeFontCache[900]) opentypeFontCache[900] = parsed;
          }
        } catch(e) {}
      }

      const anyFallback = opentypeFontCache[900] || opentypeFontCache[700] || opentypeFontCache[400] || Object.values(opentypeFontCache).find(Boolean);
      [300, 400, 500, 700, 900].forEach(w => {
        if (!opentypeFontCache[w] && anyFallback) opentypeFontCache[w] = anyFallback;
      });

      return opentypeFontCache;
    }

    // Convert all SVG text nodes to pure vector paths (<path>) for 100% exact vector print rendering
    async function convertSvgTextToOutlines(svgElement) {
      if (!window.opentype) return svgElement;
      try {
        await loadOpentypeFonts();
      } catch (e) {
        return svgElement;
      }

      function pickFont(weight) {
        const w = parseInt(weight, 10) || 400;
        if (w >= 850 && opentypeFontCache[900]) return opentypeFontCache[900];
        if (w >= 650 && opentypeFontCache[700]) return opentypeFontCache[700];
        if (w >= 450 && opentypeFontCache[500]) return opentypeFontCache[500];
        if (w <= 350 && opentypeFontCache[300]) return opentypeFontCache[300];
        return opentypeFontCache[400] || opentypeFontCache[700] || opentypeFontCache[900] || Object.values(opentypeFontCache).find(Boolean);
      }

      const anyFont = Object.values(opentypeFontCache).find(Boolean);
      if (!anyFont) return svgElement;

      const textNodes = Array.from(svgElement.querySelectorAll("text"));
      textNodes.forEach((textNode: any) => {
        try {
          const textEl: any = textNode;
          const parent: any = textEl.parentNode;
          if (!parent) return;

          const baseFontSize = parseFloat(textEl.getAttribute("font-size") || textEl.style.fontSize || 14);
          const baseAnchor = textEl.getAttribute("text-anchor") || textEl.style.textAnchor || "start";
          const rawFill = textEl.getAttribute("fill") || textEl.style.fill || "#000000";
          // Segment contrast labels inside bars retain pure white; all other editorial text defaults to pure black
          const baseFill = (rawFill === "#ffffff" || rawFill === "rgb(255, 255, 255)") ? "#ffffff" : "#000000";
          const baseWeight = textEl.getAttribute("font-weight") || textEl.style.fontWeight || "400";
          const baseX = parseFloat(textEl.getAttribute("x") || 0);
          const baseY = parseFloat(textEl.getAttribute("y") || 0);
          const transform = textEl.getAttribute("transform");
          const dominantBaseline = textEl.getAttribute("dominant-baseline") || textEl.style.dominantBaseline;

          let adjY = baseY;
          if (dominantBaseline === "central" || dominantBaseline === "middle") {
            adjY = baseY + baseFontSize * 0.35;
          }

          const tspans = Array.from(textEl.querySelectorAll("tspan"));

          if (tspans.length > 0) {
            const chunks = tspans.map((tsNode: any) => {
              const ts: any = tsNode;
              const text = ts.textContent || "";
              const weight = ts.getAttribute("font-weight") || ts.style.fontWeight || baseWeight;
              const font = pickFont(weight);
              const size = parseFloat(ts.getAttribute("font-size") || ts.style.fontSize || baseFontSize);
              const tsFill = ts.getAttribute("fill") || ts.style.fill;
              const fill = (tsFill === "#ffffff" || tsFill === "rgb(255, 255, 255)") ? "#ffffff" : baseFill;
              const width = font ? font.getAdvanceWidth(text, size) : (text.length * size * 0.55);
              return { text, font, size, fill, width };
            });

            const totalW = chunks.reduce((acc, c) => acc + c.width, 0);
            let curX = baseX;
            if (baseAnchor === "middle") curX = baseX - totalW / 2;
            else if (baseAnchor === "end") curX = baseX - totalW;

            const group = document.createElementNS("http://www.w3.org/2000/svg", "g");
            if (transform) group.setAttribute("transform", transform);

            chunks.forEach(chunk => {
              if (!chunk.text) return;
              if (chunk.font) {
                const path = chunk.font.getPath(chunk.text, curX, adjY, chunk.size);
                const pathData = path.toPathData(2);
                if (pathData) {
                  const pathEl = document.createElementNS("http://www.w3.org/2000/svg", "path");
                  pathEl.setAttribute("d", pathData);
                  pathEl.setAttribute("fill", chunk.fill);
                  group.appendChild(pathEl);
                }
              }
              curX += chunk.width;
            });

            parent.replaceChild(group, textEl);
          } else {
            const text = textEl.textContent || "";
            if (!text.trim()) {
              parent.removeChild(textEl);
              return;
            }

            const font = pickFont(baseWeight);
            if (!font) return;

            const width = font.getAdvanceWidth(text, baseFontSize);
            let drawX = baseX;
            if (baseAnchor === "middle") drawX = baseX - width / 2;
            else if (baseAnchor === "end") drawX = baseX - width;

            const path = font.getPath(text, drawX, adjY, baseFontSize);
            const pathData = path.toPathData(2);
            if (pathData) {
              const pathEl = document.createElementNS("http://www.w3.org/2000/svg", "path");
              pathEl.setAttribute("d", pathData);
              pathEl.setAttribute("fill", baseFill);
              if (transform) pathEl.setAttribute("transform", transform);
              parent.replaceChild(pathEl, textEl);
            }
          }
        } catch (elErr) {
          console.warn("Could not outline text node:", elErr);
        }
      });
      return svgElement;
    }

    // Build unified composite SVG for vector PDF export
    function buildCompositeVectorSvgElement(chartSvgEl, config, seriesList, pieCategories, seriesColors, targetWidthMm, customWidth) {
      const width = customWidth || 800;
      const origViewBox = chartSvgEl.getAttribute("viewBox")?.split(" ").map(Number) || [0, 0, width, 520];
      const chartH = origViewBox[3] || 520;
      const padLeft = 2; // Exact margin flush baseline
      const svgNS = "http://www.w3.org/2000/svg";

      const compositeSvg = document.createElementNS(svgNS, "svg");
      compositeSvg.setAttribute("xmlns", svgNS);

      const headerGroup = document.createElementNS(svgNS, "g");
      let curY = 0;
      const TITLE_PT_MAP = { "1sp": 12, "2sp": 14, "3sp": 16, "4sp": 18, "5sp": 20 };
      const colKey = config.printWidth || "2sp";
      const titlePt = TITLE_PT_MAP[colKey] || 14;
      const pxPerPt = (25.4 / 72) / (99.2 / 800);
      const titleSize = cleanFloat(titlePt * pxPerPt);
      const titleLeading = cleanFloat(titleSize * 1.22);

      const titleText = (config.title || "Rubrik").trim();
      if (titleText) {
        const maxTitleChars = Math.max(14, Math.floor((width - padLeft * 2) / (titleSize * 0.58)));
        const rawLines = titleText.split(/\r?\n/);
        const titleLines = [];
        rawLines.forEach(l => {
          if (l.length > maxTitleChars && l.includes(" ")) {
            const words = l.split(" ");
            let cur = "";
            words.forEach(w => {
              if ((cur + " " + w).trim().length > maxTitleChars) {
                if (cur) titleLines.push(cur.trim());
                cur = w;
              } else cur = (cur + " " + w).trim();
            });
            if (cur) titleLines.push(cur.trim());
          } else titleLines.push(l);
        });

          titleLines.forEach((line, idx) => {
          curY += (idx === 0 ? Math.round(titleSize * 0.72) + 1.5 : titleLeading);
          const tEl = document.createElementNS(svgNS, "text");
          tEl.setAttribute("x", String(padLeft));
          tEl.setAttribute("y", String(curY));
          tEl.setAttribute("font-size", String(titleSize));
          tEl.setAttribute("font-weight", String(config.titleWeight || 900));
          tEl.setAttribute("fill", "#000000"); // Pure black
          tEl.setAttribute("font-family", "Roboto");
          tEl.textContent = line;
          headerGroup.appendChild(tEl);
        });
      }

      const ingressPt = 10;
      const ingressSize = cleanFloat(ingressPt * pxPerPt);
      const ingressLeading = cleanFloat(ingressSize * 1.28);
      const ingressText = (config.ingress || "").trim();
      if (ingressText) {
        const maxIngressChars = Math.max(18, Math.floor((width - padLeft * 2) / (ingressSize * 0.54)));
        const rawLines = ingressText.split(/\r?\n/);
        const ingressLines = [];
        rawLines.forEach(l => {
          if (l.length > maxIngressChars && l.includes(" ")) {
            const words = l.split(" ");
            let cur = "";
            words.forEach(w => {
              if ((cur + " " + w).trim().length > maxIngressChars) {
                if (cur) ingressLines.push(cur.trim());
                cur = w;
              } else cur = (cur + " " + w).trim();
            });
            if (cur) ingressLines.push(cur.trim());
          } else ingressLines.push(l);
        });

        ingressLines.forEach((line, idx) => {
          curY += (idx === 0 ? (curY === 0 ? Math.round(ingressSize * 0.72) + 1.5 : (ingressSize + 6)) : ingressLeading);
          const tEl = document.createElementNS(svgNS, "text");
          tEl.setAttribute("x", String(padLeft));
          tEl.setAttribute("y", String(curY));
          tEl.setAttribute("font-size", String(ingressSize));
          tEl.setAttribute("font-weight", String(config.ingressWeight || 400));
          tEl.setAttribute("fill", "#000000"); // Pure black
          tEl.setAttribute("font-family", "Roboto");
          tEl.textContent = line;
          headerGroup.appendChild(tEl);
        });
        curY += 18;
      }

      if (config.drawLegend && config.legendPosition === "Below Ingress") {
        curY += (ingressText ? 18 : 12);
        const isPieByRow = config.chartType === "Pie" && (config.pieGrouping === "rows" || (config.pieGrouping !== "columns" && seriesList.length > 1));
        const allItems = config.chartType === "Pie" ? (isPieByRow ? seriesList : pieCategories) : seriesList;
        const items = allItems.filter(s => !(config.hiddenLegendItems || []).includes(s));
        let legendX = padLeft;
        const legendPt = 8.5;
        const legendSize = cleanFloat(legendPt * pxPerPt);
        const swatchSize = Math.round(legendSize * 0.68);
        const legendLeading = cleanFloat(legendSize * 1.35);

        items.forEach((sName, sIdx) => {
          const color = config.chartType === "Pie"
            ? (seriesColors[sName] || (isPieByRow ? BRAND_SWATCHES[sIdx % BRAND_SWATCHES.length] : BRAND_SCALES[Math.min(Math.max(items.length, 2), 10)][sIdx % 10]))
            : (seriesColors[sName] || BRAND_SWATCHES[sIdx % BRAND_SWATCHES.length]);
          
          const itemW = swatchSize + 8 + sName.length * (legendSize * 0.58) + 16;
          if (legendX + itemW > width - 4 && legendX > padLeft) {
            legendX = padLeft;
            curY += legendLeading;
          }

          if (config.chartType === "Line") {
            const line = document.createElementNS(svgNS, "line");
            line.setAttribute("x1", String(legendX));
            line.setAttribute("y1", String(curY - swatchSize / 2));
            line.setAttribute("x2", String(legendX + swatchSize + 4));
            line.setAttribute("y2", String(curY - swatchSize / 2));
            line.setAttribute("stroke", color);
            line.setAttribute("stroke-width", "3");
            headerGroup.appendChild(line);
          } else {
            const rect = document.createElementNS(svgNS, "rect");
            rect.setAttribute("x", String(legendX));
            rect.setAttribute("y", String(curY - swatchSize + 1));
            rect.setAttribute("width", String(swatchSize));
            rect.setAttribute("height", String(swatchSize));
            rect.setAttribute("fill", color);
            headerGroup.appendChild(rect);
          }

          const txt = document.createElementNS(svgNS, "text");
          txt.setAttribute("x", String(legendX + (config.chartType === 'Line' ? swatchSize + 10 : swatchSize + 6)));
          txt.setAttribute("y", String(curY));
          txt.setAttribute("font-size", String(legendSize));
          txt.setAttribute("font-weight", String(config.legendWeight || 400));
          txt.setAttribute("fill", "#000000");
          txt.setAttribute("font-family", "Roboto");
          txt.textContent = sName;
          headerGroup.appendChild(txt);
          legendX += itemW;
        });

        const catOverrides = (config.categoryColorOverrides || []).filter(o => o.category && o.color);
        catOverrides.forEach(ov => {
          const ovLabel = ov.legendLabel || (ov.series && ov.series !== "*" && ov.series !== "Alla" && ov.series !== "Alla serier" ? `${ov.category} (${ov.series})` : ov.category);
          const color = ov.color;
          const itemW = swatchSize + 8 + ovLabel.length * (legendSize * 0.58) + 16;
          if (legendX + itemW > width - 4 && legendX > padLeft) {
            legendX = padLeft;
            curY += legendLeading;
          }
          const rect = document.createElementNS(svgNS, "rect");
          rect.setAttribute("x", String(legendX));
          rect.setAttribute("y", String(curY - swatchSize + 1));
          rect.setAttribute("width", String(swatchSize));
          rect.setAttribute("height", String(swatchSize));
          rect.setAttribute("fill", color);
          headerGroup.appendChild(rect);

          const txt = document.createElementNS(svgNS, "text");
          txt.setAttribute("x", String(legendX + swatchSize + 6));
          txt.setAttribute("y", String(curY));
          txt.setAttribute("font-size", String(legendSize));
          txt.setAttribute("font-weight", String(config.legendWeight || 400));
          txt.setAttribute("fill", "#000000");
          txt.setAttribute("font-family", "Roboto");
          txt.textContent = ovLabel;
          headerGroup.appendChild(txt);
          legendX += itemW;
        });
        curY += 8;
      }

      const headerBottomY = curY;
      const chartOffsetY = headerBottomY > 0 ? headerBottomY + 8 : 0;
      const chartBottomY = chartOffsetY + chartH;

      const chartGroup = document.createElementNS(svgNS, "g");
      chartGroup.setAttribute("transform", `translate(0, ${chartOffsetY})`);
      Array.from((chartSvgEl as any).childNodes).forEach((child: any) => chartGroup.appendChild(child.cloneNode(true)));

      // Unify all text to pure black in export, preserving white segment labels
      chartGroup.querySelectorAll("*").forEach(el => {
        if (el.tagName === "text" || el.tagName === "tspan") {
          el.setAttribute("font-family", "Roboto");
          const fill = el.getAttribute("fill");
          if (fill !== "#ffffff" && fill !== "rgb(255, 255, 255)") {
            el.setAttribute("fill", "#000000");
          }
        }
        const stroke = el.getAttribute("stroke");
        if (stroke === "#94a3b8" || stroke === "#64748b") el.setAttribute("stroke", "#000000");
        if (stroke === "#334155") el.setAttribute("stroke", config.gridColor || "#cbd5e1");
      });

      const footerGroup = document.createElementNS(svgNS, "g");
      const footerPt = 7;
      const footerSize = cleanFloat(footerPt * pxPerPt);
      const footerLeading = cleanFloat(footerSize * 1.35);
      let footerY = chartBottomY + 10;

      const hasFooters = config.footers && config.footers.length > 0 && config.footers.some(f => (f.prefix || f.text || "").trim());
      if (hasFooters) {
        const lines = [];
        config.footers.forEach((item, idx) => {
          if (idx === 0 || item.layout === "below") lines.push([item]);
          else {
            if (!lines.length) lines.push([]);
            lines[lines.length - 1].push(item);
          }
        });

        lines.forEach((line) => {
          footerY += footerLeading;
          let lineX = padLeft;
          line.forEach((item) => {
            const prefix = (item.prefix || "").trim();
            const text = (item.text || "").trim();
            if (prefix || text) {
              const itemW = (prefix.length + text.length + 2) * (footerSize * 0.55) + 16;
              if (lineX + itemW > width - 4 && lineX > padLeft) {
                lineX = padLeft;
                footerY += footerLeading;
              }
              const textNode = document.createElementNS(svgNS, "text");
              textNode.setAttribute("x", String(lineX));
              textNode.setAttribute("y", String(footerY));
              textNode.setAttribute("font-size", String(footerSize));
              textNode.setAttribute("font-family", "Roboto");
              textNode.setAttribute("fill", "#000000");

              if (prefix) {
                const preSpan = document.createElementNS(svgNS, "tspan");
                preSpan.setAttribute("font-weight", String(item.prefixWeight || 900));
                preSpan.textContent = prefix + " ";
                textNode.appendChild(preSpan);
              }
              if (text) {
                const valSpan = document.createElementNS(svgNS, "tspan");
                valSpan.setAttribute("font-weight", String(item.textWeight || 400));
                valSpan.textContent = text;
                textNode.appendChild(valSpan);
              }
              footerGroup.appendChild(textNode);
              lineX += itemW;
            }
          });
        });
      }

      const totalHeight = cleanFloat(hasFooters ? footerY + 3.8 : chartBottomY + 1.5);
      compositeSvg.setAttribute("viewBox", `0 0 ${width} ${totalHeight}`);
      compositeSvg.setAttribute("width", `${width}`);
      compositeSvg.setAttribute("height", `${totalHeight}`);

      const bgRect = document.createElementNS(svgNS, "rect");
      bgRect.setAttribute("width", "100%");
      bgRect.setAttribute("height", "100%");
      bgRect.setAttribute("fill", "#ffffff");

      const contentGroup = document.createElementNS(svgNS, "g");
      contentGroup.appendChild(headerGroup);
      contentGroup.appendChild(chartGroup);
      contentGroup.appendChild(footerGroup);
      compositeSvg.appendChild(bgRect);
      compositeSvg.appendChild(contentGroup);

      const serializer = new XMLSerializer();
      const svgString = serializer.serializeToString(compositeSvg);
      return { svgElement: compositeSvg, contentGroup, totalHeight, width, svgString };
    }

    function App() {
      const isIframe = useMemo(() => {
        try {
          return window.self !== window.top;
        } catch (e) {
          return true;
        }
      }, []);

      const [isViewerMode, setIsViewerMode] = useState(isIframe);
      const [isDarkMode, setIsDarkMode] = useState(false);
      const [activeTab, setActiveTab] = useState("data");
      const [toast, setToast] = useState("");
      const [colorPickerTarget, setColorPickerTarget] = useState(null);

      // Pivot tool state
      const [showPivotUI, setShowPivotUI] = useState(false);
      const [pivotConfig, setPivotConfig] = useState({ catCol: 0, seriesCol: 1, valCol: 2 });
      const [detectedTidyInfo, setDetectedTidyInfo] = useState(null);
      const [dismissedTidyBanner, setDismissedTidyBanner] = useState(false);

      const titleInputRef = useRef(null);
      const ingressInputRef = useRef(null);
      const firstFooterInputRef = useRef(null);

      useEffect(() => {
        loadOpentypeFonts().catch(e => console.warn("Font init", e));
      }, []);

      const [tableHeaders, setTableHeaders] = useState(["Kolumn 1", "Kolumn 2"]);
      const [tableRows, setTableRows] = useState([
        ["", ""],
        ["", ""],
        ["", ""],
        ["", ""]
      ]);
      const [rawTextBuffer, setRawTextBuffer] = useState("");
      const [seriesColors, setSeriesColors] = useState<Record<string, string>>({ "Serie 1": "#e4590f" });
      const [userManuallyToggledLegend, setUserManuallyToggledLegend] = useState(false);

      const [config, setConfig] = useState({
        importDelimiter: "auto",
        skipRows: 0,
        dataDecSep: "auto",
        dataThousandSep: "auto",

        title: "Rubrik",
        ingress: "Antal",

        footers: [
          { id: 1, prefix: "Källa", prefixWeight: 900, text: "Statistikcentralen", textWeight: 400, layout: "below" }
        ],

        titleWeight: 900,
        ingressWeight: 400,
        categoryWeight: 400,
        subCategoryWeight: 400,
        valueWeight: 700,
        axisWeight: 400,
        legendWeight: 400,
        valueOrientation: "auto",

        chartType: "Bar",
        chartHeight: 480,
        barOrientation: "Vertical",
        isStacked: false,
        isStacked100: false,
        showStackedSegmentLabels: false,
        showStackedTotal: true,
        useHierarchy: false,
        hierarchySource: "columns",
        hierarchyParentCol: 0,
        hierarchySubCol: 1,
        hierarchyParentRow: "header",
        hierarchySubRow: 0,
        hierarchySeriesCol: 0,
        categoryColIndex: 0,
        barWidthPct: 68,
        barGapPct: 24,
        innerBarGapPct: 4,
        skipEmptyBars: true,
        hCatAlign: "left",

        strokeLines: true,
        drawDots: false,
        fillLines: false,
        isStackedArea: false,
        fillOpacity: 25,
        lineWidth: 3,
        drawLineValues: false,
        lineGapMode: "break",

        isDonut: true,
        holePct: 52,
        showPct: true,
        isSemiCircle: false,
        pieGrouping: "rows",
        pieProportionalSize: true,
        drawTotalSum: true,
        donutCenterText: "",
        donutCenterSubtext: "",

        drawLegend: false,
        legendPosition: "Below Ingress",
        legendLayout: "Horizontal",
        hiddenLegendItems: [],

        drawXAxis: true,
        drawXLabels: true,
        axisPosition: "zero",
        xAxisWidth: 2.5,
        xTickStyle: "None",

        dateFormatMode: "Auto",
        xLabelDecimation: "Auto",
        dateMonthLang: "sv",
        datePart1: "auto",
        datePart2: "auto",
        datePart3: "auto",
        popupDateFormat: "full_readable",
        
        drawYLabels: false,
        axisLabelFlushLeft: true,
        yTickStyle: "None",
        yDivisions: "Auto (~5)",
        
        gridLineStyle: "Dashed",
        gridLineWidth: 1,
        gridColor: "#cbd5e1",
        gridOpacity: 100,

        customYRange: false,
        customMinY: 0,
        customMaxY: 100,
        yScaleRounding: "Auto",
        yDecimals: "Auto",
        valDecimals: "Auto",
        thousandSep: " ",
        decSep: ",",

        valueDivisor: 1,
        customDivisorVal: 1000,
        valueSuffix: "",
        valuePrefix: "",
        unitOnLabels: false,
        unitOnTooltips: true,
        unitOnAxis: false,

        refLines: [],
        printWidth: "2sp",

        dataSortOrder: "original",
        showValueLabels: true,
        valueLabelMode: "all",
        customValueLabels: [],
        forceRoundScale: "Auto",

        enableTooltip: true,
        tooltipMode: "Structured",
        tooltipTemplate: "",
        isTemplateCustomized: false,
        userManuallySelectedTooltipCols: false,
        showPopupCategory: true,
        showPopupSwatch: true,
        categoryColorOverrides: [],
        customYStep: ""
      } as any);

      // --- ÅNGRA (UNDO) & GÖR OM (REDO) HISTORIK ---
      const historyRef = useRef([]);
      const historyIndexRef = useRef(-1);
      const isUndoingOrRedoing = useRef(false);
      const pendingSnapshotTimer = useRef(null);
      const [historyCount, setHistoryCount] = useState({ index: -1, length: 0 });

      const getSnapshot = (h, r, c, col) => ({
        tableHeaders: h ? JSON.parse(JSON.stringify(h)) : [],
        tableRows: r ? JSON.parse(JSON.stringify(r)) : [],
        config: c ? JSON.parse(JSON.stringify(c)) : {},
        seriesColors: col ? JSON.parse(JSON.stringify(col)) : {}
      });

      const applySnapshot = (snapshot) => {
        if (!snapshot) return;
        isUndoingOrRedoing.current = true;
        setTableHeaders(snapshot.tableHeaders);
        setTableRows(snapshot.tableRows);
        setConfig(snapshot.config);
        setSeriesColors(snapshot.seriesColors);
        syncToText(snapshot.tableHeaders, snapshot.tableRows);
        setTimeout(() => {
          isUndoingOrRedoing.current = false;
        }, 60);
      };

      const commitSnapshot = useCallback((snapshot) => {
        if (isUndoingOrRedoing.current) return;
        const currentStack = historyRef.current.slice(0, historyIndexRef.current + 1);
        const lastSnap = currentStack[currentStack.length - 1];

        if (lastSnap) {
          const isSame = JSON.stringify(lastSnap) === JSON.stringify(snapshot);
          if (isSame) return;
        }

        const nextStack = [...currentStack, snapshot];
        if (nextStack.length > 60) nextStack.shift();
        historyRef.current = nextStack;
        historyIndexRef.current = nextStack.length - 1;
        setHistoryCount({ index: historyIndexRef.current, length: nextStack.length });
      }, []);

      const handleUndo = useCallback(() => {
        if (pendingSnapshotTimer.current) {
          clearTimeout(pendingSnapshotTimer.current);
          pendingSnapshotTimer.current = null;
        }
        if (historyIndexRef.current > 0) {
          const nextIdx = historyIndexRef.current - 1;
          historyIndexRef.current = nextIdx;
          const target = historyRef.current[nextIdx];
          applySnapshot(target);
          setHistoryCount({ index: nextIdx, length: historyRef.current.length });
          setToast("Ångra (Undo)");
          setTimeout(() => setToast(""), 1200);
        }
      }, []);

      const handleRedo = useCallback(() => {
        if (pendingSnapshotTimer.current) {
          clearTimeout(pendingSnapshotTimer.current);
          pendingSnapshotTimer.current = null;
        }
        if (historyIndexRef.current < historyRef.current.length - 1) {
          const nextIdx = historyIndexRef.current + 1;
          historyIndexRef.current = nextIdx;
          const target = historyRef.current[nextIdx];
          applySnapshot(target);
          setHistoryCount({ index: nextIdx, length: historyRef.current.length });
          setToast("Gör om (Redo)");
          setTimeout(() => setToast(""), 1200);
        }
      }, []);

      // Initial snapshot vid laddning
      useEffect(() => {
        if (historyRef.current.length === 0) {
          const initial = getSnapshot(tableHeaders, tableRows, config, seriesColors);
          historyRef.current = [initial];
          historyIndexRef.current = 0;
          setHistoryCount({ index: 0, length: 1 });
        }
      }, []);

      // Debounce för textinmatning och inställningsändringar
      useEffect(() => {
        if (isUndoingOrRedoing.current) return;
        if (historyRef.current.length === 0) return;

        const currentSnap = getSnapshot(tableHeaders, tableRows, config, seriesColors);
        const curTop = historyRef.current[historyIndexRef.current];
        if (curTop && JSON.stringify(curTop) === JSON.stringify(currentSnap)) return;

        if (pendingSnapshotTimer.current) {
          clearTimeout(pendingSnapshotTimer.current);
        }

        pendingSnapshotTimer.current = setTimeout(() => {
          commitSnapshot(currentSnap);
          pendingSnapshotTimer.current = null;
        }, 350);

        return () => {
          if (pendingSnapshotTimer.current) {
            clearTimeout(pendingSnapshotTimer.current);
          }
        };
      }, [tableHeaders, tableRows, config, seriesColors, commitSnapshot]);

      // Globala tangentbordsgenvägar: Ctrl/Cmd+Z (Ångra) samt Ctrl/Cmd+Shift+Z / Ctrl/Cmd+Y (Gör om)
      useEffect(() => {
        const handleKeyDown = (e) => {
          const isModifier = e.metaKey || e.ctrlKey;
          if (!isModifier) return;

          const key = e.key.toLowerCase();

          // REDO: Cmd/Ctrl + Shift + Z eller Cmd/Ctrl + Y
          if ((e.shiftKey && key === 'z') || (!e.shiftKey && key === 'y')) {
            e.preventDefault();
            e.stopPropagation();
            handleRedo();
            return;
          }

          // UNDO: Cmd/Ctrl + Z (utan shift)
          if (!e.shiftKey && key === 'z') {
            e.preventDefault();
            e.stopPropagation();
            handleUndo();
            return;
          }
        };

        window.addEventListener('keydown', handleKeyDown, { capture: true });
        return () => window.removeEventListener('keydown', handleKeyDown, { capture: true });
      }, [handleUndo, handleRedo]);

      const editorialCardRef = useRef(null);
      const exportCardRef = useRef(null);
      const fileInputRef = useRef(null);
      const [cardWidth, setCardWidth] = useState(800);

      useEffect(() => {
        const card = editorialCardRef.current;
        if (!card) return;
        const updateWidth = () => {
          const w = Math.round(card.getBoundingClientRect().width || card.clientWidth);
          if (w > 0) setCardWidth(prev => Math.abs(prev - w) >= 2 ? w : prev);
        };
        updateWidth();
        const ro = new ResizeObserver(updateWidth);
        ro.observe(card);
        window.addEventListener("resize", updateWidth);
        return () => {
          ro.disconnect();
          window.removeEventListener("resize", updateWidth);
        };
      }, []);

      const exportWidth = useMemo(() => {
        const colKey = config.printWidth || "2sp";
        const mm = PRINT_COLUMNS[colKey]?.mm || 99.2;
        return Math.round(800 * (mm / 99.2));
      }, [config.printWidth]);

      const isRowSeries = useMemo(() => {
        if (!tableRows || tableRows.length < 2 || !tableHeaders || tableHeaders.length < 3) return false;
        let pRowIdx = config.hierarchyParentRow === "header" ? -1 : (typeof config.hierarchyParentRow === "number" ? config.hierarchyParentRow : -1);
        let sRowIdx = config.hierarchySubRow === "header" ? -1 : (typeof config.hierarchySubRow === "number" ? config.hierarchySubRow : 0);
        if (pRowIdx === sRowIdx) {
          if (pRowIdx === -1) sRowIdx = 0;
          else sRowIdx = pRowIdx === 0 ? 1 : 0;
        }
        const checkIdx = sRowIdx >= 0 ? sRowIdx : (pRowIdx >= 0 ? pRowIdx : 0);
        const subRow = tableRows[checkIdx];
        if (!subRow) return false;
        const r0Cells = subRow.slice(1).filter(c => c !== undefined && c !== null && String(c).trim() !== "");
        if (r0Cells.length === 0) return false;
        const r0TextCount = r0Cells.filter(c => !isPureNumericString(c, config.dataDecSep, config.dataThousandSep)).length;
        const r0IsMostlyText = (r0TextCount / r0Cells.length) >= 0.5;
        
        const subsequentRows = tableRows.filter((r, idx) => idx !== pRowIdx && idx !== sRowIdx && Array.isArray(r) && r.slice(1).some(c => c && String(c).trim() !== ""));
        if (subsequentRows.length === 0) return false;
        const numSubsequent = subsequentRows.filter(r => {
          const cells = r.slice(1).filter(c => c && String(c).trim() !== "");
          const numCells = cells.filter(c => isPureNumericString(c, config.dataDecSep, config.dataThousandSep));
          return cells.length > 0 && (numCells.length / cells.length >= 0.5);
        }).length;
        return r0IsMostlyText && (numSubsequent / subsequentRows.length >= 0.5);
      }, [tableHeaders, tableRows, config.dataDecSep, config.dataThousandSep, config.hierarchyParentRow, config.hierarchySubRow]);

      const seriesList = useMemo(() => {
        if (config.chartType === "Bar") {
          const useRowMode = config.useHierarchy 
            ? config.hierarchySource === "rows" 
            : (isRowSeries || config.hierarchySource === "rows");

          if (useRowMode) {
            let pRowSetting = config.hierarchyParentRow ?? "header";
            let sRowSetting = config.hierarchySubRow ?? 0;
            if (pRowSetting === sRowSetting) {
              if (pRowSetting === "header") sRowSetting = 0;
              else sRowSetting = "header";
            }
            const parentRowIdx = pRowSetting === "header" ? -1 : (typeof pRowSetting === "number" ? pRowSetting : -1);
            const subRowIdx = sRowSetting === "header" ? -1 : (typeof sRowSetting === "number" ? sRowSetting : 0);
            const sColIdx = typeof config.hierarchySeriesCol === "number" ? config.hierarchySeriesCol : 0;
            const uniqueSeries = new Set();
            for (let r = 0; r < tableRows.length; r++) {
              if (r === parentRowIdx || r === subRowIdx) continue;
              const row = tableRows[r];
              if (Array.isArray(row)) {
                const name = String(row[sColIdx] || "").trim();
                if (name && !/^(totalt?|sum(ma)?|total|yhteens[aä])/i.test(name)) {
                  uniqueSeries.add(name);
                }
              }
            }
            const list = Array.from(uniqueSeries);
            if (list.length > 0) return list;
          } else if (config.useHierarchy) {
            // Kolumnbaserad hierarki: alla övriga kolumner blir serier automatiskt
            const pIdx = config.hierarchyParentCol ?? 0;
            let sIdx = config.hierarchySubCol ?? 1;
            if (pIdx === sIdx) {
              sIdx = pIdx === 0 ? 1 : 0;
            }
            const list = tableHeaders.filter((_, idx) => idx !== pIdx && idx !== sIdx);
            const uniqueList = Array.from(new Set(list));
            if (uniqueList.length > 0) return uniqueList;
          }
        }
        // Standard: alla kolumner utom kategorikolumnen är serier
        const catIdx = config.categoryColIndex ?? 0;
        const list = tableHeaders.filter((_, idx) => idx !== catIdx);
        const uniqueList = Array.from(new Set(list));
        return uniqueList.length > 0 ? uniqueList : ["Serie 1"];
      }, [tableHeaders, tableRows, config.useHierarchy, config.chartType, config.hierarchySource, config.hierarchyParentRow, config.hierarchySubRow, config.hierarchySeriesCol, config.hierarchyParentCol, config.hierarchySubCol, config.categoryColIndex, isRowSeries]);

      const pieCategories = useMemo(() => {
        const catIdx = config.categoryColIndex ?? 0;
        const seen = new Set();
        const cats = [];
        tableRows.forEach(r => {
          if (Array.isArray(r)) {
            const name = String(r[catIdx] || "").trim();
            if (name && !seen.has(name)) {
              seen.add(name);
              cats.push(name);
            }
          }
        });
        return cats.length > 0 ? cats : ["Kategori 1"];
      }, [tableRows, config.categoryColIndex]);

      const allAvailableCategories = useMemo(() => {
        const catIdx = config.categoryColIndex ?? 0;
        const seen = new Set();
        const cats = [];
        tableRows.forEach(r => {
          if (Array.isArray(r)) {
            const name = String(r[catIdx] || "").trim();
            if (name && !seen.has(name)) {
              seen.add(name);
              cats.push(name);
            }
          }
        });
        return cats.length > 0 ? cats : ["Kategori 1"];
      }, [tableRows, config.categoryColIndex]);

      const isPieByRow = config.chartType === "Pie" && (
        config.pieGrouping === "rows" || 
        (config.pieGrouping !== "columns" && seriesList.length > 1 && tableRows.length > 1)
      );

      const chartContainerHeight = useMemo(() => {
        if (config.chartType === "Pie") {
          const numPies = Math.max(1, isPieByRow ? tableRows.length : seriesList.length);
          const isMobile = cardWidth < 560;
          const pieCols = isMobile ? 1 : (numPies <= 4 ? numPies : (numPies <= 6 ? 3 : 4));
          const pieRowsCount = Math.ceil(numPies / pieCols);
          const singlePieH = config.chartHeight || 360;
          return pieRowsCount * singlePieH;
        }
        return config.chartHeight || 480;
      }, [config.chartType, config.chartHeight, config.pieGrouping, isPieByRow, seriesList.length, tableRows.length, cardWidth]);

      useEffect(() => {
        if (!userManuallyToggledLegend) {
          const count = config.chartType === "Pie"
            ? (isPieByRow ? seriesList.length : pieCategories.length)
            : seriesList.length;
          setConfig(prev => ({ ...prev, drawLegend: count > 1 }));
        }
      }, [seriesList.length, config.chartType, pieCategories.length, userManuallyToggledLegend, isPieByRow]);

      useEffect(() => {
        const items = config.chartType === "Pie" 
          ? (isPieByRow ? seriesList : pieCategories) 
          : seriesList;
        if (items.length === 0) return;
        const count = Math.min(Math.max(items.length, 2), 10);
        const palette = BRAND_SCALES[count] || BRAND_SCALES[10];
        setSeriesColors(prev => {
          const next = { ...prev };
          items.forEach((s, idx) => {
            if (!next[s]) {
              next[s] = palette[idx % palette.length];
            }
          });
          return next;
        });
      }, [seriesList, pieCategories, config.chartType, isPieByRow]);

      useEffect(() => {
        if (!config.userManuallySelectedTooltipCols) {
          const items = config.chartType === "Pie" 
            ? (isPieByRow ? seriesList : pieCategories) 
            : seriesList;
          setConfig(prev => ({
            ...prev,
            tooltipColumns: items
          }));
        }
      }, [seriesList, pieCategories, config.chartType, config.userManuallySelectedTooltipCols, isPieByRow]);

      useEffect(() => {
        if (!config.isTemplateCustomized) {
          const catHeader = tableHeaders[config.categoryColIndex ?? 0] || tableHeaders[0] || "Kategori";
          const activeCols = (config.tooltipColumns && config.tooltipColumns.length > 0)
            ? config.tooltipColumns
            : (config.chartType === "Pie" ? (isPieByRow ? seriesList : pieCategories) : seriesList);
          const parts = activeCols.map(c => `${c}: {${c}}`).join(" · ");
          const tmpl = `{${catHeader}}: ${parts}`;
          setConfig(prev => (prev.tooltipTemplate === tmpl ? prev : { ...prev, tooltipTemplate: tmpl }));
        }
      }, [tableHeaders, config.tooltipColumns, seriesList, pieCategories, config.chartType, config.isTemplateCustomized, config.categoryColIndex, isPieByRow]);

      useEffect(() => {
        let rawEncoded = null;
        try {
          const urlParams = new URLSearchParams(window.location.search);
          if (urlParams.has("view")) rawEncoded = urlParams.get("view");
          else if (urlParams.has("data")) rawEncoded = urlParams.get("data");
        } catch (e) {}

        if (!rawEncoded && window.location.hash) {
          const hash = window.location.hash;
          if (hash.startsWith("#view=")) rawEncoded = hash.replace("#view=", "");
          else if (hash.startsWith("#data=")) rawEncoded = hash.replace("#data=", "");
        }

        if (rawEncoded) {
          try {
            const parsed = decodeChartState(rawEncoded);
            if (parsed && typeof parsed === "object") {
              if (parsed.tableHeaders) setTableHeaders(parsed.tableHeaders);
              if (parsed.tableRows) setTableRows(parsed.tableRows);
              if (parsed.config) setConfig(parsed.config);
              if (parsed.seriesColors) setSeriesColors(parsed.seriesColors);
              setIsViewerMode(true);
            }
          } catch(e) {}
        }
      }, []);

      // Pang and Infogram protocol auto-resize for iframe CMS embeds
      useEffect(() => {
        if (!isViewerMode) return;
        let lastSentHeight = 0;

        const broadcastHeight = () => {
          const card = document.getElementById("editorial-graphic-card") || document.body;
          const rect = card.getBoundingClientRect();
          const height = Math.ceil(rect.height);

          if (Math.abs(height - lastSentHeight) < 2) return;
          lastSentHeight = height;

          try {
            window.parent.postMessage({ type: "pang-resize", height }, "*");
            if (window.top && window.top !== window.parent) {
              window.top.postMessage({ type: "pang-resize", height }, "*");
            }
            window.parent.postMessage(JSON.stringify({ src: window.location.href, context: "iframe.resize", height }), "*");
          } catch (e) {}
        };

        const timer = setTimeout(broadcastHeight, 60);
        const ro = new ResizeObserver(broadcastHeight);
        const target = document.getElementById("editorial-graphic-card") || document.body;
        ro.observe(target);

        return () => {
          clearTimeout(timer);
          ro.disconnect();
        };
      }, [isViewerMode, config, tableHeaders, tableRows, seriesColors, chartContainerHeight, cardWidth]);

      const syncToText = (headers, rows, overrideDelim = null) => {
        const activeDelim = overrideDelim || (config.importDelimiter && config.importDelimiter !== "auto" ? config.importDelimiter : null);
        setRawTextBuffer(serializeToCSV(headers, rows, activeDelim));
      };

      const applyParsedData = (matrix, originalSourceText = null) => {
        try {
          if (!matrix || !Array.isArray(matrix) || matrix.length === 0) return;
          const cleanMatrix = matrix
            .filter(r => r && Array.isArray(r) && r.some(c => c !== undefined && c !== null && String(c).trim() !== ""))
            .map(r => r.map(c => (c !== undefined && c !== null ? String(c).trim() : "")));

          if (cleanMatrix.length === 0) return;
          let matrixToUse = cleanMatrix;
          let detectedTitle = null;

          if (cleanMatrix.length >= 3 && cleanMatrix[0][0] !== "") {
            const row0Filled = cleanMatrix[0].filter(c => c !== "");
            const row1Filled = cleanMatrix[1].filter(c => c !== "");
            if (row0Filled.length === 1 && row1Filled.length >= 2) {
              detectedTitle = row0Filled[0];
              matrixToUse = cleanMatrix.slice(1);
            }
          }

          const rawHeaders = matrixToUse[0];
          let maxCols = Math.max(rawHeaders.length, ...matrixToUse.map(r => r.length));
          if (maxCols < 2) maxCols = 2;

          const headers = [];
          for (let c = 0; c < maxCols; c++) {
            let colName = String(rawHeaders[c] || "").trim();
            if (!colName) colName = c === 0 ? "Kategori" : `Kolumn ${c + 1}`;
            headers.push(colName);
          }

          let rawDataRows = matrixToUse.slice(1);
          if (rawDataRows.length === 0) rawDataRows = [new Array(headers.length).fill("")];

          const rows = rawDataRows.map(r => {
            const newRow = [];
            for (let c = 0; c < headers.length; c++) newRow.push(r[c] !== undefined && r[c] !== null ? String(r[c]).trim() : "");
            return newRow;
          });

          setTableHeaders(headers);
          setTableRows(rows);
          if (originalSourceText && typeof originalSourceText === "string" && originalSourceText.trim() !== "") {
            setRawTextBuffer(originalSourceText);
          } else syncToText(headers, rows);

          const seriesCols = headers.slice(1);
          const count = Math.min(Math.max(seriesCols.length, 2), 10);
          const palette = BRAND_SCALES[count] || BRAND_SCALES[10];

          const freshColors = {};
          seriesCols.forEach((s, idx) => {
            freshColors[s] = palette[idx % palette.length];
          });
          setSeriesColors(freshColors);
          setUserManuallyToggledLegend(false);

          setConfig(prev => ({
            ...prev,
            title: (detectedTitle && (prev.title === "Rubrik" || !prev.title)) ? detectedTitle : prev.title,
            drawLegend: seriesCols.length > 1,
            hiddenLegendItems: [],
            userManuallySelectedTooltipCols: false,
            tooltipColumns: seriesCols,
            useHierarchy: false,
            hierarchySource: "columns"
          }));

          // Detektera automatiskt om importerad/inklistrad data är radbaserad (tidy)
          if (headers.length >= 3 && headers.length <= 6 && rows.length >= 6) {
            const colDates = headers.map((h, c) => rows.filter(r => /^(\d{4}|[QqKk]\d|\d{4}[-/.]\d{1,2}|\d{1,2}[-/.]\d{1,2})/.test(String(r[c] || "").trim())).length);
            const colNums = headers.map((h, c) => rows.filter(r => isPureNumericString(String(r[c] || "").trim(), config.dataDecSep, config.dataThousandSep)).length);
            const distinctText = headers.map((h, c) => new Set(rows.map(r => String(r[c] || "").trim()).filter(Boolean)).size);

            const dateCol = colDates.findIndex(cnt => cnt >= rows.length * 0.4);
            const numericColsCount = colNums.filter((cnt, idx) => cnt >= rows.length * 0.65 && idx !== dateCol).length;

            let valCol = -1;
            for (let i = colNums.length - 1; i >= 0; i--) {
              if (colNums[i] >= rows.length * 0.65 && i !== dateCol) {
                valCol = i;
                break;
              }
            }
            const seriesCol = distinctText.findIndex((cnt, idx) => idx !== dateCol && idx !== valCol && cnt >= 2 && cnt <= Math.min(40, rows.length * 0.7));

            if (numericColsCount <= 2 && dateCol >= 0 && seriesCol >= 0 && valCol >= 0 && dateCol !== seriesCol && seriesCol !== valCol) {
              setDetectedTidyInfo({
                dateColName: headers[dateCol] || "År/Datum",
                entityColName: headers[seriesCol] || "Entitet",
                valColName: headers[valCol] || "Värde",
                pivotConfig: { catCol: dateCol, seriesCol, valCol }
              });
              setDismissedTidyBanner(false);
            } else {
              setDetectedTidyInfo(null);
            }
          } else {
            setDetectedTidyInfo(null);
          }
        } catch (err) { console.error("Error in applyParsedData:", err); }
      };

      const parseTextToGrid = (text) => {
        if (!text || !text.trim()) return;
        try {
          const matrix = parseCSV(text, config.importDelimiter, config.skipRows);
          if (!matrix || matrix.length === 0) return;
          applyParsedData(matrix, text);
          setToast("Tabelldata uppdaterad!");
          setTimeout(() => setToast(""), 2000);
        } catch (err) {}
      };

      const handleTranspose = () => {
        if (tableHeaders.length === 0 || tableRows.length === 0) return;
        const matrix = [tableHeaders, ...tableRows];
        const rowCount = matrix.length;
        const colCount = Math.max(...matrix.map(r => r.length));
        const transposed = [];
        for (let c = 0; c < colCount; c++) {
          const newRow = [];
          for (let r = 0; r < rowCount; r++) newRow.push(matrix[r][c] || "");
          transposed.push(newRow);
        }
        applyParsedData(transposed);
        setToast("Rader och kolumner växlade!");
        setTimeout(() => setToast(""), 2000);
      };

      const handleClearData = () => {
        const defaultHeaders = ["Kolumn 1", "Kolumn 2"];
        const defaultRows = [["", ""]];
        setTableHeaders(defaultHeaders);
        setTableRows(defaultRows);
        setRawTextBuffer("");
        setSeriesColors({ "Serie 1": "#e4590f" });
        setToast("Diagrammet tömt!");
        setTimeout(() => setToast(""), 2000);
      };
        
        const handleSortColumn = (cIdx, dir = "asc") => {
  const activeRows = tableRows.filter(r => Array.isArray(r) && r.some(c => c && String(c).trim() !== ""));
  const emptyRows = tableRows.filter(r => !Array.isArray(r) || !r.some(c => c && String(c).trim() !== ""));

  activeRows.sort((a, b) => {
    const valA = a[cIdx];
    const valB = b[cIdx];
    const dateA = tryParseDate(valA, config.datePart1, config.datePart2, config.datePart3);
    const dateB = tryParseDate(valB, config.datePart1, config.datePart2, config.datePart3);

    let diff = 0;
    if (dateA && dateB) {
      diff = dateA.date.getTime() - dateB.date.getTime();
    } else if (isPureNumericString(valA, config.dataDecSep, config.dataThousandSep) && isPureNumericString(valB, config.dataDecSep, config.dataThousandSep)) {
      diff = parseVal(valA, config.dataDecSep, config.dataThousandSep) - parseVal(valB, config.dataDecSep, config.dataThousandSep);
    } else {
      diff = String(valA || "").localeCompare(String(valB || ""), "sv", { numeric: true });
    }
    return dir === "desc" ? -diff : diff;
  });

  const sorted = [...activeRows, ...emptyRows];
  setTableRows(sorted);
  syncToText(tableHeaders, sorted);
  setConfig(prev => ({ ...prev, dataSortOrder: "original" }));
  setToast(dir === "desc" ? "Sorterat (fallande)" : "Sorterat (stigande)");
  setTimeout(() => setToast(""), 1500);
};

      // --- GRAFAEL SMART AUTO-GRAPH & TIDY DATA DETECTOR ---
      const autoAnalyzeAndBuildChart = (customMatrix = null, customText = null) => {
        let matrix = null;
        if (customMatrix && Array.isArray(customMatrix) && customMatrix.length >= 2) {
          matrix = customMatrix;
        } else if (customText && typeof customText === "string" && customText.trim()) {
          matrix = parseCSV(customText, config.importDelimiter, config.skipRows);
        } else {
          matrix = [tableHeaders, ...tableRows.filter(r => Array.isArray(r) && r.some(c => c && String(c).trim() !== ""))];
        }

        if (!matrix || matrix.length < 2) {
          setToast("Klistra in eller importera data först!");
          setTimeout(() => setToast(""), 2500);
          return;
        }

        // 1. Rensa metadata & hämta Rubrik, Ingress / Enhet och Källa om de finns överst
        let cleanMatrix = matrix.filter(r => Array.isArray(r) && r.some(c => c !== undefined && c !== null && String(c).trim() !== ""));
        if (cleanMatrix.length < 2) return;

        let detectedTitle = null;
        let detectedIngress = null;
        let detectedSource = null;

        // Kontrollera om rad 0 har tomt första fält i en tabell (t.ex. vid saknad kolumnrubrik för X-axeln)
        if (cleanMatrix.length >= 2 && cleanMatrix[0].length >= 2 && !String(cleanMatrix[0][0] || "").trim()) {
          const isAllYears = cleanMatrix.slice(1).every(r => /^\d{4}$/.test(String(r[0] || "").trim()));
          cleanMatrix[0][0] = isAllYears ? "År" : "Kategori";
        }

        // Kontrollera om rad 0 eller rad 1 är en ren metadatarad ovanför tabellen (1 kolumn i bredd)
        for (let iter = 0; iter < 3; iter++) {
          if (cleanMatrix.length < 3) break;
          const r0Filled = cleanMatrix[0].filter(c => c !== undefined && c !== null && String(c).trim() !== "");
          const r1Filled = cleanMatrix[1].filter(c => c !== undefined && c !== null && String(c).trim() !== "");
          if (r0Filled.length === 1 && r1Filled.length >= 2 && cleanMatrix[0].length === 1 && cleanMatrix[0][0]) {
            const txt = String(r0Filled[0]).trim();
            const lower = txt.toLowerCase();
            if (/^(källa|källor|source|lähde):/i.test(lower)) {
              detectedSource = txt.replace(/^(källa|källor|source|lähde):\s*/i, "").trim();
              cleanMatrix = cleanMatrix.slice(1);
            } else if (lower.includes("procent") || lower.includes("miljon") || lower.includes("miljard") ||
                       lower.includes("euro") || lower.includes("antal") || lower.includes("ton") || lower.includes("index")) {
              detectedIngress = detectedIngress || txt;
              cleanMatrix = cleanMatrix.slice(1);
            } else if (!detectedTitle) {
              detectedTitle = txt;
              cleanMatrix = cleanMatrix.slice(1);
            } else {
              break;
            }
          } else {
            break;
          }
        }

        const rawHeaders = cleanMatrix[0];
        const dataRows = cleanMatrix.slice(1);
        const M = rawHeaders.length;
        const N = dataRows.length;

        if (M < 2 || N === 0) return;

        // Datumidentifiering
const isDateStr = (s, h = "") => {
  if (!s) return false;
  const str = String(s).trim();

  // Rent 4-siffrigt år
  if (/^\d{4}$/.test(str)) {
    const yr = parseInt(str, 10);
    return yr >= 1800 && yr <= 2150;
  }

  // Kvartal (t.ex. 2024 Q1)
  if (/^(\d{4})[\s\-/. _]*[QqKk](\d)$/.test(str) || /^[QqKk](\d)[\s\-/. _]*(\d{4})$/.test(str)) {
    const yr = parseInt(str.match(/\d{4}/)?.[0] || "0", 10);
    return yr >= 1800 && yr <= 2150;
  }

  // YYYY-MM eller YYYY-MM-DD (kräv rimligt år 1800-2150 och månad 1-12)
  let m = str.match(/^(\d{4})[-_/.](\d{1,2})(?:[-_/.](\d{1,2}))?$/);
  if (m) {
    const yr = parseInt(m[1], 10);
    const mo = parseInt(m[2], 10);
    const da = m[3] ? parseInt(m[3], 10) : null;
    return yr >= 1800 && yr <= 2150 && mo >= 1 && mo <= 12 && (da === null || (da >= 1 && da <= 31));
  }

  // DD-MM-YYYY eller MM-DD-YYYY
  m = str.match(/^(\d{1,2})[-_/.](\d{1,2})[-_/.](\d{2,4})$/);
  if (m) {
    let yr = parseInt(m[3], 10);
    if (yr < 100) yr += (yr >= 50 ? 1900 : 2000);
    return yr >= 1800 && yr <= 2150;
  }

  // Månadsnamn med ordgräns (\b) så att ord som "Denmark" inte matchar "mar"
  if (/\b(jan|feb|febr|mars|mar|april|apr|maj|may|juni|jun|juli|jul|aug|augusti|sep|sept|september|okt|oktober|oct|nov|november|dec|december)\b/i.test(str)) {
    return true;
  }

  if (/^(datum|date|aika|tid|år|year|vuosi|julkaistu|published)/i.test(h) && /^\d{1,2}[-/.]\d{1,2}$/.test(str)) {
    return true;
  }

  return false;
};

const isFullDateStr = (s) => {
  if (!s) return false;
  const str = String(s).trim();
  let m = str.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/);
  if (m) {
    const yr = parseInt(m[1], 10), mo = parseInt(m[2], 10), da = parseInt(m[3], 10);
    return yr >= 1800 && yr <= 2150 && mo >= 1 && mo <= 12 && da >= 1 && da <= 31;
  }
  return false;
};

        // Analysera samtliga kolumner
        let globalMax = -Infinity;
        let hasAnyDecimals = false;
        const colStats = [];

        for (let c = 0; c < M; c++) {
          const hName = String(rawHeaders[c] || "").trim();
          let filledCount = 0;
          let dateCount = 0;
          let fullDateCount = 0;
          let numCount = 0;
          const nums = [];
          const distinctVals = new Set();
          const valLens = [];

          dataRows.forEach(r => {
            const rawCell = r[c];
            if (rawCell !== undefined && rawCell !== null) {
              const cell = String(rawCell).trim();
              if (cell !== "") {
                filledCount++;
                distinctVals.add(cell);
                valLens.push(cell.length);
                if (isDateStr(cell, hName)) {
                  dateCount++;
                  if (isFullDateStr(cell)) fullDateCount++;
                }
                if (isPureNumericString(cell, config.dataDecSep, config.dataThousandSep)) {
                  const num = parseVal(cell, config.dataDecSep, config.dataThousandSep);
                  if (!isNaN(num)) {
                    numCount++;
                    nums.push(num);
                    if (num > globalMax) globalMax = num;
                    if (cell.includes(".") || cell.includes(",")) hasAnyDecimals = true;
                  }
                }
              }
            }
          });

          nums.sort((a, b) => a - b);
          const min = nums.length ? nums[0] : 0;
          const max = nums.length ? nums[nums.length - 1] : 0;
          const median = nums.length ? nums[Math.floor(nums.length / 2)] : 0;

          const isMetadataHeader = /^(poll_type|poll_name|poll_start|poll_end|answered|local_election|is_election|method|source|källa|lähde|type|tyyppi|status|id|identifier|koodi|kod|code|key|index|nr|no|notes|kommentar|url|link)$/i.test(hName);
          const isSampleSizeHeader = /^(respondents|vastaajat|urval|sample|sample_size|antal_svar|paino|weight|n|otanta|havainnot)$/i.test(hName);
          const isMarginHeader = /^(error_margin|virhemarginaali|felmarginal|margin_of_error|ci|confidence)$/i.test(hName);

          let dateScore = 0;
          if (filledCount >= 2 && (dateCount / filledCount) >= 0.35) {
            dateScore = (filledCount / N) * (dateCount / filledCount) * 100;
            if (fullDateCount / filledCount >= 0.7) dateScore += 35; // Hög bonus för fullständiga datum
            if (/^(published|julkaistu|datum|date|aika|tid|år|year|vuosi|kvartal|period)/i.test(hName)) dateScore += 30;
            if (/^(start|end|alku|loppu)/i.test(hName) && filledCount < N * 0.8) dateScore -= 25;
          }

          const isDate = dateScore >= 20 || ((dateCount / Math.max(1, filledCount) >= 0.5) && !isMetadataHeader);
          const isNum = (numCount / Math.max(1, filledCount) >= 0.65) && !/^(år|year|vuosi|code|koodi|kod|iso)/i.test(hName);
          const avgLen = valLens.reduce((a, b) => a + b, 0) / (valLens.length || 1);
          const isCode = !isNum && !isDate && distinctVals.size > 1 && distinctVals.size <= N * 0.5 && (avgLen <= 4.5 || /^(code|koodi|kod|iso)/i.test(hName));

          colStats.push({
            cIdx: c,
            name: hName,
            filledCount,
            distinctCount: distinctVals.size,
            distinctVals: Array.from(distinctVals),
            dateCount,
            fullDateCount,
            dateScore,
            numCount,
            nums,
            min,
            max,
            median,
            isDate,
            isNum,
            isCode,
            isMetadataHeader,
            isSampleSizeHeader,
            isMarginHeader
          });
        }

        // Hitta den absolut bästa datum-/tids-kolumnen
        const dateCandidates = [...colStats].filter(c => c.dateScore > 0).sort((a, b) => b.dateScore - a.dateScore);
        const bestDateCol = dateCandidates.length > 0 ? dateCandidates[0] : null;

        // Kontrollera om tabellen är genuint radbaserad (Tidy / Long Data)
        // Kriterier för tidy data:
        // - Få kolumner (M <= 6)
        // - Max 2 numeriska kolumner (t.ex. År och Värde)
        // - En entitetskolumn med repeterande text (distinctCount <= 50)
        const numericColsCount = colStats.filter(c => c.isNum && (!bestDateCol || c.cIdx !== bestDateCol.cIdx)).length;
        let isTidy = false;
        let tidyDateCol = -1;
        let tidySeriesCol = -1;
        let tidyValCol = -1;

        if (M >= 3 && M <= 6 && N >= 6 && numericColsCount <= 2 && bestDateCol) {
          tidyDateCol = bestDateCol.cIdx;
          const numCands = colStats.filter(c => c.isNum && c.cIdx !== tidyDateCol);
          if (numCands.length > 0) tidyValCol = numCands[numCands.length - 1].cIdx;

          const textCands = colStats.filter(c => !c.isNum && !c.isDate && c.distinctCount >= 2 && c.distinctCount <= Math.min(50, N * 0.7));
          if (textCands.length > 0) {
            const nonCode = textCands.filter(c => !c.isCode);
            tidySeriesCol = (nonCode.length > 0 ? nonCode[0] : textCands[0]).cIdx;
          }
          isTidy = (tidyDateCol >= 0 && tidySeriesCol >= 0 && tidyValCol >= 0 && tidyDateCol !== tidySeriesCol && tidySeriesCol !== tidyValCol);
        }

        // Kontrollera om tabellen har 2 rad-nivåer av rubriker (Hierarkisk radbaserad tabell)
        let isHierarchicalRows = false;
        if (M >= 3 && N >= 2) {
          const r0Cats = rawHeaders.slice(1).map(c => String(c || "").trim());
          const r1Subs = dataRows[0].slice(1).map(c => String(c || "").trim());
          const r0HasRepeats = new Set(r0Cats).size < r0Cats.length;
          const r0AllYearsOrShort = r0Cats.every(c => isDateStr(c, "") || c.length <= 14);
          const r1MostlyText = r1Subs.filter(c => c && !isPureNumericString(c, config.dataDecSep, config.dataThousandSep)).length / (r1Subs.length || 1) >= 0.7;

          const seriesRowsCheck = dataRows.slice(1).filter(r => {
            const cells = r.slice(1).filter(c => c && String(c).trim() !== "");
            const numCells = cells.filter(c => isPureNumericString(c, config.dataDecSep, config.dataThousandSep));
            return cells.length > 0 && (numCells.length / cells.length >= 0.65);
          });

          if (r0AllYearsOrShort && r0HasRepeats && r1MostlyText && seriesRowsCheck.length >= 1) {
  isHierarchicalRows = true;
}
        }

        // Kontrollera om år ligger i rubrikraden (behöver växlas / transponeras)
        let needsTranspose = false;
        if (!isHierarchicalRows && !isTidy && M >= 4 && N >= 1) {
          const yearHeaders = rawHeaders.slice(1).filter(h => isDateStr(h, ""));
          if (yearHeaders.length / (M - 1) >= 0.75 && (!bestDateCol || bestDateCol.cIdx !== 0)) {
            needsTranspose = true;
          }
        }

        let finalHeaders = [];
        let finalRows = [];
        let summaryType = "";

        if (isHierarchicalRows) {
          finalHeaders = rawHeaders;
          finalRows = dataRows;
          detectedTitle = detectedTitle || "Rubrik";
          summaryType = "Hierarkisk tabell identifierades -> Grupperade staplar";
        } else if (isTidy) {
          // --- PIVOTERA RADBASERAD DATA AUTOMATISKT ---
          const distinctCats = [];
          const seenCats = new Set();
          const distinctSeries = [];
          const seenSeries = new Set();
          const dataMap = new Map();

          dataRows.forEach(r => {
            const cat = String(r[tidyDateCol] || "").trim();
            const series = String(r[tidySeriesCol] || "").trim();
            const val = String(r[tidyValCol] || "").trim();
            if (!cat || !series) return;
            if (!seenCats.has(cat)) { seenCats.add(cat); distinctCats.push(cat); }
            if (!seenSeries.has(series)) { seenSeries.add(series); distinctSeries.push(series); }
            dataMap.set(`${cat}:::${series}`, val);
          });

          // Kronologisk sortering
          distinctCats.sort((a, b) => {
            const dA = tryParseDate(a);
            const dB = tryParseDate(b);
            if (dA && dB) return dA.date.getTime() - dB.date.getTime();
            const nA = parseFloat(a);
            const nB = parseFloat(b);
            if (!isNaN(nA) && !isNaN(nB)) return nA - nB;
            return a.localeCompare(b);
          });

          let chosenSeries = distinctSeries;
          if (distinctSeries.length > 8) {
            const seriesTotals = distinctSeries.map(s => {
              let sum = 0;
              distinctCats.forEach(cat => {
                const v = parseVal(dataMap.get(`${cat}:::${s}`), config.dataDecSep, config.dataThousandSep);
                sum += Math.abs(v);
              });
              return { s, sum };
            });
            seriesTotals.sort((a, b) => b.sum - a.sum);
            chosenSeries = seriesTotals.slice(0, 8).map(x => x.s);
          }

          finalHeaders = [rawHeaders[tidyDateCol] || "År", ...chosenSeries];
          finalRows = distinctCats.map(cat => {
            const row = [cat];
            chosenSeries.forEach(s => {
              row.push(dataMap.get(`${cat}:::${s}`) || "");
            });
            return row;
          });

          detectedTitle = detectedTitle || rawHeaders[tidyValCol] || rawHeaders[tidySeriesCol] || "Diagram";
          summaryType = "Radbaserad data pivoterades";
        } else if (needsTranspose) {
          // --- VÄXLA RADER OCH KOLUMNER ---
          const matrixToTranspose = [rawHeaders, ...dataRows];
          const rowCount = matrixToTranspose.length;
          const colCount = Math.max(...matrixToTranspose.map(r => r.length));
          const transposed = [];
          for (let c = 0; c < colCount; c++) {
            const newRow = [];
            for (let r = 0; r < rowCount; r++) newRow.push(matrixToTranspose[r][c] || "");
            transposed.push(newRow);
          }
          finalHeaders = transposed[0].map((h, i) => i === 0 ? "År" : (h || `Serie ${i}`));
          finalRows = transposed.slice(1);
          summaryType = "Tidsserie i kolumner växlades till rader";
        } else {
          // --- BRED TABELL (Wide Table, Partimätningar, Undersökningar, etc.) ---
          // 1. Välj den bästa kategorikolumnen (X-axeln)
          let catColIdx = 0;
          if (bestDateCol && bestDateCol.dateScore >= 20) {
            catColIdx = bestDateCol.cIdx;
          } else {
            // Leta efter textkolumn med kategorier/namn
            const textCands = colStats.filter(c => !c.isNum && c.filledCount >= 2 && !c.isMetadataHeader);
            if (textCands.length > 0) catColIdx = textCands[0].cIdx;
          }

          // 2. Identifiera vilka kolumner som är faktiska mätserier (exkludera metadata, urvalsstorlek, felmarginal)
          const metricCols = colStats.filter(c => {
            if (c.cIdx === catColIdx) return false;
            if (c.isMetadataHeader) return false;
            if (c.isSampleSizeHeader) return false;
            if (c.isMarginHeader) return false;
            if (c.numCount < 2) return false;
            // Skalavvikelse: Om de flesta serier ligger under 100 (t.ex. procent), filtrera bort tal > 200 (t.ex. antal svarande)
            if (c.median > 200 && c.min > 100) return false;
            return true;
          });

          const activeSeriesCols = metricCols.length > 0 ? metricCols : colStats.filter(c => c.cIdx !== catColIdx && c.numCount >= 1);

          finalHeaders = [rawHeaders[catColIdx] || (bestDateCol ? "Datum" : "Kategori"), ...activeSeriesCols.map(c => c.name)];
          finalRows = [];

          dataRows.forEach(r => {
            const catVal = r[catColIdx] !== undefined && r[catColIdx] !== null ? String(r[catColIdx]).trim() : "";
            if (!catVal) return; // Hoppa över tomma rader
            const row = [catVal];
            activeSeriesCols.forEach(c => {
              const cell = r[c.cIdx];
              row.push(cell !== undefined && cell !== null ? String(cell).trim() : "");
            });
            finalRows.push(row);
          });

          // Kronologisk sortering om det är datum
          if (bestDateCol && bestDateCol.cIdx === catColIdx) {
            finalRows.sort((a, b) => {
              const dA = tryParseDate(a[0]);
              const dB = tryParseDate(b[0]);
              if (dA && dB) return dA.date.getTime() - dB.date.getTime();
              const nA = parseFloat(a[0]);
              const nB = parseFloat(b[0]);
              if (!isNaN(nA) && !isNaN(nB)) return nA - nB;
              return String(a[0]).localeCompare(String(b[0]));
            });
          }

          summaryType = "Tabell strukturerades & analyserades";
        }

        // 4. Välj bästa diagramtyp och presentationsinställningar
        const numDataRows = finalRows.length;
        const numSeriesCols = finalHeaders.length - 1;

        let cat0DateCount = 0;
        finalRows.forEach(r => {
          if (isDateStr(r[0])) cat0DateCount++;
        });
        const isTimeSeq = (cat0DateCount / Math.max(1, numDataRows)) >= 0.5;

        let newChartType = "Bar";
        let newBarOrientation = "Vertical";
        let newShowValueLabels = true;
        let newDrawLineValues = false;
        let newDrawYLabels = false;
        let newYTickStyle = "None";
        let newGridLineStyle = "Dashed";
        let newIsDonut = false;
        let newShowPct = false;

        if (isHierarchicalRows) {
          newChartType = "Bar";
          newBarOrientation = "Vertical";
          newShowValueLabels = false;
          newDrawYLabels = true;
          newYTickStyle = "Full Grid";
          newGridLineStyle = "Solid";
        } else if (isTimeSeq && numDataRows >= 5) {
          // Tidsserie med >= 5 punkter -> Linjediagram
          newChartType = "Line";
          newShowValueLabels = false;
          newDrawLineValues = false;
          newDrawYLabels = true;
          newYTickStyle = "Full Grid";
          newGridLineStyle = "Solid";
          summaryType += " -> Linjediagram";
        } else if (numSeriesCols === 1 && numDataRows >= 2 && numDataRows <= 7 && (
          (detectedIngress && detectedIngress.toLowerCase().includes("procent")) ||
          (detectedTitle && detectedTitle.toLowerCase().includes("andel")) ||
          (finalHeaders[1] && finalHeaders[1].toLowerCase().includes("%"))
        )) {
          // Procentandelar / fördelning -> Donut
          newChartType = "Pie";
          newIsDonut = true;
          newShowPct = true;
          newShowValueLabels = true;
          summaryType += " -> Donutdiagram";
        } else if (numDataRows >= 8 || finalRows.some(r => String(r[0] || "").length > 12)) {
          // Många kategorier eller långa namn -> Liggande staplar
          newChartType = "Bar";
          newBarOrientation = "Horizontal";
          newShowValueLabels = true;
          summaryType += " -> Liggande staplar";
        } else {
          // Standard stående staplar
          newChartType = "Bar";
          newBarOrientation = "Vertical";
          newShowValueLabels = true;
          summaryType += " -> Stående staplar";
        }

        // 5. Talskalning & Enheter
        let newValueDivisor = 1;
        let newValueSuffix = "";
        if (globalMax >= 1000000000) {
          newValueDivisor = 1000000000;
          newValueSuffix = " mdr";
          detectedIngress = detectedIngress || "Miljarder";
        } else if (globalMax >= 1000000) {
          newValueDivisor = 1000000;
          newValueSuffix = " mn";
          detectedIngress = detectedIngress || "Miljoner";
        } else if (globalMax <= 100 && (
          (detectedIngress && detectedIngress.toLowerCase().includes("procent")) ||
          (finalHeaders[1] && finalHeaders[1].toLowerCase().includes("%"))
        )) {
          newValueSuffix = " %";
        }

        // 6. Decimaler
        const newValDecimals = hasAnyDecimals ? "1" : "0";

        // 7. Färger för serier
        const seriesCols = finalHeaders.slice(1);
        const count = Math.min(Math.max(seriesCols.length, 2), 10);
        const palette = BRAND_SCALES[count] || BRAND_SCALES[10];
        const freshColors = {};
        if (isHierarchicalRows) {
          dataRows.slice(1).forEach((r, idx) => {
            const sName = String(r[0] || "").trim();
            if (sName && !/^yhteens[aä]/i.test(sName) && !/^totalt?$/i.test(sName) && !/^sum(ma)?$/i.test(sName)) {
              freshColors[sName] = BRAND_SWATCHES[idx % BRAND_SWATCHES.length];
            }
          });
        } else {
          seriesCols.forEach((s, idx) => {
            freshColors[s] = palette[idx % palette.length];
          });
        }

        // 8. Applicera uppdaterat tillstånd
        setTableHeaders(finalHeaders);
        setTableRows(finalRows);
        syncToText(finalHeaders, finalRows);
        setSeriesColors(freshColors);
        setUserManuallyToggledLegend(false);

        // Källidentifiering om det nämns i datan
        let finalSource = config.source || "";
        if (detectedSource) {
          finalSource = detectedSource;
        } else if (!finalSource) {
          const rawJoined = matrix.map(r => r.join(" ")).join(" ").toLowerCase();
          if (rawJoined.includes("statistikcentralen") || rawJoined.includes("tilastokeskus")) {
            finalSource = "Statistikcentralen";
          } else if (rawJoined.includes("eurostat")) {
            finalSource = "Eurostat";
          } else if (rawJoined.includes("our world in data")) {
            finalSource = "Our World in Data";
          }
        }

        // Beräkna effektivt datamax för att säkerställa att automatiken anpassar Y-axelns maxhöjd
        let effectiveDataMax = 0;
        let effectiveDataMin = 0;
        if (isHierarchicalRows) {
          for (let c = 1; c < M; c++) {
            let colSum = 0;
            dataRows.slice(1).forEach(r => {
              const sName = String(r[0] || "").trim();
              if (!/^yhteens[aä]/i.test(sName) && !/^totalt?$/i.test(sName) && !/^sum(ma)?$/i.test(sName)) {
                const v = parseVal(r[c], config.dataDecSep, config.dataThousandSep);
                if (!isNaN(v)) {
                  if (v > 0) colSum += v;
                  if (v < effectiveDataMin) effectiveDataMin = v;
                }
              }
            });
            if (colSum > effectiveDataMax) effectiveDataMax = colSum;
          }
        } else {
          finalRows.forEach(r => {
            for (let c = 1; c < finalHeaders.length; c++) {
              const v = parseVal(r[c], config.dataDecSep, config.dataThousandSep) / newValueDivisor;
              if (!isNaN(v)) {
                if (v > effectiveDataMax) effectiveDataMax = v;
                if (v < effectiveDataMin) effectiveDataMin = v;
              }
            }
          });
        }
        if (effectiveDataMin < 0 && effectiveDataMax <= 0) {
          effectiveDataMax = 0;
        } else if (effectiveDataMax === 0 && globalMax > -Infinity && globalMax > 0) {
          effectiveDataMax = globalMax / newValueDivisor;
        }

        const updatedConfig = {
          ...config,
          title: (detectedTitle && (config.title === "Rubrik" || !config.title)) ? detectedTitle : (detectedTitle || config.title),
          ingress: detectedIngress || config.ingress || "",
          source: finalSource,
          chartType: newChartType,
          barOrientation: newBarOrientation,
          showValueLabels: newShowValueLabels,
          drawLineValues: newDrawLineValues,
          drawYLabels: newDrawYLabels,
          yTickStyle: newYTickStyle,
          gridLineStyle: newGridLineStyle,
          yBaseline: true,
          isDonut: newIsDonut,
          showPct: newShowPct,
          valueDivisor: newValueDivisor,
          valueSuffix: newValueSuffix,
          valDecimals: newValDecimals,
          popupDateFormat: "full_readable",
          drawLegend: isHierarchicalRows ? true : (seriesCols.length > 1),
          hiddenLegendItems: [],
          dataSortOrder: isTimeSeq ? "chronological" : "original",
          userManuallySelectedTooltipCols: false,
          tooltipColumns: seriesCols,
          useHierarchy: isHierarchicalRows ? true : false,
          hierarchySource: isHierarchicalRows ? "rows" : "columns",
          hierarchyParentRow: isHierarchicalRows ? "header" : config.hierarchyParentRow,
          hierarchySubRow: isHierarchicalRows ? 0 : config.hierarchySubRow,
          hierarchySeriesCol: isHierarchicalRows ? 0 : config.hierarchySeriesCol,
          isStacked: isHierarchicalRows ? true : config.isStacked,
          showStackedTotal: false,
          barWidthPct: 92,
          // Nollställ och anpassa Y-axeln automatiskt efter den nya datan så gamla manuella maxgränser inte klipper bort grafen
          customYRange: false,
          customMinY: effectiveDataMin < 0 ? Math.floor(effectiveDataMin * 1.05) : 0,
          customMaxY: effectiveDataMax > 0 ? Math.ceil(effectiveDataMax <= 10 ? effectiveDataMax * 1.2 : effectiveDataMax * 1.1) : 0,
          yScaleRounding: "Auto"
        };

        setConfig(updatedConfig);

        // Skapa ögonblicklig ångra-punkt
        commitSnapshot({
          tableHeaders: finalHeaders,
          tableRows: finalRows,
          config: updatedConfig,
          seriesColors: freshColors
        });

        setShowPivotUI(false);
        setDetectedTidyInfo(null);
        setToast(`✨ ${summaryType}!`);
        setTimeout(() => setToast(""), 3000);
      };

      // Tidy (long) to wide pivot engine
      const executePivot = () => {
        const catIdx = pivotConfig.catCol;
        const seriesIdx = pivotConfig.seriesCol;
        const valIdx = pivotConfig.valCol;

        if (catIdx === seriesIdx) {
          setToast("Kategori och Serie måste vara olika kolumner!");
          setTimeout(() => setToast(""), 2500);
          return;
        }

        const distinctCats = [];
        const seenCats = new Set();
        const distinctSeries = [];
        const seenSeries = new Set();
        const dataMap = new Map();

        tableRows.forEach(r => {
          if (!Array.isArray(r)) return;
          const cat = String(r[catIdx] || "").trim();
          const series = String(r[seriesIdx] || "").trim();
          const val = String(r[valIdx] || "").trim();

          if (!cat || !series) return;

          if (!seenCats.has(cat)) {
            seenCats.add(cat);
            distinctCats.push(cat);
          }
          if (!seenSeries.has(series)) {
            seenSeries.add(series);
            distinctSeries.push(series);
          }
          dataMap.set(`${cat}:::${series}`, val);
        });

        if (distinctCats.length === 0 || distinctSeries.length === 0) {
          setToast("Ingen data hittades att pivotera.");
          setTimeout(() => setToast(""), 2500);
          return;
        }

        // Chronological sort if categories are dates/years
        distinctCats.sort((a, b) => {
          const dA = tryParseDate(a);
          const dB = tryParseDate(b);
          if (dA && dB) return dA.date.getTime() - dB.date.getTime();
          const nA = parseFloat(a);
          const nB = parseFloat(b);
          if (!isNaN(nA) && !isNaN(nB)) return nA - nB;
          return a.localeCompare(b);
        });

        const newHeaders = [tableHeaders[catIdx] || "Kategori", ...distinctSeries];
        const newRows = distinctCats.map(cat => {
          const row = [cat];
          distinctSeries.forEach(s => {
            row.push(dataMap.get(`${cat}:::${s}`) || "");
          });
          return row;
        });

        applyParsedData([newHeaders, ...newRows]);
        setShowPivotUI(false);
        setToast("Data pivoterad!");
        setTimeout(() => setToast(""), 2500);
      };

      const handleFileUpload = async (e) => {
        const file = e.target.files?.[0];
        if (!file) return;
        try {
          const data = await file.arrayBuffer();
          if (/\.(xlsx|xls|xlsb)$/i.test(file.name) && XLSX) {
            try {
              const workbook = XLSX.read(data, { type: "array", raw: false });
              const sheet = workbook.Sheets[workbook.SheetNames[0]];
              let aoa = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "", raw: false });
              if (config.skipRows > 0 && config.skipRows < aoa.length) aoa = aoa.slice(config.skipRows);
              if (aoa && aoa.length > 0) {
                applyParsedData(aoa);
                setToast("Excel-fil importerad!");
                setTimeout(() => setToast(""), 2500);
                return;
              }
            } catch (xlsxErr) {}
          }
          let text = "";
          try { text = new TextDecoder("utf-8", { fatal: true }).decode(data); } catch { text = await file.text(); }
          const matrix = parseCSV(text, config.importDelimiter, config.skipRows);
          if (matrix && matrix.length > 0) {
            applyParsedData(matrix, text);
            setToast("Fil importerad!");
            setTimeout(() => setToast(""), 2500);
          }
        } catch (err) {} finally { e.target.value = ""; }
      };

      const handleCellChange = (rowIndex, colIndex, val) => {
        const updated = tableRows.map(r => [...r]);
        updated[rowIndex][colIndex] = val;
        if (rowIndex === updated.length - 1 && val.trim() !== "") updated.push(new Array(tableHeaders.length).fill(""));
        setTableRows(updated);
        syncToText(tableHeaders, updated);
      };

      const handleHeaderChange = (colIndex, val) => {
        const updatedHeaders = [...tableHeaders];
        updatedHeaders[colIndex] = val;
        if (colIndex === updatedHeaders.length - 1 && val.trim() !== "") {
          updatedHeaders.push(`Serie ${updatedHeaders.length}`);
          setTableRows(prev => prev.map(r => [...r, ""]));
        }
        setTableHeaders(updatedHeaders);
        syncToText(updatedHeaders, tableRows);
      };

      const deleteRow = (rIdx) => {
        if (tableRows.length <= 1) return;
        const filtered = tableRows.filter((_, i) => i !== rIdx);
        setTableRows(filtered);
        syncToText(tableHeaders, filtered);
      };

      const deleteCol = (cIdx) => {
        if (tableHeaders.length <= 1) return;
        const newHeaders = tableHeaders.filter((_, i) => i !== cIdx);
        const newRows = tableRows.map(r => Array.isArray(r) ? r.filter((_, i) => i !== cIdx) : []);
        setTableHeaders(newHeaders);
        setTableRows(newRows);
        syncToText(newHeaders, newRows);
      };

      const moveSeries = (index, dir) => {
        const newIndex = index + dir;
        if (newIndex < 0 || newIndex >= seriesList.length) return;
        const s1 = String(seriesList[index] || "");
        const s2 = String(seriesList[newIndex] || "");
        const col1 = tableHeaders.indexOf(s1);
        const col2 = tableHeaders.indexOf(s2);
        if (col1 < 0 || col2 < 0) return;
        const newHeaders = [...tableHeaders];
        newHeaders[col1] = s2; newHeaders[col2] = s1;
        const newRows = tableRows.map(r => {
          const nr = [...r];
          const tmp = nr[col1]; nr[col1] = nr[col2]; nr[col2] = tmp;
          return nr;
        });
        setTableHeaders(newHeaders); setTableRows(newRows);
        syncToText(newHeaders, newRows);
      };

      const addFooterLine = () => {
        setConfig(prev => ({
          ...prev,
          footers: [...(prev.footers || []), { id: Date.now(), prefix: "", prefixWeight: 900, text: "", textWeight: 400, layout: "below" }]
        }));
      };

      const updateFooter = (id, field, value) => {
        setConfig(prev => ({ ...prev, footers: prev.footers.map(f => f.id === id ? { ...f, [field]: value } : f) }));
      };

      const deleteFooter = (id) => {
        setConfig(prev => ({ ...prev, footers: prev.footers.filter(f => f.id !== id) }));
      };

      const addRefLine = () => {
        setConfig(prev => ({
          ...prev,
          refLines: [...(prev.refLines || []), { 
            id: Date.now(), 
            axis: "Y-Axis", 
            val: "100", 
            catOffset: "center",
            style: "Dashed", 
            width: 1.5, 
            color: "#64748b", 
            opacity: 100, 
            label: "", 
            textColor: "#0f172a", 
            textPosition: "right" 
          }]
        }));
      };

      const updateRefLine = (id, field, value) => {
        setConfig(prev => ({ ...prev, refLines: (prev.refLines || []).map(r => r.id === id ? { ...r, [field]: value } : r) }));
      };

      const deleteRefLine = (id) => {
        setConfig(prev => ({ ...prev, refLines: (prev.refLines || []).filter(r => r.id !== id) }));
      };

const copyShareLink = async () => {
  const activeKeys = new Set([...seriesList, ...pieCategories, ...tableHeaders]);
  const cleanColors = {};
  Object.entries(seriesColors || {}).forEach(([k, col]) => {
    if (activeKeys.has(k) && isSafeKey(k)) {
      cleanColors[k] = sanitizeColor(col);
    }
  });

  const payload = { tableHeaders, tableRows, config, seriesColors: cleanColors };
  const encoded = encodeChartState(payload);
  const directUrl = window.location.href.split('?')[0].split('#')[0];
  let embedBaseUrl: string;
  if (/\.html?$/i.test(directUrl)) {
    embedBaseUrl = directUrl.replace(/[^/]*$/, 'embed.html');
  } else if (directUrl.endsWith('/')) {
    embedBaseUrl = `${directUrl}embed.html`;
  } else {
    embedBaseUrl = `${directUrl}/embed.html`;
  }

  await copyTextToClipboard(`${embedBaseUrl}#view=${encoded}`);
  setToast("Bäddningslänk kopierad!");
  setTimeout(() => setToast(""), 2500);
};

      const loadChartFromLink = (linkOrCode) => {
        if (!linkOrCode || !linkOrCode.trim()) return;
        let code = linkOrCode.trim();
        if (code.includes("#view=")) {
          const m = code.match(/#view=([^&#\s]+)/);
          if (m) code = decodeURIComponent(m[1]);
        } else if (code.includes("view=")) {
          const m = code.match(/[?&#]view=([^&#\s]+)/);
          if (m) code = decodeURIComponent(m[1]);
        }
        try {
          const parsed = decodeChartState(code);
          if (parsed && typeof parsed === "object") {
            if (parsed.tableHeaders) setTableHeaders(parsed.tableHeaders);
            if (parsed.tableRows) setTableRows(parsed.tableRows);
            if (parsed.config) setConfig(parsed.config);
            if (parsed.seriesColors) setSeriesColors(parsed.seriesColors);
            setIsViewerMode(true);
            setToast("Diagram inläst i bäddningsläge!");
            setTimeout(() => setToast(""), 2500);
            return true;
          }
        } catch (e) {}
        return false;
      };

      const footerLines = useMemo(() => {
        const lines = [];
        (config.footers || []).forEach((item, idx) => {
          if (idx === 0 || item.layout === "below") lines.push([item]);
          else {
            if (!lines.length) lines.push([]);
            lines[lines.length - 1].push(item);
          }
        });
        return lines;
      }, [config.footers]);

      // Download print PDF with 100% vector outlined text in pure black
      const downloadPrintPDF = async () => {
        const chartSvgEl = exportCardRef.current?.querySelector("svg") || editorialCardRef.current?.querySelector("svg");
        if (!chartSvgEl) {
          setToast("Kunde inte hitta diagram för export.");
          setTimeout(() => setToast(""), 2500);
          return;
        }

        const colKey = config.printWidth || "2sp";
        const targetWidthMm = PRINT_COLUMNS[colKey]?.mm || 99.2;
        setToast(`Skapar tryckfärdig PDF (${colKey}, ${targetWidthMm} mm)...`);

        if (document.fonts) {
          try { await document.fonts.ready; } catch (e) {}
        }

        let tempMount = null;
        try {
          await loadOpentypeFonts();

          const { svgElement, totalHeight, width } = buildCompositeVectorSvgElement(
            chartSvgEl, config, seriesList, pieCategories, seriesColors, targetWidthMm, exportWidth
          );

          await convertSvgTextToOutlines(svgElement);

          tempMount = svgElement;
          svgElement.style.position = "fixed";
          svgElement.style.top = "0px";
          svgElement.style.left = "-99999px";
          svgElement.style.opacity = "1";
          svgElement.style.pointerEvents = "none";
          document.body.appendChild(svgElement);

          const finalWidthMm = targetWidthMm;
          const finalHeightMm = cleanFloat((totalHeight / width) * targetWidthMm);

          const pdf = new jsPDF({
            orientation: finalHeightMm > finalWidthMm ? "portrait" : "landscape",
            unit: "mm",
            format: [finalWidthMm, finalHeightMm]
          });

          let rendered = false;

          try {
            if (typeof (pdf as any).svg === "function") {
              await (pdf as any).svg(svgElement, { x: 0, y: 0, width: finalWidthMm, height: finalHeightMm });
              rendered = true;
            } else if (typeof svg2pdf === "function") {
              await svg2pdf(svgElement, pdf, { x: 0, y: 0, width: finalWidthMm, height: finalHeightMm });
              rendered = true;
            }
          } catch (svgErr) {
            console.warn("svg2pdf direct call failed, attempting canvas fallback:", svgErr);
          }

          if (!rendered) {
            const card = document.getElementById("editorial-graphic-card");
            if (card && html2canvas) {
              const canvas = await html2canvas(card, { scale: 3, useCORS: true, backgroundColor: "#ffffff" });
              const imgData = canvas.toDataURL("image/png");
              pdf.addImage(imgData, "PNG", 0, 0, finalWidthMm, finalHeightMm);
              rendered = true;
            }
          }

          if (rendered) {
            const safeName = (config.title || "diagram").replace(/[^a-zA-Z0-9åäöÅÄÖ_-]+/g, "_");
            pdf.save(`${safeName}_${colKey}.pdf`);
            setToast(`PDF sparad (${colKey}, ${finalWidthMm} mm)!`);
          } else {
            setToast("Kunde inte generera PDF.");
          }
          setTimeout(() => setToast(""), 3000);
        } catch (err) {
          console.error("PDF export error:", err);
          setToast("Fel vid PDF-export: " + err.message);
          setTimeout(() => setToast(""), 3500);
        } finally {
          if (tempMount && tempMount.parentNode) {
            tempMount.parentNode.removeChild(tempMount);
          }
        }
      };

      return (
        <div className={`transition-colors duration-200 ${
          isViewerMode 
            ? (isDarkMode ? 'bg-[#0f172a] text-slate-100 p-0 m-0 w-full overflow-hidden' : 'bg-white text-slate-800 p-0 m-0 w-full overflow-hidden')
            : (isDarkMode ? 'bg-slate-950 text-slate-100 min-h-screen flex flex-col' : 'bg-slate-100 text-slate-800 min-h-screen flex flex-col')
        }`}>
          {toast && (
  <div className="fixed bottom-5 right-5 z-50 px-4 py-2 text-xs font-semibold flex items-center space-x-2 border shadow-lg bg-slate-900 text-white border-slate-700">
    <span className="text-[#e4590f]">●</span>
    <span>{toast}</span>
  </div>
)}
          {!isViewerMode && (
            <header className="px-2 sm:px-6 py-1.5 sm:py-3 flex flex-nowrap items-center justify-between gap-1 sm:gap-2 border-b bg-slate-900 border-slate-800 text-white">
              <div className="flex items-center gap-1.5 sm:gap-3 shrink-0">
                <div className="flex items-center space-x-1.5 sm:space-x-2">
                  <span className="w-2.5 h-2.5 sm:w-3 sm:h-3 bg-[#e4590f] inline-block shrink-0"></span>
                  <span className="font-bold text-xs sm:text-sm tracking-wide">Grafael</span>
                </div>

                <div className="flex items-center space-x-0.5 sm:space-x-1 border border-slate-700 bg-slate-800 p-0.5">
                  <button
                    type="button"
                    onClick={handleUndo}
                    disabled={historyCount.index <= 0}
                    className={`px-1.5 sm:px-2 py-0.5 sm:py-1 text-[11px] sm:text-xs font-semibold flex items-center md:space-x-1 transition ${
                      historyCount.index > 0
                        ? 'text-slate-100 hover:bg-slate-700 cursor-pointer'
                        : 'text-slate-500 cursor-not-allowed opacity-40'
                    }`}
                    title="Ångra (Ctrl/Cmd+Z)"
                  >
                    <span>↶</span>
                    <span className="hidden md:inline">Ångra</span>
                  </button>
                  <button
                    type="button"
                    onClick={handleRedo}
                    disabled={historyCount.index >= historyCount.length - 1}
                    className={`px-1.5 sm:px-2 py-0.5 sm:py-1 text-[11px] sm:text-xs font-semibold flex items-center md:space-x-1 transition ${
                      historyCount.index < historyCount.length - 1
                        ? 'text-slate-100 hover:bg-slate-700 cursor-pointer'
                        : 'text-slate-500 cursor-not-allowed opacity-40'
                    }`}
                    title="Gör om (Ctrl/Cmd+Shift+Z eller Ctrl/Cmd+Y)"
                  >
                    <span>↷</span>
                    <span className="hidden md:inline">Gör om</span>
                  </button>
                </div>
              </div>

              <div className="flex flex-nowrap items-center gap-1 sm:gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => { setIsDarkMode(!isDarkMode); }}
                  className="px-1.5 sm:px-2 py-0.5 sm:py-1 text-[11px] sm:text-xs font-semibold border bg-slate-800 text-slate-200 border-slate-700 flex items-center md:space-x-1"
                  title={isDarkMode ? "Byt till ljust läge" : "Byt till mörkt läge"}
                >
                  <span>{isDarkMode ? "☀️" : "🌙"}</span>
                  <span className="hidden md:inline">{isDarkMode ? "Ljust" : "Mörkt"}</span>
                </button>

                <button
                  onClick={() => setIsViewerMode(true)}
                  className="px-1.5 sm:px-2.5 py-0.5 sm:py-1 text-[11px] sm:text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition flex items-center md:space-x-1"
                  title="Bäddningsläge"
                >
                  <span>👁️</span>
                  <span className="hidden md:inline">Bäddningsläge</span>
                </button>

                <div className="flex items-center bg-slate-800 border border-slate-700">
                  <select
                    value={config.printWidth || "2sp"}
                    onChange={(e) => setConfig({ ...config, printWidth: e.target.value })}
                    className="bg-transparent w-[74px] sm:w-auto text-[11px] sm:text-xs text-slate-200 font-semibold outline-none py-0.5 sm:py-1 px-1 sm:px-1.5 cursor-pointer border-r border-slate-700 hover:bg-slate-700 transition"
                  >
                    <option value="1sp" className="bg-slate-900 text-white">1sp 47,6 mm</option>
                    <option value="2sp" className="bg-slate-900 text-white">2sp 99,2 mm</option>
                    <option value="3sp" className="bg-slate-900 text-white">3sp 150,7 mm</option>
                    <option value="4sp" className="bg-slate-900 text-white">4sp 202,2 mm</option>
                    <option value="5sp" className="bg-slate-900 text-white">5sp 254 mm</option>
                  </select>

                  <button 
                    onClick={downloadPrintPDF} 
                    className="px-1.5 sm:px-3 py-0.5 sm:py-1 text-[11px] sm:text-xs font-bold bg-[#e4590f] hover:bg-[#c94d0c] text-white transition flex items-center space-x-1" 
                    title="Ladda ner tryckfärdig PDF"
                  >
                    <span>PDF</span>
                  </button>
                </div>

                <button onClick={copyShareLink} className="px-1.5 sm:px-3 py-0.5 sm:py-1 text-[11px] sm:text-xs font-bold bg-[#e4590f] hover:bg-[#c94d0c] text-white transition flex items-center md:space-x-1" title="Kopiera länk">
                  <span>🔗</span>
                  <span className="hidden md:inline">Kopiera länk</span>
                </button>
              </div>
            </header>
          )}

          <main className={`flex-1 ${isViewerMode ? 'w-full max-w-4xl mx-auto relative' : 'grid grid-cols-1 lg:grid-cols-12 overflow-hidden'}`}>
            <div className={`${isViewerMode ? 'w-full p-0 flex flex-col items-center justify-start relative' : 'lg:col-span-7 xl:col-span-8 p-3 sm:p-6 overflow-y-auto flex flex-col items-center justify-start'}`}>
              {isViewerMode && !isIframe && (
                <div className="absolute top-1 right-1 z-30 opacity-70 hover:opacity-100 transition-opacity">
                  <button 
                    onClick={() => setIsViewerMode(false)}
                    className="text-xs px-2.5 py-1 font-semibold border bg-white text-slate-700 border-slate-300 hover:bg-slate-50 shadow-sm"
                  >
                    <span>✎ Redigera diagram</span>
                  </button>
                </div>
              )}

              <div className={`w-full max-w-2xl transition-all duration-200 ${
                isViewerMode ? 'border-0 bg-transparent p-0 m-0' : (isDarkMode ? 'bg-slate-900 border-slate-800 border p-4 sm:p-6' : 'bg-white border-slate-300 border p-4 sm:p-6')
              } flex flex-col items-center`}>
                <div 
                  ref={editorialCardRef}
                  id="editorial-graphic-card"
                  className="w-full select-none"
                  style={{ margin: 0, padding: 0, backgroundColor: isDarkMode ? '#0f172a' : '#ffffff', color: isDarkMode ? '#f8fafc' : '#0f172a' }}
                >
                  <div className="mb-2 select-none" style={{ marginTop: 0, paddingTop: 0 }}>
                    <h1 
                      onClick={() => { if (!isViewerMode) { setActiveTab("text"); setTimeout(() => titleInputRef.current?.focus(), 50); } }}
                      className={`leading-none whitespace-pre-line tracking-tight mb-1 transition-all ${!isViewerMode ? 'cursor-pointer hover:opacity-80' : ''}`}
                      style={{ fontSize: '2rem', fontWeight: config.titleWeight, margin: 0, marginTop: '-0.1em', padding: 0, color: isDarkMode ? '#f8fafc' : '#0f172a' }}
                    >
                      {config.title || "Rubrik"}
                    </h1>
                    
                    {config.ingress && (
                      <p 
                        onClick={() => { if (!isViewerMode) { setActiveTab("text"); setTimeout(() => ingressInputRef.current?.focus(), 50); } }}
                        className={`mt-1 leading-normal transition-all ${!isViewerMode ? 'cursor-pointer hover:opacity-80' : ''}`}
                        style={{ fontSize: '1.125rem', fontWeight: config.ingressWeight, margin: 0, marginTop: '0.25rem', padding: 0, color: isDarkMode ? '#cbd5e1' : '#475569' }}
                      >
                        {config.ingress}
                      </p>
                    )}

                    {config.drawLegend && config.legendPosition === "Below Ingress" && (!config.useHierarchy || seriesList.length > 1 || (config.categoryColorOverrides && config.categoryColorOverrides.length > 0)) && (
                      <div 
                        onClick={() => { if (!isViewerMode) setActiveTab("colors"); }}
                        className={`flex flex-wrap items-center gap-x-4 gap-y-1 mt-1 ${!isViewerMode ? 'cursor-pointer hover:opacity-85' : ''}`}
                      >
                        {(config.chartType === "Pie" ? (isPieByRow ? seriesList : pieCategories) : seriesList)
                          .filter(sName => !(config.hiddenLegendItems || []).includes(sName))
                          .map((sName, sIdx) => {
                          const swatchColor = config.chartType === "Pie"
                            ? (seriesColors[sName] || (isPieByRow ? BRAND_SWATCHES[sIdx % BRAND_SWATCHES.length] : BRAND_SCALES[Math.min(Math.max(pieCategories.length, 2), 10)][sIdx % 10]))
                            : (seriesColors[sName] || BRAND_SWATCHES[sIdx % BRAND_SWATCHES.length]);
                          return (
                            <div key={`${sName}-${sIdx}`} className="flex items-center space-x-1.5 py-0.5">
                              <span className="w-2.5 h-2.5 inline-block shrink-0" style={{ backgroundColor: swatchColor }} />
                              <span className="text-sm" style={{ fontWeight: config.legendWeight, color: isDarkMode ? '#e2e8f0' : '#1e293b' }}>
                                {sName}
                              </span>
                            </div>
                          );
                        })}
                        {(config.categoryColorOverrides || []).filter(o => o.category && o.color).map((ov, oIdx) => {
                          const label = ov.legendLabel || (ov.series && ov.series !== "*" && ov.series !== "Alla" && ov.series !== "Alla serier" ? `${ov.category} (${ov.series})` : ov.category);
                          return (
                            <div key={`ov-leg-${ov.id || oIdx}`} className="flex items-center space-x-1.5 py-0.5">
                              <span className="w-2.5 h-2.5 inline-block shrink-0" style={{ backgroundColor: ov.color }} />
                              <span className="text-sm font-semibold" style={{ fontWeight: config.legendWeight, color: isDarkMode ? '#e2e8f0' : '#1e293b' }}>
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
                        isDark={isDarkMode}
                        containerWidth={cardWidth}
                        containerHeight={chartContainerHeight}
                        isViewerMode={isViewerMode}
                        onElementClick={!isViewerMode ? (target) => {
                          if (isViewerMode) return;
                          if (target === 'grid' || target === 'axis') setActiveTab('grid');
                          else if (target === 'series' || target === 'bar') setActiveTab('chart');
                          else if (target === 'color') setActiveTab('colors');
                          else if (target === 'x-labels') setActiveTab('text');
                        } : undefined}
                      />
                    </ErrorBoundary>
                  </div>

                  {config.footers && config.footers.length > 0 && (
                    <div 
                      onClick={() => { if (!isViewerMode) { setActiveTab("text"); setTimeout(() => firstFooterInputRef.current?.focus(), 50); } }}
                      className={`mt-1.5 space-y-0.5 text-xs select-none pb-2 transition-all ${!isViewerMode ? 'cursor-pointer hover:opacity-85' : ''}`}
                      style={{ color: isDarkMode ? '#cbd5e1' : '#1e293b' }}
                    >
                      {footerLines.map((line, lIdx) => (
                        <div key={lIdx} className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5">
                          {line.map(item => (
                            <div key={item.id} className="inline-flex items-baseline space-x-1">
                              {item.prefix && <span style={{ fontWeight: item.prefixWeight, color: isDarkMode ? '#f8fafc' : '#0f172a' }}>{item.prefix}</span>}
                              {item.text && <span style={{ fontWeight: item.textWeight, color: isDarkMode ? '#cbd5e1' : '#334155' }}>{item.text}</span>}
                            </div>
                          ))}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              <div 
                ref={exportCardRef}
                style={{ position: 'fixed', top: 0, left: '-99999px', width: `${exportWidth}px`, opacity: 0, pointerEvents: 'none', zIndex: -99999 }}
              >
                <ChartVisualizer
                  headers={tableHeaders}
                  rows={tableRows}
                  seriesList={seriesList}
                  pieCategories={pieCategories}
                  seriesColors={seriesColors}
                  config={config}
                  isDark={false}
                  customWidth={exportWidth}
                  isPrint={true}
                  containerWidth={exportWidth}
                  containerHeight={config.chartHeight || 520}
                />
              </div>
            </div>

            {!isViewerMode && (
              <aside className={`lg:col-span-5 xl:col-span-4 border-l flex flex-col h-[calc(100vh-45px)] transition-colors ${
                isDarkMode ? 'bg-slate-900 border-slate-800 text-slate-100' : 'bg-white border-slate-200 text-slate-800'
              }`}>
                <div className={`flex border-b text-xs font-semibold overflow-x-auto no-scrollbar whitespace-nowrap ${
                  isDarkMode ? 'border-slate-800 bg-slate-950 text-slate-400' : 'border-slate-200 bg-slate-50 text-slate-600'
                }`}>
                  {[
                    { id: "data", label: "Data" },
                    { id: "chart", label: "Diagramtyp" },
                    { id: "text", label: "Text" },
                    { id: "popups", label: "Popuper" },
                    { id: "colors", label: "Färger" },
                    { id: "grid", label: "Rutnät" }
                  ].map(tab => (
                    <button
                      key={tab.id}
                      onClick={() => setActiveTab(tab.id)}
                      className={`px-3 py-3 text-center transition-colors border-b-2 shrink-0 ${
                        activeTab === tab.id 
                          ? `border-[#e4590f] text-[#e4590f] font-bold ${isDarkMode ? 'bg-slate-900' : 'bg-white'}` 
                          : `border-transparent hover:${isDarkMode ? 'text-slate-200' : 'text-slate-900'}`
                      }`}
                    >
                      {tab.label}
                    </button>
                  ))}
                </div>

                <div className="flex-1 p-4 overflow-y-auto space-y-4">
                  {/* TAB 1: DATA */}
                  {activeTab === "data" && (
                    <div className="space-y-4">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <input type="file" ref={fileInputRef} onChange={handleFileUpload} accept=".csv,.tsv,.txt,.xlsx,.xls,.xlsb" className="hidden" />
                        <button 
                          type="button"
                          onClick={() => autoAnalyzeAndBuildChart()}
                          className="text-xs px-3.5 py-1.5 font-bold border bg-[#e4590f] hover:bg-[#c94d0c] text-white shadow-sm flex items-center space-x-1.5 transition"
                          title="Läs och analysera datan, strukturera om tabellen och skapa en färdig graf automatiskt"
                        >
                          <span>✨</span>
                          <span>Skapa graf automatiskt</span>
                        </button>
                        <button onClick={() => fileInputRef.current?.click()} className="text-xs px-3 py-1.5 font-medium border bg-slate-100 hover:bg-slate-200 text-slate-700 border-slate-300">
                          📁 Importera fil
                        </button>
                        <button onClick={() => { const input = prompt("Klistra in länk eller delningskod:"); if (input) loadChartFromLink(input); }} className="text-xs px-3 py-1.5 font-medium border bg-slate-100 hover:bg-slate-200 text-slate-700 border-slate-300">
                          🔗 Öppna från länk
                        </button>
                        <button onClick={() => setShowPivotUI(!showPivotUI)} className="text-xs px-3 py-1.5 font-semibold border bg-purple-50 hover:bg-purple-100 text-purple-900 border-purple-300">
                          ⤹ Pivotera data
                        </button>
                        <button onClick={handleTranspose} className="text-xs px-3 py-1.5 font-medium border bg-slate-100 hover:bg-slate-200 text-slate-700 border-slate-300">
                          ⇄ Växla rader och kolumner
                        </button>
                        <button onClick={handleClearData} className="text-xs px-3 py-1.5 font-medium border bg-slate-100 hover:bg-red-50 text-slate-700 border-slate-300" title="Rensa alla rader och kolumner">
                          🗑️ Töm diagram
                        </button>
                      </div>

                      {showPivotUI && (
                        <div className="p-3 border space-y-2.5 text-xs bg-purple-50/70 border-purple-200">
                          <div className="flex items-center justify-between border-b pb-1.5 border-purple-200">
                            <span className="font-bold text-slate-800 uppercase tracking-wide">
                              Pivotera tabell
                            </span>
                            <button onClick={() => setShowPivotUI(false)} className="text-slate-400 hover:text-slate-700 font-bold px-1">×</button>
                          </div>
                          <p className="text-[11px] text-slate-600 leading-relaxed">
                            Omvandla en radbaserad tabell till kategorier och separata serier.
                          </p>
                          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 pt-1">
                            <div>
                              <label className="block mb-0.5 font-semibold text-slate-700 text-[11px]">Kategori:</label>
                              <select 
                                value={pivotConfig.catCol} 
                                onChange={(e) => setPivotConfig({ ...pivotConfig, catCol: parseInt(e.target.value, 10) })} 
                                className="w-full border p-1 bg-white outline-none text-slate-800"
                              >
                                {tableHeaders.map((h, i) => (<option key={i} value={i}>{h || `Kolumn ${i + 1}`}</option>))}
                              </select>
                            </div>
                            <div>
                              <label className="block mb-0.5 font-semibold text-slate-700 text-[11px]">Serie / Grupp:</label>
                              <select 
                                value={pivotConfig.seriesCol} 
                                onChange={(e) => setPivotConfig({ ...pivotConfig, seriesCol: parseInt(e.target.value, 10) })} 
                                className="w-full border p-1 bg-white outline-none text-slate-800"
                              >
                                {tableHeaders.map((h, i) => (<option key={i} value={i}>{h || `Kolumn ${i + 1}`}</option>))}
                              </select>
                            </div>
                            <div>
                              <label className="block mb-0.5 font-semibold text-slate-700 text-[11px]">Värdekolumn:</label>
                              <select 
                                value={pivotConfig.valCol} 
                                onChange={(e) => setPivotConfig({ ...pivotConfig, valCol: parseInt(e.target.value, 10) })} 
                                className="w-full border p-1 bg-white outline-none text-slate-800"
                              >
                                {tableHeaders.map((h, i) => (<option key={i} value={i}>{h || `Kolumn ${i + 1}`}</option>))}
                              </select>
                            </div>
                          </div>
                          <div className="flex items-center justify-end space-x-2 pt-1 border-t border-purple-200">
                            <button onClick={() => setShowPivotUI(false)} className="px-2.5 py-1 border bg-white hover:bg-slate-50 text-slate-700 text-xs">
                              Avbryt
                            </button>
                            <button onClick={executePivot} className="px-3 py-1 bg-[#e4590f] hover:bg-[#c94d0c] text-white font-bold text-xs">
                              Utför pivotering
                            </button>
                          </div>
                        </div>
                      )}

                      {detectedTidyInfo && !dismissedTidyBanner && (
                        <div className="p-3 border space-y-2 text-xs bg-amber-50 border-amber-300 text-amber-950">
                          <div className="flex items-start justify-between">
                            <div className="flex items-center space-x-2">
                              <span className="text-base">💡</span>
                              <span className="font-bold">
                                Grafael upptäckte radbaserad data ({detectedTidyInfo.entityColName} & {detectedTidyInfo.dateColName})
                              </span>
                            </div>
                            <button 
                              type="button" 
                              onClick={() => setDismissedTidyBanner(true)}
                              className="text-amber-800 hover:text-amber-950 font-bold px-1"
                              title="Dölj förslag"
                            >
                              ×
                            </button>
                          </div>
                          <p className="text-[11px] text-amber-900 leading-snug">
                            Datan ser ut att komma från en statistikdatabas (t.ex. Our World in Data / Eurostat). Vill du automatiskt pivotera med <b>{detectedTidyInfo.dateColName}</b> på X-axeln och <b>{detectedTidyInfo.entityColName}</b> som serier?
                          </p>
                          <div className="flex items-center space-x-2 pt-1">
                            <button
                              type="button"
                              onClick={() => autoAnalyzeAndBuildChart()}
                              className="px-3 py-1 font-bold text-xs bg-[#e4590f] hover:bg-[#c94d0c] text-white flex items-center space-x-1"
                            >
                              <span>⚡</span>
                              <span>Pivotera & skapa färdig graf</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setPivotConfig(detectedTidyInfo.pivotConfig);
                                setShowPivotUI(true);
                                setDismissedTidyBanner(true);
                              }}
                              className="px-2.5 py-1 text-xs border border-amber-300 bg-white hover:bg-amber-100/60 text-amber-900"
                            >
                              Anpassa manuellt
                            </button>
                            <button
                              type="button"
                              onClick={() => setDismissedTidyBanner(true)}
                              className="px-2 py-1 text-xs text-amber-800 hover:text-amber-950"
                            >
                              Behåll som den är
                            </button>
                          </div>
                        </div>
                      )}

                      <div className="border border-slate-200 bg-white">
                        <div className="max-h-60 overflow-auto">
                          <table className="w-full text-xs text-left border-collapse">
                            <thead>
                              <tr className="border-b bg-slate-100 text-slate-700 border-slate-200">
                                {tableHeaders.map((head, cIdx) => (
  <th key={cIdx} className="p-1.5 border-r relative group min-w-[90px]">
    <div className="flex items-center space-x-1">
      <input 
        type="text" 
        value={head} 
        onChange={(e) => handleHeaderChange(cIdx, e.target.value)} 
        className="w-full bg-transparent font-bold outline-none" 
      />
      <div className="flex flex-col opacity-30 group-hover:opacity-100 transition-opacity">
        <button 
          type="button" 
          onClick={() => handleSortColumn(cIdx, "asc")} 
          title="Sortera stigande (A–Ö, 0–9)" 
          className="text-[9px] hover:text-[#e4590f] leading-none px-0.5"
        >
          ▲
        </button>
        <button 
          type="button" 
          onClick={() => handleSortColumn(cIdx, "desc")} 
          title="Sortera fallande (Ö–A, 9–0)" 
          className="text-[9px] hover:text-[#e4590f] leading-none px-0.5"
        >
          ▼
        </button>
      </div>
    </div>
    {tableHeaders.length > 1 && (
      <button type="button" onClick={() => deleteCol(cIdx)} className="absolute right-1 top-1 text-slate-400 hover:text-red-500 opacity-0 group-hover:opacity-100">×</button>
    )}
  </th>
))}
                        
                                <th className="w-6 p-1"></th>
                              </tr>
                            </thead>
                            <tbody>
                              {tableRows.map((row, rIdx) => (
                                <tr key={rIdx} className="border-b group">
                                  {tableHeaders.map((_, cIdx) => (
                                    <td key={cIdx} className="p-1 border-r">
                                      <input type="text" value={row[cIdx] || ""} onChange={(e) => handleCellChange(rIdx, cIdx, e.target.value)} className="w-full p-1 bg-transparent outline-none focus:ring-1 focus:ring-[#e4590f]" />
                                    </td>
                                  ))}
                                  <td className="p-1 text-center">
                                    {tableRows.length > 1 && (
                                      <button onClick={() => deleteRow(rIdx)} className="text-slate-400 hover:text-red-500 opacity-0 group-hover:opacity-100">×</button>
                                    )}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>

                      <div className="border p-3 bg-slate-50 border-slate-200">
                        <label className="block text-xs font-bold uppercase mb-1.5">Klistra in direkt</label>
                        <textarea rows={3} value={rawTextBuffer} onChange={(e) => setRawTextBuffer(e.target.value)} className="w-full text-xs font-mono border p-2 outline-none text-slate-900 bg-white" placeholder="Klistra in tabell eller text..." />
                        <div className="flex gap-2 mt-2">
                          <button onClick={() => parseTextToGrid(rawTextBuffer)} className="flex-1 py-1.5 text-xs font-semibold bg-slate-200 hover:bg-slate-300 text-slate-800">
                            Läs in till tabell
                          </button>
                          <button onClick={() => autoAnalyzeAndBuildChart(null, rawTextBuffer)} className="flex-1 py-1.5 text-xs font-bold bg-[#e4590f] hover:bg-[#c94d0c] text-white flex items-center justify-center space-x-1">
                            <span>✨</span>
                            <span>Analysera & skapa graf</span>
                          </button>
                        </div>
                      </div>

                      <div className="p-2.5 border text-[11px] bg-slate-50 border-slate-200">
                        <span className="font-semibold uppercase tracking-wider block mb-2">Importinställningar</span>
                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <label className="block mb-0.5">Avgränsare:</label>
                            <select value={config.importDelimiter || "auto"} onChange={(e) => { setConfig({ ...config, importDelimiter: e.target.value }); syncToText(tableHeaders, tableRows, e.target.value); }} className="w-full border p-1 outline-none text-slate-800 bg-white">
                              <option value="auto">Auto</option>
                              <option value=",">Komma</option>
                              <option value=";">Semikolon</option>
                              <option value="\t">Tabb</option>
                              <option value="|">Pipe</option>
                            </select>
                          </div>
                          <div>
                            <label className="block mb-0.5">Hoppa över rader:</label>
                            <input type="number" min="0" value={config.skipRows || 0} onChange={(e) => setConfig({ ...config, skipRows: Math.max(0, parseInt(e.target.value, 10) || 0) })} className="w-full border p-1 outline-none text-slate-800 bg-white" />
                          </div>
                        </div>

                        <div className="grid grid-cols-2 gap-2 pt-1.5 mt-1.5 border-t border-inherit">
                          <div>
                            <label className="block mb-0.5">Decimaltecken i källdata:</label>
                            <select value={config.dataDecSep || "auto"} onChange={(e) => setConfig({ ...config, dataDecSep: e.target.value })} className="w-full border p-1 outline-none text-slate-800 bg-white">
                              <option value="auto">Auto</option>
                              <option value=".">Punkt</option>
                              <option value=",">Komma</option>
                            </select>
                          </div>
                          <div>
                            <label className="block mb-0.5">Tusental i källdata:</label>
                            <select value={config.dataThousandSep || "auto"} onChange={(e) => setConfig({ ...config, dataThousandSep: e.target.value })} className="w-full border p-1 outline-none text-slate-800 bg-white">
                              <option value="auto">Auto</option>
                              <option value=" ">Mellanslag</option>
                              <option value=",">Komma</option>
                              <option value=".">Punkt</option>
                              <option value="none">Ingen</option>
                            </select>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* TAB 2: CHART TYPE */}
                  {activeTab === "chart" && (
                    <div className="space-y-4">
                      <div>
                        <label className="block text-xs font-bold uppercase mb-2">Diagramtyp</label>
                        <div className="grid grid-cols-3 gap-2">
                          {[
                            { id: "Bar", label: "Stapel" },
                            { id: "Line", label: "Linje / Yta" },
                            { id: "Pie", label: "Cirkel / Donut" }
                          ].map(t => (
                            <button
                              key={t.id}
                              onClick={() => {
                                if (t.id === "Line") {
                                  setConfig(prev => ({
                                    ...prev,
                                    chartType: "Line",
                                    showValueLabels: false,
                                    drawLineValues: false,
                                    drawYLabels: true,
                                    yTickStyle: "Full Grid",
                                    gridLineStyle: "Solid"
                                  }));
                                } else if (t.id === "Bar") {
                                  setConfig(prev => ({
                                    ...prev,
                                    chartType: "Bar",
                                    showValueLabels: true,
                                    drawYLabels: false,
                                    yTickStyle: "None",
                                    gridLineStyle: "Dashed"
                                  }));
                                } else {
                                  setConfig(prev => ({
                                    ...prev,
                                    chartType: "Pie",
                                    showValueLabels: true,
                                    drawYLabels: false,
                                    yTickStyle: "None"
                                  }));
                                }
                              }}
                              className={`py-2 text-xs font-bold border transition ${config.chartType === t.id ? 'bg-[#e4590f] text-white border-[#e4590f]' : 'bg-white text-slate-700 border-slate-300'}`}
                            >
                              {t.label}
                            </button>
                          ))}
                        </div>

                        <div className="mt-3 p-3 border space-y-2 bg-slate-50 border-slate-200">
                          <div className="flex items-center justify-between text-xs">
                            <span className="font-bold text-slate-700">
                              {config.chartType === "Pie" ? "Diagramhöjd per cirkel: " : "Diagramhöjd: "}
                              {config.chartHeight || (config.chartType === "Pie" ? 360 : 480)} px
                            </span>
                            <button type="button" onClick={() => setConfig({ ...config, chartHeight: config.chartType === "Pie" ? 360 : 480 })} className="text-[10px] text-[#e4590f] hover:underline font-semibold">
                              Återställ
                            </button>
                          </div>
                          <input
                            type="range"
                            min={config.chartType === "Pie" ? "200" : "250"}
                            max={config.chartType === "Pie" ? "650" : "850"}
                            step="10"
                            value={config.chartHeight || (config.chartType === "Pie" ? 360 : 480)}
                            onChange={(e) => setConfig({ ...config, chartHeight: parseInt(e.target.value, 10) })}
                            className="w-full accent-[#e4590f]"
                          />
                        </div>
                      </div>

                      {config.chartType === "Bar" && (
                        <div className="p-3 border space-y-3 bg-slate-50 border-slate-200">
                          <div className="flex items-center justify-between text-xs">
                            <span>Orientering:</span>
                            <div className="flex border border-slate-300">
                              {["Vertical", "Horizontal"].map(o => (
                                <button key={o} onClick={() => setConfig({ ...config, barOrientation: o })} className={`px-3 py-1 text-xs font-semibold ${config.barOrientation === o ? 'bg-[#e4590f] text-white' : 'bg-white text-slate-700'}`}>
                                  {o === "Vertical" ? "Stående" : "Liggande"}
                                </button>
                              ))}
                            </div>
                          </div>

                          <div className="flex items-center justify-between text-xs">
                            <span>Stapelbredd: {config.barWidthPct}%</span>
                            <input type="range" min="20" max="95" value={config.barWidthPct} onChange={(e) => setConfig({ ...config, barWidthPct: parseInt(e.target.value) })} className="w-32 accent-[#e4590f]" />
                          </div>

                          <div className="flex items-center justify-between text-xs">
                            <span>Gruppgap: {config.barGapPct}%</span>
                            <input type="range" min="5" max="60" value={config.barGapPct} onChange={(e) => setConfig({ ...config, barGapPct: parseInt(e.target.value) })} className="w-32 accent-[#e4590f]" />
                          </div>

                          <div className="flex items-center justify-between text-xs">
                            <span>Inre stapelgap: {config.innerBarGapPct || 0}%</span>
                            <input type="range" min="0" max="35" value={config.innerBarGapPct || 0} onChange={(e) => setConfig({ ...config, innerBarGapPct: parseInt(e.target.value) })} className="w-32 accent-[#e4590f]" />
                          </div>

                          <div className="flex items-center justify-between text-xs pt-1 border-t border-inherit">
                            <span>Stapla serier:</span>
                            <input type="checkbox" checked={config.isStacked} onChange={(e) => setConfig({ ...config, isStacked: e.target.checked, isStacked100: e.target.checked ? config.isStacked100 : false })} className="w-4 h-4 text-[#e4590f]" />
                          </div>

                          {config.isStacked && (
                            <div className="p-2.5 border space-y-2 text-xs bg-white border-slate-200">
                              <div className="flex items-center justify-between">
                                <span>100% staplad:</span>
                                <input type="checkbox" checked={config.isStacked100 || false} onChange={(e) => setConfig({ ...config, isStacked100: e.target.checked })} className="w-4 h-4 text-[#e4590f]" />
                              </div>
                              <div className="flex items-center justify-between">
                                <span>Visa delvärden i segment:</span>
                                <input type="checkbox" checked={config.showStackedSegmentLabels || false} onChange={(e) => setConfig({ ...config, showStackedSegmentLabels: e.target.checked })} className="w-4 h-4 text-[#e4590f]" />
                              </div>
                              <div className="flex items-center justify-between">
                                <span>Visa totalsumma:</span>
                                <input type="checkbox" checked={config.showStackedTotal !== false} onChange={(e) => setConfig({ ...config, showStackedTotal: e.target.checked })} className="w-4 h-4 text-[#e4590f]" />
                              </div>
                            </div>
                          )}
<div className="pt-2 border-t border-inherit space-y-2">
                          <div className="flex items-center justify-between text-xs">
  <span className="font-bold">Hierarkisk gruppering:</span>
  <input
    type="checkbox"
    checked={config.useHierarchy}
    onChange={(e) => {
      const willUse = e.target.checked;
      let newCfg = { ...config, useHierarchy: willUse };
      if (willUse) {
        if (newCfg.hierarchySource === "rows") {
          let pRow = newCfg.hierarchyParentRow ?? "header";
          let sRow = newCfg.hierarchySubRow ?? 0;
          if (pRow === sRow) sRow = pRow === "header" ? 0 : "header";
          newCfg.hierarchyParentRow = pRow;
          newCfg.hierarchySubRow = sRow;
        } else {
          let pCol = newCfg.hierarchyParentCol ?? 0;
          let sCol = newCfg.hierarchySubCol ?? 1;
          if (pCol === sCol) sCol = pCol === 0 ? 1 : 0;
          newCfg.hierarchyParentCol = pCol;
          newCfg.hierarchySubCol = sCol;
        }
      }
      setConfig(newCfg);
    }}
    className="w-4 h-4 text-[#e4590f]"
  />
</div>

                            {config.useHierarchy && (
                              <div className="p-2.5 border space-y-2 text-xs bg-white border-slate-200">
                                <div>
                                  <span className="block mb-1">Kategorier finns i:</span>
                                  <div className="flex border border-slate-300">
                                    <button onClick={() => {
                                      let pCol = config.hierarchyParentCol ?? 0;
                                      let sCol = config.hierarchySubCol ?? 1;
                                      if (pCol === sCol) sCol = pCol === 0 ? 1 : 0;
                                      setConfig({ ...config, hierarchySource: "columns", hierarchyParentCol: pCol, hierarchySubCol: sCol });
                                    }} className={`flex-1 py-1 text-xs font-semibold ${config.hierarchySource !== "rows" ? "bg-[#e4590f] text-white" : "bg-white text-slate-700"}`}>Kolumner</button>
                                    <button onClick={() => {
                                      let pRow = config.hierarchyParentRow ?? "header";
                                      let sRow = config.hierarchySubRow ?? 0;
                                      if (pRow === sRow) sRow = pRow === "header" ? 0 : "header";
                                      setConfig({ ...config, hierarchySource: "rows", hierarchyParentRow: pRow, hierarchySubRow: sRow });
                                    }} className={`flex-1 py-1 text-xs font-semibold ${config.hierarchySource === "rows" ? "bg-[#e4590f] text-white" : "bg-white text-slate-700"}`}>Rader</button>
                                  </div>
                                </div>

                                {config.hierarchySource === "columns" ? (
                                  <div className="grid grid-cols-2 gap-2 pt-1">
                                    <div>
                                      <span className="block mb-0.5">Huvudkategori:</span>
                                      <select
                                        value={config.hierarchyParentCol ?? 0}
                                        onChange={(e) => {
                                          const newParent = parseInt(e.target.value, 10);
                                          let newSub = config.hierarchySubCol ?? 1;
                                          if (newSub === newParent) {
                                            const alt = tableHeaders.findIndex((_, idx) => idx !== newParent);
                                            newSub = alt >= 0 ? alt : (newParent === 0 ? 1 : 0);
                                          }
                                          setConfig({ ...config, hierarchyParentCol: newParent, hierarchySubCol: newSub });
                                        }}
                                        className="w-full border p-1 outline-none text-slate-800 bg-white"
                                      >
                                        {tableHeaders.map((h, i) => (
                                          <option key={i} value={i}>
                                            {h && h.trim() ? h : (i === 0 ? "Kategori" : `Kolumn ${i + 1}`)}
                                          </option>
                                        ))}
                                      </select>
                                    </div>
                                    <div>
                                      <span className="block mb-0.5">Underkategori:</span>
                                      <select
                                        value={config.hierarchySubCol ?? 1}
                                        onChange={(e) => {
                                          const newSub = parseInt(e.target.value, 10);
                                          let newParent = config.hierarchyParentCol ?? 0;
                                          if (newParent === newSub) {
                                            const alt = tableHeaders.findIndex((_, idx) => idx !== newSub);
                                            newParent = alt >= 0 ? alt : (newSub === 0 ? 1 : 0);
                                          }
                                          setConfig({ ...config, hierarchySubCol: newSub, hierarchyParentCol: newParent });
                                        }}
                                        className="w-full border p-1 outline-none text-slate-800 bg-white"
                                      >
                                        {tableHeaders.map((h, i) => (
                                          <option key={i} value={i}>
                                            {h && h.trim() ? h : `Kolumn ${i + 1}`}
                                          </option>
                                        ))}
                                      </select>
                                    </div>
                                  </div>
                                ) : (
                                  <div className="space-y-2 pt-1">
                                    <div className="grid grid-cols-2 gap-2">
                                      <div>
                                        <span className="block mb-0.5">Rad för huvudkategori:</span>
                                        <select
                                          value={config.hierarchyParentRow ?? "header"}
                                          onChange={(e) => {
                                            const newParent = e.target.value === "header" ? "header" : parseInt(e.target.value, 10);
                                            let newSub = config.hierarchySubRow ?? 0;
                                            if (newSub === newParent) {
                                              newSub = newParent === "header" ? 0 : "header";
                                            }
                                            setConfig({ ...config, hierarchyParentRow: newParent, hierarchySubRow: newSub });
                                          }}
                                          className="w-full border p-1 outline-none text-slate-800 bg-white"
                                        >
                                          <option value="header">
                                            {`Rubrikrad (${(tableHeaders[0] && tableHeaders[0].trim()) ? tableHeaders[0].trim() : 'Kolumnrubriker'})`}
                                          </option>
                                          {tableRows.slice(0, 10).map((r, i) => {
                                            const name = String(r[0] || '').trim();
                                            return (
                                              <option key={i} value={i}>
                                                {`Rad ${i + 1}${name ? `: ${name}` : ''}`}
                                              </option>
                                            );
                                          })}
                                        </select>
                                      </div>
                                      <div>
                                        <span className="block mb-0.5">Rad för underkategori:</span>
                                        <select
                                          value={config.hierarchySubRow ?? 0}
                                          onChange={(e) => {
                                            const newSub = e.target.value === "header" ? "header" : parseInt(e.target.value, 10);
                                            let newParent = config.hierarchyParentRow ?? "header";
                                            if (newParent === newSub) {
                                              newParent = newSub === "header" ? 0 : "header";
                                            }
                                            setConfig({ ...config, hierarchySubRow: newSub, hierarchyParentRow: newParent });
                                          }}
                                          className="w-full border p-1 outline-none text-slate-800 bg-white"
                                        >
                                          <option value="header">
                                            {`Rubrikrad (${(tableHeaders[0] && tableHeaders[0].trim()) ? tableHeaders[0].trim() : 'Kolumnrubriker'})`}
                                          </option>
                                          {tableRows.slice(0, 10).map((r, i) => {
                                            const name = String(r[0] || '').trim();
                                            return (
                                              <option key={i} value={i}>
                                                {`Rad ${i + 1}${name ? `: ${name}` : ''}`}
                                              </option>
                                            );
                                          })}
                                        </select>
                                      </div>
                                    </div>
                                  </div>
                                )}
                              </div>
                            )}
                          </div>

                          {!config.useHierarchy && !isRowSeries && (
                            <div className="flex items-center justify-between text-xs pt-2 border-t border-inherit">
                              <span>Kategorikolumn:</span>
                              <select value={config.categoryColIndex ?? 0} onChange={(e) => setConfig({ ...config, categoryColIndex: parseInt(e.target.value, 10) })} className="border px-2 py-0.5 outline-none text-slate-800 bg-white">
                                {tableHeaders.map((h, i) => (<option key={i} value={i}>{h && h.trim() ? h : (i === 0 ? "Kategori" : `Kolumn ${i + 1}`)}</option>))}
                              </select>
                            </div>
                          )}

                          <div className="flex items-center justify-between text-xs pt-1 border-t border-inherit">
                            <span>Hoppa över tomma staplar:</span>
                            <input type="checkbox" checked={config.skipEmptyBars} onChange={(e) => setConfig({ ...config, skipEmptyBars: e.target.checked })} className="w-4 h-4 text-[#e4590f]" />
                          </div>
                        </div>
                      )}

                      {config.chartType === "Line" && (
                        <div className="p-3 border space-y-3 bg-slate-50 border-slate-200">
                          <div className="flex items-center justify-between text-xs">
                            <span>Linje:</span>
                            <input type="checkbox" checked={config.strokeLines} onChange={(e) => setConfig({ ...config, strokeLines: e.target.checked })} className="w-4 h-4 text-[#e4590f]" />
                          </div>
                          <div className="flex items-center justify-between text-xs">
                            <span>Linjebredd:</span>
                            <select value={config.lineWidth || 3} onChange={(e) => setConfig({ ...config, lineWidth: parseFloat(e.target.value) })} className="border px-2 py-0.5 outline-none text-xs text-slate-800 bg-white">
                              <option value="1.5">1.5 px</option>
                              <option value="2">2 px</option>
                              <option value="3">3 px</option>
                              <option value="4">4 px</option>
                            </select>
                          </div>
                          <div className="flex items-center justify-between text-xs">
                            <span>Punkter:</span>
                            <input type="checkbox" checked={config.drawDots} onChange={(e) => setConfig({ ...config, drawDots: e.target.checked })} className="w-4 h-4 text-[#e4590f]" />
                          </div>
                          <div className="flex items-center justify-between text-xs">
                            <span>Visa värdeetiketter på linjer:</span>
                            <input 
                              type="checkbox" 
                              checked={config.showValueLabels !== false && config.drawLineValues !== false} 
                              onChange={(e) => setConfig({ ...config, drawLineValues: e.target.checked, showValueLabels: e.target.checked })} 
                              className="w-4 h-4 text-[#e4590f]" 
                            />
                          </div>
                          <div className="flex items-center justify-between text-xs pt-1 border-t border-inherit">
                            <span>Ytfyllning:</span>
                            <input type="checkbox" checked={config.fillLines} onChange={(e) => setConfig({ ...config, fillLines: e.target.checked })} className="w-4 h-4 text-[#e4590f]" />
                          </div>
                          {config.fillLines && (
                            <>
                              <div className="flex items-center justify-between text-xs">
                                <span>Staplad yta:</span>
                                <input type="checkbox" checked={config.isStackedArea || false} onChange={(e) => setConfig({ ...config, isStackedArea: e.target.checked })} className="w-4 h-4 text-[#e4590f]" />
                              </div>
                              <div className="flex items-center justify-between text-xs">
                                <span>Opacitet: {config.fillOpacity}%</span>
                                <input type="range" min="5" max="100" value={config.fillOpacity} onChange={(e) => setConfig({ ...config, fillOpacity: parseInt(e.target.value) })} className="w-32 accent-[#e4590f]" />
                              </div>
                            </>
                          )}
                        </div>
                      )}

                      {config.chartType === "Pie" && (
                        <div className="p-3 border space-y-3 bg-slate-50 border-slate-200">
                          <div className="flex items-center justify-between text-xs">
                            <span>Gruppering:</span>
                            <div className="flex border border-slate-300">
                              <button type="button" onClick={() => setConfig({ ...config, pieGrouping: "rows" })} className={`px-2 py-1 text-xs font-semibold ${config.pieGrouping === "rows" ? 'bg-[#e4590f] text-white' : 'bg-white text-slate-700'}`}>Rader</button>
                              <button type="button" onClick={() => setConfig({ ...config, pieGrouping: "columns" })} className={`px-2 py-1 text-xs font-semibold ${config.pieGrouping === "columns" ? 'bg-[#e4590f] text-white' : 'bg-white text-slate-700'}`}>Kolumner</button>
                            </div>
                          </div>

                          <div className="flex items-center justify-between text-xs">
                            <span>Bågvinkel:</span>
                            <div className="flex border border-slate-300">
                              <button type="button" onClick={() => setConfig({ ...config, isSemiCircle: false })} className={`px-2 py-1 text-xs font-semibold ${!config.isSemiCircle ? 'bg-[#e4590f] text-white' : 'bg-white text-slate-700'}`}>360°</button>
                              <button type="button" onClick={() => setConfig({ ...config, isSemiCircle: true })} className={`px-2 py-1 text-xs font-semibold ${config.isSemiCircle ? 'bg-[#e4590f] text-white' : 'bg-white text-slate-700'}`}>180°</button>
                            </div>
                          </div>

                          <div className="flex items-center justify-between text-xs">
                            <span>Donuthål:</span>
                            <input type="checkbox" checked={config.isDonut} onChange={(e) => setConfig({ ...config, isDonut: e.target.checked })} className="w-4 h-4 text-[#e4590f]" />
                          </div>

                          {config.isDonut && (
                            <>
                              <div className="flex items-center justify-between text-xs">
                                <span>Hålstorlek: {config.holePct}%</span>
                                <input type="range" min="20" max="80" value={config.holePct} onChange={(e) => setConfig({ ...config, holePct: parseInt(e.target.value) })} className="w-32 accent-[#e4590f]" />
                              </div>
                              <div className="pt-1 border-t border-inherit space-y-2 text-xs">
                                <div>
                                  <label className="block mb-0.5 text-[11px]">Huvudtext i hålet:</label>
                                  <input type="text" value={config.donutCenterText || ""} onChange={(e) => setConfig({ ...config, donutCenterText: e.target.value })} className="w-full border p-1 outline-none text-slate-900 bg-white" placeholder="Valfri text..." />
                                </div>
                                <div>
                                  <label className="block mb-0.5 text-[11px]">Undertext:</label>
                                  <input type="text" value={config.donutCenterSubtext || ""} onChange={(e) => setConfig({ ...config, donutCenterSubtext: e.target.value })} className="w-full border p-1 outline-none text-slate-900 bg-white" placeholder="Enhet..." />
                                </div>
                              </div>
                            </>
                          )}

                          <div className="flex items-center justify-between text-xs pt-1 border-t border-inherit">
                            <span>Visa procentandel:</span>
                            <input type="checkbox" checked={config.showPct} onChange={(e) => setConfig({ ...config, showPct: e.target.checked })} className="w-4 h-4 text-[#e4590f]" />
                          </div>

                          <div className="flex items-center justify-between text-xs pt-1 border-t border-inherit">
                            <span>Proportionell cirkelstorlek:</span>
                            <input type="checkbox" checked={config.pieProportionalSize !== false} onChange={(e) => setConfig({ ...config, pieProportionalSize: e.target.checked })} className="w-4 h-4 text-[#e4590f]" />
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* TAB 3: TEXT */}
                  {activeTab === "text" && (
                    <div className="space-y-4">
                      {/* 1. RUBRIK */}
                      <div className="p-3 border space-y-2 bg-slate-50 border-slate-200">
                        <label className="block text-xs font-bold uppercase tracking-wider text-slate-700">RUBRIK</label>
                        <textarea
                          ref={titleInputRef}
                          rows={2}
                          value={config.title}
                          onChange={(e) => setConfig({ ...config, title: e.target.value })}
                          className="w-full text-sm border p-2 outline-none focus:ring-1 focus:ring-[#e4590f] bg-white border-slate-300 text-slate-900"
                        />
                        <div className="flex items-center justify-between text-xs">
                          <span className="text-slate-500">Titelvikt:</span>
                          <div className="flex border border-slate-300">
                            {[
                              { label: "Black 900", val: 900 },
                              { label: "Bold 700", val: 700 },
                              { label: "Regular 400", val: 400 }
                            ].map(opt => (
                              <button
                                key={opt.val}
                                onClick={() => setConfig({ ...config, titleWeight: opt.val })}
                                className={`px-2 py-0.5 text-[11px] ${config.titleWeight === opt.val ? 'bg-[#e4590f] text-white font-bold' : 'bg-white text-slate-700'}`}
                              >
                                {opt.label}
                              </button>
                            ))}
                          </div>
                        </div>
                      </div>

                      {/* 2. INGRESS */}
                      <div className="p-3 border space-y-2 bg-slate-50 border-slate-200">
                        <label className="block text-xs font-bold uppercase tracking-wider text-slate-700">INGRESS</label>
                        <input
                          ref={ingressInputRef}
                          type="text"
                          value={config.ingress}
                          onChange={(e) => setConfig({ ...config, ingress: e.target.value })}
                          className="w-full text-sm border p-1.5 outline-none focus:ring-1 focus:ring-[#e4590f] bg-white border-slate-300 text-slate-900"
                        />
                        <div className="flex items-center justify-between text-xs">
                          <span className="text-slate-500">Ingressvikt:</span>
                          <button
                            onClick={() => setConfig({ ...config, ingressWeight: config.ingressWeight === 700 ? 400 : 700 })}
                            className={`px-2.5 py-0.5 text-[11px] font-bold border ${config.ingressWeight === 700 ? 'bg-[#e4590f] text-white border-[#e4590f]' : 'bg-white text-slate-700 border-slate-300'}`}
                          >
                            {config.ingressWeight === 700 ? 'Fet 700' : 'Vanlig 400'}
                          </button>
                        </div>
                      </div>

                      {/* 3. TECKENFÖRKLARING */}
                      <div className="p-3 border space-y-3 text-xs bg-slate-50 border-slate-200">
                        <div className="flex items-center justify-between">
                          <span className="font-bold uppercase block text-slate-700">TECKENFÖRKLARING</span>
                          <input
                            type="checkbox"
                            checked={config.drawLegend}
                            onChange={(e) => {
                              setUserManuallyToggledLegend(true);
                              setConfig({ ...config, drawLegend: e.target.checked });
                            }}
                            className="w-4 h-4 text-[#e4590f]"
                          />
                        </div>

                        {config.drawLegend && (
                          <div className="space-y-3 pt-2 border-t border-inherit">
                            <div className="flex items-center justify-between">
                              <span className="text-slate-600">Position:</span>
                              <select
                                value={config.legendPosition}
                                onChange={(e) => setConfig({ ...config, legendPosition: e.target.value })}
                                className="border px-2 py-1 text-xs outline-none bg-white border-slate-300 text-slate-800"
                              >
                                <option value="Below Ingress">Under ingress</option>
                                <option value="Top Right">Uppe till höger</option>
                                <option value="Top Left">Uppe till vänster</option>
                                <option value="Bottom Right">Nere till höger</option>
                              </select>
                            </div>

                            <div className="flex items-center justify-between">
                              <span className="text-slate-600">Layout:</span>
                              <select
                                value={config.legendLayout || "Horizontal"}
                                onChange={(e) => setConfig({ ...config, legendLayout: e.target.value })}
                                className="border px-2 py-1 text-xs outline-none bg-white border-slate-300 text-slate-800"
                              >
                                <option value="Horizontal">Horisontell</option>
                                <option value="Vertical">Vertikal</option>
                              </select>
                            </div>

                            <div className="flex items-center justify-between">
                              <span className="text-slate-600">Textvikt:</span>
                              <button
                                onClick={() => setConfig({ ...config, legendWeight: config.legendWeight === 700 ? 400 : 700 })}
                                className={`px-2.5 py-0.5 text-[11px] font-bold border ${config.legendWeight === 700 ? 'bg-[#e4590f] text-white border-[#e4590f]' : 'bg-white text-slate-700 border-slate-300'}`}
                              >
                                {config.legendWeight === 700 ? 'Fet 700' : 'Vanlig 400'}
                              </button>
                            </div>

                            <div className="pt-2 border-t border-inherit space-y-1.5">
                              <span className="block font-semibold text-slate-700">Välj vad som ingår i teckenförklaringen:</span>
                              <div className="grid grid-cols-2 gap-1.5">
                                {(config.chartType === "Pie" ? (isPieByRow ? seriesList : pieCategories) : seriesList).map(name => {
                                  const isIncluded = !(config.hiddenLegendItems || []).includes(name);
                                  return (
                                    <label
                                      key={name}
                                      className={`flex items-center space-x-2 p-1.5 border cursor-pointer transition ${isIncluded ? 'bg-white border-[#e4590f]/60 text-slate-800' : 'bg-slate-100/70 border-slate-200 text-slate-500'}`}
                                    >
                                      <input
                                        type="checkbox"
                                        checked={isIncluded}
                                        onChange={() => {
                                          const curHidden = config.hiddenLegendItems || [];
                                          const nextHidden = isIncluded ? [...curHidden, name] : curHidden.filter(h => h !== name);
                                          setConfig({ ...config, hiddenLegendItems: nextHidden });
                                        }}
                                        className="text-[#e4590f]"
                                      />
                                      <span className="truncate font-medium">{name}</span>
                                    </label>
                                  );
                                })}
                              </div>
                            </div>
                          </div>
                        )}
                      </div>

                      {/* 4. KÄLLHÄNVISNING & FOTNOTER */}
                      <div className="p-3 border space-y-3 bg-slate-50 border-slate-200">
                        <div className="flex items-center justify-between">
                          <label className="block text-xs font-bold uppercase text-slate-700">KÄLLHÄNVISNING & FOTNOTER</label>
                          <button onClick={addFooterLine} className="text-[11px] font-bold px-2 py-0.5 bg-slate-200 hover:bg-slate-300 text-slate-800">+ Lägg till textrad</button>
                        </div>
                        <div className="space-y-3">
                          {(config.footers || []).map((fItem, fIdx) => (
                            <div key={fItem.id} className="p-2 border space-y-2 text-xs bg-white border-slate-200">
                              <div className="flex items-center justify-between">
                                <span className="font-semibold text-slate-600">Rad {fIdx + 1}</span>
                                {fIdx > 0 && (
                                  <div className="flex items-center space-x-2">
                                    <select
                                      value={fItem.layout || "below"}
                                      onChange={(e) => updateFooter(fItem.id, "layout", e.target.value)}
                                      className="border px-1.5 py-0.5 text-[11px] bg-white border-slate-300 text-slate-700 outline-none"
                                    >
                                      <option value="below">Ny rad</option>
                                      <option value="inline">Bredvid föregående</option>
                                    </select>
                                    <button onClick={() => deleteFooter(fItem.id)} className="text-slate-400 hover:text-red-500 font-bold px-1">×</button>
                                  </div>
                                )}
                              </div>
                              <div className="grid grid-cols-3 gap-2">
                                <input type="text" value={fItem.prefix} onChange={(e) => updateFooter(fItem.id, "prefix", e.target.value)} className="col-span-1 border p-1 outline-none text-xs" placeholder="Prefix" />
                                <input ref={fIdx === 0 ? firstFooterInputRef : null} type="text" value={fItem.text} onChange={(e) => updateFooter(fItem.id, "text", e.target.value)} className="col-span-2 border p-1 outline-none text-xs" placeholder="Text..." />
                              </div>
                              <div className="flex items-center justify-between pt-1 border-t border-inherit text-[11px]">
                                <div className="flex items-center space-x-1.5">
                                  <span className="text-slate-500">Prefix:</span>
                                  <button onClick={() => updateFooter(fItem.id, "prefixWeight", fItem.prefixWeight === 900 ? 400 : 900)} className={`px-1.5 py-0.5 font-bold border ${fItem.prefixWeight === 900 ? 'bg-[#e4590f] text-white border-[#e4590f]' : 'bg-white text-slate-700'}`}>
                                    {fItem.prefixWeight === 900 ? 'Black 900' : 'Vanlig 400'}
                                  </button>
                                </div>
                                <div className="flex items-center space-x-1.5">
                                  <span className="text-slate-500">Text:</span>
                                  <button onClick={() => updateFooter(fItem.id, "textWeight", fItem.textWeight === 700 ? 400 : 700)} className={`px-1.5 py-0.5 font-bold border ${fItem.textWeight === 700 ? 'bg-[#e4590f] text-white border-[#e4590f]' : 'bg-white text-slate-700'}`}>
                                    {fItem.textWeight === 700 ? 'Fet 700' : 'Vanlig 400'}
                                  </button>
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* 5. VÄRDEETIKETTER & URVAL */}
                      <div className="p-3 border space-y-2.5 text-xs bg-slate-50 border-slate-200">
                        <div className="flex items-center justify-between">
                          <span className="text-slate-700 font-medium">Visa värdeetiketter på diagrammet:</span>
                          <input
                            type="checkbox"
                            checked={config.showValueLabels !== false && (config.chartType !== "Line" || config.drawLineValues !== false)}
                            onChange={(e) => setConfig({ ...config, showValueLabels: e.target.checked, drawLineValues: e.target.checked })}
                            className="w-4 h-4 text-[#e4590f]"
                          />
                        </div>

                        {config.showValueLabels !== false && (
                          <>
                            <div className="flex items-center justify-between py-1 border-t border-inherit">
                              <span className="text-slate-600">Urval av etiketter:</span>
                              <select
                                value={config.valueLabelMode || "all"}
                                onChange={(e) => setConfig({ ...config, valueLabelMode: e.target.value })}
                                className="border px-2 py-0.5 outline-none text-xs bg-white border-slate-300 text-slate-800 font-medium"
                              >
                                <option value="all">Alla värden</option>
                                <option value="last">Endast sista punkten</option>
                                <option value="first_last">Första och sista</option>
                                <option value="min_max">Högsta och lägsta</option>
                                <option value="custom">Valda kategorier</option>
                              </select>
                            </div>

                            {config.valueLabelMode === "custom" && (
                              <div className="p-2 border space-y-1.5 bg-white border-slate-200">
                                <span className="block font-semibold text-slate-700 text-[11px]">Välj kategorier:</span>
                                <div className="max-h-32 overflow-y-auto grid grid-cols-2 gap-1 pt-0.5">
                                  {tableRows.map((r, rIdx) => {
                                    const catVal = String(r[config.categoryColIndex ?? 0] || `Rad ${rIdx + 1}`).trim();
                                    if (!catVal) return null;
                                    const isChecked = (config.customValueLabels || []).includes(catVal);
                                    return (
                                      <label key={rIdx} className="flex items-center space-x-1.5 p-1 border cursor-pointer text-[11px] bg-slate-50 hover:bg-slate-100">
                                        <input
                                          type="checkbox"
                                          checked={isChecked}
                                          onChange={(e) => {
                                            const cur = config.customValueLabels || [];
                                            const next = e.target.checked ? [...cur, catVal] : cur.filter(c => c !== catVal);
                                            setConfig({ ...config, customValueLabels: next });
                                          }}
                                          className="text-[#e4590f]"
                                        />
                                        <span className="truncate font-medium">{catVal}</span>
                                      </label>
                                    );
                                  })}
                                </div>
                              </div>
                            )}

                            <div className="flex items-center justify-between py-1 border-t border-inherit">
                              <span className="text-slate-600">Decimaler för värden:</span>
                              <select value={config.valDecimals || "Auto"} onChange={(e) => setConfig({ ...config, valDecimals: e.target.value })} className="border px-2 py-0.5 outline-none text-xs bg-white border-slate-300 text-slate-800">
                                <option value="Auto">Auto</option>
                                <option value="0">0</option>
                                <option value="1">1</option>
                                <option value="2">2</option>
                                <option value="3">3</option>
                              </select>
                            </div>

                            <div className="flex items-center justify-between py-1 border-t border-inherit">
                              <span className="text-slate-600">Värdeetiketters stil:</span>
                              <div className="flex items-center space-x-2">
                                <button
                                  onClick={() => setConfig({ ...config, valueWeight: config.valueWeight === 700 ? 400 : 700 })}
                                  className={`px-2 py-0.5 text-[11px] font-bold border ${config.valueWeight === 700 ? 'bg-[#e4590f] text-white border-[#e4590f]' : 'bg-white text-slate-700'}`}
                                >
                                  {config.valueWeight === 700 ? 'Fet 700' : 'Vanlig 400'}
                                </button>
                                {config.barOrientation === "Vertical" && config.chartType === "Bar" && (
                                  <select
                                    value={config.valueOrientation || "auto"}
                                    onChange={(e) => setConfig({ ...config, valueOrientation: e.target.value })}
                                    className="border px-1.5 py-0.5 outline-none bg-white border-slate-300 text-slate-800"
                                  >
                                    <option value="auto">Auto</option>
                                    <option value="horizontal">Horisontell</option>
                                    <option value="vertical">Vertikal -90°</option>
                                  </select>
                                )}
                              </div>
                            </div>
                          </>
                        )}

                        <div className="flex items-center justify-between py-1 border-t border-slate-200">
                          <span className="text-slate-600">{config.useHierarchy ? "Huvudkategori:" : "Kategori / X-axel:"}</span>
                          <button
                            onClick={() => setConfig({ ...config, categoryWeight: config.categoryWeight === 700 ? 400 : 700 })}
                            className={`px-2 py-0.5 text-[11px] font-bold border ${config.categoryWeight === 700 ? 'bg-[#e4590f] text-white border-[#e4590f]' : 'bg-white text-slate-700 border-slate-300'}`}
                          >
                            {config.categoryWeight === 700 ? 'Fet 700' : 'Vanlig 400'}
                          </button>
                        </div>

                        <div className="flex items-center justify-between py-1 border-t border-slate-200">
                          <span className="text-slate-600">Y-axeletiketter:</span>
                          <button
                            onClick={() => setConfig({ ...config, axisWeight: config.axisWeight === 700 ? 400 : 700 })}
                            className={`px-2 py-0.5 text-[11px] font-bold border ${config.axisWeight === 700 ? 'bg-[#e4590f] text-white border-[#e4590f]' : 'bg-white text-slate-700 border-slate-300'}`}
                          >
                            {config.axisWeight === 700 ? 'Fet 700' : 'Vanlig 400'}
                          </button>
                        </div>

                        {config.useHierarchy && (
                          <div className="flex items-center justify-between py-1 border-t border-slate-200">
                            <span className="text-slate-600">Underkategori:</span>
                            <button
                              onClick={() => setConfig({ ...config, subCategoryWeight: config.subCategoryWeight === 700 ? 400 : 700 })}
                              className={`px-2 py-0.5 text-[11px] font-bold border ${config.subCategoryWeight === 700 ? 'bg-[#e4590f] text-white border-[#e4590f]' : 'bg-white text-slate-700 border-slate-300'}`}
                            >
                              {config.subCategoryWeight === 700 ? 'Fet 700' : 'Vanlig 400'}
                            </button>
                          </div>
                        )}
                      </div>

                      {/* 6. TALSKALNING & ENHETER (Alltid tillgänglig) */}
                      <div className="p-3 border space-y-2.5 text-xs bg-slate-50 border-slate-200">
                        <span className="font-bold uppercase block text-slate-700">TALSKALNING & ENHETER</span>
                        <div className="flex items-center justify-between">
                          <span className="text-slate-700 font-semibold">Skala stora tal:</span>
                          <select
                            value={config.valueDivisor || 1}
                            onChange={(e) => setConfig({ ...config, valueDivisor: e.target.value === "custom" ? "custom" : parseFloat(e.target.value) })}
                            className="border px-2 py-0.5 outline-none text-xs bg-white border-slate-300 text-slate-800 font-medium"
                          >
                            <option value="1">Ingen (1:1)</option>
                            <option value="1000">Tusental (÷ 1 000)</option>
                            <option value="1000000">Miljoner (÷ 1 000 000)</option>
                            <option value="1000000000">Miljarder (÷ 1 000 000 000)</option>
                            <option value="custom">Anpassad faktor...</option>
                          </select>
                        </div>

                        {config.valueDivisor === "custom" && (
                          <div className="flex items-center justify-between pl-1">
                            <span className="text-slate-500 text-[11px]">Dela värden med:</span>
                            <input
                              type="number"
                              min="1"
                              value={config.customDivisorVal || 100}
                              onChange={(e) => setConfig({ ...config, customDivisorVal: parseFloat(e.target.value) || 1 })}
                              className="w-28 border p-1 text-xs outline-none bg-white border-slate-300 text-slate-800"
                            />
                          </div>
                        )}

                        <div className="flex items-center justify-between pt-1 border-t border-inherit">
                          <span className="text-slate-700">Enhet / Suffix:</span>
                          <input
                            type="text"
                            value={config.valueSuffix || ""}
                            onChange={(e) => setConfig({ ...config, valueSuffix: e.target.value })}
                            className="w-28 border p-1 text-xs outline-none bg-white border-slate-300 text-slate-800 font-medium"
                            placeholder="t.ex. mdr, kr, %"
                          />
                        </div>

                        <div className="space-y-1 pl-1 pt-1 border-t border-slate-200 text-[11px] text-slate-600">
                          <span className="block font-semibold text-slate-700 mb-0.5">Visa enhet ({config.valueSuffix || "suffix"}) på:</span>
                          <label className="flex items-center space-x-2 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={config.unitOnTooltips !== false}
                              onChange={(e) => setConfig({ ...config, unitOnTooltips: e.target.checked })}
                              className="text-[#e4590f]"
                            />
                            <span>I hover-popups</span>
                          </label>
                          <label className="flex items-center space-x-2 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={config.unitOnLabels === true}
                              onChange={(e) => setConfig({ ...config, unitOnLabels: e.target.checked })}
                              className="text-[#e4590f]"
                            />
                            <span>På diagrammets värdeetiketter</span>
                          </label>
                          <label className="flex items-center space-x-2 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={config.unitOnAxis === true}
                              onChange={(e) => setConfig({ ...config, unitOnAxis: e.target.checked })}
                              className="text-[#e4590f]"
                            />
                            <span>På Y-axelns skalvärden</span>
                          </label>
                        </div>
                      </div>

                      {/* DATUM- & TIDSAXEL */}
                      <div className="p-3 border space-y-2.5 text-xs bg-slate-50 border-slate-200">
                        <span className="font-bold uppercase block text-slate-700">DATUM- & TIDSAXEL</span>
                        <div className="space-y-2">
                          <div className="p-2 border bg-white border-slate-200 space-y-1.5">
                            <span className="block font-semibold text-slate-700 text-[11px]">Datumformat i källdata (3 delar):</span>
                            <div className="grid grid-cols-3 gap-1.5">
                              <div>
                                <span className="block text-[10px] text-slate-500 mb-0.5">1:a delen:</span>
                                <select
                                  value={config.datePart1 || "auto"}
                                  onChange={(e) => setConfig({ ...config, datePart1: e.target.value })}
                                  className="w-full border p-1 text-xs outline-none bg-white text-slate-800"
                                >
                                  <option value="auto">Auto</option>
                                  <option value="D">Dag (D)</option>
                                  <option value="M">Månad (M)</option>
                                  <option value="Y">År (Y)</option>
                                </select>
                              </div>
                              <div>
                                <span className="block text-[10px] text-slate-500 mb-0.5">2:a delen:</span>
                                <select
                                  value={config.datePart2 || "auto"}
                                  onChange={(e) => setConfig({ ...config, datePart2: e.target.value })}
                                  className="w-full border p-1 text-xs outline-none bg-white text-slate-800"
                                >
                                  <option value="auto">Auto</option>
                                  <option value="M">Månad (M)</option>
                                  <option value="D">Dag (D)</option>
                                  <option value="Y">År (Y)</option>
                                </select>
                              </div>
                              <div>
                                <span className="block text-[10px] text-slate-500 mb-0.5">3:e delen:</span>
                                <select
                                  value={config.datePart3 || "auto"}
                                  onChange={(e) => setConfig({ ...config, datePart3: e.target.value })}
                                  className="w-full border p-1 text-xs outline-none bg-white text-slate-800"
                                >
                                  <option value="auto">Auto</option>
                                  <option value="Y">År (Y)</option>
                                  <option value="M">Månad (M)</option>
                                  <option value="D">Dag (D)</option>
                                </select>
                              </div>
                            </div>
                          </div>

                          <div>
                            <span className="block mb-0.5 text-slate-600">Sortering:</span>
                            <select
                              value={config.dataSortOrder || "original"}
                              onChange={(e) => setConfig({ ...config, dataSortOrder: e.target.value })}
                              className="w-full border p-1 outline-none bg-white border-slate-300 text-slate-800"
                            >
                              <option value="original">Tabellordning</option>
                              <option value="chronological">Kronologisk</option>
                              <option value="reverse_chronological">Omvänd kronologisk</option>
                            </select>
                          </div>

                          <div>
                            <span className="block mb-0.5 text-slate-600">Förenkling av datumetiketter:</span>
                            <select
                              value={config.dateFormatMode || "Auto"}
                              onChange={(e) => setConfig({ ...config, dateFormatMode: e.target.value })}
                              className="w-full border p-1 outline-none bg-white border-slate-300 text-slate-800"
                            >
                              <option value="Auto">Auto</option>
                              <option value="Original">Oförändrad</option>
                              <option value="MonthOnly">Endast månad</option>
                              <option value="MonthYear">Månad och år</option>
                              <option value="ShortMonthYear">Kort månad och år</option>
                              <option value="YearOnly">Endast år</option>
                              <option value="DayMonth">Dag och månad</option>
                              <option value="DayMonthYear">Dag, månad och år</option>
                            </select>
                          </div>

                          <div>
                            <span className="block mb-0.5 text-slate-600">Glesa ut X-etiketter:</span>
                            <select
                              value={config.xLabelDecimation || "Auto"}
                              onChange={(e) => setConfig({ ...config, xLabelDecimation: e.target.value })}
                              className="w-full border p-1 outline-none bg-white border-slate-300 text-slate-800"
                            >
                              <option value="Auto">Auto</option>
                              <option value="Max5">Max 5</option>
                              <option value="Max7">Max 7</option>
                              <option value="Every2">Varannan punkt</option>
                              <option value="Every3">Var 3:e punkt</option>
                              <option value="Every5">Var 5:e punkt</option>
                              <option value="MonthChange">Vid månadsskifte</option>
                              <option value="FirstLast">Första och sista</option>
                              <option value="All">Visa alla</option>
                            </select>
                          </div>

                          <div>
                            <span className="block mb-0.5 text-slate-600">Språk för månader:</span>
                            <select
                              value={config.dateMonthLang || "sv"}
                              onChange={(e) => setConfig({ ...config, dateMonthLang: e.target.value })}
                              className="w-full border p-1 outline-none bg-white border-slate-300 text-slate-800"
                            >
                              <option value="sv">Svenska</option>
                              <option value="en">Engelska</option>
                              <option value="num">Siffror</option>
                            </select>
                          </div>

                          <div className="pt-2 border-t border-slate-200">
                            <span className="block mb-0.5 font-semibold text-slate-700">Datumvisning i popups/hover:</span>
                            <select
                              value={config.popupDateFormat || "full_readable"}
                              onChange={(e) => setConfig({ ...config, popupDateFormat: e.target.value })}
                              className="w-full border p-1 outline-none bg-white border-slate-300 text-slate-800 font-medium"
                            >
                              <option value="full_readable">Fullt läsbart datum (15 mars 2024)</option>
                              <option value="compact_numeric">Kompakt numeriskt (15.3.2024)</option>
                              <option value="iso">ISO-format (2024-03-15)</option>
                              <option value="month_year">Månad och år (mars 2024)</option>
                              <option value="original">Oförändrat från källdata</option>
                              <option value="inherit_x">Följ X-axelns förenkling</option>
                            </select>
                            
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* TAB 4: POPUPS */}
                  {activeTab === "popups" && (
                    <div className="space-y-4">
                      <div className="p-3.5 border space-y-3.5 bg-slate-50 border-slate-200">
                        <div className="flex items-center justify-between pb-2 border-b border-inherit">
                          <span className="text-xs font-bold uppercase block">Hover-popups</span>
                          <input type="checkbox" checked={config.enableTooltip} onChange={(e) => setConfig({ ...config, enableTooltip: e.target.checked })} className="w-4 h-4 text-[#e4590f]" />
                        </div>
                        {config.enableTooltip && (
                          <div className="space-y-3 pt-1 text-xs">
                            <div className="grid grid-cols-2 gap-2">
                              <button type="button" onClick={() => setConfig({ ...config, tooltipMode: "Structured" })} className={`py-1.5 px-2 border font-medium ${config.tooltipMode !== "Custom Template" ? "bg-[#e4590f] text-white" : "bg-white text-slate-700"}`}>Strukturerad lista</button>
                              <button type="button" onClick={() => setConfig({ ...config, tooltipMode: "Custom Template" })} className={`py-1.5 px-2 border font-medium ${config.tooltipMode === "Custom Template" ? "bg-[#e4590f] text-white" : "bg-white text-slate-700"}`}>Egen malltext</button>
                            </div>

                            {config.tooltipMode === "Custom Template" ? (
                              <div className="space-y-2 p-2.5 border bg-white text-slate-900">
                                <textarea rows={2} value={config.tooltipTemplate} onChange={(e) => setConfig({ ...config, tooltipTemplate: e.target.value, isTemplateCustomized: true })} className="w-full text-xs font-mono border p-1.5 outline-none" />
                                <div className="flex flex-wrap gap-1 items-center pt-1">
                                  <span className="text-[10px] text-slate-400">Infoga:</span>
                                  {tableHeaders.map(h => (
                                    <button key={h} type="button" onClick={() => setConfig({ ...config, tooltipTemplate: `${config.tooltipTemplate} {${h}}`, isTemplateCustomized: true })} className="text-[10px] px-1.5 py-0.5 border bg-slate-100 text-slate-700">{`{${h}}`}</button>
                                  ))}
                                </div>
                              </div>
                            ) : (
                              <div className="space-y-2">
                                <div className="pb-2 border-b border-inherit">
                                <span className="block mb-0.5 font-semibold text-slate-700">Datumformat i popup:</span>
                                <select
                                  value={config.popupDateFormat || "full_readable"}
                                  onChange={(e) => setConfig({ ...config, popupDateFormat: e.target.value })}
                                  className="w-full border p-1 outline-none text-xs bg-white border-slate-300 text-slate-800 font-medium"
                                >
                                  <option value="full_readable">Fullt läsbart datum (15 mars 2024)</option>
                                  <option value="compact_numeric">Kompakt numeriskt (15.3.2024)</option>
                                  <option value="iso">ISO-format (2024-03-15)</option>
                                  <option value="month_year">Månad och år (mars 2024)</option>
                                  <option value="original">Oförändrat från källdata</option>
                                  <option value="inherit_x">Följ X-axelns förenkling</option>
                                </select>
                              </div>

                              <span className="font-semibold block">Kolumner i listan:</span>
                                <div className="grid grid-cols-2 gap-1.5">
                                  {(config.chartType === "Pie" ? pieCategories : seriesList).map((header) => {
                                    const isChecked = (config.tooltipColumns || (config.chartType === "Pie" ? pieCategories : seriesList)).includes(header);
                                    return (
                                      <label key={header} className="flex items-center space-x-2 p-1.5 border cursor-pointer bg-white text-slate-800">
                                        <input type="checkbox" checked={isChecked} onChange={() => {
                                          const cur = config.tooltipColumns || (config.chartType === "Pie" ? pieCategories : seriesList);
                                          const next = cur.includes(header) ? cur.filter(c => c !== header) : [...cur, header];
                                          setConfig({ ...config, tooltipColumns: next, userManuallySelectedTooltipCols: true });
                                        }} className="text-[#e4590f]" />
                                        <span className="truncate">{header}</span>
                                      </label>
                                    );
                                  })}
                                </div>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* TAB 5: COLORS */}
                  {activeTab === "colors" && (
                    <div className="space-y-4">
                      <div className="flex items-center justify-between">
                        <label className="text-xs font-bold uppercase">Färgpalett & Serier</label>
                        <button type="button" onClick={() => {
                          const items = config.chartType === "Pie" ? pieCategories : seriesList;
                          const colors = items.map(s => seriesColors[s] || BRAND_SWATCHES[0]);
                          if (colors.length <= 1) return;
                          const shifted = [colors[colors.length - 1], ...colors.slice(0, colors.length - 1)];
                          const next = {};
                          items.forEach((s, idx) => { next[s] = shifted[idx]; });
                          setSeriesColors(next);
                        }} className="text-xs border px-2.5 py-1 font-medium bg-slate-100 text-slate-700">Rotera färger</button>
                      </div>

                      <div className="space-y-2">
                        {(config.chartType === "Pie" ? pieCategories : seriesList).map((sName, sIdx) => {
                          const curColor = seriesColors[sName] || BRAND_SWATCHES[sIdx % BRAND_SWATCHES.length];
                          return (
                            <div key={`${sName}-${sIdx}`} className="p-2 border flex items-center justify-between text-xs bg-white text-slate-900">
                              <div className="flex items-center space-x-2">
                                {config.chartType !== "Pie" && (
                                  <div className="flex flex-col">
                                    <button type="button" onClick={() => moveSeries(sIdx, -1)} disabled={sIdx === 0} className="text-[10px] text-slate-400">▲</button>
                                    <button type="button" onClick={() => moveSeries(sIdx, 1)} disabled={sIdx === seriesList.length - 1} className="text-[10px] text-slate-400">▼</button>
                                  </div>
                                )}
                                <span className="font-semibold">{sName}</span>
                              </div>
                              <div className="flex items-center space-x-2">
                                <input 
                                  type="text" 
                                  value={curColor} 
                                  onChange={(e) => {
                                    if (isSafeKey(sName)) {
                                      setSeriesColors(prev => ({ ...prev, [sName]: e.target.value }));
                                    }
                                  }} 
                                  className="w-16 px-1 py-0.5 text-[11px] font-mono border uppercase" 
                                />
                                <button type="button" onClick={() => setColorPickerTarget(colorPickerTarget === sName ? null : sName)} className="w-6 h-6 border" style={{ backgroundColor: curColor }} />
                                {colorPickerTarget === sName && (
                                  <div className="absolute right-4 z-50 border p-2 grid grid-cols-5 gap-1 w-44 bg-white shadow-xl">
                                    {BRAND_SWATCHES.map(hex => (
                                      <button 
                                        key={hex} 
                                        type="button" 
                                        onClick={() => { 
                                          if (isSafeKey(sName)) {
                                            setSeriesColors(prev => ({ ...prev, [sName]: hex })); 
                                          }
                                          setColorPickerTarget(null); 
                                        }} 
                                        className="w-6 h-6 border" 
                                        style={{ backgroundColor: hex }} 
                                      />
                                    ))}
                                  </div>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>

                      {/* SEKTION: FRAMHÄV ENSKILDA KATEGORIER / X-VÄRDEN */}
                      <div className="pt-3 border-t border-slate-200 space-y-3">
                        <div className="flex items-center justify-between">
                          <div>
                            <label className="text-xs font-bold uppercase block text-slate-800">
                              Framhäv enskilda kategorier
                            </label>
                            <span className="text-[11px] text-slate-500">
                              Sätt en avvikande färg på ett enstaka X-värde eller en specifik serie.
                            </span>
                          </div>
                          <button
                            type="button"
                            onClick={() => {
                              const firstCat = allAvailableCategories[0] || (tableRows[0] && tableRows[0][config.categoryColIndex ?? 0]) || "Kategori";
                              const newOverride = {
                                id: 'ov_' + Date.now() + '_' + Math.random().toString(36).substr(2, 4),
                                category: firstCat,
                                series: "*",
                                color: "#e4590f",
                                legendLabel: ""
                              };
                              setConfig(prev => ({
  ...prev,
  categoryColorOverrides: [...(prev.categoryColorOverrides || []), newOverride]
}));
                            }}
                            className="text-xs px-2.5 py-1 font-semibold bg-[#e4590f] text-white hover:bg-[#c94d0c] shadow-sm flex items-center space-x-1"
                          >
                            <span>+ Framhäv kategori</span>
                          </button>
                        </div>

                        {(!config.categoryColorOverrides || config.categoryColorOverrides.length === 0) ? (
                          <div className="p-3 border border-dashed border-slate-300 text-center text-xs text-slate-500 bg-slate-50">
                            Inga kategorier framhävda än. Klicka på <strong>+ Framhäv kategori</strong> ovan för att ge en enskild kategori eller stapel en avvikande färg.
                          </div>
                        ) : (
                          <div className="space-y-2">
                            {config.categoryColorOverrides.map((ov, ovIdx) => (
                              <div key={ov.id || ovIdx} className="p-2.5 border border-slate-200 bg-white shadow-sm space-y-2 text-xs">
                                <div className="flex items-center justify-between gap-2">
                                  <div className="flex-1 min-w-0">
                                    <label className="block text-[10px] uppercase font-bold text-slate-500 mb-0.5">Kategori (X-värde):</label>
                                    <select
                                      value={ov.category}
                                      onChange={(e) => {
                                        const val = e.target.value;
                                        const updated = config.categoryColorOverrides.map((item, idx) => idx === ovIdx ? { ...item, category: val } : item);
                                        setConfig({ ...config, categoryColorOverrides: updated });
                                      }}
                                      className="w-full border p-1 text-xs outline-none bg-white text-slate-800 font-semibold"
                                    >
                                      {allAvailableCategories.map((cName, cIdx) => (
                                        <option key={`${cName}-${cIdx}`} value={cName}>{cName}</option>
                                      ))}
                                    </select>
                                  </div>

                                  {seriesList.length > 1 && (
                                    <div className="flex-1 min-w-0">
                                      <label className="block text-[10px] uppercase font-bold text-slate-500 mb-0.5">Gäller serie:</label>
                                      <select
                                        value={ov.series || "*"}
                                        onChange={(e) => {
                                          const val = e.target.value;
                                          const updated = config.categoryColorOverrides.map((item, idx) => idx === ovIdx ? { ...item, series: val } : item);
                                          setConfig({ ...config, categoryColorOverrides: updated });
                                        }}
                                        className="w-full border p-1 text-xs outline-none bg-white text-slate-800"
                                      >
                                        <option value="*">Alla serier</option>
                                        {seriesList.map((s: any, sIdx: number) => (
                                          <option key={`${s}-${sIdx}`} value={String(s)}>{String(s)}</option>
                                        ))}
                                      </select>
                                    </div>
                                  )}

                                  <div className="pt-3">
                                    <button
                                      type="button"
                                      title="Ta bort framhävning"
                                      onClick={() => {
                                        const updated = config.categoryColorOverrides.filter((_, idx) => idx !== ovIdx);
                                        setConfig({ ...config, categoryColorOverrides: updated });
                                      }}
                                      className="text-slate-400 hover:text-red-500 text-lg px-1.5"
                                    >
                                      ×
                                    </button>
                                  </div>
                                </div>

                                <div className="grid grid-cols-2 gap-2 pt-1 border-t border-slate-100">
                                  <div>
                                    <label className="block text-[10px] uppercase font-bold text-slate-500 mb-0.5">Färg:</label>
                                    <div className="flex items-center space-x-1.5 relative">
                                      <input
                                        type="text"
                                        value={ov.color || "#e4590f"}
                                        onChange={(e) => {
                                          const val = e.target.value;
                                          const updated = config.categoryColorOverrides.map((item, idx) => idx === ovIdx ? { ...item, color: val } : item);
                                          setConfig({ ...config, categoryColorOverrides: updated });
                                        }}
                                        className="w-18 px-1 py-0.5 text-[11px] font-mono border uppercase"
                                      />
                                      <button
                                        type="button"
                                        onClick={() => setColorPickerTarget(colorPickerTarget === `ov-${ov.id || ovIdx}` ? null : `ov-${ov.id || ovIdx}`)}
                                        className="w-6 h-6 border"
                                        style={{ backgroundColor: ov.color || "#e4590f" }}
                                      />
                                      {colorPickerTarget === `ov-${ov.id || ovIdx}` && (
                                        <div className="absolute left-0 top-7 z-50 border p-2 grid grid-cols-5 gap-1 w-44 bg-white shadow-xl">
                                          {BRAND_SWATCHES.map(hex => (
                                            <button
                                              key={hex}
                                              type="button"
                                              onClick={() => {
                                                const updated = config.categoryColorOverrides.map((item, idx) => idx === ovIdx ? { ...item, color: hex } : item);
                                                setConfig({ ...config, categoryColorOverrides: updated });
                                                setColorPickerTarget(null);
                                              }}
                                              className="w-6 h-6 border"
                                              style={{ backgroundColor: hex }}
                                            />
                                          ))}
                                        </div>
                                      )}
                                    </div>
                                  </div>

                                  <div>
                                    <label className="block text-[10px] uppercase font-bold text-slate-500 mb-0.5">Namn i legend (valfritt):</label>
                                    <input
                                      type="text"
                                      placeholder={ov.category}
                                      value={ov.legendLabel || ""}
                                      onChange={(e) => {
                                        const val = e.target.value;
                                        const updated = config.categoryColorOverrides.map((item, idx) => idx === ovIdx ? { ...item, legendLabel: val } : item);
                                        setConfig({ ...config, categoryColorOverrides: updated });
                                      }}
                                      className="w-full border px-1.5 py-0.5 text-xs outline-none bg-white text-slate-800 placeholder:text-slate-400"
                                    />
                                  </div>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* TAB 6: RUTNÄT */}
                  {activeTab === "grid" && (
                    <div className="space-y-4">
                      {/* X-AXEL */}
                      <div className="p-3 border space-y-2.5 text-xs bg-slate-50 border-slate-200">
                        <span className="font-bold uppercase block text-slate-700">
                          {config.barOrientation === "Horizontal" ? "KATEGORIAXEL (VÄNSTER)" : "X-AXEL (KATEGORIER)"}
                        </span>
                        <div className="flex items-center justify-between">
                          <span className="text-slate-700">
                            {config.barOrientation === "Horizontal" ? "Visa kategorietiketter:" : "Visa X-axeletiketter:"}
                          </span>
                          <input type="checkbox" checked={config.drawXLabels !== false} onChange={(e) => setConfig({ ...config, drawXLabels: e.target.checked })} className="w-4 h-4 text-[#e4590f]" />
                        </div>
                        {config.barOrientation === "Horizontal" && (
                          <div className="flex items-center justify-between pt-1 border-t border-inherit">
                            <span className="text-slate-600">Kategorijustering:</span>
                            <select value={config.hCatAlign || "right"} onChange={(e) => setConfig({ ...config, hCatAlign: e.target.value })} className="border px-2 py-0.5 text-xs outline-none bg-white text-slate-800">
                              <option value="left">Vänsterställd</option>
                              <option value="right">Högerställd</option>
                            </select>
                          </div>
                        )}
                        <div className="flex items-center justify-between pt-1 border-t border-inherit">
                          <span className="text-slate-600">{config.barOrientation === "Horizontal" ? "Axelplacering vid minus:" : "X-axelplacering vid minus:"}</span>
                          <select 
                            value={config.axisPosition || "zero"} 
                            onChange={(e) => setConfig({ ...config, axisPosition: e.target.value })} 
                            className="border px-2 py-0.5 text-xs outline-none bg-white text-slate-800"
                          >
                            <option value="bottom">{config.barOrientation === "Horizontal" ? "Längst till vänster" : "Längst ner i grafen"}</option>
                            <option value="zero">Vid 0-värdet</option>
                          </select>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-slate-600">Visa baslinje:</span>
                          <input type="checkbox" checked={config.drawXAxis} onChange={(e) => setConfig({ ...config, drawXAxis: e.target.checked })} className="w-4 h-4 text-[#e4590f]" />
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-slate-600">Baslinjebredd:</span>
                          <select value={config.xAxisWidth || 2.5} onChange={(e) => setConfig({ ...config, xAxisWidth: parseFloat(e.target.value) })} className="border px-2 py-0.5 text-xs outline-none bg-white text-slate-800">
                            <option value="1">1 px</option>
                            <option value="2">2 px</option>
                            <option value="2.5">2.5 px</option>
                            <option value="3.5">3.5 px</option>
                          </select>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-slate-600">
                            {config.barOrientation === "Horizontal" ? "Horisontella avdelare:" : "X-Stödlinjer:"}
                          </span>
                          <select value={config.xTickStyle || "None"} onChange={(e) => setConfig({ ...config, xTickStyle: e.target.value })} className="border px-2 py-1 text-xs outline-none bg-white text-slate-800">
                            <option value="None">Inga</option>
                            <option value="Short Ticks">Korta ticks</option>
                            <option value="Full Grid">
                              {config.barOrientation === "Horizontal" ? "Fullt horisontellt rutnät" : "Fullt vertikalt rutnät"}
                            </option>
                          </select>
                        </div>
                      </div>

                      {/* Y-AXEL */}
                      <div className="p-3 border space-y-2.5 text-xs bg-slate-50 border-slate-200">
                        <span className="font-bold uppercase block text-slate-700">
                          {config.barOrientation === "Horizontal" ? "VÄRDEAXEL (BOTTEN)" : "Y-AXEL (VÄRDEN)"}
                        </span>
                        <div className="flex items-center justify-between">
                          <span className="text-slate-700">
                            {config.barOrientation === "Horizontal" ? "Visa värdeaxelns siffror:" : "Visa Y-axeletiketter:"}
                          </span>
                          <input 
                            type="checkbox" 
                            checked={config.drawYLabels === true} 
                            onChange={(e) => {
                              const checked = e.target.checked;
                              setConfig(prev => ({
                                ...prev,
                                drawYLabels: checked,
                                yTickStyle: checked ? "Full Grid" : "None",
                                gridLineStyle: checked ? "Solid" : prev.gridLineStyle
                              }));
                            }} 
                            className="w-4 h-4 text-[#e4590f]" 
                          />
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-slate-600">
                            {config.barOrientation === "Horizontal" ? "Stödlinjer (lodrätt rutnät):" : "Y-Stödlinjer:"}
                          </span>
                          <select value={config.yTickStyle || "None"} onChange={(e) => setConfig({ ...config, yTickStyle: e.target.value })} className="border px-2 py-1 text-xs outline-none bg-white text-slate-800">
                            <option value="None">Inga</option>
                            <option value="Short Ticks">Korta ticks</option>
                            <option value="Full Grid">
                              {config.barOrientation === "Horizontal" ? "Fullt lodrätt rutnät" : "Fullt horisontellt rutnät"}
                            </option>
                          </select>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-slate-600">Skaldelningar:</span>
                          <select value={config.yDivisions || "Auto (~5)"} onChange={(e) => setConfig({ ...config, yDivisions: e.target.value })} className="border px-2 py-1 text-xs outline-none bg-white text-slate-800">
                            <option value="Auto (~5)">Auto</option>
                            <option value="2 steg">2</option>
                            <option value="3 steg">3</option>
                            <option value="4 steg">4</option>
                            <option value="5 steg">5</option>
                            <option value="6 steg">6</option>
                            <option value="8 steg">8</option>
                            <option value="10 steg">10</option>
                          </select>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-slate-600">Skalavrundning:</span>
                          <select value={config.yScaleRounding || "Auto"} onChange={(e) => setConfig({ ...config, yScaleRounding: e.target.value, forceRoundScale: e.target.value })} className="border px-2 py-0.5 outline-none text-xs bg-white text-slate-800">
                            <option value="Auto">Auto</option>
                            <option value="integer">Heltal</option>
                            <option value="round_2">Närmaste 2</option>
                            <option value="round_5">Närmaste 5</option>
                            <option value="round_10">Närmaste 10</option>
                            <option value="round_50">Närmaste 50</option>
                            <option value="round_100">Närmaste 100</option>
                            <option value="round_500">Närmaste 500</option>
                            <option value="round_1000">Närmaste 1 000</option>
                            <option value="round_0_5">Närmaste 0,5</option>
                            <option value="round_0_1">Närmaste 0,1</option>
                            <option value="dec_1">1 decimal</option>
                            <option value="dec_2">2 decimaler</option>
                          </select>
                        </div>
                        <div className="pt-2 border-t border-inherit space-y-2">
                          <div className="flex items-center justify-between">
                            <span className="text-slate-700">Anpassat intervall:</span>
                            <input 
                              type="checkbox" 
                              checked={Boolean(config.customYRange)} 
                              onChange={(e) => {
                                const checked = e.target.checked;
                                setConfig({
                                  ...config,
                                  customYRange: checked,
                                  customMinY: config.customMinY !== undefined ? config.customMinY : 0,
                                  customMaxY: config.customMaxY !== undefined ? config.customMaxY : 100,
                                  customYStep: config.customYStep !== undefined ? config.customYStep : "auto"
                                });
                              }} 
                              className="w-4 h-4 text-[#e4590f]" 
                            />
                          </div>
                          {config.customYRange && (
                            <div className="grid grid-cols-2 gap-2 pt-1">
                              <div>
                                <span className="block mb-0.5 text-slate-500">Min Y:</span>
                                <input 
                                  type="number" 
                                  value={config.customMinY !== undefined ? config.customMinY : 0} 
                                  onChange={(e) => {
                                    const v = e.target.value;
                                    setConfig({ ...config, customMinY: v === "" ? "" : (isNaN(Number(v)) ? v : Number(v)) });
                                  }} 
                                  className="w-full border p-1 outline-none bg-white text-slate-800" 
                                />
                              </div>
                              <div>
                                <span className="block mb-0.5 text-slate-500">Max Y:</span>
                                <input 
                                  type="number" 
                                  value={config.customMaxY !== undefined ? config.customMaxY : 100} 
                                  onChange={(e) => {
                                    const v = e.target.value;
                                    setConfig({ ...config, customMaxY: v === "" ? "" : (isNaN(Number(v)) ? v : Number(v)) });
                                  }} 
                                  className="w-full border p-1 outline-none bg-white text-slate-800" 
                                />
                              </div>
                            </div>
                          )}
                        </div>
                      </div>

                      {/* RUTNÄTSSTIL */}
                      <div className="p-3 border space-y-2.5 text-xs bg-slate-50 border-slate-200">
                        <span className="font-bold uppercase block text-slate-700">RUTNÄTSSTIL</span>
                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <span className="block mb-0.5 text-slate-500">Linjestil:</span>
                            <select value={config.gridLineStyle || "Dashed"} onChange={(e) => setConfig({ ...config, gridLineStyle: e.target.value })} className="w-full border p-1 outline-none bg-white text-slate-800">
                              <option value="Dashed">Streckad</option>
                              <option value="Solid">Heldragen</option>
                              <option value="Dotted">Punktad</option>
                            </select>
                          </div>
                          <div>
                            <span className="block mb-0.5 text-slate-500">Linjebredd:</span>
                            <select value={config.gridLineWidth || 1} onChange={(e) => setConfig({ ...config, gridLineWidth: parseFloat(e.target.value) })} className="w-full border p-1 outline-none bg-white text-slate-800">
                              <option value="0.75">0.75 px</option>
                              <option value="1">1 px</option>
                              <option value="1.5">1.5 px</option>
                              <option value="2">2 px</option>
                            </select>
                          </div>
                        </div>
                        <div className="grid grid-cols-2 gap-2 pt-1 border-t border-inherit">
                          <div>
                            <span className="block mb-0.5 text-slate-500">Linjefärg:</span>
                            <div className="flex items-center space-x-1.5">
                              <input type="text" value={config.gridColor || "#cbd5e1"} onChange={(e) => setConfig({ ...config, gridColor: e.target.value })} className="w-full border p-1 font-mono uppercase outline-none bg-white text-slate-800" />
                              <input type="color" value={config.gridColor?.startsWith("#") ? config.gridColor : "#cbd5e1"} onChange={(e) => setConfig({ ...config, gridColor: e.target.value })} className="w-6 h-6 border cursor-pointer shrink-0" />
                            </div>
                          </div>
                          <div>
                            <span className="block mb-0.5 text-slate-500">Opacitet: {config.gridOpacity ?? 100}%</span>
                            <input type="range" min="10" max="100" value={config.gridOpacity ?? 100} onChange={(e) => setConfig({ ...config, gridOpacity: parseInt(e.target.value, 10) })} className="w-full accent-[#e4590f] mt-1" />
                          </div>
                        </div>
                      </div>

                      {/* TALFORMAT & SEPARATORER */}
                      <div className="p-3 border space-y-2.5 text-xs bg-slate-50 border-slate-200">
                        <span className="text-xs font-bold uppercase block text-slate-700">TALFORMAT & SEPARATORER</span>
                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <span className="block mb-0.5 text-slate-500">Tusentalsavgränsare:</span>
                            <input type="text" value={config.thousandSep} onChange={(e) => setConfig({ ...config, thousandSep: e.target.value })} className="w-full border p-1 text-center font-mono outline-none bg-white text-slate-800" />
                          </div>
                          <div>
                            <span className="block mb-0.5 text-slate-500">Decimaltecken:</span>
                            <input type="text" value={config.decSep} onChange={(e) => setConfig({ ...config, decSep: e.target.value })} className="w-full border p-1 text-center font-mono outline-none bg-white text-slate-800" />
                          </div>
                        </div>
                      </div>

                      {/* REFERENSLINJER */}
                      <div className="p-3 border space-y-3 bg-slate-50 border-slate-200">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-bold uppercase block text-slate-700">REFERENSLINJER</span>
                          <button type="button" onClick={addRefLine} className="text-[11px] bg-[#e4590f] hover:bg-[#c94d0c] text-white font-bold px-3 py-1 transition">+ Lägg till linje</button>
                        </div>
                        <div className="space-y-3 pt-1">
                          {(config.refLines || []).map((refItem) => (
                            <div key={refItem.id} className="p-3 border space-y-2 text-xs bg-white border-slate-200 shadow-sm">
                              <div className="flex items-center justify-between border-b pb-1 border-slate-100">
                                <span className="font-bold text-slate-800">Linje</span>
                                <button type="button" onClick={() => deleteRefLine(refItem.id)} className="text-slate-400 hover:text-red-500 font-bold px-1">×</button>
                              </div>
                              <div className="grid grid-cols-2 gap-2">
                                <div>
                                  <span className="block mb-0.5 text-slate-500">Axel:</span>
                                  <select value={refItem.axis || "Y-Axis"} onChange={(e) => { updateRefLine(refItem.id, "axis", e.target.value); updateRefLine(refItem.id, "val", e.target.value === "X-Axis" ? (tableRows[0]?.[0] || "") : "100"); }} className="w-full border p-1 outline-none bg-white text-slate-800">
                                    <option value="Y-Axis">Y-Axel (Värde)</option>
                                    <option value="X-Axis">X-Axel (Kategori)</option>
                                  </select>
                                </div>
                                <div>
                                  <span className="block mb-0.5 text-slate-500">{refItem.axis === "X-Axis" ? "Kategori / Värde:" : "Värde:"}</span>
                                  {refItem.axis === "X-Axis" ? (
                                    <div className="space-y-1">
                                      <input 
                                        type="text" 
                                        list={`cat-list-${refItem.id}`}
                                        value={refItem.val} 
                                        onChange={(e) => updateRefLine(refItem.id, "val", e.target.value)} 
                                        className="w-full border p-1 outline-none bg-white text-slate-900" 
                                        placeholder="Ange eller välj..." 
                                      />
                                      <datalist id={`cat-list-${refItem.id}`}>
                                        {tableRows.map((r, rowIdx) => (<option key={rowIdx} value={r[0]}>{r[0] || `Rad ${rowIdx + 1}`}</option>))}
                                      </datalist>
                                      <select 
                                        value={refItem.catOffset || "center"} 
                                        onChange={(e) => updateRefLine(refItem.id, "catOffset", e.target.value)} 
                                        className="w-full border p-1 text-[11px] outline-none bg-white text-slate-800 mt-1"
                                      >
                                        <option value="center">Centrerad</option>
                                        <option value="after">Mellan kategorier efter</option>
                                        <option value="before">Mellan kategorier före</option>
                                      </select>
                                    </div>
                                  ) : (
                                    <input type="number" value={refItem.val} onChange={(e) => updateRefLine(refItem.id, "val", e.target.value)} className="w-full border p-1 outline-none bg-white text-slate-900" />
                                  )}
                                </div>
                              </div>
                              <div className="grid grid-cols-2 gap-2 pt-1 border-t border-slate-100">
                                <div>
                                  <span className="block mb-0.5 text-slate-500">Linjestil:</span>
                                  <select value={refItem.style || "Dashed"} onChange={(e) => updateRefLine(refItem.id, "style", e.target.value)} className="w-full border p-1 outline-none bg-white text-slate-800">
                                    <option value="Dashed">Streckad</option>
                                    <option value="Solid">Heldragen</option>
                                    <option value="Dotted">Punktad</option>
                                  </select>
                                </div>
                                <div>
                                  <span className="block mb-0.5 text-slate-500">Linjebredd:</span>
                                  <select value={refItem.width || 1.5} onChange={(e) => updateRefLine(refItem.id, "width", parseFloat(e.target.value))} className="w-full border p-1 outline-none bg-white text-slate-800">
                                    <option value="0.75">0.75 px</option>
                                    <option value="1">1 px</option>
                                    <option value="1.5">1.5 px</option>
                                    <option value="2">2 px</option>
                                  </select>
                                </div>
                              </div>
                              <div className="grid grid-cols-2 gap-2">
                                <div>
                                  <span className="block mb-0.5 text-slate-500">Linjefärg:</span>
                                  <div className="flex items-center space-x-1.5">
                                    <input type="text" value={refItem.color || "#64748b"} onChange={(e) => updateRefLine(refItem.id, "color", e.target.value)} className="w-full border p-1 font-mono uppercase outline-none bg-white text-slate-800" />
                                    <input type="color" value={refItem.color?.startsWith("#") ? refItem.color : "#64748b"} onChange={(e) => updateRefLine(refItem.id, "color", e.target.value)} className="w-6 h-6 border cursor-pointer shrink-0" />
                                  </div>
                                </div>
                                <div>
                                  <span className="block mb-0.5 text-slate-500">Opacitet: {refItem.opacity ?? 100}%</span>
                                  <input type="range" min="10" max="100" value={refItem.opacity ?? 100} onChange={(e) => updateRefLine(refItem.id, "opacity", parseInt(e.target.value, 10))} className="w-full accent-[#e4590f] mt-1" />
                                </div>
                              </div>
                              <div className="grid grid-cols-2 gap-2 pt-1 border-t border-slate-100">
                                <div>
                                  <span className="block mb-0.5 text-slate-500">Etikett:</span>
                                  <input type="text" value={refItem.label || ""} onChange={(e) => updateRefLine(refItem.id, "label", e.target.value)} className="w-full border p-1 outline-none bg-white text-slate-900" placeholder="Text..." />
                                </div>
                                <div>
                                  <span className="block mb-0.5 text-slate-500">Textplacering:</span>
                                  {((config.barOrientation === "Horizontal") ? (refItem.axis === "X-Axis") : (refItem.axis !== "X-Axis")) ? (
                                    <select value={refItem.textPosition || "right"} onChange={(e) => updateRefLine(refItem.id, "textPosition", e.target.value)} className="w-full border p-1 outline-none bg-white text-slate-800">
                                      <option value="right">Ovanför linjen (höger)</option>
                                      <option value="left">Ovanför linjen (vänster)</option>
                                      <option value="center">Ovanför linjen (mitten)</option>
                                      <option value="below_right">Under linjen (höger)</option>
                                      <option value="below_left">Under linjen (vänster)</option>
                                    </select>
                                  ) : (
                                    <select value={refItem.textPosition || "right"} onChange={(e) => updateRefLine(refItem.id, "textPosition", e.target.value)} className="w-full border p-1 outline-none bg-white text-slate-800">
                                      <option value="right">Uppe till höger</option>
                                      <option value="left">Uppe till vänster</option>
                                      <option value="bottom_right">Nere till höger</option>
                                      <option value="bottom_left">Nere till vänster</option>
                                      <option value="along">Längs linjen (vertikal text)</option>
                                    </select>
                                  )}
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </aside>
            )}
          </main>
        </div>
      );
    }


export default App;
